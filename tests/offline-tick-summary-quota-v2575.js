#!/usr/bin/env node
'use strict';
/**
 * tests/offline-tick-summary-quota-v2575.js
 * 「离线摘要跳过明细名额」自证与读数专锁（v2.575.0）
 *
 * 治的缺口：engines/offline-tick.js 的 summary()。
 *   旧写法 skips.filter(at===last.at).slice(-last.protectedRows).slice(0, cfg.maxItems)
 *   —— 两刀都在静默截断：第一刀按「登记次序尾巴」取，第二刀再砍到 maxItems。
 *   摘要只说「其中 N 处改动因落在你的记忆锚上而被跳过」，读者看不出这 N 是全部还是抽样。
 *
 * 探针实测（/tmp/probe575.js，改造前 → 改造后）：
 *   · s1 同一批九处跳过 ⇒ 旧版念 p8..p4（登记尾巴，且不提还有 4 处），
 *        新版念 p0..p4 + 「（另有 4 处未列出，本面只念最近 5 处）」
 *   · s3 summary() 无名额读数（undefined）→ rows 5 / quota 5 / hidden 4
 *   · s4 stat() 无 block（undefined → 五栗 {candidates:9,picked:5,quota:5,hidden:4,recent-first}）
 *   · s5 不足窗口（三处）⇒ 无自证（不许没截断也喊一句）
 *   · s6 数据倒序 ⇒ 旧版结论全变（false → true，可复算）
 *   · s7 「没摘要过」（null）与「摘要过但这批没有跳过」（mode='empty'）可分辨
 *   · s8 maxItems 被写成字符串 ⇒ 旧版 slice(0,'x') 得 0 条（明细整块消失），新版回落 5
 *
 * 本批四件事：
 *   ① 名额提成 quotaOf(cfg)（防 NaN/0；上限 QUOTA_MAX=12 与设置面 bound 同源）；
 *   ② pickSkips 显式按 at 降序 + path 字典序（名额只截断不参与筛选）；
 *   ③ 摘要行追加自证「另有 N 处未列出，本面只念最近 M 处」（不改原有那句的形态）；
 *   ④ stat().block 五栗 + stat 里声明 block:null + statOf 单独拷贝；summary() 返回值也带名额面。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 四条负控。
 * 单独跑：node tests/offline-tick-summary-quota-v2575.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/offline-tick.js';
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
function load(code, skips, over) {
  let cfg = Object.assign({ enabled: true, stepMs: 3600000, maxRounds: 12, minGapMs: 60000,
    maxAnchors: 24, capBatches: 12, capSkips: 48, maxItems: 5 }, over || {});
  const st = { offlineTick: {
    batches: [{ from: NOW - 21600000, to: NOW, elapsedMs: 21600000, rounds: 6,
      capped: false, applied: true, protectedRows: skips.length, at: NOW }],
    skips: skips, rounds: 6 } };
  const win = {};
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; } };
  WA.inputGuard = { text: function (v, m) { return String(v == null ? '' : v).slice(0, m || 80); } };
  WA.store = { get: function () { return st; },
    transact: function (fn) { fn(st); return { ok: true }; } };
  WA.settingsBus = { read: function () { return cfg; },
    normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  WA.evict = { array: function () {} };
  WA.__state = st;
  return WA;
}
function skips(n, rev) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ path: 'p' + (n - 1 - i), kind: 'anchor', at: NOW });
  return rev ? a.reverse() : a;
}
function rowLine(b) { return String(b || '').split('\n').filter(function (l) {
  return l.indexOf('- 其中') === 0; })[0] || ''; }
function pathsOf(line) {
  const m = /被跳过：(.+?)(（|。)/.exec(line);
  return m ? m[1].split('、') : [];
}
console.log('A 静态');
ok('A1 名额具名 quotaOf，summary 走它', function () {
  assert(CODE.indexOf('function quotaOf(cfg)') > 0, 'quotaOf 不在');
  assert(CODE.indexOf('const quota = quotaOf(cfg);') > 0, 'summary 没走 quotaOf');
  assert(CODE.indexOf('function pickSkips(list, quota)') > 0, 'pickSkips 不在');
});
ok('A2 摘要行带自证（另有 N 处未列出）', function () {
  assert(CODE.indexOf("'（另有 ' + pk.hidden + ' 处未列出，本面只念最近 '") > 0, '自证不在');
});
ok('A3 stat 声明 block，statOf 单独拷贝', function () {
  assert(CODE.indexOf('block: null };') > 0, 'stat 没声明 block');
  assert(CODE.indexOf('out.block = stat.block ? Object.assign({}, stat.block) : null') > 0,
    'statOf 没单独拷 block');
});
ok('A4 旧两刀截断已消失', function () {
  assert(CODE.indexOf('.slice(-last.protectedRows).slice(0, cfg.maxItems)') < 0, '旧写法还在');
});
ok('A5 文档边界 8 在位', function () {
  assert(SRC.indexOf('8 摘要名额（maxItems）只截断不参与筛选') > 0, '边界 8 不在');
});
console.log('B 行为');
ok('B1 九处跳过 ⇒ 念 5 处 + 自证 4 处', function () {
  const b = load(CODE, skips(9)).offlineTick.buildBlock();
  assert(pathsOf(rowLine(b)).length === 5, '念的条数应 5（实 ' + pathsOf(rowLine(b)).length + '）');
  assert(/另有 4 处未列出/.test(rowLine(b)), '自证不对：' + JSON.stringify(rowLine(b)));
});
ok('B2 顺序按 path 字典序（p0 最前，不是登记尾巴）', function () {
  const p = pathsOf(rowLine(load(CODE, skips(9)).offlineTick.buildBlock()));
  assert(p[0] === 'p0', '首条应是 p0（实 ' + p[0] + '）');
  assert(p.join(',') === 'p0,p1,p2,p3,p4', '顺序不对：' + p.join(','));
});
ok('B3 不足窗口 ⇒ 无自证（没截断就不许喊）', function () {
  const b = load(CODE, skips(3)).offlineTick.buildBlock();
  assert(pathsOf(rowLine(b)).length === 3, '3 处应全念');
  assert(rowLine(b).indexOf('另有') < 0, '不该有自证：' + rowLine(b));
});
ok('B4 倒序数据结论不变（可复算）', function () {
  const a = rowLine(load(CODE, skips(9)).offlineTick.buildBlock());
  const c = rowLine(load(CODE, skips(9, true)).offlineTick.buildBlock());
  assert(a === c, '倒序后结论变了：' + a + ' vs ' + c);
});
ok('B5 maxItems 被写成字符串 ⇒ 回落默认 5（不许整块消失）', function () {
  const b = load(CODE, skips(9), { maxItems: 'x' }).offlineTick.buildBlock();
  assert(pathsOf(rowLine(b)).length === 5, '应回落 5 处（实 ' + pathsOf(rowLine(b)).length + '）');
});
ok('B6 这批没有跳过 ⇒ 不出现「其中」行', function () {
  const b = load(CODE, []).offlineTick.buildBlock();
  assert(b.indexOf('[你不在时]') === 0, '块应在');
  assert(rowLine(b) === '', '不该有「其中」行：' + rowLine(b));
});
ok('B7 summary() 返回值带名额面', function () {
  const s = load(CODE, skips(9)).offlineTick.summary();
  assert(s.ok && s.quota === 5 && s.hidden === 4 && s.candidates === 9, JSON.stringify({ q: s.quota, h: s.hidden, c: s.candidates }));
});
console.log('C 读数');
ok('C1 五栗正确（九处 ⇒ 9/5/5/4/recent-first）', function () {
  const A = load(CODE, skips(9));
  A.offlineTick.buildBlock();
  const b = A.offlineTick.stat().block;
  assert(b && b.candidates === 9 && b.picked === 5 && b.quota === 5 && b.hidden === 4, JSON.stringify(b));
  assert(b.mode === 'recent-first', 'mode 应 recent-first（实 ' + b.mode + '）');
});
ok('C2 名额够 ⇒ mode=all-fit', function () {
  const A = load(CODE, skips(3));
  A.offlineTick.buildBlock();
  assert(A.offlineTick.stat().block.mode === 'all-fit', 'mode 应 all-fit');
});
ok('C3 没摘要过 vs 摘要过但无跳过可分辨', function () {
  const A = load(CODE, []);
  assert(A.offlineTick.stat().block === null, '没摘要过应是 null');
  A.offlineTick.summary();
  assert(A.offlineTick.stat().block.mode === 'empty', '无跳过时 mode 应 empty');
});
ok('C4 block 是拷贝', function () {
  const A = load(CODE, skips(9));
  A.offlineTick.buildBlock();
  const b1 = A.offlineTick.stat().block;
  b1.picked = 999;
  assert(A.offlineTick.stat().block.picked === 5, '读数被外部改了');
});
ok('C5 picked + hidden = candidates', function () {
  const A = load(CODE, skips(9));
  A.offlineTick.buildBlock();
  const b = A.offlineTick.stat().block;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const b = load(code, skips(9)).offlineTick.buildBlock();
  if (pathsOf(rowLine(b)).length !== 5) bad.push('B1a');
  if (!/另有 4 处未列出/.test(rowLine(b))) bad.push('B1b');
  if (pathsOf(rowLine(b))[0] !== 'p0') bad.push('B2');
  const A = load(code, skips(9));
  A.offlineTick.buildBlock();
  const bb = A.offlineTick.stat().block;
  if (!bb || bb.hidden !== 4 || bb.mode !== 'recent-first') bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉自证 => B1b 红', function () {
  const broken = CODE.replace(
    "+ (pk.hidden ? '（另有 ' + pk.hidden + ' 处未列出，本面只念最近 ' + rows.length + ' 处）' : '')", '');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B1b') >= 0, 'B1b 没红');
});
ok('N2 hidden 恒 0 => B1b + C1 红', function () {
  const broken = CODE.replace('hidden: Math.max(0, arr.length - picked.length)', 'hidden: 0');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B1b') >= 0 && bad.indexOf('C1') >= 0, '没红（实 ' + bad.join(',') + '）');
});
ok('N3 同刻主键序反向 => B2 红（时间全同，判的是 path 兜底那一行）', function () {
  const broken = CODE.replace("return String((a && a.path) || '').localeCompare(String((b && b.path) || ''));",
    "return String((b && b.path) || '').localeCompare(String((a && a.path) || ''));");
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B2') >= 0, 'B2 没红');
});
ok('N4 去掉名额守卫 => B5 红', function () {
  const broken = CODE.replace('if (!isFinite(n) || n < 1) return DEF.maxItems;', '');
  assert(broken !== CODE, '破坏未命中');
  const b = load(broken, skips(9), { maxItems: 'x' }).offlineTick.buildBlock();
  assert(pathsOf(rowLine(b)).length !== 5, 'B5 没红（实 ' + pathsOf(rowLine(b)).length + '）');
});
console.log('');
if (fail) {
  console.log('OFFLINE-TICK-SUMMARY-QUOTA-V2575: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('OFFLINE-TICK-SUMMARY-QUOTA-V2575: pass（' + pass + ' 项）');