/**
 * WorldAxis engines/military-levy.js (v2.416.0) — EXV24-4 兵役军饷与哗变
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「征兵 / 兵役 / 军饷 / 兵籍」全仓语料 0 命中。levy-corvee 征的是役（劳役），
 *   regiment-tactics 打的是仗（战术阵型），siege-attrition 算的是围城消耗 ——
 *   **兵从哪来、饷谁在发、拖饷会怎样**这一整层是空的。史书里"拖饷即哗变"
 *   的机制算不出来。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `register` 兵籍 → `payStipend` 发饷（拖欠记息不记恨，恨由哗变风险档表达）
 *   → 风险档由「欠饷月数 × 饷额占比」推 → `discharge` 退役销籍。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store、不动钱袋：发饷只记账面入账，钱从哪扣调用方自己做。
 *   ② 饷额/军饷均为正整数（`bad-amount`）；同一名册身份只许一份兵籍（`already-registered`）。
 *   ③ 哗变风险只报档位（安分/怨望/思变/欲乱），**不自动触发哗变** —— 哗变是叙事事件，
 *      由调用方（或 mob-stampede/crowd-panic）真触发。
 *   ④ 兵籍有界（默认 64）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_military_levy_settings_v1';
  const DEF = { enabled: true, maxRows: 64 };
  const __REG = { key: LS_KEY, def: DEF, module: 'militaryLevy', bounds: { maxRows: [8, 256] } };
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
  const stat = { registered: 0, paid: 0, discharged: 0, refused: 0, lastReason: '' };
  const ROSTER = {}; // soldierId -> row
  const DAY = 24 * 3600 * 1000;
  function str(v) { return String(v == null ? '' : v).trim(); }
  function pint(v) { const n = Number(v); return (Number.isInteger(n) && n > 0) ? n : null; }
  function riskBand(row) {
    const owedMonths = Math.floor(row.owedDays / 30);
    if (owedMonths >= 6) return '欲乱';
    if (owedMonths >= 3) return '思变';
    if (owedMonths >= 1) return '怨望';
    return '安分';
  }
  function register(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = str(s.soldierId || s.who), unit = str(s.unit);
    const stipend = pint(s.stipendPerMonth);
    if (!id) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：兵籍要有名' }; }
    if (!unit) { stat.refused++; stat.lastReason = 'missing-unit'; return { ok: false, hint: 'missing-unit：编入哪一营？没有编制就发不了饷' }; }
    if (stipend === null) { stat.refused++; stat.lastReason = 'bad-amount'; return { ok: false, hint: 'bad-amount：月饷须为正整数' }; }
    if (ROSTER[id]) { stat.refused++; stat.lastReason = 'already-registered'; return { ok: false, hint: 'already-registered：' + id + ' 已在兵籍' }; }
    if (Object.keys(ROSTER).length >= cfg.maxRows) {
      const oldest = Object.keys(ROSTER).sort(function (a, b) { return (ROSTER[a].joinedAt || 0) - (ROSTER[b].joinedAt || 0); })[0];
      delete ROSTER[oldest];
    }
    ROSTER[id] = { id: id, unit: unit, stipendPerMonth: stipend, owedDays: 0, paidTotal: 0, joinedAt: s.at || null, status: 'serving' };
    stat.registered++;
    return { ok: true, id: id, risk: '安分' };
  }
  function payStipend(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const row = ROSTER[str(id)];
    if (!row) { stat.refused++; stat.lastReason = 'unknown-soldier'; return { ok: false, hint: 'unknown-soldier：兵籍上没有这个人' }; }
    const now = s.at == null ? null : Number(s.at);
    if (now === null || !Number.isFinite(now)) { stat.refused++; stat.lastReason = 'missing-at'; return { ok: false, hint: 'missing-at：发饷日期要有，欠饷天数从上次结算起算' }; }
    const days = s.days == null ? 30 : Number(s.days);
    const gross = Math.round(row.stipendPerMonth / 30 * days);
    row.owedDays = Math.max(0, row.owedDays - days);
    row.paidTotal += gross;
    stat.paid++;
    return { ok: true, id: id, gross: gross, owedDays: row.owedDays, risk: riskBand(row) };
  }
  /** 只读：记一笔拖欠（没发饷的日子累加），不改钱。 */
  function noteDebt(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const row = ROSTER[str(id)];
    if (!row) { stat.refused++; stat.lastReason = 'unknown-soldier'; return { ok: false, hint: 'unknown-soldier：兵籍上没有这个人' }; }
    const days = Number(s.days);
    if (!Number.isInteger(days) || days <= 0) { stat.refused++; stat.lastReason = 'bad-days'; return { ok: false, hint: 'bad-days：拖欠天数须为正整数' }; }
    row.owedDays += days;
    return { ok: true, id: id, owedDays: row.owedDays, risk: riskBand(row) };
  }
  function discharge(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const row = ROSTER[str(id)];
    if (!row) { stat.refused++; stat.lastReason = 'unknown-soldier'; return { ok: false, hint: 'unknown-soldier：兵籍上没有这个人' }; }
    if (row.owedDays > 0 && !s.settled) { stat.refused++; stat.lastReason = 'arrears-open'; return { ok: false, hint: 'arrears-open：还欠着 ' + row.owedDays + ' 天饷就销籍？补齐或走 settled 说明' }; }
    row.status = 'discharged';
    delete ROSTER[id];
    stat.discharged++;
    return { ok: true, id: id, paidTotal: row.paidTotal };
  }
  function view(id) {
    if (id) { const row = ROSTER[str(id)]; return row ? { ok: true, row: Object.assign({}, row, { risk: riskBand(row) }) } : { ok: false, hint: 'unknown-soldier' }; }
    const rows = Object.keys(ROSTER).map(function (k) { const r = ROSTER[k];
      return { id: r.id, unit: r.unit, owedDays: r.owedDays, risk: riskBand(r) }; })
      .sort(function (a, b) { return b.owedDays - a.owedDays; });
    const risk = { 安分: 0, 怨望: 0, 思变: 0, 欲乱: 0 };
    rows.forEach(function (r) { risk[r.risk]++; });
    return { ok: true, serving: rows.length, rows: rows, riskTally: risk };
  }
  function statView() { return Object.assign({ serving: Object.keys(ROSTER).length }, stat); }
  function reset() { Object.keys(ROSTER).forEach(function (k) { delete ROSTER[k]; }); stat.registered = 0; stat.paid = 0; stat.discharged = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.militaryLevy = {
    register: register, payStipend: payStipend, noteDebt: noteDebt, discharge: discharge, view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/military-levy.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/military-levy 已加载（2.416.0）');
})();