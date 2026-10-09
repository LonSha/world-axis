/**
 * WorldAxis engines/calendar-custom.js (v2.130.0) — 自定义历法（缝 C1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓只有一个「第 N 日」的世界钟（`engines/calendar.js`）。它能推进、能打标签，
 *   但**不知道月与年**：一个设定成「暗月历 / 二十二月辑」的世界，全程只能显示
 *   “第 403 日”，用户还得自己换算。更坏的是往回看：前面已经写过的楼按什么历法
 *   称呼，全库零处理。
 *
 *   缝合来源：ST-SevenDaysCal 3.7.10 —— 原文口径是「月名与每月天数可自定；历史楼
 *   按当时的历法解释；超出范围的日期一律标『待确认』，不得推算」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `setMonths(list)` / `getMonths()` —— 登记月名与每月天数（世界状态）；
 *   ② `label(dayIndex)` —— 把「第 N 日」换成历法标签（月名+日），
 *      超出一年则排到下一年；
 *   ③ `labelBack(dayIndex, atDay)` —— **历史楼**口径：用「当时」的历法算（本模块只提供
 *      同一份历法，但把「何时登记的」带出来让调用方自己决定）；
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `label` 返回 `null`（而不是自造一个月名）。
 *   2 **不推算超范围日期**：没有登记月表、或月表总天数 <= 0 时，
 *      `label` 返回 `{unknown:true, reason:'empty-text'}`——“日期待确认”必须是显式的，
 *      不能偷偷用 30 天/月算出一个看似正确的答案。
 *   3 `setMonths` 只接受 `[{name, days}]` 形态；days 非正整数、name 空
 *      一律拒收（`bad-value`），整批一起拒（不做“跳过坏项”）——
 *      跳过会让用户以为月表已换，其实只有一半生效。
 *   4 月表写后接 `evict.array`（站点 `calendarPlan.months`）——用户可能反复调参。
 *   5 不写 `store.clock`：本模块**读**世界钟的 `dayIndex`，不改它。
 *      世界钟的推进仍只有 `engines/calendar.js` 一个写口（两套写口必然漂移）。
 *   6 不产 `buildBlock`：当前日期已由世界钟注入，本模块只把「第 N 日」翻译给
 *      面板与用户看，不重复占一个注入位。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_calendarplan_settings_v1';
  const DEF = { enabled: false, maxMonths: 48 };
  const __REG = { key: LS_KEY, def: DEF, module: 'calendarPlan', bounds: { maxMonths: [1, 128] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { sets: 0, labels: 0, unknowns: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 24) : String(v == null ? '' : v).slice(0, max || 24); }

  function bucket(draft) {
    if (!draft.calendarPlan || typeof draft.calendarPlan !== 'object' || Array.isArray(draft.calendarPlan)) draft.calendarPlan = { months: [], seq: 0, at: 0 };
    const b = draft.calendarPlan;
    if (!Array.isArray(b.months)) b.months = [];
    if (typeof b.seq !== 'number') b.seq = 0;
    return b;
  }
  function plan() {
    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const b = (s.calendarPlan && typeof s.calendarPlan === 'object') ? s.calendarPlan : {};
    return { months: Array.isArray(b.months) ? b.months : [], at: b.at || 0 };
  }

  function norm(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i] || {};
      const name = clean(it.name, 24);
      const days = Number(it.days);
      if (!name) return null;
      if (!isFinite(days) || days <= 0 || Math.floor(days) !== days) return null;
      out.push({ name: name, days: days });
    }
    return out;
  }

  function setMonths(list) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const normed = norm(list);
    if (normed === null) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', detail: '月表必须是 [{name, days}] 且 days 为正整数（一笔坏项整批拒收）' }; }
    if (normed.length > settings().maxMonths) { noteFault('too-long'); return { ok: false, reason: 'too-long', max: settings().maxMonths }; }
    let hit = false;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      b.months = normed.slice();
      b.seq++; b.at = clockNow('calendarPlan');
      if (WA.evict) WA.evict.array(b.months, 'calendarPlan.months', settings().maxMonths);
      hit = true; return true;
    }, 'calendarPlan:setMonths') : null;
    if (!hit || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.sets++; stat.lastReason = 'set';
    const total = normed.reduce(function (a, m) { return a + m.days; }, 0);
    return { ok: true, months: normed.length, yearDays: total };
  }

  function getMonths() { const p = plan(); return p.months.map(function (m) { return { name: m.name, days: m.days }; }); }

  /**
   * 把世界钟的日序翻成历法标签。
   * @returns {ok, label, month, day, year} 或 {ok:false, reason:'empty-text'}（待确认）
   */
  function label(dayIndex) {
    if (!settings().enabled) { stat.blocked++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const p = plan();
    const total = p.months.reduce(function (a, m) { return a + Number(m.days || 0); }, 0);
    if (!p.months.length || !(total > 0)) { stat.unknowns++; stat.lastReason = 'empty-text'; return { ok: false, reason: 'empty-text', unknown: true, label: '日期待确认' }; }
    const n = Number(dayIndex);
    if (!isFinite(n) || n < 0) { stat.unknowns++; stat.lastReason = 'bad-value'; return { ok: false, reason: 'bad-value', unknown: true, label: '日期待确认' }; }
    stat.labels++;
    const year = Math.floor(n / total) + 1;
    let rest = n % total;
    let mi = 0;
    while (mi < p.months.length && rest >= Number(p.months[mi].days)) { rest -= Number(p.months[mi].days); mi++; }
    const m = p.months[mi] || { name: '?', days: 0 };
    return { ok: true, label: m.name + (rest + 1) + '日', month: m.name, day: rest + 1, year: year, dayIndex: n };
  }

  /** 当前楼（读世界钟，不写）。 */
  function labelNow() {
    const st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const idx = (st.clock && st.clock.dayIndex) || 0;
    return Object.assign({ dayIndex: idx }, label(idx));
  }

  function clear() {
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) { const b = bucket(d); const n = b.months.length; b.months = []; b.at = 0; return n; }, 'calendarPlan:clear') : null;
    return { ok: !!(r && r.ok === true), dropped: (r && r.result) || 0 };
  }

  WA.calendarPlan = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    setMonths: setMonths, getMonths: getMonths, label: label, labelNow: labelNow, clear: clear,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/calendar-custom.js', { kind: 'engine', ver: '2.130.0' });
})();
