/* =============================================================================
 * 虚拟化学实验室 —— 世界模型 (World)
 * -----------------------------------------------------------------------------
 * 设计要点
 *  1) 一切物质都用「物质的量 mmol」记账，从而可以真正按化学计量比反应。
 *       - 溶液：mmol = mL × 浓度(mol/L)      （1 mol/L = 1 mmol/mL）
 *       - 纯液体：mmol = mL × 密度 ÷ 摩尔质量 × 1000
 *       - 固体：mmol = g ÷ 摩尔质量 × 1000
 *       - 气体：mmol = mL ÷ 22.4
 *  2) 每个容器有 liquids / solids / gases 三个"相"的清单。
 *  3) 温度由热源（点亮的酒精灯）决定；有水时平台温度 100℃ 并沸腾。
 *  4) 倾倒只转移液相（含溶质），沉淀留在原容器 —— 这正是"倾析"的原理。
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});

  /* 场景尺寸（逻辑单位），渲染层按此做等比缩放 */
  var SCENE = { w: 1180, h: 660, benchY: 566 };
  CHEM.SCENE = SCENE;

  /* 常见溶液的浓度（mol/L）。澄清石灰水按饱和石灰水取值。 */
  var CONC = {
    hcl: 1.0, h2so4: 1.0, hno3: 1.0, h2o2: 1.0, h2co3: 0.05,
    hcl_conc: 12.0,            /* 浓盐酸约 12 mol/L，实验室制氯气要用它 */
    naohaq: 1.0, caoh2aq: 0.05,
    cuso4aq: 0.5, na2co3aq: 0.5, naclaq: 0.5,
    agno3: 0.1, bacl2: 0.5, nabr: 1.0, na2s: 1.0,
    phenolphthalein: 0.05, litmus: 0.05
  };
  CHEM.CONC = CONC;

  /* 纯液体密度（g/mL） */
  var DENSITY = { h2o: 1.0, c2h5oh: 0.789, h2o2: 1.0 };
  CHEM.DENSITY = DENSITY;

  /* 每次取用的默认量 */
  var DEFAULT_ML = 5;     // 倾倒 / 滴加一次加入的液体体积
  var DEFAULT_G = 0.5;    // 取用一次加入的固体质量

  var SEQ = 1;
  function uid(p) { return p + (SEQ++); }
  CHEM.newUid = uid;

  /* ---------------------- 物质的量换算 ---------------------- */
  function mmolPerMl(sub) {
    if (!sub) return 0;
    if (sub.phase === 'solution') return CONC[sub.id] !== undefined ? CONC[sub.id] : 1.0;
    if (sub.phase === 'liquid') {
      var d = DENSITY[sub.id] !== undefined ? DENSITY[sub.id] : 1.0;
      return sub.mm > 0 ? (d / sub.mm) * 1000 : 0;
    }
    if (sub.phase === 'gas') return 1 / 22.4;
    return 0;
  }
  function mmolPerG(sub) {
    if (!sub || !sub.mm) return 0;
    return 1000 / sub.mm;
  }
  function mlPerMmol(sub) { var v = mmolPerMl(sub); return v > 0 ? 1 / v : 0; }
  function gPerMmol(sub) { var v = mmolPerG(sub); return v > 0 ? 1 / v : 0; }

  /* 固体密度（g/cm³），用于估算"溶质本身占多大体积"。
     溶解过程几乎不改变溶液体积，所以溶质对体积的贡献很小，
     只有用这个值才能既让反应按 mmol 计量、又不会让液面凭空虚涨。 */
  var SOLID_DENSITY = {
    naoh: 2.13, nacl: 2.16, na2co3: 2.54, nahco3: 2.20, caco3: 2.71,
    cuso4: 3.60, agno3: 4.35, bacl2: 3.86, kmno4: 2.70, kclo3: 2.32,
    mno2: 5.03, cao: 3.34, caoh2: 2.21, cuo: 6.31, fe2o3: 5.24,
    mgo: 3.58, al2o3: 3.95, nh4hco3: 1.59, cu2oh2co3: 4.00,
    fe: 7.87, zn: 7.14, cu: 8.96, mg: 1.74, al: 2.70, ag: 10.49,
    c: 2.27, s: 2.07, p: 2.34, fes: 4.84
  };
  /* 1 mmol 某溶质本身占的体积（mL） */
  function soluteMlPerMmol(sub) {
    if (!sub || !sub.mm) return 0.02;
    var d = SOLID_DENSITY[sub.id] || SOLID_DENSITY[sub.base] || 2.2;
    return (sub.mm / d) / 1000;
  }

  CHEM.kinetics = {
    mmolPerMl: mmolPerMl,
    mmolPerG: mmolPerG,
    mlPerMmol: mlPerMmol,
    gPerMmol: gPerMmol,
    soluteMlPerMmol: soluteMlPerMmol
  };

  /* ---------------------- 工具函数 ---------------------- */
  function findEntry(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function findEntryByBase(list, base) {
    for (var i = 0; i < list.length; i++) {
      var s = CHEM.getSub(list[i].id);
      if (s && s.base === base) return list[i];
    }
    return null;
  }
  function ensureEntry(list, id) {
    var e = findEntry(list, id);
    if (!e) { e = { id: id }; list.push(e); }
    return e;
  }
  function dropEmpty(list) {
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      if ((e.ml !== undefined && e.ml <= 1e-6) || (e.g !== undefined && e.g <= 1e-6)) list.splice(i, 1);
    }
  }
  CHEM.listFind = findEntry;
  CHEM.listFindByBase = findEntryByBase;

  /* =========================================================================
   * 容器
   * ====================================================================== */
  function Container(type, x, y) {
    var app = CHEM.getApp(type);
    this.uid = uid('c');
    this.kind = 'container';
    this.type = type;
    this.x = x;
    this.y = y;                       // y = 底面中心
    this.name = app ? app.name : type;
    this.liquids = [];                // {id, ml, mmol}
    this.solids = [];                 // {id, g, mmol, precip:bool}
    this.gases = [];                  // {id, ml, mmol}
    this.temp = 25;                   // ℃
    this.heatPower = 0;               // 当前受热强度 0~1
    this.heatNote = '';               // 加热提示（如"量筒不能加热"）
    this.stir = 0;                    // 搅拌强度 0~1（会自然衰减）
    this.stirTimer = 0;
    this.tint = null;                 // 指示剂/变色覆盖色
    this.tintRule = null;
    this.ignited = false;             // 是否被点燃
    this.powered = false;             // 是否接通电源（电解水用）
    this.lighted = false;             // 是否被强光照射（光照条件下的反应用）
    this.boiling = false;
    this.broken = false;
    this.firedRules = Object.create(null);
    this.tests = Object.create(null);  // 做过的检验（带火星木条 / pH 试纸…），供实验步骤判定
    /* 这个容器**曾经**盛过哪些物质。
       实验步骤常写成"向四支试管中各加入稀盐酸"，可用户是一支一支加的：
       加完第一支反应就开始消耗盐酸，等加完第四支时第一支可能已经耗光了。
       只看"当前还有没有"会让这一步永远判不过去，所以另外记一份历史。 */
    this.everHad = Object.create(null);
    this.rackUid = null;              // 放在试管架上时记录架子 uid
    this.slot = -1;
    this.tubes = [];                  // 若本仪器是导管：连接的容器 uid 列表
    this.nozzleOn = false;            // 是否塞了单孔塞
    this.target = null;               // 装配到哪个容器上（分液漏斗 / 漏斗）
  }

  Container.prototype.apparatus = function () { return CHEM.getApp(this.type); };  Container.prototype.capacity = function () {
    var a = this.apparatus();
    return a ? a.capacity : 100;
  };
  Container.prototype.liquidVolume = function () {
    var v = 0;
    for (var i = 0; i < this.liquids.length; i++) v += this.liquids[i].ml;
    return v;
  };
  Container.prototype.gasVolume = function () {
    var v = 0;
    for (var i = 0; i < this.gases.length; i++) v += this.gases[i].ml;
    return v;
  };
  Container.prototype.solidMass = function () {
    var m = 0;
    for (var i = 0; i < this.solids.length; i++) m += this.solids[i].g;
    return m;
  };
  Container.prototype.isEmpty = function () {
    return !this.liquids.length && !this.solids.length && !this.gases.length;
  };
  /* 容器上方剩余空间（mL），气体可占据 */
  Container.prototype.headspace = function () {
    return Math.max(0, this.capacity() - this.liquidVolume());
  };
  Container.prototype.hasWater = function () {
    return !!findEntryByBase(this.liquids, 'h2o');
  };
  /* 是否存在"水溶液环境"：有纯水，或者任何一种溶液形态的液体。
     稀盐酸、氢氧化钠溶液本身就是水溶液，因此可以作为反应介质。 */
  Container.prototype.hasAqueous = function () {
    if (this.hasWater()) return true;
    for (var i = 0; i < this.liquids.length; i++) {
      var s = CHEM.getSub(this.liquids[i].id);
      if (s && s.phase === 'solution') return true;
    }
    return false;
  };
  /* 收集容器中出现的所有"母体"标识 */
  Container.prototype.species = function () {
    var set = Object.create(null);
    [this.liquids, this.solids, this.gases].forEach(function (list) {
      list.forEach(function (e) {
        var s = CHEM.getSub(e.id);
        if (s) set[s.base] = true;
      });
    });
    return set;
  };
  Container.prototype.hasBase = function (base) {
    var f = function (list) { return !!findEntryByBase(list, base); };
    return f(this.liquids) || f(this.solids) || f(this.gases);
  };
  /* 某母体的总物质的量 */
  Container.prototype.amountOf = function (base) {
    var t = 0;
    [this.liquids, this.solids, this.gases].forEach(function (list) {
      list.forEach(function (e) {
        var s = CHEM.getSub(e.id);
        if (s && s.base === base) t += e.mmol || 0;
      });
    });
    return t;
  };
  Container.prototype.displayName = function () {
    var a = this.apparatus();
    return a ? a.name : this.type;
  };

  Container.prototype.everHadBase = function (base) {
    return !!this.everHad[base];
  };

  /* ---- 加入物质 ---- */
  Container.prototype.addLiquid = function (id, ml) {
    var sub = CHEM.getSub(id);
    if (!sub) return 0;
    var room = this.capacity() - this.liquidVolume();
    var real = Math.max(0, Math.min(ml, room));
    if (real <= 1e-6) return 0;
    this.everHad[sub.base] = true;
    var e = ensureEntry(this.liquids, id);
    e.ml = (e.ml || 0) + real;
    e.mmol = (e.mmol || 0) + real * mmolPerMl(sub);
    return real;
  };
  Container.prototype.addSolid = function (id, g, isPrecip) {
    var sub = CHEM.getSub(id);
    if (!sub) return 0;
    this.everHad[sub.base] = true;
    var e = ensureEntry(this.solids, id);
    e.g = (e.g || 0) + g;
    e.mmol = (e.mmol || 0) + g * mmolPerG(sub);
    if (isPrecip) e.precip = true;
    return g;
  };
  /* 加入"已溶解的溶质"：按物质的量加入，体积只占溶质本身体积的一点点。
     溶解出的离子、反应生成的盐都走这条路径，避免液面凭空虚涨。 */
  Container.prototype.addSolute = function (id, mmol) {
    var sub = CHEM.getSub(id);
    if (!sub || mmol <= 1e-12) return 0;
    var ml = mmol * soluteMlPerMmol(sub);
    var room = this.capacity() - this.liquidVolume();
    if (ml > room) ml = Math.max(1e-5, room);
    var e = ensureEntry(this.liquids, id);
    e.ml = (e.ml || 0) + ml;
    e.mmol = (e.mmol || 0) + mmol;
    return mmol;
  };
  Container.prototype.addGas = function (id, ml) {
    var sub = CHEM.getSub(id);
    if (!sub) return 0;
    var room = this.headspace() - this.gasVolume();
    var real = Math.max(0, Math.min(ml, room));
    if (real <= 1e-6) return 0;
    this.everHad[sub.base] = true;
    var e = ensureEntry(this.gases, id);
    e.ml = (e.ml || 0) + real;
    e.mmol = (e.mmol || 0) + real * mmolPerMl(sub);
    return real;
  };

  /* 按母体扣除一定物质的量，返回实际扣除量。
     关键点：溶液里被消耗掉的是"溶质"，作为溶剂的水仍然留在容器中。
     例如 14 mL 澄清石灰水与 CO₂ 完全反应后，容器里应当剩下约 14 mL 水 + 碳酸钙沉淀，
     而不是液体凭空消失。所以这里按比例扣掉溶液体积后，再把等体积的水补回去。 */
  Container.prototype.consume = function (base, mmol) {
    var need = mmol, got = 0;
    var self = this;
    /* 优先消耗溶液/液体中的，其次固体，最后气体 */
    var order = [
      { list: this.liquids, kind: 'liquid' },
      { list: this.solids, kind: 'solid' },
      { list: this.gases, kind: 'gas' }
    ];
    for (var o = 0; o < order.length && need > 1e-9; o++) {
      var list = order[o].list, kind = order[o].kind;
      for (var i = list.length - 1; i >= 0 && need > 1e-9; i--) {
        var e = list[i], s = CHEM.getSub(e.id);
        if (!s || s.base !== base) continue;
        var avail = e.mmol || 0;
        if (avail <= 1e-12) continue;
        var take = Math.min(avail, need);
        var frac = take / avail;
        if (kind === 'liquid') {
          var vol = (e.ml || 0) * frac;
          e.ml -= vol;
          e.mmol = avail - take;
          /* 溶质被消耗后，溶剂（水）留在容器里 */
          if (s.base !== 'h2o' && vol > 1e-9) self.addLiquid('h2o', vol);
        } else if (kind === 'solid') {
          e.g = (e.g || 0) * (1 - frac);
          e.mmol = avail - take;
        } else {
          e.ml = (e.ml || 0) * (1 - frac);
          e.mmol = avail - take;
        }
        got += take; need -= take;
        if ((e.mmol || 0) <= 1e-9) list.splice(i, 1);
      }
    }
    return got;
  };

  Container.prototype.removeEntry = function (phase, id) {
    var list = phase === 'liquid' ? this.liquids : phase === 'solid' ? this.solids : this.gases;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list.splice(i, 1); return true; }
    }
    return false;
  };

  Container.prototype.cleanup = function () {
    dropEmpty(this.liquids); dropEmpty(this.solids); dropEmpty(this.gases);
  };

  /* 全部倒空 */
  Container.prototype.empty = function () {
    this.liquids = []; this.solids = []; this.gases = [];
    this.tint = null; this.ignited = false; this.temp = 25;
  };

  Container.prototype.describe = function () {
    var parts = [];
    var self = this;
    if (this.liquids.length) {
      parts.push('液体 ' + this.liquids.map(function (e) {
        var s = CHEM.getSub(e.id);
        return (s ? s.name : e.id) + ' ' + e.ml.toFixed(1) + ' mL';
      }).join('、'));
    }
    if (this.solids.length) {
      parts.push('固体 ' + this.solids.map(function (e) {
        var s = CHEM.getSub(e.id);
        return (s ? s.name : e.id) + ' ' + e.g.toFixed(2) + ' g';
      }).join('、'));
    }
    if (this.gases.length) {
      parts.push('气体 ' + this.gases.map(function (e) {
        var s = CHEM.getSub(e.id);
        return (s ? s.name : e.id) + ' ' + e.ml.toFixed(1) + ' mL';
      }).join('、'));
    }
    return parts.length ? parts.join('；') : '空';
  };

  /* 液面高度（内部单位，从底面算起） */
  Container.prototype.liquidLevel = function () {
    return CHEM.geometry.levelForVolume(this.type, this.liquidVolume());
  };

  /* =========================================================================
   * 装置（非容器）
   * ====================================================================== */
  function Device(type, x, y) {
    var app = CHEM.getApp(type);
    this.uid = uid('d');
    this.kind = 'device';
    this.type = type;
    this.x = x; this.y = y;
    this.name = app ? app.name : type;
    this.lit = false;        // 酒精灯是否点燃
    this.flame = 0;          // 火焰强度 0~1（用于动画）
    this.linkA = null;       // 导管两端
    this.linkB = null;
    this.onBench = true;
  }
  Device.prototype.apparatus = function () { return CHEM.getApp(this.type); };

  /* =========================================================================
   * World
   * ====================================================================== */
  function World() {
    this.items = [];                 // Container | Device
    this.log = [];                   // 实验记录
    this.time = 0;
    this.fx = new CHEM.FX();         // 粒子特效
    this.listeners = [];
  }

  World.prototype.on = function (fn) { this.listeners.push(fn); };
  World.prototype.emit = function (ev) {
    for (var i = 0; i < this.listeners.length; i++) this.listeners[i](ev);
  };

  World.prototype.containers = function () {
    return this.items.filter(function (i) { return i.kind === 'container'; });
  };
  World.prototype.devices = function () {
    return this.items.filter(function (i) { return i.kind === 'device'; });
  };
  World.prototype.byUid = function (u) {
    for (var i = 0; i < this.items.length; i++) if (this.items[i].uid === u) return this.items[i];
    return null;
  };

  /* 添加仪器，自动寻找空位 */
  World.prototype.add = function (type, x, y) {
    var app = CHEM.getApp(type);
    if (!app) return null;
    var it;
    if (app.category === 'container') it = new Container(type, x, y);
    else if (app.category === 'device') it = new Device(type, x, y);
    else return null;
    this.items.push(it);
    return it;
  };

  World.prototype.remove = function (uid) {
    for (var i = 0; i < this.items.length; i++) {
      if (this.items[i].uid === uid) { this.items.splice(i, 1); return true; }
    }
    return false;
  };

  World.prototype.clear = function () {
    this.items = [];
    this.log = [];
    this.fx.clear();
    this.time = 0;
  };

  /* 记录一条实验记录 */
  World.prototype.say = function (text, opt) {
    opt = opt || {};
    var entry = {
      t: this.time,
      text: text,
      kind: opt.kind || 'info',     // info | reaction | warn | test | success
      equation: opt.equation || null,
      uid: opt.uid || null
    };
    this.log.push(entry);
    this.emit({ type: 'log', entry: entry });
    return entry;
  };

  /* ---- 找到台面上的空位 ---- */
  World.prototype.freeSpot = function (type) {
    var cols = 15, startX = 62, stepX = 72;
    for (var c = 0; c < cols; c++) {
      var x = startX + c * stepX, ok = true;
      for (var i = 0; i < this.items.length; i++) {
        if (Math.abs(this.items[i].x - x) < 66) { ok = false; break; }
      }
      if (ok) return { x: x, y: SCENE.benchY };
    }
    /* 台面摆满了：随机错开，避免完全重叠 */
    return { x: 80 + Math.random() * (SCENE.w - 160), y: SCENE.benchY };
  };

  /* ---- 倾倒：把 from 的液相转移到 to ---- */
  World.prototype.pour = function (fromUid, toUid, fraction) {
    var from = this.byUid(fromUid), to = this.byUid(toUid);
    if (!from || !to || from === to) return 0;
    if (from.kind !== 'container') return 0;
    /* 倒进"架在容器上的漏斗"时，液体直接流进下面的容器 */
    if (to.kind !== 'container' && to.target) {
      var down = this.byUid(to.target);
      if (down) {
        this.say('液体经过' + to.name + '流入 ' + down.displayName() + '。', { kind: 'info', uid: down.uid });
        to = down;
      }
    }
    if (to.kind !== 'container') return 0;
    fraction = fraction === undefined ? 0.7 : fraction;
    var moved = 0;
    var room = to.capacity() - to.liquidVolume();
    if (room <= 1e-6) {
      this.say(to.displayName() + ' 已经盛满，无法继续倾倒。', { kind: 'warn', uid: toUid });
      return 0;
    }
    for (var i = from.liquids.length - 1; i >= 0; i--) {
      var e = from.liquids[i];
      var want = e.ml * fraction;
      var take = Math.min(want, room);
      if (take <= 1e-6) continue;
      var sub = CHEM.getSub(e.id);
      var got = to.addLiquid(e.id, take);
      var ratio = mmolPerMl(sub);
      e.ml -= got; e.mmol -= got * ratio;
      room -= got; moved += got;
      if (e.ml <= 1e-6) from.liquids.splice(i, 1);
    }
    /* 少量悬浮的细小固体（未沉降的沉淀）也会被带过去 */
    if (moved > 0) {
      this.say('把 ' + from.displayName() + ' 中的液体倒入 ' + to.displayName() + '（约 ' + moved.toFixed(1) + ' mL）。',
        { kind: 'info', uid: toUid });
    } else {
      this.say(from.displayName() + ' 中没有可以倒出的液体。', { kind: 'warn', uid: fromUid });
    }
    return moved;
  };

  /* ---- 加热判定 ---- */
  World.prototype.heatCheck = function (c) {
    var app = c.apparatus();
    if (!app) return { ok: false, power: 0, reason: '' };
    /* 先找下方点亮的酒精灯。没有热源时不该提示"这个仪器不能加热"。 */
    var best = null, bestD = 1e9;
    var devices = this.devices();
    for (var i = 0; i < devices.length; i++) {
      var d = devices[i];
      if (d.type !== 'alcoholLamp' || !d.lit) continue;
      var flameY = d.y - (CHEM.getApp('alcoholLamp').H + 30);
      var dx = Math.abs(d.x - c.x);
      var dy = c.y - flameY;                     // >0 表示容器底在火焰上方
      if (dx < 52 && dy > -14 && dy < 120) {
        var dist = dx + Math.abs(dy - 20);
        if (dist < bestD) { bestD = dist; best = d; }
      }
    }
    if (!best) return { ok: false, power: 0, reason: '' };

    if (app.heat === 'none') {
      return { ok: false, power: 0, reason: app.name + '不能加热，否则会因受热不均而炸裂。' };
    }
    /* 需要石棉网的仪器：检查中间有没有石棉网 */
    if (app.heat === 'net') {
      var hasNet = false;
      for (var j = 0; j < devices.length; j++) {
        var t = devices[j];
        if (t.type !== 'asbestosNet') continue;
        if (Math.abs(t.x - c.x) < 58 && c.y - t.y > -16 && c.y - t.y < 70) { hasNet = true; break; }
      }
      if (!hasNet) {
        return { ok: false, power: 0, reason: app.name + '不能直接加热，必须垫上石棉网使其受热均匀。' };
      }
    }
    var power = Math.max(0.35, Math.min(1, 1 - bestD / 130));
    return { ok: true, power: power, reason: '', lamp: best };
  };

  /* =========================================================================
   * 时间步进
   * ====================================================================== */
  World.prototype.step = function (dt) {
    dt = Math.min(dt, 0.06);
    this.time += dt;
    var cs = this.containers();
    for (var i = 0; i < cs.length; i++) this.stepContainer(cs[i], dt);
    this.stepGasTransfer(dt);
    this.stepDrip(dt);
    this.dockAttached();
    this.fx.step(this, dt);
  };

  World.prototype.stepContainer = function (c, dt) {
    var app = c.apparatus();
    if (!app) return;

    /* 1) 温度 */
    var h = this.heatCheck(c);
    c.heatPower = h.ok ? h.power : 0;
    c.heatNote = h.reason;
    var liquidVol = c.liquidVolume();
    if (c.heatPower > 0) {
      /* 正在被加热：向平台温度逼近。
         有水时平台温度就是 100℃（沸腾时吸热不升温）；
         没有液体时玻璃/瓷仪器可以被强热到上千度，这样"高温"条件
         （石灰石分解 900℃、铝热反应、高炉炼铁等）才真的做得到。 */
      var target = liquidVol > 0.5 ? 100 : 1000;
      c.temp += (target - c.temp) * c.heatPower * dt * 0.9;
    } else {
      /* 没有热源时向室温自然冷却 */
      c.temp += (25 - c.temp) * dt * 0.055;
    }
    if (c.temp < 25) c.temp = 25;

    /* 2) 沸腾与蒸发 */
    c.boiling = false;
    if (c.temp >= 99 && liquidVol > 0.5) {
      c.boiling = true;
      var w = findEntryByBase(c.liquids, 'h2o');
      if (w) {
        var evap = Math.min(w.ml, dt * 0.35 * (c.heatPower > 0 ? 1 : 0.2));
        w.ml -= evap; w.mmol -= evap * mmolPerMl(CHEM.getSub(w.id));
        this.fx.spawnSteam(c, 2);
      }
      var self = this;
      c.liquids.forEach(function (e) {
        if (e.ml > 0) self.fx.spawnBubble(c, e, 1);
      });
    }

    /* 3) 搅拌衰减 */
    if (c.stirTimer > 0) { c.stirTimer -= dt; c.stir = Math.min(1, c.stir + dt); }
    else c.stir = Math.max(0, c.stir - dt * 0.8);

    /* 4) 固体溶解 */
    this.stepDissolve(c, dt);

    /* 5) 化学反应 */
    CHEM.Reaction.tick(this, c, dt);

    /* 5.5) 通电时的电极现象 */
    if (c.powered && c.hasAqueous() && Math.random() < 0.5) {
      this.fx.spawnSparks(c, 1, '#7fd4ff');
      this.fx.spawnBubble(c, null, 1);
    }

    /* 6) 气体逸出与收集 */
    this.stepGasEscape(c, dt);

    /* 7) 清理 */
    c.cleanup();
  };

  /* 固体在足量水中逐渐溶解 */
  World.prototype.stepDissolve = function (c, dt) {
    if (!c.hasAqueous()) return;
    var waterMl = 0;
    for (var i = 0; i < c.liquids.length; i++) {
      var s = CHEM.getSub(c.liquids[i].id);
      if (s && (s.base === 'h2o' || s.phase === 'solution')) waterMl += c.liquids[i].ml;
    }
    if (waterMl < 0.5) return;
    for (var j = c.solids.length - 1; j >= 0; j--) {
      var e = c.solids[j], sub = CHEM.getSub(e.id);
      if (!sub || e.precip) continue;
      /* soluble: true 正常溶解；'slight'（微溶）也能溶，只是慢得多。
         碘单质就属于后者：它微溶于水，但溶在 KI 溶液里会让溶液显棕黄色，
         这条通路让"氯气通入碘化钾溶液，溶液变黄"这个现象能真的显示出来。 */
      var sol = sub.soluble;
      if (sol !== true && sol !== 'slight') continue;
      var slow = sol === 'slight' ? 0.32 : 1;
      var rate = 0.55 * slow * (1 + c.stir * 1.6) * Math.pow(1.9, (c.temp - 25) / 25) * dt * Math.min(1, waterMl / 8);
      var dissolve = Math.min(e.g, rate);
      if (dissolve <= 1e-6) continue;
      /* 溶解后以"溶质"形式进入液相（只占很少体积） */
      var solId = sub.phase === 'solid' ? pickSolutionId(sub) : e.id;
      c.addSolute(solId, dissolve * mmolPerG(sub));
      e.g -= dissolve; e.mmol -= dissolve * mmolPerG(sub);
      if (e.g <= 1e-6) c.solids.splice(j, 1);
    }
  };

  /* 固体的"溶液形态"条目：优先取同 base 且 phase 为 solution / liquid 的 */
  function pickSolutionId(sub) {
    var list = CHEM.SUBSTANCES_BY_BASE[sub.base] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].phase === 'solution') return list[i].id;
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].phase === 'liquid') return list[j].id;
    }
    return sub.id;
  }
  CHEM.pickSolutionId = pickSolutionId;

  /* 反应产生的气体：一部分逸出到容器空间，一部分溶解（若可溶） */
  World.prototype.stepGasEscape = function (c, dt) {
    var self = this;
    c.gases.forEach(function (g) {
      var sub = CHEM.getSub(g.id);
      if (!sub) return;
      /* 可溶气体缓慢溶解进水里 */
      if (sub.soluble === true && c.hasAqueous() && g.ml > 0.01) {
        var into = Math.min(g.ml, dt * 0.6);
        g.ml -= into; g.mmol -= into * mmolPerMl(sub);
        var solId = pickSolutionId(sub);
        c.addSolute(solId, into * mmolPerMl(sub));
      }
    });
    /* 敞口容器中的气体极缓慢逸散（集气瓶视为有瓶口，逸散更慢） */
    var leak = c.type === 'gasJar' ? 0.004 : 0.02;
    c.gases.forEach(function (g) {
      var out = g.ml * leak * dt;
      g.ml -= out; g.mmol -= out * mmolPerMl(CHEM.getSub(g.id));
    });
    dropEmpty(c.gases);
  };

  /* 导管导气：两端压力趋于一致 */
  World.prototype.stepGasTransfer = function (dt) {
    var tubes = this.devices().filter(function (d) { return d.type === 'deliveryTube' && d.linkA && d.linkB; });
    for (var i = 0; i < tubes.length; i++) {
      var a = this.byUid(tubes[i].linkA), b = this.byUid(tubes[i].linkB);
      if (!a || !b) continue;
      var ga = a.gasVolume(), gb = b.gasVolume();
      if (Math.abs(ga - gb) < 0.05) continue;
      var src = ga > gb ? a : b, dst = ga > gb ? b : a;
      var move = Math.min((Math.abs(ga - gb) / 2) * dt * 1.2, dst.headspace() - dst.gasVolume());
      if (move <= 1e-6) continue;
      /* 按比例搬运各组分 */
      var total = src.gasVolume();
      if (total <= 1e-9) continue;
      for (var k = src.gases.length - 1; k >= 0; k--) {
        var g = src.gases[k];
        var part = move * (g.ml / total);
        var ratio = mmolPerMl(CHEM.getSub(g.id));
        var got = dst.addGas(g.id, part);
        g.ml -= got; g.mmol -= got * ratio;
      }
      dropEmpty(src.gases);
    }
  };

  /* =========================================================================
   * 仪器之间的装配（连接）
   * ---------------------------------------------------------------------
   * 能装配的关系只有几种，都记在"上游装置"这一侧：
   *   导管  deliveryTube    linkA / linkB  ←→ 两个容器（导气）
   *   分液漏斗 separatoryFunnel target      →  下面的容器（逐滴加液）
   *   漏斗  funnel         target      →  下面的容器（过滤 / 引流）
   * ====================================================================== */
  var ATTACHABLE = { deliveryTube: 'gas', separatoryFunnel: 'drip', funnel: 'filter' };

  /* 某个仪器能接受哪种装配 */
  World.prototype.canAttach = function (upUid, downUid) {
    var up = this.byUid(upUid), down = this.byUid(downUid);
    if (!up || !down || upUid === downUid) return null;
    if (down.kind !== 'container') return null;
    var kind = ATTACHABLE[up.type];
    if (!kind) return null;
    if (kind === 'gas') {
      if (up.linkA && up.linkB) return null;
      if (up.linkA === downUid || up.linkB === downUid) return null;
      return kind;
    }
    if (up.target === downUid) return null;
    return kind;
  };

  World.prototype.attach = function (upUid, downUid) {
    var kind = this.canAttach(upUid, downUid);
    if (!kind) return false;
    var up = this.byUid(upUid), down = this.byUid(downUid);
    if (kind === 'gas') {
      if (!up.linkA) up.linkA = downUid; else up.linkB = downUid;
    } else {
      up.target = downUid;
    }
    var verb = kind === 'gas' ? '用导管把' :
      (kind === 'drip' ? '把分液漏斗装配到' : '把漏斗架在');
    this.say(verb + ' ' + up.name + ' 和 ' + down.displayName() + ' 连接起来。',
      { kind: 'info', uid: downUid });
    this.dockAttached();
    return true;
  };

  /* 断开某个装置上的所有连接 */
  World.prototype.detach = function (upUid) {
    var up = this.byUid(upUid);
    if (!up) return false;
    var had = up.linkA || up.linkB || up.target;
    up.linkA = null; up.linkB = null; up.target = null;
    if (had) this.say('断开了 ' + up.name + ' 的连接。', { kind: 'info' });
    return !!had;
  };

  /* 列出某个容器上连接了哪些仪器 */
  World.prototype.connectionsOf = function (uid) {
    var out = [];
    this.items.forEach(function (it) {
      if (it.kind !== 'device' && it.kind !== 'container') return;
      if (ATTACHABLE[it.type]) {
        if (it.linkA === uid || it.linkB === uid || it.target === uid) {
          out.push({ device: it, kind: ATTACHABLE[it.type] });
        }
      }
    });
    return out;
  };

  /* 装配好的下游装置自动停靠到目标容器的上方 */
  World.prototype.dockAttached = function () {
    var self = this;
    this.items.forEach(function (it) {
      if (!it.target) return;
      var down = self.byUid(it.target);
      if (!down) { it.target = null; return; }
      var b = CHEM.getApp(down.type);
      it.x = down.x;
      it.y = down.y - (b.H || 0) - 6;
    });
  };

  /* 分液漏斗里的液体逐滴流进下面的容器 */
  World.prototype.stepDrip = function (dt) {
    var cs = this.containers();
    for (var i = 0; i < cs.length; i++) {
      var f = cs[i];
      if (!f.target || f.type !== 'separatoryFunnel') continue;
      var to = this.byUid(f.target);
      if (!to || to.kind !== 'container') continue;
      if (f.liquidVolume() <= 0.01) continue;
      var budget = 4.5 * dt;                     // mL/s，模拟"半开旋塞"
      for (var j = f.liquids.length - 1; j >= 0 && budget > 1e-6; j--) {
        var e = f.liquids[j];
        var take = Math.min(e.ml, budget);
        if (take <= 1e-6) continue;
        var sub = CHEM.getSub(e.id);
        var got = to.addLiquid(e.id, take);
        e.ml -= got;
        e.mmol -= got * mmolPerMl(sub);
        budget -= got;
        if (e.ml <= 1e-6) f.liquids.splice(j, 1);
      }
    }
  };

  /* 便捷操作 -------------------------------------------------------------- */
  World.prototype.addReagent = function (uid, subId, amount) {
    var c = this.byUid(uid);
    if (!c || c.kind !== 'container') return 0;
    var sub = CHEM.getSub(subId);
    if (!sub) return 0;
    var added = 0, unit = '';
    if (sub.phase === 'gas') {
      added = c.addGas(subId, amount || 60); unit = ' mL';
      if (added > 0) this.say('向 ' + c.displayName() + ' 中通入 ' + added.toFixed(1) + ' mL ' + sub.name + '。', { kind: 'info', uid: uid });
    } else if (sub.phase === 'solid' || sub.phase === 'paper') {
      added = c.addSolid(subId, amount || DEFAULT_G);
      unit = ' g';
      if (added > 0) this.say('向 ' + c.displayName() + ' 中加入 ' + added.toFixed(2) + ' g ' + sub.name + '。', { kind: 'info', uid: uid });
    } else {
      added = c.addLiquid(subId, amount || DEFAULT_ML);
      unit = ' mL';
      if (added > 0) {
        var verb = added <= 3 ? '滴加' : '加入';
        this.say('向 ' + c.displayName() + ' 中' + verb + ' ' + added.toFixed(1) + ' mL ' + sub.name + '。', { kind: 'info', uid: uid });
      } else {
        this.say(c.displayName() + ' 已经盛满，无法再加入液体。', { kind: 'warn', uid: uid });
      }
    }
    return added;
  };

  /* 通断电（电解水等需要电源的实验） */
  World.prototype.setPower = function (uid, on) {
    var c = this.byUid(uid);
    if (!c || c.kind !== 'container') return;
    c.powered = on === undefined ? !c.powered : !!on;
    this.say(c.powered
      ? '给 ' + c.displayName() + ' 接通直流电源，开始通电。'
      : '断开 ' + c.displayName() + ' 的电源。', { kind: 'info', uid: uid });
  };

  /* 光照（甲烷氯代、次氯酸分解等需要光照的反应） */
  World.prototype.setLight = function (uid, on) {
    var c = this.byUid(uid);
    if (!c || c.kind !== 'container') return;
    c.lighted = on === undefined ? !c.lighted : !!on;
    this.say(c.lighted
      ? '用强光照射 ' + c.displayName() + '（模拟太阳光 / 高压汞灯）。'
      : '停止照射 ' + c.displayName() + '。', { kind: 'info', uid: uid });
  };

  /* 搅拌 */
  World.prototype.stir = function (uid) {
    var c = this.byUid(uid);
    if (!c || c.kind !== 'container') return;
    c.stirTimer = 2.2; c.stir = Math.max(c.stir, 0.5);
    this.say('用玻璃棒搅拌 ' + c.displayName() + ' 中的物质，可以加快溶解和反应速率。', { kind: 'info', uid: uid });
  };

  /* 点燃 */
  World.prototype.ignite = function (uid) {
    var it = this.byUid(uid);
    if (!it) return;
    if (it.kind === 'device' && it.type === 'alcoholLamp') {
      it.lit = !it.lit;
      this.say(it.lit ? '用火柴点燃酒精灯（用外焰加热）。' : '用灯帽盖灭酒精灯，不能用嘴吹灭。', { kind: 'info' });
      return;
    }
    if (it.kind === 'container') {
      it.ignited = true;
      this.say('点燃 ' + it.displayName() + ' 中的物质。', { kind: 'info', uid: uid });
    }
  };

  /* 熄灭酒精灯 */
  World.prototype.extinguish = function (uid) {
    var it = this.byUid(uid);
    if (it && it.type === 'alcoholLamp') { it.lit = false; }
  };

  /* 导管连接：把 a、b 两个容器用导管连起来 */
  World.prototype.connect = function (tubeUid, aUid, bUid) {
    var t = this.byUid(tubeUid);
    if (!t || t.type !== 'deliveryTube') return false;
    t.linkA = aUid; t.linkB = bUid;
    var A = this.byUid(aUid), B = this.byUid(bUid);
    this.say('用导管把 ' + (A ? A.displayName() : '?') + ' 和 ' + (B ? B.displayName() : '?') + ' 连接起来。', { kind: 'info' });
    return true;
  };

  /* 保存 / 读取 ---------------------------------------------------------- */
  World.prototype.toJSON = function () {
    return {
      time: this.time,
      log: this.log.slice(-200),
      items: this.items.map(function (it) {
        var o = { uid: it.uid, kind: it.kind, type: it.type, x: it.x, y: it.y };
        if (it.kind === 'container') {
          o.liquids = it.liquids; o.solids = it.solids; o.gases = it.gases;
          o.temp = it.temp; o.tint = it.tint; o.ignited = it.ignited; o.rackUid = it.rackUid; o.slot = it.slot;
          o.firedRules = Object.keys(it.firedRules);
        } else {
          o.lit = it.lit; o.linkA = it.linkA; o.linkB = it.linkB;
        }
        return o;
      })
    };
  };

  World.prototype.load = function (data) {
    this.clear();
    if (!data) return;
    var self = this;
    this.time = data.time || 0;
    this.log = data.log || [];
    (data.items || []).forEach(function (o) {
      var it = self.add(o.type, o.x, o.y);
      if (!it) return;
      if (o.kind === 'container') {
        it.liquids = o.liquids || []; it.solids = o.solids || []; it.gases = o.gases || [];
        it.temp = o.temp || 25; it.tint = o.tint || null; it.ignited = !!o.ignited;
        it.rackUid = o.rackUid || null; it.slot = o.slot === undefined ? -1 : o.slot;
        (o.firedRules || []).forEach(function (r) { it.firedRules[r] = 1; });
      } else {
        it.lit = !!o.lit; it.linkA = o.linkA || null; it.linkB = o.linkB || null;
      }
    });
  };

  /* =========================================================================
   * 导出
   * ====================================================================== */
  CHEM.Container = Container;
  CHEM.Device = Device;
  CHEM.World = World;
  CHEM.DEFAULT_ML = DEFAULT_ML;
  CHEM.DEFAULT_G = DEFAULT_G;
})(typeof window !== 'undefined' ? window : globalThis);
