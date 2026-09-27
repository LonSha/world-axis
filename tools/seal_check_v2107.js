#!/usr/bin/env node
'use strict';
/**
 * tools/seal_check_v2107.js — v2.107.0 收口前密封校验。
 * 原则：判据全部**现场取真值**；失败的判据先怀疑判据自己。
 * 本版自己就是治「读数没有单一真源 / 静态面自造次序」的，故本文件里不得写死读数副本
 * （版本号除外：它本来就该在本文件里作为本次目标）。
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const VER = '2.107.0';
const OLD = '2.106.1';
let P = 0, F = 0;
const failures = [];
function ok(c, m) { if (c) { P++; console.log('  OK ' + m); } else { F++; failures.push(m); console.log('  FAIL ' + m); } }
function rd(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function run(file, args) {
  const r = cp.spawnSync('node', [file].concat(args || []), { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const NL = String.fromCharCode(10);

// 1. 入口 / 清单同源
const idxLine = rd('index.js').split(NL).filter(function (l) { return l.indexOf('VERSION = ') >= 0 && l.indexOf("'2.") >= 0; })[0];
ok(!!idxLine && idxLine.indexOf(VER) >= 0, '1a index.js VERSION 行为 ' + VER + '（实 ' + (idxLine || '').trim() + '）');
const man = JSON.parse(rd('manifest.json'));
ok(man.version === VER, '1b manifest.version === ' + VER + '（实 ' + man.version + '）');

// 2. 三本台账 version
['tests/reject-code-ledger.json', 'tests/module-registry-ledger.json', 'tests/dead-export-ledger.json'].forEach(function (rel) {
  const j = JSON.parse(rd(rel));
  ok(j.version === VER, '2 ' + rel.split('/').pop() + ' version=' + VER + '（实 ' + j.version + '）');
});

// 3. run.js 版本期望锚点
const qOld = "'" + OLD + "'", qNew = "'" + VER + "'";
const runLines = rd('tests/run.js').split(NL);
ok(runLines.filter(function (l) { return l.indexOf(qOld) >= 0; }).length === 0, '3a run.js 无旧版本**期望锚点**');
ok(runLines.filter(function (l) { return l.indexOf(qNew) >= 0; }).length === 8,
  '3b run.js 恰 8 行新版本期望锚点（实 ' + runLines.filter(function (l) { return l.indexOf(qNew) >= 0; }).length + '）');
const sameBatch = runLines.filter(function (l) { return (l.split(VER).length - 1) >= 2; });
ok(sameBatch.length >= 5, '3c 比较值与消息文本同批改（行内出现 >=2 次的共 ' + sameBatch.length + ' 行）');
ok(runLines.filter(function (l) { return l.indexOf(OLD) >= 0; }).length === 0, '3d run.js 历史叙述字样未被误改（实 0 行）');

// 4. index.js 无旧版本残留
ok(rd('index.js').indexOf(OLD) < 0, '4 index.js 无旧版本残留');

// 5. 两把专锁独立入口
const s17 = run('tests/reject-code-coverage-v2107.js');
ok(s17.code === 0 && s17.out.indexOf('pass') >= 0, '5a 专锁 #17 独立入口绿（' + s17.out.trim().split(NL).slice(-1)[0] + '）');
const s20 = run('tests/module-cycle-gate-v2107.js');
ok(s20.code === 0 && s20.out.indexOf('pass') >= 0, '5b 专锁 #20 独立入口绿（' + s20.out.trim().split(NL).slice(-1)[0] + '）');

// 6. 出口面契约逐字未变（本版纯 tests 侧，产品面零扩张）
const ec = run('tests/export-contract.js');
ok(ec.code === 0 && /ns= 109 members= 694 chars= 8296/.test(ec.out),
  '6 出口面契约逐字未变（' + (ec.out.split(NL)[0] || '').trim() + '）');

// 7. #17 现场读数（真跑模块）
const rcc = require(path.join(ROOT, 'tests/reject-code-coverage.js'));
const d = rcc.discover();
ok(d.coverage.total > 0 && d.coverage.identityOk === true,
  '7a #17 恒等式平（见证 ' + d.coverage.witnessed + ' + 死表 ' + d.coverage.dead
  + ' + 基线 ' + d.coverage.base + ' = ' + d.coverage.total + '）');
ok(d.coverage.rate >= 0.3, '7b #17 覆盖率 ' + (d.coverage.rate * 100).toFixed(2) + '% ≥30%');
ok(Object.keys(rcc.DEFERRED).length === 0, '7c #17 延后登记表为空（默认一条都不许延后）');
ok(d.missing.length === 0 && d.unexpected.length === 0, '7d #17 见证面零缺口');

// 8. #20 现场读数（真跑模块）
const mcg = require(path.join(ROOT, 'tests/module-cycle-gate.js'));
const a = mcg.audit();
ok(a.ok === true && a.problems === 0, '8a #20 总判据绿（problems ' + a.problems + '）');
ok(a.aliasFiles === a.files, '8b #20 别名覆盖率满格（' + a.aliasFiles + '/' + a.files + '）');
ok(a.orderViolation.length === 0 && a.edgesLoad >= 20,
  '8c #20 装载期边 ' + a.edgesLoad + ' 条、次序违规 0（次序判据只建立在运行时定案的边上）');
ok(a.crossFileWrite.length === 0 && a.staleRegistration.length === 0
  && a.unreflected.length === 0 && a.ownerMismatch.length === 0,
  '8d #20 四条硬判据全绿（跨文件写 / 过期登记 / 静态漏扫 / 归属错配）');
ok(!a.cycle && !a.cycleWithProv, '8e #20 无环（模块图 + 提供方顶替序）');

// 9. 静态面**不得**拿全部引用来判次序（本版核心纪律的现场复核）
ok(a.edgesAll === a.edgesLoad + a.edgesCall && a.edgesLoad < a.edgesAll / 10,
  '9 静态引用 ' + a.edgesAll + ' 条里只有 ' + a.edgesLoad + ' 条是装载期读'
  + '（拿全部引用判次序会报出成百条噪声）');

// 10. 测试文件面 / 拒收码门禁仍绿
const tg = run('tests/test-surface-gate.js');
ok(tg.code === 0 && /孤儿：（无）/.test(tg.out), '10a 测试文件面孤儿 0（本版新增 4 个文件全部可达）');
const rg = run('tests/reject-code-gate.js');
ok(rg.code === 0, '10b 拒收码可达性门禁绿（本版未新增产品侧内联码）');

console.log('SEAL-V2107: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
if (F) { console.log('失败项：'); failures.forEach(function (m) { console.log('  · ' + m); }); }
process.exit(F === 0 ? 0 : 1);