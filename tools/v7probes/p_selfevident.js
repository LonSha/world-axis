'use strict';
// 探针：三条**产品自证**的驱动面各覆盖多少引擎
//   ① workflow 链（声明式自动化，真源 core/workflow.js）
//   ② actionDesk.ROUTES 键名（声明式可执行动作，真源 engines/action-desk.js）
//   ③ ui/ 面板（玩家控制面）
//   为什么不用「写口动词表」：上一轮实测证明它必然误判（27 条漏判 + 49 条虚高）。
//   这三条都是产品自己登记的，不需要猜任何成员的语义。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }
function walk(dir, out) {
  let ents = [];
  try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}
const PROD = [];
['engines', 'core', 'ui', 'render', 'actors', 'direction', 'compat', 'design'].forEach(function (d) { walk(d, PROD); });
PROD.push('index.js');

require(path.join(BASE, 'tests/mock.js'));
const g = global;
const runSrc = read('tests/run.js');
const mm = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + mm[1] + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;
try { WA.store.init(); } catch (e) {}

const engines = Object.keys(WA).filter(function (k) {
  const v = WA[k];
  return v && typeof v === 'object' && typeof v.buildBlock === 'function';
});
console.log('带 buildBlock 的引擎 = ' + engines.length);

// ① workflow 链
const chainNs = {};
WA.workflow.list().forEach(function (n) {
  if (!n || !n.id) return;
  if (n.chain !== 'before' && n.chain !== 'after') return;
  chainNs[String(n.id).split('.')[0]] = 1;
});

// ② actionDesk ROUTES
const routeNs = {};
const R = WA.actionDesk && WA.actionDesk.ROUTES;
(Array.isArray(R) ? R : Object.keys(R || {})).forEach(function (k) {
  routeNs[String(k).split('.')[0]] = 1;
});

// ③ ui/ 面板
const uiNs = {};
walk('ui', []).forEach(function (rel) {
  const src = read(rel);
  if (!src) return;
  const re = /WA\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) uiNs[m[1]] = (uiNs[m[1]] || 0) + 1;
});

// ④ 诊断面（只读聚合）
const diagNs = {};
['engines/tool-diag.js', 'engines/world-health.js'].forEach(function (rel) {
  const src = read(rel);
  if (!src) return;
  const re = /WA\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) diagNs[m[1]] = (diagNs[m[1]] || 0) + 1;
});

const L1 = engines.filter(function (e) { return chainNs[e]; });
const L2r = engines.filter(function (e) { return !chainNs[e] && routeNs[e]; });
const L2p = engines.filter(function (e) { return !chainNs[e] && !routeNs[e] && uiNs[e]; });
const diagOnly = engines.filter(function (e) { return !chainNs[e] && !routeNs[e] && !uiNs[e] && diagNs[e]; });
const none = engines.filter(function (e) { return !chainNs[e] && !routeNs[e] && !uiNs[e] && !diagNs[e]; });

console.log('\n=== 产品自证驱动面分层 ===');
console.log('L1  workflow 链自动         : ' + L1.length + ' -> ' + L1.join(' '));
console.log('L2r actionDesk 路由登记     : ' + L2r.length + ' -> ' + L2r.join(' '));
console.log('L2p 面板可触                : ' + L2p.length + ' -> ' + L2p.join(' '));
console.log('L3a 只有诊断面读            : ' + diagOnly.length + ' -> ' + diagOnly.join(' '));
console.log('L3b 谁都不调                : ' + none.length + ' -> ' + none.join(' '));
console.log('\n合计 = ' + (L1.length + L2r.length + L2p.length + diagOnly.length + none.length));