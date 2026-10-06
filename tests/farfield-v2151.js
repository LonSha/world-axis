#!/usr/bin/env node
// v2.151.0 RX3 专锁：远场脉搏、传播延迟、跨模块落地与面板/注入/诊断消费。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/farfield.js';
const ANCHOR = "    if (last === null) {\n      b.lastTickAt = now;";
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }
function seed(WA) {
  WA.store.init();
  WA.farfield.setSettings({ enabled: true, nearDays: 1, maxPulses: 16, capPending: 16, capHeard: 16, maxItems: 4, spreadSalt: 7 });
  if (WA.region && WA.region.setSettings) WA.region.setSettings({ enabled: true });
  WA.store.transact(function (d) { d.farfield = { pulses: [], pending: [], heard: [], lastTickAt: null, rounds: 0 }; d.region = { places: [], events: [] }; }, 'farfield-v2151:reset');
}
function runAll(a) {
  let WA = fresh(); seed(WA); const F = WA.farfield;
  WA.farfield.setSettings(Object.assign({}, WA.farfield.getSettings(), { enabled: false }));
  a(WA.farfield.tick({}, { now: 1000 }).reason === 'disabled' && WA.farfield.deliver({}, { now: 1000 }).reason === 'disabled', 'v2151/farfield: write engines default closed and reject while disabled');
  WA.farfield.setSettings(Object.assign({}, WA.farfield.getSettings(), { enabled: true }));
  a(WA.farfield.tick(null, { now: 1000 }).reason === 'no-draft', 'v2151/farfield: missing tick draft rejected');
  a(WA.farfield.deliver(null, { now: 1000 }).reason === 'no-draft', 'v2151/farfield: missing delivery draft rejected');
  let d = { farfield: { pulses: [], pending: [], heard: [], lastTickAt: null, rounds: 0 } };
  const first = WA.farfield.tick(d, { now: 1700000000000 });
  a(first.first === true && d.farfield.lastTickAt === 1700000000000, 'v2151/farfield: first call establishes baseline only');
  const noFar = WA.farfield.tick(d, { now: 1700000000000 + 86400000 });
  a(noFar.reason === 'no-far', 'v2151/farfield: absent far regions are not fabricated');
  // Region owns geography; its registration gate must be explicitly enabled and observable.
  WA.store.transact(function (draft) { draft.region = { places: [], events: [] }; }, 'farfield-v2151:region-reset');
  a(WA.region.getSettings().enabled === true, 'v2151/farfield: region registration setting is enabled explicitly');
  a(WA.region.register('近地乙', { distanceDays: 0.2, lane: 'road' }).ok, 'v2151/farfield: near place registered through region source');
  a(WA.region.register('远方A', { distanceDays: 20, lane: 'road' }).ok, 'v2151/farfield: far place registered through region source');
  const part = WA.farfield.partition();
  a(part.near.some(function (p) { return p.name === '近地乙'; }) && part.far.some(function (p) { return p.name === '远方A'; }), 'v2151/farfield: near/far partition uses distance threshold');
  d.farfield.lastTickAt = 1700000000000;
  const tick = WA.farfield.tick(d, { now: 1700000000000 + 3 * 86400000, rounds: 2 });
  a(tick.ok && tick.windows === 2, 'v2151/farfield: elapsed span bounds requested pulse windows');
  const pulses = d.farfield.pulses;
  a(pulses.length > 0 && pulses.every(function (p) { return p.place === '远方A' && p.sedimentPending === (p.trend === 'war' || p.trend === 'plague'); }), 'v2151/farfield: pulses belong only to far regions with explicit sediment linkage');
  const farPending = d.farfield.pending;
  a(farPending.every(function (m) { return m.dueAt > m.at && m.delayDays > 0; }), 'v2151/farfield: messages carry a positive distance-derived delay');
  const early = WA.farfield.deliver(d, { now: 1700000000000 });
  a(early.reason === 'too-early' && early.delivered === 0, 'v2151/farfield: early delivery is refused without consuming pending');
  const noPending = WA.farfield.deliver({ farfield: { pulses: [], pending: [], heard: [], lastTickAt: 1 } }, { now: 2 });
  a(noPending.reason === 'nothing-pending', 'v2151/farfield: empty delivery queue is distinct');
  const heldFfStore = WA.store; WA.store = null;
  const unavailableHeard = WA.farfield.heard(); WA.store = heldFfStore;
  a(unavailableHeard.count === 0, 'v2151/farfield: read surfaces safely return empty without store');
  let due = null;
  const deliveryDraft = { farfield: d.farfield };
  due = WA.farfield.deliver(deliveryDraft, { now: 1700000000000 + 40 * 86400000 });
  WA.store.transact(function (draft) { draft.farfield = deliveryDraft.farfield; }, 'farfield-v2151:deliver-due');
  a(due.delivered === farPending.length && WA.farfield.heard().count === due.delivered, 'v2151/farfield: due messages become heard records');
  a(WA.farfield.buildBlock().indexOf('[远方的脉搏]') === 0, 'v2151/farfield: only heard records feed the injection block');
  a(WA.farfield.settlePulse('').reason === 'missing-fields', 'v2151/farfield: missing pulse id rejected');
  a(WA.farfield.settlePulse('ff_unknown').reason === 'unknown-pulse', 'v2151/farfield: unknown pulse rejected');
  const pulse = pulses.filter(function (p) { return p.sedimentPending; })[0];
  const oldSediment = WA.sediment;
  WA.sediment = null;
  const absent = WA.farfield.settlePulse(pulse.id);
  WA.sediment = oldSediment;
  a(pulse && absent.reason === 'sediment-absent', 'v2151/farfield: absent sediment consumer is explicit only for a sediment-linked pulse');
  const oldRumor = WA.rumor; WA.rumor = null;
  const rumorAbsent = WA.farfield.relayToRumor('unseen', { factKey: 'f' });
  WA.rumor = oldRumor;
  a(rumorAbsent.reason === 'unknown-message', 'v2151/farfield: relay requires a heard message before checking rumor');
  const heardRow = WA.farfield.heard().rows[0];
  if (heardRow) {
    WA.rumor = null; const rAbsent = WA.farfield.relayToRumor(heardRow.id, { factKey: 'f' }); WA.rumor = oldRumor;
    a(rAbsent.reason === 'rumor-absent', 'v2151/farfield: missing rumor consumer is explicit');
    a(WA.farfield.relayToRumor(heardRow.id, {}).reason === 'missing-fields', 'v2151/farfield: missing fact key is explicit');
  } else a(false, 'v2151/farfield: due delivery yields a message for relay probes');
  const settings = WA.farfield.getSettings();
  a(settings.nearDays === 1, 'v2151/farfield: integer near-days setting matches settingsBus rounding');
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(src.indexOf('function saveSettings(next)') >= 0 && src.indexOf('setSettings: saveSettings') >= 0, 'v2151/farfield: durable settings writer is exported');
  a(src.indexOf("'farfield.pulses'") >= 0 && src.indexOf("'farfield.pending'") >= 0 && src.indexOf("'farfield.heard'") >= 0, 'v2151/farfield: all three bounded ledgers use eviction sites');
}
function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const n = src.split(ANCHOR).length - 1;
  a(n === 1, 'v2151/farfield/N0: first-baseline guard is uniquely anchored (' + n + ')');
  if (n !== 1) return;
  const broken = src.replace(ANCHOR, "    if (false) {\n      b.lastTickAt = now;");
  a(broken !== src, 'v2151/farfield/N0b: destructive mutation changed the in-memory source');
  const ov = {}; ov[REL] = broken;
  const WA = fresh(ov); seed(WA);
  const d = { farfield: { pulses: [], pending: [], heard: [], lastTickAt: null, rounds: 0 } };
  const bad = WA.farfield.tick(d, { now: 1700000000000 });
  a(bad.first !== true, 'v2151/farfield/N1: broken baseline guard changes real behavior');
  const clean = fresh(); seed(clean);
  const good = clean.farfield.tick({ farfield: { pulses: [], pending: [], heard: [], lastTickAt: null, rounds: 0 } }, { now: 1700000000000 });
  a(good.first === true, 'v2151/farfield/N2: identical behavior判据 passes on original source');
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === src, 'v2151/farfield/N3: negative probe leaves product source untouched');
}
module.exports = { runAll: runAll, runNegative: runNegative };