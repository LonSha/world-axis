// WorldAxis tests/ui-gate.js — UI 渲染路径门禁（零依赖）
// 为什么要单独一条：tests/run.js 的 LOAD 刻意不含 ui/*，而它自带的那个轻量 DOM stub 是**纯壳**
//   （querySelector() 每次返回一个新的游离 div、querySelectorAll() 恒返回 []、firstElementChild
//   靠全局钩子回一个写死 id 的 div）。于是：`body.innerHTML = 渲染结果` 确实执行了，但
//   **解析与查询全部虚化**——十个渲染器里只有概览页被执行且产物当即丢弃，其余九个零执行；
//   buildPanel 的 `.wa-tab` 点击绑定、bindBody 的 `[data-*]` 控件绑定、事件页运行态按钮的
//   条件渲染与点击链路、重绘调度…… 在全部自动化里均无执行覆盖。
// 本门禁用 mini-DOM（tests/ui-dom.js，自包含、无外部依赖）把这段补上：
//   装载顺序按 run.js 的 LOAD 取（不复制、不漂移），然后在**每个用例独立的上下文**里
//   真实装载 ui/panel.js，真实点击、真实查询、真实调用。
'use strict';
const path = require('path');
const fs = require('fs');
// v2.21.0: 单一真源收口。此前本文件**自带一份** fresh()/checkPages() 副本，而
//   tests/ui-gate-sync.js 的模块头明写「装载顺序按 run.js 的 LOAD 取（不复制、不漂移）」——
//   两份实现靠人工同步，本轮新增 checkClickable 与 `<input type=file>.files` 前提修复时
//   立刻暴露：sync 改了、本文件的副本没跟。现改为直接从 sync 取（唯一实现），
//   本文件只保留用例与断言。
const { fresh, checkPages, checkClickable, BASE } = require('./ui-gate-sync.js');

async function main() {
  const pass = [], fail = [];
  function assert(cond, name, extra) {
    if (cond) { pass.push(name); console.log('  \u2713 ' + name); }
    else { fail.push(name); console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  }
  function section(t) { console.log('\n\u25a0 ' + t); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  const countControls = function (html) { return (html.match(/<(button|input|select|textarea)\b/g) || []).length; };

  const env = fresh();
  const WA = env.WA, dom = env.dom;
  const panel = dom.getElementById('wa-panel');

  section('G17-A 面板与悬浮球挂载（buildPanel / buildOrb 真实执行）');
  assert(!!panel, '#wa-panel 已注入 DOM（buildPanel 走到 appendChild）');
  assert(!!dom.getElementById('wa-orb'), '#wa-orb 悬浮球已注入 DOM');
  assert(!!panel && panel.querySelectorAll('.wa-tab').length === (WA.ui.pages() || []).length,
    '页签数量与 pages() 一致（实 ' + (panel ? panel.querySelectorAll('.wa-tab').length : -1) + '）');
  assert(!!panel && !!panel.querySelector('.wa-close'), '关闭按钮成树（点击绑定不空转）');
  assert(!!panel && !!panel.querySelector('.wa-body'), '内容容器成树（renderBody 的挂载点）');
  assert(!!panel && panel.classList.contains('wa-hidden') === true, '初始为隐藏态（未点开时不占屏）');

  section('G17-B 全部渲染器逐页真实执行（点击 → renderBody → innerHTML 解析 → bindBody）');
  WA.ui.open();
  assert(panel.classList.contains('wa-hidden') === false, 'open() 后翻为可见');
  const pages = checkPages(env, countControls);
  // v2.40.0：期望值不再写死数字。此前写 `=== 12`，而页面已增至 14 —— 该断言成为
  //   本门禁唯一红灯来源（`checkPages.tested` 恒等于 `pages().length`，写死数字只在
  //   加页时误报；真正的漏渲染早被下面的 failures 兜住）。这正是「写死一种形态 =
  //   给其它形态发通行证」的老毛病：**陈旧常量**。改为三条自维护判据，并把
  //   「RENDERERS ↔ PAGES 逐页同名同数」这一根因层不变式补上（漏一个渲染器时
  //   点到该页必抛，属 G17 要管的真缺陷，此前无静态覆盖）。
  const pageIds = (WA.ui && typeof WA.ui.pages === 'function') ? WA.ui.pages() : [];
  assert(pages.tested === pageIds.length && pages.tested > 0,
    '逐页探针覆盖全部 ' + pageIds.length + ' 个页面（实 ' + pages.tested + '）');
  assert(pages.failures.length === 0, '全部页面渲染成树且控件可在树中找到', pages.failures.join('；'));
  {
    const psrc = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    const reg = psrc.match(/const RENDERERS = \{([\s\S]*?)\};/);
    assert(!!reg, 'RENDERERS 字面量可定位（静态不变式的锚点）');
    const rk = reg ? Array.from(new Set((reg[1].match(/([A-Za-z_$][\w$]*)\s*:/g) || [])
      .map(function (s) { return s.replace(/\s*:$/, ''); }))) : [];
    const missR = pageIds.filter(function (p) { return rk.indexOf(p) < 0; });
    const missP = rk.filter(function (k) { return pageIds.indexOf(k) < 0; });
    assert(rk.length === pageIds.length,
      'RENDERERS 键数与 PAGES 页数一致（' + rk.length + ' vs ' + pageIds.length + '）');
    assert(missR.length === 0, 'PAGES 里每页都有对应 RENDERERS 条目（缺 ' + (missR.join(',') || '无') + '）');
    assert(missP.length === 0, 'RENDERERS 里每个键都在 PAGES 中（多 ' + (missP.join(',') || '无') + '）');
  }
  console.log('    ' + pages.details.join('  '));
  assert(WA.ui.currentPage() === (WA.ui.pages() || []).slice(-1)[0],
    '切换按 pages() 原始顺序推进（末页实 ' + WA.ui.currentPage() + '）');

  section('G17-C 控件绑定真实生效（bindBody：点了有反应，而不是空转）');
  {
    const tabOf = function (p) { return panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === p; })[0]; };
    tabOf('overview').click();
    assert(WA.ui.currentPage() === 'overview', '（正向）页签点击后 currentPage 跟随');
    tabOf('settings').click();
    const sBody = panel.querySelector('.wa-body');
    const sCtl = sBody.querySelectorAll('button,input,select').length;
    assert(sBody.innerHTML.indexOf('未加载') < 0 && sCtl > 0,
      '设置页是真实面板（非「模块未加载」占位，控件在树中 ' + sCtl + ' 个）');
    tabOf('overview').click();
    const oBody = panel.querySelector('.wa-body');
    assert(oBody.querySelectorAll('.wa-stat').length >= 6, '概览页统计网格在树中可查询（wa-stat 命中 ≥6）');
    assert(oBody.querySelectorAll('[data-node]').length >= 1, '概览页工作流节点开关进入引用面（data-node 命中 ≥1）');
    assert(oBody.querySelectorAll('.wa-tab').length === 0, '渲染容器与页签容器互不污染（子树边界正确）');
    tabOf('events').click();
    const evBody = panel.querySelector('.wa-body');
    assert(evBody.querySelectorAll('.wa-rep-cell').length === 4, '事件页声誉四维网格在树中可查询（wa-rep-cell 恰 4）');
    assert(evBody.querySelectorAll('.wa-sec').length >= 3, '事件页分节标题进入引用面（wa-sec 命中 ≥3）');
    const orb = dom.getElementById('wa-orb');
    let orbErr = null;
    try { orb.dispatchEvent({ type: 'pointerup' }); } catch (e) { orbErr = e; }
    assert(!orbErr && panel.classList.contains('wa-hidden') === true, '悬浮球 pointerup → toggle() 收起面板（orb 事件链贯通）');
    orb.dispatchEvent({ type: 'pointerdown', clientX: 5, clientY: 5, pointerId: 1 });
    orb.dispatchEvent({ type: 'pointermove', clientX: 60, clientY: 70, pointerId: 1 });
    orb.dispatchEvent({ type: 'pointerup' });
    assert(panel.classList.contains('wa-hidden') === true, '（正向）拖动后的 pointerup 不误触发开合（moved 阈值生效）');
    WA.ui.open();
  }

  section('G17-D 事件页运行态条件渲染与「中止推演」链路（v2.11.0 面C 接线）');
  {
    const tabOf = function (p) { return panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === p; })[0]; };
    tabOf('events').click();
    const eBody = panel.querySelector('.wa-body');
    assert(!eBody.querySelector('#wa-bs-abort'), '（负向）空闲态不渲染中止按钮（与 isRunning 一致）');
    assert(typeof WA.backstage.forceSimulate === 'function', 'backstage.forceSimulate 可调用');
    let inflight = 0;
    const origFetch = global.fetch;
    global.fetch = function (url, o) {
      return new Promise(function (res, rej) {
        inflight++;
        const sg = o && o.signal;
        if (sg) sg.addEventListener('abort', function () { rej(new Error('aborted')); });
      });
    };
    try { WA.backstage.forceSimulate(); } catch (e) {}
    const dl = Date.now() + 2500;
    while (!WA.backstage.isRunning() && Date.now() < dl) await sleep(10);
    assert(WA.backstage.isRunning() === true,
      '（正向）推演进行中 isRunning()===true（在途请求未回）',
      'inflight=' + inflight + ' last=' + JSON.stringify((WA.eventLog || []).slice(-1)[0] || null));
    tabOf('events').click();
    const abortBtn = panel.querySelector('.wa-body #wa-bs-abort');
    assert(!!abortBtn, '运行态渲染出「中止推演」按钮（条件渲染命中运行分支）');
    let abortErr = null;
    try { if (abortBtn) abortBtn.click(); } catch (e) { abortErr = e; }
    assert(!abortErr, '点击中止不抛异常（绑定真实命中）');
    const dl2 = Date.now() + 2500;
    while (WA.backstage.isRunning() && Date.now() < dl2) await sleep(10);
    assert(WA.backstage.isRunning() === false, '中止后 isRunning() 归 false（信号贯通到在途请求）');
    assert((WA.eventLog || []).some(function (l) { return /中止|abort/i.test(l.msg || ''); }), '中止动作已写入事件日志');
    global.fetch = origFetch;
  }

  section('G17-E 状态事件 → 自动重绘（节流 / 隐藏跳过）');
  {
    panel.querySelector('.wa-close').click();
    assert(panel.classList.contains('wa-hidden') === true, '（正向）关闭按钮点击 → 面板收起（close 绑定真实生效）');
    const s0 = WA.ui.rerenderStat();
    WA.emit('clock:changed', 'ui-gate-probe');
    const s1 = WA.ui.rerenderStat();
    assert(s1.scheduled === s0.scheduled + 1, '状态事件被调度重绘');
    assert(s1.skippedHidden === s0.skippedHidden + 1, '面板隐藏时不重绘（避免无效渲染）');
    WA.ui.open();
    const s2 = WA.ui.rerenderStat();
    WA.emit('chapters:changed'); WA.emit('registry:changed');
    await sleep(350);
    const s3 = WA.ui.rerenderStat();
    assert(s3.scheduled === s2.scheduled + 2, '两次变更都进调度');
    assert(s3.ran === s2.ran + 1, '节流：一窗多变更只重绘一次（防重绘风暴）');
  }

  section('G17-F 连续切换不留异常（渲染状态不泄漏）');
  {
    const arr = WA.ui.pages();
    for (let i = 0; i < 30; i++) {
      const p = arr[i % arr.length];
      panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === p; })[0].click();
    }
    assert(WA.ui.currentPage() === arr[29 % arr.length], '30 次切换后停在预期页（实 ' + WA.ui.currentPage() + '）');
    const b = panel.querySelector('.wa-body');
    assert(!!b && b.innerHTML.length > 0, '30 次切换后渲染产物非空');
  }

  section('G17-G 探针自证：解析器关键能力 + 负向注入必须被抓到');
  {
    const probe = dom.createElement('div');
    probe.innerHTML = '<input id="p1" value="abc"/><input id="p2" type="checkbox" checked/><input id="p3">';
    assert(probe.querySelectorAll('input').length === 3, '（自证）自闭合标签逐个成节点且不吞兄弟节点');
    assert(probe.querySelector('#p1').value === 'abc', '（自证）解析器保留 value 属性（否则控件读取全空却「渲染正常」）');
    assert(probe.querySelector('#p2').checked === true, '（自证）解析器保留 checked 属性');
    const r0 = checkPages(env, countControls);
    assert(r0.failures.length === 0, '（基线）未破坏时逐页探针零失败（实 ' + r0.tested + ' 页）');
    const src = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    const doctored = src.replace('function renderLogs() {', 'function renderLogs() { throw new Error(\'ui-gate-probe\');');
    assert(doctored !== src, '（自证）注入点 A 命中（renderLogs）');
    const env2 = fresh({ srcOverride: { 'ui/panel.js': doctored } });
    const r2 = checkPages(env2, countControls);
    assert(r2.failures.length > 0, '（负向）渲染器抛异常被逐页探针抓到（实失败 ' + r2.failures.length + ' 项）');
    const doctored2 = src.replace('data-page="${p.id}"', 'data-page-x="${p.id}"');
    assert(doctored2 !== src, '（自证）注入点 B 命中（页签 data-page）');
    const env3 = fresh({ srcOverride: { 'ui/panel.js': doctored2 } });
    const r3 = checkPages(env3, countControls);
    assert(r3.failures.length > 0, '（负向）页签绑定断掉被逐页探针抓到（实失败 ' + r3.failures.length + ' 项）');
    const envShell = fresh({ files: [] });
    assert(envShell.dom.getElementById('wa-panel') === null,
      '（负向）未装载 UI 时面板不存在（探针判据来自真实渲染，不是常量）');
  }

  // v2.21.0: 控件可点性门禁（G18）。第九面：**控件被点可不可点**。
  //   G17 管「控件成树」（HTML 里的 <button> 在树里找得到），G18 管「控件可点」——
  //   点下去会不会抛。两轮真缺陷都落在这一层：
  //     ① 设置页「立即生成舆情」是 async 出口，`await` **之后**才写 `out().textContent`，
  //        而 `out()` 每次重查 —— 其间任意状态事件触发面板重绘，`#wa-set-out` 离树，
  //        重查得 null ⇒ TypeError（用户视角「点了没反应」）。
  //     ② 面板三处裸 `prompt(...)`（世界钟 / 势力编辑器）——宿主无 prompt 时
  //        ReferenceError，而它们是**唯一入口**。
  //   探针口径见 ui-gate-sync.js checkClickable：同步抛出 + 未处理 Promise 拒绝，两者合
  //   起来才是完整判据（只测同步会漏掉异步那一半，而本轮真缺陷恰在异步那一半）。
  section('G18 控件可点性（逐页真实点击每个 button/input/select/textarea）');
  {
    const env18 = fresh();
    const r = await checkClickable(env18);
    assert(r.controls >= 100, '逐页渲染出的可交互控件被真实点到（实 ' + r.controls + ' 个）');
    assert(r.thrown.length === 0, '（正向）全部控件点击零同步抛出', r.thrown.join('；'));
    assert(r.rejections.length === 0, '（正向）点击后无未处理 Promise 拒绝（异步出口写回不炸）', r.rejections.join('；'));
    const srcP = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    // 负向 A：调用点裸 prompt（真实反映「有人写了裸 prompt()」；不能回退 askText 内部——
    //   它自带 try/catch，ReferenceError 会被吞掉而无法现形）
    const bA = srcP.replace(
      "const v = askText('设定世界时间（如「三日目·黄昏」）：', WA.store.read('clock.label', '')); if (v != null)",
      "const v = prompt('设定世界时间（如「三日目·黄昏」）：', WA.store.read('clock.label', '')); if (v != null)");
    assert(bA !== srcP, '（自证）负向注入点 A 命中（世界钟裸 prompt）');
    const envA = fresh({ srcOverride: { 'ui/panel.js': bA } });
    const rA = await checkClickable(envA);
    assert(rA.thrown.length > 0, '（负向）裸 prompt → ReferenceError 被同步抛出抓到（实 ' + rA.thrown.length + ' 项）');
    const srcS = fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8');
    // 负向 B：settings 的判空出口退回裸写（异步那一半）
    const bB = srcS.replace(
      'const setOut = function (text) { const o = out(); if (o) o.textContent = text; };',
      'const setOut = function (text) { out().textContent = text; };');
    assert(bB !== srcS, '（自证）负向注入点 B 命中（settings 判空出口）');
    const envB = fresh({ srcOverride: { 'ui/settings.js': bB } });
    const rB = await checkClickable(envB);
    assert(rB.rejections.length > 0, '（负向）异步出口写回失败 → 未处理拒绝被拿到（实 ' + rB.rejections.length + ' 项）');
  }

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('UI 渲染路径门禁：通过 ' + pass.length + ' / 失败 ' + fail.length);
  if (fail.length) { console.log('失败项: ' + fail.join(' | ')); process.exit(1); }
  console.log('全部通过 \u2713（渲染路径已被真实执行）');
  process.exit(0);
}
main().catch(function (e) { console.error('ui-gate 运行器异常:', e); process.exit(2); });
