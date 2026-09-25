/* =============================================================================
 * 虚拟实验室 —— 光学仿真 (js/physics/sims/optics.js)
 * -----------------------------------------------------------------------------
 * 本文件注册两个仿真：
 *  1) lens    凸透镜成像规律（初中）：
 *     光具座上的蜡烛、凸透镜、光屏都可拖动；用三条特殊光线作图，
 *     实像 / 虚像自动求解（1/f = 1/u + 1/v），光屏上能"接到"最清晰的像。
 *     各成像区间（u>2f / u=2f / f<u<2f / u=f / u<f）的规律找到后自动记录。
 *  2) refract 光的反射与折射（初中反射定律 / 高中折射率与全反射）：
 *     拖动激光笔改变入射角；反射角 = 入射角实时标注；
 *     折射角由 n = sinθ1 / sinθ2 计算；玻璃→空气模式下演示全反射与临界角。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
  var RAD = Math.PI / 180;

  /* ============================================================
   * 1. 凸透镜成像规律
   * ========================================================== */
  PHY.registerSim({
    id: 'lens',
    name: '凸透镜成像规律',
    field: 'optics',
    icon: '🔍',
    level: 'junior',
    desc: '拖动蜡烛与光屏，用三条特殊光线观察实像与虚像，归纳成像规律。',
    tip: '蜡烛、透镜、光屏都可以左右拖动；光屏拖到实像位置会出现最清晰的像。',
    controls: function (inst) {
      var u = inst.getU(), v = inst.getV();
      var kind = inst.imageKind();
      var kName = { real: '实像', virtual: '虚像', none: '不成像' }[kind] || '—';
      return [
        { type: 'slider', id: 'f', label: '透镜焦距 f', min: 5, max: 25, step: 1, value: inst.getF(), unit: 'cm' },
        { type: 'sep' },
        { type: 'note', text: '物距 u = ' + PHY.fmt(u, 1) + ' cm　像距 v = ' + (v === null ? '—' : PHY.fmt(v, 1) + ' cm') + '　' + kName },
        { type: 'note', text: '拖动画布里的蜡烛与光屏；拖到 u = 2f 附近可得等大实像' }
      ];
    },

    create: function (env) {
      var S = 8;                    // 8 px = 1 cm
      var f = 15;                   // 焦距 cm
      var benchY = 300;
      var xLens;
      var candleCM = 46;            // 物距 u（cm，蜡烛在透镜左侧）
      var screenCM = 60;            // 光屏在透镜右侧的距离 cm
      var drag = null;
      var hObj = 12;                // 物高 cm
      var flick = 0;
      var findings = {};
      var flash = 0;

      function initPos() {
        benchY = env.H * 0.56;
        /* 画布宽度是可变的（左栏 + 右侧面板会占掉几百像素），所以「1 cm = 几像素」
           必须跟着画布走：光具座上一共要放下物距 78 cm + 像距 88 cm。
           固定 8 px/cm 时在窄画布上会把光屏甩到画布外面去。 */
        S = PHY.clamp((env.W - 56) / 178, 3, 8);
        if (xLens === undefined) xLens = env.W * 0.5;
        /* 变窄之后把蜡烛与光屏收进可视范围，保证拖得到 */
        candleCM = PHY.clamp(candleCM, 6, Math.max(8, (xLens - 22) / S));
        screenCM = PHY.clamp(screenCM, 8, Math.max(10, (env.W - 22 - xLens) / S));
      }
      function xSide(cm) { return xLens + cm * S; }
      function candleX() { return xSide(-candleCM); }
      function screenX() { return xSide(screenCM); }

      function image() {
        var u = candleCM;
        if (Math.abs(u - f) < 0.35) return { kind: 'infinite' };
        var v = u * f / (u - f);
        return { kind: v > 0 ? 'real' : 'virtual', v: v, m: -v / u, h: (-v / u) * hObj };
      }
      function regionOf(u) {
        if (u > 2 * f * 1.05) return 'gt2f';
        if (Math.abs(u - 2 * f) <= 2 * f * 0.07) return 'eq2f';
        if (u > f * 1.05) return 'between';
        if (Math.abs(u - f) <= f * 0.035) return 'eqf';
        return 'ltf';
      }
      var REGION_TEXT = {
        gt2f: 'u>2f：倒立、缩小的实像（照相机）',
        eq2f: 'u=2f：倒立、等大的实像',
        between: 'f<u<2f：倒立、放大的实像（投影仪）',
        eqf: 'u=f：不成像（折射光平行射出）',
        ltf: 'u<f：正立、放大的虚像（放大镜）'
      };

      function sharpOnScreen() {
        var img = image();
        return img.kind === 'real' && Math.abs(screenCM - img.v) < 1.2;
      }
      function recordFinding() {
        var reg = regionOf(candleCM);
        var img = image();
        if (reg === 'eqf' || img.kind !== 'real') return;
        if (!findings[reg]) {
          findings[reg] = true;
          PHY.log('光屏上得到最清晰的像：u = ' + PHY.fmt(candleCM, 1) + ' cm → ' + REGION_TEXT[reg] +
            '（v = ' + PHY.fmt(img.v, 1) + ' cm）', '', 'success');
          flash = 0.9;
        }
      }

      function onDown(x, y) {
        initPos();
        if (Math.abs(y - (benchY + 20)) < 30) {
          if (Math.abs(x - candleX()) < 26) { drag = 'candle'; return; }
          if (Math.abs(x - screenX()) < 20) { drag = 'screen'; return; }
        }
        if (Math.abs(x - xLens) < 20 && Math.abs(y - benchY) < 96) { drag = 'lens'; return; }
        drag = null;
      }
      function onMove(x, y) {
        if (!drag) return;
        if (drag === 'candle') {
          candleCM = PHY.clamp((xLens - x) / S, 6, 78);
        } else if (drag === 'screen') {
          screenCM = PHY.clamp((x - xLens) / S, 8, 88);
        } else if (drag === 'lens') {
          var dx = x - xLens;
          xLens = PHY.clamp(x, 140, env.W - 150);
          candleCM = PHY.clamp(candleCM - dx / S, 6, 78);
          screenCM = PHY.clamp(screenCM + dx / S, 8, 88);
        }
        if (sharpOnScreen()) recordFinding();
      }
      function onUp() { drag = null; }
      function set(id, v) { if (id === 'f') f = v; }
      function applyPreset(p) {
        if (!p) return;
        if (p.u !== undefined) candleCM = PHY.clamp(p.u, 6, 78);
        if (p.f !== undefined) f = p.f;
      }

      function hint() {
        var img = image();
        if (img.kind === 'infinite') return 'u = f：折射光线平行射出，不成像。把蜡烛移近或移远一些。';
        if (img.kind === 'virtual') return 'u < f：虚像与物在同侧，光屏上接收不到——透过透镜直接观察。';
        if (sharpOnScreen()) return '光屏上的像最清晰：' + REGION_TEXT[regionOf(candleCM)];
        return '左右拖动光屏，找到最清晰的像（应有 v = ' + PHY.fmt(Math.abs(image().v), 1) + ' cm）。';
      }

      function info() {
        var u = candleCM;
        var img = image();
        var out = ['<dl class="kv">'];
        out.push('<div><dt>焦距 f</dt><dd>' + f + ' cm</dd></div>');
        out.push('<div><dt>物距 u</dt><dd>' + PHY.fmt(u, 1) + ' cm</dd></div>');
        if (img.kind === 'infinite') {
          out.push('<div><dt>像</dt><dd>不成像（u = f）</dd></div>');
        } else {
          out.push('<div><dt>像距 v</dt><dd>' + PHY.fmt(Math.abs(img.v), 1) + ' cm（' + (img.v > 0 ? '透镜另一侧' : '与物同侧') + '）</dd></div>');
          out.push('<div><dt>像的性质</dt><dd>' + REGION_TEXT[regionOf(u)].split('：')[1] + '</dd></div>');
          out.push('<div><dt>放大率</dt><dd>' + PHY.fmt(Math.abs(img.m), 2) + ' 倍</dd></div>');
        }
        out.push('</dl>');
        var found = Object.keys(findings);
        if (found.length) {
          out.push('<p style="margin:8px 0 2px"><b>已归纳的成像规律</b></p><div class="chips">');
          found.forEach(function (k) { out.push('<span class="chip">' + REGION_TEXT[k] + '</span>'); });
          out.push('</div>');
        }
        return out.join('');
      }

      function seg(gg, x1, y1, x2, y2, col, dash) {
        gg.save();
        gg.strokeStyle = col; gg.lineWidth = 1.8;
        if (dash) gg.setLineDash([6, 5]);
        gg.beginPath(); gg.moveTo(x1, y1); gg.lineTo(x2, y2); gg.stroke();
        gg.restore();
      }

      /* 从 (x0,y0) 沿 (dx,dy) 走，最多走到画布边界，返回参数 t。
         特殊光线在焦距很短时斜率极大（R1 会一路冲到画布下方上千像素），
         必须裁到边界，否则整条光线等于白画。 */
      function edgeT(x0, y0, dx, dy) {
        var t = Infinity, pad = 10;
        if (dx > 1e-6) t = Math.min(t, (env.W - pad - x0) / dx);
        else if (dx < -1e-6) t = Math.min(t, (pad - x0) / dx);
        if (dy > 1e-6) t = Math.min(t, (env.H - pad - y0) / dy);
        else if (dy < -1e-6) t = Math.min(t, (pad - y0) / dy);
        if (!isFinite(t) || t < 0) t = 0;
        return t;
      }

      function rayTrace(gg) {
        var y0 = benchY;
        var tipX = candleX(), tipY = y0 - hObj * S;
        var cx = xLens;
        var cols = ['#e2603c', '#2fa96b', '#8b6fd8'];

        /* R1: 平行主轴入射 → 折射后过像方焦点 F' */
        var dirx = f * S, diry = y0 - tipY;
        seg(gg, tipX, tipY, cx, tipY, cols[0]);
        var tR = edgeT(cx, tipY, dirx, diry);
        seg(gg, cx, tipY, cx + dirx * tR, tipY + diry * tR, cols[0]);

        /* R2: 过光心直线 */
        var slope2 = (y0 - tipY) / Math.max(1, cx - tipX);
        var t2 = edgeT(tipX, tipY, 1, slope2);
        seg(gg, tipX, tipY, tipX + t2, tipY + slope2 * t2, cols[1]);

        /* R3: 经过物方焦点 F 所在直线 → 折射后平行主轴
           注意分母可能是负数（蜡烛在 F 外侧时 tipX < fLeft），不能直接用
           Math.max(0.5, …) 夹断——那会把本该是 −248 的分母变成 0.5，
           算出几万像素的斜率，整条光线被甩到画布外。这里只在"真接近 0"时才做保号替换。 */
        var fLeft = xSide(-f);
        var dx3 = tipX - fLeft;
        if (Math.abs(dx3) < 0.5) dx3 = dx3 < 0 ? -0.5 : 0.5;
        var slope3 = (tipY - y0) / dx3;
        var yAtLens = tipY + slope3 * (cx - tipX);
        seg(gg, tipX, tipY, cx, yAtLens, cols[2]);
        seg(gg, cx, yAtLens, env.W - 8, yAtLens, cols[2]);

        var img = image();
        if (img.kind === 'virtual') {
          /* 反向延长（虚线）交出虚像，同样裁到画布边界 */
          var tB = edgeT(cx, tipY, -dirx, -diry);
          seg(gg, cx, tipY, cx - dirx * tB, tipY - diry * tB, cols[0], true);
          var tB2 = edgeT(cx, y0, -1, -slope2);
          seg(gg, cx, y0, cx - tB2, y0 - slope2 * tB2, cols[1], true);
        }

        if (img.kind === 'real' || img.kind === 'virtual') {
          var ix = xSide(img.v);
          var ih = img.h * S;
          gg.save();
          gg.globalAlpha = img.kind === 'real' ? 1 : 0.72;
          gg.strokeStyle = '#b3542f';
          gg.setLineDash(img.kind === 'real' ? [] : [5, 4]);
          gg.lineWidth = 3;
          gg.beginPath(); gg.moveTo(ix, y0); gg.lineTo(ix, y0 - ih); gg.stroke();
          gg.fillStyle = '#f2a33c';
          gg.beginPath(); gg.ellipse(ix, y0 - ih - 7, 4.5, 7, 0, 0, 7); gg.fill();
          gg.restore();
          PHY.tag(gg, ix - 24, y0 - ih - 36, img.kind === 'real' ? '实像' : '虚像', '#e2603c');
        } else {
          PHY.tag(gg, cx + 8, tipY - 12, '平行光射出，不成像', '#6b7f92');
        }
      }

      return {
        set: set, applyPreset: applyPreset,
        onDown: onDown, onMove: onMove, onUp: onUp,
        update: function (dt) {
          flick += dt;
          if (flash > 0) flash -= dt;
        },
        hint: hint,
        info: info,
        draw: function (gg, W, H) {
          initPos();
          gg.save();
          var bg = gg.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, '#f6fafe');
          bg.addColorStop(1, '#e3eef8');
          gg.fillStyle = bg;
          gg.fillRect(0, 0, W, H);

          var y0 = benchY;
          /* 光具座导轨 */
          gg.fillStyle = '#8d939b';
          gg.fillRect(40, y0 + 34, W - 80, 8);
          gg.fillStyle = '#6d7780';
          gg.fillRect(40, y0 + 42, W - 80, 4);
          /* 主光轴 */
          gg.save();
          gg.strokeStyle = '#b7c9d8'; gg.lineWidth = 1;
          gg.setLineDash([8, 6]);
          gg.beginPath(); gg.moveTo(30, y0); gg.lineTo(W - 30, y0); gg.stroke();
          gg.restore();

          /* 焦点标记 */
          [[-2 * f, "2F'"], [-f, 'F'], [f, "F'"], [2 * f, '2F']].forEach(function (fp) {
            var x = xSide(fp[0]);
            gg.fillStyle = '#5d6f7e';
            gg.beginPath(); gg.arc(x, y0, 2.6, 0, 7); gg.fill();
            gg.font = '600 11px ' + FONT;
            gg.textAlign = 'center'; gg.textBaseline = 'top';
            gg.fillText(fp[1], x, y0 + 6);
          });

          rayTrace(gg);

          /* 透镜 */
          gg.save();
          gg.strokeStyle = '#2b7fb0'; gg.lineWidth = 3;
          gg.fillStyle = 'rgba(126,200,240,0.28)';
          gg.beginPath();
          gg.ellipse(xLens, y0, 13, 62, 0, 0, 7);
          gg.fill(); gg.stroke();
          gg.restore();
          PHY.tag(gg, xLens - 30, y0 - 98, '凸透镜 f=' + f + 'cm', '#1e9fd8');

          /* 蜡烛 */
          var cx2 = candleX();
          var bodyH = (hObj - 3) * S;
          gg.fillStyle = '#e8e3d8';
          gg.fillRect(cx2 - 5, y0 - bodyH, 10, bodyH);
          gg.fillStyle = '#c9bfa8';
          gg.fillRect(cx2 - 5, y0 - bodyH, 10, 4);
          var fl = 1 + 0.12 * Math.sin(flick * 9) + 0.06 * Math.sin(flick * 23);
          var grd = gg.createRadialGradient(cx2, y0 - bodyH - 8 * fl, 1, cx2, y0 - bodyH - 8 * fl, 14);
          grd.addColorStop(0, 'rgba(255,220,120,0.95)');
          grd.addColorStop(1, 'rgba(255,180,60,0)');
          gg.fillStyle = grd;
          gg.beginPath(); gg.arc(cx2, y0 - bodyH - 8 * fl, 14, 0, 7); gg.fill();
          gg.fillStyle = '#f2a33c';
          gg.beginPath(); gg.ellipse(cx2, y0 - bodyH - 7 * fl, 4, 8 * fl, 0, 0, 7); gg.fill();
          PHY.tag(gg, cx2 - 34, y0 + 12, 'u=' + PHY.fmt(candleCM, 1) + 'cm', '#e2603c');

          /* 光屏 */
          var sx = screenX();
          gg.fillStyle = '#f4f7fa';
          gg.fillRect(sx - 4, y0 - 70, 8, 104);
          gg.strokeStyle = '#8d939b'; gg.lineWidth = 1.5;
          gg.strokeRect(sx - 4, y0 - 70, 8, 104);
          gg.fillStyle = '#9aa7b2';
          gg.fillRect(sx - 12, y0 + 34, 24, 5);
          var img = image();
          var sharp = sharpOnScreen();
          if (img.kind === 'real') {
            var d = Math.abs(screenCM - img.v);
            if (sharp) {
              gg.fillStyle = 'rgba(255,223,158,0.9)';
              gg.beginPath(); gg.ellipse(sx + 0.5, y0 - img.h * S / 2, 6, Math.abs(img.h) * S / 2, 0, 0, 7); gg.fill();
              gg.fillStyle = '#f2a33c';
              gg.beginPath(); gg.ellipse(sx + 0.5, y0 - img.h * S + 8, 4, 8, 0, 0, 7); gg.fill();
            } else {
              var r = PHY.clamp(d * 1.4, 3, 22);
              gg.fillStyle = 'rgba(255,220,140,' + PHY.clamp(0.55 - d * 0.05, 0.08, 0.5) + ')';
              gg.beginPath(); gg.ellipse(sx + 0.5, y0 - img.h * S / 2, r * 0.5, Math.max(r, 4), 0, 0, 7); gg.fill();
            }
          }
          PHY.tag(gg, sx - 24, y0 + 12, '光屏', '#5d6f7e');

          if (flash > 0 && sharp) {
            gg.strokeStyle = 'rgba(46,169,107,' + PHY.clamp(flash, 0, 1) + ')';
            gg.lineWidth = 3;
            gg.strokeRect(sx - 16, y0 - 84, 32, 122);
          }
          gg.restore();
        },

        getU: function () { return candleCM; },
        getV: function () { var img = image(); return img.kind === 'real' || img.kind === 'virtual' ? img.v : null; },
        region: function () { return regionOf(candleCM); },
        imageKind: function () { return image().kind; },
        sharp: sharpOnScreen,
        findings: function () { return findings; },
        getF: function () { return f; },
        __test: {
          setU: function (u) { candleCM = PHY.clamp(u, 6, 78); if (sharpOnScreen()) recordFinding(); },
          setScreenCM: function (v) { screenCM = PHY.clamp(v, 8, 88); if (sharpOnScreen()) recordFinding(); },
          setF: function (v) { f = v; }
        }
      };
    }
  });

  /* ============================================================
   * 2. 光的反射与折射（含全反射）
   * ========================================================== */
  PHY.registerSim({
    id: 'refract',
    name: '光的反射与折射',
    field: 'optics',
    icon: '🔆',
    level: 'both',
    desc: '拖动激光笔改变入射角，观察反射与折射；高中可测玻璃折射率并演示全反射。',
    tip: '拖动激光笔改变入射角；「记录一组数据」用于测折射率。',
    controls: function (inst) {
      return [
        { type: 'select', id: 'mode', label: '光路方向', value: inst.mode(), options: [{ v: 'air2glass', t: '空气 → 玻璃' }, { v: 'glass2air', t: '玻璃 → 空气' }] },
        { type: 'slider', id: 'theta', label: '入射角 θ', min: 5, max: 85, step: 1, value: inst.getTheta(), unit: '°' },
        { type: 'slider', id: 'n', label: '玻璃折射率 n', min: 1.1, max: 2.4, step: 0.05, value: inst.getN() },
        { type: 'sep' },
        { type: 'button', id: 'record', label: '记录一组数据', primary: true },
        { type: 'button', id: 'clearRec', label: '清除数据' },
        { type: 'note', text: '已记录 ' + inst.records().length + ' 组' + (inst.tirTime() > 0.3 ? '　⚠ 正在发生全反射' : '') }
      ];
    },

    create: function (env) {
      var n = 1.5;
      var mode = 'air2glass';      // air2glass | glass2air
      var theta = 40;              // 入射角（度）
      var records = [];
      var drag = false;
      var dwell = {};
      var tirTime = 0;
      var P = { x: 0, y: 0 }, cx, cy, bw, bh, rPx;

      function geom() {
        cx = env.W / 2;
        cy = env.H * 0.52;
        bw = Math.min(300, env.W * 0.32);
        bh = Math.min(190, env.H * 0.34);
        rPx = Math.min(env.W * 0.3, 150);
        P.x = cx;
        P.y = mode === 'air2glass' ? cy - bh / 2 : cy + bh / 2;
      }

      function critical() {
        var a = 1 / n;
        return a >= 1 ? 90 : Math.asin(a) / RAD;
      }
      function refractedAngle(t1deg) {
        if (mode === 'air2glass') return Math.asin(Math.sin(t1deg * RAD) / n) / RAD;
        var s = n * Math.sin(t1deg * RAD);
        return s >= 1 ? null : Math.asin(s) / RAD;
      }
      function tirActive() { return mode === 'glass2air' && refractedAngle(theta) === null; }

      function onDown(x, y) {
        geom();
        var inMedium = mode === 'air2glass' ? y < P.y + 30 : y > P.y - 30;
        if (inMedium && Math.abs(x - P.x) < rPx + 80) drag = true;
      }
      function onMove(x, y) {
        if (!drag) return;
        geom();
        var dx = Math.abs(x - P.x);
        var dy = Math.abs(y - P.y);
        theta = PHY.clamp(Math.atan2(dx, Math.max(6, dy)) / RAD, 5, 85);
        [30, 45, 60].forEach(function (a) {
          if (Math.abs(theta - a) < 1.6) dwell['a' + a] = (dwell['a' + a] || 0) + 0.017;
        });
      }
      function onUp() { drag = false; }

      function set(id, v) {
        if (id === 'n') n = v;
        else if (id === 'mode') { mode = v; dwell = {}; }
      }
      function action(id) {
        if (id === 'record') {
          if (mode !== 'air2glass') { PHY.toast('测折射率要在「空气 → 玻璃」模式下进行'); return; }
          var t2 = refractedAngle(theta);
          var nEst = Math.sin(theta * RAD) / Math.sin(t2 * RAD);
          records.push({ t1: theta, t2: t2, nEst: nEst });
          PHY.log('记录：入射角 ' + PHY.fmt(theta, 1) + '°，折射角 ' + PHY.fmt(t2, 1) + '°，n = sinθ₁/sinθ₂ = ' + PHY.fmt(nEst, 3), '', 'reaction');
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除折射率记录数据。');
        }
      }
      function applyPreset(p) {
        if (!p) return;
        if (p.mode) mode = p.mode;
        if (p.theta) theta = p.theta;
      }

      function meanN() {
        if (!records.length) return null;
        var s = 0;
        records.forEach(function (r) { s += r.nEst; });
        return s / records.length;
      }

      function info() {
        var t2 = refractedAngle(theta);
        var out = ['<dl class="kv">'];
        out.push('<div><dt>模式</dt><dd>' + (mode === 'air2glass' ? '空气 → 玻璃' : '玻璃 → 空气') + '</dd></div>');
        out.push('<div><dt>入射角 θ₁</dt><dd>' + PHY.fmt(theta, 1) + '°</dd></div>');
        out.push('<div><dt>反射角</dt><dd>' + PHY.fmt(theta, 1) + '°（反射角 = 入射角）</dd></div>');
        if (t2 === null) {
          out.push('<div><dt>折射光线</dt><dd><span style="color:#e2603c">无 —— 全反射</span></dd></div>');
          out.push('<div><dt>临界角 C</dt><dd>arcsin(1/n) = ' + PHY.fmt(critical(), 1) + '°</dd></div>');
        } else {
          out.push('<div><dt>折射角 θ₂</dt><dd>' + PHY.fmt(t2, 1) + '°</dd></div>');
        }
        out.push('<div><dt>折射率 n</dt><dd>' + PHY.fmt(n, 2) + '</dd></div>');
        out.push('</dl>');
        if (records.length) {
          out.push('<p style="margin:8px 0 2px"><b>测折射率数据</b></p><div class="chips">');
          records.forEach(function (r, i) {
            out.push('<span class="chip">' + (i + 1) + '：' + PHY.fmt(r.t1, 0) + '°→' + PHY.fmt(r.t2, 1) + '°，n=' + PHY.fmt(r.nEst, 3) + '</span>');
          });
          out.push('</div>');
          out.push('<div class="hint-box">平均值 n̄ = <b>' + PHY.fmt(meanN(), 3) + '</b></div>');
        }
        return out.join('');
      }

      /* 在两个屏幕角之间画弧并标注（角度均为标准 canvas 角，a1 < a2） */
      function arcBetween(gg, a1, a2, colr, label, rr) {
        gg.save();
        gg.strokeStyle = colr; gg.lineWidth = 1.4;
        gg.beginPath();
        gg.arc(P.x, P.y, rr, a1, a2, false);
        gg.stroke();
        gg.fillStyle = colr;
        gg.font = '600 11px ' + FONT;
        gg.textAlign = 'center'; gg.textBaseline = 'middle';
        var mid = (a1 + a2) / 2;
        gg.fillText(label, P.x + Math.cos(mid) * (rr + 22), P.y + Math.sin(mid) * (rr + 22));
        gg.restore();
      }

      function draw(gg, W, H) {
        geom();
        gg.save();
        var bg = gg.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#f7fafd');
        bg.addColorStop(1, '#e2edf6');
        gg.fillStyle = bg;
        gg.fillRect(0, 0, W, H);

        /* 玻璃砖 */
        gg.save();
        gg.fillStyle = 'rgba(126,190,235,0.25)';
        gg.strokeStyle = '#5f9dc7';
        gg.lineWidth = 2;
        gg.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
        gg.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
        gg.fillStyle = '#5f9dc7';
        gg.font = '600 12px ' + FONT;
        gg.textAlign = 'center';
        gg.fillText('玻璃  n = ' + PHY.fmt(n, 2), cx, cy + bh / 2 - 10);
        gg.restore();

        var t1 = theta * RAD;
        var t2 = refractedAngle(theta);
        var tir = t2 === null;
        var L = rPx * 0.92;

        /* 法线 */
        gg.save();
        gg.strokeStyle = '#9aa7b2';
        gg.setLineDash([7, 6]); gg.lineWidth = 1.2;
        gg.beginPath();
        gg.moveTo(P.x, P.y - 118); gg.lineTo(P.x, P.y + 118);
        gg.stroke();
        gg.restore();
        gg.fillStyle = '#9aa7b2';
        gg.font = '600 11px ' + FONT;
        gg.textAlign = 'left';
        gg.fillText('法线', P.x + 6, P.y - 106);

        var down = mode === 'air2glass';   /* 入射介质在上方 */
        /* 入射光线：P → 激光笔（在同侧介质中，法线左侧） */
        var sx2 = P.x - Math.sin(t1) * rPx;
        var sy2 = P.y + (down ? -1 : 1) * Math.cos(t1) * rPx;
        gg.save();
        gg.strokeStyle = '#e2603c'; gg.lineWidth = 2.6;
        gg.beginPath(); gg.moveTo(sx2, sy2); gg.lineTo(P.x, P.y); gg.stroke();
        gg.translate(sx2, sy2);
        gg.rotate(Math.atan2(P.y - sy2, P.x - sx2));
        gg.fillStyle = '#37414c';
        PHY.rr(gg, -32, -7, 34, 14, 5); gg.fill();
        gg.fillStyle = '#e2603c';
        gg.fillRect(0, -3, 5, 6);
        gg.restore();

        /* 反射光线（同侧，法线右侧） */
        var rlx = P.x + Math.sin(t1) * rPx;
        var rly = P.y + (down ? -1 : 1) * Math.cos(t1) * rPx;
        PHY.arrow(gg, P.x, P.y, rlx, rly, tir ? '#e2603c' : 'rgba(226,96,60,0.45)', tir ? 2.6 : 1.6, 8);

        /* 折射光线 */
        if (!tir) {
          var t2r = t2 * RAD;
          var rrx = P.x + Math.sin(t2r) * L;
          var rry = P.y + (down ? 1 : -1) * Math.cos(t2r) * L;
          PHY.arrow(gg, P.x, P.y, rrx, rry, 'rgba(226,96,60,0.75)', 2.2, 8);
        }

        /* 角度弧（标准角：上方 = -π/2，下方 = +π/2） */
        if (down) {
          arcBetween(gg, -Math.PI / 2 - t1, -Math.PI / 2, '#e2603c', 'θ₁=' + PHY.fmt(theta, 0) + '°', 40);
          arcBetween(gg, -Math.PI / 2, -Math.PI / 2 + t1, 'rgba(226,96,60,0.45)', 'θ₁′', 30);
          if (!tir) arcBetween(gg, Math.PI / 2 - t2 * RAD, Math.PI / 2, '#b3542f', 'θ₂=' + PHY.fmt(t2, 0) + '°', 34);
        } else {
          arcBetween(gg, Math.PI / 2, Math.PI / 2 + t1, '#e2603c', 'θ₁=' + PHY.fmt(theta, 0) + '°', 40);
          arcBetween(gg, Math.PI / 2 - t1, Math.PI / 2, 'rgba(226,96,60,0.45)', 'θ₁′', 30);
          if (!tir) arcBetween(gg, -Math.PI / 2, -Math.PI / 2 + t2 * RAD, '#b3542f', 'θ₂=' + PHY.fmt(t2, 0) + '°', 34);
        }

        /* 量角器刻度（入射介质侧） */
        gg.save();
        gg.strokeStyle = 'rgba(138,153,168,0.5)';
        gg.lineWidth = 1;
        for (var a = 10; a <= 80; a += 10) {
          var ar = a * RAD;
          var x1 = P.x - Math.sin(ar) * 48;
          var y1 = P.y + (down ? -1 : 1) * Math.cos(ar) * 48;
          var x2 = P.x - Math.sin(ar) * 58;
          var y2 = P.y + (down ? -1 : 1) * Math.cos(ar) * 58;
          gg.beginPath(); gg.moveTo(x1, y1); gg.lineTo(x2, y2); gg.stroke();
        }
        gg.restore();

        if (tir) {
          gg.fillStyle = '#e2603c';
          gg.font = '700 13px ' + FONT;
          gg.textAlign = 'center';
          gg.fillText('⚠ 全反射：θ₁ > 临界角 ' + PHY.fmt(critical(), 1) + '°，折射光完全消失', cx, P.y + (down ? -1 : 1) * 60);
        }
        gg.restore();
      }

      function update(dt) {
        if (tirActive()) tirTime += dt; else tirTime = 0;
      }

      return {
        set: set, action: action, applyPreset: applyPreset,
        onDown: onDown, onMove: onMove, onUp: onUp,
        update: update,
        info: info,
        draw: draw,
        hint: function () {
          if (tirActive()) return '发生全反射：入射角大于临界角 ' + PHY.fmt(critical(), 1) + '°，只有反射光。';
          if (mode === 'air2glass') return '拖动激光笔改变入射角，观察反射角与折射角随入射角的变化。';
          return '光从玻璃射向空气：入射角增大到临界角 ' + PHY.fmt(critical(), 1) + '° 以上会发生全反射。';
        },
        getTheta: function () { return theta; },
        getN: function () { return n; },
        mode: function () { return mode; },
        records: function () { return records; },
        meanN: meanN,
        criticalAngle: critical,
        tir: tirActive,
        tirTime: function () { return tirTime; },
        dwellTime: function (a) { return dwell['a' + a] || 0; },
        __test: {
          setTheta: function (v) { theta = PHY.clamp(v, 5, 85); },
          setMode: function (m) { mode = m; dwell = {}; },
          setN: function (v) { n = v; },
          record: function () { action('record'); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
