/* =============================================================================
 * 虚拟化学实验室 —— 物质库 (Substances)
 * -----------------------------------------------------------------------------
 * 每条记录描述一种物质。字段说明：
 *   id            唯一标识，反应规则中引用它
 *   base          反应匹配用的"母体"标识（溶液与其固体共用同一 base）
 *   name          中文名
 *   formula       化学式（用于显示与书写方程式）
 *   phase         solid | liquid | solution | gas
 *   color         固体本色 / 液体本色（十六进制）
 *   dissolveColor 溶解后溶液颜色（phase 为 solid 时使用）
 *   precipColor   作为沉淀析出时的颜色
 *   soluble       true | false | 'slight'  溶解性
 *   pickable      是否出现在药品架上（生成物为 false）
 *   shelf         药品架分组
 *   hazard        危险标识
 *   mm            摩尔质量 / 相对分子质量（方程式配平校验用）
 *   note          提示文字
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});

  /* 常用颜色常量：让全库配色统一，避免各条记录写出不同色号 */
  var C = {
    white: '#eef1f5',
    offwhite: '#f6f7fa',
    metalLite: '#cfd4da',
    metalGrey: '#8d939b',
    copper: '#c1743a',
    silver: '#d8dce2',
    charcoal: '#2b2b2b',
    sulfur: '#e8d44d',
    redP: '#c0392b',
    purple: '#4b1354',
    crimson: '#8e2b3f',
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
    purpleLitmus: '#8e6bbf',
    pink: '#ff5f9e'
  };
  CHEM.COLORS = C;

  /* 危险标识文字（与图形符号配合显示） */
  var H = {
    flammable: '易燃',
    corrosive: '腐蚀性',
    toxic: '有毒',
    oxidizer: '强氧化性',
    irritant: '刺激性',
    explosive: '易爆'
  };

  var SUBSTANCES = [
    /* ======================= 金属单质 ======================= */
    {
      id: 'mg', name: '镁条', formula: 'Mg', phase: 'solid', color: C.metalLite,
      soluble: false, pickable: true, shelf: 'metal', hazard: [H.flammable], mm: 24,
      note: '银白色金属，质软。燃烧时发出耀眼白光，生成白色固体氧化镁。'
    },
    {
      id: 'al', name: '铝片', formula: 'Al', phase: 'solid', color: C.metalLite,
      soluble: false, pickable: true, shelf: 'metal', hazard: [], mm: 27,
      note: '银白色金属，表面易形成致密的氧化铝薄膜，因此耐腐蚀。'
    },
    {
      id: 'fe', name: '铁钉', formula: 'Fe', phase: 'solid', color: C.metalGrey,
      soluble: false, pickable: true, shelf: 'metal', hazard: [], mm: 56,
      note: '银白色金属（铁粉为黑色）。在潮湿空气中易生锈。'
    },
    {
      id: 'zn', name: '锌粒', formula: 'Zn', phase: 'solid', color: C.metalLite,
      soluble: false, pickable: true, shelf: 'metal', hazard: [], mm: 65,
      note: '银白色金属，常用于实验室制取氢气。'
    },
    {
      id: 'cu', name: '铜片', formula: 'Cu', phase: 'solid', color: C.copper,
      soluble: false, pickable: true, shelf: 'metal', hazard: [], mm: 64,
      note: '紫红色金属，导电导热性好。加热时表面变黑（生成氧化铜）。'
    },
    {
      id: 'ag', name: '银', formula: 'Ag', phase: 'solid', color: C.silver,
      soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 108,
      note: '银白色金属，由铜或铁与硝酸银溶液发生置换反应生成。'
    },

    /* ======================= 非金属单质 ======================= */
    {
      id: 'c', name: '木炭', formula: 'C', phase: 'solid', color: C.charcoal,
      soluble: false, pickable: true, shelf: 'nonmetal', hazard: [H.flammable], mm: 12,
      note: '黑色固体，具有吸附性。在氧气中燃烧发出白光。'
    },
    {
      id: 's', name: '硫粉', formula: 'S', phase: 'solid', color: C.sulfur,
      soluble: false, pickable: true, shelf: 'nonmetal', hazard: [H.flammable, H.irritant], mm: 32,
      note: '淡黄色固体。在氧气中燃烧发出明亮的蓝紫色火焰。'
    },
    {
      id: 'p', name: '红磷', formula: 'P', phase: 'solid', color: C.redP,
      soluble: false, pickable: true, shelf: 'nonmetal', hazard: [H.flammable], mm: 31,
      note: '暗红色固体。燃烧产生大量白烟，可用于测定空气中氧气含量。'
    },

    /* ======================= 气体 ======================= */
    {
      id: 'o2', name: '氧气', formula: 'O2', phase: 'gas', color: '#cfe8ff',
      soluble: 'slight', pickable: true, shelf: 'gas', hazard: [H.oxidizer], mm: 32,
      note: '无色无味气体，能支持燃烧。检验方法：伸入带火星的木条，木条复燃。'
    },
    {
      id: 'h2', name: '氢气', formula: 'H2', phase: 'gas', color: '#d8ecff',
      soluble: false, pickable: true, shelf: 'gas', hazard: [H.flammable, H.explosive], mm: 2,
      note: '无色无味、密度最小的气体。点燃前必须验纯，否则可能爆炸。'
    },
    {
      id: 'co2', name: '二氧化碳', formula: 'CO2', phase: 'gas', color: '#dbe6ee',
      soluble: true, pickable: true, shelf: 'gas', hazard: [], mm: 44,
      note: '无色无味气体，能溶于水。检验方法：通入澄清石灰水，变浑浊。'
    },
    {
      id: 'ch4', name: '甲烷', formula: 'CH4', phase: 'gas', color: '#dde9f2',
      soluble: false, pickable: true, shelf: 'gas', hazard: [H.flammable, H.explosive], mm: 16,
      note: '天然气的主要成分。燃烧发出明亮的蓝色火焰。'
    },
    {
      id: 'co', name: '一氧化碳', formula: 'CO', phase: 'gas', color: '#e2e8ee',
      soluble: false, pickable: false, shelf: 'product', hazard: [H.toxic, H.flammable], mm: 28,
      note: '无色无味、有毒的气体，具有还原性，可冶炼金属。'
    },
    {
      id: 'so2', name: '二氧化硫', formula: 'SO2', phase: 'gas', color: '#e6ecdf',
      soluble: true, pickable: false, shelf: 'product', hazard: [H.toxic, H.irritant], mm: 64,
      note: '有刺激性气味的有毒气体，是形成酸雨的主要污染物之一。'
    },

    /* ======================= 氧化物 ======================= */
    {
      id: 'h2o', name: '蒸馏水', formula: 'H2O', phase: 'liquid', color: C.water,
      soluble: true, pickable: true, shelf: 'liquid', hazard: [], mm: 18,
      note: '纯净的水，不导电。许多反应需要在水溶液中进行。'
    },
    {
      id: 'cao', name: '生石灰', formula: 'CaO', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid', hazard: [H.corrosive, H.irritant], mm: 56,
      note: '白色块状固体。与水反应放出大量热，常用作食品干燥剂。'
    },
    {
      id: 'cuo', name: '氧化铜', formula: 'CuO', phase: 'solid', color: C.black,
      dissolveColor: C.cyanBlue, soluble: false, pickable: true, shelf: 'solid', hazard: [H.irritant], mm: 80,
      note: '黑色粉末。能与稀酸反应生成蓝色溶液，也能被氢气、碳还原为铜。'
    },
    {
      id: 'fe2o3', name: '氧化铁', formula: 'Fe2O3', phase: 'solid', color: C.brown,
      dissolveColor: C.yellow, soluble: false, pickable: true, shelf: 'solid', hazard: [], mm: 160,
      note: '红棕色粉末，俗称铁锈。与稀盐酸反应生成黄色溶液。'
    },
    {
      id: 'fe3o4', name: '四氧化三铁', formula: 'Fe3O4', phase: 'solid', color: C.black,
      soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 232,
      note: '黑色固体，有磁性。铁在氧气中燃烧的产物。'
    },
    {
      id: 'mgo', name: '氧化镁', formula: 'MgO', phase: 'solid', color: C.white,
      dissolveColor: C.clearLiq, soluble: 'slight', pickable: false, shelf: 'product', hazard: [], mm: 40,
      note: '白色固体，镁燃烧的产物。'
    },
    {
      id: 'p2o5', name: '五氧化二磷', formula: 'P2O5', phase: 'solid', color: C.white,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.corrosive], mm: 142,
      note: '白色固体，易吸水。红磷燃烧产生的白烟就是它的小颗粒。'
    },
    {
      id: 'mno2', name: '二氧化锰', formula: 'MnO2', phase: 'solid', color: C.black,
      soluble: false, pickable: true, shelf: 'solid', hazard: [H.irritant], mm: 87,
      note: '黑色粉末。是过氧化氢和氯酸钾分解制氧气的催化剂。'
    },

    /* ======================= 酸 ======================= */
    {
      id: 'hcl', name: '稀盐酸', formula: 'HCl', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: [H.corrosive, H.irritant], mm: 36.5,
      note: '氯化氢气体的水溶液。具有挥发性，能与活泼金属、金属氧化物、碱、某些盐反应。'
    },
    {
      id: 'h2so4', name: '稀硫酸', formula: 'H2SO4', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: [H.corrosive, H.irritant], mm: 98,
      note: '无色黏稠液体，稀释时放出大量热。与稀盐酸化学性质相似。'
    },
    {
      id: 'h2co3', name: '碳酸', formula: 'H2CO3', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 62,
      note: '很不稳定，会分解成水和二氧化碳。'
    },
    {
      id: 'hno3', name: '硝酸', formula: 'HNO3', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.corrosive, H.oxidizer], mm: 63,
      note: '强酸，具有强氧化性。由硝酸银与盐酸反应生成。'
    },

    /* ======================= 碱 ======================= */
    {
      id: 'naoh', name: '氢氧化钠', formula: 'NaOH', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid',
      hazard: [H.corrosive], mm: 40,
      note: '白色固体，易潮解，溶于水放热。俗称烧碱、火碱、苛性钠，有强腐蚀性。'
    },
    {
      id: 'naohaq', name: '氢氧化钠溶液', formula: 'NaOH', base: 'naoh', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: true, shelf: 'liquid', hazard: [H.corrosive], mm: 40,
      note: '无色溶液，有强腐蚀性。能吸收二氧化碳。'
    },
    {
      id: 'caoh2', name: '熟石灰', formula: 'Ca(OH)2', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: 'slight', pickable: true, shelf: 'solid', hazard: [H.irritant], mm: 74,
      note: '白色粉末，微溶于水。其水溶液叫石灰水，用于检验二氧化碳。'
    },
    {
      id: 'caoh2aq', name: '澄清石灰水', formula: 'Ca(OH)2', base: 'caoh2', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: true, shelf: 'liquid', hazard: [H.irritant], mm: 74,
      note: '氢氧化钙的稀溶液，澄清透明。通入二氧化碳会变浑浊。'
    },
    {
      id: 'cuoh2', name: '氢氧化铜', formula: 'Cu(OH)2', phase: 'solid', color: C.blue,
      precipColor: C.blue, soluble: false, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 98,
      note: '蓝色絮状沉淀。由可溶性铜盐与碱溶液反应生成。'
    },
    {
      id: 'feoh3', name: '氢氧化铁', formula: 'Fe(OH)3', phase: 'solid', color: C.brickRed,
      precipColor: C.brickRed, soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 107,
      note: '红褐色沉淀。由可溶性铁盐与碱溶液反应生成。'
    },
    {
      id: 'mgoh2', name: '氢氧化镁', formula: 'Mg(OH)2', phase: 'solid', color: C.white,
      precipColor: C.white, soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 58,
      note: '白色沉淀。'
    },
    {
      id: 'aloh3', name: '氢氧化铝', formula: 'Al(OH)3', phase: 'solid', color: C.white,
      precipColor: C.white, soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 78,
      note: '白色胶状沉淀。'
    },
    {
      id: 'znoh2', name: '氢氧化锌', formula: 'Zn(OH)2', phase: 'solid', color: C.white,
      precipColor: C.white, soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 99,
      note: '白色沉淀。'
    },

    /* ======================= 盐 ======================= */
    {
      id: 'caco3', name: '大理石', formula: 'CaCO3', phase: 'solid', color: C.offwhite,
      soluble: false, pickable: true, shelf: 'solid', hazard: [], mm: 100,
      note: '白色块状固体（主要成分碳酸钙）。是实验室制取二氧化碳的原料。'
    },
    {
      id: 'na2co3', name: '碳酸钠', formula: 'Na2CO3', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid', hazard: [H.irritant], mm: 106,
      note: '白色粉末，俗称纯碱、苏打。水溶液显碱性。'
    },
    {
      id: 'na2co3aq', name: '碳酸钠溶液', formula: 'Na2CO3', base: 'na2co3', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: true, shelf: 'liquid', hazard: [H.irritant], mm: 106,
      note: '无色溶液，显碱性，能使酚酞变红。'
    },
    {
      id: 'nahco3', name: '碳酸氢钠', formula: 'NaHCO3', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid', hazard: [], mm: 84,
      note: '白色粉末，俗称小苏打。受热易分解，可用于焙制糕点。'
    },
    {
      id: 'nh4hco3', name: '碳酸氢铵', formula: 'NH4HCO3', phase: 'solid', color: C.offwhite,
      soluble: true, pickable: true, shelf: 'solid', hazard: [H.irritant], mm: 79,
      note: '白色固体，受热分解生成氨气、水和二氧化碳，是常见的氮肥。'
    },
    {
      id: 'nacl', name: '氯化钠', formula: 'NaCl', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid', hazard: [], mm: 58.5,
      note: '白色晶体，食盐的主要成分。'
    },
    {
      id: 'naclaq', name: '氯化钠溶液', formula: 'NaCl', base: 'nacl', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: true, shelf: 'liquid', hazard: [], mm: 58.5,
      note: '无色溶液。与硝酸银溶液反应生成白色沉淀。'
    },
    {
      id: 'cuso4', name: '硫酸铜', formula: 'CuSO4', phase: 'solid', color: C.blue,
      dissolveColor: C.blue, soluble: true, pickable: true, shelf: 'solid', hazard: [H.irritant, H.toxic], mm: 160,
      note: '白色粉末（无水），遇水变蓝。其溶液为蓝色，可用于检验水。'
    },
    {
      id: 'cuso4aq', name: '硫酸铜溶液', formula: 'CuSO4', base: 'cuso4', phase: 'solution',
      color: C.blue, soluble: true, pickable: true, shelf: 'liquid', hazard: [H.irritant, H.toxic], mm: 160,
      note: '蓝色溶液。与活泼金属发生置换反应，与碱溶液反应生成蓝色沉淀。'
    },
    {
      id: 'feso4', name: '硫酸亚铁', formula: 'FeSO4', phase: 'solution', color: C.paleGreen,
      dissolveColor: C.paleGreen, soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 152,
      note: '浅绿色溶液。铁与稀硫酸或硫酸铜溶液反应的产物。'
    },
    {
      id: 'fecl2', name: '氯化亚铁', formula: 'FeCl2', phase: 'solution', color: C.paleGreen,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 127,
      note: '浅绿色溶液。铁与稀盐酸反应的产物。'
    },
    {
      id: 'fecl3', name: '氯化铁', formula: 'FeCl3', phase: 'solution', color: C.yellow,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 162.5,
      note: '黄色溶液。氧化铁与稀盐酸反应的产物。'
    },
    {
      id: 'cucl2', name: '氯化铜', formula: 'CuCl2', phase: 'solution', color: C.cyanBlue,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 135,
      note: '蓝绿色溶液。氧化铜与稀盐酸反应的产物。'
    },
    {
      id: 'mgcl2', name: '氯化镁', formula: 'MgCl2', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 95,
      note: '无色溶液。'
    },
    {
      id: 'alcl3', name: '氯化铝', formula: 'AlCl3', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 133.5,
      note: '无色溶液。'
    },
    {
      id: 'zncl2', name: '氯化锌', formula: 'ZnCl2', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 136,
      note: '无色溶液。'
    },
    {
      id: 'cacl2', name: '氯化钙', formula: 'CaCl2', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 111,
      note: '无色溶液。'
    },
    {
      id: 'znso4', name: '硫酸锌', formula: 'ZnSO4', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 161,
      note: '无色溶液。'
    },
    {
      id: 'mgso4', name: '硫酸镁', formula: 'MgSO4', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 120,
      note: '无色溶液。'
    },
    {
      id: 'al2so43', name: '硫酸铝', formula: 'Al2(SO4)3', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 342,
      note: '无色溶液。'
    },
    {
      id: 'na2so4', name: '硫酸钠', formula: 'Na2SO4', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 142,
      note: '无色溶液。'
    },
    {
      id: 'caso4', name: '硫酸钙', formula: 'CaSO4', phase: 'solid', color: C.white,
      precipColor: C.white, soluble: 'slight', pickable: false, shelf: 'product', hazard: [], mm: 136,
      note: '微溶于水。覆盖在大理石表面会阻止反应继续进行。'
    },
    {
      id: 'bacl2', name: '氯化钡溶液', formula: 'BaCl2', base: 'bacl2', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: true, shelf: 'liquid', hazard: [H.toxic], mm: 208,
      note: '无色溶液，有毒。用于检验硫酸根离子。'
    },
    {
      id: 'agno3', name: '硝酸银溶液', formula: 'AgNO3', base: 'agno3', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: true, shelf: 'liquid', hazard: [H.corrosive, H.oxidizer], mm: 170,
      note: '无色溶液，见光易分解。用于检验氯离子。'
    },
    {
      id: 'cu_no32', name: '硝酸铜', formula: 'Cu(NO3)2', phase: 'solution', color: C.blue,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 188,
      note: '蓝色溶液。铜与硝酸银溶液反应的产物。'
    },
    {
      id: 'fe_no32', name: '硝酸亚铁', formula: 'Fe(NO3)2', phase: 'solution', color: C.paleGreen,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 180,
      note: '浅绿色溶液。'
    },
    {
      id: 'kcl', name: '氯化钾', formula: 'KCl', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 74.5,
      note: '无色溶液。氯酸钾分解的产物之一。'
    },
    {
      id: 'agno3_s', name: '硝酸银', formula: 'AgNO3', base: 'agno3', phase: 'solution',
      color: C.clearLiq, soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 170,
      note: '硝酸银（内部使用）。'
    },
    {
      id: 'agcl', name: '氯化银', formula: 'AgCl', phase: 'solid', color: C.offwhite,
      precipColor: C.offwhite, soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 143.5,
      note: '白色沉淀，不溶于稀硝酸。用于检验氯离子。'
    },
    {
      id: 'baso4', name: '硫酸钡', formula: 'BaSO4', phase: 'solid', color: C.offwhite,
      precipColor: C.offwhite, soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 233,
      note: '白色沉淀，不溶于稀硝酸。用于检验硫酸根离子。'
    },
    {
      id: 'baco3', name: '碳酸钡', formula: 'BaCO3', phase: 'solid', color: C.offwhite,
      precipColor: C.offwhite, soluble: false, pickable: false, shelf: 'product', hazard: [H.toxic], mm: 197,
      note: '白色沉淀。由氯化钡溶液与碳酸钠溶液反应生成。'
    },
    {
      id: 'ag2co3', name: '碳酸银', formula: 'Ag2CO3', phase: 'solid', color: '#f2efe4',
      precipColor: '#f2efe4', soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 276,
      note: '淡黄色沉淀。由硝酸银溶液与碳酸钠溶液反应生成。'
    },
    {
      id: 'caso3', name: '亚硫酸钙', formula: 'CaSO3', phase: 'solid', color: C.offwhite,
      precipColor: C.offwhite, soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 120,
      note: '白色沉淀。由二氧化硫通入石灰水生成。'
    },
    {
      id: 'al2o3', name: '氧化铝', formula: 'Al2O3', phase: 'solid', color: C.offwhite,
      soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 102,
      note: '白色固体。铝表面致密的氧化铝薄膜能保护内部的铝不被继续氧化。'
    },
    {
      id: 'nh3', name: '氨气', formula: 'NH3', phase: 'gas', color: '#dfe9e0',
      soluble: true, pickable: false, shelf: 'product', hazard: [H.toxic, H.irritant], mm: 17,
      note: '无色、有强烈刺激性气味的气体，极易溶于水，水溶液显碱性。'
    },
    {
      id: 'zn_no32', name: '硝酸锌', formula: 'Zn(NO3)2', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 189,
      note: '无色溶液。锌与硝酸银溶液反应的产物。'
    },
    {
      id: 'fe2so43', name: '硫酸铁', formula: 'Fe2(SO4)3', phase: 'solution', color: C.yellow,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 400,
      note: '黄色溶液。氧化铁或氢氧化铁与稀硫酸反应的产物。'
    },
    {
      id: 'nano3', name: '硝酸钠', formula: 'NaNO3', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [], mm: 85,
      note: '无色溶液。硝酸银与钠盐溶液反应的产物之一。'
    },
    {
      id: 'na2so3', name: '亚硫酸钠', formula: 'Na2SO3', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: false, shelf: 'product', hazard: [H.irritant], mm: 126,
      note: '无色溶液。二氧化硫被氢氧化钠溶液吸收后的产物。'
    },

    /* ======================= 其他固体药品 ======================= */
    {
      id: 'kmno4', name: '高锰酸钾', formula: 'KMnO4', phase: 'solid', color: C.purple,
      dissolveColor: '#7a1f7a', soluble: true, pickable: true, shelf: 'solid',
      hazard: [H.oxidizer, H.irritant], mm: 158,
      note: '紫黑色固体。加热可制取氧气，试管口需塞一团棉花。'
    },
    {
      id: 'kclo3', name: '氯酸钾', formula: 'KClO3', phase: 'solid', color: C.offwhite,
      dissolveColor: C.clearLiq, soluble: true, pickable: true, shelf: 'solid',
      hazard: [H.oxidizer, H.explosive], mm: 122.5,
      note: '白色固体。与二氧化锰混合加热可制取氧气。'
    },
    {
      id: 'k2mno4', name: '锰酸钾', formula: 'K2MnO4', phase: 'solid', color: C.green,
      dissolveColor: C.green, soluble: true, pickable: false, shelf: 'product', hazard: [H.oxidizer], mm: 197,
      note: '绿色固体，高锰酸钾受热分解的产物之一。'
    },
    {
      id: 'h2o2', name: '过氧化氢溶液', formula: 'H2O2', phase: 'solution', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: [H.oxidizer, H.irritant], mm: 34,
      note: '无色液体，俗称双氧水。加入二氧化锰后迅速分解放出氧气。'
    },
    {
      id: 'c2h5oh', name: '乙醇', formula: 'C2H5OH', phase: 'liquid', color: C.clearLiq,
      soluble: true, pickable: true, shelf: 'liquid', hazard: [H.flammable], mm: 46,
      note: '无色有特殊气味的液体，俗称酒精。可作燃料，燃烧生成二氧化碳和水。'
    },
    {
      id: 'cu2oh2co3', name: '碱式碳酸铜', formula: 'Cu2(OH)2CO3', phase: 'solid', color: C.green,
      soluble: false, pickable: true, shelf: 'solid', hazard: [H.irritant], mm: 221,
      note: '绿色固体，俗称铜绿。受热分解生成氧化铜、水和二氧化碳。'
    },
    {
      id: 'fes', name: '硫化亚铁', formula: 'FeS', phase: 'solid', color: '#3c3a36',
      soluble: false, pickable: false, shelf: 'product', hazard: [], mm: 88,
      note: '黑色固体。铁与硫加热化合生成。'
    },

    /* ======================= 指示剂与试纸 ======================= */
    {
      id: 'phenolphthalein', name: '无色酚酞溶液', formula: 'C20H14O4', phase: 'solution',
      color: '#f4f8ff', soluble: true, pickable: true, shelf: 'indicator', hazard: [H.irritant], mm: 318,
      note: '遇碱性溶液变红，遇酸性和中性溶液不变色。常用于检验溶液酸碱性。'
    },
    {
      id: 'litmus', name: '紫色石蕊溶液', formula: '—', phase: 'solution',
      color: C.purpleLitmus, soluble: true, pickable: true, shelf: 'indicator', hazard: [], mm: 0,
      note: '遇酸性溶液变红，遇碱性溶液变蓝。可用来区分酸和碱。'
    },
    {
      id: 'litmusPaper', name: '紫色石蕊试纸', formula: '—', phase: 'paper',
      color: C.purpleLitmus, soluble: false, pickable: true, shelf: 'indicator', hazard: [], mm: 0,
      note: '检验气体的酸碱性：变红为酸性，变蓝为碱性。'
    },
    {
      id: 'phPaper', name: 'pH 试纸', formula: '—', phase: 'paper',
      color: '#e8c96a', soluble: false, pickable: true, shelf: 'indicator', hazard: [], mm: 0,
      note: '用玻璃棒蘸取待测液滴在试纸上，与标准比色卡对照读出 pH。'
    }
  ];

  /* 补全 base 字段：未显式声明的以 id 作为母体 */
  SUBSTANCES.forEach(function (s) {
    if (!s.base) s.base = s.id;
    if (s.mm === undefined) s.mm = 0;
    if (!s.hazard) s.hazard = [];
    if (s.phase === 'solid' && !s.dissolveColor) s.dissolveColor = C.clearLiq;
    if (!s.precipColor) s.precipColor = s.color;
  });

  var MAP = Object.create(null);
  SUBSTANCES.forEach(function (s) { MAP[s.id] = s; });

  /* 母体 -> 该母体所有形态（固体 / 溶液） */
  var BY_BASE = Object.create(null);
  SUBSTANCES.forEach(function (s) {
    (BY_BASE[s.base] = BY_BASE[s.base] || []).push(s);
  });

  CHEM.SUBSTANCES = SUBSTANCES;
  CHEM.SUBSTANCE_MAP = MAP;
  CHEM.SUBSTANCES_BY_BASE = BY_BASE;

  CHEM.getSub = function (id) { return MAP[id] || null; };
  CHEM.baseOf = function (id) {
    var s = MAP[id];
    return s ? s.base : id;
  };
  /* 取某母体最适合作为"溶液形态"的条目，用于生成物显示 */
  CHEM.solutionFormOf = function (baseId) {
    var list = BY_BASE[baseId] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].phase === 'solution') return list[i];
    }
    return list[0] || null;
  };
  CHEM.isGas = function (id) {
    var s = MAP[id];
    return !!s && s.phase === 'gas';
  };

  /* =========================================================================
   * 学段（初中 / 高中）选择
   * ---------------------------------------------------------------------
   * level 取值：
   *   'both'    两个学段都会出现（默认）
   *   'junior'  只在初中模式出现
   *   'senior'  只在高中模式出现
   * 物质、反应规则、检验方法、实验任务都带这个字段。
   * ====================================================================== */
  CHEM.LEVELS = [
    { id: 'junior', name: '初中化学', desc: '九年级化学：常见的酸、碱、盐、金属、气体制取与性质' },
    { id: 'senior', name: '高中化学', desc: '必修 + 选修：元素化合物、有机化学基础、电化学、离子反应' },
    { id: 'all', name: '全部内容', desc: '初中与高中内容同时显示，自由探索' }
  ];
  CHEM.level = CHEM.level || 'junior';

  CHEM.setLevel = function (lv) {
    CHEM.level = lv || 'junior';
    if (CHEM.invalidateRules) CHEM.invalidateRules();
    return CHEM.level;
  };

  function levelMatch(itemLevel) {
    var lv = itemLevel || 'both';
    if (CHEM.level === 'all') return true;
    if (lv === 'both') return true;
    return lv === CHEM.level;
  }
  /* 当前学段下，这条物质是否出现在药品架上 */
  CHEM.substanceAvailable = function (s) { return !!s && levelMatch(s.level); };
  /* 当前学段下，这条反应规则是否参与匹配 */
  CHEM.ruleAvailable = function (r) {
    if (!r) return false;
    if (CHEM.level === 'all') return true;
    var lv = r.level || 'junior';
    if (lv === 'both') return true;
    /* 高中化学建立在初中基础之上：金属与酸、酸碱中和、复分解/离子反应、
       燃烧、气体制取这些内容高中会反复用到，所以在高中模式下也要保留，
       否则药品架上摆着稀盐酸、大理石却点不出反应，反而更让人困惑。 */
    if (lv === 'junior' && CHEM.level === 'senior' && SHARED_RULE_SET[r.id]) return true;
    return lv === CHEM.level;
  };
  CHEM.isSharedRule = function (id) { return !!SHARED_RULE_SET[id]; };
  CHEM.experimentAvailable = function (e) { return !!e && levelMatch(e.level || 'junior'); };

  /* 两个学段共用的"基础反应"规则 id（初中库里的） */
  var SHARED_RULE_IDS = [
    /* 燃烧与金属性质 */
    'mg_o2', 'fe_o2', 'c_o2_full', 's_o2', 'p_o2', 'h2_o2', 'co_o2', 'ch4_o2', 'c2h5oh_o2',
    'cu_o2', 'fe_s', 'mg_co2',
    /* 气体制取与电解 */
    'kmno4_heat', 'kclo3_heat', 'h2o2_mno2', 'h2o2_slow', 'h2o_electric', 'caco3_heat',
    /* 金属与酸 */
    'mg_hcl', 'zn_hcl', 'fe_hcl', 'al_hcl',
    'mg_h2so4', 'zn_h2so4', 'fe_h2so4', 'al_h2so4',
    /* 金属与盐溶液（置换） */
    'fe_cuso4', 'zn_cuso4', 'al_cuso4', 'cu_agno3', 'fe_agno3',
    /* 酸碱中和 */
    'naoh_hcl', 'naoh_h2so4', 'caoh2_hcl', 'caoh2_h2so4',
    /* 金属氧化物与酸 */
    'fe2o3_hcl', 'fe2o3_h2so4', 'cuo_hcl', 'cuo_h2so4', 'mgo_hcl', 'cao_hcl',
    /* 复分解与离子反应 */
    'caco3_hcl', 'na2co3_hcl', 'nahco3_hcl', 'na2co3_h2so4',
    'naoh_cuso4', 'naoh_fecl3', 'naoh_mgcl2', 'naoh_alcl3', 'caoh2_na2co3',
    'bacl2_h2so4', 'agno3_hcl', 'bacl2_na2so4', 'agno3_nacl',
    /* 酸性氧化物 */
    'co2_naoh', 'co2_caoh2', 'so2_naoh', 'so2_caoh2', 'co2_h2o', 'co2_c', 'cao_h2o',
    /* 氧化还原与冶炼 */
    'h2_cuo', 'c_cuo', 'co_cuo', 'co_fe2o3', 'c_fe2o3', 'h2_fe2o3',
    /* 指示剂 */
    'phenolphthalein_naoh', 'phenolphthalein_hcl', 'phenolphthalein_na2co3',
    'litmus_hcl', 'litmus_naoh', 'litmus_na2co3', 'litmus_nacl'
  ];
  var SHARED_RULE_SET = Object.create(null);
  SHARED_RULE_IDS.forEach(function (id) { SHARED_RULE_SET[id] = true; });

  /* =========================================================================
   * 注册接口：供高中化学等后续数据文件追加内容
   * ====================================================================== */
  function applyDefaults(list) {
    list.forEach(function (s) {
      if (!s.base) s.base = s.id;
      if (s.mm === undefined) s.mm = 0;
      if (!s.hazard) s.hazard = [];
      if (s.phase === 'solid' && !s.dissolveColor) s.dissolveColor = C.clearLiq;
      if (!s.precipColor) s.precipColor = s.color;
      if (!s.level) s.level = 'both';
    });
    return list;
  }
  applyDefaults(SUBSTANCES);

  CHEM.registerSubstances = function (list) {
    list.forEach(function (s) {
      /* 已存在的物质视为"局部更新"：只覆盖显式给出的字段，
         绝不能先套默认值——否则 mm 会被填成 0，反应就没法按物质的量计量了。 */
      if (MAP[s.id]) {
        var old = MAP[s.id];
        for (var k in s) old[k] = s[k];
        return;
      }
      applyDefaults([s]);
      SUBSTANCES.push(s);
      MAP[s.id] = s;
      (BY_BASE[s.base] = BY_BASE[s.base] || []).push(s);
    });
    return list.length;
  };
  CHEM.registerReactions = function (list) {
    CHEM.REACTIONS = (CHEM.REACTIONS || []).concat(list);
    if (CHEM.invalidateRules) CHEM.invalidateRules();
    return list.length;
  };
  CHEM.registerTests = function (list) {
    var have = Object.create(null);
    (CHEM.TESTS || []).forEach(function (t) { have[t.id] = true; });
    CHEM.TESTS = (CHEM.TESTS || []).concat(list.filter(function (t) { return !have[t.id]; }));
    return list.length;
  };
  CHEM.registerPHRules = function (list) {
    var have = Object.create(null);
    (CHEM.PH_RULES || []).forEach(function (e) { have[e.id] = true; });
    CHEM.PH_RULES = (CHEM.PH_RULES || []).concat(list.filter(function (e) { return !have[e.id]; }));
    return list.length;
  };
  CHEM.registerExperiments = function (list) {
    CHEM.EXPERIMENTS = (CHEM.EXPERIMENTS || []).concat(list);
    return list.length;
  };

  /* 药品架分组定义（顺序即显示顺序） */
  CHEM.SHELVES = [
    { id: 'metal', name: '金属单质', icon: '⬢' },
    { id: 'nonmetal', name: '非金属单质', icon: '◆' },
    { id: 'gas', name: '气体', icon: '☁' },
    { id: 'solid', name: '固体药品', icon: '▦' },
    { id: 'liquid', name: '液体药品', icon: '💧' },
    { id: 'organic', name: '有机化合物', icon: '⬡' },
    { id: 'indicator', name: '指示剂 / 试纸', icon: '🎨' }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
