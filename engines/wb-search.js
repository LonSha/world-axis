/**
 * WorldAxis engines/wb-search.js (v2.129.0) — 世界书条目实时搜索（缝 A10）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓的 `engines/worldbook.js` 已经能列出条目、预览激活（`previewActivation`）、
 *   算命中键（`matchKey`）、报「选了几条、注入几条」，但**没有任何一处能按字面找条目**：
 *   用户要找「哪一条写过玄铁令」，只能自己把几十上百条一条条展开看。
 *   「条目多到找不到」与「条目根本不存在」在面板上是同一幅画面（都是「没看见」），
 *   而这两件事的下一步动作完全相反。全仓 `searchEntry` / `条目搜索` / `模糊搜索` 零命中。
 *
 *   缝合来源：st-direct-event 的「世界书副 API 注入管理与即时搜索过滤」——
 *   原文口径：「世界书弹窗内置即时搜索框，支持同时对**条目标题、关键词与正文设定**
 *   进行模糊过滤，未命中条目即时隐藏，并动态显示匹配计数（如：共 25 条，匹配 3 条）」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `search(q, opts)` —— 对**当前缓存条目**做三面匹配（title / keys / content），返回命中行 + 计数；
 *   ② `facesOf(hit)` —— 告诉调用方「命中的是哪一面」（标题/关键词/正文），供面板分高亮；
 *   ③ `stat()` —— 记几个数（搜几次、命中几条、拒收几次）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **不重新实现匹配逻辑**：单串匹配一律走 `WA.worldbook.matchKey`（它已经把正则键、
 *      大小写、全词匹配三种形态给全了）。本模块只负责「把**哪一段**拿去比」与「三面怎么合」，
 *      不把「怎么写才算命中」再写一遍（那正是两套口径漂移的起点）。
 *   2 **不读世界、不读盘、不改任何状态**：数据源只有 `worldbook.peekEntries()`（条目缓存）。
 *      本模块不调 `loadCurrentEntries`（那会重新拉条并重写缓存——搜索动作不得有副作用），
 *      不调 `store.transact`，不写 localStorage，不产 evict 站点、不进 `__BOUNDED_CAPS`。
 *   3 **不替调用方截断结果**：命中多少报多少（`total` / `matched`）。截断发生在面板渲染层，
 *      不发生在判据层——「只显示前 5 条」与「实际只有 5 条」是两件事，混了就无法对账。
 *   4 空查询词拒收 `empty-text`；非字符串查询词拒收 `bad-type`（**不**把 undefined 当空串搜全量）。
 *   5 `limit` 只影响返回的 `rows` 条数，**不影响 `matched`**（计数永远是全量命中数）——
 *      否则面板会把「命中 3 条」显示成「命中 2 条」。
 *   6 `opts` 只接受 `{fields, limit}`：字段名白名单是 `title` / `keys` / `content`，
 *      未知字段名整条拒收 `bad-value`（静默忽略会让调用方以为「我限定了只搜标题」）。
 *   7 **可搜空**：缓存为空不是错误，是 `{ok:true, matched:0, empty:true}`——
 *      「还没拉条目」与「搜了但没中」必须能分开（前者要去拉，后者要改词）。
 *   8 **不进注入面**：搜索是面板动作，不是「本轮该让模型看到的世界状态」——
 *      故本模块不产 `buildBlock`、不在 `SOURCES` 里占位。
 *   9 无总开关（恒开）：它只读一份已经在内存里的数组，关闭它没有任何代价收益，
 *      而「搜索搜不了」是一眼就能看见的坑（与 request-viewer 的落账动作不同——
 *      那个有存留与泄露代价，才要开关）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const FIELDS = ['title', 'keys', 'content'];

  const stat = { searches: 0, matchedTotal: 0, returned: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }

  function entries() {
    try { return (WA.worldbook && typeof WA.worldbook.peekEntries === 'function') ? (WA.worldbook.peekEntries() || []) : []; }
    catch (e) { return []; }
  }
  function hit(text, needle, entry) {
    const cs = !!(entry && entry.caseSensitive), mw = !!(entry && entry.matchWholeWords);
    if (WA.worldbook && typeof WA.worldbook.matchKey === 'function') return !!WA.worldbook.matchKey(String(text == null ? '' : text), needle, cs, mw);
    const t = String(text == null ? '' : text);
    return cs ? t.indexOf(needle) >= 0 : t.toLowerCase().indexOf(String(needle).toLowerCase()) >= 0;
  }
  /** 三面分别是拿什么去比：标题用条目标题，关键词用每条 key，正文用 content（**全文**，不截断）。 */
  function facesOf(entry, needle) {
    const out = [];
    if (hit(entry.title, needle, entry)) out.push('title');
    const keys = Array.isArray(entry.keys) ? entry.keys : [];
    if (keys.some(function (k) { return hit(k, needle, entry); })) out.push('keys');
    if (hit(entry.content, needle, entry)) out.push('content');
    return out;
  }
  /** 摘要（面相用）：把命中位置附近切一截出来，没命中正文就不给摘要。 */
  function snippet(entry, needle) {
    const c = String(entry.content || '');
    if (!c) return '';
    const cs = !!entry.caseSensitive;
    const hay = cs ? c : c.toLowerCase();
    const ndl = cs ? needle : String(needle).toLowerCase();
    const at = hay.indexOf(ndl);
    if (at < 0) return c.slice(0, 60);
    const from = Math.max(0, at - 20);
    return (from > 0 ? '…' : '') + c.slice(from, from + 80) + (from + 80 < c.length ? '…' : '');
  }

  function normFields(f) {
    if (f === undefined || f === null) return FIELDS.slice();
    if (!Array.isArray(f) || !f.length) return null;
    const out = [];
    for (let i = 0; i < f.length; i++) {
      const k = clean(f[i], 16).toLowerCase();
      if (FIELDS.indexOf(k) < 0) return null;                 // 未知字段整条拒收，不静默忽略
      if (out.indexOf(k) < 0) out.push(k);
    }
    return out.length ? out : null;
  }

  /**
   * 搜索当前缓存条目（三面：标题 / 关键词 / 正文）。**纯读**（边界 2）。
   * @param {string} q 查询词（必填）
   * @param {object} [opts] { fields: string[], limit: number }
   */
  function search(q, opts) {
    const o = opts || {};
    if (q === undefined || q === null) { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: '查询词必填' }; }
    if (typeof q !== 'string') { noteFault('bad-type'); return { ok: false, reason: 'bad-type', detail: '查询词必须是字符串' }; }
    const needle = q.trim();
    if (!needle) { noteFault('empty-text'); return { ok: false, reason: 'empty-text', detail: '查询词不得为空' }; }
    const fields = normFields(o.fields);
    if (fields === null) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', fields: o.fields, known: FIELDS.slice() }; }
    let limit = 0;
    if (o.limit !== undefined && o.limit !== null) {
      limit = Number(o.limit);
      if (!isFinite(limit) || limit < 0) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', detail: 'limit 必须是非负数' }; }
    }
    const all = entries();
    const hits = [];
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (!e || typeof e !== 'object') continue;
      // 命中面按 fields 过滤：`opts.fields` 是**判据面**不是展示面——
      //   若只把返回值筛一遍，调用方说「只搜标题」却拿到正文命中，等于声明被静默忽略。
      const faces = facesOf(e, needle).filter(function (f) { return fields.indexOf(f) >= 0; });
      if (!faces.length) continue;
      hits.push({ id: e.id, uid: e.uid, world: e.world, title: e.title,
        disabled: !!e.disabled, constant: !!e.constant, faces: faces,
        keys: Array.isArray(e.keys) ? e.keys.slice(0, 8) : [],
        chars: String(e.content || '').length, snippet: snippet(e, needle) });
    }
    const matched = hits.length;
    const rows = (limit > 0) ? hits.slice(0, limit | 0) : hits;
    stat.searches++; stat.matchedTotal += matched; stat.returned += rows.length;
    stat.lastReason = matched ? 'matched' : 'no-match';
    return { ok: true, query: needle, fields: fields, total: all.length, matched: matched,
      returned: rows.length, trimmed: rows.length < matched, empty: all.length === 0,
      rows: rows,
      note: '未命中条目已被隐去（返回的 rows 就是命中集）；matched 是全量命中数，limit 只影响 returned。' };
  }

  /** 只要计数（面板的「共 X 条，匹配 Y 条」）：不把命中行拿回来。 */
  function count(q, opts) {
    const r = search(q, opts);
    if (!r.ok) return r;
    return { ok: true, query: r.query, total: r.total, matched: r.matched };
  }
  /** 只搜某一面（便捷面：内部仍走同一份 search，不另造匹配）。 */
  function searchIn(field, q, opts) {
    const o = Object.assign({}, opts || {}, { fields: [field] });
    return search(q, o);
  }

  WA.wbSearch = {
    FIELDS: FIELDS.slice(),
    search: search, count: count, searchIn: searchIn, facesOf: facesOf,
    size: function () { return entries().length; },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/wb-search.js', { kind: 'engine', ver: '2.129.0' });
})();
