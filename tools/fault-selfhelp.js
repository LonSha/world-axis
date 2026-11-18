#!/usr/bin/env node
/**
 * WorldAxis tools/fault-selfhelp.js (v2.524.0) — OPV29-15 故障自诊（两种真事故）
 *
 * ── 为什么要有它 ──────────────────────────────────────
 *   本仓真实踩过两次「环境看起来坏了」的坑，两次的共同点是：现场输出读起来像环境问题，
 *   而处置只有一句话。人不在时，这句话就丢了。
 *
 *   ① **stale lock**：隔离器的锁目录（`<tmp>/worldaxis-regression-<hash>.lock`）的
 *      主人进程已经没了（或 pid 被复用），于是每一趟都停在“有锁”。
 *      正确处置：`recoverLock` 只收 `stale` / `no-owner` 两态，且要过“活子进程”二次确认
 *      —— **不许** `find /tmp -name '*.lock' -delete`（会连活锁一起杀）。
 *   ② **.git 对象库损坏**：`git status` 报 `object file ... is empty/loose object ... corrupt`。
 *      正确处置顺序：先 `git fsck --connectivity-only` 看清缺哪些对象，再 `git fetch origin`
 *      从远端补 —— **不许** 上来就 `git gc --prune=now`（会把还能救的悬空对象删掉），
 *      **不许** `find .git -delete` 之类。
 *
 * ── 口径 ────────────────────────────────────────────
 *   · 只**诊断**并给出「下一步命令」，不自动执行写操作（本文件零写盘、零 spawn 修改类命令）。
 *   · 不知道的病症就回 `unknown` 并附上已探测到的事实，不猜一个治法。
 */
'use strict';
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');

/** 与 tests/isolated-runner.js 同一算法（sha256(root) 前 20 位）——两处必须一致。 */
function lockDir(root) {
  const digest = crypto.createHash('sha256').update(root || ROOT).digest('hex').slice(0, 20);
  return path.join(os.tmpdir(), 'worldaxis-regression-' + digest + '.lock');
}

function lockState(root) {
  const dir = lockDir(root || ROOT);
  let inspect;
  try { inspect = require(path.join(ROOT, 'tests', 'isolated-runner.js')).inspectLock; }
  catch (e) { return { dir: dir, state: 'unknown', why: 'runner-unreadable', hint: null }; }
  const st = inspect(dir);
  const out = { dir: dir, state: st.state, why: st.why || null, pid: st.owner ? st.owner.pid : null };
  if (st.state === 'active') out.hint = '活锁：等它跑完，或先确认那个 pid 已不是回归；不要删。';
  else if (st.state === 'stale' || st.state === 'no-owner') out.hint = '可回收：node tools/fault-selfhelp.js --recover（幂等；会先确认没有活子进程）';
  else if (st.state === 'unknown') out.hint = '读不出主人：先 ls -la ' + dir + ' 看一眼 why=' + (st.why || '?') + '，再决定。';
  return out;
}

function gitState(root) {
  const r = cp.spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root || ROOT, encoding: 'utf8' });
  if (r.status === 0) return { ok: true, head: String(r.stdout).trim() };
  const bad = String((r.stdout || '') + (r.stderr || '')).split('\n').filter(Boolean).slice(0, 3).join(' | ');
  return {
    ok: false, why: bad || 'rev-parse-failed',
    hint: '先 node tools/fault-selfhelp.js --symptom=git-object-corrupt 看清步骤；顺序是 fsck → fetch 补对象，不是 gc --prune=now'
  };
}

/** 症状表：每条只给「下一步一条命令」+「明确禁止什么」。 */
const SYMPTOMS = {
  'stale-lock': {
    next: 'node tools/fault-selfhelp.js --recover',
    why: '锁的主人已经不在了（或 pid 被复用）；recoverLock 只收 stale/no-owner，并先确认没有活子进程',
    forbidden: ["find /tmp -name '*.lock' -delete", 'rm -rf <tmp>/worldaxis-regression-*.lock']
  },
  'git-object-corrupt': {
    next: 'git fsck --connectivity-only --no-dangling',
    why: '先看清缺哪些对象，再从 origin 补齐；直接 gc --prune=now 会把还能救的悬空对象删掉',
    forbidden: ['git gc --prune=now', 'find .git -delete', 'git checkout -- . 清现场']
  },
  'slim-suspect': {
    next: 'WA_SLIM=0 node tools/isolated-run.js --only-v-section \'<节名>\'',
    why: 'OPV29-03 的复制面瘦身若吃掉了某节的证据，关掉瘦身重跑同一节即可对照',
    forbidden: []
  },
  'gate-red': {
    next: 'node tools/gate-hint.js --rel=<红的那一道>',
    why: '红一次就能单跑复现，不必重跑整层',
    forbidden: []
  }
};

function diagnose(opts) {
  const o = opts || {};
  const lock = lockState(o.root);
  const git = gitState(o.root);
  const known = lock.state === 'stale' || lock.state === 'no-owner' ? 'stale-lock'
    : !git.ok ? 'git-object-corrupt' : 'none';
  return { lock: lock, git: git, verdict: known, step: known === 'none' ? null : SYMPTOMS[known] };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.indexOf('--json') >= 0;
  const rec = argv.indexOf('--recover') >= 0;
  const sym = argv.filter(function (a) { return a.indexOf('--symptom=') === 0; })[0];
  if (sym) {
    const k = sym.slice('--symptom='.length);
    const hit = SYMPTOMS[k];
    if (!hit) { console.error('未知病症：' + k + '（已知：' + Object.keys(SYMPTOMS).join('/') + '）'); process.exitCode = 3; return; }
    console.log('■ ' + k + '\n  下一步：' + hit.next + '\n  为什么：' + hit.why);
    if (hit.forbidden.length) console.log('  禁止：' + hit.forbidden.join(' / '));
    return;
  }
  if (rec) {
    const dir = lockDir(ROOT);
    try {
      const r = require(path.join(ROOT, 'tests', 'isolated-runner.js')).recoverLock(dir);
      console.log('■ 已回收：' + JSON.stringify(r || { dir: dir }));
    } catch (e) {
      console.error('■ 未回收（这是正确行为，不是失败）：' + e.message);
      process.exitCode = 3;
    }
    return;
  }
  const d = diagnose({});
  if (asJson) { console.log(JSON.stringify(d, null, 2)); return; }
  console.log('■ 锁：' + d.lock.state + (d.lock.dir ? ' @ ' + d.lock.dir : ''));
  if (d.lock.hint) console.log('  ↳ ' + d.lock.hint);
  console.log('■ git：' + (d.git.ok ? 'HEAD ' + d.git.head.slice(0, 8) : '读不出 HEAD（' + d.git.why + '）'));
  if (!d.git.ok) console.log('  ↳ ' + d.git.hint);
  console.log('■ 结论：' + (d.verdict === 'none' ? '两项都没毛病（这不是“已排查完”，只是这两项都没命中）' : d.verdict));
}

module.exports = { lockDir: lockDir, lockState: lockState, gitState: gitState, SYMPTOMS: SYMPTOMS, diagnose: diagnose };
if (require.main === module) main();
