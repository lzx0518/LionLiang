/* =============================================================================
 * 虚拟实验室 —— 热学仿真 (js/physics/sims/thermal.js)
 * -----------------------------------------------------------------------------
 * 1) melt    探究固体熔化时温度的变化规律 / 观察水的沸腾（初中）
 *    · 「冰的熔化」：固态升温 → 0℃ 熔化平台（固液共存）→ 液态升温
 *    · 「水的沸腾」：升温 → 沸点平台（沸腾，水量减少）→ 烧干
 *    · 气压可调，沸点按克劳修斯—克拉珀龙方程算出（0.7 atm ≈ 90℃，1.3 atm ≈ 108℃）
 *    · 实时绘制温度—时间图像，平台段用色带标出
 * 2) gaslaw  气体的等温变化（玻意耳定律，高中）
 *    · 推拉活塞改变体积，由传感器读压强：pV 基本不变 → p ∝ 1/V
 *    · 作 p-V 图（双曲线）与 p-1/V 图（过原点直线）
 *    · 温度升高后再测，pV 漂移，说明「等温」是前提
 *
 * 时间刻度：实验里熔化 / 沸腾都要好几分钟，动画把时间加速了 TIME_SCALE 倍，
 * 图像横轴标注的是「实验时间」。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

  var TIME_SCALE = 10;          /* 动画 1 s = 实验 10 s */
  var C_ICE = 2.1;              /* kJ/(kg·℃) */
  var C_WATER = 4.2;
  var L_FUSION = 334;           /* kJ/kg */
  var L_VAPOR = 2260;
  var MASS = 0.2;               /* kg，200 g */

  PHY.registerSim({
    id: 'melt',
    name: '熔化与沸腾（温度—时间图像）',
    field: 'thermal',
    icon: '🌡️',
    level: 'junior',
    tag: '物态变化',
    desc: '加热冰块，看温度升到 0℃ 后停住（熔化平台，固液共存）；换成水，看沸腾时温度停在沸点不变。',
    tip: '选「冰的熔化」或「水的沸腾」，点「开始加热」，盯住温度—时间图像上的平台。',

    controls: function (inst) {
      var list = [
        { type: 'select', id: 'mode', label: '实验内容', value: inst.mode(), options: [{ v: 'ice', t: '冰的熔化' }, { v: 'water', t: '水的沸腾' }] },
        { type: 'slider', id: 'power', label: '加热功率', min: 100, max: 800, step: 50, value: inst.getPower(), unit: 'W' }
      ];
      if (inst.mode() === 'water') {
        list.push({ type: 'slider', id: 'airp', label: '气压', min: 0.7, max: 1.3, step: 0.05, value: inst.getAirP(), fmt: function (v) { return Number(v).toFixed(2) + ' atm'; } });
        list.push({ type: 'note', text: '当前沸点 ' + PHY.fmt(inst.boilPoint(), 1) + ' ℃' });
      }
      list.push({ type: 'sep' });
      list.push({ type: 'button', id: 'heat', label: '开始加热', primary: true });
      list.push({ type: 'button', id: 'stop', label: '停止加热' });
      list.push({ type: 'button', id: 'clear', label: '清空图像与数据' });
      return list;
    },

    create: function (env) {
      var mode = 'ice';                 /* ice | water */
      var power = 300;                  /* W */
      var airP = 1.0;                   /* atm，只影响水的沸点 */
      var Q = 0;                        /* 累计吸收的热量 kJ */
      var heating = false;
      var m = MASS;
      var series = [];                  /* {t: 实验时间 s, T: ℃} */
      var tExp = 0;                     /* 实验时间 s */
      var acc = 0;
      var flash = 0;

      var ICE_START = -20;
      var Q_SOLID = m * C_ICE * (0 - ICE_START);        /* 8.4 kJ */
      var Q_FUSION = m * L_FUSION;                      /* 66.8 kJ */
      var WATER_START = 20;
      var Q_WARM = m * C_WATER * (100 - WATER_START);   /* 67.2 kJ（1 atm 时） */

      function boilPoint() {
        /* 克劳修斯—克拉珀龙：ln(p/p₀) = −(L/R)·(1/T − 1/T₀)，R = 0.4615 kJ/(kg·K) */
        var R = 0.4615, T0 = 373.15;
        var invT = 1 / T0 - Math.log(airP) * R / L_VAPOR;
        return invT > 0 ? (1 / invT) - 273.15 : 100;
      }
      function qWarm() { return m * C_WATER * (boilPoint() - WATER_START); }

      function reset() {
        Q = 0; heating = false; series = []; tExp = 0; flash = 0;
      }
      function setMode(md) {
        mode = md; reset();
        PHY.log(md === 'ice' ? '开始「冰的熔化」实验：0.2 kg 的冰，初温 −20 ℃，加热功率 ' + power + ' W。'
          : '开始「水的沸腾」实验：0.2 kg 的水，初温 20 ℃，气压 ' + PHY.fmt(airP, 2) + ' atm（沸点 ' + PHY.fmt(boilPoint(), 1) + ' ℃）。', '', 'info');
        env.invalidateInfo();
      }
      function set(id, v) {
        if (id === 'mode') { setMode(v); return; }
        if (id === 'power') { power = v; }
        else if (id === 'airp') { airP = v; }
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'heat') {
          heating = true;
          PHY.log('开始加热，功率 ' + power + ' W。', '', 'info');
        } else if (id === 'stop') {
          heating = false;
          PHY.log('停止加热。', '', 'info');
        } else if (id === 'clear') {
          reset();
          PHY.log('已清空图像与数据。', '', 'info');
        }
        env.invalidateInfo();
      }

      /* ---------------- 物态与温度 ---------------- */
      function state() {
        if (mode === 'ice') {
          if (Q < Q_SOLID) return { phase: 'solid', T: ICE_START + Q / (m * C_ICE), label: '固态（冰）', frac: null };
          if (Q < Q_SOLID + Q_FUSION) {
            var f = (Q - Q_SOLID) / Q_FUSION;
            return { phase: 'melting', T: 0, label: '固液共存（正在熔化）', frac: f };
          }
          var T2 = Math.min(30, (Q - Q_SOLID - Q_FUSION) / (m * C_WATER));
          return { phase: 'liquid', T: T2, label: T2 >= 29.9 ? '液态（实验结束）' : '液态（水）', frac: null };
        }
        var Tb = boilPoint();
        if (Q < qWarm()) return { phase: 'solid', T: WATER_START + Q / (m * C_WATER), label: '液态（升温中）', frac: null };
        var f2 = (Q - qWarm()) / (m * L_VAPOR);
        if (f2 < 1) return { phase: 'boiling', T: Tb, label: '沸腾（温度不变）', frac: f2 };
        return { phase: 'dry', T: Tb, label: '水已烧干', frac: 1 };
      }

      var flag = { melt: false, boil: false, liquid: false, dry: false, iceDone: false };

      function update(dt) {
        flash += dt;
        if (!heating) return;
        var dtExp = dt * TIME_SCALE;
        tExp += dtExp;
        Q += power * dtExp / 1000;      /* W·s → kJ */
        acc += dtExp;
        if (acc >= 8) {
          acc = 0;
          var st = state();
          series.push({ t: tExp, T: st.T });
          if (series.length > 900) series.shift();
          /* 关键节点写进实验记录，只写一次 */
          if (st.phase === 'melting' && !flag.melt) {
            flag.melt = true;
            PHY.log('温度升到 0 ℃ 后不再上升：冰开始熔化，此时是固液共存状态，继续吸热但温度不变。', '', 'reaction');
          }
          if (st.phase === 'boiling' && !flag.boil) {
            flag.boil = true;
            PHY.log('水温达到沸点 ' + PHY.fmt(st.T, 1) + ' ℃ 后保持不变：水在沸腾，继续吸热但温度不变。', '', 'reaction');
          }
          if (st.phase === 'liquid' && mode === 'ice' && !flag.liquid) {
            flag.liquid = true;
            PHY.log('冰全部熔化完，继续加热水温又开始上升——熔化过程已经结束。', '', 'reaction');
          }
          if (st.phase === 'dry' && !flag.dry) {
            flag.dry = true;
            heating = false;
            PHY.log('水全部汽化完，烧杯里不再有液体，本次实验结束。', '', 'warn');
          }
          /* 冰熔化完之后水的温度上限是 30 ℃（图像纵轴就到这）。到了上限必须停掉加热：
             否则温度被 Math.min 截住、曲线会多出一段"平台"——而在温度—时间图像里
             平台的含义是"正在发生物态变化"，凭空多一条平台会让学生误读。 */
          if (mode === 'ice' && st.phase === 'liquid' && st.T >= 29.9 && !flag.iceDone) {
            flag.iceDone = true;
            heating = false;
            PHY.log('水温升到 30 ℃，本次「冰的熔化」实验到此结束（熔化平台在 0 ℃）。', '', 'info');
          }
        }
      }

      /* ---------------- 绘制 ---------------- */
      function drawSetup(gg, x, y, w, h) {
        PHY.panel(gg, x, y, w, h, '实验装置');
        var st = state();
        var cx = x + w / 2;
        var baseY = y + h - 34;
        gg.save();
        /* 铁架台 */
        gg.fillStyle = '#8d939b';
        gg.fillRect(cx - 62, baseY, 124, 8);
        gg.fillRect(cx - 60, y + 30, 8, baseY - y - 30);
        /* 酒精灯 */
        var lit = heating;
        gg.fillStyle = '#dfe7ee';
        PHY.rr(gg, cx - 18, baseY - 30, 36, 30, 4); gg.fill();
        gg.strokeStyle = '#a9b6c2'; gg.stroke();
        gg.fillStyle = '#b9c6d2';
        gg.fillRect(cx - 6, baseY - 36, 12, 7);
        if (lit) {
          var fl = 12 + Math.sin(flash * 9) * 3;
          var grd = gg.createLinearGradient(cx, baseY - 40, cx, baseY - 40 - fl - 14);
          grd.addColorStop(0, 'rgba(255,196,60,0.95)');
          grd.addColorStop(1, 'rgba(255,120,40,0.15)');
          gg.fillStyle = grd;
          gg.beginPath();
          gg.moveTo(cx - 6, baseY - 38);
          gg.quadraticCurveTo(cx - 3, baseY - 38 - fl, cx, baseY - 38 - fl - 12);
          gg.quadraticCurveTo(cx + 3, baseY - 38 - fl, cx + 6, baseY - 38);
          gg.closePath(); gg.fill();
        }
        /* 烧杯 + 内容物 */
        var bx = cx - 34, by = baseY - 96, bw = 68, bh = 58;
        var lvl = 0;
        if (mode === 'ice') {
          lvl = st.phase === 'solid' ? 0.75 : (st.phase === 'melting' ? 0.75 - 0.25 * (st.frac || 0) : 0.5);
        } else {
          lvl = 0.62 * (1 - (st.frac || 0) * (st.phase === 'boiling' || st.phase === 'dry' ? 0.85 : 0));
        }
        gg.fillStyle = st.phase === 'solid' && mode === 'ice' ? '#dceaf6' : '#d6ecf8';
        gg.fillRect(bx + 4, by + bh - bh * lvl, bw - 8, bh * lvl);
        gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
        gg.beginPath();
        gg.moveTo(bx, by); gg.lineTo(bx, by + bh); gg.lineTo(bx + bw, by + bh); gg.lineTo(bx + bw, by);
        gg.stroke();
        if (mode === 'ice' && st.phase === 'melting') {
          /* 固液共存：画几块没化完的冰 */
          gg.fillStyle = 'rgba(255,255,255,0.9)';
          for (var i = 0; i < 4; i++) {
            var ix = bx + 12 + i * 13, iy = by + bh - 12 - (i % 2) * 5;
            PHY.rr(gg, ix, iy, 9, 8, 2); gg.fill(); gg.stroke();
          }
        }
        if ((st.phase === 'boiling')) {
          /* 沸腾气泡 */
          gg.fillStyle = 'rgba(255,255,255,0.85)';
          for (var k = 0; k < 9; k++) {
            var bx2 = bx + 10 + (k * 17 % (bw - 20));
            var by2 = by + bh - ((flash * 40 + k * 13) % (bh * lvl + 2));
            gg.beginPath(); gg.arc(bx2, by2, 2 + (k % 3), 0, 7); gg.fill();
          }
        }
        /* 温度计 */
        gg.fillStyle = '#f5f9fc'; gg.strokeStyle = '#a9b6c2'; gg.lineWidth = 1.5;
        gg.fillRect(cx + 26, by - 26, 9, 96); gg.strokeRect(cx + 26, by - 26, 9, 96);
        var th = PHY.clamp((st.T + 20) / 130, 0, 1);
        gg.fillStyle = st.T > 0 ? '#e2603c' : '#1e9fd8';
        gg.fillRect(cx + 28, by - 24 + (92 - 92 * th), 5, 92 * th);
        gg.fillStyle = '#3d5a72'; gg.font = '700 13px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'middle';
        gg.fillText(PHY.fmt(st.T, 1) + ' ℃', cx + 40, by - 30);
        gg.fillStyle = '#6b7f92'; gg.font = '11.5px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'top';
        gg.fillText(st.label + (st.frac !== null ? '（' + Math.round(st.frac * 100) + '%）' : ''), cx, baseY + 12);
        gg.restore();
      }

      function drawGraph(gg, x, y, w, h) {
        PHY.panel(gg, x, y, w, h, '温度—时间图像');
        var ox = x + 44, oy = y + h - 32, gw = w - 62, gh = h - 56;
        var Tmin = -30, Tmax = 130;
        var tMax = Math.max(300, tExp * 1.12);
        function px(v) { return ox + PHY.clamp(v / tMax, 0, 1) * gw; }
        function py(v) { return oy - PHY.clamp((v - Tmin) / (Tmax - Tmin), 0, 1) * gh; }
        gg.save();
        /* 参考线：0℃ 与沸点 */
        [[0, '#1e9fd8', '0 ℃（冰的熔点）'], [mode === 'water' ? boilPoint() : 100, '#e2603c', PHY.fmt(mode === 'water' ? boilPoint() : 100, 1) + ' ℃（水的沸点）']].forEach(function (ln) {
          gg.save();
          gg.strokeStyle = ln[1] + '55'; gg.lineWidth = 1; gg.setLineDash([4, 4]);
          gg.beginPath(); gg.moveTo(ox, py(ln[0])); gg.lineTo(ox + gw, py(ln[0])); gg.stroke();
          gg.setLineDash([]);
          gg.fillStyle = ln[1]; gg.font = '10.5px ' + FONT;
          gg.textAlign = 'right'; gg.textBaseline = 'middle';
          gg.fillText(ln[2], ox - 3, py(ln[0]));
          gg.restore();
        });
        /* 坐标轴 */
        gg.strokeStyle = '#8a99a8'; gg.lineWidth = 1.4;
        PHY.arrow(gg, ox, oy, ox, oy - gh - 4, '#8a99a8', 1.4, 6);
        PHY.arrow(gg, ox, oy, ox + gw + 4, oy, '#8a99a8', 1.4, 6);
        gg.fillStyle = '#6b7f92'; gg.font = '10.5px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'top';
        gg.fillText('实验时间 t/s', ox + gw - 78, oy + 8);
        gg.fillText('T/℃', ox - 34, oy - gh - 12);
        /* 曲线 */
        if (series.length > 1) {
          gg.strokeStyle = '#1e9fd8'; gg.lineWidth = 2.4;
          gg.beginPath();
          series.forEach(function (p, i) {
            var X = px(p.t), Y = py(p.T);
            if (i === 0) gg.moveTo(X, Y); else gg.lineTo(X, Y);
          });
          gg.stroke();
          var last = series[series.length - 1];
          gg.beginPath(); gg.arc(px(last.t), py(last.T), 4, 0, 7);
          gg.fillStyle = '#e2603c'; gg.fill();
        } else {
          gg.fillStyle = '#a3b3c2'; gg.font = '12px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText('点「开始加热」，图像会从左上角开始画出来', ox + gw / 2, oy - gh / 2);
        }
        gg.restore();
        return { px: px, py: py, ox: ox, oy: oy };
      }

      return {
        set: set, action: action,
        update: update,

        hint: function () {
          if (!heating && !series.length) return '选好实验内容与加热功率，点「开始加热」；温度—时间图像会实时画出来。';
          var st = state();
          if (st.phase === 'melting') return '温度停在 0 ℃ 不动了——正在熔化，固液共存，继续吸热但温度不变。';
          if (st.phase === 'boiling') return '温度停在沸点不变——水正在沸腾（' + PHY.fmt(boilPoint(), 1) + ' ℃），继续吸热但温度不变。';
          if (st.phase === 'dry') return '水烧干了。想一想：为什么沸腾时温度不变，水却越来越少？';
          if (st.phase === 'liquid' && mode === 'ice') return '冰已全部熔化，水温又开始上升了。';
          return (heating ? '加热中：' : '已停止加热：') + '温度 ' + PHY.fmt(st.T, 1) + ' ℃，' + st.label + '。';
        },

        info: function () {
          var st = state();
          var out = ['<dl class="kv">'];
          out.push('<div><dt>实验内容</dt><dd>' + (mode === 'ice' ? '冰的熔化' : '水的沸腾') + '</dd></div>');
          out.push('<div><dt>温度</dt><dd>' + PHY.fmt(st.T, 1) + ' ℃</dd></div>');
          out.push('<div><dt>状态</dt><dd>' + st.label + '</dd></div>');
          if (st.frac !== null) out.push('<div><dt>' + (st.phase === 'melting' ? '熔化进度' : '汽化进度') + '</dt><dd>' + Math.round(st.frac * 100) + ' %</dd></div>');
          out.push('<div><dt>已吸收热量</dt><dd>Q = ' + PHY.fmt(Q, 1) + ' kJ</dd></div>');
          out.push('<div><dt>加热功率</dt><dd>' + power + ' W（' + (heating ? '正在加热' : '已停止') + '）</dd></div>');
          out.push('<div><dt>实验时间</dt><dd>' + PHY.fmt(tExp, 0) + ' s（动画加速 ' + TIME_SCALE + ' 倍）</dd></div>');
          if (mode === 'water') out.push('<div><dt>气压 / 沸点</dt><dd>' + PHY.fmt(airP, 2) + ' atm / ' + PHY.fmt(boilPoint(), 1) + ' ℃</dd></div>');
          out.push('</dl>');
          out.push('<div class="hint-box">' + (mode === 'ice'
            ? '结论：冰是<b>晶体</b>，熔化时温度保持在熔点 0 ℃ 不变（图像上出现水平平台），熔化过程要<b>继续吸热</b>，内能增加但温度不变。'
            : '结论：水沸腾时温度保持在沸点不变（平台），但要<b>继续吸热</b>；气压越低沸点越低。') + '</div>');
          out.push('<div class="hint-box">与「晶体」相对的是<b>非晶体</b>（石蜡、松香）：它们没有固定熔点，熔化时温度一直上升，图像上没有平台。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);
          /* 两块面板都撑满画布高度：以前写死 Math.min(H - 28, 330)，
             660 px 高的画布只用了 50%，下面一大片空白，
             温度—时间图像的纵轴也被压得很短。 */
          var sw = PHY.clamp(W * 0.26, 150, 260);
          drawSetup(gg, 16, 14, sw, H - 28);
          drawGraph(gg, sw + 30, 14, W - sw - 46, H - 28);
          gg.restore();
        },

        /* 判定 / 测试接口 */
        mode: function () { return mode; },
        getPower: function () { return power; },
        getAirP: function () { return airP; },
        boilPoint: boilPoint,
        getQ: function () { return Q; },
        temp: function () { return state().T; },
        phase: function () { return state().phase; },
        phaseLabel: function () { return state().label; },
        series: function () { return series; },
        isHeating: function () { return heating; },
        __test: {
          setMode: function (v) { setMode(v); },
          setPower: function (v) { power = v; },
          setAirP: function (v) { airP = v; },
          heat: function () { action('heat'); },
          stop: function () { action('stop'); },
          clear: function () { action('clear'); },
          /* 直接推进到指定实验时间，避免测试里跑几千帧 */
          advance: function (sec) { heatTo(sec); },
          setQ: function (q) { Q = q; }
        }
      };

      /* 测试用：把实验时间推进到指定值 */
      function heatTo(sec) {
        var st0 = heating;
        heating = true;
        var step = 0.5;
        for (var s = 0; s < sec; s += step) {
          tExp += step * TIME_SCALE;
          Q += power * step * TIME_SCALE / 1000;
        }
        heating = st0;
      }
    }
  });

  /* ============================================================
   * 2. 气体的等温变化（玻意耳定律）
   * ========================================================== */
  PHY.registerSim({
    id: 'gaslaw',
    name: '气体的等温变化（玻意耳定律）',
    field: 'thermal',
    icon: '💨',
    level: 'senior',
    tag: '气体实验定律',
    desc: '推拉注射器活塞改变封闭气体的体积，由压强传感器读压强：pV ≈ 常数，即 p ∝ 1/V。',
    tip: '拖动「体积」滑块或直接上下拖活塞改变 V，点「记录一组数据」；切换 p-V 与 p-1/V 图像看形状。',

    controls: function (inst) {
      return [
        { type: 'slider', id: 'V', label: '气体体积 V', min: 10, max: 60, step: 1, value: inst.getV(), unit: 'mL' },
        { type: 'slider', id: 'T', label: '温度 T', min: 280, max: 320, step: 1, value: inst.getT(), unit: 'K' },
        { type: 'select', id: 'plot', label: '图像', value: inst.plot(), options: [{ v: 'pv', t: 'p–V 图像' }, { v: 'p1v', t: 'p–1/V 图像' }] },
        { type: 'sep' },
        { type: 'button', id: 'record', label: '记录一组 (p, V)', primary: true },
        { type: 'button', id: 'clearRec', label: '清除数据' },
        { type: 'note', text: '当前 pV = ' + PHY.fmt(inst.pV(), 1) + ' kPa·mL（共 ' + inst.records().length + ' 组）' }
      ];
    },

    create: function (env) {
      var nR = 100 * 40 / 300;      /* kPa·mL/K：保证 300 K、40 mL 时 p = 100 kPa */
      var V = 40, T = 300;
      var plot = 'pv';
      var records = [];
      var drag = null;
      var flash = 0;

      function p() { return nR * T / V; }
      function pV() { return p() * V; }
      /* n = pV / (R·T)：p 用 kPa、V 用 mL 时结果正好是 mmol（1 kPa·mL = 1e-3 J） */
      function nmol() { return nR / 8.314; }

      function set(id, v) {
        if (id === 'V') V = v;
        else if (id === 'T') T = v;
        else if (id === 'plot') plot = v;
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'record') {
          var pt = { V: V, p: p(), T: T, pV: p() * V };
          records.push(pt);
          PHY.log('记录第 ' + records.length + ' 组：V = ' + V + ' mL，p = ' + PHY.fmt(pt.p, 1) + ' kPa，pV = ' + PHY.fmt(pt.pV, 1) + ' kPa·mL。', '', 'reaction');
          /* 顺手提示规律 */
          if (records.length >= 2) {
            var dev = (Math.max.apply(null, records.map(function (r) { return r.pV; })) -
              Math.min.apply(null, records.map(function (r) { return r.pV; }))) / records[0].pV;
            if (dev < 0.06) PHY.log('各组 pV 几乎相等 → p 与 V 成反比（玻意耳定律）。', '', 'success');
            else PHY.log('注意：各组 pV 相差 ' + Math.round(dev * 100) + '%，说明过程中温度变了——「等温」是玻意耳定律成立的前提。', '', 'warn');
          }
          env.invalidateInfo();
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除数据。', '', 'info');
          env.invalidateInfo();
        }
      }
      /* 拖动活塞：上下拖动改体积。
         几何必须和 draw 用同一份 —— 以前命中框按"筒底"算、活塞却画在"筒顶"，
         结果画布上根本拖不动活塞（只能靠滑块）。 */
      var LAYOUT = { padX: 16, padY: 14, titleH: 52, handleH: 40, bottomLabelH: 46 };
      function pistonGeom(W, H) {
        var w = Math.min(220, W * 0.24);
        var h = Math.min(H - 28, 380);
        var cx = LAYOUT.padX + w / 2;
        var top = LAYOUT.padY + LAYOUT.titleH;
        var bodyH = Math.max(90, h - LAYOUT.titleH - LAYOUT.bottomLabelH);
        var colW = 68;
        var fillFrac = (V - 10) / 50;
        var gasH = 40 + fillFrac * (bodyH - 60);
        var gasTop = top + (bodyH - gasH);
        return {
          x: LAYOUT.padX, y: LAYOUT.padY, w: w, h: h,
          cx: cx, top: top, bodyH: bodyH, colW: colW, gasH: gasH, gasTop: gasTop,
          handleY: gasTop - 26, handleHalf: 22
        };
      }
      function onDown(x, y) {
        var gm = pistonGeom(env.W, env.H);
        /* 命中框给宽一点：活塞手柄本身很小，捏不准就拖不动（这是唯一的拖拽目标，
           放宽不会误伤别的操作） */
        if (Math.abs(x - gm.cx) < gm.colW / 2 + 26 && Math.abs(y - gm.handleY) < 40) {
          drag = { y: y, V: V };
        }
      }
      function onMove(x, y, ev) {
        if (!drag) return;
        if (ev && ev.buttons === 0) { drag = null; return; }
        var gm = pistonGeom(env.W, env.H);
        /* 拖动 1 像素对应的体积变化，跟画出来的气柱高度完全一致，手感才是 1:1 */
        var perPx = 50 / Math.max(20, gm.bodyH - 60);
        V = PHY.clamp(Math.round(drag.V - (y - drag.y) * perPx), 10, 60);
        env.invalidateInfo();
      }
      function onUp() { drag = null; }

      function update(dt) { flash += dt; }

      function drawCylinder(gg) {
        /* 几何全部来自 pistonGeom —— 与拖动活塞的命中框共用一份，不会各算各的 */
        var gm = pistonGeom(env.W, env.H);
        var x = gm.x, y = gm.y, w = gm.w, h = gm.h;
        var cx = gm.cx, top = gm.top, bodyH = gm.bodyH, colW = gm.colW;
        var gasH = gm.gasH, gasTop = gm.gasTop;
        PHY.panel(gg, x, y, w, h, '注射器（封闭一段空气）');
        gg.save();
        /* 筒身 */
        gg.fillStyle = '#f7fbfe'; gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
        PHY.rr(gg, cx - colW / 2, top, colW, bodyH, 6); gg.fill(); gg.stroke();
        /* 气体（下段） */
        var grd = gg.createLinearGradient(0, gasTop, 0, top + bodyH);
        grd.addColorStop(0, 'rgba(126,203,238,0.42)');
        grd.addColorStop(1, 'rgba(126,203,238,0.72)');
        gg.fillStyle = grd;
        gg.fillRect(cx - colW / 2 + 3, gasTop, colW - 6, gasH - 3);
        /* 分子 */
        gg.fillStyle = 'rgba(20,90,130,0.55)';
        var nDot = Math.round(28 * (60 - V) / 50) + 22;
        for (var i = 0; i < nDot; i++) {
          var a = (i * 2.399), r = ((i * 37) % 100) / 100;
          var dx = Math.cos(a) * (colW / 2 - 12) * (0.35 + 0.65 * ((i * 53) % 100) / 100);
          var dyv = ((i * 71) % 100) / 100 + Math.sin(flash * 3 + i) * 0.04;
          var dyy = gasTop + 6 + dyv * (gasH - 12);
          if (dyy > gasTop + 4) { gg.beginPath(); gg.arc(cx + dx, dyy, 2.2, 0, 7); gg.fill(); }
        }
        /* 活塞 */
        gg.fillStyle = '#c9d6e2'; gg.strokeStyle = '#7f8d9b'; gg.lineWidth = 1.6;
        PHY.rr(gg, cx - colW / 2 + 2, gasTop - 14, colW - 4, 14, 3); gg.fill(); gg.stroke();
        gg.strokeStyle = '#7f8d9b'; gg.lineWidth = 5; gg.lineCap = 'round';
        gg.beginPath(); gg.moveTo(cx, gasTop - 14); gg.lineTo(cx, top - 30); gg.stroke();
        gg.fillStyle = '#7f8d9b';
        PHY.rr(gg, cx - 22, top - 40, 44, 12, 6); gg.fill();
        /* 压强表 */
        var gx = x + w - 56, gy = y + 78;
        gg.beginPath(); gg.arc(gx, gy, 26, 0, 7);
        gg.fillStyle = '#ffffff'; gg.fill();
        gg.strokeStyle = '#e0a13c'; gg.lineWidth = 2.5; gg.stroke();
        var ang = -Math.PI * 0.75 + PHY.clamp(p() / 400, 0, 1) * Math.PI * 0.5;
        gg.save();
        gg.translate(gx, gy); gg.rotate(ang);
        gg.strokeStyle = '#e2603c'; gg.lineWidth = 2;
        gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(0, -19); gg.stroke();
        gg.restore();
        gg.beginPath(); gg.arc(gx, gy, 3, 0, 7); gg.fillStyle = '#22384a'; gg.fill();
        gg.fillStyle = '#3d5a72'; gg.font = '700 11px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'top';
        gg.fillText(PHY.fmt(p(), 1), gx, gy + 30);
        gg.fillStyle = '#6b7f92'; gg.font = '10.5px ' + FONT;
        gg.fillText('kPa', gx, gy + 44);
        /* 提示 */
        gg.fillStyle = '#6b7f92'; gg.font = '11.5px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'top';
        gg.fillText('V = ' + V + ' mL　T = ' + T + ' K', cx, y + h - 26);
        gg.fillText('拖动上方活塞可改变体积', cx, y + h - 10);
        gg.restore();
      }

      function drawPlot(gg, x, y, w, h) {
        PHY.panel(gg, x, y, w, h, plot === 'pv' ? 'p–V 图像' : 'p–1/V 图像');
        var ox = x + 50, oy = y + h - 34, gw = w - 68, gh = h - 58;
        var ps = p();
        var xMax = plot === 'pv' ? 62 : (1 / 10);
        var pMax = Math.max(120, p() * 1.15, records.reduce(function (s, r) { return Math.max(s, r.p); }, 0) * 1.15);
        function px(v) { return ox + PHY.clamp(v / xMax, 0, 1) * gw; }
        function py(v) { return oy - PHY.clamp(v / pMax, 0, 1) * gh; }
        gg.save();
        gg.strokeStyle = 'rgba(30,159,216,0.14)'; gg.lineWidth = 1;
        for (var i = 1; i < 5; i++) {
          gg.beginPath(); gg.moveTo(ox, oy - gh * i / 5); gg.lineTo(ox + gw, oy - gh * i / 5); gg.stroke();
          gg.beginPath(); gg.moveTo(ox + gw * i / 5, oy); gg.lineTo(ox + gw * i / 5, oy - gh); gg.stroke();
        }
        gg.strokeStyle = '#8a99a8'; gg.lineWidth = 1.4;
        PHY.arrow(gg, ox, oy, ox, oy - gh - 4, '#8a99a8', 1.4, 6);
        PHY.arrow(gg, ox, oy, ox + gw + 4, oy, '#8a99a8', 1.4, 6);
        gg.fillStyle = '#6b7f92'; gg.font = '10.5px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'top';
        gg.fillText('p/kPa', ox - 40, oy - gh - 12);
        gg.fillText(plot === 'pv' ? 'V/mL' : '1/V (mL⁻¹)', ox + gw - 56, oy + 8);
        /* 理论曲线 */
        var k0 = records.length ? records[0].p * records[0].V : pV();
        gg.strokeStyle = 'rgba(30,159,216,0.55)'; gg.lineWidth = 1.8; gg.setLineDash([6, 4]);
        gg.beginPath();
        for (var s = 0; s <= 60; s++) {
          var vv = plot === 'pv' ? (10 + s / 60 * 52) : (1 / 10 + s / 60 * (1 / 10 - 1 / 60));
          var pp = plot === 'pv' ? (k0 / vv) : (k0 * vv);
          if (!isFinite(pp) || pp > pMax) continue;
          var X = px(vv), Y = py(pp);
          if (s === 0) gg.moveTo(X, Y); else gg.lineTo(X, Y);
        }
        gg.stroke();
        gg.setLineDash([]);
        /* 数据点 */
        records.forEach(function (r) {
          var X = px(plot === 'pv' ? r.V : 1 / r.V);
          var Y = py(r.p);
          gg.beginPath(); gg.arc(X, Y, 4, 0, 7); gg.fillStyle = '#e2603c'; gg.fill();
          gg.strokeStyle = '#ffffff'; gg.lineWidth = 1.4; gg.stroke();
        });
        /* 当前点 */
        var CX = px(plot === 'pv' ? V : 1 / V), CY = py(ps);
        gg.beginPath(); gg.arc(CX, CY, 5.5, 0, 7); gg.fillStyle = '#1e9fd8'; gg.fill();
        gg.strokeStyle = '#ffffff'; gg.lineWidth = 1.6; gg.stroke();
        if (records.length >= 2 && plot === 'p1v') {
          gg.fillStyle = '#2fa96b'; gg.font = '600 11px ' + FONT;
          gg.textAlign = 'left'; gg.textBaseline = 'middle';
          gg.fillText('各点近似在一条过原点的直线上 → p ∝ 1/V', ox + 8, oy - gh + 12);
        }
        gg.restore();
      }

      return {
        set: set, action: action,
        onDown: onDown, onMove: onMove, onUp: onUp,
        update: update,

        hint: function () {
          if (!records.length) return '拖动体积滑块（或上下拖活塞），点「记录一组 (p, V)」；改变体积后再记录，凑 4~5 组。';
          return '当前 V = ' + V + ' mL，p = ' + PHY.fmt(p(), 1) + ' kPa，pV = ' + PHY.fmt(pV(), 1) + ' kPa·mL（已记录 ' + records.length + ' 组）。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>体积 V</dt><dd>' + V + ' mL</dd></div>');
          out.push('<div><dt>压强 p</dt><dd>' + PHY.fmt(p(), 2) + ' kPa</dd></div>');
          out.push('<div><dt>pV</dt><dd>' + PHY.fmt(pV(), 1) + ' kPa·mL</dd></div>');
          out.push('<div><dt>温度 T</dt><dd>' + T + ' K（' + (T - 273) + ' ℃）</dd></div>');
          out.push('<div><dt>气体物质的量</dt><dd>n ≈ ' + PHY.fmt(nmol(), 2) + ' mmol</dd></div>');
          out.push('</dl>');
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>数据记录</b></p><div class="chips">');
            records.forEach(function (r, i) {
              out.push('<span class="chip">' + (i + 1) + '：V=' + r.V + 'mL p=' + PHY.fmt(r.p, 1) + 'kPa pV=' + PHY.fmt(r.pV, 0) + '</span>');
            });
            out.push('</div>');
            var pvs = records.map(function (r) { return r.pV; });
            var dev = (Math.max.apply(null, pvs) - Math.min.apply(null, pvs)) / pvs[0];
            out.push('<div class="hint-box">' + (dev < 0.06
              ? '各组 pV 相差不到 ' + Math.round(dev * 100) + '% → 在误差范围内 pV 是常数，<b>p 与 V 成反比</b>（玻意耳定律）。'
              : '各组 pV 相差 ' + Math.round(dev * 100) + '% → 过程中温度不是恒定的。玻意耳定律要求<b>等温</b>，温度一变 pV 就不守恒了。') + '</div>');
          }
          out.push('<div class="hint-box">微观解释：温度不变时分子平均动能不变；体积减小 → 分子数密度增大 → 单位时间内撞击器壁的分子数增多 → 压强增大。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);
          drawCylinder(gg);
          var px = LAYOUT.padX + Math.min(220, W * 0.24) + 16;
          drawPlot(gg, px, 14, W - px - 14, Math.min(H - 28, 380));
          gg.restore();
        },

        /* 判定 / 测试接口 */
        getV: function () { return V; },
        getT: function () { return T; },
        getP: p,
        pV: pV,
        plot: function () { return plot; },
        records: function () { return records; },
        __test: {
          setV: function (v) { V = v; },
          setT: function (v) { T = v; },
          setPlot: function (v) { plot = v; },
          record: function () { action('record'); },
          clearRec: function () { action('clearRec'); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
