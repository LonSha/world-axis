// WorldAxis tests/gate-timeout-v2105.js (v2.105.0, 计划一 #3) — 门禁超时熔断专锁
//
// 四段结构（与仓库既有专锁同规）：
//   A 静态面：取值面形状、**run.js 现场逐站点核对**（主交付）、判据纯度
//   B 运行时：真硬件读数（墙钟 vs 预算）、末 N 行取证块、形态分档、零未武装调用点
//   C 不变式：连读两次同结论、不写盘、观测不改变被观测对象
//   N 负控制：真源码改字节 → 装载破坏副本 → 在副本上重跑**同款**真判据
//
// 【本锁自测期连撞的四类「自己身上的」缺陷——全是它要治的那族病】
//   D1 定位口径：初版拿模块里的 key（`'negative-probe-broken'` 之类）去 run.js 定位站点，
//      而那些 key **只活在模块里**，run.js 一个字都没有 ⇒ 十处全报 site-missing、判据从第一天起恒假。
//      正解：用 run.js **现场唯一**的调用行行首片段作锚点，且**逐站点**判断
//      （「别处还有 timeout」不构成该站点已武装 —— N1b 专门证明全局存在性口径会漏报）。
//   D2 破坏不彻底：`str.replace(a, b)` 在 JS 里只替换**第一处**，于是「10 处预算全改成 10ms」
//      实际只改了 1 处，区间判据只现形 1 条 ⇒ 断言恒假。正解：用 split/join 或带 g 的正则，
//      并在断言里把「破坏是否真的发生」也数出来。
//   D3 标签依赖（补进模块 coherence 的客观规则）：原先「外部命令要另有 shell 保险丝」看的是
//      `mode === 'spawn+shell'` 这个**标签**，把标签抹平判断就无声逃逸；而模块头自己写着
//      「口径是行为读数，不是字形比对」。正解：看**客观形态**（命令串里有没有管道）。
//   D4 观察位取窗口：locateOptions 必须在**调用点之后的整个块**里取 options，不能只看固定几行——
//      本仓三个调用点带跨行注释，options 落在调用行之后第 11~12 行。取窗口的判据会在真源码上假红。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/gate-timeout-v2105.js';
const MOD_REL = 'tests/gate-timeout.js';
const RUN_REL = 'tests/run.js';
const SELF_ABS = path.join(BASE, SELF_REL);
const RUN_ABS = path.join(BASE, RUN_REL);
const gt = require('./gate-timeout.js');

const BUDGET_MIN = 60000;      // 预算下限：不许紧贴实测（最重门禁 12000ms 的 5 倍）
const BUDGET_MAX = 300000;     // 预算上限：不许大到等于没有超时
const FUSE_MIN = 60;           // shell 保险丝下限（秒）
const FUSE_MAX = 3600;         // shell 保险丝上限（秒）

function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function selfSrc() { return fs.readFileSync(SELF_ABS, 'utf8'); }

/** 恰中 1 次的替换工具（锚点不唯一即抛，禁止「改到别处」） */
function must1(s, x, tag) {
  const n = s.split(x).length - 1;
  if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag);
  return n;
}

/** 装载破坏副本：同一份源码、同一入口，只换 __dirname（不写盘） */
function loadBroken(src, dirname) {
  const mod = { exports: {} };
  const sandbox = {
    module: mod, exports: mod.exports, require: require, console: console,
    __dirname: dirname || __dirname, __filename: 'broken-gate-timeout.js',
    process: process, Buffer: Buffer
  };
  vm.runInNewContext(src, sandbox, { filename: 'broken-gate-timeout.js' });
  return mod.exports;
}

// ── 统一形态锚点。**必须单行、且不含换行以外的转义**：审计侧的纯度口径是
//    `hits(锁源码, 锚点.replace(/\n/g,'\\n')) === 1` —— 用 \n 拼接的多行锚点在锁源码里是
//    转义形态而非真换行，必然 0 命中 ⇒ 判 impure。本锁首跑就在此处栽过一次（A11 的 armed，
//    那行还是**改动前**的模块文本，patch D 之后早已不存在）。
const MEASURED_TXT = "  spawnMs: 96000,";
const RATIOS_TXT = "const RATIOS = { spawn: 8, inline: 4, heavy: 4 };";
const ARMED_TXT = "  let armed = 0;";
const ANCHORS = {
  MEASURED: { rel: MOD_REL, txt: MEASURED_TXT },
  RATIOS: { rel: MOD_REL, txt: RATIOS_TXT },
  ARMED: { rel: MOD_REL, txt: ARMED_TXT }
};
// ── 破坏形态（一律「条件置假」：把预算改小、把计数改错，而不是删掉判据本身）──
const BREAK_HEAD = "  spawnMs: 1,";
const BREAK_ARMED = "  let armed = -10;";

/** run.js 现场逐站点核对（主判据；正控与负控共用同一份实现） */
function locateOptions(block, name) {
  const lines = String(block.text).split('\n');
  const re = /(?:^|[^\w])timeout: (\d+)/;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(re);
    if (m) return { line: block.line + i, ms: Number(m[1]), text: lines[i] };
  }
  return null;
}

function checkArmedSites(src) {
  const problems = [];
  const lines = String(src).split('\n');
  gt.ARMED_SITES.forEach(function (s) {
    const at = lines.findIndex(function (l) { return l.indexOf(s.anchor) >= 0; });
    if (at < 0) { problems.push({ key: s.key, kind: 'site-missing', signature: s.anchor.slice(0, 46) }); return; }
    const again = lines.slice(at + 1).findIndex(function (l) { return l.indexOf(s.anchor) >= 0; });
    if (again >= 0) { problems.push({ key: s.key, kind: 'site-ambiguous', signature: s.anchor.slice(0, 46) }); return; }
    const blocks = gt.parseCallBlocks(src).filter(function (b) { return b.line === at + 1; });
    if (!blocks.length) { problems.push({ key: s.key, kind: 'not-a-call-site', signature: s.anchor.slice(0, 46) }); return; }
    const own = blocks[0];
    const opt = locateOptions(own, s.key);
    if (!opt) { problems.push({ key: s.key, kind: 'no-timeout', detail: '该站点整段没有 timeout（病根复发）' }); return; }
    const want = gt.GATE_TIMEOUTS.spawnMs;
    if (opt.ms !== want) { problems.push({ key: s.key, kind: 'value-mismatch', detail: '现场 ' + opt.ms + 'ms ≠ 统一预算 ' + want + 'ms' }); }
    if (s.kill) {
      if (own.text.indexOf('killSignal') < 0 || own.text.indexOf('SIGKILL') < 0) {
        problems.push({ key: s.key, kind: 'kill-signal-missing', detail: '该站点未给 SIGKILL —— 子进程可以忽略 SIGTERM' });
      }
    }
    if (s.pipe && !(s.shellFuse > 0)) {
      problems.push({ key: s.key, kind: 'pipe-site-without-fuse' });
    }
    if (s.shellFuse) {
      const f = gt.GATE_TIMEOUTS.shellMs;
      if (own.text.indexOf('-k ') < 0 || own.text.indexOf(String(f) + ' tar') < 0) {
        problems.push({ key: s.key, kind: 'shell-fuse-missing', detail: '管道形态必须是 `timeout -k <grace> ' + f + ' tar`（缺 -k 只杀写端、读端照挂）' });
      }
    }
  });
  return problems;
}

/** 现场逐站点读数（供正控与打印）：站点数、预算逐站点取到没取到 */
function siteReadings(src) {
  const out = [];
  gt.ARMED_SITES.forEach(function (s) {
    const b = gt.findSiteBlock(src, s.anchor);
    if (!b) { out.push({ key: s.key, found: false }); return; }
    const opt = locateOptions(b, s.key);
    out.push({ key: s.key, found: true, line: b.line, span: b.span, ms: opt ? opt.ms : null });
  });
  return out;
}

function runAll(a) {
  // ══════════ A. 静态面 ══════════
  const api = ['SELF_REL', 'RATIOS', 'GATE_TIMEOUTS', 'TIMEOUT_ARMED', 'GATES', 'buildTable', 'limitsOf',
    'coherence', 'coherenceSummary', 'spawnOptsFor', 'runTable', 'withTimeout', 'tailLines', 'formatHangBlock',
    'modeCounts', 'summary', 'discover', 'ARMED_SITES', 'RUN_REL', 'stripLiterals', 'parseCallBlocks',
    'findSiteBlock', 'siteStats'];
  const missing = api.filter(function (k) { return gt[k] === undefined; });
  a(missing.length === 0, 'A1 取值面导出齐备（缺的：' + (missing.join(',') || '无') + '）');

  const d = gt.discover();
  a(d.armedCount === gt.ARMED_SITES.length && d.armedCount >= 8,
    'A2 武装表 = 现场站点清单（' + d.armedCount + ' vs ' + gt.ARMED_SITES.length + '）');
  a(d.limits.spawnMs === 96000 && d.limits.shellMs === 240,
    'A3 统一预算 = 最重门禁实测 12000ms × 8 = 96000ms（实 ' + d.limits.spawnMs + '），shell 保险丝 ' + d.limits.shellMs + 's');
  a(gt.GATE_TIMEOUTS.spawnMs === 96000,
    'A4 单一真源：现场所有调用点只读一个预算（' + gt.GATE_TIMEOUTS.spawnMs + 'ms）——留第二档就是留一处会漂移的地方');
  a(d.coherence.length === 0, 'A5 自洽：' + d.coherenceSummary);
  a(d.siteStats.sites === 10 && d.siteStats.armedSites === 10 && d.siteStats.budget === 10,
    'A6 现场读数 调用点/武装点/预算处 = ' + d.siteStats.sites + '/' + d.siteStats.armedSites + '/' + d.siteStats.budget
    + '（三者相等才叫「10 个调用点一个不漏」）');
  a(typeof d.summary === 'string' && d.summary.indexOf('全部有 timeout') >= 0,
    'A7 汇总口径自述：「' + d.summary.slice(0, 46) + '…」');

  const runSrc = srcOf(RUN_REL);
  const p = checkArmedSites(runSrc);
  a(p.length === 0, 'A8 run.js 逐站点现场核对零问题（' + gt.ARMED_SITES.length + ' 站点；问题 ' + p.length + ' 条'
    + (p.length ? ' :: ' + JSON.stringify(p) : '') + '）');
  const rd = siteReadings(runSrc);
  a(rd.every(function (r) { return r.found && r.ms === gt.GATE_TIMEOUTS.spawnMs; }),
    'A9 逐站点都能取到整段 options 与统一预算（取不到的：' + JSON.stringify(rd.filter(function (r) { return !r.found || r.ms !== 96000; })) + '）');
  a(rd.every(function (r) { return r.span >= 1; }) &&
    rd.every(function (r) { return r.line >= 14790 && r.line <= 18792; }),
    'A10 站点行号落在真实调用点范围内（' + rd.map(function (r) { return r.line; }).join(',') + '）');

  // 判据纯度（H5：负控代码块内锚点字面量只准声明一次，判据不得引用锚点串）
  const self = selfSrc();
  a(must1(srcOf(MOD_REL), MEASURED_TXT, 'measured') === 1 &&
    must1(srcOf(MOD_REL), RATIOS_TXT, 'ratios') === 1 &&
    must1(srcOf(MOD_REL), ARMED_TXT, 'armed') === 1,
    'A11 三条统一锚点在目标文件各恰中 1 次（唯一性在开工前就成立）');
  a(self.split('ANCHORS').length - 1 >= 1 && gt.GATE_TIMEOUTS.spawnMs === 96000,
    'A12 锚点表由本文件声明（ANCHORS 登记 3 条：' + Object.keys(ANCHORS).join('/') + '）');

  a(rd.length === gt.ARMED_SITES.length && gt.ARMED_SITES.length === Object.keys(gt.TIMEOUT_ARMED).length,
    'A13 站点清单与武装表数量一致（' + gt.ARMED_SITES.length + ' vs ' + Object.keys(gt.TIMEOUT_ARMED).length + '）——两张表各说一套时，逐站点核对与「入表了却没人核」会同时发生');
  const mc = gt.modeCounts();
  a(mc.spawn >= 6 && mc['spawn+shell'] === 1 && mc['spawn-only'] === 1,
    'A14 三档形态齐备（' + JSON.stringify(mc) + '）——外部命令形态不许被静默抹平成普通 spawn');
  a(gt.coherence().every(function (x) { return x.kind !== 'pipe-site-without-fuse'; }) &&
    JSON.stringify(gt.ARMED_SITES.filter(function (s) { return s.pipe; })) !== '[]',
    'A15 管道形态有客观记录（含管道的站点数 ' + gt.ARMED_SITES.filter(function (s) { return s.pipe; }).length + '）');
  // A16 判据在空集上不许恒真
  a(checkArmedSites('').length === gt.ARMED_SITES.length,
    'A16 空源码 ⇒ 全站点 site-missing（判据不在空集上恒真）');

  // ══════════ B. 运行时 ══════════
  a(gt.limitsOf().inlineMs === 10800, 'B1 同进程探针上限 inline = 2700ms × 4 = 10800ms（实 ' + gt.limitsOf().inlineMs + '）');
  const ok = gt.withTimeout(function () { return 1; }, 200, 'ok');
  a(ok.ok === true && ok.timedOut === false, 'B2 withTimeout 对正常 fn 通过（实 ' + ok.ms + 'ms）');
  const slow = gt.withTimeout(function () { const t = Date.now(); while (Date.now() - t < 30) {} return 0; }, 1, 'slow');
  a(slow.ok === false && slow.timedOut === true && slow.ms >= 30, 'B3 withTimeout 对超时 fn 判超时（实 ' + slow.ms + 'ms > 1ms）——判据是真谓词');
  const threw = gt.withTimeout(function () { throw new Error('boom'); }, 200, 'threw');
  a(threw.ok === false && threw.timedOut === false && /boom/.test(threw.error), 'B4 fn 抛错如实记档（不许冒充超时）：' + threw.error);

  // 【末 20 行必须是「真被截过」的末 20 行】输入 100 行 ⇒ 「末行在内、首行不在」才同时成立。
  //   本锁首跑用 79 行输入、却断言「| line0 不在」——79 行本来就全在末 20 行之外，
  //   那条断言在 79 行输入上恒假（是判据口径错，不是实现错）。
  const manyLines = Array.apply(null, { length: 100 }).map(function (x, i) { return 'line' + i; }).join('\n');
  const block = gt.formatHangBlock({
    key: 'dead-export-gate', limit: 96000, ms: 96000 + 1234, signal: 'SIGKILL', errorCode: 'ETIMEDOUT',
    argv: ['tests/dead-export-gate.js', '--json'], stdout: manyLines, tail: 20
  });
  a(block.indexOf('dead-export-gate') >= 0, 'B5 取证块点名「哪一道门禁」');
  a(block.indexOf('超 1234ms') >= 0 && block.indexOf('SIGKILL') >= 0 && block.indexOf('ETIMEDOUT') >= 0,
    'B6 取证块交代超了多少 + 终止信号（现状只留一行 runner-failed 时，这三件事全丢）');
  a(block.indexOf('末 20 行 stdout') >= 0 && block.indexOf('| line99') >= 0 && block.indexOf('| line0') < 0,
    'B7 取证块含「真被截过」的末 20 行（输入 100 行 ⇒ 末行 line99 在内、line0 不在；实 ' + block.split('\n').length + ' 行）');
  const emptyBlock = gt.formatHangBlock({ key: 'x', limit: 10, ms: 11, stdout: '' });
  a(emptyBlock.indexOf('（空 —— 子进程在被杀前没有输出）') >= 0, 'B8 子进程零输出时如实说「空」，不伪造末行');
  a(gt.tailLines('', 5).length === 0 && gt.tailLines('a', 5).length === 1 && gt.tailLines('a\nb', 5).length === 2,
    'B9 tailLines 空输入返回 []（不是 [\'\']）、短输入不补空行');
  a(gt.siteStats('').sites === 0 && gt.siteStats('').budget === 0,
    'B10 空源码的现场读数全 0（配 N10 一起看：病根可被读数抓到）');
  a(rd.every(function (r) { return r.ms === 96000; }), 'B11 现场每处调用点的预算都是统一真源值（10/10）');
  a(gt.stripLiterals("a('x(y', z) // )") === 'a("", z) ',
    'B12 剥字面量/注释的解析器是真谓词（实 ' + JSON.stringify(gt.stripLiterals("a('x(y', z) // )")) + '）——括号平衡只看代码面');
  a(gt.parseCallBlocks(runSrc).length === 10 && gt.findSiteBlock(runSrc, 'const rI2840 = cp2840.spawnSync').span === 2,
    'B13 括号平衡切块在真源码上成立（10 块；跨行块 span=2）');

  // ══════════ C. 不变式 ══════════
  const runBefore = srcOf(RUN_REL);
  const selfBefore = selfSrc();
  const mdBefore = fs.statSync(RUN_ABS).mtimeMs;
  gt.discover(); checkArmedSites(runBefore);
  a(srcOf(RUN_REL) === runBefore && selfSrc() === selfBefore && fs.statSync(RUN_ABS).mtimeMs === mdBefore,
    'C1 整轮判据跑完不写任何文件、不改 mtime（取证不得改变被取证对象）');
  a(JSON.stringify(gt.siteStats(runBefore)) === JSON.stringify(gt.siteStats(srcOf(RUN_REL))),
    'C2 连读两次现场读数一致（观测不改变被观测对象）');

  runNegative(a, runSrc, d);
}

/** 负控制：真源码改字节 → 装载破坏副本 → 在副本上重跑**同款**真判据 */
function runNegative(a, runSrc, d) {
  const modSrc = srcOf(MOD_REL);

  // N0 must1 两向自证：不存在 / 不唯一都必须抛
  let e0 = null; try { must1(modSrc, 'ANCHOR-NOT-IN-SOURCE-2105', 'n0'); } catch (e) { e0 = e.message; }
  a(/hits != 1 \(0\)/.test(String(e0)), 'N0a must1 对不存在的锚点抛错（实 ' + e0 + '）');
  let e0b = null; try { must1(modSrc, 'const ', 'n0b'); } catch (e) { e0b = e.message; }
  a(/hits != 1 \((?!1\))\d+\)/.test(String(e0b)), 'N0b must1 对不唯一的锚点抛错（实 ' + e0b + '）');

  // N1 拆掉一处现场的 timeout ⇒ 逐站点核对器必须现形（**只有那一处**）
  const n1Src = runSrc.split("timeout: 96000, killSignal: 'SIGKILL' });\n      rc2700")
    .join("});\n      rc2700");
  a(n1Src !== runSrc, 'N1 破坏锚点恰中 1 次（拆掉第一处 timeout —— split/join 全量替换，不吃 str.replace 只替换一次的亏）');
  const n1 = checkArmedSites(n1Src);
  a(n1.length === 1 && n1[0].kind === 'no-timeout' && n1[0].key === 'negative-probe-broken',
    'N1 拆一处武装 ⇒ 逐站点核对器只报那一处（实 ' + JSON.stringify(n1) + '）——判据非恒真且非误报');
  a(checkArmedSites(runSrc).length === 0, 'N1 对照——原版同判据零问题');

  // N1b **全局存在性**口径会漏报（这就是初版判据的病）：别处仍有 timeout，但该站点已被拆
  const n1b = n1Src;
  a(String(n1b).indexOf('timeout: 96000') >= 0 && checkArmedSites(n1b).length === 1,
    'N1b 别处仍有 timeout 时逐站点判据照样现形（全局存在性口径会漏报，故本锁不用它）');

  // N2 预算紧贴实测 / 大到等于没有超时 ⇒ 现场逐站点核对器两向现形（10 处都要现形）
  const n2Src = runSrc.split('timeout: 96000').join('timeout: 10');
  const n2 = checkArmedSites(n2Src);
  a(n2.length === 10 && n2.every(function (x) { return x.kind === 'value-mismatch'; }),
    'N2 预算改成 10ms ⇒ 10 处逐站点全部现形（实 ' + n2.length + ' 条 value-mismatch）');
  const n2bSrc = runSrc.split('timeout: 96000').join('timeout: 9999999');
  const n2b = checkArmedSites(n2bSrc);
  a(n2b.length === 10 && n2b.every(function (x) { return x.kind === 'value-mismatch'; }),
    'N2b 预算改成 9999999ms ⇒ 同样 10 处现形（实 ' + n2b.length + ' 条）——两向都不是恒真');

  // N3 破坏副本模块：预算改成 1ms ⇒ 同款自洽判据给出不同答案
  must1(modSrc, MEASURED_TXT, 'n3');
  const b3src = modSrc.replace(MEASURED_TXT, BREAK_HEAD);
  a(b3src !== modSrc, 'N3 破坏锚点恰中 1 次（预算 96000 → 1）');
  const b3 = loadBroken(b3src);
  a(b3.GATE_TIMEOUTS.spawnMs === 1 && b3.coherence().some(function (x) { return x.kind === 'two-spawn-budgets'; }),
    'N3 预算紧贴实测 ⇒ 自洽判据现形（' + JSON.stringify(b3.coherence().slice(0, 1)) + '）——正是本版第一次落盘的真实缺陷（90000/96000）');
  a(gt.coherence().length === 0, 'N3 对照——原版自洽');

  // N4 抹平管道形态（只改 mode + 去掉 fuse）⇒ 客观的管道规则必须现形
  const pipeAnchor = "'tar-copy', mode: 'spawn+shell', shellFuse: 240, pipe: true,";
  must1(modSrc, pipeAnchor, 'n4');
  const b4src = modSrc.replace(pipeAnchor, "'tar-copy', mode: 'spawn', pipe: true,");
  const b4 = loadBroken(b4src);
  a(b4.coherence().some(function (x) { return x.kind === 'pipe-site-without-fuse'; }),
    'N4 抹平形态标签 ⇒ **客观管道规则**照样现形（' + JSON.stringify(b4.coherence().filter(function (x) { return x.kind === 'pipe-site-without-fuse'; }).slice(0, 1)) + '）'
    + ' —— 只靠 mode 标签判断时，这一抹平会无声逃逸（D3）');

  // N4b 外部命令 + 管道而**没**保险丝 ⇒ 站点侧同款判据也现形
  const n4bSrc = runSrc.split("'timeout -k 5 240 tar --exclude=.git -cf - . | (cd '").join("'tar --exclude=.git -cf - . | (cd '");
  a(n4bSrc !== runSrc, 'N4b 破坏锚点恰中 1 次（拆掉 shell 侧的 timeout 包装）');
  const n4b = checkArmedSites(n4bSrc);
  a(n4b.some(function (x) { return x.kind === 'shell-fuse-missing' && x.key === 'tar-copy'; }),
    'N4b 管道站点没有 `timeout -k <grace> <secs> tar` ⇒ 逐站点核对器现形（实 ' + JSON.stringify(n4b) + '）');

  // N5 拆掉 `-k` ⇒ 「只有 SIGKILL、没有宽限」同样现形（管道形态的真实边界）
  const n5Src = runSrc.split('timeout -k 5 240 tar').join('timeout 5 240 tar');
  const n5 = checkArmedSites(n5Src);
  a(n5Src !== runSrc && n5.some(function (x) { return x.kind === 'shell-fuse-missing'; }),
    'N5 拆掉 -k ⇒ 形态判据现形 —— 管道里只有 SIGKILL 不足以让读端放手');

  // N6 换 __dirname 的副本仍给出同一预算（判据不靠硬编码路径活着）
  const b6 = loadBroken(modSrc, path.join(BASE, 'tests'));
  a(typeof b6.discover === 'function' && b6.GATE_TIMEOUTS.spawnMs === 96000,
    'N6 换 __dirname 的副本仍给出同一预算（判据不靠硬编码路径）');

  // N7 现场「武装计数」改错 ⇒ 同款现场读数立刻给出不同答案（破坏真的改到了行为，不是对原文件断言）
  must1(modSrc, ARMED_TXT, 'n7');
  const b7 = loadBroken(modSrc.replace(ARMED_TXT, BREAK_ARMED));
  const st7 = b7.siteStats(srcOf(RUN_REL));
  a(st7.armedSites === 0 && gt.siteStats(srcOf(RUN_REL)).armedSites === 10,
    'N7 把现场武装计数起点改错（10 → -10）⇒ 读数当场变 0（破坏副本 ' + st7.armedSites + ' / 原版 ' + gt.siteStats(srcOf(RUN_REL)).armedSites + '）'
    + ' —— 判据读的是真实行为，不是它自己声明的常量');

  // N8 withTimeout 的能力边界如实（非函数 / 非正超时都必须抛，不许静默通过）
  let e8 = null; try { gt.withTimeout({}, 10, 'x'); } catch (e) { e8 = e.message; }
  a(/必须是函数/.test(String(e8)), 'N8a withTimeout 对非函数抛错（实 ' + e8 + '）');
  let e8b = null; try { gt.withTimeout(function () {}, 0, 'x'); } catch (e) { e8b = e.message; }
  a(/超时必须为正/.test(String(e8b)), 'N8b withTimeout 对非正超时抛错（实 ' + e8b + '）——0ms 不许静默当成「无上限」');

  // N9 真硬件读数：临时预算 300ms，容器必须 ETIMEDOUT + SIGKILL，且子进程真的死了
  const cp = require('child_process');
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, ['-e', 'setTimeout(function () {}, 60000)'], { encoding: 'utf8', timeout: 300, killSignal: 'SIGKILL' });
  const used = Date.now() - t0;
  a(r.error && r.error.code === 'ETIMEDOUT' && r.signal === 'SIGKILL',
    'N9 熔断真硬件验证：300ms 预算 → ETIMEDOUT + SIGKILL（实 ' + used + 'ms / ' + (r.error && r.error.code) + ' / ' + r.signal + '）');
  let alive = false;
  try { process.kill(r.pid, 0); alive = true; } catch (e) { alive = (e.code === 'EPERM'); }
  a(alive === false, 'N9 熔断后直接子进程确实已死（kill 0 探活失败）——熔断不是「接口返回了错而已」');

  // N10 全删 timeout ⇒ 未武装计数 = 全部 10 处，且逐站点核对全部现形
  const stripped = runSrc.split(/timeout: \d+,?\s*/).join('');
  const st = gt.siteStats(stripped);
  a(st.armedSites === 0 && st.sites === 10 && checkArmedSites(stripped).length === 10,
    'N10 全删 timeout ⇒ 未武装计数 = 全部 ' + st.sites + ' 处、逐站点核对全部现形（病根可被读数抓到）');

  console.log('  · v2105 概要：' + JSON.stringify({
    budget: gt.GATE_TIMEOUTS.spawnMs, fuse: gt.GATE_TIMEOUTS.shellMs,
    armed: d.armedCount, sites: d.siteStats.sites, budgetSites: d.siteStats.budget,
    modes: gt.modeCounts(), coherence: d.coherenceSummary
  }));
}

if (require.main === module) {
  let PASS = 0, FAIL = 0;
  const a = function (cond, name) {
    if (cond) { PASS++; console.log('  ✓ ' + name); }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('GATE-TIMEOUT-V2105: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('GATE-TIMEOUT-V2105: pass（' + PASS + ' 项）');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };