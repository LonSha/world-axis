#!/usr/bin/env node
// WorldAxis tests/opt5-floor-settle-v2231.js (v2.231.0) -- OPT-5 专锁：楼层结算账与退回闭环
//
// 【它治什么（现场实测，不是静态推测）】
//   OPT-5 原文要的是「消息与实际结算变更的绑定」+「当前楼重掷、删最后楼形成可用闭环」+
//   「明确重载后的可恢复范围」。开工前逐条复核现场，三处缺口都是真的：
//     1 **算得出、写不回**：`engines/floor-snapshot.js::rollback` 只返回 `{patch}`，全函数零
//       `store.transact` —— 「重掷后旧状态还在」这件事在代码里没有出口。判据 B3/B4。
//     2 **知道改了没，不知道改了什么**：`core/settle-guard.js` 只判「这一楼结算过没有」，
//       `floorChanges` 只盘点派生数据。没有任何地方记「这一楼动了哪几个世界键」。判据 B2/B2b。
//     3 **重载即失忆**：`floorSnapshot` 的 RING 是模块内存。判据 C1（记账在存档里）/ C2（cap）。
//
// 【四条口径（逐条有判据咬）】
//   · 同楼同指纹才自动退：重掷自闭环（B10），楼层被改过只标 stale 交人决定（B11）。
//   · 被后续楼层改过的键**不退**：逐键比对 after 指纹，不一致进 conflicts（B7，N1）。
//   · 中间楼只出范围不擅自动手（B12），删最后一楼才自闭环（B13）。
//   · 换聊天不套补丁（B14）；无聊天不记账（B16）；关闭即拒收（B8）。
//
// 四段结构（与 N10/N11/OPT2310 同规格）：A 静态契约 / B 运行时行为 / C 持久化与容量 /
//   N 真源码破坏 + 两向自证（含 N0 静态面）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const FS_REL = 'engines/floor-settle.js';
const SELF_REL = 'tests/opt5-floor-settle-v2231.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }

// -- 破坏锚点（各恰 1 次，A6 逐键核）--
const ANCHOR = {
  fsChatGuard: { rel: FS_REL, txt: "if (rec.chatId && rec.chatId !== cid) return refuse('other-chat');" },
  fsPersist: { rel: FS_REL, txt: "b.entries.push(entry);" },
  fsHashCheck: { rel: FS_REL, txt: "if (curH !== r.h) { plan.conflicts.push(k); return; }" },
  fsSigMatch: { rel: FS_REL, txt: "if (rec.sig === sig) {" },
  fsIsLast: { rel: FS_REL, txt: "const isLast = (tail == null) || (floor >= tail);" },
  fsExport: { rel: FS_REL, txt: "beginRound: beginRound, endRound: endRound," }
};
const EXPORTS = ['getSettings', 'setSettings', 'beginRound', 'endRound', 'rollback', 'rollbackFrom',
  'scopeOf', 'onFloorEvent', 'list', 'view', 'stat', 'resetStat', 'reset'];

function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  return env;
}
function ctx() { return global.SillyTavern.getContext(); }
function pushMsg(text) {
  const c = ctx();
  c.chat.push({ is_user: false, name: '旁白', mes: text, swipe_id: 0 });
  return c.chat.length - 1;
}
function popMsg() { const c = ctx(); if (c.chat.length > 1) c.chat.pop(); }

function runAll(a) {
  const S = rd(FS_REL);
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, FS_REL)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js').indexOf("'engines/floor-settle.js'") > 0, 'A2: tests/run.js LOAD 已挂（否则整套回归根本不装它）');
  a(rd('index.js').indexOf("'engines/floor-settle.js'") > 0, 'A2b: index.js LOAD_ORDER 已挂（否则真宿主不装它）');
  a(rd('engines/tool-diag.js').indexOf("'engines/floor-settle.js': 'floorSettle'") > 0,
    'A3: tool-diag 声明表已登记（漏登记 ⇒ inventory 定义面与诊断面上该模块不存在）');
  a(rd('core/store.js').indexOf('floorSettle: { entries: [] }') > 0, 'A3b: 骨架已物化（不在骨架里 registryParity 会报，冷启动直写会炸）');
  a(rd('core/interceptor.js').indexOf('WA.floorSettle.beginRound()') > 0, 'A4: 拦截器在轮开始抓基线');
  a(rd('core/interceptor.js').indexOf('WA.floorSettle.endRound()') > 0, 'A4b: 拦截器在 after 链尾部落账');
  a(rd('core/interceptor.js').indexOf("WA.floorSettle.onFloorEvent('deleted'") > 0, 'A4c: 删楼事件已接（否则「删最后一楼自闭环」永不触发）');
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A5: 破坏锚点在目标文件里各恰 1 次（不合：' + badA.join(',') + '）');
  (function () {
    const self = rd(SELF_REL);
    const table = self.slice(self.indexOf('const ANCHOR = {'), self.indexOf('\n};', self.indexOf('const ANCHOR = {')));
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A5b: 锚点逐键在锚表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  a(cnt(S, "WA.registerModule('engines/floor-settle.js'") === 1, 'A6: 模块自注册（版本面对账的入口）');

  /* ============ B 运行时行为 ============ */
  const e1 = envWith(null); const W1 = e1.WA;
  const miss = EXPORTS.filter(function (k) { return W1.floorSettle[k] === undefined; });
  a(miss.length === 0, 'B0: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  const r1 = W1.floorSettle.beginRound();
  a(r1.ok === true && r1.floor === ctx().chat.length - 1, 'B1: beginRound 记下当前楼层（floor=' + r1.floor + '）');
  a(r1.chatId === ctx().chatId, 'B1b: 记账带 chatId（换聊天不套补丁的前提）');
  W1.store.transact(function (d) { d.clock.dayIndex = 5; d.worldFacts.push({ id: 'f1', key: 'k', value: 'v' }); }, 'opt5:b1');
  const r2 = W1.floorSettle.endRound();
  a(r2.ok === true && r2.changed === 2, 'B2: endRound 逐键比出**这一楼改了什么**（changed=' + r2.changed + '）');
  a(r2.keys.indexOf('clock') >= 0 && r2.keys.indexOf('worldFacts') >= 0, 'B2b: 改动键逐条点名（' + r2.keys.join('/') + '）');
  const ents = W1.store.get().floorSettle.entries;
  a(ents.length === 1 && ents[0].state === 'live' && ents[0].changed === 2, 'B3: 记账落进**存档**容器且标 live');

  const rb = W1.floorSettle.rollback(r2.floor);
  a(rb.ok === true && rb.restored === 2, 'B4: rollback 真把世界写回去（restored=' + rb.restored + '）');
  a(W1.store.get().clock.dayIndex === 0 && W1.store.get().worldFacts.length === 0,
    'B4b: 退回后现场逐项复原（dayIndex=' + W1.store.get().clock.dayIndex
    + ' / facts=' + W1.store.get().worldFacts.length + '）——原版 floorSnapshot.rollback 只返回补丁不写 store');
  a(W1.floorSettle.list()[0].state === 'rolled-back', 'B5: 记账标 rolled-back（不是删掉，「退过」也是一条事实）');
  a(W1.floorSettle.rollback(r2.floor).reason === 'no-entry', 'B5b: 同一楼退第二次拒收 no-entry（不重复退）');

  // B6 同楼重掷自闭环
  const e6 = envWith(null); const W6 = e6.WA;
  W6.floorSettle.beginRound();
  W6.store.transact(function (d) { d.clock.dayIndex = 7; }, 'opt5:b6');
  W6.floorSettle.endRound();
  a(W6.store.get().clock.dayIndex === 7, 'B6: 重掷前现场是 7');
  const b6 = W6.floorSettle.beginRound();
  a(b6.reconciled && b6.reconciled.state === 'rolled-back' && b6.reconciled.restored === 1,
    'B6b: 同楼同指纹再开局 ⇒ **先退回上一笔**（restored=' + (b6.reconciled && b6.reconciled.restored) + '）');
  a(W6.store.get().clock.dayIndex === 0, 'B6c: 退回发生在抓基线**之前**（新基线不含旧结算，dayIndex=0）');

  // B7 被后续楼层改过的键不退
  const e7 = envWith(null); const W7 = e7.WA;
  W7.floorSettle.beginRound();
  W7.store.transact(function (d) { d.clock.dayIndex = 3; }, 'opt5:b7');
  W7.floorSettle.endRound();
  W7.store.transact(function (d) { d.clock.dayIndex = 9; }, 'opt5:b7b');   // 后续楼层又改了一次
  const b7 = W7.floorSettle.rollback(W7.floorSettle.list()[0].floor);
  a(b7.ok === false && b7.reason === 'all-conflict' && b7.conflicts === 1,
    'B7: 被后续楼层改过的键**不退**并如实报冲突（reason=' + b7.reason + ' / conflicts=' + b7.conflicts + '）');
  a(W7.store.get().clock.dayIndex === 9, 'B7b: 冲突键原样保留（dayIndex=9，不被"回退"静默覆盖）');

  // B8/B9 关闭与未开局
  const e8 = envWith(null); const W8 = e8.WA;
  W8.floorSettle.setSettings({ enabled: false });
  const b8 = W8.floorSettle.beginRound();
  a(b8.ok === false && b8.reason === 'disabled', 'B8: 关闭时拒收 disabled（不记也不退）');
  a(W8.store.get().floorSettle.entries.length === 0, 'B8b: 关闭时存档里一条不落');
  const e9 = envWith(null); const W9 = e9.WA;
  a(W9.floorSettle.endRound().reason === 'no-begin', 'B9: 没开局就 endRound ⇒ no-begin（不凭空记账）');

  // B10 中间楼只出范围 / B11 删最后一楼自闭环
  const e10 = envWith(null); const W10 = e10.WA;
  W10.floorSettle.beginRound();
  W10.store.transact(function (d) { d.clock.dayIndex = 2; }, 'opt5:b10');
  const f10 = W10.floorSettle.endRound().floor;
  pushMsg('第二段正文');
  W10.floorSettle.beginRound();
  const preWeather = JSON.stringify(W10.store.get().weather);
  W10.store.transact(function (d) { d.weather = { kind: 'rain' }; }, 'opt5:b10b');
  const f10b = W10.floorSettle.endRound().floor;
  a(f10b > f10, 'B10: 两楼各一笔（' + f10 + ' → ' + f10b + '）');
  const sc = W10.floorSettle.onFloorEvent('deleted', { index: f10 });
  a(sc.mode === 'scope' && sc.floors === 1 && sc.executable === false,
    'B10b: 删**中间楼**只出范围不擅自动手（mode=' + sc.mode + ' / floors=' + sc.floors + '）');
  a(W10.store.get().clock.dayIndex === 2, 'B10c: 范围报告不改世界（dayIndex 仍是 2）');
  const tail = W10.floorSettle.onFloorEvent('deleted', { index: f10b });
  a(tail.mode === 'self-close' && tail.restored === 1, 'B11: 删**最后一楼**才自闭环退回（restored=' + tail.restored + '）');
  a(JSON.stringify(W10.store.get().weather) === preWeather,
    'B11b: 自闭环真的把该楼写进去的值撤回（weather 逐字回到 ' + preWeather + '，实 '
    + JSON.stringify(W10.store.get().weather) + '）');
  const rf = W10.floorSettle.rollbackFrom(f10);
  a(rf.ok === true && rf.floors === 1, 'B11c: rollbackFrom 从某楼起全线退回（floors=' + rf.floors + '）');

  // B12 换聊天不套补丁
  const e12 = envWith(null); const W12 = e12.WA;
  W12.floorSettle.beginRound();
  W12.store.transact(function (d) { d.clock.dayIndex = 4; }, 'opt5:b12');
  W12.floorSettle.endRound();
  const oldChat = ctx().chatId;
  ctx().chatId = 'other_chat_999';
  const b12 = W12.floorSettle.rollback(W12.floorSettle.list()[0].floor);
  a(b12.ok === false && b12.reason === 'other-chat',
    'B12: 换聊天不套补丁（reason=' + b12.reason + '）');
  a(W12.store.get().clock.dayIndex === 4, 'B12b: 拒收时世界一格不动');
  ctx().chatId = oldChat;

  // B13 无聊天不记账
  const e13 = envWith(null); const W13 = e13.WA;
  const keep = ctx().chat.slice();
  ctx().chat.length = 0;
  const b13 = W13.floorSettle.beginRound();
  a(b13.ok === false && b13.reason === 'no-chat', 'B13: 无聊天拒收 no-chat（没有「这一楼」可言）');
  Array.prototype.push.apply(ctx().chat, keep);

  // B14 楼层被编辑过 ⇒ 只标 stale，不擅自回退
  const e14 = envWith(null); const W14 = e14.WA;
  W14.floorSettle.beginRound();
  W14.store.transact(function (d) { d.clock.dayIndex = 6; }, 'opt5:b14');
  W14.floorSettle.endRound();
  ctx().chat[ctx().chat.length - 1].mes += '（追加一句）';
  const b14 = W14.floorSettle.beginRound();
  a(b14.reconciled && b14.reconciled.state === 'stale', 'B14: 指纹不同只标 stale（不擅自回退）');
  a(W14.store.get().clock.dayIndex === 6, 'B14b: stale 时世界未被改动（dayIndex 仍 6）');
  a(W14.floorSettle.list()[0].state === 'stale', 'B14c: 记账被标 stale（面板据此交人决定）');
  ctx().chat[ctx().chat.length - 1].mes = ctx().chat[ctx().chat.length - 1].mes.replace('（追加一句）', '');

  /* ============ C 持久化与容量 ============ */
  const eC = envWith(null); const WC = eC.WA;
  WC.floorSettle.beginRound();
  WC.store.transact(function (d) { d.clock.dayIndex = 8; }, 'opt5:c1');
  WC.floorSettle.endRound();
  const rec = WC.store.get().floorSettle.entries[0];
  a(rec && rec.keys && rec.keys.clock && typeof rec.keys.clock.h === 'string' && rec.keys.clock.h.length > 0,
    'C1: 记账里有**改后指纹**（退回时判「还是当初那一版吗」的唯一依据）');
  a(JSON.parse(JSON.stringify(rec)).keys.clock.before.clock === undefined
    && JSON.parse(JSON.stringify(rec)).keys.clock.before.dayIndex === 0,
    'C1b: 记账里带**改前的值**（可序列化 ⇒ 重载后仍退得回去）');
  const eC2 = envWith(null); const WC2 = eC2.WA;
  WC2.floorSettle.setSettings({ maxFloors: 2 });
  let lastFloor = null;
  for (let i = 0; i < 3; i++) {
    WC2.floorSettle.beginRound();
    WC2.store.transact(function (d) { d.clock.dayIndex = d.clock.dayIndex + 1; }, 'opt5:c2');
    lastFloor = WC2.floorSettle.endRound().floor;
    if (i < 2) pushMsg('第 ' + i + ' 段');
  }
  a(WC2.store.get().floorSettle.entries.length === 2, 'C2: cap 生效（3 笔只留 2 笔）');
  a(WC2.floorSettle.stat().dropped === 1, 'C2b: 被挤掉的笔数**说出来**（dropped=' + WC2.floorSettle.stat().dropped + '）');
  a(WC2.floorSettle.list().length === 2 && lastFloor != null, 'C2c: 留下的是最近两楼');
  const selfSrc = rd(SELF_REL);
  const reqs = (selfSrc.match(/require\('([a-z_]+)'\)/g) || []).filter(function (r) {
    return r.indexOf("'fs'") < 0 && r.indexOf("'path'") < 0;
  });
  a(reqs.length === 0, 'C3: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');

  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  runNegative(a);
}

function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
function runNegative(a) {
  const S = rd(FS_REL);
  (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：去掉「当前值还是当初那一版吗」判据 ⇒ 后续楼层改过的键也被静默覆盖
  (function () {
    const S1 = brk(S, ANCHOR.fsHashCheck.txt, '');
    const ov = {}; ov[FS_REL] = S1;
    const WA = envWith(ov).WA;
    WA.floorSettle.beginRound();
    WA.store.transact(function (d) { d.clock.dayIndex = 3; }, 'opt5:n1');
    WA.floorSettle.endRound();
    WA.store.transact(function (d) { d.clock.dayIndex = 9; }, 'opt5:n1b');
    const r = WA.floorSettle.rollback(WA.floorSettle.list()[0].floor);
    a(r.restored === 1 && r.conflicts === 0,
      'N1: 破坏版上冲突键被"退回"了（restored=1 / conflicts=0 ⇒ 原版 all-conflict 的两向自证）');
    a(WA.store.get().clock.dayIndex === 0, 'N1b: 破坏版上 dayIndex 被静默覆盖成 0（原版保留 9）');
  })();
  // N2 破坏：记账不落存档 ⇒ 退无可退
  (function () {
    const S2 = brk(S, ANCHOR.fsPersist.txt, 'void entry;');
    const ov = {}; ov[FS_REL] = S2;
    const WA = envWith(ov).WA;
    WA.floorSettle.beginRound();
    WA.store.transact(function (d) { d.clock.dayIndex = 5; }, 'opt5:n2');
    const r = WA.floorSettle.endRound();
    a(r.ok === true && WA.store.get().floorSettle.entries.length === 0,
      'N2: 破坏版上 endRound 仍报 ok 但存档里一条不剩（原版落 1 条 ⇒ 两向自证「报成功≠记下了」）');
  })();
  // N3 破坏：去掉换聊天守卫 ⇒ 另一个聊天的补丁被套上
  (function () {
    const S3 = brk(S, ANCHOR.fsChatGuard.txt, '');
    const ov = {}; ov[FS_REL] = S3;
    const WA = envWith(ov).WA;
    WA.floorSettle.beginRound();
    WA.store.transact(function (d) { d.clock.dayIndex = 4; }, 'opt5:n3');
    WA.floorSettle.endRound();
    const old = ctx().chatId;
    ctx().chatId = 'other_chat_999';
    const r = WA.floorSettle.rollback(WA.floorSettle.list()[0].floor);
    ctx().chatId = old;
    a(r.ok === true && r.restored === 1,
      'N3: 破坏版上别个聊天的补丁被应用（restored=1 ⇒ 原版 other-chat 拒收的两向自证）');
  })();
  // N4 破坏：中间楼与最后一楼不再区分 ⇒ 中间楼也擅自回退
  (function () {
    const S4 = brk(S, ANCHOR.fsIsLast.txt, 'const isLast = true;');
    const ov = {}; ov[FS_REL] = S4;
    const WA = envWith(ov).WA;
    WA.floorSettle.beginRound();
    WA.store.transact(function (d) { d.clock.dayIndex = 2; }, 'opt5:n4');
    const f = WA.floorSettle.endRound().floor;
    pushMsg('第二段');
    WA.floorSettle.beginRound();
    WA.store.transact(function (d) { d.weather = { kind: 'rain' }; }, 'opt5:n4b');
    WA.floorSettle.endRound();
    const r = WA.floorSettle.onFloorEvent('deleted', { index: f });
    a(r.mode === 'self-close',
      'N4: 破坏版上删中间楼也自闭环（mode=' + r.mode + ' ⇒ 原版 scope 的两向自证）');
    popMsg();
  })();
  // N5 破坏：同楼指纹比对恒假 ⇒ 重掷不再自动退回
  (function () {
    const S5 = brk(S, ANCHOR.fsSigMatch.txt, 'if (false) {');
    const ov = {}; ov[FS_REL] = S5;
    const WA = envWith(ov).WA;
    WA.floorSettle.beginRound();
    WA.store.transact(function (d) { d.clock.dayIndex = 7; }, 'opt5:n5');
    WA.floorSettle.endRound();
    const b = WA.floorSettle.beginRound();
    a(b.reconciled && b.reconciled.state === 'stale',
      'N5: 破坏版上重掷被当成「楼层被编辑」（state=' + (b.reconciled && b.reconciled.state) + ' ⇒ 原版 rolled-back 的两向自证）');
    a(WA.store.get().clock.dayIndex === 7, 'N5b: 破坏版上重掷后旧结算仍在（dayIndex=7）');
  })();
  // N6 破坏：导出面去掉 beginRound/endRound ⇒ 能力可写但不可用
  (function () {
    const S6 = brk(S, ANCHOR.fsExport.txt, '');
    const ov = {}; ov[FS_REL] = S6;
    const WA = envWith(ov).WA;
    a(typeof WA.floorSettle.beginRound !== 'function' && typeof WA.floorSettle.endRound !== 'function',
      'N6: 破坏版上轮边界两枚不在导出面（原版在 ⇒ 两向自证）');
  })();
  // N7 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-OPT5', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N7: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N7b: 锚点不唯一必须抛');
  // N8 真源码逐字未变
  a(rd(FS_REL) === S, 'N8: 被破坏过的引擎真源码逐字未变（破坏只发生在内存副本上）');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name, extra) {
    if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制失效：' + (e && e.stack)); }
  console.log('\nOPT5-V2231: ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}