#!/usr/bin/env node
// v2.159.0 专锁（TP1）：种子预览与待确认操作的**聊天隔离**。
//
// 缺陷形态（本轮探针实证）：world-seed 的待确认计划是模块级裸对象，不绑定目标聊天 ——
//   在 A 聊天 initPreview() 之后切到 B 聊天，initConfirm() 仍会把 A 的预览结果写进 B
//   （目标人物/地名/initFrom 全部落进 B，而 A 一格未动）。
//
// 修复形态：
//   · store 层新增**异步归属票据**原语（claimAsync / settleAsync / dropAsync / claimStat /
//     epoch / committedRev）—— 正确性约束，默认生效、不可关；与可开关的 staleGuard 分工不同。
//   · world-seed 的待确认对象升级为**票据**：归属（chatId/epoch/rev）以 store 票据为唯一真源，
//     确认时由 settleAsync 判「这还是当初那个局吗」；票面自洽与「预览后种子被删」另判。
//   · initConfirm 三道门：归属复核 → 事务外 not-empty 预检 → 事务内 draft 复核（判据与事实同批）。
//
// 判据（按「静默失效」代价排序）：
//   ① 跨聊天拒收：A 预览 → B 确认 ⇒ foreign-chat，且 B 的人物/地图/initFrom 逐字不变。
//   ② 同聊天正常：预览 → 确认 ok（修复不能把正当路径一起拒掉）。
//   ③ 纪元：同聊天重载（store.init）后确认 ⇒ stale-epoch。
//   ④ 出处：预览后种子被删 ⇒ unknown-seed（不是别的码 —— 更具体的诊断不许被盖掉）。
//   ⑤ 票据消费：拒收也消费（第二次同款确认走 no-preview，不是再 foreign-chat）。
//   ── 夹具纪律：每例独立聊天（fresh 不重置 chatId，切过的会被静默继承）/ 不硬编码宿主聊天 id /
//      负控制走**真源码内存副本**破坏（锚点恰中一次、原版同判据成立、破坏版同判据失败）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL_WS = 'engines/world-seed.js';
const REL_STORE = 'core/store.js';

// ── 锚点（每条在真源码里必须恰中 1 次）─────────────────────────
const ANCHOR_CLAIM_ASYNC = 'claimAsync: function (site, opt) {';
const ANCHOR_SETTLE_ASYNC = 'settleAsync: function (ticket, opt) {';
const ANCHOR_EPOCH = 'epoch: function () { return __epoch; }';
const ANCHOR_COMMITTED_REV = 'committedRev: function () {';
const ANCHOR_STORE_FOREIGN = 'if (c.chatId !== nowChat) {';
const ANCHOR_STORE_EPOCH = 'if (c.epoch !== __epoch) {';
const ANCHOR_SETTLE_OWN = 'function settleOwnership(opt) {';
const ANCHOR_CLAIM_CALL = "const c = WA.store.claimAsync('worldSeed:initPreview');";
const ANCHOR_OWN_CALL = 'const own = settleOwnership(opt);';
const ANCHOR_UNKNOWN_SEED_IF = 'if (!still) {';
const ANCHOR_INNER_EMPTY = 'const ecIn = emptyCheck(root);';

function countOcc(s, sub) { return s.split(sub).length - 1; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function ov(file, src) { const o = {}; o[file] = src; return o; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

let __seq = 0;
/** 起一个干净空新局宿主（worldSeed 开关全开）。chatId 给定即切到该聊天。 */
function boot(srcOv, chatId) {
  if (!chatId) chatId = 'tp1_seq_' + (++__seq);
  const WA = sync.fresh(srcOv ? { srcOverride: srcOv } : {}).WA;
  try {
    const c = global.SillyTavern.getContext();
    c.chatId = chatId; c.chatMetadata = {};
  } catch (e) {}
  WA.store.init();
  WA.worldSeed.setSettings({ enabled: true });
  return WA;
}
/** 模拟切聊天：改宿主 chatId 后 store.init()（目标聊天库键 worldaxis_state_<chatId> 必为空）。 */
function switchChat(WA, chatId) {
  const c = global.SillyTavern.getContext();
  c.chatId = chatId; c.chatMetadata = {};
  WA.store.init();
}

function makeSourceWorld(WA) {
  WA.store.transact(function (root) {
    root.evolution = root.evolution || {};
    root.evolution.factions = [
      { id: 'fa_a', name: '北盟', scope: '北境', status: '鼎盛', relation: '盟友', currentGoal: '称霸北境', core_person: '韩烈', powerPillars: ['铁骑', '粮仓'] },
      { id: 'fa_b', name: '南会', scope: '南郡', status: '稳固', relation: '敌对', currentGoal: '守住南郡', core_person: '沈青', powerPillars: ['水师'] }
    ];
    root.people = {
      p1: { id: 'p1', name: '韩烈', profile: { relations: [{ target: 'p2', intimacy: 80 }] } },
      p2: { id: 'p2', name: '沈青', profile: { relations: [{ target: 'p1', intimacy: -40 }] } }
    };
    root.world = root.world || {};
    root.world.places = [
      { id: 'pl_a', name: '北境城', kind: 'public', parent: '', open: 0, close: 0, uses: [], at: 0 },
      { id: 'pl_b', name: '南港', kind: 'public', parent: '', open: 0, close: 0, uses: [], at: 0 }
    ];
    root.world.roads = [{ a: '北境城', b: '南港', minutes: 600 }];
    root.background = root.background || {}; root.background.text = '乱世已过三百年，双雄分治。';
    root.clock = root.clock || {}; root.clock.label = '元和三年';
  }, 'tp1:makeSource');
}
/** 造一个可转移的种子包（源世界在**源聊天**上构筑）。 */
function newPack() {
  const W = boot();
  makeSourceWorld(W);
  W.worldSeed.extract();
  const sv = W.worldSeed.save('tp1', []);
  return W.worldSeed.transferPack(sv.id);
}
/** 目标世界的「人物 / 地图 / initFrom」三面快照（跨聊天拒收要看它逐字不变）。 */
function snap(WA) {
  const s = WA.store.get();
  return JSON.stringify({
    people: Object.keys(s.people || {}).sort().map(function (k) { return s.people[k].name; }),
    places: ((s.world && s.world.places) || []).map(function (p) { return p.name; }),
    initFrom: (s.meta && s.meta.initFrom) || null
  });
}
/**
 * 把一颗种子「植入」当前聊天的库（负控制专用）。
 *   为什么需要它：种子库（worldSeed.library）是**聊天局部的世界状态** —— 切到 B 之后
 *   B 的库是空的，「出处检查」会先于归属检查把确认拦下（`unknown-seed`）。
 *   于是只破归属判据时，缺陷被另一条**偶然**的判据顶替，负控制报绿而缺陷根本没复现
 *   —— 这是本仓点名的假绿形态。植入一颗同 id 的种子把那条偶然判据摘掉，
 *   让唯一承重的归属判据暴露出来，破坏才可观测。
 */
function graftSeed(WA, id, sig) {
  WA.store.transact(function (root) {
    root.worldSeed = root.worldSeed || { library: [], seq: 0 };
    root.worldSeed.library = root.worldSeed.library || [];
    root.worldSeed.library.push({ id: id, name: 'graft', tags: [], at: 0,
      seed: { ver: 1, sig: sig, at: 0, powers: [{ name: 'x', weight: 0 }], network: { nodes: [], edges: [] }, geo: { places: [], roads: 0 }, era: {} } });
  }, 'tp1:graft');
  return id;
}

// ── A 段：结构面（锚点各恰中 1 次）──────────────────────────────
function runA(a) {
  const st = read(REL_STORE);
  const ws = read(REL_WS);
  const items = [
    [st, ANCHOR_CLAIM_ASYNC, 'A1 store 票据取票口 claimAsync 锚点恰中 1 次'],
    [st, ANCHOR_SETTLE_ASYNC, 'A2 store 票据结算口 settleAsync 锚点恰中 1 次'],
    [st, ANCHOR_EPOCH, 'A3 store 纪元读口 epoch 锚点恰中 1 次'],
    [st, ANCHOR_COMMITTED_REV, 'A4 store 已确认读集版本 committedRev 锚点恰中 1 次'],
    [st, ANCHOR_STORE_FOREIGN, 'A5 store 侧跨聊天判据 foreign-chat 在位'],
    [st, ANCHOR_STORE_EPOCH, 'A6 store 侧纪元判据 stale-epoch 在位'],
    [ws, ANCHOR_SETTLE_OWN, 'A7 worldSeed 归属结算 settleOwnership 锚点恰中 1 次'],
    [ws, ANCHOR_CLAIM_CALL, 'A8 预览取 store 票据（归属真源不另造一套）锚点恰中 1 次'],
    [ws, ANCHOR_OWN_CALL, 'A9 确认走归属结算（不是自比三面）锚点恰中 1 次'],
    [ws, ANCHOR_UNKNOWN_SEED_IF, 'A10 预览后种子被删的判据（出处检查）锚点恰中 1 次'],
    [ws, ANCHOR_INNER_EMPTY, 'A11 事务内用 draft 复核空局（判据与事实同批）锚点恰中 1 次']
  ];
  items.forEach(function (it) {
    const n = countOcc(it[0], it[1]);
    a(n === 1, 'v2159 ' + it[2] + '（实 ' + n + '）');
  });
}

// ── B 段：行为面 ────────────────────────────────────────────────
function runB(a) {
  const pk = newPack();

  // B1 同聊天：正当路径不能被一起拒掉
  {
    const W = boot(null, 'tp1_same');
    const im = W.worldSeed.importPack(pk.pack);
    a(im.ok === true, 'v2159 B1a 导入包 ok');
    const pv = W.worldSeed.initPreview(im.id, 0);
    a(pv.ok === true && typeof pv.previewSeq === 'number' && !!pv.chatId,
      'v2159 B1b 预览落票据（seq / chatId 回执齐）');
    a(typeof pv.ticket === 'string' && pv.ticket.length > 0,
      'v2159 B1c 预览同时取了 store 票据（归属真源）');
    const cf = W.worldSeed.initConfirm();
    a(cf.ok === true, 'v2159 B1d 同聊天确认 ok');
    const s = W.store.get();
    a(!!(s.meta && s.meta.initFrom && s.meta.initFrom.seedId), 'v2159 B1e meta.initFrom 已写（唯一写入方）');
    a(s.meta.initFrom.chatId === cf.chatId && s.meta.initFrom.previewSeq === pv.previewSeq,
      'v2159 B1f initFrom 记下 chatId + previewSeq（可追溯哪张票装的）');
    a(cf.previewSeq === pv.previewSeq, 'v2159 B1g 确认应用的是**预览那一份**（不重抽）');
  }

  // B2 跨聊天拒收 + B 逐字不变（本轮缺陷的正面判据）
  {
    const W = boot(null, 'tp1_chatA');
    const im = W.worldSeed.importPack(pk.pack);
    a(W.worldSeed.initPreview(im.id, 0).ok === true, 'v2159 B2a A 聊天预览 ok');
    switchChat(W, 'tp1_chatB');
    const before = snap(W);
    const cf = W.worldSeed.initConfirm();
    a(cf.ok === false && cf.reason === 'foreign-chat',
      'v2159 B2b B 聊天确认被拒 foreign-chat（实 ' + cf.reason + '）');
    a(/tp1_chatA/.test(JSON.stringify(cf)), 'v2159 B2c 拒收回执点名票据原属聊天');
    a(snap(W) === before && !W.store.get().meta.initFrom,
      'v2159 B2d B 的人物/地图/initFrom 逐字不变（A 的种子没落进 B）');
  }

  // B3 纪元：同聊天重载后确认
  {
    const W = boot(null, 'tp1_epoch');
    const im = W.worldSeed.importPack(pk.pack);
    W.worldSeed.initPreview(im.id, 0);
    const ep0 = W.store.epoch();
    W.store.init();
    a(W.store.epoch() !== ep0, 'v2159 B3a store.init 推进纪元（' + ep0 + ' → ' + W.store.epoch() + '）');
    const cf = W.worldSeed.initConfirm();
    a(cf.ok === false && cf.reason === 'stale-epoch',
      'v2159 B3b 重载后确认被拒 stale-epoch（实 ' + cf.reason + '）');
  }

  // B4 出处：预览后种子被删 ⇒ unknown-seed（不许被更粗的码盖掉）
  {
    const W = boot(null, 'tp1_delseed');
    const im = W.worldSeed.importPack(pk.pack);
    W.worldSeed.initPreview(im.id, 0);
    a(W.worldSeed.drop(im.id).ok === true, 'v2159 B4a 种子删除 ok');
    const cf = W.worldSeed.initConfirm();
    a(cf.ok === false && cf.reason === 'unknown-seed',
      'v2159 B4b 删种子后确认被拒 unknown-seed（实 ' + cf.reason + '）');
    a(!W.store.get().meta.initFrom, 'v2159 B4c 世界未被写入');
  }

  // B5 票据消费：拒收也消费
  {
    const W = boot(null, 'tp1_consume');
    const im = W.worldSeed.importPack(pk.pack);
    W.worldSeed.initPreview(im.id, 0);
    switchChat(W, 'tp1_consumeB');
    a(W.worldSeed.initConfirm().reason === 'foreign-chat', 'v2159 B5a 首次拒收 foreign-chat');
    const c2 = W.worldSeed.initConfirm();
    a(c2.ok === false && c2.reason === 'no-preview',
      'v2159 B5b 第二次走 no-preview（拒收也消费票据，实 ' + c2.reason + '）');
  }

  // B6 台账：票据活动必须可见（有写入方、零读者的字段是本仓点名过的功能级失效）
  {
    const W = boot(null, 'tp1_stat');
    const im = W.worldSeed.importPack(pk.pack);
    W.worldSeed.initPreview(im.id, 0);
    const cs0 = W.store.claimStat();
    a(cs0.issued >= 1 && cs0.live >= 1, 'v2159 B6a 取票已记账且票据在册（issued=' + cs0.issued + ' live=' + cs0.live + '）');
    W.worldSeed.initConfirm();
    const cs1 = W.store.claimStat();
    a(cs1.passed >= 1 && cs1.live === 0, 'v2159 B6b 放行记账且票据已消费（passed=' + cs1.passed + ' live=' + cs1.live + '）');
  }

  // B7 重新预览即换票：旧票不在册挂着（防反复预览把表挤满）
  {
    const W = boot(null, 'tp1_repv');
    const im = W.worldSeed.importPack(pk.pack);
    const p1 = W.worldSeed.initPreview(im.id, 0);
    const live1 = W.store.claimStat().live;
    const p2 = W.worldSeed.initPreview(im.id, 10);
    const live2 = W.store.claimStat().live;
    a(p1.ticket !== p2.ticket, 'v2159 B7a 重新预览换新票');
    a(live2 === live1, 'v2159 B7b 旧票被回收（在册数不随预览次数增长，实 ' + live1 + '→' + live2 + '）');
    const cf = W.worldSeed.initConfirm();
    a(cf.ok === true, 'v2159 B7c 新票可确认');
    a(W.store.get().meta.initFrom.variance === 10, 'v2159 B7d 装的是新票那份（variance=10）');
  }
}

// ── N 段：负控制（真源码内存副本破坏，两向自证）────────────────
function runNegative(a) {
  const storeSrc = read(REL_STORE);
  const wsSrc = read(REL_WS);

  // N1 破坏 store 的跨聊天判据 + 纪元判据 ⇒ 跨聊天确认放行（缺陷复现）
  //   为什么两处都要破坏：只破 foreign-chat 时，切聊天本身就推进了 epoch，
  //   于是确认被 stale-epoch 拦下 —— 看起来「门还在」，其实要治的那条已经没了。
  //   这正是本仓的「假绿」形态：判据被另一个判据顶替，破坏点却报绿。
  a(countOcc(storeSrc, ANCHOR_STORE_FOREIGN) === 1, 'v2159 N1 前提: store foreign-chat 锚点恰中 1 次');
  a(countOcc(storeSrc, ANCHOR_STORE_EPOCH) === 1, 'v2159 N1 前提: store stale-epoch 锚点恰中 1 次');
  const b1 = storeSrc.replace(ANCHOR_STORE_FOREIGN, 'if (false) {').replace(ANCHOR_STORE_EPOCH, 'if (false) {');
  a(b1 !== storeSrc, 'v2159 N1a 破坏副本已生成（内存态，真源码不动）');
  const pk1 = newPack();
  {
    // 原版同款判据：跨聊天被拒
    const W = boot(null, 'tp1_n1_orig');
    const im = W.worldSeed.importPack(pk1.pack);
    W.worldSeed.initPreview(im.id, 0);
    switchChat(W, 'tp1_n1_origB');
    a(W.worldSeed.initConfirm().reason === 'foreign-chat',
      'v2159 N1b 原版判据成立：跨聊天 ⇒ foreign-chat');
  }
  {
    // 破坏版：跨聊天被放行，B 被装上 A 的种子（缺陷形态重现）
    //   先在 B 植入同 id 种子，摘掉「B 的库里没有这颗种子」这条**偶然**判据 ——
    //   否则缺陷被 unknown-seed 顶替，破坏不可观测（假绿）。
    const W = boot(ov(REL_STORE, b1), 'tp1_n1_broken');
    const im = W.worldSeed.importPack(pk1.pack);
    W.worldSeed.initPreview(im.id, 0);
    switchChat(W, 'tp1_n1_brokenB');
    graftSeed(W, im.id, 'deadbeef');
    const cf = W.worldSeed.initConfirm();
    a(cf.ok === true, 'v2159 N1c 破坏后跨聊天确认被放行（缺陷重现，实 ' + (cf.reason || 'ok') + '）');
    a(!!W.store.get().meta.initFrom, 'v2159 N1d 破坏后 B 被写入了 A 的种子（静默跨聊天污染）');
  }

  // N2 破坏 worldSeed 的归属结算**函数体**（不是调用点）⇒ 两条真源同时失效。
  //   只把调用点改成 null 是**假绿**：那会掉进无 store 票据时的回落分支，而回落自比三面
  //   同样能拒 —— 破坏没改行为，判据却「过了」。所以破坏点必须落在唯一的归属判据上。
  a(countOcc(wsSrc, ANCHOR_SETTLE_OWN) === 1, 'v2159 N2 前提: 归属结算函数锚点恰中 1 次');
  a(countOcc(wsSrc, ANCHOR_STORE_FOREIGN) === 0, 'v2159 N2 前提: 三面自比只此一处（store 判据不在本文件）');
  const b2 = wsSrc.replace(ANCHOR_SETTLE_OWN, 'function settleOwnership(opt) { return null; /* BROKEN */');
  a(b2 !== wsSrc, 'v2159 N2a 破坏副本已生成');
  const pk2 = newPack();
  {
    const W = boot(ov(REL_WS, b2), 'tp1_n2_broken');
    const im = W.worldSeed.importPack(pk2.pack);
    W.worldSeed.initPreview(im.id, 0);
    switchChat(W, 'tp1_n2_brokenB');
    graftSeed(W, im.id, 'deadbeef');
    const cf = W.worldSeed.initConfirm();
    a(cf.ok === true, 'v2159 N2b 破坏后归属复核形同虚设（跨聊天确认被放行，实 ' + (cf.reason || 'ok') + '）');
    a(!!W.store.get().meta.initFrom, 'v2159 N2c 破坏后 B 被写入（污染可见）');
  }

  // N3 破坏「预览后种子被删」判据 ⇒ 无出处的计划照样装进世界
  a(countOcc(wsSrc, ANCHOR_UNKNOWN_SEED_IF) === 1, 'v2159 N3 前提: 出处检查锚点恰中 1 次');
  const b3 = wsSrc.replace(ANCHOR_UNKNOWN_SEED_IF, 'if (false) {');
  a(b3 !== wsSrc, 'v2159 N3a 破坏副本已生成');
  const pk3 = newPack();
  {
    const W = boot(ov(REL_WS, b3), 'tp1_n3_broken');
    const im = W.worldSeed.importPack(pk3.pack);
    W.worldSeed.initPreview(im.id, 0);
    W.worldSeed.drop(im.id);
    const cf = W.worldSeed.initConfirm();
    a(cf.ok === true, 'v2159 N3b 破坏后「种子已删」不再拦（无出处的计划被装进世界，实 ' + (cf.reason || 'ok') + '）');
  }
  {
    // 原版同款判据
    const W = boot(null, 'tp1_n3_orig');
    const im = W.worldSeed.importPack(pk3.pack);
    W.worldSeed.initPreview(im.id, 0);
    W.worldSeed.drop(im.id);
    a(W.worldSeed.initConfirm().reason === 'unknown-seed',
      'v2159 N3c 原版判据成立：种子已删 ⇒ unknown-seed');
  }

  // N8 真源码逐字未变（破坏只在内存副本）
  a(read(REL_STORE) === storeSrc, 'v2159 N8a store 真源码逐字未变');
  a(read(REL_WS) === wsSrc, 'v2159 N8b world-seed 真源码逐字未变');
}

function runAll(a) { runA(a); runB(a); }
function runLockOnly(a) { runB(a); }
module.exports = { runAll, runA, runB, runNegative, runLockOnly,
  ANCHOR_CLAIM_ASYNC, ANCHOR_SETTLE_ASYNC, ANCHOR_SETTLE_OWN, ANCHOR_CLAIM_CALL,
  ANCHOR_OWN_CALL, ANCHOR_UNKNOWN_SEED_IF, ANCHOR_INNER_EMPTY };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) {
    if (cond) { pass++; } else { fail++; console.log('  x ' + msg); }
  };
  const m = process.argv[2] || 'all';
  try {
    if (m === 'negative') { runNegative(a); }
    else if (m === 'lock') { runLockOnly(a); }
    else { runAll(a); runNegative(a); }
  } catch (e) { fail++; console.log('  x 抛出：' + e.message + '\n' + (e.stack || '')); }
  console.log('S3-TP1-V2159: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}