#!/usr/bin/env node
// WorldAxis tests/threads-v2630.js —— 悬案「结案必须有据」锁（v2.63.0）
//
// 【它治的病】推理玩法最贵的一类失败，是「没查出来也能给答案」。本模块最有价值的五条能力
//   全是否定式：
//     · 结案**必须有依据**（空 basis 拒收、未知线索 id 拒收）；
//     · 矛盾线索**必须被报出、不得被平均掉**（一条真线索与一条假线索同归于尽）；
//     · 未解矛盾**默认拒收**结案，强行结案须显式声明并留痕；
//     · 悬置（仍在查）与放弃（主动放下、须写明为什么）是**两种事实**；
//     · 线索不等于结论（低置信不得被写成定论）。
//   存在面判据（有 open 吗 / 有 RELIABILITY 吗 / 有 resolve 吗）对这五条一无所知：
//   一个「resolve 时 basis 为空就按最强线索自动补上」的实现，同样拥有全套函数名、全套常量，
//   而且会让面板「一点就结案」，看起来更顺手。
//
// 【为什么既有锁全都照不到】（与本锁正交的那些面）
//   · tests/intel-v2530.js 钉的是**认知面**（谁知道什么、置信多少、可以错），
//     本模块钉的是**调查面**（查到了哪、凭什么结）。两者真源不同，锁也必然不同轴；
//   · v2620（causal）钉「因果链的阶段格」——那管「将来会发生什么」，
//     不管「过去那桩案子查得怎么样」；
//   · v2610（evict-meta）是生产者供给面；field-liveness / dead-export 是静态面。
//   一句话：既有锁把「悬案三张表存在」钉住了，没人钉「结案凭什么」。
//
// 【做法】判据全部跑在**真源码**上：经 tests/ui-gate-sync.js 的 fresh() 装载真 LOAD
//   （含本版新插入的 engines/threads.js），不 mock 被测逻辑本身。
//   破坏自证走 opts.srcOverride：把真源码在**内存副本**上改坏后重跑同款判据，一个字节都不改仓库文件。
//
// 【判据】
//   1  总开关默认关闭：不登记线索、不注入。
//   2  立案必须有具体问题（missing-question）；未结案的案子进注入面。
//   3  线索三要素（claim / source / reliability）缺一拒收；未知 reliability 拒收并回报词表。
//   4  polarity 只有 supports / refutes；未登记案件拒收（missing-thread）。
//   5  converge 把矛盾**原样列出**（不是净额）：同一 points 上支持与反证同时存在 ⇒ conflicted。
//   6  converge 的 net 是权重带符号求和（正负相消可读），但 conflicts 面独立于 net。
//   7  结案必须给依据：空 basis ⇒ no-basis；含未知线索 id ⇒ unknown-basis（并列出缺哪些）。
//   8  有未解矛盾 ⇒ 默认 conflicts-unresolved 拒收，**且不改变案子状态**。
//   9  显式 overruleConflicts 才结案，并留 overruled 痕迹与理由。
//   10 已结案 / 已放弃 不得重复处理（already-resolved / already-abandoned 分开归因）。
//   11 悬置 ≠ 结案：stall 后 status=stalled、记录不删、不在 TERMINAL 内；新线索让它**重新动起来**。
//   12 放弃必须写明理由（missing-reason）；TERMINAL 显式两态、不含笼统的 closed/done。
//   13 explain 只在已结案时给出，且依据**可复核**（逐条回查来源与可靠性）。
//   14 容量与挤出：案件容器恒 6、每案线索恒 8（按案剪枝）、剪枝走已登记站点。
//   15 注入块只讲**在查**的案子、明写「线索不等于结论」；空库不产空头段。
//   16 观测面：被拒的调用不落盘，故按原因计入 stat.faults。
//
// 【负控制】N0 破坏锚点在真源码中各恰中 1 次；N1/N2 两向自证；N3 逐锚敏感；N4 非恒真；N5 无副作用。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;

const SITE_CASES = 'threads.cases';       // 站点名 = core/evict.js SITES 的键
const SITE_LEADS = 'threads.leads';
const CAP_CASES = 6;
const CAP_LEADS = 8;                      // 每案线索环（按案剪枝）
const TAG = '__th2630_';
// ── 四个破坏锚点：**只在真源码里各恰中 1 次**（N0 校验） ──
const A_BASIS = "if (!basis.length) return { ok: false, reason: 'no-basis', leads: leads.length };   // 不得凭空结案";
const A_CONF = "if (cv.conflicted && o.overruleConflicts !== true) {";
const A_SUP = "if (sup.length && ref.length) {";
const A_TERM = "TERMINAL: ['resolved', 'abandoned'],";

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function threadsOf(WA) {
  if (!WA.threads) throw new Error('WA.threads 未装载（engines/threads.js 不在 LOAD 清单里？）');
  return WA.threads;
}
function st(WA) { return WA.store.get() || {}; }
function cases(WA) { const t = st(WA).threads; return Array.isArray(t) ? t : []; }
function byId(WA, id) { return cases(WA).filter(function (x) { return x && x.id === id; })[0] || null; }
function statusOf(WA, id) { const c = byId(WA, id); return c ? c.status : null; }
function resetThreads(WA, tag) {
  WA.store.transact(function (d) { d.threads = []; }, TAG + (tag || 'reset'));
}
// ── 无副作用隔离 ──
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
    const k = LS.key(i);
    if (k === null) continue;
    let v = '';
    try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
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

// ══════════════ 判据 ══════════════
function judge(a) {
  const WA = fresh();
  const th = threadsOf(WA);
  resetThreads(WA);

  // ── 1 总开关默认关闭 ──
  const cfg0 = th.getSettings();
  a(cfg0 && cfg0.enabled === false, 'v2630/threads: [1] 默认关闭（实 ' + JSON.stringify(cfg0 && cfg0.enabled) + '）');
  a(th.buildBlock() === '', 'v2630/threads: [1] 关闭时注入块为空（不注入）');
  // 空库不产空头段：此刻一个案子都没有，即使开了开关也不该出现标题。
  //   为什么放在最前：判据必须**自成一体**——若放在末尾，前面的用例会先把库塞满，
  //   这条断言就永远看不到「空库」这一面（假绿）。
  th.setSettings({ enabled: true });
  a(th.buildBlock() === '', 'v2630/threads: [1] 空库不产空头段（一个案子都没有时应返回空串）');
  th.setSettings({ enabled: false });
  a(th.getSettings().enabled === false, 'v2630/threads: [1] 关回去后确实关闭（不留跨用例残留）');

  // ── 2 立案 ──
  a(th.open({ question: '' }).reason === 'missing-question',
    'v2630/threads: [2] 空问题拒收（空问题不是悬案）');
  const t0 = th.open({ question: '谁在子夜进了库房', subject: '库房' });
  a(t0.ok === true && /^th_/.test(t0.id), 'v2630/threads: [2] 立案成功并回报 id（实 ' + JSON.stringify(t0) + '）');
  a(cases(WA).length === 1 && byId(WA, t0.id).status === 'open',
    'v2630/threads: [2] 新案初态为 open（实 ' + statusOf(WA, t0.id) + '）');
  th.setSettings({ enabled: true });
  a(th.buildBlock().indexOf('谁在子夜进了库房') >= 0, 'v2630/threads: [2] 在查的案子进注入面');

  // ── 3 线索三要素 ──
  a(th.addLead(t0.id, { claim: 'x', source: '更夫', reliability: 'nonsense' }).reason === 'bad-reliability',
    'v2630/threads: [3] 未知可靠性拒收（bad-reliability）');
  a(th.addLead(t0.id, { claim: '', source: '更夫', reliability: 'testimony' }).reason === 'missing-claim',
    'v2630/threads: [3] 空主张拒收（missing-claim）');
  a(th.addLead(t0.id, { claim: 'x', source: '', reliability: 'testimony' }).reason === 'missing-source',
    'v2630/threads: [3] 无来源拒收（没来源的线索不是线索）');
  a(th.addLead(t0.id, { claim: 'x', source: '更夫', reliability: 'testimony', polarity: 'nonsense' }).reason === 'bad-polarity',
    'v2630/threads: [3] 未知极性拒收（bad-polarity）');
  a(byId(WA, t0.id).leads.length === 0, 'v2630/threads: [3] 被拒的线索不得留下半条（实 ' + byId(WA, t0.id).leads.length + '）');

  // ── 4 未登记案件拒收 ──
  a(th.addLead('th_不存在', { claim: 'x', source: 'a', reliability: 'trace' }).reason === 'missing-thread',
    'v2630/threads: [4] 未登记案件加线索 ⇒ missing-thread');
  a(th.addLead('', { claim: 'x', source: 'a', reliability: 'trace' }).reason === 'missing-thread',
    'v2630/threads: [4] 空案件 id 不得被当成「第一桩案子」（不猜）');

  // ── 5 矛盾必须原样列出、不得平均 ──
  const l1 = th.addLead(t0.id, { claim: '更夫说翻墙进的', points: '翻墙', source: '更夫', reliability: 'testimony' });
  const l2 = th.addLead(t0.id, { claim: '账本记着是从门进的', points: '翻墙', source: '账本', reliability: 'document', polarity: 'refutes' });
  a(l1.ok === true && l2.ok === true && l1.weight === 75 && l2.weight === 60,
    'v2630/threads: [5] 可靠性由**来源类型**决定（testimony=75 / document=60，实 '
    + l1.weight + '/' + l2.weight + '）');
  const cv = th.converge(t0.id);
  a(cv.ok === true && cv.conflicted === true && cv.conflicts.length === 1,
    'v2630/threads: [5] 同一 points 上支持与反证并存 ⇒ conflicted（实 ' + JSON.stringify(cv.conflicts) + '）');
  a(cv.conflicts[0].supports.length === 1 && cv.conflicts[0].refutes.length === 1,
    'v2630/threads: [5] 矛盾面**两条都在**（各自保留，不合并、不取平均）');
  a(cv.supports === 1 && cv.refutes === 1, 'v2630/threads: [5] 支持面与反证面分开计数（实 ' + cv.supports + '/' + cv.refutes + '）');

  // ── 6 net 是带符号求和，但 conflicts 面独立于 net ──
  a(cv.net === 15, 'v2630/threads: [6] net = 支持权重 − 反证权重（75−60=15，实 ' + cv.net + '）');
  const l3 = th.addLead(t0.id, { claim: '门锁完好', points: '门锁', source: '铜锁匠', reliability: 'physical' });
  const cv2 = th.converge(t0.id);
  a(cv2.net === 105 && cv2.conflicted === true,
    'v2630/threads: [6] 无矛盾的那条照样计入 net，而 conflicted 仍为真（net 不能掩盖矛盾；实 '
    + cv2.net + '/' + cv2.conflicted + '）');
  a(cv2.strongest === 90, 'v2630/threads: [6] strongest 只取支持面最强（实 ' + cv2.strongest + '）');

  // ── 7 结案必须给依据 ──
  a(th.resolve(t0.id, { answer: '是他' }).reason === 'no-basis',
    'v2630/threads: [7] 空依据 ⇒ no-basis（不得凭空结案）');
  const rb = th.resolve(t0.id, { answer: '是他', basis: ['ld_不存在'] });
  a(rb.reason === 'unknown-basis' && rb.missing.length === 1,
    'v2630/threads: [7] 未知线索 id ⇒ unknown-basis 并列出缺哪些（实 ' + JSON.stringify(rb) + '）');
  a(th.resolve(t0.id, { basis: [l1.lead] }).reason === 'missing-answer',
    'v2630/threads: [7] 空答案拒收（missing-answer）');
  a(statusOf(WA, t0.id) === 'open', 'v2630/threads: [7] 被拒的结案**不得**改变案子状态（仍是 open）');

  // ── 8 未解矛盾默认拒收 ──
  const rc = th.resolve(t0.id, { answer: '是他', basis: [l1.lead, l3.lead] });
  a(rc.ok === false && rc.reason === 'conflicts-unresolved' && rc.conflicts.length === 1,
    'v2630/threads: [8] 有未解矛盾 ⇒ 默认拒收并**报出是哪处矛盾**（实 ' + JSON.stringify(rc).slice(0, 160) + '）');
  a(statusOf(WA, t0.id) === 'open' && !byId(WA, t0.id).answer,
    'v2630/threads: [8] 拒收后不落答案、不改状态（否则「拒了但结案了」）');

  // ── 9 显式越权才结案并留痕 ──
  const ro = th.resolve(t0.id, { answer: '翻墙进的可能性更大', basis: [l1.lead], overruleConflicts: true, overruleNote: '账本倾向可信，但更夫证词仍留' });
  a(ro.ok === true && ro.overruled === 1,
    'v2630/threads: [9] 显式 overruleConflicts ⇒ 结案并记下越过的矛盾数（实 ' + JSON.stringify(ro) + '）');
  const row = byId(WA, t0.id);
  a(row.status === 'resolved' && row.overruled === 1 && typeof row.overruleNote === 'string' && row.overruleNote,
    'v2630/threads: [9] 越权结案**留痕**（overruled + 理由；不写 = 事后答不出「为什么跳过矛盾」）');

  // ── 10 已终结不得重复处理 ──
  a(th.resolve(t0.id, { answer: 'x', basis: [l1.lead] }).reason === 'already-resolved',
    'v2630/threads: [10] 已结案再结 ⇒ already-resolved');
  a(th.abandon(t0.id, '不查了').reason === 'already-resolved',
    'v2630/threads: [10] 已结案不得转为放弃（already-resolved，与 already-abandoned 分开）');

  // ── 11 悬置 ≠ 结案 ──
  const t1 = th.open({ question: '谁在夜里敲钟' });
  const sl = th.stall(t1.id, '证人出远门了');
  a(sl.ok === true && sl.status === 'stalled',
    'v2630/threads: [11] 悬置成功（实 ' + JSON.stringify(sl) + '）');
  a(statusOf(WA, t1.id) === 'stalled' && !!byId(WA, t1.id).stallReason,
    'v2630/threads: [11] 记录不删、理由留痕（「搁着」也是事实）');
  a(th.TERMINAL.indexOf('stalled') < 0 && th.TERMINAL.indexOf('open') < 0,
    'v2630/threads: [11] 悬置**不在**终态集合内（仍在查 ≠ 结了；实 ' + JSON.stringify(th.TERMINAL) + '）');
  a(th.stall(t1.id, 'x').reason === 'not-open', 'v2630/threads: [11] 已悬置者不得重复悬置（not-open）');
  const l4 = th.addLead(t1.id, { claim: '有人看见铜匠', source: '巡夜', reliability: 'hearsay' });
  a(l4.ok === true && l4.status === 'open',
    'v2630/threads: [11] 新线索让悬案**重新动起来**（stalled → open；实 ' + JSON.stringify(l4.status) + '）');
  a(byId(WA, t1.id).stallReason === '证人出远门了',
    'v2630/threads: [11] 重新动起来也不抹掉「为什么曾停下来」');

  // ── 12 放弃必须写明理由 ──
  const t2 = th.open({ question: '失踪的牛去哪了' });
  a(th.abandon(t2.id, '').reason === 'missing-reason',
    'v2630/threads: [12] 放弃不写理由 ⇒ 拒收（missing-reason）');
  const ab = th.abandon(t2.id, '主人搬走了，无处可查');
  a(ab.ok === true && ab.status === 'abandoned' && byId(WA, t2.id).abandonReason === '主人搬走了，无处可查',
    'v2630/threads: [12] 放弃成功并留理由（实 ' + JSON.stringify(ab) + '）');
  a(th.abandon(t2.id, 'x').reason === 'already-abandoned',
    'v2630/threads: [12] 重复放弃 ⇒ already-abandoned（与 already-resolved 分开）');
  a(th.TERMINAL.length === 2 && th.TERMINAL.indexOf('resolved') >= 0 && th.TERMINAL.indexOf('abandoned') >= 0,
    'v2630/threads: [12] 终态显式两态、不含笼统的 closed/done（实 ' + JSON.stringify(th.TERMINAL) + '）');
  a(th.addLead(t2.id, { claim: 'x', source: 'a', reliability: 'trace' }).reason === 'thread-terminal',
    'v2630/threads: [12] 已放弃的案子不得再加线索（thread-terminal）');

  // ── 13 explain 可复核 ──
  const ex = th.explain(t0.id);
  a(ex.ok === true && ex.answer === '翻墙进的可能性更大' && ex.basis.length === 1
    && ex.basis[0].id === l1.lead && ex.basis[0].source === '更夫' && ex.basis[0].reliability === 'testimony',
    'v2630/threads: [13] 结案依据**可复核**（逐条回查来源与可靠性；实 ' + JSON.stringify(ex) + '）');
  a(th.explain(t1.id).reason === 'not-resolved',
    'v2630/threads: [13] 未结案者无结案详情（not-resolved，不编一份空依据）');

  // ── 13.5 四态分列（必须在容量测试之前读：挤出的案子本来就该消失） ──
  const sts13 = th.threadStat();
  a(sts13.cases === cases(WA).length && sts13.resolved === 1 && sts13.abandoned === 1
    && sts13.open === 1 && sts13.stalled === 0,
    'v2630/threads: [13] threadStat 四态分列（resolved=1 / abandoned=1 / open=1；实 ' + JSON.stringify(sts13) + '）');

  // ── 14 容量与挤出 ──
  WA.evict.resetEvictStat();
  let last = null;
  for (let i = 0; i < CAP_CASES + 4; i++) last = th.open({ question: TAG + 'q' + i });
  const es = WA.evict.evictStat();
  const bc = es.bySite[SITE_CASES] || null;
  a(cases(WA).length === CAP_CASES, 'v2630/threads: [14] 案件容器容量 = ' + CAP_CASES + '（实 ' + cases(WA).length + '）');
  a(!!bc && bc.evicts >= 1, 'v2630/threads: [14] 挤出经 evict 记账（evicts=' + (bc && bc.evicts) + '）');
  a(es.failedBy['unknown-site'] === undefined, 'v2630/threads: [14] 剪枝走已登记站点（无 unknown-site）');
  const decl = WA.evict.siteDecls()[SITE_CASES];
  a(!!decl && decl.cap === CAP_CASES, 'v2630/threads: [14] 站点声明与容器容量同源（cap=' + (decl && decl.cap) + '）');
  // 每案线索环：单独一桩新案加 12 条线索 ⇒ 恰 8 条
  const tcap = th.open({ question: TAG + '线索环' });
  for (let i = 0; i < CAP_LEADS + 4; i++) {
    th.addLead(tcap.id, { claim: 'c' + i, source: 's' + i, reliability: 'trace' });
  }
  a(byId(WA, tcap.id).leads.length === CAP_LEADS,
    'v2630/threads: [14] 每案线索环容量 = ' + CAP_LEADS + '（按案剪枝；实 ' + byId(WA, tcap.id).leads.length + '）');
  const bl = WA.evict.evictStat().bySite[SITE_LEADS] || null;
  a(!!bl && bl.evicts >= 1, 'v2630/threads: [14] 线索剪枝经 evict 记账（evicts=' + (bl && bl.evicts) + '）');
  const declL = WA.evict.siteDecls()[SITE_LEADS];
  a(!!declL && declL.cap === CAP_LEADS, 'v2630/threads: [14] 线索站点声明同源（cap=' + (declL && declL.cap) + '）');

  // ── 15 注入块 ──
  const t3 = th.open({ question: '谁在庙会上偷了香火钱' });
  th.addLead(t3.id, { claim: '有人说见过他', source: '香客', reliability: 'hearsay' });
  const blk = th.buildBlock();
  a(typeof blk === 'string' && blk.indexOf('[悬案]') === 0,
    'v2630/threads: [15] 注入块有独立标题（实 ' + JSON.stringify(String(blk).slice(0, 16)) + '）');
  a(blk.indexOf('线索不等于结论') >= 0 && blk.indexOf('不得取平均') >= 0,
    'v2630/threads: [15] 语义约束随块注入（未结案不得当既成事实 + 矛盾不得平均）');
  a(blk.indexOf('[' + 'resolved' + ']') < 0 && blk.indexOf('[' + 'abandoned' + ']') < 0,
    'v2630/threads: [15] 终态案子不进注入面（防「已结案的」被读成「仍在查的」）');
  // 注：「空库不产空头段」已在 [1] 里用**同一个** WA 验过（前提是那时库还空）。
  //   此处不再另起一个 fresh()：fresh() 复用同一个 global.WorldAxis 对象并把 store 换成新的，
  //   中途调用会让前面所有判据读到的状态集体清空——这是判据自身的坑，不是被测代码的问题。

  // ── 16 观测面 ──
  const f0 = th.stat().faults || {};
  a(typeof f0 === 'object' && f0 !== null, 'v2630/threads: [16] stat 带 faults 面');
  a((f0['missing-thread'] || 0) >= 1,
    'v2630/threads: [16] 指向未登记案件的调用被计数（实 ' + JSON.stringify(f0) + '）');
  a((f0['no-basis'] || 0) >= 1 && (f0['conflicts-unresolved'] || 0) >= 1,
    'v2630/threads: [16] 「没给依据」与「矛盾未解」被**分开**计数（两者的处置完全不同）');
  const ts16 = th.threadStat();
  const leadSum16 = cases(WA).reduce(function (a, x) { return a + ((x && Array.isArray(x.leads)) ? x.leads.length : 0); }, 0);
  a(ts16.cases === cases(WA).length && ts16.leads === leadSum16 && ts16.open === cases(WA).length,
    'v2630/threads: [16] threadStat 与容器同源（cases / leads 都按现场现算，不缓存；实 '
    + JSON.stringify(ts16) + ' / 现算 leads=' + leadSum16 + '）');

  console.log('  ✓ v2630/threads: 调查面（结案必须有据 / 矛盾不得平均 / 悬置≠结案）');
}
// ══════════════ 破坏探针 ══════════════
/** 空依据结案：原版应 no-basis；basis 守卫被拆时应结案成功 */
function probeBasis(WA) {
  const th = threadsOf(WA);
  resetThreads(WA, 'pb');
  const t = th.open({ question: 'q' });
  th.addLead(t.id, { claim: 'c', source: 's', reliability: 'trace' });
  const r = th.resolve(t.id, { answer: 'a' });
  return { ok: r.ok === true, reason: r.reason || '', status: statusOf(WA, t.id) };
}
/** 有未解矛盾时结案：原版应拒收；矛盾守卫被拆时应结案成功 */
function probeConf(WA) {
  const th = threadsOf(WA);
  resetThreads(WA, 'pc');
  const t = th.open({ question: 'q' });
  const A = th.addLead(t.id, { claim: 'a', points: 'p', source: 'sa', reliability: 'testimony' });
  th.addLead(t.id, { claim: 'b', points: 'p', source: 'sb', reliability: 'document', polarity: 'refutes' });
  const r = th.resolve(t.id, { answer: 'a', basis: [A.lead] });
  return { ok: r.ok === true, reason: r.reason || '', status: statusOf(WA, t.id) };
}
/** 矛盾面：原版两条都列出；sup 守卫被拆时矛盾面应为空 */
function probeSup(WA) {
  const th = threadsOf(WA);
  resetThreads(WA, 'ps');
  const t = th.open({ question: 'q' });
  th.addLead(t.id, { claim: 'a', points: 'p', source: 'sa', reliability: 'testimony' });
  th.addLead(t.id, { claim: 'b', points: 'p', source: 'sb', reliability: 'document', polarity: 'refutes' });
  const cv = th.converge(t.id);
  return { conflicts: cv.conflicts.length, conflicted: cv.conflicted };
}
/** 终态集合：原版两态齐备；字面量被改坏时应缺 */
function probeTerm(WA) {
  const T = threadsOf(WA).TERMINAL || [];
  return { resolved: T.indexOf('resolved') >= 0, abandoned: T.indexOf('abandoned') >= 0 };
}
const BROKEN = [
  { key: 'basis', rel: 'engines/threads.js', from: A_BASIS,
    to: "if (!basis.length && leads.length) basis.push(leads[leads.length - 1].id);\n    if (!basis.length) return { ok: false, reason: 'no-basis', leads: leads.length };" },
  { key: 'conf', rel: 'engines/threads.js', from: A_CONF, to: 'if (false) {' },
  { key: 'sup', rel: 'engines/threads.js', from: A_SUP, to: 'if (sup.length && false) {' },
  { key: 'term', rel: 'engines/threads.js', from: A_TERM, to: "TERMINAL: ['closed']," }
];
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点应恰中 1 次，实 ' + hits + ' 次：' + spec.rel + ' :: ' + spec.from);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function probeWith(spec, fn) {
  return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); });
}
function probeClean(fn) {
  return isolated(function () { return fn(fresh()); });
}
function anchorHits(spec) {
  return fs.readFileSync(path.join(BASE, spec.rel), 'utf8').split(spec.from).length - 1;
}
// ══════════════ 负控制 ══════════════
function runNegative(a) {
  const anchorBad = BROKEN.filter(function (p) { return anchorHits(p) !== 1; })
    .map(function (p) { return p.key + '(' + anchorHits(p) + '次)'; });
  a(anchorBad.length === 0, 'v2630/threads: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');
  const diffOk = BROKEN.every(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.rel), 'utf8');
    return brokenOverride(p)[p.rel] !== src;
  });
  a(diffOk, 'v2630/threads: [N0] 四种破坏的内存副本都与真源码不同（非空转）');
  // N1 判据纯度
  const bBad = probeWith(BROKEN[0], probeBasis);
  a(bBad.ok === true && bBad.status === 'resolved',
    'v2630/threads: [N1] basis 守卫被改成自动补 ⇒ 「无依据不得结案」判据现形（实 ' + JSON.stringify(bBad) + '）');
  const cBad = probeWith(BROKEN[1], probeConf);
  a(cBad.ok === true && cBad.status === 'resolved',
    'v2630/threads: [N1] 矛盾守卫被拆 ⇒ 「矛盾未解默认拒收」判据现形（实 ' + JSON.stringify(cBad) + '）');
  const sBad = probeWith(BROKEN[2], probeSup);
  a(sBad.conflicts === 0 && sBad.conflicted === false,
    'v2630/threads: [N1] 矛盾面判定被摘除 ⇒ 「矛盾必须报出」判据现形（实 ' + JSON.stringify(sBad) + '）');
  const tBad = probeWith(BROKEN[3], probeTerm);
  a(!(tBad.resolved && tBad.abandoned),
    'v2630/threads: [N1] 终态字面量被改坏 ⇒ 「两态齐备」判据现形（实 ' + JSON.stringify(tBad) + '）');
  // N2 两向自证
  const bOk = probeClean(probeBasis);
  a(bOk.ok === false && bOk.reason === 'no-basis' && bOk.status === 'open',
    'v2630/threads: [N2] 原版：空依据拒收且案子仍 open（实 ' + JSON.stringify(bOk) + '）');
  const cOk = probeClean(probeConf);
  a(cOk.ok === false && cOk.reason === 'conflicts-unresolved' && cOk.status === 'open',
    'v2630/threads: [N2] 原版：有未解矛盾即拒收且不改状态（实 ' + JSON.stringify(cOk) + '）');
  const sOk = probeClean(probeSup);
  a(sOk.conflicts === 1 && sOk.conflicted === true,
    'v2630/threads: [N2] 原版：矛盾确被列出（实 ' + JSON.stringify(sOk) + '）');
  const tOk = probeClean(probeTerm);
  a(tOk.resolved && tOk.abandoned, 'v2630/threads: [N2] 原版：终态两态齐备（实 ' + JSON.stringify(tOk) + '）');
  // N3 逐锚敏感
  a(probeWith(BROKEN[0], probeConf).reason === 'conflicts-unresolved',
    'v2630/threads: [N3] basis 破坏不牵连矛盾守卫（逐锚敏感）');
  a(probeWith(BROKEN[0], probeSup).conflicts === 1, 'v2630/threads: [N3] basis 破坏不牵连矛盾面（逐锚敏感）');
  a(probeWith(BROKEN[1], probeBasis).reason === 'no-basis', 'v2630/threads: [N3] 矛盾破坏不牵连依据守卫（逐锚敏感）');
  a(probeWith(BROKEN[2], probeBasis).reason === 'no-basis', 'v2630/threads: [N3] 矛盾面破坏不牵连依据面（逐锚敏感）');
  a(probeWith(BROKEN[1], probeTerm).resolved === true, 'v2630/threads: [N3] 矛盾破坏不牵连终态集合（逐锚敏感）');
  a(probeWith(BROKEN[3], probeBasis).reason === 'no-basis', 'v2630/threads: [N3] 终态破坏不牵连依据守卫（逐锚敏感）');
  // N4 非恒真
  const chg = isolated(function () {
    const WA = fresh();
    const th = threadsOf(WA);
    resetThreads(WA, 'n4');
    const t = th.open({ question: 'q' });
    const s0 = statusOf(WA, t.id);
    th.stall(t.id, 'w');
    const s1 = statusOf(WA, t.id);
    const L = th.addLead(t.id, { claim: 'c', source: 's', reliability: 'trace' });
    const s2 = statusOf(WA, t.id);
    const r = th.resolve(t.id, { answer: 'a', basis: [L.lead] });
    const s3 = statusOf(WA, t.id);
    return { s0: s0, s1: s1, s2: s2, s3: s3, ok: r.ok === true };
  });
  a(chg.s0 === 'open' && chg.s1 === 'stalled' && chg.s2 === 'open' && chg.s3 === 'resolved' && chg.ok === true,
    'v2630/threads: [N4] 状态确实逐格变化：open→stalled→(新线索)open→resolved（实 ' + JSON.stringify(chg) + '）');
  // N5 无副作用
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2630/threads: [N5] 探测哨兵不泄漏进真存档（残留键: ' + (leak.join(',') || '无') + '）');
}
// ══════════════ 入口 ══════════════
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('THREADS-V2630: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('THREADS-V2630: pass（' + pass + ' 项）');
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeBasis: probeBasis, probeConf: probeConf, probeSup: probeSup, probeTerm: probeTerm,
  brokenOverride: brokenOverride
};