/* =============================================================================
 * 虚拟化学实验室 —— 数据校验脚本
 * -----------------------------------------------------------------------------
 * 运行方式：  node test/validate-data.mjs
 *
 * 本脚本用 Node 的 ESM 动态 import 依次加载三个"传统脚本"数据文件：
 *   js/data/substances.js  物质库
 *   js/data/apparatus.js   仪器库
 *   js/data/reactions.js   反应规则库
 * 因为这三个文件末尾都是
 *   (typeof window !== 'undefined' ? window : globalThis)
 * 在 Node 中 typeof window === 'undefined'，所以它们会把数据挂到 globalThis.CHEM，
 * import 的副作用即可完成加载，无需任何 ESM 导出。
 *
 * 校验内容：
 *   1. 所有 id 唯一（REACTIONS / TESTS / PH_RULES 内部及相互之间）；
 *   2. reactants 里每个 id 必须存在于"母体集合"（所有 base 值 + 所有 id）；
 *   3. ratio 的键集合必须与 reactants 集合完全相等，且系数为正整数；
 *   4. products[].id 必须存在于物质库（id 或 base）；缺失只记为"参考缺失"警告；
 *   5. type / phenomena.kind 必须在允许的枚举内；
 *   6. conditions 的 6 个必需字段齐全；phenomena 的 6 个字段齐全；
 *   7. 方程式配平（逐元素核对，支持括号与 Unicode 下标）—— 本脚本的重点；
 *   8. equation 中每个化学式都要能和物质库的 formula 对应上（规范化比较）；
 *   9. TESTS / PH_RULES 的 id 引用存在性；
 *  10. 统计输出：规则总数、按 type 分组、按 phenomena.kind 分组。
 *
 * 退出码：有任何"错误"就 process.exit(1)；只有警告则通过。
 * ========================================================================== */

/* ------------------------------ 1. 加载数据 ------------------------------ */
await import('../js/data/substances.js');
await import('../js/data/apparatus.js');
await import('../js/data/reactions.js');

const CHEM = globalThis.CHEM || {};
const SUBSTANCES = CHEM.SUBSTANCES || [];
const REACTIONS = CHEM.REACTIONS || [];
const TESTS = CHEM.TESTS || [];
const PH_RULES = CHEM.PH_RULES || [];

const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

if (!SUBSTANCES.length) err('物质库加载失败：CHEM.SUBSTANCES 为空');
if (!REACTIONS.length) err('反应库加载失败：CHEM.REACTIONS 为空');
if (!TESTS.length) err('检验方法库加载失败：CHEM.TESTS 为空');
if (!PH_RULES.length) err('pH 规则库加载失败：CHEM.PH_RULES 为空');

/* ------------------------------ 2. 基础集合 ------------------------------ */
/* 物质库全部 id 与 base 值 */
const allIds = new Set(SUBSTANCES.map((s) => s.id));
const allBases = new Set();
SUBSTANCES.forEach((s) => { allBases.add(s.base || s.id); allBases.add(s.id); });

/* 化学式索引：规范化化学式 -> 物质 id（用于第 8 项校验） */
function normalizeFormula(str) {
  return String(str || '')
    .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080))
    .replace(/[()·\[\]\s]/g, '')
    .toUpperCase();
}
const formulaIndex = new Map();
SUBSTANCES.forEach((s) => {
  const k = normalizeFormula(s.formula);
  if (!k || k === '—' || k === '-') return;
  if (!formulaIndex.has(k)) formulaIndex.set(k, []);
  formulaIndex.get(k).push(s.id);
});

/* --------------------------- 3. 化学式解析器 ---------------------------- */
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
function deSub(text) {
  return String(text).replace(/[₀-₉]/g, (c) => SUB[c]);
}

/**
 * 解析一个化学式字符串（已去掉系数与 ↑↓），返回 { 元素符号: 原子数 }。
 * 支持：元素符号、下标（Unicode 或半角）、括号嵌套，如 Ca(OH)₂、Al₂(SO₄)₃、
 * Cu₂(OH)₂CO₃、Fe₂(SO₄)₃、C₂H₅OH。解析失败返回 null 并给出原因。
 */
function parseFormula(input) {
  const s = deSub(input);
  let i = 0;

  function readNumber() {
    let n = '';
    while (i < s.length && s[i] >= '0' && s[i] <= '9') { n += s[i]; i += 1; }
    return n === '' ? 1 : parseInt(n, 10);
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
        for (const k of Object.keys(inner)) counts[k] = (counts[k] || 0) + inner[k] * mult;
        matched = true;
      } else if (ch === ')' || ch === ']') {
        return matched ? counts : null;   /* 交给上层处理右括号 */
      } else if (/[A-Z]/.test(ch)) {
        let sym = ch;
        i += 1;
        while (i < s.length && /[a-z]/.test(s[i])) { sym += s[i]; i += 1; }
        const num = readNumber();
        counts[sym] = (counts[sym] || 0) + num;
        matched = true;
      } else {
        return null;                       /* 非法字符 */
      }
    }
    return matched ? counts : null;
  }

  const result = parseGroup();
  if (result === null || i !== s.length) return null;
  return result;
}

/* --------------------- 4. 方程式拆分与逐元素核对 ------------------------ */
/** 去掉多余空白，并把 ↑ ↓ 等状态符号剥离后返回化学式 */
function cleanFormula(raw) {
  return raw.replace(/[↑↓]/g, '').trim();
}

/**
 * 解析方程式的一侧，如 '2KMnO₄' / 'Ca(OH)₂' / '3H₂SO₄'
 * 返回 [{ coeff, formula, counts }]
 */
function parseSide(side) {
  const terms = side.split('+').map((t) => t.trim()).filter((t) => t !== '');
  const out = [];
  for (const term of terms) {
    const m = term.match(/^(\d+)?\s*(.+)$/);
    if (!m) return null;
    const coeff = m[1] ? parseInt(m[1], 10) : 1;
    const formula = cleanFormula(m[2]);
    const counts = parseFormula(formula);
    if (counts === null) return { bad: formula };
    out.push({ coeff, formula, counts });
  }
  return out;
}

/** 配平校验：返回 { ok, left, right, bad } */
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
      for (const k of Object.keys(it.counts)) t[k] = (t[k] || 0) + it.counts[k] * it.coeff;
    });
    return t;
  };
  const L = total(left);
  const R = total(right);
  const els = Array.from(new Set([...Object.keys(L), ...Object.keys(R)])).sort();
  const diff = els
    .filter((e) => (L[e] || 0) !== (R[e] || 0))
    .map((e) => `${e}: 左 ${L[e] || 0} / 右 ${R[e] || 0}`);
  return { ok: diff.length === 0, diff, left, right };
}

/* ------------------------------ 5. 枚举 ------------------------------ */
const TYPES = ['化合反应', '分解反应', '置换反应', '复分解反应', '氧化还原反应', '其他'];
const KINDS = ['bubble', 'precipitate', 'colorChange', 'flame', 'smoke', 'glow', 'dissolve', 'none'];
const COND_KEYS = ['heat', 'ignite', 'catalyst', 'minTemp', 'needsWater'];
const PHEN_KEYS = ['kind', 'gas', 'toColor', 'pptColor', 'message', 'heat'];
/* 核心化学式：一旦方程式里出现却在物质库中找不到，就是硬错误 */
const CRITICAL_FORMULAS = new Set(
  ['H2O', 'O2', 'H2', 'CO2', 'CO', 'C', 'S', 'P', 'MG', 'AL', 'FE', 'CU', 'ZN', 'AG', 'CAO',
    'CUO', 'FE2O3', 'FE3O4', 'MGO', 'P2O5', 'MNO2', 'HCL', 'H2SO4', 'H2CO3', 'NAOH', 'CAOH2',
    'CUOH2', 'FEOH3', 'MGOH2', 'CACO3', 'NA2CO3', 'NAHCO3', 'NACL', 'CUSO4', 'FESO4', 'FECL2',
    'FECL3', 'CUCL2', 'MGCL2', 'ALCL3', 'ZNCL2', 'CACL2', 'ZNSO4', 'MGSO4', 'AL2SO43',
    'NA2SO4', 'CASO4', 'BACL2', 'AGNO3', 'KCL', 'AGCL', 'BASO4', 'KMNO4', 'KCLO3', 'K2MNO4',
    'C2H5OH', 'CU2OH2CO3', 'FES'].map(normalizeFormula)
);

/* --------------------------- 6. id 唯一性 --------------------------- */
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
checkUnique(REACTIONS, 'REACTIONS');
checkUnique(TESTS, 'TESTS');
checkUnique(PH_RULES, 'PH_RULES');

/* 三个集合之间也不应重名（TESTS 与物质库有 litmusPaper/phPaper 的重名，单独说明） */
const reactionIds = new Set(REACTIONS.map((r) => r.id));
TESTS.forEach((t) => {
  if (reactionIds.has(t.id)) err(`TESTS 的 id "${t.id}" 与反应规则 id 冲突`);
});

/* ------------------------- 7. 逐条校验 REACTIONS ------------------------- */
const typeCount = {};
const kindCount = {};

REACTIONS.forEach((r, idx) => {
  const tag = `规则[${idx}] ${r.id || '(无 id)'}`;

  if (typeof r.name !== 'string' || r.name.trim() === '') err(`${tag}: 缺少中文 name`);
  if (typeof r.equation !== 'string' || r.equation.trim() === '') err(`${tag}: 缺少 equation`);

  /* 5. type 枚举 */
  if (!TYPES.includes(r.type)) err(`${tag}: 非法 type "${r.type}"（允许：${TYPES.join(' / ')}）`);
  else typeCount[r.type] = (typeCount[r.type] || 0) + 1;

  /* 2. reactants 存在性 */
  const reactants = Array.isArray(r.reactants) ? r.reactants : null;
  if (!reactants || reactants.length === 0) {
    err(`${tag}: reactants 必须是非空数组`);
  } else {
    if (reactants.length > 2) err(`${tag}: reactants 最多 2 个，当前 ${reactants.length} 个`);
    const dup = reactants.filter((x, i) => reactants.indexOf(x) !== i);
    if (dup.length) err(`${tag}: reactants 存在重复项 ${dup.join(', ')}`);
    reactants.forEach((id) => {
      if (!allBases.has(id)) err(`${tag}: 反应物 "${id}" 不在物质库的 base/id 集合中`);
    });
  }

  /* 3. ratio 键集合与系数 */
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
    /* 与方程式系数比对：ratio 必须与 equation 的系数成同一比例 */
    const bal = balanceCheck(r.equation || '');
    if (bal.ok && reactants) {
      const eqCoeff = {};
      bal.left.forEach((it) => {
        const hit = SUBSTANCES.find((s) => normalizeFormula(s.formula) === normalizeFormula(it.formula));
        if (hit) eqCoeff[hit.base || hit.id] = it.coeff;
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

  /* 4. products */
  if (!Array.isArray(r.products)) {
    err(`${tag}: products 必须是数组`);
  } else {
    r.products.forEach((p, pi) => {
      if (!p || typeof p.id !== 'string') { err(`${tag}: products[${pi}] 缺少 id`); return; }
      if (typeof p.n !== 'number' || !Number.isInteger(p.n) || p.n < 1) {
        err(`${tag}: products[${pi}].n 必须是 ≥1 的整数`);
      }
      if (!allIds.has(p.id) && !allBases.has(p.id)) {
        warn(`${tag}: 生成物 "${p.id}" 在物质库中没有条目（参考缺失，已记入警告）`);
      }
    });
  }

  /* 6. conditions / phenomena 字段 */
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
    if (typeof cond.catalyst === 'string' && !allBases.has(cond.catalyst)) {
      err(`${tag}: 催化剂 "${cond.catalyst}" 不在物质库中`);
    }
  }

  const ph = r.phenomena;
  if (!ph || typeof ph !== 'object') {
    err(`${tag}: 缺少 phenomena`);
  } else {
    PHEN_KEYS.forEach((k) => {
      if (!(k in ph)) err(`${tag}: phenomena 缺少字段 ${k}`);
    });
    if (!KINDS.includes(ph.kind)) err(`${tag}: 非法 phenomena.kind "${ph.kind}"（允许：${KINDS.join(' / ')}）`);
    else kindCount[ph.kind] = (kindCount[ph.kind] || 0) + 1;

    if (typeof ph.message !== 'string' || ph.message.trim() === '') err(`${tag}: phenomena.message 不能为空`);
    if (typeof ph.heat !== 'number') err(`${tag}: phenomena.heat 必须是数字`);

    if (ph.kind === 'bubble' && !ph.gas) err(`${tag}: kind 为 bubble 时 gas 必填`);
    if (ph.kind === 'bubble' && ph.gas && !allBases.has(ph.gas)) err(`${tag}: phenomena.gas "${ph.gas}" 不在物质库中`);
    if (ph.kind !== 'bubble' && ph.gas) warn(`${tag}: kind 为 ${ph.kind} 但填了 gas="${ph.gas}"（引擎仅在 bubble 时使用 gas）`);
    if (ph.kind === 'colorChange') {
      if (!ph.toColor) err(`${tag}: kind 为 colorChange 时 toColor 必填`);
      else if (!/^#[0-9a-fA-F]{6}$/.test(ph.toColor)) err(`${tag}: toColor "${ph.toColor}" 不是合法十六进制颜色`);
    }
    if (ph.kind !== 'colorChange' && ph.toColor) warn(`${tag}: kind 为 ${ph.kind} 但填了 toColor（引擎仅在 colorChange 时使用 toColor）`);
    if (ph.kind === 'precipitate') {
      if (!ph.pptColor) err(`${tag}: kind 为 precipitate 时 pptColor 必填`);
      else if (!/^#[0-9a-fA-F]{6}$/.test(ph.pptColor)) err(`${tag}: pptColor "${ph.pptColor}" 不是合法十六进制颜色`);
    }
    if (ph.kind !== 'precipitate' && ph.pptColor) warn(`${tag}: kind 为 ${ph.kind} 但填了 pptColor（引擎仅在 precipitate 时使用 pptColor）`);
  }

  if (r.priority !== undefined && (typeof r.priority !== 'number' || Number.isNaN(r.priority))) {
    err(`${tag}: priority 必须是数字`);
  }

  /* 7. 配平 */
  if (typeof r.equation === 'string' && r.equation.trim() !== '') {
    if (r.indicator === true && r.equation.trim() === '—') {
      /* 指示剂显色没有化学方程式，跳过配平 */
    } else {
      const bal = balanceCheck(r.equation);
      if (!bal.ok) {
        if (bal.reason) err(`${tag}: 方程式无法解析 —— ${bal.reason}；原文 "${r.equation}"`);
        else {
          const onlyH = Object.keys(bal.diff).every(() => true);
          err(`${tag}: 方程式未配平 "${r.equation}" —— ${bal.diff.join('；')}`);
          void onlyH;
        }
      }
    }

    /* 8. 化学式 ↔ 物质库 */
    if (r.equation.trim() !== '—') {
      const raw = deSub(r.equation).replace(/[↑↓]/g, '');
      const sides = raw.split('=');
      if (sides.length === 2) {
        const formulas = new Set();
        sides.forEach((side) => {
          side.split('+').forEach((term) => {
            const t = term.trim();
            if (!t) return;
            const m = t.match(/^(\d+)?\s*(.+)$/);
            if (m) formulas.add(cleanFormula(m[2]));
          });
        });
        formulas.forEach((f) => {
          const key = normalizeFormula(f);
          if (!key) return;
          if (!formulaIndex.has(key)) {
            /* 部分初中化学必备的生成物在物质库中暂时没有条目（例如 NH₃、NaNO₃），
             * 任务要求"不修改 substances.js，选用已有 id 或在报告中说明"，因此这类
             * 化学式记为警告；只有核心物质（气体、水及酸碱盐主链）缺失才算错误。 */
            if (CRITICAL_FORMULAS.has(key)) {
              err(`${tag}: 方程式中的核心化学式 "${f}" 在物质库中找不到对应 formula`);
            } else {
              warn(`${tag}: 方程式中的化学式 "${f}" 在物质库中暂无对应条目（需补物质库，见报告）`);
            }
          }
        });
      }
    }
  }
});

/* --------------------------- 8. TESTS 校验 --------------------------- */
TESTS.forEach((t, idx) => {
  const tag = `检验方法[${idx}] ${t.id || '(无 id)'}`;
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
            if (!allBases.has(id)) err(`${rtag}: match 中的 "${id}" 不在物质库中`);
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

/* 必须包含的四种检验方法 */
['glowingSplint', 'burningSplint', 'litmusPaper', 'phPaper'].forEach((id) => {
  if (!TESTS.some((t) => t.id === id)) err(`TESTS 缺少必需的检验方法 "${id}"`);
});

/* --------------------------- 9. PH_RULES 校验 --------------------------- */
const phSeen = new Set();
PH_RULES.forEach((p, idx) => {
  const tag = `PH_RULES[${idx}] ${p.id || '(无 id)'}`;
  if (!p || typeof p.id !== 'string' || !p.id) { err(`${tag}: 缺少 id`); return; }
  if (phSeen.has(p.id)) err(`${tag}: id 重复 "${p.id}"`);
  phSeen.add(p.id);
  if (!allBases.has(p.id)) err(`${tag}: 物质 "${p.id}" 不在物质库中`);
  if (typeof p.ph !== 'number' || p.ph < 0 || p.ph > 14) err(`${tag}: ph 必须是 0~14 的数字`);
  if (typeof p.note !== 'string' || !p.note) err(`${tag}: 缺少中文 note`);
});

/* 必须覆盖的中性盐 */
['h2o', 'c2h5oh', 'hcl', 'h2so4', 'naoh', 'caoh2', 'na2co3', 'nacl', 'na2so4', 'kcl',
  'cacl2', 'bacl2', 'agno3', 'cuso4', 'fecl2', 'fecl3', 'znso4', 'mgso4', 'feso4',
  'al2so43', 'cu_no32', 'fe_no32'].forEach((id) => {
  if (!phSeen.has(id)) err(`PH_RULES 缺少必需条目 "${id}"`);
});

/* ------------------------------ 10. 统计 ------------------------------ */
function sortedEntries(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

console.log('==================== 化学实验室数据校验 ====================');
console.log(`物质库物质数   : ${SUBSTANCES.length}（母体 ${allBases.size} 个 id）`);
console.log(`反应规则总数   : ${REACTIONS.length}`);
console.log(`检验方法数     : ${TESTS.length}`);
console.log(`pH 规则数      : ${PH_RULES.length}`);
console.log('------------------------------------------------------------');
console.log('按 type 分组：');
sortedEntries(typeCount).forEach(([k, v]) => console.log(`  ${k.padEnd(8, '　')} ${v} 条`));
console.log('按 phenomena.kind 分组：');
sortedEntries(kindCount).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v} 条`));
console.log('------------------------------------------------------------');
console.log(`指示剂显色规则 : ${REACTIONS.filter((r) => r.indicator === true).length} 条`);
console.log(`带 priority 的规则: ${REACTIONS.filter((r) => (r.priority || 0) !== 0).length} 条`);
console.log('------------------------------------------------------------');

if (warnings.length) {
  console.log(`⚠️  警告 ${warnings.length} 条（不影响通过）：`);
  warnings.forEach((w, i) => console.log(`   ${i + 1}. ${w}`));
  console.log('------------------------------------------------------------');
}

if (errors.length) {
  console.error(`❌ 发现 ${errors.length} 个错误：`);
  errors.forEach((e, i) => console.error(`   ${i + 1}. ${e}`));
  process.exit(1);
}

if (REACTIONS.length < 60) {
  console.error(`❌ 反应规则总数 ${REACTIONS.length} 条，少于要求的 60 条`);
  process.exit(1);
}

console.log('✅ 全部校验通过');
process.exit(0);
