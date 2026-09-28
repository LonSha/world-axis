// WorldAxis tests/store-commit-v2113.js (v2.113.0) — 事务提交语义专锁（计划一 A1）
//
// 治的病（回）：
//   ① **被拒的改动后来自己落盘了**。旧的写闸门只在 `save()` 里，而批内 `transact` 早已把
//      候选推进 `memCache` 并置脏；批退出那句 `this.save()` **不看返回值**（`save` 失败是
//      `return false`，不抛），且其前一行已把 `dirty` 清掉 ⇒ 被拒的改动留在内存里，等下一次
//      普通保存顺带提交。「拒绝」只对那一次保存成立，对世界不成立。
//   ② **批的完成状态不可判定**。`ok:true` 与「真的落盘了」之间没有任何可读区分；
//      落盘失败只体现在日志里，调用方与诊断都读不到。
//   ③ **「保护没启用」与「保护开着且放行」同形**。两者此前都是 `null`，读数上分不出来。
//
// 口径备注（两条都是踩过的坑，写在这里防后人重踩）：
//   · 探针必须 **真 await** `batch()`。不是 await 的批体走微任务，
//     `batch()` 的 finally 会晚于探针返回——最典型的后果是「读到的批结论永远是 null」，
//     而那看起来和「功能没实现」一模一样。
//   · 比较内存态要用 `r.state`（事务草稿的形状）或 `store.get()` 的**整体 JSON**，
//     不要对树里某个字段做子串匹配：内存态是写回过的权威引用，不是草稿对象的别名。
//
// 判据（全部在真装载面上跑真 API，零文件改写）：
//   B 行为：无 write 位的单次/批内写入**既不进内存也不落盘**；批落盘失败 ⇒ `lastFlush` 给结论、
//     内存退回上一个确认落盘的代；跨纪元批 ⇒ `lastFlush.reason='orphaned-epoch'` 且内存一并丢弃；
//     `gateStat().off` 单独计数。
//   N 负控制：**真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据**（每条锚点恰中 1 次）。
//   C 不变式：判据纯只读（连跑后源码逐字未变）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const REL = 'core/store.js';
const PERM = 'core/permissions.js';

// ── 锚点（在目标文件里恰中 1 次；本文件里也恰声明 1 次）──
const ANCHORS = {
  batchedFlush: { rel: REL, txt: 'persisted = (this.save() === true)' },
  preGate: { rel: REL, txt: 'const preDeny = gateBeforeChange();' },
  commitGate: { rel: REL, txt: 'const commitDeny = gateBeforeChange({ atCommit: true });' },
  orphanDrop: { rel: REL, txt: "reason: 'orphaned-epoch'" },
  offCount: { rel: PERM, txt: '_gatesOff++;' }
};

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function allReplace(src, from, to) { return src.split(from).join(to); }
/** 源码覆盖表——**域名必须是真实相对路径**。写成 `{ REL: src }` 会变成一个叫 'REL' 的
 *  假文件名，于是覆盖静默落空、负控制退化成「在真源码上跑同款判据」（假绿）。 */
function over(rel, src) { const o = {}; o[rel] = src; return o; }
function breakOnce(src, from, to, label) {
  const out = allReplace(src, from, to);
  if (out === src) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
function env(srcOverride) { return require('./ui-gate-sync.js').fresh({ srcOverride: srcOverride || {} }); }
function seed(St) { St.transact(function (d) { d.meta = d.meta || {}; d.meta.base = 1; return true; }); }
// 当前聊天那把键**现场取**（`store.chatId()` 是真源）。写死 `worldaxis_state_test_chat_001`
// 在单跑时对，但在全量回归里会**静默读错键**：前面的块会把 mock 的 chatId 改掉且不保证还原，
// 于是「磁盘上有」永远为假 —— 判据恒假，却看起来只是「功能没生效」。
function diskOf(WA, St) {
  try { return String(WA.mainWin.localStorage.getItem('worldaxis_state_' + St.chatId())); }
  catch (e) { return ''; }
}
function memOf(St) { return JSON.stringify(St.get()); }
/** 临时把宿主存储打成「写入即抛」；必须在批退出**之前**打上、跑完立刻还原。
 *  只在一次探针内部使用，且配 finally 还原（宿主态在本仓是跳 section 共享的）。 */
async function withStorageBroken(WA, fn) {
  const ls = WA.mainWin.localStorage;
  const keepSet = ls.setItem, keepGet = ls.getItem, keepRm = ls.removeItem;
  ls.setItem = function () { throw new Error('a1lock: quota exceeded'); };
  try { return await fn(); }
  finally { ls.setItem = keepSet; ls.getItem = keepGet; ls.removeItem = keepRm; }
}

// ── 探针 1：无 write 位的写入（单次 / 批内 / 退出会话后授权）──
async function probeDeny() {
  const e = env(null);
  const WA = e.WA, St = WA.store, Pm = WA.permissions;
  seed(St);
  Pm.grant('a1-viewer', 'viewer');          // viewer 角色无 write 位
  Pm.session('a1-viewer');
  const mem0 = memOf(St);
  const r1 = St.transact(function (d) { d.meta.denied1 = 1; return true; });
  const memAfterR1 = memOf(St);
  const flush0 = St.batchStat().flushes;
  let inBatch = null;
  await St.batch(async function () { inBatch = St.transact(function (d) { d.meta.denied2 = 1; return true; }); });
  const memAfterBatch = memOf(St);
  const bs = St.batchStat();
  const diskAfterBatch = diskOf(WA, St);
  Pm.session('');                            // 退出会话：闸门随之关闭
  const r3 = St.transact(function (d) { d.meta.allowed = 1; return true; });
  const diskAfterAllowed = diskOf(WA, St);
  return {
    r1: r1, memUnchangedAfterReject: memAfterR1 === mem0,
    inBatch: inBatch, memUnchangedAfterBatch: memAfterBatch === mem0,
    flushes: bs.flushes - flush0, lastFlush: bs.lastFlush || null, depth: bs.depth, orphaned: bs.orphaned,
    deniedOnDisk: diskAfterBatch.indexOf('denied1') >= 0 || diskAfterBatch.indexOf('denied2') >= 0,
    r3: r3, allowedOnDisk: diskAfterAllowed.indexOf('"allowed":1') >= 0,
    gate: Pm.gateStat()
  };
}

// ── 探针 2：批退出落盘失败 ⇒ 结论可读 + 内存退回 ──
async function probeBatchFlushFail() {
  const e = env(null);
  const WA = e.WA, St = WA.store;
  seed(St);
  const mem0 = memOf(St);
  const disk0 = diskOf(WA, St);
  let threw = null;
  // 先把存储打坏，再跑批：批内只推进内存（不落盘），失败发生在**批退出那一次 save**。
  await withStorageBroken(WA, async function () {
    try {
      await St.batch(async function () { St.transact(function (d) { d.meta.uncommitted = 1; return true; }); });
    } catch (err) { threw = err.message; }
  });
  const bs = St.batchStat();
  return { threw: threw, lastFlush: bs.lastFlush || null, depth: bs.depth, dirty: bs.dirty,
    saveStat: St.saveStat(), memRolledBack: memOf(St) === mem0, diskUnchanged: diskOf(WA, St) === disk0,
    memHasUncommitted: memOf(St).indexOf('uncommitted') >= 0 };
}

// ── 探针 3：跨纪元批退出 ⇒ 结论可读 + 内存也被丢弃 ──
async function probeOrphan(e) {
  const env0 = e || env(null);
  const WA = env0.WA, St = WA.store;
  seed(St);
  const mem0 = memOf(St);
  let threw = null;
  try {
    await St.batch(async function () {
      St.transact(function (d) { d.meta.inflight = 1; return true; });
      St.init();                                  // 批进行中切聊天
      throw new Error('a1lock: orphaned-batch');  // 原样上抛，但 finally 已把结论落地
    });
  } catch (err) { threw = err.message; }
  const bs = St.batchStat();
  return { threw: threw, lastFlush: bs.lastFlush || null, depth: bs.depth, orphaned: bs.orphaned,
    memRolledBack: memOf(St) === mem0, inflightInMem: memOf(St).indexOf('inflight') >= 0 };
}

// ── 探针 4：「保护没启用」单独可数 ──
function probeGateOff(srcOverride) {
  const e = env(srcOverride || null);
  const Pm = e.WA.permissions;
  Pm.reset();
  const g0 = Pm.gateStat();
  Pm.gate('write'); Pm.gate('write');           // 无人登记当前使用者 ⇒ 放行，但必须计入 off
  const g1 = Pm.gateStat();
  Pm.grant('a1-holder', 'editor'); Pm.session('a1-holder');
  Pm.gate('write');                              // 现在闸门真在挡位（active）
  const g2 = Pm.gateStat();
  Pm.session('');
  return { off0: g0.off, off1: g1.off, active1: g1.active, gates1: g1.gates,
    off2: g2.off, active2: g2.active, user2: g2.user };
}

// ── 探针 5：闸门自身抛错 ⇒ 必须 fail-open（不因闸门异常而写不出去）──
async function probeGateThrow() {
  const e = env(null);
  const WA = e.WA, St = WA.store, Pm = WA.permissions;
  seed(St);
  const keepGate = Pm.gate;
  Pm.gate = function () { throw new Error('a1lock: gate exploded'); };
  let r = null, threw = null;
  try { r = St.transact(function (d) { d.meta.gateThrew = 1; return true; }); } catch (err) { threw = err.message; }
  Pm.gate = keepGate;
  return { r: r, threw: threw, onDisk: diskOf(WA, St).indexOf('gateThrew') >= 0 };
}

// ── 探针 6：配额耗尽（DOMException name 形态）⇒ 批退出结论如实归因 ──
async function probeQuotaAtBatchExit() {
  const e = env(null);
  const WA = e.WA, St = WA.store;
  seed(St);
  const mem0 = memOf(St);
  const ls = WA.mainWin.localStorage;
  const keepSet = ls.setItem;
  ls.setItem = function () { const err = new Error('a1lock: quota'); err.name = 'QuotaExceededError'; throw err; };
  let threw = null;
  try {
    await St.batch(async function () { St.transact(function (d) { d.meta.quotaBlocked = 1; return true; }); });
  } catch (err) { threw = err.message; }
  const lf = St.batchStat().lastFlush || null;
  const saveReason = St.saveStat().reason;
  ls.setItem = keepSet;
  return { threw: threw, lastFlush: lf, saveReason: saveReason, memRolledBack: memOf(St) === mem0 };
}

// ── 探针 7：mutator 抛错 ⇒ 未提交（内存未变、无落盘）──
async function probeMutatorThrow() {
  const e = env(null);
  const WA = e.WA, St = WA.store;
  seed(St);
  const mem0 = memOf(St);
  const disk0 = diskOf(WA, St);
  let r = null, threw = null;
  try { r = St.transact(function () { throw new Error('a1lock: mutator exploded'); }); } catch (err) { threw = err.message; }
  const after = memOf(St);
  return { r: r, threw: threw, memUnchanged: after === mem0, diskUnchanged: diskOf(WA, St) === disk0 };
}

// ── 探针 8：批中权限改变 ⇒ **提交时**的权限态才是判据 ──
//  两个方向各测一次：
//    ① 入口无用户（放行）→ mutator 内登记一个无 write 位的 viewer → 提交前复检必须拦下；
//    ② 入口 viewer（拒）→ mutator 内退出会话 → 变更根本不会发生（前置检查已拦）。
async function probeMidBatchPermissionChange() {
  const e = env(null);
  const WA = e.WA, St = WA.store, Pm = WA.permissions;
  seed(St);
  Pm.reset();
  Pm.grant('a1-mid', 'viewer');
  let inBatch = null;
  await St.batch(async function () {
    inBatch = await St.transact(function (d) {
      Pm.session('a1-mid');            // 变更开始后、提交之前的权限改变
      d.meta.midChange = 1;
      return true;
    });
  });
  const memAfter = memOf(St);
  const bs = St.batchStat();
  Pm.session('');
  return { inBatch: inBatch, memHasMidChange: memAfter.indexOf('midChange') >= 0,
    lastFlush: bs.lastFlush || null, flushes: bs.flushes, onDisk: diskOf(WA, St).indexOf('midChange') >= 0 };
}

// ── 探针 9：保存重试（写后读回校验失败重试一次）与批结论互不干扰 ──
async function probeSaveRetry() {
  const e = env(null);
  const WA = e.WA, St = WA.store;
  seed(St);
  const ls = WA.mainWin.localStorage;
  const keepSet = ls.setItem, keepGet = ls.getItem;
  const store = {};
  let writes = 0;
  ls.setItem = function (k, v) { writes += 1; if (writes === 1) { store[k] = String(v).slice(0, 10); } else { store[k] = String(v); } };
  ls.getItem = function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; };
  let lf = null;
  try {
    await St.batch(async function () { St.transact(function (d) { d.meta.retried = 1; return true; }); });
    lf = St.batchStat().lastFlush || null;
  } finally { ls.setItem = keepSet; ls.getItem = keepGet; }
  return { writes: writes, lastFlush: lf, lastSaveOk: St.saveStat().ok };
}

// ── runAll：真源码上必须为真 ──
async function runAll(a) {
  // A 结构：锚点在位、各恰 1 次
  Object.keys(ANCHORS).forEach(function (k) {
    const hit = rd(ANCHORS[k].rel).split(ANCHORS[k].txt).length - 1;
    a(hit === 1, 'A1lock/A: 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + hit + '）');
  });

  // B1–B4 被拒写入：不进内存、不落盘；退出会话后授权写照常
  const d = await probeDeny();
  a(d.r1 && d.r1.ok === false && d.r1.denied === true && d.r1.applied === false && d.r1.persisted === false,
    'A1lock/B1: 无 write 位的单次 transact 如实拒收（实 '
    + JSON.stringify(d.r1 && { ok: d.r1.ok, denied: d.r1.denied, applied: d.r1.applied, reason: d.r1.reason }) + '）');
  a(d.memUnchangedAfterReject,
    'A1lock/B1: 被拒的单次改动不进内存（内存未变 ' + d.memUnchangedAfterReject + '）');
  a(!!d.inBatch && d.inBatch.denied === true && d.inBatch.batched !== true,
    'A1lock/B2: 批内被拒不再返回「已批合并」（实 '
    + JSON.stringify(d.inBatch && { ok: d.inBatch.ok, denied: d.inBatch.denied, batched: d.inBatch.batched }) + '）');
  a(d.memUnchangedAfterBatch && !d.deniedOnDisk,
    'A1lock/B2: 批内被拒的改动**既不进内存也不在批退出时落盘**（内存未变 ' + d.memUnchangedAfterBatch
    + ' / 磁盘有 ' + d.deniedOnDisk + '）——这正是 E1 的现场');
  a(d.flushes === 0 && d.lastFlush === null,
    'A1lock/B2: 整批全被拒 ⇒ 一次落盘都不发生、也不自称有过结论（flush ' + d.flushes + ' / lastFlush ' + JSON.stringify(d.lastFlush) + '）');
  a(d.r3 && d.r3.ok === true && d.allowedOnDisk,
    'A1lock/B3: 退出会话后授权写照常落盘（r3 ok ' + (d.r3 && d.r3.ok) + ' / 磁盘有 ' + d.allowedOnDisk + '）');
  a(d.gate && d.gate.denied >= 2 && d.gate.off >= 1,
    'A1lock/B4: 闸门读数可分辨（拒 ' + (d.gate && d.gate.denied) + ' / 未启用而放行 ' + (d.gate && d.gate.off) + '）');

  // B5 批退出落盘失败：结论可读 + 内存退回
  const f = await probeBatchFlushFail();
  a(f.lastFlush && f.lastFlush.ok === false && typeof f.lastFlush.reason === 'string' && f.lastFlush.reason.length > 0,
    'A1lock/B5: 批退出落盘失败 ⇒ batchStat().lastFlush 给出结论与归因（实 ' + JSON.stringify(f.lastFlush) + '）'
    + '——此前这个结论只写在日志里，面板与调用方都读不到');
  a(f.lastFlush && f.lastFlush.safe === true && f.memRolledBack && !f.memHasUncommitted && f.diskUnchanged,
    'A1lock/B5: 未落盘的批候选从内存退回上一个已确认落盘的代（safe ' + (f.lastFlush && f.lastFlush.safe)
    + ' / 回退 ' + f.memRolledBack + ' / 残留 ' + f.memHasUncommitted + ' / 磁盘未变 ' + f.diskUnchanged + '）');

  // B6 跨纪元批：结论可读 + 内存也被丢弃
  const o = await probeOrphan(null);
  a(o.lastFlush && o.lastFlush.reason === 'orphaned-epoch' && o.lastFlush.ok === false,
    'A1lock/B6: 跨纪元批退出给出 orphaned-epoch（实 ' + JSON.stringify(o.lastFlush) + '）');
  a(o.memRolledBack && !o.inflightInMem,
    'A1lock/B6: 跨纪元批的候选**同时**从内存丢弃（回退 ' + o.memRolledBack + '）——旧形态只丢落盘，声明与事实不一致');

  // B7 「没启用」单独可数
  const g = probeGateOff();
  a(g.off0 === 0 && g.off1 === 2 && g.active1 === false,
    'A1lock/B7: 未启用而放行单独计数（0→' + g.off1 + '，active ' + g.active1 + '）——此前与「查过且允许」同形');
  a(g.active2 === true && g.user2 === 'a1-holder' && g.off2 === 2,
    'A1lock/B7: 登记当前使用者后闸门标活、off 不再增长（active ' + g.active2 + ' / off ' + g.off2 + '）');

  // B8 闸门抛错 ⇒ fail-open
  const gt = await probeGateThrow();
  a(gt.threw === null && gt.r && gt.r.ok === true && gt.onDisk,
    'A1lock/B8: 闸门自身抛错时 fail-open、不把「写不出去」当成结果（抛 ' + gt.threw + ' / ok '
    + (gt.r && gt.r.ok) + ' / 落盘 ' + gt.onDisk + '）——与 permissions 的 fail-open 同一条纪律');

  // B9 配额耗尽（DOMException 形态）在批退出被如实归因
  const q = await probeQuotaAtBatchExit();
  a(q.saveReason === 'quota' && q.lastFlush && q.lastFlush.ok === false && q.lastFlush.reason === 'quota',
    'A1lock/B9: 配额耗尽在批退出被归到 quota（saveStat ' + q.saveReason + ' / lastFlush '
    + JSON.stringify(q.lastFlush) + '）');
  a(q.memRolledBack,
    'A1lock/B9: 且该批候选从内存退回（回退 ' + q.memRolledBack + '）——配额救援失败后不得留下「看起来已提交」的内存态');

  // B10 mutator 抛错 ⇒ 未提交
  const mt = await probeMutatorThrow();
  a(mt.threw === null && mt.r && mt.r.ok === false && mt.memUnchanged && mt.diskUnchanged,
    'A1lock/B10: mutator 抛错 ⇒ 返回失败且内存/磁盘均不变（实 ' + JSON.stringify({ threw: mt.threw, ok: mt.r && mt.r.ok })
    + ' / 内存未变 ' + mt.memUnchanged + ' / 磁盘未变 ' + mt.diskUnchanged + '）');

  // B11 批中权限改变 ⇒ 提交时权限态才是判据
  const mc = await probeMidBatchPermissionChange();
  a(mc.inBatch && mc.inBatch.ok === false && mc.inBatch.denied === true && !mc.memHasMidChange && !mc.onDisk,
    'A1lock/B11: 变更开始后登记的无权限使用者仍在**提交前**被拦下（实 '
    + JSON.stringify(mc.inBatch && { ok: mc.inBatch.ok, denied: mc.inBatch.denied }) + ' / 内存有 ' + mc.memHasMidChange
    + ' / 磁盘有 ' + mc.onDisk + '）——只查变更前的话这一段就是漏洞');

  // B12 保存重试与批结论互不干扰
  const rt = await probeSaveRetry();
  a(rt.writes >= 2 && rt.lastFlush && rt.lastFlush.ok === true && rt.lastSaveOk === true,
    'A1lock/B12: 写后读回校验失败后重试成功 ⇒ 结论写照常为 ok（写 ' + rt.writes + ' 次 / lastFlush '
    + JSON.stringify(rt.lastFlush) + '）——结论字段不得把「重试过一次」误报为失败');

  // C 纯只读
  const before = rd(REL) + rd(PERM);
  await probeDeny(); probeGateOff();
  a(rd(REL) + rd(PERM) === before, 'A1lock/C: 判据纯只读（连跑后源码逐字未变）');
}

// ── runNegative：真源码破坏 ⇒ 同款判据必须现形 ──
async function runNegative(a) {
  const S = rd(REL);
  const P0 = rd(PERM);

  // N1 退回旧形态：**不看落盘返回值**（`persisted` 恒真）
  //   破坏形态刻意取「自称成功」而不是「删掉那一段」：删行会留下悬空 else（语法错），
  //   而旧形态的真实样子正是「把没落盘的那一次当成落盘了」——候选留在内存、结论还写着 ok。
  const n1 = breakOnce(S, ANCHORS.batchedFlush.txt, 'persisted = ((this.save()), true) === true', 'N1');
  const e1 = env(over(REL, n1));
  const St1 = e1.WA.store;
  seed(St1);
  const mem1 = memOf(St1);
  await withStorageBroken(e1.WA, async function () {
    try { await St1.batch(async function () { St1.transact(function (d) { d.meta.uncommitted = 1; return true; }); }); }
    catch (err) { /* 预期：落盘异常上抛 */ }
  });
  const lf1 = St1.batchStat().lastFlush;
  a(!(lf1 && lf1.ok === false),
    'A1lock/N1: 不看返回值 ⇒ 结论自称成功（实 ' + JSON.stringify(lf1) + '）——B5 的 ok:false 不是恒真');
  a(memOf(St1) !== mem1 && memOf(St1).indexOf('uncommitted') >= 0,
    'A1lock/N1: 且未落盘的批候选留在内存里（旧形态：内存推进了、盘上没有）——B5 的「回退」不是恒真');

  // N2 摘掉两处授权检查（退回旧形态：变更前后都不问）
  let n2 = breakOnce(S, ANCHORS.preGate.txt, 'const preDeny = null;', 'N2a');
  n2 = breakOnce(n2, ANCHORS.commitGate.txt, 'const commitDeny = null;', 'N2b');
  const e2 = env(over(REL, n2));
  const St2 = e2.WA.store, Pm2 = e2.WA.permissions;
  seed(St2);
  Pm2.grant('a1n2', 'viewer'); Pm2.session('a1n2');
  const r2 = St2.transact(function (d) { d.meta.deniedN2 = 1; return true; });
  a(r2.denied !== true && r2.ok === true,
    'A1lock/N2: 摘掉两处授权检查后，无 write 位的写入不再被拒（实 '
    + JSON.stringify({ ok: r2.ok, denied: r2.denied }) + '）——这正是「变更之后才发现没权限」的旧形态');
  a(!!r2.state && !!r2.state.meta && r2.state.meta.deniedN2 === 1,
    'A1lock/N2: 且该改动真进了候选（「拒收发生在变更之前」这句声明在副本上不成立）');

  // N3 摘掉跨纪元内存回退（只改码名，写点结构一字不动）
  const n3 = breakOnce(S, ANCHORS.orphanDrop.txt, "reason: 'orphaned-epoch-x'", 'N3');
  const o3 = await probeOrphan(env(over(REL, n3)));
  a(!!o3.lastFlush && o3.lastFlush.reason !== 'orphaned-epoch',
    'A1lock/N3: 改名后 orphaned-epoch 不再出现（实 ' + JSON.stringify(o3.lastFlush) + '）——B6 观测的是这个码本身');

  // N4 摘掉「未启用」计数
  const n4 = breakOnce(P0, ANCHORS.offCount.txt, '_gatesOff += 0;', 'N4');
  const g4 = probeGateOff(over(PERM, n4));
  a(g4.off1 === 0,
    'A1lock/N4: 摘掉计数后 off 恒 0（实 ' + g4.off1 + '）——B7 不是恒真');

  // N5 纯度：原版上同款判据必须为真，且真文件逐字未变
  const o = await probeOrphan(null);
  a(o.lastFlush && o.lastFlush.reason === 'orphaned-epoch',
    'A1lock/N5:（纯度）原版上跨纪元批给出 orphaned-epoch —— 两向自证成立');
  a(rd(REL) === S && rd(PERM) === P0, 'A1lock/N5:（纯度）全部负控制跑完后真文件逐字未变');
}

/** 异步感知的宿主全局还原（`restoring()` 对 async 函数会在 promise 落定**之前**就还原）。 */
function restoringAsync(fn) {
  return async function (a) { const win = global.window; try { return await fn(a); } finally { global.window = win; } };
}
module.exports = { ANCHORS: ANCHORS, runAll: restoringAsync(runAll), runNegative: restoringAsync(runNegative), REL: REL };
if (require.main === module) {
  let P = 0, F = 0;
  const a = function (c, m) { if (c) { P += 1; } else { F += 1; console.log('  x ' + m); } };
  (async function () {
    try { await runAll(a); } catch (e) { F += 1; console.log('  x 异常：' + (e && e.message)); }
    try { await runNegative(a); } catch (e) { F += 1; console.log('  x 负控制异常：' + (e && e.message)); }
    console.log('STORE-COMMIT-V2113: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
    process.exitCode = F === 0 ? 0 : 1;
  })();
}
