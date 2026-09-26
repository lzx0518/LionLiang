/* =============================================================================
 * 虚拟实验室 —— 物理模块校验 (test/validate-physics.mjs)
 * -----------------------------------------------------------------------------
 * 物理模块没有 DOM 依赖，所以可以在 Node 里直接跑，检查的东西比化学那边更彻底：
 *
 *   1. 注册完整性：仿真 / 实验的 id 唯一、字段齐全、学段合法、引用的仿真真实存在
 *   2. 运行时健壮性：每个仿真 create → 推进 → hint / info / draw / 控制项都不报错
 *   3. 控制项自洽：滑块的默认值落在区间内、下拉框有选项、按钮 id 在本文件里被处理
 *   4. **每一步真的做得出来**：照着每个实验的 act(sim) 动作脚本把仿真跑一遍，
 *      再断言这一步的 check(sim) 真的会变成 true
 *      ——静态检查只能证明 id 存在，证明不了「这一步真的做得到」。
 *
 * 运行：node test/validate-physics.mjs
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, extra) {
  if (cond) pass++; else { fail++; failures.push(label + (extra !== undefined ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n\x1b[36m── ' + t + ' ──\x1b[0m'); }

/* ===================== Canvas 2D 模拟 ===================== */
const CTX_METHODS = [
  'clearRect', 'save', 'restore', 'translate', 'scale', 'rotate', 'transform', 'setTransform',
  'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arcTo', 'arc',
  'ellipse', 'rect', 'roundRect', 'closePath', 'fill', 'stroke', 'clip', 'fillRect',
  'strokeRect', 'setLineDash', 'getLineDash', 'fillText', 'strokeText',
  'drawImage', 'createPattern', 'putImageData', 'getImageData', 'measureText'
];
const gradient = () => ({ addColorStop() { } });
const mockCtx = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return () => ({ width: 42 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createConicGradient') return gradient;
    if (key in target) return target[key];
    if (CTX_METHODS.includes(key)) return () => { };
    return target[key] !== undefined ? target[key] : '';
  },
  set(target, key, value) { target[key] = value; return true; }
});

/* ===================== 环境 ===================== */
/* 极简 CHEM 桩：物理模块只用到 CHEM.level（学段过滤） */
const CHEM = {
  level: 'all',
  LEVELS: [{ id: 'junior', name: '初中' }, { id: 'senior', name: '高中' }, { id: 'all', name: '全部' }],
  setLevel(lv) { CHEM.level = lv || 'junior'; return CHEM.level; },
  SUBSTANCES: [], REACTIONS: [], EXPERIMENTS: []
};
globalThis.window = globalThis;
globalThis.CHEM = CHEM;
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } }, appendChild() { }, addEventListener() { } }),
  body: { classList: { add() { }, remove() { }, toggle() { } } },
  addEventListener() { }
};

/* ===================== 加载物理脚本 ===================== */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ALL_SCRIPTS = [...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)].map(m => m[1]);
const PHY_SCRIPTS = ALL_SCRIPTS.filter(f => f.startsWith('js/physics/'));

section('加载物理脚本');
ok(PHY_SCRIPTS.length >= 6, '从 index.html 解析出物理脚本清单', PHY_SCRIPTS.length + ' 个：' + PHY_SCRIPTS.join(', '));
ok(PHY_SCRIPTS.some(f => f.endsWith('core.js')), '核心模块 core.js 已接入 index.html');
ok(PHY_SCRIPTS.some(f => f.includes('tasks-junior')), '初中实验任务文件已接入');
ok(PHY_SCRIPTS.some(f => f.includes('tasks-senior')), '高中实验任务文件已接入');
ok(ALL_SCRIPTS.indexOf('js/physics/core.js') > ALL_SCRIPTS.indexOf('js/data/substances.js'),
  'core.js 在数据层之后加载（依赖 CHEM）');
ok(ALL_SCRIPTS.indexOf('js/ui/app.js') > ALL_SCRIPTS.indexOf('js/physics/tasks-senior.js'),
  'app.js 最后加载（init 时才能调用 PHY.init）');
ok(html.includes('id="phybench"') && html.includes('id="phyWrap"') && html.includes('id="phyShelf"'),
  'index.html 里准备了物理画布 / 货架容器');
ok(html.includes('id="subjectSelect"'), 'index.html 里有学科下拉框');

const srcByFile = Object.create(null);
const errors = [];
for (const f of PHY_SCRIPTS) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { ok(false, '加载 ' + f, '文件不存在'); continue; }
  const code = fs.readFileSync(p, 'utf8');
  srcByFile[f] = code;
  try {
    (0, eval)(code);
    ok(true, '加载 ' + f);
  } catch (e) {
    ok(false, '加载 ' + f, e.message);
    errors.push(f + ': ' + e.message);
    console.error('\x1b[31m   !! ' + f + '：' + e.message + '\x1b[0m');
  }
}
if (errors.length) { console.error('\n脚本加载失败，后续检查无意义。'); process.exit(1); }

const PHY = globalThis.PHY;
ok(!!PHY && Array.isArray(PHY.SIMS) && Array.isArray(PHY.TASKS), 'PHY 命名空间可用');

/* ===================== 1. 仿真注册 ===================== */
section('仿真主题注册');
const FIELD_IDS = ['mech', 'sound', 'thermal', 'optics', 'elec', 'em', 'modern'];
const seenSim = new Set();
PHY.SIMS.forEach(s => {
  ok(!!s.id && !!s.name, '仿真有 id / name', s.id);
  ok(!seenSim.has(s.id), '仿真 id 唯一', s.id);
  seenSim.add(s.id);
  ok(FIELD_IDS.includes(s.field), '仿真分组合法', (s.id || '?') + ' → ' + s.field);
  ok(['junior', 'senior', 'both'].includes(s.level || 'both'), '仿真学段合法', (s.id || '?') + ' → ' + s.level);
  ok(typeof s.create === 'function', '仿真有 create', s.id);
  ok(!!s.desc, '仿真有简介', s.id);
});

/* 定位每个仿真定义在哪个仿真文件（用于按钮 id 的按文件核对）。
   只看 sims/ 目录 —— core.js 里的 FIELDS 也含 id: 'sound' 之类的同名条目，
   不排除掉会把「仿真的按钮」错记到 core.js 头上。 */
function fileOfSim(simId) {
  for (const f in srcByFile) {
    if (!f.includes('/sims/')) continue;
    if (new RegExp("id:\\s*'" + simId + "'").test(srcByFile[f])) return f;
  }
  return null;
}

/* ===================== 2. 运行时健壮性 + 控制项 ===================== */
section('仿真运行时（create / update / hint / info / draw / 控制项）');
const W = 1000, H = 660;
const untestedLevels = [];
for (const def of PHY.SIMS) {
  let inst = null;
  for (const lv of ['junior', 'senior', 'all']) {
    CHEM.level = lv;
    let inst2 = null;
    try {
      inst2 = def.create({
        get W() { return W; }, get H() { return H; },
        level: function () { return CHEM.level; },
        toast() { }, log() { }, setControls() { }, invalidateInfo() { }
      });
    } catch (e) {
      ok(false, '在「' + lv + '」学段下创建 ' + def.id, e.message);
      continue;
    }
    if (!inst2) { ok(false, '创建 ' + def.id + ' 返回空实例'); continue; }
    try {
      for (let i = 0; i < 40; i++) inst2.update(0.05);
      if (inst2.hint) inst2.hint();
      if (inst2.info) inst2.info();
      inst2.draw(mockCtx, W, H);
      if (inst2.destroy) inst2.destroy();
      ok(true, '在「' + lv + '」学段跑 ' + def.id);
    } catch (e) {
      ok(false, '在「' + lv + '」学段跑 ' + def.id, e.message);
    }
    if (lv === 'all') inst = inst2;
  }

  /* 控制项结构 + 可点击性 */
  CHEM.level = 'all';
  let list = [];
  try {
    list = typeof def.controls === 'function'
      ? def.controls(def.create({
        get W() { return W; }, get H() { return H; }, level: function () { return 'all'; },
        toast() { }, log() { }, setControls() { }, invalidateInfo() { }
      }))
      : (def.controls || []);
  } catch (e) {
    ok(false, def.id + ' 的控制项生成失败', e.message);
  }
  const file = fileOfSim(def.id);
  list.forEach((c, i) => {
    const tag = def.id + '#ctl' + i + '(' + (c.id || c.type) + ')';
    ok(['slider', 'select', 'button', 'note', 'sep'].includes(c.type), '控制项类型合法 ' + tag, c.type);
    if (c.type === 'note' || c.type === 'sep') return;
    ok(!!c.id, '控制项有 id ' + tag);
    ok(!!c.label, '控制项有 label ' + tag);
    if (c.type === 'slider') {
      ok(typeof c.min === 'number' && typeof c.max === 'number' && c.min < c.max, '滑块区间合法 ' + tag);
      if (typeof c.value === 'number') {
        ok(c.value >= c.min - 1e-9 && c.value <= c.max + 1e-9, '滑块默认值在区间内 ' + tag,
          c.value + ' ∉ [' + c.min + ', ' + c.max + ']');
      }
    }
    if (c.type === 'select') {
      ok(Array.isArray(c.options) && c.options.length >= 2, '下拉框有选项 ' + tag);
      if (Array.isArray(c.options)) {
        ok(c.options.every(o => o && o.v !== undefined && o.t), '下拉框选项字段齐全 ' + tag);
        ok(c.options.some(o => String(o.v) === String(c.value)), '下拉框默认值在选项里 ' + tag,
          String(c.value) + ' ∉ ' + c.options.map(o => o.v).join('/'));
      }
    }
    if (def.create) {
      /* 实际上：把每个控制项都「操作」一次，不能抛异常 */
      const probe = def.create({
        get W() { return W; }, get H() { return H; }, level: function () { return 'all'; },
        toast() { }, log() { }, setControls() { }, invalidateInfo() { }
      });
      try {
        if (c.type === 'button') { if (probe.action) probe.action(c.id); }
        else if (probe.set) probe.set(c.id, typeof c.value === 'number' ? c.value : (c.options && c.options[0].v));
        ok(true, '操作控制项不报错 ' + tag);
      } catch (e) {
        ok(false, '操作控制项不报错 ' + tag, e.message);
      }
      /* 按钮 id 必须在本文件里被 action 分流过（按文件核对，属于启发式检查） */
      if (c.type === 'button' && file) {
        const handled = new RegExp("id\\s*===\\s*'" + c.id + "'").test(srcByFile[file]);
        ok(handled, '按钮在 ' + path.basename(file) + ' 中被处理 ' + tag);
      }
    }
  });
}

/* ===================== 3. 绘制范围 =====================
   仿真的 draw() 有上千行画布代码，浏览器里才看得出「面板画到画布外面去了」这类问题。
   这里用一个会记录坐标的 Canvas 桩，把所有绘制坐标收集起来，检查是否落在画布内。
   · 带 rotate 的绘制（杠杆的旋转杆等）坐标无法简单还原，只统计不判边界；
   · translate / scale / setTransform 会跟着维护，所以正常情况下坐标都是"最终画布坐标"。 */
function recordingCtx() {
  const stack = [];
  let st = { tx: 0, ty: 0, sx: 1, sy: 1, rot: false };
  let ops = 0;
  const pts = [];
  const rec = (x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (st.rot) return;                       /* 旋转变换下坐标不可直接还原 */
    pts.push([x * st.sx + st.tx, y * st.sy + st.ty]);
  };
  return new Proxy({}, {
    get(t, key) {
      if (key === '__pts') return pts;
      if (key === '__ops') return ops;
      if (key === 'measureText') return () => ({ width: 42 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createConicGradient') {
        return () => ({ addColorStop() { } });
      }
      if (key in t) return t[key];
      const m = String(key);
      return function (...a) {
        ops++;
        switch (m) {
          case 'save': stack.push({ tx: st.tx, ty: st.ty, sx: st.sx, sy: st.sy, rot: st.rot }); break;
          case 'restore': if (stack.length) st = stack.pop(); break;
          case 'translate': st.tx += a[0] * st.sx; st.ty += a[1] * st.sy; break;
          case 'scale': st.sx *= a[0]; st.sy *= a[1]; break;
          case 'setTransform': case 'transform': st = { tx: a[4] || 0, ty: a[5] || 0, sx: a[0] || 1, sy: a[3] || 1, rot: false }; break;
          case 'rotate': if (a[0]) st.rot = true; break;
          case 'arc': case 'ellipse': rec(a[0], a[1]); break;
          case 'fillText': case 'strokeText': rec(a[1], a[2]); break;
          case 'fillRect': case 'strokeRect': case 'rect': case 'clearRect':
            rec(a[0], a[1]); rec(a[0] + a[2], a[1] + a[3]); break;
          case 'arcTo': rec(a[0], a[1]); rec(a[2], a[3]); break;
          case 'moveTo': case 'lineTo': rec(a[0], a[1]); break;
          case 'quadraticCurveTo': rec(a[0], a[1]); rec(a[2], a[3]); break;
          case 'bezierCurveTo': rec(a[0], a[1]); rec(a[2], a[3]); rec(a[4], a[5]); break;
          default: break;
        }
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

section('绘制范围（面板 / 图形不能被画到画布外面）');
const SIZES = [[1000, 660], [760, 520], [620, 460]];
for (const [cw, ch] of SIZES) {
  CONS: for (const def of PHY.SIMS) {
    CHEM.level = 'all';
    let inst;
    try {
      inst = def.create({
        get W() { return cw; }, get H() { return ch; }, level: function () { return 'all'; },
        toast() { }, log() { }, setControls() { }, invalidateInfo() { }
      });
    } catch (e) { continue; }
    const ctx = recordingCtx();
    try {
      for (let i = 0; i < 12; i++) inst.update(0.05);
      inst.draw(ctx, cw, ch);
    } catch (e) {
      ok(false, def.id + ' 在 ' + cw + '×' + ch + ' 下绘制失败', e.message);
      continue;
    }
    const pts = ctx.__pts;
    ok(ctx.__ops >= 30, def.id + '@' + cw + ' 确实画了东西', ctx.__ops + ' 次绘制调用');
    const slack = 34;      /* 箭头、外发光、阴影允许略超一点 */
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
    if (!pts.length) continue;
    const inside = minX >= -slack && maxX <= cw + slack && minY >= -slack && maxY <= ch + slack;
    ok(inside, def.id + '@' + cw + '×' + ch + ' 的绘制都在画布内',
      '实际范围 x[' + Math.round(minX) + ',' + Math.round(maxX) + '] y[' + Math.round(minY) + ',' + Math.round(maxY) +
      ']，画布 ' + cw + '×' + ch);
    if (inst.destroy) inst.destroy();
  }
}

/* ===================== 3.5 控制项穷举 =====================
   只画"默认状态"是查不出问题的：很多缺陷只在把滑块推到端点、或者点了某个按钮之后才出现
   （坐标算出 NaN、面板被推到画布外、除零、数组越界……）。
   所以这里把每个滑块推到 min / 中值 / max、每个下拉框的每个选项、每个按钮都过一遍，
   每一步都 update + draw，检查：
     · 坐标里不能出现 NaN / Infinity（NaN 会让 canvas 静默什么都不画，界面一片空白）
     · 绘制范围仍要在画布内
     · 读数 / 提示不能抛异常 */
section('控制项穷举（滑块端点 + 全部下拉选项 + 全部按钮）');
{
  const stressSizes = [[1000, 660], [620, 460]];
  let nanFound = 0, oobFound = 0, cases = 0;

  for (const def of PHY.SIMS) {
    const mkEnv = (W, H) => ({
      get W() { return W; }, get H() { return H; }, level: function () { return 'all'; },
      toast() { }, log() { }, setControls() { }, invalidateInfo() { }
    });
    /* 收集控制项 */
    let list = [];
    try {
      list = typeof def.controls === 'function' ? def.controls(def.create(mkEnv(1000, 660))) : (def.controls || []);
    } catch (e) {
      ok(false, def.id + ' 控制项生成失败', e.message);
      continue;
    }
    const probes = [];
    list.forEach(c => {
      if (c.type === 'slider') {
        [c.min, (c.min + c.max) / 2, c.max].forEach(v => probes.push({
          label: c.id + '=' + v, apply: s => { if (s.set) s.set(c.id, v); }
        }));
      } else if (c.type === 'select') {
        (c.options || []).forEach(o => probes.push({
          label: c.id + '=' + o.v, apply: s => { if (s.set) s.set(c.id, o.v); }
        }));
      }
    });
    /* 按钮放在最后，单独一组（按钮往往改变状态机） */
    list.filter(c => c.type === 'button').forEach(c => probes.push({
      label: '点击「' + c.label + '」', apply: s => { if (s.action) s.action(c.id); }
    }));

    for (const size of stressSizes) {
      const [W, H] = size;
      for (const pr of probes) {
        cases++;
        let inst;
        try {
          inst = def.create(mkEnv(W, H));
        } catch (e) { ok(false, def.id + ' 创建失败', e.message); break; }
        try {
          pr.apply(inst);
          for (let i = 0; i < 24; i++) inst.update(0.05);
          if (inst.hint) inst.hint();
          if (inst.info) inst.info();
        } catch (e) {
          ok(false, def.id + ' · ' + pr.label + '@' + W + ' 运行时异常', e.message);
          continue;
        }
        const ctx = recordingCtx();
        try {
          inst.draw(ctx, W, H);
        } catch (e) {
          ok(false, def.id + ' · ' + pr.label + '@' + W + ' 绘制异常', e.message);
          continue;
        }
        const bad = ctx.__pts.filter(p => !isFinite(p[0]) || !isFinite(p[1]));
        if (bad.length) {
          nanFound++;
          ok(false, def.id + ' · ' + pr.label + '@' + W + ' 坐标出现 NaN/Infinity',
            bad.length + ' 个点，例如 (' + bad[0][0] + ', ' + bad[0][1] + ')');
        }
        if (!ctx.__pts.length) continue;
        const xs = ctx.__pts.map(p => p[0]), ys = ctx.__pts.map(p => p[1]);
        const slack = 34;
        if (Math.min(...xs) < -slack || Math.max(...xs) > W + slack ||
          Math.min(...ys) < -slack || Math.max(...ys) > H + slack) {
          oobFound++;
          ok(false, def.id + ' · ' + pr.label + '@' + W + ' 绘制越出画布',
            'x[' + Math.round(Math.min(...xs)) + ',' + Math.round(Math.max(...xs)) + '] y[' +
            Math.round(Math.min(...ys)) + ',' + Math.round(Math.max(...ys)) + ']');
        }
        if (inst.destroy) inst.destroy();
      }
    }
  }
  ok(nanFound === 0, '穷举 ' + cases + ' 个状态后没有出现 NaN / Infinity 坐标', nanFound + ' 个状态命中');
  ok(oobFound === 0, '穷举 ' + cases + ' 个状态后没有越出画布', oobFound + ' 个状态命中');
  if (!nanFound && !oobFound) console.log('   穷举了 ' + cases + ' 个「控制项 × 画布尺寸」组合，全部干净');
}

/* ===================== 3.6 鼠标交互 =====================
   拖动这类交互用「控制项穷举」查不到：命中框算错了、和画出来的东西对不上，
   表现是"看着能拖、实际上拖不动"，而所有数值检查都是通过的
   （气体等温变化那个仿真的活塞就犯过这个错：命中框按筒底算、活塞却画在筒顶）。
   这里把指针在一张网格上扫一遍，每个点都 onDown → onMove(+24,+24) → onUp，
   要求：① 不抛异常；② 至少有一个位置让右侧读数发生变化（否则说明命中判定整片失效）。 */
section('鼠标交互（有拖拽的仿真，指针扫格）');
{
  const CW = 1000, CH = 660;
  const rows = [];
  const mkEnv = () => ({
    get W() { return CW; }, get H() { return CH; }, level: function () { return 'all'; },
    toast() { }, log() { }, setControls() { }, invalidateInfo() { }
  });
  for (const def of PHY.SIMS) {
    let probe;
    try { probe = def.create(mkEnv()); } catch (e) { continue; }
    if (!probe.onDown) continue;                 /* 纯控制条驱动的仿真，没有可拖的东西 */
    let changed = 0, dragErr = null, points = 0;
    for (let gx = 24; gx < CW - 24; gx += 40) {
      for (let gy = 48; gy < CH - 24; gy += 40) {
        points++;
        let inst;
        try { inst = def.create(mkEnv()); } catch (e) { dragErr = e.message; break; }
        const before = inst.info ? inst.info() : '';
        try {
          inst.onDown(gx, gy);
          if (inst.onMove) inst.onMove(gx + 24, gy + 24, { buttons: 1, pointerId: 1 });
          if (inst.onUp) inst.onUp();
          inst.update(0.05);
        } catch (e) {
          dragErr = '在 (' + gx + ',' + gy + ') 拖动时异常：' + e.message;
          break;
        }
        if (inst.info && inst.info() !== before) changed++;
      }
      if (dragErr) break;
    }
    ok(!dragErr, def.id + ' 扫描 ' + points + ' 个指针位置都不抛异常', dragErr || '');
    ok(changed > 0, def.id + ' 至少有一个位置能被拖动改变（命中判定没整片失效）',
      changed + ' / ' + points + ' 个位置生效');
    rows.push('   ' + def.id.padEnd(11, ' ') + changed + ' / ' + points + ' 个指针位置能改变画面');
  }
  rows.forEach(r => console.log(r));
}

/* ===================== 3.7 构图比例（形状范围版） =====================
   原来那个坐标桩只记录"锚点"：arc / ellipse 只记圆心、不记半径，
   所以「圆心在画布内、整个圆却画到外面去」根本测不出来，
   也看不出「内容只占了画布一角、大半张是空的」——正是这两类问题让物理仿真
   出现了"图的比例不对"。这里换一个记录**形状实际范围**的桩：
     · arc / ellipse 带上半径（受当前 scale 影响）
     · 文本按当前字体算出宽高，并按 textAlign / textBaseline 修正
     · 覆盖画布绝大部分的 fillRect 视为背景，不计入内容
   然后同时检查：内容落在画布内（更严）＋ 内容用足了画布（占宽 / 占高）。 */
function extentCtx(W, H) {
  const stack = [];
  let st = { tx: 0, ty: 0, sx: 1, sy: 1, rot: false, font: '12px sans' };
  const marks = [];
  let ops = 0, bg = 0;
  const fontSize = () => { const m = /(\d+(?:\.\d+)?)px/.exec(String(st.font)); return m ? Number(m[1]) : 12; };
  const add = (label, x, y, w, h) => {
    if (![x, y, w, h].every(Number.isFinite)) { marks.push({ label, bad: true, x: NaN, y: NaN, w: 0, h: 0 }); return; }
    if (st.rot) return;                        /* 旋转变换下坐标无法直接还原 */
    marks.push({ label, x: x * st.sx + st.tx, y: y * st.sy + st.ty, w: w * Math.abs(st.sx), h: h * Math.abs(st.sy) });
  };
  return new Proxy({}, {
    get(t, key) {
      if (key === '__marks') return marks;
      if (key === '__ops') return ops;
      if (key === '__bg') return bg;
      if (key === 'measureText') return (s) => ({ width: String(s).length * fontSize() * 0.62 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createConicGradient') return () => ({ addColorStop() { } });
      if (key in t) return t[key];
      const m = String(key);
      return function (...a) {
        ops++;
        switch (m) {
          case 'save': stack.push({ ...st }); break;
          case 'restore': if (stack.length) st = stack.pop(); break;
          case 'translate': st.tx += a[0] * st.sx; st.ty += a[1] * st.sy; break;
          case 'scale': st.sx *= a[0]; st.sy *= a[1]; break;
          case 'setTransform': case 'transform': st = { tx: a[4] || 0, ty: a[5] || 0, sx: a[0] || 1, sy: a[3] || 1, rot: false, font: st.font }; break;
          case 'rotate': if (a[0]) st.rot = true; break;
          case 'arc': add('arc(r=' + a[2].toFixed(1) + ')', a[0] - a[2], a[1] - a[2], a[2] * 2, a[2] * 2); break;
          case 'ellipse': add('ellipse', a[0] - a[2], a[1] - a[3], a[2] * 2, a[3] * 2); break;
          case 'fillText': case 'strokeText': {
            const fs2 = fontSize(), w = String(a[0]).length * fs2 * 0.62;
            const ox = t.textAlign === 'center' ? -w / 2 : (t.textAlign === 'right' ? -w : 0);
            const oy = t.textBaseline === 'top' ? 0 : (t.textBaseline === 'middle' ? -fs2 / 2 : -fs2);
            add('text', a[1] + ox, a[2] + oy, w, fs2 * 1.2);
            break;
          }
          case 'fillRect': case 'strokeRect': case 'rect': case 'clearRect': {
            if (Math.abs(a[2] * a[3]) > W * H * 0.85 && Math.abs(a[0]) < 4 && Math.abs(a[1]) < 4) { bg++; break; }
            add(m, a[0], a[1], a[2], a[3]);
            break;
          }
          case 'arcTo': add('arcTo', Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.abs(a[2] - a[0]), Math.abs(a[3] - a[1])); break;
          case 'moveTo': case 'lineTo': add(m, a[0], a[1], 0, 0); break;
          case 'quadraticCurveTo': add(m, a[2], a[3], 0, 0); break;
          case 'bezierCurveTo': add(m, a[4], a[5], 0, 0); break;
          default: break;
        }
        return undefined;
      };
    },
    set(t, k, v) { if (k === 'font') st.font = v; t[k] = v; return true; }
  });
}

section('构图比例（内容要落在画布内、并且用足画布）');
{
  const MIN_W = 50, MIN_H = 50;       /* 内容包围盒至少要占画布的百分比 */
  let worstW = { v: 100, id: '—' }, worstH = { v: 100, id: '—' };
  for (const [cw, ch] of [[1000, 660], [620, 460]]) {
    for (const def of PHY.SIMS) {
      CHEM.level = 'all';
      let inst;
      try {
        inst = def.create({
          get W() { return cw; }, get H() { return ch; }, level: function () { return 'all'; },
          toast() { }, log() { }, setControls() { }, invalidateInfo() { }
        });
      } catch (e) { continue; }
      const ctx = extentCtx(cw, ch);
      try {
        for (let i = 0; i < 12; i++) inst.update(0.05);
        inst.draw(ctx, cw, ch);
      } catch (e) {
        ok(false, def.id + '@' + cw + ' 绘制失败（构图检查）', e.message);
        continue;
      }
      const nan = ctx.__marks.filter(m => m.bad);
      ok(nan.length === 0, def.id + '@' + cw + '×' + ch + ' 没有非有限坐标的形状', nan.length + ' 个');
      const ms = ctx.__marks.filter(m => !m.bad);
      if (!ms.length) { ok(false, def.id + '@' + cw + '×' + ch + ' 没画出任何内容'); continue; }
      const x0 = Math.min(...ms.map(m => m.x));
      const x1 = Math.max(...ms.map(m => m.x + m.w));
      const y0 = Math.min(...ms.map(m => m.y));
      const y1 = Math.max(...ms.map(m => m.y + m.h));
      const slack = 34;
      ok(x0 >= -slack && x1 <= cw + slack && y0 >= -slack && y1 <= ch + slack,
        def.id + '@' + cw + '×' + ch + ' 的形状范围（含半径 / 文字宽高）在画布内',
        'x[' + x0.toFixed(0) + ',' + x1.toFixed(0) + '] y[' + y0.toFixed(0) + ',' + y1.toFixed(0) + ']');
      const fw = (x1 - x0) / cw * 100, fh = (y1 - y0) / ch * 100;
      ok(fw >= MIN_W, def.id + '@' + cw + '×' + ch + ' 横向用足画布（≥' + MIN_W + '%）', fw.toFixed(0) + '%');
      ok(fh >= MIN_H, def.id + '@' + cw + '×' + ch + ' 纵向用足画布（≥' + MIN_H + '%）', fh.toFixed(0) + '%');
      if (fw < worstW.v) worstW = { v: fw, id: def.id + '@' + cw };
      if (fh < worstH.v) worstH = { v: fh, id: def.id + '@' + cw };
      if (inst.destroy) inst.destroy();
    }
  }
  console.log('   最低横向占比 ' + worstW.v.toFixed(0) + '%（' + worstW.id + '）　最低纵向占比 ' +
    worstH.v.toFixed(0) + '%（' + worstH.id + '）');
}

/* ===================== 4. 实验任务注册 ===================== */
section('实验任务注册');
const seenTask = new Set();
PHY.TASKS.forEach(t => {
  const tag = t.id || '(无 id)';
  ok(!!t.id && !!t.name, '任务有 id / name', tag);
  ok(!seenTask.has(t.id), '任务 id 唯一', tag);
  seenTask.add(t.id);
  ok(['junior', 'senior'].includes(t.level), '任务学段合法（初中 / 高中）', tag + ' → ' + t.level);
  ok(!!PHY.SIM_MAP[t.sim], '任务引用的仿真存在', tag + ' → ' + t.sim);
  ok(!!t.chapter, '任务有教材章节', tag);
  ok(!!t.goal && !!t.intro, '任务有实验目的与说明', tag);
  ok(Array.isArray(t.principle) && t.principle.length > 0, '任务有实验原理', tag);
  ok(Array.isArray(t.steps) && t.steps.length >= 3, '任务步骤数 ≥ 3', tag + ' → ' + (t.steps || []).length);
  (t.steps || []).forEach((s, i) => {
    ok(!!s.text, '步骤有文字 ' + tag + '#步' + (i + 1));
    ok(typeof s.check === 'function', '步骤有 check 判定 ' + tag + '#步' + (i + 1));
    ok(typeof s.act === 'function', '步骤有 act 动作脚本（测试可达性用）' + tag + '#步' + (i + 1));
  });
});

/* ===================== 4. 每一步真的做得出来 ===================== */
section('逐步可达性（照着 act 做一遍，看 check 是否真的变成 true）');
const taskReport = [];
for (const t of PHY.TASKS) {
  CHEM.level = t.level;
  let sim = null;
  try {
    sim = PHY.loadSim(t.sim, t.preset || null, true);
  } catch (e) {
    ok(false, '打开实验「' + t.name + '」', e.message);
    continue;
  }
  if (!sim) { ok(false, '打开实验「' + t.name + '」', 'loadSim 返回 null'); continue; }
  const bad = [];
  t.steps.forEach((st, i) => {
    try {
      if (st.act) st.act(sim);
      for (let k = 0; k < 4; k++) sim.update(0.05);
      if (st.check(sim) !== true) bad.push(i + 1);
    } catch (e) {
      bad.push(i + 1 + '(' + e.message + ')');
    }
  });
  ok(bad.length === 0, '实验步骤全部可达：「' + t.name + '」', bad.length ? '第 ' + bad.join('、') + ' 步的 check 没有变成 true' : '');
  taskReport.push({ name: t.name, level: t.level, sim: t.sim, steps: t.steps.length, bad: bad.length });
  if (sim.destroy) sim.destroy();
}

/* 连续推进：整条步骤链一起跑一遍，模拟界面里逐帧判定的过程 */
section('整链路推进（每步 act 之后连续判定，模拟 checkGuide 的行为）');
for (const t of PHY.TASKS) {
  CHEM.level = t.level;
  const sim = PHY.loadSim(t.sim, t.preset || null, true);
  if (!sim) continue;
  let step = 0, guard = 0, err = null;
  try {
    while (step < t.steps.length && guard++ < 200) {
      const st = t.steps[step];
      if (st.act) st.act(sim);
      sim.update(0.05);
      if (st.check(sim) === true) step++;
      else if (guard > 150) break;
    }
  } catch (e) { err = e.message; }
  ok(err === null && step === t.steps.length, '整链路走完：「' + t.name + '」',
    err || ('停在第 ' + (step + 1) + ' 步 / 共 ' + t.steps.length + ' 步'));
  if (sim.destroy) sim.destroy();
}

/* ===================== 5. 学段过滤 ===================== */
section('学段过滤与统计');
function availSims(lv) { CHEM.level = lv; return PHY.SIMS.filter(s => PHY.levelOK(s.level)); }
const jSims = availSims('junior'), sSims = availSims('senior'), aSims = availSims('all');
ok(jSims.length < aSims.length && sSims.length < aSims.length,
  '初 / 高中的仿真主题数都少于「全部内容」', '初中 ' + jSims.length + ' / 高中 ' + sSims.length + ' / 全部 ' + aSims.length);
ok(aSims.length === PHY.SIMS.length, '「全部内容」下所有主题都可用');
ok(!jSims.some(s => s.level === 'senior'), '初中模式下没有高中专属主题');
ok(!sSims.some(s => s.level === 'junior'), '高中模式下没有初中专属主题');
const jTasks = PHY.TASKS.filter(t => t.level === 'junior');
const sTasks = PHY.TASKS.filter(t => t.level === 'senior');
ok(jTasks.length >= 8, '初中物理实验数量充足', jTasks.length + ' 个');
ok(sTasks.length >= 8, '高中物理实验数量充足', sTasks.length + ' 个');

section('覆盖统计');
const byField = {};
PHY.SIMS.forEach(s => { byField[s.field] = (byField[s.field] || 0) + 1; });
const FIELD_NAME = { mech: '力学', sound: '声学', thermal: '热学', optics: '光学', elec: '电学', em: '电磁学', modern: '近代物理' };
FIELD_IDS.forEach(f => {
  const n = byField[f] || 0;
  console.log('   ' + FIELD_NAME[f].padEnd(6, '　') + (n ? n + ' 个主题' : '\x1b[33m（暂无主题）\x1b[0m'));
});
ok(FIELD_IDS.filter(f => byField[f]).length >= 6, '至少 6 个物理分支有内容', Object.keys(byField).join('/'));
console.log('\n   仿真主题 ' + PHY.SIMS.length + ' 个，教材实验 ' + PHY.TASKS.length +
  ' 个（初中 ' + jTasks.length + ' + 高中 ' + sTasks.length + '）');

/* ===================== 结果 ===================== */
console.log('\n' + '─'.repeat(64));
if (fail) {
  console.log('\x1b[31m✗ 失败 ' + fail + ' 项，通过 ' + pass + ' 项\x1b[0m');
  failures.slice(0, 80).forEach(f => console.log('   · ' + f));
  if (failures.length > 80) console.log('   … 其余 ' + (failures.length - 80) + ' 项省略');
} else {
  console.log('\x1b[32m✓ 全部通过：' + pass + ' 项断言\x1b[0m');
}
process.exit(fail ? 1 : 0);
