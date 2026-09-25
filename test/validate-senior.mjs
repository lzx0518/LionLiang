/* =============================================================================
 * 虚拟化学实验室 —— 高中化学数据校验脚本
 * -----------------------------------------------------------------------------
 * 运行方式：  node test/validate-senior.mjs
 *
 * 设计说明
 *   1) 本脚本**独立成文件**，不修改也不 import test/validate-data.mjs
 *      （后者结尾会 process.exit，import 进来会把本脚本一起结束）。
 *      初中库的断言直接在本脚本里复用同一套校验函数重新跑一遍，
 *      用来确认"新增高中数据没有破坏初中数据"。
 *   2) 加载顺序（用 await import() 触发传统脚本的副作用，数据挂到 globalThis.CHEM）：
 *        js/data/substances.js       初中物质库
 *        js/data/apparatus.js        仪器库
 *        js/data/reactions.js        初中反应 / 检验 / pH
 *        js/data/substances-senior.js 高中物质库（新增）
 *        js/data/reactions-senior.js  高中反应 / 检验 / pH（新增）
 *      在加载高中文件前后各取一次快照，就能精确切分出"初中部分"和"高中部分"。
 *   3) 校验内容：
 *      · id 唯一（初中 + 高中一起查重，重复会就地覆盖初中数据，属于硬错误）
 *      · 高中物质字段完整性（phase / shelf / level / mm / soluble / pickable …）
 *      · 每条高中规则必须带 level:'senior'
 *      · reactants ⊆ 物质库（base 或 id），ratio 键集合 == reactants 集合，系数为正整数
 *      · 生成物 id 必须在物质库中存在
 *      · type / phenomena.kind 在枚举内，conditions 与 phenomena 字段齐全
 *      · 逐条方程式配平（元素守恒），支持括号 Ca(OH)₂、Al₂(SO₄)₃、结晶水 NH₃·H₂O，
 *        并支持聚合度 n（如 nC₂H₄ = (C₂H₄)n、(C₆H₁₀O₅)n + nH₂O = nC₆H₁₂O₆）
 *      · ratio 与方程式系数成同一比例（出现聚合度 n 时跳过）
 *      · equation 中出现的化学式要能在物质库里找到
 *      · TESTS / PH_RULES 的引用存在性；初中必需的检验方法与 pH 条目仍在
 *      · 初中库整体复检（规则数、id、配平、检验、pH 都与新增前一致）
 *   4) 额外给出"提醒"（不影响退出码）：
 *      · minTemp > 1000 的规则在当前加热模型下不可达（无液体时平台温度 1000 ℃，
 *        有液体时只有 100 ℃）—— 600 ℃ 这类"高温"反应是可以做到的；
 *      · 带 light:true 的规则由"光照"工具触发（引擎 conditionsOK 已支持 light），
 *        数量与 id 会列在输出的"说明"里。
 *
 * 退出码：有任何错误 → 1；只有提醒 → 0。
 * ========================================================================== */

/* ------------------------------ 1. 加载数据 ------------------------------ */
await import('../js/data/substances.js');
await import('../js/data/apparatus.js');
await import('../js/data/reactions.js');

const CHEM = globalThis.CHEM || {};

/* 初中部分快照（此时高中文件还没加载） */
const SUB_JR = (CHEM.SUBSTANCES || []).slice();
const REA_JR = (CHEM.REACTIONS || []).slice();
const TESTS_JR = (CHEM.TESTS || []).slice();
const PH_JR = (CHEM.PH_RULES || []).slice();

await import('../js/data/substances-senior.js');
await import('../js/data/reactions-senior.js');

const ALL_SUB = CHEM.SUBSTANCES || [];
const ALL_REA = CHEM.REACTIONS || [];
const ALL_TESTS = CHEM.TESTS || [];
const ALL_PH = CHEM.PH_RULES || [];

/* 高中部分 = 新增的那一段 */
const SUB_SR = ALL_SUB.slice(SUB_JR.length);
const REA_SR = ALL_REA.slice(REA_JR.length);
const TESTS_SR = ALL_TESTS.slice(TESTS_JR.length);
const PH_SR = ALL_PH.slice(PH_JR.length);

const errors = [];
const warnings = [];
const notes = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function note(msg) { notes.push(msg); }

if (!SUB_JR.length) err('初中物质库加载失败：CHEM.SUBSTANCES 为空');
if (!REA_JR.length) err('初中反应库加载失败：CHEM.REACTIONS 为空');
if (!TESTS_JR.length) err('初中检验方法库加载失败：CHEM.TESTS 为空');
if (!PH_JR.length) err('初中 pH 规则库加载失败：CHEM.PH_RULES 为空');
if (!SUB_SR.length) err('高中物质库加载失败：substances-senior.js 没有注册任何物质');
if (!REA_SR.length) err('高中反应库加载失败：reactions-senior.js 没有注册任何规则');

/* ------------------------------ 2. 枚举与集合 ---------------------------- */
const TYPES = ['化合反应', '分解反应', '置换反应', '复分解反应', '氧化还原反应', '其他'];
const KINDS = ['bubble', 'precipitate', 'colorChange', 'flame', 'smoke', 'glow', 'dissolve', 'none'];
const COND_KEYS = ['heat', 'ignite', 'catalyst', 'minTemp', 'needsWater'];
const PHEN_KEYS = ['kind', 'gas', 'toColor', 'pptColor', 'message', 'heat'];
const PHASES = ['solid', 'liquid', 'solution', 'gas', 'paper'];
const SHELVES = (CHEM.SHELVES || []).map((s) => s.id).concat(['product']);
const LEVELS = ['junior', 'senior', 'both'];

function idSets(list) {
  const ids = new Set();
  const bases = new Set();
  list.forEach((s) => { ids.add(s.id); bases.add(s.base || s.id); bases.add(s.id); });
  return { ids, bases };
}
const JR = idSets(SUB_JR);
const FULL = idSets(ALL_SUB);

/* --------------------------- 3. 化学式解析器 ---------------------------- */
const SUBDIGIT = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₙ': 'n' };
function deSub(text) {
  return String(text).replace(/[₀-₉ₙ]/g, (c) => SUBDIGIT[c]);
}
/* 去掉方程式里的状态符号与结晶水圆点 */
function cleanFormula(raw) {
  return String(raw).replace(/[↑↓]/g, '').replace(/·/g, '').trim();
}
/* 规范化化学式（用于"方程式里的化学式 ↔ 物质库"比对） */
function normalizeFormula(str) {
  return deSub(str).replace(/[()·\[\]\s]/g, '').toUpperCase();
}
/* 聚合度前缀/后缀剥离后的化学式键：nC₂H₄ → C₂H₄，(C₂H₄)n → (C₂H₄) */
function formulaKey(raw) {
  let s = cleanFormula(raw);
  s = s.replace(/^n(?=[A-Z(])/, '');
  s = s.replace(/\)n$/, ')');
  return normalizeFormula(s);
}

/* 元素计数用 [常数, n 的系数] 表示：c + k·n（n 为聚合度） */
function addCount(a, b) {
  if (!a) return [b[0], b[1]];
  return [a[0] + b[0], a[1] + b[1]];
}
function mulCount(a, b) {
  return [a[0] * b[0], a[0] * b[1] + a[1] * b[0]];
}
function isZeroCount(c) { return c[0] === 0 && c[1] === 0; }
function fmtCount(c) { return c[1] === 0 ? String(c[0]) : `${c[0]}+${c[1]}n`; }

/**
 * 解析化学式，返回 { 元素: [常数, n系数] }；失败返回 null。
 * 支持括号嵌套与聚合度 n（写在括号后或元素后）。
 */
function parseFormula(input) {
  const s = deSub(input).replace(/·/g, '');
  let i = 0;

  function readNumber() {
    let num = '';
    while (i < s.length && s[i] >= '0' && s[i] <= '9') { num += s[i]; i += 1; }
    if (num !== '') return [parseInt(num, 10), 0];
    if (s[i] === 'n') { i += 1; return [0, 1]; }
    return [1, 0];
  }

  function parseGroup() {
    const counts = {};
    let matched = false;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '(' || ch === '[') {
        i += 1;
        const inner = parseGroup();
        if (inner === null) return null;
        if (i >= s.length || (s[i] !== ')' && s[i] !== ']')) return null;
        i += 1;
        const mult = readNumber();
        Object.keys(inner).forEach((k) => { counts[k] = addCount(counts[k], mulCount(inner[k], mult)); });
        matched = true;
      } else if (ch === ')' || ch === ']') {
        return matched ? counts : null;
      } else if (/[A-Z]/.test(ch)) {
        let sym = ch;
        i += 1;
        while (i < s.length && /[a-z]/.test(s[i])) { sym += s[i]; i += 1; }
        const num = readNumber();
        counts[sym] = addCount(counts[sym], num);
        matched = true;
      } else {
        return null;
      }
    }
    return matched ? counts : null;
  }

  const result = parseGroup();
  if (result === null || i !== s.length) return null;
  return result;
}

/* --------------------- 4. 方程式拆分与逐元素核对 ------------------------ */
function parseSide(side) {
  const terms = side.split('+').map((t) => t.trim()).filter((t) => t !== '');
  const out = [];
  for (const term of terms) {
    const m = term.match(/^(\d+|n)?\s*(.+)$/);
    if (!m) return null;
    let coeff = [1, 0];
    if (m[1] === 'n') coeff = [0, 1];
    else if (m[1]) coeff = [parseInt(m[1], 10), 0];
    const formula = cleanFormula(m[2]);
    const counts = parseFormula(formula);
    if (counts === null) return { bad: formula };
    const scaled = {};
    Object.keys(counts).forEach((k) => { scaled[k] = mulCount(counts[k], coeff); });
    out.push({ coeff, formula, counts: scaled });
  }
  return out;
}

/** 配平校验：返回 { ok, diff, hasSymbolic, reason, left, right } */
function balanceCheck(equation) {
  const raw = deSub(equation).replace(/[↑↓]/g, '');
  const parts = raw.split('=');
  if (parts.length !== 2) return { ok: false, reason: '方程式必须且只能含一个 = 号' };
  const left = parseSide(parts[0]);
  const right = parseSide(parts[1]);
  if (!left || !right) return { ok: false, reason: '方程式拆分失败（+ 或系数格式有误）' };
  if (left.bad) return { ok: false, reason: `无法解析化学式 "${left.bad}"` };
  if (right.bad) return { ok: false, reason: `无法解析化学式 "${right.bad}"` };

  const total = (list) => {
    const t = {};
    list.forEach((it) => {
      Object.keys(it.counts).forEach((k) => { t[k] = addCount(t[k], it.counts[k]); });
    });
    return t;
  };
  const L = total(left);
  const R = total(right);
  const els = Array.from(new Set([...Object.keys(L), ...Object.keys(R)])).sort();
  const diff = els
    .filter((e) => {
      const a = L[e] || [0, 0];
      const b = R[e] || [0, 0];
      return a[0] !== b[0] || a[1] !== b[1];
    })
    .map((e) => `${e}: 左 ${fmtCount(L[e] || [0, 0])} / 右 ${fmtCount(R[e] || [0, 0])}`);
  let hasSymbolic = false;
  [left, right].forEach((side) => side.forEach((it) => {
    if (it.coeff[1] !== 0) hasSymbolic = true;
    Object.keys(it.counts).forEach((k) => { if (it.counts[k][1] !== 0) hasSymbolic = true; });
  }));
  return { ok: diff.length === 0, diff, hasSymbolic, left, right };
}

/* 化学式索引：规范化化学式 -> 物质（取库中第一个） */
const formulaIndex = new Map();
ALL_SUB.forEach((s) => {
  const k = formulaKey(s.formula);
  if (!k || k === '—') return;
  if (!formulaIndex.has(k)) formulaIndex.set(k, []);
  formulaIndex.get(k).push(s);
});

/* 初中库里"必须有对应物质条目"的核心化学式（与 validate-data.mjs 保持一致） */
const CRITICAL_FORMULAS = new Set(
  ['H2O', 'O2', 'H2', 'CO2', 'CO', 'C', 'S', 'P', 'MG', 'AL', 'FE', 'CU', 'ZN', 'AG', 'CAO',
    'CUO', 'FE2O3', 'FE3O4', 'MGO', 'P2O5', 'MNO2', 'HCL', 'H2SO4', 'H2CO3', 'NAOH', 'CAOH2',
    'CUOH2', 'FEOH3', 'MGOH2', 'CACO3', 'NA2CO3', 'NAHCO3', 'NACL', 'CUSO4', 'FESO4', 'FECL2',
    'FECL3', 'CUCL2', 'MGCL2', 'ALCL3', 'ZNCL2', 'CACL2', 'ZNSO4', 'MGSO4', 'AL2SO43',
    'NA2SO4', 'CASO4', 'BACL2', 'AGNO3', 'KCL', 'AGCL', 'BASO4', 'KMNO4', 'KCLO3', 'K2MNO4',
    'C2H5OH', 'CU2OH2CO3', 'FES'].map(normalizeFormula)
);

/* --------------------------- 5. id 唯一性（两库一起查重） ---------------- */
function checkUnique(list, label) {
  const seen = new Map();
  list.forEach((item, idx) => {
    if (!item || typeof item.id !== 'string' || item.id === '') {
      err(`${label}[${idx}] 缺少合法 id`);
      return;
    }
    if (seen.has(item.id)) err(`${label} 中 id 重复："${item.id}"（第 ${seen.get(item.id)} 条与第 ${idx} 条）`);
    else seen.set(item.id, idx);
  });
  return seen;
}
checkUnique(SUB_JR, '初中 SUBSTANCES');
checkUnique(SUB_SR, '高中 SUBSTANCES');
checkUnique(REA_JR, '初中 REACTIONS');
checkUnique(REA_SR, '高中 REACTIONS');
checkUnique(ALL_TESTS, 'TESTS');

/* 高中物质不能与初中物质重名（重名会就地覆盖初中条目） */
const jrSubIds = new Set(SUB_JR.map((s) => s.id));
SUB_SR.forEach((s) => {
  if (jrSubIds.has(s.id)) err(`高中物质 id "${s.id}" 与初中物质重名，registerSubstances 会就地覆盖初中数据`);
});
const jrReactionIds = new Set(REA_JR.map((r) => r.id));
REA_SR.forEach((r) => {
  if (jrReactionIds.has(r.id)) err(`高中规则 id "${r.id}" 与初中规则重名`);
});
ALL_TESTS.forEach((t) => {
  if (ALL_REA.some((r) => r.id === t.id)) err(`TESTS 的 id "${t.id}" 与反应规则 id 冲突`);
});

/* --------------------------- 6. 高中物质校验 ---------------------------- */
SUB_SR.forEach((s, idx) => {
  const tag = `高中物质[${idx}] ${s.id || '(无 id)'}`;
  if (typeof s.name !== 'string' || !s.name) err(`${tag}: 缺少中文 name`);
  if (typeof s.formula !== 'string' || !s.formula) err(`${tag}: 缺少 formula`);
  if (!PHASES.includes(s.phase)) err(`${tag}: 非法 phase "${s.phase}"（允许：${PHASES.join(' / ')}）`);
  if (!SHELVES.includes(s.shelf)) err(`${tag}: 非法 shelf "${s.shelf}"（允许：${SHELVES.join(' / ')}）`);
  if (!LEVELS.includes(s.level)) err(`${tag}: 非法 level "${s.level}"（允许：${LEVELS.join(' / ')}）`);
  if (!(s.soluble === true || s.soluble === false || s.soluble === 'slight')) {
    err(`${tag}: soluble 必须是 true / false / 'slight'，当前为 ${JSON.stringify(s.soluble)}`);
  }
  if (typeof s.pickable !== 'boolean') err(`${tag}: pickable 必须是布尔值`);
  if (!Array.isArray(s.hazard)) err(`${tag}: hazard 必须是数组`);
  if (typeof s.mm !== 'number' || Number.isNaN(s.mm)) err(`${tag}: mm 必须是数字`);
  if (typeof s.note !== 'string' || !s.note) err(`${tag}: 缺少中文 note`);
  if (!s.base || typeof s.base !== 'string') err(`${tag}: base 未补全（应为 id 或显式母体）`);
  if (s.phase === 'solution' && s.soluble === false) err(`${tag}: 溶液形态的物质 soluble 不应为 false`);
  if (s.formula !== '—' && parseFormula(s.formula) === null) {
    err(`${tag}: formula "${s.formula}" 无法被配平解析器解析`);
  }
});

/* ----------------------- 7. 通用规则校验函数 ---------------------------- */
const typeCount = {};
const kindCount = {};
const priorityList = [];

/**
 * @param {object} r       规则
 * @param {number} idx     下标
 * @param {string} label   标签（初中 / 高中）
 * @param {object} opt
 *        opt.sets           { ids, bases } 允许引用的物质集合
 *        opt.mustSenior     true 表示必须带 level:'senior'
 *        opt.strictProduct  true 表示生成物必须存在（高中），false 只记警告（初中）
 *        opt.tagPrefix
 */
function checkRule(r, idx, label, opt) {
  const tag = `${label}规则[${idx}] ${r && r.id ? r.id : '(无 id)'}`;
  if (!r || typeof r !== 'object') { err(`${tag}: 不是合法对象`); return; }

  if (typeof r.name !== 'string' || r.name.trim() === '') err(`${tag}: 缺少中文 name`);
  if (typeof r.equation !== 'string' || r.equation.trim() === '') err(`${tag}: 缺少 equation`);
  if (opt.mustSenior && r.level !== 'senior') {
    err(`${tag}: 高中规则必须写 level:'senior'，当前为 ${JSON.stringify(r.level)}`);
  }

  if (!TYPES.includes(r.type)) err(`${tag}: 非法 type "${r.type}"（允许：${TYPES.join(' / ')}）`);
  else typeCount[`${label}:${r.type}`] = (typeCount[`${label}:${r.type}`] || 0) + 1;

  const reactants = Array.isArray(r.reactants) ? r.reactants : null;
  if (!reactants || reactants.length === 0) {
    err(`${tag}: reactants 必须是非空数组`);
  } else {
    if (reactants.length > 2) err(`${tag}: reactants 最多 2 个，当前 ${reactants.length} 个`);
    const dup = reactants.filter((x, i) => reactants.indexOf(x) !== i);
    if (dup.length) err(`${tag}: reactants 存在重复项 ${dup.join(', ')}`);
    reactants.forEach((id) => {
      if (!opt.sets.bases.has(id)) err(`${tag}: 反应物 "${id}" 不在物质库的 base/id 集合中`);
    });
  }

  const ratio = r.ratio;
  if (!ratio || typeof ratio !== 'object' || Array.isArray(ratio)) {
    err(`${tag}: 缺少 ratio 对象`);
  } else if (reactants) {
    const rk = Object.keys(ratio).sort();
    const xk = [...reactants].sort();
    if (JSON.stringify(rk) !== JSON.stringify(xk)) {
      err(`${tag}: ratio 键 [${rk.join(', ')}] 与 reactants [${xk.join(', ')}] 不一致`);
    }
    Object.keys(ratio).forEach((k) => {
      const v = ratio[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
        err(`${tag}: ratio.${k} 必须是 ≥1 的整数，当前为 ${JSON.stringify(v)}`);
      }
    });
  }

  if (!Array.isArray(r.products)) {
    err(`${tag}: products 必须是数组`);
  } else {
    r.products.forEach((p, pi) => {
      if (!p || typeof p.id !== 'string') { err(`${tag}: products[${pi}] 缺少 id`); return; }
      if (typeof p.n !== 'number' || !Number.isInteger(p.n) || p.n < 1) {
        err(`${tag}: products[${pi}].n 必须是 ≥1 的整数`);
      }
      if (!opt.sets.ids.has(p.id) && !opt.sets.bases.has(p.id)) {
        if (opt.strictProduct) err(`${tag}: 生成物 "${p.id}" 在物质库中不存在`);
        else warn(`${tag}: 生成物 "${p.id}" 在物质库中没有条目（参考缺失）`);
      }
    });
  }

  const cond = r.conditions;
  if (!cond || typeof cond !== 'object') {
    err(`${tag}: 缺少 conditions`);
  } else {
    COND_KEYS.forEach((k) => {
      if (!(k in cond)) err(`${tag}: conditions 缺少字段 ${k}`);
    });
    if (typeof cond.heat !== 'boolean') err(`${tag}: conditions.heat 必须是布尔值`);
    if (typeof cond.ignite !== 'boolean') err(`${tag}: conditions.ignite 必须是布尔值`);
    if (typeof cond.needsWater !== 'boolean') err(`${tag}: conditions.needsWater 必须是布尔值`);
    if (typeof cond.minTemp !== 'number') err(`${tag}: conditions.minTemp 必须是数字`);
    if (cond.catalyst !== null && typeof cond.catalyst !== 'string') err(`${tag}: conditions.catalyst 必须是 null 或字符串`);
    if (typeof cond.catalyst === 'string' && !opt.sets.bases.has(cond.catalyst)) {
      err(`${tag}: 催化剂 "${cond.catalyst}" 不在物质库中`);
    }
    if (cond.electricity !== undefined && typeof cond.electricity !== 'boolean') {
      err(`${tag}: conditions.electricity 必须是布尔值`);
    }
    if (cond.light !== undefined && typeof cond.light !== 'boolean') {
      err(`${tag}: conditions.light 必须是布尔值`);
    }
    if (typeof cond.minTemp === 'number' && cond.minTemp > 1000) {
      warn(`${tag}: minTemp=${cond.minTemp} 超出加热模型能达到的最高温度`
        + `（无液体时平台温度 1000 ℃，有液体时只有 100 ℃），这条规则实际操作中做不出来`);
    }
    if (cond.electricity === true) note(`${tag}: 需要通电（electricity:true）`);
    if (cond.light === true) note(`${tag}: 需要光照（light:true）`);
  }

  const ph = r.phenomena;
  if (!ph || typeof ph !== 'object') {
    err(`${tag}: 缺少 phenomena`);
  } else {
    PHEN_KEYS.forEach((k) => {
      if (!(k in ph)) err(`${tag}: phenomena 缺少字段 ${k}`);
    });
    if (!KINDS.includes(ph.kind)) err(`${tag}: 非法 phenomena.kind "${ph.kind}"（允许：${KINDS.join(' / ')}）`);
    else kindCount[`${label}:${ph.kind}`] = (kindCount[`${label}:${ph.kind}`] || 0) + 1;

    if (typeof ph.message !== 'string' || ph.message.trim() === '') err(`${tag}: phenomena.message 不能为空`);
    if (typeof ph.heat !== 'number') err(`${tag}: phenomena.heat 必须是数字`);

    if (ph.kind === 'bubble' && !ph.gas) err(`${tag}: kind 为 bubble 时 gas 必填`);
    if (ph.kind === 'bubble' && ph.gas && !opt.sets.bases.has(ph.gas)) {
      err(`${tag}: phenomena.gas "${ph.gas}" 不在物质库中`);
    }
    if (ph.kind !== 'bubble' && ph.gas) {
      warn(`${tag}: kind 为 ${ph.kind} 但填了 gas="${ph.gas}"（引擎仅在 bubble 时使用 gas）`);
    }
    if (ph.kind === 'colorChange') {
      if (!ph.toColor) err(`${tag}: kind 为 colorChange 时 toColor 必填`);
      else if (!/^#[0-9a-fA-F]{6}$/.test(ph.toColor)) err(`${tag}: toColor "${ph.toColor}" 不是合法十六进制颜色`);
    }
    if (ph.kind !== 'colorChange' && ph.toColor) {
      warn(`${tag}: kind 为 ${ph.kind} 但填了 toColor（引擎仅在 colorChange 时使用 toColor）`);
    }
    if (ph.kind === 'precipitate') {
      if (!ph.pptColor) err(`${tag}: kind 为 precipitate 时 pptColor 必填`);
      else if (!/^#[0-9a-fA-F]{6}$/.test(ph.pptColor)) err(`${tag}: pptColor "${ph.pptColor}" 不是合法十六进制颜色`);
    }
    if (ph.kind !== 'precipitate' && ph.pptColor) {
      warn(`${tag}: kind 为 ${ph.kind} 但填了 pptColor（引擎仅在 precipitate 时使用 pptColor）`);
    }
  }

  if (r.priority !== undefined) {
    if (typeof r.priority !== 'number' || Number.isNaN(r.priority)) err(`${tag}: priority 必须是数字`);
    else if (r.priority !== 0) priorityList.push(`${label} ${r.id}: priority=${r.priority}`);
  }
  if (r.level !== undefined && !LEVELS.includes(r.level)) {
    err(`${tag}: 非法 level "${r.level}"`);
  }

  /* ---- 方程式：配平 + 化学式对应物质库 + ratio 与系数成比例 ---- */
  if (typeof r.equation === 'string' && r.equation.trim() !== '') {
    const dash = r.equation.trim() === '—';
    if (dash) {
      if (r.indicator !== true) {
        err(`${tag}: 没有化学方程式（equation 为 '—'）时必须写 indicator:true`);
      }
    } else {
      const bal = balanceCheck(r.equation);
      if (!bal.ok) {
        if (bal.reason) err(`${tag}: 方程式无法解析 —— ${bal.reason}；原文 "${r.equation}"`);
        else err(`${tag}: 方程式未配平 "${r.equation}" —— ${bal.diff.join('；')}`);
      } else if (reactants && ratio) {
        /* ratio 必须与方程式系数成同一比例（有聚合度 n 时跳过） */
        if (!bal.hasSymbolic) {
          const eqCoeff = {};
          bal.left.forEach((it) => {
            const key = formulaKey(it.formula);
            const hits = formulaIndex.get(key) || [];
            if (hits.length) {
              const sub = hits[0];
              if (it.coeff[1] === 0) eqCoeff[sub.base || sub.id] = it.coeff[0];
            }
          });
          const vals = reactants.map((id) => ({ id, ratio: ratio[id], eq: eqCoeff[id] }));
          const known = vals.filter((v) => typeof v.eq === 'number');
          if (known.length === vals.length && known.length > 0) {
            const baseK = known[0].eq / known[0].ratio;
            known.forEach((v) => {
              if (Math.abs(v.eq / v.ratio - baseK) > 1e-9) {
                err(`${tag}: ratio 与方程式系数不成比例（${v.id}: ratio ${v.ratio} ≠ 方程系数 ${v.eq}）`);
              }
            });
          }
        }
      }

      /* 方程式里每个化学式都要能在物质库中找到 */
      const raw = deSub(r.equation).replace(/[↑↓]/g, '');
      const sides = raw.split('=');
      if (sides.length === 2) {
        const formulas = new Set();
        sides.forEach((side) => {
          side.split('+').forEach((term) => {
            const t = term.trim();
            if (!t) return;
            const m = t.match(/^(\d+|n)?\s*(.+)$/);
            if (m) formulas.add(cleanFormula(m[2]));
          });
        });
        formulas.forEach((f) => {
          const key = formulaKey(f);
          if (!key) return;
          if (!formulaIndex.has(key)) {
            if (opt.strictProduct || CRITICAL_FORMULAS.has(key)) {
              err(`${tag}: 方程式中的化学式 "${f}" 在物质库中找不到对应条目`);
            } else {
              warn(`${tag}: 方程式中的化学式 "${f}" 在物质库中暂无对应条目`);
            }
          }
        });
      }
    }
  }
}

/* ------------------- 8. 逐条校验：高中（严格） ------------------------- */
REA_SR.forEach((r, i) => checkRule(r, i, '高中', { sets: FULL, mustSenior: true, strictProduct: true }));
REA_SR.forEach((r) => {
  if (r && r.id && r.level !== 'senior') err(`高中规则 ${r.id}: level 必须为 'senior'`);
});

/* ------------------- 9. 复检：初中（与改动前保持一致） ----------------- */
REA_JR.forEach((r, i) => checkRule(r, i, '初中', { sets: JR, mustSenior: false, strictProduct: false }));
REA_JR.forEach((r) => {
  if (r && r.level === 'senior') err(`初中规则 ${r.id}: level 不应为 'senior'（会从初中模式消失）`);
});

/* --------------------------- 10. TESTS 校验 ---------------------------- */
function checkTests(list, label, sets) {
  list.forEach((t, idx) => {
    const tag = `${label}检验方法[${idx}] ${t && t.id ? t.id : '(无 id)'}`;
    if (!t || typeof t !== 'object') { err(`${tag}: 不是合法对象`); return; }
    if (typeof t.name !== 'string' || !t.name) err(`${tag}: 缺少 name`);
    if (!['gas', 'liquid', 'both'].includes(t.applies)) err(`${tag}: 非法 applies "${t.applies}"`);
    if (typeof t.tip !== 'string' || !t.tip) err(`${tag}: 缺少 tip`);
    if (!Array.isArray(t.rules) || t.rules.length === 0) err(`${tag}: rules 必须是非空数组`);
    else {
      t.rules.forEach((rule, ri) => {
        const rtag = `${tag}.rules[${ri}]`;
        if (typeof rule.result !== 'string' || !rule.result) err(`${rtag}: 缺少 result`);
        if (typeof rule.message !== 'string' || !rule.message) err(`${rtag}: 缺少 message`);
        if (typeof rule.pass !== 'boolean') err(`${rtag}: pass 必须是布尔值`);
        if (rule.phBelow === undefined && rule.phAbove === undefined) {
          if (!Array.isArray(rule.match) || rule.match.length === 0) {
            err(`${rtag}: 必须提供 match 或 phBelow/phAbove`);
          } else {
            rule.match.forEach((id) => {
              if (!sets.bases.has(id)) err(`${rtag}: match 中的 "${id}" 不在物质库中`);
            });
          }
        }
        if (rule.phBelow !== undefined && typeof rule.phBelow !== 'number') err(`${rtag}: phBelow 必须是数字`);
        if (rule.phAbove !== undefined && typeof rule.phAbove !== 'number') err(`${rtag}: phAbove 必须是数字`);
        if (rule.minFraction !== undefined && typeof rule.minFraction !== 'number') err(`${rtag}: minFraction 必须是数字`);
      });
    }
    if (!t.fallback || typeof t.fallback !== 'object') err(`${tag}: 缺少 fallback`);
    else {
      if (typeof t.fallback.result !== 'string') err(`${tag}.fallback: 缺少 result`);
      if (typeof t.fallback.message !== 'string') err(`${tag}.fallback: 缺少 message`);
      if (typeof t.fallback.pass !== 'boolean') err(`${tag}.fallback: pass 必须是布尔值`);
    }
  });
}
checkTests(TESTS_JR, '初中', JR);
checkTests(TESTS_SR, '高中', FULL);

['glowingSplint', 'burningSplint', 'litmusPaper', 'phPaper'].forEach((id) => {
  if (!ALL_TESTS.some((t) => t.id === id)) err(`TESTS 缺少初中必需的检验方法 "${id}"`);
});
['starchIodine', 'kiStarchPaper'].forEach((id) => {
  if (!ALL_TESTS.some((t) => t.id === id)) err(`TESTS 缺少高中必需的检验方法 "${id}"`);
});

/* --------------------------- 11. PH_RULES 校验 -------------------------- */
function checkPH(list, label, sets) {
  const seen = new Set();
  list.forEach((p, idx) => {
    const tag = `${label}PH_RULES[${idx}] ${p && p.id ? p.id : '(无 id)'}`;
    if (!p || typeof p.id !== 'string' || !p.id) { err(`${tag}: 缺少 id`); return; }
    if (seen.has(p.id)) err(`${tag}: id 重复 "${p.id}"`);
    seen.add(p.id);
    if (!sets.bases.has(p.id)) err(`${tag}: 物质 "${p.id}" 不在物质库中`);
    if (typeof p.ph !== 'number' || p.ph < 0 || p.ph > 14) err(`${tag}: ph 必须是 0~14 的数字`);
    if (typeof p.note !== 'string' || !p.note) err(`${tag}: 缺少中文 note`);
  });
}
checkPH(PH_JR, '初中', JR);
checkPH(PH_SR, '高中', FULL);

/* 初中必须保留的 pH 条目 */
['h2o', 'c2h5oh', 'hcl', 'h2so4', 'naoh', 'caoh2', 'na2co3', 'nacl', 'na2so4', 'kcl',
  'cacl2', 'bacl2', 'agno3', 'cuso4', 'fecl2', 'fecl3', 'znso4', 'mgso4', 'feso4',
  'al2so43', 'cu_no32', 'fe_no32'].forEach((id) => {
  if (!PH_JR.some((p) => p.id === id)) err(`初中 PH_RULES 缺少必需条目 "${id}"（被破坏了）`);
});
/* 高中要求补充的 pH */
['so2', 'nh3', 'nh3h2o', 'naclo', 'naalo2', 'ch3cooh', 'hclo', 'h2s', 'na2sio3'].forEach((id) => {
  if (!ALL_PH.some((p) => p.id === id)) err(`PH_RULES 缺少要求的条目 "${id}"`);
});

/* --------------------------- 12. 初中数据未被破坏 ----------------------- */
if (REA_JR.length < 60) err(`初中反应规则只有 ${REA_JR.length} 条，少于要求的 60 条`);
if (SUB_JR.length < 60) err(`初中物质库只有 ${SUB_JR.length} 条，疑似被破坏`);
if (ALL_REA.length !== REA_JR.length + REA_SR.length) err('反应规则总数与初中 + 高中之和不一致');
if (ALL_SUB.length !== SUB_JR.length + SUB_SR.length) err('物质总数与初中 + 高中之和不一致');
SUB_SR.forEach((s) => {
  if (!s.level) err(`高中物质 ${s.id}: 缺少 level（应为 'senior' 或 'both'）`);
});

/* --------------------------- 13. 统计与输出 ---------------------------- */
function sortedEntries(obj) {
  return Object.entries(obj)
    .filter(([k]) => k.startsWith('高中:'))
    .map(([k, v]) => [k.slice(3), v])
    .sort((a, b) => b[1] - a[1]);
}

console.log('==================== 高中化学数据校验 ====================');
console.log(`初中物质库    : ${SUB_JR.length} 条（未被改动）`);
console.log(`高中新增物质  : ${SUB_SR.length} 条`);
console.log(`物质库合计    : ${ALL_SUB.length} 条`);
console.log('------------------------------------------------------------');
console.log(`初中反应规则  : ${REA_JR.length} 条（未被改动，重新校验）`);
console.log(`高中反应规则  : ${REA_SR.length} 条`);
console.log(`反应规则合计  : ${ALL_REA.length} 条`);
console.log('------------------------------------------------------------');
console.log('高中规则按 type 分组：');
sortedEntries(typeCount).forEach(([k, v]) => console.log(`  ${k.padEnd(6, '　')} ${v} 条`));
console.log('高中规则按 phenomena.kind 分组：');
sortedEntries(kindCount).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v} 条`));
console.log('------------------------------------------------------------');
console.log(`高中检验方法  : ${TESTS_SR.length} 条（${TESTS_SR.map((t) => t.id).join(', ')}）`);
console.log(`高中 pH 规则  : ${PH_SR.length} 条`);
console.log(`高中指示剂显色: ${REA_SR.filter((r) => r.indicator === true).length} 条`);
console.log(`高中带 priority 的规则: ${priorityList.length} 条`);
priorityList.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
console.log(`高中方程式全部配平校验通过: ${REA_SR.filter((r) => r.equation !== '—').length} 条`);
console.log('------------------------------------------------------------');

if (notes.length) {
  console.log(`ℹ️  说明 ${notes.length} 条：`);
  notes.forEach((n, i) => console.log(`   ${i + 1}. ${n}`));
  console.log('------------------------------------------------------------');
}

if (warnings.length) {
  console.log(`⚠️  提醒 ${warnings.length} 条（不影响通过）：`);
  warnings.forEach((w, i) => console.log(`   ${i + 1}. ${w}`));
  console.log('------------------------------------------------------------');
}

if (errors.length) {
  console.error(`❌ 发现 ${errors.length} 个错误：`);
  errors.forEach((e, i) => console.error(`   ${i + 1}. ${e}`));
  process.exit(1);
}

if (REA_SR.length < 75) {
  console.error(`❌ 高中反应规则只有 ${REA_SR.length} 条，少于要求的 75 条`);
  process.exit(1);
}
if (SUB_SR.length < 40) {
  console.error(`❌ 高中新增物质只有 ${SUB_SR.length} 条，少于要求的 40 条`);
  process.exit(1);
}

console.log('✅ 高中化学数据校验通过');
process.exit(0);
