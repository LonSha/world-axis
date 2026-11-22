'use strict';
// 探针：diagnostics().driver 节是否真的接上了（真机口径 = 完整预取）
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

console.log('=== collect().driver ===');
// 真源是 collect()（诊断聚合入口），不是 diagnostics()——后者根本不存在；
//   写探针时按记忆里的名字调用，结果撞上 TypeError，白跑一轮。
const d = WA.toolDiag.collect();
const dr = d.driver;
if (!dr) { console.log('✗ driver 节缺席'); process.exit(1); }
if (dr.error) { console.log('✗ ' + dr.error); process.exit(1); }
console.log('total = ' + dr.total);
console.log('counts = ' + JSON.stringify(dr.counts));
console.log('orphanCount = ' + dr.orphanCount + '  diagOnlyCount=' + dr.diagOnlyOrphanCount + '  blindCount=' + dr.blindOrphanCount);
console.log('  清单已截断（分别 ' + dr.diagOnlyOrphans.length + '/' + dr.blindOrphans.length + ' 条）—— 计数读字段，不读 length');
console.log('undeterminedCount = ' + dr.undeterminedCount);
console.log('scan = ' + JSON.stringify(dr.scan));
console.log('summary = ' + dr.summary);
console.log('note = ' + dr.note);
console.log('reads = ' + dr.reads);
console.log('\nlayerNames 键 = ' + Object.keys(dr.layerNames).join(','));

// 与引擎直读交叉核对：诊断面不许二次归类
const v = WA.driverLedger.view();
let same = true;
['L1', 'L2r', 'L2p', 'L2e', 'L3a', 'L3b'].forEach(function (k) {
  if (dr.counts[k] !== v.counts[k]) { same = false; console.log('✗ ' + k + ' 诊断面 ' + dr.counts[k] + ' vs 引擎 ' + v.counts[k]); }
});
console.log('\n诊断面与引擎读数一致? ' + same);

// 关键：driver 节出现后，capability / health 两节必须仍在（不能顶掉别人）
console.log('\n相邻节仍在? capability=' + !!d.capability + ' health=' + !!d.health + ' worldDiary=' + !!d.worldDiary);