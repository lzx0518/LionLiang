/* =============================================================================
 * 虚拟实验室 —— 声学仿真 (js/physics/sims/sound.js)
 * -----------------------------------------------------------------------------
 * 1) sound  声音的特性与传播（初中）
 *    · 敲击音叉发声：振动产生声音，振动停止、发声停止
 *    · 频率 → 音调（示波器上波形变密）、振幅 → 响度（波形变高）
 *    · 波形 → 音色（正弦 / 方波 / 三角波，对应音叉 / 电声 / 琴弦）
 *    · 介质决定传播速度；抽出罩内空气（真空度 → 100%）后声音传不出来，
 *      说明声音的传播需要介质
 *
 * 动画说明：声波在空气中 340 m/s，真实速度无法直接观察，所以画布上的波前
 * 做了「慢放 + 压缩」处理，面板里始终显示真实数值，并在提示里说明这一点。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

  var MEDIA = {
    air: { name: '空气', v: 340, ok: true },
    water: { name: '水', v: 1500, ok: true },
    steel: { name: '钢铁', v: 5000, ok: true },
    vacuum: { name: '真空（无介质）', v: 0, ok: false }
  };

  /* 波形函数：相位 p（弧度）→ -1..1 */
  var TIMBRE = {
    sine: { name: '正弦（音叉）', f: function (p) { return Math.sin(p); } },
    square: { name: '方波（电声）', f: function (p) { return Math.sin(p) >= 0 ? 0.92 : -0.92; } },
    triangle: {
      name: '三角波（琴弦）', f: function (p) {
        var x = ((p / (Math.PI * 2)) % 1 + 1) % 1;
        return 4 * Math.abs(x - 0.5) - 1;
      }
    }
  };

  var BASE_VX = 220;     /* 空气中的波前视觉速度 px/s（慢放后的示意值） */

  PHY.registerSim({
    id: 'sound',
    name: '声音的特性与传播',
    field: 'sound',
    icon: '🔊',
    level: 'junior',
    tag: '声现象',
    desc: '敲击音叉发声：改变频率体会音调、改变振幅体会响度、换波形体会音色；把罩内空气抽空，声音就传不出来了。',
    tip: '点「敲击音叉」发声；调频率 / 振幅 / 波形看示波器上的变化；把真空度拉满看声音消失。',

    controls: function (inst) {
      return [
        { type: 'slider', id: 'freq', label: '频率 f', min: 100, max: 1000, step: 20, value: inst.getFreq(), unit: 'Hz' },
        { type: 'slider', id: 'amp', label: '振幅 A', min: 0.05, max: 1, step: 0.05, value: inst.getAmp(), fmt: function (v) { return Number(v).toFixed(2); } },
        { type: 'select', id: 'timbre', label: '波形（音色）', value: inst.getTimbre(), options: Object.keys(TIMBRE).map(function (k) { return { v: k, t: TIMBRE[k].name }; }) },
        { type: 'select', id: 'medium', label: '传播介质', value: inst.getMedium(), options: Object.keys(MEDIA).map(function (k) { return { v: k, t: MEDIA[k].name }; }) },
        { type: 'slider', id: 'vacuum', label: '罩内真空度', min: 0, max: 100, step: 5, value: inst.getVacuum() * 100, unit: '%' },
        { type: 'sep' },
        { type: 'button', id: 'strike', label: '敲击音叉', primary: true },
        { type: 'button', id: 'stop', label: '按住音叉（振动停止）' },
        { type: 'note', text: '波长 λ = ' + PHY.fmt(inst.wavelengthCM(), 1) + ' cm' }
      ];
    },

    create: function (env) {
      var freq = 440, amp = 0.6, medium = 'air', timbre = 'sine';
      var vacuum = 0;                 /* 0..1 */
      var struck = false, t = 0;
      var rings = [];                 /* {d: 已传播距离 m} */
      var ringAcc = 0;
      var shake = 0;

      function M() { return MEDIA[medium] || MEDIA.air; }
      function speed() { return M().v; }
      /* 能不能把声音传到对面：既要有介质，罩内也不能接近真空 */
      function canTransmit() { return M().ok && vacuum < 0.95; }
      function wavelengthCM() { return speed() ? speed() / freq * 100 : 0; }
      /* 接收端听到的响度：振幅 × 真空衰减 × 距离衰减（固定 3 m） */
      function loudness() {
        if (!canTransmit()) return 0;
        return amp * (1 - vacuum) / (1 + 3 / 8);
      }
      function loudLabel() {
        var L = loudness();
        if (!canTransmit()) return '听不到';
        if (L < 0.04) return '几乎听不到';
        if (L < 0.12) return '很弱';
        if (L < 0.3) return '较弱';
        if (L < 0.55) return '较响';
        return '很响';
      }
      function pitchLabel() {
        if (freq < 200) return '低音（低沉）';
        if (freq < 400) return '中低音';
        if (freq < 700) return '中音';
        if (freq < 900) return '中高音';
        return '高音（尖锐）';
      }
      function geom() {
        var sx = env.W * 0.18, sy = env.H * 0.46;
        var rx = env.W * 0.56;
        return { sx: sx, sy: sy, rx: rx };
      }
      /* 波前半径的像素比例要跟着画布走：接收端在 3 m 外，
         按固定 46 px/m 画的话声波还没到"耳朵"就淡没了。 */
      function ppm() { return Math.max(22, (geom().rx - geom().sx) / 3.25); }

      function strike() {
        struck = true; t = 0; ringAcc = 0; shake = 0;
        rings = [{ d: 0 }];
        PHY.log('敲击音叉：f = ' + freq + ' Hz（' + pitchLabel() + '），振幅 ' + PHY.fmt(amp, 2) +
          '（' + loudLabel() + '）。' +
          (canTransmit() ? '介质：' + M().name + '，声速 ' + speed() + ' m/s。' : '罩内已接近真空，声音传不出来！'), '', canTransmit() ? 'reaction' : 'warn');
        env.invalidateInfo();
      }
      function set(id, v) {
        if (id === 'freq') freq = v;
        else if (id === 'amp') amp = v;
        else if (id === 'timbre') timbre = v;
        else if (id === 'medium') {
          medium = v;
          rings = [];
          PHY.log('把传播介质换成「' + M().name + '」' + (M().ok ? '，声速 ' + speed() + ' m/s。' : '：真空不能传声。'), '', M().ok ? 'info' : 'warn');
        } else if (id === 'vacuum') {
          vacuum = PHY.clamp(v / 100, 0, 1);
          if (vacuum >= 0.95) PHY.log('罩内空气几乎被抽空：振动仍在，但听不到声音了——声音的传播需要介质。', '', 'warn');
        }
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'strike') strike();
        else if (id === 'stop') {
          struck = false; rings = [];
          PHY.log('用手按住音叉，振动停止，发声也停止。', '', 'info');
        }
      }

      function update(dt) {
        if (!struck) return;
        t += dt;
        shake += dt * (10 + freq / 60);
        if (!canTransmit()) return;      /* 真空里没有波前 */
        ringAcc += dt;
        if (ringAcc > 0.42) { ringAcc = 0; if (rings.length < 7) rings.push({ d: 0 }); }
        var vx = BASE_VX * PHY.clamp(speed() / 340, 1, 2.4);
        for (var i = rings.length - 1; i >= 0; i--) {
          rings[i].d += vx * dt / ppm();   /* 换算回米 */
          if (rings[i].d > 3.4) rings.splice(i, 1);
        }
      }

      /* ---------------- 绘制 ---------------- */
      function drawFork(gg, x, y) {
        var vib = struck && canTransmit() ? Math.sin(shake) * Math.min(3.5, 0.8 + amp * 4) : 0;
        gg.save();
        gg.strokeStyle = '#8a99a8'; gg.lineWidth = 7; gg.lineCap = 'round';
        gg.beginPath();
        gg.moveTo(x - 8 + vib, y - 42); gg.lineTo(x - 8 + vib, y + 6);
        gg.moveTo(x + 8 - vib, y - 42); gg.lineTo(x + 8 - vib, y + 6);
        gg.stroke();
        gg.beginPath();
        gg.moveTo(x - 8, y + 6); gg.quadraticCurveTo(x, y + 22, x + 8, y + 6);
        gg.stroke();
        gg.strokeStyle = '#5d6f7e'; gg.lineWidth = 6;
        gg.beginPath(); gg.moveTo(x, y + 16); gg.lineTo(x, y + 46); gg.stroke();
        /* 底座 */
        gg.fillStyle = '#6d7780';
        PHY.rr(gg, x - 30, y + 46, 60, 9, 4); gg.fill();
        gg.restore();
      }

      function drawScope(gg, x, y, w, h) {
        PHY.panel(gg, x, y, w, h, '示波器（把声音的振动显示出来）');
        var ox = x + 14, oy = y + 26, gw = w - 28, gh = h - 40;
        gg.save();
        /* 网格 */
        gg.strokeStyle = 'rgba(30,159,216,0.16)'; gg.lineWidth = 1;
        for (var gx = ox; gx <= ox + gw; gx += gw / 8) {
          gg.beginPath(); gg.moveTo(gx, oy); gg.lineTo(gx, oy + gh); gg.stroke();
        }
        for (var gy = oy; gy <= oy + gh; gy += gh / 6) {
          gg.beginPath(); gg.moveTo(ox, gy); gg.lineTo(ox + gw, gy); gg.stroke();
        }
        gg.strokeStyle = 'rgba(30,159,216,0.42)'; gg.lineWidth = 1.4;
        gg.beginPath(); gg.moveTo(ox, oy + gh / 2); gg.lineTo(ox + gw, oy + gh / 2); gg.stroke();
        /* 波形 */
        var cy = oy + gh / 2;
        var cycles = PHY.clamp(freq / 180, 1.2, 7);
        var vis = canTransmit() ? amp * (1 - vacuum) * (struck ? 1 : 0.16) : 0;
        var A = vis * (gh / 2 - 5);
        gg.strokeStyle = '#1e9fd8'; gg.lineWidth = 2;
        gg.beginPath();
        for (var i = 0; i <= gw; i++) {
          var p = (i / gw) * cycles * Math.PI * 2;
          var v = TIMBRE[timbre].f(p) * A;
          if (i === 0) gg.moveTo(ox + i, cy - v); else gg.lineTo(ox + i, cy - v);
        }
        gg.stroke();
        gg.fillStyle = '#6b7f92'; gg.font = '10.5px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'bottom';
        gg.fillText('波形越密 → 音调越高；波形越高 → 响度越大；波形形状 → 音色', ox, oy + gh + 14);
        gg.restore();
      }

      function drawReadout(gg, x, y, w, h) {
        PHY.panel(gg, x, y, w, h, '数据');
        var rows = [
          ['频率 f', freq + ' Hz（' + pitchLabel() + '）'],
          ['波长 λ', speed() ? PHY.fmt(wavelengthCM(), 1) + ' cm' : '—（无介质）'],
          ['声速 v', speed() ? speed() + ' m/s' : '0（真空）'],
          ['介质', M().name],
          ['接收端响度', loudLabel()]
        ];
        gg.save();
        gg.font = '11.5px ' + FONT;
        gg.textBaseline = 'middle';
        rows.forEach(function (r, i) {
          var yy = y + 30 + i * 20;
          gg.fillStyle = '#6b7f92'; gg.textAlign = 'left';
          gg.fillText(r[0], x + 12, yy);
          gg.fillStyle = '#1a2c3c'; gg.textAlign = 'right';
          gg.fillText(String(r[1]), x + w - 12, yy);
        });
        gg.restore();
      }

      function drawVacuumBar(gg, x, y, w) {
        var h = 14;
        gg.save();
        gg.fillStyle = '#6b7f92'; gg.font = '11px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'middle';
        gg.fillText('罩内真空度', x, y + h / 2);
        var bx = x + 74, bw = w - 74;
        gg.fillStyle = '#e6eef5';
        PHY.rr(gg, bx, y, bw, h, 7); gg.fill();
        var frac = PHY.clamp(vacuum, 0, 1);
        if (frac > 0) {
          gg.fillStyle = frac > 0.9 ? '#e2603c' : '#e0a13c';
          PHY.rr(gg, bx, y, Math.max(4, bw * frac), h, 7); gg.fill();
        }
        gg.fillStyle = '#3d5a72'; gg.textAlign = 'center';
        gg.fillText(Math.round(frac * 100) + '%', bx + bw / 2, y + h / 2);
        gg.restore();
      }

      return {
        set: set, action: action,

        update: update,

        hint: function () {
          if (!struck) return '点「敲击音叉」让它振动发声；再改频率、振幅、介质看看有什么不同。';
          if (!canTransmit()) return '音叉在振动，但罩内接近真空，声音传不出来——声音的传播需要介质。';
          return '正在发声：' + pitchLabel() + '，接收端听感' + loudLabel() + '。改变频率体会音调，改变振幅体会响度。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>发声状态</dt><dd>' + (struck ? '正在振动发声' : '未敲击（静止）') + '</dd></div>');
          out.push('<div><dt>频率</dt><dd>' + freq + ' Hz（' + pitchLabel() + '）</dd></div>');
          out.push('<div><dt>振幅</dt><dd>' + PHY.fmt(amp, 2) + '</dd></div>');
          out.push('<div><dt>波形（音色）</dt><dd>' + TIMBRE[timbre].name + '</dd></div>');
          out.push('<div><dt>传播介质</dt><dd>' + M().name + (speed() ? '，v = ' + speed() + ' m/s' : '') + '</dd></div>');
          out.push('<div><dt>波长</dt><dd>' + (speed() ? 'λ = v / f = ' + PHY.fmt(wavelengthCM(), 1) + ' cm' : '—') + '</dd></div>');
          out.push('<div><dt>罩内真空度</dt><dd>' + Math.round(vacuum * 100) + ' %</dd></div>');
          out.push('<div><dt>接收端响度</dt><dd>' + loudLabel() + '</dd></div>');
          out.push('</dl>');
          out.push('<div class="hint-box">结论：<b>音调</b>由频率决定，<b>响度</b>由振幅（和距离）决定，<b>音色</b>由发声体的材料和结构（波形）决定；' +
            '声速由<b>介质</b>决定（固体 &gt; 液体 &gt; 气体），真空不能传声。</div>');
          out.push('<div class="hint-box">动画里把声波的传播做了慢放与压缩处理，否则 340 m/s 根本看不清；表中的数值都是真实值。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f2f8fc';
          gg.fillRect(0, 0, W, H);
          var gm = geom();

          /* 波前：从音叉向外扩散的弧 */
          if (canTransmit()) {
            rings.forEach(function (r) {
              var rad = r.d * ppm();
              if (rad < 3) return;
              var a = PHY.clamp(1 - r.d / 3.4, 0, 1) * 0.5 * (0.35 + amp);
              gg.save();
              gg.strokeStyle = 'rgba(30,159,216,' + a.toFixed(3) + ')';
              gg.lineWidth = 2.2;
              gg.beginPath();
              gg.arc(gm.sx, gm.sy, rad, -0.95, 0.95);
              gg.stroke();
              gg.beginPath();
              gg.arc(gm.sx, gm.sy, rad - 6, -0.8, 0.8);
              gg.stroke();
              gg.restore();
            });
          }

          /* 音叉 */
          drawFork(gg, gm.sx, gm.sy);
          gg.save();
          gg.fillStyle = '#3d5a72'; gg.font = '600 12px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText('音叉（发声体）', gm.sx, gm.sy + 62);
          gg.restore();

          /* 接收端：人耳示意 */
          gg.save();
          var rx = gm.rx, ry = gm.sy;
          var L = loudness();
          gg.strokeStyle = L > 0.02 ? '#2fa96b' : '#c3d5e4';
          gg.fillStyle = L > 0.02 ? '#e9f7ef' : '#f2f6fa';
          gg.lineWidth = 2;
          gg.beginPath();
          gg.moveTo(rx - 26, ry); gg.quadraticCurveTo(rx - 12, ry - 26, rx + 6, ry - 22);
          gg.quadraticCurveTo(rx + 20, ry - 20, rx + 20, ry);
          gg.quadraticCurveTo(rx + 20, ry + 20, rx + 6, ry + 22);
          gg.quadraticCurveTo(rx - 12, ry + 26, rx - 26, ry);
          gg.closePath(); gg.fill(); gg.stroke();
          gg.fillStyle = '#3d5a72'; gg.font = '600 12px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText('接收端（3 m 外）', rx, ry + 34);
          gg.fillStyle = L > 0.02 ? '#2fa96b' : '#a3b3c2';
          gg.font = '700 12px ' + FONT;
          gg.fillText(L > 0.02 ? loudLabel() : '听不到', rx, ry + 52);
          /* 响度条 */
          gg.fillStyle = '#e6eef5';
          PHY.rr(gg, rx - 34, ry + 74, 68, 8, 4); gg.fill();
          if (L > 0.01) {
            gg.fillStyle = '#2fa96b';
            PHY.rr(gg, rx - 34, ry + 74, Math.max(4, 68 * PHY.clamp(L, 0, 1)), 8, 4); gg.fill();
          }
          gg.restore();

          /* 真空罩提示 */
          if (vacuum > 0.02) {
            gg.save();
            gg.font = '600 12px ' + FONT;
            gg.textAlign = 'left'; gg.textBaseline = 'middle';
            gg.fillStyle = vacuum >= 0.95 ? '#e2603c' : '#e0a13c';
            gg.fillText(vacuum >= 0.95 ? '⚠ 真空罩内已无空气：声音无法传播' :
              '真空罩正在抽气：声音逐渐变弱', 24, H - 26);
            gg.restore();
          }

          /* 面板 */
          var pw = Math.min(300, W * 0.32);
          drawScope(gg, W - pw - 16, 14, pw, 168);
          drawReadout(gg, W - pw - 16, 194, pw, 146);
          drawVacuumBar(gg, W - pw - 16, 352, pw);

          gg.restore();
        },

        /* 判定 / 测试接口 */
        isStruck: function () { return struck; },
        getFreq: function () { return freq; },
        getAmp: function () { return amp; },
        getTimbre: function () { return timbre; },
        getMedium: function () { return medium; },
        getVacuum: function () { return vacuum; },
        speed: speed,
        canTransmit: canTransmit,
        wavelengthCM: wavelengthCM,
        loudness: loudness,
        rings: function () { return rings; },
        __test: {
          strike: function () { strike(); },
          stop: function () { action('stop'); },
          setFreq: function (v) { freq = v; },
          setAmp: function (v) { amp = v; },
          setMedium: function (v) { set('medium', v); },
          setTimbre: function (v) { timbre = v; },
          setVacuum: function (v) { vacuum = PHY.clamp(v, 0, 1); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
