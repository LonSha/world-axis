#!/usr/bin/env node
'use strict';
/**
 * tools/seal_check_v2106_1.js — v2.106.1 收口前密封校验（10 组）。
 * 原则：判据全部**现场取真值**；失败的判据先怀疑判据自己。
 * 本版自己就是治「写死读数」的，故本文件里不得出现硬读数的第二副本（版本号除外：它本该在本文件里作为本次目标）。
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = '/tmp/wa_git';
const VER = '2.106.1';
const OLD = '2.106.0';
let P = 0, F = 0;
const failures = [];
function ok(c, m) { if (c) { P++; console.log('  OK ' + m); } else { F++; failures.push(m); console.log('  FAIL ' + m); } }
function rd(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function run(file, args) { const r = cp.spawnSync('node', [file].concat(args || []), { cwd: ROOT, encoding: 'utf8', timeout: 240000 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; }
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
ok(runLines.filter(function (l) { return l.indexOf(qNew) >= 0; }).length === 8, '3b run.js 恰 8 行新版本期望锚点（实 ' + runLines.filter(function (l) { return l.indexOf(qNew) >= 0; }).length + '）');
const sameBatch = runLines.filter(function (l) { return (l.split(VER).length - 1) >= 2; });
ok(sameBatch.length >= 5, '3c 比较值与消息文本同批改（行内出现 >=2 次的共 ' + sameBatch.length + ' 行）');
ok(runLines.filter(function (l) { return l.indexOf(OLD) >= 0; }).length === 3, '3d 历史叙述字样保留 3 行（实 ' + runLines.filter(function (l) { return l.indexOf(OLD) >= 0; }).length + '）');

// 4. index.js 无旧版本残留
ok(rd('index.js').indexOf(OLD) < 0, '4 index.js 无旧版本残留');

// 5. 专锁独立入口
const solo = run('tests/readings-v2106.js');
ok(solo.code === 0 && solo.out.indexOf('pass') >= 0, '5 专锁独立入口绿（' + solo.out.trim().split(NL).slice(-1)[0] + '）');

// 6. 现场读数（含本补作三修）
const R6 = require(path.join(ROOT, 'tests/readings.js'));
ok(Object.keys(R6).length === 18 && typeof R6.labelSites === 'function', '6a readings 导出面 18 项且含 labelSites（实 ' + Object.keys(R6).length + '）');
const d = R6.discover();
ok(d.fields.length === 7 && d.siteCount >= 20 && d.problems === 0, '6b 现场 ' + d.fields.length + ' 族 / 站点 ' + d.siteCount + ' / 三类判据问题 ' + d.problems);
const led = R6.ledgerReport();
ok(led.rows.length === 3 && led.rows.every(function (r) { return r.version === VER; }) && led.problems.length === 0, '6c 三本台账 version 同源且台账判据零问题');
ok(R6.backfillPlan(rd('tests/run.js')).length === 0, '6d 待回填项 0 族');
ok(R6.versionOfIndex() === man.version, '6e versionOfIndex === manifest.version（' + R6.versionOfIndex() + '）');

// 7. 独立门禁
const surf = run('tests/test-surface-gate.js');
const m7 = surf.out.match(/测试文件面 (\d+) · 锁 (\d+) · 可达 (\d+)[\s\S]*?孤儿 (\d+)/);
ok(surf.code === 0 && !!m7 && Number(m7[4]) === 0, '7a test-surface-gate 绿且孤儿 0（' + (m7 ? m7[0].replace(/\s+/g, ' ') : surf.out.slice(0, 80)) + '）');
const ec = run('tests/export-contract.js');
ok(ec.code === 0 && ec.out.indexOf('ns= 109 members= 694 chars= 8296') >= 0, '7b 出口面契约逐字未变');
const rg = run('tests/reject-code-gate.js');
ok(rg.code === 0 && rg.out.indexOf('见证 124 / 死表 5 / 基线 233') >= 0, '7c 拒收码三者全不变');
const dg = run('tests/dead-export-gate.js');
ok(dg.code === 0 && dg.out.indexOf('dead 454 · uiDead 4') >= 0, '7d 死子面无新增');
const mg = run('tests/module-registry-gate.js');
ok(mg.code === 0 && mg.out.indexOf('硬边 0') >= 0, '7e 模块注册门禁绿且硬边 0');
const gt5 = run('tests/gate-timeout-v2105.js');
ok(gt5.code === 0 && gt5.out.indexOf('pass') >= 0, '7f v2.105.0 专锁仍绿（' + gt5.out.trim().split(NL).slice(-1)[0] + '）');

// 8. 文档就位且顺序正确
const plan = rd('FOUR_VERSION_PLAN.md');
const pCur = plan.indexOf('## v2.106.1'), pOld = plan.indexOf('## v2.106.0'), pEnd = plan.indexOf('## 完成纪律');
ok(pCur > 0 && pCur < pOld && pOld < pEnd, '8a PLAN 降序（新在前）：v2.106.1 -> v2.106.0 -> 完成纪律');
const logTxt = rd('ITERATION_LOG.md');
const lNow = logTxt.indexOf('### R90'), lPrev = logTxt.indexOf('### R89');
ok(lNow >= 0 && lPrev > lNow, '8b LOG 最新在前：R90 -> R89');
ok(logTxt.indexOf('8931') >= 0, '8c LOG 记了本版全量回归读数');

// 9. 文档点名的脚本必须实存
const named = ['tools/bump_v2106_1.js', 'tools/seal_check_v2106_1.js', 'tools/sync-hardcoded.js', 'tests/readings.js', 'tests/readings-v2106.js'];
const missing = named.filter(function (n) { return !fs.existsSync(path.join(ROOT, n)); });
ok(missing.length === 0, '9 文档点名的一次性脚本全部实存（缺：' + (missing.join(',') || '无') + '）');

// 10. sync-hardcoded 薄壳（本补作主交付）
const chk = cp.spawnSync('node', ['--check', path.join(ROOT, 'tools/sync-hardcoded.js')], { encoding: 'utf8' });
ok(chk.status === 0, '10a tools/sync-hardcoded.js 语法可装载（node --check）');
const dry = run('tools/sync-hardcoded.js');
ok(dry.code === 0 && dry.out.indexOf('无需回填') >= 0, '10b 干净树上 dry-run 报「无需回填」（现场真值）');
const js = run('tools/sync-hardcoded.js', ['--json']);
let jsonOk = false, planLen = -1;
try { const o = JSON.parse(js.out); jsonOk = !!o.live && Array.isArray(o.plan); planLen = o.plan.length; } catch (e) { jsonOk = false; }
ok(jsonOk && planLen === 0, '10c --json 机器可读输出且 plan 为空（实 ' + planLen + '）');
const shell = rd('tools/sync-hardcoded.js');
ok(shell.indexOf('message-drift') < 0 && rd('tests/readings.js').indexOf('message-drift') >= 0, '10d 薄壳不做判断（判据住在 readings.js：message-drift 在模块侧）');
const lockSrc = rd('tests/readings-v2106.js');
ok(lockSrc.indexOf('message-drift') >= 0 && lockSrc.indexOf('multi-value') >= 0 && lockSrc.indexOf('no-site') >= 0 && lockSrc.indexOf('labelSites') >= 0, '10e 专锁覆盖三修（message-drift / multi-value / no-site / labelSites）');

console.log('SEAL ' + (F === 0 ? 'OK' : 'FAIL') + ' — ' + P + ' 项绿 / ' + F + ' 项红');
if (F) { console.log(failures.join(NL)); process.exit(1); }
