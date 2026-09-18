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
const vm = require('vm');
require('./mock.js');                 // 宿主基础桩（localStorage / SillyTavern / WA.log）
const uiDom = require('./ui-dom.js');
const BASE = path.join(__dirname, '..');
const UI_FILES = ['ui/panel.js', 'ui/settings.js', 'ui/assistant.js'];

function loadOrder() {
  const src = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const li = src.indexOf('const LOAD = [');
  const lj = src.indexOf('];', li);
  if (li < 0 || lj < 0) throw new Error('ui-gate: 无法从 tests/run.js 提取 LOAD 清单');
  return vm.runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
}

// 装一个「已启动」的 UI 环境：产品模块 + mini-DOM + 启动序列 + 面板/设置/助手三件套
function fresh(opts) {
  opts = opts || {};
  const LOAD = loadOrder();
  const ctx = vm.createContext(global);
  for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
  const WA = global.WorldAxis;
  // 前提：代表「有聊天」。run.js 里靠前的块会把 mockCtx.chat 换成空数组/别的形状且不还原，
  //   而本门禁的推演链路需要一条末楼作为锚点——所以不能假设它恰好还在，
  //   显式复位（否则门禁会因“别的块此刻的环境”而不可复现地失败）。
  try {
    const __st = WA.mainWin && WA.mainWin.SillyTavern;
    const __c = __st && __st.getContext && __st.getContext();
    if (__c && (!__c.chat || !__c.chat.length)) __c.chat = [{ is_user: true, mes: 'ui-gate anchor', swipe_id: 0 }];
  } catch (e) {}
  uiDom.install(WA);                    // 必须在 ui/* 求值前：panel.js 求值时缓存 mainDoc/mainWin
  try { WA.store.init(); } catch (e) {}
  if (WA.interceptor && WA.interceptor.install) WA.interceptor.install();
  if (WA.injectInspector && WA.injectInspector.init) WA.injectInspector.init();
  const files = opts.files || UI_FILES;
  const srcOverride = opts.srcOverride || {};
  for (const rel of files) {
    const src = srcOverride[rel] !== undefined ? srcOverride[rel] : fs.readFileSync(path.join(BASE, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  }
  // 复刻 index.js 启动序列的最后一步（否则面板只装载不挂载，等于没渲染过）
  if (WA.ui && typeof WA.ui.mount === 'function') WA.ui.mount();
  return { ctx: ctx, WA: WA, dom: WA.__uiDoc };
}

// 逐页渲染探针（可被主门禁与负向自证复用）：返回 {tested, failures}
// 覆盖面：点 tab 走 buildPanel 真实绑定 → renderBody → RENDERERS[page]() → innerHTML 真实解析 → bindBody
function checkPages(env, countFn) {
  const WA = env.WA, dom = env.dom;
  const out = { tested: 0, failures: [], details: [] };
  const pages = (WA.ui && typeof WA.ui.pages === 'function') ? WA.ui.pages() : [];
  const panel = dom.getElementById('wa-panel');
  if (!panel) { out.failures.push('面板未注入（无法逐页渲染）'); return out; }
  for (const page of pages) {
    out.tested++;
    const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) { out.failures.push('找不到 ' + page + ' 的 tab（buildPanel 未渲染该页入口）'); continue; }
    let err = null;
    try { tab.click(); } catch (e) { err = e; }
    if (err) { out.failures.push(page + ' 页切换抛异常：' + (err && err.message)); continue; }
    if (WA.ui.currentPage() !== page) { out.failures.push(page + ' 页切换后 currentPage 未跟随（实 ' + WA.ui.currentPage() + '）'); continue; }
    const body = panel.querySelector('.wa-body');
    const html = body ? body.innerHTML : '';
    if (!html || !html.trim()) { out.failures.push(page + ' 页渲染产物为空'); continue; }
    // 「渲染出来的控件能在树里被找到」——这是纯壳 stub 永远测不到的一段：
    //   innerHTML 里的 button/input 若因未闭合/空容器而没成树，绑定就是空转。
    const inHtml = countFn(html);
    const inTree = body.querySelectorAll('button,input,select,textarea').length;
    out.details.push(page + ':' + html.length + 'B/' + inTree + '控件');
    if (inHtml > inTree) {
      out.failures.push(page + ' 页有 ' + inHtml + ' 个控件写进 HTML、但树里只找得到 ' + inTree + ' 个（渲染产物未成树，绑定会空转）');
    }
  }
  return out;
}

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

  section('G17-B 十个渲染器逐页真实执行（点击 → renderBody → innerHTML 解析 → bindBody）');
  WA.ui.open();
  assert(panel.classList.contains('wa-hidden') === false, 'open() 后翻为可见');
  const pages = checkPages(env, countControls);
  assert(pages.tested === 10, 'RENDERERS 覆盖的页面数为 10（实 ' + pages.tested + '）');
  assert(pages.failures.length === 0, '十个页面全部渲染成树且控件可在树中找到', pages.failures.join('；'));
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

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('UI 渲染路径门禁：通过 ' + pass.length + ' / 失败 ' + fail.length);
  if (fail.length) { console.log('失败项: ' + fail.join(' | ')); process.exit(1); }
  console.log('全部通过 \u2713（渲染路径已被真实执行）');
  process.exit(0);
}
main().catch(function (e) { console.error('ui-gate 运行器异常:', e); process.exit(2); });
