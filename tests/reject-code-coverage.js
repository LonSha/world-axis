#!/usr/bin/env node
'use strict';
/**
 * tests/reject-code-coverage.js — 拒收码「预期分类库 + 覆盖率」单一真源（v2.107.0 计划一 #17）。
 *
 * 为什么需要它（本模块治什么）：
 *   v2.78.0 把「码写在源码里」变成了「码必须二选一归属」（见证 / 死表 / 基线），
 *   但治的是**无归属**。三者之后还有两件没人管的事：
 *     ① **覆盖率从来不是一个可读的数字** —— 「见证 124 / 死表 5 / 基线 233」是三份名单各自的大小，
 *        而「产品源码里到底扫出多少个码」这个分母只活在门禁的打印行里；分母一变、总和不再相等，
 *        没人会注意到（三份名单可以同时各自“看起来正常”）。
 *     ② **预期码库会被静默覆盖** —— 见证表里 `want(code, desc)` 是字典赋值，同一码写两次时
 *        **第二处静默顶掉第一处的描述**（实测本仓 `missing-fields` 与 `not-bound` 各两处）。
 *        字典不报重，于是一条更精确的说明被一条更潦草的顶掉，看代码时两处都在、看结果时只剩一条。
 *        这与 `dup-decl-gate` 治的「重名 / 重文档 / 重函数体 ⇒ 静默覆盖」同族。
 *   另有一件本模块要**定义清楚**的事：
 *     ③ **延后见证必须显式声明**（DEFERRED）—— 若某条见证暂时跑不出来，它的码会落进 `missing`，
 *        与「行为被改坏了」长得一模一样。故本模块把「允许延后」变成一张**必须显式登记**的表：
 *        未登记的一律算真缺口，登记过的才算已接受（默认空表，即当前一条都不允许延后）。
 *
 * 口径（全部现场取真值，不读任何历史常量）：
 *   - 扫描面：复用 `tests/reject-code-gate.js` 的 `scan()`（去注释剥离 + 产品面 = 与死子面清册同宽）。
 *   - 见证面：复用 `runWitness()` 的真跑结果（`expect` / `seen`），不重跑、不重实现。
 *   - 死表 / 基线：复用 `reject-v2780.js` 的 `DEAD` 与 `reject-code-ledger.json` 的 `base`。
 *   - 声明面：静态解析见证表的 `want(code, ...)` 调用（**先剥注释**——注释里写的 `want(...)`
 *     是文档不是码；这条与 reject-code-gate 的扫描面同规矩，v2.78.0 已实证过一次“提及不是引用”）。
 *
 * 边界（如实登记）：
 *   - 只认 `want('code'` 字面量调用；拼接式写法（`want('a-' + x, ...)`）代码不确定，不报错也不伪归。
 *   - 覆盖率的分母是「**扫描面扫出的码**」，不是「运行时真跑过的码」；两者不等时由恒等式拒收。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const { stripComments } = require('./test-surface-gate.js');
const gate = require('./reject-code-gate.js');

/** 延后见证登记表（默认空 = 一条都不允许延后）。
 *  登记格式：code -> 理由（非空字符串）；未登记却 missing 的码一律算缺口。 */
const DEFERRED = {};

/** 见证表里的声明形态。 */
const WANT_RE = /\bwant\(\s*'([a-zA-Z][a-zA-Z0-9_-]*)'/g;

function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

/**
 * 静态声明面：见证表里声明了哪些码、各几次、在哪几行。
 * 先剥注释——注释里的 want() 是文档。
 */
function declarations(opt) {
  const d = opt || {};
  const src = stripComments(d.src !== undefined ? d.src : read('tests/reject-v2780.js'));
  const rows = [];
  const re = new RegExp(WANT_RE.source, 'g');
  let m;
  while ((m = re.exec(src)) !== null) {
    rows.push({ code: m[1], line: src.slice(0, m.index).split('\n').length });
  }
  const counts = {};
  rows.forEach(function (r) { counts[r.code] = (counts[r.code] || 0) + 1; });
  const duplicated = Object.keys(counts).filter(function (c) { return counts[c] > 1; })
    .map(function (code) {
      return { code: code, count: counts[code], lines: rows.filter(function (r) { return r.code === code; }).map(function (r) { return r.line; }) };
    });
  return { rows: rows, counts: counts, declared: Object.keys(counts).length, occurrences: rows.length, duplicated: duplicated };
}

/**
 * 三集划分 + 覆盖率 + 恒等式。
 *   total = 扫描面扫出的码数（分母）
 *   witnessed + dead + base 三个集合必须**恰好**铺满 total，且两两不相交。
 * 两两不相交由 tests/reject-lock-v2780.js 的 [B] 组把口（此处不重实现），本函数只算与核对总数。
 */
function coverage(deps) {
  const d = deps || {};
  const sc = d.scan && d.scan.hits ? d.scan : gate.scan(d);
  const codes = Object.keys(sc.hits).sort();
  const expect = d.expect || {};
  const dead = d.dead || {};
  const base = d.base || {};
  const seen = d.seen || null;

  const wCodes = Object.keys(expect).sort();
  const dCodes = Object.keys(dead).sort();
  const bCodes = Object.keys(base).sort();

  // 三集必须都是扫描面的子集（名单里有、源码里没有的码，各自的门禁已单独报，这里只做总数对齐）
  const inScan = function (c) { return !!sc.hits[c]; };
  const allInScan = wCodes.every(inScan) && dCodes.every(inScan) && bCodes.every(inScan);

  const sum = wCodes.length + dCodes.length + bCodes.length;
  const total = codes.length;
  const identityOk = sum === total && allInScan;

  const covered = wCodes.length + dCodes.length;
  const rate = total ? covered / total : 0;

  // 延后见证：声明了却跑不出来，且未在 DEFERRED 里登记的 —— 一律算缺口。
  const deferredRegistry = d.deferred || DEFERRED;
  const unwitnessed = seen === null ? [] : wCodes.filter(function (c) { return !seen[c]; });
  const undeclaredDefer = unwitnessed.filter(function (c) { return !(c in deferredRegistry); });

  return {
    total: total, witnessed: wCodes.length, dead: dCodes.length, base: bCodes.length,
    sum: sum, covered: covered, rate: rate, identityOk: identityOk, allInScan: allInScan,
    identities: { leftover: total - sum },
    undeclaredDefer: undeclaredDefer, deferred: unwitnessed,
    ok: identityOk && !undeclaredDefer.length
  };
}

/** 与门禁共用一句话读数（避免两处各写一种排版）。 */
function summary(deps) {
  const c = coverage(deps);
  const pct = (c.rate * 100).toFixed(2) + '%';
  return '拒收码 ' + c.total + ' 个（见证 ' + c.witnessed + ' / 死表 ' + c.dead + ' / 基线 ' + c.base
    + '）· 已定性 ' + c.covered + ' 个，覆盖率 ' + pct + '（口径：见证+死表 除以 扫描面总数，基线不算已定性）'
    + (c.identityOk ? ' · 恒等式平' : ' · 恒等式不平（差 ' + c.identities.leftover + '）');
}

/**
 * 运行时发现：真要装载产品面才拿得到见证结果。
 * 与 reject-code-gate 的 CLI 同机制（vm + 逐文件 runInContext）。
 */
function discover() {
  require('./mock.js');
  const vm = require('vm');
  const ctx = vm.createContext(global);
  const runSrc = read('tests/run.js');
  const mm = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
  const LOAD = mm[1].match(/'([^']+)'/g).map(function (x) { return x.slice(1, -1); });
  LOAD.forEach(function (rel) {
    vm.runInContext(read(rel), ctx, { filename: rel });
  });
  const witness = require('./reject-v2780.js');
  const ledger = JSON.parse(read('tests/reject-code-ledger.json'));
  const base = {};
  (ledger.base || []).forEach(function (c) { base[c] = true; });
  const w = witness.runWitness(global.WorldAxis);
  const c = coverage({ expect: w.expect, seen: w.seen, dead: witness.DEAD, base: base });
  const dec = declarations();
  return {
    coverage: c, summary: summary({ expect: w.expect, seen: w.seen, dead: witness.DEAD, base: base }),
    declarations: { declared: dec.declared, occurrences: dec.occurrences, duplicated: dec.duplicated },
    missing: w.missing, unexpected: w.unexpected, deferred: DEFERRED
  };
}

module.exports = {
  DEFERRED: DEFERRED,
  declarations: declarations,
  coverage: coverage,
  summary: summary,
  discover: discover,
  WANT_RE: WANT_RE
};
