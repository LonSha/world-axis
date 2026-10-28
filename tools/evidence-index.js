#!/usr/bin/env node
// WorldAxis tools/evidence-index.js — 证据索引(计划 Q9,v2.226.0)
//
// ── 它治的病(计划 Q9 原文逐字)────────────────────────────────────────────
//   「保留快/中/全现有三层,新增/抽离独立业务 fixture;减少为锁源代码字面量而绑死布局与版本的
//    测试。**状态记录关联 commit、场景、环境、判据与输出摘要,过期标 stale**。现有计划顶部
//    存在+引用不等于功能验收;只修指路和证据索引,不重写历史文档。」
//
//   现场实证:本仓 tests/ 已有 270+ 个文件,其中专锁 / 门禁 / 账本混放。对**任何一条**证据,
//   全仓没有一处能同时回答这四问 —— 「它验的是哪一版交付?」「它挂在回归的哪一节?」
//   「它是无头还是真宿主?」「它现在还有效吗(文件变了没)?」。后果不是「查不到」,而是
//   **每一条新证据都要人肉重读一遍**;而当某个证据文件被改过之后,没有任何东西提醒
//   它的记录已过期 —— 这正是本仓反复治过的「声称有覆盖 ≠ 覆盖还在」。
//
// ── 口径:六栏全部**现场复算**,记录里不存任何第二真源 ────────────────────
//   · `file`      —— 仓库相对路径(唯一键)。
//   · `sha`       —— 该文件内容的 sha256 前 12 位(现场算)。
//   · `version`   —— 交付版本,取**文件头自述**:优先「标题行里含 `tests/<本文件名>` 的那行」的
//                    版本词,其次头部前六行的首个版本词;自述取不到 = null,**不猜、不填当前版本**
//                    —— 见下「stale 不认版本」。配套 `versionSource`(title / head / null)自证来源;
//                    另存 `fileAnchor` = 文件名 `-v2NNN` 的解码值(**有损,仅备查,不作判据**)。
//                    为什么不拿文件名当权威:`-v2NNN` 是「2 + minor 补零」与「2 + minor + patch 0」
//                    两套惯例混用 —— `2100` 既可读成 2.10.0,也可读成 2.100.0,**算术上二义**;
//                    而 `hazard-trigger-v2138`(头部自述 v2.96.0)、`intel-v2530`(头部自述 v2.75.0)
//                    这类文件名根本给不出真值(现场实测:文件名解码与头部自述在 241 条里 12 条直接
//                    冲突、另有一批二义)—— 故权威只认文件自述。
//   · `commit`    —— 该文件**首次出现在哪个提交**(现场取;无 git 环境如实标 null)。
//   · `wired`     —— 在 `tests/run.js` 里的**引用形态与行号**:`runLock` / `require` /
//                    `spawn`;未被引用 = null(这项是本仓「挂进回归才算证据」的既有纪律)。
//   · `env`       —— `headless-gate`(文件名带 gate)/ `headless-lock`(导出 runAll 或
//                    runNegative)/ `headless-script`(其余)/ `browser`(tests/browser/ 下)。
//
// ── acceptance 四档,计划原文那句就落在前两档的分界上 ──────────────────────
//   · `verified` —— 被 run.js 引用 **且** 另有**真跑面**(导出 `runAll`/`runNegative` 一族
//                   **且** 文件里出现真源码破坏锚点 `wreck(` / `breakOnce(` / `copyAndBreak(`)。
//   · `wired`    —— 文件在磁盘上 **且** 被 run.js 引用。这只是「存在 + 引用」。
//   · `consumed` —— 未被 run.js 直接引用,但被其它测试 `require` 进去当公共基建
//                   (lock-assert / test-surface-gate / ui-gate / dup-decl-gate 一族)。
//   · `unwired`  —— 磁盘上有,但既没被 run.js 引用,也没被别的测试消费。
//   计划原文写死了「现有计划顶部存在+引用**不等于**功能验收」⇒ **wired 一律不许写成
//   verified**。这条是本工具的承重判据,由 `tests/q9-evidence-ledger-v2226.js` 的 B 段钉住。
//
// ── stale:只认可复算的硬事实,不认「版本落后」 ───────────────────────────
//   三档,逐条都是**能拿命令重算**的:
//     · `sha-changed`  —— 记录里的 sha 与现场不符(证据文件改过 ⇒ 记录须重算);
//     · `file-missing` —— 记录的文件已不在磁盘(改名 / 删除);
//     · `wired-lost`   —— 记录里 wired 非空,而现场 run.js 已不再引用它。
//   **不**把「version 落后于 index.js VERSION」算 stale:历史证据本就停在它交付的那一版,
//   把「落后」当过期会让全表在每次升版后集体假红(同 gate-timeout 拒把「慢」当「坏」)。
//
// ── 边界(如实登记)────────────────────────────────────────────────────────
//   · **输出摘要不进记录**:「跑一次拿输出」等于把一条只读命令变成跑 270 把锁。判据面
//     (sha + wired + 真跑面)已能回答「记录过期没有」;真读数在各锁自己的消息串里,不复制。
//   · 只登记 `tests/` 下的 `.js`(不含 `run.js` 本身与账本 `.json`)。
//   · 只读,不改测试、不改版本、不动 plans;`--write` 只写 `tests/evidence-ledger.json`。
//
// ── 用法 ─────────────────────────────────────────────────────────────────
//   node tools/evidence-index.js            # dry-run:打印汇总 + stale 清单
//   node tools/evidence-index.js --write    # 重建 tests/evidence-ledger.json(幂等)
//   node tools/evidence-index.js --check    # 有 stale 即 exit 1(供门禁调用)
//   const E = require('../tools/evidence-index.js')   # 门禁复用同一份复算逻辑
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const LEDGER_P = path.join(TESTS, 'evidence-ledger.json');
const RUN_REL = 'tests/run.js';

/** 真跑面的两种形态:**导出可跑入口** 或 **真源码破坏锚点**。 */
const RUNNABLE_EXPORTS = ['runAll', 'runNegative', 'scan', 'audit'];
const WRECK_MARKS = ['wreck(', 'breakOnce(', 'copyAndBreak(', 'breakSource(', 'allReplace('];

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function readOrNull(rel) {
  try { return readText(rel); } catch (e) { return null; }
}
/** 现场 sha256 前 12 位。 */
function sha12(rel) {
  const t = readOrNull(rel);
  if (t === null) return null;
  return crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 12);
}
/** 文件名锚:文件名里的 `-v2NNN` 后缀**原样**返回(如 `2117`),取不到返回 null。
 *  **它是锚,不是版本**(`-v2NNN` 有损:2.117.0 写作 `2117`、2.97.0 写作 `2970`,
 *  末位既可能是 minor 的末位、也可能是 patch 的 `0`,**算术上不可反解**)。
 *  故只作备查,绝不填进 version —— 见下 versionInfo。 */
function versionOf(name) {
  const m = /-v(\d{3,4})\.js$/.exec(name);
  return m ? m[1] : null;
}
const VERSION_WORD = /v(\d+\.\d+\.\d+)/;
/** 标题行自述:前 3 行里**第一条提到本文件名的行**,取其中的版本词。
 *  为什么限定「提到本文件名的行」:文件头的「它治什么」常引用**别的版本**(前作 / 被治的病),
 *  只认标题行才不会把「它治的是 v2.96.0 那个病」读成「它是 v2.96.0 交付的」。 */
function titleVersion(src, base) {
  const lines = src.split('\n', 3);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(base) < 0) continue;
    const m = VERSION_WORD.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}
/** 头部自述(前六行首个版本词)—— 只在标题行取不到时兜底。 */
function headVersion(src) {
  const m = VERSION_WORD.exec(src.slice(0, 600));
  return m ? m[1] : null;
}
/** 交付版本:**只认文件自述**,并回带来源以便自证。取不到 = `{version:null, source:null}`
 *  —— 如实标「无版本锚」,**不猜、不填当前版本、不拿文件名凑**。 */
function versionInfo(src, base) {
  const t = src ? titleVersion(src, base) : null;
  if (t) return { version: t, source: 'title' };
  const h = src ? headVersion(src) : null;
  if (h) return { version: h, source: 'head' };
  return { version: null, source: null };
}
/** 一次性索引「每个文件**首次出现**在哪个提交」。
 *  为什么不用逐文件 `git log -1 -- <file>`:270 个文件 = 270 次子进程,实测 ~12s,
 *  而本条工具要被门禁在分钟级反复调用。改成**一次** `git log --reverse --format=%h --name-only`:
 *  倒序(最老在前)遍历,某文件第一次出现的那一行就是它的引入提交 —— 与逐文件取的是同一件事。 */
function firstCommitIndex() {
  const map = {};
  try {
    const r = cp.spawnSync('git', ['log', '--reverse', '--format=%h', '--name-only'],
      { cwd: ROOT, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) return map;
    let cur = null;
    String(r.stdout || '').split('\n').forEach(function (ln) {
      const t = ln.trim();
      if (!t) return;
      if (/^[0-9a-f]{7,}$/.test(t)) { cur = t; return; }
      if (cur && !map[t]) map[t] = cur;
    });
  } catch (e) { /* 无 git 环境:索引留空,recordOf 如实标 null */ }
  return map;
}
let _commitIdx = null;
function commitIdx() { if (_commitIdx === null) _commitIdx = firstCommitIndex(); return _commitIdx; }
/** 枚举 tests/ 下的证据文件(不含 run.js / 账本 json)。 */
function listEvidence() {
  const out = [];
  fs.readdirSync(TESTS).forEach(function (n) {
    if (!/\.js$/.test(n)) return;
    if (n === 'run.js') return;
    out.push('tests/' + n);
  });
  return out.sort();
}
/** run.js 里的引用面:`rel` -> {form, line}。四形态与 run.js 既有纪律一致。 */
function wiringOf(runSrc) {
  const lines = runSrc.split('\n');
  const map = {};
  lines.forEach(function (ln, i) {
    // (1) 库式引用:`runLock('./x.js')` / `runScript('./x.js')` / `require('./x.js')` / `spawnSync(..., ['./x.js'])`
    const m = /(runLock|runScript|require|spawnSync)\s*\([^)]*['"]\.\/([A-Za-z0-9_.\-]+\.js)['"]/.exec(ln);
    if (m) {
      const rel = 'tests/' + m[2];
      if (!map[rel]) map[rel] = { form: m[1], line: i + 1 };
    }
    // (2) 路径字面量:`'tests/x.js'`
    const m2 = /'(tests\/[A-Za-z0-9_.\-]+\.js)'/.exec(ln);
    if (m2 && !map[m2[1]]) map[m2[1]] = { form: 'path-literal', line: i + 1 };
    // (3) 子进程 argv 里的相对路径:`path.join('tests', 'x.js')` —— ui-gate.js 就走这一形态
    //     (spawnSync(process.execPath, [path.join('tests','ui-gate.js')]))。它不是「源文本读取」,
    //     而是**真把该文件当子进程跑**,故与 (1)/(2) 同列「执行面」。
    const m3 = /path\.join\(\s*'tests'\s*,\s*'([A-Za-z0-9_.\-]+\.js)'\s*\)/.exec(ln);
    if (m3) {
      const rel = 'tests/' + m3[1];
      if (!map[rel]) map[rel] = { form: 'spawn-argv', line: i + 1 };
    }
  });
  return map;
}
/** 测试侧消费面:`rel` -> [引用了它的 tests/*.js 文件名]。现场扫,不写死。
 *  为什么要有这一栏:本仓有一族文件**不被 run.js 直接引用**,而是被其它测试 `require` 进去
 *  当公共基建(lock-assert / test-surface-gate / ui-gate / dup-decl-gate)。把这类一律标
 *  「unwired」会读成「没人用」,而它们其实被 50+ 把锁共同消费 —— 读数必须与事实同宽。 */
function consumersOf(allRels, texts) {
  const map = {};
  allRels.forEach(function (r) { map[r] = []; });
  allRels.forEach(function (src) {
    const t = texts[src] || '';
    allRels.forEach(function (target) {
      if (target === src) return;
      const base = path.basename(target);
      const re = new RegExp("require\\('(?:\\./|tests/)" + base.replace(/[.\\-]/g, '\\$&') + "'\\)");
      if (re.test(t)) map[target].push(src);
    });
  });
  return map;
}
function envOf(rel, src) {
  if (rel.indexOf('tests/browser/') === 0) return 'browser';
  if (/gate/.test(path.basename(rel))) return 'headless-gate';
  const hasRun = RUNNABLE_EXPORTS.some(function (k) { return src.indexOf(k) >= 0; });
  return hasRun ? 'headless-lock' : 'headless-script';
}
/** 真跑面:**导出可跑入口** 或 出现真源码破坏锚点。 */
function runnableOf(rel, src) {
  const ex = RUNNABLE_EXPORTS.filter(function (k) {
    return new RegExp('\\b' + k + '\\b').test(src);
  });
  const marks = WRECK_MARKS.filter(function (k) { return src.indexOf(k) >= 0; });
  return { exports: ex, wreckMarks: marks, isRunnable: ex.length > 0 && marks.length > 0 };
}
/** 现场复算一条记录的所有栏位。`consumers` 为测试侧消费面(可为空)。 */
function recordOf(rel, wiring, texts, consumers) {
  const src = texts[rel] !== undefined ? texts[rel] : readOrNull(rel);
  const w = wiring[rel] || null;
  const rn = src ? runnableOf(rel, src) : { exports: [], wreckMarks: [], isRunnable: false };
  const cs = (consumers && consumers[rel]) || [];
  // 「存在 + 引用」⇒ wired;再叠真跑面 ⇒ verified。**wired 不许写成 verified**。
  // 测试侧消费面非空也算「有接线」——它进了回归(经其它锁),不是躺在磁盘上没人用。
  const acceptance = (w && rn.isRunnable) ? 'verified'
    : (w ? 'wired' : (cs.length ? 'consumed' : 'unwired'));
  const vi = versionInfo(src, path.basename(rel));
  return {
    file: rel,
    sha: sha12(rel),
    version: vi.version,
    versionSource: vi.source,
    fileAnchor: versionOf(path.basename(rel)),
    commit: commitIdx()[rel] || null,
    wired: w ? { form: w.form, line: w.line } : null,
    consumedBy: cs,
    env: src ? envOf(rel, src) : 'file-missing',
    runnable: rn.isRunnable,
    runnableExports: rn.exports,
    acceptance: acceptance
  };
}
/** 全表现场复算(单一真源:本函数被 --write / --check / 门禁共用)。 */
function build() {
  const runSrc = readText(RUN_REL);
  const wiring = wiringOf(runSrc);
  const rels = listEvidence();
  const texts = {};
  rels.forEach(function (r) { const t = readOrNull(r); if (t !== null) texts[r] = t; });
  const consumers = consumersOf(rels, texts);
  const rows = rels.map(function (rel) { return recordOf(rel, wiring, texts, consumers); });
  return { rows: rows, wiring: wiring, consumers: consumers };
}
/** 与旧记录比对,给出 stale 三档。 */
function staleOf(oldRows, newRows) {
  const oldMap = {};
  (oldRows || []).forEach(function (r) { oldMap[r.file] = r; });
  const newMap = {};
  newRows.forEach(function (r) { newMap[r.file] = r; });
  const out = [];
  (oldRows || []).forEach(function (o) {
    const n = newMap[o.file];
    if (!n) { out.push({ file: o.file, kind: 'file-missing' }); return; }
    if (o.sha && n.sha && o.sha !== n.sha) { out.push({ file: o.file, kind: 'sha-changed', was: o.sha, now: n.sha }); return; }
    if (o.wired && !n.wired) { out.push({ file: o.file, kind: 'wired-lost', was: o.wired.form }); return; }
    // 新增的 wired(此前 unwired)不是 stale:它是**接线补上了**,照实进新表。
  });
  const added = newRows.filter(function (r) { return !oldMap[r.file]; }).map(function (r) { return r.file; });
  return { stale: out, added: added };
}
function summary(rows) {
  const s = { total: rows.length, verified: 0, wired: 0, consumed: 0, unwired: 0, browser: 0,
    headlessGate: 0, headlessLock: 0, headlessScript: 0 };
  rows.forEach(function (r) {
    if (r.acceptance === 'verified') s.verified++;
    else if (r.acceptance === 'wired') s.wired++;
    else if (r.acceptance === 'consumed') s.consumed++;
    else s.unwired++;
    if (r.env === 'browser') s.browser++;
    else if (r.env === 'headless-gate') s.headlessGate++;
    else if (r.env === 'headless-lock') s.headlessLock++;
    else s.headlessScript++;
  });
  return s;
}
const NOTE = 'WorldAxis 证据索引(Q9,v2.226.0)。每行 = 一个证据文件,六栏全部**现场复算**'
  + '(文件 / sha / version / commit / wired / env、runnable),本表不存第二真源。'
  + '**version 只认文件自述**(标题行提到本文件名的那行 > 头部前六行首个版本词),'
  + '并回带 versionSource(title / head / null)自证来源;取不到如实标 null,**不猜**。'
  + 'fileAnchor = 文件名 `-v2NNN` 后缀**原样**,仅备查 —— 该后缀有损且二义'
  + '(2.117.0 写作 2117、2.97.0 写作 2970;`2100` 既可读成 2.10.0 也可读成 2.100.0),'
  + '**不作判据、不填进 version**。acceptance 四档:verified(被 run.js 引用 **且** 另有真跑面:'
  + '导出 runAll 一族**且**带真源码破坏锚点)/ wired(存在 + 被 run.js 引用)/ consumed'
  + '(未被 run.js 直接引用,但被其它测试 require 当公共基建)/ unwired。计划 Q9 原文'
  + '「现有计划顶部存在+引用不等于功能验收」落在 verified 与 wired 的分界上 —— '
  + 'wired 一律不许写成 verified。stale 只认三档可复算的硬事实:sha-changed / file-missing'
  + ' / wired-lost;**不**把「version 落后于当前版本」算 stale(历史证据本就停在它交付的那一版)。'
  + '边界:输出摘要不进记录;只登记 tests/ 下的 .js(不含 run.js 与账本 json)。';
function writeLedger(built) {
  const old = readOrNull('tests/evidence-ledger.json');
  let oldRows = null;
  try { oldRows = JSON.parse(old).rows; } catch (e) { oldRows = null; }
  const st = staleOf(oldRows, built.rows);
  const doc = {
    _note: NOTE,
    version: (function () {
      const m = /VERSION\s*=\s*'([\d.]+)'/.exec(readText('index.js'));
      return m ? m[1] : null;
    })(),
    counts: summary(built.rows),
    rows: built.rows
  };
  fs.writeFileSync(LEDGER_P, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return { doc: doc, stale: st };
}
function main() {
  const argv = process.argv.slice(2);
  const built = build();
  const s = summary(built.rows);
  if (argv.indexOf('--write') >= 0) {
    const r = writeLedger(built);
    console.log('■ 证据索引已重建:' + path.relative(ROOT, LEDGER_P));
    console.log('  证据文件 ' + s.total + ' 条 · verified ' + s.verified + ' / wired ' + s.wired
      + ' / consumed ' + s.consumed + ' / unwired ' + s.unwired);
    console.log('  环境:headless-gate ' + s.headlessGate + ' / headless-lock ' + s.headlessLock
      + ' / headless-script ' + s.headlessScript + ' / browser ' + s.browser);
    console.log('  较旧记录:新增 ' + r.stale.added.length + ' 条 · stale ' + r.stale.stale.length + ' 条');
    r.stale.stale.forEach(function (x) { console.log('    · stale[' + x.kind + '] ' + x.file); });
    return 0;
  }
  if (argv.indexOf('--check') >= 0) {
    const old = readOrNull('tests/evidence-ledger.json');
    let oldRows = null;
    try { oldRows = JSON.parse(old).rows; } catch (e) { oldRows = null; }
    if (!oldRows) { console.log('✗ 证据索引缺失或不可解析'); return 1; }
    const st = staleOf(oldRows, built.rows);
    if (st.stale.length) {
      console.log('✗ 证据索引有过期条目 ' + st.stale.length + ' 条(跑 --write 重算):');
      st.stale.forEach(function (x) { console.log('    · [' + x.kind + '] ' + x.file); });
      return 1;
    }
    console.log('✓ 证据索引与现场同源:证据文件 ' + s.total + ' 条 · stale 0');
    return 0;
  }
  console.log('■ 证据索引(dry-run)');
  console.log('  证据文件 ' + s.total + ' 条 · verified ' + s.verified + ' / wired ' + s.wired
    + ' / consumed ' + s.consumed + ' / unwired ' + s.unwired);
  console.log('  环境:headless-gate ' + s.headlessGate + ' / headless-lock ' + s.headlessLock
    + ' / headless-script ' + s.headlessScript + ' / browser ' + s.browser);
  console.log('  用法:--write 重建 · --check 有 stale 即退出 1');
  return 0;
}
module.exports = {
  build: build, staleOf: staleOf, summary: summary, recordOf: recordOf,
  sha12: sha12, versionOf: versionOf, versionInfo: versionInfo, titleVersion: titleVersion,
  headVersion: headVersion, wiringOf: wiringOf, envOf: envOf,
  runnableOf: runnableOf, listEvidence: listEvidence, NOTE: NOTE,
  RUNNABLE_EXPORTS: RUNNABLE_EXPORTS, WRECK_MARKS: WRECK_MARKS, LEDGER_P: LEDGER_P
};
if (require.main === module) { process.exit(main()); }