#!/usr/bin/env node
/**
 * WorldAxis tools/log-layers.js (v2.529.0) — OPV29-17 日志分层
 *
 * ── 它治什么（本版现场）──────────────────────────────────
 *   计划原文：「debug/info/用户三档，用户只看到人话」。此前仓里没有这个区分，
 *   于是三件事同时成立却都没人管：① 呈现层（ui/、render/）理论上可以往用户脸上打技术细节；
 *   ② 谁都可以在任意位置打 `e.stack`；③ 「多打一点日志」与「给用户看」是同一件事。
 *
 * ── 本工具的判据（全是可复算的机械口径，不是风格意见）────────────
 *   L1 **用户层零技术输出**：`ui/` 与 `render/` 的 `console.*` 调用点必须为 0。
 *      用户层要说话就走面板文本；把 console 留在呈现层，等于「用户能看到栈」。
 *   L2 **产品面零栈回溯**：产品面（index.js / engines / core / ui / render）里
 *      `console.*(... .stack ...)` 的调用点必须为 0（栈是 debug 档的东西，不是呈现）。
 *   L3 **内部归因读栈必须登记**：确实需要读 `err.stack` 做归因的（如 core/fault-context.js）
 *      逐条登记在 KNOWN_INTERNAL_STACK 里并写明为什么它不是呈现；登记项必须真存在、
 *      真含 `.stack` —— 防「登记了不存在的读者」把判据糊过去。
 *   L4 **debug 可开关**：必须存在至少一处真读开关（devMode / WA_DEBUG / debug 标志）的点。
 *
 * ── 边界（如实登记）──────────────────────────────────
 *   · 逐行正则，不做语法分析：一行里有多条 console 只算该行一次；跨行调用看不到。
 *   · 不判断日志内容是否「人话」——那需要语义，本工具只钉住机械面（谁在打、打不打栈）。
 *
 * ── 用法 ───────────────────────────────────────────
 *   node tools/log-layers.js            # 打印三档读数
 *   node tools/log-layers.js --check    # 判据模式：违反即 rc=1
 *   node tools/log-layers.js --root <dir>   # 对指定根扫描（负控制/沙箱用）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/** 产品面目录（用户层是其中两个）。 */
const PRODUCT_DIRS = ['engines', 'core', 'ui', 'render'];
const USER_DIRS = ['ui', 'render'];
/** L3：内部归因读栈的白名单（每条必须真存在且真含 .stack）。 */
const KNOWN_INTERNAL_STACK = [
  'core/fault-context.js'
];
/** L1 的登记例外：用户层确实必须打 console 的地方（每条必须真存在且真含 console 调用）。 */
const KNOWN_USER_CONSOLE = [
  {
    file: 'ui/panel.js',
    why: '剪贴板不可用时的降级出口：配置包只能走控制台，且面板同时显示「配置包已写入控制台（console）」'
  }
];

const CONSOLE_RE = /console\s*\.\s*(log|error|warn|debug|info)\s*\(/;
const SWITCH_RE = /devMode|WA_DEBUG|__debug\b|debug\s*[:=]\s*true/;

function listJs(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return []; }
  return names.filter(function (f) { return /\.js$/.test(f); }).sort()
    .map(function (f) { return path.join(dir, f); });
}

/** 扫一个根，返回三档读数与违反点。 */
function scan(root) {
  const base = root || ROOT;
  let files = [];
  if (fs.existsSync(path.join(base, 'index.js'))) files.push(path.join(base, 'index.js'));
  PRODUCT_DIRS.forEach(function (d) { files = files.concat(listJs(path.join(base, d))); });
  const rep = {
    tool: 'log-layers', schema: 1, base: base,
    files: 0, userConsole: [], productStack: [], infoConsole: 0, debugConsole: 0,
    switchSites: [], knownPresent: [], knownMissing: [], violations: []
  };
  files.forEach(function (abs) {
    const rel = path.relative(base, abs).split(path.sep).join('/');
    let text = '';
    try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { return; }
    rep.files += 1;
    const isUser = USER_DIRS.some(function (d) { return rel.indexOf(d + '/') === 0; });
    text.split('\n').forEach(function (line, i) {
      if (SWITCH_RE.test(line)) rep.switchSites.push(rel + ':' + (i + 1));
      const m = CONSOLE_RE.exec(line);
      if (m) {
        if (isUser) rep.userConsole.push(rel + ':' + (i + 1));
        if (/\.stack\b/.test(line)) rep.productStack.push(rel + ':' + (i + 1));
        else if (m[1] === 'debug') rep.debugConsole += 1;
        else rep.infoConsole += 1;
      }
    });
  });
  KNOWN_INTERNAL_STACK.forEach(function (rel) {
    const abs = path.join(base, rel);
    let text = '';
    try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { rep.knownMissing.push(rel + '（不存在）'); return; }
    if (text.indexOf('.stack') < 0) rep.knownMissing.push(rel + '（不含 .stack）');
    else rep.knownPresent.push(rel);
  });
  // L1 例外登记：白名单文件必须在用户层真命中 console（否则是幽灵登记）
  const knownUserFiles = {};
  KNOWN_USER_CONSOLE.forEach(function (k) { knownUserFiles[k.file] = true; });
  const userUnregistered = rep.userConsole.filter(function (p) {
    return !knownUserFiles[p.split(':')[0]];
  });
  rep.knownUserPresent = [];
  rep.knownUserMissing = [];
  KNOWN_USER_CONSOLE.forEach(function (k) {
    if (!k.why || String(k.why).length < 10) { rep.knownUserMissing.push(k.file + '（缺 why）'); return; }
    const hits = rep.userConsole.filter(function (p) { return p.split(':')[0] === k.file; });
    if (hits.length) rep.knownUserPresent.push(k.file + '（' + hits.length + ' 处）');
    else rep.knownUserMissing.push(k.file + '（登记了但用户层无 console 命中）');
  });
  if (userUnregistered.length) {
    rep.userConsole = userUnregistered;
    rep.violations.push('用户层 console 调用 ' + userUnregistered.length + ' 处（未登记，应为 0）');
  } else {
    rep.userConsole = [];
  }
  if (rep.knownUserMissing.length) rep.violations.push('用户层 console 登记失实 ' + rep.knownUserMissing.length + ' 项');
  if (rep.productStack.length) rep.violations.push('产品面栈回溯 ' + rep.productStack.length + ' 处（应为 0）');
  if (rep.knownMissing.length) rep.violations.push('内部读栈登记失实 ' + rep.knownMissing.length + ' 项');
  if (!rep.switchSites.length) rep.violations.push('没有 debug 开关读点（debug 档无法开关）');
  rep.ok = rep.violations.length === 0;
  return rep;
}

function main() {
  const argv = process.argv.slice(2);
  const iRoot = argv.indexOf('--root');
  const root = iRoot >= 0 ? argv[iRoot + 1] : null;
  const rep = scan(root);
  console.log('■ 扫描 ' + rep.files + ' 个产品文件 @ ' + rep.base);
  console.log('■ 用户层（ui/render）console：' + rep.userConsole.length + ' 处'
    + (rep.userConsole.length ? ' ⇒ ' + rep.userConsole.slice(0, 6).join(', ') : ''));
  console.log('■ 用户层 console 登记：在册 ' + rep.knownUserPresent.length + ' / 失实 ' + rep.knownUserMissing.length
    + (rep.knownUserPresent.length ? ' ⇒ ' + rep.knownUserPresent.join(', ') : '')
    + (rep.knownUserMissing.length ? ' ⇒ 失实：' + rep.knownUserMissing.join(', ') : ''));
  console.log('■ 产品面栈回溯：' + rep.productStack.length + ' 处'
    + (rep.productStack.length ? ' ⇒ ' + rep.productStack.slice(0, 6).join(', ') : ''));
  console.log('■ 内部归因读栈登记：在册 ' + rep.knownPresent.length + ' / 失实 ' + rep.knownMissing.length
    + (rep.knownMissing.length ? ' ⇒ ' + rep.knownMissing.join(', ') : ''));
  console.log('■ 分档计数：info ' + rep.infoConsole + ' / debug ' + rep.debugConsole);
  console.log('■ debug 开关读点：' + rep.switchSites.length + ' 处'
    + (rep.switchSites.length ? ' ⇒ ' + rep.switchSites.slice(0, 4).join(', ') : ''));
  if (argv.indexOf('--check') >= 0) {
    if (rep.ok) { console.log('■ 结论：PASS（用户层零技术输出 / 产品面零栈回溯 / 开关在册）'); return; }
    rep.violations.forEach(function (v) { console.error('✗ ' + v); });
    console.log('■ 结论：FAIL（' + rep.violations.length + ' 项）');
    process.exitCode = 1;
    return;
  }
  console.log('■ 结论：' + (rep.ok ? '分层口径成立' : '有 ' + rep.violations.length + ' 项违反（--check 会红）'));
}

module.exports = { scan: scan, KNOWN_INTERNAL_STACK: KNOWN_INTERNAL_STACK, KNOWN_USER_CONSOLE: KNOWN_USER_CONSOLE, USER_DIRS: USER_DIRS };
if (require.main === module) main();