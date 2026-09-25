/* =============================================================================
 * 虚拟化学实验室 —— 引擎端到端测试 (Node)
 * -----------------------------------------------------------------------------
 * 只用加载数据层与引擎层（不含渲染 / 界面，那两层依赖浏览器）。
 * 运行：node test/simulate.mjs
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------- 以副作用方式加载传统脚本 ---------- */
const FILES = [
  'js/data/substances.js',
  'js/data/apparatus.js',
  'js/data/reactions.js',
  'js/data/substances-senior.js',
  'js/data/reactions-senior.js',
  'js/data/thermo.js',
  'js/data/equations-extra.js',
  'js/data/reactions-extra.js',
  'js/engine/geometry.js',
  'js/engine/effects.js',
  'js/engine/reaction.js',
  'js/engine/world.js',
  'js/render/draw.js'
];
/* 实验任务文件不手写清单，直接扫目录 —— 手写清单曾经漏掉过新增文件，
   导致测试其实没覆盖到那些实验。 */
{
  const dir = path.join(ROOT, 'js/experiments');
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
    .forEach(f => FILES.push('js/experiments/' + f));
}
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const code = fs.readFileSync(p, 'utf8');
  // 用间接 eval 在全局作用域执行，脚本会挂到 globalThis.CHEM
  (0, eval)(code);
}

const CHEM = globalThis.CHEM;
let pass = 0, fail = 0;
const failures = [];

function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(label + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n\x1b[36m── ' + t + ' ──\x1b[0m'); }

/* =========================================================================
 * 0. 基础数据完整性
 * ====================================================================== */
section('数据完整性');
ok(CHEM.SUBSTANCES.length > 80, '物质数量 > 80', CHEM.SUBSTANCES.length);
ok(CHEM.APPARATUS.length >= 20, '仪器数量 >= 20', CHEM.APPARATUS.length);
ok((CHEM.REACTIONS || []).length >= 60, '反应规则 >= 60', (CHEM.REACTIONS || []).length);
ok((CHEM.TESTS || []).length >= 4, '检验方法 >= 4', (CHEM.TESTS || []).length);

/* 反应条件里引用的催化剂，必须真的能从药品架上取到，
   否则这条规则永远不会被触发（数据能通过校验，但玩不到）。 */
section('催化剂可获取性');
{
  const missing = [];
  for (const r of CHEM.REACTIONS) {
    const cat = r.conditions && r.conditions.catalyst;
    if (!cat) continue;
    const list = CHEM.SUBSTANCES_BY_BASE[cat] || [];
    const obtainable = list.some(s => s.pickable);
    if (!obtainable) missing.push(r.id + ' 需要 ' + cat);
  }
  ok(missing.length === 0, '所有催化剂都能在药品架上取到', missing.join('; '));
}
/* 规则里出现的物质，必须真的存在于物质库 */
section('规则引用完整性');
{
  const bad = [];
  for (const r of CHEM.REACTIONS) {
    for (const b of r.reactants) {
      if (!CHEM.SUBSTANCES_BY_BASE[b]) bad.push(r.id + ' 反应物 ' + b);
    }
    for (const p of r.products) {
      if (!CHEM.getSub(p.id)) bad.push(r.id + ' 生成物 ' + p.id);
    }
  }
  ok(bad.length === 0, '所有规则引用的物质都存在', bad.slice(0, 8).join('; '));
}
/* 学段字段 */
section('学段字段');
{
  const senior = CHEM.REACTIONS.filter(r => r.level === 'senior');
  const junior = CHEM.REACTIONS.filter(r => (r.level || 'junior') === 'junior');
  console.log('  初中规则 ' + junior.length + ' 条，高中规则 ' + senior.length + ' 条，合计 ' + CHEM.REACTIONS.length + ' 条');
  const badLv = CHEM.REACTIONS.filter(r => r.level && ['junior', 'senior', 'both'].indexOf(r.level) < 0);
  ok(badLv.length === 0, 'level 取值合法', badLv.map(r => r.id).join(','));
  const badSub = CHEM.SUBSTANCES.filter(s => s.level && ['junior', 'senior', 'both'].indexOf(s.level) < 0);
  ok(badSub.length === 0, '物质的 level 取值合法', badSub.map(s => s.id).join(','));
}

/* 每个容器都要有 profile 且能算出正确的液面 */
section('仪器几何：液面换算');
CHEM.APPARATUS.filter(a => a.category === 'container').forEach(a => {
  const cap = a.capacity;
  const l0 = CHEM.geometry.levelForVolume(a.type, 0);
  const lh = CHEM.geometry.levelForVolume(a.type, cap / 2);
  const lf = CHEM.geometry.levelForVolume(a.type, cap);
  const vh = CHEM.geometry.volumeAt(a.type, lh);
  ok(l0 === 0, a.name + ' 空容器液面为 0', l0);
  ok(Math.abs(vh - cap / 2) < cap * 0.02, a.name + ' 半量液面反算正确', vh.toFixed(3) + ' vs ' + (cap / 2));
  ok(Math.abs(lf - a.H) < 0.01, a.name + ' 满量液面等于仪器高度', lf.toFixed(3) + ' vs ' + a.H);
  ok(lh > 0 && lh < a.H, a.name + ' 半量液面在中间', lh.toFixed(2));
  // profile 必须是非负有限值
  let bad = false;
  for (let u = 0; u <= a.H; u += a.H / 50) {
    const w = a.profile(u);
    if (!isFinite(w) || w < 0) bad = true;
  }
  ok(!bad, a.name + ' profile 全程有效');
});

/* =========================================================================
 * 0.5 元素守恒（配平）自查
 * ---------------------------------------------------------------------
 * 两个数据校验脚本各自只查自己那一半，这里对**全部**规则再做一次，
 * 这样我自己后来补写的规则也能被立刻发现错误。
 * ====================================================================== */
section('方程式元素守恒');
{
  const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
  function normalize(s) {
    return String(s)
      .replace(/[₀-₉]/g, c => SUB[c])
      .replace(/[↑↓]/g, '')
      .replace(/[（(][^A-Za-z0-9()）]*[）)]/g, '')   // 去掉 (浓) (稀) 这类中文注释
      .replace(/[·⋅]/g, '')                            // 结晶水点号忽略
      .replace(/\s+/g, '');
  }
  /* 解析化学式，返回 {元素: 原子数}；支持括号与嵌套 */
  function parseFormula(str) {
    let i = 0, s = str;
    function readNum() {
      let d = '';
      while (i < s.length && /[0-9]/.test(s[i])) d += s[i++];
      return d ? parseInt(d, 10) : 1;
    }
    function group() {
      const out = {};
      while (i < s.length) {
        const ch = s[i];
        if (ch === '(') {
          i++;
          const inner = group();
          if (s[i] === ')') i++;
          const n = readNum();
          for (const k in inner) out[k] = (out[k] || 0) + inner[k] * n;
        } else if (ch === ')') {
          return out;
        } else if (/[A-Z]/.test(ch)) {
          let el = ch; i++;
          while (i < s.length && /[a-z]/.test(s[i])) el += s[i++];
          const n = readNum();
          out[el] = (out[el] || 0) + n;
        } else {
          i++;                                   // 跳过其他字符
        }
      }
      return out;
    }
    return group();
  }
  function sideAtoms(side) {
    const total = {};
    for (const rawTerm of side.split('+')) {
      const term = rawTerm.trim();
      if (!term) continue;
      const m = term.match(/^(\d*)(.*)$/);
      const coef = m[1] ? parseInt(m[1], 10) : 1;
      const atoms = parseFormula(m[2]);
      for (const k in atoms) total[k] = (total[k] || 0) + atoms[k] * coef;
    }
    return total;
  }
  const unbalanced = [];
  let checked = 0;
  for (const r of CHEM.REACTIONS) {
    /* 指示剂显色之类的规则没有化学方程式（equation 写成 '—'），跳过 */
    if (!r.equation || r.equation === '—' || r.equation.indexOf('=') < 0) continue;
    checked++;
    const eq = normalize(r.equation);
    const parts = eq.split('=');
    if (parts.length !== 2) { unbalanced.push(r.id + ' 方程式结构异常（等号数量 ' + (parts.length - 1) + '）'); continue; }
    const L = sideAtoms(parts[0]), R = sideAtoms(parts[1]);
    const keys = new Set([...Object.keys(L), ...Object.keys(R)]);
    const bad = [];
    for (const k of keys) {
      if ((L[k] || 0) !== (R[k] || 0)) bad.push(k + ' ' + (L[k] || 0) + '≠' + (R[k] || 0));
    }
    if (!Object.keys(L).length || !Object.keys(R).length) bad.push('无法解析');
    if (bad.length) unbalanced.push(r.id + '(' + r.equation + ') → ' + bad.join(', '));
  }
  ok(unbalanced.length === 0, '全部 ' + checked + ' 条化学方程式元素守恒',
    unbalanced.slice(0, 6).join(' | '));
  if (unbalanced.length) unbalanced.slice(0, 20).forEach(x => console.log('    · ' + x));
}

/* =========================================================================
 * 1. 逐条仿真全部反应规则
 * ====================================================================== */
section('全部反应规则逐条仿真');
/* 逐条仿真要覆盖所有规则，所以先切到"全部内容"模式 */
const SAVED_LEVEL = CHEM.level;
CHEM.setLevel('all');
function supply(world, c, base, sub, scale) {
  // 按物质的相加入足量反应物
  const list = CHEM.SUBSTANCES_BY_BASE[base] || [];
  const pick = sub || list.find(x => x.phase === 'solution') || list.find(x => x.phase === 'liquid') || list[0];
  if (!pick) return;
  if (pick.phase === 'gas') c.addGas(pick.id, 150 * (scale || 1));
  else if (pick.phase === 'solid') c.addSolid(pick.id, 3 * (scale || 1));
  else c.addLiquid(pick.id, 30 * (scale || 1));
}

const ruleResults = [];
for (const rule of CHEM.REACTIONS) {
  const world = new CHEM.World();
  const c = world.add('beakerBig', 400, CHEM.SCENE.benchY);
  try {
    for (const b of rule.reactants) supply(world, c, b, null, 1);
    const cond = rule.conditions || {};
    if (cond.catalyst) supply(world, c, cond.catalyst, null, 1);
    if (cond.needsWater && !c.hasWater()) c.addLiquid('h2o', 20);
    if (cond.heat || (cond.minTemp && cond.minTemp > 25)) c.temp = Math.max(c.temp, Math.max(cond.minTemp || 0, 900));
    if (cond.ignite) c.ignited = true;
    if (cond.electricity) c.powered = true;
    if (cond.light) c.lighted = true;

    const before = c.describe();
    // 直接调用反应引擎，避免温度被自然冷却带偏
    for (let i = 0; i < 400; i++) CHEM.Reaction.tick(world, c, 1 / 60);
    const did = !!c.firedRules[rule.id];
    ruleResults.push({ id: rule.id, name: rule.name, did, before });
    ok(did, '规则可触发：' + rule.id + '（' + rule.name + '）', did ? '' : '反应物=' + JSON.stringify(rule.reactants) + ' 条件=' + JSON.stringify(cond));
  } catch (e) {
    ok(false, '规则异常：' + rule.id, e.message);
  }
}
const firedCount = ruleResults.filter(r => r.did).length;
console.log('  可触发规则：' + firedCount + ' / ' + CHEM.REACTIONS.length);
if (firedCount < CHEM.REACTIONS.length) {
  console.log('  未能触发：' + ruleResults.filter(r => !r.did).map(r => r.id).join(', '));
}
CHEM.setLevel(SAVED_LEVEL);

/* =========================================================================
 * 2. 典型实验场景
 * ====================================================================== */
section('典型实验场景');
/* 这些场景横跨初中与高中，统一在"全部内容"模式下跑 */
CHEM.setLevel('all');

/* 见下面 run() 的说明：等待时间统一放大这个倍数 */
const WAIT_SCALE = 3.0;

function run(world, seconds) {
  const dt = 1 / 60;
  /* 反应快慢是可调的（js/engine/reaction.js 里的 SPEED），调慢之后原来按秒写的
     等待时间就不够用了。这里统一乘一个系数，意思是"给这段反应留足时间"，
     而不是严格跑这么多秒。改 SPEED 时同步改这里即可。 */
  const total = seconds * WAIT_SCALE;
  for (let t = 0; t < total; t += dt) world.step(dt);
}
function amt(c, base) { return c.amountOf(base); }function gasAmt(c, base) {
  let v = 0;
  c.gases.forEach(g => { const s = CHEM.getSub(g.id); if (s && s.base === base) v += g.ml; });
  return v;
}

/* --- 2.1 铁与稀盐酸 --- */
{
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY);
  c.addSolid('fe', 0.5);
  c.addLiquid('hcl', 6);
  run(w, 6);
  ok(!!c.firedRules['fe_hcl'], '铁 + 稀盐酸 发生反应');
  ok(amt(c, 'fecl2') > 0.01, '生成氯化亚铁', amt(c, 'fecl2').toFixed(3));
  ok(gasAmt(c, 'h2') > 0.5, '产生氢气', gasAmt(c, 'h2').toFixed(2) + ' mL');
  ok(w.log.some(e => e.equation && e.equation.includes('Fe')), '实验记录里有方程式');
}

/* --- 2.2 大理石 + 稀盐酸，并用石灰水检验 --- */
{
  const w = new CHEM.World();
  const gen = w.add('testTube', 300, CHEM.SCENE.benchY);
  const jar = w.add('testTube', 540, CHEM.SCENE.benchY);
  jar.addLiquid('caoh2aq', 6);
  gen.addSolid('caco3', 0.6);
  gen.addLiquid('hcl', 6);
  const tube = w.add('deliveryTube', 900, CHEM.SCENE.benchY - 260);
  w.connect(tube.uid, gen.uid, jar.uid);
  run(w, 12);
  ok(!!gen.firedRules['caco3_hcl'], '大理石 + 稀盐酸 发生反应');
  ok(gasAmt(gen, 'co2') + gasAmt(jar, 'co2') + amt(jar, 'caco3') > 0.001, '产生了二氧化碳并有一部分留在体系里',
    'CO₂(发生瓶)=' + gasAmt(gen, 'co2').toFixed(2) + ' mL, CO₂(集气瓶)=' + gasAmt(jar, 'co2').toFixed(2) + ' mL');
  ok(!!jar.firedRules['co2_caoh2'], '石灰水变浑浊（CO₂ 通入澄清石灰水）');
  ok(amt(jar, 'caco3') > 0.001, '石灰水中生成碳酸钙沉淀', amt(jar, 'caco3').toFixed(4));
}

/* --- 2.3 酸碱中和 + 酚酞 --- */
{
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY);
  c.addLiquid('naohaq', 5);
  c.addLiquid('phenolphthalein', 2);
  run(w, 2);
  ok(c.tint === '#ff5f9e', '酚酞遇碱变红', String(c.tint));
  const phBefore = CHEM.Reaction.estimatePH(c);
  ok(phBefore > 8, '碱溶液 pH > 8', phBefore.toFixed(2));
  c.addLiquid('hcl', 5);
  run(w, 8);
  ok(!!c.firedRules['naoh_hcl'], '氢氧化钠 + 稀盐酸 发生中和反应');
  ok(amt(c, 'naoh') < 0.02, '氢氧化钠被消耗完', amt(c, 'naoh').toFixed(4));
  ok(c.tint !== '#ff5f9e', '过量盐酸使酚酞红色褪去', String(c.tint));
}

/* --- 2.4 铁与硫酸铜（置换） --- */
{
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY);
  c.addLiquid('cuso4aq', 6);
  c.addSolid('fe', 0.6);
  run(w, 10);
  ok(!!c.firedRules['fe_cuso4'], '铁 + 硫酸铜 发生置换反应');
  ok(amt(c, 'cu') > 0.01, '析出铜', amt(c, 'cu').toFixed(3));
  ok(amt(c, 'feso4') > 0.01, '生成硫酸亚铁', amt(c, 'feso4').toFixed(3));
}

/* --- 2.5 铜与稀盐酸：不反应，且给出解释 --- */
{
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY);
  c.addSolid('cu', 0.5);
  c.addLiquid('hcl', 6);
  run(w, 4);
  const explained = w.log.some(e => e.text && e.text.includes('铜排在氢的后面'));
  ok(explained, '铜与稀盐酸不反应并给出原因');
  ok(gasAmt(c, 'h2') < 0.01, '没有产生氢气');
}

/* --- 2.6 加热高锰酸钾制氧气（需要加热条件） --- */
{
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY - 40);
  const lamp = w.add('alcoholLamp', 300, CHEM.SCENE.benchY);
  c.addSolid('kmno4', 0.4);
  run(w, 2);
  ok(!c.firedRules['kmno4_heat'], '未加热时不分解');
  const hc = w.heatCheck(c);
  ok(hc.ok === false || hc.ok === true, '加热判定可执行');
  lamp.lit = true;
  const hc2 = w.heatCheck(c);
  ok(hc2.ok === true, '试管可直接放在酒精灯火焰上加热', JSON.stringify(hc2));
  run(w, 14);
  ok(c.temp > 100, '试管温度升高', c.temp.toFixed(1));
  ok(!!c.firedRules['kmno4_heat'], '高锰酸钾受热分解');
  ok(gasAmt(c, 'o2') > 0.5, '收集到氧气', gasAmt(c, 'o2').toFixed(2) + ' mL');
}

/* --- 2.6b "高温"反应必须能靠正常加热做到 ---
   有一批反应需要 minTemp=600（石灰石高温分解、铝热反应、高炉炼铁、铁与水蒸气），
   如果干容器的平台温度低于 600，这些反应在游戏里永远做不出来。 */
{
  const HOT = CHEM.REACTIONS.filter(r => r.conditions && r.conditions.minTemp >= 600);
  ok(HOT.length >= 5, '存在需要高温的反应', HOT.length + ' 条');
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY - 46);
  const lamp = w.add('alcoholLamp', 300, CHEM.SCENE.benchY);
  c.addSolid('caco3', 1.0);
  lamp.lit = true;
  run(w, 30);
  ok(c.temp >= 600, '干容器持续加热能达到 600℃ 以上（高温条件可达）', c.temp.toFixed(0) + ' ℃');
  ok(!!c.firedRules['caco3_heat'], '碳酸钙在高温下分解');
  /* 有水时仍然只能到 100℃，不能"假高温"。
     注意要给足水：水烧干之后温度会继续升到上千度，那是正常的，
     所以这里一边断言"温度停在 100℃"，一边断言"容器里还有水"。 */
  const w2 = new CHEM.World();
  const c2 = w2.add('testTube', 300, CHEM.SCENE.benchY - 46);
  const lamp2 = w2.add('alcoholLamp', 300, CHEM.SCENE.benchY);
  c2.addLiquid('h2o', 18);
  lamp2.lit = true;
  run(w2, 12);
  ok(c2.liquidVolume() > 0.5, '容器里还有水（没被烧干）', c2.liquidVolume().toFixed(1) + ' mL');
  ok(c2.temp < 105, '有水时温度停在 100℃ 附近', c2.temp.toFixed(1) + ' ℃');
}

/* --- 2.7 烧杯不垫石棉网加热 → 应被阻止 --- */{
  const w = new CHEM.World();
  const b = w.add('beakerSmall', 400, CHEM.SCENE.benchY);
  const lamp = w.add('alcoholLamp', 400, CHEM.SCENE.benchY);
  lamp.lit = true;
  const h1 = w.heatCheck(b);
  ok(h1.ok === false && h1.reason.includes('石棉网'), '烧杯不垫石棉网不能加热', h1.reason);
  w.add('asbestosNet', 400, CHEM.SCENE.benchY + 2);
  const h2 = w.heatCheck(b);
  ok(h2.ok === true, '垫上石棉网后可以加热');
}

/* --- 2.8 量筒不能加热 --- */
{
  const w = new CHEM.World();
  const g = w.add('graduatedCylinder', 500, CHEM.SCENE.benchY);
  const lamp = w.add('alcoholLamp', 500, CHEM.SCENE.benchY);
  lamp.lit = true;
  const h = w.heatCheck(g);
  ok(h.ok === false && h.reason.includes('不能加热'), '量筒不能加热', h.reason);
}

/* --- 2.9 倾倒：溶质随液体转移，沉淀留下 --- */
{
  const w = new CHEM.World();
  const a = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
  const b = w.add('beakerSmall', 560, CHEM.SCENE.benchY);
  a.addLiquid('cuso4aq', 30);
  a.addSolid('fe', 2);
  run(w, 12);
  const cuBefore = amt(a, 'cu');
  const moved = w.pour(a.uid, b.uid, 0.7);
  ok(moved > 5, '倾倒转移了液体', moved.toFixed(1) + ' mL');
  ok(amt(b, 'cuso4') > 0 || amt(b, 'feso4') > 0, '溶质随液体进入新容器');
  ok(Math.abs(amt(a, 'cu') - cuBefore) < 1e-6, '铜（沉淀/固体）留在原容器');
}

/* --- 2.10 固体溶解 --- */
{
  const w = new CHEM.World();
  const c = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
  c.addLiquid('h2o', 30);
  c.addSolid('cuso4', 2);
  const solidBefore = c.solidMass();
  run(w, 14);
  ok(c.solidMass() < solidBefore * 0.4, '硫酸铜固体逐渐溶解', c.solidMass().toFixed(3) + ' g');
  const hasSol = c.liquids.some(e => { const s = CHEM.getSub(e.id); return s && s.base === 'cuso4'; });
  ok(hasSol, '溶液中出现硫酸铜');
}

/* --- 2.11 检验：氧气与二氧化碳 --- */
{
  const w = new CHEM.World();
  const jarO = w.add('gasJar', 300, CHEM.SCENE.benchY);
  jarO.addGas('o2', 180);
  const r1 = CHEM.Reaction.runTest(jarO, 'glowingSplint');
  ok(r1 && r1.ok === true, '带火星木条在氧气中复燃', JSON.stringify(r1));

  const jarC = w.add('gasJar', 560, CHEM.SCENE.benchY);
  jarC.addGas('co2', 180);
  const r2 = CHEM.Reaction.runTest(jarC, 'glowingSplint');
  ok(r2 && r2.ok === false, '带火星木条在二氧化碳中熄灭', JSON.stringify(r2));
  const r3 = CHEM.Reaction.runTest(jarC, 'burningSplint');
  ok(r3 && r3.result && r3.result.includes('熄灭'), '燃着的木条在二氧化碳中熄灭', r3 && r3.result);
  const r4 = CHEM.Reaction.runTest(jarO, 'burningSplint');
  ok(r4 && r4.ok === true, '燃着的木条在氧气中燃烧更旺');
}

/* --- 2.12 pH 试纸 --- */
{
  const w = new CHEM.World();
  const acid = w.add('testTube', 300, CHEM.SCENE.benchY);
  acid.addLiquid('hcl', 6);
  ok(CHEM.Reaction.estimatePH(acid) < 3, '稀盐酸 pH < 3', CHEM.Reaction.estimatePH(acid).toFixed(2));
  const neut = w.add('testTube', 500, CHEM.SCENE.benchY);
  neut.addLiquid('naclaq', 6);
  ok(Math.abs(CHEM.Reaction.estimatePH(neut) - 7) < 0.3, '氯化钠溶液 pH ≈ 7', CHEM.Reaction.estimatePH(neut).toFixed(2));
  const base = w.add('testTube', 700, CHEM.SCENE.benchY);
  base.addLiquid('naohaq', 6);
  ok(CHEM.Reaction.estimatePH(base) > 11, '氢氧化钠溶液 pH > 11', CHEM.Reaction.estimatePH(base).toFixed(2));
  const r = CHEM.Reaction.runTest(acid, 'phPaper');
  ok(r && r.text, 'pH 试纸有返回结果', r && r.text);
}

/* --- 2.13 量筒容量与溢出 --- */
{
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY);
  const add1 = c.addLiquid('h2o', 100);
  ok(Math.abs(add1 - c.capacity()) < 1e-6, '试管最多只能加入其容积的液体', add1.toFixed(2));
  const add2 = c.addLiquid('h2o', 10);
  ok(add2 === 0, '装满后无法继续加入液体');
}

/* --- 2.14 沸腾与蒸发 --- */
{
  const w = new CHEM.World();
  const c = w.add('evaporatingDish', 300, CHEM.SCENE.benchY - 20);
  const lamp = w.add('alcoholLamp', 300, CHEM.SCENE.benchY);
  c.addLiquid('h2o', 25);
  lamp.lit = true;
  run(w, 25);
  ok(c.temp > 90, '蒸发皿中的水被加热到接近 100℃', c.temp.toFixed(1));
  ok(c.liquidVolume() < 25, '水逐渐蒸发', c.liquidVolume().toFixed(2) + ' mL');
}

/* --- 2.15 取存档往返 --- */
{
  const w = new CHEM.World();
  const c = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
  c.addLiquid('hcl', 10);
  c.addSolid('zn', 1);
  w.add('alcoholLamp', 600, CHEM.SCENE.benchY).lit = true;
  const json = JSON.parse(JSON.stringify(w.toJSON()));
  const w2 = new CHEM.World();
  w2.load(json);
  ok(w2.containers().length === 1, '存档恢复容器数量');
  ok(w2.devices().length === 1, '存档恢复装置数量');
  ok(Math.abs(w2.containers()[0].liquidVolume() - 10) < 1e-6, '存档恢复液体体积');
  ok(w2.devices()[0].lit === true, '存档恢复酒精灯状态');
}

/* --- 2.21 氯气通入碘化钾溶液：碘单质应让溶液显棕黄色 --- */
{
  const w = new CHEM.World();
  const c = w.add('gasJar', 300, CHEM.SCENE.benchY);
  c.addLiquid('ki', 30);
  c.addGas('cl2', 200);
  run(w, 14);
  ok(!!c.firedRules['cl2_ki'], '氯气与碘化钾反应');
  ok(amt(c, 'i2') > 0.1, '生成碘单质', amt(c, 'i2').toFixed(3) + ' mmol');
  const dissolvedI2 = c.liquids.reduce((s, e) => {
    const sub = CHEM.getSub(e.id);
    return s + (sub && sub.base === 'i2' ? e.mmol : 0);
  }, 0);
  ok(dissolvedI2 > 0.03, '碘单质溶解进溶液（微溶物质也会缓慢溶解）', dissolvedI2.toFixed(3) + ' mmol');
  const col = CHEM.liquidColor(c);
  ok(col.color !== '#dcf0ff' && col.color !== '#eaf4ff', '溶液不再是水那样的无色', col.color);
  ok(col.alpha > 0.42, '溶液颜色有足够的存在感', col.alpha.toFixed(2));
}

/* --- 2.22 红棕色气体：NO 遇氧气变 NO2 --- */
{
  const w = new CHEM.World();
  const jar = w.add('gasJar', 300, CHEM.SCENE.benchY);
  jar.addGas('no', 100);
  jar.addGas('o2', 60);
  run(w, 8);
  ok(!!jar.firedRules['no_o2'], '一氧化氮与氧气反应');
  ok(amt(jar, 'no2') > 0.1, '生成二氧化氮', amt(jar, 'no2').toFixed(3) + ' mmol');
  ok(CHEM.getSub('no2').color === '#b5502a', '二氧化氮本身带有红棕色（气体着色会自动用它）');
}

/* --- 2.23 学段隔离必须作用在"引擎"上，而不只是界面上 --- */
{
  const saved = CHEM.level;
  /* 初中模式：高中规则不能触发 */
  CHEM.setLevel('junior');
  {
    const w = new CHEM.World();
    const c = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
    c.addSolid('na', 0.5);
    c.addLiquid('h2o', 40);
    run(w, 10);
    ok(!c.firedRules['na_h2o'], '初中模式下"钠与水"（高中规则）不会触发',
      Object.keys(c.firedRules).join(','));
    ok(CHEM.activeRules().every(r => CHEM.ruleAvailable(r)), '规则表里全部是当前学段的规则');
    ok(CHEM.activeRules().length < CHEM.REACTIONS.length, '初中模式下规则表确实被过滤了',
      CHEM.activeRules().length + ' / ' + CHEM.REACTIONS.length);
    /* 但初中规则照常工作 */
    const c2 = w.add('testTube', 600, CHEM.SCENE.benchY);
    c2.addSolid('fe', 0.5); c2.addLiquid('hcl', 6);
    run(w, 8);
    ok(!!c2.firedRules['fe_hcl'], '初中模式下初中规则正常工作');
  }
  /* 高中模式：高中规则能触发，且基础初中规则仍然保留 */
  CHEM.setLevel('senior');
  {
    const w = new CHEM.World();
    const c = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
    c.addSolid('na', 0.5);
    c.addLiquid('h2o', 40);
    run(w, 10);
    ok(!!c.firedRules['na_h2o'], '高中模式下"钠与水"可以触发');
    const c2 = w.add('testTube', 620, CHEM.SCENE.benchY);
    c2.addSolid('fe', 0.5); c2.addLiquid('hcl', 6);
    run(w, 8);
    ok(!!c2.firedRules['fe_hcl'], '高中模式下仍保留金属与酸这类基础反应');
    /* 纯初中细节规则不应出现 */
    const juniorOnly = CHEM.REACTIONS.find(r => (r.level || 'junior') === 'junior' && !CHEM.isSharedRule(r.id));
    ok(juniorOnly && !CHEM.ruleAvailable(juniorOnly), '高中模式排除纯初中细节规则', juniorOnly && juniorOnly.id);
  }
  CHEM.setLevel(saved);
}

/* --- 2.24 仪器装配：分液漏斗逐滴加液 --- */
{
  const w = new CHEM.World();
  const beaker = w.add('beakerSmall', 400, CHEM.SCENE.benchY);
  const fun = w.add('separatoryFunnel', 400, CHEM.SCENE.benchY - 130);
  fun.addLiquid('hcl', 40);
  ok(w.canAttach(fun.uid, beaker.uid) === 'drip', '分液漏斗可以装配到烧杯上');
  ok(w.attach(fun.uid, beaker.uid) === true, '装配成功');
  run(w, 1);
  ok(Math.abs(fun.x - beaker.x) < 0.01, '装配后自动停靠到容器正上方', fun.x + ' vs ' + beaker.x);
  const v0 = beaker.liquidVolume();
  run(w, 6);
  ok(beaker.liquidVolume() > v0 + 5, '分液漏斗里的液体逐滴流进烧杯',
    v0.toFixed(1) + ' → ' + beaker.liquidVolume().toFixed(1) + ' mL');
  ok(fun.liquidVolume() < 39, '分液漏斗里的液体相应减少', fun.liquidVolume().toFixed(1) + ' mL');
  ok(w.connectionsOf(beaker.uid).length === 1, '能查到连接关系');
  ok(w.connectionsOf(beaker.uid)[0].kind === 'drip', '连接类型是加液');
  w.detach(fun.uid);
  ok(w.connectionsOf(beaker.uid).length === 0, '断开后连接关系消失');
}

/* --- 2.25 漏斗：倒进去的液体流到下面的容器 --- */
{
  const w = new CHEM.World();
  const dst = w.add('beakerSmall', 400, CHEM.SCENE.benchY);
  const f = w.add('funnel', 400, CHEM.SCENE.benchY - 140);
  const src = w.add('testTube', 720, CHEM.SCENE.benchY);
  src.addLiquid('h2o', 15);
  ok(w.canAttach(f.uid, dst.uid) === 'filter', '漏斗可以架到烧杯上');
  w.attach(f.uid, dst.uid);
  const moved = w.pour(src.uid, f.uid, 1.0);
  ok(dst.liquidVolume() > 5, '经过漏斗倒入的液体进入了下面的容器', dst.liquidVolume().toFixed(1) + ' mL');
  ok(moved > 5, '倾倒确实转移了液体');
}

/* --- 2.26 装配的约束 --- */
{
  const w = new CHEM.World();
  const a = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
  const b = w.add('beakerSmall', 700, CHEM.SCENE.benchY);
  const lamp = w.add('alcoholLamp', 500, CHEM.SCENE.benchY);
  ok(w.canAttach(lamp.uid, a.uid) === null, '酒精灯不能"连接"到容器（它靠位置加热）');
  ok(w.canAttach(a.uid, b.uid) === null, '两个烧杯之间没有可连接的装置');
  const tube = w.add('deliveryTube', 500, 300);
  ok(w.canAttach(tube.uid, a.uid) === 'gas', '导管可以接到容器上');
  w.attach(tube.uid, a.uid);
  ok(w.canAttach(tube.uid, b.uid) === 'gas', '导管的另一端还能接');
  w.attach(tube.uid, b.uid);
  ok(w.canAttach(tube.uid, a.uid) === null, '两端都接满后不能再接');
  const c3 = w.add('beakerSmall', 900, CHEM.SCENE.benchY);
  ok(w.canAttach(tube.uid, c3.uid) === null, '也不能接第三个容器');
}

/* --- 2.27 方程式的丰富化：条件与状态符号 --- */
{
  const R = CHEM.Reaction;
  const kmno4 = CHEM.REACTIONS.find(r => r.id === 'kmno4_heat');
  ok(R.conditionLabel(kmno4).indexOf('加热') >= 0, '加热条件被标出', R.conditionLabel(kmno4));
  const se = R.stateEquation(kmno4);
  ok(se.indexOf('(s)') >= 0, '状态符号给固体加 (s)', se);
  ok(se.indexOf('(g)') >= 0, '状态符号给气体加 (g)', se);
  ok(se.indexOf('₂') >= 0 || se.indexOf('₄') >= 0, '化学式带下标', se);

  const caco3 = CHEM.REACTIONS.find(r => r.id === 'caco3_hcl');
  ok(R.stateEquation(caco3).indexOf('(aq)') >= 0, '溶液加 (aq)', R.stateEquation(caco3));
  ok(R.conditionLabel(caco3) === '', '常温反应没有条件标签');

  const burn = CHEM.REACTIONS.find(r => r.id === 'mg_o2');
  ok(R.conditionLabel(burn).indexOf('点燃') >= 0, '点燃条件被标出', R.conditionLabel(burn));

  const hot = CHEM.REACTIONS.find(r => r.id === 'caco3_heat');
  ok(R.conditionLabel(hot).indexOf('高温') >= 0, '高温条件被标出', R.conditionLabel(hot));

  const elec = CHEM.REACTIONS.find(r => r.id === 'h2o_electric');
  ok(R.conditionLabel(elec).indexOf('通电') >= 0, '通电条件被标出', R.conditionLabel(elec));

  const cat = CHEM.REACTIONS.find(r => r.id === 'h2o2_mno2');
  ok(R.conditionLabel(cat).indexOf('催化') >= 0, '催化剂被标出', R.conditionLabel(cat));
}

/* --- 2.28 反应进行时会记录"正在发生的反应"，供界面标注 --- */
{
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY);
  c.addSolid('caco3', 0.5);
  c.addLiquid('hcl', 8);
  ok(CHEM.Reaction.activeRules(c, w.time).length === 0, '反应开始前没有标注');
  run(w, 2);
  const act = CHEM.Reaction.activeRules(c, w.time);
  ok(act.length >= 1, '反应中能查到正在发生的反应', act.map(r => r.id).join(','));
  ok(act.every(r => r.equation && r.equation !== '—'), '标注里不会出现没有方程式的指示剂规则');
  CHEM.Reaction.clearActive(c);
  ok(CHEM.Reaction.activeRules(c, w.time).length === 0, '清空后标注消失');
}

/* --- 2.29 exclude 条件：有强酸时碳酸钙不会被过量 CO₂ 转化 --- */
{
  const w = new CHEM.World();
  const c = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
  c.addSolid('caco3', 2.0);
  c.addLiquid('h2o', 40);
  c.addGas('co2', 150);
  run(w, 10);
  ok(!!c.firedRules['caco3_co2_h2o'], '没有强酸时发生 CaCO₃ + CO₂ + H₂O = Ca(HCO₃)₂');

  /* 盐酸过量：只要酸还在，这条规则就不该参与匹配 */
  const w2 = new CHEM.World();
  const c2 = w2.add('beakerBig', 300, CHEM.SCENE.benchY);
  c2.addSolid('caco3', 1.0);       // 10 mmol，会被酸溶完
  c2.addLiquid('hcl', 60);         // 60 mmol，明显过量
  c2.addGas('co2', 150);
  ok(CHEM.Reaction.findMatches(c2).every(m => m.rule.id !== 'caco3_co2_h2o'),
    '有盐酸时该规则直接不参与匹配');
  run(w2, 12);
  ok(!!c2.firedRules['caco3_hcl'], '有盐酸时碳酸钙直接被酸溶解');
  ok(c2.hasBase('hcl'), '此时容器里确实还有盐酸');
  ok(!c2.firedRules['caco3_co2_h2o'], '盐酸没消耗完之前不会发生"过量 CO₂ 转化"',
    Object.keys(c2.firedRules).join(','));
}

/* --- 2.30 热力学：ΔH 与平衡常数 K --- */
{
  ok(CHEM.THERMO && Object.keys(CHEM.THERMO).length >= 100, '热力学数据已加载',
    CHEM.THERMO ? Object.keys(CHEM.THERMO).length + ' 条' : '无');
  const R = CHEM.Reaction;

  /* 拿教科书上查得到的值校准，避免数据整体跑偏 */
  const nah = R.thermoOf(CHEM.REACTIONS.find(r => r.id === 'naoh_hcl'));
  ok(nah && nah.ok, '强酸强碱中和热可算');
  ok(Math.abs(nah.dH - (-57.3)) < 6, '中和热 ΔH ≈ −57 kJ/mol（教科书 −57.3）', nah.dH.toFixed(1));

  const ele = R.thermoOf(CHEM.REACTIONS.find(r => r.id === 'h2o_electric'));
  ok(Math.abs(ele.dH - 571.6) < 15, '电解水 ΔH ≈ +571.6 kJ/mol', ele.dH.toFixed(1));

  const mgo = R.thermoOf(CHEM.REACTIONS.find(r => r.id === 'mg_o2'));
  ok(mgo.dH < -1000, '镁燃烧剧烈放热', mgo.dH.toFixed(1));

  /* 酯化反应是典型的"K 不大、可逆特征明显" */
  const est = R.thermoOf(CHEM.REACTIONS.find(r => r.id === 'ch3cooh_ester'));
  ok(est.K > 1 && est.K < 50, '酯化反应 K 在 1~50 之间（实测约 4）', est.K.toFixed(2));
  ok(R.kMeaning(est.K, null).indexOf('平衡偏向生成物') >= 0 || R.kMeaning(est.K, null).indexOf('共存') >= 0,
    'K 的解读文字合理', R.kMeaning(est.K, null));

  /* 化学计量必须取自方程式：al_naoh 的方程式里有 reactants 未列出的水 */
  const alNa = CHEM.REACTIONS.find(r => r.id === 'al_naoh');
  const thAl = R.thermoOf(alNa);
  ok(thAl && thAl.byEquation, '按方程式解析化学计量（能识别隐藏的反应物水）');
  ok(thAl.dH < -700 && thAl.dH > -950, '2Al + 2NaOH + 2H₂O 的 ΔH 把水算进去了', thAl.dH.toFixed(1));

  /* K < 1 的反应必须给出"为什么还能进行"的解释，不能只甩一个数字 */
  const elec = R.kCaveat(CHEM.REACTIONS.find(r => r.id === 'h2o_electric'), ele);
  ok(elec && elec.indexOf('电能') >= 0, '电解水给出"由电能驱动"的解释', elec);
  const hot = R.kCaveat(CHEM.REACTIONS.find(r => r.id === 'caco3_heat'),
    R.thermoOf(CHEM.REACTIONS.find(r => r.id === 'caco3_heat')));
  ok(hot && hot.indexOf('高温') >= 0, '高温分解给出"高温驱动"的解释', hot);
  const sol = R.kCaveat(CHEM.REACTIONS.find(r => r.id === 'fe2o3_hcl'),
    R.thermoOf(CHEM.REACTIONS.find(r => r.id === 'fe2o3_hcl')));
  ok(sol === null || sol.indexOf('标准状态') >= 0, 'K<1 的溶液反应给出"偏离标准状态"的解释', sol);

  /* 全部规则都不该抛异常 */
  let bad = 0;
  CHEM.REACTIONS.forEach(r => { try { R.thermoOf(r); } catch (e) { bad++; } });
  ok(bad === 0, '所有规则都能安全地计算热力学量', bad);
  let withData = 0;
  CHEM.REACTIONS.forEach(r => { const t = R.thermoOf(r); if (t && t.ok) withData++; });
  ok(withData >= 160, '大部分规则能算出 ΔH/K', withData + ' / ' + CHEM.REACTIONS.length);
}

/* --- 2.31 离子方程式与反应实质数据 --- */
{
  const R = CHEM.Reaction;
  const n = Object.keys(CHEM.EQUATION_EXTRA || {}).length;
  ok(n >= 150, 'equations-extra 覆盖大部分规则', n + ' 条');
  let ion = 0;
  Object.keys(CHEM.EQUATION_EXTRA).forEach(k => { if (CHEM.EQUATION_EXTRA[k].ion) ion++; });
  ok(ion >= 60, '其中相当一部分给了离子方程式', ion + ' 条');
  const e = R.extraOf('naoh_hcl');
  ok(e && e.ion && e.ion.indexOf('H⁺') >= 0, '中和反应的离子方程式正确', e && e.ion);
  ok(e && e.detail, '有反应实质说明');
  /* 离子方程式本身也要元素守恒 */
  const bad = [];
  Object.keys(CHEM.EQUATION_EXTRA).forEach(function (id) {
    const ion = CHEM.EQUATION_EXTRA[id].ion;
    if (!ion) return;
    const diff = CHEM.balanceOf({ equation: ion });
    if (diff) bad.push(id + ' ' + diff.join(','));
  });
  ok(bad.length === 0, '所有离子方程式元素守恒', bad.slice(0, 5).join(' | '));
}

/* --- 2.32 反应节奏与标注停留时间 ---
   学生需要时间看清气泡、颜色变化和沉淀，所以反应不能一两秒就完；
   方程式标注也要留够读完的时间。这里把这两件事钉住。 */
{
  const dt = 1 / 60;
  /* 追踪"某种反应物被消耗掉 frac 比例"用了多少秒。
     注意要盯**限制性反应物**：比如锌与稀盐酸里盐酸是过量的，锌最多只能被消耗一半多。 */
  function timeToConsume(build, watch, frac) {
    const w = new CHEM.World();
    const c = w.add('testTube', 300, CHEM.SCENE.benchY);
    build(c);
    const base = c.amountOf(watch);
    let t = 0;
    while (t < 180) {
      w.step(dt); t += dt;
      if (c.amountOf(watch) < base * (1 - frac)) return t;
    }
    return -1;
  }
  const tZn = timeToConsume(function (c) {
    c.addSolid('zn', 0.5); c.addLiquid('hcl', 8);
  }, 'hcl', 0.95);
  console.log('  锌 + 稀盐酸（8 mL）：约 ' + tZn.toFixed(1) + ' 秒把盐酸消耗掉 95%');
  ok(tZn > 0, '置换反应能跑完');
  ok(tZn >= 2, '置换反应不会一闪而过（≥2 秒）', tZn.toFixed(1) + ' s');
  ok(tZn <= 25, '置换反应也不会慢到让人等（≤25 秒）', tZn.toFixed(1) + ' s');

  const tNeutral = timeToConsume(function (c) {
    c.addLiquid('naohaq', 8); c.addLiquid('hcl', 8);
  }, 'naoh', 0.95);
  console.log('  氢氧化钠 + 稀盐酸（各 8 mL）：约 ' + tNeutral.toFixed(1) + ' 秒把氢氧化钠消耗掉 95%');
  ok(tNeutral > 0 && tNeutral <= 25, '中和反应耗时也在合理区间（≤25 秒）', tNeutral.toFixed(1) + ' s');

  /* 方程式标注的停留时间 */
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY);
  c.addSolid('caco3', 0.5);
  c.addLiquid('hcl', 8);
  run(w, 6);
  const act = CHEM.Reaction.activeRules(c, w.time);
  ok(act.length >= 1, '反应中容器旁有方程式标注');
  const until = c.activeUntil[act[0].id];
  console.log('  标注停留时间：' + (until - w.time).toFixed(1) + ' 秒');
  ok(until - w.time >= 8, '反应停下来后标注还能再显示 8 秒以上', (until - w.time).toFixed(1) + ' s');
  CHEM.Reaction.clearActive(c);
  ok(CHEM.Reaction.activeRules(c, w.time).length === 0, '清空反应记录后标注立刻消失');
}

/* --- 2.16 不可燃物质点燃无变化 --- */{
  const w = new CHEM.World();
  const c = w.add('testTube', 300, CHEM.SCENE.benchY);
  c.addLiquid('h2o', 6);
  c.ignited = true;
  run(w, 3);
  ok(Object.keys(c.firedRules).length === 0, '点燃纯水不会发生反应', Object.keys(c.firedRules).join(','));
}

/* --- 2.18 消耗溶质时溶剂水要保留（液体不能凭空消失） --- */
{
  const w = new CHEM.World();
  const dish = w.add('evaporatingDish', 300, CHEM.SCENE.benchY);
  dish.addLiquid('caoh2aq', 14);
  const v0 = dish.liquidVolume();
  dish.addGas('co2', 40);
  run(w, 10);
  ok(!!dish.firedRules['co2_caoh2'], '石灰水吸收二氧化碳');
  ok(amt(dish, 'caco3') > 0.001, '生成碳酸钙沉淀', amt(dish, 'caco3').toFixed(4));
  const v1 = dish.liquidVolume();
  ok(v1 > v0 * 0.6, '反应后液体体积基本保留（溶剂水没有消失）', v0.toFixed(2) + ' mL → ' + v1.toFixed(2) + ' mL');
}

/* --- 2.19 溶解固体不会让液面虚涨 --- */
{
  const w = new CHEM.World();
  const c = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
  c.addLiquid('h2o', 30);
  const v0 = c.liquidVolume();
  c.addSolid('nacl', 2);
  run(w, 22);
  const v1 = c.liquidVolume();
  ok(v1 < v0 * 1.2, '2 g 氯化钠溶解后体积增长很小', v0.toFixed(2) + ' mL → ' + v1.toFixed(2) + ' mL');
  ok(amt(c, 'nacl') > 20, '氯化钠已溶解进入溶液', amt(c, 'nacl').toFixed(1) + ' mmol');
}

/* --- 2.20 中和反应后溶液体积守恒 --- */
{
  const w = new CHEM.World();
  const c = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
  c.addLiquid('naohaq', 20);
  c.addLiquid('hcl', 20);
  run(w, 10);
  ok(!!c.firedRules['naoh_hcl'], '中和反应发生');
  const v = c.liquidVolume();
  ok(v > 30 && v < 46, '反应后液体体积约等于两者之和', v.toFixed(2) + ' mL');
  ok(amt(c, 'nacl') > 15, '生成氯化钠', amt(c, 'nacl').toFixed(1) + ' mmol');
}

/* --- 2.17 电解水必须通电 --- */{
  const w = new CHEM.World();
  const c = w.add('beakerSmall', 300, CHEM.SCENE.benchY);
  c.addLiquid('h2o', 40);
  run(w, 4);
  ok(!c.firedRules['h2o_electric'], '不通电时水不分解');
  const miss = CHEM.Reaction.missingCondition(c);
  ok(miss && miss.need === 'power', '提示需要通电', JSON.stringify(miss && miss.text));
  w.setPower(c.uid, true);
  run(w, 10);
  ok(!!c.firedRules['h2o_electric'], '通电后水发生分解');
  ok(gasAmt(c, 'h2') > 0.05 && gasAmt(c, 'o2') > 0.02, '产生氢气和氧气',
    gasAmt(c, 'h2') .toFixed(2) + ' mL H₂ / ' + gasAmt(c, 'o2').toFixed(2) + ' mL O₂');
}

/* =========================================================================
 * 3. 任务定义自检
 * ====================================================================== */
/* 任务里的 id 一旦写错（规则名、物质名、检验名），那一步就永远无法完成。
   这里直接扫源码把这些引用抠出来逐个核对。 */
section('实验任务引用的 id 必须存在');
{
  /* 扫 js/experiments 下**所有**实验文件，将来新增教材实验也会自动被检查 */
  const dir = path.join(ROOT, 'js/experiments');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => 'js/experiments/' + f);
  const problems = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/fired\(\s*w\s*,\s*'([^']+)'\s*\)/g)) {
      if (!CHEM.REACTIONS.some(r => r.id === m[1])) problems.push(f + ' → 规则 ' + m[1]);
    }
    for (const m of src.matchAll(/(?:any|liquidOf|dissolved|solidOf)\s*\(\s*w\s*,\s*'([^']+)'\s*\)/g)) {
      if (!CHEM.SUBSTANCES_BY_BASE[m[1]]) problems.push(f + ' → 物质 ' + m[1]);
    }
    for (const m of src.matchAll(/test(?:Done|Ok)\(\s*w\s*,\s*'([^']+)'\s*\)/g)) {
      if (!(CHEM.TESTS || []).some(t => t.id === m[1])) problems.push(f + ' → 检验 ' + m[1]);
    }
    for (const m of src.matchAll(/holdsAll\(\s*w\s*,\s*\[([^\]]*)\]/g)) {
      for (const q of m[1].matchAll(/'([^']+)'/g)) {
        if (!CHEM.SUBSTANCES_BY_BASE[q[1]]) problems.push(f + ' → 物质 ' + q[1]);
      }
    }
    for (const m of src.matchAll(/at\(\s*'([^']+)'\s*,/g)) {
      if (!CHEM.getApp(m[1])) problems.push(f + ' → 仪器 ' + m[1]);
    }
  }
  console.log('  扫描了 ' + files.length + ' 个实验文件');
  ok(problems.length === 0, '实验里的规则 / 物质 / 检验 / 仪器 id 都存在', problems.join('; '));
}

section('实验任务定义');
{
  const noChapter = [], noPrinciple = [], badEq = [];
  for (const t of (CHEM.EXPERIMENTS || [])) {
    if (!t.chapter) noChapter.push(t.id);
    if (!t.principle || !t.principle.length) noPrinciple.push(t.id);
    (t.principle || []).forEach(eq => {
      if (String(eq).indexOf('=') < 0) return;      // 定义式（如 c = n/V）不校验配平
      const diff = CHEM.balanceOf({ equation: eq });
      if (diff) badEq.push(t.id + ' 「' + eq + '」→ ' + diff.join(','));
    });
  }
  ok(noChapter.length === 0, '每个实验都标了教材章节', noChapter.join(','));
  ok(noPrinciple.length === 0, '每个实验都给了实验原理', noPrinciple.join(','));
  ok(badEq.length === 0, '实验原理里的化学方程式全部配平', badEq.slice(0, 4).join(' | '));
  const ids = (CHEM.EXPERIMENTS || []).map(t => t.id);
  ok(new Set(ids).size === ids.length, '实验 id 不重复', ids.length + ' 个实验');
  const byLevel = { junior: 0, senior: 0 };
  ids.forEach((id, i) => {
    const lv = (CHEM.EXPERIMENTS[i].level || 'junior');
    byLevel[lv] = (byLevel[lv] || 0) + 1;
  });
  console.log('  实验 ' + ids.length + ' 个：初中 ' + byLevel.junior + '，高中 ' + byLevel.senior);
  ok(byLevel.junior >= 10 && byLevel.senior >= 10, '初高中都有足够多的实验',
    byLevel.junior + ' / ' + byLevel.senior);

  /* 自动摆好的仪器不能互相压在一起，否则一上手就是一堆叠影 */
  const overlap = [];
  for (const t of (CHEM.EXPERIMENTS || [])) {
    const s = t.setup || [];
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) {
        if (Math.abs(s[i].x - s[j].x) < 40 && Math.abs(s[i].y - s[j].y) < 30) {
          overlap.push(t.id + ' ' + s[i].type + '↔' + s[j].type +
            ' @(' + s[i].x + ',' + s[i].y + ')');
        }
      }
    }
  }
  ok(overlap.length === 0, '实验开局摆放的仪器没有互相重叠', overlap.slice(0, 4).join(' | '));

  /* ---- 步骤文字里提到的仪器，必须真的在 setup 里存在且数量够 ----
     这类错误静态 id 检查发现不了（id 都是对的），手写动作链也可能漏掉。
     典型例子：步骤写"点燃它下方的酒精灯"，但 setup 里那支试管底下根本没有灯；
     步骤写"向第三支试管中加入…"，但 setup 只给了两支试管。 */
  const ORD = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  const ordNum = s => (/^\d+$/.test(s) ? parseInt(s, 10) : (ORD[s] || 0));
  const NAME2TYPE = [
    ['试管', 'testTube'], ['小烧杯', 'beakerSmall'], ['大烧杯', 'beakerBig'],
    ['锥形瓶', 'conicalFlask'], ['集气瓶', 'gasJar'], ['蒸发皿', 'evaporatingDish'],
    ['量筒', 'graduatedCylinder'], ['容量瓶', 'volumetricFlask']
  ];
  const badRef = [], badHeat = [];
  for (const t of (CHEM.EXPERIMENTS || [])) {
    const setup = t.setup || [];
    const count = {};
    setup.forEach(s => { count[s.type] = (count[s.type] || 0) + 1; });
    const allText = (t.steps || []).map(s => String(s.text || '')).join('\n').replace(/\s+/g, '');

    NAME2TYPE.forEach(function (pair) {
      const name = pair[0], type = pair[1];
      const re = new RegExp('第([一二三四五六七八九十\\d]+)[支只个]?' + name, 'g');
      let m, maxN = 0;
      while ((m = re.exec(allText))) maxN = Math.max(maxN, ordNum(m[1]));
      if (maxN > (count[type] || 0)) {
        badRef.push(t.id + ' 步骤要用「第' + maxN + name + '」，setup 只有 ' +
          (count[type] || 0) + ' 个' + name);
      }
    });
    if (/用导管|导管把|导管两端/.test(allText) && !count.deliveryTube) {
      badRef.push(t.id + ' 步骤里要用导管，但 setup 没有 deliveryTube');
    }
    if (/点燃.*酒精灯|酒精灯.*加热/.test(allText) && !count.alcoholLamp) {
      badRef.push(t.id + ' 步骤里要点酒精灯，但 setup 没有 alcoholLamp');
    }

    /* "第N支试管…加热"这类句子，要求那只试管附近真的有酒精灯。
       注意只认「加热」——「点燃」是把试管里的物质点着，不需要酒精灯在旁边。 */
    const lamps = setup.filter(s => s.type === 'alcoholLamp');
    (t.steps || []).forEach(function (st, si) {
      const txt = String(st.text || '').replace(/\s+/g, '');
      if (!/加热/.test(txt)) return;
      NAME2TYPE.forEach(function (pair) {
        const re = new RegExp('第([一二三四五六七八九十\\d]+)[支只个]?' + pair[0]);
        const mm = txt.match(re);
        if (!mm) return;
        const n = ordNum(mm[1]);
        const of = setup.filter(s => s.type === pair[1]);
        const c = of[n - 1];
        if (!c) return;
        const near = lamps.some(l => Math.abs(l.x - c.x) < 52);
        if (!near) {
          badHeat.push(t.id + ' 第' + (si + 1) + '步要让「第' + n + pair[0] + '」(x=' + c.x +
            ')受热，但它附近没有酒精灯');
        }
      });
    });
  }
  ok(badRef.length === 0, '步骤里提到的仪器在 setup 里都有且数量够', badRef.slice(0, 5).join(' | '));
  ok(badHeat.length === 0, '步骤里要加热的容器附近真的有酒精灯', badHeat.slice(0, 5).join(' | '));

  /* setup 里只能放"容器"和"装置"：玻璃棒、胶头滴管这类是工具栏工具，
     压根不会被摆到台面上（world.add 会直接返回 null），写进去只会误导人。 */
  const badSetup = [];
  for (const t of (CHEM.EXPERIMENTS || [])) {
    const seen = Object.create(null);
    for (const s of (t.setup || [])) {
      const a = CHEM.getApp(s.type);
      if (!a) { badSetup.push(t.id + ' 未知仪器 ' + s.type); continue; }
      if (a.category === 'tool') badSetup.push(t.id + ' 把工具 ' + s.type + ' 放进了 setup');
      const key = s.type + '@' + s.x + ',' + s.y;
      if (seen[key]) badSetup.push(t.id + ' 同一位置放了两个 ' + s.type);
      seen[key] = 1;
    }
  }
  ok(badSetup.length === 0, 'setup 里只放可放置的容器 / 装置，且位置不重复', badSetup.slice(0, 5).join(' | '));
}
for (const t of (CHEM.EXPERIMENTS || [])) {  ok(!!t.id && !!t.name, '任务有 id 和 name');
  ok(Array.isArray(t.steps) && t.steps.length >= 3, t.name + ' 至少 3 个步骤', t.steps && t.steps.length);
  (t.setup || []).forEach(s => ok(!!CHEM.getApp(s.type), t.name + ' 器材存在：' + s.type));
  t.steps.forEach((s, i) => {
    ok(typeof s.check === 'function', t.name + ' 第' + (i + 1) + '步有 check 函数');
    ok(!!s.text, t.name + ' 第' + (i + 1) + '步有文字');
  });
  // check 在空世界下不应抛异常
  const emptyWorld = new CHEM.World();
  (t.setup || []).forEach(s => emptyWorld.add(s.type, s.x, s.y));
  t.steps.forEach((s, i) => {
    try { s.check(emptyWorld); ok(true, t.name + ' 第' + (i + 1) + '步 check 不抛异常'); }
    catch (e) { ok(false, t.name + ' 第' + (i + 1) + '步 check 抛异常', e.message); }
  });
}

/* =========================================================================
 * 汇总
 * ====================================================================== */
console.log('\n' + '='.repeat(64));
if (fail === 0) {
  console.log(`\x1b[32m✅ 全部通过：${pass} 项断言\x1b[0m`);
} else {
  console.log(`\x1b[31m❌ ${fail} 项失败 / 共 ${pass + fail} 项\x1b[0m`);
  failures.slice(0, 60).forEach(f => console.log('   · ' + f));
  if (failures.length > 60) console.log('   … 还有 ' + (failures.length - 60) + ' 项');
}
console.log('='.repeat(64));
process.exit(fail === 0 ? 0 : 1);
