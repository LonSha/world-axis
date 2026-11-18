#!/usr/bin/env node
/**
 * WorldAxis tools/mirror-slim.js (v2.524.0) — OPV29-03 隔离器瘦身
 *
 * ── 它治什么（本版现场）───────────────────────────────────
 *   `tests/isolated-runner.js` 的 `files(root)` 是把**整棵树**走一遭、再逐文件 `copyFileSync`。
 *   现场量：工作树 39M，其中 `plans/evidence/` 3.5M、迭代流水 1.9M、`*.log` 若干 ——
 *   这些字节**在候选树里一次都不会被读**，却每次趟都被复制一遍（还要各算一次 sha256）。
 *   一趟全量起一次隔离器就复制一次；分片并行（OPV29-01）时是 N 次。
 *
 * ── 三条铁律（比瘦身本身更重要）────────────────────────────
 *   ① **产品面一个字节都不许排**：`tests/product-files.js` 列出的就是被测面，
 *      只要命中它就拒绝排除（`why:'product'`）。拒绝优先于任何配置。
 *   ② **被测试提到的不排除**：候选文件一旦在 `tests/*.js` 的文本里出现（文件名或相对路径），
 *      就不排它 —— 因为锁可能真的去读它（`doc-gate` 那类就是）。判据是**文本证据**，
 *      不是「反正它是日志」。
 *   ③ **不承诺目标值**：计划里写的是 85M → <20M，那是计划编写时的现场；
 *      本工具只报**本次量到的**前后字节与比例，并如实给 `targetReached:false`，
 *      绝不为凑目标去排 `tests/` 或 `engines/`（那会让被测面变小，绿灯随之变假）。
 *
 * ── 用法 ──────────────────────────────────────────────────
 *   node tools/mirror-slim.js            # 出清单与读数
 *   node tools/mirror-slim.js --json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// 历史流水名用拼接构造：本文件若逐字写出它，自身的文本扫描会把自己当成「被引用」。
const ITER = 'ITERATION' + '_LOG.md';

/** 候选排除项：每一条都要能说清「为什么它不会被读」。 */
const CANDIDATES = [
  { why: 'evidence-log', test: function (r) { return /^plans\/evidence\//.test(r); } },
  { why: 'iteration-log', test: function (r) { return r === ITER; } },
  { why: 'log-suffix', test: function (r) { return /\.log$/i.test(r); } },
  { why: 'backup-suffix', test: function (r) { return /\.(bak|orig|rej)$/i.test(r) || /~$/.test(r); } },
  { why: 'temp-suffix', test: function (r) { return /\.(tmp|swp|swo)$/i.test(r); } }
];

/** 产品面真源：拿不到就当「全部是产品」，即一个都不排（保守失败）。 */
function productSet(root) {
  try {
    const list = require(path.join(root, 'tests', 'product-files.js')).productFiles(root) || [];
    const s = Object.create(null);
    list.forEach(function (r) { s[String(r).replace(/\\/g, '/')] = 1; });
    return s;
  } catch (e) { return null; }
}

/** 测试文本（只看 tests/*.js）：用于「被提到就不排」。 */
function testText(root) {
  let names = [];
  try { names = fs.readdirSync(path.join(root, 'tests')); } catch (e) { return []; }
  const out = [];
  names.forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    try { out.push({ rel: 'tests/' + f, text: fs.readFileSync(path.join(root, 'tests', f), 'utf8') }); }
    catch (e) { /* 读不到就不作为证据 */ }
  });
  return out;
}

/** 走树（与 isolated-runner.files 同口径：跳过 .git / node_modules，拒收符号链接）。 */
function walk(root) {
  const out = [];
  (function rec(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('symlink rejected: ' + path.relative(root, abs));
      if (entry.isDirectory()) rec(abs);
      else if (entry.isFile()) out.push(path.relative(root, abs).replace(/\\/g, '/'));
      else throw new Error('nonregular file rejected');
    }
  })(root);
  return out.sort();
}

function bytesOf(root, rels) {
  let n = 0;
  rels.forEach(function (r) { try { n += fs.statSync(path.join(root, r)).size; } catch (e) { /* 并发删掉的按 0 计 */ } });
  return n;
}

/** 清单：返回 { exclude, skipped, sizeBefore, sizeAfter, saved, savedPct, targetReached }。**只报不改**。 */
function profile(opts) {
  const o = opts || {};
  const root = o.root || BASE;
  const all = o.files || walk(root);
  const prod = productSet(root);
  const texts = testText(root);
  const exclude = [], skipped = [];
  all.forEach(function (rel) {
    let why = null;
    for (let i = 0; i < CANDIDATES.length; i += 1) { if (CANDIDATES[i].test(rel)) { why = CANDIDATES[i].why; break; } }
    if (!why) return;
    if (prod && prod[rel]) { skipped.push({ rel: rel, why: 'product' }); return; }
    const hit = texts.filter(function (t) { return t.text.indexOf(rel) >= 0 || t.text.indexOf(rel.split('/').pop()) >= 0; });
    if (hit.length) { skipped.push({ rel: rel, why: 'referenced:' + hit[0].rel }); return; }
    exclude.push({ rel: rel, why: why });
  });
  const exRels = exclude.map(function (e) { return e.rel; });
  const before = bytesOf(root, all);
  const after = bytesOf(root, all.filter(function (r) { return exRels.indexOf(r) < 0; }));
  const saved = before - after;
  const targetBytes = 20 * 1024 * 1024;
  return {
    root: root,
    files: all.length,
    exclude: exclude,
    skipped: skipped,
    sizeBefore: before, sizeAfter: after, saved: saved,
    savedPct: before ? Number((saved / before * 100).toFixed(1)) : 0,
    targetBytes: targetBytes,
    // 现场 39M 里 tests/ + engines/ 就占 27M，两者都不能排 ⇒ 目标到不了；如实说，不改口径。
    targetReached: after <= targetBytes,
    whyNotTarget: after <= targetBytes ? null
      : 'tests/ 与 engines/ 是被测面，排了就等于缩小被测面；剩余体积不可再降',
    productSet: prod ? Object.keys(prod).length : null
  };
}

/** 瘦身结果给隔离器用：返回一个 rel → true 的集合（拿不到 profile 就返回空集 = 不排）。 */
function exclusionSet(root) {
  try {
    const p = profile({ root: root || BASE });
    const s = new Set();
    p.exclude.forEach(function (e) { s.add(e.rel); });
    return s;
  } catch (e) { return new Set(); }
}

function main() {
  const asJson = process.argv.indexOf('--json') >= 0;
  const p = profile({});
  if (asJson) { console.log(JSON.stringify(p, null, 2)); return; }
  console.log('■ 候选排除 ' + p.exclude.length + ' 个（拒绝 ' + p.skipped.length + ' 个）');
  p.exclude.slice(0, 8).forEach(function (e) { console.log('  - ' + e.rel + '  [' + e.why + ']'); });
  if (p.exclude.length > 8) console.log('  … 其余 ' + (p.exclude.length - 8) + ' 个');
  if (p.skipped.length) {
    console.log('■ 拒绝排除：');
    p.skipped.slice(0, 6).forEach(function (s) { console.log('  ! ' + s.rel + '  [' + s.why + ']'); });
  }
  console.log('■ 体积：' + (p.sizeBefore / 1048576).toFixed(1) + 'M → ' + (p.sizeAfter / 1048576).toFixed(1) + 'M'
    + '（省 ' + (p.saved / 1048576).toFixed(1) + 'M / ' + p.savedPct + '%）');
  console.log('■ 目标 20M：' + (p.targetReached ? '达成' : '未达成 —— ' + p.whyNotTarget));
}

module.exports = { CANDIDATES: CANDIDATES, walk: walk, bytesOf: bytesOf, profile: profile, exclusionSet: exclusionSet };
if (require.main === module) main();
