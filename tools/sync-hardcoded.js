#!/usr/bin/env node
'use strict';
/**
 * tools/sync-hardcoded.js — 硬读数回填入口（计划一 #4 原文点名的薄壳）。
 *
 * 设计原则：**本文件不做判断**。全部判据住在 tests/readings.js（单一真源）里，这里只负责：
 *   ① 列出计划（dry-run，默认）——把「哪一族、从什么改成什么、涉及哪几个站点」逐条显出来；
 *   ② 加 --write 才真写盘，且先把**改写后的全文**交给 coherence / backfillPlan 复判一遍：
 *      写完仍不一致就回滚（不许「改完了、但读数还是旧的」）。
 * 纪律（与模块内一致，此处只是门面）：
 *   - 命中 0 站点 ⇒ 拒绝改写（no-site）——不猜、不新建；
 *   - 族内多值 ⇒ 拒绝改写（multi-value）——先让人看清哪一处是错的，不做「猜哪个对」；
 *   - 已是真值 ⇒ 不动（already）；
 *   - 全量替换用带 g 的正则（JS 的字符串版 replace 只替换第一处——v2.105.0 的 D2 教训）。
 *
 * 用法：
 *   node tools/sync-hardcoded.js              # dry-run，显 diff
 *   node tools/sync-hardcoded.js --write      # 真写盘（写前复判 + 写后校验 + 失败回滚）
 *   node tools/sync-hardcoded.js --json       # 机器可读输出
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const RUN_REL = 'tests/run.js';
const RUN = path.join(ROOT, RUN_REL);
const rd = require(path.join(ROOT, 'tests/readings.js'));

const argv = process.argv.slice(2);
const WRITE = argv.indexOf('--write') >= 0;
const JSON_OUT = argv.indexOf('--json') >= 0;
const src = fs.readFileSync(RUN, 'utf8');
const live = rd.measure();
const plan = rd.backfillPlan(src);

if (JSON_OUT) {
  console.log(JSON.stringify({ live: live, plan: plan, write: WRITE }, null, 2));
  process.exit(0);
}

console.log('硬读数回填：现场 refs ' + live.refs + ' / 命名空间 ' + live.namespaces + ' / 成员 ' + live.members
  + ' · 死子面 ' + live.dead + '/' + live.uiDead + '/' + live.dataOnly + ' · 仅测试 ' + live.deadInTestsOnly);
console.log('目标：' + RUN_REL + '（仅此一处；回填不碰产品面）');
if (!plan.length) { console.log('无需回填：全部读数族与现场实测同源 ✓'); process.exit(0); }
console.log('待回填 ' + plan.length + ' 族：');
plan.forEach(function (p) {
  console.log('  · ' + p.field + ' : ' + JSON.stringify(p.from) + ' -> ' + p.to);
  p.sites.forEach(function (s) { console.log('      - ' + s.prefix + ' 第' + s.line + '行 = ' + s.value); });
});

if (!WRITE) { console.log(''); console.log('（dry-run：未写盘。加 --write 真写）'); process.exit(0); }

// ── 真写盘：逐族 backfill，多值/零站点一律拒绝 ──
let next = src;
const applied = [];
const refused = [];
plan.forEach(function (p) {
  const r = rd.backfill(next, p.field, p.to);
  if (!r.ok) { refused.push({ field: p.field, reason: r.reason }); return; }
  next = r.src;
  applied.push({ field: p.field, from: r.from, to: r.to, changed: r.changed, total: r.total });
});
if (refused.length) {
  console.log('REJECTED（拒绝改写，未写盘）：' + refused.map(function (x) { return x.field + '=' + x.reason; }).join(', '));
  process.exit(1);
}
// 写前复判：改写后的全文交给同款判据，必须零问题（否则不写）
const pre = rd.coherence(next);
if (pre.length) {
  console.log('ABORT 写前复判失败（改写后仍有 ' + pre.length + ' 项问题）：');
  pre.slice(0, 5).forEach(function (x) { console.log('    · ' + x.kind + ' / ' + x.field + ' :: ' + (x.detail || '')); });
  process.exit(1);
}
if (rd.backfillPlan(next).length) { console.log('ABORT 写前复判：仍有待回填项（回填不彻底，不写）'); process.exit(1); }
fs.writeFileSync(RUN, next, 'utf8');
// 写后校验：磁盘上的字节重新跑一遍判据
const after = rd.coherence(fs.readFileSync(RUN, 'utf8'));
if (after.length) {
  fs.writeFileSync(RUN, src, 'utf8');
  console.log('ROLLBACK 写后校验失败，已恢复原文件（' + after.length + ' 项）');
  process.exit(1);
}
console.log('WRITTEN（写后校验通过）：' + applied.map(function (x) { return x.field + ' :' + x.from + '->' + x.to + '（' + x.changed + '/' + x.total + ' 站点）'; }).join(' · '));
