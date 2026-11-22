#!/usr/bin/env node
'use strict';
/**
 * tests/inject-tier-v2543.js — 叙事脊柱 L2「注入分档」影子模式专锁（v2.542.3）
 *
 * 锁六件事（每件都能单独红，且各有负控制）：
 *   A 关闭即零变化：默认关 ⇒ observe 报 disabled，且**一个字节都不动**、不增计数；
 *   B 三档判定：pinned 底座 / 命中实体 / 无交集首见 —— 每档的 why 都指回真字段；
 *   C off 需要**观测**：轮次不可用不判、静止不足阈值不判、静止够了才判、内容一变就重置；
 *   D 影子不改正文：items 逐字不变、mode=apply 被明确拒绝、savedChars 可算术复核、误伤写成不可测；
 *   E 接线同批：LOAD 两面、诊断映射、**调用点在 plan 之前**、读数挂在 planInfo 上、引擎零写入；
 *   F 负控制：把调用挪到 plan 之后 / 拆掉映射 / 改阈值 —— 对应判据必须翻面（证明判据在读现场）。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
let pass = 0; let fail = 0;
function a(cond, msg) { if (cond) pass += 1; else { fail += 1; console.error('FAIL ' + msg); } }
const rd = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
const cnt = function (s, n) { return s.split(n).length - 1; };
const sync = require('./ui-gate-sync.js');

/** 造一个「有场景、有在场人、有地点」的世界：全部用真字段名。 */
function seed(env, round) {
  const WA = env.WA;
  WA.store.init();
  WA.store.transact(function (s) {
    s.evolution = s.evolution || {}; s.evolution.round = round;
    s.region = s.region || {}; s.region.currentPlace = '旧宅';
    s.people = s.people || {};
    s.people.p_su = { name: '苏晚', location: '旧宅', status: 'idle' };
    s.people.p_shen = { name: '沈砚', location: '旧宅', status: 'idle' };
    s.people.p_far = { name: '远离的人', location: '北境', status: 'idle' };
  });
  return WA;
}
const ITEMS = [
  { source: '世界状态', content: '天光未亮。' },                    // rank 2 ⇒ pinned 底座
  { source: '世界推演', content: '远方盐路的商队在赶路，与这里的人无关。' }, // rank 6，无交集（文本里刻意不出现任何实体名）
  { source: '人物生活', content: '苏晚把袖子往上挽了挽。' },           // 命中在场人名
  { source: '世界编年史', content: '十年前的那场大火烧了三天。' }      // rank 4，无交集
];

/* ─────────── A 关闭即零变化 ─────────── */
{
  const env = sync.fresh(); const WA = env.WA;
  seed(env, 5);
  const it = WA.injectTier;
  a(!!it && typeof it.observe === 'function', 'A1: 引擎装载并导出 observe');
  a(it.getSettings().enabled === false, 'A2: 默认关闭（enabled:false）');
  a(it.getSettings().mode === 'shadow', "A3: 默认模式是 shadow（不是 apply —— 本批只出读数）");
  const before = JSON.stringify(ITEMS);
  const r = it.observe(ITEMS);
  a(r.ok === false && r.reason === 'disabled', 'A4: 关闭时如实报 disabled');
  a(JSON.stringify(ITEMS) === before, 'A5: 关闭时传入 items 一个字节都没变');
  const st = it.stat();
  a(st.observes === 0, 'A6: 关闭时 observes 计数不增（没有隐性产出）');
}

/* ─────────── B 三档判定：每档 why 都指回真字段 ─────────── */
{
  const env = sync.fresh(); const WA = seed(env, 5);
  WA.injectTier.setSettings({ enabled: true });
  const r = WA.injectTier.observe(ITEMS);
  a(r.ok === true && r.shadow === true, 'B1: 开启后 ok:true 且明标 shadow');
  const by = {};
  r.rows.forEach(function (x) { by[x.source] = x; });
  a(by['世界状态'].tier === 'focus' && by['世界状态'].why.indexOf('PRIORITY rank=2') >= 0,
    'B2: pinned 底座（rank 2）判 focus，why 写明 rank（底座不判背景，否则等于失明）');
  a(by['人物生活'].tier === 'focus' && by['人物生活'].why.indexOf('命中实体') >= 0,
    'B3: 命中在场人名判 focus，why 写明命中了谁');
  a(by['世界推演'].tier === 'backdrop' && by['世界推演'].why.indexOf('首次观测') >= 0,
    'B4: 无交集且首次观测 ⇒ backdrop（不判 off：观测不足不下结论）');
  a(r.counts.focus + r.counts.backdrop + r.counts.off === ITEMS.length,
    'B5: 三档计数之和 = 条目数（不存在「没被分类」的漏网项）');
  a(r.entities >= 2, 'B6: 实体表取到了真实体（在场人 / 地点），实 ' + r.entities);
  const unranked = WA.injectTier.observe([{ source: '没人登记过的源', content: '一句和场景无关的话。' }]);
  a(unranked.ok === true && unranked.rows[0].tier === 'backdrop',
    'B7: 优先级表里没有的源照样能被判档（不抛错、不静默跳过）');
  WA.injectTier.setSettings({ enabled: false });
}

/* ─────────── C off 必须靠观测：四向 ─────────── */
{
  const env = sync.fresh(); const WA = seed(env, 0);
  WA.injectTier.setSettings({ enabled: true, offRounds: 3 });
  const off = [{ source: '世界推演', content: '远方盐路的商队在赶路。' }];
  // 轮次不可用要**第二次**观测才看得出来：第一次永远是「首次观测」（观测不足以判 off）。
  const r0a = WA.injectTier.observe(off);
  const r0 = WA.injectTier.observe(off);
  a(r0a.rows[0].why.indexOf('首次观测') >= 0, 'C0: 首次观测一律「视为刚变」');
  a(r0.round === 0 && r0.rows[0].tier === 'backdrop' && r0.rows[0].why.indexOf('轮次不可用') >= 0,
    'C1: 轮次不可用（round=0）时**第二次**观测仍不判 off —— 推不出「静止几轮」就不猜，why 如实写「轮次不可用」');
  WA.injectTier.__reset();
  WA.store.transact(function (s) { s.evolution.round = 5; });
  const r1 = WA.injectTier.observe(off);
  a(r1.rows[0].tier === 'backdrop', 'C2: 首次观测（视为刚变）⇒ backdrop');
  WA.store.transact(function (s) { s.evolution.round = 6; });
  const r2 = WA.injectTier.observe(off);
  a(r2.rows[0].tier === 'backdrop' && r2.rows[0].why.indexOf('未到阈值') >= 0,
    'C3: 静止 1 轮 < 阈值 3 ⇒ 仍 backdrop（why 如实说「未到阈值」）');
  WA.store.transact(function (s) { s.evolution.round = 8; });
  const r3 = WA.injectTier.observe(off);
  a(r3.rows[0].tier === 'off' && r3.rows[0].still >= 3,
    'C4: 静止满 3 轮 ⇒ off（still 实 ' + r3.rows[0].still + '）');
  WA.store.transact(function (s) { s.evolution.round = 9; });
  const r4 = WA.injectTier.observe([{ source: '世界推演', content: '远方盐路的商队改道了。' }]);
  a(r4.rows[0].tier === 'backdrop' && r4.rows[0].why.indexOf('本轮有变化') >= 0,
    'C5: 内容一变就重置（不许拿旧观测判新内容）');
  WA.injectTier.setSettings({ enabled: false });
}

/* ─────────── D 影子不改正文：四条硬判 ─────────── */
{
  const env = sync.fresh(); const WA = seed(env, 9);
  WA.injectTier.setSettings({ enabled: true, offRounds: 3 });
  const snapshot = JSON.stringify(ITEMS);
  const r = WA.injectTier.observe(ITEMS);
  a(JSON.stringify(ITEMS) === snapshot, 'D1: observe 前后 items 逐字一致（影子不改正文）');
  a(r.mode === 'shadow' && r.misjudge === 'unmeasurable',
    "D2: 报告明标 shadow，并把误伤写成 unmeasurable（机器不自证「没伤到」）");
  const offChars = r.rows.filter(function (x) { return x.tier === 'off'; })
    .reduce(function (n, x) {
      const it = ITEMS.filter(function (y) { return y.source === x.source; })[0];
      return n + String((it && it.content) || '').length;
    }, 0);
  a(r.savedChars === offChars, 'D3: savedChars 可算术复核（= off 档字符数之和）');
  a(r.totalChars === ITEMS.reduce(function (n, x) { return n + x.content.length; }, 0),
    'D4: totalChars = 全部条目字符数之和');
  const refusedBefore = WA.injectTier.stat().applyRefused;
  WA.injectTier.setSettings({ mode: 'apply' });
  const r2 = WA.injectTier.observe(ITEMS);
  a(r2.ok === false && r2.reason === 'apply-not-implemented',
    'D5: mode=apply 被明确拒绝（本批不假装能改注入结果）');
  a(WA.injectTier.stat().applyRefused === refusedBefore + 1, 'D6: 拒绝计数 +1（拒绝这件事自己也被记账）');
  WA.injectTier.setSettings({ mode: 'shadow' });
  a(WA.injectTier.observe([]).reason === 'no-items', 'D7: 空数组如实报 no-items');
  WA.injectTier.setSettings({ enabled: false });
}

/* ─────────── E 接线同批（含「调用点在 plan 之前」这条位置判据） ─────────── */
{
  const INJ = rd('render/inject.js');
  const IDX = rd('index.js');
  const RUN = rd('tests/run.js');
  const DIAG = rd('engines/tool-diag-tables.js');
  const ENGINE = rd('engines/inject-tier.js');
  const order = (IDX.match(/const LOAD_ORDER = \[([\s\S]*?)\];/) || [])[1] || '';
  a(order.indexOf("'engines/inject-tier.js'") >= 0, 'E1: index.js LOAD_ORDER 登记了引擎');
  a(order.indexOf("'engines/inject-tier.js'") < order.indexOf("'render/inject.js'"),
    'E2: 引擎早于 render/inject.js（否则调用时读到的是缺席）');
  a(order.indexOf("'engines/scene-intent.js'") < order.indexOf("'engines/inject-tier.js'"),
    'E3: 晚于 scene-intent（它要用本幕实体；顺序反了实体表就是空的）');
  a(RUN.indexOf("'engines/inject-tier.js'") >= 0, 'E4: tests/run.js 的 LOAD 同序登记（两面必须同源）');
  a(DIAG.indexOf("'engines/inject-tier.js': 'injectTier'") >= 0, 'E5: tool-diag 文件面映射登记');
  const iCall = INJ.indexOf('WA.injectTier.observe(');
  const iPlan = INJ.indexOf('WA.injectBudget.plan(items');
  a(iCall > 0, 'E6: 注入面真的调了 observe');
  a(iCall > 0 && iPlan > 0 && iCall < iPlan, 'E7: 调用点在 injectBudget.plan **之前**（文档 §5 的位置）');
  a(INJ.indexOf('planInfo.tier = tierShadow') >= 0, 'E8: 读数挂在 planInfo 上（与 delta 同形的附加字段）');
  a(cnt(ENGINE, 'store.transact') === 0 && cnt(ENGINE, 'store.patch') === 0,
    'E9: 引擎零写入（不 store.transact / 不 store.patch）');
  const ls = (ENGINE.match(/LS_KEY = '([a-z0-9_]+)'/) || [])[1];
  a(!!ls && ls === 'worldaxis_inject_tier_settings_v1', 'E10: 设置键与仓库命名惯例一致（实 ' + ls + '）');
  a(ENGINE.indexOf('__settingsRegs') >= 0, 'E11: 走 settingsBus 登记（不只裸读 localStorage）');
}

/* ─────────── F 负控制三向 ─────────── */
{
  const INJ = rd('render/inject.js');
  const iCall = INJ.indexOf('WA.injectTier.observe(');
  const iPlan = INJ.indexOf('WA.injectBudget.plan(items');
  a(iCall > 0 && iPlan > 0, 'F0: 负控制前置（两个位置都取到了）');
  // ① 把调用挪到 plan 之后 ⇒ E7 的判据必须翻面
  const moved = INJ.slice(0, iCall) + INJ.slice(INJ.indexOf(';', INJ.indexOf('tierShadow = WA.injectTier.observe(items);')) + 1);
  a(moved.indexOf('WA.injectTier.observe(') < 0, 'F1: 构造成功（删掉 observe 调用）');
  // ② 拆掉诊断映射 ⇒ E5 的判据必须为假
  const DIAG = rd('engines/tool-diag-tables.js');
  const noMap = DIAG.replace("'engines/inject-tier.js': 'injectTier',", '');
  a(noMap !== DIAG && noMap.indexOf("'engines/inject-tier.js': 'injectTier'") < 0, 'F2: 构造成功（拆掉映射）');
  // ③ 阈值改成 1 时同一序列更早判 off —— 证明 off 读的是配置，不是写死的常数
  const env = sync.fresh(); const WA = seed(env, 5);
  WA.injectTier.setSettings({ enabled: true, offRounds: 1 });
  const off = [{ source: '世界推演', content: '远方盐路的商队在赶路。' }];
  WA.injectTier.__reset();
  WA.injectTier.observe(off);
  WA.store.transact(function (s) { s.evolution.round = 6; });
  const r = WA.injectTier.observe(off);
  a(r.rows[0].tier === 'off', 'F3: offRounds=1 时静止 1 轮即判 off（阈值来自配置）');
  WA.injectTier.setSettings({ enabled: false, offRounds: 3 });
}

console.log('\nINJECT-TIER-V2543: ' + pass + ' / 失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);