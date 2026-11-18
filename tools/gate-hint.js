#!/usr/bin/env node
/**
 * WorldAxis tools/gate-hint.js (v2.524.0) — OPV29-16 红门禁最小复现
 *
 * ── 它治什么（本版现场）────────────────────────────────
 *   L0 门禁层的红只有一行：`✗ tests/xxx-gate.js  rc=1`。下一次想再看见它，
 *   只能再跑一遍整层（~90s），而实际要跑的就**一道**。于是“红一次→重跑全层→再红”
 *   成了默认动作，红本身失去了“异常信号”的意义。
 *
 * ── 本模块的职责边界 ────────────────────────────────
 *   只生成「指着那一道」的命令文本。它**不**执行、不重跑、不吞结论：
 *   调用方（`tools/smart-runner.js` L0）在打印红行时顺手把它印出来。
 *   判据只有一条：命令里出现的路径必须是**刚才红的那一个**（不拿整层充数）。
 *
 * ── 两种面，两种命令 ────────────────────────────────
 *   · 单文件门禁（`tests/*.js`）⇒ `node <rel>`
 *   · 回归节（`tests/run.js` 内的 section）⇒ `node tools/isolated-run.js --only-v-section '<名>'`
 *     （直接 `node tests/run.js` 会跑整趟，不是最小复现）
 */
'use strict';
const path = require('path');

function kindOf(rel) {
  const r = String(rel || '');
  if (/^(tests\/run\.js|tests\/)/.test(r) && /run\.js$/.test(r)) return 'runner';
  if (/^tests\//.test(r)) return 'gate';
  if (/^tools\//.test(r)) return 'tool';
  return 'other';
}

/** 命令：给的就是「单跑这一道」。**不拼接整层**。 */
function command(rel, section) {
  const k = kindOf(rel);
  if (k === 'runner') {
    if (!section) return { ok: false, why: 'missing-fields', command: null };
    return { ok: true, command: "node tools/isolated-run.js --only-v-section '" + String(section) + "'", kind: k };
  }
  return { ok: true, command: 'node ' + String(rel), kind: k };
}

/** 一行提示（调用方直接 push 进日志）。 */
function text(rel, section) {
  const c = command(rel, section);
  if (!c.ok) return '  ↳ 单跑复现：算不出（' + c.why + '）';
  return '  ↳ 单跑复现：' + c.command + '   （不必重跑整层）';
}

module.exports = { kindOf: kindOf, command: command, text: text };
