#!/usr/bin/env node
// WorldAxis tests/opv29-z3-v2524.js -- V29 优化线 Z3（OPV29-15/16）专锁
//
// 治的病
//   红门禁只有一行 rc=1，想再看一眼就得重跑整层；两种真事故（stale lock / .git 对象库损坏）
//   的处置只有一句话，人不在就丢了 —— 而它们又是最容易“照着错命令办错事”的两处
//   （`find -delete` 杀活锁、`gc --prune=now` 删掉还能救的对象）。
//
// 本锁钉住两段（每段都带负控制）：
//   X 红门禁最小复现：命令必须指着**刚才红的那一道**；回归节必须走 --only-v-section，不许拿整趟充数。
//   Y 故障自诊：下一步只给一条命令；禁止清单必须点名危险动作；活锁不得被当成可回收。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; return true; }
  fail++; fails.push(name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
function eq(a, b, name) { return ok(a === b, name, { got: a, want: b }); }

const ROOT = path.join(__dirname, '..');
const hint = require('../tools/gate-hint.js');
const help = require('../tools/fault-selfhelp.js');

// ── X：OPV29-16 红门禁最小复现 ──
eq(hint.kindOf('tests/module-cycle-gate.js'), 'gate', 'X1 单文件门禁认得出');
eq(hint.kindOf('tests/run.js'), 'runner', 'X2 回归跑器认得出');
eq(hint.kindOf('tools/smoke.js'), 'tool', 'X3 工具认得出');
eq(hint.command('tests/export-contract.js').command, 'node tests/export-contract.js', 'X4 命令指着那一道，不拼整层');
ok(hint.command('tests/export-contract.js').command.indexOf('run.js') < 0, 'X4b **不许拿整趟充数**（负控制）');
eq(hint.command('tests/run.js').ok, false, 'X5 回归跑器不给节名就算不出（不编）');
eq(hint.command('tests/run.js').why, 'missing-fields', 'X5b 理由说得出');
eq(hint.command('tests/run.js', 'core/store').command,"node tools/isolated-run.js --only-v-section 'core/store'", 'X6 节级走隔离器定向，不是整趟');
ok(/不必重跑整层/.test(hint.text('tests/inventory.js')), 'X7 提示里写清“不必重跑整层”');
ok(hint.text('tests/inventory.js').indexOf('node tests/inventory.js') >= 0, 'X7b 提示里带着那条命令');
ok(/算不出/.test(hint.text('tests/run.js')), 'X8 算不出就直说，不回一条假的');
const sr = fs.readFileSync(path.join(ROOT, 'tools', 'smart-runner.js'), 'utf8');
ok(sr.indexOf('gate-hint') >= 0, 'X9 L0 **真的**接线了（不是只写了个模块）');

// ── Y：OPV29-15 故障自诊 ──
const ld = help.lockDir(ROOT);
ok(/worldaxis-regression-[0-9a-f]{20}\.lock$/.test(ld), 'Y1 锁目录名与隔离器同形', ld);
eq(ld, help.lockDir(ROOT), 'Y1b 同一 root 恒等（幂等）');
ok(ld.indexOf(os.tmpdir()) === 0, 'Y1c 落在 tmp 下（不污染仓库）');
const sl = help.SYMPTOMS['stale-lock'];
ok(!!sl && sl.next.indexOf('--recover') >= 0, 'Y2 stale lock 的下一步是回收，不是手删');
ok(sl.forbidden.some(function (f) { return f.indexOf('find') >= 0 && f.indexOf('-delete') >= 0; }), 'Y3 **禁止清单点名 find -delete**（本仓被误导过）', sl.forbidden);
const gc = help.SYMPTOMS['git-object-corrupt'];
ok(gc.next.indexOf('git fsck') === 0, 'Y4 对象库损坏第一步是 fsck，不是 gc');
ok(gc.forbidden.indexOf('git gc --prune=now') >= 0, 'Y5 **禁止 gc --prune=now**（会删掉还能救的对象）', gc.forbidden);
ok(gc.forbidden.some(function (f) { return /\.git\b.*-delete|-delete.*\.git/.test(f) || f.indexOf('find .git') >= 0; }), 'Y6 禁止对自己动手删对象库', gc.forbidden);
ok(help.SYMPTOMS['slim-suspect'].next.indexOf('WA_SLIM=0') >= 0, 'Y7 瘦身可疑时给的是对照命令（关掉再跑同一节）');
eq(help.SYMPTOMS['no-such-symptom'], undefined, 'Y8 未知病症不给治法（不猜）');
const d = help.diagnose({ root: ROOT });
eq(d.git.ok, true, 'Y9 现场 git 读得出 HEAD', d.git.why);
ok(['free', 'active', 'stale', 'no-owner', 'unknown'].indexOf(d.lock.state) >= 0, 'Y10 锁态在五态内', d.lock.state);
if (d.lock.state === 'free') eq(d.lock.hint, null, 'Y10b **没有锁就不得提示“可回收”**（本轮自诊工具自查出的真 bug）');
ok(d.verdict === 'none' || !!d.step, 'Y11 有结论就一定有下一步（不空口）');
if (d.lock.state === 'active') ok(/不要删/.test(d.lock.hint || ''), 'Y12 **活锁不得被当成可回收**（负控制）', d.lock.hint);
else ok(d.lock.state !== 'active', 'Y12 当前非活锁，本项不适用（不算通过也不算失败）');
const selfSrc = fs.readFileSync(path.join(ROOT, 'tools', 'fault-selfhelp.js'), 'utf8');
ok(selfSrc.indexOf('spawnSync') >= 0 && selfSrc.indexOf("'-c'") < 0, 'Y13 自诊只读：不跑修改类 git 子命令');

if (fail) {
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  fails.slice(0, 25).forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('PASS ' + pass + '/' + pass + ' (opv29-z3-v2524)');
