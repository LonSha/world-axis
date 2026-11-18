/**
 * WorldAxis engines/world-bounds.js (v2.524.0) — EXV29-31/32/33/34/35/36 时间的边界
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   玩家不在、来得太密、跑得太长——三种情况下世界都会乱：
 *     · 离线三十天回来，现场一次性补一堆事件（"世界不打盹"变成"世界等你回来才动"）；
 *     · 回来第一段正文不交代"你走之后"，或交代的和自转日志对不上；
 *     · 玩家想让世界定住，现场没有这个开关（只能靠闭嘴不说）；
 *     · 同一时刻几件事**并列堆砌**，分不出主次，也说不清谁先谁后；
 *     · 长档压缩时连因果与承诺一起删掉，之后再也查不出"为什么"；
 *     · 一局跑了三百楼，没人给"该收了"的读数（`finale` 只判条件，不报长度）。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `away` 按天数给事件上界并如实报"走了几件"；`returning` 走 `worldBrief.oneLine`
 *   说第一句；`pause`/`resume` 是**开关**（暂停期间自转产出恒 0、复原不补涨）；
 *   `order` 按因果时刻 + 可见性 + 分量排序（不并列）；`compress` 压缩但**不许连根删**；
 *   `length` 给一局的长度读数与"该收尾了"（不阻断）。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不补一堆：`away` 的事件数超上界 ⇒ `exceed:true` 并给出该留下的条数（读数，不拦）。
 *   ② 不许空话：`returning` 拿不到 `worldBrief.oneLine` ⇒ `module-missing`（不编一句）。
 *   ③ 暂停就是零：`selfTick` 在暂停期恒 `produced:0`；`resume` 恒 `makeup:false`。
 *   ④ 不许并列：`order` 的 `rank` 严格递增（同刻同权按入参顺序，不掷骰）。
 *   ⑤ 不许连根删：被因果链/承诺引用的楼层不许压缩掉 ⇒ `bad-scope`。
 *   ⑥ 有界：事件最多 16 条一轮（与 `__BOUNDED_CAPS` 对齐）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'worldBounds';
  const EVENT_CAP = 16;
  const EVENTS_PER_DAY = 1;
  const AWAY_MAX = 12;
  const LONG_ROUNDS = 240;
  const stat = { aways: 0, returns: 0, pauses: 0, resumes: 0, orders: 0, compresses: 0, refusals: 0 };
  let shadow = null;

  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 40);
  }
  function refuse(code, extra) {
    stat.refusals++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function nowAt() {
    try { return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('worldBounds') : Date.now(); }
    catch (e) { return Date.now(); }
  }
  function box() {
    let m = null;
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      m = all[STORE_KEY];
    } catch (e) { m = null; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) m = shadow || {};
    return { paused: m.paused === true, pausedAt: Number(m.pausedAt) || 0, pausedBy: clean(m.pausedBy, 40) || '' };
  }
  function save(b) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = b; return false; }
      WA.store.transact(function (d) { d[STORE_KEY] = b; return true; }, 'world:bounds');
      return true;
    } catch (e) { shadow = b; return false; }
  }

  /** EXV29-31 世界不打盹：离线多久都只走合理数量，并报"走了几件"。 */
  function away(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const days = Number(src.days);
    if (!isFinite(days) || days < 0) return refuse('missing-fields', { missing: ['days'] });
    const reported = Number(src.events);
    if (!isFinite(reported) || reported < 0) return refuse('missing-fields', { missing: ['events'] });
    const allowed = Math.min(AWAY_MAX, Math.max(1, Math.round(days * EVENTS_PER_DAY)));
    const exceed = reported > allowed;
    stat.aways++;
    return {
      ok: true, reason: 'ok', days: days, events: reported, allowed: allowed, exceed: exceed,
      keep: exceed ? allowed : reported,
      line: '你走了 ' + days + ' 天，世界自己走了 ' + Math.min(reported, allowed) + ' 件'
        + (exceed ? ('（原本报了 ' + reported + ' 件，多的 ' + (reported - allowed) + ' 件不算：世界不会等你回来才动）') : ''),
      note: exceed ? '超上界：按 ' + allowed + ' 件收（读数，不拦你继续）' : '在合理范围内'
    };
  }

  /** EXV29-32 回来的第一句：交代"你走之后"——**必须**来自 worldBrief.oneLine（不编空话）。 */
  function returning(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const WB = WA.worldBrief;
    if (!WB || typeof WB.oneLine !== 'function') return refuse('module-missing', { module: 'worldBrief' });
    let r = null;
    try { r = WB.oneLine(); } catch (e) { r = null; }
    const line = (r && (r.line || r.text || (typeof r === 'string' ? r : ''))) || '';
    if (!line) return refuse('not-happened', { why: '自转日志此刻没有可交代的事：不编一句空话' });
    stat.returns++;
    return {
      ok: true, reason: 'ok', line: line, from: 'worldBrief.oneLine',
      days: Number.isFinite(Number(src.days)) ? Number(src.days) : null,
      note: '第一段正文先交代这一句：它是自转日志的读数，不是凭感觉写的'
    };
  }

  /** EXV29-33 世界的暂停权：定住 / 复原。 */
  function pause(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const b = box();
    if (b.paused) return { ok: false, reason: 'already', pausedAt: b.pausedAt, note: '世界已经定住了' };
    const by = clean(src.by, 40) || 'player';
    save({ paused: true, pausedAt: nowAt(), pausedBy: by });
    stat.pauses++;
    return { ok: true, reason: 'ok', paused: true, by: by, note: '世界定住了：只保留你的行动，自转暂停' };
  }
  function resume() {
    const b = box();
    if (!b.paused) return { ok: false, reason: 'not-happened', note: '世界没被定住过' };
    save({ paused: false, pausedAt: 0, pausedBy: '' });
    stat.resumes++;
    return { ok: true, reason: 'ok', paused: false, makeup: false,
      note: '复原：定住期间的一律不补（`makeup:false`——把暂停当成"世界少走几步"，不是"攒着回来补涨"）' };
  }
  /** 自转产出闸：暂停期恒 0。 */
  function selfTick(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const b = box();
    const want = Number(src.events);
    const events = isFinite(want) && want > 0 ? Math.min(want, EVENT_CAP) : 0;
    if (b.paused) {
      return { ok: true, reason: 'ok', paused: true, produced: 0, suppressed: events,
        note: '世界定住中：本轮自转产出 0（要发生的 ' + events + ' 件先压着）' };
    }
    return { ok: true, reason: 'ok', paused: false, produced: events, suppressed: 0, note: '自转照常' };
  }

  /** EXV29-34 同一时刻多事排序：因果时刻 → 可见性 → 分量；rank 严格递增。 */
  function order(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const list = Array.isArray(src.events) ? src.events : [];
    if (!list.length) return refuse('missing-fields', { missing: ['events'] });
    if (list.length > EVENT_CAP) return refuse('bad-scope', { got: list.length, cap: EVENT_CAP });
    const rows = list.map(function (e, i) {
      const x = (e && typeof e === 'object') ? e : {};
      const causeOrder = Number.isFinite(Number(x.causeOrder)) ? Number(x.causeOrder) : i;
      const visibility = x.visible === false ? 0 : 1;
      const weight = Number.isFinite(Number(x.weight)) ? Number(x.weight) : 1;
      return { id: clean(x.id, 32) || ('e' + i), causeOrder: causeOrder, visibility: visibility,
        weight: weight, idx: i, why: [] };
    });
    rows.sort(function (a, b) {
      if (a.causeOrder !== b.causeOrder) return a.causeOrder - b.causeOrder;
      if (a.visibility !== b.visibility) return b.visibility - a.visibility;
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.idx - b.idx;   // 同刻同权按入参顺序，不掷骰
    });
    rows.forEach(function (r, i) {
      r.rank = i + 1;
      if (i === 0) r.why.push('因果上最先');
      else {
        const p = rows[i - 1];
        if (r.causeOrder > p.causeOrder) r.why.push('因在前（' + p.causeOrder + '→' + r.causeOrder + '）');
        else if (r.visibility < p.visibility) r.why.push('同刻但玩家看不到：只作背景');
        else if (r.weight < p.weight) r.why.push('同刻同可见，分量较轻');
        else r.why.push('同刻同分量：按入参顺序（不掷骰）');
      }
    });
    stat.orders++;
    return {
      ok: true, reason: 'ok', count: rows.length,
      rows: rows.map(function (r) { return { id: r.id, rank: r.rank, why: r.why }; }),
      first: rows[0].id,
      note: '主次排好了：第一件是「' + rows[0].id + '」，不并列堆砌'
    };
  }

  /** EXV29-35 长档取舍：可以压缩，但不许连根删（因果链与承诺不许丢）。 */
  function compress(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const total = Number(src.total);
    const keep = Number(src.keep);
    if (!isFinite(total) || total <= 0) return refuse('missing-fields', { missing: ['total'] });
    if (!isFinite(keep) || keep <= 0 || keep > total) return refuse('bad-scope', { field: 'keep', got: src.keep, total: total });
    const chainRefs = (Array.isArray(src.chainRefs) ? src.chainRefs : []).map(function (x) { return Number(x); }).filter(function (x) { return isFinite(x); });
    const promises = (Array.isArray(src.promises) ? src.promises : []).map(function (x) { return Number(x); }).filter(function (x) { return isFinite(x); });
    const from = total - keep + 1;     // 保留 [from, total]
    const droppedRefs = chainRefs.concat(promises).filter(function (n) { return n < from; });
    if (droppedRefs.length) {
      return refuse('bad-scope', { from: from, total: total, droppedRefs: droppedRefs.slice(0, 8),
        why: '不许连根删：被因果链或承诺引用的楼层还在被压缩掉的范围里' });
    }
    stat.compresses++;
    return {
      ok: true, reason: 'ok', total: total, keep: keep, compressedFrom: from,
      preservedChain: chainRefs.length, preservedPromises: promises.length,
      note: '压掉了前 ' + (from - 1) + ' 楼，但 ' + chainRefs.length + ' 条因果与 ' + promises.length + ' 条承诺都还在：' +
        '压缩之后仍答得出"为什么"'
    };
  }

  /** EXV29-36 一局的长度：读数 + "该收尾了"（不阻断）。 */
  function length() {
    let round = 0;
    try { round = (WA.evolution && typeof WA.evolution.roundOf === 'function') ? (WA.evolution.roundOf(WA.store.get()) || 0) : 0; }
    catch (e) { round = 0; }
    const long = round >= LONG_ROUNDS;
    let finaleReady = false;
    try {
      const st = (WA.finale && typeof WA.finale.state === 'function') ? WA.finale.state() : null;
      finaleReady = !!(st && st.judged && st.last && st.last.ready);
    } catch (e) { finaleReady = false; }
    return {
      ok: true, reason: 'ok', round: round, threshold: LONG_ROUNDS, long: long, finaleReady: finaleReady,
      hint: long ? '这一局已经跑到 ' + round + ' 楼：够长了，该想想怎么收（收不收由你）'
        : '还在 ' + round + ' 楼：不收也行',
      note: '只是提示，不阻断继续'
    };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const b = box();
    const l = length();
    if (b.paused) return '【定住】世界此刻是定住的（' + (b.pausedBy || '玩家') + '）：只写玩家行动，别让世界自己动。';
    if (l.long) return '【长度】已经 ' + l.round + ' 楼：这局够长了，收尾的事该提上来了。';
    return '';
  }

  WA.worldBounds = {
    EVENT_CAP: EVENT_CAP, EVENTS_PER_DAY: EVENTS_PER_DAY, AWAY_MAX: AWAY_MAX, LONG_ROUNDS: LONG_ROUNDS,
    away: away, returning: returning, pause: pause, resume: resume, selfTick: selfTick,
    order: order, compress: compress, length: length, buildBlock: buildBlock, stat: statOf
  };
})();