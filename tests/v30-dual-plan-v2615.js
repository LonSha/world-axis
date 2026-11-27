#!/usr/bin/env node
// tests/v30-dual-plan-v2615.js (v2.615.0) — V30 18 项双计划台账锁
//
// 它治什么：18 项计划最容易死在「列过就算做过」。本锁不读承诺，只读两件硬事实：
//   ① 单一真源 plans/V30_DUAL_PLAN_18.md 逐项存在且状态词在白名单里；
//   ② #10 跟位税工具的两种新模式真能吐出清单，原七路引擎模式仍 48/48 通过。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function sh(cmd) {
  const r = cp.spawnSync(process.execPath, cmd, { cwd: BASE, encoding: 'utf8', timeout: 120000 });
  return { rc: r.status === null ? -1 : r.status, out: (r.stdout || '') + (r.stderr || '') };
}
console.log('=== v30-dual-plan-v2615: 18 项双计划台账锁 ===');
const PLAN = read('plans/V30_DUAL_PLAN_18.md');
const OK = ['done','already-done','partial','adjudicated','planned','evidence-gap'];
a(PLAN.indexOf('# V30 拓展/优化双计划（18 项') === 0, 'A1: 单一真源文件存在且标题正确');
for (let i = 1; i <= 18; i++) {
  a(PLAN.indexOf('| ' + i + ' |') > 0, 'A2.' + i + ': 第 ' + i + ' 项在册');
}
const rows = PLAN.split('\n').filter(function (l) { return l.indexOf('| ') === 0 && /^\| \d+ \|/.test(l); });
a(rows.length === 18, 'A3: 恰好 18 行（实 ' + rows.length + '）');
rows.forEach(function (r, i) {
  const cols = r.split('|').map(function (x) { return x.trim(); });
  const st = cols[3];
  a(OK.indexOf(st) >= 0, 'A4.' + (i + 1) + ': 状态词合法（' + st + '）');
});
const N = read('tools/new-engine.js');
a(N.indexOf('function versionSites(kind, ver)') > 0, 'B1: 跟位清单函数在位');
a(N.indexOf("mode !== 'engine' && (checkOnly || dry)") > 0, 'B2: 只读清单模式不写盘');
const v = sh(['tools/new-engine.js', '--mode=version-bump', '--ver=2.615.0', '--check']);
a(v.rc === 0 && v.out.indexOf('FOLLOW version-bump@2.615.0') >= 0 && v.out.indexOf('11 把 s3') >= 0, 'B3: version-bump 清单 0 退出且列 11 把 s3');
const d = sh(['tools/new-engine.js', '--mode=data-only', '--ver=2.615.0', '--dry-run']);
a(d.rc === 0 && d.out.indexOf('FOLLOW data-only@2.615.0') >= 0 && d.out.indexOf('read:evidence') >= 0, 'B4: data-only 清单含证据账本读数');
const z = sh(['tests/opv29-z5-v2529.js']);
a(z.rc === 0 && z.out.indexOf('pass（48 项）') >= 0, 'B5: 原七路脚手架专锁 48/48 不回退');
console.log('---\n通过: ' + pass + ' / 失败: ' + fail);
process.exit(fail ? 1 : 0);
