'use strict';
// 侦察：运行期可得的三类驱动面真源，各覆盖多少引擎
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

// 所有带 buildBlock 的引擎
const engines = Object.keys(WA).filter(function (k) {
  const v = WA[k];
  return v && typeof v === 'object' && typeof v.buildBlock === 'function';
});
console.log('带 buildBlock 的引擎 = ' + engines.length);

// 源 B：ROUTES 的函数源码
const R = WA.actionDesk && WA.actionDesk.ROUTES;
console.log('\nROUTES typeof = ' + typeof R + ' len=' + (R ? (R.length || Object.keys(R).length) : 0));
let routeNs = {};
let fnWithSrc = 0;
if (R) {
  const keys = Array.isArray(R) ? R : Object.keys(R);
  keys.forEach(function (k) {
    // ROUTES 导出的是 Object.keys(ROUTES) —— 只有键名！值拿不到
  });
  console.log('导出形态 = ' + (Array.isArray(R) ? 'Array(键名)' : 'Object'));
  console.log('样例 = ' + JSON.stringify((Array.isArray(R) ? R : keys).slice(0, 8)));
  // key 形态 ns.mem
  (Array.isArray(R) ? R : keys).forEach(function (k) {
    const ns = String(k).split('.')[0];
    routeNs[ns] = (routeNs[ns] || 0) + 1;
  });
}
console.log('ROUTES 覆盖命名空间数 = ' + Object.keys(routeNs).length);
const coverByRoute = engines.filter(function (e) { return routeNs[e]; });
console.log('B 源（路由键名）可覆盖的引擎 = ' + coverByRoute.length + ' -> ' + coverByRoute.slice(0, 40).join(' '));

// 源 C：能否从函数对象取源码？试 actionDesk.actFromScene
console.log('\n=== fn.toString() 可行? ===');
try {
  const s = WA.actionDesk.actFromScene.toString();
  console.log('actFromScene 源码长度 = ' + s.length + ' 首80=' + s.replace(/\s+/g, ' ').slice(0, 80));
} catch (e) { console.log('取源码失败 ' + e.message); }

// 源 D：WA.modules 登记形态
console.log('\n=== WA.modules ===');
console.log('typeof=' + typeof WA.modules + ' len=' + (WA.modules ? Object.keys(WA.modules).length : 0));
console.log('样例=' + JSON.stringify(Object.keys(WA.modules || {}).slice(0, 12)));
if (WA.modules && Object.keys(WA.modules).length) {
  const k0 = Object.keys(WA.modules)[0];
  console.log('值形态 k0=' + k0 + ' -> ' + JSON.stringify(WA.modules[k0]).slice(0, 200));
}

// 源 E：__prefetch
console.log('\n__prefetch = ' + (WA.__prefetch ? 'Map size=' + WA.__prefetch.size : 'none'));

// 源 F：panel 侧有没有运行期控件注册表
console.log('\n=== panel 相关命名空间 ===');
Object.keys(WA).forEach(function (k) {
  if (/panel|surface|control|widget|page/i.test(k)) {
    const v = WA[k];
    if (v && typeof v === 'object') console.log(' WA.' + k + ' -> ' + Object.keys(v).slice(0, 20).join(','));
  }
});