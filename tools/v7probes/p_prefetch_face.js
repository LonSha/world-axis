'use strict';
// 探针：模拟 Tauri 真机的 __prefetch（全量产品源码 Map），验证 prefetch 面能否给出 L3 结论。
//   这是 OPV7-5 的关键验证：产品宿主里「读不到 fs」不该等于「没有驱动者」，
//   而真机预取面是完整源码 ⇒ 可以下结论。此探针证明该分支真的能走通。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const mL = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + mL[1] + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = g.WorldAxis;
// 注：driverLedger 的扫描缓存自带签名（命名空间数/预取条数/装载条数），
//   扫描面一变下次 view() 自己重扫 —— 不需要（也已不再提供）invalidate()。
try { WA.store.init(); } catch (e) {}

// ── 前置：无预取时必须是「未判定」，不能是 L3 ────────────────────────────
const v0 = WA.driverLedger.view();
console.log('=== 无预取（当前形态）===');
console.log('level=' + v0.scan.level + ' canConclude=' + v0.scan.canConclude
  + ' L3=' + v0.counts.L3 + ' 未判定=' + v0.undeterminedCount);
const okNoFalseNeg = v0.counts.L3 === 0 && v0.undeterminedCount > 0;
console.log((okNoFalseNeg ? '✓' : '✗') + ' 无预取时不下「没有驱动者」的结论（L3 必须为 0）');

// ── 构造真机预取面：把产品源码按 index.js 的 fetch 形态塞进 WA.__prefetch ──
const PROD_DIRS = ['engines', 'core', 'ui', 'render', 'actors', 'direction', 'compat', 'design'];
const files = [];
function walk(rel) {
  let st; try { st = fs.statSync(path.join(BASE, rel)); } catch (e) { return; }
  if (st.isFile()) { if (/\.js$/.test(rel)) files.push(rel); return; }
  fs.readdirSync(path.join(BASE, rel)).forEach(function (n) { walk(rel + '/' + n); });
}
walk('index.js');
PROD_DIRS.forEach(function (d) { walk(d); });

const base = 'http://tauri.localhost/wa';
WA.baseUrl = base;
const pf = new Map();
files.forEach(function (rel) {
  try { pf.set(base + '/' + rel, fs.readFileSync(path.join(BASE, rel), 'utf8')); } catch (e) {}
});
WA.__prefetch = pf;
WA.__loadOrder = files.slice();

const v1 = WA.driverLedger.view();
console.log('\n=== 有完整预取（模拟 Tauri 真机）===');
console.log('level=' + v1.scan.level + ' canConclude=' + v1.scan.canConclude
  + ' 预取=' + v1.scan.prefetched + '/' + v1.scan.declared + ' 扫到文件=' + v1.scan.files);
console.log('分层=' + JSON.stringify(v1.counts));
console.log('摘要: ' + WA.driverLedger.summaryText());

const okConclude = v1.scan.canConclude === true && v1.counts.L3 > 0;
console.log((okConclude ? '✓' : '✗') + ' 完整预取时给出真 L3 结论（L3=' + v1.counts.L3 + '）');
console.log((v1.counts.undetermined === 0 ? '✓' : '✗') + ' 完整预取时未判定应为 0（实 ' + v1.counts.undetermined + '）');

console.log('\n=== 悬空清单（前 30）===');
console.log(v1.orphans.slice(0, 30).join(' '));
console.log('\n=== 只读悬空（被读着但没人喂）===');
console.log(v1.readOnlyOrphans.slice(0, 20).join(' ') + '  (共 ' + v1.readOnlyOrphanCount + ')');
console.log('\n=== L2p 面板可喂（前 20）===');
console.log(v1.layerNames.L2p.slice(0, 20).join(' '));

// ── 预取不完整时：必须退回「未判定」，不能冒充完整 ──────────────────────
WA.__prefetch = new Map(Array.from(pf.entries()).slice(0, 40));
const v2 = WA.driverLedger.view();
console.log('\n=== 预取不完整（40/' + files.length + '）===');
console.log('level=' + v2.scan.level + ' canConclude=' + v2.scan.canConclude + ' L3=' + v2.counts.L3);
console.log((v2.scan.canConclude === false ? '✓' : '✗') + ' 预取不完整时不下结论');
console.log('摘要: ' + WA.driverLedger.summaryText());