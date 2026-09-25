/* =============================================================================
 * 生成可视化验证页 test/.visual.html
 * -----------------------------------------------------------------------------
 * 把 index.html 的资源路径改成上一级，并在末尾注入一段"布置演示场景"的脚本，
 * 用于在无头浏览器里截图检查画布渲染效果（液体、气泡、沉淀、火焰、白烟……）。
 * 运行：node test/make-visual.mjs  然后用 Chrome --headless --screenshot
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace('href="css/', 'href="../css/').replace(/src="js\//g, 'src="../js/');
html = html.replace('<title>', '<title>可视化验证 · ');

const DEMO = `
<script>
/* ---- 演示场景：把所有典型现象同时摆上台面 ---- */
document.addEventListener('DOMContentLoaded', function () {
  function report(err) {
    var dh = document.getElementById('dropHint');
    if (dh) {
      /* 注意：这段代码整体放在模板字符串里，换行必须写成 \\n，写成 \n 会被
         模板字符串转义成真正的换行，把生成的内联脚本写坏（踩过一次）。 */
      dh.textContent = '演示场景出错：' + (err && err.message);
      dh.classList.remove('hidden');
    }
    document.title = 'ERR ' + (err && err.message);
  }
  setTimeout(function () {
   try {
    /* 学段由 URL 的 hash 决定 */
    window.__LEVEL = (location.hash || '').replace('#', '') || 'junior';
    var W = CHEM.__world, B = CHEM.SCENE.benchY;
    CHEM.__applyLevel(window.__LEVEL === 'senior' || window.__LEVEL === 'all' ? window.__LEVEL : 'all');
    if (window.__LEVEL === 'equations' || window.__LEVEL === 'detail') {
      CHEM.__applyLevel('all');
      /* 正在反应中的容器 → 会在旁边自动标出化学方程式 */
      var e1 = W.add('beakerSmall', 200, B);
      e1.addSolid('caco3', 0.8); e1.addLiquid('hcl', 55);
      var e2 = W.add('testTube', 400, B);
      e2.addLiquid('cuso4aq', 12); e2.addSolid('fe', 1.0);
      var e3 = W.add('gasJar', 570, B);
      e3.addLiquid('ki', 30); e3.addGas('cl2', 200);
      var e4 = W.add('beakerBig', 800, B);
      e4.addLiquid('naohaq', 80); e4.addLiquid('phenolphthalein', 3);
      /* 分液漏斗装配到锥形瓶上，逐滴加液 */
      var flask = W.add('conicalFlask', 1040, B);
      flask.addLiquid('hcl', 30);
      var sep = W.add('separatoryFunnel', 1040, B - 160);
      sep.addLiquid('naohaq', 40);
      W.attach(sep.uid, flask.uid);
      /* 只跑一小段，保证截图时反应还在进行中 */
      for (var q3 = 0; q3 < 100; q3++) W.step(1 / 60);
      for (var q4 = 0; q4 < 20; q4++) W.fx.spawnBubble(e1, null, 1);
      /* 选中接了分液漏斗的锥形瓶，右侧就能同时看到"连接"区 */
      CHEM.__select(flask.uid);
      document.getElementById('dropHint').classList.add('hidden');
      if (window.__LEVEL === 'detail') {
        setTimeout(function () { CHEM.__openEquationDetail(e1.uid, 'caco3_hcl'); }, 200);
      }
      return;
    }

    if (window.__LEVEL === 'experiment') {
      CHEM.__applyLevel('all');
      /* 启动一个教材实验：实验区里会出现"实验流程"指引栏 */
      CHEM.__startTask('oxygen');
      for (var q5 = 0; q5 < 90; q5++) W.step(1 / 60);
      document.getElementById('dropHint').classList.add('hidden');
      return;
    }

    if (window.__LEVEL === 'experiment-long') {
      /* 步骤最多的那个实验（9 步），用来检查步骤条会不会溢出 */
      CHEM.__applyLevel('all');
      CHEM.__startTask('tb-ion-reaction');
      for (var q6 = 0; q6 < 90; q6++) W.step(1 / 60);
      document.getElementById('dropHint').classList.add('hidden');
      return;
    }

    if (window.__LEVEL === 'wheel') {
      /* 在实验台上滚动滚轮 → 切换工具，截图时正好能看到提示与高亮的按钮 */
      CHEM.__applyLevel('all');
      CHEM.__startTask('tb-mass');
      for (var q7 = 0; q7 < 60; q7++) W.step(1 / 60);
      document.getElementById('dropHint').classList.add('hidden');
      setTimeout(function () {
        var cv = document.getElementById('bench');
        cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
      }, 6400);
      return;
    }

    if (window.__LEVEL === 'testanim') {
      /* 检验动画：跑一次检验，然后把时间推到动画中段，截图正好能拍到 */
      CHEM.__applyLevel('all');
      document.getElementById('dropHint').classList.add('hidden');
      var t1 = W.add('testTube', 300, CHEM.SCENE.benchY - 46);
      W.addReagent(t1.uid, 'kmno4', 0.4);
      W.add('alcoholLamp', 300, CHEM.SCENE.benchY).lit = true;
      var t2 = W.add('testTube', 620, CHEM.SCENE.benchY);
      W.addReagent(t2.uid, 'o2', 40);
      var t3 = W.add('testTube', 900, CHEM.SCENE.benchY);
      W.addReagent(t3.uid, 'naohaq', 10);
      for (var q8 = 0; q8 < 90; q8++) W.step(1 / 60);
      CHEM.__select(t2.uid);
      CHEM.__doTest(t2, 'glowingSplint');       // 带火星的木条 → 复燃
      CHEM.__doTest(t3, 'phPaper');             // pH 试纸 → 变色
      for (var q9 = 0; q9 < 45; q9++) W.step(1 / 60);   // 推进到动画中段
      return;
    }

    if (window.__LEVEL === 'senior') {
      var n1 = W.add('beakerSmall', 180, B);
      n1.addLiquid('h2o', 45); n1.addLiquid('phenolphthalein', 3); n1.addSolid('na', 0.4);
      var n2 = W.add('testTube', 360, B);
      n2.addLiquid('h2o', 10); n2.addSolid('na2o2', 0.5);
      var n3 = W.add('testTube', 520, B);
      n3.addLiquid('ki', 8); n3.addGas('cl2', 30);
      var n4 = W.add('volumetricFlask', 700, B);
      n4.addLiquid('cuso4aq', 60);
      W.add('separatoryFunnel', 880, B);
      var n6 = W.add('combustionSpoon', 990, B);
      n6.addSolid('s', 0.3);
      var n7 = W.add('gasJar', 1120, B);
      n7.addLiquid('naohaq', 40); n7.addGas('cl2', 50);
      for (var q = 0; q < 300; q++) W.step(1 / 60);
      for (var q2 = 0; q2 < 40; q2++) W.fx.spawnBubble(n1, null, 1);
      CHEM.__select(n4.uid);
      document.getElementById('dropHint').classList.add('hidden');
      return;
    }

    /* 1. 铁钉浸入硫酸铜溶液：蓝色变浅绿 + 铁钉表面析出红色的铜 */
    var t1 = W.add('testTube', 110, B);
    t1.addLiquid('cuso4aq', 9);
    t1.addSolid('fe', 0.7);

    /* 2. 锌粒与稀盐酸：大量气泡 */
    var b1 = W.add('beakerSmall', 250, B);
    b1.addLiquid('hcl', 45);
    b1.addSolid('zn', 1.8);

    /* 3. 氢氧化钠溶液 + 无色酚酞：变红 */
    var b2 = W.add('beakerBig', 440, B);
    b2.addLiquid('naohaq', 70);
    b2.addLiquid('phenolphthalein', 3);

    /* 4. 集气瓶中的氧气里燃烧的木炭：白光与火星 */
    var jar = W.add('gasJar', 650, B);
    jar.addGas('o2', 210);
    jar.addSolid('c', 0.6);
    jar.ignited = true;

    /* 5. 加热高锰酸钾制氧气：酒精灯 + 试管 */
    var t2 = W.add('testTube', 790, B - 52);
    t2.addSolid('kmno4', 0.6);
    var lamp = W.add('alcoholLamp', 790, B);
    lamp.lit = true;

    /* 6. 蒸发皿中的澄清石灰水被二氧化碳变浑浊 */
    var dish = W.add('evaporatingDish', 900, B);
    dish.addLiquid('caoh2aq', 14);
    dish.addGas('co2', 40);

    /* 7. 硝酸银溶液 + 氯化钠溶液：白色沉淀 */
    var t3 = W.add('testTube', 1020, B);
    t3.addLiquid('agno3', 6);
    t3.addLiquid('naclaq', 6);

    /* 8. 锥形瓶：氧化铜与稀盐酸，溶液变蓝绿（垫石棉网 + 三脚架） */
    var f1 = W.add('conicalFlask', 1140, B - 60);
    f1.addLiquid('hcl', 40);
    f1.addSolid('cuo', 1.2);
    W.add('asbestosNet', 1140, B - 52);
    var tripod = W.add('tripod', 1140, B);
    tripod.lit = false;

    /* 9. 用导管把制氧气的试管和一个集气瓶连起来 */
    var t4 = W.add('gasJar', 1140, B);
    var tube = W.add('deliveryTube', 1050, B - 300);
    W.connect(tube.uid, t2.uid, t4.uid);

    /* 让反应进行一段时间，产生足够多的气泡 / 沉淀 / 颜色变化 */
    for (var i = 0; i < 260; i++) W.step(1 / 60);
    for (var j = 0; j < 90; j++) { W.fx.spawnBubble(b1, null, 1); W.fx.spawnBubble(t2, null, 1); }
    W.fx.spawnSmoke(jar, 6, '#f4f6fa');
    W.fx.spawnSparks(jar, 8, '#fff0c8');
    W.fx.spawnPrecipitate(t3, '#eef1f5', 10);
    W.fx.spawnSteam(dish, 4);
    W.fx.step(W, 1 / 60);

    CHEM.__select(b2.uid);
    document.getElementById('dropHint').classList.add('hidden');
    window.__DEMO_READY = true;

    /* 演示交互层：悬停状态气泡 + 把药品拖到容器上弹出的加药量浮层 */
    setTimeout(function () {
      var r = CHEM.__renderer;
      if (!r) return;
      var rc = r.canvas.getBoundingClientRect();
      function toClient(x, y) {
        return { clientX: rc.left + x * r.scale + r.ox, clientY: rc.top + y * r.scale + r.oy };
      }
      var list = W.containers();
      var hoverTarget = list[3];
      if (hoverTarget) {
        var p = toClient(hoverTarget.x, hoverTarget.y - 60);
        r.canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: p.clientX, clientY: p.clientY, bubbles: true }));
      }
      var card = document.querySelector('.item-card.reagent[data-id="naohaq"]');
      var drop = list[0];
      if (card && drop) {
        var q = toClient(drop.x, drop.y - 40);
        card.dispatchEvent(new PointerEvent('pointerdown', { clientX: q.clientX - 420, clientY: 320, bubbles: true, button: 0 }));
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: q.clientX - 380, clientY: 340, bubbles: true }));
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: q.clientX, clientY: q.clientY, bubbles: true }));
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: q.clientX, clientY: q.clientY, bubbles: true }));
      }
    }, 420);
   } catch (err) { report(err); }
  }, 150);
});
</script>
`;

html = html.replace('</body>', DEMO + '</body>');
fs.writeFileSync(path.join(__dirname, '.visual.html'), html, 'utf8');
console.log('已生成 test/.visual.html');
