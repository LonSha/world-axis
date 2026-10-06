#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const DAY = 86400000;
const T = 1700000000000;
const OFF = 'engines/offline-tick.js';
const FAR = 'engines/farfield.js';
const ECO = 'engines/eco-audit.js';
const ANCHOR = '          const changed = protect(candidate, before, a.parts);';
const ANCHOR2 = '      const candidate = copy(draft);';
const ANCHOR3 = '    const span = Math.max(0, win1 - win0);';
const ANCHOR4 = '      if (blocked.indexOf(m.place) >= 0) { held.push(m.id); return; }';
const ANCHOR5 = '    if (!lastStamp || !current || lastStamp.chatId !== current.chatId\n'
  + '      || lastStamp.stateRev !== current.stateRev || lastStamp.rules !== current.rules\n'
  + '      || lastStamp.inputs !== current.inputs) {';

function fresh(override) {
  global.localStorage.clear();
  const c = global.SillyTavern.getContext();
  c.chatId = 'demand_integrity'; c.chatMetadata = {};
  const env = sync.fresh({ srcOverride: override || {} });
  const WA = env.WA;
  WA.clock.freeze(T); WA.rand.seed(12345);
  WA.offlineTick.setSettings({ enabled: true, stepMs: 60000, minGapMs: 1000, maxRounds: 4 });
  WA.farfield.setSettings({ enabled: true }); WA.region.setSettings({ enabled: true });
  WA.ecoAudit.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.worldFacts = [{ key: 'task', value: 'completed' }];
    d.background.text = 'initial';
    d.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: 10000, rounds: 0 };
    d.farfield = { pulses: [], pending: [], heard: [], lastTickAt: T, rounds: 0 };
    d.region = { places: [], events: [] };
  }, 'demand-integrity:prepare');
  return WA;
}
function offline(WA, apply, now) {
  let r;
  const tx = WA.store.transact(function (d) {
    r = WA.offlineTick.tick(d, { now: now || 70000, apply: apply });
  }, 'demand-integrity:offline');
  if (!tx.ok) throw new Error('Fixture transaction failed');
  return r;
}
function protectedValue(WA) {
  WA.offlineTick.anchor('worldFacts.0.value', { kind: 'task' });
  const r = offline(WA, function (d) {
    d.worldFacts[0].value = 'undone'; d.background.text = 'good';
    return { touched: ['worldFacts'] };
  });
  const s = WA.store.get();
  return r.ok && r.protectedRows === 1 && s.worldFacts[0].value === 'completed' && s.background.text === 'good';
}
function atomic(WA) {
  const r = offline(WA, function (d) { d.background.text = 'partial'; throw new Error('controlled'); });
  const s = WA.store.get();
  return !r.ok && !r.applied && s.background.text === 'initial'
    && s.offlineTick.lastSettledAt === 10000 && s.offlineTick.rounds === 0 && s.offlineTick.batches.length === 0;
}
function subday(WA) {
  WA.region.register('remote', { distanceDays: 20, lane: 'road' });
  const d = { farfield: { pulses: [], pending: [], heard: [], lastTickAt: T, rounds: 0 } };
  const r = WA.farfield.tick(d, { now: T + 1000 });
  return r.windows === 0 && d.farfield.rounds === 0 && d.farfield.lastTickAt === T && !d.farfield.pulses.length;
}
function blockedDelivery(WA) {
  WA.region.register('remote', { distanceDays: 20, lane: 'road' });
  WA.region.markLane('remote', true, { reason: 'test' });
  const d = { farfield: { pulses: [], pending: [{ id: 'm', place: 'remote', trend: 'war',
    at: T - 2000, dueAt: T - 1000, deliveredAt: 0 }], heard: [], lastTickAt: T, rounds: 0 } };
  const r = WA.farfield.deliver(d, { now: T });
  return r.delivered === 0 && r.blocked === 1 && d.farfield.pending[0].deliveredAt === 0 && !d.farfield.heard.length;
}
function staleCache(WA) {
  WA.ecoAudit.sweep();
  WA.store.transact(function (d) { d.background.text = 'new world revision'; });
  const r = WA.ecoAudit.lastSweep();
  const m = WA.store.maintain({ dryRun: true });
  return !r.ok && r.reason === 'stale' && !WA.ecoAudit.stat().hasLast
    && m.issues.some(function (i) { return i.key === 'ecology.stale'; })
    && !m.issues.some(function (i) { return i.key === 'ecology.clean'; });
}

function runAll(a) {
  a(protectedValue(fresh()), 'demand: actual anchored leaf survives while unrelated change commits');
  a(atomic(fresh()), 'demand: throw discards partial writes and preserves retry baseline');
  let WA = fresh();
  WA.offlineTick.anchor('worldFacts', { kind: 'task' });
  const silent = offline(WA, function (d) { delete d.worldFacts; d.background.text = 'good'; });
  a(silent.protectedRows === 1 && WA.store.get().worldFacts[0].value === 'completed', 'demand: protection does not trust touched reports');
  WA = fresh();
  WA.offlineTick.anchor('worldFacts.0.value', { kind: 'task' });
  offline(WA, function (d) { d.worldFacts = null; d.background.text = 'good'; });
  a(WA.store.get().worldFacts[0].value === 'completed' && WA.store.get().background.text === 'good', 'demand: parent deletion cannot bypass anchored leaf');
  WA = fresh();
  WA.offlineTick.anchor('background.missing', { kind: 'task' });
  offline(WA, function (d) { d.background.missing = 'injected'; d.background.text = 'good'; });
  a(!Object.prototype.hasOwnProperty.call(WA.store.get().background, 'missing'), 'demand: absent anchored property stays absent');
  WA = fresh();
  WA.offlineTick.anchor('worldFacts', { kind: 'task' }); WA.offlineTick.release('worldFacts');
  offline(WA, function (d) { d.worldFacts[0].value = 'explicitly changed'; });
  a(WA.store.get().worldFacts[0].value === 'explicitly changed', 'demand: explicitly released anchor no longer protects');
  WA = fresh();
  const absent = offline(WA);
  a(absent.reason === 'no-apply' && absent.rounds === 0 && WA.store.get().offlineTick.lastSettledAt === 10000,
    'demand: no apply does not claim rounds or consume catch-up time');
  a(WA.offlineTick.summary().rows.length === 0, 'demand: no-apply summary cannot inherit previous skip rows');
  const rejected = offline(WA, function (d) { d.background.text = 'bad'; return { ok: false, reason: 'bad-value' }; });
  a(!rejected.ok && WA.store.get().background.text === 'initial', 'demand: explicit callback rejection is atomic');
  let saved;
  offline(WA, function (d) { saved = d; d.background.text = 'committed'; });
  saved.background.text = 'late mutation';
  a(WA.store.get().background.text === 'committed', 'demand: callback-held candidate cannot mutate committed store');
  WA = fresh();
  const lateFailure = offline(WA, function (d, i) { d.background.text = 'round ' + i; if (i === 1) throw new Error('later'); }, 130000);
  a(!lateFailure.ok && WA.store.get().background.text === 'initial' && WA.store.get().offlineTick.rounds === 0,
    'demand: later round failure discards entire speculative batch');
  WA = fresh();
  const asyncResult = offline(WA, function (d) { d.background.text = 'async'; return Promise.resolve({ ok: true }); });
  a(asyncResult.reason === 'bad-value' && WA.store.get().background.text === 'initial', 'demand: async callback cannot escape synchronous settlement');
  a(subday(fresh()), 'demand: unfinished daily window produces no future pulse');
  WA = fresh(); WA.region.register('remote', { distanceDays: 20, lane: 'road' });
  const d = { farfield: { pulses: [], pending: [], heard: [], lastTickAt: T, rounds: 0 } };
  const zero = WA.farfield.tick(d, { now: T }), back = WA.farfield.tick(d, { now: T - DAY });
  a(zero.windows === 0 && back.windows === 0 && d.farfield.lastTickAt === T, 'demand: zero and backward clock do not advance or rewind baseline');
  const budgetZero = WA.farfield.tick(d, { now: T + DAY, rounds: 0 });
  a(budgetZero.windows === 0 && d.farfield.lastTickAt === T, 'demand: zero budget preserves completed window for later');
  const first = WA.farfield.tick(d, { now: T + 3 * DAY, rounds: 2 });
  const second = WA.farfield.tick(d, { now: T + 3 * DAY });
  a(first.windows === 2 && second.windows === 1 && d.farfield.rounds === 3, 'demand: reduced budget does not silently consume leftover windows');
  const snapshot = JSON.stringify(d.farfield);
  WA.farfield.tick(d, { now: T + 3 * DAY });
  a(JSON.stringify(d.farfield) === snapshot && d.farfield.pulses.every(function (p) { return p.at <= T + 3 * DAY; }),
    'demand: repeated time is idempotent and all pulses are historical');
  a(blockedDelivery(fresh()), 'demand: blocked due message stays in transit');
  WA = fresh(); WA.ecoAudit.sweep();
  a(WA.ecoAudit.lastSweep().ok, 'demand: unchanged world retains valid cached read');
  a(staleCache(fresh()), 'demand: revision change invalidates health evidence');
  WA = fresh(); WA.ecoAudit.sweep();
  const c = global.SillyTavern.getContext(); c.chatId = 'other_chat'; c.chatMetadata = {}; WA.store.init();
  a(WA.ecoAudit.lastSweep().reason === 'stale', 'demand: other chat cannot inherit prior healthy result');
  WA = fresh(); WA.ecoAudit.sweep(); WA.ecoAudit.setSettings({ spaceEnabled: false });
  a(WA.ecoAudit.lastSweep().reason === 'stale', 'demand: rule change invalidates scan');
  WA = fresh(); WA.ecoAudit.sweep();
  WA.store.get().people.p_live = { name: 'live mutation' };
  a(WA.ecoAudit.lastSweep().reason === 'stale', 'demand: unflushed live mutation invalidates scan without revision change');
  for (const source of ['events', 'currents']) {
    WA = fresh();
    WA.store.transact(function (d) {
      d.causal = { chains: [{ id: 'dependent', cause: 'known-source', at: T, status: 'open', delayed: [] }], settled: [] };
      d.evolution.events = source === 'events' ? [{ id: 'known-source' }] : [];
      d.currents = source === 'currents' ? [{ id: 'known-source', causes: [] }] : [];
    });
    const clean = WA.ecoAudit.sweep();
    if (source === 'events') WA.store.get().evolution.events = [];
    else WA.store.get().currents = [];
    a(clean.warns === 0 && WA.ecoAudit.lastSweep().reason === 'stale',
      'demand: unflushed indirect causal ' + source + ' change invalidates cache');
    const rescanned = WA.ecoAudit.sweep();
    a(rescanned.issues.some(function (i) { return i.code === 'cause-broken'; }),
      'demand: rescan observes missing indirect causal ' + source);
  }
  WA = fresh(); WA.ecoAudit.sweep(); WA.ecoAudit.setSettings({ enabled: false });
  a(WA.ecoAudit.lastSweep().reason === 'disabled', 'demand: disabled audit never advertises valid cached result');
}
function mutate(src, anchor, replacement) {
  if (src.split(anchor).length !== 2) throw new Error('Mutation anchor must occur once');
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error('Mutation has no effect');
  return out;
}
function detects(judge, WA) {
  if (judge(WA)) throw new Error('Mutation was not detected');
  return true;
}
function runNegative(a) {
  const cases = [
    [OFF, ANCHOR, '          const changed = false;', protectedValue],
    [OFF, ANCHOR2, '      const candidate = draft;', atomic],
    [FAR, ANCHOR3, '    const span = Math.max(1, win1 - win0);', subday],
    [FAR, ANCHOR4, '      if (false) { held.push(m.id); return; }', blockedDelivery],
    [ECO, ANCHOR5, '    if (false) {', staleCache]
  ];
  for (const [rel, anchor, replacement, judge] of cases) {
    const src = fs.readFileSync(path.join(BASE, rel), 'utf8');
    a(judge(fresh()), 'demand/N: same behavior criterion passes on original ' + rel);
    const broken = mutate(src, anchor, replacement);
    let caught = null, detected = false;
    try { detected = detects(judge, fresh({ [rel]: broken })); } catch (e) { caught = e; }
    a(!caught && detected, 'demand/N: real source mutation fails same behavior criterion ' + rel);
    a(fs.readFileSync(path.join(BASE, rel), 'utf8') === src, 'demand/N: disk source untouched ' + rel);
  }
  for (const src of ['', 'x x']) {
    let threw = false; try { mutate(src, 'x', 'y'); } catch (e) { threw = true; }
    a(threw, 'demand/H6: missing or duplicate anchor must throw');
  }
  let missed = false; try { detects(function () { return true; }, null); } catch (e) { missed = true; }
  a(missed, 'demand/H6: insensitive negative criterion must throw');
}
module.exports = { runAll, runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, msg) { if (ok) pass++; else { fail++; console.log('FAIL ' + msg); } };
  for (const fn of [runAll, runNegative]) {
    try { fn(a); } catch (e) { fail++; console.log(e.stack); }
  }
  console.log('DEMAND-INTEGRITY: pass ' + pass + ' / fail ' + fail);
  process.exitCode = fail ? 1 : 0;
}
