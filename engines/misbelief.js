/**
 * WorldAxis engines/misbelief.js (v2.524.0) — EXV28-07/08/09/10 错误信念与信息战
 *
 * ── 它治什么（现场读数）──────────────────────────────────────────────
 *   全仓 `misbelief` **0 命中**、`将错就错` **0 命中**。
 *   `people.knows` 只把前 10 个键塞进推演快照（backstage:229）——模型拿到的是
 *   「他知道什么」，不是「他**以为**什么」。于是世界只有两态：知道 / 不知道，
 *   没有「确信但是错的」，更没有「我故意让他信错的」。
 *
 * ── 本模块只做四件事 ─────────────────────────────────────────────────
 *   assert()  登记一条信念（带确信度、来源、真值未知/真/假）。
 *   correct() 用证据纠正：只改「他现在信什么」，**不改已造成的代价**。
 *   cost()    记一条错信代价（基于错信造成的损失不回溯）。
 *   plant()   故意误导：把假消息交给 rumor 的传播链（复用 owner，不自造传播）。
 *
 * ── 边界 ─────────────────────────────────────────────────────────────
 *   1 不判定真值：`truth` 只能 world/known-false/unknown，由调用方给；本模块不猜。
 *   2 纠正不回溯：correct() 不改 costs。
 *   3 只写 actors[id].misbeliefs，不新增顶层键。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_misbelief_settings_v1';
  const DEF = { enabled: true, maxPerActor: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'misbelief', bounds: { maxPerActor: [1, 48] } };
  const stat = { asserted: 0, corrected: 0, planted: 0, refused: 0, lastReason: '' };
  const TRUTH = ['world', 'known-false', 'unknown'];
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function now() { try { return WA.clock.now('misbelief'); } catch (e) { return Date.now(); } }
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 80) : ''; }
  function findActor(d, id) {
    const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
    if (m[id]) return m[id];
    const ks = Object.keys(m);
    for (let i = 0; i < ks.length; i++) if (m[ks[i]] && m[ks[i]].name === id) return m[ks[i]];
    return null;
  }
  function rows(a) { return a && Array.isArray(a.misbeliefs) ? a.misbeliefs : []; }
  function assert(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.who || '').trim();
    const about = clean(s.about, 60);
    const belief = clean(s.belief, 90);
    if (!id) { stat.refused++; stat.lastReason = 'missing-id'; return { ok: false, reason: 'missing-id' }; }
    if (!about) { stat.refused++; stat.lastReason = 'missing-about'; return { ok: false, reason: 'missing-about' }; }
    if (!belief) { stat.refused++; stat.lastReason = 'missing-belief'; return { ok: false, reason: 'missing-belief' }; }
    const truth = TRUTH.indexOf(String(s.truth || '')) >= 0 ? String(s.truth) : 'unknown';
    const conf = Math.max(0, Math.min(100, Number.isFinite(s.confidence) ? Number(s.confidence) : 60));
    const row = { id: 'mb_' + round() + '_' + (stat.asserted + 1), about: about, belief: belief,
      truth: truth, confidence: conf, source: clean(s.source, 60) || 'unknown',
      corrected: false, at: now(), round: round(), costs: [] };
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.actors = d.actors || {};
          const a = findActor(d, id) || (d.actors[id] = { id: id, conditions: [] });
          a.misbeliefs = rows(a);
          a.misbeliefs.push(row);
          if (a.misbeliefs.length > cfg.maxPerActor) a.misbeliefs.shift();
          return true;
        }, 'misbelief:assert');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    stat.asserted++;
    return { ok: true, reason: wrote ? 'asserted' : 'asserted-no-store', id: row.id, truth: truth };
  }
  function correct(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.who || '').trim();
    const about = clean(s.about, 60);
    const evidence = clean(s.evidence, 90);
    if (!id) return { ok: false, reason: 'missing-id' };
    if (!about) return { ok: false, reason: 'missing-about' };
    if (!evidence) return { ok: false, reason: 'no-evidence' };
    let hit = null;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          const a = findActor(d, id);
          if (!a) return true;
          rows(a).forEach(function (x) {
            if (x && x.about === about && !x.corrected) { x.corrected = true; x.correctedAt = now(); x.correctedBy = evidence; hit = x; }
          });
          return true;
        }, 'misbelief:correct');
      }
    } catch (e) { /* 降级 */ }
    if (!hit) return { ok: false, reason: 'belief-not-found' };
    stat.corrected++;
    return { ok: true, reason: 'corrected', id: hit.id, priorCosts: hit.costs.length };
  }
  function cost(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.who || '').trim();
    const about = clean(s.about, 60);
    const what = clean(s.what, 90);
    if (!id || !about || !what) return { ok: false, reason: 'missing-fields' };
    let ok = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          const a = findActor(d, id);
          if (!a) return true;
          rows(a).forEach(function (x) {
            if (x && x.about === about) {
              x.costs.push({ what: what, at: now(), round: round(), undone: false });
              ok = true;
            }
          });
          return true;
        }, 'misbelief:cost');
      }
    } catch (e) { /* 降级 */ }
    return ok ? { ok: true, reason: 'cost-recorded' } : { ok: false, reason: 'belief-not-found' };
  }
  /** 故意误导：交给 rumor 的传播链，不自造传播。 */
  function plant(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const content = clean(s.content || s.what, 120);
    const from = clean(s.from || s.source, 40);
    if (!content) { stat.refused++; stat.lastReason = 'missing-content'; return { ok: false, reason: 'missing-content' }; }
    let r = null;
    try {
      if (WA.rumor && typeof WA.rumor.startChain === 'function') {
        r = WA.rumor.startChain({ content: content, from: from || 'unknown', kind: 'planted', intentional: true });
      }
    } catch (e) { r = null; }
    if (!r) { stat.refused++; stat.lastReason = 'rumor-missing'; return { ok: false, reason: 'rumor-missing' }; }
    stat.planted++;
    return { ok: true, reason: 'planted', chain: (r && (r.id || r.chainId)) || '', note: '传播由 rumor 拥有，本模块不改它' };
  }
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.who || '').trim();
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const a = findActor(d, id);
    if (!a) return { ok: false, reason: 'actor-missing' };
    const live = rows(a).filter(function (x) { return !x.corrected; });
    return { ok: true, id: id, beliefs: rows(a), live: live.length,
      wrong: live.filter(function (x) { return x.truth === 'known-false'; }).length };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
    const lines = [];
    Object.keys(m).forEach(function (k) {
      const a = m[k];
      rows(a).forEach(function (x) {
        if (!x || x.corrected) return;
        if (x.truth !== 'known-false' && x.confidence < 60) return;
        if (lines.length >= 3) return;
        lines.push('- ' + clean(a.name || k, 24) + '以为：' + x.belief + (x.truth === 'known-false' ? '（与事实不符）' : ''));
      });
    });
    return lines.length ? '[他们以为的事]\n' + lines.join('\n') : '';
  }
  WA.misbelief = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    TRUTH: TRUTH.slice(), assert: assert, correct: correct, cost: cost, plant: plant,
    view: view, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/misbelief.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/misbelief 已加载（' + VERSION + '）');
})();