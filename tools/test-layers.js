#!/usr/bin/env node
// WorldAxis tools/test-layers.js — 回归分层归属表 + 选区入口的单一真源（O6，v2.187.0）
//
// ── 它治的病（计划 O6 现状原文）────────────────────────────────────────
//   「`tests/run.js` 21806 行 / 1.73MB / 223 个 section，隔离运行器硬超时 1500000ms；
//    v2.131.0 实测整趟 439.0s，196 节里只有 2 节超 60s —— **问题是总时长，不是单节**。」
//   于是「跑一次全量」成了唯一的验收入口，也成了最大的单次成本；改动一行想看结果，
//   要么等 7 分钟，要么手工注释掉一大片 —— 后者正是「悄悄漏跑」的来源。
//
// ── 本办法：把「哪个节在验什么」变成可复算的读数 ──────────────────────
//   扫 `tests/run.js` 的每个 `section('…')` 调用点，取它到下一个调用点之间的**跨度**，
//   在跨度里读三样东西：
//     · `runLock('./X.js')` / `require('./X.js')` → 这个节验的专锁文件；
//     · `tests/` 下某个 `.js` 文件名出现在跨度里 → 它 spawn/引用了哪个证据文件；
//     · 跨度里是否出现共享上下文原语（`vm.` / `uiGateFresh` / `synth-host` / `mock.js` …）。
//   归属表因此**不是手写的**：节名、资源、能否独跑，全部从 run.js 现场复算。
//
// ── 「能否独跑」（selfContained）的判据（保守，宁可不选）────────────────
//   一个节算 selfContained，当且仅当**同时**满足：
//     ① 跨度里至少有一个 `tests/*.js` 证据文件被 spawn（= 它真在验一个可点名的东西）；
//     ② 跨度里**没有** `runLock(...)`（runLock 在同一 vm 上下文里 require，共用 global）；
//     ③ 跨度里**没有**共享上下文原语（`vm.` / `uiGateFresh` / `context-guard` / `synth-host`）。
//   缺任一条 ⇒ selfContained=false ⇒ **选区永远选不动它**（永远照跑）。
//   这条保守条款是刻意的：分层若把一个顺序敏感的节跳过，省下的时间要用「假绿」来还。
//
// ── 边界（如实登记）────────────────────────────────────────────────
//   · 本工具**不承诺**任何省时百分比。实测耗时由 `tools/slow-sections.js` 从回归日志归集，
//     两者分工：本工具回答「哪些节能被单独选中」，slow-sections 回答「选中它省了多少秒」。
//   · 选区在 `tests/run.js` 里由 `--only-v-section` / `WA_ONLY_SECTION` 提供；**两者都不给
//     ⇒ 全量路径逐字不变**（分层入口是全量的真子集，不是替代品）。
//   · 本工具只读 `tests/run.js` 与 `tests/` 目录名，不改产品、不改测试、不动版本。
//   · **v2.187.0（O6 收口）**：`buildOutcome()` / `finish()` 也住在这里，同样的理由 ——
//     收尾裁定（常态 / 空跑 / 拒绝三态）此前写在 `tests/run.js` 的汇总段里，
//     而它**没法用「真跑一次 run.js」来验**：现场实测 900s 超时，根因是
//     **裸语句节的节体在 `section()` 提前返回时仍然逐条执行**（本仓 90 个裸语句节），
//     于是「不给选区」与「给一个必然空跑的选区」耗时几乎一样长。
//     抽成纯函数后，门禁拿**真函数的真返回**驱动三态，只要毫秒级。
//
// 用法：
//   node tools/test-layers.js               # 归属表 + 可选节清单
//   node tools/test-layers.js --json        # 机器可读
//   node tools/test-layers.js --who <节名子串>   # 某个节的资源归属
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RUN = path.join(ROOT, 'tests', 'run.js');

/** 共享上下文原语：出现任一者即视为「不能独跑」。 */
const SHARED = ['runLock(', 'vm.', 'uiGateFresh', 'context-guard', 'synth-host', 'mock.js', 'ui-gate-sync'];

/** 证据文件命名（与 `plans/` 侧编号一致）：批式 s3-b<N>-<o|e><n>-v2NNN.js 或语义式 <o|e><n>-…-v2NNN.js。 */
const EVIDENCE_FORMS = [
  // 批式：`s3-b<批>-(o|e)<编号>-v<四位版本>.js`。**批号只许是数字** —— 这条正则的
  //   初版写死成 `[12]`（批 1 / 批 2），于是第三批的三把专锁（s3-b3-e4 / e6 / e8）
  //   与语义式两条正则**都不中** ⇒ 已交付的三项在块里一律写成「未交付」。
  //   治法与 `tools/gen-plan-status.js` **同批同规**（按形态放宽 `\d` 而不枚举批号），
  //   两处若只改一处，就会得到「计划块说已交付、分层表里查不到归属」这种半截读数。
  /^s3-b\d+-(o|e)(\d)-v2\d{3}\.js$/,
  /^(o|e)(\d)-[a-z0-9-]+-v2\d{3}\.js$/];

function readRun() { return fs.readFileSync(RUN, 'utf8'); }
function testFiles() {
  return fs.readdirSync(path.join(ROOT, 'tests')).filter(function (f) { return /\.js$/.test(f); }).sort();
}
function itemOf(base) {
  for (let i = 0; i < EVIDENCE_FORMS.length; i++) {
    const m = base.match(EVIDENCE_FORMS[i]);
    if (m) return (m[1] === 'o' ? 'O' : 'E') + m[2];
  }
  return null;
}

/** 解析：每个 section 调用点 → 跨度 → 资源归属。
 *  opt.src 可覆盖源文本（**只给门禁的负控制用**：在合成源/真源码内存副本上重跑同款判据，
 *  证明「判据不是恒真」—— 与 `tools/gen-plan-status.js` 的 `VIEW(opt)` 同规格）。 */
function analyze(opt) {
  const src = (opt && opt.src !== undefined) ? opt.src : readRun();
  const lines = src.split('\n');
  const marks = [];
  lines.forEach(function (l, i) {
    // 两种引号形态都收（现场实测有一个节用双引号，只认单引号会静默漏掉它）
    const m = l.match(/^  section\((['"])(.*)\1\);\s*$/);
    if (m) marks.push({ line: i, name: m[2] });
  });
  const all = testFiles();
  const sections = marks.map(function (mk, k) {
    const end = (k + 1 < marks.length) ? marks[k + 1].line : lines.length;
    const span = lines.slice(mk.line, end).join('\n');
    const locks = [], requires = [], spawns = [];
    let m2;
    const reLock = /runLock\(\s*'\.\/([^']+)'/g;
    while ((m2 = reLock.exec(span)) !== null) locks.push(m2[1]);
    const reReq = /require\(\s*'\.\/([^']+)'/g;
    while ((m2 = reReq.exec(span)) !== null) requires.push(m2[1]);
    all.forEach(function (f) {
      if (span.indexOf(f) >= 0 || locks.indexOf(f) >= 0 || requires.indexOf(f) >= 0) spawns.push(f);
    });
    const shared = SHARED.filter(function (s) { return span.indexOf(s) >= 0; });
    // 「证据」= 跨度里真出现过的 `tests/*.js` 文件（不限于 O/E 命名 —— 这一条是本工具第一版
    // 的现场缺陷：只认 O/E 编号形态，于是 TX/TP/SP 各批的 spawn 节**全部**被误判成
    // selfContained=false，可选节从几十个塌成 4 个）。`item` 只是给 plans/ 侧编号对账用的附加信息。
    const evidence = spawns;
    const selfContained = evidence.length > 0 && locks.length === 0 && shared.length === 0;
    return {
      name: mk.name, line: mk.line + 1, endLine: end,
      locks: locks, requires: requires, evidence: evidence, shared: shared,
      selfContained: selfContained, item: evidence.length ? itemOf(evidence[0]) : null,
      mark: 'v' + (mk.name.match(/v2\.(\d+)\.0/) ? mk.name.match(/v2\.(\d+)\.0/)[1] : '0000')
    };
  });
  const selectable = sections.filter(function (s) { return s.selfContained; });
  return {
    runLines: lines.length,
    sectionCount: sections.length,
    sections: sections,
    selectable: selectable,
    note: 'selfContained 只表示「可被 --only-v-section 单独选中」；耗时读数在 tools/slow-sections.js'
  };
}

/** 选区裁定 —— **单一真源**（`tests/run.js` 与门禁都调这一个，避免两处各写一遍漂移）。
 *  入参：归属表条目 + 选区子串列表。
 *  返回：`{ verdict: 'run' | 'skip' | 'refuse', why }`
 *    · `run`    —— 被选中且声明可独跑 ⇒ 执行它的全部判据；
 *    · `skip`   —— 未被选中 ⇒ 不执行，**逐条列名**（跳过必须显式）；
 *    · `refuse` —— 被点名但声明为共享上下文（或点名的名字在归属表里找不到）⇒
 *                  **不是跳过而是拒绝**：此时给出任何「通过」都是假绿，调用方须以非零码收尾。
 *  为什么把 `refuse` 与 `skip` 分开：这两件事在旧写法里都落成「不跑」，于是
 *  「我没选它」与「你选了但它不能被单独跑」在输出里长得一样 —— 后者是必须让人看见的坏消息。 */
function select(entry, needles) {
  const ns = needles || [];
  if (!entry) return { verdict: 'refuse', why: 'no-entry' };
  const matched = ns.some(function (n) { return String(entry.name).indexOf(n) >= 0; });
  if (!matched) return { verdict: 'skip', why: 'not-selected' };
  if (!entry.selfContained) {
    return { verdict: 'refuse', why: entry.shared.length ? 'shared:' + entry.shared.join('+') : 'no-evidence' };
  }
  return { verdict: 'run', why: 'selected' };
}
/** 收尾裁定 —— **单一真源**（`tests/run.js` 汇总段只消费它，不自己重写一遍条件）。
 *  为什么非抽不可（v2.187.0 收口现场踩到）：收尾条件此前写在 `tests/run.js` 里，
 *  而「跑一次真 run.js 来证明它」这条路**走不通** —— 实测 900s 超时；
 *  根因是**裸语句节的节体在 `section()` 提前返回时仍然全跑**（本仓 90 个裸语句节），
 *  所以「不给选区」与「给一个空选区」的耗时几乎一样长。判据不能依赖一次全量回归。
 *  抽成纯函数后，门禁拿**真返回**驱动三态（与 A5 的 `select()` 同规格），毫秒级可复算。
 *
 *  与 `tests/run.js` 汇总段的逐字对应（改一处必须改另一处，由 o6 门禁钉住）：
 *    ① `on=false`（不给选区）⇒ 全量收尾，读数行也不打印（全量路径逐字不变）；
 *    ② 有 `refused` ⇒ 拒绝收尾 exit 3（被点名的节不可单独跑，给出任何结论都是假绿）；
 *    ③ `ran` 为空 ⇒ 空跑收尾 exit 3（「一节都没跑到」同样不得算通过）；
 *    ④ 其余 ⇒ 正常收尾 exit 0（有失败项时由调用方先行 exit 1）。*/
const EXIT_OK = 0, EXIT_REFUSED = 3, EXIT_EMPTY = 3;
function buildOutcome(sel, ran, refused) {
  const nSel = (sel || []).length, nRan = (ran || []).length, nRef = (refused || []).length;
  if (nSel === 0) return { on: false, exit: EXIT_OK, showLine: false, refuseLine: false, kind: 'full' };
  if (nRef > 0) return { on: true, exit: EXIT_REFUSED, showLine: true, refuseLine: true, kind: 'refused' };
  if (nRan === 0) return { on: true, exit: EXIT_EMPTY, showLine: true, refuseLine: true, kind: 'empty' };
  return { on: true, exit: EXIT_OK, showLine: true, refuseLine: false, kind: 'partial' };
}
/** 收尾执行：唯一的 exit 点抽在外面 —— 门禁因此能在**同一进程**里用注入的 `exit`
 *  回调驱动它（连真打印路径一起走），不必为了验一条条件式去跑一趟全量回归。*/
function finish(o, log, exit) {
  const say = log || function () {};
  if (o.showLine) say('分层选区读数（实跑 · ' + o.kind + '）');
  if (o.refuseLine) say('拒绝收尾 · ' + o.kind);
  (exit || function (c) { process.exit(c); })(o.exit);
  return o.exit;
}
function main() {
  const ARGV = process.argv.slice(2);
  const r = analyze();
  if (ARGV.indexOf('--json') >= 0) { console.log(JSON.stringify(r, null, 2)); return; }
  if (ARGV.indexOf('--who') >= 0) {
    const needle = ARGV[ARGV.indexOf('--who') + 1] || '';
    r.sections.filter(function (s) { return s.name.indexOf(needle) >= 0; }).forEach(function (s) {
      console.log('■ ' + s.name + '  (run.js:' + s.line + '-' + s.endLine + ')');
      console.log('  证据 ' + (s.evidence.join(', ') || '（无）') + ' · 锁 ' + (s.locks.join(', ') || '（无）')
        + ' · 共享上下文 ' + (s.shared.join(', ') || '（无）'));
      console.log('  可独跑 ' + (s.selfContained ? '是' : '否'));
    });
    return;
  }
  console.log('■ 回归分层归属表（现场复算自 tests/run.js）');
  console.log('  行数 ' + r.runLines + ' · 节 ' + r.sectionCount + ' · 可被选区单独选中 ' + r.selectable.length);
  console.log('  可选节（按批）：');
  r.selectable.forEach(function (s) {
    console.log('    · [' + s.mark + '] ' + s.name + '  →  ' + s.evidence.join(', '));
  });
  console.log('  选区用法：node tests/run.js --only-v-section \'<节名子串>\'（或不给 = 全量，逐字不变）');
}

module.exports = {
  analyze: analyze, itemOf: itemOf, select: select, SHARED: SHARED, RUN: RUN,
  buildOutcome: buildOutcome, finish: finish,
  EXIT_OK: EXIT_OK, EXIT_REFUSED: EXIT_REFUSED, EXIT_EMPTY: EXIT_EMPTY
};
if (require.main === module) main();