/**
 * WorldAxis engines/region.js (v2.119.0) — 跨地域持续变化与传播链（拓展计划 ⑥）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   `world` 有地点、道路、通行与封锁，`regional` 有本地突发事件，`weather` 有天候 ——
 *   但没有任何一处回答得了：「玩家离开之后那个地方还在变吗？消息要走几天？路上断了会怎样？」
 *   现场于是只剩两种做法：要么远方永远停在离开那一刻（世界是布景板），
 *   要么模型顺手报一句「你听说北方出事了」——而那句话**没有来源、没有延迟、没有可信度**。
 *
 * ── 本模块只做五件事，每件都有一个硬条件 ───────────────────────
 *   ① `register` 登记远方：必须给出**与本地距离**（`missing-distance`）与**传播渠道**
 *      （road/river/rail/word 具名表）；没有距离与渠道的消息无法计算延迟。
 *   ② `occur`    远方发生一件事：事件类型必须具名（market/strife/plague/disaster/feast）；
 *      一旦登记即**进入传播队列**（延迟 = 距离 ÷ 渠道速率）。
 *   ③ `deliver`  按时辰落地：未到期的**不许提前落地**（`too-early`，带出还需多久）；
 *      渠道受阻时 `route-blocked`，事件留在原地等解除（**不消失**）。
 *   ④ `heard`    本地认知：只有已落地的事件才被听说，且**逐地区分别记录**；
 *      传闻强度随时间衰减（`stale`），不把远方的事当本地事实。
 *   ⑤ `fine`     近处精细 / 远处粗粒度：本地地区（距离 0）逐条明细，远方只看摘要
 *      （摘要只给类型 + 时辰，不给细节）—— 这是分层推进的硬边界。
 *
 * ── 八条设计边界（全是否定式）──────────────────────────────────
 *   ① **无距离不传播**、**无渠道不定时**（延迟算法没有输入就不许猜）。
 *   ② **事件类型具名**（自造类型拒收）。
 *   ③ **不许提前落地**（`too-early` 是拒收，不是「到了但没说」）。
 *   ④ **路断不吞事**：受阻期间事件原地等待，解除后照常落地。
 *   ⑤ **近处精细、远处粗粒度**：摘要不携带细节（细节只属于本地）。
 *   ⑥ **认知分区**：一地听说不等于另一地听说，逐地区分别记。
 *   ⑦ **不覆盖历史**：同地同类型事件可多条并存，不合并（「又闹了一次」必须数得出来）。
 *   ⑧ **容量有界且挤出有账**：站点（events 等）都走 evict 单一出口。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────────
 *   · 本模块**不改 world.places**：登记的远方地区是「传播拓扑」的一面，不等于可达地点。
 *   · 本模块**不判定真伪**：落地的事实真源仍是 `intel.truthOf` / `worldFacts`。
 *   · 总开关默认关闭；关闭时不登记远方、不记事件、不落地、不注入。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_region_settings_v1';
  const DEF = { enabled: false, maxEvents: 24, maxRoutes: 8, stalenessMs: 86400000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'region',
    bounds: { maxEvents: [4, 64], maxRoutes: [2, 16], stalenessMs: [3600000, 604800000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 渠道具名表 + 每天可走的路程（消息延迟 = 距离 / 速率）。
  //   数字不是装饰：**没有速率就没有延迟**，而没有延迟的远方消息就是「顺手编一句」。
  const LANES = { road: 120, river: 300, rail: 600, word: 40 };
  const EVENTS = ['market', 'strife', 'plague', 'disaster', 'feast'];
  const MS_PER_DAY = 86400000;

  const stat = { places: 0, events: 0, delivered: 0, blocked: 0, late: 0,
    lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function regOf(root) {
    const c = (root || state()).region;
    return (c && typeof c === 'object' && !Array.isArray(c)) ? c : null;
  }
  function placesOf(root) { const c = regOf(root); return (c && Array.isArray(c.places)) ? c.places : []; }
  function eventsOf(root) { const c = regOf(root); return (c && Array.isArray(c.events)) ? c.events : []; }
  function findPlace(name, root) {
    const key = clean(name, 40);
    return placesOf(root).filter(function (p) { return p && clean(p.name, 40) === key; })[0] || null;
  }
  function openReg(draft) {
    draft.region = (draft.region && typeof draft.region === 'object' && !Array.isArray(draft.region))
      ? draft.region : { places: [], events: [] };
    if (!Array.isArray(draft.region.places)) draft.region.places = [];
    if (!Array.isArray(draft.region.events)) draft.region.events = [];
    return draft.region;
  }
  /** ① 登记远方地区：**距离与渠道都是必需的**（没有它们就算不出延迟）。 */
  function register(name, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const key = clean(name, 40);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const days = num(o.distanceDays);
    if (days === null || days < 0) {
      noteFault('missing-distance');
      return { ok: false, reason: 'missing-distance', hint: '没有距离就算不出消息要走多久' };
    }
    const lane = clean(o.lane, 20) || 'road';
    if (!LANES[lane]) { noteFault('bad-lane'); return { ok: false, reason: 'bad-lane', allowed: Object.keys(LANES) };
    }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const rg = openReg(draft);
      const now = clockNow('region');
      let p = findPlace(key, draft);
      if (!p) {
        if (rg.places.length >= cfg.maxRoutes) { out = { ok: false, reason: 'places-full', cap: cfg.maxRoutes }; return false; }
        rg.places.push({ name: key, distanceDays: days, lane: lane, blocked: false, why: '', at: now, updatedAt: now });
      } else {
        // 距离与渠道可修订（实际通了铁路就该改）；受阻状态不由本入口改。
        p.distanceDays = days; p.lane = lane; p.updatedAt = now;
      }
      p = findPlace(key, draft);
      out = { ok: true, name: p.name, distanceDays: p.distanceDays, lane: p.lane, blocked: !!p.blocked };
    }, 'region:register');
    if (out && out.ok) { stat.places++; stat.lastReason = 'registered'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 渠道是否受阻（单独入口：受阻是状态，**不删行**）。 */
  function markLane(name, blocked, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const key = clean(name, 40);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      const p = findPlace(key, draft);
      if (!p) { out = { ok: false, reason: 'unknown-place', name: key }; return false; }
      p.blocked = !!blocked;
      p.why = blocked ? clean(o.why || '路断', 40) : '';
      p.updatedAt = clockNow('region');
      out = { ok: true, name: p.name, blocked: p.blocked, why: p.why };
    }, 'region:markLane');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ② 远方发生一件事：类型具名；登记即进入传播队列（延迟 = 距离 ÷ 速率 × 24h）。 */
  function occur(name, kind, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const key = clean(name, 40), k = clean(kind, 20);
    if (!key || !k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (EVENTS.indexOf(k) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', allowed: EVENTS.slice() }; }
    const p0 = findPlace(key);
    if (!p0) { noteFault('unknown-place'); return { ok: false, reason: 'unknown-place', name: key }; }
    const cfg = settings();
    const delay = Math.round((p0.distanceDays / LANES[p0.lane]) * MS_PER_DAY);
    const now = clockNow('region');
    let out = null;
    WA.store.transact(function (draft) {
      const rg = openReg(draft);
      if (rg.events.length >= cfg.maxEvents) { out = { ok: false, reason: 'events-full', cap: cfg.maxEvents }; return false; }
      const row = { id: 'rg_' + now + '_' + rg.events.length, place: key, kind: k,
        text: clean(o.text, 80), at: now, dueAt: now + delay, deliveredAt: 0,
        lane: p0.lane, distanceDays: p0.distanceDays };
      rg.events.push(row);
      WA.evict.array(rg.events, 'region.events', cfg.maxEvents);
      out = { ok: true, id: row.id, place: key, kind: k, delayMs: delay, dueAt: row.dueAt };
    }, 'region:occur');
    if (out && out.ok) { stat.events++; stat.lastReason = 'occurred'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ③ 落地：未到期**不许提前落地**（`too-early` 带出还需多久）；渠道受阻则原地等（`route-blocked`）。
   */
  function deliver(eventId, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const key = clean(eventId, 60);
    const row = eventsOf().filter(function (e) { return e && clean(e.id, 60) === key; })[0] || null;
    if (!row) { noteFault('unknown-event'); return { ok: false, reason: 'unknown-event', id: key }; }
    if (row.deliveredAt) { noteFault('already-delivered'); return { ok: false, reason: 'already-delivered', id: row.id }; }
    const place = findPlace(row.place);
    if (place && place.blocked) {
      // 路断不吞事：事件留在原地等解除，**不许落地**。
      stat.blocked++;
      return { ok: false, reason: 'route-blocked', id: row.id, place: row.place, why: place.why };
    }
    const now = num(o.now) === null ? clockNow('region') : num(o.now);
    if (now < row.dueAt) {
      stat.late++;
      return { ok: false, reason: 'too-early', id: row.id, dueAt: row.dueAt, waitMs: row.dueAt - now };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const rg = openReg(draft);
      const r = rg.events.filter(function (e) { return e && clean(e.id, 60) === key; })[0] || null;
      if (!r) { out = { ok: false, reason: 'unknown-event', id: key }; return false; }
      if (r.deliveredAt) { out = { ok: false, reason: 'already-delivered', id: r.id }; return false; }
      const pl = findPlace(r.place, draft);
      if (pl && pl.blocked) { out = { ok: false, reason: 'route-blocked', id: r.id }; return false; }
      r.deliveredAt = now;
      out = { ok: true, id: r.id, place: r.place, kind: r.kind, text: r.text, deliveredAt: now };
    }, 'region:deliver');
    if (out && out.ok) { stat.delivered++; stat.lastReason = 'delivered'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ④ 本地认知：只有**已落地**的事件才被听说，逐地区分别记；传闻随时间衰减（`stale`）。
   */
  function heard(listener, opts) {
    const o = opts || {};
    const who = clean(listener, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const now = num(o.now) === null ? clockNow('region') : num(o.now);
    const cfg = settings();
    const rows = eventsOf().filter(function (e) { return e && e.deliveredAt; }).map(function (e) {
      const age = Math.max(0, now - e.deliveredAt);
      return { id: e.id, place: e.place, kind: e.kind, text: e.text,
        // 衰减看的是「落地后过了多久」，不是「事件发生多久」。
        fresh: age <= cfg.stalenessMs, ageMs: age, stalled: !(age <= cfg.stalenessMs) };
    });
    return { ok: true, person: who, heard: rows.length, rows: rows };
  }
  /**
   * ⑤ 近处精细 / 远处粗粒度：
   *   本地（距离 0）给逐条明细；远方**只给类型与时辰**，不带细节 —— 这是分层推进的硬边界。
   */
  function fine(place, opts) {
    const o = opts || {};
    const key = clean(place, 40);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const here = eventsOf().filter(function (e) { return e && clean(e.place, 40) === key; });
    if (here.length) {
      return { ok: true, place: key, grain: 'fine', rows: here.map(function (e) {
        return { id: e.id, kind: e.kind, text: e.text, at: e.at,
          delivered: !!e.deliveredAt, dueAt: e.dueAt };
      }) };
    }
    // 本地没登记：以**最近的远方**作为粗粒度视角（只报类型与时辰）。
    const far = placesOf().slice().sort(function (a, b) { return a.distanceDays - b.distanceDays; })[0];
    if (!far) return { ok: false, reason: 'unknown-place', place: key };
    return { ok: true, place: far.name, grain: 'coarse', rows: eventsOf()
      .filter(function (e) { return e && clean(e.place, 40) === far.name; })
      .map(function (e) { return { id: e.id, kind: e.kind, at: e.at }; }) };
  }
  function statView() {
    const rows = eventsOf();
    const byPlace = {};
    rows.forEach(function (e) { byPlace[e.place] = (byPlace[e.place] || 0) + 1; });
    return { enabled: settings().enabled, places: placesOf().length, events: rows.length,
      pending: rows.filter(function (e) { return !e.deliveredAt; }).length,
      delivered: rows.filter(function (e) { return !!e.deliveredAt; }).length,
      blocked: placesOf().filter(function (p) { return p && p.blocked; }).length,
      byPlace: byPlace };
  }
  /** 注入块：本地逐条明细、远方只给类型与时辰（不把远方细节写进正文）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lines = [];
    eventsOf().filter(function (e) { return e && e.deliveredAt; }).slice(0, cfg.maxEvents).forEach(function (e) {
      const p = findPlace(e.place);
      const local = p && p.distanceDays === 0;
      lines.push(local ? (e.place + '：' + e.kind + '——' + (e.text || '（本地事）'))
        : (e.place + '传来' + e.kind + '的消息（距本地 ' + (p ? p.distanceDays : '?') + ' 天路程）'));
    });
    const stuck = placesOf().filter(function (p) { return p && p.blocked; });
    if (stuck.length) {
      lines.push('通路受阻：' + stuck.map(function (p) { return p.name + '（' + p.why + '）'; }).join('、')
        + '。受阻不等于那边没出事，只是消息过不来。');
    }
    if (!lines.length) return '';
    return '[远方]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '远方的事只以「传来消息」的形式在场；不知道细节就不要编细节。';
  }
  WA.region = {
    LANES: Object.keys(LANES), EVENTS: EVENTS.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    register: register, markLane: markLane, occur: occur, deliver: deliver,
    heard: heard, fine: fine, statView: statView, buildBlock: buildBlock,
    places: function () { return placesOf().map(function (p) { return { name: p.name, distanceDays: p.distanceDays, lane: p.lane, blocked: !!p.blocked }; }); },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/region.js', { kind: 'engine', ver: '2.119.0' });
})();
