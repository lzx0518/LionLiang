/* =============================================================================
 * 物理教材实验任务 —— 初中 (js/physics/tasks-junior.js)
 * -----------------------------------------------------------------------------
 * 每条任务 = { id, name, level, chapter, sim, preset?, goal, intro,
 *              principle: [公式/规律], steps: [{ text, hint, check(sim), act(sim) }] }
 *
 * · check(sim) 在每帧被调用，返回 true 即视为该步完成（与化学实验的判定方式一致）
 * · act(sim) 是**照着教材该怎么做**的动作脚本，只有测试用（test/validate-physics.mjs）：
 *   它会真的驱动仿真实例走一遍，用来证明「这一步真的做得出来」，
 *   而不是像静态检查那样只能证明字段存在。界面不会调用 act。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});

  /* 推进若干帧，供 act 里驱动动画用 */
  function tick(sim, seconds) {
    var n = Math.round((seconds || 1) / 0.05);
    for (var i = 0; i < n; i++) sim.update(0.05);
  }

  var TASKS = [
    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_sound',
      name: '探究声音的特性与传播',
      level: 'junior',
      sim: 'sound',
      chapter: '八年级上册 · 第二章 声现象',
      goal: '通过敲击音叉，认识音调由频率决定、响度由振幅决定、音色由波形决定；再抽真空，说明声音的传播需要介质。',
      intro: '音叉振动发出声音，把它的振动通过示波器「看」出来，再改变频率、振幅和波形，比较听到的声音有什么不同。',
      principle: ['音调 — 频率（f，单位 Hz）', '响度 — 振幅（和距离）', '音色 — 发声体的材料与结构'],
      steps: [
        {
          text: '敲击音叉，让它振动发声',
          hint: '点控制条上的「敲击音叉」',
          check: function (s) { return s.isStruck(); },
          act: function (s) { s.__test.strike(); }
        },
        {
          text: '把频率调高到 800 Hz 以上，观察波形变密、音调变高',
          hint: '拖动「频率 f」滑块',
          check: function (s) { return s.getFreq() >= 800 && s.wavelengthCM() < 50; },
          act: function (s) { s.__test.setFreq(900); }
        },
        {
          text: '增大振幅，观察波形变高、响度变大',
          hint: '拖动「振幅 A」滑块',
          check: function (s) { return s.getAmp() >= 0.8 && s.loudness() > 0.3; },
          act: function (s) { s.__test.setAmp(0.95); }
        },
        {
          text: '换成方波或三角波，比较音色的不同',
          hint: '切换「波形（音色）」下拉框',
          check: function (s) { return s.getTimbre() !== 'sine'; },
          act: function (s) { s.__test.setTimbre('square'); }
        },
        {
          text: '把罩内空气抽到接近真空，发现声音传不出来',
          hint: '把「罩内真空度」拉到 95% 以上',
          check: function (s) { return s.getVacuum() >= 0.95 && !s.canTransmit(); },
          act: function (s) { s.__test.setVacuum(0.97); }
        },
        {
          text: '把介质换成水（或钢铁），比较声速的大小',
          hint: '「传播介质」里选水或钢铁',
          check: function (s) { return s.getMedium() !== 'air' && s.speed() > 340; },
          act: function (s) { s.__test.setMedium('water'); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_melt',
      name: '探究冰熔化时温度的变化规律',
      level: 'junior',
      sim: 'melt',
      chapter: '八年级上册 · 第三章 物态变化',
      goal: '用温度计测量冰在加热过程中温度的变化，画出温度—时间图像，认识晶体熔化的特点（有固定熔点、熔化时吸热但温度不变）。',
      intro: '把碎冰放在烧杯里用水浴法加热，每隔一段时间读一次温度，直到冰全部熔化后再加热一会儿。',
      principle: ['冰是晶体，熔点 0 ℃', '熔化过程：吸热，温度不变（固液共存）'],
      steps: [
        {
          text: '选择「冰的熔化」，把加热功率调到 300 W 以上',
          hint: '选实验内容 + 拖「加热功率」滑块',
          check: function (s) { return s.mode() === 'ice' && s.getPower() >= 300; },
          act: function (s) { s.__test.setMode('ice'); s.__test.setPower(300); }
        },
        {
          text: '开始加热，注意温度计的示数',
          hint: '点「开始加热」',
          check: function (s) { return s.isHeating(); },
          act: function (s) { s.__test.heat(); }
        },
        {
          text: '温度升到 0 ℃：继续吸热但温度不再上升',
          hint: '等温度升到 0 ℃，图像上出现水平段',
          check: function (s) { return s.temp() >= -0.01 && s.temp() <= 0.01; },
          act: function (s) { s.__test.setQ(9); }
        },
        {
          text: '观察熔化过程：冰逐渐变少，处于固液共存状态',
          hint: '看点「熔化进度」和烧杯里的冰块',
          check: function (s) { return s.phase() === 'melting'; },
          act: function (s) { s.__test.setQ(45); }
        },
        {
          text: '冰全部熔化完，温度又开始上升',
          hint: '继续加热到冰完全熔化',
          check: function (s) { return s.phase() === 'liquid'; },
          act: function (s) { s.__test.setQ(78); }
        },
        {
          text: '再加热一会儿，让水的温度升到 10 ℃ 以上',
          hint: '继续加热',
          check: function (s) { return s.temp() >= 10; },
          act: function (s) { s.__test.setQ(86); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_boil',
      name: '观察水的沸腾',
      level: 'junior',
      sim: 'melt',
      chapter: '八年级上册 · 第三章 物态变化',
      goal: '观察水沸腾前后温度的变化、气泡的变化，认识沸腾的特点（沸点、吸热但温度不变），并了解气压对沸点的影响。',
      intro: '给水加热，从 90 ℃ 开始每隔一段时间记录温度，水沸腾后继续加热 2 分钟，看温度是否变化；再降低气压，比较沸点。',
      principle: ['水沸腾时吸热，但温度保持在沸点不变', '气压越低，沸点越低'],
      steps: [
        {
          text: '选择「水的沸腾」，功率调到 300 W 以上',
          hint: '选实验内容 + 拖「加热功率」滑块',
          check: function (s) { return s.mode() === 'water' && s.getPower() >= 300; },
          act: function (s) { s.__test.setMode('water'); s.__test.setPower(300); }
        },
        {
          text: '把气压设为 1 个标准大气压（沸点应为 100 ℃）',
          hint: '拖「气压」滑块到 1.00 atm',
          check: function (s) { return Math.abs(s.getAirP() - 1) < 0.03 && Math.abs(s.boilPoint() - 100) < 1.5; },
          act: function (s) { s.__test.setAirP(1.0); }
        },
        {
          text: '开始加热，让水温升到 90 ℃ 以上',
          hint: '点「开始加热」并等待',
          check: function (s) { return s.isHeating() && s.temp() >= 90; },
          act: function (s) { s.__test.heat(); s.__test.setQ(60); }
        },
        {
          text: '水温达到沸点后不再上升：水在沸腾',
          hint: '看图像上的水平段与水中大量气泡',
          check: function (s) { return s.phase() === 'boiling' && Math.abs(s.temp() - s.boilPoint()) < 0.05; },
          act: function (s) { s.__test.setQ(70); }
        },
        {
          text: '把气压降到 0.7 atm，发现沸点变低了',
          hint: '拖「气压」滑块到 0.70 atm',
          check: function (s) { return s.getAirP() <= 0.71 && s.boilPoint() < 95; },
          act: function (s) { s.__test.setAirP(0.7); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_mirror',
      name: '探究平面镜成像的特点',
      level: 'junior',
      sim: 'mirror',
      chapter: '八年级上册 · 第四章 光现象',
      goal: '用玻璃板代替平面镜，通过「等效替代」确定像的位置，得出像与物大小相等、到镜面距离相等、成的是虚像。',
      intro: '玻璃板既能成像又能透光。把蜡烛 A 放在玻璃板前，拿一支完全相同的蜡烛 B 在板后移动，直到它与 A 的像完全重合。',
      principle: ['像与物大小相等', '像距 = 物距', '像与物关于镜面对称，成虚像'],
      steps: [
        {
          text: '点燃蜡烛 A，观察玻璃板后面的像',
          hint: '点一下画布上的蜡烛 A（或拖物距滑块后再点）',
          check: function (s) { return s.isLit(); },
          act: function (s) { s.__test.light(); }
        },
        {
          text: '移动蜡烛 B，直到它与蜡烛 A 的像完全重合',
          hint: '拖动画布上的蜡烛 B',
          check: function (s) { return s.coincide(); },
          act: function (s) { s.__test.moveBToImage(); }
        },
        {
          text: '记录物距与像距（第一组数据）',
          hint: '点「记录一组数据」',
          check: function (s) { return s.records().length >= 1; },
          act: function (s) { s.__test.record(); }
        },
        {
          text: '改变物距，再做一组（第 2 组）',
          hint: '拖动物距滑块后重新让 B 与像重合',
          check: function (s) { return s.records().length >= 2 && Math.abs(s.getU() - 12) < 1.5; },
          act: function (s) { s.__test.setU(12); s.__test.moveBToImage(); s.__test.record(); }
        },
        {
          text: '把光屏放到像的位置，发现光屏上接不到像',
          hint: '点「把光屏移到像的位置」',
          check: function (s) { return s.screenCM() !== null && !s.imageOnScreen(); },
          act: function (s) { s.__test.putScreen(); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_lens',
      name: '探究凸透镜成像的规律',
      level: 'junior',
      sim: 'lens',
      chapter: '八年级上册 · 第五章 透镜及其应用',
      goal: '改变物距并移动光屏找到最清晰的像，归纳 u>2f、u=2f、f<u<2f、u<f 各区域的成像特点。',
      intro: '保持透镜焦距不变，依次把蜡烛放在 u>2f、u=2f、f<u<2f、u<f 四个区域，观察像的倒正、大小和虚实。',
      principle: ['u>2f → 倒立缩小实像（照相机）', 'u=2f → 倒立等大实像', 'f<u<2f → 倒立放大实像（投影仪）', 'u<f → 正立放大虚像（放大镜）'],
      steps: [
        {
          text: '把凸透镜的焦距设为 15 cm',
          hint: '拖控制条上的「透镜焦距 f」（本实验用它当光具座参数）',
          check: function (s) { return Math.abs(s.getF() - 15) < 0.5; },
          act: function (s) { s.set('f', 15); }
        },
        {
          text: '把蜡烛放在 u>2f 处，移动光屏得到最清晰的像',
          hint: '拖动蜡烛与光屏（物距 u 要大于 30 cm）',
          check: function (s) { return !!s.findings().gt2f; },
          act: function (s) {
            s.__test.setF(15); s.__test.setU(40);
            s.__test.setScreenCM(40 * 15 / (40 - 15));
          }
        },
        {
          text: '把蜡烛放在 u=2f 处，得到倒立、等大的实像',
          hint: '把物距调到 30 cm，再把光屏移到 30 cm 处',
          check: function (s) { return !!s.findings().eq2f; },
          act: function (s) { s.__test.setU(30); s.__test.setScreenCM(30); }
        },
        {
          text: '把蜡烛放在 f<u<2f 处，得到倒立、放大的实像',
          hint: '物距调到 20 cm 左右',
          check: function (s) { return !!s.findings().between; },
          act: function (s) {
            s.__test.setU(22); s.__test.setScreenCM(22 * 15 / (22 - 15));
          }
        },
        {
          text: '把蜡烛移到 u<f 处，观察到正立、放大的虚像（光屏接不到）',
          hint: '物距调到 10 cm 以下',
          check: function (s) { return s.region() === 'ltf' && s.imageKind() === 'virtual'; },
          act: function (s) { s.__test.setU(10); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_reflect',
      name: '探究光反射时的规律',
      level: 'junior',
      sim: 'refract',
      preset: { mode: 'air2glass', theta: 30 },
      chapter: '八年级上册 · 第四章 光现象',
      goal: '改变入射角，观察反射光线与折射光线的变化，得出反射角等于入射角、光从空气斜射入玻璃时折射角小于入射角。',
      intro: '让一束激光沿玻璃板的表面射到界面上，量出入射角、反射角和折射角，比较它们的大小关系。',
      principle: ['反射角 = 入射角', '光从空气斜射入玻璃：折射角 < 入射角'],
      steps: [
        {
          text: '让光从空气斜射向玻璃，把入射角调为 30°',
          hint: '拖「入射角 θ」滑块到 30°',
          check: function (s) { return s.mode() === 'air2glass' && Math.abs(s.getTheta() - 30) < 2; },
          act: function (s) { s.__test.setMode('air2glass'); s.__test.setTheta(30); }
        },
        {
          text: '把入射角增大到 60°，观察反射角、折射角也跟着变化',
          hint: '继续拖「入射角 θ」滑块',
          check: function (s) { return s.getTheta() >= 58; },
          act: function (s) { s.__test.setTheta(60); }
        },
        {
          text: '记录三组入射角与折射角的数据',
          hint: '每改一次入射角点一次「记录一组数据」',
          check: function (s) { return s.records().length >= 3 && s.records()[0].nEst > 1.3; },
          act: function (s) {
            [30, 45, 60].forEach(function (a) { s.__test.setTheta(a); s.__test.record(); });
          }
        },
        {
          text: '让光从玻璃射向空气，把入射角增大到临界角以上，出现全反射',
          hint: '切换光路方向，入射角调到 60° 以上',
          check: function (s) { return s.mode() === 'glass2air' && s.tir() && s.tirTime() > 0.1; },
          act: function (s) {
            s.__test.setMode('glass2air'); s.__test.setTheta(60); tick(s, 0.3);
          }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_gravity',
      name: '探究重力与质量的关系',
      level: 'junior',
      sim: 'gravity',
      chapter: '八年级下册 · 第七章 力',
      goal: '用弹簧测力计测出不同质量砝码的重力，作 G–m 图像，得出重力与质量成正比、比值 g = 9.8 N/kg。',
      intro: '把 50 g、150 g、250 g …… 的砝码依次挂在弹簧测力计下，读出重力，算出每次的 G/m。',
      principle: ['G = m·g', 'g = 9.8 N/kg（地球上）'],
      steps: [
        {
          text: '把装置放在地球上，挂上 0.10 kg 的砝码并记录',
          hint: '「所在位置」选地球，调质量后点「记录一组」',
          check: function (s) { return s.planet() === 'earth' && s.records().length >= 1; },
          act: function (s) { s.__test.setPlanet('earth'); s.__test.setM(0.1); s.__test.record(); }
        },
        {
          text: '换成 0.30 kg 的砝码，再记录一组',
          hint: '拖「砝码质量」滑块',
          check: function (s) { return s.records().length >= 2; },
          act: function (s) { s.__test.setM(0.3); s.__test.record(); }
        },
        {
          text: '换成 0.50 kg 的砝码，再记录一组（共 3 组）',
          hint: '看各组 G/m 是否都等于 9.8 N/kg',
          check: function (s) { return s.records().length >= 3 && Math.abs(s.getG() / s.getM() - 9.8) < 0.01; },
          act: function (s) { s.__test.setM(0.5); s.__test.record(); }
        },
        {
          text: '把装置「搬到月球」：同一个砝码质量不变，重力变小',
          hint: '「所在位置」选月球',
          check: function (s) { return s.planet() === 'moon' && s.g() < 2 && s.getG() > 0; },
          act: function (s) { s.__test.setPlanet('moon'); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_friction',
      name: '探究影响滑动摩擦力大小的因素',
      level: 'junior',
      sim: 'friction',
      chapter: '八年级下册 · 第八章 运动和力',
      goal: '用弹簧测力计水平匀速拉动木块，读出滑动摩擦力；通过对比得出压力越大、接触面越粗糙，滑动摩擦力越大，且与接触面积无关。',
      intro: '木块做匀速直线运动时，拉力与滑动摩擦力是一对平衡力，因此测力计的读数就等于滑动摩擦力的大小。',
      principle: ['f = μN', '与压力、接触面粗糙程度有关，与接触面积无关'],
      steps: [
        {
          text: '选「木板」作接触面，不加砝码，匀速拉动木块',
          hint: '选接触面后点「匀速拉动」',
          check: function (s) { return s.surface() === 'wood' && s.isPulling(); },
          act: function (s) { s.__test.setSurface('wood'); s.__test.setWeights(0); s.__test.pull(); }
        },
        {
          text: '记录这一组读数（摩擦力）',
          hint: '点「记录读数」',
          check: function (s) { return s.records().length >= 1; },
          act: function (s) { s.__test.record(); }
        },
        {
          text: '在木块上放 2 个砝码（压力变大），重新拉动并记录',
          hint: '拖「木块上的砝码」滑块',
          check: function (s) { return s.records().length >= 2 && s.records()[1].f > s.records()[0].f; },
          act: function (s) { s.__test.setWeights(2); s.__test.pull(); s.__test.record(); }
        },
        {
          text: '换成「毛巾」（更粗糙），摩擦力更大',
          hint: '接触面选毛巾后重新拉动记录',
          check: function (s) { return s.surface() === 'towel' && s.records().length >= 3 && s.records()[2].f > s.records()[1].f; },
          act: function (s) { s.__test.setSurface('towel'); s.__test.pull(); s.__test.record(); }
        },
        {
          text: '把木块侧放（接触面积变小），摩擦力不变',
          hint: '「木块放置」改成侧放后重新拉动记录',
          check: function (s) {
            var r = s.records();
            return s.pose() === 'side' && r.length >= 4 && Math.abs(r[3].f - r[2].f) < 1e-6;
          },
          act: function (s) { s.__test.setPose('side'); s.__test.pull(); s.__test.record(); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_pressure_solid',
      name: '探究压力的作用效果',
      level: 'junior',
      sim: 'pressure',
      chapter: '八年级下册 · 第九章 压强',
      goal: '用小桌压海绵，改变压力与受力面积，观察凹陷深浅，得出压强与压力成正比、与受力面积成反比。',
      intro: '小桌正放时是四个桌腿压在海绵上，受力面积小；倒放时整个桌面压在海绵上，受力面积大。比较两种放法的凹陷深度。',
      principle: ['p = F / S', '压力越大、受力面积越小，压强越大'],
      steps: [
        {
          text: '选「固体」探究内容，小桌桌腿朝下、不加砝码，记录压强',
          hint: '放置方式选「桌腿朝下」后点「记录一组数据」',
          check: function (s) { return s.mode() === 'solid' && s.face() === 'legs' && s.records().length >= 1; },
          act: function (s) { s.__test.setMode('solid'); s.__test.setFace('legs'); s.__test.setWeights(0); s.__test.record(); }
        },
        {
          text: '在小桌上加 2 个砝码（压力变大），凹陷更深',
          hint: '拖「桌上砝码」滑块',
          check: function (s) { return s.records().length >= 2 && s.records()[1].p > s.records()[0].p; },
          act: function (s) { s.__test.setWeights(2); s.__test.record(); }
        },
        {
          text: '改成「桌面朝下」（受力面积变大），压强明显变小',
          hint: '放置方式选「桌面朝下」',
          check: function (s) {
            return s.face() === 'top' && s.records().length >= 3 && s.records()[2].p < s.records()[1].p; },
          act: function (s) { s.__test.setFace('top'); s.__test.record(); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_pressure_liquid',
      name: '探究液体内部的压强',
      level: 'junior',
      sim: 'pressure',
      chapter: '八年级下册 · 第九章 压强',
      goal: '用压强计探究液体内部压强与深度、液体密度的关系，并验证同一深度各方向的压强相等。',
      intro: '把压强计的探头放入水中，改变深度、液体种类和探头朝向，观察 U 形管两侧液面的高度差怎样变化。',
      principle: ['p = ρgh', '同一深度，各方向压强相等'],
      steps: [
        {
          text: '选「液体」探究内容，把探头放入水中 10 cm 深处，记录压强',
          hint: '拖「探头深度 h」滑块到 10 cm',
          check: function (s) { return s.mode() === 'liquid' && s.liquid() === 'water' && s.records().length >= 1; },
          act: function (s) { s.__test.setMode('liquid'); s.__test.setLiquid('water'); s.__test.setDepth(10); s.__test.record(); }
        },
        {
          text: '把探头下移到 30 cm 深处，压强变大',
          hint: '继续拖深度滑块',
          check: function (s) { return s.records().length >= 2 && s.records()[1].p > s.records()[0].p; },
          act: function (s) { s.__test.setDepth(30); s.__test.record(); }
        },
        {
          text: '把水换成盐水（密度更大），同一深度压强更大',
          hint: '「液体」下拉框选盐水',
          check: function (s) { return s.liquid() === 'brine' && s.records().length >= 3 && s.records()[2].p > s.records()[1].p; },
          act: function (s) { s.__test.setLiquid('brine'); s.__test.record(); }
        },
        {
          text: '保持深度和液体不变，改变探头朝向，压强不变',
          hint: '「探头朝向」选朝下或朝侧面',
          check: function (s) {
            var r = s.records();
            return r.length >= 4 && s.face() !== 'up' && Math.abs(r[3].p - r[2].p) < 1e-6;
          },
          act: function (s) { s.__test.setFace('down'); s.__test.record(); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_buoy',
      name: '探究浮力的大小（阿基米德原理）',
      level: 'junior',
      sim: 'buoy',
      chapter: '八年级下册 · 第十章 浮力',
      goal: '用弹簧测力计测出物体浸在液体中时的浮力，把排开的液体收集起来称重，得出 F浮 = G排 = ρ液·g·V排。',
      intro: '先读物体在空气中的重力 G，再把它慢慢浸入液体中读拉力 F拉，两者之差就是浮力；同时用量筒收集被排开的液体。',
      principle: ['F浮 = G − F拉', 'F浮 = G排 = ρ液·g·V排'],
      steps: [
        {
          text: '选石块与水，把石块部分浸入水中',
          hint: '拖「物体底面浸入深度 h」滑块',
          check: function (s) { return s.obj() === 'stone' && s.liquid() === 'water' && s.depth() > 0 && !s.immersed(); },
          act: function (s) { s.__test.setObj('stone'); s.__test.setLiquid('water'); s.__test.setDepth(2); }
        },
        {
          text: '记录一组数据，比较 F浮 与 G排',
          hint: '点「记录一组数据」',
          check: function (s) { return s.records().length >= 1 && Math.abs(s.records()[0].F - s.records()[0].Grep) < 0.005; },
          act: function (s) { s.__test.record(); }
        },
        {
          text: '继续浸入，直到石块完全浸没',
          hint: '把浸入深度加到石块边长以上',
          check: function (s) { return s.immersed(); },
          act: function (s) { s.__test.setDepth(6); }
        },
        {
          text: '记录完全浸没时的浮力',
          hint: '再点一次「记录一组数据」',
          check: function (s) { return s.records().length >= 2; },
          act: function (s) { s.__test.record(); }
        },
        {
          text: '完全浸没后再加深深度，浮力保持不变',
          hint: '继续加深并记录，与上一组比较',
          check: function (s) {
            var r = s.records();
            return r.length >= 3 && s.depth() > 6 && Math.abs(r[2].F - r[1].F) < 1e-6;
          },
          act: function (s) { s.__test.setDepth(10); s.__test.record(); }
        },
        {
          text: '把水换成盐水，浮力变大',
          hint: '「液体」下拉框选盐水',
          check: function (s) {
            var r = s.records();
            return s.liquid() === 'brine' && r.length >= 4 && r[3].F > r[2].F;
          },
          act: function (s) { s.__test.setLiquid('brine'); s.__test.record(); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_lever',
      name: '探究杠杆的平衡条件',
      level: 'junior',
      sim: 'lever',
      chapter: '八年级下册 · 第十二章 简单机械',
      goal: '在杠杆两侧挂钩码使它水平平衡，记录多组动力、动力臂、阻力、阻力臂，归纳 F₁L₁ = F₂L₂。',
      intro: '每个钩码重 0.5 N，相邻刻度间距 1 格。点击刻度处挂钩码，点击已挂的钩码取下；杠杆水平平衡时自动记录一组数据。',
      principle: ['F₁L₁ = F₂L₂', '动力臂 × 动力 = 阻力臂 × 阻力'],
      steps: [
        {
          text: '在左侧第 2 格挂 2 个钩码',
          hint: '点击杠杆左侧「2」刻度处两次',
          check: function (s) { return s.hookCount() >= 2 && s.torqueL() > 0; },
          act: function (s) { s.__test.hang(-1, 2, 2); }
        },
        {
          text: '在右侧第 4 格挂 1 个钩码，使杠杆水平平衡',
          hint: '点击杠杆右侧「4」刻度处',
          check: function (s) { return s.balanced(); },
          act: function (s) { s.__test.hang(1, 4, 1); }
        },
        {
          text: '记录这一组数据（平衡时自动记录）',
          hint: '看右侧「实验记录」里自动写出的 F₁L₁ = F₂L₂',
          check: function (s) { return s.records().length >= 1; },
          act: function () { /* 平衡时已自动记录 */ }
        },
        {
          text: '换一组数据：左侧第 3 格挂 2 个、右侧第 2 格挂 3 个，再次平衡',
          hint: '先点「取下全部钩码」，再重新挂',
          check: function (s) { return s.records().length >= 2 && s.balanced(); },
          act: function (s) {
            s.__test.clear(); s.__test.hang(-1, 3, 2); s.__test.hang(1, 2, 3);
          }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_solenoid',
      name: '探究通电螺线管的磁场',
      level: 'junior',
      sim: 'solenoid',
      chapter: '九年级 · 第二十章 电与磁',
      goal: '闭合开关观察小磁针的偏转，判断通电螺线管的磁极；改变电流方向、增大电流、插入铁芯，认识磁性强弱的变化。',
      intro: '把小磁针放在螺线管周围，闭合开关后小磁针会按磁感线方向排列。用安培定则（右手螺旋定则）可以判断磁极。',
      principle: ['通电螺线管的磁场与条形磁体相似', '电流方向决定磁极（安培定则）', '电流越大、匝数越多、插入铁芯，磁性越强'],
      steps: [
        {
          text: '闭合开关，给螺线管通电',
          hint: '点「闭合开关」',
          check: function (s) { return s.isOn(); },
          act: function (s) { s.__test.turnOn(); }
        },
        {
          text: '观察小磁针偏转，记录磁极与吸起大头针的数量',
          hint: '看面板上的磁极与「吸起大头针」',
          check: function (s) { return s.records().length >= 1 && s.records()[0].clips > 0; },
          act: function (s) { s.__test.record(); }
        },
        {
          text: '改变电流方向，观察磁极对调',
          hint: '「电流方向」下拉框选「反向」',
          check: function (s) { return s.dir() === 'ccw' && s.poles().left === 'S'; },
          act: function (s) { s.__test.setDir('ccw'); }
        },
        {
          text: '把电流增大到 2 A，磁性增强',
          hint: '拖「电流 I」滑块到最大',
          check: function (s) { return s.strength() >= 1.9; },
          act: function (s) { s.__test.setI(2); }
        },
        {
          text: '插入铁芯，磁性明显增强（吸起的大头针更多）',
          hint: '点「插入铁芯」',
          check: function (s) { return s.hasCore() && s.clips() > 8; },
          act: function (s) { s.__test.setCore(true); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_j_ohm',
      name: '用电压表、电流表测电阻（伏安法）',
      level: 'junior',
      sim: 'circuit',
      chapter: '九年级 · 第十七章 欧姆定律',
      goal: '按图连接电路，用电压表测电阻两端电压、电流表测通过它的电流，由 R = U / I 求电阻，验证同一电阻的 U/I 是定值。',
      intro: '按「电源 — 开关 — 电流表 — 定值电阻」顺序串联，电压表并联在定值电阻两端。闭合开关后读出 U 与 I。',
      principle: ['R = U / I', '同一导体，U 与 I 成正比'],
      steps: [
        {
          text: '把电源、开关、电流表、定值电阻连成串联电路',
          hint: '在画布上方点选元件，接好四根导线',
          check: function (s) { return s.count('battery') >= 1 && s.count('switch') >= 1 && s.count('ammeter') >= 1 && s.count('resistor') >= 1; },
          act: function (s) {
            s.__test.add('battery', 220, 320);
            s.__test.add('switch', 360, 320);
            s.__test.add('ammeter', 500, 320);
            s.__test.add('resistor', 640, 320);
            var c = s.comps();
            s.__test.wire(c[0].uid, 'B', c[1].uid, 'A');
            s.__test.wire(c[1].uid, 'B', c[2].uid, 'A');
            s.__test.wire(c[2].uid, 'B', c[3].uid, 'A');
            s.__test.wire(c[3].uid, 'B', c[0].uid, 'A');
            s.__test.solveNow();
          }
        },
        {
          text: '把电压表并联在定值电阻两端',
          hint: '放入电压表，两个接线柱分别接到电阻两端',
          check: function (s) { return s.count('voltmeter') >= 1 && s.wireCount() >= 6; },
          act: function (s) {
            s.__test.add('voltmeter', 640, 430);
            var c = s.comps();
            var r = c.filter(function (x) { return x.type === 'resistor'; })[0];
            var vm = c.filter(function (x) { return x.type === 'voltmeter'; })[0];
            s.__test.wire(vm.uid, 'A', r.uid, 'A');
            s.__test.wire(vm.uid, 'B', r.uid, 'B');
            s.__test.solveNow();
          }
        },
        {
          text: '闭合开关，电路中有电流通过',
          hint: '点画布上的开关把它闭合',
          check: function (s) { return s.switchClosed() && s.hasLoop(); },
          act: function (s) { s.__test.toggleSwitch(); s.__test.solveNow(); tick(s, 0.3); }
        },
        {
          text: '记录一组 U、I 数据',
          hint: '点「记录一组 U、I」',
          check: function (s) { return s.records().length >= 1 && s.records()[0].I > 0.01; },
          act: function (s) { s.__test.record(); }
        },
        {
          text: '把定值电阻换成 20 Ω，再记录一组',
          hint: '点中那个定值电阻，拖「电阻 R」滑块',
          check: function (s) { return s.records().length >= 2; },
          act: function (s) {
            var r = s.comps().filter(function (x) { return x.type === 'resistor'; })[0];
            s.__test.setR(r.uid, 20);
            s.__test.solveNow(); tick(s, 0.2);
            s.__test.record();
          }
        },
        {
          text: '用 U / I 算出电阻，并与设定值比较',
          hint: '看「读数与信息」里的记录数据',
          check: function (s) {
            var r = s.records();
            if (r.length < 2) return false;
            var R1 = r[0].U / r[0].I, R2 = r[1].U / r[1].I;
            return Math.abs(R1 - 10) < 0.6 && Math.abs(R2 - 20) < 1.2;
          },
          act: function () { /* 记录里已经带上 U 与 I，直接比较即可 */ }
        }
      ]
    }
  ];

  PHY.registerTasks(TASKS);
})(typeof window !== 'undefined' ? window : globalThis);
