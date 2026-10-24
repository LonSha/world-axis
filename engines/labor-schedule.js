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

  /**
   * 获取当前全局统一剧情天数（单一真源）。
   */
  function getStoryDay() {
    if (WA.playtime && typeof WA.playtime.story === 'function') {
      try {
        const s = WA.playtime.story();
        if (s && s.ok && num(s.dayIndex) != null && num(s.dayIndex) >= 1) {
          return Math.floor(num(s.dayIndex));
        }
      } catch (e) {}
    }
    const st = state();
    if (st && st.clock && num(st.clock.dayIndex) != null && num(st.clock.dayIndex) >= 1) {
      return Math.floor(num(st.clock.dayIndex));
    }
    if (st && st.laborSchedule && num(st.laborSchedule.currentDay) != null && num(st.laborSchedule.currentDay) >= 1) {
      return Math.floor(num(st.laborSchedule.currentDay));
    }
    return 1;
  }

  function ensure(draft) {
    if (!draft.laborSchedule || typeof draft.laborSchedule !== 'object' || Array.isArray(draft.laborSchedule)) {
      draft.laborSchedule = { currentDay: 1, bookings: [] };
    }
    if (!Array.isArray(draft.laborSchedule.bookings)) draft.laborSchedule.bookings = [];
    const storyDay = (draft.clock && num(draft.clock.dayIndex) != null && num(draft.clock.dayIndex) >= 1)
      ? Math.floor(num(draft.clock.dayIndex))
      : (num(draft.laborSchedule.currentDay) != null ? Math.floor(num(draft.laborSchedule.currentDay)) : 1);
    draft.laborSchedule.currentDay = storyDay;
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
    const day = num(o.day) == null ? getStoryDay() : Math.floor(num(o.day));
    const slot = clean(o.slot, 20);
    const task = clean(o.task, 60);
    const kind = clean(o.kind, 30) || 'work';

    if (!who || !slot || !task) {
      return { ok: false, reason: 'missing-fields', fields: { who: !!who, slot: !!slot, task: !!task } };
    }
    const maxSlots = Math.max(1, Math.min(SLOTS.length, cfg.defaultSlotsPerDay || 3));
    const allowedSlots = SLOTS.slice(0, maxSlots);
    if (allowedSlots.indexOf(slot) < 0) {
      return { ok: false, reason: 'invalid-slot', slot: slot, allowed: allowedSlots };
    }

    const st = state();
    // 检查途中旅行状态（WP-3：旅行中的人物不能被预约本地现场劳动）
    const pRecord = st.people ? (st.people['p_' + who] || st.people[who]) : null;
    if (pRecord) {
      const pStatus = clean(pRecord.status || pRecord.action, 30);
      if (pStatus === 'traveling' || pStatus === 'on_the_road' || pStatus === 'transit') {
        noteFault('person-traveling');
        return { ok: false, reason: 'person-traveling', who: who, status: pStatus, place: pRecord.location || pRecord.place };
      }
    }
    const ls = (st.laborSchedule && Array.isArray(st.laborSchedule.bookings)) ? st.laborSchedule.bookings : [];
    const dayBookings = ls.filter(function (b) { return b && b.day === day && !b.cancelled; });
    if (dayBookings.length >= (cfg.maxBookingsPerDay || 48)) {
      noteFault('daily-bookings-full');
      return { ok: false, reason: 'daily-bookings-full', day: day, max: cfg.maxBookingsPerDay };
    }
    // 检查冲突：同一人、同一天、同时段（若处于 absent 缺席状态，不阻塞他人或自己安排紧急事务，但会提示）
    const conflict = ls.filter(function (b) {
      return b && b.who === who && b.day === day && b.slot === slot && !b.cancelled && !b.absent;
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
    const curDay = num(o.day) == null ? getStoryDay() : Math.floor(num(o.day));
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
        return {
          id: b.id,
          who: b.who,
          day: b.day,
          slot: b.slot,
          task: b.task,
          kind: b.kind,
          absent: !!b.absent,
          absentReason: b.absentReason || '',
          interruptedReason: b.interruptedReason || ''
        };
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
      const cur = (draft.clock && num(draft.clock.dayIndex) != null && num(draft.clock.dayIndex) >= 1)
        ? Math.floor(num(draft.clock.dayIndex))
        : (num(b.currentDay) || 1);
      nextDay = cur + 1;
      b.currentDay = nextDay;
      if (draft.clock && typeof draft.clock === 'object') {
        draft.clock.dayIndex = nextDay;
        draft.clock.label = '第' + nextDay + '日';
        draft.clock.source = 'labor-schedule';
      }
      return true;
    }, 'laborSchedule:advanceDay');

    if (WA.calendar && typeof WA.calendar.setClock === 'function') {
      try {
        WA.calendar.setClock('第' + nextDay + '日', { source: 'labor-schedule', dayIndex: nextDay });
      } catch (e) {}
    }

    stat.daysAdvanced++;
    stat.lastReason = 'advanced-to-day:' + nextDay;
    return { ok: true, currentDay: nextDay, storyDay: nextDay };
  }

  /**
   * OPV4-3：纯只读时间成本与占用冲突预览。
   * 零写入，计算指定任务在未来指定天数内的时间占用、重叠冲突、最早完成日与延期来源。
   */
  function previewSchedule(opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const who = clean(o.who, 60);
    const task = clean(o.task || '任务', 60);
    const startDay = num(o.startDay) == null ? getStoryDay() : Math.floor(num(o.startDay));
    const reqDays = Math.max(1, Math.min(num(o.days) || 1, 30));
    const slot = clean(o.slot, 20) || 'morning';

    const st = state();
    const ls = (st.laborSchedule && Array.isArray(st.laborSchedule.bookings)) ? st.laborSchedule.bookings : [];
    const pRecord = st.people ? (st.people['p_' + who] || st.people[who]) : null;
    let travelDelay = 0;
    if (pRecord) {
      const pStatus = clean(pRecord.status || pRecord.action, 30);
      if (pStatus === 'traveling' || pStatus === 'on_the_road' || pStatus === 'transit') {
        travelDelay = 1;
      }
    }

    const occupiedSlots = [];
    const conflicts = [];
    let scheduledDays = 0;
    let evalDay = startDay + travelDelay;

    while (scheduledDays < reqDays && evalDay <= startDay + reqDays + 14) {
      const dayConf = ls.filter(function (b) {
        return b && b.who === who && b.day === evalDay && b.slot === slot && !b.cancelled;
      })[0];
      if (dayConf) {
        conflicts.push({ day: evalDay, slot: slot, task: dayConf.task, conflictBookingId: dayConf.id });
      } else {
        occupiedSlots.push({ day: evalDay, slot: slot });
        scheduledDays++;
      }
      evalDay++;
    }

    const earliestCompletionDay = (occupiedSlots.length >= reqDays)
      ? occupiedSlots[occupiedSlots.length - 1].day
      : (startDay + reqDays + travelDelay);

    return {
      ok: true,
      preview: true,
      who: who,
      task: task,
      startDay: startDay,
      requiredDays: reqDays,
      occupiedSlots: occupiedSlots,
      conflicts: conflicts,
      hasConflict: conflicts.length > 0,
      earliestCompletionDay: earliestCompletionDay,
      travelDelay: travelDelay,
      note: '时间成本纯读预览，零写入'
    };
  }

  /**
   * OPV4-3：改期（reschedule）。
   * 将既有预约移到新的日期或时段。若目标时段已被占用，则整单拒绝且原预约保持不变。
   */
  function reschedule(bookingId, targetDay, targetSlot) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const bid = clean(bookingId, 80);
    const day = Math.floor(num(targetDay));
    const slot = clean(targetSlot, 20);
    if (!bid || !day || !slot) return { ok: false, reason: 'missing-fields' };

    const st = state();
    const ls = (st.laborSchedule && Array.isArray(st.laborSchedule.bookings)) ? st.laborSchedule.bookings : [];
    const target = ls.filter(function (b) { return b && b.id === bid && !b.cancelled; })[0];
    if (!target) return { ok: false, reason: 'booking-not-found', bookingId: bid };

    // 冲突检查：目标时段是否已被同一人或满员
    const conf = ls.filter(function (b) {
      return b && b.id !== bid && b.who === target.who && b.day === day && b.slot === slot && !b.cancelled;
    })[0];
    if (conf) {
      noteFault('reschedule-conflict');
      return { ok: false, reason: 'reschedule-conflict', targetDay: day, targetSlot: slot, conflictWith: conf.task };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.bookings.filter(function (x) { return x && x.id === bid; })[0];
      if (!row) return false;
      const prevDay = row.day, prevSlot = row.slot;
      row.day = day;
      row.slot = slot;
      row.rescheduledFrom = { day: prevDay, slot: prevSlot };
      row.updatedAt = clockNow('labor');
      out = { ok: true, bookingId: bid, who: row.who, day: day, slot: slot, task: row.task };
      return true;
    }, 'laborSchedule:reschedule');

    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * OPV4-3：取消预约（cancel）。
   * 标记 cancelled=true。明确规定：取消不返还已消耗成本（材料与前序工时保留）。
   */
  function cancel(bookingId, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const bid = clean(bookingId, 80);
    if (!bid) return { ok: false, reason: 'missing-fields', field: 'bookingId' };
    const o = opts || {};
    const reason = clean(o.reason || 'manual-cancel', 60);

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.bookings.filter(function (x) { return x && x.id === bid && !x.cancelled; })[0];
      if (!row) {
        out = { ok: false, reason: 'booking-not-found', bookingId: bid };
        return false;
      }
      row.cancelled = true;
      row.cancelledReason = reason;
      row.cancelledAt = clockNow('labor');
      row.costRefunded = false; // 严守契约：取消不返还已消耗成本
      out = { ok: true, bookingId: bid, cancelled: true, reason: reason, costRefunded: row.costRefunded };
      return true;
    }, 'laborSchedule:cancel');

    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * OPV4-3：拆分预约（split）。
   * 将一个多时段任务拆成两个预约，支持后续按段转交或改期。
   */
  function split(bookingId, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const bid = clean(bookingId, 80);
    const o = opts || {};
    const nextDay = Math.floor(num(o.day));
    const nextSlot = clean(o.slot, 20);
    if (!bid || !nextDay || !nextSlot) return { ok: false, reason: 'missing-fields' };

    const st = state();
    const ls = (st.laborSchedule && Array.isArray(st.laborSchedule.bookings)) ? st.laborSchedule.bookings : [];
    const orig = ls.filter(function (b) { return b && b.id === bid && !b.cancelled; })[0];
    if (!orig) return { ok: false, reason: 'booking-not-found', bookingId: bid };

    // 冲突检查
    const conf = ls.filter(function (b) {
      return b && b.who === orig.who && b.day === nextDay && b.slot === nextSlot && !b.cancelled;
    })[0];
    if (conf) {
      return { ok: false, reason: 'split-target-conflict', day: nextDay, slot: nextSlot, conflictWith: conf.task };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const newId = bid + '_p2';
      const secondPart = {
        id: newId,
        who: orig.who,
        day: nextDay,
        slot: nextSlot,
        task: orig.task + '（续）',
        kind: orig.kind,
        splitFrom: bid,
        createdAt: clockNow('labor')
      };
      b.bookings.push(secondPart);
      out = { ok: true, originalId: bid, newBookingId: newId, day: nextDay, slot: nextSlot };
      return true;
    }, 'laborSchedule:split');

    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * OPV4-3：寻找最早空闲时段（earliestSlot）。
   */
  function earliestSlot(who, opts) {
    const w = clean(who, 60);
    const o = opts || {};
    const startDay = num(o.startDay) == null ? getStoryDay() : Math.floor(num(o.startDay));
    const st = state();
    const ls = (st.laborSchedule && Array.isArray(st.laborSchedule.bookings)) ? st.laborSchedule.bookings : [];
    for (let d = startDay; d <= startDay + 30; d++) {
      for (let si = 0; si < SLOTS.length; si++) {
        const s = SLOTS[si];
        const busy = ls.some(function (b) {
          return b && b.who === w && b.day === d && b.slot === s && !b.cancelled;
        });
        if (!busy) {
          return { ok: true, who: w, day: d, slot: s };
        }
      }
    }
    return { ok: false, reason: 'no-slot-available', horizon: 30 };
  }

  /**
   * OPV4-4：登记日程打断（interrupt）。
   * 当人物因事故、伤病、旅行或邀约无法履约时，支持四种解决方式：
   *   - substitute: 替班（指定 substituteWho，若对方冲突则拒绝且保持原状）；
   *   - postpone: 改期（推迟到 targetDay，若冲突则拒绝）；
   *   - cancel: 放弃/取消（释放该时段，明确 costRefunded: false）；
   *   - absent: 仅登记缺席（保留记录并记入缺勤账）。
   */
  function interrupt(bookingId, solution, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const bid = clean(bookingId, 80);
    const sol = clean(solution, 30); // 'substitute' | 'postpone' | 'cancel' | 'absent'
    const o = opts || {};
    const reason = clean(o.reason || 'world-event', 60);
    const st = state();
    const ls = (st.laborSchedule && Array.isArray(st.laborSchedule.bookings)) ? st.laborSchedule.bookings : [];
    const orig = ls.filter(function (b) { return b && b.id === bid && !b.cancelled; })[0];
    if (!orig) return { ok: false, reason: 'booking-not-found', bookingId: bid };

    if (sol === 'substitute') {
      const sub = clean(o.substituteWho || o.substitute, 60);
      if (!sub) return { ok: false, reason: 'missing-substitute' };
      const trRes = transfer(bid, sub);
      if (!trRes.ok) return trRes;
      let out = null;
      WA.store.transact(function (draft) {
        const b = ensure(draft);
        const row = b.bookings.filter(function (x) { return x && x.id === bid; })[0];
        if (row) {
          row.interruptedReason = reason;
          row.interruptSolution = 'substitute';
        }
        out = Object.assign({}, trRes, { interrupted: true, reason: reason, solution: 'substitute' });
        return true;
      }, 'laborSchedule:interrupt:substitute');
      return out || { ok: false, reason: 'store-unavailable' };
    }

    if (sol === 'postpone') {
      const targetDay = num(o.targetDay) == null ? (orig.day + 1) : Math.floor(num(o.targetDay));
      const targetSlot = clean(o.targetSlot || orig.slot, 20);
      const resRes = reschedule(bid, targetDay, targetSlot);
      if (!resRes.ok) return resRes;
      let out = null;
      WA.store.transact(function (draft) {
        const b = ensure(draft);
        const row = b.bookings.filter(function (x) { return x && x.id === bid; })[0];
        if (row) {
          row.interruptedReason = reason;
          row.interruptSolution = 'postpone';
        }
        out = Object.assign({}, resRes, { interrupted: true, reason: reason, solution: 'postpone' });
        return true;
      }, 'laborSchedule:interrupt:postpone');
      return out || { ok: false, reason: 'store-unavailable' };
    }

    if (sol === 'cancel') {
      const canRes = cancel(bid, { reason: reason });
      if (!canRes.ok) return canRes;
      return Object.assign({}, canRes, { interrupted: true, solution: 'cancel' });
    }

    if (sol === 'absent') {
      let out = null;
      WA.store.transact(function (draft) {
        const b = ensure(draft);
        const row = b.bookings.filter(function (x) { return x && x.id === bid; })[0];
        if (!row) return false;
        row.absent = true;
        row.absentReason = reason;
        row.interruptedReason = reason;
        row.interruptSolution = 'absent';
        out = { ok: true, bookingId: bid, who: row.who, day: row.day, slot: row.slot, task: row.task, absent: true, reason: reason, solution: 'absent' };
        return true;
      }, 'laborSchedule:interrupt:absent');
      return out || { ok: false, reason: 'store-unavailable' };
    }

    return { ok: false, reason: 'invalid-solution', solution: sol };
  }

  /**
   * OPV4-4：打断后恢复履约（resume）。
   * 将处于 absent 或暂缓状态的预约恢复为活跃，重新检查时段冲突。
   */
  function resume(bookingId) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const bid = clean(bookingId, 80);
    const st = state();
    const ls = (st.laborSchedule && Array.isArray(st.laborSchedule.bookings)) ? st.laborSchedule.bookings : [];
    const orig = ls.filter(function (b) { return b && b.id === bid; })[0];
    if (!orig) return { ok: false, reason: 'booking-not-found', bookingId: bid };
    if (!orig.absent && !orig.interruptedReason) {
      return { ok: false, reason: 'not-interrupted', bookingId: bid };
    }
    // 检查时段冲突
    const conf = ls.filter(function (b) {
      return b && b.id !== bid && b.who === orig.who && b.day === orig.day && b.slot === orig.slot && !b.cancelled && !b.absent;
    })[0];
    if (conf) {
      return { ok: false, reason: 'resume-slot-conflict', conflictWith: conf.task };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.bookings.filter(function (x) { return x && x.id === bid; })[0];
      if (!row) return false;
      row.absent = false;
      row.resumedAt = clockNow('labor');
      out = { ok: true, bookingId: bid, who: row.who, day: row.day, slot: row.slot, resumed: true };
      return true;
    }, 'laborSchedule:resume');
    return out || { ok: false, reason: 'store-unavailable' };
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
    // v2.233.0 (OPV4-3)：时间成本与冲突预览 + 协商协议
    previewSchedule: previewSchedule,
    reschedule: reschedule,
    cancel: cancel,
    split: split,
    earliestSlot: earliestSlot,
    // v2.233.0 (OPV4-4)：日程打断接续与替班换岗
    interrupt: interrupt,
    resume: resume,
    stat: statView,
    resetStat: resetStat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/labor-schedule.js', { kind: 'engine', ver: '2.231.0' });
  }
  if (WA.log) WA.log('info', 'labor-schedule 已加载（2.231.0）');
})();