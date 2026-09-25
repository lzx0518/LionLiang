/* =============================================================================
 * 补充反应规则
 * -----------------------------------------------------------------------------
 * 这里放的是前两个库（初中 reactions.js / 高中 reactions-senior.js）之外的补充内容，
 * 主要是**实验室制法**和**有机物的检验**这些"做实验一定会用到"的反应。
 * 全部通过 test/simulate.mjs 里的元素守恒校验。
 *
 * ⚠ 关于 phenomena.heat：这个字段是历史遗留，**界面上一律不使用它**。
 *   反应详情里的 ΔH / ΔG / K 全部由 js/data/thermo.js 的标准热力学数据实时计算，
 *   原因是最初三个库里的 heat 字段符号约定并不统一（有的"放热为正"、有的直接用 ΔH）。
 *   这里保留它只是为了不破坏数据结构，新加规则时不必纠结它的数值。
 * ========================================================================== */
(function (root) {
  'use strict';
  var CHEM = (root.CHEM = root.CHEM || {});
  var C = CHEM.COLORS || {};

  /* ---------- 补充物质 ---------- */
  CHEM.registerSubstances([
    {
      id: 'hcl_conc', name: '浓盐酸', formula: 'HCl', phase: 'solution',
      color: '#eef6ff', base: 'hcl_conc', soluble: true, pickable: true,
      shelf: 'liquid', hazard: ['腐蚀性', '刺激性'], mm: 36.5, level: 'senior',
      note: '质量分数约 37%、浓度约 12 mol/L 的盐酸，有挥发性，瓶口常冒白雾。' +
        '实验室用它和二氧化锰加热制取氯气。'
    },
    {
      id: 'mncl2', name: '氯化锰', formula: 'MnCl2', phase: 'solution',
      color: '#f0d8dc', base: 'mncl2', soluble: true, pickable: false,
      mm: 126, note: '淡粉色的溶液，二氧化锰与浓盐酸反应的产物。'
    },
    {
      id: 'nabr', name: '溴化钠溶液', formula: 'NaBr', phase: 'solution',
      color: '#eef6ff', base: 'nabr', soluble: true, pickable: true,
      shelf: 'liquid', mm: 103, level: 'senior',
      note: '无色溶液。通入氯气后溶液变橙黄色，说明氯的非金属性比溴强。'
    },
    {
      id: 'na2s', name: '硫化钠', formula: 'Na2S', phase: 'solution',
      color: '#eef6ff', base: 'na2s', soluble: true, pickable: false,
      hazard: ['有毒'], mm: 78, note: '无色溶液，有臭味，能被酸变成硫化氢。'
    },
    {
      id: 'ch3coonh4', name: '醋酸铵', formula: 'CH3COONH4', phase: 'solution',
      color: '#eef6ff', base: 'ch3coonh4', soluble: true, pickable: false,
      mm: 77, note: '无色溶液。乙醛发生银镜反应后的产物。'
    },
    {
      id: 'sucrose', name: '蔗糖', formula: 'C12H22O11', phase: 'solid',
      color: '#f4f6f9', dissolveColor: '#eef6ff', base: 'sucrose',
      soluble: true, pickable: true, shelf: 'organic', mm: 342, level: 'senior',
      note: '白色晶体，是非还原性糖，本身不发生银镜反应；' +
        '在稀硫酸催化下水解生成葡萄糖和果糖后才有还原性。'
    },
    {
      id: 'c2h5cl', name: '氯乙烷', formula: 'C2H5Cl', phase: 'liquid',
      color: '#eef3f7', base: 'c2h5cl', soluble: false, pickable: false,
      mm: 64.5, note: '无色液体，乙烯与氯化氢加成的产物。'
    },
    {
      id: 'c6h5so3h', name: '苯磺酸', formula: 'C6H5SO3H', phase: 'solution',
      color: '#eef3f7', base: 'c6h5so3h', soluble: true, pickable: false,
      mm: 158, note: '无色溶液，苯与浓硫酸发生磺化反应的产物，酸性比硫酸强。'
    },
    {
      id: 'mg3n2', name: '氮化镁', formula: 'Mg3N2', phase: 'solid',
      color: '#cbd6a0', precipColor: '#cbd6a0', base: 'mg3n2',
      soluble: false, pickable: false, mm: 100,
      note: '淡黄绿色固体。镁在空气中燃烧时除了生成氧化镁，还会与氮气反应生成它。'
    },
    /* 硫化亚铁在初中库里是"生成物"，但高中做"制硫化氢"实验需要直接从药品架取用 */
    {
      id: 'fes', pickable: true, shelf: 'solid', level: 'senior',
      note: '黑色块状固体。与稀硫酸反应可以制取硫化氢气体。'
    }
  ]);

  /* ---------- 补充反应 ---------- */
  var RULES = [

    /* =================== 气体的实验室制法 =================== */
    {
      id: 'mno2_hcl_conc', name: '实验室制氯气', type: '氧化还原反应', level: 'senior',
      reactants: ['mno2', 'hcl_conc'], ratio: { mno2: 1, hcl_conc: 4 },
      products: [{ id: 'mncl2', n: 1 }, { id: 'cl2', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'MnO₂ + 4HCl(浓) = MnCl₂ + Cl₂↑ + 2H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'cl2', toColor: null, pptColor: null,
        message: '黑色粉末逐渐溶解，产生黄绿色、有刺激性气味的气体，湿润的淀粉碘化钾试纸变蓝',
        heat: -147
      },
      safety: '氯气有毒，实验必须在通风橱中进行，多余的氯气要用氢氧化钠溶液吸收',
      note: '必须用浓盐酸并加热。稀盐酸与二氧化锰不反应，这一点常考。'
    },
    {
      id: 'nh4cl_caoh2', name: '实验室制氨气', type: '复分解反应', level: 'senior',
      reactants: ['nh4cl', 'caoh2'], ratio: { nh4cl: 2, caoh2: 1 },
      products: [{ id: 'cacl2', n: 1 }, { id: 'nh3', n: 2 }, { id: 'h2o', n: 2 }],
      equation: '2NH₄Cl + Ca(OH)₂ = CaCl₂ + 2NH₃↑ + 2H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'bubble', gas: 'nh3', toColor: null, pptColor: null,
        message: '混合固体受热后产生有刺激性气味的气体，能使湿润的红色石蕊试纸变蓝',
        heat: 90
      },
      safety: '氨气有刺激性气味，收集时试管口要放一团棉花，防止气体对流',
      note: '不能用硝酸铵或碳酸氢铵代替氯化铵（前者受热易爆炸，后者还会产生 CO₂）。'
    },
    {
      id: 'na2so3_h2so4', name: '实验室制二氧化硫', type: '复分解反应', level: 'senior',
      reactants: ['na2so3', 'h2so4'], ratio: { na2so3: 1, h2so4: 1 },
      products: [{ id: 'na2so4', n: 1 }, { id: 'so2', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'Na₂SO₃ + H₂SO₄ = Na₂SO₄ + SO₂↑ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'so2', toColor: null, pptColor: null,
        message: '固体逐渐溶解，产生有刺激性气味的气体，能使品红溶液褪色',
        heat: -40
      },
      safety: '二氧化硫有毒，实验应在通风处进行',
      note: '用较浓的硫酸，而不用稀硫酸，是为了减小 SO₂ 的溶解度、便于逸出。'
    },
    {
      id: 'fes_h2so4', name: '实验室制硫化氢', type: '复分解反应', level: 'senior',
      reactants: ['fes', 'h2so4'], ratio: { fes: 1, h2so4: 1 },
      products: [{ id: 'feso4', n: 1 }, { id: 'h2s', n: 1 }],
      equation: 'FeS + H₂SO₄ = FeSO₄ + H₂S↑',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'h2s', toColor: null, pptColor: null,
        message: '黑色固体表面产生大量气泡，逸出有臭鸡蛋气味的气体',
        heat: -30
      },
      safety: '硫化氢剧毒，必须在通风橱中操作'
    },

    /* =================== 有机物的检验与转化 =================== */
    {
      id: 'ch3cho_tollens', name: '乙醛的银镜反应', type: '氧化还原反应', level: 'senior',
      reactants: ['ch3cho', 'agnh32oh'], ratio: { ch3cho: 1, agnh32oh: 2 },
      products: [{ id: 'ch3coonh4', n: 1 }, { id: 'ag', n: 2 }, { id: 'nh3', n: 3 }, { id: 'h2o', n: 1 }],
      equation: 'CH₃CHO + 2Ag(NH₃)₂OH = CH₃COONH₄ + 2Ag↓ + 3NH₃ + H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#d8dce2', pptColor: '#d8dce2',
        message: '试管内壁附着一层光亮如镜的银，说明乙醛具有还原性',
        heat: -30
      },
      note: '试管必须洁净，否则只能得到黑色疏松的银粉而不是银镜。此反应可用于检验醛基。'
    },
    {
      id: 'ch3cho_cuoh2', name: '乙醛与新制氢氧化铜反应', type: '氧化还原反应', level: 'senior',
      reactants: ['ch3cho', 'cuoh2'], ratio: { ch3cho: 1, cuoh2: 2 },
      products: [{ id: 'ch3cooh', n: 1 }, { id: 'cu2o', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'CH₃CHO + 2Cu(OH)₂ = CH₃COOH + Cu₂O↓ + 2H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#b5502a',
        message: '蓝色絮状沉淀转变为砖红色的氧化亚铜沉淀',
        heat: -50
      },
      note: '氢氧化铜必须是新配制的，加热到沸腾才出现砖红色沉淀。'
    },
    {
      id: 'sucrose_hydrolysis', name: '蔗糖的水解', type: '其他', level: 'senior',
      reactants: ['sucrose', 'h2o'], ratio: { sucrose: 1, h2o: 1 },
      products: [{ id: 'c6h12o6', n: 2 }],
      equation: 'C₁₂H₂₂O₁₁ + H₂O = 2C₆H₁₂O₆',
      conditions: { heat: true, ignite: false, catalyst: 'h2so4', minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '看不到明显现象，但水解后的溶液能发生银镜反应，说明生成了葡萄糖',
        heat: -10
      },
      note: '蔗糖本身没有还原性，水解产物葡萄糖才有。检验前要先加碱中和硫酸。'
    },
    {
      id: 'c2h4_hcl', name: '乙烯与氯化氢加成', type: '其他', level: 'senior',
      reactants: ['c2h4', 'hcl_g'], ratio: { c2h4: 1, hcl_g: 1 },
      products: [{ id: 'c2h5cl', n: 1 }],
      equation: 'C₂H₄ + HCl = C₂H₅Cl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '气体的黄绿色（或刺激性气味）消失，生成无色液体',
        heat: -110
      },
      note: '加成反应：CH₂=CH₂ 中的碳碳双键打开，氢原子和氯原子分别加到两个碳上，生成 CH₃CH₂Cl。'
    },
    {
      id: 'c2h2_h2o', name: '乙炔水化制乙醛', type: '其他', level: 'senior',
      reactants: ['c2h2', 'h2o'], ratio: { c2h2: 1, h2o: 1 },
      products: [{ id: 'ch3cho', n: 1 }],
      equation: 'C₂H₂ + H₂O = CH₃CHO',
      conditions: { heat: true, ignite: false, catalyst: 'h2so4', minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '生成有刺激性气味的液体（乙醛）',
        heat: -140
      },
      note: '加成反应：CH≡CH 中的碳碳三键打开，与水加成生成 CH₃CHO。'
    },
    {
      id: 'c6h6_so3h', name: '苯的磺化反应', type: '其他', level: 'senior',
      reactants: ['c6h6', 'h2so4_conc'], ratio: { c6h6: 1, h2so4_conc: 1 },
      products: [{ id: 'c6h5so3h', n: 1 }, { id: 'h2o', n: 1 }],
      equation: 'C₆H₆ + H₂SO₄(浓) = C₆H₅SO₃H + H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '苯层逐渐消失，生成能溶于水的苯磺酸',
        heat: -50
      },
      note: '磺化反应和硝化反应一样，都是苯环上的取代反应，需要 50~60 ℃ 水浴加热。'
    },

    /* =================== 元素化合物的补充 =================== */
    {
      id: 'caco3_co2_h2o', name: '碳酸钙与过量二氧化碳反应', type: '化合反应', level: 'senior',
      reactants: ['caco3', 'co2', 'h2o'], ratio: { caco3: 1, co2: 1, h2o: 1 },
      products: [{ id: 'cahco32', n: 1 }],
      equation: 'CaCO₃ + CO₂ + H₂O = Ca(HCO₃)₂',
      conditions: {
        heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true,
        /* 有强酸在的时候，碳酸钙会直接被酸溶解，不会走这条"被过量 CO₂ 转化"的路 */
        exclude: ['hcl', 'hcl_conc', 'h2so4', 'h2so4_conc', 'hno3', 'hno3_conc']
      },
      phenomena: {
        kind: 'dissolve', gas: null, toColor: null, pptColor: null,
        message: '白色沉淀逐渐溶解，浑浊的液体重新变澄清',
        heat: -30
      },
      note: '这就是"溶洞的形成"和"暂时硬水"的原理，也是检验 CO₂ 时不能长时间通气的道理。'
    },
    {
      id: 'aloh3_heat', name: '氢氧化铝受热分解', type: '分解反应', level: 'senior',
      reactants: ['aloh3'], ratio: { aloh3: 2 },
      products: [{ id: 'al2o3', n: 1 }, { id: 'h2o', n: 3 }],
      equation: '2Al(OH)₃ = Al₂O₃ + 3H₂O',
      conditions: { heat: true, ignite: false, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'none', gas: null, toColor: null, pptColor: null,
        message: '白色固体逐渐变成白色粉末，管壁上有水珠',
        heat: 170
      },
      note: '氢氧化铝受热分解吸热，所以可以做阻燃剂。'
    },
    {
      id: 'al_cuo', name: '铝与氧化铜反应（铝热反应）', type: '置换反应', level: 'senior',
      reactants: ['al', 'cuo'], ratio: { al: 2, cuo: 3 },
      products: [{ id: 'al2o3', n: 1 }, { id: 'cu', n: 3 }],
      equation: '2Al + 3CuO = Al₂O₃ + 3Cu',
      conditions: { heat: true, ignite: true, catalyst: null, minTemp: 600, needsWater: false },
      phenomena: {
        kind: 'glow', gas: null, toColor: '#fff0c8', pptColor: '#c1743a',
        message: '混合物剧烈反应，发出耀眼的白光并放出大量热，生成红色的铜',
        heat: -1210
      },
      safety: '铝热反应温度极高，实验时要在下方垫细沙，人不要直视',
      note: '铝热反应可以冶炼高熔点金属，工业上用于焊接钢轨。'
    },
    {
      id: 'na2o2_hcl', name: '过氧化钠与稀盐酸反应', type: '复分解反应', level: 'senior',
      reactants: ['na2o2', 'hcl'], ratio: { na2o2: 2, hcl: 4 },
      products: [{ id: 'nacl', n: 4 }, { id: 'o2', n: 1 }, { id: 'h2o', n: 2 }],
      equation: '2Na₂O₂ + 4HCl = 4NaCl + O₂↑ + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'bubble', gas: 'o2', toColor: null, pptColor: null,
        message: '淡黄色固体溶解，产生大量气泡，带火星的木条能复燃',
        heat: -250
      },
      note: '过氧化钠既是氧化剂又是还原剂，氧气全部来自过氧化钠中的氧。'
    },
    {
      id: 'naoh_so3', name: '三氧化硫与氢氧化钠反应', type: '复分解反应', level: 'senior',
      reactants: ['naoh', 'so3'], ratio: { naoh: 2, so3: 1 },
      products: [{ id: 'na2so4', n: 1 }, { id: 'h2o', n: 1 }],
      equation: '2NaOH + SO₃ = Na₂SO₄ + H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: { kind: 'none', gas: null, toColor: null, pptColor: null, message: '无明显现象，溶液温度升高', heat: -170 }
    },
    {
      id: 'h2o2_so2', name: '过氧化氢氧化二氧化硫', type: '氧化还原反应', level: 'senior',
      reactants: ['h2o2', 'so2'], ratio: { h2o2: 1, so2: 1 },
      products: [{ id: 'h2so4', n: 1 }],
      equation: 'H₂O₂ + SO₂ = H₂SO₄',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: { kind: 'none', gas: null, toColor: null, pptColor: null, message: '刺激性气味消失，溶液的酸性明显增强', heat: -240 },
      note: '过氧化氢作氧化剂时还原产物是水，不会引入新杂质，这是它被称为"绿色氧化剂"的原因。'
    },
    {
      id: 'so2_br2_h2o', name: '二氧化硫使溴水褪色', type: '氧化还原反应', level: 'senior',
      reactants: ['so2', 'br2', 'h2o'], ratio: { so2: 1, br2: 1, h2o: 2 },
      products: [{ id: 'h2so4', n: 1 }, { id: 'hbr', n: 2 }],
      equation: 'SO₂ + Br₂ + 2H₂O = H₂SO₄ + 2HBr',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eef6ff', pptColor: null,
        message: '橙黄色的溴水褪色，说明二氧化硫有还原性',
        heat: -160
      },
      note: 'SO₂ 使品红褪色是"漂白"，使溴水褪色是"还原"，两者原理不同，常放在一起考。'
    },
    {
      id: 'cl2_nabr', name: '氯气与溴化钠溶液反应', type: '置换反应', level: 'senior',
      reactants: ['cl2', 'nabr'], ratio: { cl2: 1, nabr: 2 },
      products: [{ id: 'nacl', n: 2 }, { id: 'br2', n: 1 }],
      equation: 'Cl₂ + 2NaBr = 2NaCl + Br₂',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#e08a3c', pptColor: null,
        message: '无色溶液变成橙黄色，说明氯的非金属性比溴强',
        heat: -100
      },
      note: '氧化性 Cl₂ > Br₂ > I₂，所以氯气能把溴、碘从它们的盐溶液中置换出来。'
    },
    {
      id: 'h2s_naoh', name: '硫化氢被氢氧化钠溶液吸收', type: '复分解反应', level: 'senior',
      reactants: ['h2s', 'naoh'], ratio: { h2s: 1, naoh: 2 },
      products: [{ id: 'na2s', n: 1 }, { id: 'h2o', n: 2 }],
      equation: 'H₂S + 2NaOH = Na₂S + 2H₂O',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: { kind: 'none', gas: null, toColor: null, pptColor: null, message: '臭鸡蛋气味消失', heat: -80 },
      note: '氢氧化钠溶液是处理硫化氢尾气的常用试剂。'
    },
    {
      id: 'nacl_nh3_co2_h2o', name: '侯氏制碱法（生成碳酸氢钠）', type: '复分解反应', level: 'senior',
      reactants: ['nacl', 'nh3', 'co2', 'h2o'], ratio: { nacl: 1, nh3: 1, co2: 1, h2o: 1 },
      products: [{ id: 'nahco3', n: 1 }, { id: 'nh4cl', n: 1 }],
      equation: 'NaCl + NH₃ + CO₂ + H₂O = NaHCO₃↓ + NH₄Cl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#eef1f5',
        message: '溶液中析出白色固体（碳酸氢钠的溶解度较小）',
        heat: -60
      },
      priority: 20,
      note: '先通氨气再通二氧化碳：氨气极易溶于水，先使溶液显碱性才能吸收更多 CO₂。'
    },
    {
      id: 'mg_n2', name: '镁与氮气反应', type: '化合反应', level: 'senior',
      reactants: ['mg', 'n2'], ratio: { mg: 3, n2: 1 },
      products: [{ id: 'mg3n2', n: 1 }],
      equation: '3Mg + N₂ = Mg₃N₂',
      conditions: { heat: false, ignite: true, catalyst: null, minTemp: 0, needsWater: false },
      phenomena: {
        kind: 'flame', gas: null, toColor: '#ffffff', pptColor: '#cbd6a0',
        message: '镁条继续燃烧，发出耀眼白光，生成淡黄绿色的固体',
        heat: -460
      },
      note: '所以镁在空气中燃烧的产物既有氧化镁又有氮化镁，"镁条能在氮气中燃烧"常考。'
    },
    {
      id: 'fe_cucl2', name: '铁与氯化铜溶液反应', type: '置换反应', level: 'both',
      reactants: ['fe', 'cucl2'], ratio: { fe: 1, cucl2: 1 },
      products: [{ id: 'fecl2', n: 1 }, { id: 'cu', n: 1 }],
      equation: 'Fe + CuCl₂ = FeCl₂ + Cu',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#9fd39a', pptColor: '#c1743a',
        message: '铁钉表面覆盖一层红色的铜，蓝绿色溶液逐渐变成浅绿色',
        heat: -120
      }
    },
    {
      id: 'zn_feso4', name: '锌与硫酸亚铁溶液反应', type: '置换反应', level: 'both',
      reactants: ['zn', 'feso4'], ratio: { zn: 1, feso4: 1 },
      products: [{ id: 'znso4', n: 1 }, { id: 'fe', n: 1 }],
      equation: 'Zn + FeSO₄ = ZnSO₄ + Fe',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'colorChange', gas: null, toColor: '#eef6ff', pptColor: '#8d939b',
        message: '锌粒表面析出灰黑色的铁，浅绿色溶液逐渐变成无色',
        heat: -80
      },
      note: '再次说明活动性 Zn > Fe。'
    },
    {
      id: 'naoh_feso4', name: '硫酸亚铁与氢氧化钠溶液反应', type: '复分解反应', level: 'senior',
      reactants: ['feso4', 'naoh'], ratio: { feso4: 1, naoh: 2 },
      products: [{ id: 'feoh2', n: 1 }, { id: 'na2so4', n: 1 }],
      equation: 'FeSO₄ + 2NaOH = Fe(OH)₂↓ + Na₂SO₄',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#f2f4f7',
        message: '产生白色絮状沉淀（Fe(OH)₂）',
        heat: -95
      },
      note: 'Fe(OH)₂ 极易被空气中的氧气氧化：4Fe(OH)₂ + O₂ + 2H₂O = 4Fe(OH)₃，' +
        '所以沉淀会迅速由白色变成灰绿色、最后变成红褐色。观察要及时。'
    },
    {
      id: 'naoh_fecl2', name: '氯化亚铁与氢氧化钠溶液反应', type: '复分解反应', level: 'senior',
      reactants: ['fecl2', 'naoh'], ratio: { fecl2: 1, naoh: 2 },
      products: [{ id: 'feoh2', n: 1 }, { id: 'nacl', n: 2 }],
      equation: 'FeCl₂ + 2NaOH = Fe(OH)₂↓ + 2NaCl',
      conditions: { heat: false, ignite: false, catalyst: null, minTemp: 0, needsWater: true },
      phenomena: {
        kind: 'precipitate', gas: null, toColor: null, pptColor: '#f2f4f7',
        message: '产生白色絮状沉淀（Fe(OH)₂），随后迅速变色',
        heat: -95
      },
      note: '与硫酸亚铁同理：Fe²⁺ 与碱反应生成白色的 Fe(OH)₂。'
    }
  ];

  CHEM.registerReactions(RULES);
})(typeof window !== 'undefined' ? window : globalThis);
