/* =============================================================================
 * 虚拟化学实验室 —— 反应引擎 (Reaction Engine)
 * -----------------------------------------------------------------------------
 * 工作原理：
 *   每一帧，对每个容器：
 *     1. 找出所有"条件满足且反应物都还在"的规则；
 *     2. 按化学计量比算出该规则的最大反应进度 ξmax = min(n_i / ν_i)；
 *     3. 按反应速率 k 推进一小段进度 dξ，扣掉反应物、加上生成物；
 *     4. 根据现象类型产生气泡 / 沉淀 / 火焰 / 白烟等粒子。
 *   反应进度按指数趋近完成，因此宏观上表现为"先快后慢"，与真实一致。
 * ========================================================================== */
(function (root) {
  'use strict';

  var CHEM = (root.CHEM = root.CHEM || {});

  var rulesCache = null;
  function rules() {
    if (!rulesCache) {
      /* 关键：这里必须按学段过滤。如果只过滤界面上的货架而不过滤规则表，
         初中模式下照样会冒出高中反应（例如提示里出现"铁与水蒸气反应"）。 */
      rulesCache = (CHEM.REACTIONS || [])
        .filter(function (r) { return CHEM.ruleAvailable ? CHEM.ruleAvailable(r) : true; })
        .sort(function (a, b) {
          var pa = a.priority || 0, pb = b.priority || 0;
          if (pb !== pa) return pb - pa;
          return (b.reactants ? b.reactants.length : 0) - (a.reactants ? a.reactants.length : 0);
        });
    }
    return rulesCache;
  }
  CHEM.invalidateRules = function () { rulesCache = null; };
  /* 供测试与界面使用：当前学段下实际参与匹配的规则 */
  CHEM.activeRules = function () { return rules(); };

  /* 单位时间内最多消耗多少 mmol 反应物（k = 1 时）。
     没有这个上限，像"电解水"这种反应物是大量水的反应会在 1 秒内全部反应完。 */
  var MAX_ABS_RATE = 1.2;

  /* 全局反应快慢的总开关。
     学生需要时间看清气泡、颜色变化和沉淀，所以让反应慢一点：
     典型反应从"一两秒完事"放慢到大约 4~8 秒。
     想调快调慢只改这一个数就行（数值越大越快）。 */
  var SPEED = 0.38;

  /* 反应停下来之后，容器旁的方程式标注还要停留多久（秒）。
     要留够读一条方程式的时间，所以给得比较宽裕。 */
  var ACTIVE_LINGER = 10.0;

  /* 基本反应类型的速率系数 */
  var TYPE_RATE = {
    '复分解反应': 3.0,
    '置换反应': 1.25,
    '化合反应': 0.9,
    '分解反应': 0.55,
    '氧化还原反应': 1.0,
    '其他': 1.0
  };

  /* 常见"不反应"的说明，用于给学生解释为什么没看到现象 */
  var NO_REACTION = [
    { pair: ['cu', 'hcl'], text: '铜排在氢的后面，不能与稀盐酸反应，所以没有气泡产生。' },
    { pair: ['cu', 'h2so4'], text: '铜排在氢的后面，不能与稀硫酸反应，所以没有气泡产生。' },
    { pair: ['cu', 'feso4'], text: '铜的活动性比铁弱，不能把铁从它的盐溶液中置换出来。' },
    { pair: ['cu', 'znso4'], text: '铜的活动性比锌弱，不能把锌从它的盐溶液中置换出来。' },
    { pair: ['cu', 'mgso4'], text: '铜的活动性比镁弱，不能发生置换反应。' },
    { pair: ['cu', 'al2so43'], text: '铜的活动性比铝弱，不能发生置换反应。' },
    { pair: ['fe', 'znso4'], text: '铁的活动性比锌弱，不能把锌置换出来。' },
    { pair: ['fe', 'mgso4'], text: '铁的活动性比镁弱，不能把镁置换出来。' },
    { pair: ['fe', 'al2so43'], text: '铁的活动性比铝弱，不能把铝置换出来。' },
    { pair: ['ag', 'hcl'], text: '银排在氢的后面，不能与稀盐酸反应。' },
    { pair: ['na2co3', 'nacl'], text: '碳酸钠与氯化钠交换成分后没有沉淀、气体或水生成，所以不发生复分解反应。' },
    { pair: ['na2co3', 'na2so4'], text: '两种钠盐混合不会生成沉淀、气体或水，因此不发生反应。' },
    { pair: ['nacl', 'h2so4'], text: '氯化钠与稀硫酸混合没有沉淀、气体或水生成，不发生复分解反应。' },
    { pair: ['co2', 'hcl'], text: '二氧化碳与稀盐酸不反应。' },
    { pair: ['caco3', 'nacl'], text: '碳酸钙不溶于水，也不与氯化钠反应。' },
    { pair: ['cuso4', 'hcl'], text: '硫酸铜与稀盐酸交换成分后得不到沉淀、气体或水，不发生反应。' },
    { pair: ['cuso4', 'h2so4'], text: '硫酸铜与稀硫酸不发生复分解反应。' }
  ];

  /* 火焰 / 特殊现象的颜色映射 */
  var FLAME_COLOR = {
    h2: '#a9c9ff', co: '#6fa8ff', ch4: '#8fc4ff', s: '#a06fe0',
    mg: '#ffffff', c: '#fff0c8', p: '#ffe9a8', fe: '#ffd27f',
    c2h5oh: '#8fc4ff', cu: '#7fe0c8'
  };

  function effectOf(rule) {
    var p = rule.phenomena || {};
    var first = (rule.reactants && rule.reactants[0]) || '';
    var color = FLAME_COLOR[first] || '#ffb347';
    switch (p.kind) {
      case 'bubble': return { kind: 'bubble', rate: 6, gas: p.gas };
      case 'precipitate': return { kind: 'ppt', rate: 5, color: p.pptColor || '#eef1f5' };
      case 'smoke': return { kind: 'smoke', rate: 3, color: '#f2f4f8' };
      case 'flame': return { kind: 'flame', rate: 4, color: color };
      case 'glow': return { kind: 'spark', rate: 5, color: color };
      case 'dissolve': return { kind: 'dissolve', rate: 2, color: '#a9cbe8' };
      case 'colorChange': return { kind: 'tint', rate: 0 };
      default: return { kind: 'none', rate: 0 };
    }
  }

  /* 需要"额外能量输入"的规则：这些条件没有写进数据表，由引擎特判。
     电解水必须接通电源，否则只放一试管水是不会有任何变化的。 */
  var NEEDS_POWER = { h2o_electric: '通电' };

  /* ---- 条件判定 ---- */
  function conditionsOK(c, r) {
    var cond = r.conditions || {};
    if (NEEDS_POWER[r.id] && !c.powered) return false;
    if (cond.electricity && !c.powered) return false;
    if (cond.light && !c.lighted) return false;
    if (cond.minTemp && c.temp < cond.minTemp) return false;
    if (cond.heat && c.temp < 55) return false;
    if (cond.ignite && !c.ignited) return false;
    if (cond.needsWater && !(c.hasAqueous ? c.hasAqueous() : c.hasWater())) return false;
    if (cond.catalyst && !c.hasBase(cond.catalyst)) return false;
    /* exclude：容器里只要有其中任何一种物质，这条反应就不发生。
       典型例子：碳酸钙悬浊液只有"没有强酸"时才能被过量 CO₂ 转成碳酸氢钙。 */
    if (cond.exclude) {
      for (var i = 0; i < cond.exclude.length; i++) {
        if (c.hasBase(cond.exclude[i])) return false;
      }
    }
    return true;
  }

  /* ---- 反应速率系数 ---- */
  function rateFactor(c, r) {
    var cond = r.conditions || {};
    var k = TYPE_RATE[r.type] !== undefined ? TYPE_RATE[r.type] : 1.0;
    if (cond.ignite) k *= 1.8;
    if (cond.catalyst) k *= 1.5;
    if (cond.heat) k *= 0.9;
    /* 温度：每升高约 28℃ 速率大致翻倍 */
    k *= Math.pow(2.0, (c.temp - 25) / 28);
    /* 搅拌 */
    k *= (1 + c.stir * 0.8);
    /* 全局减速，让学生看得清过程 */
    k *= SPEED;
    /* 固体反应物越少越慢（表面积减小） */
    if (k > 6) k = 6;
    if (k < 0.02) k = 0.02;
    return k;
  }

  /* ---- 找匹配 ---- */
  function findMatches(c) {
    var list = rules(), out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.indicator) continue;
      if (!conditionsOK(c, r)) continue;
      var ratio = r.ratio || {};
      var extent = Infinity, ok = true;
      for (var k = 0; k < r.reactants.length; k++) {
        var b = r.reactants[k];
        var amt = c.amountOf(b);
        if (amt <= 1e-7) { ok = false; break; }
        var nu = ratio[b] || 1;
        var e = amt / nu;
        if (e < extent) extent = e;
      }
      if (!ok || !isFinite(extent) || extent <= 1e-9) continue;
      out.push({ rule: r, extent: extent });
    }
    return out;
  }

  /* ---- 加入生成物 ---- */
  function addProduct(world, c, subId, mmol) {
    var sub = CHEM.getSub(subId);
    if (!sub || mmol <= 1e-9) return;
    if (sub.phase === 'gas') {
      var ml = mmol * 22.4;
      c.addGas(subId, ml);                       // 空间不够时气体会逸出，只留气泡
      world.fx.spawnBubble(c, null, 2);
      return;
    }
    if (sub.phase === 'solid') {
      var g = mmol * CHEM.kinetics.gPerMmol(sub);
      var insoluble = sub.soluble === false;
      c.addSolid(subId, g, insoluble);
      return;
    }
    /* 液体 / 溶液 */
    if (sub.phase === 'liquid') {
      /* 纯液体（如水、乙醇）按真实摩尔体积加入 */
      var ml2 = mmol * CHEM.kinetics.mlPerMmol(sub);
      c.addLiquid(subId, Math.max(1e-4, ml2));
    } else {
      /* 溶质：按物质的量加入，体积只占溶质本身体积的一点点 */
      var lid = sub.phase === 'solution' ? subId : CHEM.pickSolutionId(sub);
      c.addSolute(lid, mmol);
    }
  }

  /* ---- 指示剂显色（不消耗物质） ---- */
  function applyIndicators(world, c) {
    var list = rules();
    var chosen = null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r.indicator) continue;
      if (!conditionsOK(c, r)) continue;
      var ok = true;
      for (var k = 0; k < r.reactants.length; k++) {
        if (c.amountOf(r.reactants[k]) <= 1e-7) { ok = false; break; }
      }
      if (!ok) continue;
      chosen = r; break;                          // rules 已按优先级排序
    }
    if (chosen) {
      var col = chosen.phenomena.toColor;
      if (col) c.tint = col;
      if (!c.firedRules[chosen.id]) {
        c.firedRules[chosen.id] = 1;
        world.say(chosen.phenomena.message, { kind: 'reaction', equation: chosen.equation, uid: c.uid });
      }
    } else {
      c.tint = null;
    }
  }

  /* ---- 主循环 ---- */
  function tick(world, c, dt) {
    var matches = findMatches(c);
    var reacted = 0;

    for (var i = 0; i < matches.length; i++) {
      var m = matches[i], r = m.rule;
      var k = rateFactor(c, r);
      /* 一阶动力学（按剩余量指数趋近完成），同时受绝对速率上限约束 */
      var dExtent = Math.min(m.extent, MAX_ABS_RATE) * Math.min(1, k * dt);
      if (dExtent > m.extent) dExtent = m.extent;
      if (dExtent <= 1e-9) continue;

      /* 扣反应物 */
      var ratio = r.ratio || {}, consumed = true;
      for (var j = 0; j < r.reactants.length; j++) {
        var b = r.reactants[j];
        var need = (ratio[b] || 1) * dExtent;
        var got = c.consume(b, need);
        if (got < need * 0.5) consumed = false;
      }
      if (!consumed) continue;

      /* 加生成物：气体产物按比例共享容器剩余空间，
         否则排在前面的组分（如氢气）会独占空间，氢气与氧气的体积比就不对了 */
      var gasPlan = [], gasTotal = 0;
      for (var p = 0; p < r.products.length; p++) {
        var pr = r.products[p];
        var sub = CHEM.getSub(pr.id);
        if (!sub) continue;
        var mmol = (pr.n || 1) * dExtent;
        if (sub.phase === 'gas') {
          var ml = mmol * 22.4;
          gasPlan.push({ id: pr.id, ml: ml });
          gasTotal += ml;
        } else {
          addProduct(world, c, pr.id, mmol);
        }
      }
      if (gasPlan.length) {
        var room = c.headspace() - c.gasVolume();
        var share = gasTotal > 0 ? Math.max(0, Math.min(1, room / gasTotal)) : 0;
        for (var gi = 0; gi < gasPlan.length; gi++) {
          if (c.addGas(gasPlan[gi].id, gasPlan[gi].ml * share) > 0) {
            world.fx.spawnBubble(c, null, 1);
          }
        }
      }
      reacted += dExtent;
      /* 记录"这条反应刚刚正在进行"，供渲染层在容器旁边标注方程式 */
      if (!c.activeUntil) c.activeUntil = Object.create(null);
      c.activeUntil[r.id] = world.time + ACTIVE_LINGER;

      /* 现象粒子 */
      var eff = effectOf(r);
      if (eff.rate > 0) {
        var n = eff.rate * dt * (1 + Math.min(2, dExtent * 20));
        var count = Math.random() < (n % 1) ? Math.ceil(n) : Math.floor(n);
        if (count > 0) {
          if (eff.kind === 'bubble') world.fx.spawnBubble(c, null, count);
          else if (eff.kind === 'ppt') world.fx.spawnPrecipitate(c, eff.color, count);
          else if (eff.kind === 'smoke') world.fx.spawnSmoke(c, count, eff.color);
          else if (eff.kind === 'flame') world.fx.spawnFlame(c, count, eff.color);
          else if (eff.kind === 'spark') world.fx.spawnSparks(c, count, eff.color);
          else if (eff.kind === 'dissolve') world.fx.spawnDissolve(c, eff.color, count);
        }
      }

      /* 反应刚开始时写一次实验记录 */
      if (!c.firedRules[r.id]) {
        c.firedRules[r.id] = 1;
        world.say(r.phenomena.message, { kind: 'reaction', equation: r.equation, uid: c.uid });
        if (r.safety) world.say('⚠ 安全提示：' + r.safety, { kind: 'warn', uid: c.uid });
        c.phenomenonSig = null;
      }
    }

    /* 指示剂 */
    applyIndicators(world, c);

    /* "无明显现象" 检测 */
    if (reacted <= 1e-8) {
      c.noReactTime = (c.noReactTime || 0) + dt;
    } else {
      c.noReactTime = 0;
      c.phenomenonSig = null;
    }
    if (c.noReactTime > 1.6 && !c.indicatorPending) {
      var species = Object.keys(c.species()).sort();
      var sig = species.join('+');
      if (species.length >= 2 && sig !== c.phenomenonSig) {
        c.phenomenonSig = sig;
        var note = lookupNoReaction(species);
        if (note) world.say(note, { kind: 'info', uid: c.uid });
        else if (hasAnyRuleFor(c, species)) world.say('混合后暂时没有观察到明显现象。', { kind: 'info', uid: c.uid });
      }
    }
  }

  function lookupNoReaction(species) {
    var set = Object.create(null);
    species.forEach(function (s) { set[s] = true; });
    for (var i = 0; i < NO_REACTION.length; i++) {
      var e = NO_REACTION[i];
      var all = true;
      for (var j = 0; j < e.pair.length; j++) if (!set[e.pair[j]]) { all = false; break; }
      if (all) return e.text;
    }
    return null;
  }

  /* 是否存在"只差条件"的规则（用于提示"需要加热/点燃"） */
  function hasAnyRuleFor(c, species) {
    var set = Object.create(null);
    (species || Object.keys(c.species())).forEach(function (s) { set[s] = true; });
    var list = rules();
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.indicator) continue;
      var ok = true;
      for (var k = 0; k < r.reactants.length; k++) if (!set[r.reactants[k]]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  /* 给 UI 用的提示：当前混合"只差什么条件"。
     同一容器常常能匹配好几条规则（比如有水就能匹配"电解水"），
     这里优先返回涉及物质最多的那条，也就是最贴近用户意图的那条。 */
  function missingCondition(c) {
    var set = c.species(), list = rules();
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.indicator) continue;
      var ok = true;
      for (var k = 0; k < r.reactants.length; k++) if (!set[r.reactants[k]]) { ok = false; break; }
      if (!ok) continue;
      var cond = r.conditions || {};
      var cand = null;
      if (NEEDS_POWER[r.id] && !c.powered) cand = { rule: r, need: 'power', text: '需要接通电源（通电）才能进行：' + r.name };
      else if (cond.electricity && !c.powered) cand = { rule: r, need: 'power', text: '需要接通电源（通电）才能进行：' + r.name };
      else if (cond.light && !c.lighted) cand = { rule: r, need: 'light', text: '需要光照才能进行：' + r.name };
      else if (cond.heat && c.temp < 55) cand = { rule: r, need: 'heat', text: '需要加热才能反应：' + r.name };
      else if (cond.ignite && !c.ignited) cand = { rule: r, need: 'ignite', text: '需要点燃才能反应：' + r.name };
      else if (cond.catalyst && !c.hasBase(cond.catalyst)) cand = { rule: r, need: 'catalyst:' + cond.catalyst, text: '需要加入' + nameOf(cond.catalyst) + '作催化剂：' + r.name };
      else if (cond.needsWater && !(c.hasAqueous ? c.hasAqueous() : c.hasWater())) cand = { rule: r, need: 'water', text: '需要在水溶液中进行：' + r.name };
      if (cand && (!best || r.reactants.length > best.rule.reactants.length)) best = cand;
    }
    return best;
  }

  function nameOf(id) {
    var s = CHEM.getSub(id);
    return s ? s.name : id;
  }

  /* ---- pH 估算 ---- */
  function estimatePH(c) {
    var table = Object.create(null);
    (CHEM.PH_RULES || []).forEach(function (e) { table[e.id] = e.ph; });
    var wA = 0, wB = 0, phA = 7, phB = 7;
    c.liquids.forEach(function (e) {
      var sub = CHEM.getSub(e.id);
      if (!sub) return;
      var ph = table[sub.base];
      if (ph === undefined) ph = table[sub.id];
      if (ph === undefined) return;
      var amt = e.mmol || 0;
      if (ph < 6.8) { wA += amt; phA = Math.min(phA, ph); }
      else if (ph > 7.2) { wB += amt; phB = Math.max(phB, ph); }
    });
    if (wA === 0 && wB === 0) return 7;
    var net = wA - wB, tot = wA + wB;
    var scale = tot > 0 ? Math.abs(net) / tot : 0;
    if (net > 0) return 7 + (phA - 7) * scale;
    if (net < 0) return 7 + (phB - 7) * scale;
    return 7;
  }

  /* ---- 检验方法 ----
     注意：检验结果由这里统一记录到 c.tests 上（而不是交给界面去记），
     这样任何调用方——界面、实验步骤判定、离线测试——拿到的都是同一份状态。 */
  function runTest(c, testId) {
    var tests = CHEM.TESTS || [];
    var test = null;
    for (var i = 0; i < tests.length; i++) if (tests[i].id === testId) { test = tests[i]; break; }
    if (!test) return null;
    var apply = test.applies || 'both';
    var isGas = c.liquidVolume() < 0.05 && c.gasVolume() > 0.05;
    var res;
    if (apply === 'gas' && !isGas && c.gasVolume() <= 0.05) {
      res = { ok: false, text: '容器里没有收集到气体，无法用' + test.name + '检验。', result: '' };
      return record(c, testId, res);
    }
    if (apply === 'liquid' && c.liquidVolume() < 0.05) {
      res = { ok: false, text: '容器里没有液体，无法用' + test.name + '检验。', result: '' };
      return record(c, testId, res);
    }

    var species = c.species();
    var ph = estimatePH(c);

    for (var k = 0; k < (test.rules || []).length; k++) {
      var rule = test.rules[k];
      var hit = true;
      if (rule.match) {
        for (var m = 0; m < rule.match.length; m++) if (!species[rule.match[m]]) { hit = false; break; }
      }
      if (hit && rule.minFraction !== undefined) {
        var total = c.gasVolume();
        var matchMl = 0;
        (rule.match || []).forEach(function (b) {
          c.gases.forEach(function (g) {
            var s = CHEM.getSub(g.id);
            if (s && s.base === b) matchMl += g.ml;
          });
        });
        if (total <= 0 || matchMl / total < rule.minFraction) hit = false;
      }
      if (hit && rule.phBelow !== undefined && !(ph < rule.phBelow)) hit = false;
      if (hit && rule.phAbove !== undefined && !(ph > rule.phAbove)) hit = false;
      if (hit) {
        return record(c, testId, { ok: !!rule.pass, text: rule.message, result: rule.result, ph: ph });
      }
    }
    var fb = test.fallback || {};
    return record(c, testId, {
      ok: !!fb.pass, text: fb.message || '没有观察到明显变化。', result: fb.result, ph: ph
    });
  }

  function record(c, testId, res) {
    if (!c.tests) c.tests = Object.create(null);
    c.tests[testId] = { ok: !!res.ok, text: res.text, result: res.result || '', ph: res.ph, t: 0 };
    res.testId = testId;
    return res;
  }

  /* ---- 当前"正在发生"的反应，供界面在容器旁标注方程式 ----
     刚停下来几秒内的反应也会保留，否则气泡一停标注就闪没了。 */
  function activeRules(c, now) {
    if (!c.activeUntil) return [];
    var list = rules(), out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!c.activeUntil[r.id] || c.activeUntil[r.id] < now) continue;
      if (!r.equation || r.equation === '—') continue;
      out.push(r);
    }
    return out;
  }
  /* 清除某条反应的高亮（例如把容器倒空） */
  function clearActive(c) { c.activeUntil = Object.create(null); }

  /* ---- 方程式的"丰富化"：反应条件、状态符号 ----
     数据里只存了干净的方程式，条件与状态由引擎现算，避免两处数据打架。 */
  var SUB_DIGITS = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  var SUP_DIGITS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  var STATE_CHAR = { solid: 's', liquid: 'l', solution: 'aq', gas: 'g' };

  function toSub(s) {
    return String(s).replace(/[0-9]/g, function (d) { return SUB_DIGITS[d]; });
  }
  function toSup(s) {
    return String(s).replace(/[0-9]/g, function (d) { return SUP_DIGITS[d]; });
  }
  /* 把化学式里的数字转成下标（已经是下标的先归一化，避免重复处理） */
  function subscriptFormula(f) {
    var ascii = String(f || '').replace(/[₀-₉]/g, function (c) {
      for (var k in SUB_DIGITS) if (SUB_DIGITS[k] === c) return k;
      return c;
    });
    /* 电荷（如 Fe3+）不该变下标：这里只处理"元素/括号后面跟数字"的常见情况，
       遇到 + - 结尾的离子式时原样保留 */
    if (/[+\-−]$/.test(ascii)) return ascii;
    return toSub(ascii);
  }
  CHEM.subscriptFormula = subscriptFormula;
  CHEM.toSup = toSup;

  /* 反应条件（写在等号上下的那行字） */
  function conditionLabel(r) {
    var c = r.conditions || {}, parts = [];
    if (c.ignite) parts.push('点燃');
    if (c.electricity) parts.push('通电');
    if (c.light) parts.push('光照');
    if (c.minTemp && c.minTemp >= 600) parts.push('高温');
    else if (c.heat) parts.push('加热');
    if (c.catalyst) {
      var s = CHEM.getSub(c.catalyst);
      parts.push((s ? s.name : c.catalyst) + '催化');
    }
    return parts.join('、');
  }

  /* 带状态符号的方程式，例如 CaCO₃(s) + 2HCl(aq) = CaCl₂(aq) + H₂O(l) + CO₂(g) */
  function stateEquation(r) {
    function term(id, n) {
      var s = CHEM.getSub(id);
      if (!s) return (n > 1 ? n : '') + id;
      var st = STATE_CHAR[s.phase] || '';
      return (n > 1 ? n : '') + subscriptFormula(s.formula) + (st ? '(' + st + ')' : '');
    }
    var left = r.reactants.map(function (b) { return term(b, (r.ratio || {})[b] || 1); }).join(' + ');
    var right = r.products.map(function (p) { return term(p.id, p.n || 1); }).join(' + ');
    return left + ' = ' + right;
  }

  /* 一排用于展示的方程式文本 */
  function equationText(r) {
    var cond = conditionLabel(r);
    return cond ? (r.equation + '　（' + cond + '）') : r.equation;
  }

  /* ---- 解析化学方程式 ----------------------------------------------------
     为什么要解析方程式而不是用 reactants/products？
     因为有 10 条规则的方程式里含有没写进 reactants 的参与物（大多是水），
     例如 2Al + 2NaOH + 2H₂O = 2NaAlO₂ + 3H₂↑。
     只按 reactants 算焓变会漏掉水，结果就错了。
     返回值：{ left: [{coef, formula, atoms}], right: [...] }，解析失败返回 null。 */
  var SUB_MAP = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

  function normalizeEquation(s) {
    return String(s)
      .replace(/[₀-₉]/g, function (c) { return SUB_MAP[c]; })
      .replace(/[↑↓]/g, '')
      .replace(/[（(][^A-Za-z0-9()）]*[）)]/g, '')   // 去掉 (浓)(稀)(固) 这类中文注释
      .replace(/[·⋅]/g, '')
      .replace(/\s+/g, '')
      /* 去掉"正极：""负极：""阳极："这类中文前缀。
         不剥掉的话，系数会被当成普通字符跳过，配平校验就会误报。 */
      .replace(/^[^A-Za-z0-9(]*[:：]/, '');
  }

  function parseAtoms(str) {
    var i = 0, s = str;
    function readNum() {
      var d = '';
      while (i < s.length && s[i] >= '0' && s[i] <= '9') d += s[i++];
      return d ? parseInt(d, 10) : 1;
    }
    function group() {
      var out = {};
      while (i < s.length) {
        var ch = s[i];
        if (ch === '(') {
          i++;
          var inner = group();
          if (s[i] === ')') i++;
          var n = readNum();
          for (var k in inner) out[k] = (out[k] || 0) + inner[k] * n;
        } else if (ch === ')') {
          return out;
        } else if (ch >= 'A' && ch <= 'Z') {
          var el = ch; i++;
          while (i < s.length && s[i] >= 'a' && s[i] <= 'z') el += s[i++];
          var m = readNum();
          out[el] = (out[el] || 0) + m;
        } else {
          i++;
        }
      }
      return out;
    }
    return group();
  }

  function parseSide(side) {
    var out = [];
    side.split('+').forEach(function (raw) {
      var term = raw.trim();
      if (!term) return;
      var m = term.match(/^(\d*)(.*)$/);
      var coef = m[1] ? parseInt(m[1], 10) : 1;
      var formula = m[2];
      if (!formula) return;
      out.push({ coef: coef, formula: formula, atoms: parseAtoms(formula) });
    });
    return out;
  }

  function parseEquation(eq) {
    if (!eq || eq === '—') return null;
    var norm = normalizeEquation(eq);
    var parts = norm.split('=');
    if (parts.length !== 2) return null;
    var left = parseSide(parts[0]), right = parseSide(parts[1]);
    if (!left.length || !right.length) return null;
    return { left: left, right: right };
  }
  CHEM.parseEquation = parseEquation;
  CHEM.parseAtoms = parseAtoms;

  /* 元素守恒自检：返回 null 表示守恒（或无法解析），否则返回差异描述数组。
     像 `c = n / V`、`n = m / M` 这种定义式解析不出任何元素，按"无法解析"处理，
     直接放过——它们本来就不是化学方程式。 */
  function balanceOf(rule) {
    var p = parseEquation(rule.equation);
    if (!p) return null;
    function hasAtoms(side) {
      for (var i = 0; i < side.length; i++) {
        if (Object.keys(side[i].atoms).length > 0) return true;
      }
      return false;
    }
    if (!hasAtoms(p.left) || !hasAtoms(p.right)) return null;
    var L = {}, R = {};
    function acc(into, list) {
      list.forEach(function (t) {
        for (var k in t.atoms) into[k] = (into[k] || 0) + t.atoms[k] * t.coef;
      });
    }
    acc(L, p.left); acc(R, p.right);
    var keys = {};
    Object.keys(L).forEach(function (k) { keys[k] = 1; });
    Object.keys(R).forEach(function (k) { keys[k] = 1; });
    var diff = [];
    Object.keys(keys).forEach(function (k) {
      if ((L[k] || 0) !== (R[k] || 0)) diff.push(k + ' ' + (L[k] || 0) + '≠' + (R[k] || 0));
    });
    return diff.length ? diff : null;
  }
  CHEM.balanceOf = balanceOf;

  /* 化学式 -> 母体 id（用于把方程式里的式子映射回物质库） */
  var formulaIdxCache = null;
  function formulaIndex() {
    if (formulaIdxCache) return formulaIdxCache;
    var idx = Object.create(null);
    CHEM.SUBSTANCES.forEach(function (s) {
      var f = normalizeEquation(s.formula || '');
      if (!f || /[^A-Za-z0-9()]/.test(f)) return;
      if (!(f in idx)) idx[f] = s.base;
      else if (idx[f] !== s.base) idx[f] = null;   // 同一个式子对应多个母体，放弃
    });
    formulaIdxCache = idx;
    return idx;
  }

  /* ---- 热力学：由标准生成焓 / 生成吉布斯自由能算 ΔH、ΔG 与平衡常数 K ----
     化学计量优先取自方程式本身；解析不出来时退回 reactants / products。 */
  function thermoOf(r) {
    var tab = CHEM.THERMO;
    if (!tab) return null;
    var T = (CHEM.THERMO_META && CHEM.THERMO_META.T) || 298.15;
    var R = (CHEM.THERMO_META && CHEM.THERMO_META.R) || 8.314;
    var idx = formulaIndex();
    var dH = 0, dG = 0, missing = [], used = 0;

    function add(base, sign, n) {
      if (!base) { missing.push('?'); return; }
      var e = tab[base];
      if (!e) { missing.push(base); return; }
      dH += sign * n * e[0];
      dG += sign * n * e[1];
      used++;
    }

    var parsed = parseEquation(r.equation);
    var byEquation = false;
    if (parsed) {
      var okAll = true;
      parsed.left.concat(parsed.right).forEach(function (t) {
        var base = idx[t.formula];
        if (!base) okAll = false;
      });
      if (okAll) {
        byEquation = true;
        parsed.left.forEach(function (t) { add(idx[t.formula], -1, t.coef); });
        parsed.right.forEach(function (t) { add(idx[t.formula], 1, t.coef); });
      }
    }
    if (!byEquation) {
      missing = [];
      r.reactants.forEach(function (b) { add(b, -1, (r.ratio || {})[b] || 1); });
      r.products.forEach(function (p) {
        var s = CHEM.getSub(p.id);
        add(s ? s.base : p.id, 1, p.n || 1);
      });
    }
    var K = (dG === 0) ? 1 : Math.exp(-dG * 1000 / (R * T));
    return {
      dH: dH, dG: dG, K: K, T: T, byEquation: byEquation,
      missing: missing, ok: missing.length === 0 && used > 0
    };
  }

  /* 平衡常数怎么读：不能只甩一个天文数字给学生。
     特别要注意"标准状态下 K<1、但实际上能进行"的情形——电解、高温、
     以及生成物不断被移走的反应都属于这一类，必须说清楚，否则会误导。 */
  function kMeaning(K, rule) {
    var cond = (rule && rule.conditions) || {};
    if (cond.electricity) return '这是 298 K、标准状态下的 K。该反应由电能驱动（电解），不受 K 限制';
    if (cond.minTemp && cond.minTemp >= 600) return '这是 298 K 下的 K。该反应由高温驱动，高温下 ΔG 会显著变小';
    if (!isFinite(K)) return '反应进行到底（K 无法用数值表示）';
    if (K >= 1e5) return 'K 非常大，正向反应进行得很完全';
    if (K >= 1e2) return 'K 较大，平衡明显偏向生成物';
    if (K >= 10) return 'K 大于 1，平衡偏向生成物';
    if (K > 0.1) return 'K 与 1 相近，反应物与生成物在平衡时共存（可逆反应特征明显）';
    if (K > 1e-3) return 'K 较小，标准状态下平衡偏向反应物';
    return 'K 很小，标准状态下正向反应几乎不发生';
  }
  /* K < 1 时给出"那它为什么还能进行"的解释 */
  function kCaveat(rule, th) {
    if (!th || !th.ok || th.K >= 1) return null;
    var cond = rule.conditions || {};
    if (cond.electricity) {
      return '电解池里由外接电源持续输入电能，把本来不能自发进行的反应"推"了过去，所以不受 K 限制。';
    }
    if (cond.minTemp && cond.minTemp >= 600) {
      return 'K 是在 298 K 下算出来的。升高温度会显著改变 ΔG（ΔG = ΔH − TΔS），' +
        '这类高温反应在 298 K 下不利，但在高温下可以自发进行。';
    }
    if (cond.ignite) return '点燃提供了反应的活化能，反应一旦引发就靠自身放热维持。';
    return '标准状态要求各物质浓度都是 1 mol/L、气体分压都是 1 bar。实际实验里往往偏离标准状态：' +
      '气体不断逸出、沉淀不断析出、或者某种反应物大大过量，都会让平衡持续向右移动。';
  }
  /* 反应热怎么读 */
  function heatMeaning(dH) {
    if (dH <= -40) return '放热反应（明显放热）';
    if (dH < -1) return '放热反应';
    if (dH <= 1) return '热效应不明显';
    if (dH < 40) return '吸热反应';
    return '吸热反应（明显吸热）';
  }

  /* 数据里补充的离子方程式与说明 */
  function extraOf(ruleId) {
    return (CHEM.EQUATION_EXTRA && CHEM.EQUATION_EXTRA[ruleId]) || null;
  }

  CHEM.Reaction = {
    rules: rules,
    tick: tick,
    findMatches: findMatches,
    activeRules: activeRules,
    clearActive: clearActive,
    ACTIVE_LINGER: ACTIVE_LINGER,
    SPEED: SPEED,
    thermoOf: thermoOf,
    kMeaning: kMeaning,
    kCaveat: kCaveat,
    heatMeaning: heatMeaning,
    extraOf: extraOf,
    estimatePH: estimatePH,
    runTest: runTest,
    missingCondition: missingCondition,
    effectOf: effectOf,
    conditionLabel: conditionLabel,
    stateEquation: stateEquation,
    equationText: equationText,
    NO_REACTION: NO_REACTION
  };
})(typeof window !== 'undefined' ? window : globalThis);
