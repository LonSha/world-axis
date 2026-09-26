'use strict';
/**
 * tools/seal_check_v2106.js — v2.106.0 收口前密封校验（9 组）。
 * 原则：判据全部**现场取真值**；失败的判据先怀疑判据自己。
 * 本版自己就是治「写死读数」的，故本文件里不得出现硬读数的第二副本。
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = '/tmp/wa_git';
const VER = '2.106.0';
const OLD = '2.105.0';
let P = 0, F = 0;
const failures = [];
function ok(c, m) { if (c) { P++; console.log('  OK ' + m); } else { F++; failures.push(m); console.log('  FAIL ' + m); } }
function rd(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function run(file) { const r = cp.spawnSync('node', [file], { cwd: ROOT, encoding: 'utf8', timeout: 240000 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; }
// 1. 入口 / 清单同源
const idxLine = rd('index.js').split(String.fromCharCode(10)).filter(function (l) { return l.indexOf('VERSION = ') >= 0 && l.indexOf(String.fromCharCode(39)  + '2.') >= 0; })[0];
ok(!!idxLine && idxLine.indexOf(VER) >= 0, '1a index.js VERSION 行为 ' + VER + '（该行有缩进，不用 startswith 判）');
const man = JSON.parse(rd('manifest.json'));
ok(man.version === VER, '1b manifest.version === ' + VER + '（实 ' + man.version + '）');
// 2. 三本台账 version
['tests/reject-code-ledger.json', 'tests/module-registry-ledger.json', 'tests/dead-export-ledger.json'].forEach(function (rel) {
  const j = JSON.parse(rd(rel));
  ok(j.version === VER, '2 ' + rel.split('/').pop() + ' version=' + VER + '（实 ' + j.version + '）');
});
// 3. run.js 版本期望锚点
const qOld = String.fromCharCode(39) + OLD + String.fromCharCode(39);
const qNew = String.fromCharCode(39) + VER + String.fromCharCode(39);
const runLines = rd('tests/run.js').split(String.fromCharCode(10));
const oldHits = runLines.filter(function (l) { return l.indexOf(qOld) >= 0; });
const newHits = runLines.filter(function (l) { return l.indexOf(qNew) >= 0; });
ok(oldHits.length === 0, '3a run.js 无旧版本**期望锚点**（实 ' + oldHits.length + '）');
ok(newHits.length === 8, '3b run.js 恰 8 处新版本期望锚点（实 ' + newHits.length + '）');
// v2.106.0 修：消息里的第二处版本号是**裸串**（`入口版本为 2.1.0（实 ' + ver + '）`），
//   不是引号包裹形态。用 m[2] 这种取错观察位会得 0 行 —— 改看裸串计数。
const sameBatch = runLines.filter(function (l) { return (l.split(VER).length - 1) >= 2; });
ok(sameBatch.length >= 5, '3c 比较值与消息文本同批改（行内出现 ≥2 次的共 ' + sameBatch.length + ' 行）');
const hist = runLines.filter(function (l) { return l.indexOf(OLD) >= 0; });
ok(hist.length === 3, '3d 历史叙述字样保留 3 行（实 ' + hist.length + '）');
// 4. index.js 无旧版本常量残留
ok(rd('index.js').indexOf(OLD) < 0, '4 index.js 无旧版本残留');
// 5. 专锁独立入口
const solo = run('tests/readings-v2106.js');
ok(solo.code === 0 && solo.out.indexOf('pass') >= 0, '5a 专锁独立入口绿（' + solo.out.trim().split(String.fromCharCode(10)).slice(-1)[0] + '）');
// 6. 现场读数
const R6 = require(path.join(ROOT, 'tests/readings.js'));
const d = R6.discover();
ok(d.fields.length === 7 && d.siteCount >= 20 && d.problems === 0, '6a 现场 ' + d.fields.length + ' 族 / 站点 ' + d.siteCount + ' / 三类判据问题 ' + d.problems);
const led = R6.ledgerReport();
ok(led.rows.length === 3 && led.rows.every(function (r) { return r.version === VER; }) && led.problems.length === 0, '6b 三本台账 version 同源且台账判据零问题');
ok(R6.backfillPlan(rd('tests/run.js')).length === 0, '6c 待回填项 0 族');
ok(R6.versionOfIndex() === man.version, '6d versionOfIndex === manifest.version（' + R6.versionOfIndex() + '）');
// 7. 独立门禁
const surf = run('tests/test-surface-gate.js');
const m7 = surf.out.match(/测试文件面 (\d+) · 锁 (\d+) · 可达 (\d+)[\s\S]*?孤儿 (\d+)/);
ok(surf.code === 0 && !!m7 && Number(m7[4]) === 0 && Number(m7[1]) === Number(m7[3]), '7a test-surface-gate 绿且孤儿 0（' + (m7 ? m7[0].replace(/\s+/g, ' ') : surf.out.slice(0, 80)) + '）');
const ec = run('tests/export-contract.js');
ok(ec.code === 0 && ec.out.indexOf('ns= 109 members= 694 chars= 8296') >= 0, '7b 出口面契约逐字未变');
const rg = run('tests/reject-code-gate.js');
ok(rg.code === 0 && rg.out.indexOf('见证 124 / 死表 5 / 基线 233') >= 0, '7c 拒收码三者全不变');
const dg = run('tests/dead-export-gate.js');
ok(dg.code === 0 && dg.out.indexOf('dead 454 · uiDead 4') >= 0, '7d 死子面无新增');
const mg = run('tests/module-registry-gate.js');
ok(mg.code === 0, '7e 模块注册门禁绿');
const gt5 = run('tests/gate-timeout-v2105.js');
ok(gt5.code === 0 && gt5.out.indexOf('pass') >= 0, '7f v2.105.0 专锁仍绿（' + gt5.out.trim().split(String.fromCharCode(10)).slice(-1)[0] + '）');
// 8. 文档就位且顺序正确
const plan = rd('FOUR_VERSION_PLAN.md');
const pCur = plan.indexOf('## v2.106.0'), pOld = plan.indexOf('## v2.105.0'), pEnd = plan.indexOf('## 完成纪律');
ok(pCur > pOld && pCur < pEnd && pOld >= 0 && pEnd > 0, '8a PLAN 升序：v2.105.0 → v2.106.0 → 完成纪律');
const logTxt = rd('ITERATION_LOG.md');
const lNow = logTxt.indexOf('### R89'), lPrev = logTxt.indexOf('### R88');
ok(lNow >= 0 && lPrev > lNow, '8b LOG 最新在前：R89 → R88');
ok(logTxt.indexOf('8925') >= 0, '8c LOG 记了本版全量回归读数');
// 9. 文档点名的脚本必须实存
const named = ['tools/bump_v2106.js', 'tools/seal_check_v2106.js', 'tests/readings.js', 'tests/readings-v2106.js'];
const missing = named.filter(function (n) { return !fs.existsSync(path.join(ROOT, n)); });
ok(missing.length === 0, '9 文档点名的一次性脚本全部实存（缺：' + (missing.join(',') || '无') + '）');
console.log('SEAL ' + (F === 0 ? 'OK' : 'FAIL') + ' — ' + P + ' 项绿 / ' + F + ' 项红');
if (F) { console.log(failures.join(String.fromCharCode(10))); process.exit(1); }
