/**
 * WorldAxis engines/outsider-integration.js (v2.416.0) — EXV24-2 外乡人融入与排外
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「外乡人 / 异乡人 / 排外 / 融入」全仓语料 0 命中。world 是封闭熟人社会：
 *   demographic-flow 只管迁移总数，populate 只播种，没有一个字回答
 *   「新来的那个人，本地人拿他当自己人了吗」。于是一个外来者住十年，
 *   叙事里永远是"外乡人"—— 融入没有刻度，排外没有代价。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `arrive` 落籍 → 本地人每次真金白银的接纳/拒绝（受雇、受拒、扶助、告发）
 *   由 `recordWitness` 记见证 → 见证面决定融入档（生客 → 面熟 → 半个自己人 → 自家人）。
 *   **档只由见证推**，不由居住时长推：住得久不等于被接纳。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store：谁来了、谁接纳了他，由调用方给。
 *   ② 见证必须带方向与结果（hired/refused/helped/shunned/sponsored），
 *      不收"大家对他印象不错"这类无名氏综述 —— 无名氏综述不入账。
 *   ③ 负见证不清零正见证，但 sponsored（本地人作保）是唯一能跳档的事。
 *   ④ 条数有界（默认 32 人）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_outsider_integration_settings_v1';
  const DEF = { enabled: true, maxRows: 32, sponsoredAt: 4 };
  const __REG = { key: LS_KEY, def: DEF, module: 'outsiderIntegration',
    bounds: { maxRows: [8, 96], sponsoredAt: [2, 8] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const stat = { arrivals: 0, witnesses: 0, refused: 0, lastReason: '' };
  const BOOK = {}; // who -> {from, arrivedAt, w:[{kind, by, at}], sponsored}
  const KINDS = ['hired', 'refused', 'helped', 'shunned', 'sponsored'];
  function str(v) { return String(v == null ? '' : v).trim(); }
  /** 档：正见证(含 hired/helped) - 负见证(refused/shunned) + sponsored 加权。 */
  function band(rec, cfg) {
    const pos = rec.w.filter(function (x) { return x.kind === 'hired' || x.kind === 'helped'; }).length;
    const neg = rec.w.filter(function (x) { return x.kind === 'refused' || x.kind === 'shunned'; }).length;
    const score = pos - neg + (rec.sponsored ? cfg.sponsoredAt : 0);
    if (rec.sponsored && score >= cfg.sponsoredAt) return '自家人';
    if (score >= 5) return '半个自己人';
    if (score >= 2) return '面熟';
    return '生客';
  }
  function arrive(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who), from = str(s.from);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：谁来了？' }; }
    if (!from) { stat.refused++; stat.lastReason = 'missing-from'; return { ok: false, hint: 'missing-from：从哪儿来？没有来处就谈不上外乡' }; }
    if (!BOOK[who]) {
      if (Object.keys(BOOK).length >= cfg.maxRows) {
        const oldest = Object.keys(BOOK).sort(function (a, b) { return (BOOK[a].arrivedAt || 0) - (BOOK[b].arrivedAt || 0); })[0];
        delete BOOK[oldest];
      }
      BOOK[who] = { from: from, arrivedAt: s.at || null, w: [], sponsored: false };
      stat.arrivals++;
    }
    const rec = BOOK[who];
    return { ok: true, who: who, tier: band(rec, cfg), witnesses: rec.w.length };
  }
  function recordWitness(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who), kind = str(s.kind), by = str(s.by);
    if (!BOOK[who]) { stat.refused++; stat.lastReason = 'unknown-outsider'; return { ok: false, hint: 'unknown-outsider：' + who + ' 没落过籍，先 arrive 再说' }; }
    if (KINDS.indexOf(kind) < 0) { stat.refused++; stat.lastReason = 'unknown-kind'; return { ok: false, hint: 'unknown-kind：见证只认 ' + KINDS.join('/') }; }
    if (!by) { stat.refused++; stat.lastReason = 'missing-by'; return { ok: false, hint: 'missing-by：是哪位本地人做的？无名氏综述不入账' }; }
    const rec = BOOK[who];
    rec.w.push({ kind: kind, by: by, at: s.at || null });
    if (rec.w.length > 64) rec.w.shift();
    if (kind === 'sponsored') rec.sponsored = true;
    stat.witnesses++;
    return { ok: true, who: who, tier: band(rec, cfg), witnesses: rec.w.length };
  }
  function view(who) {
    const cfg = settings();
    if (who) {
      const rec = BOOK[str(who)];
      if (!rec) return { ok: false, hint: 'unknown-outsider：没有这个人' };
      return { ok: true, who: str(who), from: rec.from, tier: band(rec, cfg), sponsored: rec.sponsored,
        witnesses: rec.w.map(function (x) { return x.kind + '（' + x.by + '）'; }) };
    }
    const rows = Object.keys(BOOK).map(function (k) {
      const r = BOOK[k];
      return { who: k, from: r.from, tier: band(r, cfg), sponsored: r.sponsored, witnesses: r.w.length };
    }).sort(function (a, b) { return a.tier.localeCompare(b.tier); });
    return { ok: true, count: rows.length, rows: rows };
  }
  function statView() { return Object.assign({ people: Object.keys(BOOK).length, tiers: Object.keys(BOOK).reduce(function (m, k) { const t = band(BOOK[k], settings()); m[t] = (m[t] || 0) + 1; return m; }, {}) }, stat); }
  function reset() { Object.keys(BOOK).forEach(function (k) { delete BOOK[k]; }); stat.arrivals = 0; stat.witnesses = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.outsiderIntegration = {
    arrive: arrive, recordWitness: recordWitness, view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/outsider-integration.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/outsider-integration 已加载（2.416.0）');
})();
