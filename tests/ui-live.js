// WorldAxis tests/ui-live.js (v2.137.0, O14) — UI **实机**验证通道（真浏览器）
//
// 【它治的病】本仓自 v2.12.0 起用 tests/ui-dom.js 的 mini-DOM 覆盖 UI 渲染路径，
//   38 个版本里所有 UI 结论都建立在那上面。而 mini-DOM 是**自写替身**，它与真浏览器
//   有一处结构性差异，恰好让一整族缺陷隐身：
//     `element.querySelectorAll()` 在替身里返回**普通数组**（tests/ui-dom.js 的 `qsa()`），
//     在真浏览器里返回 **NodeList**。于是 `querySelectorAll(...).filter(...)` 这种链
//     在替身里永远过、在真机上一律抛 `TypeError`。
//   v2.137.0 首次接通真浏览器后**第一次运行**就抓到了活体：
//     ui/panel.js 的 `#wa-inj-diag`（注入页「跑诊断」按钮）整枚控件在真机上点了没反应。
//   这条通道的存在意义就是把这类「替身测不到」的结论变成可复现的门禁。
//
// 【O14 计划原文的口径，逐条对照】
//   ① tests/ui-headful-runner.js（Puppeteer 或 Playwright 驱动真浏览器）
//      → 本文件；驱动选 **playwright-core**（不锁版本、不绑浏览器包）。
//   ② 逐页打开面板 14 页 → 点击每个按钮 → 捕获未处理拒绝与同步抛出
//      → `runLive()` 的 pages/thrown/rejections；页数以 `WA.ui.pages()` 现场取（不写死 14）。
//   ③ 输入框填值 → 保存 → 读回校验（设置往返一致性）
//      → `roundtrip()`：真 localStorage 上「填 → 保存 → 重新读回」逐值比对。
//   ④ 专锁 tests/ui-live-v2137.js（含 N0–N4 负控制：DOM 节点缺失必须被检出）
//      → 该锁的 N 段破坏真装载脚本，要求本通道**报出**而不是静默。
//
// 【三档可见性，沿用 v2.103.0（O16 第一刀）dependency-guard 的口径】
//   full     —— playwright-core + 浏览器可执行文件都在位，实机真跑；
//   fallback —— 驱动缺失但测试面的 mini-DOM 静态判据仍在（**不是失败，但必须被看见**）；
//   missing  —— 两者皆无 ⇒ 调用方必须报红，不许静默放行（同 v2.103.0：缺依赖 ⇒ 静默 skip
//                ⇒「判据的绿建立在自己没跑这件事上」，正是 O16 要治的病）。
//   本仓零 npm 依赖，故驱动**一律**从仓库外取：可移植 `require` → 临时安装回退
//   （不写字面路径，走 os.tmpdir() 拼接，与 dependency-guard.resolve 同款）。
//
// 【边界（如实登记，不假称已覆盖）】
//   · 本通道验证「控件可达、点击不抛、设置往返一致、渲染成树」，**不验证排版与像素**；
//   · 页面用 `route.fulfill` 从磁盘喂源码（不起 HTTP 服务），故**不覆盖** CDN 回退链
//     （index.js 的 loadScriptOnce 多源容灾）——那需要真网络；
//   · 真宿主（SillyTavern）缺席，宿主交互面走 `tests/mock.js` 同形的桩，如实标 `host: 'stub'`；
//   · 只在能启动浏览器的机器上给出 full 档；无浏览器的机器落到 fallback，读数如实减少。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');

// ── 驱动定位（可移植 require → 临时安装回退；判据自身不含绝对路径字面量）──
const CANDIDATE_PKGS = ['playwright-core', 'playwright', 'puppeteer-core'];
function loadDriver() {
  for (const pkg of CANDIDATE_PKGS) {
    try { const m = require(pkg); return { mod: m, pkg: pkg, how: 'require' }; } catch (e) { /* 继续 */ }
  }
  const tmp = process.env.TMPDIR || os.tmpdir();
  for (const pkg of CANDIDATE_PKGS) {
    try {
      const m = require(path.join(tmp, 'node_modules', pkg));
      return { mod: m, pkg: pkg, how: 'tmp-fallback' };
    } catch (e) { /* 继续 */ }
  }
  return { mod: null, pkg: null, how: 'absent' };
}
/** 浏览器缓存根（PLAYWRIGHT_BROWSERS_PATH 可覆盖——不写死某一台机器的布局）。 */
function browsersRoot() {
  return process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright');
}
/**
 * 找一个可用的浏览器可执行文件。
 * 三条来源，按「越专一越先」排序：
 *   ① 驱动自己算出的 executablePath（版本配对时最准）；
 *   ② 环境变量 WA_LIVE_BROWSER（给无版本配对的自定义布局留出口）；
 *   ③ 缓存目录下逐个 build 探测已知相对路径（版本漂移时仍能跑：playwright-core 的主版本
 *      与已下载的 build 号不必一致，实测 1.63.0 的默认路径落空而 1.49.0 的配对目录在场）。
 * 找不到就如实返回 null —— 由 probe() 降档，**不猜、不静默换成别的浏览器**。
 */
function findBrowser(driver) {
  const tried = [];
  const isFile = function (p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
  if (driver && driver.mod && driver.mod.chromium && driver.mod.chromium.executablePath) {
    try {
      const p = driver.mod.chromium.executablePath();
      tried.push(p);
      if (p && isFile(p)) return { exe: p, how: 'driver-default' };
    } catch (e) { /* 继续 */ }
  }
  if (process.env.WA_LIVE_BROWSER) {
    tried.push(process.env.WA_LIVE_BROWSER);
    if (isFile(process.env.WA_LIVE_BROWSER)) return { exe: process.env.WA_LIVE_BROWSER, how: 'env' };
  }
  // 已知相对布局：playwright 打包的三种形态轮流试
  const REL = ['chrome-linux/chrome', 'chrome-linux/headless_shell',
    'chrome-linux-arm64/chrome', 'chrome-linux-arm64/headless_shell',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe'];
  let dirs = [];
  try { dirs = fs.readdirSync(browsersRoot()); } catch (e) { dirs = []; }
  for (const d of dirs.sort().reverse()) {
    for (const rel of REL) {
      const p = path.join(browsersRoot(), d, rel);
      tried.push(p);
      if (isFile(p)) return { exe: p, how: 'cache-scan:' + d };
    }
  }
  return { exe: null, how: 'none', tried: tried };
}
/**
 * 探测实机通道是否可用（**纯只读、不抛异常** —— 与 dependency-guard.resolve 同款）。
 * 返回 { available, tier, driver, exe, why }。三档语义见模块头。
 */
function probe() {
  const driver = loadDriver();
  if (!driver.mod) {
    return { available: false, tier: 'fallback', driver: null, exe: null,
      why: '驱动不可达（' + CANDIDATE_PKGS.join(' / ') + ' 均 require 失败）⇒ 落到测试面静态判据' };
  }
  const b = findBrowser(driver);
  if (!b.exe) {
    return { available: false, tier: 'fallback', driver: driver.pkg + '@' + driver.how, exe: null,
      why: '驱动在位（' + driver.pkg + '）但其浏览器可执行文件不存在 ⇒ 落到测试面静态判据' };
  }
  return { available: true, tier: 'full', driver: driver.pkg + '@' + driver.how, exe: b.exe, why: '实机通道可用（' + b.how + '）' };
}

// ── 装载面（与 tests/ui-gate-sync.js 同源推导，不复制清单）──
/** 产品模块装载序取自 index.js 的 LOAD_ORDER（**真·入口的那一份**，不是测试面的副本）。 */
function productLoadOrder() {
  const src = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  const li = src.indexOf('const LOAD_ORDER = [');
  if (li < 0) throw new Error('ui-live: 无法从 index.js 提取 LOAD_ORDER');
  const lj = src.indexOf('];', li);
  if (lj < 0) throw new Error('ui-live: LOAD_ORDER 未闭合');
  return vm.runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
}
/** UI 层清单走 product-files.js 单一真源（不另立第二份三文件常量）。 */
function uiFiles() {
  return require('./product-files.js').discoverUIFiles(path.join(BASE, 'ui'));
}
/**
 * 生成页内宿主桩源码。**与 tests/mock.js 同形**，但必须在页内求值（Node 的 global 进不去浏览器）。
 * 返回一个字符串，由 page.evaluate 里的 `eval` 求值 —— 不引外部分发文件。
 */
function hostStubSource() {
  return [
    'window.SillyTavern = { getContext: function () { return window.__ctx; } };',
    'window.__ctx = {',
    "  chat: [{ is_user: true, mes: 'ui-live anchor', swipe_id: 0 }],",
    "  chatId: 'ui_live_chat', chatMetadata: {},",
    '  updateChatMetadata: function (p) { Object.assign(this.chatMetadata, p || {}); },',
    '  saveMetadataDebounced: function () {},',
    '  eventSource: { on: function (e, f) { (window.__eh[e] = window.__eh[e] || []).push(f); },',
    '    emit: async function (e) { const a = window.__eh[e] || []; for (let i = 0; i < a.length; i++) await a[i](); } },',
    "  eventTypes: { APP_READY: 'app_ready', GENERATION_ENDED: 'gen_ended', MESSAGE_RECEIVED: 'msg_recv', CHAT_CHANGED: 'chat_changed' },",
    '  setExtensionPrompt: function () {}',
    '};',
    'window.__eh = {};',
    'window.TavernHelper = {',
    '  getVariables: function () { return {}; }, replaceVariables: function () { return true; },',
    '  insertOrAssignVariables: function () { return true; }, deleteVariable: function () { return true; },',
    '  getWorldbook: async function () { return []; }, createWorldbookEntries: async function () { return []; }',
    '};',
    'window.__rej = [];',
    "window.addEventListener('unhandledrejection', function (e) { window.__rej.push(String((e.reason && e.reason.message) || e.reason).slice(0, 200)); });"
  ].join('\n');
}
/**
 * 装载并启动 UI（页内）。返回 { loaded, failed, mount, storeError }。
 * `srcOverride` 供负控制注入破坏副本（**不改磁盘**，与 ui-gate-sync.fresh 同一口径）。
 */
function bootstrapSource(files, srcOverride) {
  const ov = srcOverride || {};
  return [
    '(async function () {',
    '  const w = window.WorldAxis = window.WorldAxis || {};',
    '  w.mainWin = window; w.mainDoc = document; w.modules = {};',
    '  w.eventLog = []; w.errorLog = [];',
    '  w.log = function () {};',
    '  w.registerModule = function (n) { w.modules[n] = { name: n }; return w.modules[n]; };',
    '  w.moduleRegistry = function () { return Object.keys(w.modules).sort(); };',
    '  w.on = function () {};',
    '  const out = { loaded: [], failed: [] };',
    '  const files = ' + JSON.stringify(files) + ';',
    '  const ov = ' + JSON.stringify(ov) + ';',
    '  for (const rel of files) {',
    '    try {',
    '      let src;',
    '      if (Object.prototype.hasOwnProperty.call(ov, rel)) { src = ov[rel]; }',
    '      else { const r = await fetch("/" + rel); src = await r.text(); }',
    '      (0, eval)(src);',
    '      out.loaded.push(rel);',
    '    } catch (e) { out.failed.push(rel + " :: " + ((e && e.message) || e)); }',
    '  }',
    '  try { if (w.store && w.store.init) w.store.init(); out.storeError = null; } catch (e) { out.storeError = String((e && e.message) || e); }',
    '  try { if (w.ui && w.ui.mount) w.ui.mount(); out.mountError = null; } catch (e) { out.mountError = String((e && e.message) || e); }',
    '  return out;',
    '})()'
  ].join('\n');
}
/** 页内「逐页点控件」脚本：**每次点击包 try**，同步抛出按控件归属登记（与 ui-gate checkClickable 同口径）。 */
const CLICK_SOURCE = [
  '(async function () {',
  '  const w = window.WorldAxis; const doc = document;',
  '  const out = { pages: [], thrown: [], structThrown: [], syncThrown: [], handlerThrown: [], controls: 0, missingTab: [] };',
  // v2.137.0 实测纠错：**事件监听器里抛出的异常不会冒泡到 `.click()` 的调用方**（DOM 规范：
  //   监听器抛错走「报告异常」路径，交给全局 error 事件，不向上传播）。
  //   于是只包 try/catch 的点击面**结构性看不见「控件 handler 本体抛错」**——而那正是本版
  //   抓到的 `#wa-inj-diag` 的形态（实测：破坏后 pageErrors=1、thrown=0）。
  //   补法：页内挂一次全局 error 收集器，并在**每个控件点击前后**取长度差，把新增的
  //   error 归因到**刚刚被点的那个控件**上（带控件标识），与同步抛出合并进同一个 `thrown` 面。
  //   局限如实登记：异步 handler 的异常可能落在本控件的时间窗之后（每页留 20ms 让它落地，
  //   落到下一窗则归因给下一个控件，但**不会丢**——条数守恒）。
  '  if (!window.__werr) {',
  '    window.__werr = [];',
  '    window.addEventListener("error", function (e) {',
  '      window.__werr.push(String((e && e.message) || (e && e.error && e.error.message) || e).slice(0, 200));',
  '    });',
  '  }',
  '  const panel = doc.getElementById("wa-panel");',
  '  if (!panel) { out.fatal = "面板未注入（WA.ui.mount 没跑到 appendChild）"; return out; }',
  '  const pages = (w.ui && w.ui.pages) ? w.ui.pages() : [];',
  '  for (const page of pages) {',
  '    const tabs = Array.prototype.slice.call(panel.querySelectorAll(".wa-tab"));',
  '    const tab = Array.prototype.filter.call(tabs, function (t) { return t.dataset.page === page; })[0];',
  '    if (!tab) { out.missingTab.push(page); continue; }',
  '    let werr0page = window.__werr.length;',
  '    try { tab.click(); } catch (e) { out.syncThrown.push(page + " | tab -> " + ((e && e.message) || e)); continue; }',
  // v2.137.0 实测纠错（第三处同族坑）：**tab 自己也是一枚控件**，点它会触发 `renderBody()`；
  //   当 `.wa-body` 不在树中时，`renderBody()` 里 `body.innerHTML = ...` 抛 TypeError，
  //   该异常同样**不冒泡**到 `tab.click()` 调用方 ⇒ 只包 try/catch 看不见；
  //   而下面的 `!body` 分支又会 `continue`，把「页尾补收」整段跳掉 ⇒ 整页的失败**无声消失**
  //   （实测：删掉 .wa-body 后 pages=0 / thrown=[] / pageErrors=14，判据报「0 条」，看起来像通过）。
  //   故：tab 点击后**先**结算这一窗的 handler 抛错，再决定是继续点控件还是登记缺失。
  '    if (window.__werr.length > werr0page) {',
  '      out.handlerThrown.push(page + " | tab -> " + window.__werr.slice(werr0page).join(" / "));',
  '      werr0page = window.__werr.length;',
  '    }',
  '    const body = panel.querySelector(".wa-body");',
  '    if (!body) { out.structThrown.push(page + " | 无 .wa-body（renderBody 未跑）"); continue; }',
  '    const ctrls = Array.prototype.slice.call(body.querySelectorAll("button,input,select,textarea"));',
  '    const rdAll = Array.prototype.slice.call(body.querySelectorAll("[id]")).filter(function (e) { return !/^(button|input|select|textarea)$/i.test(e.tagName); });',
  '    const readings = rdAll.map(function (e) { return e.id; });',
  '    const readingsLen = rdAll.map(function (e) { return String(e.textContent || "").trim().length; });',
  '    const html = body.innerHTML;',
  '    let n = 0;',
  '    for (const c of ctrls) {',
  '      n++; out.controls++;',
  '      const tag = "<" + String(c.tagName || "").toLowerCase() + (c.id ? " id=" + c.id : "") + ">";',
  '      const werr0 = window.__werr.length;',
  '      try {',
  '        if (String(c.type || "").toLowerCase() === "file" && !c.files) { try { c.files = []; } catch (e2) {} }',
  '        if (typeof c.click === "function") c.click();',
  '        if (typeof c.oninput === "function") c.oninput({ target: c });',
  '        if (typeof c.onchange === "function") c.onchange({ target: c });',
  '      } catch (e) { out.syncThrown.push(page + " | " + tag + " -> " + ((e && e.message) || e)); }',
  // handler 本体抛错（不冒泡到调用方）：取全局 error 的长度差，归因到**刚被点的控件**上
  '      if (window.__werr.length > werr0) {',
  '        const fresh = window.__werr.slice(werr0).join(" / ");',
  '        out.handlerThrown.push(page + " | " + tag + " -> " + fresh);',
  '      }',
  '    }',
  '    out.pages.push({ page: page, controls: n, html: html.length,',
  '      inTree: body.querySelectorAll("button,input,select,textarea").length,',
  '      readings: readings, readingsLen: readingsLen });',
  '    await new Promise(function (r) { setTimeout(r, 20); });',
  '    if (window.__werr.length > werr0page) {',
  '      const rest = window.__werr.slice(werr0page).join(" / ");',
  '      out.handlerThrown.push(page + " | <页尾补收> -> " + rest);',
  '      werr0page = window.__werr.length;',
  '    }',
  '  }',
  '  out.rejections = (window.__rej || []).slice(0, 30);',
  '  out.readings = []; out.pages.forEach(function (p) { p.readings.forEach(function (id, i) { out.readings.push(p.page + " | " + id + " | " + (p.readingsLen[i] || 0)); }); });',
  // 合并成统一的 `thrown` 面：**同步抛出 + handler 抛出**都算「这个控件点不了」。
  //   两半在返回值里分开留着（`syncThrown` / `handlerThrown`），便于定位是哪一类；
  //   `thrown` 是判红用的合并面（调用方只需看它，不需要知道 DOM 的报错路径有几条）。
  '  out.thrown = out.syncThrown.concat(out.handlerThrown);',
  '  out.pageErrorsSeen = window.__werr.length;',
  // 合并面必须**三路都收**：同步抛出 / handler 抛出 / **结构缺失**（无 .wa-body 这类）。
  //   实测纠错：此前结构缺失是直接 push 进 `out.thrown` 的，而本行又用 concat 重新赋值
  //   ⇒ 把刚推的那条**覆盖掉**了（「无 .wa-body」永远报不出来，C3 因此红灯）。合并面只许在
  //   一处生成，且生成时**把每一路都带上**；任何「先 push 进合并面、再整体重算」的写法都是坑。
  '  out.thrown = out.structThrown.concat(out.syncThrown, out.handlerThrown);',
  '  return out;',
  '})()'
].join('\n');
/**
 * 设置往返一致性：真 localStorage 上「填 → 保存 → 重新读回」。
 * 为什么这条不能靠 mini-DOM：替身的 localStorage 是 Node 侧对象、且**同进程内不会被重新装载**；
 *   真浏览器里 localStorage 是真持久化，「存住了没有」才可能被独立验证。
 * 两半都做实，且**分开报**（一半过不等于往返成立）：
 *   · `viaStorage` —— 绕过产品代码直接从 window.localStorage 读原始串（证「真落盘」）；
 *   · `readBack`   —— 走产品自己的 `settingsBus.read()` 读回（证「产品能读回自己存的」）。
 * 口径：`ok = 两半都过`，且 `ok` 与两半分别列在返回值里 —— 不允许用「产品读回对」
 *   掩盖「其实没落盘」（v2.7.0 立的「写进去 ≠ 存住了」，这里同一条纪律）。
 * 返回 { key, wrote, rawStored, viaStorage, readBack, ok, why }。
 */
const ROUNDTRIP_SOURCE = [
  '(function () {',
  '  const w = window.WorldAxis;',
  '  const out = { key: null, wrote: null, rawStored: null, viaStorage: null, readBack: null, ok: false, why: null };',
  '  if (!w.settingsBus || typeof w.settingsBus.save !== "function") { out.why = "settingsBus.save 不可达"; return out; }',
  '  const key = "worldaxis_ui_live_roundtrip_v1";',
  '  const reg = { key: key, def: { a: 0, b: "", c: [] }, module: "ui-live" };',
  '  const probe = { a: 7, b: "往返", c: [1, 2, 3] };',
  '  try { w.settingsBus.save(reg, probe); }',
  '  catch (e) { out.why = "save 抛出：" + ((e && e.message) || e); return out; }',
  '  out.key = key; out.wrote = probe;',
  '  try {',
  '    out.rawStored = window.localStorage.getItem(key);',
  '    out.viaStorage = out.rawStored === null ? null : JSON.parse(out.rawStored);',
  '  } catch (e) { out.why = "localStorage 直读失败：" + ((e && e.message) || e); }',
  '  try { out.readBack = w.settingsBus.read(reg); }',
  '  catch (e) { out.why = "read 抛出：" + ((e && e.message) || e); return out; }',
  '  const same = function (v) {',
  '    return !!v && v.a === 7 && v.b === "往返" && Array.isArray(v.c) && v.c.join(",") === "1,2,3";',
  '  };',
  '  out.storedOk = same(out.viaStorage);',
  '  out.readBackOk = same(out.readBack);',
  '  out.ok = out.storedOk === true && out.readBackOk === true;',
  '  return out;',
  '})()'
].join('\n');

/**
 * 实机跑一轮。**不抛异常**：任何一步失败都落进返回值的 `errors`，由调用方判红。
 * opts: { srcOverride }  破坏副本（负控制用；不改磁盘）
 */
async function runLive(opts) {
  opts = opts || {};
  const p = probe();
  const out = {
    tier: p.tier, available: p.available, driver: p.driver, exe: p.exe, why: p.why,
    host: 'stub', origin: null, files: 0, loaded: 0, failedLoad: [], storeError: null,
    pages: [], controls: 0, readings: [], thrown: [], rejections: [], missingTab: [],
    roundtrip: null, pageErrors: [], consoleErrors: [], errors: []
  };
  if (!p.available) return out;
  let browser = null;
  try {
    const driver = loadDriver();
    const chromium = driver.mod.chromium;
    browser = await chromium.launch({
      executablePath: p.exe,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    page.on('pageerror', function (e) { out.pageErrors.push(String((e && e.message) || e).slice(0, 240)); });
    page.on('console', function (m) {
      if (m.type() === 'error') out.consoleErrors.push(String(m.text()).slice(0, 240));
    });
    // 页面用 route.fulfill 从磁盘喂源码：不起 HTTP 服务、不留端口，且**路径相对仓库根**
    //   （换机器/换目录都能跑 —— 与 v2.41.0 成类静态锁同一条纪律：不写死绝对路径）。
    const origin = 'http://walive.test';
    const prefix = origin + '/';
    await page.route('**/*', function (route) {
      const url = route.request().url();
      if (url === origin + '/' || url === origin) {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' });
      }
      const rel = url.indexOf(prefix) === 0 ? url.slice(prefix.length).split('?')[0] : '';
      const safe = rel && rel.indexOf('..') < 0 && rel.indexOf('://') < 0;
      if (!safe) return route.fulfill({ status: 404, body: 'not-relative' });
      let body = null;
      try { body = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { body = null; }
      if (body === null) return route.fulfill({ status: 404, body: 'missing:' + rel });
      const ct = /\.js$/.test(rel) ? 'application/javascript' : (/\.css$/.test(rel) ? 'text/css' : 'text/plain');
      return route.fulfill({ contentType: ct, body: body });
    });
    await page.goto(origin + '/');
    out.origin = await page.evaluate('String(location.origin)');
    const files = productLoadOrder().concat(uiFiles());
    out.files = files.length;
    await page.evaluate(hostStubSource());
    const boot = await page.evaluate(bootstrapSource(files, opts.srcOverride || {}));
    out.loaded = (boot && boot.loaded || []).length;
    out.failedLoad = (boot && boot.failed) || [];
    out.storeError = (boot && boot.storeError) || null;
    if (boot && boot.mountError) out.errors.push('mount 抛出：' + boot.mountError);
    // 负控制接缝：装载完成之后、开点之前求值一段页内源码（**仅供专锁制造病灶**）。
    //   为什么需要它：本通道的判据全部建立在「装载后的运行态」上，而破坏必须发生在运行态里
    //   （v2.74.0 的教训：破坏要先打得到靶，否则「判据不报」证明不了任何事）。
    //   生产路径不传该参数，行为逐字不变。
    if (opts.afterLoad && typeof opts.afterLoad === 'string') {
      try { await page.evaluate(opts.afterLoad); }
      catch (e) { out.errors.push('afterLoad 抛出：' + String((e && e.message) || e).slice(0, 200)); }
    }
    const clicked = await page.evaluate(CLICK_SOURCE);
    if (clicked && clicked.fatal) out.errors.push(clicked.fatal);
    out.pages = (clicked && clicked.pages) || [];
    out.controls = (clicked && clicked.controls) || 0;
    out.thrown = (clicked && clicked.thrown) || [];
    out.syncThrown = (clicked && clicked.syncThrown) || [];
    out.handlerThrown = (clicked && clicked.handlerThrown) || [];
    out.pageErrorsSeen = (clicked && clicked.pageErrorsSeen) || 0;
    out.rejections = (clicked && clicked.rejections) || [];
    out.missingTab = (clicked && clicked.missingTab) || [];
    out.readings = (clicked && clicked.readings) || [];
    try { out.roundtrip = await page.evaluate(ROUNDTRIP_SOURCE); }
    catch (e) { out.errors.push('roundtrip 抛出：' + ((e && e.message) || e)); }
    await browser.close();
    browser = null;
  } catch (e) {
    out.errors.push('实机通道异常：' + String((e && e.message) || e).slice(0, 400));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { /* 已尽力 */ } }
  }
  return out;
}
/** 一行人类可读摘要（run.js 打印用；也供专锁核对字段齐全）。 */
function summarize(r) {
  if (!r) return '（无读数）';
  if (r.tier !== 'full') return 'tier=' + r.tier + '（' + r.why + '）';
  return 'files=' + r.files + ' loaded=' + r.loaded + ' pages=' + r.pages.length
    + ' controls=' + r.controls + ' readings=' + (r.readings ? r.readings.length : 0) + ' thrown=' + r.thrown.length + ' rej=' + r.rejections.length
    + ' pageErr=' + r.pageErrors.length + ' roundtrip=' + (r.roundtrip && r.roundtrip.ok ? 'ok' : 'no');
}
module.exports = {
  BASE: BASE,
  CANDIDATE_PKGS: CANDIDATE_PKGS,
  probe: probe,
  loadDriver: loadDriver,
  findBrowser: findBrowser,
  browsersRoot: browsersRoot,
  productLoadOrder: productLoadOrder,
  uiFiles: uiFiles,
  hostStubSource: hostStubSource,
  bootstrapSource: bootstrapSource,
  runLive: runLive,
  summarize: summarize,
  CLICK_SOURCE: CLICK_SOURCE,
  ROUNDTRIP_SOURCE: ROUNDTRIP_SOURCE
};
