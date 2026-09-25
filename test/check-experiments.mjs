/* =============================================================================
 * 虚拟化学实验室 —— 教材实验"可行性"校验 (Node)
 * -----------------------------------------------------------------------------
 * 为什么需要这个文件：
 *   test/simulate.mjs 里的静态扫描只能证明**id 存在**（规则 / 物质 / 检验 /
 *   仪器名都拼对了），但证明不了"这一步真的做得到"。例如：
 *     · check 要求"高锰酸钾还在，而且温度 ≥ 120 ℃"——可是高锰酸钾一受热就
 *       分解掉了，这一格永远点不亮；
 *     · check 要求 fired('so2_br2_h2o')，可是这条反应需要 SO₂ 气体与溴水
 *       同时存在，而 SO₂ 极易溶于水，转不过去；
 *     · 校验动作本身写错了容器序号，看起来像实验有 bug。
 *   这些问题只有"真的把实验做一遍"才能发现。
 *
 * 本文件的思路：
 *   为每个实验写一条"教材动作链"（加药品 / 加热 / 点燃 / 通电 / 倾倒 / 连接 /
 *   检验 / 搅拌），用真实引擎逐步驱动，每做完一批动作就按顺序推进 check，
 *   看每一步最终能不能变成 true。卡住就报出是哪一步、以及最后一次动作。
 *
 * 运行：node test/check-experiments.mjs
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------- 以副作用方式加载数据层 / 引擎层 / 全部实验 ---------- */
const FILES = [
  'js/data/substances.js',
  'js/data/apparatus.js',
  'js/data/reactions.js',
  'js/data/substances-senior.js',
  'js/data/reactions-senior.js',
  'js/data/thermo.js',
  'js/data/equations-extra.js',
  'js/data/reactions-extra.js',
  'js/engine/geometry.js',
  'js/engine/effects.js',
  'js/engine/reaction.js',
  'js/engine/world.js',
  'js/render/draw.js'
];
/* 实验文件不手写清单，直接扫目录，避免新增实验漏测 */
{
  const dir = path.join(ROOT, 'js/experiments');
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
    .forEach(f => FILES.push('js/experiments/' + f));
}
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  (0, eval)(fs.readFileSync(p, 'utf8'));
}
const CHEM = globalThis.CHEM;
CHEM.setLevel('all');

/* =========================================================================
 * 驱动工具：模拟"玩家在界面上做的操作"
 * ====================================================================== */
function rig(task) {
  const w = new CHEM.World();
  (task.setup || []).forEach(s => w.add(s.type, s.x, s.y));
  (task.preset || []).forEach(p => {
    const list = w.containers();
    const c = typeof p.index === 'number' ? list[p.index]
      : list.filter(x => x.type === p.apparatus)[0];
    if (c) w.addReagent(c.uid, p.id, p.amount);
  });
  return {
    w,
    byType(t) { return this.w.containers().filter(c => c.type === t); },
    nth(t, i) { return this.byType(t)[i || 0] || null; },
    dev(t) { return this.w.devices().filter(d => d.type === t); },
    /* 模拟界面上的"默认加入量"：气体按上方空间的 80%，固体 0.3~0.5 g，液体 6 mL */
    add(c, id, ml, g) {
      if (!c) throw new Error('找不到容器');
      const sub = CHEM.getSub(id);
      if (!sub) throw new Error('药品不存在：' + id);
      const amt = sub.phase === 'gas' ? (ml || Math.max(10, Math.round(c.headspace() * 0.8)))
        : (sub.phase === 'solid' || sub.phase === 'paper') ? (g || (c.capacity() <= 30 ? 0.3 : 0.5))
          : (ml || 6);
      return this.w.addReagent(c.uid, id, amt);
    },
    /* 反复加同一种液体直到体积达标（玩家会连点几次药品） */
    fill(c, id, target) {
      for (let i = 0; i < 30 && c.liquidVolume() < target; i++) this.add(c, id, 8);
      return c.liquidVolume();
    },
    heat(c) { this.dev('alcoholLamp').forEach(d => { d.lit = true; }); void c; },
    lamp(i, on) { const l = this.dev('alcoholLamp')[i || 0]; if (l) l.lit = on !== false; },
    ignite(c) { this.w.ignite(c.uid); },
    power(c) { this.w.setPower(c.uid, true); },
    stir(c) { this.w.stir(c.uid); },
    test(c, id) { return CHEM.Reaction.runTest(c, id); },
    pour(a, b, f) { return this.w.pour(a.uid, b.uid, f === undefined ? 1 : f); },
    pourToFunnel(a, f) { return this.w.pour(a.uid, this.dev('funnel')[0].uid, f); },
    attachFunnel(down) { return this.w.attach(this.dev('funnel')[0].uid, down.uid); },
    attachTube(a, b) { return this.w.connect(this.dev('deliveryTube')[0].uid, a.uid, b.uid); },
    run(sec) { for (let t = 0; t < (sec === undefined ? 14 : sec); t += 1 / 60) this.w.step(1 / 60); }
  };
}

/* =========================================================================
 * 每个实验的"教材动作链"
 * ---------------------------------------------------------------------
 * 每一项是一个无参函数，代表玩家的一步操作（可能同时加了两种药品）。
 * 动作做完后引擎会跑一段时间，然后按顺序推进 check。
 * ====================================================================== */
const ACTIONS = {

  /* ------------------------- index.js 里的 6 个初中实验 ------------------------- */
  oxygen: X => [
    () => X.add(X.nth('testTube', 0), 'kmno4', 0, 0.4),
    () => X.lamp(0),
    /* 高锰酸钾受热会分解，必须在温度已经升上来之后再补一点，
       才能同时满足"容器 ≥ 120 ℃"和"高锰酸钾还在"（玩家会连续加药品）。 */
    () => { for (let i = 0; i < 3; i++) { X.add(X.nth('testTube', 0), 'kmno4', 0, 0.4); X.run(1); } },
    () => X.test(X.nth('testTube', 0), 'glowingSplint'),
    () => { X.add(X.nth('testTube', 0), 'c', 0, 0.5); X.ignite(X.nth('testTube', 0)); }
  ],
  carbonDioxide: X => [
    () => X.add(X.nth('testTube', 0), 'caco3', 0, 0.6),
    /* 先把导管接好、石灰水备好，再加盐酸：CO₂ 会逸散，接晚了就通不过去 */
    () => { X.add(X.nth('testTube', 1), 'caoh2aq', 10); X.attachTube(X.nth('testTube', 0), X.nth('testTube', 1)); },
    () => X.add(X.nth('testTube', 0), 'hcl', 8)
  ],
  neutralization: X => [
    () => X.fill(X.nth('testTube', 0), 'naohaq', 6),
    () => X.add(X.nth('testTube', 0), 'phenolphthalein', 2),
    () => X.add(X.nth('testTube', 0), 'hcl', 10),
    () => X.test(X.nth('testTube', 0), 'phPaper')
  ],
  metalActivity: X => [
    () => { X.add(X.nth('testTube', 0), 'mg', 0, 0.5); X.add(X.nth('testTube', 1), 'zn', 0, 0.5); X.add(X.nth('testTube', 2), 'fe', 0, 0.5); X.add(X.nth('testTube', 3), 'cu', 0, 0.5); },
    () => { X.add(X.nth('testTube', 0), 'hcl', 8); X.add(X.nth('testTube', 1), 'hcl', 8); X.add(X.nth('testTube', 2), 'hcl', 8); X.add(X.nth('testTube', 3), 'hcl', 8); },
    () => { },
    () => X.test(X.nth('testTube', 2), 'burningSplint')
  ],
  ironCopper: X => [
    () => X.fill(X.nth('testTube', 0), 'cuso4aq', 6),
    () => X.add(X.nth('testTube', 0), 'fe', 0, 0.6),
    () => { }
  ],
  carbonate: X => [
    () => X.fill(X.nth('testTube', 0), 'na2co3aq', 6),
    () => X.add(X.nth('testTube', 0), 'phenolphthalein', 2),
    () => X.test(X.nth('testTube', 0), 'phPaper'),
    () => X.add(X.nth('testTube', 0), 'hcl', 10)
  ],

  /* ------------------------- senior.js 里的 5 个高中实验 ------------------------- */
  'senior-sodium': X => [
    () => X.fill(X.nth('beakerSmall', 0), 'h2o', 25),
    () => X.add(X.nth('beakerSmall', 0), 'phenolphthalein', 2),
    () => X.add(X.nth('beakerSmall', 0), 'na', 0, 0.4),
    () => { X.add(X.nth('testTube', 0), 'na2o2', 0, 0.4); X.add(X.nth('testTube', 0), 'h2o', 8); X.test(X.nth('testTube', 0), 'glowingSplint'); },
    () => { X.add(X.nth('evaporatingDish', 0), 'na', 0, 0.4); X.add(X.nth('evaporatingDish', 0), 'o2', 40); X.ignite(X.nth('evaporatingDish', 0)); }
  ],
  'senior-chlorine': X => [
    () => { X.add(X.nth('gasJar', 0), 'h2o', 20); X.add(X.nth('gasJar', 0), 'cl2', 80); },
    () => X.test(X.nth('gasJar', 0), 'phPaper'),
    () => { X.add(X.nth('testTube', 0), 'ki', 8); X.add(X.nth('testTube', 0), 'cl2', 60); },
    () => { X.add(X.nth('testTube', 1), 'naohaq', 8); X.add(X.nth('testTube', 1), 'cl2', 60); }
  ],
  'senior-volumetric': X => [
    () => X.add(X.nth('beakerSmall', 0), 'nacl', 0, 0.5),
    () => X.fill(X.nth('beakerSmall', 0), 'h2o', 25),
    () => X.pour(X.nth('beakerSmall', 0), X.nth('volumetricFlask', 0), 1),
    () => X.fill(X.nth('volumetricFlask', 0), 'h2o', 95)
  ],
  'senior-organic': X => [
    () => X.fill(X.nth('testTube', 0), 'c2h5oh', 8),
    () => { X.add(X.nth('testTube', 0), 'cu', 0, 0.5); X.add(X.nth('testTube', 0), 'o2', 60); X.lamp(1); },
    () => { X.add(X.nth('testTube', 1), 'ch3cooh', 6); X.add(X.nth('testTube', 1), 'c2h5oh', 6); X.add(X.nth('testTube', 1), 'h2so4_conc', 4); },
    () => X.lamp(0)
  ],
  'senior-electrolysis': X => [
    () => X.add(X.nth('beakerSmall', 0), 'cuo', 0, 0.5),
    () => X.add(X.nth('beakerSmall', 0), 'hcl', 10),
    () => X.power(X.nth('beakerSmall', 0)),
    () => X.test(X.nth('gasJar', 0), 'kiStarchPaper')
  ],

  /* ------------------------- 教材实验：初中 13 个 ------------------------- */
  'tb-air': X => [
    () => X.add(X.nth('gasJar', 0), 'caoh2aq', 20),
    () => X.add(X.nth('gasJar', 0), 'co2', 60),
    () => { X.add(X.nth('gasJar', 1), 'o2', 60); X.test(X.nth('gasJar', 1), 'burningSplint'); },
    () => { X.add(X.nth('testTube', 0), 'c', 0, 0.5); X.add(X.nth('testTube', 0), 'o2', 60); X.ignite(X.nth('testTube', 0)); },
    () => { X.test(X.nth('gasJar', 0), 'phPaper'); X.test(X.nth('testTube', 0), 'glowingSplint'); }
  ],
  'tb-molecule': X => [
    () => X.fill(X.nth('beakerSmall', 0), 'h2o', 30),
    () => X.add(X.nth('beakerSmall', 0), 'phenolphthalein', 2),
    () => X.add(X.nth('beakerSmall', 1), 'nh3', 60),
    () => X.attachTube(X.nth('beakerSmall', 0), X.nth('beakerSmall', 1))
  ],
  'tb-water-compose': X => [
    () => X.fill(X.nth('beakerSmall', 0), 'h2o', 50),
    () => X.power(X.nth('beakerSmall', 0)),
    () => X.test(X.nth('beakerSmall', 0), 'glowingSplint'),
    () => X.test(X.nth('beakerSmall', 0), 'burningSplint'),
    /* 试管容积只有 20 mL，气体不能加多；空试管里 h2_o2 才会被点燃 */
    () => { X.add(X.nth('testTube', 0), 'h2', 4); X.add(X.nth('testTube', 0), 'o2', 2); X.ignite(X.nth('testTube', 0)); }
  ],
  'tb-water-purify': X => [
    () => X.fill(X.nth('beakerSmall', 0), 'h2o', 40),
    () => { X.add(X.nth('beakerSmall', 0), 'caco3', 0, 0.5); X.stir(X.nth('beakerSmall', 0)); },
    () => X.attachFunnel(X.nth('beakerSmall', 1)),
    () => X.pourToFunnel(X.nth('beakerSmall', 0), 1),
    () => { X.add(X.nth('beakerSmall', 1), 'c', 0, 0.3); X.stir(X.nth('beakerSmall', 1)); },
    () => { X.add(X.nth('beakerSmall', 0), 'hcl', 8); X.test(X.nth('beakerSmall', 1), 'phPaper'); }
  ],
  'tb-mass': X => [
    () => X.add(X.nth('conicalFlask', 0), 'cuso4aq', 8),
    () => X.add(X.nth('conicalFlask', 0), 'fe', 0, 0.5),
    () => { },
    () => X.add(X.nth('testTube', 0), 'p', 0, 0.3),
    () => { X.add(X.nth('testTube', 0), 'o2', 60); X.ignite(X.nth('testTube', 0)); },
    () => X.test(X.nth('conicalFlask', 0), 'phPaper')
  ],
  'tb-burn': X => [
    () => { X.fill(X.nth('conicalFlask', 0), 'h2o', 30); X.lamp(0); },
    () => X.add(X.nth('conicalFlask', 0), 'fe', 0, 0.5),
    () => { X.add(X.nth('testTube', 0), 'c', 0, 0.5); X.add(X.nth('testTube', 0), 'o2', 60); X.ignite(X.nth('testTube', 0)); },
    () => { X.add(X.nth('testTube', 1), 'p', 0, 0.3); X.add(X.nth('testTube', 1), 'o2', 60); X.ignite(X.nth('testTube', 1)); },
    () => { X.add(X.nth('testTube', 3), 'fe', 0, 0.5); X.add(X.nth('testTube', 3), 'o2', 60); X.ignite(X.nth('testTube', 3)); }
  ],
  'tb-heat': X => [
    () => X.add(X.nth('testTube', 0), 'kmno4', 0, 0.3),
    () => X.lamp(0),
    () => { },
    () => { X.add(X.nth('evaporatingDish', 0), 'h2o', 15); X.lamp(1); },
    () => { }
  ],
  'tb-solution': X => [
    () => X.add(X.nth('beakerSmall', 0), 'nacl', 0, 0.5),
    () => X.fill(X.nth('beakerSmall', 0), 'h2o', 40),
    () => X.stir(X.nth('beakerSmall', 0)),
    () => { },
    () => X.test(X.nth('beakerSmall', 0), 'phPaper')
  ],
  'tb-indicator': X => [
    () => { X.add(X.nth('testTube', 0), 'hcl', 8); X.add(X.nth('testTube', 0), 'litmus', 2); },
    () => { X.add(X.nth('testTube', 1), 'naohaq', 8); X.add(X.nth('testTube', 1), 'litmus', 2); },
    () => { X.add(X.nth('testTube', 2), 'naclaq', 8); X.add(X.nth('testTube', 2), 'litmus', 2); },
    () => { X.add(X.nth('testTube', 3), 'naohaq', 8); X.add(X.nth('testTube', 3), 'phenolphthalein', 2); },
    () => { X.add(X.nth('testTube', 4), 'hcl', 8); X.add(X.nth('testTube', 4), 'phenolphthalein', 2); }
  ],
  'tb-acidbase': X => [
    () => { X.add(X.nth('testTube', 0), 'fe2o3', 0, 0.5); X.add(X.nth('testTube', 0), 'hcl', 10); },
    () => { X.add(X.nth('testTube', 1), 'mg', 0, 0.5); X.add(X.nth('testTube', 1), 'hcl', 10); },
    () => { X.add(X.nth('beakerSmall', 0), 'caoh2aq', 20); X.add(X.nth('beakerSmall', 0), 'co2', 60); },
    () => { X.add(X.nth('testTube', 2), 'naohaq', 8); X.add(X.nth('testTube', 2), 'phenolphthalein', 2); },
    () => X.add(X.nth('testTube', 2), 'hcl', 8),
    () => X.test(X.nth('testTube', 2), 'phPaper')
  ],
  'tb-ph': X => [
    () => X.add(X.nth('testTube', 0), 'hcl', 8),
    () => X.test(X.nth('testTube', 0), 'phPaper'),
    () => X.add(X.nth('testTube', 1), 'naclaq', 8),
    () => X.add(X.nth('testTube', 2), 'naohaq', 8),
    () => { X.add(X.nth('testTube', 3), 'caoh2aq', 8); X.add(X.nth('testTube', 3), 'phenolphthalein', 2); }
  ],
  'tb-salt': X => [
    () => { X.add(X.nth('beakerSmall', 0), 'nacl', 0, 0.5); X.fill(X.nth('beakerSmall', 0), 'h2o', 40); X.stir(X.nth('beakerSmall', 0)); },
    () => { },
    () => X.attachFunnel(X.nth('beakerSmall', 1)),
    () => { X.pourToFunnel(X.nth('beakerSmall', 0), 1); X.pour(X.nth('beakerSmall', 1), X.nth('evaporatingDish', 0), 1); X.lamp(0); },
    () => { },
    () => { X.add(X.nth('evaporatingDish', 0), 'na2co3', 0, 0.3); X.add(X.nth('evaporatingDish', 0), 'hcl', 8); }
  ],
  'tb-ions': X => [
    () => X.add(X.nth('testTube', 0), 'na2co3aq', 8),
    /* 先接好导管再加石灰水和盐酸，CO₂ 才来得及通过去 */
    () => { X.add(X.nth('testTube', 1), 'caoh2aq', 10); X.attachTube(X.nth('testTube', 0), X.nth('testTube', 1)); },
    () => X.add(X.nth('testTube', 0), 'hcl', 8),
    () => { X.add(X.nth('testTube', 2), 'naclaq', 8); X.add(X.nth('testTube', 2), 'agno3', 5); },
    () => { X.add(X.nth('testTube', 3), 'na2co3aq', 8); X.add(X.nth('testTube', 3), 'bacl2', 5); },
    () => { X.add(X.nth('testTube', 4), 'na2so4', 8); X.add(X.nth('testTube', 4), 'bacl2', 5); },
    () => { X.add(X.nth('testTube', 5), 'caoh2aq', 10); X.test(X.nth('testTube', 5), 'phPaper'); }
  ],

  /* ------------------------- 教材实验：高中 10 个 ------------------------- */
  'tb-iron': X => [
    () => { X.add(X.nth('beakerSmall', 0), 'fe2o3', 0, 0.5); X.add(X.nth('beakerSmall', 0), 'hcl', 10); },
    () => { X.add(X.nth('testTube', 0), 'fecl3', 8); X.add(X.nth('testTube', 0), 'kscn', 4); },
    () => { X.add(X.nth('testTube', 1), 'fecl3', 8); X.add(X.nth('testTube', 1), 'cu', 0, 0.5); },
    () => { X.add(X.nth('testTube', 2), 'fe', 0, 1.5); X.add(X.nth('testTube', 2), 'cuso4aq', 8); },
    () => { X.add(X.nth('beakerSmall', 0), 'o2', 20); X.attachTube(X.nth('testTube', 2), X.nth('beakerSmall', 0)); },
    () => X.add(X.nth('testTube', 2), 'naohaq', 8),
    () => X.test(X.nth('testTube', 2), 'phPaper')
  ],
  'tb-ammonia': X => [
    () => { X.add(X.nth('testTube', 0), 'nh4cl', 0, 0.5); X.add(X.nth('testTube', 0), 'caoh2', 0, 0.5); },
    () => X.lamp(0),
    () => X.attachTube(X.nth('testTube', 0), X.nth('gasJar', 0)),
    () => X.test(X.nth('gasJar', 0), 'phPaper'),
    () => { X.add(X.nth('gasJar', 0), 'nh3', 60); X.add(X.nth('gasJar', 0), 'hcl_g', 60); },
    () => { X.add(X.nth('testTube', 1), 'nh3h2o', 8); X.add(X.nth('testTube', 1), 'phenolphthalein', 2); }
  ],
  'tb-sulfur': X => [
    () => { X.add(X.nth('beakerSmall', 0), 'na2so3', 0, 0.5); X.add(X.nth('beakerSmall', 0), 'h2so4', 10); },
    () => X.fill(X.nth('beakerSmall', 0), 'h2o', 16),
    () => X.test(X.nth('beakerSmall', 0), 'phPaper'),
    () => { X.add(X.nth('testTube', 0), 'br2aq', 5); X.add(X.nth('testTube', 0), 'na2so3', 0, 0.3); X.add(X.nth('testTube', 0), 'h2so4', 5); },
    () => { X.add(X.nth('testTube', 1), 'naohaq', 10); X.add(X.nth('testTube', 1), 'h2so4', 5); },
    () => { X.add(X.nth('testTube', 1), 'na2so3', 0, 0.3); X.test(X.nth('beakerSmall', 0), 'litmusPaper'); }
  ],
  'tb-nitric': X => [
    /* 先把氢氧化钠放进第一支试管，再让铜和浓硝酸反应——
       NO₂ 极容易被水吸收、也容易逸散，必须"边产生边吸收"才做得到。 */
    () => X.add(X.nth('testTube', 0), 'cu', 0, 0.5),
    () => X.add(X.nth('testTube', 0), 'naohaq', 8),
    () => X.add(X.nth('testTube', 0), 'hno3_conc', 8),
    () => { X.add(X.nth('testTube', 1), 'cu', 0, 0.5); X.add(X.nth('testTube', 1), 'hno3aq', 8); },
    () => { X.add(X.nth('gasJar', 0), 'no', 60); X.add(X.nth('gasJar', 0), 'o2', 60); },
    () => { X.add(X.nth('gasJar', 0), 'h2o', 10); X.test(X.nth('gasJar', 0), 'phPaper'); }
  ],
  'tb-aluminum': X => [
    () => { X.add(X.nth('beakerSmall', 0), 'naohaq', 20); X.add(X.nth('beakerSmall', 0), 'al', 0, 0.5); },
    () => { X.add(X.nth('beakerSmall', 0), 'naohaq', 20); X.add(X.nth('beakerSmall', 0), 'al2o3', 0, 0.5); X.lamp(0); },
    () => { X.add(X.nth('beakerSmall', 0), 'naohaq', 10); X.add(X.nth('beakerSmall', 0), 'al', 0, 0.5); },
    () => { X.add(X.nth('testTube', 0), 'alcl3', 8); X.add(X.nth('testTube', 0), 'nh3h2o', 8); },
    () => X.add(X.nth('testTube', 0), 'naohaq', 10),
    () => X.test(X.nth('testTube', 0), 'phPaper')
  ],
  'tb-silicon': X => [
    () => { X.add(X.nth('beakerSmall', 0), 'sio2', 0, 0.5); X.add(X.nth('beakerSmall', 0), 'naohaq', 20); X.lamp(0); },
    () => { },
    () => { X.add(X.nth('testTube', 0), 'na2sio3', 8); X.add(X.nth('testTube', 0), 'hcl', 8); },
    () => { X.add(X.nth('testTube', 1), 'na2sio3', 8); X.add(X.nth('testTube', 1), 'co2', 60); },
    () => X.test(X.nth('testTube', 0), 'phPaper')
  ],
  'tb-battery': X => [
    () => { X.add(X.nth('testTube', 0), 'hcl', 8); X.add(X.nth('testTube', 0), 'zn', 0, 0.5); X.add(X.nth('testTube', 0), 'graphite', 0, 0.5); },
    () => { X.add(X.nth('testTube', 1), 'hcl', 8); X.add(X.nth('testTube', 1), 'cu', 0, 0.5); },
    () => X.add(X.nth('testTube', 0), 'hcl', 8),
    () => X.test(X.nth('testTube', 1), 'phPaper'),
    () => { X.add(X.nth('testTube', 2), 'naohaq', 8); X.test(X.nth('testTube', 2), 'phPaper'); }
  ],
  'tb-sugar': X => [
    () => { X.add(X.nth('testTube', 0), 'naohaq', 8); X.add(X.nth('testTube', 0), 'cuso4aq', 5); },
    () => { X.add(X.nth('testTube', 0), 'c6h12o6', 0, 0.5); X.lamp(0); },
    () => { X.add(X.nth('testTube', 1), 'c6h12o6', 0, 0.5); X.add(X.nth('testTube', 1), 'agnh32oh', 8); X.lamp(1); },
    () => X.test(X.nth('testTube', 0), 'phPaper'),
    () => { X.add(X.nth('testTube', 2), 'starch', 8); X.add(X.nth('testTube', 2), 'i2', 0, 0.3); },
    /* 淀粉水解要同时有稀硫酸和加热；第四支试管下方已经摆了第三盏酒精灯 */
    () => { X.add(X.nth('testTube', 3), 'h2o', 6); X.add(X.nth('testTube', 3), 'starch', 6); X.add(X.nth('testTube', 3), 'h2so4', 6); X.lamp(2); }
  ],
  'tb-ion-reaction': X => [
    () => { X.add(X.nth('beakerSmall', 0), 'cuso4aq', 20); X.add(X.nth('beakerSmall', 0), 'naohaq', 10); },
    () => X.add(X.nth('beakerSmall', 0), 'hcl', 12),
    () => { X.add(X.nth('testTube', 0), 'fecl3', 8); X.add(X.nth('testTube', 0), 'naohaq', 8); },
    () => { X.add(X.nth('testTube', 1), 'cu', 0, 0.5); X.add(X.nth('testTube', 1), 'hno3_conc', 8); },
    () => X.test(X.nth('beakerSmall', 0), 'phPaper')
  ],
  'tb-rate': X => [
    () => { X.add(X.nth('testTube', 0), 'fe', 0, 0.5); X.add(X.nth('testTube', 0), 'hcl', 8); },
    () => { X.add(X.nth('testTube', 1), 'fe', 0, 0.5); X.add(X.nth('testTube', 1), 'hcl_conc', 8); },
    () => { X.add(X.nth('testTube', 2), 'fe', 0, 0.5); X.add(X.nth('testTube', 2), 'hcl', 8); X.lamp(0); },
    () => { X.add(X.nth('testTube', 3), 'mg', 0, 0.5); X.add(X.nth('testTube', 3), 'hcl', 8); },
    () => { X.add(X.nth('testTube', 4), 'cuo', 0, 0.5); X.add(X.nth('testTube', 4), 'hcl', 8); },
    () => X.test(X.nth('testTube', 1), 'phPaper')
  ]
};

/* =========================================================================
 * 通用检查：步骤文字里提到的仪器，setup 里必须真的够用
 * ---------------------------------------------------------------------
 * 这一类错误手写动作链也能发现，但靠"数一数文字"更省事，而且能一次扫出所有同类：
 *   · "第 N 支试管 / 第 N 只烧杯 / 第 N 个蒸发皿" → setup 里对应仪器数量 ≥ N
 *   · "导管"                                     → setup 里必须有 deliveryTube
 *   · "漏斗"                                     → setup 里必须有 funnel
 *   · "酒精灯 / 加热"                            → setup 里必须有 alcoholLamp
 * ====================================================================== */
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const NAMED_APP = [
  { re: /第\s*([一二三四五六七八九十\d]+)\s*[支只个]\s*试管/g, type: 'testTube', name: '试管' },
  { re: /第\s*([一二三四五六七八九十\d]+)\s*[只个]\s*(?:小|大)?烧杯/g, type: 'beakerSmall', name: '烧杯' },
  { re: /第\s*([一二三四五六七八九十\d]+)\s*[只个]\s*蒸发皿/g, type: 'evaporatingDish', name: '蒸发皿' },
  { re: /第\s*([一二三四五六七八九十\d]+)\s*[只个]\s*集气瓶/g, type: 'gasJar', name: '集气瓶' },
  { re: /第\s*([一二三四五六七八九十\d]+)\s*[只个]\s*锥形瓶/g, type: 'conicalFlask', name: '锥形瓶' },
  { re: /第\s*([一二三四五六七八九十\d]+)\s*[只个]\s*量筒/g, type: 'graduatedCylinder', name: '量筒' }
];
/* 只检查"必须摆在台面上的东西"：玻璃棒、胶头滴管这类是工具栏里的操作工具，
   不需要预先摆到台面上，所以不列入。 */
const MENTIONED = [
  { kw: '导管', type: 'deliveryTube', name: '导管' },
  { kw: '漏斗', type: 'funnel', name: '漏斗' },
  { kw: '酒精灯', type: 'alcoholLamp', name: '酒精灯' }
];
function numOf(s) { return CN_NUM[s] || parseInt(s, 10) || 0; }

console.log('\n\x1b[36m── 通用检查：步骤里提到的仪器，setup 里够不够用 ──\x1b[0m');
const tasks = CHEM.EXPERIMENTS || [];
const setupProblems = [];
{
  const problems = setupProblems;
  for (const task of tasks) {
    const counts = Object.create(null);
    (task.setup || []).forEach(s => { counts[s.type] = (counts[s.type] || 0) + 1; });
    const texts = (task.steps || []).map(s => s.text || '');
    for (const rule of NAMED_APP) {
      for (const text of texts) {
        let m;
        rule.re.lastIndex = 0;
        while ((m = rule.re.exec(text))) {
          const n = numOf(m[1]);
          if (n > (counts[rule.type] || 0)) {
            problems.push(task.id + ' 第 ' + n + ' 个' + rule.name + '不存在（setup 里只有 ' +
              (counts[rule.type] || 0) + ' 个）：' + text.slice(0, 40));
          }
        }
      }
    }
    for (const rule of MENTIONED) {
      if (!texts.some(t => t.indexOf(rule.kw) >= 0)) continue;
      if (!(counts[rule.type] > 0)) {
        problems.push(task.id + ' 步骤里提到了' + rule.name + '，但 setup 里没有摆放');
      }
    }
  }
  if (problems.length === 0) {
    console.log('\x1b[32m✓\x1b[0m 全部 ' + tasks.length + ' 个实验：步骤文字里提到的仪器在 setup 里都存在且数量足够');
  } else {
    problems.forEach(p => console.log('   \x1b[31m·\x1b[0m ' + p));
  }
}

/* =========================================================================
 * 逐个实验跑一遍
 * ====================================================================== */
let passCount = 0;
const failures = [];

console.log('\n\x1b[36m── 逐条实验：每一步是否真的做得到 ──\x1b[0m');

for (const task of tasks) {
  const maker = ACTIONS[task.id];
  if (!maker) {
    failures.push(task.id + '（' + task.name + '）：校验器里还没有写动作链');
    console.log('\x1b[31m✗\x1b[0m ' + task.id + '  没有动作链');
    continue;
  }
  let X;
  try { X = rig(task); } catch (e) {
    failures.push(task.id + '：初始化失败 ' + e.message);
    console.log('\x1b[31m✗\x1b[0m ' + task.id + '  初始化失败：' + e.message);
    continue;
  }
  const steps = task.steps || [];
  let acts;
  try { acts = maker(X); } catch (e) {
    failures.push(task.id + '：动作链构建失败 ' + e.message);
    console.log('\x1b[31m✗\x1b[0m ' + task.id + '  动作链构建失败：' + e.message);
    continue;
  }

  let step = 0;
  let lastAct = 0;
  let crashed = null;
  /* 每一格是否曾经变成 true（有些格子只在某一瞬间成立，后来被消耗掉了） */
  const everTrue = steps.map(() => false);
  const touch = () => {
    for (let k = 0; k < steps.length; k++) if (!everTrue[k] && steps[k].check(X.w)) everTrue[k] = true;
  };
  /* 动作与"某一格是否已经点亮"无关，玩家就是按教材顺序做下去；
     每做完一批动作跑几秒仿真，再按顺序把已完成的步骤勾掉。 */
  for (let i = 0; i < acts.length; i++) {
    try { acts[i](); } catch (e) { crashed = '动作' + (i + 1) + ' 抛异常：' + e.message; break; }
    touch();
    X.run(14);
    touch();
    let guard = 0;
    while (step < steps.length && steps[step].check(X.w) && guard++ < 20) step++;
    lastAct = i + 1;
  }
  if (!crashed) {
    X.run(25);   /* 有些反应需要更长时间（蒸发、电解、溶解） */
    touch();
    let guard = 0;
    while (step < steps.length && steps[step].check(X.w) && guard++ < 20) step++;
  }

  if (crashed) {
    failures.push(task.id + '（' + task.name + '）：' + crashed);
    console.log('\x1b[31m✗\x1b[0m ' + task.id + '  ' + crashed);
    continue;
  }
  /* 只要每一格都曾经亮过就算通过；卡住时按顺序报第一个没亮过的格子 */
  const firstDead = everTrue.indexOf(false);
  if (firstDead < 0) {
    passCount++;
    console.log('\x1b[32m✓\x1b[0m ' + task.id + '  ' + steps.length + ' 步全部可完成');
  } else {
    const s = steps[firstDead];
    failures.push(task.id + '（' + task.name + '）第 ' + (firstDead + 1) + ' 步做不到：' + s.text);
    console.log('\x1b[31m✗\x1b[0m ' + task.id + '  第 ' + (firstDead + 1) + ' 步做不到：' + s.text);
    console.log('      check: ' + String(s.check).replace(/\s+/g, ' ').slice(0, 160));
    console.log('      动作链共 ' + acts.length + ' 个动作，最后执行到第 ' + lastAct +
      ' 个；顺序推进到第 ' + (step + 1) + ' 步');
  }
}

/* =========================================================================
 * 瞬态判定体检
 * ---------------------------------------------------------------------
 * 跑完动作链之后，再回看每一步的 check 是否**还成立**。
 * 不成立说明这一格依赖的是"某一瞬间"的状态（比如某种物质正要被消耗掉的那一刻）。
 * 应用里是每帧判定的，所以通常也能捕捉到；但用户的节奏只要稍有不同，
 * 就可能刚好错过那一瞬间，表现成"按要求做了却没提示完成"。
 * 这里把它们全部列出来，方便改成"留下痕迹"式的判定（fired / 曾经发生过）。
 * ====================================================================== */
console.log('\n\x1b[36m── 瞬态判定体检：做完之后还成立吗 ──\x1b[0m');
const transient = [];
{
  for (const task of tasks) {
    const maker = ACTIONS[task.id];
    if (!maker) continue;
    let X;
    try { X = rig(task); } catch (e) { continue; }
    let acts = [];
    try { acts = maker(X); } catch (e) { continue; }
    for (let i = 0; i < acts.length; i++) {
      try { acts[i](); } catch (e) { /* 忽略动作本身的异常 */ }
      X.run(14);
    }
    X.run(20);
    (task.steps || []).forEach((st, i) => {
      let ok = false;
      try { ok = !!st.check(X.w); } catch (e) { ok = false; }
      if (!ok) transient.push({ id: task.id, i: i + 1, text: st.text, src: String(st.check) });
    });
  }
  if (transient.length === 0) {
    console.log('\x1b[32m✓\x1b[0m 所有步骤的判定做完之后依然成立（不存在"只在某一瞬间成立"的格子）');
  } else {
    console.log('  \x1b[33m' + transient.length + ' 个格子只在过程中成立，做完之后回看已经不成立：\x1b[0m');
    transient.slice(0, 40).forEach(t => {
      console.log('   · ' + t.id + ' 第 ' + t.i + ' 步：' + t.text.slice(0, 34));
      console.log('       ' + t.src.replace(/\s+/g, ' ').slice(0, 130));
    });
    if (transient.length > 40) console.log('   … 还有 ' + (transient.length - 40) + ' 个');
  }
}

/* =========================================================================
 * 汇总
 * ====================================================================== */
console.log('\n' + '='.repeat(64));
if (failures.length === 0 && setupProblems.length === 0) {
  console.log('\x1b[32m✅ 全部 ' + tasks.length + ' 个实验的每一步都能真正完成（共 ' +
    tasks.reduce((n, t) => n + t.steps.length, 0) + ' 步）\x1b[0m');
} else {
  if (setupProblems.length) {
    console.log('\x1b[31m❌ ' + setupProblems.length + ' 个实验的步骤文字与 setup 对不上\x1b[0m');
    setupProblems.forEach(f => console.log('   · ' + f));
  }
  if (failures.length) {
    console.log('\x1b[31m❌ ' + failures.length + ' 个实验的动作链跑不通 / 共 ' + tasks.length + ' 个\x1b[0m');
    failures.forEach(f => console.log('   · ' + f));
  }
}
console.log('='.repeat(64));
process.exit(failures.length === 0 && setupProblems.length === 0 ? 0 : 1);
