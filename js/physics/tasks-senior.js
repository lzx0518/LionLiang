/* =============================================================================
 * 物理教材实验任务 —— 高中 (js/physics/tasks-senior.js)
 * -----------------------------------------------------------------------------
 * 结构同 tasks-junior.js：check(sim) 判定步骤，act(sim) 是测试用的动作脚本。
 * 覆盖：打点计时器、牛顿第二定律、平抛运动、机械能守恒、动量守恒、
 *       玻意耳定律、测电源电动势与内阻、测玻璃折射率、电磁感应、光电效应。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});

  function tick(sim, seconds) {
    var n = Math.round((seconds || 1) / 0.05);
    for (var i = 0; i < n; i++) sim.update(0.05);
  }

  var TASKS = [
    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_ticker',
      name: '用打点计时器研究匀变速直线运动',
      level: 'senior',
      sim: 'ticker',
      chapter: '必修一 · 第二章 匀变速直线运动的研究',
      goal: '用打点计时器打出纸带，从点距的变化判断小车做匀加速运动，并用逐差法（Δs = aT²）求出加速度。',
      intro: '小车在砝码拉力下拖动纸带，打点计时器每 0.02 s 打一个点；每 5 个间隔取一个计数点，相邻计数点的时间间隔 T = 0.1 s。',
      principle: ['Δs = aT²（相邻相等时间内的位移差恒定）', 'a = Δs / T²'],
      steps: [
        {
          text: '设置小车质量 0.40 kg、挂钩砝码 0.15 kg',
          hint: '拖两个滑块',
          check: function (s) { return Math.abs(s.params().m - 0.4) < 0.03 && Math.abs(s.params().mh - 0.15) < 0.03; },
          act: function (s) { s.__test.setM(0.4); s.__test.setMH(0.15); }
        },
        {
          text: '释放小车，打出一条纸带',
          hint: '点「释放小车」，等小车到达终点',
          check: function (s) { return s.isDone(); },
          act: function (s) { s.__test.run(); tick(s, 1.2); }
        },
        {
          text: '数出 3 个以上的计数点，观察相邻点距越来越大',
          hint: '看纸带上的红点（每 0.1 s 一个）',
          check: function (s) {
            var pts = s.counting();
            if (pts.length < 4) return false;
            var d1 = pts[2].s - pts[1].s, d2 = pts[1].s - pts[0].s;
            return d1 > d2;
          },
          act: function () { }
        },
        {
          text: '用 Δs = aT² 由纸带求加速度，与理论值比较',
          hint: '看「读数与信息」里的纸带求加速度',
          check: function (s) {
            var am = s.getAMeas();
            return am !== null && Math.abs(am - s.getA()) < 0.4;
          },
          act: function () { }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_n2',
      name: '探究加速度与力、质量的关系',
      level: 'senior',
      sim: 'n2',
      chapter: '必修一 · 第四章 运动和力的关系',
      goal: '用控制变量法：保持质量不变改变拉力得到 a ∝ F；保持拉力不变改变质量得到 a ∝ 1/m，从而验证牛顿第二定律。',
      intro: '气垫导轨可以认为没有摩擦，绳与滑轮的质量不计，于是小车的加速度 a = F / m。',
      principle: ['a = F / m', '控制变量法：先固定 m 找 a–F，再固定 F 找 a–1/m'],
      steps: [
        {
          text: '保持小车质量 0.40 kg，记录一组 (F, a)',
          hint: '先固定质量，再点「记录 (F, a)」',
          check: function (s) { return Math.abs(s.params().m - 0.4) < 0.03 && s.recF().length >= 1; },
          act: function (s) { s.__test.setM(0.4); s.__test.setMH(0.1); s.__test.recF(); }
        },
        {
          text: '保持质量不变，改变砝码凑满 5 组 a–F 数据',
          hint: '每次都先改砝码再记录',
          check: function (s) { return s.recF().length >= 5; },
          act: function (s) {
            [0.15, 0.2, 0.25, 0.3].forEach(function (mh) { s.__test.setMH(mh); s.__test.recF(); });
          }
        },
        {
          text: '保持拉力不变，改变小车质量，凑满 5 组 a–m 数据',
          hint: '点「记录 (m, a)」',
          check: function (s) { return s.recM().length >= 5; },
          act: function (s) {
            [0.2, 0.3, 0.4, 0.5, 0.6].forEach(function (m) { s.__test.setM(m); s.__test.recM(); });
          }
        },
        {
          text: '分析数据：a 与 F 成正比，a 与 m 成反比',
          hint: '看 a–F 与 a–1/m 两张图是否都是过原点的直线',
          check: function (s) {
            var f = s.recF(), m = s.recM();
            if (f.length < 3 || m.length < 3) return false;
            var k = f[0].F / f[0].a;               /* m = F / a，应当等于固定质量 */
            var okF = f.every(function (p) { return Math.abs(p.F / p.a - k) < 0.03; });
            var k2 = m[0].a * m[0].m;              /* F = a·m，应当等于固定拉力 */
            var okM = m.every(function (p) { return Math.abs(p.a * p.m - k2) < 0.03; });
            return okF && okM;
          },
          act: function () { }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_projectile',
      name: '研究平抛运动',
      level: 'senior',
      sim: 'projectile',
      chapter: '必修二 · 第五章 抛体运动',
      goal: '用频闪照片记录平抛小球的轨迹，验证水平方向是匀速直线运动、竖直方向是自由落体运动。',
      intro: '小球离开水平桌面后做平抛运动。每隔相等时间（0.08 s）记下小球的位置，再把水平位移与竖直高度分别与自由落体对比。',
      principle: ['水平：x = v₀t（匀速）', '竖直：y = ½gt²（自由落体）'],
      steps: [
        {
          text: '设置初速度 3.0 m/s、抛出高度 1.6 m',
          hint: '拖「初速度 v₀」与「抛出高度 h」',
          check: function (s) { return Math.abs(s.params().v0 - 3) < 0.3 && Math.abs(s.params().h - 1.6) < 0.1; },
          act: function (s) { s.__test.setV0(3); s.__test.setH(1.6); }
        },
        {
          text: '释放小球，得到一条频闪轨迹',
          hint: '点「释放小球」等它落地',
          check: function (s) { return s.isDone() && s.dots().length >= 4; },
          act: function (s) { s.__test.run(); tick(s, 1); }
        },
        {
          text: '验证水平方向做匀速运动（x 与 t 成正比）',
          hint: '点「验证结论」',
          check: function (s) { return s.verified(); },
          act: function (s) { s.__test.verify(); }
        },
        {
          text: '打开「自由落体对比」，看到两球同时落地',
          hint: '点「自由落体对比」',
          check: function (s) { return s.sameTime(); },
          act: function (s) { }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_conserve',
      name: '验证机械能守恒定律',
      level: 'senior',
      sim: 'conserve',
      chapter: '必修二 · 第八章 机械能守恒定律',
      goal: '重物自由下落拖出纸带，用中间时刻速度公式算出各点速度，比较 ½v² 与 gh，验证只有重力做功时机械能守恒。',
      intro: '重物拖着纸带自由下落，用打点计时器记录各点位置；相邻点的中点速度 v = Δh / 2T。',
      principle: ['½v² = gh', '只有重力做功时机械能守恒'],
      steps: [
        {
          text: '设置重物质量 0.30 kg',
          hint: '拖「重物质量 m」滑块',
          check: function (s) { return Math.abs(s.params().m - 0.3) < 0.03; },
          act: function (s) { s.__test.setM(0.3); }
        },
        {
          text: '释放重物，打出纸带',
          hint: '点「释放重物」',
          check: function (s) { return s.isDone(); },
          act: function (s) { s.__test.run(); tick(s, 0.8); }
        },
        {
          text: '比较动能增加量 ½v² 与势能减少量 gh',
          hint: '看「读数与信息」里的纸带数据',
          check: function (s) { return s.points().length >= 3 && Math.abs(s.points()[0].dK - s.points()[0].dP) < 0.08; },
          act: function () { }
        },
        {
          text: '检查最大相对误差，确认在误差范围内机械能守恒',
          hint: '看「最大相对误差」',
          check: function (s) { var e = s.maxErr(); return e !== null && e < 0.15; },
          act: function () { }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_momentum',
      name: '验证动量守恒定律',
      level: 'senior',
      sim: 'momentum',
      chapter: '选择性必修一 · 第一章 动量守恒定律',
      goal: '在气垫导轨上让两滑块碰撞，测出碰前后的总动量，验证弹性碰撞与完全非弹性碰撞中动量都守恒。',
      intro: '导轨水平、摩擦可忽略。两滑块一维碰撞，碰前总动量 p前 = m₁v₁ + m₂v₂，碰后 p后 = m₁u₁ + m₂u₂。',
      principle: ['p前 = p后（系统动量守恒）', '弹性碰撞动能守恒，完全非弹性碰撞动能损失最大'],
      steps: [
        {
          text: '设置 m₁ = 0.30 kg、v₁ = 0.50 m/s，m₂ = 0.20 kg 静止',
          hint: '拖四个滑块设定质量与速度',
          check: function (s) {
            var p = s.params();
            return Math.abs(p.m1 - 0.3) < 0.03 && Math.abs(p.m2 - 0.2) < 0.03 && Math.abs(p.v1 - 0.5) < 0.06;
          },
          act: function (s) {
            s.set('m1', 0.3); s.set('m2', 0.2); s.set('v1', 0.5); s.set('v2', 0); s.set('kind', 'elastic');
          }
        },
        {
          text: '选择弹性碰撞，释放滑块完成一次碰撞',
          hint: '点「释放滑块」等两滑块相碰',
          check: function (s) { return s.isCollided(); },
          act: function (s) { s.set('kind', 'elastic'); s.__test.run(); tick(s, 3.2); }
        },
        {
          text: '比较碰前与碰后的总动量',
          hint: '看记录里的 p前 与 p后',
          check: function (s) {
            var r = s.results();
            return r.length >= 1 && r[0].kind === 'elastic' && Math.abs(r[0].pB - r[0].pA) < 1e-6;
          },
          act: function () { }
        },
        {
          text: '改成完全非弹性碰撞，再碰一次并比较动量',
          hint: '「碰撞类型」选完全非弹性碰撞',
          check: function (s) {
            var r = s.results();
            return r.length >= 2 && r[1].kind === 'inelastic' && Math.abs(r[1].pB - r[1].pA) < 1e-6;
          },
          act: function (s) { s.set('kind', 'inelastic'); s.__test.run(); tick(s, 3.2); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_gaslaw',
      name: '探究气体等温变化的规律（玻意耳定律）',
      level: 'senior',
      sim: 'gaslaw',
      chapter: '选择性必修三 · 第二章 气体、固体和液体',
      goal: '在温度不变的条件下改变气体体积，测量对应的压强，作 p–V 与 p–1/V 图，得出 pV = 常数、p ∝ 1/V。',
      intro: '用注射器封闭一段空气，缓慢推拉活塞改变体积（保持温度不变），由压强传感器读出压强。',
      principle: ['pV = 常数（等温）', 'p ∝ 1/V'],
      steps: [
        {
          text: '在 V = 40 mL、温度 300 K 时记录第一组 (p, V)',
          hint: '点「记录一组 (p, V)」',
          check: function (s) { return s.records().length >= 1 && Math.abs(s.records()[0].V - 40) < 0.5; },
          act: function (s) { s.__test.setV(40); s.__test.setT(300); s.__test.record(); }
        },
        {
          text: '改变体积，再记录三组（共 4 组）',
          hint: '每次改完体积点一次记录',
          check: function (s) { return s.records().length >= 4; },
          act: function (s) {
            [60, 30, 20].forEach(function (v) { s.__test.setV(v); s.__test.record(); });
          }
        },
        {
          text: '观察各组 pV 是否近似相等',
          hint: '看数据记录里的 pV 值',
          check: function (s) {
            var r = s.records();
            if (r.length < 4) return false;
            var pv = r.map(function (x) { return x.pV; });
            var dev = (Math.max.apply(null, pv) - Math.min.apply(null, pv)) / pv[0];
            return dev < 0.02;
          },
          act: function () { }
        },
        {
          text: '切到 p–1/V 图像，确认各点近似在过原点的直线上',
          hint: '「图像」下拉框选 p–1/V',
          check: function (s) { return s.plot() === 'p1v'; },
          act: function (s) { s.__test.setPlot('p1v'); }
        },
        {
          text: '升高温度后再记录一组，发现 pV 不再是原来的常数',
          hint: '把温度调到 330 K 后记录',
          check: function (s) {
            var r = s.records();
            if (r.length < 5) return false;
            var dev = Math.abs(r[4].pV - r[0].pV) / r[0].pV;
            return dev > 0.06;
          },
          act: function (s) { s.__test.setT(330); s.__test.setV(20); s.__test.record(); }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_emf',
      name: '测量电源的电动势和内阻',
      level: 'senior',
      sim: 'circuit',
      chapter: '必修三 · 第十二章 电能 能量守恒定律',
      goal: '用电流表和变阻器改变电路中的电流，测出多组路端电压 U 与电流 I，由 U–I 图像求出电源的电动势 E 和内阻 r。',
      intro: '由闭合电路欧姆定律 U = E − I·r，把路端电压 U 作为 I 的函数作图，纵轴截距就是 E，斜率的绝对值就是 r。',
      principle: ['U = E − I·r', 'E 为纵轴截距，r 为斜率绝对值'],
      steps: [
        {
          text: '把电源、开关、电流表、滑动变阻器连成串联回路',
          hint: '点元件栏放入元件，再点接线柱连线',
          check: function (s) {
            return s.count('battery') >= 1 && s.count('switch') >= 1 && s.count('ammeter') >= 1 && s.count('rheostat') >= 1;
          },
          act: function (s) {
            s.__test.add('battery', 220, 300);
            s.__test.add('switch', 360, 300);
            s.__test.add('ammeter', 500, 300);
            s.__test.add('rheostat', 640, 300);
            var c = s.comps();
            s.__test.wire(c[0].uid, 'B', c[1].uid, 'A');
            s.__test.wire(c[1].uid, 'B', c[2].uid, 'A');
            s.__test.wire(c[2].uid, 'B', c[3].uid, 'A');
            s.__test.wire(c[3].uid, 'B', c[0].uid, 'A');
            s.__test.solveNow();
          }
        },
        {
          text: '闭合开关，把变阻器调到阻值较大处，使电流较小',
          hint: '闭合开关，拖动变阻器滑片',
          check: function (s) { return s.switchClosed() && s.hasLoop() && s.totalI() < 1.2; },
          act: function (s) {
            s.__test.toggleSwitch();
            var rh = s.comps().filter(function (x) { return x.type === 'rheostat'; })[0];
            s.__test.setRheo(rh.uid, 0.95);
            s.__test.solveNow(); tick(s, 0.3);
          }
        },
        {
          text: '记录第一组路端电压 U 与电流 I',
          hint: '点「记录一组 U、I」',
          check: function (s) { return s.records().length >= 1 && s.records()[0].I > 0.01; },
          act: function (s) { s.__test.record(); }
        },
        {
          text: '逐次减小变阻器阻值，共记录 5 组数据',
          hint: '每次滑动变阻器后记录一组',
          check: function (s) { return s.records().length >= 5; },
          act: function (s) {
            var rh = s.comps().filter(function (x) { return x.type === 'rheostat'; })[0];
            [0.75, 0.55, 0.35, 0.15].forEach(function (f) {
              s.__test.setRheo(rh.uid, f);
              s.__test.solveNow(); tick(s, 0.15);
              s.__test.record();
            });
          }
        },
        {
          text: '由 U–I 图像求出电源的电动势 E 和内阻 r',
          hint: '点「显示 U-I 图」，看拟合出来的 E 与 r',
          check: function (s) {
            var f = s.fit();
            return !!f && f.ok && Math.abs(f.E - 3) < 0.2 && Math.abs(f.r - 0.5) < 0.15;
          },
          act: function () { }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_refract',
      name: '测定玻璃的折射率',
      level: 'senior',
      sim: 'refract',
      preset: { mode: 'air2glass', theta: 45 },
      chapter: '选择性必修一 · 第四章 光',
      goal: '让激光从空气斜射入玻璃，量出入射角与折射角，由 n = sinθ₁ / sinθ₂ 求玻璃的折射率，并观察全反射。',
      intro: '改变入射角测多组数据取平均可以减小误差；再把光路反过来（玻璃射向空气），当入射角大于临界角时发生全反射。',
      principle: ['n = sinθ₁ / sinθ₂', '临界角 sinC = 1/n'],
      steps: [
        {
          text: '选择「空气 → 玻璃」，折射率 n 设为 1.50',
          hint: '「光路方向」+「玻璃折射率 n」',
          check: function (s) { return s.mode() === 'air2glass' && Math.abs(s.getN() - 1.5) < 0.01; },
          act: function (s) { s.__test.setMode('air2glass'); s.__test.setN(1.5); s.__test.setTheta(45); }
        },
        {
          text: '分别用 30°、45°、60° 的入射角记录三组数据',
          hint: '每改一次入射角点一次「记录一组数据」',
          check: function (s) { return s.records().length >= 3; },
          act: function (s) {
            [30, 45, 60].forEach(function (a) { s.__test.setTheta(a); s.__test.record(); });
          }
        },
        {
          text: '求出折射率的平均值，与 1.50 比较',
          hint: '看「读数与信息」里的平均值',
          check: function (s) { var m = s.meanN(); return m !== null && Math.abs(m - 1.5) < 0.02; },
          act: function () { }
        },
        {
          text: '改成「玻璃 → 空气」，把入射角增大到临界角以上，观察全反射',
          hint: '临界角 C = arcsin(1/n) ≈ 41.8°，入射角调到 50° 以上',
          check: function (s) { return s.mode() === 'glass2air' && s.tir() && s.tirTime() > 0.1; },
          act: function (s) {
            s.__test.setMode('glass2air'); s.__test.setTheta(55); tick(s, 0.4);
          }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_induction',
      name: '探究电磁感应现象',
      level: 'senior',
      sim: 'induction',
      chapter: '选择性必修二 · 第二章 电磁感应',
      goal: '把条形磁铁插入、拔出线圈，观察电流计指针的偏转，归纳产生感应电流的条件与感应电流方向的影响因素。',
      intro: '线圈与电流计组成闭合回路。磁铁相对线圈运动时穿过线圈的磁通量发生变化，回路中产生感应电流。',
      principle: ['只要穿过闭合回路的磁通量发生变化，就有感应电流', '感应电流的磁场总是阻碍磁通量的变化（楞次定律）'],
      steps: [
        {
          text: '磁铁静止在线圈外：观察电流计指针不偏转',
          hint: '先「复位」，让磁铁停在线圈外',
          check: function (s) { return !s.moving() && s.outOfCoil() && Math.abs(s.emf()) < 0.05; },
          act: function (s) { s.__test.reset(); tick(s, 0.3); }
        },
        {
          text: '把 N 极朝向线圈的磁铁插入线圈，指针发生偏转，记录一组',
          hint: '点「插入磁铁」，然后点「记录数据」',
          check: function (s) {
            var r = s.records();
            return r.length >= 1 && r[0].pole === 'N' && r[0].dir === 'insert' &&
              Math.abs(r[0].peak) > 0.3 && r[0].sign === r[0].exp;
          },
          act: function (s) { s.__test.setPole('N'); s.__test.insert(); tick(s, 1.6); s.__test.record(); }
        },
        {
          text: '让磁铁停在线圈里：磁通量不再变化，指针不偏转',
          hint: '点「停住不动」并稍等',
          check: function (s) { return !s.moving() && s.atCoil() && Math.abs(s.emf()) < 0.05; },
          act: function (s) { s.__test.stop(); tick(s, 0.4); }
        },
        {
          text: '把磁铁拔出线圈，指针向相反方向偏转，再记录一组',
          hint: '点「拔出磁铁」后点「记录数据」',
          check: function (s) {
            var r = s.records();
            return r.length >= 2 && r[1].dir === 'pull' && r[1].sign === -r[0].sign && r[1].sign === r[1].exp;
          },
          act: function (s) { s.__test.pull(); tick(s, 2.2); s.__test.record(); }
        },
        {
          text: '改变磁铁的极性（N 换成 S），再插入一次，偏转方向也相反',
          hint: '「磁铁极性」选 S 极后再插入',
          check: function (s) {
            var r = s.records();
            return r.length >= 2 && s.pole() === 'S' &&
              s.peakSign() === s.expectedSign() && s.peakSign() === -r[0].sign;
          },
          act: function (s) {
            s.__test.pull(); tick(s, 2.2);
            s.__test.setPole('S'); s.__test.insert(); tick(s, 1.6);
          }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'phy_s_photon',
      name: '光电效应与普朗克常量',
      level: 'senior',
      sim: 'photon',
      chapter: '选择性必修三 · 第四章 原子结构和波粒二象性',
      goal: '研究光电效应：认识极限频率的存在，测出不同频率下的遏止电压，由 U_c–ν 图像的斜率求 h/e。',
      intro: '用单色光照射金属阴极，只有光的频率大于极限频率 ν₀ 才会打出光电子；增大光强只改变饱和光电流，不改变遏止电压。',
      principle: ['E_k = hν − W₀', 'U_cν 图斜率 = h/e，横轴截距 = ν₀'],
      steps: [
        {
          text: '选择「钠」作阴极，把频率调到 8.0×10¹⁴ Hz 以上，出现光电流',
          hint: '先选金属，再拖频率滑块',
          check: function (s) { return s.metal() === 'na' && s.aboveThreshold() && s.current() > 0.01; },
          act: function (s) { s.__test.setMetal('na'); s.__test.setNu(8); }
        },
        {
          text: '把频率降到极限频率以下，发现无论光多强都没有光电流',
          hint: '钠的极限频率约 5.5×10¹⁴ Hz，把它调到 4.5',
          check: function (s) { return !s.aboveThreshold() && s.current() === 0; },
          act: function (s) { s.__test.setIntensity(100); s.__test.setNu(4.5); }
        },
        {
          text: '把频率调回 8.0×10¹⁴ Hz，测出遏止电压并记录',
          hint: '点「测遏止电压」再点「记录 (ν, U_c)」',
          check: function (s) { return s.records().length >= 1 && Math.abs(s.voltage() + s.records()[0].Uc) < 0.02; },
          act: function (s) { s.__test.setNu(8); s.__test.measure(); s.__test.record(); }
        },
        {
          text: '改变频率，再记录两组（共 3 组），作 U_c–ν 图',
          hint: '每次改频率后重新测量并记录',
          check: function (s) { return s.records().length >= 3; },
          act: function (s) {
            [10, 12].forEach(function (v) { s.__test.setNu(v); s.__test.measure(); s.__test.record(); });
          }
        },
        {
          text: '由图像斜率求出 h/e，并找出横轴截距（极限频率 ν₀）',
          hint: '看「读数与信息」里的拟合结果（斜率单位是 V/(10¹⁴Hz)）',
          check: function (s) {
            var f = s.fit();
            /* 斜率应当 ≈ h/e × 10⁻¹⁴ = 0.4136 V/(10¹⁴Hz)，反推 h 应接近 6.63×10⁻³⁴ J·s */
            return !!f && Math.abs(f.k - 0.4136) < 0.04 &&
              f.h > 6.2e-34 && f.h < 7.0e-34 &&
              Math.abs(f.nu0 - s.nu0()) < 1.2;
          },
          act: function () { }
        },
        {
          text: '只增大光强：光电流变大，但遏止电压不变',
          hint: '把光强拉到 100%，再测一次遏止电压',
          check: function (s) {
            var r = s.records();
            if (r.length < 4) return false;
            var last = r[r.length - 1], prev = r[r.length - 2];
            return s.intensity() >= 95 && Math.abs(last.Uc - prev.Uc) < 1e-9 && s.current() > 3;
          },
          act: function (s) {
            s.__test.setNu(12); s.__test.measure(); s.__test.record();
            s.__test.setIntensity(100); s.__test.measure(); s.__test.record();
            s.__test.setU(1);
          }
        }
      ]
    }
  ];

  PHY.registerTasks(TASKS);
})(typeof window !== 'undefined' ? window : globalThis);
