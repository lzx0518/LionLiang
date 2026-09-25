/* =============================================================================
 * 虚拟实验室 —— 电学仿真：电路连接与欧姆定律 (js/physics/sims/circuit.js)
 * -----------------------------------------------------------------------------
 * · 从画布顶部的元件栏添加：电源 / 开关 / 小灯泡 / 定值电阻 / 滑动变阻器 /
 *   电流表 / 电压表
 * · 点击元件两端的接线柱、再点另一个接线柱即可连线；点导线两次删除导线
 * · 节点电压法（改进节点法 MNA + 诺顿等效）真正解电路：
 *     电流表内阻 0.05Ω、电压表内阻 100kΩ、电源有内阻 → 表读数真实可信
 * · 支持短路 / 断路判断、灯泡按实际功率发光、滑动变阻器拖动调节
 * · 「记录 U、I」+ 最小二乘拟合 → 测电源电动势 E 与内阻 r（高中）
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = root.PHY || (root.PHY = {});
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

  var PALETTE = [
    { type: 'battery', name: '电源' },
    { type: 'switch', name: '开关' },
    { type: 'bulb', name: '小灯泡' },
    { type: 'resistor', name: '定值电阻' },
    { type: 'rheostat', name: '滑动变阻器' },
    { type: 'ammeter', name: '电流表' },
    { type: 'voltmeter', name: '电压表' }
  ];

  function guid() { return 'c' + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  PHY.registerSim({
    id: 'circuit',
    name: '电路连接与欧姆定律',
    field: 'elec',
    icon: '🔌',
    level: 'both',
    desc: '自由搭建串并联电路，电流表、电压表读数真实可信；高中可测电源电动势与内阻。',
    tip: '点接线柱连线；点开关本体通断；拖动变阻器滑片改变电阻。',

    create: function (env) {
      var comps = [];      // {uid,type,x,y,...}
      var wires = [];      // {id, a:{uid,end}, b:{uid,end}}
      var pending = null;  // 待连线的接线柱 {uid,end}
      var selected = null; // 选中元件 uid
      var selWire = null;  // 上一次点中的导线（再点一次删除）
      var counters = {};
      var records = [];    // {U, I}
      var showFit = false;
      var drag = null;     // {uid, dx, dy} 或 {rheo:uid}
      var hover = null;
      var shortWarned = false;
      var solveT = 0;
      var blink = 0;

      var PALETTE_Y = 12, PALETTE_H = 46, CELL_W = 82;

      function makeComp(type, x, y) {
        counters[type] = (counters[type] || 0) + 1;
        var c = { uid: guid(), type: type, x: x, y: y, no: counters[type] };
        if (type === 'battery') { c.emf = 3; c.r = 0.5; }
        if (type === 'switch') c.closed = false;
        if (type === 'bulb') { c.R = 8; c.ratedU = 3; }
        if (type === 'resistor') c.R = 10;
        if (type === 'rheostat') { c.Rmax = 20; c.frac = 0.5; }
        if (type === 'ammeter') c.R = 0.05;
        if (type === 'voltmeter') c.R = 100000;
        comps.push(c);
        return c;
      }

      function byUid(uid) {
        for (var i = 0; i < comps.length; i++) if (comps[i].uid === uid) return comps[i];
        return null;
      }
      function nameOf(c) {
        var base = { battery: '电源', switch: '开关', bulb: '小灯泡', resistor: '定值电阻', rheostat: '滑动变阻器', ammeter: '电流表', voltmeter: '电压表' }[c.type] || '元件';
        return base + (counters[c.type] > 1 ? c.no : '');
      }
      function termPos(c, end) {
        return { x: c.x + (end === 'A' ? -38 : 38), y: c.y };
      }
      function rheoHandleX(c) { return c.x - 30 + c.frac * 60; }

      /* ---------------- 连通性（并查集） ---------------- */
      function pinKey(uid, end) { return uid + ':' + end; }
      function buildUnion() {
        var parent = {};
        function find(k) {
          if (parent[k] === undefined) { parent[k] = k; return k; }
          while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; }
          return k;
        }
        comps.forEach(function (c) { find(pinKey(c.uid, 'A')); find(pinKey(c.uid, 'B')); });
        wires.forEach(function (w) {
          var ra = find(pinKey(w.a.uid, w.a.end));
          var rb = find(pinKey(w.b.uid, w.b.end));
          if (ra !== rb) parent[ra] = rb;
        });
        return { find: find };
      }

      /* ---------------- 节点电压法（MNA） ---------------- */
      function solve() {
        var U = buildUnion();
        var nodeOf = {}, nodes = [];
        comps.forEach(function (c) {
          ['A', 'B'].forEach(function (e) {
            var k = U.find(pinKey(c.uid, e));
            if (nodeOf[k] === undefined) { nodeOf[k] = nodes.length; nodes.push(k); }
          });
        });
        var N = nodes.length;
        if (!N) return null;
        var G = [], b = [];
        for (var i = 0; i < N; i++) { G.push(new Array(N).fill(0)); b.push(0); }
        function stampR(na, nb, R) {
          if (!isFinite(R) || R <= 0) return;
          var gg = 1 / R;
          G[na][na] += gg; G[nb][nb] += gg;
          G[na][nb] -= gg; G[nb][na] -= gg;
        }
        function compR(c) {
          if (c.type === 'switch') return c.closed ? 0.001 : null;
          if (c.type === 'rheostat') return Math.max(0.2, c.frac * c.Rmax);
          return c.R;
        }
        comps.forEach(function (c) {
          var na = nodeOf[U.find(pinKey(c.uid, 'A'))];
          var nb = nodeOf[U.find(pinKey(c.uid, 'B'))];
          if (c.type === 'battery') {
            var r = Math.max(0.1, c.r);
            stampR(na, nb, r);
            b[nb] += c.emf / r;          /* + 极（B 端）注入 E/r */
            b[na] -= c.emf / r;
          } else {
            var R = compR(c);
            if (R !== null) stampR(na, nb, R);
          }
        });
        for (var k = 0; k < N; k++) G[k][k] += 1e-9;

        /* 高斯消元（列主元） */
        for (var col = 0; col < N; col++) {
          var piv = col;
          for (var r2 = col + 1; r2 < N; r2++) if (Math.abs(G[r2][col]) > Math.abs(G[piv][col])) piv = r2;
          if (Math.abs(G[piv][col]) < 1e-14) continue;
          if (piv !== col) {
            var t = G[piv]; G[piv] = G[col]; G[col] = t;
            var tb = b[piv]; b[piv] = b[col]; b[col] = tb;
          }
          for (var r3 = col + 1; r3 < N; r3++) {
            var f = G[r3][col] / G[col][col];
            if (!f) continue;
            for (var cc = col; cc < N; cc++) G[r3][cc] -= f * G[col][cc];
            b[r3] -= f * b[col];
          }
        }
        var V = new Array(N).fill(0);
        for (var r4 = N - 1; r4 >= 0; r4--) {
          if (Math.abs(G[r4][r4]) < 1e-14) { V[r4] = 0; continue; }
          var s = b[r4];
          for (var cc2 = r4 + 1; cc2 < N; cc2++) s -= G[r4][cc2] * V[cc2];
          V[r4] = s / G[r4][r4];
        }
        /* 元件电压电流 */
        comps.forEach(function (c) {
          var va = V[nodeOf[U.find(pinKey(c.uid, 'A'))]];
          var vb = V[nodeOf[U.find(pinKey(c.uid, 'B'))]];
          c.U = vb - va;
          if (c.type === 'battery') {
            var r = Math.max(0.1, c.r);
            c.I = c.emf / r - (vb - va) / r;   /* 从 + 极流出的电流 */
          } else {
            var R2 = compR(c);
            c.I = R2 ? (va - vb) / R2 : 0;     /* A→B 方向 */
          }
        });
        return V;
      }

      function batteries() { return comps.filter(function (c) { return c.type === 'battery'; }); }
      function mainBattery() { return batteries()[0] || null; }
      function totalI() {
        var s = 0;
        batteries().forEach(function (c) { s += Math.abs(c.I || 0); });
        return s;
      }

      /* ---------------- 最小二乘拟合 U = E − I·r ---------------- */
      function fit() {
        var pts = records.filter(function (p) { return p.I > 0.004 && isFinite(p.U); });
        var n = pts.length;
        if (n < 2) return null;
        var sI = 0, sU = 0, sII = 0, sIU = 0;
        pts.forEach(function (p) { sI += p.I; sU += p.U; sII += p.I * p.I; sIU += p.I * p.U; });
        var den = n * sII - sI * sI;
        if (Math.abs(den) < 1e-9) return null;
        var slope = (n * sIU - sI * sU) / den;
        var inter = (sU - slope * sI) / n;
        return { E: inter, r: -slope, n: n, ok: slope < -0.005 && inter > 0 };
      }

      /* ---------------- 控制条 ---------------- */
      function controlsFor(sel) {
        var list = [];
        list.push({ type: 'button', id: 'clearAll', label: '清空电路', danger: true });
        list.push({ type: 'button', id: 'delSel', label: '删除选中' });
        list.push({ type: 'sep' });
        list.push({ type: 'button', id: 'record', label: '记录一组 U、I', primary: true, tip: '把电压表并在电源两端、电流表串入电路后记录' });
        list.push({ type: 'button', id: 'clearRec', label: '清除数据' });
        list.push({ type: 'button', id: 'toggleFit', label: showFit ? '隐藏 U-I 图' : '显示 U-I 图' });
        if (sel) {
          var c = byUid(sel);
          if (c) {
            list.push({ type: 'sep' });
            if (c.type === 'battery') {
              list.push({ type: 'slider', id: 'emf', label: '电动势 E', min: 0, max: 12, step: 0.5, value: c.emf, unit: 'V' });
              var lv = env.level();
              if (lv === 'senior' || lv === 'all') {
                list.push({ type: 'slider', id: 'batr', label: '内阻 r', min: 0.1, max: 3, step: 0.1, value: c.r, unit: 'Ω' });
              }
            } else if (c.type === 'resistor') {
              list.push({ type: 'slider', id: 'resR', label: '电阻 R', min: 1, max: 50, step: 1, value: c.R, unit: 'Ω' });
            } else if (c.type === 'rheostat') {
              list.push({ type: 'select', id: 'rheoMax', label: '最大阻值', value: String(c.Rmax), options: [{ v: '10', t: '0–10 Ω' }, { v: '20', t: '0–20 Ω' }, { v: '50', t: '0–50 Ω' }] });
            } else if (c.type === 'bulb') {
              list.push({ type: 'note', text: '小灯泡（约 3V）' });
            } else if (c.type === 'ammeter') {
              list.push({ type: 'note', text: '电流表：串联接入电路' });
            } else if (c.type === 'voltmeter') {
              list.push({ type: 'note', text: '电压表：并联在被测元件两端' });
            } else if (c.type === 'switch') {
              list.push({ type: 'note', text: '点击开关本体可以通断' });
            }
          }
        }
        return list;
      }
      function refreshControls() { env.setControls(controlsFor(selected)); }

      function deleteComp(uid) {
        comps = comps.filter(function (c) { return c.uid !== uid; });
        wires = wires.filter(function (w) { return w.a.uid !== uid && w.b.uid !== uid; });
        if (selected === uid) selected = null;
      }

      /* ---------------- 命中检测 ---------------- */
      function paletteCellAt(x, y) {
        if (y < PALETTE_Y || y > PALETTE_Y + PALETTE_H) return -1;
        var i = Math.floor((x - 14) / CELL_W);
        return (i >= 0 && i < PALETTE.length) ? i : -1;
      }
      function trashPos() { return { x: env.W - 34, y: env.H - 34 }; }
      function inTrash(x, y) {
        var t = trashPos();
        return Math.hypot(x - t.x, y - t.y) < 20;
      }
      function compAt(x, y) {
        for (var i = comps.length - 1; i >= 0; i--) {
          var c = comps[i];
          if (Math.abs(x - c.x) < 42 && Math.abs(y - c.y) < 22) return c;
        }
        return null;
      }
      function pinAt(x, y) {
        for (var i = 0; i < comps.length; i++) {
          var c = comps[i];
          var pa = termPos(c, 'A'), pb = termPos(c, 'B');
          if (Math.hypot(x - pa.x, y - pa.y) < 9) return { uid: c.uid, end: 'A' };
          if (Math.hypot(x - pb.x, y - pb.y) < 9) return { uid: c.uid, end: 'B' };
        }
        return null;
      }
      function wirePath(w) {
        var a = byUid(w.a.uid), b = byUid(w.b.uid);
        if (!a || !b) return null;
        var p1 = termPos(a, w.a.end), p2 = termPos(b, w.b.end);
        var mx = (p1.x + p2.x) / 2;
        return [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
      }
      function wireAt(x, y) {
        for (var i = wires.length - 1; i >= 0; i--) {
          var pts = wirePath(wires[i]);
          if (!pts) continue;
          for (var k = 0; k < pts.length - 1; k++) {
            if (PHY.distToSeg(x, y, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y) < 6) return wires[i];
          }
        }
        return null;
      }

      /* ---------------- 交互 ---------------- */
      function set(id, v) {
        var c = selected ? byUid(selected) : null;
        if (id === 'emf' && c && c.type === 'battery') c.emf = v;
        else if (id === 'batr' && c && c.type === 'battery') c.r = Math.max(0.1, v);
        else if (id === 'resR' && c && c.type === 'resistor') c.R = v;
        else if (id === 'rheoMax' && c && c.type === 'rheostat') c.Rmax = Number(v);
      }

      function action(id) {
        if (id === 'clearAll') {
          comps = []; wires = []; records = []; selected = null; pending = null;
          PHY.log('已清空电路。');
        } else if (id === 'delSel') {
          if (selected) {
            var c = byUid(selected);
            if (c) PHY.log('删除了 ' + nameOf(c) + '。');
            deleteComp(selected);
          } else PHY.toast('先点击选中一个元件。');
        } else if (id === 'record') {
          var bat = mainBattery();
          var vm = of('voltmeter')[0];
          var am = of('ammeter')[0];
          var U = vm && isFinite(vm.U) ? Math.abs(vm.U) : (bat ? Math.abs(bat.U) : 0);
          var I = am && isFinite(am.I) ? Math.abs(am.I) : totalI();
          records.push({ U: U, I: I });
          PHY.log('记录第 ' + records.length + ' 组数据：U = ' + PHY.fmt(U, 2) + ' V，I = ' + PHY.fmt(I, 3) + ' A。', '', 'reaction');
        } else if (id === 'clearRec') {
          records = [];
          PHY.log('已清除全部记录数据。');
        } else if (id === 'toggleFit') {
          showFit = !showFit;
        }
        refreshControls();
      }

      function applyPreset(p) {
        if (p && p.emfDefault) {
          var c = makeComp('battery', env.W * 0.5, env.H * 0.6);
          c.emf = p.emfDefault;
          selected = c.uid;
        }
      }

      function onDown(x, y) {
        selWire = null;
        /* 变阻器滑片 */
        for (var i = 0; i < comps.length; i++) {
          var c = comps[i];
          if (c.type === 'rheostat' && Math.abs(y - (c.y - 20)) < 11 && Math.abs(x - rheoHandleX(c)) < 11) {
            drag = { rheo: c.uid };
            return;
          }
        }
        /* 接线柱 */
        var pin = pinAt(x, y);
        if (pin) {
          if (pending && pending.uid === pin.uid && pending.end === pin.end) { pending = null; return; }
          if (!pending) { pending = pin; PHY.toast('再点另一个接线柱完成连线'); return; }
          wires.push({ id: guid(), a: pending, b: pin });
          PHY.log('用导线连接了两个接线柱。');
          pending = null;
          return;
        }
        /* 元件栏 */
        var pi = paletteCellAt(x, y);
        if (pi >= 0) {
          var nc = makeComp(PALETTE[pi].type, env.W / 2 + (Math.random() * 120 - 60), env.H * 0.55 + (Math.random() * 80 - 40));
          selected = nc.uid;
          PHY.log('放入了 ' + nameOf(nc) + '。');
          refreshControls();
          return;
        }
        /* 垃圾桶 */
        var tc = compAt(x, y);
        if (tc && inTrash(x, y)) { deleteComp(tc.uid); refreshControls(); return; }
        /* 元件本体 */
        if (tc) {
          selected = tc.uid;
          if (tc.type === 'switch' && Math.abs(x - tc.x) < 14) {
            tc.closed = !tc.closed;
            PHY.log((tc.closed ? '闭合' : '断开') + '了开关。', '', tc.closed ? 'success' : 'warn');
            drag = null;
          } else {
            drag = { uid: tc.uid, dx: tc.x - x, dy: tc.y - y };
          }
          refreshControls();
          return;
        }
        /* 导线：第一次点提示，再点同一条删除 */
        var w = wireAt(x, y);
        if (w) {
          wires = wires.filter(function (x2) { return x2 !== w; });
          PHY.log('删除了一根导线。');
          return;
        }
        /* 空白 */
        selected = null;
        pending = null;
        refreshControls();
      }

      function onMove(x, y) {
        state.mx = x; state.my = y;
        if (!drag) {
          hover = pinAt(x, y) ? 'pin' : (compAt(x, y) ? 'comp' : (wireAt(x, y) ? 'wire' : (paletteCellAt(x, y) >= 0 ? 'pal' : null)));
          if (env.canvas && env.canvas.style) {
            env.canvas.style.cursor = hover ? (hover === 'comp' ? 'move' : 'pointer') : 'default';
          }
          return;
        }
        if (drag.rheo) {
          var c = byUid(drag.rheo);
          if (c) c.frac = PHY.clamp((x - (c.x - 30)) / 60, 0, 1);
        } else if (drag.uid) {
          var m = byUid(drag.uid);
          if (m) {
            m.x = PHY.clamp(x + drag.dx, 60, env.W - 60);
            m.y = PHY.clamp(y + drag.dy, PALETTE_Y + PALETTE_H + 30, env.H - 30);
          }
        }
      }

      function onUp() { drag = null; }

      /* ---------------- 状态查询 ---------------- */
      function of(type) { return comps.filter(function (c) { return c.type === type; }); }
      function bulbLit() {
        return of('bulb').some(function (c) { return Math.abs(c.I || 0) > 0.01 && Math.abs(c.U || 0) > 0.05; });
      }
      function switchClosed() { return of('switch').length > 0 && of('switch').every(function (c) { return c.closed; }); }
      function shorted() { return batteries().some(function (c) { return Math.abs(c.I || 0) > 2.5; }); }
      function hasLoop() { return batteries().length > 0 && totalI() > 0.005; }

      /* ---------------- 绘制 ---------------- */
      function drawComp(gg, c) {
        var x = c.x, y = c.y;
        gg.save();
        gg.lineWidth = 2;
        gg.strokeStyle = '#22384a';
        gg.fillStyle = '#ffffff';
        /* 两端引线 */
        gg.beginPath();
        gg.moveTo(x - 38, y); gg.lineTo(x - 22, y);
        gg.moveTo(x + 22, y); gg.lineTo(x + 38, y);
        gg.stroke();
        if (c.type === 'battery') {
          /* 长板 = 正极（右侧） */
          gg.beginPath();
          gg.moveTo(x - 10, y - 16); gg.lineTo(x - 10, y + 16);
          gg.moveTo(x + 2, y - 9); gg.lineTo(x + 2, y + 9);
          gg.moveTo(x + 10, y - 16); gg.lineTo(x + 10, y + 16);
          gg.moveTo(x + 18, y - 9); gg.lineTo(x + 18, y + 9);
          gg.stroke();
          gg.fillStyle = '#22384a';
          gg.font = '700 12px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText('+', x + 27, y - 15);
          gg.fillText('−', x - 18, y - 15);
          gg.font = '600 11px ' + FONT;
          gg.fillStyle = '#0f7fbf';
          gg.fillText(PHY.fmt(c.emf, 1) + 'V', x, y + 26);
        } else if (c.type === 'switch') {
          gg.beginPath(); gg.arc(x - 12, y, 3.5, 0, 7); gg.fill();
          gg.beginPath(); gg.arc(x + 12, y, 3.5, 0, 7); gg.fill();
          gg.beginPath();
          gg.moveTo(x - 12, y);
          if (c.closed) gg.lineTo(x + 12, y);
          else gg.lineTo(x + 8, y - 15);
          gg.stroke();
          gg.fillStyle = c.closed ? '#2fa96b' : '#e2603c';
          gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText(c.closed ? '闭合' : '断开', x, y + 24);
        } else if (c.type === 'bulb') {
          var p = Math.abs((c.U || 0) * (c.I || 0));
          var k = PHY.clamp(Math.sqrt(p / 1.1), 0, 1.4);
          if (k > 0.05) {
            var grd = gg.createRadialGradient(x, y, 2, x, y, 16 + 26 * k);
            grd.addColorStop(0, 'rgba(255,214,90,' + (0.85 * Math.min(1, k)) + ')');
            grd.addColorStop(1, 'rgba(255,214,90,0)');
            gg.fillStyle = grd;
            gg.beginPath(); gg.arc(x, y, 16 + 26 * k, 0, 7); gg.fill();
          }
          gg.beginPath(); gg.arc(x, y, 13, 0, 7);
          gg.fillStyle = k > 0.05 ? ('rgba(255,236,170,' + (0.35 + 0.55 * Math.min(1, k)) + ')') : '#ffffff';
          gg.fill(); gg.stroke();
          gg.beginPath();
          gg.moveTo(x - 5, y + 4); gg.lineTo(x - 2, y - 4); gg.lineTo(x + 2, y + 4); gg.lineTo(x + 5, y - 4);
          gg.stroke();
        } else if (c.type === 'resistor') {
          gg.fillStyle = '#eef4f9';
          gg.fillRect(x - 20, y - 9, 40, 18);
          gg.strokeRect(x - 20, y - 9, 40, 18);
          /* 色环 */
          ['#8a5a2b', '#22262b', '#c0392b'].forEach(function (col, i) {
            gg.fillStyle = col;
            gg.fillRect(x - 14 + i * 10, y - 9, 4, 18);
          });
          gg.fillStyle = '#0f7fbf';
          gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText(c.R + 'Ω', x, y + 24);
        } else if (c.type === 'rheostat') {
          gg.fillStyle = '#eef4f9';
          gg.fillRect(x - 30, y - 8, 60, 16);
          gg.strokeRect(x - 30, y - 8, 60, 16);
          gg.strokeStyle = '#8a99a8'; gg.lineWidth = 3;
          gg.beginPath(); gg.moveTo(x - 30, y - 20); gg.lineTo(x + 30, y - 20); gg.stroke();
          gg.strokeStyle = '#1e9fd8'; gg.fillStyle = '#1e9fd8'; gg.lineWidth = 2;
          var hx = rheoHandleX(c);
          gg.beginPath(); gg.moveTo(hx, y - 14); gg.lineTo(hx, y - 8); gg.stroke();
          gg.beginPath(); gg.arc(hx, y - 20, 6, 0, 7); gg.fill();
          gg.fillStyle = '#0f7fbf';
          gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText(PHY.fmt(Math.max(0.2, c.frac * c.Rmax), 1) + 'Ω', x, y + 24);
        } else {
          /* 电流表 / 电压表 */
          var isA = c.type === 'ammeter';
          gg.beginPath(); gg.arc(x, y, 15, 0, 7);
          gg.fillStyle = '#ffffff'; gg.fill(); gg.stroke();
          gg.strokeStyle = isA ? '#2fa96b' : '#e0a13c';
          gg.lineWidth = 2.5;
          gg.beginPath(); gg.arc(x, y, 15, 0, 7); gg.stroke();
          gg.fillStyle = isA ? '#2fa96b' : '#e0a13c';
          gg.font = '700 14px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText(isA ? 'A' : 'V', x, y - 3);
          gg.font = '600 10px ' + FONT;
          gg.fillStyle = '#22384a';
          var disp = isA ? PHY.fmt(Math.abs(c.I || 0), 3) + 'A' : PHY.fmt(Math.abs(c.U || 0), 2) + 'V';
          gg.fillText(disp, x, y + 26);
        }
        /* 选中虚线框 */
        if (selected === c.uid) {
          gg.strokeStyle = '#1e9fd8'; gg.lineWidth = 1.5;
          gg.setLineDash([4, 3]);
          gg.strokeRect(x - 44, y - 26, 88, 52);
          gg.setLineDash([]);
        }
        /* 接线柱 */
        ['A', 'B'].forEach(function (e) {
          var p = termPos(c, e);
          var isPending = pending && pending.uid === c.uid && pending.end === e;
          gg.beginPath(); gg.arc(p.x, p.y, isPending ? 6.5 + 1.5 * Math.sin(blink * 6) : 5, 0, 7);
          gg.fillStyle = isPending ? '#e0a13c' : '#1e9fd8';
          gg.fill();
          gg.strokeStyle = '#ffffff'; gg.lineWidth = 1.5; gg.stroke();
        });
        gg.restore();
      }

      function drawPalette(gg) {
        gg.save();
        gg.fillStyle = 'rgba(255,255,255,0.94)';
        gg.strokeStyle = '#c3d5e4';
        PHY.rr(gg, 8, PALETTE_Y - 2, PALETTE.length * CELL_W + 12, PALETTE_H, 10);
        gg.fill(); gg.stroke();
        PALETTE.forEach(function (p, i) {
          var cx = 14 + i * CELL_W + CELL_W / 2 - 6;
          var cy = PALETTE_Y + 16;
          var hov = hover === 'pal' && paletteCellAt(state.mx, state.my) === i;
          if (hov) { gg.fillStyle = '#eaf6fd'; gg.fillRect(14 + i * CELL_W, PALETTE_Y, CELL_W - 6, PALETTE_H - 4); }
          gg.strokeStyle = '#22384a'; gg.lineWidth = 2; gg.fillStyle = '#fff';
          var x = cx - 18;
          if (p.type === 'battery') {
            gg.beginPath();
            gg.moveTo(x - 8, cy - 8); gg.lineTo(x - 8, cy + 8);
            gg.moveTo(x - 2, cy - 5); gg.lineTo(x - 2, cy + 5);
            gg.moveTo(x + 4, cy - 8); gg.lineTo(x + 4, cy + 8);
            gg.moveTo(x + 10, cy - 5); gg.lineTo(x + 10, cy + 5);
            gg.stroke();
          } else if (p.type === 'switch') {
            gg.beginPath(); gg.arc(x - 6, cy + 4, 2.5, 0, 7); gg.fill();
            gg.beginPath(); gg.arc(x + 8, cy + 4, 2.5, 0, 7); gg.fill();
            gg.beginPath(); gg.moveTo(x - 6, cy + 4); gg.lineTo(x + 4, cy - 6); gg.stroke();
          } else if (p.type === 'bulb') {
            gg.beginPath(); gg.arc(x, cy, 8, 0, 7); gg.fill(); gg.stroke();
            gg.beginPath(); gg.moveTo(x - 3, cy + 2); gg.lineTo(x + 3, cy - 2); gg.stroke();
          } else if (p.type === 'resistor') {
            gg.strokeRect(x - 9, cy - 5, 18, 10);
          } else if (p.type === 'rheostat') {
            gg.strokeRect(x - 9, cy - 3, 18, 8);
            gg.beginPath(); gg.moveTo(x - 6, cy - 7); gg.lineTo(x + 8, cy - 7); gg.stroke();
          } else {
            var isA = p.type === 'ammeter';
            gg.beginPath(); gg.arc(x, cy, 8, 0, 7); gg.fill(); gg.stroke();
            gg.fillStyle = isA ? '#2fa96b' : '#e0a13c';
            gg.font = '700 10px ' + FONT;
            gg.textAlign = 'center'; gg.textBaseline = 'middle';
            gg.fillText(isA ? 'A' : 'V', x, cy);
          }
          gg.fillStyle = '#3d5a72';
          gg.font = '600 11px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'top';
          gg.fillText(p.name, cx, PALETTE_Y + 30);
        });
        gg.restore();
      }

      var state = { mx: -999, my: -999 };

      function drawFitPlot(gg) {
        if (!showFit || records.length < 2) return;
        var f = fit();
        var px = env.W - 250, py = 76, pw = 216, ph = 190;
        PHY.panel(gg, px, py, pw, ph, 'U-I 图像');
        var ox = px + 34, oy = py + ph - 26, gw = pw - 52, gh = ph - 52;
        var Imax = Math.max(0.2, Math.max.apply(null, records.map(function (p) { return p.I; })) * 1.15);
        var Umax = Math.max(1, Math.max.apply(null, records.map(function (p) { return p.U; })) * 1.15);
        gg.save();
        gg.strokeStyle = '#8a99a8'; gg.lineWidth = 1.5;
        PHY.arrow(gg, ox, oy, ox, oy - gh - 6, '#8a99a8', 1.5, 6);
        PHY.arrow(gg, ox, oy, ox + gw + 6, oy, '#8a99a8', 1.5, 6);
        gg.fillStyle = '#6b7f92'; gg.font = '11px ' + FONT;
        gg.textAlign = 'left'; gg.textBaseline = 'middle';
        gg.fillText('U/V', ox - 26, oy - gh / 2);
        gg.fillText('I/A', ox + gw / 2, oy + 14);
        records.forEach(function (p) {
          var x = ox + p.I / Imax * gw;
          var y = oy - p.U / Umax * gh;
          gg.beginPath(); gg.arc(x, y, 3.5, 0, 7);
          gg.fillStyle = '#1e9fd8'; gg.fill();
        });
        if (f && f.ok) {
          gg.strokeStyle = '#e2603c'; gg.lineWidth = 2; gg.setLineDash([5, 4]);
          var I1 = 0, I2 = Imax;
          var y1 = oy - f.E / Umax * gh;
          var y2 = oy - (f.E - f.r * I2) / Umax * gh;
          gg.beginPath(); gg.moveTo(ox + I1 / Imax * gw, y1); gg.lineTo(ox + I2 / Imax * gw, y2); gg.stroke();
          gg.setLineDash([]);
          gg.fillStyle = '#e2603c';
          gg.textAlign = 'left';
          gg.fillText('E≈' + PHY.fmt(f.E, 2) + 'V  r≈' + PHY.fmt(f.r, 2) + 'Ω', ox + 6, py + 22);
        }
        gg.restore();
      }

      return {
        set: set,
        action: action,
        applyPreset: applyPreset,
        onDown: onDown, onMove: onMove, onUp: onUp,

        update: function (dt) {
          blink += dt;
          solveT += dt;
          if (solveT > 0.12) { solveT = 0; solve(); }
          var bat = mainBattery();
          if (bat && shorted() && !shortWarned) {
            shortWarned = true;
            PHY.log('⚠ 电源被短路！电流过大，请立即断开开关，检查有没有不经过用电器直接回到电源两极的导线。', '', 'warn');
          }
          if (bat && !shorted()) shortWarned = false;
        },

        hint: function () {
          if (!comps.length) return '从上方元件栏点击放入电源、开关、灯泡等元件；点两个接线柱即可连线。';
          var bat = mainBattery();
          if (shorted()) return '⚠ 电源短路！断开开关并检查电路。';
          if (!bat) return '放入电源后才能通电。';
          if (!hasLoop()) return '电路中没有电流：检查开关是否闭合、每个元件是否都接入了回路（断路）。';
          return '通路中：总电流 I = ' + PHY.fmt(totalI(), 3) + ' A。点击开关可通断，拖动变阻器滑片可改变电阻。';
        },

        info: function () {
          var out = [];
          var bat = mainBattery();
          if (bat) {
            var stat = shorted() ? '<span style="color:#e2603c">⚠ 短路</span>'
              : (hasLoop() ? '<span style="color:#2fa96b">通路</span>' : '<span style="color:#6b7f92">断路（无电流）</span>');
            out.push('<dl class="kv">');
            out.push('<div><dt>电源</dt><dd>E = ' + PHY.fmt(bat.emf, 1) + ' V，r = ' + PHY.fmt(bat.r, 1) + ' Ω</dd></div>');
            out.push('<div><dt>总电流</dt><dd>' + PHY.fmt(totalI(), 3) + ' A</dd></div>');
            out.push('<div><dt>端电压</dt><dd>' + PHY.fmt(Math.abs(bat.U), 2) + ' V</dd></div>');
            out.push('<div><dt>状态</dt><dd>' + stat + '</dd></div>');
            out.push('</dl>');
          } else {
            out.push('<p class="muted">还没有电源。从画布上方的元件栏放入。</p>');
          }
          var parts = comps.filter(function (c) { return c.type !== 'battery'; });
          if (parts.length) {
            out.push('<dl class="kv">');
            parts.forEach(function (c) {
              var val = '';
              if (c.type === 'bulb') {
                var p = Math.abs((c.U || 0) * (c.I || 0));
                var br = p < 0.005 ? '不亮' : p < 0.08 ? '微亮' : p < 0.35 ? '较暗' : p < 0.9 ? '较亮' : '很亮';
                val = PHY.fmt(Math.abs(c.U), 2) + ' V · ' + PHY.fmt(Math.abs(c.I), 3) + ' A · ' + br + (p > 1.8 ? '（过载）' : '');
              } else if (c.type === 'resistor') {
                val = PHY.fmt(Math.abs(c.U), 2) + ' V · ' + PHY.fmt(Math.abs(c.I), 3) + ' A · R=' + c.R + 'Ω';
              } else if (c.type === 'rheostat') {
                val = '接入 ' + PHY.fmt(Math.max(0.2, c.frac * c.Rmax), 1) + ' Ω / ' + c.Rmax + ' Ω';
              } else if (c.type === 'switch') {
                val = c.closed ? '闭合' : '断开';
              } else if (c.type === 'ammeter') {
                val = PHY.fmt(Math.abs(c.I), 3) + ' A';
              } else if (c.type === 'voltmeter') {
                val = PHY.fmt(Math.abs(c.U), 2) + ' V';
              }
              out.push('<div><dt>' + nameOf(c) + '</dt><dd>' + val + '</dd></div>');
            });
            out.push('</dl>');
          }
          if (records.length) {
            out.push('<p style="margin:8px 0 2px"><b>记录的数据（U / I）</b></p>');
            var rows = records.map(function (p, i) {
              return '<span class="chip">' + (i + 1) + '：' + PHY.fmt(p.U, 2) + 'V / ' + PHY.fmt(p.I, 3) + 'A</span>';
            }).join('');
            out.push('<div class="chips">' + rows + '</div>');
            var f = fit();
            if (f && f.ok) {
              out.push('<div class="hint-box">U-I 图像是直线：纵轴截距 E ≈ <b>' + PHY.fmt(f.E, 2) + ' V</b>，' +
                '斜率大小 r ≈ <b>' + PHY.fmt(f.r, 2) + ' Ω</b>（n=' + f.n + '）。</div>');
            }
          }
          return out.join('');
        },

        draw: function (gg, W, H) {
          gg.save();
          gg.fillStyle = '#f2f8fc';
          gg.fillRect(0, 0, W, H);
          /* 细点阵背景 */
          gg.fillStyle = 'rgba(30,159,216,0.07)';
          for (var gx = 20; gx < W; gx += 28) {
            for (var gy = 70; gy < H; gy += 28) {
              gg.fillRect(gx, gy, 1.6, 1.6);
            }
          }
          drawPalette(gg);
          /* 导线 */
          wires.forEach(function (w) {
            var pts = wirePath(w);
            if (!pts) return;
            gg.save();
            gg.strokeStyle = '#46607a';
            gg.lineWidth = 2.6;
            gg.lineCap = 'round';
            gg.beginPath();
            gg.moveTo(pts[0].x, pts[0].y);
            for (var i = 1; i < pts.length; i++) gg.lineTo(pts[i].x, pts[i].y);
            gg.stroke();
            gg.restore();
          });
          /* 待连线预览 */
          if (pending) {
            var pc = byUid(pending.uid);
            if (pc) {
              var pp = termPos(pc, pending.end);
              gg.save();
              gg.strokeStyle = '#e0a13c';
              gg.setLineDash([5, 4]); gg.lineWidth = 1.6;
              gg.beginPath(); gg.moveTo(pp.x, pp.y); gg.lineTo(state.mx, state.my); gg.stroke();
              gg.restore();
            }
          }
          /* 元件 */
          comps.forEach(function (c) { drawComp(gg, c); });
          /* 垃圾桶 */
          var t = trashPos();
          gg.save();
          gg.beginPath(); gg.arc(t.x, t.y, 19, 0, 7);
          gg.fillStyle = drag && drag.uid ? '#fdeee9' : '#ffffff';
          gg.fill();
          gg.strokeStyle = drag && drag.uid ? '#e2603c' : '#c3d5e4';
          gg.lineWidth = 1.5; gg.stroke();
          gg.fillStyle = drag && drag.uid ? '#e2603c' : '#8a99a8';
          gg.font = '14px ' + FONT;
          gg.textAlign = 'center'; gg.textBaseline = 'middle';
          gg.fillText('🗑', t.x, t.y);
          gg.restore();
          drawFitPlot(gg);
          gg.restore();
        },

        /* 实验判定 / 测试接口 */
        comps: function () { return comps; },
        count: function (type) { return of(type).length; },
        bulbLit: bulbLit,
        switchClosed: switchClosed,
        shorted: shorted,
        hasLoop: hasLoop,
        totalI: totalI,
        records: function () { return records; },
        fit: fit,
        wireCount: function () { return wires.length; },
        compOf: byUid,

        __test: {
          add: function (type, x, y) { return makeComp(type, x || 300, y || 300); },
          wire: function (u1, e1, u2, e2) { wires.push({ id: guid(), a: { uid: u1, end: e1 }, b: { uid: u2, end: e2 } }); },
          setEMF: function (v) { var b = mainBattery(); if (b) b.emf = v; },
          setR: function (uid, R) { var c = byUid(uid); if (c) c.R = R; },
          setRheo: function (uid, frac) { var c = byUid(uid); if (c) c.frac = frac; },
          toggleSwitch: function () { var s = of('switch')[0]; if (s) s.closed = !s.closed; },
          record: function () { action('record'); },
          clearRecords: function () { records = []; },
          solveNow: function () { return solve(); }
        }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
