/* =============================================================================
 * 虚拟化学实验室 —— 高中引导实验任务
 * -----------------------------------------------------------------------------
 * 通过 CHEM.registerExperiments 追加，每条任务带 level: 'senior'。
 * 结构（与初中任务一致）：
 *   setup   [{type, x, y}]              自动摆好的仪器（y 用 benchY 偏移）
 *   steps   [{text, hint, check(world)}] 完成一步就做一个勾
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});
  var BENCH = CHEM.SCENE ? CHEM.SCENE.benchY : 566;

  /* ---------- 查询工具 ---------- */
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

  /* =====================================================================
   * 任务列表
   * ================================================================== */
  var EXPERIMENTS = [

    /* ---------------------------------------------------------------- 1 */
    {
      id: 'senior-sodium',
      level: 'senior',
      name: '钠及其化合物的性质',
      chapter: '必修第一册 · 第二章 海水中的重要元素——钠和氯',
      goal: '观察钠与水、钠与氧气、过氧化钠与水的反应，掌握钠及其化合物的典型性质。',
      principle: ['2Na + 2H₂O = 2NaOH + H₂↑', '2Na + O₂ = Na₂O₂', '2Na₂O₂ + 2H₂O = 4NaOH + O₂↑'],
      intro: '钠是活泼金属，密度比水小、熔点低。钠与水反应生成氢氧化钠和氢气，因此滴有酚酞的水会变红；钠在空气中燃烧生成淡黄色的过氧化钠。',
      setup: [
        at('beakerSmall', 340, 0),
        at('testTube', 570, 0),
        at('combustionSpoon', 780, 0),
        at('evaporatingDish', 960, 0)
      ],
      steps: [
        {
          text: '向小烧杯中加入约 30 mL 蒸馏水',
          hint: '药品架 → 液体药品 → 蒸馏水（可以连续加几次）',
          check: function (w) { return liquidOf(w, 'h2o') >= 18; }
        },
        {
          text: '滴入几滴无色酚酞溶液',
          hint: '药品架 → 指示剂 / 试纸 → 无色酚酞溶液',
          check: function (w) { return any(w, 'phenolphthalein'); }
        },
        {
          text: '加入一小块金属钠，观察"浮、熔、游、响、红"',
          hint: '药品架 → 金属单质 → 钠；现象：钠浮在水面、熔成小球、四处游动、发出嘶嘶声，溶液变红',
          check: function (w) { return fired(w, 'na_h2o'); }
        },
        {
          text: '向试管中加入过氧化钠，再加水，用带火星的木条检验放出的气体',
          hint: '过氧化钠在固体药品里；加水后产生氧气，用工具栏「检验」→「带火星的木条」',
          check: function (w) { return fired(w, 'na2o2_h2o') && testDone(w, 'glowingSplint'); }
        },
        {
          text: '把少量钠放在蒸发皿里，通入氧气后点燃，观察黄色火焰和淡黄色固体',
          hint: '钠 + 氧气（或空气）→ 点燃；生成淡黄色的过氧化钠',
          check: function (w) { return fired(w, 'na_o2_ignite'); }
        }
      ]
    },

    /* ---------------------------------------------------------------- 2 */
    {
      id: 'senior-chlorine',
      level: 'senior',
      name: '氯气的性质与氯水的成分',
      chapter: '必修第一册 · 第二章 海水中的重要元素——钠和氯',
      goal: '研究氯气与水和碱的反应，理解新制氯水的成分与漂白原理。',
      principle: ['Cl₂ + H₂O = HCl + HClO', 'Cl₂ + 2NaOH = NaCl + NaClO + H₂O', 'Cl₂ + 2KI = 2KCl + I₂'],
      intro: '氯气溶于水部分与水反应：Cl₂ + H₂O ⇌ HCl + HClO，生成的次氯酸有强氧化性和漂白性，见光会分解。所以氯水要现配现用，实验室多余的氯气必须用氢氧化钠溶液吸收。',
      setup: [
        at('gasJar', 320, 0),
        at('testTube', 570, 0),
        at('testTube', 790, 0)
      ],
      steps: [
        {
          text: '向集气瓶中加入约 20 mL 蒸馏水，再通入氯气，观察氯水的颜色',
          hint: '先加蒸馏水，再通入氯气；氯水呈浅黄绿色',
          check: function (w) { return fired(w, 'cl2_h2o'); }
        },
        {
          text: '用 pH 试纸检验新制氯水的酸碱性',
          hint: '工具栏「检验」→「pH 试纸」；氯水显酸性',
          check: function (w) { return testDone(w, 'phPaper'); }
        },
        {
          text: '向一支试管中加入碘化钾溶液，通入氯气，观察溶液变黄',
          hint: 'Cl₂ 能把 I⁻ 氧化成 I₂，说明氯的非金属性比碘强',
          check: function (w) { return fired(w, 'cl2_ki'); }
        },
        {
          text: '向另一支试管中加入氢氧化钠溶液并通入氯气（尾气吸收）',
          hint: 'Cl₂ + 2NaOH = NaCl + NaClO + H₂O，这是实验室处理尾气的方法',
          check: function (w) { return fired(w, 'cl2_naoh'); }
        }
      ]
    },

    /* ---------------------------------------------------------------- 3 */
    {
      id: 'senior-volumetric',
      level: 'senior',
      name: '配制一定物质的量浓度的溶液',
      chapter: '必修第一册 · 第二章 第三节 物质的量',
      goal: '学会容量瓶的使用：溶解、转移、洗涤、定容。',
      principle: ['n = m / M', 'c = n / V'],
      intro: '容量瓶是配制准确浓度溶液的仪器，只有一个刻度线。不能在容量瓶里溶解固体，也不能加热。流程是：计算 → 称量 → 溶解（烧杯中，冷却）→ 转移（玻璃棒引流）→ 洗涤 → 定容 → 摇匀。',
      setup: [
        at('beakerSmall', 340, 0),
        at('volumetricFlask', 660, 0)
      ],
      steps: [
        {
          text: '向小烧杯中加入少量氯化钠固体',
          hint: '药品架 → 固体药品 → 氯化钠',
          check: function (w) { return any(w, 'nacl'); }
        },
        {
          text: '加入约 30 mL 蒸馏水，用玻璃棒搅拌，使氯化钠完全溶解',
          hint: '工具栏「搅拌」可以加快溶解；溶解不能在容量瓶里进行',
          check: function (w) { return dissolved(w, 'nacl'); }
        },
        {
          text: '把烧杯中的溶液转移到容量瓶中',
          hint: '工具栏「倾倒」，先点烧杯再点容量瓶；或用「倒入其它容器」按钮',
          check: function (w) {
            return byType(w, 'volumetricFlask').some(function (c) { return c.liquidVolume() > 1; });
          }
        },
        {
          text: '继续向容量瓶中加入蒸馏水，直到液面接近刻度线（约 100 mL）',
          hint: '最后一两毫升要用胶头滴管，使凹液面最低处与刻度线相平',
          check: function (w) {
            return byType(w, 'volumetricFlask').some(function (c) { return c.liquidVolume() >= 92; });
          }
        }
      ]
    },

    /* ---------------------------------------------------------------- 4 */
    {
      id: 'senior-organic',
      level: 'senior',
      name: '乙醇的催化氧化与酯化反应',
      chapter: '必修第二册 · 第七章 有机化合物',
      goal: '完成乙醇的催化氧化和乙酸乙酯的制备，体会有机反应的条件控制。',
      principle: ['2C₂H₅OH + O₂ = 2CH₃CHO + 2H₂O', 'CH₃COOH + C₂H₅OH = CH₃COOC₂H₅ + H₂O'],
      intro: '乙醇在铜或银的催化下被氧气氧化成乙醛；乙酸与乙醇在浓硫酸催化下发生酯化反应，生成有果香味的乙酸乙酯。两个反应都需要加热，但酯化反应必须用浓硫酸作催化剂和吸水剂。',
      setup: [
        /* 试管要抬到酒精灯火焰上方（抬高 46），否则会"站"在灯里 */
        at('testTube', 320, 46),
        at('testTube', 570, 46),
        at('alcoholLamp', 320, 0),
        at('alcoholLamp', 570, 0)
      ],
      steps: [
        {
          text: '向第一支试管中加入约 10 mL 乙醇',
          hint: '药品架 → 有机化合物 → 乙醇',
          check: function (w) { return liquidOf(w, 'c2h5oh') >= 6; }
        },
        {
          text: '加入铜片（催化剂）并通入氧气，点燃酒精灯加热，观察刺激性气味',
          hint: '2C₂H₅OH + O₂ --Cu/Δ--> 2CH₃CHO + 2H₂O；闻到刺激性气味说明生成了乙醛',
          check: function (w) { return fired(w, 'c2h5oh_o2_cu'); }
        },
        {
          text: '向第二支试管中加入乙酸、乙醇和浓硫酸',
          hint: '浓硫酸在药品架「液体药品」里，它在这里既是催化剂又是吸水剂',
          check: function (w) { return holdsAll(w, ['ch3cooh', 'c2h5oh', 'h2so4_conc']); }
        },
        {
          text: '加热第二支试管，观察生成有果香味的油状液体（乙酸乙酯）',
          hint: 'CH₃COOH + C₂H₅OH --浓硫酸/Δ--> CH₃COOC₂H₅ + H₂O',
          check: function (w) { return fired(w, 'ch3cooh_ester'); }
        }
      ]
    },

    /* ---------------------------------------------------------------- 5 */
    {
      id: 'senior-electrolysis',
      level: 'senior',
      name: '电解氯化铜溶液',
      chapter: '选择性必修1 · 第四章 化学反应与电能',
      goal: '通过电解氯化铜溶液认识电解原理：阳极发生氧化反应，阴极发生还原反应。',
      principle: ['CuCl₂ = Cu + Cl₂↑', 'CuO + 2HCl = CuCl₂ + H₂O'],
      intro: '氯化铜溶液中的 Cu²⁺ 在阴极得电子析出红色的铜，Cl⁻ 在阳极失电子生成黄绿色的氯气。用湿润的淀粉碘化钾试纸可以检验氯气。',
      setup: [
        at('beakerSmall', 420, 0),
        at('gasJar', 800, 0)
      ],
      steps: [
        {
          text: '向小烧杯中加入少量氧化铜固体',
          hint: '药品架 → 固体药品 → 氧化铜（黑色粉末）',
          check: function (w) { return any(w, 'cuo'); }
        },
        {
          text: '加入稀盐酸，制得蓝绿色的氯化铜溶液',
          hint: 'CuO + 2HCl = CuCl₂ + H₂O；溶液由无色变为蓝绿色',
          check: function (w) { return fired(w, 'cuo_hcl'); }
        },
        {
          text: '用工具栏「通电」给溶液通电，观察阴极析出红色的铜',
          hint: '阳极产生黄绿色气体，阴极析出红色的铜',
          check: function (w) { return fired(w, 'electrolysis_cucl2'); }
        },
        {
          text: '用湿润的淀粉碘化钾试纸检验阳极产生的气体',
          hint: '工具栏「检验」→「湿润的淀粉碘化钾试纸」；试纸变蓝说明生成了氯气',
          check: function (w) { return testDone(w, 'kiStarchPaper'); }
        }
      ]
    }
  ];

  CHEM.registerExperiments(EXPERIMENTS);
})(typeof window !== 'undefined' ? window : globalThis);
