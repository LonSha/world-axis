#!/usr/bin/env node
'use strict';
/**
 * WorldAxis tests/opv29-z6-v2529.js (v2.529.0) — Z6 守得住：存储自愈 + 锁自愈的收口判据
 *
 * ── 它治什么（两条都是本仓真实踩过的） ─────────────────────
 *   ① **锁自愈**（OPV29-32）：两次 stale lock 都是人肉 `rm -rf` 过去的。`recoverLock` 早就
 *      两道条件（主人身份 stale + 该 task 无活 worker），但**没有任何判据钉住它**：
 *      于是「它到底会不会误杀活锁」「重复调用会不会假成功」只能靠人相信。
 *   ② **存储自愈**（OPV29-31）：本次真事故是 `.git` 里 `object file ... is empty`（**文件在、
 *      大小 0**）。旧的 `gitState()` 只跑 `git rev-parse --verify HEAD` —— 那种损坏下它
 *      **仍然成功**，于是自诊对这次事故报 `ok`，等于没检测。本版按 loose object 结构补探测。
 *
 * ── 口径（与仓库纪律对齐） ─────────────────────────────
 *   · 零依赖、零写仓库：临时目录一律建在 os.tmpdir()，跑完自清；**绝不碰本仓 .git**。
 *   · 每条判据都有「破坏必红」的形态：不是只测「正常时返回 true」，而是注入损坏后**必须**报。
 *   · 「幂等」在这里的准确含义是：**重复调用不产生额外破坏，也不许假成功**。
 *     故第二次回收必须明确抛 `absent`，而不是回一个「已回收」。
 *
 * 复算：node tests/opv29-z6-v2529.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const BASE = path.join(__dirname, '..');
const FH = require(path.join(BASE, 'tools', 'fault-selfhelp.js'));
const RUNNER = require(path.join(BASE, 'tests', 'isolated-runner.js'));

let P = 0, F = 0;
const a = function (ok, name) { if (ok) { P += 1; } else { F += 1; console.log('  ✗ ' + name); } };
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-z6-'));
const made = [];
function mkLock(n) {
  // 目录名**必须是中性编号**：状态词（active/stale/unknown）若出现在路径里，
  //   recoverLock 抛的错消息会带着路径 ⇒ 判据里的 /active/ 会匹配到目录名，
  //   于是「误杀活锁」这一向会假绿。本版第一次自证就是这么骗过去的。
  const d = path.join(tmpRoot, 'lk' + n);
  fs.mkdirSync(d, { recursive: true });
  made.push(d);
  return d;
}
function writeOwner(dir, obj, raw) {
  const p = path.join(dir, 'owner.json');
  if (raw !== undefined) fs.writeFileSync(p, raw);
  else fs.writeFileSync(p, JSON.stringify(obj, null, 2), { mode: 0o600 });
}

// ────────────────────────── A. 症状表契约 ──────────────────────────
//   自诊的价值全在「下一步一条命令 + 明确禁止什么」。少一条就等于回到「人不在就丢了」。
(function runA() {
  const need = ['stale-lock', 'git-object-corrupt', 'slim-suspect', 'gate-red'];
  need.forEach(function (k) {
    const s = FH.SYMPTOMS[k];
    a(!!s && typeof s.next === 'string' && s.next.length > 0, 'A: 症状 ' + k + ' 有「下一步一条命令」');
    a(!!s && typeof s.why === 'string' && s.why.length > 0, 'A: 症状 ' + k + ' 有「为什么」');
    a(!!s && Array.isArray(s.forbidden), 'A: 症状 ' + k + ' 有 forbidden 数组（哪怕为空）');
  });
  const g = FH.SYMPTOMS['git-object-corrupt'];
  a(g.forbidden.indexOf('git gc --prune=now') >= 0,
    'A: git-object-corrupt 明确禁止 gc --prune=now（会把还能救的悬空对象删掉）');
  a(g.forbidden.indexOf('find .git -delete') >= 0, 'A: git-object-corrupt 明确禁止 find .git -delete');
  a(g.next.indexOf('fsck') >= 0, 'A: git-object-corrupt 的下一步是 fsck 先看清（而不是直接动手）');
  const l = FH.SYMPTOMS['stale-lock'];
  a(l.forbidden.some(function (x) { return x.indexOf('*.lock') >= 0; }),
    'A: stale-lock 明确禁止通配删除活锁（find /tmp -name *.lock -delete）');
  a(l.next.indexOf('--recover') >= 0, 'A: stale-lock 的下一步指向 --recover（幂等入口，不是 rm）');
})();

// ────────────────────────── B. 锁五态可分辨 ──────────────────────────
//   free / no-owner / stale / active / unknown —— 「没有锁」与「锁坏了」不得压成同一个词。
(function runB() {
  const dFree = path.join(tmpRoot, 'lock-free-absent');
  a(RUNNER.inspectLock(dFree).state === 'free', 'B1: 目录不存在 ⇒ free（不是 no-owner）');

  const dNoOwner = mkLock(2);
  a(RUNNER.inspectLock(dNoOwner).state === 'no-owner', 'B2: 目录在、无 owner.json ⇒ no-owner');

  const dActive = mkLock(3);
  writeOwner(dActive, { pid: process.pid, start: RUNNER.identity(process.pid), token: 'tk1', task: path.join(tmpRoot, 't-active') });
  a(RUNNER.inspectLock(dActive).state === 'active', 'B3: 活进程 + starttime 一致 ⇒ active');

  const dStalePid = mkLock(4);
  writeOwner(dStalePid, { pid: process.pid, start: '1', token: 'tk2', task: path.join(tmpRoot, 't-stale') });
  a(RUNNER.inspectLock(dStalePid).state === 'stale', 'B4: pid 在但 starttime 不同（pid 被复用）⇒ stale');

  const dStaleGone = mkLock(5);
  writeOwner(dStaleGone, { pid: 999999, start: '1', token: 'tk3', task: path.join(tmpRoot, 't-gone') });
  a(RUNNER.inspectLock(dStaleGone).state === 'stale', 'B5: pid 已不存在 ⇒ stale');

  const dBadJson = mkLock(6);
  writeOwner(dBadJson, null, '{ not json');
  a(RUNNER.inspectLock(dBadJson).state === 'unknown', 'B6: owner.json 解析不出 ⇒ unknown（不是 stale）');

  const dNoToken = mkLock(7);
  writeOwner(dNoToken, { pid: process.pid, start: '1' });
  a(RUNNER.inspectLock(dNoToken).state === 'unknown', 'B7: owner.json 缺 token/start ⇒ unknown');
})();

// ────────────────────────── C. 回收：两向 + 幂等 ──────────────────────────
(function runC() {
  // C1 正向：stale 可回收，且回收后变 free
  const d1 = mkLock(11);
  writeOwner(d1, { pid: 999999, start: '1', token: 'r1', task: path.join(tmpRoot, 't-rec') });
  let threw = null;
  try { RUNNER.recoverLock(d1); } catch (e) { threw = e; }
  a(threw === null, 'C1a: stale 锁可回收（不应抛）');
  a(RUNNER.inspectLock(d1).state === 'free', 'C1b: 回收后现场是 free（真删了，不是改标记）');

  // C2 幂等：再回收一次必须明确报 absent —— 不许静默回「已回收」
  let threw2 = null;
  try { RUNNER.recoverLock(d1); } catch (e) { threw2 = e; }
  a(threw2 !== null, 'C2a: 重复回收必须抛（不许假成功）');
  a(!!threw2 && /not recoverable: absent/.test(threw2.message), 'C2b: 重复回收的错因是 absent（把「回收过了」与「压根没有」分开）');

  // C3 反向：活锁绝不许被回收 —— 这是「不许误杀」的那一向
  const d3 = mkLock(13);
  writeOwner(d3, { pid: process.pid, start: RUNNER.identity(process.pid), token: 'r3', task: path.join(tmpRoot, 't-act') });
  let threw3 = null;
  try { RUNNER.recoverLock(d3); } catch (e) { threw3 = e; }
  a(threw3 !== null && /not recoverable: active/.test(threw3.message), 'C3a: active 锁拒绝回收（错因含 active）');
  a(RUNNER.inspectLock(d3).state === 'active', 'C3b: 拒绝之后锁原样还在（没被半途删掉）');

  // C4 反向：主人 stale 但 task 有活 worker ⇒ 也必须拒（否则两个任务同时写缓存目录）
  const t4 = path.join(tmpRoot, 't-liveworker');
  fs.mkdirSync(t4, { recursive: true });
  fs.writeFileSync(path.join(t4, 'result.json'), JSON.stringify({ status: 'running', childPid: process.pid }));
  const d4 = mkLock(14);
  writeOwner(d4, { pid: 999999, start: '1', token: 'r4', task: t4 });
  let threw4 = null;
  try { RUNNER.recoverLock(d4); } catch (e) { threw4 = e; }
  a(threw4 !== null && /^lock has live worker: /.test(threw4.message), 'C4a: 有活 worker 时拒绝回收（错因含 live worker）');
  a(RUNNER.inspectLock(d4).state === 'stale', 'C4b: 拒绝之后锁仍在（留给下一次判断）');

  // C5 反向：unknown 不收（文件在却读不出，得人看一眼 why）
  const d5 = mkLock(15);
  writeOwner(d5, null, '{ broken');
  let threw5 = null;
  try { RUNNER.recoverLock(d5); } catch (e) { threw5 = e; }
  a(threw5 !== null && /not recoverable: unknown/.test(threw5.message), 'C5: unknown 拒绝回收（不猜、不硬删）');

  // C6 no-owner 可回收（mkdir 与写 owner 之间猝死的确定形态，没有主人可误伤）
  const d6 = mkLock(16);
  let threw6 = null;
  try { RUNNER.recoverLock(d6); } catch (e) { threw6 = e; }
  a(threw6 === null && RUNNER.inspectLock(d6).state === 'free', 'C6: no-owner 可回收且回收后 free');
})();

// ────────────────────────── D. 存储自愈：gitState 双向 ──────────────────────────
(function runD() {
  // D1 没有 .git 的目录：明确 skip，不猜成「损坏」
  const bare = path.join(tmpRoot, 'nogit');
  fs.mkdirSync(bare, { recursive: true });
  const sc = FH.scanEmptyLoose(bare);
  a(sc.skipped === 'no-.git' && sc.hits.length === 0, 'D1: 无 .git ⇒ skipped=no-.git，且不报命中');

  // D2 造一个真 git 仓（临时目录，绝不碰本仓 .git）
  const repo = path.join(tmpRoot, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const git = function (args, opts) {
    return cp.spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t'].concat(args),
      Object.assign({ cwd: repo, encoding: 'utf8' }, opts || {}));
  };
  const inited = git(['init', '-q']);
  a(inited.status === 0, 'D2a: 临时仓 init 成功（前置）');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\n');
  git(['add', 'a.txt']);
  const cm = git(['commit', '-qm', 'init']);
  a(cm.status === 0, 'D2b: 临时仓有一次提交（前置：有 loose object 面）');

  const okState = FH.gitState(repo);
  a(okState.ok === true, 'D3a: 完好的仓 ⇒ gitState.ok（不误报）');
  a(!okState.loose || okState.loose.hits.length === 0, 'D3b: 完好时 loose.hits 为空');

  // D4 破坏：把一个 loose object 掏成 0 字节 —— 正是本次真事故的形态
  const objDir = path.join(repo, '.git', 'objects');
  let victim = null;
  fs.readdirSync(objDir).forEach(function (sub) {
    if (victim || !/^[0-9a-f]{2}$/.test(sub)) return;
    const files = fs.readdirSync(path.join(objDir, sub)).filter(function (f) { return /^[0-9a-f]{38}$/.test(f); });
    if (files.length) victim = path.join(objDir, sub, files[0]);
  });
  a(!!victim, 'D4a: 找得到一个 loose object 作为破坏点（前置）');
  if (victim) {
    fs.truncateSync(victim, 0);
    const badState = FH.gitState(repo);
    a(badState.ok === false, 'D4b: 空 loose object ⇒ gitState.ok=false（旧的只跑 rev-parse，这里会假绿）');
    a(/empty-loose-object/.test(String(badState.why || '')), 'D4c: 错因点名 empty-loose-object（实 ' + badState.why + '）');
    a(/fsck/.test(String(badState.hint || '')) && /fetch/.test(String(badState.hint || '')),
      'D4d: 给的是安全路径（fsck → fetch 补对象），不是 gc --prune=now');
    a(String(badState.hint || '').indexOf('gc --prune=now') < 0 || String(badState.hint).indexOf('不是') >= 0,
      'D4e: hint 里不把 gc --prune=now 当建议（它只能出现在「不是它」的句子里）');
    // D5 恢复：把对象补回非空 ⇒ 重新 ok（这一向证明「报红不是常驻」）
    fs.writeFileSync(victim, Buffer.from([0x78, 0x01]));
    const backState = FH.gitState(repo);
    a(backState.ok === true, 'D5: 对象非空之后 ⇒ 重新 ok（红不是常驻，不误报）');
  }
})();

// ────────────────────────── E. CLI 与库同一口径 ──────────────────────────
(function runE() {
  const tool = path.join(BASE, 'tools', 'fault-selfhelp.js');
  const r = cp.spawnSync(process.execPath, [tool, '--symptom=git-object-corrupt'], { encoding: 'utf8' });
  a(r.status === 0, 'E1: --symptom=git-object-corrupt 可独立跑通（红一次就能单跑复现的前提）');
  const out = String(r.stdout || '');
  a(out.indexOf('fsck') >= 0, 'E2: CLI 输出给出 fsck 下一步');
  a(out.indexOf('gc --prune=now') >= 0, 'E3: CLI 明确列出被禁止的那条命令');
  const j = cp.spawnSync(process.execPath, [tool, '--json'], { encoding: 'utf8' });
  a(j.status === 0, 'E4: --json 可跑（给人以外的消费方用）');
  let parsed = null;
  try { parsed = JSON.parse(String(j.stdout || '')); } catch (e) { parsed = null; }
  a(!!parsed && parsed.lock && parsed.git, 'E5: --json 回带 lock 与 git 两段事实');
  a(!!parsed && ['none', 'stale-lock', 'git-object-corrupt'].indexOf(parsed.verdict) >= 0,
    'E6: verdict 只在已知三值内（不知道就回 none，不猜治法）');
})();

// ────────────────────────── 清理 ──────────────────────────
(function clean() {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
})();

console.log('OPV29-Z6-V2529: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
process.exitCode = F === 0 ? 0 : 1;
