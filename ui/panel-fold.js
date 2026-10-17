/**
 * WorldAxis ui/panel-fold.js (v2.225.0) — 面板专家面折叠(计划 Q8 · 面板减负)
 *
 * ── 它治什么(缺口,先用现场说清)────────────────────────────────
 *   `ui/panel.js` 是本仓最大单文件(约 1.11 MB),而「工具」一页上并排摆了 18 个
 *   `wa-sec` 段:世界态势 / 快照 / 存档槽 / 外部导入 / 扩展自检 / 诊断与体检 /
 *   存储与现场 / 审计取证 / 恢复与撤销 / 记忆采样 / 运行痕迹 / 世界种子库 / 世界蓝图 /
 *   依赖体检 / 规则包 / 世界实验室 / 存储压力面 / 性能基线面。其中**大部分是专家面**
 *   (维护者与大改期才会动的那些),而玩家日常只碰其中三四段。
 *   后果是真读数:每次切到工具页,这些段连同它们的控件**一并被构建进 DOM**
 *   (实测该页是控件最多的一页),而用户此刻并不需要它们。
 *
 * ── 本模块落点(一条主线:折叠 = **不构建**,不是「藏起来」)─────────
 *   `SECTIONS` 是本模块声明的**封闭表**:哪些页的哪些段是「可折叠的专家面」。
 *   面板侧渲染这些段时走 `fsec(page, sec, headerHtml, bodyHtml)` ——
 *   收起态**根本不拼接 bodyHtml**(那些控件从不进 HTML、也从不进 DOM),故
 *   「收起」与「用 CSS 藏起来」在读数上是两件事:前者 DOM 里**没有**那些节点,
 *   后者 DOM 里有一堆 `display:none` 的节点照样占内存、照样参与查询。
 *   本仓对这件事已有裁决(「读数不实」那一族):把 `display:none` 叫「减负」
 *   等于把「看不见」当成「不存在」。
 *
 * ── 三条承重口径(每条都是「换个写法就会出错」的那种)──────────────
 *   1 **表是封闭的,未知即拒收**。`isCollapsed` / `toggle` 收到表外的页或段一律
 *      `unknown-page` / `unknown-section` 并回带认得的集合。自造一个段名出来
 *      (比如拼错了 id)会让面板照常渲染、折叠静默失效 —— 那种失效**没有任何读数**。
 *   2 **折叠状态落盘走 settingsBus,不裸调 localStorage**(与 ui/theme-switch.js 同款):
 *      裸写会让「用户折过一次」在诊断里变成「没有发生过」,而本仓的写路径自带
 *      写后读回校验、失败分桶与迁移,绕开它等于自断观测面。
 *   3 **零世界写**。本模块不碰 `store`(没有 transact、没有 draft 赋值),只读
 *      `WA.ui.pages()` 做页白名单核对 —— 折叠是**呈现层**的事,不是世界事实。
 *
 * ── 边界(全部否定式,与同仓 ui 模块同规)──────────────────────────
 *   1 不改默认态(**默认全展开**):既有断言与玩家习惯都不该被一次「减负」改掉。
 *      想要更轻的界面,是用户**自己折**;本模块不替用户做这个决定。
 *   2 不落任何「上次折过」之外的推断:状态键只存 `page:sec → true`,不存时间、不存次数。
 *   3 不造第二份页表:页 id 白名单取运行时 `WA.ui.pages()`;它缺席即**不拦**
 *      (如实标 `page-table-absent` 并放行)—— 拦下一个合法页比放行一个非法页更坏。
 *   4 有界:条目上限 `MAX_ENTRIES`,超出按**最早写入**退场(不与历史长期并存)。
 *   5 本模块不做「记忆用户意图」的统计,不报「最常折的是哪段」(那是观测面的事)。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_panel_fold_v1';
  /** 条目上限:折叠状态是交互物,不是档案。 */
  const MAX_ENTRIES = 64;
  /**
   * 可折叠的「专家面」清单(**封闭表**)。
   *   `page` 必须能在 `WA.ui.pages()` 里找到(运行时核对,不硬编码页表);
   *   `id` 是面板侧 `fsec(page, id, ...)` 的第二个参数 —— 两处必须逐字一致,
   *   由 `tests/q8-panel-fold-v2225.js` 的 A 段做**两向**核对
   *   (表里有而面板没渲染 ⇒ 幽灵登记;面板渲染了而表里没有 ⇒ 漏登记)。
   *   `label` 只用于诊断与面板提示,不参与判定。
   */
  const SECTIONS = [
    { page: 'tools', id: 'selfcheck', label: '扩展自检与诊断与体检' },
    { page: 'tools', id: 'storage', label: '存储与现场' },
    { page: 'tools', id: 'audit', label: '审计取证' },
    { page: 'tools', id: 'recovery', label: '恢复与撤销' },
    { page: 'tools', id: 'sampler', label: '记忆采样预览' },
    { page: 'tools', id: 'traces', label: '运行痕迹' },
    { page: 'tools', id: 'seedlib', label: '世界种子库' },
    { page: 'tools', id: 'blueprint', label: '世界蓝图' },
    { page: 'tools', id: 'depcheck', label: '依赖体检与迁移助手' },
    { page: 'tools', id: 'rulepack', label: '规则包与自动化模板' },
    { page: 'tools', id: 'worldlab', label: '世界实验室与反事实对比' },
    { page: 'tools', id: 'capacity', label: '存储压力面与义务清点' },
    { page: 'tools', id: 'perfbase', label: '性能基线面与三档' },
  ];
  const __REG = {
    key: LS_KEY,
    def: { collapsed: {} },
    module: 'panelFold',
    bounds: { maxEntries: [1, MAX_ENTRIES] }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = { collapsed: {} };
    const merged = Object.assign(base, raw || {});
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, merged) : merged;
  }
  function saveSettings(next) {
    const norm = WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})) : Object.assign({}, settings(), next || {});
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, norm) : norm;
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) { return r && r.key !== LS_KEY; }).concat([__REG]);
  const _stat = { queries: 0, collapsedHit: 0, toggles: 0, collapsedNow: 0, expandedNow: 0, evicted: 0, lastReason: '', faults: {} };
  function note(code) { _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function keyOf(page, sec) { return String(page) + ':' + String(sec); }
  function entryOf(page, sec) {
    const p = (page === undefined || page === null) ? '' : String(page);
    const s = (sec === undefined || sec === null) ? '' : String(sec);
    if (!p) return { ok: false, reason: 'missing-fields', field: 'page' };
    if (!s) return { ok: false, reason: 'missing-fields', field: 'section' };
    for (let i = 0; i < SECTIONS.length; i++) {
      if (SECTIONS[i].page === p && SECTIONS[i].id === s) return { ok: true, page: p, section: s, key: keyOf(p, s), label: SECTIONS[i].label };
    }
    // 段名认得、页名写错 与 页名认得、段名写错 处置不同:分开报,别合成一个「不认得」。
    const pageKnown = SECTIONS.some(function (x) { return x.page === p; });
    if (!pageKnown) return { ok: false, reason: 'unknown-page', page: p, allowed: pagesKnown() };
    return { ok: false, reason: 'unknown-section', page: p, section: s, allowed: sectionsOf(p) };
  }
  function pagesKnown() {
    try { return (WA.ui && typeof WA.ui.pages === 'function') ? (WA.ui.pages() || []) : []; }
    catch (e) { return []; }
  }
  function sectionsOf(page) {
    return SECTIONS.filter(function (x) { return x.page === page; }).map(function (x) { return x.id; });
  }
  /** 收起态?**表外一律拒收**(不静默当成「展开」——那会让拼错的 id 看不见)。 */
  function isCollapsed(page, sec) {
    _stat.queries++;
    const e = entryOf(page, sec);
    if (!e.ok) { note(e.reason); return { ok: false, reason: e.reason, page: e.page, section: e.section, allowed: e.allowed }; }
    const c = settings().collapsed || {};
    const hit = c[e.key] === true;
    if (hit) _stat.collapsedHit++; else _stat.expandedNow++;
    return { ok: true, page: e.page, section: e.section, key: e.key, collapsed: hit };
  }
  /** 面板侧渲染便利口:只回答问题,**不返回对象** —— 渲染链上不该有分支判据。 */
  function isCollapsedBool(page, sec) {
    const r = isCollapsed(page, sec);
    return r.ok ? r.collapsed === true : false;
  }
  function setCollapsed(page, sec, want) {
    const e = entryOf(page, sec);
    if (!e.ok) { note(e.reason); return { ok: false, reason: e.reason, page: e.page, section: e.section, allowed: e.allowed }; }
    if (typeof want !== 'boolean') { note('bad-value'); return { ok: false, reason: 'bad-value', field: 'want' }; }
    const cur = settings().collapsed || {};
    const next = Object.assign({}, cur);
    if (want) next[e.key] = true; else delete next[e.key];
    // 有界:超出上限时按插入顺序退场(对象键序即写入序),并如实计数。
    const keys = Object.keys(next);
    let evicted = 0;
    while (keys.length > MAX_ENTRIES) { const k = keys.shift(); delete next[k]; evicted++; }
    if (evicted) { _stat.evicted += evicted; note('entries-over-cap'); }
    saveSettings({ collapsed: next });
    _stat.toggles++;
    syncCounters();
    return { ok: true, page: e.page, section: e.section, key: e.key, collapsed: want, evicted: evicted };
  }
  function toggle(page, sec) {
    const r = isCollapsed(page, sec);
    if (!r.ok) return r;
    return setCollapsed(page, sec, !r.collapsed);
  }
  function expandAll(page) {
    const p = (page === undefined || page === null) ? '' : String(page);
    if (!p) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'page' }; }
    const ids = sectionsOf(p);
    if (!ids.length) { note('unknown-page'); return { ok: false, reason: 'unknown-page', page: p, allowed: pagesKnown() }; }
    const cur = settings().collapsed || {};
    const next = Object.assign({}, cur);
    ids.forEach(function (id) { delete next[keyOf(p, id)]; });
    saveSettings({ collapsed: next });
    syncCounters();
    return { ok: true, page: p, cleared: ids.length };
  }
  function collapseAll(page) {
    const p = (page === undefined || page === null) ? '' : String(page);
    if (!p) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'page' }; }
    const ids = sectionsOf(p);
    if (!ids.length) { note('unknown-page'); return { ok: false, reason: 'unknown-page', page: p, allowed: pagesKnown() }; }
    const cur = settings().collapsed || {};
    const next = Object.assign({}, cur);
    ids.forEach(function (id) { next[keyOf(p, id)] = true; });
    let evicted = 0;
    const keys = Object.keys(next);
    while (keys.length > MAX_ENTRIES) { const k = keys.shift(); delete next[k]; evicted++; }
    if (evicted) { _stat.evicted += evicted; note('entries-over-cap'); }
    saveSettings({ collapsed: next });
    syncCounters();
    return { ok: true, page: p, collapsed: ids.length, evicted: evicted };
  }
  function syncCounters() {
    const c = settings().collapsed || {};
    let n = 0;
    Object.keys(c).forEach(function (k) { if (c[k] === true) n++; });
    _stat.collapsedNow = n;
  }
  /** 只读读数:清单 / 当前收起数 / 逐页收起情况 / 拒收归因。 */
  function stat() {
    syncCounters();
    return {
      sections: SECTIONS.length, pages: Array.from(new Set(SECTIONS.map(function (x) { return x.page; }))),
      queries: _stat.queries, collapsedHit: _stat.collapsedHit, toggles: _stat.toggles,
      collapsedNow: _stat.collapsedNow, expandedNow: _stat.expandedNow, evicted: _stat.evicted,
      cap: MAX_ENTRIES, lastReason: _stat.lastReason, faults: Object.assign({}, _stat.faults)
    };
  }
  function diagnose() {
    const pages = pagesKnown();
    const missing = Array.from(new Set(SECTIONS.map(function (x) { return x.page; }))).filter(function (p) { return pages.indexOf(p) < 0; });
    return {
      module: 'panelFold', ver: '2.225.0', key: LS_KEY, cfg: settings(),
      pages: pages, sections: SECTIONS.slice(),
      // 页表缺席与「这一页真不在面板上」是两件事,分开报(同 v2.152.0 的 unknown-page 纪律)。
      pageTable: pages.length ? 'present' : 'page-table-absent',
      missingPages: missing, stat: stat()
    };
  }
  WA.panelFold = {
    SECTIONS: SECTIONS.slice(),
    MAX_ENTRIES: MAX_ENTRIES,
    isCollapsed: isCollapsed,
    isCollapsedBool: isCollapsedBool,
    setCollapsed: setCollapsed,
    toggle: toggle,
    expandAll: expandAll,
    collapseAll: collapseAll,
    sectionsOf: sectionsOf,
    getSettings: settings,
    stat: stat,
    diagnose: diagnose
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('ui/panel-fold.js', { kind: 'ui', ver: '2.225.0' });
})();