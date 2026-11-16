/**
 * WorldAxis engines/model-receipt.js (v2.517.0) — OPV26-1 模型响应回执账
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   core/api-router.js 的 callLedger 只记请求侧（count/ok/errors/ms）；
 *   响应体里的 data.model（服务端声明「实际用哪个模型服务了你」）与
 *   data.usage（prompt/completion tokens）被 _callInner 直接丢弃。
 *   后果：「这一步是不是被换成了便宜模型（降智）」与「吐字速度（TPS）」
 *   全库答不出——回执一出进程就没了。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   api-router 每次成功调用后 `record()` 盖章一条回执；漂移判据：
 *   reqModel 与 respModel **都有值且不相等** ⇒ drift:true（服务端回执是
 *   唯一可对证的凭据——请求里写 A、回执里是 B，这就是对证本身）。
 *   respModel 缺席（部分兼容端不回 model 字段）⇒ 如实记 null，不猜不补全。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 只记账不调用：本模块不发起任何网络请求（调用面只有 api-router）。
 *   ② 回执账是**运行时环形账**（maxRows 封顶、trim 实测），断电即失、不留持久键
 *      —— 它是「刚才发生了什么」的凭据，不是需要跨会话幸存的状态；
 *      唯一持久键是 settings 键（经 settingsBus，与 V25 十一引擎同款，零 WA.evict）。
 *   ③ record 故障绝不影响真调用（接线侧 try/catch 收住）——观测面崩了不能拖垮业务面。
 *   ④ 拒收码只用 disabled / missing-channel。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const wallNow = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_model_receipt_settings_v1';
  const DEF = { enabled: true, maxRows: 200 };
  const __REG = { key: LS_KEY, def: DEF, module: 'modelReceipt',
    bounds: { maxRows: [20, 2000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { records: 0, drifts: 0, respModelAbsent: 0, refused: 0, lastReason: '' };
  const ROWS = []; // 环形：新的一条从尾进，超 cap 从头 trim
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function usageOf(u) {
    const o = (u && typeof u === 'object') ? u : {};
    return {
      promptTokens: num(o.prompt_tokens) != null ? num(o.prompt_tokens) : (num(o.promptTokens) || 0),
      completionTokens: num(o.completion_tokens) != null ? num(o.completion_tokens) : (num(o.completionTokens) || 0)
    };
  }
  /** 盖章：api-router 成功路径的唯一入口。漂移判据在这里，不散在外头。 */
  function record(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel) || 'default';
    if (!channel) { stat.refused++; stat.lastReason = 'missing-channel'; return { ok: false, reason: 'missing-channel' }; }
    const reqModel = str(s.reqModel) || null;
    const respModel = str(s.respModel) || null;   // 兼容端不回 model ⇒ 如实 null，不猜
    if (!respModel) stat.respModelAbsent++;
    const usage = usageOf(s.usage);
    const ms = num(s.ms) != null ? num(s.ms) : null;
    // 漂移：两边都有值且不等。respModel 缺席时**不判漂移**（缺席≠漂移，不制造假红）
    const drift = !!(reqModel && respModel && reqModel !== respModel);
    // TPS：completion tokens / 秒。ms<=0 或 0 token ⇒ null（不产出除零伪读数）
    const tps = (usage.completionTokens > 0 && ms > 0) ? Math.round((usage.completionTokens / (ms / 1000)) * 10) / 10 : null;
    const row = { channel: channel, reqModel: reqModel, respModel: respModel, drift: drift,
      promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
      ms: ms, tps: tps, at: num(s.at) || wallNow() };
    ROWS.push(row);
    while (ROWS.length > cfg.maxRows) ROWS.shift();
    stat.records++;
    if (drift) stat.drifts++;
    return { ok: true, drift: drift, tps: tps, respModelAbsent: !respModel,
      hint: drift ? ('drift：请求模型[' + reqModel + '] ≠ 回执模型[' + respModel + '] —— 服务端换了模型服务这一笔') : '' };
  }
  /** 回执清单：默认最新在前；可按渠道/只看漂移过滤。 */
  function list(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const ch = str(s.channel);
    const limit = num(s.limit) || 50;
    let rows = ROWS.slice().reverse();
    if (ch) rows = rows.filter(function (r) { return r.channel === ch; });
    if (s.drifting) rows = rows.filter(function (r) { return r.drift; });
    return { ok: true, total: ROWS.length, rows: rows.slice(0, limit) };
  }
  /** 聚合视图：按渠道计数、tokens 总量、漂移数、最近 TPS。 */
  function stats() {
    const byCh = {};
    ROWS.forEach(function (r) {
      const m = byCh[r.channel] || (byCh[r.channel] = { channel: r.channel, count: 0, drifts: 0,
        promptTokens: 0, completionTokens: 0, lastTps: null, lastRespModel: null });
      m.count++; m.promptTokens += r.promptTokens; m.completionTokens += r.completionTokens;
      if (r.drift) m.drifts++;
      if (r.tps != null) m.lastTps = r.tps;
      if (r.respModel) m.lastRespModel = r.respModel;
    });
    const channels = Object.keys(byCh).map(function (k) { return byCh[k]; });
    return { ok: true, records: ROWS.length, totalDrifts: stat.drifts,
      respModelAbsent: stat.respModelAbsent, channels: channels };
  }
  /** 漂移对证：req→resp 模型对计数（谁被换成谁、换了几次，一眼可读）。 */
  function drifters() {
    const pairs = {};
    ROWS.forEach(function (r) {
      if (!r.drift) return;
      const k = r.channel + '|' + r.reqModel + '→' + r.respModel;
      const p = pairs[k] || (pairs[k] = { channel: r.channel, reqModel: r.reqModel, respModel: r.respModel, count: 0, lastAt: 0 });
      p.count++; p.lastAt = Math.max(p.lastAt, r.at);
    });
    const rows = Object.keys(pairs).map(function (k) { return pairs[k]; });
    rows.sort(function (a, b) { return b.count - a.count; });
    return { ok: true, clean: stat.drifts === 0, total: rows.length, pairs: rows,
      hint: rows.length ? '存在模型漂移：以服务端回执为准核对各渠道配置' : '无漂移：请求模型与回执模型全部一致' };
  }
  function statView() { return Object.assign({ rows: ROWS.length }, stat); }
  function reset() {
    ROWS.length = 0;
    stat.records = 0; stat.drifts = 0; stat.respModelAbsent = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.modelReceipt = {
    record: record, list: list, stats: stats, drifters: drifters,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/model-receipt.js', { kind: 'engine', ver: '2.517.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/model-receipt 已加载（2.517.0）');
})();
