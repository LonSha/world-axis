/**
 * WorldAxis engines/relation-graph.js (v2.230.0) — 关系图谱 edgeId
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓有关系分节（`actors/` 人际）与 `opinion`，但**「谁和谁这条边，叫什么」
 *   没有稳定标识**：现场实测 `关系图谱` / `relationGraph` / `edgeId` 在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：两端互换（A→B 与 B→A）会算成两条边；同两个人换一种关系标签
 *   （恋人→旧识）也各算一条，图上出现同名重复边，历史无处挂。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 yumitoushou11/st-beat-tracker 的 ui/renderers/relationshipModal.js
 *   （关系图谱详情）：
 *     · **边有稳定 id**：按 `edgeId` 精确定位（`edges.find(e => e.id === edgeId)`），
 *       不按顺序、不按名称找；
 *     · **两端有序但边归一无序**：`participants[0]/[1]` 有前后，**边本身按对归一**
 *       （同一对人不因先后而分裂）；
 *     · **边带生命段**：情感权重（`emotional_weight` 0–10，分低/中/高/极高四档）、
 *       相识状态（`meeting_status`，陌生人/点头之交/单方面认识算「待熟识」）、
 *       分离态（`separation_state`，兼容 `reunion_pending`）、最后互动时间
 *       （默认「故事开始前」）；
 *     · **未命名不装作有名**：`relationship_label` 为空 ⇒ 用「尚未命名的关系」，
 *       **不外泄英文键名**（`childhood_friends` 等英文一律回落中文兜底）。
 *   本模块只取其中**可判定的那一层**（边 id 归一 / 对无序 / 档位判定 / 未命名兜底 /
 *   英文键名不外泄）；渲染由 UI 做，本模块只出**边的账**。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · actors 人际分节 —— 「谁认识谁」，本模块不动它；
 *   · opinion —— 「舆情」，本模块不改它；
 *   · 本模块 —— **边 id 归一 + 对无序 + 生命周期字段 + 未命名兜底**（纯记账）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时 `upsert` 一律 `disabled`。
 *   ② **边按对归一**：`[A,B]` 与 `[B,A]` 是同一条边（`id` 相同，自环除外）。
 *   ③ **自环拒收**：两端同名 ⇒ `self-loop`（人不与自己成边）。
 *   ④ **两端必须齐**：缺一端或空名 ⇒ `missing-end`。
 *   ⑤ **英文键名不外泄**：`type_label` 能直接给中文；给了英文 `type` 时走
 *      中文映射表，**映不上就回落「未知关系」**，绝不原样吐英文。
 *   ⑥ **权重是 0–10 的档**：越界一律夹到边界并如实报 `clamped`。
 *   ⑦ 图谱**有硬上限**（FIFO 挤出最旧边），挤出计数如实报。
 *   ⑧ 不落盘、不跨会话、不碰 DOM（渲染是 UI 的事）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_relation_graph_settings_v1';
  const DEF = { enabled: false, maxEdges: 128, defaultWeight: 5, maxLabel: 40 };
  const __REG = { key: LS_KEY, def: DEF, module: 'relationGraph',
    bounds: { maxEdges: [4, 2000], defaultWeight: [0, 10], maxLabel: [4, 80] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const TYPE_LABEL = { childhood_friends: '青梅旧盟', enemies: '宿敌对峙', lovers: '恋人羁绊',
    stranger_with_history: '陌路旧识', family: '亲缘', colleagues: '同僚', mentor: '师徒', rivals: '竞争' };
  const WEIGHT_BANDS = [
    { min: 9, key: 'weight-critical', label: '极高' },
    { min: 7, key: 'weight-high', label: '高' },
    { min: 4, key: 'weight-medium', label: '中等' },
    { min: 0, key: 'weight-low', label: '较低' },
  ];
  const UNFAMILIAR = ['陌生人', '点头之交', '单方面认识'];
  const FALLBACK_LABEL = '尚未命名的关系';
  const FALLBACK_TYPE = '未知关系';
  const LAST_DEFAULT = '故事开始前';

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))) : Object.assign({}, DEF, next || {});
  }

  const stat = { upserts: 0, edges: 0, merged: 0, evicted: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 40); }
  function hasLatin(v) { return /[A-Za-z]/.test(String(v == null ? '' : v)); }

  const GRAPH = { edges: [], index: {} };

  /** 边 id：两端名排序后拼接（对无序 ⇒ 同一条边；自环被前置拒绝）。 */
  function edgeIdOf(a, b) {
    const x = clean(a, 60); const y = clean(b, 60);
    if (!x || !y) return null;
    if (x === y) return null;
    return x <= y ? (x + '~' + y) : (y + '~' + x);
  }
  function bandOf(w) {
    const n = Number.isFinite(Number(w)) ? Number(w) : 0;
    for (let i = 0; i < WEIGHT_BANDS.length; i++) if (n >= WEIGHT_BANDS[i].min) return WEIGHT_BANDS[i];
    return WEIGHT_BANDS[WEIGHT_BANDS.length - 1];
  }
  /** 中文标签兜底：能直接用中文就用；英文键名走映射；映不上回落「未知关系」。 */
  function typeTextOf(rawTypeLabel, rawType, relationshipLabel) {
    const direct = clean(rawTypeLabel, 40);
    if (direct && !hasLatin(direct)) return direct;
    const key = clean(rawType, 40);
    if (key && TYPE_LABEL[key]) return TYPE_LABEL[key];
    const rel = clean(relationshipLabel, 40);
    if (rel && !hasLatin(rel)) return rel;
    if (direct && hasLatin(direct)) return FALLBACK_TYPE;   // 只有英文 ⇒ 不原样外泄
    return FALLBACK_TYPE;
  }
  /** 建/更新一条边（对无序，同对只留一条）。 */
  function upsert(edge, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const e = edge || {};
    const parts = Array.isArray(e.participants) ? e.participants : [e.from, e.to];
    const a = clean(parts[0], 60); const b = clean(parts[1], 60);
    if (!a || !b) return refuse('missing-end');
    if (a === b) return refuse('self-loop');
    const id = edgeIdOf(a, b);
    if (!id) return refuse('missing-end');
    const given = clean(e.id, 80);
    const label = clean(e.relationship_label, cfg.maxLabel);
    const rawWeight = e.emotional_weight;
    const weight = Number.isFinite(Number(rawWeight)) ? Number(rawWeight) : cfg.defaultWeight;
    const clampedW = Math.min(10, Math.max(0, weight));
    const clamped = clampedW !== weight;
    const timeline = e.timeline || {};
    const narration = e.narrative_status || {};
    const meeting = clean(timeline.meeting_status, 20) || '未知';
    const separated = typeof timeline.separation_state === 'boolean' ? timeline.separation_state : (timeline.reunion_pending === true);
    const last = clean(timeline.last_interaction, 40) || LAST_DEFAULT;
    const pendingMeeting = UNFAMILIAR.indexOf(meeting) >= 0 || narration.first_scene_together === false;
    const band = bandOf(clampedW);
    const row = {
      id: id, participants: a <= b ? [a, b] : [b, a], givenId: given || null,
      type: clean(e.type, 40) || null,
      typeLabel: typeTextOf(e.type_label, e.type, e.relationship_label),
      relationshipLabel: label || FALLBACK_LABEL, named: !!label,
      weight: clampedW, weightClass: band.key, weightLabel: band.label,
      meetingStatus: meeting, pendingMeeting: pendingMeeting,
      separated: separated, separationText: separated ? '物理分离' : '同处一地',
      lastInteraction: last, unresolvedTension: Array.isArray(narration.unresolved_tension) ? narration.unresolved_tension.length : 0,
      majorEvents: Array.isArray(narration.major_events) ? narration.major_events.length : 0,
      updatedAt: clockNow('relationGraph'),
    };
    const at = GRAPH.index[id];
    let evicted = 0; let merged = false;
    if (at >= 0 && at != null) {
      const prev = GRAPH.edges[at];
      // 未命名不覆盖已命名；已命名可补上未命名 —— 这就是「并边」的可判定那一层
      if (prev.named && !row.named) { row.relationshipLabel = prev.relationshipLabel; row.named = true; }
      if (!prev.named && row.named) merged = true;
      if (prev.typeLabel !== FALLBACK_TYPE && row.typeLabel === FALLBACK_TYPE) row.typeLabel = prev.typeLabel;
      GRAPH.edges[at] = row; stat.merged++;
    } else {
      GRAPH.edges.push(row);
      GRAPH.index[id] = GRAPH.edges.length - 1;
      while (GRAPH.edges.length > cfg.maxEdges) {
        const drop = GRAPH.edges.shift();
        if (drop) delete GRAPH.index[drop.id];
        evicted++; stat.evicted++;
      }
      // 重建索引（shift 后下标全变）
      GRAPH.index = {};
      GRAPH.edges.forEach(function (r, i) { GRAPH.index[r.id] = i; });
    }
    stat.upserts++; stat.edges = GRAPH.edges.length;
    return { ok: true, reason: 'ok', id: id, merged: merged, clamped: clamped,
      edge: row, evicted: evicted, kept: GRAPH.edges.length, cap: cfg.maxEdges };
  }
  function get(a, b) {
    const id = edgeIdOf(a, b);
    if (!id) return { ok: false, reason: 'self-loop-or-missing-end' };
    const at = GRAPH.index[id];
    if (at == null) return { ok: true, reason: 'no-edge', id: id, edge: null };
    return { ok: true, reason: 'ok', id: id, edge: GRAPH.edges[at] };
  }
  /** 某人的全部边（只读投影）。 */
  function edgesOf(name) {
    const n = clean(name, 60);
    if (!n) return { ok: false, reason: 'empty-name' };
    const rows = GRAPH.edges.filter(function (e) { return e.participants.indexOf(n) >= 0; });
    return { ok: true, reason: 'ok', name: n, count: rows.length,
      edges: rows.map(function (e) {
        const other = e.participants[0] === n ? e.participants[1] : e.participants[0];
        return { id: e.id, other: other, typeLabel: e.typeLabel, relationshipLabel: e.relationshipLabel,
          weight: e.weight, weightLabel: e.weightLabel, meetingStatus: e.meetingStatus,
          separated: e.separated, lastInteraction: e.lastInteraction };
      }) };
  }
  function list(opts) {
    const o = opts || {};
    let rows = GRAPH.edges.slice();
    if (o.band) rows = rows.filter(function (e) { return e.weightClass === clean(o.band, 20); });
    return { ok: true, reason: 'ok', total: GRAPH.edges.length, count: rows.length,
      rows: rows.slice(-20).map(function (e) { return { id: e.id, participants: e.participants.slice(),
        typeLabel: e.typeLabel, relationshipLabel: e.relationshipLabel, weightLabel: e.weightLabel }; }) };
  }
  function remove(a, b) {
    const id = edgeIdOf(a, b);
    if (!id) return refuse('self-loop-or-missing-end');
    const at = GRAPH.index[id];
    if (at == null) return refuse('no-edge');
    const [row] = GRAPH.edges.splice(at, 1);
    GRAPH.index = {};
    GRAPH.edges.forEach(function (r, i) { GRAPH.index[r.id] = i; });
    return { ok: true, reason: 'ok', removed: row.id, kept: GRAPH.edges.length };
  }
  function clear() { const n = GRAPH.edges.length; GRAPH.edges = []; GRAPH.index = {}; return { ok: true, reason: 'ok', dropped: n }; }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxEdges: cfg.maxEdges, defaultWeight: cfg.defaultWeight,
      typeLabel: TYPE_LABEL, weightBands: WEIGHT_BANDS, unfamiliar: UNFAMILIAR.slice(),
      fallbackLabel: FALLBACK_LABEL, fallbackType: FALLBACK_TYPE, lastDefault: LAST_DEFAULT,
      edges: GRAPH.edges.length,
      semantics: '边按对归一（对无序）/ 稳定 edgeId / 英文键名不外泄 / 权重 0-10 四档' };
  }
  function resetStat() {
    stat.upserts = 0; stat.edges = 0; stat.merged = 0; stat.evicted = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.relationGraph = {
    getSettings: settings, setSettings: saveSettings, view: view,
    upsert: upsert, get: get, edgesOf: edgesOf, list: list, remove: remove, clear: clear, edgeIdOf: edgeIdOf,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    TYPE_LABEL: TYPE_LABEL, WEIGHT_BANDS: WEIGHT_BANDS, FALLBACK_LABEL: FALLBACK_LABEL,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/relation-graph.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'relationGraph 已加载（2.230.0）');
})();