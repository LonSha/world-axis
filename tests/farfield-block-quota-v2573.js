#!/usr/bin/env node
'use strict';
/**
 * tests/farfield-block-quota-v2573.js
 * 「远方传闻注入名额」自证与读数专锁（v2.573.0）
 *
 * 治的缺口：engines/farfield.js 的 buildBlock()。
 *   旧写法 `h.rows.slice(-cfg.maxItems)`：取的是**登记次序**的尾巴，不是「最新的 N 条」，
 *   而且截断不说还有几条 —— 一屏读起来像「全部」，其实是抽样。
 *   本模块自己在 transferPack 的注释里写过这句话：
 *     「转移包被截断在读数上与『这就是全部』完全同形」——
 *   注入面却是同一个病（这正是本批要补的那一处）。
 *
 * 探针实测（/tmp/probe573.js，改造前 → 改造后）：
 *   · s1 十条听闻、名额 4 ⇒ 念 4 条，另 6 条无声消失（false → 自证 true）
 *   · s2 首条是 s6（登记尾巴的第 1 条）→ s0（真正最新）
 *   · s3 maxItems=1 ⇒ 旧版静默 1 条 → 自证「另有 9 条远方听闻未列出」
 *   · s4 倒序输入 ⇒ 旧版结论全变（false）→ 新版不变（true，可复算）
 *   · s5 stat() 无 block 读数（undefined → 五栗）
 *   · s6 maxItems 写成字符串 ⇒ slice(-NaN) 得 slice(0)：十条**全念出来**（注面爆炸，不是消失）
 *   · s7 空表：没构建过与构建过但空表同形（undefined → null）
 *
 * 本批四件事：
 *   ① 名额提成 quotaOf(cfg)（防 NaN/0；上限 QUOTA_MAX=12 与设置面 bound 同源）；
 *   ② pickHeard 显式按 at 降序 + id 字典序再排一次（名额只截断不参与筛选）；
 *   ③ 截断自证「另有 N 条远方听闻未列出（本面只念最新的 M 条）」+ stat().block 五栗；
 *   ④ 文档边界追加第 8 条（并点名 transferPack 早就写过的那句话）。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 四条负控。
 * 单独跑：node tests/farfield-block-quota-v2573.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/farfield.js';
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
function load(code, heardRows, over) {
  let cfg = Object.assign({ enabled: true, nearDays: 3, maxPulses: 48, capPending: 24, capHeard: 32,
    maxItems: 4, spreadSalt: 7, autoMaxWindows: 24, capTransfer: 8, auto: false }, over || {});
  const st = { farfield: { pulses: [], pending: [], heard: heardRows, lastTickAt: null, rounds: 0 } };
  const win = {};
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.inputGuard = { text: function (v, m) {
    return String(v == null ? '' : v).trim().slice(0, m || 60); } };
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; } };
  WA.store = { get: function () { return st; },
    transact: function (fn) { fn(st); return { ok: true }; } };
  WA.settingsBus = { read: function () { return cfg; },
    normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  WA.region = { places: function () {
    return [{ name: 'near1', distanceDays: 1 }, { name: 'far1', distanceDays: 9 }]; } };
  WA.evict = { array: function () {} };
  return WA;
}
function row(i, at) {
  return { id: 'h' + i, place: 'far1', trend: 'war', said: 's' + i, at: at,
    deliveredAt: at + 500, distorted: false, delayDays: 3 };
}
function ten(rev) {
  const a = [];
  for (let i = 0; i < 10; i++) a.push(row(i, NOW - 1000 * i));
  return rev ? a.reverse() : a;
}
function linesOf(b) { return String(b || '').split('\n').filter(function (l) {
  return l.indexOf('- ') === 0; }); }
function pickedOf(b) { return linesOf(b).filter(function (l) { return l.indexOf('另有') < 0; }); }
console.log('A 静态');
ok('A1 名额具名 quotaOf，且 buildBlock 走它', function () {
  assert(CODE.indexOf('function quotaOf(cfg)') > 0, 'quotaOf 不在');
  assert(CODE.indexOf('const quota = quotaOf(cfg);') > 0, 'buildBlock 没走 quotaOf');
});
ok('A2 截断自证行在位', function () {
  assert(CODE.indexOf("'- 另有 ' + pk.hidden + ' 条远方听闻未列出") > 0, '自证行不在');
});
ok('A3 stat 声明 block，且 statOf 单独拷贝', function () {
  assert(CODE.indexOf('block: null };') > 0, 'stat 没声明 block');
  assert(CODE.indexOf('out.block = stat.block ? Object.assign({}, stat.block) : null') > 0,
    'statOf 没单独拷 block');
});
ok('A4 旧写法已消失（不再直接切 heard 的尾巴）', function () {
  assert(CODE.indexOf('h.rows.slice(-cfg.maxItems)') < 0, '旧写法还在');
  assert(CODE.indexOf('function pickHeard(list, quota)') > 0, 'pickHeard 不在');
});
ok('A5 文档边界 8 在位，且点名 transferPack 那句', function () {
  assert(SRC.indexOf('8 注入面名额（maxItems）只截断不参与筛选') > 0, '边界 8 不在');
  assert(SRC.indexOf('与这就是全部完全同形') > 0, '没点名 transferPack 的结论');
});
console.log('B 行为');
ok('B1 十条 ⇒ 念 4 条 + 自证 6 条', function () {
  const b = load(CODE, ten()).farfield.buildBlock();
  assert(pickedOf(b).length === 4, '念的条数应 4（实 ' + pickedOf(b).length + '）');
  assert(/另有 6 条远方听闻未列出/.test(b), '自证不对：' + JSON.stringify(b).slice(0, 200));
});
ok('B2 最新的先（s0 在最前）', function () {
  const p = pickedOf(load(CODE, ten()).farfield.buildBlock());
  assert(/^- s0（/.test(p[0] || ''), '首条不是最新的 s0（实 ' + (p[0] || '') + '）');
});
ok('B3 名额够 ⇒ 无自证', function () {
  const three = ten().slice(0, 3);
  const b = load(CODE, three).farfield.buildBlock();
  assert(pickedOf(b).length === 3, '3 条应全念（实 ' + pickedOf(b).length + '）');
  assert(b.indexOf('另有') < 0, '不该有自证');
});
ok('B4 maxItems=1 ⇒ 1 条 + 自证 9 条', function () {
  const b = load(CODE, ten(), { maxItems: 1 }).farfield.buildBlock();
  assert(pickedOf(b).length === 1, '应只念 1 条');
  assert(/另有 9 条/.test(b), '自证不对：' + JSON.stringify(b).slice(0, 200));
});
ok('B5 maxItems 写成字符串 ⇒ 回落默认名额，不许全念', function () {
  const b = load(CODE, ten(), { maxItems: 'x' }).farfield.buildBlock();
  assert(pickedOf(b).length === 4, '应回落 4 条（实 ' + pickedOf(b).length + '）');
});
ok('B6 倒序输入结论不变（可复算）', function () {
  const a = pickedOf(load(CODE, ten()).farfield.buildBlock()).join('|');
  const c = pickedOf(load(CODE, ten(true)).farfield.buildBlock()).join('|');
  assert(a === c, '倒序后结论变了');
});
ok('B7 同一 at 按 id 字典序（同输入同输出，不靠数组原有次序）', function () {
  const a = [row(2, NOW), row(1, NOW), row(0, NOW)];
  const b = [row(0, NOW), row(2, NOW), row(1, NOW)];
  const pa = pickedOf(load(CODE, a).farfield.buildBlock()).join('|');
  const pb = pickedOf(load(CODE, b).farfield.buildBlock()).join('|');
  assert(pa === pb, '同刻次序不稳：' + pa + ' vs ' + pb);
  assert(/^- s0（/.test(pa.split('|')[0]), '同刻应以 id 字典序（s0 最前）：' + pa);
});
ok('B8 没有听闻 ⇒ 空串', function () {
  const b = load(CODE, []).farfield.buildBlock();
  assert(b === '', '空表应返回空串（实 ' + JSON.stringify(b) + '）');
});
console.log('C 读数');
ok('C1 五栗正确（十条 ⇒ 10/4/4/6/newest-first）', function () {
  const A = load(CODE, ten());
  A.farfield.buildBlock();
  const b = A.farfield.stat().block;
  assert(b && b.candidates === 10 && b.picked === 4, JSON.stringify(b));
  assert(b.quota === 4 && b.hidden === 6, JSON.stringify(b));
  assert(b.mode === 'newest-first', 'mode 应 newest-first（实 ' + b.mode + '）');
});
ok('C2 名额够 ⇒ mode=all-fit', function () {
  const A = load(CODE, ten().slice(0, 3));
  A.farfield.buildBlock();
  assert(A.farfield.stat().block.mode === 'all-fit', 'mode 应 all-fit');
});
ok('C3 没构建过 vs 空表可分辨', function () {
  const A = load(CODE, []);
  assert(A.farfield.stat().block === null, '没构建过应是 null');
  A.farfield.buildBlock();
  assert(A.farfield.stat().block.mode === 'empty', '空表 mode 应 empty');
});
ok('C4 block 是拷贝', function () {
  const A = load(CODE, ten());
  A.farfield.buildBlock();
  const b1 = A.farfield.stat().block;
  b1.picked = 999;
  assert(A.farfield.stat().block.picked === 4, '读数被外部改了');
});
ok('C5 picked + hidden = candidates', function () {
  const A = load(CODE, ten());
  A.farfield.buildBlock();
  const b = A.farfield.stat().block;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const b = load(code, ten()).farfield.buildBlock();
  if (pickedOf(b).length !== 4) bad.push('B1a');
  if (!/另有 6 条远方听闻未列出/.test(b)) bad.push('B1b');
  if (!/^- s0（/.test(pickedOf(b)[0] || '')) bad.push('B2');
  const A = load(code, ten());
  A.farfield.buildBlock();
  const bb = A.farfield.stat().block;
  if (!bb || bb.hidden !== 6 || bb.mode !== 'newest-first') bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉自证行 ⇒ B1b 红', function () {
  const broken = CODE.replace("lines.push('- 另有 ' + pk.hidden + ' 条远方听闻未列出（本面只念最新的 ' + pk.picked.length + ' 条）');", '');
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
  const broken = CODE.replace('if (!isFinite(n) || n < 1) return DEF.maxItems;', '');
  assert(broken !== CODE, '破坏未命中');
  const b = load(broken, ten(), { maxItems: 'x' }).farfield.buildBlock();
  assert(pickedOf(b).length !== 4, 'B5 没红（实 ' + pickedOf(b).length + '）');
});
ok('N4 排序反向 ⇒ B2 红', function () {
  const broken = CODE.replace('if (ta !== tb) return tb - ta;', 'if (ta !== tb) return ta - tb;');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B2') >= 0, 'B2 没红（实 ' + bad.join(',') + '）');
});
console.log('');
if (fail) {
  console.log('FARFIELD-BLOCK-QUOTA-V2573: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('FARFIELD-BLOCK-QUOTA-V2573: pass（' + pass + ' 项）');