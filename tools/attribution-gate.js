#!/usr/bin/env node
// WorldAxis tools/attribution-gate.js (v2.204.0) — 缝合来源清点表与 README 的**同源**判据
//
// ── 它治的病（README 里唯一一句无人核的承诺）────────────────────────────
//   README 的「缝合来源（机制蓝本）」表列了 13 个上游（其中 DlSNlGHT/World 贡献 5 个附加
//   机制面），末行只有一句「License: 各源项目机制参考已获原作者授权（非商业缝合）」。
//   **这句话此前没有任何判据**：没有 LICENSE 文件、没有逐条清点、没有一处说明
//   「每个上游的许可义务核对到什么程度」。读者唯一能做的判断是「相信作者」。
//   同族的失效形态在本仓各面反复现形过（写侧 / 删侧 / 读侧 / 活性面 / 出站面各有门禁），
//   唯独**义务面（attribution / license）是零治理**：README 加一个上游，
//   没有任何判据会问「它的许可核过没有」。
//
// ── 它判什么（三条，全部机械可核）──────────────────────────────────────
//   ① **起源面同步**：README 缝合来源表里出现的每个上游名，必须在 `docs/attribution.md`
//      的清点表里有一条对应行。缺一条即红 —— 清点表跟着 README 走，不跟着「谁想起来补一句」走。
//   ② **状态词合规**：清点表每一行的「许可状态」必须在有限词表内，**不许留空/写「待定」**
//      —— 空着会被读者当成「没事」，而它恰恰是「不知道」。
//   ③ **反空转下限**：清点行数不得低于 `MIN_ROWS`（空表上的「全部合规」恒真）。
//
// ── 口径（否定式）──────────────────────────────────────────────────────
//   · **不走 codeFace**：本工具读的是**两份 Markdown**，而 codeFace 会把字符串抹平
//     ⇒ 判据的输入面会窄于结论面。这里直接用原文，「输入面与结论面同宽」。
//   · **不判合法性**：它判「清点表完不完整、状态词合不合规」，**不判**「这样缝合对不对」
//     —— 后者要逐条读上游 LICENSE 并做人的判断。这条边界与 `doc-gate.anchors` 的
//     「算不出来的不冒充判据」同规。
//   · **不给自动修**：`--fix` 不存在。清点表的每一行是人对上游的判断，机器补不了。
//
// ── 用法 ──────────────────────────────────────────────────────────────
//   node tools/attribution-gate.js              # 清点 + 结论（有不合规即 exit 1）
//   node tools/attribution-gate.js --json       # 机器可读
//   node tools/attribution-gate.js --self-test  # 真源存在性自证（缺一个即抛）
//   const A = require('../tools/attribution-gate.js'); A.audit({readOf})   # 门禁复用同一份复算
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const README_REL = 'README.md';
const ATTR_REL = 'docs/attribution.md';
/** 许可状态词表（有限；扩词须**显式**改这里 —— 与 docs/attribution.md 的状态词表同源）。 */
const STATUS_WORDS = ['未核对', '已读许可', '已声明来源', '已获授权'];
/** 反空转下限：现场实测 17 行（13 个上游 + DlSNlGHT/World 的 5 个附加机制面，逐面单列）。 */
const MIN_ROWS = 13;
/**
 * README 缝合来源表的**上游名**提取：表行形如 `| world-backstage | 后台世界推演·… |`。
 * 取首列。跳过表头行（`| 源 | 机制 |`）与分隔行（`|---|`）。
 */
function readmeOrigins(readme) {
  const out = [];
  const lines = String(readme).split('\n');
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^\|\s*源\s*\|/.test(l)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!l.startsWith('|')) { if (out.length) break; else continue; }
    if (/^\|[\s\-:|]+\|$/.test(l)) continue;
    const cells = l.split('|').map(function (x) { return x.trim(); });
    // cells[0] 是空串（行首的 |），故首列在 cells[1]
    const name = (cells[1] || '').replace(/`/g, '').trim();
    if (!name) continue;
    out.push(name);
  }
  return out;
}
/**
 * 归一：去掉**全部空白**与尾部的括注 —— `DlSNlGHT/World (worldbook)`、
 * `DlSNlGHT/World（worldbook）`、`WNE引擎 / TH-剧情推进`、`WNE 引擎 / TH-剧情推进`
 * 必须归到同一个键（现场实测：README 与清点表在这三种形态上都可能多一个空格）。
 */
function normOrigin(s) {
  return String(s).replace(/\s*[（(][^）)]*[）)]\s*$/, '').replace(/\s+/g, '').trim();
}
/**
 * docs/attribution.md 的清点行：形如
 *   `| 1 | \`world-backstage\` | … | 已声明 | \`未核对\` | … |`
 * 返回 `[{no, upstream, statusRaw, raw}]`。
 *
 * ⚠ 状态列的**取法**（现场实测的装置缺陷）：首版写死 `cells[4]`，而真表的列序是
 *   `# | 上游 | 缝合的是什么 | 源码内出处声明 | 许可状态 | 下一步`（状态在 index 5）。
 *   写死下标 = 把「列序变了」这件事变成静默的读数错误（判据照跑、结论全错）。
 *   改为**按内容认列**：取倒数第二格；若它不在词表里，则从左往右找第一个词表内的格。
 *   都找不到就把倒数第二格原样报出来 —— 让 status-not-in-vocab 如实现形。
 */
function parseAttrRows(attr) {
  const out = [];
  const lines = String(attr).split('\n');
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^\|\s*#\s*\|/.test(l)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!l.startsWith('|')) { if (out.length) break; else continue; }
    if (/^\|[\s\-:|]+\|$/.test(l)) continue;
    const parts = l.split('|').slice(1, -1).map(function (x) { return x.trim(); });
    const no = parts[0] || '';
    if (!/^\d+$/.test(no)) continue;
    const upstream = (parts[1] || '').replace(/`/g, '').trim();
    // ⚠ 状态列的**取法**（现场实测的装置缺陷，两处）：首版写死 `cells[4]`，而真表的列序是
    //   `# | 上游 | 缝合的是什么 | 源码内出处声明 | 许可状态 | 下一步`（状态在 index 4 of parts）；
    //   第二版写「倒数第二格」，而 Markdown 行首尾各有一个空串（`| a | b |` ⇒ ['', 'a', 'b', '']）
    //   ⇒ 不先掐掉首尾空串，倒数第二格会落到「下一步」列上。
    //   现取法：先 `slice(1, -1)` 掐首尾，再**按词表认列**（倒数第一格起往前找）。
    //   写死下标或写死倒数位 = 把「列序变了」变成静默的读数错误；按词表认列则让
    //   「状态词不在词表里」如实现形为 `status-not-in-vocab`。
    let statusRaw = '';
    for (let k = parts.length - 1; k >= 1; k--) {
      const cand = (parts[k] || '').replace(/`/g, '').trim();
      if (STATUS_WORDS.indexOf(cand) >= 0) { statusRaw = cand; break; }
    }
    // 词表全不命中时，回落到**状态列的位置**（倒数第二格 —— 列序 `… | 许可状态 | 下一步 |`），
    // 而不是最后一格：回落错格会把「下一步」栏的说明文字当成状态词报出来（首版实测）。
    if (!statusRaw) statusRaw = (parts[parts.length - 2] || '').replace(/`/g, '').trim();
    out.push({ no: Number(no), upstream: upstream, statusRaw: statusRaw, raw: l });
  }
  return out;
}
/**
 * 现场核对。`opt.readOf` 可注入（负控制据此在**内存副本**上做真破坏后重跑同款判据）。
 * 返回 `{ok, origins, rows, problems, minRows, words}`，不抛。
 */
function audit(opt) {
  const o = opt || {};
  const root = o.root || BASE;
  const readOf = o.readOf || function (rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); };
  let readme, attr;
  try { readme = readOf(README_REL); }
  catch (e) { return { ok: false, reason: 'readme-unreadable', problems: [{ kind: 'readme-unreadable' }] }; }
  try { attr = readOf(ATTR_REL); }
  catch (e) { return { ok: false, reason: 'attr-unreadable', problems: [{ kind: 'attr-unreadable' }] }; }
  const origins = readmeOrigins(readme);
  const rows = parseAttrRows(attr);
  const problems = [];
  // ① 起源面同步：README 的每个上游必须在清点表里有对应行
  const have = rows.map(function (r) { return normOrigin(r.upstream); });
  origins.forEach(function (rg) {
    const key = normOrigin(rg);
    if (have.indexOf(key) < 0) problems.push({ kind: 'origin-missing-in-clearing', origin: key });
  });
  // ② 状态词合规
  rows.forEach(function (r) {
    if (!r.statusRaw) { problems.push({ kind: 'status-empty', no: r.no, upstream: r.upstream }); return; }
    if (STATUS_WORDS.indexOf(r.statusRaw) < 0) {
      problems.push({ kind: 'status-not-in-vocab', no: r.no, upstream: r.upstream, got: r.statusRaw });
    }
  });
  // ③ 反空转下限
  if (rows.length < MIN_ROWS) problems.push({ kind: 'too-few-rows', got: rows.length, min: MIN_ROWS });
  return { ok: problems.length === 0, origins: origins, rows: rows, problems: problems,
    minRows: MIN_ROWS, words: STATUS_WORDS };
}
/** 自证：两份真源存在且可读（缺一个即抛 —— 「算不出来不得当作算过」）。 */
function selfTest(opt) {
  const o = opt || {};
  const root = o.root || BASE;
  [README_REL, ATTR_REL].forEach(function (rel) {
    if (!fs.existsSync(path.join(root, rel))) throw new Error('真源缺失：' + rel);
  });
  const r = audit(opt);
  if (!r.origins.length) throw new Error('README 缝合来源表读成空集（扫描面塌了，本门禁会在空集上恒真）');
  if (!r.rows.length) throw new Error('清点表读成空集（同上）');
  return { ok: true, origins: r.origins.length, rows: r.rows.length };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.indexOf('--self-test') >= 0) {
    const s = selfTest({});
    console.log('■ attribution 自证：README 上游 ' + s.origins + ' 个 · 清点行 ' + s.rows + ' 条');
    process.exit(0);
  }
  const r = audit({});
  if (args.indexOf('--json') >= 0) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }
  console.log('■ 缝合来源清点门禁（README ↔ docs/attribution.md）');
  if (r.reason) { console.log('  ⚠ 读不了：' + r.reason); process.exit(2); }
  console.log('  README 上游 ' + r.origins.length + ' 个 · 清点行 ' + r.rows.length + ' 条（下限 ' + r.minRows + '）');
  r.rows.forEach(function (x) {
    console.log('    · #' + x.no + ' ' + x.upstream + '  [' + x.statusRaw + ']');
  });
  const nUncheck = r.rows.filter(function (x) { return x.statusRaw === '未核对'; }).length;
  console.log('  状态分布：未核对 ' + nUncheck + ' / 共 ' + r.rows.length
    + '（照实报 —— 这一栏是**缺口读数**，不是进度条）');
  console.log('  词表：' + r.words.join(' / '));
  if (r.problems.length) {
    r.problems.forEach(function (p) {
      console.log('  ✗ ' + p.kind + (p.origin ? '：' + p.origin : '')
        + (p.upstream ? '：#' + p.no + ' ' + p.upstream + '（实 ' + p.got + '）' : ''));
    });
    process.exit(1);
  }
  console.log('  ✓ README 每个上游都有清点条目、每条状态词都在词表内、行数不低于下限');
  console.log('    （⚠ 本判据**不判合法性** —— 「这样缝合对不对」要逐条读上游 LICENSE，机器答不了）');
  process.exit(0);
}
module.exports = { BASE: BASE, README_REL: README_REL, ATTR_REL: ATTR_REL,
  STATUS_WORDS: STATUS_WORDS, MIN_ROWS: MIN_ROWS,
  readmeOrigins: readmeOrigins, normOrigin: normOrigin, parseAttrRows: parseAttrRows,
  audit: audit, selfTest: selfTest };