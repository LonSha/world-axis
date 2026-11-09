'use strict';
// 探针：为什么合计 ≠ total？缺的行去哪了
//   分层函数必须满足「每行恰好落一档」—— 少了的行等于从台账里凭空消失，
//   多出来的行等于一个引擎被数了两次。两种都是假读数。
//
// v2.381.0：**修掉本探针自己的幽灵引用**。
//   原第 41 行是裸调用 `const b = WA.driverLedger.build();`，而 driverLedger 的导出面
//   （真源 engines/driver-ledger.js:894）只有 getSettings / setSettings / view / why /
//   summaryText / stat —— 没有 build（build 是模块内私有函数，从未挂到命名空间上）。
//   后果不是"读数不准"，是**整个探针从第 41 行起一行都跑不到**：直接抛 TypeError。
//   也就是说这份探针此前的"分层核对结论"没有任何一次是真的算出来的。
//   改用真成员 view()。
//   ⚠ view() 的名单按 settings().maxList（默认 200）截断，而 counts 是全量计数：
//   名单核对只在**未截断**时有判别力，故下面显式打印是否发生截断，
//   绝不把"名单被截断"误读成"归属不符"（这正是本探针要防的那类假读数）。
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
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;
// 注：driverLedger 的扫描缓存自带签名（命名空间数/预取条数/装载条数），
//   扫描面一变下次 view() 自己重扫 —— 不需要（也已不再提供）invalidate()。
try { WA.store.init(); } catch (e) {}
const PROD = [];
for (const d of ['ui', 'engines', 'core', 'render', 'actors', 'direction', 'compat', 'design']) {
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

// v2.381.0：build() → view()（真成员）。
const b = WA.driverLedger.view();
if (!b || b.ok !== true) {
  console.error('driverLedger.view() 未返回 ok:true —— 探针前提不成立，拒绝给出任何分层结论。');
  process.exit(1);
}
console.log('total = ' + b.total);
console.log('counts = ' + JSON.stringify(b.counts));
const sum = Object.keys(b.counts).reduce(function (s, k) { return s + b.counts[k]; }, 0);
console.log('counts 合计 = ' + sum + (sum === b.total ? '  ✓ 平' : '  ✗ 差 ' + (b.total - sum)));

// 扫描面自述：读不全时的分层结论没有意义，先把它打在结论前面。
const sc = b.scan || {};
console.log('\n扫描面：level=' + sc.level + ' files=' + sc.files + ' fns=' + sc.fns
  + ' canConclude=' + sc.canConclude + ' complete=' + sc.complete
  + ' 预取=' + sc.prefetched + '/' + sc.declared);
if (sc.canConclude === false) console.log('  ⚠ 扫描面不完整：未判定档（L?）里的引擎不得读成「没有驱动者」。');

// 每档名单与计数核对。名单可能被 maxList 截断 —— 截断时只验「不超过计数」。
const maxList = Number((WA.driverLedger.getSettings() || {}).maxList) || 200;
const layerNames = b.layerNames || {};
let truncated = 0;
Object.keys(b.counts).forEach(function (k) {
  const named = layerNames[k] || [];
  const n = named.length;
  if (n > b.counts[k]) console.log('  ✗ ' + k + '：名单条数 ' + n + ' > 计数 ' + b.counts[k] + '（重复收录）');
  else if (n < b.counts[k]) {
    if (b.counts[k] >= maxList) { truncated++; console.log('  · ' + k + '：名单 ' + n + '/' + b.counts[k] + '（按 maxList=' + maxList + ' 截断，不判）'); }
    else console.log('  ✗ ' + k + '：名单缺 ' + (b.counts[k] - n) + ' 条（counts 说 ' + b.counts[k] + '，名单只给 ' + n + '）');
  }
});
if (truncated) console.log('  （' + truncated + ' 档被截断：核对降级为「名单不超计数」，已如实标注）');

console.log('\n各档 counts 实数：');
Object.keys(b.counts).forEach(function (k) { console.log('  ' + k + ' = ' + b.counts[k]); });

// 名单总数 vs total：只在全档未截断时可比。
let ln = 0;
Object.keys(layerNames).forEach(function (k) { ln += layerNames[k].length; });
if (truncated) console.log('\n名单合计 = ' + ln + '（存在截断，与 total 不可比，不计结论）');
else console.log('\n名单合计 = ' + ln + (ln === b.total ? '  ✓' : '  ✗ 差 ' + (b.total - ln)));
