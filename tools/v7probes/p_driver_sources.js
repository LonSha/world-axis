'use strict';
// 侦察：产品运行期有哪些「驱动面」真源可读（不依赖 fs 扫描）
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

console.log('=== vm 内宿主能力 ===');
console.log(vm.runInContext('[typeof require, typeof process, typeof module, typeof __dirname].join(",")', ctx));

console.log('\n=== workflow ===');
console.log('list() 长度=' + (WA.workflow && WA.workflow.list ? WA.workflow.list().length : 'N/A'));
console.log('chains=' + JSON.stringify(Object.keys((WA.workflow && WA.workflow.chains) || {})));

console.log('\n=== actionDesk 路由表 ===');
if (WA.actionDesk) {
  console.log('members=' + Object.keys(WA.actionDesk).join(','));
  ['routes', 'ROUTES', 'kinds', 'KINDS'].forEach(function (k) {
    if (WA.actionDesk[k]) {
      const v = WA.actionDesk[k];
      console.log(' ' + k + ' typeof=' + typeof v + ' keys=' + (typeof v === 'object' ? Object.keys(v).length : '-'));
    }
  });
}

console.log('\n=== ui 面 ===');
if (WA.ui) {
  console.log('members=' + Object.keys(WA.ui).join(','));
  console.log('pages=' + (WA.ui.pages ? JSON.stringify(WA.ui.pages().slice(0, 30)) : 'N/A'));
}

console.log('\n=== 面板控件注册表类真源 ===');
['surface', 'control', 'widget', 'panelRegistry', 'uiRegistry'].forEach(function (k) {
  if (WA[k]) console.log(' WA.' + k + ' -> ' + Object.keys(WA[k]).join(','));
});

console.log('\n=== ROUTES 静态表（源码层读一眼） ===');
const ad = fs.readFileSync(path.join(BASE, 'engines/action-desk.js'), 'utf8');
const rm = ad.match(/const ROUTES = \{([\s\S]*?)\n  \};/);
if (rm) console.log('ROUTES 条目数≈' + (rm[1].match(/^\s+\w+:/gm) || []).length);
console.log('ROUTES 是否导出? ' + /ROUTES: ROUTES|routes: ROUTES|ROUTES\b/.test(ad));
const ex = ad.match(/WA\.actionDesk = \{([\s\S]*?)\n  \};/);
if (ex) console.log('导出面: ' + ex[1].replace(/\s+/g, ' ').slice(0, 500));