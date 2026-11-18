/**
 * WorldAxis engines/arc-settle.js (v2.524.0) — EXV29-14 卷末结算
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场读数：`卷末|arcSettle` **0 命中**。`chapters.js`（3.2KB）只做**章节切分**，
 *   切完就完了：一卷结束没有任何"这一卷到底发生了什么"的清单。
 *   于是长篇写到第五卷，读者（和 AI 自己）都说不出前四卷各自留下了什么。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   一卷一个账本，三栏记账：**发生了什么**（happened）/ **谁变了**（changed）/
 *   **留下什么**（left）。每条都必须带 `owner`（归到哪个人/哪件事上）。
 *   `close({arc})` 出结算清单，并把这一卷**封上**：封上之后不再收新条目。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 无主不入账：`owner` 为空 ⇒ `missing-fields`（不许"总之发生了些事"）。
 *   ② 本卷没发生的不进结算：`add` 只能写进**指定那一卷**；写别的卷 ⇒ `unknown-arc`。
 *   ③ 封卷只读：`sealed:true` 之后再 `add` ⇒ `ok:false` + `reason:'already-closed'`（负控制）。
 *   ④ 空卷不冒充：一条都没记就 `close` ⇒ `empty:true` 并明说"这卷没记什么"。
 *   ⑤ 有界：最多 8 卷，每卷最多 24 条（与 `__BOUNDED_CAPS` 对齐）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'arcSettle';
  const ARC_CAP = 8;
  const ROW_CAP = 24;
  const KINDS = ['happened', 'changed', 'left'];
  const CN = { happened: '发生了什么', changed: '谁变了', left: '留下什么' };
  const stat = { opened: 0, added: 0, closed: 0, rejected: 0, badInput: 0 };
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
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'arc:settle');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 48);
  }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('arcSettle'); } catch (e) { return Date.now(); } })(); }
    catch (e) { return Date.now(); }
  }
  function capIt(m) {
    const ks = Object.keys(m);
    if (ks.length <= ARC_CAP) return m;
    ks.sort(function (a, b) { return ((m[a].at || 0) - (m[b].at || 0)); });
    ks.slice(0, ks.length - ARC_CAP).forEach(function (k) { delete m[k]; });
    return m;
  }

  function open(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const arc = clean(src.arc, 24);
    if (!arc) return refuse('missing-fields', { missing: ['arc'] });
    const m = readAll();
    const existed = !!m[arc];
    m[arc] = m[arc] || { arc: arc, rows: [], sealed: false, at: nowAt() };
    writeAll(capIt(m));
    stat.opened++;
    return { ok: true, reason: 'ok', arc: arc, created: !existed,
      note: existed ? '这卷已经在记了' : '开卷：这一卷的账从此记在这里' };
  }

  function add(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const arc = clean(src.arc, 24);
    const kind = clean(src.kind, 12) || 'happened';
    const owner = clean(src.owner, 32);
    const what = clean(src.what, 80);
    const missing = [];
    if (!arc) missing.push('arc');
    if (!owner) missing.push('owner');
    if (!what) missing.push('what');
    if (missing.length) return refuse('missing-fields', { missing: missing, why: '无主的条目不入账' });
    if (KINDS.indexOf(kind) < 0) return refuse('unknown-kind', { field: 'kind', got: kind, allowed: KINDS.slice() });
    const m = readAll();
    const box = m[arc];
    if (!box) return refuse('unknown-kind', { field: 'arc', got: arc, why: '这一卷还没开（先 open）' });
    if (box.sealed) { stat.rejected++; return { ok: false, reason: 'already-closed', arc: arc, note: '这一卷已经封了：封卷只读，不许再补' }; }
    box.rows.push({ kind: kind, owner: owner, what: what, at: nowAt() });
    while (box.rows.length > ROW_CAP) box.rows.shift();
    box.at = nowAt();
    writeAll(capIt(m));
    stat.added++;
    return { ok: true, reason: 'ok', arc: arc, kind: kind, kindCN: CN[kind], owner: owner, what: what,
      count: box.rows.length, note: '记一条：' + CN[kind] + '（归到「' + owner + '」）' };
  }

  /** 出结算：三栏摊开；一条都没记就明说没记。 */
  function close(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const arc = clean(src.arc, 24);
    if (!arc) return refuse('missing-fields', { missing: ['arc'] });
    const m = readAll();
    const box = m[arc];
    if (!box) return refuse('unknown-kind', { field: 'arc', got: arc });
    const wasSealed = box.sealed;
    box.sealed = true;
    writeAll(capIt(m));
    stat.closed++;
    if (!box.rows.length) return { ok: true, reason: 'ok', arc: arc, empty: true, sealed: true, rows: [], note: '这卷一条都没记：结算也是空的（不编）' };
    const by = { happened: [], changed: [], left: [] };
    box.rows.forEach(function (r) { (by[r.kind] = by[r.kind] || []).push(r); });
    const rows = box.rows.map(function (r) {
      return { kind: r.kind, kindCN: CN[r.kind], owner: r.owner, what: r.what };
    });
    return {
      ok: true, reason: 'ok', arc: arc, empty: false, sealed: true, rows: rows, counts: {
        happened: (by.happened || []).length, changed: (by.changed || []).length, left: (by.left || []).length
      },
      alreadySealed: wasSealed,
      line: '这一卷：' + (by.happened || []).length + ' 件事发生、' + (by.changed || []).length + ' 个人变了、留下了 '
        + (by.left || []).length + ' 样东西。每条都能追到人。',
      note: '结算只列本卷记下的条目：没记的不编'
    };
  }

  function read(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const arc = clean(src.arc, 24);
    if (!arc) return refuse('missing-fields', { missing: ['arc'] });
    const box = readAll()[arc];
    if (!box) return { ok: false, reason: 'unknown-kind', field: 'arc', got: arc };
    return { ok: true, reason: 'ok', arc: arc, sealed: !!box.sealed, count: box.rows.length, rows: box.rows.slice(-8) };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() { return ''; }   // 结算由玩家主动要，不占注入面

  WA.arcSettle = {
    KINDS: KINDS.slice(), CN: Object.assign({}, CN), ARC_CAP: ARC_CAP, ROW_CAP: ROW_CAP,
    open: open, add: add, close: close, read: read, buildBlock: buildBlock, stat: statOf
  };
})();