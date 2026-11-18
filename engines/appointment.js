/**
 * WorldAxis engines/appointment.js (v2.527.0) — EXV28-23 承诺、邀约与到场
 * 读数：`ls engines | grep -iE 'appoint|meet|arriv'` 空；longline.promise 有 dueAt、
 *      agenda.upcoming 有期限表、freight 有 eta —— **货会到，人不会到**。
 * 机制：约定（对方/地点/时间窗/期待）→ 到场 / 迟到 / 失约三种结果，各自留痕。
 * 边界：不替玩家答应约定；时间走 clock；失约不得静默抹平（留 trace）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.527.0';
  const LS_KEY = 'worldaxis_appointment_settings_v1';
  const DEF = { enabled: true, maxPerActor: 8, lateGrace: 1 };
  const __REG = { key: LS_KEY, def: DEF, module: 'appointment', bounds: { maxPerActor: [1, 24], lateGrace: [0, 6] } };
  const RESULT = ['到场', '迟到', '失约', '未到'];
  const stat = { made: 0, kept: 0, late: 0, missed: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('appointment'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 70) : ''; }
  function findActor(d, id) {
    const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
    if (m[id]) return m[id];
    const ks = Object.keys(m);
    for (let i = 0; i < ks.length; i++) if (m[ks[i]] && m[ks[i]].name === id) return m[ks[i]];
    return null;
  }
  function list(a) { return a && Array.isArray(a.appointments) ? a.appointments : []; }
  function make(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who || s.id, 40);
    const withWhom = clean(s.withWhom || s.with, 40);
    const place = clean(s.place, 40);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, reason: 'missing-who' }; }
    if (!withWhom) { stat.refused++; stat.lastReason = 'missing-with'; return { ok: false, reason: 'missing-with' }; }
    if (!place) { stat.refused++; stat.lastReason = 'missing-place'; return { ok: false, reason: 'missing-place' }; }
    const r = round();
    const from = Number.isFinite(s.from) ? Number(s.from) : (r + 1);
    const to = Number.isFinite(s.to) ? Number(s.to) : (from + 2);
    const row = { id: 'ap_' + r + '_' + (stat.made + 1), who: who, withWhom: withWhom, place: place,
      from: from, to: to > from ? to : from, expect: clean(s.expect, 80),
      result: '未到', createdAt: now(), createdRound: r };
    let ok = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.actors = d.actors || {};
          const a = findActor(d, who) || (d.actors[who] = { id: who, conditions: [] });
          a.appointments = list(a);
          a.appointments.push(row);
          if (a.appointments.length > cfg.maxPerActor) a.appointments.shift();
          return true;
        }, 'appointment:make');
        ok = true;
      }
    } catch (e) { ok = false; }
    stat.made++;
    return { ok: true, reason: ok ? 'made' : 'made-no-store', id: row.id, window: [row.from, row.to] };
  }
  /** 判结果：到场 / 迟到（宽限内）/ 失约（超过窗口）。 */
  function settle(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || '').trim();
    const atRound = Number.isFinite(s.atRound) ? Number(s.atRound) : round();
    const shown = s.showUp !== false;
    let out = null;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
          Object.keys(m).forEach(function (k) {
            list(m[k]).forEach(function (x) {
              if (!out && x && x.id === id) {
                if (x.result !== '未到') { out = { ok: false, reason: 'already-settled' }; return; }
                if (!shown && atRound > x.to) { x.result = '失约'; }
                else if (!shown) { x.result = '未到'; return; }
                else if (atRound > x.to) { x.result = '失约'; }
                else if (atRound > x.from + cfg.lateGrace) { x.result = '迟到'; }
                else { x.result = '到场'; }
                x.atRound = atRound; x.at = now();
                out = { ok: true, reason: x.result, id: id, result: x.result };
              }
            });
          });
          return true;
        }, 'appointment:settle');
      }
    } catch (e) { out = { ok: false, reason: 'write-failed' }; }
    if (!out) return { ok: false, reason: 'entry-missing' };
    if (out.result === '到场') { stat.kept++; return out; }
    if (out.result === '迟到') { stat.late++; markTrace(id, '迟到'); return out; }
    if (out.result === '失约') { stat.missed++; markTrace(id, '失约'); return out; }
    return out;
  }
  function markTrace(id, what) {
    try {
      if (WA.tracePost && typeof WA.tracePost.post === 'function') {
        WA.tracePost.post({ what: '有人' + what + '了约定（' + id + '）', kind: '缺席', life: 8, source: 'appointment' });
      }
    } catch (e) { /* 留痕失败不伪造 */ }
  }
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who || s.id, 40);
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const a = findActor(d, who);
    if (!a) return { ok: false, reason: 'actor-missing' };
    return { ok: true, id: who, appointments: list(a), open: list(a).filter(function (x) { return x.result === '未到'; }).length };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
    const r = round();
    const lines = [];
    Object.keys(m).forEach(function (k) {
      list(m[k]).forEach(function (x) {
        if (!x || x.result !== '未到') return;
        if (lines.length >= 3) return;
        if (x.from - r > 3) return;
        lines.push('- ' + clean(m[k].name || k, 20) + '与' + x.withWhom + '约在' + x.place
          + '（第 ' + x.from + '–' + x.to + ' 轮）' + (x.expect ? '：' + x.expect : ''));
      });
    });
    return lines.length ? '[还没结的约]\n' + lines.join('\n') : '';
  }
  WA.appointment = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    RESULTS: RESULT.slice(), make: make, settle: settle, view: view, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/appointment.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/appointment 已加载（' + VERSION + '）');
})();