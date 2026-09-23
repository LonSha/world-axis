#!/usr/bin/env node
// WorldAxis tests/settle-v2650.js -- settlement lock (v2.65.0)
//
// What it pins (all negative):
//   depart is not arrival: an in-transit person is in neither place.
//   weather that was never set is missing, never silently clear.
//   a bad difficulty enum rejects the whole write, it does not keep the legal half.
//   intel with a route stays invisible until the travel time has elapsed.
// Anchors each occur exactly once in real source. Negative control mutates a memory copy only.
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2650_';

const A_GATE = "if (!settings().enabled) { stat.blocked++; return { ok: false, reason: 'disabled', person: who }; }";
const A_ZERO = "if (m.minutes === 0) return { ok: false, reason: 'already-there', person: who, place: m.to };";
const A_ARRIVE = "if (j.left === 0) { j.status = 'arrived'; arrived.push(j.person + '→' + j.to); }";
const A_MISS = "if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', place: pl }; }";
const A_FACTOR = "if (!cfg.enabled) return { ok: true, place: pl, factor: 1, weights: {}, reason: 'disabled' };";
const A_ENUM = "if (bad.length) { noteFault('bad-enum'); return { ok: false, reason: 'bad-enum', fields: bad }; }";
const A_NEUTRAL = "if (!cfg.enabled) return { ok: true, enabled: false, cost: 1, stance: 'neutral', flow: 1, reason: 'disabled' };";
const A_ROUTE = "if (!r.reachable) return { ok: false, reason: 'unreachable' };";
const A_QUEUE = "queued = { ok: true, id: row.id, status: 'in-transit', due: due, minutes: tv.minutes };";

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function st(WA) { return WA.store.get() || {}; }
function wnode(WA) { const w = st(WA).world; return (w && typeof w === 'object' && !Array.isArray(w)) ? w : {}; }
function journeys(WA) { return Array.isArray(wnode(WA).journeys) ? wnode(WA).journeys : []; }
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
function resetWorld(WA) {
  WA.store.transact(function (d) {
    d.world = { places: [], roads: [], events: [], journeys: [] };
    d.weather = { rows: [] };
    d.intelQueue = [];
    d.people = {};
    d.clock = { dayIndex: 10 };
  }, TAG + 'reset');
}
function layRoad(WA) {
  const w = WA.world;
  w.addPlace({ name: '码头', kind: 'work' });
  w.addPlace({ name: '茶楼', kind: 'public' });
  w.addRoad('码头', '茶楼', 30);
}

function judge(a) {
  const WA = fresh();
  a(!!WA.world && typeof WA.world.depart === 'function', 'v2650/settle: world.depart loaded');
  a(!!WA.weather && typeof WA.weather.setWeather === 'function', 'v2650/settle: weather loaded after world');
  a(!!WA.difficulty && typeof WA.difficulty.setProfile === 'function', 'v2650/settle: difficulty loaded');
  a(typeof WA.intel.releaseDue === 'function', 'v2650/settle: intel.releaseDue exported');
  resetWorld(WA);
  const w = WA.world;

  // 1 gate off: depart must not write a journey
  const before = JSON.stringify(wnode(WA));
  const off = w.depart('Aning', 'dock', 'tea', 0);
  a(off.ok === false && off.reason === 'disabled', 'v2650/settle: [1] disabled depart is refused (got ' + JSON.stringify(off) + ')');
  a(JSON.stringify(wnode(WA)) === before, 'v2650/settle: [1] disabled depart writes nothing');
  a(w.advance(10).reason === 'disabled', 'v2650/settle: [1] disabled advance is refused');

  // 2 depart is not arrival
  w.setSettings({ enabled: true });
  layRoad(WA);
  const d0 = w.depart('Aning', '码头', '茶楼', 1000);
  a(d0.ok === true && d0.status === 'in-transit' && d0.left === 30, 'v2650/settle: [2] depart records remaining minutes (got ' + JSON.stringify(d0) + ')');
  const wh = w.where('Aning');
  a(wh.inTransit === true && wh.place === null && wh.left === 30, 'v2650/settle: [2] in transit is neither endpoint (got ' + JSON.stringify(wh) + ')');
  const d1 = w.depart('Aning', '码头', '茶楼', 1000);
  a(d1.ok === false && d1.reason === 'already-in-transit', 'v2650/settle: [2] second depart is refused');
  a(journeys(WA).filter(function (j) { return j.status === 'in-transit'; }).length === 1, 'v2650/settle: [2] only one in-transit row');
  const mid = w.advance(10);
  a(mid.ok === true && mid.still.indexOf('Aning') >= 0 && mid.arrived.length === 0, 'v2650/settle: [3] partial advance does not arrive (got ' + JSON.stringify(mid) + ')');
  a(w.where('Aning').left === 20, 'v2650/settle: [3] left decreased, still in transit');
  const done = w.advance(20);
  a(done.arrived.length === 1 && w.where('Aning').place === '茶楼' && w.where('Aning').inTransit === false,
    'v2650/settle: [3] arrival only when left hits zero (got ' + JSON.stringify(w.where('Aning')) + ')');
  const same = w.depart('Aning', '码头', '码头', 1000);
  a(same.reason === 'already-there', 'v2650/settle: [3] zero minutes is already-there, not a journey');
  a(w.advance(0).reason === 'bad-minutes' && w.advance(-3).reason === 'bad-minutes', 'v2650/settle: [3] non-positive advance is bad-minutes');

  // 4 weather
  const wx = WA.weather;
  a(wx.getSettings().enabled === false, 'v2650/settle: [4] weather defaults off');
  const miss = wx.weatherOf('码头');
  a(miss.ok === false && miss.reason === 'missing', 'v2650/settle: [4] unset weather is missing, not clear');
  const offE = wx.effect('码头');
  a(offE.ok === true && offE.factor === 1 && offE.reason === 'disabled', 'v2650/settle: [4] disabled effect is factor 1 and says why');
  a(wx.buildBlock() === '', 'v2650/settle: [4] disabled weather injects nothing');
  wx.setSettings({ enabled: true });
  const unknown = wx.setWeather('不存在', 'rain');
  a(unknown.ok === false, 'v2650/settle: [4] weather on an unregistered place is refused (got ' + JSON.stringify(unknown) + ')');
  a(wx.setWeather('码头', 'drizzle').reason === 'bad-kind', 'v2650/settle: [4] kind outside the whitelist is refused');
  const set = wx.setWeather('码头', 'storm');
  a(set.ok === true && set.existed === false, 'v2650/settle: [4] set weather on a registered place');
  const again = wx.setWeather('码头', 'snow');
  a(again.existed === true, 'v2650/settle: [4] same place overwrites, does not add a row');
  a((st(WA).weather.rows || []).filter(function (x) { return x.place === '码头'; }).length === 1, 'v2650/settle: [4] one row per place');
  const onE = wx.effect('茶楼');
  a(onE.ok === false && onE.reason === 'missing', 'v2650/settle: [4] enabled but unset place stays missing, no fallback factor');
  const tm = wx.travelMinutes('码头', 30);
  a(tm.ok === true && tm.factor === 2 && tm.minutes === 60, 'v2650/settle: [4] storm doubles travel and rounds up (got ' + JSON.stringify(tm) + ')');
  const sea = wx.season();
  a(sea.ok === true && sea.season === 'spring' && sea.day === 10, 'v2650/settle: [4] season comes from dayIndex/90 (got ' + JSON.stringify(sea) + ')');
  const blk = wx.buildBlock();
  a(blk.indexOf('[天气与物候]') === 0 && blk.indexOf('不得被写成晴天') >= 0, 'v2650/settle: [4] inject names the rule');

  // 5 difficulty
  const df = WA.difficulty;
  const e0 = df.effective();
  a(e0.enabled === false && e0.cost === 1 && e0.reason === 'disabled', 'v2650/settle: [5] disabled difficulty is neutral and says why');
  a(df.actionCost(10).value === 10 && df.actionCost(10).reason === 'disabled', 'v2650/settle: [5] disabled cost is unchanged');
  const bad = df.setProfile({ resistance: 'hard', stance: 'not-a-stance' });
  a(bad.ok === false && bad.reason === 'bad-enum' && bad.fields.indexOf('stance') >= 0, 'v2650/settle: [5] bad enum rejects the whole write');
  a(df.getSettings().resistance === 'normal', 'v2650/settle: [5] the legal half was not kept');
  df.setSettings({ enabled: true });
  const okp = df.setProfile({ resistance: 'hard', stance: 'hostile', pace: 'slow' });
  a(okp.ok === true && okp.profile.cost === 2 && okp.profile.stance === 'hostile' && okp.profile.flow === 0.5,
    'v2650/settle: [5] three axes land independently (got ' + JSON.stringify(okp.profile) + ')');
  a(df.actionCost(10).value === 20, 'v2650/settle: [5] hard resistance doubles cost');
  a(df.spanMinutes(10).minutes === 5, 'v2650/settle: [5] slow pace halves the span');
  df.setProfile({ resistance: 'easy' });
  a(df.effective().stance === 'hostile' && df.effective().cost === 0.5, 'v2650/settle: [5] changing resistance does not touch stance');
  a(df.buildBlock().indexOf('不改变概率') >= 0, 'v2650/settle: [5] inject forbids turning want into will-happen');
  a(df.actionCost(-1).reason === 'bad-cost', 'v2650/settle: [5] negative cost is refused');

  // 6 delayed intel
  const it = WA.intel;
  const instant = it.addIntel('Aning', { claim: 'dock closed', source: 'self', level: 'witness' });
  a(instant.ok === true && instant.status === 'believed', 'v2650/settle: [6] intel without a route is credited at once');
  a(it.visibleTo('Aning').length === 1, 'v2650/settle: [6] instant intel is visible');
  const far = it.addIntel('Bing', { claim: 'tea closed', source: 'runner', level: 'report', from: '码头', to: '不存在' });
  a(far.ok === false && far.reason === 'unknown-place', 'v2650/settle: [6] unregistered route is not instant knowledge');
  const half = it.addIntel('Bing', { claim: 'x', source: 'runner', level: 'report', from: '码头' });
  a(half.reason === 'missing-route', 'v2650/settle: [6] a route needs both ends');
  const q = it.addIntel('Bing', { claim: 'tea closed', source: 'runner', level: 'report', from: '码头', to: '茶楼' });
  a(q.ok === true && q.status === 'in-transit' && q.minutes === 30, 'v2650/settle: [6] reachable route is queued (got ' + JSON.stringify(q) + ')');
  a(it.visibleTo('Bing').length === 0, 'v2650/settle: [6] receiver cannot see it before due');
  const early = it.releaseDue(q.due - 1);
  a(early.released === 0 && it.visibleTo('Bing').length === 0, 'v2650/settle: [6] one millisecond early still hidden');
  const late = it.releaseDue(q.due);
  a(late.released === 1 && it.visibleTo('Bing').length === 1, 'v2650/settle: [6] due releases exactly one (got ' + JSON.stringify(late) + ')');
  a((st(WA).intelQueue || []).length === 0, 'v2650/settle: [6] released rows leave the queue');
  const dead = it.addIntel('Bing', { claim: 'no road', source: 'runner', level: 'rumor', from: '码头', to: '夜禁' });
  WA.world.addPlace({ name: '夜禁' });
  const dead2 = it.addIntel('Bing', { claim: 'no road', source: 'runner', level: 'rumor', from: '码头', to: '夜禁' });
  a(dead2.ok === false && dead2.reason === 'unreachable', 'v2650/settle: [6] no road means unreachable, not a guessed delay');

  console.log('  ok v2650/settle: journey / weather / difficulty / delayed intel');
}

function probeGate(WA) {
  resetWorld(WA);
  return WA.world.depart('Aning', 'dock', 'tea', 0).reason;
}
function probeZero(WA) {
  resetWorld(WA); WA.world.setSettings({ enabled: true }); layRoad(WA);
  return WA.world.depart('Aning', '码头', '码头', 1000).reason;
}
function probeArrive(WA) {
  resetWorld(WA); WA.world.setSettings({ enabled: true }); layRoad(WA);
  WA.world.depart('Aning', '码头', '茶楼', 1000);
  WA.world.advance(30);
  return WA.world.where('Aning');
}
function probeMiss(WA) {
  resetWorld(WA);
  return WA.weather.weatherOf('码头').reason;
}
function probeFactor(WA) {
  resetWorld(WA);
  WA.weather.setWeather('码头', 'storm');
  return WA.weather.effect('码头');
}
function probeEnum(WA) {
  resetWorld(WA);
  const before = WA.difficulty.getSettings().resistance;
  const r = WA.difficulty.setProfile({ resistance: 'hard', stance: 'nope' });
  return { reason: r.reason, kept: WA.difficulty.getSettings().resistance, before: before };
}
function probeNeutral(WA) {
  resetWorld(WA);
  return WA.difficulty.effective().reason;
}
function probeRoute(WA) {
  resetWorld(WA); layRoad(WA); WA.world.addPlace({ name: '夜禁' });
  return WA.intel.addIntel('Bing', { claim: 'x', source: 'runner', level: 'rumor', from: '码头', to: '夜禁' }).reason;
}
function probeQueue(WA) {
  resetWorld(WA); layRoad(WA);
  const r = WA.intel.addIntel('Bing', { claim: 'x', source: 'runner', level: 'report', from: '码头', to: '茶楼' });
  return { status: r.status, visible: WA.intel.visibleTo('Bing').length };
}

const MISS_TO = "if (!hit) { return { ok: true, place: pl, kind: 'clear', factor: 1 }; }";

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
  { key: 'gate', rel: 'engines/world.js', from: A_GATE, to: kill(A_GATE) },
  { key: 'zero', rel: 'engines/world.js', from: A_ZERO, to: kill(A_ZERO) },
  { key: 'arrive', rel: 'engines/world.js', from: A_ARRIVE, to: kill(A_ARRIVE) },
  { key: 'miss', rel: 'engines/weather.js', from: A_MISS, to: MISS_TO },
  { key: 'factor', rel: 'engines/weather.js', from: A_FACTOR, to: kill(A_FACTOR) },
  { key: 'enumbad', rel: 'engines/difficulty.js', from: A_ENUM, to: kill(A_ENUM) },
  { key: 'neutral', rel: 'engines/difficulty.js', from: A_NEUTRAL, to: kill(A_NEUTRAL) },
  { key: 'route', rel: 'engines/intel.js', from: A_ROUTE, to: kill(A_ROUTE) },
  { key: 'queue', rel: 'engines/intel.js', from: A_QUEUE, to: 'queued = null;' }
];
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
  const anchorBad = BROKEN.filter(function (p) { return anchorHits(p) !== 1; })
    .map(function (p) { return p.key + '(' + anchorHits(p) + ')'; });
  a(anchorBad.length === 0, 'v2650/settle: [N0] each anchor hits once (' + (anchorBad.join(',') || 'none') + ')');
  a(BROKEN.every(function (p) {
    return brokenOverride(p)[p.rel] !== fs.readFileSync(path.join(BASE, p.rel), 'utf8');
  }), 'v2650/settle: [N0] every broken copy differs from source');
  a(probeWith(BROKEN[0], probeGate) !== 'disabled', 'v2650/settle: [N1] gate removed');
  a(probeWith(BROKEN[1], probeZero) !== 'already-there', 'v2650/settle: [N1] zero-minute guard removed');
  a(probeWith(BROKEN[2], probeArrive).inTransit === true, 'v2650/settle: [N1] arrival line removed');
  a(probeWith(BROKEN[3], probeMiss) !== 'missing', 'v2650/settle: [N1] missing weather fell back to clear');
  const fBad = probeWith(BROKEN[4], probeFactor);
  a(!(fBad.reason === 'disabled' && fBad.factor === 1), 'v2650/settle: [N1] disabled factor bypassed');
  a(probeWith(BROKEN[5], probeEnum).reason !== 'bad-enum', 'v2650/settle: [N1] enum reject removed');
  a(probeWith(BROKEN[6], probeNeutral) !== 'disabled', 'v2650/settle: [N1] neutral fallback removed');
  a(probeWith(BROKEN[7], probeRoute) !== 'unreachable', 'v2650/settle: [N1] unreachable route no longer refused');
  a(probeWith(BROKEN[8], probeQueue).status !== 'in-transit', 'v2650/settle: [N1] queue write removed');
  a(probeClean(probeGate) === 'disabled', 'v2650/settle: [N2] original refuses a disabled depart');
  a(probeClean(probeZero) === 'already-there', 'v2650/settle: [N2] original: zero minutes is already-there');
  const arrOk = probeClean(probeArrive);
  a(arrOk.inTransit === false && arrOk.place === '茶楼', 'v2650/settle: [N2] original arrives');
  a(probeClean(probeMiss) === 'missing', 'v2650/settle: [N2] original: unset weather is missing');
  const fOk = probeClean(probeFactor);
  a(fOk.reason === 'disabled' && fOk.factor === 1, 'v2650/settle: [N2] original: disabled weather stays factor 1');
  const eOk = probeClean(probeEnum);
  a(eOk.reason === 'bad-enum' && eOk.kept === eOk.before, 'v2650/settle: [N2] original: bad enum keeps nothing');
  a(probeClean(probeNeutral) === 'disabled', 'v2650/settle: [N2] original: difficulty off is distinguishable');
  a(probeClean(probeRoute) === 'unreachable', 'v2650/settle: [N2] original: no road is unreachable');
  const qOk = probeClean(probeQueue);
  a(qOk.status === 'in-transit' && qOk.visible === 0, 'v2650/settle: [N2] original: queued intel stays invisible');
  a(probeWith(BROKEN[0], probeMiss) === 'missing', 'v2650/settle: [N3] gate break does not touch weather');
  a(probeWith(BROKEN[3], probeGate) === 'disabled', 'v2650/settle: [N3] weather break does not touch the gate');
  a(probeWith(BROKEN[5], probeRoute) === 'unreachable', 'v2650/settle: [N3] enum break does not touch routes');
  a(probeWith(BROKEN[7], probeZero) === 'already-there', 'v2650/settle: [N3] route break does not touch zero-minute');
  const chg = isolated(function () {
    const WA = fresh();
    resetWorld(WA); WA.world.setSettings({ enabled: true }); layRoad(WA);
    const n0 = journeys(WA).length;
    WA.world.depart('Aning', '码头', '茶楼', 1000);
    const left = WA.world.where('Aning').left;
    WA.world.advance(30);
    return { n0: n0, n1: journeys(WA).length, left: left, place: WA.world.where('Aning').place };
  });
  a(chg.n0 === 0 && chg.n1 === 1 && chg.left === 30 && chg.place === '茶楼', 'v2650/settle: [N4] state really changed');
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2650/settle: [N5] sentinel did not leak (' + (leak.join(',') || 'none') + ')');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2650: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2650: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative };
