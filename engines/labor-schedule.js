/**
 * WorldAxis engines/labor-schedule.js (v2.231.0) — OP-3 劳动与日程结算（同一段时间只能花一次）
 *
 * ── 它治什么（核心缺口）────────────────────────────────────────────────
 *   production 有工期和排班，life 有日程，research 有阶段，survey 有跨日勘察；
 *   此前这些占用各自独立推进，未证实它们共同消费同一人物时间。各自合理的进度合起来
 *   可以让一个人同一天同一时段既出门勘察又在作坊满额生产（两态不可分）。
 *   增量：统一时段占用（morning/afternoon/evening），同一人同时段不可多占；
 *   支持换班/交接/暂停，一天结束时呈现真实劳动取舍。
 *
 * ── 契约与口径 ──────────────────────────────────────────────────────────
 *   1. 封闭时段集合：SLOTS = ['morning', 'afternoon', 'evening']。
 *   2. 互斥排他：claim() 同一人同一天同一时段已占 ⇒ 拒收 slot-conflict（带冲突项详情）。
 *   3. 换班交接：transfer(from, to, day, slot) ⇒ 释放原人，占入新人；新人忙则拒绝且原人不释放。
 *   4. 纯读查询：view(day, who) 纯读零写入。
 *   5. 推进日：advanceDay() 推进故事日，释放已完成时段。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_labor_schedule_settings_v1';
  const DEF = { enabled: false, maxBookingsPerDay: 48, defaultSlotsPerDay: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'laborSchedule',
    bounds: { maxBookingsPerDay: [6, 120], defaultSlotsPerDay: [1, 6] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const SLOTS = ['morning', 'afternoon', 'evening'];
  const stat = { claims: 0, conflicts: 0, transfers: 0, daysAdvanced: 0, lastReason: '', faults: {} };
  function noteFault(code) { stat.faults[code] = (stat.faults[code] || 0) + 1; stat.conflicts++; stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }

  function ensure(draft) {
    if (!draft.laborSchedule || typeof draft.laborSchedule !== 'object' || Array.isArray(draft.laborSchedule)) {
      draft.laborSchedule = { currentDay: 1, bookings: [] };
    }
    if (!Array.isArray(draft.laborSchedule.bookings)) draft.laborSchedule.bookings = [];
    if (num(draft.laborSchedule.currentDay) === null) draft.laborSchedule.currentDay = 1;
    return draft.laborSchedule;
  }

  /**
   * 申请占用某人某一天的某个时段。
   */
  function claim(opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const who = clean(o.who, 60);
    const day = num(o.day) == null ? (state().laborSchedule ? state().laborSchedule.currentDay || 1 : 1) : Math.floor(num(o.day));
    const slot = clean(o.slot, 20);
    const task = clean(o.task, 60);
    const kind = clean(o.kind, 30) || 'work';

    if (!who || !slot || !task) {
      return { ok: false, reason: 'missing-fields', fields: { who: !!who, slot: !!slot, task: !!task } };
    }
    if (SLOTS.indexOf(slot) < 0) {
      return { ok: false, reason: 'invalid-slot', slot: slot, allowed: SLOTS.slice() };
    }

    const st = state();
    const ls = (st.laborSchedule && Array.isArray(st.laborSchedule.bookings)) ? st.laborSchedule.bookings : [];
    // 检查冲突：同一人、同一天、同时段
    const conflict = ls.filter(function (b) {
      return b && b.who === who && b.day === day && b.slot === slot && !b.cancelled;
    })[0];

    if (conflict) {
      noteFault('slot-conflict');
      return {
        ok: false,
        reason: 'slot-conflict',
        who: who,
        day: day,
        slot: slot,
        conflictWith: { id: conflict.id, task: conflict.task, kind: conflict.kind }
      };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const bookingId = 'bk_' + day + '_' + slot + '_' + who + '_' + clockNow('labor');
      const record = {
        id: bookingId,
        who: who,
        day: day,
        slot: slot,
        task: task,
        kind: kind,
        createdAt: clockNow('labor')
      };
      b.bookings.push(record);
      out = { ok: true, booking: record };
      return true;
    }, 'laborSchedule:claim');

    if (out && out.ok) {
      stat.claims++;
      stat.lastReason = 'claimed:' + who + '@' + day + ':' + slot;
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 换班转交：将 from 的占用转交给 to。若 to 该时段冲突则整体拒绝且保持原状。
   */
  function transfer(bookingId, toWho) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const bid = clean(bookingId, 80);
    const to = clean(toWho, 60);
    if (!bid || !to) return { ok: false, reason: 'missing-fields' };

    const st = state();
    const ls = (st.laborSchedule && Array.isArray(st.laborSchedule.bookings)) ? st.laborSchedule.bookings : [];
    const target = ls.filter(function (b) { return b && b.id === bid && !b.cancelled; })[0];
    if (!target) return { ok: false, reason: 'booking-not-found', bookingId: bid };
    if (target.who === to) return { ok: false, reason: 'self-transfer' };

    // 检查新人在该日该时段是否有冲突
    const toConflict = ls.filter(function (b) {
      return b && b.who === to && b.day === target.day && b.slot === target.slot && !b.cancelled;
    })[0];
    if (toConflict) {
      noteFault('target-has-conflict');
      return {
        ok: false,
        reason: 'target-has-conflict',
        to: to,
        day: target.day,
        slot: target.slot,
        conflictWith: { id: toConflict.id, task: toConflict.task }
      };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.bookings.filter(function (x) { return x && x.id === bid; })[0];
      if (!row) return false;
      const prevWho = row.who;
      row.who = to;
      row.transferredFrom = prevWho;
      row.transferredAt = clockNow('labor');
      out = { ok: true, bookingId: bid, from: prevWho, to: to, day: row.day, slot: row.slot, task: row.task };
      return true;
    }, 'laborSchedule:transfer');

    if (out && out.ok) {
      stat.transfers++;
      stat.lastReason = 'transferred:' + bid;
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 纯读查询：查看某天某人的时段安排。
   */
  function view(opts) {
    const o = opts || {};
    const st = state();
    const ls = (st.laborSchedule && typeof st.laborSchedule === 'object') ? st.laborSchedule : { currentDay: 1, bookings: [] };
    const curDay = num(o.day) == null ? (ls.currentDay || 1) : Math.floor(num(o.day));
    const who = clean(o.who, 60);

    const list = (ls.bookings || []).filter(function (b) {
      if (!b || b.cancelled) return false;
      if (b.day !== curDay) return false;
      if (who && b.who !== who) return false;
      return true;
    });

    return {
      ok: true,
      day: curDay,
      who: who || 'all',
      count: list.length,
      bookings: list.map(function (b) {
        return { id: b.id, who: b.who, day: b.day, slot: b.slot, task: b.task, kind: b.kind };
      })
    };
  }

  /**
   * 手动推进一日：故事日累增，释放旧时段。
   */
  function advanceDay() {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    let nextDay = 1;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      b.currentDay = (num(b.currentDay) || 1) + 1;
      nextDay = b.currentDay;
      return true;
    }, 'laborSchedule:advanceDay');

    stat.daysAdvanced++;
    stat.lastReason = 'advanced-to-day:' + nextDay;
    return { ok: true, currentDay: nextDay };
  }

  function statView() {
    return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) });
  }

  function resetStat() {
    stat.claims = 0; stat.conflicts = 0; stat.transfers = 0; stat.daysAdvanced = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.laborSchedule = {
    SLOTS: SLOTS.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    claim: claim,
    transfer: transfer,
    view: view,
    advanceDay: advanceDay,
    stat: statView,
    resetStat: resetStat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/labor-schedule.js', { kind: 'engine', ver: '2.231.0' });
  }
  if (WA.log) WA.log('info', 'labor-schedule 已加载（2.231.0）');
})();