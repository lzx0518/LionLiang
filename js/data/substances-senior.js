/* =============================================================================
 * 虚拟化学实验室 —— 高中化学物质库 (Substances · Senior)
 * -----------------------------------------------------------------------------
 * 本文件只"新增"高中物质，不修改 substances.js 中的任何已有条目。
 * 字段 schema 与 substances.js 完全一致：
 *   id / base / name / formula / phase / color / dissolveColor / precipColor /
 *   soluble / pickable / shelf / hazard / mm / note / level
 * 追加字段：
 *   level   'senior' 只在高中模式出现（本文件绝大多数物质）
 *           'both'   两个学段共用
 *
 * 约定：
 *   · `color`         固体本色 / 液体本色 / 溶液颜色
 *   · `dissolveColor` 固体溶解后溶液的颜色
 *   · `precipColor`   作为沉淀析出时的颜色
 *   · `shelf` 只能取 metal / nonmetal / gas / solid / liquid / organic / indicator
 *   · 溶液形态（phase:'solution'）的浓度由 js/engine/world.js 的 CONC 表决定，
 *     本文件未列出的默认按 1.0 mol/L 处理，对高中内容足够。
 *   · 生成物（pickable:false）沿用初中库做法放在 shelf:'product'，不上药品架。
 *
 * ---------------------------------------------------------------------------
 * 【与任务说明的一处有意偏差：浓硫酸 / 浓硝酸的 base】
 * ---------------------------------------------------------------------------
 * 任务说明建议 h2so4_conc 的 base 写成 'h2so4'、hno3_conc 的 base 写成 'hno3'。
 * 但反应引擎（js/engine/world.js 的 species / amountOf / consume）是**按 base 匹配**
 * 的：若把浓硫酸的 base 也写成 'h2so4'，"浓硫酸"和"稀硫酸"在引擎里就成了同一种
 * 物质，会命中同一批规则，具体有两个问题：
 *   1) Cu + 浓硫酸、C + 浓硫酸 两条规则在"铜/碳 + 稀硫酸并加热"时也会被触发，
 *      与初中库 NO_REACTION 中"铜不能与稀硫酸反应"的教学结论直接矛盾；
 *   2) Cu + 浓硝酸 与 Cu + 稀硝酸 的反应物会完全重合，两条规则会同时被引擎执行，
 *      屏幕上同时出现"无色 NO"和"红棕色 NO₂"两种互相矛盾的现象。
 * 因此这里让 h2so4_conc / hno3_conc 各自作为独立母体（不写 base，默认等于 id），
 * 反应规则中也用 'h2so4_conc' / 'hno3_conc' 作反应物。
 * 若确实希望二者共用 base，只需给这两条补上 base 并把反应物改回 'h2so4' / 'hno3'，
 * 但请注意上面两点后果。
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});

  /* 颜色常量：与 substances.js / reactions.js 的配色风格保持一致 */
  var C = {
    white: '#eef1f5',
    offwhite: '#f6f7fa',
    metalLite: '#cfd4da',
    metalGrey: '#8d939b',
    copper: '#c1743a',
    silver: '#d8dce2',
    charcoal: '#2b2b2b',
    sulfur: '#e8d44d',
    purple: '#4b1354',
    brown: '#9c4326',
    black: '#1e2124',
    green: '#2f8f6a',
    paleGreen: '#9fd39a',
    blue: '#2f8fd6',
    cyanBlue: '#3fb0a8',
    yellow: '#e0b64a',
    brickRed: '#a0522d',
    water: '#dcf0ff',
    clearLiq: '#eaf4ff',
    pink: '#ff5f9e',
    /* ---- 高中新增色号 ---- */
    paleYellow: '#e9e58a',      /* 过氧化钠：淡黄色 */
    chlorine: '#c8e06a',        /* 氯气：黄绿色 */
    no2Gas: '#b5502a',          /* 二氧化氮：红棕色 */
    bromine: '#8e2b1f',         /* 液溴：深红棕色 */
    bromineWater: '#e8a33d',    /* 溴水：橙黄色 */
    iodine: '#2f2340',          /* 碘：紫黑色 */
    kmno4: '#8e2b7a',           /* 高锰酸钾溶液：紫红色 */
    k2cr2o7: '#e07b1f',         /* 重铬酸钾溶液：橙色 */
    bloodRed: '#a01d1d',        /* 硫氰化铁：血红色 */
    starchBlue: '#2b2b8a',      /* 淀粉遇碘：蓝色 */
    silicon: '#3a3f45',         /* 硅：灰黑色 */
    cu2oRed: '#a0522d'          /* 氧化亚铜：砖红色 */
  };
  CHEM.SENIOR_COLORS = C;

  var LIST = [

    /* =====================================================================
     * 一、钠及其化合物
     * =================================================================== */
    {
      id: 'na', name: '钠', formula: 'Na', phase: 'solid', color: C.silver,
      soluble: false, pickable: true, shelf: 'metal', hazard: ['易燃', '腐蚀性'], mm: 23,
      level: 'senior',
      note: '银白色质软的金属，密度比水小、熔点低（97.8 ℃）。化学性质非常活泼，在空气中迅速变暗，' +
        '必须保存在煤油中隔绝空气和水；取用要用镊子，剩下的钠要放回原瓶。'
    },
    {
      id: 'na2o2', name: '过氧化钠', formula: 'Na2O2', phase: 'solid', color: C.paleYellow,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid',
      hazard: ['强氧化性', '腐蚀性'], mm: 78, level: 'senior',
      note: '淡黄色固体（颜色是本条的鉴别特征），能与水、二氧化碳反应放出氧气，' +
        '可用作呼吸面具和潜水艇里的供氧剂。'
    },
    {
      id: 'na2o', name: '氧化钠', formula: 'Na2O', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid',
      hazard: ['腐蚀性', '刺激性'], mm: 62, level: 'senior',
      note: '白色固体，属于碱性氧化物。与水反应生成氢氧化钠，与盐酸反应生成氯化钠和水。' +
        '钠在常温下与氧气反应生成的就是它。'
    },
    {
      id: 'naalo2', name: '偏铝酸钠溶液', formula: 'NaAlO2', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: ['腐蚀性'], mm: 82,
      level: 'senior',
      note: '无色溶液。铝、氧化铝、氢氧化铝与强碱溶液反应都能生成它；' +
        '通入二氧化碳或加入盐酸会重新析出氢氧化铝白色沉淀。'
    },
    {
      id: 'feoh2', name: '氢氧化亚铁', formula: 'Fe(OH)2', phase: 'solid', color: C.white,
      precipColor: C.white, soluble: false, pickable: false, shelf: 'product',
      hazard: ['刺激性'], mm: 90, level: 'senior',
      note: '白色絮状沉淀，极易被空气中的氧气氧化：4Fe(OH)₂ + O₂ + 2H₂O = 4Fe(OH)₃，' +
        '颜色由白色迅速变为灰绿色，最终变成红褐色。'
    },

    /* =====================================================================
     * 二、铁（Fe³⁺ 的检验）
     * =================================================================== */
    {
      id: 'kscn', name: '硫氰化钾溶液', formula: 'KSCN', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: ['刺激性'], mm: 97,
      level: 'senior',
      note: '无色溶液，用于检验 Fe³⁺：加入后溶液变血红色（生成硫氰化铁 Fe(SCN)₃）。'
    },

    /* =====================================================================
     * 三、卤素（氯）
     * =================================================================== */
    {
      id: 'cl2', name: '氯气', formula: 'Cl2', phase: 'gas', color: C.chlorine,
      soluble: true, pickable: true, shelf: 'gas', hazard: ['有毒', '刺激性'], mm: 71,
      level: 'senior',
      note: '黄绿色、有强烈刺激性气味的有毒气体。能溶于水（1 体积水约溶解 2 体积氯气），' +
        '水溶液叫氯水，显酸性并具有漂白性。'
    },
    {
      id: 'hcl_g', name: '氯化氢气体', formula: 'HCl', phase: 'gas', color: C.offwhite,
      soluble: true, pickable: true, shelf: 'gas', hazard: ['有毒', '腐蚀性'], mm: 36.5,
      level: 'senior',
      note: '无色、有刺激性气味的气体，极易溶于水，溶于水后就是盐酸。' +
        '与氨气相遇立即化合生成氯化铵固体小颗粒，形成白烟。'
    },
    {
      id: 'hclo', name: '次氯酸', formula: 'HClO', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: ['腐蚀性', '强氧化性'], mm: 52.5,
      level: 'senior',
      note: '很弱的酸（酸性比碳酸还弱），具有强氧化性和漂白性，能使有色布条褪色。' +
        '很不稳定，见光分解：2HClO = 2HCl + O₂↑。'
    },
    {
      id: 'naclo', name: '次氯酸钠溶液', formula: 'NaClO', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: ['腐蚀性', '强氧化性'], mm: 74.5,
      level: 'senior',
      note: '无色溶液，是"84 消毒液"的有效成分。因水解显碱性；漂白、消毒时加酸可增强效果，' +
        '但不能与洁厕灵（盐酸）混用，否则会放出有毒的氯气。'
    },
    {
      id: 'ca_clo2', name: '漂白粉', formula: 'Ca(ClO)2', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid',
      hazard: ['强氧化性', '腐蚀性'], mm: 143, level: 'senior',
      note: '白色粉末，主要成分是次氯酸钙 Ca(ClO)₂，有效成分也是它。' +
        '工业上用氯气与石灰乳反应制得：2Cl₂ + 2Ca(OH)₂ = Ca(ClO)₂ + CaCl₂ + 2H₂O。'
    },

    /* =====================================================================
     * 四、硫
     * =================================================================== */
    {
      id: 'so3', name: '三氧化硫', formula: 'SO3', phase: 'liquid', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: ['腐蚀性', '刺激性'], mm: 80,
      level: 'senior',
      note: '无色易挥发的液体（熔点 16.8 ℃，常温下也常以气体形式存在）。' +
        '与水反应生成硫酸并放出大量热，遇湿空气形成酸雾。'
    },
    {
      id: 'h2so4_conc', name: '浓硫酸', formula: 'H2SO4', phase: 'liquid', color: '#e6ecef',
      soluble: true, pickable: true, shelf: 'liquid', hazard: ['腐蚀性', '强氧化性'], mm: 98,
      level: 'senior',
      note: '无色黏稠的油状液体，难挥发、沸点高（338 ℃）。具有强氧化性（加热时能氧化铜、碳等）、' +
        '吸水性和脱水性（能使蔗糖变黑"炭化"）。稀释时必须把浓硫酸沿器壁慢慢注入水中并不断搅拌。' +
        '注意：本条目是独立母体，与稀硫酸 h2so4 不是同一种物质。'
    },
    {
      id: 'h2s', name: '硫化氢', formula: 'H2S', phase: 'gas', color: C.offwhite,
      soluble: true, pickable: true, shelf: 'gas', hazard: ['有毒', '易燃'], mm: 34,
      level: 'senior',
      note: '无色、有臭鸡蛋气味的有毒气体，能溶于水（氢硫酸，弱酸）。具有可燃性和还原性：' +
        '氧气充足时点燃生成二氧化硫，氧气不足时生成单质硫。'
    },
    {
      id: 'h2so3', name: '亚硫酸', formula: 'H2SO3', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: ['刺激性'], mm: 82,
      level: 'senior',
      note: '二氧化硫溶于水生成的二元弱酸，只存在于水溶液中，不稳定，容易分解成二氧化硫和水。' +
        '具有还原性，能被氧气、氯水、酸性高锰酸钾溶液氧化。'
    },
    {
      id: 'v2o5', name: '五氧化二钒', formula: 'V2O5', phase: 'solid', color: '#c8722a',
      soluble: false, pickable: true, shelf: 'solid', hazard: ['有毒', '刺激性'], mm: 182,
      level: 'senior',
      note: '橙黄色固体，接触法制硫酸时二氧化硫氧化的催化剂（2SO₂ + O₂ ⇌ 2SO₃）。'
    },

    /* =====================================================================
     * 五、氮
     * =================================================================== */
    {
      id: 'n2', name: '氮气', formula: 'N2', phase: 'gas', color: '#dfe6ec',
      soluble: false, pickable: true, shelf: 'gas', hazard: [], mm: 28,
      level: 'both',
      note: '无色无味的气体，约占空气体积的 78%。分子中 N≡N 键很牢固，常温下化学性质很不活泼，' +
        '只有在高温、高压和催化剂条件下才能与氢气合成氨。'
    },
    {
      id: 'no', name: '一氧化氮', formula: 'NO', phase: 'gas', color: '#e2ecf2',
      soluble: 'slight', pickable: true, shelf: 'gas', hazard: ['有毒'], mm: 30,
      level: 'senior',
      note: '无色气体，难溶于水，有毒。很容易与氧气化合生成红棕色的二氧化氮：2NO + O₂ = 2NO₂，' +
        '所以只能用排水法收集。'
    },
    {
      id: 'no2', name: '二氧化氮', formula: 'NO2', phase: 'gas', color: C.no2Gas,
      soluble: true, pickable: true, shelf: 'gas', hazard: ['有毒', '腐蚀性'], mm: 46,
      level: 'senior',
      note: '红棕色、有刺激性气味的有毒气体，易溶于水并与水反应：3NO₂ + H₂O = 2HNO₃ + NO。' +
        '加压时会聚合成无色的四氧化二氮 N₂O₄。'
    },
    {
      id: 'hno3_conc', name: '浓硝酸', formula: 'HNO3', phase: 'liquid', color: '#f2ecdd',
      soluble: true, pickable: true, shelf: 'liquid', hazard: ['腐蚀性', '强氧化性'], mm: 63,
      level: 'senior',
      note: '无色易挥发的液体（质量分数约 69%），见光或受热易分解，久置会因溶有 NO₂ 而显黄色。' +
        '具有强氧化性，常温下能使铁、铝钝化，与铜反应放出红棕色的 NO₂。' +
        '注意：本条目是独立母体，与稀硝酸不是同一种物质。'
    },
    {
      id: 'hno3aq', name: '稀硝酸', formula: 'HNO3', base: 'hno3', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: true, shelf: 'liquid',
      hazard: ['腐蚀性', '强氧化性'], mm: 63, level: 'senior',
      note: '无色溶液，具有强氧化性。与铜反应生成无色的 NO；与铁反应时若硝酸过量则生成 Fe³⁺。'
    },
    {
      id: 'nh4cl', name: '氯化铵', formula: 'NH4Cl', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid',
      hazard: ['刺激性'], mm: 53.5, level: 'senior',
      note: '白色晶体，是常见的氮肥和实验室制取氨气的原料。受热易分解：NH₄Cl = NH₃↑ + HCl↑（遇冷又重新化合）。'
    },
    {
      id: 'nh42so4', name: '硫酸铵', formula: '(NH4)2SO4', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid', hazard: [], mm: 132,
      level: 'senior',
      note: '白色晶体，俗称硫铵，是常见的氮肥。水溶液因铵根水解而显弱酸性，' +
        '不能与碱性物质（如熟石灰）混合施用，否则会放出氨气而降低肥效。'
    },
    {
      id: 'nh4no3', name: '硝酸铵', formula: 'NH4NO3', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid',
      hazard: ['易爆', '强氧化性'], mm: 80, level: 'senior',
      note: '白色晶体，含氮量高，是重要的氮肥，也是工业炸药的成分。' +
        '受热或受撞击易分解甚至爆炸，必须远离火源。'
    },
    {
      id: 'nh3h2o', name: '氨水', formula: 'NH3·H2O', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: ['腐蚀性', '刺激性'], mm: 35,
      level: 'senior',
      note: '无色有刺激性气味的溶液，显弱碱性（NH₃·H₂O ⇌ NH₄⁺ + OH⁻），能使酚酞变红。' +
        '实验室常用它检验并沉淀 Al³⁺：即使氨水过量，也只能得到 Al(OH)₃ 沉淀而不会溶解。'
    },
    {
      id: 'nano2', name: '亚硝酸钠', formula: 'NaNO2', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: ['有毒'], mm: 69,
      level: 'senior',
      note: '无色溶液，二氧化氮被氢氧化钠溶液吸收的产物之一。亚硝酸钠是工业用盐，有毒，不能当食盐使用。'
    },
    {
      id: 'fe_no33', name: '硝酸铁', formula: 'Fe(NO3)3', phase: 'solution', color: C.yellow,
      soluble: true, pickable: false, shelf: 'product', hazard: ['刺激性'], mm: 242,
      level: 'senior',
      note: '黄色溶液（Fe³⁺ 的颜色）。铁与过量稀硝酸反应的产物。'
    },
    {
      id: 'pt', name: '铂催化剂', formula: 'Pt', phase: 'solid', color: C.silver,
      soluble: false, pickable: true, shelf: 'solid', hazard: [], mm: 195, level: 'senior',
      note: '银白色金属，化学性质极不活泼，是氨催化氧化（4NH₃ + 5O₂ = 4NO + 6H₂O）的催化剂。'
    },

    /* =====================================================================
     * 六、硅及其化合物
     * =================================================================== */
    {
      id: 'si', name: '硅', formula: 'Si', phase: 'solid', color: C.silicon,
      soluble: false, pickable: true, shelf: 'nonmetal', hazard: [], mm: 28, level: 'senior',
      note: '灰黑色、有金属光泽的固体（晶体硅），是良好的半导体材料，用于制造芯片和光伏电池。' +
        '常温下化学性质不活泼，但能与氟气、氢氟酸和强碱溶液反应。'
    },
    {
      id: 'sio2', name: '二氧化硅', formula: 'SiO2', phase: 'solid', color: C.offwhite,
      soluble: false, pickable: true, shelf: 'solid', hazard: [], mm: 60, level: 'senior',
      note: '无色透明的固体（石英、水晶、沙子、玛瑙的主要成分），熔点很高，是酸性氧化物。' +
        '能与强碱、氢氟酸反应，但不能与水反应。'
    },
    {
      id: 'na2sio3', name: '硅酸钠溶液', formula: 'Na2SiO3', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: ['腐蚀性'], mm: 122,
      level: 'senior',
      note: '无色黏稠的溶液，俗称水玻璃、泡花碱，是矿物胶，可作黏合剂和防火材料。' +
        '水溶液显碱性，通入二氧化碳或加入盐酸会析出硅酸胶体。'
    },
    {
      id: 'h2sio3', name: '硅酸', formula: 'H2SiO3', phase: 'solid', color: C.offwhite,
      precipColor: C.offwhite, soluble: false, pickable: false, shelf: 'product',
      hazard: [], mm: 78, level: 'senior',
      note: '白色胶状沉淀，难溶于水。硅酸钠溶液中通入二氧化碳或加入盐酸都能得到它。' +
        '硅酸受热分解得到二氧化硅，说明硅酸的酸性比碳酸还弱。'
    },
    {
      id: 'casio3', name: '硅酸钙', formula: 'CaSiO3', phase: 'solid', color: C.offwhite,
      soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 116, level: 'senior',
      note: '白色固体，是玻璃和水泥的组成成分之一。工业上高温下用二氧化硅与碳酸钙反应制得。'
    },
    {
      id: 'hf', name: '氢氟酸', formula: 'HF', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: ['腐蚀性', '有毒'], mm: 20,
      level: 'senior',
      note: '无色溶液，是唯一能与二氧化硅反应的酸：SiO₂ + 4HF = SiF₄↑ + 2H₂O，因此可用于雕刻玻璃。' +
        '氢氟酸有毒且能腐蚀皮肤，使用时必须戴橡胶手套。'
    },
    {
      id: 'sif4', name: '四氟化硅', formula: 'SiF4', phase: 'gas', color: C.offwhite,
      soluble: true, pickable: false, shelf: 'product', hazard: ['有毒', '刺激性'], mm: 104,
      level: 'senior',
      note: '无色有刺激性气味的气体，二氧化硅与氢氟酸反应时生成，是雕刻玻璃逸出的气体。'
    },

    /* =====================================================================
     * 七、有机化合物
     * =================================================================== */
    {
      id: 'c2h4', name: '乙烯', formula: 'C2H4', phase: 'gas', color: '#e6eef2',
      soluble: false, pickable: true, shelf: 'gas', hazard: ['易燃', '易爆'], mm: 28,
      level: 'senior',
      note: '无色、稍有气味的气体，密度比空气略小，难溶于水。含有碳碳双键，' +
        '能使溴水（或酸性高锰酸钾溶液）褪色，是重要的化工原料和植物生长调节剂。'
    },
    {
      id: 'c2h2', name: '乙炔', formula: 'C2H2', phase: 'gas', color: '#e6eef2',
      soluble: 'slight', pickable: true, shelf: 'gas', hazard: ['易燃', '易爆'], mm: 26,
      level: 'senior',
      note: '无色无味的气体，俗称电石气。含有碳碳三键，能使溴水褪色；' +
        '在氧气中燃烧产生明亮的火焰，氧炔焰温度可达 3000 ℃ 以上，用于焊接和切割金属。'
    },
    {
      id: 'c2h6', name: '乙烷', formula: 'C2H6', phase: 'gas', color: '#e6eef2',
      soluble: false, pickable: false, shelf: 'product', hazard: ['易燃', '易爆'], mm: 30,
      level: 'senior',
      note: '无色气体，乙烯与氢气发生加成反应的产物。'
    },
    {
      id: 'c6h6', name: '苯', formula: 'C6H6', phase: 'liquid', color: C.clearLiq,
      soluble: false, pickable: true, shelf: 'organic', hazard: ['易燃', '有毒'], mm: 78,
      level: 'senior',
      note: '无色、有特殊气味的液体，有毒，密度比水小，不溶于水，是重要的有机溶剂。' +
        '分子中没有碳碳双键，碳原子间的键完全相同，呈平面正六边形结构。'
    },
    {
      id: 'c6h12', name: '环己烷', formula: 'C6H12', phase: 'liquid', color: C.clearLiq,
      soluble: false, pickable: false, shelf: 'product', hazard: ['易燃'], mm: 84, level: 'senior',
      note: '无色液体，苯与氢气在催化剂作用下发生加成反应的产物。'
    },
    {
      id: 'c6h5br', name: '溴苯', formula: 'C6H5Br', phase: 'liquid', color: '#e8d9b0',
      soluble: false, pickable: false, shelf: 'product', hazard: ['刺激性'], mm: 157,
      level: 'senior',
      note: '无色油状液体（常因溶有溴而显褐色），密度比水大，' +
        '是苯与液溴在铁（实际起催化作用的是 FeBr₃）催化下发生取代反应的产物。'
    },
    {
      id: 'hbr', name: '溴化氢', formula: 'HBr', phase: 'gas', color: C.offwhite,
      soluble: true, pickable: false, shelf: 'product', hazard: ['有毒', '腐蚀性'], mm: 81,
      level: 'senior',
      note: '无色有刺激性气味的气体，极易溶于水。苯的溴代反应中逸出的 HBr 遇水蒸气形成白雾。'
    },
    {
      id: 'c6h5no2', name: '硝基苯', formula: 'C6H5NO2', phase: 'liquid', color: '#e8e0a8',
      soluble: false, pickable: false, shelf: 'product', hazard: ['有毒'], mm: 123,
      level: 'senior',
      note: '无色油状液体，有苦杏仁气味，有毒，密度比水大。' +
        '苯与浓硝酸在浓硫酸催化、55~60 ℃ 水浴加热条件下发生取代反应的产物。'
    },
    {
      id: 'br2', name: '液溴', formula: 'Br2', phase: 'liquid', color: C.bromine,
      soluble: 'slight', pickable: true, shelf: 'liquid', hazard: ['腐蚀性', '有毒'], mm: 160,
      level: 'senior',
      note: '深红棕色、易挥发的液体，有强烈刺激性气味，有毒且能腐蚀皮肤。' +
        '与苯需要催化剂才能取代，与乙烯、乙炔则常温下即可加成。'
    },
    {
      id: 'br2aq', name: '溴水', formula: 'Br2', base: 'br2', phase: 'solution',
      color: C.bromineWater, soluble: true, pickable: true, shelf: 'liquid',
      hazard: ['腐蚀性', '有毒'], mm: 160, level: 'senior',
      note: '橙黄色的溴水。乙烯、乙炔等含不饱和键的有机物能使溴水褪色（加成反应），' +
        '可用于区别饱和烃与不饱和烃。'
    },
    {
      id: 'ccl4', name: '四氯化碳', formula: 'CCl4', phase: 'liquid', color: C.clearLiq,
      soluble: false, pickable: true, shelf: 'organic', hazard: ['有毒'], mm: 154,
      level: 'senior',
      note: '无色、密度比水大的液体，不溶于水，是常用的有机溶剂（可萃取溴水中的溴）。'
    },
    {
      id: 'ch3cl', name: '一氯甲烷', formula: 'CH3Cl', phase: 'gas', color: '#e6eef2',
      soluble: false, pickable: false, shelf: 'product', hazard: ['有毒', '易燃'], mm: 50.5,
      level: 'senior',
      note: '无色气体，甲烷与氯气在光照下发生取代反应的第一步产物（同时生成氯化氢）。'
    },
    {
      id: 'c2h4br2', name: '1,2-二溴乙烷', formula: 'C2H4Br2', phase: 'liquid', color: '#e8dcc0',
      soluble: false, pickable: false, shelf: 'product', hazard: ['有毒'], mm: 188,
      level: 'senior',
      note: '无色油状液体，乙烯与溴（溴水）发生加成反应的产物。'
    },
    {
      id: 'c2h2br2', name: '1,2-二溴乙烯', formula: 'C2H2Br2', phase: 'liquid', color: '#e8dcc0',
      soluble: false, pickable: false, shelf: 'product', hazard: ['有毒'], mm: 186,
      level: 'senior',
      note: '无色液体，乙炔与溴按 1:1 发生加成反应的产物；溴过量时还能继续加成得到四溴乙烷。'
    },
    {
      id: 'ch3cooh', name: '乙酸', formula: 'CH3COOH', base: 'ch3cooh', phase: 'liquid',
      color: C.clearLiq, soluble: true, pickable: true, shelf: 'organic',
      hazard: ['腐蚀性', '刺激性'], mm: 60, level: 'senior',
      note: '无色有强烈刺激性气味的液体，俗称醋酸，熔点 16.6 ℃（低于此温度凝结成冰状固体，故又称冰醋酸）。' +
        '是一元弱酸，酸性比碳酸强，能与碳酸钠反应放出二氧化碳。'
    },
    {
      id: 'ch3cho', name: '乙醛', formula: 'CH3CHO', phase: 'liquid', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: ['易燃', '有毒'], mm: 44,
      level: 'senior',
      note: '无色有刺激性气味的液体，含有醛基（—CHO），能被氧气、银氨溶液、新制氢氧化铜氧化。' +
        '是乙醇催化氧化的产物。'
    },
    {
      id: 'ch3coona', name: '乙酸钠', formula: 'CH3COONa', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 82, level: 'senior',
      note: '无色溶液。乙酸与碳酸钠、氢氧化钠反应，或乙酸乙酯在碱性条件下水解都能生成它。'
    },
    {
      id: 'c2h5ona', name: '乙醇钠', formula: 'C2H5ONa', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: ['腐蚀性', '易燃'], mm: 68,
      level: 'senior',
      note: '乙醇与钠反应生成的产物（溶于乙醇），遇水立即水解成乙醇和氢氧化钠。'
    },
    {
      id: 'ch3cooc2h5', name: '乙酸乙酯', formula: 'CH3COOC2H5', phase: 'liquid', color: C.clearLiq,
      soluble: 'slight', pickable: true, shelf: 'organic', hazard: ['易燃', '刺激性'], mm: 88,
      level: 'senior',
      note: '无色、有果香味的油状液体，密度比水小，难溶于水。' +
        '由乙酸与乙醇在浓硫酸催化下发生酯化反应制得；加酸或加碱并加热都能水解。'
    },
    {
      id: 'c6h12o6', name: '葡萄糖', formula: 'C6H12O6', phase: 'solid', color: C.white,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'organic',
      hazard: [], mm: 180, level: 'senior',
      note: '白色晶体，有甜味，易溶于水。分子中含有醛基，属于还原性糖：' +
        '与新制氢氧化铜共热生成砖红色的 Cu₂O 沉淀，也能发生银镜反应。'
    },
    {
      id: 'c6h12o7', name: '葡萄糖酸', formula: 'C6H12O7', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 196, level: 'senior',
      note: '无色溶液。葡萄糖被新制氢氧化铜或银氨溶液氧化后的产物（醛基被氧化成羧基），' +
        '是葡萄糖酸钙等药物的原料。'
    },
    {
      id: 'starch', name: '淀粉溶液', formula: '(C6H10O5)n', phase: 'solution', color: '#eef3f7',
      soluble: true, pickable: true, shelf: 'organic', hazard: [], mm: 162, level: 'senior',
      note: '白色胶状溶液。淀粉是天然高分子化合物，化学式常写成 (C₆H₁₀O₅)ₙ。' +
        '遇碘单质变蓝，可用于检验碘或淀粉；在酸或酶的作用下能水解，最终产物是葡萄糖。'
    },
    {
      id: 'i2', name: '碘', formula: 'I2', phase: 'solid', color: C.iodine, dissolveColor: '#b06a2a',
      soluble: 'slight', pickable: true, shelf: 'solid', hazard: ['刺激性'], mm: 254,
      level: 'senior',
      note: '紫黑色固体，易升华（受热直接变成紫色蒸气），微溶于水，易溶于四氯化碳等有机溶剂。' +
        '遇淀粉溶液变蓝，可用于检验碘单质。'
    },
    {
      id: 'ki', name: '碘化钾溶液', formula: 'KI', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: [], mm: 166, level: 'senior',
      note: '无色溶液。氯气、溴水等氧化剂能把 I⁻ 氧化成 I₂；' +
        '用湿润的淀粉碘化钾试纸可以检验氯气等氧化性气体。'
    },
    {
      id: 'oil', name: '油脂（硬脂酸甘油酯）', formula: '(C17H35COO)3C3H5', phase: 'liquid',
      color: '#efe3a8', soluble: false, pickable: true, shelf: 'organic',
      hazard: ['易燃'], mm: 890, level: 'senior',
      note: '油脂是油和脂肪的统称，属于混合物，此处以硬脂酸甘油酯作代表物。' +
        '在碱性条件下水解（皂化反应）生成甘油和高级脂肪酸钠（肥皂的主要成分）。'
    },
    {
      id: 'c3h8o3', name: '甘油', formula: 'C3H8O3', phase: 'liquid', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 92, level: 'senior',
      note: '无色黏稠、有甜味的液体，化学名丙三醇，易溶于水，有吸水性。' +
        '是油脂皂化反应的产物之一，可用于制化妆品和硝化甘油。'
    },
    {
      id: 'c17h35coona', name: '硬脂酸钠（肥皂）', formula: 'C17H35COONa', phase: 'solid',
      color: C.offwhite, soluble: true, pickable: false, shelf: 'product',
      hazard: ['刺激性'], mm: 306, level: 'senior',
      note: '白色固体，是肥皂的主要成分，由油脂在碱性条件下水解（皂化反应）制得。'
    },
    {
      id: 'protein', name: '蛋白质溶液', formula: '—', phase: 'solution', color: '#f2f0e6',
      soluble: true, pickable: true, shelf: 'organic', hazard: [], mm: 0, level: 'senior',
      note: '蛋白质是天然高分子化合物（相对分子质量从几万到几千万），没有固定的化学式。' +
        '遇重金属盐、强酸、强碱、甲醛、乙醇或加热都会变性；遇浓硝酸会显黄色（颜色反应）。'
    },
    {
      id: 'protein_denatured', name: '变性蛋白质', formula: '—', phase: 'solid',
      color: C.offwhite, precipColor: C.offwhite, soluble: false, pickable: false,
      shelf: 'product', hazard: [], mm: 0, level: 'senior',
      note: '蛋白质受热或遇重金属盐后失去生理活性而凝结析出的固体。这个过程叫变性，是不可逆的。'
    },
    {
      id: 'polyethylene', name: '聚乙烯', formula: '(C2H4)n', phase: 'solid', color: C.offwhite,
      soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 28, level: 'senior',
      note: '白色固体，由乙烯在一定条件下发生加聚反应制得：nCH₂=CH₂ → [CH₂—CH₂]ₙ。' +
        '聚乙烯无毒，可用于制造食品包装袋、保鲜膜等。'
    },
    {
      id: 'agnh32oh', name: '银氨溶液', formula: 'Ag(NH3)2OH', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: true, shelf: 'liquid',
      hazard: ['腐蚀性', '强氧化性'], mm: 159, level: 'senior',
      note: '向硝酸银溶液中逐滴加入稀氨水直到最初生成的沉淀恰好溶解，得到的无色溶液（含二氨合银离子）。' +
        '是弱氧化剂，能把葡萄糖等含醛基的物质氧化并析出银，产生光亮的银镜。必须现配现用。'
    },

    /* =====================================================================
     * 八、电化学与其他
     * =================================================================== */
    {
      id: 'graphite', name: '石墨电极', formula: 'C', phase: 'solid', color: C.charcoal,
      soluble: false, pickable: true, shelf: 'nonmetal', hazard: [], mm: 12, level: 'both',
      note: '灰黑色、有金属光泽的固体，质软、能导电，是金刚石的同素异形体，' +
        '可用于制作电极（电解、原电池）以及铅笔芯、润滑剂。'
    },
    {
      id: 'kmno4aq', name: '酸性高锰酸钾溶液', formula: 'KMnO4', base: 'kmno4',
      phase: 'solution', color: C.kmno4, soluble: true, pickable: true, shelf: 'liquid',
      hazard: ['强氧化性', '腐蚀性'], mm: 158, level: 'senior',
      note: '紫红色溶液，具有强氧化性，是常用的氧化剂。能使乙烯、乙炔、二氧化硫、亚铁离子等还原性物质氧化而褪色，' +
        '可用于区别甲烷与乙烯。'
    },
    {
      id: 'k2cr2o7', name: '重铬酸钾溶液', formula: 'K2Cr2O7', phase: 'solution',
      color: C.k2cr2o7, soluble: true, pickable: true, shelf: 'liquid',
      hazard: ['强氧化性', '有毒'], mm: 294, level: 'senior',
      note: '橙色溶液，酸性条件下是强氧化剂（还原产物 Cr³⁺ 为绿色）。' +
        '向酸性重铬酸钾溶液中加入乙醇，溶液由橙色变为绿色，可用于检验司机是否酒后驾车。'
    },
    {
      id: 'mnso4', name: '硫酸锰', formula: 'MnSO4', phase: 'solution', color: '#f0d6dd',
      soluble: true, pickable: false, shelf: 'product', hazard: ['刺激性'], mm: 151,
      level: 'senior',
      note: '近无色（微带粉红）溶液，二氧化硫被酸性高锰酸钾溶液氧化后的还原产物之一。'
    },
    {
      id: 'k2so4', name: '硫酸钾', formula: 'K2SO4', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 174, level: 'senior',
      note: '无色溶液，高锰酸钾在酸性条件下氧化二氧化硫的产物之一，也是常用的钾肥。'
    },
    {
      id: 'fe_scn3', name: '硫氰化铁', formula: 'Fe(SCN)3', phase: 'solution', color: C.bloodRed,
      soluble: true, pickable: false, shelf: 'product', hazard: ['刺激性'], mm: 230,
      level: 'senior',
      note: '血红色溶液（严格说是多种配离子的混合物），Fe³⁺ 与 SCN⁻ 结合的特征颜色，常用于检验 Fe³⁺。'
    },
    {
      id: 'cu2o', name: '氧化亚铜', formula: 'Cu2O', phase: 'solid', color: C.cu2oRed,
      precipColor: C.cu2oRed, soluble: false, pickable: false, shelf: 'product',
      hazard: ['刺激性'], mm: 144, level: 'senior',
      note: '砖红色沉淀，葡萄糖与新制氢氧化铜在加热条件下反应生成，是检验醛基（—CHO）的经典现象。'
    },
    {
      id: 'cahco32', name: '碳酸氢钙溶液', formula: 'Ca(HCO3)2', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: false, shelf: 'product',
      hazard: [], mm: 162, level: 'senior',
      note: '无色溶液。碳酸钙与二氧化碳的水溶液作用生成，受热分解又生成碳酸钙沉淀、水和二氧化碳，' +
        '是暂时硬水加热除垢的原理。'
    },
    {
      id: 'ni', name: '镍催化剂', formula: 'Ni', phase: 'solid', color: C.metalLite,
      soluble: false, pickable: true, shelf: 'solid', hazard: ['刺激性'], mm: 59, level: 'senior',
      note: '银白色金属，常用作加氢反应的催化剂（乙烯与氢气加成、苯与氢气加成等）。'
    },

    /* =====================================================================
     * 九、指示剂
     * =================================================================== */
    {
      id: 'methylOrange', name: '甲基橙溶液', formula: 'C14H14N3NaO3S', phase: 'solution',
      color: '#e8a33d', soluble: true, pickable: true, shelf: 'indicator',
      hazard: ['刺激性'], mm: 327, level: 'senior',
      note: '橙色溶液，常用的酸碱指示剂：pH < 3.1 时显红色，3.1 ~ 4.4 之间显橙色，pH > 4.4 时显黄色。'
    }
  ];

  CHEM.registerSubstances(LIST);
})(typeof window !== 'undefined' ? window : globalThis);
