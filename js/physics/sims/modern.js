/* =============================================================================
 * 虚拟实验室 —— 近代物理：光电效应 (js/physics/sims/modern.js)
 * -----------------------------------------------------------------------------
 * 用光电效应测普朗克常量（人教版选择性必修三）：
 *   · 用单色光照射金属板，只有光的频率大于「极限频率 ν₀」才会打出光电子
 *   · 增大光强只让饱和光电流变大，遏止电压 U_c 不变
 *   · 测出不同频率下的遏止电压，作 U_c–ν 图像：直线斜率 = h/e
 *   · 由横轴截距得到极限频率 ν₀，纵轴截距的绝对值就是逸出功 W₀
 *
 * 计算全用真实常数：h = 4.136×10⁻¹⁵ eV·s（即 E(eV) = 4.136 × ν/10¹⁴），
 * 于是 U_c = hν/e − W₀/e，单位正好是伏特。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

  var H_EV = 4.136e-15;          /* eV·s */

  var METALS = {
    cs: { name: '铯 Cs', W: 2.14 },
    na: { name: '钠 Na', W: 2.28 },
    zn: { name: '锌 Zn', W: 4.30 }
  };

  PHY.registerSim({
    id: 'photon',
    name: '光电效应（测普朗克常量）',
    field: 'modern',
    icon: '💡',
    level: 'senior',
    tag: '近代物理',
    desc: '用单色光照射金属板：频率够大才打出光电子；测不同频率下的遏止电压，作 U_c–ν 图求 h。',
    tip: '调光的频率与光强，看有没有光电流；点「测遏止电压」记录一组数据，凑够几组看图像。',

    controls: function (inst) {
      return [
        { type: 'slider', id: 'nu', label: '光的频率 ν', min: 4, max: 15, step: 0.1, value: inst.nu14(), fmt: function (v) { return Number(v).toFixed(1) + '×10¹⁴ Hz'; } },
        { type: 'slider', id: 'inten', label: '光强', min: 5, max: 100, step: 5, value: inst.intensity(), unit: '%' },
        { type: 'select', id: 'metal', label: '金属（阴极）', value: inst.metal(), options: Object.keys(METALS).map(function (k) { return { v: k, t: METALS[k].name + '（W₀=' + METALS[k].W + ' eV）' }; }) },
        { type: 'slider', id: 'U', label: '外加电压 U', min: -5, max: 3, step: 0.05, value: inst.voltage(), unit: 'V' },
        { type: 'sep' },
        { type: 'button', id: 'measure', label: '测遏止电压', primary: true, tip: '自动把电压调到光电流刚好为零' },
        { type: 'button', id: 'record', label: '记录 (ν, U_c)' },
        { type: 'button', id: 'clearRec', label: '清除数据' },
        { type: 'note', text: '当前光电流 ' + PHY.fmt(inst.current(), 2) + ' μA' }
      ];
    },

    create: function (env) {
      var nu14 = 7.5;              /* 频率，单位 10^14 Hz */
      var intensity = 60;          /* % */
      var metal = 'cs';
      var U = 1.0;                 /* 外加电压 V（正 = 加速） */
      var records = [];
      var t = 0, flash = 0;
      var electrons = [];

      function W() { return METALS[metal].W; }
      function nu() { return nu14 * 1e14; }
      function photonE() { return H_EV * nu(); }          /* eV */
      function nu0() { return W() / H_EV / 1e14; }        /* 极限频率（10^14 Hz） */
      function aboveThreshold() { return photonE() > W() + 1e-6; }
      function ekMax() { return aboveThreshold() ? photonE() - W() : 0; }  /* eV */
      function Uc() { return ekMax(); }                   /* 遏止电压的绝对值 V */
      function I_sat() { return aboveThreshold() ? intensity / 100 * 4.0 : 0; }  /* μA */
      function current() {
        if (!aboveThreshold()) return 0;
        var uc = Uc();
        if (U <= -uc - 1e-6) return 0;
        if (U >= 0) return I_sat();
        /* 反向电压下光电流迅速减小，到 −U_c 恰好为零 */
        return I_sat() * (1 - Math.exp(-(U + uc) / 0.22));
      }
      function stopped() { return aboveThreshold() && U <= -Uc() + 1e-6; }

      function set(id, v) {
        if (id === 'nu') {
          nu14 = v;
          if (!aboveThreshold()) PHY.log('光的频率 ' + PHY.fmt(nu14, 1) + '×10¹⁴ Hz 低于' + METALS[metal].name +
            '的极限频率 ' + PHY.fmt(nu0(), 1) + '×10¹⁴ Hz：无论光多强，都打不出光电子。', '', 'warn');
        } else if (id === 'inten') intensity = v;
        else if (id === 'metal') {
          metal = v;
          PHY.log('换用' + METALS[metal].name + '作阴极：逸出功 W₀ = ' + METALS[metal].W +
            ' eV，极限频率 ν₀ = ' + PHY.fmt(nu0(), 1) + '×10¹⁴ Hz。', '', 'info');
        } else if (id === 'U') U = v;
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'measure') {
          if (!aboveThreshold()) { PHY.toast('这个频率低于极限频率，根本打不出光电子，测不到遏止电压。'); return; }
          U = -Uc();
          PHY.log('把电压调到 ' + PHY.fmt(U, 2) + ' V，光电流恰好减小到零，这个电压就是遏止电压 U_c = ' +
            PHY.fmt(Uc(), 2) + ' V。', '', 'reaction');
          /* 电压是被程序改的，控制条上的滑块要跟着走，否则显示的还是旧位置 */
          if (env.syncControls) env.syncControls();
          env.invalidateInfo();
        } else if (id === 'record') {
          if (!aboveThreshold()) { PHY.toast('没有光电子，无法记录数据。'); return; }
          records.push({ nu14: nu14, Uc: Uc(), metal: metal, E: photonE() });
          PHY.log('记录第 ' + records.length + ' 组：ν = ' + PHY.fmt(nu14, 1) + '×10¹⁴ Hz（光子能量 ' +
            PHY.fmt(photonE(), 2) + ' eV）→ U_c = ' + PHY.fmt(Uc(), 2) + ' V。', '', 'reaction');
          var same = records.filter(function (r) { return r.metal === metal; });
          if (same.length >= 3) PHY.log('多组数据可以作 U_c–ν 图像了：如果是一条直线，斜率就是 h/e，横轴截距就是极限频率 ν₀。', '', 'success');
          env.invalidateInfo();
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除数据。', '', 'info');
          env.invalidateInfo();
        }
      }

      /* ---------- 版面（draw 与 update 共用一份，避免两处各算一套） ----------
         右边固定放 U_c–ν 图像面板，左边的光路 + 电路按剩余宽度整体缩放。
         以前光路位置全部写成固定偏移，窄画布上阳极会钻到图像面板里去。 */
      function layout(W, H) {
        var gw = PHY.clamp(W * 0.34, 200, 304);
        var gx = W - gw - 16;
        var sc = PHY.clamp((gx - 26) / 470, 0.5, 1);
        var cy = PHY.clamp(H * 0.40, 150, Math.max(170, H - 190));
        var lampX = 22, lampW = 54 * sc, lampH = 44 * sc;
        var beamX1 = lampX + lampW + 8 * sc;
        var cathX = lampX + 156 * sc;
        var plateW = 12 * sc, plateH = 124 * sc;
        var anodX = cathX + 162 * sc;
        return {
          gw: gw, gx: gx, sc: sc, cy: cy,
          lampX: lampX, lampW: lampW, lampH: lampH, beamX1: beamX1,
          cathX: cathX, plateW: plateW, plateH: plateH, anodX: anodX,
          ammX: (cathX + anodX) / 2,
          ay: cy + plateH / 2 + 54 * sc,
          gap: anodX - cathX - plateW          /* 电子要飞过的距离 */
        };
      }

      function update(dt) {
        t += dt; flash += dt;
        /* 光电子动画 */
        if (aboveThreshold()) {
          var rate = intensity / 100 * 26;
          if (Math.random() < rate * dt) {
            electrons.push({ x: 0, v: 30 + Math.random() * 40 + current() * 6, y: Math.random() });
            if (electrons.length > 60) electrons.shift();
          }
        }
        var acc = current() * 16;
        var gap = layout(env.W, env.H).gap;
        for (var i = electrons.length - 1; i >= 0; i--) {
          electrons[i].x += electrons[i].v * dt * (1 + acc / 30);
          if (electrons[i].x > gap) electrons.splice(i, 1);
        }
      }

      /* 最大动能与 U_c 的关系线：由 U_c 反推 h */
      function fit() {
        var pts = records.filter(function (r) { return r.metal === metal; });
        var n = pts.length;
        if (n < 2) return null;
        var sx = 0, sy = 0, sxx = 0, sxy = 0;
        pts.forEach(function (p) { sx += p.nu14; sy += p.Uc; sxx += p.nu14 * p.nu14; sxy += p.nu14 * p.Uc; });
        var den = n * sxx - sx * sx;
        if (Math.abs(den) < 1e-9) return null;
        var k = (n * sxy - sx * sy) / den;
        var b = (sy - k * sx) / n;
        /* 横轴单位是 10¹⁴ Hz，所以斜率 k 的单位是 V/(10¹⁴Hz)。
           由 e·U_c = hν − W₀ 得 h/e = k × 10⁻¹⁴ (V·s)，于是 h = k × 10⁻¹⁴ × e。
           代入 k ≈ 0.4136 得 h ≈ 4.136×10⁻¹⁵ × 1.602×10⁻¹⁹ ≈ 6.63×10⁻³⁴ J·s。 */
        return { k: k, b: b, nu0: k ? -b / k : 0, n: n, h: k * 1e-14 * 1.602e-19 };
      }

      function drawGraph(gg, x, y, w, h) {
        PHY.panel(gg, x, y, w, h, 'U_c–ν 图像');
        var ox = x + 50, oy = y + h - 40, gw = w - 66, gh = h - 66;
        var nuMax = 16, uMax = 5;
        function px(v) { return ox + PHY.clamp(v / nuMax, 0, 1) * gw; }
        function py(v) { return oy - PHY.clamp(v / uMax, 0, 1) * gh; }
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
        gg.fillText('U_c/V', ox - 42, oy - gh - 12);
        gg.fillText('ν/10¹⁴Hz', ox + gw - 56, oy + 8);
        /* 理论直线：U_c = (h/e)(ν − ν₀) */
        gg.strokeStyle = 'rgba(30,159,216,0.6)'; gg.lineWidth = 1.8; gg.setLineDash([6, 4]);
        gg.beginPath();
        var started = false;
        for (var v = 0; v <= nuMax; v += 0.25) {
          var u = H_EV * v * 1e14 / 1.602e-19 * 1.602e-19 - W();
          u = v * 4.136 - W();       /* 直接用 eV → V */
          if (u < 0) continue;
          var X = px(v), Y = py(Math.min(u, uMax));
          if (!started) { gg.moveTo(X, Y); started = true; } else gg.lineTo(X, Y);
        }
        gg.stroke(); gg.setLineDash([]);
        /* 极限频率竖线 */
        gg.strokeStyle = 'rgba(226,96,60,0.55)'; gg.lineWidth = 1.4; gg.setLineDash([4, 4]);
        gg.beginPath(); gg.moveTo(px(nu0()), oy); gg.lineTo(px(nu0()), oy - gh); gg.stroke();
        gg.setLineDash([]);
        gg.fillStyle = '#e2603c'; gg.font = '10.5px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'bottom';
        gg.fillText('ν₀ = ' + PHY.fmt(nu0(), 1), px(nu0()) + 4, oy - gh + 12);
        /* 数据点 */
        records.filter(function (r) { return r.metal === metal; }).forEach(function (r) {
          gg.beginPath(); gg.arc(px(r.nu14), py(r.Uc), 4, 0, 7);
          gg.fillStyle = '#e2603c'; gg.fill();
          gg.strokeStyle = '#ffffff'; gg.lineWidth = 1.4; gg.stroke();
        });
        /* 当前点 */
        if (aboveThreshold()) {
          gg.beginPath(); gg.arc(px(nu14), py(Uc()), 5.5, 0, 7);
          gg.fillStyle = '#1e9fd8'; gg.fill();
          gg.strokeStyle = '#ffffff'; gg.lineWidth = 1.6; gg.stroke();
        }
        var f = fit();
        if (f) {
          gg.fillStyle = '#2fa96b'; gg.font = '600 11px ' + FONT;
          gg.textAlign = 'left'; gg.textBaseline = 'top';
          gg.fillText('斜率 = h/e ≈ ' + PHY.fmt(f.k, 3) + ' V/(10¹⁴Hz)', ox + 8, oy - gh + 4);
          gg.fillText('⟹ h ≈ ' + PHY.fmt(f.h * 1e34, 2) + '×10⁻³⁴ J·s', ox + 8, oy - gh + 20);
        }
        gg.restore();
      }

      return {
        set: set, action: action, update: update,

        hint: function () {
          if (!aboveThreshold()) return '频率太低：光子能量 ' + PHY.fmt(photonE(), 2) + ' eV 小于逸出功 ' + PHY.fmt(W(), 2) +
            ' eV，打不出光电子（这就是「光电效应有极限频率」）。';
          if (U >= 0) return '有光电流 ' + PHY.fmt(current(), 2) + ' μA。增大光强只让电流变大，遏止电压不变——点「测遏止电压」试试。';
          if (stopped()) return '光电流恰好为零，此时的电压就是遏止电压 U_c = ' + PHY.fmt(Uc(), 2) + ' V。记录一组数据吧。';
          return '反向电压 ' + PHY.fmt(U, 2) + ' V，光电流 ' + PHY.fmt(current(), 2) + ' μA；再加到 −' + PHY.fmt(Uc(), 2) + ' V 就完全截止了。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>光的频率</dt><dd>ν = ' + PHY.fmt(nu14, 1) + '×10¹⁴ Hz</dd></div>');
          out.push('<div><dt>光子能量</dt><dd>E = hν = ' + PHY.fmt(photonE(), 2) + ' eV</dd></div>');
          out.push('<div><dt>光强</dt><dd>' + intensity + ' %</dd></div>');
          out.push('<div><dt>阴极金属</dt><dd>' + METALS[metal].name + '，W₀ = ' + METALS[metal].W + ' eV，ν₀ = ' + PHY.fmt(nu0(), 1) + '×10¹⁴ Hz</dd></div>');
          out.push('<div><dt>能否发生光电效应</dt><dd>' + (aboveThreshold() ? '<span style="color:#2fa96b">能（ν &gt; ν₀）</span>' : '<span style="color:#e2603c">不能（ν &lt; ν₀）</span>') + '</dd></div>');
          out.push('<div><dt>最大初动能</dt><dd>E_k = ' + PHY.fmt(ekMax(), 2) + ' eV</dd></div>');
          out.push('<div><dt>遏止电压</dt><dd>U_c = ' + PHY.fmt(Uc(), 2) + ' V</dd></div>');
          out.push('<div><dt>外加电压</dt><dd>' + PHY.fmt(U, 2) + ' V</dd></div>');
          out.push('<div><dt>光电流</dt><dd>' + PHY.fmt(current(), 2) + ' μA' + (stopped() ? '（已截止）' : '') + '</dd></div>');
          out.push('</dl>');
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>数据记录</b></p><div class="chips">');
            records.forEach(function (r, i) {
              out.push('<span class="chip">' + (i + 1) + '：ν=' + PHY.fmt(r.nu14, 1) + '×10¹⁴Hz U_c=' + PHY.fmt(r.Uc, 2) + 'V</span>');
            });
            out.push('</div>');
            var f = fit();
            if (f) {
              out.push('<div class="hint-box">用 ' + METALS[metal].name + ' 的 ' + f.n + ' 组数据拟合：U_c–ν 是直线，' +
                '斜率 ' + PHY.fmt(f.k, 4) + ' V/(10¹⁴Hz)（= h/e × 10⁻¹⁴），横轴截距 ' + PHY.fmt(f.nu0, 2) +
                '×10¹⁴ Hz 就是极限频率 ν₀。由此算出 <b>h ≈ ' + PHY.fmt(f.h * 1e34, 2) + '×10⁻³⁴ J·s</b>' +
                '（公认值 6.63×10⁻³⁴ J·s）。</div>');
            }
          }
          out.push('<div class="hint-box">结论：<b>E_k = hν − W₀</b>。能否发生光电效应只取决于<b>频率</b>是否大于极限频率；' +
            '<b>光强</b>只影响单位时间的光电子数（饱和光电流），不影响遏止电压。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);

          /* 版面：右边固定放 U_c–ν 图像面板，左边的光路 + 电路按剩余宽度整体缩放 */
          var L = layout(W, H);
          var gw = L.gw, gx = L.gx, sc = L.sc, cy = L.cy;
          var lampX = L.lampX, lampW = L.lampW, lampH = L.lampH, beamX1 = L.beamX1;
          var cathX = L.cathX, plateW = L.plateW, plateH = L.plateH, anodX = L.anodX;
          var ammX = L.ammX, ay = L.ay;

          /* 光源 */
          gg.fillStyle = '#37414c';
          PHY.rr(gg, lampX, cy - lampH / 2, lampW, lampH, 6); gg.fill();
          var hue = PHY.clamp((nu14 - 4) / 11, 0, 1);
          var lightCol = 'hsl(' + Math.round(280 - hue * 250) + ', 85%, 62%)';
          gg.fillStyle = lightCol;
          gg.beginPath(); gg.arc(lampX + lampW, cy, 12 * sc, 0, 7); gg.fill();
          gg.fillStyle = '#3d5a72'; gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'bottom';
          gg.fillText('单色光源', lampX + lampW / 2, cy - lampH / 2 - 6);

          /* 光束 */
          gg.save();
          gg.strokeStyle = lightCol; gg.lineWidth = 2;
          gg.globalAlpha = 0.25 + intensity / 100 * 0.6;
          for (var b = 0; b < 4; b++) {
            var off = (b - 1.5) * 9 * sc;
            gg.beginPath();
            gg.moveTo(beamX1, cy + off);
            gg.lineTo(cathX, cy + off * 1.6);
            gg.stroke();
          }
          gg.restore();

          /* 阴极（金属板） */
          gg.fillStyle = '#9aa7b2'; gg.strokeStyle = '#6d7780'; gg.lineWidth = 1.8;
          PHY.rr(gg, cathX, cy - plateH / 2, plateW, plateH, 3); gg.fill(); gg.stroke();
          gg.fillStyle = '#3d5a72'; gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText('阴极（' + METALS[metal].name + '）', cathX + plateW / 2, cy + plateH / 2 + 6);

          /* 光电子 */
          gg.fillStyle = '#2fa96b';
          electrons.forEach(function (e) {
            var ex = cathX + plateW + e.x * sc;
            var ey = cy - 52 * sc + e.y * 104 * sc;
            if (ex > anodX) return;
            gg.beginPath(); gg.arc(ex, ey, 2.6, 0, 7); gg.fill();
          });

          /* 阳极 */
          gg.fillStyle = '#c9d6e2'; gg.strokeStyle = '#7f8d9b'; gg.lineWidth = 1.8;
          PHY.rr(gg, anodX, cy - plateH / 2, plateW, plateH, 3); gg.fill(); gg.stroke();
          gg.fillStyle = '#3d5a72'; gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText('阳极', anodX + plateW / 2, cy + plateH / 2 + 6);

          /* 电路与电流表 */
          gg.strokeStyle = '#5d6f7e'; gg.lineWidth = 2;
          gg.beginPath();
          gg.moveTo(cathX + plateW / 2, cy + plateH / 2); gg.lineTo(cathX + plateW / 2, ay);
          gg.lineTo(ammX, ay);
          gg.moveTo(anodX + plateW / 2, cy + plateH / 2); gg.lineTo(anodX + plateW / 2, ay);
          gg.lineTo(ammX, ay);
          gg.stroke();
          gg.beginPath(); gg.arc(ammX, ay, 20 * sc, 0, 7);
          gg.fillStyle = '#ffffff'; gg.fill();
          gg.strokeStyle = '#2fa96b'; gg.lineWidth = 2.4; gg.stroke();
          gg.fillStyle = '#2fa96b'; gg.font = '700 13px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText('A', ammX, ay - 1);
          gg.fillStyle = '#3d5a72'; gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText(PHY.fmt(current(), 2) + ' μA', ammX, ay + 22 * sc + 4);
          gg.fillStyle = '#6b7f92';
          gg.fillText('外加电压 U = ' + PHY.fmt(U, 2) + ' V', ammX, ay + 22 * sc + 20);

          /* 结论条 */
          var msg = !aboveThreshold() ? 'ν < ν₀：光子能量小于逸出功，无论光多强都没有光电子——光电效应有极限频率'
            : (stopped() ? '光电流恰好为零：U_c = ' + PHY.fmt(Uc(), 2) + ' V，对应 E_k = eU_c'
              : '有光电流：增大光强只增大电流，遏止电压 U_c = ' + PHY.fmt(Uc(), 2) + ' V 不变');
          gg.fillStyle = !aboveThreshold() ? '#e2603c' : (stopped() ? '#2fa96b' : '#0d76b2');
          gg.font = '700 12.5px ' + FONT;
          gg.textAlign = 'left'; gg.textBaseline = 'top';
          gg.fillText(msg, 22, H - 32);

          drawGraph(gg, gx, 14, gw, Math.min(H - 28, 330));
          gg.restore();
        },

        /* 判定 / 测试接口 */
        nu14: function () { return nu14; },
        intensity: function () { return intensity; },
        metal: function () { return metal; },
        voltage: function () { return U; },
        photonE: photonE,
        workFunction: W,
        nu0: nu0,
        aboveThreshold: aboveThreshold,
        ekMax: ekMax,
        Uc: Uc,
        current: current,
        stopped: stopped,
        records: function () { return records; },
        fit: fit,
        __test: {
          setNu: function (v) { nu14 = v; },
          setIntensity: function (v) { intensity = v; },
          setMetal: function (v) { metal = v; },
          setU: function (v) { U = v; },
          measure: function () { action('measure'); },
          record: function () { action('record'); },
          clearRec: function () { action('clearRec'); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
