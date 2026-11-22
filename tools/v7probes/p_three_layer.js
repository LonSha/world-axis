'use strict';
// V7 立项探针：109 个 buildBlock 引擎的三层可达性分级
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
for (const rel of LOAD) { try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); } catch (e) {} }

const WA = global.WorldAxis;
try { WA.store.init(); } catch (e) {}
WA.capabilityTier.applyTier('full');

const norm = function (x) { return String(x).toLowerCase().replace(/[-_]/g, ''); };
const nsAll = Object.keys(WA).filter(function (k) {
  return WA[k] && typeof WA[k] === 'object' && typeof WA[k].buildBlock === 'function';
});

const refNorm = new Set();
const chainRows = [];
for (const chain of ['before', 'after']) {
  for (const s of WA.workflow.list(chain)) {
    refNorm.add(norm(s.id.split('.')[0]));
    chainRows.push(chain + ':' + s.order + ':' + s.id);
  }
}

const adSrc = fs.readFileSync(path.join(BASE, 'engines/action-desk.js'), 'utf8');
const ri = adSrc.indexOf('const ROUTES');
const seg = adSrc.slice(ri, adSrc.indexOf('\n  };', ri));
const calls = seg.match(/WA\.([a-zA-Z0-9_]+)\./g) || [];
const deskNorm = new Set(calls.map(function (c) { return norm(c.replace('WA.', '').replace('.', '')); }));

const L1 = [], L2 = [], L3 = [];
for (const k of nsAll) {
  if (refNorm.has(norm(k))) L1.push(k);
  else if (deskNorm.has(norm(k))) L2.push(k);
  else L3.push(k);
}

console.log('=== 109 个带 buildBlock 的引擎：三层可达性 ===');
console.log('L1 自动驱动（before/after 链）      : ' + L1.length);
console.log('   ' + L1.join(' '));
console.log('L2 仅手动可及（action-desk 路由）  : ' + L2.length);
console.log('   ' + L2.join(' '));
console.log('L3 既无自动驱动也无玩家路由（悬空）: ' + L3.length);
console.log('   ' + L3.join(' '));
console.log('');
console.log('workflow 链步数 before/after = ' + WA.workflow.list('before').length + '/' + WA.workflow.list('after').length);
console.log('action-desk 路由覆盖命名空间 = ' + deskNorm.size);
