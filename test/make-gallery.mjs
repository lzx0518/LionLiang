/* =============================================================================
 * 生成 1:1 仪器图鉴 test/.gallery.html
 * -----------------------------------------------------------------------------
 * 画布尺寸与场景尺寸一致（1180×660），比例正好是 1:1，便于在无头浏览器里
 * 逐件检查每种仪器的外形、液面、气泡、沉淀、火焰是否画对了。
 * 运行：node test/make-gallery.mjs
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SCRIPTS = [
  'js/data/substances.js', 'js/data/apparatus.js', 'js/data/reactions.js',
  'js/engine/geometry.js', 'js/engine/effects.js', 'js/engine/reaction.js',
  'js/engine/world.js', 'js/render/draw.js'
];

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>仪器图鉴</title>
<style>
  html,body{margin:0;background:#20303c;font:12px/1.4 "Microsoft YaHei",sans-serif}
  .row{position:relative}
  canvas{display:block;background:#eaf3fa}
  h2{color:#cfe6f5;font-size:13px;margin:4px 0 4px 12px;letter-spacing:2px}
</style></head><body>
<h2>容器类仪器（1:1）</h2><div class="row"><canvas id="c1"></canvas></div>
<h2>装置与工具（1:1）</h2><div class="row"><canvas id="c2"></canvas></div>
<h2>高中新增仪器（1:1）</h2><div class="row"><canvas id="c3"></canvas></div>
${SCRIPTS.map(s => `<script src="../${s}"></script>`).join('\n')}
<script>
function build(canvasId, fn) {
  var r = new CHEM.Renderer(document.getElementById(canvasId));
  r.resize(1180, 660);
  var w = new CHEM.World();
  fn(w);
  for (var i = 0; i < 240; i++) w.step(1 / 60);
  /* 再补一些粒子，确保特效在静态截图里也看得见 */
  for (var j = 0; j < 40; j++) w.fx.step(w, 1 / 60);
  r.render(w, { selected: null, tool: null, mouse: { x: -999, y: -999 }, t: 6.0 });
  return w;
}

var B = CHEM.SCENE.benchY;

build('c1', function (w) {
  var t1 = w.add('testTube', 90, B);
  t1.addLiquid('cuso4aq', 10); t1.addSolid('fe', 0.8);          // 置换：蓝色变浅绿 + 紫红色铜

  var b1 = w.add('beakerSmall', 235, B);
  b1.addLiquid('hcl', 55); b1.addSolid('zn', 2.2);              // 气泡

  var b2 = w.add('beakerBig', 420, B);
  b2.addLiquid('naohaq', 90); b2.addLiquid('phenolphthalein', 4); // 酚酞变红

  var f1 = w.add('conicalFlask', 610, B);
  f1.addLiquid('hcl', 45); f1.addSolid('cuo', 1.6);             // 黑色氧化铜溶解成蓝绿色

  var j1 = w.add('gasJar', 760, B);
  j1.addGas('o2', 200); j1.addSolid('c', 0.7); j1.ignited = true; // 木炭在氧气中燃烧

  var d1 = w.add('evaporatingDish', 900, B);
  d1.addLiquid('caoh2aq', 18); d1.addGas('co2', 60);            // 变浑浊

  var g1 = w.add('graduatedCylinder', 1030, B);
  g1.addLiquid('h2o', 60);

  var t2 = w.add('testTube', 1130, B);
  t2.addLiquid('agno3', 7); t2.addLiquid('naclaq', 7);          // 白色沉淀
  w.fx.spawnBubble(b1, null, 14);
  w.fx.spawnBubble(t1, null, 4);
  w.fx.spawnPrecipitate(t2, '#eef1f5', 12);
  w.fx.spawnSparks(j1, 14, '#fff0c8');
  w.fx.spawnSmoke(j1, 5, '#f2f5fa');
  w.fx.spawnSteam(d1, 5);
  w.fx.step(w, 1 / 60);
});

build('c3', function (w) {
  var B2 = CHEM.SCENE.benchY;
  /* 容量瓶：装了一半的溶液，颈部刻度线可见 */
  var vf = w.add('volumetricFlask', 150, B2);
  vf.addLiquid('h2o', 45);
  var vf2 = w.add('volumetricFlask', 350, B2);
  vf2.addLiquid('cuso4aq', 50);

  /* 燃烧匙：里面放硫粉，正在燃烧 */
  var cs = w.add('combustionSpoon', 560, B2);
  cs.addSolid('s', 0.3);

  /* 分液漏斗 */
  var sf = w.add('separatoryFunnel', 780, B2);

  /* 容量瓶与分液漏斗配一套支架 */
  var st = w.add('ironStand', 960, B2);
  var sf2 = w.add('separatoryFunnel', 1030, B2 - 40);

  for (var i = 0; i < 90; i++) w.fx.step(w, 1 / 60);
  void st; void sf2;
});

build('c2', function (w) {
  var lamp = w.add('alcoholLamp', 110, B); lamp.lit = true;

  var stand = w.add('ironStand', 300, B);
  var net = w.add('asbestosNet', 400, B - 46);
  var b = w.add('beakerSmall', 470, B - 54);
  b.addLiquid('h2o', 45);
  var lamp2 = w.add('alcoholLamp', 470, B); lamp2.lit = true;

  var tripod = w.add('tripod', 640, B);
  var net2 = w.add('asbestosNet', 640, B - 44);
  var f = w.add('conicalFlask', 640, B - 56);
  f.addLiquid('h2o', 40);

  var rack = w.add('testTubeRack', 800, B);
  var t = w.add('testTube', 800 - 2 * 28, B - 4);
  t.addLiquid('naohaq', 10);
  t.rackUid = rack.uid; t.slot = 2;
  var t2 = w.add('testTube', 800 + 2 * 28, B - 4);
  t2.addLiquid('hcl', 10);
  t2.rackUid = rack.uid; t2.slot = 4;

  var fun = w.add('funnel', 1080, B);

  var g1 = w.add('gasJar', 960, B - 180);
  var g2 = w.add('gasJar', 1120, B - 180);
  var tube = w.add('deliveryTube', 1040, B - 300);
  w.connect(tube.uid, g1.uid, g2.uid);
  var dish = w.add('evaporatingDish', 180, B);
  dish.addLiquid('h2o', 10);
  w.fx.spawnSteam(dish, 4);
});
</script>
</body></html>
`;

fs.writeFileSync(path.join(__dirname, '.gallery.html'), html, 'utf8');
console.log('已生成 test/.gallery.html');
