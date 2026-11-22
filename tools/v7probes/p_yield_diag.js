'use strict';
/* p_yield_diag.js —— OPV7-7 第 2 步验收：secYield 是否真的进了诊断包、是否真是活读者 */
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const vm = require('vm');
const rsrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const li = rsrc.indexOf('const LOAD = [');
const lj = rsrc.indexOf('];', li);
const LOAD = vm.runInNewContext('(' + rsrc.slice(rsrc.indexOf('[', li), lj + 1) + ')');
const ctx = vm.createContext(global);
const _log = console.log;
console.log = function () {};
for (const rel of LOAD) { try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); } catch (e) {} }
console.log = _log;
const WA = global.WorldAxis;
try { WA.store.init(); } catch (e) {}
WA.capabilityTier.applyTier('full');

let pass = 0, fail = 0;
function ck(n, c, e) { if (c) { pass++; console.log('  PASS ' + n + (e ? ' :: ' + e : '')); } else { fail++; console.log('  FAIL ' + n + (e ? ' :: ' + e : '')); } }

console.log('=== 1) 诊断包里出现 yieldAttrib 节 ===');
const d = WA.toolDiag.collect();
ck('collect().yieldAttrib 存在', !!d.yieldAttrib, d.yieldAttrib ? JSON.stringify(Object.keys(d.yieldAttrib)) : 'null');
const y = d.yieldAttrib || {};
ck('无 error 字段', !y.error, y.error || '');
ck('四态计数齐全', ['total', 'yield', 'off', 'fault', 'noData'].every(function (k) { return typeof y[k] === 'number'; }),
  JSON.stringify({ total: y.total, yield: y.yield, off: y.off, fault: y.fault, noData: y.noData }));
ck('四态之和 === total', y.yield + y.off + y.fault + y.noData === y.total,
  y.yield + '+' + y.off + '+' + y.fault + '+' + y.noData + ' = ' + y.total);
ck('line 由 yieldAttribLine 逐字取', typeof y.line === 'string' && y.line.length > 10, y.line);
ck('callFace 结构在位', y.callFace && typeof y.callFace.available === 'boolean', JSON.stringify(y.callFace));
ck('三条名单都是数组', Array.isArray(y.faults) && Array.isArray(y.offRows) && Array.isArray(y.suspicious) && Array.isArray(y.weakRows));

console.log('\n=== 2) 活性：抛异常后诊断包里的 fault 真的涨 ===');
const real = WA.life.buildBlock;
WA.life.buildBlock = function () { throw new Error('diag-77'); };
const d2 = WA.toolDiag.collect();
WA.life.buildBlock = real;
const y2 = d2.yieldAttrib || {};
ck('collect 里 fault 计数 +1', y2.fault === y.fault + 1, y.fault + ' -> ' + y2.fault);
ck('faults 名单含 life', (y2.faults || []).some(function (f) { return f.key === 'life'; }),
  JSON.stringify((y2.faults || []).map(function (f) { return f.key; })));
ck('note 字段被触发', !!y2.note, y2.note || '');

console.log('\n=== 3) 只读：collect 不该写世界 ===');
const before = JSON.stringify(WA.store.get()).length;
WA.toolDiag.collect();
const after = JSON.stringify(WA.store.get()).length;
ck('世界未被诊断写动', before === after, before + ' vs ' + after);

console.log('\n=== 4) 与邻居分列：health / capability / yieldAttrib 三节都在 ===');
ck('health 节在位', !!d.health && typeof d.health === 'object');
ck('capability 节在位', !!d.capability && typeof d.capability === 'object');
ck('三节互不覆盖（health 有 verdict/yieldAttrib 无）',
  ('verdict' in (d.health || {})) && !('verdict' in (d.yieldAttrib || {})));

console.log('\n========== ' + pass + ' passed, ' + fail + ' failed ==========');
process.exit(fail === 0 ? 0 : 1);