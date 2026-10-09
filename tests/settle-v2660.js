#!/usr/bin/env node
// WorldAxis tests/settle-v2660.js -- field-module lock (v2.66.0)
//
// What it pins (all negative):
//   affect: disabled channel is distinguishable; emotion words never enter any exit;
//           open x closed never intersect; fallback must be a registered open action;
//           overload collapses open to the fallback and keeps closed intact.
//   bonds:  types outside the six-type table reject the whole write; self-pair refused;
//           A×B and B×A are one row; disabled read says so, never guesses.
//   masks:  face and tell must both be present AND differ; identical is refused;
//           drop is explicit.
// Anchors each occur exactly once in real source. Negative control mutates a memory copy only.
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2660_';
const A_AFFECT_GATE = "if (!settings().enabled) return { ok: true, person: who, open: [], closed: [], fallback: '', reason: 'disabled' };";
const A_WORD = "if (word) { noteFault('emotion-word'); return { ok: false, reason: 'emotion-word', word: word }; }";
const A_OVERLAP = "if (overlap.length) { noteFault('overlap'); return { ok: false, reason: 'overlap', actions: overlap }; }";
const A_FALLBACK = "if (open.indexOf(fallback) < 0) { noteFault('bad-fallback'); return { ok: false, reason: 'bad-fallback', fallback: fallback }; }";
const A_LOAD = "if (bad.length) { noteFault('bad-load'); return { ok: false, reason: 'bad-load', fields: bad }; }";
const A_BONDS_GATE = "if (!settings().enabled) return { ok: true, pair: pairKey(x, y), types: [], reason: 'disabled' };";
const A_TYPE = "if (bad.length) { noteFault('bad-type'); return { ok: false, reason: 'bad-type', types: bad }; }";
const A_SAME = "if (x === y) { noteFault('same-person'); return { ok: false, reason: 'same-person', person: x }; }";
const A_MASKS_GATE = "if (!settings().enabled) return { ok: true, person: who, face: '', tell: '', reason: 'disabled' };";
const A_IDENT = "if (face === tell) { noteFault('identical'); return { ok: false, reason: 'identical', person: who }; }";
const A_MASKFIELD = "if (!face || !tell) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }";
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function st(WA) { return WA.store.get() || {}; }
function affectRows(WA) { const a = st(WA).affect; return (a && Array.isArray(a.channels)) ? a.channels : []; }
function bondRows(WA) { const b = st(WA).bonds; return (b && Array.isArray(b.rows)) ? b.rows : []; }
function maskRows(WA) { const m = st(WA).masks; return (m && Array.isArray(m.rows)) ? m.rows : []; }
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
    d.affect = { channels: [], loads: {} };
    d.bonds = { rows: [] };
    d.masks = { rows: [] };
    d.people = {};
    d.clock = { dayIndex: 10 };
  }, TAG + 'reset');
}
function judge(a) {
  const WA = fresh();
  a(!!WA.affect && typeof WA.affect.setChannel === 'function', 'v2660/field: affect loaded');
  a(!!WA.bonds && typeof WA.bonds.setBond === 'function', 'v2660/field: bonds loaded');
  a(!!WA.masks && typeof WA.masks.setMask === 'function', 'v2660/field: masks loaded');
  resetWorld(WA);
  // 1 affect: disabled is distinguishable, writes nothing
  const before = JSON.stringify(st(WA).affect);
  const off = WA.affect.channel('Aning');
  a(off.ok === true && off.reason === 'disabled' && off.open.length === 0, 'v2660/field: [1] disabled channel says so (got ' + JSON.stringify(off) + ')');
  a(WA.affect.buildBlock() === '', 'v2660/field: [1] disabled affect injects nothing');
  // 2 emotion words never enter any exit
  WA.affect.setSettings({ enabled: true });
  const word = WA.affect.setChannel('Aning', { open: ['愤怒'], closed: ['赔笑'], fallback: '愤怒' });
  a(word.ok === false && word.reason === 'emotion-word', 'v2660/field: [2] emotion word refuses the whole write (got ' + JSON.stringify(word) + ')');
  a(affectRows(WA).length === 0, 'v2660/field: [2] refused write keeps nothing');
  // 3 overlap refused
  const ov = WA.affect.setChannel('Aning', { open: ['拂袖而去'], closed: ['拂袖而去'], fallback: '拂袖而去' });
  a(ov.ok === false && ov.reason === 'overlap', 'v2660/field: [3] open x closed intersection refused');
  // 4 bad fallback refused
  const bf = WA.affect.setChannel('Aning', { open: ['拂袖而去'], closed: ['赔笑'], fallback: '摔门' });
  a(bf.ok === false && bf.reason === 'bad-fallback', 'v2660/field: [4] fallback outside open is refused');
  // 5 valid set + overload collapse
  const ok = WA.affect.setChannel('Aning', { open: ['拂袖而去', '摔门'], closed: ['赔笑'], fallback: '拂袖而去' });
  a(ok.ok === true && affectRows(WA).length === 1, 'v2660/field: [5] valid channel lands one row (got ' + JSON.stringify(ok) + ')');
  const up = WA.affect.setChannel('Aning', { open: ['拂袖而去', '摔门'], closed: ['赔笑'], fallback: '拂袖而去' });
  a(up.ok === true && up.existed === true && affectRows(WA).length === 1, 'v2660/field: [5] same person updates, does not add');
  const ld = WA.affect.setLoad('Aning', { fatigue: 2, hunger: 2, pain: 1, social: 1 });
  a(ld.ok === true, 'v2660/field: [5] loads land');
  const ch = WA.affect.channel('Aning');
  a(ch.overloaded === true && ch.reason === 'overloaded' && ch.open.length === 1 && ch.open[0] === '拂袖而去' && ch.closed.length === 1,
    'v2660/field: [5] overload collapses open to fallback, keeps closed (got ' + JSON.stringify(ch) + ')');
  a(WA.affect.setLoad('Aning', { fatigue: -1 }).reason === 'bad-load', 'v2660/field: [5] out-of-range load refuses the whole write');
  const blk = WA.affect.buildBlock();
  a(blk.indexOf('[情绪通道]') === 0 && blk.indexOf('不是情绪词') >= 0, 'v2660/field: [5] inject names the rule');
  // 6 bonds
  const bOff = WA.bonds.read('Aning', 'Bing');
  a(bOff.ok === true && bOff.reason === 'disabled', 'v2660/field: [6] disabled read says so (got ' + JSON.stringify(bOff) + ')');
  resetWorld(WA);
  WA.bonds.setSettings({ enabled: true });
  const bBad = WA.bonds.setBond('Aning', 'Bing', ['替身', '血亲']);
  a(bBad.ok === false && bBad.reason === 'bad-type' && bondRows(WA).length === 0, 'v2660/field: [6] type outside the table refuses the whole write (got ' + JSON.stringify(bBad) + ')');
  const bSelf = WA.bonds.setBond('Aning', 'Aning', ['替身']);
  a(bSelf.ok === false && bSelf.reason === 'same-person', 'v2660/field: [6] self-pair refused');
  const bOk = WA.bonds.setBond('Aning', 'Bing', ['替身', '利益同盟']);
  a(bOk.ok === true && bondRows(WA).length === 1, 'v2660/field: [6] valid bond lands one row');
  const bRev = WA.bonds.setBond('Bing', 'Aning', ['对手共生']);
  a(bRev.ok === true && bRev.existed === true && bondRows(WA).length === 1, 'v2660/field: [6] A×B and B×A are one row (got ' + JSON.stringify(bRev) + ')');
  a(bondRows(WA)[0].types.join(',') === '对手共生', 'v2660/field: [6] update replaces, does not append');
  a(WA.bonds.buildBlock().indexOf('[关系六型]') === 0, 'v2660/field: [6] inject names the table');
  a(WA.bonds.buildBlock().indexOf('血仇') >= 0, 'v2660/field: [6] inject states orthogonality with feuds');
  // 7 masks
  const mOff = WA.masks.read('Aning');
  a(mOff.ok === true && mOff.reason === 'disabled', 'v2660/field: [7] disabled read says so (got ' + JSON.stringify(mOff) + ')');
  WA.masks.setSettings({ enabled: true });
  const mHalf = WA.masks.setMask('Aning', { face: '冷淡自持' });
  a(mHalf.ok === false && mHalf.reason === 'missing-fields' && maskRows(WA).length === 0, 'v2660/field: [7] half a mask is refused');
  const mSame = WA.masks.setMask('Aning', { face: '冷淡自持', tell: '冷淡自持' });
  a(mSame.ok === false && mSame.reason === 'identical', 'v2660/field: [7] face == tell is not a mask');
  const mOk = WA.masks.setMask('Aning', { face: '冷淡自持', tell: '替他收好每件旧物' });
  a(mOk.ok === true && maskRows(WA).length === 1, 'v2660/field: [7] valid mask lands one row');
  const mRead = WA.masks.read('Aning');
  a(mRead.ok === true && mRead.face === '冷淡自持' && mRead.tell === '替他收好每件旧物', 'v2660/field: [7] read returns both halves');
  a(WA.masks.dropMask('Nobody').reason === 'missing', 'v2660/field: [7] dropping a missing mask says so');
  a(WA.masks.dropMask('Aning').ok === true && maskRows(WA).length === 0, 'v2660/field: [7] drop is explicit and complete');
  a(WA.masks.buildBlock() === '', 'v2660/field: [7] empty masks inject nothing');
  console.log('  ok v2660/field: affect / bonds / masks');
}
function probeAffectGate(WA) { resetWorld(WA); return WA.affect.channel('Aning').reason; }
function probeWord(WA) { resetWorld(WA); WA.affect.setSettings({ enabled: true }); return WA.affect.setChannel('Aning', { open: ['愤怒'], closed: ['赔笑'], fallback: '愤怒' }).ok; }
function probeOverlap(WA) { resetWorld(WA); WA.affect.setSettings({ enabled: true }); return WA.affect.setChannel('Aning', { open: ['拂袖而去'], closed: ['拂袖而去'], fallback: '拂袖而去' }).ok; }
function probeFallback(WA) { resetWorld(WA); WA.affect.setSettings({ enabled: true }); return WA.affect.setChannel('Aning', { open: ['拂袖而去'], closed: ['赔笑'], fallback: '摔门' }).ok; }
function probeLoad(WA) { resetWorld(WA); WA.affect.setSettings({ enabled: true }); return WA.affect.setLoad('Aning', { fatigue: -1 }).reason; }
function probeBondsGate(WA) { resetWorld(WA); return WA.bonds.read('Aning', 'Bing').reason; }
function probeType(WA) { resetWorld(WA); WA.bonds.setSettings({ enabled: true }); return WA.bonds.setBond('Aning', 'Bing', ['血亲']).ok; }
function probeSame(WA) { resetWorld(WA); WA.bonds.setSettings({ enabled: true }); return WA.bonds.setBond('Aning', 'Aning', ['替身']).ok; }
function probeMasksGate(WA) { resetWorld(WA); return WA.masks.read('Aning').reason; }
function probeIdent(WA) { resetWorld(WA); WA.masks.setSettings({ enabled: true }); return WA.masks.setMask('Aning', { face: '同', tell: '同' }).ok; }
function probeMaskField(WA) { resetWorld(WA); WA.masks.setSettings({ enabled: true }); return WA.masks.setMask('Aning', { face: '冷淡自持' }).reason; }
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
  { key: 'affect-gate', rel: 'engines/affect.js', from: A_AFFECT_GATE, to: kill(A_AFFECT_GATE) },
  { key: 'word', rel: 'engines/affect.js', from: A_WORD, to: kill(A_WORD) },
  { key: 'overlap', rel: 'engines/affect.js', from: A_OVERLAP, to: kill(A_OVERLAP) },
  { key: 'fallback', rel: 'engines/affect.js', from: A_FALLBACK, to: kill(A_FALLBACK) },
  { key: 'load', rel: 'engines/affect.js', from: A_LOAD, to: kill(A_LOAD) },
  { key: 'bonds-gate', rel: 'engines/bonds.js', from: A_BONDS_GATE, to: kill(A_BONDS_GATE) },
  { key: 'type', rel: 'engines/bonds.js', from: A_TYPE, to: kill(A_TYPE) },
  { key: 'same', rel: 'engines/bonds.js', from: A_SAME, to: kill(A_SAME) },
  { key: 'masks-gate', rel: 'engines/masks.js', from: A_MASKS_GATE, to: kill(A_MASKS_GATE) },
  { key: 'ident', rel: 'engines/masks.js', from: A_IDENT, to: kill(A_IDENT) },
  { key: 'maskfield', rel: 'engines/masks.js', from: A_MASKFIELD, to: kill(A_MASKFIELD) }
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
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2660/field: [N0] anchor hits exactly once :: ' + s.key); });
  a(probeWith(BROKEN[0], probeAffectGate) !== 'disabled', 'v2660/field: [N1] affect gate removed');
  a(probeWith(BROKEN[1], probeWord) === true, 'v2660/field: [N1] emotion word accepted when guard removed');
  a(probeWith(BROKEN[2], probeOverlap) === true, 'v2660/field: [N1] overlap accepted when guard removed');
  a(probeWith(BROKEN[3], probeFallback) === true, 'v2660/field: [N1] bad fallback accepted when guard removed');
  a(probeWith(BROKEN[4], probeLoad) !== 'bad-load', 'v2660/field: [N1] load guard removed');
  a(probeWith(BROKEN[5], probeBondsGate) !== 'disabled', 'v2660/field: [N1] bonds gate removed');
  a(probeWith(BROKEN[6], probeType) === true, 'v2660/field: [N1] bad type accepted when guard removed');
  a(probeWith(BROKEN[7], probeSame) === true, 'v2660/field: [N1] self-pair accepted when guard removed');
  a(probeWith(BROKEN[8], probeMasksGate) !== 'disabled', 'v2660/field: [N1] masks gate removed');
  a(probeWith(BROKEN[9], probeIdent) === true, 'v2660/field: [N1] identical accepted when guard removed');
  a(probeWith(BROKEN[10], probeMaskField) !== 'missing-fields', 'v2660/field: [N1] half-mask accepted when guard removed');
  a(probeClean(probeAffectGate) === 'disabled', 'v2660/field: [N2] original refuses a disabled channel');
  a(probeClean(probeWord) === false, 'v2660/field: [N2] original refuses emotion words');
  a(probeClean(probeOverlap) === false, 'v2660/field: [N2] original refuses overlap');
  a(probeClean(probeFallback) === false, 'v2660/field: [N2] original refuses bad fallback');
  a(probeClean(probeLoad) === 'bad-load', 'v2660/field: [N2] original refuses bad loads');
  a(probeClean(probeBondsGate) === 'disabled', 'v2660/field: [N2] original: disabled bonds read says so');
  a(probeClean(probeType) === false, 'v2660/field: [N2] original refuses types outside the table');
  a(probeClean(probeSame) === false, 'v2660/field: [N2] original refuses self-pairs');
  a(probeClean(probeMasksGate) === 'disabled', 'v2660/field: [N2] original: disabled masks read says so');
  a(probeClean(probeIdent) === false, 'v2660/field: [N2] original refuses identical halves');
  a(probeClean(probeMaskField) === 'missing-fields', 'v2660/field: [N2] original refuses half a mask');
  a(probeWith(BROKEN[0], probeBondsGate) === 'disabled', 'v2660/field: [N3] affect break does not touch bonds');
  a(probeWith(BROKEN[5], probeAffectGate) === 'disabled', 'v2660/field: [N3] bonds break does not touch affect');
  a(probeWith(BROKEN[8], probeWord) === false, 'v2660/field: [N3] masks break does not touch affect');
  const chg = isolated(function () {
    const WA = fresh();
    resetWorld(WA);
    WA.affect.setSettings({ enabled: true });
    WA.affect.setChannel('Aning', { open: ['拂袖而去'], closed: ['赔笑'], fallback: '拂袖而去' });
    const n0 = affectRows(WA).length;
    return { n0: n0, open: WA.affect.channel('Aning').open[0] };
  });
  a(chg.n0 === 1 && chg.open === '拂袖而去', 'v2660/field: [N4] state really changed');
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2660/field: [N5] sentinel did not leak (' + (leak.join(',') || 'none') + ')');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2660: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2660: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative };