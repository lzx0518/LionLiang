/* =============================================================================
 * 虚拟化学实验室 —— 粒子特效 (FX)
 * -----------------------------------------------------------------------------
 * 所有粒子坐标都是"容器局部坐标"：
 *      p.x = 相对容器中心线的水平偏移
 *      p.u = 距容器底面的高度
 * 渲染层再把它们换算成画布坐标，因此容器移动时粒子会跟着走。
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function FX() {
    this.parts = [];      // 通用粒子
    this.t = 0;
  }

  FX.prototype.clear = function () { this.parts.length = 0; };

  FX.prototype.push = function (p) {
    if (this.parts.length < 1200) this.parts.push(p);
  };

  /* ---- 生成器 ---- */

  /* 气泡：从容器底部升起 */
  FX.prototype.spawnBubble = function (c, entry, n) {
    var geo = CHEM.geometry, type = c.type;
    var level = geo.levelForVolume(type, c.liquidVolume());
    if (level < 4) return;
    for (var i = 0; i < (n || 1); i++) {
      var u = rnd(2, Math.max(3, level * 0.5));
      var w = geo.halfWidthAt(type, u) * 0.85;
      this.push({
        kind: 'bubble', uid: c.uid,
        x: rnd(-w, w), u: u,
        r: rnd(1.1, 2.6),
        v: rnd(14, 30),
        level: level,
        life: 0, max: rnd(1.2, 2.6)
      });
    }
  };

  /* 沉淀：从液体中析出并下沉堆积 */
  FX.prototype.spawnPrecipitate = function (c, color, n) {
    var geo = CHEM.geometry, type = c.type;
    var level = geo.levelForVolume(type, c.liquidVolume());
    if (level < 4) level = 8;
    for (var i = 0; i < (n || 6); i++) {
      var u = rnd(level * 0.25, level);
      var w = geo.halfWidthAt(type, u) * 0.8;
      this.push({
        kind: 'ppt', uid: c.uid,
        x: rnd(-w, w), u: u,
        r: rnd(0.8, 2.0),
        v: rnd(6, 14),
        color: color,
        life: 0, max: rnd(2.5, 5)
      });
    }
  };

  /* 水蒸气 / 白雾：液面上方飘散 */
  FX.prototype.spawnSteam = function (c, n) {
    var geo = CHEM.geometry, type = c.type;
    var level = geo.levelForVolume(type, c.liquidVolume());
    for (var i = 0; i < (n || 1); i++) {
      this.push({
        kind: 'steam', uid: c.uid,
        x: rnd(-6, 6), u: level + rnd(2, 14),
        r: rnd(3, 7),
        v: rnd(16, 30), drift: rnd(-8, 8),
        life: 0, max: rnd(0.9, 1.8)
      });
    }
  };

  /* 白烟（红磷燃烧） */
  FX.prototype.spawnSmoke = function (c, n, color) {
    var app = c.apparatus(), H = app ? app.H : 60;
    for (var i = 0; i < (n || 1); i++) {
      this.push({
        kind: 'smoke', uid: c.uid,
        x: rnd(-8, 8), u: rnd(H * 0.15, H * 0.9),
        r: rnd(4, 9),
        v: rnd(10, 22), drift: rnd(-12, 12),
        color: color || '#f2f4f8',
        life: 0, max: rnd(1.4, 2.8)
      });
    }
  };

  /* 火星四射（铁在氧气中燃烧） */
  FX.prototype.spawnSparks = function (c, n, color) {
    var app = c.apparatus(), H = app ? app.H : 60;
    for (var i = 0; i < (n || 1); i++) {
      this.push({
        kind: 'spark', uid: c.uid,
        x: rnd(-6, 6), u: rnd(4, H * 0.55),
        vx: rnd(-70, 70), vy: rnd(20, 90),
        r: rnd(1, 2.2),
        color: color || '#ffb347',
        life: 0, max: rnd(0.35, 0.8)
      });
    }
  };

  /* 火焰（可燃气体燃烧 / 燃烧匙） */
  FX.prototype.spawnFlame = function (c, n, color) {
    var app = c.apparatus(), H = app ? app.H : 60;
    for (var i = 0; i < (n || 1); i++) {
      this.push({
        kind: 'flame', uid: c.uid,
        x: rnd(-5, 5), u: rnd(H * 0.1, H * 0.7),
        r: rnd(4, 9),
        v: rnd(18, 36), drift: rnd(-6, 6),
        color: color || '#7fb3ff',
        life: 0, max: rnd(0.4, 0.9)
      });
    }
  };

  /* 溶解：彩色细流从固体处散开 */
  FX.prototype.spawnDissolve = function (c, color, n) {
    var app = c.apparatus(), H = app ? app.H : 60;
    for (var i = 0; i < (n || 3); i++) {
      this.push({
        kind: 'dissolve', uid: c.uid,
        x: rnd(-10, 10), u: rnd(1, H * 0.3),
        r: rnd(2, 5),
        v: rnd(4, 12), drift: rnd(-14, 14),
        color: color || '#9ec7ea',
        life: 0, max: rnd(0.6, 1.4)
      });
    }
  };

  /* 液滴（倾倒 / 滴加时的小动画） */
  FX.prototype.spawnDrop = function (c, color, n) {
    var app = c.apparatus(), H = app ? app.H : 60;
    for (var i = 0; i < (n || 1); i++) {
      this.push({
        kind: 'drop', uid: c.uid,
        x: rnd(-3, 3), u: H + rnd(10, 26),
        r: rnd(1.6, 3),
        v: -160,
        color: color || '#bfe0f5',
        life: 0, max: 0.5
      });
    }
  };

  /* ---- 步进 ---- */
  FX.prototype.step = function (world, dt) {
    this.t += dt;
    var geo = CHEM.geometry;
    var keep = [];
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      p.life += dt;
      if (p.life >= p.max) continue;

      if (p.kind === 'bubble') {
        p.u += p.v * dt;
        p.x += Math.sin((p.life + p.u) * 6) * 0.35;
        if (p.u >= p.level - 1) continue;      // 到液面破裂
      } else if (p.kind === 'ppt') {
        p.u -= p.v * dt;
        if (p.u < 1.2) {
          p.u = 1.2;
          p.settled = true;
          if (p.life > 1.6) continue;          // 沉降后渐隐
        }
      } else if (p.kind === 'spark') {
        p.x += p.vx * dt; p.u += p.vy * dt;
        p.vy -= 180 * dt;
        if (p.u < 0) continue;
      } else if (p.kind === 'drop') {
        p.u += p.v * dt;
        if (p.u < 2) continue;
      } else {
        /* steam / smoke / flame / dissolve */
        p.u += p.v * dt;
        if (p.drift) p.x += p.drift * dt;
        p.r += dt * (p.kind === 'flame' ? -4 : 5);
      }
      keep.push(p);
    }
    this.parts = keep;
  };

  /* 取某个容器的粒子 */
  FX.prototype.forContainer = function (uid) {
    var out = [];
    for (var i = 0; i < this.parts.length; i++) if (this.parts[i].uid === uid) out.push(this.parts[i]);
    return out;
  };

  /* 是否有正在冒气泡的粒子（渲染时判断是否画液面扰动） */
  FX.prototype.hasBubbles = function (uid) {
    for (var i = 0; i < this.parts.length; i++) {
      if (this.parts[i].uid === uid && this.parts[i].kind === 'bubble') return true;
    }
    return false;
  };

  CHEM.FX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
