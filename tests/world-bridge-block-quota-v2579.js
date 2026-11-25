#!/usr/bin/env node
'use strict';
/**
 * tests/world-bridge-block-quota-v2579.js
 * 「跨世界传说注入名额」自证与读数专锁（v2.579.0）
 *
 * 治的缺口：engines/world-bridge.js buildBlock() 的一处静默截断（第 22 处）：
 *   旧法 `const rows = v.rows.slice(-cfg.maxItems);`
 *     ① 取的是**登记尾部** = 导入顺序，与「哪件事更新」无关（farfield v2.573 同病）：
 *        一批旧传说晚导入，就把真正新的传说挤出块外；
 *     ② `maxItems` 坏值时 `slice(-'x')` = `slice(NaN)` = `slice(0)` ⇒ **整环全念**，
 *        与「最多念 4 条」正好相反（名额坏配置不许放大成「全念」）；
 *     ③ 念了几条、还有几条没念，**一个字都不说** —— 「念了 2 条」被读成「只有 2 条」。
 *
 * 探针（/tmp/probe579.js，改造前 → 改造后）：
 *   s1 六条传说、maxItems=2：旧版念「传说4/传说5」（最旧两条）、零自证；
 *      新版念「传说0/传说1」（最新两条）+ 块尾「（本面名额：传说 2/6，按事件时间新→旧取；另有 4 条未列出…）」
 *   s2 stat().block：旧 undefined；新 {candidates:6,picked:2,quota:2,hidden:4,mode:'ranked-first'}
 *   s3 maxItems='x'：旧 6 条（整环全念）；新 4 条（回落 DEF.maxItems）
 *   s4 空环：旧 block=undefined（与「没构建过」同一个读数）；新 mode:'empty'
 *   s5 名额够（2 条 / 名额 3）：旧零自证；新「传说 2/2，全部列出」、mode=all-fit
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 六条负控。
 * 单独跑：node tests/world-bridge-block-quota-v2579.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/world-bridge.js';
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

/** 六条传说：L0 最新（at=NOW），L5 最旧；heard 递增只为渲染差异。 */
function legend(i) {
  return { id: 'L' + i, from: 'w' + i, fromTitle: '世界' + i, kind: 'war', label: '兵戈',
    title: '传说' + i, summary: '远方的事' + i, at: NOW - i * 1000, heard: i, importedAt: NOW };
}
function st(n, rev) {
  const s = { worldBridge: { legends: [], exported: [], seeds: 0 }, chronicle: [], worldFacts: [] };
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  if (rev) idx.reverse();
  idx.forEach(function (i) { s.worldBridge.legends.push(legend(i)); });
  return s;
}
function load(code, state, over) {
  let cfg = Object.assign({ enabled: true, maxItems: 2 }, over || {});
  const win = {};
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite, console: { log: function () {} } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; } };
  WA.inputGuard = { text: function (v, m) { return String(v == null ? '' : v).slice(0, m || 240); } };
  WA.store = { get: function () { return state; }, transact: function () { throw new Error('must-not-write'); } };
  WA.settingsBus = { read: function () { return cfg; }, normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  return WA;
}
function lines(block) {
  return String(block || '').split('\n').filter(function (x) { return x.indexOf('- ') === 0; });
}
function proofOf(block) {
  return String(block || '').split('\n').filter(function (x) { return x.indexOf('（本面名额') === 0; })[0] || '';
}
function build(code, n, over, rev) {
  const A = load(code, st(n, rev), over);
  const b = A.worldBridge.buildBlock();
  return { A: A, block: b, rows: lines(b), proof: proofOf(b), stat: A.worldBridge.stat() };
}

console.log('A 静态');
ok('A1 名额常量与 quotaOf 在位', function () {
  assert(CODE.indexOf('const LEGEND_QUOTA_MAX = 12;') > 0, 'LEGEND_QUOTA_MAX 不在');
  assert(CODE.indexOf('function quotaOf(cfg, key, max, fallback)') > 0, 'quotaOf 不在');
});
ok('A2 选取函数在位且旧刀消失', function () {
  assert(CODE.indexOf('function pickLegends(list, quota)') > 0, 'pickLegends 不在');
  assert(CODE.indexOf('v.rows.slice(-cfg.maxItems)') < 0, '旧截断（登记尾部）还在');
  assert(CODE.indexOf('rows.slice(-') < 0, '还有按尾部的 slice');
});
ok('A3 块尾自证与 block 五栗在位', function () {
  assert(CODE.indexOf('（本面名额：传说 ') > 0, '块尾自证不在');
  assert(CODE.indexOf('另有 ') > 0 && CODE.indexOf('条未列出，仍在传说环上，不是没有') > 0, '自证措辞不在');
  assert(CODE.indexOf("mode: sel.hidden > 0 ? 'ranked-first' : 'all-fit'") > 0, 'mode 判据不在');
  assert(CODE.indexOf('block: null') > 0, 'stat 里没有 block:null 起点');
});
ok('A4 stat() 对 block 深拷', function () {
  assert(CODE.indexOf('block: stat.block ? JSON.parse(JSON.stringify(stat.block)) : null,') > 0,
    'statOf 没深拷 block');
});
ok('A5 文档边界第 8 条在位', function () {
  assert(SRC.indexOf('8 **注入名额是算出来的，不是许愿（v2.579.0）**') > 0, '边界 8 不在');
  assert(SRC.indexOf('名额**只截断、不参与筛选**') > 0, '边界 8 的「只截断」条款不在');
});

console.log('B 行为');
ok('B1 六条传说、名额 2 ⇒ 念最新的两条（不是最旧的两条）+ hidden 4', function () {
  const r = build(CODE, 6);
  assert(r.rows.length === 2, '应念 2 条，实际 ' + r.rows.length);
  assert(r.rows[0].indexOf('传说0') > 0, '首条不是最新的传说0：' + r.rows[0]);
  assert(r.rows[1].indexOf('传说1') > 0, '第二条不是传说1：' + r.rows[1]);
  assert(r.rows.join('|').indexOf('传说5') < 0, '最旧的传说5仍被念（说明取的是登记尾部）');
  assert(r.stat.block.candidates === 6 && r.stat.block.hidden === 4, JSON.stringify(r.stat.block));
});
ok('B2 登记顺序反转 ⇒ 结论不变（按事件时间定序，与导入序无关）', function () {
  const a = build(CODE, 6), b = build(CODE, 6, {}, true);
  assert(a.rows.join('|') === b.rows.join('|'), '倒序登记后念的内容变了：' + b.rows.join('|'));
});
ok('B3 同刻传说按 id 字典序（可复算的兜底序）', function () {
  const s = st(0);
  ['L3', 'L1', 'L2', 'L0'].forEach(function (id) {
    s.worldBridge.legends.push({ id: id, from: 'w', fromTitle: '世界', kind: 'war',
      label: '兵戈', title: '同刻' + id, summary: '', at: NOW, heard: 0, importedAt: NOW });
  });
  const A = load(CODE, s, { maxItems: 2 });
  const rows = lines(A.worldBridge.buildBlock());
  assert(rows.length === 2, '应念 2 条');
  assert(rows[0].indexOf('同刻L0') >= 0 && rows[1].indexOf('同刻L1') >= 0, '同刻兜底序不对：' + rows.join('|'));
});
ok('B4 maxItems 坏值回落默认，不把整环全念进去', function () {
  const r = build(CODE, 6, { maxItems: 'x' });
  assert(r.rows.length === 4, '坏配置应回落 DEF.maxItems=4，实际 ' + r.rows.length);
  assert(r.stat.block.quota === 4, JSON.stringify(r.stat.block));
});
ok('B5 名额够 ⇒ 无 hidden、自证说「全部列出」、mode=all-fit', function () {
  const r = build(CODE, 2, { maxItems: 3 });
  assert(r.rows.length === 2 && r.stat.block.hidden === 0, JSON.stringify(r.stat.block));
  assert(r.stat.block.mode === 'all-fit', JSON.stringify(r.stat.block));
  assert(r.proof.indexOf('全部列出') > 0 && r.proof.indexOf('未列出') < 0, '名额够时仍说「未列出」：' + r.proof);
});
ok('B6 总开关关闭 ⇒ 空串且 block 保持 null（不冒充「空表」）', function () {
  const r = build(CODE, 6, { enabled: false });
  assert(r.block === '', '关闭时应返回空串');
  assert(r.stat.block === null, '关闭时不该写 block：' + JSON.stringify(r.stat.block));
});

console.log('C 读数');
ok('C1 五栗正确（6 / 2 / 2 / 4 / ranked-first）', function () {
  const b = build(CODE, 6).stat.block;
  assert(b && b.candidates === 6 && b.picked === 2 && b.quota === 2 && b.hidden === 4
    && b.mode === 'ranked-first', JSON.stringify(b));
});
ok('C2 没跑过 null，空环 empty（两态分得开）', function () {
  const fresh = load(CODE, st(0));
  assert(fresh.worldBridge.stat().block === null, '没跑过应为 null');
  const empty = build(CODE, 0);
  assert(empty.block === '', '空环应返回空串');
  assert(empty.stat.block && empty.stat.block.mode === 'empty', JSON.stringify(empty.stat.block));
  assert(empty.stat.block.picked === 0 && empty.stat.block.hidden === 0, JSON.stringify(empty.stat.block));
});
ok('C3 block 是深拷贝', function () {
  const A = load(CODE, st(6)); A.worldBridge.buildBlock();
  const b = A.worldBridge.stat().block; b.picked = 999;
  assert(A.worldBridge.stat().block.picked === 2, '外部改读数污染了引擎');
});
ok('C4 恒等式 picked + hidden = candidates，且 picked ≤ quota', function () {
  const b = build(CODE, 9, { maxItems: 3 }).stat.block;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
  assert(b.picked <= b.quota, JSON.stringify(b));
});
ok('C5 名额夹界：999 夹到 12、0 与负数回落默认', function () {
  assert(build(CODE, 30, { maxItems: 999 }).stat.block.quota === 12, '上限没夹住');
  assert(build(CODE, 30, { maxItems: 0 }).stat.block.quota === 4, '0 没回落默认');
  assert(build(CODE, 30, { maxItems: -3 }).stat.block.quota === 4, '负数没回落默认');
});

console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
/**
 * 判据必须与正向断言覆盖**同一性质**（本系列已吃 5 次假绿）：
 *   B1 那组既判名额（2/4），也判**念的是谁**（首条必须是传说0）——
 *   只判名额不判顺序，打反时间比较的负控就一定假绿。
 */
function problems(code) {
  const bad = [];
  const r = build(code, 6);
  if (r.rows.length !== 2) bad.push('B1');
  if (r.stat.block.candidates !== 6 || r.stat.block.hidden !== 4) bad.push('B1');
  if (!r.rows[0] || r.rows[0].indexOf('传说0') < 0) bad.push('B1');
  if (!r.proof || r.proof.indexOf('2/6') < 0 || r.proof.indexOf('另有 4 条未列出') < 0) bad.push('B1');
  if (build(code, 6).rows.join('|') !== build(code, 6, {}, true).rows.join('|')) bad.push('B2');
  const badCfg = build(code, 6, { maxItems: 'x' });
  if (badCfg.rows.length !== 4) bad.push('B4');
  if (badCfg.stat.block.quota !== 4) bad.push('B4');
  const fit = build(code, 2, { maxItems: 3 });
  if (fit.stat.block.hidden !== 0 || fit.stat.block.mode !== 'all-fit') bad.push('B5');
  const off = build(code, 6, { enabled: false });
  if (off.block !== '' || off.stat.block !== null) bad.push('B6');
  const empty = build(code, 0);
  if (!empty.stat.block || empty.stat.block.mode !== 'empty') bad.push('C2');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () { assert(problems(CODE).length === 0, problems(CODE).join(',')); });
ok('N1 回到 slice(-quota)（登记尾部）⇒ B1 红', function () {
  const broken = CODE.replace('const sel = pickLegends(v.rows, quota);',
    'const sel = { candidates: v.rows.length, picked: v.rows.slice(-quota), hidden: Math.max(0, v.rows.length - quota) };');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B1') >= 0, 'B1 没红');
});
ok('N2 时间比较反向 ⇒ B1 红（判的是「念了谁」那一行）', function () {
  const broken = CODE.replace('if (at !== bt) return bt - at;', 'if (at !== bt) return at - bt;');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B1') >= 0, 'B1 没红');
});
ok('N3 去掉名额守卫 ⇒ B4 红（坏配置不再回落默认）', function () {
  const broken = CODE.replace('if (!isFinite(n) || n < 1) return Math.min(max, fallback);', '');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B4') >= 0, 'B4 没红');
});
ok('N4 去掉块尾自证 ⇒ B1 红', function () {
  const broken = CODE.replace("+ String.fromCharCode(10) + proof;", ';');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B1') >= 0, 'B1 没红');
});
ok('N5 block 改回浅拷 ⇒ C3 红', function () {
  const broken = CODE.replace('block: stat.block ? JSON.parse(JSON.stringify(stat.block)) : null,', 'block: stat.block,');
  assert(broken !== CODE, '破坏未命中');
  const A = load(broken, st(6)); A.worldBridge.buildBlock();
  const b = A.worldBridge.stat().block; b.picked = 999;
  assert(A.worldBridge.stat().block.picked !== 2, 'C3 没红');
});
ok('N6 空环不写 block ⇒ C2 红（两态又混成一个）', function () {
  const broken = CODE.replace("stat.block = { candidates: 0, picked: 0, quota: quota, hidden: 0, mode: 'empty' };", '');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('C2') >= 0, 'C2 没红');
});

console.log('');
if (fail) {
  console.log('WORLD-BRIDGE-BLOCK-QUOTA-V2579: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('WORLD-BRIDGE-BLOCK-QUOTA-V2579: pass（' + pass + ' 项）');