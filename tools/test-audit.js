#!/usr/bin/env node
'use strict';
/**
 * WorldAxis tools/test-audit.js (v2.155.0) — 回归套件自身健康（RP8）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   tests/ 已是 180 个跟踪文件、八万行级。套件自己**没有任何入口做体检**：
 *     · 负控制的真源码破坏**锚点**漂了（源码被重构、锚点原文不再存在）⇒ 该锁会
 *       报 not-found；而「只报不红」的量级下，一条死锁与一条活锁在总量读数上长得一样。
 *     · 同一段锚点原文被两把锁各抄一份：改一处源码要改两把锁，漏一把就是永久假绿。
 *     · 锚点指向的目标**文件**已不在磁盘（改名 / 删除）⇒ 那把锁找不到靶子，而它
 *       自己不会说。
 *   一句话：**测试是判官，但判官自己没有体检报告。**
 *
 * ── 三个面（各自一条判据，不另造第二套锚点抽取器）──
 *   P1 锚点存活：直接**复用** `tools/anchor-scan.js` 的抽取与核查（它是本仓指定的
 *      锚点抽取器，口径单一真源）。统一档（gate 面）问题必须为 0；非统一档问题
 *      **只报不红**（该档启发式已知会把 `wreck('锚点名','替换形态')` 的**实参**当成锚点，
 *      121 条属已知假阳性，逐条带证据交人复核）。
 *   P2 锚点重复：同一段锚点原文跨文件重复声明数 / 声明总数。超阀值报合并建议
 *      （阈值 0.30，可配）。
 *   P3 失效测试：锚点指向的目标文件已不在磁盘 ⇒ 报「靶子没了」。
 *      另查 `tests/module-registry-ledger.json` 登记的模块文件是否都还在。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **只报不改**：不修锁、不给自动修法（修法是人的事）。
 *   2 **不另立锚点口径**：抽取与核查全部委派 `anchor-scan.js`；本工具只做
 *      「跨文件聚合」与「靶子exists」两件它没做的事。
 *   3 **精确面报红、启发面只报**（本工具最要紧的一条判断）：
 *      · 精确面（gate）：① 统一档锚点问题 ≠ 0（锚点原文不在目标文件里了 —— 这条
 *        在真仓库里实测为 0，为正即真漂移）；② 模块登记表里的文件不在磁盘。
 *      · 启发面（只报不红）：P3 的「锚点靶子已消失」。为什么不能报红 ——
 *        `anchor-scan` 的**靶子面是超集**：它会把测试内部的合成夹具串
 *        （`'core/a.js'` 这类对象键 / 数组里的示例名、运行期创建又删除的探针文件）
 *        一并当靶子（实测 8 条全属此类，零条是真错）。把超集当判据只会天天喊狼来了。
 *   4 默认**建议式退出**（退出 0）；`--strict` 只对**精确面**报红。
 *   5 零依赖（只用 Node 内置 fs / path）与零绝对路径字面量（tools/ 纪律）。
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const anchorScan = require('./anchor-scan.js');

const BASE = path.join(__dirname, '..');
const TESTS = path.join(BASE, 'tests');
const DUP_THRESHOLD = 0.30;   // P2 阀值（配置面只有这一项，写成常量而不是十项设置）

/** 已跟踪且已存在的 tests/*.js（真源是 git 索引，不是磁盘 —— 与 toolchain-gate 同口径）。 */
function trackedTests() {
  const r = cp.spawnSync('git', ['-C', BASE, 'ls-files', 'tests/'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;   // 无 git（如副本环境）⇒ 退化为磁盘扫描
  return r.stdout.split('\n').map(function (s) { return s.trim(); })
    .filter(function (s) { return s && /^tests\/[\w.-]+\.js$/.test(s); })
    .map(function (s) { return s.slice('tests/'.length); });
}
function diskTests() {
  return fs.readdirSync(TESTS).filter(function (f) { return /\.js$/.test(f); });
}
function readTest(f) { return fs.readFileSync(path.join(TESTS, f), 'utf8'); }
function exists(rel) { try { return fs.existsSync(path.join(BASE, rel)); } catch (e) { return false; } }

/**
 * 现场扫描。**同一套判据跑真仓库与破坏副本**（负控制据此指向副本）。
 * 返回 { facts, problems, fatal }。
 */
function scan(opts) {
  // **可注入面**（v2.155.0）：五件依赖全部可换 —— 判据与依赖分开，
  //   负控制才能在合成夹具上重跑同一套判据（对齐本仓 `d.read` 的一贯做法）。
  //   默认值逐字等于修复前行为（未传注入时仍读真仓库）。
  const o = opts || {};
  const read = o.read || function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
  const existsIn = o.exists || function (rel) { return fs.existsSync(path.join(BASE, rel)); };
  const problems = [];
  const facts = {};

  const testFiles = o.ls ? o.ls() : (trackedTests() || diskTests());
  const srcOf = function (f) { return o.read ? read('tests/' + f) : readTest(f); };
  facts.files = testFiles.length;

  // ── P1 锚点存活：委派 anchor-scan（口径单一真源）──
  let scanRow = null;
  try {
    scanRow = o.anchorRow !== undefined ? o.anchorRow : anchorScan.scan({});
  } catch (e) {
    problems.push({ kind: 'scan-failed', detail: 'anchor-scan 抛错：' + String(e && (e.message || e)) });
  }
  if (scanRow) {
    const uni = scanRow.uniform || {};
    const non = scanRow.nonUniform || {};
    facts.uniformLocks = uni.locks || 0;
    facts.uniformAnchors = uni.anchors || 0;
    facts.uniformProblems = (uni.problems || 0);
    facts.nonUniformLocks = non.total || 0;
    facts.nonUniformAnchors = non.anchors || 0;
    facts.nonUniformIssues = (non.issues || 0);
    // 统一档是 gate 面：问题不为 0 即为真漂移（锚点原文不在目标文件里了）。
    (uni.rows || []).forEach(function (row) {
      (row.problems || []).forEach(function (p) {
        problems.push({ kind: 'anchor-dead', file: row.file,
          detail: '统一档锚点在「' + p.target + '」命中 ' + p.hits + ' 次（要求恰 1）——破坏锚点已漂' });
      });
    });
  }

  // ── P2 锚点重复：同一段原文跨文件重复声明 ──
  //   口径（如实写清）：分母是**声明数**，按「每文件内去重、跨文件累计」计 ——
  //   单个文件里同一段锚点原文写两遍由 `extract()` 内部去重，不在这里重复计数
  //   （那是「同一把锁抄了两遍」的另一种病，与「两把锁各抄一份」处置不同）。
  const declOf = {};
  let declTotal = 0;
  testFiles.forEach(function (f) {
    let src;
    try { src = srcOf(f); } catch (e) { return; }
    let ex = { anchors: [] };
    try { ex = anchorScan.extract(src) || ex; } catch (e) { /* 认不出就跳过 */ }
    (ex.anchors || []).forEach(function (a) {
      const t = a && a.txt;
      if (!t) return;
      declTotal++;
      (declOf[t] = declOf[t] || []).push(f);
    });
  });
  const uniq = Object.keys(declOf).length;
  const dupPairs = Object.keys(declOf).filter(function (k) { return declOf[k].length > 1; });
  facts.anchorDecls = declTotal;
  facts.anchorUniq = uniq;
  facts.dupAnchors = dupPairs.length;
  facts.dupRate = declTotal ? (declTotal - uniq) / declTotal : 0;
  facts.dupThreshold = DUP_THRESHOLD;
  if (facts.dupRate > DUP_THRESHOLD) {
    problems.push({ kind: 'anchor-dup', detail: '锚点跨文件重复率 ' + (facts.dupRate * 100).toFixed(1)
      + '% 超阀值 ' + (DUP_THRESHOLD * 100) + '%（建议合并；改一处源码要改 N 把锁）',
      samples: dupPairs.slice(0, 5) });
  }

  // ── P3 失效测试（**启发面**）：锚点的靶子没了 ──
  //   `anchor-scan` 的靶子面是超集（含测试内部夹具串），故本条只报不红（见文件头边界 3）。
  const targets = {};
  testFiles.forEach(function (f) {
    let src;
    try { src = srcOf(f); } catch (e) { return; }
    let ex = { targets: [] };
    try { ex = anchorScan.extract(src) || ex; } catch (e) { /* 同上 */ }
    (ex.targets || []).forEach(function (t) { if (t) targets[t] = 1; });
  });
  const targetList = Object.keys(targets);
  const gone = targetList.filter(function (t) { return !existsIn(t); });
  facts.targets = targetList.length;
  facts.targetsGone = gone.length;
  gone.forEach(function (t) {
    problems.push({ kind: 'target-gone', detail: '锚点靶子已不在磁盘：「' + t + '」——那把锁找不到靶子，而它自己不会说' });
  });
  // 附查：模块登记表里声明的模块文件是否还在（登记了、磁盘无 ⇒ 登记面在空转）
  let ledgerGone = [];
  try {
    const led = o.ledger !== undefined ? o.ledger
      : JSON.parse(fs.readFileSync(path.join(BASE, 'tests/module-registry-ledger.json'), 'utf8'));
    const mods = Object.keys(led.modules || {});
    facts.ledgerModules = mods.length;
    ledgerGone = mods.filter(function (m) { return !existsIn(m); });
  } catch (e) { facts.ledgerModules = -1; }
  facts.ledgerGone = ledgerGone.length;
  ledgerGone.forEach(function (m) {
    problems.push({ kind: 'ledger-gone', detail: '模块登记表里的「' + m + '」已不在磁盘（登记面空转）' });
  });

  // ── gate 判定（只由精确面构成）──
  const gateFails = [];
  if (facts.uniformProblems > 0) gateFails.push('统一档锚点漂移 ' + facts.uniformProblems + ' 条');
  if (facts.ledgerGone > 0) gateFails.push('模块登记表指向的文件已消失 ' + facts.ledgerGone + ' 个');
  facts.gate = gateFails.length === 0;
  facts.gateDetail = gateFails;

  return { facts: facts, problems: problems, gate: facts.gate };
}

function fmt(res) {
  const f = res.facts;
  const L = [];
  L.push('■ 回归套件自审计（RP8：测试是判官，判官也要体检报告）');
  L.push('  锁文件 ' + f.files + ' 个（跟踪索引）');
  L.push('  锚点存活：统一档 ' + f.uniformLocks + ' 把 / ' + f.uniformAnchors + ' 条锚点 / 问题 '
    + f.uniformProblems + '（**门禁面**，须为 0）');
  L.push('           非统一档 ' + f.nonUniformLocks + ' 把 / ' + f.nonUniformAnchors + ' 条锚点 / 问题 '
    + f.nonUniformIssues + '（只报不红，逐条带证据交人复核）');
  L.push('  锚点重复：声明 ' + f.anchorDecls + ' 条（每文件内去重、跨文件累计）/ 去重 ' + f.anchorUniq + ' 条 / 跨文件重复 '
    + f.dupAnchors + ' 处（重复率 ' + (f.dupRate * 100).toFixed(1) + '%，阀值 '
    + (f.dupThreshold * 100) + '%）');
  L.push('  失效测试：锚点靶子 ' + f.targets + ' 个 / 已消失 ' + f.targetsGone
    + ' · 模块登记 ' + (f.ledgerModules < 0 ? '（未读到）' : f.ledgerModules) + ' / 已消失 ' + f.ledgerGone);
  L.push('  精确面（gate）：' + (f.gate ? '通过 ✓' : '✗ ' + f.gateDetail.join(' / '))
    + '（统一档锚点问题 0 + 登记文件均在）');
  return L.join('\n');
}

module.exports = { scan: scan, fmt: fmt, BASE: BASE, DUP_THRESHOLD: DUP_THRESHOLD };

if (require.main === module) {
  const strict = process.argv.indexOf('--strict') >= 0;
  let res;
  try { res = scan({}); } catch (e) {
    console.error('test-audit 异常：' + String(e && (e.message || e)));
    process.exit(2);
  }
  console.log(fmt(res));
  if (res.problems.length) {
    console.log('  ── 逐条 ──');
    res.problems.forEach(function (p) { console.log('  · [' + p.kind + '] ' + p.detail); });
  } else {
    console.log('  ✓ 三面均无问题（锚点未漂 / 无超标重复 / 靶子均在）');
  }
  if (strict && !res.gate) {
    console.log('  ✗ --strict：精确面未过 —— ' + res.facts.gateDetail.join(' / '));
    process.exit(1);
  }
  process.exit(0);
}
