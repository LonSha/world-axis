'use strict';
// OPV7-5 验证探针：引擎装载后四层分层是否与仓外探针一致
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = g.WorldAxis;
try { WA.store.init(); } catch (e) {}

console.log('=== driverLedger 装载? ' + (!!WA.driverLedger) + ' ===');
if (!WA.driverLedger) { console.log('未装载'); process.exit(1); }

console.log('\n=== 导出面 ===');
console.log(Object.keys(WA.driverLedger).join(', '));

const v = WA.driverLedger.view();
console.log('\n=== 分层计数 ===');
console.log(JSON.stringify(v.counts));
console.log('total=' + v.total + ' chainSteps=' + v.scan.chainSteps + ' scannedFiles=' + v.scan.files + ' scanOk=' + v.scan.ok);

console.log('\n=== 摘要句 ===');
console.log(WA.driverLedger.summaryText());

console.log('\n=== L1 名单 ===');
console.log(v.layerNames.L1.join(' '));

console.log('\n=== L3 悬空名单（前 40）===');
console.log(v.orphans.slice(0, 40).join(' '));
console.log('总悬空 = ' + v.orphanCount);

console.log('\n=== 只读悬空（被诊断面读着但没人喂）===');
console.log(v.readOnlyOrphans.join(' ') + '  (共 ' + v.readOnlyOrphanCount + ')');

console.log('\n=== why 抽样 ===');
['life', 'events', 'tempo', 'contest', 'backstage'].forEach(function (ns) {
  const w = WA.driverLedger.why(ns);
  console.log(' ' + ns + ' -> layer=' + w.layer + ' driver=' + w.driver + ' writeCount=' + w.writeCount + ' readCount=' + w.readCount);
});

// 幂等：连续两次 view 计数不变
const a1 = WA.driverLedger.stat().calls;
WA.driverLedger.view(); WA.driverLedger.view();
const a2 = WA.driverLedger.stat().calls;
console.log('\n=== 计量：' + a1 + ' -> ' + a2 + '（应 +2） ===');