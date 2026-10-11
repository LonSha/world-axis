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

/**
 * v2.204.0（第一批）：README 的**人读锚点**纳入本门禁 —— 「给人读的那一处与真源脱节」。
 *
 * ── 它治的病（现场实证，不是推测）──────────────────────────────────────
 *   ① README 的「安装」第一步写着「下载 Release 的 WorldAxis.zip」，而现场
 *      `git tag` / `git ls-remote --tags` **都是 0** —— 用户照做会在第一步卡死，
 *      而八道门禁一条都不会响（它们全都读源码与账本，**没有一道读 README 的用户面**）。
 *   ② README 的版本锚点停在 `v2.173.0`（当时现场 v2.203.0），`通过 15680` 停在
 *      v2.173.0 收尾轮的读数 —— 同族：**人读的那一处与真源脱节**。
 *
 * ── 口径（三条，全部机械可核）──────────────────────────────────────────
 *   ① **版本锚点**：README「构建与验收」标题里的 `（当前版本 vX.Y.Z）` 必须逐字等于
 *      `index.js` 的 VERSION（与 manifest 的一致性由 v2.106.0 段守）。
 *   ② **Release 声明 ↔ 现场 tag**：README 的「安装」节里若出现「下载 Release」这类
 *      指令，现场必须有 tag（`git tag` 非空）；**零 tag 时那条指令是把用户送进死路**。
 *   ③ **安装入口必须真的存在**：安装节里必须有一条**不依赖 Release**的可用路径
 *      （`git clone` 或 `extensions/third-party/WorldAxis`）。① 的修法是「把错的话删掉」，
 *      ③ 防的是「删掉之后一个安装法都不剩」—— 两条必须同批。
 *
 * ── 不判的（如实登记）──────────────────────────────────────────────────
 *   · **不判** README 里那句「通过 N / 失败 M」是否等于最新全量读数：全量要 29 分钟，
 *     判据不能在门禁里跑它。故本版把 README 的读法改成**指向现场**（`node tests/run.js`
 *     自己会打印），而本函数只钉「版本锚点 / Release / 安装入口」三件能秒级复算的事。
 *     这是刻意的边界：**算不出来的不冒充判据**（本仓既有裁决）。
 *   · 不作「文档措辞」评判；只认上述三种**可机械核对**的形态。
 *
 * opt.read 可注入（负控制据此在内存副本上做真破坏），opt.tags 可注入（免跑 git）。
 */
function anchors(opts) {
  const o = opts || {};
  const root = o.root || BASE;
  const read = o.read || function (rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); };
  const problems = [], facts = {};
  let readme = null, indexSrc = null;
  try { readme = read('README.md'); } catch (e) { return { ok: false, reason: 'readme-unreadable', problems: [{ kind: 'readme-unreadable' }], facts: facts }; }
  try { indexSrc = read('index.js'); } catch (e) { return { ok: false, reason: 'index-unreadable', problems: [{ kind: 'index-unreadable' }], facts: facts }; }
  const vm = (indexSrc.match(/const VERSION = '(\d+\.\d+\.\d+)'/) || [])[1] || null;
  facts.version = vm;
  // ① 版本锚点：README 的「构建与验收（当前版本 vX.Y.Z）」
  const head = (readme.match(/^##\s*构建与验收（当前版本 v(\d+\.\d+\.\d+)）/m) || [])[1] || null;
  facts.readmeVersionAnchor = head;
  if (!head) problems.push({ kind: 'no-version-anchor' });
  else if (head !== vm) problems.push({ kind: 'stale-version-anchor', readme: head, live: vm });
  // 「安装」节切片：从 `## 安装` 到下一个 `## `
  const L = readme.split('\n');
  const at = L.findIndex(function (x) { return /^##\s*安装\s*$/.test(x); });
  let sect = '';
  if (at < 0) problems.push({ kind: 'no-install-section' });
  else {
    let j = L.length;
    for (let k = at + 1; k < L.length; k++) { if (/^##\s/.test(L[k])) { j = k; break; } }
    sect = L.slice(at, j).join('\n');
  }
  facts.installSection = sect ? sect.length : 0;
  // ② Release 声明 ↔ 现场 tag
  let tags = o.tags;
  if (tags === undefined) {
    tags = [];
    try { tags = String(require('child_process').execSync('git -C ' + JSON.stringify(root) + ' tag', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
    catch (e) { tags = []; }
  }
  facts.tags = tags.length;
  const claimsRelease = /下载\s*Release|Release\s*的|Releases?\s*页/.test(sect);
  facts.claimsRelease = claimsRelease;
  if (claimsRelease && tags.length === 0) problems.push({ kind: 'release-claim-without-release', tags: 0 });
  // ③ 安装入口必须真的存在（不依赖 Release 的那条路）
  const hasClone = /git\s+clone/.test(sect);
  const hasPath = /extensions\/third-party\/WorldAxis/.test(sect);
  facts.installEntry = hasClone ? 'git-clone' : (hasPath ? 'manual-path' : 'none');
  if (!hasClone && !hasPath) problems.push({ kind: 'no-install-entry' });
  return { ok: problems.length === 0, problems: problems, facts: facts };
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
  // v2.204.0：README 的人读锚点（第二条命；`--anchors` 单独跑这一面）
  const an = anchors({});
  console.log('■ README 人读锚点（v2.204.0）');
  if (an.reason) {
    console.log('  ⚠ 读不了：' + an.reason);
  } else {
    console.log('  版本锚点 ' + (an.facts.readmeVersionAnchor || '（缺）') + ' vs 现场 ' + an.facts.version
      + ' · tag ' + an.facts.tags + ' 个 · Release 声明 ' + (an.facts.claimsRelease ? '有' : '无')
      + ' · 安装入口 ' + an.facts.installEntry);
    an.problems.forEach(function (p) { console.log('  ✗ ' + p.kind + (p.readme ? '（README ' + p.readme + ' / 现场 ' + p.live + '）' : '')); });
    if (an.ok) console.log('  ✓ 三件事同源（版本锚点 = index.js；Release 声明有 tag 支撑；安装入口在场）');
  }
  if (args.indexOf('--json') >= 0) console.log(JSON.stringify({ total: r.total, documented: r.documented, rate: r.rate, rows: r.rows, missing: r.missing, partial: r.partial, anchors: an }, null, 1));
  if (args.indexOf('--anchors') >= 0) process.exit(an.ok ? 0 : 1);
  process.exit(args.indexOf('--strict') >= 0 ? (r.missing.length ? 1 : 0) : 0);
}

module.exports = { BASE: BASE, scanSource: scanSource, audit: audit, anchors: anchors, reference: reference };