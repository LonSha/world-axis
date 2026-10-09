#!/usr/bin/env node
// WorldAxis tools/gen-plan-status.js — 计划文件「现场读数块」生成器（O7，v2.187.0）
//
// ── 它治的病（O7 现场实证第 1 与第 4 条）──────────────────────────────
//   `plans/TP_OPTIMIZATION.md` 头部写「基线 v2.162.0」、TP6/TP8「未开始」；
//   `plans/TX_EXPANSION.md` 写「基线 v2.168.0 / TX5–TX9 未开始」——
//   而现场 TX 九项早已全部交付。**文档不是滞后，是在断言反事实**：
//   读它的人拿到的是一个「当前进度」，而那个进度是错的。
//   更糟的是：没有任何命令能复算它，也没有任何门禁在读它
//   （立项轮实测 `grep -rn '\.agents\|plans/' --include='*.js'` **零命中**）。
//
// ── 口径（与 docs/README.md 的自述对齐）────────────────────────────────
//   「这个仓库只承认一种事实来源：能被命令复算出来的读数。文档负责指路，不负责断言」。
//   本生成器就是把**进度**变成那种读数：版本读 `index.js` / `manifest.json`，
//   交付状态读 `tests/` 面的**证据文件**，两者都现场复算，从不抄文档。
//
// ── 交付状态的判据（必须能被别人用同一条命令复算出来）──────────────────
//   一个编号（O3 / E5 / …）算「已交付」，当且仅当：
//     ① `tests/` 下存在**证据文件**（本仓约定：每个实施版配一把专锁，文件名带
//        `-b<批>-<编号>-v<四位版本>.js` 或 `<编号>-<语义>-v<四位版本>.js`）；
//     ② 该文件在 `tests/run.js` 里**被引用**（挂进了回归；只躺在磁盘上的文件不算）。
//   两条都现场判定，并把命中到的文件名一并写进块里 —— 读者可以自己核。
//   【形态清单与它的一次现场缺陷】形态清单（`EVIDENCE_FORMS`）必须与 `tests/` 的实际命名
//   同步，否则**判据静默漏档、块里就写出反事实**：v2.187.0 本轮的 O7 门禁原名
//   `plan-status-gate-v2187.js` 不含编号，三条正则一条都不中 ⇒ 已交付的 O7 在块里是
//   「未交付」。治法有两层：① 把文件名对齐仓库约定（`o7-plan-tree-gate-v2187.js`）；
//   ② 把该形态并进清单。**只做①会留一个「下次换个写法又漏」的口子，只做②会把
//   不合约定的名字合法化** —— 故两层同批做，并在 `tests/o7-plan-tree-gate-v2187.js` 里
//   对「清单形态 ⊇ tests/ 实际证据文件名」下一条常守判据。
//   【不判的】「做得对不对」不由本生成器判（那是各专锁的事）；它只判「有没有、挂没挂」。
//
// ── 用法 ───────────────────────────────────────────────────────────────
//   node tools/gen-plan-status.js            # dry-run：打印四个计划文件将要写入的块
//   node tools/gen-plan-status.js --write    # 写入（幂等；块由标记界定，原文其余部分逐字不动）
//   const G = require('../tools/gen-plan-status.js')  # 门禁复用同一份复算逻辑
//
// ── 边界（如实登记）──────────────────────────────────────────────────
//   · 只读产品与测试目录，不写产品状态、不改版本、不动配置。
//   · 只处理 `plans/` 下四个计划文件；标记之外的正文**一个字都不改**
//     （旧计划的「立题基线」是历史事实，保留原文 —— 治法是**在它旁边放现场读数**，
//      不是把历史改写成现在）。
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BEGIN = '<!-- O7:STATE:BEGIN';
const END = '<!-- O7:STATE:END -->';

/** 四个计划文件及其块类型。 */
const PLAN_FILES = [
  { rel: 'plans/O_OPTIMIZATION.md', kind: 'O' },
  { rel: 'plans/E_EXPANSION.md', kind: 'E' },
  { rel: 'plans/TP_OPTIMIZATION.md', kind: 'archive' },
  { rel: 'plans/TX_EXPANSION.md', kind: 'archive' }
];

/** 证据文件名 → 编号。两种形态：批式（s3-b2-o5-v2182.js）与语义式（o9-outlet-gate-v2186.js）。 */
const EVIDENCE_FORMS = [
  // 批式：`s3-b<批>-(o|e)<编号>-v<四位版本>.js`。**批号只许是数字** —— 这条正则的
  //   初版写死成 `[12]`（批 1 / 批 2），于是第三批的三把专锁（s3-b3-e4 / e6 / e8）
  //   与语义式两条正则**都不中** ⇒ 已交付的三项在块里一律写成「未交付」。
  //   这与本文件头部记的 O7 那次缺陷是**同一种病**（形态清单落后于现场命名），
  //   故治法同规：按**形态**放宽（`\d` 而不是枚举 `[12]`），并在 O7 门禁里对
  //   「清单形态 ⊇ tests/ 实际证据文件名」下常守判据 —— 否则下次开第四批又漏一遍。
  /^s3-b\d+-(o|e)(\d)-v2\d{3}\.js$/,
  /^(o|e)(\d)-[a-z0-9-]+-v2\d{3}\.js$/,
  // 第三形态（v2.187.0 O7 现场踩到）：**门禁型证据** `o7-plan-tree-gate-v2187.js` ——
  //   与上面第二条只差一个 `-gate`，而旧正则的 `[a-z0-9-]+-v2` 贪婪匹配会把它吃掉、回溯后
  //   取不到编号 ⇒ O7 明明交付了、块里写「未交付」。形态与语义式合并成一条正则表达。
  /^(o|e)(\d)-[a-z0-9-]*gate-v2\d{3}\.js$/
];

function itemOf(base) {
  for (let i = 0; i < EVIDENCE_FORMS.length; i++) {
    const m = base.match(EVIDENCE_FORMS[i]);
    if (m) return m[1].toUpperCase() + m[2];
  }
  return null;
}

function readOrNull(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

/** 现场读数：版本 / 清单版本 / 各编号证据（含是否挂进 run.js）。
 *  opt 可覆盖任一源文本（**只给门禁的负控制用**：在「真源码的内存副本」上重跑同款判据）。 */
function VIEW(opt) {
  opt = opt || {};
  const idx = opt.idx !== undefined ? opt.idx : (readOrNull(path.join(ROOT, 'index.js')) || '');
  const mv = idx.match(/const VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'/);
  const version = mv ? mv[1] : '(未读到 index.js 的 VERSION)';
  const man = opt.man !== undefined ? opt.man : (readOrNull(path.join(ROOT, 'manifest.json')) || '');
  const mm = man.match(/"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/);
  const manifestVersion = mm ? mm[1] : '(未读到 manifest.json 的 version)';
  const runSrc = opt.run !== undefined ? opt.run : (readOrNull(path.join(ROOT, 'tests', 'run.js')) || '');

  const dir = path.join(ROOT, 'tests');
  let bases = [];
  try {
    bases = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); });
  } catch (e) { bases = []; }

  const items = {};
  ['O', 'E'].forEach(function (line) {
    for (let i = 1; i <= 9; i++) items[line + i] = { id: line + i, files: [], wired: 0 };
  });
  bases.sort().forEach(function (b) {
    const id = itemOf(b);
    if (!id || !items[id]) return;
    items[id].files.push(b);
    if (runSrc.indexOf(b) >= 0) items[id].wired += 1;
  });
  return {
    version: version,
    manifestVersion: manifestVersion,
    items: items,
    testsFileCount: bases.length
  };
}

const RUN_SRC = readOrNull(path.join(ROOT, 'tests', 'run.js')) || '';
function runSrcIndexOf(f) { return RUN_SRC.indexOf(f) >= 0; }

/** 块的正文（确定性：同样的现场必得同样的字符串；**不含时间戳**，否则每次复算都漂移）。 */
function renderBlock(kind, view) {
  const v = view || VIEW();
  const L = [];
  L.push(BEGIN + ' 由 tools/gen-plan-status.js 复算生成，勿手改 -->');
  if (kind === 'O' || kind === 'E') {
    const line = kind;
    L.push('> **现场读数块**（`node tools/gen-plan-status.js` 复算；手工改它会被'
      + ' `tests/o7-plan-tree-gate-v2187.js` 当场判红）');
    L.push('>');
    L.push('> | 现场读数 | 值 | 取法 |');
    L.push('> |---|---|---|');
    L.push('> | 版本 | `index.js` **v' + v.version + '** / `manifest.json` **v'
      + v.manifestVersion + '** | `grep -n "VERSION =" index.js`；`manifest.json` |');
    L.push('> | 本线交付 | **已交付 ' + countDelivered(v, line) + ' / 未交付 '
      + (9 - countDelivered(v, line)) + '** | 下表逐项现场复算 |');
    L.push('>');
    L.push('> | 项 | 状态 | 证据（`tests/` 下的专锁，★ = 已挂进 `tests/run.js`） |');
    L.push('> |---|---|---|');
    for (let i = 1; i <= 9; i++) {
      const it = v.items[line + i];
      const ok = it.files.length > 0 && it.wired > 0;
      const ev = it.files.length
        ? it.files.map(function (f) { return '`' + f + '`' + (runSrcIndexOf(f) ? ' ★' : ''); }).join('、')
        : '（无）';
      L.push('> | ' + it.id + ' | ' + (ok ? '**已交付**' : '未交付') + ' | ' + ev + ' |');
    }
    L.push('>');
    L.push('> 判据：编号算「已交付」= `tests/` 下存在该编号的证据文件**且**它被 `tests/run.js` 引用；'
      + '只躺在磁盘上的文件不算。本块只判「有没有、挂没挂」，不判「做得对不对」。');
  } else {
    L.push('> **现场读数块**（`node tools/gen-plan-status.js` 复算；手工改它会被'
      + ' `tests/o7-plan-tree-gate-v2187.js` 当场判红）');
    L.push('>');
    L.push('> 现场版本：`index.js` **v' + v.version + '** / `manifest.json` **v'
      + v.manifestVersion + '**。');
    L.push('> 本文件是**历史档案**：下方「基线」「进度」「交付表」记的是**立项当时**的事实，'
      + '此后不再随版本推进更新，也**不再作为当前进度台账**。'
      + '当前进度以 `plans/O_OPTIMIZATION.md` 与 `plans/E_EXPANSION.md` 顶部的现场读数块为准。');
  }
  L.push(END);
  return L.join('\n') + '\n';
}

function countDelivered(view, line) {
  let n = 0;
  for (let i = 1; i <= 9; i++) {
    const it = view.items[line + i];
    if (it.files.length && it.wired) n += 1;
  }
  return n;
}

/** 从文件文本里取出块（含标记）。找不到成对标记 → null。 */
function readBlock(text) {
  const i = text.indexOf(BEGIN);
  if (i < 0) return null;
  const j = text.indexOf(END, i);
  if (j < 0) return null;
  return text.slice(i, j + END.length) + '\n';
}

/** 插入位置：紧跟「基线：…」那一行之后（保留历史基线原文，把现场读数放在它旁边）。 */
function insertAfter(text, block) {
  const lines = text.split('\n');
  let at = -1;
  for (let i = 0; i < lines.length && i < 20; i++) {
    if (/^(基线：|基线:)/.test(lines[i])) { at = i; break; }
  }
  if (at < 0) {
    for (let i = 0; i < lines.length && i < 20; i++) {
      if (/^(Status:|状态：)/.test(lines[i])) { at = i; break; }
    }
  }
  if (at < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (/^# /.test(lines[i])) { at = i; break; }
    }
  }
  if (at < 0) return null;
  lines.splice(at + 1, 0, block.replace(/\n$/, ''));
  return lines.join('\n');
}

/** 生成 / 更新一个计划文件的文本。返回 { text, changed, mode }。 */
function update(text, kind) {
  const block = renderBlock(kind);
  const cur = readBlock(text);
  if (cur !== null) {
    if (cur === block) return { text: text, changed: false, mode: 'same' };
    return { text: text.replace(cur, block), changed: true, mode: 'replaced' };
  }
  const out = insertAfter(text, block);
  if (out === null) return { text: text, changed: false, mode: 'no-anchor' };
  return { text: out, changed: true, mode: 'inserted' };
}

function main() {
  const ARGV = process.argv.slice(2);
  const WRITE = ARGV.indexOf('--write') >= 0;
  const log = [];
  PLAN_FILES.forEach(function (pf) {
    const p = path.join(ROOT, pf.rel);
    const src = readOrNull(p);
    if (src === null) { log.push('MISS ' + pf.rel); return; }
    const r = update(src, pf.kind);
    log.push((r.changed ? 'DIFF ' : 'SAME ') + pf.rel + ' :: ' + r.mode);
    if (WRITE && r.changed) fs.writeFileSync(p, r.text);
  });
  if (!WRITE) {
    log.push('');
    log.push('（dry-run）将写入的第一个块：');
    log.push(renderBlock('O'));
  }
  console.log(log.join('\n'));
}

module.exports = {
  ROOT: ROOT, BEGIN: BEGIN, END: END, PLAN_FILES: PLAN_FILES,
  EVIDENCE_FORMS: EVIDENCE_FORMS,
  VIEW: VIEW, renderBlock: renderBlock, readBlock: readBlock, update: update, itemOf: itemOf
};

if (require.main === module) main();