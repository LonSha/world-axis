'use strict';
/* p_yield_attrib4.js —— OPV7-7 判据第四探针：喂真数据后，三面各自动不动
 *
 * 第三版暴露的两个必须解决的点：
 *   ① `world` 播种后有 6 条记录（store 面 rec=6），但 stat() 全零 —— 说明
 *      **「计数全零 ⇒ no-data」这条计划里的判据不可靠**：装着数据的引擎会被判 no-data。
 *   ② `region` 有数据（rec=4）却产出空 ⇒ 判据报 fault。这可能真是缺陷，
 *      也可能它的 buildBlock 依赖别处的前置（那就该是 no-data，或另一态）。
 *
 * 本探针要给每个引擎定位「它的数据到底存在哪」：分别喂真数据，看
 *   面 A（stat 写入计数）/ 面 B（store 同名容器记录）/ 面 C（store 里**其它**容器记录）哪一面动了。
 * 面 C 是判断「同名容器判据会不会误报 no-data」的关键。
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
try { WA.playableBlueprint.installSample('town-workshop', { force: true }); } catch (e) {}

const WRITE_VERB = /(^|[a-z])(sets|adds|add|added|scheduled|claims|completed|cancels|opened|closed|started|ticked|ticks|saved|stored|granted|grants|moved|moves|posted|posts|registered|enacted|created|applied|advanced|settled|resolved|marks|marked|entered|left|joined|hosted|paid|bought|sold|crafted|delivered|seized|struck|wrote|written|recorded|records|encoded|decoded|anchors|pulses|relays|count|total|acts|events|places|roads|units|members|chains)$/i;
const CONFIG_KEY = /(format|manualFree|manualOver|manual|autoSlotsUsed|slots|staleMs|Ms|Size|Limit|Max|Min|Cap|Ratio|Depth|Budget|Sample|Window|threshold|enabled|available|capacity)$/i;
const TS_KEY = /^(lastAt|lastTurn|at|since|firstAt|lastSeenAt)$/i;
function writeFace(st) {
  let n = 0;
  Object.keys(st || {}).forEach(function (k) {
    const v = st[k];
    if (typeof v !== 'number' || !isFinite(v)) return;
    if (TS_KEY.test(k) || CONFIG_KEY.test(k)) return;
    if (!WRITE_VERB.test(k)) return;
    n += v;
  });
  return n;
}
function records(v, depth) {
  if (depth > 3) return 0;
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') { let n = 0; Object.keys(v).forEach(function (k) { n += records(v[k], depth + 1); }); return n; }
  return 0;
}
function snap(key) {
  const st = WA.store.get() || {};
  const m = WA[key];
  let stt = null; try { stt = m.stat ? m.stat() : null; } catch (e) {}
  return { wf: writeFace(stt), same: records(st[key], 0), all: records(st, 0) };
}

const people = Object.keys((WA.store.get() || {}).people || {});
const pid = people[0];
console.log('people =', JSON.stringify(people));
console.log('\n=== 喂数据前基线 ===');
const KEYS = ['life', 'intel', 'org', 'longline', 'act', 'plan', 'events', 'bonds', 'affect', 'rumor', 'threads', 'causal', 'region', 'world', 'weather', 'stage', 'session', 'economy', 'foreshadow'];
const base = {};
KEYS.forEach(function (k) { base[k] = snap(k); });

console.log('\n=== 逐个喂真写口 ===');
const feed = [
  ['life', function () { return WA.life.addGoal(pid, { text: '修好水车', why: '镇上的灌溉停了' }); }],
  ['intel', function () { return WA.intel.addIntel(pid, { text: '磨坊主在夜里见过陌生人', source: '目击' }); }],
  ['org', function () { return WA.org.grant(pid, { res: 'grain', qty: 3 }); }],
  ['longline', function () { return WA.longline.addPromise ? WA.longline.addPromise(pid, { text: '答应过修桥' }) : 'no addPromise'; }],
  ['act', function () { return WA.act.add ? WA.act.add(pid, { text: '去磨坊' }) : 'no add'; }],
  ['plan', function () { return WA.plan.expand ? WA.plan.expand(pid, 'goal-x', ['q1', 'q2']) : 'no expand'; }],
  ['events', function () { return WA.events.schedule ? WA.events.schedule({ kind: 'once', text: '集市', atRound: 3 }) : 'no schedule'; }],
  ['bonds', function () { return WA.bonds.setBond ? WA.bonds.setBond(pid, people[1] || 'x', { type: '利益同盟', strength: 3 }) : 'no setBond'; }],
  ['affect', function () { return WA.affect.set ? WA.affect.set(pid, { mood: 'wary', intensity: 2 }) : 'no set'; }],
  ['rumor', function () { return WA.rumor.start ? WA.rumor.start({ text: '井里出了怪声', from: pid }) : 'no start'; }],
  ['threads', function () { return WA.threads.open ? WA.threads.open({ text: '谁动了界碑' }) : 'no open'; }],
  ['causal', function () { return WA.causal.addChain ? WA.causal.addChain({ text: '断桥' }) : 'no addChain'; }],
  ['weather', function () { return WA.weather.set ? WA.weather.set({ sky: 'rain', temp: 12 }) : 'no set'; }],
  ['stage', function () { return WA.stage.adopt ? WA.stage.adopt(pid, 'stage-1') : 'no adopt'; }],
  ['session', function () { return WA.session.host ? WA.session.host(pid, { topic: '夜谈' }) : 'no host'; }],
  ['economy', function () { return WA.economy.stock ? WA.economy.stock('grain', 10, 2) : 'no stock'; }],
  ['foreshadow', function () { return WA.foreshadow.add ? WA.foreshadow.add({ text: '旧钟' }) : 'no add'; }]
];
feed.forEach(function (pair) {
  const k = pair[0];
  let r = null, err = null;
  try { r = pair[1](); } catch (e) { err = String(e.message || e).slice(0, 70); }
  const after = snap(k);
  const b = base[k];
  const dA = after.wf - b.wf, dB = after.same - b.same, dC = after.all - b.all;
  console.log(k.padEnd(11) + ' ret=' + JSON.stringify(r).slice(0, 46).padEnd(48) +
    ' Δstat=' + String(dA).padEnd(4) + ' Δsame=' + String(dB).padEnd(4) + ' Δall=' + String(dC).padEnd(4) +
    (err ? ' ERR ' + err : ''));
});

console.log('\n=== 喂完后：谁能出块 ===');
KEYS.forEach(function (k) {
  const m = WA[k];
  let len = -1; try { len = String(m.buildBlock() || '').length; } catch (e) { len = 'THREW'; }
  const s = snap(k);
  console.log(k.padEnd(11) + 'len=' + String(len).padEnd(6) + 'wf=' + String(s.wf).padEnd(5) + 'same=' + String(s.same).padEnd(5) + 'all=' + s.all);
});