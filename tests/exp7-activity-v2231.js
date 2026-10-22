#!/usr/bin/env node
// WorldAxis tests/exp7-activity-v2231.js (v2.231.0) -- EXP-7 专锁：可参与的公共活动
//
// 【它治什么（缺口，开工前逐条复核现场）】
//   计划原文：「**活动筹备、报名/邀请、名额、资源需求、开场、分阶段参与与结果**。
//   参赛 / 主持 / 观众三种权限分列；天气 / 缺员 / 场地冲突可延期、变更、取消。」
//   验收原文：「一次有报名条件的比赛从报名到分轮结果，**缺席者不能获奖**；
//   **雨天延期能同步日程与参与者安排**；**结算一次奖品和关系变化**。」
//
//   现场事实（不是静态推测）：
//     · `engines/agenda.js` 是**只读聚合器**（五源 → 一张表），行形状
//       `{at, kind, source, label, subject, ref, status, canAct, unknown}` ——
//       它答不出「谁报了名、名额剩几个、开过场没有、分几轮、谁缺席、奖发了没有」；
//     · `engines/contest.js` 答「两个人在一个场景里逐阶段逐轮谁占优」——
//       那是**对抗的过程**，没有报名、名额、观众、奖品，也没有「谁缺席」；
//     · `engines/liaison.js` 答「谁跟谁接上了头」——那是**关系入口**，不是**活动**；
//     · `engines/ruling.js` 答「这桩指控怎么判」——那是**裁断**，活动不是案子。
//   四者合起来仍缺的那一格：**「办了一场活动」不是「有一个日程条目」**。
//
// 【本锁咬住的十六条否定式边界】
//   · **不自动开场**：没有主持 ⇒ no-host（B3/N2）。
//   · **不建第二份名册**：报名者必须是世界里的人物（B4/N3）。
//   · **不超名额**：quota 满 ⇒ quota-full；主持/观众**不计名额**（B2/N1）。
//   · **不重复报名**：同一人一个角色（already-signed，B4b）。
//   · **不跳段 / 收口后不可动**：bad-phase / activity-closed 分列（B14/N11）。
//   · **轮次必须递增**：判据是**序数**，不是墙钟毫秒（B6/N9）。
//   · **不许替未报名者出场**：no-signup（B6b）。
//   · **缺席者不能获奖**：最后一轮缺席者被排除且逐个列出（验收原文，B5/N4）。
//   · **不凭空发奖 / 先判后扣**：short-prize，一分不动（B11/N10）。
//   · **不两头动账**：来源就是获奖者本人 ⇒ selfAward，净流动 0（B10/N8）。
//   · **延期不改名单**：只动活动行的剧情日，报名行一行不动（验收原文，B7/B8/N5）。
//   · **雨天是判据不是装饰**：weather 读不到 ⇒ 如实说读不到（B7b/N6）。
//   · **取消不是结算**：不发奖、不动关系（B13/N11b）。
//   · **注入双闸**：无观察者 ⇒ 空串；未参与 ⇒ 空串（B12/N7）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约与边界 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/exp7-activity-v2231.js';
const AC = 'engines/activity.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
// ── 破坏锚点（各恰 1 次，A6 逐键核）──
const ANCHOR = {
  // ① 名额闸（三权限分列：只对 contestant 生效）
  quotaGate: { rel: AC, txt: "      if (r === 'contestant' && a.quota > 0 && contenders >= a.quota) {" },
  // ② 主持闸（没有主持人不许开场）
  hostGate: { rel: AC, txt: "      if (!hosts.length) { out = refuse('no-host', { activity: a.id, hint: '没有主持人不许开场' }); return false; }" },
  // ③ 缺席排除（**核心**：最后一轮在场才算获奖）
  absentGate: { rel: AC, txt: "      const winners = contenders.map(function (s) { return key(s.who); }).filter(function (w) { return present.indexOf(w) >= 0; });" },
  // ④ 雨天判据（读 weather 真源，不是装饰）
  weatherGate: { rel: AC, txt: "      const bad = w.known && BAD_WEATHER.indexOf(w.weather) >= 0;" },
  // ⑤ 延期不改名单（只动活动行的剧情日；报名行一行不动）
  postponeOnly: { rel: AC, txt: "      a.resumeStatus = a.status;\n      a.status = 'postponed';" },
  // ⑥ 注入第一道闸：无观察者 ⇒ 空串
  viewerGate: { rel: AC, txt: "    if (!viewer) return '';   // 无观察者 ⇒ 零 token（绝不产出全知版活动名单）" },
  // ⑦ 注入第二道闸：没参与任何活动 ⇒ 仍是零 token（纵深防御）
  memberGate: { rel: AC, txt: "    if (!mine.length) return '';   // 没参与任何活动 ⇒ 仍是零 token（纵深防御）" },
  // ⑧ 自奖不两头动账（也不凭空入账）
  selfGate: { rel: AC, txt: "        if (x.self) { selfAwarded++; return; }   // 净流动 0：不两头动账" },
  // ⑨ 轮次序数判据
  roundSeq: { rel: AC, txt: "      if (!(n > 0) || n !== done.length + 1) {" },
  // ⑩ 先判后扣（付款方不够 ⇒ 一分不动）
  purseGate: { rel: AC, txt: "        if (!src || have < demand[k]) {" },
  // ⑪ 终态闸（已结算 / 已取消之后不再收指令）
  closedGate: { rel: AC, txt: "      if (a.status === 'settled' || a.status === 'cancelled') { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }\n      a.status = 'cancelled';" }
};
const EXPORTS = ['STATUS', 'ROLES', 'getSettings', 'setSettings', 'plan', 'open', 'signup', 'withdraw',
  'start', 'round', 'settle', 'postpone', 'resume', 'cancel', 'activityOf', 'signups', 'rounds', 'awards',
  'list', 'view', 'buildBlock', 'stat', 'resetStat', 'reset', 'reload'];

/** 夹具：三个人（甲/乙/丙 各 100 银元）+ 空的活动面（自己 seed、自己收）。 */
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    ['甲', '乙', '丙'].forEach(function (n) {
      d.people['p_' + n] = { id: 'p_' + n, name: n, resources: { '银元': 100 }, updatedAt: 1 };
    });
    d.activity = { activities: [], signups: [], results: [], awards: [] };
    return true;
  }, 'exp7:seed');
}
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  seed(env.WA);
  env.WA.activity.setSettings({ enabled: true, maxActivities: 24, maxSignups: 96, maxRounds: 12,
    maxResults: 96, maxAwards: 48, treasury: '', viewer: '' });
  return env;
}
/** 筹备（默认秋日射柳 / 校场 / 剧情日 10 / 2 轮）。 */
function planIt(W, over) {
  return W.activity.plan(Object.assign({ title: '秋日射柳', place: '校场', day: 10, rounds: 2, quota: 2 },
    over || {}));
}
function money(W, who) { return +((((W.store.get().people['p_' + who] || {}).resources || {})['银元'] || 0)); }
/** 推到「进行中」：筹备 → 开放 → 报名（甲参赛 / 乙主持）→ 开场。 */
function toRunning(W, over, extra) {
  const p = planIt(W, over);
  if (!p.ok) return p;
  const id = p.activity.id;
  const o = W.activity.open(id); if (!o.ok) return o;
  const s1 = W.activity.signup(id, '甲', 'contestant'); if (!s1.ok) return s1;
  const s2 = W.activity.signup(id, '乙', 'host'); if (!s2.ok) return s2;
  // 第三参数 = 开场**之前**补报名（形如 [['丙', 'contestant']]）。
  // 必须提前：`start()` 之后名单冻结（B15c 同一条设计），开场后再报一律 bad-phase ——
  // 那不是引擎的缺陷，是「参赛者不能中途凭空出现」的边界；夹具要按真规矩排。
  (extra || []).forEach(function (row) {
    const sr = W.activity.signup(id, row[0], row[1] || 'contestant');
    if (!sr.ok) throw new Error('toRunning 补报名失败：' + row[0] + ' ⇒ ' + sr.reason);
  });
  const st = W.activity.start(id); if (!st.ok) return st;
  return { ok: true, id: id };
}

async function runAll(a, ov) {
  ov = ov || {};
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, AC)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/activity.js'") > 0, 'A2: tests/run.js LOAD 已挂');
  a(rd('index.js', ov).indexOf("'engines/activity.js'") > 0, 'A2b: index.js LOAD_ORDER 已挂');
  a(rd('engines/tool-diag.js', ov).indexOf("'engines/activity.js': 'activity'") > 0, 'A3: tool-diag 声明表已登记');
  a(rd('engines/tool-diag.js', ov).indexOf('activity: secActivity()') > 0
    && rd('engines/tool-diag.js', ov).indexOf('function secActivity()') > 0,
    'A3b: 诊断面单列一节（与 agenda 分列：那一节答「接下来有什么事」，本节答「这场活动办到哪一步」）');
  (function () {
    a(rd('core/store.js', ov).indexOf('activity: { activities: [], signups: [], results: [], awards: [] }') > 0,
      'A4: 骨架已物化（登记不等于物化）');
    const E = rd('core/evict.js', ov);
    a(E.indexOf("'activity.activities'") > 0 && E.indexOf("'activity.signups'") > 0
      && E.indexOf("'activity.results'") > 0 && E.indexOf("'activity.awards'") > 0,
      'A4b: 挤出站点已登记（四本账各一处）');
  })();
  (function () {
    const I = rd('render/inject.js', ov);
    a(I.indexOf("    'activity',") > 0 && I.indexOf('activity: true') > 0,
      'A5: 注入源已进 SOURCES 与默认可见表（只加源表不加分支 = 声明了没人消费）');
    a(I.indexOf('WA.activity.buildBlock()') > 0,
      'A5b: 注入分支真消费 buildBlock（只加分支不加源表 = 开关点了零效果）');
    a(I.indexOf("activity: 'worldaxis_activity_settings_v1'") > 0,
      'A5c: 模块开关表已登记（不登记 ⇒ moduleEnabled 返回 null，勾了总开关却说「模块没加载」）');
    a(rd('ui/panel.js', ov).indexOf("activity: '公共活动'") > 0,
      'A5d: 面板显示名已登记（否则用户在开关面板上看到英文键名）');
  })();
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel, ov), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A6: 破坏锚点在目标文件里各恰 1 次（不合：' + badA.join(',') + '）');
  (function () {
    const self = rd(SELF_REL, ov);
    const table = self.slice(self.indexOf('const ANCHOR = {'), self.indexOf('\n};', self.indexOf('const ANCHOR = {')));
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A7: 锚点逐键在锚表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  (function () {
    const e0 = envWith(ov);
    const miss = EXPORTS.filter(function (k) { return e0.WA.activity[k] === undefined; });
    a(miss.length === 0, 'A8: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 开关
  (function () {
    const W = envWith(ov).WA;
    W.activity.setSettings({ enabled: false });
    a(planIt(W).reason === 'disabled', 'B1: 关着时筹备拒收 disabled（显式启用）');
    a(W.activity.open('act-1').reason === 'disabled', 'B1b: 关着时开放报名拒收 disabled');
    a(W.activity.buildBlock() === '', 'B1c: 关着时不产注入块');
    W.activity.setSettings({ enabled: true });
  })();
  // B2 名额：有报名条件的活动按名额收人；主持/观众**不计名额**
  (function () {
    const W = envWith(ov).WA;
    const p = planIt(W, { quota: 1 });
    W.activity.open(p.activity.id);
    a(W.activity.signup(p.activity.id, '甲', 'contestant').ok === true, 'B2: 名额内报名成功（1/1）');
    a(W.activity.signup(p.activity.id, '乙', 'contestant').reason === 'quota-full',
      'B2b: 名额满了还收参赛者 ⇒ quota-full（有报名条件的活动）');
    a(W.activity.signup(p.activity.id, '乙', 'host').ok === true,
      'B2c: 名额满的同时主持人仍报得上 —— **三权限分列**（主持/观众不计名额）');
    a(W.activity.signup(p.activity.id, '丙', 'audience').ok === true,
      'B2d: 观众同样不受名额限制');
  })();
  // B3 不自动开场：没有主持 ⇒ no-host
  (function () {
    const W = envWith(ov).WA;
    const p = planIt(W, { quota: 0 });
    W.activity.open(p.activity.id);
    W.activity.signup(p.activity.id, '甲', 'contestant');
    a(W.activity.start(p.activity.id).reason === 'no-host',
      'B3: 没有主持人 ⇒ no-host（**不自动开场**：没人主持就不开场）');
    W.activity.signup(p.activity.id, '乙', 'host');
    a(W.activity.start(p.activity.id).ok === true, 'B3b: 补上主持人后开场成功');
  })();
  // B4 不建第二份名册 + 不重复报名 + 非法角色
  (function () {
    const W = envWith(ov).WA;
    const p = planIt(W, { quota: 0 });
    W.activity.open(p.activity.id);
    a(W.activity.signup(p.activity.id, '查无此人', 'contestant').reason === 'unknown-party',
      'B4: 报名者不在人物册上 ⇒ unknown-party（不建第二份名册）');
    W.activity.signup(p.activity.id, '甲', 'contestant');
    a(W.activity.signup(p.activity.id, '甲', 'audience').reason === 'already-signed',
      'B4b: 同一人不重复报名（一个活动一个角色）');
    a(W.activity.signup(p.activity.id, '乙', '自封裁判').reason === 'bad-role',
      'B4c: 自造角色 ⇒ bad-role（三权限是封闭集）');
    a(W.activity.signup(p.activity.id, '乙', 'contestant', '').ok === true, 'B4d: 合法角色可报');
  })();
  // B5 缺席者不能获奖（**验收原文**）
  (function () {
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 2 }, [['丙', 'contestant']]);
    W.activity.round(r.id, { n: 1, present: ['甲', '丙'] });
    W.activity.round(r.id, { n: 2, present: ['甲'] });        // 丙最后一轮缺席
    const s = W.activity.settle(r.id, { prize: { amount: 5, from: '乙' } });
    a(s.ok === true, 'B5: 结算成功');
    a(s.winners.length === 1 && s.winners[0] === '甲',
      'B5b: 获奖名单 = **最后一轮在场**的参赛者（实 ' + JSON.stringify(s.winners) + '）');
    a(s.excluded.indexOf('丙') >= 0,
      'B5c: 报过名但最后一轮缺席的人**被排除且逐个列出**（excluded=' + JSON.stringify(s.excluded) + '）—— 不是静默少发一份奖');
    a(money(W, '甲') === 105 && money(W, '乙') === 95,
      'B5d: 奖品走**既有资源账**（获奖者 +5 / 来源 -5，实 甲 ' + money(W, '甲') + ' 乙 ' + money(W, '乙') + '）');
    a(s.moved === 5, 'B5e: moved 如实报实际流动总额');
    const rel = ((W.store.get().people['p_甲'].profile || {}).relations || []);
    const row = rel.filter(function (x) { return x && x.target === '乙'; })[0];
    a(row && row.intimacy > 0 && row.trust > 0,
      'B5f: 关系变化写**量值行**（intimacy/trust 累加，实 ' + JSON.stringify(row) + '）—— 可逆的量值，不是经历面');
  })();
  // B6 轮次必须递增（序数判据）+ 不许替未报名者出场
  (function () {
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 3 });
    a(W.activity.round(r.id, { n: 2, present: ['甲'] }).reason === 'bad-phase',
      'B6: 第一轮没落就报第 2 轮 ⇒ bad-phase（轮次必须递增 —— **序数判据**，不比墙钟毫秒）');
    a(W.activity.round(r.id, { n: 1, present: ['甲'] }).ok === true, 'B6a: 第 1 轮正常落');
    a(W.activity.round(r.id, { n: 1, present: ['甲'] }).reason === 'bad-phase',
      'B6b: 同一轮重报 ⇒ bad-phase（不覆盖已落下的轮次）');
    a(W.activity.round(r.id, { n: 2, present: ['丙'] }).reason === 'no-signup',
      'B6c: 在场名单里有人没报名为参赛者 ⇒ no-signup（不许替未报名者出场）');
    a(W.activity.round(r.id, { n: 2, present: ['甲'] }).ok === true, 'B6d: 第 2 轮正常落');
    a(W.activity.round(r.id, { n: 4, present: ['甲'] }).reason === 'bad-phase',
      'B6e: 超计划轮数 ⇒ bad-phase（rounds 在筹备时固定）');
  })();
  // B7 雨天延期能同步日程与参与者安排（**验收原文**）
  (function () {
    const W = envWith(ov).WA;
    const p = planIt(W, { place: '雨夜渡口', day: 10, quota: 0 });
    W.activity.open(p.activity.id);
    W.activity.signup(p.activity.id, '甲', 'contestant');
    W.activity.signup(p.activity.id, '乙', 'host');
    const pl = W.world.addPlace({ name: '雨夜渡口', kind: 'public' });
    a(pl.ok === true || pl.reason === 'already-exists', 'B7: 前置 —— 地点已登记进世界（weather 走 world.reach 验地方）');
    const w = W.weather.setWeather('雨夜渡口', 'rain');
    a(w.ok === true, 'B7a: 天气真源登记为 rain');
    const before = W.activity.signups(p.activity.id).length;
    const q = W.activity.postpone(p.activity.id, { day: 17 });
    a(q.ok === true && q.to === 17, 'B7b: 延期改到更晚的剧情日（10 → 17）');
    a(q.weatherCaused === true && q.weather === 'rain',
      'B7c: 回执如实报**雨天**是判据（weatherCaused=true）—— 不是「任何天气都能延期」');
    a(W.activity.signups(p.activity.id).length === before && q.signupsUntouched === true,
      'B7d: **报名行一行未动**（参与安排保持有效，实 ' + W.activity.signups(p.activity.id).length + ' 条）—— 日程与参与安排因此同步');
    a(W.activity.activityOf(p.activity.id).status === 'postponed',
      'B7e: 活动进入 postponed（旁支状态，记 resumeStatus）');
    const r = W.activity.resume(p.activity.id);
    a(r.ok === true && r.status === 'open', 'B7f: 恢复回到延期前的阶段（不跳段）');
  })();
  // B7b 天气读不到 ⇒ 如实说读不到（不拿晴天冒充）
  (function () {
    const W = envWith(ov).WA;
    const p = planIt(W, { place: '没登记的地方', day: 10 });
    W.activity.open(p.activity.id);
    const q = W.activity.postpone(p.activity.id, { day: 20 });
    a(q.ok === true && q.weatherKnown === false && q.weatherCaused === false,
      'B7g: 天气读不到 ⇒ weatherKnown=false、weatherCaused=false 且回执带 weatherErr（**不拿晴天冒充**，实 err=' + q.weatherErr + '）');
    a(String(q.note).indexOf('天气读不到') > 0,
      'B7h: 回执正文如实说明「本次延期**不是**天气判据」');
  })();
  // B8 延期要有新日子
  (function () {
    const W = envWith(ov).WA;
    const p = planIt(W, { day: 10 });
    W.activity.open(p.activity.id);
    a(W.activity.postpone(p.activity.id, { day: 10 }).reason === 'bad-day',
      'B8: 延期到**同一天** ⇒ bad-day（不许「延期到同一天」冒充改期）');
    a(W.activity.postpone(p.activity.id, { day: 3 }).reason === 'bad-day', 'B8b: 延到更早 ⇒ 同样 bad-day');
    a(W.activity.postpone(p.activity.id, {}).reason === 'bad-day', 'B8c: 不给新日子 ⇒ bad-day');
  })();
  // B9 结算一次奖品和关系变化（关系量值可逆、不写经历面）
  (function () {
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 1 });
    W.activity.round(r.id, { n: 1, present: ['甲'] });
    const s1 = W.activity.settle(r.id, { prize: { amount: 3, from: '乙' } });
    a(s1.ok === true && s1.winners[0] === '甲', 'B9: 结算成功');
    const rel = ((W.store.get().people['p_甲'].profile || {}).relations || []);
    const row = rel.filter(function (x) { return x && x.target === '乙'; })[0];
    a(row && row.intimacy === 1, 'B9b: 第一次结算 ⇒ 量值行 intimacy=1');
    a(s1.awards === undefined && W.activity.awards(r.id).length === 1,
      'B9c: 奖品发放行落到 awards 台账（实 ' + W.activity.awards(r.id).length + ' 条）');
    // 已结算 ⇒ 不再收指令（终态是终态）
    a(W.activity.signup(r.id, '丙', 'audience').reason === 'activity-closed',
      'B9d: 已结算的活动再报名 ⇒ activity-closed（终态是终态）');
    a(W.activity.settle(r.id, { prize: { amount: 3, from: '乙' } }).reason === 'activity-closed',
      'B9e: 二次结算 ⇒ activity-closed（不重复发奖）');
    a(money(W, '甲') === 103 && money(W, '乙') === 97, 'B9f: 余额只动了一次');
  })();
  // B10 不两头动账：来源就是获奖者本人 ⇒ selfAward，净流动 0
  (function () {
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 1 });
    W.activity.round(r.id, { n: 1, present: ['甲'] });
    const jia0 = money(W, '甲');
    const s = W.activity.settle(r.id, { prize: { amount: 5, from: '甲' } });   // 甲自掏腰包给自己发奖
    a(s.ok === true, 'B10: 自奖结算成功');
    a(s.selfAwarded === 1 && s.moved === 0,
      'B10b: 来源=获奖者本人 ⇒ selfAward、moved=0（净流动 0）');
    a(money(W, '甲') === jia0,
      'B10c: **不两头动账**（先按总额扣他再入他一份 = 净扣，那不是发奖；实 ' + money(W, '甲') + ' 应 ' + jia0 + '）');
    const aw = W.activity.awards(r.id)[0];
    a(aw && aw.from === '甲', 'B10d: 发放行如实记「谁出的」（from=甲）');
  })();
  // B11 不凭空发奖 / 先判后扣
  (function () {
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 1 });
    W.activity.round(r.id, { n: 1, present: ['甲'] });
    const jia0 = money(W, '甲'), yi0 = money(W, '乙');
    const s = W.activity.settle(r.id, { prize: { amount: 99999, from: '乙' } });
    a(s.reason === 'short-prize',
      'B11: 奖品要发的钱不够 ⇒ short-prize（**先判后扣**）');
    a(money(W, '甲') === jia0 && money(W, '乙') === yi0,
      'B11b: 一克不动（不出现「发了一半又失败」）');
    a(W.activity.activityOf(r.id).status === 'running',
      'B11c: 失败的结算不推进状态（仍是 running，可以再试）');
  })();
  // B12 注入双闸
  (function () {
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 1 }, [['丙', 'audience']]);
    W.activity.setSettings({ viewer: '' });
    a(W.activity.buildBlock() === '', 'B12: 无观察者 ⇒ 空串（绝不产出全知版活动名单）');
    W.activity.setSettings({ viewer: '丁' });
    a(W.activity.buildBlock() === '', 'B12b: 观察者没参与任何活动 ⇒ 仍是空串（纵深防御）');
    W.activity.setSettings({ viewer: '甲' });
    const b = W.activity.buildBlock();
    a(b.length > 0 && b.indexOf('秋日射柳') >= 0, 'B12c: 参与者拿到自己的活动行');
    a(b.indexOf('丙') < 0, 'B12d: 注入块只列**自己**（同场观众不出现 —— 防泄露）');
    a(b.indexOf('缺席者不获奖') >= 0, 'B12e: 注入块带边界说明（不是一句干数据）');
  })();
  // B13 取消不是结算
  (function () {
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 1 });
    const jia0 = money(W, '甲'), yi0 = money(W, '乙');
    const c = W.activity.cancel(r.id, '场地冲突');
    a(c.ok === true && c.awarded === 0 && c.refunded === false && c.relations === 0,
      'B13: 取消**不发奖、不动关系**（取消不是结算）');
    a(money(W, '甲') === jia0 && money(W, '乙') === yi0, 'B13b: 取消不动资源账');
    a(W.activity.cancel(r.id, '再取消一次').reason === 'activity-closed',
      'B13c: 已取消的再取消 ⇒ activity-closed');
    a(W.activity.awards(r.id).length === 0, 'B13d: 取消后奖品台账为空');
  })();
  // B14 程序先后（不跳段）
  (function () {
    const W = envWith(ov).WA;
    const p = planIt(W, {});
    a(W.activity.signup(p.activity.id, '甲', 'contestant').reason === 'bad-phase',
      'B14: 刚筹备就直接报名（跳过开放报名）⇒ bad-phase（不许跳段）');
    a(W.activity.round(p.activity.id, { n: 1, present: ['甲'] }).reason === 'bad-phase',
      'B14b: 没开场就落轮次 ⇒ bad-phase');
    a(W.activity.settle(p.activity.id, {}).reason === 'bad-phase', 'B14c: 没开场就结算 ⇒ bad-phase');
    W.activity.open(p.activity.id);
    a(W.activity.open(p.activity.id).reason === 'bad-phase', 'B14d: 重复开放 ⇒ bad-phase');
    a(W.activity.postpone(p.activity.id, { day: 30 }).ok === true, 'B14e: 开放期可延期');
    a(W.activity.postpone(p.activity.id, { day: 40 }).reason === 'bad-phase',
      'B14f: 已在延期态再延期 ⇒ bad-phase（先恢复再改期）');
  })();
  // B15 退赛（只在开放期；开场后名单冻结）
  (function () {
    const W = envWith(ov).WA;
    const p = planIt(W, { quota: 0 });
    W.activity.open(p.activity.id);
    W.activity.signup(p.activity.id, '甲', 'contestant');
    W.activity.signup(p.activity.id, '乙', 'host');
    a(W.activity.withdraw(p.activity.id, '丙').reason === 'no-signup',
      'B15: 没报名的人退赛 ⇒ no-signup');
    a(W.activity.withdraw(p.activity.id, '甲').ok === true, 'B15b: 开放期可退赛');
    W.activity.signup(p.activity.id, '甲', 'contestant');
    W.activity.start(p.activity.id);
    a(W.activity.withdraw(p.activity.id, '甲').reason === 'bad-phase',
      'B15c: 开场后名单冻结（退赛 ⇒ bad-phase）—— 参赛者不能中途消失');
  })();

  /* ============ C 契约与边界 ============ */
  (function () {
    const W = envWith(ov).WA;
    a(W.activity.STATUS.length === 6 && W.activity.STATUS.indexOf('postponed') >= 0,
      'C1: 状态封闭集六值（planned/open/running/settled + postponed/cancelled 旁支）');
    a(W.activity.ROLES.length === 3 && W.activity.ROLES.indexOf('contestant') >= 0
      && W.activity.ROLES.indexOf('host') >= 0 && W.activity.ROLES.indexOf('audience') >= 0,
      'C2: 三权限封闭集（参赛/主持/观众）');
    const r = toRunning(W, { quota: 3, rounds: 2 }, [['丙', 'contestant']]);
    W.activity.round(r.id, { n: 1, present: ['甲', '丙'] });
    const l = W.activity.list();
    a(l.ok === true && l.rows.length === 1, 'C3: list 给出活动总览');
    const row = l.rows[0];
    a(row.contenders === 2 && row.hosts === 1 && row.roundsDone === 1,
      'C3b: 总览逐项分列（参赛 ' + row.contenders + ' / 主持 ' + row.hosts + ' / 已落轮次 ' + row.roundsDone + '）');
    const v = W.activity.view(r.id);
    a(v.ok === true && v.signups.length === 3 && v.rounds.length === 1 && v.money === '银元',
      'C4: view 给单场明细（报名 / 轮次 / 币名 ' + v.money + '）');
    a(W.activity.activityOf('act_没有这场') === null, 'C5: 查不到的活动返回 null（不编一场出来）');
    a(W.activity.view('act_没有这场').reason === 'no-such-activity', 'C5b: view 拒收 no-such-activity');
    // 未知剧情日保持未知（不用「现在」冒充）
    const p2 = W.activity.plan({ title: '无期之宴', place: '校场' });
    a(p2.ok === true && p2.dayUnknown === true && W.activity.activityOf(p2.activity.id).day === null,
      'C6: 未知剧情日保持未知（day=null + dayUnknown=true，不用「现在」冒充）');
  })();

  /* ============ 收尾：还原（自己 seed 的自己收） ============ */
  (function () {
    const W = envWith(ov).WA;
    W.activity.reset();
    const st = W.store.get();
    a((st.activity.activities || []).length === 0 && (st.activity.signups || []).length === 0,
      'C7: reset 清空四本账（不留下别人的半场活动）');
  })();
}

/**
 * N 段：**真源码破坏 + 两向自证**。
 *   纪律（v2.4.0 的 R1–R9 沉淀）：
 *     ① 真源码破坏（锚点恰中 1 次）→ ② 加载破坏副本 → ③ 在副本上重跑同款真判据；
 *     并配**正控制**：原版上同一判据必须为真（否则「破坏后变红」可能只是判据本来就假）。
 */
async function runNegative(a) {
  function breakSrc(key, to) {
    const an = ANCHOR[key];
    const src = rd(an.rel);
    if (cnt(src, an.txt) !== 1) throw new Error('锚点不唯一：' + key);
    const ov = {};
    ov[an.rel] = src.replace(an.txt, to);
    // 破坏文本必须**语法可装载**：否则 vm 装载先炸，负控测到的就不是判据而是语法错
    // （v2.231.0 返工实录：N2/N3 曾把整行 if 块换成 `if (false) {`，缺右括号 ⇒ SyntaxError，
    //   负控在 tests/ui-gate-sync.js:72 的 vm 装载处炸掉，被测判据一次都没跑到）。
    // 工具两向自证：语法错的破坏必须抛。
    try { new (require('vm').Script)(ov[an.rel], { filename: an.rel }); }
    catch (e) { throw new Error('破坏文本语法错（' + key + '）：' + e.message); }
    return ov;
  }
  // N1 名额闸：破坏 ⇒ 名额不再拦人
  (function () {
    const ov = breakSrc('quotaGate', "      if (false) {");
    const W = envWith(ov).WA;
    const p = planIt(W, { quota: 1 });
    W.activity.open(p.activity.id);
    W.activity.signup(p.activity.id, '甲', 'contestant');
    a(W.activity.signup(p.activity.id, '乙', 'contestant').ok === true,
      'N1: 拆掉名额闸 ⇒ 名额满了照收（B2b 的判据非恒真）');
    const W0 = envWith().WA;
    const p0 = planIt(W0, { quota: 1 });
    W0.activity.open(p0.activity.id);
    W0.activity.signup(p0.activity.id, '甲', 'contestant');
    a(W0.activity.signup(p0.activity.id, '乙', 'contestant').reason === 'quota-full',
      'N1p: 正控制 —— 原版上同一判据为真（名额满 ⇒ quota-full）');
  })();
  // N2 主持闸：破坏 ⇒ 没人主持也能开场
  (function () {
    const ov = breakSrc('hostGate', "      if (false) { }");
    const W = envWith(ov).WA;
    const p = planIt(W, { quota: 0 });
    W.activity.open(p.activity.id);
    W.activity.signup(p.activity.id, '甲', 'contestant');
    a(W.activity.start(p.activity.id).ok === true,
      'N2: 拆掉主持闸 ⇒ 没有主持人也能开场（B3 的判据非恒真）');
    const W0 = envWith().WA;
    const p0 = planIt(W0, { quota: 0 });
    W0.activity.open(p0.activity.id);
    W0.activity.signup(p0.activity.id, '甲', 'contestant');
    a(W0.activity.start(p0.activity.id).reason === 'no-host',
      'N2p: 正控制 —— 原版上「没主持人不开场」为真');
  })();
  // N3 名册闸：破坏 ⇒ 查无此人也能报名
  (function () {
    const an = ANCHOR.absentGate;   // 借用：absentGate 破坏另测（N4）
    const src = rd(AC);
    const txt = "      if (!personExists(person, draft)) { out = refuse('unknown-party', { who: person }); return false; }";
    if (cnt(src, txt) !== 1) { a(false, 'N3: 锚点不唯一（personExists 闸）'); return; }
    const ov = {}; ov[AC] = src.replace(txt, '      if (false) { }');
    const W = envWith(ov).WA;
    const p = planIt(W, { quota: 0 });
    W.activity.open(p.activity.id);
    a(W.activity.signup(p.activity.id, '查无此人', 'contestant').ok === true,
      'N3: 拆掉名册闸 ⇒ 不在册的人也能报名（B4 的判据非恒真）');
    const W0 = envWith().WA;
    const p0 = planIt(W0, { quota: 0 });
    W0.activity.open(p0.activity.id);
    a(W0.activity.signup(p0.activity.id, '查无此人', 'contestant').reason === 'unknown-party',
      'N3p: 正控制 —— 原版上 unknown-party 为真');
    void an;
  })();
  // N4 缺席闸（**核心**）：破坏 ⇒ 缺席者也能获奖
  (function () {
    const ov = breakSrc('absentGate',
      "      const winners = contenders.map(function (s) { return key(s.who); });");
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 2 }, [['丙', 'contestant']]);
    W.activity.round(r.id, { n: 1, present: ['甲', '丙'] });
    W.activity.round(r.id, { n: 2, present: ['甲'] });
    const s = W.activity.settle(r.id, { prize: { amount: 5, from: '乙' } });
    // 判据只咬「缺席者进了获奖名单」：`excluded` 是**缺席名单**，它独立于获奖名单，
    // 拆掉闸也不会清空（拆掉的是「谁算获奖」这一步），拿它当判据就测错了对象。
    a(s.ok === true && s.winners.indexOf('丙') >= 0,
      'N4: 拆掉缺席闸 ⇒ 最后一轮缺席的人也拿奖（**验收原文核心**的判据非恒真，winners='
      + JSON.stringify(s.winners) + '）');
    const W0 = envWith().WA;
    const r0 = toRunning(W0, { quota: 0, rounds: 2 }, [['丙', 'contestant']]);
    W0.activity.round(r0.id, { n: 1, present: ['甲', '丙'] });
    W0.activity.round(r0.id, { n: 2, present: ['甲'] });
    const s0 = W0.activity.settle(r0.id, { prize: { amount: 5, from: '乙' } });
    a(s0.winners.indexOf('丙') < 0 && s0.excluded.indexOf('丙') >= 0,
      'N4p: 正控制 —— 原版上「缺席者不获奖」为真');
  })();
  // N5 延期不改名单：破坏 ⇒ 延期把报名行清掉（参与安排丢失）
  (function () {
    const ov = breakSrc('postponeOnly',
      "      a.resumeStatus = a.status;\n      bag.signups = bag.signups.filter(function (s) { return !s || key(s.activity) !== key(a.id); });\n      a.status = 'postponed';");
    const W = envWith(ov).WA;
    const p = planIt(W, { day: 10, quota: 0 });
    W.activity.open(p.activity.id);
    W.activity.signup(p.activity.id, '甲', 'contestant');
    W.activity.signup(p.activity.id, '乙', 'host');
    const q = W.activity.postpone(p.activity.id, { day: 17 });
    a(q.ok === true && W.activity.signups(p.activity.id).length === 0,
      'N5: 让延期顺手清名单 ⇒ 参与安排丢失（**验收原文**「同步参与者安排」的判据非恒真）');
    const W0 = envWith().WA;
    const p0 = planIt(W0, { day: 10, quota: 0 });
    W0.activity.open(p0.activity.id);
    W0.activity.signup(p0.activity.id, '甲', 'contestant');
    W0.activity.signup(p0.activity.id, '乙', 'host');
    W0.activity.postpone(p0.activity.id, { day: 17 });
    a(W0.activity.signups(p0.activity.id).length === 2,
      'N5p: 正控制 —— 原版上延期后报名行仍是 2 条');
  })();
  // N6 雨天判据：破坏 ⇒ 雨天恒假
  (function () {
    const ov = breakSrc('weatherGate', "      const bad = false;");
    const W = envWith(ov).WA;
    const p = planIt(W, { place: '雨夜渡口', day: 10 });
    W.activity.open(p.activity.id);
    W.world.addPlace({ name: '雨夜渡口', kind: 'public' });
    W.weather.setWeather('雨夜渡口', 'rain');
    const q = W.activity.postpone(p.activity.id, { day: 17 });
    a(q.ok === true && q.weatherCaused === false,
      'N6: 让雨天判据恒假 ⇒ 下雨也不认（B7c 的判据非恒真）');
    const W0 = envWith().WA;
    const p0 = planIt(W0, { place: '雨夜渡口', day: 10 });
    W0.activity.open(p0.activity.id);
    W0.world.addPlace({ name: '雨夜渡口', kind: 'public' });
    W0.weather.setWeather('雨夜渡口', 'rain');
    a(W0.activity.postpone(p0.activity.id, { day: 17 }).weatherCaused === true,
      'N6p: 正控制 —— 原版上雨天被认（weatherCaused=true）');
  })();
  // N7 注入双闸：破坏 ⇒ 全知版名单
  (function () {
    const ov = breakSrc('viewerGate', "    if (false) return '';");
    const ov2 = breakSrc('memberGate', "    if (false) return '';");
    // 纵深防御：**单拆一道不该漏**（另一道仍兜住），两道都拆才漏 —— 这才是 B12 判据非恒真的证明。
    // （v2.231.0 返工实录：原断言只拆第一道就要 `!== ''`，测到的其实是「第二道闸还在工作」，
    //   把防御的功劳记成了缺陷。）
    const W1 = envWith(ov).WA;
    toRunning(W1, { quota: 0, rounds: 1 });
    W1.activity.setSettings({ viewer: '' });
    a(W1.activity.buildBlock() === '',
      'N7a: 只拆第一道闸 ⇒ 第二道闸仍兜住（纵深防御生效，不是缺陷）');
    // 两个破坏落在**同一文件**上，不能 Object.assign 叠加（键相同 ⇒ 后者覆盖前者，
    // 实际只拆一道）。要在同一份源码上连做两次替换。
    const both = {};
    both[AC] = rd(AC).replace(ANCHOR.viewerGate.txt, "    if (false) return '';")
      .replace(ANCHOR.memberGate.txt, "    if (false) return '';");
    const W = envWith(both).WA;
    toRunning(W, { quota: 0, rounds: 1 });
    W.activity.setSettings({ viewer: '' });
    a(W.activity.buildBlock() !== '',
      'N7: 两道闸全拆 ⇒ 无观察者也产全知版活动名单（B12 的判据非恒真）');
    const W2 = envWith(ov2).WA;
    toRunning(W2, { quota: 0, rounds: 1 });
    W2.activity.setSettings({ viewer: '丁' });
    a(W2.activity.buildBlock() !== '',
      'N7b: 拆掉成员闸 ⇒ 没参与的人也拿到别人的活动读数');
    const W0 = envWith().WA;
    toRunning(W0, { quota: 0, rounds: 1 });
    W0.activity.setSettings({ viewer: '' });
    a(W0.activity.buildBlock() === '', 'N7p: 正控制 —— 原版上无观察者零注入');
    W0.activity.setSettings({ viewer: '丁' });
    a(W0.activity.buildBlock() === '', 'N7q: 正控制 —— 原版上未参与者零注入');
  })();
  // N8 自奖不两头动账：破坏 ⇒ 自奖者凭空入账
  (function () {
    const ov = breakSrc('selfGate', "        if (false) { selfAwarded++; return; }");
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 1 });
    W.activity.round(r.id, { n: 1, present: ['甲'] });
    const jia0 = money(W, '甲');
    const s = W.activity.settle(r.id, { prize: { amount: 5, from: '甲' } });
    a(s.ok === true && money(W, '甲') !== jia0,
      'N8: 拆掉自奖分支 ⇒ 自奖者凭空多拿一份（B10c 的判据非恒真，实 ' + money(W, '甲') + ' 应 ' + jia0 + '）');
    const W0 = envWith().WA;
    const r0 = toRunning(W0, { quota: 0, rounds: 1 });
    W0.activity.round(r0.id, { n: 1, present: ['甲'] });
    const j0 = money(W0, '甲');
    W0.activity.settle(r0.id, { prize: { amount: 5, from: '甲' } });
    a(money(W0, '甲') === j0, 'N8p: 正控制 —— 原版上自奖净流动 0');
  })();
  // N9 轮次序数：破坏 ⇒ 可乱序重报
  (function () {
    const ov = breakSrc('roundSeq', "      if (false) {");
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 3 });
    a(W.activity.round(r.id, { n: 2, present: ['甲'] }).ok === true,
      'N9: 拆掉序数闸 ⇒ 第一轮没落就报第 2 轮（B6 的判据非恒真）');
    const W0 = envWith().WA;
    const r0 = toRunning(W0, { quota: 0, rounds: 3 });
    a(W0.activity.round(r0.id, { n: 2, present: ['甲'] }).reason === 'bad-phase',
      'N9p: 正控制 —— 原版上跳轮 ⇒ bad-phase');
  })();
  // N10 先判后扣：破坏 ⇒ 不够也照扣（余额变负）
  (function () {
    const ov = breakSrc('purseGate', "        if (false) {");
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 1 });
    W.activity.round(r.id, { n: 1, present: ['甲'] });
    const s = W.activity.settle(r.id, { prize: { amount: 99999, from: '乙' } });
    a(s.ok === true && money(W, '乙') < 0,
      'N10: 拆掉先判后扣 ⇒ 不够也照扣（余额变负 ' + money(W, '乙') + '）—— B11 的判据非恒真');
    const W0 = envWith().WA;
    const r0 = toRunning(W0, { quota: 0, rounds: 1 });
    W0.activity.round(r0.id, { n: 1, present: ['甲'] });
    const y0 = money(W0, '乙');
    a(W0.activity.settle(r0.id, { prize: { amount: 99999, from: '乙' } }).reason === 'short-prize'
      && money(W0, '乙') === y0,
      'N10p: 正控制 —— 原版上 short-prize 且一克不动');
  })();
  // N11 终态闸：破坏 ⇒ 取消后可再来一次（终态不再是终态）
  (function () {
    const ov = breakSrc('closedGate',
      "      if (false) { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }\n      a.status = 'cancelled';");
    const W = envWith(ov).WA;
    const r = toRunning(W, { quota: 0, rounds: 1 });
    W.activity.cancel(r.id, '第一次');
    a(W.activity.cancel(r.id, '第二次').ok === true,
      'N11: 拆掉终态闸 ⇒ 已取消的活动还能再取消（B13c 的判据非恒真）');
    const W0 = envWith().WA;
    const r0 = toRunning(W0, { quota: 0, rounds: 1 });
    W0.activity.cancel(r0.id, '第一次');
    a(W0.activity.cancel(r0.id, '第二次').reason === 'activity-closed',
      'N11p: 正控制 —— 原版上二次取消被挡');
  })();
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };

/* ============ 单独运行 ============ */
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    try { await runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控失效：' + (e && e.stack)); }
    console.log('\nEXP7-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}