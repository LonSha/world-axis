/* ============================================================
 * tests/browser/browser-runner.mjs — 真浏览器运行层（L4）[L4]
 * ------------------------------------------------------------
 * 与无头回归（tests/run.js）的分工：
 *   · 无头层在 vm 上下文里 require 模块，判的是**算法与契约**；
 *   · L4 在真 Chromium 里让宿主用 `<script src>` 装载扩展，判的是**装载链与真 DOM**。
 *   L4 不替换无头层——它补的是无头层结构性够不着的那一格（baseUrl 取不到 /
 *   动态 script 装载失败 / 真 DOM 挂载）。两者结论**分报**，不互相顶替。
 *
 * 浏览器来源：**不引入 npm 依赖**（本仓零依赖，见 README）。按顺序探测：
 *   ① 环境变量 WORLD_AXIS_CHROMIUM（显式覆盖，供有浏览器的机器用）；
 *   ② Playwright 的浏览器缓存（`~/.cache/ms-playwright`，本机实装）。
 * 都没有 ⇒ 返回 `{ available: false, reason }`，调用方**必须如实报「未执行」**，
 *   不得计通过、不得静默跳过（本仓纪律：未执行不报通过）。
 *
 * 驱动方式：Chromium 的 `--dump-dom`（一次性、无长连接）。
 *   ★ 为什么不用 CDP：需要长驻调试端口，而长期后台进程会被环境回收，产生
 *     「浏览器还在跑但驱动已断」的不确定态。`--dump-dom` 是单次前台进程，
 *     退出即结束，读数直接落在 stdout 里，没有可回收的中间态。
 *   场景代码在页内跑完，把结构化读数写进 `<pre id="__result">`，由本模块解析。
 * ============================================================ */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStaticServer } from './static-server.mjs';

const RESULT_ID = '__result';

const CANDIDATE_GLOBS = [
  { kind: 'playwright-cache', dir: path.join(os.homedir(), '.cache', 'ms-playwright'), exe: ['chrome-linux/chrome', 'chrome-linux/headless_shell'] },
];

/** 探测可用浏览器；不做任何安装。 */
export function findBrowser() {
  const explicit = String(process.env.WORLD_AXIS_CHROMIUM || '').trim();
  if (explicit) {
    if (fs.existsSync(explicit)) return { available: true, exe: explicit, source: 'env' };
    return { available: false, reason: `WORLD_AXIS_CHROMIUM 指向的文件不存在：${explicit}` };
  }
  for (const c of CANDIDATE_GLOBS) {
    let names = [];
    try { names = fs.readdirSync(c.dir); } catch (_e) { names = []; }
    // 目录名形如 chromium-1148 / chromium_headless_shell-1148；按数字降序取首个含可执行文件的
    const ordered = names
      .filter((n) => /^chromium/.test(n))
      .sort((a, b) => (parseInt((b.match(/(\d+)$/) || [])[1] || '0', 10) - parseInt((a.match(/(\d+)$/) || [])[1] || '0', 10)));
    for (const n of ordered) {
      for (const rel of c.exe) {
        const p = path.join(c.dir, n, rel);
        if (fs.existsSync(p)) return { available: true, exe: p, source: `${c.kind}:${n}` };
      }
    }
  }
  return { available: false, reason: '未找到 Chromium（既无 WORLD_AXIS_CHROMIUM，也无 Playwright 缓存）' };
}

/** 读取浏览器版本（不启动页面，只打印 --version）。 */
export async function browserVersion(exe) {
  return new Promise((resolve) => {
    const c = spawn(exe, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { out += d; });
    c.on('exit', () => resolve(out.trim().split('\n')[0] || 'unknown'));
    c.on('error', () => resolve('unknown'));
  });
}

/**
 * 用 Node 自己的 ESM 解析器给场景体做语法体检，返回错误摘要或 null。
 * 为什么用 `node --input-type=module --check` 而不是 `new Function()`：
 *   `new Function` 是 **CommonJS/脚本**解析面，`import` 声明在它那里必然报错——
 *   真语法错误与「用了 import」在它眼里同形。
 */
function checkScenarioSyntax(code) {
  try {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], {
      input: code, encoding: 'utf8', timeout: 20000,
    });
    if (r.status === 0) return null;
    const text = String(r.stderr || '').split('\n').filter((l) => l && !l.startsWith('    at ')).slice(0, 4).join(' | ');
    return text || 'unknown syntax error';
  } catch (e) {
    return 'syntax probe failed: ' + String((e && e.message) || e);
  }
}

/**
 * HTML 实体还原（`--dump-dom` 交回来的文本是 HTML 序列化过的）。
 * 顺序要紧：`&amp;` 必须**最后**替换，否则 `&amp;lt;` 会被先拆成 `&lt;`，
 * 再被当成 `<` —— 读数是 JSON，里头的 `<` 会就此变成语法错误。
 */
function decodeEntities(s) {
  // 引号实体的字面量在这里**不能**写成 /"/ —— 工具链的转义会吃掉它。
  //   改由字符码拼装，绕开转义。
  const Q = String.fromCharCode(38) + 'quot;';
  const A = String.fromCharCode(38) + 'amp;';
  return String(s)
    .split('&lt;').join('<')
    .split('&gt;').join('>')
    .split(Q).join(String.fromCharCode(34))
    .split('&#0*39;').join("'")
    .split('&#39;').join("'")
    .split(A).join(String.fromCharCode(38));
}

/**
 * 跑一个浏览器场景。
 * @param {{root:string, scenarios?:string[]|string, body?:string, styles?:string[],
 *          viewport?:{width:number,height:number}, budgetMs?:number, timeoutMs?:number,
 *          browser?:object}} opts
 *   `scenarios` 是场景文件（相对 root 或绝对路径；见 tests/browser/scenarios/）；
 *   `body` 是临时内联场景，探针用。场景体运行在页面里，可用全局：
 *     `report(obj)`        —— 记一条读数（可多次调用）
 *     `done()`             —— 场景结束（不调也按预算收尾，已记读数照样带出）
 *     `window.__sleep(ms)` —— 真等
 *   宿主桩由**场景自己**安装（`import { installHostStub } from '../host-stub.mjs'`）——
 *     不能由本模块代装：真宿主里扩展脚本也是先装载、后收到 APP_READY，
 *     中间的先后顺序本身就是要判的东西，代装会把这段顺序藏起来。
 *   页面还预置了 `<pre id="__result">`；本模块把 `report` 的读数解析回来。
 * @returns {Promise<{executed:boolean, reason?:string, reports:Array<{name:string,ok:unknown,detail:string}>,
 *                    served:string[], browser:string, stderr:string, timedOut:boolean, pageRan:boolean}>}
 */
export async function runScenario(opts = {}) {
  const root = path.resolve(String(opts.root || process.cwd()));
  const browser = opts.browser || findBrowser();
  if (!browser.available) {
    return { executed: false, reason: browser.reason, reports: [], served: [], browser: '', stderr: '', timedOut: false, pageRan: false };
  }
  const vp = opts.viewport || { width: 390, height: 844 };
  const budgetMs = Number(opts.budgetMs || 20000);
  const timeoutMs = Number(opts.timeoutMs || 180000);
  const version = await browserVersion(browser.exe);
  const fileList = Array.isArray(opts.scenarios) ? opts.scenarios : (opts.scenarios ? [opts.scenarios] : []);

  /* 场景体要包在 try/catch 里（否则一处抛错会让后面的读数全丢，读起来像「什么都没发生」）。
   * 但 **`import` 声明不能出现在块里** —— 把场景文件原样塞进 `try { }`，整段模块直接
   * 语法错误、页内 0 条读数、进程 exit 0、stderr 只有噪声 —— 也就是「跑完了，没报错，
   * 什么都没测」。所以这里把场景文件顶部的静态 import 行**提到 try 外**（ESM 的 import
   * 本就被提升，提到外面语义不变），其余照旧包起来。 */
  const hoisted = [];
  const wrapped = [];
  for (const f of fileList) {
    const abs = path.isAbsolute(f) ? f : path.join(root, f);
    const text = fs.readFileSync(abs, 'utf8');
    const kept = [];
    for (const line of text.split('\n')) {
      if (/^\s*import\s/.test(line)) hoisted.push(line); else kept.push(line);
    }
    wrapped.push('/* ==== 场景文件：' + path.relative(root, abs) + ' ==== */\n' + kept.join('\n'));
  }
  /* 两份产物分开带出去：`imports` 必须在 `<script>` 顶层，`body` 才包进 try。 */
  const scenarioImports = hoisted.join('\n');
  const scenarioBody = wrapped.join('\n') + (opts.body || '');
  const links = (opts.styles || []).map((h) => '<link rel="stylesheet" href="' + h + '">').join('\n');

  /* 起浏览器**之前**先把场景体过一遍 ESM 语法。
   *   场景体一旦有语法错误，浏览器侧的表现是「进程 exit 0、stderr 只有噪声、页内 0 条
   *   读数」—— 与「跑完了且确实没发现问题」在读数上**完全同形**。语法能在起进程前判定，
   *   就必须在起进程前判，且判定为坏时**如实报未执行**，不许当成 0 读数带出去。 */
  const syntaxErr = checkScenarioSyntax(scenarioImports + '\n' + scenarioBody);
  if (syntaxErr) {
    return {
      executed: false, reason: 'scenario 体 ESM 语法错误：' + syntaxErr,
      reports: [], served: [], browser: version, stderr: '', timedOut: false, pageRan: false,
    };
  }

  const page = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=${vp.width}, initial-scale=1">
${links}
<style>html,body{margin:0;padding:0;background:#fff} #__stage{width:${vp.width}px;min-height:${vp.height}px;position:relative}</style>
</head>
<body>
<div id="__stage"></div>
<pre id="${RESULT_ID}">{"reports":[],"scriptRan":false}</pre>
<script type="module">
const REPORTS = [];
window.report = (obj) => { REPORTS.push(obj == null ? null : JSON.parse(JSON.stringify(obj))); flush(); };
window.done = () => { flush(); };
function flush() {
  try { document.getElementById(${JSON.stringify(RESULT_ID)}).textContent = JSON.stringify({ reports: REPORTS, scriptRan: true }); } catch (_e) { /* 忽略 */ }
}
window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.addEventListener('error', (e) => window.report({ name: 'window-error', ok: false, detail: String((e && e.message) || '') }));
window.addEventListener('unhandledrejection', (e) => window.report({ name: 'unhandled-rejection', ok: false, detail: String((e && e.reason && e.reason.message) || (e && e.reason) || '') }));
/* 静态 import 只能待在模块顶层（放进块里 = 语法错误 = 整个模块不执行）。 */
${scenarioImports}
try {
${scenarioBody}
} catch (err) {
  window.report({ name: 'scenario-threw', ok: false, detail: String((err && err.message) || err) });
}
flush();
</script>
</body></html>`;

  const srv = await startStaticServer({ root, fixture: page });
  try {
    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      `--window-size=${vp.width},${vp.height}`,
      `--virtual-time-budget=${budgetMs}`,
      '--dump-dom',
      `${srv.origin}/`,
    ];
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    await new Promise((resolve) => {
      const child = spawn(browser.exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGKILL'); } catch (_e) { /* 忽略 */ }
      }, timeoutMs);
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('exit', () => { clearTimeout(timer); resolve(); });
      child.on('error', () => { clearTimeout(timer); resolve(); });
    });
    let reports = [];
    let scriptRan = false;
    const m = stdout.match(new RegExp('<pre id="' + RESULT_ID + '">([\\s\\S]*?)</pre>'));
    if (m) {
      try {
        const parsed = JSON.parse(decodeEntities(m[1]));
        reports = Array.isArray(parsed && parsed.reports) ? parsed.reports : [];
        scriptRan = !!(parsed && parsed.scriptRan);
      } catch (_e) { reports = []; scriptRan = false; }
    }
    if (m && !scriptRan) {
      // 页内脚本**根本没跑**（模块解析失败 / 提前抛错），此时「0 条读数」不代表「没问题」。
      //   这一态必须显式报未执行。
      return {
        executed: false, reason: '页内场景脚本未执行（模块解析失败或提前抛错）',
        reports: [], served: [], browser: version, stderr: stderr.slice(-4000),
        timedOut, pageRan: false,
      };
    }
    return {
      executed: true,
      reports,
      served: srv.served.slice(),
      browser: version,
      stderr: stderr.slice(-4000),
      timedOut,
      /** 区分「页面根本没跑起来」与「跑了但零读数」：两者都空读数，但含义相反。 */
      pageRan: scriptRan,
    };
  } finally {
    await srv.close();
  }
}

/* ---------- 报表器（供驱动脚本共用；不在这里断言，只把读数打成人类可读的形） ----------
 * 为什么放在库文件里：多个驱动脚本各抄一份格式化代码必然漂移，而漂移的后果是
 *   「同一个读数在两个脚本里显示成不同结论」。判据在各场景文件里，格式化只做展示。 */
export function printReports(r, label = '') {
  console.log(`${label} executed=${r.executed} pageRan=${r.pageRan} browser=${r.browser} timedOut=${r.timedOut}`);
  if (!r.executed) { console.log('  未执行（不得计通过）：' + r.reason); return { pass: 0, fail: 1, total: 1 }; }
  let pass = 0;
  let fail = 0;
  for (const x of r.reports) {
    const ok = !!(x && x.ok);
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? '  OK   ' : '  FAIL '}${x && x.name} | ${String((x && x.detail) || '').slice(0, 220)}`);
  }
  console.log(`  -- ${pass} ok / ${fail} fail / ${r.reports.length} 条读数`);
  return { pass, fail, total: r.reports.length };
}