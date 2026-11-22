#!/usr/bin/env node
'use strict';
/**
 * tests/longline-block-v2564.js
 * 「长线伏笔注入名额」自证与读数专锁（v2.564.0）
 *
 * 治的缺口：engines/longline.js 的 buildBlock()。
 *   它的排序方向本来就对（overdue 按 lateBy 降序，最逾期的在前；
 *   探针 s7 证明倒序输入结论不变），但**截断不说还有几条**：
 *     · s1 10 条逾期 ⇒ 只念 4 条，读者无从知道还有 6 条
 *     · s2 stat() 无 block 读数 ⇒ 没构建过 / 构建过但空表 同形
 *     · s5 maxItems=1 时同样静默
 *
 * 本批只补两件事（不改判据）：
 *   ① 名额提成 quotaOf(cfg)（防 NaN/0），截断自证「另有 N 条逾期未列」；
 *   ② stat().block 五栗（candidates/picked/quota/hidden/mode）+ 单独拷贝。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 三条负控。
 * 单独跑：node tests/longline-block-v2564.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/longline.js';
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
function load(code, fsArr, over) {
  let cfg = Object.assign({ enabled: true, graceMs: 600000, maxItems: 4 }, over || {});
  const store = { memory: { foreshadows: fsArr } };
  const win = {};
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number, isFinite: isFinite };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.inputGuard = { text: function (v, m) {
    return String(v == null ? '' : v).trim().slice(0, m || 60); } };
  WA.clock = { now: function () { return NOW; } };
  WA.store = { get: function () { return store; },
    transact: function (fn) { fn(store); return { ok: true }; } };
  WA.settingsBus = { read: function () { return cfg; },
    normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  return WA;
}
function fx(i, lateMin, status) {
  return { id: 'f' + i, content: 'c' + i, status: status || 'waiting',
    dueAt: NOW - lateMin * 60000 };
}
function ten() {
  const a = [];
  for (let i = 0; i < 10; i++) a.push(fx(i, 120 - i * 10));
  return a;
}
function rowsOf(b) {
  if (!b) return [];
  return String(b).split('\n').filter(function (l) { return l.indexOf('- ') === 0; });
}
function pickedOf(b) {
  return rowsOf(b).filter(function (l) { return l.indexOf('另有') < 0; });
}
console.log('A 静态');
ok('A1 名额具名 quotaOf，且 buildBlock 走它', function () {
  assert(CODE.indexOf('function quotaOf(cfg)') > 0, 'quotaOf 不在');
  assert(CODE.indexOf('var quota = quotaOf(cfg);') > 0, 'buildBlock 没走 quotaOf');
});
ok('A2 stat 有 block 声明 + 单独拷贝', function () {
  assert(CODE.indexOf('block: null') > 0, 'stat 没声明 block');
  assert(CODE.indexOf('o.block = stat.block ? Object.assign({}, stat.block) : null') > 0,
    'stat() 没单独拷 block');
});
ok('A3 截断自证行在位', function () {
  assert(CODE.indexOf("'- 另有 ' + hidden") > 0, '自证行不在');
});
ok('A4 排序方向未改（仍是 lateBy 降序）', function () {
  assert(CODE.indexOf('return b.lateBy - a.lateBy;') > 0, 'lateBy 降序不在');
});
ok('A5 文档边界 4 在位', function () {
  assert(SRC.indexOf('4 注入面名额（maxItems）只截断不参与筛选') > 0, '边界 4 不在');
});
console.log('B 行为');
ok('B1 10 条逾期 ⇒ 念 4 条 + 自证 6 条', function () {
  const b = load(CODE, ten()).longline.buildBlock();
  assert(pickedOf(b).length === 4, '念的条数应 4（实 ' + pickedOf(b).length + '）');
  assert(/另有 6 条/.test(b), '自证不对');
});
ok('B2 自证不影响最逾期先（f0 在最前）', function () {
  const p = pickedOf(load(CODE, ten()).longline.buildBlock());
  assert(/^- f0：/.test(p[0]), '首条不是最逾期（实 ' + p[0] + '）');
});
ok('B3 名额够时无自证', function () {
  const b = load(CODE, ten().slice(0, 3)).longline.buildBlock();
  assert(pickedOf(b).length === 3, '3 条应全念');
  assert(b.indexOf('另有') < 0, '不该有自证');
});
ok('B4 maxItems=1 ⇒ 1 条 + 自证 9 条', function () {
  const b = load(CODE, ten(), { maxItems: 1 }).longline.buildBlock();
  assert(pickedOf(b).length === 1, '应只念 1 条');
  assert(/另有 9 条/.test(b), '自证不对');
});
ok('B5 倒序输入结论不变', function () {
  const a = pickedOf(load(CODE, ten()).longline.buildBlock()).join(',');
  const c = pickedOf(load(CODE, ten().slice().reverse()).longline.buildBlock()).join(',');
  assert(a === c, '倒序后结论变了');
});
ok('B6 grace 内不算、recycled 不算', function () {
  const b = load(CODE, [fx(1, 1), fx(2, 1, 'recycled')]).longline.buildBlock();
  assert(pickedOf(b).length === 0, '不该念（实 ' + pickedOf(b).length + '）');
});
console.log('C 读数');
ok('C1 五栗正确（10 条 ⇒ 4/4/6/worst-first）', function () {
  const A = load(CODE, ten());
  A.longline.buildBlock();
  const b = A.longline.stat().block;
  assert(b && b.candidates === 10 && b.picked === 4, JSON.stringify(b));
  assert(b.quota === 4 && b.hidden === 6, JSON.stringify(b));
  assert(b.mode === 'worst-first', 'mode 应 worst-first（实 ' + b.mode + '）');
});
ok('C2 名额够 ⇒ mode=all-fit', function () {
  const A = load(CODE, ten().slice(0, 3));
  A.longline.buildBlock();
  assert(A.longline.stat().block.mode === 'all-fit', 'mode 应 all-fit');
});
ok('C3 没构建过 vs 空表可分辨', function () {
  const A = load(CODE, []);
  assert(A.longline.stat().block === null, '没构建过应是 null');
  A.longline.buildBlock();
  assert(A.longline.stat().block.mode === 'empty', '空表 mode 应 empty');
});
ok('C4 block 是拷贝', function () {
  const A = load(CODE, ten());
  A.longline.buildBlock();
  const b1 = A.longline.stat().block;
  b1.picked = 999;
  assert(A.longline.stat().block.picked === 4, '读数被外部改了');
});
ok('C5 picked + hidden = candidates', function () {
  const A = load(CODE, ten());
  A.longline.buildBlock();
  const b = A.longline.stat().block;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const b1 = load(code, ten());
  const blk = b1.longline.buildBlock();
  if (pickedOf(blk).length !== 4) bad.push('B1a');
  if (!/另有 6 条/.test(blk)) bad.push('B1b');
  if (!/^- f0：/.test(pickedOf(blk)[0] || '')) bad.push('B2');
  const A = load(code, ten());
  A.longline.buildBlock();
  const bb = A.longline.stat().block;
  if (!bb || bb.hidden !== 6 || bb.mode !== 'worst-first') bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉自证行 ⇒ B1b 红', function () {
  const broken = CODE.replace('lines.push(\'- 另有 \' + hidden + \' 条逾期未列出\'\n        + \'（本面只念最逾期的 \' + picked.length + \' 条）\');', '');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1b') >= 0, 'B1b 没红（实 ' + bad.join(',') + '）');
});
ok('N2 hidden 恒 0 ⇒ B1b + C1 红', function () {
  const broken = CODE.replace('var hidden = Math.max(0, rows.length - quota);', 'var hidden = 0;');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1b') >= 0, 'B1b 没红（实 ' + bad.join(',') + '）');
  assert(bad.indexOf('C1') >= 0, 'C1 没红（实 ' + bad.join(',') + '）');
});
ok('N3 排序反向 ⇒ B2 红', function () {
  const broken = CODE.replace('return b.lateBy - a.lateBy;', 'return a.lateBy - b.lateBy;');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B2') >= 0, 'B2 没红（实 ' + bad.join(',') + '）');
});
console.log('');
if (fail) {
  console.log('LONGLINE-BLOCK-V2564: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('LONGLINE-BLOCK-V2564: pass（' + pass + ' 项）');
