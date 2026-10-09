#!/usr/bin/env node
// WorldAxis tests/horizon-v2640.js —— 随机性面「关闭即无代价、冷却即计数、保底即事实」锁（v2.64.0）
//
// 【它治的病】随机事件引擎最有价值的四条能力全是否定式与**分不开的读数**：
//   · 通道关闭时**连掷骰都不做**（不是「掷了没中」）——此前 rolls 把这类计入，
//     于是面板那句「本会话掷骰 N 次但零触发」在用户主动关掉时是**假的**；
//   · 冷却中**不得消耗 ledger**（否则保底会被冷却吞掉，第 10 轮永不到来）；
//   · 保底必须**到点即触发且无条件**（把「随机」当唯一入口的实现永远到不了保底）；
//   · 「为什么没触发」必须**可数**（掷了没中 / 冷却中 / 保底还没到 / 通道关着，
//     四种局面在世界状态里长得一模一样——都只是「没发生」）。
//   存在面判据（有 rollLane 吗 / 有 COOLDOWN_ROUNDS 吗）对这四条一无所知：
//   一个把 rolls 记在通道检查之前、把冷却也算进 ledger 的实现，拥有全套函数名与常量。
//
// 【为什么既有锁全都照不到】
//   · tests/run.js 的 `engines/horizon v0.5` 节钉的是**功能在场**（掷得出来、入账成功、
//     临时标记剥离、冷却不触发），判据全是 `fired === true` 一侧；
//   · v2.62.0（causal）钉「因果链的阶段格」，管的是「将来会发生什么」，
//     不管「一次随机掷骰为什么没开火」；
//   · field-liveness / dead-export 是静态面，v2610（evict-meta）是生产者供给面。
//   一句话：既有锁把「随机事件能触发」钉住了，没人钉「没触发的那次到底算不算掷过」。
//
// 【做法】判据全部跑在**真源码**上：经 tests/ui-gate-sync.js 的 fresh() 装载真 LOAD
//   （含 engines/horizon.js 的真实实现），不 mock 被测逻辑本身。
//   破坏自证走 opts.srcOverride：把真源码在**内存副本**上改坏后重跑同款判据，仓库文件零改写。
//
// 【判据】
//   1 观测量基线：一个空的 real-LOAD 世界里 rolls / skipped 都从 0 起。
//   2 通道关闭 ⇒ skipped 涨、rolls **不涨**（本版修的就是这条）。
//   3 通道关闭 ⇒ ledger 与 cooldown 一格都不动（不消耗保底计数）。
//   4 冷却中 ⇒ 不触发、且 ledger **不涨**（冷却期不吞保底）。
//   5 保底到点 ⇒ 无条件触发（forced=true），且 ledger 归零、cooldown 重新上膛。
//   6 pending 超 RETRY_MAX ⇒ 丢弃并归因 pending_dropped（不是静默消失）。
//   7 reasons 分类表：键集有限（运行时数字不得成为键名），且四种局面各归各类。
//   8 rolls + skipped 与分类计数**互相自洽**（增量为 1，不是恒真或恒假）。
//   9 stat() 只读：调它不得改变 store（无副作用）。
//   10 通道关闭时 buildPromptBlock 连掷骰都不做（该泳道不得出现）。
//
// 【负控制】N0 破坏锚点在真源码中各恰中 1 次；N1/N2 两向自证；N3 逐锚敏感；N4 非恒真；N5 无副作用。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__hz2640_';
// ── 四个破坏锚点：**只在真源码里各恰中 1 次**（N0 校验） ──
// 破坏锚点取**通道检查块整体**：把它换成「先计数、再（永不成立的）检查」，
//   即回退到 v2.63.0 的口径——关闭时也把这一轮算成一次掷骰。
const A_ROLLS = "    if (!cf.enabled && o.force !== true) {\n"
  + "      __hzStat.skipped++;\n"
  + "      __hzStat.reasons['disabled'] = (__hzStat.reasons['disabled'] || 0) + 1;\n"
  + "      __hzStat.lastReason = kind + ':disabled';\n"
  + "      return { fired: false, forced: false, skipped: true, reason: 'disabled' };\n"
  + "    }";
const A_COOLDOWN = "      if (lane.cooldown > 0) {\n        lane.cooldown--;";
const A_FORCED = "      const forced = lane.ledger >= cf.ledger;";
const A_REASON = "      const rk = hzReasonKind(out);";
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function hzOf(WA) {
  if (!WA.horizon) throw new Error('WA.horizon 未装载（engines/horizon.js 不在 LOAD 清单里？）');
  return WA.horizon;
}
function st(WA) { return WA.store.get() || {}; }
function lane(WA, k) { return ((st(WA).evolution || {}).horizon || {})[k] || null; }
/** 重置两泳道到已知起点（直接走 store，不经被测逻辑） */
function resetLanes(WA, tag) {
  WA.store.transact(function (d) {
    d.evolution = d.evolution || {};
    d.evolution.horizon = {
      distant: { ledger: 0, cooldown: 0, pending: null, lastFired: 0 },
      near: { ledger: 0, cooldown: 0, pending: null, lastFired: 0 }
    };
  }, TAG + (tag || 'reset'));
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
  const hz = hzOf(WA);
  resetLanes(WA);
  // ── 2 通道关闭 ⇒ rolls 不涨、skipped 涨（需空观测量前提，故放在最前） ──
  hz.setSettings({ distantEnabled: false, nearEnabled: false });
  const s0 = hz.stat();
  hz.rollLane('distant');
  hz.rollLane('near');
  const s1 = hz.stat();
  a(s1.rolls === s0.rolls,
    'v2640/horizon: [2] 通道关闭时**一次都没掷**（rolls 不得增长：' + s0.rolls + '→' + s1.rolls + '）');
  a(s1.skipped === s0.skipped + 2,
    'v2640/horizon: [2] 跳过被单独计数（skipped ' + s0.skipped + '→' + s1.skipped + '，恰 +2）');
  a((s1.reasons['disabled'] || 0) >= 2,
    'v2640/horizon: [2] 「关着所以没掷」进分类表（reasons.disabled=' + (s1.reasons['disabled'] || 0) + '）');
  // ── 3 通道关闭 ⇒ 保底计数一格不动 ──
  WA.store.transact(function (d) { d.evolution.horizon.distant.ledger = 9; }, TAG + 'pre');
  hz.rollLane('distant');
  a(lane(WA, 'distant').ledger === 9,
    'v2640/horizon: [3] 关闭期间不消耗保底计数（ledger 仍 9，实 ' + lane(WA, 'distant').ledger + '）');
  // ── 4 冷却中 ⇒ ledger 不涨（冷却不吞保底） ──
  hz.setSettings({ distantEnabled: true, distantChance: 1, distantCooldown: 3, distantLedger: 30 });
  WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 4, cooldown: 2, pending: null, lastFired: 0 }; }, TAG + 'cd');
  const cd = hz.rollLane('distant');
  a(cd.fired === false && String(cd.reason).indexOf('cooldown') === 0,
    'v2640/horizon: [4] 冷却中不触发（reason=' + cd.reason + '）');
  a(lane(WA, 'distant').ledger === 4,
    'v2640/horizon: [4] 冷却期**不消耗保底计数**（ledger 仍 4，实 ' + lane(WA, 'distant').ledger + '）');
  a(lane(WA, 'distant').cooldown === 1,
    'v2640/horizon: [4] 冷却逐轮递减（3 设 2 → 1，实 ' + lane(WA, 'distant').cooldown + '）');
  // ── 5 保底到点 ⇒ 无条件触发 ──
  WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 30, cooldown: 0, pending: null, lastFired: 0 }; }, TAG + 'force');
  const fr = hz.rollLane('distant');
  a(fr.fired === true && fr.forced === true,
    'v2640/horizon: [5] 保底到点即触发且标注 forced（实 ' + JSON.stringify(fr) + '）');
  a(lane(WA, 'distant').ledger === 0,
    'v2640/horizon: [5] 触发后保底计数归零（实 ' + lane(WA, 'distant').ledger + '）');
  a(lane(WA, 'distant').cooldown === 3,
    'v2640/horizon: [5] 触发后冷却重新上膛（实 ' + lane(WA, 'distant').cooldown + '）');
  a(lane(WA, 'distant').pending !== null,
    'v2640/horizon: [5] 触发生成项挂起待入账（pending 非空）');
  // ── 6 pending 超次数 ⇒ 丢弃并归因 ──
  WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 0, cooldown: 0, pending: { result: { type: 'event' }, retries: 99 }, lastFired: 0 }; }, TAG + 'pd');
  const pd = hz.rollLane('distant');
  a(pd.fired === false && pd.reason === 'pending_dropped',
    'v2640/horizon: [6] 超次保留即丢弃并写明 pending_dropped（实 ' + JSON.stringify(pd) + '）');
  a(lane(WA, 'distant').pending === null, 'v2640/horizon: [6] 丢弃后 pending 确实清空');
  a((hz.stat().reasons['pending-dropped'] || 0) >= 1,
    'v2640/horizon: [6] 丢弃进分类表（pending-dropped=' + (hz.stat().reasons['pending-dropped'] || 0) + '）');
  // ── 7 分类键集有限（运行时数字不得成为键名） ──
  //   三类都用**确定性**手段制造（关闭通道 / 冷却中 / pending 超次），不靠概率：
  //   用「掷了没中」来制造 ledger-below 需要 1% 概率**不**命中，靠概率的判据
  //   会给回归带来随机红点——判据必须自证可复现（本仓库既有口径）。
  hz.setSettings({ distantEnabled: false, nearEnabled: false });
  hz.rollLane('distant');                                   // disabled
  hz.setSettings({ distantEnabled: true, distantChance: 1, distantCooldown: 3, distantLedger: 30 });
  WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 0, cooldown: 1, pending: null, lastFired: 0 }; }, TAG + 'k1');
  hz.rollLane('distant');                                   // cooldown
  WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 0, cooldown: 0, pending: { result: { type: 'event' }, retries: 99 }, lastFired: 0 }; }, TAG + 'k2');
  hz.rollLane('distant');                                   // pending-dropped
  const kinds = hz.stat().reasonKinds;
  a(kinds.every(function (k) { return /^[a-z-]+$/.test(k); }),
    'v2640/horizon: [7] 分类键全部是**有限字面量**（不含运行时数字：' + JSON.stringify(kinds) + '）');
  a(kinds.indexOf('cooldown') >= 0,
    'v2640/horizon: [7] 「冷却中」有独立分类（确定制造，不靠概率）');
  a(kinds.indexOf('pending-dropped') >= 0,
    'v2640/horizon: [7] 「超次丢弃」与「冷却」分开归类（处置完全不同）');
  a(kinds.length <= 6,
    'v2640/horizon: [7] 分类数受控（≤6，实 ' + kinds.length + '：' + JSON.stringify(kinds) + '）');
  // ── 8 两账自洽：增量恰 1（非恒真/恒假） ──
  const before = hz.stat();
  const r8 = hz.rollLane('distant');
  const after = hz.stat();
  const kindOf = (function () {
    const r = String(r8.reason || '');
    if (r8.fired) return r8.forced ? 'fired-forced' : 'fired-chance';
    if (r.indexOf('cooldown') === 0) return 'cooldown';
    if (r.indexOf('ledger=') === 0) return 'ledger-below';
    return null;
  })();
  a(after.rolls === before.rolls + 1 && after.skipped === before.skipped,
    'v2640/horizon: [8] 真掷一次 ⇒ rolls +1 且 skipped 不变（实 rolls ' + before.rolls + '→' + after.rolls
    + ' / skipped ' + before.skipped + '→' + after.skipped + '）');
  a(kindOf === null || (after.reasons[kindOf] || 0) === (before.reasons[kindOf] || 0) + 1,
    'v2640/horizon: [8] 分类计数与本次理由**一一对应**（kind=' + kindOf + '，实 '
    + JSON.stringify({ before: before.reasons[kindOf], after: after.reasons[kindOf] }) + '）');
  // ── 9 stat() 只读 ──
  const snap9 = JSON.stringify(st(WA));
  hz.stat(); hz.stat();
  a(JSON.stringify(st(WA)) === snap9, 'v2640/horizon: [9] stat() 是只读观测（store 深比较不变）');
  // ── 10 关闭时不产生生成指令 ──
  hz.setSettings({ distantEnabled: false, nearEnabled: false });
  WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 99, cooldown: 0, pending: null, lastFired: 0 }; }, TAG + 'bp');
  const pb = hz.buildPromptBlock();
  const pbTxt = String(pb == null ? '' : pb);
  a(pbTxt.indexOf('远方') < 0,
    'v2640/horizon: [10] 关闭的泳道连掷骰都不做（不产生远方生成指令；实 ' + JSON.stringify(pbTxt.slice(0, 40)) + '）');
  a(lane(WA, 'distant').ledger === 99,
    'v2640/horizon: [10] 关闭泳道保底计数未被消耗（仍 99，实 ' + lane(WA, 'distant').ledger + '）');

  console.log('  ✓ v2640/horizon: 随机性面（关闭零代价 / 冷却不吞保底 / 保底必到 / 没掷可数）');
}
// ══════════════ 破坏探针 ══════════════
/** 通道关闭后掷两次，看 rolls 有没有被计入 */
function probeRolls(WA) {
  const hz = hzOf(WA);
  resetLanes(WA, 'pr');
  hz.setSettings({ distantEnabled: false, nearEnabled: false });
  const before = hz.stat().rolls;
  hz.rollLane('distant');
  hz.rollLane('near');
  return { delta: hz.stat().rolls - before, skipped: hz.stat().skipped };
}
/** 在冷却中掷一次，看保底计数涨没涨 */
function probeCooldown(WA) {
  const hz = hzOf(WA);
  resetLanes(WA, 'pc');
  hz.setSettings({ distantEnabled: true, distantChance: 1, distantCooldown: 3, distantLedger: 30 });
  WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 5, cooldown: 2, pending: null, lastFired: 0 }; }, TAG + 'pc');
  hz.rollLane('distant');
  return { ledger: lane(WA, 'distant').ledger };
}
/** 保底到点，看是不是无条件触发 */
function probeForced(WA) {
  const hz = hzOf(WA);
  resetLanes(WA, 'pf');
  hz.setSettings({ distantEnabled: true, distantChance: 1, distantCooldown: 3, distantLedger: 30 });
  WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 30, cooldown: 0, pending: null, lastFired: 0 }; }, TAG + 'pf');
  const r = hz.rollLane('distant');
  return { fired: r.fired === true, forced: r.forced === true };
}
/** 分类表：原版含 cooldown 一类；分类接入被摘除时全归 'other'。
 *  用**冷却**制造（确定性），不用概率——chance 上限 100 与「必中」是同一件事，
 *  而 min 值 1 会让「掷了没中」只在小概率下出现，靠概率的探针会随机红。 */
function probeReason(WA) {
  const hz = hzOf(WA);
  resetLanes(WA, 'prk');
  hz.setSettings({ distantEnabled: true, distantChance: 1, distantCooldown: 3, distantLedger: 30 });
  WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 0, cooldown: 1, pending: null, lastFired: 0 }; }, TAG + 'prk');
  hz.rollLane('distant');
  const rs = hz.stat().reasons || {};
  return { table: rs, hasCooldown: (rs['cooldown'] || 0) > 0, keyCount: Object.keys(rs).length };
}
const BROKEN = [
  { key: 'rolls', rel: 'engines/horizon.js', from: A_ROLLS,
    to: "    // 破坏：把计数搬到通道检查之前，并让检查永不成立（回退到 v2.63.0 口径）\n"
      + "    __hzStat.rolls++;\n    __hzStat.lastAt = clockWall();\n"
      + "    if (false) {\n"
      + "      __hzStat.skipped++;\n"
      + "      __hzStat.reasons['disabled'] = (__hzStat.reasons['disabled'] || 0) + 1;\n"
      + "      __hzStat.lastReason = kind + ':disabled';\n"
      + "      return { fired: false, forced: false, skipped: true, reason: 'disabled' };\n"
      + "    }" },
  { key: 'cooldown', rel: 'engines/horizon.js', from: A_COOLDOWN,
    to: "      if (lane.cooldown > 0) {\n        lane.cooldown--; lane.ledger++;" },
  { key: 'forced', rel: 'engines/horizon.js', from: A_FORCED,
    to: "      const forced = false;" },
  { key: 'reason', rel: 'engines/horizon.js', from: A_REASON,
    to: "      const rk = 'other';" }
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
  a(anchorBad.length === 0, 'v2640/horizon: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');
  const diffOk = BROKEN.every(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.rel), 'utf8');
    return brokenOverride(p)[p.rel] !== src;
  });
  a(diffOk, 'v2640/horizon: [N0] 四种破坏的内存副本都与真源码不同（非空转）');
  // N1 判据现形
  const rBad = probeWith(BROKEN[0], probeRolls);
  // 方向性断言：破坏目标是「关闭时仍被计数」，任何正增量都证明判据现形
  //   （该破坏同时覆盖了真源码里两处计数行，故实测增量会大于 1；具体数值不是判据关心的东西——
  //    N2 侧的 `delta === 0` 才是另一半，两向合起来才叫自证）。
  a(rBad.delta > 0, 'v2640/horizon: [N1] rolls 口径回退 ⇒ 「关闭时一次都没掷」判据现形（delta=' + rBad.delta + '）');
  const cBad = probeWith(BROKEN[1], probeCooldown);
  a(cBad.ledger === 6, 'v2640/horizon: [N1] 冷却吞保底 ⇒ 「冷却不消耗计数」判据现形（ledger=' + cBad.ledger + '）');
  const fBad = probeWith(BROKEN[2], probeForced);
  a(fBad.forced === false, 'v2640/horizon: [N1] 保底被摘 ⇒ 「到点无条件触发」判据现形（' + JSON.stringify(fBad) + '）');
  const kBad = probeWith(BROKEN[3], probeReason);
  a(kBad.hasCooldown === false && kBad.keyCount === 1,
    'v2640/horizon: [N1] 分类接入被摘 ⇒ 「为什么没触发可数」判据现形（' + JSON.stringify(kBad) + '）');
  // N2 原版全绿
  const rOk = probeClean(probeRolls);
  a(rOk.delta === 0 && rOk.skipped >= 2,
    'v2640/horizon: [N2] 原版：关闭时掷骰增量为 0、跳过确实记账（' + JSON.stringify(rOk) + '）');
  const cOk = probeClean(probeCooldown);
  a(cOk.ledger === 5, 'v2640/horizon: [N2] 原版：冷却期保底计数不变（ledger=' + cOk.ledger + '）');
  const fOk = probeClean(probeForced);
  a(fOk.fired && fOk.forced, 'v2640/horizon: [N2] 原版：保底到点即强制触发（' + JSON.stringify(fOk) + '）');
  const kOk = probeClean(probeReason);
  a(kOk.hasCooldown && kOk.keyCount >= 1,
    'v2640/horizon: [N2] 原版：分类表确有 cooldown（' + JSON.stringify(kOk.table) + '）');
  // N3 逐锚敏感
  a(probeWith(BROKEN[0], probeCooldown).ledger === 5, 'v2640/horizon: [N3] rolls 破坏不牵连冷却面（逐锚敏感）');
  a(probeWith(BROKEN[1], probeRolls).delta === 0, 'v2640/horizon: [N3] 冷却破坏不牵连掷骰口径（逐锚敏感）');
  a(probeWith(BROKEN[2], probeCooldown).ledger === 5, 'v2640/horizon: [N3] 保底破坏不牵连冷却面（逐锚敏感）');
  a(probeWith(BROKEN[1], probeForced).forced === true, 'v2640/horizon: [N3] 冷却破坏不牵连保底面（逐锚敏感）');
  a(probeWith(BROKEN[3], probeForced).forced === true, 'v2640/horizon: [N3] 分类破坏不牵连保底面（逐锚敏感）');
  a(probeWith(BROKEN[2], probeReason).hasCooldown === true, 'v2640/horizon: [N3] 保底破坏不牵连分类表（逐锚敏感）');
  // N4 非恒真：状态确实逐格变化（全部用**保底**制造确定性触发，不靠 100% 概率——
  //   本锁的 chance 上限就是 100，而 100 与「必然」在实现里是同一件事，但用保底更直白：
  //   它同时证明了「forced 路径与 chance 路径共用同一套冷却/挂起机制」。
  const chg = isolated(function () {
    const WA = fresh();
    const hz = hzOf(WA);
    resetLanes(WA, 'n4');
    hz.setSettings({ distantEnabled: true, distantChance: 1, distantCooldown: 2, distantLedger: 30 });
    WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 30, cooldown: 0, pending: null, lastFired: 0 }; }, TAG + 'n4a');
    const r1 = hz.rollLane('distant');            // 保底到点 ⇒ 触发并上膛
    const cd1 = lane(WA, 'distant').cooldown;
    const r2 = hz.rollLane('distant');            // 冷却 2→1
    const cd2 = lane(WA, 'distant').cooldown;
    const r3 = hz.rollLane('distant');            // 冷却 1→0
    const cd3 = lane(WA, 'distant').cooldown;
    WA.store.transact(function (d) { d.evolution.horizon.distant.ledger = 30; d.evolution.horizon.distant.pending = null; }, TAG + 'n4b');
    const r4 = hz.rollLane('distant');            // 冷却归零 ⇒ 可再触发
    return { f1: r1.fired, cd1: cd1, f2: r2.fired, cd2: cd2, f3: r3.fired, cd3: cd3, f4: r4.fired, cd4: lane(WA, 'distant').cooldown };
  });
  a(chg.f1 === true && chg.cd1 === 2 && chg.f2 === false && chg.cd2 === 1 && chg.f3 === false && chg.cd3 === 0 && chg.f4 === true && chg.cd4 === 2,
    'v2640/horizon: [N4] 状态确实逐格变化：触发(cd2)→冷却(1)→冷却(0)→再触发(cd2)（实 ' + JSON.stringify(chg) + '）');
  // N5 无副作用
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2640/horizon: [N5] 探测哨兵不泄漏进真存档（残留键: ' + (leak.join(',') || '无') + '）');
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
  if (fail) { console.log('HORIZON-V2640: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('HORIZON-V2640: pass（' + pass + ' 项）');
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeRolls: probeRolls, probeCooldown: probeCooldown, probeForced: probeForced, probeReason: probeReason,
  brokenOverride: brokenOverride
};