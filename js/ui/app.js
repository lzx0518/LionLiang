/* =============================================================================
 * 虚拟化学实验室 —— 界面与交互 (app.js)
 * -----------------------------------------------------------------------------
 * 负责：货架渲染、拖拽放置、工具模式、属性面板、实验记录、任务引导、存取档。
 * 所有化学逻辑都在 js/engine 里，这里只做"人机接口"。
 * ========================================================================== */
(function () {
  'use strict';

  var CHEM = window.CHEM;
  var SCENE = CHEM.SCENE;

  /* ======================= 全局状态 ======================= */
  var world = new CHEM.World();
  var renderer = null;
  var el = {};                       // 常用 DOM 缓存

  var state = {
    selected: null,                  // 选中的仪器 uid
    tool: 'select',
    toolName: '选择',
    mouse: { x: -999, y: -999 },
    dragging: null,                  // {uid, dx, dy, moved}
    ghost: null,                     // 从货架拖出的幽灵元素
    ghostType: null,
    reagentDrag: null,               // 正在拖拽的药品
    dropTarget: null,                // 拖拽时鼠标下的容器 uid
    hover: null,                     // 悬停的仪器 uid
    pop: null,                       // 加药量浮层的上下文
    pourFrom: null,
    connectFrom: null,
    task: null,
    step: 0,
    peekStep: -1,                    // 在步骤条上"回顾"某一步
    t: 0,
    heatWarned: {},
    amountMode: 'normal'             // little | normal | much
  };

  /* 默认加入量的倍率 */
  var AMOUNT_SCALE = { little: 0.45, normal: 1, much: 2.2 };

  var TEST_LIST = [
    { id: 'glowingSplint', name: '带火星的木条' },
    { id: 'burningSplint', name: '燃着的木条' },
    { id: 'litmusPaper', name: '紫色石蕊试纸' },
    { id: 'phPaper', name: 'pH 试纸' }
  ];

  /* ======================= 小工具 ======================= */
  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function fmtTime(t) {
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2200);
  }
  function openModal(title, html) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = html;
    el.modalMask.classList.remove('hidden');
  }
  function closeModal() { el.modalMask.classList.add('hidden'); }

  function openPicker(title, rows, onPick) {
    el.pickerTitle.textContent = title;
    el.pickerBody.innerHTML = '';
    if (!rows.length) {
      el.pickerBody.appendChild(h('p', 'muted', '没有可选项。'));
    }
    rows.forEach(function (r) {
      var b = h('button', 'pick-row');
      b.type = 'button';
      var dot = h('i', 'pick-dot');
      dot.style.background = r.color || '#dbe9f5';
      b.appendChild(dot);
      b.appendChild(h('b', '', r.name));
      b.appendChild(h('em', '', r.sub || ''));
      b.addEventListener('click', function () {
        el.pickerMask.classList.add('hidden');
        onPick(r);
      });
      el.pickerBody.appendChild(b);
    });
    el.pickerMask.classList.remove('hidden');
  }

  /* ======================= 货架 ======================= */
  function buildApparatusPanel() {
    var box = el.panelApparatus;
    box.innerHTML = '';
    CHEM.APPARATUS_GROUPS.forEach(function (grp) {
      var g = h('div', 'shelf-group');
      g.appendChild(h('h4', 'group-title', grp.name));
      var grid = h('div', 'group-grid');
      grp.types.forEach(function (type) {
        var a = CHEM.getApp(type);
        if (!a) return;
        /* 学段过滤：高中专有仪器在初中模式下不显示 */
        if (a.level && a.level !== 'both' && CHEM.level !== 'all' && a.level !== CHEM.level) return;
        var b = h('button', 'item-card');
        b.type = 'button';
        b.dataset.type = type;
        b.title = a.tip || a.name;
        b.appendChild(h('span', 'item-ico', ICONS[type] || '⚗'));
        b.appendChild(h('span', 'item-name', a.name));
        b.appendChild(h('span', 'item-sub', a.capacity ? a.capacity + ' mL' : (a.category === 'tool' ? '工具' : '装置')));
        b.addEventListener('pointerdown', function (ev) { startShelfDrag(ev, type, b); });
        b.addEventListener('click', function (ev) {
          if (b.dataset.dragged === '1') { b.dataset.dragged = '0'; return; }
          placeApparatus(type, null);
        });
        grid.appendChild(b);
      });
      if (!grid.children.length) return;
      g.appendChild(grid);
      box.appendChild(g);
    });
  }

  var ICONS = {
    testTube: '🧪', beakerSmall: '🥛', beakerBig: '🥛', conicalFlask: '⚗',
    gasJar: '🫙', evaporatingDish: '🍽', graduatedCylinder: '📏',
    volumetricFlask: '🧫', combustionSpoon: '🥄',
    testTubeRack: '🗄', alcoholLamp: '🕯', ironStand: '🗼',
    asbestosNet: '▤', tripod: '△', funnel: '🔻', deliveryTube: '〰',
    separatoryFunnel: '⧗',
    glassRod: '🥢', dropper: '💧', spoon: '🥄', tweezers: '🔧',
    matches: '🔥', litmusTool: '🧫', tongs: '🗜'
  };

  function buildReagentPanel() {
    var box = el.reagentGroups;
    box.innerHTML = '';
    CHEM.SHELVES.forEach(function (sh) {
      var list = CHEM.SUBSTANCES.filter(function (s) {
        return s.pickable && s.shelf === sh.id && CHEM.substanceAvailable(s);
      });
      if (!list.length) return;
      var g = h('div', 'shelf-group');
      g.dataset.group = sh.id;
      g.appendChild(h('h4', 'group-title', sh.name));
      var grid = h('div', 'group-grid');
      list.forEach(function (s) { grid.appendChild(reagentCard(s)); });
      g.appendChild(grid);
      box.appendChild(g);
    });
    /* 空气：加入 100 mL 空气（其中氧气约 21 mL） */
    var airGroup = h('div', 'shelf-group');
    airGroup.dataset.group = 'air';
    airGroup.appendChild(h('h4', 'group-title', '其他'));
    var airGrid = h('div', 'group-grid');
    var airCard = h('button', 'item-card reagent');
    airCard.type = 'button';
    airCard.dataset.id = '__air';
    var airDot = h('span', 'item-ico dot'); airDot.style.background = '#cfe3f2';
    airCard.appendChild(airDot);
    airCard.appendChild(h('span', 'item-name', '空气'));
    airCard.appendChild(h('span', 'item-sub', 'O₂ 约占 21%'));
    airCard.title = '向容器中通入 100 mL 空气，其中氧气约 21 mL';
    airCard.addEventListener('click', function () { addAir(); });
    airGrid.appendChild(airCard);
    airGroup.appendChild(airGrid);
    box.appendChild(airGroup);
    /* 面板重建之后要把"本实验需要的药品"标记重新贴回去 */
    applyReagentHints();
  }

  function reagentCard(s) {
    var b = h('button', 'item-card reagent cat-' + s.shelf);
    b.type = 'button';
    b.dataset.id = s.id;
    b.dataset.name = s.name;
    b.dataset.formula = s.formula;
    b.title = s.name + ' ' + s.formula + '\n' + (s.note || '') +
      '\n\n点击 = 按默认量加入选中的容器；拖到容器上 = 自定义加入量';
    var dot = h('span', 'item-ico dot');
    dot.style.background = s.color;
    b.appendChild(dot);
    b.appendChild(h('span', 'item-name', s.name));
    b.appendChild(h('span', 'item-sub', s.formula));
    b.addEventListener('pointerdown', function (ev) { startReagentDrag(ev, s, b); });
    b.addEventListener('click', function (ev) {
      if (b.dataset.dragged === '1') { b.dataset.dragged = '0'; return; }
      /* Shift + 点击 = 不拖动也能指定加入量 */
      if (ev.shiftKey) {
        var c = currentContainer();
        if (!c) { toast('请先在实验台上选中一个容器，再加入药品。'); return; }
        openAmountPop(c, s, null, null);
        return;
      }
      handleReagentClick(s);
    });
    return b;
  }

  function filterReagents(kw) {
    kw = kw.trim().toLowerCase();
    var groups = el.reagentGroups.querySelectorAll('.shelf-group');
    for (var i = 0; i < groups.length; i++) {
      var cards = groups[i].querySelectorAll('.item-card');
      var any = false;
      for (var j = 0; j < cards.length; j++) {
        var c = cards[j];
        var match = !kw ||
          (c.dataset.name || '').toLowerCase().indexOf(kw) >= 0 ||
          (c.dataset.formula || '').toLowerCase().indexOf(kw) >= 0;
        c.style.display = match ? '' : 'none';
        if (match) any = true;
      }
      groups[i].style.display = any ? '' : 'none';
    }
  }

  /* ======================= 放置仪器 ======================= */
  function placeApparatus(type, pos) {
    var a = CHEM.getApp(type);
    if (!a) return;
    if (a.category === 'tool') { activateToolByType(type); return; }
    var p = pos || world.freeSpot(type);
    p.x = Math.max(60, Math.min(SCENE.w - 60, p.x));
    p.y = Math.max(SCENE.benchY - 170, Math.min(SCENE.benchY, p.y));
    var it = world.add(type, p.x, p.y);
    if (!it) return;
    world.say('把 ' + a.name + ' 放到实验台上。', { kind: 'info', uid: it.uid });
    select(it.uid);
    return it;
  }

  function activateToolByType(type) {
    var map = { glassRod: 'stir', dropper: 'pour', spoon: 'pour', tweezers: 'pour', matches: 'ignite', litmusTool: 'test', tongs: 'select' };
    var t = map[type] || 'select';
    setTool(t);
    toast('已切换到「' + CHEM.getApp(type).name + '」对应的操作模式');
  }

  /* 从货架拖拽 */
  function startShelfDrag(ev, type, node) {
    if (ev.button !== 0) return;
    var startX = ev.clientX, startY = ev.clientY, moved = false;
    var a = CHEM.getApp(type);

    function onMove(e) {
      if (!moved && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 8) {
        moved = true;
        node.dataset.dragged = '1';
        var g = h('div', 'drag-ghost', (ICONS[type] || '⚗') + ' ' + a.name);
        g.style.position = 'fixed';
        g.style.pointerEvents = 'none';
        g.style.zIndex = 90;
        g.style.padding = '6px 12px';
        g.style.borderRadius = '10px';
        g.style.background = 'rgba(16,42,64,.86)';
        g.style.color = '#eaf6ff';
        g.style.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
        document.body.appendChild(g);
        state.ghost = g;
      }
      if (state.ghost) {
        state.ghost.style.left = (e.clientX + 12) + 'px';
        state.ghost.style.top = (e.clientY + 12) + 'px';
      }
    }
    function onUp(e) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (state.ghost) { state.ghost.remove(); state.ghost = null; }
      if (!moved) return;
      var r = renderer.canvas.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        placeApparatus(type, renderer.screenToScene(e.clientX, e.clientY));
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  /* ======================= 加入药品 ======================= */
  function currentContainer() {
    var it = state.selected ? world.byUid(state.selected) : null;
    return it && it.kind === 'container' ? it : null;
  }

  /* 按容器大小算出的"适量"基准值，再乘上用户选的少量/适量/大量 */
  function amountFor(c, sub, mode) {
    var k = AMOUNT_SCALE[mode || state.amountMode] || 1;
    if (sub.phase === 'gas') {
      return Math.max(10, Math.round(c.headspace() * 0.8 * Math.min(1, k)));
    }
    if (sub.phase === 'solid') {
      var base = c.capacity() <= 30 ? 0.3 : 0.5;
      return Math.max(0.05, Math.round(base * k * 100) / 100);
    }
    var ml = Math.max(1, Math.min(8, c.capacity() * 0.12)) * k;
    return Math.max(0.5, Math.min(c.capacity(), Math.round(ml * 10) / 10));
  }

  /* 加药量浮层的取值范围（按物态与容器容积决定） */
  function amountRange(c, sub) {
    if (sub.phase === 'gas') {
      var h = Math.max(20, Math.round(c.headspace()));
      return { min: 5, max: h, step: 5, unit: 'mL' };
    }
    if (sub.phase === 'solid') {
      return { min: 0.05, max: 5, step: 0.05, unit: 'g' };
    }
    return { min: 0.5, max: Math.max(1, Math.round(c.capacity() * 0.9)), step: 0.5, unit: 'mL' };
  }

  function applyAmount(c, sub, amount) {
    var warn = operationWarning(c, sub);
    if (warn) {
      world.say(warn, { kind: 'warn', uid: c.uid });
      toast(warn);
      return 0;
    }
    var before = c.isEmpty();
    var added = world.addReagent(c.uid, sub.id, amount);
    if (added > 0 && sub.phase !== 'gas') {
      world.fx.spawnDrop(c, sub.phase === 'solid' ? '#c9ccd1' : sub.color, 3);
    }
    if (before) state.heatWarned[c.uid] = false;
    refreshInspector();
    return added;
  }

  function handleReagentClick(sub) {
    var c = currentContainer();
    if (!c) {
      toast('请先在实验台上点击选中一个容器，再加入药品。');
      return;
    }
    /* 试纸类直接做检验 */
    if (sub.id === 'litmusPaper') { doTest(c, 'litmusPaper'); return; }
    if (sub.id === 'phPaper') { doTest(c, 'phPaper'); return; }
    applyAmount(c, sub, amountFor(c, sub));
  }

  /* ======================= 把药品拖到容器里 ======================= */
  function startReagentDrag(ev, sub, node) {
    if (ev.button !== 0) return;
    var startX = ev.clientX, startY = ev.clientY, moved = false;
    var ghost = null;

    function onMove(e) {
      if (!moved && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 8) {
        moved = true;
        node.dataset.dragged = '1';
        ghost = h('div', 'drag-ghost');
        var dot = h('i', 'pick-dot');
        dot.style.background = sub.color;
        ghost.appendChild(dot);
        ghost.appendChild(document.createTextNode(sub.name + ' ' + sub.formula));
        document.body.appendChild(ghost);
        state.ghost = ghost;
      }
      if (!ghost) return;
      ghost.style.left = (e.clientX + 14) + 'px';
      ghost.style.top = (e.clientY + 14) + 'px';
      /* 高亮鼠标下的容器 */
      var r = renderer.canvas.getBoundingClientRect();
      var target = null;
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        var s = renderer.screenToScene(e.clientX, e.clientY);
        var it = renderer.pick(world, s.x, s.y);
        if (it && it.kind === 'container') target = it.uid;
      }
      if (target !== state.dropTarget) {
        state.dropTarget = target;
        el.shelfTip.textContent = target
          ? '松开鼠标，把 ' + sub.name + ' 加到「' + world.byUid(target).displayName() + '」并指定加入量'
          : '把药品拖到实验台上的容器里，可以自定义加入量';
      }
    }

    function onUp(e) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (ghost) { ghost.remove(); state.ghost = null; }
      var target = state.dropTarget;
      state.dropTarget = null;
      el.shelfTip.textContent = '点击药品按默认量加入选中的容器；把它拖到容器上（或 Shift + 点击）可指定加入量。';
      if (!moved) return;
      if (!target) {
        toast('把药品拖到实验台上的容器里才能加入。');
        return;
      }
      var c = world.byUid(target);
      if (!c) return;
      select(c.uid);
      openAmountPop(c, sub, e.clientX, e.clientY);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  /* ======================= 加药量浮层 ======================= */
  function openAmountPop(c, sub, clientX, clientY) {
    var rng = amountRange(c, sub);
    var def = Math.max(rng.min, Math.min(rng.max, amountFor(c, sub)));
    state.pop = { container: c, sub: sub, range: rng };

    el.apName.textContent = sub.name;
    el.apFormula.textContent = sub.formula;
    el.apTarget.textContent = '→ ' + c.displayName() + '（' + c.liquidVolume().toFixed(1) + ' / ' + c.capacity() + ' mL）';
    el.apRange.min = rng.min;
    el.apRange.max = rng.max;
    el.apRange.step = rng.step;
    el.apRange.value = def;
    updateAmountLabel();

    /* 快捷按钮 */
    el.apQuick.innerHTML = '';
    var presets = sub.phase === 'gas'
      ? [{ l: '少量', v: 0.15 }, { l: '适量', v: 0.5 }, { l: '大量', v: 0.8 }, { l: '装满', v: 1 }]
      : [{ l: '1 滴', v: 0.02 }, { l: '少量', v: 0.15 }, { l: '适量', v: 0.45 }, { l: '大量', v: 0.8 }];
    presets.forEach(function (p) {
      var b = h('button', 'ap-chip', p.l);
      b.type = 'button';
      b.addEventListener('click', function () {
        var v = rng.min + (rng.max - rng.min) * p.v;
        v = Math.round(v / rng.step) * rng.step;
        el.apRange.value = Math.max(rng.min, Math.min(rng.max, v));
        updateAmountLabel();
      });
      el.apQuick.appendChild(b);
    });

    /* 定位到鼠标附近（相对 canvas-wrap） */
    var wrapRect = el.canvasWrap.getBoundingClientRect();
    var x = (clientX === undefined ? wrapRect.width / 2 : clientX - wrapRect.left) + 16;
    var y = (clientY === undefined ? wrapRect.height / 2 : clientY - wrapRect.top) + 10;
    el.amountPop.classList.remove('hidden');
    var pw = el.amountPop.offsetWidth || 250;
    var ph = el.amountPop.offsetHeight || 150;
    x = Math.max(8, Math.min(wrapRect.width - pw - 8, x));
    y = Math.max(8, Math.min(wrapRect.height - ph - 8, y));
    el.amountPop.style.left = x + 'px';
    el.amountPop.style.top = y + 'px';
  }

  function updateAmountLabel() {
    if (!state.pop) return;
    var v = Number(el.apRange.value);
    var u = state.pop.range.unit;
    el.apValue.textContent = (u === 'g' ? v.toFixed(2) : v.toFixed(v < 10 && u === 'mL' && state.pop.range.step < 1 ? 1 : 0)) + ' ' + u;
  }

  function closeAmountPop() {
    el.amountPop.classList.add('hidden');
    state.pop = null;
  }

  function confirmAmountPop() {
    if (!state.pop) return;
    var c = state.pop.container, sub = state.pop.sub;
    var v = Number(el.apRange.value);
    closeAmountPop();
    applyAmount(c, sub, v);
  }

  function addAir() {
    var c = currentContainer();
    if (!c) { toast('请先选中一个容器。'); return; }
    var ml = Math.max(50, Math.round(c.headspace() * 0.8));
    var o2 = c.addGas('o2', ml * 0.21);
    world.say('向 ' + c.displayName() + ' 中通入 ' + ml + ' mL 空气（其中氧气约 ' + o2.toFixed(1) + ' mL，约占 21%）。', { kind: 'info', uid: c.uid });
    refreshInspector();
  }

  /* 操作规范检查 */
  function operationWarning(c, sub) {
    if (c.type === 'graduatedCylinder') {
      if (sub.phase === 'solid') return '量筒不能用来溶解或反应固体药品，请改用试管或烧杯。';
      if (sub.phase === 'gas') return '量筒不能用于收集气体，请改用集气瓶。';
      if (c.liquids.length && c.liquids.some(function (e) { return CHEM.getSub(e.id).base !== 'h2o'; }) && sub.base !== 'h2o') {
        return '量筒只能量取液体，不能作反应容器，请把液体倒入试管或烧杯后再混合。';
      }
    }
    if (c.heatPower > 0 && sub.phase !== 'gas' && c.temp > 80) {
      return '容器正在加热，此时加入药品要小心液体飞溅。';
    }
    return null;
  }

  /* ======================= 工具模式 ======================= */
  function setTool(t) {
    state.tool = t;
    state.pourFrom = null;
    state.connectFrom = null;
    var btns = el.toolbar.querySelectorAll('.tool');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.tool === t);
    }
    var names = { select: '选择', pour: '倾倒', stir: '搅拌', ignite: '点燃', power: '通电', light: '光照', test: '检验', connect: '连接', empty: '倒掉', delete: '移除' };
    state.toolName = names[t] || t;
    el.modeBadge.textContent = state.toolName;
    /* 做实验时状态栏显示当前步骤，工具提示让位（工具名已经在徽标上了） */
    if (!state.task) el.statusText.textContent = TOOL_HINT[t] || '';
  }
  var TOOL_HINT = {
    select: '点击仪器可以选中它，按住拖动可以移动位置。',
    pour: '先点击要倒出的容器，再点击接收的容器。',
    stir: '点击容器，用玻璃棒搅拌，可以加快溶解和反应。',
    ignite: '点击酒精灯可以点燃 / 盖灭；点击装有可燃物的容器可以点燃。',
    power: '点击装有水的容器，接通直流电源进行电解（再点一次断电）。',
    light: '点击容器，用强光照射（甲烷氯代、次氯酸分解等需要光照）。',
    test: '点击容器，选择检验方法（带火星木条、pH 试纸等）。',
    connect: '把仪器接起来：先点「导管 / 分液漏斗 / 漏斗」，再点容器；也可以先点一个容器再点另一个容器（会自动加一根导管）。',
    empty: '点击容器，把里面的物质倒掉。',
    delete: '点击仪器，把它从实验台上拿走。'
  };

  function activateToolByTypeName() { }

  /* ======================= 仪器之间的连接 ======================= */
  /* 一个装置正下方、可以装配到它上面的容器 */
  function containerUnderDevice(d) {
    var best = null;
    world.containers().forEach(function (c) {
      if (c.uid === d.uid) return;
      var a = CHEM.getApp(c.type);
      var hw = Math.max(22, CHEM.geometry.halfWidthAt(c.type, a.H) + 10);
      if (Math.abs(c.x - d.x) < hw && Math.abs(c.y - d.y) < 46) {
        if (!best || Math.abs(c.y - d.y) < Math.abs(best.y - d.y)) best = c;
      }
    });
    return best;
  }
  /* 松手时尝试把两件仪器接起来，成功返回 true。
     只处理"把上游装置拖到容器上"这一种最自然的动作；
     反过来（把容器塞到漏斗下面）用「连接」工具，避免和"拖动即倾倒"打架。 */
  function attachOnDrop(it) {
    if (it.type === 'deliveryTube' || it.type === 'separatoryFunnel' || it.type === 'funnel') {
      var c = containerUnderDevice(it);
      if (c && world.attach(it.uid, c.uid)) {
        toast('已把「' + it.name + '」接到「' + c.displayName() + '」上。');
        return true;
      }
    }
    return false;
  }

  /* 属性面板里的"连接"区 */
  function buildConnections(it) {
    var list = world.connectionsOf(it.uid);
    var box = h('div', 'conn-box');
    box.appendChild(h('div', 'conn-title', '连接'));
    if (!list.length) {
      box.appendChild(h('p', 'muted', '还没有和别的仪器连接。把「分液漏斗」「导管」拖到容器上即可装配；也可以用工具栏的「连接」。'));
      return box;
    }
    list.forEach(function (cn) {
      var row = h('div', 'conn-row');
      var label = cn.device.name + '　';
      if (cn.kind === 'gas') {
        var other = cn.device.linkA === it.uid ? cn.device.linkB : cn.device.linkA;
        var o = other ? world.byUid(other) : null;
        label += o ? ('导气 → ' + o.displayName()) : '（另一端还没接）';
      } else if (cn.kind === 'drip') {
        label += '逐滴加液';
      } else {
        label += '过滤 / 引流';
      }
      row.appendChild(h('span', 'conn-label', label));
      var b = h('button', 'mini', '断开');
      b.type = 'button';
      b.addEventListener('click', function () {
        world.detach(cn.device.uid);
        refreshInspector();
      });
      row.appendChild(b);
      box.appendChild(row);
    });
    return box;
  }


  function ruleById(id) {
    var list = CHEM.REACTIONS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* 把反应热、平衡常数这类数字写得能看懂 */
  function fmtNum(v, digits) {
    if (!isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e6)) {
      var e = Math.floor(Math.log10(a));
      var m = v / Math.pow(10, e);
      return m.toFixed(2) + '×10' + CHEM.toSup(String(e));
    }
    return v.toFixed(digits === undefined ? 2 : digits);
  }

  function openEquationDetail(uid, ruleId) {
    var rule = ruleById(ruleId);
    if (!rule) return;
    var c = world.byUid(uid);
    openModal('反应详情', equationDetailHTML(rule, c));
  }

  function equationDetailHTML(rule, c) {
    var R = CHEM.Reaction;
    var extra = R.extraOf(rule.id) || {};
    var th = R.thermoOf(rule);
    var cond = R.conditionLabel(rule);
    var parts = String(rule.equation).split('=');
    var left = parts[0] || '';
    var right = parts.slice(1).join('=') || '';
    var out = [];

    /* --- 方程式（条件写在等号上方） --- */
    out.push('<div class="eq-hero">' +
      '<span class="eq-part">' + left.trim() + '</span>' +
      '<span class="eq-eq">' + (cond ? '<i>' + cond + '</i>' : '<i>&nbsp;</i>') + '<b>=</b></span>' +
      '<span class="eq-part">' + right.trim() + '</span>' +
      '</div>');

    /* --- 离子方程式 --- */
    if (extra.ion) {
      out.push('<div class="eq-ion"><span class="eq-ion-tag">离子方程式</span>' +
        '<code>' + extra.ion + '</code></div>');
    }

    /* --- 关键数据 --- */
    var rows = [];
    rows.push(['反应类型', rule.type || '—']);
    if (cond) rows.push(['反应条件', cond]);
    if (th && th.ok) {
      rows.push(['反应热 ΔH', (th.dH > 0 ? '+' : '') + th.dH.toFixed(1) + ' kJ/mol　<span class="eq-note">' + R.heatMeaning(th.dH) + '</span>']);
      rows.push(['ΔG（298 K）', (th.dG > 0 ? '+' : '') + th.dG.toFixed(1) + ' kJ/mol']);
      rows.push(['平衡常数 K', fmtNum(th.K, 2) + '　<span class="eq-note">' + R.kMeaning(th.K, rule) + '</span>']);
    } else if (th && !th.ok) {
      rows.push(['焓变 / 平衡常数', '<span class="eq-note">缺少 ' + th.missing.join('、') + ' 的标准热力学数据</span>']);
    }
    if (rule.conditions && rule.conditions.catalyst) {
      var cat = CHEM.getSub(rule.conditions.catalyst);
      rows.push(['催化剂', cat ? cat.name : rule.conditions.catalyst]);
    }
    var html = '<dl class="eq-kv">';
    rows.forEach(function (r) { html += '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; });
    html += '</dl>';
    out.push(html);

    /* --- 状态符号形式 --- */
    out.push('<div class="eq-state"><span class="eq-ion-tag">带状态符号</span><code>' + R.stateEquation(rule) + '</code></div>');

    /* --- K < 1 但实际能进行时，必须解释清楚 --- */
    var caveat = R.kCaveat(rule, th);
    if (caveat) {
      out.push('<div class="eq-block warn"><h5>⚠ 为什么 K 小于 1，反应却仍然能进行？</h5><p>' + caveat + '</p></div>');
    }

    /* --- 现象 --- */
    if (rule.phenomena && rule.phenomena.message) {
      out.push('<div class="eq-block"><h5>实验现象</h5><p>' + rule.phenomena.message + '</p></div>');
    }
    if (extra.detail) {
      out.push('<div class="eq-block"><h5>反应实质</h5><p>' + extra.detail + '</p></div>');
    }
    if (extra.use) {
      out.push('<div class="eq-block"><h5>应用 / 考点</h5><p>' + extra.use + '</p></div>');
    }
    if (rule.note) {
      out.push('<div class="eq-block"><h5>说明</h5><p>' + rule.note + '</p></div>');
    }
    if (rule.safety) {
      out.push('<div class="eq-block warn"><h5>⚠ 安全提示</h5><p>' + rule.safety + '</p></div>');
    }
    if (c) {
      out.push('<div class="eq-block"><h5>当前容器</h5><p>' + c.displayName() + '：' + c.describe() +
        '　温度 ' + c.temp.toFixed(0) + ' ℃</p></div>');
    }
    out.push('<p class="muted">焓变与平衡常数由标准生成焓 ΔHf° 与标准生成吉布斯自由能 ΔGf° 在 298 K 下计算：' +
      'K = exp(−ΔG°/RT)。</p>');
    return out.join('');
  }

  /* ======================= 本实验需要哪些药品 =======================
     不去手写"每个实验要用什么药"（34 个实验，写死了以后改实验就得同步改数据），
     而是从每一步 check 函数的源码里反推：
       · fired(w,'规则id')            → 这条规则的反应物
       · any/liquidOf/dissolved(w,'物质id') → 该物质
       · holdsAll(w,['a','b'])        → 这些物质
     再把步骤文字与提示里点名到的药品也算进来。 */
  function addPickable(ids, base) {
    var list = CHEM.SUBSTANCES_BY_BASE[base] || [];
    list.forEach(function (s) { if (s.pickable) ids[s.id] = true; });
  }
  function addSubId(ids, id) {
    var s = CHEM.getSub(id);
    if (!s) return;
    if (s.pickable) ids[s.id] = true;
    else addPickable(ids, s.base);
  }
  function experimentReagents(task) {
    var ids = Object.create(null), m;
    (task.steps || []).forEach(function (st) {
      var src = String(st.check || '');
      var reRule = /fired\(\s*w\s*,\s*'([^']+)'\s*\)/g;
      while ((m = reRule.exec(src))) {
        var r = ruleById(m[1]);
        if (r) r.reactants.forEach(function (b) { addPickable(ids, b); });
      }
      var reSub = /(?:any|liquidOf|dissolved|solidOf)\(\s*w\s*,\s*'([^']+)'\s*\)/g;
      while ((m = reSub.exec(src))) addSubId(ids, m[1]);
      var reHold = /holdsAll\(\s*w\s*,\s*\[([^\]]*)\]/g;
      while ((m = reHold.exec(src))) {
        var q, reQ = /'([^']+)'/g;
        while ((q = reQ.exec(m[1]))) addSubId(ids, q[1]);
      }
      /* 步骤文字 / 提示里点名的药品 */
      var text = String(st.text || '') + ' ' + String(st.hint || '');
      CHEM.SUBSTANCES.forEach(function (s) {
        if (s.pickable && s.name && text.indexOf(s.name) >= 0) ids[s.id] = true;
      });
    });
    return Object.keys(ids);
  }

  /* 把药品架上本实验要用的药品标出来 */
  function applyReagentHints() {
    var needed = state.task ? experimentReagents(state.task) : [];
    state.reagents = needed;
    var set = Object.create(null);
    needed.forEach(function (id) { set[id] = true; });
    var cards = el.reagentGroups.querySelectorAll('.item-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('needed', !!set[cards[i].dataset.id]);
    }
  }

  /* 切到药品架并滚动到第一个需要的药品 */
  function switchShelf(tab) {
    el.shelfTabs.forEach(function (x) { x.classList.toggle('active', x.dataset.tab === tab); });
    el.panelApparatus.classList.toggle('hidden', tab !== 'apparatus');
    el.panelReagent.classList.toggle('hidden', tab !== 'reagent');
    state.shelfTab = tab;
  }
  function focusNeededReagents() {
    if (!state.reagents || !state.reagents.length) return;
    switchShelf('reagent');
    var first = el.reagentGroups.querySelector('.item-card.needed');
    if (first && first.scrollIntoView) {
      try { first.scrollIntoView({ block: 'center' }); } catch (e) { /* 忽略 */ }
    }
  }

  /* ======================= 检验 ======================= */
  function doTest(c, testId) {
    var r = CHEM.Reaction.runTest(c, testId);   // 检验结果由引擎统一记录到 c.tests
    if (!r) { toast('无法进行该项检验。'); return; }
    var name = (TEST_LIST.filter(function (t) { return t.id === testId; })[0] || {}).name || testId;
    world.say('用' + name + '检验 ' + c.displayName() + '：' + r.text, { kind: 'test', uid: c.uid });
    /* 在容器口演一遍动画，而不是弹一段文字 */
    c.testAnim = {
      testId: testId, start: world.time, dur: 2.1,
      ok: !!r.ok, result: r.result || '', text: r.text || '', ph: r.ph
    };
    state.testAnimUid = c.uid;
    refreshInspector();
  }
  CHEM.__doTest = doTest;

  function openTestPicker(c) {
    var rows = TEST_LIST.map(function (t) { return { id: t.id, name: t.name, sub: '', color: '#cfe0ee' }; });
    openPicker('选择检验方法', rows, function (row) { doTest(c, row.id); });
  }

  /* 工具的循环顺序（滚轮切换用） */
  var TOOL_ORDER = ['select', 'pour', 'stir', 'ignite', 'power', 'light', 'test', 'connect', 'empty', 'delete'];

  function cycleTool(dir) {
    var i = TOOL_ORDER.indexOf(state.tool);
    if (i < 0) i = 0;
    var n = (i + dir + TOOL_ORDER.length) % TOOL_ORDER.length;
    setTool(TOOL_ORDER[n]);
    toast('工具：' + state.toolName + '（在实验台上滚动滚轮可切换）');
  }

  /* ======================= 画布交互 ======================= */
  function clampItem(it) {
    var a = CHEM.getApp(it.type);
    var hw = a && a.w ? a.w / 2 + 10 : 30;
    it.x = Math.max(hw, Math.min(SCENE.w - hw, it.x));
    /* 台面上的仪器底边不能低于台面；允许向上抬起（比如手持试管加热） */
    var maxUp = 300;
    it.y = Math.max(SCENE.benchY - maxUp, Math.min(SCENE.benchY, it.y));
  }

  /* 拖动时鼠标下的"目标容器"（用于倾倒 / 提示） */
  function pourTargetUnder(it) {
    var best = null;
    world.containers().forEach(function (o) {
      if (o.uid === it.uid) return;
      var a = CHEM.getApp(o.type);
      var hw = Math.max(20, CHEM.geometry.halfWidthAt(o.type, a.H) + 8);
      /* 判定条件：被拖容器的底面中心确实落在目标容器口内 */
      if (Math.abs(o.x - it.x) < hw && Math.abs(o.y - it.y) < 34) {
        if (!best || o.y > best.y) best = o;
      }
    });
    return best;
  }

  function bindCanvas() {
    var cv = renderer.canvas;

    cv.addEventListener('pointerdown', function (ev) {
      var s = renderer.screenToScene(ev.clientX, ev.clientY);
      /* 点在方程式卡片上 → 打开反应详情。
         卡片画在屏幕空间，所以要用画布内的像素坐标去命中测试。 */
      var cr = cv.getBoundingClientRect();
      var badge = renderer.pickBadge ? renderer.pickBadge(ev.clientX - cr.left, ev.clientY - cr.top) : null;
      if (badge && ev.button === 0) { openEquationDetail(badge.uid, badge.ruleId); return; }
      var it = renderer.pick(world, s.x, s.y);
      if (el.amountPop && !el.amountPop.classList.contains('hidden')) closeAmountPop();
      if (ev.button === 0 && state.tool === 'select') {
        if (it) {
          select(it.uid);
          state.dragging = { uid: it.uid, dx: it.x - s.x, dy: it.y - s.y, moved: false };
          try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
          /* 从试管架里拿出来的管子要脱离架子 */
          if (it.kind === 'container' && it.rackUid) { it.rackUid = null; it.slot = -1; }
          return;
        }
        select(null);
      }
      if (it) handleToolClick(it, ev);
    });

    cv.addEventListener('pointermove', function (ev) {
      var s = renderer.screenToScene(ev.clientX, ev.clientY);
      state.mouse = s;

      if (state.dragging) {
        var it = world.byUid(state.dragging.uid);
        if (!it) return;
        var nx = s.x + state.dragging.dx, ny = s.y + state.dragging.dy;
        if (Math.abs(nx - it.x) + Math.abs(ny - it.y) > 2) state.dragging.moved = true;
        it.x = nx; it.y = ny;
        clampItem(it);
        var tgt = pourTargetUnder(it);
        state.dropTarget = tgt ? tgt.uid : null;
        /* 拖动过程中简介要跟着一起走，否则气泡会停在原地 */
        state.badgeHover = null;
        updateHover(it);
        positionHoverTip();
        if (tgt && it.liquidVolume() > 0.1) {
          el.statusText.textContent = '松开鼠标：把「' + it.displayName() + '」中的液体倒入「' + tgt.displayName() + '」';
        } else {
          el.statusText.textContent = TOOL_HINT[state.tool] || '';
        }
        return;
      }

      /* 方程式卡片的悬停：变指针 + 高亮（同样用画布内像素坐标） */
      var cr2 = cv.getBoundingClientRect();
      var badge = renderer.pickBadge ? renderer.pickBadge(ev.clientX - cr2.left, ev.clientY - cr2.top) : null;
      if ((badge && badge.ruleId) !== (state.badgeHover && state.badgeHover.ruleId) ||
        (badge && badge.uid) !== (state.badgeHover && state.badgeHover.uid)) {
        state.badgeHover = badge;
      }
      if (cv.style) cv.style.cursor = badge ? 'pointer' : '';

      /* 悬停：显示容器状态气泡 */
      updateHover(renderer.pick(world, s.x, s.y));
      positionHoverTip();
    });

    cv.addEventListener('pointerup', function (ev) {
      if (!state.dragging) return;
      var d = state.dragging;
      state.dragging = null;
      state.dropTarget = null;
      var it = world.byUid(d.uid);
      if (!it) return;

      /* 以"松开鼠标"时的位置为准。若只依赖 pointermove，快速拖动时
         最后一小段位移可能来不及派发，落点就会和手松开的地方对不上。 */
      if (d.moved) {
        var s = renderer.screenToScene(ev.clientX, ev.clientY);
        it.x = s.x + d.dx;
        it.y = s.y + d.dy;
      }
      clampItem(it);

      /* 拖到试管架上 -> 自动入槽（必须真的拖动过，且要离得足够近） */
      if (d.moved && it.kind === 'container' && it.type === 'testTube') {
        var racks = world.devices().filter(function (x) { return x.type === 'testTubeRack'; });
        for (var i = 0; i < racks.length; i++) {
          var rk = racks[i], app = CHEM.getApp('testTubeRack');
          if (Math.abs(it.x - rk.x) < app.w / 2 - 4 && Math.abs(it.y - rk.y) < 26) {
            var used = {};
            world.containers().forEach(function (o) { if (o.rackUid === rk.uid) used[o.slot] = true; });
            for (var k = 0; k < app.slots; k++) {
              if (!used[k]) {
                it.rackUid = rk.uid; it.slot = k;
                it.x = rk.x + (k - 2) * app.slotSpacing;
                it.y = rk.y - 4;
                world.say('把 ' + it.displayName() + ' 放到试管架上。', { kind: 'info', uid: it.uid });
                break;
              }
            }
            break;
          }
        }
      }

      /* 拖到另一个容器口内 -> 倾倒（位置更新后重新判定目标） */
      if (d.moved && attachOnDrop(it)) {
        select(it.uid);
        refreshInspector();
        return;
      }
      if (d.moved && it.kind === 'container') {
        var tgt = pourTargetUnder(it);
        if (tgt && it.liquidVolume() > 0.1) {
          doPour(it, tgt);
        } else if (tgt) {
          select(tgt.uid);
        }
      }
      refreshInspector();
    });

    cv.addEventListener('pointerleave', function () {
      state.mouse = { x: -999, y: -999 };
      updateHover(null);
    });

    /* 在实验台上滚动滚轮 → 依次切换工具。
       做法是累积滚动位移，每攒够一格（WHEEL_STEP）就切一个工具，
       所以连滚三格就切三个工具，不会像之前那样被冷却时间吃掉。
       一格取 120：鼠标滚轮一格正好是 100~120，一格一个工具；
       触控板发的是许多小增量，攒够一格就切一个，同样跟手。 */
    var WHEEL_STEP = 120;
    var wheelAcc = 0;
    cv.addEventListener('wheel', function (ev) {
      if (ev.preventDefault) ev.preventDefault();
      var d = ev.deltaY;
      /* deltaMode: 0=像素 1=行 2=页，后两种换算成像素 */
      if (ev.deltaMode === 1) d *= 16;
      else if (ev.deltaMode === 2) d *= 100;
      wheelAcc += d;
      var guard = 0;
      while (Math.abs(wheelAcc) >= WHEEL_STEP && guard < 8) {
        cycleTool(wheelAcc > 0 ? 1 : -1);
        wheelAcc -= (wheelAcc > 0 ? WHEEL_STEP : -WHEEL_STEP);
        guard++;
      }
      /* 别让一次超大的滚动量攒下来影响下一次 */
      if (wheelAcc > WHEEL_STEP) wheelAcc = WHEEL_STEP;
      if (wheelAcc < -WHEEL_STEP) wheelAcc = -WHEEL_STEP;
    }, { passive: false });

    cv.addEventListener('dblclick', function (ev) {
      var s = renderer.screenToScene(ev.clientX, ev.clientY);
      var it = renderer.pick(world, s.x, s.y);
      if (it && it.kind === 'container') inspectDetail(it);
    });
  }

  /* ======================= 悬停查看容器状态 ======================= */
  function updateHover(it) {
    var uid = it ? it.uid : null;
    if (uid === state.hover) {
      if (uid && el.hoverTip && !el.hoverTip.classList.contains('hidden')) positionHoverTip();
      return;
    }
    state.hover = uid;
    if (!el.hoverTip) return;
    if (!uid) { el.hoverTip.classList.add('hidden'); return; }
    el.hoverTip.innerHTML = hoverHTML(it);
    el.hoverTip.classList.remove('hidden');
    positionHoverTip();
  }

  function positionHoverTip() {
    var wrapRect = el.canvasWrap.getBoundingClientRect();
    var r = renderer.canvas.getBoundingClientRect();
    var scale = renderer.scale, ox = renderer.ox, oy = renderer.oy;
    var it = state.hover ? world.byUid(state.hover) : null;
    if (!it) return;
    var a = CHEM.getApp(it.type);
    /* 场景坐标 -> 画布内的 CSS 像素 */
    var px = it.x * scale + ox;
    var py = (it.y - (a.H || 40)) * scale + oy;
    var tw = el.hoverTip.offsetWidth, th = el.hoverTip.offsetHeight;
    var left = px + 18;
    if (left + tw > wrapRect.width - 6) left = px - tw - 18;
    var top = py - 8;
    top = Math.max(6, Math.min(wrapRect.height - th - 6, top));
    el.hoverTip.style.left = Math.max(6, left) + 'px';
    el.hoverTip.style.top = top + 'px';
    void r;
  }

  function hoverHTML(it) {
    var a = CHEM.getApp(it.type);
    var out = [];
    out.push('<div class="ht-head"><b>' + it.name + '</b><em>' + (a.category === 'container' ? a.capacity + ' mL' : '装置') + '</em></div>');
    if (it.kind !== 'container') {
      if (a.tip) out.push('<div class="ht-tip">' + a.tip + '</div>');
      if (it.type === 'alcoholLamp') out.push('<div class="ht-row"><span>状态</span><b>' + (it.lit ? '已点燃' : '未点燃') + '</b></div>');
      return out.join('');
    }
    out.push('<div class="ht-row"><span>温度</span><b>' + it.temp.toFixed(0) + ' ℃' + (it.boiling ? ' · 沸腾' : '') + '</b></div>');
    out.push('<div class="ht-row"><span>液体</span><b>' + (it.liquidVolume() > 0.05 ? it.liquidVolume().toFixed(1) + ' mL' : '无') + '</b></div>');
    if (it.solidMass() > 0.0005) out.push('<div class="ht-row"><span>固体</span><b>' + it.solidMass().toFixed(2) + ' g</b></div>');
    if (it.gasVolume() > 0.05) out.push('<div class="ht-row"><span>气体</span><b>' + it.gasVolume().toFixed(1) + ' mL</b></div>');
    if (it.liquidVolume() > 0.05) out.push('<div class="ht-row"><span>pH</span><b>' + CHEM.Reaction.estimatePH(it).toFixed(1) + '</b></div>');
    var names = [];
    [it.liquids, it.solids, it.gases].forEach(function (l) {
      l.forEach(function (e) {
        var s = CHEM.getSub(e.id);
        if (s && names.indexOf(s.name) < 0) names.push(s.name);
      });
    });
    if (names.length) {
      var shown = names.slice(0, 9);
      var tagHtml = shown.map(function (n) { return '<i>' + n + '</i>'; }).join('');
      if (names.length > shown.length) tagHtml += '<i>+' + (names.length - shown.length) + '</i>';
      out.push('<div class="ht-tags">' + tagHtml + '</div>');
    }
    var m = CHEM.Reaction.findMatches(it);
    if (m.length) out.push('<div class="ht-eq">' + m[0].rule.equation + '</div>');
    else {
      var miss = CHEM.Reaction.missingCondition(it);
      if (miss) out.push('<div class="ht-tip">💡 ' + miss.text + '</div>');
      else if (it.heatNote) out.push('<div class="ht-tip warn">⚠ ' + it.heatNote + '</div>');
    }
    out.push('<div class="ht-foot">单击选中 · 双击查看详情</div>');
    return out.join('');
  }

  function handleToolClick(it, ev) {
    switch (state.tool) {
      case 'pour':
        if (it.kind !== 'container') { toast('请点击一个容器。'); return; }
        if (!state.pourFrom) {
          state.pourFrom = it.uid;
          el.statusText.textContent = '已选择「' + it.displayName() + '」，请再点击接收的容器。';
          toast('要倒入哪个容器？');
        } else if (state.pourFrom === it.uid) {
          state.pourFrom = null; setTool('pour');
        } else {
          var from = world.byUid(state.pourFrom);
          state.pourFrom = null;
          doPour(from, it);
          setTool('pour');
        }
        break;
      case 'stir':
        if (it.kind !== 'container') return;
        world.stir(it.uid);
        world.fx.spawnDissolve(it, '#bcdcf5', 6);
        refreshInspector();
        break;
      case 'ignite':
        if (it.type === 'alcoholLamp') { world.ignite(it.uid); refreshInspector(); return; }
        if (it.kind === 'container') {
          if (!canBurn(it)) {
            world.say(it.displayName() + ' 中没有可以燃烧的物质，点燃后没有变化。', { kind: 'info', uid: it.uid });
            return;
          }
          world.ignite(it.uid);
          refreshInspector();
        }
        break;
      case 'test':
        if (it.kind !== 'container') { toast('请点击一个容器。'); return; }
        openTestPicker(it);
        break;
      case 'power':
        if (it.kind !== 'container') { toast('请点击一个容器。'); return; }
        if (!it.hasAqueous() && !it.powered) {
          world.say(it.displayName() + ' 中没有水溶液，通电后没有变化。', { kind: 'info', uid: it.uid });
          return;
        }
        world.setPower(it.uid);
        refreshInspector();
        break;
      case 'light':
        if (it.kind !== 'container') { toast('请点击一个容器。'); return; }
        if (it.isEmpty() && !it.lighted) {
          world.say(it.displayName() + ' 是空的，光照没有意义。', { kind: 'info', uid: it.uid });
          return;
        }
        world.setLight(it.uid);
        refreshInspector();
        break;
      case 'connect':
        if (it.kind !== 'container' && !ATTACHABLE_UI[it.type]) { toast('请点击一个容器，或点「导管 / 分液漏斗 / 漏斗」。'); return; }
        if (!state.connectFrom) {
          state.connectFrom = it.uid;
          toast(it.kind === 'container' ? '再点击另一个容器或一件装置，把它们连接起来。' : '再点击要装配到的容器。');
          el.statusText.textContent = '已选择「' + it.name + '」，请再点击另一件仪器。';
        } else if (state.connectFrom === it.uid) {
          state.connectFrom = null;
        } else {
          var from = world.byUid(state.connectFrom);
          var ok = false;
          if (from && world.canAttach(from.uid, it.uid)) ok = world.attach(from.uid, it.uid);
          else if (from && world.canAttach(it.uid, from.uid)) ok = world.attach(it.uid, from.uid);
          else if (from && from.kind === 'container' && it.kind === 'container') {
            makeConnection(from.uid, it.uid);          // 两个容器之间自动加一根导管
            ok = true;
          }
          if (!ok) {
            toast('这两件仪器接不起来：导管用于导气，分液漏斗 / 漏斗用于加液。');
          } else if (from && from.kind === 'container') {
            select(it.uid);
          }
          state.connectFrom = null;
          setTool('connect');
        }
        break;
      case 'empty':
        if (it.kind !== 'container') return;
        if (it.isEmpty()) { toast('这个容器本来就是空的。'); return; }
        world.say('倒掉 ' + it.displayName() + ' 中的物质（' + it.describe() + '）。', { kind: 'info', uid: it.uid });
        it.empty();
        refreshInspector();
        break;
      case 'delete':
        world.say('把 ' + it.name + ' 从实验台上拿走。', { kind: 'info' });
        if (state.selected === it.uid) state.selected = null;
        world.remove(it.uid);
        refreshInspector();
        break;
      default:
        select(it.uid);
    }
  }

  function canBurn(c) {
    var combustibles = ['mg', 'c', 's', 'p', 'h2', 'co', 'ch4', 'c2h5oh', 'fe', 'cu', 'al', 'zn'];
    for (var i = 0; i < combustibles.length; i++) {
      if (c.hasBase(combustibles[i])) return true;
    }
    return false;
  }

  function makeConnection(aUid, bUid) {
    var tube = world.devices().filter(function (d) { return d.type === 'deliveryTube' && !d.linkB; })[0];
    if (!tube) {
      /* 新导管放在两个容器中间的上方，不要挤到台面角落里去 */
      var A = world.byUid(aUid), B = world.byUid(bUid);
      var mx = A && B ? (A.x + B.x) / 2 : 200;
      var my = Math.max(40, Math.min(A ? A.y : 566, B ? B.y : 566) - 250);
      tube = world.add('deliveryTube', mx, my);
    }
    world.connect(tube.uid, aUid, bUid);
    toast('导管已连接，产生的气体会被导入另一个容器。');
  }

  /* 可以被装配的装置类型（供「连接」工具判断） */
  var ATTACHABLE_UI = { deliveryTube: 1, separatoryFunnel: 1, funnel: 1 };

  function doPour(from, to) {
    if (!from || !to || from.kind !== 'container' || to.kind !== 'container') return;
    if (from.liquidVolume() <= 0.05) {
      world.say(from.displayName() + ' 中没有可以倒出的液体。', { kind: 'warn', uid: from.uid });
      return;
    }
    var a = CHEM.getApp(from.type);
    if (a && a.heat === 'net' && to.type === 'graduatedCylinder') { /* 允许 */ }
    world.fx.spawnDrop(to, '#bfe0f5', 4);
    world.pour(from.uid, to.uid, 0.7);
    select(to.uid);
    refreshInspector();
  }

  /* ======================= 选中与属性面板 ======================= */
  function select(uid) {
    state.selected = uid;
    refreshInspector();
  }

  function refreshInspector() {
    var box = el.inspBody;
    var it = state.selected ? world.byUid(state.selected) : null;
    box.innerHTML = '';
    if (!it) {
      box.appendChild(h('p', 'muted', '还没有选中任何仪器。点击实验台上的仪器查看它的状态。'));
      updateStatus();
      return;
    }
    var a = CHEM.getApp(it.type);

    var title = h('div', 'insp-title');
    title.appendChild(h('span', 'insp-ico', ICONS[it.type] || '⚗'));
    title.appendChild(h('span', '', it.name + (it.kind === 'container' ? '' : '（装置）')));
    box.appendChild(title);

    var list = h('dl', 'kv');
    if (it.kind === 'container') {
      list.appendChild(kvRow('温度', it.temp.toFixed(0) + ' ℃' + (it.boiling ? ' · 沸腾' : '')));
      list.appendChild(kvRow('容积', it.capacity() + ' mL'));
      list.appendChild(kvRow('液体', it.liquidVolume() > 0.05 ? it.liquidVolume().toFixed(1) + ' mL' : '无'));
      list.appendChild(kvRow('固体', it.solidMass() > 0.0005 ? it.solidMass().toFixed(2) + ' g' : '无'));
      list.appendChild(kvRow('气体', it.gasVolume() > 0.05 ? it.gasVolume().toFixed(1) + ' mL' : '无'));
      if (it.liquidVolume() > 0.05) list.appendChild(kvRow('pH 约', CHEM.Reaction.estimatePH(it).toFixed(1)));
      if (it.stir > 0.15) list.appendChild(kvRow('搅拌', '进行中'));
      if (it.powered) list.appendChild(kvRow('电源', '已通电'));
    } else {
      if (it.type === 'alcoholLamp') list.appendChild(kvRow('状态', it.lit ? '已点燃' : '未点燃'));
      if (it.type === 'deliveryTube') list.appendChild(kvRow('连接', (it.linkA && it.linkB) ? '已连接' : '未连接'));
    }
    box.appendChild(list);

    /* 成分标签 */
    var chips = h('div', 'chips');
    var any = false;
    [it.liquids, it.solids, it.gases].forEach(function (l) {
      if (!l) return;
      l.forEach(function (e) {
        var s = CHEM.getSub(e.id);
        if (!s) return;
        any = true;
        chips.appendChild(h('span', 'chip', s.name));
        s.hazard.forEach(function (hz) { chips.appendChild(h('span', 'chip warn', '⚠ ' + hz)); });
      });
    });
    if (any) box.appendChild(chips);

    /* 提示 */
    var hint = null;
    if (it.kind === 'container') {
      if (it.heatNote) hint = it.heatNote;
      else {
        var miss = CHEM.Reaction.missingCondition(it);
        if (miss) hint = '💡 ' + miss.text;
        else if (a && a.tip) hint = a.tip;
      }
    } else if (a && a.tip) hint = a.tip;
    if (hint) box.appendChild(h('div', 'hint-box', hint));

    /* 连接情况（容器与装置都显示） */
    box.appendChild(buildConnections(it));

    /* 操作按钮 */
    var acts = h('div', 'insp-actions');
    if (it.kind === 'container') {
      acts.appendChild(smallBtn('倒入其它容器', function () {
        var others = world.containers().filter(function (o) { return o.uid !== it.uid; });
        if (!others.length) { toast('台面上还没有别的容器。'); return; }
        openPicker('把 ' + it.displayName() + ' 中的液体倒入…',
          others.map(function (o) { return { id: o.uid, name: o.displayName(), sub: o.liquidVolume().toFixed(1) + ' mL', color: '#bcdcf5' }; }),
          function (row) { doPour(it, world.byUid(row.id)); });
      }));
      acts.appendChild(smallBtn('搅拌', function () { world.stir(it.uid); refreshInspector(); }));
      acts.appendChild(smallBtn('检验', function () { openTestPicker(it); }));
      acts.appendChild(smallBtn('倒掉', function () { it.empty(); refreshInspector(); }));
      acts.appendChild(smallBtn('移除', function () {
        if (state.selected === it.uid) state.selected = null;
        world.remove(it.uid); refreshInspector();
      }));
    } else if (it.type === 'alcoholLamp') {
      acts.appendChild(smallBtn(it.lit ? '盖灭酒精灯' : '点燃酒精灯', function () { world.ignite(it.uid); refreshInspector(); }));
      acts.appendChild(smallBtn('移除', function () { world.remove(it.uid); refreshInspector(); }));
    } else {
      acts.appendChild(smallBtn('移除', function () { world.remove(it.uid); refreshInspector(); }));
    }
    box.appendChild(acts);
    updateStatus();
  }

  function kvRow(k, v) {
    var d = h('div');
    d.appendChild(h('dt', '', k));
    d.appendChild(h('dd', '', v));
    return d;
  }
  function smallBtn(text, fn) {
    var b = h('button', 'btn btn-sm', text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function inspectDetail(c) {
    var html = '<p><b>' + c.displayName() + '</b></p><p>' + c.describe() + '</p>';
    var m = CHEM.Reaction.findMatches(c);
    if (m.length) {
      html += '<p><b>正在发生：</b></p>';
      m.forEach(function (x) { html += '<p class="log-eq">' + x.rule.equation + '</p>'; });
    }
    var a = CHEM.getApp(c.type);
    if (a.tip) html += '<p class="muted">' + a.tip + '</p>';
    if (a.tags) html += '<p class="muted">' + a.tags.join(' · ') + '</p>';
    openModal(c.displayName(), html);
  }

  function updateStatus() {
    var cs = world.containers();
    if (!cs.length) {
      el.dropHint.classList.remove('hidden');
    } else {
      el.dropHint.classList.add('hidden');
    }
    /* 实验进行中时状态栏留给"当前步骤"，不要被工具提示或容器数量来回覆盖。
       以前 refreshInspector 每 0.35 秒调一次这里，会把步骤文字刷掉，造成闪烁。 */
    if (state.task) {
      var cur = currentStep();
      el.statusText.textContent = cur ? cur.text : '实验已完成，做得很好！';
      return;
    }
    el.statusText.textContent = cs.length
      ? '台面上有 ' + cs.length + ' 件容器、' + world.devices().length + ' 件装置'
      : '台面上还没有仪器';
  }

  /* ======================= 实验记录 ======================= */
  function pushLog(entry) {
    var empty = el.logList.querySelector('.log-empty');
    if (empty) empty.remove();
    var item = h('div', 'log-item kind-' + entry.kind);
    item.appendChild(h('div', 'log-time', fmtTime(entry.t)));
    var main = h('div', 'log-main');
    main.appendChild(h('div', 'log-text', entry.text));
    if (entry.equation) main.appendChild(h('div', 'log-eq', entry.equation));
    item.appendChild(main);
    if (entry.uid) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', function () { select(entry.uid); });
    }
    el.logList.appendChild(item);
    el.logList.scrollTop = el.logList.scrollHeight;
    while (el.logList.children.length > 300) el.logList.removeChild(el.logList.firstChild);
  }

  function rebuildLog() {
    el.logList.innerHTML = '<p class="muted log-empty">实验过程中发生的现象和反应都会记录在这里。</p>';
    world.log.forEach(pushLog);
  }

  /* ======================= 任务系统 ======================= */
  function buildLevelSelect() {
    var sel = el.levelSelect;
    sel.innerHTML = '';
    CHEM.LEVELS.forEach(function (lv) {
      var o = document.createElement('option');
      o.value = lv.id;
      o.textContent = lv.name;
      o.title = lv.desc || '';
      sel.appendChild(o);
    });
    sel.value = CHEM.level;
    sel.addEventListener('change', function () {
      /* 物理模式下学段下拉框由物理模块接管（选项已换成初中物理 / 高中物理 / 全部） */
      if (window.PHY && PHY.active) { PHY.applyLevel(sel.value); return; }
      applyLevel(sel.value);
    });
  }

  function applyLevel(lv) {
    CHEM.setLevel(lv);
    if (el.levelSelect) el.levelSelect.value = CHEM.level;
    state.hover = null;
    if (el.hoverTip) el.hoverTip.classList.add('hidden');
    closeAmountPop();
    buildApparatusPanel();
    buildReagentPanel();
    buildTaskSelect();
    applyReagentHints();
    /* 学段变了，原来的任务步骤可能已经不适用 */
    if (state.task) {
      state.task = null; state.step = 0;
      el.taskSelect.value = '';
    }
    var n = (CHEM.REACTIONS || []).filter(function (r) { return CHEM.ruleAvailable(r); }).length;
    var lvName = (CHEM.LEVELS.filter(function (x) { return x.id === lv; })[0] || {}).name || lv;
    world.say('已切换到「' + lvName + '」，当前可用反应规则 ' + n + ' 条。', { kind: 'info' });
    toast('已切换到' + lvName + '（可用反应 ' + n + ' 条）');
    updateTaskUI();
    refreshInspector();
  }

  function buildTaskSelect() {
    var sel = el.taskSelect;
    var prev = sel.value;
    sel.innerHTML = '';
    var o = document.createElement('option');
    o.value = ''; o.textContent = '自由探索（无实验）';
    sel.appendChild(o);
    /* 初高中实验都列出来，分组显示；选中哪个就自动切到对应学段 */
    [['junior', '初中实验'], ['senior', '高中实验']].forEach(function (pair) {
      var list = (CHEM.EXPERIMENTS || []).filter(function (t) {
        return (t.level || 'junior') === pair[0];
      });
      if (!list.length) return;
      var grp = document.createElement('optgroup');
      grp.label = pair[1] + '（' + list.length + '）';
      list.forEach(function (t) {
        var op = document.createElement('option');
        op.value = t.id;
        op.textContent = t.name + (t.chapter ? '　· ' + t.chapter.split('·')[0].trim() : '');
        grp.appendChild(op);
      });
      sel.appendChild(grp);
    });
    sel.value = prev && sel.querySelector('option[value="' + prev + '"]') ? prev : '';
  }

  function findExperiment(id) {
    var list = CHEM.EXPERIMENTS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function startTask(id) {
    var task = id ? findExperiment(id) : null;
    world.clear();
    state.selected = null;
    state.heatWarned = {};
    state.peekStep = -1;
    rebuildLog();
    if (!task) {
      state.task = null; state.step = 0;
      hideGuide();
      applyReagentHints();
      updateTaskUI();
      refreshInspector();
      return;
    }
    /* 让学段跟着实验走：选高中实验就自动切到高中，不必手动改学段 */
    var lv = task.level || 'junior';
    if (CHEM.level !== lv && CHEM.level !== 'all') {
      CHEM.setLevel(lv);
      if (el.levelSelect) el.levelSelect.value = lv;
      buildApparatusPanel();
      buildReagentPanel();
    }
    state.task = task; state.step = 0;
    if (task.setup) task.setup.forEach(function (s) { world.add(s.type, s.x, s.y); });
    world.say('开始实验：' + task.name, { kind: 'info' });
    if (task.chapter) world.say('教材位置：' + task.chapter, { kind: 'info' });
    if (task.intro) world.say(task.intro, { kind: 'info' });
    (task.principle || []).forEach(function (eq) {
      world.say('实验原理', { kind: 'info', equation: eq, uid: null });
    });
    /* 预置物质 */
    (task.preset || []).forEach(function (p) {
      var c = null;
      if (p.index !== undefined) c = world.containers()[p.index];
      else if (p.apparatus) c = world.containers().filter(function (x) { return x.type === p.apparatus; })[0];
      if (c) world.addReagent(c.uid, p.id, p.amount);
    });
    updateTaskUI();
    refreshInspector();
    /* 标出本实验要用到的药品，并直接把货架切到药品页 */
    applyReagentHints();
    focusNeededReagents();
  }

  /* ======================= 实验流程指引栏 ======================= */
  function showGuide() { el.guideBar.classList.remove('hidden'); }
  function hideGuide() { el.guideBar.classList.add('hidden'); }

  /* 学科切换时物理模块会借用同一条指引栏：切走时把它藏起来（否则会一边显示化学实验的
     步骤、一边在物理画布里做物理实验），切回来再把化学实验的指引恢复出来。 */
  CHEM.__hideGuide = hideGuide;
  CHEM.__refreshGuide = function () {
    if (state.task) { showGuide(); renderGuide(); updateTaskUI(); }
    else { hideGuide(); }
  };

  /* 步骤条的短标题：取步骤文字的前 12 个字左右 */
  function stepShort(s, i) {
    var t = String(s.text || '').replace(/[（(].*?[）)]/g, '').trim();
    return t.length > 14 ? t.slice(0, 14) + '…' : t;
  }

  function renderGuide() {
    if (!state.task) { hideGuide(); return; }
    var t = state.task, steps = t.steps || [];
    showGuide();
    el.gbName.textContent = t.name;
    el.gbChapter.textContent = t.chapter || '';
    el.gbProgress.textContent = Math.min(state.step, steps.length) + ' / ' + steps.length;

    /* 步骤轨道 */
    el.gbRail.innerHTML = '';
    steps.forEach(function (s, i) {
      var cls = 'gb-step';
      if (i < state.step) cls += ' done';
      else if (i === state.step) cls += ' now';
      if (i === state.peekStep) cls += ' peek';
      var b = h('button', cls);
      b.type = 'button';
      b.appendChild(h('b', '', i < state.step ? '✓' : String(i + 1)));
      b.appendChild(h('span', '', stepShort(s, i)));
      b.title = s.text + (s.hint ? '\n💡 ' + s.hint : '');
      b.addEventListener('click', function () {
        state.peekStep = (state.peekStep === i) ? -1 : i;
        renderGuideNow();
      });
      el.gbRail.appendChild(b);
    });
    renderGuideNow();
  }

  function renderGuideNow() {
    var t = state.task;
    el.gbNow.innerHTML = '';
    if (!t) return;
    var steps = t.steps || [];
    if (state.step >= steps.length) {
      el.gbNow.appendChild(h('span', 'gb-done', '🎉 实验全部完成！可以「退出实验」回到自由探索，或继续自己尝试。'));
      return;
    }
    var i = state.peekStep >= 0 && state.peekStep < steps.length ? state.peekStep : state.step;
    var s = steps[i];
    var peeking = i !== state.step;
    el.gbNow.appendChild(h('span', 'gb-now-text', (peeking ? '第 ' + (i + 1) + ' 步（回顾）：' : '现在做：') + s.text));
    if (s.hint) el.gbNow.appendChild(h('span', 'gb-now-hint', '💡 ' + s.hint));
    /* 前两步顺便把实验原理摆出来，省得来回翻 */
    if (state.step <= 1 && t.principle && t.principle.length) {
      el.gbNow.appendChild(h('span', 'gb-now-eq', t.principle[0]));
    }
    /* 本实验要用到的药品：在药品架上已经标出来了，这里列一份清单，点一下滚过去 */
    if (state.reagents && state.reagents.length) {
      var box = h('div', 'gb-need');
      box.appendChild(h('span', 'gb-need-label', '本实验需要：'));
      state.reagents.forEach(function (id) {
        var sub = CHEM.getSub(id);
        if (!sub) return;
        var chip = h('button', 'gb-chip', sub.name);
        chip.type = 'button';
        chip.title = '在药品架上标出：' + sub.name;
        chip.addEventListener('click', function () {
          switchShelf('reagent');
          var card = el.reagentGroups.querySelector('.item-card[data-id="' + id + '"]');
          if (card && card.scrollIntoView) {
            try { card.scrollIntoView({ block: 'center' }); } catch (e) { /* 忽略 */ }
          }
          toast('药品架上的「' + sub.name + '」已标出');
        });
        box.appendChild(chip);
      });
      el.gbNow.appendChild(box);
    }
  }

  function updateTaskUI() {
    if (!state.task) {
      el.taskProgress.textContent = '自由探索';
      el.modeBadge.textContent = '自由探索';
      hideGuide();
      return;
    }
    var total = state.task.steps.length;
    el.taskProgress.textContent = '第 ' + Math.min(state.step + 1, total) + ' / ' + total + ' 步';
    el.modeBadge.textContent = state.task.name;
    var cur = currentStep();
    el.statusText.textContent = cur ? cur.text : '实验已完成，做得很好！';
    renderGuide();
  }

  function currentStep() {
    if (!state.task) return null;
    return state.task.steps[state.step] || null;
  }

  function checkTask() {
    if (!state.task) return;
    /* 一次把"已经满足的步骤"全部推进掉，而不是一帧只推进一格。
       有些步骤的判定只在某一瞬间成立（比如某种物质刚要被消耗掉的那一刻），
       万一用户一次操作同时满足了连续两步，这样也不会漏。 */
    var advanced = false, guard = 0;
    while (guard++ < 20) {
      var st = currentStep();
      if (!st) break;
      var ok = false;
      try { ok = st.check(world); } catch (e) { ok = false; }
      if (!ok) break;
      world.say('✅ 完成第 ' + (state.step + 1) + ' 步：' + st.text, { kind: 'success' });
      state.step++;
      advanced = true;
      if (state.step >= state.task.steps.length) {
        world.say('🎉 实验「' + state.task.name + '」全部完成！', { kind: 'success' });
        toast('🎉 实验完成：' + state.task.name);
      } else {
        toast('✓ 已完成：' + st.text);
      }
    }
    if (advanced) updateTaskUI();
  }

  /* 每次用户操作之后立刻判定一次。
     以前只在每帧检查，如果某个判定偏偏在这一帧的世界推进之后就不成立了，
     就会出现"明明按要求做了却没提示完成"。操作后马上判定能堵住这个缝。 */
  function afterAction() {
    checkTask();
  }

  function showTaskInfo() {
    if (!state.task) { openModal('使用帮助', HELP_HTML); return; }
    var t = state.task;
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
      var cls = i < state.step ? 'done' : (i === state.step ? 'now' : '');
      html += '<li class="' + cls + '">' + s.text + (s.hint ? '<em>💡 ' + s.hint + '</em>' : '') + '</li>';
    });
    html += '</ol>';
    openModal('实验说明', html);
  }

  /* ======================= 帮助 ======================= */
  var HELP_HTML = [
    '<p><b>一、选学段</b>：顶栏最左边可以在「初中化学 / 高中化学 / 全部内容」之间切换。切换会同时改变反应规则、药品架、仪器架和实验任务。高中模式保留金属与酸、酸碱中和、复分解等基础反应，只隐藏初中特有的细节反应。</p>',
    '<p><b>二、搭装置</b>：点左侧「仪器架」里的仪器，或把它拖到实验台上；拖动仪器可调整位置，试管拖到试管架上会自动入槽。</p>',
    '<p><b>三、加药品</b>：先点击实验台上的容器选中它，再点「药品架」里的药品。三种方式：',
    '<ul>',
    '<li><b>点击</b>药品 —— 按容器大小和左下角的「默认加入量（少量 / 适量 / 大量）」自动定量；</li>',
    '<li><b>把药品拖到容器上</b> —— 鼠标下的容器会亮绿圈，松手后弹出滑块，可以精确定量，还有「1 滴 / 少量 / 适量 / 大量」快捷键；</li>',
    '<li><b>Shift + 点击</b>药品 —— 同样弹出滑块。</li>',
    '</ul></p>',
    '<p><b>四、看状态</b>：鼠标移到实验台上的容器上，右侧会浮出状态气泡：温度、液体 / 固体 / 气体的量与种类、pH、成分标签，以及"正在发生什么反应"或"还差什么条件"。单击选中，双击看详细说明。</p>',
    '<p><b>五、做操作</b>：底部工具栏从左到右依次是 —— 选择 / 倾倒 / 搅拌 / 点燃 / 通电 / 光照 / 检验 / 导气 / 倒掉 / 移除。',
    '<ul>',
    '<li><b>倾倒</b>：点一次源容器，再点一次接收容器；也可以直接把一个容器拖到另一个容器的瓶口内。</li>',
    '<li><b>搅拌</b>：加快溶解与反应速率（玻璃棒）。</li>',
    '<li><b>点燃</b>：点酒精灯可点燃 / 盖灭；点装有可燃物的容器可点燃其中的物质。</li>',
    '<li><b>通电</b>：给装水的容器接通直流电源（电解水等）。</li>',
    '<li><b>光照</b>：用强光照射容器（甲烷氯代、次氯酸分解、H₂ + Cl₂ 等需要光照的反应）。</li>',
    '<li><b>检验</b>：带火星木条、燃着的木条、石蕊试纸、pH 试纸；也可以在药品架点「澄清石灰水」通入气体检验 CO₂。</li>',
    '<li><b>导气</b>：依次点两个容器，用导管连接，产生的气体会被导入另一个容器。</li>',
    '</ul></p>',
    '<p><b>六、加热</b>：先放好酒精灯并点燃，再把容器放到火焰上方。试管、蒸发皿、燃烧匙可直接加热；烧杯、锥形瓶必须垫石棉网；量筒、集气瓶、容量瓶不能加热。</p>',
    '<p><b>七、看现象</b>：气泡、沉淀、变色、白烟、火焰、浑浊都会实时显示，右侧「实验记录」会同步写出<b>实验现象</b>和<b>化学方程式</b>。</p>',
    '<p class="muted">快捷键：1~9、0 对应工具栏各模式；Delete 移除选中仪器；Esc 关闭浮层。</p>'
  ].join('');

  /* ======================= 主循环 ======================= */
  var lastT = 0;
  function frame(ts) {
    var dt = lastT ? Math.min(0.05, (ts - lastT) / 1000) : 0.016;
    lastT = ts;
    /* 物理学科接管时，化学世界完全停摆（不推进、不绘制、不判定任务），
       避免化学的反应、气体、温度在后台偷偷继续跑。 */
    if (window.PHY && PHY.active) {
      PHY.tick(dt);
      requestAnimationFrame(frame);
      return;
    }
    state.t += dt;
    world.step(dt);
    checkTask();
    checkHeatWarnings();
    renderer.render(world, {
      selected: state.selected,
      tool: state.tool,
      toolLabel: state.tool === 'select' ? '' : (state.toolName || ''),
      hover: state.hover,
      dropTarget: state.dropTarget,
      badgeHover: state.badgeHover,
      mouse: state.mouse,
      t: state.t
    });
    /* 简介气泡每帧重新定位，拖动时才能跟住鼠标 */
    if (state.hover) positionHoverTip();
    /* 属性面板低频刷新 */
    if (!state._inspT || state.t - state._inspT > 0.35) {
      state._inspT = state.t;
      if (state.selected) refreshInspector();
    }
    requestAnimationFrame(frame);
  }

  function checkHeatWarnings() {
    world.containers().forEach(function (c) {
      if (c.heatNote && state.heatWarned[c.uid] !== c.heatNote) {
        state.heatWarned[c.uid] = c.heatNote;
        world.say(c.heatNote, { kind: 'warn', uid: c.uid });
      }
    });
  }

  /* ======================= 存取档 ======================= */
  var SAVE_KEY = 'chemlab.save.v1';
  function saveWorld() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(world.toJSON()));
      toast('已保存到本地（浏览器存储）。');
    } catch (e) { toast('保存失败：' + e.message); }
  }
  function loadWorld() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { toast('没有找到存档。'); return; }
      world.load(JSON.parse(raw));
      rebuildLog();
      select(null);
      toast('已读取存档。');
    } catch (e) { toast('读取失败：' + e.message); }
  }

  /* ======================= 初始化 ======================= */
  /* 物理学科是否正在接管界面 */
  function phyOn() { return !!(window.PHY && PHY.active); }

  function init() {
    el = {
      toast: $('toast'), modalMask: $('modalMask'), modalTitle: $('modalTitle'),
      modalBody: $('modalBody'), modalClose: $('modalClose'), modalOk: $('modalOk'),
      pickerMask: $('pickerMask'), pickerTitle: $('pickerTitle'), pickerBody: $('pickerBody'),
      pickerClose: $('pickerClose'),
      panelApparatus: $('panelApparatus'), panelReagent: $('panelReagent'),
      reagentGroups: $('reagentGroups'), reagentSearch: $('reagentSearch'),
      inspBody: $('inspBody'), logList: $('logList'), toolbar: $('toolbar'),
      taskSelect: $('taskSelect'), taskProgress: $('taskProgress'),
      levelSelect: $('levelSelect'),
      shelfTabs: [],
      guideBar: $('guideBar'), gbName: $('gbName'), gbChapter: $('gbChapter'),
      gbProgress: $('gbProgress'), gbRail: $('gbRail'), gbNow: $('gbNow'),
      gbInfo: $('gbInfo'), gbCollapse: $('gbCollapse'), gbExit: $('gbExit'),
      amountMode: $('amountMode'), amountPop: $('amountPop'), hoverTip: $('hoverTip'),
      apName: $('apName'), apFormula: $('apFormula'), apTarget: $('apTarget'),
      apRange: $('apRange'), apValue: $('apValue'), apQuick: $('apQuick'),
      apOk: $('apOk'), apCancel: $('apCancel'),
      statusText: $('statusText'), modeBadge: $('modeBadge'), dropHint: $('dropHint'),
      shelfTip: $('shelfTip'), canvasWrap: $('canvasWrap'), bench: $('bench')
    };

    renderer = new CHEM.Renderer(el.bench);

    buildLevelSelect();
    buildApparatusPanel();
    buildReagentPanel();
    buildTaskSelect();
    el.taskSelect.addEventListener('change', function () {
      if (phyOn()) { PHY.startTask(el.taskSelect.value || null); return; }
      startTask(el.taskSelect.value || null);
    });

    /* 加药量浮层 */
    el.apRange.addEventListener('input', updateAmountLabel);
    el.apOk.addEventListener('click', confirmAmountPop);
    el.apCancel.addEventListener('click', closeAmountPop);
    document.addEventListener('pointerdown', function (e) {
      if (!el.amountPop || el.amountPop.classList.contains('hidden')) return;
      if (el.amountPop.contains(e.target)) return;
      closeAmountPop();
    }, true);

    /* 实验流程指引栏 */
    el.gbInfo.addEventListener('click', function () {
      if (phyOn()) { PHY.showTaskInfo(); return; }
      showTaskInfo();
    });
    el.gbCollapse.addEventListener('click', function () {
      var collapsed = el.guideBar.classList.toggle('collapsed');
      el.gbCollapse.textContent = collapsed ? '展开' : '收起';
    });
    el.gbExit.addEventListener('click', function () {
      if (phyOn()) { PHY.exitTask(); return; }
      el.taskSelect.value = '';
      startTask(null);
      toast('已退出实验，回到自由探索。');
    });

    /* 默认加入量 */
    el.amountMode.querySelectorAll('.am-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.amountMode = b.dataset.mode;
        el.amountMode.querySelectorAll('.am-btn').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
      });
    });

    /* 货架切换 */
    el.shelfTabs = Array.prototype.slice.call(document.querySelectorAll('.shelf-tabs .tab'));
    el.shelfTabs.forEach(function (b) {
      b.addEventListener('click', function () { switchShelf(b.dataset.tab); });
    });

    el.reagentSearch.addEventListener('input', function () { filterReagents(this.value); });

    /* 工具栏 */
    el.toolbar.querySelectorAll('.tool').forEach(function (b) {
      b.addEventListener('click', function () { setTool(b.dataset.tool); });
    });

    /* 顶栏按钮 */
    $('btnHelp').addEventListener('click', function () {
      if (phyOn()) { PHY.showHelp(); return; }
      showTaskInfo();
    });
    $('btnTaskInfo').addEventListener('click', function () {
      if (phyOn()) { PHY.showTaskInfo(); return; }
      showTaskInfo();
    });
    $('btnClear').addEventListener('click', function () {
      if (phyOn()) {
        if (confirm('确定要重置当前物理仿真吗？')) PHY.resetSim();
        return;
      }
      if (!confirm('确定要清空实验台吗？')) return;
      world.clear(); state.selected = null; rebuildLog(); refreshInspector(); toast('实验台已清空。');
    });
    $('btnSave').addEventListener('click', function () {
      if (phyOn()) { toast('物理仿真暂不支持存档：参数与状态请用控制条随时重置。'); return; }
      saveWorld();
    });
    $('btnLoad').addEventListener('click', function () {
      if (phyOn()) { toast('物理仿真暂不支持读档。切换回「化学」后可使用存档。'); return; }
      loadWorld();
    });
    $('btnUndo').addEventListener('click', function () {
      if (phyOn()) { toast('物理仿真没有「撤销」：点击控制条上的重置按钮即可回到初始状态。'); return; }
      var uid = state.selected;
      if (!uid) { toast('先选中一个仪器再撤销。'); return; }
      var it = world.byUid(uid);
      if (it && it.kind === 'container') {
        it.empty(); refreshInspector(); toast('已清空该容器。');
      }
    });
    $('btnClearLog').addEventListener('click', function () {
      if (phyOn()) { PHY.clearLog(); return; }
      world.log = []; rebuildLog();
    });
    el.modalClose.addEventListener('click', closeModal);
    el.modalOk.addEventListener('click', closeModal);
    el.modalMask.addEventListener('click', function (e) { if (e.target === el.modalMask) closeModal(); });
    el.pickerClose.addEventListener('click', function () { el.pickerMask.classList.add('hidden'); });
    el.pickerMask.addEventListener('click', function (e) { if (e.target === el.pickerMask) el.pickerMask.classList.add('hidden'); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); el.pickerMask.classList.add('hidden'); if (!phyOn()) setTool('select'); }
      if (phyOn()) return;
      var map = { '1': 'select', '2': 'pour', '3': 'stir', '4': 'ignite', '5': 'power', '6': 'light', '7': 'test', '8': 'connect', '9': 'empty', '0': 'delete' };
      if (map[e.key] && !/input|select|textarea/i.test(document.activeElement.tagName)) setTool(map[e.key]);
      if (e.key === 'Delete' && state.selected) {
        world.remove(state.selected); state.selected = null; refreshInspector();
      }
      if (e.key === 'Escape') closeAmountPop();
    });

    /* 事件订阅 */
    world.on(function (ev) { if (ev.type === 'log') pushLog(ev.entry); });

    /* 尺寸 */
    var wrap = el.canvasWrap;
    function doResize() {
      var w = wrap.clientWidth, h = wrap.clientHeight;
      /* 切到物理学科时化学画布会被 display:none 收起，这时量到的宽高是 0。
         绝不能用 0 去 resize —— canvas 会变成 0 宽，切回化学就是一片空白。
         （以前就是这样：在物理模式下动一下窗口，切回来化学画布就没了。） */
      if (!w || !h) return;
      renderer.resize(w, h);
    }
    CHEM.__resizeCanvas = doResize;
    doResize();
    if (window.ResizeObserver) new ResizeObserver(doResize).observe(wrap);
    window.addEventListener('resize', doResize);

    bindCanvas();
    setTool('select');
    refreshInspector();
    updateStatus();

    /* 物理学科模块：接管 #phybench / 物理货架 / 控制条 */
    if (window.PHY && PHY.init) PHY.init();

    requestAnimationFrame(frame);

    /* 首次进入给一点引导（world.say 已经会通过监听器写入右侧记录） */
    world.say('欢迎来到虚拟化学实验室！点左侧仪器架开始搭装置，或从顶栏选择一个实验任务。', { kind: 'info' });

    /* 测试钩子：供 test/ui-smoke.mjs 在无浏览器环境下驱动界面（不影响正常功能） */
    CHEM.__world = world;
    CHEM.__state = function () { return state; };
    CHEM.__select = select;
    CHEM.__startTask = startTask;
    CHEM.__applyLevel = applyLevel;
    CHEM.__openEquationDetail = openEquationDetail;
    CHEM.__renderer = renderer;
    /* 供物理模块在切回化学时重建化学界面（core.js 的 setSubject 会调用） */
    CHEM.__buildTaskSelect = buildTaskSelect;
    CHEM.__rebuildLog = rebuildLog;
    CHEM.__currentTaskId = function () { return state.task ? state.task.id : ''; };
    CHEM.__buildPanels = function () { buildApparatusPanel(); buildReagentPanel(); };
    CHEM.__clientOf = function (x, y) {
      var r = renderer.canvas.getBoundingClientRect();
      return {
        clientX: r.left + x * renderer.scale + renderer.ox,
        clientY: r.top + y * renderer.scale + renderer.oy
      };
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
