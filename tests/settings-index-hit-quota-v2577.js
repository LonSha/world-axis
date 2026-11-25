#!/usr/bin/env node
'use strict';
/**
 * tests/settings-index-hit-quota-v2577.js
 * 「设置索引检索命中名额」自证与读数专锁（v2.577.0）
 *
 * 治的缺口：engines/settings-index.js 的 search()。
 *   旧写法 hits = entries.filter(...).slice(0, cap)，随后 hitCount: hits.length。
 *   于是读数有三处同形：
 *     ① 「命中 3 组」既可能是全部、也可能是 12 组里的 3 组 —— hitCount 报的是截断后的长度；
 *     ② 截断发生在 `hits.length > 3 ? ' 等' : ''` 之前，连那个「等」都不会出现；
 *     ③ 谁被念取决于 __settingsRegs 的**注册顺序**（不可复算，且与相关度无关）。
 *
 * 探针实测（/tmp/probe577.js，改造前 → 改造后；12 个 market 组、cap=3）：
 *   · s1 returns=3 hitCount=3 → returns=3 hitCount=12 hidden=9 且自证「另有 9 组未列出」
 *   · s2 倒注册序 结论全变（market11/10/9）→ 结论不变（market0/1/10）
 *   · s3 stat().block = undefined → 五栗 {12,3,3,9,ranked-first}
 *   · s4 maxRows='x' ⇒ returns=0 hitCount=0（配置坏了显示成「没命中」）→ 回落 30、12 组全念
 *   · s5 零命中与「没搜过」都是 undefined → 'empty' 与 null 可分辨
 *   · s6 'warrant' ⇒ marketX（仅键命中）排第一 → warrant（模块名精确）排第一
 *
 * 本批五件事：
 *   ① quotaOf(cfg, opts)（防 NaN/0；上限 QUOTA_MAX=50 与设置面 bound 同源）；
 *   ② rankOf 相关度分级（模块名精确 4 > 包含 3 > 中文名 2 > 键名 1）+ 同级模块名字典序；
 *   ③ hitCount 改为**真实命中总数**，新增 returned / quota / hidden；
 *   ④ 文本自证「（本面只列 M 组，另有 K 组未列出）」，原有「命中 N 组：…」形态保留；
 *   ⑤ stat().block 五栗 + stat 里声明 block:null + stat() 对 block 深拷（原为浅拷）。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 五条负控。
 * 单独跑：node tests/settings-index-hit-quota-v2577.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/settings-index.js';
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

function load(code, regs, over) {
  let cfg = Object.assign({ enabled: true, maxRows: 30 }, over || {});
  const win = {};
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite, console: { log: function () {} } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; } };
  WA.inputGuard = { text: function (v, m) { return String(v == null ? '' : v).slice(0, m || 60); } };
  WA.__settingsRegs = regs;
  WA.settingsBus = { read: function () { return cfg; },
    normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  return WA;
}
// 12 个模块名都含 market 的组（注册序 = 提交序 m0..m11）
function regs12() {
  const a = [];
  for (let i = 0; i < 12; i++) a.push({ key: 'k' + i, def: { enabled: true }, module: 'market' + i });
  return a;
}
// 相关度夹具：仅键命中 / 模块名精确 / 模块名包含 / 中文名命中
function regsMix() {
  return [
    { key: 'warrantMode', def: { enabled: true }, module: 'alphaDesk' },
    { key: 'zz', def: { enabled: true }, module: 'warrant' },
    { key: 'yy', def: { enabled: true }, module: 'warrantDesk' }
  ];
}
function searchOnce(code, regs, q, over) {
  return load(code, regs, over).settingsIndex.search(q, { max: 3 });
}
function ids(res) { return (res.hits || []).map(function (e) { return e.module; }).join(','); }

console.log('A 静态');
ok('A1 名额具名 quotaOf，search 走它', function () {
  assert(CODE.indexOf('function quotaOf(cfg, opts)') > 0, 'quotaOf 不在');
  assert(CODE.indexOf('const quota = quotaOf(s, o);') > 0, 'search 没走 quotaOf');
  assert(CODE.indexOf('return Math.min(QUOTA_MAX, Math.max(1, n));') > 0, 'quotaOf 没夹上限');
});
ok('A2 相关度分级与选取函数在位', function () {
  assert(CODE.indexOf('function rankOf(e, needle)') > 0, 'rankOf 不在');
  assert(CODE.indexOf('function pickHits(list, needle, quota)') > 0, 'pickHits 不在');
  assert(CODE.indexOf('return String(a.module).localeCompare(String(b.module));') > 0, '同级没有字典序兜底');
});
ok('A3 自证句在位', function () {
  assert(CODE.indexOf("'（本面只列 ' + hits.length + ' 组，另有 ' + pk.hidden + ' 组未列出）'") > 0, '自证句不在');
});
ok('A4 stat 声明 block:null，且 stat() 对 block 深拷', function () {
  assert(CODE.indexOf('block: null };') > 0, 'stat 没声明 block');
  assert(CODE.indexOf('out.block = stat.block ? JSON.parse(JSON.stringify(stat.block)) : null;') > 0,
    'stat() 没深拷 block');
});
ok('A5 旧写法已消失（slice(0,cap) 与 hitCount: hits.length）', function () {
  assert(CODE.indexOf('}).slice(0, cap);') < 0, '旧截断还在');
  assert(CODE.indexOf('hitCount: hits.length') < 0, 'hitCount 仍报截断后的长度');
});
ok('A6 文档边界第 5 条在位', function () {
  assert(/5 检索命中名额只截断不参与筛选/.test(SRC), '边界 5 不在');
  assert(/截断必须自证/.test(SRC), '边界 5 的自证条款不在');
});
console.log('B 行为');
ok('B1 命中 12 组、cap3 ⇒ hitCount=12 / returned=3 / hidden=9', function () {
  const r = searchOnce(CODE, regs12(), 'market');
  assert(r.hitCount === 12, 'hitCount 应报真实总数 12（实 ' + r.hitCount + '）');
  assert(r.returned === 3, 'returned 应 3（实 ' + r.returned + '）');
  assert(r.hidden === 9, 'hidden 应 9（实 ' + r.hidden + '）');
  assert(r.hits.length === 3, 'hits 应 3 组（实 ' + r.hits.length + '）');
});
ok('B2 文本自证「另有 9 组未列出」，且「等」不再被截断吃掉', function () {
  const r = searchOnce(CODE, regs12(), 'market');
  assert(r.text.indexOf('命中 12 组') >= 0, '文本没报真实总数：' + r.text);
  assert(r.text.indexOf('另有 9 组未列出') >= 0, '自证不在：' + r.text);
  assert(r.text.indexOf('等') >= 0, '「等」不见了：' + r.text);
});
ok('B3 倒注册序结论不变（可复算）', function () {
  const a = searchOnce(CODE, regs12(), 'market').text;
  const b = searchOnce(CODE, regs12().reverse(), 'market').text;
  assert(a === b, '倒序后结论变了：' + a + ' vs ' + b);
});
ok('B4 相关度：模块名精确 > 模块名包含 > 仅键命中', function () {
  const r = searchOnce(CODE, regsMix(), 'warrant');
  assert(ids(r) === 'warrant,warrantDesk,alphaDesk', '相关度序不对（实 ' + ids(r) + '）');
});
ok('B5 同级按模块名字典序（market0 < market1 < market10）', function () {
  const r = searchOnce(CODE, regs12(), 'market');
  assert(ids(r) === 'market0,market1,market10', '字典序不对（实 ' + ids(r) + '）');
});
ok('B6 名额够、命中全念 ⇒ 无自证、mode=all-fit', function () {
  const A = load(CODE, regs12());
  const r = A.settingsIndex.search('market');
  assert(r.returned === 12 && r.hidden === 0, '应 12 组全念（实 ' + r.returned + '/' + r.hidden + '）');
  assert(r.text.indexOf('另有') < 0, '没截断不该自证：' + r.text);
  assert(A.settingsIndex.stat().block.mode === 'all-fit', 'mode 应 all-fit');
});
ok('B7 maxRows 被写成字符串 ⇒ 回落默认 30（不许塌成 0 命中）', function () {
  const r = load(CODE, regs12(), { maxRows: 'x' }).settingsIndex.search('market');
  assert(r.hits.length === 12, '应回落念满 12 组（实 ' + r.hits.length + '）');
  assert(r.hitCount === 12, 'hitCount 应 12（实 ' + r.hitCount + '）');
});
ok('B8 hits.length === returned（读数与载荷同批）', function () {
  const r = searchOnce(CODE, regs12(), 'market');
  assert(r.hits.length === r.returned, 'hits ' + r.hits.length + ' ≠ returned ' + r.returned);
});
console.log('C 读数');
ok('C1 五栗正确（12 命中 / cap3）', function () {
  const A = load(CODE, regs12());
  A.settingsIndex.search('market', { max: 3 });
  const b = A.settingsIndex.stat().block;
  assert(b && b.candidates === 12 && b.picked === 3 && b.quota === 3 && b.hidden === 9, JSON.stringify(b));
  assert(b.mode === 'ranked-first', 'mode 应 ranked-first（实 ' + b.mode + '）');
});
ok('C2 没搜过（null）与搜了零命中（empty）可分辨', function () {
  const A = load(CODE, regs12());
  assert(A.settingsIndex.stat().block === null, '没搜过应是 null');
  A.settingsIndex.search('不在任何模块名里的词', { max: 3 });
  assert(A.settingsIndex.stat().block.mode === 'empty', '零命中 mode 应 empty');
});
ok('C3 block 是深拷贝（改内层打不到引擎读数）', function () {
  const A = load(CODE, regs12());
  A.settingsIndex.search('market', { max: 3 });
  A.settingsIndex.stat().block.picked = 999;
  assert(A.settingsIndex.stat().block.picked === 3, '读数被外部改了');
});
ok('C4 picked + hidden = candidates', function () {
  const A = load(CODE, regs12());
  A.settingsIndex.search('market', { max: 3 });
  const b = A.settingsIndex.stat().block;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
});
ok('C5 名额 changes 时 hidden 跟着变（4 ⇒ 8）', function () {
  const A = load(CODE, regs12());
  A.settingsIndex.search('market', { max: 4 });
  const b = A.settingsIndex.stat().block;
  assert(b.quota === 4 && b.picked === 4 && b.hidden === 8, JSON.stringify(b));
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const r = searchOnce(code, regs12(), 'market');
  if (r.hitCount !== 12 || r.returned !== 3) bad.push('B1');
  if (String(r.text).indexOf('另有 9 组未列出') < 0) bad.push('B2');
  if (searchOnce(code, regs12(), 'market').text !== searchOnce(code, regs12().reverse(), 'market').text) bad.push('B3');
  if (ids(searchOnce(code, regsMix(), 'warrant')) !== 'warrant,warrantDesk,alphaDesk') bad.push('B4');
  if (ids(r) !== 'market0,market1,market10') bad.push('B5');
  if (load(code, regs12(), { maxRows: 'x' }).settingsIndex.search('market').hits.length !== 12) bad.push('B7');
  const A = load(code, regs12());
  A.settingsIndex.search('market', { max: 3 });
  const b = A.settingsIndex.stat().block;
  if (!b || b.mode !== 'ranked-first') bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉自证 => B2 红', function () {
  const broken = CODE.replace("+ (pk.hidden ? '（本面只列 ' + hits.length + ' 组，另有 ' + pk.hidden + ' 组未列出）' : '')", '');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B2') >= 0, 'B2 没红');
});
ok('N2 相关度恒同分 => B4 红（只剩字典序）', function () {
  const broken = CODE.replace("const m = String(e.module || '').toLowerCase();\n    if (m === needle) return 4;\n    if (m.indexOf(needle) >= 0) return 3;\n    if (e.nameZh && String(e.nameZh).toLowerCase().indexOf(needle) >= 0) return 2;\n    return 1;",
    'return 1;');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B4') >= 0, 'B4 没红');
});
ok('N3 hitCount 改回截断后长度 => B1 红', function () {
  const broken = CODE.replace('hitCount: pk.candidates, returned: hits.length,', 'hitCount: hits.length, returned: hits.length,');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B1') >= 0, 'B1 没红');
});
ok('N4 去掉名额守卫 => B7 红', function () {
  const broken = CODE.replace('if (!isFinite(n) || n < 1) return Math.min(QUOTA_MAX, DEF.maxRows);', '');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B7') >= 0, 'B7 没红');
});
ok('N5 同级字典序反向 => B5 红', function () {
  const broken = CODE.replace('return String(a.module).localeCompare(String(b.module));',
    'return String(b.module).localeCompare(String(a.module));');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B5') >= 0, 'B5 没红');
});
console.log('');
if (fail) {
  console.log('SETTINGS-INDEX-HIT-QUOTA-V2577: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('SETTINGS-INDEX-HIT-QUOTA-V2577: pass（' + pass + ' 项）');