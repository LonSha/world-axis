#!/usr/bin/env node
// WorldAxis tests/events-a2-v2116.js -- A2 lock: 认领预算 / 所有权 / 租约 / 回执去重（v2.116.0）
//
// 规划 01 的 A2 第二段（任务预算与恢复协议）四处缺口，本锁各守一条：
//   ① **认领无预算**：一次 claim 把全部到点事件认领光，真实酒馆里那是几十个引擎同时开工；
//   ② **认领无所有权**：认领后那行不带「谁认领的」，多调用方之间的账对不上；
//   ③ **认领无租约**：崩一次 / 切一次聊天，行卡在 claimed——既不再进 due、也不是终态，
//      「正在执行」与「永远不会有人来执行」**同形**，那件事被静默丢掉且无读数可发现；
//   ④ **回执无稳定操作 id**：complete 只看「当前是不是 claimed」，任何重放都二次结算。
// 另守两条同源守卫：已回报的行不可再取消（做完 -> 取消会把已结算的事抹成没发生）、
//   终态清空 opId（否则台账老化后终态可被回卷重跑）。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
// 破坏只改内存副本（srcOverride），零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__a2v2116_';
const REL = 'engines/events.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_BUDGET = 'const take = Math.max(0, Math.min(budget, ready2.length));';
const A_OWNER  = 'x.owner = owner;';
const A_LEASE  = 'if (expired(x, t)) return true;';
const A_RECLAIM = 'if (!x || !expired(x, t)) return;';
const A_DUP    = 'if (key && e.res.some(function (q) { return q && sameId(q.opId, key); })) {';
const A_CANCEL = '//   会把**合法的取消**挡回去：周期事件从此不可取消。故已撤除，改为守住下面这句。\n      if (isTerminal(x)) { out = { ok: false, reason: \'not-active\', id: rid, status: x.status }; return false; }';
const A_OPID   = "x.opId = x.id + '@' + Math.floor(x.scheduledAt || 0) + '#' + x.claims;";
const BROKEN = [
  // ① 预算失效：退回 v2.115.0 的「一次搬空」
  { key: 'budget', from: A_BUDGET, to: 'const take = ready2.length;' },
  // ② 所有权失效：认领不再记录认领方
  { key: 'owner',  from: A_OWNER,  to: 'x.owner = String();' },
  // ③ 租约失效：到期行不再进**读面**候选（due 看不见它）
  { key: 'lease',  from: A_LEASE,  to: '' },
  // ③b 回收失效：认领时不再回收（**这是唯一能让崩溃后那件事重新被执行的路径**）
  { key: 'reclaim', from: A_RECLAIM, to: 'return;' },
  // ④ 去重失效：摘掉台账判据（任何重放都二次结算）
  { key: 'dup',    from: A_DUP,    to: 'if (false) {' },
  // ④b 已回报守卫失效：终态守卫被掏空 ⇒ 「做完 -> 取消」可把已结算的事抹成没发生
  { key: 'cancel', from: A_CANCEL, to: "if (false) { out = { ok: false, reason: 'not-active', id: rid, status: x.status }; return false; }" },
  // ④c 操作 id 失效：不按次重钉（opId 冻结成恒定值）⇒ 同一笔重放与「新一轮」撞名
  { key: 'opid',   from: A_OPID,   to: "x.opId = 'frozen-op';" }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function rowsOf(WA) { return (WA.store.get().events || {}).rows || []; }
function resOf(WA) { return (WA.store.get().events || {}).res || []; }
function rowOf(WA, id) { return rowsOf(WA).filter(function (x) { return x && x.id === id; })[0] || null; }
function on(WA, patch) {
  // 复位**原地清空**（不整体替换 d.events 对象）：本仓 fresh() 多实例共享底层 store，
  //   "d.events = {...}" 会把别段正在用的表从它脚下换掉。就地清空只动内容，不动引用。
  try { WA.store.transact(function (d) {
    if (!d.events || typeof d.events !== 'object' || Array.isArray(d.events)) d.events = { rows: [], failQueue: [], res: [] };
    d.events.rows = []; d.events.failQueue = []; d.events.res = [];
  }, TAG + 'reset'); } catch (e) {}
  WA.events.setSettings(Object.assign({ enabled: true, maxRows: 24, maxRuns: 12, maxFails: 12,
    retryDelayMs: 0, maxRetries: 2, maxClaims: 24, leaseMs: 0 }, patch || {}));
}
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  ov.__origSrc = src;
  return ov;
}
function anchorHits(spec) { return fs.readFileSync(path.join(BASE, REL), 'utf8').split(spec.from).length - 1; }
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw:' + (e && e.message); } }; }
function probeWith(spec, fn) { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }
function probeClean(fn) { return guarded(fn)(fresh()); }

// ── 探针：返回判据症状值 ──
// P1 认领预算：maxClaims=2 时一次最多取 2，超额者显式进 deferred
function probeBudget(WA) {
  on(WA, { maxClaims: 2 }); const t = Date.now();
  ['a', 'b', 'c', 'd'].forEach(function (k) { WA.events.schedule({ id: k, title: k, kind: 'once', at: t - 1000 }); });
  const c = WA.events.claim(t, { owner: 'panel' });
  const defIds = (c.deferred || []).map(function (x) { return x.id; }).sort().join(',');
  return (c.items.length === 2 && c.budget === 2 && defIds === 'c,d' && c.deferred[0].reason === 'budget')
    ? 'budgeted' : ('all:' + c.items.length + '/' + defIds);
}
// P2 所有权：认领后行上带着认领方
function probeOwner(WA) {
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'o1', title: 'o', kind: 'once', at: t - 1000 });
  const c = WA.events.claim(t, { owner: 'panel' });
  const v = rowOf(WA, 'o1');
  return (v && v.owner === 'panel' && c.owner === 'panel' && c.items[0].owner === 'panel') ? 'owned' : 'anon';
}
// P3 租约到期回收：过期行在同一事务里回到候选并可被再次认领
function probeLease(WA) {
  on(WA, { leaseMs: 1000 }); const t = Date.now();
  WA.events.schedule({ id: 'l1', title: 'l', kind: 'once', at: t - 5000 });
  WA.events.claim(t, { owner: 'p1' });
  const stuck = rowOf(WA, 'l1').status;
  const c2 = WA.events.claim(t + 2000, { owner: 'p2' });
  const back = c2.ids.indexOf('l1') >= 0 && c2.reclaimed === 1 && rowOf(WA, 'l1').status === 'claimed';
  return (stuck === 'claimed' && back) ? 'reclaimed' : ('stuck:' + stuck + '/' + c2.items.length);
}
// P3a 租约到期进**读面**：到期行必须重新出现在 due 候选里（不然面板看不见要救的活）
function probeLeaseDue(WA) {
  on(WA, { leaseMs: 1000 }); const t = Date.now();
  WA.events.schedule({ id: 'ld', title: 'l', kind: 'once', at: t - 5000 });
  WA.events.claim(t, { owner: 'p1' });
  const inDue = WA.events.due(t + 2000, {}).items.length;
  return (inDue === 1) ? 'visible' : ('hidden:' + inDue);
}
// P3b 租约到期被**回收**：唯一能让崩溃后那件事重新被执行的路径
function probeLeaseReclaim(WA) {
  on(WA, { leaseMs: 1000 }); const t = Date.now();
  WA.events.schedule({ id: 'lr', title: 'l', kind: 'once', at: t - 5000 });
  WA.events.claim(t, { owner: 'p1' });
  const c2 = WA.events.claim(t + 2000, { owner: 'p2' });
  const back = c2.reclaimed === 1 && c2.ids.indexOf('lr') >= 0 && rowOf(WA, 'lr').owner === 'p2';
  return back ? 'reclaimed' : ('stuck:' + c2.reclaimed + '/' + c2.items.length);
}
// P4 重复回执：同一 opId 第二次回报 ⇒ 拒收且零变化
function probeDup(WA) {
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'd1', title: 'd', kind: 'once', at: t - 1000 });
  WA.events.claim(t);
  const r1 = WA.events.complete('d1', { ok: true });
  const r2 = WA.events.complete('d1', { ok: true });
  const row = rowOf(WA, 'd1');
  return (r1.ok === true && r2.ok === false && r2.reason === 'duplicate-receipt' && row.runs === 1)
    ? 'deduped' : ('resent:' + r2.reason + '/' + row.runs);
}
// P5 周期事件：每次尝试各自成键（否则第二次回报被判成重复回执，周期只能跑一次）
function probeRepeat(WA) {
  on(WA, { maxRuns: 5 }); const t = Date.now();
  WA.events.schedule({ id: 'r1', title: 'r', kind: 'repeat', intervalMs: 1000, at: t - 1000 });
  const ops = []; let okc = 0;
  for (let i = 0; i < 3; i++) {
    const c = WA.events.claim(t + 100000 * (i + 1));
    if (!c.items.length) break;
    ops.push(c.items[0].opId);
    if (WA.events.complete('r1', { ok: true }).ok) okc++;
  }
  const uniq = ops.filter(function (x, i) { return ops.indexOf(x) === i; });
  return (okc === 3 && uniq.length === 3) ? 'per-attempt' : ('once:' + okc + '/' + uniq.length);
}
// P6 已回报不可再取消（可达守卫 = 终态 not-active）
function probeCancelDone(WA) {
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'c1', title: 'c', kind: 'once', at: t - 1000 });
  WA.events.claim(t);
  WA.events.complete('c1', { ok: true });
  const r = WA.events.cancel('c1', '手滑');
  const row = rowOf(WA, 'c1');
  return (r.ok === false && r.reason === 'not-active' && r.status === 'executed' &&
    row.status === 'executed' && !row.cancelReason) ? 'guarded' : ('wiped:' + r.reason + '/' + row.status);
}

function judge(a) {
  a(typeof fresh().events.claim === 'function', 'v2116/a2: 锁文件就位');
  // ① 认领预算
  const WA = fresh();
  on(WA, { maxClaims: 2 }); const t = Date.now();
  ['a', 'b', 'c', 'd'].forEach(function (k) { WA.events.schedule({ id: k, title: k, kind: 'once', at: t - 1000 }); });
  const c1 = WA.events.claim(t, { owner: 'panel' });
  a(c1.ok === true && c1.items.length === 2, 'v2116/a2: [1] 预算生效：一次认出最多 maxClaims 件（实 ' + c1.items.length + '）');
  a(c1.budget === 2 && c1.owner === 'panel', 'v2116/a2: [1] 返回体带本次预算与认领方');
  a(c1.deferred.length === 2 && c1.deferred.every(function (x) { return x.reason === 'budget'; }),
    'v2116/a2: [1] 超额者显式留痕 deferred（不是静默跳过）');
  a(rowsOf(WA).filter(function (x) { return x.status === 'claimed'; }).length === 2 &&
    rowsOf(WA).filter(function (x) { return x.status === 'pending'; }).length === 2,
    'v2116/a2: [1] 未被取用的行状态零变化（仍是 pending）');
  a(WA.events.stat().deferred === 2, 'v2116/a2: [1] deferred 计入 stat');
  // 显式 max 可低于设置，但不得超设置上界
  const c1b = WA.events.claim(t, { max: 5 });
  a(c1b.budget === 2, 'v2116/a2: [1] 显式 max 不得超设置上界（要求 5 实得 ' + c1b.budget + '）');
  a(WA.events.claim(t, { max: 0 }).budget === 2, 'v2116/a2: [1] 非法 max（0）回落到设置值');
  // ② 所有权
  const WA2 = fresh(); on(WA2); const t2 = Date.now();
  WA2.events.schedule({ id: 'o1', title: 'o', kind: 'once', at: t2 - 1000 });
  WA2.events.claim(t2, { owner: 'panel' });
  a(rowOf(WA2, 'o1').owner === 'panel', 'v2116/a2: [2] 认领行钉下 owner（多个调用方的账能对上）');
  a(WA2.events.active()[0].owner === 'panel', 'v2116/a2: [2] 只读视图带 owner');
  a(WA2.events.claim(t2, {}).owner === '', 'v2116/a2: [2] 未给 owner 时为空串（不猜、不冒名）');
  // ③ 租约
  const WA3 = fresh(); on(WA3, { leaseMs: 1000 }); const t3 = Date.now();
  WA3.events.schedule({ id: 'l1', title: 'l', kind: 'once', at: t3 - 5000 });
  const k1 = WA3.events.claim(t3, { owner: 'p1' });
  a(k1.leaseUntil === t3 + 1000 && rowOf(WA3, 'l1').leaseUntil === t3 + 1000, 'v2116/a2: [3] 认领时钉下租约到期时刻');
  a(WA3.events.due(t3, {}).items.length === 0, 'v2116/a2: [3] 租约期内不进 due 候选（正在执行 ≠ 可被抢走）');
  const k2 = WA3.events.claim(t3 + 2000, { owner: 'p2' });
  a(k2.reclaimed === 1 && k2.ids.indexOf('l1') >= 0 && rowOf(WA3, 'l1').owner === 'p2',
    'v2116/a2: [3] 租约到期 ⇒ 同事务回收并重新认领（崩溃不外抛）');
  a(rowOf(WA3, 'l1').reclaimed === 1, 'v2116/a2: [3] 回收次数留在行上（可查「被回收过几次」）');
  a(WA3.events.stat().reclaimed === 1, 'v2116/a2: [3] reclaimed 计入 stat');
  a(WA3.events.claim(t3 + 2000, { owner: 'p3' }).items.length === 0,
    'v2116/a2: [3] 同一时刻第二次认领拿不到（回收只发生一次）');
  // 读面：到期行必须重新出现在 due 候选（**独立实例 + 独立 id**，避免与他段互相清表）
  const WA3c = fresh(); on(WA3c, { leaseMs: 1000 }); const t3c = Date.now();
  WA3c.events.schedule({ id: 'l3', title: 'l', kind: 'once', at: t3c - 5000 });
  WA3c.events.claim(t3c, { owner: 'p1' });
  const dA = WA3c.events.due(t3c, {}).items.length;
  const dB = WA3c.events.due(t3c + 2000, {}).items.length;
  a(dA === 0 && dB === 1, 'v2116/a2: [3] 到期行在 due 里可见（' + dA + ' -> ' + dB + '，面板看得见要救的活）');
  // leaseMs=0 ⇒ 行为与 v2.115.0 逐字一致（不回收）
  const WA3b = fresh(); on(WA3b); const t3b = Date.now();
  WA3b.events.schedule({ id: 'l2', title: 'l', kind: 'once', at: t3b - 5000 });
  WA3b.events.claim(t3b);
  a(rowOf(WA3b, 'l2').leaseUntil === 0 && WA3b.events.claim(t3b + 1e9, {}).ids.length === 0,
    'v2116/a2: [3] leaseMs=0 ⇒ 不设租约、不回收（默认行为零变化）');
  // ④ 重复回执
  const WA4 = fresh(); on(WA4); const t4 = Date.now();
  WA4.events.schedule({ id: 'd1', title: 'd', kind: 'once', at: t4 - 1000 });
  WA4.events.claim(t4);
  const op = rowOf(WA4, 'd1').opId;
  a(op === 'd1@' + Math.floor(rowOf(WA4, 'd1').scheduledAt) + '#1', 'v2116/a2: [4] 认领钉下稳定 opId（id@到点时刻#次数）');
  const r41 = WA4.events.complete('d1', { ok: true });
  a(r41.ok === true && r41.opId === op, 'v2116/a2: [4] 首次回执成立并回报 opId');
  a(resOf(WA4).length === 1 && resOf(WA4)[0].opId === op, 'v2116/a2: [4] 回执与本地副作用状态一起进台账');
  const r42 = WA4.events.complete('d1', { ok: true });
  a(r42.ok === false && r42.reason === 'duplicate-receipt', 'v2116/a2: [4] 重放 ⇒ duplicate-receipt 拒收');
  a(rowOf(WA4, 'd1').runs === 1 && resOf(WA4).length === 1, 'v2116/a2: [4] 拒收 ⇒ 零变化（runs 与台账都没动）');
  a(WA4.events.stat().duplicates === 1, 'v2116/a2: [4] duplicates 计入 stat');
  a(WA4.events.complete('d1', { ok: false }).reason === 'duplicate-receipt',
    'v2116/a2: [4] 重放方向无关：迟到失败回执同样被去重');
  a(WA4.events.complete('d1', { ok: true, opId: op }).reason === 'duplicate-receipt',
    'v2116/a2: [4] 调用方显式给同一 opId 也命中台账');
  // ④c 周期事件每次尝试各自成键
  const WA5 = fresh(); on(WA5, { maxRuns: 5 }); const t5 = Date.now();
  WA5.events.schedule({ id: 'r1', title: 'r', kind: 'repeat', intervalMs: 1000, at: t5 - 1000 });
  let okc = 0;
  for (let i = 0; i < 3; i++) {
    const c = WA5.events.claim(t5 + 100000 * (i + 1), {});
    if (!c.items.length) break;
    if (WA5.events.complete('r1', { ok: true }).ok) okc++;
  }
  a(okc === 3 && rowOf(WA5, 'r1').runs === 3, 'v2116/a2: [4] 周期事件逐次回报都成立（实 ' + okc + '/3）');
  a(WA5.events.stat().duplicates === 0, 'v2116/a2: [4] 周期路径不产生假重复（同一笔才去重）');
  // ④d 租约回收后重新认领 ⇒ 新序号，不与自己打架
  const WA6 = fresh(); on(WA6, { leaseMs: 500 }); const t6 = Date.now();
  WA6.events.schedule({ id: 's1', title: 's', kind: 'once', at: t6 - 5000 });
  WA6.events.claim(t6, { owner: 'p1' });
  const firstOp = rowOf(WA6, 's1').opId;
  WA6.events.claim(t6 + 1000, { owner: 'p2' });
  const secondOp = rowOf(WA6, 's1').opId;
  a(firstOp !== secondOp && rowOf(WA6, 's1').claims === 2, 'v2116/a2: [4] 回收后重领会钉新操作 id（重试如实记）');
  a(WA6.events.complete('s1', { ok: true }).ok === true, 'v2116/a2: [4] 重试路径可正常回报（不被自己的台账挡住）');
  // ④e 已回报不可再取消。判据落在**可达**的守卫（终态 not-active）上：
  //    回报成功的那一笔已是 executed/exhausted/failed，取消必然被挡（state 零变化）。
  //    历史口径留档：曾加过 `already-receipted` 守卫，实测不可达且会在周期事件
  //    两次触发之间挡回合法取消，已撤除（见 engines/events.js 的负向注释）。
  const WA7 = fresh(); on(WA7); const t7 = Date.now();
  WA7.events.schedule({ id: 'c1', title: 'c', kind: 'once', at: t7 - 1000 });
  WA7.events.claim(t7);
  WA7.events.complete('c1', { ok: true });
  const cx = WA7.events.cancel('c1', '手滑');
  a(cx.ok === false && cx.reason === 'not-active' && cx.status === 'executed',
    'v2116/a2: [5] 已回报 ⇒ 不可再取消（not-active，实 ' + cx.reason + '）');
  a(rowOf(WA7, 'c1').status === 'executed' && !rowOf(WA7, 'c1').cancelReason,
    'v2116/a2: [5] 被拒的取消零变化（做完的事没被抹成没发生）');
  a(WA7.events.cancel('不存在的').reason === 'missing', 'v2116/a2: [5] 未知 id 仍是 missing');
  // ⑤c 周期事件可取消：上一次回执已入台账，但这一笔尚未回报 ⇒ 取消合法（不得被回执挡回）
  const WA7b = fresh(); on(WA7b, { maxRuns: 5 }); const t7b = Date.now();
  WA7b.events.schedule({ id: 'c2', title: 'c', kind: 'repeat', intervalMs: 1000, at: t7b - 1000 });
  WA7b.events.claim(t7b);
  WA7b.events.complete('c2', { ok: true });
  const cx2 = WA7b.events.cancel('c2', '不跑了');
  a(cx2.ok === true && rowOf(WA7b, 'c2').status === 'cancelled',
    'v2116/a2: [5] 周期事件仍可取消（回执台账不得挡回合法取消）');
  // ⑤ 迟到回执：用「过去的 t」认领 ⇒ leaseUntil 落在真实当下之前，回报必被判迟到。
  //    口径：只计数、不拒收（拒收会让调用方连「这笔做完了」都提交不了）。
  const WA8 = fresh(); on(WA8, { leaseMs: 1000 }); const t8 = Date.now() - 100000;
  WA8.events.schedule({ id: 'q1', title: 'q', kind: 'once', at: t8 - 1000 });
  WA8.events.claim(t8);
  a(rowOf(WA8, 'q1').leaseUntil === t8 + 1000, 'v2116/a2: [6] 租约时刻如约落行');
  const lateOne = WA8.events.complete('q1', { ok: true });
  a(lateOne.ok === true && lateOne.late === true, 'v2116/a2: [6] 租约过期后回报 ⇒ 成立且标记 late');
  a(WA8.events.stat().late === 1 && rowOf(WA8, 'q1').status === 'executed',
    'v2116/a2: [6] 迟到回执只计数不拒收（这一笔确实结算了）');
  // ⑤b 租约期内回报不算迟到
  const WA9 = fresh(); on(WA9, { leaseMs: 60000 }); const t9 = Date.now();
  WA9.events.schedule({ id: 'q2', title: 'q', kind: 'once', at: t9 - 1000 });
  WA9.events.claim(t9);
  const early = WA9.events.complete('q2', { ok: true });
  a(early.late === false && WA9.events.stat().late === 0, 'v2116/a2: [6] 租约期内回报 ⇒ late=false');
  // ⑥ 拒绝面未被放松（回归守卫）
  const WA10 = fresh(); on(WA10); const t10 = Date.now();
  a(WA10.events.claim(t10, { max: 'x' }).ok === true, 'v2116/a2: [7] 非法 max 不抛错（回落设置值）');
  a(WA10.events.claim(t10, { owner: 123 }).owner === '', 'v2116/a2: [7] 非字符串 owner 被收空（不静默升格）');
  a(WA10.events.complete('不存在', { ok: true }).reason === 'missing', 'v2116/a2: [7] 未知 id 回报仍是 missing');
  a(WA10.events.complete(123, { ok: true }).reason === 'missing-fields', 'v2116/a2: [7] 非字符串 id 仍拒收');
  // ⑦ 新容器有界（与 failQueue 同界）：逐笔认领+回报（认领时刻须 ≥ 到点时刻）
  const WA11 = fresh(); on(WA11, { maxFails: 2 }); const t11 = Date.now();
  for (let i = 0; i < 5; i++) {
    WA11.events.schedule({ id: 'b' + i, title: 'b', kind: 'once', at: t11 - 5000 });
    WA11.events.claim(t11 - 1 + i, {});
    WA11.events.complete('b' + i, { ok: true });
  }
  a(resOf(WA11).length === 2 && resOf(WA11).length <= 2,
    'v2116/a2: [8] 回执台账有界（实 ' + resOf(WA11).length + ' = maxFails）');
  // 哨兵
  let leak = 0;
  for (let i = 0; i < global.localStorage.length; i++) {
    const k = global.localStorage.key(i);
    if (k && String(global.localStorage.getItem(k)).indexOf(TAG) >= 0) leak++;
  }
  a(leak === 0, 'v2116/a2: [9] 哨兵未泄漏（' + leak + '）');
}
function WA_events() { return fresh().events; }

function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2116/a2: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  // N1 破坏现形（每条判据都要能在被破坏的副本上现形）
  a(probeWith(BROKEN[B.budget], probeBudget) !== 'budgeted',
    'v2116/a2: [N1] 去掉预算 ⇒ 一次 claim 搬空整个世界待办（缺口①复现）');
  a(probeWith(BROKEN[B.owner], probeOwner) === 'anon',
    'v2116/a2: [N1] 去掉所有权 ⇒ 认领行不带认领方（缺口②复现）');
  a(probeWith(BROKEN[B.lease], probeLeaseDue) === 'hidden:0',
    'v2116/a2: [N1] 去掉到期进候选 ⇒ due 看不见这笔要救的活（缺口③读面复现）');
  a(probeWith(BROKEN[B.reclaim], probeLeaseReclaim) !== 'reclaimed',
    'v2116/a2: [N1] 去掉回收 ⇒ 崩溃后那件事永久卡在 claimed（缺口③复现）');
  a(probeWith(BROKEN[B.dup], probeDup) !== 'deduped',
    'v2116/a2: [N1] 去掉台账判据 ⇒ 重放二次结算同一件事（缺口④复现）');
  a(probeWith(BROKEN[B.opid], probeRepeat) !== 'per-attempt',
    'v2116/a2: [N1] 操作 id 不按次重钉 ⇒ 周期事件第二次回报被判成重复（只能跑一次）');
  a(probeWith(BROKEN[B.cancel], probeCancelDone) !== 'guarded',
    'v2116/a2: [N1] 去掉已回报守卫 ⇒ 做完的事可被取消抹掉');
  // N2 真源码成绿
  a(probeClean(probeBudget) === 'budgeted', 'v2116/a2: [N2] 原版认领受预算约束');
  a(probeClean(probeOwner) === 'owned', 'v2116/a2: [N2] 原版认领记录所有权');
  a(probeClean(probeLease) === 'reclaimed', 'v2116/a2: [N2] 原版租约到期可回收重认领');
  a(probeClean(probeLeaseDue) === 'visible', 'v2116/a2: [N2] 原版到期行重新出现在 due 候选');
  a(probeClean(probeLeaseReclaim) === 'reclaimed', 'v2116/a2: [N2] 原版到期行被同事务回收');
  a(probeClean(probeDup) === 'deduped', 'v2116/a2: [N2] 原版重复回执拒收');
  a(probeClean(probeRepeat) === 'per-attempt', 'v2116/a2: [N2] 原版周期事件逐次成立');
  a(probeClean(probeCancelDone) === 'guarded', 'v2116/a2: [N2] 原版已回报不可再取消');
  // N3 破坏互不串扰
  a(probeWith(BROKEN[B.budget], probeDup) === 'deduped', 'v2116/a2: [N3] 预算破坏不影响去重');
  a(probeWith(BROKEN[B.dup], probeBudget) === 'budgeted', 'v2116/a2: [N3] 去重破坏不影响预算');
  a(probeWith(BROKEN[B.lease], probeDup) === 'deduped', 'v2116/a2: [N3] 租约破坏不影响去重');
  a(probeWith(BROKEN[B.reclaim], probeDup) === 'deduped', 'v2116/a2: [N3] 回收破坏不影响去重');
  a(probeWith(BROKEN[B.reclaim], probeBudget) === 'budgeted', 'v2116/a2: [N3] 回收破坏不影响预算');
  a(probeWith(BROKEN[B.opid], probeBudget) === 'budgeted', 'v2116/a2: [N3] 操作 id 破坏不影响预算');
  // N4 判据非恒真：真状态确实改变
  const chg = (function () {
    const WA = fresh(); on(WA, { maxClaims: 4 }); const t = Date.now();
    WA.events.schedule({ id: 'n4', title: 'x', kind: 'once', at: t - 1000 });
    const before = rowOf(WA, 'n4').status + '/0';
    WA.events.claim(t, { owner: 'n4o' });
    return before + '>' + rowOf(WA, 'n4').status + '/1';
  })();
  a(chg === 'pending/0>claimed/1', 'v2116/a2: [N4] 认领真的改变状态（判据非恒真，实 ' + chg + '）');
}

function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('EVENTS-A2-V2116: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('EVENTS-A2-V2116: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };

