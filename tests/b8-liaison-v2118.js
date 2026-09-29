#!/usr/bin/env node
// WorldAxis tests/b8-liaison-v2118.js -- B8 专锁：跨插件业务闭环（v2.118.0）
//
// 规划 02 的 B8 原文要点：「WorldAxis 负责确认世界事实与后果，RubyPhone 负责故事中的手机
//   交互，记忆插件提供有来源的证据读取和检索。伙伴缺席时保持单插件可用；接入状态要来自
//   现场能力探测。现有 phone-bridge 只登记 message/pin/block/unblock 等动作，并可关联已存在
//   的因果链；**它没有监听或自动创建/结算业务链**。新增闭环是『接收操作—校验聊天/分支/
//   参与者—确认或拒绝—形成对应的消息/约定任务—到期与回执—产生人物认知和关系后果』。
//   **opId 贯穿两端，重复请求只返回原结果**。『已提交到桥』『已发送』『已送达』『对方已知晓』
//   『已产生后果』**分别表达**。断网、插件关闭和容量满时**保留待确认或可重试状态**；
//   **不能记录一次操作就声称对方已收到**，更不能让 pin/block 等界面操作**无条件**造成关系变化。
//   记忆内容作为证据来源，附对象、时间、来源轮次和有效范围；WorldAxis 确认过的事实不会通过
//   另一插件再次导入时重复结算。读取模糊或冲突记忆时保留不确定状态，避免回路把同一传闻反复增强。
//
// 落点：engines/liaison.js（新顶层容器 liaison { inbox, deals, evidence }）。
//   三处登记（evict.SITES / store 骨架 / store __BOUNDED_CAPS）由 [A1]–[A3] 守住。
//
// 本锁逐条守住的语义 —— 每一条都是「写出来了、但某个条件下不会成立」：
//   ① 登记 ≠ 送达：阶段五档**逐个**表达，新行永远只到 submitted。
//   ② 无依据不推进：sent 要桥确认、delivered 要行动真在跑、known 要问得出在场；
//      终档只能由 settleDeal 给出（advance 不许跳终档、不许跳档、不许倒退）。
//   ③ opId 幂等：重复请求返回**同一行原结果**，不重复登记、不重复建任务。
//   ④ 重复结算只返回原结果：同一条约定第二次结算不重复落证据、不重复奖惩。
//   ⑤ 桥缺席/关闭/满员 ⇒ 保留待确认（pending + 可重试），不假装成功、也不吞掉。
//   ⑥ 关系后果默认关，且只认**已结算的约定**（界面动作永不无条件造成关系变化）。
//   ⑦ 失约不等于故意失约：好感不降，只落认知与证据，且如实回报「这一步没做」。
//   ⑧ 证据带来源（dealId/actId/opId/时间/范围），追得回那笔操作。
//   ⑨ 三张表各自有界且挤出有账。
//   ⑩ 关闭时拒收（不产生半截台账）；认不出的参与者不进闭环（不凭空建人）。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
// 破坏只改内存副本（srcOverride），零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__b8l2118_';
const REL = 'engines/liaison.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_IDEM  = "    const hit = rowsOf().filter(function (x) { return x && x.opId === opId; })[0];\n    if (hit) {";
const A_SUB   = "        stage: 'submitted', stageLabel: STAGE_CN.submitted,";
const A_SKIP  = "    if (idx > cidx + 1) { noteFault('stage-skip'); return { ok: false, reason: 'stage-skip', from: cur.stage, to: to }; }";
const A_BASIS = "      if (!cur.bridged) { noteFault('no-basis:bridge'); return { ok: false, reason: 'no-basis', need: 'bridge-ack', got: cur.bridgeReason || 'not-bridged' }; }";
const A_ACTR  = "      if (!a || a.status !== 'running') { noteFault('no-basis:act'); return { ok: false, reason: 'no-basis', need: 'act-running', got: a ? a.status : 'missing-act' }; }";
const A_HERE  = "      if (!place) { noteFault('no-basis:presence'); return { ok: false, reason: 'no-basis', need: 'recipient-present', got: 'unknown' }; }";
const A_FINAL = "    if (idx === STAGES.length - 1) { noteFault('settle-not-here'); return { ok: false, reason: 'settle-not-here', note: '终档只能由 settleDeal 给出' }; }";
const A_DUE   = "    const capped = live.slice(0, Math.max(1, Math.min(LIMITS.MAX_DUE, cfg.maxDue)));";
const A_EVDED = "      if (!n.evidence.some(function (e) { return e && e.key === key; })) {";
const A_TRM   = "    if (d0.status === 'done' || d0.status === 'failed' || d0.status === 'cancelled') {";
const A_TRM2  = "      if (d.status === 'done' || d.status === 'failed' || d.status === 'cancelled') {";
const A_RELOF = "    if (cfg.affectsRelation) {";
const A_NONEG = "    if (!done) {\n      return { ok: false, reason: 'no-negative-step', person: who,";
const A_PEND  = "    if (nb.pending) { S.pending++; return Object.assign({}, out, { ok: true, pending: true, bridgeReason: nb.reason, stage: 'submitted' }); }";
const A_BRD   = "      hit.bridged = !!ok; hit.bridgeReason = str(reason, 40);";
const A_OWNER = "    const owner = from || with_;";
const A_EVSRC = "          source: { dealId: id, actId: d.actId, opId: srcRow ? srcRow.opId : '', at: t, range: 'relation' } });";
const A_UNK   = "    if (unknown.length) {";
const A_EVIN  = "      if (WA.evict) WA.evict.array(n.inbox, 'liaison.inbox');";
const A_EVEV  = "        if (WA.evict) WA.evict.array(n.evidence, 'liaison.evidence');";
const A_HALF  = "      else return Object.assign({}, out, { ok: false, reason: d.reason, kept: true,";
const A_TRACE = "        note: deal ? '' : '这笔操作还没有对应的世界侧约定任务（只有台账）' };";
const A_PRE   = "      if (keys[i] === who || keys[i] === 'p_' + who || p.name === who || p.id === who) return p;";
const A_RETRY = "    if (cur.bridged) { S.reused++; return { ok: true, reused: true, opId: op, note: '已在桥侧登记，不重复' }; }";
const A_WHERE = "      if (WA.world && typeof WA.world.where === 'function') {";

const BROKEN = [
  { rel: REL, key: 'idem',  from: A_IDEM,  to: "    const hit = rowsOf().filter(function (x) { return x && x.opId === opId; })[0];\n    if (false) {",
    why: 'opId 幂等失效 ⇒ 手机侧重试会长出第二笔台账与第二个任务' },
  { rel: REL, key: 'sub',   from: A_SUB,   to: "        stage: 'sent', stageLabel: STAGE_CN.sent,",
    why: '新行直接标成「已发送」⇒ 登记被冒充成送达（B8 第一条否定式）' },
  { rel: REL, key: 'skip',  from: A_SKIP,  to: "    if (false) { noteFault('stage-skip'); return { ok: false, reason: 'stage-skip', from: cur.stage, to: to }; }",
    why: '允许跳档 ⇒ 「已提交」可以一步跳到「对方已知晓」' },
  { rel: REL, key: 'basis', from: A_BASIS, to: "      if (false) { noteFault('no-basis:bridge'); return { ok: false, reason: 'no-basis', need: 'bridge-ack', got: cur.bridgeReason || 'not-bridged' }; }",
    why: 'sent 不要桥确认 ⇒ 桥缺席也能声称已发送' },
  { rel: REL, key: 'actr',  from: A_ACTR,  to: "      if (false) { noteFault('no-basis:act'); return { ok: false, reason: 'no-basis', need: 'act-running', got: a ? a.status : 'missing-act' }; }",
    why: 'delivered 不要行动依据 ⇒ 行动还停在 planned 就说已送达' },
  { rel: REL, key: 'here',  from: A_HERE,  to: "      if (false) { noteFault('no-basis:presence'); return { ok: false, reason: 'no-basis', need: 'recipient-present', got: 'unknown' }; }",
    why: 'known 不要在场依据 ⇒ 「对方已知晓」变成不需理由即可宣称的话' },
  { rel: REL, key: 'final', from: A_FINAL, to: "    if (false) { noteFault('settle-not-here'); return { ok: false, reason: 'settle-not-here', note: '终档只能由 settleDeal 给出' }; }",
    why: 'advance 能跳终档 ⇒ 「已产生后果」绕过到期结算' },
  { rel: REL, key: 'due',   from: A_DUE,   to: "    const capped = live.slice(0, live.length);",
    why: '一轮把整局未结的全结算掉 ⇒ 一开就把玩家攒的约定一次性清算' },
  { rel: REL, key: 'evded', from: A_EVDED, to: "      if (true) {",
    why: '证据不去重 ⇒ 重复载入把同一件事记多次（记忆被回路反复增强）' },
  { rel: REL, key: 'relof', from: A_RELOF, to: "    if (true) {",
    why: '关系后果无条件生效 ⇒ 界面动作直接造成关系变化（B8 点名禁止）' },
  { rel: REL, key: 'noneg', from: A_NONEG, to: "    if (false) {\n      return { ok: false, reason: 'no-negative-step', person: who,",
    why: '失约也降好感 ⇒ 「到期」被当成「故意」' },
  { rel: REL, key: 'pend',  from: A_PEND,  to: "    if (false) { S.pending++; return Object.assign({}, out, { ok: true, pending: true, bridgeReason: nb.reason, stage: 'submitted' }); }",
    why: '桥缺席时假装成功 ⇒ 断网/插件关闭可重试状态被吞掉' },
  { rel: REL, key: 'brd',   from: A_BRD,   to: "      hit.bridged = true; hit.bridgeReason = str(reason, 40);",
    why: '桥侧登记失败也标成已登记 ⇒ 待确认被冒充成已发送' },
  { rel: REL, key: 'owner', from: A_OWNER, to: "    const owner = with_;",
    why: '约定主体取错人 ⇒ 答应的事挂在对方名下（谁答应谁去做被反转）' },
  { rel: REL, key: 'evsrc', from: A_EVSRC, to: "          source: { dealId: id, actId: d.actId, opId: '', at: t, range: 'relation' } });",
    why: '证据来源留空 ⇒ 追不回那笔操作（B8 要求证据「附来源轮次」）' },
  { rel: REL, key: 'unk',   from: A_UNK,   to: "    if (false) {",
    why: '认不出的人也进闭环 ⇒ 凭空建人、凭空建关系后果' },
  { rel: REL, key: 'evin',  from: A_EVIN,  to: "      if (false) WA.evict.array(n.inbox, 'liaison.inbox');",
    why: '收件台账无界增长 ⇒ 长局存档被拖垮' },
  { rel: REL, key: 'half',  from: A_HALF,  to: "      else return Object.assign({}, out, { ok: false, reason: d.reason, kept: false,",
    why: '半成功说成整笔丢失 ⇒ 调用方重推，而重推撞幂等只拿回同一行（看起来什么都没发生）' },
  { rel: REL, key: 'trace', from: A_TRACE, to: "        note: '' };",
    why: '「还没有世界侧后果」不可见 ⇒ 一笔只挂在台账上的操作看起来已经落地' },
  { rel: REL, key: 'pre',   from: A_PRE,   to: "      if (keys[i] === who) return p;",
    why: '只认容器键 ⇒ 带前缀/按名字传的参与者被误判成不认识' },
  { rel: REL, key: 'retry', from: A_RETRY, to: "    if (false) { S.reused++; return { ok: true, reused: true, opId: op, note: '已在桥侧登记，不重复' }; }",
    why: '已登记的也能重推 ⇒ 断线恢复把同一笔反复上报到桥' },
  { rel: REL, key: 'where', from: A_WHERE, to: "      if (WA.world && typeof WA.world.at === 'function') {",
    why: '在场真源名写错 ⇒ 「对方已知晓」永无依据，整档成死档' }
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
// ── 夹具 ──────────────────────────────────────────────────────────────
// 四个人：甲（有 active 目标 g1，可挂约定）/ 乙（无目标）/ 丙（不在场，用于「认不出」）
function reset(WA) {
  WA.act.setSettings({ enabled: false, maxActs: 8 });
  WA.world.setSettings({ enabled: false });
  WA.phoneBridge.setSettings({ enabled: false, linkCausal: true });
  WA.liaison.setSettings({ enabled: false, affectsRelation: false, maxDue: 4 });
  WA.fondness.setSettings({ enabled: false });
  WA.store.transact(function (d) {
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', resources: {}, updatedAt: 1, knowledge: { intel: [] },
        life: { goals: [{ id: 'g1', text: '去见乙', obstacle: '', status: 'active' }] }, schedule: [] },
      'p_乙': { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1, knowledge: { intel: [] },
        life: { goals: [] }, schedule: [] }
    };
    d.world = d.world && typeof d.world === 'object' ? d.world : {};
    d.world.places = [{ id: 'pl_A', name: '甲地', kind: 'public' }, { id: 'pl_B', name: '乙地', kind: 'public' }];
    d.world.roads = [{ id: 'rd_1', a: '甲地', b: '乙地', minutes: 30 }];
    // 行程面必须清：settleDeal 会写人（认知）与 evidence，而 store 在同一进程里跨用例存活
    d.world.journeys = [];
    d.acts = { rows: [], res: [] };
    d.liaison = { inbox: [], deals: [], evidence: [] };
    d.fondness = { rows: [] };
    // 桥台账必须清：store 在同一进程里跨用例存活，不清则「一笔操作在两侧各留一行」
    //   与「重试不重复上报」两条判据读到的是**累计**值（实测：N2 的 retry 与 C 段的贯穿判据）。
    d.causal = d.causal && typeof d.causal === 'object' ? d.causal : { chains: [], settled: [] };
    d.causal.phoneOps = [];
  }, TAG + 'reset');
  WA.act.setSettings({ enabled: true, maxActs: 8 });
  WA.world.setSettings({ enabled: true });
  WA.phoneBridge.setSettings({ enabled: true, linkCausal: true });
  WA.liaison.setSettings({ enabled: true, affectsRelation: false, maxDue: 4 });
  return WA;
}
/** 让某人的位置问得出来（world.where 的真源是 journeys 里最后一条 arrived）。 */
function arrival(WA, person, place) {
  WA.store.transact(function (d) {
    d.world.journeys = d.world.journeys || [];
    d.world.journeys.push({ id: 'j_' + person, person: person, from: '甲地', to: place,
      status: 'arrived', left: 0, at: 1, why: TAG });
  }, TAG + 'arrival');
}
const OP = { opId: 'op_a', act: 'message', from: '甲', to: '乙' };
function withDue(o) { return Object.assign({}, OP, o || {}); }
// ── 判据（每条返回**语义常量串**：原版永远同一个词）────────────────────
const PROBES = {
  // ① opId 幂等：第二次只拿回同一行原结果
  pIdem: function (env) {
    const WA = mkW(env.ov);
    const r1 = WA.liaison.receive(withDue());
    const r2 = WA.liaison.receive(withDue());
    const n = WA.liaison.inbox(50).length;
    return (r2.reused === true && r2.id === r1.id && n === 1) ? 'idem-dedup' : 'dup:' + n;
  },
  // ② 新行只到 submitted（登记 ≠ 送达）
  pSub: function (env) {
    const WA = mkW(env.ov);
    const r = WA.liaison.receive(withDue());
    return (r.stage === 'submitted') ? 'submitted-only' : 'stage:' + r.stage;
  },
  // ③ 不许跳档
  pSkip: function (env) {
    const WA = mkW(env.ov);
    WA.liaison.receive(withDue());
    WA.liaison.advance('op_a', 'sent', 'x');
    const r = WA.liaison.advance('op_a', 'known', 'x');
    return (r.ok === false && r.reason === 'stage-skip') ? 'skip-refused' : 'jumped:' + r.stage;
  },
  // ④ sent 需要桥确认：桥关闭时只能停在 submitted
  pBasis: function (env) {
    const WA = mkW(env.ov);
    WA.phoneBridge.setSettings({ enabled: false });
    const r0 = WA.liaison.receive(withDue());
    const r = WA.liaison.advance('op_a', 'sent', 'x');
    return (r0.pending === true && r.ok === false && r.reason === 'no-basis') ? 'bridge-gated' : 'claimed:' + (r.stage || r.reason);
  },
  // ⑤ delivered 需要行动真的在跑
  pActr: function (env) {
    const WA = mkW(env.ov);
    WA.liaison.receive(withDue({ dueAt: 9e12 }));
    WA.liaison.advance('op_a', 'sent', 'x');
    const r = WA.liaison.advance('op_a', 'delivered', 'x');   // acts 里那行还是 planned
    return (r.ok === false && r.reason === 'no-basis') ? 'act-gated' : 'passed:' + r.stage;
  },
  // ⑥ known 需要在场依据（有到达记录才升得上去）
  pKnown: function (env) {
    const WA = mkW(env.ov);
    WA.liaison.receive(withDue({ dueAt: 9e12 }));
    WA.liaison.advance('op_a', 'sent', 'x');
    WA.store.transact(function (d) { d.acts.rows[0].status = 'running'; }, TAG);
    WA.liaison.advance('op_a', 'delivered', 'x');
    const bad = WA.liaison.advance('op_a', 'known', 'x');        // 乙还没有到达记录
    arrival(WA, '乙', '乙地');
    const good = WA.liaison.advance('op_a', 'known', 'x');
    return (bad.ok === false && bad.reason === 'no-basis' && good.ok === true) ? 'known-with-basis'
      : 'bad:' + bad.reason + '/good:' + good.stage;
  },
  // ⑦ 终档只能由 settleDeal 给出
  pFinal: function (env) {
    const WA = mkW(env.ov);
    WA.liaison.receive(withDue({ dueAt: 9e12 }));
    const r = WA.liaison.advance('op_a', 'settled', 'x');
    return (r.ok === false && r.reason === 'settle-not-here') ? 'settle-not-here' : 'advanced:' + r.stage;
  },
  // ⑧ 一轮最多结算 maxDue 条
  pDue: function (env) {
    const WA = mkW(env.ov);
    WA.phoneBridge.setSettings({ enabled: true });
    for (let i = 0; i < 6; i++) WA.liaison.receive({ opId: 'op_d' + i, act: 'message', from: '甲', to: '乙', dueAt: 1000 });
    const r = WA.liaison.settleDue(5000);
    return (r.considered === 4 && r.skipped === 2) ? 'due-capped' : 'considered:' + r.considered + '/skipped:' + r.skipped;
  },
  // ⑨ 同一 deal 不重复落证据
  //    夹具要点（第一批实测踩过）：两次**普通**结算时，外面的终态门就先拦下了，
  //    证据去重这道门根本轮不到被检验 —— 判据会变成恒真话。
  //    故先把约定状态退回 pending（跨版本存档 / 外部写入的真实形态），
  //    此时两道终态门都不拦，证据去重成为最后一道防线，破坏它才有现形的余地。
  pEvDedup: function (env) {
    const WA = mkW(env.ov);
    const r = WA.liaison.receive(withDue({ dueAt: 1000 }));
    WA.liaison.settleDeal(r.dealId, 5000);
    WA.store.transact(function (d) {
      const dl = (d.liaison.deals || []).filter(function (x) { return x && x.id === r.dealId; })[0];
      if (dl) { dl.status = 'pending'; dl.settledAt = 0; }
    }, TAG + 'rewind');
    WA.liaison.settleDeal(r.dealId, 6000);
    return (WA.liaison.evidence(50).length === 1) ? 'evidence-once' : 'ev:' + WA.liaison.evidence(50).length;
  },
  // ⑩ 终态约定不重复结算
  pSettleOnce: function (env) {
    const WA = mkW(env.ov);
    const r = WA.liaison.receive(withDue({ dueAt: 1000 }));
    WA.liaison.settleDeal(r.dealId, 5000);
    const s2 = WA.liaison.settleDeal(r.dealId, 6000);
    return (s2.ok === true && s2.reused === true) ? 'settle-once' : 'recounted:' + s2.reused;
  },
  // ⑪ 关系后果默认关（界面动作不无条件造成关系变化）
  pRelOff: function (env) {
    const WA = mkW(env.ov);
    WA.fondness.setSettings({ enabled: true });
    const r = WA.liaison.receive(withDue({ dueAt: 1000 }));
    WA.store.transact(function (d) { d.acts.rows[0].status = 'done'; }, TAG);
    const s = WA.liaison.settleDeal(r.dealId, 5000);
    const v = WA.fondness.read('乙');
    const val = v && v.value ? v.value : 0;
    return (s.relation && s.relation.ok === false && val === 0) ? 'relation-off' : 'moved:' + val;
  },
  // ⑫ 打开且如约完成 ⇒ 真的给一步正向（走 fondness 单一出口）
  pRelOn: function (env) {
    const WA = mkW(env.ov);
    WA.liaison.setSettings({ affectsRelation: true });
    WA.fondness.setSettings({ enabled: true });
    const r = WA.liaison.receive(withDue({ dueAt: 1000 }));
    WA.store.transact(function (d) { d.acts.rows[0].status = 'done'; }, TAG);
    const s = WA.liaison.settleDeal(r.dealId, 5000);
    return (s.relation && s.relation.ok === true && s.relation.delta === 0.3) ? 'relation-positive'
      : 'rel:' + JSON.stringify(s.relation);
  },
  // ⑬ 失约不等于故意失约：好感不降，如实回报「这一步没做」
  pRelNeg: function (env) {
    const WA = mkW(env.ov);
    WA.liaison.setSettings({ affectsRelation: true });
    WA.fondness.setSettings({ enabled: true });
    const r = WA.liaison.receive(withDue({ dueAt: 1000 }));   // acts 那行停在 planned ⇒ 失约
    const s = WA.liaison.settleDeal(r.dealId, 5000);
    const v = WA.fondness.read('乙');
    const val = v && v.value ? v.value : 0;
    return (s.relation && s.relation.ok === false && s.relation.reason === 'no-negative-step' && val === 0)
      ? 'no-negative-step' : 'rel:' + JSON.stringify(s.relation) + '/val:' + val;
  },
  // ⑭ 桥缺席 ⇒ 保留待确认（可重试），不假装成功
  pPend: function (env) {
    const WA = mkW(env.ov);
    WA.phoneBridge.setSettings({ enabled: false });
    const r = WA.liaison.receive(withDue());
    const rows = WA.liaison.inbox(50);
    return (r.pending === true && r.bridgeReason === 'disabled' && rows.length === 1 && rows[0].stage === 'submitted')
      ? 'pending-kept' : 'r:' + JSON.stringify(r);
  },
  // ⑮ 桥侧登记失败要如实标在行上（待确认 ≠ 已登记）
  pBrd: function (env) {
    const WA = mkW(env.ov);
    WA.phoneBridge.setSettings({ enabled: false });
    WA.liaison.receive(withDue());
    const row = WA.liaison.inbox(50)[0];
    const p = WA.liaison.pendingRows();
    return (row.bridged === false && p.length === 1 && p[0].retryable === true) ? 'not-bridged' : 'bridged:' + row.bridged;
  },
  // ⑯ 重试：已登记的拒绝重复上报
  pRetry: function (env) {
    const WA = mkW(env.ov);
    const r0 = WA.liaison.receive(withDue());
    const r = WA.liaison.retry('op_a');
    const n = (WA.store.get().causal.phoneOps || []).length;
    return (r0.ok === true && r.reused === true && n === 1) ? 'retry-dedup' : 'reposted:' + n;
  },
  // ⑰ 主体是发起方（谁答应的谁去做）
  pOwner: function (env) {
    const WA = mkW(env.ov);
    const r = WA.liaison.receive(withDue({ dueAt: 9e12 }));
    const d = WA.liaison.deals()[0];
    const a = (WA.store.get().acts.rows || [])[0];
    return (d.partA === '甲' && d.partB === '乙' && a && a.person === '甲') ? 'owner-is-sender'
      : 'owner:' + (a && a.person);
  },
  // ⑱ 证据带来源（追得回那笔操作）
  pEvSrc: function (env) {
    const WA = mkW(env.ov);
    const r = WA.liaison.receive(withDue({ dueAt: 1000 }));
    WA.liaison.settleDeal(r.dealId, 5000);
    const e = WA.liaison.evidence(50)[0];
    const src = e && e.source;
    return (src && src.opId === 'op_a' && src.dealId === r.dealId && src.range === 'relation') ? 'source-linked'
      : 'src:' + JSON.stringify(src);
  },
  // ⑲ 认不出的参与者不进闭环
  pUnk: function (env) {
    const WA = mkW(env.ov);
    const r = WA.liaison.receive({ opId: 'op_z', act: 'message', from: '丙', to: '乙' });
    return (r.ok === false && r.reason === 'unknown-participant' && WA.liaison.inbox(50).length === 0)
      ? 'unknown-refused' : 'r:' + JSON.stringify(r);
  },
  // ⑳ 带前缀 / 按名字传都认得出（不误报不认识）
  pPre: function (env) {
    const WA = mkW(env.ov);
    const r1 = WA.liaison.receive({ opId: 'op_p1', act: 'message', from: 'p_甲', to: 'p_乙' });
    const r2 = WA.liaison.receive({ opId: 'op_p2', act: 'message', from: '甲', to: '乙' });
    return (r1.ok === true && r2.ok === true) ? 'prefix-ok' : 'r1:' + r1.reason + '/r2:' + r2.reason;
  },
  // ㉑ 收件台账有界
  pEvIn: function (env) {
    const WA = mkW(env.ov);
    for (let i = 0; i < 60; i++) WA.liaison.receive({ opId: 'op_n' + i, act: 'message', from: '甲', to: '乙' });
    const n = WA.liaison.inbox(200).length;
    return (n === 40) ? 'inbox-bounded' : 'n:' + n;
  },
  // ㉒ 证据表有界（**诚实口径**）
  //    一条 deal 一条证据，而 deals 的 cap 是 24 < evidence 的 40 ⇒ 证据的 40 是
  //    **防御性上界**，正常路径打不满。判据因此落在「证据数 = 成功结算数，且不超 cap」，
  //    不假装 40 会被打满（第一批实测：按旧口径断言 n===40 必然失败，是判据前提错）。
  pEvEv: function (env) {
    const WA = mkW(env.ov);
    let ok = 0;
    for (let i = 0; i < 45; i++) {
      const r = WA.liaison.receive({ opId: 'op_b' + i, act: 'message', from: '甲', to: '乙', dueAt: 1000 });
      if (!r.ok) continue;
      if (WA.liaison.settleDeal(r.dealId, 5000).ok) ok++;
    }
    const n = WA.liaison.evidence(500).length;
    const cap = WA.store.sizeCaps()['liaison.evidence'].cap;
    return (n === ok && ok === 24 && n <= cap) ? 'evidence-bounded' : 'n:' + n + '/ok:' + ok;
  },
  // ㉓ 半成功如实分列（收件落进了台账，世界侧约定没形成）
  pHalf: function (env) {
    const WA = mkW(env.ov);
    WA.act.setSettings({ enabled: false });          // 行动侧关了 ⇒ 约定建不成
    const r = WA.liaison.receive(withDue({ dueAt: 9e12 }));
    return (r.ok === false && r.kept === true && WA.liaison.inbox(50).length === 1) ? 'half-honest'
      : 'r:' + JSON.stringify(r);
  },
  // ㉔ 没有世界侧后果的操作必须可见
  pTrace: function (env) {
    const WA = mkW(env.ov);
    WA.liaison.receive(withDue());                    // 无期限 ⇒ 不建任务
    const t = WA.liaison.traceOf('op_a');
    return (t.ok === true && t.deal === null && t.note && t.note.length > 0) ? 'gap-visible' : 't:' + JSON.stringify(t);
  },
  // ㉕ 关闭时拒收，且零台账
  pOff: function (env) {
    const WA = mkW(env.ov);
    WA.liaison.setSettings({ enabled: false });
    const r = WA.liaison.receive(withDue({ dueAt: 1000 }));
    const s = WA.liaison.settleDue(5000);
    return (r.ok === false && r.reason === 'disabled' && s.ok === false && WA.liaison.inbox(50).length === 0)
      ? 'off-refused' : 'ran';
  },
  // ㉖ 缺 opId 拒收（幂等键是闭环的前提）
  pNoOp: function (env) {
    const WA = mkW(env.ov);
    const r = WA.liaison.receive({ act: 'message', from: '甲', to: '乙' });
    return (r.ok === false && r.reason === 'missing-op') ? 'no-op-refused' : 'r:' + JSON.stringify(r);
  },
  // ㉗ 阶段标签逐个可读（五档分别表达）
  pLabels: function (env) {
    const WA = mkW(env.ov);
    const cn = WA.liaison.STAGE_CN;
    const v = WA.liaison.view({});
    const uniq = {}; v.stages.forEach(function (s) { uniq[cn[s]] = 1; });
    return (Object.keys(uniq).length === 5) ? 'five-distinct' : 'dup:' + Object.keys(uniq).length;
  }
};
// ── N1：破坏现形（每条给出「破坏后必须不再是原版结论」）──
const N1 = [
  { k: 'idem',  p: PROBES.pIdem,       okk: 'idem-dedup',     note: 'opId 幂等失效' },
  { k: 'sub',   p: PROBES.pSub,        okk: 'submitted-only', note: '登记被冒充成已发送' },
  { k: 'skip',  p: PROBES.pSkip,       okk: 'skip-refused',   note: '允许跳档' },
  { k: 'basis', p: PROBES.pBasis,      okk: 'bridge-gated',   note: 'sent 不要桥确认' },
  { k: 'actr',  p: PROBES.pActr,       okk: 'act-gated',      note: 'delivered 不要行动依据' },
  { k: 'here',  p: PROBES.pKnown,      okk: 'known-with-basis', note: 'known 不要在场依据' },
  { k: 'final', p: PROBES.pFinal,      okk: 'settle-not-here', note: 'advance 能跳终档' },
  { k: 'due',   p: PROBES.pDue,        okk: 'due-capped',     note: '一轮把整局未结的全结算' },
  { k: 'evded', p: PROBES.pEvDedup,    okk: 'evidence-once',  note: '证据不去重' },
  { k: 'relof', p: PROBES.pRelOff,     okk: 'relation-off',   note: '关系后果无条件生效' },
  { k: 'noneg', p: PROBES.pRelNeg,     okk: 'no-negative-step', note: '失约也降好感' },
  { k: 'pend',  p: PROBES.pPend,       okk: 'pending-kept',   note: '桥缺席时假装成功' },
  { k: 'brd',   p: PROBES.pBrd,        okk: 'not-bridged',    note: '登记失败也标成已登记' },
  { k: 'owner', p: PROBES.pOwner,      okk: 'owner-is-sender', note: '约定主体取错人' },
  { k: 'evsrc', p: PROBES.pEvSrc,      okk: 'source-linked',  note: '证据来源留空' },
  { k: 'unk',   p: PROBES.pUnk,        okk: 'unknown-refused', note: '认不出的人也进闭环' },
  { k: 'evin',  p: PROBES.pEvIn,       okk: 'inbox-bounded',  note: '收件台账无界增长' },
  { k: 'half',  p: PROBES.pHalf,       okk: 'half-honest',    note: '半成功说成整笔丢失' },
  { k: 'trace', p: PROBES.pTrace,      okk: 'gap-visible',    note: '缺口不可见' },
  { k: 'pre',   p: PROBES.pPre,        okk: 'prefix-ok',      note: '只认容器键' },
  { k: 'retry', p: PROBES.pRetry,      okk: 'retry-dedup',    note: '已登记的也能重推' },
  { k: 'where', p: PROBES.pKnown,      okk: 'known-with-basis', note: '在场真源名写错（整档成死档）' }
];
function judge(a) {
  // ── A 静态段：登记链与装载面（不跑世界，只看源码与骨架） ──
  const ev = readSrc('core/evict.js');
  const st = readSrc('core/store.js');
  const ix = readSrc('index.js');
  const rj = readSrc('tests/run.js');
  const src = readSrc(REL);
  a(ev.indexOf("'liaison.inbox'") >= 0 && ev.indexOf("'liaison.deals'") >= 0 && ev.indexOf("'liaison.evidence'") >= 0,
    'v2118/b8: [A1] evict.SITES 登记 liaison 三表');
  a(/liaison\.inbox[^\n]*cap:\s*40/.test(ev) && /liaison\.deals[^\n]*cap:\s*24/.test(ev) && /liaison\.evidence[^\n]*cap:\s*40/.test(ev),
    'v2118/b8: [A1] 站点 cap 与 LIMITS 同源（40/24/40）');
  a(st.indexOf('liaison: { inbox: [], deals: [], evidence: [] }') >= 0,
    'v2118/b8: [A2] store 骨架物化 liaison（冷启动直写不炸事务）');
  a(st.indexOf("'liaison.inbox'") >= 0 && st.indexOf("'liaison.deals'") >= 0 && st.indexOf("'liaison.evidence'") >= 0,
    'v2118/b8: [A3] __BOUNDED_CAPS 登记同键（挤出侧有账）');
  a(ix.indexOf("'engines/liaison.js'") >= 0 && rj.indexOf("'engines/liaison.js'") >= 0,
    'v2118/b8: [A4] index.js / tests/run.js 两处 LOAD 都登记');
  // 两个插件缺席时**本模块仍可用**（B8 原文：「伙伴缺席时保持单插件可用」）——
  //   源码层的事实：出站边与在场查询都带 typeof 守卫，不是直呼。
  a(src.indexOf("typeof WA.phoneBridge.noteAction === 'function'") >= 0,
    'v2118/b8: [A5] 桥缺席有守卫（单插件可用）');
  a(src.indexOf("typeof WA.world.where === 'function'") >= 0,
    'v2118/b8: [A6] 在场查询带守卫（世界面缺席不炸）');
  // 五档与五态都是具名常量（不是散落的字符串字面量）
  a(src.indexOf("const STAGES = ['submitted', 'sent', 'delivered', 'known', 'settled'];") >= 0,
    'v2118/b8: [A7] 阶段五档是具名常量');
  a(src.indexOf("const DEAL_STATUS = ['pending', 'due', 'done', 'failed', 'cancelled'];") >= 0,
    'v2118/b8: [A8] 约定状态是具名常量');
  // 关系后果只走既有单一出口，不自造关系模型
  a(src.indexOf('const F = WA.fondness;') >= 0 && src.indexOf('WA.relation') < 0,
    'v2118/b8: [A9] 关系后果走 fondness 单一出口（不另造关系模型）');
  // 总开关默认关
  a(/enabled: false,/.test(src) && /affectsRelation: false,/.test(src),
    'v2118/b8: [A10] 总开关与关系后果默认关');
  // 终态复检**两道门**同时存在（外层快路径 + 事务内复检）。
  //   为什么不设破坏项：两道门互为冗余 —— 单独拆掉任一道，另一道会补上，
  //   行为不变（第一批实测两条都不可现形）。诚实的做法是钉住「两道都在」，
  //   而不是留一条永远绿的假破坏项充数。
  a(src.indexOf(A_TRM) >= 0 && src.indexOf(A_TRM2) >= 0,
    'v2118/b8: [A11] 终态复检两道门同时存在（冗余是有意的）');
  // 证据去重门（最后一道防线）在源码里存在
  a(src.indexOf(A_EVDED) >= 0, 'v2118/b8: [A12] 证据去重门在源码里存在');
  // ── B 运行时段 ──
  const map = { idem: 'pIdem', sub: 'pSub', skip: 'pSkip', basis: 'pBasis', actr: 'pActr',
    here: 'pKnown', final: 'pFinal', due: 'pDue', evded: 'pEvDedup', trm: 'pSettleOnce',
    relof: 'pRelOn', noneg: 'pRelNeg', pend: 'pPend', brd: 'pBrd', owner: 'pOwner',
    evsrc: 'pEvSrc', unk: 'pUnk', evin: 'pEvIn', evev: 'pEvEv', half: 'pHalf',
    trace: 'pTrace', pre: 'pPre', retry: 'pRetry', where: 'pKnown',
    off: 'pOff', noop: 'pNoOp', labels: 'pLabels' };
  Object.keys(map).forEach(function (k) {
    const got = probeClean(PROBES[map[k]]);
    a(typeof got === 'string' && got.indexOf('threw:') !== 0,
      'v2118/b8: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
  });
  // 关系后果默认关这一条单独成判据（B8 点名的那句话）
  a(probeClean(PROBES.pRelOff) === 'relation-off', 'v2118/b8: [B] 默认关时界面动作不造成关系变化');
  // ── C 不变式段（结构断言，与 B 段互为交叉验证）──
  const W = mkW(null);
  const r0 = W.liaison.receive(withDue({ dueAt: 9e12 }));
  a(r0.ok === true && r0.reused === false, 'v2118/b8: [C] receive 收下一笔并返回新行');
  const tb = W.liaison.traceOf('op_a');
  a(tb.ok === true && tb.deal && tb.deal.status === 'pending' && tb.evidence.length === 0,
    'v2118/b8: [C] 约定建出来了但还没有证据（未结算 ≠ 有后果）');
  const v = W.liaison.view({});
  a(v.ok === true && v.stages.length === 5 && typeof v.byStage === 'object', 'v2118/b8: [C] view 只读面五档分列');
  a(typeof v.pendingRetry === 'number' && typeof W.liaison.statView().inbox === 'number',
    'v2118/b8: [C] 待确认可重试数在 view、容器读数在 statView（各归其位）');
  const P = W.liaison.pendingRows();
  a(Array.isArray(P) && P.length === 0, 'v2118/b8: [C] 桥正常时没有待确认行');
  // 顶层键由骨架物化（不是写侧临时造出来的）
  const top = Object.keys(W.store.get()).sort();
  a(top.indexOf('liaison') >= 0, 'v2118/b8: [C] liaison 由骨架物化（写侧不造顶层键）');
  // 三处容器都进得了 sizeCaps（挤出侧可解释）
  const caps = W.store.sizeCaps();
  a(caps['liaison.inbox'] && caps['liaison.inbox'].cap === 40, 'v2118/b8: [C] inbox 容量登记可见');
  // 真跑三个站点：实测丢弃数 = 长度 - cap（声明即执行）
  const execProbe = [];
  [['liaison.inbox', 40], ['liaison.deals', 24], ['liaison.evidence', 40]].forEach(function (pair) {
    const arr = [];
    for (let i = 0; i < pair[1] + 3; i++) arr.push({ i: i });
    const r = W.evict.array(arr, pair[0]);
    if (!r.ok || r.dropped !== 3 || arr.length !== pair[1]) execProbe.push(pair[0]);
  });
  a(execProbe.length === 0, 'v2118/b8: [C] 三站点「声明即执行」实测通过' + (execProbe.length ? '：' + execProbe.join('、') : ''));
  // 与 phone-bridge 的分工：一笔操作在两侧各留一行，但**语义不同**
  const W2 = mkW(null);
  W2.liaison.receive(withDue({ dueAt: 9e12 }));
  const ops = (W2.store.get().causal.phoneOps || []);
  const ib = W2.liaison.inbox(50);
  a(ops.length === 1 && ib.length === 1 && ib[0].opId === ops[0].opId,
    'v2118/b8: [C] opId 贯穿两端（桥台账与本模块收件按同一键对齐）');
  a(ib[0].stage === 'submitted' && typeof ops[0].stage === 'undefined',
    'v2118/b8: [C] 阶段属于本模块（桥只答「按下过什么」，不答「送到没有」）');
}
function runNegative(a) {
  a(BROKEN.length === 22 && new Set(BROKEN.map(function (x) { return x.key; })).size === 22,
    'v2118/b8: [N0] 破坏面覆盖 22 个互异锚点');
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2118/b8: [N0] 锚点在真源码中恰 1 次 :: ' + s.key + ' @ ' + s.rel); });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2118/b8: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  // N2：原版成立（语义常量串，逐条对照）
  a(probeClean(PROBES.pIdem) === 'idem-dedup', 'v2118/b8: [N2] 原版成立 :: opId 幂等');
  a(probeClean(PROBES.pSub) === 'submitted-only', 'v2118/b8: [N2] 原版成立 :: 新行只到 submitted');
  a(probeClean(PROBES.pSkip) === 'skip-refused', 'v2118/b8: [N2] 原版成立 :: 不许跳档');
  a(probeClean(PROBES.pBasis) === 'bridge-gated', 'v2118/b8: [N2] 原版成立 :: sent 要桥确认');
  a(probeClean(PROBES.pActr) === 'act-gated', 'v2118/b8: [N2] 原版成立 :: delivered 要行动依据');
  a(probeClean(PROBES.pKnown) === 'known-with-basis', 'v2118/b8: [N2] 原版成立 :: known 要在场依据');
  a(probeClean(PROBES.pFinal) === 'settle-not-here', 'v2118/b8: [N2] 原版成立 :: 终档只由结算给出');
  a(probeClean(PROBES.pDue) === 'due-capped', 'v2118/b8: [N2] 原版成立 :: 一轮结算有上限');
  a(probeClean(PROBES.pEvDedup) === 'evidence-once', 'v2118/b8: [N2] 原版成立 :: 证据不重复落');
  a(probeClean(PROBES.pSettleOnce) === 'settle-once', 'v2118/b8: [N2] 原版成立 :: 终态不重复结算');
  a(probeClean(PROBES.pRelOff) === 'relation-off', 'v2118/b8: [N2] 原版成立 :: 关系后果默认关');
  a(probeClean(PROBES.pRelOn) === 'relation-positive', 'v2118/b8: [N2] 原版成立 :: 如约给一步正向');
  a(probeClean(PROBES.pRelNeg) === 'no-negative-step', 'v2118/b8: [N2] 原版成立 :: 失约不降好感');
  a(probeClean(PROBES.pPend) === 'pending-kept', 'v2118/b8: [N2] 原版成立 :: 桥缺席保留待确认');
  a(probeClean(PROBES.pBrd) === 'not-bridged', 'v2118/b8: [N2] 原版成立 :: 未登记如实标');
  a(probeClean(PROBES.pRetry) === 'retry-dedup', 'v2118/b8: [N2] 原版成立 :: 重试不重复上报');
  a(probeClean(PROBES.pOwner) === 'owner-is-sender', 'v2118/b8: [N2] 原版成立 :: 主体是发起方');
  a(probeClean(PROBES.pEvSrc) === 'source-linked', 'v2118/b8: [N2] 原版成立 :: 证据带来源');
  a(probeClean(PROBES.pUnk) === 'unknown-refused', 'v2118/b8: [N2] 原版成立 :: 认不出的拒收');
  a(probeClean(PROBES.pPre) === 'prefix-ok', 'v2118/b8: [N2] 原版成立 :: 键/名/前缀都认');
  a(probeClean(PROBES.pEvIn) === 'inbox-bounded', 'v2118/b8: [N2] 原版成立 :: 收件有界');
  a(probeClean(PROBES.pEvEv) === 'evidence-bounded', 'v2118/b8: [N2] 原版成立 :: 证据有界');
  a(probeClean(PROBES.pHalf) === 'half-honest', 'v2118/b8: [N2] 原版成立 :: 半成功如实分列');
  a(probeClean(PROBES.pTrace) === 'gap-visible', 'v2118/b8: [N2] 原版成立 :: 缺口可见');
  a(probeClean(PROBES.pOff) === 'off-refused', 'v2118/b8: [N2] 原版成立 :: 关闭拒收且零台账');
  a(probeClean(PROBES.pNoOp) === 'no-op-refused', 'v2118/b8: [N2] 原版成立 :: 缺 opId 拒收');
  a(probeClean(PROBES.pLabels) === 'five-distinct', 'v2118/b8: [N2] 原版成立 :: 五档标签互异');
  // N3：破坏互不串扰（换一个锚点，原结论不该变）
  a(probeWith(BROKEN[B.evin], PROBES.pIdem) === 'idem-dedup', 'v2118/b8: [N3] 破坏收件挤出不影响幂等');
  a(probeWith(BROKEN[B.trace], PROBES.pEvIn) === 'inbox-bounded', 'v2118/b8: [N3] 破坏缺口可见性不影响挤出');
  a(probeWith(BROKEN[B.owner], PROBES.pSkip) === 'skip-refused', 'v2118/b8: [N3] 破坏主体归属不影响跳档守卫');
  a(probeWith(BROKEN[B.evded], PROBES.pEvIn) === 'inbox-bounded', 'v2118/b8: [N3] 破坏证据去重不影响收件有界');
  a(probeWith(BROKEN[B.noneg], PROBES.pSub) === 'submitted-only', 'v2118/b8: [N3] 破坏失约口径不影响阶段初值');
  // N4：判据非恒真（原版与破坏对同一条判据给出不同结论）
  const okv = probeClean(PROBES.pSub);
  const badv = probeWith(BROKEN[B.sub], PROBES.pSub);
  a(okv !== badv && okv === 'submitted-only', 'v2118/b8: [N4] 阶段初值判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pIdem);
  const bad2 = probeWith(BROKEN[B.idem], PROBES.pIdem);
  a(ok2 !== bad2 && ok2 === 'idem-dedup', 'v2118/b8: [N4] 幂等判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pRelNeg);
  const bad3 = probeWith(BROKEN[B.noneg], PROBES.pRelNeg);
  a(ok3 !== bad3 && ok3 === 'no-negative-step', 'v2118/b8: [N4] 失约口径判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('B8-LIAISON-V2118: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('B8-LIAISON-V2118: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };