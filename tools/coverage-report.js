#!/usr/bin/env node
/**
 * WorldAxis tools/coverage-report.js (v2.110.0) — 轻量代码覆盖追踪（计划一 #25）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   本仓的「覆盖率」此前只有两个宏观读数（出口面成员数、死子面条目数），它们回答
 *   **「这个口有没有人调」**，回答不了**「这个函数里面的哪几条分支从没跑过」**。
 *   实测动机：`engines/perf-trace.js` 的 `importSnapshot()` 有 6 条失败分支
 *   （`snapshot-version-mismatch` / `layer-added` / …），回归全绿，而其中 4 条的
 *   **代码从未被执行过** —— 全绿是真的（现有判据确实都过），但「有没有判据覆盖到它」
 *   是另一个问题，而这个问题没有任何读数。
 *
 * ── 三条口径（否定式）──────────────────────────────────────────────────
 *   ① **零依赖**：只用 Node 内置 `fs`/`path`。V8 覆盖率数据由 `NODE_V8_COVERAGE=<dir>`
 *      环境变量让运行时自己吐出来（`*.json`），本工具只解析 —— 不引入 istanbul/c8。
 *   ② **不制造读数**：目录不存在 ⇒ 报 `no-data` 并给出**怎么产出数据**的命令，绝不
 *      打印 0%/100% 之类的伪读数。空目录同样是 `no-data`（「没数据」≠「覆盖率为 0」）。
 *   ③ **只报不改**：本工具不做门禁、不写任何文件、不设阈值 —— 覆盖率一旦变成硬门禁，
 *      下一步就是「为了达标而写没有判据的测试」（本仓 v2.79.0 立过的规矩：
 *      读数可以要求被**看见**，但不得要求被**满足**）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

/** 行首偏移表（把 `startOffset/endOffset` 换成行号区间）。 */
function lineStarts(src) {
  const out = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') out.push(i + 1);
  return out;
}
function lineOf(starts, off) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
  return lo + 1;
}

/** 把 V8 覆盖率 JSON 里的一个 script 结果折算成「字节覆盖 + 未覆盖行」。 */
function foldScript(script, src) {
  const starts = lineStarts(src);
  // 收集全部区间。**必须按 V8 的嵌套语义取最内层**：V8 的 range 是**逐层细化**的
  //   （最外层区间覆盖整个脚本、count=1；内层未执行的块是 count=0 的子区间）。
  //   首版把「count>0 的区间」逐字节 OR 起来，于是外层那条覆盖全文件的区间让
  //   **每一个字节都算覆盖** —— 实测一个含 `neverRun()` 的探针报 100%。
  //   这正是本工具要治的那类读数：**全绿看起来总是好的**。
  const ranges = [];
  (script.functions || []).forEach(function (f) {
    (f.ranges || []).forEach(function (r) {
      const a = Math.max(0, r.startOffset | 0), b = Math.min(src.length, r.endOffset | 0);
      if (b > a) ranges.push({ a: a, b: b, c: r.count | 0 });
    });
  });
  // 长的在前 ⇒ 先赋外层、短的最后覆盖 ⇒ 每个字节留下的是**最内层**区间的计数。
  ranges.sort(function (x, y) { return (y.b - y.a) - (x.b - x.a); });
  const hit = new Array(src.length).fill(0);
  ranges.forEach(function (r) {
    for (let i = r.a; i < r.b; i++) hit[i] = r.c;
  });
  let covered = 0;
  for (let i = 0; i < hit.length; i++) if (hit[i] > 0) covered++;
  const lines = starts.length;
  const coveredLines = [];
  for (let i = 0; i < lines; i++) {
    const a = starts[i], b = (i + 1 < lines) ? starts[i + 1] : src.length;
    let any = false;
    for (let j = a; j < b && !any; j++) if (hit[j] > 0) any = true;
    if (any) coveredLines.push(i + 1);
  }
  return { bytes: src.length, coveredBytes: covered, lines: lines, coveredLines: coveredLines.length,
    ratio: src.length ? covered / src.length : 0, lineRatio: lines ? coveredLines.length / lines : 0 };
}

/** 解析一个 V8 覆盖率目录。返回 `{ok, reason, rows, raw}` —— 不抛。 */
function collect(dir, opts) {
  const o = opts || {};
  const base = o.root || BASE;
  const d = dir || process.env.NODE_V8_COVERAGE || '';
  if (!d) return { ok: false, reason: 'no-data', hint: '先跑 NODE_V8_COVERAGE=' + path.join(base, 'coverage') + ' node tests/run.js', rows: [] };
  let files = [];
  try { files = fs.readdirSync(d).filter(function (f) { return /\.json$/.test(f); }); }
  catch (e) { return { ok: false, reason: 'no-data', hint: '目录不存在：' + d + '（覆盖率数据须由 NODE_V8_COVERAGE 产出）', rows: [] }; }
  if (!files.length) return { ok: false, reason: 'no-data', hint: '目录为空：' + d, rows: [] };
  const byRel = {};
  files.forEach(function (f) {
    let parsed = null;
    try { parsed = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { return; }
    (parsed.result || []).forEach(function (sc) {
      const url = String(sc.url || '');
      if (!url || url.indexOf('node:') === 0) return;
      let rel = url.replace(/^file:\/\//, '');
      try { rel = decodeURIComponent(rel); } catch (e) { /* 保持原串 */ }
      if (path.isAbsolute(rel)) rel = path.relative(base, rel);
      if (rel.indexOf('..') === 0 || path.isAbsolute(rel)) return;      // 仓库外的（node 内部模块等）一律不算
      if (!/\.js$/.test(rel)) return;
      let src = '';
      try { src = fs.readFileSync(path.join(base, rel), 'utf8'); } catch (e) { return; }
      const folded = foldScript(sc, src);
      const prev = byRel[rel];
      if (!prev || folded.coveredBytes > prev.coveredBytes) byRel[rel] = folded;
    });
  });
  const rows = Object.keys(byRel).sort().map(function (rel) {
    const r = byRel[rel];
    return { file: rel, bytes: r.bytes, coveredBytes: r.coveredBytes, lines: r.lines,
      coveredLines: r.coveredLines, ratio: r.ratio, lineRatio: r.lineRatio };
  });
  if (!rows.length) return { ok: false, reason: 'no-data', hint: '数据里没有仓库内文件（' + d + '）', rows: [] };
  return { ok: true, reason: '', rows: rows, dir: d, files: files.length };
}

/** 逐行读数（计划原文的形态：`core/store.js 89% (234/263 行)`）。 */
function summary(rows, limit) {
  const L = [];
  const sorted = rows.slice().sort(function (a, b) { return a.ratio - b.ratio; });
  const show = limit ? sorted.slice(0, limit) : sorted;
  show.forEach(function (r) {
    L.push('  ' + r.file + ' ' + (r.ratio * 100).toFixed(0) + '% ('
      + r.coveredLines + '/' + r.lines + ' 行)');
  });
  if (limit && rows.length > limit) L.push('  …（共 ' + rows.length + ' 个文件，完整清单用 --json）');
  return L.join('\n');
}
function totals(rows) {
  const t = rows.reduce(function (a, r) { a.bytes += r.bytes; a.covered += r.coveredBytes; a.lines += r.lines; a.covLines += r.coveredLines; return a; }, { bytes: 0, covered: 0, lines: 0, covLines: 0 });
  t.ratio = t.bytes ? t.covered / t.bytes : 0;
  t.lineRatio = t.lines ? t.covLines / t.lines : 0;
  t.files = rows.length;
  return t;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = args.filter(function (a) { return a.indexOf('--') !== 0; })[0] || '';
  const r = collect(dir, {});
  console.log('■ 代码覆盖率（NODE_V8_COVERAGE，零依赖解析）');
  if (!r.ok) { console.log('  ⚠ ' + r.reason + '：' + r.hint); process.exit(0); }
  const t = totals(r.rows);
  console.log('  合计 ' + (t.ratio * 100).toFixed(1) + '%（' + t.covLines + '/' + t.lines + ' 行 · ' + t.files + ' 个文件）');
  console.log('  · 覆盖最低的前 12 个文件：');
  console.log(summary(r.rows, 12));
  if (args.indexOf('--json') >= 0) console.log(JSON.stringify({ totals: t, rows: r.rows }, null, 1));
  process.exit(0);
}

module.exports = { BASE: BASE, collect: collect, summary: summary, totals: totals, foldScript: foldScript, lineStarts: lineStarts, lineOf: lineOf };