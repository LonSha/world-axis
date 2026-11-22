'use strict';
// V7 立项探针（决定性）：用各引擎自己的写口灌数据，看 buildBlock 是否真的长出内容
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

function blen(mod) {
  try {
    const b = mod.buildBlock();
    const s = typeof b === 'string' ? b : (b && typeof b === 'object' ? JSON.stringify(b) : String(b == null ? '' : b));
    return s.length;
  } catch (e) { return -1; }
}
function tryCall(label, fn) {
  try { const r = fn(); return { label: label, ok: true, r: r }; }
  catch (e) { return { label: label, ok: false, err: String(e && e.message || e).slice(0, 80) }; }
}

const before = {};
for (const ns of Object.keys(WA)) {
  const mod = WA[ns];
  if (mod && typeof mod === 'object' && typeof mod.buildBlock === 'function') before[ns] = blen(mod);
}
const baseNonEmpty = Object.keys(before).filter(function (k) { return before[k] > 0; });

console.log('=== 灌数据前：非空 ' + baseNonEmpty.length + ' ===');

// 只用各引擎自己导出的业务写口，按真实形态灌最小合法数据
const log = [];
const P = 'town-square';

function feed(ns, method, args, label) {
  const mod = WA[ns];
  if (!mod || typeof mod[method] !== 'function') { log.push('MISS ' + ns + '.' + method); return; }
  const r = tryCall(ns + '.' + method, function () { return mod[method].apply(mod, args || []); });
  log.push((r.ok ? 'OK   ' : 'FAIL ') + ns + '.' + method + ' ' + (r.ok ? JSON.stringify(r.r).slice(0, 90) : r.err));
}

// 世界结构
feed('world', 'addPlace', [{ id: P, name: '旧钟楼广场', region: 'oldtown', kind: 'square' }]);
feed('world', 'addPlace', [{ id: 'market', name: '东市', region: 'oldtown', kind: 'market' }]);
feed('world', 'addRoad', [{ from: P, to: 'market', days: 1 }]);
// 人物
feed('life', 'addGoal', [{ who: 'lin', text: '凑齐母亲的药钱', due: 8 }]);
feed('life', 'addCommitment', [{ who: 'lin', text: '替铁匠守三日炉', due: 3 }]);
feed('life', 'addSchedule', [{ who: 'lin', day: 1, at: 'morning', what: '去东市问价' }]);
// 事件
feed('events', 'schedule', [{ id: 'ev1', at: 3, text: '东市失火', place: P }]);
// 情报 / 线索 / 伏笔
feed('intel', 'addIntel', [{ id: 'i1', text: '有人在夜里搬箱子', place: P, confidence: 0.6 }]);
feed('threads', 'addLead', [{ id: 'l1', text: '箱子上的火漆印', place: P }]);
feed('foreshadow', 'resolve', [{ id: 'f1' }]);
// 势力 / 声望 / 关系
feed('org', 'grant', [{ org: 'guild', who: 'lin', what: '学徒' }]);
feed('bonds', 'setBond', [{ a: 'lin', b: 'tie', kind: 'trade', strength: 0.5 }]);
feed('masks', 'setMask', [{ who: 'lin', face: 'calm', real: 'uneasy' }]);
feed('temperament', 'setTemperament', [{ who: 'lin', tone: 'stoic' }]);
// 场景 / 节奏 / 难度
feed('sceneSlice', 'resolveSegment', [{ id: 's1' }]);
feed('tempo', 'setGear', [{ gear: 'slow' }]);
feed('difficulty', 'setProfile', [{ profile: 'standard' }]);
feed('gauge', 'create', [{ id: 'g1', label: '紧张度' }]);
feed('rivalry', 'declare', [{ a: 'lin', b: 'tie', cause: '争铺位' }]);
feed('karma', 'record', [{ who: 'lin', delta: 1, why: '还了钱' }]);
feed('chrono', 'record', [{ at: 1, text: '开局' }]);
feed('economy', 'setSettings', [{ enabled: true }]);
feed('plan', 'advance', [{ who: 'lin' }]);
feed('probe', 'addEvidence', [{ id: 'e1', text: '半张账页', place: P }]);
feed('diplomacy', 'propose', [{ from: 'guild', to: 'watch', terms: ['停火'] }]);
feed('aftermath', 'register', [{ id: 'a1', place: P, kind: 'fire', text: '东市失火' }]);
feed('sediment', 'settle', [{ place: P, kind: 'fire', text: '东市失火' }]);
feed('agency', 'schedule', [{ who: 'lin', act: 'buy' }]);
feed('spotlight', 'seal', [{ who: 'lin', why: '被点了名' }]);
feed('fondness', 'propose', [{ a: 'lin', b: 'tie', delta: 1 }]);
feed('inst', 'propose', [{ id: 'r1', text: '宵禁' }]);
feed('contest', 'advanceRound', [{ id: 'c1' }]);
feed('survey', 'declareSpot', [{ id: 'sp1', place: P }]);
feed('floorSnapshot', 'bind', [{ id: 'sn1' }]);
feed('shadow', 'addShadow', [{ who: 'lin', text: '夜里的脚步声' }]);
feed('geoTracker', 'registerPlace', [{ id: P }]);
feed('moodGlide', 'setBaseline', [{ who: 'lin', v: 0.5 }]);
feed('oneShotMod', 'advance', [{ id: 'o1' }]);
feed('parallelEvents', 'resolve', [{ id: 'p1' }]);
feed('beastBond', 'register', [{ who: 'lin', beast: 'dog' }]);
feed('appearance', 'register', [{ who: 'lin', look: '灰袍' }]);
feed('canon', 'signal', [{ id: 'c1' }]);
feed('stall', 'sign', [{ id: 'st1' }]);
feed('quota', 'resolve', [{ id: 'q1' }]);
feed('beatMask', 'advance', [{ id: 'b1' }]);
feed('genGate', 'record', [{ id: 'gg1' }]);
feed('lingqi', 'register', [{ who: 'lin', v: 1 }]);
feed('ladder', 'setSettings', [{ enabled: true }]);
feed('enigma', 'setSettings', [{ enabled: true }]);
feed('warrant', 'setSettings', [{ enabled: true }]);
feed('temporalLock', 'setSettings', [{ enabled: true }]);

console.log('\n=== 写口调用明细（' + log.length + ' 次） ===');
for (const l of log) console.log(' ' + l);

const after = {};
for (const ns of Object.keys(WA)) {
  const mod = WA[ns];
  if (mod && typeof mod === 'object' && typeof mod.buildBlock === 'function') after[ns] = blen(mod);
}
const nowNonEmpty = Object.keys(after).filter(function (k) { return after[k] > 0; });
const grew = nowNonEmpty.filter(function (k) { return !before[k] || before[k] <= 0; });

console.log('\n=== 灌数据后：非空 ' + nowNonEmpty.length + '（此前 ' + baseNonEmpty.length + '） ===');
console.log('=== 新长出内容（' + grew.length + '）：' + grew.join(' ') + ' ===');
console.log('\n--- 逐项字符数（>0 者） ---');
for (const k of nowNonEmpty.sort(function (a, b) { return after[b] - after[a]; })) {
  console.log(' ' + k + ' : ' + (before[k] || 0) + ' -> ' + after[k]);
}

// 注入面复测
try {
  const WA2 = WA;
  let total = 0, nonEmptySrc = 0, srcs = 0;
  if (WA2.inject && typeof WA2.inject.build === 'function') {
    const built = WA2.inject.build();
    const s = typeof built === 'string' ? built : JSON.stringify(built);
    total = s.length;
  }
  console.log('\n=== inject.build 总字符 = ' + total + ' ===');
} catch (e) { console.log('\ninject.build threw: ' + e.message); }