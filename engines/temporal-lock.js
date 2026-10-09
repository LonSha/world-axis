/**
 * WorldAxis engines/temporal-lock.js (v2.67.0)
 * 时间锁：锁定期间每轮推进上限被显式登记，超限与跳跃整轮拒收。
 *
 * 缝合来源：《✵ 时间锁死 [373]》（TEMPORAL_LOCK：No skips. No summaries of hours.
 * Every response must cover no more than a few minutes of objective time.）——
 * 原文是给模型的一句话要求；能落成引擎判据的是「锁定态必须显式登记」与
 * 「推进跨度可核验」，取舍口径见 R49。
 *
 * 与 core/clock.js 的分工：clock 管「现在几点」（墙钟/冻结/推进），本模块管
 * 「叙事推进的跨度是否被允许」——锁定期内 jump > 上限、缺跨度，都拒。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 check() 返回 reason:'disabled'，不猜跨度。
 *   2 锁定必须显式登记（lock()），未锁定时 advance 不设限（reason:'unlocked'）。
 *   3 锁定期内缺跨度字段整轮拒收（missing-fields）——「这段过了多久」没说就是没说。
 *   4 超过 maxMinutes 上限整轮拒收（too-long），绝不静默放行或截断。
 *   5 倒退（span < 0）与零跨度分开报（negative-span / frozen），语义不同不合流。
 *   6 解锁必须显式（unlock()）；锁定态落盘，重载后仍是锁定的（不靠内存）。
 *   7 未锁定 = 空对象（不是 null）：registryParity 对 kind:'object' 的站点不认 null，
 *     骨架物化纪律（v2.66.0 R49 教训）在单行对象站点同样生效。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_temporal_settings_v1';
  const DEF = { enabled: false, maxMinutes: 10 };
  const __REG = { key: LS_KEY, def: DEF, module: 'temporalLock', bounds: { maxMinutes: [1, 240] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { checks: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  /** 未锁定 = 空对象（registryParity 对 kind:'object' 不认 null）。 */
  function lockRow() {
    const m = state().temporal;
    if (!m || !m.lock || typeof m.lock !== 'object' || Array.isArray(m.lock)) return null;
    return m.lock.label ? m.lock : null;
  }

  /**
   * 登记锁定态。label 是给读面的一个可辨认名（如「对峙第三分钟」）。
   */
  function lock(label) {
    // v2.79.0（第十三面续 · 输入边界）：标签必须真的是字符串。
    //   此前 `String(label)` 把 NaN 变成 'NaN'、把对象变成 '[object Object]' —— 上锁
    //   成功，读面上是一把名字荒唐的锁，而调用方拿到的 ok=true 让它无从察觉。
    if (typeof label !== 'string') { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const who = String(label == null ? '' : label).replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      draft.temporal = draft.temporal && typeof draft.temporal === 'object' && !Array.isArray(draft.temporal) ? draft.temporal : { lock: {} };
      if (!draft.temporal.lock || typeof draft.temporal.lock !== 'object' || Array.isArray(draft.temporal.lock)) draft.temporal.lock = {};
      draft.temporal.lock = { label: who, at: clockNow('temporal') };
      if (WA.evict) WA.evict.object(draft.temporal.lock, 'temporal.lock', ['label', 'at']);
      out = { ok: true, label: who };
    }, 'temporal:lock');
    if (out && out.ok) stat.lastReason = 'locked'; else noteFault('store-unavailable');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 显式解锁：锁定态清成空对象（不是 null——registryParity 对 kind:'object' 不认 null）。 */
  function unlock() {
    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.temporal || !draft.temporal.lock || !draft.temporal.lock.label) { out = { ok: false, reason: 'missing' }; return false; }
      draft.temporal.lock = {};
      if (WA.evict) WA.evict.object(draft.temporal.lock, 'temporal.lock', ['label', 'at']);
      out = { ok: true };
    }, 'temporal:unlock');
    if (out && out.ok) stat.lastReason = 'unlocked'; else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 核验一轮叙事推进的跨度。spanMinutes：本轮客观时间推进了多少分钟。
   * 锁定期内：缺字段拒、超限拒、倒退拒；未锁定时不设限。
   */
  function check(spanMinutes) {
    stat.checks++;
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    const lock = lockRow();
    if (!lock) return { ok: true, reason: 'unlocked' };
    if (spanMinutes == null) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (typeof spanMinutes !== 'number' || !isFinite(spanMinutes)) { noteFault('bad-span'); return { ok: false, reason: 'bad-span' }; }
    if (spanMinutes < 0) { noteFault('negative-span'); return { ok: false, reason: 'negative-span' }; }
    if (spanMinutes === 0) return { ok: true, reason: 'frozen', label: lock.label };
    if (spanMinutes > settings().maxMinutes) { noteFault('too-long'); return { ok: false, reason: 'too-long', limit: settings().maxMinutes, got: spanMinutes }; }
    return { ok: true, reason: 'within-lock', label: lock.label };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lock = lockRow();
    if (!lock) return '';
    return '[时间锁]\n当前锁定：' + lock.label + '（单轮推进上限 ' + cfg.maxMinutes + ' 分钟；禁止跳跃与省略号式带过）\n锁定不是静止：沉默与 minutiae（细枝末节）照常结算，只是不许快进。\n';
  }
  WA.temporalLock = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    lock: lock, unlock: unlock, check: check, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
