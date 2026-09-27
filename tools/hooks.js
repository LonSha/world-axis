#!/usr/bin/env node
/**
 * WorldAxis tools/hooks.js (v2.110.0) — Git hooks 的项目级管理（计划一 #29）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   本仓的门禁全在 `npm test` / `node tests/run.js` 里，而它们**只在人想起来的时候跑**。
 *   实测代价：v2.109.0 收口期有三次提交是带着红灯打进去的（其中一次是 `FROZEN2800` 与
 *   生成器产物不一致）—— 发现它们的是下一次全量回归，不是提交那一刻。
 *   `.git/hooks/` 是**项目里唯一一处「提交时一定会执行」的位置**，而此前那里什么都没有。
 *
 * ── 四条口径（否定式）──────────────────────────────────────────────────
 *   ① **不碰别人的 hook**：安装前若同名 hook 已存在且**不含**本工具的签名 ⇒ 拒绝覆盖
 *      （`--force` 才覆盖），并把原文件备份为 `<name>.pre-worldaxis`。一个自动覆盖
 *      `.git/hooks` 的工具比没有 hook 更糟。
 *   ② **快速门禁才进 pre-commit**：全量回归约 13 分钟，塞进 pre-commit 等于让人
 *      `--no-verify`（而一旦开始 `--no-verify`，所有 hook 就都失效了）。故：
 *      pre-commit = 三道秒级门禁（export-contract / reject-code / module-registry）；
 *      pre-push = 全量回归（**且默认注释掉**，见下）。
 *   ③ **pre-push 默认「提示而不阻断」**：全量回归在低配设备上可能 15 分钟以上，
 *      把它变成推送硬门槛会在赶时间时被整体绕过。安装时生成的那段带 `WORLDAXIS_FULL=1`
 *      条件 —— 想跑的人自己开，不想跑的人不必 `--no-verify`（**保住绕过通道的稀缺性**）。
 *   ④ **不自动安装**：`install` 必须显式调用。工具不该在被人 require 时改开发环境。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SIGN = '# @managed-by tools/hooks.js';

/** 三道秒级门禁（pre-commit 用；顺序固定：先契约后归属后装载）。 */
const FAST_GATES = [
  { name: 'export-contract', cmd: 'node tests/export-contract.js' },
  { name: 'reject-code', cmd: 'node tests/reject-code-gate.js' },
  { name: 'module-registry', cmd: 'node tests/module-registry-gate.js' }
];

/** hook 脚本文本（纯函数：可被单测用合成参数驱动）。 */
function renderHook(kind, opts) {
  const o = opts || {};
  const L = [];
  L.push('#!/bin/sh');
  L.push(SIGN + ' — 由 `node tools/hooks.js install` 生成，请勿手改（改 tools/hooks.js）。');
  if (kind === 'pre-commit') {
    L.push('# 秒级门禁：跑完不应超过几秒。慢的东西不许进 pre-commit —— 那会训练人 --no-verify。');
    L.push('set -e');
    FAST_GATES.forEach(function (g) {
      L.push('echo "[worldaxis] gate: ' + g.name + '"');
      L.push(g.cmd + ' >/dev/null || { echo "[worldaxis] ✗ ' + g.name + ' 未通过，提交被阻止"; exit 1; }');
    });
    L.push('echo "[worldaxis] pre-commit 通过（三道快门槛）"');
  } else if (kind === 'pre-push') {
    L.push('# 全量回归默认**不阻断**：它在这类设备上可能跑 15 分钟以上，');
    L.push('# 把它做成硬门槛只会让所有 hook 一起被绕过（绕过通道必须稀缺）。');
    L.push('# 想跑的人：WORLDAXIS_FULL=1 git push');
    L.push('if [ "$WORLDAXIS_FULL" != "1" ]; then');
    L.push('  echo "[worldaxis] pre-push: 跳过全量回归（WORLDAXIS_FULL=1 可开启，约 13 分钟）"');
    L.push('  exit 0');
    L.push('fi');
    L.push('echo "[worldaxis] pre-push: 全量回归开始（不阻断推送，仅报告）"');
    L.push('node tests/run.js | tail -20');
    L.push('exit 0');
  } else {
    return { ok: false, reason: 'unknown-hook-kind', kind: kind };
  }
  L.push('exit 0');
  return { ok: true, kind: kind, text: L.join('\n') + '\n', gates: kind === 'pre-commit' ? FAST_GATES.map(function (g) { return g.name; }) : ['full-regression'] };
}

/** hooks 目录（`git rev-parse --git-path hooks`；不是 git 仓库则回落到 `.git/hooks`）。 */
function hooksDir(root) {
  const r = root || BASE;
  try {
    const cp = require('child_process');
    // stderr 必须吞掉：非 git 目录下 `git rev-parse` 会往 stderr 打一行 fatal，
    //   而本函数的**正常路径**就是「不是仓库 ⇒ 回退 .git/hooks」。不吞的话，
    //   每次 install/status 都会在回归输出里留下假警报（实测 7 行）。
    const out = cp.execSync('git rev-parse --git-path hooks',
      { cwd: r, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return path.isAbsolute(out) ? out : path.join(r, out);
  } catch (e) { return path.join(r, '.git', 'hooks'); }
}

/**
 * 安装一个 hook。返回 `{ok, reason, path, backup}` —— 不抛。
 *   已存在且不含签名 ⇒ `refuse-foreign-hook`（除非 force）。
 */
function install(kind, opts) {
  const o = opts || {};
  const root = o.root || BASE;
  const r = renderHook(kind, o);
  if (!r.ok) return r;
  const dir = hooksDir(root);
  const p = path.join(dir, kind);
  let prev = null;
  try { prev = fs.readFileSync(p, 'utf8'); } catch (e) { prev = null; }
  let backup = '';
  if (prev !== null && prev.indexOf(SIGN) < 0 && !o.force) {
    return { ok: false, reason: 'refuse-foreign-hook', path: p,
      hint: '该 hook 不是本工具生成的；用 --force 覆盖（会先备份为 ' + kind + '.pre-worldaxis）' };
  }
  if (prev !== null && prev.indexOf(SIGN) < 0) {
    backup = p + '.pre-worldaxis';
    try { fs.writeFileSync(backup, prev); } catch (e) { return { ok: false, reason: 'backup-failed', path: p }; }
  }
  try { fs.writeFileSync(p, r.text, { mode: 0o755 }); }
  catch (e) { return { ok: false, reason: 'write-failed', path: p }; }
  try { fs.chmodSync(p, 0o755); } catch (e) { /* 文件系统不支持 chmod 时保持默认权限 */ }
  return { ok: true, reason: '', kind: kind, path: p, backup: backup, text: r.text, gates: r.gates };
}

/** 卸载（只删自己装的：不含签名一律拒绝）。 */
function uninstall(kind, opts) {
  const o = opts || {};
  const p = path.join(hooksDir(o.root || BASE), kind);
  let prev = null;
  try { prev = fs.readFileSync(p, 'utf8'); } catch (e) { return { ok: true, removed: false, reason: 'absent' }; }
  if (prev.indexOf(SIGN) < 0) return { ok: false, removed: false, reason: 'foreign-hook-not-removed' };
  try { fs.unlinkSync(p); } catch (e) { return { ok: false, removed: false, reason: 'unlink-failed' }; }
  return { ok: true, removed: true };
}

/** 当前状态（诊断用；只读）。 */
function status(opts) {
  const dir = hooksDir((opts || {}).root || BASE);
  return ['pre-commit', 'pre-push'].map(function (k) {
    const p = path.join(dir, k);
    let txt = null;
    try { txt = fs.readFileSync(p, 'utf8'); } catch (e) { txt = null; }
    return { hook: k, path: p, present: txt !== null, managed: !!(txt && txt.indexOf(SIGN) >= 0) };
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  console.log('■ Git hooks（项目级管理）');
  if (cmd === 'install') {
    ['pre-commit', 'pre-push'].forEach(function (k) {
      const r = install(k, { force: args.indexOf('--force') >= 0 });
      if (!r.ok) { console.log('  ✗ ' + k + ' — ' + r.reason + (r.hint ? '（' + r.hint + '）' : '')); return; }
      console.log('  ✓ ' + k + ' 已安装 → ' + r.path + (r.backup ? '（原文件备份到 ' + r.backup + '）' : '')
        + ' · 门禁：' + r.gates.join(', '));
    });
  } else if (cmd === 'uninstall') {
    ['pre-commit', 'pre-push'].forEach(function (k) {
      const r = uninstall(k, {});
      console.log('  ' + (r.ok ? (r.removed ? '✓ 已移除 ' : '⏭ 不存在 ') : '✗ 拒绝移除 ') + k
        + (r.ok ? '' : '（' + r.reason + '）'));
    });
  } else {
    status({}).forEach(function (s) {
      console.log('  ' + (s.present ? (s.managed ? '● 已装（本工具管理）' : '● 已存在（外部）') : '○ 未装') + ' ' + s.hook);
    });
    console.log('用法: node tools/hooks.js install [--force] | uninstall | status');
  }
  process.exit(0);
}

module.exports = { BASE: BASE, SIGN: SIGN, FAST_GATES: FAST_GATES, renderHook: renderHook,
  hooksDir: hooksDir, install: install, uninstall: uninstall, status: status };