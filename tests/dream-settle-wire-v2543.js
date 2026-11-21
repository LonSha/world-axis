// WorldAxis tests/dream-settle-wire-v2543.js — 空稿闸真的接在入卷口上（v2.543.0）
// 病灶：engines/dream-settle.js 从 v2.251.0 起就是「管稿」的那一半，index.js 第 319 行
//   的装载注释写着「须晚于 word-budget；与 dream.js 正交：那里管线，这里管稿」——
//   装载位摆好了、分工写清了，**入卷口一行调用都没有**。模块账本把 dream-settle 记为
//   产品面零消费，实测 `WA.dreamSettle.screen` 全仓零调用。于是模板句与二三十字的敷衍稿
//   照样占卷位，把有内容的梦挤出 maxVolumes。
// 本锁判的是**行为**（不是「有没有那行字」）：
//   A 太短 ⇒ 拒收 settle-too-short，卷位一个不动；
//   B 模板句（够长但整段只是复述关键词）⇒ 拒收 settle-template-only；
//   C 合格稿 ⇒ 照常入卷，卷数与摘要都对；
//   D 闸门关掉 ⇒ screen 说 skipped，稿子照常入卷（不把「没筛过」当成「筛过了」）。
//   E 退回首带 retryHint（调用方要知道能不能重掷，而不是只看到一个 ok:false）。
// 负控：把 dream.js 里那段闸整块摘掉（真破坏、只摘调用不删函数），A/B/E 必红而 C/D 仍绿 ——
//   若 C 也红，说明这条锁本来就没在测闸门，而是被别的东西带着一起红的。
'use strict';
const assert = require('assert');
require('./mock.js');
const W = require('./ui-gate-sync.js').fresh().WA;
W.store.init();

assert.strictEqual(W.dreamSettle.settings().enabled, true, '空稿闸默认应开着');
W.dream.setSettings({ enabled: true });

const vols = () => W.dream.volumeList().count;
assert.strictEqual(vols(), 0, '起始卷数应为 0');

// ── A 太短：拒收，卷位不动 ──────────────────────────────────────
const a = W.dream.archive('雨夜，旧屋。');
assert.strictEqual(a.ok, false, 'A1 太短的梦必须被拒');
assert.strictEqual(a.reason, 'settle-too-short', 'A2 理由要能看出是空稿闸挡的，实为 ' + a.reason);
assert.strictEqual(vols(), 0, 'A3 被拒的梦不许占卷位');
assert.strictEqual(a.floor, 80, 'A4 要报出地板值给调用方，实为 ' + a.floor);

// ── B 模板句：够长但整段复述关键词 ────────────────────────────
const tpl = '意象围绕着雨与旧屋浮动。'.repeat(10);  // 有效字 ≥ floor，但 < floor*2.5
const b = W.dream.archive(tpl);
assert.strictEqual(b.ok, false, 'B1 模板句必须被拒');
assert.strictEqual(b.reason, 'settle-template-only', 'B2 应判成复述模板，实为 ' + b.reason);
assert.strictEqual(vols(), 0, 'B3 模板句不许占卷位');

// ── E 退回首带 retryHint ────────────────────────────────────
assert.ok(typeof a.retryHint === 'string' && a.retryHint.length > 0, 'E1 退回首要带 retryHint');
assert.ok(/重掷/.test(a.retryHint), 'E2 retryHint 要说明能重掷，实为 ' + a.retryHint);

// ── C 合格稿：照常入卷 ──────────────────────────────────────
const good = '梦里我又回到旧宅，檐下的水一滴一滴砸在石阶上。母亲在灶间背对着我说话，'
  + '声音被雨声压得很低，我凑近了也听不清她在叫谁的名字。醒来时枕边是湿的，'
  + '窗外天还没亮，院子里有人在扫水，竹帚刮过青砖，一声一声，像在数我睡着的时辰。';
const c = W.dream.archive(good, { state: '雨夜旧宅' });
assert.strictEqual(c.ok, true, 'C1 合格稿必须能入卷，实为 ' + JSON.stringify(c));
assert.strictEqual(vols(), 1, 'C2 合格稿应占一个卷位');
const v = W.dream.volumeList().volumes[0];
assert.ok(v && v.summary.indexOf('旧宅') >= 0, 'C3 卷内摘要应是这段正文');

// ── D 闸门关掉：skipped，稿子照常入卷 ───────────────────────
W.dreamSettle.saveSettings({ enabled: false });
const d = W.dream.archive('雨夜，旧屋。');
assert.strictEqual(d.ok, true, 'D1 闸门关掉时不该拦，实为 ' + JSON.stringify(d));
assert.strictEqual(vols(), 2, 'D2 闸门关掉时短稿也照常入卷（如实：没筛过）');
assert.strictEqual(W.dreamSettle.screen('雨夜，旧屋。').skipped, true, 'D3 关闭态 screen 要如实说 skipped');

console.log('dream-settle wire: PASS (太短/模板句被入卷口挡住且不占卷位，合格稿照常入卷，关闭态如实 skipped)');