'use strict';
// WorldAxis tests/opv29-z1-03-v2529.js — OPV29-03 隔离器瘦身（排什么 / 绝不排什么）
//
// ── 病 ────────────────────────────────────────────────────────────
// `tests/isolated-runner.js` 的 `files(root)` 把**整棵树**走一遭、逐文件 `copyFileSync`
// 并各算一次 sha256；一趟全量就复制一次，分片并行（OPV29-01）时是 N 次。
// 工作树里的历史流水、证据快照、*.log 一次都不会被读，却每次趟都复制。
// 但「瘦身」比「瘦得不许瘦错」危险得多：一旦把**被测面**排掉，被隔离跑的就是缩小的面，
// 绿灯随之变假 —— 那是本计划反复治过的病（把世界缩小到判据能通过）。
//
// ── 本锁守什么 ────────────────────────────────────────────────────
// A 读数：真仓的体积前后、条目数、以及**如实报告目标未达成**（不为凑 20M 去排 tests/）。
// B 三条铁律（用合成小树**真装配**跑真代码，不是看文本）：
//   ① 产品面一个字节都不排；② 被 tests/*.js 文本提到的就不排；③ 其余照排。
//   而且 B 组自带反向对照：抽掉「产品面真源」/「测试引用文本」后，同样的候选必须真被排 ——
//   否则「一条都不排」也能让 ①② 变绿（那是空转，不是判据）。
// C 接入面：隔离器确实用 `exclusionSet`，且读不到清单时**不排**（保守失败）。
//
// ── 三条不许的假绿 ────────────────────────────────────────────────
// ① 只看「省了多少 M」——不看省掉的是不是被测面。
// ② 目标 20M 写死成 true ——现场到不了就是到不了，如实报。
// ③ 负控制只删掉 tests/ 的一个文件看红 ——那是缩面，不是破坏判据。
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MS = require(path.join(ROOT, 'tools/mirror-slim.js'));
let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
const tmpDirs = [];
// 合成小树：一个产品面文件 + 一个「被测试提到」的文件 + 一个无人引用的文件。
//   withProduct / withRef 用来做反向对照（抽掉真源，看拒绝是否随之消失 —— 真破坏）。
function miniRoot(tag, opts) {
  const o = opts || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-slim-' + tag + '-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'core'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'core', 'a.js'), 'product-surface\n');
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'kept-by-a-test\n');
  fs.writeFileSync(path.join(dir, 'junk.txt'), 'nobody-reads-this-at-all\n');
  if (o.withProduct !== false) {
    fs.writeFileSync(path.join(dir, 'tests', 'product-files.js'),
      'module.exports = { productFiles: function () { return ["core/a.js"]; } };\n');
  }
  if (o.withRef !== false) {
    fs.writeFileSync(path.join(dir, 'tests', 'run.js'),
      'const KEEP = "keep.txt";\n');
  }
  return dir;
}
// 临时往候选表里塞一条规则（CANDIDATES 是导出数组，同一份引用），跑完必须弹回去。
function withCandidate(rule, fn) {
  const before = MS.CANDIDATES.length;
  MS.CANDIDATES.push(rule);
  try { return fn(); }
  finally { MS.CANDIDATES.length = before; }
}
const CATCH_ALL = { why: 'zz-catch-all', test: function () { return true; } };

// ══════════════════════ A. 真仓读数 ══════════════════════
function runA() {
  console.log('A. 真仓读数（命令：node tools/mirror-slim.js --json）');
  const p = MS.profile({ root: ROOT });
  a(p.files > 1000, 'A1 复制面文件数可读', String(p.files));
  // v2.542.8：隔离副本是**按 mirror-slim 的排除规则建的**（tests/isolated-runner.js 的
  //   slimSet() 直接调 mirror-slim.exclusionSet），所以副本里没有任何东西可排 ——
  //   「有排除项」「瘦身后变小」在副本里结构性不可验（exclude 恒为 0、体积恒相等）。
  //   判据不删也不放宽：副本上改成断言「确实无可排项（且跳过项全是 referenced 面）」，
  //   真仓上仍要求「有排除项 + 体积真的变小」。
  const ISO = !!process.env.WA_ISOLATED_TOKEN;
  if (ISO) {
    a(p.exclude.length === 0 && p.saved === 0,
      'A2/A3（隔离副本）本趟跑在已按 mirror-slim 排过项的副本里 ⇒ 无可排项、体积不变（真仓读数见下节）',
      p.exclude.length + ' / ' + p.saved);
  } else {
    a(p.exclude.length > 0, 'A2 有排除项（否则本工具等于没做事）', String(p.exclude.length));
    a(p.sizeAfter < p.sizeBefore && p.saved > 0, 'A3 瘦身后体积确实变小',
      (p.sizeBefore / 1048576).toFixed(1) + 'M → ' + (p.sizeAfter / 1048576).toFixed(1) + 'M');
  }
  // 现场真例：`ITERATION_LOG.md` 被 tests/q8-panel-fold-v2225.js 提到，因此**必须被拒**。
  const iter = p.skipped.filter(function (s) { return /ITERATION_LOG\.md$/.test(s.rel); })[0];
  a(!!iter && String(iter.why).indexOf('referenced:tests/') === 0,
    'A4 迭代流水被拒排（测试文本提到它 —— 铁律②的现场真例）',
    iter ? iter.why : 'not-skipped');
  const evid = p.skipped.filter(function (s) { return /plans\/evidence\/.+\/README\.md$/.test(s.rel); })[0];
  a(!!evid && String(evid.why).indexOf('referenced:tests/') === 0,
    'A5 证据目录 README 被拒排（同上）', evid ? evid.why : 'not-skipped');
  // 目标未达成必须如实说 —— 这是「不许把缩面当成果」的硬防线。
  a(p.targetReached === false && typeof p.whyNotTarget === 'string' && p.whyNotTarget.length > 10,
    'A6 目标 20M 未达成且给出原因（不谎报达成）',
    'reached=' + p.targetReached + ' why=' + String(p.whyNotTarget).slice(0, 40));
  // 被测面一个字节都不许排：排除清单里不许出现产品面目录下的任何文件。
  const prodPrefix = /^(tests|engines|core|actors|direction|render|compat|ui)\//;
  const bad = p.exclude.filter(function (e) { return prodPrefix.test(e.rel) && !/^tests\/.*\.(log|tmp)$/.test(e.rel); });
  a(bad.length === 0, 'A7 排除清单里没有被测面文件', bad.slice(0, 3).map(function (b) { return b.rel; }).join(','));
  const known = {};
  MS.CANDIDATES.forEach(function (c) { known[c.why] = 1; });
  const odd = p.exclude.filter(function (e) { return !known[e.why]; });
  a(odd.length === 0, 'A8 每条排除都挂在已知规则名下（没有来路不明的排除）',
    odd.slice(0, 3).map(function (o) { return o.rel + ':' + o.why; }).join(','));
  const set = MS.exclusionSet(ROOT);
  a(set.size === p.exclude.length, 'A9 隔离器拿到的集合 ≡ 清单里的排除项',
    set.size + ' vs ' + p.exclude.length);
  console.log('    读数：复制面 ' + p.files + ' 个文件 · ' + (p.sizeBefore / 1048576).toFixed(1) + 'M → '
    + (p.sizeAfter / 1048576).toFixed(1) + 'M（省 ' + (p.saved / 1048576).toFixed(1) + 'M / ' + p.savedPct + '%）· 排除 '
    + p.exclude.length + ' · 拒绝 ' + p.skipped.length);
  return p;
}

// ══════════════════════ B. 三条铁律（合成小树真装配）══════════════════════
function runB() {
  console.log('B. 三条铁律（合成小树 + 全匹配候选，看真代码怎么裁）');
  const dir = miniRoot('truth');
  const p = withCandidate(CATCH_ALL, function () { return MS.profile({ root: dir }); });
  a(MS.CANDIDATES.indexOf(CATCH_ALL) < 0, 'B0 临时候选已弹出（不污染后续读数）');
  const rels = p.exclude.map(function (e) { return e.rel; });
  const sk = function (rel) { return p.skipped.filter(function (s) { return s.rel === rel; })[0]; };
  a(!(rels.indexOf('core/a.js') >= 0) && !!sk('core/a.js') && sk('core/a.js').why === 'product',
    'B1 铁律① 产品面文件被拒排（why=product）',
    'excluded=' + (rels.indexOf('core/a.js') >= 0) + ' why=' + (sk('core/a.js') || {}).why);
  a(!(rels.indexOf('keep.txt') >= 0) && !!sk('keep.txt') && String(sk('keep.txt').why).indexOf('referenced:tests/') === 0,
    'B2 铁律② 被测试文本提到的文件被拒排',
    'excluded=' + (rels.indexOf('keep.txt') >= 0) + ' why=' + (sk('keep.txt') || {}).why);
  a(rels.indexOf('junk.txt') >= 0, 'B3 铁律③ 无人引用的文件照排（不是「一条都不排」）',
    rels.join(','));
  // 体积账**独立重算**一遍（不用手写的和）：before = 小树全部文件字节和；
  //   after = 未被排除的那些文件的字节和。两处都要与工具自己的读数逐字节相等。
  //   ⚠ 第一版我在这里写了 `before = 16+15+25`，忘了 `tests/*.js` 也会被排（它们不在
  //   productFiles 清单里、小树里也没人按名字提到它们）—— 那是我的算术错，不是工具的错。
  const allRels = MS.walk(dir);
  const exSet = new Set(rels);
  const sumOf = function (list) {
    return list.reduce(function (s, r) { return s + fs.statSync(path.join(dir, r)).size; }, 0);
  };
  const beforeBytes = sumOf(allRels);
  const afterBytes = sumOf(allRels.filter(function (r) { return !exSet.has(r); }));
  a(p.sizeBefore === beforeBytes && p.sizeAfter === afterBytes && p.saved === beforeBytes - afterBytes,
    'B4 体积账按字节对得上（独立重算 before − 排除 = after）',
    p.sizeBefore + '→' + beforeBytes + ' / ' + p.sizeAfter + '→' + afterBytes);

  // 反向对照：抽掉「产品面真源」⇒ 同一个文件必须真被排（证明 B1 不是恒绿）
  const np = miniRoot('no-prod', { withProduct: false });
  const p2 = withCandidate(CATCH_ALL, function () { return MS.profile({ root: np }); });
  a(p2.exclude.map(function (e) { return e.rel; }).indexOf('core/a.js') >= 0,
    'B5 破坏①：抽掉 product-files.js 后 core/a.js 真被排（B1 的前提确实在起作用）',
    p2.exclude.map(function (e) { return e.rel; }).join(','));
  // 反向对照：抽掉「测试引用文本」⇒ 同一个文件必须真被排
  const nr = miniRoot('no-ref', { withRef: false });
  const p3 = withCandidate(CATCH_ALL, function () { return MS.profile({ root: nr }); });
  a(p3.exclude.map(function (e) { return e.rel; }).indexOf('keep.txt') >= 0,
    'B6 破坏②：抽掉引用它的测试后 keep.txt 真被排（B2 的前提确实在起作用）',
    p3.exclude.map(function (e) { return e.rel; }).join(','));
  a(MS.CANDIDATES.length === 5, 'B7 候选表仍是原来的 5 条', String(MS.CANDIDATES.length));
}

// ══════════════════════ C. 接入面 ══════════════════════
function runC() {
  console.log('C. 接入面（隔离器真的用了它，且读不到就不排）');
  const src = fs.readFileSync(path.join(ROOT, 'tests/isolated-runner.js'), 'utf8');
  a(src.indexOf('mirror-slim.js') >= 0,
    'C1 隔离器引用了 mirror-slim', 'missing');
  a(src.indexOf('.exclusionSet(') >= 0, 'C2 隔离器调的是 exclusionSet（清单真源）', 'missing');
  a(src.indexOf("WA_SLIM === '0'") >= 0, 'C3 有逃生开关（WA_SLIM=0 可关掉瘦身）', 'missing');
  const empty = MS.exclusionSet(path.join(ROOT, 'zz-no-such-root-zz'));
  a(empty instanceof Set && empty.size === 0, 'C4 读不到清单 ⇒ 空集（保守失败：宁可不排）',
    String(empty && empty.size));
  // 端到端：隔离器走的就是同一份清单（子进程真跑一条 prep 面，不启动整趟）
  const r = cp.spawnSync(process.execPath, ['-e',
    'const S=require("./tools/mirror-slim.js").exclusionSet();const R=require("./tests/isolated-runner.js");' +
    'process.stdout.write(String(S.size)+"/"+typeof R.snapshot);'],
  { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  a(/^\d+\/function$/.test(String(r.stdout || '').trim()),
    'C5 同进程里 exclusionSet 与 runner 的 snapshot 都可用（装配无循环依赖）',
    String(r.stdout || '').trim().slice(0, 40));
}
const p = runA();
runB();
runC();
tmpDirs.forEach(function (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });
console.log('\nOPV29-Z1-03-V2529: ' + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
if (fails.length) { fails.forEach(function (f) { console.log('  · ' + f); }); process.exitCode = 1; }