#!/usr/bin/env node
// WorldAxis tests/s3-b1-o2-v2185.js — 跨模块原子提交专锁（v2.185.0，计划 O2 第一条验收）
//
// ── 本锁治的病（回到计划 O2 原文）──────────────────────────────
//   O2：「定义五条固定跨模块场景链，每条要求至少两个引擎在**同一候选草稿**内结算……
//   链内共用候选与执行上下文；**不可同草稿执行的公开写口不得嵌套调用**。」
//   验收第一条：「**链中第二步抛错时世界不半写**」。
//
//   立项探针（本仓现场）实证了三种真实失效：
//     ① **半写**：`freight.dispatch` 先扣源库存、再发现容量满而返回 false。单独跑没事
//        （顶层 draft 被 pop），嵌在外层 mutator 里跑时扣减留在**外层 draft** 上，
//        外层提交 ⇒ 源库存 980→975 而单据没建。这正是「第二步拒绝、世界半写」。
//     ② **同一入口两种形状**：A 模式写口（`return WA.store.transact(...)`，diplomacy 六处
//        + evolution 两处）把**事务回执**当场返回，业务回执在 `.result` 里 ——
//        调用方读 `r.id` / `r.stage` 全得 undefined（面板成功时打印
//        「提案已立 undefined（undefined）」）；嵌套时还多一个 `deferred` 信封。
//     ③ **假的已提交结论**：`WA.commit.commit` 被嵌在别人 mutator 里时，回执随外层事务
//        而落盘，但旧版照报 `{ok:true, written:true}`。
//
// ── 判据分四层（按「静默失效」代价排序）──────────────────────────
//   A 保存点（本版核心）：内层返回 false / 抛错 ⇒ **原地撤回**它写下的东西，
//     而**外层自己此前的改动静默保留**（回滚到「内层开始前」，不是「外层开始前」）；
//     成功的内层照常入账（修复不得误伤正当路径）。
//   B 两级计数：嵌套失败可被诊断读出（nestedAborted / nestedErrors / nestedRolled /
//     lastNested），且**嵌套中止仍计入顶层 aborted**（v0.1.33 / v0.1.34 的冻结口径）。
//   C 半写两向对照：同一夹具顶层拒收 vs 嵌套拒收，世界必须同形。
//   D 口形一致：A 模式写口对调用方一律回业务回执（不再回事务信封）；
//     `commit.commit` 在嵌套下不再假称已提交。
//   N 负控制：真源码内存副本破坏，两向自证（锚点恰中一次 / 原版同判据成立 / 破坏版现形）。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL_STORE = 'core/store.js';
const REL_COMMIT = 'core/commit.js';
const REL_DIP = 'engines/diplomacy.js';
const REL_EVO = 'engines/evolution.js';

function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function countOcc(src, needle) { return src.split(needle).length - 1; }
function sha(rel) { return crypto.createHash('sha256').update(read(rel)).digest('hex').slice(0, 16); }
function J(x) {
  //   `JSON.stringify(undefined)` 返回的是 **undefined 值**、不是字符串 'undefined' ——
  //   直接用它做 `p6 === 'undefined'` 这类判据会恒假（本版实测踩过一次）。故归一到字符串。
  try { const s = JSON.stringify(x); return (s === undefined) ? 'undefined' : s; } catch (e) { return String(x); }
}

/** 信封四键：A 模式写口**不应**再向调用方透出它们。 */
function hasEnvelope(r) {
  if (!r || typeof r !== 'object') return false;
  return ('persisted' in r) || ('applied' in r) || ('deferred' in r) || ('result' in r);
}

/** 夹具：两个真引擎都开、货运容量刚好满、源库存 100。 */
function build(ov) {
  const WA = sync.fresh({ files: [], srcOverride: ov || {} }).WA;
  WA.store.init();
  WA.store.transact(function (d) {
    d.evolution = { factions: [{ name: 'A盟' }, { name: 'B邦' }] };
    d.diplomacy = { pairs: {}, proposals: {}, seq: 0 };
    d.economy = {
      goods: [{ place: 'A城', resource: '粮', stock: 100, base: 10 }],
      routes: [{ id: 'r1', from: 'A城', to: 'B城', status: 'open', cost: 2, lane: 'x' }]
    };
    d.freight = { shipments: [] };
    for (let i = 0; i < 4; i++) d.freight.shipments.push({ id: 's' + i, status: 'transit' });
    return true;
  });
  WA.diplomacy.setSettings({ enabled: true });
  WA.freight.setSettings({ enabled: true, maxShipments: 4 });
  return WA;
}
function stockOf(WA) {
  const g = (WA.store.get().economy.goods || []).filter(function (x) { return x.place === 'A城'; })[0];
  return g ? g.stock : null;
}
function proposalCount(WA) {
  return Object.keys((WA.store.get().diplomacy || {}).proposals || {}).length;
}

// ══ A 保存点 ══════════════════════════════════════════════════════
function probeRollbackAbort(WA) {
  const r = WA.store.transact(function (d) {
    d.probe = { outerKept: 'yes' };
    const inner = WA.store.transact(function (dd) { dd.probe.innerWrote = 'leak'; return false; });
    return { innerOk: inner.ok, innerAborted: inner.aborted === true, innerDeferred: inner.deferred === true,
      innerNested: inner.nested === true, rolledBack: inner.rolledBack === true };
  });
  return { outerOk: r.ok === true, inner: r.result,
    probe: J(WA.store.get().probe) };
}
function probeRollbackThrow(WA) {
  const r = WA.store.transact(function (d) {
    d.probe2 = { kept: 1 };
    const inner = WA.store.transact(function (dd) { dd.probe2.wrote = 2; throw new Error('o2-boom'); });
    return { innerOk: inner.ok, rolledBack: inner.rolledBack === true, msg: (inner.error && inner.error.message) || '' };
  });
  return { outerOk: r.ok === true, inner: r.result, probe: J(WA.store.get().probe2) };
}
function probeRollbackNestedDepth(WA) {
  // 三层：**最外**层被拒 ⇒ 只撤最外层，中间层已提交的那一层保留。
  //   为什么要这一条：保存点的恢复点是「进来时的 outer」，故被拒的那一层写下的东西一格不留，
  //   而它**里面已经成功的那一层**是外层自己的改动，必须静默保留（过度回滚与半写同罪）。
  WA.store.transact(function (d) {
    d.p1 = { a: 1 };
    WA.store.transact(function (d2) {
      d2.p1.b = 2;
      WA.store.transact(function (d3) { d3.p1.c = 3; return false; });   // 最内层被拒
    });
  });
  return { afterInnerAbort: J(WA.store.get().p1) };
}
function probeRollbackNestedDepth2(WA) {
  // 三层：**中间**层被拒 ⇒ 最外层（它外面的那一层）的写入保留。这才是「只撤被拒那一层」的正证。
  WA.store.transact(function (d) {
    d.p1 = { a: 1 };
    const mid = WA.store.transact(function (d2) {
      d2.p1.b = 2;
      WA.store.transact(function (d3) { d3.p1.c = 3; return false; });   // 最内层被拒 ⇒ 撤它
      return false;                                                      // 中间层自己也拒 ⇒ 撤中间层
    });
    d.p1.midSaw = (mid.aborted === true && mid.rolledBack === true);
  });
  return { afterMidAbort: J(WA.store.get().p1) };
}
function probeRollbackSuccess(WA) {
  WA.store.transact(function (d) {
    d.p3 = {};
    WA.store.transact(function (dd) { dd.p3.ok = 1; });
  });
  return J(WA.store.get().p3);
}

// ══ B 计数 ════════════════════════════════════════════════════════
function probeCounts(WA) {
  WA.store.resetTxStat();
  WA.store.transact(function (d) {
    d.p4 = {};
    WA.store.transact(function (dd) { dd.p4.x = 1; return false; });
    WA.store.transact(function (dd) { dd.p4.y = 1; throw new Error('e'); });
    WA.store.transact(function (dd) { dd.p4.z = 1; });
  });
  const t = WA.store.txStat();
  return { count: t.count, ok: t.ok, aborted: t.aborted, errors: t.errors, deferred: t.deferred,
    nestedAborted: t.nestedAborted, nestedErrors: t.nestedErrors, nestedRolled: t.nestedRolled,
    lastWhy: (t.lastNested || {}).why, lastRolled: (t.lastNested || {}).rolledBack };
}
function probeCountsReset(WA) {
  WA.store.resetTxStat();
  const t = WA.store.txStat();
  return { nAb: t.nestedAborted, nErr: t.nestedErrors, nRolled: t.nestedRolled, last: t.lastNested,
    aborted: t.aborted, errors: t.errors };
}

// ══ C 半写两向对照 ════════════════════════════════════════════════
function probeHalfWriteTop(WA) {
  const r = WA.freight.dispatch('r1', 'A城', '粮', 5, { transitDays: 3, base: 10 });
  return { ok: r.ok === true, reason: r.reason || null, stock: stockOf(WA), ships: WA.store.get().freight.shipments.length };
}
function probeHalfWriteNested(WA) {
  const r = WA.store.transact(function () {
    const a = WA.diplomacy.propose({ from: 'A盟', to: 'B邦', terms: [{ term: 'trade', days: null }] });
    const b = WA.freight.dispatch('r1', 'A城', '粮', 5, { transitDays: 3, base: 10 });
    return { aOk: a.ok === true, aId: typeof a.id, bOk: b.ok === true, bReason: b.reason || null };
  });
  return { outerOk: r.ok === true, inner: r.result, stock: stockOf(WA),
    ships: WA.store.get().freight.shipments.length, proposals: proposalCount(WA) };
}

// ══ D 口形一致 ════════════════════════════════════════════════════
function probePortShapeTop(WA) {
  const r = WA.diplomacy.propose({ from: 'A盟', to: 'B邦', terms: [{ term: 'trade', days: null }] });
  return { ok: r.ok === true, idKind: typeof r.id, stage: r.stage, envelope: hasEnvelope(r),
    refusalIsPlain: (function () {
      const n = WA.diplomacy.propose({ from: 'A盟', to: 'A盟', terms: [{ term: 'trade', days: null }] });
      return n.ok === false && n.reason === 'same-faction' && !hasEnvelope(n);
    })() };
}
function probePortShapeNested(WA) {
  const r = WA.store.transact(function () {
    const p = WA.diplomacy.propose({ from: 'A盟', to: 'B邦', terms: [{ term: 'trade', days: null }] });
    const n = WA.diplomacy.propose({ from: 'A盟', to: 'A盟', terms: [{ term: 'trade', days: null }] });
    const w = WA.evolution.addWind({ topic: 'o2锁风声', content: '内容', level: 2 });
    const e = WA.evolution.addEvent({ name: 'o2锁事件', type: 'conflict', level: 1 });
    return { idKind: typeof p.id, stage: p.stage, pEnvelope: hasEnvelope(p),
      refusal: (n.ok === false ? n.reason : 'NOT-REFUSED'), refusalEnvelope: hasEnvelope(n),
      windShape: (w === undefined || w === null) ? 'undefined' : (hasEnvelope(w) ? 'envelope' : 'plain'),
      evShape: (e === undefined || e === null) ? 'undefined' : (hasEnvelope(e) ? 'envelope' : 'plain') };
  });
  return r.result;
}
function probeCommitNested(WA) {
  const b = WA.commit.begin('o2lock#nested', { site: 'o2lock' });
  const r = WA.store.transact(function (d) {
    d.p6 = {};
    const inner = WA.commit.commit(b.chain, function (dd) { dd.p6.written = 1; return true; });
    throw new Error('o2-outer-boom');   // 外层整体失败 ⇒ 世界与回执都不该留
  });
  return { outerOk: r.ok === true, inner: r.result,
    receipts: WA.commit.stat().receipts, fault: (WA.commit.stat().faults || {})['nested-deferred'] || 0,
    p6: J(WA.store.get().p6) };
}

// ══ A–D 判据 ══════════════════════════════════════════════════════
function runAll(a) {
  // A 结构面（真源码）
  const storeSrc = read(REL_STORE);
  a(countOcc(storeSrc, 'const __sp = ') === 1 && countOcc(storeSrc, 'const __restoreOuter = function () {') === 1,
    'v2185/o2 A0: 嵌套分支有保存点与恢复函数各一处（实 ' + countOcc(storeSrc, 'const __sp = ')
      + ' / ' + countOcc(storeSrc, 'const __restoreOuter = function () {') + '）');
  a(countOcc(storeSrc, 'const rolled = __restoreOuter();') === 2,
    'v2185/o2 A0: 两条失败路径（false / 抛错）都先恢复再拒收（实 '
      + countOcc(storeSrc, 'const rolled = __restoreOuter();') + ' 处）');
  a(storeSrc.indexOf('const __nestedMutated') < 0,
    'v2185/o2 A0: 旧「探针位」已离场（__nestedMutated 不得残留）');
  const dipSrc = read(REL_DIP), evoSrc = read(REL_EVO);
  a(countOcc(dipSrc, 'WA.store.transact(') === 6 && countOcc(dipSrc, 'return rx(WA.store.transact(') === 6,
    'v2185/o2 A0: diplomacy 仍恰六处 transact，且六处都经 rx 解包（实 '
      + countOcc(dipSrc, 'WA.store.transact(') + ' / ' + countOcc(dipSrc, 'return rx(WA.store.transact(') + '）');
  a(countOcc(evoSrc, 'return rx(WA.store.transact(') === 2,
    'v2185/o2 A0: evolution 两个写口都经 rx 解包（实 ' + countOcc(evoSrc, 'return rx(WA.store.transact(') + '）');

  // A 行为面
  const WA1 = build();
  const rb = probeRollbackAbort(WA1);
  a(rb.outerOk, 'v2185/o2 A1: 内层被拒不影响外层提交');
  a(rb.inner.innerAborted && rb.inner.innerDeferred && rb.inner.innerNested && rb.inner.rolledBack,
    'v2185/o2 A1: 内层拒收回执带 aborted/deferred/nested/rolledBack（实 ' + J(rb.inner) + '）');
  a(rb.probe === J({ outerKept: 'yes' }),
    'v2185/o2 A1: **内层已撤回、外层此前改动静默保留**（实 ' + rb.probe + '）');
  const rt = probeRollbackThrow(WA1);
  a(rt.outerOk && rt.inner.innerOk === false && rt.inner.rolledBack && rt.inner.msg === 'o2-boom',
    'v2185/o2 A2: 内层抛错同样撤回且如实透出错误（实 ' + J(rt.inner) + '）');
  a(rt.probe === J({ kept: 1 }), 'v2185/o2 A2: 抛错路径内层写入一格不留（实 ' + rt.probe + '）');
  a(probeRollbackSuccess(WA1) === J({ ok: 1 }),
    'v2185/o2 A3: 成功的内层照常入账（修复不得误伤正当路径）');
  a(probeRollbackNestedDepth(WA1).afterInnerAbort === J({ a: 1, b: 2 }),
    'v2185/o2 A4: 三层嵌套最内层被拒 ⇒ 只撤最内层（外层两层写入保留）');
  a(probeRollbackNestedDepth2(WA1).afterMidAbort === J({ a: 1, midSaw: true }),
    'v2185/o2 A4b: 中间层被拒 ⇒ 连它写的 b 一起撤，最外层保留（不越界回滚）');

  // B 计数
  const WA2 = build();
  const c = probeCounts(WA2);
  a(c.count === 4 && c.ok === 1 && c.deferred === 1,
    'v2185/o2 B1: 1 外层 + 3 内层全额计量（实 ' + J(c) + '）');
  a(c.aborted === 1 && c.errors === 1,
    'v2185/o2 B1: **嵌套中止仍计入顶层 aborted/errors**（v0.1.33/34 冻结口径，实 aborted='
      + c.aborted + ' errors=' + c.errors + '）');
  a(c.nestedAborted === 1 && c.nestedErrors === 1 && c.nestedRolled === 2,
    'v2185/o2 B2: 嵌套失败另有二级计数（实 nAb=' + c.nestedAborted + ' nErr=' + c.nestedErrors
      + ' nRolled=' + c.nestedRolled + '）');
  a(c.lastWhy === 'threw' && c.lastRolled === true,
    'v2185/o2 B2: lastNested 记最近一次归因与是否已撤回（实 why=' + c.lastWhy + ' rolled=' + c.lastRolled + '）');
  const cz = probeCountsReset(WA2);
  a(cz.nAb === 0 && cz.nErr === 0 && cz.nRolled === 0 && cz.last === null && cz.aborted === 0 && cz.errors === 0,
    'v2185/o2 B3: resetTxStat 把新字段一并清零（实 ' + J(cz) + '）');

  // C 半写两向对照
  const WA3 = build();
  const top = probeHalfWriteTop(WA3);
  a(top.ok === false && top.reason === 'shipments-full' && top.stock === 100 && top.ships === 4,
    'v2185/o2 C1: 顶层容量满拒收：源库存不动（对照；实 ' + J(top) + '）');
  const WA4 = build();
  const nested = probeHalfWriteNested(WA4);
  a(nested.outerOk === true && nested.inner.aOk === true && nested.inner.bOk === false
    && nested.inner.bReason === 'shipments-full',
    'v2185/o2 C2: 同草稿内两步：提案成、货运独立被拒（实 ' + J(nested.inner) + '）');
  a(nested.stock === 100 && nested.ships === 4 && nested.proposals === 1,
    'v2185/o2 C3: **第二步拒绝时世界不半写**（源库存 100 不动、在途仍 4、提案 1；实 stock='
      + nested.stock + ' ships=' + nested.ships + ' proposals=' + nested.proposals + '）');
  a(nested.inner.aId === 'string' && nested.inner.aId !== 'undefined',
    'v2185/o2 C3: 嵌套下提案仍给出业务 id（A 模式解包；实 ' + nested.inner.aId + '）');

  // D 口形一致
  const WA5 = build();
  const pt = probePortShapeTop(WA5);
  a(pt.ok && pt.idKind === 'string' && pt.stage === 'proposed' && pt.envelope === false,
    'v2185/o2 D1: 顶层 propose 回**业务回执**（有 id/stage、无信封；实 ' + J(pt).slice(0, 120) + '）');
  a(pt.refusalIsPlain, 'v2185/o2 D1: 顶层业务拒收回 {ok:false, reason} 且无信封');
  const WA6 = build();
  const pn = probePortShapeNested(WA6);
  a(pn.idKind === 'string' && pn.stage === 'proposed' && pn.pEnvelope === false,
    'v2185/o2 D2: 嵌套 propose 与顶层同形（实 ' + J(pn).slice(0, 140) + '）');
  a(pn.refusal === 'same-faction' && pn.refusalEnvelope === false,
    'v2185/o2 D2: 嵌套业务拒收与顶层同形（实 ' + pn.refusal + '）');
  a(pn.windShape !== 'envelope' && pn.evShape !== 'envelope' && pn.windShape !== 'undefined' && pn.evShape !== 'undefined',
    'v2185/o2 D3: evolution 两写口回的是**真业务回执**（既不是信封、也不是被解包成 undefined；实 wind='
      + pn.windShape + ' event=' + pn.evShape + '）');
  const WA7 = build();
  const cc = probeCommitNested(WA7);
  a(cc.outerOk === false && cc.receipts === 0 && cc.p6 === 'undefined' && cc.fault >= 1,
    'v2185/o2 D4: 嵌套 commit 在外层失败时**世界与回执都不留**（实 outerOk=' + cc.outerOk + ' receipts=' + cc.receipts
      + ' p6=' + cc.p6 + ' fault=' + cc.fault + '）');
  // 另一半：同一场景外层**成功**时，回执随外层提交落盘 ⇒ 旧版那句「已提交」恰好对
  const WA8 = build();
  const b8 = WA8.commit.begin('o2lock#nested2', { site: 'o2lock' });
  const cc8 = WA8.store.transact(function (d) {
    d.p7 = {};
    WA8.commit.commit(b8.chain, function (dd) { dd.p7.written = 1; return true; });
    return true;
  });
  a(cc8.ok === true && WA8.commit.stat().receipts === 1
    && (WA8.commit.replay('o2lock#nested2') || {}).ok === true,
    'v2185/o2 D4b: 外层成功时回执随外层落盘（如实报 written:false 但世界与回执都真提交了；实 receipts='
      + WA8.commit.stat().receipts + '）');

  // 兼容面：本版不得改动既有事务契约措辞
  a(countOcc(storeSrc, "if (result === false) { __tx.pop(); recTx(clockWall() - t0, 'aborted'); return { ok: false, aborted: true };") === 1,
    'v2185/o2 E1: 顶层 transact 的既有中止契约逐字未动');
  a(countOcc(storeSrc, 'return { ok: true, deferred: true, state: outer, result };') === 1,
    'v2185/o2 E1: 嵌套成功回执的 `deferred` 契约仍在（v0.1.34 冻结口径）');
}

// ══ N 负控制：真源码破坏，两向自证 ═════════════════════════════════
function runNegative(a) {
  const files0 = fs.readdirSync(path.join(BASE, 'tests')).sort().join(',');
  const hStore = sha(REL_STORE), hDip = sha(REL_DIP), hEvo = sha(REL_EVO), hCommit = sha(REL_COMMIT);

  // N0 锚点恰中一次
  const storeSrc = read(REL_STORE);
  const A_SP = 'const __sp = (function () { try { return cloneDraft(outer); } catch (e) {';
  const A_RX = '    if (tx && typeof tx === \'object\' && tx.result && typeof tx.result === \'object\') return tx.result;';
  a(countOcc(storeSrc, A_SP) === 1, 'v2185/o2 N0: 保存点锚点在真源码恰 1 次（实 ' + countOcc(storeSrc, A_SP) + '）');
  a(countOcc(read(REL_DIP), A_RX) === 1, 'v2185/o2 N0: rx 解包锚点在 diplomacy 恰 1 次（实 ' + countOcc(read(REL_DIP), A_RX) + '）');

  // N1 真源码破坏①：保存点失效（cloneDraft 退回 null）⇒ A1/A2 的「一格不留」必须现形
  const broken1 = storeSrc.split(A_SP).join('const __sp = (function () { try { return null; } catch (e) {');
  a(broken1 !== storeSrc, 'v2185/o2 N1: 破坏①真的改动了源码文本');
  const WA1 = build({ [REL_STORE]: broken1 });
  const rb1 = probeRollbackAbort(WA1);
  a(rb1.probe !== J({ outerKept: 'yes' }),
    'v2185/o2 N1: 无保存点 ⇒ 内层半写留在外层草稿上（判据现形；实 ' + rb1.probe + '）');
  const rn1 = probeHalfWriteNested(WA1);
  a(rn1.stock !== 100,
    'v2185/o2 N1: 无保存点 ⇒ 第二步拒绝时源库存被扣（实 stock=' + rn1.stock + '，原版 100）');

  // N2 真源码破坏②：rx 解包失效 ⇒ D1/D2 的「无信封」必须现形
  const dipSrc = read(REL_DIP);
  const broken2 = dipSrc.split(A_RX).join('    if (false && tx) return tx.result;');
  a(broken2 !== dipSrc, 'v2185/o2 N2: 破坏②真的改动了源码文本');
  const WA2 = build({ [REL_DIP]: broken2 });
  const pt2 = probePortShapeTop(WA2);
  a(pt2.envelope === true || pt2.idKind !== 'string' || !pt2.ok,
    'v2185/o2 N2: 不解包 ⇒ 顶层 propose 透出事务信封（实 ' + J(pt2).slice(0, 120) + '）');

  // N3 判据纯度：原版上同款判据必须为真
  const WA3 = build();
  a(probeRollbackAbort(WA3).probe === J({ outerKept: 'yes' })
    && probeHalfWriteNested(build()).stock === 100 && probePortShapeTop(build()).envelope === false,
    'v2185/o2 N3: 原版上三条主判据全真（判据纯度：不是「破坏才现形」的恒假）');

  // N4 无副作用：真文件逐字未变 / 测试目录未被污染
  a(sha(REL_STORE) === hStore && sha(REL_DIP) === hDip && sha(REL_EVO) === hEvo && sha(REL_COMMIT) === hCommit,
    'v2185/o2 N4: 四个被破坏过的文件**真源码逐字未变**（破坏只发生在内存副本上）');
  a(fs.readdirSync(path.join(BASE, 'tests')).sort().join(',') === files0,
    'v2185/o2 N4: 测试目录未被污染（无临时/备份文件）');
  const surf = require('./test-surface-gate.js').scan({});
  a(surf.locks.indexOf('tests/s3-b1-o2-v2185.js') >= 0,
    'v2185/o2 N4: 本锁真在可达面里（不是孤儿）');
  a(surf.orphans.indexOf('tests/s3-b1-o2-v2185.js') < 0, 'v2185/o2 N4: 本锁不在孤儿名单里');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { require('./mock.js'); require('./ui-gate-sync.js').fresh({}); runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('S3-B1-O2-V2185: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('S3-B1-O2-V2185: pass (' + pass + ')');
}
