/**
 * WorldAxis engines/world-graph.js (v2.202.0) — Y7 地图与关系可视化（视图面，不是新真源）
 *
 * ── 它治什么（现场读数，不是阅读推断）────────────────────────────────
 *   `engines/atlas.js` 有地点 / 路线 / 关系三表（面板 8 处消费）、`faction-graph` 有
 *   组织推导图、`bonds` 有关系六型 —— 但**呈现全是平面列表**，且四处各写各的：
 *     · 玩家看不出「谁和谁连着」「从这儿能不能走到那儿」「这条边凭什么存在」；
 *     · 关系数据的三个来源（atlas 的两层、factionGraph 的推导边、bonds 的登记六型）
 *       从没有在**同一幅画面**里对照过；
 *     · 坏数据（无来源的边、指向不存在节点的边、绕圈的边）在各处的处理是「丢掉」，
 *       于是「图上少了一条」与「本来就没有那条」在玩家侧是**同一幅画面**。
 *
 * ── 边界（全是否定式）────────────────────────────────────────────────
 *   ① **视图，不是新真源**：节点与边一律从既有表读（atlas / factionGraph / bonds /
 *      store.people），本模块**不落任何自己的边表**、不新增世界顶层键；
 *   ② **不卡死**：节点数与边数各受 CAPS 约束，超限时**降级**（截断 + 如实报
 *      `truncated` / `deferred`），不是阻塞面板、也不是静默丢弃；
 *   ③ **不隐去坏数据**：无来源的边标 `orphan`、端点不存在的边标 `dangling`、
 *      绕圈的边标 `cyclic` —— 三类异常**都在图上看得见**，本模块只标不删；
 *   ④ **零写入**：不调 `store.transact`、不写 `localStorage`、不改任何设置键的默认值。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 节点三类 + 边三类。**白名单是判据面**：未知类名整条拒收，不静默忽略。 */
  const KINDS = ['people', 'orgs', 'places'];
  const EDGE_KINDS = ['relations', 'faction', 'bonds'];

  /** 预算（宿主约束的落点）：超限降级成「截断 + 如实报」，不是卡死。 */
  const CAPS = Object.freeze({ maxNodes: 240, maxEdges: 480, maxCycleProbe: 400, maxRows: 60 });

  const LS_KEY = 'worldaxis_worldgraph_v1';
  const DEF = { enabled: true, showOrphans: true, maxNodes: 120, maxEdges: 240 };
  // v2.203.0 收口：module 名原写 'world-graph'（连字符），本仓所有设置归属读的都是
  //   **驼峰命名空间**（同目录 100+ 引擎一律 `WA.<camel>`）⇒ 设置登记项的归属读不出来。
  //   v2830/mr 实测 `unmapped:world-graph` 把它顶出来（那门禁只报名字，不猜修法）。
  const __REG = { key: LS_KEY, def: DEF, module: 'worldGraph',
    bounds: { maxNodes: [20, 240], maxEdges: [40, 480] } };
  const _stat = { builds: 0, nodes: 0, edges: 0, orphans: 0, dangling: 0, cyclic: 0,
    truncatedNodes: 0, truncatedEdges: 0, lastReason: '', faults: {} };
  function noteFault(r) { _stat.faults[r] = (_stat.faults[r] || 0) + 1; }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const base = Object.assign({}, DEF, raw || {});
    return {
      enabled: base.enabled !== false,
      showOrphans: base.showOrphans !== false,
      maxNodes: Math.max(20, Math.min(CAPS.maxNodes, Number(base.maxNodes) || DEF.maxNodes)),
      maxEdges: Math.max(40, Math.min(CAPS.maxEdges, Number(base.maxEdges) || DEF.maxEdges))
    };
  }
  function saveSettings(patch) {
    const next = Object.assign({}, settings(), patch || {});
    if (WA.settingsBus) return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, next));
    noteFault('settings-bus-absent');
    return next;
  }
  if (WA.__settingsRegs) WA.__settingsRegs = WA.__settingsRegs.concat([__REG]);
  else WA.__settingsRegs = [__REG];

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : String(v === undefined || v === null ? '' : v).slice(0, max || 40);
  }
  function state() { try { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function statOf() { return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults) }); }

  // ── 节点面：三类各走各的**既有读口**（不在本模块重造一份）────────────
  /**
   * 人物节点：`store.people`（对象 map）。上游缺席 ⇒ 该类如实缺席（不是空集）。
   * ⚠ 与 Y6 同一条口径：**「真的没有」与「读不了」是两件事**。
   */
  function nodesOf(kind) {
    if (KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kind: kind };
    const notes = [];
    if (kind === 'people') {
      const p = state().people;
      if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, reason: 'source-absent', kind: kind };
      const rows = Object.keys(p).map(function (id) {
        const v = p[id] || {};
        return { id: String(id), kind: 'people', label: clean(v.name || id, 60), source: 'store.people' };
      });
      return { ok: true, kind: kind, rows: rows, source: 'store.people' };
    }
    if (kind === 'orgs') {
      if (!WA.factionGraph || typeof WA.factionGraph.buildGraph !== 'function') return { ok: false, reason: 'module-missing', kind: kind };
      let g = null;
      try { g = WA.factionGraph.buildGraph(); } catch (e) { return { ok: false, reason: 'source-threw', kind: kind }; }
      if (!g || g.ok !== true) return { ok: false, reason: (g && g.reason) || 'unreadable', kind: kind };
      const rows = (g.nodes || []).map(function (n) {
        return { id: String(n.id), kind: 'orgs', label: clean(n.name || n.id, 60),
          status: n.status || null, source: 'factionGraph.buildGraph().nodes' };
      });
      return { ok: true, kind: kind, rows: rows, source: 'factionGraph.buildGraph().nodes', note: g.basisNote || null };
    }
    // places
    if (!WA.atlas || typeof WA.atlas.places !== 'function') return { ok: false, reason: 'module-missing', kind: kind };
    let pl = null;
    try { pl = WA.atlas.places(); } catch (e) { return { ok: false, reason: 'source-threw', kind: kind }; }
    if (!pl || pl.ok !== true) return { ok: false, reason: (pl && pl.reason) || 'unreadable', kind: kind };
    const rows = (pl.places || []).map(function (p) {
      return { id: String(p.name), kind: 'places', label: clean(p.name, 60),
        zone: p.zone || 'unknown', blocked: !!p.blocked, source: 'atlas.places()' };
    });
    if (rows.some(function (r) { return r.zone === 'unknown'; })) notes.push('有地点的分域读不到（zone=unknown）—— 引擎不猜，如实标');
    return { ok: true, kind: kind, rows: rows, source: 'atlas.places()', notes: notes };
  }

  // ── 边面：三个来源各带**自己的**来源标签与依据 ──────────────────────
  function edgesOf(kind) {
    if (EDGE_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-edge-kind', kind: kind };
    if (kind === 'relations') {
      if (!WA.atlas || typeof WA.atlas.relations !== 'function') return { ok: false, reason: 'module-missing', kind: kind };
      let rel = null;
      try { rel = WA.atlas.relations(); } catch (e) { return { ok: false, reason: 'source-threw', kind: kind }; }
      if (!rel || rel.ok !== true) return { ok: false, reason: (rel && rel.reason) || 'unreadable', kind: kind };
      const out = [];
      (rel.derived || []).forEach(function (d) {
        out.push({ from: String(d.a), to: String(d.b), kind: 'relations', layer: 'derived',
          tier: d.tier || null, source: 'atlas.relations().derived',
          basis: Array.isArray(d.basis) ? d.basis.slice() : (d.basis ? [String(d.basis)] : []) });
      });
      (rel.facts || []).forEach(function (f) {
        // ⚠ 事实层的每条边**自报依据**：atlas 的 fact 行不带 `basis` 字段（它带的是
        //   `state / stateLabel / treaty / terms`）—— 若此处照抄 `f.basis` 就会得到空数组，
        //   而下游的孤儿判据正是「无 basis」，于是一条**有来源、有事实**的边会被标成孤儿。
        //   实测踩到：`graph()` 对 fact 边报 orphan(no-basis) —— 把「这条边凭什么存在」这件事
        //   在两处各说了一遍（atlas 用 state，本模块用 basis），而两处口径不同。
        //   依据**从既有字段拼**，不新增判据面。
        const fb = Array.isArray(f.basis) ? f.basis.slice() : [];
        if (!fb.length) fb.push('atlas.relations().facts[' + String(f.a) + '×' + String(f.b) + '].state=' + String(f.state || f.stateLabel || 'unknown'));
        out.push({ from: String(f.a), to: String(f.b), kind: 'relations', layer: 'fact',
          tier: f.tier || null, state: f.state || null, treaty: !!f.treaty,
          source: 'atlas.relations().facts', basis: fb });
      });
      return { ok: true, kind: kind, rows: out, gaps: (rel.gaps || []).slice(0, CAPS.maxRows),
        note: rel.note || null };
    }
    if (kind === 'faction') {
      if (!WA.factionGraph || typeof WA.factionGraph.buildGraph !== 'function') return { ok: false, reason: 'module-missing', kind: kind };
      let g = null;
      try { g = WA.factionGraph.buildGraph(); } catch (e) { return { ok: false, reason: 'source-threw', kind: kind }; }
      if (!g || g.ok !== true) return { ok: false, reason: (g && g.reason) || 'unreadable', kind: kind };
      const out = (g.edges || []).map(function (e) {
        return { from: String(e.a), to: String(e.b), kind: 'faction', layer: 'derived',
          tier: e.tier || null, source: 'factionGraph.buildGraph().edges',
          basis: Array.isArray(e.basis) ? e.basis.slice() : (e.basis ? [String(e.basis)] : []) };
      });
      return { ok: true, kind: kind, rows: out, dropped: (g.dropped || []).slice(0, CAPS.maxRows),
        note: g.basisNote || null };
    }
    // bonds：登记的关系六型（**结构账**，与血仇事件账正交）
    const b = state().bonds;
    const rows = (b && Array.isArray(b.rows)) ? b.rows : null;
    if (!rows) return { ok: false, reason: 'source-absent', kind: kind };
    const out = rows.map(function (r) {
      return { from: String(r.a), to: String(r.b), kind: 'bonds', layer: 'registered',
        types: Array.isArray(r.types) ? r.types.slice() : [], at: r.at || null,
        source: 'store.bonds.rows', key: r.key || null,
        basis: ['store.bonds.rows[' + (r.key || '') + '].types'] };
    });
    return { ok: true, kind: kind, rows: out, source: 'store.bonds.rows' };
  }

  /**
   * 建图：三类节点 + 三类边，逐条做**异常标注**（只标不删）。
   * 返回里的 `orphan` / `dangling` / `cyclic` 三份名单是**界面异常面的真源**。
   */
  function graph(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled && !o.force) { _stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const wantKinds = Array.isArray(o.kinds) && o.kinds.length
      ? KINDS.filter(function (k) { return o.kinds.indexOf(k) >= 0; }) : KINDS.slice();
    const wantEdges = Array.isArray(o.edges) && o.edges.length
      ? EDGE_KINDS.filter(function (k) { return o.edges.indexOf(k) >= 0; }) : EDGE_KINDS.slice();
    const badKinds = (Array.isArray(o.kinds) ? o.kinds : []).filter(function (k) { return KINDS.indexOf(k) < 0; });
    if (badKinds.length) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', kinds: badKinds }; }
    // ⚠ 边类同样整条拒收 —— 与节点类**同一口径**。
    //   首版只校验了 `o.kinds`，于是 `o.edges: ['不存在的边类']` 被 `EDGE_KINDS.filter` **静默吞掉**，
    //   返回一张「零条边但 ok:true」的图 —— 正踩中本模块自己写下的边界（「白名单是判据面：
    //   未知类名整条拒收，不静默忽略」）。玩家看到的是「这个来源没有边」，而事实是「来源名打错了」。
    const badEdgeKinds = (Array.isArray(o.edges) ? o.edges : []).filter(function (k) { return EDGE_KINDS.indexOf(k) < 0; });
    if (badEdgeKinds.length) { noteFault('bad-edge-kind'); return { ok: false, reason: 'bad-edge-kind', edgeKinds: badEdgeKinds }; }

    const missing = []; const nodeRows = [];
    wantKinds.forEach(function (k) {
      const r = nodesOf(k);
      if (!r.ok) { missing.push({ kind: k, reason: r.reason }); return; }
      r.rows.forEach(function (x) { nodeRows.push(x); });
    });

    const edgeMissing = []; const edgeRows = [];
    wantEdges.forEach(function (k) {
      const r = edgesOf(k);
      if (!r.ok) { edgeMissing.push({ kind: k, reason: r.reason }); return; }
      r.rows.forEach(function (x) { edgeRows.push(x); });
    });

    // 上限：节点先截（保序），边按已留下的节点集过滤后再截
    const maxNodes = Math.max(1, Math.min(CAPS.maxNodes, Number(o.maxNodes) || cfg.maxNodes));
    const maxEdges = Math.max(1, Math.min(CAPS.maxEdges, Number(o.maxEdges) || cfg.maxEdges));
    const truncatedNodes = Math.max(0, nodeRows.length - maxNodes);
    const nodes = nodeRows.slice(0, maxNodes);
    const idSet = {};
    nodes.forEach(function (n) { idSet[n.kind + ':' + n.id] = true; });

    // 端点解析：边按**标签**（名字）连节点 —— 三处来源用的是名字，本模块不擅自映射 id
    const byLabel = {};
    nodes.forEach(function (n) {
      const key = String(n.label);
      (byLabel[key] = byLabel[key] || []).push(n);
    });
    const dangling = []; const orphan = []; const kept = [];
    edgeRows.forEach(function (e) {
      const fa = byLabel[e.from] || [], fb = byLabel[e.to] || [];
      if (!fa.length || !fb.length) { dangling.push(Object.assign({}, e, { missingSide: !fa.length ? 'from' : 'to' })); return; }
      const basis = Array.isArray(e.basis) ? e.basis.filter(Boolean) : [];
      // **无来源的边**：既没有 basis，也没有 source 标签 —— 标 orphan，**不丢**
      if (!basis.length || !e.source) { orphan.push(Object.assign({}, e, { why: !e.source ? 'no-source' : 'no-basis' })); if (!cfg.showOrphans) return; }
      kept.push(Object.assign({}, e, { fromNode: fa[0].id, toNode: fb[0].id, basis: basis }));
    });
    const truncatedEdges = Math.max(0, kept.length - maxEdges);
    const edges = kept.slice(0, maxEdges);

    // 循环检测（有向、仅前端探；超探测上限如实报 probeSkew 而不是假装查过）
    const cyc = cycles(edges, Math.min(CAPS.maxCycleProbe, edges.length));

    _stat.builds++; _stat.nodes = nodes.length; _stat.edges = edges.length;
    _stat.orphans = orphan.length; _stat.dangling = dangling.length; _stat.cyclic = cyc.cycles.length;
    _stat.truncatedNodes = truncatedNodes; _stat.truncatedEdges = truncatedEdges;
    _stat.lastReason = nodes.length ? 'built' : 'empty-graph';
    return {
      ok: true, reason: _stat.lastReason,
      nodes: nodes, edges: edges,
      counts: { nodes: nodes.length, edges: edges.length,
        byKind: wantKinds.reduce(function (m, k) { m[k] = nodes.filter(function (n) { return n.kind === k; }).length; return m; }, {}),
        byEdgeKind: wantEdges.reduce(function (m, k) { m[k] = edges.filter(function (e) { return e.kind === k; }).length; return m; }, {}) },
      anomalies: { orphan: orphan, dangling: dangling, cyclic: cyc.cycles },
      truncated: { nodes: truncatedNodes, edges: truncatedEdges },
      absent: { nodeKinds: missing, edgeKinds: edgeMissing },
      probeSkew: cyc.skew,
      basisNote: '节点与边一律从既有表读（atlas / factionGraph / bonds / store.people）—— 本模块不落自己的边表。'
    };
  }
  /**
   * 有向环检测（迭代 DFS，三色标记）。
   * 超探测上限时**不假装查过**：`skew` 报出「有多少条边没进这次探测」。
   */
  function cycles(edges, limit) {
    const adj = {}; const nodesSeen = {};
    const use = edges.slice(0, Math.max(0, limit));
    const skew = Math.max(0, edges.length - use.length);
    use.forEach(function (e) {
      (adj[e.from] = adj[e.from] || []).push(e.to);
      nodesSeen[e.from] = true; nodesSeen[e.to] = true;
    });
    const color = {}; const stack = []; const out = [];
    function dfs(u) {
      color[u] = 1; stack.push(u);
      const nx = adj[u] || [];
      for (let i = 0; i < nx.length; i++) {
        const v = nx[i];
        if (color[v] === 1) {
          const at = stack.indexOf(v);
          if (at >= 0) out.push(stack.slice(at).concat([v]));
          if (out.length >= 20) return true;
        } else if (color[v] !== 2) {
          if (dfs(v)) return true;
        }
      }
      color[u] = 2; stack.pop();
      return false;
    }
    const keys = Object.keys(nodesSeen);
    for (let i = 0; i < keys.length; i++) if (!color[keys[i]]) { if (dfs(keys[i])) break; }
    return { cycles: out, skew: skew };
  }

  // ── 地理视图（路线可达性 + 未探索区域）──────────────────────────────
  function geo(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled && !o.force) return { ok: false, reason: 'disabled' };
    if (!WA.atlas || typeof WA.atlas.routes !== 'function') return { ok: false, reason: 'module-missing' };
    let rt = null; let pl = null;
    try { rt = WA.atlas.routes(); } catch (e) { return { ok: false, reason: 'source-threw' }; }
    try { pl = WA.atlas.places(); } catch (e) { pl = null; }
    if (!rt || rt.ok !== true) return { ok: false, reason: (rt && rt.reason) || 'unreadable' };
    const from = o.from ? clean(o.from, 60) : '';
    const roads = rt.roads || [];
    const reach = {}; // 从 from 出发一层可达（**只报一跳**，不做加权最短路 —— 那是布局算法，不是本页的判据）
    roads.forEach(function (r) {
      if (!from) return;
      if (r.from === from) (reach[r.to] = reach[r.to] || []).push(r.status || 'open');
      if (r.to === from) (reach[r.from] = reach[r.from] || []).push(r.status || 'open');
    });
    const placed = {}; (pl && pl.ok ? (pl.places || []) : []).forEach(function (p) { placed[String(p.name)] = true; });
    const untouch = roads.filter(function (r) { return !placed[r.from] || !placed[r.to]; })
      .map(function (r) { return { id: r.id, from: r.from, to: r.to, side: !placed[r.from] ? 'from' : 'to' }; });
    const blocked = roads.filter(function (r) { return r.status && r.status !== 'open' && r.status !== 'transit'; })
      .map(function (r) { return { id: r.id, from: r.from, to: r.to, status: r.status }; });
    return { ok: true, from: from || null, roads: roads.length, transit: rt.transitCount || 0,
      reach: from ? Object.keys(reach).map(function (k) { return { to: k, status: reach[k][0] }; })
        : (function () { noteFault('no-from'); return null; })(),
      reachNote: from ? '一类可达（只报一跳，不做加权最短路）' : '未给起点：只报全图读数，不猜可达',
      unplaced: (rt.unplaced || []).slice(0, CAPS.maxRows), untouched: untouch.slice(0, CAPS.maxRows),
      blocked: blocked.slice(0, CAPS.maxRows),
      zones: pl && pl.ok ? { unknown: pl.zoneUnknown || 0, note: 'zone=unknown 是**如实标**，不是猜出来的域' } : null,
      source: 'atlas.routes() / atlas.places()' };
  }

  // ── 时间轴叠加（关系随章节变化对照）────────────────────────────────
  /**
   * ⚠ 如实边界：既有表里**只有 bonds 的每一行带 `at`**（登记时刻）。atlas 的两层关系
   *   与 factionGraph 的推导边**不带时间** —— 故本面把「有时间戳的」按时序排出来，
   *   把「无时间戳的」单列在 `undated` 里，**不拿登记时刻冒充关系变化的时刻**。
   */
  function timeline(opts) {
    const o = opts || {};
    const g = graph({ kinds: o.kinds, edges: ['bonds'], maxEdges: o.maxEdges });
    if (!g.ok) return { ok: false, reason: g.reason };
    const dated = g.edges.filter(function (e) { return typeof e.at === 'number' && e.at > 0; })
      .map(function (e) { return { at: e.at, from: e.from, to: e.to, types: e.types || [], fromNode: e.fromNode, toNode: e.toNode }; })
      .sort(function (a, b) { return a.at - b.at; });
    const undated = (o.edges || EDGE_KINDS).filter(function (k) { return k !== 'bonds'; })
      .map(function (k) { return { kind: k, why: '该来源的边不带时间戳（既有表如此）—— 不拿登记时刻冒充变化时刻' }; });
    let chap = null;
    try {
      const c = state().chapters;
      if (c && c.current) chap = { no: c.current.no, title: clean(c.current.title, 60), startedAt: c.current.startedAt || null };
    } catch (e) { chap = null; }
    return { ok: true, dated: dated.slice(-CAPS.maxRows), datedCount: dated.length,
      undated: undated, chapter: chap, note: dated.length ? null : '尚无带时间戳的关系登记' };
  }

  // ── 「下一次该去哪」的建议来源说明（**不代玩家决定**）────────────────
  /**
   * ⚠ 首版这里有一个**读数恒为 0** 的真缺陷，实测踩到：
   *   度数原本按 `'places:' + e.fromNode` 查 —— 而 `fromNode` 只在边**端点了落到节点集里**
   *   时才存在，且三条来源的端点分别是**势力名（relations/faction）与人物名（bonds）**，
   *   地点名几乎不会出现在端点里。于是每个地点的度数都是 0，「按度数排序」等于没有排序，
   *   功能④对玩家而言是一条永远说「全是 0 分」的建议。
   *   修法两条：① 度数按**节点标签**统计（边两端写的就是名字，本模块不擅自映射 id）；
   *   ② 如实报「图上连到地点的边有几条」—— 若一条都没有，就说清这是**数据源的形状**
   *   （三个来源的端点类型不同），不是排序算法坏了。**不为了让数字好看而造边。**
   */
  function suggest(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled && !o.force) return { ok: false, reason: 'disabled' };
    const g = graph({ edges: ['relations', 'faction', 'bonds'], maxNodes: o.maxNodes });
    if (!g.ok) return { ok: false, reason: g.reason };
    const deg = {};
    g.edges.forEach(function (e) {
      deg[e.from] = (deg[e.from] || 0) + 1;
      deg[e.to] = (deg[e.to] || 0) + 1;
    });
    const places = g.nodes.filter(function (n) { return n.kind === 'places'; });
    const items = places.map(function (n) {
      const d = deg[n.label] || 0;
      return { place: n.label, zone: n.zone, blocked: !!n.blocked, degree: d,
        basis: ['nodes 来自 atlas.places()',
          'degree = 该地点名在本图 N 条边的两端出现过的次数（实 ' + d + '）',
          '本图边来源：' + EDGE_KINDS.map(function (k) { return k + ' ' + (g.counts.byEdgeKind[k] || 0); }).join(' / '),
          n.zone === 'unknown' ? '该地点分域读不到（zone=unknown）' : 'zone=' + n.zone,
          n.blocked ? '该地点在既有表里被标 blocked' : '未被标 blocked'] };
    }).sort(function (a, b) { return (b.degree - a.degree) || String(a.place).localeCompare(String(b.place)); })
      .slice(0, CAPS.maxRows);
    const linked = items.filter(function (x) { return x.degree > 0; }).length;
    return { ok: true, items: items, linked: linked, places: items.length,
      note: '按图上度数排序 —— 这是**来源说明**，不是「你应该去哪」：决定权在玩家。' +
        '每条 basis 逐项写明这个数是算出来的还是标出来的。',
      zeroNote: linked === 0 && items.length
        ? '注意：图上**没有一条边的端点是本批地点**（' + items.length + ' 个地点度数全为 0）。' +
          '这是数据源的形状 —— relations/faction 的端点是势力名、bonds 的端点是人物名，' +
          '本模块不为了让数字好看而替它们编一条边。'
        : null,
      anomalies: g.anomalies, truncated: g.truncated };
  }

  /**
   * 定位一个节点（供面板跳转用：只读出口，不代写）。
   *
   * ⚠ 匹配顺序：先按 `id`（精确），再按 `label`（显示名）。
   *   首版只按 `id`，而 `id` 在界面上**从不显示** —— 玩家从画面上读到的是 label，
   *   于是这个功能对玩家而言等于「输入一个你不可能知道的值」。不是崩溃级，但它是
   *   「有出口、无从使用」这一族：功能在场、通向它的路不在场。
   *   返回里带 `matchedBy`，让「我按什么找到的」在界面上可读（与全仓「读数说清来源」同规）。
   */
  function locate(id, kind) {
    const g = graph({ kinds: kind ? [kind] : KINDS, edges: [] });
    if (!g.ok) return { ok: false, reason: g.reason };
    const key = String(id === undefined || id === null ? '' : id).trim();
    if (!key) { noteFault('missing-id'); return { ok: false, reason: 'missing-id' }; }
    let hit = g.nodes.filter(function (n) { return n.id === key; })[0] || null;
    let matchedBy = hit ? 'id' : null;
    if (!hit) {
      const same = g.nodes.filter(function (n) { return n.label === key; });
      if (same.length === 1) { hit = same[0]; matchedBy = 'label'; }
      else if (same.length > 1) {
        // 重名 ⇒ **不猜**：列出来让人自己选（三类节点里同名的确会发生）。
        noteFault('ambiguous-label');
        return { ok: false, reason: 'ambiguous-label', id: key,
          candidates: same.map(function (n) { return { id: n.id, kind: n.kind, label: n.label }; }) };
      }
    }
    if (!hit) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: key }; }
    return { ok: true, node: hit, matchedBy: matchedBy };
  }

  function diagnose() {
    const cfg = settings();
    const st = statOf();
    let g = null;
    try { g = graph({ edges: [] }); } catch (e) { g = { ok: false, reason: 'threw' }; }
    return { ok: true, enabled: !!cfg.enabled, showOrphans: !!cfg.showOrphans,
      caps: { maxNodes: CAPS.maxNodes, maxEdges: CAPS.maxEdges, maxCycleProbe: CAPS.maxCycleProbe },
      budget: { nodes: cfg.maxNodes, edges: cfg.maxEdges },
      kinds: KINDS.slice(), edgeKinds: EDGE_KINDS.slice(),
      live: g.ok ? { nodes: g.counts.nodes, edges: g.counts.edges,
        orphan: g.anomalies.orphan.length, dangling: g.anomalies.dangling.length,
        cyclic: g.anomalies.cyclic.length, probeSkew: g.probeSkew } : { reason: g.reason },
      stat: st, source: '本模块只读四张既有表：atlas / factionGraph / bonds / store.people' };
  }

  WA.worldGraph = {
    KINDS: KINDS.slice(), EDGE_KINDS: EDGE_KINDS.slice(), CAPS: CAPS,
    // ⚠ 接口面只留**页面真走的口**。下面三面一律**不导出**（v2.202.0 死导出面实测）：
    //   · `nodes` / `edges`：节点与边集合已被 `graph()` 的 `nodes` / `edges` / `counts` 覆盖；
    //     另开两个口等于让外部绕过 graph 各取一份 —— 「一律从既有表读」那条边界就被开了旁路。
    //   · `cycles`：环列表在 `graph().anomalies.cyclic`，单独导出会让人拿它绕过异常面。
    //   三者函数体原地保留（模块内私有）。
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    graph: graph, geo: geo, timeline: timeline, suggest: suggest, locate: locate,
    diagnose: diagnose, stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/world-graph.js', { kind: 'engine', ver: '2.202.0' });
})();
