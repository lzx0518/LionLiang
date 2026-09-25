/* =============================================================================
 * 虚拟化学实验室 —— 渲染层 (Renderer)
 * -----------------------------------------------------------------------------
 * 坐标：场景坐标（scene）y 轴向下，原点在左上角，尺寸 CHEM.SCENE。
 *   仪器的 (x, y) 是"底面中心"在场景中的位置。
 *   画某台仪器时切换到它的局部坐标：translate(x,y) + scale(1,-1)，
 *   于是局部 x 向右、y 向上，原点在底面中心，仪器高为 apparatus.H。
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});
  var G = CHEM.geometry;

  var WALL = 2.4;          // 玻璃壁厚（局部单位）
  var GLASS_HI = 'rgba(255,255,255,0.75)';
  var GLASS_LO = 'rgba(150,186,212,0.20)';

  /* 各仪器绘制层级 */
  var Z = {
    ironStand: 1, testTubeRack: 2, tripod: 2, funnel: 1,
    asbestosNet: 3, alcoholLamp: 3, deliveryTube: 9
  };

  /* 取内腔右半边轮廓点 */
  function rightSide(type, u0, u1, steps) {
    steps = steps || 56;
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var u = u0 + (u1 - u0) * i / steps;
      pts.push({ x: G.halfWidthAt(type, u), y: u });
    }
    return pts;
  }

  /* 绘制一段"从 u0 到 u1"的内腔截面路径 */
  function slabPath(ctx, type, u0, u1) {
    var r = rightSide(type, u0, u1, 48);
    ctx.beginPath();
    ctx.moveTo(r[0].x, r[0].y);
    for (var i = 1; i < r.length; i++) ctx.lineTo(r[i].x, r[i].y);
    for (var j = r.length - 1; j >= 0; j--) ctx.lineTo(-r[j].x, r[j].y);
    ctx.closePath();
  }

  /* 内腔整体路径 */
  function cavityPath(ctx, type) {
    var r = rightSide(type, 0, CHEM.getApp(type).H, 90);
    ctx.beginPath();
    ctx.moveTo(r[0].x, r[0].y);
    for (var i = 1; i < r.length; i++) ctx.lineTo(r[i].x, r[i].y);
    for (var j = r.length - 1; j >= 0; j--) ctx.lineTo(-r[j].x, r[j].y);
    ctx.closePath();
    return r;
  }

  /* 玻璃外壳路径（内腔外扩 WALL） */
  function shellPath(ctx, type, H) {
    var r = rightSide(type, 0, H, 90);
    ctx.beginPath();
    ctx.moveTo(r[0].x + WALL, r[0].y);
    for (var i = 1; i < r.length; i++) ctx.lineTo(r[i].x + WALL, r[i].y);
    ctx.lineTo(r[r.length - 1].x + WALL, H);
    ctx.lineTo(-(r[r.length - 1].x + WALL), H);
    for (var j = r.length - 1; j >= 0; j--) ctx.lineTo(-(r[j].x + WALL), r[j].y);
    ctx.closePath();
    return r;
  }

  /* "环形"路径：外轮廓 + 内轮廓两个子路径，配合 fill('evenodd') 只填充器壁，
     中间是真正的空洞。这样玻璃器皿才像"空心玻璃"，而不是一块半透明色块。 */
  function profileRing(ctx, pts, H, wall) {
    var v = pts.length - 1;
    ctx.beginPath();
    /* 外轮廓 */
    ctx.moveTo(pts[0].x + wall, pts[0].y);
    for (var i = 1; i <= v; i++) ctx.lineTo(pts[i].x + wall, pts[i].y);
    ctx.lineTo(-(pts[v].x + wall), H);
    for (var j = v; j >= 0; j--) ctx.lineTo(-(pts[j].x + wall), pts[j].y);
    ctx.closePath();
    /* 内轮廓 */
    ctx.moveTo(-pts[0].x, pts[0].y);
    for (var k = 0; k <= v; k++) ctx.lineTo(-pts[k].x, pts[k].y);
    ctx.lineTo(pts[v].x, H);
    for (var m = v; m >= 0; m--) ctx.lineTo(pts[m].x, pts[m].y);
    ctx.closePath();
  }

  function ringPath(ctx, type, H, wall) {
    var r = rightSide(type, 0, H, 72);
    profileRing(ctx, r, H, wall);
    return r;
  }

  /* 由任意 profile 函数生成采样点，供没有注册到仪器库的图形使用 */
  function sampleProfile(fn, H, steps) {
    var pts = [];
    for (var i = 0; i <= (steps || 60); i++) {
      var u = H * i / (steps || 60);
      pts.push({ x: Math.max(0.6, fn(u)), y: u });
    }
    return pts;
  }

  var GLASS_EDGE = 'rgba(44,84,116,0.62)';       // 玻璃轮廓线
  var GLASS_INNER = 'rgba(255,255,255,0.72)';    // 内壁反光
  /* 方程式卡片的字体：卡片画在屏幕空间，所以字号是固定的像素值，不随缩放变化 */
  var BADGE_FONT = '600 12.5px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';

  function glassStroke(ctx, type, H) {
    ctx.save();
    /* 1) 极淡的整体底色：让空的部分也有"玻璃感"，但绝不吃掉内容物 */
    cavityPath(ctx, type);
    ctx.fillStyle = 'rgba(208,229,246,0.16)';
    ctx.fill();

    /* 2) 器壁本身：明确的厚度 + 左右明暗，把轮廓从背景里拉出来 */
    ringPath(ctx, type, H, WALL);
    var g = ctx.createLinearGradient(-46, 0, 46, 0);
    g.addColorStop(0, 'rgba(150,186,212,0.92)');
    g.addColorStop(0.16, 'rgba(226,241,252,0.88)');
    g.addColorStop(0.34, 'rgba(252,254,255,0.82)');
    g.addColorStop(0.62, 'rgba(206,229,246,0.78)');
    g.addColorStop(0.86, 'rgba(168,201,225,0.86)');
    g.addColorStop(1, 'rgba(132,171,200,0.94)');
    ctx.fillStyle = g;
    ctx.fill('evenodd');

    /* 3) 轮廓线：这是"看得清"的关键 */
    ctx.lineJoin = 'round';
    ctx.strokeStyle = GLASS_EDGE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /* 高光条 + 液面亮线 */
  function glassHighlight(ctx, type, H, level) {
    ctx.save();
    cavityPath(ctx, type);
    ctx.clip();
    var hw = G.halfWidthAt(type, H * 0.6) + WALL;
    var hg = ctx.createLinearGradient(-hw, 0, 0, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(0.55, 'rgba(255,255,255,0.62)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.78, H * 0.05);
    ctx.lineTo(-hw * 0.50, H * 0.05);
    ctx.lineTo(-hw * 0.30, H);
    ctx.lineTo(-hw * 0.58, H);
    ctx.closePath();
    ctx.fill();
    /* 右侧一道细的反光，让圆柱体有体积感 */
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillRect(hw * 0.42, H * 0.06, 1.8, H * 0.86);
    if (level > 2) {
      /* 液面亮线 */
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var w = G.halfWidthAt(type, level);
      ctx.moveTo(-w + 0.5, level); ctx.lineTo(w - 0.5, level);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 台面上的接地阴影：让每一件器皿都"站"在台面上，而不是浮在背景里 */
  function groundShadow(ctx, x, y, rx, alpha) {
    var r = rx * 1.9;
    var g = ctx.createRadialGradient(x, y + 3, 1, x, y + 3, r);
    g.addColorStop(0, 'rgba(12,28,44,' + (alpha === undefined ? 0.34 : alpha) + ')');
    g.addColorStop(0.55, 'rgba(12,28,44,' + (alpha === undefined ? 0.16 : alpha * 0.47) + ')');
    g.addColorStop(1, 'rgba(12,28,44,0)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + 3, r, Math.max(5, rx * 0.42), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  CHEM.groundShadow = groundShadow;

  /* =========================================================================
   * 各仪器的"玻璃 / 外形"绘制
   * ====================================================================== */
  var SHAPES = {};

  SHAPES.testTube = function (ctx, a, c) {
    var H = a.H;
    var level = c ? G.levelForVolume(c.type, c.liquidVolume()) : 0;
    glassStroke(ctx, 'testTube', H);
    glassHighlight(ctx, 'testTube', H, level);
    /* 管口卷边 */
    ctx.strokeStyle = 'rgba(210,232,246,0.95)';
    ctx.lineWidth = 2.6;
    var hw = G.halfWidthAt('testTube', H) + WALL;
    ctx.beginPath(); ctx.moveTo(-hw, H); ctx.lineTo(hw, H); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-hw + 1, H - 2.2); ctx.lineTo(hw - 1, H - 2.2); ctx.stroke();
  };

  SHAPES.beakerSmall = function (ctx, a, c) { beaker(ctx, a, c, 30); };
  SHAPES.beakerBig = function (ctx, a, c) { beaker(ctx, a, c, 41.5); };

  function beaker(ctx, a, c, hwTop) {
    var H = a.H;
    var level = c ? G.levelForVolume(c.type, c.liquidVolume()) : 0;
    glassStroke(ctx, a.type, H);
    glassHighlight(ctx, a.type, H, level);
    var hw = G.halfWidthAt(a.type, H) + WALL;
    /* 杯口 + 右侧尖嘴 */
    ctx.strokeStyle = 'rgba(210,232,246,0.95)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-hw, H); ctx.lineTo(hw, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hw, H);
    ctx.quadraticCurveTo(hw + 7, H + 3.5, hw + 11, H - 1.5);
    ctx.stroke();
    /* 刻度线 */
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.9;
    for (var i = 1; i <= 4; i++) {
      var u = H * (0.22 + i * 0.16);
      var w = G.halfWidthAt(a.type, u);
      ctx.beginPath();
      if (i % 2 === 0) { ctx.moveTo(w - 12, u); ctx.lineTo(w - 1, u); }
      else { ctx.moveTo(w - 6, u); ctx.lineTo(w - 1, u); }
      ctx.stroke();
    }
  }

  SHAPES.conicalFlask = function (ctx, a, c) {
    var H = a.H;
    var level = c ? G.levelForVolume(c.type, c.liquidVolume()) : 0;
    glassStroke(ctx, a.type, H);
    glassHighlight(ctx, a.type, H, level);
    var hw = G.halfWidthAt(a.type, H) + WALL;
    ctx.strokeStyle = 'rgba(210,232,246,0.95)';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-hw, H); ctx.lineTo(hw, H); ctx.stroke();
  };

  SHAPES.gasJar = function (ctx, a, c) {
    var H = a.H;
    var level = c ? G.levelForVolume(c.type, c.liquidVolume()) : 0;
    /* 瓶身做成矩形 */
    var hw = 31.5, ow = hw + WALL;
    var r = 4;
    /* 只追加子路径、不重置当前路径，这样外轮廓和内轮廓能组成一个 ring */
    function subRect(x0, y0, x1, y1, rad) {
      ctx.moveTo(x0 + rad, y0);
      ctx.lineTo(x1 - rad, y0);
      ctx.quadraticCurveTo(x1, y0, x1, y0 + rad);
      ctx.lineTo(x1, y1 - rad);
      ctx.quadraticCurveTo(x1, y1, x1 - rad, y1);
      ctx.lineTo(x0 + rad, y1);
      ctx.quadraticCurveTo(x0, y1, x0, y1 - rad);
      ctx.lineTo(x0, y0 + rad);
      ctx.quadraticCurveTo(x0, y0, x0 + rad, y0);
      ctx.closePath();
    }
    var rect = function (x0, y0, x1, y1, rad) { ctx.beginPath(); subRect(x0, y0, x1, y1, rad); };
    /* 瓶壁：外轮廓 + 内轮廓，evenodd 只填器壁，中间保持通透 */
    var gg = ctx.createLinearGradient(-ow, 0, ow, 0);
    gg.addColorStop(0, 'rgba(150,186,212,0.92)');
    gg.addColorStop(0.18, 'rgba(230,243,252,0.88)');
    gg.addColorStop(0.4, 'rgba(252,254,255,0.80)');
    gg.addColorStop(0.7, 'rgba(206,229,246,0.78)');
    gg.addColorStop(1, 'rgba(132,171,200,0.94)');
    ctx.beginPath();
    subRect(-ow, 0, ow, H, r);
    subRect(-hw, 1.6, hw, H - 1.6, Math.max(1, r - 1.4));
    ctx.fillStyle = gg;
    ctx.fill('evenodd');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = GLASS_EDGE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    /* 瓶口卷边 */
    ctx.strokeStyle = 'rgba(44,84,116,0.5)';
    ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(-ow - 1, H); ctx.lineTo(ow + 1, H); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-ow + 1.4, H - 2.2); ctx.lineTo(ow - 1.4, H - 2.2); ctx.stroke();
    /* 内壁高光与液面 */
    ctx.save();
    rect(-hw, 1.6, hw, H - 1.6, Math.max(1, r - 1.4));
    ctx.clip();
    var hgl = ctx.createLinearGradient(-hw, 0, 0, 0);
    hgl.addColorStop(0, 'rgba(255,255,255,0)');
    hgl.addColorStop(0.6, 'rgba(255,255,255,0.55)');
    hgl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hgl;
    ctx.fillRect(-hw + 2, 2, 5.5, H - 4);
    if (level > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-hw + 1, level); ctx.lineTo(hw - 1, level); ctx.stroke();
    }
    ctx.restore();
  };

  /* 蒸发皿是瓷质（不是玻璃！）：不透明白瓷，壁厚且带釉面高光 */
  SHAPES.evaporatingDish = function (ctx, a, c) {
    var H = a.H;
    var W = 3.6;                       // 瓷壁比玻璃厚
    var r = rightSide(a.type, 0, H, 60);
    var v = r.length - 1;
    var hwOut = r[v].x + W;

    /* 外壁 + 内腔（evenodd 挖空），不透明白瓷 */
    ctx.beginPath();
    ctx.moveTo(r[0].x + W, r[0].y);
    for (var i = 1; i < r.length; i++) ctx.lineTo(r[i].x + W, r[i].y);
    ctx.lineTo(-hwOut, H);
    for (var j = v; j >= 0; j--) ctx.lineTo(-(r[j].x + W), r[j].y);
    ctx.closePath();
    ctx.moveTo(-r[0].x, r[0].y);
    for (var k = 0; k < r.length; k++) ctx.lineTo(-r[k].x, r[k].y);
    ctx.lineTo(r[v].x, H);
    for (var m = v; m >= 0; m--) ctx.lineTo(r[m].x, r[m].y);
    ctx.closePath();

    var g = ctx.createLinearGradient(-hwOut, 0, hwOut, 0);
    g.addColorStop(0, '#b9c3cd');
    g.addColorStop(0.14, '#e8edf2');
    g.addColorStop(0.34, '#fdfefe');
    g.addColorStop(0.58, '#eef2f6');
    g.addColorStop(0.82, '#d3dae1');
    g.addColorStop(1, '#aeb9c4');
    ctx.fillStyle = g;
    ctx.fill('evenodd');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(96,110,124,0.65)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    /* 釉面高光：沿碗壁的一道弧光 */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-r[0].x, r[0].y);
    for (var p = 0; p < r.length; p++) ctx.lineTo(-r[p].x, r[p].y);
    ctx.lineTo(r[v].x, H);
    for (var q = v; q >= 0; q--) ctx.lineTo(r[q].x, r[q].y);
    ctx.closePath();
    ctx.clip();
    var hg = ctx.createLinearGradient(-hwOut, 0, 0, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(0.7, 'rgba(255,255,255,0.85)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(-hwOut, 0, hwOut, H);
    ctx.restore();

    /* 口沿：瓷器的标志性白边 */
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-hwOut, H); ctx.lineTo(hwOut, H); ctx.stroke();
    ctx.strokeStyle = 'rgba(96,110,124,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-hwOut, H + 1.6); ctx.lineTo(hwOut, H + 1.6); ctx.stroke();

    /* 底部圈足 */
    ctx.fillStyle = 'rgba(150,161,173,0.75)';
    ctx.beginPath();
    ctx.ellipse(0, 0.8, r[0].x + W * 0.7, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  SHAPES.graduatedCylinder = function (ctx, a, c) {
    var H = a.H;
    var level = c ? G.levelForVolume(c.type, c.liquidVolume()) : 0;
    /* 底座 */
    ctx.fillStyle = 'rgba(200,224,240,0.75)';
    ctx.beginPath();
    ctx.moveTo(-30, 0); ctx.lineTo(30, 0); ctx.lineTo(20, 7); ctx.lineTo(-20, 7); ctx.closePath();
    ctx.fill();
    glassStroke(ctx, a.type, H);
    glassHighlight(ctx, a.type, H, level);
    /* 刻度 */
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 0.9;
    var hw = G.halfWidthAt(a.type, H);
    for (var i = 1; i <= 20; i++) {
      var u = H * (i / 21);
      var len = (i % 5 === 0) ? 11 : 6;
      ctx.beginPath(); ctx.moveTo(hw - len, u); ctx.lineTo(hw - 1, u); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(215,235,248,0.9)';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-hw, H); ctx.lineTo(hw, H); ctx.stroke();
  };

  /* 容量瓶：梨形瓶体 + 细长瓶颈，颈部有一条刻度线 */
  SHAPES.volumetricFlask = function (ctx, a, c) {
    var H = a.H;
    var level = c ? G.levelForVolume(c.type, c.liquidVolume()) : 0;
    glassStroke(ctx, a.type, H);
    glassHighlight(ctx, a.type, H, level);
    var hwNeck = G.halfWidthAt(a.type, H);
    /* 刻度线 */
    var markU = 152;
    var wm = G.halfWidthAt(a.type, markU) + WALL;
    ctx.strokeStyle = 'rgba(190,60,60,0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-wm - 2.5, markU); ctx.lineTo(wm + 2.5, markU); ctx.stroke();
    /* 瓶口卷边 */
    ctx.strokeStyle = 'rgba(44,84,116,0.55)';
    ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(-hwNeck - WALL - 1, H); ctx.lineTo(hwNeck + WALL + 1, H); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-hwNeck - WALL + 1, H - 2.4); ctx.lineTo(hwNeck + WALL - 1, H - 2.4); ctx.stroke();
  };

  /* 燃烧匙：金属勺 + 手柄，也是"空心"画法，中间可以看到里面的药品 */
  SHAPES.combustionSpoon = function (ctx, a, c) {
    var H = a.H;
    var W = 1.8;
    /* 手柄 */
    ctx.strokeStyle = '#7d868f';
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, H - 7); ctx.lineTo(-58, 30); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-9, H - 5.6); ctx.lineTo(-58, 31.4); ctx.stroke();
    /* 勺体 */
    var pts = sampleProfile(function (u) { return u >= 12 ? 11 : 3.5 + 7.5 * (u / 12); }, H, 40);
    profileRing(ctx, pts, H, W);
    var g = ctx.createLinearGradient(-13, 0, 13, 0);
    g.addColorStop(0, '#8e979f');
    g.addColorStop(0.28, '#dfe4e9');
    g.addColorStop(0.5, '#f4f7f9');
    g.addColorStop(0.78, '#c2cad1');
    g.addColorStop(1, '#7f888f');
    ctx.fillStyle = g;
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(70,82,92,0.75)';
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    /* 勺口高光 */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, H, 12, 2.6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  };

  /* 分液漏斗：梨形球体 + 上口塞 + 下端细管与旋塞（内腔由 profile 决定，能盛液体） */
  SHAPES.separatoryFunnel = function (ctx, a, c) {
    var H = a.H;
    var level = c ? G.levelForVolume(c.type, c.liquidVolume()) : 0;
    /* 玻璃主体（细管 + 梨形球 + 颈 + 口） */
    glassStroke(ctx, a.type, H);
    glassHighlight(ctx, a.type, H, level);
    /* 旋塞 */
    ctx.fillStyle = '#9fb0bd';
    ctx.beginPath(); ctx.ellipse(0, 21, 10, 5.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6f7e8a'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#8d9daa';
    ctx.beginPath(); ctx.ellipse(0, 21, 4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    /* 上口与顶塞 */
    ctx.fillStyle = '#c8d3dc';
    roundRect(ctx, -16, H, 32, 11, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(90,105,118,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    /* 装配到别的容器上时，画一小段导流 */
    if (c && c.target) {
      ctx.fillStyle = 'rgba(150,205,240,0.9)';
      ctx.beginPath();
      ctx.arc(0, -4, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* ---------- 装置 ---------- */
  SHAPES.testTubeRack = function (ctx, a) {
    var W = 150, sp = 28;
    ctx.fillStyle = '#8c6a4a';
    roundRect(ctx, -W / 2, 0, W, 8, 2); ctx.fill();
    ctx.fillStyle = '#a07c58';
    roundRect(ctx, -W / 2, 56, W, 12, 3); ctx.fill();
    ctx.fillStyle = '#b08a62';
    roundRect(ctx, -W / 2, 28, W, 9, 2.5); ctx.fill();
    ctx.fillStyle = '#7a5b3e';
    ctx.fillRect(-W / 2 + 3, 8, 8, 50);
    ctx.fillRect(W / 2 - 11, 8, 8, 50);
    /* 孔洞 */
    ctx.fillStyle = 'rgba(60,42,28,0.85)';
    for (var i = 0; i < 5; i++) {
      var x = (i - 2) * sp;
      ellipse(ctx, x, 62, 11, 4); ctx.fill();
      ellipse(ctx, x, 32.5, 10, 3.2); ctx.fill();
    }
  };
  SHAPES.testTubeRackFront = function (ctx) {
    var W = 150;
    ctx.fillStyle = 'rgba(160,124,88,0.98)';
    roundRect(ctx, -W / 2, 56, W, 12, 3); ctx.fill();
    ctx.fillStyle = 'rgba(176,138,98,0.98)';
    roundRect(ctx, -W / 2, 28, W, 9, 2.5); ctx.fill();
  };

  SHAPES.alcoholLamp = function (ctx, a, d) {
    var lit = d && d.lit;
    var t = (CHEM._t || 0);
    /* 灯身 */
    var g = ctx.createLinearGradient(-22, 0, 22, 0);
    g.addColorStop(0, 'rgba(150,195,225,0.85)');
    g.addColorStop(0.35, 'rgba(225,242,252,0.75)');
    g.addColorStop(1, 'rgba(140,185,218,0.85)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(20, 0);
    ctx.quadraticCurveTo(23, 18, 15, 30);
    ctx.lineTo(9, 42);
    ctx.lineTo(-9, 42);
    ctx.lineTo(-15, 30);
    ctx.quadraticCurveTo(-23, 18, -20, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,170,205,0.85)';
    ctx.lineWidth = 1.4; ctx.stroke();
    /* 酒精液面 */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-21, 0); ctx.lineTo(21, 0);
    ctx.quadraticCurveTo(21, 12, 15, 20);
    ctx.lineTo(-15, 20);
    ctx.quadraticCurveTo(-21, 12, -21, 0);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(170,220,245,0.7)';
    ctx.fillRect(-22, 0, 44, 15);
    ctx.restore();
    /* 灯芯管 */
    ctx.fillStyle = '#c9d6df';
    roundRect(ctx, -9, 40, 18, 12, 2); ctx.fill();
    ctx.fillStyle = '#e8eef3';
    roundRect(ctx, -7, 50, 14, 6, 2); ctx.fill();
    ctx.fillStyle = '#c8bda8';
    roundRect(ctx, -3.4, 54, 6.8, 8, 2); ctx.fill();
    /* 火焰 */
    if (lit) {
      var flick = 1 + Math.sin(t * 14) * 0.07 + Math.sin(t * 27) * 0.04;
      var fh = a.flameHeight * flick;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createRadialGradient(0, 62 + fh * 0.35, 1, 0, 62 + fh * 0.35, fh * 0.72);
      fg.addColorStop(0, 'rgba(255,255,220,0.95)');
      fg.addColorStop(0.35, 'rgba(255,205,90,0.85)');
      fg.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(0, 62 + fh);
      ctx.bezierCurveTo(11 * flick, 62 + fh * 0.72, 12, 62 + fh * 0.28, 0, 60);
      ctx.bezierCurveTo(-12, 62 + fh * 0.28, -11 * flick, 62 + fh * 0.72, 0, 62 + fh);
      ctx.closePath();
      ctx.fill();
      /* 内焰 */
      ctx.fillStyle = 'rgba(150,205,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(0, 62 + fh * 0.62);
      ctx.bezierCurveTo(5.5, 62 + fh * 0.45, 6, 62 + fh * 0.2, 0, 61);
      ctx.bezierCurveTo(-6, 62 + fh * 0.2, -5.5, 62 + fh * 0.45, 0, 62 + fh * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      /* 被照亮的效果 */
      ctx.save();
      var lg = ctx.createRadialGradient(0, 66, 4, 0, 66, 130);
      lg.addColorStop(0, 'rgba(255,190,90,0.18)');
      lg.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(0, 66, 130, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  SHAPES.ironStand = function (ctx, a) {
    var H = a.H;
    ctx.fillStyle = '#5d646b';
    roundRect(ctx, -60, 0, 120, 11, 3); ctx.fill();
    ctx.fillStyle = '#6d757d';
    roundRect(ctx, -52, -4, 104, 8, 3); ctx.fill();
    /* 立杆 */
    var g = ctx.createLinearGradient(-46, 0, -34, 0);
    g.addColorStop(0, '#4d545a'); g.addColorStop(0.45, '#9aa3ab'); g.addColorStop(1, '#5a6168');
    ctx.fillStyle = g;
    ctx.fillRect(-46, 0, 12, H);
    /* 铁夹横臂 */
    ctx.fillStyle = '#69717a';
    roundRect(ctx, -40, a.clampY - 5, a.clampReach, 10, 3); ctx.fill();
    /* 铁圈/夹口 */
    ctx.strokeStyle = '#828b93'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(a.clampReach - 40 + 6, a.clampY, 18, -Math.PI * 0.85, Math.PI * 0.25); ctx.stroke();
    ctx.fillStyle = '#565d64';
    roundRect(ctx, -12, a.clampY + 14, 24, 9, 2); ctx.fill();
  };

  SHAPES.asbestosNet = function (ctx, a) {
    var W = a.w || 78;
    ctx.fillStyle = '#6f767d';
    roundRect(ctx, -W / 2, 0, W, 4.5, 1.5); ctx.fill();
    ctx.fillStyle = '#cfd4d8';
    ctx.fillRect(-22, 4.5, 44, 3.6);
    /* 网格纹理 */
    ctx.strokeStyle = 'rgba(90,98,106,0.6)'; ctx.lineWidth = 0.7;
    for (var i = -W / 2 + 6; i < W / 2; i += 8) {
      ctx.beginPath(); ctx.moveTo(i, 0.4); ctx.lineTo(i, 4.2); ctx.stroke();
    }
  };

  SHAPES.tripod = function (ctx, a) {
    var W = a.w || 96;
    ctx.strokeStyle = '#6d757d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-W / 2 + 6, 0); ctx.lineTo(-W / 2 + 16, a.H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 - 6, 0); ctx.lineTo(W / 2 - 16, a.H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2, a.H); ctx.stroke();
    ctx.strokeStyle = '#828b93'; ctx.lineWidth = 3.2;
    ellipse(ctx, 0, a.H, W / 2 - 12, 6);
    ctx.stroke();
  };

  SHAPES.funnel = function (ctx, a) {
    var W = a.w || 88;
    ctx.fillStyle = 'rgba(205,228,244,0.35)';
    ctx.beginPath();
    ctx.moveTo(-W / 2, a.H);
    ctx.lineTo(W / 2, a.H);
    ctx.lineTo(5, a.H - 46);
    ctx.lineTo(5, 0);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-5, a.H - 46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,218,238,0.95)'; ctx.lineWidth = 2;
    ctx.stroke();
  };

  /* ---------- 小工具 ---------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }

  /* =========================================================================
   * 容器内容物绘制
   * ====================================================================== */

  /* 计算液体总量与液面高度 */
  function liquidInfo(c) {
    var total = c.liquidVolume();
    return { level: G.levelForVolume(c.type, total), total: total };
  }

  function colorOf(id) {
    var s = CHEM.getSub(id);
    if (!s) return '#dceaf5';
    if (s.phase === 'solid') return s.dissolveColor || s.color;
    return s.color || '#dceaf5';
  }

  function parseHex(hex) {
    if (!hex || hex.charAt(0) !== '#') return { r: 220, g: 234, b: 245 };
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(c) {
    function f(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + f(c.r) + f(c.g) + f(c.b);
  }
  /* 这个颜色是否"看得出颜色"：无色的溶液不应该把有色溶液冲淡 */
  function isColorful(c) {
    var mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
    return mx > 0 && (mx - mn) / mx > 0.15;
  }

  /* 溶液的颜色：溶质在水中是均匀分布的，所以整段液体共用一个混合色。
     浓度越高颜色越明显；无色溶质（稀盐酸、石灰水等）不参与混色。 */
  function liquidColor(c) {
    var totalMl = Math.max(0.001, c.liquidVolume());
    var accR = 0, accG = 0, accB = 0, wsum = 0, maxW = 0, solvent = null;
    for (var i = 0; i < c.liquids.length; i++) {
      var e = c.liquids[i], s = CHEM.getSub(e.id);
      if (!s) continue;
      var rgb = parseHex(colorOf(e.id));
      if (s.phase === 'liquid') { solvent = rgb; continue; }   // 水、乙醇等纯液体作溶剂
      if (!isColorful(rgb)) continue;
      var conc = (e.mmol || 0) / totalMl;                      // 近似浓度 mol/L
      var w = Math.min(1, conc * 1.6);
      if (w <= 0.001) continue;
      accR += rgb.r * w; accG += rgb.g * w; accB += rgb.b * w;
      wsum += w; if (w > maxW) maxW = w;
    }
    if (wsum <= 0.001) {
      return { color: solvent ? rgbToHex(solvent) : '#dcf0ff', alpha: solvent ? 0.52 : 0.40 };
    }
    return {
      color: rgbToHex({ r: accR / wsum, g: accG / wsum, b: accB / wsum }),
      alpha: Math.min(0.92, 0.34 + 0.62 * maxW)
    };
  }

  function drawContents(ctx, c) {
    var info = liquidInfo(c);
    var type = c.type;
    var H = CHEM.getApp(type).H;

    /* --- 气体空间 --- */
    if (c.gases.length && info.level < CHEM.getApp(type).H - 2) {
      ctx.save();
      slabPath(ctx, type, info.level, CHEM.getApp(type).H);
      ctx.clip();
      var gasTop = CHEM.getApp(type).H;
      var gg = ctx.createLinearGradient(0, info.level, 0, gasTop);
      var dom = dominantGas(c);
      gg.addColorStop(0, hexA(dom.tint, 0.10 + 0.30 * dom.frac));
      gg.addColorStop(1, hexA(dom.tint, 0.03 + 0.16 * dom.frac));
      ctx.fillStyle = gg;
      ctx.fillRect(-60, info.level, 120, gasTop - info.level + 4);
      ctx.restore();
    }

    /* --- 液体（水溶液是均匀的，整段用同一个混合色） --- */
    if (info.level > 0.4) {
      var mix = liquidColor(c);
      ctx.save();
      cavityPath(ctx, type);
      ctx.clip();
      slabPath(ctx, type, 0, info.level);
      ctx.fillStyle = hexA(mix.color, mix.alpha);
      ctx.fill();
      /* 指示剂 / 变色覆盖 */
      if (c.tint) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = c.tint;
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      /* 浑浊（沉淀悬浮） */
      var turb = turbidity(c);
      if (turb > 0.01) {
        ctx.globalAlpha = Math.min(0.82, turb);
        ctx.fillStyle = turbColor(c);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    /* --- 未溶解固体 / 沉淀 --- */
    drawSolids(ctx, c, info);

    /* --- 粒子特效 --- */
    drawParticles(ctx, c);

    /* --- 玻璃高光与轮廓 --- */
    var shape = SHAPES[type];
    if (shape) shape(ctx, CHEM.getApp(type), c);
    else glassStroke(ctx, type, CHEM.getApp(type).H);

    /* --- 加热红光 --- */
    if (c.heatPower > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var hg = ctx.createRadialGradient(0, 4, 2, 0, 12, 70);
      hg.addColorStop(0, 'rgba(255,120,40,0.30)');
      hg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = hg;
      ellipse(ctx, 0, 12, 70, 40); ctx.fill();
      ctx.restore();
    }

    /* --- 燃烧的火焰 --- */
    if (c.ignited && hasCombustion(c)) drawCombustion(ctx, c);
  }

  function dominantGas(c) {
    var best = null, tot = 0;
    c.gases.forEach(function (g) { tot += g.ml; });
    c.gases.forEach(function (g) { if (!best || g.ml > best.ml) best = g; });
    var sub = best ? CHEM.getSub(best.id) : null;
    return {
      id: best ? best.id : null,
      frac: tot > 0 && best ? best.ml / tot : 0,
      /* 用气体自身的颜色着色：这样 NO₂ 的红棕色、Cl₂ 的黄绿色、溴蒸气的红棕色
         都能自动显示出来，不必每加一种气体就改一次这张表 */
      tint: sub ? (GAS_TINT[sub.base] || sub.color || '#cfe3f2') : '#cfe3f2'
    };
  }
  var GAS_TINT = {
    o2: '#8fd0ff', h2: '#bcd8ff', co2: '#b9c9d6', ch4: '#a9d0e8',
    co: '#c2c8cf', so2: '#d9dfc0'
  };

  /* 金属单质、木炭等以"沉积/颗粒"形式出现，不会让溶液变浑浊 */
  var NOT_TURBID = { fe: 1, cu: 1, ag: 1, zn: 1, mg: 1, al: 1, c: 1, s: 1, p: 1, fes: 1 };

  function turbidity(c) {
    var m = 0;
    c.solids.forEach(function (e) {
      var s = CHEM.getSub(e.id);
      if (!s || NOT_TURBID[s.base]) return;
      if (e.precip || s.soluble === false) m += e.g;
    });
    return Math.min(0.8, m * 6);
  }
  function turbColor(c) {
    var best = null, bestM = 0;
    c.solids.forEach(function (e) {
      var s = CHEM.getSub(e.id);
      if (!s || NOT_TURBID[s.base]) return;
      if (e.precip || s.soluble === false) {
        if (e.g > bestM) { bestM = e.g; best = s; }
      }
    });
    return best ? (best.precipColor || best.color) : '#f0f3f7';
  }

  /* 沉淀堆的颜色：按质量加权混合，避免只取到最后一个组分 */
  function pileColor(list) {
    var r = 0, g = 0, b = 0, m = 0;
    list.forEach(function (e) {
      var s = CHEM.getSub(e.id);
      if (!s) return;
      var c = parseHex(s.precipColor || s.color);
      var w = e.g || 0;
      r += c.r * w; g += c.g * w; b += c.b * w; m += w;
    });
    if (m <= 0) return '#eef1f5';
    return rgbToHex({ r: r / m, g: g / m, b: b / m });
  }

  function drawSolids(ctx, c, info) {
    if (!c.solids.length) return;
    var type = c.type;
    ctx.save();
    cavityPath(ctx, type);
    ctx.clip();

    var settled = [], floating = [];
    c.solids.forEach(function (e) {
      var s = CHEM.getSub(e.id);
      var isPpt = e.precip || (s && s.soluble === false);
      (isPpt ? settled : floating).push(e);
    });

    /* 沉淀堆：高度按质量估算 */
    if (settled.length) {
      var mass = 0;
      settled.forEach(function (e) { mass += e.g; });
      var col = pileColor(settled);
      var hw = G.halfWidthAt(type, 2);
      var pileH = Math.min(CHEM.getApp(type).H * 0.42, 1.5 + mass * 14);
      ctx.fillStyle = hexA(col, 0.95);
      ctx.beginPath();
      ctx.moveTo(-hw * 0.96, 0.6);
      ctx.quadraticCurveTo(-hw * 0.5, pileH * 1.15, 0, pileH);
      ctx.quadraticCurveTo(hw * 0.5, pileH * 1.15, hw * 0.96, 0.6);
      ctx.closePath();
      ctx.fill();
      /* 颗粒质感 */
      ctx.fillStyle = hexA(col, 0.9);
      var seed = 1;
      for (var i = 0; i < Math.min(60, mass * 90); i++) {
        seed = (seed * 9301 + 49297) % 233280;
        var rx = (seed / 233280 - 0.5) * hw * 1.7;
        var ry = Math.random() * pileH * 0.9;
        ctx.beginPath(); ctx.arc(rx, ry, 0.7 + Math.random() * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      /* 起伏的沉淀面 */
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.96, 0.6);
      ctx.quadraticCurveTo(-hw * 0.5, pileH * 1.15, 0, pileH);
      ctx.quadraticCurveTo(hw * 0.5, pileH * 1.15, hw * 0.96, 0.6);
      ctx.stroke();
    }

    /* 未溶解的固体块：画成一堆小颗粒 */
    if (floating.length) {
      var total = 0;
      floating.forEach(function (e) { total += e.g; });
      var n = Math.min(90, Math.round(8 + total * 55));
      var level = info.level;
      var base = Math.max(1.2, Math.min(level * 0.9, CHEM.getApp(type).H * 0.3));
      var idx = 0;
      floating.forEach(function (e) {
        var s = CHEM.getSub(e.id);
        var share = total > 0 ? Math.round(n * (e.g / total)) : 0;
        for (var k = 0; k < share; k++) {
          var u = 1 + Math.random() * Math.max(1, base);
          var hw2 = G.halfWidthAt(type, u) * 0.88;
          ctx.fillStyle = hexA(s.color, 0.95);
          ctx.beginPath();
          ctx.arc((Math.random() - 0.5) * 2 * hw2, u, 1.2 + Math.random() * 1.9, 0, Math.PI * 2);
          ctx.fill();
        }
        idx++;
      });
    }
    ctx.restore();
  }

  function drawParticles(ctx, c) {
    var parts = CHEM._world ? CHEM._world.fx.forContainer(c.uid) : [];
    if (!parts.length) return;
    ctx.save();
    cavityPath(ctx, c.type);
    ctx.clip();
    var H = CHEM.getApp(c.type).H;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var a = 1 - p.life / p.max;
      if (p.kind === 'bubble') {
        ctx.beginPath();
        ctx.arc(p.x, p.u, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * a).toFixed(3) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.75 * a).toFixed(3) + ')';
        ctx.lineWidth = 0.7; ctx.stroke();
      } else if (p.kind === 'ppt') {
        ctx.beginPath();
        ctx.arc(p.x, p.u, p.r, 0, Math.PI * 2);
        ctx.fillStyle = hexA(p.color, 0.85 * (p.settled ? a : 1));
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.beginPath();
        ctx.arc(p.x, p.u, p.r, 0, Math.PI * 2);
        ctx.fillStyle = hexA(p.color, a);
        ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        ctx.fill(); ctx.shadowBlur = 0;
      } else if (p.kind === 'drop') {
        ctx.beginPath();
        ctx.arc(p.x, p.u, p.r, 0, Math.PI * 2);
        ctx.fillStyle = hexA(p.color, 0.9);
        ctx.fill();
      } else if (p.kind === 'smoke' || p.kind === 'steam') {
        ctx.beginPath();
        ctx.arc(p.x, p.u, p.r, 0, Math.PI * 2);
        ctx.fillStyle = hexA(p.color || '#ffffff', 0.20 * a);
        ctx.fill();
      } else if (p.kind === 'flame') {
        ctx.globalCompositeOperation = 'lighter';
        var fg = ctx.createRadialGradient(p.x, p.u, 0, p.x, p.u, p.r);
        fg.addColorStop(0, hexA(p.color, 0.85 * a));
        fg.addColorStop(1, hexA(p.color, 0));
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(p.x, p.u, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'dissolve') {
        ctx.beginPath();
        ctx.arc(p.x, p.u, p.r, 0, Math.PI * 2);
        ctx.fillStyle = hexA(p.color, 0.30 * a);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function hasCombustion(c) {
    var m = CHEM.Reaction.findMatches(c);
    for (var i = 0; i < m.length; i++) {
      var k = m[i].rule.phenomena.kind;
      if (k === 'flame' || k === 'glow' || k === 'smoke') return true;
    }
    return false;
  }

  function drawCombustion(ctx, c) {
    var m = CHEM.Reaction.findMatches(c);
    var color = '#ffb347';
    for (var i = 0; i < m.length; i++) {
      var p = m[i].rule.phenomena;
      if (p.kind === 'flame' || p.kind === 'glow') { color = EFFECT_FALLBACK; break; }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var app = CHEM.getApp(c.type);
    var fg = ctx.createRadialGradient(0, app.H * 0.25, 2, 0, app.H * 0.25, app.H * 0.5);
    fg.addColorStop(0, hexA(color, 0.35));
    fg.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(0, app.H * 0.25, app.H * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  var EFFECT_FALLBACK = '#ffd27f';

  /* 颜色工具：把 #rrggbb 变成 rgba() */
  function hexA(hex, a) {
    if (!hex) return 'rgba(220,234,245,' + a + ')';
    if (hex.charAt(0) !== '#') return hex;
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  CHEM.hexA = hexA;

  /* =========================================================================
   * Renderer
   * ====================================================================== */
  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1; this.ox = 0; this.oy = 0;
    this.dpr = Math.min(2, root.devicePixelRatio || 1);
  }

  Renderer.prototype.resize = function (cssW, cssH) {
    var dpr = this.dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    var s = Math.min(cssW / CHEM.SCENE.w, cssH / CHEM.SCENE.h);
    this.scale = s;
    this.ox = (cssW - CHEM.SCENE.w * s) / 2;
    this.oy = (cssH - CHEM.SCENE.h * s) / 2;
    this.cssW = cssW; this.cssH = cssH;
  };

  Renderer.prototype.screenToScene = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    var x = (clientX - r.left - this.ox) / this.scale;
    var y = (clientY - r.top - this.oy) / this.scale;
    return { x: x, y: y };
  };

  /* 仪器的场景包围盒 */
  function bboxOf(it) {
    var a = CHEM.getApp(it.type);
    var hw = 20;
    if (a.category === 'container') {
      for (var u = 0; u <= a.H; u += a.H / 20) hw = Math.max(hw, a.profile(u) + WALL + 2);
      return { x0: it.x - hw, x1: it.x + hw, y0: it.y - a.H - 8, y1: it.y + 6 };
    }
    var w = (a.w || 60) / 2 + 6;
    if (it.type === 'alcoholLamp') return { x0: it.x - 26, x1: it.x + 26, y0: it.y - a.H - 56, y1: it.y + 6 };
    if (it.type === 'ironStand') return { x0: it.x - 64, x1: it.x + a.clampReach - 6, y0: it.y - a.H - 12, y1: it.y + 12 };
    return { x0: it.x - w, x1: it.x + w, y0: it.y - a.H - 8, y1: it.y + 8 };
  }
  CHEM.bboxOf = bboxOf;

  /* 命中测试：重叠时优先返回"画在最上面"的那一件。
     items 的绘制顺序是 装置(按 z) -> 容器(按 y)，所以这里用 >= 让后面的覆盖前面的。 */
  Renderer.prototype.pick = function (world, sx, sy) {
    var items = world.items, best = null, bestZ = -1e9, bestIdx = -1;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], b = bboxOf(it);
      if (sx < b.x0 || sx > b.x1 || sy < b.y0 || sy > b.y1) continue;
      var z = (Z[it.type] || 5) + (it.kind === 'container' ? 10 : 0);
      if (z > bestZ || (z === bestZ && i > bestIdx)) { bestZ = z; bestIdx = i; best = it; }
    }
    return best;
  };

  Renderer.prototype.render = function (world, opt) {
    CHEM._world = world;
    CHEM._t = opt.t || 0;
    var ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);

    drawRoom(ctx, world, opt, {
      x0: -this.ox / this.scale,
      y0: -this.oy / this.scale,
      x1: (this.cssW - this.ox) / this.scale,
      y1: (this.cssH - this.oy) / this.scale
    });

    /* 仪器排序 */
    var items = world.items.slice().sort(function (a, b) {
      var za = Z[a.type] || 5, zb = Z[b.type] || 5;
      if (za !== zb) return za - zb;
      return a.y - b.y;
    });
    var containers = [], frontRacks = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'device' && it.type === 'testTubeRack') frontRacks.push(it);
      if (it.kind === 'container') containers.push(it);
    }

    /* 台面接地阴影：先统统画一遍，保证阴影永远在器皿下面 */
    items.forEach(function (it) {
      if (it.type === 'deliveryTube') return;
      var a = CHEM.getApp(it.type);
      var rx = 22;
      if (a.category === 'container') {
        rx = Math.max(14, G.halfWidthAt(it.type, 0.5) + WALL + 6);
      } else if (a.w) {
        rx = a.w / 2 + 6;
      }
      groundShadow(ctx, it.x, it.y, rx);
    });

    /* 悬停 / 拖放目标高亮 */
    function ring(uid, color, dash) {
      var hv = world.byUid(uid);
      if (!hv) return;
      var a2 = CHEM.getApp(hv.type);
      var rx = a2.w ? a2.w / 2 : G.halfWidthAt(hv.type, 0.5) + 12;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      if (dash) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.ellipse(hv.x, hv.y + 1, Math.max(14, rx), 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (opt.dropTarget && opt.dropTarget !== opt.hover) ring(opt.dropTarget, 'rgba(120,236,170,0.95)', false);
    if (opt.hover) ring(opt.hover, 'rgba(126,214,255,0.9)', true);

    /* 背景装置 */
    items.forEach(function (it) {
      if (it.kind === 'device' && it.type !== 'deliveryTube' && it.type !== 'testTubeRack') {
        ctx.save(); ctx.translate(it.x, it.y); ctx.scale(1, -1);
        var sh = SHAPES[it.type];
        if (sh) sh(ctx, CHEM.getApp(it.type), it);
        ctx.restore();
      }
      if (it.type === 'testTubeRack') {
        ctx.save(); ctx.translate(it.x, it.y); ctx.scale(1, -1);
        SHAPES.testTubeRack(ctx, CHEM.getApp(it.type));
        ctx.restore();
      }
    });

    /* 容器 */
    containers.forEach(function (c) {
      ctx.save();
      ctx.translate(c.x, c.y);
      /* 选中光环 */
      if (opt.selected === c.uid) {
        ctx.save();
        var a = CHEM.getApp(c.type);
        var g = ctx.createLinearGradient(0, 0, 0, -a.H);
        ctx.strokeStyle = 'rgba(80,190,255,0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.ellipse(0, 0, 34, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      ctx.scale(1, -1);
      drawContents(ctx, c);
      ctx.restore();
      drawLabel(ctx, c, opt);
    });

    /* 试管架前挡板 */
    frontRacks.forEach(function (it) {
      ctx.save(); ctx.translate(it.x, it.y); ctx.scale(1, -1);
      SHAPES.testTubeRackFront(ctx);
      ctx.restore();
    });

    /* 导管 */
    items.forEach(function (it) {
      if (it.type === 'deliveryTube') drawTube(ctx, world, it);
    });

    /* 工具光标提示 */
    if (opt.tool && opt.mouse) drawToolCursor(ctx, opt);

    ctx.restore();

    /* 内容物标注（贴着容器口）→ 检验动画 → 方程式卡片（再往上一层层叠） */
    var labelRects = drawContentLabels(ctx, containers, opt, this);
    this.labels = labelRects;
    var labelTops = Object.create(null);
    labelRects.forEach(function (r) { labelTops[r.uid] = r.y; });
    drawTestAnim(ctx, world, containers, this);
    this.badges = drawEquationBadges(ctx, world, containers, opt, this, labelTops);
  };

  /* =========================================================================
   * 容器旁边的反应方程式标注
   * ---------------------------------------------------------------------
   * 反应进行时在容器上方贴一张小卡片写出化学方程式，点击可以查看
   * 焓变、平衡常数、离子方程式等详情。命中的矩形会存进 renderer.badges。
   * ====================================================================== */
  /* =========================================================================
   * 紧挨着容器口上方的"内容物标注"
   * ---------------------------------------------------------------------
   * 把容器里有什么、什么状态、多少量、多少度，直接写在容器正上方。
   * 位置很讲究：它贴在容器口上（离容器最近），方程式卡片再往上叠，
   * 这样"物质 → 正在发生的反应"是从下往上的阅读顺序，不会互相压住。
   * 返回 每个容器的标注顶部 Y 坐标，供方程式卡片接着往上排。
   * ====================================================================== */
  var LABEL_FONT = '500 11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';

  function contentParts(c) {
    var parts = [];
    function push(list, unit, digits, phaseName) {
      list.forEach(function (e) {
        var s = CHEM.getSub(e.id);
        if (!s) return;
        var v = e[unit];
        if (!(v > 1e-4)) return;
        parts.push({
          text: s.name + ' ' + v.toFixed(digits) + (unit === 'g' ? 'g' : 'mL'),
          phase: phaseName,
          color: s.phase === 'solid' ? (s.dissolveColor || s.color) : s.color
        });
      });
    }
    push(c.liquids, 'ml', 1, '液');
    push(c.solids, 'g', 2, '固');
    push(c.gases, 'ml', 1, '气');
    return parts;
  }

  function drawContentLabels(ctx, containers, opt, R) {
    var rects = [];
    var sc = R.scale, ox = R.ox, oy = R.oy;
    var MAXW = Math.min(300, R.cssW * 0.42);
    ctx.save();
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';

    containers.forEach(function (c) {
      var a = CHEM.getApp(c.type);
      var parts = contentParts(c);
      var selected = opt.selected === c.uid;
      /* 空容器只在被选中时提示一下，免得台面上一堆空标签 */
      if (!parts.length && !selected) return;

      var segs = parts.map(function (p) {
        return { w: ctx.measureText(p.text).width + 13, text: p.text, color: p.color, phase: p.phase };
      });
      /* 贪心折行：最多两行，宽度不超过 MAXW */
      var lines = [], cur = [], curW = 0;
      segs.forEach(function (sg) {
        if (curW + sg.w > MAXW && cur.length) { lines.push({ segs: cur, w: curW }); cur = []; curW = 0; }
        cur.push(sg); curW += sg.w;
      });
      if (cur.length) lines.push({ segs: cur, w: curW });
      var dropped = 0;
      if (lines.length > 2) {
        dropped = lines.length - 2;
        lines = lines.slice(0, 2);
      }
      if (!lines.length) lines = [{ segs: [], w: 0 }];

      var w = Math.max.apply(null, lines.map(function (l) { return l.w; }));
      if (dropped) w += 18;
      w += 10;
      var lh = 14;
      var h = lines.length * lh + 7;
      var cx = ox + c.x * sc;
      var mouthY = oy + (c.y - (a.H || 0)) * sc;
      var x = Math.max(3, Math.min(R.cssW - w - 3, cx - w / 2));
      var y = mouthY - 5 - h;
      if (y < 3) y = 3;                       // 顶到画面外就贴在顶部
      rects.push({ uid: c.uid, x: x, y: y, w: w, h: h, mouthY: mouthY });

      ctx.save();
      ctx.globalAlpha = selected ? 1 : 0.94;
      /* 底板 */
      var bg = ctx.createLinearGradient(x, y, x, y + h);
      bg.addColorStop(0, selected ? 'rgba(20,58,86,0.96)' : 'rgba(14,40,60,0.88)');
      bg.addColorStop(1, selected ? 'rgba(10,36,58,0.96)' : 'rgba(8,26,42,0.88)');
      roundRect(ctx, x, y, w, h, 7);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = selected ? 'rgba(126,214,255,0.95)' : 'rgba(96,150,186,0.55)';
      ctx.lineWidth = selected ? 1.6 : 1;
      ctx.stroke();
      /* 一条细线连到容器口，表明这张标签属于哪个容器 */
      ctx.strokeStyle = 'rgba(126,214,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, y + h);
      ctx.lineTo(cx, mouthY - 1);
      ctx.stroke();

      /* 内容物 */
      var ty = y + 3;
      lines.forEach(function (l, li) {
        var tx = x + 5;
        l.segs.forEach(function (sg) {
          ctx.fillStyle = sg.color;
          ctx.beginPath();
          ctx.arc(tx + 3.5, ty + lh / 2, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 0.7;
          ctx.stroke();
          ctx.fillStyle = '#dcefff';
          ctx.fillText(sg.text, tx + 10, ty + lh / 2 + 0.5);
          tx += sg.w;
        });
        if (li === lines.length - 1 && dropped) {
          ctx.fillStyle = 'rgba(160,200,225,0.85)';
          ctx.fillText('…', tx + 3, ty + lh / 2 + 0.5);
        }
        ty += lh;
      });
      /* 空容器提示 */
      if (!parts.length) {
        ctx.fillStyle = 'rgba(170,205,228,0.9)';
        ctx.fillText('（空）' + c.temp.toFixed(0) + ' ℃', x + 8, y + h / 2 + 0.5);
      } else {
        /* 温度单独贴在右侧，超过 40℃ 变暖色 */
        var tempTxt = c.temp.toFixed(0) + '℃';
        var tw = ctx.measureText(tempTxt).width;
        var hot = c.temp >= 40;
        ctx.fillStyle = hot ? '#ffb46a' : '#8fc0dd';
        ctx.fillText(tempTxt, x + w - tw - 6, y + lines.length * lh / 2 + 3);
      }
      ctx.restore();
    });
    ctx.restore();
    return rects;
  }

  /* =========================================================================
   * 检验动画
   * ---------------------------------------------------------------------
   * 用「检验」做检验时不再弹一段文字，改为在容器口演一遍：
   *   木条类 → 一根木条伸进容器，带火星的会复燃、不带火星的直接灭掉；
   *   试纸类 → 一条试纸伸进容器口，颜色按检验结果变化。
   * 动画状态存在 container.testAnim 上，由 app.js 在检验时写入。
   * ====================================================================== */
  var PAPER_INIT = { phPaper: '#e8c96a', litmusPaper: '#8e6bbf', starchIodine: '#f4f6f9', kiStarchPaper: '#f4f6f9' };

  function testAnimSpec(testId, anim) {
    var kind = /Splint/.test(testId) ? 'splint' : 'paper';
    var color = PAPER_INIT[testId] || '#e8c96a';
    if (kind === 'paper') {
      if (testId === 'phPaper' && anim.ph !== undefined && anim.ph !== null && isFinite(anim.ph)) {
        var ph = anim.ph;
        color = ph < 3 ? '#e04b3a' : ph < 5 ? '#e8863a' : ph < 7 ? '#d8c94a'
          : ph < 9 ? '#6fbf7a' : ph < 11 ? '#3a86c8' : '#2f4f9e';
      } else {
        var t = String(anim.result || '') + String(anim.text || '');
        if (t.indexOf('红') >= 0) color = '#e0455a';
        else if (t.indexOf('蓝') >= 0) color = '#2f6fd6';
        else if (t.indexOf('紫') >= 0) color = '#8e6bbf';
      }
    }
    return { kind: kind, color: color, pass: !!anim.ok, testId: testId };
  }

  function drawTestAnim(ctx, world, containers, R) {
    var sc = R.scale, ox = R.ox, oy = R.oy;
    var now = world.time;
    ctx.save();
    containers.forEach(function (c) {
      var an = c.testAnim;
      if (!an) return;
      var age = now - an.start;
      if (age < 0 || age > an.dur) return;
      var a = CHEM.getApp(c.type);
      var cx = ox + c.x * sc;
      var mouthY = oy + (c.y - (a.H || 0)) * sc;

      /* 三个阶段：伸入 → 停留观察 → 抽走 */
      var t = age / an.dur;
      var reach;                                   // 0=还没进来 1=完全伸进去
      if (t < 0.22) reach = t / 0.22;
      else if (t < 0.80) reach = 1;
      else reach = Math.max(0, 1 - (t - 0.80) / 0.20);
      var alpha = t > 0.88 ? Math.max(0, (1 - t) / 0.12) : 1;

      var spec = testAnimSpec(an.testId, an);
      ctx.globalAlpha = alpha;

      if (spec.kind === 'splint') {
        /* 木条：从右上角伸进来 */
        var tipX = cx + 34 - 30 * reach;
        var tipY = mouthY - 52 + 46 * reach;
        var topX = tipX + 42, topY = tipY - 66;
        ctx.strokeStyle = '#b98a52';
        ctx.lineWidth = 4.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(tipX, tipY); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(topX, topY - 1.2); ctx.lineTo(tipX, tipY - 1.2); ctx.stroke();
        /* 木条末端：复燃/燃烧更旺 → 明火；否则只是暗红的火星，逐渐熄灭 */
        if (spec.pass) {
          var fl = 1 + Math.sin(now * 22) * 0.16;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          var fg = ctx.createRadialGradient(tipX, tipY - 6 * fl, 1, tipX, tipY - 6 * fl, 24 * fl);
          fg.addColorStop(0, 'rgba(255,255,235,1)');
          fg.addColorStop(0.35, 'rgba(255,206,96,0.95)');
          fg.addColorStop(0.7, 'rgba(255,150,40,0.5)');
          fg.addColorStop(1, 'rgba(255,110,20,0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY - 32 * fl);
          ctx.bezierCurveTo(tipX + 12, tipY - 16 * fl, tipX + 11, tipY - 2, tipX, tipY + 3);
          ctx.bezierCurveTo(tipX - 11, tipY - 2, tipX - 12, tipY - 16 * fl, tipX, tipY - 32 * fl);
          ctx.fill();
          ctx.restore();
        } else {
          var dim = Math.max(0.15, 1 - Math.max(0, t - 0.35) / 0.5);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          var eg = ctx.createRadialGradient(tipX, tipY - 1, 0.5, tipX, tipY - 1, 8);
          eg.addColorStop(0, 'rgba(255,150,60,' + (0.85 * dim).toFixed(3) + ')');
          eg.addColorStop(1, 'rgba(255,90,20,0)');
          ctx.fillStyle = eg;
          ctx.beginPath(); ctx.arc(tipX, tipY - 1, 8, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          ctx.fillStyle = 'rgba(60,50,45,' + dim.toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(tipX, tipY - 1, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        /* 试纸：一条纸片伸进容器口，下端变色 */
        var px = cx + 20 - 16 * reach;
        var py = mouthY - 44 + 30 * reach;
        var pw = 13, phh = 30;
        /* 夹子 */
        ctx.strokeStyle = '#9aa7b2';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px, py - 12); ctx.lineTo(px + 22, py - 34); ctx.stroke();
        /* 纸片 */
        ctx.save();
        roundRect(ctx, px - pw / 2, py, pw, phh, 2.5);
        ctx.clip();
        ctx.fillStyle = spec.color;
        ctx.fillRect(px - pw / 2, py, pw, phh);
        /* 上端保留原色，越往下变色越明显 */
        var pgrad = ctx.createLinearGradient(0, py, 0, py + phh);
        pgrad.addColorStop(0, hexA(spec.color, 0.25));
        pgrad.addColorStop(1, hexA(spec.color, 1));
        ctx.fillStyle = pgrad;
        ctx.fillRect(px - pw / 2, py, pw, phh);
        /* 湿润的痕迹 */
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(px - pw / 2, py + phh * 0.55, pw, phh * 0.18);
        ctx.restore();
        ctx.strokeStyle = 'rgba(90,105,118,0.85)';
        ctx.lineWidth = 1;
        roundRect(ctx, px - pw / 2, py, pw, phh, 2.5);
        ctx.stroke();
      }

      /* 结果小标签：贴在动画旁边，算动画的一部分而不是一段说明文字 */
      if (t > 0.3) {
        var label;
        if (spec.kind === 'splint') {
          label = spec.pass ? '复燃' : '熄灭';
        } else if (an.testId === 'phPaper' && isFinite(an.ph)) {
          label = an.ph < 6 ? '变红（pH ' + an.ph.toFixed(0) + '）'
            : an.ph > 8 ? '变蓝（pH ' + an.ph.toFixed(0) + '）' : '不变色（pH≈7）';
        } else {
          label = spec.color === '#e0455a' ? '变红'
            : spec.color === '#2f6fd6' ? '变蓝'
              : spec.color === '#8e6bbf' ? '不变色' : '变色';
        }
        ctx.font = '700 11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
        var lw = ctx.measureText(label).width + 14;
        var lx = cx + 30, ly = mouthY - (spec.kind === 'splint' ? 78 : 60);
        ctx.globalAlpha = alpha * Math.max(0, Math.min(1, (t - 0.3) / 0.15));
        roundRect(ctx, lx, ly, lw, 19, 9);
        ctx.fillStyle = spec.pass ? 'rgba(24,104,72,0.94)' : 'rgba(78,88,98,0.94)';
        ctx.fill();
        ctx.strokeStyle = spec.pass ? 'rgba(120,236,170,0.9)' : 'rgba(170,186,200,0.8)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, lx + 7, ly + 10);
      }
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  /* 反应方程式卡片。
     ⚠ 它画在**屏幕空间**（画布 CSS 像素），不是场景空间：
       卡片是覆盖层，不应该跟着实验台一起缩放 —— 否则画布一小，方程式就糊成一团；
       而且必须和命中测试用同一套坐标，否则会出现"看到的和点到的不一样"。
     renderer 负责把容器的场景坐标换算成屏幕坐标传进来。 */
  function drawEquationBadges(ctx, world, containers, opt, R, labelTops) {
    var out = [];
    var now = world.time;
    var placed = [];
    var sc = R.scale, ox = R.ox, oy = R.oy;
    var VIEW_W = R.cssW, VIEW_H = R.cssH;

    ctx.save();
    ctx.font = BADGE_FONT;
    ctx.textBaseline = 'middle';

    function overlaps(x, y, w, h) {
      for (var i = 0; i < placed.length; i++) {
        var p = placed[i];
        if (!(x + w < p.x || x > p.x + p.w) && !(y + h < p.y || y > p.y + p.h)) return true;
      }
      return false;
    }

    containers.forEach(function (c) {
      var list = CHEM.Reaction.activeRules(c, now);
      if (!list.length) return;
      var a = CHEM.getApp(c.type);
      /* 容器口在屏幕上的位置 —— 卡片就挂在这个点上方 */
      var cx = ox + c.x * sc;
      var mouthY = oy + (c.y - (a.H || 0)) * sc;
      /* 内容物标注贴着容器口，方程式卡片再往上叠，两者不打架 */
      var labelTop = labelTops && labelTops[c.uid];
      var baseY = (labelTop !== undefined ? labelTop : mouthY - 10) - 6;

      list.slice(0, 3).forEach(function (r, i) {
        var text = r.equation;
        var w = ctx.measureText(text).width + 30;
        var h = 25;
        var x = Math.max(4, Math.min(VIEW_W - w - 4, cx - w / 2));
        var y = baseY - (i + 1) * (h + 7);
        if (y < 4) y = 4;

        /* 避让：优先待在自己容器的正上方，实在挤不下才左右挪一点 */
        var order = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1],
          [0, -2], [-2, 0], [2, 0], [-1, -2], [1, -2], [0, 1]];
        for (var t = 0; t < order.length; t++) {
          var tx = Math.max(4, Math.min(VIEW_W - w - 4, x + order[t][0] * (w * 0.5)));
          var ty = y + order[t][1] * (h + 6);
          if (ty < 4) continue;
          if (!overlaps(tx, ty, w, h)) { x = tx; y = ty; break; }
        }
        placed.push({ x: x, y: y, w: w, h: h });

        var hovered = opt.badgeHover && opt.badgeHover.ruleId === r.id && opt.badgeHover.uid === c.uid;
        /* 卡片大部分时间保持不透明，只在最后 1.8 秒淡出，
           这样学生有足够时间读方程式，又不会堆一屏不消失。 */
        var left = c.activeUntil[r.id] - now;
        var alpha = left > 1.8 ? 1 : Math.max(0.15, left / 1.8);

        ctx.save();
        ctx.globalAlpha = alpha;

        /* 引出线 + 锚点：让"这张卡片属于哪个容器"一目了然 */
        var anchorX = Math.max(x + 12, Math.min(x + w - 12, cx));
        ctx.strokeStyle = hovered ? 'rgba(150,232,255,0.95)' : 'rgba(120,214,255,0.7)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(anchorX, y + h);
        ctx.lineTo(cx, mouthY - 4);
        ctx.stroke();
        ctx.fillStyle = hovered ? 'rgba(150,232,255,1)' : 'rgba(120,214,255,0.85)';
        ctx.beginPath();
        ctx.arc(cx, mouthY - 3, 2.6, 0, Math.PI * 2);
        ctx.fill();

        /* 卡片 */
        var bg = ctx.createLinearGradient(x, y, x, y + h);
        if (hovered) {
          bg.addColorStop(0, 'rgba(24,74,110,0.98)');
          bg.addColorStop(1, 'rgba(12,44,70,0.98)');
        } else {
          bg.addColorStop(0, 'rgba(14,42,64,0.94)');
          bg.addColorStop(1, 'rgba(8,28,44,0.94)');
        }
        roundRect(ctx, x, y, w, h, 9);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = hovered ? 'rgba(150,232,255,1)' : 'rgba(90,190,240,0.7)';
        ctx.lineWidth = hovered ? 1.8 : 1.2;
        ctx.stroke();

        /* 左侧的反应类型色条 */
        ctx.save();
        roundRect(ctx, x, y, w, h, 9);
        ctx.clip();
        ctx.fillStyle = kindColor(r.phenomena && r.phenomena.kind);
        ctx.fillRect(x, y, 3.5, h);
        ctx.restore();

        /* 文字 */
        ctx.fillStyle = hovered ? '#ffffff' : '#d3eeff';
        ctx.fillText(text, x + 15, y + h / 2 + 0.5);

        /* 右上角一个"i"，提示可以点开 */
        ctx.fillStyle = hovered ? 'rgba(150,232,255,0.95)' : 'rgba(120,190,225,0.8)';
        ctx.beginPath();
        ctx.arc(x + w - 11, y + h / 2, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a2438';
        ctx.font = '700 10px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('i', x + w - 11, y + h / 2 + 0.5);
        ctx.font = BADGE_FONT;
        ctx.textAlign = 'left';
        ctx.restore();

        out.push({ x: x, y: y, w: w, h: h, uid: c.uid, ruleId: r.id });
      });
    });
    ctx.restore();
    return out;
  }

  function kindColor(kind) {
    switch (kind) {
      case 'bubble': return '#4fc3f7';
      case 'precipitate': return '#b39ddb';
      case 'colorChange': return '#ffd54f';
      case 'flame': return '#ff8a4c';
      case 'smoke': return '#e0e0e0';
      case 'glow': return '#fff59d';
      case 'dissolve': return '#80cbc4';
      default: return '#7fb3d5';
    }
  }

  /* 点击测试：坐标是**画布内的 CSS 像素**（和绘制用的坐标一致） */
  Renderer.prototype.pickBadge = function (px, py) {
    var list = this.badges || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var b = list[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  };

  function drawTube(ctx, world, d) {
    var A = d.linkA ? world.byUid(d.linkA) : null;
    var B = d.linkB ? world.byUid(d.linkB) : null;
    var pts = [];
    if (A) {
      var aa = CHEM.getApp(A.type);
      pts.push({ x: A.x, y: A.y - aa.H - 4 });
    } else pts.push({ x: d.x - 46, y: d.y - 6 });
    if (B) {
      var ba = CHEM.getApp(B.type);
      pts.push({ x: B.x, y: B.y - ba.H - 4 });
    } else pts.push({ x: d.x + 46, y: d.y - 6 });
    ctx.save();
    ctx.strokeStyle = 'rgba(205,230,246,0.92)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    var cx1 = pts[0].x, cy1 = Math.min(pts[0].y, pts[1].y) - 46;
    var cx2 = pts[1].x, cy2 = Math.min(pts[0].y, pts[1].y) - 46;
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, pts[1].x, pts[1].y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function drawLabel(ctx, c, opt) {
    var a = CHEM.getApp(c.type);
    var y = c.y + 16;
    ctx.save();
    ctx.font = '500 12px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    ctx.textAlign = 'center';
    var text = c.displayName();
    var vol = c.liquidVolume();
    if (vol > 0.05) text += ' · ' + vol.toFixed(1) + ' mL';
    ctx.fillStyle = 'rgba(20,40,60,0.55)';
    var w = ctx.measureText(text).width + 12;
    roundRect(ctx, c.x - w / 2, y - 11, w, 17, 8);
    ctx.fill();
    ctx.fillStyle = '#eaf4ff';
    ctx.fillText(text, c.x, y + 1.5);
    /* 温度 */
    if (c.temp > 32 || c.heatPower > 0) {
      var hot = c.temp >= 90;
      ctx.fillStyle = hot ? '#ff7a52' : '#ffb15c';
      ctx.font = '600 11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      ctx.fillText(c.temp.toFixed(0) + ' ℃', c.x, y + 16);
    }
    ctx.restore();
  }

  function drawToolCursor(ctx, opt) {
    var m = opt.mouse;
    ctx.save();
    ctx.font = '600 12px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    ctx.textAlign = 'left';
    var label = opt.toolLabel || '';
    if (label) {
      var w = ctx.measureText(label).width + 46;
      ctx.fillStyle = 'rgba(12,30,48,0.86)';
      roundRect(ctx, m.x + 14, m.y - 12, w, 24, 8); ctx.fill();
      ctx.fillStyle = '#7fd4ff';
      ctx.fillText(label, m.x + 26, m.y + 4);
    }
    ctx.restore();
  }

  /* 实验室背景。view 是画布可见范围在场景坐标下的矩形，
     用它把墙面和台面铺满整个画布，避免等比缩放后上下露出空白。 */
  function drawRoom(ctx, world, opt, view) {
    var S = CHEM.SCENE;
    var x0 = view ? Math.min(0, view.x0) : 0;
    var x1 = view ? Math.max(S.w, view.x1) : S.w;
    var y0 = view ? Math.min(0, view.y0) : 0;
    var y1 = view ? Math.max(S.h, view.y1) : S.h;
    var benchY = S.benchY;

    /* 墙面：刻意压深，让浅色玻璃器皿能清晰"跳"出来 */
    var g = ctx.createLinearGradient(0, y0, 0, benchY);
    g.addColorStop(0, '#b9cee0');
    g.addColorStop(0.55, '#a8c0d6');
    g.addColorStop(1, '#93aec8');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, benchY - y0);

    /* 墙面瓷砖缝（按绝对坐标取模，保证滚动/缩放时连续） */
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = 1;
    var T = 78;
    var gx = Math.ceil(x0 / T) * T;
    for (var x = gx; x <= x1; x += T) {
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, benchY); ctx.stroke();
    }
    var gy = Math.ceil(y0 / T) * T;
    for (var y = gy; y <= benchY; y += T) {
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }

    /* 台面 */
    var bg = ctx.createLinearGradient(0, benchY - 10, 0, Math.max(benchY + 120, y1));
    bg.addColorStop(0, '#3c4c5c');
    bg.addColorStop(0.06, '#2a3846');
    bg.addColorStop(1, '#151f28');
    ctx.fillStyle = bg;
    ctx.fillRect(x0, benchY - 8, x1 - x0, y1 - (benchY - 8));
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x0, benchY - 8, x1 - x0, 2.5);
    /* 台面高光反射 */
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x0, benchY + 6);
    ctx.lineTo(x1, benchY + 6);
    ctx.lineTo(x1, benchY + 30);
    ctx.lineTo(x0, benchY + 44);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  CHEM.Renderer = Renderer;
  CHEM.SHAPES = SHAPES;
  CHEM.roundRect = roundRect;
  /* 暴露给测试：直接验证"溶液到底是什么颜色"，不用截图 */
  CHEM.liquidColor = liquidColor;
  CHEM.turbidity = turbidity;
})(typeof window !== 'undefined' ? window : globalThis);
