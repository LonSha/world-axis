/**
 * WorldAxis engines/mixed-index.js (v2.529.0) — 混合索引：常驻只列名字 + 一句简报
 *
 * 缝合来源：nekotools core/worldindex.js::buildBriefs（39-94 行）。
 * 病：本仓注入面只有「全量进 / 全量不进」两档，缺第三档 ——
 *   **常驻一份只有名字和一句简报的索引**，详情留在按需条目里。
 *   模型因此永远知道「有什么」，又不为详情付常驻 token。
 * 边界：本模块只算「该常驻什么、简报写什么」，不改条目、不写盘。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const SEC_ORDER = ['角色', '道具', '伏笔', '计划', '地点'];

  function titleOf(e) { return String((e && (e.comment || e.title || e.key)) || '').trim(); }
  function contentOf(e) { return String((e && (e.content || e.value)) || ''); }
  function isResident(e) { return !!(e && (e.constant || e.selective === false)); }

  /** 一句简报：去掉结构化块与 markdown 记号，取首个实义短句，硬夹 40 字。 */
  function brief(text, max) {
    const t = String(text || '')
      .replace(/<[^>]{0,200}>/g, '')
      .replace(/\{\{[^}]{0,200}\}\}/g, '')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return '';
    const cut = t.split(/[。！？；;!?]/)[0] || t;
    const lim = max || 40;
    return cut.length > lim ? cut.slice(0, lim) + '…' : cut;
  }

  /**
   * @param {Array} entries 世界书条目（可含 section 字段；无则按名字猜）
   * @param {{maxPerSection?:number, maxBrief?:number, briefTokenCost?:function}} opts
   */
  function build(entries, opts) {
    const o = opts || {};
    const maxPer = o.maxPerSection || 24;
    const list = Array.isArray(entries) ? entries : [];
    const bySection = Object.create(null);
    let residentEntries = 0, skipped = 0;
    list.forEach(function (e) {
      const name = titleOf(e);
      if (!name) { skipped++; return; }
      if (!isResident(e)) { skipped++; return; }   // 非常驻条目：详情走按需激活，索引里不占位
      residentEntries++;
      const sec = String(e.section || '其他');
      (bySection[sec] = bySection[sec] || []).push({ name: name, brief: brief(contentOf(e), o.maxBrief) });
    });
    const sections = SEC_ORDER.concat(Object.keys(bySection).filter(function (k) { return SEC_ORDER.indexOf(k) < 0; }))
      .filter(function (k) { return bySection[k] && bySection[k].length; })
      .map(function (k) {
        const rows = bySection[k].slice(0, maxPer);
        return { section: k, total: bySection[k].length, rows: rows, truncated: bySection[k].length > rows.length };
      });
    const text = sections.map(function (s) {
      return '【' + s.section + '】' + s.rows.map(function (r) { return r.name + (r.brief ? '（' + r.brief + '）' : ''); }).join('、')
        + (s.truncated ? ' 等 ' + s.total + ' 项' : '');
    }).join('\n');
    return {
      text: text, sections: sections,
      residentEntries: residentEntries, skipped: skipped,
      names: sections.reduce(function (a, s) { return a + s.rows.length; }, 0)
    };
  }

  /**
   * v2.567.0（引擎深度）：**产品入口**——常驻索引的正文块。
   *
   * 为什么本模块需要自己的 buildBlock：注入面（render/inject.js）只收「会往正文里放块」的源，
   *   而这些源统一以 `<ns>.buildBlock()` 取内容（tests/inject-sources-v2560.js 的 A 判据就是
   *   按 `WA.<ns>.buildBlock(` 反查分支是否真接）。本模块此前只有 `build(entries, opts)`，
   *   条目要由调用方喂 —— 于是「谁喂」这一层永远缺着，全仓零读是必然结果，不是设计。
   *
   * 真源取 `WA.worldbook.peekEntries()`（按当前聊天选中的世界书条目，只读）。
   * 三态如实（都不产块）：
   *   · 世界书模块不在 / 没选条目 ⇒ ''（不产「空索引」占位，占位会白吃常驻 token）；
   *   · 条目里没有常驻项（constant / selective===false）⇒ ''（非常驻项本来走按需激活，不进索引）；
   *   · 抛错 ⇒ ''（索引是增益面，不能因为算不出来就打断注入）。
   */
  function buildBlock(opts) {
    const wb = WA.worldbook;
    if (!wb || typeof wb.peekEntries !== 'function') return '';
    let list = null;
    try { list = wb.peekEntries(); } catch (e) { return ''; }
    if (!Array.isArray(list) || !list.length) return '';
    let r = null;
    try { r = build(list, opts || {}); } catch (e) { return ''; }
    if (!r || !r.text || !r.names) return '';
    return r.text;
  }

  WA.mixedIndex = { build: build, buildBlock: buildBlock, brief: brief, isResident: isResident, SEC_ORDER: SEC_ORDER };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/mixed-index.js', { kind: 'engine', ver: '2.529.0' });
})();