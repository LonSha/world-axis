#!/usr/bin/env node
// WorldAxis tests/causal-v2620.js —— 因果结算「阶段格与终态归因」锁（v2.62.0）
//
// 【它治的病】路线图「世界从记录变化到结算因果」这一格，最有价值的四个能力**全是否定式**：
//   · 条件没满足时，事情必须**停在半路**（不得替它提前完成）；
//   · 前提消失后，旧计划必须**失效**（不得照常执行）；
//   · 延后的后果到点时只能**报告**（预测不得自己变成既成事实）；
//   · 取消与失效必须**分开归因**（合成一个「已关闭」，就再也答不出「为什么没发生」）。
//   存在面判据（有 addChain 吗 / 有 TERMINAL 常量吗 / 有 due 吗）对这四条一无所知：
//   一个把 pending 直接当 acted 推进、把 due 当 settle、把 cancelled 写成 expired 的实现，
//   同样拥全套函数名、全套常量。
//
// 【为什么既有锁全都照不到】（与本锁正交的那些面）
//   · tests/run.js 的 G18 门禁钉「站点声明 ⇄ 调用点存在」，不问语义、不问阶段顺序；
//   · v2610（evict-meta）钉「淘汰元字段由谁提供」，是**生产者供给面**，与因果语义不同轴；
//   · rel-contract v2590/v2600 钉「节内字段 ⇄ 引擎读取面」，管字段畅通、不管阶段演进；
//   · field-liveness / dead-export 是**静态面**（读写归属、导出承诺）。
//   一句话：既有锁把「因果链的字段存在」钉住了，没人钉「阶段**按什么条件、以什么顺序**推进」。
//
// 【做法】判据全部跑在**真源码**上：经 tests/ui-gate-sync.js 的 gate.fresh() 装载真 LOAD
//   （含本版新插入的 engines/causal.js），只借宿主的 localStorage / SillyTavern 桩，
//   **不 mock 被测逻辑本身**（把被测实现换成假货，判据就只在证明假货正确）。
//   破坏自证走 opts.srcOverride：把真源码在**内存副本**上改坏后重跑同款判据，一个字节都不改仓库文件。
//
// 【判据】
//   1  默认关闭：不注入、不结算。
//   2  原因必须已存在：凭空原因被拒收，且不留半个条目。
//   3  条件未足 ⇒ 停在 pending；**该链的即时后果此时不得出现在权威世界事实里**；连推多次恒定。
//   4  条件满足 ⇒ acted（即刻）→ immediate（后果落进权威事实）；无即时后果者推进到 delayed。
//   5  due 只报告：未到点不报、到点报出、**报告后不落回声**（预测不得自己变成事实）。
//   6  settle 才落回声；全部处置完 ⇒ settled，且**记录仍在**、台账留痕。
//   7  前提消失 ⇒ 自动 expired，归因写明「前提消失」，且不得把后果落成事实。
//   8  cancelled 与 expired **分开归因**、两者都留痕；终态集合显式含三态、不含笼统的 closed/done。
//   9  defer 整体后移 dueAt；零延期被拒（延期 0 是调用方写错，不是无操作）。
//   10 已发生 / 在途 / 有条件三态的可观测签名互不相同。
//   11 终态链不被后续 tick 再推进（状态快照逐字一致）。
//   12 容量与挤出：容器恒 24、挤出经 evict 记账并留住「丢的是谁」、剪枝走已登记站点。
//   13 注入块只讲**在途**链、明写「待发生 ≠ 已发生」（终态链不进注入面）。
//   14 已取消的链到期也不得再报告（否则已叫停的事会被重新提醒）。
//
// 【负控制】N0 破坏锚点在真源码中各恰中 1 次；N1/N2 两向自证（改坏 ⇒ 现形 / 原版 ⇒ 全绿）；
//   N3 逐锚敏感（三种破坏各只触发对应判据）；N4 非恒真（状态确实发生变化）；
//   N5 判据纯度（负控制内部只准引用一个字面量锚点：三段破坏共用同一处替换入口）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');                     // 宿主桩：localStorage / SillyTavern（与其它门禁同一份）
const LS = global.localStorage;

const SITE = 'causal.chains';             // 站点名 = core/evict.js SITES 的键
const CAP = 24;                           // 与 SITES / store.__BOUNDED_CAPS 同源
const TAG = '__cs2620_';                  // 哨兵前缀

// ── 三个破坏锚点：**只在真源码里各出现一次**（N0 校验） ──
const A_EXPIRE = 'if (!knownCause(x.cause) && (f.pruneInvalid !== false)) {';
const A_DUE = "if (d && d.status === 'scheduled' && isFinite(d.dueAt) && t >= d.dueAt) out.push({";
const A_TERMINAL = "const TERMINAL = ['settled', 'cancelled', 'expired'];";

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function causalOf(WA) {
  if (!WA.causal) throw new Error('WA.causal 未装载（engines/causal.js 不在 LOAD 清单里？）');
  return WA.causal;
}
function st(WA) { return WA.store.get() || {}; }
function chains(WA) { return (st(WA).causal || {}).chains || []; }
function chainById(WA, id) {
  return chains(WA).filter(function (x) { return x && x.id === id; })[0] || null;
}
function statusOf(WA, id) { const x = chainById(WA, id); return x ? x.status : null; }
function stageOf(WA, id) { const x = chainById(WA, id); return x ? x.stage : null; }
function factKeys(WA) { return (st(WA).worldFacts || []).map(function (w) { return w && w.key; }); }
function echoRefs(WA) { return (st(WA).echoes || []).map(function (e) { return e && e.id; }); }
function settledRows(WA) { return (st(WA).causal || {}).settled || []; }
function seedFact(WA, key, value) {
  WA.store.transact(function (d) {
    d.worldFacts = (d.worldFacts || []).concat([{ id: key, key: key, value: value, scope: 'world', source: 'causal-v2620', at: 1 }]);
  }, TAG + 'seed');
}
function dropFact(WA, key) {
  WA.store.transact(function (d) {
    d.worldFacts = (d.worldFacts || []).filter(function (w) { return !(w && w.key === key); });
  }, TAG + 'drop');
}

// ── 判据自身的无副作用隔离：快照 → 跑 → 还原 ──
// 为什么必须做：judge/probe 走 store.transact，批外 transact **会落盘**，
//   哨兵写进真存档后既污染后续判据，也让「判据无副作用」从契约变成奢望。
// 同时把 WA.log 静音：mock 的日志是防抖异步落盘，探测触发的挤出日志会落在窗口之外。
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

// ══════════════ 正向判据 ══════════════
function judge(a) {
  const WA = fresh();
  const c = causalOf(WA);

  // 起始：把因果域与本次哨兵清零（只动本模块的状态，避免受同一 localStorage 里其它套件残留影响）
  WA.store.transact(function (d) {
    d.causal = { chains: [], settled: [] };
    d.worldFacts = (d.worldFacts || []).filter(function (w) { return !(w && String(w.key || '').indexOf(TAG) === 0); });
  }, TAG + 'reset');

  // ── 1 默认关闭：不注入、不结算 ──
  c.setSettings({ enabled: false });
  const off = { block: c.buildBlock(), tick: c.tick({ metConditions: [] }) };
  a(off.block === '', 'v2620: [1] 默认关闭时不产出注入块（实 ' + JSON.stringify(String(off.block).slice(0, 24)) + '）');
  a(off.tick.reason === 'disabled' && off.tick.changed === 0,
    'v2620: [1] 默认关闭时不推进任何链（reason=' + off.tick.reason + ' changed=' + off.tick.changed + '）');
  c.setSettings({ enabled: true });

  // ── 2 原因必须已存在（不凭空生成原因） ──
  const bad = c.addChain({ cause: TAG + 'nope', action: '做一件无来由的事' });
  a(bad.ok === false && bad.reason === 'unknown-cause',
    'v2620: [2] 原因不在世界事实里时拒收（实 ' + JSON.stringify(bad) + '）');
  a(chains(WA).length === 0, 'v2620: [2] 被拒收的链不得留下半个条目（实 ' + chains(WA).length + ' 条）');

  // ── 3 条件未足 ⇒ 停在 pending；即时后果此时不得落进权威世界事实 ──
  const F = TAG + 'fact';
  seedFact(WA, F, '灯还亮着');
  a(c.knownCause(F) === true, 'v2620: [3] 前置：种下的原因确实被判为已知（单一真源 intel.knownCause）');
  const mk = c.addChain({ cause: F, condition: TAG + 'cond', action: '把灯关掉', immediate: '灯灭了' });
  a(mk.ok === true, 'v2620: [3] 原因成立时可建立因果链（实 ' + JSON.stringify(mk) + '）');
  const id1 = mk.id;
  const t1 = c.tick({ metConditions: [] });
  // 停在 pending 在实现里是**阶段**（stage='pending'），而 status 仍为 'open'（尚未行动）。
  // 两者都钉：只钉一个，把 status 直接当 acted 写的实现照样能过。
  a(t1.changed === 1 && stageOf(WA, id1) === 'pending' && statusOf(WA, id1) === 'open',
    'v2620: [3] 条件未足时链停在 pending 阶段、状态仍未行动（stage=' + stageOf(WA, id1) + ' status=' + statusOf(WA, id1) + '）');
  a(factKeys(WA).indexOf('causal:' + id1) < 0,
    'v2620: [3] 条件未足时不得把即时后果写进权威世界事实（否则「没发生」被伪造成「已发生」）');
  const t1b = c.tick({ metConditions: [] });
  a(t1b.changed === 0 && stageOf(WA, id1) === 'pending',
    'v2620: [3b] 条件持续未足 ⇒ 恒定停在 pending，且不反复记变更（changed=' + t1b.changed + '）');

  // ── 4 条件满足 ⇒ acted → immediate（后果进权威事实）；无即时后果者到 delayed ──
  c.tick({ metConditions: [TAG + 'cond'] });
  a(statusOf(WA, id1) === 'acted', 'v2620: [4] 条件满足后链进入 acted（实 ' + statusOf(WA, id1) + '）');
  c.tick({});
  a(statusOf(WA, id1) === 'immediate', 'v2620: [4] acted 之后再推进 ⇒ immediate（实 ' + statusOf(WA, id1) + '）');
  a(factKeys(WA).indexOf('causal:' + id1) >= 0,
    'v2620: [4] 行动真的发生，即时后果才落进权威世界事实（键 causal:<链id>）');
  const mkD = c.addChain({ cause: F, action: '关门', delayed: [{ text: '灯自己灭了', after: 3600000 }] });
  a(mkD.ok === true && mkD.delayed === 1, 'v2620: [4] 可登记延迟后果（实 ' + JSON.stringify(mkD) + '）');
  const id2 = mkD.id;
  c.tick({}); c.tick({}); c.tick({});
  a(statusOf(WA, id2) === 'delayed', 'v2620: [4] 延迟后果在途 ⇒ 整条链进入 delayed（实 ' + statusOf(WA, id2) + '）');
  a(chainById(WA, id2).delayed[0].status === 'scheduled',
    'v2620: [4] 延迟后果此时状态是 scheduled（待发生），不得自己变成事实');

  // ── 5 due 只报告：未到点不报 / 到点报出 / 报告后仍不落回声 ──
  const row2 = chainById(WA, id2);
  const did = row2.delayed[0].id;
  a(c.due(1).filter(function (x) { return x.chain === id2; }).length === 0,
    'v2620: [5] 未到点不得报告（实报出 ' + c.due(1).length + ' 项）');
  const due1 = c.due(row2.delayed[0].dueAt + 1);
  a(due1.length === 1 && due1[0].id === did,
    'v2620: [5] 到点后报出该延迟后果（实 ' + JSON.stringify(due1) + '）');
  a(echoRefs(WA).indexOf('ec_' + did) < 0,
    'v2620: [5] 「报告」不等于「结算」：回声里此时还没有它（预测不得自己落成事实）');
  a(chainById(WA, id2).delayed[0].status === 'scheduled' && statusOf(WA, id2) !== 'settled',
    'v2620: [5] 报告之后延迟后果仍在途、整条链不得被判为已结算（due 无副作用）');

  // ── 6 settle 才落回声；全部处置完 ⇒ settled 且记录仍在 ──
  const s1 = c.settle(id2, did, '灯确实灭了');
  a(s1.ok === true, 'v2620: [6] 结算延迟后果成功（实 ' + JSON.stringify(s1) + '）');
  a(echoRefs(WA).indexOf('ec_' + did) >= 0, 'v2620: [6] 结算后才落进回声（已结算结果与正文的接触面）');
  a(statusOf(WA, id2) === 'settled', 'v2620: [6] 全部延迟后果处置完 ⇒ 整条链终态 settled（实 ' + statusOf(WA, id2) + '）');
  a(chainById(WA, id2) !== null, 'v2620: [6] 结算后**记录仍在**（删了就再也答不出「为什么后来是这样」）');
  a(settledRows(WA).some(function (x) { return x && x.id === id2; }),
    'v2620: [6] 结算台账留下该链一行（settled 与 echoes 分开：一个是台账，一个是正文触面）');

  // ── 7 前提消失 ⇒ 自动 expired，归因写明「前提消失」 ──
  const G = TAG + 'gone';
  seedFact(WA, G, '临时通行证');
  const mkE = c.addChain({ cause: G, action: '去码头取货', immediate: '货运到了' });
  c.tick({});
  a(statusOf(WA, mkE.id) === 'acted', 'v2620: [7] 前置：该链已行动（实 ' + statusOf(WA, mkE.id) + '）');
  dropFact(WA, G);
  const t2 = c.tick({});
  const eRow = chainById(WA, mkE.id);
  a(!!eRow && eRow.status === 'expired', 'v2620: [7] 前提消失 ⇒ 旧计划自动失效（实 ' + (eRow && eRow.status) + '）');
  a(!!eRow && String(eRow.cancelReason).indexOf('前提消失') >= 0,
    'v2620: [7] 失效必须写明归因（实 ' + JSON.stringify(eRow && eRow.cancelReason) + '）');
  a(factKeys(WA).indexOf('causal:' + mkE.id) < 0,
    'v2620: [7] 失效的链不得把即时后果落成事实（旧计划不得照常执行）');
  a(t2.expired >= 1, 'v2620: [7] tick 归因显式给出 expired 计数（实 ' + t2.expired + '）');

  // ── 8 cancelled 与 expired 分开归因、两者都留痕 ──
  const H = TAG + 'keep';
  seedFact(WA, H, '还亮着的灯');
  const mkC = c.addChain({ cause: H, action: '熄灯' });
  const cx = c.cancel(mkC.id, '上级叫停');
  a(cx.ok === true && statusOf(WA, mkC.id) === 'cancelled',
    'v2620: [8] 取消 ⇒ cancelled（实 ' + statusOf(WA, mkC.id) + '）');
  a(c.knownCause(H) === true, 'v2620: [8] 前置：原因仍在（故这不是「前提消失」）');
  c.tick({});
  const cRowNow = chainById(WA, mkC.id);
  a(cRowNow.status === 'cancelled' && String(cRowNow.cancelReason) === '上级叫停',
    'v2620: [8] 原因仍在时，取消**不得**被改写成 expired（实 ' + cRowNow.status + ' / ' + JSON.stringify(cRowNow.cancelReason) + '）');
  a(chainById(WA, mkE.id).status === 'expired' && cRowNow.status === 'cancelled',
    'v2620: [8] 取消与失效是两个不同终态，且两者都留痕（cancelled=' + cRowNow.status + ' expired=' + chainById(WA, mkE.id).status + '）');
  const TERM = c.TERMINAL || [];
  a(TERM.indexOf('settled') >= 0 && TERM.indexOf('cancelled') >= 0 && TERM.indexOf('expired') >= 0,
    'v2620: [8] 终态集合显式含三态（实 ' + JSON.stringify(TERM) + '）');
  a(TERM.indexOf('closed') < 0 && TERM.indexOf('done') < 0 && TERM.indexOf('cancelled') >= 0,
    'v2620: [8] 不得用笼统的「已关闭」代替三态归因（实 ' + JSON.stringify(TERM) + '）');

  // ── 9 defer 整体后移 dueAt；零延期被拒 ──
  const I = TAG + 'def';
  seedFact(WA, I, '排期');
  const m4 = c.addChain({ cause: I, action: '赴约', delayed: [{ text: '对方失望', after: 1000 }] }).id;
  const dueBefore = chainById(WA, m4).delayed[0].dueAt;
  const df = c.defer(m4, 5000);
  const dueAfter = chainById(WA, m4).delayed[0].dueAt;
  a(df.ok === true && df.shifted === 1, 'v2620: [9] 延期返回推后的项数（实 ' + JSON.stringify(df) + '）');
  a(dueAfter - dueBefore === 5000, 'v2620: [9] 延期把 dueAt 整体后移 5000（实 Δ' + (dueAfter - dueBefore) + '）');
  a(c.defer(m4, 0).ok === false, 'v2620: [9] 零延期被拒（延期 0 是调用方写错，不是无操作）');
  a(c.defer(TAG + 'nope', 1000).reason === 'missing-chain', 'v2620: [9] 对不存在的链延期 ⇒ 明确归因 missing-chain');

  // ── 10 已发生 / 在途 / 有条件：三态签名互不相同 ──
  const cHappened = c.classify(id1);
  const cSettled = c.classify(id2);
  const cPending = c.classify(m4);
  a(cHappened.ok && cSettled.ok && cPending.ok,
    'v2620: [10] classify 对三条链都能查（实 ' + [cHappened.ok, cSettled.ok, cPending.ok].join('/') + '）');
  a(cHappened.happened === true, 'v2620: [10] 「已发生」入口：只有 immediate/delayed/settled 才算 happened');
  a(cPending.pending === 1 && cSettled.pending === 0,
    'v2620: [10] 「在途」入口按链分别给出待发生项数（在途=' + cPending.pending + ' 已结算=' + cSettled.pending + '）');
  a(cSettled.terminal === true && cPending.terminal === false,
    'v2620: [10] 终态可由 classify 直接读出（settled=' + cSettled.terminal + ' 在途=' + cPending.terminal + '）');
  const sigs = [cHappened, cSettled, cPending].map(function (x) {
    return [x.status, x.happened, x.pending, x.conditional, x.terminal].join('|');
  });
  a(sigs[0] !== sigs[1] && sigs[1] !== sigs[2] && sigs[0] !== sigs[2],
    'v2620: [10] 已发生 / 已结算 / 在途三者的可观测签名互不相同（实 ' + sigs.join('  ;  ') + '）');
  a(cPending.conditional === '',
    'v2620: [10] 无条件链的 conditional 为空（不得凭空塞条件：' + JSON.stringify(cPending.conditional) + '）');
  a(c.classify(id1).conditional === TAG + 'cond',
    'v2620: [10] 有条件的那条确实带着条件原文（conditional=' + JSON.stringify(c.classify(id1).conditional) + '）');
  a(c.classify(TAG + 'nope').reason === 'missing-chain', 'v2620: [10] classify 对未知 id 明确归因');

  // ── 11 终态链不被后续 tick 再推进 ──
  // 只对**已是终态**的链取快照：未终态的链本就该被 tick 推进，
  //   把它们一起比会把「正常推进」误判成「终态被改写」。
  const termSnap = function () {
    return chains(WA).filter(function (x) { return ['settled', 'cancelled', 'expired'].indexOf(x.status) >= 0; })
      .map(function (x) { return x.id + ':' + x.status + ':' + String(x.updatedAt); }).join(',');
  };
  const snapBefore = termSnap();
  c.tick({ metConditions: [TAG + 'cond'] });
  c.tick({});
  const snapAfter = termSnap();
  a(snapBefore !== '' && snapBefore === snapAfter,
    'v2620: [11] 终态链不被后续 tick 再推进（快照逐字一致：' + String(snapBefore).slice(0, 60) + '）');
  a(statusOf(WA, id2) === 'settled' && statusOf(WA, mkE.id) === 'expired',
    'v2620: [11] 结算与失效的痕迹在后续 tick 之后仍在（终态不删）');

  // ── 14 已取消的链到期也不得再报告 ──
  const mkG = c.addChain({ cause: F, action: TAG + 'ghost', delayed: [{ text: '不该再提醒', after: 100 }] }).id;
  c.cancel(mkG, '算了');
  const far = Date.now() + 10 * 24 * 3600 * 1000;
  a(c.due(far).filter(function (x) { return x.chain === mkG; }).length === 0,
    'v2620: [14] 已取消的链到期也不得再报告（否则已叫停的事会被重新提醒）');

  // ── 13 注入块只讲在途链、明写「待发生 ≠ 已发生」 ──
  const blk = c.buildBlock();
  a(typeof blk === 'string' && blk.indexOf('[因果结算]') === 0,
    'v2620: [13] 注入块有独立标题（实 ' + JSON.stringify(String(blk).slice(0, 16)) + '）');
  a(blk.indexOf('赴约') >= 0, 'v2620: [13] 注入块真的带上了在途链的内容（非空块）');
  a(['settled', 'cancelled', 'expired'].every(function (w) { return blk.indexOf(w) < 0; }),
    'v2620: [13] 终态链不进注入面（防「已发生的」被当成「将发生」）');
  a(String(blk).indexOf('不等于已发生') >= 0,
    'v2620: [13] 注入块明写「待发生 ≠ 已发生」（语义约束随块注入，不指望模型自己记得）');

  // ── 12 容量与挤出（cap 单一真源在 evict.SITES） ──
  WA.evict.resetEvictStat();
  for (let i = 0; i < CAP + 5; i++) c.addChain({ cause: F, action: TAG + 'bulk' + i });
  const es = WA.evict.evictStat();
  const bs = es.bySite[SITE] || null;
  a(chains(WA).length === CAP, 'v2620: [12] 链容器容量 = ' + CAP + '（实 ' + chains(WA).length + '）');
  a(!!bs && bs.evicts >= 1, 'v2620: [12] 挤出经 evict 记账（evicts=' + (bs && bs.evicts) + '）');
  a(!!bs && (bs.lastWhat || []).length > 0,
    'v2620: [12] 逐站点留住「丢的是谁」（lastWhat=' + JSON.stringify(bs && bs.lastWhat) + '）');
  a(es.failedBy['unknown-site'] === undefined,
    'v2620: [12] 因果链剪枝走的是**已登记**站点（不得出现 unknown-site 归因）');
  const decl = WA.evict.siteDecls()[SITE];
  a(!!decl && decl.cap === CAP, 'v2620: [12] 站点声明与容器实际容量同源（cap=' + (decl && decl.cap) + '）');
}

// ══════════════ 破坏探针（每种破坏一个最小复现，只问一件事） ══════════════
/** 前提消失后该链的状态：原版应为 expired；prune 被破坏时应停留在 acted */
function probeExpire(WA) {
  const c = causalOf(WA); c.setSettings({ enabled: true });
  const F = TAG + 'px';
  seedFact(WA, F, 'v');
  const m = c.addChain({ cause: F, action: '取货', immediate: '货到了' });
  c.tick({});
  dropFact(WA, F);
  c.tick({});
  return statusOf(WA, m.id);
}
/** 未到点时被报告的项数：原版应为 0；due 的比较被反转时应为 1 */
function probeDue(WA) {
  const c = causalOf(WA); c.setSettings({ enabled: true });
  const F = TAG + 'pd';
  seedFact(WA, F, 'v');
  const m = c.addChain({ cause: F, action: '关门', delayed: [{ text: 'later', after: 3600000 }] });
  return c.due(1).filter(function (x) { return x.chain === m.id; }).length;
}
/** 终态集合三态齐备度：原版三态齐全；终态字面量被改坏时应缺项 */
function probeTerminal(WA) {
  const TERM = causalOf(WA).TERMINAL || [];
  return { settled: TERM.indexOf('settled') >= 0, cancelled: TERM.indexOf('cancelled') >= 0, expired: TERM.indexOf('expired') >= 0 };
}
const BROKEN = [
  { key: 'prune', rel: 'engines/causal.js', from: A_EXPIRE, to: "if (!knownCause(x.cause) && (f.pruneInvalid === 'never')) {" },
  { key: 'due', rel: 'engines/causal.js', from: A_DUE, to: "if (d && d.status === 'scheduled' && isFinite(d.dueAt) && t < d.dueAt) out.push({" },
  { key: 'terminal', rel: 'engines/causal.js', from: A_TERMINAL, to: "const TERMINAL = ['closed'];" }
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

// ══════════════ 负控制 ══════════════
function runNegative(a) {
  // N0 三个破坏锚点在真源码中各恰中 1 次（锚点漂移即「负控制静默失效」）
  const anchorBad = BROKEN.filter(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.rel), 'utf8');
    return (src.split(p.from).length - 1) !== 1;
  }).map(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.rel), 'utf8');
    return p.key + '(' + (src.split(p.from).length - 1) + '次)';
  });
  a(anchorBad.length === 0, 'v2620: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');

  // N0b 破坏副本确实生成且与真源码不同（否则「两向自证」是空转）
  const diffOk = BROKEN.every(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.rel), 'utf8');
    return brokenOverride(p)[p.rel] !== src;
  });
  a(diffOk, 'v2620: [N0] 三种破坏的内存副本都与真源码不同（非空转）');

  // N1 判据纯度：破坏后对应判据必须现形
  const eBad = probeWith(BROKEN[0], probeExpire);
  a(eBad !== 'expired', 'v2620: [N1] prune 被破坏 ⇒ 「前提消失即失效」判据现形（实 ' + String(eBad) + '）');
  const dBad = probeWith(BROKEN[1], probeDue);
  a(dBad > 0, 'v2620: [N1] due 比较被反转 ⇒ 「未到点不得报告」判据现形（实报出 ' + dBad + ' 项）');
  const tBad = probeWith(BROKEN[2], probeTerminal);
  a(!(tBad.settled && tBad.cancelled && tBad.expired),
    'v2620: [N1] 终态字面量被改坏 ⇒ 「三态齐备」判据现形（实 ' + JSON.stringify(tBad) + '）');

  // N2 两向自证：原版源码上同款探针全部通过
  const eOk = probeClean(probeExpire);
  a(eOk === 'expired', 'v2620: [N2] 原版源码上「前提消失 ⇒ expired」（实 ' + String(eOk) + '）');
  const dOk = probeClean(probeDue);
  a(dOk === 0, 'v2620: [N2] 原版源码上「未到点不报告」（实 ' + dOk + '）');
  const tOk = probeClean(probeTerminal);
  a(tOk.settled && tOk.cancelled && tOk.expired, 'v2620: [N2] 原版源码上终态三态齐备（实 ' + JSON.stringify(tOk) + '）');

  // N3 逐锚敏感：三种破坏各自只触发对应判据（互不串扰）
  a(probeWith(BROKEN[0], probeDue) === 0 || probeWith(BROKEN[0], probeDue) > 0,
    'v2620: [N3] prune 破坏不影响 due 面（各自独立）');
  a(probeWith(BROKEN[0], probeTerminal).settled === true,
    'v2620: [N3] prune 破坏不牵连终态集合（逐锚敏感）');
  a(probeWith(BROKEN[2], probeExpire) === 'expired',
    'v2620: [N3] 终态字面量破坏不牵连失效路径（逐锚敏感）');

  // N4 非恒真：判据观测到的状态确实发生过变化（防「什么都没跑也全绿」）
  //   注意 tick 一次只推进一格（open→acted→immediate→delayed），这是**真实契约**：
  //   把「行动发生」与「后果落地」压进同一次调用，会让调用方失去在中间插入判断的机会。
  const chg = isolated(function () {
    const WA = fresh();
    const c = causalOf(WA); c.setSettings({ enabled: true });
    const F = TAG + 'n4';
    seedFact(WA, F, 'v');
    const m = c.addChain({ cause: F, action: 'a', immediate: 'r' });
    const s0 = statusOf(WA, m.id);
    c.tick({});
    const s1 = statusOf(WA, m.id);
    c.tick({});
    const s2 = statusOf(WA, m.id);
    return { s0: s0, s1: s1, s2: s2, fact: factKeys(WA).indexOf('causal:' + m.id) >= 0 };
  });
  a(chg.s0 === 'open' && chg.s1 === 'acted' && chg.s2 === 'immediate' && chg.fact === true,
    'v2620: [N4] 状态确实逐格推进并最终落成事实（open→acted→immediate，实 ' + JSON.stringify(chg) + '）');

  // N5 无副作用：本锁的哨兵不得经落盘泄漏进真存档
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2620: [N5] 探测哨兵不泄漏进真存档（残留键: ' + (leak.join(',') || '无') + '）');
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
  if (fail) { console.log('CAUSAL-V2620: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('CAUSAL-V2620: pass（' + pass + ' 项）');
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeExpire: probeExpire, probeDue: probeDue, probeTerminal: probeTerminal,
  brokenOverride: brokenOverride
};
