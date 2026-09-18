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
module.exports = { fresh: fresh, checkPages: checkPages, BASE: BASE, UI_FILES: UI_FILES };
