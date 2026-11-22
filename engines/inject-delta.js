/**
 * WorldAxis engines/inject-delta.js (v2.524.0)
 * OPV27-9 注入信息增量账：同一事实被多节重复注入（memory / pulse / digest / ledger / world
 *   各来一遍）史无读数——token 预算按节切分，却不按「信息增量」算。本模块**只建读数**：
 *   逐源给出「唯一片段 / 总片段 / 重复率 / 与谁重复」，不改注入内容、不替预算裁决做去重。
 *
 * 为什么不自作主张去重：
 *   1 去重会改正文，属产品行为变更，必须先有读数作依据（「哪几对源真重复了」）。
 *   2 保留哪一份是**优先级决定**（世界状态块 > 叙事摘要 > 舆情），不是片段字符串能决定的。
 *   3 本轮验收口径写的是「先建读数再定策略」，读数就是交付物本身。
 *
 * 边界（全是否定式）：
 *   1 不写存档（无持久键，读数只活在内存 `last`）——体检面不得污染被体检的对象。
 *   2 不改 items / content，只读。
 *   3 片段归一化只做「去空白 + 去首尾标点」，**不做同义词/近义改写**：改写会造出假重复。
 *   4 查无此源时不编理由（返回 ok:false + reason:'no-source'）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_inject_delta_settings_v1';
  const DEF = { enabled: true, maxRows: 24, minLen: 4 };
  const __REG = { key: LS_KEY, def: DEF, module: 'injectDelta', bounds: { maxRows: [4, 64], minLen: [1, 40] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign(base, raw || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { measures: 0, lastAt: 0, lastDupRate: 0, lastSources: 0, off: 0 };
  let last = null;

  /** 片段归一化：去空白、去首尾标点。**不**做近义改写（否则重复是编出来的）。 */
  function normSeg(s) {
    return String(s == null ? '' : s).replace(/\s+/g, '').replace(/^[。；，、：！？…—·"'（）()\[\]【】]+|[。；，、：！？…—·"'（）()\[\]【】]+$/g, '');
  }

  /**
   * 切片段：先按行切，行内再按句末/分号切。
   * 太短的片段（< minLen）丢弃——「对」「是」这类片段在任意两节里都重复，计入只会虚报重复率。
   */
  function segments(text, minLen) {
    const raw = String(text == null ? '' : text);
    const out = [];
    raw.split(/\r?\n/).forEach(function (line) {
      line.split(/[。；！？]/).forEach(function (piece) {
        const n = normSeg(piece);
        if (n.length >= (minLen || 4)) out.push(n);
      });
    });
    return out;
  }

  /**
   * measure(items, opts) —— items: [{source, content}]
   * 口径：按**注入顺序**先后登记，先出现的源拿到唯一，后出现的算重复并记下「与谁重复」。
   *   这正好对上「保留最高优先级源」的去重方向（顺序即优先级）。
   */
  function measure(items, opts) {
    const o = opts || {};
    const s = settings();
    if (!s.enabled) { stat.off++; return { ok: false, reason: 'disabled', rows: [], text: '信息增量账已关闭（settings.injectDelta.enabled=false）', at: clockNow('injectDelta') }; }
    if (!Array.isArray(items)) return { ok: false, reason: 'bad-items', rows: [], text: '入参不是注入源数组（items 非数组）', at: clockNow('injectDelta') };
    const minLen = (typeof o.minLen === 'number' && o.minLen > 0) ? o.minLen : s.minLen;
    const seen = {};          // normSeg -> 首个来源
    const rows = [];
    let totalSegs = 0, uniqueSegs = 0;
    items.forEach(function (it) {
      const src = String((it && it.source) || '').trim() || '(未命名源)';
      const segs = segments(it && it.content, minLen);
      const dupWith = {};
      let uniq = 0;
      segs.forEach(function (n) {
        const owner = seen[n];
        if (owner === undefined) { seen[n] = src; uniq++; }
        else if (owner !== src) { dupWith[owner] = (dupWith[owner] || 0) + 1; }
        else { /* 同一源内部重复：只算总片段，不算跨源重复 */ }
      });
      totalSegs += segs.length; uniqueSegs += uniq;
      const dup = segs.length - uniq;
      rows.push({
        source: src, total: segs.length, unique: uniq, dup: dup,
        dupRate: segs.length ? Math.round((dup / segs.length) * 1000) / 10 : 0,
        dupWith: Object.keys(dupWith).map(function (k) { return { source: k, shared: dupWith[k] }; })
          .sort(function (a, b) { return (b.shared - a.shared) || (a.source < b.source ? -1 : 1); })
      });
      return;
    });
    const dupRate = totalSegs ? Math.round(((totalSegs - uniqueSegs) / totalSegs) * 1000) / 10 : 0;
    const worst = rows.slice().sort(function (a, b) { return (b.dup - a.dup) || (a.source < b.source ? -1 : 1); })[0] || null;
    const res = {
      ok: true,
      at: clockNow('injectDelta'),
      sources: rows.length,
      totalSegs: totalSegs,
      uniqueSegs: uniqueSegs,
      dupSegs: totalSegs - uniqueSegs,
      dupRate: dupRate,
      rows: rows.slice(0, s.maxRows),
      rowsTotal: rows.length,
      worst: worst && worst.dup > 0 ? worst : null,
      text: ''
    };
    res.text = '注入 ' + res.sources + ' 源 / 片段 ' + totalSegs + '（唯一 ' + uniqueSegs + ' · 重复 ' + res.dupSegs
      + '，重复率 ' + dupRate + '%）'
      + (res.worst ? '；重复最重：「' + res.worst.source + '」' + res.worst.dup + '/' + res.worst.total
        + (res.worst.dupWith.length ? '（与「' + res.worst.dupWith[0].source + '」重合 ' + res.worst.dupWith[0].shared + ' 段）' : '')
        : '；无跨源重复');
    stat.measures++; stat.lastAt = res.at; stat.lastDupRate = dupRate; stat.lastSources = rows.length;
    last = res;
    return res;
  }

  /** 单源问答：这节跟谁重复、重复多少。查无此源不编理由。 */
  function explain(source, res) {
    const r = res || last;
    if (!r || !r.ok) return { ok: false, reason: 'no-reading', text: '还没有读数（本轮注入尚未裁决过）' };
    const row = (r.rows || []).filter(function (x) { return x.source === source; })[0];
    if (!row) return { ok: false, reason: 'no-source', text: '本轮注入里没有「' + source + '」这个源（既没进正文，也没在读数里）' };
    if (!row.dup) return { ok: true, source: source, text: '「' + source + '」' + row.total + ' 段全是新增信息（与其它节零重合）' };
    return {
      ok: true, source: source,
      text: '「' + source + '」' + row.total + ' 段里 ' + row.dup + ' 段（' + row.dupRate + '%）与别节重复：'
        + row.dupWith.map(function (x) { return '「' + x.source + '」' + x.shared + ' 段'; }).join('、')
    };
  }

  WA.injectDelta = {
    measure: measure, explain: explain, segments: segments,
    settings: settings, stat: function () { return Object.assign({}, stat); },
    last: function () { return last; }
  };
  // 装载面登记与自述行：与全部引擎同形态（少这两行会在装载汇报里被算成「未自述」，
  //   而 module-registry 的装载期边也要靠 registerModule 才能记到这台）。
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/inject-delta.js', { kind: 'engine', ver: '2.524.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/inject-delta 已加载（2.524.0）');
})();
