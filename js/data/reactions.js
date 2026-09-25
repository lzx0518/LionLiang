/* =============================================================================
 * 虚拟化学实验室 —— 反应规则库 (Reactions / Tests / pH Rules)
 * -----------------------------------------------------------------------------
 * 本文件是纯数据文件（传统脚本，非 ES module），只描述"什么和什么能反应、看到
 * 什么现象、需要什么条件"，不含任何渲染或仿真逻辑。引擎按下面的顺序匹配：
 *
 *   1. 取出容器内全部物质的 base id，与每条规则的 reactants 求交；
 *   2. 交集等于 reactants 的规则才是"候选规则"；
 *   3. 候选规则按 priority 降序排序，priority 相同时按"匹配到的反应物个数"降序，
 *      条数相同时按本数组出现顺序（先写的优先）；
 *   4. 取第一条命中规则按 ratio 消耗反应物、按 products 生成产物。
 *
 * ---------------------------------------------------------------------------
 * 【REACTIONS 每条规则的 schema】
 * ---------------------------------------------------------------------------
 * id          string   唯一英文/拼音 id，小写下划线，如 'fe_hcl'
 * name        string   中文名，如 '铁与稀盐酸反应'
 * type        string   必须是下列之一：
 *                      '化合反应' | '分解反应' | '置换反应' | '复分解反应'
 *                      | '氧化还原反应' | '其他'
 * reactants   string[] 必需的反应物 base id 列表（1 个或 2 个）
 *                      ★ 必须写物质库里的 base（母体 id），不是具体形态 id：
 *                        氢氧化钠固体 id 是 'naoh'、溶液 id 是 'naohaq' 且
 *                        base:'naoh'，所以规则里一律写 'naoh'；硫酸铜写
 *                        'cuso4'（'cuso4aq' 的 base 也是 'cuso4'）。
 *                        没有显式 base 的物质，base 就等于 id。
 * ratio       object   最小整数消耗比；键集合必须与 reactants 集合完全相等
 * products    Array<{id:string, n:number}>
 *                      id 用 base id 或生成物专属 id（沿用物质库已有 id），
 *                      n 为方程式中的系数
 * equation    string   化学方程式。要求：
 *                      · 用 Unicode 下标 ₂ ₃ ₄（H₂O / Fe₂O₃ / Al₂(SO₄)₃ …）；
 *                      · 生成物中的气体写 ↑，生成物中的沉淀写 ↓；
 *                      · 等号只写 '='，不要写 '△' '点燃' '通电' 等条件文字，
 *                        条件一律由 conditions 表达；
 *                      · 必须配平（原子守恒），校验脚本会逐元素核对。
 * conditions  object   6 个字段必须齐全：
 *                      heat        boolean 是否需要加热（容器温度 ≥ 60℃）
 *                      ignite      boolean 是否需要点燃（有明火）
 *                      catalyst    string|null 需要存在的催化剂 base id；不需要写 null
 *                      minTemp     number  需要的最低温度（℃），默认 0
 *                      needsWater  boolean 是否必须在水溶液中进行（容器里要有 h2o）
 *                      （另有两个可选字段：electricity 表示通电，minFraction
 *                        表示需要的气体体积分数，不写即视为不需要）
 * phenomena   object   6 个字段必须齐全：
 *                      kind      'bubble' | 'precipitate' | 'colorChange' | 'flame'
 *                                | 'smoke' | 'glow' | 'dissolve' | 'none'
 *                      gas       kind==='bubble' 时填气体 base id，否则 null
 *                      toColor   kind==='colorChange' 时填目标颜色十六进制，否则 null
 *                      pptColor  kind==='precipitate' 时填沉淀颜色十六进制，否则 null
 *                      message   完整的中文实验现象描述
 *                      heat      热效应 kJ/mol：放热为正数，吸热为负数，不明显写 0
 * priority    number   可选，默认 0。数值越大越优先匹配，用于解决规则冲突。
 *                      典型冲突：容器里同时有 Ca(OH)₂ 和 CO₂ 时，既能匹配
 *                      'CO₂ + H₂O → H₂CO₃'，也能匹配 'CO₂ + Ca(OH)₂ →
 *                      CaCO₃↓ + H₂O'；后者才是真实的（石灰水变浑浊），因此给
 *                      后者 priority:25。又如 C + O₂ 既能生成 CO₂ 也能生成 CO，
 *                      氧气充足（priority 高）的 CO₂ 规则优先。
 * indicator   boolean  可选，默认 false。true 表示"指示剂显色"，引擎不消耗
 *                      任何反应物，只改变指示剂/溶液颜色。
 * safety      string   可选，安全提示
 * note        string   可选，教学说明
 *
 * ---------------------------------------------------------------------------
 * 【TESTS 每条检验方法的 schema】
 * ---------------------------------------------------------------------------
 * id       string   唯一 id
 * name     string   中文名
 * applies  string   'gas' | 'liquid' | 'both'
 * tip      string   操作提示
 * rules    Array    从上到下匹配，命中即返回：
 *          { match: ['o2'], minFraction: 0.3, result, message, pass }
 *            match        需要存在的气体 base id 列表
 *            minFraction  可选，该气体的体积分数下限
 *            maxFraction  可选，该气体的体积分数上限
 *            phBelow/phAbove 可选，待测液 pH 范围（与 match 二选一）
 *            result       结果短语（显示在结论处）
 *            message      中文现象描述
 *            pass         boolean，是否通过检验
 * fallback { result, message, pass } 全部 rules 未命中时的兜底结果
 *
 * ---------------------------------------------------------------------------
 * 【PH_RULES 的 schema】 { id: 物质 base id, ph: 近似 pH, note: 中文说明 }
 * ---------------------------------------------------------------------------
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});

  /* 颜色常量：与 substances.js 的配色保持一致，避免各条规则写出不同色号 */
  var C = {
    white: '#eef1f5',        /* 白色 */
    copperRed: '#c1743a',    /* 紫红色（铜） */
    paleGreen: '#9fd39a',    /* 浅绿色（亚铁离子） */
    yellow: '#e0b64a',       /* 黄色（铁离子） */
    blue: '#2f8fd6',         /* 蓝色（铜离子） */
    deepBlue: '#2f6fd6',     /* 深蓝色（石蕊遇碱） */
    paleYellow: '#f4e2a1',   /* 浅黄色（硫在空气中燃烧） */
    pink: '#ff5f9e',         /* 酚酞红 */
    phenolphthalein: '#f4f8ff', /* 无色酚酞本色 */
    litmusRed: '#e0455a',    /* 石蕊红 */
    litmusPurple: '#8e6bbf', /* 石蕊紫（中性） */
    black: '#1e2124',        /* 黑色 */
    brickRed: '#a0522d',     /* 红褐色 */
    colorless: '#eaf4ff'     /* 无色溶液 */
  };

  var REACTIONS = [

    /* =======================================================================
     * 一、化合反应 / 燃烧
     * ===================================================================== */
    {
      id: 'mg_o2',
      name: '镁在氧气中燃烧',
      type: '化合反应',
      reactants: ['mg', 'o2'],
      ratio: { mg: 2, o2: 1 },
      products: [{ id: 'mgo', n: 2 }],
      equation: '2Mg + O₂ = 2MgO',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'glow', gas: null, toColor: null, pptColor: null,
        message: '镁条剧烈燃烧，发出耀眼的白光，放出大量的热，生成白色固体',
        heat: 1204
      },
      safety: '不要直视镁燃烧的强光，以免灼伤眼睛',
      note: '2Mg + O₂ = 2MgO，属于化合反应，也是放热的氧化反应'
    },
    {
      id: 'fe_o2',
      name: '铁在氧气中燃烧',
      type: '化合反应',
      reactants: ['fe', 'o2'],
      ratio: { fe: 3, o2: 2 },
      products: [{ id: 'fe3o4', n: 1 }],
      equation: '3Fe + 2O₂ = Fe₃O₄',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'glow', gas: null, toColor: null, pptColor: null,
        message: '铁丝在氧气中剧烈燃烧，火星四射，放出大量的热，生成黑色固体',
        heat: 1118
      },
      safety: '集气瓶底部要预先放少量水或细沙，防止溅落的高温熔化物炸裂瓶底',
      note: '生成物是四氧化三铁（黑色，有磁性），不是氧化铁；铁丝要绕成螺旋状以增大受热面积'
    },
    {
      id: 'al_o2',
      name: '铝与氧气反应',
      type: '化合反应',
      reactants: ['al', 'o2'],
      ratio: { al: 4, o2: 3 },
      products: [{ id: 'al2o3', n: 2 }],
      equation: '4Al + 3O₂ = 2Al₂O₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '常温下铝表面很快生成一层致密的氧化铝薄膜，看不到明显现象；加热时铝箔熔化但不滴落',
        heat: 1676
      },
      note: '致密的氧化铝薄膜阻止内部铝继续被氧化，所以铝具有良好的抗腐蚀性能'
    },
    {
      id: 'c_o2_full',
      name: '木炭在氧气中充分燃烧',
      type: '化合反应',
      reactants: ['c', 'o2'],
      ratio: { c: 1, o2: 1 },
      products: [{ id: 'co2', n: 1 }],
      equation: 'C + O₂ = CO₂',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'glow', gas: null, toColor: null, pptColor: null,
        message: '木炭在氧气中剧烈燃烧，发出白光，放出热量，生成能使澄清石灰水变浑浊的气体',
        heat: 393
      },
      priority: 20,
      note: '氧气充足时碳完全燃烧生成二氧化碳，这是放热最多的情形'
    },
    {
      id: 'c_o2_less',
      name: '木炭不充分燃烧生成一氧化碳',
      type: '化合反应',
      reactants: ['c', 'o2'],
      ratio: { c: 2, o2: 1 },
      products: [{ id: 'co', n: 2 }],
      equation: '2C + O₂ = 2CO',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '氧气不足时木炭缓慢燃烧，发出微弱的蓝色火焰，生成无色有毒的一氧化碳气体',
        heat: 221
      },
      safety: '一氧化碳有毒，实验必须在通风处进行，严禁在密闭空间内进行',
      note: '氧气不充足时碳燃烧生成 CO；CO 有毒，是煤气中毒的元凶'
    },
    {
      id: 's_o2',
      name: '硫在氧气中燃烧',
      type: '化合反应',
      reactants: ['s', 'o2'],
      ratio: { s: 1, o2: 1 },
      products: [{ id: 'so2', n: 1 }],
      equation: 'S + O₂ = SO₂',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '硫在氧气中燃烧发出明亮的蓝紫色火焰，放出热量，生成有刺激性气味的气体；在空气中燃烧则发出微弱的淡蓝色火焰',
        heat: 297
      },
      safety: '二氧化硫有毒且有刺激性气味，实验应在通风橱中进行，集气瓶中预先放少量水吸收尾气',
      note: '可燃物在氧气中燃烧比在空气中更剧烈，说明氧气的浓度影响燃烧的剧烈程度'
    },
    {
      id: 'p_o2',
      name: '红磷在氧气中燃烧',
      type: '化合反应',
      reactants: ['p', 'o2'],
      ratio: { p: 4, o2: 5 },
      products: [{ id: 'p2o5', n: 2 }],
      equation: '4P + 5O₂ = 2P₂O₅',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'smoke', gas: null, toColor: null, pptColor: null,
        message: '红磷剧烈燃烧，发出黄白色火焰，产生大量白烟，放出热量',
        heat: 1544
      },
      safety: '白烟（五氧化二磷）有毒且有腐蚀性，实验需在通风处进行',
      note: '白烟是五氧化二磷的固体小颗粒，不是白雾；该反应可用于测定空气中氧气的含量'
    },
    {
      id: 'h2_o2',
      name: '氢气在氧气中燃烧',
      type: '化合反应',
      reactants: ['h2', 'o2'],
      ratio: { h2: 2, o2: 1 },
      products: [{ id: 'h2o', n: 2 }],
      equation: '2H₂ + O₂ = 2H₂O',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '氢气在空气中燃烧，产生淡蓝色火焰，放出大量的热，在干冷烧杯内壁出现水雾',
        heat: 572
      },
      safety: '点燃氢气前必须验纯，不纯的氢气点燃会发生爆炸',
      note: '氢气是最理想的清洁燃料，燃烧产物只有水，不污染环境'
    },
    {
      id: 'co_o2',
      name: '一氧化碳燃烧',
      type: '化合反应',
      reactants: ['co', 'o2'],
      ratio: { co: 2, o2: 1 },
      products: [{ id: 'co2', n: 2 }],
      equation: '2CO + O₂ = 2CO₂',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '一氧化碳燃烧发出蓝色火焰，放出大量的热，生成能使澄清石灰水变浑浊的气体',
        heat: 566
      },
      safety: '一氧化碳有毒，点燃前必须验纯，实验须在通风处进行',
      note: 'CO 燃烧既是化合反应，也是典型的氧化还原反应，CO 作还原剂'
    },
    {
      id: 'ch4_o2',
      name: '甲烷燃烧',
      type: '氧化还原反应',
      reactants: ['ch4', 'o2'],
      ratio: { ch4: 1, o2: 2 },
      products: [{ id: 'co2', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'CH₄ + 2O₂ = CO₂ + 2H₂O',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '甲烷燃烧发出明亮的蓝色火焰，放出大量的热，干冷烧杯内壁出现水雾，澄清石灰水变浑浊',
        heat: 890
      },
      safety: '点燃甲烷前必须验纯，与空气混合遇明火可能发生爆炸',
      note: '检验燃烧产物：水雾证明含氢元素，使石灰水变浑浊证明含碳元素'
    },
    {
      id: 'c2h5oh_o2',
      name: '乙醇燃烧',
      type: '氧化还原反应',
      reactants: ['c2h5oh', 'o2'],
      ratio: { c2h5oh: 1, o2: 3 },
      products: [{ id: 'co2', n: 2 }, { id: 'h2o', n: 3 }],
      equation: 'C₂H₅OH + 3O₂ = 2CO₂ + 3H₂O',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '乙醇燃烧发出淡蓝色火焰，放出大量的热，杯壁出现水雾，生成的气体能使澄清石灰水变浑浊',
        heat: 1367
      },
      safety: '乙醇易挥发易燃，点燃前必须验纯，熄灭酒精灯要用灯帽盖灭',
      note: '乙醇俗称酒精，可作燃料，属于可再生能源'
    },
    {
      id: 'cu_o2',
      name: '铜在空气中加热',
      type: '化合反应',
      reactants: ['cu', 'o2'],
      ratio: { cu: 2, o2: 1 },
      products: [{ id: 'cuo', n: 2 }],
      equation: '2Cu + O₂ = 2CuO',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.black, pptColor: null,
        message: '紫红色的铜片表面逐渐变黑，生成黑色固体氧化铜',
        heat: 157
      },
      note: '铜在潮湿空气中会生成铜绿：2Cu + O₂ + H₂O + CO₂ = Cu₂(OH)₂CO₃'
    },
    {
      id: 'cao_h2o',
      name: '生石灰与水反应',
      type: '化合反应',
      reactants: ['cao', 'h2o'],
      ratio: { cao: 1, h2o: 1 },
      products: [{ id: 'caoh2', n: 1 }],
      equation: 'CaO + H₂O = Ca(OH)₂',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色块状固体逐渐松散，剧烈放热，温度明显升高，甚至能使水沸腾',
        heat: 65
      },
      safety: '反应放出大量热，不要用手直接接触容器外壁',
      note: '生石灰常用作食品干燥剂，就是利用它能与水反应的性质'
    },
    {
      id: 'co2_h2o',
      name: '二氧化碳与水反应',
      type: '化合反应',
      reactants: ['co2', 'h2o'],
      ratio: { co2: 1, h2o: 1 },
      products: [{ id: 'h2co3', n: 1 }],
      equation: 'CO₂ + H₂O = H₂CO₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '二氧化碳溶解于水，看不到明显现象，但溶液能使紫色石蕊溶液变红',
        heat: -20
      },
      note: '碳酸能使紫色石蕊变红，说明二氧化碳的水溶液显酸性，但二氧化碳本身不能使石蕊变红'
    },
    {
      id: 'co2_c',
      name: '二氧化碳与灼热的碳反应',
      type: '化合反应',
      reactants: ['co2', 'c'],
      ratio: { co2: 1, c: 1 },
      products: [{ id: 'co', n: 2 }],
      equation: 'CO₂ + C = 2CO',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 600, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '灼热的碳与二氧化碳反应，生成无色有毒的一氧化碳气体（无明显可见现象）',
        heat: -172
      },
      safety: '生成的一氧化碳有毒，尾气必须点燃处理或回收',
      note: '该反应是吸热反应，也是炼铁炉中产生 CO 的重要途径之一'
    },
    {
      id: 'fe_s',
      name: '铁与硫加热化合',
      type: '化合反应',
      reactants: ['fe', 's'],
      ratio: { fe: 1, s: 1 },
      products: [{ id: 'fes', n: 1 }],
      equation: 'Fe + S = FeS',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'glow', gas: null, toColor: null, pptColor: null,
        message: '混合物加热后开始红热，持续反应并放出热量，生成黑色固体硫化亚铁',
        heat: 100
      },
      note: '铁与硫反应生成 FeS（铁显 +2 价），而铁在氧气中燃烧生成 Fe₃O₄'
    },
    {
      id: 'mg_co2',
      name: '镁在二氧化碳中燃烧',
      type: '置换反应',
      reactants: ['mg', 'co2'],
      ratio: { mg: 2, co2: 1 },
      products: [{ id: 'mgo', n: 2 }, { id: 'c', n: 1 }],
      equation: '2Mg + CO₂ = 2MgO + C',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'smoke', gas: null, toColor: null, pptColor: null,
        message: '镁条在二氧化碳中继续剧烈燃烧，发出耀眼白光，瓶壁出现黑色固体，瓶内壁附着白色粉末',
        heat: 810
      },
      safety: '镁燃烧时不能用二氧化碳灭火器扑救，也不能用水以外的潮湿物品覆盖',
      note: '该反应说明燃烧不一定要有氧气参加，二氧化碳在特定条件下也能支持燃烧'
    },

    /* =======================================================================
     * 二、分解反应
     * ===================================================================== */
    {
      id: 'kmno4_heat',
      name: '高锰酸钾受热分解',
      type: '分解反应',
      reactants: ['kmno4'],
      ratio: { kmno4: 2 },
      products: [{ id: 'k2mno4', n: 1 }, { id: 'mno2', n: 1 }, { id: 'o2', n: 1 }],
      equation: '2KMnO₄ = K₂MnO₄ + MnO₂ + O₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'o2', toColor: null, pptColor: null,
        message: '紫黑色固体受热后逐渐减少，导管口有气泡连续放出，收集到的气体能使带火星的木条复燃',
        heat: 0
      },
      safety: '试管口要塞一团棉花，防止高锰酸钾粉末进入导管；停止加热前先把导管移出水面',
      note: '固体由紫黑色变为黑色（K₂MnO₄ 与 MnO₂ 的混合物），这是实验室制取氧气的常用方法之一'
    },
    {
      id: 'kclo3_heat',
      name: '氯酸钾在二氧化锰催化下受热分解',
      type: '分解反应',
      reactants: ['kclo3'],
      ratio: { kclo3: 2 },
      products: [{ id: 'kcl', n: 2 }, { id: 'o2', n: 3 }],
      equation: '2KClO₃ = 2KCl + 3O₂↑',
      conditions: { heat: true, ignite: false, catalyst: 'mno2', minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'o2', toColor: null, pptColor: null,
        message: '白色固体受热熔化，产生大量气泡，收集到的气体能使带火星的木条复燃；加入二氧化锰后反应速率明显加快',
        heat: 0
      },
      safety: '氯酸钾与可燃物混合受热易爆炸，药品中不能混入纸屑等有机物',
      note: '二氧化锰是催化剂，反应前后质量和化学性质都不改变，只改变反应速率'
    },
    {
      id: 'h2o2_mno2',
      name: '过氧化氢在二氧化锰催化下分解',
      type: '分解反应',
      reactants: ['h2o2'],
      ratio: { h2o2: 2 },
      products: [{ id: 'h2o', n: 2 }, { id: 'o2', n: 1 }],
      equation: '2H₂O₂ = 2H₂O + O₂↑',
      conditions: { heat: false, ignite: false, catalyst: 'mno2', minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'o2', toColor: null, pptColor: null,
        message: '加入二氧化锰后，溶液中立即产生大量气泡，带火星的木条伸入后复燃，反应后黑色粉末仍为二氧化锰',
        heat: -196
      },
      note: '常温下即可进行，不需要加热；二氧化锰是催化剂，可回收重复使用'
    },
    {
      id: 'h2o2_slow',
      name: '过氧化氢缓慢分解',
      type: '分解反应',
      reactants: ['h2o2'],
      ratio: { h2o2: 2 },
      products: [{ id: 'h2o', n: 2 }, { id: 'o2', n: 1 }],
      equation: '2H₂O₂ = 2H₂O + O₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'o2', toColor: null, pptColor: null,
        message: '不加入催化剂时，溶液中只缓慢冒出少量气泡，需要较长时间才能收集到一瓶氧气',
        heat: -196
      },
      note: '没有催化剂时反应很慢；过氧化氢应保存在棕色瓶中并避光放置，防止缓慢分解'
    },
    {
      id: 'h2o_electric',
      name: '电解水',
      type: '分解反应',
      reactants: ['h2o'],
      ratio: { h2o: 2 },
      products: [{ id: 'h2', n: 2 }, { id: 'o2', n: 1 }],
      equation: '2H₂O = 2H₂↑ + O₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true, electricity: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '两电极上都有气泡产生，负极产生的气体体积约为正极的两倍；负极气体点燃产生淡蓝色火焰，正极气体使带火星的木条复燃',
        heat: -572
      },
      safety: '氢气与氧气的混合气遇明火会爆炸，收集气体时要分别收集并及时检验',
      note: '水是由氢元素和氧元素组成的，化学变化中分子可分而原子不可分。可加入少量硫酸钠溶液增强导电性'
    },
    {
      id: 'caco3_heat',
      name: '碳酸钙高温分解',
      type: '分解反应',
      reactants: ['caco3'],
      ratio: { caco3: 1 },
      products: [{ id: 'cao', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'CaCO₃ = CaO + CO₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 600, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '高温下白色固体逐渐分解，生成白色疏松的生石灰，同时放出能使澄清石灰水变浑浊的气体',
        heat: -178
      },
      note: '工业上高温煅烧石灰石制生石灰，属于吸热反应'
    },
    {
      id: 'nahco3_heat',
      name: '碳酸氢钠受热分解',
      type: '分解反应',
      reactants: ['nahco3'],
      ratio: { nahco3: 2 },
      products: [{ id: 'na2co3', n: 1 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: '2NaHCO₃ = Na₂CO₃ + H₂O + CO₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '白色固体受热分解，试管口有水珠出现，放出的气体能使澄清石灰水变浑浊',
        heat: 129
      },
      note: '碳酸氢钠俗称小苏打，受热易分解，可用于焙制糕点（受热产生 CO₂ 使糕点疏松）'
    },
    {
      id: 'nh4hco3_heat',
      name: '碳酸氢铵受热分解',
      type: '分解反应',
      reactants: ['nh4hco3'],
      ratio: { nh4hco3: 1 },
      products: [{ id: 'nh3', n: 1 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'NH₄HCO₃ = NH₃↑ + H₂O + CO₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'co2', toColor: null, pptColor: null,
        message: '白色固体受热逐渐消失，产生大量气体，闻到刺激性气味（氨气），试管口有水珠，气体能使澄清石灰水变浑浊、使湿润的红色石蕊试纸变蓝',
        heat: 0
      },
      safety: '氨气有刺激性气味，实验需在通风处进行',
      note: '碳酸氢铵是常见氮肥，受热易分解，因此施用后要及时覆土，避免肥效损失。产物中的氨气（NH₃）在物质库中暂无条目，故 phenomena.gas 记为可检验的 CO₂，氨气只在现象描述中体现'
    },
    {
      id: 'cu2oh2co3_heat',
      name: '碱式碳酸铜受热分解',
      type: '分解反应',
      reactants: ['cu2oh2co3'],
      ratio: { cu2oh2co3: 1 },
      products: [{ id: 'cuo', n: 2 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'Cu₂(OH)₂CO₃ = 2CuO + H₂O + CO₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.black, pptColor: null,
        message: '绿色固体逐渐变成黑色，试管口有水珠生成，放出的气体能使澄清石灰水变浑浊',
        heat: 0
      },
      note: '铜绿受热分解生成氧化铜、水和二氧化碳，说明铜绿中含有铜、氢、碳、氧四种元素'
    },
    {
      id: 'h2co3_decompose',
      name: '碳酸分解',
      type: '分解反应',
      reactants: ['h2co3'],
      ratio: { h2co3: 1 },
      products: [{ id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'H₂CO₃ = H₂O + CO₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'co2', toColor: null, pptColor: null,
        message: '溶液中有气泡逸出，气体能使澄清石灰水变浑浊，红色石蕊溶液重新变回紫色',
        heat: 0
      },
      note: '碳酸很不稳定，常温下也会缓慢分解，加热时分解加快'
    },

    /* =======================================================================
     * 三、金属 + 酸（置换反应）
     * ===================================================================== */
    {
      id: 'mg_hcl',
      name: '镁与稀盐酸反应',
      type: '置换反应',
      reactants: ['mg', 'hcl'],
      ratio: { mg: 1, hcl: 2 },
      products: [{ id: 'mgcl2', n: 1 }, { id: 'h2', n: 1 }],
      equation: 'Mg + 2HCl = MgCl₂ + H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '镁条表面立即产生大量气泡，反应非常剧烈，镁条很快溶解，试管外壁明显发热',
        heat: -462
      },
      safety: '点燃氢气前必须验纯',
      note: '镁、铝、锌、铁都能与稀盐酸反应放出氢气，反应速率依次减弱'
    },
    {
      id: 'zn_hcl',
      name: '锌与稀盐酸反应',
      type: '置换反应',
      reactants: ['zn', 'hcl'],
      ratio: { zn: 1, hcl: 2 },
      products: [{ id: 'zncl2', n: 1 }, { id: 'h2', n: 1 }],
      equation: 'Zn + 2HCl = ZnCl₂ + H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '锌粒表面产生大量气泡，锌粒逐渐溶解，溶液仍然无色',
        heat: -153
      },
      safety: '点燃氢气前必须验纯',
      note: '实验室常用锌粒与稀盐酸（或稀硫酸）反应制取氢气，反应速率适中便于收集'
    },
    {
      id: 'fe_hcl',
      name: '铁与稀盐酸反应',
      type: '置换反应',
      reactants: ['fe', 'hcl'],
      ratio: { fe: 1, hcl: 2 },
      products: [{ id: 'fecl2', n: 1 }, { id: 'h2', n: 1 }],
      equation: 'Fe + 2HCl = FeCl₂ + H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '铁钉表面产生大量气泡，溶液由无色逐渐变为浅绿色，铁钉慢慢变细',
        heat: -87
      },
      safety: '点燃氢气前必须验纯',
      note: '铁与稀盐酸反应生成氯化亚铁，铁显 +2 价，溶液呈浅绿色'
    },
    {
      id: 'al_hcl',
      name: '铝与稀盐酸反应',
      type: '置换反应',
      reactants: ['al', 'hcl'],
      ratio: { al: 2, hcl: 6 },
      products: [{ id: 'alcl3', n: 2 }, { id: 'h2', n: 3 }],
      equation: '2Al + 6HCl = 2AlCl₃ + 3H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '铝片表面产生大量气泡，反应较剧烈，铝片逐渐溶解，试管壁发热',
        heat: -1049
      },
      safety: '点燃氢气前必须验纯',
      note: '开始反应较慢是因为表面有致密的氧化铝薄膜，薄膜溶解后反应迅速加快'
    },
    {
      id: 'mg_h2so4',
      name: '镁与稀硫酸反应',
      type: '置换反应',
      reactants: ['mg', 'h2so4'],
      ratio: { mg: 1, h2so4: 1 },
      products: [{ id: 'mgso4', n: 1 }, { id: 'h2', n: 1 }],
      equation: 'Mg + H₂SO₄ = MgSO₄ + H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '镁条表面产生大量气泡，反应剧烈，镁条很快溶解',
        heat: -466
      },
      safety: '点燃氢气前必须验纯',
      note: '金属与稀硫酸反应生成相应的硫酸盐和氢气'
    },
    {
      id: 'zn_h2so4',
      name: '锌与稀硫酸反应',
      type: '置换反应',
      reactants: ['zn', 'h2so4'],
      ratio: { zn: 1, h2so4: 1 },
      products: [{ id: 'znso4', n: 1 }, { id: 'h2', n: 1 }],
      equation: 'Zn + H₂SO₄ = ZnSO₄ + H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '锌粒表面产生大量气泡，锌粒逐渐溶解，溶液无色',
        heat: -158
      },
      safety: '点燃氢气前必须验纯',
      note: '实验室制取氢气常用锌与稀硫酸反应，用排水法或向下排空气法收集'
    },
    {
      id: 'fe_h2so4',
      name: '铁与稀硫酸反应',
      type: '置换反应',
      reactants: ['fe', 'h2so4'],
      ratio: { fe: 1, h2so4: 1 },
      products: [{ id: 'feso4', n: 1 }, { id: 'h2', n: 1 }],
      equation: 'Fe + H₂SO₄ = FeSO₄ + H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '铁钉表面产生气泡，溶液由无色变为浅绿色，铁钉逐渐变细',
        heat: -89
      },
      safety: '点燃氢气前必须验纯',
      note: '铁与稀硫酸反应生成硫酸亚铁（浅绿色），铁显 +2 价'
    },
    {
      id: 'al_h2so4',
      name: '铝与稀硫酸反应',
      type: '置换反应',
      reactants: ['al', 'h2so4'],
      ratio: { al: 2, h2so4: 3 },
      products: [{ id: 'al2so43', n: 1 }, { id: 'h2', n: 3 }],
      equation: '2Al + 3H₂SO₄ = Al₂(SO₄)₃ + 3H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '铝片表面产生大量气泡，铝片逐渐溶解，反应放热明显',
        heat: -1060
      },
      safety: '点燃氢气前必须验纯',
      note: '配平要点：铝显 +3 价，生成 Al₂(SO₄)₃，故系数为 2 : 3 : 1 : 3'
    },

    /* =======================================================================
     * 四、金属 + 盐溶液（置换反应）
     * ===================================================================== */
    {
      id: 'fe_cuso4',
      name: '铁与硫酸铜溶液反应',
      type: '置换反应',
      reactants: ['fe', 'cuso4'],
      ratio: { fe: 1, cuso4: 1 },
      products: [{ id: 'feso4', n: 1 }, { id: 'cu', n: 1 }],
      equation: 'Fe + CuSO₄ = FeSO₄ + Cu',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.paleGreen, pptColor: C.copperRed,
        message: '铁钉表面覆盖一层紫红色的铜，蓝色溶液逐渐变成浅绿色',
        heat: -54
      },
      note: '"曾青得铁则化为铜"，这是湿法冶铜的原理；活动性 Fe > Cu'
    },
    {
      id: 'zn_cuso4',
      name: '锌与硫酸铜溶液反应',
      type: '置换反应',
      reactants: ['zn', 'cuso4'],
      ratio: { zn: 1, cuso4: 1 },
      products: [{ id: 'znso4', n: 1 }, { id: 'cu', n: 1 }],
      equation: 'Zn + CuSO₄ = ZnSO₄ + Cu',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.colorless, pptColor: C.copperRed,
        message: '锌粒表面覆盖一层紫红色的铜，蓝色溶液逐渐变为无色',
        heat: -217
      },
      note: '活动性 Zn > Cu，锌能把铜从它的盐溶液中置换出来'
    },
    {
      id: 'al_cuso4',
      name: '铝与硫酸铜溶液反应',
      type: '置换反应',
      reactants: ['al', 'cuso4'],
      ratio: { al: 2, cuso4: 3 },
      products: [{ id: 'al2so43', n: 1 }, { id: 'cu', n: 3 }],
      equation: '2Al + 3CuSO₄ = Al₂(SO₄)₃ + 3Cu',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.colorless, pptColor: C.copperRed,
        message: '铝片表面很快覆盖一层红色的铜，蓝色溶液逐渐变为无色，溶液温度升高',
        heat: -700
      },
      note: '配平要点：铝显 +3 价，故 Al 前系数为 2、CuSO₄ 前系数为 3'
    },
    {
      id: 'mg_cuso4',
      name: '镁与硫酸铜溶液反应',
      type: '置换反应',
      reactants: ['mg', 'cuso4'],
      ratio: { mg: 1, cuso4: 1 },
      products: [{ id: 'mgso4', n: 1 }, { id: 'cu', n: 1 }],
      equation: 'Mg + CuSO₄ = MgSO₄ + Cu',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.colorless, pptColor: C.copperRed,
        message: '镁条表面析出红色的铜，蓝色溶液变为无色，同时有少量气泡产生（镁与酸性溶液反应）',
        heat: -350
      },
      safety: '反应较剧烈，镁条不宜过细，注意防止液体溅出',
      note: '活动性 Mg > Cu，反应放热明显，有时会看到溶液变浑浊（生成氢氧化镁）'
    },
    {
      id: 'cu_agno3',
      name: '铜与硝酸银溶液反应',
      type: '置换反应',
      reactants: ['cu', 'agno3'],
      ratio: { cu: 1, agno3: 2 },
      products: [{ id: 'cu_no32', n: 1 }, { id: 'ag', n: 2 }],
      equation: 'Cu + 2AgNO₃ = Cu(NO₃)₂ + 2Ag',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.blue, pptColor: C.white,
        message: '铜丝表面覆盖一层银白色的固体，溶液由无色逐渐变为蓝色',
        heat: -147
      },
      note: '活动性 Cu > Ag；由"铜丝变银白、溶液变蓝"可证明铜比银活泼'
    },
    {
      id: 'fe_agno3',
      name: '铁与硝酸银溶液反应',
      type: '置换反应',
      reactants: ['fe', 'agno3'],
      ratio: { fe: 1, agno3: 2 },
      products: [{ id: 'fe_no32', n: 1 }, { id: 'ag', n: 2 }],
      equation: 'Fe + 2AgNO₃ = Fe(NO₃)₂ + 2Ag',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.paleGreen, pptColor: C.white,
        message: '铁钉表面附着银白色的银，溶液由无色变为浅绿色',
        heat: -180
      },
      note: '铁与硝酸银反应生成硝酸亚铁，铁显 +2 价'
    },
    {
      id: 'zn_agno3',
      name: '锌与硝酸银溶液反应',
      type: '置换反应',
      reactants: ['zn', 'agno3'],
      ratio: { zn: 1, agno3: 2 },
      products: [{ id: 'zn_no32', n: 1 }, { id: 'ag', n: 2 }],
      equation: 'Zn + 2AgNO₃ = Zn(NO₃)₂ + 2Ag',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.colorless, pptColor: C.silver,
        message: '锌粒表面覆盖一层银白色的银，溶液仍为无色，锌粒逐渐变细',
        heat: -300
      },
      note: '活动性 Zn > Ag，这是比较金属活动性的经典实验之一'
    },

    /* =======================================================================
     * 五、金属氧化物 + 酸（复分解反应）
     * ===================================================================== */
    {
      id: 'fe2o3_hcl',
      name: '氧化铁与稀盐酸反应',
      type: '复分解反应',
      reactants: ['fe2o3', 'hcl'],
      ratio: { fe2o3: 1, hcl: 6 },
      products: [{ id: 'fecl3', n: 2 }, { id: 'h2o', n: 3 }],
      equation: 'Fe₂O₃ + 6HCl = 2FeCl₃ + 3H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.yellow, pptColor: null,
        message: '红棕色粉末逐渐溶解，溶液由无色变为黄色',
        heat: -130
      },
      note: '工业上用稀盐酸除铁锈就是利用这一反应；除锈时盐酸不能过量，否则会腐蚀铁制品'
    },
    {
      id: 'fe2o3_h2so4',
      name: '氧化铁与稀硫酸反应',
      type: '复分解反应',
      reactants: ['fe2o3', 'h2so4'],
      ratio: { fe2o3: 1, h2so4: 3 },
      products: [{ id: 'fe2so43', n: 1 }, { id: 'h2o', n: 3 }],
      equation: 'Fe₂O₃ + 3H₂SO₄ = Fe₂(SO₄)₃ + 3H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.yellow, pptColor: null,
        message: '红棕色粉末逐渐溶解，溶液变成黄色',
        heat: -140
      },
      note: '铁锈与稀硫酸反应生成硫酸铁（黄色溶液），铁显 +3 价'
    },
    {
      id: 'cuo_hcl',
      name: '氧化铜与稀盐酸反应',
      type: '复分解反应',
      reactants: ['cuo', 'hcl'],
      ratio: { cuo: 1, hcl: 2 },
      products: [{ id: 'cucl2', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'CuO + 2HCl = CuCl₂ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.blue, pptColor: null,
        message: '黑色粉末逐渐溶解，溶液由无色变为蓝绿色',
        heat: -64
      },
      note: '黑色氧化铜溶解得到蓝绿色溶液，说明氧化铜能与酸反应生成盐和水'
    },
    {
      id: 'cuo_h2so4',
      name: '氧化铜与稀硫酸反应',
      type: '复分解反应',
      reactants: ['cuo', 'h2so4'],
      ratio: { cuo: 1, h2so4: 1 },
      products: [{ id: 'cuso4', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'CuO + H₂SO₄ = CuSO₄ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.blue, pptColor: null,
        message: '黑色粉末逐渐溶解，溶液由无色变为蓝色',
        heat: -85
      },
      note: '生成蓝色硫酸铜溶液，可用于说明"酸能与金属氧化物反应生成盐和水"'
    },
    {
      id: 'mgo_hcl',
      name: '氧化镁与稀盐酸反应',
      type: '复分解反应',
      reactants: ['mgo', 'hcl'],
      ratio: { mgo: 1, hcl: 2 },
      products: [{ id: 'mgcl2', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'MgO + 2HCl = MgCl₂ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色固体逐渐溶解，溶液仍为无色，试管壁微微发热',
        heat: -110
      },
      note: '氧化镁是碱性氧化物，能与酸反应生成盐和水'
    },
    {
      id: 'cao_hcl',
      name: '氧化钙与稀盐酸反应',
      type: '复分解反应',
      reactants: ['cao', 'hcl'],
      ratio: { cao: 1, hcl: 2 },
      products: [{ id: 'cacl2', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'CaO + 2HCl = CaCl₂ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色块状固体逐渐溶解，溶液无色澄清，同时明显放热',
        heat: -190
      },
      note: '氧化钙与盐酸反应生成氯化钙和水，是"金属氧化物 + 酸"的通例'
    },
    /* 说明：'氧化铝与稀盐酸反应' 未列入本文件，因为物质库中没有 al2o3 这一
     * 反应物条目（Al₂O₃ 只出现在 al_o2 的生成物中），规则将永远无法被匹配。
     * 铝与稀盐酸反应（al_hcl）已经覆盖了"铝表面氧化膜溶解后继续反应"的教学内容。 */

    /* =======================================================================
     * 六、酸 + 碱（中和反应，复分解反应）
     * ===================================================================== */
    {
      id: 'naoh_hcl',
      name: '氢氧化钠与稀盐酸反应',
      type: '复分解反应',
      reactants: ['naoh', 'hcl'],
      ratio: { naoh: 1, hcl: 1 },
      products: [{ id: 'nacl', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'NaOH + HCl = NaCl + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '无明显现象，但溶液温度升高，用 pH 试纸可测出溶液 pH 逐渐接近 7',
        heat: 57
      },
      note: '中和反应：酸与碱作用生成盐和水。可先向氢氧化钠溶液中滴加酚酞，红色刚好褪去时说明恰好中和'
    },
    {
      id: 'naoh_h2so4',
      name: '氢氧化钠与稀硫酸反应',
      type: '复分解反应',
      reactants: ['naoh', 'h2so4'],
      ratio: { naoh: 2, h2so4: 1 },
      products: [{ id: 'na2so4', n: 1 }, { id: 'h2o', n: 2 }],
      equation: '2NaOH + H₂SO₄ = Na₂SO₄ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '无明显现象，溶液温度升高，若预先滴入酚酞则红色逐渐褪去',
        heat: 114
      },
      note: '配平要点：硫酸是二元酸，故 NaOH 前系数为 2'
    },
    {
      id: 'caoh2_hcl',
      name: '氢氧化钙与稀盐酸反应',
      type: '复分解反应',
      reactants: ['caoh2', 'hcl'],
      ratio: { caoh2: 1, hcl: 2 },
      products: [{ id: 'cacl2', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'Ca(OH)₂ + 2HCl = CaCl₂ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '无明显现象，溶液温度升高；若石灰水预先加酚酞变红，则红色逐渐褪去',
        heat: 110
      },
      note: '氢氧化钙与盐酸反应生成氯化钙和水，属于中和反应'
    },
    {
      id: 'caoh2_h2so4',
      name: '氢氧化钙与稀硫酸反应',
      type: '复分解反应',
      reactants: ['caoh2', 'h2so4'],
      ratio: { caoh2: 1, h2so4: 1 },
      products: [{ id: 'caso4', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'Ca(OH)₂ + H₂SO₄ = CaSO₄↓ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '石灰水中出现白色浑浊（微溶的硫酸钙），溶液温度升高',
        heat: 120
      },
      priority: 10,
      note: '硫酸钙微溶于水，量多时以白色沉淀形式析出'
    },
    {
      id: 'cuoh2_hcl',
      name: '氢氧化铜与稀盐酸反应',
      type: '复分解反应',
      reactants: ['cuoh2', 'hcl'],
      ratio: { cuoh2: 1, hcl: 2 },
      products: [{ id: 'cucl2', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'Cu(OH)₂ + 2HCl = CuCl₂ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.blue, pptColor: null,
        message: '蓝色絮状沉淀逐渐溶解，溶液变为蓝绿色',
        heat: 60
      },
      note: '难溶性碱也能与酸反应，现象是沉淀溶解、溶液显色'
    },
    {
      id: 'cuoh2_h2so4',
      name: '氢氧化铜与稀硫酸反应',
      type: '复分解反应',
      reactants: ['cuoh2', 'h2so4'],
      ratio: { cuoh2: 1, h2so4: 1 },
      products: [{ id: 'cuso4', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'Cu(OH)₂ + H₂SO₄ = CuSO₄ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.blue, pptColor: null,
        message: '蓝色沉淀逐渐溶解，溶液变成蓝色',
        heat: 55
      },
      note: '蓝色沉淀溶解得到蓝色溶液，可用于说明碱与酸反应生成盐和水'
    },
    {
      id: 'feoh3_hcl',
      name: '氢氧化铁与稀盐酸反应',
      type: '复分解反应',
      reactants: ['feoh3', 'hcl'],
      ratio: { feoh3: 1, hcl: 3 },
      products: [{ id: 'fecl3', n: 1 }, { id: 'h2o', n: 3 }],
      equation: 'Fe(OH)₃ + 3HCl = FeCl₃ + 3H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.yellow, pptColor: null,
        message: '红褐色沉淀逐渐溶解，溶液变成黄色',
        heat: 60
      },
      note: '红褐色沉淀消失并得到黄色溶液，是 Fe(OH)₃ 的特征现象'
    },
    {
      id: 'feoh3_h2so4',
      name: '氢氧化铁与稀硫酸反应',
      type: '复分解反应',
      reactants: ['feoh3', 'h2so4'],
      ratio: { feoh3: 2, h2so4: 3 },
      products: [{ id: 'fe2so43', n: 1 }, { id: 'h2o', n: 6 }],
      equation: '2Fe(OH)₃ + 3H₂SO₄ = Fe₂(SO₄)₃ + 6H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.yellow, pptColor: null,
        message: '红褐色沉淀逐渐溶解，溶液变为黄色',
        heat: 130
      },
      note: '难溶性碱与酸反应，现象是沉淀溶解；配平要点：Fe(OH)₃ 系数取 2'
    },
    {
      id: 'mgoh2_hcl',
      name: '氢氧化镁与稀盐酸反应',
      type: '复分解反应',
      reactants: ['mgoh2', 'hcl'],
      ratio: { mgoh2: 1, hcl: 2 },
      products: [{ id: 'mgcl2', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'Mg(OH)₂ + 2HCl = MgCl₂ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色沉淀逐渐溶解，溶液仍为无色',
        heat: 110
      },
      note: '氢氧化镁是难溶性碱，能与盐酸反应；医药上可用氢氧化镁中和过多胃酸'
    },
    {
      id: 'aloh3_hcl',
      name: '氢氧化铝与稀盐酸反应',
      type: '复分解反应',
      reactants: ['aloh3', 'hcl'],
      ratio: { aloh3: 1, hcl: 3 },
      products: [{ id: 'alcl3', n: 1 }, { id: 'h2o', n: 3 }],
      equation: 'Al(OH)₃ + 3HCl = AlCl₃ + 3H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色胶状沉淀逐渐溶解，溶液无色澄清',
        heat: 100
      },
      note: '氢氧化铝能中和胃酸，是常见的抗酸药物成分（Al(OH)₃ + 3HCl = AlCl₃ + 3H₂O）'
    },

    /* =======================================================================
     * 七、酸 + 盐（复分解反应）
     * ===================================================================== */
    {
      id: 'caco3_hcl',
      name: '大理石与稀盐酸反应',
      type: '复分解反应',
      reactants: ['caco3', 'hcl'],
      ratio: { caco3: 1, hcl: 2 },
      products: [{ id: 'cacl2', n: 1 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'CaCO₃ + 2HCl = CaCl₂ + H₂O + CO₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'co2', toColor: null, pptColor: null,
        message: '大理石表面产生大量气泡，固体逐渐溶解，产生的气体能使澄清石灰水变浑浊',
        heat: -15
      },
      note: '实验室制取二氧化碳的常用反应，不用稀硫酸是因为生成的硫酸钙微溶，会覆盖在大理石表面阻止反应'
    },
    {
      id: 'caco3_h2so4',
      name: '大理石与稀硫酸反应',
      type: '复分解反应',
      reactants: ['caco3', 'h2so4'],
      ratio: { caco3: 1, h2so4: 1 },
      products: [{ id: 'caso4', n: 1 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'CaCO₃ + H₂SO₄ = CaSO₄ + H₂O + CO₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'co2', toColor: null, pptColor: C.white,
        message: '开始时产生少量气泡，随后反应很快停止，大理石表面覆盖一层白色固体',
        heat: -20
      },
      note: '生成的硫酸钙微溶于水，会覆盖在大理石表面阻止反应继续进行，所以实验室制二氧化碳不能用稀硫酸'
    },
    {
      id: 'na2co3_hcl',
      name: '碳酸钠与稀盐酸反应',
      type: '复分解反应',
      reactants: ['na2co3', 'hcl'],
      ratio: { na2co3: 1, hcl: 2 },
      products: [{ id: 'nacl', n: 2 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'Na₂CO₃ + 2HCl = 2NaCl + H₂O + CO₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'co2', toColor: null, pptColor: null,
        message: '固体迅速溶解并产生大量气泡，气体能使澄清石灰水变浑浊',
        heat: -25
      },
      note: '碳酸钠与盐酸反应生成氯化钠、水和二氧化碳，可用作泡沫灭火器的反应原理之一'
    },
    {
      id: 'nahco3_hcl',
      name: '碳酸氢钠与稀盐酸反应',
      type: '复分解反应',
      reactants: ['nahco3', 'hcl'],
      ratio: { nahco3: 1, hcl: 1 },
      products: [{ id: 'nacl', n: 1 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'NaHCO₃ + HCl = NaCl + H₂O + CO₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'co2', toColor: null, pptColor: null,
        message: '白色固体迅速溶解，产生大量气泡，反应比碳酸钠更剧烈',
        heat: -30
      },
      note: '碳酸氢钠与盐酸反应生成氯化钠、水和二氧化碳；也是治疗胃酸过多的原理'
    },
    {
      id: 'na2co3_h2so4',
      name: '碳酸钠与稀硫酸反应',
      type: '复分解反应',
      reactants: ['na2co3', 'h2so4'],
      ratio: { na2co3: 1, h2so4: 1 },
      products: [{ id: 'na2so4', n: 1 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'Na₂CO₃ + H₂SO₄ = Na₂SO₄ + H₂O + CO₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'co2', toColor: null, pptColor: null,
        message: '产生大量气泡，固体逐渐溶解，气体能使澄清石灰水变浑浊',
        heat: -45
      },
      note: '碳酸盐与酸反应都能生成二氧化碳，这是检验碳酸根离子的方法之一'
    },
    {
      id: 'bacl2_h2so4',
      name: '氯化钡与稀硫酸反应',
      type: '复分解反应',
      reactants: ['bacl2', 'h2so4'],
      ratio: { bacl2: 1, h2so4: 1 },
      products: [{ id: 'baso4', n: 1 }, { id: 'hcl', n: 2 }],
      equation: 'BaCl₂ + H₂SO₄ = BaSO₄↓ + 2HCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '立即产生不溶于稀硝酸的白色沉淀，溶液仍然澄清无色',
        heat: 0
      },
      safety: '氯化钡有毒，实验后废液要集中回收处理',
      note: '这是检验硫酸根离子的常用方法：加 BaCl₂ 溶液产生白色沉淀，再加稀硝酸沉淀不溶解'
    },
    {
      id: 'agno3_hcl',
      name: '硝酸银与稀盐酸反应',
      type: '复分解反应',
      reactants: ['agno3', 'hcl'],
      ratio: { agno3: 1, hcl: 1 },
      products: [{ id: 'agcl', n: 1 }, { id: 'hno3', n: 1 }],
      equation: 'AgNO₃ + HCl = AgCl↓ + HNO₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '立即产生白色沉淀，沉淀不溶于稀硝酸',
        heat: 0
      },
      note: '检验氯离子的方法：加硝酸银溶液产生白色沉淀，再加稀硝酸沉淀不溶解'
    },

    /* =======================================================================
     * 八、碱 + 盐（复分解反应）
     * ===================================================================== */
    {
      id: 'naoh_cuso4',
      name: '氢氧化钠与硫酸铜反应',
      type: '复分解反应',
      reactants: ['naoh', 'cuso4'],
      ratio: { naoh: 2, cuso4: 1 },
      products: [{ id: 'cuoh2', n: 1 }, { id: 'na2so4', n: 1 }],
      equation: '2NaOH + CuSO₄ = Cu(OH)₂↓ + Na₂SO₄',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.blue,
        message: '产生蓝色絮状沉淀，溶液由蓝色逐渐变为无色',
        heat: 0
      },
      note: '蓝色絮状沉淀是氢氧化铜，可用于检验铜离子'
    },
    {
      id: 'naoh_fecl3',
      name: '氢氧化钠与氯化铁反应',
      type: '复分解反应',
      reactants: ['naoh', 'fecl3'],
      ratio: { naoh: 3, fecl3: 1 },
      products: [{ id: 'feoh3', n: 1 }, { id: 'nacl', n: 3 }],
      equation: '3NaOH + FeCl₃ = Fe(OH)₃↓ + 3NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.brickRed,
        message: '产生红褐色沉淀，溶液由黄色逐渐变为无色',
        heat: 0
      },
      note: '红褐色沉淀是氢氧化铁，可用于检验铁离子（Fe³⁺）'
    },
    {
      id: 'naoh_mgcl2',
      name: '氢氧化钠与氯化镁反应',
      type: '复分解反应',
      reactants: ['naoh', 'mgcl2'],
      ratio: { naoh: 2, mgcl2: 1 },
      products: [{ id: 'mgoh2', n: 1 }, { id: 'nacl', n: 2 }],
      equation: '2NaOH + MgCl₂ = Mg(OH)₂↓ + 2NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '产生白色沉淀，溶液仍为无色',
        heat: 0
      },
      note: '白色沉淀是氢氧化镁，说明碱溶液能与可溶性镁盐反应'
    },
    {
      id: 'naoh_alcl3',
      name: '氢氧化钠与氯化铝反应',
      type: '复分解反应',
      reactants: ['naoh', 'alcl3'],
      ratio: { naoh: 3, alcl3: 1 },
      products: [{ id: 'aloh3', n: 1 }, { id: 'nacl', n: 3 }],
      equation: '3NaOH + AlCl₃ = Al(OH)₃↓ + 3NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '产生白色胶状沉淀，溶液仍为无色；继续滴加氢氧化钠溶液沉淀又会溶解',
        heat: 0
      },
      safety: '氢氧化钠溶液有强腐蚀性，取用时要小心，不要沾到皮肤上',
      note: '配平要点：Al³⁺ 显 +3 价，故 NaOH 前系数为 3；氢氧化铝能溶于过量强碱'
    },
    {
      id: 'naoh_zncl2',
      name: '氢氧化钠与氯化锌反应',
      type: '复分解反应',
      reactants: ['naoh', 'zncl2'],
      ratio: { naoh: 2, zncl2: 1 },
      products: [{ id: 'znoh2', n: 1 }, { id: 'nacl', n: 2 }],
      equation: '2NaOH + ZnCl₂ = Zn(OH)₂↓ + 2NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '产生白色沉淀，溶液仍为无色，继续滴加碱液沉淀会溶解',
        heat: 0
      },
      note: '白色沉淀是氢氧化锌，氢氧化锌也能溶于过量强碱溶液'
    },
    {
      id: 'caoh2_na2co3',
      name: '石灰水与碳酸钠溶液反应',
      type: '复分解反应',
      reactants: ['caoh2', 'na2co3'],
      ratio: { caoh2: 1, na2co3: 1 },
      products: [{ id: 'caco3', n: 1 }, { id: 'naoh', n: 2 }],
      equation: 'Ca(OH)₂ + Na₂CO₃ = CaCO₃↓ + 2NaOH',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '产生白色沉淀（碳酸钙），溶液仍然澄清',
        heat: 0
      },
      note: '工业上用石灰水和纯碱溶液反应制取烧碱，这是制取氢氧化钠的方法之一'
    },
    {
      id: 'caoh2_cuso4',
      name: '石灰水与硫酸铜溶液反应',
      type: '复分解反应',
      reactants: ['caoh2', 'cuso4'],
      ratio: { caoh2: 1, cuso4: 1 },
      products: [{ id: 'cuoh2', n: 1 }, { id: 'caso4', n: 1 }],
      equation: 'Ca(OH)₂ + CuSO₄ = Cu(OH)₂↓ + CaSO₄↓',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.blue,
        message: '产生蓝色沉淀（同时有白色硫酸钙析出），溶液由蓝色变为无色',
        heat: 0
      },
      note: '农业上常用石灰水与硫酸铜配制波尔多液，两种沉淀同时生成'
    },

    /* =======================================================================
     * 九、盐 + 盐（复分解反应）
     * ===================================================================== */
    {
      id: 'bacl2_na2so4',
      name: '氯化钡与硫酸钠反应',
      type: '复分解反应',
      reactants: ['bacl2', 'na2so4'],
      ratio: { bacl2: 1, na2so4: 1 },
      products: [{ id: 'baso4', n: 1 }, { id: 'nacl', n: 2 }],
      equation: 'BaCl₂ + Na₂SO₄ = BaSO₄↓ + 2NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '立即产生白色沉淀，沉淀不溶于稀硝酸',
        heat: 0
      },
      safety: '氯化钡有毒，废液需集中处理',
      note: '两种化合物互相交换成分生成两种新化合物，属于复分解反应'
    },
    {
      id: 'agno3_nacl',
      name: '硝酸银与氯化钠反应',
      type: '复分解反应',
      reactants: ['agno3', 'nacl'],
      ratio: { agno3: 1, nacl: 1 },
      products: [{ id: 'agcl', n: 1 }, { id: 'nano3', n: 1 }],
      equation: 'AgNO₃ + NaCl = AgCl↓ + NaNO₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '立即产生白色沉淀，沉淀不溶于稀硝酸',
        heat: 0
      },
      note: '检验 Cl⁻ 的典型反应，白色沉淀 AgCl 不溶于稀硝酸'
    },
    {
      id: 'bacl2_na2co3',
      name: '氯化钡与碳酸钠反应',
      type: '复分解反应',
      reactants: ['bacl2', 'na2co3'],
      ratio: { bacl2: 1, na2co3: 1 },
      products: [{ id: 'baco3', n: 1 }, { id: 'nacl', n: 2 }],
      equation: 'BaCl₂ + Na₂CO₃ = BaCO₃↓ + 2NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '产生白色沉淀（碳酸钡），加入稀盐酸后沉淀溶解并产生气泡',
        heat: 0
      },
      safety: '氯化钡、碳酸钡有毒，实验后废液要回收处理',
      note: '碳酸钡能溶于稀盐酸，而硫酸钡不能，可据此区别两种白色沉淀'
    },
    {
      id: 'agno3_na2co3',
      name: '硝酸银与碳酸钠反应',
      type: '复分解反应',
      reactants: ['agno3', 'na2co3'],
      ratio: { agno3: 2, na2co3: 1 },
      products: [{ id: 'ag2co3', n: 1 }, { id: 'nano3', n: 2 }],
      equation: '2AgNO₃ + Na₂CO₃ = Ag₂CO₃↓ + 2NaNO₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '产生白色沉淀（碳酸银），加入稀硝酸后沉淀溶解并放出气泡',
        heat: 0
      },
      safety: '硝酸银有腐蚀性且见光易分解，注意避光保存',
      note: '配平要点：Ag 显 +1 价、CO₃ 显 -2 价，故 AgNO₃ 前系数为 2'
    },
    {
      id: 'cacl2_na2co3',
      name: '氯化钙与碳酸钠反应',
      type: '复分解反应',
      reactants: ['cacl2', 'na2co3'],
      ratio: { cacl2: 1, na2co3: 1 },
      products: [{ id: 'caco3', n: 1 }, { id: 'nacl', n: 2 }],
      equation: 'CaCl₂ + Na₂CO₃ = CaCO₃↓ + 2NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '产生白色沉淀，加稀盐酸后沉淀溶解并产生气泡',
        heat: 0
      },
      note: '复分解反应发生的条件：生成物中有沉淀、气体或水'
    },

    /* =======================================================================
     * 十、碱溶液 + 非金属氧化物
     * ===================================================================== */
    {
      id: 'co2_naoh',
      name: '二氧化碳与氢氧化钠溶液反应',
      type: '复分解反应',
      reactants: ['co2', 'naoh'],
      ratio: { co2: 1, naoh: 2 },
      products: [{ id: 'na2co3', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'CO₂ + 2NaOH = Na₂CO₃ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '无明显现象，但容器内气体减少；反应后溶液中加入稀盐酸会产生气泡',
        heat: -110
      },
      priority: 20,
      note: '氢氧化钠溶液能吸收二氧化碳，所以实验室保存氢氧化钠必须密封'
    },
    {
      id: 'co2_caoh2',
      name: '二氧化碳与澄清石灰水反应',
      type: '复分解反应',
      reactants: ['co2', 'caoh2'],
      ratio: { co2: 1, caoh2: 1 },
      products: [{ id: 'caco3', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '澄清石灰水变浑浊，出现白色沉淀',
        heat: -113
      },
      priority: 25,
      note: '这是检验二氧化碳的常用方法（澄清石灰水变浑浊）；继续通入过量二氧化碳沉淀会溶解'
    },
    {
      id: 'so2_naoh',
      name: '二氧化硫与氢氧化钠溶液反应',
      type: '复分解反应',
      reactants: ['so2', 'naoh'],
      ratio: { so2: 1, naoh: 2 },
      products: [{ id: 'na2so3', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'SO₂ + 2NaOH = Na₂SO₃ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '无明显现象，逸出的刺激性气味逐渐消失，说明二氧化硫被碱液吸收',
        heat: -160
      },
      priority: 20,
      safety: '二氧化硫有毒，尾气必须用碱液吸收，实验在通风处进行',
      note: '工业上用氢氧化钠溶液吸收二氧化硫尾气，防止形成酸雨'
    },
    {
      id: 'so2_caoh2',
      name: '二氧化硫与石灰水反应',
      type: '复分解反应',
      reactants: ['so2', 'caoh2'],
      ratio: { so2: 1, caoh2: 1 },
      products: [{ id: 'caso3', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'SO₂ + Ca(OH)₂ = CaSO₃↓ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: C.white,
        message: '石灰水变浑浊，产生白色沉淀（亚硫酸钙）',
        heat: -160
      },
      priority: 25,
      safety: '二氧化硫有刺激性气味且有毒，实验在通风处进行',
      note: '亚硫酸钙的化学式为 CaSO₃（物质库中暂无该条目，报告中已说明）'
    },

    /* =======================================================================
     * 十一、还原反应
     * ===================================================================== */
    {
      id: 'h2_cuo',
      name: '氢气还原氧化铜',
      type: '置换反应',
      reactants: ['h2', 'cuo'],
      ratio: { h2: 1, cuo: 1 },
      products: [{ id: 'cu', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'H₂ + CuO = Cu + H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.copperRed, pptColor: null,
        message: '黑色粉末逐渐变成光亮的紫红色，试管口有水珠生成',
        heat: 129
      },
      safety: '先通氢气排尽空气再加热，防止氢气与空气混合加热时爆炸；实验结束后先停止加热，继续通氢气直到试管冷却',
      note: '氢气作还原剂，夺走氧化铜中的氧，本身被氧化成水'
    },
    {
      id: 'c_cuo',
      name: '木炭还原氧化铜',
      type: '置换反应',
      reactants: ['c', 'cuo'],
      ratio: { c: 1, cuo: 2 },
      products: [{ id: 'cu', n: 2 }, { id: 'co2', n: 1 }],
      equation: 'C + 2CuO = 2Cu + CO₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 600, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.copperRed, pptColor: null,
        message: '黑色混合物逐渐变红，生成红色固体，同时有气体产生，澄清石灰水变浑浊',
        heat: -26
      },
      note: '碳作还原剂，把氧化铜还原成铜，自身被氧化成二氧化碳'
    },
    {
      id: 'co_cuo',
      name: '一氧化碳还原氧化铜',
      type: '氧化还原反应',
      reactants: ['co', 'cuo'],
      ratio: { co: 1, cuo: 1 },
      products: [{ id: 'cu', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'CO + CuO = Cu + CO₂',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.copperRed, pptColor: null,
        message: '黑色粉末逐渐变成红色，生成的气体能使澄清石灰水变浑浊',
        heat: -129
      },
      safety: '一氧化碳有毒，尾气必须点燃处理，防止污染空气',
      note: 'CO 作还原剂，是冶炼金属的重要还原剂之一'
    },
    {
      id: 'co_fe2o3',
      name: '一氧化碳还原氧化铁（高炉炼铁）',
      type: '氧化还原反应',
      reactants: ['co', 'fe2o3'],
      ratio: { co: 3, fe2o3: 1 },
      products: [{ id: 'fe', n: 2 }, { id: 'co2', n: 3 }],
      equation: '3CO + Fe₂O₃ = 2Fe + 3CO₂',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 600, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.black, pptColor: null,
        message: '红棕色粉末逐渐变成黑色，生成的气体使澄清石灰水变浑浊',
        heat: -25
      },
      safety: '一氧化碳有毒，尾气要回收或点燃处理；实验前先通 CO 排尽空气，防止加热时爆炸',
      note: '这是工业高炉炼铁的主要反应原理：CO 夺取氧化铁中的氧，把铁还原出来'
    },
    {
      id: 'c_fe2o3',
      name: '木炭还原氧化铁',
      type: '置换反应',
      reactants: ['c', 'fe2o3'],
      ratio: { c: 3, fe2o3: 2 },
      products: [{ id: 'fe', n: 4 }, { id: 'co2', n: 3 }],
      equation: '3C + 2Fe₂O₃ = 4Fe + 3CO₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 600, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.black, pptColor: null,
        message: '红棕色粉末逐渐变为黑色，生成的气体使澄清石灰水变浑浊',
        heat: 158
      },
      note: '配平要点：Fe₂O₃ 中 Fe 为 +3 价，1 mol Fe₂O₃ 得 6 mol 电子，故 2 mol Fe₂O₃ 需 3 mol C'
    },
    {
      id: 'h2_fe2o3',
      name: '氢气还原氧化铁',
      type: '置换反应',
      reactants: ['h2', 'fe2o3'],
      ratio: { h2: 3, fe2o3: 1 },
      products: [{ id: 'fe', n: 2 }, { id: 'h2o', n: 3 }],
      equation: '3H₂ + Fe₂O₃ = 2Fe + 3H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 60, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.black, pptColor: null,
        message: '红棕色粉末逐渐变为黑色，试管口有水珠生成',
        heat: 99
      },
      safety: '先通氢气排尽装置内空气再加热，结束后先停止加热并继续通氢气至冷却',
      note: '氢气、一氧化碳、碳都具有还原性，都能把金属从它的氧化物中还原出来'
    },

    /* =======================================================================
     * 十二、指示剂显色（indicator: true，引擎不消耗任何反应物）
     * ===================================================================== */
    {
      id: 'phenolphthalein_naoh',
      name: '酚酞遇氢氧化钠溶液变红',
      type: '其他',
      reactants: ['phenolphthalein', 'naoh'],
      ratio: { phenolphthalein: 1, naoh: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.pink, pptColor: null,
        message: '无色酚酞溶液变红，说明氢氧化钠溶液显碱性',
        heat: 0
      },
      indicator: true,
      note: '酚酞遇碱性溶液变红，遇酸性和中性溶液不变色'
    },
    {
      id: 'phenolphthalein_caoh2',
      name: '酚酞遇澄清石灰水变红',
      type: '其他',
      reactants: ['phenolphthalein', 'caoh2'],
      ratio: { phenolphthalein: 1, caoh2: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.pink, pptColor: null,
        message: '无色酚酞溶液变红，说明石灰水显碱性',
        heat: 0
      },
      indicator: true,
      note: '石灰水是氢氧化钙的稀溶液，显碱性，能使酚酞变红'
    },
    {
      id: 'phenolphthalein_na2co3',
      name: '酚酞遇碳酸钠溶液变红',
      type: '其他',
      reactants: ['phenolphthalein', 'na2co3'],
      ratio: { phenolphthalein: 1, na2co3: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.pink, pptColor: null,
        message: '无色酚酞溶液变红，说明碳酸钠溶液显碱性',
        heat: 0
      },
      indicator: true,
      note: '碳酸钠虽属于盐，但其水溶液显碱性，能使酚酞变红'
    },
    {
      id: 'phenolphthalein_hcl',
      name: '酚酞遇稀盐酸不变色',
      type: '其他',
      reactants: ['phenolphthalein', 'hcl'],
      ratio: { phenolphthalein: 1, hcl: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.phenolphthalein, pptColor: null,
        message: '酚酞不变色，溶液仍为无色，说明溶液不显碱性',
        heat: 0
      },
      indicator: true,
      note: '酚酞遇酸性和中性溶液都不变色，因此不能用来区分酸和中性溶液'
    },
    {
      id: 'phenolphthalein_h2so4',
      name: '酚酞遇稀硫酸不变色',
      type: '其他',
      reactants: ['phenolphthalein', 'h2so4'],
      ratio: { phenolphthalein: 1, h2so4: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.phenolphthalein, pptColor: null,
        message: '酚酞不变色，溶液仍为无色，说明溶液不显碱性',
        heat: 0
      },
      indicator: true,
      note: '酚酞只有在碱性溶液中才显红色'
    },
    {
      id: 'litmus_hcl',
      name: '石蕊遇稀盐酸变红',
      type: '其他',
      reactants: ['litmus', 'hcl'],
      ratio: { litmus: 1, hcl: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.litmusRed, pptColor: null,
        message: '紫色石蕊溶液变红，说明稀盐酸显酸性',
        heat: 0
      },
      indicator: true,
      note: '石蕊遇酸性溶液变红，遇碱性溶液变蓝，可用来区分酸和碱'
    },
    {
      id: 'litmus_h2so4',
      name: '石蕊遇稀硫酸变红',
      type: '其他',
      reactants: ['litmus', 'h2so4'],
      ratio: { litmus: 1, h2so4: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.litmusRed, pptColor: null,
        message: '紫色石蕊溶液变红，说明稀硫酸显酸性',
        heat: 0
      },
      indicator: true,
      note: '酸性溶液都能使紫色石蕊变红'
    },
    {
      id: 'litmus_naoh',
      name: '石蕊遇氢氧化钠溶液变蓝',
      type: '其他',
      reactants: ['litmus', 'naoh'],
      ratio: { litmus: 1, naoh: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.deepBlue, pptColor: null,
        message: '紫色石蕊溶液变蓝，说明氢氧化钠溶液显碱性',
        heat: 0
      },
      indicator: true,
      note: '碱性溶液能使紫色石蕊变蓝'
    },
    {
      id: 'litmus_caoh2',
      name: '石蕊遇澄清石灰水变蓝',
      type: '其他',
      reactants: ['litmus', 'caoh2'],
      ratio: { litmus: 1, caoh2: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.deepBlue, pptColor: null,
        message: '紫色石蕊溶液变蓝，说明石灰水显碱性',
        heat: 0
      },
      indicator: true,
      note: '石灰水显碱性，能使紫色石蕊变蓝'
    },
    {
      id: 'litmus_na2co3',
      name: '石蕊遇碳酸钠溶液变蓝',
      type: '其他',
      reactants: ['litmus', 'na2co3'],
      ratio: { litmus: 1, na2co3: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.deepBlue, pptColor: null,
        message: '紫色石蕊溶液变蓝，说明碳酸钠溶液显碱性',
        heat: 0
      },
      indicator: true,
      note: '碳酸钠溶液显碱性，能使紫色石蕊变蓝'
    },
    {
      id: 'litmus_nacl',
      name: '石蕊遇氯化钠溶液不变色',
      type: '其他',
      reactants: ['litmus', 'nacl'],
      ratio: { litmus: 1, nacl: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: C.litmusPurple, pptColor: null,
        message: '石蕊仍为紫色，说明氯化钠溶液呈中性',
        heat: 0
      },
      indicator: true,
      note: '强酸强碱盐的溶液一般呈中性，不能使石蕊变色'
    }
  ];

  /* =========================================================================
   * 气体 / 溶液检验方法
   * ======================================================================= */
  var TESTS = [
    {
      id: 'glowingSplint',
      name: '带火星的木条',
      applies: 'gas',
      tip: '把带火星的木条伸入集气瓶中，观察木条是否复燃',
      rules: [
        {
          match: ['o2'], minFraction: 0.3,
          result: '木条复燃',
          message: '带火星的木条复燃，说明该气体是氧气（氧气能支持燃烧）',
          pass: true
        }
      ],
      fallback: {
        result: '木条熄灭',
        message: '带火星的木条没有复燃，说明该气体不能支持燃烧',
        pass: false
      }
    },
    {
      id: 'burningSplint',
      name: '燃着的木条',
      applies: 'gas',
      tip: '把燃着的木条伸入集气瓶中，观察木条燃烧情况',
      rules: [
        {
          match: ['o2'], minFraction: 0.3,
          result: '燃烧更旺',
          message: '木条燃烧得更旺，说明该气体是氧气，氧气能支持燃烧',
          pass: true
        },
        {
          match: ['co2'], minFraction: 0.3,
          result: '木条熄灭',
          message: '燃着的木条立即熄灭，说明该气体不支持燃烧，可能是二氧化碳',
          pass: true
        },
        {
          match: ['h2'], minFraction: 0.3,
          result: '气体被点燃，发出淡蓝色火焰',
          message: '气体本身能燃烧，发出淡蓝色火焰，说明该气体是氢气',
          pass: true
        }
      ],
      fallback: {
        result: '木条没有明显变化',
        message: '木条燃烧情况没有明显变化，说明该气体不支持燃烧也不能被点燃',
        pass: false
      }
    },
    {
      id: 'litmusPaper',
      name: '紫色石蕊试纸',
      applies: 'both',
      tip: '用湿润的紫色石蕊试纸靠近气体，或用玻璃棒蘸取待测液滴在试纸上',
      rules: [
        {
          match: ['co2'], minFraction: 0.15,
          result: '试纸变红',
          message: '湿润的紫色石蕊试纸变红，说明该气体溶于水后显酸性（二氧化碳与水反应生成碳酸）',
          pass: true
        },
        {
          match: ['so2'], minFraction: 0.1,
          result: '试纸变红',
          message: '紫色石蕊试纸变红，说明该气体是酸性气体（二氧化硫溶于水生成亚硫酸）',
          pass: true
        },
        {
          match: ['hcl'], minFraction: 0.05,
          result: '试纸变红',
          message: '紫色石蕊试纸变红，说明该气体溶于水后显酸性（氯化氢气体）',
          pass: true
        }
      ],
      fallback: {
        result: '试纸不变色',
        message: '石蕊试纸不变色，说明该气体既不是酸性气体也不是碱性气体',
        pass: false
      }
    },
    {
      id: 'phPaper',
      name: 'pH 试纸',
      applies: 'liquid',
      tip: '用玻璃棒蘸取少量待测液，滴在 pH 试纸上，再与标准比色卡对照',
      rules: [
        {
          phBelow: 3,
          result: 'pH ≈ 1~2',
          message: '试纸变红，溶液呈强酸性',
          pass: true
        },
        {
          phBelow: 7, phAbove: 3,
          result: 'pH ≈ 4~6',
          message: '试纸呈橙红色，溶液呈弱酸性',
          pass: true
        },
        {
          phAbove: 6.9, phBelow: 7.1,
          result: 'pH ≈ 7',
          message: '试纸不变色，溶液呈中性',
          pass: true
        },
        {
          phAbove: 7, phBelow: 11,
          result: 'pH ≈ 8~10',
          message: '试纸呈浅蓝色，溶液呈弱碱性',
          pass: true
        },
        {
          phAbove: 10.9,
          result: 'pH ≈ 12~14',
          message: '试纸呈深蓝色，溶液呈强碱性',
          pass: true
        }
      ],
      fallback: {
        result: 'pH 无法确定',
        message: '未能测出溶液 pH，请检查待测液是否足量、试纸是否被润湿',
        pass: false
      }
    }
  ];

  /* =========================================================================
   * 常见水溶液的近似 pH（用于 pH 试纸检验与酸碱性强弱判断）
   * 本节为教学用近似值，不适用于精确计算
   * ======================================================================= */
  var PH_RULES = [
    /* 蒸馏水、有机物 */
    { id: 'h2o', ph: 7, note: '蒸馏水，中性' },
    { id: 'c2h5oh', ph: 7, note: '乙醇溶液，中性' },

    /* 酸 */
    { id: 'hcl', ph: 1, note: '稀盐酸，强酸' },
    { id: 'h2so4', ph: 1, note: '稀硫酸，强酸' },
    { id: 'hno3', ph: 1, note: '硝酸，强酸，具有强氧化性' },
    { id: 'h2co3', ph: 5, note: '碳酸，很弱的酸，不稳定' },
    { id: 'so2', ph: 3, note: '二氧化硫的水溶液（亚硫酸），显酸性' },
    { id: 'co2', ph: 5, note: '二氧化碳的水溶液（碳酸），显弱酸性' },

    /* 碱 */
    { id: 'naoh', ph: 13, note: '氢氧化钠溶液，强碱，有强腐蚀性' },
    { id: 'caoh2', ph: 12, note: '澄清石灰水，强碱（氢氧化钙微溶，浓度较小）' },
    { id: 'mgoh2', ph: 9, note: '氢氧化镁，难溶性弱碱' },
    { id: 'aloh3', ph: 8, note: '氢氧化铝，难溶性弱碱' },
    { id: 'cuoh2', ph: 8, note: '氢氧化铜，难溶性弱碱' },
    { id: 'feoh3', ph: 8, note: '氢氧化铁，难溶性弱碱' },
    { id: 'znoh2', ph: 8, note: '氢氧化锌，难溶性弱碱' },

    /* 碳酸盐、碳酸氢盐：水溶液因水解显碱性 */
    { id: 'na2co3', ph: 11, note: '碳酸钠溶液，显碱性（纯碱）' },
    { id: 'nahco3', ph: 8.5, note: '碳酸氢钠溶液，弱碱性（小苏打）' },
    { id: 'nh4hco3', ph: 7.8, note: '碳酸氢铵溶液，弱碱性' },

    /* 中性盐：强酸强碱盐，pH ≈ 7 */
    { id: 'nacl', ph: 7, note: '氯化钠溶液，中性' },
    { id: 'na2so4', ph: 7, note: '硫酸钠溶液，中性' },
    { id: 'kcl', ph: 7, note: '氯化钾溶液，中性' },
    { id: 'cacl2', ph: 7, note: '氯化钙溶液，中性' },
    { id: 'bacl2', ph: 7, note: '氯化钡溶液，中性（有毒）' },
    { id: 'agno3', ph: 7, note: '硝酸银溶液，中性（弱酸性，此处按中性处理）' },
    { id: 'cuso4', ph: 7, note: '硫酸铜溶液，中性（实际因水解略显酸性）' },
    { id: 'znso4', ph: 7, note: '硫酸锌溶液，中性' },
    { id: 'mgso4', ph: 7, note: '硫酸镁溶液，中性' },
    { id: 'feso4', ph: 7, note: '硫酸亚铁溶液，中性（浅绿色）' },
    { id: 'al2so43', ph: 7, note: '硫酸铝溶液，中性（实际因水解显酸性）' },
    { id: 'cu_no32', ph: 7, note: '硝酸铜溶液，中性' },
    { id: 'fe_no32', ph: 7, note: '硝酸亚铁溶液，中性' },
    { id: 'fecl2', ph: 7, note: '氯化亚铁溶液，中性（浅绿色）' },
    { id: 'fecl3', ph: 7, note: '氯化铁溶液，中性（实际因水解显酸性）' },
    { id: 'mgcl2', ph: 7, note: '氯化镁溶液，中性' },
    { id: 'alcl3', ph: 7, note: '氯化铝溶液，中性（实际因水解显酸性）' },
    { id: 'zncl2', ph: 7, note: '氯化锌溶液，中性' },
    { id: 'cucl2', ph: 7, note: '氯化铜溶液，中性' },
    { id: 'h2o2', ph: 7, note: '过氧化氢溶液，接近中性' }
  ];

  /* 供渲染层使用的颜色常量 */
  CHEM.REACTION_COLORS = C;

  CHEM.REACTIONS = REACTIONS;
  CHEM.TESTS = TESTS;
  CHEM.PH_RULES = PH_RULES;
})(typeof window !== 'undefined' ? window : globalThis);
