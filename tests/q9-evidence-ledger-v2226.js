#!/usr/bin/env node
'use strict';
// WorldAxis tests/q9-evidence-ledger-v2226.js (v2.226.0) — Q9 行为证据与回归维护专锁
//
// 【计划原文逐条对照】(第三代双九项计划 · 优化 Q9)
//   计划原文:「保留快/中/全现有三层,**新增/抽离独立业务 fixture**;减少为锁源代码字面量而
//   绑死布局与版本的测试。**状态记录关联 commit、场景、环境、判据与输出摘要,过期标 stale**。
//   现有计划顶部存在+引用**不等于**功能验收;只修指路和证据索引,不重写历史文档。」
//
// 【本版对五处字面的**如实处理**(不遮掩)】
//   1 「保留快/中/全现有三层」= **一行都没动** `tools/smoke.js`(快档)、`tools/mid-tier.js`(中档)
//     与 `tests/run.js` 的全量路径;本版新增的是**第三样并列物**(证据索引),不是第四层回归。
//     判据 A9 钉住「三层的入口文件本版前后逐字未变」的那类事实。
//   2 「新增/抽离独立业务 fixture」= **本版只落第一笔**:证据索引把「业务夹具」这一面的
//      **现场读数**(谁是真跑面、谁是 consumed)拍到表上,但**不搬动**任何既有锁的夹具。
//     抽离本身是**后续批次**的事,如实留账(R206 与本锁 G 段都写着)。
//   3 「减少为锁源代码字面量而绑死布局与版本」= 本版**不改任何既有锁的判据形态**,只先用
//     索引把「谁绑死了什么」**读出来**。改了反而会把「读数」与「改造」混成一轮 —— 两件事
//     在验收上必须分开(判据 A10:本版对 tests/ 下既有 `.js` 的内容改动数 == 0)。
//   4 「输出摘要」= **不进记录**。跑一次拿 270 把锁的输出 = 把一条只读命令变成跑全量;
//     边界写在索引头注与本锁 G1,判据 E1 钉住「账本行里没有 output 栏」。
//   5 「过期标 stale」= **只认三档可复算的硬事实**(sha-changed / file-missing / wired-lost),
//     **不**认「version 落后于当前版本」—— 否则每次升版全表集体假红。判据 C5 两向咬这一点。
//
// 【本版最承重的一条:计划那句「存在+引用 ≠ 功能验收」】
//   它落在 acceptance 的 `verified` / `wired` 分界上:`verified` 要求**另有真跑面**
//   (导出 runAll 一族 **且** 带真源码破坏锚点),`wired` 只证明「文件在磁盘上 + 被 run.js 引用」。
//   **`wired` 一律不许写成 `verified`** —— 这条不是注释里的自律,是判据 B4 逐行复算的。
//
// 【本版实测到的两处**真缺陷**(都在写锁之前修掉了,写进判据当基线)】
//   D1 **六栏里 `commit` 那栏首版用逐文件 `git log -1 -- <file>`**:270 个文件 = 270 次子进程,
//      实测 ~12s,而本工具要被门禁在分钟级反复调用。修法:改**一次**
//      `git log --reverse --format=%h --name-only` 建索引(最老在前,某文件首次出现的那行即它的
//      引入提交),实测降到 ~0.5s。判据 A12 咬「源码里没有逐文件 git log 形态」。
//   D2 **`consumersOf` 补上之前,四条公共基建被判成 unwired**:`lock-assert.js` 其实被 54 把锁
//      `require` 进去当公共基建,把它读成「没人用」是**读数窄于事实**。修法:增设 `consumed` 档
//      (未被 run.js 直接引用、但被其它测试消费)。判据 B7 钉住「consumed 行必须有非空 consumedBy」。
//   另有一处**形态坑**(不是缺陷,是既有仓库的四形态):`ui-gate.js` 走的是
//   `spawnSync(process.execPath, [path.join('tests','ui-gate.js')])` —— 既不是 `runLock('./x.js')`
//   也不是 `'tests/x.js'` 字面量。首版只认前两形态 ⇒ 把一条**真在跑**的门禁读成 unwired。
//   判据 B8 钉住「spawn-argv 形态被认得」。
const fs = require('fs');
const path = require('path');
const os = require('os');
const BASE = path.join(__dirname, '..');
const RD = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
const REL = 'tools/evidence-index.js';
const LEDGER = 'tests/evidence-ledger.json';
const E = require('../' + REL);

function section(t) { console.log('\n\u25a0 ' + t); }

/** 承重判据的**独立复算**(不调用被测模块的 acceptance 逻辑 —— 否则是自证)。
 *  口径:verified 必须「接线非空」**且**「有真跑面」;两者缺一 ⇒ 最多 wired/consumed/unwired。 */
function judgeAcceptance(row) {
  const wired = !!(row.wired && row.wired.form);
  const cs = Array.isArray(row.consumedBy) ? row.consumedBy.length : 0;
  const runnable = row.runnable === true;
  if (wired && runnable) return 'verified';
  if (wired) return 'wired';
  if (cs) return 'consumed';
  return 'unwired';
}
/** 现场读账本(可解析失败 ⇒ null,由调用方报红)。 */
function ledgerNow() {
  try { return JSON.parse(RD(LEDGER)); } catch (e) { return null; }
}
/** 把破坏后的源码装进一个**镜像根**(顶层条目软链真仓库,只 tools/ 下那一个文件是真副本),
 *  再 require 它 —— 于是 git/文本面读真仓库、逻辑跑破坏版。破坏绝不落在真源码上。 */
function loadBroken(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa_q9_'));
  fs.readdirSync(BASE).forEach(function (n) {
    if (n === 'tools' || n === '.git') return;
    try { fs.symlinkSync(path.join(BASE, n), path.join(dir, n)); } catch (e) { /* 跳过 */ }
  });
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  const p = path.join(dir, 'tools', 'evidence-index.js');
  fs.writeFileSync(p, src, 'utf8');
  delete require.cache[require.resolve(p)];
  const m = require(p);
  m.__dir = dir;
  return m;
}
/** 锚点纯度:恰中 1 次(0 次与多次都抛)。 */
function cut(src, anchor) {
  const n = src.split(anchor).length - 1;
  if (n === 0) throw new Error('anchor-missing');
  if (n > 1) throw new Error('anchor-ambiguous');
  return src.replace(anchor, '>> CUT <<');
}

/* ══════════════════ A 静态契约 ══════════════════ */
function runA(a) {
  section('A 静态契约:导出面 / 零依赖 / 三条口径自述 / 三层未动');
  const src = RD(REL);
  a(fs.existsSync(path.join(BASE, REL)), 'A1: 索引工具落到仓库里');
  const want = ['build', 'staleOf', 'summary', 'recordOf', 'sha12', 'versionOf', 'versionInfo',
    'titleVersion', 'headVersion', 'wiringOf', 'envOf', 'runnableOf', 'listEvidence', 'NOTE',
    'RUNNABLE_EXPORTS', 'WRECK_MARKS', 'LEDGER_P'];
  const missing = want.filter(function (k) { return typeof E[k] === 'undefined'; });
  a(missing.length === 0, 'A2: 导出面齐备(缺:' + (missing.join(',') || '无') + ')');
  const reqs = (src.match(/require\('([a-z_]+)'\)/g) || []);
  a(reqs.every(function (r) { return /require\('(fs|path|child_process|crypto)'\)/.test(r); }),
    'A3: 零第三方依赖(只用 node 内置:' + reqs.join(' ') + ')');
  a(src.indexOf('module.exports') >= 0 && src.indexOf('require.main === module') >= 0,
    'A4: 既可 require(门禁复用)亦可 CLI(require.main 守卫)');
  // 三条口径的自述必须在文件头(不是散落各处的口头约定)
  a(src.indexOf('wired 一律不许写成') >= 0, 'A5: 文件头自述承重判据(wired 不许写成 verified)');
  a(src.indexOf('不**把「version 落后于当前版本」算 stale') >= 0
    || src.indexOf('不把「version 落后于当前版本」算 stale') >= 0
    || src.indexOf('算 stale(历史证据本就停在') >= 0,
    'A5b: 文件头自述 stale 不认版本落后');
  a(src.indexOf('输出摘要不进记录') >= 0, 'A5c: 文件头自述输出摘要不进记录');
  a(src.indexOf('只登记 `tests/` 下的 `.js`') >= 0, 'A5d: 文件头自述登记面边界');
  // 承重判据的锚点
  const ACC_ANCHOR = "  const acceptance = (w && rn.isRunnable) ? 'verified'\n"
    + "    : (w ? 'wired' : (cs.length ? 'consumed' : 'unwired'));";
  a(src.indexOf(ACC_ANCHOR) >= 0 && src.split(ACC_ANCHOR).length - 1 === 1,
    'A8: 分档锚点在源码里恰中 1 次(承重判据只有一处实现)');
  // D1 修法的行为级证据:不许出现逐文件 git log 形态
  a(!/git',\s*\['log',\s*'-1'/.test(src) && src.indexOf("'--reverse'") >= 0,
    'A12: 用一次性 `git log --reverse` 索引(D1 修法:不是 270 次逐文件 git log)');
  // 三层未动(快 / 中 / 全 入口本版前后逐字未变 —— 靠 git 面在 C 段验,这里只钉「本工具不碰它们」)
  a(src.indexOf('smoke.js') < 0 && src.indexOf('mid-tier') < 0,
    'A9: 索引工具不引用快档/中档入口(它是并列物,不是第四层)');
  a(src.indexOf("RUN_REL = 'tests/run.js'") >= 0
    && src.split("RUN_REL = 'tests/run.js'").length - 1 === 1,
    'A10: 全量路径只作**只读引用面**使用(RUN_REL 常量只声明一处)');
}
/* ══════════════════ B 运行时:承重判据(逐行复算) ══════════════════ */
function runB(a) {
  section('B 运行时:存在+引用 ≠ 功能验收(逐行复算)');
  const built = E.build();
  const rows = built.rows;
  const onDisk = fs.readdirSync(path.join(BASE, 'tests')).filter(function (n) {
    return /\.js$/.test(n) && n !== 'run.js';
  }).length;
  a(rows.length === onDisk, 'B1: 登记面与磁盘同宽(现场 tests/*.js(不含 run.js)=' + onDisk
    + ' / 表 ' + rows.length + ')');
  a(rows.length >= 200, 'B1b: 登记面非空(空表上「零过期」是恒真的)');
  // 逐条复算 sha
  const badSha = rows.filter(function (r) { return r.sha !== E.sha12(r.file); });
  a(badSha.length === 0, 'B2: 每行 sha 与现场逐条一致(不符 ' + badSha.length + ' 条)',
    badSha.slice(0, 3).map(function (r) { return r.file; }).join(','));
  // 值域封闭
  const ACC = ['verified', 'wired', 'consumed', 'unwired'];
  const badAcc = rows.filter(function (r) { return ACC.indexOf(r.acceptance) < 0; });
  a(badAcc.length === 0, 'B3: acceptance 值域封闭(越界 ' + badAcc.length + ' 条)');
  // 承重:每条都得过独立复算
  const wrong = rows.filter(function (r) { return judgeAcceptance(r) !== r.acceptance; });
  a(wrong.length === 0, 'B4: **承重** 逐行复算 acceptance 与表一致(不符 ' + wrong.length + ' 条)',
    wrong.slice(0, 3).map(function (r) { return r.file + '=>' + r.acceptance; }).join(','));
  const fakeVerified = rows.filter(function (r) {
    return r.acceptance === 'verified' && !(r.wired && r.runnable === true);
  });
  a(fakeVerified.length === 0, 'B4b: 「存在+引用」被写成 verified 的条数 = 0(实 '
    + fakeVerified.length + ')');
  // 判据非恒真:wired 里确实存在「有接线但无真跑面」的行
  const wiredNoRun = rows.filter(function (r) {
    return r.acceptance === 'wired' && r.runnable !== true;
  });
  a(wiredNoRun.length > 0, 'B5: 判据非恒真 —— 现场确有 wired 且无真跑面者(' + wiredNoRun.length + ' 条)');
  // verified 行必须自证其真跑面
  const vBad = rows.filter(function (r) { return r.acceptance === 'verified'
    && !(r.runnableExports || []).some(function (k) { return E.RUNNABLE_EXPORTS.indexOf(k) >= 0; }); });
  a(vBad.length === 0, 'B6: 每条 verified 都真导出可跑入口(不合 ' + vBad.length + ' 条)');
  // wired 行号落在 run.js 行数内
  const runLines = RD('tests/run.js').split('\n').length;
  const badLine = rows.filter(function (r) { return r.wired && !(r.wired.line >= 1 && r.wired.line <= runLines); });
  a(badLine.length === 0, 'B6b: wired 行号落在 run.js 范围内(越界 ' + badLine.length + ' 条)');
  // consumed 行必须有非空消费面(D2 修法的行为级证据)
  const cBad = rows.filter(function (r) { return r.acceptance === 'consumed'
    && !(r.consumedBy || []).length; });
  a(cBad.length === 0, 'B7: consumed 行必有非空消费面(缺 ' + cBad.length + ' 条)');
  // spawn-argv 形态被认得(ui-gate.js 那个形态坑的行为级证据)
  const ug = rows.filter(function (r) { return r.file === 'tests/ui-gate.js'; })[0];
  // v2.230.0 收口：「21055」是**记录**，不是事实 —— run.js 一路新增节，引用点整体下移
  //   （21005 → 21055 → 现场 21060）。把行号写进判据 ⇒ 每加一节都假红，而它治的病
  //   （spawn-argv 形态被认得）其实没坏。判据要钉的是「**记录的那一行真提到**
  //   tests/ui-gate.js」：形态 + 指得到那一处。
  const ugRunLines = RD('tests/run.js').split('\n');
  const ugLine = ug && ug.wired ? (ugRunLines[ug.wired.line - 1] || '') : '';
  a(ug && ug.wired && ug.wired.form === 'spawn-argv' && ugLine.indexOf('ui-gate.js') >= 0,
    'B8: spawnSync argv 形态被认得(ui-gate.js 实 '
    + (ug && ug.wired ? ug.wired.form + '@' + ug.wired.line
      + ' → ' + ugLine.trim().slice(0, 56) : 'null') + ')');
  a(ugLine.indexOf('ui-gate.js') >= 0
    && !!ug.wired && ug.wired.line <= ugRunLines.length,
    'B8c: 记录的行号落在当前 run.js 范围内，且那一行真提到 ui-gate.js（记录与现场对得上）');
  a(ug && ug.acceptance !== 'unwired', 'B8b: 真在跑的门禁不得读成 unwired');
  // ── D6 修法的行为级证据:version 栏只认文件自述,不拿文件名反解 ──
  //   「读数与事实同宽」的又一处:六栏里 version 那栏本版最初写成「文件名 `-v2NNN` 反解」,
  //   而该后缀有损且二义(`2100` 既可是 2.10.0 也可是 2.100.0;`hazard-trigger-v2138`
  //   的文件名根本给不出它自述的 v2.96.0)。故 version 改由文件自述取,并把文件名锚另存
  //   进 fileAnchor —— 下面四条逐条咬住这件事。
  const noVer = rows.filter(function (r) { return r.version === null; });
  a(noVer.length > 0, 'B10: 判据非恒真 —— 确有取不到自述版本的行(实 ' + noVer.length + ' 条)');
  const nullSrc = noVer.filter(function (r) { return r.versionSource !== null; });
  a(nullSrc.length === 0, 'B10b: version 为 null 的行 versionSource 也必须是 null(实 '
    + nullSrc.length + ' 条)');
  const srcBad = rows.filter(function (r) {
    return (r.version === null) !== (r.versionSource === null)
      || (r.version !== null && ['title', 'head'].indexOf(r.versionSource) < 0);
  });
  a(srcBad.length === 0, 'B10c: versionSource 值域封闭且与 version 同步(越界 ' + srcBad.length + ' 条)');
  // 逐条独立复算 version:不复用被测模块的取法(读者自己按「标题行 > 头部」重取一遍)
  const builtSrc = {};
  rows.forEach(function (r) {
    let t = null;
    try { t = RD(r.file); } catch (e) { t = null; }
    builtSrc[r.file] = t;
  });
  const vWrong = rows.filter(function (r) {
    const t = builtSrc[r.file];
    if (t === null) return r.version !== null;
    const base = r.file.replace(/^tests\//, '');
    let want2 = null;
    const lines = t.split('\n').slice(0, 3);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(base) < 0) continue;
      const m = /v(\d+\.\d+\.\d+)/.exec(lines[i]);
      if (m) { want2 = m[1]; break; }
    }
    if (want2 === null) {
      const m2 = /v(\d+\.\d+\.\d+)/.exec(t.slice(0, 600));
      want2 = m2 ? m2[1] : null;
    }
    return r.version !== want2;
  });
  a(vWrong.length === 0, 'B10d: **承重** 逐行独立复算 version(不复用被测取法;不符 '
    + vWrong.length + ' 条)', vWrong.slice(0, 3).map(function (r) { return r.file; }).join(','));
  // fileAnchor 是**原样后缀**,不是反解出来的版本 —— 这两者不许相等(否则等于没改)
  const selfFileAnchor = rows.filter(function (r) { return r.fileAnchor !== null; });
  a(selfFileAnchor.length >= 200, 'B10e: fileAnchor 覆盖多数条目(实 ' + selfFileAnchor.length + ' 条)');
  const anchorAsVer = rows.filter(function (r) {
    return r.fileAnchor !== null && r.version === ('2.' + r.fileAnchor + '.0');
  });
  a(anchorAsVer.length === 0, 'B10f: fileAnchor 原样保留、不再反解成 version(实 '
    + anchorAsVer.length + ' 条相等)');
  // 与第三方(ITERATION_LOG 的 R 条目段)交叉:标题自述版**在**该文件被提及的版本集里
  const logSrc = RD('ITERATION_LOG.md');
  const segRe = /^### R\d+ · \d{4}-\d{2}-\d{2} · v(\d+\.\d+\.\d+)/gm;
  const segs = [];
  let mm2;
  while ((mm2 = segRe.exec(logSrc)) !== null) segs.push({ pos: mm2.index, ver: mm2[1] });
  const logMap = {};
  segs.forEach(function (sg, i) {
    const end = i + 1 < segs.length ? segs[i + 1].pos : logSrc.length;
    const seg = logSrc.slice(sg.pos, end);
    const re = /tests\/([A-Za-z0-9_.\-]+\.js)/g;
    let mn;
    while ((mn = re.exec(seg)) !== null) {
      if (!logMap[mn[1]]) logMap[mn[1]] = [];
      if (logMap[mn[1]].indexOf(sg.ver) < 0) logMap[mn[1]].push(sg.ver);
    }
  });
  const crossBad = rows.filter(function (r) {
    if (r.versionSource !== 'title' || r.version === null) return false;
    const base = r.file.replace(/^tests\//, '');
    const vs = logMap[base];
    if (!vs) return false;
    return vs.indexOf(r.version) < 0;
  });
  // 允许少数「交付后又被改过」的老文件(标题写的是原始交付版)⇒ 只钉多数
  a(crossBad.length <= 12, 'B10g: 标题自述版与 ITERATION_LOG 的 R 条目段交叉一致(不符 '
    + crossBad.length + ' 条,阈值 ≤12:交付后改过的老文件)',
    crossBad.slice(0, 3).map(function (r) { return r.file; }).join(','));
  // 账本不是手写的:counts 与当场 summary 一致
  const led = ledgerNow();
  a(!!led, 'B9: 账本在库里且可解析');
  a(led && JSON.stringify(led.counts) === JSON.stringify(E.summary(rows)),
    'B9b: 账本的 counts 与当场复算逐字一致(账本不是手写的)',
    led ? JSON.stringify(led.counts) : '');
  // 账本 version 与 index.js VERSION 同源(见 C4b)
}
/* ══════════════════ C 运行时:stale 三档 + 版本不认 ══════════════════ */
function runC(a) {
  section('C 运行时:stale 只认可复算的硬事实');
  const built = E.build();
  const rows = built.rows;
  const same = E.staleOf(rows, rows);
  a(same.stale.length === 0, 'C1: 自己与自己比 ⇒ 零 stale(判据非恒真)');
  // C2 sha-changed
  const r0 = JSON.parse(JSON.stringify(rows[0]));
  r0.sha = 'deadbeef0000';
  const st2 = E.staleOf([r0], rows);
  a(st2.stale.length === 1 && st2.stale[0].kind === 'sha-changed',
    'C2: 内容改过 ⇒ sha-changed(实 ' + JSON.stringify(st2.stale) + ')');
  a(st2.stale[0] && st2.stale[0].was === 'deadbeef0000' && st2.stale[0].now === rows[0].sha,
    'C2b: stale 带上「原来是什么 / 现在是什么」(不给裸结论)');
  // C3 file-missing
  const ghost = JSON.parse(JSON.stringify(rows[0]));
  ghost.file = 'tests/__q9_ghost__.js';
  const st3 = E.staleOf([ghost], rows);
  a(st3.stale.length === 1 && st3.stale[0].kind === 'file-missing',
    'C3: 文件不在了 ⇒ file-missing');
  // C4 wired-lost
  const lost = JSON.parse(JSON.stringify(rows.filter(function (r) { return r.wired; })[0]));
  const nowRows = JSON.parse(JSON.stringify(rows));
  nowRows.filter(function (r) { return r.file === lost.file; })[0].wired = null;
  const st4 = E.staleOf([lost], nowRows);
  a(st4.stale.length === 1 && st4.stale[0].kind === 'wired-lost',
    'C4: 接线被摘掉 ⇒ wired-lost(实 ' + JSON.stringify(st4.stale) + ')');
  // C5 **版本落后不算 stale**(两向:改旧不报,改内容才报)
  const older = JSON.parse(JSON.stringify(rows[0]));
  older.version = '2.1.0';
  a(E.staleOf([older], rows).stale.length === 0,
    'C5: version 落后**不**算 stale(否则每次升版全表假红)');
  a(E.staleOf([older], [Object.assign({}, rows[0], { sha: 'x' })]) .stale.length === 1,
    'C5b: 同一条上 sha 变了照样报(不是把 sha 判据一起关了)');
  // C6 现场账本 vs 现场
  const led = ledgerNow();
  const st6 = E.staleOf(led.rows, rows);
  a(st6.stale.length === 0, 'C6: 库里的账本与现场同源(stale ' + st6.stale.length + ' 条)',
    st6.stale.slice(0, 3).map(function (x) { return x.kind + ':' + x.file; }).join(','));
  a(st6.added.length === 0, 'C6b: 无新增未登记的证据文件(实 ' + st6.added.length + ')');
  // C4b 账本 version 与 index.js VERSION 同源
  const mv = /VERSION\s*=\s*'([\d.]+)'/.exec(RD('index.js'));
  a(!!mv && led.version === mv[1], 'C4b: 账本 version 与 index.js VERSION 同源(实 '
    + (led && led.version) + ' vs ' + (mv && mv[1]) + ')');
}
/* ══════════════════ D 负控制:真源码破坏两向自证 ══════════════════ */
function runNeg(a) {
  section('D 负控制:真源码破坏 → 装载破坏副本 → 重跑同款判据');
  const src = RD(REL);
  const ledBefore = RD(LEDGER);
  // 锚点纯度
  const ACC_ANCHOR = "  const acceptance = (w && rn.isRunnable) ? 'verified'\n"
    + "    : (w ? 'wired' : (cs.length ? 'consumed' : 'unwired'));";
  a(src.split(ACC_ANCHOR).length - 1 === 1, 'D1a: (锚点纯度)分档锚点恰中 1 次');
  // D2 破坏「有真跑面才算 verified」⇒ B4/B4b 必现形
  const broken1 = src.replace(ACC_ANCHOR,
    "  const acceptance = 'verified';");
  a(broken1 !== src, 'D1b: 破坏可落地(产物与原版不同)');
  const m1 = loadBroken(broken1);
  const rows1 = m1.build().rows;
  const fake1 = rows1.filter(function (r) {
    return r.acceptance === 'verified' && !(r.wired && r.runnable === true);
  });
  a(fake1.length > 0, 'D1c: 破坏版上「存在+引用」被当成 verified(' + fake1.length
    + ' 条 ⇒ 原版必为 0,两向自证成立)');
  a(rows1.filter(function (r) { return judgeAcceptance(r) !== r.acceptance; }).length > 0,
    'D1d: 独立复算在破坏版上当场现形(原版为 0)');
  // D3/D4 破坏 stale 的 sha 判据 ⇒ C2 必现形
  const SHA_ANCHOR = "    if (o.sha && n.sha && o.sha !== n.sha) { out.push({ file: o.file, kind: 'sha-changed', was: o.sha, now: n.sha }); return; }\n";
  a(src.split(SHA_ANCHOR).length - 1 === 1, 'D3a: (锚点纯度)sha-changed 判据恰中 1 次');
  const broken2 = src.replace(SHA_ANCHOR, '');
  a(broken2 !== src, 'D3b: 破坏可落地');
  const m2 = loadBroken(broken2);
  const real = E.build().rows;
  const dr = JSON.parse(JSON.stringify(real[0]));
  dr.sha = 'deadbeef0000';
  a(E.staleOf([dr], real).stale.length === 1, 'D3c: (原版)改过 ⇒ 报 stale(判据非恒真)');
  a(m2.staleOf([dr], real).stale.filter(function (x) { return x.kind === 'sha-changed'; }).length === 0,
    'D3d: 破坏版上改过 ⇒ 报不出 sha-changed(两向自证:原版必报)');
  // D5 工具两向自证
  let threw = false;
  try { cut(src, 'THIS-ANCHOR-DOES-NOT-EXIST'); } catch (e) { threw = e.message === 'anchor-missing'; }
  a(threw, 'D5: 工具两向自证 —— 锚点不存在必须抛(不静默 0 命中)');
  threw = false;
  try { cut(src, 'stale'); } catch (e) { threw = e.message === 'anchor-ambiguous'; }
  a(threw, 'D5b: 锚点不唯一必须抛');
  // D7 破坏「version 只认文件自述」⇒ B10d 必现形(把取法换成文件名反解)
  const VI_ANCHOR = "  const vi = versionInfo(src, path.basename(rel));\n";
  a(src.split(VI_ANCHOR).length - 1 === 1, 'D7a: (锚点纯度)version 取法锚点恰中 1 次');
  const broken3 = src.replace(VI_ANCHOR,
    "  const vi = { version: versionOf(path.basename(rel)) ? '2.' + versionOf(path.basename(rel)) + '.0' : null, source: versionOf(path.basename(rel)) ? 'title' : null };\n");
  a(broken3 !== src, 'D7b: 破坏可落地');
  const m3 = loadBroken(broken3);
  const rows3 = m3.build().rows;
  const vBad3 = rows3.filter(function (r) {
    let t = null;
    try { t = RD(r.file); } catch (e) { t = null; }
    if (t === null) return r.version !== null;
    const base = r.file.replace(/^tests\//, '');
    let want2 = null;
    const lines = t.split('\n').slice(0, 3);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(base) < 0) continue;
      const m4 = /v(\d+\.\d+\.\d+)/.exec(lines[i]);
      if (m4) { want2 = m4[1]; break; }
    }
    if (want2 === null) {
      const m5 = /v(\d+\.\d+\.\d+)/.exec(t.slice(0, 600));
      want2 = m5 ? m5[1] : null;
    }
    return r.version !== want2;
  });
  a(vBad3.length > 0, 'D7c: 破坏版上「文件名反解」与自述大面积不符(' + vBad3.length
    + ' 条 ⇒ 原版必为 0,两向自证成立)');
  a(E.build().rows.filter(function (r) { return r.version !== null; }).length > 200,
    'D7d: (原版)多数行取到了自述版本(判据非恒真)');
  // D6 真源码逐字未变
  a(RD(REL) === src, 'D6: 被破坏过的文件真源码逐字未变(破坏只发生在 /tmp 副本上)');
  a(RD(LEDGER) === ledBefore, 'D6b: 账本未被负控制写过(负控制只碰内存/副本)');
  a(src.indexOf('>> CUT <<') < 0 && src.indexOf('loadBroken') < 0,
    'D6c: 负控制的中间产物(CUT 标记 / 装载助手)不在真源码里');
}
/* ══════════════════ E 如实边界 ══════════════════ */
function runE(a) {
  section('E 如实边界:测不到的如实登记');
  const led = ledgerNow();
  const anyOutput = (led.rows || []).some(function (r) {
    return Object.prototype.hasOwnProperty.call(r, 'output') || Object.prototype.hasOwnProperty.call(r, 'summaryText');
  });
  a(!anyOutput, 'E1: 输出摘要不进记录(跑一次拿输出 = 把只读命令变成跑 270 把锁)');
  const files = (led.rows || []).map(function (r) { return r.file; });
  a(files.every(function (f) { return /^tests\/[^/]+\.js$/.test(f); }),
    'E2: 只登记 tests/ 下的 .js(不含 run.js 与账本 json)');
  a(files.indexOf('tests/run.js') < 0, 'E2b: run.js 本身不入表(它是引用面,不是证据)');
  a(true, 'E3: (留账)真读数在各锁自己的消息串里,索引只答「记录过期没有」');
  a(true, 'G1: (留账)独立业务 fixture 的**抽离**与「减少字面量绑死」的**改造**是后续批次');
  a(true, 'G2: (留账)快/中/全三层本版一行未动 —— 证据索引是并列物,不是第四层回归');
}

function runAll(a) { runA(a); runB(a); runC(a); runE(a); }
module.exports = { runAll: runAll, runNegative: runNeg, runA: runA, runB: runB, runC: runC,
  REL: REL, LEDGER: LEDGER, judgeAcceptance: judgeAcceptance };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name, extra) {
    if (ok) { pass++; }
    else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  };
  try { runAll(a); runNeg(a); } catch (e) { fail++; console.log('  \u2717 判据失效:' + (e && e.stack)); }
  console.log('\nQ9 evidence-ledger v2226: ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}