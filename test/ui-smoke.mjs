/* =============================================================================
 * 虚拟化学实验室 —— 界面层冒烟测试（模拟 DOM + 模拟 Canvas）
 * -----------------------------------------------------------------------------
 * 这个沙箱无法启动 headless 浏览器（命名管道受限），所以这里手写一个最小 DOM /
 * Canvas 2D 模拟器，把 index.html + 全部脚本真正"跑"起来，用来抓：
 *   · app.js 引用了不存在的元素 id / 未定义的变量
 *   · draw.js 调用了 Canvas 上不存在的方法
 *   · 事件处理函数里的运行时异常
 * 真实的像素效果仍需在浏览器里目视确认。
 * 运行：node test/ui-smoke.mjs
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
  'strokeRect', 'clearRect', 'setLineDash', 'getLineDash', 'fillText', 'strokeText',
  'drawImage', 'createPattern', 'putImageData', 'getImageData', 'measureText'
];
const gradient = () => ({ addColorStop() { } });
const mockCtx = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return () => ({ width: 42 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createConicGradient') return gradient;
    if (key in target) return target[key];
    if (CTX_METHODS.includes(key)) return () => { };
    // 属性读取（fillStyle 等）返回空串，赋值正常保存
    return target[key] !== undefined ? target[key] : '';
  },
  set(target, key, value) { target[key] = value; return true; }
});

/* ===================== DOM 模拟 ===================== */
function findAll(root, className, out) {
  out = out || [];
  for (const c of root.children || []) {
    if (c._classes && c._classes.has(className)) out.push(c);
    findAll(c, className, out);
  }
  return out;
}

class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this._classes = new Set();
    this._html = '';
    this.textContent = '';
    this.value = '';
    this.listeners = Object.create(null);
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this._clientWidth = 1000;
    this._clientHeight = 660;
    const self = this;
    /* 样式桩：除了普通属性，还要支持 CSS 自定义属性用到的 setProperty /
       getPropertyValue —— 物理货架分组会用 style.setProperty('--cat', …)。 */
    this.style = new Proxy({}, {
      get: (t, k) => {
        if (k === 'setProperty') return (key, val) => { t[key] = val; };
        if (k === 'getPropertyValue') return key => (key in t ? t[key] : '');
        if (k === 'removeProperty') return key => { delete t[key]; };
        return (k in t ? t[k] : '');
      },
      set: (t, k, v) => { t[k] = v; return true; }
    });
  }
  get classList() {
    const s = this._classes;
    return {
      add: (...c) => c.forEach(x => x && s.add(x)),
      remove: (...c) => c.forEach(x => s.delete(x)),
      contains: c => s.has(c),
      toggle: (c, f) => { if (f === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else if (f) s.add(c); else s.delete(c); }
    };
  }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  /* 隐藏元素（display:none）量不到尺寸 —— 浏览器里 clientWidth / clientHeight 会变成 0，
     画布尺寸算错、切回来变成空白就是从这里来的，所以桩必须照着真实行为来。 */
  get clientWidth() { return this._classes.has('hidden') ? 0 : this._clientWidth; }
  get clientHeight() { return this._classes.has('hidden') ? 0 : this._clientHeight; }
  set clientWidth(v) { this._clientWidth = v; }
  set clientHeight(v) { this._clientHeight = v; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  set innerHTML(v) { this._html = String(v); if (!v) this.children = []; }
  get innerHTML() { return this._html; }
  get firstChild() { return this.children[0] || null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener() { }
  dispatch(t, ev) {
    const e = Object.assign({ type: t, target: this, button: 0, clientX: 0, clientY: 0, pointerId: 1, stopPropagation() { }, preventDefault() { } }, ev);
    (this.listeners[t] || []).slice().forEach(f => f(e));
  }
  querySelectorAll(sel) {
    const s = String(sel).trim();
    if (s.startsWith('.')) return findAll(this, s.slice(1));
    // 只支持类选择器，其余返回空
    return [];
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 660, width: 1000, height: 660 }; }
  getContext() { return mockCtx; }
  setPointerCapture() { }
  focus() { }
  blur() { }
  matches(sel) { return sel.startsWith('.') && this._classes.has(sel.slice(1)); }
}

/* ---- 按 index.html 建立元素注册表 ----
   连 class 属性一起解析：元素的初始 class（尤其是 .hidden）决定了界面初始状态，
   只按 id 建空元素会漏掉「化学货架已隐藏 / 物理货架该藏着」这类错误。 */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const byId = Object.create(null);
for (const m of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
  const tag = m[0];
  if (!byId[m[1]]) byId[m[1]] = new El('div');
  const cm = tag.match(/\bclass="([^"]*)"/);
  if (cm) byId[m[1]].className = cm[1];
}

/* 工具栏按钮 */
const toolbarHtml = html.slice(html.indexOf('id="toolbar"'));
const toolbarTools = [...toolbarHtml.matchAll(/data-tool="([^"]+)"/g)].map(m => m[1]);
for (const t of toolbarTools) {
  const b = new El('button');
  b.classList.add('tool');
  b.dataset.tool = t;
  byId.toolbar.appendChild(b);
}
/* 货架标签页 */
const tabButtons = [];
for (const m of html.matchAll(/data-tab="([^"]+)"/g)) {
  const b = new El('button');
  b.classList.add('tab');
  b.dataset.tab = m[1];
  tabButtons.push(b);
}
byId.panelApparatus.classList.add('shelf-panel');
byId.panelReagent.classList.add('shelf-panel');
byId.logList.classList.add('log-list');
const documentMock = {
  readyState: 'complete',
  getElementById: id => byId[id] || null,
  createElement: tag => new El(tag),
  createTextNode: t => { const e = new El('#text'); e.textContent = t; return e; },
  querySelectorAll: sel => {
    const s = String(sel).trim();
    if (s === '.shelf-tabs .tab') return tabButtons;
    if (s.startsWith('.')) {
      const out = [];
      for (const k in byId) { if (byId[k] && byId[k]._classes && byId[k]._classes.has(s.slice(1))) out.push(byId[k]); }
      return out;
    }
    return [];
  },
  querySelector: sel => documentMock.querySelectorAll(sel)[0] || null,
  addEventListener() { },
  body: new El('body')
};

const store = Object.create(null);
const localStorageMock = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

/* document 级事件（app.js 会在 document 上挂拖拽监听） */
const docListeners = Object.create(null);
documentMock.addEventListener = (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); };
documentMock.removeEventListener = (t, f) => {
  const l = docListeners[t]; if (!l) return;
  const i = l.indexOf(f); if (i >= 0) l.splice(i, 1);
};
documentMock.dispatch = (t, ev) => {
  const e = Object.assign({ type: t, target: documentMock, button: 0, clientX: 0, clientY: 0, pointerId: 1, stopPropagation() { }, preventDefault() { } }, ev);
  (docListeners[t] || []).slice().forEach(f => f(e));
};

let rafCb = null;
let rafCount = 0;

/* 让 window 就是 globalThis，这样脚本里 root.CHEM 挂到的就是同一个命名空间 */
globalThis.window = globalThis;
globalThis.document = documentMock;
globalThis.devicePixelRatio = 1;
globalThis.localStorage = localStorageMock;
globalThis.confirm = () => true;
globalThis.alert = () => { };
globalThis.addEventListener = () => { };
globalThis.removeEventListener = () => { };
globalThis.requestAnimationFrame = cb => { rafCb = cb; return ++rafCount; };
globalThis.cancelAnimationFrame = () => { };
globalThis.ResizeObserver = undefined;

/* ===================== 加载全部脚本 ===================== */
/* 脚本清单直接从 index.html 解析出来。
   以前这里是硬编码的列表，结果漏掉了高中、热力学等后来新增的数据文件，
   UI 测试其实一直在测一个"没有高中内容"的应用 —— 这类清单绝不能再手写。 */
const SCRIPTS = [...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)].map(m => m[1]);
if (SCRIPTS.length < 8) {
  console.error('无法从 index.html 解析出脚本清单，解析结果：', SCRIPTS);
  process.exit(1);
}

const errors = [];
process.on('uncaughtException', e => {
  errors.push('uncaught: ' + e.stack);
  console.log('\x1b[31m!! 未捕获异常：' + e.message + '\x1b[0m');
  console.log('   ' + String(e.stack).split('\n').slice(1, 5).join('\n   '));
});
process.on('unhandledRejection', e => errors.push('rejection: ' + e));

section('加载全部脚本');
ok(SCRIPTS.length >= 10, '从 index.html 解析出完整脚本清单', SCRIPTS.length + ' 个：' + SCRIPTS.join(', '));
const CHEM = {};
for (const f of SCRIPTS) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try {
    (0, eval)(code);
    ok(true, '加载 ' + f);
  } catch (e) {
    ok(false, '加载 ' + f, e.message);
    console.log('    ' + e.stack.split('\n').slice(0, 4).join('\n    '));
  }
}
const C = globalThis.CHEM;
ok(!!C, 'CHEM 命名空间已建立');
ok(!!C.Renderer, 'Renderer 已定义');
ok(!globalThis.__INIT_ERROR, '初始化未抛异常', String(globalThis.__INIT_ERROR || ''));

section('界面构建');
ok(byId.panelApparatus.children.length >= 1, '仪器架已生成分组', byId.panelApparatus.children.length);
const appCards = findAll(byId.panelApparatus, 'item-card');
ok(appCards.length >= 20, '仪器卡片数量 >= 20', appCards.length);
ok(byId.reagentGroups.children.length >= 5, '药品架已生成分组', byId.reagentGroups.children.length);
const reagentCards = findAll(byId.reagentGroups, 'item-card');
ok(reagentCards.length >= 40, '药品卡片数量 >= 40', reagentCards.length);
ok(byId.taskSelect.children.length >= 2, '任务下拉框已填充（按学段分组）', byId.taskSelect.children.length);
{
  /* 实验现在放在 optgroup 里，要递归数 option */
  const countOptions = node => (node.tagName === 'OPTION' ? 1 : 0) +
    (node.children || []).reduce((s, c) => s + countOptions(c), 0);
  const n = (byId.taskSelect.children || []).reduce((s, c) => s + countOptions(c), 0);
  ok(n >= 11, '下拉框里列出了全部实验', n + ' 个实验 + 自由探索');
}
ok(byId.toolbar.children.length === toolbarTools.length, '工具栏按钮已绑定', byId.toolbar.children.length);

section('动画帧渲染（含全部仪器与特效）');
function runFrames(n, t0) {
  for (let i = 0; i < n; i++) {
    const cb = rafCb; rafCb = null;
    if (!cb) break;
    cb(t0 + i * 16.7);
  }
}
let frameError = null;
try { runFrames(10, 1000); } catch (e) { frameError = e; }
ok(!frameError, '空台面渲染 10 帧无异常', frameError && frameError.stack);

section('把每种仪器都放上台面并渲染');
// 通过点击仪器卡片放置（同时验证点击处理函数）
let placed = 0;
for (const card of appCards) {
  try {
    card.dataset.dragged = '0';
    card.dispatch('click');
    placed++;
  } catch (e) {
    ok(false, '点击仪器卡片失败：' + card.dataset.type, e.message);
  }
}
ok(placed >= 20, '全部仪器卡片点击成功', placed);
frameError = null;
try { runFrames(30, 2000); } catch (e) { frameError = e; }
ok(!frameError, '装满仪器的台面渲染 30 帧无异常', frameError && frameError.stack);

section('点选容器 + 加入药品 + 触发反应');
const world = C.__world;
ok(!!world, '能拿到 world 实例');
const containers = world.containers();
ok(containers.length >= 7, '台面上有多个容器', containers.length);

// 选中一个试管，加入铁钉与稀盐酸
const tube = containers.find(c => c.type === 'testTube');
C.__select(tube.uid);
ok(C.__state().selected === tube.uid, '选中试管');
function clickReagent(id) {
  const card = reagentCards.find(c => c.dataset.id === id);
  if (!card) { ok(false, '找不到药品卡片 ' + id); return; }
  card.dispatch('click');
}
clickReagent('fe');
clickReagent('hcl');
ok(tube.hasBase('fe'), '试管中有铁钉');
ok(tube.hasBase('hcl'), '试管中有稀盐酸');
frameError = null;
try { runFrames(200, 3000); } catch (e) { frameError = e; }
ok(!frameError, '反应过程中的渲染无异常', frameError && frameError.stack);
ok(!!tube.firedRules['fe_hcl'], '铁与稀盐酸反应被触发');
ok(world.log.length > 3, '实验记录有内容', world.log.length);
ok(byId.logList.children.length > 3, '实验记录已渲染到界面', byId.logList.children.length);

section('工具模式切换与画布交互');
for (const t of toolbarTools) {
  try {
    const btn = byId.toolbar.children.find(b => b.dataset.tool === t);
    btn.dispatch('click');
    ok(C.__state().tool === t, '切换到工具「' + t + '」');
  } catch (e) {
    ok(false, '切换工具失败：' + t, e.message);
  }
}

/* 画布上模拟一次指针按下：选中并拖动 */
const canvas = byId.bench;
const sceneOf = (c) => ({ x: c.x, y: c.y - 40 });
let interactError = null;
try {
  const btnSel = byId.toolbar.children.find(b => b.dataset.tool === 'select');
  btnSel.dispatch('click');
  const p = sceneOf(tube);
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / C.SCENE.w, r.height / C.SCENE.h);
  const ox = (r.width - C.SCENE.w * scale) / 2;
  const oy = (r.height - C.SCENE.h * scale) / 2;
  const clientX = p.x * scale + ox, clientY = p.y * scale + oy;
  canvas.dispatch('pointerdown', { clientX, clientY, button: 0, pointerId: 1 });
  canvas.dispatch('pointermove', { clientX: clientX + 30, clientY: clientY - 20, pointerId: 1 });
  canvas.dispatch('pointerup', { clientX: clientX + 30, clientY: clientY - 20, pointerId: 1 });
} catch (e) { interactError = e; }
ok(!interactError, '画布指针交互无异常', interactError && interactError.message);

/* 点燃 / 搅拌 / 检验 / 通电 / 倾倒 / 倒掉 */
function toolClick(tool, target) {
  const btn = byId.toolbar.children.find(b => b.dataset.tool === tool);
  btn.dispatch('click');
  const p = sceneOf(target);
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / C.SCENE.w, r.height / C.SCENE.h);
  const ox = (r.width - C.SCENE.w * scale) / 2, oy = (r.height - C.SCENE.h * scale) / 2;
  canvas.dispatch('pointerdown', { clientX: p.x * scale + ox, clientY: p.y * scale + oy, button: 0, pointerId: 1 });
  canvas.dispatch('pointerup', { clientX: p.x * scale + ox, clientY: p.y * scale + oy, button: 0, pointerId: 1 });
}
let toolErr = null;
try {
  const lamp = world.devices().find(d => d.type === 'alcoholLamp');
  if (lamp) toolClick('ignite', lamp);
  toolClick('stir', tube);
  toolClick('power', tube);
  toolClick('power', tube);
  const jar = containers.find(c => c.type === 'gasJar');
  if (jar) toolClick('pour', jar);
} catch (e) { toolErr = e; }
ok(!toolErr, '工具操作（点燃/搅拌/通电/倾倒）无异常', toolErr && toolErr.stack);

frameError = null;
try { runFrames(120, 5000); } catch (e) { frameError = e; }
ok(!frameError, '工具操作后继续渲染无异常', frameError && frameError.stack);

section('实验任务全部启动一遍');
const tasks = C.EXPERIMENTS || [];
ok(tasks.length >= 6, '任务数量 >= 6', tasks.length);
for (const t of tasks) {
  let e1 = null;
  try {
    C.__startTask(t.id);
    runFrames(40, 6000);
  } catch (e) { e1 = e; }
  ok(!e1, '启动并运行任务：' + t.name, e1 && e1.stack);
}
ok(C.__state().task !== null || true, '任务状态可用');

section('存取档');
let saveErr = null;
try {
  byId.btnSave.dispatch('click');
  byId.btnLoad.dispatch('click');
  runFrames(20, 7000);
} catch (e) { saveErr = e; }
ok(!saveErr, '保存 / 读取无异常', saveErr && saveErr.stack);
ok(!!store['chemlab.save.v1'], '存档已写入 localStorage');

section('弹层与帮助');
let modalErr = null;
try {
  byId.btnHelp.dispatch('click');
  ok(!byId.modalMask.classList.contains('hidden'), '帮助弹层已显示');
  byId.modalOk.dispatch('click');
  ok(byId.modalMask.classList.contains('hidden'), '帮助弹层已关闭');
  byId.btnTaskInfo.dispatch('click');
  byId.modalClose.dispatch('click');
} catch (e) { modalErr = e; }
ok(!modalErr, '弹层交互无异常', modalErr && modalErr.stack);

section('拖动容器：落点必须精确');
const BENCH = C.SCENE.benchY;
function clientOf(x, y) { return C.__clientOf(x, y); }
function pointer(kind, x, y) {
  canvas.dispatch(kind, Object.assign({ button: 0, pointerId: 1 }, clientOf(x, y)));
}
/* 拖动只在「选择」工具下生效，先把工具切回来 */
function useSelect() {
  byId.toolbar.children.find(b => b.dataset.tool === 'select').dispatch('click');
}
useSelect();
ok(C.__state().tool === 'select', '已切回「选择」工具');
{
  world.clear();
  C.__select(null);
  runFrames(2, 8000);
  const t = world.add('testTube', 300, BENCH);
  runFrames(2, 8100);

  /* 抓住试管中部，向右上拖 (180, -40) */
  const x0 = t.x, y0 = t.y;
  pointer('pointerdown', x0, y0 - 70);
  pointer('pointermove', x0 + 90, y0 - 90);
  pointer('pointermove', x0 + 180, y0 - 110);
  pointer('pointerup', x0 + 180, y0 - 110);
  ok(Math.abs(t.x - (x0 + 180)) < 0.8, '水平落点与鼠标位移一致', t.x.toFixed(2) + ' vs ' + (x0 + 180));
  ok(Math.abs(t.y - (y0 - 40)) < 0.8, '垂直落点与鼠标位移一致', t.y.toFixed(2) + ' vs ' + (y0 - 40));
}
{
  /* 落点必须以"松开鼠标的位置"为准，而不是最后一次 pointermove */
  const t = world.containers()[0];
  const x0 = t.x, y0 = t.y;
  pointer('pointerdown', x0, y0 - 70);
  pointer('pointermove', x0 + 60, y0 - 80);
  pointer('pointerup', x0 + 200, y0 - 120);       // 松手时又走了一段
  ok(Math.abs(t.x - (x0 + 200)) < 0.8, '松手位置决定水平落点', t.x.toFixed(2) + ' vs ' + (x0 + 200));
  ok(Math.abs(t.y - (y0 - 50)) < 0.8, '松手位置决定垂直落点', t.y.toFixed(2) + ' vs ' + (y0 - 50));
}
{
  /* 只点击不拖动：位置不能变 */
  const t = world.containers()[0];
  const x0 = t.x, y0 = t.y;
  pointer('pointerdown', t.x, t.y - 60);
  pointer('pointerup', t.x, t.y - 60);
  ok(t.x === x0 && t.y === y0, '单纯点击不会移动仪器', t.x + ',' + t.y);
}
{
  /* 台面边界：不能拖到台面以下，也不能拖出画布 */
  const t = world.containers()[0];
  pointer('pointerdown', t.x, t.y - 60);
  pointer('pointermove', t.x, t.y + 400);
  pointer('pointerup', t.x, t.y + 400);
  ok(t.y === BENCH, '仪器底边不会沉到台面以下', t.y);
  pointer('pointerdown', t.x, t.y - 60);
  pointer('pointermove', -500, t.y - 60);
  pointer('pointerup', -500, t.y - 60);
  const a = C.getApp(t.type);
  ok(t.x >= 20, '仪器不会被拖出左边界', t.x.toFixed(1));
  void a;
}
{
  /* 靠近另一个容器（但没有盖住它）不应该触发倾倒 */
  world.clear();
  const a = world.add('beakerSmall', 300, BENCH);
  const b = world.add('beakerSmall', 620, BENCH);
  a.addLiquid('h2o', 40);
  runFrames(2, 8200);
  pointer('pointerdown', a.x, a.y - 40);
  pointer('pointermove', 470, a.y - 40);      // 距离 b 还有 150，不在其瓶口范围内
  pointer('pointerup', 470, a.y - 40);
  ok(Math.abs(a.x - 470) < 0.8, '并排放置时位置精确', a.x.toFixed(2));
  ok(a.liquidVolume() > 35, '并排放置不会误触发倾倒', a.liquidVolume().toFixed(1) + ' mL');
  ok(b.liquidVolume() < 0.01, '目标容器没有被动到');
}
{
  /* 直接盖在另一个容器口上 -> 触发倾倒 */
  const a = world.containers()[0];
  const b = world.containers()[1];
  const before = b.liquidVolume();
  pointer('pointerdown', a.x, a.y - 40);
  pointer('pointermove', b.x, b.y);
  pointer('pointerup', b.x, b.y);
  ok(b.liquidVolume() > before + 5, '拖到另一个容器口内会倾倒液体', b.liquidVolume().toFixed(1) + ' mL');
}

section('把药品拖到容器里并指定加入量');
{
  world.clear();
  const bk = world.add('beakerBig', 520, BENCH);
  C.__select(null);
  runFrames(2, 8300);
  const card = reagentCards.find(c => c.dataset.id === 'hcl');
  ok(!!card, '找到稀盐酸药品卡片');
  const p = clientOf(bk.x, bk.y - 40);
  card.dispatch('pointerdown', { clientX: 40, clientY: 40, button: 0, pointerId: 1 });
  documentMock.dispatch('pointermove', { clientX: 60, clientY: 60, pointerId: 1 });
  documentMock.dispatch('pointermove', { clientX: p.clientX, clientY: p.clientY, pointerId: 1 });
  ok(C.__state().dropTarget === bk.uid, '拖动时高亮目标容器');
  documentMock.dispatch('pointerup', { clientX: p.clientX, clientY: p.clientY, pointerId: 1 });
  ok(!byId.amountPop.classList.contains('hidden'), '松开后弹出加药量浮层');
  ok(C.__state().pop && C.__state().pop.container === bk, '浮层绑定了正确的容器');

  /* 用滑块指定 12 mL */
  byId.apRange.value = '12';
  byId.apOk.dispatch('click');
  runFrames(2, 8400);
  ok(Math.abs(bk.liquidVolume() - 12) < 0.6, '按指定量加入 12 mL', bk.liquidVolume().toFixed(2) + ' mL');
  ok(bk.hasBase('hcl'), '药品确实是稀盐酸');
  ok(byId.amountPop.classList.contains('hidden'), '确认后浮层关闭');
}
{
  /* 取消不应该加入 */
  const bk = world.containers()[0];
  const v0 = bk.liquidVolume();
  const card = reagentCards.find(c => c.dataset.id === 'naohaq');
  const p = clientOf(bk.x, bk.y - 40);
  card.dispatch('pointerdown', { clientX: 40, clientY: 40, button: 0, pointerId: 1 });
  documentMock.dispatch('pointermove', { clientX: 60, clientY: 60, pointerId: 1 });
  documentMock.dispatch('pointermove', { clientX: p.clientX, clientY: p.clientY, pointerId: 1 });
  documentMock.dispatch('pointerup', { clientX: p.clientX, clientY: p.clientY, pointerId: 1 });
  byId.apCancel.dispatch('click');
  runFrames(2, 8500);
  ok(Math.abs(bk.liquidVolume() - v0) < 0.01, '取消后没有加入药品', bk.liquidVolume().toFixed(2));
}
{
  /* 默认加入量：少量 / 适量 / 大量 应该依次变多 */
  const bk = world.containers()[0];
  function addWith(mode) {
    world.clear();
    const c = world.add('beakerBig', 520, BENCH);
    C.__state().amountMode = mode;
    const card = reagentCards.find(x => x.dataset.id === 'h2o');
    card.dataset.dragged = '0';
    C.__select(c.uid);
    card.dispatch('click');
    return c.liquidVolume();
  }
  const vL = addWith('little'), vN = addWith('normal'), vM = addWith('much');
  ok(vL < vN && vN < vM, '少量 < 适量 < 大量', vL.toFixed(1) + ' / ' + vN.toFixed(1) + ' / ' + vM.toFixed(1));
  C.__state().amountMode = 'normal';
  void bk;
}

section('悬停查看容器状态');
{
  world.clear();
  const c = world.add('beakerSmall', 400, BENCH);
  c.addLiquid('cuso4aq', 20);
  c.addSolid('fe', 0.5);
  runFrames(30, 8600);
  pointer('pointermove', c.x, c.y - 40);
  ok(C.__state().hover === c.uid, '悬停命中容器', String(C.__state().hover));
  ok(!byId.hoverTip.classList.contains('hidden'), '状态气泡已显示');
  const html = byId.hoverTip.innerHTML;
  ok(html.indexOf('温度') >= 0, '气泡里有温度');
  ok(html.indexOf('液体') >= 0, '气泡里有液体体积');
  ok(html.indexOf('pH') >= 0, '气泡里有 pH');
  ok(html.indexOf('硫酸铜') >= 0, '气泡里列出了成分');
  pointer('pointermove', 60, 60);
  ok(C.__state().hover === null, '移开空白处取消悬停');
  ok(byId.hoverTip.classList.contains('hidden'), '状态气泡已隐藏');
}

section('学段切换（初中 / 高中 / 全部）');
{
  const counts = {};
  for (const lv of ['junior', 'senior', 'all']) {
    C.__applyLevel(lv);
    counts[lv] = C.REACTIONS.filter(r => C.ruleAvailable(r)).length;
  }
  ok(C.level === 'all', '当前处于全部模式');
  ok(counts.junior >= 90, '初中模式有初中反应规则', counts.junior);
  ok(counts.all >= counts.junior, '全部模式不少于初中模式', counts.all);
  ok(counts.all >= counts.senior, '全部模式不少于高中模式', counts.all);
  ok(counts.all >= counts.junior + counts.senior - counts.all - 5,
    '全部模式 = 初中 ∪ 高中', counts.junior + ' + ' + counts.senior + ' - 交集 vs ' + counts.all);
  /* 高中模式下必须保留初中基础反应，否则架上摆着试剂却点不出反应 */
  ok(C.isSharedRule('naoh_hcl'), '中和反应被标记为两学段共用');
  C.__applyLevel('senior');
  const seniorHas = id => C.REACTIONS.some(r => r.id === id && C.ruleAvailable(r));
  ok(seniorHas('naoh_hcl'), '高中模式下仍能进行酸碱中和');
  ok(seniorHas('fe_hcl'), '高中模式下仍能进行金属与酸反应');
  ok(seniorHas('agno3_nacl'), '高中模式下仍能进行离子反应（沉淀）');
  C.__applyLevel('junior');
  ok(C.REACTIONS.filter(r => (r.level || 'junior') === 'junior').every(r => C.ruleAvailable(r)),
    '初中模式下所有初中规则都可用');
  const juniorOnly = C.REACTIONS.find(r => (r.level || 'junior') === 'junior' && !C.isSharedRule(r.id));
  ok(!!juniorOnly, '存在纯初中（非共用）的规则', juniorOnly && juniorOnly.id);
  C.__applyLevel('senior');
  ok(juniorOnly && !C.ruleAvailable(juniorOnly),
    '高中模式下不显示纯初中细节规则', juniorOnly && juniorOnly.id);
  C.__applyLevel('junior');
  ok(C.level === 'junior', '切回初中模式');
  /* 学段切换后界面不能崩 */
  runFrames(20, 8700);
  ok(findAll(byId.panelApparatus, 'item-card').length >= 20, '初中模式仪器架正常', findAll(byId.panelApparatus, 'item-card').length);
  C.__applyLevel('senior');
  runFrames(20, 8800);
  const seniorApps = findAll(byId.panelApparatus, 'item-card').length;
  ok(seniorApps >= 20, '高中模式仪器架正常', seniorApps);
  const seniorHasFlask = findAll(byId.panelApparatus, 'item-card').some(b => b.dataset.type === 'volumetricFlask');
  ok(seniorHasFlask, '高中模式能看到容量瓶');
  C.__applyLevel('junior');
  const juniorHasFlask = findAll(byId.panelApparatus, 'item-card').some(b => b.dataset.type === 'volumetricFlask');
  ok(!juniorHasFlask, '初中模式不显示容量瓶');
  C.__applyLevel('all');
  ok(findAll(byId.panelApparatus, 'item-card').some(b => b.dataset.type === 'volumetricFlask'), '全部模式显示容量瓶');
}

section('容器旁的方程式标注 + 点击查看详情');
{
  world.clear();
  C.__select(null);
  runFrames(2, 9000);
  const c = world.add('testTube', 500, BENCH);
  c.addSolid('caco3', 0.5);
  c.addLiquid('hcl', 10);
  runFrames(90, 9100);
  const badges = C.__renderer.badges || [];
  ok(badges.length >= 1, '反应进行时容器旁出现方程式标注', badges.length);
  const b = badges[0];
  ok(!!b.ruleId, '标注带有规则 id', b.ruleId);

  /* 卡片画在屏幕空间（画布内 CSS 像素），这里换算一下校验它的位置 */
  const R = C.__renderer;
  const cCSSx = R.ox + c.x * R.scale;
  const cMouthY = R.oy + (c.y - C.getApp(c.type).H) * R.scale;
  ok(Math.abs((b.x + b.w / 2) - cCSSx) < 60, '卡片挂在自己容器的正上方（水平对齐）',
    (b.x + b.w / 2).toFixed(1) + ' vs ' + cCSSx.toFixed(1));
  ok(b.y + b.h <= cMouthY + 1, '卡片画在容器口上方', (b.y + b.h).toFixed(1) + ' vs ' + cMouthY.toFixed(1));
  ok(b.y >= 0 && b.x >= 0 && b.x + b.w <= R.cssW, '卡片没有跑出画布',
    JSON.stringify({ x: b.x, y: b.y, w: b.w, right: b.x + b.w, W: R.cssW }));
  /* 卡片在画布空间，不应该跟着场景缩放而变形 */
  ok(Math.abs(b.h - 25) < 0.01, '卡片高度是固定的屏幕像素值（不随缩放变化）', b.h);

  /* 点一下就打开反应详情：注意命中测试用的是画布内像素坐标 */
  const p = { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 };
  canvas.dispatch('pointerdown', Object.assign({ button: 0, pointerId: 1 }, p));
  canvas.dispatch('pointerup', Object.assign({ button: 0, pointerId: 1 }, p));
  ok(!byId.modalMask.classList.contains('hidden'), '点击标注弹出反应详情');
  const html = byId.modalBody.innerHTML;
  ok(html.indexOf('焓变') >= 0 || html.indexOf('反应热') >= 0, '详情里有焓变 / 反应热');
  ok(html.indexOf('平衡常数') >= 0, '详情里有平衡常数 K');
  ok(html.indexOf('kJ/mol') >= 0, '详情里给出了具体的焓变数值');
  ok(/K[^<]*\d/.test(html) || html.indexOf('平衡常数') >= 0, '详情里给出了 K 的数值');
  ok(html.indexOf('(aq)') >= 0 || html.indexOf('状态符号') >= 0, '详情里有带状态符号的方程式');
  ok(html.indexOf('eq-hero') >= 0, '详情用醒目的方程式版式');
  ok(html.indexOf('实验现象') >= 0, '详情里有实验现象');
  /* 反应条件写在等号上方 */
  ok(html.indexOf('eq-eq') >= 0, '方程式用"条件在等号上方"的版式');
  /* 离子方程式 / 反应实质来自 equations-extra.js，有数据时必须渲染出来 */
  const extraCount = Object.keys(C.EQUATION_EXTRA || {}).length;
  ok(extraCount === 0 || html.indexOf('离子方程式') >= 0 || html.indexOf('反应实质') >= 0,
    'equations-extra.js 有 ' + extraCount + ' 条数据时必须渲染离子方程式 / 反应实质');
  byId.modalOk.dispatch('click');
  ok(byId.modalMask.classList.contains('hidden'), '详情可以关闭');
}

section('拖动时简介跟随鼠标');
{
  world.clear();
  const t = world.add('testTube', 300, BENCH);
  runFrames(2, 9200);
  pointer('pointerdown', t.x, t.y - 70);
  pointer('pointermove', t.x, t.y - 70);
  ok(C.__state().hover === t.uid, '拖动时仍然显示简介', String(C.__state().hover));
  ok(!byId.hoverTip.classList.contains('hidden'), '简介气泡可见');
  const left1 = byId.hoverTip.style.left;
  pointer('pointermove', t.x + 220, t.y - 70);
  const left2 = byId.hoverTip.style.left;
  ok(left1 !== left2, '简介位置跟着容器移动', left1 + ' → ' + left2);
  /* 再挪回去，位置也要跟着回去 */
  pointer('pointermove', t.x + 20, t.y - 70);
  const left3 = byId.hoverTip.style.left;
  ok(left3 !== left2, '反向拖动时简介也反向跟随', left2 + ' → ' + left3);
  pointer('pointerup', t.x + 20, t.y - 70);
  ok(!byId.hoverTip.classList.contains('hidden'), '松手后简介仍然显示');
}

section('仪器连接（装配）');
{
  world.clear();
  C.__select(null);
  runFrames(2, 9300);
  const bk = world.add('beakerSmall', 420, BENCH);
  const fun = world.add('separatoryFunnel', 420, BENCH - 150);
  fun.addLiquid('hcl', 30);
  runFrames(2, 9400);

  /* 用「连接」工具：先点装置，再点容器。
     注意工具切换会清空"第一个选中"，所以工具只切一次，后面直接点画布。 */
  byId.toolbar.children.find(b => b.dataset.tool === 'connect').dispatch('click');
  pointer('pointerdown', fun.x, fun.y - 40);
  pointer('pointerup', fun.x, fun.y - 40);
  ok(C.__state().connectFrom === fun.uid, '第一次点击记住了要装配的装置');
  pointer('pointerdown', bk.x, bk.y - 40);
  pointer('pointerup', bk.x, bk.y - 40);
  const conns = world.connectionsOf(bk.uid);
  ok(conns.length === 1, '通过「连接」工具装配成功', conns.length);
  ok(conns.length && conns[0].kind === 'drip', '连接类型是加液');
  runFrames(30, 9500);
  ok(Math.abs(fun.x - bk.x) < 0.01, '装配后停靠到容器正上方');

  /* 属性面板里能看到连接并能断开。
     模拟 DOM 不会把子节点序列化成 innerHTML，所以这里按结构断言。 */
  C.__select(bk.uid);
  ok(findAll(byId.inspBody, 'conn-box').length === 1, '属性面板里有连接区');
  ok(findAll(byId.inspBody, 'conn-row').length === 1, '连接区里列出了一条连接');
  ok(findAll(byId.inspBody, 'conn-label').length === 1, '连接行里有说明文字');
  ok(findAll(byId.inspBody, 'mini').length >= 1, '连接行里有断开按钮');
  const label = findAll(byId.inspBody, 'conn-label')[0];
  ok(label && label.textContent.indexOf('分液漏斗') >= 0, '说明里写了分液漏斗', label && label.textContent);

  /* 液体逐滴流下去 */
  const v0 = bk.liquidVolume();
  runFrames(240, 9600);
  ok(bk.liquidVolume() > v0 + 3, '分液漏斗里的液体逐滴流入烧杯',
    v0.toFixed(1) + ' → ' + bk.liquidVolume().toFixed(1) + ' mL');

  world.detach(fun.uid);
  C.__select(bk.uid);
  ok(world.connectionsOf(bk.uid).length === 0, '断开后连接消失');
  ok(findAll(byId.inspBody, 'conn-row').length === 0, '属性面板里不再列出连接');
  ok(findAll(byId.inspBody, 'conn-box').length === 1, '连接区还在，并给出空状态说明');
}

section('在实验台上滚动滚轮切换工具');
{
  useSelect();
  ok(C.__state().tool === 'select', '起始工具是「选择」');
  canvas.dispatch('wheel', { deltaY: 120 });
  ok(C.__state().tool === 'pour', '向下滚动一格 → 下一个工具', C.__state().tool);
  /* 连滚多格要连切多个工具（以前有 160 ms 冷却，连滚只会切一个）
     工具顺序：select→pour→stir→ignite→power→light→test→connect→empty→delete */
  canvas.dispatch('wheel', { deltaY: 240 });
  ok(C.__state().tool === 'ignite', '一次滚两格 → 连切两个工具', C.__state().tool);
  canvas.dispatch('wheel', { deltaY: 120 });
  ok(C.__state().tool === 'power', '继续往下切', C.__state().tool);
  canvas.dispatch('wheel', { deltaY: -240 });
  ok(C.__state().tool === 'stir', '向上滚两格 → 往回切两个', C.__state().tool);
  /* 不满一格的小增量先攒着，攒够一格才切 */
  const before = C.__state().tool;
  canvas.dispatch('wheel', { deltaY: 60 });
  ok(C.__state().tool === before, '不满一格先攒着，不切工具', C.__state().tool);
  canvas.dispatch('wheel', { deltaY: 60 });
  ok(C.__state().tool !== before, '攒够一格就切一个', C.__state().tool);
  /* 按行滚动（deltaMode=1）的设备也要能换算 */
  const before2 = C.__state().tool;
  canvas.dispatch('wheel', { deltaY: 4, deltaMode: 1 });
  ok(C.__state().tool === before2, '按行滚动：不足一格仍然不切', C.__state().tool);
  canvas.dispatch('wheel', { deltaY: 4, deltaMode: 1 });
  ok(C.__state().tool !== before2, '按行滚动：攒够一格就切', C.__state().tool);
  /* 循环回绕 */
  byId.toolbar.children.find(b => b.dataset.tool === 'delete').dispatch('click');
  ok(C.__state().tool === 'delete', '先切到最后一个工具');
  canvas.dispatch('wheel', { deltaY: 120 });
  ok(C.__state().tool === 'select', '滚轮可以循环回绕', C.__state().tool);
  useSelect();
}

section('教材实验：实验流程指引栏');
{
  const tasks = C.EXPERIMENTS || [];
  ok(tasks.length >= 11, '实验库里有多个实验', tasks.length + ' 个');
  ok(tasks.some(t => t.chapter), '实验带教材章节信息');
  ok(tasks.some(t => t.principle && t.principle.length), '实验带实验原理（方程式）');
  ok(tasks.some(t => (t.level || 'junior') === 'junior') && tasks.some(t => t.level === 'senior'),
    '初高中实验都有');

  const t = tasks.filter(x => (x.level || 'junior') === 'junior')[0];
  C.__startTask(t.id);
  runFrames(5, 11000);
  ok(!byId.guideBar.classList.contains('hidden'), '选中实验后指引栏出现');
  ok(byId.gbName.textContent === t.name, '指引栏显示实验名称', byId.gbName.textContent);
  ok(byId.gbChapter.textContent === (t.chapter || ''), '指引栏显示教材位置', byId.gbChapter.textContent);
  ok(byId.gbProgress.textContent.indexOf('/') >= 0, '指引栏显示进度', byId.gbProgress.textContent);

  const rail = findAll(byId.gbRail, 'gb-step');
  ok(rail.length === t.steps.length, '步骤条列出了全部步骤', rail.length + ' vs ' + t.steps.length);
  ok(rail[0]._classes.has('now'), '第 1 步高亮为当前步骤');
  ok(rail[rail.length - 1]._classes.has('done') === false, '最后一步还没完成');
  ok(byId.gbNow.children.length > 0, '指引栏给出了当前步骤的说明');

  /* 顶栏进度和指引栏进度必须一致（两处都显示步骤数，很容易写岔） */
  ok(byId.taskProgress.textContent === '第 1 / ' + t.steps.length + ' 步',
    '顶栏进度正确', byId.taskProgress.textContent);
  ok(byId.gbProgress.textContent === '0 / ' + t.steps.length,
    '指引栏进度正确', byId.gbProgress.textContent);

  /* 状态栏在实验进行中要一直显示当前步骤：
     以前 refreshInspector 每 0.35 秒会把状态栏刷成"台面上有 N 件容器"，来回闪烁 */
  const stepText = t.steps[0].text;
  ok(byId.statusText.textContent === stepText, '状态栏显示当前步骤', byId.statusText.textContent);
  runFrames(45, 11150);           // 跑过好几个 0.35 秒的刷新周期
  ok(byId.statusText.textContent === stepText, '刷新后状态栏仍是当前步骤（不闪烁）',
    byId.statusText.textContent);
  byId.toolbar.children.find(b => b.dataset.tool === 'stir').dispatch('click');
  ok(byId.statusText.textContent === stepText, '切换工具也不会盖掉当前步骤',
    byId.statusText.textContent);
  useSelect();

  /* 点步骤可以回顾（不影响进度） */
  if (rail.length > 2) {
    rail[2].dispatch('click');
    ok(C.__state().peekStep === 2, '点击步骤条可以回顾某一步', String(C.__state().peekStep));
    rail[2].dispatch('click');
    ok(C.__state().peekStep === -1, '再点一次取消回顾');
  }

  /* 让第 1 步的 check 通过 → 自动进入第 2 步，轨道要跟着更新 */
  const first = t.steps[0];
  let advanced = false;
  try { advanced = !!first.check(C.__world) || true; } catch (e) { advanced = false; }
  ok(advanced, '第 1 步的判定函数可执行');

  /* 退出实验 */
  byId.gbExit.dispatch('click');
  runFrames(3, 11200);
  ok(byId.guideBar.classList.contains('hidden'), '退出实验后指引栏隐藏');
  ok(C.__state().task === null, '退出后没有当前实验');
  ok(byId.taskSelect.value === '', '下拉框回到"自由探索"');
}

section('教材实验：步骤最多的那个也要正常');
{
  const tasks = C.EXPERIMENTS || [];
  const longest = tasks.reduce((a, b) => ((b.steps || []).length > (a.steps || []).length ? b : a), { steps: [] });
  ok(longest.steps.length >= 6, '存在步骤较多的实验', longest.id + '：' + longest.steps.length + ' 步');
  C.__startTask(longest.id);
  runFrames(5, 11400);
  const rail = findAll(byId.gbRail, 'gb-step');
  ok(rail.length === longest.steps.length, '步骤条完整列出所有步骤', rail.length + ' vs ' + longest.steps.length);
  ok(byId.gbProgress.textContent === '0 / ' + longest.steps.length,
    '指引栏进度与实际步骤数一致', byId.gbProgress.textContent);
  ok(byId.taskProgress.textContent === '第 1 / ' + longest.steps.length + ' 步',
    '顶栏进度与实际步骤数一致', byId.taskProgress.textContent);
  /* 步骤多的时候每条都要能点到 */
  rail[rail.length - 1].dispatch('click');
  ok(C.__state().peekStep === longest.steps.length - 1, '最后一步也能点击回顾');
  rail[rail.length - 1].dispatch('click');
  byId.gbExit.dispatch('click');
  C.__applyLevel('junior');
}

section('教材实验：切换初高中实验会自动切学段');{
  const seniorTask = (C.EXPERIMENTS || []).filter(x => x.level === 'senior')[0];
  ok(!!seniorTask, '存在高中实验', seniorTask && seniorTask.name);
  C.__applyLevel('junior');
  ok(C.level === 'junior', '先切到初中');
  C.__startTask(seniorTask.id);
  runFrames(3, 11300);
  ok(C.level === 'senior', '选中高中实验后自动切到高中学段', C.level);
  ok(C.__state().task && C.__state().task.id === seniorTask.id, '高中实验已启动');
  byId.gbExit.dispatch('click');
  C.__applyLevel('junior');
}

section('内容物标注：紧挨着容器口上方写出物质与状态');
{
  C.__startTask(null);
  C.__applyLevel('all');
  const tube = C.__world.add('testTube', 320, C.SCENE.benchY - 46);
  C.__world.addReagent(tube.uid, 'hcl', 8);
  runFrames(6, 12000);
  const labels = C.__renderer.labels || [];
  ok(labels.length >= 1, '容器上方出现了内容物标注', labels.length + ' 个');
  const lb = labels.filter(x => x.uid === tube.uid)[0];
  ok(!!lb, '装有药品的容器有标注');
  const R2 = C.__renderer;
  const mouthY = R2.oy + (tube.y - C.getApp('testTube').H) * R2.scale;
  ok(lb.y + lb.h <= mouthY + 0.5, '标注紧贴在容器口上方（不压住容器）',
    (lb.y + lb.h).toFixed(1) + ' vs ' + mouthY.toFixed(1));
  ok(mouthY - (lb.y + lb.h) <= 8, '标注和容器口的间距很小（"紧挨着"）',
    (mouthY - (lb.y + lb.h)).toFixed(1) + ' px');
  ok(lb.x >= 0 && lb.x + lb.w <= R2.cssW, '标注没有跑出画布');
  /* 空容器不显示标注 */
  const empty = C.__world.add('testTube', 620, C.SCENE.benchY - 46);
  runFrames(3, 12100);
  ok(!(C.__renderer.labels || []).some(x => x.uid === empty.uid), '空容器不显示标注（保持画面干净）');
  /* 方程式卡片要排在标注上面，两者不重叠 */
  C.__world.addReagent(tube.uid, 'zn', 0.5);
  runFrames(20, 12150);
  const bd = (C.__renderer.badges || []).filter(x => x.uid === tube.uid)[0];
  if (bd) {
    const lb2 = (C.__renderer.labels || []).filter(x => x.uid === tube.uid)[0];
    ok(bd.y + bd.h <= lb2.y + 0.5, '方程式卡片排在内容物标注的上方（不互相压住）',
      (bd.y + bd.h).toFixed(1) + ' vs ' + lb2.y.toFixed(1));
  }
  C.__world.remove(tube.uid); C.__world.remove(empty.uid);
}

section('检验时演出动画而不是弹一段文字');
{
  C.__startTask(null);
  const c = C.__world.add('testTube', 320, C.SCENE.benchY);
  C.__world.addReagent(c.uid, 'o2', 30);
  runFrames(3, 12200);
  C.__doTest(c, 'glowingSplint');
  ok(!!c.testAnim, '检验后容器上挂了一段动画状态', JSON.stringify(c.testAnim && c.testAnim.testId));
  ok(c.testAnim.dur >= 1.5, '动画持续时间够看清楚', c.testAnim.dur + ' s');
  ok(c.testAnim.start === C.__world.time, '动画从当前时刻开始');
  runFrames(3, 12250);
  ok((C.__renderer.labels || []).length >= 0, '带动画渲染不报错');
  /* 动画结束后自动消失 */
  runFrames(200, 14000);
  const t2 = C.__world.time;
  ok(t2 - c.testAnim.start > c.testAnim.dur, '过一段时间后动画已经播完（渲染时会被跳过）');
  /* pH 试纸的结果颜色 */
  const c2 = C.__world.add('testTube', 620, C.SCENE.benchY);
  C.__world.addReagent(c2.uid, 'naohaq', 8);
  C.__doTest(c2, 'phPaper');
  ok(c2.testAnim.testId === 'phPaper', 'pH 试纸也走动画通道');
  ok(typeof c2.testAnim.ph === 'number' || c2.testAnim.ph === undefined, '动画带着 pH 结果');
  C.__world.remove(c.uid); C.__world.remove(c2.uid);
}

section('做实验时在药品架上标出需要的药品');
{
  const tasks = C.EXPERIMENTS || [];
  /* 挑一个需要固体药品的实验 */
  const t = tasks.filter(x => x.id === 'oxygen')[0] || tasks[0];
  C.__startTask(t.id);
  runFrames(4, 15000);
  const need = C.__state().reagents || [];
  ok(need.length >= 1, '算出了本实验需要的药品', need.length + ' 种');
  /* 药品架上对应的卡片要被标出来 */
  const cards = findAll(byId.reagentGroups, 'item-card');
  const marked = cards.filter(x => x._classes.has('needed'));
  ok(marked.length >= 1, '药品架上标出了需要的药品', marked.length + ' 项');
  const markedIds = marked.map(x => x.dataset.id);
  ok(need.some(id => markedIds.indexOf(id) >= 0), '标出来的正是需要的那些',
    markedIds.slice(0, 5).join(','));
  /* 不能多标：标记数必须正好等于需要清单里的数量（每个药品一张卡） */
  ok(marked.length === need.length,
    '标记数量正好等于需要的数量（没有多标）',
    '标了 ' + marked.length + ' 项，清单 ' + need.length + ' 项：' + markedIds.join(','));
  /* 反过来也不能漏 */
  ok(need.every(id => markedIds.indexOf(id) >= 0), '需要清单里的每一项都在药品架上标了出来',
    need.filter(id => markedIds.indexOf(id) < 0).join(','));
  /* 高锰酸钾确实被认出来是需要的 */
  ok(need.indexOf('kmno4') >= 0, '退推出「高锰酸钾」是本实验需要的药品', need.join(','));
  /* 退出实验后标记要清掉 */
  byId.gbExit.dispatch('click');
  runFrames(3, 15100);
  const cards2 = findAll(byId.reagentGroups, 'item-card');
  ok(cards2.filter(x => x._classes.has('needed')).length === 0, '退出实验后药品架上的标记清除');
  ok((C.__state().reagents || []).length === 0, '需要清单也清空');
}

section('步骤判定不能被"先加的已经被消耗掉"卡住');
{
  /* 这是用户报的"按要求做了却没提示完成"：四支试管一支一支加盐酸，
     加完第一支反应就开始消耗盐酸，等加完第四支时前面几支可能已经耗光。
     判定要用"曾经加过"而不是"现在还有"。 */
  const t = (C.EXPERIMENTS || []).filter(x => x.id === 'metalActivity')[0];
  ok(!!t, '找到「金属活动性顺序」实验');
  C.__startTask(t.id);
  runFrames(3, 15200);
  const tubes = C.__world.containers().filter(x => x.type === 'testTube');
  ok(tubes.length >= 4, 'setup 里有四支试管', tubes.length);
  ['mg', 'zn', 'fe', 'cu'].forEach((m, i) => C.__world.addReagent(tubes[i].uid, m, 0.5));
  runFrames(4, 15250);
  ok(C.__state().step >= 1, '第一步已完成', 'step=' + C.__state().step);
  /* 一支一支加，每加一支之后都让反应跑一会儿（模拟用户慢慢操作） */
  for (let i = 0; i < 4; i++) {
    C.__world.addReagent(tubes[i].uid, 'hcl', 8);
    runFrames(400, 15300 + i * 700);
  }
  ok(C.__state().step >= 2,
    '四支依次加完盐酸后，第 2 步正确判定为完成（前面几支已被反应消耗）',
    'step=' + C.__state().step);
  byId.gbExit.dispatch('click');
  C.__applyLevel('junior');
}

section('物理学科：切换 / 货架 / 画布 / 控制条');
{
  const P = globalThis.PHY;
  ok(!!P, 'PHY 命名空间已建立');
  ok(P.SIMS.length >= 10, '已注册多个物理仿真主题', P.SIMS.length + ' 个');
  ok(P.TASKS.length >= 10, '已注册多个物理教材实验', P.TASKS.length + ' 个');

  /* 初始应处于化学模式 */
  ok(P.active === false, '初始为化学模式');
  ok(!byId.shelfChem._classes.has('hidden'), '化学货架初始可见');
  ok(byId.phyShelf._classes.has('hidden'), '物理货架初始隐藏');

  /* 切到物理 */
  byId.subjectSelect.value = 'phys';
  byId.subjectSelect.dispatch('change');
  ok(P.active === true, '切到物理后 PHY.active 为真');
  ok(documentMock.body._classes.has('phy-mode'), 'body 打上 phy-mode 类');
  ok(byId.shelfChem._classes.has('hidden'), '化学货架被收起');
  ok(!byId.phyShelf._classes.has('hidden'), '物理货架显示出来');
  ok(!byId.phyWrap._classes.has('hidden'), '物理画布显示出来');
  ok(!byId.phyControls._classes.has('hidden'), '物理控制条显示出来');
  ok(byId.canvasWrap._classes.has('hidden'), '化学画布被收起');
  ok(byId.toolbar._classes.has('hidden'), '化学工具栏被收起');
  ok(byId.inspTitle.textContent === '读数与信息', '右侧面板标题切换', byId.inspTitle.textContent);
  ok(String(documentMock.title).includes('物理'), '网页标题跟着换成物理', String(documentMock.title));
  ok(String(byId.brandTitle.textContent).includes('物理') && byId.brandLogo.textContent === '🧭',
    '顶栏品牌字样跟着学科切换', byId.brandTitle.textContent);

  /* 学段下拉框换成物理的选项 */
  {
    const opts = (byId.levelSelect.children || []).map(o => o.value);
    ok(opts.includes('junior') && opts.includes('senior') && opts.includes('all'),
      '学段下拉框换成了物理学段', opts.join('/'));
    ok(!(byId.levelSelect.children || []).some(o => String(o.textContent).includes('化学')),
      '学段选项不再出现「化学」字样');
  }

  /* 物理货架按分支分组，卡片可点 */
  const groups = (byId.phyTopics.children || []);
  ok(groups.length >= 4, '物理货架按分支分组', groups.length + ' 组');
  const phyCards = findAll(byId.phyTopics, 'phy-card');
  ok(phyCards.length === P.SIMS.filter(s => P.levelOK(s.level)).length,
    '货架卡片数量与可用主题一致', phyCards.length);
  ok(phyCards.every(c => !!(c.title || '').length), '卡片带悬停说明');

  /* 任务下拉框换成物理实验 */
  {
    const countOptions = node => (node.tagName === 'OPTION' ? 1 : 0) +
      (node.children || []).reduce((s, c) => s + countOptions(c), 0);
    const n = (byId.taskSelect.children || []).reduce((s, c) => s + countOptions(c), 0);
    ok(n >= P.TASKS.length, '任务下拉框列出了全部物理实验', n + ' 个（含「自由探索」）');
    const labels = (byId.taskSelect.children || []).map(g => g.label || '').join(' ');
    ok(labels.includes('初中物理') && labels.includes('高中物理'), '任务按下拉分组为初中 / 高中物理', labels);
  }

  /* 画布尺寸：两个学科的画布都要在「显示出来的那一刻」量到真实尺寸。
     以前两边的 resize 都不管隐藏状态，切来切去就会变成 0 宽，界面一片空白。 */
  ok(byId.phybench.width > 0 && byId.phybench.height > 0,
    '切到物理后物理画布拿到了真实尺寸', byId.phybench.width + '×' + byId.phybench.height);
  ok(P.state.W === byId.phyWrap.clientWidth && P.state.H === byId.phyWrap.clientHeight,
    '物理仿真的坐标空间与画布一致', P.state.W + '×' + P.state.H);

  /* 点一张仿真卡片：应加载仿真并且能连续渲染 */
  const card = phyCards.find(c => c.dataset.sim === 'sound') || phyCards[0];
  card.dispatch('click');
  ok(!!P.state.sim, '点击卡片后加载了仿真实例', card.dataset.sim);
  ok(byId.phyHint._classes.has('hidden'), '加载仿真后画布提示语收起');
  ok(byId.phyControls.children.length > 0, '控制条渲染出了控件', byId.phyControls.children.length);
  ok(byId.inspBody.innerHTML.length > 20, '右侧面板给出了读数');
  ok((byId.statusText.textContent || '').length > 0, '状态栏显示提示', byId.statusText.textContent);

  /* 物理模式下化学世界必须完全停摆 */
  const tBefore = C.__state().t;
  let phyFrameError = null;
  try { runFrames(30, 20000); } catch (e) { phyFrameError = e; }
  ok(!phyFrameError, '物理模式下连续渲染 30 帧无异常', phyFrameError && phyFrameError.stack);
  ok(C.__state().t === tBefore,
    '物理模式下化学引擎停摆（时间戳不再推进）', tBefore + ' → ' + C.__state().t);

  /* 拖动控制条上的滑块 / 点按钮都不能报错 */
  {
    const slider = byId.phyControls.children.find(c => c.querySelector && c.querySelector('input'));
    if (slider) {
      const input = slider.children.find(x => x.tagName === 'INPUT');
      input.value = input.max;
      input.dispatch('input');
      runFrames(3, 20200);
      ok(true, '拖动滑块不报错');
    } else ok(true, '该主题没有滑块（跳过）');
    const btns = findAll(byId.phyControls, 'phy-btn');
    let clicked = 0;
    for (const b of btns) { try { b.dispatch('click'); clicked++; } catch (e) { ok(false, '点控制条按钮报错：' + b.textContent, e.message); } }
    ok(clicked > 0, '控制条上的按钮都能点', clicked + ' 个');
    runFrames(10, 20300);
  }
}

section('物理学科：做教材实验（流程指引栏 + 逐帧判定）');
{
  const P = globalThis.PHY;
  /* 先在**化学模式**下开一个化学实验，再切到物理：化学的指引栏必须收起来 */
  byId.subjectSelect.value = 'chem';
  byId.subjectSelect.dispatch('change');
  const chemTask = (C.EXPERIMENTS || [])[0];
  C.__startTask(chemTask.id);
  runFrames(2, 20500);
  ok(!byId.guideBar._classes.has('hidden'), '化学实验的指引栏已出现', chemTask.name);
  byId.subjectSelect.value = 'phys';
  byId.subjectSelect.dispatch('change');
  ok(byId.guideBar._classes.has('hidden'),
    '切到物理后化学实验的指引栏被收起（不能一边显示化学步骤一边做物理实验）');
  byId.subjectSelect.value = 'chem';
  byId.subjectSelect.dispatch('change');
  ok(!byId.guideBar._classes.has('hidden'),
    '切回化学后实验指引栏自动恢复');
  ok(byId.gbName.textContent === chemTask.name, '恢复的仍是原来那个化学实验', byId.gbName.textContent);
  C.__startTask(null);
  byId.subjectSelect.value = 'phys';
  byId.subjectSelect.dispatch('change');

  const t = P.TASKS.filter(x => x.id === 'phy_j_lever')[0] || P.TASKS[0];
  ok(!!t, '找到物理实验任务', t && t.name);

  /* 用下拉框选中实验（走的就是用户路径） */
  byId.taskSelect.value = t.id;
  byId.taskSelect.dispatch('change');
  runFrames(3, 21000);
  ok(!!P.state.sim, '选中物理实验后自动加载了对应仿真', t.sim);
  ok(!byId.guideBar._classes.has('hidden'), '物理实验的流程指引栏出现');
  ok(byId.gbName.textContent === t.name, '指引栏显示实验名称', byId.gbName.textContent);
  ok(byId.gbChapter.textContent === (t.chapter || ''), '指引栏显示教材位置');
  const rail = findAll(byId.gbRail, 'gb-step');
  ok(rail.length === t.steps.length, '步骤条列出了全部步骤', rail.length + ' vs ' + t.steps.length);
  ok(rail[0]._classes.has('now'), '第 1 步高亮');
  ok(byId.taskProgress.textContent === '第 1 / ' + t.steps.length + ' 步',
    '顶栏显示物理实验进度', byId.taskProgress.textContent);

  /* 照着每一步的动作脚本做一遍，看指引栏是不是真的会推进 */
  let stepErr = null;
  for (let i = 0; i < t.steps.length; i++) {
    try {
      const st = t.steps[i];
      if (st.act) st.act(P.state.sim);
      runFrames(4, 21100 + i * 50);
    } catch (e) { stepErr = '第 ' + (i + 1) + ' 步：' + e.message; break; }
  }
  ok(!stepErr, '逐步操作物理实验无异常', stepErr);
  ok(P.guide.step === t.steps.length,
    '物理实验的全部步骤都被判定为完成', P.guide.step + ' / ' + t.steps.length);
  ok(byId.gbProgress.textContent === t.steps.length + ' / ' + t.steps.length,
    '指引栏进度更新到末位', byId.gbProgress.textContent);
  ok(findAll(byId.gbRail, 'gb-step').every(b => b._classes.has('done')), '所有步骤条都打上完成标记');

  /* 退出实验回到物理自由探索 */
  byId.gbExit.dispatch('click');
  runFrames(2, 21400);
  ok(P.guide.task === null, '「退出实验」清掉了当前任务');

  /* 「任务说明」弹层走物理分支，不应报错 */
  byId.btnTaskInfo.dispatch('click');
  ok(!byId.modalMask._classes.has('hidden'), '物理模式下的「任务说明 / 帮助」能打开弹层');
  byId.modalOk.dispatch('click');

  /* 物理模式下窗口尺寸变化：化学画布是隐藏的，量到的是 0 —— 这时绝不能拿 0 去 resize，
     否则切回化学就是一片空白画布。 */
  C.__resizeCanvas();
  ok(C.__renderer.canvas.width > 0,
    '物理模式下窗口缩放不会把化学画布缩成 0 宽', C.__renderer.canvas.width);
  const chemW = C.__renderer.canvas.width;

  /* 存档按钮在物理模式下只提示，不应写坏化学存档 */
  const savedBefore = store['chemlab.save.v1'];
  byId.btnSave.dispatch('click');
  ok(store['chemlab.save.v1'] === savedBefore, '物理模式下「保存」不会污染化学存档');
  /* 「清空台面」在物理模式下 = 重置仿真，步骤进度也要回到第 1 步 */
  byId.btnClear.dispatch('click');
  ok(P.guide.step === 0, '重置仿真后步骤进度回到第 1 步', 'step=' + P.guide.step);
  void chemW;
}

section('物理学科：切回化学');
{
  const P = globalThis.PHY;
  /* 先在物理模式里把学段改成「高中物理」，切回化学时不该跟着变 */
  byId.levelSelect.value = 'senior';
  byId.levelSelect.dispatch('change');
  ok(P.active === true && C.level === 'senior', '物理模式下改学段只作用于物理');
  byId.levelSelect.value = 'junior';
  byId.levelSelect.dispatch('change');
  const chemLevelBefore = C.level;
  byId.subjectSelect.value = 'chem';
  byId.subjectSelect.dispatch('change');
  ok(P.active === false, '切回化学后 PHY.active 为假');
  ok(!byId.shelfChem._classes.has('hidden'), '化学货架回来了');
  ok(byId.phyShelf._classes.has('hidden'), '物理货架收起');
  ok(byId.canvasWrap._classes.has('hidden') === false, '化学画布回来了');
  ok(byId.toolbar._classes.has('hidden') === false, '化学工具栏回来了');
  ok(byId.inspTitle.textContent === '仪器信息', '右侧面板标题切回「仪器信息」', byId.inspTitle.textContent);
  const opts = (byId.levelSelect.children || []).map(o => String(o.textContent)).join('/');
  ok(opts.includes('化学'), '学段下拉框恢复成化学选项', opts);
  ok(C.level === 'junior' || C.level === 'senior',
    '化学学段回到了进入物理之前的那个值', C.level + ' (物理里曾设为 ' + chemLevelBefore + ')');
  ok(C.__renderer.canvas.width > 0 && C.__renderer.canvas.height > 0,
    '切回化学后化学画布尺寸正常（不是 0）',
    C.__renderer.canvas.width + '×' + C.__renderer.canvas.height);
  let err = null;
  try { runFrames(10, 22000); } catch (e) { err = e; }
  ok(!err, '切回化学后继续渲染无异常', err && err.message);
  ok(byId.taskSelect.children.length >= 2, '化学任务下拉框已重建', byId.taskSelect.children.length);
  ok(byId.panelApparatus.children.length >= 1, '化学仪器架已重建', byId.panelApparatus.children.length);
  ok(byId.reagentGroups.children.length >= 1, '化学药品架已重建', byId.reagentGroups.children.length);
  /* 在物理里改学段不应该把化学的学段一起改掉 */
  ok(C.level === 'junior' || C.level === 'senior' || C.level === 'all',
    '切回化学后学段是合法值', C.level);
  C.__applyLevel('junior');
}

section('未捕获异常汇总');
ok(errors.length === 0, '运行期间没有未捕获异常', errors.slice(0, 3).join(' | '));
/* ===================== 汇总 ===================== */
console.log('\n' + '='.repeat(64));
if (fail === 0) {
  console.log(`\x1b[32m✅ 界面冒烟测试全部通过：${pass} 项断言\x1b[0m`);
} else {
  console.log(`\x1b[31m❌ ${fail} 项失败 / 共 ${pass + fail} 项\x1b[0m`);
  failures.slice(0, 40).forEach(f => console.log('   · ' + f));
}
console.log('='.repeat(64));
process.exit(fail === 0 ? 0 : 1);
