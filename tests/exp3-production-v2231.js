#!/usr/bin/env node
// WorldAxis tests/exp3-production-v2231.js (v2.231.0) -- EXP-3 专锁：持续生产与经营
//
// 【它治什么（缺口，开工前逐条复核现场）】
//   计划原文：「**生产工单、设施容量、人员班次、工期、原料预留/消耗、停工与复工**，完成后向库存
//   交货并接到现有订单/运输。**即时 craft 保留原意，新工单显式启用**。」
//   验收原文：「两日生产订单，**首日不出货**；**缺料暂停、补料继续**；完工后**仅入库一次**并交给
//   既有物流；**人员不能同一时段被两个满额工位占用**。」
//
//   现场事实（不是静态推测）：
//     · `engines/economy.js` 的 `craft` 是**即时扣料出货**（一笔事务里扣进料、出货、记流水）
//       —— 答得出「这一刻做了两个面包」，答不出「这炉要烧两天、今天只烧了一天」；
//     · `engines/supply-chain.js` 的 `plan` 是**只读编排预览**（自己零 store.transact）—— 连一条
//       在产记录都不落；
//     · `engines/operations.js` 管批准 → 立项 → 拨付 → 周期结算，是**资源与项目**那一层，
//       不记「哪个工位今天在产什么」；
//     · `engines/freight.js` 管「货从哪发到哪」，`engines/org.js` 管资源账本。
//   全库扫「班次」零命中、「工单」只在三处注释里 ⇒ 合起来就是本项要补的那一格：
//   **世界能生产，但没有「正在生产」这件事**。
//
// 【本锁咬住的十二条否定式边界】
//   · **工单跨日**：两日单推进一天后 `done=1 < days=2` ⇒ 仍 running、交不出货（`not-done`，B3/N5）。
//   · **每天只吃当天那一份**：整单用量 ÷ 工期，不是整单用量（B3b/N1）。
//   · **原料预留是真扣**：`resupply` 从某人资源面扣进本单 reserve 池（B8/N13），不够 ⇒ `short-input`。
//   · **缺料暂停、补料继续**：当场转 paused 且**落存档**（B4/N3/N4）、补料 → 复工 → 推进（验收原文）。
//   · **暂停不是完成**：paused 的单交不出货、也不推进工期（`order-paused`，B12）。
//   · **完工只入库一次**：走 `economy.stock`，再交 ⇒ `order-delivered`（B5/N2）；
//     **部分入库的账当场落行**（B11/N14 —— 本版实测抓出的真缺陷②）。
//   · **同一人同一时段不双占**（`shift-conflict`，B6/N6，验收原文点名）。
//   · **班次名额上限**（`crew-full`，B6b/N9）。
//   · **设施按需声明 + 工位不超卖**（`no-such-facility` / `facility-full`，B7/N7/N8）。
//   · **占工位的状态是封闭集**：done/delivered/cancelled **不占工位**（B13/N10）——
//     否则「工位满」在单子做完之后仍为真，那是读数在骗人。
//   · **不建第二份配方真源**：配方名必须能在 economy 查到（B2/N11）。
//   · **取消要退料**（B9/N12）；**存档是唯一真源**（B10）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约与边界 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/exp3-production-v2231.js';
const PR = 'engines/production.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
// ── 破坏锚点（各恰 1 次，A6 逐键核）──
const ANCHOR = {
  // ① 每天那一份 = 整单用量 ÷ 工期（不是整单用量）
  perDay: { rel: PR, txt: "out[k] = +(((rec.in[k] * qty) / days).toFixed(3));" },
  // ② 幂等账：已入库的那几样重试时跳过（不重复入库）
  ledgerSkip: { rel: PR, txt: "if ((num(ledger[k]) || 0) >= q) { skipped[k] = num(ledger[k]) || 0; continue; }" },
  // ③ 没完工交不出货（纵深两层：外层前置闸 + 事务内闸）
  notDone: { rel: PR, txt: "    if (st !== 'done') {" },
  notDoneInner: { rel: PR, txt: "      if (clean(row.status, 12) !== 'done') { out = { ok: false, reason: 'not-done', id: row.id, status: row.status }; return false; }" },
  // ④ 同一人同一时段不双占
  shiftConflict: { rel: PR, txt: "if (clash) return refuse('shift-conflict', { who: w, shift: shift, busy: clash.id });" },
  // ⑤ 工位不超卖
  facilityFull: { rel: PR, txt: "        return refuse('facility-full', { facility: facility, used: used, slots: num(fac.slots) || 1 });" },
  // ⑥ 设施按需声明（没声明过的设施不收单）
  noFacility: { rel: PR, txt: "    if (facility && !facOf(facility)) return refuse('no-such-facility', { facility: facility,\n      declared: facsOf().map(function (f) { return f.name; }) });" },
  // ⑦ 缺料暂停时如实记下停因
  pauseOnShort: { rel: PR, txt: "          row.pausedReason = 'short-input';" },
  // ⑧ 暂停本身就是一次状态写入 ⇒ 该事务必须提交
  pauseCommit: { rel: PR, txt: "          //   list/view 全读到假状态（本版实测抓出：缺料暂停后 stored status 仍是 running）。\n          return true;" },
  // ⑨ 预留 = 真从某人手里扣出来（不赊账）
  reserveDraw: { rel: PR, txt: "      drawRes(pur, material, amount);" },
  // ⑩ 取消要退料（不吞料）
  cancelReturn: { rel: PR, txt: "        if (q > 0) { addRes(pur, m, q); back[m] = q; }" },
  // ⑪ 占工位的状态封闭集（done/delivered/cancelled 不占）
  openStatus: { rel: PR, txt: "const OPEN_STATUS = ['running', 'paused'];" },
  // ⑫ 配方真源在 economy（本模块只读）
  recipeSource: { rel: PR, txt: "      try { r = WA.economy.recipeOf(name); } catch (e) { r = null; }" },
  // ⑬ 班次名额上限（不静默挤掉已排的人）
  crewFull: { rel: PR, txt: "if (!already && crew.length >= cfg.maxCrew) return refuse('crew-full', { id: j.id, cap: cfg.maxCrew });" },
  // ⑭ 部分入库的账当场落行（不重复入库）
  partialGate: { rel: PR, txt: "      if (Object.keys(made).length) {" }
};
const EXPORTS = ['STATUSES', 'getSettings', 'setSettings', 'declareFacility', 'open', 'staff', 'resupply',
  'advance', 'pause', 'resume', 'deliver', 'cancel', 'list', 'reload', 'view', 'stat', 'resetStat', 'reset'];
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  seed(env.WA);
  env.WA.production.setSettings({ enabled: true, maxJobs: 48, maxFacilities: 12, maxCrew: 8, maxDays: 90 });
  if (env.WA.economy && env.WA.economy.setSettings) env.WA.economy.setSettings({ enabled: true });
  return env;
}
/** 夹具：四个人 + 空的工单/设施/经济面（**自己 seed、自己收** —— 借别人的夹具就是「靠顺序活着」）。 */
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: { '面粉': 20, '铁': 10 }, updatedAt: 1 };
    d.people['p_乙'] = { id: 'p_乙', name: '乙', resources: { '面粉': 20 }, updatedAt: 1 };
    d.people['p_丙'] = { id: 'p_丙', name: '丙', resources: {}, updatedAt: 1 };
    d.people['p_厂'] = { id: 'p_厂', name: '厂', resources: { '面粉': 20 }, updatedAt: 1 };
    d.production = { jobs: [], facilities: [] };
    d.economy = { goods: [], orders: [], routes: [] };
    return true;
  }, 'exp3:seed');
}
/** 部分入库场景夹具：三行占位货 + maxGoods=4 ⇒ 两产物单的**第二样**必然 goods-full。 */
function seedPartial(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: { '面粉': 20 }, updatedAt: 1 };
    d.production = { jobs: [], facilities: [] };
    d.economy = { goods: [
      { place: '别处', resource: '甲货', base: 1, stock: 1, price: 1 },
      { place: '别处', resource: '乙货', base: 1, stock: 1, price: 1 },
      { place: '别处', resource: '丙货', base: 1, stock: 1, price: 1 }
    ], orders: [], routes: [] };
    return true;
  }, 'exp3:seed-partial');
}
/**
 * 部分入库场景（B11 / N2 / N14 共用）：两产物单，第一样进得了库、第二样被 economy 拒收。
 *   返回 { first, second, stock, ledger }：两次交货的回执、重试后第一样的库存量、首次被拒后账上的记录。
 *   ⚠ 配方真源是 economy：这里**临时**把 recipeOf 换成一条两产物配方（读完即还原），
 *     不是给产品开旁路 —— 仓内无多产物配方，而「部分入库」这件事只能由多产物触发。
 */
function partialScenario(W) {
  W.economy.setSettings({ enabled: true, maxGoods: 4 });
  seedPartial(W);
  const keep = W.economy.recipeOf;
  W.economy.recipeOf = function (n) {
    return (n === '双产') ? { in: { '面粉': 1 }, out: { '面包': 2, '铁器': 1 } } : keep.call(W.economy, n);
  };
  let first = null, second = null, stock = 0, ledger = null;
  try {
    const j = W.production.open({ recipe: '双产', qty: 1, days: 1, by: '甲' });
    W.production.advance(j.id);
    first = W.production.deliver(j.id, { place: '镇', base: 1 });
    const mid = (W.store.get().production.jobs || []).filter(function (x) { return x.id === j.id; })[0];
    ledger = mid ? Object.assign({}, mid.delivered || {}) : null;
    second = W.production.deliver(j.id, { place: '镇', base: 1 });
    const rows = (W.store.get().economy.goods || []).filter(function (r) { return r.place === '镇' && r.resource === '面包'; });
    stock = rows.length ? (rows[0].stock || 0) : 0;
  } finally { W.economy.recipeOf = keep; }
  return { first: first, second: second, stock: stock, ledger: ledger };
}
async function runAll(a, ov) {
  ov = ov || {};
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, PR)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/production.js'") > 0, 'A2: tests/run.js LOAD 已挂');
  a(rd('index.js', ov).indexOf("'engines/production.js'") > 0, 'A2b: index.js LOAD_ORDER 已挂');
  a(rd('engines/tool-diag.js', ov).indexOf("'engines/production.js': 'production'") > 0, 'A3: tool-diag 声明表已登记');
  a(rd('engines/tool-diag.js', ov).indexOf('production: secProduction()') > 0
    && rd('engines/tool-diag.js', ov).indexOf('function secProduction()') > 0,
    'A3b: 诊断面单列一节（与 economy 分列：那一节答「这一刻做成了什么」，本节答「正在产什么、走到第几天」）');
  (function () {
    a(rd('core/store.js', ov).indexOf('production: { jobs: [], facilities: [] }') > 0,
      'A4: 骨架已物化（登记不等于物化）');
    a(rd('core/evict.js', ov).indexOf("'production.jobs'") > 0, 'A4b: 挤出站点已登记');
  })();
  (function () {
    const P = rd('ui/panel.js', ov);
    a(cnt(P, 'id="wa-pd-enabled"') === 1, 'A5: 面板渲染了持续生产段（实 ' + cnt(P, 'id="wa-pd-enabled"') + ' 处）');
    a(cnt(P, "on('#wa-pd-open'") === 1 && cnt(P, "on('#wa-pd-advance'") === 1,
      'A5b: 开单 / 推进各恰 1 处绑定');
    a(rd('engines/tool-diag.js', ov).indexOf("'wa-pd-enabled'") > 0
      && rd('engines/tool-diag.js', ov).indexOf("'wa-pd-out'") > 0,
      'A5c: 守卫表登记了本段控件（三件齐做）');
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
    const miss = EXPORTS.filter(function (k) { return e0.WA.production[k] === undefined; });
    a(miss.length === 0, 'A8: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();
  /* ============ B 运行时行为 ============ */
  // B1 开关
  (function () {
    const W = envWith(ov).WA;
    W.production.setSettings({ enabled: false });
    a(W.production.open({ recipe: '面包', qty: 1, days: 1, by: '甲' }).reason === 'disabled',
      'B1: 关着时开单拒收 disabled（新工单显式启用）');
    a(W.production.advance('pj_x').reason === 'disabled', 'B1b: 关着时推进拒收 disabled');
    W.production.setSettings({ enabled: true });
  })();
  // B2 不建第二份配方真源 + 不建第二份名册
  (function () {
    const W = envWith(ov).WA;
    const r = W.production.open({ recipe: '查无此方', qty: 1, days: 1, by: '甲' });
    a(r.ok === false && r.reason === 'unknown-recipe',
      'B2: 配方名查不到 ⇒ unknown-recipe（实 ' + r.reason + '）—— 本模块只读 economy 的配方真源');
    const w = W.production.open({ recipe: '面包', qty: 1, days: 1, by: '查无此人' });
    a(w.ok === false && w.reason === 'unknown-worker',
      'B2b: 开工者不是世界里的人物 ⇒ unknown-worker（实 ' + w.reason + '）—— 本模块不建第二份名册');
    a(W.production.open({ recipe: '面包', qty: 1, days: 1, by: '甲' }).ok === true, 'B2c: 合法开单成功');
  })();
  // B3 **验收原文**：两日单首日不出货 + 每天只吃当天那一份
  (function () {
    const W = envWith(ov).WA;
    const before = W.store.get().people['p_甲'].resources['面粉'];
    const j = W.production.open({ recipe: '面包', qty: 2, days: 2, by: '甲' });
    a(j.ok === true && j.perDay['面粉'] === 1 && j.need['面粉'] === 2,
      'B3: 两日单的每天那一份 = 整单用量 ÷ 工期（每天 ' + j.perDay['面粉'] + ' / 整单 ' + j.need['面粉'] + '）');
    const a1 = W.production.advance(j.id);
    a(a1.ok === true && a1.done === 1 && a1.status === 'running' && a1.readyToDeliver === false,
      'B3b: 推进一天后仍 running（done=' + a1.done + '/' + a1.days + '）');
    const after = W.store.get().people['p_甲'].resources['面粉'];
    a(before - after === 1, 'B3c: 一天只吃**一天那一份**（面粉 ' + before + '→' + after + '）—— 不是整单用量');
    const dv = W.production.deliver(j.id, { place: '镇', base: 1 });
    a(dv.ok === false && dv.reason === 'not-done',
      'B3d: **首日不出货**：工期没走完 ⇒ not-done（实 ' + dv.reason + '）—— 验收原文点名');
  })();
  // B4 **验收原文**：缺料暂停、补料继续（且暂停落存档）
  (function () {
    const W = envWith(ov).WA;
    // 甲手里没有面粉 ⇒ 开单后第一天就凑不出料
    W.store.transact(function (d) { d.people['p_甲'].resources = {}; return true; }, 'exp3:b4-clear');
    const j = W.production.open({ recipe: '面包', qty: 2, days: 2, by: '甲' });
    const adv = W.production.advance(j.id);
    a(adv.ok === false && adv.reason === 'short-input' && adv.status === 'paused' && adv.day === 1,
      'B4: 缺料 ⇒ short-input 且**当场转 paused**（第 ' + adv.day + ' 天，缺 ' + adv.material + '）');
    a(adv.moved === 0, 'B4b: 缺料那一天**一格都不扣**（先判后动，实 moved=' + adv.moved + '）');
    const stored = W.store.get().production.jobs[0];
    a(stored.status === 'paused' && stored.pausedReason === 'short-input',
      'B4c: **暂停落存档**（stored=' + stored.status + ' / ' + stored.pausedReason + '）'
        + ' —— 返回体说发生了、存档里没有，是本仓反复点名的失效形态');
    a(W.production.list({})[0].pausedReason === 'short-input', 'B4d: 只读清单读到停因');
    const rs = W.production.resupply(j.id, { by: '乙', material: '面粉', amount: 4 });
    a(rs.ok === true && rs.reserve['面粉'] === 4, 'B4e: 补料进本单预留池（实 ' + JSON.stringify(rs.reserve) + '）');
    const rm = W.production.resume(j.id);
    a(rm.ok === true && rm.changed === true && rm.status === 'running', 'B4f: 复工 paused → running');
    const a2 = W.production.advance(j.id, { days: 2 });
    a(a2.ok === true && a2.done === 2 && a2.status === 'done' && a2.readyToDeliver === true,
      'B4g: 复工后**接着走**到完工（done=' + a2.done + '）—— 验收原文点名');
    a(W.production.deliver(j.id, { place: '镇', base: 1 }).ok === true, 'B4h: 完工后可交货');
  })();
  // B5 **验收原文**：完工后仅入库一次
  (function () {
    const W = envWith(ov).WA;
    const j = W.production.open({ recipe: '面包', qty: 2, days: 1, by: '甲' });
    W.production.advance(j.id);
    const d1 = W.production.deliver(j.id, { place: '镇', base: 1 });
    a(d1.ok === true && d1.status === 'delivered', 'B5: 交货成功并置 delivered');
    const rows = W.store.get().economy.goods.filter(function (r) { return r.place === '镇' && r.resource === '面包'; });
    const stock1 = rows[0].stock;
    const d2 = W.production.deliver(j.id, { place: '镇', base: 1 });
    a(d2.ok === false && d2.reason === 'order-delivered',
      'B5b: **再交一次 ⇒ order-delivered**（实 ' + d2.reason + '）—— 完工后仅入库一次，验收原文点名');
    const rows2 = W.store.get().economy.goods.filter(function (r) { return r.place === '镇' && r.resource === '面包'; });
    a(rows2[0].stock === stock1, 'B5c: 库存**没有被再入一次**（' + stock1 + ' → ' + rows2[0].stock + '）');
    a(W.production.cancel(j.id).reason === 'order-closed', 'B5d: 已交付的单取消 ⇒ order-closed（不再动它）');
  })();
  // B6 **验收原文**：人员不能同一时段被两个满额工位占用 + 班次名额上限
  (function () {
    const W = envWith(ov).WA;
    const A = W.production.open({ recipe: '面包', qty: 1, days: 3, by: '甲' });
    const B = W.production.open({ recipe: '面包', qty: 1, days: 3, by: '乙' });
    a(W.production.staff(A.id, '丙', { shift: 'day' }).ok === true, 'B6: 丙 排到 A 单的日班');
    const clash = W.production.staff(B.id, '丙', { shift: 'day' });
    a(clash.ok === false && clash.reason === 'shift-conflict' && clash.busy === A.id,
      'B6b: **同一人同一时段被另一张未完结单占着 ⇒ shift-conflict**（实 ' + clash.reason + '，占在 ' + clash.busy + '）'
        + ' —— 验收原文点名');
    a(W.production.staff(B.id, '丙', { shift: 'night' }).ok === true,
      'B6c: 换一个**时段**即可排（日班占用不影响夜班）—— 冲突按「人 + 时段」判，不按人一刀切');
    const keep = W.production.getSettings().maxCrew;
    W.production.setSettings({ maxCrew: 1 });
    try {
      const C = W.production.open({ recipe: '面包', qty: 1, days: 3, by: '厂' });
      a(W.production.staff(C.id, '厂', { shift: 'day' }).ok === true, 'B6d: 名额内首排成功');
      const cf = W.production.staff(C.id, '乙', { shift: 'day' });
      a(cf.ok === false && cf.reason === 'crew-full' && cf.cap === 1,
        'B6e: 这一张单的班次名额到上限 ⇒ crew-full（实 ' + cf.reason + '）—— 与「人不够」不是一件事');
    } finally { W.production.setSettings({ maxCrew: keep }); }
  })();
  // B7 设施按需声明 + 工位不超卖
  (function () {
    const W = envWith(ov).WA;
    const ns = W.production.open({ recipe: '面包', qty: 1, days: 1, by: '甲', facility: '查无此坊' });
    a(ns.ok === false && ns.reason === 'no-such-facility' && (ns.declared || []).length === 0,
      'B7: 没声明过的设施 ⇒ no-such-facility（实 ' + ns.reason + '）—— 设施按需启用，不静默收下自造设施上的单');
    W.production.declareFacility('小坊', { slots: 1 });
    const f1 = W.production.open({ recipe: '面包', qty: 1, days: 3, by: '甲', facility: '小坊' });
    a(f1.ok === true && f1.facility === '小坊', 'B7b: 声明后可在该设施开单');
    const f2 = W.production.open({ recipe: '面包', qty: 1, days: 3, by: '乙', facility: '小坊' });
    a(f2.ok === false && f2.reason === 'facility-full' && f2.used === 1 && f2.slots === 1,
      'B7c: 工位不超卖（实 ' + f2.reason + '，used ' + f2.used + '/' + f2.slots + '）—— 同一时段占不满两格');
  })();
  // B8 原料预留是真扣（不赊账）
  (function () {
    const W = envWith(ov).WA;
    const j = W.production.open({ recipe: '面包', qty: 2, days: 2, by: '甲' });
    const b0 = W.store.get().people['p_乙'].resources['面粉'];
    const short = W.production.resupply(j.id, { by: '乙', material: '面粉', amount: 999 });
    a(short.ok === false && short.reason === 'short-input' && short.have === b0,
      'B8: 手里不够 ⇒ short-input（实 ' + short.reason + '，有 ' + short.have + '）—— 不赊账');
    const rs = W.production.resupply(j.id, { by: '乙', material: '面粉', amount: 3 });
    const b1 = W.store.get().people['p_乙'].resources['面粉'];
    a(rs.ok === true && b0 - b1 === 3 && rs.reserve['面粉'] === 3,
      'B8b: 预留是**真从某人手里扣出来**（乙 面粉 ' + b0 + '→' + b1 + '，池里 ' + rs.reserve['面粉'] + '）');
    a(W.store.get().production.jobs[0].reserve['面粉'] === 3, 'B8c: 预留池进存档（不是模块内存）');
  })();
  // B9 取消要退料（不吞料）+ 已推进天数如实保留
  (function () {
    const W = envWith(ov).WA;
    const j = W.production.open({ recipe: '面包', qty: 4, days: 4, by: '甲' });
    W.production.resupply(j.id, { by: '乙', material: '面粉', amount: 4 });
    W.production.advance(j.id, { days: 1 });
    // 退料退回的是**开工者**（这张单是甲开的），不是补料者 —— 源码 `row.by` 如此，判据照实读甲。
    const before = W.store.get().people['p_甲'].resources['面粉'];
    const c = W.production.cancel(j.id);
    const after = W.store.get().people['p_甲'].resources['面粉'];
    a(c.ok === true && c.returned['面粉'] === 3 && after - before === 3 && c.by === '甲',
      'B9: 取消**退料**（预留池剩 ' + c.returned['面粉'] + ' 退回**开工者** ' + c.by + '，甲 面粉 ' + before + '→' + after + '）—— 不吞料');
    a(c.done === 1 && c.days === 4, 'B9b: 已推进的天数**如实留在回执里**（' + c.done + '/' + c.days + '）—— 不假装没发生');
    a(W.store.get().production.jobs[0].reserve['面粉'] === undefined, 'B9c: 预留池清空（不留给下一个人）');
  })();
  // B10 存档是唯一真源
  (function () {
    const W = envWith(ov).WA;
    const j = W.production.open({ recipe: '面包', qty: 2, days: 2, by: '甲' });
    W.production.advance(j.id);
    const stored = JSON.stringify(W.store.get().production);
    a(stored.indexOf(j.id) > 0 && stored.indexOf('"done":1') > 0, 'B10: 工单行**进存档**（不是模块内存）');
    const rl = W.production.reload();
    a(rl.ok === true && rl.jobs === 1, 'B10b: reload() 从存档重建索引（实 ' + rl.jobs + ' 张）');
    a(W.production.list({})[0].done === 1, 'B10c: **重载后进度保留**（实 done=' + W.production.list({})[0].done + '）');
  })();
  // B11 部分入库的账当场落行（不重复入库）—— 本版实测抓出的真缺陷②
  (function () {
    const W = envWith(ov).WA;
    const p = partialScenario(W);
    a(p.first.ok === false && p.first.reason === 'goods-full',
      'B11: 第二样被库存面拒收 ⇒ 整单交不出货（实 ' + p.first.reason + '）');
    a(p.ledger && p.ledger['面包'] === 2,
      'B11b: **部分入库的账当场落行**（账上 ' + JSON.stringify(p.ledger) + '）—— 账只在收尾事务里写的话，'
        + '重试会读到空账、把第一样再入一次');
    a(p.second.reason === 'goods-full', 'B11c: 重试仍交不出（第二样还是入不了）');
    a(p.stock === 2, 'B11d: **第一样没有被再入一次**（库存 ' + p.stock + '）—— 验收原文的「仅入库一次」');
  })();
  // B12 暂停不是完成
  (function () {
    const W = envWith(ov).WA;
    const j = W.production.open({ recipe: '面包', qty: 2, days: 3, by: '甲' });
    W.production.pause(j.id, { why: '见证：人工停工' });
    const adv = W.production.advance(j.id);
    a(adv.ok === false && adv.reason === 'order-paused' && adv.why === '见证：人工停工',
      'B12: 停着的单不推进工期 ⇒ order-paused（实 ' + adv.reason + ' / 停因 ' + adv.why + '）—— 与「已收口」分列');
    const dv = W.production.deliver(j.id, { place: '镇', base: 1 });
    a(dv.reason === 'not-done', 'B12b: **暂停不是完成**：交不出货（实 ' + dv.reason + '）');
    a(W.production.list({})[0].done === 0, 'B12c: 暂停期间**不产出一格**（done=0）');
  })();
  // B13 占工位的状态是封闭集：做完/已交付/已取消**不占工位**
  (function () {
    const W = envWith(ov).WA;
    W.production.declareFacility('小坊', { slots: 1 });
    const j = W.production.open({ recipe: '面包', qty: 1, days: 1, by: '甲', facility: '小坊' });
    a(j.ok === true, 'B13: 第一张单占住唯一工位');
    a(W.production.open({ recipe: '面包', qty: 1, days: 1, by: '乙', facility: '小坊' }).reason === 'facility-full',
      'B13b: 同一时段第二张单 ⇒ facility-full');
    W.production.advance(j.id);
    W.production.deliver(j.id, { place: '镇', base: 1 });
    const j2 = W.production.open({ recipe: '面包', qty: 1, days: 1, by: '乙', facility: '小坊' });
    a(j2.ok === true, 'B13c: **已交付的单不再占工位**（实 ok=' + j2.ok + '）'
      + ' —— 否则「工位满」在单子做完之后仍为真，那是读数在骗人');
    const j3 = W.production.open({ recipe: '面包', qty: 1, days: 1, by: '厂', facility: '小坊' });
    a(j3.reason === 'facility-full', 'B13d: 但新的未完结单照样占着（工位没被白送）');
    a(j3.ok === false, 'B13e: 上一条不是静默通过（工位判据仍在）');
  })();
  /* ============ C 契约与边界 ============ */
  (function () {
    const self = rd(SELF_REL, ov);
    const reqs = (self.match(/require\(['"]([^'"]+)['"]\)/g) || []).filter(function (x) { return x.indexOf('./') < 0 && x.indexOf('../') < 0; });
    a(reqs.length === 2, 'C1: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');
  })();
  (function () {
    const s = rd(PR, ov);
    const code = s.split('\n').filter(function (ln) {
      const t = ln.replace(/^\s+/, '');
      return !(t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0);
    }).join('\n');
    a(cnt(code, 'store.transact') >= 8, 'C2: 引擎里有真写口（开/排/补/推/停/复/交/消/设/重置，实 ' + cnt(code, 'store.transact') + '）');
    a(code.indexOf('document') < 0 && code.indexOf('localStorage') < 0,
      'C2b: 代码面零 DOM / 零裸调 localStorage（状态走 settingsBus + store；剥注释后判）');
    a(code.indexOf('eval(') < 0 && code.indexOf('new Function') < 0, 'C2c: 零 eval / Function');
    a(code.indexOf('economy.craft') < 0 && code.indexOf('.craft(') < 0,
      'C2d: **即时 craft 保留原意**：本模块不调 economy.craft（那是「这一刻做成了」，与在产工单分列）');
  })();
  (function () {
    // 不建第二份库存真源：交货走 economy.stock，本模块的存档面只有 jobs / facilities 两键
    const W = envWith(ov).WA;
    const j = W.production.open({ recipe: '面包', qty: 2, days: 1, by: '甲' });
    W.production.advance(j.id);
    W.production.deliver(j.id, { place: '镇', base: 1 });
    const keys = Object.keys(W.store.get().production).sort().join(',');
    a(keys === 'facilities,jobs', 'C3: 本模块的存档面只有两键（实 ' + keys + '）—— 不另开一份库存');
    const rows = W.store.get().economy.goods.filter(function (r) { return r.place === '镇' && r.resource === '面包'; });
    a(rows.length === 1 && rows[0].stock === 4, 'C3b: 货真进了 **economy 的库存面**（实 ' + (rows[0] || {}).stock + '）');
  })();
  (function () {
    const W = envWith(ov).WA;
    const j = W.production.open({ recipe: '面包', qty: 1, days: 1, by: '甲' });
    W.production.declareFacility('小坊', { slots: 2 });
    const before = JSON.stringify(W.store.get());
    W.production.list({}); W.production.view(); W.production.stat(); W.production.reload();
    a(JSON.stringify(W.store.get()) === before, 'C4: 只读口不改世界（存档逐字不变）');
    a(j.ok === true, 'C4b: 上一条不是在空世界上判的（夹具里确有一张单）');
  })();
  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  await runNegative(a, ov);
}
function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
async function runNegative(a, ov) {
  ov = ov || {};
  const S = rd(PR, ov);
  (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n').replace(/"/g, '\\"'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：每天那一份改成整单用量 ⇒ 一天吃掉整单的料
  (function () {
    const S1 = brk(S, ANCHOR.perDay.txt, "out[k] = +(((rec.in[k] * qty) / 1).toFixed(3));");
    const ov1 = {}; ov1[PR] = S1;
    const W = envWith(ov1).WA;
    const before = W.store.get().people['p_甲'].resources['面粉'];
    const j = W.production.open({ recipe: '面包', qty: 2, days: 2, by: '甲' });
    W.production.advance(j.id);
    const after = W.store.get().people['p_甲'].resources['面粉'];
    a(before - after === 2,
      'N1: 破坏版上「推进一天」吃掉了**整单**的料（面粉 ' + before + '→' + after + '，差 ' + (before - after) + '）'
        + '⇒ 工期不再分摊到天；原版只吃一天那一份（B3c）⇒ 两向自证');
  })();
  // N2 破坏：幂等账的跳过闸摘掉 ⇒ 已入库的还会再入一次
  (function () {
    const S2 = brk(S, ANCHOR.ledgerSkip.txt, "if (false) { skipped[k] = num(ledger[k]) || 0; continue; }");
    const ov2 = {}; ov2[PR] = S2;
    const W = envWith(ov2).WA;
    const p = partialScenario(W);
    a(p.stock === 4,
      'N2: 破坏版上重试把第一样**再入了一次**（库存 ' + p.stock + '，原版 2）⇒ 幂等账形同虚设；'
        + '原版不重复入库（B11d）⇒ 两向自证');
  })();
  // N3 破坏：缺料暂停时不再记下停因
  (function () {
    const S3 = brk(S, ANCHOR.pauseOnShort.txt, "          void 0;");
    const ov3 = {}; ov3[PR] = S3;
    const W = envWith(ov3).WA;
    W.store.transact(function (d) { d.people['p_甲'].resources = {}; return true; }, 'exp3:n3');
    const j = W.production.open({ recipe: '面包', qty: 2, days: 2, by: '甲' });
    W.production.advance(j.id);
    a(W.production.list({})[0].pausedReason === '',
      'N3: 破坏版上停因读成空串（实 ' + JSON.stringify(W.production.list({})[0].pausedReason) + '）'
        + '⇒ 「缺料停的」与「人工停的」分不开；原版 short-input（B4d）⇒ 两向自证');
  })();
  // N4 破坏：缺料暂停的事务改成中止 ⇒ paused 不落存档
  (function () {
    const S4 = brk(S, ANCHOR.pauseCommit.txt, "          return false;");
    const ov4 = {}; ov4[PR] = S4;
    const W = envWith(ov4).WA;
    W.store.transact(function (d) { d.people['p_甲'].resources = {}; return true; }, 'exp3:n4');
    const j = W.production.open({ recipe: '面包', qty: 2, days: 2, by: '甲' });
    const adv = W.production.advance(j.id);
    const stored = W.store.get().production.jobs[0];
    a(adv.status === 'paused' && stored.status === 'running',
      'N4: 破坏版上**返回体说 paused、存档里还是 running**（回执 ' + adv.status + ' / 存档 ' + stored.status + '）'
        + '⇒ 只读面全读到假状态；原版落存档（B4c）⇒ 两向自证');
  })();
  // N5 破坏：没完工也能交货
  (function () {
    //   ⚠ not-done 是**纵深两层**（外层前置闸 + 事务内闸）—— 只摘一处，另一处照样拦，
    //     判据会读到 ok=false（首跑实测）。故两处一起摘：这样才是在证「这道闸拦着」。
    const S5 = brk(S, ANCHOR.notDone.txt, "    if (false) {")
      .split(ANCHOR.notDoneInner.txt).join("      if (false) { out = { ok: false, reason: 'not-done', id: row.id, status: row.status }; return false; }");
    if (cnt(S5, "clean(row.status, 12) !== 'done'") !== 0) throw new Error('N5 破坏未生效（内层闸还在）');
    const ov5 = {}; ov5[PR] = S5;
    const W = envWith(ov5).WA;
    const j = W.production.open({ recipe: '面包', qty: 2, days: 2, by: '甲' });
    W.production.advance(j.id);
    const dv = W.production.deliver(j.id, { place: '镇', base: 1 });
    a(dv.ok === true,
      'N5: 破坏版上首日就交出了货（实 ok=' + dv.ok + '）⇒ 「首日不出货」当场失效；'
        + '原版 not-done（B3d）⇒ 两向自证');
  })();
  // N6 破坏：同一人同一时段双占那道闸摘掉
  (function () {
    const S6 = brk(S, ANCHOR.shiftConflict.txt, "if (clash && false) return refuse('shift-conflict', { who: w, shift: shift, busy: clash.id });");
    const ov6 = {}; ov6[PR] = S6;
    const W = envWith(ov6).WA;
    const A = W.production.open({ recipe: '面包', qty: 1, days: 3, by: '甲' });
    const B = W.production.open({ recipe: '面包', qty: 1, days: 3, by: '乙' });
    W.production.staff(A.id, '丙', { shift: 'day' });
    const r = W.production.staff(B.id, '丙', { shift: 'day' });
    a(r.ok === true,
      'N6: 破坏版上同一个人同一时段被两张未完结单占着（实 ok=' + r.ok + '）⇒ 验收原文点名的边界失效；'
        + '原版 shift-conflict（B6b）⇒ 两向自证');
  })();
  // N7 破坏：工位容量那道闸摘掉
  (function () {
    const S7 = brk(S, ANCHOR.facilityFull.txt, "        void used;");
    const ov7 = {}; ov7[PR] = S7;
    const W = envWith(ov7).WA;
    W.production.declareFacility('小坊', { slots: 1 });
    W.production.open({ recipe: '面包', qty: 1, days: 3, by: '甲', facility: '小坊' });
    const r = W.production.open({ recipe: '面包', qty: 1, days: 3, by: '乙', facility: '小坊' });
    a(r.ok === true,
      'N7: 破坏版上一个工位开出两张单（实 ok=' + r.ok + '）⇒ 「工位不超卖」失效；'
        + '原版 facility-full（B7c）⇒ 两向自证');
  })();
  // N8 破坏：设施按需声明那道闸摘掉（没声明的设施被自动收下）
  (function () {
    const S8 = brk(S, ANCHOR.noFacility.txt, "    if (facility && !facOf(facility)) declareFacility(facility, { slots: 1 });");
    const ov8 = {}; ov8[PR] = S8;
    const W = envWith(ov8).WA;
    const r = W.production.open({ recipe: '面包', qty: 1, days: 1, by: '甲', facility: '查无此坊' });
    a(r.ok === true,
      'N8: 破坏版上自造设施被静默收下（实 ok=' + r.ok + '）⇒ 「按需启用」失效；'
        + '原版 no-such-facility（B7）⇒ 两向自证');
  })();
  // N9 破坏：班次名额上限摘掉
  (function () {
    const S9 = brk(S, ANCHOR.crewFull.txt, "if (false) return refuse('crew-full', { id: j.id, cap: cfg.maxCrew });");
    const ov9 = {}; ov9[PR] = S9;
    const W = envWith(ov9).WA;
    W.production.setSettings({ maxCrew: 1 });
    const j = W.production.open({ recipe: '面包', qty: 1, days: 3, by: '厂' });
    W.production.staff(j.id, '厂', { shift: 'day' });
    const r = W.production.staff(j.id, '乙', { shift: 'day' });
    a(r.ok === true,
      'N9: 破坏版上班次名额超卖（实 ok=' + r.ok + '）⇒ 已排的人被静默挤掉；'
        + '原版 crew-full（B6e）⇒ 两向自证');
  })();
  // N10 破坏：占工位的状态不再封闭（做完的单还占着工位）
  (function () {
    const S10 = brk(S, ANCHOR.openStatus.txt, "const OPEN_STATUS = ['running', 'paused', 'done', 'delivered', 'cancelled'];");
    const ov10 = {}; ov10[PR] = S10;
    const W = envWith(ov10).WA;
    W.production.declareFacility('小坊', { slots: 1 });
    const j = W.production.open({ recipe: '面包', qty: 1, days: 1, by: '甲', facility: '小坊' });
    W.production.advance(j.id);
    W.production.deliver(j.id, { place: '镇', base: 1 });
    const r = W.production.open({ recipe: '面包', qty: 1, days: 1, by: '乙', facility: '小坊' });
    a(r.ok === false && r.reason === 'facility-full',
      'N10: 破坏版上**做完的单还占着工位**（实 ' + r.reason + '）⇒ 工位满的读数在骗人；'
        + '原版已交付的单不占（B13c）⇒ 两向自证');
  })();
  // N11 破坏：配方真源不再读 economy（本模块自认配方）
  (function () {
    const S11 = brk(S, ANCHOR.recipeSource.txt, "      try { r = { in: { '面粉': 1 }, out: { '面包': 2 } }; } catch (e) { r = null; }");
    const ov11 = {}; ov11[PR] = S11;
    const W = envWith(ov11).WA;
    const r = W.production.open({ recipe: '查无此方', qty: 1, days: 1, by: '甲' });
    a(r.ok === true,
      'N11: 破坏版上任何配方名都被认（实 ok=' + r.ok + '）⇒ 第二份配方真源当场出现；'
        + '原版 unknown-recipe（B2）⇒ 两向自证');
  })();
  // N12 破坏：取消不再退料
  (function () {
    const S12 = brk(S, ANCHOR.cancelReturn.txt, "        if (false) { addRes(pur, m, q); back[m] = q; }");
    const ov12 = {}; ov12[PR] = S12;
    const W = envWith(ov12).WA;
    const j = W.production.open({ recipe: '面包', qty: 4, days: 4, by: '甲' });
    W.production.resupply(j.id, { by: '乙', material: '面粉', amount: 4 });
    // 读**开工者**（退料对象）：读补料者会恒为不变 ⇒ 负控制假绿（对原文件断言，破坏不发生也绿）。
    const before = W.store.get().people['p_甲'].resources['面粉'];
    const c = W.production.cancel(j.id);
    const after = W.store.get().people['p_甲'].resources['面粉'];
    a(after - before === 0 && (c.returned || {})['面粉'] === undefined,
      'N12: 破坏版上取消把预留的料**吞了**（甲 面粉 ' + before + '→' + after + '）⇒ 不吞料的边界失效；'
        + '原版退回 3（B9）⇒ 两向自证');
  })();
  // N13 破坏：预留不再真扣（赊账）
  (function () {
    const S13 = brk(S, ANCHOR.reserveDraw.txt, "      void 0;");
    const ov13 = {}; ov13[PR] = S13;
    const W = envWith(ov13).WA;
    const j = W.production.open({ recipe: '面包', qty: 2, days: 2, by: '甲' });
    const before = W.store.get().people['p_乙'].resources['面粉'];
    const rs = W.production.resupply(j.id, { by: '乙', material: '面粉', amount: 3 });
    const after = W.store.get().people['p_乙'].resources['面粉'];
    a(rs.ok === true && before - after === 0,
      'N13: 破坏版上预留是**赊账**（乙 面粉 ' + before + '→' + after + '，池里却记着 ' + (rs.reserve || {})['面粉'] + '）'
        + '⇒ 一份料被两处同时算；原版真扣（B8b）⇒ 两向自证');
  })();
  // N14 破坏：部分入库的账不再落行
  (function () {
    const S14 = brk(S, ANCHOR.partialGate.txt, "      if (false) {");
    const ov14 = {}; ov14[PR] = S14;
    const W = envWith(ov14).WA;
    const p = partialScenario(W);
    a(p.stock === 4 && (p.ledger || {})['面包'] === undefined,
      'N14: 破坏版上部分入库的账没落行（账 ' + JSON.stringify(p.ledger) + '）⇒ 重试把第一样再入一次（库存 ' + p.stock + '）；'
        + '原版当场落账（B11b/B11d）⇒ 两向自证');
  })();
  // N15 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-EXP3', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N15: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N15b: 锚点不唯一必须抛');
  // N16 真源码逐字未变
  a(rd(PR) === S, 'N16: 被破坏过的引擎真源码逐字未变（破坏只发生在内存副本上）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    console.log('\nEXP3-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}