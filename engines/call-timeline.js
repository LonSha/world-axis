/**
 * WorldAxis engines/call-timeline.js (v2.517.0) — OPV26-4 单轮调用时间线
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   一轮生成里可能串起多笔模型调用（推演 → 摘要 → 裁判 → 选项 → 观察）。
 *   callLedger 按**渠道**聚合，把不同轮、不同用途全糊在一个平均数里；
 *   requestViewer 按**请求**留报文。两者都答不出：「这一轮到底卡在哪一段、
 *   关键路径是哪一笔」。
 *   实测：全仓 grep 'roundId.*ms|timeline.*call' = 0 命中（perfTrace 是渲染面，不是调用面）。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `begin({roundId})` 开一轮 → 每笔调用 `mark({roundId, channel, kind, ms})`
 *   → `end({roundId})` 收轮算出 totalMs / longestMs / criticalChannel
 *   （关键路径 = 本轮最长的那一笔，不是总和平均）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 时间线是**运行时环形账**（maxRounds 封顶 trim 实测），不留持久键（理由同 model-receipt）。
 *   ② 未 begin 就 mark ⇒ 拒收码 unknown-round（不偷偷开轮：凭空造轮会让关键路径失真）。
 *   ③ 单笔 ms 缺席不记（宁可少一笔，不拿 0 冒充「很快」）。
 *   ④ 拒收码只用 disabled / missing-round / unknown-round / missing-channel / bad-sample。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const wallNow = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_call_timeline_settings_v1';
  const DEF = { enabled: true, maxRounds: 40, maxSpans: 64 };
  const __REG = { key: LS_KEY, def: DEF, module: 'callTimeline',
    bounds: { maxRounds: [5, 200], maxSpans: [8, 256] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { rounds: 0, spans: 0, closed: 0, trimmed: 0, refused: 0, lastReason: '' };
  const ROUNDS = [];   // 环形；每项 {roundId, startAt, spans:[], closedAt, totalMs, longestMs, criticalChannel}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function findRound(roundId) {
    for (let i = ROUNDS.length - 1; i >= 0; i--) if (ROUNDS[i].roundId === roundId) return ROUNDS[i];
    return null;
  }
  function begin(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const roundId = str(s.roundId);
    if (!roundId) { stat.refused++; stat.lastReason = 'missing-round';
      return { ok: false, reason: 'missing-round', hint: 'missing-round：这一轮叫什么？没有轮号就没法归组' }; }
    const prev = findRound(roundId);
    if (prev) return { ok: true, roundId: roundId, reused: true, startAt: prev.startAt,
      hint: '同轮号已开过：复用原轮（重开会把已有跨度丢在旧轮上）' };
    const rec = { roundId: roundId, startAt: num(s.at) || wallNow(), spans: [],
      closedAt: null, totalMs: null, longestMs: null, criticalChannel: null };
    ROUNDS.push(rec);
    while (ROUNDS.length > cfg.maxRounds) { ROUNDS.shift(); stat.trimmed++; }
    stat.rounds++;
    return { ok: true, roundId: roundId, startAt: rec.startAt };
  }
  function mark(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const roundId = str(s.roundId);
    if (!roundId) { stat.refused++; stat.lastReason = 'missing-round'; return { ok: false, reason: 'missing-round' }; }
    const rec = findRound(roundId);
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-round';
      return { ok: false, reason: 'unknown-round', hint: 'unknown-round：这一轮没 begin 过 —— 不凭空开轮（关键路径会失真）' }; }
    const channel = str(s.channel);
    if (!channel) { stat.refused++; stat.lastReason = 'missing-channel'; return { ok: false, reason: 'missing-channel' }; }
    const ms = num(s.ms);
    if (ms == null || ms < 0) { stat.refused++; stat.lastReason = 'bad-sample';
      return { ok: false, reason: 'bad-sample', hint: 'bad-sample：ms 要给非负数（宁可少记一笔，不拿 0 冒充很快）' }; }
    rec.spans.push({ channel: channel, kind: str(s.kind) || 'unknown', ms: ms,
      at: num(s.at) || wallNow() });
    if (rec.spans.length > cfg.maxSpans) { rec.spans.shift(); stat.trimmed++; }
    // 台账实时更新：收轮前 view 也能看到当前关键路径
    const longest = rec.spans.reduce(function (a, b) { return b.ms > a.ms ? b : a; }, rec.spans[0]);
    rec.longestMs = longest ? longest.ms : null;
    rec.criticalChannel = longest ? longest.channel : null;
    rec.totalMs = rec.spans.reduce(function (s2, x) { return s2 + x.ms; }, 0);
    stat.spans++;
    return { ok: true, roundId: roundId, spans: rec.spans.length, totalMs: rec.totalMs,
      longestMs: rec.longestMs, criticalChannel: rec.criticalChannel };
  }
  function end(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const roundId = str(s.roundId);
    if (!roundId) { stat.refused++; stat.lastReason = 'missing-round'; return { ok: false, reason: 'missing-round' }; }
    const rec = findRound(roundId);
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-round'; return { ok: false, reason: 'unknown-round' }; }
    if (rec.closedAt) return { ok: true, roundId: roundId, alreadyClosed: true, totalMs: rec.totalMs,
      longestMs: rec.longestMs, criticalChannel: rec.criticalChannel,
      hint: '这一轮已经收过：只读回执，不重复计入' };
    rec.closedAt = num(s.at) || wallNow();
    rec.wallMs = rec.closedAt - rec.startAt;
    stat.closed++;
    return { ok: true, roundId: roundId, spans: rec.spans.length, totalMs: rec.totalMs,
      longestMs: rec.longestMs, criticalChannel: rec.criticalChannel,
      wallMs: rec.wallMs,
      // 关键路径占比：最长一笔 / 各笔之和 —— 「卡在一段」还是「均匀慢」一眼分开
      criticalShare: rec.totalMs > 0 ? Math.round((rec.longestMs / rec.totalMs) * 1000) / 1000 : null };
  }
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const roundId = str(s.roundId);
    if (roundId) {
      const rec = findRound(roundId);
      if (!rec) return { ok: false, reason: 'unknown-round' };
      return { ok: true, round: { roundId: rec.roundId, startAt: rec.startAt, closedAt: rec.closedAt,
        totalMs: rec.totalMs, longestMs: rec.longestMs, criticalChannel: rec.criticalChannel,
        wallMs: rec.wallMs != null ? rec.wallMs : null, spans: rec.spans.slice() } };
    }
    return { ok: true, total: ROUNDS.length, rounds: ROUNDS.slice().reverse().map(function (r) {
      return { roundId: r.roundId, startAt: r.startAt, closedAt: r.closedAt,
        spans: r.spans.length, totalMs: r.totalMs, longestMs: r.longestMs,
        criticalChannel: r.criticalChannel };
    }) };
  }
  function statView() { return Object.assign({ rounds: ROUNDS.length }, stat); }
  function reset() {
    ROUNDS.length = 0;
    stat.rounds = 0; stat.spans = 0; stat.closed = 0; stat.trimmed = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.callTimeline = {
    begin: begin, mark: mark, end: end, view: view,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/call-timeline.js', { kind: 'engine', ver: '2.517.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/call-timeline 已加载（2.517.0）');
})();