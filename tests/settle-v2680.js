#!/usr/bin/env node
// WorldAxis tests/settle-v2680.js -- wiki-cycle lock (v2.68.0)
//
// What it pins (all negative):
//   eraCycle:  off-gate distinguishable; four-stage cycle advances by day delta;
//              countdown must be a positive integer; a cross past settle into the
//              next fallow REQUIRES a fresh event name (missing-event / stale-event).
//   survival:  three axes each clamped 0..100; load needs a capacity somewhere
//              (no-capacity); a half-written row must NOT block later axis-only
//              updates (regression: the v2.68.0 bug).
//   warrant:   three levels only; charge+place mandatory; 3 active records promote
//              to hunted; pardoning a major crime needs an explicit reason.
//   beastBond: tame 0..100; reaching 100 MUST convert via a legal method; loyalty
//              moves by explicit delta and a DECREASE needs a cause; clamp is reported.
// Anchors each occur exactly once in real source. Negative control mutates a memory copy only.
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2680_';
// 共享 gate：同一字面量在该模块的多个写路径各出现一次（仓库既有风格）。
// 这类锚点声明其预期命中数（hits），N0 判据核验"实际命中 == 声明命中"，
// 而不是强求唯一 —— 精确的定义是"命中数被显式声明并被验证"，不是"必须为 1"。
const A_ERA_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_ERA_CNT = "if (days != null && (typeof days !== 'number' || !isFinite(days) || days <= 0 || (days | 0) !== days)) { out = { ok: false, reason: 'bad-countdown' }; return; }";
const A_ERA_EXISTS = "if (draft.eraCycle.rows.filter(function (r) { return r && r.name === who; })[0]) { out = { ok: false, reason: 'exists', name: who }; return; }";
const A_ERA_DELTA = "if (dayDelta == null || typeof dayDelta !== 'number' || !isFinite(dayDelta) || dayDelta < 0 || (dayDelta | 0) !== dayDelta) { out = { ok: false, reason: 'bad-delta' }; return; }";
const A_ERA_MISSING = "if (!hit) { out = { ok: false, reason: 'missing', name: who }; return; }";
const A_ERA_STALE = "if (ev === prevEvent) { out = { ok: false, reason: 'stale-event', stage: hit.stage }; return; }";
const A_SV_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_SV_SAT = "if (p.satiety != null && (typeof p.satiety !== 'number' || !isFinite(p.satiety) || p.satiety < 0 || p.satiety > 100)) { out = { ok: false, reason: 'bad-axis', axis: 'satiety' }; return; }";
const A_SV_STA = "if (p.stamina != null && (typeof p.stamina !== 'number' || !isFinite(p.stamina) || p.stamina < 0 || p.stamina > 100)) { out = { ok: false, reason: 'bad-axis', axis: 'stamina' }; return; }";
const A_SV_CAP = "if (p.load != null && p.capacity == null && hit.capacity == null) { out = { ok: false, reason: 'no-capacity', who: w }; return; }";
const A_WR_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_WR_LEVEL = "if (LEVELS.indexOf(level) < 0) { out = { ok: false, reason: 'bad-level', got: level }; return; }";
const A_WR_FIELDS = "if (!w || !ch || !pl) { out = { ok: false, reason: 'missing-fields' }; return; }";
const A_WR_MAJOR = "if (level === 'major' && !why) { out = { ok: false, reason: 'major-gate' }; return; }";
const A_BB_VAL = "if (typeof tame !== 'number' || !isFinite(tame) || tame < 0 || tame > 100) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', axis: 'tame' }; }";
const A_BB_METHOD = "if (METHODS.indexOf(m) < 0) { out = { ok: false, reason: 'bad-method', got: m }; return; }";
const A_BB_DELTA = "if (typeof delta !== 'number' || !isFinite(delta) || delta === 0) { out = { ok: false, reason: 'bad-delta' }; return; }";
const A_BB_CAUSE = "if (delta < 0 && !p.cause) { out = { ok: false, reason: 'missing-cause' }; return; }";
const A_BB_DUP = "if (draft.beastBond.rows.filter(function (r) { return r && r.beast === b; })[0]) { out = { ok: false, reason: 'exists', beast: b }; return; }";
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function st(WA) { return WA.store.get() || {}; }
function resetWorld(WA) {
  WA.store.transact(function (d) {
    d.eraCycle = { rows: [] };
    d.survival = { rows: [] };
    d.warrant = { rows: [] };
    d.beastBond = { rows: [] };
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
  a(!!WA.eraCycle && typeof WA.eraCycle.tick === 'function', 'v2680/wiki: eraCycle loaded');
  a(!!WA.survival && typeof WA.survival.set === 'function', 'v2680/wiki: survival loaded');
  a(!!WA.warrant && typeof WA.warrant.report === 'function', 'v2680/wiki: warrant loaded');
  a(!!WA.beastBond && typeof WA.beastBond.train === 'function', 'v2680/wiki: beastBond loaded');
  resetWorld(WA);
  // ---- 1 eraCycle: gate / countdown / cycle / event handover ----
  const eOff = WA.eraCycle.init('北境资料片', '雪灾逼近');
  a(eOff.ok === true && eOff.reason === 'disabled', 'v2680/wiki: [1] disabled era says so (got ' + JSON.stringify(eOff) + ')');
  a(WA.eraCycle.buildBlock() === '', 'v2680/wiki: [1] disabled era injects nothing');
  WA.eraCycle.setSettings({ enabled: true });
  a(WA.eraCycle.init('北境资料片', '雪灾逼近').ok === true, 'v2680/wiki: [1] init lands');
  a(WA.eraCycle.init('北境资料片', '别的').reason === 'exists', 'v2680/wiki: [1] duplicate period refused');
  a(WA.eraCycle.init('北境资料片', '').reason === 'missing-fields', 'v2680/wiki: [1] period needs an event name');
  a(WA.eraCycle.init('新资料片', '雪灾', 0).reason === 'bad-countdown', 'v2680/wiki: [1] zero countdown refused');
  a(WA.eraCycle.init('新资料片', '雪灾', 2.5).reason === 'bad-countdown', 'v2680/wiki: [1] fractional countdown refused');
  a(WA.eraCycle.tick('不存在', 1).reason === 'missing', 'v2680/wiki: [1] unregistered period says missing');
  a(WA.eraCycle.tick('北境资料片', 0).reason === 'same-day', 'v2680/wiki: [1] zero delta is a no-op');
  a(WA.eraCycle.tick('北境资料片', -1).reason === 'bad-delta', 'v2680/wiki: [1] backwards day refused');
  let r = WA.eraCycle.tick('北境资料片', 99);
  a(r.ok === false && r.reason === 'missing-event', 'v2680/wiki: [1] crossing into fallow demands an event (got ' + JSON.stringify(r) + ')');
  r = WA.eraCycle.tick('北境资料片', 99, '狼潮南侵');
  a(r.ok === true && r.event === '狼潮南侵' && r.crossed.indexOf('fallow') >= 0, 'v2680/wiki: [1] fresh event lands (got ' + JSON.stringify(r) + ')');
  a(WA.eraCycle.tick('北境资料片', 99, '狼潮南侵').reason === 'stale-event', 'v2680/wiki: [1] reusing the old name refused');
  a(WA.eraCycle.read('北境资料片').event === '狼潮南侵', 'v2680/wiki: [1] event handover persisted');
  a(WA.eraCycle.buildBlock().indexOf('[资料片周期]') === 0, 'v2680/wiki: [1] inject names the cycle');
  // ---- 2 survival: ranges / capacity / the half-written-row regression ----
  const sOff = WA.survival.set('阿宁', { satiety: 50 });
  a(sOff.ok === true && sOff.reason === 'disabled', 'v2680/wiki: [2] disabled survival says so');
  WA.survival.setSettings({ enabled: true });
  a(WA.survival.set('阿宁', { satiety: 101 }).reason === 'bad-axis', 'v2680/wiki: [2] satiety over 100 refused');
  a(WA.survival.set('阿宁', { satiety: -1 }).reason === 'bad-axis', 'v2680/wiki: [2] satiety under 0 refused');
  a(WA.survival.set('阿宁', { stamina: 101 }).reason === 'bad-axis', 'v2680/wiki: [2] stamina over 100 refused');
  a(WA.survival.set('阿宁', { load: -1 }).reason === 'bad-load', 'v2680/wiki: [2] negative load refused');
  a(WA.survival.set('阿宁', { load: 20 }).reason === 'no-capacity', 'v2680/wiki: [2] load without any capacity refused');
  // 回归：上一步留下了半成品行（只有 who/load），后续纯三轴更新不得被连带拒绝。
  a(WA.survival.set('阿宁', { satiety: 85, stamina: 40 }).ok === true, 'v2680/wiki: [2] half-row must not block axis-only update');
  let sr = WA.survival.read('阿宁');
  a(sr.ok === true && sr.satiety.band === '充沛' && sr.stamina.band === '正常', 'v2680/wiki: [2] bands read back (got ' + JSON.stringify(sr.satiety) + ')');
  WA.survival.set('阿宁', { capacity: 20, load: 30 });
  sr = WA.survival.read('阿宁');
  a(sr.burden.band === '超载' && sr.burden.moveZero === true, 'v2680/wiki: [2] overload freezes movement');
  WA.survival.set('阿宁', { satiety: 0, stamina: 5 });
  sr = WA.survival.read('阿宁');
  a(sr.satiety.drainHp === true && sr.stamina.allCheck === true, 'v2680/wiki: [2] zero-axis penalties fire');
  a(WA.survival.read('无名氏').reason === 'missing', 'v2680/wiki: [2] unregistered axis read says missing');
  a(WA.survival.buildBlock().indexOf('[生存三轴]') === 0, 'v2680/wiki: [2] inject names the three axes');
  // ---- 3 warrant: levels / fields / hunted threshold / major pardon gate ----
  const wOff = WA.warrant.report('阿宁', 'minor', '偷窃', '北街');
  a(wOff.ok === true && wOff.reason === 'disabled', 'v2680/wiki: [3] disabled warrant says so');
  WA.warrant.setSettings({ enabled: true });
  a(WA.warrant.report('阿宁', 'felonyX', '偷窃', '北街').reason === 'bad-level', 'v2680/wiki: [3] unknown level refused');
  a(WA.warrant.report('阿宁', 'moderate', '', '北街').reason === 'missing-fields', 'v2680/wiki: [3] missing charge refused');
  a(WA.warrant.report('阿宁', 'moderate', '斗殴', '').reason === 'missing-fields', 'v2680/wiki: [3] missing place refused');
  a(WA.warrant.report('阿宁', 'moderate', '斗殴', '北街').ok === true, 'v2680/wiki: [3] first record lands');
  a(WA.warrant.report('阿宁', 'minor', '扰乱秩序', '南市').ok === true, 'v2680/wiki: [3] second record lands');
  a(WA.warrant.read('阿宁').hunted === false, 'v2680/wiki: [3] two records are not hunted yet');
  const r3 = WA.warrant.report('阿宁', 'major', '谋杀', '北门');
  a(r3.ok === true && r3.onRecord === 3, 'v2680/wiki: [3] third record lands (got ' + JSON.stringify(r3) + ')');
  a(r3.status === 'hunted', 'v2680/wiki: [3] the promoting record itself reads hunted (got ' + JSON.stringify(r3) + ')');
  a(WA.warrant.read('阿宁').hunted === true && WA.warrant.read('阿宁').records.length === 3, 'v2680/wiki: [3] three records promote to hunted');
  a(WA.warrant.pardon('阿宁', 'felonyX', '乱来').reason === 'bad-level', 'v2680/wiki: [3] pardon needs a known level');
  a(WA.warrant.pardon('阿宁', 'major').reason === 'major-gate', 'v2680/wiki: [3] major pardon needs a reason');
  a(WA.warrant.pardon('阿宁', 'major', '大赦').ok === true, 'v2680/wiki: [3] reasoned major pardon lands');
  a(WA.warrant.read('阿宁').records.length === 2 && WA.warrant.read('阿宁').hunted === false, 'v2680/wiki: [3] a pardon leaves the books and drops the hunted flag');
  a(WA.warrant.pardon('阿宁', 'major', '再赦').reason === 'missing', 'v2680/wiki: [3] double pardon says missing');
  a(WA.warrant.buildBlock().indexOf('[通缉]') === 0, 'v2680/wiki: [3] inject names the warrant');
  // 回归：行数组里出现空洞（null 行）时注入块不得抛。
  // 原缺陷 `r && r.status === 'active' || r.status === 'hunted'` 里括号缺失，
  // `r` 为 null 时第二子句仍会解引用 ⇒ TypeError；守卫必须写成 `r && (a || b)`。
  WA.store.transact(function (d) { d.warrant.rows.push(null); }, TAG + 'hole');
  let holeOk = true;
  try { WA.warrant.buildBlock(); } catch (e) { holeOk = false; }
  a(holeOk, 'v2680/wiki: [3] a null row must not break the inject block');
  WA.store.transact(function (d) { d.warrant.rows.pop(); }, TAG + 'unhole');
  // ---- 4 beastBond: tame range / convert on 100 / loyalty cause ----
  const bOff = WA.beastBond.register('灰爪', '阿宁', 5);
  a(bOff.ok === true && bOff.reason === 'disabled', 'v2680/wiki: [4] disabled bond says so (got ' + JSON.stringify(bOff) + ')');
  WA.beastBond.setSettings({ enabled: true });
  a(WA.beastBond.register('灰爪', '阿宁', 101).reason === 'bad-value', 'v2680/wiki: [4] tame over 100 refused');
  a(WA.beastBond.register('灰爪', '阿宁', -1).reason === 'bad-value', 'v2680/wiki: [4] tame under 0 refused');
  a(WA.beastBond.register('灰爪', '', 5).reason === 'missing-fields', 'v2680/wiki: [4] beast needs an owner');
  a(WA.beastBond.register('灰爪', '阿宁', 5).ok === true, 'v2680/wiki: [4] register lands');
  a(WA.beastBond.register('灰爪', '阿宁', 5).reason === 'exists', 'v2680/wiki: [4] duplicate beast refused');
  a(WA.beastBond.train('野狗', 10, 'subdue').reason === 'missing', 'v2680/wiki: [4] unregistered beast says missing');
  a(WA.beastBond.train('灰爪', 10, 'whistle').reason === 'bad-method', 'v2680/wiki: [4] train needs a legal method');
  a(WA.beastBond.train('灰爪', 0, 'subdue').reason === 'bad-delta', 'v2680/wiki: [4] zero tame delta refused');
  a(WA.beastBond.train('灰爪', -5, 'subdue').reason === 'bad-delta', 'v2680/wiki: [4] negative tame delta refused');
  const tr = WA.beastBond.train('灰爪', 95, 'subdue');
  a(tr.ok === true && tr.clamped === true && tr.tame === 0, 'v2680/wiki: [4] reaching 100 converts (tame cleared) (got ' + JSON.stringify(tr) + ')');
  // subdue 的初始忠诚区间是 [10,30]，取中位 20（不是 50）。
  const loy = WA.beastBond.read('灰爪').loyalty;
  a(loy === 20 && tr.converted.method === 'subdue', 'v2680/wiki: [4] conversion seeds loyalty from the method midpoint (got ' + loy + ')');
  a(WA.beastBond.bond('灰爪', 0).reason === 'bad-delta', 'v2680/wiki: [4] zero loyalty delta refused');
  a(WA.beastBond.bond('灰爪', -20).reason === 'missing-cause', 'v2680/wiki: [4] a drop needs an explicit cause');
  const bd = WA.beastBond.bond('灰爪', -20, { cause: '挨饿', hunger: true });
  a(bd.ok === true && bd.loyalty === 0 && bd.clamped === false && bd.starving === true, 'v2680/wiki: [4] caused drop lands and flags starving (got ' + JSON.stringify(bd) + ')');
  const up = WA.beastBond.bond('灰爪', 90, { hunger: false });
  a(up.ok === true && up.loyalty === 90 && up.clamped === false && up.band === '死忠', 'v2680/wiki: [4] loyalty rises and names the band (got ' + JSON.stringify(up) + ')');
  const cap = WA.beastBond.bond('灰爪', 50, { hunger: false });
  a(cap.ok === true && cap.loyalty === 100 && cap.clamped === true, 'v2680/wiki: [4] loyalty clamps at 100 and says so (got ' + JSON.stringify(cap) + ')');
  a(WA.beastBond.buildBlock().indexOf('[驯兽]') === 0, 'v2680/wiki: [4] inject names the bond');
  console.log('  ok v2680/wiki: eraCycle / survival / warrant / beastBond');
}
function probeEraGate(WA) { resetWorld(WA); return WA.eraCycle.init('北境资料片', '雪灾逼近').reason; }
function probeEraCnt(WA) { resetWorld(WA); WA.eraCycle.setSettings({ enabled: true }); return WA.eraCycle.init('北境资料片', '雪灾', 0).reason; }
function probeEraExists(WA) { resetWorld(WA); WA.eraCycle.setSettings({ enabled: true }); WA.eraCycle.init('北境资料片', '雪灾'); return WA.eraCycle.init('北境资料片', '别的').reason; }
function probeEraDelta(WA) { resetWorld(WA); WA.eraCycle.setSettings({ enabled: true }); WA.eraCycle.init('北境资料片', '雪灾'); return WA.eraCycle.tick('北境资料片', -1).reason; }
function probeEraMissing(WA) { resetWorld(WA); WA.eraCycle.setSettings({ enabled: true }); return WA.eraCycle.tick('不存在', 1).reason; }
function probeEraStale(WA) {
  resetWorld(WA); WA.eraCycle.setSettings({ enabled: true });
  WA.eraCycle.init('北境资料片', '雪灾逼近');
  WA.eraCycle.tick('北境资料片', 99, '狼潮南侵');
  return WA.eraCycle.tick('北境资料片', 99, '狼潮南侵').reason;
}
function probeSvGate(WA) { resetWorld(WA); return WA.survival.set('阿宁', { satiety: 50 }).reason; }
function probeSvSat(WA) { resetWorld(WA); WA.survival.setSettings({ enabled: true }); return WA.survival.set('阿宁', { satiety: 101 }).reason; }
function probeSvSta(WA) { resetWorld(WA); WA.survival.setSettings({ enabled: true }); return WA.survival.set('阿宁', { stamina: 101 }).reason; }
function probeSvCap(WA) { resetWorld(WA); WA.survival.setSettings({ enabled: true }); return WA.survival.set('阿宁', { load: 20 }).reason; }
function probeWrGate(WA) { resetWorld(WA); return WA.warrant.report('阿宁', 'minor', '偷窃', '北街').reason; }
function probeWrLevel(WA) { resetWorld(WA); WA.warrant.setSettings({ enabled: true }); return WA.warrant.report('阿宁', 'felonyX', '偷窃', '北街').reason; }
function probeWrFields(WA) { resetWorld(WA); WA.warrant.setSettings({ enabled: true }); return WA.warrant.report('阿宁', 'moderate', '', '北街').reason; }
function probeWrMajor(WA) { resetWorld(WA); WA.warrant.setSettings({ enabled: true }); return WA.warrant.pardon('阿宁', 'major').reason; }
function probeBbVal(WA) { resetWorld(WA); WA.beastBond.setSettings({ enabled: true }); return WA.beastBond.register('灰爪', '阿宁', 101).reason; }
function probeBbMethod(WA) { resetWorld(WA); WA.beastBond.setSettings({ enabled: true }); WA.beastBond.register('灰爪', '阿宁', 5); return WA.beastBond.train('灰爪', 10, 'whistle').reason; }
function probeBbDelta(WA) { resetWorld(WA); WA.beastBond.setSettings({ enabled: true }); WA.beastBond.register('灰爪', '阿宁', 5); return WA.beastBond.bond('灰爪', 0).reason; }
function probeBbCause(WA) { resetWorld(WA); WA.beastBond.setSettings({ enabled: true }); WA.beastBond.register('灰爪', '阿宁', 5); return WA.beastBond.bond('灰爪', -20).reason; }
function probeBbDup(WA) { resetWorld(WA); WA.beastBond.setSettings({ enabled: true }); WA.beastBond.register('灰爪', '阿宁', 5); return WA.beastBond.register('灰爪', '阿宁', 5).reason; }
function kill(src) {
  if (src.indexOf('if (') !== 0) throw new Error('kill shape ' + src.slice(0, 24));
  // 破坏语义：把守卫条件整体置假。为保证括号平衡，从右往左找与首个 '(' 配对的 ')'
  // —— 条件里可能嵌着 filter(function (r) { ... })，不能只看第一个 ') {'。
  let depth = 0, closeAt = -1;
  for (let i = src.indexOf('('); i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { closeAt = i; break; } }
  }
  if (closeAt < 0) throw new Error('kill unbalanced ' + src.slice(0, 40));
  // closeAt 后即原文的 ` { ... }`；只替换条件，保留块，不额外加括号。
  return 'if (false) ' + src.slice(closeAt + 1);
}
const BROKEN = [
  { key: 'era-gate', rel: 'engines/era-cycle.js', from: A_ERA_GATE, to: kill(A_ERA_GATE), hits: 2 },
  { key: 'era-cnt', rel: 'engines/era-cycle.js', from: A_ERA_CNT, to: kill(A_ERA_CNT) },
  { key: 'era-exists', rel: 'engines/era-cycle.js', from: A_ERA_EXISTS, to: kill(A_ERA_EXISTS) },
  { key: 'era-delta', rel: 'engines/era-cycle.js', from: A_ERA_DELTA, to: kill(A_ERA_DELTA) },
  { key: 'era-missing', rel: 'engines/era-cycle.js', from: A_ERA_MISSING, to: kill(A_ERA_MISSING) },
  { key: 'era-stale', rel: 'engines/era-cycle.js', from: A_ERA_STALE, to: kill(A_ERA_STALE) },
  { key: 'sv-gate', rel: 'engines/survival.js', from: A_SV_GATE, to: kill(A_SV_GATE) },
  { key: 'sv-sat', rel: 'engines/survival.js', from: A_SV_SAT, to: kill(A_SV_SAT) },
  { key: 'sv-sta', rel: 'engines/survival.js', from: A_SV_STA, to: kill(A_SV_STA) },
  { key: 'sv-cap', rel: 'engines/survival.js', from: A_SV_CAP, to: kill(A_SV_CAP) },
  { key: 'wr-gate', rel: 'engines/warrant.js', from: A_WR_GATE, to: kill(A_WR_GATE), hits: 2 },
  { key: 'wr-level', rel: 'engines/warrant.js', from: A_WR_LEVEL, to: kill(A_WR_LEVEL), hits: 2 },
  { key: 'wr-fields', rel: 'engines/warrant.js', from: A_WR_FIELDS, to: kill(A_WR_FIELDS) },
  { key: 'wr-major', rel: 'engines/warrant.js', from: A_WR_MAJOR, to: kill(A_WR_MAJOR) },
  { key: 'bb-val', rel: 'engines/beast-bond.js', from: A_BB_VAL, to: kill(A_BB_VAL) },
  { key: 'bb-method', rel: 'engines/beast-bond.js', from: A_BB_METHOD, to: kill(A_BB_METHOD) },
  { key: 'bb-delta', rel: 'engines/beast-bond.js', from: A_BB_DELTA, to: kill(A_BB_DELTA) },
  { key: 'bb-cause', rel: 'engines/beast-bond.js', from: A_BB_CAUSE, to: kill(A_BB_CAUSE) },
  { key: 'bb-dup', rel: 'engines/beast-bond.js', from: A_BB_DUP, to: kill(A_BB_DUP) }
];
// 三处 gate/level 字面量在其文件里各自出现 2 次（模块内多条写路径共享同一守卫），
// 其余锚点各 1 次。命中数逐项显式声明，不许猜。
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
  BROKEN.forEach(function (s) { a(anchorHits(s) === expectHits(s), 'v2680/wiki: [N0] anchor hits declared count (' + expectHits(s) + ') :: ' + s.key); });
  a(probeWith(BROKEN[0], probeEraGate) !== 'disabled', 'v2680/wiki: [N1] era gate removed');
  a(probeWith(BROKEN[1], probeEraCnt) !== 'bad-countdown', 'v2680/wiki: [N1] bad countdown accepted when guard removed');
  a(probeWith(BROKEN[2], probeEraExists) !== 'exists', 'v2680/wiki: [N1] duplicate period accepted when guard removed');
  a(probeWith(BROKEN[3], probeEraDelta) !== 'bad-delta', 'v2680/wiki: [N1] backwards day accepted when guard removed');
  a(probeWith(BROKEN[4], probeEraMissing) !== 'missing', 'v2680/wiki: [N1] unknown period accepted when guard removed');
  a(probeWith(BROKEN[5], probeEraStale) !== 'stale-event', 'v2680/wiki: [N1] stale event accepted when guard removed');
  a(probeWith(BROKEN[6], probeSvGate) !== 'disabled', 'v2680/wiki: [N1] survival gate removed');
  a(probeWith(BROKEN[7], probeSvSat) !== 'bad-axis', 'v2680/wiki: [N1] out-of-range satiety accepted when guard removed');
  a(probeWith(BROKEN[8], probeSvSta) !== 'bad-axis', 'v2680/wiki: [N1] out-of-range stamina accepted when guard removed');
  a(probeWith(BROKEN[9], probeSvCap) !== 'no-capacity', 'v2680/wiki: [N1] capacityless load accepted when guard removed');
  a(probeWith(BROKEN[10], probeWrGate) !== 'disabled', 'v2680/wiki: [N1] warrant gate removed');
  a(probeWith(BROKEN[11], probeWrLevel) !== 'bad-level', 'v2680/wiki: [N1] unknown level accepted when guard removed');
  a(probeWith(BROKEN[12], probeWrFields) !== 'missing-fields', 'v2680/wiki: [N1] field-less charge accepted when guard removed');
  a(probeWith(BROKEN[13], probeWrMajor) !== 'major-gate', 'v2680/wiki: [N1] unreasoned major pardon accepted when guard removed');
  a(probeWith(BROKEN[14], probeBbVal) !== 'bad-value', 'v2680/wiki: [N1] out-of-range tame accepted when guard removed');
  a(probeWith(BROKEN[15], probeBbMethod) !== 'bad-method', 'v2680/wiki: [N1] unknown method accepted when guard removed');
  a(probeWith(BROKEN[16], probeBbDelta) !== 'bad-delta', 'v2680/wiki: [N1] zero loyalty delta accepted when guard removed');
  a(probeWith(BROKEN[17], probeBbCause) !== 'missing-cause', 'v2680/wiki: [N1] causeless drop accepted when guard removed');
  a(probeWith(BROKEN[18], probeBbDup) !== 'exists', 'v2680/wiki: [N1] duplicate beast accepted when guard removed');
  a(probeClean(probeEraGate) === 'disabled', 'v2680/wiki: [N2] original refuses disabled era');
  a(probeClean(probeEraCnt) === 'bad-countdown', 'v2680/wiki: [N2] original refuses bad countdown');
  a(probeClean(probeEraExists) === 'exists', 'v2680/wiki: [N2] original refuses duplicate period');
  a(probeClean(probeEraDelta) === 'bad-delta', 'v2680/wiki: [N2] original refuses backwards day');
  a(probeClean(probeEraMissing) === 'missing', 'v2680/wiki: [N2] original refuses unknown period');
  a(probeClean(probeEraStale) === 'stale-event', 'v2680/wiki: [N2] original refuses stale event');
  a(probeClean(probeSvGate) === 'disabled', 'v2680/wiki: [N2] original refuses disabled survival');
  a(probeClean(probeSvSat) === 'bad-axis', 'v2680/wiki: [N2] original refuses out-of-range satiety');
  a(probeClean(probeSvSta) === 'bad-axis', 'v2680/wiki: [N2] original refuses out-of-range stamina');
  a(probeClean(probeSvCap) === 'no-capacity', 'v2680/wiki: [N2] original refuses capacityless load');
  a(probeClean(probeWrGate) === 'disabled', 'v2680/wiki: [N2] original refuses disabled warrant');
  a(probeClean(probeWrLevel) === 'bad-level', 'v2680/wiki: [N2] original refuses unknown level');
  a(probeClean(probeWrFields) === 'missing-fields', 'v2680/wiki: [N2] original refuses field-less charge');
  a(probeClean(probeWrMajor) === 'major-gate', 'v2680/wiki: [N2] original refuses unreasoned major pardon');
  a(probeClean(probeBbVal) === 'bad-value', 'v2680/wiki: [N2] original refuses out-of-range tame');
  a(probeClean(probeBbMethod) === 'bad-method', 'v2680/wiki: [N2] original refuses unknown method');
  a(probeClean(probeBbDelta) === 'bad-delta', 'v2680/wiki: [N2] original refuses zero loyalty delta');
  a(probeClean(probeBbCause) === 'missing-cause', 'v2680/wiki: [N2] original refuses causeless drop');
  a(probeClean(probeBbDup) === 'exists', 'v2680/wiki: [N2] original refuses duplicate beast');
  // 跨模块隔离：破坏一个模块不得影响另一个模块的判据。
  a(probeWith(BROKEN[0], probeSvGate) === 'disabled', 'v2680/wiki: [N3] era break does not touch survival');
  a(probeWith(BROKEN[6], probeWrGate) === 'disabled', 'v2680/wiki: [N3] survival break does not touch warrant');
  a(probeWith(BROKEN[10], probeBbVal) === 'bad-value', 'v2680/wiki: [N3] warrant break does not touch beastBond');
  // N4：状态确实变了（不是只在内存里换了返回值）。
  const chg = isolated(function () {
    const WA = fresh();
    resetWorld(WA);
    WA.beastBond.setSettings({ enabled: true });
    WA.beastBond.register('灰爪', '阿宁', 40);
    WA.beastBond.train('灰爪', 60, 'rescue');   // 满百转化：tame 清零、loyalty 取 rescue 中位 75
    WA.beastBond.bond('灰爪', -20, { cause: '挨饿' }); // 75 - 20 = 55
    const rd = WA.beastBond.read('灰爪');
    return { t: rd.tame, l: rd.loyalty, st: st(WA).beastBond.rows.length };
  });
  a(chg.t === 0 && chg.l === 55 && chg.st === 1, 'v2680/wiki: [N4] state really changed (got ' + JSON.stringify(chg) + ')');
  // N5：sentinel 不泄漏。注意 resetWorld 里的 TAG 注释只进事务名，不进存储值。
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2680/wiki: [N5] sentinel did not leak (' + (leak.join(',') || 'none') + ')');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2680: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2680: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative };
