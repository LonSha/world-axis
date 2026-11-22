#!/usr/bin/env node
'use strict';
// WorldAxis tools/lock-child.js (v2.529.0) — OPV29-01 单锁子进程入口
//
// ── 它治什么（现场）────────────────────────────────────────────────
//   拆段/分片并行要把「一节里顺序挂载的若干锁」搬到多个子进程里跑。但本仓有一批锁
//   **只有 `module.exports = { runAll, runNegative }`，没有 `require.main` 块**
//   （例：tests/b6-b7-v2870.js、tests/identity-v2860.js）。于是 `node tests/x.js`
//   会：装载引擎 → 一条判据都不跑 → **返回 0**。
//   实测：v2.82.0 一节的 38 把锁里，11 把是这样 —— 「rc=0」与「判了 0 条」长得一模一样。
//   这正是本仓反复治的病：**没读数不许当成没问题**。
//
// ── 它做什么 ──────────────────────────────────────────────────────
//   在子进程里复刻宿主 `tests/run.js` 的 `assert(cond, name, extra)` 语义
//   （通过 ⇒ `pass++` 并打 `  ✓ 名字`；失败 ⇒ `fail++` 并打 `  ✗ 名字 — extra`），
//   然后按需 `await mod.runAll(assert)` / `await mod.runNegative(assert)`。
//   末行固定打 `LOCK-CHILD <file>: pass (N)` 或 `FAIL n/m`，与仓内其它锁同形，
//   于是 `slow-sections` / `anchor-audit` 那类读数解析器不用为它单开口子。
//
// ── 边界（不许假绿）────────────────────────────────────────────────
//   · 锁若**没导出**被请求的方法 ⇒ 报 `missing-method` 并非零退出，不许静默跳过。
//   · 锁体抛异常 ⇒ 打 `crashed` + 栈，rc=2（与「判据红」rc=1 分开，二者不同病）。
//   · 一条判据都没跑到 ⇒ rc=3 `no-criteria`（**这比红更严重**：说明入口是空转的）。
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function assert(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; failures.push(String(name)); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function assertDeepEq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(a === e, name || 'deepEq', a + ' !== ' + e);
}
// 宿主 assert 上挂着的常用附属（少数锁会用到 assert.eq / assert.ok 形态）
assert.ok = function (v, n, x) { assert(!!v, n, x); };
assert.eq = function (a, b, n) { assert(a === b, n, JSON.stringify(a) + ' !== ' + JSON.stringify(b)); };
assert.deepEq = assertDeepEq;

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('用法: node tools/lock-child.js <tests/x.js> [runAll|runNegative]'); process.exit(3); }
  const rel = './' + String(file).replace(/^\.?\/?(tests\/)?/, '');
  const mod = require(path.join(ROOT, 'tests', rel));
  const want = process.argv[3] ? [process.argv[3]] : ['runAll', 'runNegative'];
  for (const m of want) {
    if (typeof mod[m] !== 'function') {
      // 该锁没有这个方法：若调用点本来就没调它，应显式传方法名，不许静默跳过
      console.error('LOCK-CHILD missing-method: ' + rel + ' 没有 ' + m);
      process.exitCode = 3;
      return;
    }
    await mod[m](assert);
  }
  if (pass + fail === 0) {
    console.log('\nLOCK-CHILD ' + rel + ': no-criteria（入口是空转的，不算通过）');
    process.exitCode = 3;
    return;
  }
  console.log('\nLOCK-CHILD ' + rel + ': ' + (fail ? 'FAIL ' + fail + '/' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) {
    failures.forEach(function (f) { console.log(' · ' + f); });
    process.exitCode = 1;
  }
}
main().catch(function (e) {
  console.error('LOCK-CHILD crashed: ' + ((e && e.stack) || e));
  process.exitCode = 2;
});