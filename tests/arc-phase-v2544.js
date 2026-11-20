#!/usr/bin/env node
'use strict';
/**
 * tests/arc-phase-v2544.js — 叙事脊柱 L3「弧线与核账」专锁（v2.542.4）
 *
 * 锁七组：
 *   A 关闭零变化：phase/settle/record 三个入口都如实报 disabled，且 store 一个字节不写；
 *   B 段位五值：crisis / setup / rising / resolution / holding 各一条 + 章节切换把峰归零；
 *   C 核账四态：fulfilled / not-yet / abandoned（连续 3 轮放弃）/ unknown / none；
 *   D 欠账接回 L1：欠账存在时 compose 的条目来自欠账（kind/bucket/why 三处都对上）；
 *   E 段位反哺 L1：rising 禁 release、resolution 强制 release、crisis 无回收时点名；
 *   F 写入与容量：记录写进 store.sceneIntent.records，写超 20 条被挤出（evict 真生效）；
 *   G 接线与纪律：LOAD 两面同序、诊断映射、store 骨架物化 + 两表同名登记、
 *     **零总线订阅**（本模块不占 backstage:settled 监听位）。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
let pass = 0; let fail = 0;
function a(cond, msg) { if (cond) pass += 1; else { fail += 1; console.error('FAIL ' + msg); } }
const rd = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
const sync = require('./ui-gate-sync.js');

function seed(env, round, chapterTitle) {
  const WA = env.WA;
  WA.store.init();
  WA.store.transact(function (s) {
    s.evolution = s.evolution || {}; s.evolution.round = round;
    s.people = s.people || {};
    s.people.p_su = { name: '苏晚', location: '旧宅', action: '坐着', knowledge: { k1: 1, k2: 2 }, profile: { relations: [{ target: '沈砚', value: 5 }] } };
    if (chapterTitle) { s.chapters = s.chapters || {}; s.chapters.current = { id: chapterTitle, title: chapterTitle }; }
  });
  return WA;
}
/** 把 plotGauge 换成可控桩（只在用例内，不写盘）。 */
function stubGauge(WA, o) {
  WA.plotGauge = {
    tension: function () { return o.tension; },
    trend: function () { return o.trend || { ok: false, reason: 'insufficient-samples' }; },
    advice: function () { return { ok: true, rows: o.rows || [] }; }
  };
}

/* ─────────── A 关闭零变化 ─────────── */
{
  const env = sync.fresh(); const WA = seed(env, 5);
  WA.arcPhase.setSettings({ enabled: false });
  a(WA.arcPhase.phase().reason === 'disabled', 'A1: 关闭时 phase 如实报 disabled');
  a(WA.arcPhase.settle().reason === 'disabled', 'A2: 关闭时 settle 如实报 disabled');
  a(WA.arcPhase.record({ change: { axis: 'knowledge', target: 'p_su' } }).reason === 'disabled', 'A3: 关闭时 record 拒绝写入');
  const st = WA.store.get();
  a(Array.isArray(st.sceneIntent.records) && st.sceneIntent.records.length === 0,
    'A4: 关闭时 store.sceneIntent.records 为空（零写入，不是「写了但没人看」）');
  a(st.sceneIntent.debt === null, 'A5: 关闭时欠账单槽仍是 null');
}

/* ─────────── B 段位五值 ─────────── */
{
  const env = sync.fresh(); const WA = seed(env, 5, '第一章');
  WA.arcPhase.setSettings({ enabled: true });
  stubGauge(WA, { tension: { ok: true, score: 82, band: 'climax' }, trend: { ok: true, direction: 'wave' } });
  a(WA.arcPhase.phase().phase === 'crisis', 'B1: 张力 ≥ 75 ⇒ crisis');
  stubGauge(WA, { tension: { ok: true, score: 72, band: 'tense' }, trend: { ok: true, direction: 'wave' } });
  const rHalf = WA.arcPhase.phase();
  a(rHalf.phase === 'holding' && rHalf.fellFromPeak === 10, 'B2: 回落 10 < 阈值 15 → 不判 resolution（实 holding，fellFromPeak=10）');
  stubGauge(WA, { tension: { ok: true, score: 60, band: 'tense' }, trend: { ok: true, direction: 'wave' } });
  const rRes = WA.arcPhase.phase();
  a(rRes.phase === 'resolution', 'B3: 从峰回落 ≥ 15 且非上行 ⇒ resolution（实回落 ' + rRes.fellFromPeak + '）');
  // 章节一切，峰归零 ⇒ 同样 60 分不再是 resolution
  WA.store.transact(function (s) { s.chapters.current = { id: '第二章', title: '第二章' }; });
  const rNew = WA.arcPhase.phase();
  a(rNew.phase === 'holding' && rNew.fellFromPeak === null,
    'B4: 章节变化后峰归零（同样的分数不再算「回落」，实 ' + rNew.phase + '）');
  stubGauge(WA, { tension: { ok: true, score: 20, band: 'calm' }, trend: { ok: true, direction: 'wave' } });
  a(WA.arcPhase.phase().phase === 'setup', 'B5: 张力 < 35 且非上行 ⇒ setup');
  stubGauge(WA, { tension: { ok: true, score: 50, band: 'warming' }, trend: { ok: true, direction: 'rising' } });
  a(WA.arcPhase.phase().phase === 'rising', 'B6: 连续上行 ⇒ rising');
  stubGauge(WA, { tension: { ok: true, score: 50, band: 'warming' }, trend: { ok: true, direction: 'wave' } });
  a(WA.arcPhase.phase().phase === 'holding', 'B7: 35~75 且既非上行也非回落 ⇒ holding（文档四值覆盖不到的区间，不硬塞）');
  stubGauge(WA, { tension: { ok: false, reason: 'no-signal' }, trend: { ok: false, reason: 'x' } });
  const rNS = WA.arcPhase.phase();
  a(rNS.ok === false && rNS.reason === 'no-tension' && rNS.skipped.some(function (x) { return x.face === 'plotGauge'; }),
    'B8: 张力算不出时 ok:false 并点名（不猜一个段位）');
}

/* ─────────── C 核账四态 ─────────── */
{
  const env = sync.fresh(); const WA = seed(env, 7);
  WA.arcPhase.setSettings({ enabled: true });
  a(WA.arcPhase.settle().status === 'none', 'C1: 还没有上一条意图 ⇒ status:none');
  // 写一条 knowledge 意图：底数 = knowledge 两键
  WA.arcPhase.record({ round: 1, change: { axis: 'knowledge', target: 'p_su', why: 'director.item.bucket=foreshadow' }, watch: WA.arcPhase.measure({ axis: 'knowledge', target: 'p_su' }) });
  a(WA.store.get().sceneIntent.records.length === 1, 'C2: 记录已写入（一条）');
  const rNotYet = WA.arcPhase.settle();
  a(rNotYet.status === 'not-yet' && rNotYet.attempts === 1, 'C3: 世界没变 ⇒ not-yet，attempts 1（记欠账）');
  a(WA.store.get().sceneIntent.debt && WA.store.get().sceneIntent.debt.target === 'p_su', 'C4: 欠账单槽记下了目标');
  // 真兑现：knowledge 多一键
  WA.store.transact(function (s) { s.people.p_su.knowledge.k3 = 3; });
  const rOk = WA.arcPhase.settle();
  a(rOk.status === 'fulfilled' && rOk.from === 2 && rOk.to === 3, 'C5: knowledge 键数 2→3 ⇒ fulfilled（from/to 如实报）');
  a(WA.store.get().sceneIntent.debt === null, 'C6: 兑现后欠账单槽清空');
  // unknown：目标人不存在
  WA.arcPhase.record({ round: 2, change: { axis: 'knowledge', target: 'p_ghost', why: 'x' }, watch: { kind: 'knowledge', axis: 'knowledge', target: 'p_ghost', value: 0 } });
  a(WA.arcPhase.settle().status === 'unknown', 'C7: 目标字段不可读 ⇒ unknown（不当作兑现，也不记欠账）');
  // abandoned：连续 3 轮不兑现
  WA.arcPhase.record({ round: 3, change: { axis: 'situation', target: 'p_su', why: 'x' }, watch: WA.arcPhase.measure({ axis: 'situation', target: 'p_su' }) });
  const s1 = WA.arcPhase.settle();
  const s2 = WA.arcPhase.settle();
  const s3 = WA.arcPhase.settle();
  a(s1.status === 'not-yet' && s2.status === 'not-yet' && s3.status === 'abandoned',
    'C8: 连续 3 轮不兑现 ⇒ 第 3 次 abandoned（防死循环；实 ' + s1.status + '/' + s2.status + '/' + s3.status + '）');
  a(WA.store.get().sceneIntent.debt === null, 'C9: 放弃后欠账单槽清空（不会永远卡在同一件事上）');
  a(WA.arcPhase.stat().abandoned >= 1, 'C10: 放弃这件事自己被记账');
}

/* ─────────── D 欠账接回 L1 ─────────── */
{
  const env = sync.fresh(); const WA = seed(env, 9);
  WA.arcPhase.setSettings({ enabled: true });
  WA.sceneIntent.setSettings({ enabled: true });
  WA.store.transact(function (s) {
    s.sceneIntent.debt = { axis: 'relation', target: 'p_su', attempts: 1, at: 8, why: 'not-settled' };
  });
  const c = WA.sceneIntent.compose();
  a(c.ok === true, 'D1: 有欠账时 compose 仍能出意图');
  a(c.item && c.item.kind === 'debt' && c.item.bucket === 'debt', 'D2: 条目来自欠账（kind/bucket 都是 debt）');
  a(c.why.join('|').indexOf('director.debt') >= 0, 'D3: why 写明来源是 debt（不是 director.rank）');
  a(c.change && c.change.target === 'p_su', 'D4: 改变轴的目标就是欠账目标（不换一个人）');
  WA.sceneIntent.setSettings({ enabled: false });
}

/* ─────────── E 段位反哺 L1 ─────────── */
{
  const env = sync.fresh(); const WA = seed(env, 11, '第一章');
  WA.arcPhase.setSettings({ enabled: true });
  WA.sceneIntent.setSettings({ enabled: true });
  WA.store.transact(function (s) {
    s.currents = [{ title: '盐路被截', advanceAtRound: 1, stage: 'boiling' }];
    s.memory = s.memory || {};
    s.memory.foreshadows = [{ id: 'fs1', content: '枕下那封没拆的信', status: 'developing', at: 2 }];
  });
  // 收线建议 ⇒ 本来会 release；但段位 rising 时禁 release
  stubGauge(WA, { tension: { ok: true, score: 50, band: 'warming' }, trend: { ok: true, direction: 'rising' }, rows: [{ id: 'close-overdue' }] });
  const cR = WA.sceneIntent.compose();
  a(cR.pace === 'hold', 'E1: rising 阶段禁止 release ⇒ hold（实 ' + cR.pace + '）');
  a(cR.why.join('|').indexOf('rising 禁止 release') >= 0, 'E2: why 写明被段位改写（不是静默改）');
  // 先造峰（crisis），再回落 ⇒ resolution ⇒ 强制 release
  stubGauge(WA, { tension: { ok: true, score: 85, band: 'climax' }, trend: { ok: true, direction: 'wave' } });
  WA.sceneIntent.compose();
  stubGauge(WA, { tension: { ok: true, score: 60, band: 'tense' }, trend: { ok: true, direction: 'wave' } });
  const cRes = WA.sceneIntent.compose();
  a(cRes.pace === 'release', 'E3: resolution 阶段优先收线 ⇒ release（实 ' + cRes.pace + '，段位 ' + (cRes.phase && cRes.phase.phase) + '）');
  // crisis 且没有可回收伏笔 ⇒ 点名
  WA.store.transact(function (s) { s.memory.foreshadows = []; });
  stubGauge(WA, { tension: { ok: true, score: 85, band: 'climax' }, trend: { ok: true, direction: 'wave' } });
  const cC = WA.sceneIntent.compose();
  a(cC.skipped.some(function (x) { return x.face === 'arcPhase'; }),
    'E4: crisis 要求回收但没有可回收伏笔时**点名**（不是静默跳过）');
  a(cC.phase && cC.phase.phase === 'crisis', 'E5: compose 返回值里带段位（下游与诊断可读）');
  WA.sceneIntent.setSettings({ enabled: false });
}

/* ─────────── F 写入与容量 ─────────── */
{
  const env = sync.fresh(); const WA = seed(env, 20);
  WA.arcPhase.setSettings({ enabled: true });
  for (let i = 0; i < 25; i += 1) {
    WA.arcPhase.record({ round: i, change: { axis: 'knowledge', target: 'p_su', why: 'x' }, watch: WA.arcPhase.measure({ axis: 'knowledge', target: 'p_su' }) });
  }
  const rec = WA.store.get().sceneIntent.records;
  a(Array.isArray(rec) && rec.length === 20, 'F1: 写 25 条后环形被挤到 20 条（evict.array 真生效，实 ' + (rec && rec.length) + '）');
  a(rec[0].round === 5, 'F2: 挤出的是**最旧**的（首条 round 应为 5，实 ' + (rec[0] && rec[0].round) + '）');
  a(rec[rec.length - 1].round === 24, 'F3: 最新一条仍在尾部');
  a(WA.arcPhase.view().records.length === 20, 'F4: view() 读到的也是 20（只读视图与 store 同源）');
}

/* ─────────── G 接线与纪律 ─────────── */
{
  const IDX = rd('index.js');
  const RUN = rd('tests/run.js');
  const DIAG = rd('engines/tool-diag-tables.js');
  const ENGINE = rd('engines/arc-phase.js');
  const STORE = rd('core/store.js');
  const EVICT = rd('core/evict.js');
  const L1 = rd('engines/scene-intent.js');
  const order = (IDX.match(/const LOAD_ORDER = \[([\s\S]*?)\];/) || [])[1] || '';
  a(order.indexOf("'engines/arc-phase.js'") >= 0, 'G1: index.js LOAD_ORDER 登记了 L3 引擎');
  a(order.indexOf("'engines/arc-phase.js'") < order.indexOf("'engines/scene-intent.js'"),
    'G2: arc-phase 早于 scene-intent（后者在 compose 里读它；顺序反了段位永远是缺席）');
  a(RUN.indexOf("'engines/arc-phase.js'") >= 0, 'G3: tests/run.js 的 LOAD 同序登记');
  a(DIAG.indexOf("'engines/arc-phase.js': 'arcPhase'") >= 0, 'G4: tool-diag 文件面映射登记');
  // 只算**真订阅调用**：注释里提到这个事件不算订阅。
  a(!/WA\.on\(\s*['"]backstage:settled/.test(ENGINE) && !/WA\.bus\.on\(/.test(ENGINE),
    'G5: **零总线订阅**（不占 backstage:settled 监听位；改走懒核账）');
  a(L1.indexOf('arcSettle()') >= 0 && L1.indexOf('arcPhase.record') >= 0, 'G6: L1 真调核账与写入');
  a(STORE.indexOf('sceneIntent: { records: [], debt: null }') >= 0, 'G7: store 骨架**物化**了 sceneIntent（登记≠物化，两件事都要做）');
  a(STORE.indexOf("'sceneIntent.records': { cap: 20") >= 0, 'G8: store 容量表登记 cap 20');
  a(EVICT.indexOf("'sceneIntent.records':") >= 0, 'G9: core/evict.js 的 SITES 同名登记（缺则 evict 走 unknown-site 静默失败）');
  a(/arc-phase\.js/.test(STORE.slice(STORE.indexOf("'sceneIntent.records'"), STORE.indexOf("'sceneIntent.records'") + 200)),
    'G10: 容量表的 site 字段写明写入方是 arc-phase.js（双侧同源）');
}

console.log('\nARC-PHASE-V2544: ' + pass + ' / 失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);