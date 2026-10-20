/**
 * WorldAxis engines/floor-snapshot.js (v2.230.0) — 楼层快照 FIFO + 清空层回滚
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓的 `timeline` 只回答「这段记忆出自哪一楼的哪个字区间」（溯源），
 *   `checkpoints` 存的是「世界坐标点的整档位」，两者都不回答一件事：
 *   **「这一楼当时的这张卡长什么样」**。
 *   现场实测：`楼层快照` / `清空层` / `snapshotFifo` / `回滚楼层` 在
 *   engines|core|actors|direction|render|ui **零命中**（只有 elsewhere.js 头注
 *   提及「楼层快照与回滚在 engines/floor-snapshot.js」—— 而该文件此前并不存在，
 *   这是本仓反复治的那类「注释承诺、实现为空」幽灵面，本版把它补实）。
 *   后果：删楼 / 重掷 / 清空层之后，档案里那些「按当时状态写下的内心与台账」
 *   没有一条能回答「它是在哪一层写下的、改回去要动哪几格」。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是打包前端「彼方 / ElseWhere」的楼层快照机制（其提示词与面板口径）：
 *     · 每轮**只在一处**落一层快照（一层一份，同层重入即覆盖，不并两份）；
 *     · 快照是**有界环形**：超出上限挤掉最旧的一层（FIFO），不是无限追加；
 *     · **清空层**是一种独立状态：该层被清掉后其快照仍留在环里可查（不是删掉），
 *       回滚只回那一层记录下来的字段（没记的字段不动，不猜）。
 *   本模块只取其中**可判定的那一层**；UI 与「哪一格显示在哪」属渲染面，不进本模块。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · timeline  —— 「这段记忆出自哪一楼」（字区间溯源），本模块不碰字区间；
 *   · checkpoints —— 「世界坐标点的整档位」，本模块不存整档，只存单层字段子集；
 *   · 本模块   —— **单层字段快照 + 清空态 + 回滚范围**（FIFO 有界）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时拍快照 / 回滚一律拒收 `disabled`，不猜。
 *   ② **同层只留一份**：同 floor 重入 ⇒ 覆盖（`replaced`），不并成两条。
 *   ③ **字段白名单**：只收 FIELDS 里的键，键外一律 `bad-field`（不整包吞下）。
 *   ④ **非 FIFO 楼层拒收**：落层楼层不得小于环中最新层（`out-of-order`）——
 *      倒着补旧层会让「环内顺序」与「发生顺序」长得不一样。
 *   ⑤ **回滚只回记下的键**：没记的字段原样不动，且如实报 `untouched` 数。
 *   ⑥ **清空层可查不可猜**：`cleared` 的层快照仍在环里（`clear` 只打标）；
 *      未知楼层一律 `unknown-floor`，不拿空对象兜底。
 *   ⑦ **不跨会话继承**：快照只在单会话内存环里，不落 store 骨架（零 store 写）。
 *   ⑧ 有硬上限：`maxFrames` 由 settings 定，挤出计数如实报 `evicted`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_floor_snapshot_settings_v1';
  const DEF = { enabled: false, maxFrames: 48, maxFields: 24, maxValueChars: 400 };
  const __REG = { key: LS_KEY, def: DEF, module: 'floorSnapshot',
    bounds: { maxFrames: [4, 256], maxFields: [1, 64], maxValueChars: [40, 4000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const FIELDS = ['doing', 'status', 'place', 'inner', 'target', 'ledger', 'recent', 'romance', 'vitals', 'note'];
  const CLEAR_STATES = ['live', 'cleared'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const stat = { pushed: 0, replaced: 0, evicted: 0, rolled: 0, cleared: 0, bound: 0, rebound: 0, unbound: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }

  const RING = { frames: [] };   // [{ floor, at, state, fields:{} }]

  function floorOf(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && Math.floor(n) === n ? n : null;
  }
  /** 拍一层快照。同层覆盖；字段白名单；非 FIFO 楼层拒收。 */
  function push(floor, fields, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const f = floorOf(floor);
    if (f === null) return refuse('bad-floor');
    const o = opts || {};
    const src = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : null;
    if (!src) return refuse('bad-fields');
    const keys = Object.keys(src);
    if (!keys.length) return refuse('empty-fields');
    if (keys.length > cfg.maxFields) return refuse('too-many-fields');
    const picked = {}; const rejected = [];
    keys.forEach(function (k) {
      if (FIELDS.indexOf(k) < 0) { rejected.push(k); return; }
      const raw = src[k];
      picked[k] = typeof raw === 'string' ? clean(raw, cfg.maxValueChars) : JSON.parse(JSON.stringify(raw == null ? null : raw));
    });
    if (!Object.keys(picked).length) return refuse('bad-field');
    const last = RING.frames[RING.frames.length - 1];
    if (last && f < last.floor) return refuse('out-of-order');
    const idx = RING.frames.findIndex(function (x) { return x.floor === f; });
    const rec = { floor: f, at: clockNow('floorSnapshot'), state: 'live', fields: picked, via: clean(o.via, 40) || 'round' };
    let replaced = false;
    if (idx >= 0) { RING.frames[idx] = rec; replaced = true; stat.replaced++; }
    else { RING.frames.push(rec); stat.pushed++; }
    let evicted = 0;
    while (RING.frames.length > cfg.maxFrames) { RING.frames.shift(); evicted++; }
    stat.evicted += evicted;
    return { ok: true, reason: 'ok', floor: f, replaced: replaced, evicted: evicted,
      kept: RING.frames.length, cap: cfg.maxFrames, rejected: rejected,
      rejectedReason: rejected.length ? 'bad-field' : '' };
  }
  /** 打清空标：该层快照仍在环里（可查），不是删掉。 */
  function markCleared(floor) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const f = floorOf(floor);
    if (f === null) return refuse('bad-floor');
    const rec = RING.frames.find(function (x) { return x.floor === f; });
    if (!rec) return refuse('unknown-floor');
    if (rec.state === 'cleared') return { ok: true, reason: 'already-cleared', floor: f };
    rec.state = 'cleared'; rec.clearedAt = clockNow('floorSnapshot');
    stat.cleared++;
    return { ok: true, reason: 'ok', floor: f, cleared: stat.cleared };
  }
  /** 回滚：只回记下的键；没记的原样不动（如实报数）。 */
  function rollback(floor, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const f = floorOf(floor);
    if (f === null) return refuse('bad-floor');
    const rec = RING.frames.find(function (x) { return x.floor === f; });
    if (!rec) return refuse('unknown-floor');
    const want = (opts && Array.isArray(opts.only) && opts.only.length) ? opts.only : Object.keys(rec.fields);
    const patch = {}; const skipped = [];
    want.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(rec.fields, k)) patch[k] = rec.fields[k];
      else skipped.push(k);
    });
    stat.rolled++;
    return { ok: true, reason: 'ok', floor: f, patch: patch,
      restored: Object.keys(patch).length, untouched: skipped.length, untouchedKeys: skipped,
      state: rec.state, cleared: rec.state === 'cleared' };
  }
  function at(floor) {
    const f = floorOf(floor);
    if (f === null) return { ok: false, reason: 'bad-floor' };
    const rec = RING.frames.find(function (x) { return x.floor === f; });
    if (!rec) return { ok: false, reason: 'unknown-floor' };
    return { ok: true, reason: 'ok', floor: rec.floor, state: rec.state, keys: Object.keys(rec.fields), at: rec.at };
  }
  function list() {
    return RING.frames.map(function (x) { return { floor: x.floor, state: x.state, keys: Object.keys(x.fields) }; });
  }
  function clear() { const n = RING.frames.length; RING.frames = []; BIND = {}; return { ok: true, reason: 'ok', dropped: n }; }
  // ── B09 快照绑定 message ──────────────────────────────────────────────
  // 上游彼方的「楼层快照」是挂在**消息**上的：删楼 / 编辑 / 重掷会换掉 message，
  // 快照得跟着换（不能按序号硬绑，序号一重排就对不上）。
  // 本模块只做**绑定账**：一条 message 只能绑一层；重绑即覆盖并具名报 `rebound`。
  var BIND = {};   // messageId → floor
  function bind(floor, messageId) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const f = floorOf(floor);
    if (f === null) return refuse('bad-floor');
    const mid = clean(messageId, 80);
    if (!mid) return refuse('bad-message');
    const rec = RING.frames.find(function (x) { return x.floor === f; });
    if (!rec) return refuse('unknown-floor');
    const prev = BIND[mid];
    const rebound = prev != null && prev !== f;
    if (rebound) {
      // 重绑：旧楼层解绑，但**快照本身留在环里**（不是删）
      delete BIND[mid];
      stat.rebound++;
    }
    if (Object.keys(BIND).length >= cfg.maxFrames * 4 && prev == null) return refuse('bind-table-full');
    BIND[mid] = f;
    rec.messageId = mid;
    stat.bound++;
    return { ok: true, reason: rebound ? 'rebound' : 'ok', floor: f, messageId: mid,
      prevFloor: prev == null ? null : prev, rebound: rebound, bound: Object.keys(BIND).length };
  }
  /** 按 message 找它绑的那层快照（不按序号猜）。 */
  function byMessage(messageId) {
    const mid = clean(messageId, 80);
    if (!mid) return { ok: false, reason: 'bad-message' };
    const f = BIND[mid];
    if (f == null) return { ok: true, reason: 'unbound', messageId: mid, floor: null, frame: null };
    const rec = RING.frames.find(function (x) { return x.floor === f; });
    if (!rec) return { ok: true, reason: 'frame-evicted', messageId: mid, floor: f, frame: null };
    return { ok: true, reason: 'ok', messageId: mid, floor: f, frame: { floor: rec.floor, state: rec.state, keys: Object.keys(rec.fields) } };
  }
  /** 消息被删/被换：解绑，但**快照留在环里可查**（回滚仍可用）。 */
  function unbind(messageId) {
    const mid = clean(messageId, 80);
    if (!mid) return refuse('bad-message');
    if (BIND[mid] == null) return refuse('unbound');
    const f = BIND[mid];
    delete BIND[mid];
    const rec = RING.frames.find(function (x) { return x.floor === f; });
    if (rec && rec.messageId === mid) delete rec.messageId;
    stat.unbound++;
    return { ok: true, reason: 'ok', floor: f, messageId: mid, kept: RING.frames.length };
  }
  function bindings() {
    return { ok: true, reason: 'ok', count: Object.keys(BIND).length,
      rows: Object.keys(BIND).slice(-20).map(function (k) { return { messageId: k, floor: BIND[k] }; }) };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxFrames: cfg.maxFrames, maxFields: cfg.maxFields, maxValueChars: cfg.maxValueChars,
      fields: FIELDS.slice(), clearStates: CLEAR_STATES.slice(), kept: RING.frames.length };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !RING.frames.length) return '';
    const rows = RING.frames.slice(-6).map(function (x) {
      return '· 第 ' + x.floor + ' 层[' + (x.state === 'cleared' ? '已清空' : '现行') + ']：' + Object.keys(x.fields).join('/');
    });
    return ['【楼层快照·近 6 层】'].concat(rows).join('\n');
  }
  function resetStat() {
    stat.pushed = 0; stat.replaced = 0; stat.evicted = 0; stat.rolled = 0; stat.cleared = 0;
    stat.bound = 0; stat.rebound = 0; stat.unbound = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.floorSnapshot = {
    getSettings: settings, setSettings: saveSettings, view: view, buildBlock: buildBlock,
    push: push, markCleared: markCleared, rollback: rollback, at: at, list: list, clear: clear,
    bind: bind, byMessage: byMessage, unbind: unbind, bindings: bindings,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    FIELDS: FIELDS, CLEAR_STATES: CLEAR_STATES,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/floor-snapshot.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'floorSnapshot 已加载（2.230.0）');
})();
