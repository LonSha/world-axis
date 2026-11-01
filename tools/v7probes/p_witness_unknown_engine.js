'use strict';
/**
 * tools/v7probes/p_witness_unknown_engine.js — 为 driverLedger 的 `unknown-engine` 建见证。
 *
 * ── 这一版治的是什么 ────────────────────────────────────────────────
 *   v2.275.0 新增 engines/driver-ledger.js，第 727 行写了一个**新拒收码**
 *   `unknown-engine`（why(ns) 查不到该引擎时的如实回答）。它进了拒收码扫描面，
 *   但不在见证表 / 死表 / 基线三集里 ⇒ 三集恒等式 1303 ≠ 705+50+547、leftover=1。
 *
 *   这件事本身说明了纪律 12 的必要性：那个 leftover 是**一条真缺口**，
 *   旧路径上只能靠 30 分钟全量回归的 52 条红里的一条去发现；
 *   而「跑一遍 reject-code-coverage」十几秒就能把它单独点出来。
 *
 * ── 本探针要回答的三个问题（先立据，再改见证表）────────────────────────
 *   ① 该码能被**产品真 API** 触发（不是只能靠读源码看到字符串）；
 *   ② 触发后返回形状稳定（ok:false / reason 精确为 'unknown-engine' / ns 回显）；
 *   ③ **反向**：合法引擎名必须 ok:true —— 否则「一律返回 unknown-engine」也能骗过见证。
 *      这一条是纪律 13（判据不许恒真）的直接落实：只验「坏输入给坏码」在
 *      「永远返回坏码」的实现上同样为真。
 *
 * ── 装载方式（与仓内探针同款，不另起一套）──────────────────────────────
 *   index.js 是浏览器壳（第 16 行读 window.__WORLD_AXIS_LOADED__），且它自身
 *   **不装载引擎**（`module.exports` 是空对象，实例挂在 `global.WorldAxis` 上）。
 *   故须：mock.js 造宿主面 → 从 tests/run.js 取 LOAD → vm.runInContext 逐文件装载。
 *
 * 用法：node tools/v7probes/p_witness_unknown_engine.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..', '..');
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

require(path.join(BASE, 'tests', 'mock.js'));
const g = global;
const LOAD = vm.runInNewContext('[' + (read('tests/run.js').match(/const LOAD = \[([\s\S]*?)\];/)[1]) + ']');
const ctx = vm.createContext(g);
const loadFail = [];
for (const rel of LOAD) {
  try { vm.runInContext(read(rel), ctx, { filename: rel }); }
  catch (e) { loadFail.push(rel + ': ' + e.message); }
}
const WA = g.WorldAxis;
try { WA.store.init(); } catch (e) {}

// ── 预取面（真机主场景）：driverLedger 的 view() 靠「能读到的产品源码」来判定驱动者。
//   Node 宿主没有网络、也没有 loadingManager，故必须像真机一样把产品源码塞进
//   `WA.__prefetch` + `WA.__loadOrder`；不塞则 rows=0、canConclude=false，
//   本探针的①②都会在空集上「看起来通过了」（这正是纪律 13 要防的恒真）。
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
['engines', 'core', 'render', 'actors', 'direction', 'compat', 'design'].forEach(function (d) {
  (function walk(dir) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) PROD.push(rel);
    }
  })(d);
});
PROD.push('index.js');
const pf = new Map();
WA.baseUrl = '';
PROD.forEach(function (rel) { const t = read(rel); if (t && t.length >= 16) pf.set(rel, t); });
WA.__prefetch = pf;
WA.__loadOrder = PROD.slice();
console.log('预取面 ' + pf.size + ' / ' + PROD.length);

console.log('装载 ' + LOAD.length + ' 个文件，失败 ' + loadFail.length
  + (loadFail.length ? '：' + loadFail.slice(0, 3).join(' | ') : ''));
if (!WA.driverLedger) {
  console.log('FATAL: WA.driverLedger 未装载，本探针无从取证');
  process.exit(1);
}
const DL = WA.driverLedger;

// ── ① 反证：不存在的引擎名必须给出 unknown-engine ────────────────────────
const NAMES = ['definitely-not-an-engine-275', '', null, undefined, 'engines/__no_such_file__.js'];
const got = NAMES.map(function (n) {
  try { return { input: String(n), r: DL.why(n) }; }
  catch (e) { return { input: String(n), r: { threw: String(e && e.message).slice(0, 140) } }; }
});

console.log('\n-- ① 非法名（应当全部 unknown-engine）--');
got.forEach(function (x) {
  console.log('  in=' + JSON.stringify(x.input) + ' => ' + JSON.stringify(x.r).slice(0, 180));
});
const allUnknown = got.every(function (x) { return x.r && x.r.ok === false && x.r.reason === 'unknown-engine'; });
console.log('  判据①：全部 ok:false 且 reason=unknown-engine => ' + allUnknown);

const echoOk = got[0].r.ns === 'definitely-not-an-engine-275';
console.log('  判据①b：ns 原样回显 => ' + echoOk + '（实 ' + JSON.stringify(got[0].r.ns) + '）');

// ── ② 反向：合法引擎必须 ok:true（否则①在「永远返回坏码」上也成立）──────
//   view() 的返回面没有 rows：分层名单在 `layerNames`，counts 是各档计数。
//   合法样本从「已判定有驱动者」的档里取（L1 工作流链最先），保证它确实是已知引擎。
const v = DL.view();
const LN = (v && v.layerNames) || {};
const pool = [].concat(LN.L1 || [], LN.L2r || [], LN.L2p || [], LN.L2e || [],
  LN.L3a || [], LN.L3b || []);
const sample = pool.length ? pool[0] : null;
let good = null;
if (sample) { try { good = DL.why(sample); } catch (e) { good = { threw: String(e && e.message).slice(0, 140) }; } }

console.log('\n-- ② 合法引擎（必须 ok:true）--');
console.log('  样本 ns=' + JSON.stringify(sample) + ' => ' + JSON.stringify(good).slice(0, 200));
const goodOk = !!(good && good.ok === true && good.ns === sample);
console.log('  判据②：合法名 ok:true 且 ns 回显 => ' + goodOk);

// ── ③ 扫描面活性：候选池必须非空，否则①②都在空集上恒真 ──────────────────
console.log('\n-- ③ 扫描面活性 --');
console.log('  total=' + (v && v.total) + ' · 候选池 ' + pool.length
  + ' · canConclude=' + (v && v.scan && v.scan.canConclude));
const alive = !!(v && v.total > 100 && pool.length > 50);
console.log('  判据③：扫描面活着（total>100 且候选池>50）=> ' + alive);

const verdict = allUnknown && echoOk && goodOk && alive;
console.log('');
console.log('CONCLUSION: ' + (verdict
  ? 'PASS —— unknown-engine 可被产品真 API 稳定产出（含反向），可入见证表'
  : 'FAIL —— 不具备建见证的条件，不得写进见证表'));
process.exit(verdict ? 0 : 1);