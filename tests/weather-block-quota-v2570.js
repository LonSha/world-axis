#!/usr/bin/env node
'use strict';
/**
 * tests/weather-block-quota-v2570.js
 * 「天气注入名额」排序与自证专锁（v2.570.0）
 *
 * 治的缺口：engines/weather.js 的 buildBlock()。
 *   旧写法 rows().slice(0, Math.max(1, cfg.maxItems)) 连排序都没有：
 *     数组是 setWeather 时 push 追加的，所以注面念的是「最先登记」的几处，
 *     而不是「最该先说的」几处。
 *
 *   探针实测（/tmp/probe570.js，改造前 → 改造后）：
 *     · s1 10 处登记 ⇒ 只念 4 处，且不声明还有 6 处（false → true）
 *     · s2 头三条全是 clear，最后登记且最拦路的 storm 一个字都没有
 *          （p0/p1/p2 → p9：storm）
 *     · s3 把数组倒过来，念出的 4 处就变了（false → true，可复算）
 *     · s4 玩家此刻站在 p5，注面仍从 p0 念起（p0 → p5）
 *     · s5 stat() 无 block 读数（undefined → 五栗）
 *     · s6 没构建过与构建过但空表同形（undefined → null / empty）
 *     · s7 maxItems=1 时同样静默（false → 自证「另有 9 处」）
 *     · s8 maxItems 被写成字符串 ⇒ 旧写法 Math.max(1,'x') 得 NaN，
 *          slice(0,NaN) 空数组 ⇒ 「注面整块消失」（0 条 → 4 条）
 *
 * 本批四件事：
 *   ① 名额提成 quotaOf(cfg)（防 NaN/0，上限 QUOTA_MAX=8 与设置面 bound 同源）；
 *   ② pickBlock：四条排序键 ① 此刻所在的地点 ② factor>1 ③ at 新 ④ 地点名，
 *      名额只截断不参与筛选；
 *   ③ 截断自证：「另有 N 处地点的天气未列出（本面只念最该先说的 M 处）」；
 *   ④ stat().block 五栗（candidates/picked/quota/hidden/mode）+ 单独拷贝。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 五条负控。
 * 单独跑：node tests/weather-block-quota-v2570.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/weather.js';
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
function load(code, rowsArr, over, focus) {
  let cfg = Object.assign({ enabled: true, maxItems: 4 }, over || {});
  const store = { weather: { rows: rowsArr || [] } };
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
  WA.evict = { array: function () {} };
  WA.world = { reach: function () { return { ok: true }; } };
  WA.sceneSlice = { read: function () {
    return focus ? { ok: true, place: focus } : { ok: false }; } };
  return WA;
}
function row(place, kind, at) { return { place: place, kind: kind, at: at }; }
// 十处全 clear：只量「念几条 / 自证几条」
function ten() {
  const a = [];
  for (let i = 0; i < 10; i++) a.push(row('p' + i, 'clear', NOW - i * 1000));
  return a;
}
// 九处 clear + 最后一处 storm：storm 登记最晚、时间最旧，但最拦路。
// 旧写法 slice(0,4) 只看得到 p0..p3（全是 clear）；
// 新写法按「拦路的先」把 p9 提到第一。
function mix() {
  const a = [];
  for (let i = 0; i < 9; i++) a.push(row('p' + i, 'clear', NOW - 9000 + i * 1000));
  a.push(row('p9', 'storm', NOW - 10000));
  return a;
}
function body(b) { return String(b || '').split('\n').filter(function (l) {
  return l.indexOf('：') > 0; }); }
function pickedOf(b) {
  return body(b).filter(function (l) { return l.indexOf('另有') < 0; });
}
console.log('A 静态');
ok('A1 名额具名 quotaOf，且 buildBlock 走它', function () {
  assert(CODE.indexOf('function quotaOf(cfg)') > 0, 'quotaOf 不在');
  assert(CODE.indexOf('var quota = quotaOf(cfg);') > 0, 'buildBlock 没走 quotaOf');
});
ok('A2 stat 声明并单独拷贝 block', function () {
  assert(CODE.indexOf('o.block = stat.block ? Object.assign({}, stat.block) : null') > 0,
    'stat() 没单独拷 block');
  assert(CODE.indexOf('stat.block = { candidates: pk.candidates') > 0, 'block 五栗没写入');
});
ok('A3 截断自证行在位', function () {
  assert(CODE.indexOf("另有 ' + pk.hidden") > 0, '自证行不在');
});
ok('A4 四条排序键在位', function () {
  assert(CODE.indexOf('if (fa !== fb) return fa - fb;') > 0, '地点键不在');
  assert(CODE.indexOf('> 1 ? 0 : 1') > 0, '拦路键不在');
  assert(CODE.indexOf('if (ta !== tb) return tb - ta;') > 0, '时间键不在');
  assert(CODE.indexOf('.localeCompare(') > 0, '字典序键不在');
});
ok('A5 旧写法已消失（不再按登记顺序切）', function () {
  assert(CODE.indexOf('rows().slice(0, Math.max(1, cfg.maxItems))') < 0, '旧写法还在');
});
ok('A6 文档边界 5 在位', function () {
  assert(SRC.indexOf('5 注入面按') > 0, '边界 5 不在');
});
console.log('B 行为');
ok('B1 十处 ⇒ 念 4 处 + 自证 6 处', function () {
  const b = load(CODE, ten()).weather.buildBlock();
  assert(pickedOf(b).length === 4, '念的条数应 4（实 ' + pickedOf(b).length + '）');
  assert(/另有 6 处/.test(b), '自证不对：' + JSON.stringify(b));
});
ok('B2 拦路的先：storm 即便最后登记也排第一', function () {
  const p = pickedOf(load(CODE, mix()).weather.buildBlock());
  assert(/^p9：storm/.test(p[0] || ''), '首条不是 storm（实 ' + (p[0] || '') + '）');
});
ok('B3 名额够 ⇒ 无自证', function () {
  const b = load(CODE, ten().slice(0, 3)).weather.buildBlock();
  assert(pickedOf(b).length === 3, '3 处应全念');
  assert(b.indexOf('另有') < 0, '不该有自证');
});
ok('B4 此刻所在的地点先念（哪怕最后登记）', function () {
  const p = pickedOf(load(CODE, mix(), {}, 'p3').weather.buildBlock());
  assert(/^p3：/.test(p[0] || ''), '首条不是 p3（实 ' + (p[0] || '') + '）');
});
ok('B5 倒序输入结论不变（可复算）', function () {
  const a = pickedOf(load(CODE, mix()).weather.buildBlock()).join('|');
  const c = pickedOf(load(CODE, mix().slice().reverse()).weather.buildBlock()).join('|');
  assert(a === c, '倒序后结论变了');
});
ok('B6 maxItems=1 ⇒ 1 处 + 自证 9 处', function () {
  const b = load(CODE, ten(), { maxItems: 1 }).weather.buildBlock();
  assert(pickedOf(b).length === 1, '应只念 1 处');
  assert(/另有 9 处/.test(b), '自证不对：' + JSON.stringify(b));
});
ok('B7 maxItems 被写成字符串 ⇒ 回落默认名额，注面不整块消失', function () {
  const b = load(CODE, ten(), { maxItems: 'x' }).weather.buildBlock();
  assert(pickedOf(b).length === 4, '应回落 4 处（实 ' + pickedOf(b).length + '）');
  assert(/另有 6 处/.test(b), '自证不对');
});
ok('B8 未登记天气 ⇒ 空串（不凭空生成）', function () {
  const b = load(CODE, []).weather.buildBlock();
  assert(b === '', '空表应返回空串（实 ' + JSON.stringify(b) + '）');
});
console.log('C 读数');
ok('C1 五栗正确（十处 ⇒ 4/4/6/most-blocking-first）', function () {
  const A = load(CODE, ten());
  A.weather.buildBlock();
  const b = A.weather.stat().block;
  assert(b && b.candidates === 10 && b.picked === 4, JSON.stringify(b));
  assert(b.quota === 4 && b.hidden === 6, JSON.stringify(b));
  assert(b.mode === 'most-blocking-first', 'mode 应 most-blocking-first（实 ' + b.mode + '）');
});
ok('C2 名额够 ⇒ mode=all-fit', function () {
  const A = load(CODE, ten().slice(0, 3));
  A.weather.buildBlock();
  assert(A.weather.stat().block.mode === 'all-fit', 'mode 应 all-fit');
});
ok('C3 没构建过 vs 空表可分辨', function () {
  const A = load(CODE, []);
  assert(A.weather.stat().block === null, '没构建过应是 null');
  A.weather.buildBlock();
  assert(A.weather.stat().block.mode === 'empty', '空表 mode 应 empty');
});
ok('C4 block 是拷贝', function () {
  const A = load(CODE, ten());
  A.weather.buildBlock();
  const b1 = A.weather.stat().block;
  b1.picked = 999;
  assert(A.weather.stat().block.picked === 4, '读数被外部改了');
});
ok('C5 picked + hidden = candidates', function () {
  const A = load(CODE, mix());
  A.weather.buildBlock();
  const b = A.weather.stat().block;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const blk = load(code, ten()).weather.buildBlock();
  if (pickedOf(blk).length !== 4) bad.push('B1a');
  if (!/另有 6 处/.test(blk)) bad.push('B1b');
  const pm = pickedOf(load(code, mix()).weather.buildBlock());
  if (!/^p9：storm/.test(pm[0] || '')) bad.push('B2');
  const pf = pickedOf(load(code, mix(), {}, 'p3').weather.buildBlock());
  if (!/^p3：/.test(pf[0] || '')) bad.push('B4');
  const A = load(code, ten());
  A.weather.buildBlock();
  const bb = A.weather.stat().block;
  if (!bb || bb.hidden !== 6 || bb.mode !== 'most-blocking-first') bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉自证行 ⇒ B1b 红', function () {
  const broken = CODE.replace("out += '\\n另有 ' + pk.hidden", "out += '' + pk.hidden");
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
ok('N3 去掉「拦路的先」⇒ B2 红', function () {
  const broken = CODE.replace('var va = (FACTOR[a.kind] || 1) > 1 ? 0 : 1;', 'var va = 1;');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B2') >= 0, 'B2 没红（实 ' + bad.join(',') + '）');
});
ok('N4 去掉「所在的地点先」⇒ B4 红', function () {
  const broken = CODE.replace("return (cur && cur.ok && cur.place) ? String(cur.place) : '';", "return '';");
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B4') >= 0, 'B4 没红（实 ' + bad.join(',') + '）');
});
ok('N5 名额回到旧写法（不防 NaN）⇒ B7 红', function () {
  const broken = CODE.replace('if (!isFinite(n) || n < 1) n = DEF.maxItems;', '');
  assert(broken !== CODE, '破坏未命中');
  const b = load(broken, ten(), { maxItems: 'x' }).weather.buildBlock();
  assert(pickedOf(b).length !== 4, 'B7 没红（实 ' + pickedOf(b).length + '）');
});
console.log('');
if (fail) {
  console.log('WEATHER-BLOCK-QUOTA-V2570: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('WEATHER-BLOCK-QUOTA-V2570: pass（' + pass + ' 项）');
