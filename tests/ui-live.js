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
//   本仓零 npm 依赖，故驱动一律从仓库外取。四条通道，按「越专一越先」排序（配 DRIVERS 表）：
//     ① 可移植 `require`（仓库外装了就能用）；
//     ② 临时安装回退（不写字面路径，走 os.tmpdir() 拼接，与 dependency-guard.resolve 同款）；
//     ③ 本地待装目录 `<仓库根>/node_modules`（同样不写字面路径，path.join(BASE, ...) 拼）；
//     ④ **零依赖内置 CDP 驱动**（v2.163.0 补）—— 用 Node 自带的 WebSocket 直接对
//       Chromium 的 `--remote-debugging-port` 讲 CDP，**不需要任何 npm 包**，只需一枚
//       Chromium 可执行文件（`WORLD_AXIS_CHROMIUM` 或 Playwright 浏览器缓存）。
//
// 【v2.163.0 治的病（现场实测）】②③ 在没装 playwright-core 的机器上都不成立 ⇒ 本通道
//   **长期落在 fallback 档**，B 面运行时判据与 C 面五条负控制整段休眠；而同一台机器上
//   `tests/browser/browser-runner.mjs`（L4 真浏览器层）**用系统已有的 Chromium 零依赖跑
//   得通**。也就是说：休眠的**不是环境**，是**装载面** —— 判据在（B/C 面写好了），
//   驱动面缺一跳。本版把那跳补上（通道与 L4 共用同一个浏览器探针口径，不各写一份）。
//
// 【边界（如实登记，不假称已覆盖）】
//   · 本通道验证「控件可达、点击不抛、设置往返一致、渲染成树」，**不验证排版与像素**；
//   · 页面用 `route.fulfill` 从磁盘喂源码（不起 HTTP 服务），故**不覆盖** CDN 回退链
//     （index.js 的 loadScriptOnce 多源容灾）——那需要真网络；
//   · 真宿主（SillyTavern）缺席，宿主交互面走 `tests/mock.js` 同形的桩，如实标 `host: 'stub'`；
//   · 「本机装了哪些驱动」是**环境事实**，不是产品事实：故探针的驱动清单逐轮现场枚举
//     （任一 npm 驱动可达即入册、内置 CDP 恒备），降档理由里带上完整尝试语（builtin 档
//     证据是浏览器本身，故浏览器缺失时理由由浏览器那一跳给出）。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');
const BASE = path.join(__dirname, '..');
/** 内置 CDP 驱动的读数标识（探针与运行共用；不在别处再写第二份）。 */
const BUILTIN_DRIVER = 'builtin-cdp@node-websocket';

// ── 驱动定位（可移植 require → 临时安装 → 仓库根 node_modules → 零依赖内置 CDP）──
//   判据自身不含绝对路径字面量（本仓 v2.41.0 的成类静态锁禁止测试面出现裸 `/tmp`）。
const CANDIDATE_PKGS = ['playwright-core', 'playwright', 'puppeteer-core'];
/** 内置 CDP 驱动的可用性：真实判据是「Node 有没有自带 WebSocket」（没有就整条通道不成立）。 */
function builtinDriver() {
  return { mod: '(builtin)', pkg: 'builtin-cdp', how: typeof WebSocket === 'function' ? 'node-websocket' : 'absent' };
}
/**
 * 逐轮现场枚举四条驱动通道（**环境事实，不写死**）。
 *   返回 { mod, pkg, how } —— mod 为内置标记 '(builtin)' 时由 driveBuiltin 驱动。
 *   为什么返回数组而不返回单个 driver：降档理由要把「本机四条通道各是什么结局」一次说清，
 *   只报最后一条会让读的人以为只有一种尝试（而病灶恰恰是「只试了 npm 那三包」）。
 */
function enumerateDrivers() {
  const rows = [];
  for (const pkg of CANDIDATE_PKGS) {
    try { require(pkg); rows.push({ mod: require(pkg), pkg: pkg, how: 'require', ok: true }); }
    catch (e) { rows.push({ pkg: pkg, how: 'require', ok: false, err: String((e && e.code) || e) }); }
  }
  const tmp = process.env.TMPDIR || os.tmpdir();
  for (const pkg of CANDIDATE_PKGS) {
    try {
      const m = require(path.join(tmp, 'node_modules', pkg));
      rows.push({ mod: m, pkg: pkg, how: 'tmp-fallback', ok: true });
    } catch (e) { rows.push({ pkg: pkg, how: 'tmp-fallback', ok: false, err: String((e && e.code) || e) }); }
  }
  for (const pkg of CANDIDATE_PKGS) {
    try {
      const m = require(path.join(BASE, 'node_modules', pkg));
      rows.push({ mod: m, pkg: pkg, how: 'repo-fallback', ok: true });
    } catch (e) { rows.push({ pkg: pkg, how: 'repo-fallback', ok: false, err: String((e && e.code) || e) }); }
  }
  const b = builtinDriver();
  rows.push({ mod: b.mod, pkg: b.pkg, how: b.how, ok: b.how !== 'absent' });
  return rows;
}
/** 第一条可达的驱动（供浏览器探测与运行共用；「装了哪个」只在这一处判定）。 */
function loadDriver() {
  const rows = enumerateDrivers();
  const hit = rows.filter(function (r) { return r.ok; })[0];
  return hit || { mod: null, pkg: null, how: 'absent' };
}
/** 浏览器缓存根（PLAYWRIGHT_BROWSERS_PATH 可覆盖——不写死某一台机器的布局）。 */
function browsersRoot() {
  return process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright');
}
/**
 * 系统级浏览器安装位置（发行版/打包器的**标准**落点，与本机布局无关）。
 * 用 `path.join` 逐段构造而不是写字面量：本文件的 A3 判据（`v2136/v2137` 同源）要求
 *   「顶层无绝对路径字面量」—— 那条纪律针对的是「把某台机器的布局写死」，而这里恰恰相反，
 *   这些是跨机器的公共约定位置。逐段 join 既满足判据纯度，也表意准确（不写死分隔符）。
 * 顺序：先通用 chromium，再各发行版/厂商的常见别名；**找不到就照旧降档**，不猜。
 */
const SYSTEM_BROWSER_PATHS = [
  path.join('/', 'usr', 'bin', 'chromium'),
  path.join('/', 'usr', 'bin', 'chromium-browser'),
  path.join('/', 'usr', 'bin', 'google-chrome'),
  path.join('/', 'usr', 'bin', 'google-chrome-stable'),
  path.join('/', 'usr', 'lib', 'chromium', 'chromium'),
  path.join('/', 'opt', 'google', 'chrome', 'chrome'),
  path.join('/', 'snap', 'bin', 'chromium'),
];
/**
 * 找一个可用的浏览器可执行文件。
 * 四条来源，按「越专一越先」排序：
 *   ① 驱动自己算出的 executablePath（版本配对时最准）；
 *   ② 环境变量 WA_LIVE_BROWSER（给无版本配对的自定义布局留出口）；
 *   ③ 缓存目录下逐个 build 探测已知相对路径（版本漂移时仍能跑：playwright-core 的主版本
 *      与已下载的 build 号不必一致，实测 1.63.0 的默认路径落空而 1.49.0 的配对目录在场）；
 *   ④ **系统级已知安装路径**（/usr/bin/chromium 等）—— v2.163.0 补。
 *      为什么补这一条：缓存根走 `os.homedir()`，而隔离回归会把 HOME 重定向到 task 目录，
 *      于是「本机明明有浏览器」也会被读成「可执行文件不存在」而如实降档（实测 v2137/O14
 *      在隔离环境恒为 fallback 档）。零依赖驱动不该因为 HOME 被改写而失能 —— 系统级发行版
 *      装的 chromium 与 HOME 无关，扫它才能让隔离环境也够得着 full 档。
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
  // 系统级已知安装路径：与 HOME 无关，隔离环境（HOME 被重定向）仍够得着。
  for (const p of SYSTEM_BROWSER_PATHS) {
    tried.push(p);
    if (isFile(p)) return { exe: p, how: 'system:' + path.basename(p) };
  }
  return { exe: null, how: 'none', tried: tried };
}
/**
 * 探测实机通道是否可用（**纯只读、不抛异常** —— 与 dependency-guard.resolve 同款）。
 * 返回 { available, tier, driver, exe, tried, why }。三档语义见模块头。
 *   `tried` 是四条通道的现场枚举（降档理由由它逐条说明「试了什么、为何都不行」）。
 */
function probe() {
  const rows = enumerateDrivers();
  const tried = rows.map(function (r) { return r.how + ':' + r.pkg + (r.ok ? ' ✓' : ' ✗' + (r.err || '')); });
  const driver = loadDriver();
  if (!driver.mod) {
    return { available: false, tier: 'fallback', driver: null, exe: null, tried: tried,
      why: '驱动不可达（' + rows.length + ' 条通道全否：' + tried.join(' / ') + '）⇒ 落到测试面静态判据' };
  }
  const b = findBrowser(driver);
  if (!b.exe) {
    // 降档理由要把**找浏览器这一步**也交代清楚：只报「可执行文件不存在」而不列出试过哪些
    //   路径，读的人无法判断是「本机真没浏览器」还是「我们没找对地方」（v2.163.0 的教训：
    //   隔离回归里 HOME 被重定向，缓存扫描必然落空 —— 这条必须能自证）。
    const browsAll = b.tried || [];
    const browsTail = browsAll.slice(-4);
    return { available: false, tier: 'fallback', driver: driver.pkg + '@' + driver.how, exe: null, tried: tried,
      why: '驱动在位（' + driver.pkg + '）但找不到浏览器可执行文件（试过 ' + browsAll.length
        + ' 条路径，末 4 条：' + browsTail.join(' / ') + '）⇒ 落到测试面静态判据' };
  }
  return { available: true, tier: 'full', driver: driver.pkg + '@' + driver.how, exe: b.exe, tried: tried,
    why: '实机通道可用（' + b.how + '）' };
}

/* ── 零依赖内置 CDP 驱动（v2.163.0）─────────────────────────────────────────
 * 它替代的就是 playwright-core 那一层：Node 自带 WebSocket ⇒ 直连 CDP，**不需要任何 npm 包**。
 * 为什么值得在仓库里自带一个：本通道的历史结局（见模块头）是「判据写好了、驱动拿不到 ⇒
 * 整面休眠」。驱动面是**本通道成立的前提**，让它依赖仓库外的包，等于把「这一面跑不跑」
 * 交给开发机的偶然状态 —— 而同一台机器上 L4 用系统 Chromium 跑得通，正说明这个依赖是多余的。
 *
 * 实现面刻意收窄到 runLive 真正用到的四个方法：
 *   page.route(handler)      → Fetch.enable + Fetch.requestPaused 逐请求应答（盘上喂源码）
 *   page.goto(url)           → Page.enable + Page.navigate + 轮询 document.readyState
 *   page.evaluate(expr)      → Runtime.evaluate（awaitPromise + returnByValue），注入的表达式包成 IIFE
 *   page.on('pageerror'/'console') → Runtime.exceptionThrown / Runtime.consoleAPICalled
 * 并**如实保留** Playwright 的输出形状（console 事件给 `{type,text}`；消息监听器用
 *   与 Playwright 同形的 `send(method, params)`、`on(method, handler)` 两参数）。
 * 内置标签名刻意不叫 chromium —— 让 `require(标记名)` 必然失败，内置就必须走 driveBuiltin，
 *   不会出现「半内置半 npm」的模糊态。
 */
function collectTargets(exe, extraArgs) { return Promise.resolve({ exe: exe, extraArgs: extraArgs || [] }); }
/** 把一个未监听的 TCP 端口取出来（listen(0) 让内核分配，再关掉取号）。 */
function pickPort() {
  return new Promise(function (resolve, reject) {
    const srv = require('net').createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', function () {
      const port = srv.address().port;
      srv.close(function () { resolve(port); });
    });
  });
}
/** 最小 CDP 客户端：一个 WebSocket 连接、一张方法→监听器表、一次 connect。 */
function Cdp(exe, port, extraArgs) {
  this.exe = exe;
  this.port = port;
  this.extraArgs = extraArgs || [];
  this.proc = null;
  this.ws = null;
  this.seq = 0;
  this.pending = {};
  this.handlers = {};
  this.closed = false;
  this.errTail = '';
}
Cdp.prototype.launch = async function () {
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--remote-debugging-port=' + this.port,
    'about:blank'
  ].concat(this.extraArgs);
  this.proc = spawn(this.exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  this.proc.stderr.on('data', (d) => { this.errTail = (this.errTail + d).slice(-4000); });
  // 等 DevTools 端点起来，并**连到页面 target**（不是浏览器 target）：`Page.*` / `Runtime.*` /
  //   `Fetch.*` 都是**页面级**域，浏览器级连接上根本没有这几个域 —— 实测第一版就撞在
  //   `'Page.enable' wasn't found` 上。故这里先 /json/version 等端点就绪，再 /json/list 取
  //   一枚 type==='page' 的 target 的 webSocketDebuggerUrl（`about:blank` 就是那一枚）。
  const deadline = Date.now() + 20000;
  let wsUrl = null;
  let lastWhy = '';
  while (Date.now() < deadline && !wsUrl) {
    await new Promise((r) => setTimeout(r, 120));
    const ver = await this.httpJson('/json/version').catch(() => null);
    if (!ver) continue;
    const list = await this.httpJson('/json/list').catch(() => null);
    const pages = (Array.isArray(list) ? list : []).filter((t) => t && t.type === 'page' && t.webSocketDebuggerUrl);
    if (pages.length) wsUrl = pages[pages.length - 1].webSocketDebuggerUrl;
    else lastWhy = '端点就绪但无 page target（列表 ' + JSON.stringify((Array.isArray(list) ? list : []).map((t) => t && t.type)) + '）';
  }
  if (!wsUrl) {
    throw new Error('CDP 页面端点未就绪（' + (lastWhy || String(this.errTail).split('\n').slice(-2).join(' ')) + '）');
  }
  this.wsUrl = wsUrl;
  this.ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    this.ws.addEventListener('open', () => resolve());
    this.ws.addEventListener('error', (e) => reject(new Error('WebSocket 连接失败：' + String((e && e.message) || e))));
  });
  this.ws.addEventListener('message', (ev) => {
    let msg = null;
    try { msg = JSON.parse(String(ev.data)); } catch (e) { return; }
    if (msg.id && this.pending[msg.id]) {
      const p = this.pending[msg.id];
      delete this.pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'));
      else p.resolve(msg.result);
      return;
    }
    const hs = this.handlers[msg.method] || [];
    for (const h of hs) { try { h(msg.params || {}); } catch (e) { /* 监听器不许把驱动带崩 */ } }
  });
  await this.send('Page.enable');
  await this.send('Runtime.enable');
  // 请求拦截**必须递归到子 frame**：装载脚本在页内 `(0, eval)` 求值，其 `fetch("/" + rel)`
  //   在**无 blob/inline 脚本**的页面里由主 frame 发出、能拦到；但只要产品代码（或页内任何
  //   一处）走 Blob/iframe，请求就会带 `FrameId`/`LoaderId` 落在子 frame 上。实测第一版
  //   拦截表漏了这一条 ⇒ 187 个模块请求全部 `Failed to fetch`（页面侧只报「面板未注入」，
  //   看上去像产品问题，其实是拦截面漏了一格）。三面都开：pattern（URL）、FrameId 的
  //   空值通配、LoaderId 同理。
  await this.send('Fetch.enable', {
    patterns: [
      { urlPattern: '*', requestStage: 'Request' },
      { urlPattern: '*', requestStage: 'Response' },
    ],
    handleAuthRequests: false,
  });
};
Cdp.prototype.httpJson = function (p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: this.port, path: p }, (res) => {
      let b = '';
      res.on('data', (d) => { b += d; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
  });
};
/** 与 Playwright 同形：send(method, params)（Promise）、on(method, handler)（订阅 CDP 事件）。 */
Cdp.prototype.send = function (method, params) {
  const id = ++this.seq;
  const self = this;
  return new Promise(function (resolve, reject) {
    if (!self.ws || self.ws.readyState !== 1) { reject(new Error('CDP 连接已关闭')); return; }
    self.pending[id] = { resolve: resolve, reject: reject };
    self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    setTimeout(function () {
      if (self.pending[id]) { delete self.pending[id]; reject(new Error('CDP 超时：' + method)); }
    }, 30000).unref && setTimeout(() => {}, 0);
  });
};
Cdp.prototype.on = function (method, handler) {
  (this.handlers[method] = this.handlers[method] || []).push(handler);
};
Cdp.prototype.close = async function () {
  this.closed = true;
  try { if (this.ws && this.ws.readyState === 1) this.ws.close(); } catch (e) { /* 已尽力 */ }
  try { if (this.proc) this.proc.kill('SIGKILL'); } catch (e) { /* 已尽力 */ }
  await new Promise((r) => setTimeout(r, 80));
};
/** Playwright 的 page 面（只用得到 route / goto / evaluate / on）。 */
function CdpPage(cdp) {
  this.cdp = cdp;
  this.origin = null;
}
CdpPage.prototype.on = function (evt, handler) {
  const self = this;
  if (evt === 'dialog') {
    this.cdp.on('Page.javascriptDialogOpening', function (p) { handler({ type: String((p && p.type) || ''), message: String((p && p.message) || '') }); });
    return this;
  }
  if (evt === 'pageerror') {
    this.cdp.on('Runtime.exceptionThrown', function (p) {
      const d = (p && p.exceptionDetails) || {};
      const t = (d.exception && (d.exception.description || d.exception.value)) || d.text || '';
      handler({ message: String(t) });
    });
  } else if (evt === 'console') {
    this.cdp.on('Runtime.consoleAPICalled', function (p) {
      const args = (p && p.args) || [];
      const text = args.map(function (a) {
        if (!a) return '';
        if (a.value !== undefined) return String(a.value);
        return String((a.description !== undefined ? a.description : a.type) || '');
      }).join(' ');
      handler({ type: String((p && p.type) || ''), text: text });
    });
  }
  return this;
};
CdpPage.prototype.route = async function (pattern, handler) {
  const self = this;
  this.cdp.on('Fetch.requestPaused', async function (p) {
    const url = String((p && p.request && p.request.url) || '');
    let r = null;
    try {
      // 【v2.163.0 取证教训】handler 拿到的是 Playwright 形状的 route 对象，**必须自带
      //   `fulfill` / `continue` 两个方法** —— 本仓的 route 回调正是调 `routeObj.fulfill({...})`
      //   来喂盘上源码的。第一版只给了 `request.url()`，于是回调首行就 `foo.fulfill is not a
      //   function` 抛错，被下面的 catch 兜成 `Fetch.failRequest`，主文档导航直接 `net::ERR_FAILED`，
      //   页面上表现为「187 项 Failed to fetch / 面板未注入」—— 看上去全是产品问题，实际是驱动
      //   少了一个方法。所以这里把请求对象配齐，并把回调返回值当作「应答意图」。
      const routeObj = {
        request: function () { return { url: function () { return url; } }; },
        fulfill: function (o) { return Object.assign({ __waAction: 'fulfill' }, o || {}); },
        continue: function () { return { __waAction: 'continue' }; },
        abort: function () { return { __waAction: 'abort' }; },
      };
      r = await handler(routeObj);
    } catch (e) {
      self.cdp.routeErrors = (self.cdp.routeErrors || 0) + 1;
      self.cdp.routeErrorTail = String((e && e.message) || e).slice(0, 300);
      try { await self.cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }); } catch (e2) { /* 忽略 */ }
      return;
    }
    // 语义对齐 Playwright：回调**返回 undefined / null** 或显式 abort 走 continue/失败，
    //   返回的对象带上 `contentType`/`body`/`status` 即视为 fulfill 意图（本仓 route 回调用
    //   的是后者；Playwright 里其实还要显式调 `route.fulfill()`，这里两种写法都认）。
    const isFulfill = r && (r.__waAction === 'fulfill' || r.contentType !== undefined || r.body !== undefined || r.status !== undefined);
    if (!isFulfill) {
      try { await self.cdp.send('Fetch.continueRequest', { requestId: p.requestId }); } catch (e2) { self.cdp.settleErrors = (self.cdp.settleErrors || 0) + 1; }
      return;
    }
    // `responseCode` 在 CDP 的 `Fetch.fulfillRequest` 里是**必填**（integer），而 Playwright 的
    //   `route.fulfill({ contentType, body })` **允许省略 status**（语义是 200）。本仓的 route 回调
    //   正是省略 status 的写法。第一版写成 `if (r.status) params.responseCode = r.status` —— 于是
    //   status 缺省时**整个字段不传**，CDP 直接拒收该次 fulfill；而调用点的 catch 是「已尽力」空吞，
    //   于是请求永远停在被暂停状态。故此处**始终给值**，缺省 200 —— 与 Playwright 同义。
    const params = { requestId: p.requestId, responseCode: (r.status === undefined || r.status === null) ? 200 : r.status };
    if (r.contentType) params.responseHeaders = [{ name: 'Content-Type', value: String(r.contentType) }];
    if (r.body !== undefined && r.body !== null) {
      params.body = Buffer.from(String(r.body), 'utf8').toString('base64');
    }
    try { await self.cdp.send('Fetch.fulfillRequest', params); self.cdp.fulfilledCount = (self.cdp.fulfilledCount || 0) + 1; }
    catch (e2) { self.cdp.fulfillErrors = (self.cdp.fulfillErrors || 0) + 1; self.cdp.fulfillErrorTail = String((e2 && e2.message) || e2).slice(0, 300); }
  });
  return this;
};
CdpPage.prototype.goto = async function (url) {
  // 【v2.163.0 取证教训】不能只轮询 `document.readyState` 就认为走完了。浏览器从 `about:blank`
  //   起页，而 about:blank 的 readyState **本来就是 `complete`** —— 于是轮询第一次就命中，
  //   `goto` 在导航真正发生之前就返回，后面整轮都在 about:blank 里跑：相对路径取模块源码
  //   （页内 `fetch` + 相对 rel）在 about:blank 上无 base 可解析 ⇒ 187 项 `Failed to fetch`、
  //   `location.origin` 读成 `"null"`、`loaded=0`，页面上只报「面板未注入」，看着像产品没装载。
  //   故这里做三件事：① 认 `Page.navigate` 的 `errorText`（导航层失败要立刻抛，不装成就绪）；
  //   ② 轮询时**同时**确认 `location.href` 已经换了文档（不能再是 about:blank）；
  //   ③ 再等 readyState 走到 complete。
  const nav = await this.cdp.send('Page.navigate', { url: url });
  if (nav && nav.errorText) throw new Error('导航失败（' + String(nav.errorText) + '）：' + url);
  const wantHref = url;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 60));
    let probe = null;
    try {
      const rs = await this.cdp.send('Runtime.evaluate', {
        expression: 'String(location.href) + "\\u0000" + String(document.readyState)',
        returnByValue: true,
      });
      probe = rs && rs.result && rs.result.value;
    } catch (e) { probe = null; }
    if (!probe) continue;
    const parts = String(probe).split('\u0000');
    const href = parts[0] || '';
    const state = parts[1] || '';
    // about:blank（或还是空文档）一律不算到位 —— 这正是第一版静默错过的状态。
    if (href === 'about:blank' || href === '') continue;
    const landed = href === wantHref || href === wantHref.replace(/\/$/, '') || href.indexOf(wantHref) === 0;
    if (!landed) continue;
    if (state === 'complete') return { url: href };
  }
  throw new Error('页面未在预算内就绪：' + url);
};
/** 与 Playwright 同形的 evaluate：字符串按表达式求值、函数包成 IIFE 调用，一律 awaitPromise + returnByValue。 */
CdpPage.prototype.evaluate = async function (arg) {
  const expr = (typeof arg === 'function') ? '(' + String(arg) + ')()' : String(arg);
  const r = await this.cdp.send('Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (r && r.exceptionDetails) {
    const d = r.exceptionDetails;
    const t = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'evaluate 抛出';
    throw new Error(String(t).split('\n')[0]);
  }
  return r && r.result ? r.result.value : undefined;
};
/** 内置驱动的 runLive 骨架：与 drivePlaywright 逐步同形（两处读数形状必须逐字可比）。 */
async function driveBuiltin(spec, ctx, out) {
  const cdp = new Cdp(spec.exe, spec.port, spec.extraArgs);
  try {
    await cdp.launch();
    const page = new CdpPage(cdp);
    // 【v2.163.0 取证教训 · 第三条】模态对话框必须自动应答，否则渲染器会被**永久冻死**。
    //   产品面板里的控件会弹 `window.prompt()`（实测命中 `设定世界时间（如「三日目·黄昏」）：`，
    //   由某个时间设定控件触发）。Playwright 的 `page` 默认**自动 dismiss** 所有对话框，所以
    //   npm 驱动路径从来不会撞到这一格；裸 CDP **没有**这个默认行为 —— 对话框一弹，渲染器主线程
    //   即被阻塞，页内 `setTimeout` 停摆、`Runtime.evaluate`（awaitPromise）永不结算，整轮
    //   表现为「CDP 超时：Runtime.evaluate」而页面上 `pageErrors=0`（看起来什么都没坏）。
    //   故这里对齐 Playwright 语义：一律以「取消」应答并继续（不假装用户点了确定，
    //   免得把「取消也走的正常分支」当成被测行为）。命中过的对话框记进 out.dialogs 以便如实登记。
    page.on('dialog', function (d) {
      if (ctx.onDialog) ctx.onDialog(d);
      cdp.send('Page.handleJavaScriptDialog', { accept: false }).catch(function () { /* 已尽力 */ });
    });
    page.on('pageerror', function (e) { ctx.onPageError(e); });
    page.on('console', function (m) { ctx.onConsole(m); });
    await page.route('**/*', ctx.route);
    await page.goto(spec.origin + '/');
    const r = await ctx.afterGoto(page);
    if (out) out.fulfillErrors = cdp.fulfillErrors || 0;
    return r;
  } finally {
    if (out) { out.fulfillErrors = cdp.fulfillErrors || 0; out.routeErrors = cdp.routeErrors || 0; }
    await cdp.close();
  }
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
 *
 * 【v2.163.0 的结构】两种驱动共用一个骨架（**步骤与读数形状逐字同形**）：
 *   · `drivePlaywright` —— npm 驱动在位时的原路径，行为逐字不变（老机器上读数可比）；
 *   · `driveBuiltin`    —— 零依赖内置 CDP。
 * 骨架通过 `ctx` 交给驱动三个回调（onPageError / onConsole / route），装载与观测的**所有
 * 步骤只在骨架里写一次** —— 两处各写一份必然漂移，而漂移的后果是「同一个读数在两种驱动下
 * 显示成不同结论」。
 */
async function runLive(opts) {
  opts = opts || {};
  const p = probe();
  const out = {
    tier: p.tier, available: p.available, driver: p.driver, exe: p.exe, why: p.why,
    driverTried: p.tried || [], host: 'stub', origin: null, files: 0, loaded: 0, failedLoad: [],
    storeError: null, pages: [], controls: 0, readings: [], thrown: [], rejections: [], missingTab: [],
    roundtrip: null, pageErrors: [], consoleErrors: [], fulfillErrors: 0, dialogs: 0, errors: [], probe: null,
    sweepSkipped: false,
    reloadProbe: null, reloadBoot: null, reloadError: null
  };
  if (!p.available) return out;
  const driver = loadDriver();
  const origin = 'http://walive.test';
  const prefix = origin + '/';
  /** 与驱动无关的装载与观测步骤（**只写一次**）。 */
  const afterGoto = async function (page) {
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
    /**
     * v2.186.0 · O1/O9：`opts.skipClick` 跳过「逐页点全部控件」那一段（实测约 2s/轮）。
     *   专锁的页内场景自带点击序列，重扫全面板不增信息；但**跳过即空集**——
     *   故这里显式留痕 `out.sweepSkipped`，且「零抛出」类判据必须由调用方落在
     *   自己那轮真点过的控件上，不许落在扫点的空读数上。
     */
    const clicked = opts.skipClick ? null : await page.evaluate(CLICK_SOURCE);
    out.sweepSkipped = !!opts.skipClick;
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
  /**
   * 页内探测接缝（v2.186.0 · O1）：`opts.probeSource` 是一段**页内表达式源码**，
   *   在本轮（装载 + 点击 + 往返）跑完之后求值一次，返回值收进 `out.probe`。
   *
   * 为什么必须新增这个接缝：本通道此前只能**从外往里看**（数页数 / 控件数 / 读数行 / 抛错），
   *   而 O1 要证的是「模块路径」与 O9 要证的是「出口闸」——两者判的都是**页内运行态**
   *   （某个写口真被拒绝了吗、玩家视角下剪贴板真的没被写吗），外部读数是看不见的。
   *   走 `page.evaluate` 而非新开一条驱动路径：与 afterLoad 同一根接缝，两驱动同形。
   *   生产路径不传该参数，`out.probe` 恒为 null（行为逐字不变）。
   */
  let probeOut = null;
  let probeErr = null;
  if (typeof opts.probeSource === 'string') {
    try { probeOut = await page.evaluate(opts.probeSource); }
    catch (e) { probeErr = String((e && e.message) || e).slice(0, 300); }
    out.probe = (probeOut && typeof probeOut === 'object') ? probeOut : { value: probeOut };
    if (probeErr) out.probeError = probeErr;
  }
  /**
   * 真重载接缝（v2.186.0 · O1）：`opts.reloadProbe` 是一段**页内表达式源码**，在
   *   `page.goto(origin)` 真导航（页内 JS 态与内存态**全部作废**）之后重新装载模块，
   *   再求值一次，返回值收进 `out.reloadProbe`（装载读数收进 `out.reloadBoot`）。
   *
   * 为什么必须新增：O1 的「重载」路径要证的是**盘上状态跨真实导航可复读**，而本通道此前
   *   只有「同一次导航里的读写往返」（roundtrip 面）—— 那不构成重载证据。CdpPage 没有
   *   `page.reload()`，且每次 runLive 都是新 profile（localStorage 不跨会话），
   *   所以只能靠**同 profile 内的第二次 goto**。这里只重跑「装载」这一段，
   *   **不再点控件、不再走往返** —— 否则第二次会话的点击会把要验的读数写花。
   * 生产路径不传该参数 ⇒ 多跑一个分支都不跑，行为逐字不变。
   */
  if (typeof opts.reloadProbe === 'string') {
    try {
      await page.goto(origin + '/');            // 真导航：页内一切都重来
      await page.evaluate(hostStubSource());
      const boot2 = await page.evaluate(bootstrapSource(files, opts.srcOverride || {}));
      out.reloadBoot = { loaded: (boot2 && boot2.loaded || []).length, failed: (boot2 && boot2.failed) || [] };
      const rp = await page.evaluate(opts.reloadProbe);
      out.reloadProbe = (rp && typeof rp === 'object') ? rp : { value: rp };
    } catch (e) {
      out.reloadError = String((e && e.message) || e).slice(0, 300);
    }
  }
  };
  /** 页面用 route.fulfill 从磁盘喂源码：不起 HTTP 服务、不留端口，且**路径相对仓库根**
   *  （换机器/换目录都能跑 —— 与 v2.41.0 成类静态锁同一条纪律：不写死绝对路径）。 */
  const route = function (routeObj) {
    const url = routeObj.request().url();
    if (url === origin + '/' || url === origin) {
      return routeObj.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' });
    }
    const rel = url.indexOf(prefix) === 0 ? url.slice(prefix.length).split('?')[0] : '';
    const safe = rel && rel.indexOf('..') < 0 && rel.indexOf('://') < 0;
    if (!safe) return routeObj.fulfill({ status: 404, body: 'not-relative' });
    let body = null;
    try { body = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { body = null; }
    if (body === null) return routeObj.fulfill({ status: 404, body: 'missing:' + rel });
    const ct = /\.js$/.test(rel) ? 'application/javascript' : (/\.css$/.test(rel) ? 'text/css' : 'text/plain');
    return routeObj.fulfill({ contentType: ct, body: body });
  };
  const ctx = {
    route: route,
    onPageError: function (e) { out.pageErrors.push(String((e && e.message) || e).slice(0, 240)); },
    onConsole: function (m) { if (m && m.type && m.type() === 'error') out.consoleErrors.push(String(m.text()).slice(0, 240)); },
    onDialog: function (d) {
      out.dialogs = (out.dialogs || 0) + 1;
      if (!out.dialogTypes) out.dialogTypes = [];
      if (out.dialogTypes.length < 8) out.dialogTypes.push(String((d && d.type) || ''));
    },
    afterGoto: afterGoto,
  };
  try {
    if (driver.pkg === 'builtin-cdp') {
      out.driverPath = 'builtin-cdp';
      await driveBuiltin({ exe: p.exe, port: await pickPort(), origin: origin }, ctx, out);
    } else {
      out.driverPath = 'npm';
      await drivePlaywright(driver, { exe: p.exe, origin: origin }, ctx);
    }
  } catch (e) {
    out.errors.push('实机通道异常：' + String((e && e.message) || e).slice(0, 400));
  }
  // 驱动的应答失败不许静默：内置驱动把每次 fulfill 失败计数攒在 out.fulfillErrors 上，
  //   非零即意味着「有请求被暂停过但没被喂到」——那会让页面模块整批 load 失败，读数看似
  //   产品缺陷、真因在驱动（v2.163.0 取证踩过：缺 responseCode 时 187 项全 Failed to fetch）。
  if (out.fulfillErrors > 0) {
    out.errors.push('内置驱动应答失败 ' + out.fulfillErrors + ' 次（请求被暂停但未被 fulfill，模块会整批装载失败）');
  }
  if (out.routeErrors > 0) {
    out.errors.push('内置驱动 route 回调抛出 ' + out.routeErrors + ' 次（请求被当作失败处理，页面会整批 load 不到）');
  }
  return out;
}
/**
 * npm 驱动（playwright-core / playwright / puppeteer-core）路径 —— **行为与 v2.137.0 逐字相同**，
 * 只把装载与观测步骤抽到 ctx（骨架本就在 runLive 里写一次，这里不再复制）。
 */
async function drivePlaywright(driver, spec, ctx) {
  const chromium = driver.mod && driver.mod.chromium;
  if (!chromium || typeof chromium.launch !== 'function') {
    throw new Error('驱动 ' + driver.pkg + ' 上没有 chromium.launch（本通道只认 playwright 形态的驱动）');
  }
  const browser = await chromium.launch({
    executablePath: spec.exe,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', function (e) { ctx.onPageError(e); });
    page.on('console', function (m) { ctx.onConsole(m); });
    // Playwright 的 page 默认自动 dismiss 对话框（`dialog` 不监听也照样应答），这里只**计数**，
    //   以便两种驱动的读数可比（`out.dialogs` 是同一口径）。不改变 Playwright 的默认应答行为。
    if (ctx.onDialog) page.on('dialog', function (d) { ctx.onDialog(d); });
    await page.route('**/*', ctx.route);
    await page.goto(spec.origin + '/');
    await ctx.afterGoto(page);
  } finally {
    try { await browser.close(); } catch (e) { /* 已尽力 */ }
  }
}
/** 一行人类可读摘要（run.js 打印用；也供专锁核对字段齐全）。 */
function summarize(r) {
  if (!r) return '（无读数）';
  if (r.tier !== 'full') return 'tier=' + r.tier + '（' + r.why + '）';
  return 'driver=' + r.driver + ' files=' + r.files + ' loaded=' + r.loaded + ' pages=' + r.pages.length
    + ' controls=' + r.controls + ' readings=' + (r.readings ? r.readings.length : 0) + ' thrown=' + r.thrown.length + ' rej=' + r.rejections.length
    + ' pageErr=' + r.pageErrors.length + ' fillErr=' + (r.fulfillErrors || 0) + ' dlg=' + (r.dialogs || 0) + ' roundtrip=' + (r.roundtrip && r.roundtrip.ok ? 'ok' : 'no');
}
module.exports = {
  BASE: BASE,
  CANDIDATE_PKGS: CANDIDATE_PKGS,
  BUILTIN_DRIVER: BUILTIN_DRIVER,
  probe: probe,
  loadDriver: loadDriver,
  enumerateDrivers: enumerateDrivers,
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
