/* =============================================================================
 * 虚拟实验室 —— 光学仿真：平面镜成像 (js/physics/sims/mirror.js)
 * -----------------------------------------------------------------------------
 * 探究平面镜成像的特点（初中，人教版八年级上册）：
 *   · 用玻璃板代替平面镜，既能成像，又能透过它看到后面的蜡烛
 *   · 拿一支完全相同的「蜡烛 B」在玻璃板后移动，直到与 A 的像完全重合
 *     → 说明像与物大小相等（等效替代法）
 *   · 量出物距 u 与像距 v，得到 u = v，且像与物的连线垂直于镜面
 *   · 把光屏放到像的位置，光屏上接不到像 → 平面镜成的是虚像
 *
 * 画布是俯视图：玻璃板画成一条竖线，左侧是物（蜡烛 A），右侧是像。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

  var S = 9;                 /* 1 cm 对应的像素（随画布宽度自适应，见 fitScale） */

  PHY.registerSim({
    id: 'mirror',
    name: '平面镜成像的特点',
    field: 'optics',
    icon: '🪞',
    level: 'junior',
    tag: '光现象',
    desc: '用玻璃板代替平面镜：移动蜡烛 B 与蜡烛 A 的像重合，量出物距和像距，再用光屏检验像是虚像。',
    tip: '左右拖动蜡烛 A 改物距，拖动蜡烛 B 去与像重合；点一下蜡烛 A 可以点燃 / 熄灭它。',

    controls: function (inst) {
      return [
        { type: 'slider', id: 'u', label: '物距 u', min: 6, max: 34, step: 1, value: inst.getU(), unit: 'cm' },
        { type: 'sep' },
        { type: 'button', id: 'record', label: '记录一组数据', primary: true },
        { type: 'button', id: 'screen', label: '把光屏移到像的位置' },
        { type: 'button', id: 'clearRec', label: '清除数据' },
        { type: 'button', id: 'reset', label: '重置装置' },
        { type: 'note', text: '蜡烛 B 在像后方 ' + PHY.fmt(inst.getD(), 1) + ' cm，像距 v = ' + PHY.fmt(inst.getU(), 1) + ' cm' }
      ];
    },

    create: function (env) {
      var u = 18;                 /* 物距 cm（蜡烛 A 到玻璃板） */
      var d = 10;                 /* 蜡烛 B 到玻璃板的距离 cm */
      var lit = false;            /* 蜡烛 A 是否点燃 */
      var screenCM = null;        /* 光屏位置 cm（null = 没放） */
      var records = [];
      var drag = null;
      var flash = 0;
      var coincideHold = 0;

      function mirrorX() { return env.W * 0.46; }
      function benchY() { return env.H * 0.52; }
      function xOf(cm) { return mirrorX() + cm * S; }
      /* 比例尺随画布走：物距最大 34 cm 要放在玻璃板左边，蜡烛 B / 像最远 40 cm
         要放在右边，固定 9 px/cm 时窄画布上蜡烛会被画到画布外面去。 */
      function fitScale() {
        S = PHY.clamp(Math.min((env.W * 0.46 - 34) / 34, (env.W * 0.54 - 30) / 40), 3.5, 9);
      }
      /* 像与物大小相等：以「重合程度」衡量 */
      function coincide() { return Math.abs(d - u) <= 0.8; }
      function imageOnScreen() { return false; }   /* 平面镜成虚像，光屏永远接不到 */

      function set(id, v) {
        if (id === 'u') u = v;
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'record') {
          var dev = Math.abs(d - u);
          records.push({ u: u, d: d, dev: dev, ok: dev <= 0.8 });
          if (dev <= 0.8) {
            PHY.log('记录第 ' + records.length + ' 组：蜡烛 B 与像完全重合 → 物距 u = ' + PHY.fmt(u, 1) +
              ' cm，像距 v = ' + PHY.fmt(u, 1) + ' cm，像与物大小相等。', '', 'success');
          } else {
            PHY.log('记录第 ' + records.length + ' 组：蜡烛 B 在 ' + PHY.fmt(d, 1) + ' cm 处，与像差了 ' +
              PHY.fmt(dev, 1) + ' cm，还没有重合——先把 B 移到像的位置再记录。', '', 'warn');
          }
        } else if (id === 'screen') {
          screenCM = u;
          PHY.log('把光屏放到玻璃板后 ' + PHY.fmt(u, 1) + ' cm 处（与像同位置）：光屏上什么也没有，接不到像 → 平面镜成的是虚像。', '', 'warn');
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除记录数据。', '', 'info');
        } else if (id === 'reset') {
          u = 18; d = 10; lit = false; screenCM = null; records = [];
          PHY.log('装置已重置。', '', 'info');
        }
        env.invalidateInfo();
      }

      function geom() { fitScale(); return { mx: mirrorX(), by: benchY() }; }

      function onDown(x, y) {
        var gm = geom();
        var cmAt = function (px) { return (px - gm.mx) / S; };
        if (Math.hypot(x - xOf(-u), y - gm.by) < 30) {
          drag = { what: 'A', off: (-u) - cmAt(x), moved: false };
          return;
        }
        if (Math.hypot(x - xOf(d), y - gm.by) < 26) {
          drag = { what: 'B', off: d - cmAt(x), moved: false };
          return;
        }
        if (screenCM !== null && Math.hypot(x - xOf(screenCM), y - gm.by) < 26) {
          drag = { what: 'screen', off: screenCM - cmAt(x), moved: false };
          return;
        }
      }
      function onMove(x, y, ev) {
        if (!drag) return;
        if (ev && ev.buttons === 0) { drag = null; return; }
        fitScale();
        var mx = mirrorX();
        var cm = (x - mx) / S + drag.off;
        drag.moved = true;
        if (drag.what === 'A') u = PHY.clamp(Math.round(-cm), 6, 34);
        else if (drag.what === 'B') d = PHY.clamp(Math.round(cm), 1, 40);
        else if (drag.what === 'screen') screenCM = PHY.clamp(Math.round(cm), 1, 40);
        env.invalidateInfo();
      }
      function onUp() {
        /* 只是点了一下蜡烛 A（没有拖动）→ 点燃 / 熄灭 */
        if (drag && drag.what === 'A' && !drag.moved) {
          lit = !lit;
          PHY.log(lit ? '点燃了蜡烛 A，玻璃板后出现了它的像。' : '熄灭了蜡烛 A，像也随之消失。', '', 'info');
          env.invalidateInfo();
        }
        drag = null;
      }

      function update(dt) {
        flash += dt;
        if (coincide()) coincideHold += dt; else coincideHold = 0;
        if (coincideHold > 0.5 && !flag.co) {
          flag.co = true;
          PHY.log('蜡烛 B 与蜡烛 A 的像完全重合了！这说明像与物的大小相等。', '', 'success');
          env.invalidateInfo();
        }
        if (!coincide()) flag.co = false;
      }
      var flag = { co: false };

      /* ---------------- 绘制 ---------------- */
      function candle(gg, x, y, h, isLit, color, dashed) {
        gg.save();
        gg.strokeStyle = color || '#8a99a8';
        gg.lineWidth = dashed ? 1.8 : 2;
        if (dashed) gg.setLineDash([5, 4]);
        /* 蜡身 */
        gg.beginPath();
        gg.moveTo(x, y + 2);
        gg.lineTo(x, y - h);
        gg.lineWidth = dashed ? 4 : 7;
        gg.stroke();
        gg.setLineDash([]);
        /* 烛芯 + 火焰 */
        gg.beginPath();
        gg.moveTo(x, y - h); gg.lineTo(x, y - h - 3);
        gg.lineWidth = 1.4; gg.strokeStyle = '#5d6f7e'; gg.stroke();
        if (isLit) {
          var fh = 11 + Math.sin(flash * 11 + x) * 2;
          var grd = gg.createRadialGradient(x, y - h - 6, 1, x, y - h - 6, fh);
          grd.addColorStop(0, 'rgba(255,238,170,0.98)');
          grd.addColorStop(0.5, 'rgba(255,190,60,0.85)');
          grd.addColorStop(1, 'rgba(255,140,40,0)');
          gg.fillStyle = grd;
          gg.beginPath();
          gg.moveTo(x - 4, y - h - 3);
          gg.quadraticCurveTo(x, y - h - 3 - fh, x + 4, y - h - 3);
          gg.closePath(); gg.fill();
        }
        gg.restore();
      }

      return {
        set: set, action: action,
        onDown: onDown, onMove: onMove, onUp: onUp,
        update: update,

        hint: function () {
          if (!lit) return '先点燃蜡烛 A（点一下画布上的蜡烛），然后观察玻璃板后面出现的像。';
          if (!coincide()) return '拖动蜡烛 B，让它与蜡烛 A 的像完全重合（现在相差 ' + PHY.fmt(Math.abs(d - u), 1) + ' cm）。';
          return 'B 与像完全重合：u = v = ' + PHY.fmt(u, 1) + ' cm，像与物大小相等。记录几组数据再总结规律。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>蜡烛 A</dt><dd>' + (lit ? '已点燃' : '未点燃') + '</dd></div>');
          out.push('<div><dt>物距 u</dt><dd>' + PHY.fmt(u, 1) + ' cm</dd></div>');
          out.push('<div><dt>像距 v</dt><dd>' + PHY.fmt(u, 1) + ' cm（像在镜后与物等距处）</dd></div>');
          out.push('<div><dt>蜡烛 B 位置</dt><dd>' + PHY.fmt(d, 1) + ' cm ' +
            (coincide() ? '<span style="color:#2fa96b">（与像完全重合）</span>' : '（与像相差 ' + PHY.fmt(Math.abs(d - u), 1) + ' cm）') + '</dd></div>');
          out.push('<div><dt>像的性质</dt><dd>正立、等大的<b>虚像</b>，像与物关于镜面对称</dd></div>');
          if (screenCM !== null) out.push('<div><dt>光屏位置</dt><dd>' + PHY.fmt(screenCM, 1) + ' cm：光屏上接不到像（虚像）</dd></div>');
          out.push('</dl>');
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>数据记录</b></p><div class="chips">');
            records.forEach(function (r, i) {
              out.push('<span class="chip' + (r.ok ? '' : ' warn') + '">' + (i + 1) + '：u=' + PHY.fmt(r.u, 1) + 'cm v=' + PHY.fmt(r.u, 1) + 'cm' + (r.ok ? ' ✓重合' : ' 未重合') + '</span>');
            });
            out.push('</div>');
            var good = records.filter(function (r) { return r.ok; });
            if (good.length >= 3) out.push('<div class="hint-box">3 组数据都是 u = v 且 B 与像完全重合 → <b>像与物到镜面的距离相等、像与物大小相等</b>，即像与物关于镜面对称。</div>');
          }
          out.push('<div class="hint-box">为什么用<b>玻璃板</b>而不用平面镜？玻璃板既能反射成像，又能透过去看到后面的蜡烛 B，才能确定像的位置（等效替代法）。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);
          fitScale();
          var gm = geom();
          var mx = gm.mx, by = gm.by;

          /* 桌面与刻度尺 */
          gg.fillStyle = '#e8eef5';
          gg.fillRect(0, by + 62, W, H - by - 62);
          gg.strokeStyle = '#c3d5e4'; gg.lineWidth = 1;
          for (var cm = -40; cm <= 40; cm += 2) {
            var x = xOf(cm);
            if (x < 12 || x > W - 12) continue;
            var long = cm % 10 === 0;
            gg.beginPath();
            gg.moveTo(x, by + 62); gg.lineTo(x, by + 62 + (long ? 12 : 7));
            gg.stroke();
            if (long) {
              gg.fillStyle = '#6b7f92'; gg.font = '10px ' + FONT;
              gg.textAlign = 'center'; gg.textBaseline = 'top';
              gg.fillText(String(Math.abs(cm)), x, by + 76);
            }
          }
          gg.fillStyle = '#6b7f92'; gg.font = '10.5px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'bottom';
          gg.fillText('刻度尺 / cm（0 刻度在玻璃板位置）', W / 2, by + 96);

          /* 玻璃板后面的像（虚像，画成虚线） */
          if (lit) {
            candle(gg, xOf(u), by, 46, true, 'rgba(224,161,60,0.85)', true);
            gg.save();
            gg.fillStyle = 'rgba(224,161,60,0.9)'; gg.font = '600 11px ' + FONT;
            gg.textAlign = 'center'; gg.textBaseline = 'top';
            gg.fillText('像（看不见，摸不到）', xOf(u), by + 14);
            gg.restore();
          }

          /* 玻璃板 */
          gg.save();
          gg.strokeStyle = '#7fb6d6'; gg.lineWidth = 3;
          gg.beginPath(); gg.moveTo(mx, by - 74); gg.lineTo(mx, by + 58); gg.stroke();
          gg.strokeStyle = 'rgba(127,182,214,0.5)'; gg.lineWidth = 1.2;
          gg.beginPath(); gg.moveTo(mx + 5, by - 74); gg.lineTo(mx + 5, by + 58); gg.stroke();
          gg.fillStyle = '#3d5a72'; gg.font = '600 11.5px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'bottom';
          gg.fillText('玻璃板（代替平面镜）', mx, by - 80);
          gg.restore();

          /* 蜡烛 A（物） */
          candle(gg, xOf(-u), by, 46, lit, '#8a99a8', false);
          gg.save();
          gg.fillStyle = '#3d5a72'; gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText('蜡烛 A（物）', xOf(-u), by + 14);
          gg.restore();

          /* 蜡烛 B（未点燃，用来与像重合） */
          candle(gg, xOf(d), by, 46, false, coincide() ? '#2fa96b' : '#b9c6d2', false);
          gg.save();
          gg.fillStyle = coincide() ? '#2fa96b' : '#6b7f92';
          gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText('蜡烛 B' + (coincide() ? '（已重合 ✓）' : ''), xOf(d), by + 34);
          gg.restore();

          /* 光屏 */
          if (screenCM !== null) {
            gg.save();
            var sx = xOf(screenCM);
            gg.fillStyle = '#f2f6fa'; gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
            PHY.rr(gg, sx - 4, by - 44, 8, 62, 3); gg.fill(); gg.stroke();
            gg.fillStyle = '#e2603c'; gg.font = '600 11px ' + FONT;
            gg.textAlign = 'center'; gg.textBaseline = 'top';
            gg.fillText('光屏（接不到像）', sx, by + 34);
            gg.restore();
          }

          /* 标注：u 与 v 的线段 */
          gg.save();
          gg.strokeStyle = '#1e9fd8'; gg.lineWidth = 1.6;
          gg.beginPath(); gg.moveTo(xOf(-u), by + 62); gg.lineTo(mx, by + 62); gg.stroke();
          gg.beginPath(); gg.moveTo(mx, by + 62); gg.lineTo(xOf(u), by + 62); gg.stroke();
          gg.fillStyle = '#1e9fd8'; gg.font = '700 11.5px ' + FONT;
          gg.textAlign = 'left'; gg.textBaseline = 'bottom';
          gg.fillText('u = ' + PHY.fmt(u, 1) + ' cm', xOf(-u) + 4, by + 58);
          gg.textAlign = 'right';
          gg.fillText('v = ' + PHY.fmt(u, 1) + ' cm', xOf(u) - 4, by + 58);
          gg.restore();

          /* 结论条 */
          if (coincide() && lit) {
            gg.save();
            gg.fillStyle = 'rgba(47,169,107,0.12)';
            PHY.rr(gg, W / 2 - 190, 16, 380, 34, 8); gg.fill();
            gg.fillStyle = '#2fa96b'; gg.font = '700 13px ' + FONT;
            gg.textAlign = 'center'; gg.textBaseline = 'middle';
            gg.fillText('B 与像完全重合 → u = v，像与物大小相等（虚像）', W / 2, 33);
            gg.restore();
          }
          gg.restore();
        },

        /* 判定 / 测试接口 */
        getU: function () { return u; },
        getD: function () { return d; },
        isLit: function () { return lit; },
        coincide: coincide,
        screenCM: function () { return screenCM; },
        imageOnScreen: imageOnScreen,
        records: function () { return records; },
        __test: {
          light: function () { lit = true; },
          blowOut: function () { lit = false; },
          setU: function (v) { u = v; },
          setD: function (v) { d = v; },
          moveBToImage: function () { d = u; },
          putScreen: function () { action('screen'); },
          record: function () { action('record'); },
          clearRec: function () { action('clearRec'); },
          reset: function () { action('reset'); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
