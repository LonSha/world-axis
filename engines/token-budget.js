/**
 * WorldAxis engines/token-budget.js (v2.517.0) — OPV26-3 用量/延迟分位视图
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   callLedger 只有次数与耗时，无 tokens 维度 ⇒ 「后台常驻引擎
 *   （backstage/periodicals/ensemble/…）一天烧掉多少 token」全库答不出。
 *   且耗时只有 avg —— 平均值会被长尾吃掉，P95 才是「玩家体感的卡」。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   observe({channel, kind, promptTokens, completionTokens, ms, at}) 记样本；
 *   view() 按渠道聚合 tokens 与 ms 分位 P50/P95（环形样本上限 maxSamples，
 *   过期样本不进分位——过期读数会污染决策，只进总量不进延迟窗）；
 *   debt() 点名哪些渠道被登记过（setChannels）但从未喂账。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 只记账不调用；写口（喂账）直接暴露 observe（后台引擎显式上报用），
 *      业务写口仍统一 ActionDesk（'tokenBudget.observe' 路由同批登记）。
 *   ② 样本账是运行时环形账（maxSamples 封顶 trim 实测），跨会话不留 —— 理由同 model-receipt；
 *      唯一持久键是 settings 键（经 settingsBus，零 WA.evict）。
 *   ③ 分位判据：样本不足时 P50/P95 如实 null，不用 0 冒充「没数据」。
 *   ④ 拒收码只用 disabled / missing-channel / bad-sample。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const wallNow = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_token_budget_settings_v1';
  const DEF = { enabled: true, maxSamples: 500, windowMs: 86400000, channels: [] };
  const __REG = { key: LS_KEY, def: DEF, module: 'tokenBudget',
    bounds: { maxSamples: [50, 5000], windowMs: [3600000, 604800000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { observed: 0, trimmed: 0, refused: 0, lastReason: '' };
  const SAMPLES = []; // {channel, kind, promptTokens, completionTokens, ms, at}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  /** 环形 trim：超 cap 从头丢（丢的都进 stat.trimmed，不静默）。 */
  function trimCap(cap) { let n = 0; while (SAMPLES.length > cap) { SAMPLES.shift(); n++; } if (n) stat.trimmed += n; }
  /** 分位：最近 windowMs 窗口内的 ms 样本（过期样本只进总量，不进延迟窗）。 */
  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
    return sorted[idx];
  }
  function observe(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel);
    if (!channel) { stat.refused++; stat.lastReason = 'missing-channel';
      return { ok: false, reason: 'missing-channel', hint: 'missing-channel：哪个渠道烧的？不记渠道的用量没法归因' }; }
    const pt = num(s.promptTokens), ct = num(s.completionTokens), ms = num(s.ms);
    if (pt == null || ct == null || pt < 0 || ct < 0 || (ms != null && ms < 0)) {
      stat.refused++; stat.lastReason = 'bad-sample';
      return { ok: false, reason: 'bad-sample', hint: 'bad-sample：tokens 不许负值；ms 给了就也不许负' }; }
    const kind = str(s.kind) || 'unknown';
    SAMPLES.push({ channel: channel, kind: kind, promptTokens: pt, completionTokens: ct, ms: ms, at: num(s.at) || wallNow() });
    trimCap(cfg.maxSamples);
    stat.observed++;
    return { ok: true, samples: SAMPLES.length };
  }
  function view() {
    const cfg = settings();
    const now = wallNow();
    const byCh = {};
    const freshMs = {}; // 渠道 -> 窗口内 ms 样本（只这些进分位）
    SAMPLES.forEach(function (x) {
      const m = byCh[x.channel] || (byCh[x.channel] = { channel: x.channel, count: 0,
        promptTokens: 0, completionTokens: 0, lastAt: 0, kinds: {} });
      m.count++; m.promptTokens += x.promptTokens; m.completionTokens += x.completionTokens;
      m.lastAt = Math.max(m.lastAt, x.at);
      m.kinds[x.kind] = (m.kinds[x.kind] || 0) + 1;
      if (x.ms != null && (now - x.at) <= cfg.windowMs) {
        (freshMs[x.channel] || (freshMs[x.channel] = [])).push(x.ms);
      }
    });
    const channels = Object.keys(byCh).map(function (k) {
      const msArr = (freshMs[k] || []).slice().sort(function (a, b) { return a - b; });
      return Object.assign(byCh[k], {
        p50Ms: percentile(msArr, 0.5), p95Ms: percentile(msArr, 0.95),
        msSamples: msArr.length
      });
    });
    channels.sort(function (a, b) { return b.completionTokens - a.completionTokens; });
    return { ok: true, windowMs: cfg.windowMs, samples: SAMPLES.length,
      totalPromptTokens: channels.reduce(function (s, c) { return s + c.promptTokens; }, 0),
      totalCompletionTokens: channels.reduce(function (s, c) { return s + c.completionTokens; }, 0),
      channels: channels };
  }
  /** 债务视图：被登记过（setChannels）但从未喂账的渠道点名 —— 「这一路到底跑没跑过」。 */
  function debt() {
    const cfg = settings();
    const seen = {};
    SAMPLES.forEach(function (x) { seen[x.channel] = 1; });
    const rows = (cfg.channels || []).map(function (c) {
      return { channel: c, observed: !!seen[c] };
    }).filter(function (r) { return !r.observed; });
    return { ok: true, registered: (cfg.channels || []).length, neverObserved: rows,
      clean: rows.length === 0,
      hint: rows.length ? '以下渠道登记过配置但从未产生用量样本：要么没人调用它，要么它调用时没喂账' : '登记渠道全部有账' };
  }
  function statView() { return Object.assign({ samples: SAMPLES.length }, stat); }
  function reset() {
    SAMPLES.length = 0;
    stat.observed = 0; stat.trimmed = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.tokenBudget = {
    observe: observe, view: view, debt: debt,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/token-budget.js', { kind: 'engine', ver: '2.517.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/token-budget 已加载（2.517.0）');
})();