/**
 * WorldAxis engines/history-batch-read.js (v2.417.0) — OPV25-4 历史批量读取（快照续放）
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   本仓读历史有两条路，两条都慢在同一个地方：
 *     · `floor-snapshot.js` 能存快照、能 rollback，但**没有「从最近快照往后续放到某层」**这条读路；
 *     · `chronicle-view` / `history-search` 按词检索，但一读就是**逐层冷回放**。
 *   实测 `grep -rn '历史快照批量\|batchReadRange\|resumeFromSnapshot' engines/` —— 430 引擎 0 命中。
 *
 *   后果：高楼层的读取代价随楼层数线性上涨，而其中**大段区间根本没有帧**（那些楼没产生快照点），
 *   逐层回放它们纯粹是白跑。这不是性能优化题，是**读法错了**：
 *   该从「最近一次快照」续放，把**无帧区间整段跳过**。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `index({snapshots:[{at, layer}], frames:[layer...]})` 建一次读计划 →
 *   计划里明确分三类：**快照起点**（最近一个 ≤ 目标的快照层）、
 *   **需回放层**（快照之后到目标之间真有帧的层）、**可跳过区间**（无帧的连续段）。
 *   `read` 只读报这份计划；`consume` 标已读（幂等，重复读同一区间不再算新读）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不真的读内容：本模块只算**该读哪些层、能跳哪些段**，内容由调用方取。
 *   ② 快照层必须 ≤ 目标层；没有可用快照就如实从最早层起读（不假装有快照）。
 *   ③ 跳过区间必须给出理由（`no-frame`），不是静默省略。
 *   ④ 拒收码只用 disabled / missing-target / bad-range。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_history_batch_settings_v1';
  const DEF = { enabled: true, maxPlan: 64 };
  const __REG = { key: LS_KEY, def: DEF, module: 'historyBatch', bounds: { maxPlan: [4, 256] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { plans: 0, reads: 0, skippedSegs: 0, skippedLayers: 0, refused: 0, lastReason: '' };
  const PLANS = []; // {id, from, to, base, replay:[], skip:[{from,to,why}], consumed:{}}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function uniqSorted(arr) {
    const out = [];
    arr.forEach(function (x) { const n = num(x); if (n !== null && !out.includes(n)) out.push(n); });
    return out.sort(function (a, b) { return a - b; });
  }
  /** 把一串不相邻的层号，压成「连续区间」列表（用于跳过段与回放段）。 */
  function segsOf(layers) {
    const out = [];
    let start = null, prev = null;
    layers.forEach(function (n) {
      if (start === null) { start = n; prev = n; return; }
      if (n === prev + 1) { prev = n; return; }
      out.push({ from: start, to: prev });
      start = n; prev = n;
    });
    if (start !== null) out.push({ from: start, to: prev });
    return out;
  }
  function index(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const to = num(s.to != null ? s.to : s.target);
    if (to === null) { stat.refused++; stat.lastReason = 'missing-target';
      return { ok: false, hint: 'missing-target：要读到哪一层？没有目标层就没法算读法' }; }
    const from = num(s.from) != null ? num(s.from) : 1;
    if (from > to) { stat.refused++; stat.lastReason = 'bad-range';
      return { ok: false, hint: 'bad-range：起点比终点还大（from=' + from + ' / to=' + to + '）' }; }
    const snaps = Array.isArray(s.snapshots) ? s.snapshots : [];
    const frames = uniqSorted(Array.isArray(s.frames) ? s.frames : []);
    // 最近一个 ≤ to 且 ≥ from 的快照层
    let base = null;
    snaps.forEach(function (it) {
      const layer = num(it && it.layer);
      if (layer === null || layer < from || layer > to) return;
      if (base === null || layer > base) base = layer;
    });
    const startAt = base === null ? from : base;
    const replay = frames.filter(function (n) { return n >= startAt && n <= to; });
    // 无帧区间：from..to 里除「有帧层」与「快照层」之外的连续段
    const has = {};
    replay.forEach(function (n) { has[n] = true; });
    if (base !== null) has[base] = true;
    const missing = [];
    for (let n = startAt; n <= to; n++) { if (!has[n]) missing.push(n); }
    const skip = segsOf(missing).map(function (sg) { return { from: sg.from, to: sg.to, why: 'no-frame' }; });
    const plan = { id: 'hb' + (++stat.plans), from: from, to: to, base: base, baseMode: base === null ? 'from-scratch' : 'resume',
      replay: replay, skip: skip, consumed: {} };
    PLANS.push(plan);
    while (PLANS.length > cfg.maxPlan) PLANS.shift();
    let skippedLayers = 0;
    skip.forEach(function (sg) { skippedLayers += (sg.to - sg.from + 1); });
    stat.skippedSegs += skip.length; stat.skippedLayers += skippedLayers;
    return { ok: true, planId: plan.id, from: from, to: to, base: base, baseMode: plan.baseMode,
      replayCount: replay.length, replay: replay.slice(0, 64), skip: skip,
      skippedLayers: skippedLayers,
      hint: base === null ? '没有可用快照：从起点层老实起读，不假装有快照' : '从最近快照续放，无帧区间整段跳过（理由是没帧，不是静默省略）' };
  }
  function read(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = str(s.planId);
    const plan = PLANS.find(function (p) { return p.id === id; });
    if (!plan) return { ok: false, hint: 'unknown-plan：没有这份读计划' };
    const todo = plan.replay.filter(function (n) { return !plan.consumed[n]; });
    stat.reads++;
    return { ok: true, planId: plan.id, base: plan.base, baseMode: plan.baseMode,
      todo: todo, done: plan.replay.filter(function (n) { return plan.consumed[n]; }),
      skip: plan.skip };
  }
  /** 标已读：幂等 —— 同一层重复标不算新读。 */
  function consume(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const plan = PLANS.find(function (p) { return p.id === str(s.planId); });
    if (!plan) return { ok: false, hint: 'unknown-plan：没有这份读计划' };
    const list = Array.isArray(s.layers) ? uniqSorted(s.layers) : plan.replay.slice();
    let fresh = 0;
    list.forEach(function (n) { if (!plan.consumed[n]) { plan.consumed[n] = true; fresh++; } });
    return { ok: true, planId: plan.id, consumed: fresh, dup: list.length - fresh,
      remaining: plan.replay.filter(function (n) { return !plan.consumed[n]; }).length };
  }
  function view() {
    return { ok: true, count: PLANS.length, plans: PLANS.map(function (p) {
      return { id: p.id, from: p.from, to: p.to, base: p.base, baseMode: p.baseMode,
        replay: p.replay.length, skipSegs: p.skip.length };
    }) };
  }
  function statView() { return Object.assign({ plans: PLANS.length }, stat); }
  function reset() {
    PLANS.length = 0;
    stat.plans = 0; stat.reads = 0; stat.skippedSegs = 0; stat.skippedLayers = 0;
    stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.historyBatch = {
    index: index, read: read, consume: consume, view: view, segsOf: segsOf,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/history-batch-read.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/history-batch-read 已加载（2.417.0）');
})();