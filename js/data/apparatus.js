/* =============================================================================
 * 虚拟化学实验室 —— 仪器库 (Apparatus)
 * -----------------------------------------------------------------------------
 * 坐标系约定（局部坐标）：
 *   原点 (0,0) 在仪器底面中心，x 向右，y 向上，仪器总高为 H。
 *   容器必须提供 profile(u)：返回高度 u 处"内腔"的半宽（单位与 H 一致）。
 *   渲染层会据 profile 数值积分出"高度 -> 体积"映射，从而按体积画出液面。
 *
 * category：
 *   container  可放到台面上，能盛放物质
 *   device     可放到台面上，具有行为（加热 / 支撑 / 固定 / 导气）
 *   tool       不占台面，点击后进入某种操作模式（搅拌、滴加、点燃……）
 *
 * heat：加热方式
 *   'direct' 可直接加热   'net' 必须垫石棉网   'none' 不能加热
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});

  var PI = Math.PI;

  /* 生成"平底 + 圆角"的 profile：flat 为直筒半宽，r 为底部圆角半径 */
  function flatProfile(flat, r) {
    return function (u) {
      if (u >= r) return flat;
      var d = r - u;                 // 距离底面的高度差
      var k = r * r - d * d;
      return (flat - r) + (k > 0 ? Math.sqrt(k) : 0);
    };
  }
  /* 生成"半球底"的 profile：ball 为直筒半宽 */
  function roundProfile(ball) {
    return function (u) {
      if (u >= ball) return ball;
      var d = ball - u;
      var k = ball * ball - d * d;
      return k > 0 ? Math.sqrt(k) : 0;
    };
  }
  /* 生成锥形 profile：bottom 半宽 -> top 半宽，过渡高度为 span */
  function coneProfile(bottom, top, span, r) {
    r = r || 0;
    return function (u) {
      var hw;
      if (u >= span) hw = top;
      else hw = bottom + (top - bottom) * (u / span);
      if (r > 0 && u < r) {
        // 底部圆角平滑
        var t = u / r;
        hw = hw * (0.72 + 0.28 * t) + r * 0.28 * (1 - t) * 0;
      }
      return hw;
    };
  }

  var APPARATUS = [
    /* ===================== 容器类 ===================== */
    {
      type: 'testTube', name: '试管', category: 'container',
      H: 150, capacity: 20, heat: 'direct', glass: '#cfe3f2',
      profile: roundProfile(9),
      tags: ['可直接加热', '少量试剂反应容器'],
      tip: '液体体积不超过试管容积的 1/3；加热时用试管夹夹住中上部，管口不对着人。'
    },
    {
      type: 'beakerSmall', name: '小烧杯', category: 'container',
      H: 85, capacity: 100, heat: 'net', glass: '#cfe3f2',
      profile: flatProfile(30, 4),
      tags: ['需垫石棉网加热', '配制溶液'],
      tip: '加热烧杯必须垫石棉网，使其受热均匀。'
    },
    {
      type: 'beakerBig', name: '大烧杯', category: 'container',
      H: 112, capacity: 250, heat: 'net', glass: '#cfe3f2',
      profile: flatProfile(41.5, 5),
      tags: ['需垫石棉网加热', '较多量反应'],
      tip: '加热烧杯必须垫石棉网。'
    },
    {
      type: 'conicalFlask', name: '锥形瓶', category: 'container',
      H: 140, capacity: 100, heat: 'net', glass: '#cfe3f2',
      profile: coneProfile(37, 11, 108, 4),
      tags: ['需垫石棉网加热', '便于振荡'],
      tip: '锥形瓶便于振荡，常用于需要摇匀的反应。'
    },
    {
      type: 'gasJar', name: '集气瓶', category: 'container',
      H: 108, capacity: 250, heat: 'none', glass: '#cfe3f2',
      profile: flatProfile(31.5, 3),
      tags: ['收集气体', '不能加热'],
      tip: '集气瓶用于收集和检验气体，不能加热。'
    },
    {
      type: 'evaporatingDish', name: '蒸发皿', category: 'container',
      H: 34, capacity: 30, heat: 'direct', glass: '#dbe7f0',
      profile: function (u) { return u >= 28 ? 42 : 18 + 24 * (u / 28); },
      tags: ['可直接加热', '蒸发浓缩'],
      tip: '蒸发时用玻璃棒不断搅拌，出现较多固体时停止加热，用余热蒸干。'
    },
    {
      type: 'graduatedCylinder', name: '量筒', category: 'container',
      H: 190, capacity: 100, heat: 'none', glass: '#cfe3f2',
      profile: flatProfile(12.5, 2),
      tags: ['量取液体', '不能加热', '不能作反应容器'],
      tip: '量筒只能量取液体体积，不能加热，也不能在量筒内进行反应。'
    },
    {
      type: 'volumetricFlask', name: '容量瓶', category: 'container', level: 'senior',
      H: 200, capacity: 100, heat: 'none', glass: '#cfe3f2',
      /* 下部是梨形瓶体，上部是细长瓶颈 */
      profile: function (u) {
        if (u < 46) return 13 + 30 * Math.pow(u / 46, 0.55);
        if (u < 92) return 43 - 34 * Math.pow((u - 46) / 46, 1.5);
        return 9;
      },
      tags: ['配制一定物质的量浓度的溶液', '不能加热', '不能作反应容器'],
      tip: '容量瓶用于配制准确浓度的溶液：加水到刻度线，视线与凹液面最低处相平。不能在容量瓶里溶解固体或进行反应。'
    },
    {
      type: 'combustionSpoon', name: '燃烧匙', category: 'container', level: 'senior',
      H: 20, capacity: 4, heat: 'direct', glass: '#d8dde2',
      profile: function (u) { return u >= 12 ? 11 : 3.5 + 7.5 * (u / 12); },
      tags: ['可直接加热', '燃烧少量固体'],
      tip: '把少量固体（如硫、红磷、钠）放在燃烧匙里，再伸入集气瓶中燃烧。'
    },

    /* ===================== 装置类 ===================== */
    {
      type: 'testTubeRack', name: '试管架', category: 'device',
      H: 78, w: 150, slots: 5, slotSpacing: 28,
      tags: ['固定试管'],
      tip: '把试管放到试管架上，可以同时进行多个对比实验。'
    },
    {
      type: 'alcoholLamp', name: '酒精灯', category: 'device',
      H: 62, heatSource: true, flameHeight: 46,
      tags: ['加热源'],
      tip: '用外焰加热；熄灭时用灯帽盖灭，不能用嘴吹灭。'
    },
    {
      type: 'ironStand', name: '铁架台', category: 'device',
      H: 210, w: 130, clampY: 120, clampReach: 92,
      tags: ['支撑固定'],
      tip: '铁架台配合铁夹、铁圈固定仪器。'
    },
    {
      type: 'asbestosNet', name: '石棉网', category: 'device',
      H: 10, w: 78,
      tags: ['使受热均匀'],
      tip: '烧杯、锥形瓶等玻璃仪器加热时必须垫石棉网。'
    },
    {
      type: 'tripod', name: '三脚架', category: 'device',
      H: 44, w: 96,
      tags: ['支撑'],
      tip: '三脚架上放石棉网，可用于加热。'
    },
    {
      type: 'funnel', name: '漏斗', category: 'device',
      H: 96, w: 88,
      tags: ['过滤', '加液'],
      tip: '过滤时做到"一贴、二低、三靠"。'
    },
    {
      type: 'deliveryTube', name: '导管', category: 'device',
      H: 70, w: 110,
      tags: ['导气'],
      tip: '把产生的气体导入集气瓶或另一容器中。'
    },
    {
      type: 'separatoryFunnel', name: '分液漏斗', category: 'container', level: 'senior',
      H: 160, capacity: 60, heat: 'none', glass: '#cfe3f2',
      /* 下端细管（含旋塞）→ 梨形球体 → 短颈 → 上口 */
      profile: function (u) {
        if (u < 22) return 3.2;
        if (u < 96) return 3.2 + 30 * Math.sin(Math.PI * (u - 22) / 74);
        if (u < 128) return 9;
        return 15;
      },
      tags: ['控制加液速率', '分液', '装配到其他容器上'],
      tip: '分液漏斗可以控制液体的滴加速率。把它拖到另一个容器上（或用「连接」工具）装配起来，' +
        '里面的液体会逐滴流入下面的容器 —— 这正是"边滴加边观察"的做法。'
    },

    /* ===================== 工具类 ===================== */
    {
      type: 'glassRod', name: '玻璃棒', category: 'tool', action: 'stir',
      tip: '搅拌可以加快溶解和反应速率，也能使受热均匀。'
    },
    {
      type: 'dropper', name: '胶头滴管', category: 'tool', action: 'drip',
      tip: '滴加少量液体，滴管要垂直悬空，不能伸入容器内。'
    },
    {
      type: 'spoon', name: '药匙', category: 'tool', action: 'addSolid',
      tip: '取用粉末状固体药品。'
    },
    {
      type: 'tweezers', name: '镊子', category: 'tool', action: 'addSolid',
      tip: '取用块状固体药品。'
    },
    {
      type: 'matches', name: '火柴', category: 'tool', action: 'ignite',
      tip: '点燃酒精灯或可燃物。'
    },
    {
      type: 'litmusTool', name: '玻璃棒（蘸取）', category: 'tool', action: 'test',
      tip: '用玻璃棒蘸取待测液滴在 pH 试纸上，与标准比色卡对照。'
    },
    {
      type: 'tongs', name: '坩埚钳', category: 'tool', action: 'hold',
      tip: '夹持灼热的蒸发皿、坩埚等。'
    }
  ];

  var MAP = Object.create(null);
  APPARATUS.forEach(function (a) {
    MAP[a.type] = a;
    if (!a.tags) a.tags = [];
    if (!a.w) a.w = 0;
  });

  CHEM.APPARATUS = APPARATUS;
  CHEM.APPARATUS_MAP = MAP;
  CHEM.getApp = function (t) { return MAP[t] || null; };
  CHEM.isContainer = function (t) {
    var a = MAP[t];
    return !!a && a.category === 'container';
  };

  CHEM.APPARATUS_GROUPS = [
    { name: '反应容器', types: ['testTube', 'beakerSmall', 'beakerBig', 'conicalFlask', 'gasJar', 'evaporatingDish', 'graduatedCylinder', 'volumetricFlask', 'combustionSpoon'] },
    { name: '加热与支撑', types: ['alcoholLamp', 'ironStand', 'asbestosNet', 'tripod', 'testTubeRack'] },
    { name: '加液与导气', types: ['separatoryFunnel', 'funnel', 'deliveryTube'] },
    { name: '实验工具', types: ['glassRod', 'dropper', 'spoon', 'tweezers', 'matches', 'litmusTool', 'tongs'] }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
