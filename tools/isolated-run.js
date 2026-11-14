#!/usr/bin/env node
// WorldAxis tools/isolated-run.js — 隔离回归的**命令行入口**（OPV23-9，v2.408.0）
//
// ── 它治的病 ──────────────────────────────────────────────────────────
//   `tests/isolated-runner.js` 只导出 `launch()`，**没有 `require.main` 入口**。于是
//   「想跑一趟隔离回归」的唯一通路是 `node tests/run.js` —— 而那个入口**自己会调 launch**，
//   于是分层调度器（`tools/smart-runner.js`）想「在隔离容器里跑被选中的节」时无路可走：
//   它要么 shell 拼 `node tests/run.js --only-v-section ...`（**不经过隔离器**，破坏性回归
//   直接落在主树里 —— 这正是 v2.84.0 立隔离器的理由），要么退回 smoke（占位实现的来历）。
//
// ── 本文件只做三件事（不复制隔离逻辑）─────────────────────────────────
//   ① 把 `--only-v-section` 转发给 `launch()`（launch 自己会读 argv 并转发给 worker，
//      **环境变量 `WA_ONLY_SECTION` 由调用方剥除**，见 smart-runner 的剥除段）；
//   ② 让 `launch()` 把最终 result 回带（本版给 launch 加了 `opts.onFinish` 这一条**纯附加**
//      回调；不传它时 `tests/run.js` 的行为逐字不变）；
//   ③ 打一行机器可读的 `WA-ISOLATED-RESULT`（状态 / 摘要 / 任务目录 / 源是否被改动）+
//      以 `launch` 的返回码退出（0 = passed，3 = 其余）。
//   退出码与读数**同源**：调度器据此判「这趟到底证明了什么」，而不是只看一个 0。
//
// 用法：
//   node tools/isolated-run.js                                  # 整趟（无选区，计划门控在调度器侧）
//   node tools/isolated-run.js --only-v-section '<节名子串>'      # 定向
'use strict';
const path = require('path');
const runner = require(path.join(__dirname, '..', 'tests', 'isolated-runner.js'));
const root = path.join(__dirname, '..');
let final = null;
runner.launch(root, { onFinish: function (r) { final = r; } }).then(function (code) {
  const ev = {
    status: final ? final.status : 'no-result',
    summary: final ? final.summary : null,
    task: final ? final.task : null,
    unchanged: final ? !!final.unchanged : null,
    wrapped: final ? (final.wrappedSections || null) : null,
    exit: code
  };
  console.log('WA-ISOLATED-RESULT ' + JSON.stringify(ev));
  process.exit(code);
}).catch(function (e) {
  console.log('WA-ISOLATED-RESULT ' + JSON.stringify({ status: 'launch-error', summary: null, task: null, error: String(e && e.message) }));
  process.exit(3);
});
