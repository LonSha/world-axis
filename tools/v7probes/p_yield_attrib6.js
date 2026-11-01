'use strict';
/* p_yield_attrib6.js —— OPV7-7 判据第六探针：`region` 的 4 条到底是不是「出块所需的数据」
 * 若它只是「地点表副本」而不是「已送达事件」，那么「容器有记录 ⇒ fault」这条判据
 * 就是假阳性 —— 必须把这种情形从 fault 里分出去（纪律 14：红灯原因要对）。
 */
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
try { WA.playableBlueprint.installSample('town-workshop', { force: true }); } catch (e) { console.log('install ERR', e.message); }

const st = WA.store.get();
console.log('=== store.region 全貌 ===');
console.log(JSON.stringify(st.region).slice(0, 1200));

console.log('\n=== region.js 的两个取数口 ===');
const src = fs.readFileSync(path.join(BASE, 'engines/region.js'), 'utf8');
const m1 = src.match(/function eventsOf[\s\S]{0,400}?\n  \}/);
const m2 = src.match(/function placesOf[\s\S]{0,400}?\n  \}/);
console.log('eventsOf:', m1 ? m1[0].slice(0, 420) : 'NOT FOUND');
console.log('placesOf:', m2 ? m2[0].slice(0, 420) : 'NOT FOUND');

console.log('\n=== 实测两个取数口 ===');
try {
  const ev = WA.region.stat ? WA.region.stat() : null;
  console.log('region.stat =', JSON.stringify(ev));
} catch (e) {}

console.log('\n=== 结论判据：deliveredAt 存在的事件数 ===');
function countDelivered(v, pathStr, out) {
  if (Array.isArray(v)) {
    v.forEach(function (x, i) { countDelivered(x, pathStr + '[' + i + ']', out); });
    return out;
  }
  if (v && typeof v === 'object') {
    if (Object.prototype.hasOwnProperty.call(v, 'deliveredAt')) out.push(pathStr + ' deliveredAt=' + JSON.stringify(v.deliveredAt));
    Object.keys(v).forEach(function (k) { countDelivered(v[k], pathStr + '.' + k, out); });
  }
  return out;
}
const out = countDelivered(st.region, 'store.region', []);
console.log('含 deliveredAt 字段的记录：' + out.length);
out.slice(0, 10).forEach(function (s) { console.log('  ' + s); });
console.log('\n⇒ region 空产的原因：' + (out.length === 0 ? '没有一条带 deliveredAt 的事件（地点表有副本但事件没送达）—— 这是 no-data，不是 fault' : '有已送达事件却仍空 —— 才是 fault'));