#!/usr/bin/env node
// WorldAxis tests/settle-v2670.js -- narrative-discipline lock (v2.67.0)
//
// What it pins (all negative):
//   temporalLock: disabled check is distinguishable; locked spans must be present,
//                 within maxMinutes, never negative; unlock is explicit.
//   temperament:  base and habit must both be present AND differ; trigger firing is
//                 required for the base layer to lead; default is habit.
//   fondness:     deltas outside the step whitelist refuse; non-positive delta refused
//                 (fondness never drops; conflicts hedge via trust); trust 0..100 int;
//                 cap 100 refuses instead of clamping.
//   parallelEvents: three fields required; future events refuse (main-clock sync);
//                 active capacity 3; crowd cap 4.
// Anchors each occur exactly once in real source. Negative control mutates a memory copy only.
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2670_';
const A_TLOCK_GATE = "if (!settings().enabled) return { ok: true, reason: 'disabled' };";
const A_TMISS = "if (spanMinutes == null) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }";
const A_TLONG = "if (spanMinutes > settings().maxMinutes) { noteFault('too-long'); return { ok: false, reason: 'too-long', limit: settings().maxMinutes, got: spanMinutes }; }";
const A_TNEG = "if (spanMinutes < 0) { noteFault('negative-span'); return { ok: false, reason: 'negative-span' }; }";
const A_TEMP_GATE = "if (!settings().enabled) return { ok: true, person: who, dominant: '', layer: '', reason: 'disabled' };";
const A_TSAME = "if (b === h) { noteFault('same-layer'); return { ok: false, reason: 'same-layer', person: who }; }";
const A_TFIELD = "if (!who || !b || !h) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }";
const A_FOND_GATE = "if (!settings().enabled) return { ok: true, reason: 'disabled' };";
const A_FSTEP = "if (STEPS.indexOf(delta) < 0) { noteFault('off-step'); return { ok: false, reason: 'off-step', allowed: STEPS.slice() }; }";
const A_FTRUST = "if (trust != null && (typeof trust !== 'number' || !isFinite(trust) || trust < 0 || trust > 100 || (trust | 0) !== trust)) {";
const A_FNEG = "if (delta <= 0) {";
const A_PE_GATE = "if (!settings().enabled) return { ok: true, reason: 'disabled' };";
const A_PFUTURE = "if (typeof p.startedAt === 'number' && isFinite(p.startedAt) && p.startedAt > now) {";
const A_PCAP = "if (active.length >= Math.max(1, settings().maxActive)) { out = { ok: false, reason: 'capacity', active: active.length }; return false; }";
const A_PCROWD = "if (cast.length > MAX_PERSONS) { noteFault('crowd'); return { ok: false, reason: 'crowd', max: MAX_PERSONS }; }";
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function st(WA) { return WA.store.get() || {}; }
function resetWorld(WA) {
  WA.store.transact(function (d) {
    d.temporal = { lock: {} };
    d.temperament = { rows: [] };
    d.fondness = { rows: [] };
    d.parallelEvents = { rows: [] };
    d.people = {};
    d.clock = { dayIndex: 10 };
  }, TAG + 'reset');
}
function snapshotLS() {
  const out = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) out[k] = LS.getItem(k); }
  return out;
}
function restoreLS(snap) {
  const drop = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
}
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i); if (k === null) continue;
    let v = ''; try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}
function judge(a) {
  const WA = fresh();
  a(!!WA.temporalLock && typeof WA.temporalLock.check === 'function', 'v2670/narr: temporalLock loaded');
  a(!!WA.temperament && typeof WA.temperament.setTemperament === 'function', 'v2670/narr: temperament loaded');
  a(!!WA.fondness && typeof WA.fondness.apply === 'function', 'v2670/narr: fondness loaded');
  a(!!WA.parallelEvents && typeof WA.parallelEvents.add === 'function', 'v2670/narr: parallelEvents loaded');
  resetWorld(WA);
  // 1 temporalLock: disabled is distinguishable
  const tOff = WA.temporalLock.check(5);
  a(tOff.ok === true && tOff.reason === 'disabled', 'v2670/narr: [1] disabled lock says so (got ' + JSON.stringify(tOff) + ')');
  a(WA.temporalLock.buildBlock() === '', 'v2670/narr: [1] disabled lock injects nothing');
  WA.temporalLock.setSettings({ enabled: true });
  a(WA.temporalLock.check(999).reason === 'unlocked', 'v2670/narr: [1] unlocked span is not limited');
  // 2 locked: missing / within / frozen / too-long / negative
  WA.temporalLock.lock('对峙第三分钟');
  a(WA.temporalLock.check().ok === false && WA.temporalLock.check().reason === 'missing-fields', 'v2670/narr: [2] locked span must be stated');
  a(WA.temporalLock.check(5).ok === true && WA.temporalLock.check(5).reason === 'within-lock', 'v2670/narr: [2] within-lock passes');
  a(WA.temporalLock.check(0).reason === 'frozen', 'v2670/narr: [2] zero span is frozen, not an error');
  a(WA.temporalLock.check(30).ok === false && WA.temporalLock.check(30).reason === 'too-long', 'v2670/narr: [2] over-limit refuses');
  a(WA.temporalLock.check(-1).reason === 'negative-span', 'v2670/narr: [2] backwards span refused');
  a(WA.temporalLock.buildBlock().indexOf('[时间锁]') === 0, 'v2670/narr: [2] inject names the lock');
  a(WA.temporalLock.unlock().ok === true, 'v2670/narr: [2] unlock is explicit');
  a(WA.temporalLock.unlock().ok === false && WA.temporalLock.unlock().reason === 'missing', 'v2670/narr: [2] double unlock says missing');
  a(WA.temporalLock.check(999).reason === 'unlocked', 'v2670/narr: [2] after unlock spans are free again');
  a(WA.temporalLock.lock('').ok === false && WA.temporalLock.lock('').reason === 'missing-fields', 'v2670/narr: [2] lock needs a label');
  // 3 temperament: two layers, differ, trigger firing
  const pOff = WA.temperament.read('Aning');
  a(pOff.ok === true && pOff.reason === 'disabled', 'v2670/narr: [3] disabled read says so');
  WA.temperament.setSettings({ enabled: true });
  a(WA.temperament.read('Aning').reason === 'missing', 'v2670/narr: [3] unregistered read says so');
  a(WA.temperament.setTemperament('Aning', '倔', '倔').reason === 'same-layer', 'v2670/narr: [3] identical layers refused');
  a(WA.temperament.setTemperament('Aning', '', '客气').reason === 'missing-fields', 'v2670/narr: [3] half a temperament refused');
  const tOk = WA.temperament.setTemperament('Aning', '吃软不吃硬', '客气体面', ['被戳穿', '喝醉']);
  a(tOk.ok === true, 'v2670/narr: [3] valid two-layer lands');
  a(WA.temperament.read('Aning').layer === 'habit' && WA.temperament.read('Aning').dominant === '客气体面', 'v2670/narr: [3] default is habit');
  a(WA.temperament.read('Aning', '被戳穿的那一刻').layer === 'base', 'v2670/narr: [3] fired trigger hands over to base');
  a(WA.temperament.read('Aning', '平常的一天').layer === 'habit', 'v2670/narr: [3] no trigger keeps habit');
  a(WA.temperament.buildBlock().indexOf('[双层性格]') === 0, 'v2670/narr: [3] inject names the layers');
  // 4 fondness: whitelist / never-drops / cap / trust
  const fOff = WA.fondness.apply('Aning', { delta: 0.3 });
  a(fOff.ok === true && fOff.reason === 'disabled', 'v2670/narr: [4] disabled apply says so');
  WA.fondness.setSettings({ enabled: true });
  a(WA.fondness.apply('Aning', { delta: -0.3 }).reason === 'non-positive-delta', 'v2670/narr: [4] negative delta refused (never drops)');
  a(WA.fondness.apply('Aning', { delta: 0 }).reason === 'non-positive-delta', 'v2670/narr: [4] zero delta refused');
  a(WA.fondness.apply('Aning', { delta: 0.2 }).reason === 'off-step', 'v2670/narr: [4] off-whitelist step refused');
  a(WA.fondness.apply('Aning', { delta: 0.3 }).ok === true, 'v2670/narr: [4] whitelisted step lands');
  a(WA.fondness.apply('Aning', { delta: 0.8, trust: 55.5 }).reason === 'bad-trust', 'v2670/narr: [4] non-integer trust refused');
  a(WA.fondness.apply('Aning', { delta: 0.8, trust: 101 }).reason === 'bad-trust', 'v2670/narr: [4] out-of-range trust refused');
  const f1 = WA.fondness.apply('Aning', { delta: 0.8, trust: 40 });
  a(f1.ok === true && f1.value === 1.1, 'v2670/narr: [4] accumulation is exact (got ' + JSON.stringify(f1) + ')');
  a(WA.fondness.read('Aning').band === '无感', 'v2670/narr: [4] band naming works at low values');
  const blkF = WA.fondness.buildBlock();
  a(blkF.indexOf('[好感审计]') === 0 && blkF.indexOf('不降') >= 0, 'v2670/narr: [4] inject states the never-drop rule');
  // 5 parallelEvents: three fields / clock sync / capacity / crowd
  const pGate = WA.parallelEvents.add('远处的事', '北街', ['老周']);
  a(pGate.ok === true && pGate.reason === 'disabled', 'v2670/narr: [5] disabled add says so');
  WA.parallelEvents.setSettings({ enabled: true });
  a(WA.parallelEvents.add('', '北街', ['老周']).reason === 'missing-fields', 'v2670/narr: [5] missing title refused');
  a(WA.parallelEvents.add('远处的事', '', ['老周']).reason === 'missing-fields', 'v2670/narr: [5] missing location refused');
  a(WA.parallelEvents.add('远处的事', '北街', []).reason === 'missing-fields', 'v2670/narr: [5] empty cast refused');
  a(WA.parallelEvents.add('远处的事', '北街', ['一', '二', '三', '四', '五']).reason === 'crowd', 'v2670/narr: [5] crowd refused');
  const futureAt = WA.clock.now('probe') + 1000000;
  const futAdd = function () { return WA.parallelEvents.add('没发生的事', '北街', ['老周'], { startedAt: futureAt }); };
  a(futAdd().ok === false && futAdd().reason === 'future-event', 'v2670/narr: [5] future event refused (clock sync)');
  const p1 = WA.parallelEvents.add('钟楼塌了', '北镇钟楼', ['老周']);
  a(p1.ok === true, 'v2670/narr: [5] valid event lands (got ' + JSON.stringify(p1) + ')');
  WA.parallelEvents.add('南集起了争执', '南集市', ['王婶', '李屠']);
  WA.parallelEvents.add('渡口翻船', '渡口', ['艄公']);
  a(WA.parallelEvents.add('第四件', '巷口', ['乞儿']).ok === false && WA.parallelEvents.add('第四件', '巷口', ['乞儿']).reason === 'capacity', 'v2670/narr: [5] fourth active event refused');
  a(WA.parallelEvents.active().length === 3, 'v2670/narr: [5] active count is exactly 3');
  const resolved = st(WA).parallelEvents.rows[0].id;
  a(WA.parallelEvents.resolve(resolved).ok === true, 'v2670/narr: [5] resolve is explicit');
  a(WA.parallelEvents.add('第四件', '巷口', ['乞儿']).ok === true, 'v2670/narr: [5] resolved slot frees capacity');
  a(WA.parallelEvents.buildBlock().indexOf('[场外事件]') === 0 && WA.parallelEvents.buildBlock().indexOf('不能全知') >= 0, 'v2670/narr: [5] inject states the anti-omniscience rule');
  console.log('  ok v2670/narr: temporalLock / temperament / fondness / parallelEvents');
}
function probeTlockGate(WA) { resetWorld(WA); return WA.temporalLock.check(5).reason; }
function probeTmiss(WA) { resetWorld(WA); WA.temporalLock.setSettings({ enabled: true }); WA.temporalLock.lock('x'); return WA.temporalLock.check().reason; }
function probeTlong(WA) { resetWorld(WA); WA.temporalLock.setSettings({ enabled: true }); WA.temporalLock.lock('x'); return WA.temporalLock.check(999).reason; }
function probeTneg(WA) { resetWorld(WA); WA.temporalLock.setSettings({ enabled: true }); WA.temporalLock.lock('x'); return WA.temporalLock.check(-1).reason; }
function probeTgate(WA) { resetWorld(WA); return WA.temperament.read('Aning').reason; }
function probeTsame(WA) { resetWorld(WA); WA.temperament.setSettings({ enabled: true }); return WA.temperament.setTemperament('Aning', '倔', '倔').ok; }
function probeTfield(WA) { resetWorld(WA); WA.temperament.setSettings({ enabled: true }); return WA.temperament.setTemperament('Aning', '', '客气').reason; }
function probeFgate(WA) { resetWorld(WA); return WA.fondness.apply('Aning', { delta: 0.3 }).reason; }
function probeFstep(WA) { resetWorld(WA); WA.fondness.setSettings({ enabled: true }); return WA.fondness.apply('Aning', { delta: 0.2 }).ok; }
function probeFtrust(WA) { resetWorld(WA); WA.fondness.setSettings({ enabled: true }); return WA.fondness.apply('Aning', { delta: 0.3, trust: 55.5 }).reason; }
function probeFneg(WA) { resetWorld(WA); WA.fondness.setSettings({ enabled: true }); return WA.fondness.apply('Aning', { delta: -0.3 }).reason; }
function probePgate(WA) { resetWorld(WA); return WA.parallelEvents.add('远处的事', '北街', ['老周']).reason; }
function probePfuture(WA) { resetWorld(WA); WA.parallelEvents.setSettings({ enabled: true }); return WA.parallelEvents.add('没发生的事', '北街', ['老周'], { startedAt: WA.clock.now('probe') + 1000000 }).ok; }
function probePcap(WA) { resetWorld(WA); WA.parallelEvents.setSettings({ enabled: true }); WA.parallelEvents.add('一', '北街', ['老周']); WA.parallelEvents.add('二', '南街', ['王婶']); WA.parallelEvents.add('三', '渡口', ['艄公']); return WA.parallelEvents.add('四', '巷口', ['乞儿']).ok; }
function probePcrowd(WA) { resetWorld(WA); WA.parallelEvents.setSettings({ enabled: true }); return WA.parallelEvents.add('人多', '戏台', ['一', '二', '三', '四', '五']).ok; }
function kill(src) {
  if (src.indexOf('if (') !== 0) throw new Error('kill shape ' + src.slice(0, 24));
  var ret = src.indexOf('return');
  var open = src.indexOf('{');
  if (ret >= 0 && (open < 0 || ret < open)) {
    return 'if (false) return' + src.slice(ret + 6);
  }
  return 'if (false) { /* ' + src.slice(0, open) + ' */ ' + src.slice(open + 1);
}
const BROKEN = [
  { key: 'tlock-gate', rel: 'engines/temporal-lock.js', from: A_TLOCK_GATE, to: kill(A_TLOCK_GATE) },
  { key: 'tmiss', rel: 'engines/temporal-lock.js', from: A_TMISS, to: kill(A_TMISS) },
  { key: 'tlong', rel: 'engines/temporal-lock.js', from: A_TLONG, to: kill(A_TLONG) },
  { key: 'tneg', rel: 'engines/temporal-lock.js', from: A_TNEG, to: kill(A_TNEG) },
  { key: 'temp-gate', rel: 'engines/temperament.js', from: A_TEMP_GATE, to: kill(A_TEMP_GATE) },
  { key: 'tsame', rel: 'engines/temperament.js', from: A_TSAME, to: kill(A_TSAME) },
  { key: 'tfield', rel: 'engines/temperament.js', from: A_TFIELD, to: kill(A_TFIELD) },
  { key: 'fond-gate', rel: 'engines/fondness.js', from: A_FOND_GATE, to: kill(A_FOND_GATE) },
  { key: 'fstep', rel: 'engines/fondness.js', from: A_FSTEP, to: kill(A_FSTEP) },
  { key: 'ftrust', rel: 'engines/fondness.js', from: A_FTRUST, to: kill(A_FTRUST) },
  { key: 'fneg', rel: 'engines/fondness.js', from: A_FNEG, to: kill(A_FNEG) },
  { key: 'pe-gate', rel: 'engines/parallel-events.js', from: A_PE_GATE, to: kill(A_PE_GATE) },
  { key: 'pfuture', rel: 'engines/parallel-events.js', from: A_PFUTURE, to: kill(A_PFUTURE) },
  { key: 'pcap', rel: 'engines/parallel-events.js', from: A_PCAP, to: kill(A_PCAP) },
  { key: 'pcrowd', rel: 'engines/parallel-events.js', from: A_PCROWD, to: kill(A_PCROWD) }
];
// A_TLOCK_GATE 与 A_FOND_GATE / A_PE_GATE 三处字面相同但各在自己文件内恰中 1 次：
//   锚点唯一性按文件判定（本仓库判据纯度 H5 的口径），不做全库唯一。
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function probeWith(spec, fn) {
  return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); });
}
function probeClean(fn) {
  return isolated(function () { return fn(fresh()); });
}
function anchorHits(spec) {
  return fs.readFileSync(path.join(BASE, spec.rel), 'utf8').split(spec.from).length - 1;
}
function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2670/narr: [N0] anchor hits exactly once :: ' + s.key); });
  a(probeWith(BROKEN[0], probeTlockGate) !== 'disabled', 'v2670/narr: [N1] tlock gate removed');
  a(probeWith(BROKEN[1], probeTmiss) !== 'missing-fields', 'v2670/narr: [N1] missing span accepted when guard removed');
  a(probeWith(BROKEN[2], probeTlong) !== 'too-long', 'v2670/narr: [N1] over-limit accepted when guard removed');
  a(probeWith(BROKEN[3], probeTneg) !== 'negative-span', 'v2670/narr: [N1] backwards span accepted when guard removed');
  a(probeWith(BROKEN[4], probeTgate) !== 'disabled', 'v2670/narr: [N1] temperament gate removed');
  a(probeWith(BROKEN[5], probeTsame) === true, 'v2670/narr: [N1] identical layers accepted when guard removed');
  a(probeWith(BROKEN[6], probeTfield) !== 'missing-fields', 'v2670/narr: [N1] half temperament accepted when guard removed');
  a(probeWith(BROKEN[7], probeFgate) !== 'disabled', 'v2670/narr: [N1] fondness gate removed');
  a(probeWith(BROKEN[8], probeFstep) === true, 'v2670/narr: [N1] off-step accepted when guard removed');
  a(probeWith(BROKEN[9], probeFtrust) !== 'bad-trust', 'v2670/narr: [N1] bad trust accepted when guard removed');
  a(probeWith(BROKEN[10], probeFneg) !== 'non-positive-delta', 'v2670/narr: [N1] negative delta accepted when guard removed');
  a(probeWith(BROKEN[11], probePgate) !== 'disabled', 'v2670/narr: [N1] pevents gate removed');
  a(probeWith(BROKEN[12], probePfuture) === true, 'v2670/narr: [N1] future event accepted when guard removed');
  a(probeWith(BROKEN[13], probePcap) === true, 'v2670/narr: [N1] capacity overflow accepted when guard removed');
  a(probeWith(BROKEN[14], probePcrowd) === true, 'v2670/narr: [N1] crowd accepted when guard removed');
  a(probeClean(probeTlockGate) === 'disabled', 'v2670/narr: [N2] original refuses disabled lock');
  a(probeClean(probeTmiss) === 'missing-fields', 'v2670/narr: [N2] original refuses missing span');
  a(probeClean(probeTlong) === 'too-long', 'v2670/narr: [N2] original refuses over-limit');
  a(probeClean(probeTneg) === 'negative-span', 'v2670/narr: [N2] original refuses backwards span');
  a(probeClean(probeTgate) === 'disabled', 'v2670/narr: [N2] original: disabled temperament says so');
  a(probeClean(probeTsame) === false, 'v2670/narr: [N2] original refuses identical layers');
  a(probeClean(probeTfield) === 'missing-fields', 'v2670/narr: [N2] original refuses half temperament');
  a(probeClean(probeFgate) === 'disabled', 'v2670/narr: [N2] original refuses disabled fondness');
  a(probeClean(probeFstep) === false, 'v2670/narr: [N2] original refuses off-step');
  a(probeClean(probeFtrust) === 'bad-trust', 'v2670/narr: [N2] original refuses bad trust');
  a(probeClean(probeFneg) === 'non-positive-delta', 'v2670/narr: [N2] original refuses negative delta');
  a(probeClean(probePgate) === 'disabled', 'v2670/narr: [N2] original refuses disabled pevents');
  a(probeClean(probePfuture) === false, 'v2670/narr: [N2] original refuses future events');
  a(probeClean(probePcap) === false, 'v2670/narr: [N2] original refuses capacity overflow');
  a(probeClean(probePcrowd) === false, 'v2670/narr: [N2] original refuses crowd');
  a(probeWith(BROKEN[0], probeTgate) === 'disabled', 'v2670/narr: [N3] tlock break does not touch temperament');
  a(probeWith(BROKEN[4], probeFgate) === 'disabled', 'v2670/narr: [N3] temperament break does not touch fondness');
  a(probeWith(BROKEN[7], probePgate) === 'disabled', 'v2670/narr: [N3] fondness break does not touch pevents');
  const chg = isolated(function () {
    const WA = fresh();
    resetWorld(WA);
    WA.fondness.setSettings({ enabled: true });
    WA.fondness.apply('Aning', { delta: 0.5, trust: 30 });
    WA.fondness.apply('Aning', { delta: 0.3 });
    const rd = WA.fondness.read('Aning');
    return { v: rd.value, t: rd.trust };
  });
  a(chg.v === 0.8 && chg.t === 30, 'v2670/narr: [N4] state really changed (got ' + JSON.stringify(chg) + ')');
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2670/narr: [N5] sentinel did not leak (' + (leak.join(',') || 'none') + ')');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2670: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2670: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative };