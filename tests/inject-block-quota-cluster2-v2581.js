#!/usr/bin/env node
'use strict';
/**
 * tests/inject-block-quota-cluster2-v2581.js
 * 「同形态尾部截断」簇二（13 引擎）名额自证与读数专锁（v2.581.0）
 *
 * 治的缺口：13 个引擎的 buildBlock 都写着同一行
 *   `X.slice(-Math.max(1, cfg.maxRows))` —— 取**登记尾部**、零自证、
 *   `maxRows` 坏值时 `slice(NaN)`=`slice(0)` **整环全念**（与上限正好相反）。
 * 与 v2.580.0 的三引擎同一形态，本批一次性统一：
 *   pickQuota（名额只截断、不参与筛选；按 updatedAt/at 新→旧，同刻 who/key/id 兜底）
 *   + 块尾自证包装（不动原正文拼接）
 *   + `stat.block` 用**取值器**持有（`Object.assign({}, stat)` 当场取到深拷，堵掉浅拷老坑）。
 *
 * 探针（/tmp/probe581.js，九条富行夹具、maxRows=2，HEAD → 工作区）：
 *   9 个引擎渲染出行：OLD 首条 r7（登记尾部）/ 零自证 / block=undefined，
 *                     NEW 首条 r0（最新）+「（本面名额：X 2/9 条…另有 7 条未列出）」+ 五栗；
 *   4 个引擎（beast-bond / fondness / masks / temperament）自身还有筛选条件，富行被它们滤掉 ⇒
 *     渲染 0 行，但名额五栗与自证照常成立（本锁对「渲染不出行」不装看不见：那条测的是
 *     「排序可观测」，这四家不适用，见 B 段的 rendered 标记）。
 *   13 家一律：nan OLD = defMax+4（整环）→ NEW = defMax（回落）；空表 NEW mode='empty'、OLD undefined。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 负控（排序负控只打在真能观测到顺序的引擎上）。
 * 单独跑：node tests/inject-block-quota-cluster2-v2581.js
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

// 登记表：9 个能渲染出行（rendered:true），4 个自带筛选（rendered:false）
const ENGINES = [
  { f: 'appearance', ns: 'appearance', bucket: 'appearance', defMax: 24, label: '外形', rendered: true },
  { f: 'beast-bond', ns: 'beastBond', bucket: 'beastBond', defMax: 10, label: '羁绊', rendered: false },
  { f: 'bonds', ns: 'bonds', bucket: 'bonds', defMax: 12, label: '关系', rendered: true },
  { f: 'enigma', ns: 'enigma', bucket: 'enigma', defMax: 24, label: '谜面', rendered: true },
  { f: 'era-cycle', ns: 'eraCycle', bucket: 'eraCycle', defMax: 8, label: '纪元', rendered: true },
  { f: 'fondness', ns: 'fondness', bucket: 'fondness', defMax: 16, label: '好感', rendered: false },
  { f: 'karma', ns: 'karma', bucket: 'karma', defMax: 16, label: '因果', rendered: true },
  { f: 'ladder', ns: 'ladder', bucket: 'ladder', defMax: 16, label: '阶梯', rendered: true },
  { f: 'marginal', ns: 'marginal', bucket: 'marginal', defMax: 16, label: '边缘', rendered: true },
  { f: 'masks', ns: 'masks', bucket: 'masks', defMax: 10, label: '面具', rendered: false },
  { f: 'survival', ns: 'survival', bucket: 'survival', defMax: 12, label: '生存', rendered: true },
  { f: 'temperament', ns: 'temperament', bucket: 'temperament', defMax: 12, label: '性情', rendered: false },
  { f: 'tolerance', ns: 'tolerance', bucket: 'tolerance', defMax: 24, label: '耐受', rendered: true }
];
ENGINES.forEach(function (E) {
  E.rel = 'engines/' + E.f + '.js';
  E.SRC = rd(E.rel);
  E.CODE = codeOnly(E.SRC);
});

function rich(i) {
  return { id: 'r' + i, key: 'r' + i, who: 'r' + i, name: 'r' + i,
    at: NOW - i * 1000, updatedAt: NOW - i * 1000, createdAt: NOW - i * 1000,
    kind: 'k', level: i, stage: i, count: 1, hits: [9], pending: false, note: 'note' + i,
    label: 'L' + i, title: 'T' + i, text: 'x' + i, tag: 't', value: 1 + i, score: 1, day: 1, atDays: 1,
    tier: 'normal', tierLabel: '普通', facing: 'front', facingLabel: '面向读者', heads: 1, arms: 2, legs: 2,
    holding: [], limits: ['x'], care: [], history: [], cond: '咳', course: 'onset', mask: 'm',
    state: 'on', from: 'w', heard: 0, valence: 1, arousal: 1, bond: 1, trust: 1, fear: 1,
    types: ['友'], rungs: ['一档', '二档', '三档'], idx: 0, steps: ['a'], chain: ['a'], marks: [] };
}
function mkRows(n) { const a = []; for (let i = 0; i < n; i++) a.push(rich(i)); return a; }
function load(code, E, n, over) {
  let cfg = Object.assign({ enabled: true, maxRows: 2 }, over || {});
  const state = {};
  state[E.bucket] = { rows: mkRows(n) };
  const win = { WorldAxis: { registerModule: function () {} } };
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite, console: { log: function () {} } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; } };
  WA.inputGuard = { text: function (v, m) { return String(v == null ? '' : v).slice(0, m || 120); } };
  WA.store = { get: function () { return state; }, transact: function (fn) { fn(state); return { ok: true }; } };
  WA.settingsBus = { read: function () { return cfg; }, normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  WA.evict = { array: function () {} };
  return WA;
}
function snap(code, E, n, over) {
  const WA = load(code, E, n, over);
  const out = String(WA[E.ns].buildBlock() || '');
  const ids = [];
  for (let i = 0; i < n; i++) if (out.indexOf('r' + i) >= 0) ids.push(i);
  return { out: out, ids: ids,
    proof: (out.split('\n').filter(function (x) { return x.indexOf('（本面名额') >= 0; })[0] || ''),
    block: WA[E.ns].stat().block, WA: WA };
}
function binOf(E) { return E.bucket; }   // 只为可读性

console.log('A 静态（13 家同五条形态）');
ENGINES.forEach(function (E, k) {
  ok('A' + (k + 1) + ' ' + E.f + '：pickQuota / 自证包装 / block 取值器在位，旧刀消失', function () {
    assert(E.CODE.indexOf('function pickQuota(arr, cfg)') > 0, 'pickQuota 不在');
    assert(E.CODE.indexOf('function pickRows(list, quota, atOf, idOf)') > 0, 'pickRows 不在');
    assert(E.CODE.indexOf('buildBlock = (function (inner) {') > 0, '块尾自证包装不在');
    assert(/Object\.defineProperty\(stat, 'block'/.test(E.CODE), 'block 取值器不在');
    assert(E.CODE.indexOf('.slice(-Math.max(1, cfg.maxRows))') < 0, '旧刀还在（登记尾部）');
  });
});

console.log('B 行为（九条富行、名额 2）');
ENGINES.forEach(function (E, k) {
  ok('B' + (k + 1) + ' ' + E.f + '：五栗 / 自证 / ' + (E.rendered ? '念的是最新的' : '渲染被自身筛选滤掉但读数仍成立'), function () {
    const r = snap(E.CODE, E, 9);
    const b = r.block;
    assert(b && b.picked === 2 && b.quota === 2 && b.mode === 'newest-first', JSON.stringify(b));
    assert(b.hidden === b.candidates - 2 && b.picked + b.hidden === b.candidates, JSON.stringify(b));
    assert(r.proof.indexOf('（本面名额：' + E.label + ' 2/' + b.candidates) === 0, '自证不对：' + r.proof);
    assert(r.proof.indexOf('另有 ' + b.hidden + ' 条未列出') > 0, '自证没报未列数：' + r.proof);
    if (E.rendered) {
      // 判「念了谁」而不是只判名额：渲染出的首条必须是候选里最新的（索引最小）
      assert(r.ids.length === 2, '应渲染 2 条，实 ' + r.ids.length);
      assert(r.ids[0] === Math.min.apply(null, r.ids), '首条不是最新的：ids=' + r.ids.join(','));
      assert(Math.max.apply(null, r.ids) < 9 - 2, '渲染集落在尾部（尾截断或时间反向）：ids=' + r.ids.join(','));
    } else {
      assert(r.ids.length === 0, '本应对自身筛选后为空，实渲染 ' + r.ids.length + ' 条');
    }
  });
});

console.log('C 读数');
ENGINES.forEach(function (E, k) {
  ok('C' + (k + 1) + ' ' + E.f + '：坏配置回落 DEF / 空表 empty / block 深拷', function () {
    const nan = snap(E.CODE, E, E.defMax + 4, { maxRows: 'x' });
    assert(nan.block.quota === E.defMax, JSON.stringify(nan.block));
    assert(nan.block.picked === Math.min(E.defMax, nan.block.candidates), JSON.stringify(nan.block));
    assert(nan.block.picked <= E.defMax, '坏配置放大了名额：' + JSON.stringify(nan.block));
    const empty = snap(E.CODE, E, 0);
    assert(empty.out === '', '空表应返回空串');
    assert(empty.block && empty.block.mode === 'empty', JSON.stringify(empty.block));
    const fresh = load(E.CODE, E, 9);
    assert(fresh[E.ns].stat().block === null, '没跑过应为 null');
    const WA = load(E.CODE, E, 9); WA[E.ns].buildBlock();
    const before = WA[E.ns].stat().block.picked;
    const b = WA[E.ns].stat().block; b.picked = 999;
    assert(WA[E.ns].stat().block.picked === before, 'block 被外部改读数污染了');
  });
});

console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
/** 排序负控只打在「真能观测到顺序」的引擎上：另四家自身筛选把富行滤掉，顺序不可观测，
 *  拿它们判排序就是假绿 —— 这条界限写在判据里，不靠注释。 */
ok('N0 真源码：13 家排序全部绿（负控前提）', function () {
  const bad = ENGINES.filter(function (E) {
    if (!E.rendered) return false;
    const r = snap(E.CODE, E, 9);
    return !(r.ids.length === 2 && r.ids[0] === Math.min.apply(null, r.ids) && Math.max.apply(null, r.ids) < 9 - 2);
  }).map(function (E) { return E.f; });
  assert(bad.length === 0, bad.join(','));
});
ENGINES.filter(function (E) { return E.rendered; }).forEach(function (E, k) {
  ok('N1-' + (k + 1) + ' ' + E.f + '：pickQuota 退回尾部 ⇒ 顺序判据红', function () {
    const broken = E.CODE.replace('return sel.picked;', 'return arr.slice(-q);');
    assert(broken !== E.CODE, '破坏未命中');
    const r = snap(broken, E, 9);
    assert(r.ids[0] !== Math.min.apply(null, r.ids) || r.ids.length !== 2 || Math.max.apply(null, r.ids) >= 9 - 2, '顺序判据没红');
  });
});
ENGINES.forEach(function (E, k) {
  ok('N2-' + (k + 1) + ' ' + E.f + '：时间比较反向 ⇒ 顺序判据红' + (E.rendered ? '' : '（不适用：自身筛选后无序可观测）'), function () {
    const broken = E.CODE.replace('if (at !== bt) return bt - at;', 'if (at !== bt) return at - bt;');
    assert(broken !== E.CODE, '破坏未命中');
    if (!E.rendered) return;   // 显式不适用，不伪装成绿
    const r = snap(broken, E, 9);
    assert(r.ids[0] !== Math.min.apply(null, r.ids) || Math.max.apply(null, r.ids) >= 9 - 2, '顺序判据没红：ids=' + r.ids.join(','));
  });
});
ENGINES.forEach(function (E, k) {
  ok('N3-' + (k + 1) + ' ' + E.f + '：去掉名额守卫 ⇒ 坏配置判据红', function () {
    const broken = E.CODE.replace('if (!isFinite(n) || n < 1) return Math.min(max, fallback);', '');
    assert(broken !== E.CODE, '破坏未命中');
    const nan = snap(broken, E, E.defMax + 4, { maxRows: 'x' });
    assert(!nan.block || nan.block.quota !== E.defMax || nan.block.picked !== Math.min(E.defMax, nan.block.candidates), '坏配置判据没红');
  });
});
ENGINES.forEach(function (E, k) {
  ok('N4-' + (k + 1) + ' ' + E.f + '：去掉块尾自证 ⇒ 自证判据红', function () {
    const broken = E.CODE.replace('buildBlock = (function (inner) {', 'buildBlock = (function (inner) { return function () { return inner(); }; })(function (x) { return x; })((function (inner) {');
    assert(broken !== E.CODE, '破坏未命中');
    let out;
    try { out = String(load(broken, E, 9)[E.ns].buildBlock() || ''); } catch (e) { return; }  // 破坏后语法仍可跑
    assert(out.indexOf('（本面名额') < 0, '自证判据没红');
  });
});
ENGINES.forEach(function (E, k) {
  ok('N5-' + (k + 1) + ' ' + E.f + '：block 改回普通属性 ⇒ 深拷判据红', function () {
    const broken = E.CODE.replace(/Object\.defineProperty\(stat, 'block', \{[\s\S]*?\n  \}\);/, 'stat.block = null;');
    assert(broken !== E.CODE, '破坏未命中');
    const WA = load(broken, E, 9); WA[E.ns].buildBlock();
    const b = WA[E.ns].stat().block; b.picked = 999;
    assert(WA[E.ns].stat().block.picked !== 2, '深拷判据没红');
  });
});

console.log('');
if (fail) {
  console.log('INJECT-BLOCK-QUOTA-CLUSTER2-V2581: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('INJECT-BLOCK-QUOTA-CLUSTER2-V2581: pass（' + pass + ' 项）');