/**
 * WorldAxis engines/map-editor.js (v2.587.0) — MAP-3：地图编辑模型（把编辑器的「手上功夫」搬进引擎）
 *
 * ── 来源与取舍 ────────────────────────────────────────────────
 *   来源：jianghai_map_editor.html（单页地图编辑器：选择/移动、画街区、画道路、放 POI、
 *   拖白点改形状、贴合道路、撤销、检查冲突、导入导出、自动保存）。
 *
 *   搬什么：搬的是**它怎么改一张图**——
 *     · 一笔编辑把一个意图变成什么（拖框 ⇒ 矩形多边形；连点 ⇒ 折线；放点 ⇒ POI）；
 *     · 改坏了怎么发现（冲突检查）；
 *     · 改错了怎么回去（撤销必须回到**同一个字节**，不是「看上去差不多」）。
 *   不搬什么：不搬那张江城市图。搬地图只是多一份静态数据；搬编辑，底图才能在叙事里
 *     **被动过**——塌了一栋楼、划了一条封锁线、多了一个撤离点。
 *
 * ── 分工（三处只认一份文档）────────────────────────────────────
 *   本引擎：几何 / 图层 / 编辑操作 / 撤销环 / 冲突检查 / 导入导出信封（无 DOM）。
 *   render/map-viewport.js：只管把文档画成 SVG（它已能画面与线，本版给它喂文档）。
 *   engines/geo-tracker.js：只管「谁在哪」（它缺坐标时向本引擎 locate() 要）。
 *   缝合点只有一个：`exportJSON()` 产出的那份文档 —— 一份文档三处读，谁都不持有第二份真源。
 *
 * ── 纪律（都是本仓付过学费的）────────────────────────────────
 *   1. **不在装载期建索引**：id → 实体一律现场线性扫（v2.586 的 ITEM_INDEX 就是反例）。
 *   2. **失败不污染**：任何一次 apply 被拒 ⇒ version 不变、exportJSON() 逐字不变。
 *   3. **撤销可核**：undo 之后 exportJSON() 必须与编辑前**逐字相等**。
 *   4. **检查是纯函数**：check() 跑完文档逐字不变、version 不动（它不是一次编辑）。
 *   5. **id 单调不复用**：删了不回收编号（否则「删掉再放回来」会被当成同一个对象）。
 *   6. **选择不是文档状态**：选中态属 UI 临时态，不进文档、不耗一次撤销
 *      （进了文档，「点了一下」就变成了一次编辑）。
 *   7. **不猜单位**：世界坐标 → 米需要显式定标；未定标就报 null，不补 0（同 region.js 基准点的口径）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.588.0';
  const SETTING_KEY = 'worldaxis_map_editor_settings_v1';
  const FORMAT = 'worldaxis-map';
  const SCHEMA = 1;
  const LAYERS = ['terrains', 'regions', 'subs', 'pois', 'roads'];
  const POLY_LAYERS = ['terrains', 'regions', 'subs'];
  const ROAD_CLASSES = ['street', 'arterial', 'highway'];

  const DEFAULT_SETTINGS = {
    enabled: true,
    unitMeter: 0,      // 0 = 未定标（则 span 只报世界单位、米报 null，不猜）
    maxUndo: 24,
    maxVertices: 400,
    checkEps: 0.5      // 拓扑比较容差（世界单位）：相邻边界“贴合”不算重叠
  };
  const __REG = {
    key: SETTING_KEY, def: DEFAULT_SETTINGS, module: 'mapEditor',
    bounds: { unitMeter: [0, 2000], maxUndo: [0, 64], maxVertices: [8, 4000], checkEps: [0, 20] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (WA.settingsBus && WA.settingsBus.read) {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, Object.assign({}, DEFAULT_SETTINGS, raw || {}))
        : Object.assign({}, DEFAULT_SETTINGS, raw || {});
    }
    return Object.assign({}, DEFAULT_SETTINGS);
  }
  function saveSettings(next) {
    if (WA.settingsBus && WA.settingsBus.saveOrThrow) {
      return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))
        : Object.assign({}, settings(), next || {}));
    }
    return { ok: false, reason: 'no-bus' };
  }

  // ── 状态 ──────────────────────────────────────────────────────
  //   文档**只在内存里**：150KB 几何塞进 store 会让每次 transact 都过一遍深拷贝，
  //   而它本质是「底图」不是「进度」。要落盘就显式 exportJSON() 交宿主保存（同 data-only 的分层）。
  let DOC = null;
  const stat = { edits: 0, rejected: 0, undos: 0, checks: 0, imports: 0, reads: 0 };
  const faults = {};
  function noteFault(k) { faults[k] = (faults[k] || 0) + 1; }

  function clean(v, n) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, n || 80);
  }
  function num(v) { const n = Number(v); return isFinite(n) ? n : null; }
  function clone(v) { return v === null || v === undefined ? null : JSON.parse(JSON.stringify(v)); }

  // ── 几何原语（全是现场算，没有任何预建索引）──────────────────────
  function pip(pt, poly) {
    const x = pt[0], y = pt[1];
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function pointSegDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function edgeDist(p, poly) {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const q = poly[(i + 1) % poly.length];
      d = Math.min(d, pointSegDist(p, poly[i], q));
    }
    return d;
  }
  /** 严格在内：射线法命中 **且** 离边界足够远（容差内视为“贴在边界上”，不算重叠）。 */
  function strictlyInside(p, poly, eps) {
    if (!pip(p, poly)) return false;
    return edgeDist(p, poly) > (eps || 0);
  }
  function segCross(a1, a2, b1, b2) {
    const d = function (p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); };
    const d1 = d(b1, b2, a1), d2 = d(b1, b2, a2), d3 = d(a1, a2, b1), d4 = d(a1, a2, b2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function selfCross(poly) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (j === i || j === (i + 1) % n || i === (j + 1) % n) continue;
        if (segCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return [i, j];
      }
    }
    return null;
  }
  function areaOf(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }
  function centroidOf(poly) {
    let x = 0, y = 0;
    poly.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / poly.length, y / poly.length];
  }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function nearestOnPath(p, pts) {
    let best = { dist: Infinity, at: null, seg: -1 };
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const q = [a[0] + t * dx, a[1] + t * dy];
      const d = dist(p, q);
      if (d < best.dist) best = { dist: d, at: q, seg: i };
    }
    return best;
  }

  // ── 文档与实体定位（现场线性扫，不建索引）────────────────────────
  function doc() { return DOC; }
  function list(layer) { return (DOC && DOC.layers && Array.isArray(DOC.layers[layer])) ? DOC.layers[layer] : []; }
  function layerOf(id) {
    for (let i = 0; i < LAYERS.length; i++) {
      if (list(LAYERS[i]).some(function (x) { return x.id === id; })) return LAYERS[i];
    }
    return null;
  }
  function find(id) {
    const L = layerOf(id);
    if (!L) return null;
    const e = list(L).filter(function (x) { return x.id === id; })[0] || null;
    return e ? { layer: L, entity: e } : null;
  }
  function pointsOf(e) { return Array.isArray(e && e.points) ? e.points : null; }
  function vertsOf(e) {
    if (Array.isArray(e && e.points)) return e.points;
    if (e && typeof e.x === 'number' && typeof e.y === 'number') return [[e.x, e.y]];
    return [];
  }
  function nextId(d, layer) {
    // ⚠ 必须改**草稿**的 seq。闭包全局 DOC 会让草稿的 seq 停在旧值 ⇒ 每次新建都拿到同一个 id
    //   （现场踩到：两次 addRect 都返回 subs-616，而 id 唯一是撤销/选择面成立的前提）。
    d.meta.seq = (d.meta.seq || 0) + 1;
    return layer + '-' + d.meta.seq;
  }
  function blankDoc(w, h) {
    return {
      format: FORMAT, schema: SCHEMA, version: 1,
      width: w, height: h,
      meta: { seq: 0, source: 'new', name: '' },
      layers: { terrains: [], regions: [], subs: [], pois: [], roads: [] }
    };
  }

  // ── 编辑操作表 ────────────────────────────────────────────────
  //   每个 handler 拿一份**草稿**（已克隆）改它；成功才提交。失败丢弃草稿 —— 天然零污染。
  const OPS = {
    addPoly: function (d, op) {
      const layer = op.layer;
      if (POLY_LAYERS.indexOf(layer) < 0) return { ok: false, reason: 'bad-layer', allowed: POLY_LAYERS };
      const pts = normPoints(op.points, op.autoClose);
      if (!pts) return { ok: false, reason: 'bad-points' };
      if (pts.length < 3) return { ok: false, reason: 'need-3-points', got: pts.length };
      if (pts.length > settings().maxVertices) return { ok: false, reason: 'too-many-points', cap: settings().maxVertices };
      if (areaOf(pts) <= 0) return { ok: false, reason: 'degenerate' };
      const id = nextId(d, layer);
      d.layers[layer].push({ id: id, name: clean(op.name, 60), type: clean(op.type, 24) || 'block', points: pts, color: clean(op.color, 12) || '' });
      return { ok: true, id: id, layer: layer, vertices: pts.length, area: Math.round(areaOf(pts)) };
    },
    addRect: function (d, op) {
      const layer = op.layer;
      if (POLY_LAYERS.indexOf(layer) < 0) return { ok: false, reason: 'bad-layer', allowed: POLY_LAYERS };
      const x = num(op.x), y = num(op.y), w = num(op.w), h = num(op.h);
      if (x === null || y === null || w === null || h === null) return { ok: false, reason: 'missing-fields' };
      if (!(w > 0) || !(h > 0)) return { ok: false, reason: 'bad-size', w: w, h: h };
      const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      const id = nextId(d, layer);
      d.layers[layer].push({ id: id, name: clean(op.name, 60), type: clean(op.type, 24) || 'block', points: pts, color: clean(op.color, 12) || '' });
      return { ok: true, id: id, layer: layer, vertices: 4, area: Math.round(w * h) };
    },
    addRoad: function (d, op) {
      const pts = normPoints(op.points);
      if (!pts) return { ok: false, reason: 'bad-points' };
      if (pts.length < 2) return { ok: false, reason: 'need-2-points', got: pts.length };
      const w = num(op.width) === null ? 8 : num(op.width);
      if (!(w > 0)) return { ok: false, reason: 'bad-width' };
      const cls = clean(op.class, 20) || 'street';
      if (ROAD_CLASSES.indexOf(cls) < 0) return { ok: false, reason: 'bad-class', allowed: ROAD_CLASSES };
      const id = nextId(d, 'roads');
      d.layers.roads.push({ id: id, name: clean(op.name, 60), class: cls, width: w, points: pts });
      return { ok: true, id: id, layer: 'roads', vertices: pts.length, width: w };
    },
    addPoi: function (d, op) {
      const x = num(op.x), y = num(op.y);
      if (x === null || y === null) return { ok: false, reason: 'missing-fields' };
      const name = clean(op.name, 60);
      if (!name) return { ok: false, reason: 'missing-name' };
      const id = nextId(d, 'pois');
      d.layers.pois.push({ id: id, name: name, type: clean(op.type, 24) || 'poi', x: x, y: y, desc: clean(op.desc, 160) });
      return { ok: true, id: id, layer: 'pois', x: x, y: y };
    },
    move: function (d, op) {
      const hit = locateIn(d, op.id);
      if (!hit) return { ok: false, reason: 'no-such-entity', id: op.id };
      const dx = num(op.dx), dy = num(op.dy);
      if (dx === null || dy === null) return { ok: false, reason: 'missing-fields' };
      if (dx === 0 && dy === 0) return { ok: false, reason: 'noop' };
      const e = hit.entity;
      if (Array.isArray(e.points)) e.points = e.points.map(function (p) { return [p[0] + dx, p[1] + dy]; });
      else { e.x += dx; e.y += dy; }
      return { ok: true, id: e.id, layer: hit.layer, dx: dx, dy: dy };
    },
    setVertex: function (d, op) {
      const hit = locateIn(d, op.id);
      if (!hit) return { ok: false, reason: 'no-such-entity', id: op.id };
      const pts = hit.entity.points;
      if (!Array.isArray(pts)) return { ok: false, reason: 'not-a-path' };
      const i = num(op.index);
      if (i === null || i < 0 || i >= pts.length) return { ok: false, reason: 'bad-index', len: pts.length };
      const p = numPair(op.pt);
      if (!p) return { ok: false, reason: 'bad-points' };
      pts[i] = p;
      if (POLY_LAYERS.indexOf(hit.layer) >= 0 && areaOf(pts) <= 0) return { ok: false, reason: 'degenerate' };
      return { ok: true, id: hit.entity.id, layer: hit.layer, index: i };
    },
    insertVertex: function (d, op) {
      const hit = locateIn(d, op.id);
      if (!hit) return { ok: false, reason: 'no-such-entity', id: op.id };
      const pts = hit.entity.points;
      if (!Array.isArray(pts)) return { ok: false, reason: 'not-a-path' };
      const i = num(op.index);
      if (i === null || i < 0 || i > pts.length) return { ok: false, reason: 'bad-index', len: pts.length };
      const p = numPair(op.pt);
      if (!p) return { ok: false, reason: 'bad-points' };
      if (pts.length + 1 > settings().maxVertices) return { ok: false, reason: 'too-many-points', cap: settings().maxVertices };
      pts.splice(i, 0, p);
      return { ok: true, id: hit.entity.id, layer: hit.layer, index: i, vertices: pts.length };
    },
    deleteVertex: function (d, op) {
      const hit = locateIn(d, op.id);
      if (!hit) return { ok: false, reason: 'no-such-entity', id: op.id };
      const pts = hit.entity.points;
      if (!Array.isArray(pts)) return { ok: false, reason: 'not-a-path' };
      const floor = POLY_LAYERS.indexOf(hit.layer) >= 0 ? 3 : 2;
      if (pts.length <= floor) return { ok: false, reason: 'too-few-points', floor: floor };
      const i = num(op.index);
      if (i === null || i < 0 || i >= pts.length) return { ok: false, reason: 'bad-index', len: pts.length };
      pts.splice(i, 1);
      if (POLY_LAYERS.indexOf(hit.layer) >= 0 && areaOf(pts) <= 0) return { ok: false, reason: 'degenerate' };
      return { ok: true, id: hit.entity.id, layer: hit.layer, index: i, vertices: pts.length };
    },
    rotate: function (d, op) {
      const hit = locateIn(d, op.id);
      if (!hit) return { ok: false, reason: 'no-such-entity', id: op.id };
      const deg = num(op.deg);
      if (deg === null) return { ok: false, reason: 'missing-fields' };
      const e = hit.entity, pts = vertsOf(e);
      if (!pts.length) return { ok: false, reason: 'not-a-path' };
      const o = numPair(op.origin) || centroidOf(pts);
      const r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
      const map = function (p) {
        const dx = p[0] - o[0], dy = p[1] - o[1];
        return [o[0] + dx * cs - dy * sn, o[1] + dx * sn + dy * cs];
      };
      if (Array.isArray(e.points)) e.points = e.points.map(map);
      else { const q = map([e.x, e.y]); e.x = q[0]; e.y = q[1]; }
      return { ok: true, id: e.id, layer: hit.layer, deg: deg };
    },
    scale: function (d, op) {
      const hit = locateIn(d, op.id);
      if (!hit) return { ok: false, reason: 'no-such-entity', id: op.id };
      const f = num(op.factor);
      if (f === null || !(f > 0)) return { ok: false, reason: 'bad-factor' };
      const e = hit.entity, pts = vertsOf(e);
      if (!pts.length) return { ok: false, reason: 'not-a-path' };
      const o = numPair(op.origin) || centroidOf(pts);
      const map = function (p) { return [o[0] + (p[0] - o[0]) * f, o[1] + (p[1] - o[1]) * f]; };
      if (Array.isArray(e.points)) e.points = e.points.map(map);
      else { const q = map([e.x, e.y]); e.x = q[0]; e.y = q[1]; }
      return { ok: true, id: e.id, layer: hit.layer, factor: f };
    },
    /** 贴合道路（编辑器独有）：把多边形顶点吸到最近的道路中心线，超过 maxDist 的不动。 */
    snapToRoad: function (d, op) {
      const hit = locateIn(d, op.id);
      if (!hit) return { ok: false, reason: 'no-such-entity', id: op.id };
      const pts = hit.entity.points;
      if (!Array.isArray(pts)) return { ok: false, reason: 'not-a-path' };
      const maxD = num(op.maxDist) === null ? 40 : num(op.maxDist);
      if (!(maxD > 0)) return { ok: false, reason: 'bad-distance' };
      const roads = d.layers.roads;
      if (!roads.length) return { ok: false, reason: 'no-roads' };
      let moved = 0;
      // 贴合的是**路缘**，不是中心线：中心线外扩半个路宽，按顶点落在路的哪一侧定方向。
      //   为什么（现场实测）：把顶点直接吸到中心线，一个 120×90 的街区 4 个顶点会全部落到
      //   同一段直路上 ⇒ 面积归零，等于「贴合」把地块弄丢了。吸路缘则是一次**平移/外扩**，
      //   面积基本不变，而语义才是编辑器里那句「一键对齐路缘」。
      const next = pts.map(function (p) {
        let best = { dist: Infinity, at: null, road: null };
        roads.forEach(function (r) {
          const n = nearestOnPath(p, r.points);
          if (n.dist < best.dist) best = { dist: n.dist, at: n.at, seg: n.seg, road: r };
        });
        if (!best.at || best.dist > maxD) return p;
        moved++;
        const dx = p[0] - best.at[0], dy = p[1] - best.at[1];
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) return [best.at[0], best.at[1]];   // 正好压在中心线上：定不了侧，原样
        const half = (Number(best.road.width) || 0) / 2;
        return [best.at[0] + dx / len * half, best.at[1] + dy / len * half];
      });
      if (!moved) return { ok: false, reason: 'no-road-nearby', maxDist: maxD };
      // 贴合**不许把面贴没**：逐点吸附会把小街区压成一条线（现场实测 4 个顶点全吸到同一段路，
      //   面积归零）—— 那不是「对齐路缘」，是把地块弄丢了。面层面积变 0 就整笔拒收。
      // 阈值写 0.5 而不是「面积 == 0」：现场实测两个数都错过 ——
      //   ① `<= 0` 永远不触发（4 个顶点吸到同一段直路上时面积是「很小」不是「正好 0」）；
      //   ② `0.05` 又会误杀正常的微调（把一条边从离路缘 1 单位吸到路缘上，面积本就该变百分之几）。
      // 口径：对齐路缘是**平移/微扩**，面积变化应远小于一半；掉到一半以下就不是对齐，是把地块贴塌了。
      if (POLY_LAYERS.indexOf(hit.layer) >= 0 && areaOf(next) < areaOf(pts) * 0.5) {
        return { ok: false, reason: 'degenerate', hint: '贴合后面积塌了一半以上：地块太小或路太弯，先挪开再贴' };
      }
      hit.entity.points = next;
      return { ok: true, id: hit.entity.id, layer: hit.layer, moved: moved, of: pts.length };
    },
    /** 重算区归属（编辑器 reassignRegions）：街区取质心、POI 取自身点。 */
    reassign: function (d, op) {
      const hit = locateIn(d, op.id);
      if (!hit) return { ok: false, reason: 'no-such-entity', id: op.id };
      if (hit.layer === 'regions') return { ok: false, reason: 'not-assignable' };
      const e = hit.entity;
      const p = Array.isArray(e.points) ? centroidOf(e.points) : [e.x, e.y];
      const reg = d.layers.regions.filter(function (r) { return pip(p, r.points); })[0] || null;
      if (!reg) return { ok: false, reason: 'no-region', at: p };
      const prev = e.region || '';
      e.region = reg.name;
      return { ok: true, id: e.id, layer: hit.layer, region: reg.name, prev: prev, changed: prev !== reg.name };
    },
    remove: function (d, op) {
      const hit = locateIn(d, op.id);
      if (!hit) return { ok: false, reason: 'no-such-entity', id: op.id };
      const arr = d.layers[hit.layer];
      d.layers[hit.layer] = arr.filter(function (x) { return x.id !== op.id; });
      // 删掉的 id **不回收**：meta.seq 只增，防「删了再放回来被当成同一个」。
      return { ok: true, id: op.id, layer: hit.layer, remaining: d.layers[hit.layer].length };
    }
  };

  function numPair(v) {
    if (!Array.isArray(v) || v.length < 2) return null;
    const x = num(v[0]), y = num(v[1]);
    return (x === null || y === null) ? null : [x, y];
  }
  function normPoints(raw, autoClose) {
    if (!Array.isArray(raw) || !raw.length) return null;
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const p = numPair(raw[i]);
      if (!p) return null;
      out.push(p);
    }
    if (autoClose && out.length > 2) {
      const a = out[0], b = out[out.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) out.pop();
    }
    return out;
  }
  function locateIn(d, id) {
    const key = clean(id, 40);
    if (!key) return null;
    for (let i = 0; i < LAYERS.length; i++) {
      const arr = d.layers[LAYERS[i]] || [];
      for (let j = 0; j < arr.length; j++) if (arr[j].id === key) return { layer: LAYERS[i], entity: arr[j] };
    }
    return null;
  }

  // ── 提交：草稿 → 文档（失败零污染）──────────────────────────────
  function apply(op) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!DOC) { noteFault('no-document'); return { ok: false, reason: 'no-document' }; }
    const kind = clean(op && op.op, 24);
    if (!kind || !OPS[kind]) { noteFault('unknown-op'); stat.rejected++; return { ok: false, reason: 'unknown-op', allowed: Object.keys(OPS) }; }
    const draft = clone(DOC);
    let res = null;
    try { res = OPS[kind](draft, op || {}); } catch (e) { noteFault('source-threw'); stat.rejected++; return { ok: false, reason: 'source-threw' }; }
    if (!res || res.ok !== true) { stat.rejected++; return Object.assign({ ok: false, op: kind }, res || { reason: 'source-threw' }); }
    draft.version = (DOC.version || 0) + 1;
    undoRing.push(clone(DOC));
    const cap = settings().maxUndo;
    while (undoRing.length > cap) undoRing.shift();
    redoRing.length = 0;
    DOC = draft;
    stat.edits++;
    return Object.assign({ ok: true, op: kind, version: DOC.version, undoDepth: undoRing.length }, res);
  }

  const undoRing = [];
  const redoRing = [];
  function undo() {
    if (!undoRing.length) { noteFault('undo-empty'); return { ok: false, reason: 'undo-empty' }; }
    redoRing.push(clone(DOC));
    DOC = undoRing.pop();
    stat.undos++;
    return { ok: true, version: DOC.version, undoDepth: undoRing.length, redoDepth: redoRing.length };
  }
  function redo() {
    if (!redoRing.length) { noteFault('redo-empty'); return { ok: false, reason: 'redo-empty' }; }
    undoRing.push(clone(DOC));
    DOC = redoRing.pop();
    stat.edits++;
    return { ok: true, version: DOC.version, undoDepth: undoRing.length };
  }

  // ── 冲突检查（纯函数：不改文档、不动 version）────────────────────
  function check() {
    if (!DOC) return { ok: false, reason: 'no-document' };
    stat.checks++;
    const eps = settings().checkEps;
    const vio = [];
    const push = function (kind, layer, e, detail) { vio.push({ kind: kind, layer: layer, id: e && e.id, name: e && e.name, detail: detail }); };

    // ① 结构：顶点数 / 面积 / 自交 / 重名
    LAYERS.forEach(function (L) {
      const seen = {};
      list(L).forEach(function (e) {
        const key = clean(e.name, 60);
        if (key) { if (seen[key]) push('dup-name', L, e, '重名：' + key); seen[key] = 1; }
        if (POLY_LAYERS.indexOf(L) >= 0) {
          const pts = pointsOf(e) || [];
          if (pts.length < 3) push('poly-degenerate', L, e, '顶点 ' + pts.length);
          else {
            if (areaOf(pts) <= 0) push('poly-degenerate', L, e, '面积 0');
            const sc = selfCross(pts);
            if (sc) push('poly-self-intersect', L, e, '边 ' + sc[0] + ' 与边 ' + sc[1] + ' 交叉');
          }
        }
        if (L === 'roads') {
          const pts = pointsOf(e) || [];
          if (pts.length < 2) push('road-degenerate', L, e, '顶点 ' + pts.length);
          if (!(num(e.width) > 0)) push('road-degenerate', L, e, '宽 ' + e.width);
          if (ROAD_CLASSES.indexOf(clean(e.class, 20)) < 0) push('road-bad-class', L, e, '级 ' + e.class);
        }
        if (L === 'pois' && (num(e.x) === null || num(e.y) === null)) push('poi-bad-point', L, e, 'x/y 非数');
      });
    });

    const land = list('terrains').filter(function (t) { return clean(t.type, 20) === 'land'; });
    const regions = list('regions');
    const subs = list('subs');

    // ② 主区之间不得真重叠（贴在边界上不算：容差内的边界点不判）
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const a = pointsOf(regions[i]) || [], b = pointsOf(regions[j]) || [];
        let deep = 0;
        a.forEach(function (p) { if (strictlyInside(p, b, eps)) deep++; });
        b.forEach(function (p) { if (strictlyInside(p, a, eps)) deep++; });
        if (deep) push('region-overlap', 'regions', regions[i], '与「' + regions[j].name + '」重叠 ' + deep + ' 个顶点');
      }
    }

    // ③ 街区质心必须落在某个主区内
    subs.forEach(function (s) {
      const pts = pointsOf(s) || [];
      if (pts.length < 3) return;
      const c = centroidOf(pts);
      const hit = regions.filter(function (r) { return pip(c, r.points); })[0] || null;
      if (!hit) push('sub-outside-region', 'subs', s, '质心不在任何主区内');
      else if (s.region && clean(s.region, 40) !== hit.name) push('sub-region-mismatch', 'subs', s, '声明 ' + s.region + ' / 实际 ' + hit.name);
    });

    // ④ POI：必须在陆域、必须在声明的主区/街区内（与 subs 同口径）
    list('pois').forEach(function (q) {
      const p = [q.x, q.y];
      if (num(q.x) === null || num(q.y) === null) return;
      if (land.length && !land.some(function (t) { return pip(p, t.points); })) push('poi-on-water', 'pois', q, '不在陆域内');
      const reg = regions.filter(function (r) { return pip(p, r.points); })[0] || null;
      if (regions.length && !reg) push('poi-outside-region', 'pois', q, '不在任何主区内');
      else if (reg && q.region && clean(q.region, 40) !== reg.name) push('poi-region-mismatch', 'pois', q, '声明 ' + q.region + ' / 实际 ' + reg.name);
      if (q.sub) {
        const home = subs.filter(function (s) { return clean(s.name, 60) === clean(q.sub, 60); })[0];
        if (home && !pip(p, home.points)) push('poi-sub-mismatch', 'pois', q, '不在声明的街区「' + q.sub + '」内');
      }
    });

    return {
      ok: vio.length === 0, violations: vio.slice(0, 40), count: vio.length,
      counts: countsOf(), byKind: vio.reduce(function (m, v) { m[v.kind] = (m[v.kind] || 0) + 1; return m; }, {})
    };
  }

  // ── 文档 I/O ─────────────────────────────────────────────────
  function countsOf() {
    const c = {};
    LAYERS.forEach(function (L) { c[L] = list(L).length; });
    c.vertices = list('terrains').concat(list('regions'), list('subs'), list('roads'))
      .reduce(function (n, e) { return n + ((e.points || []).length); }, 0);
    return c;
  }
  function exportJSON() {
    if (!DOC) return null;
    const layers = {};
    LAYERS.forEach(function (L) { layers[L] = clone(list(L)); });
    const out = {
      format: FORMAT, schema: SCHEMA, version: DOC.version,
      width: DOC.width, height: DOC.height,
      meta: { seq: DOC.meta.seq, source: DOC.meta.source, name: DOC.meta.name },
      layers: layers
    };
    return JSON.stringify(out);
  }
  function fingerprint() {
    const s = exportJSON() || '';
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  /**
   * 导入。**默认吃编辑器导出的原格式**（terrains/main_regions/sub_regions/points_of_interest/roads
   * 平铺在顶层），也吃本引擎自己的信封（format + schema）。
   *   结构性错误 ⇒ 拒收、文档不变（不污染）；空间矛盾 ⇒ 照收但从 advisories 报出（底图仍可用）。
   */
  function importJSON(json, opt) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    let raw = json;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { noteFault('bad-json'); return { ok: false, reason: 'bad-json' }; } }
    if (!raw || typeof raw !== 'object') { noteFault('bad-json'); return { ok: false, reason: 'bad-json' }; }
    const isEnvelope = raw.format === FORMAT;
    if (isEnvelope && num(raw.schema) !== null && raw.schema > SCHEMA) {
      noteFault('schema-too-new');
      return { ok: false, reason: 'schema-too-new', got: raw.schema, supported: SCHEMA };
    }
    const w = num(raw.width), h = num(raw.height);
    if (!(w > 0) || !(h > 0)) { noteFault('bad-size'); return { ok: false, reason: 'bad-size' }; }

    const srcLayers = isEnvelope ? (raw.layers || {}) : raw;
    const pick = function (keys) {
      for (let i = 0; i < keys.length; i++) if (Array.isArray(srcLayers[keys[i]])) return srcLayers[keys[i]];
      return [];
    };
    const buckets = {
      terrains: pick(['terrains']),
      regions: pick(['regions', 'main_regions']),
      subs: pick(['subs', 'sub_regions']),
      pois: pick(['pois', 'points_of_interest']),
      roads: pick(['roads'])
    };

    const rejected = [], advisories = [];
    const fresh = blankDoc(w, h);
    // 信封里的 meta 也要认：只读顶层 name 会让「导出再导入」把名字与来源都丢掉，
    //   于是 round-trip 指纹一变，底图看起来就「换了个人」（现场红过一次）。
    const srcMeta = (raw.meta && typeof raw.meta === 'object') ? raw.meta : {};
    fresh.meta.source = opt && opt.source ? clean(opt.source, 40)
      : (isEnvelope ? (clean(srcMeta.source, 40) || 'envelope') : 'editor');
    fresh.meta.name = clean(raw.name, 60) || clean(srcMeta.name, 60);
    fresh.meta.seq = 0;

    POLY_LAYERS.forEach(function (L) {
      buckets[L].forEach(function (e, i) {
        const pts = normPoints(e && e.points, true);
        if (!pts || pts.length < 3) { rejected.push({ layer: L, index: i, reason: 'bad-points', name: e && e.name }); return; }
        fresh.meta.seq++;
        fresh.layers[L].push({
          id: L + '-' + fresh.meta.seq, name: clean(e.name, 60), type: clean(e.type, 24) || 'block',
          region: clean(e.main_region, 40) || clean(e.region, 40) || '',
          // desc 与 description 两个键名都认：编辑器用 description，本引擎信封用 desc。
          //   只认一个 ⇒ 导出再导入就丢一段描述，指纹也跟着变（round-trip 当场红过）。
          desc: clean(e.description, 160) || clean(e.desc, 160), color: clean(e.color, 12) || '', points: pts
        });
      });
    });
    buckets.pois.forEach(function (e, i) {
      const x = num(e && e.x), y = num(e && e.y);
      if (x === null || y === null) { rejected.push({ layer: 'pois', index: i, reason: 'bad-point', name: e && e.name }); return; }
      fresh.meta.seq++;
      fresh.layers.pois.push({
        id: 'pois-' + fresh.meta.seq, name: clean(e.name, 60), type: clean(e.type, 24) || 'poi',
        x: x, y: y,
        region: clean(e.main_region, 40) || clean(e.region, 40) || '',
        sub: clean(e.sub_region, 60) || clean(e.sub, 60) || '',
        desc: clean(e.description, 160) || clean(e.desc, 160), color: clean(e.color, 12) || ''
      });
    });
    buckets.roads.forEach(function (e, i) {
      const pts = normPoints(e && e.points);
      if (!pts || pts.length < 2) { rejected.push({ layer: 'roads', index: i, reason: 'bad-points', name: e && e.name }); return; }
      fresh.meta.seq++;
      fresh.layers.roads.push({
        id: 'roads-' + fresh.meta.seq, name: clean(e.name, 60), class: clean(e.class, 20) || 'street',
        width: num(e.width) === null ? 8 : num(e.width),
        region: clean(e.main_region, 40) || clean(e.region, 40) || '', points: pts
      });
    });

    if (rejected.length) {
      noteFault('import-rejected-entities');
      return { ok: false, reason: 'import-rejected-entities', rejected: rejected.slice(0, 20), rejectedCount: rejected.length };
    }

    DOC = fresh;
    undoRing.length = 0; redoRing.length = 0;
    stat.imports++;
    const chk = check();
    const byKind = chk.byKind || {};
    Object.keys(byKind).forEach(function (k) { advisories.push({ kind: k, count: byKind[k] }); });
    return {
      ok: true, source: fresh.meta.source, counts: countsOf(), fingerprint: fingerprint(),
      advisories: advisories, violations: chk.count
    };
  }

  function newDoc(w, h) {
    const W = num(w), H = num(h);
    if (!(W > 0) || !(H > 0)) return { ok: false, reason: 'bad-size' };
    DOC = blankDoc(W, H);
    undoRing.length = 0; redoRing.length = 0;
    return { ok: true, counts: countsOf(), fingerprint: fingerprint() };
  }

  // ── 读面（给别的引擎与叙事用）────────────────────────────────
  /** 点查询：这是编辑器里的 districtAt 的泛化 —— 一次问清「这地方算哪儿」。 */
  function at(x, y) {
    if (!DOC) return { ok: false, reason: 'no-document' };
    const px = num(x), py = num(y);
    if (px === null || py === null) return { ok: false, reason: 'bad-point' };
    stat.reads++;
    const p = [px, py];
    const terrain = list('terrains').filter(function (t) { return pip(p, t.points); })[0] || null;
    const region = list('regions').filter(function (r) { return pip(p, r.points); })[0] || null;
    const sub = list('subs').filter(function (s) { return pip(p, s.points); })[0] || null;
    let poi = null, best = Infinity;
    list('pois').forEach(function (q) {
      const d = dist(p, [q.x, q.y]);
      if (d < best) { best = d; poi = { name: q.name, type: q.type, dist: Math.round(d * 10) / 10 }; }
    });
    let road = null; best = Infinity;
    list('roads').forEach(function (r) {
      const n = nearestOnPath(p, r.points);
      if (n.dist < best) { best = n.dist; road = { name: r.name, class: r.class, width: r.width, centerDist: Math.round(n.dist * 10) / 10, curbDist: Math.max(0, Math.round((n.dist - r.width / 2) * 10) / 10) }; }
    });
    return {
      ok: true, x: px, y: py,
      inLand: !!(terrain && clean(terrain.type, 20) === 'land'),
      terrain: terrain ? { name: terrain.name, type: terrain.type } : null,
      region: region ? { name: region.name, color: region.color } : null,
      sub: sub ? { name: sub.name, type: sub.type } : null,
      poi: poi, road: road
    };
  }
  /** 名字 → 坐标（geo-tracker 缺坐标时的兜底；同一名字多点则全给，不猜）。 */
  function locate(name) {
    if (!DOC) return { ok: false, reason: 'no-document' };
    const key = clean(name, 60);
    if (!key) return { ok: false, reason: 'missing-name' };
    stat.reads++;
    const hits = [];
    list('pois').forEach(function (q) { if (clean(q.name, 60) === key) hits.push({ layer: 'pois', id: q.id, x: q.x, y: q.y, kind: q.type }); });
    list('subs').forEach(function (s) {
      if (clean(s.name, 60) === key) { const c = centroidOf(s.points); hits.push({ layer: 'subs', id: s.id, x: c[0], y: c[1], kind: s.type }); }
    });
    list('regions').forEach(function (r) {
      if (clean(r.name, 60) === key) { const c = centroidOf(r.points); hits.push({ layer: 'regions', id: r.id, x: c[0], y: c[1], kind: 'region' }); }
    });
    if (!hits.length) return { ok: false, reason: 'not-found', name: key };
    const first = hits[0];
    return { ok: true, name: key, x: first.x, y: first.y, layer: first.layer, kind: first.kind, candidates: hits };
  }
  /** 两点直线穿过什么：跨水次数、途经区/街区、世界单位与米（未定标则米报 null）。 */
  function span(a, b, opt) {
    if (!DOC) return { ok: false, reason: 'no-document' };
    const pa = Array.isArray(a) ? numPair(a) : (locate(a).ok ? (function (h) { return [h.x, h.y]; })(locate(a)) : null);
    const pb = Array.isArray(b) ? numPair(b) : (locate(b).ok ? (function (h) { return [h.x, h.y]; })(locate(b)) : null);
    if (!pa || !pb) return { ok: false, reason: 'unresolved-endpoint' };
    const steps = (opt && num(opt.steps)) || 256;
    const waters = {}, regions = {}, subs = {};
    let crossings = 0, prevWater = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
      const ter = list('terrains').filter(function (x) { return pip(p, x.points); })[0] || null;
      const wn = (ter && clean(ter.type, 20) === 'water') ? ter.name : null;
      if (wn !== prevWater) { if (wn) crossings++; prevWater = wn; }
      if (wn) waters[wn] = (waters[wn] || 0) + 1;
      const r = list('regions').filter(function (x) { return pip(p, x.points); })[0];
      if (r) regions[r.name] = 1;
      const s = list('subs').filter(function (x) { return pip(p, x.points); })[0];
      if (s) subs[s.name] = 1;
    }
    const units = dist(pa, pb);
    const upm = num(settings().unitMeter);
    return {
      ok: true, from: pa, to: pb, units: Math.round(units * 10) / 10,
      meters: (upm && upm > 0) ? Math.round(units * upm) : null,
      needsCalibration: !(upm && upm > 0),
      waterCrossings: crossings, waters: Object.keys(waters),
      regions: Object.keys(regions), subs: Object.keys(subs), steps: steps
    };
  }
  /** 定标反算：给定城市宽度（米）⇒ 一个世界单位几米。不写盘、不改设置。 */
  function metersPerUnit(widthMeters) {
    const wm = num(widthMeters);
    if (!DOC) return { ok: false, reason: 'no-document' };
    if (!(wm > 0)) return { ok: false, reason: 'bad-width' };
    return { ok: true, widthMeters: wm, widthUnits: DOC.width, unitMeter: Math.round((wm / DOC.width) * 1000) / 1000 };
  }

  function diagnose() {
    return {
      ok: true, version: VERSION, enabled: !!settings().enabled,
      hasDocument: !!DOC,
      counts: countsOf(), version_doc: DOC ? DOC.version : null,
      fingerprint: DOC ? fingerprint() : null,
      undoDepth: undoRing.length, redoDepth: redoRing.length,
      unitMeter: settings().unitMeter,
      deps: { settingsBus: !!WA.settingsBus, viewport: !!(WA.mapViewport && WA.mapViewport.renderSvgScene), geoTracker: !!(WA.geoTracker && WA.geoTracker.registerPlace) },
      stat: Object.assign({}, stat), faults: Object.assign({}, faults)
    };
  }

  WA.mapEditor = {
    VERSION: VERSION, FORMAT: FORMAT, SCHEMA: SCHEMA,
    LAYERS: LAYERS.slice(), POLY_LAYERS: POLY_LAYERS.slice(), ROAD_CLASSES: ROAD_CLASSES.slice(), OPS: Object.keys(OPS),
    getSettings: settings, setSettings: function (patch) { return saveSettings(patch); },
    newDoc: newDoc, importJSON: importJSON, exportJSON: exportJSON, fingerprint: fingerprint,
    apply: apply, undo: undo, redo: redo, check: check,
    at: at, locate: locate, span: span, metersPerUnit: metersPerUnit,
    counts: countsOf, doc: doc,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, faults) }); },
    diagnose: diagnose
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/map-editor.js', { kind: 'engine', ver: VERSION });
})();
