/* =============================================================================
 * 虚拟实验室 —— 物理模块核心 (js/physics/core.js)
 * -----------------------------------------------------------------------------
 * 与化学引擎完全平行的学科模块：
 *   · PHY.registerSim(def)        注册一个仿真主题（电学 / 光学 / 力学……）
 *   · PHY.registerTasks(list)     注册物理教材实验（带步骤判定）
 *   · PHY.setSubject('phys')      学科切换（化学界面隐藏，物理界面接管）
 *   · PHY.tick(dt)                主循环推进当前仿真（由 app.js 的帧循环调用）
 *   · PHY.startTask(id)           选中物理实验：加载仿真 + 复用实验流程指引栏
 *
 * 每个仿真 def = { id, name, field, icon, level, desc, controls?, create(env) }
 * create 返回实例：{ update(dt), draw(g,W,H), onDown?, onMove?, onUp?,
 *                    set?(id,v), action?(id), hint?(), info?() }
 * 实验步骤的 check(sim) 直接读仿真实例上的状态字段/方法。
 * ========================================================================== */
(function (root) {
  'use strict';

  var PHY = (root.PHY = root.PHY || {});

  /* ---------------- 注册表 ---------------- */
  PHY.SIMS = [];
  PHY.SIM_MAP = Object.create(null);
  PHY.TASKS = [];

  PHY.registerSim = function (def) {
    PHY.SIMS.push(def);
    PHY.SIM_MAP[def.id] = def;
    return def;
  };
  PHY.registerTasks = function (list) {
    PHY.TASKS = PHY.TASKS.concat(list);
    return list.length;
  };

  /* ---------------- 常用工具 ---------------- */
  PHY.G = 9.8;                                   // 重力加速度 m/s²
  PHY.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  PHY.lerp = function (a, b, t) { return a + (b - a) * t; };
  PHY.fmt = function (v, d) {
    if (v === undefined || v === null || !isFinite(v)) return '—';
    if (d === undefined) d = 2;
    return Number(v).toFixed(d);
  };
  /* 按有效数字截断，用于读数显示 */
  PHY.sig = function (v, n) {
    if (!isFinite(v) || v === 0) return v === 0 ? '0' : '—';
    var e = Math.floor(Math.log10(Math.abs(v)));
    var d = Math.max(0, n - 1 - e);
    return v.toFixed(Math.min(4, d));
  };
  PHY.FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
  PHY.mono = '"Consolas", "SFMono-Regular", "Menlo", monospace';

  /* 带箭头的线段（矢量、光线、力） */
  PHY.arrow = function (g, x1, y1, x2, y2, color, w, head) {
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var hl = head || 9;
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w || 2;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 - hl * Math.cos(ang - 0.42), y2 - hl * Math.sin(ang - 0.42));
    g.lineTo(x2 - hl * Math.cos(ang + 0.42), y2 - hl * Math.sin(ang + 0.42));
    g.closePath(); g.fill();
  };
  /* 圆角矩形路径（不直接用 ctx.roundRect，兼容旧环境与测试桩） */
  PHY.rr = function (g, x, y, w, h, r) {
    r = Math.min(r || 6, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
    g.closePath();
  };
  /* 浅色卡片面板 */
  PHY.panel = function (g, x, y, w, h, title) {
    g.save();
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.strokeStyle = '#c3d5e4'; g.lineWidth = 1;
    PHY.rr(g, x, y, w, h, 8); g.fill(); g.stroke();
    if (title) {
      g.fillStyle = '#3d5a72';
      g.font = '600 12px ' + PHY.FONT;
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText(title, x + 10, y + 8);
    }
    g.restore();
  };
  PHY.tag = function (g, x, y, text, bg, fg) {
    g.save();
    g.font = '600 11px ' + PHY.FONT;
    var w = g.measureText(text).width + 14;
    g.fillStyle = bg || '#1e9fd8';
    PHY.rr(g, x, y, w, 18, 9); g.fill();
    g.fillStyle = fg || '#fff';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(text, x + 7, y + 10);
    g.restore();
    return w;
  };
  PHY.distToSeg = function (px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var L2 = dx * dx + dy * dy;
    var t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
    t = PHY.clamp(t, 0, 1);
    var qx = x1 + t * dx, qy = y1 + t * dy;
    return Math.hypot(px - qx, py - qy);
  };

  /* ---------------- 内部状态 ---------------- */
  var el = null, g = null;
  var state = {
    W: 1000, H: 660,
    sim: null, simDef: null,
    time: 0,
    infoT: 0,
    logs: [],
    toastTimer: null,
    valEls: {},
    savedLevels: null,
    chemLevel: null
  };
  var guide = { task: null, step: 0, peek: -1 };

  PHY.guide = guide;
  PHY.state = state;                    // 便于测试观察

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  /* 写 CSS 自定义属性（分组色条用），对没有 setProperty 的实现留个兜底 */
  function setVar(node, key, val) {
    if (!node || !node.style) return;
    if (typeof node.style.setProperty === 'function') node.style.setProperty(key, val);
    else node.style[key] = val;
  }

  /* ---------------- 实验记录 / 提示 ---------------- */
  PHY.toast = function (msg) {
    if (!el || !el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2200);
  };

  function fmtTime(t) {
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  PHY.log = function (text, equation, kind) {
    var entry = { t: state.time, text: text, equation: equation || '', kind: kind || 'info' };
    state.logs.push(entry);
    if (state.logs.length > 300) state.logs.shift();
    if (el && el.logList && PHY.subject === 'phys') {
      pushLogDom(entry);
    }
    return entry;
  };
  function pushLogDom(entry) {
    var empty = el.logList.querySelector('.log-empty');
    if (empty) empty.remove();
    var item = h('div', 'log-item kind-' + entry.kind);
    item.appendChild(h('div', 'log-time', fmtTime(entry.t)));
    var main = h('div', 'log-main');
    main.appendChild(h('div', 'log-text', entry.text));
    if (entry.equation) main.appendChild(h('div', 'log-eq', entry.equation));
    item.appendChild(main);
    el.logList.appendChild(item);
    el.logList.scrollTop = el.logList.scrollHeight;
    while (el.logList.children.length > 300) el.logList.removeChild(el.logList.firstChild);
  }
  PHY.clearLog = function () {
    state.logs = [];
    if (!el || !el.logList) return;
    el.logList.innerHTML = '<p class="muted log-empty">实验过程中发生的现象和数据都会记录在这里。</p>';
  };
  function rebuildLogDom() {
    if (!el || !el.logList) return;
    el.logList.innerHTML = '';
    state.logs.forEach(pushLogDom);
    if (!state.logs.length) {
      el.logList.innerHTML = '<p class="muted log-empty">实验过程中发生的现象和数据都会记录在这里。</p>';
    }
  }

  /* ---------------- 仿真生命周期 ---------------- */
  function makeEnv() {
    return {
      get W() { return state.W; },
      get H() { return state.H; },
      /* 注意这里是**函数**：仿真里写的是 env.level()（见文件头的接口约定）。
         以前这里是个 getter 返回值，而电路仿真调 env.level()，
         结果一点电源就抛 "env.level is not a function"，控制条再也刷不出来。 */
      level: function () { return (root.CHEM && CHEM.level) || 'all'; },
      toast: PHY.toast,
      log: PHY.log,
      setControls: function (list) { renderControls(list); },
      /* 按钮改变了滑块背后的值时（例如「测遏止电压」把电压调到了 −U_c），
         让控制条重新渲染一次，否则滑块位置和真实值会对不上。 */
      syncControls: function () { syncControls(); },
      invalidateInfo: function () { state.infoT = 0; }
    };
  }

  function syncControls() {
    if (!state.simDef) return;
    var def = state.simDef;
    renderControls(typeof def.controls === 'function' ? def.controls(state.sim) : (def.controls || []));
  }

  PHY.loadSim = function (id, preset, silent) {
    var def = PHY.SIM_MAP[id];
    if (!def) return null;
    stopSimInstance();
    var inst = null;
    try {
      inst = def.create(makeEnv());
    } catch (e) {
      PHY.toast('仿真初始化失败：' + e.message);
      return null;
    }
    state.sim = inst;
    state.simDef = def;
    if (preset && inst.applyPreset) inst.applyPreset(preset);
    renderControls(typeof def.controls === 'function' ? def.controls(inst) : (def.controls || []));
    state.infoT = 0;
    refreshInfo();
    updateTopicsActive();
    updateHead();
    if (!silent) {
      PHY.log('进入「' + def.name + '」。' + (def.desc || ''), '', 'info');
      PHY.toast('已打开：' + def.name);
    }
    if (el && el.phyHint) el.phyHint.classList.add('hidden');
    return inst;
  };

  function stopSimInstance() {
    if (state.sim && state.sim.destroy) {
      try { state.sim.destroy(); } catch (e) { /* 忽略 */ }
    }
    state.sim = null;
    state.simDef = null;
    if (el && el.phyControls) el.phyControls.innerHTML = '';
    state.valEls = {};
  }

  PHY.stopSim = function () {
    stopSimInstance();
    updateTopicsActive();
    updateHead();
    if (el && el.phyHint) el.phyHint.classList.remove('hidden');
  };

  PHY.resetSim = function () {
    if (!state.simDef) { PHY.toast('先从左侧选择一个物理仿真主题。'); return; }
    var id = state.simDef.id;
    var preset = guide.task && guide.task.sim === id ? guide.task.preset : null;
    PHY.loadSim(id, preset, true);
    /* 重置仿真 = 从头再做一遍，步骤进度也要跟着回到第一步，
       否则会出现"器材是全新的、步骤条却全打勾"的矛盾状态。 */
    if (guide.task) {
      guide.step = 0;
      guide.peek = -1;
      renderGuide();
      PHY.log('已重置实验，步骤进度回到第 1 步。', '', 'info');
    }
    updateHead();
    PHY.toast('已重置：' + state.simDef.name);
  };

  function currentSim() { return state.sim; }
  PHY.currentSim = currentSim;

  /* ---------------- 主循环 ---------------- */
  PHY.tick = function (dt) {
    if (PHY.subject !== 'phys') return;
    dt = Math.min(0.05, dt || 0.016);
    state.time += dt;
    var sim = state.sim;
    if (sim) {
      try { sim.update(dt); } catch (e) {
        if (!state._errOnce) {
          state._errOnce = true;
          PHY.log('仿真运行出错：' + e.message, '', 'warn');
        }
      }
      drawSim();
      if (state.time - state.infoT > 0.35) {
        state.infoT = state.time;
        refreshInfo();
      }
      if (el && el.statusText) el.statusText.textContent = sim.hint ? (sim.hint() || '') : '';
      checkGuide();
    }
  };

  function drawSim() {
    if (!g || !state.sim) return;
    var W = state.W, H = state.H;
    g.save();
    g.clearRect(0, 0, W, H);
    try { state.sim.draw(g, W, H); } catch (e) { /* 单帧绘制失败不中断 */ }
    g.restore();
  }

  function refreshInfo() {
    if (!el || !el.inspBody) return;
    var sim = state.sim;
    if (!sim) {
      el.inspBody.innerHTML = '<p class="muted">从左侧选择一个物理仿真主题开始。选中实验台上的对象可以查看读数。</p>';
      return;
    }
    if (!sim.info) return;
    var html;
    try { html = sim.info(); } catch (e) { html = '<p class="muted">读数生成失败：' + e.message + '</p>'; }
    el.inspBody.innerHTML = html;
  }

  function updateHead() {
    if (!el) return;
    if (state.simDef) {
      el.modeBadge.textContent = state.simDef.name;
      el.statusText.textContent = state.sim ? (state.sim.hint ? (state.sim.hint() || '') : '') : '';
      el.taskProgress.textContent = guide.task
        ? '第 ' + Math.min(guide.step + 1, guide.task.steps.length) + ' / ' + guide.task.steps.length + ' 步'
        : '自由探索';
    } else {
      el.modeBadge.textContent = '物理 · 自由探索';
      el.statusText.textContent = '从左侧「物理仿真」里选一个主题';
      el.taskProgress.textContent = guide.task ? '' : '自由探索';
    }
  }

  /* ---------------- 控制条（DOM 控件） ---------------- */
  function fmtVal(item, v) {
    if (item.fmt) return item.fmt(v);
    var d = (item.step !== undefined && item.step < 1) ? (item.step < 0.01 ? 3 : 2) : 0;
    return Number(v).toFixed(d) + (item.unit ? ' ' + item.unit : '');
  }

  function renderControls(list) {
    if (!el || !el.phyControls) return;
    el.phyControls.innerHTML = '';
    state.valEls = {};
    (list || []).forEach(function (item) {
      if (item.type === 'slider') {
        var wrap = h('div', 'phy-ctl');
        wrap.appendChild(h('label', 'phy-ctl-label', item.label));
        var r = document.createElement('input');
        r.type = 'range';
        r.min = item.min; r.max = item.max; r.step = item.step === undefined ? 1 : item.step;
        r.value = item.value === undefined ? item.min : item.value;
        var val = h('span', 'phy-ctl-val', fmtVal(item, Number(r.value)));
        r.addEventListener('input', function () {
          val.textContent = fmtVal(item, Number(r.value));
          if (state.sim && state.sim.set) state.sim.set(item.id, Number(r.value));
        });
        wrap.appendChild(r); wrap.appendChild(val);
        el.phyControls.appendChild(wrap);
        state.valEls[item.id] = { item: item, input: r, val: val };
      } else if (item.type === 'select') {
        var wrap2 = h('div', 'phy-ctl');
        wrap2.appendChild(h('label', 'phy-ctl-label', item.label));
        var s = document.createElement('select');
        (item.options || []).forEach(function (op) {
          var o = document.createElement('option');
          o.value = op.v; o.textContent = op.t;
          s.appendChild(o);
        });
        s.value = item.value;
        s.addEventListener('change', function () {
          if (state.sim && state.sim.set) state.sim.set(item.id, s.value);
        });
        wrap2.appendChild(s);
        el.phyControls.appendChild(wrap2);
        state.valEls[item.id] = { item: item, input: s };
      } else if (item.type === 'button') {
        var b = h('button', 'phy-btn' + (item.primary ? ' primary' : '') + (item.danger ? ' danger' : ''), item.label);
        b.type = 'button';
        b.title = item.tip || '';
        b.addEventListener('click', function () {
          if (state.sim && state.sim.action) state.sim.action(item.id);
        });
        el.phyControls.appendChild(b);
      } else if (item.type === 'note') {
        el.phyControls.appendChild(h('span', 'phy-note', item.text));
      } else if (item.type === 'sep') {
        el.phyControls.appendChild(h('span', 'toolbar-sep'));
      }
    });
  }

  /* 编程式设置控件值（测试 / 实验脚本用） */
  PHY.setControl = function (id, v) {
    var rec = state.valEls[id];
    if (!rec) return false;
    rec.input.value = v;
    if (rec.val) rec.val.textContent = fmtVal(rec.item, Number(v));
    if (state.sim && state.sim.set) state.sim.set(id, Number(v));
    return true;
  };

  /* ---------------- 左侧：物理仿真主题架 ---------------- */
  var FIELDS = [
    { id: 'mech', name: '力学' },
    { id: 'sound', name: '声学' },
    { id: 'thermal', name: '热学' },
    { id: 'optics', name: '光学' },
    { id: 'elec', name: '电学' },
    { id: 'em', name: '电磁学' },
    { id: 'modern', name: '近代物理' }
  ];
  var FIELD_COLOR = {
    mech: '#8b6fd8', sound: '#e0a13c', thermal: '#e2603c', optics: '#1e9fd8',
    elec: '#2fa96b', em: '#d3577e', modern: '#7d93a8'
  };

  function levelOK(lv) {
    if (!lv || lv === 'both') return true;
    var cur = (root.CHEM && CHEM.level) || 'all';
    return cur === 'all' || cur === lv;
  }
  PHY.levelOK = levelOK;

  function levelLabel(lv) {
    if (lv === 'junior') return '初中';
    if (lv === 'senior') return '高中';
    return '初高中';
  }

  PHY.buildTopics = function () {
    if (!el || !el.phyTopics) return;
    el.phyTopics.innerHTML = '';
    var total = 0;
    FIELDS.forEach(function (f) {
      var sims = PHY.SIMS.filter(function (s) { return s.field === f.id && levelOK(s.level); });
      if (!sims.length) return;
      total += sims.length;
      var grp = h('div', 'shelf-group phy-group');
      var title = h('h4', 'group-title', f.name);
      setVar(title, '--cat', FIELD_COLOR[f.id] || '#1e9fd8');
      grp.appendChild(title);
      var grid = h('div', 'group-grid');
      sims.forEach(function (s) {
        var b = h('button', 'item-card phy-card' + (state.simDef && state.simDef.id === s.id ? ' active' : ''));
        b.type = 'button';
        b.dataset.sim = s.id;
        b.title = (s.desc || '') + '\n' + (s.tip || '') + '\n' + levelLabel(s.level);
        b.appendChild(h('span', 'item-ico', s.icon || '⚙'));
        b.appendChild(h('span', 'item-name', s.name));
        b.appendChild(h('span', 'item-sub', (s.tag ? s.tag + ' · ' : '') + levelLabel(s.level)));
        b.addEventListener('click', function () {
          /* 点主题卡片 = 自由探索：把实验状态清掉再加载新主题。
             这里不调 PHY.exitTask()（它会顺手把旧主题重新加载一次，白跑一趟）。 */
          if (guide.task) {
            guide.task = null; guide.step = 0; guide.peek = -1;
            if (el.guideBar) el.guideBar.classList.add('hidden');
            el.taskSelect.value = '';
          }
          PHY.loadSim(s.id, null);
          updateHead();
        });
        grid.appendChild(b);
      });
      grp.appendChild(grid);
      el.phyTopics.appendChild(grp);
    });
    if (el.phyCount) el.phyCount.textContent = total + ' 个主题';
  };

  function updateTopicsActive() {
    if (!el || !el.phyTopics) return;
    var cards = el.phyTopics.querySelectorAll('.phy-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', !!(state.simDef && cards[i].dataset.sim === state.simDef.id));
    }
  }

  /* ---------------- 学科切换 ---------------- */
  /* 初始学科：化学。不调用 setSubject，避免在 init 阶段触发一次多余的界面重建。 */
  PHY.subject = 'chem';
  PHY.active = false;

  var BRAND = {
    chem: { logo: '⚗', title: '虚拟化学实验室', sub: '初中化学 · 仿真实验台' },
    phys: { logo: '🧭', title: '虚拟物理实验室', sub: '初中物理 · 仿真实验台' }
  };
  PHY.PHYS_LEVELS = [
    { v: 'junior', t: '初中物理' },
    { v: 'senior', t: '高中物理' },
    { v: 'all', t: '全部内容' }
  ];

  function setBrand(sub) {
    var b = BRAND[sub] || BRAND.chem;
    var logo = $('brandLogo'), title = $('brandTitle'), small = $('brandSub');
    if (logo) logo.textContent = b.logo;
    if (title) title.textContent = b.title;
    if (small) small.textContent = b.sub;
    document.title = b.title + ' · Virtual Lab';
  }

  /* 重建学段下拉框的选项。
     这里刻意用 createElement 而不是 innerHTML —— innerHTML 在测试桩里不会真的
     生成子元素，而且用 DOM 接口建选项本身也更稳。 */
  function rebuildLevelSelect(list, value) {
    if (!el || !el.levelSelect) return;
    var sel = el.levelSelect;
    sel.innerHTML = '';
    (list || []).forEach(function (o) {
      var op = document.createElement('option');
      op.value = o.v;
      op.textContent = o.t;
      sel.appendChild(op);
    });
    sel.value = value;
  }
  function currentLevelOptions() {
    var out = [];
    if (!el || !el.levelSelect || !el.levelSelect.children) return out;
    for (var i = 0; i < el.levelSelect.children.length; i++) {
      var o = el.levelSelect.children[i];
      out.push({ v: o.value, t: o.textContent });
    }
    return out;
  }

  PHY.setSubject = function (sub) {
    if (!el || sub === PHY.subject) return;
    PHY.subject = sub;
    var phys = sub === 'phys';
    PHY.active = phys;
    if (document.body.classList) document.body.classList.toggle('phy-mode', phys);

    function show(id, on) {
      var n = $(id);
      if (n) n.classList.toggle('hidden', !on);
    }
    show('shelfChem', !phys);
    show('canvasWrap', !phys);
    show('toolbar', !phys);
    show('phyShelf', phys);
    show('phyWrap', phys);
    show('phyControls', phys);
    setBrand(sub);

    var it = $('inspTitle');
    if (it) it.textContent = phys ? '读数与信息' : '仪器信息';
    var lt = $('logTitle');
    if (lt) lt.textContent = phys ? '实验记录（物理）' : '实验记录';
    var sa = $('subjectSelect');
    if (sa) sa.value = sub;

    var lvSel = el.levelSelect;
    if (phys) {
      if (state.savedLevels === null) state.savedLevels = currentLevelOptions();
      /* 物理模式会临时改写 CHEM.level（它同时是学段过滤的依据），
         先记下化学那边的学段，切回来时原样还回去——在物理里换学段不应该
         悄悄把化学的药品架也换掉。 */
      if (state.chemLevel === null) state.chemLevel = (root.CHEM && CHEM.level) || 'junior';
      var cur = (root.CHEM && CHEM.level) || 'all';
      var lv = (cur === 'junior' || cur === 'senior') ? cur : 'all';
      if (root.CHEM) CHEM.level = lv;
      rebuildLevelSelect(PHY.PHYS_LEVELS, lv);
      /* 化学实验的指引栏先收起来，别让它一边显示化学步骤一边做物理实验；
         化学的任务状态本身保留，切回去会恢复。 */
      if (root.CHEM && CHEM.__hideGuide) CHEM.__hideGuide();
      PHY.clearLog();
      PHY.buildTopics();
      PHY.buildTaskSelect();
      PHY.stopSim();
      PHY.log('欢迎来到物理实验室！从左侧选择一个仿真主题，或从顶栏选择一个物理实验。', '', 'info');
      el.taskSelect.value = '';
      if (PHY.resizeCanvas) PHY.resizeCanvas();
      updateHead();
    } else {
      /* 退出任务与仿真，把共用界面还给化学 */
      if (guide.task) { guide.task = null; guide.step = 0; guide.peek = -1; }
      if (el.guideBar) el.guideBar.classList.add('hidden');
      stopSimInstance();
      if (root.CHEM && state.chemLevel) {
        CHEM.level = state.chemLevel;
        if (CHEM.invalidateRules) CHEM.invalidateRules();
      }
      if (state.savedLevels) {
        rebuildLevelSelect(state.savedLevels, (root.CHEM && CHEM.level) || 'junior');
      }
      state.chemLevel = null;
      state.logs = [];
      rebuildLogDom();
      if (root.CHEM) {
        if (CHEM.__buildPanels) CHEM.__buildPanels();
        if (CHEM.__buildTaskSelect) CHEM.__buildTaskSelect();
        if (CHEM.__rebuildLog) CHEM.__rebuildLog();
        if (CHEM.__refreshGuide) CHEM.__refreshGuide();
        if (CHEM.__select) CHEM.__select(null);
      }
      /* 化学画布在物理模式下被隐藏过，恢复显示后必须重新量一次尺寸 */
      if (root.CHEM && CHEM.__resizeCanvas) CHEM.__resizeCanvas();
      el.taskSelect.value = (root.CHEM && CHEM.__currentTaskId) ? CHEM.__currentTaskId() : '';
      updateHead();
    }
    void lvSel;
  };

  /* 物理模式下的学段切换（由 app.js 的学段下拉框 change 事件分流过来） */
  PHY.applyLevel = function (lv) {
    if (root.CHEM) CHEM.level = lv;
    PHY.buildTopics();
    PHY.buildTaskSelect();
    PHY.stopSim();
    var name = lv === 'junior' ? '初中物理' : (lv === 'senior' ? '高中物理' : '全部内容');
    PHY.log('已切换到「' + name + '」，当前可用仿真主题 ' + PHY.availableSims().length + ' 个。', '', 'info');
    PHY.toast('已切换到' + name + '（可用主题 ' + PHY.availableSims().length + ' 个）');
  };

  PHY.availableSims = function () {
    return PHY.SIMS.filter(function (s) { return levelOK(s.level); });
  };

  /* ---------------- 物理实验任务 ---------------- */
  function findTask(id) {
    for (var i = 0; i < PHY.TASKS.length; i++) if (PHY.TASKS[i].id === id) return PHY.TASKS[i];
    return null;
  }

  PHY.buildTaskSelect = function () {
    if (!el || !el.taskSelect) return;
    el.taskSelect.innerHTML = '';
    var o = document.createElement('option');
    o.value = ''; o.textContent = '自由探索（无实验）';
    el.taskSelect.appendChild(o);
    [['junior', '初中物理'], ['senior', '高中物理']].forEach(function (pair) {
      var list = PHY.TASKS.filter(function (t) { return (t.level || 'junior') === pair[0]; });
      if (!list.length) return;
      var grp = document.createElement('optgroup');
      grp.label = pair[1] + '（' + list.length + '）';
      list.forEach(function (t) {
        var op = document.createElement('option');
        op.value = t.id;
        op.textContent = t.name + (t.chapter ? '　· ' + t.chapter.split('·')[0].trim() : '');
        grp.appendChild(op);
      });
      el.taskSelect.appendChild(grp);
    });
    el.taskSelect.value = '';
  };

  PHY.startTask = function (id) {
    if (!el) return;
    var task = id ? findTask(id) : null;
    guide.task = task;
    guide.step = 0;
    guide.peek = -1;
    if (!task) {
      if (el.guideBar) el.guideBar.classList.add('hidden');
      if (state.simDef) PHY.loadSim(state.simDef.id, null, true);
      el.taskSelect.value = '';
      updateHead();
      return;
    }
    PHY.loadSim(task.sim, task.preset || null, true);
    PHY.clearLog();
    PHY.log('开始实验：' + task.name, '', 'info');
    if (task.chapter) PHY.log('教材位置：' + task.chapter, '', 'info');
    if (task.intro) PHY.log(task.intro, '', 'info');
    (task.principle || []).forEach(function (eq) {
      PHY.log('实验原理', eq, 'reaction');
    });
    renderGuide();
    updateHead();
  };

  PHY.exitTask = function () {
    PHY.startTask(null);
    PHY.toast('已退出实验，回到自由探索。');
  };

  function stepShort(s) {
    var t = String(s.text || '').replace(/[（(].*?[）)]/g, '').trim();
    return t.length > 14 ? t.slice(0, 14) + '…' : t;
  }

  function renderGuide() {
    if (!el || !el.guideBar) return;
    var t = guide.task;
    if (!t) { el.guideBar.classList.add('hidden'); return; }
    el.guideBar.classList.remove('hidden');
    var steps = t.steps || [];
    el.gbName.textContent = t.name;
    el.gbChapter.textContent = t.chapter || '';
    el.gbProgress.textContent = Math.min(guide.step, steps.length) + ' / ' + steps.length;

    el.gbRail.innerHTML = '';
    steps.forEach(function (s, i) {
      var cls = 'gb-step';
      if (i < guide.step) cls += ' done';
      else if (i === guide.step) cls += ' now';
      if (i === guide.peek) cls += ' peek';
      var b = h('button', cls);
      b.type = 'button';
      b.appendChild(h('b', '', i < guide.step ? '✓' : String(i + 1)));
      b.appendChild(h('span', '', stepShort(s)));
      b.title = s.text + (s.hint ? '\n💡 ' + s.hint : '');
      b.addEventListener('click', function () {
        guide.peek = (guide.peek === i) ? -1 : i;
        renderGuideNow();
      });
      el.gbRail.appendChild(b);
    });
    renderGuideNow();
  }

  function renderGuideNow() {
    if (!el || !el.gbNow) return;
    var t = guide.task;
    el.gbNow.innerHTML = '';
    if (!t) return;
    var steps = t.steps || [];
    if (guide.step >= steps.length) {
      el.gbNow.appendChild(h('span', 'gb-done', '🎉 实验全部完成！可以「退出实验」回到自由探索，或继续自己尝试。'));
      return;
    }
    var i = guide.peek >= 0 && guide.peek < steps.length ? guide.peek : guide.step;
    var s = steps[i];
    var peeking = i !== guide.step;
    el.gbNow.appendChild(h('span', 'gb-now-text', (peeking ? '第 ' + (i + 1) + ' 步（回顾）：' : '现在做：') + s.text));
    if (s.hint) el.gbNow.appendChild(h('span', 'gb-now-hint', '💡 ' + s.hint));
    if (guide.step <= 1 && t.principle && t.principle.length) {
      el.gbNow.appendChild(h('span', 'gb-now-eq', t.principle[0]));
    }
  }

  function checkGuide() {
    var t = guide.task;
    if (!t || !state.sim) return;
    var advanced = false, guard = 0;
    while (guard++ < 20) {
      var st = (t.steps || [])[guide.step];
      if (!st) break;
      var ok = false;
      try { ok = st.check(state.sim); } catch (e) { ok = false; }
      if (!ok) break;
      PHY.log('✅ 完成第 ' + (guide.step + 1) + ' 步：' + st.text, '', 'success');
      guide.step++;
      advanced = true;
      if (guide.step >= t.steps.length) {
        PHY.log('🎉 实验「' + t.name + '」全部完成！', '', 'success');
        PHY.toast('🎉 实验完成：' + t.name);
      } else {
        PHY.toast('✓ 已完成：' + st.text);
      }
    }
    if (advanced) {
      renderGuide();
      updateHead();
    }
  }

  /* ---------------- 任务说明 / 帮助 ---------------- */
  function openModal(title, html) {
    if (!el) return;
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = html;
    el.modalMask.classList.remove('hidden');
  }

  PHY.showTaskInfo = function () {
    var t = guide.task;
    if (!t) { PHY.showHelp(); return; }
    var html = '<p><b>' + t.name + '</b>' + (t.chapter ? '<span class="muted">　' + t.chapter + '</span>' : '') + '</p>';
    if (t.goal) html += '<p>' + t.goal + '</p>';
    if (t.intro) html += '<p class="muted">' + t.intro + '</p>';
    if (t.principle && t.principle.length) {
      html += '<p><b>实验原理</b></p><p>';
      t.principle.forEach(function (eq) { html += '<code class="log-eq">' + eq + '</code> '; });
      html += '</p>';
    }
    html += '<p><b>实验步骤</b></p><ol class="step-list">';
    t.steps.forEach(function (s, i) {
      var cls = i < guide.step ? 'done' : (i === guide.step ? 'now' : '');
      html += '<li class="' + cls + '">' + s.text + (s.hint ? '<em>💡 ' + s.hint + '</em>' : '') + '</li>';
    });
    html += '</ol>';
    openModal('实验说明', html);
  };

  PHY.showHelp = function () {
    var html = [
      '<p><b>一、选学科</b>：顶栏「学科」下拉框在化学 / 物理之间切换；「学段」在初中 / 高中 / 全部之间切换，物理实验与仿真主题会跟着学段过滤。</p>',
      '<p><b>二、选主题</b>：左侧「物理仿真」按力学 / 声学 / 热学 / 光学 / 电学 / 电磁学 / 近代物理分组，点卡片打开对应仿真。</p>',
      '<p><b>三、做实验</b>：顶栏「实验任务」列出初高中物理教材实验，选中后实验台下方出现流程指引栏，逐步提示做什么、去哪里点。</p>',
      '<p><b>四、调参数</b>：实验台下方的控制条提供滑块、下拉框和按钮；画布里的对象大多可以直接拖动（蜡烛、磁铁、砝码、激光笔……）。</p>',
      '<p><b>五、看读数</b>：右侧面板实时显示电流、电压、温度、速度等读数与记录的数据表；「实验记录」同步记录现象与结论。</p>'
    ].join('');
    openModal('使用帮助（物理）', html);
  };

  /* ---------------- 初始化 ---------------- */
  PHY.init = function () {
    el = {
      subjectSelect: $('subjectSelect'),
      levelSelect: $('levelSelect'),
      taskSelect: $('taskSelect'),
      taskProgress: $('taskProgress'),
      shelfChem: $('shelfChem'),
      phyShelf: $('phyShelf'),
      phyTopics: $('phyTopics'),
      phyCount: $('phyCount'),
      phyWrap: $('phyWrap'),
      phybench: $('phybench'),
      phyControls: $('phyControls'),
      phyHint: $('phyHint'),
      canvasWrap: $('canvasWrap'),
      toolbar: $('toolbar'),
      inspTitle: $('inspTitle'),
      inspBody: $('inspBody'),
      logList: $('logList'),
      guideBar: $('guideBar'),
      gbName: $('gbName'), gbChapter: $('gbChapter'),
      gbProgress: $('gbProgress'), gbRail: $('gbRail'), gbNow: $('gbNow'),
      gbInfo: $('gbInfo'), gbCollapse: $('gbCollapse'), gbExit: $('gbExit'),
      statusText: $('statusText'), modeBadge: $('modeBadge'),
      toast: $('toast'), modalMask: $('modalMask'),
      modalTitle: $('modalTitle'), modalBody: $('modalBody')
    };
    if (!el.phybench) return;
    g = el.phybench.getContext('2d');
    PHY.subject = 'chem'; PHY.active = false;
    setBrand('chem');
    PHY.buildTopics();

    /* 学科切换 */
    if (el.subjectSelect) {
      el.subjectSelect.value = 'chem';
      el.subjectSelect.addEventListener('change', function () {
        PHY.setSubject(el.subjectSelect.value);
      });
    }

    /* 物理模式下的实验流程指引栏按钮（化学模式下由 app.js 自己处理） */
    if (el.gbInfo) el.gbInfo.addEventListener('click', function () {
      if (PHY.active) PHY.showTaskInfo();
    });
    if (el.gbExit) el.gbExit.addEventListener('click', function () {
      if (PHY.active) PHY.exitTask();
    });
    if (el.taskSelect) el.taskSelect.addEventListener('change', function () {
      if (PHY.active) PHY.startTask(el.taskSelect.value || null);
    });

    /* 画布尺寸。
       注意：物理画布在化学模式下是 display:none，量出来的宽高是 0，
       这时候既不能设 canvas 尺寸、也不能改 state.W/H（否则指针坐标换算全错）。
       所以「量不到就跳过」，等真正切到物理学科时再量一次（setSubject 会调 PHY.resizeCanvas）。 */
    function doResize() {
      if (!el.phyWrap) return;
      var w = el.phyWrap.clientWidth, hgt = el.phyWrap.clientHeight;
      if (!w || !hgt) return;
      var dpr = root.devicePixelRatio || 1;
      state.W = w; state.H = hgt;
      el.phybench.width = Math.round(w * dpr);
      el.phybench.height = Math.round(hgt * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.infoT = 0;
    }
    PHY.resizeCanvas = doResize;
    doResize();
    if (root.ResizeObserver) new ResizeObserver(doResize).observe(el.phyWrap);
    root.addEventListener('resize', doResize);

    /* 指针事件：转发给当前仿真 */
    function toLocal(ev) {
      var r = el.phybench.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) * state.W / Math.max(1, r.width),
        y: (ev.clientY - r.top) * state.H / Math.max(1, r.height)
      };
    }
    el.phybench.addEventListener('pointerdown', function (ev) {
      if (!state.sim || !state.sim.onDown) return;
      var p = toLocal(ev);
      state.sim.onDown(p.x, p.y, ev);
    });
    el.phybench.addEventListener('pointermove', function (ev) {
      if (!state.sim || !state.sim.onMove) return;
      var p = toLocal(ev);
      state.sim.onMove(p.x, p.y, ev);
    });
    root.addEventListener('pointerup', function (ev) {
      if (!state.sim || !state.sim.onUp) return;
      var p = toLocal(ev);
      state.sim.onUp(p.x, p.y, ev);
    });
    el.phybench.addEventListener('pointerleave', function () {
      if (state.sim && state.sim.onLeave) state.sim.onLeave();
    });
  };

  /* 测试钩子 */
  PHY.__taskOf = findTask;

})(typeof window !== 'undefined' ? window : globalThis);
