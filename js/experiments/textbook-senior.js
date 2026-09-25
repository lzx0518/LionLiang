/* =============================================================================
 * 虚拟化学实验室 —— 高中教材实验库（人教版必修 + 选择性必修）
 * -----------------------------------------------------------------------------
 * 通过 CHEM.registerExperiments 追加，每条任务带 level: 'senior'。
 *
 * 数据结构（在 index.js 的任务结构上增加两个字段）：
 *   chapter    必填，教材位置，如 '必修第一册 · 第二章 海水中的重要元素——钠和氯'
 *   principle  必填，数组，该实验涉及的化学方程式（照抄数据文件里的写法）
 *   其余字段（setup / steps / goal / intro）与 index.js 完全一致。
 *
 * 所有方程式、物质 id、仪器 id 都取自 js/data/*.js，新增前请先核对。
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});
  var BENCH = CHEM.SCENE ? CHEM.SCENE.benchY : 566;

  /* 两个容器放的液体是同一个 base（例如都是硫酸铜溶液），说明已经把它们混合过 */
  function mix(w, a, b) {
    var list = cs(w);
    return list.some(function (x) {
      return x.hasBase(a) && x.hasBase(b);
    });
  }

  /* ---------- 查询工具（与 senior.js 里的写法保持一致） ---------- */
  function cs(w) { return w.containers(); }
  function any(w, base) { return cs(w).some(function (c) { return c.hasBase(base); }); }
  function fired(w, ruleId) {
    return cs(w).some(function (c) { return !!c.firedRules[ruleId]; });
  }
  function liquidOf(w, base) {
    var v = 0;
    cs(w).forEach(function (c) {
      c.liquids.forEach(function (e) {
        var s = CHEM.getSub(e.id);
        if (s && s.base === base) v += e.ml;
      });
    });
    return v;
  }
  function testDone(w, id) {
    return cs(w).some(function (c) { return c.tests && c.tests[id]; });
  }
  function testOk(w, id) {
    return cs(w).some(function (c) { return c.tests && c.tests[id] && c.tests[id].ok; });
  }
  function holdsAll(w, bases) {
    return cs(w).some(function (c) {
      return bases.every(function (b) { return c.hasBase(b); });
    });
  }
  /* 某个容器里溶质已完全溶解（没有未溶解的固体残留） */
  function dissolved(w, base) {
    return cs(w).some(function (c) {
      var inLiquid = c.liquids.some(function (e) {
        var s = CHEM.getSub(e.id);
        return s && s.base === base;
      });
      return inLiquid && c.solidMass() < 0.05;
    });
  }
  function byType(w, type) {
    return cs(w).filter(function (c) { return c.type === type; });
  }
  function at(type, x, up) { return { type: type, x: x, y: BENCH - (up || 0) }; }

  /* 货架名 / 物质名：从物质库现取，保证提示里的中文名和药品架一致 */
  var SHELF_NAME = {};
  (CHEM.SHELVES || []).forEach(function (sh) { SHELF_NAME[sh.id] = sh.name; });
  function nm(base, fallback) {
    var list = CHEM.SUBSTANCES_BY_BASE ? CHEM.SUBSTANCES_BY_BASE[base] : null;
    var s = list && (list.filter(function (x) { return x.pickable; })[0] || list[0]);
    return (s && s.name) || fallback || base;
  }
  function hintOf(base, fallback) {
    var list = CHEM.SUBSTANCES_BY_BASE ? CHEM.SUBSTANCES_BY_BASE[base] : null;
    var s = list && (list.filter(function (x) { return x.pickable; })[0] || list[0]);
    if (!s) return '药品架 → ' + nm(base, fallback);
    return '药品架 → ' + (SHELF_NAME[s.shelf] || '药品') + ' → ' + s.name;
  }

  /* =====================================================================
   * 任务列表（10 个高中教材实验）
   * ================================================================== */
  var LIST = [

    /* ------------------------------------------------------------ 1 */
    {
      id: 'tb-iron',
      level: 'senior',
      name: '铁及其化合物的性质与转化',
      chapter: '必修第一册 · 第三章 铁 金属材料',
      goal: '掌握 Fe³⁺ 的检验方法，认识 Fe²⁺ 与 Fe³⁺ 之间的相互转化。',
      intro: 'Fe³⁺ 遇 KSCN 溶液立即变血红色，这是检验 Fe³⁺ 最灵敏的方法。'
        + 'Fe³⁺ 具有氧化性，能被铁粉、铜等还原成 Fe²⁺；Fe²⁺ 具有还原性，遇 O₂ 会被氧化回 Fe³⁺。',
      principle: [
        'Fe₂O₃ + 6HCl = 2FeCl₃ + 3H₂O',
        'FeCl₃ + 3KSCN = Fe(SCN)₃ + 3KCl',
        'Cu + 2FeCl₃ = CuCl₂ + 2FeCl₂',
        'Fe + CuSO₄ = FeSO₄ + Cu',
        'FeSO₄ + 2NaOH = Fe(OH)₂↓ + Na₂SO₄',
        '4Fe(OH)₂ + O₂ + 2H₂O = 4Fe(OH)₃'
      ],
      setup: [
        at('beakerSmall', 280, 0),
        at('testTube', 600, 0),
        at('testTube', 860, 0),
        at('testTube', 1100, 0),
        at('deliveryTube', 440, 250)
      ],
      steps: [
        {
          text: '向小烧杯中加入少量氧化铁粉末，再滴入稀盐酸，观察红棕色粉末溶解、溶液变为黄色',
          hint: hintOf('fe2o3', '氧化铁') + ' + ' + hintOf('hcl', '稀盐酸') + '；Fe₂O₃ + 6HCl = 2FeCl₃ + 3H₂O，黄色说明生成了 Fe³⁺',
          check: function (w) { return fired(w, 'fe2o3_hcl'); }
        },
        {
          text: '取第一支试管，加入制得的黄色溶液，再滴入硫氰化钾溶液检验 Fe³⁺，观察溶液变血红色',
          hint: hintOf('kscn', '硫氰化钾溶液') + '；FeCl₃ + 3KSCN = Fe(SCN)₃ + 3KCl，血红色是 Fe³⁺ 的特征现象',
          check: function (w) { return fired(w, 'fe_kscn'); }
        },
        {
          text: '向第二支试管中加入氯化铁溶液和铜片，观察黄色溶液变成蓝绿色',
          hint: hintOf('cu', '铜片') + ' + ' + hintOf('fecl3', '氯化铁溶液') + '；Cu + 2FeCl₃ = CuCl₂ + 2FeCl₂，铜能把 Fe³⁺ 还原成 Fe²⁺',
          check: function (w) { return fired(w, 'cu_fecl3'); }
        },
        {
          text: '向第三支试管中加入少量铁钉，再滴入硫酸铜溶液，制得浅绿色的硫酸亚铁溶液',
          hint: hintOf('fe', '铁钉') + ' + ' + hintOf('cuso4', '硫酸铜溶液') + '；Fe + CuSO₄ = FeSO₄ + Cu，溶液由蓝色变成浅绿色',
          check: function (w) { return fired(w, 'fe_cuso4') || mix(w, 'fe', 'cuso4'); }
        },
        {
          text: '用「连接」把导管接到第三支试管和小烧杯上，向小烧杯中通入氧气作为氧化剂',
          hint: hintOf('o2', '氧气') + '（在"气体"货架）；工具栏点「连接」，先点导管再点第三支试管、再点一次导管接小烧杯；Fe²⁺ 要被 O₂ 氧化才能变成 Fe³⁺',
          check: function (w) { return any(w, 'o2'); }
        },
        {
          text: '向第三支试管中滴入氢氧化钠溶液，观察白色沉淀迅速变成灰绿色、最后变成红褐色',
          hint: hintOf('naohaq', '氢氧化钠溶液') + '；FeSO₄ + 2NaOH = Fe(OH)₂↓ + Na₂SO₄，4Fe(OH)₂ + O₂ + 2H₂O = 4Fe(OH)₃，颜色变化说明 Fe²⁺ 被氧气氧化成了 Fe³⁺',
          check: function (w) { return fired(w, 'feoh2_o2'); }
        },
        {
          text: '用 pH 试纸检验第三支试管反应后的溶液（硫酸亚铁溶液接近中性）',
          hint: '工具栏点「检验」，再点第三支试管，选「pH 试纸」；通过 pH 可以判断溶液里是否还残留强碱',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 2 */
    {
      id: 'tb-ammonia',
      level: 'senior',
      name: '氨的制取与性质',
      chapter: '必修第二册 · 第五章 化工生产中的重要非金属元素',
      goal: '用铵盐与碱共热制取氨气，并验证氨极易溶于水、水溶液显碱性以及氨与氯化氢的白烟。',
      intro: '实验室用氯化铵固体与氢氧化钙固体混合加热制取氨气，'
        + '用向下排空气法收集。氨极易溶于水，1 体积水能溶解约 700 体积氨，'
        + '水溶液（氨水）显碱性；氨与氯化氢相遇立即产生大量白烟。',
      principle: [
        '2NH₄Cl + Ca(OH)₂ = CaCl₂ + 2NH₃↑ + 2H₂O',
        'NH₃ + H₂O = NH₃·H₂O',
        'NH₃ + HCl = NH₄Cl'
      ],
      setup: [
        at('testTube', 280, 46),
        at('alcoholLamp', 280, 0),
        at('gasJar', 700, 0),
        at('deliveryTube', 480, 260),
        at('testTube', 1060, 0)
      ],
      steps: [
        {
          text: '向试管中加入少量氯化铵固体和氢氧化钙固体',
          hint: hintOf('nh4cl', '氯化铵') + ' + ' + hintOf('caoh2', '熟石灰') + '；两者都是白色固体，混合后加热',
          check: function (w) { return holdsAll(w, ['nh4cl', 'caoh2']); }
        },
        {
          text: '点燃酒精灯加热试管到 60 ℃ 以上，观察产生有刺激性气味的气体',
          hint: '工具栏点「点燃」，再点酒精灯，把试管放到火焰上方；2NH₄Cl + Ca(OH)₂ = CaCl₂ + 2NH₃↑ + 2H₂O',
          check: function (w) { return fired(w, 'nh4cl_caoh2'); }
        },
        {
          text: '用导管把氨气导入盛有蒸馏水的集气瓶中，观察氨极易溶于水',
          hint: '工具栏点「连接」，先点导管再点试管，然后再点一次导管、点集气瓶；NH₃ + H₂O = NH₃·H₂O',
          check: function (w) { return fired(w, 'nh3_h2o'); }
        },
        {
          text: '用 pH 试纸检验集气瓶中氨水的酸碱性，确认氨水显碱性',
          hint: '工具栏点「检验」，再点集气瓶，选「pH 试纸」；氨水 pH ≈ 11，能使酚酞变红、石蕊变蓝',
          check: function (w) { return testDone(w, 'phPaper'); }
        },
        {
          text: '把氨气与氯化氢气体混合，观察产生大量白烟',
          hint: hintOf('hcl_g', '氯化氢气体') + '（在"气体"货架）；NH₃ + HCl = NH₄Cl，白烟是氯化铵固体小颗粒',
          check: function (w) { return fired(w, 'nh3_hcl'); }
        },
        {
          text: '向最后一支试管中加入氨水，再滴入无色酚酞溶液，观察变红',
          hint: hintOf('nh3h2o', '氨水') + ' + ' + hintOf('phenolphthalein', '无色酚酞溶液') + '；这也是检验氨气（碱性气体）的简易方法',
          check: function (w) { return fired(w, 'nh3_h2o'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 3 */
    {
      id: 'tb-sulfur',
      level: 'senior',
      name: '二氧化硫的性质',
      chapter: '必修第二册 · 第五章 化工生产中的重要非金属元素',
      goal: '认识二氧化硫的酸性、还原性和漂白性，理解它对环境的危害与治理。',
      intro: '二氧化硫是酸性氧化物，溶于水生成亚硫酸；'
        + '其中硫为 +4 价，既有氧化性又有还原性，能被氯水、溴水、高锰酸钾等氧化剂氧化；'
        + '二氧化硫还能使品红褪色（漂白性），加热后又恢复原色。',
      principle: [
        'Na₂SO₃ + H₂SO₄ = Na₂SO₄ + SO₂↑ + H₂O',
        'SO₂ + H₂O = H₂SO₃',
        'SO₂ + Br₂ + 2H₂O = H₂SO₄ + 2HBr',
        'SO₂ + 2NaOH = Na₂SO₃ + H₂O'
      ],
      setup: [
        at('beakerSmall', 300, 0),
        at('testTube', 660, 0),
        at('testTube', 930, 0)
      ],
      steps: [
        {
          text: '向小烧杯中加入少量亚硫酸钠，再加入稀硫酸，观察产生有刺激性气味的气体',
          hint: hintOf('na2so3', '亚硫酸钠') + ' + ' + hintOf('h2so4', '稀硫酸') + '；Na₂SO₃ + H₂SO₄ = Na₂SO₄ + SO₂↑ + H₂O，这是实验室制二氧化硫的方法',
          check: function (w) { return fired(w, 'na2so3_h2so4'); }
        },
        {
          text: '向小烧杯中加入蒸馏水，让二氧化硫溶于水，得到亚硫酸',
          hint: hintOf('h2o', '蒸馏水') + '；SO₂ + H₂O = H₂SO₃',
          check: function (w) { return fired(w, 'so2_h2o'); }
        },
        {
          text: '用 pH 试纸检验亚硫酸溶液，确认它显酸性',
          hint: '工具栏点「检验」，再点小烧杯，选「pH 试纸」；SO₂ 溶于水显酸性，这是"酸性氧化物"的典型性质',
          check: function (w) { return testDone(w, 'phPaper'); }
        },
        {
          text: '向第二支试管中加入少量亚硫酸钠，再滴入稀硫酸（在管内制取二氧化硫）',
          hint: hintOf('na2so3', '亚硫酸钠') + ' + ' + hintOf('h2so4', '稀硫酸') + '；SO₂ 极易溶于水，用"边制边用"的办法才能让它接触到另一支试管里的试剂',
          check: function (w) { return fired(w, 'na2so3_h2so4') || fired(w, 'so2_naoh'); }
        },
        {
          text: '向第一支试管中加入少量溴水，再向其中加入亚硫酸钠和稀硫酸，观察溴水褪色',
          hint: hintOf('br2', '溴水') + '（在"液体药品"里）+ ' + hintOf('na2so3', '亚硫酸钠') + ' + ' + hintOf('h2so4', '稀硫酸') + '；SO₂ + Br₂ + 2H₂O = H₂SO₄ + 2HBr，说明 SO₂ 具有还原性',
          check: function (w) { return fired(w, 'so2_br2_h2o'); }
        },
        {
          text: '向第二支试管中加入氢氧化钠溶液，再把新制的二氧化硫通入其中（尾气吸收）',
          hint: hintOf('naohaq', '氢氧化钠溶液') + '；SO₂ + 2NaOH = Na₂SO₃ + H₂O，实验室多余的二氧化硫必须用碱液吸收',
          check: function (w) { return fired(w, 'so2_naoh') || fired(w, 'na2so3_h2so4') && liquidOf(w, 'naoh') > 0.5; }
        },
        {
          text: '用紫色石蕊试纸检验二氧化硫气体，观察试纸变红',
          hint: '工具栏点「检验」，再点含二氧化硫的小烧杯，选「紫色石蕊试纸」；变红说明它是酸性气体（SO₂ 不能使石蕊褪色，只能使品红褪色）',
          check: function (w) { return testDone(w, 'litmusPaper'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 4 */
    {
      id: 'tb-nitric',
      level: 'senior',
      name: '硝酸的性质',
      chapter: '必修第二册 · 第五章 化工生产中的重要非金属元素',
      goal: '通过铜与浓硝酸、稀硝酸的对比实验，认识硝酸的强氧化性和不同浓度的还原产物。',
      intro: '浓硝酸与铜反应生成红棕色的二氧化氮，稀硝酸与铜反应生成无色的 NO，'
        + 'NO 遇空气立即变成红棕色的 NO₂。硝酸不论浓稀都有强氧化性，'
        + '而且浓度越大氧化性越强，还原产物中氮的化合价越高。',
      principle: [
        'Cu + 4HNO₃ = Cu(NO₃)₂ + 2NO₂↑ + 2H₂O',
        '3Cu + 8HNO₃ = 3Cu(NO₃)₂ + 2NO↑ + 4H₂O',
        '2NO + O₂ = 2NO₂',
        '3NO₂ + H₂O = 2HNO₃ + NO'
      ],
      setup: [
        at('testTube', 280, 0),
        at('testTube', 640, 0),
        at('gasJar', 1020, 0)
      ],
      steps: [
        {
          text: '向第一支试管中加入铜片和浓硝酸，观察剧烈反应并放出红棕色气体',
          hint: hintOf('cu', '铜片') + ' + ' + hintOf('hno3_conc', '浓硝酸') + '；Cu + 4HNO₃ = Cu(NO₃)₂ + 2NO₂↑ + 2H₂O',
          check: function (w) { return fired(w, 'cu_hno3_conc'); }
        },
        {
          text: '向第二支试管中加入铜片和稀硝酸，观察缓慢产生无色气体、溶液变蓝',
          hint: hintOf('cu', '铜片') + ' + ' + hintOf('hno3aq', '稀硝酸') + '；3Cu + 8HNO₃ = 3Cu(NO₃)₂ + 2NO↑ + 4H₂O',
          check: function (w) { return fired(w, 'cu_hno3_dilute'); }
        },
        {
          text: '向集气瓶中通入一氧化氮和氧气，观察气体变成红棕色',
          hint: hintOf('no', '一氧化氮') + ' + ' + hintOf('o2', '氧气') + '；2NO + O₂ = 2NO₂，红棕色是 NO₂ 的颜色',
          check: function (w) { return fired(w, 'no_o2'); }
        },
        {
          text: '向集气瓶中加入少量水，观察红棕色气体消失、液面上升',
          hint: hintOf('h2o', '蒸馏水') + '；3NO₂ + H₂O = 2HNO₃ + NO，这是工业制硝酸的重要一步',
          check: function (w) { return fired(w, 'no2_h2o'); }
        },
        {
          text: '用 pH 试纸检验集气瓶中溶液（硝酸溶液）的酸性',
          hint: '工具栏点「检验」，再点集气瓶，选「pH 试纸」；NO₂ 与水反应生成的硝酸显强酸性',
          check: function (w) { return testDone(w, 'phPaper'); }
        },
        {
          text: '向第一支试管中加入氢氧化钠溶液，吸收残余的二氧化氮尾气',
          hint: hintOf('naohaq', '氢氧化钠溶液') + '；2NO₂ + 2NaOH = NaNO₃ + NaNO₂ + H₂O，氮的氧化物尾气要用碱液吸收',
          check: function (w) { return fired(w, 'no2_naoh'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 5 */
    {
      id: 'tb-aluminum',
      level: 'senior',
      name: '铝及其化合物的性质',
      chapter: '必修第一册 · 第三章 铁 金属材料',
      goal: '认识铝、氧化铝、氢氧化铝的两性，掌握"铝三角"之间的转化。',
      intro: '铝既能与酸反应，又能与强碱溶液反应放出氢气，这是铝"两性"的体现。'
        + '氢氧化铝是两性氢氧化物：既能溶于强酸，又能溶于强碱。'
        + '实验室常用铝盐与氨水反应制取氢氧化铝，因为氨水是弱碱，不会使 Al(OH)₃ 溶解。',
      principle: [
        '2Al + 2NaOH + 2H₂O = 2NaAlO₂ + 3H₂↑',
        'Al₂O₃ + 2NaOH = 2NaAlO₂ + H₂O',
        'Al(OH)₃ + NaOH = NaAlO₂ + 2H₂O',
        'AlCl₃ + 3NH₃·H₂O = Al(OH)₃↓ + 3NH₄Cl'
      ],
      setup: [
        at('beakerSmall', 280, 46),
        at('testTube', 620, 0),
        at('testTube', 900, 0),
        at('alcoholLamp', 280, 0)
      ],
      steps: [
        {
          text: '向小烧杯中加入氢氧化钠溶液，再放入铝片，观察产生大量气泡',
          hint: hintOf('naohaq', '氢氧化钠溶液') + ' + ' + hintOf('al', '铝片') + '；2Al + 2NaOH + 2H₂O = 2NaAlO₂ + 3H₂↑，说明铝能与强碱溶液反应',
          check: function (w) { return fired(w, 'al_naoh'); }
        },
        {
          text: '向小烧杯中加入少量氧化铝，加热到 60 ℃ 以上，观察白色固体溶解',
          hint: hintOf('al2o3', '氧化铝') + '；用「点燃」点酒精灯加热，Al₂O₃ + 2NaOH = 2NaAlO₂ + H₂O，说明氧化铝是两性氧化物',
          check: function (w) { return fired(w, 'al2o3_naoh'); }
        },
        {
          text: '向小烧杯中加入铝片和氢氧化钠溶液（反应较慢，可适当加热）',
          hint: hintOf('naohaq', '氢氧化钠溶液') + ' + ' + hintOf('al', '铝片') + '；先加碱再加铝，观察铝片表面产生气泡并逐渐溶解',
          check: function (w) { return fired(w, 'al_naoh') && liquidOf(w, 'naoh') > 0.2; }
        },
        {
          text: '向第一支试管中加入氯化铝溶液，再滴入氨水，观察生成白色胶状沉淀',
          hint: hintOf('alcl3', '氯化铝溶液') + ' + ' + hintOf('nh3h2o', '氨水') + '；AlCl₃ + 3NH₃·H₂O = Al(OH)₃↓ + 3NH₄Cl（用氨水而不用 NaOH，避免沉淀溶解）',
          check: function (w) { return fired(w, 'alcl3_nh3h2o'); }
        },
        {
          text: '再向第一支试管中加入氢氧化钠溶液，观察白色沉淀溶解',
          hint: hintOf('naohaq', '氢氧化钠溶液') + '；Al(OH)₃ + NaOH = NaAlO₂ + 2H₂O，沉淀溶解说明 Al(OH)₃ 具有两性',
          check: function (w) { return fired(w, 'aloh3_naoh'); }
        },
        {
          text: '用 pH 试纸检验第一支试管中的溶液（偏铝酸钠溶液显碱性）',
          hint: '工具栏点「检验」，再点第一支试管，选「pH 试纸」；NaAlO₂ 是强碱弱酸盐，溶液显碱性',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 6 */
    {
      id: 'tb-silicon',
      level: 'senior',
      name: '硅与硅酸盐的性质',
      chapter: '必修第二册 · 第五章 化工生产中的重要非金属元素',
      goal: '认识二氧化硅、硅酸钠的性质，理解"强酸制弱酸"在硅酸制备中的应用。',
      intro: '二氧化硅是酸性氧化物，能与强碱溶液反应生成硅酸钠（水玻璃）；'
        + '硅酸的酸性比碳酸还弱，所以向硅酸钠溶液中通入二氧化碳或加入盐酸都能制得硅酸。'
        + '硅不溶于水，但能与强碱溶液反应放出氢气。',
      principle: [
        'SiO₂ + 2NaOH = Na₂SiO₃ + H₂O',
        'Na₂SiO₃ + 2HCl = H₂SiO₃↓ + 2NaCl',
        'Na₂SiO₃ + CO₂ + H₂O = H₂SiO₃↓ + Na₂CO₃',
        'Si + 2NaOH + H₂O = Na₂SiO₃ + 2H₂↑'
      ],
      setup: [
        at('beakerSmall', 300, 46),
        at('testTube', 660, 0),
        at('testTube', 920, 0),
        at('alcoholLamp', 300, 0)
      ],
      steps: [
        {
          text: '向小烧杯中加入少量二氧化硅，再加入氢氧化钠溶液，加热到 60 ℃ 以上',
          hint: hintOf('sio2', '二氧化硅') + ' + ' + hintOf('naohaq', '氢氧化钠溶液') + '；用「点燃」点酒精灯加热，SiO₂ + 2NaOH = Na₂SiO₃ + H₂O',
          check: function (w) { return fired(w, 'sio2_naoh'); }
        },
        {
          text: '观察白色固体逐渐溶解，得到黏稠的硅酸钠溶液（水玻璃）',
          hint: '硅酸钠俗名"泡花碱 / 水玻璃"，是矿物胶；试剂瓶要用橡胶塞，不能用玻璃塞',
          check: function (w) { return any(w, 'na2sio3'); }
        },
        {
          text: '向第一支试管中加入硅酸钠溶液，再滴入稀盐酸，观察生成白色胶状沉淀',
          hint: hintOf('na2sio3', '硅酸钠溶液') + ' + ' + hintOf('hcl', '稀盐酸') + '；Na₂SiO₃ + 2HCl = H₂SiO₃↓ + 2NaCl',
          check: function (w) { return fired(w, 'na2sio3_hcl'); }
        },
        {
          text: '向第二支试管中加入硅酸钠溶液，通入二氧化碳，观察出现白色沉淀',
          hint: hintOf('co2', '二氧化碳') + '；Na₂SiO₃ + CO₂ + H₂O = H₂SiO₃↓ + Na₂CO₃，说明硅酸的酸性比碳酸弱',
          check: function (w) { return fired(w, 'na2sio3_co2'); }
        },
        {
          text: '用 pH 试纸检验硅酸钠溶液，确认它显碱性',
          hint: '工具栏点「检验」，再点装有硅酸钠溶液的试管，选「pH 试纸」；硅酸钠是强碱弱酸盐，溶液显碱性（所以不能用玻璃塞）',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 7 */
    {
      id: 'tb-battery',
      level: 'senior',
      name: '原电池原理',
      chapter: '选择性必修1 · 第四章 化学反应与电能',
      goal: '通过锌铜稀硫酸原电池，认识原电池的构成条件：两个活泼性不同的电极、电解质溶液、闭合回路。',
      intro: '原电池把化学能转化为电能。锌比铜活泼，锌失去电子被氧化（负极），'
        + '铜片上 H⁺ 得到电子被还原（正极放出氢气），电子由锌经导线流向铜。'
        + '如果用石墨电极代替铜片，效果相同——关键是两个电极的活泼性不同。',
      principle: [
        '负极：Zn - 2e⁻ = Zn²⁺（Zn + 2HCl = ZnCl₂ + H₂↑）',
        '正极：2H⁺ + 2e⁻ = H₂↑',
        '铜与稀盐酸不反应（Cu 排在氢的后面）'
      ],
      setup: [
        at('testTube', 280, 0),
        at('testTube', 620, 0),
        at('testTube', 960, 0)
      ],
      steps: [
        {
          text: '向第一支试管中加入稀盐酸，再放入锌粒和石墨电极，观察锌粒溶解、石墨电极上有气泡',
          hint: hintOf('zn', '锌粒') + ' + ' + hintOf('graphite', '石墨电极') + '；Zn + 2HCl = ZnCl₂ + H₂↑，锌失电子作负极',
          check: function (w) { return fired(w, 'zn_hcl') && any(w, 'graphite'); }
        },
        {
          text: '向第二支试管中加入稀盐酸，再放入铜片，观察铜片表面没有气泡',
          hint: hintOf('cu', '铜片') + ' + ' + hintOf('hcl', '稀盐酸') + '；铜排在氢的后面，不能置换出氢气——所以原电池里铜只能作正极',
          check: function (w) { return any(w, 'cu') && liquidOf(w, 'hcl') > 0.5; }
        },
        {
          text: '向第一支试管中补加一次稀盐酸，让锌粒持续溶解',
          hint: hintOf('hcl', '稀盐酸') + '；负极上锌失电子，正极上 H⁺ 得电子生成氢气',
          /* 锌粒会被酸消耗掉，所以看"反应发生过的痕迹 + 盐酸还在"，而不是"锌还在" */
          check: function (w) { return fired(w, 'zn_hcl') && liquidOf(w, 'hcl') > 0.5; }
        },
        {
          text: '用 pH 试纸检验第二支试管中的稀盐酸，确认电解质溶液显酸性',
          hint: '工具栏点「检验」，再点第二支试管，选「pH 试纸」；原电池必须有能导电的电解质溶液',
          check: function (w) { return testDone(w, 'phPaper'); }
        },
        {
          text: '向第三支试管中加入氢氧化钠溶液，用 pH 试纸检验，与酸性溶液对比',
          hint: hintOf('naohaq', '氢氧化钠溶液') + '，再用工具栏「检验」→「pH 试纸」；同样是电解质溶液，pH 却完全不同',
          check: function (w) { return fired(w, 'phenolphthalein_naoh') || liquidOf(w, 'naoh') > 0.5; }
        }
      ]
    },

    /* ------------------------------------------------------------ 8 */
    {
      id: 'tb-sugar',
      level: 'senior',
      name: '葡萄糖的检验与淀粉的性质',
      chapter: '选择性必修3 · 第四章 生物大分子',
      goal: '用新制氢氧化铜和银氨溶液检验葡萄糖（醛基），用碘水检验淀粉。',
      intro: '葡萄糖分子中含有醛基，具有还原性：'
        + '与新制氢氧化铜共热生成砖红色的 Cu₂O 沉淀，与银氨溶液共热水浴生成光亮的银镜。'
        + '淀粉遇碘单质变蓝，可用于检验淀粉或碘。淀粉本身没有还原性，'
        + '但水解后生成的葡萄糖可以发生上述反应。',
      principle: [
        'C₆H₁₂O₆ + 2Cu(OH)₂ = C₆H₁₂O₇ + Cu₂O↓ + 2H₂O',
        'C₆H₁₂O₆ + 2Ag(NH₃)₂OH = C₆H₁₂O₇ + 2Ag↓ + 4NH₃↑ + H₂O',
        '2NaOH + CuSO₄ = Cu(OH)₂↓ + Na₂SO₄',
        '(C₆H₁₀O₅)n + nH₂O = nC₆H₁₂O₆'
      ],
      setup: [
        at('testTube', 260, 46),
        at('testTube', 560, 46),
        at('testTube', 840, 46),
        at('testTube', 1080, 46),
        at('alcoholLamp', 260, 0),
        at('alcoholLamp', 560, 0),
        at('alcoholLamp', 1080, 0)
      ],
      steps: [
        {
          text: '向第一支试管中加入氢氧化钠溶液和硫酸铜溶液，制得新制氢氧化铜',
          hint: hintOf('naohaq', '氢氧化钠溶液') + ' + ' + hintOf('cuso4', '硫酸铜溶液') + '；2NaOH + CuSO₄ = Cu(OH)₂↓ + Na₂SO₄，出现蓝色絮状沉淀',
          check: function (w) { return fired(w, 'naoh_cuso4'); }
        },
        {
          text: '向第一支试管中加入少量葡萄糖，点燃它下方的酒精灯加热，观察出现砖红色沉淀',
          hint: hintOf('c6h12o6', '葡萄糖') + '；工具栏「点燃」点第一支试管下面的酒精灯加热，C₆H₁₂O₆ + 2Cu(OH)₂ = C₆H₁₂O₇ + Cu₂O↓ + 2H₂O，砖红色沉淀是 Cu₂O',
          check: function (w) { return fired(w, 'glucose_cuoh2'); }
        },
        {
          text: '向第二支试管中加入少量葡萄糖和银氨溶液，点燃它下方的酒精灯加热，观察管壁出现光亮银镜',
          hint: hintOf('c6h12o6', '葡萄糖') + ' + ' + hintOf('agnh32oh', '银氨溶液') + '；用「点燃」点第二支试管下面的酒精灯，C₆H₁₂O₆ + 2Ag(NH₃)₂OH = C₆H₁₂O₇ + 2Ag↓ + 4NH₃↑ + H₂O',
          check: function (w) { return fired(w, 'glucose_tollens'); }
        },
        {
          text: '用 pH 试纸检验第一支试管中的溶液（葡萄糖溶液接近中性）',
          hint: '工具栏点「检验」，再点第一支试管，选「pH 试纸」；可以通过 pH 判断碱性条件是否合适（银镜反应要在碱性条件下进行）',
          check: function (w) { return testDone(w, 'phPaper'); }
        },
        {
          text: '向第三支试管中加入淀粉溶液和少量碘，观察溶液变蓝',
          hint: hintOf('starch', '淀粉溶液') + '（在"有机化合物"货架）+ ' + hintOf('i2', '碘') + '；淀粉遇碘变蓝，这是检验淀粉或碘的特征反应',
          check: function (w) { return fired(w, 'starch_i2'); }
        },
        {
          text: '向第四支试管中加入淀粉溶液和稀硫酸，点燃下方酒精灯加热使其水解',
          hint: hintOf('starch', '淀粉溶液') + ' + ' + hintOf('h2so4', '稀硫酸') + '，再用「点燃」点第四支试管下面的酒精灯；(C₆H₁₀O₅)n + nH₂O = nC₆H₁₂O₆，稀硫酸是催化剂',
          check: function (w) { return fired(w, 'starch_hydrolysis'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 9 */
    {
      id: 'tb-ion-reaction',
      level: 'senior',
      name: '离子反应与离子方程式',
      chapter: '必修第一册 · 第一章 物质及其变化',
      goal: '通过溶液之间的反应认识离子反应，学会书写离子方程式并判断离子能否大量共存。',
      intro: '电解质在水溶液中电离出自由移动的离子，'
        + '当某些离子结合生成沉淀、气体或水时，反应就发生了，这就是离子反应。'
        + '离子方程式能够表示同一类反应的实质，例如所有强酸与强碱的中和反应都可以写成 H⁺ + OH⁻ = H₂O。',
      principle: [
        'NaOH + HCl = NaCl + H₂O',
        'Cu(OH)₂ + 2HCl = CuCl₂ + 2H₂O',
        '3NaOH + FeCl₃ = Fe(OH)₃↓ + 3NaCl',
        'Cu + 4HNO₃ = Cu(NO₃)₂ + 2NO₂↑ + 2H₂O',
        'AgNO₃ + NaCl = AgCl↓ + NaNO₃',
        'BaCl₂ + Na₂SO₄ = BaSO₄↓ + 2NaCl'
      ],
      setup: [
        at('beakerSmall', 300, 0),
        at('testTube', 660, 0),
        at('testTube', 920, 0),
        at('testTube', 1140, 0)
      ],
      steps: [
        {
          text: '向小烧杯中加入硫酸铜溶液，再滴入氢氧化钠溶液，观察产生蓝色絮状沉淀',
          hint: hintOf('cuso4', '硫酸铜溶液') + ' + ' + hintOf('naohaq', '氢氧化钠溶液') + '；2NaOH + CuSO₄ = Cu(OH)₂↓ + Na₂SO₄',
          check: function (w) { return fired(w, 'naoh_cuso4'); }
        },
        {
          text: '向小烧杯中加入稀盐酸，观察蓝色沉淀溶解，溶液变为蓝绿色',
          hint: hintOf('hcl', '稀盐酸') + '；Cu(OH)₂ + 2HCl = CuCl₂ + 2H₂O',
          check: function (w) { return fired(w, 'cuoh2_hcl'); }
        },
        {
          text: '向第一支试管中加入氯化铁溶液和氢氧化钠溶液，观察产生红褐色沉淀',
          hint: '先取黄色溶液（或用' + hintOf('fe', '铁钉') + '与' + hintOf('hcl', '稀盐酸') + '反应制得），再加' + hintOf('naohaq', '氢氧化钠溶液') + '；3NaOH + FeCl₃ = Fe(OH)₃↓ + 3NaCl',
          check: function (w) { return fired(w, 'naoh_fecl3'); }
        },
        {
          text: '向第二支试管中加入铜片和浓硝酸，观察放出红棕色气体',
          hint: hintOf('cu', '铜片') + ' + ' + hintOf('hno3_conc', '浓硝酸') + '；Cu + 4HNO₃ = Cu(NO₃)₂ + 2NO₂↑ + 2H₂O，红棕色气体是 NO₂',
          check: function (w) { return fired(w, 'cu_hno3_conc'); }
        },
        {
          text: '用 pH 试纸检验小烧杯中反应后的溶液',
          hint: '工具栏点「检验」，再点小烧杯，选「pH 试纸」；可通过 pH 判断中和反应是否恰好完成',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    },

    /* ----------------------------------------------------------- 10 */
    {
      id: 'tb-rate',
      level: 'senior',
      name: '影响化学反应速率的因素',
      chapter: '选择性必修1 · 第二章 化学反应速率与化学平衡',
      goal: '通过对比实验探究浓度、温度、催化剂对化学反应速率的影响。',
      intro: '其他条件相同时：增大反应物浓度、升高温度、使用合适的催化剂，都能加快反应速率。'
        + '固体反应物的表面积越大，与反应物的接触越充分，反应也越快。'
        + '本实验用产生气泡的快慢（或固体溶解的快慢）来定性比较反应速率。',
      principle: [
        'Fe + 2HCl = FeCl₂ + H₂↑',
        'Mg + 2HCl = MgCl₂ + H₂↑',
        'Cu + 4HNO₃ = Cu(NO₃)₂ + 2NO₂↑ + 2H₂O',
        '2Cu + O₂ = 2CuO',
        'CuO + 2HCl = CuCl₂ + H₂O'
      ],
      setup: [
        at('testTube', 200, 0),
        at('testTube', 380, 0),
        at('testTube', 560, 46),
        at('testTube', 760, 0),
        at('testTube', 960, 0),
        at('alcoholLamp', 560, 0)
      ],
      steps: [
        {
          text: '向第一支试管中加入铁钉和稀盐酸，观察产生气泡（记录快慢）',
          hint: hintOf('fe', '铁钉') + ' + ' + hintOf('hcl', '稀盐酸') + '；Fe + 2HCl = FeCl₂ + H₂↑，观察气泡产生的快慢',
          check: function (w) { return fired(w, 'fe_hcl'); }
        },
        {
          text: '向第二支试管中加入铁钉，再滴入浓盐酸（浓度更大），对比气泡产生的快慢',
          hint: hintOf('hcl_conc', '浓盐酸') + '（在"液体药品"里）；浓度越大，单位体积内活化分子数越多，反应越快',
          check: function (w) { return fired(w, 'fe_hcl') && any(w, 'hcl_conc'); }
        },
        {
          text: '向第三支试管中加入铁钉和稀盐酸，点燃酒精灯加热到 60 ℃ 以上，观察反应明显加快',
          hint: '工具栏点「点燃」点酒精灯，把第三支试管放到火焰上方；温度越高反应越快，这是浓度、温度两个变量对比实验',
          /* 只看温度——铁钉会被盐酸消耗掉，要求"铁钉还在 + 温度达标"这一格就点不亮 */
          check: function (w) {
            var hot = false;
            cs(w).forEach(function (c) { if (c.temp >= 60) hot = true; });
            return hot && fired(w, 'fe_hcl');
          }
        },
        {
          text: '向第四支试管中加入镁条和稀盐酸，对比铁与盐酸反应的快慢',
          hint: hintOf('mg', '镁条') + ' + ' + hintOf('hcl', '稀盐酸') + '；Mg + 2HCl = MgCl₂ + H₂↑，反应物本身的性质是决定反应速率的首要因素',
          check: function (w) { return fired(w, 'mg_hcl'); }
        },
        {
          text: '向第五支试管中加入氧化铜和稀盐酸，观察黑色粉末溶解的快慢',
          hint: hintOf('cuo', '氧化铜') + ' + ' + hintOf('hcl', '稀盐酸') + '；CuO + 2HCl = CuCl₂ + H₂O，固体表面积越大（粉末比块状）反应越快',
          check: function (w) { return fired(w, 'cuo_hcl'); }
        },
        {
          text: '用 pH 试纸检验第二支试管反应后的溶液，比较浓度对反应程度的影响',
          hint: '工具栏点「检验」，再点第二支试管，选「pH 试纸」；同时可通过实验记录里的现象比较各支试管的反应快慢',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    }
  ];

  CHEM.registerExperiments(LIST);
})(typeof window !== 'undefined' ? window : globalThis);
