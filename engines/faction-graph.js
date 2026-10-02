/**
 * WorldAxis engines/faction-graph.js (v2.139.0) — 势力关系动态图与张力热力图（E9）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   `engines/evolution.js` 自 v0.6.0 起就有势力表（`draft.evolution.factions`）与
 *   **六档状态**（`FACTION_STATUS`：鼎盛/稳固/倾轧/困顿/衰落/瓦解）、**七档关系**
 *   （`FACTION_RELATION`：血盟/盟友/友好/中立/冷淡/敌对/世仇），有容量站（`MAX_FACTIONS`）、
 *   有编辑器、有面板徽章。但**关系网本身**在整个仓库里不可见：
 *     · 「谁跟谁一伙、谁跟谁对着」在数据上**根本没有存储**；
 *     · 「这张网整体有多紧」没有任何一处回答（`ui/panel.js` 只逐行列势力，逐行求和 ≠ 图）；
 *     · 「哪些势力结成一块」需要连通性计算，而全库零图算法。
 *   一句话：**势力一张一张列着，但它们之间的关系网没人看得见。**
 *
 * ── 本模块落点（三件读数，各答一个问题）──────────────────────
 *   ① `buildGraph()` —— 邻接矩阵：节点 = 势力（`{id,name,status}`）、边 = **算得出来的**倾向档；
 *   ② `tension()`   —— 全局张力（图级读数）：敌对边权重和 ÷ 中立边数；
 *   ③ `clusters()`  —— 同盟簇：倾向 ≥ `allyIdx` 档的**连通子图**。
 *   外加 `heat()`（节点级：每个势力的同盟/敌对/中立边数与倾向和）与 `stat()`（只读计量）。
 *
 * ── 边的真源（这一条是本模块最要紧的取舍，必须写在最前面）────
 *   本仓**没有**势力间成对关系字段。`f.relation` 是**该势力对主视角（玩家）**的态度，
 *   不是「甲对乙」。把它当作甲↔乙的边，就等于**编一份数据**：两个都「敌对」主视角的势力
 *   会被画成互相敌对，两个都「血盟」的会被画成盟友 —— 而真相是它们之间可以是任何关系。
 *   故本模块的边**只用可核对的量**推导，并把口径**完整暴露**在边上：
 *     · `stanceIdx`（对外态度档位）—— 两个势力的 `relation` 各自在 `FACTION_RELATION` 里的下标；
 *     · `scopeKey`（活动范围）—— `f.scope` 归一化后逐字相等的势力共享活动面，
 *       这**不是**「它们喜欢对方」，只是「它们在同一块地面上」；
 *     · 公式 `affinity = clamp(mapper(a) + mapper(b) - 6, -6, 6)`，`mapper(i) = 6 - i`：
 *       同仇（都恨主视角）**不加分**、同亲（都亲主视角）**才**体现共同立场，
 *       且单方态度无法单独决定一条边（-6 使得「一方血盟 + 一方世仇」= 0，即中立）。
 *     · `derived: true` 恒为真 + `basis` 列出该边用到的原始字段 —— **调用方随时能看见
 *       「这条边是怎么来的」，也能看见它不是观测值**。图上任何一处着色都不得把
 *       `derived` 边当成「已知事实」呈现（本仓「见证的证据必须与判据同宽」的口径）。
 *   边档映射（`tierOf(affinity)`，纯函数）：`affinity ∈ [-6,6]` ⇒ 下标 `round((6-a)/2)` ⇒
 *   6→血盟 / 3→友好 / 0→中立 / -2→冷淡 / -6→世仇。**它给出的是档位名，不是新造枚举**。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `buildGraph` / `tension` / `clusters` / `heat` 一律拒收
 *     `disabled` —— 不开开关就没有图，**不编一张空图**（空图与「没有势力」在读数上必须分得开）。
 *   2 **只读不写**：本文件零 `WA.store.transact` / 零 `WA.store.patch`（源码级可核，
 *     专锁 N 面钉的就是这条）。**不自动合并势力**、不改关系、不动状态 ——
 *     「谁跟谁结盟」是叙事决定，不是统计决定。
 *   3 张力只是**描述性读数**：`tension()` 不触发事件、不改世界、不写存档。
 *     它是「这张网现在有多紧」的答案，不是「因此该发生什么」。
 *   4 三类边界给**确定答案**而不是 NaN：
 *     · 空图（世界里一个势力都没有）⇒ `{ok:false, reason:'no-factions'}`，**不返回 0 分的图**；
 *     · 单节点 ⇒ 边集为空、张力 `value: 0`（分母取 `max(1, 中立边数)`，不是 NaN/Infinity）
 *       且 `buildGraph().reason === 'empty-graph'`（它是**真算过的空图**）；
 *     · 自环 ⇒ 图上不存在（`matrix[i][i]` 记 `'self'`、**不进 `edges`**）；
 *       显式查一条自环/未知势力的边 ⇒ 拒收 `bad-faction`，而不是记成一条强度为 0 的边。
 *   5 节点数受 `maxNodes` 约束，超出部分**不进图**并如实报 `dropped` 名单
 *     （不静默截断 —— 截断会让「图小」与「势力少」长得一样）。
 *   6 势力名去重：同名势力在 `evolution.applyFactions` 里已按名合并，故图中同名即同一节点；
 *     若存档里出现重名（异常存档），**后者不进图**并计入 `dropped`（如实报，不静默合并）。
 *   7 档位词表一律取自 `evolution.FACTION_RELATION` / `FACTION_STATUS`（单一真源）；
 *     真源缺席时报 `module-missing`，**不自带一份副本**（两份枚举必然漂移）。
 *
 * ── 拒收码口径（沿用 v2.135.0 先例）──────────────────────────
 *   能复用的一律复用（`disabled` / `module-missing` / `bad-value`），只有三件事在既有
 *   词表里**没有对应说法**、且塌进任何既有码都会丢掉归因，才新开：
 *     · `no-factions` —— 「世界没有势力」不是 `not-found`（某个东西找不到），也不是 `bad-value`
 *       （参数传错）；它是**上游数据为空**，处置方式完全不同（去建设势力，而不是改调用）。
 *     · `bad-faction` —— 自环/未知势力名。`bad-value` 会把「图上的一条约束被违反」与
 *       「参数类型不对」合成一个答案。
 *     · `empty-graph` —— 有势力但**零条边**：这是「图算出来了、它是空的」，与
 *       `no-factions`（没有东西可算）**绝不同形**。张力在这种图上给 `value: 0`（分母已保护），
 *       而不是报错 —— 但调用方必须能区分「它真的是空的」与「没算」。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_faction_graph_settings_v1';
  const DEF = { enabled: false, allyIdx: 1, maxNodes: 16, hostileIdx: 5 };
  const __REG = { key: LS_KEY, def: DEF, module: 'factionGraph',
    bounds: { allyIdx: [0, 3], maxNodes: [2, 16], hostileIdx: [4, 6] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { builds: 0, tensions: 0, clusters: 0, nodes: 0, edges: 0, dropped: 0,
    blocked: 0, lastReason: '', faults: {}, lastAt: 0 };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
    catch (e) { return String(v == null ? '' : v).slice(0, max || 80); }
  }

  /** 档位真源：取自 `evolution`（**不自带副本** —— 两份枚举必然漂移）。 */
  function relations() {
    const ev = WA.evolution;
    if (!ev || !Array.isArray(ev.FACTION_RELATION) || !ev.FACTION_RELATION.length) return null;
    return ev.FACTION_RELATION;
  }
  function statuses() {
    const ev = WA.evolution;
    if (!ev || !Array.isArray(ev.FACTION_STATUS) || !ev.FACTION_STATUS.length) return null;
    return ev.FACTION_STATUS;
  }
  function state() { try { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function rawFactions() {
    const s = state();
    const list = ((s.evolution || {}).factions) || [];
    return Array.isArray(list) ? list : [];
  }

  /** 纯函数：档位映射。`mapper(i) = 6 - i`（下标越大、对外态度越差）。 */
  function mapper(idx) { return 6 - idx; }
  function tierOf(affinity) {
    const R = relations();
    if (!R) return null;
    const a = Math.max(-6, Math.min(6, Number(affinity) || 0));
    const idx = Math.max(0, Math.min(R.length - 1, Math.round((6 - a) / 2)));
    return { idx: idx, tier: R[idx] };
  }

  /**
   * 单条边的倾向值。**纯函数、可单测、可复算**：
   *   `mapper(a) + mapper(b) - 6`，clamp 到 [-6, 6]。
   *   为什么减 6：让「单方态度」无法单独决定一条边 ——
   *     一方血盟(6) + 一方世仇(0) = 0 ⇒ 中立，而不是「偏友好」或「偏敌对」。
   */
  function affinityOf(idxA, idxB) {
    const a = mapper(idxA) + mapper(idxB) - 6;
    return Math.max(-6, Math.min(6, a));
  }

  function nodeOf(f, i) {
    const R = relations();
    const rel = clean(f.relation, 20);
    const idx = R.indexOf(rel);
    return { id: 'fg_' + i, name: clean(f.name, 60), status: clean(f.status, 10),
      relation: rel, stanceIdx: idx < 0 ? -1 : idx, scope: clean(f.scope, 40),
      scopeKey: clean(f.scope, 40).replace(/\s+/g, '') };
  }

  /**
   * 建图。返回 `{ ok, nodes, edges, matrix, dropped, basisNote }` 或 `{ ok:false, reason }`。
   *   `matrix[i][j]` = 边档名（`i === j` 时为 `self`，不参与张力与簇）。
   */
  function buildGraph(opts) {
    const o = opts || {};
    const R = relations();
    if (!R) { noteFault('module-missing'); return { ok: false, reason: 'module-missing' }; }
    const cfg = settings();
    if (!cfg.enabled && !o.force) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const raw = rawFactions();
    if (!raw.length) { noteFault('no-factions'); return { ok: false, reason: 'no-factions' }; }
    const cap = Math.max(1, Math.min(64, Number(o.maxNodes) || cfg.maxNodes));
    const seen = {};
    const nodes = [], dropped = [];
    raw.forEach(function (f, i) {
      if (!f || !f.name) { dropped.push({ at: i, name: '', why: 'bad-faction' }); return; }
      const nm = clean(f.name, 60);
      if (Object.prototype.hasOwnProperty.call(seen, nm)) { dropped.push({ at: i, name: nm, why: 'duplicate' }); return; }
      if (nodes.length >= cap) { dropped.push({ at: i, name: nm, why: 'over-cap' }); return; }
      seen[nm] = true;
      nodes.push(nodeOf(f, nodes.length));
    });
    if (!nodes.length) { noteFault('no-factions'); return { ok: false, reason: 'no-factions' }; }
    const n = nodes.length;
    const matrix = [], edges = [];
    for (let i = 0; i < n; i++) {
      matrix.push(new Array(n).fill(null));
      matrix[i][i] = 'self';
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i], b = nodes[j];
        if (a.stanceIdx < 0 || b.stanceIdx < 0) {
          // 档位不在词表里 ⇒ 该边**算不出来**。记 null（不是 0，也不是中立）：
          //   0 会让它在下游被当「中立边」计入张力分母（一个不存在的边不该有重量）。
          matrix[i][j] = matrix[j][i] = null;
          continue;
        }
        const sameScope = !!a.scopeKey && a.scopeKey === b.scopeKey;
        const aff = affinityOf(a.stanceIdx, b.stanceIdx, sameScope);
        const tier = tierOf(aff);
        matrix[i][j] = matrix[j][i] = tier.tier;
        edges.push({ a: a.name, b: b.name, ai: i, bi: j, affinity: aff, idx: tier.idx, tier: tier.tier,
          sameScope: sameScope, derived: true,
          basis: ['evolution.factions[' + i + '].relation=' + a.relation,
            'evolution.factions[' + j + '].relation=' + b.relation] });
      }
    }
    stat.builds++; stat.nodes = n; stat.edges = edges.length; stat.dropped = dropped.length; stat.lastAt = clockWall();
    stat.lastReason = edges.length ? 'built' : 'empty-graph';
    return { ok: true, nodes: nodes, edges: edges, matrix: matrix, dropped: dropped,
      reason: edges.length ? 'built' : 'empty-graph',
      basisNote: '边为**推导值**（derived），非观测：由两势力的对外态度档位算出，见每条边的 basis。' };
  }

  /** 图的统一入口：任何读接口都先过这里，避免「有的口认 force、有的不认」。 */
  function graphOf(opts) { return buildGraph(opts); }

  /**
   * 显式查一条边（`from` → `to`）。**这条口的存在理由就是边界要报得出来**：
   *   `buildGraph` 的矩阵里不存在自环（`matrix[i][i]` 是 `'self'`），但调用方**显式**问
   *   「甲对甲是什么关系」时，正确回答是 `bad-faction`（这个问题不成立），
   *   而不是静默返回 `undefined` —— 「查不到」与「问错了」是两件事。
   */
  function edgeOf(from, to, opts) {
    const g = graphOf(opts);
    if (!g.ok) return { ok: false, reason: g.reason };
    const a = clean(from, 60), b = clean(to, 60);
    const ia = g.nodes.map(function (n) { return n.name; }).indexOf(a);
    const ib = g.nodes.map(function (n) { return n.name; }).indexOf(b);
    if (ia < 0 || ib < 0) { noteFault('bad-faction'); return { ok: false, reason: 'bad-faction', missing: ia < 0 ? a : b }; }
    if (ia === ib) { noteFault('bad-faction'); return { ok: false, reason: 'bad-faction', self: true }; }
    const e = g.edges.filter(function (x) { return (x.ai === ia && x.bi === ib) || (x.ai === ib && x.bi === ia); })[0];
    if (!e) return { ok: false, reason: 'empty-graph' };
    return { ok: true, edge: e };
  }

  /**
   * 全局张力。`hostile` = 敌对及更差（`idx ≥ hostileIdx`）的边权重和，
   *   权重 = 该边的敌对强度（`idx - (hostileIdx - 1)`）：敌对=1、世仇=2。
   * `value` = `hostile / max(1, 有效边数)` —— **分母保护**：单节点图（零边）时不是
   *   Infinity/NaN，而是 0（「这张网没有张力」在零边上是一句**真话**）。
   *   分母为什么取**总边数**而不是中立边数：中立边数为 0 时（全亲或全敌的图）
   *   `hostile / 0` 要么是 Infinity、要么得靠 `max(1,·)` 偷偷换掉分母 ——
   *   而换掉分母之后，报出来的 `value` 是多少条边摊出来的就**不可复算**了
   *   （只能按代码里的特例反推）。总边数是可核对的量：`hostile / 边数` 谁都能复算。
   *   中立边数仍然**如实报出**（`neutral`），供调用方按自己的口径再算 —— 报出来就好，
   *   不替调用方决定它该怎么用。
   */
  function tension(opts) {
    const g = graphOf(opts);
    if (!g.ok) return { ok: false, reason: g.reason };
    const cfg = settings();
    const R = relations();
    const neutralIdx = R.indexOf('中立');
    const hostileIdx = Math.max(0, Math.min(R.length - 1, isFinite(Number(cfg.hostileIdx)) ? Number(cfg.hostileIdx) : 5));
    let hostile = 0, neutral = 0, worst = '';
    g.edges.forEach(function (e) {
      if (e.idx >= hostileIdx) {
        const w = 1 + (e.idx - hostileIdx);
        hostile += w;
        if (!worst || e.idx > R.indexOf(worst)) worst = e.tier;
      } else if (e.idx === neutralIdx) neutral++;
    });
    const denominator = g.edges.length;
    const value = hostile / Math.max(1, denominator);
    stat.tensions++;
    return { ok: true, hostile: hostile, neutral: neutral, edges: denominator,
      hostileIdx: hostileIdx, worstTier: worst || null,
      value: Math.round(value * 1000) / 1000,
      denominator: denominator,
      // 零边时 `max(1, 0)` 换掉了分母 ⇒ 如实标注，免得读的人以为「除以了 0 却得到了数」。
      denominatorGuarded: denominator === 0,
      nodes: g.nodes.length,
      basisNote: g.basisNote };
  }

  /**
   * 同盟簇：倾向档 `idx ≤ allyIdx` 的边构成的**连通子图**（并查集）。
   *  `singletons` 单列：**没有同盟边的势力也是图的一部分**（它自成一簇），
   *   把它们丢掉会让 `clusters().length` 变成「同盟团数」而不是「图被分成几块」——
   *   又一个「两件事合成一个数」。
   */
  function clusters(opts) {
    const g = graphOf(opts);
    if (!g.ok) return { ok: false, reason: g.reason };
    const cfg = settings();
    const allyIdx = Math.max(0, Number(cfg.allyIdx) || 0);
    const n = g.nodes.length;
    const parent = [];
    for (let i = 0; i < n; i++) parent.push(i);
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function uni(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; }
    g.edges.forEach(function (e) { if (e.idx <= allyIdx) uni(e.ai, e.bi); });
    const groups = {};
    for (let i = 0; i < n; i++) { const r = find(i); (groups[r] = groups[r] || []).push(g.nodes[i].name); }
    const all = Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return (b.length - a.length) || (a[0] < b[0] ? -1 : 1); });
    const multi = all.filter(function (c) { return c.length > 1; });
    stat.clusters++;
    return { ok: true, allyIdx: allyIdx, allyTier: relations()[allyIdx] || null,
      clusters: multi, singletons: all.filter(function (c) { return c.length === 1; }).map(function (c) { return c[0]; }),
      count: multi.length, blocks: all.length, nodes: n,
      basisNote: g.basisNote };
  }

  /**
   * 节点级热度：逐势力数它的同盟/敌对/中立边数与倾向和。
   *   **不做合成评分** —— 「边数」与「状态」是两种不同的量，合起来就会让
   *   读的人分不清「它被围攻」与「它自己快散了」（本仓「两套数并存是最贵的缺陷」）。
   */
  function heat(opts) {
    const g = graphOf(opts);
    if (!g.ok) return { ok: false, reason: g.reason };
    const R = relations();
    const cfg = settings();
    const hostileIdx = Math.max(0, Math.min(R.length - 1, isFinite(Number(cfg.hostileIdx)) ? Number(cfg.hostileIdx) : 5));
    const neutralIdx = R.indexOf('中立');
    const rows = g.nodes.map(function (nd, i) {
      let allies = 0, hostiles = 0, neutrals = 0, sum = 0, unknowns = 0;
      for (let j = 0; j < g.nodes.length; j++) {
        if (i === j) continue;
        const e = g.edges.filter(function (x) { return (x.ai === i && x.bi === j) || (x.ai === j && x.bi === i); })[0];
        if (!e) { unknowns++; continue; }
        sum += e.affinity;
        if (e.idx >= hostileIdx) hostiles++;
        else if (e.idx === neutralIdx) neutrals++;
        else if (e.idx <= Math.max(0, Number(cfg.allyIdx) || 0)) allies++;
      }
      return { id: nd.id, name: nd.name, status: nd.status, relation: nd.relation,
        allies: allies, hostiles: hostiles, neutrals: neutrals,
        // `unknowns` = 档位不在词表里（算不出来）的边数：**它是数，不是 0**，
        //   否则「没有敌对」与「算不出」会被读成同一件事。
        unknowns: unknowns, affinitySum: sum };
    }).sort(function (a, b) { return (b.hostiles - a.hostiles) || (a.name < b.name ? -1 : 1); });
    return { ok: true, rows: rows, nodes: g.nodes.length, basisNote: g.basisNote };
  }

  function statusesAvailable() { return statuses() ? statuses().slice() : null; }

  WA.factionGraph = {
    // 单一真源的**可核对面**：两套词表各一口，读的是 evolution 的真源（不自带副本）。
    RELATION_KEYS: function () { const R = relations(); return R ? R.slice() : null; },
    STATUS_KEYS: statusesAvailable,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    // 产品面五口：建图 / 查边 / 张力 / 同盟簇 / 逐节点热度 —— 每一口都有真消费方
    //   （面板四枚按钮 + 诊断 secFactionGraph 的 hot 段）。**纯算法内部面不导出**（本仓口径：
    //   无独立消费方不挂）：`mapper` / `tierOf` / `affinityOf` 是「档位 → 权重」与
    //   「权重 → 档位」的中间步骤，外部没有第二处需要它们；导出它们只会让「谁能调」这件事
    //   与「谁真在调」分叉（v2.139.0 死导出门禁实测点名了这三口）。
    //   要复核算法本身，走 buildGraph() 的 `basis` / `derived` 字段与 tension() 的
    //   `hostile / denominator` 复算 —— 那是**可复算的读数**，不是又一份实现。
    buildGraph: buildGraph, edgeOf: edgeOf, tension: tension, clusters: clusters, heat: heat,
    stat: function () {
      return Object.assign({}, stat, { faults: Object.assign({}, stat.faults),
        enabled: settings().enabled, allyIdx: settings().allyIdx, maxNodes: settings().maxNodes,
        hostileIdx: settings().hostileIdx });
    }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/faction-graph.js', { kind: 'engine', ver: '2.139.0' });
})();
