/**
 * WorldAxis engines/interest-face.js (v2.252.0) — AOI 兴趣面（谁看得见哪一件事）
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   本仓已有「远方怎么传过来」：`region.js` 按距离天数 ÷ 渠道速率算延迟，`farfield.js`
 *   按远近给趋势摘要。但那是**按天数**的拓扑，回答的是「几天后到」；
 *   它答不了另一件事：**同一时刻，这屋里谁看得见这件事**。
 *   现场的替代做法只有两种：要么全体 NPC 一律收到（等于全知，`anti-omniscience`
 *   只好事后一道道拦），要么由模型逐人猜「他应该没看见」——猜出来的注意力没有判据。
 *   缺口实测：`AOI` / `areaOfInterest` / `兴趣面` / `interestRing` / `cellId` /
 *   `spatialHash` 在 core 与 engines 下**命中 0**；`distance` 仅出现在 region/farfield/
 *   atlas/history-search，全是「天」单位，没有一处按**格**判定在场。
 *
 *   （同名机制在对局服项目里被独立验证过：OpenMMO `interest.rs` 用格网 + 半径做
 *   area-of-interest 投递——只在**跨格**时重算覆盖集合，同格内移动直接跳过；
 *   半径是方形（切比雪夫）而非欧氏，避免开方；每 tick 每人有投递带宽上限，
 *   超出进待发队列而不是丢；镜头焦点恒在半径内。本模块把这几条搬到叙事层。）
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `place` 落位（坐标或地名）→ `publish` 事件按各人兴趣面各自投递 → `flush` 取走本 tick。
 *   普通观察者只收到半径内的事件；`setFocus` 的格对全体恒可见（镜头焦点优先）。
 *
 * ── 缝合边界（否定式，每条都有判据咬）──────────────────────────────
 *   ① 总开关默认关闭。关闭时不落位、不投递、不排队，`publish` 一律 `disabled`。
 *   ② **落不了格的人收不到任何投递**：坐标必须是整数（或能稳定哈希成格的地名），
 *      否则 `unplaced`。没有位置就没有兴趣面，不猜「大概在附近」。
 *   ③ **只在跨格时重算覆盖集合**：同格内 `move` 报 `same-cell` 且不重算、不刷新时间戳。
 *      这是本模块存在的理由（每步全量重扫等于没有兴趣面）。
 *   ④ 半径是**方形（切比雪夫格距）**，整数比较，不开方；半径 0 只覆盖本格。
 *   ⑤ 每人每 tick **投递有硬顶**（`budget`），超出进待发队列，待发也有硬顶，
 *      待发满则挤最旧的并计数（`overflow`）——不静默丢，也不无限堆。
 *   ⑥ 同一 (观察者, 事件) 只投一次；重复投递记 `dup` 且不占预算。
 *   ⑦ **离开不收回**：`leave` 只停止后续投递，已进 inbox 的照旧由 `flush` 取走
 *      （人走了才送达的东西不能说没送到）。
 *   ⑧ 事件坐标同样必须落格（`unplaced`）；事件没有 `id` 时按自增补，去重依赖它。
 *   ⑨ 观察者数有硬顶（`maxObservers`），超出拒收 `too-many`——格子集合是每次移动都要
 *      重算的东西，无界就是 O(观察者 × 半径²) 的定时炸弹。
 *   ⑩ 不碰认知与事实：本模块只决定**投递到谁**，投给谁之后那件事算不算「他知道了」
 *      仍归 `epistemic-view` / `knowledge` 判。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_interestface_settings_v1';
  const DEF = { enabled: false, radius: 2, budget: 4, maxPending: 8, maxObservers: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'interestFace',
    bounds: { radius: [0, 16], budget: [1, 16], maxPending: [1, 32], maxObservers: [4, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) {
    const val = Object.assign({}, DEF, next || {});
    if (!WA.settingsBus) { shadow = val; return val; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, val));
  }

  const stat = { placed: 0, moved: 0, sameCell: 0, publishes: 0, delivered: 0, dup: 0,
    overflow: 0, pending: 0, refused: 0, focusHits: 0, lastReason: '' };
  const CELL_SPAN = 256;
  const observers = {};   // id -> { x, y, radius, cells, inbox, pending, seen, lastRecalc, maxPending }
  let focus = null;       // { x, y }
  let seq = 0;

  function refuse(reason, extra) { stat.refused++; stat.lastReason = reason; return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function intId(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim().slice(0, 40);
  }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && (v | 0) === v; }
  function clampCell(v) { const n = v % CELL_SPAN; return n < 0 ? n + CELL_SPAN : n; }
  // FNV-1a：同名地点恒落同一格（只有地名没有坐标的调用方走这里）。
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function coordOf(x, y) {
    if (isInt(x) && isInt(y)) return { x: clampCell(x), y: clampCell(y) };
    if (typeof x === 'string' && x && !isInt(y)) {
      const h = fnv(x);
      return { x: h % CELL_SPAN, y: (h >>> 8) % CELL_SPAN };
    }
    return null;
  }
  function key(x, y) { return x + ':' + y; }
  function cheb(ax, ay, bx, by) { const dx = Math.abs(ax - bx), dy = Math.abs(ay - by); return dx > dy ? dx : dy; }
  function tally() { return Object.keys(observers).length; }

  /** 重算某人的覆盖格集合（③ 只允许跨格时调）。 */
  function recalc(o, cfg, at) {
    const r = o.radius;
    const cells = [];
    if (r === 0) cells.push(key(o.x, o.y));
    else {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) cells.push(key(clampCell(o.x + dx), clampCell(o.y + dy)));
      }
    }
    o.cells = cells;
    o.lastRecalc = at;
    return cells;
  }

  function tierOf(o, d) {
    const r = o.radius;
    if (d === 0 || r === 0) return 'near';
    if (d * 3 <= r) return 'near';
    if (d * 3 <= r * 2) return 'mid';
    return 'far';
  }

  /** 落位：首次登记一个观察者。 */
  function place(id, x, y, opt) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = intId(id);
    if (!o) return refuse('bad-id');
    const c = coordOf(x, y);
    if (!c) return refuse('unplaced', { given: String(x) });
    if (!observers[o] && tally() >= cfg.maxObservers) return refuse('too-many', { limit: cfg.maxObservers });
    const rad = opt && opt.radius !== undefined ? opt.radius : cfg.radius;
    if (!isInt(rad) || rad < 0) return refuse('bad-radius');
    // 重复落位保留已收内容：重登不等于重新出生，inbox / 待发 / 去重表都不许清。
    const prev = observers[o];
    observers[o] = { x: c.x, y: c.y, radius: rad, cells: [],
      inbox: prev ? prev.inbox : [], pending: prev ? prev.pending : [],
      seen: prev ? prev.seen : {}, lastRecalc: 0, maxPending: cfg.maxPending };
    recalc(observers[o], cfg, Date.now());
    stat.placed++; stat.lastReason = 'ok';
    return { ok: true, reason: 'ok', id: o, x: c.x, y: c.y, radius: rad, cells: observers[o].cells.length };
  }

  /** 落位或移动：没有登记就落位，登记过就走 move（④ 语义由 move 自己守）。 */
  function put(id, x, y, opt) {
    const o = intId(id);
    if (!o) return refuse('bad-id');
    if (!observers[o]) return place(o, x, y, opt);
    return move(o, x, y);
  }

  /** 移动：③ 同格不重算。 */
  function move(id, x, y) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = intId(id);
    if (!o) return refuse('bad-id');
    const v = observers[o];
    if (!v) return refuse('missing');
    const c = coordOf(x, y);
    if (!c) return refuse('unplaced', { given: String(x) });
    if (c.x === v.x && c.y === v.y) { stat.sameCell++; stat.lastReason = 'same-cell'; return { ok: true, reason: 'same-cell', x: c.x, y: c.y }; }
    v.x = c.x; v.y = c.y;
    recalc(v, cfg, Date.now());
    stat.moved++; stat.lastReason = 'ok';
    return { ok: true, reason: 'ok', x: c.x, y: c.y, cells: v.cells.length };
  }

  function leave(id) {
    const o = intId(id);
    if (!observers[o]) return { ok: false, reason: 'missing' };
    delete observers[o];
    return { ok: true, reason: 'ok', left: o };
  }

  function setRadius(id, radius) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = intId(id);
    const v = observers[o];
    if (!v) return refuse('missing');
    if (!isInt(radius) || radius < 0) return refuse('bad-radius');
    v.radius = radius;
    recalc(v, cfg, Date.now());
    return { ok: true, reason: 'ok', radius: radius, cells: v.cells.length };
  }

  /** 镜头焦点：该格对全体恒可见（等价 distance 0）。 */
  function setFocus(x, y) {
    if (x === null || x === undefined) { focus = null; return { ok: true, reason: 'cleared' }; }
    const c = coordOf(x, y);
    if (!c) return refuse('unplaced', { given: String(x) });
    focus = c;
    return { ok: true, reason: 'ok', x: c.x, y: c.y };
  }

  function push(v, row, budget) {
    // ⑥ 去重不占预算
    if (v.seen[row.eid]) { stat.dup++; return 'dup'; }
    v.seen[row.eid] = 1;
    if (v.inbox.length < budget) { v.inbox.push(row); stat.delivered++; return 'delivered'; }
    if (v.pending.length >= v.maxPending) { v.pending.shift(); stat.overflow++; }
    v.pending.push(row);
    stat.pending++;
    return 'pending';
  }

  /** 发一件事：按各人兴趣面分别投递。 */
  function publish(ev) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const e = ev && typeof ev === 'object' ? ev : {};
    const c = coordOf(e.x, e.y);
    if (!c) return refuse('unplaced', { given: String(e.x) });
    if (!e.kind) return refuse('bad-kind');
    const eid = intId(e.id) || ('if_' + (++seq));
    stat.publishes++;
    const hits = [];
    let focusHit = false;
    if (focus && focus.x === c.x && focus.y === c.y) focusHit = true;
    Object.keys(observers).forEach(function (id) {
      const v = observers[id];
      const d = cheb(v.x, v.y, c.x, c.y);
      const inFace = focusHit || d <= v.radius;
      if (!inFace) return;
      if (focusHit) stat.focusHits++;
      const row = { eid: eid, kind: String(e.kind).slice(0, 24), x: c.x, y: c.y,
        distance: d, tier: focusHit ? 'focus' : tierOf(v, d), at: Number.isFinite(e.at) ? e.at : Date.now() };
      hits.push({ id: id, via: push(v, row, cfg.budget), tier: row.tier });
    });
    stat.lastReason = 'ok';
    return { ok: true, reason: 'ok', eid: eid, x: c.x, y: c.y, hits: hits.length, focus: focusHit, detail: hits };
  }

  /** 取走本 tick：返回并按人清空 inbox；待发按原序补位（下一 tick 才投）。 */
  function flush() {
    const out = {};
    Object.keys(observers).forEach(function (id) {
      const v = observers[id];
      if (v.inbox.length) out[id] = v.inbox.slice();
      v.inbox = [];
      v.seen = {};
      while (v.pending.length) { v.inbox.push(v.pending.shift()); stat.pending--; }
    });
    return { ok: true, count: Object.keys(out).length, boxes: out };
  }

  function inboxOf(id) {
    const v = observers[intId(id)];
    if (!v) return { ok: false, reason: 'missing' };
    return { ok: true, count: v.inbox.length, rows: v.inbox.slice(), pending: v.pending.length };
  }

  function covers(id, x, y) {
    const v = observers[intId(id)];
    if (!v) return { ok: false, reason: 'missing' };
    const c = coordOf(x, y);
    if (!c) return { ok: false, reason: 'unplaced' };
    const d = cheb(v.x, v.y, c.x, c.y);
    return { ok: true, covered: d <= v.radius, distance: d, radius: v.radius };
  }

  function list() {
    return { ok: true, count: tally(), focus: focus ? { x: focus.x, y: focus.y } : null,
      rows: Object.keys(observers).map(function (id) {
        const v = observers[id];
        return { id: id, x: v.x, y: v.y, radius: v.radius, cells: v.cells.length, inbox: v.inbox.length, pending: v.pending.length };
      }) };
  }

  function snapshot() {
    const keep = {};
    Object.keys(observers).forEach(function (id) {
      const v = observers[id];
      keep[id] = { x: v.x, y: v.y, radius: v.radius, inbox: v.inbox.slice(), pending: v.pending.slice() };
    });
    return { ok: true, focus: focus ? { x: focus.x, y: focus.y } : null, observers: keep, seq: seq };
  }
  function restore(snap) {
    const s = snap && typeof snap === 'object' ? snap : null;
    if (!s) return refuse('bad-snapshot');
    const cfg = settings();
    Object.keys(observers).forEach(function (k) { delete observers[k]; });
    focus = s.focus && isInt(s.focus.x) ? { x: clampCell(s.focus.x), y: clampCell(s.focus.y) } : null;
    seq = isInt(s.seq) ? s.seq : 0;
    Object.keys(s.observers || {}).forEach(function (id) {
      const v = s.observers[id];
      if (!v || !isInt(v.x) || !isInt(v.y)) return;
      const o = { x: clampCell(v.x), y: clampCell(v.y), radius: isInt(v.radius) ? v.radius : cfg.radius,
        cells: [], inbox: Array.isArray(v.inbox) ? v.inbox.slice() : [],
        pending: Array.isArray(v.pending) ? v.pending.slice() : [], seen: {},
        lastRecalc: 0, maxPending: cfg.maxPending };
      recalc(o, cfg, Date.now());
      observers[id] = o;
    });
    return { ok: true, reason: 'ok', count: tally() };
  }

  function statOf() { return Object.assign({}, stat, { live: tally() }); }

  WA.interestFace = { place: place, put: put, move: move, leave: leave, setRadius: setRadius, setFocus: setFocus,
    publish: publish, flush: flush, inboxOf: inboxOf, covers: covers, list: list,
    snapshot: snapshot, restore: restore, stat: statOf, settings: settings, saveSettings: saveSettings,
    REG: __REG, DEF: DEF, CELL_SPAN: CELL_SPAN };
})();