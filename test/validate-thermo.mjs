/* =============================================================================
 * 虚拟化学实验室 —— 热力学数据 & 离子方程式 校验脚本
 * -----------------------------------------------------------------------------
 * 用法：  node test/validate-thermo.mjs
 *
 * 校验内容：
 *   1. 覆盖性  ：189 条规则里出现的每个反应物/生成物，必须在 CHEM.THERMO 里有数据，
 *                或在 CHEM.THERMO_MISSING 里被显式声明，否则报错。
 *   2. 键规范性：CHEM.THERMO 的每个键都必须是某个物质的 base（用
 *                CHEM.SUBSTANCES_BY_BASE 核对），值必须是 [ΔHf°, ΔGf°] 两个数。
 *   3. 自洽性  ：对每条规则按化学计量计算
 *                  ΔH°rxn = Σ n·ΔHf°(产物) − Σ n·ΔHf°(反应物)
 *                  ΔG°rxn = Σ n·ΔGf°(产物) − Σ n·ΔGf°(反应物)
 *                  K = exp(−ΔG°rxn × 1000 / (R·T))   T = 298.15, R = 8.314
 *   4. 交叉核对：凡是 phenomena.heat !== 0 的规则，把 ΔH°rxn 与 heat 比较，
 *                差值超过 40 kJ/mol 的逐条列出（只作提醒，不影响退出码）。
 *                heat 的符号约定在原数据里并不统一，因此同时按两种约定比较：
 *                  约定 A（文件头声明：放热为正）  heat ≈ −ΔH°rxn
 *                  约定 B（直接把 heat 当 ΔH）      heat ≈  ΔH°rxn
 *                取二者中较接近的一种判差；若两种都超 40 才列为"量级可疑"。
 *   5. 离子方程式：equations-extra.js 的 id 必须都存在于规则库；ion 里的化学式
 *                去掉电荷后必须元素守恒（复用 test/validate-senior.mjs 的配平
 *                解析器写法）。
 *
 * 本脚本不修改任何其它文件。
 * ========================================================================== */
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'js', 'data');
const load = (f) => import(pathToFileURL(path.join(DATA, f)).href);

/* ---------------------- 1. 按指定顺序加载数据文件 ---------------------- */
await load('substances.js');
await load('apparatus.js');
await load('reactions.js');
await load('substances-senior.js');
await load('reactions-senior.js');
/* 记录"基础两库"的规则条数，后面用来区分 reactions-extra.js 追加的补充规则 */
const BASE_RULE_COUNT = ((globalThis.CHEM || {}).REACTIONS || []).length;
await load('thermo.js');
await load('equations-extra.js');
await load('reactions-extra.js');   /* 补充规则（实验室制法 / 有机物检验），与 index.html 顺序一致 */

const CHEM = globalThis.CHEM;

const errors = [];
const warnings = [];
const notes = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const note = (m) => notes.push(m);

/* ------------------------------ 2. 基础数据 ---------------------------- */
const RULES = CHEM.REACTIONS || [];
const THERMO = CHEM.THERMO || {};
const MISSING = CHEM.THERMO_MISSING || [];
const META = CHEM.THERMO_META || {};
const EXTRA = CHEM.EQUATION_EXTRA || {};

const T = typeof META.T === 'number' ? META.T : 298.15;
const R = typeof META.R === 'number' ? META.R : 8.314;

if (!RULES.length) err('反应规则库为空：CHEM.REACTIONS 未加载');
if (!Object.keys(THERMO).length) err('CHEM.THERMO 为空：thermo.js 没有提供数据');
if (!MISSING.length) warn('CHEM.THERMO_MISSING 为空（若确实全部覆盖可忽略）');

const MISSING_SET = new Set(MISSING);

/* ------------------------- 3. 化学式解析 / 配平 ------------------------ */
/* 写法沿用 test/validate-senior.mjs，另加"去掉电荷上标"一步            */
const SUBDIGIT = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₙ': 'n'
};
const deSub = (text) => String(text).replace(/[₀-₉ₙ]/g, (c) => SUBDIGIT[c]);

/* 电荷上标：⁰¹²³⁴⁵⁶⁷⁸⁹ ⁺ ⁻（注意与下标 ₂ ₃ 不冲突） */
const CHARGE_CHARS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻';
const stripCharge = (s) => {
  let out = String(s);
  while (out.length && CHARGE_CHARS.indexOf(out[out.length - 1]) >= 0) {
    out = out.slice(0, -1);
  }
  return out;
};

/* 去掉状态符号、结晶水圆点，以及 "(浓)" / "(稀)" 这类中文状态注释 */
const cleanFormula = (raw) => String(raw)
  .replace(/[↑↓]/g, '')
  .replace(/·/g, '')
  .replace(/\([^()]*[\u4e00-\u9fff][^()]*\)/g, '')
  .trim();

/* 元素计数用 [常数, n 的系数] 表示：c + k·n（n 为聚合度） */
const addCount = (a, b) => (a ? [a[0] + b[0], a[1] + b[1]] : [b[0], b[1]]);
const mulCount = (a, b) => [a[0] * b[0], a[0] * b[1] + a[1] * b[0]];
const fmtCount = (c) => (c[1] === 0 ? String(c[0]) : `${c[0]}+${c[1]}n`);

/** 解析化学式，返回 { 元素: [常数, n系数] }；失败返回 null */
function parseFormula(input) {
  const s = deSub(stripCharge(input)).replace(/·/g, '');
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
    if (formula === '') return null;
    const counts = parseFormula(formula);
    if (counts === null) return { bad: formula };
    const scaled = {};
    Object.keys(counts).forEach((k) => { scaled[k] = mulCount(counts[k], coeff); });
    out.push({ coeff, formula, counts: scaled });
  }
  return out;
}

/** 配平校验：返回 { ok, diff, reason } */
function balanceCheck(equation) {
  const raw = deSub(equation).replace(/[↑↓]/g, '');
  const parts = raw.split('=');
  if (parts.length !== 2) return { ok: false, reason: '必须且只能含一个 = 号' };
  const left = parseSide(parts[0]);
  const right = parseSide(parts[1]);
  if (!left || !right) return { ok: false, reason: '拆分失败（+ 或系数格式有误）' };
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
  const Rt = total(right);
  const els = Array.from(new Set([...Object.keys(L), ...Object.keys(Rt)])).sort();
  const diff = els
    .filter((e) => {
      const a = L[e] || [0, 0];
      const b = Rt[e] || [0, 0];
      return a[0] !== b[0] || a[1] !== b[1];
    })
    .map((e) => `${e}: 左 ${fmtCount(L[e] || [0, 0])} / 右 ${fmtCount(Rt[e] || [0, 0])}`);
  return { ok: diff.length === 0, diff };
}

/* ---------------------- 4. 覆盖性 / 键规范性检查 ---------------------- */
const usedSpecies = new Set();
RULES.forEach((r) => {
  (r.reactants || []).forEach((x) => usedSpecies.add(x));
  (r.products || []).forEach((p) => usedSpecies.add(p.id));
});

/* 4.1 THERMO 的键必须是某个物质的 base */
const thermoKeys = Object.keys(THERMO);
const badKeys = [];
const badValues = [];
const dupMeta = [];
thermoKeys.forEach((k) => {
  const forms = CHEM.SUBSTANCES_BY_BASE ? CHEM.SUBSTANCES_BY_BASE[k] : null;
  if (!forms || !forms.length) badKeys.push(k);
  const v = THERMO[k];
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number') {
    badValues.push(`${k} = ${JSON.stringify(v)}`);
  }
  if (!usedSpecies.has(k)) dupMeta.push(k);
});
if (badKeys.length) err(`CHEM.THERMO 里有 ${badKeys.length} 个键不是任何物质的 base：${badKeys.join(', ')}`);
if (badValues.length) err(`CHEM.THERMO 里有 ${badValues.length} 条取值格式不合法（应为 [ΔHf°, ΔGf°] 两个数）：\n    ${badValues.join('\n    ')}`);
if (dupMeta.length) note(`CHEM.THERMO 里有 ${dupMeta.length} 个键未被 189 条规则使用（备用数据）：${dupMeta.join(', ')}`);

/* 4.2 THERMO_MISSING 里也必须是合法 base */
const badMissing = MISSING.filter((k) => !(CHEM.SUBSTANCES_BY_BASE && CHEM.SUBSTANCES_BY_BASE[k]));
if (badMissing.length) err(`CHEM.THERMO_MISSING 里有 ${badMissing.length} 个不是 base 的 id：${badMissing.join(', ')}`);
const missingNotUsed = MISSING.filter((k) => !usedSpecies.has(k));
if (missingNotUsed.length) warn(`CHEM.THERMO_MISSING 里有 ${missingNotUsed.length} 个 id 并未出现在任何规则中：${missingNotUsed.join(', ')}`);

/* 4.3 覆盖性：规则里的每个物种都要有数据或被显式声明为缺失 */
const uncovered = [];
[...usedSpecies].sort().forEach((id) => {
  if (!(id in THERMO) && !MISSING_SET.has(id)) uncovered.push(id);
});
if (uncovered.length) {
  err(`有 ${uncovered.length} 个规则中出现的物种既不在 CHEM.THERMO 也不在 CHEM.THERMO_MISSING：\n    ${uncovered.join(', ')}`);
}

/* 4.4 THERMO 与 THERMO_MISSING 不能重复 */
const bothListed = MISSING.filter((k) => k in THERMO);
if (bothListed.length) err(`以下 id 同时出现在 CHEM.THERMO 和 CHEM.THERMO_MISSING：${bothListed.join(', ')}`);

/* 4.5 conditions 字段白名单（含 reactions-extra.js 用的 exclude） */
const ALLOWED_COND_KEYS = [
  'heat', 'ignite', 'catalyst', 'minTemp', 'needsWater',
  'electricity', 'minFraction', 'light', 'exclude'
];
const badCondKeys = [];
const excludeUsers = [];
RULES.forEach((r) => {
  const c = r.conditions || {};
  Object.keys(c).forEach((k) => {
    if (ALLOWED_COND_KEYS.indexOf(k) < 0) badCondKeys.push(`${r.id}.${k}`);
  });
  if (Array.isArray(c.exclude) && c.exclude.length) excludeUsers.push(r.id);
});
if (badCondKeys.length) {
  err(`conditions 里出现未在允许列表中的字段（${ALLOWED_COND_KEYS.join('/')}）：${badCondKeys.join(', ')}`);
}
if (excludeUsers.length) note(`使用了 conditions.exclude 的规则：${excludeUsers.join(', ')}`);

/* --------------------------- 5. 逐规则热力学 --------------------------- */
const thermoValue = (id) => {
  if ((id in THERMO) && Array.isArray(THERMO[id])) return THERMO[id];
  if (MISSING_SET.has(id)) return null;
  return undefined;           /* 未覆盖 */
};

/* 规范化化学式（用于"方程式里的化学式 ↔ 物质库"比对） */
function normalizeFormula(str) {
  return deSub(str).replace(/[()·\[\]\s]/g, '').toUpperCase();
}
/* 聚合度前缀/后缀剥离后的化学式键：nC₂H₄ → C₂H₄，(C₂H₄)n → (C₂H₄) */
function formulaKeyOf(raw) {
  let s = cleanFormula(raw);
  s = s.replace(/^n(?=[A-Z(])/, '');
  s = s.replace(/\)n$/, ')');
  return normalizeFormula(s);
}

/* 全库化学式索引：化学式键 → base id 列表 */
const FORMULA_INDEX = new Map();
(CHEM.SUBSTANCES || []).forEach((s) => {
  if (!s.formula || s.formula === '—') return;
  const k = formulaKeyOf(s.formula);
  const arr = FORMULA_INDEX.get(k) || [];
  if (arr.indexOf(s.base) < 0) arr.push(s.base);
  FORMULA_INDEX.set(k, arr);
});

/* 把规则方程式拆成 [{coeff, formula}] */
function parseEquationTerms(equation) {
  const raw = deSub(equation).replace(/[↑↓]/g, '');
  const parts = raw.split('=');
  if (parts.length !== 2) return null;
  const out = [];
  const sides = [['left', parts[0]], ['right', parts[1]]];
  for (const [sideName, text] of sides) {
    const terms = text.split('+').map((t) => t.trim()).filter((t) => t !== '');
    if (!terms.length) return null;
    for (const term of terms) {
      const m = term.match(/^(\d+|n)?\s*(.+)$/);
      if (!m) return null;
      let coeff = 1;
      if (m[1] === 'n') coeff = 1;      /* 聚合度 n 按 1 计（并另行提示） */
      else if (m[1]) coeff = parseInt(m[1], 10);
      const formula = cleanFormula(m[2]);
      if (formula === '') return null;
      out.push({ side: sideName, coeff, formula });
    }
  }
  return out;
}

/* 规则局部化学式索引（优先用规则自己的 reactants/products，避免 HCl / HCl(g) 这类歧义） */
function localFormulaMap(rule) {
  const m = new Map();
  const add = (id) => {
    const s = CHEM.SUBSTANCE_MAP ? CHEM.SUBSTANCE_MAP[id] : null;
    if (!s || !s.formula || s.formula === '—') return;
    const k = formulaKeyOf(s.formula);
    const arr = m.get(k) || [];
    if (arr.indexOf(id) < 0) arr.push(id);
    m.set(k, arr);
  };
  (rule.reactants || []).forEach(add);
  (rule.products || []).forEach((p) => add(p.id));
  return m;
}

/* 用配平方程式解析出该规则真实的化学计量（反应物与产物两侧都含） */
function stoichFromEquation(rule) {
  if (!rule.equation || rule.equation === '—') return { ok: false, reason: '该规则没有化学方程式' };
  const terms = parseEquationTerms(rule.equation);
  if (!terms) return { ok: false, reason: '方程式无法拆分为化学式' };
  const local = localFormulaMap(rule);
  const items = [];
  const problems = [];
  terms.forEach((t) => {
    const k = formulaKeyOf(t.formula);
    let cand = local.get(k) || [];
    if (!cand.length) cand = FORMULA_INDEX.get(k) || [];
    if (cand.length === 1) items.push({ id: cand[0], coeff: t.coeff, side: t.side });
    else if (cand.length > 1) problems.push(`"${t.formula}"(${cand.join('/')})`);
    else problems.push(`"${t.formula}"(无匹配物质)`);
  });
  if (problems.length) return { ok: false, reason: '有化学式无法唯一对应 base：' + problems.join('、') };
  return { ok: true, items };
}

/* 用规则的 ratio/products 解析化学计量（引擎建模口径，可能省略溶剂水） */
function stoichFromRatio(rule) {
  const items = [];
  (rule.reactants || []).forEach((id) => {
    const n = (rule.ratio && rule.ratio[id]) || 1;
    items.push({ id, coeff: n, side: 'left' });
  });
  (rule.products || []).forEach((p) => {
    items.push({ id: p.id, coeff: p.n === undefined ? 1 : p.n, side: 'right' });
  });
  return { ok: true, items };
}

const computed = [];   /* { rule, dH, dG, log10K, source } */
const skipped = [];    /* { id, reason } */
const implicitSolvent = [];   /* 方程式中比 ratio/products 多出来的物种（多为水） */
const equationFallback = [];  /* 方程式解析失败、退回 ratio/products 的规则 */

RULES.forEach((rule) => {
  let stoich = stoichFromEquation(rule);
  let source = 'equation';
  if (!stoich.ok) {
    equationFallback.push({ id: rule.id, reason: stoich.reason });
    stoich = stoichFromRatio(rule);
    source = 'ratio';
  } else {
    /* 记录方程式中多出来的物种（ratio/products 里没写的，通常是参加反应的水） */
    const declared = new Set();
    (rule.reactants || []).forEach((x) => declared.add(x));
    (rule.products || []).forEach((p) => declared.add(p.id));
    const extra = Array.from(new Set(stoich.items.filter((it) => !declared.has(it.id)).map((it) => it.id)));
    if (extra.length) implicitSolvent.push({ id: rule.id, extra: extra.join(',') });
  }

  let ok = true;
  const missingHere = [];
  let dH = 0;
  let dG = 0;
  stoich.items.forEach((it) => {
    const v = thermoValue(it.id);
    if (v === null || v === undefined) { ok = false; missingHere.push(it.id); return; }
    const sign = it.side === 'left' ? -1 : 1;
    dH += sign * it.coeff * v[0];
    dG += sign * it.coeff * v[1];
  });
  if (!ok) {
    skipped.push({ id: rule.id, reason: '缺少数据：' + Array.from(new Set(missingHere)).join(',') });
    return;
  }
  const log10K = -dG * 1000 / (R * T) / Math.LN10;
  computed.push({ rule, dH, dG, log10K, source });
});

if (implicitSolvent.length) {
  note(`以下 ${implicitSolvent.length} 条规则的配平方程式里含有 reactants/products 未列出的物种` +
    `（通常是参加反应的水，已按方程式计入 ΔH/ΔG）：` +
    implicitSolvent.map((x) => `${x.id}[+${x.extra}]`).join(', '));
}
if (equationFallback.length) {
  note(`以下 ${equationFallback.length} 条规则无法由方程式解析化学计量，已退回 ratio/products 口径：` +
    equationFallback.map((x) => `${x.id}(${x.reason})`).join('; '));
}

/* ------------------------- 6. 与 phenomena.heat 交叉核对 ---------------- */
/* 只对"整条规则的反应热可算"且 heat !== 0 的规则比较 */
const heatMismatch = [];
const heatUsesDelta = [];   /* heat 直接被当成 ΔH（与文件头声明的"放热为正"相反） */
computed.forEach(({ rule, dH }) => {
  const ph = rule.phenomena || {};
  const heat = ph.heat;
  if (typeof heat !== 'number' || heat === 0) return;
  const dA = Math.abs(dH - (-heat));   /* 约定 A：放热为正（文件头声明） */
  const dB = Math.abs(dH - heat);      /* 约定 B：heat 就是 ΔH */
  const d = Math.min(dA, dB);
  const convention = dA <= dB ? 'A(放热为正)' : 'B(heat=ΔH)';
  if (dB < 40 && dA >= 40) heatUsesDelta.push({ id: rule.id, dH, heat });
  if (d > 40) {
    heatMismatch.push({ id: rule.id, dH, heat, d, convention, equation: rule.equation });
  }
});

/* --------------------------- 7. 离子方程式检查 ------------------------- */
const ruleIds = new Set(RULES.map((r) => r.id));
const extraIds = Object.keys(EXTRA);
const unknownIds = extraIds.filter((id) => !ruleIds.has(id));
if (unknownIds.length) {
  err(`equations-extra.js 里有 ${unknownIds.length} 个 id 不在规则库中：\n    ${unknownIds.join(', ')}`);
}
const ionList = extraIds.filter((id) => typeof EXTRA[id].ion === 'string' && EXTRA[id].ion.trim() !== '');
const noDetail = extraIds.filter((id) => !EXTRA[id].detail || String(EXTRA[id].detail).trim().length < 8);
if (noDetail.length) warn(`以下条目缺少有信息量的 detail：${noDetail.join(', ')}`);

const ionBad = [];
ionList.forEach((id) => {
  const eq = EXTRA[id].ion;
  const res = balanceCheck(eq);
  if (!res.ok) {
    ionBad.push({ id, eq, reason: res.reason || res.diff.join('；') });
  }
});
if (ionBad.length) {
  err(`有 ${ionBad.length} 条离子方程式元素不守恒或无法解析：\n    ` +
    ionBad.map((x) => `${x.id}  «${x.eq}»  →  ${x.reason}`).join('\n    '));
}

/* 规则覆盖统计 */
const coveredIds = new Set(extraIds);
const uncoveredRules = RULES.filter((r) => !coveredIds.has(r.id)).map((r) => r.id);
if (uncoveredRules.length) {
  warn(`equations-extra.js 未覆盖 ${uncoveredRules.length} 条规则：${uncoveredRules.join(', ')}`);
}

/* 规则里"应该是离子反应"（needsWater 为真）却没写 ion 的条目 —— 只提示 */
const ionicGuess = RULES.filter((r) =>
  r.conditions && r.conditions.needsWater === true &&
  EXTRA[r.id] && EXTRA[r.id].ion === undefined);
if (ionicGuess.length) {
  note(`以下 ${ionicGuess.length} 条规则 needsWater 为真但未给离子方程式（若确非离子反应可忽略）：` +
    ionicGuess.map((r) => r.id).join(', '));
}

/* ------------------------------ 8. 统计输出 --------------------------- */
const line = (s) => console.log(s);

line('');
line('=== 热力学与离子方程式数据校验 ===');
line('');
line(`规则总数            : ${RULES.length}（基础两库 ${BASE_RULE_COUNT} + 补充规则 ${RULES.length - BASE_RULE_COUNT}）`);
line(`CHEM.THERMO 条数    : ${thermoKeys.length}`);
line(`THERMO_MISSING 条数 : ${MISSING.length}`);
line(`equations-extra 条数: ${extraIds.length}（其中含离子方程式 ${ionList.length} 条）`);
line(`T / R               : ${T} K / ${R} J·mol⁻¹·K⁻¹`);
line('');

/* 缺失明细 */
if (MISSING.length) {
  line('--- THERMO_MISSING 明细 ---');
  MISSING.forEach((k) => {
    const forms = CHEM.SUBSTANCES_BY_BASE[k] || [];
    const nm = forms[0] ? `${forms[0].name}(${forms[0].formula})` : '未知';
    const usedBy = RULES.filter((r) =>
      (r.reactants || []).indexOf(k) >= 0 || (r.products || []).some((p) => p.id === k)).length;
    line(`  ${k.padEnd(20)} ${nm}  被 ${usedBy} 条规则使用`);
  });
  line('');
}

/* 覆盖性 */
line('--- 覆盖性 ---');
line(`规则涉及的不同物种    : ${usedSpecies.size}`);
line(`有热力学数据          : ${[...usedSpecies].filter((x) => x in THERMO).length}`);
line(`显式声明为缺失        : ${[...usedSpecies].filter((x) => MISSING_SET.has(x)).length}`);
line(`遗漏                  : ${uncovered.length}`);
line('');

/* 自洽性 */
line('--- 自洽性（ΔH°rxn / ΔG°rxn / K） ---');
if (computed.length) {
  const dHs = computed.map((c) => c.dH);
  const minH = Math.min(...dHs);
  const maxH = Math.max(...dHs);
  line(`可算规则数            : ${computed.length} / ${RULES.length}（跳过 ${skipped.length} 条）`);
  line(`ΔH°rxn 范围           : ${minH.toFixed(1)} ~ ${maxH.toFixed(1)} kJ/mol`);
  const kBig = computed.filter((c) => c.log10K > 5).length;
  const kSmall = computed.filter((c) => c.log10K < 0).length;
  line(`K > 10^5 的条数       : ${kBig}`);
  line(`K < 1 的条数          : ${kSmall}`);
  const kMin = Math.min(...computed.map((c) => c.log10K));
  const kMax = Math.max(...computed.map((c) => c.log10K));
  line(`lg K 范围             : ${kMin.toFixed(1)} ~ ${kMax.toFixed(1)}`);
  line('');
  line('  最放热 5 条：');
  computed.slice().sort((a, b) => a.dH - b.dH).slice(0, 5).forEach((c) => {
    line(`    ${c.rule.id.padEnd(20)} ΔH = ${c.dH.toFixed(1).padStart(9)} kJ/mol   lgK = ${c.log10K.toFixed(1)}`);
  });
  line('  最吸热 5 条：');
  computed.slice().sort((a, b) => b.dH - a.dH).slice(0, 5).forEach((c) => {
    line(`    ${c.rule.id.padEnd(20)} ΔH = ${c.dH.toFixed(1).padStart(9)} kJ/mol   lgK = ${c.log10K.toFixed(1)}`);
  });
  line('');
  if (skipped.length) {
    line(`  因缺数据跳过计算的 ${skipped.length} 条规则：`);
    skipped.forEach((s) => line(`    ${s.id.padEnd(20)} ${s.reason}`));
    line('');
  }
} else {
  err('没有任何规则能算出 ΔH°rxn：检查 CHEM.THERMO 键是否与规则的 base id 对得上');
}
line('');

/* 补充规则（reactions-extra.js）逐条数值 */
const extraRules = RULES.slice(BASE_RULE_COUNT);
if (extraRules.length) {
  const computedIds = new Set(computed.map((c) => c.rule.id));
  const dones = computed.filter((c) => extraRules.some((r) => r.id === c.rule.id));
  line(`--- 补充规则（reactions-extra.js，共 ${extraRules.length} 条） ---`);
  line(`可算出 ΔH/ΔG/K 的条数 : ${dones.length} / ${extraRules.length}`);
  line('  id                     ΔH°rxn      ΔG°rxn       lgK     备注');
  dones
    .slice()
    .sort((a, b) => extraRules.findIndex((r) => r.id === a.rule.id) - extraRules.findIndex((r) => r.id === b.rule.id))
    .forEach((c) => {
      line(`  ${c.rule.id.padEnd(22)} ${c.dH.toFixed(1).padStart(9)} ${c.dG.toFixed(1).padStart(10)} ${c.log10K.toFixed(1).padStart(9)}   ${c.dH < 0 ? '放热' : c.dH > 0 ? '吸热' : '热中性'}`);
    });
  extraRules.forEach((r) => {
    if (!computedIds.has(r.id)) {
      const s = skipped.find((x) => x.id === r.id);
      line(`  ${r.id.padEnd(22)} ${'—'.padStart(9)} ${'—'.padStart(10)} ${'—'.padStart(9)}   ${s ? s.reason : '未计算'}`);
    }
  });
  line('');
}

/* heat 交叉核对 */
line('--- 与 phenomena.heat 交叉核对（提醒，不影响退出码） ---');
line(`heat !== 0 且可算的规则数 : ${computed.filter((c) => { const h = (c.rule.phenomena || {}).heat; return typeof h === 'number' && h !== 0; }).length}`);
line(`|ΔH°rxn − heat| 两种符号约定下最小值 > 40 kJ/mol 的条数 : ${heatMismatch.length}`);
line(`heat 数值与 ΔH 同号（用了"heat=ΔH"约定，与文件头声明相反）的条数 : ${heatUsesDelta.length}`);
if (heatMismatch.length) {
  line('');
  line('  id                    ΔH°rxn(算)   heat(数据)   最小差   较接近的约定   方程式');
  heatMismatch
    .slice()
    .sort((a, b) => b.d - a.d)
    .forEach((m) => {
      line(`  ${m.id.padEnd(20)} ${m.dH.toFixed(1).padStart(10)} ${String(m.heat).padStart(11)} ${m.d.toFixed(1).padStart(9)}   ${m.convention.padEnd(14)} ${m.equation}`);
    });
  line('');
  line('  说明：A = 文件头声明的「放热为正」（heat ≈ −ΔH°rxn）；B = 直接把 heat 当 ΔH。');
  line('        原数据里两种约定混用，故取较接近者判差；仍超 40 的说明数值量级本身可疑。');
}
if (heatUsesDelta.length) {
  line('');
  line(`  heat 采用"ΔH 本身"符号（负值表示放热）的规则共 ${heatUsesDelta.length} 条：`);
  line('  ' + heatUsesDelta.map((x) => `${x.id}(${x.heat})`).join(', '));
}
line('');

/* 警告 / 提示 */
if (warnings.length) {
  line(`--- 警告 (${warnings.length}) ---`);
  warnings.forEach((w) => line('  ⚠ ' + w));
  line('');
}
if (notes.length) {
  line(`--- 提示 (${notes.length}) ---`);
  notes.forEach((n) => line('  · ' + n));
  line('');
}

/* ------------------------------ 9. 退出 ------------------------------- */
if (errors.length) {
  line('❌ 发现以下错误：');
  errors.forEach((e) => line('  ✗ ' + e));
  line('');
  console.error(`❌ 热力学与离子方程式数据校验失败（${errors.length} 个错误）`);
  process.exit(1);
} else {
  console.log('✅ 热力学与离子方程式数据校验通过');
  process.exit(0);
}
