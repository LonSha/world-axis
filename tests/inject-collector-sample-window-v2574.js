#!/usr/bin/env node
'use strict';
/**
 * tests/inject-collector-sample-window-v2574.js
 * 「上游取样窗口」自证与读数专锁（v2.574.0）
 *
 * 治的缺口：engines/inject-collector.js 的 buildBlock()。
 *   它本来就有自证：「其余折叠：N 条」—— 但那条只管**下游折叠**（候选 → 入选）。
 *   上游 owner 读取本身在静默取样：climate 滞留取样 s.slice(-5)、
 *   避险争夺/险道/危机/公约各 slice(-3)、人物只扫 48 个。这些截断发生在
 *   **候选生成之前**，折叠自证看不见它们 ——「八条滞留只念了五条」与
 *   「一共就五条」在读数上完全同形（本仓最老的那类病）。
 *
 * 探针实测（/tmp/probe574.js，改造前 → 改造后）：
 *   · s1 八条滞留 ⇒ 旧版 slice(-5) 取到 a3..a7（数组按新→旧写入时的**最旧**五条），
 *        新版按 at 降序取 a0..a4（真正最近五条）
 *   · s2 块尾无任何取样自证 → 「上游取样：气候滞留 5/8（按最近发生取…）」
 *   · s3 只有三条（不足窗口）⇒ 无自证（不许在没截断时也喊一句）
 *   · s4 六十人 ⇒ 旧版静默只扫 48，新版读数记「人物扫描 48/60」
 *   · s6 把数组倒序 ⇒ 旧版结论全变（false）→ 新版不变（true，可复算）
 *   · s7/s8 stat().sample 与 diagnose().sample 都有这份读数（undefined → 有）
 *
 * 本批四件事：
 *   ① 取样窗口具名成表 SAMPLE（disruptions 5 / sanctuaries 3 / chokes 3 / crises 3 / pacts 3 / people 48）；
 *   ② 五处 owner 取样改走 recentOf（按时间降序 + 主键字典序兜底，不靠数组原有次序）；
 *   ③ 截断逐面留痕 + 块尾自证「上游取样：面 取/总」；
 *   ④ last / diagnose 都带 sample 面（含 truncated 计数）。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 四条负控。
 * 单独跑：node tests/inject-collector-sample-window-v2574.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/inject-collector.js';
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
  let cfg = Object.assign({ enabled: true, maxItems: 12, maxChars: 12000, maxTokens: 0 }, over || {});
  const st = Object.assign({ people: {}, currents: [], events: { rows: [] }, lastInjection: null }, state || {});
  const win = {};
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; } };
  WA.store = { get: function () { return st; }, chatId: function () { return 'c1'; },
    transact: function (fn) { fn(st); return { ok: true }; } };
  WA.settingsBus = { read: function () { return cfg; }, normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  WA.life = { buildBlock: function () { return ''; }, commitmentsView: function () { return { ok: false }; } };
  WA.plan = { chain: function () { return { ok: false }; } };
  WA.events = { timelineView: function () { return { ok: true, rows: [] }; } };
  WA.intel = { network: function () { return { ok: true, rows: [] }; } };
  WA.bonds = { network: function () { return { ok: true, rows: [] }; } };
  WA.__state = st;
  WA.injectBudget = { rankOf: function (s) { return s === '人物生活' ? 1 : 5; },
    tokensOf: function (t) { return Math.ceil(String(t || '').length / 3); },
    volumeView: function () { return { chars: 0, rows: [] }; } };
  return WA;
}
function dis(n, rev, sameAt) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ actorId: 'a' + i, weather: '暴雨', imposedState: '滞留',
    at: sameAt ? NOW : NOW - 1000 * i });
  return rev ? a.reverse() : a;
}
function faceLines(b) { return String(b || '').split('\n').filter(function (l) {
  return l.indexOf('· 气候滞留') === 0; }); }
function sampleLine(b) { return String(b || '').split('\n').filter(function (l) {
  return l.indexOf('上游取样') === 0; })[0] || ''; }
console.log('A 静态');
ok('A1 取样窗口具名成表，取样走 recentOf', function () {
  assert(CODE.indexOf('const SAMPLE = { disruptions: 5') > 0, 'SAMPLE 表不在');
  assert(CODE.indexOf('function recentOf(list, n, face, timeKey)') > 0, 'recentOf 不在');
  assert(CODE.indexOf('recentOf(disruptions, SAMPLE.disruptions') > 0, '气候滞留没走 recentOf');
});
ok('A2 块尾取样自证在位（且拼进 compose）', function () {
  assert(CODE.indexOf("'\\n上游取样：'") > 0, 'sampleLine 文本不在');
  assert(CODE.indexOf('+ sampleLine() + footer') > 0, 'compose 没拼 sampleLine');
});
ok('A3 last 与 diagnose 都带 sample 面', function () {
  assert(CODE.indexOf('sample: { rows: sampleTrace.rows.map(') > 0, 'last 没带 sample');
  assert(CODE.indexOf('truncated:last.sample.truncated') > 0, 'diagnose 没带 sample');
});
ok('A4 旧写法已消失（五处 slice(-N) 取样）', function () {
  ['disruptions.slice(-5)', 'sanctLogs.slice(-3)',
    "chokes.filter(function (ck) { return ck.status === 'active'; }).slice(-3)",
    "crises.filter(function (cr) { return cr.status === 'erupted'; }).slice(-3)",
    "pacts.filter(function (p) { return p.ratified === true; }).slice(-3)",
    'Object.keys(people).slice(0, 48)'].forEach(function (s) {
    assert(CODE.indexOf(s) < 0, '旧写法还在：' + s);
  });
});
ok('A5 取样留痕有截断判定（没截断不许记一条）', function () {
  assert(CODE.indexOf('if (arr.length > out.length) {') > 0, '截断判定不在');
});
console.log('B 行为');
ok('B1 八条滞留 ⇒ 念 5 条 + 自证 5/8', function () {
  const b = load(CODE, { routineDisruptions: dis(8) }).injectCollector.buildBlock({ people: [] });
  assert(faceLines(b).length === 5, '念的条数应 5（实 ' + faceLines(b).length + '）');
  assert(/气候滞留 5\/8/.test(sampleLine(b)), '自证不对：' + JSON.stringify(sampleLine(b)));
});
ok('B2 取最近五条（a0 在最前，不是数组尾巴）', function () {
  const p = faceLines(load(CODE, { routineDisruptions: dis(8) }).injectCollector.buildBlock({}));
  assert(/a0受/.test(p[0] || ''), '首条不是最近的 a0（实 ' + (p[0] || '') + '）');
  assert(!/a7受/.test(p.join('')), '最旧的一条不该被念（实 ' + p.join('') + '）');
});
ok('B3 不足窗口 ⇒ 无自证（没截断就不许喊）', function () {
  const b = load(CODE, { routineDisruptions: dis(3) }).injectCollector.buildBlock({});
  assert(faceLines(b).length === 3, '3 条应全念');
  assert(sampleLine(b) === '', '不该有取样自证（实 ' + sampleLine(b) + '）');
});
ok('B4 倒序输入结论不变（可复算）', function () {
  const a = faceLines(load(CODE, { routineDisruptions: dis(8) }).injectCollector.buildBlock({})).join('|');
  const c = faceLines(load(CODE, { routineDisruptions: dis(8, true) }).injectCollector.buildBlock({})).join('|');
  assert(a === c, '倒序后结论变了');
});
ok('B5 六十人 ⇒ 读数记「人物扫描 48/60」（块为空也照样记）', function () {
  const ppl = {};
  for (let i = 0; i < 60; i++) ppl['p' + i] = { name: 'n' + i };
  const A = load(CODE, { people: ppl });
  const b = A.injectCollector.buildBlock({});
  assert(b === '', '没有候选时块应是空串（实 ' + JSON.stringify(b).slice(0, 60) + '）');
  const s = A.injectCollector.stat().sample;
  assert(s && s.rows.length === 1 && s.rows[0].face === '人物扫描', JSON.stringify(s));
  assert(s.rows[0].total === 60 && s.rows[0].picked === 48, JSON.stringify(s.rows[0]));
});
ok('B6 同刻按主键字典序（不靠数组原有次序）', function () {
  const a = faceLines(load(CODE, { routineDisruptions: dis(3, false, true) }).injectCollector.buildBlock({})).join('|');
  const b = faceLines(load(CODE, { routineDisruptions: dis(3, true, true) }).injectCollector.buildBlock({})).join('|');
  assert(a === b, '同刻次序不稳：' + a + ' vs ' + b);
});
ok('B7 折叠自证与取样自证可共存', function () {
  const b = load(CODE, { routineDisruptions: dis(8) }, { maxItems: 2 }).injectCollector.buildBlock({});
  assert(/其余折叠：3 条/.test(b), '折叠自证不对：' + JSON.stringify(b).slice(0, 200));
  assert(/气候滞留 5\/8/.test(sampleLine(b)), '取样自证不对：' + JSON.stringify(sampleLine(b)));
});
console.log('C 读数');
ok('C1 sample 形状 {face,total,picked} + truncated 计数', function () {
  const A = load(CODE, { routineDisruptions: dis(8) });
  A.injectCollector.buildBlock({});
  const s = A.injectCollector.stat().sample;
  assert(s.truncated === 1 && s.rows.length === 1, JSON.stringify(s));
  assert(s.rows[0].face === '气候滞留' && s.rows[0].total === 8 && s.rows[0].picked === 5, JSON.stringify(s.rows[0]));
});
ok('C2 每次构建清零（第二次不足窗口 ⇒ truncated 0）', function () {
  const A = load(CODE, { routineDisruptions: dis(8) });
  A.injectCollector.buildBlock({});
  A.__state.routineDisruptions = dis(2);
  A.injectCollector.buildBlock({});
  const s = A.injectCollector.stat().sample;
  assert(s.truncated === 0 && s.rows.length === 0, JSON.stringify(s));
});
ok('C3 sample 是拷贝（外部改不动内部）', function () {
  const A = load(CODE, { routineDisruptions: dis(8) });
  A.injectCollector.buildBlock({});
  const s1 = A.injectCollector.stat().sample;
  s1.rows[0].picked = 999;
  assert(A.injectCollector.stat().sample.rows[0].picked === 5, '读数被外部改了');
});
ok('C4 diagnose().sample 与 stat().sample 同源', function () {
  const A = load(CODE, { routineDisruptions: dis(8) });
  A.injectCollector.buildBlock({});
  const d = A.injectCollector.diagnose().sample;
  assert(d && d.truncated === 1 && d.rows[0].face === '气候滞留', JSON.stringify(d));
});
ok('C5 没构建过 ⇒ sample 空表（不是 undefined）', function () {
  const A = load(CODE, { routineDisruptions: dis(8) });
  const s = A.injectCollector.stat().sample;
  assert(s && s.truncated === 0 && s.rows.length === 0, JSON.stringify(s));
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const b = load(code, { routineDisruptions: dis(8) }).injectCollector.buildBlock({});
  if (faceLines(b).length !== 5) bad.push('B1a');
  if (!/气候滞留 5\/8/.test(sampleLine(b))) bad.push('B1b');
  if (!/a0受/.test(faceLines(b)[0] || '')) bad.push('B2');
  const A = load(code, { routineDisruptions: dis(8) });
  A.injectCollector.buildBlock({});
  const s = A.injectCollector.stat().sample;
  if (!s || s.truncated !== 1 || s.rows.length !== 1) bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉块尾取样自证 ⇒ B1b 红', function () {
  const broken = CODE.replace('+ sampleLine() + footer', '+ footer');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1b') >= 0, 'B1b 没红（实 ' + bad.join(',') + '）');
});
ok('N2 取样不落账 ⇒ C1 红', function () {
  const broken = CODE.replace("sampleTrace.rows.push({ face: face, total: arr.length, picked: out.length });", '');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('C1') >= 0, 'C1 没红（实 ' + bad.join(',') + '）');
  assert(bad.indexOf('B1b') >= 0, 'B1b 没红（实 ' + bad.join(',') + '）');
});
ok('N3 取样排序反向 ⇒ B2 红', function () {
  const broken = CODE.replace('if (ta !== tb) return tb - ta;', 'if (ta !== tb) return ta - tb;');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B2') >= 0, 'B2 没红（实 ' + bad.join(',') + '）');
});
ok('N4 取样窗口被放大到 8 ⇒ B1a 红（窗口是判据不是装饰）', function () {
  const broken = CODE.replace('const SAMPLE = { disruptions: 5', 'const SAMPLE = { disruptions: 8');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1a') >= 0, 'B1a 没红（实 ' + bad.join(',') + '）');
});
console.log('');
if (fail) {
  console.log('INJECT-COLLECTOR-SAMPLE-V2574: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('INJECT-COLLECTOR-SAMPLE-V2574: pass（' + pass + ' 项）');