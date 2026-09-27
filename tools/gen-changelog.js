#!/usr/bin/env node
/**
 * WorldAxis tools/gen-changelog.js (v2.110.0) — 开发日志的自动生成（计划一 #30）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   `ITERATION_LOG.md` 有 1680 行、R1→R85 全部手工维护。手工维护的代价不是「花时间」，
 *   而是**结构性遗漏**：日志条目天然偏向「我记得改了什么」，于是「新增了哪个模块、
 *   哪把专锁、哪个拒收码」这些**可机械统计**的事实反而最容易漏（本仓 v2.86.0 的
 *   日志就漏记了一个新命名空间）。
 *
 * ── 四条口径（否定式）──────────────────────────────────────────────────
 *   ① **只生成草稿，不写 ITERATION_LOG.md**：草稿落到 `tools/` 之外的**标准输出**，
 *      要落盘由人 `> /tmp/draft.md` 决定。「为什么这么改」是日志的灵魂，机器写不出来；
 *      机器只负责把那几个**事实**（文件增删、导出面变化、拒收码增删、测试数变化）列全。
 *   ② **不猜语义**：commit message 原样引用（截断到 80 字），不重写、不归类。
 *   ③ **git 不可用 ⇒ 如实报 `no-git`**，不生成半份草稿（半份草稿比没有更误导）。
 *   ④ **区间必须显式**：`from..to` 两个 rev 都要给（或 `HEAD~N..HEAD`）。
 *      不给区间就**不猜「上一个版本」** —— 版本号与 git tag 在本仓并不同步。
 */
'use strict';
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');

/** 在 git 里跑一条命令（失败返回 null，不抛）。stderr 吞掉：非仓库/坏区间是**正常路径**，
 *  让它往 stderr 喷 fatal 会在回归输出里留下假警报。 */
function git(args, root) {
  try {
    return cp.execSync('git ' + args,
      { cwd: root || BASE, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) { return null; }
}

/** 解析一个区间。返回 `{ok, reason, revs}` —— revs 为 `{hash, subject, date}` 数组（旧→新）。 */
function range(fromTo, opts) {
  const root = (opts || {}).root || BASE;
  const r = String(fromTo || '').trim();
  // 区间必须是「两端非空的 `A..B`」。
  //   实测（v2.110.0 专锁 C6）：只判 `indexOf('..') < 0` 会让裸 `'..'` 走到 git 那里，
  //   于是归因从「你没给区间」变成「git 不可用」—— **归因错了一档**，
  //   而调用方看到 no-git 会去查 git，实际问题在参数的形状上。
  const parts = r.split('..');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'need-explicit-range', hint: '形如 v2.109.0..HEAD 或 HEAD~3..HEAD' };
  }
  const log = git('log --reverse --format=%H%x09%ad%x09%s --date=short ' + r, root);
  if (log === null) return { ok: false, reason: 'no-git', hint: 'git 不可用或区间无效：' + r };
  const revs = String(log).split('\n').filter(Boolean).map(function (line) {
    const p = line.split('\t');
    return { hash: p[0] || '', date: p[1] || '', subject: (p[2] || '').slice(0, 80) };
  });
  return { ok: true, reason: '', range: r, revs: revs };
}

/** 一个 commit 涉及的文件变更（增/改/删三档分开；改名按增+删记，不猜）。 */
function filesOf(hash, opts) {
  const root = (opts || {}).root || BASE;
  const out = git('show --name-status --format= ' + hash, root);
  if (out === null) return { ok: false, reason: 'no-git', added: [], modified: [], deleted: [] };
  const added = [], modified = [], deleted = [];
  String(out).split('\n').filter(Boolean).forEach(function (line) {
    const p = line.split('\t');
    const st = (p[0] || '').charAt(0), f = p[p.length - 1] || '';
    if (st === 'A') added.push(f);
    else if (st === 'D') deleted.push(f);
    else if (st === 'M') modified.push(f);
  });
  return { ok: true, reason: '', added: added, modified: modified, deleted: deleted };
}

/** 一条日志条目的草稿（事实清单；「为什么」留给人写）。 */
function draft(fromTo, opts) {
  const r = range(fromTo, opts);
  if (!r.ok) return r;
  const L = [];
  L.push('## 草稿 · ' + r.range + '（' + r.revs.length + ' 个提交）');
  L.push('');
  L.push('> 本段由 `tools/gen-changelog.js` 生成**事实清单**。"为什么"必须人工补 —— 机器写不出取舍。');
  L.push('');
  r.revs.forEach(function (rev, i) {
    const f = filesOf(rev.hash, opts);
    L.push('### ' + (i + 1) + ' · ' + rev.date + ' · ' + rev.hash.slice(0, 8));
    L.push('- 提交：' + rev.subject);
    if (f.ok) {
      if (f.added.length) L.push('- 新增 ' + f.added.length + ' 个文件：' + f.added.slice(0, 12).join('、') + (f.added.length > 12 ? ' …' : ''));
      if (f.deleted.length) L.push('- 删除 ' + f.deleted.length + ' 个文件：' + f.deleted.slice(0, 12).join('、'));
      const meaningful = f.modified.filter(function (x) { return !/^tools\//.test(x); });
      if (meaningful.length) L.push('- 修改 ' + meaningful.length + ' 个文件：' + meaningful.slice(0, 12).join('、') + (meaningful.length > 12 ? ' …' : ''));
      if (f.modified.length !== meaningful.length) L.push('  （另有 ' + (f.modified.length - meaningful.length) + ' 个 tools/ 下的脚本，不入库）');
    }
    L.push('- 待人工补：**为什么**这么改 / 可复用的判据编号 / 门禁读数');
    L.push('');
  });
  return { ok: true, reason: '', range: r.range, commits: r.revs.length, text: L.join('\n') };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const rng = args.filter(function (a) { return a.indexOf('--') !== 0; })[0];
  console.log('■ 开发日志草稿（只输出，不写 ITERATION_LOG.md）');
  if (!rng) { console.log('用法: node tools/gen-changelog.js <from>..<to>   （例：HEAD~3..HEAD）'); process.exit(2); }
  const d = draft(rng, {});
  if (!d.ok) { console.log('  ✗ ' + d.reason + '：' + (d.hint || '')); process.exit(2); }
  console.log(d.text);
  process.exit(0);
}

module.exports = { BASE: BASE, git: git, range: range, filesOf: filesOf, draft: draft };