#!/usr/bin/env node
// WorldAxis tests/b9-coop-v2118.js -- B9 专锁：多人协作可靠性层（v2.118.0）
//
// 规划 02 的 B9 原文要点：「当前 `collab` 属于本地会话、占用、排队和冲突记录。后续若确有多人
//   共享世界需求，**先完善本地提议的待处理/确认/拒绝/重试**，以及关闭会话释放占用、确认前不标
//   完成、历史归档与操作负载完整性；优先选一个**权威世界维护者**，其他参与者提交**带基础版本**
//   的提议；每位玩家只获得**自身视点**；冲突提供可理解的处理方式；传输/认证/断线恢复/授权单独
//   建设，**不能用本地 session 或持有角色的声明当成真实身份**；验收含两人同时占同一角色、提交
//   冲突资源操作、客户端重发、主持者拒绝、断线重连都有确定结果与可追溯回执；自动合并任意世界、
//   去中心化同步与大规模并发在没有明确需求前不进入近期交付。」
//
// 落点：engines/coop.js（新顶层容器 coop { proposals, archive }）。
//   四处登记（evict.SITES 两站点 / store 骨架 / store __BOUNDED_CAPS）由 [A1]–[A4] 守住；
//   LOAD 顺序由 [A5] 守住（与 index.js 同序）。
//
// 本锁逐条守住的语义 —— 每一条都是「写出来了、但换个条件就不成立」：
//   ① 确认前不标完成：accepted 只由 confirm 给出，propose 出来的行永远是 pending。
//   ② 权威与提交不同人：默认下提议人不能自己确认（allowSelfApprove 才显式打开）。
//   ③ 带基础版本：没有 baseRev 的提议拒收；版本不等即 stale 拒收，**不自动合并**。
//   ④ 占用不夺取：角色被别的会话占着 ⇒ 拒收并带出持有者（不静默抢占）。
//   ⑤ 路径应用不到 ⇒ **整份**拒收，不做部分成功。
//   ⑥ 回执未落 ⇒ 提议**退回待处理**（连状态一起退回），这次确认不标完成。
//   ⑦ 重试有上限且可追溯：只有被拒的才重试，次数记在行上，超限如实拒收。
//   ⑧ 视点隔离：别人的私有条目 `visible:false`（对第三方亦然，与是不是他提的无关）。
//   ⑨ 归档不删行：终态进 archive 且带 load / tries / decidedBy / receiptId。
//   ⑩ 幂等：同一 opId 第二次只拿回原结果（客户端重发不长出第二份）。
//   ⑪ 身份只认显式 `by`：不读 collab 会话或占用声明当身份。
//   ⑫ 两表各有界且挤出有账。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
// 破坏只改内存副本（srcOverride），零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__b9c2118_';
const REL = 'engines/coop.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_PEND    = "        status: 'pending', statusLabel: STATUS_CN.pending,";
const A_IDEM    = "    const hit = rowsOf().filter(function (x) { return x && x.opId === opId; })[0];\n    if (hit) {";
const A_NOBASE  = "      noteFault('missing-base'); return { ok: false, reason: 'missing-base', note: '提议必须带基础版本（rev + keys + chars）' };";
const A_OPS     = "    if (rawOps.length > LIMITS.OPS) { noteFault('too-many-ops'); return { ok: false, reason: 'too-many-ops', cap: LIMITS.OPS }; }";
const A_ROWSCAP = "      if (n.proposals.length >= LIMITS.ROWS) { out = { ok: false, reason: 'proposals-full', cap: LIMITS.ROWS }; return false; }";
const A_TRM     = "      if (gone) {";
const A_SELF    = "    if (!cfg.allowSelfApprove && row.by === by) {";
const A_HOLDER  = "    if (holder && holder !== by) {";
const A_STALE   = "      if (!shapeOnly) {";
const A_DRY     = "    const dry = JSON.parse(JSON.stringify(state()));";
const A_RCV     = "        if (r && r.ok === true) {";
const A_ARCH    = "    n.proposals = n.proposals.filter(function (x) { return x && x.id !== row.id; });";
const A_EVARC   = "    if (WA.evict) WA.evict.array(n.archive, 'coop.archive');";
const A_RTRY    = "    if (gone.status !== 'rejected') {";
const A_TRIES   = "    if (gone.tries >= cap) {";
const A_VISP    = "      const visible = !owner || owner === me;";
const A_VISN    = "      const m = /^people\\.([^.]+)\\.private\\b/.exec(o.path);";
const A_RBS     = "              a.status = 'pending'; a.statusLabel = STATUS_CN.pending;";
const A_RBR     = "            worldWritten: true,";
const A_STAMP   = "    return { rev: fingerprint(json), keys: Object.keys(w).length, chars: json.length };";
const A_BOOK    = "  const BOOK = { meta: 1, coop: 1, collab: 1 };";
const A_ACTOR   = "    const a = clean(by, 60);\n    if (!a) return { ok: false, reason: 'missing-actor' };";
const A_AUTO    = "    const actor = clean(it.actor, 60);          // 提议涉及的**角色**（可空：世界级提议）";
const A_REASON  = "    const reason = clean(o.reason, LIMITS.TEXT);\n    if (!reason) { noteFault('missing-reason'); return { ok: false, reason: 'missing-reason', note: '拒绝必须给理由' }; }";

const BROKEN = [
  { rel: REL, key: 'pend', from: A_PEND, to: "        status: 'accepted', statusLabel: STATUS_CN.accepted,",
    why: '提议一提交就标成「已确认」⇒ 确认前不标完成（B9 原文）被绕过' },
  { rel: REL, key: 'idem', from: A_IDEM, to: "    const hit = rowsOf().filter(function (x) { return x && x.opId === opId; })[0];\n    if (false) {",
    why: 'opId 幂等失效 ⇒ 客户端重发长出第二份提议（验收点名「客户端重发要有确定结果」）' },
  { rel: REL, key: 'nobase', from: A_NOBASE, to: "      if (false) { noteFault('missing-base'); return { ok: false, reason: 'missing-base', note: '提议必须带基础版本（rev + keys + chars）' }; }",
    why: '无版本提议也收 ⇒ 没有基础版本就没有「这份提议基于什么」可言' },
  { rel: REL, key: 'ops', from: A_OPS, to: "      if (false) { noteFault('too-many-ops'); return { ok: false, reason: 'too-many-ops', cap: LIMITS.OPS }; }",
    why: '单份提议负载无上限 ⇒ 一次提交能把整片世界覆盖掉（负载完整性失守）' },
  { rel: REL, key: 'rowscap', from: A_ROWSCAP, to: "      if (false) { out = { ok: false, reason: 'proposals-full', cap: LIMITS.ROWS }; return false; }",
    why: '待裁队列无上限 ⇒ 谁都能把队列撑爆，权威永远追不上' },
  { rel: REL, key: 'trm', from: A_TRM, to: "      if (false) {",
    why: '已终态的提议能再被确认一次 ⇒ 同一份提议写世界两次' },
  { rel: REL, key: 'self', from: A_SELF, to: "    if (false) {",
    why: '提议人能自审 ⇒ 「权威世界维护者」形同虚设（B9 原文要求优先选一个权威）' },
  { rel: REL, key: 'holder', from: A_HOLDER, to: "    if (false) {",
    why: '角色被别的会话占着也照确认 ⇒ 两人同时占同一角色的结果不确定' },
  { rel: REL, key: 'stale', from: A_STALE, to: "      if (false) {",
    why: '版本不等也照接收 ⇒ 变成「自动合并任意世界」（B9 明确不进入近期交付）' },
  { rel: REL, key: 'rcv', from: A_RCV, to: "        if (false) {",
    why: '回执失败也当成功 ⇒ 断线重连后的确认没有可追溯回执（验收点名）' },
  { rel: REL, key: 'arch', from: A_ARCH, to: "    n.proposals = n.proposals.filter(function (x) { return true; });",
    why: '终态行不离开待裁队列 ⇒ 历史归档与待办混在一起' },
  { rel: REL, key: 'evarc', from: A_EVARC, to: "    if (false) WA.evict.array(n.archive, 'coop.archive');",
    why: '归档无界增长 ⇒ 长局存档被拖垮' },
  { rel: REL, key: 'rtry', from: A_RTRY, to: "    if (false) {",
    why: '不是被拒的也能重试 ⇒ 待处理的提议被重复开出一份（队列里出现同 opId 两行）' },
  { rel: REL, key: 'tries', from: A_TRIES, to: "    if (false) {",
    why: '重试无上限 ⇒ 「它被重发了几次」答不出来' },
  { rel: REL, key: 'visp', from: A_VISP, to: "        const visible = true;",
    why: '私有条目对谁都可见 ⇒ 「每位玩家只获得自身视点」被绕过' },
  { rel: REL, key: 'visn', from: A_VISN, to: "      const m = null;",
    why: '私有形状认不出 ⇒ 视点过滤整条失效（看似有过滤、实际全放行）' },
  { rel: REL, key: 'rbs', from: A_RBS, to: "              void 0;",
    why: '回执失败只搬行不改状态 ⇒ 行在待裁队列里却仍写着「已确认」（不标完成只做一半）' },
  { rel: REL, key: 'rbr', from: A_RBR, to: "            worldWritten: false,",
    why: '世界写入已发生却说没发生 ⇒ 调用方以为可以整体重放' },
  { rel: REL, key: 'stamp', from: A_STAMP, to: "    return { rev: (state().meta && Number(state().meta.stateRev)) || 0, keys: Object.keys(w).length, chars: json.length };",
    why: '版本戳用事务计数器 ⇒ 提议一提交就把自己弄 stale，任何提议都确认不了' },
  { rel: REL, key: 'book', from: A_BOOK, to: "  const BOOK = { meta: 1 };",
    why: '内容指纹不排除协作簿记 ⇒ 别人开一次会话就能把在途提议判 stale' },
  { rel: REL, key: 'actor', from: A_ACTOR, to: "    const a = clean(by, 60);\n    if (a === null) return { ok: false, reason: 'missing-actor' };",
    why: '操作者可为空 ⇒ 裁决没有责任人（追溯不到谁确认的）' },
  { rel: REL, key: 'auto', from: A_AUTO, to: "    const actor = clean(it.by, 60);",
    why: '涉及角色取操作者自己的会话身份 ⇒ 把本地声明当身份（B9 点名禁止）' },
  { rel: REL, key: 'reason', from: A_REASON, to: "    const reason = clean(o.reason, LIMITS.TEXT);\n    if (false) { noteFault('missing-reason'); return { ok: false, reason: 'missing-reason', note: '拒绝必须给理由' }; }",
    why: '拒绝可以不给理由 ⇒ 主持人拒绝变成不可解释的结果' }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function readSrc(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function anchorHits(spec) { return readSrc(spec.rel).split(spec.from).length - 1; }
function brokenOverride(spec) {
  const src = readSrc(spec.rel);
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  ov.__origSrc = src;
  return ov;
}
function mkW(ov) { return reset(fresh(ov ? { srcOverride: ov } : {})); }
function probeWith(spec, fn) {
  let out;
  try { out = fn({ ov: brokenOverride(spec) }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}
function probeClean(fn) {
  let out;
  try { out = fn({ ov: null }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}
// ── 夹具 ───────────────────────────────────────────────────────────────
// 甲乙丙三人：甲/乙是参与者，丙是**与提议无关**的第三方（视点隔离用它）；
// 世界里备好 people.<人名>.private 与 world.places 两类可写路径。
function reset(WA) {
  WA.collab.setSettings({ enabled: false, maxSessions: 8, maxQueue: 16, maxConflicts: 8, maxActor: 60 });
  WA.coop.setSettings({ enabled: false, horizon: 0, allowSelfApprove: false, maxTries: 3, maxView: 60 });
  WA.store.transact(function (d) {
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲' },
      'p_乙': { id: 'p_乙', name: '乙' },
      'p_丙': { id: 'p_丙', name: '丙' }
    };
    d.world = d.world && typeof d.world === 'object' ? d.world : {};
    d.world.places = [{ id: 'pl_A', name: '甲地' }];
    // store 在同一进程里跨用例存活：容器与协作簿记都必须清（否则读到累计值）
    d.coop = { proposals: [], archive: [], seq: 0 };
    d.collab = { seq: 0, sessions: [], claims: {}, queue: [], conflicts: [] };
  }, TAG + 'reset');
  WA.collab.setSettings({ enabled: true, maxSessions: 8, maxQueue: 16, maxConflicts: 8, maxActor: 60 });
  WA.coop.setSettings({ enabled: true, horizon: 0, allowSelfApprove: false, maxTries: 3, maxView: 60 });
  return WA;
}
/** 提交一份「把甲地换成乙地」的提议，返回结果。 */
function one(WA, o) {
  const it = Object.assign({ opId: 'op_x', by: '甲', baseRev: WA.coop.stamp(),
    ops: [{ path: 'world.places', value: [{ id: 'pl_B', name: '乙地' }] }] }, o || {});
  if (it.__now) { it.baseRev = WA.coop.stamp(); delete it.__now; }
  return WA.coop.propose(it);
}
/** 占用某角色（collab 侧显式声明；coop 只读它、不夺取）。
 *  注意 collab.open 返回的字段是 `session`（不是 id），且占用必须显式 claim。 */
function occupy(WA, who) {
  const s = WA.collab.open('s_' + who, { by: who });
  const sid = s && (s.session || s.id);
  const c = sid ? WA.collab.claim(who, sid) : null;
  return { open: s, claim: c };
}
// ── 判据（每条返回**语义常量串**：原版永远同一个词）────────────────────
const PROBES = {
  // ① 确认前不标完成
  pStage: function (env) {
    const WA = mkW(env.ov);
    const r = one(WA);
    const v = WA.coop.view({});
    return (r.status === 'pending' && v.byStatus.pending === 1 && v.byStatus.accepted === 0)
      ? 'pending-until-confirmed' : 'status:' + r.status;
  },
  // ② 两向：确认后才是 accepted，且世界真被写入
  pConfirm: function (env) {
    const WA = mkW(env.ov);
    const r = one(WA);
    const c = WA.coop.confirm(r.id, { by: '乙' });
    const places = (WA.store.get().world.places || []).map(function (p) { return p.name; });
    return (c.ok === true && c.status === 'accepted' && places.join() === '乙地' && c.receiptId)
      ? 'confirmed-and-applied' : 'bad:' + (c && c.reason) + '/' + places.join();
  },
  // ③ 自审
  pSelf: function (env) {
    const WA = mkW(env.ov);
    const r = one(WA);
    const c = WA.coop.confirm(r.id, { by: '甲' });
    return (c.ok === false && c.reason === 'self-approve') ? 'self-refused' : 'ok:' + (c && c.reason);
  },
  // ④ 缺基础版本
  pNoBase: function (env) {
    const WA = mkW(env.ov);
    const r = WA.coop.propose({ opId: 'nb', by: '甲', ops: [{ path: 'world.places', value: [] }] });
    return (r.ok === false && r.reason === 'missing-base') ? 'base-required' : 'ok:' + (r && r.reason);
  },
  // ⑤ 版本戳必须**可现形**：`stamp().rev` 只由世界内容决定 ——
  //   ① 两次读同一内容必须同值（事务计数器做不到：propose 自己就走事务）；
  //   ② 提议提交前后不变；
  //   ③ 确认之后必须变（世界真被改了）。破坏「换成事务计数器」这三条全崩。
  pStamp: function (env) {
    const WA = mkW(env.ov);
    const s0 = WA.coop.stamp();
    const r = one(WA);
    const s1 = WA.coop.stamp();
    const c = WA.coop.confirm(r.id, { by: '乙' });
    const s2 = WA.coop.stamp();
    return (typeof s0.rev === 'number' && s0.rev === s1.rev && s1.rev !== s2.rev
      && c.ok === true && c.status === 'accepted') ? 'stamp-content-only' : 'bad:' + (c && c.reason);
  },
  // ⑥ stale（真改了世界内容）
  pStale: function (env) {
    const WA = mkW(env.ov);
    const st = WA.coop.stamp();
    WA.store.transact(function (d) { d.world.places = [{ id: 'pl_C', name: '丙地' }]; }, TAG + 'x');
    const r = WA.coop.propose({ opId: 'st', by: '甲', baseRev: st,
      ops: [{ path: 'world.places', value: [{ id: 'pl_D', name: '丁地' }] }] });
    const c = WA.coop.confirm(r.id, { by: '乙' });
    const places = (WA.store.get().world.places || []).map(function (p) { return p.name; }).join();
    return (c.ok === false && c.reason === 'stale-base' && places === '丙地') ? 'stale-refused' : 'ok:' + (c && c.reason);
  },
  // ⑦ 协作簿记不得推动指纹（别人开一局会话，在途提议仍然可裁）
  pBookkeeping: function (env) {
    const WA = mkW(env.ov);
    const r = one(WA);
    WA.collab.open('旁人的会话', { by: '丙' });
    WA.collab.enqueue('q1', 'note', { a: 1 }, { by: '丙' });
    const c = WA.coop.confirm(r.id, { by: '乙' });
    return (c.ok === true && c.status === 'accepted') ? 'bookkeeping-inert' : 'stale:' + (c && c.reason);
  },
  // ⑧ 占用不夺取
  pHolder: function (env) {
    const WA = mkW(env.ov);
    occupy(WA, '乙');
    const s0 = WA.coop.stamp();
    const r = WA.coop.propose({ opId: 'hc', by: '甲', actor: '乙', baseRev: s0,
      ops: [{ path: 'world.places', value: [] }] });
    const c = WA.coop.confirm(r.id, { by: '丙' });
    const places = (WA.store.get().world.places || []).map(function (p) { return p.name; }).join();
    return (c.ok === false && c.reason === 'actor-claimed-by-other' && c.holder && places === '甲地')
      ? 'claim-not-taken' : 'ok:' + (c && c.reason);
  },
  // ⑨ 无占用声明 ⇒ 正常确认（证伪「占用判据恒拦」）
  pFree: function (env) {
    const WA = mkW(env.ov);
    const s0 = WA.coop.stamp();
    const r = WA.coop.propose({ opId: 'fr', by: '甲', actor: '乙', baseRev: s0,
      ops: [{ path: 'world.places', value: [] }] });
    const c = WA.coop.confirm(r.id, { by: '丙' });
    return (c.ok === true && c.status === 'accepted') ? 'free-ok' : 'blocked:' + (c && c.reason);
  },
  // ⑩ 路径应用不到 ⇒ 整份拒收、零写入
  pPartial: function (env) {
    const WA = mkW(env.ov);
    const s0 = WA.coop.stamp();
    const r = WA.coop.propose({ opId: 'pa', by: '甲', baseRev: s0, ops: [
      { path: 'world.places', value: [{ id: 'pl_Z', name: '子地' }] },
      { path: 'world.nope.deep', value: 1 }
    ] });
    const c = WA.coop.confirm(r.id, { by: '乙' });
    const places = (WA.store.get().world.places || []).map(function (p) { return p.name; }).join();
    return (c.ok === false && c.reason === 'unappliable' && places === '甲地') ? 'all-or-nothing' : 'ok:' + (c && c.reason);
  },
  // ⑪ 幂等
  pIdem: function (env) {
    const WA = mkW(env.ov);
    const a = one(WA, { opId: 'idem1' });
    const b = one(WA, { opId: 'idem1' });
    return (b.reused === true && b.id === a.id && WA.coop.pending().length === 1) ? 'idem-dedup' : 'dup:' + WA.coop.pending().length;
  },
  // ⑫ 重复确认（已终态）只回原结果、不重复写世界
  pOnce: function (env) {
    const WA = mkW(env.ov);
    const r = one(WA);
    WA.coop.confirm(r.id, { by: '乙' });
    const c2 = WA.coop.confirm(r.id, { by: '乙' });
    return (c2.ok === true && c2.reused === true && c2.status === 'accepted') ? 'confirm-once' : 'again:' + (c2 && c2.reason);
  },
  // ⑬ 拒绝必须给理由
  pRejReason: function (env) {
    const WA = mkW(env.ov);
    const r = one(WA);
    const no = WA.coop.reject(r.id, { by: '乙' });
    const yes = WA.coop.reject(r.id, { by: '乙', reason: '不认可' });
    return (no.ok === false && no.reason === 'missing-reason' && yes.ok === true && yes.status === 'rejected')
      ? 'reason-required' : 'bad:' + (no && no.reason);
  },
  // ⑭ 归档：终态行离开待裁队列并带负载/裁决人/回执
  pArchive: function (env) {
    const WA = mkW(env.ov);
    const r = one(WA);
    WA.coop.confirm(r.id, { by: '乙' });
    const a = WA.coop.archive(10).filter(function (x) { return x.id === r.id; });
    // 「已离开待裁队列」必须读**原始容器**：`pending()` 是按 status 过滤的，而 fileOut 改的正是
    //   同一个对象（引用共享）⇒ 终态行即使还留在 proposals 里，也已经不是 pending，判据看不见它。
    const raw = (WA.store.get().coop.proposals || []).filter(function (x) { return x.id === r.id; });
    return (a.length === 1 && a[0].status === 'accepted' && a[0].load === 1
      && a[0].decidedBy === '乙' && a[0].receiptId && raw.length === 0)
      ? 'archived-full' : 'bad:' + JSON.stringify([a.length, raw.length]);
  },
  // ⑮ 重试：只有被拒的、次数上限、可追溯
  pRetry: function (env) {
    const WA = mkW(env.ov);
    // (a) 已**确认**的行也在归档里 —— 重试它必须原样回原结果，绝不拉回队列
    const done = one(WA, { opId: 'done1' });
    WA.coop.confirm(done.id, { by: '乙' });
    const pre = WA.coop.retry(done.id, { by: '甲' });
    const afterPre = (WA.store.get().coop.proposals || []).length;
    // (b) 被拒的行：次数上限 3，超限如实拒收
    const r = one(WA, { opId: 'rej1' });
    WA.coop.reject(r.id, { by: '乙', reason: '不认可' });
    const t1 = WA.coop.retry(r.id, { by: '甲' });
    const t2 = WA.coop.retry(r.id, { by: '甲' });
    const t3 = WA.coop.retry(r.id, { by: '甲' });
    const t4 = WA.coop.retry(r.id, { by: '甲' });
    const row = WA.coop.pending().filter(function (x) { return x.id === t2.id; })[0];
    return (pre.reused === true && pre.status === 'accepted' && afterPre === 0
      && t1.tries === 1 && t2.tries === 2 && t3.tries === 3
      && t4.ok === false && t4.reason === 'tries-exhausted' && row && row.tries === 2)
      ? 'retry-capped' : 'bad:' + JSON.stringify([pre && pre.status, afterPre, t4 && t4.reason]);
  },
  // ⑯ 视点隔离：自己的可见、别人的不可见（第三方亦然）
  pView: function (env) {
    const WA = mkW(env.ov);
    const s0 = WA.coop.stamp();
    const r = WA.coop.propose({ opId: 'vw', by: '甲', actor: '甲', baseRev: s0, ops: [
      { path: 'people.甲.private', value: 'a' }, { path: 'people.乙.private', value: 'b' }
    ] });
    const mine = WA.coop.viewOf(r.id, '甲');
    const other = WA.coop.viewOf(r.id, '乙');
    const third = WA.coop.viewOf(r.id, '丙');
    const pick = function (v, p) { const h = (v.ops || []).filter(function (o) { return o.path === p; })[0]; return h ? h.visible : null; };
    return (pick(mine, 'people.甲.private') === true && pick(mine, 'people.乙.private') === false
      && pick(other, 'people.甲.private') === false && pick(third, 'people.乙.private') === false)
      ? 'view-isolated' : 'leak:' + JSON.stringify([pick(mine, 'people.乙.private'), pick(third, 'people.乙.private')]);
  },
  // ⑰ 回执失败 ⇒ 退回待处理（连状态一起），且如实说世界已写
  pReceipt: function (env) {
    const WA = mkW(env.ov);
    const r = one(WA);
    WA.collab.setSettings({ enabled: false });
    const c = WA.coop.confirm(r.id, { by: '乙' });
    const p = WA.coop.pending();
    const backRow = p.filter(function (x) { return x.id === r.id; })[0];
    return (c.ok === false && c.reason === 'receipt-failed' && c.worldWritten === true
      && WA.coop.archive(5).length === 0 && !!backRow)
      ? 'receipt-rolled-back' : 'bad:' + JSON.stringify([c && c.reason, p.length]);
  },
  // ⑱ 关闭时拒收、零台账
  pOff: function (env) {
    const WA = mkW(env.ov);
    WA.coop.setSettings({ enabled: false });
    const r = one(WA);
    return (r.ok === false && r.reason === 'disabled' && WA.coop.pending().length === 0) ? 'off-refused' : 'ok';
  },
  // ⑲ 身份：空 by 拒收；actor 取显式传入（不取 by）
  pActor: function (env) {
    const WA = mkW(env.ov);
    const s0 = WA.coop.stamp();
    const noBy = WA.coop.confirm('cp_x', { by: '' });
    const r = WA.coop.propose({ opId: 'ac', by: '甲', actor: '乙', baseRev: s0,
      ops: [{ path: 'world.places', value: [] }] });
    const detail = WA.coop.pending().filter(function (x) { return x.id === r.id; })[0];
    return (noBy.ok === false && noBy.reason === 'missing-actor' && detail && detail.actor === '乙')
      ? 'explicit-identity' : 'bad:' + JSON.stringify([noBy && noBy.reason, detail && detail.actor]);
  },
  // ⑳ 认不出的角色不进协作面
  pUnknown: function (env) {
    const WA = mkW(env.ov);
    const s0 = WA.coop.stamp();
    const r = WA.coop.propose({ opId: 'uk', by: '甲', actor: '查无此人', baseRev: s0,
      ops: [{ path: 'world.places', value: [] }] });
    return (r.ok === false && r.reason === 'unknown-actor') ? 'unknown-refused' : 'ok:' + (r && r.reason);
  },
  // ㉑ 负载上限
  pOps: function (env) {
    const WA = mkW(env.ov);
    const s0 = WA.coop.stamp();
    const ops = [];
    for (let i = 0; i < 25; i++) ops.push({ path: 'world.places', value: i });
    const r = WA.coop.propose({ opId: 'big', by: '甲', baseRev: s0, ops: ops });
    return (r.ok === false && r.reason === 'too-many-ops' && r.cap === 24) ? 'ops-capped' : 'ok:' + (r && r.reason);
  },
  // ㉒ 待裁队列满 ⇒ 如实拒收（不静默丢）
  pFull: function (env) {
    const WA = mkW(env.ov);
    const s0 = WA.coop.stamp();
    let last = null;
    for (let i = 0; i < 25; i++) last = one(WA, { opId: 'f' + i, baseRev: s0 });
    return (last.ok === false && last.reason === 'proposals-full' && WA.coop.pending().length === 24)
      ? 'queue-capped' : 'bad:' + JSON.stringify([last && last.reason, WA.coop.pending().length]);
  },
  // ㉓ 两表各有界
  pBounded: function (env) {
    const WA = mkW(env.ov);
    const rows = WA.coop.view({});
    const caps = WA.store.sizeCaps();
    return (rows.statuses.length === 4 && caps['coop.proposals'] && caps['coop.proposals'].cap === 24
      && caps['coop.archive'] && caps['coop.archive'].cap === 40) ? 'bounded' : 'bad:' + JSON.stringify(caps['coop.proposals']);
  },
  // ㉓b 归档被挤回上界（走真 fileOut 路径，不是只查登记表）
  pEvArch: function (env) {
    const WA = mkW(env.ov);
    // 两轮各 24 份提议、全部被拒 ⇒ 48 条终态写入，归档必须停在 40
    for (let round = 0; round < 2; round++) {
      const ids = [];
      for (let i = 0; i < 24; i++) {
        const r = one(WA, { opId: 'e' + round + '_' + i });
        if (r.ok === true) ids.push(r.id);
      }
      ids.forEach(function (id) { WA.coop.reject(id, { by: '乙', reason: '不认可' }); });
    }
    const n = (WA.store.get().coop.archive || []).length;
    return (n === 40) ? 'archive-bounded' : 'archive-len:' + n;
  },
  // ㉔ 追溯
  pTrace: function (env) {
    const WA = mkW(env.ov);
    const r = one(WA);
    const before = WA.coop.traceOf(r.id);
    WA.coop.confirm(r.id, { by: '乙' });
    const after = WA.coop.traceOf(r.id);
    return (before.ok === true && before.archived === false && before.status === 'pending'
      && after.ok === true && after.archived === true && after.status === 'accepted'
      && after.decidedBy === '乙' && !!after.receiptId) ? 'traceable' : 'bad:' + JSON.stringify([before.status, after.status]);
  },
  // ㉕ 中文标签互异（四档不可合并成一档）
  pLabels: function (env) {
    const WA = mkW(env.ov);
    const cn = WA.coop.STATUS_CN;
    const vals = WA.coop.STATUS.map(function (s) { return cn[s]; });
    return (vals.length === 4 && new Set(vals).size === 4 && vals.join('') === '待处理已确认已拒绝已被新提议取代')
      ? 'four-distinct' : 'labels:' + vals.join('/');
  }
};
// ── 破坏项 → 判据（一条破坏项对应一条**可现形**的判据）──────────────
const N1 = [
  { k: 'pend',    p: 'pStage',     okk: 'pending-until-confirmed', note: '提议被直接标成已确认' },
  { k: 'idem',    p: 'pIdem',      okk: 'idem-dedup',              note: '重发长出第二份提议' },
  { k: 'nobase',  p: 'pNoBase',    okk: 'base-required',           note: '无版本提议也被收下' },
  { k: 'ops',     p: 'pOps',       okk: 'ops-capped',              note: '单份负载无上限' },
  { k: 'rowscap', p: 'pFull',      okk: 'queue-capped',            note: '待裁队列无上限' },
  { k: 'trm',     p: 'pOnce',      okk: 'confirm-once',            note: '终态提议被再写一次世界' },
  { k: 'self',    p: 'pSelf',      okk: 'self-refused',            note: '提议人能自审' },
  { k: 'holder',  p: 'pHolder',    okk: 'claim-not-taken',         note: '占用中的角色被照确认' },
  { k: 'stale',   p: 'pStale',     okk: 'stale-refused',           note: '版本不等也照接收' },
  { k: 'rcv',     p: 'pConfirm',   okk: 'confirmed-and-applied',   note: '回执失败也当成功' },
  { k: 'arch',    p: 'pArchive',   okk: 'archived-full',           note: '终态行不离开待裁队列' },
  { k: 'evarc',   p: 'pEvArch',    okk: 'archive-bounded',         note: '归档无界增长（两轮 48 条没有被挤回 40）' },
  { k: 'rtry',    p: 'pRetry',     okk: 'retry-capped',            note: '已确认的提议也被重试（终态行被拉回队列）' },
  { k: 'tries',   p: 'pRetry',     okk: 'retry-capped',            note: '重试无上限' },
  { k: 'visp',    p: 'pView',      okk: 'view-isolated',           note: '私有条目对谁都可见' },
  { k: 'visn',    p: 'pView',      okk: 'view-isolated',           note: '私有形状认不出（过滤形同虚设）' },
  { k: 'rbs',     p: 'pReceipt',   okk: 'receipt-rolled-back',     note: '回执失败只搬行不改状态' },
  { k: 'rbr',     p: 'pReceipt',   okk: 'receipt-rolled-back',     note: '世界已写却说没写' },
  { k: 'stamp',   p: 'pStamp',     okk: 'stamp-content-only',      note: '提议自提交即 stale（任何提议都裁不了）' },
  { k: 'book',    p: 'pBookkeeping', okk: 'bookkeeping-inert',     note: '别人的会话把在途提议判 stale' },
  { k: 'actor',   p: 'pActor',     okk: 'explicit-identity',       note: '操作者可为空' },
  { k: 'auto',    p: 'pActor',     okk: 'explicit-identity',       note: '角色取操作者身份（本地声明当身份）' },
  { k: 'reason',  p: 'pRejReason', okk: 'reason-required',         note: '拒绝可以不给理由' }
];

function judge(a) {
  // ── A 静态段：登记与结构（不跑行为）──
  const src = readSrc(REL);
  a(fs.existsSync(path.join(BASE, REL)), 'v2118/b9: [A1] engines/coop.js 落盘');
  const evictSrc = readSrc('core/evict.js');
  a(evictSrc.indexOf("'coop.proposals'") > 0 && evictSrc.indexOf("'coop.archive'") > 0
    && evictSrc.split("path: 'coop.proposals'").length - 1 === 1,
    'v2118/b9: [A2] evict.SITES 两站点各恰一条');
  const storeSrc = readSrc('core/store.js');
  a(storeSrc.indexOf('coop: { proposals: [], archive: [] }') > 0, 'v2118/b9: [A3] store 骨架物化 coop 顶层键');
  a(storeSrc.indexOf("'coop.proposals'") > 0 && storeSrc.indexOf("'coop.archive'") > 0,
    'v2118/b9: [A4] __BOUNDED_CAPS 两键登记');
  const idxSrc = readSrc('index.js');
  const runSrc = readSrc('tests/run.js');
  a(idxSrc.indexOf("'engines/coop.js'") > 0 && runSrc.indexOf("'engines/coop.js'") > 0,
    'v2118/b9: [A5] LOAD 两侧都含 coop.js');
  const iC = idxSrc.indexOf("'engines/coop.js'");
  const iL = idxSrc.indexOf("'engines/liaison.js'");
  a(iL > 0 && iC > iL, 'v2118/b9: [A6] index.js 里 coop 排在 liaison 之后（与 tests/run.js 同序）');
  // 视点与身份两处「不做的事」必须在源码里写明（防后来者顺手放宽）
  a(src.indexOf('既不走 collab 会话也不读占用声明') > 0 || src.indexOf('刻意不读 collab 的会话或占用声明') > 0,
    'v2118/b9: [A7] 身份只认显式 by（源码写明不读会话/占用）');
  a(src.indexOf(A_DRY.slice(4)) > 0, 'v2118/b9: [A11] 干跑锚点仍在源码中（常量与实现同步）');
  a(src.indexOf('自动合并任意世界') > 0 && src.indexOf('不在近期交付') > 0,
    'v2118/b9: [A8] 不做的事已登记（自动合并/去中心化/大规模并发不在近期交付）');
  // 两道「整份拒收」判据都在：事务**前**的干跑 + 事务**内**的逐条复检。
  //   冗余是有意的：store 在回调返回 false 时整片回滚，所以干跑这一道**不可单独现形**
  //   （撤掉它行为不变）—— 与其留一条永远绿的假破坏项，不如把「两道都在」钉在这里。
  a(src.indexOf('const dry = JSON.parse(JSON.stringify(state()));') > 0
    && src.indexOf('setPath(draft, live.ops[i].path') > 0,
    'v2118/b9: [A10] 整份拒收两道判据都在（干跑 + 事务内复检）');
  // 登记键与挤出站点同名同值（防两侧漂移）
  const pCap = /'coop\.proposals':\s*\{\s*cap:\s*(\d+)/.exec(storeSrc);
  const aCap = /'coop\.archive':\s*\{\s*cap:\s*(\d+)/.exec(storeSrc);
  a(pCap && pCap[1] === '24' && aCap && aCap[1] === '40', 'v2118/b9: [A9] 两键 cap 与 LIMITS 同源（24 / 40）');
}
function runAll(a) { judge(a); }
function runNegative(a) {
  a(BROKEN.length === 23 && new Set(BROKEN.map(function (x) { return x.key; })).size === 23,
    'v2118/b9: [N0] 破坏面覆盖 23 个互异锚点');
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2118/b9: [N0] 锚点在真源码中恰 1 次 :: ' + s.key + ' @ ' + s.rel); });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], PROBES[it.p]);
    a(got !== it.okk, 'v2118/b9: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  // N2：原版成立
  a(probeClean(PROBES.pStage) === 'pending-until-confirmed', 'v2118/b9: [N2] 原版成立 :: 确认前不标完成');
  a(probeClean(PROBES.pConfirm) === 'confirmed-and-applied', 'v2118/b9: [N2] 原版成立 :: 确认后写入世界并落回执');
  a(probeClean(PROBES.pSelf) === 'self-refused', 'v2118/b9: [N2] 原版成立 :: 权威与提交不同人');
  a(probeClean(PROBES.pNoBase) === 'base-required', 'v2118/b9: [N2] 原版成立 :: 提议必须带基础版本');
  a(probeClean(PROBES.pStamp) === 'stamp-content-only', 'v2118/b9: [N2] 原版成立 :: 版本戳只对内容面求指纹');
  a(probeClean(PROBES.pStale) === 'stale-refused', 'v2118/b9: [N2] 原版成立 :: 版本不等即拒（不自动合并）');
  a(probeClean(PROBES.pBookkeeping) === 'bookkeeping-inert', 'v2118/b9: [N2] 原版成立 :: 协作簿记不推动版本');
  a(probeClean(PROBES.pHolder) === 'claim-not-taken', 'v2118/b9: [N2] 原版成立 :: 占用不夺取');
  a(probeClean(PROBES.pFree) === 'free-ok', 'v2118/b9: [N2] 原版成立 :: 无占用时正常确认（占用判据非恒拦）');
  a(probeClean(PROBES.pPartial) === 'all-or-nothing', 'v2118/b9: [N2] 原版成立 :: 路径失败即整份拒收');
  a(probeClean(PROBES.pIdem) === 'idem-dedup', 'v2118/b9: [N2] 原版成立 :: opId 幂等');
  a(probeClean(PROBES.pOnce) === 'confirm-once', 'v2118/b9: [N2] 原版成立 :: 终态不重复确认');
  a(probeClean(PROBES.pRejReason) === 'reason-required', 'v2118/b9: [N2] 原版成立 :: 拒绝必须给理由');
  a(probeClean(PROBES.pArchive) === 'archived-full', 'v2118/b9: [N2] 原版成立 :: 归档带负载/裁决人/回执');
  a(probeClean(PROBES.pRetry) === 'retry-capped', 'v2118/b9: [N2] 原版成立 :: 重试有上限且可追溯');
  a(probeClean(PROBES.pView) === 'view-isolated', 'v2118/b9: [N2] 原版成立 :: 视点隔离');
  a(probeClean(PROBES.pReceipt) === 'receipt-rolled-back', 'v2118/b9: [N2] 原版成立 :: 回执未落即退回待处理');
  a(probeClean(PROBES.pOff) === 'off-refused', 'v2118/b9: [N2] 原版成立 :: 关闭拒收且零台账');
  a(probeClean(PROBES.pActor) === 'explicit-identity', 'v2118/b9: [N2] 原版成立 :: 身份只认显式 by');
  a(probeClean(PROBES.pUnknown) === 'unknown-refused', 'v2118/b9: [N2] 原版成立 :: 认不出的角色拒收');
  a(probeClean(PROBES.pOps) === 'ops-capped', 'v2118/b9: [N2] 原版成立 :: 负载上限 24');
  a(probeClean(PROBES.pFull) === 'queue-capped', 'v2118/b9: [N2] 原版成立 :: 待裁队列满如实拒收');
  a(probeClean(PROBES.pBounded) === 'bounded', 'v2118/b9: [N2] 原版成立 :: 两表有界且登记可见');
  a(probeClean(PROBES.pEvArch) === 'archive-bounded', 'v2118/b9: [N2] 原版成立 :: 归档在两轮终态写入后被挤回 40');
  a(probeClean(PROBES.pTrace) === 'traceable', 'v2118/b9: [N2] 原版成立 :: 裁决可追溯');
  a(probeClean(PROBES.pLabels) === 'four-distinct', 'v2118/b9: [N2] 原版成立 :: 四档标签互异');
  // N3：破坏互不串扰
  a(probeWith(BROKEN[B.evarc], PROBES.pStage) === 'pending-until-confirmed', 'v2118/b9: [N3] 破坏归档挤出不影响阶段初值');
  a(probeWith(BROKEN[B.visn], PROBES.pIdem) === 'idem-dedup', 'v2118/b9: [N3] 破坏视点识别不影响幂等');
  a(probeWith(BROKEN[B.auto], PROBES.pSelf) === 'self-refused', 'v2118/b9: [N3] 破坏角色归属不影响自审守卫');
  a(probeWith(BROKEN[B.reason], PROBES.pArchive) === 'archived-full', 'v2118/b9: [N3] 破坏拒绝理由不影响归档口径');
  a(probeWith(BROKEN[B.tries], PROBES.pStale) === 'stale-refused', 'v2118/b9: [N3] 破坏重试上限不影响版本守卫');
  // N4：判据非恒真
  const ok1 = probeClean(PROBES.pView);
  const bad1 = probeWith(BROKEN[B.visp], PROBES.pView);
  a(ok1 !== bad1 && ok1 === 'view-isolated', 'v2118/b9: [N4] 视点判据非恒真（原版 ' + ok1 + ' / 破坏 ' + bad1 + '）');
  const ok2 = probeClean(PROBES.pStamp);
  const bad2 = probeWith(BROKEN[B.stamp], PROBES.pStamp);
  a(ok2 !== bad2 && ok2 === 'stamp-content-only', 'v2118/b9: [N4] 版本戳判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pReceipt);
  const bad3 = probeWith(BROKEN[B.rbs], PROBES.pReceipt);
  a(ok3 !== bad3 && ok3 === 'receipt-rolled-back', 'v2118/b9: [N4] 回执回退判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
  const ok4 = probeClean(PROBES.pHolder);
  const bad4 = probeWith(BROKEN[B.holder], PROBES.pHolder);
  a(ok4 !== bad4 && ok4 === 'claim-not-taken', 'v2118/b9: [N4] 占用判据非恒真（原版 ' + ok4 + ' / 破坏 ' + bad4 + '）');
}
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('B9-COOP-V2118: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('B9-COOP-V2118: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };