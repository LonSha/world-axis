#!/usr/bin/env node
// WorldAxis tests/settle-v2810.js -- events scheduling-discipline lock (v2.81.0)
//
// 第十五面：排期 ≠ 触发。锁的是 engines/events.js 的核心判据——不是它在跑，而是它**守得住**：
//   ① 认领是唯一触发闸（claim 后 due/claim 不再拿到它 ⇒ 同一事件不会重复执行）；
//   ② 条件未满足状态零变化（condition-unmet 不落盘、不入失败队列，与执行失败严格分开）；
//   ③ 未认领就回报 ⇒ not-claimed 拒收（防「没认领就宣称做完」）；
//   ④ 排期不改写既有事件（duplicate 拒收，不静默覆盖）；
//   ⑤ 容量只数活动态（终态是历史，不挡新排期；满则拒收 capacity）；
//   ⑥ replace 不用同 id 覆盖（旧@时刻 留「被替换过」的事实）；
//   ⑦ 受控收窄（非字符串字段走 missing-fields，不 String() 静默升格）；
//   ⑧ stat() 交回 faults 副本（读面不泄漏内部台账）。
// 每条判据两向自证：真源码先成绿（N2），就地破坏后现形（N1），锚点逐字取自 events.js 且恰 1 次（N0）。
// 接线核验（A 面）：events.rows / events.failQueue 为 per-call 站点、store 骨架含 events、
//   render.SOURCES 与 evict 站点声明三处同步登记。
// 本文件不落任何持久痕迹（N5 哨兵扫描）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2810_';

// ── 破坏锚点（必须逐字取自 engines/events.js，各恰 1 次）──
const A_CLAIM      = "x.status = 'claimed';";
const A_READY      = "return x.status === 'pending' && isFinite(x.scheduledAt) && t >= x.scheduledAt;";
const A_DUP        = "if (dup) { out = { ok: false, reason: 'duplicate', id: id, status: dup.status }; return false; }";
const A_CAP        = "if (live >= cfg.maxRows) { out = { ok: false, reason: 'capacity', live: live, max: cfg.maxRows }; return false; }";
const A_NOTCLAIMED = "if (x.status !== 'claimed') { out = { ok: false, reason: 'not-claimed', id: rid, status: x.status }; return false; }";
const A_REPL       = "id: str(patch2.id, 40) || (rid + '@' + clockNow('events')),";
const A_STR        = "if (typeof v !== 'string') return '';";
const A_FAULTS     = "faults: Object.assign({}, stat.faults),";
const A_BLOCKNOTE  = "条件未满足时必须停住，不得替它提前完成；已认领未回报的事件不得重复触发。";

const BROKEN = [
  { key: 'claim',      from: A_CLAIM,      to: "/* claim disabled */" },
  { key: 'ready',      from: A_READY,      to: "return false;" },
  { key: 'dup',        from: A_DUP,        to: "if (false) { out = { ok: false, reason: 'duplicate', id: id, status: dup.status }; return false; }" },
  { key: 'cap',        from: A_CAP,        to: "if (false) { out = { ok: false, reason: 'capacity', live: live, max: cfg.maxRows }; return false; }" },
  { key: 'notclaimed', from: A_NOTCLAIMED, to: "if (false) { out = { ok: false, reason: 'not-claimed', id: rid, status: x.status }; return false; }" },
  { key: 'replace',    from: A_REPL,       to: "id: str(patch2.id, 40) || rid," },
  { key: 'str',        from: A_STR,        to: "return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim().slice(0, max || 60);" },
  { key: 'faults',     from: A_FAULTS,     to: "faults: stat.faults," },
  { key: 'blocknote',  from: A_BLOCKNOTE,  to: "（破坏：注记被移除）" }
];
const REL = 'engines/events.js';

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function on(WA, patch) {
  // 每段开始先复位容器：同一 WA 实例跨段共享，前段的待办会顶掉本段的活动态名额
  //   （曾把 [5] 的「腾出名额」与 [9] 的「active()[0]」判成假失败——是前置未清，不是产品缺陷）。
  try { WA.store.transact(function (d) { d.events = { rows: [], failQueue: [] }; }, TAG + 'reset'); } catch (e) {}
  WA.events.setSettings(Object.assign({ enabled: true, maxRows: 24, maxRuns: 12, maxFails: 12, retryDelayMs: 0, maxRetries: 2 }, patch || {}));
}
function snapshotLS() {
  const out = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) out[k] = LS.getItem(k); }
  return out;
}
function restoreLS(snap) {
  const drop = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
}
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i); if (k === null) continue;
    let v = ''; try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  ov.__brokenSrc = ov[REL];
  ov.__origSrc = src;
  return ov;
}
function anchorHits(spec) { return fs.readFileSync(path.join(BASE, REL), 'utf8').split(spec.from).length - 1; }
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw'; } }; }
function probeWith(spec, fn) { return isolated(function () { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }); }
function probeClean(fn) { return isolated(function () { return guarded(fn)(fresh()); }); }
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

// ── 探针（返回判据的症状值）──
function probeClaimGate(WA) {
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'g1', title: '唯一闸', kind: 'once', at: t });
  const c1 = WA.events.claim(t);
  const d2 = WA.events.due(t);
  return c1.count + ':' + d2.count;   // 原版 1:0
}
function probeReady(WA) {
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'r1', title: '到期', kind: 'once', at: t });
  return String(WA.events.due(t).count);   // 原版 1；ready 破坏 0
}
function probeDup(WA) {
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'd1', title: '排期', kind: 'once', at: t });
  return WA.events.schedule({ id: 'd1', title: '排期2', kind: 'once', at: t + 1 }).reason || 'ok';   // 原版 duplicate
}
function probeCap(WA) {
  on(WA, { maxRows: 1 }); const t = Date.now();
  WA.events.schedule({ id: 'c1', title: 'A', kind: 'once', at: t });
  return WA.events.schedule({ id: 'c2', title: 'B', kind: 'once', at: t }).reason || 'ok';   // 原版 capacity
}
function probeNotClaimed(WA) {
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'n1', title: '回报', kind: 'once', at: t });
  return WA.events.complete('n1', { ok: true }).reason || 'ok';   // 原版 not-claimed
}
function probeReplace(WA) {
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'p1', title: '旧', kind: 'once', at: t });
  const rp = WA.events.replace('p1', { at: t + 5000 });
  const rows = WA.store.get().events.rows;
  const hasOld = rows.some(function (x) { return x.id === 'p1' && x.status === 'cancelled' && x.cancelReason === 'replaced'; });
  const hasNew = rows.some(function (x) { return x.id !== 'p1' && String(x.id).indexOf('p1@') === 0; });
  return (rp.ok === true && hasOld && hasNew) ? 'new-id' : 'overwrite';   // 原版 new-id
}
function probeStr(WA) {
  on(WA);
  return WA.events.schedule({ id: 123, title: { a: 1 }, kind: 'once' }).reason || 'ok';   // 原版 missing-fields
}
function probeFaults(WA) {
  on(WA, { enabled: false });
  WA.events.schedule({ id: 'f1', title: 'x', kind: 'once' });
  const st = WA.events.stat();
  const saw = (st.faults && st.faults.disabled) || 0;
  if (st.faults) st.faults.__polluted = 1;
  const after = WA.events.stat();
  return (after.faults && after.faults.__polluted) ? 'leaked' : ('ok' + (saw > 0 ? '1' : '0'));   // 原版 ok1
}
function probeBlockNote(WA) {
  on(WA); const t = Date.now() + 5000;
  WA.events.schedule({ id: 'b1', title: '未来事', kind: 'once', at: t });
  const blk = WA.events.buildBlock();
  return (blk.indexOf('不得写成已发生') >= 0 && blk.indexOf('不得重复触发') >= 0) ? 'noted' : 'unnoted';   // 原版 noted
}
function probeSiteDecl(WA) {
  const d = WA.evict.siteDecls();
  return ((d['events.rows'] || {}).cap === 'per-call' && (d['events.failQueue'] || {}).cap === 'per-call') ? 'percall' : 'not-percall';
}
function probeStoreSkeleton(WA) {
  const m = WA.store.get().events;
  return (m && Array.isArray(m.rows) && Array.isArray(m.failQueue)) ? 'materialized' : 'missing';
}
function probeSources(WA) {
  return ((WA.render && WA.render.SOURCES) || []).indexOf('events') >= 0 ? 'registered' : 'missing';
}

// ── 正向判据（真源码上必须为真）──
function judge(a) {
  const WA = fresh();
  const IFACE = ['KINDS', 'ACTIVE', 'TERMINAL', 'schedule', 'due', 'claim', 'complete', 'cancel', 'replace', 'active', 'fails', 'buildBlock', 'stat', 'getSettings', 'setSettings'];
  a(!!WA.events && IFACE.every(function (k) { return WA.events[k] !== undefined; }), 'v2810/ev: 事件调度接口面齐备（15 项）');
  a(JSON.stringify(WA.events.KINDS) === JSON.stringify(['once', 'delayed', 'repeat', 'conditional']), 'v2810/ev: 四种排期语义白名单');
  a(WA.events.ACTIVE.indexOf('claimed') >= 0 && WA.events.TERMINAL.indexOf('failed') >= 0
    && WA.events.ACTIVE.every(function (k) { return WA.events.TERMINAL.indexOf(k) < 0; }), 'v2810/ev: 活动态/终态穷尽互斥（claimed 单列）');

  // ① 认领唯一闸
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'A1', title: '要点', kind: 'once', at: t });
  const c1 = WA.events.claim(t);
  a(c1.ok === true && c1.count === 1, 'v2810/ev: [1] 到点可认领 1 件');
  a(WA.events.due(t).count === 0, 'v2810/ev: [1] 认领后 due 不再给（唯一闸生效）');
  a(WA.events.claim(t).count === 0, 'v2810/ev: [1] 再 claim 拿不到第二次（不重复执行）');
  a(WA.store.get().events.rows.filter(function (x) { return x.id === 'A1'; })[0].status === 'claimed', 'v2810/ev: [1] 认领把 pending 标成 claimed');
  a(c1.items[0].payload !== WA.store.get().events.rows.filter(function (x) { return x.id === 'A1'; })[0].payload, 'v2810/ev: [1] 读面逐字段拷贝（不回传活引用，v2.79.0 面 B）');

  // ② 条件未满足：状态零变化，且与执行失败分离
  on(WA); const t2 = Date.now();
  WA.events.schedule({ id: 'A2', title: '条件事', kind: 'conditional', condition: 'flag', at: t2 });
  const cl = WA.events.claim(t2);
  a(cl.blocked.length === 1 && cl.blocked[0].reason === 'condition-unmet', 'v2810/ev: [2] 条件未足报 condition-unmet 且进 blocked');
  const zrow = WA.store.get().events.rows.filter(function (x) { return x.id === 'A2'; })[0];
  a(zrow.status === 'pending' && zrow.claimedAt === 0 && zrow.retries === 0, 'v2810/ev: [2] 条件未足状态零变化（不落盘、不计重试）');
  a(WA.store.get().events.failQueue.length === 0, 'v2810/ev: [2] 条件未足不入失败队列（与执行失败严格分开）');
  a(WA.events.stat().conditionMisses >= 1, 'v2810/ev: [2] 条件未足单独计量 conditionMisses');
  WA.events.claim(t2, { metConditions: ['flag'] });
  a(WA.store.get().events.rows.filter(function (x) { return x.id === 'A2'; })[0].status === 'claimed', 'v2810/ev: [2] 条件满足后可认领');
  const dmiss = WA.events.due(t2, { metConditions: [] });
  a(dmiss.count === 0 && dmiss.blocked.length === 0, 'v2810/ev: [2] 已认领者不进 due（既不候也不 blocked）');

  // ③ 未认领回报拒收 + 失败重试 + 失败队列 + 终态
  on(WA); const t3 = Date.now();
  WA.events.schedule({ id: 'A3', title: '会炸', kind: 'once', at: t3 });
  const nc = WA.events.complete('A3', { ok: true });
  a(nc.ok === false && nc.reason === 'not-claimed', 'v2810/ev: [3] 未认领回报 ⇒ not-claimed 拒收');
  WA.events.claim(t3);
  const cpl = WA.events.complete('A3', { ok: false, note: '第一次没成' });
  a(cpl.ok === true && cpl.status === 'pending' && cpl.retries === 1, 'v2810/ev: [3] 失败一次回 pending（重试）并记 retries');
  const fq = WA.store.get().events.failQueue;
  a(fq.length === 1 && fq[0].id === 'A3' && fq[0].retries === 1, 'v2810/ev: [3] 失败入 failQueue（答「上次为什么没成」）');
  a(WA.events.fails(5).length === 1 && WA.events.fails(5)[0].note === '第一次没成', 'v2810/ev: [3] fails() 读出失败原因');
  WA.events.claim(t3 + 99999);
  const cpl2 = WA.events.complete('A3', { ok: false, note: '又没成' });
  a(cpl2.status === 'failed' && cpl2.failed === true, 'v2810/ev: [3] 到 maxRetries(2) 转终态 failed');
  a(WA.events.stat().failed >= 1, 'v2810/ev: [3] failed 单独计量');

  // ④ 排期不改写既有事件
  on(WA); const t4 = Date.now();
  WA.events.schedule({ id: 'A4', title: '原件', kind: 'once', at: t4, payload: { k: 1 } });
  const du = WA.events.schedule({ id: 'A4', title: '覆盖企图', kind: 'once', at: t4 + 999, payload: { k: 2 } });
  a(du.ok === false && du.reason === 'duplicate', 'v2810/ev: [4] 同 id 活动态再排期 ⇒ duplicate 拒收');
  const r4 = WA.store.get().events.rows.filter(function (x) { return x.id === 'A4'; })[0];
  a(r4.title === '原件' && r4.payload.k === 1, 'v2810/ev: [4] 既有事件未被改写（标题与载荷都原样）');

  // ⑤ 容量只数活动态
  on(WA, { maxRows: 1 }); const t5 = Date.now();
  WA.events.schedule({ id: 'A5a', title: 'A', kind: 'once', at: t5 });
  const cap = WA.events.schedule({ id: 'A5b', title: 'B', kind: 'once', at: t5 });
  a(cap.ok === false && cap.reason === 'capacity' && cap.max === 1, 'v2810/ev: [5] 活动态满 ⇒ capacity（报 live/max）');
  WA.events.claim(t5);
  WA.events.complete('A5a', { ok: true });      // A5a 转终态
  const cap2 = WA.events.schedule({ id: 'A5c', title: 'C', kind: 'once', at: t5 });
  a(cap2.ok === true, 'v2810/ev: [5] 终态是历史、不挡新排期（腾出名额）');

  // ⑥ replace 留痕
  on(WA); const t6 = Date.now();
  WA.events.schedule({ id: 'A6', title: '旧排期', kind: 'once', at: t6 });
  const rp = WA.events.replace('A6', { at: t6 + 5000 });
  a(rp.ok === true && rp.id !== 'A6' && String(rp.id).indexOf('A6@') === 0, 'v2810/ev: [6] replace 用新 id（旧id@时刻），不覆盖');
  const r6 = WA.store.get().events.rows;
  a(r6.some(function (x) { return x.id === 'A6' && x.status === 'cancelled' && x.cancelReason === 'replaced'; }), 'v2810/ev: [6] 旧排期留痕（cancelled/replaced，可查）');
  a(WA.events.replace('A6', {}).reason === 'not-active', 'v2810/ev: [6] 终态行不可再 replace ⇒ not-active');
  a(WA.events.stat().replaced >= 1, 'v2810/ev: [6] replaced 单独计量');

  // ⑦ 受控收窄（不静默升格）
  on(WA);
  a(WA.events.schedule({ id: 123, title: 'x', kind: 'once' }).reason === 'missing-fields', 'v2810/ev: [7] 非字符串 id ⇒ missing-fields（不 String() 升格）');
  a(WA.events.schedule({ id: 'x', title: { a: 1 }, kind: 'once' }).reason === 'missing-fields', 'v2810/ev: [7] 非字符串 title ⇒ missing-fields');
  a(WA.events.schedule({ id: 'x', title: 't', kind: 'nope' }).reason === 'bad-kind', 'v2810/ev: [7] 非法 kind ⇒ bad-kind');
  a(WA.events.schedule({ id: 'x', title: 't', kind: 'delayed' }).reason === 'bad-trigger', 'v2810/ev: [7] delayed 缺时刻 ⇒ bad-trigger');
  a(WA.events.schedule({ id: 'x', title: 't', kind: 'repeat', intervalMs: 0 }).reason === 'bad-trigger', 'v2810/ev: [7] repeat 非正间隔 ⇒ bad-trigger');
  a(WA.events.schedule({ id: 'x', title: 't', kind: 'conditional' }).reason === 'bad-trigger', 'v2810/ev: [7] conditional 缺 condition ⇒ bad-trigger');
  a(WA.events.schedule({ id: 'x', title: 't', kind: 'once', at: NaN }).reason === 'bad-time', 'v2810/ev: [7] 时刻非有限 ⇒ bad-time');
  a(WA.events.schedule({ id: 'x', title: 't', kind: 'once', priority: 99 }).reason === 'bad-priority', 'v2810/ev: [7] 优先级越界 ⇒ bad-priority');
  a(WA.events.getSettings().enabled === true && WA.events.getSettings().maxRows === 24, 'v2810/ev: [7] 设置面读回自洽');

  // ⑧ stat 交回副本
  on(WA, { enabled: false });
  WA.events.schedule({ id: 'z', title: 't', kind: 'once' });
  const s1 = WA.events.stat();
  a((s1.faults && s1.faults.disabled) >= 1, 'v2810/ev: [8] 故障入台账（disabled 被计量）');
  s1.faults.__polluted = 1;
  a(!WA.events.stat().faults.__polluted, 'v2810/ev: [8] stat 交回 faults 副本（写返回对象不污染内部台账）');

  // ⑨ 注入块与周期语义
  on(WA); const t9 = Date.now();
  WA.events.schedule({ id: 'A9', title: '周期事', kind: 'repeat', intervalMs: 1000, at: t9, priority: 7 });
  const blk = WA.events.buildBlock();
  a(blk.indexOf('[事件调度]') === 0 && blk.indexOf('不得写成已发生') > 0 && blk.indexOf('不得重复触发') > 0, 'v2810/ev: [9] 注入块明标「未到点 ≠ 已发生」与「不得重复触发」');
  a(blk.indexOf('P7') > 0 && blk.indexOf('周期 1000ms') > 0, 'v2810/ev: [9] 注入块带优先级与周期进度');
  WA.events.claim(t9);
  WA.events.complete('A9', { ok: true });
  const a9 = WA.store.get().events.rows.filter(function (x) { return x.id === 'A9'; })[0];
  a(a9.status === 'pending' && a9.runs === 1 && a9.scheduledAt > a9.claimedAt, 'v2810/ev: [9] repeat 成功后排下一次（runs++ 且退回 pending，下次时刻晚于本次认领）');
  for (let i = 0; i < 20; i++) {
    const act = WA.events.active()[0];
    if (!act) break;                    // 已 exhausted（终态不在 active）即停
    WA.events.claim(act.scheduledAt);
    WA.events.complete('A9', { ok: true });
  }
  a(WA.store.get().events.rows.filter(function (x) { return x.id === 'A9'; })[0].status === 'exhausted', 'v2810/ev: [9] repeat 达 maxRuns ⇒ exhausted 终态');
  a(WA.events.stat().exhausted >= 1, 'v2810/ev: [9] exhausted 单独计量');

  // ⑩ 排序与取消
  on(WA); const t10 = Date.now();
  WA.events.schedule({ id: 'B1', title: '低', kind: 'once', at: t10, priority: 1 });
  WA.events.schedule({ id: 'B2', title: '高', kind: 'once', at: t10, priority: 9 });
  WA.events.schedule({ id: 'B3', title: '中早', kind: 'once', at: t10 - 100, priority: 5 });
  const dd = WA.events.due(t10);
  a(dd.items[0].id === 'B2' && dd.items[1].id === 'B3', 'v2810/ev: [10] 定序：优先级高者先（再按到点早）');
  const cx = WA.events.cancel('B2', '不做了');
  a(cx.ok === true, 'v2810/ev: [10] 可显式取消');
  a(WA.events.cancel('B2', '再取消').reason === 'not-active', 'v2810/ev: [10] 终态行不可再取消（报告它已是什么状态）');
  a(WA.events.cancel('nope').reason === 'missing', 'v2810/ev: [10] 取消不存在者 ⇒ missing');

  // ⑪ 接线核验（三处同步登记）
  a(probeStoreSkeleton(WA) === 'materialized', 'v2810/ev: [11] store 骨架物化 events:{rows,failQueue}（冷启动直写不炸事务）');
  a(probeSources(WA) === 'registered', 'v2810/ev: [11] render.SOURCES 已登记 events（只加分支不加源表 = 开关点了零效果）');
  a(probeSiteDecl(WA) === 'percall', 'v2810/ev: [11] evict 两站点登记为 per-call（上限 = 设置，改设置不漂移）');
  const caps = WA.store.sizeCaps();
  a(!!caps['events.rows'] && !!caps['events.failQueue'], 'v2810/ev: [11] store 容量登记表双侧同源（不登记会被 sizeAudit 报 unbounded）');
  const es = WA.evict.evictStat();
  a(!(es.failedBy && es.failedBy['unknown-site']) && !(es.failedBy && es.failedBy['bad-cap']), 'v2810/ev: [11] 接线后零 unknown-site / bad-cap（站点名与传参都对得上）');
  const rp11 = WA.store.registryParity();
  a(rp11.ok === true && rp11.missing.length === 0, 'v2810/ev: [11] registryParity 绿（登记 ↔ 骨架一致）');
  a((rp11.checkedKeys || []).indexOf('events.rows') >= 0 && (rp11.checkedKeys || []).indexOf('events.failQueue') >= 0, 'v2810/ev: [11] 两容器进 registryParity 精确键');
  // 默认零行为变更：总开关默认关闭（须先清 LS——同一 WA 实例跨段共享，前段已把 enabled 写 true）
  LS.clear();
  WA.store.init();
  a(WA.events.getSettings().enabled === false, 'v2810/ev: [11] 总开关默认关闭');
  a(WA.events.schedule({ id: 'q', title: 't', kind: 'once' }).reason === 'disabled', 'v2810/ev: [11] 关闭时不排期（disabled 拒收）');
  a(WA.events.buildBlock() === '', 'v2810/ev: [11] 关闭时不注入（不产空块）');
}

// ── 负向自证（只在内存副本上破坏，零文件改写）──
function runNegative(a) {
  // N0 锚点唯一性 + 破坏真的改到源码（且只改这一处）
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2810/ev: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  BROKEN.forEach(function (s) {
    const ov = brokenOverride(s);
    a(ov[REL] !== ov.__origSrc && ov[REL].length === ov.__origSrc.length - (s.from.length - s.to.length), 'v2810/ev: [N0] 破坏真的改变了源码且只改这一处 :: ' + s.key);
  });
  // N1 逐条现形
  a(probeWith(BROKEN[B.claim], probeClaimGate) !== '1:0', 'v2810/ev: [N1] 认领写状态移除 ⇒ 事件永远停在 pending（唯一闸失效）');
  a(probeWith(BROKEN[B.ready], probeReady) === '0', 'v2810/ev: [N1] 到期判定移除 ⇒ 到点也不进 due（纯读面空转）');
  a(probeWith(BROKEN[B.dup], probeDup) === 'ok', 'v2810/ev: [N1] 重复守卫移除 ⇒ 同 id 被静默覆盖');
  a(probeWith(BROKEN[B.cap], probeCap) === 'ok', 'v2810/ev: [N1] 容量守卫移除 ⇒ 待办无界增长（拒绝变成静默接受）');
  a(probeWith(BROKEN[B.notclaimed], probeNotClaimed) === 'ok', 'v2810/ev: [N1] 认领校验移除 ⇒ 没认领也能宣称做完');
  a(probeWith(BROKEN[B.replace], probeReplace) === 'overwrite', 'v2810/ev: [N1] 新 id 生成移除 ⇒ 同 id 覆盖，答不出「原本排在什么时候」');
  a(probeWith(BROKEN[B.str], probeStr) === 'ok', 'v2810/ev: [N1] 类型收窄移除 ⇒ 非字符串被 String() 静默升格（参数错被记成世界事实）');
  a(probeWith(BROKEN[B.faults], probeFaults) === 'leaked', 'v2810/ev: [N1] faults 副本移除 ⇒ 写返回对象污染内部台账');
  a(probeWith(BROKEN[B.blocknote], probeBlockNote) === 'unnoted', 'v2810/ev: [N1] 注入注记移除 ⇒ 「未到点 ≠ 已发生」的约束不再随块下发');
  // N2 真源码上同一批判据为真
  a(probeClean(probeClaimGate) === '1:0', 'v2810/ev: [N2] 原版认领即唯一次（due 归零）');
  a(probeClean(probeReady) === '1', 'v2810/ev: [N2] 原版到点进 due');
  a(probeClean(probeDup) === 'duplicate', 'v2810/ev: [N2] 原版报 duplicate');
  a(probeClean(probeCap) === 'capacity', 'v2810/ev: [N2] 原版报 capacity');
  a(probeClean(probeNotClaimed) === 'not-claimed', 'v2810/ev: [N2] 原版报 not-claimed');
  a(probeClean(probeReplace) === 'new-id', 'v2810/ev: [N2] 原版 replace 用新 id 并留痕');
  a(probeClean(probeStr) === 'missing-fields', 'v2810/ev: [N2] 原版拒收非字符串字段');
  a(probeClean(probeFaults) === 'ok1', 'v2810/ev: [N2] 原版 stat 交回副本且故障已计量');
  a(probeClean(probeBlockNote) === 'noted', 'v2810/ev: [N2] 原版注入带两条约束注记');
  // N3 隔离性：破坏的可见面恰好是本判据——接线声明不受影响
  a(probeWith(BROKEN[B.claim], probeSiteDecl) === 'percall', 'v2810/ev: [N3] 认领语义破坏不影响 evict 站点声明');
  a(probeWith(BROKEN[B.cap], probeStoreSkeleton) === 'materialized', 'v2810/ev: [N3] 容量守卫破坏不影响 store 骨架物化');
  a(probeWith(BROKEN[B.str], probeSources) === 'registered', 'v2810/ev: [N3] 类型收窄破坏不影响 SOURCES 登记');
  // N4 真状态改变（判据非恒真）
  const chg = isolated(function () {
    const WA = fresh();
    on(WA); const t = Date.now();
    WA.events.schedule({ id: 'N4', title: 'x', kind: 'once', at: t });
    const before = WA.store.get().events.rows[0].status;
    WA.events.claim(t);
    const after = WA.store.get().events.rows[0].status;
    return before + '>' + after;
  });
  a(chg === 'pending>claimed', 'v2810/ev: [N4] 认领真的改变了持久状态（判据非恒真）');
  // N5 哨兵不泄漏
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2810/ev: [N5] 哨兵未泄漏（' + (leak.join(',') || 'none') + '）');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2810: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2810: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };
