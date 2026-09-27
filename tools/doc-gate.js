#!/usr/bin/env node
/**
 * WorldAxis tools/doc-gate.js (v2.110.0) — 文档注释的提取与验证（计划一 #26）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   本仓的「导出面」是**承诺**（`FROZEN2800` 逐字冻结 1362 个成员），但承诺的**语义**
 *   只写在部分函数的 JSDoc 里：实测 `engines/*.js` 的导出函数中，带 JSDoc 的比例
 *   远低于 100%，而缺注释这件事**在全部八道门禁下全绿**——因为没有一道读注释。
 *   于是唯一的文档就是源码本身，新读者要理解 `importSnapshot` 的返回值语义
 *   只能把 400 行读一遍（而它恰恰是最需要一句「problems 数组的四种取值」的函数）。
 *
 * ── 四条口径（否定式）──────────────────────────────────────────────────
 *   ① **只在 product 文件面扫**（`product-files.productFiles`，单一真源）：
 *      tests/ 与 tools/ 不参与 —— 它们的注释服务的是维护者，不是 API 使用者。
 *   ② **不判「注释够不够详细」**：只判三件能机械核对的事：
 *      · 有 JSDoc 块；· `@param` 条数**不少于**形参个数（多出来的是说明性条目，允许）；
 *      · 有 `@returns`（或 `@return`）。
 *      故意**不**检查 `@param` 的**名字**对不对：重命名形参时名字最易漂移，而这一层误报
 *      会让整套门禁被当成噪声（本仓 v2.105.0 的假红教训）。
 *   ③ **不自动补注释**：`--fix` 不存在。注释是给「为什么」的，机器生成的 `@param x` 是噪声。
 *   ④ **没注释是读数、不是红灯**（默认）：`--strict` 才让它退出码非 0。
 *      与 #25 同款纪律：读数可以被要求**看见**，不被要求**满足**。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

/** 抽出文件里所有「顶层 function 声明」及其前导注释块。 */
function scanSource(src) {
  const lines = String(src || '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
    if (!m) continue;
    // 前导注释块：向上收集连续的 `//` 与 `/* */` 行（中间允许空行，遇代码即停）
    let j = i - 1, doc = [], inBlock = false;
    while (j >= 0) {
      const t = lines[j].trim();
      if (t === '') { if (!doc.length) { j--; continue; } else break; }
      if (t.indexOf('*/') >= 0) { inBlock = true; doc.unshift(lines[j]); j--; continue; }
      if (inBlock) { doc.unshift(lines[j]); if (t.indexOf('/*') >= 0) inBlock = false; j--; continue; }
      if (t.indexOf('//') === 0) { doc.unshift(lines[j]); j--; continue; }
      break;
    }
    const docText = doc.join('\n');
    const params = m[3].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    const declares = (docText.match(/@param\b/g) || []).length;
    const returns = /@returns?\b/.test(docText);
    out.push({ name: m[2], line: i + 1, indent: m[1].length,
      params: params.length, declares: declares, returns: returns,
      hasDoc: /\/\*\*/.test(docText),
      docLen: docText.replace(/\s/g, '').length });
  }
  return out;
}

/** 逐个产品文件核对。返回 `{ok, files, missing, rows, negative}`——不抛。 */
function audit(opts) {
  const o = opts || {};
  const root = o.root || BASE;
  let files = [];
  try { files = require(path.join(root, 'tests', 'product-files.js')).productFiles(root); }
  catch (e) { return { ok: false, reason: 'product-files-unreadable', files: 0, rows: [], missing: [], partial: [] }; }
  const rows = [], missing = [], partial = [];
  files.forEach(function (rel) {
    let src = '';
    try { src = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return; }
    const fns = scanSource(src);
    if (!fns.length) return;
    let undocumented = 0, underdocumented = 0;
    fns.forEach(function (f) {
      if (!f.hasDoc) { undocumented++; missing.push({ file: rel, fn: f.name, line: f.line, why: 'no-jsdoc' }); return; }
      if (f.declares < f.params || (!f.returns && f.params > 0)) {
        underdocumented++;
        partial.push({ file: rel, fn: f.name, line: f.line,
          why: (f.declares < f.params ? '@param ' + f.declares + '<' + f.params : '') +
               (!f.returns ? ' 缺 @returns' : '') });
      }
    });
    rows.push({ file: rel, fns: fns.length, documented: fns.length - undocumented,
      undocumented: undocumented, underdocumented: underdocumented,
      rate: fns.length ? (fns.length - undocumented) / fns.length : 0 });
  });
  const total = rows.reduce(function (a, r) { return a + r.fns; }, 0);
  const doc = rows.reduce(function (a, r) { return a + r.documented; }, 0);
  return { ok: true, reason: '', files: files.length, rows: rows, missing: missing, partial: partial,
    total: total, documented: doc, rate: total ? doc / total : 0 };
}

/** 生成 API 参考草稿（**纯文本，不落盘**；落盘由调用方决定）。 */
function reference(rows, limit) {
  const L = ['# API 参考（从 JSDoc 提取；仅列有注释者）', ''];
  const withDoc = rows.filter(function (r) { return r.documented > 0; })
    .sort(function (a, b) { return b.documented - a.documented; }).slice(0, limit || 20);
  withDoc.forEach(function (r) {
    L.push('- `' + r.file + '` — ' + r.documented + '/' + r.fns + ' 个函数有 JSDoc');
  });
  return L.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const r = audit({});
  console.log('■ 文档注释门禁（product 文件面 · 只判可机械核对的三件事）');
  if (!r.ok) { console.log('  ⚠ ' + r.reason); process.exit(2); }
  console.log('  ' + r.files + ' 个产品文件 · ' + r.total + ' 个函数声明 · 有 JSDoc ' + r.documented
    + '（' + (r.rate * 100).toFixed(1) + '%）');
  if (r.missing.length) {
    console.log('  ⚠ 缺文档 ' + r.missing.length + ' 个（示例）：');
    r.missing.slice(0, 20).forEach(function (m) { console.log('    · ' + m.file + '::' + m.fn + '() 无 JSDoc'); });
    if (r.missing.length > 20) console.log('    …（共 ' + r.missing.length + '，完整清单用 --json）');
  }
  if (r.partial.length) {
    console.log('  ⚠ 注释不完整 ' + r.partial.length + ' 个（示例）：');
    r.partial.slice(0, 10).forEach(function (m) { console.log('    · ' + m.file + '::' + m.fn + '() ' + m.why); });
  }
  if (args.indexOf('--json') >= 0) console.log(JSON.stringify({ total: r.total, documented: r.documented, rate: r.rate, rows: r.rows, missing: r.missing, partial: r.partial }, null, 1));
  process.exit(args.indexOf('--strict') >= 0 ? (r.missing.length ? 1 : 0) : 0);
}

module.exports = { BASE: BASE, scanSource: scanSource, audit: audit, reference: reference };