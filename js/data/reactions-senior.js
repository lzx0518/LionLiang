/* =============================================================================
 * 虚拟化学实验室 —— 高中化学反应规则库 (Reactions · Senior)
 * -----------------------------------------------------------------------------
 * 本文件只"新增"高中内容，不修改 reactions.js 中的任何已有条目。
 * 规则 schema 与初中库完全一致（字段名一致）：
 *   id / name / type / level / reactants / ratio / products / equation /
 *   conditions / phenomena / priority / indicator / safety / note
 * 每条规则都必须写 level: 'senior'，否则会被当成初中内容。
 *
 * 引擎真正支持的条件字段（js/engine/reaction.js 的 conditionsOK）：
 *   heat        容器温度 ≥ 55 ℃（用酒精灯加热）
 *   ignite      需要点燃
 *   catalyst    容器中必须存在该物质（作催化剂，不被消耗）
 *   minTemp     需要达到的最低温度
 *   needsWater  需要水溶液环境（稀盐酸、氢氧化钠溶液等溶液本身就算水溶液）
 *   electricity 需要通电（电解）
 *   light       需要光照（用户点工具栏的"光照"）—— 引擎 conditionsOK 已判断该字段，
 *               只有容器被强光照射过（c.lighted）才会触发，
 *               用于甲烷氯代、HClO 见光分解、H₂ + Cl₂、AgNO₃ 见光分解等反应。
 *
 * phenomena.kind 只能取 bubble / precipitate / colorChange / flame / smoke /
 * glow / dissolve / none；phenomena.heat 放热为正、吸热为负、不明显为 0。
 *
 * ---------------------------------------------------------------------------
 * 【本文件显式设置 priority 的位置（priority 越大越先匹配）】
 * ---------------------------------------------------------------------------
 *   1.  na_o2_ignite        20  点燃时生成 Na₂O₂，优先于常温生成 Na₂O 的 na_o2_rt
 *   2.  naalo2_co2          20  优先于初中的 co2_h2o（CO₂ 通入偏铝酸钠溶液应析出 Al(OH)₃）
 *   3.  na2co3_co2_h2o      15  优先于初中的 co2_h2o
 *   4.  na2sio3_co2         20  优先于初中的 co2_h2o（应析出硅酸）
 *   5.  feoh2_o2            10  Fe(OH)₂ 被氧气氧化，优先于其他含 O₂ 的规则
 *   6.  fe_kscn             25  显色反应（indicator），血红色优先展示
 *   7.  cl2_naoh            20  优先于 cl2_h2o（有碱液时氯气被碱吸收）
 *   8.  cl2_caoh2           25  优先于 cl2_h2o 与 cl2_naoh（石灰乳制漂白粉）
 *   9.  cl2_na2so3          20  优先于 cl2_h2o（还原性盐溶液吸收氯气）
 *  10.  so2_cl2_h2o         20  优先于 cl2_h2o / so2_h2o（氯水氧化二氧化硫）
 *  11.  so2_kmno4           25  优先于 so2_h2o（酸性高锰酸钾氧化二氧化硫）
 *  12.  naclo_co2           15  优先于初中的 co2_h2o（CO₂ 与次氯酸钠反应）
 *  13.  no2_naoh            20  优先于 no2_h2o（碱液吸收二氧化氮尾气）
 *  14.  h2s_o2_full         20  氧气充足时生成 SO₂，优先于生成 S 的 h2s_o2_less
 *  15.  starch_i2           30  显色反应（indicator），淀粉遇碘变蓝
 *  16.  electrolysis_brine  20  优先于初中的 h2o_electric（有食盐时电解食盐水）
 *  17.  fecl3_nahco3        20  出现"红褐色沉淀 + 大量气泡"的双水解现象优先于
 *                              其他可能同时匹配的规则（如初中的 co2_h2o）
 *
 * 另外两处不靠 priority、而靠"条件差异"避免冲突的地方：
 *   · c2h4_poly 用 minTemp: 200（有水时容器温度上限只有 100 ℃）与 c2h4_h2o 区分；
 *   · h2so4_conc / hno3_conc 在物质库里各自作为独立母体（见 substances-senior.js
 *     头部说明），因此 Cu + 浓硫酸 与 Cu + 稀硫酸、Cu + 浓硝酸 与 Cu + 稀硝酸
 *     不会互相干扰。
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});

  /* 颜色常量：与初中库、substances-senior.js 的配色保持一致 */
  var C = {
    white: '#eef1f5',
    clearLiq: '#eaf4ff',
    paleGreen: '#9fd39a',
    yellow: '#e0b64a',
    blue: '#2f8fd6',
    cyanBlue: '#3fb0a8',
    black: '#1e2124',
    brickRed: '#a0522d',
    copperRed: '#c1743a',
    sulfur: '#e8d44d',
    silver: '#d8dce2',
    chlorine: '#c8e06a',
    no2: '#b5502a',
    bloodRed: '#a01d1d',
    starchBlue: '#2b2b8a',
    kmno4: '#8e2b7a',
    orangeRed: '#e0455a',
    orangeYellow: '#e8c33d'
  };

  var REACTIONS = [

    /* =======================================================================
     * 一、钠及其化合物
     * ===================================================================== */
    {
      id: 'na_h2o',
      name: '钠与水反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['na', 'h2o'],
      ratio: { na: 2, h2o: 2 },
      products: [{ id: 'naoh', n: 2 }, { id: 'h2', n: 1 }],
      equation: '2Na + 2H₂O = 2NaOH + H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '钠浮在水面上，熔成闪亮的小球并四处游动，发出"嘶嘶"的响声，滴有酚酞的溶液变红',
        heat: 184
      },
      priority: 0,
      safety: '钠与水的反应很剧烈，取用钠要用镊子，不能用手直接接触；容器不能太小，防止氢气与空气混合爆炸',
      note: '钠的密度比水小（浮）、熔点低（熔）、反应放热（游、响），产物是氢氧化钠和氢气，'
        + '常概括为"浮、熔、游、响、红"五个字'
    },
    {
      id: 'na_o2_rt',
      name: '钠在常温下与氧气反应',
      type: '化合反应',
      level: 'senior',
      reactants: ['na', 'o2'],
      ratio: { na: 4, o2: 1 },
      products: [{ id: 'na2o', n: 2 }],
      equation: '4Na + O₂ = 2Na₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#cfd4da', pptColor: null,
        message: '银白色的钠表面很快变暗，生成白色的氧化钠固体',
        heat: 0
      },
      note: '常温下缓慢氧化生成氧化钠（白色）；这正是钠必须保存在煤油中隔绝空气的原因'
    },
    {
      id: 'na_o2_ignite',
      name: '钠在空气中燃烧',
      type: '化合反应',
      level: 'senior',
      reactants: ['na', 'o2'],
      ratio: { na: 2, o2: 1 },
      products: [{ id: 'na2o2', n: 1 }],
      equation: '2Na + O₂ = Na₂O₂',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '钠先熔化成小球，随即剧烈燃烧，发出黄色火焰，生成淡黄色的过氧化钠固体',
        heat: 511
      },
      priority: 20,
      safety: '钠燃烧温度很高，不要直视火焰；实验要在石棉网上进行，防止熔化的钠烧坏桌面',
      note: '点燃时产物是过氧化钠（淡黄色），与常温下生成氧化钠（白色）不同'
    },
    {
      id: 'na2o2_h2o',
      name: '过氧化钠与水反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['na2o2', 'h2o'],
      ratio: { na2o2: 2, h2o: 2 },
      products: [{ id: 'naoh', n: 4 }, { id: 'o2', n: 1 }],
      equation: '2Na₂O₂ + 2H₂O = 4NaOH + O₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'o2', toColor: null, pptColor: null,
        message: '淡黄色固体溶解并剧烈放出气泡，气体能使带火星的木条复燃，容器外壁发热，溶液能使酚酞变红',
        heat: 126
      },
      safety: '反应放热并有氧气放出，不要将容器口对着人',
      note: '过氧化钠中氧显 -1 价，反应中既被氧化又被还原（自身歧化）；可用作供氧剂'
    },
    {
      id: 'na2o2_co2',
      name: '过氧化钠与二氧化碳反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['na2o2', 'co2'],
      ratio: { na2o2: 2, co2: 2 },
      products: [{ id: 'na2co3', n: 2 }, { id: 'o2', n: 1 }],
      equation: '2Na₂O₂ + 2CO₂ = 2Na₂CO₃ + O₂',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'o2', toColor: null, pptColor: null,
        message: '淡黄色粉末逐渐变成白色，同时放出能使带火星木条复燃的气体',
        heat: 130
      },
      note: '呼吸面具和潜水艇里用过氧化钠把人体呼出的 CO₂ 和 H₂O 转化成 O₂（配平要点：'
        + '2Na₂O₂ 中 4 个 -1 价氧，2 个变成 0 价 O₂，2 个变成 -2 价）'
    },
    {
      id: 'na2o_h2o',
      name: '氧化钠与水反应',
      type: '化合反应',
      level: 'senior',
      reactants: ['na2o', 'h2o'],
      ratio: { na2o: 1, h2o: 1 },
      products: [{ id: 'naoh', n: 2 }],
      equation: 'Na₂O + H₂O = 2NaOH',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色固体溶解，溶液温度明显升高，得到的溶液能使酚酞变红',
        heat: 97
      },
      note: '氧化钠是碱性氧化物，与水化合生成氢氧化钠；对比 Na₂O₂ 与水的反应（放氧气）'
    },
    {
      id: 'na2o_hcl',
      name: '氧化钠与稀盐酸反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['na2o', 'hcl'],
      ratio: { na2o: 1, hcl: 2 },
      products: [{ id: 'nacl', n: 2 }, { id: 'h2o', n: 1 }],
      equation: 'Na₂O + 2HCl = 2NaCl + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色固体逐渐溶解，溶液无色澄清，容器外壁微微发热',
        heat: 120
      },
      note: '碱性氧化物与酸反应生成盐和水，这是碱性氧化物的通性'
    },
    {
      id: 'na2co3_co2_h2o',
      name: '碳酸钠溶液吸收二氧化碳',
      type: '化合反应',
      level: 'senior',
      reactants: ['na2co3', 'co2'],
      ratio: { na2co3: 1, co2: 1 },
      products: [{ id: 'nahco3', n: 2 }],
      equation: 'Na₂CO₃ + CO₂ + H₂O = 2NaHCO₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '碳酸钠溶液不断吸收二氧化碳，溶液碱性减弱，外观无明显变化；饱和溶液中会析出碳酸氢钠晶体',
        heat: 0
      },
      priority: 15,
      note: '这是侯氏制碱法（联合制碱法）中的关键一步：先通氨气再通二氧化碳，利用碳酸氢钠溶解度较小使其析出'
    },

    /* =======================================================================
     * 二、铝及其化合物
     * ===================================================================== */
    {
      id: 'al_naoh',
      name: '铝与氢氧化钠溶液反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['al', 'naoh'],
      ratio: { al: 2, naoh: 2 },
      products: [{ id: 'naalo2', n: 2 }, { id: 'h2', n: 3 }],
      equation: '2Al + 2NaOH + 2H₂O = 2NaAlO₂ + 3H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '铝片表面产生大量气泡，铝片逐渐溶解，溶液仍为无色，容器外壁发热',
        heat: 450
      },
      safety: '反应放出氢气，点燃前必须验纯；氢氧化钠溶液有强腐蚀性，注意不要沾到皮肤上',
      note: '配平要点：2Al + 2NaOH + 2H₂O = 2NaAlO₂ + 3H₂↑。铝既能与酸反应又能与强碱溶液反应，'
        + '体现铝的两性；这里的氧化剂是水而不是 NaOH'
    },
    {
      id: 'al2o3_naoh',
      name: '氧化铝与氢氧化钠溶液反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['al2o3', 'naoh'],
      ratio: { al2o3: 1, naoh: 2 },
      products: [{ id: 'naalo2', n: 2 }, { id: 'h2o', n: 1 }],
      equation: 'Al₂O₃ + 2NaOH = 2NaAlO₂ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色固体逐渐溶解，溶液无色澄清',
        heat: 100
      },
      note: '氧化铝是两性氧化物，既能溶于强酸又能溶于强碱溶液；所以铝制品不能长时间盛放碱性食物'
    },
    {
      id: 'aloh3_naoh',
      name: '氢氧化铝与氢氧化钠溶液反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['aloh3', 'naoh'],
      ratio: { aloh3: 1, naoh: 1 },
      products: [{ id: 'naalo2', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'Al(OH)₃ + NaOH = NaAlO₂ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色胶状沉淀逐渐溶解，溶液变澄清',
        heat: 60
      },
      note: '氢氧化铝是两性氢氧化物：向氯化铝溶液中滴加氢氧化钠溶液时，沉淀先增多后减少直至完全消失'
    },
    {
      id: 'alcl3_nh3h2o',
      name: '氯化铝与氨水反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['alcl3', 'nh3h2o'],
      ratio: { alcl3: 1, nh3h2o: 3 },
      products: [{ id: 'aloh3', n: 1 }, { id: 'nh4cl', n: 3 }],
      equation: 'AlCl₃ + 3NH₃·H₂O = Al(OH)₃↓ + 3NH₄Cl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#eef1f5',
        message: '产生白色胶状沉淀，继续滴加氨水沉淀也不溶解',
        heat: 15
      },
      note: '实验室制取氢氧化铝用氨水而不用氢氧化钠溶液：氢氧化铝不溶于弱碱氨水，容易控制沉淀完全'
    },
    {
      id: 'naalo2_co2',
      name: '偏铝酸钠溶液中通入二氧化碳',
      type: '复分解反应',
      level: 'senior',
      reactants: ['naalo2', 'co2'],
      ratio: { naalo2: 1, co2: 1 },
      products: [{ id: 'aloh3', n: 1 }, { id: 'nahco3', n: 1 }],
      equation: 'NaAlO₂ + CO₂ + 2H₂O = Al(OH)₃↓ + NaHCO₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#eef1f5',
        message: '溶液中出现白色胶状沉淀（二氧化碳过量时生成碳酸氢钠）',
        heat: 20
      },
      priority: 20,
      note: '碳酸的酸性比氢氧化铝强，所以 CO₂ 通入偏铝酸钠溶液能析出氢氧化铝，'
        + '说明 Al(OH)₃ 不溶于碳酸这样的弱酸'
    },
    {
      id: 'naalo2_hcl',
      name: '偏铝酸钠与盐酸反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['naalo2', 'hcl'],
      ratio: { naalo2: 1, hcl: 4 },
      products: [{ id: 'alcl3', n: 1 }, { id: 'nacl', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'NaAlO₂ + 4HCl = AlCl₃ + NaCl + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '先出现白色胶状沉淀，继续滴加盐酸沉淀又溶解，最终得到无色澄清溶液',
        heat: 80
      },
      safety: '盐酸有腐蚀性，滴加时要小心操作',
      note: '盐酸少量时生成 Al(OH)₃ 沉淀，盐酸过量时沉淀溶解生成 AlCl₃；'
        + '同一组物质因"量"不同产物不同，是离子反应中常见的讨论点'
    },
    {
      id: 'al_fe2o3',
      name: '铝热反应（铝与氧化铁）',
      type: '置换反应',
      level: 'senior',
      reactants: ['al', 'fe2o3'],
      ratio: { al: 2, fe2o3: 1 },
      products: [{ id: 'al2o3', n: 1 }, { id: 'fe', n: 2 }],
      equation: '2Al + Fe₂O₃ = Al₂O₃ + 2Fe',
      conditions: { heat: true, ignite: true, catalyst: null, minTemp: 600, needsWater: false },
      phenomena: {
        kind: 'glow', gas: null, toColor: null, pptColor: null,
        message: '引燃后混合物剧烈反应，放出大量的热并发出耀眼的白光，纸漏斗被烧穿，熔化的铁珠落进沙中',
        heat: 852
      },
      safety: '铝热反应温度可达 2000 ℃ 以上，必须在沙盘中进行，远离可燃物，不能直视强光',
      note: '铝作还原剂，把铁从它的氧化物中还原出来；铝热反应可用于焊接钢轨和冶炼难熔金属'
    },

    /* =======================================================================
     * 三、铁及其化合物
     * ===================================================================== */
    {
      id: 'fe_cl2',
      name: '铁在氯气中燃烧',
      type: '化合反应',
      level: 'senior',
      reactants: ['fe', 'cl2'],
      ratio: { fe: 2, cl2: 3 },
      products: [{ id: 'fecl3', n: 2 }],
      equation: '2Fe + 3Cl₂ = 2FeCl₃',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'smoke', gas: null, toColor: null, pptColor: null,
        message: '铁丝在氯气中剧烈燃烧，产生棕黄色的烟（氯化铁固体小颗粒），加水后溶液呈黄色',
        heat: 800
      },
      safety: '氯气有毒，实验要在通风橱中进行，尾气必须用碱液吸收',
      note: '铁在氯气中燃烧生成 +3 价的 FeCl₃，而铁与盐酸反应只得到 +2 价的 FeCl₂，'
        + '说明氧化性 Cl₂ > H⁺，产物与氧化剂的强弱有关'
    },
    {
      id: 'fe_h2o_g',
      name: '铁与水蒸气反应',
      type: '置换反应',
      level: 'senior',
      reactants: ['fe', 'h2o'],
      ratio: { fe: 3, h2o: 4 },
      products: [{ id: 'fe3o4', n: 1 }, { id: 'h2', n: 4 }],
      equation: '3Fe + 4H₂O = Fe₃O₄ + 4H₂',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 600, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '红热的铁粉与水蒸气反应，收集到的气体能被点燃（氢气），同时生成黑色的四氧化三铁',
        heat: 150
      },
      safety: '先排尽装置内的空气再加热，防止氢气与空气混合加热时爆炸',
      note: '高温下铁与水蒸气反应生成 Fe₃O₄ 和 H₂，说明高温下铁也能与水反应（常温下铁与水不反应）'
    },
    {
      id: 'feoh2_o2',
      name: '氢氧化亚铁被氧气氧化',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['feoh2', 'o2'],
      ratio: { feoh2: 4, o2: 1 },
      products: [{ id: 'feoh3', n: 4 }],
      equation: '4Fe(OH)₂ + O₂ + 2H₂O = 4Fe(OH)₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#a0522d', pptColor: null,
        message: '白色絮状沉淀迅速变成灰绿色，最后变成红褐色',
        heat: 0
      },
      priority: 10,
      note: '氢氧化亚铁极不稳定，容易被空气中的氧气氧化；制备时要把蒸馏水煮沸除氧，'
        + '并把滴管伸入液面以下加碱'
    },
    {
      id: 'fe_kscn',
      name: '硫氰化钾溶液检验铁离子',
      type: '其他',
      level: 'senior',
      reactants: ['fecl3', 'kscn'],
      ratio: { fecl3: 1, kscn: 3 },
      products: [{ id: 'fe_scn3', n: 1 }, { id: 'kcl', n: 3 }],
      equation: 'FeCl₃ + 3KSCN = Fe(SCN)₃ + 3KCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#a01d1d', pptColor: null,
        message: '溶液立即变成血红色，这是 Fe³⁺ 的特征反应',
        heat: 0
      },
      priority: 25,
      indicator: true,
      note: '检验 Fe³⁺ 常用 KSCN 溶液，现象灵敏；Fe²⁺ 遇 KSCN 不变色，'
        + '所以可以用 KSCN 溶液区别 Fe²⁺ 和 Fe³⁺'
    },
    {
      id: 'fe_fecl3',
      name: '铁与氯化铁溶液反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['fe', 'fecl3'],
      ratio: { fe: 1, fecl3: 2 },
      products: [{ id: 'fecl2', n: 3 }],
      equation: 'Fe + 2FeCl₃ = 3FeCl₂',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#9fd39a', pptColor: null,
        message: '铁粉逐渐溶解，黄色的溶液变成浅绿色',
        heat: 0
      },
      note: 'Fe³⁺ 具有氧化性，能被铁还原成 Fe²⁺；这一原理可用于除去溶液中多余的 Fe³⁺'
    },
    {
      id: 'cu_fecl3',
      name: '铜与氯化铁溶液反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['cu', 'fecl3'],
      ratio: { cu: 1, fecl3: 2 },
      products: [{ id: 'cucl2', n: 1 }, { id: 'fecl2', n: 2 }],
      equation: 'Cu + 2FeCl₃ = CuCl₂ + 2FeCl₂',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#3fb0a8', pptColor: null,
        message: '铜片逐渐溶解，溶液由黄色变成蓝绿色',
        heat: 0
      },
      note: '氧化性 Fe³⁺ > Cu²⁺，所以铜能被 FeCl₃ 溶液氧化；'
        + '工业上利用这一反应腐蚀铜制印刷线路板'
    },

    /* =======================================================================
     * 四、氯及其化合物
     * ===================================================================== */
    {
      id: 'cl2_h2o',
      name: '氯气与水反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['cl2', 'h2o'],
      ratio: { cl2: 1, h2o: 1 },
      products: [{ id: 'hcl', n: 1 }, { id: 'hclo', n: 1 }],
      equation: 'Cl₂ + H₂O = HCl + HClO',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '氯气溶于水得到浅黄绿色的氯水，溶液显酸性，能使有色布条褪色（漂白性）',
        heat: 0
      },
      note: '氯水中只有一部分氯气与水反应，起漂白作用的是次氯酸而不是氯气本身；'
        + '干燥的氯气没有漂白性'
    },
    {
      id: 'cl2_naoh',
      name: '氯气与氢氧化钠溶液反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['cl2', 'naoh'],
      ratio: { cl2: 1, naoh: 2 },
      products: [{ id: 'nacl', n: 1 }, { id: 'naclo', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'Cl₂ + 2NaOH = NaCl + NaClO + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eaf4ff', pptColor: null,
        message: '黄绿色逐渐褪去，溶液变成无色（实验室常用氢氧化钠溶液吸收氯气尾气）',
        heat: 100
      },
      priority: 20,
      safety: '氯气有毒，吸收尾气时要注意通风，防止多余氯气逸出',
      note: '氯气与碱的反应是歧化反应：氯气中 0 价的氯既被氧化成 +1 价（ClO⁻）又被还原成 -1 价（Cl⁻）'
    },
    {
      id: 'cl2_caoh2',
      name: '氯气与石灰乳反应（制漂白粉）',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['cl2', 'caoh2'],
      ratio: { cl2: 2, caoh2: 2 },
      products: [{ id: 'ca_clo2', n: 1 }, { id: 'cacl2', n: 1 }, { id: 'h2o', n: 2 }],
      equation: '2Cl₂ + 2Ca(OH)₂ = Ca(ClO)₂ + CaCl₂ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eaf4ff', pptColor: null,
        message: '黄绿色逐渐褪去，得到白色的漂白粉（工业上用氯气与石灰乳反应制取）',
        heat: 200
      },
      priority: 25,
      safety: '氯气有毒，生产要在密闭设备中进行，尾气用碱液吸收',
      note: '漂白粉的主要成分是 Ca(ClO)₂ 和 CaCl₂，有效成分是 Ca(ClO)₂；'
        + '漂白粉在空气中久置会因生成 HClO 分解而失效'
    },
    {
      id: 'cl2_cu',
      name: '铜在氯气中燃烧',
      type: '化合反应',
      level: 'senior',
      reactants: ['cu', 'cl2'],
      ratio: { cu: 1, cl2: 1 },
      products: [{ id: 'cucl2', n: 1 }],
      equation: 'Cu + Cl₂ = CuCl₂',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'smoke', gas: null, toColor: null, pptColor: null,
        message: '铜丝在氯气中剧烈燃烧，产生棕黄色的烟，加水后溶液呈蓝绿色',
        heat: 220
      },
      safety: '氯气有毒，实验要在通风橱中进行',
      note: '氯气把铜氧化成 +2 价；棕黄色的烟是氯化铜固体小颗粒'
    },
    {
      id: 'cl2_h2_ignite',
      name: '氢气在氯气中燃烧',
      type: '化合反应',
      level: 'senior',
      reactants: ['h2', 'cl2'],
      ratio: { h2: 1, cl2: 1 },
      products: [{ id: 'hcl_g', n: 2 }],
      equation: 'H₂ + Cl₂ = 2HCl',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false, light: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '氢气在氯气中安静地燃烧，发出苍白色火焰，瓶口出现白雾（氯化氢遇水蒸气形成盐酸小液滴）',
        heat: 184
      },
      safety: '氢气与氯气的混合气见光或点燃都会爆炸，实验前必须验纯并做好防护',
      note: '氢气与氯气在点燃或强光照射下都能化合（点燃时安静燃烧发出苍白色火焰，'
        + '光照时则发生爆炸）；工业上用水吸收氯化氢制得盐酸'
    },
    {
      id: 'cl2_h2_light',
      name: '氢气与氯气光照化合',
      type: '化合反应',
      level: 'senior',
      reactants: ['h2', 'cl2'],
      ratio: { h2: 1, cl2: 1 },
      products: [{ id: 'hcl_g', n: 2 }],
      equation: 'H₂ + Cl₂ = 2HCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false, light: true },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '强光照射下氢气和氯气的混合气体迅速化合，发生剧烈反应（爆炸），瓶内充满氯化氢',
        heat: 184
      },
      safety: '氢气与氯气的混合气遇强光会立即爆炸，实验必须用很小的量并在防护屏后进行',
      note: '这一反应说明有些反应需要光提供能量才能发生：黑暗处氢气与氯气可以共存，'
        + '强光照射则剧烈化合'
    },
    {
      id: 'cl2_ki',
      name: '氯气与碘化钾溶液反应',
      type: '置换反应',
      level: 'senior',
      reactants: ['cl2', 'ki'],
      ratio: { cl2: 1, ki: 2 },
      products: [{ id: 'kcl', n: 2 }, { id: 'i2', n: 1 }],
      equation: 'Cl₂ + 2KI = 2KCl + I₂',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#a0522d', pptColor: null,
        message: '无色溶液变成棕黄色（析出碘单质），加入淀粉溶液后变蓝',
        heat: 0
      },
      note: '氧化性 Cl₂ > I₂，所以氯气能把碘从碘化钾溶液中置换出来；'
        + '湿润的淀粉碘化钾试纸常用于检验氯气'
    },
    {
      id: 'hclo_light',
      name: '次氯酸见光分解',
      type: '分解反应',
      level: 'senior',
      reactants: ['hclo'],
      ratio: { hclo: 2 },
      products: [{ id: 'hcl', n: 2 }, { id: 'o2', n: 1 }],
      equation: '2HClO = 2HCl + O₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false, light: true },
      phenomena: {
        kind: 'bubble', gas: 'o2', toColor: null, pptColor: null,
        message: '光照下氯水中不断有气泡逸出，黄绿色逐渐变浅，漂白能力减弱',
        heat: 0
      },
      note: '次氯酸见光分解，所以氯水和漂白粉都要避光密封保存；'
        + '本规则要求先用工具栏的"光照"照射容器'
    },
    {
      id: 'naclo_co2',
      name: '次氯酸钠溶液中通入二氧化碳',
      type: '复分解反应',
      level: 'senior',
      reactants: ['naclo', 'co2'],
      ratio: { naclo: 1, co2: 1 },
      products: [{ id: 'nahco3', n: 1 }, { id: 'hclo', n: 1 }],
      equation: 'NaClO + CO₂ + H₂O = NaHCO₃ + HClO',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '无明显外观变化，但溶液的漂白能力增强（生成了漂白性更强的次氯酸）',
        heat: 0
      },
      priority: 15,
      note: '碳酸的酸性比次氯酸强，所以 CO₂ 通入次氯酸钠溶液可以制得 HClO；'
        + '这正是漂白粉在空气中久置失效的原因'
    },
    {
      id: 'cl2_na2so3',
      name: '氯气与亚硫酸钠溶液反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['cl2', 'na2so3'],
      ratio: { cl2: 1, na2so3: 1 },
      products: [{ id: 'na2so4', n: 1 }, { id: 'hcl', n: 2 }],
      equation: 'Cl₂ + Na₂SO₃ + H₂O = Na₂SO₄ + 2HCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eaf4ff', pptColor: null,
        message: '溶液的黄绿色褪去，氯气被亚硫酸钠还原吸收',
        heat: 0
      },
      priority: 20,
      note: '氯气具有氧化性，把 +4 价的硫氧化成 +6 价；'
        + '工业上可用亚硫酸钠溶液除去水中残留的氯'
    },

    /* =======================================================================
     * 五、硫及其化合物
     * ===================================================================== */
    {
      id: 'so2_h2o',
      name: '二氧化硫与水反应',
      type: '化合反应',
      level: 'senior',
      reactants: ['so2', 'h2o'],
      ratio: { so2: 1, h2o: 1 },
      products: [{ id: 'h2so3', n: 1 }],
      equation: 'SO₂ + H₂O = H₂SO₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '二氧化硫溶于水，外观无明显变化，但溶液显酸性（能使紫色石蕊变红）',
        heat: 30
      },
      note: '二氧化硫与水反应生成亚硫酸，亚硫酸是形成酸雨的主要物质之一；'
        + '该反应是可逆的，加热时二氧化硫又会逸出'
    },
    {
      id: 'so2_o2',
      name: '二氧化硫的催化氧化',
      type: '化合反应',
      level: 'senior',
      reactants: ['so2', 'o2'],
      ratio: { so2: 2, o2: 1 },
      products: [{ id: 'so3', n: 2 }],
      equation: '2SO₂ + O₂ = 2SO₃',
      conditions: { heat: true, ignite: false, catalyst: 'v2o5', minTemp: 400, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '在催化剂和加热条件下二氧化硫被氧气氧化成三氧化硫，无明显外观变化',
        heat: 197
      },
      note: '接触法制硫酸的关键一步：2SO₂ + O₂ ⇌ 2SO₃，实际用 V₂O₅ 作催化剂，'
        + '反应放热且可逆'
    },
    {
      id: 'so3_h2o',
      name: '三氧化硫与水反应',
      type: '化合反应',
      level: 'senior',
      reactants: ['so3', 'h2o'],
      ratio: { so3: 1, h2o: 1 },
      products: [{ id: 'h2so4', n: 1 }],
      equation: 'SO₃ + H₂O = H₂SO₄',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'smoke', gas: null, toColor: null, pptColor: null,
        message: '三氧化硫与水剧烈化合，放出大量的热并产生大量白色酸雾',
        heat: 130
      },
      safety: '反应放出大量热并有酸雾，不要用手直接接触容器，注意通风',
      note: '工业上用 98.3% 的浓硫酸吸收三氧化硫，以避免形成酸雾降低吸收效率'
    },
    {
      id: 'h2s_o2_full',
      name: '硫化氢在氧气中充分燃烧',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['h2s', 'o2'],
      ratio: { h2s: 2, o2: 3 },
      products: [{ id: 'so2', n: 2 }, { id: 'h2o', n: 2 }],
      equation: '2H₂S + 3O₂ = 2SO₂ + 2H₂O',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '氧气充足时硫化氢燃烧发出淡蓝色火焰，生成有刺激性气味的二氧化硫',
        heat: 1120
      },
      priority: 20,
      safety: '硫化氢有毒且易燃，必须在通风处进行，点燃前要验纯',
      note: '氧气充足时硫被氧化到 +4 价；氧气不足时只生成单质硫'
    },
    {
      id: 'h2s_o2_less',
      name: '硫化氢在氧气中不充分燃烧',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['h2s', 'o2'],
      ratio: { h2s: 2, o2: 1 },
      products: [{ id: 's', n: 2 }, { id: 'h2o', n: 2 }],
      equation: '2H₂S + O₂ = 2S↓ + 2H₂O',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#e8d44d',
        message: '氧气不足时硫化氢燃烧发出淡蓝色火焰，同时析出淡黄色的硫',
        heat: 440
      },
      safety: '硫化氢有毒，实验要在通风处进行',
      note: '氧气不足时硫只被氧化到 0 价；同一反应物因氧气量不同产物不同'
    },
    {
      id: 'h2s_so2',
      name: '硫化氢与二氧化硫反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['h2s', 'so2'],
      ratio: { h2s: 2, so2: 1 },
      products: [{ id: 's', n: 3 }, { id: 'h2o', n: 2 }],
      equation: '2H₂S + SO₂ = 3S↓ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#e8d44d',
        message: '两种气体混合后立即出现淡黄色的硫，容器内壁附着一层黄色固体',
        heat: 230
      },
      safety: '两种气体都有毒，实验要在通风橱中进行',
      note: '同种元素不同价态之间的归中反应：-2 价的硫与 +4 价的硫化合生成 0 价的硫，'
        + '不能生成 +2 价的硫'
    },
    {
      id: 'cu_h2so4_conc',
      name: '铜与浓硫酸反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['cu', 'h2so4_conc'],
      ratio: { cu: 1, h2so4_conc: 2 },
      products: [{ id: 'cuso4', n: 1 }, { id: 'so2', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'Cu + 2H₂SO₄ = CuSO₄ + SO₂↑ + 2H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'so2', toColor: null, pptColor: null,
        message: '加热时铜片逐渐溶解，溶液变蓝，同时放出有刺激性气味的气体（二氧化硫）',
        heat: 400
      },
      safety: '浓硫酸有强腐蚀性，加热时有二氧化硫逸出，必须在通风橱中进行',
      note: '浓硫酸具有强氧化性，加热时能氧化铜；起氧化作用的是 +6 价的硫而不是 H⁺，'
        + '所以不放出氢气（对比：铜与稀硫酸不反应）'
    },
    {
      id: 'c_h2so4_conc',
      name: '木炭与浓硫酸反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['c', 'h2so4_conc'],
      ratio: { c: 1, h2so4_conc: 2 },
      products: [{ id: 'co2', n: 1 }, { id: 'so2', n: 2 }, { id: 'h2o', n: 2 }],
      equation: 'C + 2H₂SO₄ = CO₂↑ + 2SO₂↑ + 2H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'so2', toColor: null, pptColor: null,
        message: '木炭与热的浓硫酸剧烈反应，放出大量气体，气体有刺激性气味且能使澄清石灰水变浑浊',
        heat: 130
      },
      safety: '二氧化硫有毒，尾气必须用碱液吸收，实验在通风橱中进行',
      note: '浓硫酸的强氧化性：+6 价的硫被还原成 +4 价，碳被氧化成二氧化碳；'
        + '这也是浓硫酸能使蔗糖"变黑"并产生刺激性气味气体的原因'
    },
    {
      id: 'so2_cl2_h2o',
      name: '二氧化硫与氯水反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['so2', 'cl2'],
      ratio: { so2: 1, cl2: 1 },
      products: [{ id: 'h2so4', n: 1 }, { id: 'hcl', n: 2 }],
      equation: 'SO₂ + Cl₂ + 2H₂O = H₂SO₄ + 2HCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eaf4ff', pptColor: null,
        message: '氯水的黄绿色褪去，说明二氧化硫被氯气氧化（不能用氯水来漂白二氧化硫漂白过的物质）',
        heat: 0
      },
      priority: 20,
      note: '二氧化硫具有还原性，能被氯水、氧气、酸性高锰酸钾溶液氧化；'
        + '若把 SO₂ 和 Cl₂ 按 1:1 混合通入品红溶液，则不再有漂白性'
    },
    {
      id: 'so2_kmno4',
      name: '二氧化硫与酸性高锰酸钾溶液反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['so2', 'kmno4'],
      ratio: { so2: 5, kmno4: 2 },
      products: [{ id: 'mnso4', n: 2 }, { id: 'k2so4', n: 1 }, { id: 'h2so4', n: 2 }],
      equation: '5SO₂ + 2KMnO₄ + 2H₂O = 2MnSO₄ + K₂SO₄ + 2H₂SO₄',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eaf4ff', pptColor: null,
        message: '紫红色的高锰酸钾溶液褪色，说明二氧化硫具有还原性',
        heat: 0
      },
      priority: 25,
      safety: '高锰酸钾有强氧化性和腐蚀性，注意不要沾到皮肤上',
      note: '配平要点：S 由 +4 价升到 +6 价（失 2 个电子），Mn 由 +7 价降到 +2 价（得 5 个电子），'
        + '所以 SO₂ 与 KMnO₄ 的系数比为 5:2'
    },

    /* =======================================================================
     * 六、氮及其化合物
     * ===================================================================== */
    {
      id: 'n2_h2',
      name: '氮气与氢气合成氨',
      type: '化合反应',
      level: 'senior',
      reactants: ['n2', 'h2'],
      ratio: { n2: 1, h2: 3 },
      products: [{ id: 'nh3', n: 2 }],
      equation: 'N₂ + 3H₂ = 2NH₃',
      conditions: { heat: true, ignite: false, catalyst: 'fe', minTemp: 400, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '在高温、高压和催化剂条件下氮气与氢气化合生成氨，外观无明显变化',
        heat: 92
      },
      safety: '合成氨在高压设备中进行，实验室里只做原理演示',
      note: '工业合成氨是可逆反应，需要高温高压并使用铁触媒作催化剂；'
        + '这是氮的固定最重要的途径，也是工业制硝酸的第一步'
    },
    {
      id: 'nh3_h2o',
      name: '氨气溶于水',
      type: '化合反应',
      level: 'senior',
      reactants: ['nh3', 'h2o'],
      ratio: { nh3: 1, h2o: 1 },
      products: [{ id: 'nh3h2o', n: 1 }],
      equation: 'NH₃ + H₂O = NH₃·H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '氨气极易溶于水，容器内气体迅速减少，得到的溶液显碱性（能使酚酞变红）',
        heat: 35
      },
      safety: '氨气有强烈刺激性气味，实验应在通风处进行',
      note: '氨气极易溶于水（1 体积水约溶解 700 体积氨气），可用于做喷泉实验；'
        + '氨水中主要存在的微粒是 NH₃·H₂O，它能部分电离出 NH₄⁺ 和 OH⁻'
    },
    {
      id: 'nh3_hcl',
      name: '氨气与氯化氢反应',
      type: '化合反应',
      level: 'senior',
      reactants: ['nh3', 'hcl_g'],
      ratio: { nh3: 1, hcl_g: 1 },
      products: [{ id: 'nh4cl', n: 1 }],
      equation: 'NH₃ + HCl = NH₄Cl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'smoke', gas: null, toColor: null, pptColor: null,
        message: '两瓶气体靠近时立即产生大量白烟（氯化铵固体小颗粒）',
        heat: 176
      },
      safety: '氨气和氯化氢都有刺激性气味，实验要在通风处进行',
      note: '白烟是 NH₄Cl 固体小颗粒，不是白雾；这一反应可用于互相检验氨气和氯化氢气体'
    },
    {
      id: 'nh4cl_heat',
      name: '氯化铵受热分解',
      type: '分解反应',
      level: 'senior',
      reactants: ['nh4cl'],
      ratio: { nh4cl: 1 },
      products: [{ id: 'nh3', n: 1 }, { id: 'hcl_g', n: 1 }],
      equation: 'NH₄Cl = NH₃↑ + HCl↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'nh3', toColor: null, pptColor: null,
        message: '白色固体受热逐渐减少，试管口附近又出现白色固体（NH₃ 与 HCl 重新化合），并闻到刺激性气味',
        heat: -176
      },
      safety: '生成的氨气和氯化氢都有刺激性气味，实验要在通风处进行',
      note: '氯化铵受热分解生成的两种气体遇冷又重新化合，所以加热氯化铵得不到纯净的氨气；'
        + '实验室制氨气用氯化铵与熟石灰混合加热'
    },
    {
      id: 'nh3_o2_cat',
      name: '氨的催化氧化',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['nh3', 'o2'],
      ratio: { nh3: 4, o2: 5 },
      products: [{ id: 'no', n: 4 }, { id: 'h2o', n: 6 }],
      equation: '4NH₃ + 5O₂ = 4NO + 6H₂O',
      conditions: { heat: true, ignite: false, catalyst: 'pt', minTemp: 300, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '红热的铂丝继续保持红热，氨气被氧化成一氧化氮，刺激性气味逐渐消失',
        heat: 905
      },
      safety: '氨气有刺激性气味，一氧化氮有毒，实验要在通风橱中进行',
      note: '氨的催化氧化是工业制硝酸的第一步，催化剂是铂；'
        + '生成的 NO 遇空气立即变成红棕色的 NO₂'
    },
    {
      id: 'no_o2',
      name: '一氧化氮与氧气反应',
      type: '化合反应',
      level: 'senior',
      reactants: ['no', 'o2'],
      ratio: { no: 2, o2: 1 },
      products: [{ id: 'no2', n: 2 }],
      equation: '2NO + O₂ = 2NO₂',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#b5502a', pptColor: null,
        message: '无色的气体立即变成红棕色（生成二氧化氮）',
        heat: 113
      },
      safety: '一氧化氮和二氧化氮都有毒，实验要在通风橱中进行',
      note: '这是 NO 只能用排水法收集的原因，也是"无色气体遇空气变红棕色"这一检验方法的依据'
    },
    {
      id: 'no2_h2o',
      name: '二氧化氮与水反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['no2', 'h2o'],
      ratio: { no2: 3, h2o: 1 },
      products: [{ id: 'hno3', n: 2 }, { id: 'no', n: 1 }],
      equation: '3NO₂ + H₂O = 2HNO₃ + NO',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#e6ecdf', pptColor: null,
        message: '红棕色气体通入水中颜色变浅，水溶液显酸性，同时有无色气体（NO）放出',
        heat: 0
      },
      safety: '二氧化氮和一氧化氮都有毒，实验要在通风橱中进行',
      note: '二氧化氮与水反应是歧化反应；工业制硝酸时通入过量空气使 NO 循环利用，提高原料利用率'
    },
    {
      id: 'cu_hno3_conc',
      name: '铜与浓硝酸反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['cu', 'hno3_conc'],
      ratio: { cu: 1, hno3_conc: 4 },
      products: [{ id: 'cu_no32', n: 1 }, { id: 'no2', n: 2 }, { id: 'h2o', n: 2 }],
      equation: 'Cu + 4HNO₃ = Cu(NO₃)₂ + 2NO₂↑ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'no2', toColor: null, pptColor: null,
        message: '铜片剧烈溶解，溶液变成蓝色，同时放出红棕色的气体，反应非常剧烈',
        heat: 400
      },
      safety: '浓硝酸有强腐蚀性，二氧化氮有毒，实验必须在通风橱中进行',
      note: '浓硝酸与铜反应生成红棕色的 NO₂；常温下浓硝酸还能使铁、铝钝化'
    },
    {
      id: 'cu_hno3_dilute',
      name: '铜与稀硝酸反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['cu', 'hno3'],
      ratio: { cu: 3, hno3: 8 },
      products: [{ id: 'cu_no32', n: 3 }, { id: 'no', n: 2 }, { id: 'h2o', n: 4 }],
      equation: '3Cu + 8HNO₃ = 3Cu(NO₃)₂ + 2NO↑ + 4H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'no', toColor: null, pptColor: null,
        message: '铜片逐渐溶解，溶液变成蓝色，有无色气体放出，气体到容器口遇到空气变成红棕色',
        heat: 350
      },
      safety: '稀硝酸有强腐蚀性，生成的一氧化氮有毒，实验要在通风橱中进行',
      note: '配平要点：Cu 失 2 个电子，N 由 +5 降到 +2 得 3 个电子，'
        + '故 3Cu 对应 2NO；硝酸越稀，被还原的程度越大'
    },
    {
      id: 'fe_hno3_dilute',
      name: '铁与稀硝酸反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['fe', 'hno3'],
      ratio: { fe: 1, hno3: 4 },
      products: [{ id: 'fe_no33', n: 1 }, { id: 'no', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'Fe + 4HNO₃ = Fe(NO₃)₃ + NO↑ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'no', toColor: null, pptColor: null,
        message: '铁粉逐渐溶解，溶液变成黄色，有无色气体放出（到容器口变成红棕色）',
        heat: 300
      },
      safety: '硝酸有强腐蚀性，生成的一氧化氮有毒，实验要在通风橱中进行',
      note: '硝酸过量时铁被氧化成 +3 价（本规则）；铁过量时 Fe 还能把 Fe³⁺ 还原成 Fe²⁺，'
        + '所以产物与反应物的用量有关'
    },
    {
      id: 'nh3_cuo',
      name: '氨气还原氧化铜',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['nh3', 'cuo'],
      ratio: { nh3: 2, cuo: 3 },
      products: [{ id: 'n2', n: 1 }, { id: 'cu', n: 3 }, { id: 'h2o', n: 3 }],
      equation: '2NH₃ + 3CuO = N₂ + 3Cu + 3H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#c1743a', pptColor: null,
        message: '黑色粉末逐渐变成光亮的紫红色，同时放出无色无味的气体（氮气）',
        heat: 0
      },
      safety: '氨气有刺激性气味，实验要在通风处进行',
      note: '氨气具有还原性，能被氧化铜氧化成氮气；这是演示氨气还原性的经典实验'
    },
    {
      id: 'no2_naoh',
      name: '二氧化氮与氢氧化钠溶液反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['no2', 'naoh'],
      ratio: { no2: 2, naoh: 2 },
      products: [{ id: 'nano3', n: 1 }, { id: 'nano2', n: 1 }, { id: 'h2o', n: 1 }],
      equation: '2NO₂ + 2NaOH = NaNO₃ + NaNO₂ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eaf4ff', pptColor: null,
        message: '红棕色气体被氢氧化钠溶液吸收，颜色褪去',
        heat: 120
      },
      priority: 20,
      safety: '二氧化氮有毒，实验要在通风橱中进行',
      note: '用碱液吸收二氧化氮是处理尾气的常用方法；'
        + '工业尾气中还通入氧气，使 NO 也转化成 NO₂ 后被碱液吸收'
    },

    /* =======================================================================
     * 七、硅及其化合物
     * ===================================================================== */
    {
      id: 'si_o2',
      name: '硅与氧气反应',
      type: '化合反应',
      level: 'senior',
      reactants: ['si', 'o2'],
      ratio: { si: 1, o2: 1 },
      products: [{ id: 'sio2', n: 1 }],
      equation: 'Si + O₂ = SiO₂',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'glow', gas: null, toColor: null, pptColor: null,
        message: '加热时硅与氧气化合，发出白光，生成白色的二氧化硅',
        heat: 910
      },
      note: '硅在常温下只与氟气、氢氟酸和强碱溶液反应，加热时能与氧气、氯气等反应'
    },
    {
      id: 'si_naoh',
      name: '硅与氢氧化钠溶液反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['si', 'naoh'],
      ratio: { si: 1, naoh: 2 },
      products: [{ id: 'na2sio3', n: 1 }, { id: 'h2', n: 2 }],
      equation: 'Si + 2NaOH + H₂O = Na₂SiO₃ + 2H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '硅粉表面产生大量气泡，硅逐渐溶解，溶液变得黏稠（生成硅酸钠）',
        heat: 400
      },
      safety: '反应放出氢气，点燃前必须验纯；氢氧化钠溶液有强腐蚀性',
      note: '硅也能与强碱溶液反应放出氢气，与铝相似；'
        + '所以盛放碱液的试剂瓶要用橡胶塞，否则生成的硅酸钠会把玻璃塞粘住'
    },
    {
      id: 'sio2_naoh',
      name: '二氧化硅与氢氧化钠溶液反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['sio2', 'naoh'],
      ratio: { sio2: 1, naoh: 2 },
      products: [{ id: 'na2sio3', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'SiO₂ + 2NaOH = Na₂SiO₃ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色固体逐渐溶解，得到黏稠的硅酸钠溶液',
        heat: 0
      },
      note: '二氧化硅是酸性氧化物，能与强碱溶液反应；实验室保存氢氧化钠溶液必须用橡胶塞'
    },
    {
      id: 'sio2_caco3',
      name: '二氧化硅与碳酸钙高温反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['sio2', 'caco3'],
      ratio: { sio2: 1, caco3: 1 },
      products: [{ id: 'casio3', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'SiO₂ + CaCO₃ = CaSiO₃ + CO₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 600, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'co2', toColor: null, pptColor: null,
        message: '高温下混合物熔融，放出能使澄清石灰水变浑浊的气体，生成硅酸钙',
        heat: -90
      },
      note: '工业上制普通玻璃的主要反应之一（高温下二氧化碳不断逸出使反应进行到底）'
    },
    {
      id: 'sio2_hf',
      name: '二氧化硅与氢氟酸反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['sio2', 'hf'],
      ratio: { sio2: 1, hf: 4 },
      products: [{ id: 'sif4', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'SiO₂ + 4HF = SiF₄↑ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'sif4', toColor: null, pptColor: null,
        message: '玻璃（二氧化硅）逐渐被腐蚀，有气体放出，玻璃表面变得粗糙',
        heat: 0
      },
      safety: '氢氟酸有剧毒且能腐蚀皮肤，必须戴橡胶手套操作，绝对不能用手直接接触',
      note: '氢氟酸是唯一能与二氧化硅反应的酸，因此可用于雕刻玻璃；'
        + '不能用玻璃瓶盛放氢氟酸，要用塑料瓶'
    },
    {
      id: 'na2sio3_co2',
      name: '硅酸钠溶液中通入二氧化碳',
      type: '复分解反应',
      level: 'senior',
      reactants: ['na2sio3', 'co2'],
      ratio: { na2sio3: 1, co2: 1 },
      products: [{ id: 'h2sio3', n: 1 }, { id: 'na2co3', n: 1 }],
      equation: 'Na₂SiO₃ + CO₂ + H₂O = H₂SiO₃↓ + Na₂CO₃',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#eef1f5',
        message: '溶液变浑浊，出现白色胶状沉淀（硅酸）',
        heat: 0
      },
      priority: 20,
      note: '碳酸的酸性比硅酸强，所以 CO₂ 通入硅酸钠溶液能得到硅酸；'
        + '这可用于比较碳酸与硅酸的酸性强弱'
    },
    {
      id: 'na2sio3_hcl',
      name: '硅酸钠与盐酸反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['na2sio3', 'hcl'],
      ratio: { na2sio3: 1, hcl: 2 },
      products: [{ id: 'h2sio3', n: 1 }, { id: 'nacl', n: 2 }],
      equation: 'Na₂SiO₃ + 2HCl = H₂SiO₃↓ + 2NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#eef1f5',
        message: '立即出现白色胶状沉淀（硅酸），溶液变浑浊',
        heat: 0
      },
      note: '强酸制弱酸：盐酸的酸性比硅酸强'
    },

    /* =======================================================================
     * 八、有机化合物
     * ===================================================================== */
    {
      id: 'ch4_cl2',
      name: '甲烷与氯气发生取代反应',
      type: '其他',
      level: 'senior',
      reactants: ['ch4', 'cl2'],
      ratio: { ch4: 1, cl2: 1 },
      products: [{ id: 'ch3cl', n: 1 }, { id: 'hcl_g', n: 1 }],
      equation: 'CH₄ + Cl₂ = CH₃Cl + HCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false, light: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eaf4ff', pptColor: null,
        message: '黄绿色逐渐变浅，容器内壁出现油状液滴（二氯甲烷、三氯甲烷等），并出现白雾',
        heat: 0
      },
      safety: '甲烷与氯气在强光下反应剧烈甚至爆炸，实验要在通风处进行并注意防护',
      note: '甲烷的氯代反应属于取代反应，产物是四种氯代甲烷与氯化氢的混合物；'
        + '注意与甲烷燃烧（氧化反应）区别。本规则要求先用工具栏的"光照"照射容器，'
        + '黑暗中甲烷与氯气几乎不反应'
    },
    {
      id: 'c2h4_br2',
      name: '乙烯与溴发生加成反应',
      type: '其他',
      level: 'senior',
      reactants: ['c2h4', 'br2'],
      ratio: { c2h4: 1, br2: 1 },
      products: [{ id: 'c2h4br2', n: 1 }],
      equation: 'C₂H₄ + Br₂ = C₂H₄Br₂',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eaf4ff', pptColor: null,
        message: '溴水的橙黄色迅速褪去，生成无色的 1,2-二溴乙烷油状液滴',
        heat: 120
      },
      note: '乙烯含有碳碳双键，能与溴发生加成反应；可用溴水区别甲烷和乙烯'
    },
    {
      id: 'c2h4_h2',
      name: '乙烯与氢气加成',
      type: '其他',
      level: 'senior',
      reactants: ['c2h4', 'h2'],
      ratio: { c2h4: 1, h2: 1 },
      products: [{ id: 'c2h6', n: 1 }],
      equation: 'C₂H₄ + H₂ = C₂H₆',
      conditions: { heat: true, ignite: false, catalyst: 'ni', minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '在镍催化并加热的条件下，乙烯与氢气加成生成乙烷，外观无明显变化',
        heat: 137
      },
      safety: '氢气易燃易爆，实验要注意通风并远离明火',
      note: '加成反应使不饱和键变成饱和键；工业上常用加氢的方法提高汽油的饱和度'
    },
    {
      id: 'c2h4_h2o',
      name: '乙烯水化制乙醇',
      type: '其他',
      level: 'senior',
      reactants: ['c2h4', 'h2o'],
      ratio: { c2h4: 1, h2o: 1 },
      products: [{ id: 'c2h5oh', n: 1 }],
      equation: 'C₂H₄ + H₂O = C₂H₅OH',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '在加热、加压和催化剂作用下乙烯与水加成生成乙醇，外观无明显变化',
        heat: 45
      },
      safety: '乙烯易燃易爆，实验装置要密封并远离明火',
      note: '工业上用乙烯水化法制乙醇（催化剂为磷酸），与粮食发酵法相比更经济'
    },
    {
      id: 'c2h4_poly',
      name: '乙烯加聚制聚乙烯',
      type: '其他',
      level: 'senior',
      reactants: ['c2h4'],
      ratio: { c2h4: 1 },
      products: [{ id: 'polyethylene', n: 1 }],
      equation: 'nC₂H₄ = (C₂H₄)n',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 200, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '在高温高压和催化剂作用下乙烯发生加聚反应，生成白色的聚乙烯固体',
        heat: 120
      },
      safety: '乙烯易燃易爆，实验要在通风处进行',
      note: '加聚反应：nCH₂=CH₂ → [CH₂—CH₂]ₙ，方程式中的 n 表示聚合度。'
        + '聚乙烯没有碳碳双键，不能使溴水褪色。'
        + 'minTemp 设为 200 是为了与"乙烯水化"区分（容器中有水时温度上限只有 100 ℃）'
    },
    {
      id: 'c2h2_br2',
      name: '乙炔与溴发生加成反应',
      type: '其他',
      level: 'senior',
      reactants: ['c2h2', 'br2'],
      ratio: { c2h2: 1, br2: 1 },
      products: [{ id: 'c2h2br2', n: 1 }],
      equation: 'C₂H₂ + Br₂ = C₂H₂Br₂',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eaf4ff', pptColor: null,
        message: '溴水的橙黄色褪去，生成无色的 1,2-二溴乙烯',
        heat: 150
      },
      note: '乙炔含有碳碳三键，与溴的加成可以是 1:1，也可以是 1:2（生成四溴乙烷）'
    },
    {
      id: 'c2h2_o2',
      name: '乙炔在氧气中燃烧',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['c2h2', 'o2'],
      ratio: { c2h2: 2, o2: 5 },
      products: [{ id: 'co2', n: 4 }, { id: 'h2o', n: 2 }],
      equation: '2C₂H₂ + 5O₂ = 4CO₂ + 2H₂O',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: null, pptColor: null,
        message: '乙炔在氧气中燃烧，发出明亮的火焰并产生大量黑烟，放出大量的热',
        heat: 1300
      },
      safety: '乙炔与空气的混合气遇明火会爆炸，点燃前必须验纯；氧炔焰温度很高，注意防护',
      note: '含碳量高的烃燃烧时火焰明亮并伴有黑烟；氧炔焰（约 3000 ℃）可用于焊接和切割金属'
    },
    {
      id: 'c6h6_br2',
      name: '苯与液溴发生取代反应',
      type: '其他',
      level: 'senior',
      reactants: ['c6h6', 'br2'],
      ratio: { c6h6: 1, br2: 1 },
      products: [{ id: 'c6h5br', n: 1 }, { id: 'hbr', n: 1 }],
      equation: 'C₆H₆ + Br₂ = C₆H₅Br + HBr',
      conditions: { heat: false, ignite: false, catalyst: 'fe', minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '在铁作催化剂的条件下反应，液体分层，导管口有白雾（HBr 遇水蒸气），生成密度比水大的油状溴苯',
        heat: 0
      },
      safety: '液溴有毒且腐蚀性强，苯有毒且易燃，实验必须在通风橱中进行',
      note: '苯与液溴在催化剂（实际起作用的是 FeBr₃）作用下发生取代反应，属于取代反应；'
        + '苯不能使溴水褪色，只能把溴从溴水中萃取出来'
    },
    {
      id: 'c6h6_hno3',
      name: '苯的硝化反应',
      type: '其他',
      level: 'senior',
      reactants: ['c6h6', 'hno3_conc'],
      ratio: { c6h6: 1, hno3_conc: 1 },
      products: [{ id: 'c6h5no2', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'C₆H₆ + HNO₃ = C₆H₅NO₂ + H₂O',
      conditions: { heat: true, ignite: false, catalyst: 'h2so4_conc', minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '在浓硫酸催化、55~60 ℃ 水浴加热下，苯与浓硝酸反应生成有苦杏仁气味的油状硝基苯',
        heat: 0
      },
      safety: '苯、浓硝酸、浓硫酸都有毒或有强腐蚀性，实验必须在通风橱中进行',
      note: '硝化反应属于取代反应；浓硫酸的作用是催化剂和吸水剂，'
        + '水浴加热便于把温度控制在 60 ℃ 以下'
    },
    {
      id: 'c6h6_h2',
      name: '苯与氢气加成',
      type: '其他',
      level: 'senior',
      reactants: ['c6h6', 'h2'],
      ratio: { c6h6: 1, h2: 3 },
      products: [{ id: 'c6h12', n: 1 }],
      equation: 'C₆H₆ + 3H₂ = C₆H₁₂',
      conditions: { heat: true, ignite: false, catalyst: 'ni', minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '在镍催化并加热的条件下，苯与氢气发生加成反应生成环己烷，外观无明显变化',
        heat: 200
      },
      safety: '氢气易燃易爆，苯有毒，实验要在通风处进行',
      note: '苯虽然不能使溴水褪色，但在催化剂作用下能与氢气加成，'
        + '说明苯环中的碳碳键是介于单键和双键之间的独特的键'
    },
    {
      id: 'c2h5oh_na',
      name: '乙醇与钠反应',
      type: '置换反应',
      level: 'senior',
      reactants: ['c2h5oh', 'na'],
      ratio: { c2h5oh: 2, na: 2 },
      products: [{ id: 'c2h5ona', n: 2 }, { id: 'h2', n: 1 }],
      equation: '2C₂H₅OH + 2Na = 2C₂H₅ONa + H₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'h2', toColor: null, pptColor: null,
        message: '钠沉到乙醇底部，缓慢放出气泡，钠逐渐溶解，反应比钠与水缓和得多',
        heat: 160
      },
      safety: '乙醇易燃，实验时要远离明火并注意通风',
      note: '乙醇与钠反应置换出羟基上的氢，反应比钠与水缓和，'
        + '说明乙醇羟基上的氢不如水中的氢活泼'
    },
    {
      id: 'c2h5oh_o2_cu',
      name: '乙醇的催化氧化',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['c2h5oh', 'o2'],
      ratio: { c2h5oh: 2, o2: 1 },
      products: [{ id: 'ch3cho', n: 2 }, { id: 'h2o', n: 2 }],
      equation: '2C₂H₅OH + O₂ = 2CH₃CHO + 2H₂O',
      conditions: { heat: true, ignite: false, catalyst: 'cu', minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#c1743a', pptColor: null,
        message: '加热的铜丝表面由黑变红，反复插入乙醇后可闻到刺激性气味（乙醛）',
        heat: 350
      },
      safety: '乙醛有毒，乙醇易燃，实验要在通风处进行，注意不要引燃乙醇蒸气',
      note: '乙醇的催化氧化：铜先被氧气氧化成 CuO，CuO 再把乙醇氧化成乙醛，铜作催化剂；'
        + '产物乙醛含有醛基，能发生银镜反应'
    },
    {
      id: 'c2h5oh_dehydrate',
      name: '乙醇消去制乙烯',
      type: '分解反应',
      level: 'senior',
      reactants: ['c2h5oh'],
      ratio: { c2h5oh: 1 },
      products: [{ id: 'c2h4', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'C₂H₅OH = C₂H₄↑ + H₂O',
      conditions: { heat: true, ignite: false, catalyst: 'h2so4_conc', minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'c2h4', toColor: null, pptColor: null,
        message: '加热时乙醇在浓硫酸作用下发生消去反应，生成的气体能使溴水或酸性高锰酸钾溶液褪色',
        heat: -45
      },
      safety: '浓硫酸有强腐蚀性，加热时要注意控制温度，防止液体暴沸和炭化',
      note: '实验室制乙烯：乙醇与浓硫酸按体积比约 1:3 混合，迅速加热到 170 ℃'
        + '（温度计水银球要浸在液面以下）；温度过低（140 ℃）时会生成乙醚'
    },
    {
      id: 'ch3cooh_na2co3',
      name: '乙酸与碳酸钠反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['ch3cooh', 'na2co3'],
      ratio: { ch3cooh: 2, na2co3: 1 },
      products: [{ id: 'ch3coona', n: 2 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: '2CH₃COOH + Na₂CO₃ = 2CH₃COONa + H₂O + CO₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'co2', toColor: null, pptColor: null,
        message: '产生大量气泡，气体能使澄清石灰水变浑浊，说明乙酸的酸性比碳酸强',
        heat: 30
      },
      note: '乙酸与碳酸钠反应放出二氧化碳，说明乙酸的酸性比碳酸强；可用于区别乙酸和乙醇'
    },
    {
      id: 'ch3cooh_naoh',
      name: '乙酸与氢氧化钠反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['ch3cooh', 'naoh'],
      ratio: { ch3cooh: 1, naoh: 1 },
      products: [{ id: 'ch3coona', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'CH₃COOH + NaOH = CH₃COONa + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '无明显现象，溶液温度升高；若预先滴加酚酞，红色逐渐褪去',
        heat: 57
      },
      note: '中和反应：乙酸是一元弱酸，与氢氧化钠按 1:1 反应'
    },
    {
      id: 'ch3cooh_ester',
      name: '乙酸与乙醇的酯化反应',
      type: '其他',
      level: 'senior',
      reactants: ['ch3cooh', 'c2h5oh'],
      ratio: { ch3cooh: 1, c2h5oh: 1 },
      products: [{ id: 'ch3cooc2h5', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'CH₃COOH + C₂H₅OH = CH₃COOC₂H₅ + H₂O',
      conditions: { heat: true, ignite: false, catalyst: 'h2so4_conc', minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '加热后液体分层并散发出果香味（生成乙酸乙酯），导管不能插入液面以下，以防倒吸',
        heat: 0
      },
      safety: '乙酸、乙醇易燃，浓硫酸有强腐蚀性，加热时要加碎瓷片防止暴沸',
      note: '酯化反应是可逆反应，特点是"酸脱羟基、醇脱氢"。浓硫酸的作用是催化剂和吸水剂；'
        + '产物用饱和碳酸钠溶液收集（溶解乙醇、中和乙酸、降低酯的溶解度）'
    },
    {
      id: 'ester_hydrolysis',
      name: '乙酸乙酯的水解',
      type: '其他',
      level: 'senior',
      reactants: ['ch3cooc2h5', 'h2o'],
      ratio: { ch3cooc2h5: 1, h2o: 1 },
      products: [{ id: 'ch3cooh', n: 1 }, { id: 'c2h5oh', n: 1 }],
      equation: 'CH₃COOC₂H₅ + H₂O = CH₃COOH + C₂H₅OH',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '加热后油状液滴逐渐消失，闻到乙酸和乙醇的气味；碱性条件下水解更完全',
        heat: -25
      },
      note: '酯的水解是酯化反应的逆反应：稀硫酸只起催化作用（可逆、不完全），'
        + '氢氧化钠溶液还能中和生成的乙酸，使水解趋于完全'
    },
    {
      id: 'glucose_cuoh2',
      name: '葡萄糖与新制氢氧化铜反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['c6h12o6', 'cuoh2'],
      ratio: { c6h12o6: 1, cuoh2: 2 },
      products: [{ id: 'c6h12o7', n: 1 }, { id: 'cu2o', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'C₆H₁₂O₆ + 2Cu(OH)₂ = C₆H₁₂O₇ + Cu₂O↓ + 2H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#a0522d',
        message: '加热后蓝色沉淀逐渐消失，出现砖红色沉淀（Cu₂O），说明葡萄糖中含有醛基',
        heat: 0
      },
      safety: '氢氧化钠溶液有强腐蚀性，加热试管时要不断振荡，管口不要对着人',
      note: '新制氢氧化铜必须现配（氢氧化钠要过量），检验醛基要在加热条件下进行；'
        + '配平要点：1 mol 葡萄糖提供 2 mol 醛基，故需要 2 mol Cu(OH)₂'
    },
    {
      id: 'glucose_tollens',
      name: '葡萄糖的银镜反应',
      type: '氧化还原反应',
      level: 'senior',
      reactants: ['c6h12o6', 'agnh32oh'],
      ratio: { c6h12o6: 1, agnh32oh: 2 },
      products: [{ id: 'c6h12o7', n: 1 }, { id: 'ag', n: 2 }, { id: 'nh3', n: 4 }, { id: 'h2o', n: 1 }],
      equation: 'C₆H₁₂O₆ + 2Ag(NH₃)₂OH = C₆H₁₂O₇ + 2Ag↓ + 4NH₃↑ + H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#d8dce2', pptColor: null,
        message: '试管内壁附着一层光亮如镜的银（银镜反应），说明葡萄糖具有还原性',
        heat: 0
      },
      safety: '银氨溶液必须现配现用，久置会生成易爆的雷银；实验后的试管要用稀硝酸洗涤',
      note: '银镜反应用于检验醛基：1 mol 葡萄糖能还原出 2 mol 银'
    },
    {
      id: 'starch_hydrolysis',
      name: '淀粉的水解',
      type: '分解反应',
      level: 'senior',
      reactants: ['starch', 'h2o'],
      ratio: { starch: 1, h2o: 1 },
      products: [{ id: 'c6h12o6', n: 1 }],
      equation: '(C₆H₁₀O₅)n + nH₂O = nC₆H₁₂O₆',
      conditions: { heat: true, ignite: false, catalyst: 'h2so4', minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '在稀硫酸催化并加热的条件下淀粉逐渐水解，最终产物是葡萄糖，水解液能发生银镜反应',
        heat: 0
      },
      safety: '稀硫酸有腐蚀性，实验后要小心处理废液',
      note: '淀粉水解是逐步进行的：淀粉 → 糊精 → 麦芽糖 → 葡萄糖。'
        + '检验水解产物前必须先加碱中和硫酸，否则银镜反应无法进行'
    },
    {
      id: 'starch_i2',
      name: '淀粉遇碘变蓝',
      type: '其他',
      level: 'senior',
      reactants: ['starch', 'i2'],
      ratio: { starch: 1, i2: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#2b2b8a', pptColor: null,
        message: '淀粉溶液遇碘单质变成蓝色，可用于检验碘或淀粉',
        heat: 0
      },
      priority: 30,
      indicator: true,
      note: '碘遇淀粉变蓝是碘单质的特征反应（碘离子不行）；'
        + '该显色反应是碘分子进入淀粉螺旋结构形成包合物，属于物理变化'
    },
    {
      id: 'oil_saponify',
      name: '油脂的皂化反应',
      type: '其他',
      level: 'senior',
      reactants: ['oil', 'naoh'],
      ratio: { oil: 1, naoh: 3 },
      products: [{ id: 'c3h8o3', n: 1 }, { id: 'c17h35coona', n: 3 }],
      equation: '(C₁₇H₃₅COO)₃C₃H₅ + 3NaOH = C₃H₈O₃ + 3C₁₇H₃₅COONa',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '加热搅拌后油层逐渐消失，溶液变黏稠（生成肥皂和甘油），加入食盐后肥皂析出（盐析）',
        heat: 0
      },
      safety: '氢氧化钠溶液有强腐蚀性，加热时要小心操作，防止液体溅出',
      note: '皂化反应是油脂在碱性条件下的水解反应，产物是高级脂肪酸钠（肥皂的主要成分）和甘油；'
        + '配平要点：1 mol 油脂含 3 mol 酯基，需要 3 mol NaOH'
    },
    {
      id: 'protein_denature',
      name: '蛋白质的变性',
      type: '其他',
      level: 'senior',
      reactants: ['protein'],
      ratio: { protein: 1 },
      products: [{ id: 'protein_denatured', n: 1 }],
      equation: '—',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '加热后蛋白质溶液变浑浊并析出白色沉淀，蛋白质失去生理活性（变性）',
        heat: 0
      },
      indicator: true,
      note: '加热、强酸、强碱、重金属盐、甲醛、乙醇等都能使蛋白质变性；变性是不可逆的，'
        + '所以能用高温或酒精消毒杀菌。蛋白质变性没有化学方程式，'
        + '因此用 indicator:true 让引擎只提示现象、不按化学计量消耗'
    },

    /* =======================================================================
     * 九、电化学
     * ===================================================================== */
    {
      id: 'electrolysis_cucl2',
      name: '电解氯化铜溶液',
      type: '分解反应',
      level: 'senior',
      reactants: ['cucl2'],
      ratio: { cucl2: 1 },
      products: [{ id: 'cu', n: 1 }, { id: 'cl2', n: 1 }],
      equation: 'CuCl₂ = Cu + Cl₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true, electricity: true },
      phenomena: {
        kind: 'bubble', gas: 'cl2', toColor: null, pptColor: null,
        message: '阴极上析出紫红色的铜，阳极上有气泡放出，气体呈黄绿色并有刺激性气味（可用湿润的淀粉碘化钾试纸检验）',
        heat: -220
      },
      safety: '电解产生的氯气有毒，装置要密封，尾气用碱液吸收',
      note: '电解氯化铜溶液：阳极 2Cl⁻ - 2e⁻ = Cl₂↑，阴极 Cu²⁺ + 2e⁻ = Cu，'
        + '总反应 CuCl₂ = Cu + Cl₂↑（电解）'
    },
    {
      id: 'electrolysis_brine',
      name: '电解饱和食盐水',
      type: '分解反应',
      level: 'senior',
      reactants: ['nacl', 'h2o'],
      ratio: { nacl: 2, h2o: 2 },
      products: [{ id: 'naoh', n: 2 }, { id: 'h2', n: 1 }, { id: 'cl2', n: 1 }],
      equation: '2NaCl + 2H₂O = 2NaOH + H₂↑ + Cl₂↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true, electricity: true },
      phenomena: {
        kind: 'bubble', gas: 'cl2', toColor: null, pptColor: null,
        message: '两极都有气泡产生：阳极放出的黄绿色气体能使湿润的淀粉碘化钾试纸变蓝，阴极放出的气体可被点燃；阴极区溶液显碱性',
        heat: -470
      },
      priority: 20,
      safety: '氯气有毒，电解装置要密封，尾气用碱液吸收；氢气与氯气混合遇强光会爆炸',
      note: '电解饱和食盐水是氯碱工业的核心反应：阳极 2Cl⁻ - 2e⁻ = Cl₂↑，'
        + '阴极 2H₂O + 2e⁻ = H₂↑ + 2OH⁻，'
        + '总反应 2NaCl + 2H₂O = 2NaOH + H₂↑ + Cl₂↑'
    },

    /* =======================================================================
     * 十、离子反应与其他
     * ===================================================================== */
    {
      id: 'nahco3_naoh',
      name: '碳酸氢钠与氢氧化钠反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['nahco3', 'naoh'],
      ratio: { nahco3: 1, naoh: 1 },
      products: [{ id: 'na2co3', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'NaHCO₃ + NaOH = Na₂CO₃ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '无明显现象；若预先滴加酚酞，红色不会褪去（溶液仍然显碱性）',
        heat: 40
      },
      note: '离子方程式：HCO₃⁻ + OH⁻ = CO₃²⁻ + H₂O；碳酸氢钠溶液中的 HCO₃⁻ 能与碱反应'
    },
    {
      id: 'nahco3_caoh2',
      name: '碳酸氢钠与氢氧化钙反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['nahco3', 'caoh2'],
      ratio: { nahco3: 2, caoh2: 1 },
      products: [{ id: 'caco3', n: 1 }, { id: 'na2co3', n: 1 }, { id: 'h2o', n: 2 }],
      equation: '2NaHCO₃ + Ca(OH)₂ = CaCO₃↓ + Na₂CO₃ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#eef1f5',
        message: '产生白色沉淀（碳酸钙），溶液仍然澄清，没有气泡产生',
        heat: 0
      },
      note: '碳酸氢钠过量时，HCO₃⁻ 中的碳全部转化成 CaCO₃ 沉淀；'
        + '若氢氧化钙过量，则离子方程式为 HCO₃⁻ + Ca²⁺ + OH⁻ = CaCO₃↓ + H₂O'
    },
    {
      id: 'cahco32_heat',
      name: '碳酸氢钙受热分解',
      type: '分解反应',
      level: 'senior',
      reactants: ['cahco32'],
      ratio: { cahco32: 1 },
      products: [{ id: 'caco3', n: 1 }, { id: 'h2o', n: 1 }, { id: 'co2', n: 1 }],
      equation: 'Ca(HCO₃)₂ = CaCO₃↓ + H₂O + CO₂↑',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#eef1f5',
        message: '加热后溶液变浑浊，出现白色沉淀（碳酸钙），同时放出能使澄清石灰水变浑浊的气体',
        heat: -60
      },
      note: '暂时硬水加热时碳酸氢钙分解生成水垢（CaCO₃），这是水壶里水垢的来源；'
        + '也是溶洞中钟乳石、石笋形成过程中的一步'
    },
    {
      id: 'fecl3_nahco3',
      name: '氯化铁与碳酸氢钠溶液反应',
      type: '复分解反应',
      level: 'senior',
      reactants: ['fecl3', 'nahco3'],
      ratio: { fecl3: 1, nahco3: 3 },
      products: [{ id: 'feoh3', n: 1 }, { id: 'co2', n: 3 }, { id: 'nacl', n: 3 }],
      equation: 'FeCl₃ + 3NaHCO₃ = Fe(OH)₃↓ + 3CO₂↑ + 3NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#a0522d',
        message: '立即产生红褐色沉淀，同时放出大量气泡（二氧化碳）',
        heat: 0
      },
      priority: 20,
      note: 'Fe³⁺ 与 HCO₃⁻ 发生双水解反应，相互促进使反应趋于完全：'
        + '既生成 Fe(OH)₃ 沉淀又放出 CO₂；泡沫灭火器就是利用 Al³⁺ 与 HCO₃⁻ 的双水解'
    },

    /* =======================================================================
     * 十一、指示剂显色（indicator:true，引擎不消耗任何反应物）
     * ===================================================================== */
    {
      id: 'methylOrange_hcl',
      name: '甲基橙遇稀盐酸变红',
      type: '其他',
      level: 'senior',
      reactants: ['methylOrange', 'hcl'],
      ratio: { methylOrange: 1, hcl: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#e0455a', pptColor: null,
        message: '甲基橙由橙色变成红色，说明溶液显酸性',
        heat: 0
      },
      indicator: true,
      note: '甲基橙的变色范围是 pH 3.1（红）~ 4.4（黄），是酸碱中和滴定常用的指示剂'
    },
    {
      id: 'methylOrange_naoh',
      name: '甲基橙遇氢氧化钠溶液变黄',
      type: '其他',
      level: 'senior',
      reactants: ['methylOrange', 'naoh'],
      ratio: { methylOrange: 1, naoh: 1 },
      products: [],
      equation: '—',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#e8c33d', pptColor: null,
        message: '甲基橙由橙色变成黄色，说明溶液显碱性',
        heat: 0
      },
      indicator: true,
      note: '甲基橙遇碱变黄、遇酸变红，可用于判断溶液的酸碱性'
    }
  ];

  /* =========================================================================
   * 高中新增的气体 / 溶液检验方法
   * ======================================================================= */
  var TESTS = [
    {
      id: 'starchIodine',
      name: '淀粉溶液（检验碘）',
      applies: 'both',
      tip: '向待测液中滴加几滴淀粉溶液，观察是否变蓝；也可把气体通到淀粉碘化钾试纸上',
      rules: [
        {
          match: ['i2'],
          result: '溶液变蓝',
          message: '滴加淀粉溶液后变蓝，说明待测液中含有碘单质（碘遇淀粉显蓝色）',
          pass: true
        },
        {
          match: ['cl2'], minFraction: 0.05,
          result: '试纸变蓝',
          message: '湿润的淀粉碘化钾试纸变蓝，说明该气体是氯气（Cl₂ 把 I⁻ 氧化成 I₂，碘遇淀粉变蓝）',
          pass: true
        }
      ],
      fallback: {
        result: '不变蓝',
        message: '淀粉溶液没有变蓝，说明待测物中不含碘单质',
        pass: false
      }
    },
    {
      id: 'kiStarchPaper',
      name: '湿润的淀粉碘化钾试纸',
      applies: 'gas',
      tip: '把湿润的淀粉碘化钾试纸靠近集气瓶口，观察试纸是否变蓝',
      rules: [
        {
          match: ['cl2'], minFraction: 0.05,
          result: '试纸变蓝',
          message: '湿润的淀粉碘化钾试纸变蓝，说明该气体氧化性强，是氯气',
          pass: true
        },
        {
          match: ['br2'], minFraction: 0.05,
          result: '试纸变蓝',
          message: '湿润的淀粉碘化钾试纸变蓝，说明该气体能把 I⁻ 氧化成 I₂，可能是溴蒸气',
          pass: true
        },
        {
          match: ['no2'], minFraction: 0.05,
          result: '试纸变蓝',
          message: '湿润的淀粉碘化钾试纸变蓝，说明该气体具有氧化性（二氧化氮也能把 I⁻ 氧化）',
          pass: true
        }
      ],
      fallback: {
        result: '试纸不变蓝',
        message: '试纸不变蓝，说明该气体不能把 I⁻ 氧化成碘单质',
        pass: false
      }
    }
  ];

  /* =========================================================================
   * 高中新增水溶液的近似 pH（教学用近似值）
   * 注意：registerPHRules 会自动跳过与初中库重名的 id，不会覆盖初中数据
   * ======================================================================= */
  var PH_RULES = [
    /* 酸 */
    { id: 'ch3cooh', ph: 3, note: '乙酸（醋酸），一元弱酸，酸性比碳酸强' },
    { id: 'hclo', ph: 4, note: '次氯酸，很弱的酸（酸性比碳酸还弱）' },
    { id: 'h2s', ph: 4, note: '氢硫酸（硫化氢的水溶液），二元弱酸' },
    { id: 'h2so3', ph: 3, note: '亚硫酸，中强酸，具有还原性' },
    { id: 'h2so4_conc', ph: 1, note: '浓硫酸，强酸，具有强腐蚀性和强氧化性' },
    { id: 'hno3_conc', ph: 1, note: '浓硝酸，强酸，具有强氧化性' },
    { id: 'hf', ph: 2, note: '氢氟酸，弱酸，能腐蚀玻璃和皮肤' },
    { id: 'c6h12o7', ph: 3, note: '葡萄糖酸，弱酸' },
    { id: 'k2cr2o7', ph: 4, note: '重铬酸钾溶液，酸性条件下显强氧化性' },

    /* 碱 */
    { id: 'nh3', ph: 11, note: '氨气的水溶液（氨水），弱碱' },
    { id: 'nh3h2o', ph: 11, note: '氨水，弱碱，能使酚酞变红' },
    { id: 'naclo', ph: 10, note: '次氯酸钠溶液，因水解显碱性' },
    { id: 'naalo2', ph: 11, note: '偏铝酸钠溶液，强碱弱酸盐，显碱性' },
    { id: 'na2sio3', ph: 12, note: '硅酸钠溶液（水玻璃），显碱性' },
    { id: 'ca_clo2', ph: 10, note: '漂白粉的水溶液，因水解显碱性' },
    { id: 'na2so3', ph: 9, note: '亚硫酸钠溶液，因水解显碱性' },
    { id: 'nano2', ph: 8.5, note: '亚硝酸钠溶液，因水解显弱碱性' },
    { id: 'ch3coona', ph: 9, note: '乙酸钠溶液，强碱弱酸盐，显碱性' },
    { id: 'c17h35coona', ph: 9, note: '硬脂酸钠（肥皂）溶液，显碱性' },
    { id: 'c2h5ona', ph: 12, note: '乙醇钠遇水强烈水解生成氢氧化钠，显强碱性' },
    { id: 'cahco32', ph: 8, note: '碳酸氢钙溶液，因水解显弱碱性' },

    /* 盐与中性溶液 */
    { id: 'nh4cl', ph: 5, note: '氯化铵溶液，强酸弱碱盐，因铵根水解显酸性' },
    { id: 'nh42so4', ph: 5, note: '硫酸铵溶液，因铵根水解显弱酸性' },
    { id: 'nh4no3', ph: 5, note: '硝酸铵溶液，因铵根水解显弱酸性' },
    { id: 'ki', ph: 7, note: '碘化钾溶液，中性' },
    { id: 'kscn', ph: 7, note: '硫氰化钾溶液，中性' },
    { id: 'kmno4', ph: 7, note: '高锰酸钾溶液，接近中性（酸性条件下氧化性更强）' },
    { id: 'c6h12o6', ph: 7, note: '葡萄糖溶液，中性' },
    { id: 'starch', ph: 7, note: '淀粉溶液，接近中性' },
    { id: 'protein', ph: 7, note: '蛋白质溶液，接近中性（氨基酸的两性使其略显缓冲作用）' }
  ];

  CHEM.registerReactions(REACTIONS);
  CHEM.registerTests(TESTS);
  CHEM.registerPHRules(PH_RULES);
})(typeof window !== 'undefined' ? window : globalThis);
