/**
 * WorldAxis engines/atlas.js (v2.187.0) — E6 统一世界地图与关系视图
 *
 * ── 它治什么（缺口，计划原文）──────────────────────────────────
 *   「地理、势力、路线、痕迹、远方**分在五处**」：`region`（地点与传播）、
 *   `faction-graph`（关系图）、`economy`（商路）+ `freight`（在途）、`sediment`（地点痕迹）、
 *   `farfield`（远方与远方脉搏）。五处各自可查，**没有任何一条把它们摆在同一张图上**。
 *
 * ── 本模块只做一件事：把五处**只读地**摆进同一坐标系 ──────────────
 *   · `places()`    —— 地点坐标系（`region.places()` 是唯一坐标真源）+ 各地点痕迹定位
 *   · `routes()`    —— 道路端点（`economy.routeView`）+ **在途货物**（`freight.view`）
 *   · `relations()` —— **两层分列**：derived（`factionGraph` 推导边）与
 *                      facts（`diplomacy` 已确立事实），外加 `gaps`（仅派生、无事实）
 *   · `view()`      —— 一次取全（面板的消费方）
 *   · `diagnose()` / `stat()` / `resetStat()`
 *   远方与近场**分域**：分界线取自 `farfield.partition()` 的真源，本模块**不另立 nearDays**。
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────────
 *   1 默认关（enabled:false）。
 *   2 **地图是只读视图**：本模块**零 store 写** —— 没有 `transact`、没有自有状态键。
 *     任何「世界被改了」的写口都在各源模块自己手里；本模块只读它们。
 *   3 **派生边不得显示为已确立事实**：每条关系带 `layer`，derived 与 fact **永不合并**
 *     （合并之后「算出来的」与「谈成的」长得一样 —— 那正是本仓反复治理的两套真源）。
 *   4 **未知保持 unknown，不折成「中立」**：`diplomacy.pairView` 返回 unknown 的一对
 *     **不进事实层**（中立是一个谈成过的状态，unknown 是「没谈过」）。
 *   5 **不为未知地点造坐标**：坐标 = `region.places()` 里的距离与渠道。出现在端点里
 *     却不在地点表里的名字，进 `unplaced` 如实报出，**不补一份坐标**（缺就是缺）。
 *   6 **远方与近场分域**：`farfield` 缺席时分域如实报缺席，地点标 `zone:'unknown'`
 *     —— **不猜**它算近还是远。
 *   7 **在途货物到达后必须移出**：只有 `status === 'transit'` 进在途层；已到 / 已取消
 *     的不再画在路上（否则图上永远走着一条早该走完的货）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_atlas_settings_v1';
  const DEF = { enabled: false, maxPlaces: 32, maxEdges: 64, showFacts: true };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'atlas',
    bounds: { maxPlaces: [4, 128], maxEdges: [4, 256] }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    if (WA.settingsBus) return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
    return Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const _stat = { reads: 0, places: 0, routes: 0, derived: 0, facts: 0, unplaced: 0, refused: 0, lastReason: '', faults: {} };
  function fault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  /** 状态快照 —— `store.get()` 是本仓**官方读面**（各引擎都用它读别家的块），不是「偷读私有键」。 */
  function snap() { try { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; } catch (e) { return null; } }

  /**
   * 源缺席 / 源抛错**分列**：前者是「这个模块没装」，后者是「装了但它炸了」——
   *   两者对玩家的意思完全不同（前者是配置问题，后者是故障），压成一个码就再也分不出来了。
   */
  function srcFail(code, source) { fault(code); return { ok: false, reason: code, source: source }; }

  // ── 坐标真源：region.places ─────────────────────────────────────────
  function rawPlaces() {
    const R = WA.region;
    if (!R || typeof R.places !== 'function') return srcFail('source-absent', 'region');
    let list = null;
    try { list = R.places(); } catch (e) { return srcFail('source-threw', 'region'); }
    return { ok: true, list: Array.isArray(list) ? list : [] };
  }
  /** 分域真源：farfield.partition（**不重算 nearDays** —— 那是它的设置）。 */
  function partitionOf() {
    const F = WA.farfield;
    if (!F || typeof F.partition !== 'function') return srcFail('source-absent', 'farfield');
    try { return Object.assign({ ok: true }, F.partition()); }
    catch (e) { return srcFail('source-threw', 'farfield'); }
  }
  function zoneMap(part) {
    const m = {};
    if (!part || !part.ok) return m;                 // 分域读不到 ⇒ 全部落 unknown（不猜）
    (part.near || []).forEach(function (p) { if (p && p.name) m[clean(p.name, 40)] = 'near'; });
    (part.far || []).forEach(function (p) { if (p && p.name) m[clean(p.name, 40)] = 'far'; });
    return m;
  }
  /** 痕迹定位：走 sediment 公开读口，逐地点问（**不为痕迹造地点**）。 */
  function tracesOf(name, sources) {
    const S = WA.sediment;
    if (!S || typeof S.feel !== 'function') return null;
    sources.sediment = true;
    try {
      const f = S.feel(name);
      if (!f || f.ok !== true) return { count: 0, peak: null, labels: [], unreadable: true };
      return { count: f.count || 0, peak: f.peak || null,
        labels: (f.rows || []).slice(0, 4).map(function (r) { return r.label || r.now || r.trace; }) };
    } catch (e) { return { count: 0, peak: null, labels: [], threw: true }; }
  }

  /** 地点坐标系。**只读**；坐标一律来自 region，未知名字进 unplaced。 */
  function places() {
    const cfg = settings();
    const rp = rawPlaces();
    if (!rp.ok) return rp;
    const part = partitionOf();
    const zmap = zoneMap(part.ok ? part : null);
    const sources = { region: true, farfield: !!part.ok, sediment: false };
    const cap = Math.max(1, Math.min(cfg.maxPlaces || 32, rp.list.length || 1));
    const rows = [], unplaced = [];
    rp.list.slice(0, cap).forEach(function (p) {
      const name = clean(p && p.name, 40);
      if (!name) { unplaced.push({ name: '', why: 'bad-place-name' }); return; }
      const z = zmap[name];
      rows.push({
        name: name,
        distanceDays: num(p.distanceDays),
        lane: clean(p.lane, 20) || null,
        blocked: !!(p && p.blocked),
        zone: z || 'unknown',      // 边界 6：分域读不到 ⇒ 显式 unknown，不猜
        traces: tracesOf(name, sources)
      });
    });
    const cutPlaces = Math.max(0, (rp.list.length || 0) - cap);
    _stat.places = rows.length;
    return {
      ok: true, count: rows.length, truncated: cutPlaces, unplaced: unplaced,
      nearDays: part.ok ? (num(part.nearDays) || 0) : null,
      zoneUnknown: rows.filter(function (r) { return r.zone === 'unknown'; }).length,
      sources: sources, places: rows
    };
  }

  /**
   * 有坐标的名字表（**唯一真源：region 的公开读口**）。
   *   初版这里读的是 store 快照的 `region.places` 而 `places()` 读的是 `region.places()`
   *   ——**两处各说一遍「谁有坐标」**，必然漂移（桩宿主里快照有 region 块但 places 为空，
   *   于是所有端点都被判成「没坐标」）；更早一版还把端点名与坐标名混在同一张表里用
   *   反向真假区分，判据 `!known[k]` 于是对着**有**坐标的名字报「未落位」。
   *   本表语义只有一条：**在里面 = 有坐标**。不在里面 = 未落位。
   */
  function coordNames() {
    const names = {};
    const rp = rawPlaces();
    if (rp.ok) rp.list.forEach(function (p) {
      const k = clean(p && p.name, 40); if (k) names[k] = true;
    });
    return names;
  }

  // ── 道路端点 + 在途货物 ─────────────────────────────────────────────
  function routes() {
    const cfg = settings();
    const s = snap();
    if (s === null) return srcFail('source-threw', 'store');
    const sources = {
      economy: !!(WA.economy && typeof WA.economy.routeView === 'function'),
      freight: !!(WA.freight && typeof WA.freight.view === 'function')
    };
    const ids = ((s.economy && Array.isArray(s.economy.routes)) ? s.economy.routes : [])
      .map(function (r) { return clean(r && r.id, 60); }).filter(Boolean);
    const known = coordNames();
    const roads = [], unplaced = [];
    ids.slice(0, Math.max(1, Math.min(cfg.maxEdges || 64, ids.length || 1))).forEach(function (id) {
      let v = null;
      if (sources.economy) { try { v = WA.economy.routeView(id); } catch (e) { v = null; } }
      if (!v || v.ok !== true) { unplaced.push({ name: id, why: sources.economy ? 'route-unreadable' : 'economy-absent' }); return; }
      [v.from, v.to].forEach(function (n) { const k = clean(n, 40); if (k && !known[k]) unplaced.push({ name: k, why: 'endpoint-not-in-region' }); });
      roads.push({ id: clean(v.id, 60), lane: clean(v.lane, 20) || null, from: clean(v.from, 40), to: clean(v.to, 40),
        status: clean(v.status, 20) || null, cost: num(v.cost), transit: [] });
    });
    // 在途货物（边界 7：只有 transit 进在途层）
    const shipIds = ((s.freight && Array.isArray(s.freight.shipments)) ? s.freight.shipments : [])
      .map(function (x) { return clean(x && x.id, 60); }).filter(Boolean);
    const transit = [];
    shipIds.forEach(function (id) {
      let v = null;
      if (sources.freight) { try { v = WA.freight.view(id); } catch (e) { v = null; } }
      if (!v || v.ok !== true) return;
      if (clean(v.status, 20) !== 'transit') return;      // 已到 / 已取消 ⇒ 移出地图
      transit.push({ id: clean(v.id, 60), from: clean(v.from, 40), to: clean(v.to, 40),
        resource: clean(v.resource, 40), qty: num(v.qty), eta: num(v.eta) });
    });
    transit.forEach(function (t) {
      const hit = roads.filter(function (r) { return r.from === t.from && r.to === t.to; })[0];
      if (hit) hit.transit.push(t.id);
      else roads.push({ id: 'shp-path:' + t.id, lane: null, from: t.from, to: t.to, status: 'transit', cost: null, transit: [t.id] });
    });
    _stat.routes = roads.length;
    _stat.unplaced = unplaced.length;
    return { ok: true, count: roads.length, roads: roads, transit: transit,
      transitCount: transit.length, unplaced: unplaced, sources: sources };
  }

  // ── 关系两层（**永不合并**）────────────────────────────────────────
  function relations() {
    const cfg = settings();
    const sources = {
      factionGraph: !!(WA.factionGraph && typeof WA.factionGraph.buildGraph === 'function'),
      diplomacy: !!(WA.diplomacy && typeof WA.diplomacy.view === 'function')
    };
    let derived = [], derivedReason = null, dropped = 0;
    if (sources.factionGraph) {
      let g = null, threw = false;
      try { g = WA.factionGraph.buildGraph(); } catch (e) { g = null; threw = true; }
      if (threw || !g || g.ok !== true) {
        // 源自己的域内码（disabled / no-factions / empty-graph …）也如实归因 ——
        //   它们是**真拒收**，不是「没这一栏」。压成一句「读不到」就再也分不出
        //   「图是空的」与「图根本没建」。
        derivedReason = threw ? 'source-threw' : ((g && g.reason) || 'source-threw');
        fault(derivedReason);
      } else {
        const all = Array.isArray(g.edges) ? g.edges : [];
        const cap = Math.max(1, Math.min(cfg.maxEdges || 64, all.length || 1));
        derived = all.slice(0, cap).map(function (e) {
          return { a: clean(e.a, 60), b: clean(e.b, 60), tier: clean(e.tier, 20),
            // 边界 3：推导值**自报家门**。它永远带 derived:true 与 basis（可复算的来源）。
            layer: 'derived', derived: true, basis: Array.isArray(e.basis) ? e.basis.slice(0, 2) : [] };
        });
        dropped = Math.max(0, all.length - cap);
      }
    } else derivedReason = 'source-absent';
    let facts = [], factsReason = null;
    const gaps = [];
    if (cfg.showFacts === false) factsReason = 'facts-off';
    else if (sources.diplomacy) {
      let v = null, threw = false;
      try { v = WA.diplomacy.view(); } catch (e) { v = null; threw = true; }
      if (threw || !v || v.ok !== true) {
        factsReason = threw ? 'source-threw' : ((v && v.reason) || 'source-threw');
        fault(factsReason);
      } else {
        const pairs = Array.isArray(v.pairs) ? v.pairs : [];
        pairs.forEach(function (p) {
          const st = clean(p.state, 20);
          // 边界 4：unknown **不进事实层**。
          if (!st || st === 'unknown') return;
          const terms = Array.isArray(p.activeTerms) ? p.activeTerms : [];
          facts.push({ a: clean(p.a, 60), b: clean(p.b, 60), state: st, stateLabel: clean(p.stateLabel, 20) || st,
            layer: 'fact', derived: false, treaty: terms.length > 0,
            terms: terms.slice(0, 4).map(function (x) { return { term: clean(x.term, 30), until: num(x.until) }; }) });
        });
        // 显式未知态：只在派生层出现、且外交表里**没有成对条目**的一对。
        derived.forEach(function (d) {
          let pv = null;
          try { pv = WA.diplomacy.pairView(d.a, d.b); } catch (e) { pv = null; }
          const st = pv && pv.ok === true ? clean(pv.state, 20) : null;
          if (st === 'unknown') gaps.push({ a: d.a, b: d.b, why: 'no-pair-record', note: '仅派生，无已确立事实（unknown ≠ 中立）' });
        });
      }
    } else factsReason = 'source-absent';
    _stat.derived = derived.length;
    _stat.facts = facts.length;
    return {
      ok: true, derived: derived, derivedCount: derived.length, derivedTruncated: dropped, derivedReason: derivedReason,
      facts: facts, factsCount: facts.length, factsReason: factsReason, gaps: gaps,
      sources: sources,
      note: 'derived = 由两势力对外态度档位**推导**（每条带 basis）；fact = 成对谈判结果。两层不合并。'
    };
  }

  function view() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const pl = places(), rt = routes(), rel = relations();
    const counts = {
      places: pl.ok ? pl.count : 0, roads: rt.ok ? rt.count : 0, transit: rt.ok ? rt.transitCount : 0,
      derived: rel.derivedCount, facts: rel.factsCount, gaps: rel.gaps.length,
      unplaced: (pl.ok ? pl.unplaced.length : 0) + (rt.ok ? rt.unplaced.length : 0)
    };
    _stat.reads++;
    return { ok: true, counts: counts,
      empty: counts.places === 0 && counts.roads === 0 && counts.derived === 0 && counts.facts === 0,
      places: pl, routes: rt, relations: rel,
      notes: { places: pl.ok ? null : pl.reason, routes: rt.ok ? null : rt.reason } };
  }

  function diagnose() {
    const cfg = settings();
    const s = snap();
    const rel = relations();
    return {
      ok: true, enabled: !!cfg.enabled, showFacts: cfg.showFacts !== false,
      maxPlaces: cfg.maxPlaces, maxEdges: cfg.maxEdges,
      deps: {
        store: !!WA.store, settingsBus: !!WA.settingsBus, inputGuard: !!WA.inputGuard,
        region: !!(WA.region && typeof WA.region.places === 'function'),
        factionGraph: !!(WA.factionGraph && typeof WA.factionGraph.buildGraph === 'function'),
        diplomacy: !!(WA.diplomacy && typeof WA.diplomacy.view === 'function'),
        economy: !!(WA.economy && typeof WA.economy.routeView === 'function'),
        freight: !!(WA.freight && typeof WA.freight.view === 'function'),
        sediment: !!(WA.sediment && typeof WA.sediment.feel === 'function'),
        farfield: !!(WA.farfield && typeof WA.farfield.partition === 'function')
      },
      snapshotOk: s !== null,
      layers: { derived: rel.derivedCount, facts: rel.factsCount, gaps: rel.gaps.length,
        derivedReason: rel.derivedReason, factsReason: rel.factsReason },
      faults: Object.assign({}, _stat.faults)
    };
  }
  function statOf() {
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults),
      enabled: !!settings().enabled, showFacts: settings().showFacts !== false });
  }
  function resetStat() {
    _stat.reads = 0; _stat.places = 0; _stat.routes = 0; _stat.derived = 0; _stat.facts = 0;
    _stat.unplaced = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {};
    return { ok: true };
  }

  // 导出面：**每一口都有真消费方**（本仓口径：无消费方不挂导出）。
  //   `view` / `places` / `routes` / `relations` / `diagnose` / `getSettings` / `setSettings`
  //   → 面板「统一地图与关系视图」区块（七枚按钮 + 一个开关）；
  //   `stat` → tool-diag 的 `secAtlas()`。
  //   刻意**不导出** `resetStat`：它没有产品侧消费方（本会话读数在诊断页已是累计量，
  //   不需要一个「清零」按钮），挂上去只会让「谁能调」与「谁真在调」分叉 ——
  //   这正是 v2.139.0 死导出门禁在 faction-graph 上点名过的那类口。
  WA.atlas = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    places: places, routes: routes, relations: relations, view: view,
    diagnose: diagnose, stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/atlas.js', { kind: 'engine', ver: '2.187.0' });
})();