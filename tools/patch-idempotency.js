#!/usr/bin/env node
/**
 * WorldAxis tools/patch-idempotency.js (v2.110.0) — 补丁脚本的幂等性检查（计划一 #28）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   本仓的补丁一律是「锚点精确命中 → 替换」形态的脚本（`tools/patch_*.py`）。它们**不幂等**：
 *   同一条补丁跑两次，第二次的锚点仍在（因为替换后的文本里往往保留了锚点的前半段）
 *   ⇒ 代码块被**重复插入**。实测代价：v2.109.0 收口期有两处重复执行，
 *   一处把同一段注释插了两遍、一处让 `FROZEN2800` 多出一段 —— 两处都要 `git checkout` 回滚重做。
 *
 * ── 四条口径（否定式）──────────────────────────────────────────────────
 *   ① **不做「大概像」的判断**：幂等性判据只有一条 —— **锚点在目标文件里还剩几次**。
 *      剩 0 次 ⇒ 补丁已应用（跳过，退出码 0）；剩 ≥2 次 ⇒ **拒绝执行**（谁会写错，不猜）；
 *      恰 1 次 ⇒ 可以应用。
 *   ② **不改补丁、不改目标**：本工具只**检查并报告**，`apply` 由调用方自己做。
 *      （凡「顺手帮你修一下」的工具，最后都会成为缺陷源。）
 *   ③ **期望与现场都必须显式**：`--anchor` 不给就不判 —— 本工具**不猜测**哪个字符串是锚点。
 *      猜错锚点的代价比不做检查更大（会把「已应用」判成「可应用」）。
 *   ④ **判据可被合成输入驱动**：`decide()` 是纯函数（src/needle/want → 判定），
 *      因此专锁可以用构造的字符串测四种情形，不必真去跑一个补丁脚本。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

/** 三种判定 + 两种拒绝。 */
const VERDICTS = ['can-apply', 'already-applied', 'refuse-ambiguous', 'no-target'];

/**
 * 纯判定。
 * @param {string} src     目标文件当前文本
 * @param {string} anchor  补丁的锚点（要替换掉的那段原文）
 * @param {number} [want]  期望命中数（默认 1）
 * @returns {{verdict:string, hits:number, reason:string}}
 */
function decide(src, anchor, want) {
  const w = (typeof want === 'number' && isFinite(want)) ? want : 1;
  if (typeof src !== 'string') return { verdict: 'no-target', hits: 0, reason: 'source-unreadable' };
  if (!anchor) return { verdict: 'refuse-ambiguous', hits: 0, reason: 'no-anchor-given（本工具不猜锚点）' };
  const hits = String(src).split(anchor).length - 1;
  if (hits === 0) return { verdict: 'already-applied', hits: 0, reason: '锚点已不在 ⇒ 补丁应已应用（跳过，不报错）' };
  if (hits === 1 && w === 1) return { verdict: 'can-apply', hits: 1, reason: '锚点恰 1 次' };
  if (hits >= 2) return { verdict: 'refuse-ambiguous', hits: hits, reason: '锚点命中 ' + hits + ' 次 ⇒ 目标已处半新半旧状态，拒绝改写' };
  return { verdict: 'refuse-ambiguous', hits: hits, reason: '命中 ' + hits + ' 次 != 期望 ' + w };
}

/** 对文件做一次判定（只读）。 */
function checkFile(rel, anchor, opts) {
  const o = opts || {};
  const root = o.root || BASE;
  let src = null;
  try { src = fs.readFileSync(path.join(root, rel), 'utf8'); }
  catch (e) { return { verdict: 'no-target', hits: 0, reason: 'file-unreadable:' + rel, file: rel }; }
  const d = decide(src, anchor, o.want);
  d.file = rel;
  return d;
}

/** 人读形态。退出码语义：can-apply / already-applied ⇒ 0；其余 ⇒ 2。 */
function exitCodeFor(verdict) { return (verdict === 'can-apply' || verdict === 'already-applied') ? 0 : 2; }

if (require.main === module) {
  const args = process.argv.slice(2);
  const rel = args[0], anchor = args[1];
  console.log('■ 补丁幂等性（只读检查；不改补丁、不改目标）');
  console.log('  判据只有一条：锚点还剩几次。0 ⇒ 已应用（跳过）；≥2 ⇒ 拒绝；=1 ⇒ 可应用。');
  if (!rel || !anchor) {
    console.log('用法: node tools/patch-idempotency.js <目标文件> "<锚点原文>" [期望次数]');
    process.exit(2);
  }
  const d = checkFile(rel, anchor, { want: args[2] ? Number(args[2]) : 1 });
  console.log('  ' + (d.verdict === 'can-apply' ? '✓' : (d.verdict === 'already-applied' ? '⏭' : '✗'))
    + ' ' + rel + ' → ' + d.verdict + '（命中 ' + d.hits + '）：' + d.reason);
  process.exit(exitCodeFor(d.verdict));
}

module.exports = { BASE: BASE, VERDICTS: VERDICTS, decide: decide, checkFile: checkFile, exitCodeFor: exitCodeFor };