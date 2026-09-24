/**
 * WorldAxis engines/parallel-events.js (v2.67.0)
 * 场外事件：主线之外同时发生的短事件，三要素 + 主时钟同步 + 容量 3。
 *
 * 缝合来源：梦鲸《梦境平行事件》——「三要素：时间/地点/人物，与主故事时间同步，
 * 防止全知，最多 3 个」。与 engines/parallel-world.js 的分工：那是「另一个世界的
 * 推演」（NPC 档案 + 关系网 + AI 推进），这是「同一世界此刻别处」的**登记与核验**
 * ——只记账不推演，防全知由「不可见期拒收」承担：事件开始时刻晚于当前主时钟读数
 * （尚未发生）整次拒收（future-event）。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 add() 返回 reason:'disabled'。
 *   2 三要素（title/location/persons）缺一整次拒收（missing-fields）。
 *   3 与主时钟同步：startedAt 晚于主时钟读数拒收（future-event）——没发生的事不是
 *     「正在别处发生」。
 *   4 活跃容量 3：登记第 4 个且尚在活跃期时拒收（capacity），须先 resolve 早先事件。
 *   5 人物名单非空数组、地点非空串，人物上限 4（crowd）。
 *   6 显式收束（resolve()）；过期不自动清理——「发生过」是事实。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_pevents_settings_v1';
  const DEF = { enabled: false, maxActive: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'parallelEvents', bounds: { maxActive: [1, 5] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const MAX_PERSONS = 4;
  const stat = { adds: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().parallelEvents; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function activeCount(rows_) { return rows_.filter(function (r) { return r && r.status === 'active'; }).length; }
  /**
   * 登记一场场外事件。三要素 + 开始时刻（默认主时钟现在）。
   */
  function add(title, location, persons, opts) {
    const t = clean(title, 40), loc = clean(location, 40);
    const p = opts || {};
    if (!t || !loc) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    if (!Array.isArray(persons) || !persons.length) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const cast = persons.map(function (x) { return clean(x, 24); }).filter(Boolean);
    if (!cast.length) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (cast.length > MAX_PERSONS) { noteFault('crowd'); return { ok: false, reason: 'crowd', max: MAX_PERSONS }; }
    let out = null;
    WA.store.transact(function (draft) {
      draft.parallelEvents = draft.parallelEvents && typeof draft.parallelEvents === 'object' && !Array.isArray(draft.parallelEvents) ? draft.parallelEvents : { rows: [] };
      draft.parallelEvents.rows = Array.isArray(draft.parallelEvents.rows) ? draft.parallelEvents.rows : [];
      const now = clockNow('parallelEvents');
      const startedAt = (typeof p.startedAt === 'number' && isFinite(p.startedAt) && p.startedAt <= now) ? p.startedAt : now;
      if (typeof p.startedAt === 'number' && isFinite(p.startedAt) && p.startedAt > now) {
        out = { ok: false, reason: 'future-event' }; return false;
      }
      const active = draft.parallelEvents.rows.filter(function (r) { return r && r.status === 'active'; });
      if (active.length >= Math.max(1, settings().maxActive)) { out = { ok: false, reason: 'capacity', active: active.length }; return false; }
      const row = { id: 'pev_' + now + '_' + draft.parallelEvents.rows.length, title: t, location: loc, persons: cast, status: 'active', startedAt: startedAt, endedAt: null };
      draft.parallelEvents.rows.push(row);
      if (WA.evict) WA.evict.array(draft.parallelEvents.rows, 'parallelEvents.rows');
      out = { ok: true, id: row.id };
    }, 'parallelEvents:add');
    if (out && out.ok) { stat.adds++; stat.lastReason = 'added'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 显式收束。未找到如实报 missing。 */
  function resolve(id) {
    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.parallelEvents || !Array.isArray(draft.parallelEvents.rows)) { out = { ok: false, reason: 'missing' }; return false; }
      const hit = draft.parallelEvents.rows.filter(function (r) { return r && r.id === id && r.status === 'active'; })[0];
      if (!hit) { out = { ok: false, reason: 'missing' }; return false; }
      hit.status = 'resolved'; hit.endedAt = clockNow('parallelEvents');
      out = { ok: true, id: id };
    }, 'parallelEvents:resolve');
    if (out && out.ok) stat.lastReason = 'resolved'; else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读活跃面（给注入与推演方的只读视图）。 */
  function active() { return rows().filter(function (r) { return r && r.status === 'active'; }).map(function (r) { return { id: r.id, title: r.title, location: r.location, persons: (r.persons || []).slice(), startedAt: r.startedAt }; }); }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const act = active();
    if (!act.length) return '';
    const lines = act.map(function (r) {
      return '· ' + r.title + '（' + r.location + '；' + (r.persons || []).join('、') + '）—— 主线之外同时进行，主线人物未到场前不知情';
    });
    return '[场外事件]\n' + lines.join('\n') + '\n以上是与主线同时发生的别处事件：人物只能通过合理渠道（传闻/信件/事后撞见）得知，不能全知。\n';
  }
  WA.parallelEvents = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    add: add, resolve: resolve, active: active, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();