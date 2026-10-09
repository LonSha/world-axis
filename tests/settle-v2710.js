#!/usr/bin/env node
// WorldAxis tests/settle-v2710.js -- enigma x tempo x quota x spotlight lock (v2.71.0)
//
// What it pins (all negative):
//   enigma:    off-gate distinguishable; missing secret/knower refused; dup (secret,knower) refused (exists);
//              knowers cap enforced (knowers-full); rows cap enforced (rows-full);
//              read missing if unregistered; outsiders() partitions present into shouldKnow/shouldNotKnow.
//   tempo:     off-gate distinguishable; gear whitelist (bad-gear); same-gear refused; missing-span / bad-span /
//              frozen(0) / negative-span each attributed; over cap refused (over-pace); shift recorded with from/to.
//   quota:     off-gate distinguishable; bad-pool refused; missing-text refused; dup-text refused;
//              pool cap enforced (pool-full, NO silent eviction of oldest); tick() ages actives and flips to
//              expired at age limit (mark only, not delete); resolve/drop are explicit; already-terminal refused.
//   spotlight: off-gate distinguishable; bad-who refused; duplicate note same round is idempotent (already flag);
//              pending cap enforced (pending-full); seal with empty round refused (empty-round);
//              seal counts seen/streak and missed for absent; report/idle only contain registered names.
//   gauge.history: v2.70.0 legacy defect -- evict site must be named (gauge.history), history stays capped at 8.
// Anchors each occur exactly once in real source (or declared hits). Negative control mutates a memory copy only.
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2710_';
const A_EG_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_EG_DUP = "if (list.filter(function (k) { return k && k.who === who; })[0]) { out = { ok: false, reason: 'exists', key: key, who: who }; return false; }";
const A_EG_KNOWERS = "if (list.length >= settings().maxKnowers) { out = { ok: false, reason: 'knowers-full', key: key, who: who, cap: settings().maxKnowers }; return false; }";
const A_EG_ROWS = "if (draft.enigma.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', key: key }; return false; }";
const A_TP_GEAR = "if (!GEAR_MAP[gid]) { noteFault('bad-gear'); return { ok: false, reason: 'bad-gear', got: id }; }";
const A_TP_SAMEGEAR = "if (from === gid) { out = { ok: false, reason: 'same-gear', gear: gid }; return false; }";
const A_TP_MISSINGSPAN = "if (spanMinutes === undefined || spanMinutes === null || spanMinutes === '') { noteFault('missing-span'); return { ok: false, reason: 'missing-span' }; }";
const A_TP_FROZEN = "if (n === 0) { noteFault('frozen'); return { ok: false, reason: 'frozen', span: 0 }; }";
const A_TP_OVERPACE = "if (n > g.capMinutes) { noteFault('over-pace'); return { ok: false, reason: 'over-pace', span: n, cap: g.capMinutes, gear: g.id }; }";
const A_QT_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_QT_BADPOOL = "if (POOLS.indexOf(p) < 0) { noteFault('bad-pool'); return { ok: false, reason: 'bad-pool', got: pool }; }";
const A_QT_MISSINGTEXT = "if (!t) { noteFault('missing-text'); return { ok: false, reason: 'missing-text' }; }";
const A_QT_POOLFULL = "if (liveCount >= cap) { out = { ok: false, reason: 'pool-full', pool: p, cap: cap }; return false; }";
const A_QT_TERMINAL = "if (hit.status === 'resolved' || hit.status === 'dropped') { out = { ok: false, reason: 'already-terminal', id: key, status: hit.status }; return false; }";
const A_SL_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_SL_BADWHO = "if (!w) { noteFault('bad-who'); return { ok: false, reason: 'bad-who' }; }";
const A_SL_PENDFULL = "if (draft.spotlight.pending.length >= pendCap) { out = { ok: false, reason: 'pending-full', who: w, cap: pendCap }; return false; }";
const A_SL_EMPTY = "if (!pend.length) { out = { ok: false, reason: 'empty-round' }; return false; }";
const A_GG_HIST = "if (WA.evict) WA.evict.array(hit.history, 'gauge.history');";
const A_QT_DUPTEXT = "if (draft.quota.rows.filter(function (r) { return r && (r.status === 'active' || r.status === 'expired') && r.pool === p && r.text === t; })[0]) {";
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function st(WA) { return WA.store.get() || {}; }
function resetWorld(WA) {
  WA.store.transact(function (d) {
    d.enigma = { rows: [] };
    d.tempo = { gear: 'andante', shifts: [] };
    d.quota = { rows: [] };
    d.spotlight = { rows: [], pending: [] };
    d.gauge = { rows: [] };
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
  a(!!WA.enigma && typeof WA.enigma.mark === 'function', 'v2710: enigma loaded');
  a(!!WA.tempo && typeof WA.tempo.setGear === 'function', 'v2710: tempo loaded');
  a(!!WA.quota && typeof WA.quota.add === 'function', 'v2710: quota loaded');
  a(!!WA.spotlight && typeof WA.spotlight.note === 'function', 'v2710: spotlight loaded');
  resetWorld(WA);
  // ---- 1 enigma ----
  const egOff = WA.enigma.mark('身世', '甲');
  a(egOff.ok === true && egOff.reason === 'disabled', 'v2710: [1] disabled enigma says so');
  a(WA.enigma.buildBlock() === '', 'v2710: [1] disabled enigma injects nothing');
  WA.enigma.setSettings({ enabled: true });
  a(WA.enigma.mark('', '甲').reason === 'missing-fields', 'v2710: [1] enigma needs secret');
  a(WA.enigma.mark('身世', '').reason === 'missing-fields', 'v2710: [1] enigma needs knower');
  const egOk = WA.enigma.mark('身世', '甲');
  a(egOk.ok === true && egOk.count === 1, 'v2710: [1] first knower registered');
  a(WA.enigma.mark('身世', '甲').reason === 'exists', 'v2710: [1] duplicate (secret,knower) refused');
  WA.enigma.mark('身世', '乙');
  const outS = WA.enigma.outsiders('身世', ['甲', '乙', '丙', '丁']);
  a(outS.ok === true && outS.shouldKnow.join(',') === '甲,乙' && outS.shouldNotKnow.join(',') === '丙,丁', 'v2710: [1] outsiders partitions knowers vs blind');
  a(WA.enigma.read('不存在').reason === 'missing', 'v2710: [1] unregistered secret says missing');
  a(WA.enigma.outsiders('不存在', ['甲']).reason === 'missing', 'v2710: [1] outsiders on unregistered says missing');
  const un = WA.enigma.unmark('身世', '乙');
  a(un.ok === true && un.count === 1, 'v2710: [1] unmark removes knower');
  a(WA.enigma.unmark('身世', '乙').reason === 'missing', 'v2710: [1] unmark absent knower says missing');
  WA.enigma.setSettings({ maxKnowers: 1 });
  a(WA.enigma.mark('身世', '丙').reason === 'knowers-full', 'v2710: [1] knowers cap enforced');
  WA.enigma.setSettings({ maxKnowers: 8, maxRows: 4 });
  WA.enigma.mark('另一桩', '甲');
  WA.enigma.mark('第三桩', '甲');
  WA.enigma.mark('第四桩', '甲');
  a(WA.enigma.mark('第五桩', '甲').reason === 'rows-full', 'v2710: [1] rows cap enforced');
  WA.enigma.setSettings({ maxRows: 24 });
  a(WA.enigma.buildBlock().indexOf('[信息暗礁]') === 0, 'v2710: [1] enigma buildBlock valid');
  const dr = WA.enigma.drop('身世');
  a(dr.ok === true && WA.enigma.read('身世').reason === 'missing', 'v2710: [1] drop removes whole secret');
  // ---- 2 tempo ----
  const tpOff = WA.tempo.setGear('largo');
  a(tpOff.ok === true && tpOff.reason === 'disabled', 'v2710: [2] disabled tempo says so');
  a(WA.tempo.buildBlock() === '', 'v2710: [2] disabled tempo injects nothing');
  a(WA.tempo.check(10).reason === 'disabled', 'v2710: [2] disabled tempo check says so');
  WA.tempo.setSettings({ enabled: true });
  a(WA.tempo.setGear('rapido').reason === 'bad-gear', 'v2710: [2] gear whitelist enforced');
  a(WA.tempo.setGear('andante').reason === 'same-gear', 'v2710: [2] same gear refused');
  const tg = WA.tempo.setGear('largo');
  a(tg.ok === true && tg.from === 'andante', 'v2710: [2] gear shift recorded from previous');
  a(WA.tempo.current().gear === 'largo' && WA.tempo.current().capMinutes === 15, 'v2710: [2] current returns largo cap 15');
  a(WA.tempo.check().reason === 'missing-span', 'v2710: [2] missing span attributed');
  a(WA.tempo.check('abc').reason === 'bad-span', 'v2710: [2] non-numeric span attributed');
  a(WA.tempo.check(0).reason === 'frozen', 'v2710: [2] zero span = frozen');
  a(WA.tempo.check(-5).reason === 'negative-span', 'v2710: [2] negative span attributed');
  a(WA.tempo.check(16).reason === 'over-pace', 'v2710: [2] over largo cap refused');
  const ck = WA.tempo.check(15);
  a(ck.ok === true && ck.gear === 'largo', 'v2710: [2] at-cap span accepted');
  a(WA.tempo.buildBlock().indexOf('[节奏齿轮]') === 0, 'v2710: [2] tempo buildBlock valid');
  // ---- 3 quota ----
  const qtOff = WA.quota.add('short', '旧钥匙');
  a(qtOff.ok === true && qtOff.reason === 'disabled', 'v2710: [3] disabled quota says so');
  a(WA.quota.buildBlock() === '', 'v2710: [3] disabled quota injects nothing');
  WA.quota.setSettings({ enabled: true });
  a(WA.quota.add('mid', 'x').reason === 'bad-pool', 'v2710: [3] bad pool refused');
  a(WA.quota.list('mid').reason === 'bad-pool', 'v2710: [3] list bad pool refused');
  a(WA.quota.add('short', '').reason === 'missing-text', 'v2710: [3] missing text refused');
  const q1 = WA.quota.add('short', '旧钥匙');
  a(q1.ok === true && q1.live === 1 && q1.cap === 4, 'v2710: [3] seed added, live 1/4');
  a(WA.quota.add('short', '旧钥匙').reason === 'dup-text', 'v2710: [3] duplicate text refused');
  WA.quota.setSettings({ shortCap: 2 });
  WA.quota.add('short', '第二颗');
  a(WA.quota.add('short', '第三颗').reason === 'pool-full', 'v2710: [3] pool cap enforced, no silent eviction');
  WA.quota.setSettings({ shortCap: 4, shortAge: 5 });
  for (let i = 0; i < 5; i++) WA.quota.tick();
  const l1 = WA.quota.list('short');
  a(l1.rows.every(function (r) { return r.status === 'expired'; }), 'v2710: [3] tick flips to expired at age limit');
  a(l1.count === 2, 'v2710: [3] expired still occupies pool (explicit release only)');
  const qid = WA.quota.list('short').rows[0].id;
  a(WA.quota.resolve(qid).ok === true, 'v2710: [3] resolve is explicit');
  a(WA.quota.resolve(qid).reason === 'already-terminal', 'v2710: [3] re-resolve refused');
  a(WA.quota.drop(qid).reason === 'already-terminal', 'v2710: [3] drop after resolve refused');
  a(WA.quota.resolve('seed_missing').reason === 'missing', 'v2710: [3] missing seed refused');
  a(WA.quota.buildBlock().indexOf('[伏笔配给]') === 0, 'v2710: [3] quota buildBlock valid');
  // ---- 4 spotlight ----
  const spOff = WA.spotlight.note('甲');
  a(spOff.ok === true && spOff.reason === 'disabled', 'v2710: [4] disabled spotlight says so');
  a(WA.spotlight.buildBlock() === '', 'v2710: [4] disabled spotlight injects nothing');
  a(WA.spotlight.seal().reason === 'disabled', 'v2710: [4] disabled seal says so');
  WA.spotlight.setSettings({ enabled: true });
  a(WA.spotlight.note('').reason === 'bad-who', 'v2710: [4] bad-who refused');
  const n1 = WA.spotlight.note('甲');
  a(n1.ok === true && n1.already === false && n1.pending === 1, 'v2710: [4] first note accepted');
  const n2 = WA.spotlight.note('甲');
  a(n2.ok === true && n2.already === true && n2.pending === 1, 'v2710: [4] duplicate note idempotent');
  WA.spotlight.setSettings({ maxRows: 8 });
  for (let i = 0; i < 7; i++) WA.spotlight.note('p' + i);
  a(WA.spotlight.note('extra').reason === 'pending-full', 'v2710: [4] pending cap enforced');
  WA.spotlight.setSettings({ maxRows: 32 });
  const s1 = WA.spotlight.seal();
  a(s1.ok === true && s1.round.length === 8 && s1.round[0] === '甲' && s1.total === 8, 'v2710: [4] seal records the round');
  a(WA.spotlight.seal().reason === 'empty-round', 'v2710: [4] empty round refused');
  WA.spotlight.note('甲');
  WA.spotlight.seal();
  const rep = WA.spotlight.report();
  a(rep.ok === true && rep.rows.length === 8, 'v2710: [4] report only registered names');
  const jia = rep.rows.filter(function (r) { return r.who === '甲'; })[0];
  const p0 = rep.rows.filter(function (r) { return r.who === 'p0'; })[0];
  a(jia.seen === 2 && jia.streak === 2 && p0.seen === 1 && p0.missed === 1 && p0.streak === 0, 'v2710: [4] seen/streak/missed tracked correctly');
  const idleRows = WA.spotlight.idle(1);
  a(idleRows.ok === true && idleRows.rows.length === 7, 'v2710: [4] idle lists only absent names');
  a(WA.spotlight.report().rows.filter(function (r) { return r.who === '丙'; }).length === 0, 'v2710: [4] never-seen names absent from reads');
  a(WA.spotlight.buildBlock().indexOf('[焦点分配]') === 0, 'v2710: [4] spotlight buildBlock valid');
  // ---- 5 gauge.history fix (v2.70.0 legacy) ----
  WA.gauge.setSettings({ enabled: true });
  WA.gauge.create('遗留检查');
  for (let i = 0; i < 12; i++) WA.gauge.step('遗留检查', 1, 'ev' + i);
  a(WA.gauge.read('遗留检查').historyCount === 8, 'v2710: [5] gauge.history capped at 8 (legacy fix)');
  const es = WA.evict.evictStat();
  a(es.evictFailed === 0 && es.failedBy['unknown-site'] === undefined, 'v2710: [5] no unknown-site failures from gauge.history');
  console.log('  ok v2710: enigma / tempo / quota / spotlight / gauge.history');
}
function probeEgGate(WA) { resetWorld(WA); return WA.enigma.mark('s', 'a').reason; }
function probeEgDup(WA) { resetWorld(WA); WA.enigma.setSettings({ enabled: true }); WA.enigma.mark('s', 'a'); return WA.enigma.mark('s', 'a').reason; }
function probeEgKnowers(WA) { resetWorld(WA); WA.enigma.setSettings({ enabled: true, maxKnowers: 1 }); WA.enigma.mark('s', 'a'); return WA.enigma.mark('s', 'b').reason; }
function probeEgRows(WA) { resetWorld(WA); WA.enigma.setSettings({ enabled: true, maxRows: 4 }); WA.enigma.mark('s1', 'a'); WA.enigma.mark('s2', 'a'); WA.enigma.mark('s3', 'a'); WA.enigma.mark('s4', 'a'); return WA.enigma.mark('s5', 'a').reason; }
function probeTpGear(WA) { resetWorld(WA); WA.tempo.setSettings({ enabled: true }); return WA.tempo.setGear('rapido').reason; }
function probeTpSame(WA) { resetWorld(WA); WA.tempo.setSettings({ enabled: true }); return WA.tempo.setGear('andante').reason; }
function probeTpMiss(WA) { resetWorld(WA); WA.tempo.setSettings({ enabled: true }); return WA.tempo.check().reason; }
function probeTpFrozen(WA) { resetWorld(WA); WA.tempo.setSettings({ enabled: true }); return WA.tempo.check(0).reason; }
function probeTpOver(WA) { resetWorld(WA); WA.tempo.setSettings({ enabled: true }); return WA.tempo.check(99999).reason; }
function probeQtGate(WA) { resetWorld(WA); return WA.quota.add('short', 'x').reason; }
function probeQtPool(WA) { resetWorld(WA); WA.quota.setSettings({ enabled: true }); return WA.quota.add('mid', 'x').reason; }
function probeQtText(WA) { resetWorld(WA); WA.quota.setSettings({ enabled: true }); return WA.quota.add('short', '').reason; }
function probeQtFull(WA) { resetWorld(WA); WA.quota.setSettings({ enabled: true, shortCap: 1 }); WA.quota.add('short', 'a'); return WA.quota.add('short', 'b').reason; }
function probeQtTerm(WA) { resetWorld(WA); WA.quota.setSettings({ enabled: true }); const r = WA.quota.add('short', 'a'); WA.quota.resolve(r.id); return WA.quota.resolve(r.id).reason; }
function probeQtDup(WA) { resetWorld(WA); WA.quota.setSettings({ enabled: true }); WA.quota.add('short', 'a'); return WA.quota.add('short', 'a').reason; }
function probeSlGate(WA) { resetWorld(WA); return WA.spotlight.note('a').reason; }
function probeSlWho(WA) { resetWorld(WA); WA.spotlight.setSettings({ enabled: true }); return WA.spotlight.note('').reason; }
function probeSlPend(WA) { resetWorld(WA); WA.spotlight.setSettings({ enabled: true, maxRows: 8 }); for (let i = 0; i < 8; i++) WA.spotlight.note('p' + i); return WA.spotlight.note('extra').reason; }
function probeSlEmpty(WA) { resetWorld(WA); WA.spotlight.setSettings({ enabled: true }); return WA.spotlight.seal().reason; }
function probeGgHist(WA) {
  resetWorld(WA);
  WA.gauge.setSettings({ enabled: true });
  WA.gauge.create('H');
  for (let i = 0; i < 12; i++) WA.gauge.step('H', 1, 'e' + i);
  return String(WA.gauge.read('H').historyCount);
}
function kill(src) {
  if (src.indexOf('if (') !== 0) throw new Error('kill shape ' + src.slice(0, 24));
  let depth = 0, closeAt = -1;
  for (let i = src.indexOf('('); i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { closeAt = i; break; } }
  }
  if (closeAt < 0) throw new Error('kill unbalanced ' + src.slice(0, 40));
  return 'if (false) ' + src.slice(closeAt + 1);
}
const BROKEN = [
  { key: 'eg-gate', rel: 'engines/enigma.js', from: A_EG_GATE, to: kill(A_EG_GATE), hits: 3 },
  { key: 'eg-dup', rel: 'engines/enigma.js', from: A_EG_DUP, to: kill(A_EG_DUP) },
  { key: 'eg-knowers', rel: 'engines/enigma.js', from: A_EG_KNOWERS, to: kill(A_EG_KNOWERS) },
  { key: 'eg-rows', rel: 'engines/enigma.js', from: A_EG_ROWS, to: kill(A_EG_ROWS) },
  { key: 'tp-gear', rel: 'engines/tempo.js', from: A_TP_GEAR, to: kill(A_TP_GEAR) },
  { key: 'tp-samegear', rel: 'engines/tempo.js', from: A_TP_SAMEGEAR, to: kill(A_TP_SAMEGEAR) },
  { key: 'tp-missingspan', rel: 'engines/tempo.js', from: A_TP_MISSINGSPAN, to: kill(A_TP_MISSINGSPAN) },
  { key: 'tp-frozen', rel: 'engines/tempo.js', from: A_TP_FROZEN, to: kill(A_TP_FROZEN) },
  { key: 'tp-overpace', rel: 'engines/tempo.js', from: A_TP_OVERPACE, to: kill(A_TP_OVERPACE) },
  { key: 'qt-gate', rel: 'engines/quota.js', from: A_QT_GATE, to: kill(A_QT_GATE), hits: 3 },
  { key: 'qt-badpool', rel: 'engines/quota.js', from: A_QT_BADPOOL, to: kill(A_QT_BADPOOL), hits: 2 },
  { key: 'qt-missingtext', rel: 'engines/quota.js', from: A_QT_MISSINGTEXT, to: kill(A_QT_MISSINGTEXT) },
  { key: 'qt-poolfull', rel: 'engines/quota.js', from: A_QT_POOLFULL, to: kill(A_QT_POOLFULL) },
  { key: 'qt-terminal', rel: 'engines/quota.js', from: A_QT_TERMINAL, to: kill(A_QT_TERMINAL) },
  { key: 'qt-duptext', rel: 'engines/quota.js', from: A_QT_DUPTEXT, to: kill(A_QT_DUPTEXT) },
  { key: 'sl-gate', rel: 'engines/spotlight.js', from: A_SL_GATE, to: kill(A_SL_GATE), hits: 2 },
  { key: 'sl-badwho', rel: 'engines/spotlight.js', from: A_SL_BADWHO, to: kill(A_SL_BADWHO) },
  { key: 'sl-pendfull', rel: 'engines/spotlight.js', from: A_SL_PENDFULL, to: kill(A_SL_PENDFULL) },
  { key: 'sl-empty', rel: 'engines/spotlight.js', from: A_SL_EMPTY, to: kill(A_SL_EMPTY) },
  { key: 'gg-hist', rel: 'engines/gauge.js', from: A_GG_HIST, to: A_GG_HIST.replace("'gauge.history'", '8') }
];
function expectHits(spec) { return spec.hits == null ? 1 : spec.hits; }
function anchorHits(spec) {
  return fs.readFileSync(path.join(BASE, spec.rel), 'utf8').split(spec.from).length - 1;
}
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== expectHits(spec)) throw new Error('anchor hits ' + hits + ' != ' + expectHits(spec) + ' :: ' + spec.key);
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
function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === expectHits(s), 'v2710: [N0] anchor hits declared count (' + expectHits(s) + ') :: ' + s.key); });
  a(probeWith(BROKEN[0], probeEgGate) !== 'disabled', 'v2710: [N1] enigma gate removed');
  a(probeWith(BROKEN[1], probeEgDup) !== 'exists', 'v2710: [N1] duplicate knower accepted when guard removed');
  a(probeWith(BROKEN[2], probeEgKnowers) !== 'knowers-full', 'v2710: [N1] knowers cap bypassed');
  a(probeWith(BROKEN[3], probeEgRows) !== 'rows-full', 'v2710: [N1] rows cap bypassed');
  a(probeWith(BROKEN[4], probeTpGear) !== 'bad-gear', 'v2710: [N1] bad gear accepted');
  a(probeWith(BROKEN[5], probeTpSame) !== 'same-gear', 'v2710: [N1] same gear accepted');
  a(probeWith(BROKEN[6], probeTpMiss) !== 'missing-span', 'v2710: [N1] missing span accepted');
  a(probeWith(BROKEN[7], probeTpFrozen) !== 'frozen', 'v2710: [N1] zero span accepted');
  a(probeWith(BROKEN[8], probeTpOver) !== 'over-pace', 'v2710: [N1] over-pace accepted');
  a(probeWith(BROKEN[9], probeQtGate) !== 'disabled', 'v2710: [N1] quota gate removed');
  a(probeWith(BROKEN[10], probeQtPool) !== 'bad-pool', 'v2710: [N1] bad pool accepted');
  a(probeWith(BROKEN[11], probeQtText) !== 'missing-text', 'v2710: [N1] missing text accepted');
  a(probeWith(BROKEN[12], probeQtFull) !== 'pool-full', 'v2710: [N1] pool cap bypassed');
  a(probeWith(BROKEN[13], probeQtTerm) !== 'already-terminal', 'v2710: [N1] terminal re-close accepted');
  a(probeWith(BROKEN[14], probeQtDup) !== 'dup-text', 'v2710: [N1] duplicate text accepted');
  a(probeWith(BROKEN[15], probeSlGate) !== 'disabled', 'v2710: [N1] spotlight gate removed');
  a(probeWith(BROKEN[16], probeSlWho) !== 'bad-who', 'v2710: [N1] bad who accepted');
  a(probeWith(BROKEN[17], probeSlPend) !== 'pending-full', 'v2710: [N1] pending cap bypassed');
  a(probeWith(BROKEN[18], probeSlEmpty) !== 'empty-round', 'v2710: [N1] empty round accepted');
  a(probeWith(BROKEN[19], probeGgHist) !== '8', 'v2710: [N1] gauge.history uncapped when site name broken');
  a(probeClean(probeEgGate) === 'disabled', 'v2710: [N2] clean refuses disabled enigma');
  a(probeClean(probeEgDup) === 'exists', 'v2710: [N2] clean refuses duplicate knower');
  a(probeClean(probeEgKnowers) === 'knowers-full', 'v2710: [N2] clean refuses knowers cap');
  a(probeClean(probeEgRows) === 'rows-full', 'v2710: [N2] clean refuses rows cap');
  a(probeClean(probeTpGear) === 'bad-gear', 'v2710: [N2] clean refuses bad gear');
  a(probeClean(probeTpSame) === 'same-gear', 'v2710: [N2] clean refuses same gear');
  a(probeClean(probeTpMiss) === 'missing-span', 'v2710: [N2] clean refuses missing span');
  a(probeClean(probeTpFrozen) === 'frozen', 'v2710: [N2] clean refuses zero span');
  a(probeClean(probeTpOver) === 'over-pace', 'v2710: [N2] clean refuses over pace');
  a(probeClean(probeQtGate) === 'disabled', 'v2710: [N2] clean refuses disabled quota');
  a(probeClean(probeQtPool) === 'bad-pool', 'v2710: [N2] clean refuses bad pool');
  a(probeClean(probeQtText) === 'missing-text', 'v2710: [N2] clean refuses missing text');
  a(probeClean(probeQtFull) === 'pool-full', 'v2710: [N2] clean refuses pool full');
  a(probeClean(probeQtTerm) === 'already-terminal', 'v2710: [N2] clean refuses terminal re-close');
  a(probeClean(probeQtDup) === 'dup-text', 'v2710: [N2] clean refuses duplicate text');
  a(probeClean(probeSlGate) === 'disabled', 'v2710: [N2] clean refuses disabled spotlight');
  a(probeClean(probeSlWho) === 'bad-who', 'v2710: [N2] clean refuses bad who');
  a(probeClean(probeSlPend) === 'pending-full', 'v2710: [N2] clean refuses pending full');
  a(probeClean(probeSlEmpty) === 'empty-round', 'v2710: [N2] clean refuses empty round');
  a(probeClean(probeGgHist) === '8', 'v2710: [N2] clean caps gauge.history at 8');
  // N3 跨模块隔离
  a(probeWith(BROKEN[0], probeTpGear) === 'bad-gear', 'v2710: [N3] enigma break does not touch tempo');
  a(probeWith(BROKEN[4], probeQtPool) === 'bad-pool', 'v2710: [N3] tempo break does not touch quota');
  a(probeWith(BROKEN[9], probeSlWho) === 'bad-who', 'v2710: [N3] quota break does not touch spotlight');
  a(probeWith(BROKEN[15], probeEgGate) === 'disabled', 'v2710: [N3] spotlight break does not touch enigma');
  // N4 状态真实变更
  const chg = isolated(function () {
    const WA = fresh();
    resetWorld(WA);
    WA.quota.setSettings({ enabled: true });
    WA.quota.add('long', '暗线');
    WA.quota.tick();
    const l = WA.quota.list('long');
    return { count: st(WA).quota.rows.length, age: l.rows[0].age, status: l.rows[0].status };
  });
  a(chg.count === 1 && chg.age === 1 && chg.status === 'active', 'v2710: [N4] state really changed');
  // N5 sentinel 未泄漏
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2710: [N5] sentinel did not leak');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2710: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2710: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative };
