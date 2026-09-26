/* =============================================================================
 * 虚拟实验室 —— 力学仿真：力与测量 (js/physics/sims/force.js)
 * -----------------------------------------------------------------------------
 * 1) gravity   探究重力与质量的关系（初中）
 *    · 把不同质量的砝码挂在弹簧测力计下，读出重力 G
 *    · 作 G–m 图像：是一条过原点的直线，斜率就是 g = 9.8 N/kg
 *    · 可切到「月球」，斜率变成 1.6 → 同一个物体重力变小，质量不变
 * 2) friction  探究影响滑动摩擦力大小的因素（初中）
 *    · 弹簧测力计水平匀速拉动木块，读数 = 滑动摩擦力（二力平衡）
 *    · 改变接触面（毛巾 / 木板 / 玻璃）与压力（加砝码）→ 摩擦力变化
 *    · 把木块侧放（接触面积变小）→ 摩擦力不变：与接触面积无关
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

  var PLANETS = {
    earth: { name: '地球', g: 9.8 },
    moon: { name: '月球', g: 1.6 }
  };

  /* 通用：竖直弹簧测力计 */
  function springScale(gg, x, y, w, h, value, maxV, unit, title) {
    gg.save();
    gg.fillStyle = '#f7fbfe'; gg.strokeStyle = '#8a99a8'; gg.lineWidth = 2;
    PHY.rr(gg, x, y, w, h, 6); gg.fill(); gg.stroke();
    /* 刻度 */
    var ox = x + w * 0.30;
    var top = y + 18, bot = y + h - 14;
    gg.strokeStyle = '#b9c6d2'; gg.lineWidth = 1;
    for (var i = 0; i <= 10; i++) {
      var yy = bot - (bot - top) * i / 10;
      var long = i % 2 === 0;
      gg.beginPath();
      gg.moveTo(ox, yy); gg.lineTo(ox + (long ? 13 : 7), yy); gg.stroke();
      if (long) {
        gg.fillStyle = '#8a99a8'; gg.font = '9.5px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'middle';
        gg.fillText(String(Math.round(maxV * i / 10)), ox + 16, yy);
      }
    }
    /* 指针 */
    var frac = PHY.clamp(value / maxV, 0, 1);
    var ny = bot - (bot - top) * frac;
    gg.strokeStyle = '#e2603c'; gg.lineWidth = 2.6;
    gg.beginPath(); gg.moveTo(ox - 12, ny); gg.lineTo(ox + 10, ny); gg.stroke();
    /* 弹簧 */
    gg.strokeStyle = '#9aa7b2'; gg.lineWidth = 1.6;
    gg.beginPath();
    gg.moveTo(ox - 12, top - 6);
    for (var k = 0; k < 12; k++) {
      var yy2 = top - 6 + (ny - top + 6) * k / 12;
      gg.lineTo(ox - 12 + (k % 2 ? 7 : -7), yy2 + (ny - top) / 12 / 2);
    }
    gg.stroke();
    /* 读数 */
    gg.fillStyle = '#e2603c'; gg.font = '700 15px ' + FONT;
    gg.textAlign = 'center'; gg.textBaseline = 'bottom';
    gg.fillText(PHY.fmt(value, value < 10 ? 2 : 1) + ' ' + unit, x + w / 2, y + h + 18);
    if (title) {
      gg.fillStyle = '#3d5a72'; gg.font = '600 11.5px ' + FONT;
      gg.textAlign = 'center'; gg.textBaseline = 'bottom';
      gg.fillText(title, x + w / 2, y - 6);
    }
    gg.restore();
  }

  /* ============================================================
   * 1. 探究重力与质量的关系
   * ========================================================== */
  PHY.registerSim({
    id: 'gravity',
    name: '探究重力与质量的关系',
    field: 'mech',
    icon: '⚖️',
    level: 'junior',
    tag: '力与测量',
    desc: '把不同质量的砝码挂在弹簧测力计下读出重力 G，作 G–m 图像：过原点的直线，斜率就是 g。',
    tip: '调质量滑块，点「记录一组 (m, G)」；换到月球看看斜率变成多少。',

    controls: function (inst) {
      return [
        { type: 'slider', id: 'm', label: '砝码质量 m', min: 0.05, max: 1, step: 0.05, value: inst.getM(), fmt: function (v) { return Number(v).toFixed(2) + ' kg'; } },
        { type: 'select', id: 'planet', label: '所在位置', value: inst.planet(), options: Object.keys(PLANETS).map(function (k) { return { v: k, t: PLANETS[k].name + '（g = ' + PLANETS[k].g + ' N/kg）' }; }) },
        { type: 'sep' },
        { type: 'button', id: 'record', label: '记录一组 (m, G)', primary: true },
        { type: 'button', id: 'clearRec', label: '清除数据' },
        { type: 'note', text: '当前 G = ' + PHY.fmt(inst.getG(), 2) + ' N（已记录 ' + inst.records().length + ' 组）' }
      ];
    },

    create: function (env) {
      var m = 0.2, planet = 'earth';
      var records = [];
      var t = 0;

      function G() { return m * PLANETS[planet].g; }
      function gval() { return PLANETS[planet].g; }

      function set(id, v) {
        if (id === 'm') m = v;
        else if (id === 'planet') {
          planet = v;
          PHY.log('把装置搬到「' + PLANETS[planet].name + '」：g = ' + gval() + ' N/kg。同一个砝码质量不变，重力变了。', '', 'info');
        }
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'record') {
          records.push({ m: m, G: G(), g: gval(), planet: planet });
          PHY.log('记录第 ' + records.length + ' 组：m = ' + PHY.fmt(m, 2) + ' kg，G = ' + PHY.fmt(G(), 2) +
            ' N，G / m = ' + PHY.fmt(G() / m, 2) + ' N/kg。', '', 'reaction');
          if (records.length >= 3) {
            var ratios = records.map(function (r) { return r.G / r.m; });
            var dev = (Math.max.apply(null, ratios) - Math.min.apply(null, ratios)) / ratios[0];
            if (dev < 0.02) PHY.log('各组 G / m 都等于 ' + PHY.fmt(ratios[0], 2) + ' N/kg → 重力与质量成正比，比值为 g。', '', 'success');
          }
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除数据。', '', 'info');
        }
        env.invalidateInfo();
      }
      function update(dt) { t += dt; }

      function drawGraph(gg, x, y, w, h) {
        PHY.panel(gg, x, y, w, h, 'G–m 图像');
        var ox = x + 52, oy = y + h - 36, gw = w - 70, gh = h - 62;
        var mMax = 1.1, gMax = 11;
        function px(v) { return ox + PHY.clamp(v / mMax, 0, 1) * gw; }
        function py(v) { return oy - PHY.clamp(v / gMax, 0, 1) * gh; }
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
        gg.fillText('G/N', ox - 40, oy - gh - 12);
        gg.fillText('m/kg', ox + gw - 34, oy + 8);
        /* 理论直线 */
        gg.strokeStyle = 'rgba(30,159,216,0.6)'; gg.lineWidth = 1.8; gg.setLineDash([6, 4]);
        gg.beginPath(); gg.moveTo(px(0), py(0)); gg.lineTo(px(1.05), py(1.05 * gval())); gg.stroke();
        gg.setLineDash([]);
        /* 数据点 */
        records.filter(function (r) { return r.planet === planet; }).forEach(function (r) {
          gg.beginPath(); gg.arc(px(r.m), py(r.G), 4, 0, 7);
          gg.fillStyle = '#e2603c'; gg.fill();
          gg.strokeStyle = '#ffffff'; gg.lineWidth = 1.4; gg.stroke();
        });
        /* 当前点 */
        gg.beginPath(); gg.arc(px(m), py(G()), 5.5, 0, 7);
        gg.fillStyle = '#1e9fd8'; gg.fill();
        gg.strokeStyle = '#ffffff'; gg.lineWidth = 1.6; gg.stroke();
        gg.fillStyle = '#1e9fd8'; gg.font = '600 11px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'middle';
        gg.fillText(PLANETS[planet].name + '：斜率 = g = ' + gval() + ' N/kg', ox + 10, oy - gh + 12);
        gg.restore();
      }

      return {
        set: set, action: action, update: update,

        hint: function () {
          if (!records.length) return '读一次弹簧测力计，点「记录一组 (m, G)」；改变质量再记录，凑 4~5 组看图像。';
          return '当前 m = ' + PHY.fmt(m, 2) + ' kg，G = ' + PHY.fmt(G(), 2) + ' N，G/m = ' + PHY.fmt(G() / m, 2) + ' N/kg。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>砝码质量</dt><dd>m = ' + PHY.fmt(m, 2) + ' kg（' + PHY.fmt(m * 1000, 0) + ' g）</dd></div>');
          out.push('<div><dt>重力</dt><dd>G = ' + PHY.fmt(G(), 2) + ' N</dd></div>');
          out.push('<div><dt>所在位置</dt><dd>' + PLANETS[planet].name + '（g = ' + gval() + ' N/kg）</dd></div>');
          out.push('<div><dt>G / m</dt><dd>' + PHY.fmt(G() / m, 2) + ' N/kg</dd></div>');
          out.push('</dl>');
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>数据记录</b></p><div class="chips">');
            records.forEach(function (r, i) {
              out.push('<span class="chip">' + (i + 1) + '：m=' + PHY.fmt(r.m, 2) + 'kg G=' + PHY.fmt(r.G, 2) + 'N（' + PLANETS[r.planet].name + '）</span>');
            });
            out.push('</div>');
          }
          out.push('<div class="hint-box">结论：<b>G = m·g</b>，重力与质量成正比；G–m 图像是一条过原点的直线，斜率就是 g。' +
            '质量是物体本身的属性（到哪里都不变），重力随位置（g）改变。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);
          /* 支架 */
          var sx = 96, top = 46, bot = Math.min(H - 90, 400);
          gg.strokeStyle = '#8d939b'; gg.lineWidth = 6;
          gg.beginPath(); gg.moveTo(sx, top); gg.lineTo(sx, bot); gg.stroke();
          gg.fillStyle = '#8d939b';
          gg.fillRect(sx - 58, bot, 116, 9);
          gg.strokeStyle = '#8d939b'; gg.lineWidth = 4;
          gg.beginPath(); gg.moveTo(sx, top + 8); gg.lineTo(sx + 74, top + 8); gg.stroke();
          /* 弹簧测力计：量程要盖得住最大质量（1 kg × g），否则指针会一直顶在满量程上 */
          var maxV = Math.max(2, Math.ceil(gval()));
          var wx = sx + 40, wy = top + 26, ww = 76, wh = Math.min(H - 200, 190);
          springScale(gg, wx, wy, ww, wh, G(), maxV, 'N', '弹簧测力计');
          /* 挂钩 + 砝码 */
          var hookY = wy + wh + 14;
          gg.strokeStyle = '#5d6f7e'; gg.lineWidth = 2;
          gg.beginPath(); gg.moveTo(wx + ww / 2, wy + wh); gg.lineTo(wx + ww / 2, hookY); gg.stroke();
          var bw = 46 + m * 26, bh = 16 + m * 26;
          gg.fillStyle = '#b9c6d2'; gg.strokeStyle = '#7f8d9b'; gg.lineWidth = 1.6;
          PHY.rr(gg, wx + ww / 2 - bw / 2, hookY, bw, bh, 4); gg.fill(); gg.stroke();
          var txt = PHY.fmt(m * 1000, 0) + ' g';
          gg.beginPath(); gg.arc(wx + ww / 2, hookY + bh / 2, 8, 0, 7);
          gg.fillStyle = '#5d6f7e'; gg.fill();
          gg.fillStyle = '#ffffff'; gg.font = '700 8px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText('m', wx + ww / 2, hookY + bh / 2 + 0.5);
          gg.fillStyle = '#3d5a72'; gg.font = '600 11.5px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText(txt, wx + ww / 2, hookY + bh + 6);
          /* 公式 */
          gg.fillStyle = '#0d76b2'; gg.font = '700 13px ' + FONT;
          gg.textAlign = 'left'; gg.textBaseline = 'top';
          gg.fillText('G = m·g = ' + PHY.fmt(m, 2) + ' × ' + gval() + ' = ' + PHY.fmt(G(), 2) + ' N', 24, H - 34);
          drawGraph(gg, 230, 14, W - 246, Math.min(H - 28, 380));
          gg.restore();
        },

        /* 判定 / 测试接口 */
        getM: function () { return m; },
        getG: function () { return G(); },
        g: gval,
        planet: function () { return planet; },
        records: function () { return records; },
        __test: {
          setM: function (v) { m = v; },
          setPlanet: function (v) { planet = v; },
          record: function () { action('record'); },
          clearRec: function () { action('clearRec'); }
        }
      };
    }
  });

  /* ============================================================
   * 2. 探究影响滑动摩擦力大小的因素
   * ========================================================== */
  var SURFACES = {
    towel: { name: '毛巾', mu: 0.50, color: '#f0e2d2', grain: '#dcc6ab' },
    wood: { name: '木板', mu: 0.30, color: '#e6d3b3', grain: '#c9ab7d' },
    glass: { name: '玻璃板', mu: 0.15, color: '#dcecf7', grain: '#b7d5ea' }
  };

  PHY.registerSim({
    id: 'friction',
    name: '探究滑动摩擦力的大小',
    field: 'mech',
    icon: '🪵',
    level: 'junior',
    tag: '力与测量',
    desc: '用弹簧测力计水平匀速拉动木块，读出滑动摩擦力；改变接触面粗糙程度与压力，看看摩擦力怎么变。',
    tip: '选接触面与砝码个数，点「匀速拉动」；换平放 / 侧放看接触面积有没有影响。',

    controls: function (inst) {
      return [
        { type: 'select', id: 'surface', label: '接触面', value: inst.surface(), options: Object.keys(SURFACES).map(function (k) { return { v: k, t: SURFACES[k].name + '（μ=' + SURFACES[k].mu + '）' }; }) },
        { type: 'select', id: 'pose', label: '木块放置', value: inst.pose(), options: [{ v: 'flat', t: '平放（接触面积大）' }, { v: 'side', t: '侧放（接触面积小）' }] },
        { type: 'slider', id: 'nw', label: '木块上的砝码', min: 0, max: 3, step: 1, value: inst.weights(), unit: '个（每个 100 g）' },
        { type: 'sep' },
        { type: 'button', id: 'pull', label: '匀速拉动', primary: true },
        { type: 'button', id: 'record', label: '记录读数' },
        { type: 'button', id: 'clearRec', label: '清除记录' },
        { type: 'note', text: '当前摩擦力 f = ' + PHY.fmt(inst.friction(), 2) + ' N，正压力 N = ' + PHY.fmt(inst.normal(), 2) + ' N' }
      ];
    },

    create: function (env) {
      var surface = 'towel', pose = 'flat', nw = 0;
      var M_BLOCK = 0.2, M_WEIGHT = 0.1, G = 9.8;
      var records = [];
      var pulling = false, pos = 0, pullT = 0;
      var measured = false;       /* 拉过之后读数就"停住"，否则拉力一撤指针回零、和记录里的数对不上 */
      var t = 0;

      function normal() { return (M_BLOCK + nw * M_WEIGHT) * G; }
      function friction() { return SURFACES[surface].mu * normal(); }
      function readF() { return (pulling || measured) ? friction() : 0; }

      function set(id, v) {
        if (id === 'surface') surface = v;
        else if (id === 'pose') pose = v;
        else if (id === 'nw') nw = Number(v);
        pulling = false; pos = 0; pullT = 0; measured = false;
        env.invalidateInfo();
      }
      function action(id) {
        if (id === 'pull') {
          pulling = true; pullT = 0; pos = 0; measured = true;
          PHY.log('用弹簧测力计沿水平方向匀速拉动木块（接触面：' + SURFACES[surface].name + '，压力 ' +
            PHY.fmt(normal(), 2) + ' N）：读数 f = ' + PHY.fmt(friction(), 2) + ' N。木块做匀速直线运动，' +
            '拉力与滑动摩擦力二力平衡，所以摩擦力就是 ' + PHY.fmt(friction(), 2) + ' N。', '', 'reaction');
        } else if (id === 'record') {
          records.push({ surface: surface, pose: pose, nw: nw, f: friction(), N: normal() });
          PHY.log('记录第 ' + records.length + ' 组：' + SURFACES[surface].name + '、' + (pose === 'flat' ? '平放' : '侧放') +
            '、砝码 ' + nw + ' 个（压力 ' + PHY.fmt(normal(), 2) + ' N）→ f = ' + PHY.fmt(friction(), 2) + ' N。', '', 'reaction');
          /* 结论提示 */
          if (records.length >= 2) {
            var a = records[records.length - 2], b = records[records.length - 1];
            if (a.surface === b.surface && a.nw !== b.nw) {
              PHY.log('接触面相同、压力变大 → 摩擦力变大：接触面越粗糙、压力越大，滑动摩擦力越大。', '', 'info');
            } else if (a.surface === b.surface && Math.abs(a.nw - b.nw) < 0.01 && a.pose !== b.pose && Math.abs(a.f - b.f) < 0.01) {
              PHY.log('' + (a.pose === 'flat' ? '平放' : '侧放') + '与' + (b.pose === 'flat' ? '平放' : '侧放') + '的摩擦力相同（都是 ' + PHY.fmt(b.f, 2) +
                ' N）→ 滑动摩擦力与接触面积无关。', '', 'success');
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
        if (pulling) {
          pullT += dt;
          pos += dt * 46;
          if (pullT > 2.6) { pulling = false; }
        }
      }

      function drawSurface(gg, x, y, w, h) {
        var S = SURFACES[surface];
        gg.save();
        gg.fillStyle = S.color;
        PHY.rr(gg, x, y, w, h, 5); gg.fill();
        gg.strokeStyle = '#93a3b3'; gg.lineWidth = 1.6;
        PHY.rr(gg, x, y, w, h, 5); gg.stroke();
        gg.strokeStyle = S.grain; gg.lineWidth = 1;
        if (surface === 'towel') {
          for (var i = 0; i < 46; i++) {
            var gx = x + 8 + (i * 37 % (w - 16)), gy = y + 6 + (i * 53 % (h - 12));
            gg.beginPath(); gg.arc(gx, gy, 2.2, 0, 7); gg.stroke();
          }
        } else if (surface === 'wood') {
          for (var k = 0; k < 9; k++) {
            var ly = y + 6 + k * (h - 12) / 8;
            gg.beginPath(); gg.moveTo(x + 6, ly); gg.lineTo(x + w - 6, ly); gg.stroke();
          }
        } else {
          gg.strokeStyle = 'rgba(255,255,255,0.9)'; gg.lineWidth = 2;
          gg.beginPath(); gg.moveTo(x + 12, y + h - 8); gg.lineTo(x + w * 0.42, y + 12); gg.stroke();
        }
        gg.restore();
      }

      return {
        set: set, action: action, update: update,

        hint: function () {
          if (!pulling && !records.length) return '选好接触面与砝码个数，点「匀速拉动」让木块匀速滑动，这时测力计读数才等于滑动摩擦力。';
          if (pulling) return '正在匀速拉动……读数稳定在 ' + PHY.fmt(friction(), 2) + ' N，这就是此时的滑动摩擦力。';
          return '读数保持在 ' + PHY.fmt(friction(), 2) + ' N（拉动结束后指针停在读数上）。改变压力或接触面后会重新开始测量。';
        },

        info: function () {
          var out = ['<dl class="kv">'];
          out.push('<div><dt>接触面</dt><dd>' + SURFACES[surface].name + '（μ ≈ ' + SURFACES[surface].mu + '）</dd></div>');
          out.push('<div><dt>木块放置</dt><dd>' + (pose === 'flat' ? '平放（接触面积大）' : '侧放（接触面积小）') + '</dd></div>');
          out.push('<div><dt>砝码个数</dt><dd>' + nw + ' 个（共 ' + PHY.fmt(nw * M_WEIGHT * 1000, 0) + ' g）</dd></div>');
          out.push('<div><dt>压力 N</dt><dd>' + PHY.fmt(normal(), 2) + ' N</dd></div>');
          out.push('<div><dt>滑动摩擦力</dt><dd>' + PHY.fmt(friction(), 2) + ' N' + (pulling ? '（正在匀速拉动）' : '') + '</dd></div>');
          out.push('</dl>');
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>数据记录</b></p><div class="chips">');
            records.forEach(function (r, i) {
              out.push('<span class="chip">' + (i + 1) + '：' + SURFACES[r.surface].name + ' ' + (r.pose === 'flat' ? '平放' : '侧放') +
                ' N=' + PHY.fmt(r.N, 2) + 'N f=' + PHY.fmt(r.f, 2) + 'N</span>');
            });
            out.push('</div>');
          }
          out.push('<div class="hint-box">结论：滑动摩擦力的大小与<b>接触面的粗糙程度</b>和<b>压力</b>有关——' +
            '压力越大、接触面越粗糙，滑动摩擦力越大；与<b>接触面积</b>、拉动速度无关。</div>');
          out.push('<div class="hint-box">为什么必须<b>匀速</b>拉动？只有匀速直线运动时，拉力与滑动摩擦力才是一对平衡力，测力计的读数才等于摩擦力。</div>');
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f6f9fd';
          gg.fillRect(0, 0, W, H);
          /* 导轨铺满宽度（以前封顶 620 px，1000 px 宽的画布只用了 64%），
             下半张画布留给数据面板，别让整个装置挤在上面。 */
          var trackX = 40, trackW = W - 60;
          var trackY = H * 0.50, trackH = 26;
          drawSurface(gg, trackX, trackY, trackW, trackH);

          /* 木块（平放 / 侧放） */
          var blockW = pose === 'flat' ? 92 : 46;
          var blockH = pose === 'flat' ? 40 : 62;
          var bx = trackX + 40 + pos;
          if (bx + blockW > trackX + trackW - 10) { pos = 0; bx = trackX + 40; }
          var by = trackY - blockH;
          gg.fillStyle = '#d9b382'; gg.strokeStyle = '#a8845a'; gg.lineWidth = 2;
          PHY.rr(gg, bx, by, blockW, blockH, 3); gg.fill(); gg.stroke();
          gg.strokeStyle = 'rgba(168,132,90,0.65)'; gg.lineWidth = 1;
          for (var i = 1; i < 3; i++) {
            gg.beginPath(); gg.moveTo(bx + 4, by + blockH * i / 3); gg.lineTo(bx + blockW - 4, by + blockH * i / 3); gg.stroke();
          }
          gg.fillStyle = '#8a6a45'; gg.font = '600 10.5px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText('木块 200 g', bx + blockW / 2, by + blockH / 2);
          /* 木块上的砝码 */
          for (var k = 0; k < nw; k++) {
            var wx2 = bx + 14 + k * 24;
            gg.fillStyle = '#b9c6d2'; gg.strokeStyle = '#7f8d9b'; gg.lineWidth = 1.4;
            PHY.rr(gg, wx2, by - 20, 20, 18, 3); gg.fill(); gg.stroke();
          }
          if (nw) {
            gg.fillStyle = '#3d5a72'; gg.font = '600 10.5px ' + FONT;
            gg.textAlign = 'left'; gg.textBaseline = 'bottom';
            gg.fillText(nw + ' × 100 g', bx + 14 + nw * 24 + 4, by - 6);
          }

          /* 细线与弹簧测力计 */
          var hookY = trackY - blockH / 2 - 6;
          var scaleX = bx + blockW + 16;
          gg.strokeStyle = '#5d6f7e'; gg.lineWidth = 1.6;
          gg.beginPath(); gg.moveTo(bx + blockW + 4, hookY); gg.lineTo(scaleX, hookY); gg.stroke();
          springScale(gg, scaleX, hookY - 26, 66, Math.min(H * 0.4, 150), readF(), 4, 'N', '弹簧测力计');

          /* 拉动箭头 */
          if (pulling && readF() > 0) {
            PHY.arrow(gg, scaleX + 78, hookY, scaleX + 132, hookY, '#2fa96b', 2.4, 9);
            gg.fillStyle = '#2fa96b'; gg.font = '600 11px ' + FONT;
            gg.textAlign = 'left'; gg.textBaseline = 'middle';
            gg.fillText('匀速', scaleX + 82, hookY - 14);
          }

          /* 底部数据面板：把下半张画布用起来，记录与结论放在同一处 */
          var bTop = trackY + 54, bH = H - bTop - 14;
          if (bH > 56) {
            PHY.panel(gg, 24, bTop, W - 48, bH, '数据记录');
            gg.textBaseline = 'middle'; gg.textAlign = 'left';
            if (!records.length) {
              gg.fillStyle = '#6b7f92'; gg.font = '12px ' + FONT;
              gg.textAlign = 'center';
              gg.fillText('选好接触面与砝码个数，点「匀速拉动」再「记录一组」；换接触面、换压力、换放置方式各做几次。',
                W / 2, bTop + bH / 2);
            } else {
              gg.font = '11.5px ' + FONT;
              gg.fillStyle = '#3d5a72';
              gg.fillText('接触面　放置　砝码 → 压力 N、滑动摩擦力 f', 40, bTop + 38);
              records.slice(0, 6).forEach(function (r, i) {
                gg.fillStyle = '#6b7f92';
                gg.fillText((i + 1) + '. ' + SURFACES[r.surface].name + '　' +
                  (r.pose === 'flat' ? '平放' : '侧放') + '　' + r.nw + ' 个（' + r.nw * 100 + ' g）　→　N = ' +
                  PHY.fmt(r.N, 2) + ' N，f = ' + PHY.fmt(r.f, 2) + ' N', 40, bTop + 60 + i * 20);
              });
              if (bH > 150) {
                gg.fillStyle = '#2fa96b'; gg.font = '700 12.5px ' + FONT;
                gg.fillText('接触面越粗糙、压力越大 → 滑动摩擦力越大；接触面积（平放 / 侧放）不影响 f。',
                  40, bTop + bH - 16);
              }
            }
          }
          /* 当前读数条 */
          gg.fillStyle = '#3d5a72'; gg.font = '600 12px ' + FONT;
          gg.textAlign = 'left'; gg.textBaseline = 'top';
          gg.fillText('f = μ·N = ' + SURFACES[surface].mu + ' × ' + PHY.fmt(normal(), 2) + ' = ' + PHY.fmt(friction(), 2) + ' N' +
            (pose === 'side' ? '　（侧放：接触面积变小，f 不变）' : ''), 24, trackY + 34);
          gg.restore();
        },

        /* 判定 / 测试接口 */
        surface: function () { return surface; },
        pose: function () { return pose; },
        weights: function () { return nw; },
        normal: normal,
        friction: friction,
        readF: readF,
        isPulling: function () { return pulling; },
        records: function () { return records; },
        mu: function () { return SURFACES[surface].mu; },
        __test: {
          setSurface: function (v) { set('surface', v); },
          setPose: function (v) { set('pose', v); },
          setWeights: function (v) { set('nw', v); },
          pull: function () { action('pull'); },
          stop: function () { pulling = false; },
          record: function () { action('record'); },
          clearRec: function () { action('clearRec'); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
