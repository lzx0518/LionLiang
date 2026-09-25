/* =============================================================================
 * 虚拟实验室 —— 压强与浮力 (js/physics/sims/pressure.js)
 * -----------------------------------------------------------------------------
 * 1) pressure  探究压力的作用效果 / 液体压强（初中）
 *    · 固体：小桌正放（桌腿朝下，受力面积小）与倒放（桌面朝下，面积大）压海绵
 *      → p = F / S，压力越大、受力面积越小，作用效果越明显
 *    · 液体：压强计探头放入液体中，p = ρgh；同深度换朝向读数不变
 * 2) buoy      探究浮力的大小（阿基米德原理，初中 / 高中）
 *    · 物体挂在弹簧测力计上浸入液体，读数变小 → F浮 = G − F拉
 *    · 溢出的液体收集起来称重 → G排 = ρ液·g·V排，比较可知 F浮 = G排
 *    · 完全浸没后继续下沉，F浮 不再变化（与深度无关）
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
  var G = 9.8;

  /* ============================================================
   * 1. 压强
   * ========================================================== */
  var LIQUIDS = {
    water: { name: '水', rho: 1000, color: 'rgba(126,203,238,0.55)' },
    brine: { name: '盐水', rho: 1100, color: 'rgba(120,190,200,0.6)' },
    alcohol: { name: '酒精', rho: 800, color: 'rgba(200,220,235,0.5)' }
  };

  PHY.registerSim({
    id: 'pressure',
    name: '压强：压力的作用效果与液体压强',
    field: 'mech',
    icon: '🧱',
    level: 'junior',
    tag: '压强',
    desc: '小桌压海绵看凹陷深浅（压力、受力面积），再把压强计探头放进液体里看 p = ρgh。',
    tip: '切「固体压强」加减砝码、切换正放倒放；切「液体压强」改深度与液体种类、换朝向。',

    controls: function (inst) {
      var list = [{ type: 'select', id: 'mode', label: '探究内容', value: inst.mode(), options: [{ v: 'solid', t: '固体：压力的作用效果' }, { v: 'liquid', t: '液体：内部的压强' }] }];
      if (inst.mode() === 'solid') {
        list.push({ type: 'select', id: 'face', label: '放置方式', value: inst.face(), options: [{ v: 'legs', t: '桌腿朝下（受力面积小）' }, { v: 'top', t: '桌面朝下（受力面积大）' }] });
        list.push({ type: 'slider', id: 'nw', label: '桌上砝码', min: 0, max: 4, step: 1, value: inst.weights(), unit: '个（每个 500 g）' });
      } else {
        list.push({ type: 'slider', id: 'depth', label: '探头深度 h', min: 2, max: 40, step: 1, value: inst.depth(), unit: 'cm' });
        list.push({ type: 'select', id: 'liquid', label: '液体', value: inst.liquid(), options: Object.keys(LIQUIDS).map(function (k) { return { v: k, t: LIQUIDS[k].name + '（ρ=' + LIQUIDS[k].rho + ' kg/m³）' }; }) });
        list.push({ type: 'select', id: 'face2', label: '探头朝向', value: inst.face(), options: [{ v: 'up', t: '朝上' }, { v: 'down', t: '朝下' }, { v: 'side', t: '朝侧面' }] });
      }
      list.push({ type: 'sep' });
      list.push({ type: 'button', id: 'record', label: '记录一组数据', primary: true });
      list.push({ type: 'button', id: 'clearRec', label: '清除数据' });
      list.push({ type: 'note', text: '当前压强 p = ' + PHY.fmt(inst.pressure(), 1) + ' Pa' });
      return list;
    },

    create: function (env) {
      var mode = 'solid';
      var face = 'legs';            /* solid: legs | top；liquid: up | down | side */
      var nw = 0;                   /* 砝码个数（500 g） */
      var depth = 18;               /* cm */
      var liquid = 'water';
      var records = [];
      var bubbles = 0;

      var M_TABLE = 0.2, M_W = 0.5;      /* kg */
      var S_LEGS = 4e-4, S_TOP = 1e-2;   /* m² */

      function set(id, v) {
        if (id === 'mode') { mode = v; face = (v === 'solid' ? 'legs' : 'up'); }
        else if (id === 'face' || id === 'face2') face = v;
        else if (id === 'nw') nw = Number(v);
        else if (id === 'depth') depth = v;
        else if (id === 'liquid') liquid = v;
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'record') {
          if (mode === 'solid') {
            records.push({ mode: mode, face: face, nw: nw, F: force(), S: area(), p: pressure() });
            PHY.log('记录第 ' + records.length + ' 组：' + (face === 'legs' ? '桌腿朝下' : '桌面朝下') + '，砝码 ' + nw +
              ' 个 → 压力 F = ' + PHY.fmt(force(), 2) + ' N，受力面积 S = ' + PHY.fmt(area() * 1e4, 1) +
              ' cm²，压强 p = ' + PHY.fmt(pressure(), 1) + ' Pa。', '', 'reaction');
          } else {
            records.push({ mode: mode, depth: depth, liquid: liquid, face: face, p: pressure() });
            PHY.log('记录第 ' + records.length + ' 组：' + LIQUIDS[liquid].name + ' 中深度 ' + depth + ' cm、探头' +
              faceName() + ' → p = ' + PHY.fmt(pressure(), 1) + ' Pa（相当于 ' + PHY.fmt(depth, 1) + ' cm 水柱）。', '', 'reaction');
          }
          if (mode === 'liquid' && records.length >= 2) {
            var a = records[records.length - 2], b = records[records.length - 1];
            if (a.depth === b.depth && a.liquid === b.liquid && a.face !== b.face && Math.abs(a.p - b.p) < 1) {
              PHY.log('同一深度、只改变探头朝向，压强不变 → 液体内部同一深度向各个方向的压强相等。', '', 'success');
            }
          }
          env.invalidateInfo();
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除数据。', '', 'info');
          env.invalidateInfo();
        }
      }

      function faceName() {
        if (mode === 'solid') return face === 'legs' ? '桌腿朝下' : '桌面朝下';
        return { up: '朝上', down: '朝下', side: '朝侧面' }[face] || '朝上';
      }
      function force() { return (M_TABLE + nw * M_W) * G; }
      function area() { return face === 'legs' ? S_LEGS : S_TOP; }
      function pressure() {
        if (mode === 'solid') return force() / area();
        return LIQUIDS[liquid].rho * G * (depth / 100);
      }
      function indent() {
        /* 海绵凹陷深度：随压强增大而变深（视觉用，取开方压缩量级） */
        if (mode !== 'solid') return 0;
        return PHY.clamp(7 * Math.sqrt(pressure() / 1000), 0, 30);
      }

      function update(dt) { bubbles += dt; }

      /* -------- 绘制：固体压强 -------- */
      function drawSolid(gg, W, H) {
        /* 右侧数据面板宽度随画布走，海绵在剩下的地方居中 —— 固定偏移会让两者在窄画布上叠在一起 */
        var pw = Math.min(234, W * 0.34);
        var px0 = W - pw - 14;
        var availW = Math.max(150, px0 - 30);
        var cx = 16 + availW / 2;
        var spongeTop = H * 0.60, spongeH = 74, spongeW = Math.min(360, availW * 0.9);
        var dip = indent();
        /* 海绵（顶面按凹陷变形） */
        gg.save();
        gg.beginPath();
        gg.moveTo(cx - spongeW / 2, spongeTop);
        var segs = 24;
        for (var i = 0; i <= segs; i++) {
          var t = i / segs;
          var x = cx - spongeW / 2 + spongeW * t;
          var y = spongeTop + dip * Math.exp(-Math.pow((t - 0.5) * 2.6, 2));
          gg.lineTo(x, y);
        }
        gg.lineTo(cx + spongeW / 2, spongeTop + spongeH);
        gg.lineTo(cx - spongeW / 2, spongeTop + spongeH);
        gg.closePath();
        var grd = gg.createLinearGradient(0, spongeTop, 0, spongeTop + spongeH);
        grd.addColorStop(0, '#fdf6e3');
        grd.addColorStop(1, '#e8d9b8');
        gg.fillStyle = grd; gg.fill();
        gg.strokeStyle = '#cbb894'; gg.lineWidth = 1.6; gg.stroke();
        for (var k = 0; k < 60; k++) {
          var px2 = cx - spongeW / 2 + ((k * 71) % spongeW);
          var py2 = spongeTop + 12 + ((k * 43) % (spongeH - 16));
          gg.beginPath(); gg.arc(px2, py2, 1.6, 0, 7);
          gg.fillStyle = 'rgba(180,160,120,0.5)'; gg.fill();
        }
        gg.restore();

        /* 小桌 */
        var deskW = 120, deskH = 10;
        var tableTop;
        if (face === 'legs') {
          tableTop = spongeTop - dip + 4;
          gg.fillStyle = '#c9a97a'; gg.strokeStyle = '#9d8153'; gg.lineWidth = 1.6;
          PHY.rr(gg, cx - deskW / 2, tableTop - deskH - 34, deskW, deskH, 3); gg.fill(); gg.stroke();
          for (var l = 0; l < 4; l++) {
            var lx = cx - deskW / 2 + 10 + l * (deskW - 26) / 3;
            gg.fillStyle = '#b18f5f';
            gg.fillRect(lx, tableTop - 34, 7, 34 + dip);
          }
        } else {
          tableTop = spongeTop - dip + 4;
          gg.fillStyle = '#c9a97a'; gg.strokeStyle = '#9d8153'; gg.lineWidth = 1.6;
          PHY.rr(gg, cx - deskW / 2, tableTop - deskH, deskW, deskH, 3); gg.fill(); gg.stroke();
          gg.fillStyle = '#b18f5f';
          gg.fillRect(cx - deskW / 2 + 12, tableTop - deskH - 30, 7, 30);
          gg.fillRect(cx + deskW / 2 - 19, tableTop - deskH - 30, 7, 30);
        }
        /* 砝码 */
        for (var m = 0; m < nw; m++) {
          var wy = tableTop - deskH - 34 - 20 - m * 0;
          var wx = cx - (nw * 26 - 6) / 2 + m * 26;
          gg.fillStyle = '#b9c6d2'; gg.strokeStyle = '#7f8d9b'; gg.lineWidth = 1.4;
          PHY.rr(gg, wx, (face === 'legs' ? tableTop - deskH - 34 - 18 : tableTop - deskH - 30 - 18), 20, 18, 3);
          gg.fill(); gg.stroke();
        }
        if (nw) {
          gg.fillStyle = '#3d5a72'; gg.font = '600 10.5px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'bottom';
          gg.fillText('砝码 ×' + nw, cx, (face === 'legs' ? tableTop - deskH - 34 - 22 : tableTop - deskH - 30 - 22));
        }

        /* 受力面积标注 */
        gg.save();
        var sLabel = face === 'legs' ? '受力面积 S = 4 cm²（四个桌腿）' : '受力面积 S = 100 cm²（整个桌面）';
        gg.fillStyle = '#1e9fd8'; gg.font = '600 11.5px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'top';
        gg.fillText(sLabel, cx, spongeTop + spongeH + 10);
        gg.restore();

        /* 数据面板 */
        PHY.panel(gg, px0, 14, pw, 150, '压力与压强');
        gg.save();
        var rows = [
          ['压力 F = G总', PHY.fmt(force(), 2) + ' N'],
          ['受力面积 S', PHY.fmt(area() * 1e4, 1) + ' cm²'],
          ['压强 p = F/S', PHY.fmt(pressure(), 1) + ' Pa'],
          ['海绵凹陷', PHY.fmt(dip, 1) + '（越深效果越明显）']
        ];
        gg.font = '11.5px ' + FONT; gg.textBaseline = 'middle';
        rows.forEach(function (r, i) {
          var yy = 44 + i * 22;
          gg.fillStyle = '#6b7f92'; gg.textAlign = 'left';
          gg.fillText(r[0], px0 + 12, yy);
          gg.fillStyle = '#1a2c3c'; gg.textAlign = 'right';
          gg.fillText(String(r[1]), px0 + pw - 12, yy);
        });
        gg.restore();
      }

      /* -------- 绘制：液体压强 -------- */
      function drawLiquid(gg, W, H) {
        var L = LIQUIDS[liquid];
        /* 同样按画布分配宽度：容器 + 压强计占左边，数据面板占右边，两者不许叠在一起 */
        var pw = Math.min(220, W * 0.30);
        var px0 = W - pw - 14;
        var availW = Math.max(180, px0 - 26);
        var bx = 16, by = H * 0.18, bw = Math.min(300, availW * 0.55), bh = Math.min(330, H * 0.60);
        /* 容器 */
        gg.save();
        gg.fillStyle = 'rgba(255,255,255,0.6)'; gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
        PHY.rr(gg, bx, by, bw, bh, 6); gg.fill(); gg.stroke();
        gg.fillStyle = L.color;
        gg.fillRect(bx + 2, by + 26, bw - 4, bh - 28);
        /* 液面波动 */
        gg.strokeStyle = 'rgba(255,255,255,0.85)'; gg.lineWidth = 1.6;
        gg.beginPath();
        for (var i = 0; i <= bw - 4; i += 6) {
          gg.lineTo(bx + 2 + i, by + 26 + Math.sin(i / 22 + bubbles * 2) * 1.6);
        }
        gg.stroke();
        /* 深度刻度 */
        gg.strokeStyle = 'rgba(61,90,114,0.45)'; gg.lineWidth = 1;
        for (var cm = 0; cm <= 40; cm += 5) {
          var yy = by + 26 + (cm / 40) * (bh - 30);
          if (yy > by + bh - 4) continue;
          gg.beginPath(); gg.moveTo(bx + 4, yy); gg.lineTo(bx + 14, yy); gg.stroke();
          gg.fillStyle = 'rgba(61,90,114,0.8)'; gg.font = '9.5px ' + FONT;
          gg.textAlign = 'left'; gg.textBaseline = 'middle';
          gg.fillText(cm + '', bx + 16, yy);
        }
        /* 探头 */
        var probeY = by + 26 + (depth / 40) * (bh - 30);
        var probeX = bx + bw * 0.62;
        gg.save();
        gg.translate(probeX, probeY);
        if (face === 'down') gg.rotate(Math.PI);
        else if (face === 'side') gg.rotate(Math.PI / 2);
        gg.fillStyle = '#e0a13c'; gg.strokeStyle = '#a8761f'; gg.lineWidth = 1.6;
        PHY.rr(gg, -13, -3, 26, 18, 3); gg.fill(); gg.stroke();
        gg.beginPath(); gg.arc(0, 15, 6, 0, 7); gg.fill(); gg.stroke();
        gg.restore();
        /* 探头连线到压强计 */
        var mx = bx + bw + 30;
        gg.strokeStyle = '#a8761f'; gg.lineWidth = 1.6;
        gg.beginPath(); gg.moveTo(probeX, probeY); gg.bezierCurveTo(probeX + 30, probeY - 10, mx - 20, by + 90, mx + 6, by + 110); gg.stroke();
        /* U 形压强计：左侧接探头，压强越大左低右高 */
        var ux = mx, uy = by + 110, uw = 78, uh = 96;
        gg.fillStyle = 'rgba(255,255,255,0.72)'; gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
        PHY.rr(gg, ux, uy, uw, uh, 5); gg.fill(); gg.stroke();
        var dh = PHY.clamp(pressure() / (1000 * G) * 100, 0, 55);   /* 折算成 cm 水柱 */
        var pixH = PHY.clamp(dh / 55, 0, 1) * (uh - 46);
        var baseH = 20, lh = Math.max(5, baseH - pixH / 2), rh = baseH + pixH / 2;
        gg.fillStyle = 'rgba(30,159,216,0.8)';
        gg.fillRect(ux + 9, uy + uh - 14 - lh, 18, lh + 14);
        gg.fillRect(ux + uw - 27, uy + uh - 14 - rh, 18, rh + 14);
        /* 高度差标注 */
        var yL = uy + uh - 14 - lh, yR = uy + uh - 14 - rh;
        gg.strokeStyle = '#e2603c'; gg.lineWidth = 1.4; gg.setLineDash([4, 3]);
        gg.beginPath();
        gg.moveTo(ux + 30, yL); gg.lineTo(ux + uw - 30, yL);
        gg.moveTo(ux + 30, yR); gg.lineTo(ux + uw - 30, yR);
        gg.stroke(); gg.setLineDash([]);
        gg.fillStyle = '#e2603c'; gg.font = '600 10.5px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'middle';
        gg.fillText('Δh = ' + PHY.fmt(dh, 1) + ' cm', ux + uw + 4, (yL + yR) / 2);
        /* 面板 */
        PHY.panel(gg, px0, 14, pw, 168, '液体内部压强');
        gg.save();
        var rows = [
          ['液体', L.name + '（ρ=' + L.rho + '）'],
          ['深度 h', depth + ' cm'],
          ['探头朝向', faceName()],
          ['p = ρgh', PHY.fmt(pressure(), 1) + ' Pa'],
          ['相当于水柱', PHY.fmt(dh, 1) + ' cm'],
          ['容器底压强', PHY.fmt(L.rho * G * 0.40, 1) + ' Pa']
        ];
        gg.font = '11.5px ' + FONT; gg.textBaseline = 'middle';
        rows.forEach(function (r, i) {
          var yy = 44 + i * 21;
          gg.fillStyle = '#6b7f92'; gg.textAlign = 'left';
          gg.fillText(r[0], px0 + 12, yy);
          gg.fillStyle = '#1a2c3c'; gg.textAlign = 'right';
          gg.fillText(String(r[1]), px0 + pw - 12, yy);
        });
        gg.restore();
        gg.restore();
      }

      return {
        set: set, action: action, update: update,

        hint: function () {
          if (mode === 'solid') return '现在：' + faceName() + '，砝码 ' + nw + ' 个 → F = ' + PHY.fmt(force(), 2) +
            ' N，S = ' + PHY.fmt(area() * 1e4, 1) + ' cm²，p = ' + PHY.fmt(pressure(), 1) + ' Pa。海绵陷得越深，作用效果越明显。';
          return '现在：' + LIQUIDS[liquid].name + ' 中 ' + depth + ' cm 深处，探头' + faceName() + ' → p = ' + PHY.fmt(pressure(), 1) + ' Pa。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          if (mode === 'solid') {
            out.push('<div><dt>放置方式</dt><dd>' + faceName() + '</dd></div>');
            out.push('<div><dt>桌上砝码</dt><dd>' + nw + ' 个（共 ' + PHY.fmt(nw * M_W * 1000, 0) + ' g）</dd></div>');
            out.push('<div><dt>压力 F</dt><dd>' + PHY.fmt(force(), 2) + ' N（小桌 ' + PHY.fmt(M_TABLE * 1000, 0) + ' g）</dd></div>');
            out.push('<div><dt>受力面积 S</dt><dd>' + PHY.fmt(area() * 1e4, 1) + ' cm²</dd></div>');
            out.push('<div><dt>压强 p</dt><dd>' + PHY.fmt(pressure(), 1) + ' Pa</dd></div>');
          } else {
            out.push('<div><dt>液体</dt><dd>' + LIQUIDS[liquid].name + '（ρ = ' + LIQUIDS[liquid].rho + ' kg/m³）</dd></div>');
            out.push('<div><dt>深度 h</dt><dd>' + depth + ' cm</dd></div>');
            out.push('<div><dt>探头朝向</dt><dd>' + faceName() + '</dd></div>');
            out.push('<div><dt>压强 p = ρgh</dt><dd>' + PHY.fmt(pressure(), 1) + ' Pa</dd></div>');
            out.push('<div><dt>压强计高度差</dt><dd>' + PHY.fmt(pressure() / (1000 * G) * 100, 1) + ' cm 水柱</dd></div>');
          }
          out.push('</dl>');
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>数据记录</b></p><div class="chips">');
            records.forEach(function (r, i) {
              out.push('<span class="chip">' + (i + 1) + '：' + (r.mode === 'solid'
                ? (r.face === 'legs' ? '桌腿朝下' : '桌面朝下') + ' F=' + PHY.fmt(r.F, 2) + 'N S=' + PHY.fmt(r.S * 1e4, 1) + 'cm²'
                : LIQUIDS[r.liquid].name + ' h=' + r.depth + 'cm') + ' p=' + PHY.fmt(r.p, 0) + 'Pa</span>');
            });
            out.push('</div>');
          }
          out.push('<div class="hint-box">' + (mode === 'solid'
            ? '结论：<b>压力一定时，受力面积越小，压强越大</b>；<b>受力面积一定时，压力越大，压强越大</b>。压强的定义式 p = F / S。'
            : '结论：液体内部向各个方向都有压强；<b>p = ρgh</b>，深度越深压强越大，液体密度越大压强越大；同一深度各方向压强相等。') + '</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);
          if (mode === 'solid') drawSolid(gg, W, H);
          else drawLiquid(gg, W, H);
          gg.restore();
        },

        /* 判定 / 测试接口 */
        mode: function () { return mode; },
        face: function () { return face; },
        weights: function () { return nw; },
        depth: function () { return depth; },
        liquid: function () { return liquid; },
        force: force,
        area: area,
        pressure: pressure,
        indent: indent,
        records: function () { return records; },
        __test: {
          setMode: function (v) { set('mode', v); },
          setFace: function (v) { face = v; },
          setWeights: function (v) { nw = Number(v); },
          setDepth: function (v) { depth = v; },
          setLiquid: function (v) { liquid = v; },
          record: function () { action('record'); },
          clearRec: function () { action('clearRec'); }
        }
      };
    }
  });

  /* ============================================================
   * 2. 浮力与阿基米德原理
   * ========================================================== */
  var OBJECTS = {
    stone: { name: '石块', V: 100, rho: 2.7, color: '#a8a29b' },
    wood: { name: '木块', V: 200, rho: 0.6, color: '#d9b382' }
  };
  var FLUIDS = {
    water: { name: '水', rho: 1.0, color: 'rgba(126,203,238,0.55)' },
    brine: { name: '盐水', rho: 1.1, color: 'rgba(120,190,200,0.6)' },
    alcohol: { name: '酒精', rho: 0.8, color: 'rgba(205,222,238,0.5)' }
  };

  PHY.registerSim({
    id: 'buoy',
    name: '探究浮力的大小（阿基米德原理）',
    field: 'mech',
    icon: '🛟',
    level: 'junior',
    tag: '浮力',
    desc: '把物体挂在弹簧测力计上慢慢浸入液体，读数变小；把排开的液体收集起来称重，比较 F浮 与 G排。',
    tip: '调「浸入深度」，选液体与物体；记录几组，比较浮力与排开液体的重力。',

    controls: function (inst) {
      return [
        { type: 'slider', id: 'h', label: '物体底面浸入深度 h', min: 0, max: 12, step: 0.5, value: inst.depth(), unit: 'cm' },
        { type: 'select', id: 'liquid', label: '液体', value: inst.liquid(), options: Object.keys(FLUIDS).map(function (k) { return { v: k, t: FLUIDS[k].name + '（ρ=' + FLUIDS[k].rho + ' g/cm³）' }; }) },
        { type: 'select', id: 'obj', label: '物体', value: inst.obj(), options: Object.keys(OBJECTS).map(function (k) { return { v: k, t: OBJECTS[k].name + '（V=' + OBJECTS[k].V + ' cm³，ρ=' + OBJECTS[k].rho + ' g/cm³）' }; }) },
        { type: 'sep' },
        { type: 'button', id: 'record', label: '记录一组数据', primary: true },
        { type: 'button', id: 'clearRec', label: '清除数据' },
        { type: 'note', text: 'F浮 = ' + PHY.fmt(inst.buoyancy(), 3) + ' N　G排 = ' + PHY.fmt(inst.displaced(), 3) + ' N' }
      ];
    },

    create: function (env) {
      var h = 0;                    /* 物体底面浸入深度 cm */
      var liquid = 'water', obj = 'stone';
      var records = [];
      var t = 0;

      function O() { return OBJECTS[obj]; }
      function L() { return FLUIDS[liquid]; }
      function side() { return Math.cbrt(O().V); }          /* 立方体边长 cm */
      function weight() { return O().rho * O().V * G / 1000; }   /* N */
      /* 几何上浸入的体积（cm³）：底面积 × min(h, 边长) */
      function vSubGeom() { return Math.pow(side(), 2) * Math.min(h, side()); }
      function fMax() { return L().rho * vSubGeom() * G / 1000; }
      function floats() { return fMax() > weight() + 1e-9; }
      function vSub() {
        /* 漂浮时浸入体积由平衡条件决定：ρ液·g·V排 = G */
        if (floats()) return weight() / (L().rho * G / 1000);
        return vSubGeom();
      }
      function buoyancy() { return Math.min(weight() + 1e-9, fMax()) || 0; }
      function displaced() { return L().rho * vSub() * G / 1000; }
      function springRead() { return Math.max(0, weight() - buoyancy()); }
      function immersed() { return !floats() && h >= side() - 1e-6; }

      function set(id, v) {
        if (id === 'h') h = v;
        else if (id === 'liquid') liquid = v;
        else if (id === 'obj') { obj = v; h = 0; }
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'record') {
          records.push({ obj: obj, liquid: liquid, h: h, F: buoyancy(), Grep: displaced(), T: springRead() });
          PHY.log('记录第 ' + records.length + ' 组：' + O().name + '在' + L().name + '中（底面浸入 ' + PHY.fmt(h, 1) +
            ' cm，V排 = ' + PHY.fmt(vSub(), 1) + ' cm³）→ 弹簧测力计读数 F拉 = ' + PHY.fmt(springRead(), 3) +
            ' N，F浮 = G − F拉 = ' + PHY.fmt(buoyancy(), 3) + ' N；排开液体重力 G排 = ' + PHY.fmt(displaced(), 3) + ' N。', '', 'reaction');
          if (Math.abs(buoyancy() - displaced()) < 0.005) {
            PHY.log('F浮 与 G排 相等 → 阿基米德原理：F浮 = G排 = ρ液·g·V排。', '', 'success');
          }
          env.invalidateInfo();
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除数据。', '', 'info');
          env.invalidateInfo();
        }
      }
      function update(dt) { t += dt; }

      /* 通用：竖直弹簧测力计 */
      function drawScale(gg, x, y, w, hgt, value, maxV, label) {
        gg.save();
        gg.fillStyle = '#f7fbfe'; gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
        PHY.rr(gg, x, y, w, hgt, 6); gg.fill(); gg.stroke();
        var ox = x + w * 0.34, top = y + 16, bot = y + hgt - 12;
        gg.strokeStyle = '#b9c6d2'; gg.lineWidth = 1;
        for (var i = 0; i <= 8; i++) {
          var yy = bot - (bot - top) * i / 8;
          gg.beginPath(); gg.moveTo(ox, yy); gg.lineTo(ox + (i % 2 === 0 ? 12 : 6), yy); gg.stroke();
        }
        var frac = PHY.clamp(value / maxV, 0, 1);
        var ny = bot - (bot - top) * frac;
        gg.strokeStyle = '#e2603c'; gg.lineWidth = 2.4;
        gg.beginPath(); gg.moveTo(ox - 11, ny); gg.lineTo(ox + 9, ny); gg.stroke();
        gg.fillStyle = '#e2603c'; gg.font = '700 14px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'bottom';
        gg.fillText(PHY.fmt(value, 2) + ' N', x + w / 2, y + hgt + 17);
        gg.fillStyle = '#3d5a72'; gg.font = '600 11px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'bottom';
        gg.fillText(label, x + w / 2, y - 5);
        gg.restore();
      }

      return {
        set: set, action: action, update: update,

        hint: function () {
          if (h <= 0.01) return '把「浸入深度」调大，看弹簧测力计的读数怎样变化（读数 = G − F浮）。';
          if (floats()) return O().name + '漂浮在' + L().name + '上：F浮 = G = ' + PHY.fmt(weight(), 3) + ' N，此时浸入体积 ' + PHY.fmt(vSub(), 1) + ' cm³。';
          if (immersed()) return '已经<b>完全浸没</b>。继续加深，F浮 保持 ' + PHY.fmt(buoyancy(), 3) + ' N 不变——浮力与深度无关。';
          return '底面浸入 ' + PHY.fmt(h, 1) + ' cm：V排 = ' + PHY.fmt(vSub(), 1) + ' cm³，F浮 = ' + PHY.fmt(buoyancy(), 3) + ' N。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>物体</dt><dd>' + O().name + '（V = ' + O().V + ' cm³，ρ = ' + O().rho + ' g/cm³）</dd></div>');
          out.push('<div><dt>物体重力 G</dt><dd>' + PHY.fmt(weight(), 3) + ' N</dd></div>');
          out.push('<div><dt>液体</dt><dd>' + L().name + '（ρ = ' + L().rho + ' g/cm³）</dd></div>');
          out.push('<div><dt>浸入深度</dt><dd>' + PHY.fmt(h, 1) + ' cm' + (immersed() ? '（已完全浸没）' : '') + (floats() ? '（漂浮）' : '') + '</dd></div>');
          out.push('<div><dt>排开液体体积 V排</dt><dd>' + PHY.fmt(vSub(), 1) + ' cm³</dd></div>');
          out.push('<div><dt>弹簧测力计读数</dt><dd>F拉 = ' + PHY.fmt(springRead(), 3) + ' N</dd></div>');
          out.push('<div><dt>浮力 F浮</dt><dd>' + PHY.fmt(buoyancy(), 3) + ' N</dd></div>');
          out.push('<div><dt>排开液体重力 G排</dt><dd>' + PHY.fmt(displaced(), 3) + ' N</dd></div>');
          out.push('</dl>');
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>数据记录</b></p><div class="chips">');
            records.forEach(function (r, i) {
              out.push('<span class="chip">' + (i + 1) + '：' + OBJECTS[r.obj].name + '/' + FLUIDS[r.liquid].name +
                ' h=' + PHY.fmt(r.h, 1) + 'cm F浮=' + PHY.fmt(r.F, 3) + 'N G排=' + PHY.fmt(r.Grep, 3) + 'N</span>');
            });
            out.push('</div>');
          }
          out.push('<div class="hint-box">结论（阿基米德原理）：<b>F浮 = G排 = ρ液·g·V排</b>。' +
            '浮力只与<b>液体密度</b>和<b>排开液体的体积</b>有关，与物体浸没的深度、物体的形状、材料都无关。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);
          var bx = W * 0.30, by = H * 0.26, bw = Math.min(230, W * 0.3), bh = Math.min(300, H * 0.56);
          var surfY = by + 24;
          /* 液体容器 */
          gg.fillStyle = 'rgba(255,255,255,0.6)'; gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
          PHY.rr(gg, bx, by, bw, bh, 5); gg.fill(); gg.stroke();
          gg.fillStyle = L().color;
          gg.fillRect(bx + 2, surfY, bw - 4, by + bh - surfY - 2);
          /* 溢出口 */
          gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
          gg.beginPath();
          gg.moveTo(bx + bw, surfY + 6); gg.lineTo(bx + bw + 26, surfY + 6);
          gg.stroke();
          /* 排出的液体 → 量筒 */
          var cylX = bx + bw + 46, cylY = surfY + 22, cylW = 46, cylH = 132;
          var fill = PHY.clamp(vSub() / O().V * 0.8, 0, 1);
          gg.fillStyle = 'rgba(255,255,255,0.6)'; gg.strokeStyle = '#8a99a8'; gg.lineWidth = 1.8;
          PHY.rr(gg, cylX, cylY, cylW, cylH, 4); gg.fill(); gg.stroke();
          gg.fillStyle = L().color;
          gg.fillRect(cylX + 2, cylY + cylH - cylH * fill, cylW - 4, cylH * fill);
          gg.fillStyle = '#3d5a72'; gg.font = '600 10.5px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText('量筒（收集排开的液体）', cylX + cylW / 2, cylY + cylH + 8);
          gg.fillText('V排 = ' + PHY.fmt(vSub(), 1) + ' cm³', cylX + cylW / 2, cylY + cylH + 24);

          /* 物体 + 弹簧测力计 */
          var a = side() * 4.2;                 /* 画布上的边长 */
          var topOfLiquid = surfY;
          var objY = topOfLiquid + h * (bh - 40) / 12 - a;   /* 底面浸入 h */
          var objX = bx + bw * 0.5 - a / 2;
          gg.fillStyle = O().color; gg.strokeStyle = 'rgba(60,80,100,0.7)'; gg.lineWidth = 1.8;
          PHY.rr(gg, objX, objY, a, a, 3); gg.fill(); gg.stroke();
          gg.fillStyle = 'rgba(255,255,255,0.8)'; gg.font = '600 10px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText(O().name, objX + a / 2, objY + a / 2);
          /* 细线 */
          gg.strokeStyle = '#5d6f7e'; gg.lineWidth = 1.4;
          gg.beginPath();
          gg.moveTo(objX + a / 2, objY);
          gg.lineTo(objX + a / 2, by - 40);
          gg.stroke();
          /* 弹簧测力计 */
          drawScale(gg, bx + bw * 0.5 - 34, by - 148, 68, 108, springRead(), Math.max(1, weight() * 1.6), '弹簧测力计');

          /* 力的示意 */
          gg.save();
          var fx = objX + a + 46, fy = objY + a / 2;
          if (buoyancy() > 0.005) {
            PHY.arrow(gg, fx, fy, fx, fy - 18 - buoyancy() * 26, '#2fa96b', 2.2, 8);
            gg.fillStyle = '#2fa96b'; gg.font = '600 11px ' + FONT;
            gg.textAlign = 'left'; gg.textBaseline = 'middle';
            gg.fillText('F浮 = ' + PHY.fmt(buoyancy(), 2) + ' N', fx + 6, fy - 20 - buoyancy() * 26);
          }
          gg.restore();

          /* 结论条 */
          var ok = Math.abs(buoyancy() - displaced()) < 0.005;
          gg.fillStyle = ok ? '#2fa96b' : '#6b7f92'; gg.font = '700 12.5px ' + FONT;
          gg.textAlign = 'left'; gg.textBaseline = 'top';
          gg.fillText('F浮 = G − F拉 = ' + PHY.fmt(weight(), 3) + ' − ' + PHY.fmt(springRead(), 3) + ' = ' + PHY.fmt(buoyancy(), 3) +
            ' N　　G排 = ρ液·g·V排 = ' + PHY.fmt(displaced(), 3) + ' N' + (ok ? '　⟹ F浮 = G排 ✓' : ''), 24, H - 32);
          gg.restore();
        },

        /* 判定 / 测试接口 */
        depth: function () { return h; },
        liquid: function () { return liquid; },
        obj: function () { return obj; },
        weight: weight,
        buoyancy: buoyancy,
        displaced: displaced,
        springRead: springRead,
        vSub: vSub,
        immersed: immersed,
        floats: floats,
        records: function () { return records; },
        __test: {
          setDepth: function (v) { h = v; },
          setLiquid: function (v) { liquid = v; },
          setObj: function (v) { obj = v; h = 0; },
          dive: function (v) { h = v; },
          record: function () { action('record'); },
          clearRec: function () { action('clearRec'); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
