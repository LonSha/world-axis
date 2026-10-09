#!/usr/bin/env node
// WorldAxis tests/settle-v2690.js -- presentation-contract lock (v2.69.0)
//
// What it pins (all negative):
//   appearance:  off-gate distinguishable; tier whitelist S/A/B/C; coverage required
//                per tier; C max 1 sub-item; duplicate register refused (rescan to update);
//                lover/family/rival bump one tier (and demand the bumped coverage);
//                form whitelist humanoid/half/true; scene exclusivity (eye-face / outfit
//                clash refused).
//   ladder:      off-gate distinguishable; define needs >=2 unique rungs; duplicate define
//                refused (drop to redefine); escalate REQUIRES an event (missing-event);
//                escalate only one rung at a time (no jump); top/bottom refused; drop then
//                read says missing.
// Anchors each occur exactly once in real source. Negative control mutates a memory copy only.
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2690_';

const A_AP_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_AP_TIER = "if (TIERS.indexOf(tier) < 0) { noteFault('bad-tier'); return { ok: false, reason: 'bad-tier', got: tier }; }";
const A_AP_C = "if (effTier === 'C' && total > C_MAX_COVERAGE) { out = { ok: false, reason: 'too-many-coverage', who: w }; return false; }";
const A_AP_EXISTS = "if (prev && o.mode !== 'rescan') { out = { ok: false, reason: 'exists', who: w }; return false; }";
const A_AP_FORM = "if (o.form != null && FORMS.indexOf(o.form) < 0) { out = { ok: false, reason: 'bad-form', got: o.form }; return false; }";
const A_AP_EYEFACE = "if (clashEyeFace) { out = { ok: false, reason: 'eye-face-clash', who: w, scene: scene }; return false; }";
const A_AP_OUTFIT = "if (clashOutfit) { out = { ok: false, reason: 'outfit-clash', who: w, scene: scene }; return false; }";
const A_LD_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_LD_RUNGS = "if (list.length < 2) { noteFault('bad-rungs'); return { ok: false, reason: 'bad-rungs', got: list.length }; }";
const A_LD_DUP = "if (draft.ladder.rows.filter(function (r) { return r && r.key === key; })[0]) { out = { ok: false, reason: 'exists', who: w, kind: k }; return false; }";
const A_LD_EVENT = "if (!ev) { out = { ok: false, reason: 'missing-event', who: w, kind: k }; return false; }";
const A_LD_TOP = "if (hit.idx >= hit.rungs.length - 1) { out = { ok: false, reason: 'top', who: w, kind: k, rung: hit.rungs[hit.idx] }; return false; }";

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function st(WA) { return WA.store.get() || {}; }
function resetWorld(WA) {
  WA.store.transact(function (d) {
    d.appearance = { rows: [] };
    d.ladder = { rows: [] };
    d.people = {};
    d.clock = { dayIndex: 100 };
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
  a(!!WA.appearance && typeof WA.appearance.register === 'function', 'v2690: appearance loaded');
  a(!!WA.ladder && typeof WA.ladder.define === 'function', 'v2690: ladder loaded');
  resetWorld(WA);
  // ---- 1 appearance ----
  const aOff = WA.appearance.register('阿宁', 'B', { cover: { L1: 4, L2: 3, L3: 3, L4: 2 } });
  a(aOff.ok === true && aOff.reason === 'disabled', 'v2690: [1] disabled appearance says so (got ' + JSON.stringify(aOff) + ')');
  a(WA.appearance.buildBlock() === '', 'v2690: [1] disabled appearance injects nothing');
  WA.appearance.setSettings({ enabled: true });
  a(WA.appearance.register('阿宁', 'X', {}).reason === 'bad-tier', 'v2690: [1] unknown tier refused');
  a(WA.appearance.register('', 'B', {}).reason === 'missing-fields', 'v2690: [1] appearance needs a name');
  a(WA.appearance.register('阿宁', 'B', { cover: { L1: 2, L2: 1, L3: 1, L4: 1 } }).reason === 'missing-coverage', 'v2690: [1] B needs full coverage');
  a(WA.appearance.register('路人甲', 'C', { cover: { L1: 2 } }).reason === 'too-many-coverage', 'v2690: [1] C max 1 sub-item');
  const rB = WA.appearance.register('阿宁', 'B', { cover: { L1: 4, L2: 3, L3: 3, L4: 2 } });
  a(rB.ok === true && rB.tier === 'B', 'v2690: [1] B lands (got ' + JSON.stringify(rB) + ')');
  a(WA.appearance.register('阿宁', 'B', { cover: { L1: 4, L2: 3, L3: 3, L4: 2 } }).reason === 'exists', 'v2690: [1] duplicate refused');
  a(WA.appearance.register('阿宁', 'A', { cover: { L1: 10, L2: 5, L3: 4, L4: 3 }, mode: 'rescan' }).ok === true, 'v2690: [1] rescan updates');
  const rW = WA.appearance.register('阿宁', 'B', { cover: { L1: 10, L2: 5, L3: 4, L4: 3 }, weighted: ['lover'], mode: 'rescan' });
  a(rW.tier === 'A', 'v2690: [1] lover bumps B->A (got ' + JSON.stringify(rW) + ')');
  a(WA.appearance.register('妖狐', 'C', { cover: { L1: 1 }, form: 'bogus' }).reason === 'bad-form', 'v2690: [1] bad form refused');
  a(WA.appearance.register('妖狐', 'C', { cover: { L1: 1 }, form: 'true' }).ok === true, 'v2690: [1] true form lands');
  WA.appearance.register('甲', 'C', { cover: { L1: 1 }, scene: '大厅', eye: '丹凤眼', face: '鹅蛋脸' });
  a(WA.appearance.register('乙', 'C', { cover: { L1: 1 }, scene: '大厅', eye: '丹凤眼', face: '鹅蛋脸' }).reason === 'eye-face-clash', 'v2690: [1] eye-face clash refused');
  WA.appearance.register('丙', 'C', { cover: { L1: 1 }, scene: '大厅', outfit: '红衣', style: '华丽' });
  a(WA.appearance.register('丁', 'C', { cover: { L1: 1 }, scene: '大厅', outfit: '红衣', style: '华丽' }).reason === 'outfit-clash', 'v2690: [1] outfit clash refused');
  a(WA.appearance.sceneAssert('大厅').ok === true, 'v2690: [1] sceneAssert clean when unique');
  a(WA.appearance.read('无此人').reason === 'missing', 'v2690: [1] unknown read says missing');
  a(WA.appearance.buildBlock().indexOf('[外貌契约]') === 0, 'v2690: [1] inject names the contract');
  // ---- 2 ladder ----
  const lOff = WA.ladder.define('阿宁', '占有欲', ['轻度警戒', '中度干涉']);
  a(lOff.ok === true && lOff.reason === 'disabled', 'v2690: [2] disabled ladder says so');
  a(WA.ladder.buildBlock() === '', 'v2690: [2] disabled ladder injects nothing');
  WA.ladder.setSettings({ enabled: true });
  a(WA.ladder.define('阿宁', '占有欲', ['仅一档']).reason === 'bad-rungs', 'v2690: [2] needs >=2 rungs');
  a(WA.ladder.define('阿宁', '占有欲', ['a', 'a']).reason === 'dup-rung', 'v2690: [2] rungs must be unique');
  const rD = WA.ladder.define('阿宁', '占有欲', ['轻度警戒', '中度干涉', '重度暴走', '终极崩溃']);
  a(rD.ok === true && rD.rung === '轻度警戒' && rD.idx === 0, 'v2690: [2] define lands (got ' + JSON.stringify(rD) + ')');
  a(WA.ladder.define('阿宁', '占有欲', ['x', 'y']).reason === 'exists', 'v2690: [2] duplicate define refused');
  a(WA.ladder.escalate('阿宁', '占有欲').reason === 'missing-event', 'v2690: [2] escalate needs an event');
  a(WA.ladder.escalate('不存在', '占有欲', '某事').reason === 'missing', 'v2690: [2] escalate unknown says missing');
  const e1 = WA.ladder.escalate('阿宁', '占有欲', '看见对方和别人说笑');
  a(e1.ok === true && e1.from === '轻度警戒' && e1.to === '中度干涉' && e1.idx === 1, 'v2690: [2] escalate one rung (got ' + JSON.stringify(e1) + ')');
  WA.ladder.escalate('阿宁', '占有欲', '翻看手机');
  WA.ladder.escalate('阿宁', '占有欲', '对方说要走');
  a(WA.ladder.escalate('阿宁', '占有欲', '再升级').reason === 'top', 'v2690: [2] escalate at top refused');
  a(WA.ladder.read('阿宁', '占有欲').idx === 3, 'v2690: [2] read current rung');
  const d1 = WA.ladder.deescalate('阿宁', '占有欲');
  a(d1.ok === true && d1.idx === 2 && d1.to === '重度暴走', 'v2690: [2] deescalate one rung (got ' + JSON.stringify(d1) + ')');
  WA.ladder.deescalate('阿宁', '占有欲'); WA.ladder.deescalate('阿宁', '占有欲');
  a(WA.ladder.deescalate('阿宁', '占有欲').reason === 'bottom', 'v2690: [2] deescalate at bottom refused');
  a(WA.ladder.read('阿宁', '占有欲').ahead.length === 4, 'v2690: [2] read ahead full at bottom');
  const dr = WA.ladder.drop('阿宁', '占有欲');
  a(dr.ok === true, 'v2690: [2] drop lands');
  a(WA.ladder.drop('阿宁', '占有欲').reason === 'missing', 'v2690: [2] double drop says missing');
  a(WA.ladder.read('阿宁', '占有欲').reason === 'missing', 'v2690: [2] read after drop says missing');
  WA.ladder.define('阿宁', '占有欲', ['轻度警戒', '中度干涉']);
  WA.ladder.escalate('阿宁', '占有欲', '某事');
  a(WA.ladder.buildBlock().indexOf('[原型阶梯]') === 0, 'v2690: [2] inject names the ladder');
  console.log('  ok v2690: appearance / ladder');
}
function probeApGate(WA) { resetWorld(WA); return WA.appearance.register('阿宁', 'B', {}).reason; }
function probeApTier(WA) { resetWorld(WA); WA.appearance.setSettings({ enabled: true }); return WA.appearance.register('阿宁', 'X', {}).reason; }
function probeApC(WA) { resetWorld(WA); WA.appearance.setSettings({ enabled: true }); return WA.appearance.register('路人', 'C', { cover: { L1: 2 } }).reason; }
function probeApExists(WA) { resetWorld(WA); WA.appearance.setSettings({ enabled: true }); WA.appearance.register('阿宁', 'C', { cover: { L1: 1 } }); return WA.appearance.register('阿宁', 'C', { cover: { L1: 1 } }).reason; }
function probeApForm(WA) { resetWorld(WA); WA.appearance.setSettings({ enabled: true }); return WA.appearance.register('妖', 'C', { cover: { L1: 1 }, form: 'bogus' }).reason; }
function probeApEyeFace(WA) { resetWorld(WA); WA.appearance.setSettings({ enabled: true }); WA.appearance.register('甲', 'C', { cover: { L1: 1 }, scene: '厅', eye: 'E', face: 'F' }); return WA.appearance.register('乙', 'C', { cover: { L1: 1 }, scene: '厅', eye: 'E', face: 'F' }).reason; }
function probeApOutfit(WA) { resetWorld(WA); WA.appearance.setSettings({ enabled: true }); WA.appearance.register('丙', 'C', { cover: { L1: 1 }, scene: '厅', outfit: '红', style: '华丽' }); return WA.appearance.register('丁', 'C', { cover: { L1: 1 }, scene: '厅', outfit: '红', style: '华丽' }).reason; }
function probeLdGate(WA) { resetWorld(WA); return WA.ladder.define('阿宁', '占有欲', ['a', 'b']).reason; }
function probeLdRungs(WA) { resetWorld(WA); WA.ladder.setSettings({ enabled: true }); return WA.ladder.define('阿宁', '占有欲', ['仅一档']).reason; }
function probeLdDup(WA) { resetWorld(WA); WA.ladder.setSettings({ enabled: true }); WA.ladder.define('阿宁', '占有欲', ['a', 'b']); return WA.ladder.define('阿宁', '占有欲', ['x', 'y']).reason; }
function probeLdEvent(WA) { resetWorld(WA); WA.ladder.setSettings({ enabled: true }); WA.ladder.define('阿宁', '占有欲', ['a', 'b']); return WA.ladder.escalate('阿宁', '占有欲').reason; }
function probeLdTop(WA) { resetWorld(WA); WA.ladder.setSettings({ enabled: true }); WA.ladder.define('阿宁', '占有欲', ['a', 'b']); WA.ladder.escalate('阿宁', '占有欲', 'e1'); return WA.ladder.escalate('阿宁', '占有欲', 'e2').reason; }
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
  { key: 'ap-gate', rel: 'engines/appearance.js', from: A_AP_GATE, to: kill(A_AP_GATE), hits: 1 },
  { key: 'ap-tier', rel: 'engines/appearance.js', from: A_AP_TIER, to: kill(A_AP_TIER) },
  { key: 'ap-c', rel: 'engines/appearance.js', from: A_AP_C, to: kill(A_AP_C) },
  { key: 'ap-exists', rel: 'engines/appearance.js', from: A_AP_EXISTS, to: kill(A_AP_EXISTS) },
  { key: 'ap-form', rel: 'engines/appearance.js', from: A_AP_FORM, to: kill(A_AP_FORM) },
  { key: 'ap-eyeface', rel: 'engines/appearance.js', from: A_AP_EYEFACE, to: kill(A_AP_EYEFACE) },
  { key: 'ap-outfit', rel: 'engines/appearance.js', from: A_AP_OUTFIT, to: kill(A_AP_OUTFIT) },
  { key: 'ld-gate', rel: 'engines/ladder.js', from: A_LD_GATE, to: kill(A_LD_GATE), hits: 4 },
  { key: 'ld-rungs', rel: 'engines/ladder.js', from: A_LD_RUNGS, to: kill(A_LD_RUNGS) },
  { key: 'ld-dup', rel: 'engines/ladder.js', from: A_LD_DUP, to: kill(A_LD_DUP) },
  { key: 'ld-event', rel: 'engines/ladder.js', from: A_LD_EVENT, to: kill(A_LD_EVENT) },
  { key: 'ld-top', rel: 'engines/ladder.js', from: A_LD_TOP, to: kill(A_LD_TOP) }
];
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
function expectHits(spec) { return spec.hits == null ? 1 : spec.hits; }
function anchorHits(spec) {
  return fs.readFileSync(path.join(BASE, spec.rel), 'utf8').split(spec.from).length - 1;
}
function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === expectHits(s), 'v2690: [N0] anchor hits declared count (' + expectHits(s) + ') :: ' + s.key); });
  a(probeWith(BROKEN[0], probeApGate) !== 'disabled', 'v2690: [N1] appearance gate removed');
  a(probeWith(BROKEN[1], probeApTier) !== 'bad-tier', 'v2690: [N1] unknown tier accepted when guard removed');
  a(probeWith(BROKEN[2], probeApC) !== 'too-many-coverage', 'v2690: [N1] C over-coverage accepted when guard removed');
  a(probeWith(BROKEN[3], probeApExists) !== 'exists', 'v2690: [N1] duplicate accepted when guard removed');
  a(probeWith(BROKEN[4], probeApForm) !== 'bad-form', 'v2690: [N1] bad form accepted when guard removed');
  a(probeWith(BROKEN[5], probeApEyeFace) !== 'eye-face-clash', 'v2690: [N1] eye-face clash accepted when guard removed');
  a(probeWith(BROKEN[6], probeApOutfit) !== 'outfit-clash', 'v2690: [N1] outfit clash accepted when guard removed');
  a(probeWith(BROKEN[7], probeLdGate) !== 'disabled', 'v2690: [N1] ladder gate removed');
  a(probeWith(BROKEN[8], probeLdRungs) !== 'bad-rungs', 'v2690: [N1] single-rung accepted when guard removed');
  a(probeWith(BROKEN[9], probeLdDup) !== 'exists', 'v2690: [N1] duplicate define accepted when guard removed');
  a(probeWith(BROKEN[10], probeLdEvent) !== 'missing-event', 'v2690: [N1] eventless escalate accepted when guard removed');
  a(probeWith(BROKEN[11], probeLdTop) !== 'top', 'v2690: [N1] over-top accepted when guard removed');
  a(probeClean(probeApGate) === 'disabled', 'v2690: [N2] original refuses disabled appearance');
  a(probeClean(probeApTier) === 'bad-tier', 'v2690: [N2] original refuses unknown tier');
  a(probeClean(probeApC) === 'too-many-coverage', 'v2690: [N2] original refuses C over-coverage');
  a(probeClean(probeApExists) === 'exists', 'v2690: [N2] original refuses duplicate');
  a(probeClean(probeApForm) === 'bad-form', 'v2690: [N2] original refuses bad form');
  a(probeClean(probeApEyeFace) === 'eye-face-clash', 'v2690: [N2] original refuses eye-face clash');
  a(probeClean(probeApOutfit) === 'outfit-clash', 'v2690: [N2] original refuses outfit clash');
  a(probeClean(probeLdGate) === 'disabled', 'v2690: [N2] original refuses disabled ladder');
  a(probeClean(probeLdRungs) === 'bad-rungs', 'v2690: [N2] original refuses single rung');
  a(probeClean(probeLdDup) === 'exists', 'v2690: [N2] original refuses duplicate define');
  a(probeClean(probeLdEvent) === 'missing-event', 'v2690: [N2] original refuses eventless escalate');
  a(probeClean(probeLdTop) === 'top', 'v2690: [N2] original refuses over-top');
  // 跨模块隔离：破坏一个模块不得影响另一个。
  a(probeWith(BROKEN[0], probeLdGate) === 'disabled', 'v2690: [N3] appearance break does not touch ladder');
  a(probeWith(BROKEN[7], probeApGate) === 'disabled', 'v2690: [N3] ladder break does not touch appearance');
  // N4：状态确实变了。
  const chg = isolated(function () {
    const WA = fresh();
    resetWorld(WA);
    WA.ladder.setSettings({ enabled: true });
    WA.ladder.define('阿宁', '占有欲', ['轻度警戒', '中度干涉', '重度暴走']);
    WA.ladder.escalate('阿宁', '占有欲', '事件A');
    const rd = WA.ladder.read('阿宁', '占有欲');
    return { idx: rd.idx, rung: rd.rung, rows: st(WA).ladder.rows.length };
  });
  a(chg.idx === 1 && chg.rung === '中度干涉' && chg.rows === 1, 'v2690: [N4] state really changed (got ' + JSON.stringify(chg) + ')');
  // N5：sentinel 不泄漏。
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2690: [N5] sentinel did not leak (' + (leak.join(',') || 'none') + ')');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2690: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2690: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative };