#!/usr/bin/env node
// WorldAxis tests/settle-v2700.js -- scene-slice x gauge x rivalry lock (v2.70.0)
//
// What it pins (all negative):
//   sceneSlice: off-gate distinguishable; env whitelist indoor/outdoor; bad-time format refused;
//               indoor sets weatherSuppressed true; segment normalized to 7 legal slices;
//               read missing if not found.
//   gauge:      off-gate distinguishable; value clamped 0..100; delta > maxStep refused (step-too-large);
//               crossing milestones [25, 50, 75, 100] REQUIRES event (missing-event);
//               stepping above 100 refused (top); duplicate create refused without force.
//   rivalry:    off-gate distinguishable; invalid actors (self/target collision) refused;
//               bad weight (<0 or >100) refused; modulate missing if target not in registry;
//               retire removes record cleanly.
// Anchors each occur exactly once in real source (or declared hits). Negative control mutates a memory copy only.
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2700_';

const A_SS_GATE = "if (!settings().enabled) return { ok: true, reason: 'disabled' };";
const A_SS_ENV = "if (ENV_TYPES.indexOf(e) < 0) return { ok: false, reason: 'bad-env', got: env };";
const A_SS_TIME = "if (mins < 0) return { ok: false, reason: 'bad-time', got: timeStr };";
const A_GG_GATE = "if (!settings().enabled) return { ok: true, reason: 'disabled' };";
const A_GG_STEP_LIM = "if (Math.abs(delta) > lim) return { ok: false, reason: 'step-too-large', delta: delta, limit: lim };";
const A_GG_EVENT = "if (crossedMilestone !== null && (!event || typeof event !== 'string')) {";
const A_GG_TOP = "if (hit.val >= 100 && delta > 0) { out = { ok: false, reason: 'top', key: key, val: hit.val }; return false; }";
const A_RV_GATE = "if (!settings().enabled) return { ok: true, reason: 'disabled' };";
const A_RV_ACTORS = "if (charA === charB || charA === target || charB === target) return { ok: false, reason: 'invalid-actors' };";
// v2.78.0: 锚点随修法前移——非数 weight 此前被静默降级 50，bad-weight 只在 0..100 外可达
//   （码存在但一半不可达）。v2.78.0 起先判「是不是有限数」再判域，故锚点取整条守卫。
const A_RV_WEIGHT = "if (typeof w !== 'number' || !isFinite(w) || w < 0 || w > 100) return { ok: false, reason: 'bad-weight', got: weight };";
const A_RV_MOD_MISS = "if (!list.length) return { ok: false, reason: 'missing', favoured: favouredChar, target: target };";

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function st(WA) { return WA.store.get() || {}; }
function resetWorld(WA) {
  WA.store.transact(function (d) {
    d.sceneSlice = { rows: [] };
    d.gauge = { rows: [] };
    d.rivalry = { rows: [] };
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
  a(!!WA.sceneSlice && typeof WA.sceneSlice.set === 'function', 'v2700: sceneSlice loaded');
  a(!!WA.gauge && typeof WA.gauge.create === 'function', 'v2700: gauge loaded');
  a(!!WA.rivalry && typeof WA.rivalry.declare === 'function', 'v2700: rivalry loaded');
  resetWorld(WA);

  // ---- 1 sceneSlice ----
  const ssOff = WA.sceneSlice.set('书房', 'indoor');
  a(ssOff.ok === true && ssOff.reason === 'disabled', 'v2700: [1] disabled sceneSlice says so');
  a(WA.sceneSlice.buildBlock() === '', 'v2700: [1] disabled sceneSlice injects nothing');
  WA.sceneSlice.setSettings({ enabled: true });
  a(WA.sceneSlice.set('', 'indoor').reason === 'missing-fields', 'v2700: [1] sceneSlice needs place');
  a(WA.sceneSlice.set('书房', 'invalid_env').reason === 'bad-env', 'v2700: [1] bad env refused');
  a(WA.sceneSlice.set('书房', 'indoor', { time: '99:99' }).reason === 'bad-time', 'v2700: [1] bad time format refused');
  const ssIn = WA.sceneSlice.set('书房', 'indoor', { time: '14:30' });
  a(ssIn.ok === true && ssIn.weatherSuppressed === true && ssIn.segment === 'afternoon', 'v2700: [1] indoor sets weatherSuppressed and afternoon segment');
  const ssOut = WA.sceneSlice.set('庭院', 'outdoor', { time: '18:20' });
  a(ssOut.ok === true && ssOut.weatherSuppressed === false && ssOut.segment === 'dusk', 'v2700: [1] outdoor keeps weather enabled and dusk segment');
  a(WA.sceneSlice.read('秘密基地').reason === 'missing', 'v2700: [1] unrecorded place says missing');
  a(WA.sceneSlice.buildBlock().indexOf('[情境切片]') === 0, 'v2700: [1] sceneSlice buildBlock valid');

  // ---- 2 gauge ----
  const ggOff = WA.gauge.create('高潮');
  a(ggOff.ok === true && ggOff.reason === 'disabled', 'v2700: [2] disabled gauge says so');
  a(WA.gauge.buildBlock() === '', 'v2700: [2] disabled gauge injects nothing');
  WA.gauge.setSettings({ enabled: true, maxStep: 30 });
  a(WA.gauge.create('').reason === 'missing-fields', 'v2700: [2] gauge needs key');
  const ggInit = WA.gauge.create('危机度', { initial: 20 });
  a(ggInit.ok === true && ggInit.val === 20, 'v2700: [2] gauge initialized at 20');
  a(WA.gauge.create('危机度').reason === 'exists', 'v2700: [2] duplicate gauge create refused');
  a(WA.gauge.step('危机度', 50).reason === 'step-too-large', 'v2700: [2] step > maxStep refused');
  // step from 20 -> 30 crosses milestone 25!
  a(WA.gauge.step('危机度', 10).reason === 'missing-event', 'v2700: [2] crossing milestone 25 requires event');
  const sOk = WA.gauge.step('危机度', 10, '伏兵现身');
  a(sOk.ok === true && sOk.to === 30 && sOk.crossed === 25, 'v2700: [2] milestone 25 step succeeds with event');
  WA.gauge.step('危机度', 25, '城堡被围'); // 30 -> 55 (crosses 50)
  WA.gauge.step('危机度', 25, '城门告破'); // 55 -> 80 (crosses 75)
  WA.gauge.step('危机度', 20, '王座决战'); // 80 -> 100 (crosses 100)
  a(WA.gauge.step('危机度', 10, '更多敌人').reason === 'top', 'v2700: [2] step past 100 refused');
  a(WA.gauge.buildBlock().indexOf('[阻尼量规]') === 0, 'v2700: [2] gauge buildBlock valid');

  // ---- 3 rivalry ----
  const rvOff = WA.rivalry.declare('甲', '乙', '目标');
  a(rvOff.ok === true && rvOff.reason === 'disabled', 'v2700: [3] disabled rivalry says so');
  a(WA.rivalry.buildBlock() === '', 'v2700: [3] disabled rivalry injects nothing');
  WA.rivalry.setSettings({ enabled: true });
  a(WA.rivalry.declare('甲', '甲', '目标').reason === 'invalid-actors', 'v2700: [3] self vs self refused');
  a(WA.rivalry.declare('甲', '乙', '甲').reason === 'invalid-actors', 'v2700: [3] actor collision with target refused');
  a(WA.rivalry.declare('甲', '乙', '目标', 150).reason === 'bad-weight', 'v2700: [3] weight > 100 refused');
  a(WA.rivalry.declare('甲', '乙', '目标', NaN).reason === 'bad-weight', 'v2700: [3] NaN weight refused (v2.78.0: 此前被静默降级 50)');
  a(WA.rivalry.declare('甲丙', '乙丙', '目标丙', 'x').reason === 'bad-weight', 'v2700: [3] non-number weight refused (v2.78.0)');
  const rvOk = WA.rivalry.declare('师姐', '师妹', '主角', 80);
  a(rvOk.ok === true && rvOk.weight === 80, 'v2700: [3] rivalry declared');
  a(WA.rivalry.modulate('路人', '主角', 20).reason === 'missing', 'v2700: [3] unrecorded rivalry modulate says missing');
  const modOk = WA.rivalry.modulate('师姐', '主角', 20);
  a(modOk.ok === true && modOk.feedback[0].rival === '师妹' && modOk.feedback[0].penalty === 16, 'v2700: [3] modulate calculates 80% penalty to rival');
  const ret = WA.rivalry.retire('师姐', '师妹', '主角');
  a(ret.ok === true, 'v2700: [3] rivalry retired');
  a(WA.rivalry.read('主角').count === 0, 'v2700: [3] target has no active rivalry after retirement');
  console.log('  ok v2700: sceneSlice / gauge / rivalry');
}

function probeSsGate(WA) { resetWorld(WA); return WA.sceneSlice.set('厅', 'indoor').reason; }
function probeSsEnv(WA) { resetWorld(WA); WA.sceneSlice.setSettings({ enabled: true }); return WA.sceneSlice.set('厅', 'wrong').reason; }
function probeSsTime(WA) { resetWorld(WA); WA.sceneSlice.setSettings({ enabled: true }); return WA.sceneSlice.set('厅', 'indoor', { time: 'bad' }).reason; }
function probeGgGate(WA) { resetWorld(WA); return WA.gauge.create('A').reason; }
function probeGgStepLim(WA) { resetWorld(WA); WA.gauge.setSettings({ enabled: true, maxStep: 10 }); WA.gauge.create('A'); return WA.gauge.step('A', 20).reason; }
function probeGgEvent(WA) { resetWorld(WA); WA.gauge.setSettings({ enabled: true }); WA.gauge.create('A', { initial: 20 }); return WA.gauge.step('A', 10).reason; }
function probeGgTop(WA) { resetWorld(WA); WA.gauge.setSettings({ enabled: true }); WA.gauge.create('A', { initial: 100 }); return WA.gauge.step('A', 5).reason; }
function probeRvGate(WA) { resetWorld(WA); return WA.rivalry.declare('A', 'B', 'T').reason; }
function probeRvActors(WA) { resetWorld(WA); WA.rivalry.setSettings({ enabled: true }); return WA.rivalry.declare('A', 'A', 'T').reason; }
function probeRvWeight(WA) { resetWorld(WA); WA.rivalry.setSettings({ enabled: true }); return WA.rivalry.declare('A', 'B', 'T', 999).reason; }
function probeRvModMiss(WA) { resetWorld(WA); WA.rivalry.setSettings({ enabled: true }); return WA.rivalry.modulate('X', 'Y', 10).reason; }

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
  { key: 'ss-gate', rel: 'engines/scene-slice.js', from: A_SS_GATE, to: kill(A_SS_GATE), hits: 1 },
  { key: 'ss-env', rel: 'engines/scene-slice.js', from: A_SS_ENV, to: kill(A_SS_ENV) },
  { key: 'ss-time', rel: 'engines/scene-slice.js', from: A_SS_TIME, to: kill(A_SS_TIME) },
  { key: 'gg-gate', rel: 'engines/gauge.js', from: A_GG_GATE, to: kill(A_GG_GATE), hits: 2 },
  { key: 'gg-steplim', rel: 'engines/gauge.js', from: A_GG_STEP_LIM, to: kill(A_GG_STEP_LIM) },
  { key: 'gg-event', rel: 'engines/gauge.js', from: A_GG_EVENT, to: kill(A_GG_EVENT) },
  { key: 'gg-top', rel: 'engines/gauge.js', from: A_GG_TOP, to: kill(A_GG_TOP) },
  { key: 'rv-gate', rel: 'engines/rivalry.js', from: A_RV_GATE, to: kill(A_RV_GATE), hits: 2 },
  { key: 'rv-actors', rel: 'engines/rivalry.js', from: A_RV_ACTORS, to: kill(A_RV_ACTORS) },
  { key: 'rv-weight', rel: 'engines/rivalry.js', from: A_RV_WEIGHT, to: kill(A_RV_WEIGHT) },
  { key: 'rv-modmiss', rel: 'engines/rivalry.js', from: A_RV_MOD_MISS, to: kill(A_RV_MOD_MISS) }
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
  BROKEN.forEach(function (s) { a(anchorHits(s) === expectHits(s), 'v2700: [N0] anchor hits declared count (' + expectHits(s) + ') :: ' + s.key); });
  a(probeWith(BROKEN[0], probeSsGate) !== 'disabled', 'v2700: [N1] sceneSlice gate removed');
  a(probeWith(BROKEN[1], probeSsEnv) !== 'bad-env', 'v2700: [N1] bad env accepted when guard removed');
  a(probeWith(BROKEN[2], probeSsTime) !== 'bad-time', 'v2700: [N1] bad time accepted when guard removed');
  a(probeWith(BROKEN[3], probeGgGate) !== 'disabled', 'v2700: [N1] gauge gate removed');
  a(probeWith(BROKEN[4], probeGgStepLim) !== 'step-too-large', 'v2700: [N1] step limit bypassed when guard removed');
  a(probeWith(BROKEN[5], probeGgEvent) !== 'missing-event', 'v2700: [N1] milestone jump without event accepted when guard removed');
  a(probeWith(BROKEN[6], probeGgTop) !== 'top', 'v2700: [N1] over-top accepted when guard removed');
  a(probeWith(BROKEN[7], probeRvGate) !== 'disabled', 'v2700: [N1] rivalry gate removed');
  a(probeWith(BROKEN[8], probeRvActors) !== 'invalid-actors', 'v2700: [N1] actor collision accepted when guard removed');
  a(probeWith(BROKEN[9], probeRvWeight) !== 'bad-weight', 'v2700: [N1] bad weight accepted when guard removed');
  a(probeWith(BROKEN[10], probeRvModMiss) !== 'missing', 'v2700: [N1] missing target accepted when guard removed');

  a(probeClean(probeSsGate) === 'disabled', 'v2700: [N2] clean refuses disabled sceneSlice');
  a(probeClean(probeSsEnv) === 'bad-env', 'v2700: [N2] clean refuses bad env');
  a(probeClean(probeSsTime) === 'bad-time', 'v2700: [N2] clean refuses bad time');
  a(probeClean(probeGgGate) === 'disabled', 'v2700: [N2] clean refuses disabled gauge');
  a(probeClean(probeGgStepLim) === 'step-too-large', 'v2700: [N2] clean refuses step too large');
  a(probeClean(probeGgEvent) === 'missing-event', 'v2700: [N2] clean refuses missing event on milestone');
  a(probeClean(probeGgTop) === 'top', 'v2700: [N2] clean refuses over top');
  a(probeClean(probeRvGate) === 'disabled', 'v2700: [N2] clean refuses disabled rivalry');
  a(probeClean(probeRvActors) === 'invalid-actors', 'v2700: [N2] clean refuses invalid actors');
  a(probeClean(probeRvWeight) === 'bad-weight', 'v2700: [N2] clean refuses bad weight');
  a(probeClean(probeRvModMiss) === 'missing', 'v2700: [N2] clean refuses missing modulate target');

  // N3 跨模块隔离
  a(probeWith(BROKEN[0], probeGgGate) === 'disabled', 'v2700: [N3] sceneSlice break does not touch gauge');
  a(probeWith(BROKEN[3], probeRvGate) === 'disabled', 'v2700: [N3] gauge break does not touch rivalry');
  a(probeWith(BROKEN[7], probeSsGate) === 'disabled', 'v2700: [N3] rivalry break does not touch sceneSlice');

  // N4 状态真实变更
  const chg = isolated(function () {
    const WA = fresh();
    resetWorld(WA);
    WA.gauge.setSettings({ enabled: true });
    WA.gauge.create('测试');
    WA.gauge.step('测试', 15);
    const r = WA.gauge.read('测试');
    return { val: r.val, count: st(WA).gauge.rows.length };
  });
  a(chg.val === 15 && chg.count === 1, 'v2700: [N4] state really changed');

  // N5 sentinel 未泄漏
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2700: [N5] sentinel did not leak');
}

function runAll(a) { isolated(function () { judge(a); }); }

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2700: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2700: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative };
