/* =============================================================================
 * 虚拟化学实验室 —— 引导实验任务 (Experiments)
 * -----------------------------------------------------------------------------
 * 每个任务包含：
 *   id / name / goal / intro     标识与说明
 *   setup   [{type, x, y}]       自动摆好的仪器（y 用 benchY 偏移）
 *   preset  [{apparatus, id, amount}]  可选，预置药品
 *   steps   [{text, hint, check}] 步骤；check(world) 返回 true 即视为完成
 *
 * check 里可以用的 world：
 *   world.containers()              -> 所有容器
 *   c.hasBase('kmno4')              -> 容器中是否有某物质（用母体 id）
 *   c.firedRules['caco3_hcl']       -> 该容器中是否已发生某反应
 *   c.temp / c.gasVolume() / c.liquidVolume() / c.tests
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});
  var BENCH = CHEM.SCENE ? CHEM.SCENE.benchY : 566;

  /* ---------- 通用查询工具 ---------- */
  function cs(world) { return world.containers(); }
  function holders(world, base) { return cs(world).filter(function (c) { return c.hasBase(base); }); }
  function any(world, base) { return holders(world, base).length > 0; }
  function fired(world, ruleId) {
    return cs(world).some(function (c) { return !!c.firedRules[ruleId]; });
  }
  function firedInSame(world, ruleId, base) {
    return cs(world).some(function (c) { return !!c.firedRules[ruleId] && c.hasBase(base); });
  }
  function maxTemp(world, base) {
    var m = 0;
    holders(world, base).forEach(function (c) { if (c.temp > m) m = c.temp; });
    return m;
  }
  function totalGas(world, base) {
    var v = 0;
    cs(world).forEach(function (c) {
      c.gases.forEach(function (g) {
        var s = CHEM.getSub(g.id);
        if (s && s.base === base) v += g.ml;
      });
    });
    return v;
  }
  function testDone(world, id) {
    return cs(world).some(function (c) { return c.tests && c.tests[id]; });
  }
  function testOk(world, id) {
    return cs(world).some(function (c) { return c.tests && c.tests[id] && c.tests[id].ok; });
  }
  function liquidOf(world, base) {
    var v = 0;
    cs(world).forEach(function (c) {
      c.liquids.forEach(function (e) {
        var s = CHEM.getSub(e.id);
        if (s && s.base === base) v += e.ml;
      });
    });
    return v;
  }
  function countWith(world, base) { return holders(world, base).length; }
  function countLiquidWith(world, base) {
    return cs(world).filter(function (c) {
      return c.liquids.some(function (e) {
        var s = CHEM.getSub(e.id);
        return s && s.base === base;
      });
    }).length;
  }
  /* 曾经盛过某物质的容器数量。
     例如"向四支试管中各加入稀盐酸"，用户是一支一支加的：加完第一支后反应就开始
     消耗盐酸，若只看"当前还有没有"，等加完第四支时计数可能永远到不了 4。 */
  function countEverHad(world, base) {
    return cs(world).filter(function (c) { return c.everHadBase(base); }).length;
  }
  function pinkGone(world) {
    return cs(world).every(function (c) { return c.tint !== '#ff5f9e'; });
  }

  /* 摆位助手：dx 为水平坐标，up 为离台面的高度 */
  function at(type, x, up) { return { type: type, x: x, y: BENCH - (up || 0) }; }

  /* =====================================================================
   * 任务列表
   * ================================================================== */
  var EXPERIMENTS = [

    /* ---------------------------------------------------------------- 1 */
    {
      id: 'oxygen',
      name: '氧气的实验室制取与检验',
      chapter: '九年级上册 · 第二单元 我们周围的空气',
      goal: '用加热高锰酸钾的方法制取氧气，并用带火星的木条检验氧气的性质。',
      principle: ['2KMnO₄ = K₂MnO₄ + MnO₂ + O₂↑', 'C + O₂ = CO₂'],
      intro: '高锰酸钾是紫黑色固体，受热会分解出氧气。试管口通常要塞一团棉花，防止粉末进入导管。',
      setup: [
        at('testTube', 330, 46),
        at('alcoholLamp', 330, 0),
        at('testTubeRack', 1020, 0),
        at('gasJar', 720, 0)
      ],
      steps: [
        {
          text: '向试管中加入少量高锰酸钾（紫黑色固体）',
          hint: '药品架 → 固体药品 → 高锰酸钾',
          check: function (w) { return any(w, 'kmno4'); }
        },
        {
          text: '点燃酒精灯，把试管放在火焰上方加热到 120 ℃ 以上',
          hint: '工具栏点「点燃」，再点酒精灯；点「选择」拖动试管调整位置',
          /* 注意：不能写成"温度达标 且 容器里还有高锰酸钾" —— 温度一上来
             高锰酸钾就分解掉了，那一格永远点不亮。只判断有没有容器达到 120 ℃。 */
          check: function (w) {
            return cs(w).some(function (c) { return c.temp >= 120; });
          }
        },
        {
          text: '观察到试管中产生气体（氧气）',
          hint: '温度越高分解越快，收集到 4 mL 以上氧气即可',
          check: function (w) { return totalGas(w, 'o2') >= 4; }
        },
        {
          text: '用带火星的木条检验试管中的气体',
          hint: '工具栏点「检验」，再点装有氧气的容器，选择「带火星的木条」',
          check: function (w) { return testOk(w, 'glowingSplint'); }
        },
        {
          text: '把木炭放在氧气中燃烧，观察白光',
          hint: '把木炭加入有氧气的容器，然后用「点燃」点这个容器',
          check: function (w) { return fired(w, 'c_o2_full'); }
        }
      ]
    },

    /* ---------------------------------------------------------------- 2 */
    {
      id: 'carbonDioxide',
      name: '二氧化碳的制取与检验',
      chapter: '九年级上册 · 第六单元 碳和碳的氧化物',
      goal: '用大理石和稀盐酸制取二氧化碳，并用澄清石灰水检验二氧化碳。',
      principle: ['CaCO₃ + 2HCl = CaCl₂ + H₂O + CO₂↑', 'CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O'],
      intro: '实验室用大理石（主要成分碳酸钙）与稀盐酸反应制取二氧化碳，因为反应速率适中、便于控制。不能用稀硫酸，因为生成的硫酸钙微溶，会覆盖在大理石表面使反应很快停止。',
      setup: [
        at('testTube', 300, 0),
        at('testTube', 540, 0),
        at('deliveryTube', 1100, 250)
      ],
      steps: [
        {
          text: '向第一支试管中加入几块大理石',
          hint: '药品架 → 固体药品 → 大理石',
          check: function (w) { return any(w, 'caco3'); }
        },
        {
          text: '加入稀盐酸，观察试管中的现象',
          hint: '药品架 → 液体药品 → 稀盐酸；看到大量气泡和方程式即可',
          check: function (w) { return fired(w, 'caco3_hcl'); }
        },
        {
          text: '向第二支试管中加入澄清石灰水',
          hint: '药品架 → 液体药品 → 澄清石灰水',
          check: function (w) { return countLiquidWith(w, 'caoh2') >= 1; }
        },
        {
          text: '用「导气」把两支试管连接起来，让气体通入石灰水并变浑浊',
          hint: '工具栏点「导气」，依次点两支试管；看到石灰水变浑浊（生成白色沉淀）就成功了',
          check: function (w) { return fired(w, 'co2_caoh2'); }
        }
      ]
    },

    /* ---------------------------------------------------------------- 3 */
    {
      id: 'neutralization',
      name: '酸碱中和反应与指示剂',
      chapter: '九年级下册 · 第十单元 酸和碱',
      goal: '用酚酞指示剂找到氢氧化钠与稀盐酸恰好完全反应的那一刻。',
      principle: ['NaOH + HCl = NaCl + H₂O'],
      intro: '氢氧化钠与盐酸反应生成氯化钠和水，反应本身没有明显现象。借助无色酚酞可以判断反应是否恰好完成：碱性时酚酞变红，恰好完全反应后红色褪去。',
      setup: [
        at('testTube', 340, 0),
        at('beakerSmall', 700, 0)
      ],
      steps: [
        {
          text: '向试管中加入氢氧化钠溶液',
          hint: '药品架 → 液体药品 → 氢氧化钠溶液',
          check: function (w) { return countLiquidWith(w, 'naoh') >= 1; }
        },
        {
          text: '滴入无色酚酞溶液，观察溶液变红',
          hint: '药品架 → 指示剂 / 试纸 → 无色酚酞溶液',
          check: function (w) { return fired(w, 'phenolphthalein_naoh'); }
        },
        {
          text: '逐滴加入稀盐酸，直到红色恰好褪去',
          hint: '加入稀盐酸后，酚酞的红色会消失，说明溶液不再显碱性',
          check: function (w) {
            return fired(w, 'naoh_hcl') && pinkGone(w);
          }
        },
        {
          text: '用 pH 试纸检验反应后溶液的酸碱性',
          hint: '工具栏点「检验」，再点试管，选择「pH 试纸」',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    },

    /* ---------------------------------------------------------------- 4 */
    {
      id: 'metalActivity',
      name: '金属活动性顺序的探究',
      chapter: '九年级下册 · 第八单元 金属和金属材料',
      goal: '通过四种金属与稀盐酸反应的现象，比较镁、锌、铁、铜的活动性顺序。',
      principle: ['Mg + 2HCl = MgCl₂ + H₂↑', 'Zn + 2HCl = ZnCl₂ + H₂↑', 'Fe + 2HCl = FeCl₂ + H₂↑'],
      intro: '活动性越强的金属，与酸反应置换出氢气的速率越快。铜排在氢的后面，所以不能与稀盐酸反应。',
      setup: [
        at('testTube', 250, 0),
        at('testTube', 380, 0),
        at('testTube', 510, 0),
        at('testTube', 640, 0),
        at('testTubeRack', 1000, 0)
      ],
      steps: [
        {
          text: '把镁条、锌粒、铁钉、铜片分别放入四支试管中',
          hint: '药品架 → 金属单质',
          check: function (w) {
            return any(w, 'mg') && any(w, 'zn') && any(w, 'fe') && any(w, 'cu');
          }
        },
        {
          text: '向四支试管中各加入少量稀盐酸',
          hint: '每支试管都要先选中，再点稀盐酸',
          /* 用"曾经加过"而不是"现在还有"：加完第一支后反应就开始消耗盐酸了 */
          check: function (w) { return countEverHad(w, 'hcl') >= 4; }
        },
        {
          text: '观察并比较产生气泡的快慢（镁 > 锌 > 铁，铜没有气泡）',
          hint: '三种金属与稀盐酸的反应都应该发生',
          check: function (w) {
            return fired(w, 'mg_hcl') && fired(w, 'zn_hcl') && fired(w, 'fe_hcl');
          }
        },
        {
          text: '用燃着的木条检验其中一支试管中收集到的气体',
          hint: '工具栏点「检验」，选择「燃着的木条」；氢气本身可以燃烧',
          check: function (w) { return testDone(w, 'burningSplint'); }
        }
      ]
    },

    /* ---------------------------------------------------------------- 5 */
    {
      id: 'ironCopper',
      name: '铁与硫酸铜溶液的置换反应',
      chapter: '九年级下册 · 第八单元 金属和金属材料',
      goal: '观察铁钉表面析出红色的铜，溶液由蓝色变成浅绿色。',
      principle: ['Fe + CuSO₄ = FeSO₄ + Cu'],
      intro: '铁的活动性比铜强，能把铜从硫酸铜溶液中置换出来，生成硫酸亚铁和铜。这是"湿法炼铜"的原理。',
      setup: [
        at('testTube', 340, 0),
        at('beakerSmall', 700, 0)
      ],
      steps: [
        {
          text: '向试管中加入硫酸铜溶液',
          hint: '药品架 → 液体药品 → 硫酸铜溶液（蓝色）',
          check: function (w) { return liquidOf(w, 'cuso4') > 0.5; }
        },
        {
          text: '把铁钉浸入硫酸铜溶液中',
          hint: '药品架 → 金属单质 → 铁钉',
          check: function (w) {
            return cs(w).some(function (c) {
              var fe = c.hasBase('fe'), cu = c.liquids.some(function (e) {
                var s = CHEM.getSub(e.id); return s && s.base === 'cuso4';
              });
              return fe && cu;
            });
          }
        },
        {
          text: '观察铁钉表面出现红色物质、溶液由蓝色变为浅绿色',
          hint: '反应需要几秒钟，注意右侧实验记录里的现象与方程式',
          check: function (w) { return fired(w, 'fe_cuso4'); }
        }
      ]
    },

    /* ---------------------------------------------------------------- 6 */
    {
      id: 'carbonate',
      name: '碳酸钠溶液的酸碱性探究',
      chapter: '九年级下册 · 第十一单元 盐 化肥',
      goal: '用指示剂和 pH 试纸检验碳酸钠溶液的酸碱性，再与稀盐酸反应。',
      principle: ['Na₂CO₃ + 2HCl = 2NaCl + H₂O + CO₂↑'],
      intro: '碳酸钠俗称纯碱，虽然属于盐，但它的水溶液显碱性，能使酚酞变红。这说明"盐溶液不一定显中性"。',
      setup: [
        at('testTube', 340, 0),
        at('testTube', 600, 0)
      ],
      steps: [
        {
          text: '向试管中加入碳酸钠溶液',
          hint: '药品架 → 液体药品 → 碳酸钠溶液；也可以直接加碳酸钠固体再加水',
          check: function (w) { return liquidOf(w, 'na2co3') > 0.5; }
        },
        {
          text: '滴入无色酚酞溶液，观察到溶液变红',
          hint: '说明碳酸钠溶液显碱性',
          check: function (w) { return fired(w, 'phenolphthalein_na2co3'); }
        },
        {
          text: '用 pH 试纸测出溶液的 pH',
          hint: '工具栏点「检验」，选择「pH 试纸」',
          check: function (w) { return testDone(w, 'phPaper'); }
        },
        {
          text: '加入稀盐酸，观察产生气泡',
          hint: '碳酸钠与盐酸反应生成氯化钠、水和二氧化碳',
          check: function (w) { return fired(w, 'na2co3_hcl'); }
        }
      ]
    }
  ];

  CHEM.EXPERIMENTS = EXPERIMENTS;
})(typeof window !== 'undefined' ? window : globalThis);
