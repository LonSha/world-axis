#!/usr/bin/env node
'use strict';
/**
 * tests/inject-block-quota-cluster1-v2580.js
 * 「同形态尾部截断」簇一（hazard / lifeline / body-anatomy）名额自证与读数专锁（v2.580.0）
 *
 * 治的缺口：三个引擎的 buildBlock 都写着同一行
 *   `list.slice(-Math.max(1, cfg.maxRows))`
 *   三病与 v2.579.0 的 world-bridge 同形：
 *     ① 取**登记尾部**（≈登记顺序，与「哪条更新」无关）；
 *     ② `maxRows` 坏值时 `slice(NaN)` = `slice(0)` ⇒ **整环全念**（与上限正好相反）；
 *     ③ 念了几条、还有几条没念，一个字都不说。
 *   三者列的分别是「风险暗账 / 在身病况 / 场面身体」，都是**不念就等于「没有」**的面。
 *
 * 探针（/tmp/probe580.js，九条夹具、maxRows=3/2/2，改造前 → 改造后）：
 *   hazard.js      OLD 首条 h6（最旧尾三条）、无自证、block=undefined、'x' 时 20 条全念
 *                  NEW 首条 h0 + 「暗账 3/9 条，按登记时间新→旧取；另有 6 条未列出…」+ 五栗 / 'x' 回落 16
 *   lifeline.js    OLD 首条 w7（最旧）、无自证、'x' 时 14 条全念；NEW 首条 w0 + 「病况 2/9…」/ 'x' 回落 12
 *   body-anatomy.js OLD 首条 b7、无自证、'x' 时 26 具全念；NEW 首条 b0 + 「身体 2/9 具…」/ 'x' 回落 24
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 负控（每个引擎各一条，打的是「念了谁」那一行）。
 * 单独跑：node tests/inject-block-quota-cluster1-v2580.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const NOW = 1700000000000;
let pass = 0, fail = 0;
const fails = [];
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function stripComment(line) {
  const t = line.trim();
  if (t.indexOf('/*') === 0 || t.indexOf('*') === 0) return '';
  const i = line.indexOf('//');
  return i < 0 ? line : line.slice(0, i);
}
function codeOnly(text) { return text.split('\n').map(stripComment).join('\n'); }

// ---------- 三个引擎的夹具与登记表 ----------
function hazardRows(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ key: 'h' + i, note: '', count: 1, hits: 0, pending: false,
    waiting: 0, at: NOW - i * 1000, causedBy: 'manual' });
  return a;
}
function lifelineRows(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ who: 'w' + i, cond: '咳' + i, kind: 'acute', course: 'onset',
    limits: ['禁跑'], care: [], history: [], at: NOW - i * 1000, updatedAt: NOW - i * 1000 });
  return a;
}
function bodyRows(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ who: 'b' + i, tier: 'normal', tierLabel: '普通', facing: 'front',
    facingLabel: '面向读者', anchor: 'a' + i, heads: 1, arms: 2, legs: 2, holding: [], turn: '', move: '',
    scene: '', claims: [], at: NOW - i * 1000 });
  return a;
}
const ENGINES = [
  { rel: 'engines/hazard.js', ns: 'hazard', key: 'hazard', mk: hazardRows, mark: '· h', newest: 'h0', oldest: 'h6',
    cfg: { enabled: true, maxRows: 3, baseTarget: 10, floorTarget: 4, revealDelay: 3, weatherLink: false, triggerFactor: 2 },
    defMax: 16, proof: '暗账 3/9', noun: '条', mode: 'newest-first', maxConst: 'const ROWS_QUOTA_MAX = 32;' },
  { rel: 'engines/lifeline.js', ns: 'lifeline', key: 'lifeline', mk: lifelineRows, mark: 'w', newest: 'w0：', oldest: 'w7：',
    cfg: { enabled: true, maxRows: 2 }, defMax: 12, proof: '病况 2/9', noun: '条', mode: 'newest-first',
    maxConst: 'const ROWS_QUOTA_MAX = 24;' },
  { rel: 'engines/body-anatomy.js', ns: 'bodyAnatomy', key: 'bodyAnatomy', mk: bodyRows, mark: '· b', newest: 'b0', oldest: 'b7',
    cfg: { enabled: true, maxRows: 2 }, defMax: 24, proof: '身体 2/9', noun: '具', mode: 'newest-first',
    maxConst: 'const ROWS_QUOTA_MAX = 48;' }
];
ENGINES.forEach(function (E) {
  E.SRC = rd(E.rel);
  E.CODE = codeOnly(E.SRC);
});
function loadOne(code, E, rows, over) {
  let cfg = Object.assign({}, E.cfg, over || {});
  const state = {};
  state[E.key] = { rows: rows };
  const win = { WorldAxis: { registerModule: function () {} } };
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite, console: { log: function () {} } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; } };
  WA.inputGuard = { text: function (v, m) { return String(v == null ? '' : v).slice(0, m || 80); } };
  WA.store = { get: function () { return state; }, transact: function (fn) { fn(state); return { ok: true }; } };
  WA.settingsBus = { read: function () { return cfg; }, normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  WA.evict = { array: function () {} };
  return WA;
}
function blockOf(code, E, n, over) {
  const WA = loadOne(code, E, E.mk(n), over);
  const b = String(WA[E.ns].buildBlock() || '');
  const rows = b.split('\n').filter(function (x) {
    return x.indexOf(E.mark) === 0 && x.indexOf('（本面名额') < 0;
  });
  return { block: b, rows: rows, proof: (b.split('\n').filter(function (x) { return x.indexOf('（本面名额') >= 0; })[0] || ''),
    stat: WA[E.ns].stat() };
}

console.log('A 静态（三引擎各五条形态）');
ENGINES.forEach(function (E) {
  const name = path.basename(E.rel);
  ok('A' + (ENGINES.indexOf(E) + 1) + ' ' + name + '：名额常量 / quotaOf / pickRows 在位', function () {
    assert(E.CODE.indexOf(E.maxConst) > 0, E.maxConst + ' 不在');
    assert(E.CODE.indexOf('function quotaOf(cfg, key, max, fallback)') > 0, 'quotaOf 不在');
    assert(E.CODE.indexOf('function pickRows(list, quota, atOf, idOf)') > 0, 'pickRows 不在');
  });
  ok('A' + (ENGINES.indexOf(E) + 1) + 'b ' + name + '：旧刀（登记尾部）已消失', function () {
    assert(E.CODE.indexOf('slice(-Math.max(1, cfg.maxRows))') < 0, '旧截断还在');
  });
  ok('A' + (ENGINES.indexOf(E) + 1) + 'c ' + name + '：块尾自证 + block 五栗 + stat 深拷', function () {
    assert(E.CODE.indexOf('（本面名额：') > 0, '块尾自证不在');
    assert(E.CODE.indexOf('block: null, faults: {}') > 0, 'stat 没有 block:null 起点');
    assert(E.CODE.indexOf('hidden: sel.hidden, mode: sel.mode }') > 0, '五栗不在');
    assert(/block: stat\.block \? JSON\.parse\(JSON\.stringify\(stat\.block\)\) : null/.test(E.CODE), 'stat() 没深拷 block');
  });
});

console.log('B 行为（九条夹具，名额 3/2/2）');
ENGINES.forEach(function (E) {
  const name = path.basename(E.rel);
  ok('B' + (ENGINES.indexOf(E) + 1) + ' ' + name + '：念的是最新的，不是登记尾部', function () {
    const r = blockOf(E.CODE, E, 9);
    assert(r.rows.length === E.cfg.maxRows, '应念 ' + E.cfg.maxRows + ' 条，实 ' + r.rows.length);
    assert(r.rows[0].indexOf(E.newest) >= 0, '首条不是最新的：' + r.rows[0]);
    assert(r.block.indexOf(E.oldest) < 0, '最旧那条仍被念（说明还是取尾部）');
    assert(r.stat.block.hidden === 9 - E.cfg.maxRows, JSON.stringify(r.stat.block));
  });
  ok('B' + (ENGINES.indexOf(E) + 1) + 'b ' + name + '：坏配置回落 DEF，不把整环全念', function () {
    const r = blockOf(E.CODE, E, E.defMax + 4, { maxRows: 'x' });
    assert(r.rows.length === E.defMax, '应回落 ' + E.defMax + '，实 ' + r.rows.length);
    assert(r.stat.block.quota === E.defMax, JSON.stringify(r.stat.block));
  });
  ok('B' + (ENGINES.indexOf(E) + 1) + 'c ' + name + '：名额够 ⇒ 说「全部列出」、mode=all-fit', function () {
    const r = blockOf(E.CODE, E, 2, { maxRows: 9 });
    assert(r.proof.indexOf('全部列出') > 0, '名额够时没写「全部列出」：' + r.proof);
    assert(r.stat.block.mode === 'all-fit' && r.stat.block.hidden === 0, JSON.stringify(r.stat.block));
  });
});

console.log('C 读数');
ENGINES.forEach(function (E) {
  const name = path.basename(E.rel);
  ok('C' + (ENGINES.indexOf(E) + 1) + ' ' + name + '：五栗 / 空表 / 深拷 / 恒等式', function () {
    const r = blockOf(E.CODE, E, 9);
    const b = r.stat.block;
    assert(b.candidates === 9 && b.picked === E.cfg.maxRows && b.quota === E.cfg.maxRows
      && b.hidden === 9 - E.cfg.maxRows && b.mode === E.mode, JSON.stringify(b));
    assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
    const e = blockOf(E.CODE, E, 0);
    assert(e.block === '', '空表应返回空串');
    assert(e.stat.block && e.stat.block.mode === 'empty', JSON.stringify(e.stat.block));
    const fresh = loadOne(E.CODE, E, E.mk(9));
    assert(fresh[E.ns].stat().block === null, '没跑过应为 null');
    const WA = loadOne(E.CODE, E, E.mk(9)); WA[E.ns].buildBlock();
    const b2 = WA[E.ns].stat().block; b2.picked = 999;
    assert(WA[E.ns].stat().block.picked === E.cfg.maxRows, 'block 被外部改读数污染了');
  });
});

console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(E, code) {
  const bad = [];
  const r = blockOf(code, E, 9);
  if (r.rows.length !== E.cfg.maxRows) bad.push('B');
  if (!r.rows[0] || r.rows[0].indexOf(E.newest) < 0) bad.push('B');   // 判「念了谁」，不只判名额
  if (r.block.indexOf(E.oldest) >= 0) bad.push('B');
  if (r.proof.indexOf(E.proof) < 0) bad.push('B');
  if (!r.stat.block || r.stat.block.hidden !== 9 - E.cfg.maxRows) bad.push('B');
  const nanr = blockOf(code, E, E.defMax + 4, { maxRows: 'x' });
  if (nanr.rows.length !== E.defMax) bad.push('Bn');
  const e = blockOf(code, E, 0);
  if (!e.stat.block || e.stat.block.mode !== 'empty') bad.push('C');
  return bad;
}
ENGINES.forEach(function (E) {
  const name = path.basename(E.rel);
  const tag = 'N' + (ENGINES.indexOf(E) + 1);
  ok(tag + 'a ' + name + '：真源码零问题（负控前提）', function () {
    assert(problems(E, E.CODE).length === 0, problems(E, E.CODE).join(','));
  });
  ok(tag + 'b ' + name + '：回到登记尾部 ⇒ B 红', function () {
    const broken = E.CODE.replace('const sel = pickRows(pool, quota, function (r) { return ',
      'const sel = { candidates: pool.length, picked: pool.slice(-quota), hidden: Math.max(0, pool.length - quota), mode: "x" }; const _unused = (function (r) { return ');
    assert(broken !== E.CODE, '破坏未命中');
    assert(problems(E, broken).indexOf('B') >= 0, 'B 没红');
  });
  ok(tag + 'c ' + name + '：时间比较反向 ⇒ B 红（判的是那一行）', function () {
    const broken = E.CODE.replace('if (at !== bt) return bt - at;', 'if (at !== bt) return at - bt;');
    assert(broken !== E.CODE, '破坏未命中');
    assert(problems(E, broken).indexOf('B') >= 0, 'B 没红');
  });
  ok(tag + 'd ' + name + '：去掉名额守卫 ⇒ 坏配置判据红', function () {
    const broken = E.CODE.replace('if (!isFinite(n) || n < 1) return Math.min(max, fallback);', '');
    assert(broken !== E.CODE, '破坏未命中');
    assert(problems(E, broken).indexOf('Bn') >= 0, 'Bn 没红');
  });
  ok(tag + 'e ' + name + '：block 改回浅拷 ⇒ 读数面红', function () {
    const broken = E.CODE.replace('block: stat.block ? JSON.parse(JSON.stringify(stat.block)) : null', 'block: stat.block');
    assert(broken !== E.CODE, '破坏未命中');
    const WA = loadOne(broken, E, E.mk(9)); WA[E.ns].buildBlock();
    const b = WA[E.ns].stat().block; b.picked = 999;
    assert(WA[E.ns].stat().block.picked !== E.cfg.maxRows, '浅拷没红');
  });
});

console.log('');
if (fail) {
  console.log('INJECT-BLOCK-QUOTA-CLUSTER1-V2580: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('INJECT-BLOCK-QUOTA-CLUSTER1-V2580: pass（' + pass + ' 项）');