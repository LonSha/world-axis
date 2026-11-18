/**
 * WorldAxis engines/consequence-schedule.js (v2.527.0) — EXV28-19/20/22 选择后果排期
 * 读数：choices_recent 回流（v2.404）只要求「结算」；path-echo 是**事后**回声；
 *      全仓无「未来应验条件」（`ls engines | grep consequence` 空）。
 * 机制：选择登记 1–3 条应验条件（谁/何时/何地/前提）→ 到点才落地一次（幂等）。
 * 边界：条件未满足不结算；重复落地拒收；不可比条件写 unknown，不硬算。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.527.0';
  const LS_KEY = 'worldaxis_consequence_settings_v1';
  const DEF = { enabled: true, maxPerChoice: 3, maxOpen: 40 };
  const __REG = { key: LS_KEY, def: DEF, module: 'consequenceSchedule',
    bounds: { maxPerChoice: [1, 5], maxOpen: [4, 120] } };
  const REV = ['reversible', 'paid', 'irreversible'];
  const stat = { scheduled: 0, settled: 0, missed: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('consequenceSchedule'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 90) : ''; }
  function rows() {
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    return Array.isArray(d.consequences) ? d.consequences : [];
  }
  function schedule(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const choiceId = clean(s.choiceId || s.id, 60);
    const effect = clean(s.effect, 110);
    if (!choiceId) { stat.refused++; stat.lastReason = 'missing-choice'; return { ok: false, reason: 'missing-choice' }; }
    if (!effect) { stat.refused++; stat.lastReason = 'missing-effect'; return { ok: false, reason: 'missing-effect' }; }
    const c = s.cond && typeof s.cond === 'object' ? s.cond : {};
    const cond = { who: clean(c.who, 40), where: clean(c.where, 40), premise: clean(c.premise, 90),
      whenRound: Number.isFinite(c.whenRound) ? Number(c.whenRound) : null, unknown: c.unknown === true };
    const open = rows().filter(function (x) { return x && !x.settledAt && !x.missedAt; }).length;
    if (open >= cfg.maxOpen) { stat.refused++; stat.lastReason = 'too-many-open'; return { ok: false, reason: 'too-many-open', open: open }; }
    const mine = rows().filter(function (x) { return x && x.choiceId === choiceId; }).length;
    if (mine >= cfg.maxPerChoice) { stat.refused++; stat.lastReason = 'per-choice-cap'; return { ok: false, reason: 'per-choice-cap', have: mine }; }
    const rev = REV.indexOf(String(s.reversible || '')) >= 0 ? String(s.reversible) : 'reversible';
    const r = round();
    const row = { id: 'cq_' + r + '_' + (stat.scheduled + 1), choiceId: choiceId, effect: effect,
      cond: cond, reversible: rev, dueRound: Number.isFinite(s.dueRound) ? Number(s.dueRound) : (r + 3),
      createdAt: now(), createdRound: r, settledAt: 0, missedAt: 0 };
    let ok = false;
    try {
      if (WA.store && WA.store.transact) { WA.store.transact(function (d) { d.consequences = Array.isArray(d.consequences) ? d.consequences : []; d.consequences.push(row); return true; }, 'consequence:schedule'); ok = true; }
    } catch (e) { ok = false; }
    stat.scheduled++;
    return { ok: true, reason: ok ? 'scheduled' : 'scheduled-no-store', id: row.id, dueRound: row.dueRound, reversible: rev };
  }
  /** 到点且条件满足者。条件不全 ⇒ 只看时间，不擅自结算。 */
  function due(spec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, items: [], reason: 'disabled' };
    const s = spec && typeof spec === 'object' ? spec : {};
    const r = Number.isFinite(s.atRound) ? Number(s.atRound) : round();
    const items = rows().filter(function (x) { return x && !x.settledAt && !x.missedAt && Number(x.dueRound) <= r; });
    return { ok: true, items: items, round: r, reason: items.length ? 'due' : 'nothing-due' };
  }
  function settle(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || '').trim();
    const evidence = clean(s.evidence, 90);
    if (!id) return { ok: false, reason: 'missing-id' };
    if (!evidence) return { ok: false, reason: 'no-evidence' };
    let state = '';
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          const arr = Array.isArray(d.consequences) ? d.consequences : [];
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].id === id) {
              if (arr[i].settledAt) { state = 'already-settled'; break; }
              arr[i].settledAt = now(); arr[i].settleEvidence = evidence; arr[i].settleRound = round();
              state = 'settled'; break;
            }
          }
          return true;
        }, 'consequence:settle');
      }
    } catch (e) { state = 'write-failed'; }
    if (state === 'already-settled') { stat.refused++; stat.lastReason = 'already-settled'; return { ok: false, reason: 'already-settled' }; }
    if (state !== 'settled') return { ok: false, reason: state || 'entry-missing' };
    stat.settled++;
    return { ok: true, reason: 'settled', id: id };
  }
  /** 不可逆的选择不许撤回；付费撤要真扣代价（代价由调用方证明）。 */
  function revoke(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || '').trim();
    const paid = s.paid && typeof s.paid === 'object' ? s.paid : null;
    const hit = rows().filter(function (x) { return x && x.id === id; })[0];
    if (!hit) return { ok: false, reason: 'entry-missing' };
    if (hit.reversible === 'irreversible') return { ok: false, reason: 'irreversible' };
    if (hit.reversible === 'paid' && !paid) return { ok: false, reason: 'need-cost' };
    let ok = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          const arr = Array.isArray(d.consequences) ? d.consequences : [];
          for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) { arr[i].revokedAt = now(); arr[i].revokedBy = paid ? clean(paid.what, 60) : 'free'; ok = true; }
          return true;
        }, 'consequence:revoke');
      }
    } catch (e) { ok = false; }
    return ok ? { ok: true, reason: 'revoked', id: id } : { ok: false, reason: 'write-failed' };
  }
  function review(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const choiceId = clean(s.choiceId, 60);
    const all = rows().filter(function (x) { return x && (!choiceId || x.choiceId === choiceId); });
    return { ok: true, choiceId: choiceId, items: all,
      settled: all.filter(function (x) { return x.settledAt; }).length,
      open: all.filter(function (x) { return !x.settledAt && !x.missedAt; }).length };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const r = due({});
    if (!r.items.length) return '';
    return '[该来的事]\n' + r.items.slice(0, 3).map(function (x) {
      return '- ' + x.effect + (x.cond.who ? '（牵涉 ' + x.cond.who + '）' : '');
    }).join('\n');
  }
  WA.consequenceSchedule = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    REVERSIBLE: REV.slice(), schedule: schedule, due: due, settle: settle, revoke: revoke, review: review,
    buildBlock: buildBlock, stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/consequence-schedule.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/consequence-schedule 已加载（' + VERSION + '）');
})();