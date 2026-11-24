#!/usr/bin/env node
'use strict';
/**
 * tests/sediment-block-quota-v2572.js
 * 「此地痕迹注入名额」自证与读数专锁（v2.572.0）
 *
 * 治的缺口：engines/sediment.js 的 buildBlock()。
 *   排序方向本来就对（feel 按 at 降序），但**截断不说还有几条**：
 *   八条痕迹、名额 3 ⇒ 只念 3 条，另 5 条无声消失。
 *
 *   探针实测（/tmp/probe572.js，改造前 → 改造后）：
 *     · s1 八条 ⇒ 念 3 条 + 自证 5 条（false → true）
 *     · s3 maxItems=1 ⇒ 静默（false → 自证「另有 7 条」）
 *     · s5 stat() 无 block 读数（undefined → 五栗）
 *     · s6 maxItems 被写成字符串 ⇒ 旧写法 NaN ⇒ 注面整块消失（0 条 → 回落 4 条）
 *     · s8 空表：没构建过与构建过但空表同形（undefined → null / empty）
 *   注：s9 倒序输入结论不变 —— 这条**旧版就是 true**（feel 已排序），
 *   所以本批不改判据，只补「名额具名 + 截断自证 + 读数」。
 *
 * 本批三件事：
 *   ① 名额提成 quotaOf(cfg)（防 NaN/0，上限 QUOTA_MAX=8）；
 *   ② pickTraces 显式按 at 降序 + key 字典序再排一次（守「同输入同输出」，不改方向）；
 *   ③ 截断自证「另有 N 条痕迹未列出（本面只念最新的 M 条）」+ stat().block 五栗。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 四条负控。
 * 单独跑：node tests/sediment-block-quota-v2572.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/sediment.js';
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
const SRC = rd(REL);
const CODE = codeOnly(SRC);
const NOW = 1700000000000;
const DAY = 86400000;
function load(code, state, over) {
  let cfg = Object.assign({ enabled: true, traceWindowMs: DAY, maxItems: 3,
    capPlaces: 24, capEvents: 48, capTotal: 96 }, over || {});
  const st = state || { sediment: { rows: [] } };
  const win = {};
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number, isFinite: isFinite };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.inputGuard = { text: function (v, m) {
    return String(v == null ? '' : v).trim().slice(0, m || 60); } };
  WA.clock = { now: function () { return NOW; } };
  WA.store = { get: function () { return st; },
    transact: function (fn) { fn(st); return { ok: true }; } };
  WA.settingsBus = { read: function () { return cfg; },
    normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  WA.evict = { array: function () {} };
  WA.sceneSlice = { read: function () { return { ok: true, place: 'p' }; } };
  return WA;
}
function ev(i, trace, at) { return { key: 'k' + i, text: 't' + i, trace: trace, kind: 'other', at: at }; }
function eight() {
  const a = [];
  for (let i = 0; i < 8; i++) a.push(ev(i, 3, NOW - 1000 * i));
  return [{ place: 'p', events: a }];
}
function linesOf(b) { return String(b || '').split('\n').filter(function (l) {
  return l.indexOf('- ') === 0; }); }
function pickedOf(b) { return linesOf(b).filter(function (l) { return l.indexOf('另有') < 0; }); }
console.log('A 静态');
ok('A1 名额具名 quotaOf，且 buildBlock 走它', function () {
  assert(CODE.indexOf('function quotaOf(cfg)') > 0, 'quotaOf 不在');
  assert(CODE.indexOf('var quota = quotaOf(cfg);') > 0, 'buildBlock 没走 quotaOf');
});
ok('A2 截断自证行在位', function () {
  assert(CODE.indexOf("'- 另有 ' + pk.hidden") > 0, '自证行不在');
});
ok('A3 stat 声明并单独拷贝 block', function () {
  assert(CODE.indexOf('stat.block = { candidates:') > 0, 'block 没写入');
  assert(CODE.indexOf('out.block = stat.block ? Object.assign({}, stat.block) : null') > 0,
    'statOf 没单独拷 block');
});
ok('A4 旧写法已消失（不再直接切 feel 的行）', function () {
  assert(CODE.indexOf(".slice(0, cfg.maxItems)") < 0, '旧写法还在');
  assert(CODE.indexOf('function pickTraces(list, quota)') > 0, 'pickTraces 不在');
});
ok('A5 文档边界 7 在位', function () {
  assert(SRC.indexOf('7 注入面名额（maxItems）只截断不参与筛选') > 0, '边界 7 不在');
});
console.log('B 行为');
ok('B1 八条 ⇒ 念 3 条 + 自证 5 条', function () {
  const b = load(CODE, { sediment: { rows: eight() } }).sediment.buildBlock('p');
  assert(pickedOf(b).length === 3, '念的条数应 3（实 ' + pickedOf(b).length + '）');
  assert(/另有 5 条痕迹未列出/.test(b), '自证不对：' + JSON.stringify(b).slice(0, 200));
});
ok('B2 最新的先（注面只念 trace 与正文，故认 t0）', function () {
  const p = pickedOf(load(CODE, { sediment: { rows: eight() } }).sediment.buildBlock('p'));
  assert(/t0$/.test(p[0] || ''), '首条不是最新的 t0（实 ' + (p[0] || '') + '）');
});
ok('B3 名额够 ⇒ 无自证', function () {
  const three = eight()[0].events.slice(0, 3);
  const b = load(CODE, { sediment: { rows: [{ place: 'p', events: three }] } }).sediment.buildBlock('p');
  assert(pickedOf(b).length === 3, '3 条应全念');
  assert(b.indexOf('另有') < 0, '不该有自证');
});
ok('B4 maxItems=1 ⇒ 1 条 + 自证 7 条', function () {
  const b = load(CODE, { sediment: { rows: eight() } }, { maxItems: 1 }).sediment.buildBlock('p');
  assert(pickedOf(b).length === 1, '应只念 1 条');
  assert(/另有 7 条/.test(b), '自证不对：' + JSON.stringify(b).slice(0, 200));
});
ok('B5 maxItems 被写成字符串 ⇒ 回落默认名额，注面不整块消失', function () {
  const b = load(CODE, { sediment: { rows: eight() } }, { maxItems: 'x' }).sediment.buildBlock('p');
  assert(pickedOf(b).length === 4, '应回落 4 条（实 ' + pickedOf(b).length + '）');
});
ok('B6 倒序输入结论不变（可复算）', function () {
  const a = pickedOf(load(CODE, { sediment: { rows: eight() } }).sediment.buildBlock('p')).join('|');
  const rev = [{ place: 'p', events: eight()[0].events.slice().reverse() }];
  const c = pickedOf(load(CODE, { sediment: { rows: rev } }).sediment.buildBlock('p')).join('|');
  assert(a === c, '倒序后结论变了');
});
ok('B7 传说档不进候选（不占名额）', function () {
  const evs = [ev(0, 3, NOW), ev(1, 1, NOW - 5 * DAY)];
  const b = load(CODE, { sediment: { rows: [{ place: 'p', events: evs }] } }).sediment.buildBlock('p');
  assert(pickedOf(b).length === 1, '应只念 1 条（实 ' + pickedOf(b).length + '）');
  assert(b.indexOf('另有') < 0, '只有 1 条候选，不该有自证');
});
ok('B8 没有沉积的地点 ⇒ 空串', function () {
  const b = load(CODE, { sediment: { rows: [] } }).sediment.buildBlock('p');
  assert(b === '', '空表应返回空串（实 ' + JSON.stringify(b) + '）');
});
console.log('C 读数');
ok('C1 五栗正确（八条 ⇒ 3/3/5/freshest-first）', function () {
  const A = load(CODE, { sediment: { rows: eight() } });
  A.sediment.buildBlock('p');
  const b = A.sediment.stat().block;
  assert(b && b.candidates === 8 && b.picked === 3, JSON.stringify(b));
  assert(b.quota === 3 && b.hidden === 5, JSON.stringify(b));
  assert(b.mode === 'freshest-first', 'mode 应 freshest-first（实 ' + b.mode + '）');
});
ok('C2 名额够 ⇒ mode=all-fit', function () {
  const three = eight()[0].events.slice(0, 3);
  const A = load(CODE, { sediment: { rows: [{ place: 'p', events: three }] } });
  A.sediment.buildBlock('p');
  assert(A.sediment.stat().block.mode === 'all-fit', 'mode 应 all-fit');
});
ok('C3 没构建过 vs 空表可分辨', function () {
  const A = load(CODE, { sediment: { rows: [] } });
  assert(A.sediment.stat().block === null, '没构建过应是 null');
  A.sediment.buildBlock('p');
  assert(A.sediment.stat().block.mode === 'empty', '空表 mode 应 empty');
});
ok('C4 block 是拷贝', function () {
  const A = load(CODE, { sediment: { rows: eight() } });
  A.sediment.buildBlock('p');
  const b1 = A.sediment.stat().block;
  b1.picked = 999;
  assert(A.sediment.stat().block.picked === 3, '读数被外部改了');
});
ok('C5 picked + hidden = candidates', function () {
  const A = load(CODE, { sediment: { rows: eight() } });
  A.sediment.buildBlock('p');
  const b = A.sediment.stat().block;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const b = load(code, { sediment: { rows: eight() } }).sediment.buildBlock('p');
  if (pickedOf(b).length !== 3) bad.push('B1a');
  if (!/另有 5 条痕迹未列出/.test(b)) bad.push('B1b');
  const A = load(code, { sediment: { rows: eight() } });
  A.sediment.buildBlock('p');
  const bb = A.sediment.stat().block;
  if (!bb || bb.hidden !== 5 || bb.mode !== 'freshest-first') bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉自证行 ⇒ B1b 红', function () {
  const broken = CODE.replace("lines.push('- 另有 ' + pk.hidden + ' 条痕迹未列出（本面只念最新的 ' + pk.picked.length + ' 条）');", '');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1b') >= 0, 'B1b 没红（实 ' + bad.join(',') + '）');
});
ok('N2 hidden 恒 0 ⇒ B1b + C1 红', function () {
  const broken = CODE.replace('hidden: Math.max(0, arr.length - quota)', 'hidden: 0');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1b') >= 0, 'B1b 没红（实 ' + bad.join(',') + '）');
  assert(bad.indexOf('C1') >= 0, 'C1 没红（实 ' + bad.join(',') + '）');
});
ok('N3 名额去掉 NaN 守卫 ⇒ B5 红', function () {
  const broken = CODE.replace('if (!isFinite(n) || n < 1) n = DEF.maxItems;', '');
  assert(broken !== CODE, '破坏未命中');
  const b = load(broken, { sediment: { rows: eight() } }, { maxItems: 'x' }).sediment.buildBlock('p');
  assert(pickedOf(b).length !== 4, 'B5 没红（实 ' + pickedOf(b).length + '）');
});
ok('N4 排序反向 ⇒ B2 红', function () {
  const broken = CODE.replace('if (ta !== tb) return tb - ta;', 'if (ta !== tb) return ta - tb;');
  assert(broken !== CODE, '破坏未命中');
  const p = pickedOf(load(broken, { sediment: { rows: eight() } }).sediment.buildBlock('p'));
  assert(!/t0$/.test(p[0] || ''), 'B2 没红（实 ' + (p[0] || '') + '）');
});
console.log('');
if (fail) {
  console.log('SEDIMENT-BLOCK-QUOTA-V2572: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('SEDIMENT-BLOCK-QUOTA-V2572: pass（' + pass + ' 项）');