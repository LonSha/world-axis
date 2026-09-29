#!/usr/bin/env node
// WorldAxis tools/anchor-scan.js —— v2.126.0（优化计划 P8）
//
// 【它治的病】
//   `tests/negative-control-audit.js`（v2.104.0）只覆盖「导出 `ANCHORS` 且形态统一（`{rel, txt}`）」
//   的锁 —— 实测 20/103。其余 82 把锁的锚点**无人核**：它们里的锚点漂了（从源码里消失、或
//   在本文件里出现多次），没有任何读数会说话，而每一把这样的锁的负控制都会**静默哑火**
//   （锚点没打中 ⇒ 破坏副本等于原版 ⇒ 负控制恒绿）。
//
// 【本办法】
//   在**不改变既有统一档判据**的前提下，把覆盖面推到非统一形态：按一组**具名形态模式**
//   在锁源码里认出「锚点原文」与「目标文件」，逐条核两件事 ——
//     ① 唯一性：锚点原文在目标文件里恰中 1 次（0 次 = 漂了；≥2 次 = 判据分不清打在哪）；
//     ② 纯度：锚点原文在**本文件**（锁自己）里恰出现 1 次（判据不得抄锚点串 —— H5）。
//
// 【诚实边界（P8 计划原文：形态不一的如实归 unidentified，只报不红）】
//   · 认不出形态的锁如实进 `unidentified`，**不假装已覆盖**（列表逐条列出，可人工排查）。
//   · 认得出形态的进 `scanned`，其问题写进 `issues` —— **本版只报不红**：
//     判据（红/绿）仍由 `tests/negative-control-audit-v2104.js` 对**统一档**把住，
//     本工具的价值是「让 82 把锁的锚点第一次有了读数」。这是刻意的分步：
//     先让不可见的可见，再谈把哪一档升格成门禁。
//   · 启发式必然有假阳/假阴：所有判定都带 `pattern`（哪条模式认出来的）与 `evidence`，
//     读的人可以对着证据复核，而不是只看一个数字。
//
// 用法：node tools/anchor-scan.js [--json]
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const TESTS = path.join(BASE, 'tests');
const AUDIT = require(path.join(TESTS, 'negative-control-audit.js'));

/** 形态模式：每条给出「怎么认锚点原文 / 怎么认目标文件」。全部**只读文本**，不 require 被测锁。 */
const PATTERNS = [
  { id: 'anchor-const', what: 'const ANCHOR_X = "…"（具名常量）',
    re: /const\s+(ANCHOR[A-Z0-9_]*)\s*=\s*(['"`])([\s\S]*?)\2\s*;/g,
    kind: 'anchor', group: 3 },
  { id: 'txt-field', what: 'txt: "…"（对象字段，形态接近统一档）',
    re: /txt\s*:\s*(['"`])([\s\S]*?)\1/g,
    kind: 'anchor', group: 2 },
  { id: 'from-field', what: 'from: "…"（破坏锚点的 from 字段）',
    re: /from\s*:\s*(['"`])([\s\S]*?)\1/g,
    kind: 'anchor', group: 2 },
  { id: 'file-const', what: 'const REL/FILE/MOD = "rel"（唯一的文件常量）',
    re: /const\s+[A-Z][A-Z0-9_]*\s*=\s*(['"])([a-z][\w.-]*\/[\w.-]+\.js)\1\s*;/g,
    kind: 'target', group: 2 },
  { id: 'path-join', what: 'path.join(BASE, "rel")',
    re: /path\.join\(\s*BASE\s*,\s*(['"])([a-z][\w.-]*\/[\w.-]+\.js)\1\s*\)/g,
    kind: 'target', group: 2 },
  { id: 'src-override', what: "{ 'rel': … }（srcOverride 的键）",
    re: /srcOverride\s*:\s*\{\s*(['"])([a-z][\w.-]*\/[\w.-]+\.js)\1/g,
    kind: 'target', group: 2 }
];
/** 自引用排除：本工具与统一档审计器本身不是被测锁。 */
const SELF = ['anchor-scan.js'];
function hits(s, x) { return x ? s.split(x).length - 1 : 0; }
function isLock(src) { return AUDIT.isLock(src); }

/** 从锁源码里抽出「锚点原文」与「目标文件」（去重、保序）。 */
function extract(src) {
  const anchors = [], targets = [];
  const seenA = {}, seenT = {};
  PATTERNS.forEach(function (P) {
    P.re.lastIndex = 0;
    let m;
    while ((m = P.re.exec(src))) {
      const v = m[P.group];
      if (!v || v.length < 8) continue;                      // 太短的一律不算锚点（噪声）
      if (P.kind === 'anchor') { if (!seenA[v]) { seenA[v] = 1; anchors.push({ txt: v, pattern: P.id }); } }
      else { if (!seenT[v]) { seenT[v] = 1; targets.push(v); } }
    }
  });
  return { anchors: anchors, targets: targets };
}
/** 单把锁：分类 + 逐锚点核。返回 {file, kind, anchors, targets, problems, unidentified} */
function scanLock(file, readCache) {
  const selfSrc = fs.readFileSync(path.join(TESTS, file), 'utf8');
  const ex = extract(selfSrc);
  const out = { file: file, anchors: ex.anchors.length, targets: ex.targets.length, problems: [] };
  if (!ex.anchors.length || !ex.targets.length) {
    out.kind = 'unidentified';
    out.why = !ex.anchors.length ? '认不出锚点原文（无具名常量 / 无 txt|from 字段）' : '认不出目标文件（无文件常量 / 无 path.join / 无 srcOverride 键）';
    return out;
  }
  out.kind = 'scanned';
  const only = ex.targets.length === 1 ? ex.targets[0] : null;
  ex.anchors.forEach(function (a) {
    // 目标：唯一文件常量时用它；多文件时要求锚点原文至少命中其中一个（否则无从归属）
    let tgt = only, n = -1;
    if (tgt) n = hits(readCache(tgt).src, a.txt);
    else {
      let found = null, cnt = 0;
      ex.targets.forEach(function (t) {
        const c = hits(readCache(t).src, a.txt);
        if (c > 0) { cnt++; found = t; n = c; }
      });
      tgt = cnt === 1 ? found : null;
      if (cnt !== 1) n = -1;   // 多处命中或一处未中 ⇒ 统一走「归属不明」归因
    }
    if (n !== 1) {
      // 两种情形分开报：**确定的问题**（单一目标里 0 次或多次）与**归属不明**
      //   （多目标都命中 ⇒ 认不出这锚点属于谁）。混为一谈会让「只报不红」的面刷出一堆
      //   无法行动的条目（本仓纪律：报出来的每一条都要有人能做点什么）。
      out.problems.push({ file: file, pattern: a.pattern,
        kind: (n === 0 && tgt) ? 'not-found' : (tgt ? 'not-unique' : 'ambiguous-target'),
        target: tgt || '(未知)',
        detail: '在 ' + (tgt || '（多个目标）') + ' 命中 ' + (n < 0 ? '?' : n) + ' 次（要求恰 1）',
        evidence: a.txt.slice(0, 70) });
    }
    // 纯度：锚点原文在本文件里恰 1 次（判据不得抄锚点串）
    const selfN = hits(selfSrc, a.txt.replace(/\n/g, '\\n'));
    if (selfN !== 1) {
      out.problems.push({ file: file, pattern: a.pattern, kind: 'impure',
        detail: '字面量在本文件出现 ' + selfN + ' 次（要求 1；判据不得引用锚点串）', evidence: a.txt.slice(0, 70) });
    }
  });
  return out;
}
function scan(opts) {
  const o = opts || {};
  const readCache = (function () {
    const c = Object.create(null);
    return function (rel) {
      if (c[rel]) return c[rel];
      let src = '';
      try { src = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { src = ''; }
      c[rel] = { src: src };
      return c[rel];
    };
  })();
  // ① 统一档：**委托**既有审计器（不另写一份判定）
  const uni = AUDIT.audit();
  const uniformFiles = uni.locks.filter(function (l) { return l.kind === AUDIT.KINDS.UNIFORM; })
    .map(function (l) { return l.file; });
  const nonUniformFiles = uni.locks.filter(function (l) { return l.kind === AUDIT.KINDS.NON_UNIFORM; })
    .map(function (l) { return l.file; });
  // ② 非统一档：本工具的启发式面
  const scanned = [], unidentified = [];
  nonUniformFiles.forEach(function (f) {
    if (SELF.indexOf(f) >= 0) return;
    const r = scanLock(f, readCache);
    (r.kind === 'scanned' ? scanned : unidentified).push(r);
  });
  const issues = [];
  scanned.forEach(function (r) { r.problems.forEach(function (p) { issues.push(p); }); });
  return {
    uniform: { locks: uniformFiles.length, anchors: uni.summary.anchors, problems: uni.summary.problems },
    nonUniform: {
      total: nonUniformFiles.length,
      scanned: scanned.length,
      unidentified: unidentified.length,
      anchors: scanned.reduce(function (a, r) { return a + r.anchors; }, 0),
      issues: issues.length
    },
    scanned: scanned,
    unidentified: unidentified.map(function (r) { return { file: r.file, why: r.why }; }),
    issues: issues,
    summary: {
      locksTotal: uni.summary.locks,
      reach: uniformFiles.length + scanned.length,
      reachRate: uni.summary.locks ? Math.round((uniformFiles.length + scanned.length) / uni.summary.locks * 10000) / 100 : 0,
      problems: uni.summary.problems + issues.length,
      gateProblems: uni.summary.problems          // 只把统一档算进门禁（非统一档本版只报）
    }
  };
}
module.exports = { PATTERNS: PATTERNS, extract: extract, scanLock: scanLock, scan: scan, BASE: BASE };
if (require.main === module) {
  const r = scan({});
  if (process.argv.indexOf('--json') >= 0) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
  console.log('■ 锚点扫描器（统一档委托审计器 + 非统一档启发式）');
  console.log('  锁总数 ' + r.summary.locksTotal + ' · 覆盖 ' + r.summary.reach
    + '（' + r.summary.reachRate + '%）＝ 统一档 ' + r.uniform.locks + ' + 非统一档已识别 ' + r.nonUniform.scanned);
  console.log('  统一档：' + r.uniform.anchors + ' 条锚点 · 问题 ' + r.uniform.problems + '（**门禁面**）');
  console.log('  非统一档：' + r.nonUniform.total + ' 把 · 已识别 ' + r.nonUniform.scanned
    + '（' + r.nonUniform.anchors + ' 条锚点）· 未识别 ' + r.nonUniform.unidentified
    + ' · 问题 ' + r.nonUniform.issues + '（只报不红）');
  if (r.issues.length) {
    console.log('  ── 非统一档问题（**只报不红**；逐条附形态与证据，可人工复核）──');
    r.issues.slice(0, 40).forEach(function (p) {
      console.log('    · ' + p.file + ' [' + p.pattern + '] ' + p.kind + '：' + p.detail);
      if (p.evidence) console.log('        证据：' + p.evidence);
    });
    if (r.issues.length > 40) console.log('    …另 ' + (r.issues.length - 40) + ' 条');
  }
  if (r.unidentified.length) {
    console.log('  ── 未识别（如实登记，不假装已覆盖）──');
    r.unidentified.slice(0, 25).forEach(function (u) { console.log('    · ' + u.file + '：' + u.why); });
    if (r.unidentified.length > 25) console.log('    …另 ' + (r.unidentified.length - 25) + ' 把');
  }
  process.exit(r.summary.gateProblems === 0 ? 0 : 1);
}