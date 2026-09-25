/* =============================================================================
 * 虚拟化学实验室 —— 初中教材实验库（人教版九年级化学）
 * -----------------------------------------------------------------------------
 * 通过 CHEM.registerExperiments 追加，每条任务带 level: 'junior'。
 *
 * 数据结构（在 index.js 的任务结构上增加两个字段）：
 *   chapter    必填，教材位置，如 '九年级上册 · 第二单元 我们周围的空气'
 *   principle  必填，数组，该实验涉及的化学方程式（照抄数据文件里的写法）
 *   其余字段（setup / steps / goal / intro）与 index.js 完全一致：
 *     setup     [{type, x, y}]               自动摆好的仪器（y 用 benchY 偏移）
 *     steps     [{text, hint, check(world)}] 完成一步就做一个勾
 *
 * 所有方程式、物质 id、仪器 id 都取自 js/data/*.js，新增前请先核对。
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});
  var BENCH = CHEM.SCENE ? CHEM.SCENE.benchY : 566;

  /* ---------- 查询工具（与 index.js 里的写法保持一致） ---------- */
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
  /* 某个装置（漏斗 / 导管）是否已经装配到容器上 */
  function attached(w, type) {
    return (w.devices ? w.devices() : []).some(function (d) {
      return d.type === type && !!(d.target || (d.linkA && d.linkB));
    });
  }
  function at(type, x, up) { return { type: type, x: x, y: BENCH - (up || 0) }; }

  /* 货架名 / 物质名：从物质库现取，保证提示里的中文名和药品架一致 */
  var SHELF_NAME = {};
  (CHEM.SHELVES || []).forEach(function (sh) { SHELF_NAME[sh.id] = sh.name; });
  /* 取某个 base 在药品架上的中文名，找不到就用备用名 */
  function nm(base, fallback) {
    var list = CHEM.SUBSTANCES_BY_BASE ? CHEM.SUBSTANCES_BY_BASE[base] : null;
    var s = list && (list.filter(function (x) { return x.pickable; })[0] || list[0]);
    return (s && s.name) || fallback || base;
  }
  /* "药品架 → 液体药品 → 氢氧化钠溶液" */
  function hintOf(base, fallback) {
    var list = CHEM.SUBSTANCES_BY_BASE ? CHEM.SUBSTANCES_BY_BASE[base] : null;
    var s = list && (list.filter(function (x) { return x.pickable; })[0] || list[0]);
    if (!s) return '药品架 → ' + nm(base, fallback);
    return '药品架 → ' + (SHELF_NAME[s.shelf] || '药品') + ' → ' + s.name;
  }

  /* =====================================================================
   * 任务列表（13 个初中教材实验）
   * ================================================================== */
  var LIST = [

    /* ------------------------------------------------------------ 1 */
    {
      id: 'tb-air',
      level: 'junior',
      name: '人体吸入与呼出气体的探究',
      chapter: '九年级上册 · 第一单元 走进化学世界',
      goal: '用澄清石灰水和燃着的木条对比空气与呼出气体，学会"对照实验"的方法。',
      intro: '人呼出的气体中二氧化碳和水蒸气的含量比空气高，氧气的含量比空气低。'
        + '对比实验的关键是：只有被研究的那个条件不同，其他条件都相同。',
      principle: [
        'CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O',
        'C + O₂ = CO₂'
      ],
      setup: [
        at('gasJar', 300, 0),
        at('gasJar', 620, 0),
        at('testTube', 920, 0)
      ],
      steps: [
        {
          text: '向第一只集气瓶中加入少量澄清石灰水，作为"呼出气体"的检验瓶',
          hint: hintOf('caoh2', '澄清石灰水') + '（选中的是左边的集气瓶）',
          check: function (w) { return liquidOf(w, 'caoh2') > 0.5; }
        },
        {
          text: '向这只集气瓶中通入二氧化碳（模拟呼出气体），观察石灰水变浑浊',
          hint: hintOf('co2', '二氧化碳') + '；CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O，出现白色沉淀',
          check: function (w) { return fired(w, 'co2_caoh2'); }
        },
        {
          text: '向右边那只集气瓶中通入少量氧气，再用燃着的木条检验，木条燃烧得更旺',
          hint: hintOf('o2', '氧气') + '，然后用工具栏点「检验」，再点这只集气瓶，选「燃着的木条」；与空气对比，氧气支持燃烧的能力更强',
          check: function (w) { return testDone(w, 'burningSplint'); }
        },
        {
          text: '把木炭放在氧气中燃烧，对比木条在氧气中"燃烧更旺"的现象',
          hint: hintOf('c', '木炭') + '加入试管，再' + hintOf('o2', '氧气') + '，最后用工具栏「点燃」点这支试管',
          check: function (w) { return fired(w, 'c_o2_full'); }
        },
        {
          text: '用 pH 试纸测一下石灰水的酸碱性，确认它是碱性溶液',
          hint: '工具栏点「检验」，再点装了石灰水的集气瓶，选「pH 试纸」，应显示 pH ≈ 12',
          check: function (w) { return testDone(w, 'phPaper'); }
        },
        {
          text: '用带火星的木条检验试管中剩余的氧气',
          hint: '工具栏点「检验」，再点装过氧气的试管，选「带火星的木条」；木条复燃说明氧气能支持燃烧',
          check: function (w) { return testDone(w, 'glowingSplint'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 2 */
    {
      id: 'tb-molecule',
      level: 'junior',
      name: '分子运动现象的探究',
      chapter: '九年级上册 · 第三单元 物质构成的奥秘',
      goal: '通过氨分子不断运动进入酚酞溶液使其变红，认识分子在不停运动。',
      intro: '浓氨水挥发出来的氨分子不断运动，扩散到另一只烧杯上方并溶于水，'
        + '使酚酞溶液变红。整个过程中两只烧杯并没有接触——变红只可能是分子"跑"过去了。',
      principle: [
        'NH₃ + H₂O = NH₃·H₂O',
        'NH₃·H₂O 使酚酞溶液变红'
      ],
      setup: [
        at('beakerSmall', 300, 0),
        at('beakerSmall', 700, 0),
        at('deliveryTube', 500, 260)
      ],
      steps: [
        {
          text: '向第一只小烧杯中加入约 30 mL 蒸馏水',
          hint: hintOf('h2o', '蒸馏水') + '（先点中左边的小烧杯再点药品）',
          check: function (w) { return liquidOf(w, 'h2o') >= 18; }
        },
        {
          text: '滴入几滴无色酚酞溶液，此时溶液仍为无色',
          hint: hintOf('phenolphthalein', '无色酚酞溶液') + '；酚酞在中性水中不变色',
          check: function (w) { return any(w, 'phenolphthalein'); }
        },
        {
          text: '向第二只小烧杯中加入约 20 mL 浓氨水（氨水的浓溶液）',
          hint: hintOf('nh3h2o', '氨水') + '；氨水易挥发出氨分子',
          check: function (w) { return any(w, 'nh3h2o'); }
        },
        {
          text: '用「连接」把导管两端分别接到两只烧杯上，让氨分子扩散过去',
          hint: '工具栏点「连接」，先点导管再点第一只烧杯，然后再点一次导管、点第二只烧杯；氨气进入酚酞溶液',
          check: function (w) { return fired(w, 'nh3_h2o'); }
        },
        {
          text: '观察到第一只烧杯中的酚酞溶液变红，说明分子在不停地运动',
          hint: '现象是"烧杯 A 中的溶液变红，而两只烧杯并没有接触"，这正是分子运动的证据',
          check: function (w) { return fired(w, 'nh3_h2o') && any(w, 'phenolphthalein'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 3 */
    {
      id: 'tb-water-compose',
      level: 'junior',
      name: '水的组成（电解水实验）',
      chapter: '九年级上册 · 第四单元 自然界的水',
      goal: '通过电解水并检验两极产物，认识水由氢元素和氧元素组成。',
      intro: '通电后水分解成氢气和氧气，负极产生氢气、正极产生氧气，体积比约为 2∶1。'
        + '这个实验说明水不是一种"元素"，而是由氢、氧两种元素组成的化合物。',
      principle: [
        '2H₂O = 2H₂↑ + O₂↑',
        '2H₂ + O₂ = 2H₂O'
      ],
      setup: [
        at('beakerSmall', 420, 0),
        at('testTube', 820, 0)
      ],
      steps: [
        {
          text: '向小烧杯中加入约 50 mL 蒸馏水',
          hint: hintOf('h2o', '蒸馏水') + '（可以连续点几次加够量）',
          check: function (w) { return liquidOf(w, 'h2o') >= 30; }
        },
        {
          text: '用工具栏「通电」给水通电，观察到两极都有气泡产生',
          hint: '工具栏点「通电」，再点小烧杯；2H₂O = 2H₂↑ + O₂↑',
          check: function (w) { return fired(w, 'h2o_electric'); }
        },
        {
          text: '用带火星的木条检验正极产生的气体（氧气）',
          hint: '工具栏点「检验」，再点小烧杯，选「带火星的木条」；木条复燃说明是氧气',
          check: function (w) { return testDone(w, 'glowingSplint'); }
        },
        {
          text: '用燃着的木条检验负极产生的气体（氢气）',
          hint: '工具栏点「检验」，再点小烧杯，选「燃着的木条」；气体被点燃、发出淡蓝色火焰',
          check: function (w) { return testDone(w, 'burningSplint'); }
        },
        {
          text: '把氢气在氧气中点燃，验证它燃烧只生成水',
          hint: hintOf('h2', '氢气') + '加入试管，再加' + hintOf('o2', '氧气') + '，然后用工具栏「点燃」点试管；2H₂ + O₂ = 2H₂O',
          check: function (w) { return fired(w, 'h2_o2'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 4 */
    {
      id: 'tb-water-purify',
      level: 'junior',
      name: '水的净化（过滤与吸附）',
      chapter: '九年级上册 · 第四单元 自然界的水',
      goal: '用过滤除去水中不溶性杂质，用木炭吸附色素和异味，理解"净化程度"的差别。',
      intro: '过滤只能除去不溶性杂质，不能除去溶解在水里的物质；吸附能除去色素和异味，'
        + '也不能除去全部可溶性杂质。所以净化程度从低到高是：静置沉淀 → 过滤 → 吸附 → 蒸馏。',
      principle: [
        'CaCO₃ + 2HCl = CaCl₂ + H₂O + CO₂↑'
      ],
      setup: [
        at('beakerSmall', 300, 0),
        at('funnel', 300, 140),
        at('beakerSmall', 760, 0)
      ],
      steps: [
        {
          text: '向第一只小烧杯中加入约 40 mL 蒸馏水',
          hint: hintOf('h2o', '蒸馏水') + '，用它模拟需要净化的水',
          check: function (w) { return liquidOf(w, 'h2o') >= 25; }
        },
        {
          text: '加入少量大理石粉末，搅拌后得到浑浊的液体（模拟含泥沙的天然水）',
          hint: hintOf('caco3', '大理石') + '；再用工具栏「搅拌」点烧杯，可以看到不溶物悬浮在水中',
          check: function (w) { return any(w, 'caco3'); }
        },
        {
          text: '用「连接」把漏斗架到第二只小烧杯上，做成过滤装置',
          hint: '工具栏点「连接」，先点漏斗再点右边的小烧杯；过滤要做到"一贴、二低、三靠"',
          check: function (w) { return attached(w, 'funnel'); }
        },
        {
          text: '用「倾倒」把浑浊的水倒进漏斗，观察滤液变澄清',
          hint: '工具栏点「倾倒」，先点左边的小烧杯，再点漏斗；大理石颗粒留在滤纸上，滤液是澄清的',
          check: function (w) {
            var cups = byType(w, 'beakerSmall');
            return cups.length >= 2 && cups[1].liquidVolume() > 3;
          }
        },
        {
          text: '向滤液中加入少量木炭，搅拌后观察颜色变浅（吸附）',
          hint: hintOf('c', '木炭') + '（它同时是"木炭"也是可燃物，这里只利用它的吸附性），再用工具栏「搅拌」',
          check: function (w) { return any(w, 'c'); }
        },
        {
          text: '向留在第一只烧杯里的大理石残渣中加入稀盐酸，观察产生气泡',
          hint: hintOf('hcl', '稀盐酸') + '；CaCO₃ + 2HCl = CaCl₂ + H₂O + CO₂↑，气泡说明倒不走的正是难溶性固体杂质',
          check: function (w) { return fired(w, 'caco3_hcl'); }
        },
        {
          text: '用 pH 试纸检验过滤后得到的澄清滤液',
          hint: '工具栏点「检验」，再点第二只小烧杯（滤液），选「pH 试纸」；过滤和吸附都除不掉溶解在水里的物质，只有蒸馏能除去',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 5 */
    {
      id: 'tb-mass',
      level: 'junior',
      name: '质量守恒定律的探究',
      chapter: '九年级上册 · 第五单元 化学方程式',
      goal: '通过铁与硫酸铜溶液、红磷燃烧两个反应，认识"反应前后总质量不变"。',
      intro: '化学反应的实质是原子的重新组合：反应前后原子的种类、数目、质量都没有改变，'
        + '所以参加反应的各物质质量总和等于反应后生成的各物质质量总和。'
        + '（本模拟里没有天平，我们通过观察反应是否发生、原子如何重新组合来理解守恒。）',
      principle: [
        'Fe + CuSO₄ = FeSO₄ + Cu',
        '4P + 5O₂ = 2P₂O₅'
      ],
      setup: [
        at('conicalFlask', 340, 0),
        at('testTube', 700, 46),
        at('alcoholLamp', 700, 0)
      ],
      steps: [
        {
          text: '向锥形瓶中加入适量蓝色的硫酸铜溶液',
          hint: hintOf('cuso4', '硫酸铜溶液') + '（在"液体药品"里，是蓝色的）',
          check: function (w) { return liquidOf(w, 'cuso4') > 0.5; }
        },
        {
          text: '把铁钉浸入硫酸铜溶液中（反应容器敞口，反应前后质量不变）',
          hint: hintOf('fe', '铁钉') + '；铁的表面会析出红色的铜',
          /* 不能要求"铁钉和硫酸铜溶液同时还在"——这个反应一旦发生，
             硫酸铜就被消耗掉了。用"溶液被消耗 / 已经发生反应"来判定。 */
          check: function (w) {
            return liquidOf(w, 'cuso4') > 0.5 ||
              cs(w).some(function (c) {
                return c.liquids.some(function (e) {
                  var s = CHEM.getSub(e.id);
                  return s && (s.base === 'cuso4' || s.base === 'feso4');
                });
              });
          }
        },
        {
          text: '观察铁钉表面出现红色物质、溶液由蓝色变成浅绿色',
          hint: 'Fe + CuSO₄ = FeSO₄ + Cu；反应前后原子的种类和数目都没有改变',
          check: function (w) { return fired(w, 'fe_cuso4'); }
        },
        {
          text: '向试管中加入少量红磷（红色固体）',
          hint: hintOf('p', '红磷') + '（在"非金属单质"里）',
          check: function (w) { return any(w, 'p'); }
        },
        {
          text: '加入氧气，用「点燃」点燃红磷，观察产生大量白烟',
          hint: hintOf('o2', '氧气') + '，然后工具栏点「点燃」再点试管；4P + 5O₂ = 2P₂O₅',
          check: function (w) { return fired(w, 'p_o2'); }
        },
        {
          text: '用 pH 试纸检验反应后锥形瓶里的溶液（硫酸亚铁溶液接近中性）',
          hint: '工具栏点「检验」，再点锥形瓶，选「pH 试纸」；可通过反应记录中的方程式核对原子守恒',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 6 */
    {
      id: 'tb-burn',
      level: 'junior',
      name: '燃烧条件的探究',
      chapter: '九年级上册 · 第七单元 燃料及其利用',
      goal: '通过对比实验归纳出燃烧的三个条件：可燃物、氧气（或空气）、温度达到着火点。',
      intro: '三个条件必须同时满足，缺少任何一个都不能燃烧。'
        + '本实验用水中的铁钉说明"没有氧气不能燃烧"，用红磷和白磷的差别说明着火点不同。',
      principle: [
        'C + O₂ = CO₂',
        '4P + 5O₂ = 2P₂O₅',
        '3Fe + 2O₂ = Fe₃O₄'
      ],
      setup: [
        at('conicalFlask', 280, 46),
        at('alcoholLamp', 280, 0),
        at('testTube', 620, 0),
        at('testTube', 860, 0),
        at('testTube', 1080, 0),
        at('testTube', 1290, 0)
      ],
      steps: [
        {
          text: '向锥形瓶中加入约 30 mL 蒸馏水，点燃酒精灯加热到 60 ℃ 以上',
          hint: hintOf('h2o', '蒸馏水') + '；然后工具栏「点燃」点酒精灯，把锥形瓶放到火焰上方加热',
          check: function (w) { return liquidOf(w, 'h2o') >= 18; }
        },
        {
          text: '向水中放入铁钉，用燃着的木条去点水中的铁钉，铁钉不燃烧',
          hint: hintOf('fe', '铁钉') + '；这一组说明"铁钉本身可燃，但浸在水中隔绝了氧气，所以不燃烧"',
          check: function (w) { return any(w, 'fe'); }
        },
        {
          text: '向第二支试管中加入木炭，通入氧气后点燃，木炭剧烈燃烧发出白光',
          hint: hintOf('c', '木炭') + ' + ' + hintOf('o2', '氧气') + '，再用工具栏「点燃」点试管；C + O₂ = CO₂',
          check: function (w) { return fired(w, 'c_o2_full'); }
        },
        {
          text: '向第三支试管中加入红磷，点燃后观察黄白色火焰和大量白烟',
          hint: hintOf('p', '红磷') + '，再用工具栏「点燃」点试管；4P + 5O₂ = 2P₂O₅',
          check: function (w) { return fired(w, 'p_o2'); }
        },
        {
          text: '在盛有氧气的第四支试管中放入铁丝并点燃，观察火星四射',
          hint: hintOf('fe', '铁钉') + ' + ' + hintOf('o2', '氧气') + '，再用工具栏「点燃」点试管；这一组与"水中的铁钉"对比，说明燃烧需要氧气',
          check: function (w) { return fired(w, 'fe_o2'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 7 */
    {
      id: 'tb-heat',
      level: 'junior',
      name: '给物质加热',
      chapter: '九年级上册 · 第一单元 走进化学世界',
      goal: '学会用酒精灯的外焰加热试管中的固体，并认识蒸发皿可以直接加热。',
      intro: '酒精灯火焰分外焰、内焰、焰心，外焰温度最高，加热时要用外焰。'
        + '试管、蒸发皿、燃烧匙可以直接加热；烧杯、锥形瓶要垫石棉网；量筒、集气瓶不能加热。',
      principle: [
        '2KMnO₄ = K₂MnO₄ + MnO₂ + O₂↑',
        'Cu(OH)₂ = CuO + H₂O'
      ],
      setup: [
        at('testTube', 320, 46),
        at('alcoholLamp', 320, 0),
        at('evaporatingDish', 760, 60),
        at('alcoholLamp', 760, 0)
      ],
      steps: [
        {
          text: '向试管中加入少量高锰酸钾（紫黑色固体）',
          hint: hintOf('kmno4', '高锰酸钾') + '（在"固体药品"里）',
          check: function (w) { return any(w, 'kmno4'); }
        },
        {
          text: '用试管夹夹住试管中上部，点燃酒精灯，把试管放在外焰上加热到 120 ℃ 以上',
          hint: '工具栏点「点燃」再点酒精灯；点「选择」拖动试管，让管底对准火焰的外焰（火焰的最外层）',
          /* 只看"有容器被加热到 120 ℃ 以上"——高锰酸钾一受热就分解掉了，
             如果要求"高锰酸钾还在"，这一格就永远点不亮。 */
          check: function (w) {
            var hot = false;
            cs(w).forEach(function (c) { if (c.temp >= 120) hot = true; });
            return hot;
          }
        },
        {
          text: '观察到高锰酸钾分解，试管中产生氧气',
          hint: '2KMnO₄ = K₂MnO₄ + MnO₂ + O₂↑；试管口略向下倾斜，防止冷凝水倒流炸裂试管',
          check: function (w) { return fired(w, 'kmno4_heat'); }
        },
        {
          text: '向蒸发皿中加入少量水，点燃第二盏酒精灯加热蒸发皿',
          hint: hintOf('h2o', '蒸馏水') + '；蒸发皿可以直接加热，加热时用玻璃棒不断搅拌',
          check: function (w) {
            return byType(w, 'evaporatingDish').some(function (c) { return c.liquidVolume() > 1; });
          }
        },
        {
          text: '把蒸发皿加热到 60 ℃ 以上，观察水逐渐减少',
          hint: '工具栏「点燃」点第二盏酒精灯；蒸发皿、试管可以直接加热，烧杯必须垫石棉网，量筒不能加热',
          check: function (w) {
            return byType(w, 'evaporatingDish').some(function (c) { return c.temp >= 60; });
          }
        }
      ]
    },

    /* ------------------------------------------------------------ 8 */
    {
      id: 'tb-solution',
      level: 'junior',
      name: '配制一定溶质质量分数的氯化钠溶液',
      chapter: '九年级上册 · 第九单元 溶液',
      goal: '学会用固体和水配制一定溶质质量分数的溶液：计算 → 量取 → 溶解 → 装瓶贴签。',
      intro: '配制 50 g 质量分数为 6% 的氯化钠溶液，需要氯化钠 3 g、水 47 mL。'
        + '用量筒量取水时，视线要与凹液面的最低处保持水平。'
        + '（本模拟里没有天平，所以用"少量氯化钠固体"代替精确称量。）',
      principle: [
        'NaCl 溶于水得到均一、稳定的混合物（没有发生化学反应）'
      ],
      setup: [
        at('beakerSmall', 340, 0),
        at('graduatedCylinder', 700, 0)
      ],
      steps: [
        {
          text: '向小烧杯中加入少量氯化钠固体（代替"称取 3 g 氯化钠"）',
          hint: hintOf('nacl', '氯化钠') + '；本模拟没有天平，注意观察固体的量不要太多',
          check: function (w) { return any(w, 'nacl'); }
        },
        {
          text: '用量筒量取约 40 mL 蒸馏水，倒入烧杯',
          hint: hintOf('h2o', '蒸馏水') + '；也可以先把水加进量筒再用「倾倒」倒进烧杯——量筒只能量液，不能用来溶解',
          check: function (w) { return liquidOf(w, 'h2o') >= 20; }
        },
        {
          text: '用玻璃棒搅拌，加快氯化钠溶解',
          hint: '工具栏点「搅拌」，再点小烧杯；搅拌只能加快溶解速率，不能增大溶解的最大量',
          check: function (w) { return dissolved(w, 'nacl'); }
        },
        {
          text: '观察到固体全部溶解，得到均一、稳定的氯化钠溶液',
          hint: '溶解后液体体积基本不变（这是"溶解"和"化学变化"的一个重要区别）',
          check: function (w) {
            return dissolved(w, 'nacl') && liquidOf(w, 'h2o') >= 20;
          }
        },
        {
          text: '用 pH 试纸检验配好的溶液，确认氯化钠溶液呈中性（pH ≈ 7）',
          hint: '工具栏点「检验」，再点小烧杯，选「pH 试纸」；中性盐溶液不能使石蕊变色',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    },

    /* ------------------------------------------------------------ 9 */
    {
      id: 'tb-indicator',
      level: 'junior',
      name: '酸碱指示剂与溶液的酸碱性',
      chapter: '九年级下册 · 第十单元 酸和碱',
      goal: '用紫色石蕊溶液和无色酚酞溶液检验稀盐酸、氢氧化钠溶液和氯化钠溶液的酸碱性。',
      intro: '石蕊遇酸变红、遇碱变蓝，可以区分酸性、中性和碱性溶液；'
        + '酚酞遇酸和中性溶液都不变色，只有遇碱才变红，所以酚酞只能用来检验碱性溶液。',
      principle: [
        '石蕊遇稀盐酸变红：HCl 电离出 H⁺，溶液显酸性',
        '石蕊遇氢氧化钠变蓝：NaOH 电离出 OH⁻，溶液显碱性',
        '酚酞遇氢氧化钠变红：NaOH + 酚酞 → 溶液呈红色'
      ],
      setup: [
        at('testTube', 260, 0),
        at('testTube', 470, 0),
        at('testTube', 680, 0),
        at('testTube', 890, 0),
        at('testTube', 1090, 0)
      ],
      steps: [
        {
          text: '向第一支试管中加入稀盐酸，滴入紫色石蕊溶液，观察变红',
          hint: hintOf('hcl', '稀盐酸') + ' + ' + hintOf('litmus', '紫色石蕊溶液'),
          check: function (w) { return fired(w, 'litmus_hcl'); }
        },
        {
          text: '向第二支试管中加入氢氧化钠溶液，滴入紫色石蕊溶液，观察变蓝',
          hint: hintOf('naohaq', '氢氧化钠溶液') + ' + ' + hintOf('litmus', '紫色石蕊溶液'),
          check: function (w) { return fired(w, 'litmus_naoh'); }
        },
        {
          text: '向第三支试管中加入氯化钠溶液，滴入紫色石蕊溶液，观察仍为紫色',
          hint: hintOf('naclaq', '氯化钠溶液') + '；石蕊在中性溶液中保持紫色',
          check: function (w) { return fired(w, 'litmus_nacl'); }
        },
        {
          text: '向第四支试管中加入氢氧化钠溶液，滴入无色酚酞溶液，观察变红',
          hint: hintOf('naohaq', '氢氧化钠溶液') + ' + ' + hintOf('phenolphthalein', '无色酚酞溶液'),
          check: function (w) { return fired(w, 'phenolphthalein_naoh'); }
        },
        {
          text: '向第五支试管中加入稀盐酸，滴入无色酚酞溶液，观察不变色',
          hint: hintOf('hcl', '稀盐酸') + ' + ' + hintOf('phenolphthalein', '无色酚酞溶液') + '；酚酞遇酸不变色',
          check: function (w) { return fired(w, 'phenolphthalein_hcl'); }
        }
      ]
    },

    /* ----------------------------------------------------------- 10 */
    {
      id: 'tb-acidbase',
      level: 'junior',
      name: '酸和碱的化学性质',
      chapter: '九年级下册 · 第十单元 酸和碱',
      goal: '归纳酸的化学性质（与指示剂、金属、金属氧化物反应）和碱的化学性质（与指示剂、非金属氧化物反应）。',
      intro: '酸能与指示剂、活泼金属、金属氧化物反应；碱能与指示剂、非金属氧化物反应；'
        + '酸和碱之间还能发生中和反应。这几条性质分别对应"酸的通性"和"碱的通性"。',
      principle: [
        'Fe₂O₃ + 6HCl = 2FeCl₃ + 3H₂O',
        'Mg + 2HCl = MgCl₂ + H₂↑',
        'CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O',
        'NaOH + HCl = NaCl + H₂O'
      ],
      setup: [
        at('testTube', 240, 0),
        at('testTube', 440, 0),
        at('testTube', 640, 0),
        at('testTube', 840, 0),
        at('beakerSmall', 1080, 0)
      ],
      steps: [
        {
          text: '向第一支试管中加入氧化铁粉末和稀盐酸，观察红棕色粉末溶解、溶液变为黄色',
          hint: hintOf('fe2o3', '氧化铁') + ' + ' + hintOf('hcl', '稀盐酸') + '；Fe₂O₃ + 6HCl = 2FeCl₃ + 3H₂O',
          check: function (w) { return fired(w, 'fe2o3_hcl'); }
        },
        {
          text: '向第二支试管中加入一段镁条，再加入稀盐酸，观察产生大量气泡',
          hint: hintOf('mg', '镁条') + ' + ' + hintOf('hcl', '稀盐酸') + '；Mg + 2HCl = MgCl₂ + H₂↑，气泡快慢可以比较金属活动性',
          check: function (w) { return fired(w, 'mg_hcl'); }
        },
        {
          text: '向小烧杯中加入澄清石灰水，通入二氧化碳，观察变浑浊',
          hint: hintOf('caoh2', '澄清石灰水') + ' + ' + hintOf('co2', '二氧化碳') + '；CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O，这是碱与非金属氧化物的反应',
          check: function (w) { return fired(w, 'co2_caoh2'); }
        },
        {
          text: '向第三支试管中加入氢氧化钠溶液，滴入无色酚酞溶液，观察变红',
          hint: hintOf('naohaq', '氢氧化钠溶液') + ' + ' + hintOf('phenolphthalein', '无色酚酞溶液'),
          check: function (w) { return fired(w, 'phenolphthalein_naoh'); }
        },
        {
          text: '再滴入稀盐酸直到红色褪去，说明酸和碱发生了中和反应',
          hint: hintOf('hcl', '稀盐酸') + '；NaOH + HCl = NaCl + H₂O，红色褪去表示溶液不再显碱性',
          check: function (w) { return fired(w, 'naoh_hcl'); }
        },
        {
          text: '用 pH 试纸检验反应后第三支试管里的溶液',
          hint: '工具栏点「检验」，点第三支试管，选「pH 试纸」；红色恰好褪去时 pH ≈ 7',
          check: function (w) { return testDone(w, 'phPaper'); }
        }
      ]
    },

    /* ----------------------------------------------------------- 11 */
    {
      id: 'tb-ph',
      level: 'junior',
      name: '溶液酸碱度的检验',
      chapter: '九年级下册 · 第十单元 酸和碱',
      goal: '学会用 pH 试纸测定溶液的 pH，知道 pH 与溶液酸碱性强弱的关系。',
      intro: 'pH 的范围通常在 0~14 之间：pH < 7 显酸性，pH = 7 显中性，pH > 7 显碱性。'
        + '用 pH 试纸测定的操作是：用玻璃棒蘸取待测液滴在试纸上，再与标准比色卡对照。'
        + '注意 pH 试纸不能用水润湿，也不能把试纸直接伸入待测液中。',
      principle: [
        'HCl 电离出 H⁺，稀盐酸 pH ≈ 1，显强酸性',
        'NaCl 溶液 pH ≈ 7，显中性',
        'NaOH 电离出 OH⁻，氢氧化钠溶液 pH ≈ 13，显强碱性'
      ],
      setup: [
        at('testTube', 260, 0),
        at('testTube', 500, 0),
        at('testTube', 740, 0),
        at('testTube', 980, 0)
      ],
      steps: [
        {
          text: '向第一支试管中加入稀盐酸',
          hint: hintOf('hcl', '稀盐酸') + '（在"液体药品"里）',
          check: function (w) { return liquidOf(w, 'hcl') > 0.5; }
        },
        {
          text: '用 pH 试纸测出稀盐酸的 pH',
          hint: '工具栏点「检验」，再点第一支试管，选「pH 试纸」；试纸变红，pH ≈ 1~2',
          check: function (w) { return testDone(w, 'phPaper'); }
        },
        {
          text: '向第二支试管中加入氯化钠溶液',
          hint: hintOf('naclaq', '氯化钠溶液') + '，用来和酸、碱作对照',
          check: function (w) { return liquidOf(w, 'nacl') > 0.5; }
        },
        {
          text: '向第三支试管中加入氢氧化钠溶液',
          hint: hintOf('naohaq', '氢氧化钠溶液') + '；它有强腐蚀性，操作要小心',
          check: function (w) { return liquidOf(w, 'naoh') > 0.5; }
        },
        {
          text: '向第四支试管中加入澄清石灰水并测它的 pH',
          hint: hintOf('caoh2', '澄清石灰水') + '，再用工具栏「检验」→「pH 试纸」；石灰水 pH ≈ 12',
          check: function (w) { return fired(w, 'phenolphthalein_caoh2') || liquidOf(w, 'caoh2') > 0.5; }
        }
      ]
    },

    /* ----------------------------------------------------------- 12 */
    {
      id: 'tb-salt',
      level: 'junior',
      name: '粗盐中难溶性杂质的去除',
      chapter: '九年级下册 · 第十一单元 盐 化肥',
      goal: '通过溶解 → 过滤 → 蒸发三步，把粗盐中的难溶性杂质除去，得到较纯净的食盐。',
      intro: '粗盐中含有泥沙等不溶性杂质和氯化镁、氯化钙等可溶性杂质。'
        + '本实验用溶解、过滤除去不溶性杂质，再用蒸发结晶得到食盐晶体。'
        + '（过滤操作要做到"一贴、二低、三靠"。）',
      principle: [
        'NaCl 溶于水形成溶液，泥沙不溶于水（物理变化）',
        'Na₂CO₃ + 2HCl = 2NaCl + H₂O + CO₂↑'
      ],
      setup: [
        at('beakerSmall', 280, 0),
        at('funnel', 280, 140),
        at('beakerSmall', 640, 0),
        at('evaporatingDish', 940, 60),
        at('alcoholLamp', 940, 0)
      ],
      steps: [
        {
          text: '向第一只小烧杯中加入少量粗盐（用氯化钠模拟），再加水并用玻璃棒搅拌使其溶解',
          hint: hintOf('nacl', '氯化钠') + ' + ' + hintOf('h2o', '蒸馏水') + '，再用工具栏「搅拌」点烧杯',
          check: function (w) { return any(w, 'nacl'); }
        },
        {
          text: '观察氯化钠全部溶解，烧杯底部还留有不溶性杂质',
          hint: '搅拌可以加快溶解；溶解后仍有固体说明那是难溶性杂质，要用过滤除去',
          check: function (w) { return dissolved(w, 'nacl') || liquidOf(w, 'h2o') >= 20; }
        },
        {
          text: '用「连接」把漏斗架到第二只小烧杯上，再用「倾倒」过滤，除去不溶性杂质',
          hint: '工具栏点「连接」，先点漏斗再点右边的小烧杯；然后点「倾倒」，先点左边的烧杯，再点漏斗',
          check: function (w) { return attached(w, 'funnel'); }
        },
        {
          text: '把滤液倒入蒸发皿，点燃酒精灯加热，用玻璃棒不断搅拌',
          hint: '工具栏点「倾倒」，先点第二只烧杯再点蒸发皿；然后「点燃」点酒精灯；加热时要用玻璃棒搅拌，防止液滴飞溅',
          check: function (w) {
            return byType(w, 'evaporatingDish').some(function (c) { return c.liquidVolume() > 1; });
          }
        },
        {
          text: '加热到出现较多固体时停止加热，用余热把滤液蒸干，得到食盐晶体',
          hint: '工具栏点「点燃」点酒精灯再点一次可以熄灭；出现较多固体就停止加热，用余热蒸干',
          check: function (w) {
            return byType(w, 'evaporatingDish').some(function (c) { return c.temp >= 60; });
          }
        },
        {
          text: '向蒸干后得到的食盐中加入稀盐酸，检验其中是否还残留碳酸盐杂质',
          hint: hintOf('hcl', '稀盐酸') + '；Na₂CO₃ + 2HCl = 2NaCl + H₂O + CO₂↑，有气泡说明还有可溶性杂质需要继续除',
          check: function (w) { return fired(w, 'na2co3_hcl'); }
        }
      ]
    },

    /* ----------------------------------------------------------- 13 */
    {
      id: 'tb-ions',
      level: 'junior',
      name: '常见离子的检验',
      chapter: '九年级下册 · 第十一单元 盐 化肥',
      goal: '学会检验碳酸根离子、氯离子和硫酸根离子：加试剂、看沉淀（或气体）、再加稀硝酸看是否溶解。',
      intro: '检验离子要抓住特征反应：CO₃²⁻ 遇酸产生能使石灰水变浑浊的气体；'
        + 'Cl⁻ 遇 AgNO₃ 产生不溶于稀硝酸的白色沉淀；SO₄²⁻ 遇 BaCl₂ 产生不溶于稀硝酸的白色沉淀。',
      principle: [
        'Na₂CO₃ + 2HCl = 2NaCl + H₂O + CO₂↑',
        'CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O',
        'AgNO₃ + NaCl = AgCl↓ + NaNO₃',
        'BaCl₂ + Na₂SO₄ = BaSO₄↓ + 2NaCl'
      ],
      setup: [
        at('testTube', 220, 0),
        at('testTube', 400, 0),
        at('testTube', 580, 0),
        at('testTube', 780, 0),
        at('testTube', 980, 0),
        at('testTube', 1140, 0),
        at('deliveryTube', 500, 250)
      ],
      steps: [
        {
          text: '向第一支试管中加入碳酸钠溶液，再加入稀盐酸，观察产生气泡',
          hint: hintOf('na2co3', '碳酸钠溶液') + ' + ' + hintOf('hcl', '稀盐酸') + '；Na₂CO₃ + 2HCl = 2NaCl + H₂O + CO₂↑',
          check: function (w) { return fired(w, 'na2co3_hcl'); }
        },
        {
          text: '向第二支试管中加入澄清石灰水，用导管把第一支试管产生的气体通进去',
          hint: hintOf('caoh2', '澄清石灰水') + '；再用工具栏「导气」或「连接」把两支试管连起来，石灰水变浑浊说明气体是 CO₂',
          check: function (w) { return fired(w, 'co2_caoh2'); }
        },
        {
          text: '向第三支试管中加入氯化钠溶液，再滴入硝酸银溶液，产生白色沉淀',
          hint: hintOf('naclaq', '氯化钠溶液') + ' + ' + hintOf('agno3', '硝酸银溶液') + '；AgNO₃ + NaCl = AgCl↓ + NaNO₃',
          check: function (w) { return fired(w, 'agno3_nacl'); }
        },
        {
          text: '向第四支试管中加入碳酸钠溶液，再滴入氯化钡溶液，产生白色沉淀',
          hint: hintOf('na2co3', '碳酸钠溶液') + ' + ' + hintOf('bacl2', '氯化钡溶液') + '；BaCl₂ + Na₂CO₃ = BaCO₃↓ + 2NaCl',
          check: function (w) { return fired(w, 'bacl2_na2co3'); }
        },
        {
          text: '向第五支试管中加入硫酸钠溶液，再滴入氯化钡溶液，产生白色沉淀',
          hint: hintOf('na2so4', '硫酸钠溶液') + ' + ' + hintOf('bacl2', '氯化钡溶液') + '；BaCl₂ + Na₂SO₄ = BaSO₄↓ + 2NaCl（也可以先加硫酸铜溶液再加氯化钡）',
          check: function (w) { return fired(w, 'bacl2_na2so4'); }
        },
        {
          text: '用 pH 试纸检验第六支试管中的澄清石灰水，确认检验 CO₂ 用的试剂显碱性',
          hint: '先加入' + hintOf('caoh2', '澄清石灰水') + '，再用工具栏「检验」→「pH 试纸」；这也解释了为什么 CO₂ 能使它变浑浊',
          check: function (w) { return fired(w, 'co2_caoh2'); }
        }
      ]
    }
  ];

  CHEM.registerExperiments(LIST);
})(typeof window !== 'undefined' ? window : globalThis);
