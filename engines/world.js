/**
 * WorldAxis engines/world.js (v2.65.0)
 * 世界织体：社会生活（共同日程 / 聚散）与时空约束（地点、路途、「同一时刻只能在一处」）。
 *
 * 为什么单独成模块，而不并进 life.js / calendar.js：
 *   life.js 管的是**一个人的**目标、承诺与日程（个体动机面）；
 *   calendar.js 管的是**世界钟怎么走**（时间标尺面）；
 *   本模块管的是**人之间的时空关系**——谁和谁在同一个地方、从这里到那里要多久、
 *   这一场集市点到场的人到底能不能到。「生活」与「共同生活」是两件事：
 *   把它们并起来，最直接的后果是「有人有事要做」与「有人真的到了场」在状态里长得一样。
 *
 * 设计边界（**全是否定式**——这五条正是本模块存在的全部理由）：
 *   1 总开关默认关闭。关闭时不推演、不注入、不改变任何人的位置。
 *   2 地点必须**先被登记**：没登记的地点不是「大概就在附近」，而是**不可达**（不得猜）。
 *      「随手编一个近处」是本仓库最贵的一类默认值——世界会因为一句话长出一条不存在的街。
 *   3 路途必须有据：两地之间没有登记的道路，就是**走不过去**（不得按直线距离编一条路）。
 *   4 同一人物在同一时刻只能出现在一处：冲突必须**被拒绝并归因**，不得静默覆盖先前安排。
 *      「后来的悄悄赢过先前的」会让用户永远不知道自己的安排被改掉了。
 *   5 共同日程不得被读成「所有人都在场」：在场者只来自**证据**（人物自己的日程安排），
 *      不得由「办了一场集市」推出「全城人都到了」。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_world_settings_v1';
  const DEF = { enabled: false, maxPlaces: 8, maxEvents: 4, maxItems: 3, maxJourneys: 4 };
  const __REG = { key: LS_KEY, def: DEF, module: 'world',
    bounds: { maxPlaces: [1, 24], maxEvents: [1, 12], maxItems: [1, 6] } };
  const PLACE_KINDS = ['home', 'work', 'market', 'public', 'wild', 'sacred'];
  const EVENT_KINDS = ['market', 'festival', 'court', 'rite', 'meeting'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { places: 0, roads: 0, events: 0, moves: 0, checks: 0, blocked: 0, lastReason: '', faults: {},
    departed: 0, arrived: 0, advanced: 0 };

  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function node() { const w = state().world; return (w && typeof w === 'object' && !Array.isArray(w)) ? w : {}; }
  function places() { return Array.isArray(node().places) ? node().places : []; }
  function roads() { return Array.isArray(node().roads) ? node().roads : []; }
  function events() { return Array.isArray(node().events) ? node().events : []; }
  function journeys() { return Array.isArray(node().journeys) ? node().journeys : []; }
  function placeByName(nm) { const k = clean(nm, 40); return places().filter(function (x) { return x && x.name === k; })[0] || null; }
  function personLife(name) {
    const p = (state().people || {})['p_' + clean(name, 60)];
    const life = p && p.life;
    return (life && typeof life === 'object' && !Array.isArray(life)) ? life : null;
  }

  /** 登记地点。同名不重复登记（返回既有行），非法类型拒收。 */
  function addPlace(item) {
    const name = clean(item && item.name, 40);
    if (!name) return { ok: false, reason: 'missing-name' };
    const kind = clean(item && item.kind, 12);
    if (kind && PLACE_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kinds: PLACE_KINDS.slice() };
    let out = null;
    WA.store.transact(function (draft) {
      draft.world = draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world) ? draft.world : {};
      draft.world.places = Array.isArray(draft.world.places) ? draft.world.places : [];
      const hit = draft.world.places.filter(function (x) { return x && x.name === name; })[0];
      if (hit) { out = { ok: true, id: hit.id, name: name, existed: true }; return; }
      const row = { id: 'pl_' + name, name: name, kind: kind || 'public',
        open: isFinite(Number(item && item.open)) ? Number(item.open) : 0,
        close: isFinite(Number(item && item.close)) ? Number(item.close) : 0,
        at: clockNow('world') };
      draft.world.places.push(row);
      // 剪枝走挤出侧单一出口（站点 world.places 已登记）——不自行 slice。
      WA.evict.array(draft.world.places, 'world.places');
      out = { ok: true, id: row.id, name: name, existed: false };
    }, 'world:add-place');
    if (out && out.ok) { if (!out.existed) stat.places++; stat.lastReason = out.existed ? 'existed' : 'placed'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 登记道路（无向）。两端都必须是已登记地点；分钟数必须为正。 */
  function addRoad(a, b, minutes) {
    const x = clean(a, 40), y = clean(b, 40), mins = Number(minutes);
    if (!x || !y) return { ok: false, reason: 'missing-fields' };
    if (x === y) return { ok: false, reason: 'self-road' };
    if (!isFinite(mins) || mins <= 0) return { ok: false, reason: 'bad-minutes' };
    if (!placeByName(x) || !placeByName(y)) return { ok: false, reason: 'unknown-place' };
    let out = null;
    WA.store.transact(function (draft) {
      draft.world = draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world) ? draft.world : {};
      draft.world.roads = Array.isArray(draft.world.roads) ? draft.world.roads : [];
      const same = function (r, p, q) { return r && ((r.a === p && r.b === q) || (r.a === q && r.b === p)); };
      const hit = draft.world.roads.filter(function (r) { return same(r, x, y); })[0];
      if (hit) { hit.minutes = Math.round(mins); out = { ok: true, id: hit.id, existed: true, minutes: hit.minutes }; return; }
      const row = { id: 'rd_' + x + '_' + y, a: x, b: y, minutes: Math.round(mins), at: clockNow('world') };
      draft.world.roads.push(row);
      WA.evict.array(draft.world.roads, 'world.roads');
      out = { ok: true, id: row.id, existed: false, minutes: row.minutes };
    }, 'world:add-road');
    if (out && out.ok) { if (!out.existed) stat.roads++; stat.lastReason = 'road'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 可达性：按「登记的道路」求最短耗时路径（Dijkstra 的朴素版，图很小）。
   * **没有路径就是走不过去**——不按坐标/直线距离兜底（本仓库最贵的一类默认值）。
   */
  function reach(from, to) {
    const s = clean(from, 40), t = clean(to, 40);
    if (!s || !t) return { ok: false, reason: 'missing-fields' };
    if (!placeByName(s) || !placeByName(t)) return { ok: false, reason: 'unknown-place' };
    if (s === t) return { ok: true, reachable: true, minutes: 0, hops: 0, path: [s] };
    const rs = roads();
    const dist = {}, prev = {}, seen = {};
    dist[s] = 0;
    for (;;) {
      let cur = null, best = Infinity;
      Object.keys(dist).forEach(function (k) { if (!seen[k] && dist[k] < best) { best = dist[k]; cur = k; } });
      if (cur === null) break;
      seen[cur] = true;
      rs.forEach(function (r) {
        if (!r || !isFinite(r.minutes) || r.minutes <= 0) return;
        const other = r.a === cur ? r.b : (r.b === cur ? r.a : null);
        if (!other) return;
        const nd = dist[cur] + r.minutes;
        if (!(other in dist) || nd < dist[other]) { dist[other] = nd; prev[other] = cur; }
      });
    }
    if (!(t in dist)) return { ok: true, reachable: false, minutes: null, hops: null, path: [] };
    const path = [];
    for (let k = t; k; k = prev[k]) { path.unshift(k); if (k === s) break; }
    return { ok: true, reachable: true, minutes: dist[t], hops: path.length - 1, path: path };
  }

  /** 登记共同日程（集市/节庆/庭审/仪式/聚会）。地点必须已登记；时段必须为正。 */
  function addEvent(item) {
    const title = clean(item && item.title, 40), place = clean(item && item.place, 40);
    const start = Number(item && item.start), end = Number(item && item.end);
    if (!title || !place) return { ok: false, reason: 'missing-fields' };
    if (!isFinite(start) || !isFinite(end) || end <= start) return { ok: false, reason: 'bad-time' };
    const kind = clean(item && item.kind, 20);
    if (kind && EVENT_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kinds: EVENT_KINDS.slice() };
    if (!placeByName(place)) return { ok: false, reason: 'unknown-place' };
    let out = null;
    WA.store.transact(function (draft) {
      draft.world = draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world) ? draft.world : {};
      draft.world.events = Array.isArray(draft.world.events) ? draft.world.events : [];
      const row = { id: 'ev_' + clockNow('world') + '_' + draft.world.events.length,
        title: title, place: place, kind: kind || 'meeting',
        start: start, end: end, status: 'planned', at: clockNow('world') };
      draft.world.events.push(row);
      WA.evict.array(draft.world.events, 'world.events');
      out = { ok: true, id: row.id, kind: row.kind };
    }, 'world:add-event');
    if (out && out.ok) { stat.events++; stat.lastReason = 'event'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function eventsBetween(t0, t1) {
    const a = isFinite(Number(t0)) ? Number(t0) : 0, b = isFinite(Number(t1)) ? Number(t1) : Infinity;
    return events().filter(function (e) { return e && isFinite(e.start) && e.end > a && e.start <= b; });
  }

  /**
   * 到场者名单——**只由证据给出**：谁的日程在此时段落在该地点，谁才算到场。
   * 不得由「办了一场集市」推出「全城人都到了」：本函数对没有日程依据的人**一个都不返回**。
   */
  function attendees(eventId) {
    const id = clean(eventId, 60);
    const ev = events().filter(function (e) { return e && e.id === id; })[0];
    if (!ev) return { ok: false, reason: 'missing-event' };
    const who = [];
    Object.keys(state().people || {}).forEach(function (k) {
      const p = state().people[k];
      const sch = (p && p.life && Array.isArray(p.life.schedule)) ? p.life.schedule : [];
      const on = sch.some(function (x) {
        return x && x.status === 'active' && isFinite(x.start) && isFinite(x.end)
          && x.start < ev.end && x.end > ev.start && clean(x.location, 40) === ev.place;
      });
      if (on) who.push(p.name || String(k).replace(/^p_/, ''));
    });
    return { ok: true, id: id, place: ev.place, who: who, evidence: 'schedule' };
  }

  /**
   * 时空可行性：这一刻此人能不能在那个地点。
   *   四个拒绝理由必须分开——「地点不存在」与「路走不通」与「被自己的日程占住」是三件事。
   */
  function canBeAt(person, place, at) {
    const who = clean(person, 60), pl = clean(place, 40);
    if (!who || !pl) return { ok: false, reason: 'missing-fields' };
    const hit = placeByName(pl);
    if (!hit) return { ok: false, reason: 'unknown-place', place: pl };   // 不猜
    const t = isFinite(Number(at)) ? Number(at) : clockNow('world');
    if (hit.open || hit.close) {
      if (t < hit.open || t >= hit.close) return { ok: false, reason: 'closed', place: pl, open: hit.open, close: hit.close };
    }
    const life = personLife(who);
    const sch = life && Array.isArray(life.schedule) ? life.schedule : [];
    const clash = sch.filter(function (x) {
      return x && x.status === 'active' && isFinite(x.start) && isFinite(x.end)
        && t >= x.start && t < x.end && clean(x.location, 40) && clean(x.location, 40) !== pl;
    })[0];
    if (clash) return { ok: false, reason: 'scheduled-elsewhere', place: clean(clash.location, 40), activity: clean(clash.activity, 40) };
    stat.checks++;
    return { ok: true, place: pl, at: t };
  }

  /**
   * 移动：先问「能不能到」（可达性），再问「这一刻在不在别处」（时空占位）。
   * 两个否定理由都必须在返回值里分开报出，不得合成一个「不行」。
   */
  function move(person, from, to, at) {
    const who = clean(person, 60), f = clean(from, 40), t = clean(to, 40);
    if (!who || !f || !t) return { ok: false, reason: 'missing-fields' };
    if (!placeByName(f) || !placeByName(t)) return { ok: false, reason: 'unknown-place' };
    const r = reach(f, t);
    if (!r.ok) return r;
    if (!r.reachable) { stat.blocked++; return { ok: false, reason: 'unreachable', from: f, to: t }; }
    const at2 = isFinite(Number(at)) ? Number(at) : clockNow('world');
    const arrive = at2 + r.minutes * 60000;
    const c = canBeAt(who, t, arrive);
    if (!c.ok) { stat.blocked++; return { ok: false, reason: c.reason, detail: c }; }
    stat.moves++;
    return { ok: true, person: who, from: f, to: t, minutes: r.minutes, departAt: at2, arriveAt: arrive, path: r.path };
  }

  /**
   * v2.65.0 行程表。move() 只回答「能不能到」；depart() 才把「人已经在路上」写进状态。
   * 在途的人既不在起点也不在终点——where() 对在途者返回 inTransit:true。
   * 同一人同时只能有一条行程：第二条会被拒（already-in-transit），不得静默覆盖。
   */
  function activeJourney(who) {
    const k = clean(who, 60);
    return journeys().filter(function (j) { return j && j.person === k && j.status === 'in-transit'; })[0] || null;
  }
  function depart(person, from, to, at) {
    const who = clean(person, 60);
    if (!who) return { ok: false, reason: 'missing-fields' };
    // 总开关关闭时不得改变任何人的位置。move() 只回答可达性、不落盘，
    // 所以闸必须放在写行程之前：关闭时连「能不能到」都不问，直接拒绝。
    if (!settings().enabled) { stat.blocked++; return { ok: false, reason: 'disabled', person: who }; }
    if (activeJourney(who)) { stat.blocked++; return { ok: false, reason: 'already-in-transit', person: who }; }
    const m = move(who, from, to, at);
    if (!m.ok) return m;
    if (m.minutes === 0) return { ok: false, reason: 'already-there', person: who, place: m.to };
    let out = null;
    WA.store.transact(function (draft) {
      draft.world = draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world) ? draft.world : {};
      draft.world.journeys = Array.isArray(draft.world.journeys) ? draft.world.journeys : [];
      const row = { id: 'jn_' + who + '_' + draft.world.journeys.length,
        person: who, from: m.from, to: m.to, path: m.path.slice(),
        total: m.minutes, left: m.minutes, departAt: m.departAt, arriveAt: m.arriveAt,
        status: 'in-transit', at: clockNow('world') };
      draft.world.journeys.push(row);
      WA.evict.array(draft.world.journeys, 'world.journeys');
      out = { ok: true, id: row.id, person: who, from: row.from, to: row.to, left: row.left, status: row.status };
    }, 'world:depart');
    if (out && out.ok) { stat.departed++; stat.lastReason = 'departed'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 推进在途行程。minutes 必须为正：0 或负不是「原地不动」，是非法输入（bad-minutes）。
   * 耗尽才算到达（status: arrived）；没耗尽就只减少 left，人仍在途中。
   */
  function advance(minutes) {
    const step = Number(minutes);
    if (!isFinite(step) || step <= 0) return { ok: false, reason: 'bad-minutes' };
    // 关闭时不推进在途者。把 left 减掉等于改了位置，和「关闭不改变任何人的位置」冲突。
    if (!settings().enabled) { stat.blocked++; return { ok: false, reason: 'disabled' }; }
    const arrived = [], still = [];
    WA.store.transact(function (draft) {
      const list = (draft.world && Array.isArray(draft.world.journeys)) ? draft.world.journeys : [];
      list.forEach(function (j) {
        if (!j || j.status !== 'in-transit') return;
        j.left = Math.max(0, j.left - step);
        if (j.left === 0) { j.status = 'arrived'; arrived.push(j.person + '→' + j.to); }
        else still.push(j.person);
      });
    }, 'world:advance');
    stat.advanced++;
    stat.arrived += arrived.length;
    stat.lastReason = arrived.length ? 'arrived' : (still.length ? 'in-transit' : 'nothing-to-do');
    return { ok: true, arrived: arrived, still: still, reason: stat.lastReason };
  }

  /** 人此刻在哪。在途优先于「日程落点」：在路上的人不得被写成已在目的地。 */
  function where(person) {
    const who = clean(person, 60);
    if (!who) return { ok: false, reason: 'missing-fields' };
    const j = activeJourney(who);
    if (j) return { ok: true, person: who, inTransit: true, from: j.from, to: j.to, left: j.left, place: null };
    const done = journeys().filter(function (x) { return x && x.person === who && x.status === 'arrived'; });
    if (done.length) { const last = done[done.length - 1]; return { ok: true, person: who, inTransit: false, place: last.to, arrived: true }; }
    return { ok: true, person: who, inTransit: false, place: null, reason: 'no-journey' };
  }

  /** 推进：把共同日程按当前时间落成 planned → ongoing → done。只改状态，不凭空给人安排去处。 */
  function tick(facts) {
    const cfg = settings(); const f = facts || {};
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: true, changed: 0, reason: 'disabled' }; }
    const now = isFinite(Number(f.now)) ? Number(f.now) : clockNow('world');
    let changed = 0;
    WA.store.transact(function (draft) {
      const list = (draft.world && Array.isArray(draft.world.events)) ? draft.world.events : [];
      list.forEach(function (e) {
        if (!e || e.status === 'done') return;
        const want = now >= e.end ? 'done' : (now >= e.start ? 'ongoing' : 'planned');
        if (want !== e.status) { e.status = want; changed++; }
      });
    }, 'world:tick');
    stat.lastReason = changed ? 'advanced' : 'nothing-to-do';
    return { ok: true, changed: changed, reason: stat.lastReason };
  }

  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const ps = places().slice(0, Math.max(2, cfg.maxPlaces));
    const es = events().filter(function (e) { return e && e.status !== 'done'; }).slice(0, cfg.maxEvents);
    if (!ps.length && !es.length) return '';
    const lines = [];
    if (ps.length) {
      lines.push('地点：' + ps.map(function (p) { return p.name + '（' + p.kind + '）'; }).join('｜'));
      const rs = roads().slice(0, 6);
      if (rs.length) lines.push('道路：' + rs.map(function (r) { return r.a + '↔' + r.b + ' ' + r.minutes + '分钟'; }).join('；'));
    }
    es.forEach(function (e) {
      const at = attendees(e.id);
      lines.push('共同日程：' + e.title + '（' + e.place + '，' + e.status + '）'
        + (at.ok && at.who.length ? '；到场者：' + at.who.join('、') : '；到场者：无日程依据'));
    });
    lines.push('时空约束：未登记的地点不存在、未登记的道路走不通——不得据此推断「大概很近」。');
    lines.push('同一人物同一时刻只能在一处；不在名单上的人不得被写成在场（在场者只认日程证据）。');
    const js = journeys().filter(function (j) { return j && j.status === 'in-transit'; }).slice(0, Math.max(1, cfg.maxJourneys || 4));
    if (js.length) lines.push('在途：' + js.map(function (j) { return j.person + '（' + j.from + '→' + j.to + '，剩余 ' + j.left + '分钟）'; }).join('；'));
    if (js.length) lines.push('在途者既不在起点也不在终点：剩余分钟未耗尽前，不得写成已到达。');
    return '[世界织体]\n' + lines.join('\n') + '\n';
  }

  WA.world = {
    PLACE_KINDS: PLACE_KINDS, EVENT_KINDS: EVENT_KINDS,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    addPlace: addPlace, addRoad: addRoad, reach: reach,
    addEvent: addEvent, eventsBetween: eventsBetween, attendees: attendees,
    canBeAt: canBeAt, move: move, depart: depart, advance: advance, where: where, tick: tick, buildBlock: buildBlock,
    whereStat: function () {
      return { places: places().length, roads: roads().length, events: events().length,
        upcoming: events().filter(function (e) { return e && e.status !== 'done'; }).length };
    },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  // v2.63.0 观测面：把「被拒了什么」按原因计入 stat.faults。
  //   为什么必须另立一面：拒绝是**不落盘**的——被拒的东西当然写不进存档，
  //   于是「世界没有因为一句话长出一条不存在的街」这件事在状态里完全不可见，
  //   而它恰恰是本模块存在的全部理由。
  //   实现纪律：只读观测。不改判定、不改返回结构、不新增导出成员——
  //   包在总线上而不是散进各个函数里，是为了让「有没有漏掉某条出口」在结构上不可能发生。
  (function () {
    const api = WA.world;
    if (!api) return;
    Object.keys(api).forEach(function (k) {
      const fn = api[k];
      if (typeof fn !== 'function') return;
      api[k] = function () {
        const r = fn.apply(null, arguments);
        if (r && r.ok === false && typeof r.reason === 'string' && r.reason) {
          stat.faults[r.reason] = (stat.faults[r.reason] || 0) + 1;
        }
        return r;
      };
    });
  })();
})();