#!/usr/bin/env node
'use strict';
/**
 * tests/aftermath-block-quota-v2563.js
 * 「地点后果注入名额」分配判据专锁（v2.563.0）
 *
 * 治的缺口：engines/aftermath.js 的 buildBlock()。
 *   旧写法 cur.slice(0, Math.max(1, Math.floor(cfg.maxEffects / 2)))
 *   取的是**数组最旧**的一半（effects 是 push 追加，旧在前）。
 *
 *   探针实测（/tmp/probe563.js，改造前）：
 *     · s1 30 条 active ⇒ 只列 24 条，且全是 p0..p23（最旧）
 *     · s2 31 条里最新一条是「议事厅刚被烧」⇒ 注面 hasHall=false
 *     · s3 把数组顺序倒过来，列出的 24 条就全变了（不可复算）
 *     · s5 截断没有自证（读者不知道还有几条）
 *     · s6 stat() 无 block 读数（没构建过 / 构建过但空表 同形）
 *     · s7 名额是 maxEffects/2 的派生值，没具名也没写为什么是一半
 *
 * 本批四件事：
 *   ① BLOCK_SHARE = 0.5 + blockQuota(cfg)，名额具名（占一半的理由：
 *      后果面不能吃掉整个注入预算）；
 *   ② pickBlock：候选先筛（只按 active），排序再截断；四条键
 *      ① 快过期的先 ② registeredAt 新的先 ③ id 字典序；
 *   ③ 截断自证：「另有 N 条地点后果未列出（本面只念最该先说的 M 条）」；
 *   ④ stat().block 五栏（candidates/picked/quota/hidden/mode）+ 单独拷贝。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 四条负控。
 * 单独跑：node tests/aftermath-block-quota-v2563.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const REL = 'engines/aftermath.js';
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
const assert = require('assert');
const CAP = 48;
function mk(id, place, type, regAt, extra) {
  const r = { id: id, placeId: place, eventId: 'ev_' + id, effectType: type,
    description: 'd_' + id, duration: 0, expiresAt: 0, status: 'active',
    repairCost: 0, repairCostType: 'material', repairTime: 0, repairProgress: 0,
    registeredAt: regAt, repairedAt: 0, cancelledAt: 0 };
  return Object.assign(r, extra || {});
}
function load(code, effects, over) {
  let cfg = Object.assign({ enabled: true, maxEffects: CAP }, over || {});
  const store = { aftermath: { effects: effects || [] } };
  const WA = {
    clock: { now: function () { return NOW; } },
    inputGuard: { text: function (v, m) {
      return String(v == null ? '' : v).trim().slice(0, m || 60);
    } },
    store: { get: function () { return store; },
      transact: function (fn) { fn(store); return { ok: true }; } },
    settingsBus: { read: function () { return cfg; },
      normalize: function (r, v) { return v; },
      saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } },
    region: { places: function () { return {}; } },
    evict: { array: function () {} },
    registerModule: function () {}
  };
  require('./synth-host.js').hostStub(WA);
  const win = { WorldAxis: WA };
  vm.runInNewContext(code, { window: win, Date: Date, Number: Number,
    String: String, Array: Array, Object: Object, isFinite: isFinite, Math: Math,
    JSON: JSON, RegExp: RegExp, parseInt: parseInt, console: console },
    { filename: REL });
  return { api: win.WorldAxis.aftermath, store: store };
}
function linesOf(b) {
  if (!b) return [];
  return String(b).split('\n').filter(function (l) { return l.indexOf('· ') === 0; });
}
function placesOf(b) {
  return linesOf(b).filter(function (l) { return l.indexOf('另有') < 0; })
    .map(function (l) { return l.slice(2).split('：')[0]; });
}
function selfProofOf(b) {
  const l = linesOf(b).filter(function (x) { return x.indexOf('另有') >= 0; });
  return l.length ? l[0] : '';
}
function many(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk('e' + (100 + i), 'p' + i, 'damage', NOW - (n - i) * 60000));
  }
  return out;
}
console.log('A 静态');
ok('A1 旧写法已消失（不再按数组前一半取）', function () {
  assert(CODE.indexOf('Math.floor(cfg.maxEffects / 2)') < 0, '旧的 slice 取法还在');
});
ok('A2 名额具名：BLOCK_SHARE + blockQuota，且 buildBlock 走它', function () {
  assert(/var BLOCK_SHARE = 0\.5;/.test(CODE), 'BLOCK_SHARE 不在');
  assert(CODE.indexOf('function blockQuota(cfg)') > 0, 'blockQuota 不在');
  assert(CODE.indexOf('var quota = blockQuota(cfg);') > 0, 'buildBlock 没走 blockQuota');
});
ok('A3 筛候选段不看名额（筛与截断分开）', function () {
  const i = CODE.indexOf('function buildBlock()');
  const j = CODE.indexOf('function diagnose()');
  assert(i > 0 && j > i, '锚点不在');
  const seg = CODE.slice(i, j);
  assert(seg.indexOf('BLOCK_SHARE') < 0, '筛候选段里出现了名额');
  assert(seg.indexOf('slice(0, quota)') < 0, '筛候选段里直接截断了');
});
ok('A4 pickBlock 三条排序键齐（expiresAt / registeredAt / localeCompare）', function () {
  const i = CODE.indexOf('function pickBlock');
  const j = CODE.indexOf('function buildBlock');
  assert(i > 0 && j > i, '锚点不在');
  const seg = CODE.slice(i, j);
  ['expiresAt', 'registeredAt', 'localeCompare'].forEach(function (k) {
    assert(seg.indexOf(k) > 0, '缺排序键 ' + k);
  });
});
ok('A5 截断自证行在位', function () {
  assert(CODE.indexOf("'· 另有 ' + pk.hidden") > 0, '自证行不在');
});
ok('A6 stat().block 五栗 + 单独拷贝', function () {
  assert(CODE.indexOf('block: _stat.block ? Object.assign({}, _stat.block) : null') > 0,
    'stat 没拷 block');
  ['candidates', 'picked', 'quota', 'hidden', 'mode'].forEach(function (k) {
    assert(CODE.indexOf(k + ':') > 0, '读数缺 ' + k);
  });
});
ok('A7 文档边界 9 在位', function () {
  assert(SRC.indexOf('9 注入面按「最该先知道的」排序') > 0, '边界 9 不在');
});
console.log('B 行为');
ok('B1 最新一条「议事厅刚被烧」必须进注面且排第一', function () {
  const ef = many(30).concat([mk('e900', 'hall', 'fire', NOW - 1000)]);
  const got = placesOf(load(CODE, ef).api.buildBlock());
  assert(got.indexOf('hall') >= 0, '刚被烧的地点不在注面（实 ' + got[0] + ' …）');
  assert(got[0] === 'hall', '最新的应排第一（实 ' + got[0] + '）');
});
ok('B2 31 条只念 24 条，且自证另有 7 条', function () {
  const ef = many(30).concat([mk('e900', 'hall', 'fire', NOW - 1000)]);
  const b = load(CODE, ef).api.buildBlock();
  const ps = placesOf(b);
  assert(ps.length === 24, '条数应 24（实 ' + ps.length + '）');
  assert(/另有 7 条/.test(selfProofOf(b)), '自证不对（实 ' + selfProofOf(b) + '）');
});
ok('B3 换个插入顺序结论不变', function () {
  const ef = many(30);
  const a = placesOf(load(CODE, ef).api.buildBlock()).join(',');
  const c = placesOf(load(CODE, ef.slice().reverse()).api.buildBlock()).join(',');
  assert(a === c, '倒序后结论变了');
});
ok('B4 名额够时全列、无自证行', function () {
  const b = load(CODE, many(3)).api.buildBlock();
  assert(placesOf(b).length === 3, '3 条应全列（实 ' + placesOf(b).length + '）');
  assert(selfProofOf(b) === '', '不该有自证行');
});
ok('B5 有期限的按快过期的先（即使注册更早）', function () {
  const ef = [mk('e1', 'old-soon', 'damage', NOW - 900000, { expiresAt: NOW + 60000 }),
    mk('e2', 'new-later', 'damage', NOW - 1000, { expiresAt: NOW + 900000 }),
    mk('e4', 'x', 'damage', NOW - 10, { expiresAt: NOW + 999999 }),
    mk('e3', 'no-expiry', 'damage', NOW - 500)];
  const got = placesOf(load(CODE, ef).api.buildBlock());
  assert(got[0] === 'old-soon', '快过期的应排第一（实 ' + got[0] + '）');
  assert(got[got.length - 1] === 'no-expiry', '无期限的应排最后（实 ' + got[got.length - 1] + '）');
});
ok('B6 同刻两条按 id 字典序（不依赖插入顺序）', function () {
  const x = [mk('b2', '乙地', 'damage', NOW - 5), mk('b1', '甲地', 'damage', NOW - 5)];
  const got = placesOf(load(CODE, x).api.buildBlock());
  assert(got[0] === '甲地', 'id 字典序没生效（实 ' + got[0] + '）');
});
ok('B7 已修复 / 取消的不进注面', function () {
  const ef = [mk('e1', 'ok1', 'damage', NOW - 100),
    mk('e2', 'fixed', 'damage', NOW - 90, { status: 'repaired' }),
    mk('e3', 'gone', 'damage', NOW - 80, { status: 'cancelled' })];
  const got = placesOf(load(CODE, ef).api.buildBlock());
  assert(got.join(',') === 'ok1', '注面掺了非 active（实 ' + got.join(',') + '）');
});
ok('B8 buildBlock 只读（不改状态、不改顺序）', function () {
  const ef = many(5);
  const snap = JSON.stringify(ef);
  load(CODE, ef).api.buildBlock();
  assert(JSON.stringify(ef) === snap, 'buildBlock 改了世界');
});
console.log('C 读数');
ok('C1 五栗读数正确（31 条 ⇒ 24/24/7/newest-first）', function () {
  const A = load(CODE, many(30).concat([mk('e900', 'hall', 'fire', NOW - 1000)]));
  A.api.buildBlock();
  const b = A.api.stat().block;
  assert(b && b.candidates === 31, 'candidates ' + JSON.stringify(b));
  assert(b.picked === 24 && b.quota === 24 && b.hidden === 7, JSON.stringify(b));
  assert(b.mode === 'newest-first', 'mode 应 newest-first（实 ' + b.mode + '）');
});
ok('C2 名额够 ⇒ mode=all-fit', function () {
  const A = load(CODE, many(3));
  A.api.buildBlock();
  assert(A.api.stat().block.mode === 'all-fit', 'mode 应 all-fit');
});
ok('C3 没构建过 vs 构建过但空表可分辨', function () {
  const A = load(CODE, []);
  assert(A.api.stat().block === null, '没构建过应是 null');
  A.api.buildBlock();
  const b = A.api.stat().block;
  assert(b && b.mode === 'empty' && b.picked === 0 && b.candidates === 0, JSON.stringify(b));
});
ok('C4 block 是拷贝（改返回值不污染下一次读数）', function () {
  const A = load(CODE, many(3));
  A.api.buildBlock();
  const b1 = A.api.stat().block;
  b1.picked = 999;
  assert(A.api.stat().block.picked === 3, '读数被外部改了');
});
ok('C5 恒等式 picked + hidden = candidates', function () {
  const A = load(CODE, many(30));
  A.api.buildBlock();
  const b = A.api.stat().block;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
});
ok('C6 quota 随 maxEffects 变（4 ⇒ 2）', function () {
  const A = load(CODE, many(6), { maxEffects: 4 });
  A.api.buildBlock();
  assert(A.api.stat().block.quota === 2, 'quota 应 2（实 ' + A.api.stat().block.quota + '）');
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const ef1 = many(30).concat([mk('e900', 'hall', 'fire', NOW - 1000)]);
  const b1 = load(code, ef1).api.buildBlock();
  if (placesOf(b1)[0] !== 'hall') bad.push('B1');
  if (!/另有 7 条/.test(selfProofOf(b1))) bad.push('B2');
  const ef3 = many(30);
  const o1 = placesOf(load(code, ef3).api.buildBlock()).join(',');
  const o2 = placesOf(load(code, ef3.slice().reverse()).api.buildBlock()).join(',');
  if (o1 !== o2) bad.push('B3');
  const ef5 = [mk('e1', 'old-soon', 'damage', NOW - 900000, { expiresAt: NOW + 60000 }),
    mk('e2', 'new-later', 'damage', NOW - 1000, { expiresAt: NOW + 900000 })];
  if (placesOf(load(code, ef5).api.buildBlock())[0] !== 'old-soon') bad.push('B5');
  const ef6 = [mk('b2', '乙地', 'damage', NOW - 5), mk('b1', '甲地', 'damage', NOW - 5)];
  if (placesOf(load(code, ef6).api.buildBlock())[0] !== '甲地') bad.push('B6');
  const A = load(code, ef1);
  A.api.buildBlock();
  const bb = A.api.stat().block;
  if (!bb || bb.hidden !== 7 || bb.mode !== 'newest-first') bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控的前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉 id 字典序 ⇒ B6 红', function () {
  const broken = CODE.replace('return ia.localeCompare(ib);', 'return 0;');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B6') >= 0, 'B6 没红（实 ' + bad.join(',') + '）');
});
ok('N2 期限优先反向 ⇒ B5 红', function () {
  const broken = CODE.replace('if (ha === 0 && ea !== eb) return ea - eb;',
    'if (ha === 0 && ea !== eb) return eb - ea;');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B5') >= 0, 'B5 没红（实 ' + bad.join(',') + '）');
});
ok('N3 新旧排反 ⇒ B1 红', function () {
  const broken = CODE.replace('if (ra !== rb) return rb - ra;',
    'if (ra !== rb) return ra - rb;');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1') >= 0, 'B1 没红（实 ' + bad.join(',') + '）');
});
ok('N4 hidden 恒 0（截断不自证）⇒ B2 + C1 红', function () {
  const broken = CODE.replace('hidden: Math.max(0, arr.length - quota)', 'hidden: 0');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B2') >= 0, 'B2 没红（实 ' + bad.join(',') + '）');
  assert(bad.indexOf('C1') >= 0, 'C1 没红（实 ' + bad.join(',') + '）');
});
console.log('');
if (fail) {
  console.log('AFTERMATH-BLOCK-QUOTA-V2563: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('AFTERMATH-BLOCK-QUOTA-V2563: pass（' + pass + ' 项）');
