/* =============================================================================
 * 虚拟实验室 —— 力学仿真 (js/physics/sims/mechanics.js)
 * -----------------------------------------------------------------------------
 * 本文件注册四个仿真：
 *  1) ticker     用打点计时器研究匀变速直线运动（高中）：
 *                小车拖纸带过打点计时器，50Hz 打点，每 5 个间隔取一个计数点
 *                （T = 0.1s），观察点距变化并求加速度 a = Δs / T²。
 *  2) n2         探究加速度与力、质量的关系（高中）：
 *                固定 m 测 a-F、固定 F 测 a-1/m，图像自动拟合。
 *  3) projectile 研究平抛运动（高中）：
 *                频闪轨迹 + 与自由落体小球对比，验证水平匀速、竖直自由落体。
 *  4) lever      探究杠杆的平衡条件（初中）：
 *                两侧挂钩码，F₁L₁ = F₂L₂，平衡时自动记录一组数据。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
  var G = 9.8;
  /* 平抛仿真的量程上限：控件滑块与坐标定标必须用同一组数字，
     否则改了滑块范围而没改定标，轨迹就会画到网格之外或飞出画布。 */
  var PROJ_MAXV0 = 8, PROJ_MAXH = 3;

  function bgFill(gg, W, H) {
    var bg = gg.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f6fafe');
    bg.addColorStop(1, '#e3edf7');
    gg.fillStyle = bg;
    gg.fillRect(0, 0, W, H);
  }

  /* 小车 + 导轨场景（ticker 与 n2 共用） */
  function drawTrackScene(gg, env, cartXm, y, pulleyX, cartW, label, pxPerM) {
    /* 比例尺由调用方给：轨道占了画布大部分宽度，按固定 110 px/m 画的话
       小车在 830 px 长的导轨上只挪 88 px，看着像没动。 */
    var PX = pxPerM || 110;
    var trackX1 = 70, trackX2 = env.W - 150;
    gg.save();
    /* 导轨 */
    gg.fillStyle = '#9aa7b2';
    gg.fillRect(trackX1, y + 14, trackX2 - trackX1, 6);
    /* 支脚 */
    gg.fillStyle = '#8d939b';
    gg.fillRect(trackX1 + 30, y + 20, 10, 46);
    gg.fillRect(trackX2 - 60, y + 20, 10, 46);
    /* 滑轮 */
    gg.beginPath(); gg.arc(pulleyX, y + 10, 12, 0, 7);
    gg.fillStyle = '#c9ccd1'; gg.fill();
    gg.strokeStyle = '#6d7780'; gg.lineWidth = 2; gg.stroke();
    /* 绳 */
    gg.strokeStyle = '#5d6f7e'; gg.lineWidth = 1.5;
    gg.beginPath();
    gg.moveTo(cartXm * PX + trackX1 + cartW / 2, y + 2);
    gg.lineTo(pulleyX, y + 2);
    gg.lineTo(pulleyX, y + 58);
    gg.stroke();
    /* 小车 */
    var cx = cartXm * PX + trackX1;
    gg.fillStyle = '#1e9fd8';
    PHY.rr(gg, cx - cartW / 2, y - 14, cartW, 18, 4); gg.fill();
    gg.strokeStyle = '#0f7fbf'; gg.stroke();
    gg.fillStyle = '#22384a';
    gg.beginPath(); gg.arc(cx - cartW / 4, y + 5, 4, 0, 7); gg.fill();
    gg.beginPath(); gg.arc(cx + cartW / 4, y + 5, 4, 0, 7); gg.fill();
    if (label) {
      gg.fillStyle = '#3d5a72';
      gg.font = '600 11px ' + FONT;
      gg.textAlign = 'center'; gg.textBaseline = 'bottom';
      gg.fillText(label, cx, y - 20);
    }
    /* 挂钩砝码 */
    gg.fillStyle = '#8a5a2b';
    gg.fillRect(pulleyX - 11, y + 58, 22, 26);
    gg.strokeStyle = '#5d4630'; gg.strokeRect(pulleyX - 11, y + 58, 22, 26);
    gg.restore();
    return { cx: cx, trackX1: trackX1, trackX2: trackX2 };
  }

  /* 简易坐标系面板：返回像素换算函数 */
  function graphPanel(gg, x, y, w, h, title, xMax, yMax, xLabel, yLabel) {
    PHY.panel(gg, x, y, w, h, title);
    var ox = x + 40, oy = y + h - 26;
    var gw = w - 58, gh = h - 52;
    gg.save();
    gg.strokeStyle = '#8a99a8'; gg.lineWidth = 1.2;
    PHY.arrow(gg, ox, oy, ox, oy - gh, '#8a99a8', 1.2, 6);
    PHY.arrow(gg, ox, oy, ox + gw, oy, '#8a99a8', 1.2, 6);
    gg.fillStyle = '#6b7f92';
    gg.font = '10px ' + FONT;
    gg.textAlign = 'right'; gg.textBaseline = 'top';
    gg.fillText(yLabel, ox - 4, oy - gh - 2);
    gg.textAlign = 'left';
    gg.fillText(xLabel, ox + gw - 24, oy + 8);
    gg.restore();
    return {
      ox: ox, oy: oy, gw: gw, gh: gh,
      px: function (vx) { return ox + PHY.clamp(vx / xMax, 0, 1.02) * gw; },
      py: function (vy) { return oy - PHY.clamp(vy / yMax, 0, 1.02) * gh; },
      dot: function (vx, vy, colr, r) {
        gg.beginPath(); gg.arc(this.px(vx), this.py(vy), r || 3.4, 0, 7);
        gg.fillStyle = colr; gg.fill();
      },
      line: function (x1, y1, x2, y2, colr, dash) {
        gg.save();
        gg.strokeStyle = colr; gg.lineWidth = 1.8;
        if (dash) gg.setLineDash([5, 4]);
        gg.beginPath();
        gg.moveTo(this.px(x1), this.py(y1));
        gg.lineTo(this.px(x2), this.py(y2));
        gg.stroke();
        gg.restore();
      }
    };
  }

  /* ============================================================
   * 1. 打点计时器 · 匀变速直线运动
   * ========================================================== */
  PHY.registerSim({
    id: 'ticker',
    name: '匀变速直线运动（打点计时器）',
    field: 'mech',
    icon: '🛞',
    level: 'senior',
    desc: '小车拖动纸带通过打点计时器，用点距变化研究匀加速运动并求加速度。',
    tip: '调整小车质量与挂钩砝码，点「释放小车」打出一条纸带。',
    controls: function (inst) {
      var p = inst.params();
      return [
        { type: 'slider', id: 'm', label: '小车质量 m', min: 0.1, max: 1, step: 0.05, value: p.m, unit: 'kg' },
        { type: 'slider', id: 'mh', label: '挂钩砝码', min: 0.05, max: 0.5, step: 0.05, value: p.mh, unit: 'kg' },
        { type: 'sep' },
        { type: 'button', id: 'run', label: '释放小车', primary: true },
        { type: 'button', id: 'reset', label: '重置纸带' }
      ];
    },

    create: function (env) {
      var m = 0.4, mh = 0.15;         // 小车 kg / 挂钩砝码 kg
      var running = false, done = false;
      var t = 0, s = 0;
      var tape = [];                  // {t, s} 每 0.02s
      var MAXS = 0.8;                 // 纸带长度 m
      var DOT_DT = 0.02;
      var dotAcc = 0;
      var PX = 110;

      function a() { return mh * G / (m + mh); }
      function vAt(tt) { return a() * tt; }

      function countingPoints() {
        var pts = [];
        for (var i = 0; i < tape.length; i += 5) pts.push(tape[i]);
        return pts;
      }
      function aMeas() {
        var pts = countingPoints();
        if (pts.length < 3) return null;
        var T = 0.1, i;
        /* 相邻计数点位移 Δs_k = s_k − s_{k−1}；匀变速时 Δs 的逐差恒为 aT²，
           所以 a = mean(Δs_{k+1} − Δs_k) / T²（逐差法）。
           注意不能直接把 Δs 的平均值除以 T²——那算出来会偏大好几倍。 */
        var ds = [];
        for (i = 1; i < pts.length; i++) ds.push(pts[i].s - pts[i - 1].s);
        var sum = 0, n = 0;
        for (i = 1; i < ds.length; i++) { sum += ds[i] - ds[i - 1]; n++; }
        if (!n) return null;
        return (sum / n) / (T * T);
      }

      function update(dt) {
        if (!running || done) return;
        t += dt;
        var acc = a();
        s = 0.5 * acc * t * t;
        dotAcc += dt;
        while (dotAcc >= DOT_DT) {
          dotAcc -= DOT_DT;
          tape.push({ t: tape.length * DOT_DT, s: 0.5 * acc * (tape.length * DOT_DT) * (tape.length * DOT_DT) });
        }
        if (s >= MAXS || t > 4) {
          done = true; running = false;
          var am = aMeas();
          PHY.log('小车到达终点：总位移 ' + PHY.fmt(s, 3) + ' m，用时 ' + PHY.fmt(t, 2) + ' s。' +
            (am ? '由纸带求出 a ≈ ' + PHY.fmt(am, 2) + ' m/s²（理论 a = ' + PHY.fmt(a(), 2) + '）。' : ''), '', 'reaction');
        }
      }
      function action(id) {
        if (id === 'run') {
          if (done) { t = 0; s = 0; tape = []; done = false; }
          running = true;
          PHY.log('释放小车：m = ' + PHY.fmt(m, 2) + ' kg，挂钩砝码 ' + PHY.fmt(mh, 2) + ' kg（约 ' + PHY.fmt(mh * G, 2) + ' N）。');
        } else if (id === 'reset') {
          running = false; done = false; t = 0; s = 0; tape = [];
        }
      }
      function set(id, v) {
        if (id === 'm') m = v;
        else if (id === 'mh') mh = v;
      }
      function applyPreset(p) {
        if (!p) return;
        if (p.m) m = p.m;
        if (p.mh) mh = p.mh;
      }

      return {
        set: set, action: action, applyPreset: applyPreset,
        update: update,
        hint: function () {
          if (running) return '打点中：t = ' + PHY.fmt(t, 2) + ' s，v = ' + PHY.fmt(vAt(t), 2) + ' m/s，a = ' + PHY.fmt(a(), 2) + ' m/s²';
          if (done) return '纸带已打出。数一数计数点：相邻计数点间隔 T = 0.1 s，点距越来越大 → 匀加速。';
          return '点「释放小车」打出纸带；调整小车质量或砝码改变加速度。';
        },
        info: function () {
          var pts = countingPoints();
          var out = ['<dl class="kv">'];
          out.push('<div><dt>小车质量</dt><dd>' + PHY.fmt(m, 2) + ' kg</dd></div>');
          out.push('<div><dt>挂钩砝码重</dt><dd>' + PHY.fmt(mh * G, 2) + ' N（= m_h·g）</dd></div>');
          /* 绳的拉力并不等于砝码重力：砝码自己也在加速，所以
             T = m·a = m·m_h·g /(m + m_h) < m_h·g。
             只有 m_h ≪ m 时才能近似把砝码重当作拉力——这里如实分开显示。 */
          out.push('<div><dt>绳的拉力 T = m·a</dt><dd>' + PHY.fmt(m * a(), 2) + ' N</dd></div>');
          out.push('<div><dt>理论加速度</dt><dd>a = m_h·g/(m + m_h) = ' + PHY.fmt(a(), 2) + ' m/s²</dd></div>');
          var am = aMeas();
          if (am) out.push('<div><dt>纸带求加速度</dt><dd>逐差法 a ≈ ' + PHY.fmt(am, 2) + ' m/s²</dd></div>');
          out.push('</dl>');
          if (pts.length > 1) {
            out.push('<p style="margin:8px 0 2px"><b>计数点数据（T = 0.1 s）</b></p>');
            var html = '<div class="chips">';
            pts.forEach(function (p, i) {
              var ds = i ? (p.s - pts[i - 1].s) : null;
              html += '<span class="chip">' + (i + 1) + '# t=' + PHY.fmt(p.t, 1) + 's s=' + PHY.fmt(p.s, 3) + 'm' + (ds ? ' 间隔位移=' + PHY.fmt(ds, 3) : '') + '</span>';
            });
            out.push(html + '</div>');
            out.push('<div class="hint-box">匀变速的判断依据是<b>相邻两个间隔位移之差</b>恒定：Δs₂ − Δs₁ = Δs₃ − Δs₂ = aT²。' +
              '注意每个间隔的位移本身是越来越大的，逐差（把位移差再取平均）才得到 a。</div>');
          }
          return out.join('');
        },
        draw: function (gg, W, H) {
          bgFill(gg, W, H);
          var y = H * 0.32;
          var pulleyX = W - 170;
          PX = Math.max(110, (W - 320) / MAXS);
          var cartPx = Math.min(s, MAXS) * PX;
          drawTrackScene(gg, env, cartPx / PX, y, pulleyX, 56, '小车 m=' + PHY.fmt(m, 2) + 'kg', PX);
          /* 纸带 */
          var ty = H * 0.66;
          gg.save();
          gg.fillStyle = '#fbf6ea';
          gg.fillRect(60, ty, Math.max(120, MAXS * PX), 26);
          gg.strokeStyle = '#c9bfa8';
          gg.strokeRect(60, ty, MAXS * PX, 26);
          /* 打点计时器 */
          gg.fillStyle = '#37414c';
          gg.fillRect(52, ty - 16, 16, 58);
          gg.fillStyle = '#e0a13c';
          gg.fillRect(66, ty - 14, 8, 54);
          tape.forEach(function (p, i) {
            var x = 74 + p.s * PX;
            if (x > 60 + MAXS * PX - 4) return;
            var counting = (i % 5 === 0);
            gg.beginPath();
            gg.arc(x, ty + 13, counting ? 3.2 : 1.6, 0, 7);
            gg.fillStyle = counting ? '#c0392b' : '#22262b';
            gg.fill();
          });
          gg.fillStyle = '#6b7f92';
          gg.font = '11px ' + FONT;
          gg.textAlign = 'left';
          gg.fillText('纸带（0.02s 一个点，红色为每 0.1s 的计数点）', 60, ty + 44);
          gg.restore();
          /* v-t 图像 */
          var gp = graphPanel(gg, W - 270, 14, 250, 170, 'v-t 图像', 3, Math.max(0.5, a() * 3.2), 't/s', 'v/(m·s⁻¹)');
          if (tape.length) {
            gp.line(0, 0, Math.min(3, t + 0.6), vAt(Math.min(3, t + 0.6)), '#1e9fd8');
            countingPoints().forEach(function (p) {
              gp.dot(p.t, vAt(p.t), '#c0392b');
            });
          }
        },
        /* 判定 / 测试 */
        isDone: function () { return done; },
        isRunning: function () { return running; },
        getA: a,
        getAMeas: aMeas,
        tape: function () { return tape; },
        counting: countingPoints,
        params: function () { return { m: m, mh: mh }; },
        __test: { run: function () { action('run'); }, setM: function (v) { m = v; }, setMH: function (v) { mh = v; } }
      };
    }
  });

  /* ============================================================
   * 2. 探究加速度与力、质量的关系（牛顿第二定律）
   * ========================================================== */
  PHY.registerSim({
    id: 'n2',
    name: '探究 a 与 F、m 的关系',
    field: 'mech',
    icon: '🧲',
    level: 'senior',
    desc: '气垫导轨上保持质量不变改变拉力、保持拉力不变改变质量，归纳 a ∝ F、a ∝ 1/m。',
    tip: '先「测量当前 a」，改变参数后再记录，凑齐 5 组即可看出规律。',
    note: '模型说明：气垫导轨无摩擦、绳与滑轮不计质量。此时 a = m_h·g/(m + m_h)，绳的拉力 T = m·a 略小于砝码重力 m_h·g（砝码自己也在加速）。',
    controls: function (inst) {
      var p = inst.params();
      return [
        { type: 'slider', id: 'm', label: '小车质量 m', min: 0.1, max: 1, step: 0.05, value: p.m, unit: 'kg' },
        { type: 'slider', id: 'mh', label: '挂钩砝码', min: 0.05, max: 0.5, step: 0.05, value: p.mh, unit: 'kg' },
        { type: 'sep' },
        { type: 'button', id: 'recF', label: '记录 (F, a)', primary: true, tip: 'm 一定，改变拉力' },
        { type: 'button', id: 'recM', label: '记录 (m, a)', tip: 'F 一定，改变质量' },
        { type: 'button', id: 'reset', label: '重置' },
        { type: 'note', text: '已记录 ' + inst.recF().length + ' 组 a-F、' + inst.recM().length + ' 组 a-m' }
      ];
    },

    create: function (env) {
      var m = 0.4, mh = 0.1;
      var recF = [];      // {F, a} m 一定
      var recM = [];      // {m, a} F 一定
      var running = false, done = false, t = 0, s = 0;
      var phase = 'F';    // F | m
      var PX = 110;
      var MAXS = 0.8;
      var targetT = 0.5;  // 「固定拉力」模式下要保住的绳张力 N

      /* 严格模型：小车与挂钩砝码通过理想滑轮连成一体、一起加速，所以
           a = m_h·g / (m + m_h)
         绳的拉力（真正作用在小车上的合力）是 T = m·a，而不是砝码重 m_h·g ——
         因为砝码自己也要被加速，绳子"分"给它的那部分力扣掉了。
         这里如实按这个关系算，并把「拉力」定义为绳的张力 T；
         这样 a = T / m 才是严格成立的（教材里 a = F/m 的 F 本来就是拉力，不是砝码重）。
         同一份代码里 ticker 用的也是这个模型，两处不能各算一套。 */
      function a() { return mh * G / (m + mh); }
      function T() { return m * a(); }
      function hangerWeight() { return mh * G; }
      /* 要让绳的拉力保持在 T0，砝码该取多少：T0·(m + m_h) = m·m_h·g */
      function hangerFor(T0, mm) { return T0 * mm / Math.max(1e-6, mm * G - T0); }

      function measure() {
        /* 直接由模型给出 a（相当于已经做完一次释放测量） */
        return a();
      }
      function action(id) {
        if (id === 'recF') {
          phase = 'F';
          var pt = { F: T(), a: measure(), m: m, mh: mh };
          var dup = recF.some(function (p) { return Math.abs(p.F - pt.F) < 0.005; });
          if (dup) { PHY.toast('这一组拉力已经记录过了，换一个砝码试试。'); return; }
          recF.push(pt);
          PHY.log('记录（m = ' + PHY.fmt(m, 2) + ' kg 固定）：绳的拉力 F = ' + PHY.fmt(pt.F, 2) +
            ' N（砝码 ' + PHY.fmt(mh, 2) + ' kg，砝码重 ' + PHY.fmt(hangerWeight(), 2) +
            ' N），a = ' + PHY.fmt(pt.a, 3) + ' m/s²。', '', 'reaction');
        } else if (id === 'recM') {
          phase = 'm';
          /* 「固定拉力」不能靠固定砝码重：砝码重一定时，绳的张力会随小车质量变化。
             这里以第一次记录的拉力为基准，之后自动换砝码把它保住。 */
          if (!recM.length) { targetT = T(); }
          else { mh = PHY.clamp(hangerFor(targetT, m), 0.05, 0.5); }
          var pt2 = { m: m, a: measure(), F: T(), mh: mh };
          var dup2 = recM.some(function (p) { return Math.abs(p.m - pt2.m) < 0.01; });
          if (dup2) { PHY.toast('这一组质量已经记录过了，换一个质量试试。'); return; }
          recM.push(pt2);
          PHY.log('记录（保持绳的拉力 F = ' + PHY.fmt(pt2.F, 2) + ' N 不变）：m = ' + PHY.fmt(m, 2) +
            ' kg（砝码已自动换成 ' + PHY.fmt(mh, 2) + ' kg），a = ' + PHY.fmt(pt2.a, 3) + ' m/s²。', '', 'reaction');
          PHY.setControl('mh', mh);
        } else if (id === 'reset') {
          running = false; done = false; t = 0; s = 0;
        }
      }
      function set(id, v) {
        if (id === 'm') {
          m = v;
          /* 「固定拉力」模式下改质量，砝码要跟着换，拉力才保得住 */
          if (phase === 'm' && recM.length) {
            mh = PHY.clamp(hangerFor(targetT, m), 0.05, 0.5);
            PHY.setControl('mh', mh);
          }
        } else if (id === 'mh') mh = v;
      }
      function applyPreset(p) {
        if (!p) return;
        if (p.m) m = p.m;
        if (p.mh) mh = p.mh;
      }

      function update(dt) {
        if (!running || done) return;
        t += dt;
        s = 0.5 * a() * t * t;
        if (s >= MAXS || t > 4) { done = true; running = false; }
      }

      return {
        set: set, action: action, applyPreset: applyPreset,
        update: update,
        hint: function () {
          if (phase === 'F' && recF.length < 5) return '固定 m，改变砝码 → 绳的拉力 F = m·a 跟着变，「记录一组 (F, a)」，凑齐 5 组。当前 a = ' + PHY.fmt(a(), 2) + ' m/s²';
          if (recM.length < 5) return '固定绳的拉力 F，改变小车质量 m（砝码会自动跟着换）→「记录一组 (m, a)」，凑齐 5 组。当前 a = ' + PHY.fmt(a(), 2) + ' m/s²';
          return '数据已足够：a ∝ F，a ∝ 1/m，即 a = F / m（F 是绳的拉力）。';
        },
        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>挂钩砝码重 m_h·g</dt><dd>' + PHY.fmt(hangerWeight(), 2) + ' N</dd></div>');
          out.push('<div><dt>绳的拉力 F = m·a</dt><dd>' + PHY.fmt(T(), 2) + ' N</dd></div>');
          out.push('<div><dt>当前质量 m</dt><dd>' + PHY.fmt(m, 2) + ' kg</dd></div>');
          out.push('<div><dt>当前加速度</dt><dd>a = ' + PHY.fmt(a(), 3) + ' m/s²</dd></div>');
          out.push('</dl>');
          out.push('<div class="hint-box">为什么绳的拉力比砝码重小？砝码自己也在加速，' +
            'm_h·g − T = m_h·a。于是 a = m_h·g/(m + m_h)，T = m·a = ' + PHY.fmt(T(), 2) +
            ' N &lt; m_h·g = ' + PHY.fmt(hangerWeight(), 2) + ' N。只有 m_h ≪ m 时才近似认为两者相等。</div>');
          if (recF.length > 1) {
            var ratio = recF[0].a / recF[0].F;
            out.push('<div class="hint-box">固定 m：a / F ≈ ' + PHY.fmt(ratio, 3) + '（各组比值近似相等 → a ∝ F）</div>');
          }
          if (recM.length > 1) {
            var prod = recM[0].a * recM[0].m;
            out.push('<div class="hint-box">固定 F：a·m ≈ ' + PHY.fmt(prod, 3) + '（各组乘积近似相等 → a ∝ 1/m）</div>');
          }
          var html = '<p style="margin:8px 0 2px"><b>数据记录</b></p><div class="chips">';
          recF.forEach(function (p) { html += '<span class="chip">m=' + PHY.fmt(p.m, 2) + ': F=' + PHY.fmt(p.F, 2) + 'N a=' + PHY.fmt(p.a, 2) + '</span>'; });
          recM.forEach(function (p) { html += '<span class="chip">F=' + PHY.fmt(p.F, 2) + 'N: m=' + PHY.fmt(p.m, 2) + 'kg a=' + PHY.fmt(p.a, 2) + '</span>'; });
          out.push(html + '</div>');
          return out.join('');
        },
        draw: function (gg, W, H) {
          bgFill(gg, W, H);
          /* 两张图并排、各占一半宽，导轨放在它们下面，底部再给数据留一块。
             以前两张图都堆在右上角（左上一大片空着），导轨又只放在 H*0.3，
             整张画布的高度只用了 41%。 */
          var gw = PHY.clamp((W - 60) / 2, 190, 300);
          var gh = PHY.clamp(H * 0.28, 130, 200);
          var y = 14 + gh + 64;
          var pulleyX = W - 170;
          PX = Math.max(110, (W - 320) / MAXS);
          var cartPx = done ? MAXS : s;
          drawTrackScene(gg, env, cartPx, y, pulleyX, 56, 'm=' + PHY.fmt(m, 2) + 'kg  F=' + PHY.fmt(T(), 2) + 'N', PX);
          /* 坐标轴上限必须覆盖实际会出现的全部数据点与那条直线：
             拉力 F = m·a 最大不到 1 N；1/m 最大是 1/0.1 = 10（质量滑块下限 0.1 kg）。
             以前 a–1/m 的横轴写死 5，把 m < 0.2 kg 的点全挤到了边框外面（clamp 到 1.02 贴边）。 */
          var maxF = 0.2, maxA = 0.5, ii;
          for (ii = 0; ii < recF.length; ii++) { if (recF[ii].F > maxF) maxF = recF[ii].F; if (recF[ii].a > maxA) maxA = recF[ii].a; }
          for (ii = 0; ii < recM.length; ii++) { if (recM[ii].F > maxF) maxF = recM[ii].F; if (recM[ii].a > maxA) maxA = recM[ii].a; }
          if (T() > maxF) maxF = T();
          maxF *= 1.22;
          var lineTop = maxF / Math.max(0.1, m);      /* a = F/m 在 x = maxF 处的高度 */
          if (lineTop > maxA) maxA = lineTop;
          if (a() > maxA) maxA = a();
          maxA *= 1.15;
          /* a-F 图 */
          var gp1 = graphPanel(gg, 20, 14, gw, gh, 'a–F（m 一定）', maxF, maxA, 'F/N', 'a');
          recF.forEach(function (p) { gp1.dot(p.F, p.a, '#1e9fd8'); });
          if (recF.length > 1) gp1.line(0, 0, maxF, maxF * (recF[0].a / recF[0].F), '#1e9fd8', true);
          /* a-1/m 图：横轴单位是 1/kg，1/m ∈ [1, 10] */
          var gp2 = graphPanel(gg, W - 20 - gw, 14, gw, gh, 'a–1/m（F 一定）', 10, maxA, '1/m', 'a');
          recM.forEach(function (p) { gp2.dot(1 / p.m, p.a, '#e0a13c'); });
          if (recM.length > 1) {
            var k = recM[0].a * recM[0].m;            /* k = a·m = 绳的拉力 */
            gp2.line(0, 0, 10, k * 10, '#e0a13c', true);
          }

          /* 底部：数据与结论 */
          var bTop = y + 112, bH = H - bTop - 16;
          if (bH > 58) {
            PHY.panel(gg, 20, bTop, W - 40, bH, '数据记录');
            gg.textBaseline = 'middle';
            if (!recF.length && !recM.length) {
              gg.fillStyle = '#6b7f92'; gg.font = '12px ' + FONT;
              gg.textAlign = 'center';
              gg.fillText('固定小车质量、逐个改变砝码 →「记录 (F, a)」；再保持绳的拉力不变、逐个改变质量 →「记录 (m, a)」。',
                W / 2, bTop + bH / 2);
            } else {
              var lineY = bTop + 40;
              gg.font = '11.5px ' + FONT; gg.textAlign = 'left';
              gg.fillStyle = '#3d5a72';
              gg.fillText('固定 m：' + (recF.map(function (p) {
                return '(' + PHY.fmt(p.F, 2) + ' N, ' + PHY.fmt(p.a, 2) + ')';
              }).join('　') || '（还没记录）'), 36, lineY);
              gg.fillText('固定 F：' + (recM.map(function (p) {
                return '(' + PHY.fmt(p.m, 2) + ' kg, ' + PHY.fmt(p.a, 2) + ')';
              }).join('　') || '（还没记录）'), 36, lineY + 24);
              if (recF.length > 1) {
                gg.fillStyle = '#1e9fd8';
                gg.fillText('a / F ≈ ' + PHY.fmt(recF[0].a / recF[0].F, 3) + ' = 1/m，各组比值相同 → a ∝ F', 36, lineY + 50);
              }
              if (recM.length > 1) {
                gg.fillStyle = '#e0a13c';
                gg.fillText('a·m ≈ ' + PHY.fmt(recM[0].a * recM[0].m, 3) + ' N，各组乘积相同 → a ∝ 1/m', 36, lineY + 72);
              }
            }
            if (recF.length >= 5 && recM.length >= 5) {
              gg.fillStyle = '#2fa96b'; gg.font = '700 13.5px ' + FONT;
              gg.textAlign = 'center'; gg.textBaseline = 'bottom';
              gg.fillText('结论：a ∝ F，a ∝ 1/m  ⟹  a = F/m（F 为绳的拉力）', W / 2, bTop + bH - 12);
            }
          }
        },
        recF: function () { return recF; },
        recM: function () { return recM; },
        getA: a,
        getF: T,
        getHangerWeight: hangerWeight,
        params: function () { return { m: m, mh: mh, T: T(), hangerW: hangerWeight(), targetT: targetT }; },
        __test: { setM: function (v) { m = v; }, setMH: function (v) { mh = v; }, recF: function () { action('recF'); }, recM: function () { action('recM'); } }
      };
    }
  });

  /* ============================================================
   * 3. 研究平抛运动
   * ========================================================== */
  PHY.registerSim({
    id: 'projectile',
    name: '研究平抛运动',
    field: 'mech',
    icon: '🎯',
    level: 'senior',
    desc: '频闪轨迹展示平抛运动：水平方向匀速、竖直方向自由落体，可与自由落体小球对比。',
    tip: '调初速度与高度，点「释放小球」；观察频闪点与网格。',
    controls: function (inst) {
      var p = inst.params();
      return [
        { type: 'slider', id: 'v0', label: '初速度 v₀', min: 1, max: PROJ_MAXV0, step: 0.5, value: p.v0, unit: 'm/s' },
        { type: 'slider', id: 'h', label: '抛出高度 h', min: 0.4, max: PROJ_MAXH, step: 0.1, value: p.h, unit: 'm' },
        { type: 'sep' },
        { type: 'button', id: 'run', label: '释放小球', primary: true },
        { type: 'button', id: 'verify', label: '验证结论' },
        { type: 'button', id: 'ghost', label: '自由落体对比' },
        { type: 'button', id: 'clear', label: '清空轨迹' }
      ];
    },

    create: function (env) {
      var v0 = 3, h = 1.6;
      var running = false, done = false;
      var t = 0;
      var dots = [];          // {t, x, y, vx, vy} 每 0.08s
      var dotAcc = 0;
      var sameTime = false;
      var verified = false;
      var showGhost = true;

      function landT() { return Math.sqrt(2 * h / G); }
      function range() { return v0 * landT(); }

      function update(dt) {
        if (!running || done) return;
        t += dt;
        dotAcc += dt;
        while (dotAcc >= 0.08) {
          dotAcc -= 0.08;
          var tt = dots.length * 0.08;
          if (tt <= landT()) {
            dots.push({ t: tt, x: v0 * tt, y: h - 0.5 * G * tt * tt, vx: v0, vy: G * tt });
          }
        }
        if (t >= landT()) {
          done = true; running = false;
          sameTime = true;
          PHY.log('小球落地：飞行时间 t = ' + PHY.fmt(landT(), 2) + ' s（自由落体小球同时落地），水平射程 x = ' + PHY.fmt(range(), 2) + ' m。', '', 'reaction');
        }
      }
      function action(id) {
        if (id === 'run') {
          dots = []; t = 0; done = false; running = true; verified = false; sameTime = false;
          PHY.log('释放小球：v₀ = ' + PHY.fmt(v0, 1) + ' m/s，高度 h = ' + PHY.fmt(h, 2) + ' m。');
        } else if (id === 'clear') {
          dots = []; done = false; running = false; verified = false;
        } else if (id === 'verify') {
          if (!done) { PHY.toast('先释放小球完成一次平抛。'); return; }
          /* 取中间某点验证 x = v0·t */
          var k = Math.floor(dots.length / 2);
          var d = dots[k];
          var err = Math.abs(d.x - v0 * d.t);
          verified = err < 0.02;
          PHY.log('验证：t = ' + PHY.fmt(d.t, 2) + ' s 时 x = ' + PHY.fmt(d.x, 3) + ' m，v₀·t = ' + PHY.fmt(v0 * d.t, 3) + ' m，误差 ' + PHY.fmt(err, 3) + ' m → ' + (verified ? '水平方向确实是匀速运动' : '误差偏大'), '', 'reaction');
        } else if (id === 'ghost') {
          showGhost = !showGhost;
        }
      }
      function set(id, v) {
        if (id === 'v0') v0 = v;
        else if (id === 'h') h = v;
      }
      function applyPreset(p) {
        if (!p) return;
        if (p.v0) v0 = p.v0;
        if (p.h) h = p.h;
      }

      /* 与控件滑块的上限保持一致（模块顶部的 PROJ_MAXV0 / PROJ_MAXH） */
      var MAXV0 = PROJ_MAXV0, MAXH = PROJ_MAXH;
      function maxRange() { return MAXV0 * Math.sqrt(2 * MAXH / G); }   /* ≈ 6.26 m */

      function geom() {
        var groundY = env.H * 0.84;
        var x0 = 80;
        /* 比例尺要同时容得下「高度上限 3 m」和「最大射程」。
           射程上限不是 4 m：v₀ = 8 m/s、h = 3 m 时 x = v₀√(2h/g) ≈ 6.26 m，
           以前按 4.2 m 定标，窄画布上小球会一路飞出右边界；
           竖直方向以前也按固定 2.2 m 算，h 调到 3 m 时发射器被画到画布上方。 */
        var PX = Math.min((groundY - 96) / (MAXH * 1.08), (env.W - x0 - 40) / (maxRange() * 1.02));
        return { groundY: groundY, PX: PX, x0: x0 };
      }

      return {
        set: set, action: action, applyPreset: applyPreset,
        update: update,
        hint: function () {
          if (running) return '平抛中：t = ' + PHY.fmt(t, 2) + ' s，x = ' + PHY.fmt(v0 * t, 2) + ' m，y = ' + PHY.fmt(Math.max(0, h - 0.5 * G * t * t), 2) + ' m';
          if (done) return '落地：t = ' + PHY.fmt(landT(), 2) + ' s，射程 ' + PHY.fmt(range(), 2) + ' m。点「验证 x = v₀t」检查水平方向。';
          return '设置 v₀ 与高度后点「释放小球」。竖直方向与自由落体小球完全同步。';
        },
        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>初速度 v₀</dt><dd>' + PHY.fmt(v0, 1) + ' m/s（水平）</dd></div>');
          out.push('<div><dt>高度 h</dt><dd>' + PHY.fmt(h, 2) + ' m</dd></div>');
          if (done) {
            out.push('<div><dt>飞行时间</dt><dd>t = √(2h/g) = ' + PHY.fmt(landT(), 2) + ' s</dd></div>');
            out.push('<div><dt>水平射程</dt><dd>x = v₀t = ' + PHY.fmt(range(), 2) + ' m</dd></div>');
            out.push('<div><dt>与自由落体对比</dt><dd>' + (sameTime ? '同时落地 → 竖直方向就是自由落体' : '—') + '</dd></div>');
          }
          out.push('</dl>');
          return out.join('');
        },
        draw: function (gg, W, H) {
          bgFill(gg, W, H);
          var gm = geom();
          var groundY = gm.groundY, PX = gm.PX, x0 = gm.x0;
          /* 地面与网格 */
          gg.fillStyle = '#8d939b';
          gg.fillRect(0, groundY + 8, W, 6);
          gg.strokeStyle = 'rgba(138,153,168,0.4)';
          gg.fillStyle = '#8a99a8';
          gg.font = '10px ' + FONT;
          gg.lineWidth = 1;
          /* 网格铺满整个量程：横向到最大射程（v₀、h 都取上限时的 x），
             纵向到高度上限 3 m。以前横向只画到 4 m、纵向只到 2 m，
             量程调大后轨迹会跑到没有刻度的空白区里。 */
          var gxMax = Math.ceil(maxRange() * 2) / 2;
          for (var gx = 0; gx <= gxMax + 1e-9; gx += 0.5) {
            var x = x0 + gx * PX;
            if (x > W - 12) break;
            gg.beginPath(); gg.moveTo(x, 40); gg.lineTo(x, groundY + 8); gg.stroke();
            if (Math.abs(gx - Math.round(gx)) < 1e-9) { gg.textAlign = 'center'; gg.fillText(Math.round(gx) + 'm', x, groundY + 24); }
          }
          for (var gy = 0; gy <= MAXH + 1e-9; gy += 0.5) {
            var y = groundY - gy * PX;
            if (y < 26) break;
            gg.beginPath(); gg.moveTo(x0 - 10, y); gg.lineTo(W - 30, y); gg.stroke();
            if (Math.abs(gy - Math.round(gy)) < 1e-9) { gg.textAlign = 'right'; gg.fillText(Math.round(gy) + 'm', x0 - 14, y + 3); }
          }
          /* 发射器 */
          var ly = groundY - h * PX;
          gg.fillStyle = '#37414c';
          PHY.rr(gg, x0 - 46, ly - 8, 44, 16, 4); gg.fill();
          gg.fillStyle = '#e2603c';
          gg.fillRect(x0 - 6, ly - 3, 8, 6);
          /* 轨迹点 */
          dots.forEach(function (d) {
            var x = x0 + d.x * PX;
            var y = groundY - d.y * PX;
            gg.beginPath(); gg.arc(x, y, 3.2, 0, 7);
            gg.fillStyle = '#1e9fd8'; gg.fill();
          });
          /* 球 */
          var bx = running ? v0 * t : (done ? range() : 0);
          var by = running ? Math.max(0, h - 0.5 * G * t * t) : (done ? 0 : h);
          var px = x0 + bx * PX, py = groundY - by * PX;
          /* 自由落体对比球（与平抛小球竖直方向完全同步） */
          if (showGhost && (running || done)) {
            var gy2 = running ? Math.max(0, h - 0.5 * G * t * t) : 0;
            gg.save();
            gg.globalAlpha = 0.55;
            gg.beginPath(); gg.arc(x0 - 26, groundY - gy2 * PX, 6, 0, 7);
            gg.fillStyle = '#8b6fd8'; gg.fill();
            gg.restore();
            gg.fillStyle = '#8b6fd8';
            gg.font = '10px ' + FONT;
            gg.textAlign = 'right';
            gg.fillText('自由落体', x0 - 36, groundY - gy2 * PX + 3);
          }
          gg.beginPath(); gg.arc(px, py, 7, 0, 7);
          gg.fillStyle = '#1e9fd8'; gg.fill();
          gg.strokeStyle = '#0f7fbf'; gg.lineWidth = 1.5; gg.stroke();
          /* 速度分解 */
          if (running && t > 0.1) {
            var vk = 26;
            PHY.arrow(gg, px, py, px + v0 / 6 * vk, py, 'rgba(226,96,60,0.85)', 2, 6);
            PHY.arrow(gg, px, py, px, py + G * t / 8 * vk * 0.4, 'rgba(139,111,216,0.85)', 2, 6);
          }
          gg.fillStyle = '#3d5a72';
          gg.font = '12px ' + FONT;
          gg.textAlign = 'left';
          gg.fillText('水平：匀速 x = v₀t　　竖直：自由落体 y = ½gt²', x0 - 10, 34);
        },
        isDone: function () { return done; },
        isRunning: function () { return running; },
        dots: function () { return dots; },
        landT: landT,
        rangeM: range,
        sameTime: function () { return sameTime; },
        verified: function () { return verified; },
        params: function () { return { v0: v0, h: h }; },
        __test: { run: function () { action('run'); }, verify: function () { action('verify'); }, setV0: function (v) { v0 = v; }, setH: function (v) { h = v; } }
      };
    }
  });

  /* ============================================================
   * 4. 探究杠杆的平衡条件（初中）
   * ========================================================== */
  PHY.registerSim({
    id: 'lever',
    name: '探究杠杆的平衡条件',
    field: 'mech',
    icon: '⚖️',
    level: 'junior',
    desc: '在杠杆两侧挂钩码使杠杆水平平衡，归纳 F₁L₁ = F₂L₂。',
    tip: '点击杠杆刻度处挂钩码，点击已挂的钩码取下；平衡时自动记录数据。',
    controls: function (inst) {
      return [
        { type: 'note', text: '已挂 ' + inst.hookCount() + ' 个钩码（每个 0.5 N，间距 1 格）' },
        { type: 'sep' },
        { type: 'button', id: 'reset', label: '取下全部钩码', danger: true },
        { type: 'note', text: '左 F₁L₁ = ' + PHY.fmt(inst.torqueL(), 1) + ' N·格　右 F₂L₂ = ' + PHY.fmt(inst.torqueR(), 1) + ' N·格' }
      ];
    },

    create: function (env) {
      var hooks = [];          // {side:-1|1, pos:1..6, n}
      var records = [];
      var angle = 0;           // 当前倾角（度）
      var UNIT_G = 0.5;        // 每个钩码 0.5N（50g）

      function torque(side) {
        var s = 0;
        hooks.forEach(function (hk) {
          if (hk.side === side) s += hk.n * hk.pos;
        });
        return s * UNIT_G;   // N·格
      }
      function balanced() {
        return hooks.some(function (h2) { return h2.side === -1; }) &&
          hooks.some(function (h2) { return h2.side === 1; }) &&
          Math.abs(torque(-1) - torque(1)) < 1e-9;
      }
      function recordIfBalanced() {
        if (!balanced()) return;
        var key = hooks.filter(function (h2) { return h2.n > 0; })
          .map(function (h2) { return h2.side + ':' + h2.pos + 'x' + h2.n; }).sort().join('|');
        var dup = records.some(function (r) { return r.key === key; });
        if (dup) return;
        function desc(side) {
          return hooks.filter(function (h2) { return h2.side === side && h2.n > 0; })
            .map(function (h2) { return h2.pos + '格×' + h2.n + '个'; }).join(' + ');
        }
        records.push({
          key: key, desc1: desc(-1), desc2: desc(1),
          F1L1: torque(-1), F2L2: torque(1)
        });
        PHY.log('杠杆平衡：左侧 ' + desc(-1) + '，右侧 ' + desc(1) + ' → F₁L₁ = F₂L₂ = ' + PHY.fmt(torque(-1), 1) + ' N·格', '', 'success');
      }

      function onDown(x, y) {
        var gm = geom();
        var gy = gm.y;
        if (Math.abs(y - gy) > 46 || Math.abs(x - gm.cx) > gm.unit * 6.6) return;
        var pos = Math.round((x - gm.cx) / gm.unit);
        if (pos === 0) { PHY.toast('支点不能挂钩码。'); return; }
        var side = pos < 0 ? -1 : 1;
        var ap = Math.abs(pos);
        var hk = null;
        hooks.forEach(function (h2) { if (h2.side === side && h2.pos === ap) hk = h2; });
        if (hk && hk.n > 0) {
          hk.n--;
          PHY.log('取下一个钩码。');
        } else {
          if (!hk) { hk = { side: side, pos: ap, n: 0 }; hooks.push(hk); }
          hk.n++;
          PHY.log('在' + (side < 0 ? '左' : '右') + '侧第 ' + ap + ' 格挂 1 个钩码（0.5N）。');
        }
        recordIfBalanced();
      }
      function geom() {
        var cx = env.W / 2;
        var y = env.H * 0.44;
        var unit = Math.min(56, env.W * 0.058);
        return { cx: cx, y: y, unit: unit };
      }
      function action(id) {
        if (id === 'reset') { hooks = []; angle = 0; PHY.log('已取下全部钩码。'); }
      }
      function applyPreset() { }

      function update(dt) {
        var target = PHY.clamp((torque(-1) - torque(1)) * 5, -16, 16);
        angle += (target - angle) * Math.min(1, dt * 5);
      }

      function info() {
        var out = ['<dl class="kv">'];
        out.push('<div><dt>左侧 F₁L₁</dt><dd>' + PHY.fmt(torque(-1), 1) + ' N·格</dd></div>');
        out.push('<div><dt>右侧 F₂L₂</dt><dd>' + PHY.fmt(torque(1), 1) + ' N·格</dd></div>');
        out.push('<div><dt>状态</dt><dd>' + (balanced() ? '<span style="color:#2fa96b">水平平衡</span>' : (Math.abs(angle) < 1.5 ? '接近平衡' : (angle > 0 ? '左端下沉' : '右端下沉'))) + '</dd></div>');
        out.push('</dl>');
        if (records.length) {
          out.push('<p style="margin:8px 0 2px"><b>平衡记录（F₁L₁ = F₂L₂）</b></p><div class="chips">');
          records.forEach(function (r, i) {
            out.push('<span class="chip">' + (i + 1) + '：左 ' + r.desc1 + ' ⇄ 右 ' + r.desc2 + '</span>');
          });
          out.push('</div>');
        }
        return out.join('');
      }

      return {
        action: action, applyPreset: applyPreset,
        onDown: onDown,
        update: update,
        info: info,
        hint: function () {
          if (!hooks.length) return '点击杠杆两侧的刻度位置挂钩码（每个 0.5N），让杠杆在水平位置平衡。';
          if (balanced()) return '杠杆水平平衡！F₁L₁ = F₂L₂。换一组数据再试，找出普遍规律。';
          return '现在 F₁L₁ ' + (torque(-1) > torque(1) ? '>' : '<') + ' F₂L₂，杠杆不平衡——调整个数或格数。';
        },
        draw: function (gg, W, H) {
          bgFill(gg, W, H);
          var gm = geom();
          var cx = gm.cx, y = gm.y, unit = gm.unit;
          gg.save();
          /* 支架 */
          gg.fillStyle = '#6d7780';
          gg.beginPath();
          gg.moveTo(cx - 16, y + 120); gg.lineTo(cx + 16, y + 120); gg.lineTo(cx, y + 6); gg.closePath();
          gg.fill();
          gg.fillRect(cx - 60, y + 118, 120, 8);
          /* 杠杆（旋转） */
          gg.translate(cx, y);
          gg.rotate(angle * Math.PI / 180);
          gg.fillStyle = '#d8a24a';
          PHY.rr(gg, -unit * 6.5, -7, unit * 13, 14, 5); gg.fill();
          gg.strokeStyle = '#a5732c'; gg.lineWidth = 1.5; gg.stroke();
          /* 刻度 */
          for (var i = -6; i <= 6; i++) {
            var x = i * unit;
            gg.strokeStyle = 'rgba(90,60,20,0.55)';
            gg.beginPath(); gg.moveTo(x, -7); gg.lineTo(x, i % 2 === 0 ? 7 : 3); gg.stroke();
            if (i !== 0 && i % 2 === 0) {
              gg.fillStyle = '#5d4630';
              gg.font = '10px ' + FONT;
              gg.textAlign = 'center'; gg.textBaseline = 'bottom';
              gg.fillText(String(Math.abs(i)), x, -10);
            }
          }
          /* 支点 */
          gg.beginPath(); gg.arc(0, 0, 6, 0, 7);
          gg.fillStyle = '#37414c'; gg.fill();
          /* 钩码（挂在旋转后的位置，竖直向下） */
          hooks.forEach(function (hk) {
            if (!hk.n) return;
            var hx = hk.side * hk.pos * unit;
            for (var k = 0; k < hk.n; k++) {
              var wy = 12 + k * 12;
              gg.fillStyle = '#8a5a2b';
              PHY.rr(gg, hx - 9, wy, 18, 10, 2); gg.fill();
              gg.strokeStyle = '#5d4630'; gg.stroke();
            }
            gg.fillStyle = '#3d5a72';
            gg.font = '600 10px ' + FONT;
            gg.textAlign = 'center'; gg.textBaseline = 'top';
            gg.fillText(hk.n + '个', hx, 12 + hk.n * 12 + 2);
          });
          gg.restore();
          /* 提示 */
          gg.fillStyle = '#3d5a72';
          gg.font = '12px ' + FONT;
          gg.textAlign = 'center';
          gg.fillText('点击刻度处挂钩码 / 取下钩码　每个钩码 G = 0.5 N', cx, H - 22);
          gg.fillText('左侧 F₁L₁ = ' + PHY.fmt(torque(-1), 1) + ' N·格　　右侧 F₂L₂ = ' + PHY.fmt(torque(1), 1) + ' N·格', cx, H - 44);
        },
        balanced: balanced,
        records: function () { return records; },
        torqueL: function () { return torque(-1); },
        torqueR: function () { return torque(1); },
        hookCount: function () { return hooks.reduce(function (s, h2) { return s + h2.n; }, 0); },
        __test: {
          hang: function (side, pos, n) {
            var hk = null;
            hooks.forEach(function (h2) { if (h2.side === side && h2.pos === pos) hk = h2; });
            if (!hk) { hk = { side: side, pos: pos, n: 0 }; hooks.push(hk); }
            hk.n = n;
            recordIfBalanced();
          },
          clear: function () { hooks = []; }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
