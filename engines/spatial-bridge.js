/**
 * WorldAxis engines/spatial-bridge.js (v2.521.0) — 空间缝合层（坐标域路由器）
 *
 * ── 它治什么（缺口，先说现场）──────────────────────────────────
 *   仓里这套「地图」不是一个引擎，是四张各说一套的表：
 *     · `engines/region.js`   宏观：远方在哪、消息几天到（距离与传播渠道）
 *     · `engines/atlas.js`    只读聚合：把 region / economy / faction-graph / sediment
 *                             / farfield 摆进同一坐标系（`places()` 以 region 为坐标真源）
 *     · `engines/spatial-topology.js`  层级：region 〉sector 〉venue 〉subspace，
 *                             外加门禁状态（open/locked/restricted/sealed）与功能矩阵
 *     · `engines/geo-tracker.js`       角色位置：正文 `<位置>` 标签解析 + 三级消歧，
 *                             地点字典自带世界坐标 (x, y)
 *     · `engines/local-grid.js`        平面：**每处场所一套独立坐标系**，同平面内给方位与格数，
 *                             跨场所/跨分层一律 `cross-venue` / `cross-zone` 且 distance 为 null
 *
 *   四张表各自都能查。但**没有任何一处回答得了**这三个问题：
 *     ① 「厨房」这个名字在哪？—— 它可能在三个不同建筑里各有一个；
 *     ② 我在 3 楼，301 在东边两步；那这栋楼在世界上哪个街区？—— 两套坐标，**不能相加**；
 *     ③ 谁离我最近？—— spatial-topology 有层级没有距离，geo-tracker 有距离但会把
 *        不同建筑按同一原点算（这正是它把文京区与所泽算成 50 米的病根）。
 *
 * ── 本模块只做一件事：**统一入口 + 标明坐标域，绝不混算** ─────────────
 *   · `whereIs(name)`      一次答全：这个名字在**场所系**的哪几张平面、在**世界系**的
 *                          哪个街区。两者分列，**不相减、不折算**（`domain` 字段说清有几套）
 *   · `nearby(ref)`        同平面内的方位与格数（委托 localGrid.relatePeek，只读不求解）；
 *                          跨 zone / 跨场所**原样返回拒绝码**，不给假距离
 *   · `atlasSlice(venue)`  宏观（region/atlas 的街区与天数）+ 微观（该场所各平面的点位）对照
 *   · `mirrorVenue(venue)` 把一处场所**投影**成 spatial-topology 的 venue/subspace 节点与
 *                          adjacency 通道，让门禁/功能矩阵能挂在同一批名字上（**唯一写路径**）
 *   · `unmirrorVenue` / `mirrorStatus`  撤投影 / 看投影
 *   · `buildBlock(ctx)`    提示词片段：场所系方位 + 世界系街区，合成一段、**位置只说一遍**
 *   · `diagnose()` / `stat()`
 *
 * ── 边界（全是否定式，逐条都有代价）──────────────────────────
 *   1 **不合并坐标系**：世界系 (x,y) 与场所系 (venue, zone, x, y) 是两套独立原点。
 *      本模块任何返回值都不出现「世界系 + 场所系」的算术结果。
 *   2 **不给米数**：跨建筑只到街区级（引用 geoTracker 的 region 字段），
 *      同平面只到格数（引用 localGrid 的 steps）。上一轮治掉的那个病根不许从后门回来。
 *   3 **不自带存储**：本模块零状态（`stat` 只是计数），所有真源都在四个引擎里。
 *      所以它不需要 store 骨架、不需要容量站点 —— **桥不该有第三个副本**。
 *   4 **写只有一个入口**：`mirrorVenue` / `unmirrorVenue`。`whereIs` / `nearby` /
 *      `atlasSlice` / `buildBlock` 全部只读，且读的路径也只用**不写**的取数面
 *      （`peekVenue` / `relatePeek` / `resolveLocation`）—— 面板或提示词每轮跑一遍
 *      不能把世界写一遍。
 *   5 **默认关闭**：`enabled:false`。关闭时 `buildBlock` 返回空串、`mirrorVenue` 返回
 *      `disabled`；`whereIs` / `nearby` / `atlasSlice` 仍可用（它们是只读诊断，不是注入）。
 */
'use strict';
(function () {
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.522.0';

  const LS_KEY = 'worldaxis_spatial_bridge_v1';
  const DEF = {
    enabled: false,
    // 投影节点 id 前缀：`lg:本乡公寓楼`。为什么带前缀：spatial-topology 的 nodes 是
    //   全局字典，外部世界书/预设也会往里写同名 venue —— 不带前缀就等于悄悄覆盖别人的节点。
    mirrorPrefix: 'lg:'
  };
  // v2.522.0：本条曾写成 `bounds: { mirrorPrefix: { minLen: 0, maxLen: 8 } }`
  //   —— 那是**一条说不出口的声明**：bounds 的契约是 `[min,max]` 数值区间（`normalize` 走
  //   `clampNum` 对数值做夹取），对**字符串**长度没有任何作用点；而形式不合法时
  //   `settingsBus.selfCheck()` 会报 `bad-bounds` **error**，直接把诊断判语拉红。真正的亦一是两个错：既把
  //   不能干活的声明写成略号，又以为它在守着前缀长度。故本版把长度约束放到
  //   **读取口**（见下方 settings() 的 prefix 归一）：那里才是每一次拼接都必经的地方，且失败形态是「错误值被截断」
  //   而不是「错误值安静落盘」。声明表仍保留该子键的 `def`（默认 `'lg:'`）。
  const __REG = {
    key: LS_KEY, def: DEF, module: 'spatialBridge'
  };
  if (WA.__settingsRegs) WA.__settingsRegs = WA.__settingsRegs.concat([__REG]);

  const stat = {
    mirrorCalls: 0, unmirrorCalls: 0, whereCalls: 0, nearbyCalls: 0,
    atlasCalls: 0, blockCalls: 0, crossRejected: 0, lastReason: '', faults: {}
  };
  function fault(code) {
    stat.faults[code] = (stat.faults[code] || 0) + 1;
    stat.lastReason = code;
    return { ok: false, reason: code };
  }
  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60)
      : String(v == null ? '' : v).slice(0, max || 60);
  }
  /**
   * 世界系「真的命中了吗」——geoTracker 的 resolveLocation **永远返回 ok:true**
   * （最后一层兜底是 `precision:'unplaced'`：保留原文、x/y 为 null、region 'unknown'）。
   * 所以「查得到」不能只看 ok，否则每个不存在的名字都会变成一条假的世界坐标。
   * 判据：ok 且非 approximate 且真有坐标。三件事少一件都算缺席（如实写缺席，不补默认值）。
   */
  function worldHit(r) {
    return !!(r && r.ok && !r.approximate && r.x !== null && r.y !== null);
  }
  function settings() {
    const raw = (WA.settingsBus && WA.settingsBus.read) ? WA.settingsBus.read(__REG) : null;
    const merged = (WA.settingsBus && WA.settingsBus.normalize && WA.settingsBus.read)
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
    // 前缀的长度约束在这里（去控制字符 / 截断）。为什么不用 bounds：参见 __REG 上方注释。
    // 空串是合法值（不加前缀 = 与外部同名节点直接撞车，但那是用户的选择）；超过 8 字符则截断。
    merged.mirrorPrefix = clean(merged.mirrorPrefix, 8);
    return merged;
  }
  function saveSettings(next) {
    if (WA.settingsBus && WA.settingsBus.saveOrThrow) {
      return WA.settingsBus.saveOrThrow(__REG,
        WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), next || {})));
    }
    return Object.assign({}, DEF, settings(), next || {});
  }

  // ── 取数面：全部走「不写」的那几个口 ─────────────────────────
  function lgModule() { return WA.localGrid || null; }
  function stModule() { return WA.spatialTopology || (WA.engines && WA.engines.spatialTopology) || null; }
  function gtModule() { return WA.geoTracker || null; }
  function atModule() { return WA.atlas || null; }

  /**
   * 一处场所在场所系里的全部平面（只读：localGrid.peekVenue，不求解、不写缓存）。
   */
  function localPlanes(venue) {
    const LG = lgModule();
    if (!LG || typeof LG.peekVenue !== 'function') return { ok: false, reason: 'local-grid-absent' };
    return LG.peekVenue(venue);
  }

  /**
   * 统一空间查询：一个名字在**两套坐标系**里各在何处。
   *
   * 为什么不合成一个 (x, y)：那是把两套原点相加，正是本病根的同款错误。
   *   `world`  —— geoTracker 的地点字典（世界坐标 + 街区 + 精度）
   *   `local`  —— localGrid 的平面点位（venue/zone/x/y），**可能有多处同名**
   *   `domain` —— 'world' / 'local' / 'both' / null，说清这次答的是哪套
   */
  function whereIs(name) {
    stat.whereCalls++;
    const q = clean(name, 80);
    if (!q) return fault('missing-name');
    const out = { ok: true, name: q, domain: null, world: null, local: [], mirrored: null };
    const key = q.toLowerCase();

    // ① 场所系：遍历点位（同名多地是常态，不挑一个代表）
    const LG = lgModule();
    if (LG && typeof LG._root === 'function') {
      let lg = null;
      try { lg = LG._root(); } catch (e) { lg = null; }
      const sk = lg ? Object.keys(lg.spots || {}) : [];
      for (let i = 0; i < sk.length; i++) {
        const s = lg.spots[sk[i]];
        if (!s) continue;
        if (String(s.name).toLowerCase() !== key) continue;
        out.local.push({
          venue: s.venue, zone: s.zone, name: s.name,
          explicit: !!s.explicit, kind: s.kind || ''
        });
      }
    }

    // ② 世界系：geoTracker 的地点字典（只读，resolveLocation 不改状态）
    const GT = gtModule();
    if (GT && typeof GT.resolveLocation === 'function') {
      let r = null;
      try { r = GT.resolveLocation(q); } catch (e) { r = null; }
      if (worldHit(r)) {
        out.world = {
          x: r.x, y: r.y, region: r.region || '', kind: r.kind || '',
          floor: r.floor || '', precision: r.precision || '', approximate: !!r.approximate
        };
      }
    }

    // ③ 层级：若已镜像过，给出它在拓扑树里的位置（venue 级带出所属场所）
    const ST = stModule();
    const P = settings().mirrorPrefix;
    if (ST && typeof ST.getState === 'function' && out.local.length) {
      const state = ST.getState();
      const nodes = (state && state.nodes) || {};
      const first = out.local[0];
      const vid = P + first.venue;
      const zid = vid + '#' + first.zone;
      if (nodes[zid] || nodes[vid]) {
        const chain = (typeof ST.getHierarchy === 'function') ? ST.getHierarchy(nodes[zid] ? zid : vid) : [];
        out.mirrored = {
          venueNode: !!nodes[vid],
          zoneNode: !!nodes[zid],
          path: (chain || []).map(function (n) { return n.name; })
        };
      }
    }

    const hasW = !!out.world, hasL = out.local.length > 0;
    out.domain = (hasW && hasL) ? 'both' : (hasL ? 'local' : (hasW ? 'world' : null));
    if (!out.domain) {
      out.ok = false;
      out.reason = 'unknown-name';
      return fault('unknown-name');
    }
    return out;
  }

  /**
   * 同平面内的邻居：方位与格数。跨 zone / 跨场所**原样返回拒绝码**。
   *
   * 为什么不兜底给个距离：`relate` 的跨域拒绝是这个引擎存在的理由（geo-tracker 的
   * 病根就是把不同建筑按同一原点相减）。桥要是「帮个忙算一下」，那一层守就白建了。
   */
  function nearby(ref) {
    stat.nearbyCalls++;
    const r = ref || {};
    const venue = clean(r.venue, 40), zone = clean(r.zone, 40), name = clean(r.name, 80);
    if (!venue) return fault('missing-venue');
    if (!zone) return fault('missing-zone');
    if (!name) return fault('missing-name');
    const plan = localPlanes(venue);
    if (!plan.ok) return fault(plan.reason || 'venue-failed');
    let z = null;
    for (let i = 0; i < (plan.zones || []).length; i++) {
      if (plan.zones[i].zone === zone) { z = plan.zones[i]; break; }
    }
    if (!z) return fault('unknown-zone');
    if (z.source !== 'solved') {
      // 未求解就没有点位关系。**不在这里触发求解**：那是面板/提示词每轮的路径。
      return { ok: false, reason: 'zone-unsolved', hint: 'getZone / preheat 之后再有方位' };
    }
    if (!z.cells || !z.cells[name]) return fault('unknown-spot');
    const LG = lgModule();
    const others = Object.keys(z.cells).filter(function (n) { return n !== name; });
    const list = [];
    let rejected = 0;
    for (let i = 0; i < others.length; i++) {
      const tn = others[i];
      let rel = null;
      if (LG && typeof LG.relatePeek === 'function') {
        rel = LG.relatePeek(
          { venue: venue, zone: zone, name: name },
          { venue: venue, zone: zone, name: tn }
        );
      } else {
        rel = { ok: false, reason: 'relate-absent' };
      }
      if (rel && rel.ok) list.push({ name: tn, dir: rel.dir || '', steps: rel.steps, text: rel.text || '' });
      else { rejected++; stat.crossRejected++; }
    }
    list.sort(function (a, b) { return a.steps - b.steps; });
    return {
      ok: true, venue: venue, zone: zone, spot: name,
      source: 'solved', others: list, samePlane: others.length,
      rejected: rejected
    };
  }

  /**
   * 宏观 × 微观对照：这处场所在世界里是哪一块，在平面里铺成什么样。
   */
  function atlasSlice(venue) {
    stat.atlasCalls++;
    const V = clean(venue, 40);
    if (!V) return fault('missing-venue');
    const out = { ok: true, venue: V, world: null, atlas: null, planes: null };
    const GT = gtModule();
    if (GT && typeof GT.resolveLocation === 'function') {
      let r = null;
      try { r = GT.resolveLocation(V); } catch (e) { r = null; }
      if (worldHit(r)) out.world = { x: r.x, y: r.y, region: r.region || '', kind: r.kind || '', precision: r.precision || '' };
    }
    const AT = atModule();
    if (AT && typeof AT.places === 'function') {
      let p = null;
      try { p = AT.places(); } catch (e) { p = null; }
      if (p && p.ok) out.atlas = { count: p.count, nearDays: p.nearDays, unplaced: (p.unplaced || []).length };
    }
    const pk = localPlanes(V);
    if (pk && pk.ok) {
      out.planes = (pk.zones || []).map(function (z) {
        return { zone: z.zone, label: z.label, floor: z.floor, placed: z.placed, total: z.total, source: z.source };
      });
    }
    if (!out.world && !out.planes) {
      out.ok = false;
      out.reason = 'unknown-venue';
      return fault('unknown-venue');
    }
    return out;
  }

  /**
   * 投影：把一处场所接到 spatial-topology 的树上（**唯一写路径**）。
   *
   * 投影什么、不投影什么：
   *   · venue → level:'venue' 节点；每个 zone → level:'subspace' 子节点（parentId 指向 venue）
   *   · spot 的 `adj` → `type:'adjacency'` 通道（**不带距离**：拓扑只记「能过去」）
   *   · 不投影坐标：spatial-topology 的节点没有坐标系，硬塞 x/y 进去等于造第二个真源。
   *     要看点位/方位走 `localGrid` / `nearby`。
   *
   * ⚠ 如实记一条现场：`spatialTopology.getState()` 在 store 骨架里**没有 key**，
   *   它的写入落在模块内 `_memState`（进程内有效、不随存档走）。所以这次投影是
   *   **会话级**的。要让它持久化，得先在 `core/store.js` 骨架里加 `spatialTopology`
   *   节点 —— 那是一次独立的骨架变更，不在本模块里偷偷做。
   */
  function mirrorVenue(venue) {
    stat.mirrorCalls++;
    if (!settings().enabled) return fault('disabled');
    const V = clean(venue, 40);
    if (!V) return fault('missing-venue');
    const ST = stModule();
    if (!ST || typeof ST.registerNode !== 'function') return fault('topology-absent');
    const LG = lgModule();
    if (!LG || typeof LG.peekVenue !== 'function') return fault('local-grid-absent');
    const pk = LG.peekVenue(V);
    if (!pk || !pk.ok) return fault((pk && pk.reason) || 'unknown-venue');
    const P = settings().mirrorPrefix;
    const vid = P + V;
    ST.registerNode(vid, {
      name: V, level: 'venue', parentId: null, type: 'venue',
      metadata: { region: pk.region || '', source: 'local-grid' }
    });
    let zones = 0, portals = 0;
    const before = ((ST.getState() || {}).portals || []).length;
    for (let i = 0; i < (pk.zones || []).length; i++) {
      const z = pk.zones[i];
      const zid = vid + '#' + z.zone;
      ST.registerNode(zid, {
        name: z.label || z.zone, level: 'subspace', parentId: vid, type: 'room',
        metadata: { zone: z.zone, floor: z.floor || '', placed: z.placed, total: z.total, source: 'local-grid' }
      });
      zones++;
      const c = ST.connect(vid, zid, { type: 'stair', id: vid + '>' + zid });
      if (c && c.ok && !c.exists) portals++;
    }
    // adjacency：同场所内 spot 的 adj 声明 → 通道。只取同 venue 的配对（跨场所的邻接不投影）。
    const lg = LG._root();
    const sk = lg ? Object.keys(lg.spots || {}) : [];
    const zoneOf = {};
    for (let i = 0; i < sk.length; i++) {
      const s = lg.spots[sk[i]];
      if (s && s.venue === V) zoneOf[s.name] = s.zone;
    }
    for (let i = 0; i < sk.length; i++) {
      const s = lg.spots[sk[i]];
      if (!s || s.venue !== V) continue;
      for (let j = 0; j < (s.adj || []).length; j++) {
        const t = s.adj[j];
        if (!zoneOf[t]) continue;
        const a = vid + '#' + s.zone, b = vid + '#' + zoneOf[t];
        if (a === b) continue;
        const id = vid + '~' + (String(a) < String(b) ? a + '|' + b : b + '|' + a);
        const c = ST.connect(a, b, { type: 'adjacency', id: id });
        if (c && c.ok && !c.exists) portals++;
      }
    }
    const after = ((ST.getState() || {}).portals || []).length;
    // v2.522.0：持久化如实报。此前这里硬编码 false（当时 spatialTopology 不在 store 骨架里，
    //   投影只活在模块的 _memState）—— 现在骨架键已就位、写路径走 transact，故改问引擎自己：
    //   stateSource() === 'store' ⇒ 随存档落盘、分支复制带走；否则如实说会话级。
    const persisted = (typeof ST.stateSource === 'function') ? (ST.stateSource() === 'store') : false;
    return {
      ok: true, venue: V, venueNode: vid, zones: zones,
      portals: portals, portalsTotal: after - before + portals,
      persisted: persisted,
      note: persisted
        ? '节点与通道写进 store.spatialTopology（随存档持久化、分支复制带走）'
        : 'store 不可用（裸上下文）⇒ 投影只在本次进程内'
    };
  }

  /**
   * 撤投影：只删本模块前缀下的节点与通道，别人的节点一个字不动。
   */
  function unmirrorVenue(venue) {
    stat.unmirrorCalls++;
    const V = clean(venue, 40);
    if (!V) return fault('missing-venue');
    const ST = stModule();
    if (!ST || typeof ST.getState !== 'function') return fault('topology-absent');
    const P = settings().mirrorPrefix;
    const vid = P + V;
    const state = ST.getState();
    if (!state || !state.nodes) return fault('topology-empty');
    let nodes = 0;
    const ids = Object.keys(state.nodes);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === vid || id.indexOf(vid + '#') === 0) { delete state.nodes[id]; nodes++; }
    }
    const kept = [];
    let portals = 0;
    for (let i = 0; i < (state.portals || []).length; i++) {
      const p = state.portals[i];
      const hit = String(p.id || '').indexOf(vid + '~') === 0
        || String(p.id || '').indexOf(vid + '>') === 0
        || (String(p.from || '').indexOf(vid) === 0 && String(p.to || '').indexOf(vid) === 0);
      if (hit) portals++; else kept.push(p);
    }
    state.portals = kept;
    return { ok: true, venue: V, removedNodes: nodes, removedPortals: portals };
  }

  /** 投影现状：谁已经被接到树上、树上有没有别人的节点。 */
  function mirrorStatus(venue) {
    const ST = stModule();
    if (!ST || typeof ST.getState !== 'function') return { ok: false, reason: 'topology-absent' };
    const state = ST.getState() || {};
    const P = settings().mirrorPrefix;
    const ids = Object.keys(state.nodes || {});
    const mine = [], foreign = [];
    for (let i = 0; i < ids.length; i++) {
      if (ids[i].indexOf(P) === 0) mine.push(ids[i]); else foreign.push(ids[i]);
    }
    const venues = {};
    for (let i = 0; i < mine.length; i++) {
      const tail = mine[i].slice(P.length);
      const v = tail.split('#')[0];
      venues[v] = (venues[v] || 0) + 1;
    }
    const out = {
      ok: true, prefix: P, nodes: mine.length, foreignNodes: foreign.length,
      portals: (state.portals || []).length, venues: Object.keys(venues).length,
      // v2.522.0：投影存不存得下来，由引擎自己回答（见 mirrorVenue 同款注释）
      persisted: (typeof ST.stateSource === 'function') ? (ST.stateSource() === 'store') : false
    };
    if (venue) {
      const V = clean(venue, 40);
      out.venue = V;
      out.venueNodes = venues[V] || 0;
      out.venueNode = ids.indexOf(P + V) >= 0;
    }
    return out;
  }

  /**
   * 提示词片段：场所系方位 + 世界系街区。
   *   `localGrid.buildBlock(ctx)` 已经会喂「同平面方位」（且已断言不含「米」字），
   *   这里**只补世界系那一句**，位置不重复说两遍。
   */
  function buildBlock(ctx) {
    stat.blockCalls++;
    if (!settings().enabled) return '';
    const c = ctx || {};
    const parts = [];
    const LG = lgModule();
    if (LG && typeof LG.buildBlock === 'function') {
      let s = '';
      try { s = LG.buildBlock(c); } catch (e) { s = ''; }
      if (s) parts.push(s);
    }
    const venue = clean(c.venue, 40);
    const GT = gtModule();
    if (venue && GT && typeof GT.resolveLocation === 'function') {
      let r = null;
      try { r = GT.resolveLocation(venue); } catch (e) { r = null; }
      if (worldHit(r) && r.region) {
        parts.push('【世界系】' + venue + ' 位于 ' + r.region
          + (r.kind ? '（' + r.kind + '）' : '')
          + '；跨建筑只到街区与日程，不折算米数。');
      }
    }
    return parts.join('\n');
  }

  function diagnose() {
    const LG = lgModule(), ST = stModule(), GT = gtModule(), AT = atModule();
    const ms = mirrorStatus();
    return {
      ok: true, version: VERSION,
      settings: settings(),
      present: {
        localGrid: !!LG, spatialTopology: !!ST, geoTracker: !!GT, atlas: !!AT,
        region: !!WA.region
      },
      mirror: ms && ms.ok ? { nodes: ms.nodes, portals: ms.portals, venues: ms.venues, foreignNodes: ms.foreignNodes } : { absent: true },
      noLocalGridRead: !!(LG && typeof LG.peekVenue === 'function' && typeof LG.relatePeek === 'function'),
      stat: statOf()
    };
  }

  function statOf() {
    return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) });
  }

  WA.spatialBridge = {
    version: VERSION,
    settings: settings, saveSettings: saveSettings,
    whereIs: whereIs, nearby: nearby, atlasSlice: atlasSlice,
    mirrorVenue: mirrorVenue, unmirrorVenue: unmirrorVenue, mirrorStatus: mirrorStatus,
    buildBlock: buildBlock, diagnose: diagnose, stat: statOf,
    resetStat: function () { stat.faults = {}; stat.lastReason = ''; return { ok: true }; }
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/spatial-bridge.js', { kind: 'engine', ver: VERSION });
  }
})();