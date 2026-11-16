/**
 * WorldAxis engines/suspense-ledger.js (v2.417.0) — EXV25-4 悬念簿（约定与未解之谜的核销）
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   本仓有三处相邻面，但都不是这一层：
 *     · `foreshadow.js`（v2.7x）管**伏笔**：track / develop / resolve / recycle，
 *       且明确写着「兑现判定只看显式标记，不做语义推断」；
 *     · `longline.js` 管**承诺**：promise(id, dueAt) + sweep 逾期扫描；
 *     · `threads.js` 管**线索**：addLead / converge / resolve / stall。
 *   三者各管一摊，**没有一处回答「有哪些事悬着、办完没有、什么时候该催」这个统一问题**。
 *   实测 `grep -rn '悬念簿\|suspenseLedger\|unresolvedMystery' engines/` —— 430 引擎 0 命中。
 *
 *   后果在长篇里非常具体：角色立下的约定、没解开的谜、承诺要办的事，
 *   **办完了没人核销** ——于是 AI 把已经下葬的人再提一次「他还欠我一顿酒」，
 *   把已经拆穿的谜再当悬案推一遍。这不是记性差，是**没有一本「办完就划掉」的账**。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `open({who, what, kind, dueAt})` 立一条悬念 → `close({id, eventId})` 核销，
 *   **核销必须给 eventId**（哪件事了结了它）—— 没有凭据不许划账，这一条是本模块的骨。
 *   `overdue({at})` 只读报「哪些该催了」（逾期之后**不自动消账**，只是亮着）；
 *   `reopen` 退还成悬着（写错了可退，但退也要给理由）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store：谁立的、什么事、什么凭据，全由调用方给。
 *   ② 不做语义推断：正文里出现「已经解决了」不算核销，必须有显式 eventId。
 *   ③ 条数有界（默认 64），挤出最旧的**已核销**条目，悬着的一条都不挤。
 *   ④ 拒收码只用 disabled / missing-* / unknown-entry / already-closed / not-closed。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const LS_KEY = 'worldaxis_suspense_ledger_settings_v1';
  const DEF = { enabled: true, maxRows: 64 };
  const __REG = { key: LS_KEY, def: DEF, module: 'suspenseLedger', bounds: { maxRows: [16, 256] } };
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
  const KINDS = ['promise', 'mystery', 'debt', 'vow', 'question'];
  const stat = { opened: 0, closed: 0, reopened: 0, overdueHits: 0, refused: 0, lastReason: '' };
  const ROWS = []; // {id, who, what, kind, dueAt, openedAt, closedAt, eventId, closeNote, reopenedAt}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function trimCap(cap) {
    while (ROWS.length > cap) {
      const idx = ROWS.findIndex(function (r) { return r.closedAt != null; });
      if (idx < 0) break;
      ROWS.splice(idx, 1);
    }
  }
  function open(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who), what = str(s.what);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：这是谁悬着的事？' }; }
    if (!what) { stat.refused++; stat.lastReason = 'missing-what'; return { ok: false, hint: 'missing-what：悬着的是什么事？没写清就永远没人能核销' }; }
    const kind = KINDS.indexOf(str(s.kind)) >= 0 ? str(s.kind) : 'promise';
    const now = num(s.at) || clockNow('suspenseLedger') || 0;
    const rec = { id: 'sp' + (++stat.opened) + '-' + kind, who: who, what: what, kind: kind,
      dueAt: num(s.dueAt), openedAt: now, closedAt: null, eventId: null, closeNote: '', reopenedAt: null };
    ROWS.push(rec);
    trimCap(cfg.maxRows);
    return { ok: true, id: rec.id, kind: kind, dueAt: rec.dueAt };
  }
  /** 核销：必须给 eventId —— 没有凭据不许划账。 */
  function close(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = ROWS.find(function (r) { return r.id === str(s.id); });
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-entry'; return { ok: false, hint: 'unknown-entry：没有这条悬念' }; }
    if (rec.closedAt != null) { stat.refused++; stat.lastReason = 'already-closed';
      return { ok: false, hint: 'already-closed：这条已在 ' + rec.closedAt + ' 核销（凭据 ' + rec.eventId + '），不重复划账' }; }
    const ev = str(s.eventId);
    if (!ev) { stat.refused++; stat.lastReason = 'missing-event';
      return { ok: false, hint: 'missing-event：凭什么说它了结了？没有凭据不许划账' }; }
    const now = num(s.at) || clockNow('suspenseLedger') || 0;
    rec.closedAt = now; rec.eventId = ev; rec.closeNote = str(s.note);
    stat.closed++;
    return { ok: true, id: rec.id, closedAt: rec.closedAt, eventId: rec.eventId };
  }
  function reopen(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = ROWS.find(function (r) { return r.id === str(s.id); });
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-entry'; return { ok: false, hint: 'unknown-entry：没有这条悬念' }; }
    if (rec.closedAt == null) { stat.refused++; stat.lastReason = 'not-closed';
      return { ok: false, hint: 'not-closed：它本来就还悬着，不用退' }; }
    const why = str(s.reason);
    if (!why) { stat.refused++; stat.lastReason = 'missing-reason';
      return { ok: false, hint: 'missing-reason：退也要说清为什么（凭据判错了？事情又翻出来了？）' }; }
    rec.prevEventId = rec.eventId; rec.eventId = null; rec.closedAt = null;
    rec.reopenedAt = num(s.at) || clockNow('suspenseLedger') || 0;
    stat.reopened++;
    return { ok: true, id: rec.id, reopenedAt: rec.reopenedAt, reason: why };
  }
  /** 只读：此刻哪些悬着、哪些该催了。逾期不自动消账。 */
  function overdue(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const now = num(s.at) || clockNow('suspenseLedger');
    if (now === null) return { ok: false, hint: 'missing-at：要给一个故事时刻，本模块不猜今天几号' };
    stat.overdueHits++;
    const openRows = ROWS.filter(function (r) { return r.closedAt == null; });
    const rows = openRows.map(function (r) {
      const over = r.dueAt != null && now > r.dueAt;
      return { id: r.id, who: r.who, what: r.what, kind: r.kind, dueAt: r.dueAt,
        overdue: over, overdueBy: over ? (now - r.dueAt) : 0, openedAt: r.openedAt };
    }).sort(function (a, b) { return (b.overdue - a.overdue) || ((a.dueAt || 0) - (b.dueAt || 0)); });
    return { ok: true, count: rows.length, overdueCount: rows.filter(function (r) { return r.overdue; }).length, rows: rows };
  }
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const want = str(s.status);
    const rows = ROWS.filter(function (r) {
      if (want === 'open') return r.closedAt == null;
      if (want === 'closed') return r.closedAt != null;
      return true;
    }).map(function (r) {
      return { id: r.id, who: r.who, what: r.what, kind: r.kind, dueAt: r.dueAt,
        openedAt: r.openedAt, closedAt: r.closedAt, eventId: r.eventId, closeNote: r.closeNote };
    });
    return { ok: true, count: rows.length, rows: rows };
  }
  function statView() {
    const openRows = ROWS.filter(function (r) { return r.closedAt == null; });
    return Object.assign({ rows: ROWS.length, open: openRows.length,
      closed: ROWS.length - openRows.length }, stat);
  }
  function reset() {
    ROWS.length = 0;
    stat.opened = 0; stat.closed = 0; stat.reopened = 0;
    stat.overdueHits = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.suspenseLedger = {
    open: open, close: close, reopen: reopen, overdue: overdue, view: view,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings,
    KINDS: KINDS.slice()
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/suspense-ledger.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/suspense-ledger 已加载（2.417.0）');
})();