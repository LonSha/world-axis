#!/usr/bin/env node
// WorldAxis tests/exp4-survey-v2231.js (v2.231.0) -- EXP-4 专锁：探索与地理发现
//
// 【它治什么（缺口，开工前逐条复核现场）】
//   计划原文：「**地点和路径的未知/听说/确认状态**，勘察行动、时间/补给消耗、路径发现、
//   采集点与探索事件。**发现视角归属于实际探索者**，传回消息后其他人才获得地图知识。」
//   验收原文：「**NPC 探路发现捷径，玩家尚不知道**；**报告到达后玩家地图新增路线，
//   之后 travelDesk 才可选**；**未发现区域不从地图标签或注入提前泄露**。」
//
//   现场事实（不是静态推测）：
//     · `world.places` / `world.roads` 是**客观真源**（「世界有什么」），但全仓
//       **没有任何一处记「谁知道了什么」** —— `atlas` 答「画出来长什么样」、
//       `worldGraph` 答「一跳能到哪」、`travelDesk` 答「这一趟怎么走」、
//       `horizon` 答「路上出了什么事」，四者都默认「地图上的东西玩家已经全看见了」；
//     · 于是 `world.buildBlock()` 把**全部**地点与最多 6 条道路直接注入正文 ——
//       一个 NPC 刚探出来的捷径，下一轮就出现在玩家眼前。**知道**与**存在**被当成了一件事。
//
// 【本锁咬住的九条否定式边界】
//   · **不建第二份地图**：本模块全文不写 `world.places` / `world.roads`（B2/N1）。
//   · **发现归属实际探索者**：`survey()` 只把认知记在发起者身上，别人一格不动（B3，验收原文）。
//   · **未登记即不可达**：目标必须已在 `world.places`（`unknown-place`）；两地间无登记道路
//     则 `no-road` —— 沿用「未登记的道路走不通」，本模块**不造路**（B4/N3）。
//   · **转述不升格**：`report()` 给乙的**最高是 `heard`**；要 `confirmed` 得自己去一趟（B5/N4）。
//   · **认知只升不降**：`raiseView` 只允许 unknown→heard→confirmed（B6/N2）。
//   · **遮罩面只报数不报名**：`fog()` 对未发现的地点只给条数、不给名字（B7/N5，验收原文）。
//   · **注入必须有观察者**：`viewer` 为空 ⇒ `buildBlock()` 返回空串（B8/N6b，验收原文）。
//   · **注入按观察者过滤**：别人的认知不得出现在你的块里（B8c/N6）。
//   · **在途不得写成已抵达**：`advance` 走满才 arrived 并落 confirmed（B9/N7）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约与边界 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/exp4-survey-v2231.js';
const SV = 'engines/survey.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
// ── 破坏锚点（各恰 1 次，A6 逐键核）──
const ANCHOR = {
  // ① 认知写入只允许升级（unknown → heard → confirmed），不许静默降级
  raise: { rel: SV, txt: "    if ((RANK[k] || 0) <= (RANK[cur] || 0)) return false;" },
  // ② 本模块全文不写世界地图（roads 只读口）
  noWorldWrite: { rel: SV, txt: "  function roadsOf(root) {\n    const w = (root || state()).world;\n    return (w && Array.isArray(w.roads)) ? w.roads : [];\n  }" },
  // ③ 勘察目标必须已登记在 world.places
  placeGate: { rel: SV, txt: "    if (!placeExists(target)) return refuse('unknown-place', { place: target });" },
  // ④ 转述最高只到 heard（听说与亲历不是一件事）
  reportCap: { rel: SV, txt: "        const changed = raiseView(row, 'heard');   // 只升到 heard，绝不到 confirmed" },
  // ⑤ 遮罩面只报数不报名（返回值那一行的 note 就是遮罩的物证）
  fogMask: { rel: SV, txt: "      note: hiddenPlaces.length ? '还有 ' + hiddenPlaces.length + ' 个地点没被发现（未发现的地名不在此列出）' : null };" },
  // ⑥ 注入块按观察者过滤（别人的认知不得出现在你的块里）
  viewerFilter: { rel: SV, txt: "      return v && clean(v.who, 60) === viewer && (RANK[clean(v.know, 12)] || 0) > 0;" },
  // ⑦ 无观察者 ⇒ 零 token（第一道闸）
  viewerGate: { rel: SV, txt: "    if (!viewer) return '';   // 无观察者 ⇒ 零 token（绝不产出全知版地图）" },
  // ⑧ 无认知也无勘察记录 ⇒ 零 token（第二道闸，纵深防御）
  emptyGate: { rel: SV, txt: "    if (!confirmed.length && !heard.length && !mine.length) return '';" },
  // ⑨ 走满工期才 arrived（并把勘察者本人的认知升到 confirmed）
  arriveConfirm: { rel: SV, txt: "          if (num(row.done) >= num(row.days)) {\n            row.status = 'arrived';" },
  // ⑩ 有认知（heard 及以上）才算「知道这一处」
  rankGate: { rel: SV, txt: "    const known = viewsOf().filter(function (v) {\n      return v && clean(v.who, 60) === w && (RANK[clean(v.know, 12)] || 0) > 0;\n    }).map(function (v) { return clean(v.place, 40); });" }
};
const EXPORTS = ['KNOWS', 'getSettings', 'setSettings', 'declareSpot', 'spotOf', 'survey', 'advance',
  'resupply', 'pause', 'resume', 'halt', 'report', 'confirm', 'knowsOf', 'routesOf', 'fog',
  'list', 'reload', 'view', 'buildBlock', 'stat', 'resetStat', 'reset'];

/** 夹具：三个人 + 两个已登记地点 + 一条路 + 空的勘察面（自己 seed、自己收）。 */
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: { supply: 6 }, updatedAt: 1 };
    d.people['p_乙'] = { id: 'p_乙', name: '乙', resources: { supply: 0 }, updatedAt: 1 };
    d.people['p_丙'] = { id: 'p_丙', name: '丙', resources: { supply: 0 }, updatedAt: 1 };
    d.world = d.world || {};
    // ⚠ survey.placesOf() 读的是 **store.world.places**（客观地图真源），不是 region.places。
    d.world.places = [{ name: '渡口', kind: 'port' }, { name: '断崖', kind: 'wild' }];
    d.world.roads = [{ a: '渡口', b: '断崖', cap: 1 }];
    d.survey = { spots: [], views: [], scouts: [] };
    return true;
  }, 'exp4:seed');
}
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  seed(env.WA);
  env.WA.survey.setSettings({ enabled: true, maxSpots: 48, maxViews: 192, maxDays: 30, viewer: '' });
  return env;
}
/** 声明一个勘察点（默认指向断崖）。 */
function withSpot(W, name, place, days) {
  return W.survey.declareSpot(name || '崖边点', { place: place || '断崖', days: days || 2 });
}
/** 真跑一趟勘察到抵达（返回 survey() 的回执）。 */
function scoutToArrive(W, opts) {
  const o = opts || {};
  withSpot(W, o.spot || '崖边点', o.place || '断崖', o.days || 2);
  const s = W.survey.survey({ who: o.who || '甲', spot: o.spot || '崖边点',
    from: o.from || '渡口', days: o.days || 2, supply: o.supply === undefined ? 2 : o.supply });
  if (!s.ok) return s;
  W.survey.advance({ id: s.id, days: o.days || 2 });
  return s;
}

async function runAll(a, ov) {
  ov = ov || {};
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, SV)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/survey.js'") > 0, 'A2: tests/run.js LOAD 已挂');
  a(rd('index.js', ov).indexOf("'engines/survey.js'") > 0, 'A2b: index.js LOAD_ORDER 已挂');
  a(rd('engines/tool-diag.js', ov).indexOf("'engines/survey.js': 'survey'") > 0, 'A3: tool-diag 声明表已登记');
  a(rd('engines/tool-diag.js', ov).indexOf('survey: secSurvey()') > 0
    && rd('engines/tool-diag.js', ov).indexOf('function secSurvey()') > 0,
    'A3b: 诊断面单列一节（与 world 分列：那一节答「世界有什么」，本节答「谁知道」）');
  (function () {
    a(rd('core/store.js', ov).indexOf('survey: { spots: [], views: [], scouts: [] }') > 0,
      'A4: 骨架已物化（登记不等于物化）');
    a(rd('core/evict.js', ov).indexOf("'survey.views'") > 0
      && rd('core/evict.js', ov).indexOf("'survey.scouts'") > 0,
      'A4b: 挤出站点已登记（views / scouts 两处）');
  })();
  (function () {
    const I = rd('render/inject.js', ov);
    a(I.indexOf("'survey'") > 0 && I.indexOf('survey: true') > 0,
      'A5: 注入源已进 SOURCES 与默认可见表（只加源表不加分支 = 声明了没人消费）');
    a(I.indexOf('WA.survey.buildBlock()') > 0,
      'A5b: 注入分支真消费 buildBlock（只加分支不加源表 = 开关点了零效果）');
    a(I.indexOf("survey: 'worldaxis_survey_settings_v1'") > 0,
      'A5c: 模块开关表已登记（不登记 ⇒ moduleEnabled 返回 null，勾了总开关却说「模块没加载」）');
    a(rd('ui/panel.js', ov).indexOf("survey: '探索与地理发现'") > 0,
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
    const miss = EXPORTS.filter(function (k) { return e0.WA.survey[k] === undefined; });
    a(miss.length === 0, 'A8: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 开关
  (function () {
    const W = envWith(ov).WA;
    W.survey.setSettings({ enabled: false });
    a(W.survey.survey({ who: '甲', spot: 'x', from: '渡口' }).reason === 'disabled',
      'B1: 关着时勘察拒收 disabled（显式启用）');
    a(W.survey.advance({ days: 1 }).reason === 'disabled', 'B1b: 关着时推进拒收 disabled');
    a(W.survey.buildBlock() === '', 'B1c: 关着时不产注入块');
    W.survey.setSettings({ enabled: true });
  })();
  // B2 不建第二份地图：跑一趟之后 world 一字未改
  (function () {
    const W = envWith(ov).WA;
    const before = JSON.stringify(W.store.get().world);
    scoutToArrive(W);
    a(JSON.stringify(W.store.get().world) === before,
      'B2: 跑完一趟勘察，world.places / world.roads **一字未改**（发现是认知，不是地形改写）');
  })();
  // B3 发现归属实际探索者（验收原文）
  (function () {
    const W = envWith(ov).WA;
    scoutToArrive(W, { who: '甲' });
    a(W.survey.knowsOf('甲', '断崖').know === 'confirmed',
      'B3: 勘察者本人对目标地点拿到 confirmed（实 ' + W.survey.knowsOf('甲', '断崖').know + '）');
    a(W.survey.knowsOf('乙', '断崖').know === 'unknown',
      'B3b: **别人一格不动** —— 乙仍是 unknown（「NPC 探路发现捷径，玩家尚不知道」）');
    const rows = (W.store.get().survey.views || []).filter(function (v) { return v.place === '断崖'; });
    a(rows.length === 1 && rows[0].who === '甲', 'B3c: 存档里那一行只属于甲（实 ' + rows.length + ' 行）');
  })();
  // B4 未登记即不可达
  (function () {
    const W = envWith(ov).WA;
    withSpot(W, '崖边点', '断崖', 1);
    const good = W.survey.survey({ who: '甲', spot: '崖边点', from: '渡口' });
    a(good.ok === true, 'B4: 有登记道路时勘察开得出来（前置对照）');
    const r = W.survey.survey({ who: '甲', spot: '崖边点', from: '从没登记过的地方' });
    a(r.reason === 'unknown-place', 'B4b: 出发地没登记 ⇒ unknown-place（实 ' + r.reason + '）');
    const r2 = W.survey.survey({ who: '甲', spot: '从没声明过的点', from: '渡口' });
    a(r2.reason === 'no-such-spot', 'B4c: 没声明过的勘察点 ⇒ no-such-spot（实 ' + r2.reason + '）');
    W.store.transact(function (d) { d.world.roads = []; return true; }, 'exp4:noroad');
    const r3 = W.survey.survey({ who: '甲', spot: '崖边点', from: '渡口' });
    a(r3.reason === 'no-road', 'B4d: 两地之间没有登记道路 ⇒ no-road（实 ' + r3.reason + '）—— 本模块不造路');
    a((W.store.get().world.roads || []).length === 0, 'B4e: 拒收之后世界仍然没有那条路（不静默补一条）');
  })();
  // B5 转述不升格
  (function () {
    const W = envWith(ov).WA;
    scoutToArrive(W, { who: '甲' });
    const r = W.survey.report({ from: '甲', to: '乙', place: '断崖' });
    a(r.ok === true && r.know === 'heard',
      'B5: 甲亲历过 ⇒ 转述给乙，乙拿到的是 heard（实 ' + (r && r.know) + '）');
    a(W.survey.knowsOf('乙', '断崖').know === 'heard',
      'B5b: 乙的认知是 heard，不是 confirmed（听说与亲历不是一件事）');
    a(W.survey.confirm('丙', '断崖').reason === 'not-discovered',
      'B5c: 丙既没听说过、也没在场证据 ⇒ not-discovered（不能凭空确认）');
    const r3 = W.survey.confirm('乙', '断崖', { at: true });
    a(r3.ok === true && W.survey.knowsOf('乙', '断崖').know === 'confirmed',
      'B5d: 给了在场证据 ⇒ 才能升到 confirmed（亲历要有亲历的样子）');
  })();
  // B6 认知只升不降
  (function () {
    const W = envWith(ov).WA;
    scoutToArrive(W, { who: '甲' });
    W.survey.confirm('乙', '断崖', { at: true });      // 乙亲历
    W.survey.report({ from: '甲', to: '乙', place: '断崖' });   // 又听甲说了一遍
    a(W.survey.knowsOf('乙', '断崖').know === 'confirmed',
      'B6: **亲历者不会因为「又听人说了一遍」被降级**（实 ' + W.survey.knowsOf('乙', '断崖').know + '）');
    W.survey.report({ from: '甲', to: '丙', place: '断崖' });
    const keep = W.survey.knowsOf('丙', '断崖').know;
    W.survey.report({ from: '甲', to: '丙', place: '断崖' });
    a(keep === 'heard' && W.survey.knowsOf('丙', '断崖').know === 'heard',
      'B6b: 反复转述也不会把丙的 heard 写成别的（实 ' + keep + ' → ' + W.survey.knowsOf('丙', '断崖').know + '）');
  })();
  // B7 遮罩面只报数不报名（验收原文）
  (function () {
    const W = envWith(ov).WA;
    const f = W.survey.fog('乙');
    a(f.ok === true && f.hiddenPlaces === 2 && f.totalPlaces === 2,
      'B7: 乙一处都不知道 ⇒ hiddenPlaces = 总数（实 ' + f.hiddenPlaces + '/' + f.totalPlaces + '）');
    const s = JSON.stringify(f);
    a(s.indexOf('渡口') < 0 && s.indexOf('断崖') < 0,
      'B7b: **未发现的地名一个字都不在返回值里**（带了名字就等于没遮）');
    a(f.note && f.note.indexOf('渡口') < 0 && f.note.indexOf('断崖') < 0,
      'B7c: 连提示语也不带名字（只报「还有 N 个地点没被发现」）');
  })();
  // B8 注入必须有观察者 + 按观察者过滤（验收原文）
  (function () {
    const W = envWith(ov).WA;
    scoutToArrive(W, { who: '甲' });
    W.survey.setSettings({ viewer: '' });
    a(W.survey.buildBlock() === '', 'B8: 没设观察者 ⇒ 注入块为空串（宁可零 token，也不产全知版地图）');
    W.survey.setSettings({ viewer: '乙' });
    a(W.survey.buildBlock() === '',
      'B8b: 观察者自己一处都不知道、也没有勘察单 ⇒ 仍是空串（不靠「别人知道」把块撑起来）');
    W.survey.setSettings({ viewer: '甲' });
    const blk = W.survey.buildBlock();
    a(blk.indexOf('[探索与地理发现]') >= 0, 'B8c: 甲有勘察记录 ⇒ 产出注入块');
    a(blk.indexOf('断崖') >= 0 && blk.indexOf('亲自到过') >= 0,
      'B8d: 甲的块里断崖在「亲自到过」那一档（同一个人两种身份分得开）');
    a(blk.indexOf('渡口') < 0,
      'B8e: **甲不知道渡口 ⇒ 块里没有「渡口」**（未发现区域不从注入提前泄露）');
    a(blk.indexOf('还有 1 处地点你尚不知晓') >= 0,
      'B8f: 未发现的只报条数（实块含「' + (blk.match(/还有 \d+ 处地点你尚不知晓/) || ['无'])[0] + '」）');
    // 听说与亲历在注入里必须分得开
    W.survey.report({ from: '甲', to: '丙', place: '断崖' });
    W.survey.setSettings({ viewer: '丙' });
    const blk2 = W.survey.buildBlock();
    a(blk2.indexOf('只是听说过') >= 0 && blk2.indexOf('不得写成你去过') >= 0,
      'B8g: 丙只有 heard ⇒ 块里单列「只是听说过」并点名「不得写成你去过」');
  })();
  // B9 在途不得写成已抵达
  (function () {
    const W = envWith(ov).WA;
    withSpot(W, '崖边点', '断崖', 3);
    const s = W.survey.survey({ who: '甲', spot: '崖边点', from: '渡口', days: 3, supply: 3 });
    a(s.ok === true && s.status === 'scouting', 'B9: 开出来的单是 scouting（在途）');
    W.survey.advance({ id: s.id, days: 1 });
    a(W.survey.knowsOf('甲', '断崖').know === 'unknown',
      'B9b: 只走了一天 ⇒ 认知仍是 unknown（未走完的路程不得写成已抵达）');
    W.survey.setSettings({ viewer: '甲' });
    a(W.survey.buildBlock().indexOf('未走完的路程不得写成已抵达') >= 0,
      'B9c: 注入里点名「未走完的路程不得写成已抵达」');
    W.survey.advance({ id: s.id, days: 2 });
    a(W.survey.knowsOf('甲', '断崖').know === 'confirmed',
      'B9d: 走满三天 ⇒ arrived 且认知升到 confirmed（实 ' + W.survey.knowsOf('甲', '断崖').know + '）');
  })();

  /* ============ C 契约与边界 ============ */
  // C1 补给：勘察池与手里的料分列；resupply 是唯一扣料口且**先判后扣**
  (function () {
    const W = envWith(ov).WA;
    withSpot(W, '崖边点', '断崖', 3);
    const s = W.survey.survey({ who: '甲', spot: '崖边点', from: '渡口', days: 3, supply: 1 });
    a(s.ok === true && s.supply === 1, 'C1: 单开出来了，勘察池 1（实 ' + (s && s.supply) + '）');
    const before = (W.store.get().people['p_甲'].resources || {}).supply;
    a(before === 6, 'C1b: 开局那一份**不动手里的料**（勘察池 ≠ 库存，实 ' + before + '）');
    const r = W.survey.resupply(s.id, { by: '甲', amount: 99 });
    a(r.reason === 'short-supply', 'C1c: 手里不够 ⇒ short-supply（实 ' + r.reason + '）');
    a((W.store.get().people['p_甲'].resources || {}).supply === before,
      'C1d: **先判后扣** —— 一格都没动（实 ' + before + ' → ' + (W.store.get().people['p_甲'].resources || {}).supply + '）');
    const ok = W.survey.resupply(s.id, { by: '甲', amount: 2 });
    a(ok.ok === true && (W.store.get().people['p_甲'].resources || {}).supply === 4,
      'C1e: 够的时候才真扣（6 → ' + (W.store.get().people['p_甲'].resources || {}).supply + '），且池子涨到 ' + (ok && ok.supply));
  })();
  // C2 缺补给暂停必须落存档 + 补料复工（验收原文）
  (function () {
    const W = envWith(ov).WA;
    withSpot(W, '崖边点', '断崖', 3);
    const s = W.survey.survey({ who: '乙', spot: '崖边点', from: '渡口', days: 3, supply: 1 });
    a(s.ok === true, 'C2: 乙的单开出来了（勘察池 1，工期 3）');
    const r = W.survey.advance({ id: s.id, days: 3 });
    a(r.ok === true && r.pausedCount === 1, 'C2b: 推进时缺补给 ⇒ 当次暂停（实 paused=' + (r && r.pausedCount) + '）');
    const row = (W.store.get().survey.scouts || []).filter(function (x) { return x.id === s.id; })[0];
    a(row && row.status === 'paused',
      'C2c: **存档里也是 paused**（返回体说发生了、存档里没有 = 事务被回滚）');
    a(row && row.done === 1, 'C2d: 走了一天就停（已走的天数照实保留，实 done=' + (row && row.done) + '）');
    W.store.transact(function (d) { d.people['p_乙'].resources = { supply: 5 }; return true; }, 'exp4:refuel');
    a(W.survey.resupply(s.id, { by: '乙', amount: 2 }).ok === true, 'C2e: 补料成功');
    const rr = W.survey.resume(s.id);
    a(rr.ok === true && rr.changed === true, 'C2f: 复工成功（实 changed=' + (rr && rr.changed) + '）');
    const adv = W.survey.advance({ id: s.id, days: 2 });
    a(adv.ok === true && adv.arrivedCount === 1, 'C2g: 补料复工后走完 ⇒ arrived（验收原文的「缺料暂停、补料继续」）');
  })();
  // C3 单收口之后不再收指令（与「没这张单」分列）
  (function () {
    const W = envWith(ov).WA;
    const s = scoutToArrive(W, { who: '甲' });
    a(s.ok === true, 'C3: 单已抵达（收口）');
    a(W.survey.pause(s.id).reason === 'scout-closed',
      'C3b: 对已抵达的单下停工令 ⇒ scout-closed（实 ' + W.survey.pause(s.id).reason + '）');
    a(W.survey.advance({ id: 'sc_查无此单' }).reason === 'unknown-scout',
      'C3c: 对不存在的单下指令 ⇒ unknown-scout（两件事分得开）');
    a(W.survey.halt(s.id).reason === 'scout-closed', 'C3d: 对已抵达的单下中止令 ⇒ scout-closed');
  })();
  // C4 容量闸：不静默挤掉旧行
  (function () {
    const W = envWith(ov).WA;
    const keep = W.survey.getSettings().maxSpots;
    W.survey.setSettings({ maxSpots: 4 });
    for (let i = 0; i < 4; i++) W.survey.declareSpot('S' + i, { place: '渡口', days: 1 });
    const r = W.survey.declareSpot('溢出的点', { place: '渡口', days: 1 });
    a(r.reason === 'spots-full', 'C4: 勘察点行到上限 ⇒ spots-full（实 ' + r.reason + '）');
    a((W.store.get().survey.spots || []).length === 4, 'C4b: 旧的四行一行没少（不静默挤掉）');
    W.survey.setSettings({ maxSpots: keep });
  })();
  // C5 三态封闭集 + 缺参数 + 不建第二份名册
  (function () {
    const W = envWith(ov).WA;
    a(W.survey.KNOWS.join(',') === 'unknown,heard,confirmed',
      'C5: 认知三态是封闭集（实 ' + W.survey.KNOWS.join(',') + '）—— 不给「大概知道」的中间态');
    a(W.survey.survey({ who: '', spot: '崖边点' }).reason === 'missing-fields', 'C5b: 缺 who ⇒ missing-fields');
    a(W.survey.survey({ who: '甲', spot: '' }).reason === 'missing-fields', 'C5c: 缺 spot ⇒ missing-fields');
    a(W.survey.report({ from: '甲', to: '甲', place: '渡口' }).reason === 'self-report',
      'C5d: 自己报给自己 ⇒ self-report（不是一条消息）');
    a(W.survey.survey({ who: '查无此人', spot: '崖边点', from: '渡口' }).reason === 'unknown-worker',
      'C5e: 勘察者不在名册 ⇒ unknown-worker（不建第二份名册）');
  })();
  // C6 存档是唯一真源：reload 从存档重建
  (function () {
    const W = envWith(ov).WA;
    scoutToArrive(W, { who: '甲' });
    const r = W.survey.reload();
    a(r.ok === true && r.views === 1 && r.scouts === 1,
      'C6: reload 从存档重建（实 views=' + r.views + ' scouts=' + r.scouts + '）—— 切聊天必须重建');
  })();

  await runNegative(a, ov);
}

/* ============ N 真源码破坏 + 两向自证 ============ */
async function runNegative(a, ov) {
  ov = ov || {};
  function broken(key, repl) {
    const o = {};
    o[ANCHOR[key].rel] = rd(ANCHOR[key].rel, ov).replace(ANCHOR[key].txt, repl);
    return o;
  }
  // N1 不建第二份地图：把只读口改成写口 ⇒ 世界地图被改
  (function () {
    const o = broken('noWorldWrite',
      "  function roadsOf(root) {\n    const w = (root || state()).world;\n    w.roads = [];\n    return w.roads;\n  }");
    let hit = false;
    try {
      const W = envWith(o).WA;
      const before = JSON.stringify(W.store.get().world.roads);
      W.survey.fog('甲');
      hit = JSON.stringify(W.store.get().world.roads) !== before;
    } catch (e) { hit = true; }
    a(hit, 'N1: 把地图读口改成写口 ⇒ 世界地图被改（B2 的「一字未改」确实是判据，不是恒真）');
  })();
  // N2 升级闸：拆掉 ⇒ 亲历者被一次转述降级（confirmed → heard）
  (function () {
    const W = envWith(broken('raise', '')).WA;
    scoutToArrive(W, { who: '甲' });
    W.survey.confirm('乙', '断崖', { at: true });     // 乙亲历 ⇒ confirmed
    W.survey.report({ from: '甲', to: '乙', place: '断崖' });   // 走「已有行」分支 ⇒ raiseView('heard')
    a(W.survey.knowsOf('乙', '断崖').know === 'heard',
      'N2: 拆掉升级闸 ⇒ 一次转述就把亲历者降成 heard（B6 的「只升不降」确实是判据，实 '
        + W.survey.knowsOf('乙', '断崖').know + '）');
  })();
  // N3 目标地点闸：拆掉 ⇒ 未登记的目标地点不再拒收 unknown-place
  (function () {
    const W = envWith(broken('placeGate', "")).WA;
    W.store.transact(function (d) {
      d.survey.spots.push({ name: '幽灵点', label: '幽灵点', kind: 'site', place: '不存在的地方',
        days: 1, at: 1, updatedAt: 1 });
      return true;
    }, 'exp4:ghost');
    const r = W.survey.survey({ who: '甲', spot: '幽灵点', from: '渡口' });
    a(r.reason !== 'unknown-place',
      'N3: 拆掉目标地点闸 ⇒ 未登记的地点不再拒收 unknown-place（B4 的判据非恒真，实 ' + r.reason + '）');
  })();
  // N4 转述上限：把 heard 改成 confirmed ⇒ 传闻升格
  (function () {
    const W = envWith(broken('reportCap',
      "        const changed = raiseView(row, 'confirmed');")).WA;
    scoutToArrive(W, { who: '甲' });
    W.survey.report({ from: '甲', to: '乙', place: '断崖' });   // 第一次：新建行（heard）
    W.survey.report({ from: '甲', to: '乙', place: '断崖' });   // 第二次：走已有行分支 ⇒ raiseView
    a(W.survey.knowsOf('乙', '断崖').know === 'confirmed',
      'N4: 把转述上限改成 confirmed ⇒ 乙直接拿到亲历 ⇒ B5b 的「最高 heard」确实是判据（实 '
        + W.survey.knowsOf('乙', '断崖').know + '）');
  })();
  // N5 遮罩：让 fog 把名字带出去 ⇒ 泄露
  (function () {
    const o = broken('fogMask',
      "      note: hiddenPlaces.length ? '还有 ' + hiddenPlaces.join('、') + ' 没发现' : null };");
    const W = envWith(o).WA;
    const f = W.survey.fog('乙');
    a(JSON.stringify(f).indexOf('渡口') >= 0,
      'N5: 让 fog 报出名字 ⇒ 未发现的地名泄露 ⇒ B7b 的「一个字都不出现」确实是判据');
  })();
  // N6 观察者过滤：拆掉 ⇒ 别人的认知出现在你的块里
  (function () {
    const W = envWith(broken('viewerFilter',
      "      return v && (RANK[clean(v.know, 12)] || 0) > 0;")).WA;
    scoutToArrive(W, { who: '甲' });
    W.survey.setSettings({ viewer: '乙' });
    const blk = W.survey.buildBlock();
    a(blk.indexOf('断崖') >= 0,
      'N6: 拆掉观察者过滤 ⇒ 甲的地点出现在乙的块里（B8e 的「不泄露」确实是判据）');
  })();
  // N6b 观察者闸 + 空判：两道闸一起拆 ⇒ 无观察者也产块
  (function () {
    const o = {};
    o[SV] = rd(SV, ov)
      .replace(ANCHOR.viewerGate.txt, '    // viewer gate removed')
      .replace(ANCHOR.emptyGate.txt, '    // empty gate removed');
    const W = envWith(o).WA;
    W.survey.setSettings({ viewer: '' });
    a(W.survey.buildBlock() !== '',
      'N6b: 两道闸一起拆 ⇒ 无观察者也产出注入块（B8 的「空串」确实是判据；单拆一层拆不掉 = 纵深防御）');
  })();
  // N7 到达才确认：让「走一天」也算抵达 ⇒ 在途被写成已抵达
  (function () {
    const o = broken('arriveConfirm',
      "          if (num(row.done) >= 1) {\n            row.status = 'arrived';");
    const W = envWith(o).WA;
    withSpot(W, '崖边点', '断崖', 3);
    const s = W.survey.survey({ who: '甲', spot: '崖边点', from: '渡口', days: 3, supply: 3 });
    W.survey.advance({ id: s.id, days: 1 });
    a(W.survey.knowsOf('甲', '断崖').know === 'confirmed',
      'N7: 让「走一天」也算抵达 ⇒ 在途被写成已抵达 ⇒ B9b 的判据非恒真');
  })();
  // N8 认知分档闸：拆掉 rank 过滤 ⇒ 落一行 unknown 也算「知道」
  (function () {
    const o = broken('rankGate',
      "    const known = viewsOf().filter(function (v) {\n      return v && clean(v.who, 60) === w;\n    }).map(function (v) { return clean(v.place, 40); });");
    const W = envWith(o).WA;
    W.store.transact(function (d) {
      d.survey.views.push({ id: 'vw_u', who: '乙', place: '渡口', know: 'unknown', via: 'x', at: 1, updatedAt: 1 });
      return true;
    }, 'exp4:unknownrow');
    const f = W.survey.fog('乙');
    a(f.hiddenPlaces === 1,
      'N8: 拆掉 rank 过滤 ⇒ 落一行 unknown 也算「知道」（实 hiddenPlaces=' + f.hiddenPlaces + '，应为 1）');
  })();
  // N9 正控制：原版上同款判据必须真
  (function () {
    const W = envWith(ov).WA;
    scoutToArrive(W, { who: '甲' });
    a(W.survey.knowsOf('甲', '断崖').know === 'confirmed'
      && W.survey.knowsOf('乙', '断崖').know === 'unknown'
      && W.survey.buildBlock() === '',
      'N9: 正控制 —— 原版上「归属探索者 + 无观察者零注入」同时为真');
    const f = W.survey.fog('乙');
    a(f.hiddenPlaces === 2 && JSON.stringify(f).indexOf('渡口') < 0,
      'N9b: 正控制 —— 原版上 fog 只报数不报名');
  })();
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };