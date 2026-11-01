'use strict';
// 探针：跑 engine 内部真正在用的 build()，核对五档分层读数
//   与 p_selfevident.js 的口径不同点：这里走的是 **产品内代码**，不是复刻判定。
//   两者读数必须一致；不一致就说明引擎实现的判据与实证口径分叉了。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

require(path.join(BASE, 'tests/mock.js'));
const g = global;
const LOAD = vm.runInNewContext('[' + (read('tests/run.js').match(/const LOAD = \[([\s\S]*?)\];/)[1]) + ']');
const ctx = vm.createContext(g);
const fail = [];
for (const rel of LOAD) {
  try { vm.runInContext(read(rel), ctx, { filename: rel }); }
  catch (e) { fail.push(rel + ': ' + e.message); }
}
const WA = g.WorldAxis;
// 注：driverLedger 的扫描缓存自带签名（命名空间数/预取条数/装载条数），
//   扫描面一变下次 view() 自己重扫 —— 不需要（也已不再提供）invalidate()。
try { WA.store.init(); } catch (e) {}

console.log('装载失败 ' + fail.length + ' 个' + (fail.length ? '：' + fail.slice(0, 3).join(' | ') : ''));
console.log('driverLedger 装载? ' + !!(WA.driverLedger));

// ── 强制走 prefetch 面（真机主场景），把 ui/ 源码也交给它，才能判定面板面 ──
const PROD = [];
(function walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.js')) PROD.push(rel);
  }
})('ui');
for (const d of ['engines', 'core', 'render', 'actors', 'direction', 'compat', 'design']) {
  (function walk(dir) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) PROD.push(rel);
    }
  })(d);
}
PROD.push('index.js');

const pf = new Map();
WA.baseUrl = '';
for (const rel of PROD) { const t = read(rel); if (t && t.length >= 16) pf.set(rel, t); }
WA.__prefetch = pf;
WA.__loadOrder = PROD.slice();

console.log('\n=== A. 完整预取（真机主场景）===');
let v = WA.driverLedger.view();
console.log('total=' + v.total + ' 扫描面=' + v.scan.level + ' 文件=' + v.scan.files
  + ' canConclude=' + v.scan.canConclude + ' 预取=' + v.scan.prefetched + '/' + v.scan.declared);
console.log('分层=' + JSON.stringify(v.counts));
console.log('L1  = ' + (v.layerNames.L1 || []).join(' '));
console.log('L2r = ' + (v.layerNames.L2r || []).join(' '));
console.log('L2p = ' + (v.layerNames.L2p || []).join(' '));
console.log('L3a = ' + (v.layerNames.L3a || []).join(' '));
console.log('L3b = ' + (v.layerNames.L3b || []).join(' '));
// 合计必须平：每一行恰好落一档。少一行=引擎从台账里消失，多一行=被数两次。
const sum = Object.keys(v.counts).reduce(function (s, k) { return s + v.counts[k]; }, 0);
console.log('合计 = ' + sum + (sum === v.total ? '  ✓ 与 total 平' : '  ✗ 与 total ' + v.total + ' 差 ' + (v.total - sum)));
console.log('摘要：' + WA.driverLedger.summaryText());

// ── 与 p_selfevident 口径交叉核对 ────────────────────────────────────────
console.log('\n=== B. 与实证口径（p_selfevident 现场读数）对照 ===');
// 实证基线（p_reach2.js / p_core_v2.js 实测）：三条面 65 + 互调扩散 5 = 70 可达。
//   L3b 由 38 降到 33 的那 5 个不是「消失了」，是被引擎互调证明有人在喂 ——
//   基线必须跟着改，否则每次跑都报「差 -5」，久了就没人看这一栏了。
const EXP = { L1: 11, L2r: 12, L2p: 42, L2e: 5, L3a: 6, L3b: 33 };
const c = v.counts;
let diff = [];
for (const k of Object.keys(EXP)) {
  if (c[k] !== EXP[k]) diff.push(k + ' 实测' + c[k] + ' vs 立项' + EXP[k] + '（差 ' + (c[k] - EXP[k]) + '）');
}
if (diff.length) { console.log('有差异：'); diff.forEach(function (d) { console.log('  · ' + d); }); }
else console.log('五档全部吻合 ✓');

// ── why() 抽查：每档取一个，看能不能点出驱动者名字 ──────────────────────
console.log('\n=== C. why() 逐档抽查（必须点出名字）===');
[['L1', v.layerNames.L1[0]], ['L2r', v.layerNames.L2r[0]], ['L2p', v.layerNames.L2p[0]],
 ['L3a', v.layerNames.L3a[0]], ['L3b', v.layerNames.L3b[0]]].forEach(function (p) {
  if (!p[1]) { console.log(p[0] + '：空档'); return; }
  const w = WA.driverLedger.why(p[1]);
  console.log(p[0] + ' ' + p[1] + ' -> driver=' + w.driver + ' 名字数=' + w.driverCount
    + ' names=[' + w.driverNames.slice(0, 2).join(' ') + ']');
  console.log('    hint: ' + w.hint);
});

// ── 未判定面必须有话说 ──────────────────────────────────────────────────
console.log('\n=== D. 预取不完整时不得下 L3 结论 ===');
WA.__prefetch = new Map(Array.from(pf.entries()).slice(0, 40));
v = WA.driverLedger.view();
console.log('预取=' + v.scan.prefetched + '/' + v.scan.declared + ' canConclude=' + v.scan.canConclude);
console.log('分层=' + JSON.stringify(v.counts));
console.log('L3a+L3b 必须为 0 -> ' + (v.counts.L3a + v.counts.L3b));
console.log('摘要：' + WA.driverLedger.summaryText());

console.log('\n=== E. 无预取（无头 vm 裸态）===');
delete WA.__prefetch;
v = WA.driverLedger.view();
console.log('扫描面=' + v.scan.level + ' canConclude=' + v.scan.canConclude + ' 分层=' + JSON.stringify(v.counts));
console.log('摘要：' + WA.driverLedger.summaryText());