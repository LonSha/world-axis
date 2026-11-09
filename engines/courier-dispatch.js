/**
 * WorldAxis engines/courier-dispatch.js (v2.311.0) — OPV14-4 远方世界离线演化与延迟消息投递真实回流
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   远方推演（farfield/horizon）虽然在计算远方城市或边境阵营的变化，
 *   但消息此前是“瞬间知晓”或“根本不流入当前场景”，存在全知泄露或离线脱节。
 *   缺乏根据真实地理距离、驿站通路状态排队并延迟送达信件的物流信差机制。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `courier.dispatchPending`：
 *   1. 派发远方信使（sendDispatch），根据 distanceKm 计算送达耗时（小时）；
 *   2. 时钟推进后执行 `dispatchPending`，检测已抵达的信件并投递到受众收件箱（inbox）；
 *   3. 将远方世界演化事件揭晓为现实情报，持久化记录在案。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_courier_dispatch_settings_v1';
  const DEF = { enabled: true, maxQueue: 48, defaultSpeedKmPerHour: 20 };
  const __REG = { key: LS_KEY, def: DEF, module: 'courierDispatch' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'courierDispatch:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { sent: 0, delivered: 0, refused: 0, lastReason: '' };

  /**
   * 寄送远方驿信
   */
  function sendDispatch(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const fromRegion = String(s.fromRegion || '').trim();
    const toRecipient = String(s.toRecipient || s.recipient || '').trim();
    const content = String(s.content || '').trim();
    const distanceKm = Number(s.distanceKm) > 0 ? Number(s.distanceKm) : 50;

    if (!fromRegion) {
      stat.refused++; stat.lastReason = 'missing-from-region';
      return { ok: false, reason: 'missing-from-region' };
    }
    if (!toRecipient) {
      stat.refused++; stat.lastReason = 'missing-recipient';
      return { ok: false, reason: 'missing-recipient' };
    }
    if (!content) {
      stat.refused++; stat.lastReason = 'empty-content';
      return { ok: false, reason: 'empty-content' };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('courierDispatch');
    const travelHours = distanceKm / cfg.defaultSpeedKmPerHour;
    const eta = at + Math.round(travelHours * 3600 * 1000);

    const letter = {
      id: 'ltr_' + (at % 100000) + '_' + Math.floor(WA.rand.next('courier-dispatch') * 1000),
      fromRegion: fromRegion,
      toRecipient: toRecipient,
      content: content,
      distanceKm: distanceKm,
      sentAt: at,
      eta: eta,
      status: 'in-transit'
    };

    transact(function (d) {
      if (!d) return true;
      d.courierQueue = d.courierQueue || [];
      d.courierQueue.push(letter);
      if (d.courierQueue.length > cfg.maxQueue) {
        d.courierQueue.shift();
      }
      return true;
    }, 'sendDispatch');

    stat.sent++;
    return { ok: true, reason: 'dispatched', letter: letter };
  }

  /**
   * 刷新检查已抵达的驿信并投递
   */
  function dispatchPending(at) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const now = Number.isFinite(at) ? at : clockNow('courierDispatch');
    const delivered = [];

    transact(function (d) {
      if (!d || !d.courierQueue) return true;
      d.inboxes = d.inboxes || {};
      d.courierQueue.forEach(function (ltr) {
        if (ltr.status === 'in-transit' && now >= ltr.eta) {
          ltr.status = 'delivered';
          ltr.deliveredAt = now;
          d.inboxes[ltr.toRecipient] = d.inboxes[ltr.toRecipient] || [];
          d.inboxes[ltr.toRecipient].push({
            letterId: ltr.id,
            from: ltr.fromRegion,
            content: ltr.content,
            deliveredAt: now
          });
          delivered.push(ltr);
        }
      });
      return true;
    }, 'dispatchPending');

    stat.delivered += delivered.length;
    return {
      ok: true,
      reason: 'pending-dispatched',
      deliveredCount: delivered.length,
      letters: delivered
    };
  }

  WA.courierDispatch = {
    sendDispatch: sendDispatch,
    dispatchPending: dispatchPending
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/courier-dispatch 已加载（2.311.0）');
  }
})();