/**
 * WorldAxis engines/local-grid.js (v2.519.0) - 分形局部网格 / 区域平面求解器
 *
 * 机制来源：tavern-map-extension v0.7.3 的 assignLayout 求解链，做成本仓库可复用的空间判定层。
 *   场所 venue -> 区域 zone -> 地点 spot；坐标是每个 zone 自己的局部平面。
 *   每个 zone 独立求解、互不干扰（楼层分区不共享坐标系），跨 zone 绝不换算距离。
 *
 * 求解优先级（严格按这个顺序，先到先占格）
 *   1 手动覆盖 overrides[name] = {x,y}
 *   2 数据显式坐标 spot.x / spot.y（都给了才算）
 *   3 BFS 方位推导：已定位地点 -> 邻居 = 本格 + DIR_VEC[方位]，无方位时默认 +X
 *   4 剩余（无坐标无邻居）从包围盒下方起、按 sqrt 方阵换行流式安置
 *   5 全流程走 nearestFree 消撞：目标格被占就螺旋外扩找最近空格，绝不叠格
 *
 * 与 geoTracker 的分工（否定式边界）
 *   1 本引擎不出米数、不算跨域距离。geoTracker 那条全局网格保持原样，两者并存。
 *   2 撞点不拒收而是消解（真机制是宽松推导 + 就近安置），仅计数 collisions。
 *   3 坐标可留空，不臆造；留空者进入推导或流式安置，如实计 unpositioned。
 *   4 相邻边对称补边仅补「无方位」的反向边；显式标了单向的通道（消防门/单行楼梯）保留单向。
 *   5 默认关闭（enabled:false），与 atlas / region 一致，必须显式开启。
 *   6 不删除已登记项。容量有界且挤出走 WA.evict 单一出口。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.521.0';
  const LS_KEY = 'worldaxis_local_grid_settings_v1';
  const DEF = {
    enabled: false,
    maxSpots: 600,
    maxLinks: 1200,
    maxVenues: 128,
    maxZones: 512,
    gridRadius: 6,
    feedMode: 'all',
    // v2.521.0：预热预算（平面数）。默认 0 = 关闭 —— 与全家默认关闭同一条纪律。
    //   打开后 preheat() 会按「点位最多的场所优先」把前 N 个平面求解一遍，
    //   让面板的虚线格变实线；上界 64，防止把一处大宅院的全部分层算到卡顿。
    preheatMax: 0
  };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'localGrid',
    bounds: {
      maxSpots: [16, 4000], maxLinks: [16, 8000],
      maxVenues: [8, 512], maxZones: [8, 2048], gridRadius: [1, 24],
      preheatMax: [0, 64]
    }
  };
  function settings() {
    if (WA.settingsBus && WA.settingsBus.read) {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
        : Object.assign({}, DEF, raw || {});
    }
    return Object.assign({}, DEF);
  }
  function saveSettings(next) {
    if (WA.settingsBus && WA.settingsBus.saveOrThrow) {
      return WA.settingsBus.saveOrThrow(__REG,
        WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), next || {})));
    }
    return Object.assign({}, DEF, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const DIR_VEC = {
    'east': [1, 0], 'west': [-1, 0], 'north': [0, -1], 'south': [0, 1],
    'east-north': [1, -1], 'east-south': [1, 1], 'west-north': [-1, -1], 'west-south': [-1, 1]
  };
  const DIR_ALIAS = {
    e: 'east', east: 'east', 'east-side': 'east',
    w: 'west', west: 'west', 'west-side': 'west',
    n: 'north', north: 'north', 'north-side': 'north',
    s: 'south', south: 'south', 'south-side': 'south',
    ne: 'east-north', en: 'east-north', 'east-north': 'east-north', 'northeast': 'east-north',
    nw: 'west-north', wn: 'west-north', 'west-north': 'west-north', 'northwest': 'west-north',
    se: 'east-south', es: 'east-south', 'east-south': 'east-south', 'southeast': 'east-south',
    sw: 'west-south', ws: 'west-south', 'west-south': 'west-south', 'southwest': 'west-south'
  };
  const stat = {
    venues: 0, zones: 0, spots: 0, links: 0,
    //   adjDeclared：素材/调用方用 spot.adj 直接点名的相邻关系条数（不含显式 link）。
    //   为什么单列一项：素材（世界书导入表）几乎只用「相邻地点」字段，一条 link 都不调；
    //   面板原来只报 links，于是图上画着 40 条边、读数写「连线 0」—— 读数与图不一致
    //   就是谎报。两项分开报，谁也不覆盖谁（显式 link 可以带方位、adj 声明可能不带）。
    adjDeclared: 0,
    solved: 0, computed: 0, streamed: 0,
    collisions: 0, crossZone: 0, crossVenue: 0,
    unpositioned: 0, imported: 0, lastReason: '', faults: {}
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
  function num(v) {
    const n = Number(v);
    return (typeof n === 'number' && isFinite(n) && Math.abs(n) < 1e6) ? n : null;
  }
  function normDir(d) {
    if (!d) return null;
    const k = String(d).trim().toLowerCase().replace(/[\s_]+/g, '-');
    return DIR_ALIAS[k] || (DIR_VEC[k] ? k : null);
  }
  function state() {
    try { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
    catch (e) { return {}; }
  }
  function emptyRoot() {
    return { venues: {}, zones: {}, spots: {}, links: [], overrides: {}, solved: {} };
  }
  function root(s) {
    const c = (s || state()).localGrid;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return emptyRoot();
    if (!c.venues) c.venues = {};
    if (!c.zones) c.zones = {};
    if (!c.spots) c.spots = {};
    if (!c.links) c.links = [];
    if (!c.overrides) c.overrides = {};
    if (!c.solved) c.solved = {};
    return c;
  }
  function zoneKey(venue, zone) { return venue + '\u0001' + zone; }
  function spotKey(venue, zone, name) { return venue + '\u0001' + zone + '\u0001' + name; }
  function normAdj(list) {
    if (list == null) return [];
    const arr = Array.isArray(list) ? list : String(list).split(/[;,、，\n]+/);
    const out = [];
    for (var i = 0; i < arr.length && out.length < 24; i++) {
      const e = arr[i];
      if (e == null) continue;
      const nm = clean((e && e.name) ? e.name : e, 80);
      if (nm === "") continue;
      const dd = (e && e.dir) ? normDir(e.dir) : null;
      if (out.some(function (o) { return o.name === nm; })) continue;
      out.push({ name: nm, dir: dd });
    }
    return out;
  }
  /** 链接引擎的壁钟取数口（G20 纪律：产品代码零裸调 `Date.now()`）。
   *  为什么要变成一个守卫而不是直接写 `WA.clock.now(...)`：本模块在演示/单测里会被装载进只有部分核心模块的沙箱，
   *  clock 缺席时直写会报错；而「时间读不到就不能登记点位」是一个比错误更坏的结果。
   *  catch 里的壁钟与守卫同行共现，是 G20 判据的硬要求。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  function enabled() { return !!settings().enabled; }
  function guardCap(list, cap, label) {
    while (list.length > cap) {
      const dropped = list.shift();
      stat.lastReason = label + '-evict';
      if (WA.evict && WA.evict.note) { try { WA.evict.note(label, dropped); } catch (e) {} }
    }
  }

  // -- 场所 venue --
  function registerVenue(def) {
    if (!enabled()) return fault('disabled');
    const d = def || {};
    const name = clean(d.name || d.venue, 40);
    if (!name) return fault('missing-venue');
    const cfg = settings();
    const lg = root();
    if (!lg.venues[name] && Object.keys(lg.venues).length >= cfg.maxVenues) return fault('venues-full');
    const rec = {
      name: name,
      region: clean(d.region, 40),
      note: clean(d.note, 200),
      at: clockNow('localGrid.register')
    };
    if (WA.store && WA.store.transact) {
      try {
        WA.store.transact(function (draft) {
          const c = (draft.localGrid = draft.localGrid || emptyRoot());
          c.venues = c.venues || {};
          c.venues[name] = rec;
        });
      } catch (e) { return fault('store-threw'); }
    } else return fault('store-unavailable');
    stat.venues = Object.keys(root().venues).length;
    return { ok: true, venue: name, region: rec.region };
  }

  // -- 区域 zone（场所内的一个独立平面，各自有自己的原点） --
  function registerZone(def) {
    if (!enabled()) return fault('disabled');
    const d = def || {};
    const venue = clean(d.venue, 40);
    const zone = clean(d.zone, 40);
    if (!venue) return fault('missing-venue');
    if (!zone) return fault('missing-zone');
    if (venue === zone) return fault('self-zone');
    const lg = root();
    if (!lg.venues[venue]) return fault('unknown-venue');
    const cfg = settings();
    const k = zoneKey(venue, zone);
    if (!lg.zones[k] && Object.keys(lg.zones).length >= cfg.maxZones) return fault('zones-full');
    const rec = {
      venue: venue, zone: zone,
      label: clean(d.label || zone, 60),
      floor: clean(d.floor, 20),
      note: clean(d.note, 200),
      at: clockNow('localGrid.register')
    };
    if (WA.store && WA.store.transact) {
      try {
        WA.store.transact(function (draft) {
          const c = (draft.localGrid = draft.localGrid || emptyRoot());
          c.zones = c.zones || {};
          c.zones[k] = rec;
        });
      } catch (e) { return fault('store-threw'); }
    } else return fault('store-unavailable');
    stat.zones = Object.keys(root().zones).length;
    return { ok: true, venue: venue, zone: zone };
  }

  // -- 地点 spot --
  function registerSpot(def) {
    if (!enabled()) return fault('disabled');
    const d = def || {};
    const venue = clean(d.venue, 40);
    const zone = clean(d.zone, 40);
    const name = clean(d.name, 80);
    if (!venue) return fault('missing-venue');
    if (!zone) return fault('missing-zone');
    if (!name) return fault('missing-name');
    const lg = root();
    if (!lg.venues[venue]) return fault('unknown-venue');
    if (!lg.zones[zoneKey(venue, zone)]) return fault('unknown-zone');
    const cfg = settings();
    const k = spotKey(venue, zone, name);
    const exist = lg.spots[k];
    if (!exist && Object.keys(lg.spots).length >= cfg.maxSpots) return fault('spots-full');
    // 坐标：两项都给了才算显式坐标，否则留空交给求解器（不臆造）
    const x = num(d.x), y = num(d.y);
    const positioned = (x !== null && y !== null);
    if (!positioned && !exist) stat.unpositioned++;
    const rec = {
      venue: venue, zone: zone, name: name,
      x: positioned ? x : null,
      y: positioned ? y : null,
      explicit: positioned,
      desc: clean(d.desc, 240),
      kind: clean(d.kind, 24),
      note: clean(d.note, 200),
      adj: normAdj(d.adj),
      at: clockNow('localGrid.register')
    };
    // 同一 zone 已求解过的，登记后作废缓存，下次读取重算
    const zk = zoneKey(venue, zone);
    if (WA.store && WA.store.transact) {
      try {
        WA.store.transact(function (draft) {
          const c = (draft.localGrid = draft.localGrid || emptyRoot());
          c.spots = c.spots || {}; c.spots[k] = rec;
          c.solved = c.solved || {}; delete c.solved[zk];
        });
      } catch (e) { return fault('store-threw'); }
    } else return fault('store-unavailable');
    stat.spots = Object.keys(root().spots).length;
    // 相邻声明记账：换掉旧值再累加（同一 spot 重登记不该把它算两遍）
    const prevAdj = (exist && exist.adj) ? exist.adj.length : 0;
    stat.adjDeclared = Math.max(0, (stat.adjDeclared || 0) - prevAdj + rec.adj.length);
    // 显式坐标撞点：不拒收，但记一笔。留给求解器消解。
    if (positioned) {
      const holders = zoneSpots(root(), venue, zone).filter(function (o) {
        return o.name !== name && o.x === x && o.y === y;
      });
      if (holders.length) {
        stat.collisions++;
        return { ok: true, venue: venue, zone: zone, spot: name, positioned: true,
                 collision: true, holders: holders.map(function (o) { return o.name; }) };
      }
    }
    return { ok: true, venue: venue, zone: zone, spot: name, positioned: positioned };
  }

  function zoneSpots(lg, venue, zone) {
    const out = [];
    const keys = Object.keys((lg || {}).spots || {});
    for (let i = 0; i < keys.length; i++) {
      const s = lg.spots[keys[i]];
      if (s && s.venue === venue && s.zone === zone) out.push(s);
    }
    out.sort(function (a, b) { return (a.at - b.at) || String(a.name).localeCompare(String(b.name)); });
    return out;
  }

  // -- 相邻边 link --
  // bidirectional !== false 时补反向；显式 bidirectional:false 保留单向（消防门/单行楼梯是真实结构）
  function link(a, b, opt) {
    if (!enabled()) return fault('disabled');
    const o = opt || {};
    const A = clean(a, 80), B = clean(b, 80);
    if (!A || !B) return fault('missing-endpoint');
    if (A === B) return fault('self-link');
    const lg = root();
    const cfg = settings();
    const dir = normDir(o.dir);
    const bidir = (o.bidirectional === false) ? false : true;
    if (lg.links.length + (bidir ? 2 : 1) > cfg.maxLinks) return fault('links-full');
    const kind = clean(o.kind, 24);
    const note = clean(o.note, 120);
    const now = clockNow('localGrid.solve');
    var pushed = 0;
    if (WA.store && WA.store.transact) {
      try {
        WA.store.transact(function (draft) {
          const c = (draft.localGrid = draft.localGrid || emptyRoot());
          c.links = c.links || [];
          function add(frRef, toRef, d) {
            for (var i = 0; i < c.links.length; i++) {
              var L = c.links[i];
              if (L.from === frRef && L.to === toRef) return false;
            }
            c.links.push({ from: frRef, to: toRef, dir: d || null, kind: kind, note: note, at: now });
            return true;
          }
          if (add(A, B, dir)) pushed++;
          if (bidir) {
            var opp = dir ? (OPPOSITE[dir] || null) : null;
            if (add(B, A, opp)) pushed++;
          }
          // 作废涉及这两个地点的 zone 求解缓存
          c.solved = c.solved || {};
          Object.keys(c.solved).forEach(function (k) {
            if (String(k).indexOf(A) >= 0 || String(k).indexOf(B) >= 0) delete c.solved[k];
          });
        });
      } catch (e) { return fault('store-threw'); }
    } else return fault('store-unavailable');
    stat.links = root().links.length;
    return { ok: true, added: pushed, bidirectional: bidir, from: A, to: B, dir: dir };
  }

  const OPPOSITE = {
    'east': 'west', 'west': 'east', 'north': 'south', 'south': 'north',
    'east-north': 'west-south', 'west-south': 'east-north',
    'east-south': 'west-north', 'west-north': 'east-south'
  };

  function linked(a, b) {
    const A = clean(a, 80), B = clean(b, 80);
    const lg = root();
    const out = { fwd: false, back: false, dir: null, kind: '', note: '' };
    for (var i = 0; i < lg.links.length; i++) {
      var L = lg.links[i];
      if (L.from === A && L.to === B) { out.fwd = true; out.dir = L.dir || out.dir; out.kind = L.kind || out.kind; out.note = L.note || out.note; }
      else if (L.from === B && L.to === A) out.back = true;
    }
    out.state = out.fwd && out.back ? 'both' : (out.fwd ? 'oneway' : (out.back ? 'reverse' : 'none'));
    return out;
  }

  // ================= 核心：区域平面求解器 =================
  // 把一个 zone 内的所有 spot 排到局部网格上。每个 zone 独立调用，互不共享坐标系。
  // 优先级：override > 显式坐标 > BFS 方位推导 > 流式方阵；全程 nearestFree 消撞。

  function cellKey(x, y) { return x + ',' + y; }

  // 目标格被占则螺旋外扩找最近空格（切比雪夫环，逐环由近到远）
  function nearestFree(occupied, x, y, radius) {
    if (!occupied[cellKey(x, y)]) return { x: x, y: y, moved: 0 };
    const R = Math.max(1, radius || 6);
    for (let r = 1; r <= R; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (!occupied[cellKey(nx, ny)]) return { x: nx, y: ny, moved: r };
        }
      }
    }
    return { x: x + R + 1, y: y, moved: R + 1 };
  }

  // 生成 zone 内的相邻图：显式 link + spot.adj 里点名的邻居
  function buildAdjacency(lg, venue, zone, spots) {
    const byName = {};
    for (let i = 0; i < spots.length; i++) byName[spots[i].name] = spots[i];
    const adj = {};
    function ensure(n) { if (!adj[n]) adj[n] = []; return adj[n]; }
    for (let i = 0; i < spots.length; i++) ensure(spots[i].name);
    // 1 显式 link（只取本 zone 内的端点；跨 zone 的边不参与本平面求解）
    for (let i = 0; i < lg.links.length; i++) {
      const L = lg.links[i];
      if (!byName[L.from] || !byName[L.to]) continue;
      // 双向登记：正向用本体方位，反向用对向方位（从任一端都能推导另一端）
      const dd = L.dir ? normDir(L.dir) : null;
      const back = dd ? (OPPOSITE[dd] || null) : null;
      ensure(L.from).push({ name: L.to, dir: dd });
      ensure(L.to).push({ name: L.from, dir: back });
    }
    // 2 spot.adj 声明（[{name,dir}] 或纯名字数组；未在本 zone 的忽略）
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i], list = s.adj || [];
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        const nm = (e && e.name) ? e.name : e;
        if (!nm || !byName[nm] || nm === s.name) continue;
        const dd = e && e.dir ? normDir(e.dir) : null;
        const bucket = ensure(s.name);
        if (!bucket.some(function (o) { return o.name === nm; })) bucket.push({ name: nm, dir: dd });
        // 反向：无方位就 null，有方位就取对向（301 说走廊在西 -> 走廊看 301 在东）
        const rdd = dd ? (OPPOSITE[dd] || null) : null;
        const back = ensure(nm);
        if (!back.some(function (o) { return o.name === s.name; })) back.push({ name: s.name, dir: rdd });
      }
    }
    return adj;
  }

  // 求解一个 zone 的平面布局，返回 { venue, zone, cells:{name:{x,y}}, edges:[[a,b]], moved, anchored }
  function solveZone(venue, zone, opt) {
    const cfg = settings();
    const lg = root();
    const R = (opt && opt.radius) || cfg.gridRadius || 6;
    const spots = zoneSpots(lg, venue, zone);
    const result = { venue: venue, zone: zone, cells: {}, edges: [], moved: 0, anchored: 0, streamed: 0, total: spots.length };
    if (!spots.length) return result;

    const adj = buildAdjacency(lg, venue, zone, spots);

    // 边列表去重（无向展示用；有向边原样只出现一次）
    const edgeSeen = {};
    for (let i = 0; i < spots.length; i++) {
      const nm = spots[i].name;
      const list = adj[nm] || [];
      for (let j = 0; j < list.length; j++) {
        const t = list[j].name;
        const k = String(nm) < String(t) ? nm + '|' + t : t + '|' + nm;
        if (!edgeSeen[k]) { edgeSeen[k] = 1; result.edges.push([nm, t]); }
      }
    }

    const occupied = {};
    const pos = {};
    function place(name, x, y) {
      const p = nearestFree(occupied, x, y, R);
      if (p.moved) result.moved++;
      occupied[cellKey(p.x, p.y)] = name;
      pos[name] = { x: p.x, y: p.y };
    }

    // 1 手动覆盖
    const ov = (lg.overrides || {})[zoneKey(venue, zone)] || {};
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i], o = ov[s.name];
      if (o && num(o.x) !== null && num(o.y) !== null) { place(s.name, num(o.x), num(o.y)); result.anchored++; }
    }
    // 2 显式坐标
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      if (pos[s.name]) continue;
      if (s.explicit && num(s.x) !== null && num(s.y) !== null) { place(s.name, num(s.x), num(s.y)); result.anchored++; }
    }

    // 3 BFS 方位推导：已定位 -> 邻居按 DIR_VEC 偏移；无方位默认 +X
    let progressed = true;
    let rounds = 0;
    while (progressed && rounds++ < 64) {
      progressed = false;
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i], rp = pos[s.name];
        if (!rp) continue;
        const list = adj[s.name] || [];
        for (let j = 0; j < list.length; j++) {
          const e = list[j];
          if (pos[e.name]) continue;
          const v = e.dir ? DIR_VEC[e.dir] : null;
          const tx = v ? rp.x + v[0] : rp.x + 1;
          const ty = v ? rp.y + v[1] : rp.y;
          place(e.name, tx, ty);
          progressed = true;
        }
      }
      // 完全没有锚点时，以登记顺序第一个为原点起步
      if (!progressed && Object.keys(pos).length === 0) {
        place(spots[0].name, 0, 0);
        progressed = true;
      }
    }

    // 4 剩余（无坐标无邻居）：从包围盒下方起按方阵换行流式安置
    const rest = spots.filter(function (s) { return !pos[s.name]; });
    if (rest.length) {
      let maxY = 0, minX = 0;
      const keys = Object.keys(pos);
      if (keys.length) {
        maxY = -Infinity; minX = Infinity;
        for (let i = 0; i < keys.length; i++) {
          const p = pos[keys[i]];
          if (p.y > maxY) maxY = p.y;
          if (p.x < minX) minX = p.x;
        }
      }
      const startY = keys.length ? maxY + 1 : 0;
      const startX = keys.length ? minX : 0;
      const cols = Math.max(2, Math.ceil(Math.sqrt(rest.length)));
      for (let i = 0; i < rest.length; i++) {
        const cx = startX + (i % cols);
        const cy = startY + Math.floor(i / cols);
        place(rest[i].name, cx, cy);
      }
      result.streamed = rest.length;
    }

    result.cells = pos;
    result.solvedAt = clockNow('localGrid.solved');
    return result;
  }

  // ================= 读取面 =================
  // 取一个 zone 的平面（带缓存；登记/连线会作废对应缓存）
  function getZone(venue, zone, opt) {
    const V = clean(venue, 40), Z = clean(zone, 40);
    if (!V || !Z) return { ok: false, reason: 'missing-zone' };
    const lg = root();
    if (!lg.venues[V]) return { ok: false, reason: 'unknown-venue' };
    if (!lg.zones[zoneKey(V, Z)]) return { ok: false, reason: 'unknown-zone' };
    const zk = zoneKey(V, Z);
    const useCache = !(opt && opt.fresh);
    const cached = (lg.solved || {})[zk];
    let plan;
    if (useCache && cached && cached.cells) {
      plan = cached;
      stat.cacheHits = (stat.cacheHits || 0) + 1;
    } else {
      plan = solveZone(V, Z, opt);
      stat.solved++;
      try {
        if (WA.store && WA.store.transact) {
          WA.store.transact(function (draft) {
            const c = (draft.localGrid = draft.localGrid || emptyRoot());
            c.solved = c.solved || {}; c.solved[zk] = plan;
          });
        }
      } catch (e) { /* 缓存写失败不影响返回 */ }
    }
    const rec = lg.zones[zk];
    const out = {
      ok: true, venue: V, zone: Z, label: rec.label, floor: rec.floor,
      cells: plan.cells, edges: plan.edges || [],
      total: plan.total, moved: plan.moved, anchored: plan.anchored, streamed: plan.streamed
    };
    // 附上每个格子的地点详情，便于渲染
    const spots = zoneSpots(lg, V, Z);
    out.spots = spots.map(function (s) {
      const p = plan.cells[s.name] || null;
      return { name: s.name, x: p ? p.x : null, y: p ? p.y : null, desc: s.desc, kind: s.kind, explicit: !!s.explicit };
    });
    return out;
  }

  // 只读平面取数：**不求解、不写 store**。
  //   为什么必须有这一条：getZone 在缓存缺失时会 solveZone 并把结果 transact 进
  //   `localGrid.solved` —— 对「面板只读」是禁字（面板每次重绘都触发一次世界写，
  //   还会把用户没看过的平面全算一遍）。peekVenue 只读已有缓存，无缓存则退回素材
  //   显式坐标并标 source:'raw'，**不猜**邻接边（无缓存就没有 edges）。
  //   返回结构与 getZone 同族，但多一个 source 字段区分「求解结果 / 素材原始网格」。
  function peekVenue(venue) {
    const V = clean(venue, 40);
    if (!V) return { ok: false, reason: 'missing-venue' };
    const lg = root();
    if (!lg.venues[V]) return { ok: false, reason: 'unknown-venue' };
    const solved = lg.solved || {};
    const zones = [];
    const keys = Object.keys(lg.zones);
    for (let i = 0; i < keys.length; i++) {
      const z = lg.zones[keys[i]];
      if (!z || z.venue !== V) continue;
      const plan = solved[zoneKey(V, z.zone)] || null;
      const spots = zoneSpots(lg, V, z.zone);
      const cells = {};
      for (let j = 0; j < spots.length; j++) {
        const s = spots[j];
        const p = (plan && plan.cells) ? plan.cells[s.name] : null;
        if (p && typeof p.x === 'number' && typeof p.y === 'number') cells[s.name] = { x: p.x, y: p.y, src: 'solved' };
        else if (typeof s.x === 'number' && typeof s.y === 'number') cells[s.name] = { x: s.x, y: s.y, src: 'raw' };
      }
      zones.push({
        zone: z.zone, label: z.label, floor: z.floor,
        source: plan ? 'solved' : 'raw',
        total: spots.length, placed: Object.keys(cells).length,
        cells: cells, edges: plan ? (plan.edges || []) : []
      });
    }
    zones.sort(function (a, b) {
      return String(a.floor || '').localeCompare(String(b.floor || '')) || String(a.zone).localeCompare(String(b.zone));
    });
    return { ok: true, venue: V, region: lg.venues[V].region, zones: zones };
  }
  // 一个场所下所有 zone 的平面总览（各 zone 独立坐标系，不含跨 zone 距离）
  function getVenue(venue) {
    const V = clean(venue, 40);
    if (!V) return { ok: false, reason: 'missing-venue' };
    const lg = root();
    if (!lg.venues[V]) return { ok: false, reason: 'unknown-venue' };
    const zones = [];
    const keys = Object.keys(lg.zones);
    for (let i = 0; i < keys.length; i++) {
      const z = lg.zones[keys[i]];
      if (!z || z.venue !== V) continue;
      const plan = getZone(V, z.zone);
      zones.push({ zone: z.zone, label: z.label, floor: z.floor, total: plan.total, spots: plan.spots, edges: plan.edges });
    }
    zones.sort(function (a, b) { return String(a.floor || '').localeCompare(String(b.floor || '')) || String(a.zone).localeCompare(String(b.zone)); });
    return { ok: true, venue: V, region: lg.venues[V].region, zones: zones };
  }

  // ================= 同域方位判定（跨域绝不换算） =================
  // 只在同一 zone 内比较坐标；跨 zone / 跨 venue 一律返回 cross-*，不给距离。
  function locateOf(venue, zone, name) {
    const V = clean(venue, 40), Z = clean(zone, 40), N = clean(name, 80);
    if (!V || !Z || !N) return { ok: false, reason: 'missing-name' };
    const plan = getZone(V, Z);
    if (!plan.ok) return plan;
    const p = plan.cells[N];
    if (!p) return { ok: false, reason: 'unknown-spot' };
    return { ok: true, venue: V, zone: Z, spot: N, x: p.x, y: p.y };
  }

  function dirOf(dx, dy) {
    const ns = dy < 0 ? 'north' : (dy > 0 ? 'south' : '');
    const ew = dx > 0 ? 'east' : (dx < 0 ? 'west' : '');
    if (ns && ew) return ew + '-' + ns;
    return ns || ew || '';
  }

  // 同一 zone 内 from -> to 的相对方位与格距；跨域返回拒绝码
  // 判定层：两个**已知坐标**的端点之间的方位与格数。
  //   抽出来的理由：同一套判定要供两条取数路径用 ——
  //     · relate()     用 locateOf（内部 getZone，**会求解并写缓存**）
  //     · relatePeek() 用 peekVenue（**只读**，无缓存时拒绝，绝不制造写入）
  //   判定逻辑只有一份，否则「东/西」迟早有两套答案（本仓反复治理的那类第二真源）。
  function relJudge(av, az, an, pa, bv, bz, bn, pb) {
    if (an === bn) {
      return { ok: true, same: true, venue: av, zone: az, from: an, to: bn, dx: 0, dy: 0, steps: 0, dir: '', text: '同一地点' };
    }
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    const dir = dirOf(dx, dy);
    const DIR_CN = {
      east: '东', west: '西', north: '北', south: '南',
      'east-north': '东北', 'east-south': '东南', 'west-north': '西北', 'west-south': '西南'
    };
    const cn = DIR_CN[dir] || '';
    const text = steps <= 1
      ? '紧邻（' + cn + '侧）'
      : cn + '方向约 ' + steps + ' 格';
    return { ok: true, same: false, venue: av, zone: az, from: an, to: bn, dx: dx, dy: dy, steps: steps, dir: dir, text: text };
  }
  function relate(fromRef, toRef) {
    const a = fromRef || {}, b = toRef || {};
    const av = clean(a.venue, 40), az = clean(a.zone, 40), an = clean(a.name || a.spot, 80);
    const bv = clean(b.venue, 40), bz = clean(b.zone, 40), bn = clean(b.name || b.spot, 80);
    if (!av || !az || !an) return fault('missing-endpoint');
    if (!bv || !bz || !bn) return fault('missing-endpoint');
    if (av !== bv) { stat.crossVenue++; return { ok: false, reason: 'cross-venue', fromVenue: av, toVenue: bv, distance: null }; }
    if (az !== bz) { stat.crossZone++; return { ok: false, reason: 'cross-zone', fromZone: az, toZone: bz, distance: null }; }
    const pa = locateOf(av, az, an);
    if (!pa.ok) return pa;
    const pb = locateOf(bv, bz, bn);
    if (!pb.ok) return pb;
    return relJudge(av, az, an, pa, bv, bz, bn, pb);
  }
  // 只读版：坐标只从**已求解缓存**取（peekVenue），不求解、不写。
  //   为什么要这一条：面板与提示词每轮都会问「谁在我旁边」，若每次都走 relate，
  //   就等于每轮把世界写一遍 —— 而那条路正是 getZone 的缓存写。
  //   跨域拒绝口径与 relate 完全一致（同一份 judge、同一组计数器）。
  function cellOf(venue, zone, name) {
    const pk = peekVenue(venue);
    if (!pk || !pk.ok) return { ok: false, reason: (pk && pk.reason) || 'unknown-venue' };
    let z = null;
    for (let i = 0; i < (pk.zones || []).length; i++) {
      if (pk.zones[i].zone === zone) { z = pk.zones[i]; break; }
    }
    if (!z) return { ok: false, reason: 'unknown-zone' };
    if (z.source !== 'solved') return { ok: false, reason: 'zone-unsolved' };
    const c = z.cells ? z.cells[name] : null;
    if (!c) return { ok: false, reason: 'unknown-spot' };
    return { ok: true, venue: venue, zone: zone, spot: name, x: c.x, y: c.y };
  }
  function relatePeek(fromRef, toRef) {
    const a = fromRef || {}, b = toRef || {};
    const av = clean(a.venue, 40), az = clean(a.zone, 40), an = clean(a.name || a.spot, 80);
    const bv = clean(b.venue, 40), bz = clean(b.zone, 40), bn = clean(b.name || b.spot, 80);
    if (!av || !az || !an) return fault('missing-endpoint');
    if (!bv || !bz || !bn) return fault('missing-endpoint');
    if (av !== bv) { stat.crossVenue++; return { ok: false, reason: 'cross-venue', fromVenue: av, toVenue: bv, distance: null }; }
    if (az !== bz) { stat.crossZone++; return { ok: false, reason: 'cross-zone', fromZone: az, toZone: bz, distance: null }; }
    const pa = cellOf(av, az, an);
    if (!pa.ok) return pa;
    const pb = cellOf(bv, bz, bn);
    if (!pb.ok) return pb;
    return relJudge(av, az, an, pa, bv, bz, bn, pb);
  }
  // ================= 提示词注入面 =================
  // 只喂同域方位，绝不喂跨域距离（这是 geoTracker 的病根）
  function buildBlock(ctx) {
    const cfg = settings();
    if (!cfg.enabled) return '';
    if (cfg.feedMode === 'off') return '';
    const c = ctx || {};
    const lines = [];
    const venue = clean(c.venue, 40), zone = clean(c.zone, 40);
    if (venue && zone) {
      const plan = getZone(venue, zone);
      if (plan.ok && plan.total) {
        const others = (plan.spots || []).filter(function (s) { return s.name !== c.spot && s.x !== null; });
        if (others.length) {
          const shown = others.slice(0, 8).map(function (s) { return s.name; }).join('、');
          lines.push('· 同在「' + venue + ' / ' + (plan.label || zone) + '」：' + shown + (others.length > 8 ? ' 等 ' + plan.total + ' 处' : ''));
        }
        if (c.spot) {
          const me = plan.cells[c.spot];
          if (me) {
            const near = [];
            for (let i = 0; i < others.length; i++) {
              const s = others[i];
              const st = Math.max(Math.abs(s.x - me.x), Math.abs(s.y - me.y));
              if (st <= 1) near.push(s.name);
            }
            if (near.length) lines.push('· 与你紧邻：' + near.join('、'));
          }
        }
      }
    }
    if (cfg.feedMode === 'all' && lines.length) return lines.join('\n');
    return cfg.feedMode === 'all' ? lines.join('\n') : '';
  }

  // ================= 自检 =================
  function selfCheck() {
    const cfg = settings();
    const lg = root();
    const out = {
      ok: true, enabled: !!cfg.enabled,
      venues: Object.keys(lg.venues || {}).length,
      zones: Object.keys(lg.zones || {}).length,
      spots: Object.keys(lg.spots || {}).length,
      links: (lg.links || []).length,
      issues: []
    };
    if (!cfg.enabled) out.issues.push('disabled');
    const keys = Object.keys(lg.spots || {});
    for (let i = 0; i < keys.length; i++) {
      const s = lg.spots[keys[i]];
      if (!lg.venues[s.venue]) out.issues.push('venue-missing:' + s.name);
      if (!lg.zones[zoneKey(s.venue, s.zone)]) out.issues.push('zone-missing:' + s.name);
      if (out.issues.length > 20) break;
    }
    if (out.issues.length) out.ok = false;
    return out;
  }

  function stats() { return Object.assign({}, stat, { version: VERSION }); }
  function reset() { stat.faults = {}; stat.lastReason = ''; return { ok: true }; }

  // ================= 预热：把面板的虚线格变实线 =================
  //   为什么必须有这一条：面板只读，只认 peekVenue（已求解缓存）。不预热的后果是
  //   图上永远是虚线格 —— 用户看不出「这栋楼 25 个点」到底铺开没有。
  //   为什么必须带上限：45 个场所 × 平均 3.5 个平面 = 158 次求解，全跑一遍是秒级卡顿，
  //   而且会把一大堆没人看的平面写进存档。故默认 0（关闭）、上界 64、只按
  //   「点位最多的场所优先」取前 N 个，**已有缓存不重算**。
  //   为什么不做成自动：写路径只该有一个入口。preheat 内部调的就是 getZone
  //   （任何读取都走那条路），本函数不另开写口 —— 它只是「显式地多读几次」。
  function preheat(limit) {
    if (!enabled()) return fault('disabled');
    const cfg = settings();
    const n = num(limit);
    const want = (n === null) ? (cfg.preheatMax || 0) : n;
    const budget = Math.max(0, Math.min(64, want));
    if (!budget) return { ok: true, warmed: 0, skipped: 'budget-0' };
    const lg = root();
    const solved = lg.solved || {};
    const byVenue = {};
    const sk = Object.keys(lg.spots || {});
    for (let i = 0; i < sk.length; i++) {
      const s = lg.spots[sk[i]];
      byVenue[s.venue] = (byVenue[s.venue] || 0) + 1;
    }
    const order = Object.keys(byVenue).sort(function (a, b) { return byVenue[b] - byVenue[a]; });
    const zkeys = Object.keys(lg.zones);
    let warmed = 0, skippedCached = 0, seen = 0;
    const plans = [];
    // 预算按**看过的平面数**计（seen），不按「解成功几个」计：
    //   若按 warmed 计，已缓存的平面不消耗预算，于是「再调一次 preheat(2)」会
    //   继续往后推进两个平面 —— 同一只手点两下就把预算翻倍，上限等于没有。
    for (let i = 0; i < order.length; i++) {
      if (seen >= budget) break;
      const V = order[i];
      for (let j = 0; j < zkeys.length; j++) {
        if (seen >= budget) break;
        const z = lg.zones[zkeys[j]];
        if (!z || z.venue !== V) continue;
        seen++;
        const zk = zoneKey(V, z.zone);
        if (solved[zk] && solved[zk].cells) { skippedCached++; continue; }
        const plan = getZone(V, z.zone);
        if (plan && plan.ok) { warmed++; if (plans.length < 8) plans.push(V + '/' + z.zone); }
      }
    }
    stat.preheated = (stat.preheated || 0) + warmed;
    return { ok: true, warmed: warmed, skippedCached: skippedCached, seen: seen, plans: plans };
  }
  // ================= 导出 =================
  WA.localGrid = {
    version: VERSION,
    settings: settings, saveSettings: saveSettings,
    registerVenue: registerVenue, registerZone: registerZone, registerSpot: registerSpot,
    link: link, linked: linked,
    getZone: getZone, getVenue: getVenue, peekVenue: peekVenue, locateOf: locateOf,
    relate: relate, relatePeek: relatePeek,
    solveZone: solveZone, preheat: preheat, buildBlock: buildBlock,
    selfCheck: selfCheck, stats: stats, reset: reset,
    _root: root, _zoneSpots: zoneSpots, _dirVec: DIR_VEC
  };

  // v2.521.0：补登记（此前本引擎没有 registerModule ⇒ 模块表/诊断面看不见它）。
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/local-grid.js', { kind: 'engine', ver: VERSION });
  }
  if (WA.__settingsRegs && WA.settingsBus && WA.settingsBus.normalize) {
    try { settings(); } catch (e) { /* 首次读取容错 */ }
  }
})();
