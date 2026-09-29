#!/usr/bin/env node
'use strict';
/**
 * tests/docs-archive-gate.js — 版本条目「单一真源」门禁（v2.120.0）。
 *
 * 病灶（它治什么）：
 *   版本条目一度**两处各存一份**：README 的「版本历史」有 181 条（v0.1.0 起全部），
 *   而 ITERATION_LOG.md 自 R63 起又逐版记一遍。两处都在写「做了什么」，于是
 *     ① 同一个版本读到的措辞可能不同 —— 哪份是真的没人知道；
 *     ② 旧条目躺在 README 里，会随 README 一起被当成「当前状态」读。
 *   v2.119.0 把 **v2.20.0 及更早的 92 条**整体迁入日志的「版本条目存档」节，README 只留
 *   v2.21.0 及之后的摘要。**但「迁移完成」当时没有任何判据**：下一次有人往 README 补一条
 *   老版本条目、或往存档节里再抄一份 README 摘要，八道门禁一条都不会响 ——
 *   这正是本仓反复治过的「声称已修 ≠ 真的修了」。
 *
 * 四条判据（全部**现场读真文件**，不读任何清单副本）：
 *   P1 README「版本历史」节内**不得**出现 v2.20.0 及更早的条目（迁移不许悄悄回退）。
 *   P2 日志的「版本条目存档」节存在，且条目首为 v2.20.0、末为 v0.1.0、**无上升对**。
 *   P3 **单一真源**：同一版本号不得在 README 与日志存档节**两处都成为条目**（交集必须为空）。
 *   P4 README 仍以 `---` + `License:` 收尾，且版本历史导语紧随标题（结构不许再破）。
 *
 * 边界（如实登记，不假称已覆盖）：
 *   - 只认「行首的完整版本标记」（`**vX.Y.Z**` / `<b>vX.Y.Z</b>`，可带 `- ` 前缀）；
 *     正文里顺带提到的版本号不计为条目 —— 这是 v2.119.0 迁移时定的口径，此处沿用同一正则。
 *   - 同号异代（源里 v0.9.0 / v0.8.0 各两条、措辞不同）在**同一文件内合法**：
 *     故判据取「无上升对」而非「严格降序」。
 *   - 只覆盖这两份文件。FOUR_VERSION_PLAN.md 之类的历史跟踪不在判据内。
 *   - 本门禁**只读**：不修文件、不给修法建议（修法是人的事）。
 */
const fs = require('fs');
const path = require('path');

/** 条目行：行首完整版本标记。正文里的版本号不匹配（不锚行首 + 要求闭合标记）。 */
const ENTRY_RE = /^(?:- )?(?:\*\*v(\d+\.\d+\.\d+)\*\*|<b>v(\d+\.\d+\.\d+)<\/b>)/;
/** v2.21.0 是第一版「只在 README 留摘要」的版本；v2.20.0 及更早整体在日志存档节。 */
const CUT = [2, 20, 0];
const ARCH_HEAD = '## 版本条目存档';
const HIST_HEAD = '## 版本历史';
/** 存档节首尾（迁移口径的一部分：首 v2.20.0 / 末 v0.1.0）。 */
const FIRST = '2.20.0';
const LAST = '0.1.0';

function ver(v) { return v.split('.').map(Number); }
function key(v) { return ver(v).join('.'); }
function le(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return true;
}
function readLines(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8').split('\n');
}
/** 条目 = 行首版本标记所在行（块边界不参与判据：判据只问「这一版有没有条目」，不问正文）。 */
function entriesOf(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = ENTRY_RE.exec(lines[i]);
    if (m) out.push({ ver: m[1] || m[2], line: i + 1 });
  }
  return out;
}
function section(lines, head) {
  // 标题允许带括号说明（如「## 版本条目存档（v2.20.0 及更早，来自 README）」）：按前缀匹配，
  // 否则门禁会在标题措辞微调后**静默找不到节**（找不到就等于不判 —— 正是本仓最怕的假绿）。
  const i = lines.findIndex(function (x) { return x === head || x.startsWith(head + '（'); });
  if (i < 0) return null;
  let j = lines.length;
  for (let k = i + 1; k < lines.length; k++) {
    if (/^## /.test(lines[k])) { j = k; break; }
  }
  return { from: i, to: j, lines: lines.slice(i, j) };
}

/**
 * 现场扫描。opts.root 默认仓库根 —— 负控制据此指向破坏副本目录（**同一套判据**跑副本）。
 * 返回 { ok, problems, facts }：problems 为空即通过。
 */
function scan(opts) {
  const root = (opts && opts.root) || path.join(__dirname, '..');
  const problems = [];
  const facts = {};

  const readme = readLines(root, 'README.md');
  const log = readLines(root, 'ITERATION_LOG.md');

  const hist = section(readme, HIST_HEAD);
  if (!hist) problems.push('README 缺「版本历史」标题');
  const arch = section(log, ARCH_HEAD);
  if (!arch) problems.push('日志缺「版本条目存档」标题');

  const histEntries = hist ? entriesOf(hist.lines) : [];
  const archEntries = arch ? entriesOf(arch.lines) : [];
  facts.readmeEntries = histEntries.length;
  facts.logArchiveEntries = archEntries.length;

  // P1 README 版本历史节内不得有 v2.20.0 及更早
  const stale = histEntries.filter(function (e) { return le(ver(e.ver), CUT); });
  facts.staleInReadme = stale.map(function (e) { return e.ver; });
  if (stale.length) {
    problems.push('README「版本历史」里还有 ' + stale.length + ' 条 v2.20.0 及更早的条目（'
      + stale.slice(0, 5).map(function (e) { return e.ver + '@L' + e.line; }).join(' ') + '）—— 迁移回退了');
  }

  // P2 存档节首尾 + 无上升对
  if (arch) {
    if (!archEntries.length) {
      problems.push('「版本条目存档」节里一条条目都没有（空节 = 迁移丢失）');
    } else {
      facts.archiveFirst = archEntries[0].ver;
      facts.archiveLast = archEntries[archEntries.length - 1].ver;
      if (key(archEntries[0].ver) !== FIRST) {
        problems.push('存档节首条应为 v' + FIRST + '，实为 v' + archEntries[0].ver);
      }
      if (key(archEntries[archEntries.length - 1].ver) !== LAST) {
        problems.push('存档节末条应为 v' + LAST + '，实为 v' + archEntries[archEntries.length - 1].ver);
      }
      const rising = [];
      for (let i = 1; i < archEntries.length; i++) {
        if (ver(archEntries[i - 1].ver).join('.') < ver(archEntries[i].ver).join('.')
          && !le(ver(archEntries[i].ver), ver(archEntries[i - 1].ver))) {
          rising.push(archEntries[i - 1].ver + ' → ' + archEntries[i].ver);
        }
      }
      facts.archiveRising = rising;
      if (rising.length) problems.push('存档节出现上升对（倒序被破坏）：' + rising.slice(0, 3).join(' / '));
    }
  }

  // P3 单一真源：两份文件的条目版本号交集必须为空
  const inReadme = {};
  histEntries.forEach(function (e) { inReadme[e.ver] = e.line; });
  const both = archEntries.filter(function (e) { return inReadme[e.ver] !== undefined; })
    .map(function (e) { return e.ver; });
  const uniqBoth = both.filter(function (v, i) { return both.indexOf(v) === i; });
  facts.duplicatedAcrossFiles = uniqBoth;
  if (uniqBoth.length) {
    problems.push('同一个版本在两处都有条目（单一真源被破坏）：'
      + uniqBoth.slice(0, 8).map(function (v) { return 'v' + v; }).join(' ')
      + '（README 与日志存档节各一份）');
  }

  // P4 README 结构：License 收尾 + 导语紧随标题
  const tail = readme.filter(function (x) { return x !== ''; }).slice(-2);
  if (!(tail.length === 2 && tail[0] === '---' && /^License:/.test(tail[1]))) {
    // 报「缺哪一半」而不是把整段尾行贴出来：旧文案在只有 `---` 缺 `License:` 时写
    //   「未以 --- + License: 收尾（实 ["---","License: …"]）」，自己和自己打架。
    const why = tail.length !== 2 ? '尾部非空行不足 2 行'
      : (tail[0] !== '---' ? '倒数第二行不是 `---`'
        : '末行不以 `License:` 开头');
    problems.push('README 未以 `---` + `License:` 收尾：' + why + '（实 ' + JSON.stringify(tail) + '）');
  }
  if (hist) {
    const intro = hist.lines.findIndex(function (x) { return /^本节只保留|^本节为/.test(x); });
    const firstEntry = hist.lines.findIndex(function (x) { return ENTRY_RE.test(x); });
    if (intro < 0) problems.push('版本历史节缺导语（`本节只保留…`）');
    else if (firstEntry >= 0 && intro > firstEntry) {
      problems.push('版本历史导语落在条目之后（导语必须在首条目之前）');
    }
  }

  return { ok: problems.length === 0, problems: problems, facts: facts, root: root };
}

/** 判据在真跑（run.js 内联断言用）。 */
function runAll(assert) {
  const r = scan({});
  assert(r.ok, 'docs-archive: 四条判据全过（README 条目 ' + r.facts.readmeEntries
    + ' / 存档 ' + r.facts.logArchiveEntries + ' / 跨文件重复 '
    + r.facts.duplicatedAcrossFiles.length + '）'
    + (r.ok ? '' : ' —— ' + r.problems.join('; ')));
  assert(r.facts.staleInReadme.length === 0,
    'docs-archive: README 无 v2.20.0 及更早条目（实 ' + r.facts.staleInReadme.length + '）');
  assert(r.facts.logArchiveEntries >= 92,
    'docs-archive: 存档节条目 ≥92（实 ' + r.facts.logArchiveEntries + '）—— 条目变少说明被删了');
  return r;
}


// ── CLI 分支（与其它门禁同形：可单独跑，打印读数并给出退出码）──
//   本仓惯例：判据只写一次，`require` 时只导出、`node` 直接跑时才执行核对。
//   没有这一段时 `node tests/docs-archive-gate.js` 会**静默 exit 0**（什么都不打印）——
//   文档里就会写成一条「跑起来永远通过、其实什么都没跑」的命令。
if (require.main === module) {
  const argv = process.argv.slice(2);
  const r = scan({});
  if (argv.indexOf('--json') >= 0) {
    console.log(JSON.stringify(r, null, 1));
  } else {
    console.log('■ 版本条目单一真源门禁（README ↔ 日志存档节）');
    console.log('  条目正则只认行首闭合标记（`- **vX.Y.Z**` / `<b>vX.Y.Z</b>`），正文提及不计为条目');
    console.log('  README 版本历史条目 ' + r.facts.readmeEntries
      + ' · 日志存档节条目 ' + r.facts.logArchiveEntries);
    console.log('  存档首尾 ' + r.facts.archiveFirst + ' / ' + r.facts.archiveLast
      + ' · 无上升对 ' + (r.facts.archiveRising.length === 0 ? '✓' : '✗ ' + JSON.stringify(r.facts.archiveRising)));
    console.log('  README 里的 v2.20.0 及更早条目 ' + r.facts.staleInReadme.length
      + ' · 跨文件同号条目 ' + r.facts.duplicatedAcrossFiles.length
      + (r.facts.duplicatedAcrossFiles.length ? '（' + r.facts.duplicatedAcrossFiles.join(', ') + '）' : ''));
    if (r.problems.length) {
      console.log('  ✗ 判据现形 ' + r.problems.length + ' 项：');
      r.problems.forEach(function (p) { console.log('    ? ' + p); });
    } else {
      console.log('  ✓ 单一真源：两文件同号条目零交集，README 无已迁走的旧条目，结构完整');
    }
  }
  // 同 inventory.js：用 exitCode 而非 process.exit()，避免大输出经管道时被截断
  process.exitCode = r.ok ? 0 : 1;
}

module.exports = {
  scan: scan,
  runAll: runAll,
  ENTRY_RE: ENTRY_RE,
  ARCH_HEAD: ARCH_HEAD,
  HIST_HEAD: HIST_HEAD,
  CUT: CUT,
  FIRST: FIRST,
  LAST: LAST
};
