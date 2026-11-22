'use strict';
/* p_yield_attrib3.js —— OPV7-7 判据选型第三探针：在有数据的现场上验区分力
 *
 * 第二版的结论（必须记下来，否则下一个人会重走）：
 *   空世界条件下 88 个空产引擎的 wf/rec **全为零** ⇒ 两面对照算得出「全 no-data」，
 *   但这个「全」是假的：判据在空数据上没有区分力，等于恒真（纪律 13）。
 *   判据必须放到**有数据的现场**上验：
 *     · 播种后哪些引擎有 wf/rec 了、产出面变没变；
 *     · 人为把一个有数据的引擎关掉，看它是否落进 gated 而不是 no-data；
 *     · 人为破坏一个有数据引擎的 buildBlock（抛异常 / 返回空），看它是否落进 fault。
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

const WRITE_VERB = /(^|[a-z])(sets|adds|add|added|scheduled|claims|completed|cancels|opened|closed|started|ticked|ticks|saved|stored|granted|grants|moved|moves|posted|posts|registered|enacted|created|applied|advanced|settled|resolved|marks|marked|entered|left|joined|hosted|paid|bought|sold|crafted|delivered|seized|struck|wrote|written|recorded|records|encoded|decoded|anchors|pulses|relays|count|total|acts|events|places|roads|units|members|chains)$/i;
const CONFIG_KEY = /(format|manualFree|manualOver|manual|autoSlotsUsed|slots|staleMs|Ms|Size|Limit|Max|Min|Cap|Ratio|Depth|Budget|Sample|Window|threshold|enabled|available|capacity)$/i;
const TS_KEY = /^(lastAt|lastTurn|at|since|firstAt|lastSeenAt)$/i;
function writeFace(st) {
  let n = 0; const ks = [];
  Object.keys(st || {}).forEach(function (k) {
    const v = st[k];
    if (typeof v !== 'number' || !isFinite(v)) return;
    if (TS_KEY.test(k) || CONFIG_KEY.test(k)) return;
    if (!WRITE_VERB.test(k)) return;
    n += v; ks.push(k + '=' + v);
  });
  return { n: n, ks: ks };
}
function records(v, depth) {
  if (depth > 3) return 0;
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') { let n = 0; Object.keys(v).forEach(function (k) { n += records(v[k], depth + 1); }); return n; }
  return 0;
}
function probe(key) {
  const sh = WA.capabilityTier.shapeOf(key);
  const m = WA[key];
  let len = -1, threw = null;
  try { len = String(m.buildBlock() || '').length; } catch (e) { threw = String(e.message || e).slice(0, 60); }
  let stt = null; try { stt = m.stat ? m.stat() : null; } catch (e) {}
  const wf = writeFace(stt);
  const st = WA.store.get() || {};
  return { key: key, on: sh ? sh.on : null, len: len, threw: threw, wf: wf.n, wfKeys: wf.ks, rec: records(st[key], 0) };
}

console.log('=== 1) 装开局蓝图（真实开局，非伪造）===');
const PB = WA.playableBlueprint;
let seeded = null;
try {
  seeded = PB.installSample('town-workshop', { force: true });
  console.log('installSample =>', JSON.stringify(seeded).slice(0, 300));
} catch (e) { console.log('install ERR', e.message); }
const d = WA.store.get();
console.log('people=' + Object.keys(d.people || {}).length + ' places=' + Object.keys((d.world || {}).places || {}).length);

const KEYS = Object.keys(WA).filter(function (k) {
  const sh = WA.capabilityTier.shapeOf(k);
  return sh && sh.hasBuild;
});
console.log('\n=== 2) 播种后：产出 / wf / rec 三面 ===');
const rows = KEYS.map(probe);
const withData = rows.filter(function (r) { return r.wf > 0 || r.rec > 0; });
const nonEmpty = rows.filter(function (r) { return r.len > 0; });
console.log('引擎=' + rows.length + ' 非空产=' + nonEmpty.length + ' 有数据(wf或rec>0)=' + withData.length);
console.log('有数据的引擎：');
withData.forEach(function (r) {
  console.log('  ' + r.key.padEnd(20) + 'len=' + String(r.len).padEnd(6) + 'wf=' + String(r.wf).padEnd(5) + 'rec=' + String(r.rec).padEnd(5) + 'on=' + r.on);
});

console.log('\n=== 3) 三态判据在有数据现场上的区分力 ===');
function classify(r) {
  if (r.threw) return 'fault-threw';
  if (r.len > 0) return 'yield';
  const has = r.wf > 0 || r.rec > 0;
  if (!has) return 'no-data';
  if (r.on === false) return 'gated';
  return 'fault';
}
const tally = {};
rows.forEach(function (r) { const c = classify(r); tally[c] = (tally[c] || 0) + 1; });
console.log(JSON.stringify(tally));

console.log('\n=== 4) 反向：把有数据的引擎关掉 ⇒ 应落 gated 而不是 no-data ===');
const gateTest = withData.filter(function (r) { return r.on === true; }).slice(0, 4);
gateTest.forEach(function (r) {
  const m = WA[r.key];
  const orig = m.getSettings ? m.getSettings() : null;
  try {
    m.setSettings({ enabled: false });
    const after = probe(r.key);
    console.log('  ' + r.key.padEnd(18) + '关掉后 => ' + classify(after) + ' (len=' + after.len + ' wf=' + after.wf + ' rec=' + after.rec + ')');
  } catch (e) { console.log('  ' + r.key + ' setSettings ERR ' + e.message); }
  finally { try { if (orig) m.setSettings({ enabled: orig.enabled }); } catch (e) {} }
});

console.log('\n=== 5) 反向：有数据 + 开着 + buildBlock 抛异常/返回空 ⇒ 应落 fault ===');
const faultTest = withData.filter(function (r) { return r.on === true; }).slice(0, 4);
faultTest.forEach(function (r) {
  const m = WA[r.key];
  const realBuild = m.buildBlock;
  try {
    m.buildBlock = function () { throw new Error('injected-fault'); };
    const after = probe(r.key);
    console.log('  ' + r.key.padEnd(18) + '抛异常 => ' + classify(after) + ' (threw=' + after.threw + ')');
  } catch (e) { console.log('  ' + r.key + ' inject ERR ' + e.message); }
  finally { m.buildBlock = realBuild; }
});
faultTest.forEach(function (r) {
  const m = WA[r.key];
  const realBuild = m.buildBlock;
  try {
    m.buildBlock = function () { return ''; };
    const after = probe(r.key);
    console.log('  ' + r.key.padEnd(18) + '返回空 => ' + classify(after) + ' (len=' + after.len + ' wf=' + after.wf + ' rec=' + after.rec + ')');
  } catch (e) { console.log('  ' + r.key + ' inject ERR ' + e.message); }
  finally { m.buildBlock = realBuild; }
});