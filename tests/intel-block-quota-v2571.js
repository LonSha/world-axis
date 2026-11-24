#!/usr/bin/env node
'use strict';
/**
 * tests/intel-block-quota-v2571.js
 * 「因果与情报注入名额」三处截断的排序与自证专锁（v2.571.0）
 *
 * 治的缺口：engines/intel.js 的 buildBlock()。它有**三处**静默截断，各用一种「谁被念」：
 *   · currents.slice(-maxLinks)                 → 取数组最后 N 条（按写入顺序，不是按更新）
 *   · Object.values(people).slice(0, maxItems)  → 取对象键最先的 N 个（谁先被登记谁被念）
 *   · p.knowledge.intel.slice(-maxItems)        → 每人取最后 N 条（不看置信度）
 *
 * 探针实测（/tmp/probe571.js，改造前 → 改造后）：
 *   · s1 十个持情报的人里，p9 持 6 条（信息量最大）但登记最晚 ⇒ 旧版念 p0/p1，
 *        p9 一个字都没有（p0/p1 → p9，且带「另有 4 条未列」）
 *   · s2 把 people 的插入顺序倒过来，念出的人物就全变了（false → true）
 *   · s3 六条因果、名额 4 ⇒ 旧版头一条是 e2（较旧），新版是 e5（刚更新）
 *   · s4 把 currents 倒序，因果面就变了（false → true，可复算）
 *   · s5 一个人持 6 条不同置信度的情报 ⇒ 旧版念 c5/c6（conf 55/25），
 *        新版念 c3(90)/c4(75) 并自证「另有 4 条未列」
 *   · s6 stat() 无 block 读数（null → 五栗 + 两个子面）
 *   · s7 maxLinks 被写成字符串 ⇒ 旧版 slice(-'x') 得 slice(0)，六条因果全念出来
 *        （注面爆炸而不是消失），新版回落默认 4 条
 *   · s9 截断自证（人物面/因果面）false → true
 *
 * 本批四件事：
 *   ① 名额提成 quotaOf(v, def, hi)（防 NaN/0；上限与设置面 bound 同源 LINKS_MAX/ITEMS_MAX）；
 *   ② 三个排序函数：pickCurrents（updatedAt → causes 数 → id）/ pickPeople（情报条数 →
 *      lastSeenAt → id）/ pickIntel（confidence → at → claim），名额只截断不参与筛选；
 *   ③ 截断自证三处：「另有 N 条因果未列出…」「另有 N 个持情报的人物未列出…」「（另有 N 条未列）」；
 *   ④ stat().block 五栗 + links/people 两个子面，全部单独拷贝。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 六条负控。
 * 单独跑：node tests/intel-block-quota-v2571.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/intel.js';
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
function load(code, state, over) {
  let cfg = Object.assign({ enabled: true, maxLinks: 4, maxItems: 2 }, over || {});
  const st = state || { currents: [], people: {} };
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
  return WA;
}
function it(i, conf, at) {
  return { id: 'i' + i, claim: 'c' + i, source: 's', level: 'report', confidence: conf,
    status: conf >= 75 ? 'believed' : 'suspected', at: at };
}
function person(name, items) {
  return { id: 'p_' + name, name: name, knowledge: { intel: items },
    lastSeenAt: NOW, updatedAt: NOW };
}
// 十个人各持 1 条；p9 持 6 条（信息量最大）但登记最晚
function peopleTen() {
  const o = {};
  for (let i = 0; i < 9; i++) o['p_p' + i] = person('p' + i, [it(i, 55, NOW - 1000 * i)]);
  o['p_p9'] = person('p9', [it(90, 90, NOW - 100), it(91, 75, NOW - 200),
    it(92, 55, NOW - 300), it(93, 25, NOW - 400), it(94, 90, NOW - 500), it(95, 55, NOW - 600)]);
  return o;
}
function peopleTenRev() {
  const o = peopleTen(), r = {};
  Object.keys(o).reverse().forEach(function (k) { r[k] = o[k]; });
  return r;
}
function currentsSix(rev) {
  const a = [];
  for (let i = 0; i < 6; i++) a.push({ id: 'e' + i, title: 'e' + i, causes: ['c' + i],
    createdAt: NOW - 1000 * (6 - i), updatedAt: NOW - 1000 * (6 - i) });
  return rev ? a.reverse() : a;
}
function st(people, currents) {
  return { currents: currents || currentsSix(false), people: people || peopleTen() };
}
function body(b) { return String(b || '').split('\n').filter(function (l) {
  return l.indexOf('：') > 0 || l.indexOf('另有') === 0; }); }
function personLines(b) { return body(b).filter(function (l) {
  return l.indexOf('因果：') !== 0 && l.indexOf('另有') !== 0; }); }
function currentLines(b) { return body(b).filter(function (l) { return l.indexOf('因果：') === 0; }); }
console.log('A 静态');
ok('A1 名额具名 quotaOf，且 buildBlock 走它', function () {
  assert(CODE.indexOf('function quotaOf(v, def, hi)') > 0, 'quotaOf 不在');
  assert(CODE.indexOf('var ql = quotaOf(cfg.maxLinks, DEF.maxLinks, LINKS_MAX);') > 0, '没走 quotaOf');
});
ok('A2 三个排序函数在位且各有键', function () {
  assert(CODE.indexOf('function pickCurrents(list, quota)') > 0, 'pickCurrents 不在');
  assert(CODE.indexOf('function pickPeople(list, quota)') > 0, 'pickPeople 不在');
  assert(CODE.indexOf('function pickIntel(list, quota)') > 0, 'pickIntel 不在');
  assert(CODE.indexOf('var ua = Number(a.updatedAt)') > 0, '因果键不在');
  assert(CODE.indexOf('var na = (a.knowledge.intel || []).length') > 0, '人物键不在');
  assert(CODE.indexOf('var ca = Number(a.confidence)') > 0, '情报键不在');
});
ok('A3 三处截断自证行在位', function () {
  assert(CODE.indexOf("另有 ' + cur.hidden + ' 条因果未列出") > 0, '因果自证不在');
  assert(CODE.indexOf("另有 ' + ppl.hidden + ' 个持情报的人物未列出") > 0, '人物自证不在');
  assert(CODE.indexOf("'（另有 ' + it.hidden + ' 条未列）'") > 0, '每人情报自证不在');
});
ok('A4 stat().block 五栗 + 两个子面 + 单独拷贝', function () {
  assert(CODE.indexOf('stat.block = { candidates:') > 0, 'block 没写入');
  assert(CODE.indexOf('links: { candidates: cur.candidates') > 0, 'links 子面不在');
  assert(CODE.indexOf('people: { candidates: ppl.candidates') > 0, 'people 子面不在');
  assert(CODE.indexOf('o.block = stat.block ? Object.assign({}, stat.block) : null') > 0,
    'stat() 没单独拷 block');
  assert(CODE.indexOf('o.block.links = Object.assign({}, stat.block.links)') > 0,
    'links 子面没单独拷');
});
ok('A5 旧写法已消失（不再按插入顺序切）', function () {
  assert(CODE.indexOf('}).slice(0, cfg.maxItems)') < 0, '人物面旧写法还在');
  assert(CODE.indexOf('.slice(-cfg.maxLinks)') < 0, '因果面旧写法还在');
  assert(CODE.indexOf('p.knowledge.intel.slice(-cfg.maxItems)') < 0, '每人情报旧写法还在');
});
ok('A6 文档边界 6 在位', function () {
  assert(SRC.indexOf('6 注入面「因果 / 人物 / 每个人的情报」') > 0, '边界 6 不在');
});
console.log('B 行为');
ok('B1 十人 ⇒ 念 2 个 + 自证 8 个', function () {
  const b = load(CODE, st()).intel.buildBlock();
  assert(personLines(b).length === 2, '念的人数应 2（实 ' + personLines(b).length + '）');
  assert(/另有 8 个持情报的人物未列出/.test(b), '自证不对：' + JSON.stringify(b).slice(0, 200));
});
ok('B2 情报量大的先：p9 即便最后登记也排第一', function () {
  const p = personLines(load(CODE, st()).intel.buildBlock());
  assert(/^p9：/.test(p[0] || ''), '首个人物不是 p9（实 ' + (p[0] || '') + '）');
});
ok('B3 倒序插入结论不变（可复算）', function () {
  const a = personLines(load(CODE, st(peopleTen())).intel.buildBlock()).join('|');
  const c = personLines(load(CODE, st(peopleTenRev())).intel.buildBlock()).join('|');
  assert(a === c, '倒序后人物面变了');
});
ok('B4 因果按更新新的先（头一条是 e5）', function () {
  const c = currentLines(load(CODE, st()).intel.buildBlock());
  assert(/^因果：c5 → e5$/.test(c[0] || ''), '首条因果不是 e5（实 ' + (c[0] || '') + '）');
});
ok('B5 因果倒序输入结论不变', function () {
  const a = currentLines(load(CODE, st(peopleTen(), currentsSix(false))).intel.buildBlock()).join('|');
  const c = currentLines(load(CODE, st(peopleTen(), currentsSix(true))).intel.buildBlock()).join('|');
  assert(a === c, '因果倒序后结论变了');
});
ok('B6 每人情报按置信度先 + 自证余量', function () {
  const one = { 'p_p9': person('p9', [it(1, 25, NOW - 100), it(2, 55, NOW - 200),
    it(3, 90, NOW - 300), it(4, 75, NOW - 400), it(5, 55, NOW - 500), it(6, 25, NOW - 600)]) };
  const b = load(CODE, st(one)).intel.buildBlock();
  const p = personLines(b)[0] || '';
  assert(/believed「c3」/.test(p), '首条情报不是 conf 90 的 c3（实 ' + p + '）');
  assert(/believed「c4」/.test(p), '第二条情报不是 conf 75 的 c4');
  assert(/另有 4 条未列/.test(p), '每人情报的自证不对（实 ' + p + '）');
});
ok('B7 maxLinks 被写成字符串 ⇒ 回落默认名额，注面不整块放大', function () {
  const c = currentLines(load(CODE, st(), { maxLinks: 'x' }).intel.buildBlock());
  assert(c.length === 4, '应回落 4 条（实 ' + c.length + '）');
});
ok('B8 空表 ⇒ 空串（不凭空生成）', function () {
  const b = load(CODE, { currents: [], people: {} }).intel.buildBlock();
  assert(b === '', '空表应返回空串（实 ' + JSON.stringify(b) + '）');
});
ok('B9 名额够时三处都无自证', function () {
  const one = { 'p_p1': person('p1', [it(1, 55, NOW)]) };
  const b = load(CODE, st(one, currentsSix(false).slice(0, 2))).intel.buildBlock();
  assert(b.indexOf('另有') < 0, '不该有自证：' + JSON.stringify(b).slice(0, 200));
});
console.log('C 读数');
ok('C1 五栗正确（16 候选 ⇒ 6 念 / 名额 6 / 隐 10 / informative-first）', function () {
  const A = load(CODE, st());
  A.intel.buildBlock();
  const b = A.intel.stat().block;
  assert(b && b.candidates === 16 && b.picked === 6, JSON.stringify(b));
  assert(b.quota === 6 && b.hidden === 10, JSON.stringify(b));
  assert(b.mode === 'informative-first', 'mode 应 informative-first（实 ' + b.mode + '）');
});
ok('C2 两个子面读数各自成对', function () {
  const A = load(CODE, st());
  A.intel.buildBlock();
  const b = A.intel.stat().block;
  assert(b.links.candidates === 6 && b.links.picked === 4 && b.links.hidden === 2, JSON.stringify(b.links));
  assert(b.people.candidates === 10 && b.people.picked === 2 && b.people.hidden === 8, JSON.stringify(b.people));
});
ok('C3 名额够 ⇒ mode=all-fit', function () {
  const one = { 'p_p1': person('p1', [it(1, 55, NOW)]) };
  const A = load(CODE, st(one, currentsSix(false).slice(0, 2)));
  A.intel.buildBlock();
  assert(A.intel.stat().block.mode === 'all-fit', 'mode 应 all-fit');
});
ok('C4 没构建过 vs 空表可分辨', function () {
  const A = load(CODE, { currents: [], people: {} });
  assert(A.intel.stat().block === null, '没构建过应是 null');
  A.intel.buildBlock();
  assert(A.intel.stat().block.mode === 'empty', '空表 mode 应 empty');
});
ok('C5 block 与两个子面都是拷贝', function () {
  const A = load(CODE, st());
  A.intel.buildBlock();
  const b1 = A.intel.stat().block;
  b1.picked = 999; b1.links.picked = 999;
  const b2 = A.intel.stat().block;
  assert(b2.picked === 6 && b2.links.picked === 4, '读数被外部改了');
});
ok('C6 picked + hidden = candidates（两面各自成立）', function () {
  const A = load(CODE, st());
  A.intel.buildBlock();
  const b = A.intel.stat().block;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
  assert(b.links.picked + b.links.hidden === b.links.candidates, JSON.stringify(b.links));
  assert(b.people.picked + b.people.hidden === b.people.candidates, JSON.stringify(b.people));
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const b = load(code, st()).intel.buildBlock();
  if (personLines(b).length !== 2) bad.push('B1a');
  if (!/另有 8 个持情报的人物未列出/.test(b)) bad.push('B1b');
  if (!/^p9：/.test(personLines(b)[0] || '')) bad.push('B2');
  if (personLines(load(code, st(peopleTen())).intel.buildBlock()).join('|') !==
      personLines(load(code, st(peopleTenRev())).intel.buildBlock()).join('|')) bad.push('B3');
  if (!/^因果：c5 → e5$/.test(currentLines(b)[0] || '')) bad.push('B4');
  const c = currentLines(load(code, st(), { maxLinks: 'x' }).intel.buildBlock());
  if (c.length !== 4) bad.push('B7');
  const A = load(code, st());
  A.intel.buildBlock();
  const bb = A.intel.stat().block;
  if (!bb || bb.hidden !== 10 || bb.mode !== 'informative-first') bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉人物面自证 ⇒ B1b 红', function () {
  const broken = CODE.replace("lines.push('另有 ' + ppl.hidden + ' 个持情报的人物未列出（本面只念最该先说的 ' + ppl.picked.length + ' 个）');", '');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1b') >= 0, 'B1b 没红（实 ' + bad.join(',') + '）');
});
ok('N2 人物排序去掉「情报量」键 ⇒ B2 红', function () {
  const broken = CODE.replace('if (na !== nb) return nb - na;', '');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B2') >= 0, 'B2 没红（实 ' + bad.join(',') + '）');
});
ok('N3 因果排序反向 ⇒ B4 红', function () {
  const broken = CODE.replace('if (ua !== ub) return ub - ua;', 'if (ua !== ub) return ua - ub;');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B4') >= 0, 'B4 没红（实 ' + bad.join(',') + '）');
});
ok('N4 每人情报去掉「置信度」键 ⇒ B6 红', function () {
  const broken = CODE.replace('var ca = Number(a.confidence) || 0, cb = Number(b.confidence) || 0;', 'var ca = 0, cb = 0;');
  assert(broken !== CODE, '破坏未命中');
  const one = { 'p_p9': person('p9', [it(1, 25, NOW - 100), it(3, 90, NOW - 300)]) };
  const p = personLines(load(broken, st(one)).intel.buildBlock())[0] || '';
  assert(!/believed「c3」/.test(p) || /suspected「c1」/.test(p.split('；')[0] || ''),
    'B6 没红（实 ' + p + '）');
});
ok('N5 名额去掉 NaN 守卫 ⇒ B7 红', function () {
  const broken = CODE.replace('if (!isFinite(n) || n < 1) n = def;', '');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B7') >= 0, 'B7 没红（实 ' + bad.join(',') + '）');
});
ok('N6 hidden 恒 0 ⇒ B1b + C1 红', function () {
  const broken = CODE.split('hidden: Math.max(0, arr.length - quota)').join('hidden: 0');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1b') >= 0, 'B1b 没红（实 ' + bad.join(',') + '）');
  assert(bad.indexOf('C1') >= 0, 'C1 没红（实 ' + bad.join(',') + '）');
});
console.log('');
if (fail) {
  console.log('INTEL-BLOCK-QUOTA-V2571: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('INTEL-BLOCK-QUOTA-V2571: pass（' + pass + ' 项）');