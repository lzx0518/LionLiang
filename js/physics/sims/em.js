/* =============================================================================
 * 虚拟实验室 —— 电磁学仿真 (js/physics/sims/em.js)
 * -----------------------------------------------------------------------------
 * 1) solenoid   通电螺线管与电磁铁（初中）
 *    · 螺线管通电后周围产生磁场，小磁针会按磁感线方向偏转
 *    · 改变电流方向 → 磁极对调（安培定则 / 右手螺旋定则）
 *    · 改变电流大小、匝数，插入铁芯 → 磁性增强（吸引更多大头针）
 * 2) induction  电磁感应现象（高中）
 *    · 磁铁插入 / 拔出线圈时，电流计指针偏转 → 产生感应电流
 *    · 运动越快偏转越大；静止不动时不偏转；穿过线圈中心时方向反转
 *    · 改变磁铁极性或运动方向，感应电流方向相反（楞次定律）
 *
 * 感应电动势按 E ∝ −dΦ/dt 数值计算，Φ(x) 取中心在螺线管处的钟形曲线，
 * 因此「磁铁经过线圈中心时电流反向」这一现象能自然复现。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

  /* ============================================================
   * 1. 通电螺线管与电磁铁
   * ========================================================== */
  PHY.registerSim({
    id: 'solenoid',
    name: '通电螺线管与电磁铁',
    field: 'em',
    icon: '🧲',
    level: 'junior',
    tag: '电与磁',
    desc: '螺线管通电后产生磁场，周围的小磁针按磁感线方向偏转；改变电流方向磁极对调，插入铁芯磁性大增。',
    tip: '闭合开关，看小磁针怎么转；切换电流方向看磁极对调；插入铁芯看吸起的大头针变多。',

    controls: function (inst) {
      return [
        { type: 'button', id: 'toggle', label: inst.isOn() ? '断开开关' : '闭合开关', primary: true },
        { type: 'slider', id: 'I', label: '电流 I', min: 0.1, max: 2, step: 0.1, value: inst.current(), unit: 'A' },
        { type: 'slider', id: 'N', label: '匝数 N', min: 10, max: 100, step: 10, value: inst.turns(), unit: '匝' },
        { type: 'select', id: 'dir', label: '电流方向', value: inst.dir(), options: [{ v: 'cw', t: '正向（从左侧流入）' }, { v: 'ccw', t: '反向（从右侧流入）' }] },
        { type: 'button', id: 'core', label: inst.hasCore() ? '拔出铁芯' : '插入铁芯' },
        { type: 'sep' },
        { type: 'button', id: 'record', label: '记录观察' },
        { type: 'button', id: 'clearRec', label: '清除记录' },
        { type: 'note', text: inst.isOn() ? '左端 ' + inst.poles().left + ' 极，右端 ' + inst.poles().right + ' 极' : '开关断开，无磁性' }
      ];
    },

    create: function (env) {
      var on = false, I = 0.6, N = 40, dir = 'cw', core = false;
      var records = [];
      var t = 0;
      var needle = 0;         /* 小磁针的平滑转角 */

      function strength() {
        if (!on) return 0;
        return (I * N / 40) * (core ? 5 : 1);      /* 相对磁性强度 */
      }
      /* 安培定则：电流方向决定哪端是 N 极 */
      function poles() {
        if (!on) return { left: '—', right: '—' };
        return dir === 'cw' ? { left: 'N', right: 'S' } : { left: 'S', right: 'N' };
      }
      function clips() {
        var s = strength();
        return Math.min(24, Math.round(s * 4.2));
      }
      function magneticLabel() {
        var s = strength();
        if (!on) return '无磁性';
        if (s < 0.6) return '磁性很弱';
        if (s < 1.6) return '磁性较弱';
        if (s < 3.5) return '磁性较强';
        if (s < 7) return '磁性很强';
        return '磁性极强';
      }

      function set(id, v) {
        if (id === 'I') I = v;
        else if (id === 'N') N = v;
        else if (id === 'dir') {
          dir = v;
          if (on) PHY.log('改变电流方向：磁极对调，现在左端为 ' + poles().left + ' 极。', '', 'info');
        }
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'toggle') {
          on = !on;
          PHY.log(on ? '闭合开关，螺线管中有电流通过，周围出现了磁场' + (core ? '（铁芯被磁化，磁性大大增强）' : '') + '。'
            : '断开开关，电流消失，磁性随之消失。', '', on ? 'reaction' : 'info');
          if (on) {
            PHY.log('据安培定则（右手螺旋定则）：左端为 ' + poles().left + ' 极，右端为 ' + poles().right + ' 极。', '', 'success');
          }
          env.invalidateInfo();
        } else if (id === 'core') {
          core = !core;
          PHY.log(core ? '插入铁芯：铁芯被磁化，磁性显著增强，能吸起的大头针更多了。' : '拔出铁芯：磁性减弱。', '', 'info');
          env.invalidateInfo();
        } else if (id === 'record') {
          records.push({ on: on, I: I, N: N, dir: dir, core: core, s: strength(), clips: clips() });
          PHY.log('记录第 ' + records.length + ' 组：' + (on ? '闭合' : '断开') + '，I = ' + PHY.fmt(I, 1) + ' A，N = ' + N +
            '，' + (core ? '有铁芯' : '无铁芯') + ' → ' + magneticLabel() + '，吸起大头针 ' + clips() + ' 个。', '', 'reaction');
          env.invalidateInfo();
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除记录。', '', 'info');
        }
      }
      function update(dt) {
        t += dt;
        var target = on ? (dir === 'cw' ? 1 : -1) * PHY.clamp(strength() / 3, 0, 1) : 0;
        needle += (target - needle) * Math.min(1, dt * 4);
      }

      function drawCompass(gg, x, y, ang, s) {
        gg.save();
        gg.beginPath(); gg.arc(x, y, 13, 0, 7);
        gg.fillStyle = 'rgba(255,255,255,0.9)'; gg.fill();
        gg.strokeStyle = '#8a99a8'; gg.lineWidth = 1.6; gg.stroke();
        gg.save();
        gg.translate(x, y); gg.rotate(ang);
        gg.beginPath();
        gg.moveTo(0, -11); gg.lineTo(3.4, 0); gg.lineTo(0, 11); gg.lineTo(-3.4, 0);
        gg.closePath();
        gg.fillStyle = '#e2603c'; gg.fill();       /* 红端 = N */
        gg.beginPath();
        gg.moveTo(0, 11); gg.lineTo(3.4, 0); gg.lineTo(-3.4, 0);
        gg.closePath();
        gg.fillStyle = '#5d6f7e'; gg.fill();
        gg.restore();
        gg.restore();
      }

      return {
        set: set, action: action, update: update,

        hint: function () {
          if (!on) return '点「闭合开关」给螺线管通电，观察周围的小磁针怎样偏转。';
          return '已通电：' + magneticLabel() + '，左端 ' + poles().left + ' 极，可吸起约 ' + clips() +
            ' 个大头针。试试改变电流方向、增大电流或匝数、插入铁芯。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>开关</dt><dd>' + (on ? '<span style="color:#2fa96b">闭合</span>' : '断开') + '</dd></div>');
          out.push('<div><dt>电流 I</dt><dd>' + PHY.fmt(I, 1) + ' A（' + (dir === 'cw' ? '正向' : '反向') + '）</dd></div>');
          out.push('<div><dt>匝数 N</dt><dd>' + N + ' 匝</dd></div>');
          out.push('<div><dt>铁芯</dt><dd>' + (core ? '已插入（被磁化）' : '未插入') + '</dd></div>');
          out.push('<div><dt>磁极</dt><dd>' + (on ? '左端 ' + poles().left + ' 极，右端 ' + poles().right + ' 极' : '无磁性') + '</dd></div>');
          out.push('<div><dt>磁性强弱</dt><dd>' + magneticLabel() + '（相对强度 ' + PHY.fmt(strength(), 2) + '）</dd></div>');
          out.push('<div><dt>吸起大头针</dt><dd>' + clips() + ' 个</dd></div>');
          out.push('</dl>');
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>观察记录</b></p><div class="chips">');
            records.forEach(function (r, i) {
              out.push('<span class="chip">' + (i + 1) + '：' + (r.on ? '通电' : '断电') + ' I=' + PHY.fmt(r.I, 1) + 'A N=' + r.N +
                (r.core ? ' 有铁芯' : '') + ' → ' + r.clips + ' 个</span>');
            });
            out.push('</div>');
          }
          out.push('<div class="hint-box">结论：通电螺线管外部的磁场与<b>条形磁体</b>相似；<b>电流方向</b>决定磁极（安培定则）；' +
            '<b>电流越大、匝数越多、插入铁芯</b>，磁性越强。电磁铁就是加了铁芯的螺线管。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);
          /* 右侧放一块读数面板（把原本空着的右半张画布用起来），左边留给螺线管与磁感线。
             螺线管尺寸也改成跟着画布走：以前写死 coilW=190、coilH=88，
             在 1000×660 上只占 36% 宽、49% 高，四周全是空白。 */
          var pw = PHY.clamp(W * 0.24, 176, 250);
          var stageW = W - pw - 40;
          var cx = 16 + stageW / 2, cy = H * 0.36;
          var coilW = PHY.clamp(stageW * 0.42, 140, 320);
          var coilH = PHY.clamp(H * 0.20, 70, 150);
          var s = strength();

          /* 磁感线（通电时画）。半径要收在画布内：螺线管窄画布上离两边很近，
             按固定倍数放大时最外面那圈会被裁掉。 */
          if (s > 0.01) {
            gg.save();
            gg.strokeStyle = 'rgba(108,127,217,' + (0.18 + Math.min(0.5, s / 8)) + ')';
            gg.lineWidth = 1.6;
            var inner = coilW * 0.55;
            var outer = PHY.clamp(Math.min(cx - 26, W - pw - 24 - cx, H * 0.36), inner, coilW * 1.8);
            for (var k = 1; k <= 4; k++) {
              var rr2 = inner + (outer - inner) * (k / 4);
              gg.beginPath();
              gg.ellipse(cx, cy, rr2, rr2 * 0.52, 0, 0, Math.PI * 2);
              gg.stroke();
            }
            /* 方向箭头 */
            var ax = cx + inner;
            PHY.arrow(gg, ax, cy - 8, ax + 42, cy - 8, 'rgba(108,127,217,0.75)', 1.8, 8);
            gg.restore();
          }

          /* 铁芯 */
          if (core) {
            gg.fillStyle = '#9aa7b2'; gg.strokeStyle = '#6d7780'; gg.lineWidth = 1.5;
            PHY.rr(gg, cx - coilW / 2 - 16, cy - 11, coilW + 32, 22, 3); gg.fill(); gg.stroke();
          }
          /* 线圈 */
          var turns = Math.max(6, Math.round(N / 8));
          gg.strokeStyle = '#c08b3e'; gg.lineWidth = 3.2; gg.lineCap = 'round';
          for (var i = 0; i < turns; i++) {
            var x = cx - coilW / 2 + i * (coilW / (turns - 1));
            gg.beginPath();
            gg.ellipse(x, cy, 9, coilH / 2, 0, 0, Math.PI * 2);
            gg.stroke();
          }
          /* 引线与电池、开关 */
          var by = H * 0.86;
          gg.strokeStyle = '#5d6f7e'; gg.lineWidth = 2;
          gg.beginPath();
          gg.moveTo(cx - coilW / 2, cy + coilH / 2);
          gg.lineTo(cx - coilW / 2 - 60, cy + coilH / 2);
          gg.lineTo(cx - coilW / 2 - 60, by);
          gg.lineTo(cx - 60, by);
          gg.stroke();
          gg.beginPath();
          gg.moveTo(cx + coilW / 2, cy + coilH / 2);
          gg.lineTo(cx + coilW / 2 + 60, cy + coilH / 2);
          gg.lineTo(cx + coilW / 2 + 60, by);
          gg.lineTo(cx + 60, by);
          gg.stroke();
          /* 电池 */
          gg.fillStyle = '#dfe7ee'; gg.strokeStyle = '#8a99a8'; gg.lineWidth = 1.6;
          PHY.rr(gg, cx - 60, by - 15, 60, 30, 4); gg.fill(); gg.stroke();
          gg.strokeStyle = '#22384a'; gg.lineWidth = 2;
          gg.beginPath();
          gg.moveTo(cx - 32, by - 9); gg.lineTo(cx - 32, by + 9);
          gg.moveTo(cx - 24, by - 5); gg.lineTo(cx - 24, by + 5);
          gg.moveTo(cx - 16, by - 9); gg.lineTo(cx - 16, by + 9);
          gg.stroke();
          gg.fillStyle = '#3d5a72'; gg.font = '600 10.5px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'bottom';
          gg.fillText('电源', cx - 30, by - 18);
          /* 开关 */
          gg.fillStyle = on ? '#e9f7ef' : '#f2f6fa';
          gg.strokeStyle = on ? '#2fa96b' : '#8a99a8'; gg.lineWidth = 1.6;
          PHY.rr(gg, cx + 20, by - 15, 54, 30, 4); gg.fill(); gg.stroke();
          gg.strokeStyle = on ? '#2fa96b' : '#e2603c'; gg.lineWidth = 2.4;
          gg.beginPath();
          gg.moveTo(cx + 28, by + 8);
          if (on) gg.lineTo(cx + 66, by + 8); else gg.lineTo(cx + 58, by - 8);
          gg.stroke();
          gg.fillStyle = on ? '#2fa96b' : '#e2603c'; gg.font = '600 10.5px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'bottom';
          gg.fillText(on ? '闭合' : '断开', cx + 47, by - 18);

          /* 小磁针 */
          var md = dir === 'cw' ? 1 : -1;
          var dirAng = md > 0 ? 0 : Math.PI;
          drawCompass(gg, cx, cy - coilH / 2 - 40, dirAng, s);
          drawCompass(gg, cx, cy + coilH / 2 + 46, dirAng + Math.PI, s);
          drawCompass(gg, cx - coilW / 2 - 70, cy, dirAng, s);
          drawCompass(gg, cx + coilW / 2 + 70, cy, dirAng, s);
          /* 磁极标注 */
          gg.fillStyle = '#e2603c'; gg.font = '700 14px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText(poles().left, cx - coilW / 2 - 34, cy);
          gg.fillText(poles().right, cx + coilW / 2 + 34, cy);

          /* 大头针 */
          var n = clips();
          for (var c2 = 0; c2 < n; c2++) {
            var px2 = cx + coilW / 2 + 96 + (c2 % 6) * 9;
            var py2 = cy - 60 + Math.floor(c2 / 6) * 12;
            gg.strokeStyle = '#7f8d9b'; gg.lineWidth = 1.6;
            gg.beginPath(); gg.moveTo(px2, py2); gg.lineTo(px2, py2 + 9); gg.stroke();
            gg.beginPath(); gg.arc(px2, py2, 3, 0, 7);
            gg.strokeStyle = '#7f8d9b'; gg.stroke();
          }
          if (n) {
            gg.fillStyle = '#6b7f92'; gg.font = '600 11px ' + FONT;
            gg.textAlign = 'left'; gg.textBaseline = 'top';
            gg.fillText('吸起大头针 ' + n + ' 个', cx + coilW / 2 + 92, cy + 40);
          }

          /* 右侧读数面板：即使开关断开（没有磁感线）也不会让右半张画布空着 */
          var ph = Math.min(H - 28, 300);
          PHY.panel(gg, W - pw - 8, 14, pw - 8, ph, '通电螺线管读数');
          gg.save();
          gg.textBaseline = 'middle';
          var rows = [
            ['开关', on ? '闭合' : '断开'],
            ['电流 I', PHY.fmt(I, 1) + ' A（' + (dir === 'cw' ? '正向' : '反向') + '）'],
            ['匝数 N', N + ' 匝'],
            ['铁芯', core ? '已插入（被磁化）' : '未插入'],
            ['左端磁极', on ? poles().left + ' 极' : '—'],
            ['右端磁极', on ? poles().right + ' 极' : '—'],
            ['磁性强弱', on ? magneticLabel() : '无磁性'],
            ['吸起大头针', n + ' 个']
          ];
          gg.font = '11.5px ' + FONT;
          rows.forEach(function (r, i) {
            var yy = 44 + i * 24;
            if (yy > 14 + ph - 10) return;
            gg.fillStyle = '#6b7f92'; gg.textAlign = 'left';
            gg.fillText(r[0], W - pw + 6, yy);
            gg.fillStyle = '#1a2c3c'; gg.textAlign = 'right';
            gg.fillText(String(r[1]), W - 20, yy);
          });
          gg.restore();
          gg.restore();
        },

        /* 判定 / 测试接口 */
        isOn: function () { return on; },
        current: function () { return I; },
        turns: function () { return N; },
        dir: function () { return dir; },
        hasCore: function () { return core; },
        strength: strength,
        poles: poles,
        clips: clips,
        records: function () { return records; },
        __test: {
          toggle: function () { action('toggle'); },
          turnOn: function () { if (!on) action('toggle'); },
          turnOff: function () { if (on) action('toggle'); },
          setI: function (v) { I = v; },
          setN: function (v) { N = v; },
          setDir: function (v) { dir = v; },
          setCore: function (v) { core = !!v; },
          record: function () { action('record'); },
          clearRec: function () { action('clearRec'); }
        }
      };
    }
  });

  /* ============================================================
   * 2. 电磁感应现象
   * ========================================================== */
  PHY.registerSim({
    id: 'induction',
    name: '电磁感应（磁铁与线圈）',
    field: 'em',
    icon: '⚡',
    level: 'senior',
    tag: '电磁感应',
    desc: '把条形磁铁插入或拔出线圈，看电流计指针怎样偏转；运动越快偏转越大，静止时指针不偏转。',
    tip: '点「插入磁铁」「拔出磁铁」；换磁极、换速度再试，比较指针偏转方向与大小。',

    controls: function (inst) {
      return [
        { type: 'select', id: 'pole', label: '磁铁极性（朝线圈一端）', value: inst.pole(), options: [{ v: 'N', t: 'N 极朝向线圈' }, { v: 'S', t: 'S 极朝向线圈' }] },
        { type: 'slider', id: 'speed', label: '运动快慢', min: 1, max: 10, step: 1, value: inst.speed(), unit: '档' },
        { type: 'sep' },
        { type: 'button', id: 'insert', label: '插入磁铁', primary: true },
        { type: 'button', id: 'pull', label: '拔出磁铁' },
        { type: 'button', id: 'stop', label: '停住不动' },
        { type: 'button', id: 'reset', label: '复位' },
        { type: 'button', id: 'record', label: '记录数据' },
        { type: 'button', id: 'clearRec', label: '清除记录' },
        { type: 'note', text: '当前感应电动势 ' + PHY.fmt(inst.emf(), 2) + ' mV（' + inst.dirLabel() + '）' }
      ];
    },

    create: function (env) {
      var pole = 'N', speed = 4;
      var x = -14;                 /* 磁铁中心相对线圈的位置 cm */
      var target = -14;
      var flux = 0, fluxPrev = 0, emf = 0;
      var records = [], peak = 0, peakSign = 0, lastDir = null;
      var t = 0;
      var X0 = 3.2;                /* 磁通量钟形曲线的宽度 cm */

      function fluxAt(xx) { return 1 / (1 + Math.pow(xx / X0, 2)); }
      function moving() { return Math.abs(target - x) > 0.05; }
      /* 由「磁铁极性 + 运动方向」预言感应电流的方向（楞次定律）：返回 ±1 */
      function expectedSign() {
        if (!lastDir) return 0;
        var sgn = pole === 'N' ? 1 : -1;
        return -sgn * (lastDir === 'insert' ? 1 : -1);
      }
      function dirLabel() {
        if (Math.abs(emf) < 0.05) return '指针不偏转';
        return emf > 0 ? '指针向右偏转' : '指针向左偏转';
      }
      function atCoil() { return Math.abs(x) <= 2.5; }
      function outOfCoil() { return x < -10; }

      function set(id, v) {
        if (id === 'pole') {
          pole = v;
          PHY.log('把磁铁的 ' + pole + ' 极朝向线圈。', '', 'info');
        } else if (id === 'speed') speed = v;
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'insert') {
          target = 1.6; peak = 0; peakSign = 0; lastDir = 'insert';
          PHY.log('把磁铁向线圈里插入……', '', 'info');
        } else if (id === 'pull') {
          target = -15; peak = 0; peakSign = 0; lastDir = 'pull';
          PHY.log('把磁铁从线圈里拔出来……', '', 'info');
        } else if (id === 'stop') { target = x; PHY.log('让磁铁停住不动。', '', 'info'); }
        else if (id === 'reset') {
          x = -14; target = -14; emf = 0; flux = fluxAt(x); records = []; peak = 0; peakSign = 0; lastDir = null;
          PHY.log('已复位。', '', 'info');
        } else if (id === 'record') {
          if (Math.abs(peak) < 0.05) {
            PHY.toast('先让磁铁运动起来，观察到指针偏转再记录。');
            return;
          }
          records.push({ pole: pole, speed: speed, peak: peak, sign: peakSign, dir: lastDir, exp: expectedSign() });
          PHY.log('记录第 ' + records.length + ' 组：' + pole + ' 极朝向线圈、速度第 ' + speed + ' 档 → 最大感应电动势 ' +
            PHY.fmt(Math.abs(peak), 2) + ' mV（' + (peakSign > 0 ? '指针向右' : '指针向左') + '）。', '', 'reaction');
          /* 记完之后把峰值清零，下一组数据才是独立的 */
          peak = 0; peakSign = 0;
          if (records.length >= 2) {
            var a = records[records.length - 2], b = records[records.length - 1];
            if (a.pole !== b.pole && a.dir === b.dir && a.sign !== b.sign) {
              PHY.log('磁极不同、运动情况相同，指针偏转方向相反 → 感应电流的方向与磁场方向有关。', '', 'success');
            } else if (a.pole === b.pole && a.dir === b.dir && a.speed !== b.speed && Math.abs(a.peak) !== Math.abs(b.peak)) {
              PHY.log('磁极与运动方向相同、速度不同：运动越快，指针偏转越大 → 感应电动势的大小与磁通量变化的快慢有关。', '', 'success');
            }
          }
          env.invalidateInfo();
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除记录。', '', 'info');
          env.invalidateInfo();
        }
      }

      function update(dt) {
        t += dt;
        fluxPrev = flux;
        if (moving()) {
          var v = speed * 4.2 * dt;                  /* cm/s（动画速度） */
          var dx = target - x;
          x += Math.abs(dx) < v ? dx : Math.sign(dx) * v;
        }
        flux = fluxAt(x);
        var sgn = pole === 'N' ? 1 : -1;
        /* E ∝ −dΦ/dt；系数取 4.5，使典型速度下读数落在电流计量程（±14 mV）内 */
        emf = -4.5 * sgn * (flux - fluxPrev) / Math.max(dt, 1e-4);
        if (!moving()) emf *= 0.2;
        if (Math.abs(emf) > Math.abs(peak)) { peak = emf; peakSign = Math.sign(emf); }
      }

      function drawGalvo(gg, x0, y0) {
        var R = 58;
        gg.save();
        gg.beginPath(); gg.arc(x0, y0, R, Math.PI * 1.15, Math.PI * 1.85);
        gg.fillStyle = '#ffffff'; gg.fill();
        gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
        gg.beginPath(); gg.arc(x0, y0, R, Math.PI * 1.15, Math.PI * 1.85); gg.stroke();
        /* 刻度 */
        gg.strokeStyle = '#b9c6d2'; gg.lineWidth = 1;
        for (var i = 0; i <= 8; i++) {
          var a = Math.PI * 1.15 + (Math.PI * 0.7) * i / 8;
          gg.beginPath();
          gg.moveTo(x0 + Math.cos(a) * (R - 8), y0 + Math.sin(a) * (R - 8));
          gg.lineTo(x0 + Math.cos(a) * R, y0 + Math.sin(a) * R);
          gg.stroke();
        }
        gg.fillStyle = '#6b7f92'; gg.font = '10.5px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'middle';
        gg.fillText('—', x0 - R + 8, y0 - 26);
        gg.fillText('0', x0, y0 - R + 12);
        gg.fillText('+', x0 + R - 8, y0 - 26);
        gg.fillStyle = '#3d5a72'; gg.font = '700 11px ' + FONT;
        gg.fillText('电流计', x0, y0 + 12);
        /* 指针 */
        var a0 = -Math.PI / 2 + PHY.clamp(emf / 14, -1, 1) * (Math.PI * 0.32);
        gg.strokeStyle = '#e2603c'; gg.lineWidth = 2.4;
        gg.beginPath();
        gg.moveTo(x0, y0);
        gg.lineTo(x0 + Math.cos(a0) * (R - 12), y0 + Math.sin(a0) * (R - 12));
        gg.stroke();
        gg.beginPath(); gg.arc(x0, y0, 3.4, 0, 7);
        gg.fillStyle = '#22384a'; gg.fill();
        /* 数字读数 */
        gg.fillStyle = Math.abs(emf) < 0.05 ? '#6b7f92' : '#0d76b2';
        gg.font = '700 14px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'top';
        gg.fillText(PHY.fmt(emf, 2) + ' mV', x0, y0 + 24);
        gg.restore();
      }

      return {
        set: set, action: action, update: update,

        hint: function () {
          if (moving()) return '磁铁正在运动：' + dirLabel() + '，感应电动势 ' + PHY.fmt(emf, 2) + ' mV。';
          if (Math.abs(x + 14) < 0.4) return '磁铁在线圈外。点「插入磁铁」，注意观察电流计指针。';
          if (atCoil()) return '磁铁停在线圈中：磁通量不再变化，' + dirLabel() + '——只有磁通量变化才有感应电流。';
          return '磁铁停住了：' + dirLabel() + '。点「拔出磁铁」再试，看看方向是否相反。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>磁铁位置</dt><dd>x = ' + PHY.fmt(x, 1) + ' cm（' + (atCoil() ? '在线圈中' : (x < 0 ? '线圈左侧' : '线圈右侧')) + '）</dd></div>');
          out.push('<div><dt>磁铁极性</dt><dd>' + pole + ' 极朝向线圈</dd></div>');
          out.push('<div><dt>运动状态</dt><dd>' + (moving() ? '速度第 ' + speed + ' 档' : '静止') + '</dd></div>');
          out.push('<div><dt>磁通量 Φ</dt><dd>' + PHY.fmt(flux, 3) + '（相对值）</dd></div>');
          out.push('<div><dt>感应电动势</dt><dd>' + PHY.fmt(emf, 2) + ' mV</dd></div>');
          out.push('<div><dt>指针</dt><dd>' + dirLabel() + '</dd></div>');
          out.push('</dl>');
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>数据记录</b></p><div class="chips">');
            records.forEach(function (r, i) {
              out.push('<span class="chip">' + (i + 1) + '：' + r.pole + '极 速度' + r.speed + ' → ' + PHY.fmt(Math.abs(r.peak), 2) + 'mV ' + (r.sign > 0 ? '向右' : '向左') + '</span>');
            });
            out.push('</div>');
          }
          out.push('<div class="hint-box">结论：闭合电路中，只要穿过电路的<b>磁通量发生变化</b>，就会产生感应电流（电磁感应）。' +
            '感应电流的方向与磁通量变化的方向相反（楞次定律）；感应电动势的大小与磁通量<b>变化的快慢</b>有关。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);
          var cy = H * 0.42;
          var coilX = W * 0.44;
          var SC = 9;                      /* 1 cm = 9 px */
          var coilW = 66, coilH = 92;

          /* 导轨虚线 */
          gg.save();
          gg.strokeStyle = '#c3d5e4'; gg.lineWidth = 1.4; gg.setLineDash([6, 5]);
          gg.beginPath(); gg.moveTo(40, cy); gg.lineTo(W - 40, cy); gg.stroke();
          gg.restore();

          /* 线圈 */
          var turns = 9;
          gg.strokeStyle = '#c08b3e'; gg.lineWidth = 3; gg.lineCap = 'round';
          for (var i = 0; i < turns; i++) {
            var lx = coilX - coilW / 2 + i * coilW / (turns - 1);
            gg.beginPath();
            gg.ellipse(lx, cy, 7, coilH / 2, 0, 0, Math.PI * 2);
            gg.stroke();
          }
          /* 导线到电流计 */
          var gx = W - 130, gy = H * 0.72;
          gg.strokeStyle = '#5d6f7e'; gg.lineWidth = 2;
          gg.beginPath();
          gg.moveTo(coilX - coilW / 2, cy + coilH / 2);
          gg.lineTo(coilX - coilW / 2 - 40, cy + coilH / 2);
          gg.lineTo(coilX - coilW / 2 - 40, gy);
          gg.lineTo(gx, gy);
          gg.stroke();
          gg.beginPath();
          gg.moveTo(coilX + coilW / 2, cy + coilH / 2);
          gg.lineTo(coilX + coilW / 2 + 40, cy + coilH / 2);
          gg.lineTo(coilX + coilW / 2 + 40, gy);
          gg.lineTo(gx, gy);
          gg.stroke();
          drawGalvo(gg, gx, gy - 30);

          /* 磁铁 */
          var mx = coilX + x * SC;
          var mw = 74, mh = 30;
          gg.fillStyle = '#e2603c'; gg.strokeStyle = '#a8412a'; gg.lineWidth = 1.6;
          PHY.rr(gg, mx - mw / 2, cy - mh / 2, mw / 2, mh, 3); gg.fill(); gg.stroke();
          gg.fillStyle = '#5d6f7e'; gg.strokeStyle = '#38424c';
          PHY.rr(gg, mx, cy - mh / 2, mw / 2, mh, 3); gg.fill(); gg.stroke();
          gg.fillStyle = '#ffffff'; gg.font = '700 14px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText(pole === 'N' ? 'S' : 'N', mx - mw / 4, cy);
          gg.fillText(pole, mx + mw / 4, cy);
          gg.fillStyle = '#3d5a72'; gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText('条形磁铁', mx, cy + mh / 2 + 8);

          /* 方向指示箭头 */
          if (moving()) {
            var dirRight = target > x;
            var ax = mx + (dirRight ? mw / 2 + 12 : -mw / 2 - 12);
            PHY.arrow(gg, ax, cy - mh / 2 - 16, ax + (dirRight ? 34 : -34), cy - mh / 2 - 16, '#1e9fd8', 2.2, 9);
            gg.fillStyle = '#1e9fd8'; gg.font = '600 11px ' + FONT;
            gg.textAlign = 'center'; gg.textBaseline = 'bottom';
            gg.fillText(dirRight ? '插入' : '拔出', ax + (dirRight ? 17 : -17), cy - mh / 2 - 22);
          }

          /* 结论条 */
          gg.fillStyle = Math.abs(emf) < 0.05 ? '#6b7f92' : '#0d76b2';
          gg.font = '700 12.5px ' + FONT;
          gg.textAlign = 'left'; gg.textBaseline = 'top';
          gg.fillText(Math.abs(emf) < 0.05
            ? '磁通量没有变化 → 没有感应电流（指针不偏转）'
            : '磁通量正在变化 → 产生感应电流：' + dirLabel() + '，E ≈ ' + PHY.fmt(emf, 2) + ' mV', 24, H - 32);
          gg.restore();
        },

        /* 判定 / 测试接口 */
        pole: function () { return pole; },
        speed: function () { return speed; },
        pos: function () { return x; },
        emf: function () { return emf; },
        peak: function () { return peak; },
        peakSign: function () { return peakSign; },
        expectedSign: expectedSign,
        lastDir: function () { return lastDir; },
        moving: moving,
        atCoil: atCoil,
        outOfCoil: outOfCoil,
        flux: function () { return flux; },
        dirLabel: dirLabel,
        records: function () { return records; },
        __test: {
          setPole: function (v) { pole = v; },
          setSpeed: function (v) { speed = v; },
          insert: function () { action('insert'); },
          pull: function () { action('pull'); },
          stop: function () { action('stop'); },
          reset: function () { action('reset'); },
          record: function () { action('record'); },
          clearRec: function () { action('clearRec'); },
          setPos: function (v) { x = v; target = v; flux = fluxAt(x); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
