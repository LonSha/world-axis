/**
 * WorldAxis engines/loose-ends.js (v2.524.0) — EXV29-15 未收的线给交代
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   完结时最常见的烂尾不是"没写完"，而是**写了一半不认**：那条支线、那个约定、
 *   那个只露过一面的人——故事结束了，它们连一句"后来怎样"都没有。
 *   现场 `dormant-ladder` 有六态阶梯（未闻/听闻/未确认/已介入/已错过/已了结），
 *   但它只投影"玩家知道什么"，**不负责给结局**。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   每条线一个状态（六态白名单）+ 一条 `fate`（"它后来怎样"）。
 *   完结时 `settle()` 把还没交代的线**逐条点名**，`close({id, fate})` 逐条写交代。
 *   **不复活全条，只给后果**：`fate` 是一句话，不是一段戏。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不许留白：`close` 缺 `fate` ⇒ `missing-fields`（空串也算缺，负控制）。
 *   ② 状态必须六态之一：别的值 ⇒ `unknown-kind`。
 *   ③ 不编线：没 `add` 过的 id ⇒ `not-happened`（不替玩家想出一条支线）。
 *   ④ 交代只写一次：已交代的线再 `close` ⇒ `already`，内容不被覆盖（不许改口）。
 *   ⑤ 有界：最多 32 条线（与 `__BOUNDED_CAPS` 对齐）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'looseEnds';
  const CAP = 32;
  // 与 dormant-ladder 的六态对齐（那一层管"玩家知道什么"，这一层管"它后来怎样"）
  const STATES = ['unheard', 'heard', 'unconfirmed', 'engaged', 'missed', 'settled'];
  const CN = {
    unheard: '未闻', heard: '听闻', unconfirmed: '未确认',
    engaged: '已介入', missed: '已错过', settled: '已了结'
  };
  const stat = { added: 0, closed: 0, rejected: 0, badInput: 0 };
  let shadow = null;

  function refuse(code, extra) {
    stat.badInput++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function readAll() {
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      const m = all[STORE_KEY];
      return (m && typeof m === 'object' && !Array.isArray(m)) ? m : (shadow || {});
    } catch (e) { return shadow || {}; }
  }
  function writeAll(m) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = m; return false; }
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'loose:ends');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 60);
  }
  function nowAt() {
    try { return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('looseEnds') : Date.now(); }
    catch (e) { return Date.now(); }
  }
  function capIt(m) {
    const ks = Object.keys(m);
    if (ks.length <= CAP) return m;
    ks.sort(function (a, b) { return ((m[a].at || 0) - (m[b].at || 0)); });
    ks.slice(0, ks.length - CAP).forEach(function (k) { delete m[k]; });
    return m;
  }

  /** 登记/更新一条线（状态六态白名单）。 */
  function add(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const id = clean(src.id, 32);
    const state = clean(src.state, 16) || 'heard';
    const what = clean(src.what, 60);
    const missing = [];
    if (!id) missing.push('id');
    if (!what) missing.push('what');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    if (STATES.indexOf(state) < 0) return refuse('unknown-kind', { field: 'state', got: state, allowed: STATES.slice() });
    const m = readAll();
    const prev = m[id];
    m[id] = {
      id: id, what: what, state: state, at: prev ? (prev.at || nowAt()) : nowAt(),
      fate: prev ? (prev.fate || '') : '', closedAt: prev ? (prev.closedAt || 0) : 0
    };
    writeAll(capIt(m));
    stat.added++;
    return { ok: true, reason: 'ok', id: id, what: what, state: state, stateCN: CN[state],
      created: !prev, note: prev ? '这条线已记过：本次只刷状态' : '记一条线：完结时要给它一句交代' };
  }

  /** 给一条线写"它后来怎样"（一句话，不是一段戏）。不许留白，不许改口。 */
  function close(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const id = clean(src.id, 32);
    const fate = clean(src.fate, 80);
    const missing = [];
    if (!id) missing.push('id');
    if (!fate) missing.push('fate');
    if (missing.length) return refuse('missing-fields', { missing: missing, why: '不许留白：必须写它后来怎样' });
    const m = readAll();
    const row = m[id];
    if (!row) return { ok: false, reason: 'not-happened', id: id, note: '没有这条线：不替玩家想出一条' };
    if (row.fate) { stat.rejected++; return { ok: false, reason: 'already', id: id, fate: row.fate, note: '这条已经交代过了：不许改口' }; }
    row.fate = fate;
    row.state = 'settled';
    row.closedAt = nowAt();
    writeAll(capIt(m));
    stat.closed++;
    return { ok: true, reason: 'ok', id: id, state: 'settled', stateCN: CN.settled, fate: fate,
      line: row.what + '——' + fate, note: '交代已写：只给后果，不复活整条线' };
  }

  /** 还没交代的线（完结前必看的一屏）。 */
  function settle() {
    const m = readAll();
    const ks = Object.keys(m);
    if (!ks.length) return { ok: true, reason: 'ok', empty: true, rows: [], note: '还没有任何支线登记' };
    const open = ks.map(function (k) { return m[k]; }).filter(function (r) { return !r.fate; });
    const rows = open.map(function (r) { return { id: r.id, what: r.what, state: r.state, stateCN: CN[r.state] }; });
    return {
      ok: true, reason: 'ok', empty: false, open: rows.length, total: ks.length, rows: rows,
      note: rows.length ? ('还有 ' + rows.length + ' 条线没交代：完结前逐条写"它后来怎样"')
        : '每条线都有交代了：没有烂尾'
    };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const s = settle();
    if (s.empty || !s.open) return '';
    return '【未收的线】还有 ' + s.open + ' 条没交代（' + s.rows.slice(0, 3).map(function (r) { return r.what; }).join('、')
      + '）：真要收尾，得给它们一句"后来怎样"。';
  }

  WA.looseEnds = {
    STATES: STATES.slice(), CN: Object.assign({}, CN), CAP: CAP,
    add: add, close: close, settle: settle, buildBlock: buildBlock, stat: statOf
  };
})();