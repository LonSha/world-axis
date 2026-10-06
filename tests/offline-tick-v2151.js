#!/usr/bin/env node
// v2.151.0 RX2 专锁：跨会话记忆锚、边界归因与锚保护。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/offline-tick.js';
const ANCHOR = "    if (last === null) {\n      b.lastSettledAt = now;";
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }
function reset(WA) {
  WA.store.init();
  WA.offlineTick.setSettings({ enabled: true, stepMs: 60000, minGapMs: 1000, maxRounds: 4, maxAnchors: 4, capBatches: 4, capSkips: 8 });
  WA.store.transact(function (d) { d.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 }; }, 'offline-v2151:reset');
}
function runAll(a) {
  let WA = fresh(); reset(WA);
  const O = WA.offlineTick;
  WA.offlineTick.setSettings(Object.assign({}, WA.offlineTick.getSettings(), { enabled: false }));
  a(WA.offlineTick.anchor('p.disabled', { kind: 'task' }).reason === 'disabled', 'v2151/offline: disabled anchor rejected');
  a(WA.offlineTick.tick({}, { now: 1 }).reason === 'disabled', 'v2151/offline: disabled tick rejected');
  WA.offlineTick.setSettings(Object.assign({}, WA.offlineTick.getSettings(), { enabled: true }));
  a(WA.offlineTick.anchor('', { kind: 'task' }).reason === 'missing-fields', 'v2151/offline: missing path rejected');
  a(WA.offlineTick.anchor('p.bad', { kind: 'invented' }).reason === 'bad-value', 'v2151/offline: unknown anchor kind rejected');
  for (let i = 1; i <= 4; i++) a(WA.offlineTick.anchor('p.' + i, { kind: 'task', text: 'task ' + i }).ok, 'v2151/offline: anchor ' + i + ' registered');
  a(WA.offlineTick.anchor('p.overflow', { kind: 'pact' }).reason === 'anchors-full', 'v2151/offline: anchor cap enforced');
  a(WA.offlineTick.release('p.unknown').reason === 'unknown-anchor', 'v2151/offline: unknown anchor release rejected');
  a(WA.offlineTick.release('p.1').ok, 'v2151/offline: explicit release succeeds');
  a(WA.offlineTick.anchorPaths().indexOf('p.1') < 0 && WA.offlineTick.anchorPaths().indexOf('p.2') >= 0, 'v2151/offline: released anchor leaves protection set');
  a(WA.offlineTick.summary().reason === 'no-batch', 'v2151/offline: no batch is not reported as an empty success');
  a(WA.offlineTick.tick(null, { now: 10 }).reason === 'no-draft', 'v2151/offline: missing transaction draft rejected');
  let first = null, noElapsed = null, tooShort = null, pushed = null, noApply = null;
  WA.store.transact(function (draft) {
    draft.offlineTick = { anchors: WA.offlineTick.anchorPaths().map(function (p) { return { path: p }; }), batches: [], skips: [], lastSettledAt: null, rounds: 0 };
    first = WA.offlineTick.tick(draft, { now: 10000 });
    draft.offlineTick.lastSettledAt = 10000;
    noElapsed = WA.offlineTick.tick(draft, { now: 10000 });
    tooShort = WA.offlineTick.tick(draft, { now: 10500 });
    draft.offlineTick.lastSettledAt = 10000;
    pushed = WA.offlineTick.tick(draft, { now: 10000 + 10 * 60000, apply: function (d, round) { return { touched: ['p.2'] }; } });
  }, 'offline-v2151:tick-cases');
  a(first.first === true && first.rounds === 0 && first.to === 10000, 'v2151/offline: first call establishes baseline only');
  a(noElapsed.reason === 'no-elapsed', 'v2151/offline: zero elapsed is distinguished');
  a(tooShort.reason === 'too-short', 'v2151/offline: sub-minimum interval is distinguished');
  a(pushed.applied === true && pushed.protectedRows >= 1 && pushed.skipped.some(function (x) { return x.path === 'p.2'; }), 'v2151/offline: changed anchored path is reported as protected');
  a(pushed.capped === true && pushed.rounds === 4, 'v2151/offline: long offline interval is capped');
  // Batch is persisted by the transaction; summary and injected copy read the same store-backed record.
  const protectedSummary = WA.offlineTick.summary();
  a(protectedSummary.ok && protectedSummary.rows.some(function (x) { return x.path === 'p.2'; })
    && protectedSummary.lines.join(' ').indexOf('p.2') >= 0, 'v2151/offline: committed summary preserves protected-path evidence');
  WA.offlineTick.setSettings({ enabled: true });
  a(WA.offlineTick.buildBlock().indexOf('[你不在时]') === 0, 'v2151/offline: injection block consumes summary');
  WA.store.transact(function (draft) { draft.offlineTick.lastSettledAt = pushed.to; noApply = WA.offlineTick.tick(draft, { now: pushed.to + 60000 }); }, 'offline-v2151:no-apply');
  a(noApply.reason === 'no-apply', 'v2151/offline: absent apply callback is explicit');
  const hold = WA.store; WA.store = null;
  let storeFail = null; try { storeFail = WA.offlineTick.anchor('p.store', { kind: 'task' }); } finally { WA.store = hold; }
  a(storeFail && storeFail.reason === 'store-unavailable', 'v2151/offline: unavailable store is explicit');
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(src.indexOf('function saveSettings(next)') >= 0 && src.indexOf('setSettings: saveSettings') >= 0, 'v2151/offline: durable settings writer is exported');
  a(src.indexOf("'offlineTick.anchors'") >= 0 && src.indexOf("'offlineTick.batches'") >= 0 && src.indexOf("'offlineTick.skips'") >= 0, 'v2151/offline: all three bounded ledgers use eviction sites');
}
function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const n = src.split(ANCHOR).length - 1;
  a(n === 1, 'v2151/offline/N0: first-baseline guard is uniquely anchored (' + n + ')');
  if (n !== 1) return;
  const broken = src.replace(ANCHOR, "    if (false) {\n      b.lastSettledAt = now;");
  a(broken !== src, 'v2151/offline/N0b: destructive mutation changed the in-memory source');
  const ov = {}; ov[REL] = broken;
  const WA = fresh(ov); reset(WA);
  const d = { offlineTick: { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 } };
  const observed = WA.offlineTick.tick(d, { now: 10000 });
  a(observed.first !== true, 'v2151/offline/N1: broken baseline guard changes the real behavior');
  const clean = fresh(); reset(clean);
  const good = clean.offlineTick.tick({ offlineTick: { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 } }, { now: 10000 });
  a(good.first === true, 'v2151/offline/N2: the same behavior判据 passes on original source');
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === src, 'v2151/offline/N3: negative probe leaves product source untouched');
}
module.exports = { runAll: runAll, runNegative: runNegative };
