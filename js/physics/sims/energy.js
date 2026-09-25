/* =============================================================================
 * 虚拟实验室 —— 能量与动量仿真 (js/physics/sims/energy.js)
 * -----------------------------------------------------------------------------
 * 1) conserve   验证机械能守恒定律（高中）：
 *                重物拖纸带自由下落（打点计时器），比较 gh 与 ½v²；
 *                实时能量条展示动能与重力势能的转化。
 * 2) momentum   验证动量守恒定律（高中）：
 *                气垫导轨上两滑块一维碰撞（弹性 / 完全非弹性），
 *                对比碰前碰后的总动量与总动能。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
  var G = 9.8;

  function bgFill(gg, W, H) {
    var bg = gg.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f6fafe');
    bg.addColorStop(1, '#e3edf7');
    gg.fillStyle = bg;
    gg.fillRect(0, 0, W, H);
  }

  /* ============================================================
   * 1. 验证机械能守恒定律
   * ========================================================== */
  PHY.registerSim({
    id: 'conserve',
    name: '验证机械能守恒定律',
    field: 'mech',
    icon: '🎢',
    level: 'senior',
    desc: '重物拖纸带自由下落，用打点计时器求瞬时速度，比较重力势能减少量与动能增加量。',
    tip: '点「释放重物」打出纸带；右侧能量条实时显示动能与势能。',
    controls: function (inst) {
      var p = inst.params();
      return [
        { type: 'slider', id: 'm', label: '重物质量 m', min: 0.1, max: 1, step: 0.05, value: p.m, unit: 'kg' },
        { type: 'sep' },
        { type: 'button', id: 'run', label: '释放重物', primary: true },
        { type: 'button', id: 'reset', label: '重置纸带' }
      ];
    },

    create: function (env) {
      var m = 0.3;                 // 重物质量 kg
      var DROP = 0.6;              // 下落高度 m
      var running = false, done = false;
      var t = 0, y = 0;            // y：已下落距离
      var tape = [];               // {t, y} 每 0.02s
      var dotAcc = 0;
      var T = 0.02;

      function vOf(yy) { return Math.sqrt(2 * G * yy); }
      /* 用中间时刻速度：v_n = (y_{n+1} − y_{n−1}) / 2T */
      function points() {
        var out = [];
        for (var i = 1; i < tape.length - 1; i++) {
          var v = (tape[i + 1].y - tape[i - 1].y) / (2 * T);
          var h = tape[i].y;
          var dK = 0.5 * m * v * v;
          var dP = m * G * h;
          out.push({ i: i, t: tape[i].t, y: h, v: v, dK: dK, dP: dP, err: Math.abs(dK - dP) / Math.max(1e-9, dP) });
        }
        return out;
      }
      function maxErr() {
        var pts = points();
        if (!pts.length) return null;
        var mx = 0;
        pts.forEach(function (p) { if (p.err > mx) mx = p.err; });
        return mx;
      }

      function update(dt) {
        if (!running || done) return;
        t += dt;
        y = 0.5 * G * t * t;
        dotAcc += dt;
        while (dotAcc >= T) {
          dotAcc -= T;
          var tt = tape.length * T;
          tape.push({ t: tt, y: 0.5 * G * tt * tt });
        }
        if (y >= DROP) {
          done = true; running = false;
          var me = maxErr();
          PHY.log('重物落地：下落 ' + PHY.fmt(DROP, 2) + ' m。' +
            (me !== null ? '全程 |½v² − gh| / gh 最大相对误差 ' + PHY.fmt(me * 100, 1) + '% → 机械能守恒。' : ''), '', 'reaction');
        }
      }
      function action(id) {
        if (id === 'run') {
          tape = []; t = 0; y = 0; done = false; running = true;
          PHY.log('释放重物：m = ' + PHY.fmt(m, 2) + ' kg，下落 h = ' + PHY.fmt(DROP, 2) + ' m。');
        } else if (id === 'reset') {
          running = false; done = false; t = 0; y = 0; tape = [];
        }
      }
      function set(id, v) { if (id === 'm') m = v; }
      function applyPreset(p) { if (p && p.m) m = p.m; }

      return {
        set: set, action: action, applyPreset: applyPreset,
        update: update,
        hint: function () {
          if (running) return '下落中：v = ' + PHY.fmt(vOf(y), 2) + ' m/s，已下落 ' + PHY.fmt(y, 3) + ' m';
          if (done) return '比较每一时刻的 ½v² 与 gh：在误差范围内相等 → 机械能守恒。';
          return '点「释放重物」打出纸带；质量大小不影响验证结果。';
        },
        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>重物质量</dt><dd>' + PHY.fmt(m, 2) + ' kg</dd></div>');
          out.push('<div><dt>下落高度</dt><dd>' + PHY.fmt(DROP, 2) + ' m</dd></div>');
          var me = maxErr();
          if (me !== null) out.push('<div><dt>最大相对误差</dt><dd>' + PHY.fmt(me * 100, 1) + '%</dd></div>');
          out.push('</dl>');
          var pts = points();
          if (pts.length) {
            out.push('<p style="margin:8px 0 2px"><b>纸带数据（v 取中间时刻速度）</b></p><div class="chips">');
            pts.slice(0, 10).forEach(function (p) {
              out.push('<span class="chip">h=' + PHY.fmt(p.y, 3) + 'm：½v²=' + PHY.fmt(p.dK, 3) + ' / gh=' + PHY.fmt(p.dP, 3) + ' J</span>');
            });
            out.push('</div>');
            out.push('<div class="hint-box">Δ½v² ≈ Δgh → 只有重力做功时机械能守恒。</div>');
          }
          return out.join('');
        },
        draw: function (gg, W, H) {
          bgFill(gg, W, H);
          var PX = (H * 0.62) / DROP;
          var x0 = W * 0.3;
          var topY = 70;
          /* 铁架台 */
          gg.fillStyle = '#6d7780';
          gg.fillRect(x0 - 8, topY - 26, 10, topY + 26);
          gg.fillRect(x0 - 60, topY - 34, 120, 8);
          /* 打点计时器 */
          gg.fillStyle = '#37414c';
          gg.fillRect(x0 - 30, topY - 56, 44, 30);
          gg.fillStyle = '#e0a13c';
          gg.fillRect(x0 + 12, topY - 52, 10, 22);
          /* 纸带 + 重物 */
          var curY = done ? DROP : y;
          var wy = topY + curY * PX;
          gg.fillStyle = '#fbf6ea';
          gg.fillRect(x0 - 7, topY - 20, 14, Math.max(6, wy - topY));
          gg.strokeStyle = '#c9bfa8';
          gg.strokeRect(x0 - 7, topY - 20, 14, Math.max(6, wy - topY));
          gg.fillStyle = '#8a5a2b';
          gg.fillRect(x0 - 16, wy, 32, 26);
          gg.strokeStyle = '#5d4630';
          gg.strokeRect(x0 - 16, wy, 32, 26);
          gg.fillStyle = '#3d5a72';
          gg.font = '600 11px ' + FONT;
          gg.textAlign = 'left';
          gg.fillText('m=' + PHY.fmt(m, 2) + 'kg', x0 + 22, wy + 16);
          /* 高度标尺 */
          gg.strokeStyle = 'rgba(138,153,168,0.6)';
          gg.beginPath(); gg.moveTo(x0 - 60, topY); gg.lineTo(x0 - 60, topY + DROP * PX); gg.stroke();
          gg.fillStyle = '#8a99a8';
          gg.textAlign = 'right';
          gg.fillText('h = 0.6m', x0 - 66, topY + DROP * PX + 4);
          /* 能量条 */
          var bx = W - 210, bw = 160;
          var ke = 0.5 * m * vOf(curY) * vOf(curY);
          var pe = m * G * (DROP - curY);
          var E0 = m * G * DROP;
          PHY.panel(gg, bx, 24, bw + 36, 130, '能量（J）');
          function bar(label, val, colr, yy) {
            gg.fillStyle = '#3d5a72';
            gg.font = '11px ' + FONT;
            gg.textAlign = 'left'; gg.textBaseline = 'middle';
            gg.fillText(label, bx + 12, yy);
            gg.fillStyle = '#e6eef5';
            gg.fillRect(bx + 60, yy - 7, bw - 70, 14);
            gg.fillStyle = colr;
            gg.fillRect(bx + 60, yy - 7, (bw - 70) * PHY.clamp(val / E0, 0, 1), 14);
            gg.fillStyle = '#22384a';
            gg.textAlign = 'right';
            gg.fillText(PHY.fmt(val, 2), bx + bw - 6, yy);
          }
          bar('动能 ½mv²', ke, '#e2603c', 66);
          bar('势能 mgh', pe, '#1e9fd8', 92);
          bar('机械能', ke + pe, '#2fa96b', 118);
          gg.textAlign = 'left';
          gg.fillStyle = '#3d5a72';
          gg.font = '12px ' + FONT;
          gg.fillText('只有重力做功 → 动能与势能相互转化，总量保持不变', 60, H - 26);
        },
        isDone: function () { return done; },
        isRunning: function () { return running; },
        points: points,
        maxErr: maxErr,
        params: function () { return { m: m }; },
        __test: { run: function () { action('run'); }, setM: function (v) { m = v; } }
      };
    }
  });

  /* ============================================================
   * 2. 验证动量守恒定律
   * ========================================================== */
  PHY.registerSim({
    id: 'momentum',
    name: '验证动量守恒定律',
    field: 'mech',
    icon: '🎱',
    level: 'senior',
    desc: '气垫导轨上两滑块一维碰撞：弹性 / 完全非弹性，比较碰前碰后的总动量。',
    tip: '设置两滑块质量与速度，点「释放」；碰后自动记录动量对比。',
    controls: function (inst) {
      var p = inst.params();
      return [
        { type: 'slider', id: 'm1', label: '滑块 1 质量 m₁', min: 0.1, max: 1, step: 0.05, value: p.m1, unit: 'kg' },
        { type: 'slider', id: 'v1', label: '碰前速度 v₁', min: 0, max: 1.5, step: 0.05, value: p.v1, unit: 'm/s' },
        { type: 'slider', id: 'm2', label: '滑块 2 质量 m₂', min: 0.1, max: 1, step: 0.05, value: p.m2, unit: 'kg' },
        { type: 'slider', id: 'v2', label: '碰前速度 v₂', min: -0.6, max: 0.6, step: 0.05, value: p.v2, unit: 'm/s' },
        { type: 'select', id: 'kind', label: '碰撞类型', value: p.kind, options: [{ v: 'elastic', t: '弹性碰撞' }, { v: 'inelastic', t: '完全非弹性碰撞' }] },
        { type: 'sep' },
        { type: 'button', id: 'run', label: '释放滑块', primary: true },
        { type: 'button', id: 'clearRec', label: '清除记录' },
        { type: 'button', id: 'reset', label: '复位' }
      ];
    },

    create: function (env) {
      var m1 = 0.3, m2 = 0.2, v1 = 0.5, v2 = 0;
      var kind = 'elastic';        // elastic | inelastic
      var running = false, done = false, collided = false;
      var x1 = 1.2, x2 = 2.6;      // 位置 m（导轨 0~4m）
      var v1c = 0, v2c = 0;
      var results = [];            // 每次碰撞记录
      var PX, trackY;

      function reset() {
        x1 = 1.2; x2 = 2.6;
        v1c = v1; v2c = v2;
        done = false; collided = false;
      }
      function collide() {
        var pBefore = m1 * v1c + m2 * v2c;
        var keBefore = 0.5 * m1 * v1c * v1c + 0.5 * m2 * v2c * v2c;
        var u1, u2;
        if (kind === 'elastic') {
          u1 = ((m1 - m2) * v1c + 2 * m2 * v2c) / (m1 + m2);
          u2 = ((m2 - m1) * v2c + 2 * m1 * v1c) / (m1 + m2);
        } else {
          u1 = u2 = pBefore / (m1 + m2);
        }
        var pAfter = m1 * u1 + m2 * u2;
        var keAfter = 0.5 * m1 * u1 * u1 + 0.5 * m2 * u2 * u2;
        results.push({
          kind: kind, m1: m1, m2: m2, v1: v1c, v2: v2c, u1: u1, u2: u2,
          pB: pBefore, pA: pAfter, keB: keBefore, keA: keAfter
        });
        v1c = u1; v2c = u2;
        collided = true;
        PHY.log('碰撞（' + (kind === 'elastic' ? '弹性' : '完全非弹性') + '）：p前 = ' + PHY.fmt(pBefore, 3) + ' kg·m/s，p后 = ' + PHY.fmt(pAfter, 3) + ' kg·m/s' +
          '，Ek前 = ' + PHY.fmt(keBefore, 3) + ' J，Ek后 = ' + PHY.fmt(keAfter, 3) + ' J' +
          (kind === 'elastic' ? '（动能也无损失）' : '（动能损失最大）'), '', 'reaction');
        return { pB: pBefore, pA: pAfter, keB: keBefore, keA: keAfter };
      }
      function last() { return results[results.length - 1] || null; }

      function update(dt) {
        if (!running || done) return;
        x1 += v1c * dt;
        x2 += v2c * dt;
        if (!collided && x2 - x1 <= 0.24) {
          collide();
        }
        /* 撞墙反弹（弹性），防止跑出导轨 */
        if (x1 < 0.15) { x1 = 0.15; v1c = Math.abs(v1c); }
        if (x1 > 3.85) { x1 = 3.85; v1c = -Math.abs(v1c); }
        if (x2 < 0.15) { x2 = 0.15; v2c = Math.abs(v2c); }
        if (x2 > 3.85) { x2 = 3.85; v2c = -Math.abs(v2c); }
        if (collided && Math.abs(v1c) < 0.01 && Math.abs(v2c) < 0.01) { done = true; running = false; }
      }
      function action(id) {
        if (id === 'run') { reset(); running = true; PHY.log('释放滑块：m₁=' + PHY.fmt(m1, 2) + 'kg v₁=' + PHY.fmt(v1, 2) + 'm/s，m₂=' + PHY.fmt(m2, 2) + 'kg v₂=' + PHY.fmt(v2, 2) + 'm/s（' + (kind === 'elastic' ? '弹性碰撞' : '完全非弹性碰撞') + '）。'); }
        else if (id === 'reset') { reset(); running = false; }
        else if (id === 'clearRec') { results = []; collided = false; PHY.log('已清除碰撞记录。'); }
      }
      function set(id, v) {
        if (id === 'm1') m1 = v;
        else if (id === 'm2') m2 = v;
        else if (id === 'v1') v1 = v;
        else if (id === 'v2') v2 = v;
        else if (id === 'kind') kind = v;
        if (!running) reset();
      }
      function applyPreset(p) {
        if (!p) return;
        if (p.m1) m1 = p.m1; if (p.m2) m2 = p.m2;
        if (p.v1 !== undefined) v1 = p.v1; if (p.v2 !== undefined) v2 = p.v2;
        if (p.kind) kind = p.kind;
        reset();
      }

      function geom() {
        PX = (env.W - 120) / 4;
        trackY = env.H * 0.4;
        return { PX: PX, trackY: trackY };
      }
      function drawGlider(gg, xm, m, v, colr, label) {
        var px = 60 + xm * PX;
        var w = 26 + m * 40;
        gg.fillStyle = colr;
        PHY.rr(gg, px - w / 2, trackY - 16, w, 20, 4); gg.fill();
        gg.strokeStyle = 'rgba(0,0,0,0.25)'; gg.stroke();
        gg.fillStyle = '#3d5a72';
        gg.font = '600 10px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'bottom';
        gg.fillText(label, px, trackY - 22);
        if (Math.abs(v) > 0.005) {
          PHY.arrow(gg, px, trackY + 14, px + v * 60, trackY + 14, '#e2603c', 2.2, 7);
          gg.fillStyle = '#e2603c';
          gg.font = '600 10px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText(PHY.fmt(v, 2) + 'm/s', px + v * 60, trackY + 20);
        }
      }

      return {
        set: set, action: action, applyPreset: applyPreset,
        update: update,
        hint: function () {
          if (running) return '碰前 v₁=' + PHY.fmt(v1c, 2) + ' m/s，v₂=' + PHY.fmt(v2c, 2) + ' m/s';
          if (collided) {
            var r = last();
            return '碰后 v₁′=' + PHY.fmt(r.u1, 2) + '，v₂′=' + PHY.fmt(r.u2, 2) + ' m/s。换一组质量 / 速度再做几次。';
          }
          return '点「释放」开始碰撞；也可以切换碰撞类型再做一次。';
        },
        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>碰前总动量</dt><dd>' + (collided || running ? PHY.fmt(m1 * v1c + m2 * v2c, 3) : PHY.fmt(m1 * v1 + m2 * v2, 3)) + ' kg·m/s</dd></div>');
          if (collided) {
            var r = last();
            out.push('<div><dt>碰后总动量</dt><dd>' + PHY.fmt(r.pA, 3) + ' kg·m/s' + (Math.abs(r.pB - r.pA) < 1e-6 ? '（守恒 ✓）' : '') + '</dd></div>');
            out.push('<div><dt>总动能</dt><dd>' + PHY.fmt(r.keB, 3) + ' → ' + PHY.fmt(r.keA, 3) + ' J' +
              (Math.abs(r.keB - r.keA) < 1e-6 ? '（弹性碰撞：不变）' : '（损失 ' + PHY.fmt((r.keB - r.keA) / r.keB * 100, 0) + '%）') + '</dd></div>');
          }
          out.push('</dl>');
          if (results.length) {
            out.push('<p style="margin:8px 0 2px"><b>碰撞记录</b></p><div class="chips">');
            results.forEach(function (r, i) {
              out.push('<span class="chip">' + (i + 1) + ' ' + (r.kind === 'elastic' ? '弹性' : '非弹性') + '：p ' + PHY.fmt(r.pB, 2) + '→' + PHY.fmt(r.pA, 2) + '</span>');
            });
            out.push('</div>');
            out.push('<div class="hint-box">系统不受外力（气垫抵消摩擦）→ 总动量保持不变；弹性碰撞动能也不变。</div>');
          }
          return out.join('');
        },
        draw: function (gg, W, H) {
          bgFill(gg, W, H);
          geom();
          var ty = trackY;
          gg.fillStyle = '#9aa7b2';
          gg.fillRect(40, ty + 6, W - 80, 6);
          gg.fillStyle = '#e6eef5';
          gg.fillRect(40, ty + 6, W - 80, 4);
          /* 光门刻度 */
          for (var i = 0; i <= 4; i++) {
            var x = 60 + i * PX;
            gg.strokeStyle = 'rgba(138,153,168,0.5)';
            gg.beginPath(); gg.moveTo(x, ty - 30); gg.lineTo(x, ty + 10); gg.stroke();
            gg.fillStyle = '#8a99a8';
            gg.font = '10px ' + FONT;
            gg.textAlign = 'center'; gg.textBaseline = 'top';
            gg.fillText(i + 'm', x, ty + 14);
          }
          var run = running;
          drawGlider(gg, run ? x1 : (collided ? x1 : 1.2), m1, run || collided ? v1c : v1, '#1e9fd8', 'm₁=' + PHY.fmt(m1, 2) + 'kg');
          drawGlider(gg, run ? x2 : (collided ? x2 : 2.6), m2, run || collided ? v2c : v2, '#8b6fd8', 'm₂=' + PHY.fmt(m2, 2) + 'kg');
          if (done && collided) {
            var r = last();
            gg.fillStyle = '#2fa96b';
            gg.font = '700 14px ' + FONT;
            gg.textAlign = 'center';
            gg.fillText('p前 = ' + PHY.fmt(r.pB, 3) + ' kg·m/s = p后 = ' + PHY.fmt(r.pA, 3) + ' kg·m/s  ✓ 动量守恒', W / 2, H - 30);
          }
        },
        isCollided: function () { return collided; },
        results: function () { return results; },
        last: last,
        params: function () { return { m1: m1, m2: m2, v1: v1, v2: v2, kind: kind }; },
        __test: {
          run: function () { action('run'); },
          setKind: function (k) { kind = k; },
          setP: function (p) { if (p.m1) m1 = p.m1; if (p.m2) m2 = p.m2; if (p.v1 !== undefined) v1 = p.v1; if (p.v2 !== undefined) v2 = p.v2; reset(); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
