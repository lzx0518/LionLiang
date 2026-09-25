/* =============================================================================
 * 虚拟化学实验室 —— 仪器几何计算 (Geometry)
 * -----------------------------------------------------------------------------
 * 每个容器只知道自己的 profile(u)（高度 u 处的内腔半宽）。
 * 本模块对 profile 做数值积分，得到：
 *     高度 u  ->  体积（mL）
 *     体积 mL ->  液面高度 u
 * 再用 profile 采样点生成内腔轮廓，交给渲染层裁剪液体。
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});
  var N = 220;               // 采样段数
  var cache = Object.create(null);

  function tableFor(type) {
    if (cache[type]) return cache[type];
    var app = CHEM.getApp(type);
    if (!app || typeof app.profile !== 'function') return null;
    var H = app.H;
    var hw = new Float64Array(N + 1);
    var cum = new Float64Array(N + 1);
    var i, du = H / N;
    for (i = 0; i <= N; i++) hw[i] = Math.max(0, app.profile(H * i / N));
    var total = 0;
    for (i = 1; i <= N; i++) {
      total += (hw[i - 1] + hw[i]) * du;   // 常数因子 2 已省略，最后归一化
      cum[i] = total;
    }
    var t = { H: H, hw: hw, cum: cum, total: total, capacity: app.capacity || 100, type: type };
    cache[type] = t;
    return t;
  }

  function volumeAt(type, u) {
    var t = tableFor(type);
    if (!t) return 0;
    if (u <= 0) return 0;
    if (u >= t.H) return t.capacity;
    var f = (u / t.H) * N;
    var i = Math.floor(f), fr = f - i;
    if (i >= N) return t.capacity;
    var c = t.cum[i] + (t.cum[i + 1] - t.cum[i]) * fr;
    return t.capacity * (t.total > 0 ? c / t.total : 0);
  }

  /* 满量程对应的总体积（应当等于 capacity） */
  function capacityOf(type) {
    var t = tableFor(type);
    return t ? t.capacity : 0;
  }

  /* 体积 -> 液面高度（二分查找） */
  function levelForVolume(type, ml) {
    var t = tableFor(type);
    if (!t || ml <= 0) return 0;
    if (ml >= t.capacity) return t.H;
    var lo = 0, hi = t.H;
    for (var k = 0; k < 40; k++) {
      var mid = (lo + hi) / 2;
      if (volumeAt(type, mid) < ml) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* 内腔轮廓采样点（局部坐标，原点在底面中心，y 向上） */
  function cavityPoints(type, upToU) {
    var t = tableFor(type);
    if (!t) return [];
    var lim = upToU === undefined ? t.H : Math.max(0, Math.min(t.H, upToU));
    var right = [], i, u;
    var steps = Math.max(8, Math.round(N * (lim / t.H)));
    for (i = 0; i <= steps; i++) {
      u = lim * i / steps;
      var f = (u / t.H) * N;
      var idx = Math.min(N - 1, Math.floor(f)), fr = f - idx;
      var w = t.hw[idx] + (t.hw[idx + 1] - t.hw[idx]) * fr;
      right.push({ x: w, y: u });
    }
    var pts = right.slice();
    for (i = right.length - 1; i >= 0; i--) pts.push({ x: -right[i].x, y: right[i].y });
    return pts;
  }

  /* 把轮廓点写成 canvas 路径（世界坐标；origin 为底面中心） */
  function tracePath(ctx, pts, ox, oy) {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.moveTo(ox + pts[0].x, oy - pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(ox + pts[i].x, oy - pts[i].y);
    ctx.closePath();
  }

  /* 生成"液体填充区域"路径：从底部到 level 的截面 */
  function traceLiquidPath(ctx, type, level, ox, oy) {
    var pts = cavityPoints(type, level);
    tracePath(ctx, pts, ox, oy);
  }

  /* 半径随高度变化的内腔半宽（快取） */
  function halfWidthAt(type, u) {
    var t = tableFor(type);
    if (!t) return 0;
    if (u <= 0 || u >= t.H) return u <= 0 ? t.hw[0] : t.hw[N];
    var f = (u / t.H) * N, i = Math.floor(f), fr = f - i;
    return t.hw[i] + (t.hw[i + 1] - t.hw[i]) * fr;
  }

  CHEM.geometry = {
    tableFor: tableFor,
    volumeAt: volumeAt,
    levelForVolume: levelForVolume,
    capacityOf: capacityOf,
    cavityPoints: cavityPoints,
    tracePath: tracePath,
    traceLiquidPath: traceLiquidPath,
    halfWidthAt: halfWidthAt,
    SAMPLES: N
  };
})(typeof window !== 'undefined' ? window : globalThis);
