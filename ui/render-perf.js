/**
 * WorldAxis ui/render-perf.js (v2.152.0) — 面板渲染性能观测（RP6）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   panel.js 是本仓最大单文件（46 万字符），但「切一页渲染了多少 DOM、花了多少毫秒」
 *   无任何读数。v2.148.0 的 perfLedger 收的是**注入链**的耗时（render/inject.js 分流），
 *   面板自身渲染是另一条链：它不进注入预算、不走 engineCall 出口，perfLedger 看不见。
 *   一句话：**注入慢有人知道，面板卡没人知道。**
 *
 * ── 本模块落点 ────────────────────────────────────────────────
 *   · observe(page, ms, nodes) — 由 ui/panel.js 的 renderBody 在每次重绘末尾
 *       分流进来（本模块不自带计时器，只收 panel 已量的读数）；
 *   · renderStat()      — 逐页读数（次数 / 平均耗时 / 平均节点数 / 最近耗时）；
 *   · renderTrend()     — 三基准对照（近 10 / 近 50 / 全窗，均值为口径——渲染耗时无
 *       「斜率劣化」语义之外还有「单页天然重」的语义，均值比斜率诚实）。
 *
 * ── 与既有模块的分工 ─────────────────────────────────────────
 *   · perfLedger（v2.148.0）— 注入链耗时（引擎调用出口）；
 *   · perfTrace（v2.102.0）— 基准与档位（跑分）；
 *   · 本模块 — **面板渲染链**的耗时与 DOM 规模。三者都是「性能」但观测对象不同，
 *     合并会让「注入变慢」与「面板变卡」在读数上不可分。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 不做增量优化（观测面不是优化器，与 perfLedger 第 1 条同口径）。
 *   2 不自动调优（只报不改）。
 *   3 不落盘（渲染读数是进程态观测物，与 perfLedger 第 3 条同口径）。
 *   4 不计时（计时由调用方包住渲染段完成；本模块只收数——「自带计时器」会把
 *     observe 的入账动作自身也量进去，观测污染被观测者）。
 *   5 页 id 表外即拒收（PAGES 白名单之外的 page 一律 unknown-page，
 *     与 evict 的 unknown-site 同纪律：宁可拒收也不收一个没人声明的页）。
 *   6 有界：逐页环形窗口有 cap，观测自身不许撑爆内存。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_render_perf_v1';
  const __REG = { key: LS_KEY, def: { enabled: true }, module: 'renderPerf', bounds: {} };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = { enabled: true };
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  // 写口有真消费方（面板「性能与水位」段的观测开关）。为什么观测面也要有总开关：
  //   「不开观测」是一个正当选择（没人愿意为读数付哪怕一点点代价），而没有开关就等于
  //   替用户做了这个选择 —— 本仓的纪律是「能关才叫可选，不能关只是隐藏」。
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // v2.155.0 自纠（全量回归当场抓到）：样本时间戳原写裸调 `Date.now()`。本仓 G20 口径是
  //   「产品代码零裸调 Date.now()」——`at` 是**测量时间**（给人看的样本时刻、算趋势不读它），
  //   故走 `wallNow()`（测量时钟单一出口），**不是** `now()`（决策时钟）：把样本时刻冻住会让
  //   「渲染读数是什么时候采的」这句话失去意义。兜底与守卫**同行**（G20 的 guard 形态要求）：
  //   兜底可留，但必须与 `WA.clock.` 写在同一行，否则它看起来就像一次绕过时钟的裸读。
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const CAP_PER_PAGE = 60;      // 每页样本环
  const CAP_PAGES = 24;         // 页数上限（观测面自身的界）
  const windows = new Map();    // page -> [{ ms, nodes, at }]
  // v2.152.0 自纠：此前这一格声明了却从不变更（`rejected` 恒为 0），而三类拒收此前只进 faults 分桶。
  //   两类口径都有话可说，**但一个恒为 0 的计数不是读数，是摆设** —— 读它的人会把
  //   「一次拒收都没发生」当成事实。现在两者都真：rejected 是总数（与 faults 各桶之和恒等），
  //   faults 是可归因明细。恒等式由专锁钉住（N 面：任一桶不计数即失配）。
  const _stat = { observed: 0, rejected: 0, lastReason: '', faults: {} };

  function note(code) { _stat.rejected++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }

  function pagesKnown() {
    try { return (WA.ui && typeof WA.ui.pages === 'function') ? (WA.ui.pages() || []) : []; }
    catch (e) { return []; }
  }

  /**
   * 入账一次渲染。**不计时**——调用方（renderBody）把渲染段包在自己的计时里。
   * @param {string} page  页 id（PAGES 白名单内）
   * @param {number} ms    渲染耗时（毫秒）
   * @param {number} [nodes] 渲染产物控件节点数（可选：缺省记 -1 = 未量）
   */
  function observe(page, ms, nodes) {
    if (!settings().enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const p = (page === undefined || page === null) ? '' : String(page);
    if (!p) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'page' }; }
    if (pagesKnown().indexOf(p) < 0) { note('unknown-page'); return { ok: false, reason: 'unknown-page', page: p, allowed: pagesKnown() }; }
    const n = (typeof ms === 'number' && isFinite(ms)) ? ms : NaN;
    if (!isFinite(n) || n < 0) { note('bad-value'); return { ok: false, reason: 'bad-value', field: 'ms' }; }
    if (windows.size >= CAP_PAGES && !windows.has(p)) { note('pages-full'); return { ok: false, reason: 'pages-full' }; }
    let ring = windows.get(p);
    if (!ring) { ring = []; windows.set(p, ring); }
    ring.push({ ms: n, nodes: (typeof nodes === 'number' && isFinite(nodes) && nodes >= 0) ? nodes : -1, at: clockWall() });
    if (ring.length > CAP_PER_PAGE) ring.splice(0, ring.length - CAP_PER_PAGE);
    _stat.observed++;
    return { ok: true, page: p, count: ring.length };
  }

  function avg(list) {
    if (!list.length) return null;
    let s = 0; for (const x of list) s += x;
    return s / list.length;
  }

  /** 逐页读数（只读）。 */
  function renderStat() {
    const rows = [];
    windows.forEach(function (ring, page) {
      const ms = ring.map(function (x) { return x.ms; });
      const nd = ring.filter(function (x) { return x.nodes >= 0; }).map(function (x) { return x.nodes; });
      rows.push({ page: page, renders: ring.length, avgMs: +avg(ms).toFixed(2), maxMs: Math.max.apply(null, ms),
        avgNodes: nd.length ? Math.round(avg(nd)) : null, lastMs: ring[ring.length - 1].ms,
        lastAt: ring[ring.length - 1].at });
    });
    rows.sort(function (a, b) { return b.renders - a.renders || (a.page < b.page ? -1 : 1); });
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults), pages: rows.length, cap: CAP_PER_PAGE, rows: rows });
  }

  /** 三基准均值对照（近 10 / 近 50 / 全窗）。 */
  function renderTrend() {
    const rows = [];
    windows.forEach(function (ring, page) {
      const ms = ring.map(function (x) { return x.ms; });
      rows.push({ page: page, short: +avg(ms.slice(-10)).toFixed(2), mid: +avg(ms.slice(-50)).toFixed(2),
        full: +avg(ms).toFixed(2), renders: ring.length });
    });
    rows.sort(function (a, b) { return b.renders - a.renders || (a.page < b.page ? -1 : 1); });
    return { ok: true, rows: rows, basis: 'short=近10次 mid=近50次 full=全窗（均值口径，单位 ms）' };
  }

  function reset() { windows.clear(); _stat.observed = 0; _stat.rejected = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  WA.renderPerf = { observe: observe, renderStat: renderStat, renderTrend: renderTrend, reset: reset,
    getSettings: settings, setSettings: saveSettings };
  if (typeof WA.registerModule === 'function') WA.registerModule('ui/render-perf.js', { kind: 'ui', ver: '2.152.0' });
})();