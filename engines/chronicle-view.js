/**
 * WorldAxis engines/chronicle-view.js (v2.182.0) — E5 玩家可读的世界历史与证据日志
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   世界历史在本仓已经**沉积得很厚**，但玩家读到的是原始键名：
 *     · store.chronicle        —— 归档历史（backstage 结算写入 + horizon 远方写入），
 *                                 条目形如 {id,kind,title,summary,at,refs,visibility}
 *     · chrono.chronicle()     —— 该表的既有读口（带 hidden 过滤与 cap）
 *     · ledger-timeline        —— 站点观测账（seen/observed/rounds/failing/stalled）
 *     · timeline               —— 来源引用校验（valid/reason/refs/missing）
 *     · causal                 —— 因果链（STAGES/TERMINAL/classify/evidence）
 *     · sediment               —— 地点痕迹（带衰减）
 *   六处各自可查，**没有任何一条按剧情时间排好、能下钻回来源记录的「世界纪事」**。
 *
 * ── 本模块落点（只读聚合 + 下钻，不新增第二套历史存储）──────
 *   · entries(opts)   —— 按剧情时间排序的纪事行（合并 chronicle / sediment / causal）
 *   · entry(ref)      —— 单条纪事的**下钻**：来源记录逐字 + 引用（refs）校验状态
 *   · hiddenSummary() —— 被挡下的条目数与原因（如实报，不静默丢）
 *   · coverage()      —— 覆盖范围与截断说明（历史截断必须标注覆盖范围）
 *   · sources()       —— 各源可用性（缺席如实报）
 *   · diagnose() / stat() / reset()
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────
 *   1 默认关（enabled:false）。
 *   2 **只读**：不改存档、不写 stat、不隐式写盘。
 *   3 叙事化**不得改变事实** —— 本模块只做「取来源字段 + 拼展示行」，
 *     不生成来源里没有的描述性文字（没有 summary 就如实留空，不编）。
 *   4 玩家不可知的条目不进玩家视图（与 O9 同一条边界）：visibility==='hidden' 的条目
 *     整条不进 entries()，只计入 hiddenSummary()；**不是** CSS 隐藏、不是截断文本。
 *   5 不新增第二套历史存储 —— 视图只读既有记录（chronicle / sediment / causal）。
 *   6 时间轴顺序与剧情时间一致：有 at 的按 at 升序，无 at 的按来源稳定序排在后面。
 *   7 空历史与读不到**可区分**：空 ⇒ {ok:true, empty:true}；读不到 ⇒ {ok:false, reason:'no-store'}。
 *   8 引用校验用既有 timeline.auditRefs 口径，不另写一份 refs 校验。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_chronicle_view_settings_v1';
  // maxDrill 在 v2.182.0 落盘时已删：entry() 每次只下钻**一条**（ref 单值），
  //   没有「每次最多下钻几条」这个量 —— 声明它等于长出一个「点了没效果的开关」。
  //   死键扫描（v2.3.0 D6）正是为这类声明而设：要么有消费点，要么别声明。
  const DEF = { enabled: false, maxRows: 48 };
  const __REG = { key: LS_KEY, def: DEF, module: 'chronicleView',
    bounds: { maxRows: [8, 256] } };
  function getSettings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function setSettings(patch) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})))
      : Object.assign({}, getSettings(), patch || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  var _stat = { reads: 0, drills: 0, hiddenSeen: 0, refused: 0, lastReason: '', faults: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }

  // ── 源采集 ────────────────────────────────────────────────
  //   chronicle：玩家可见的归档历史。hidden 整条不进（边界 4），只计数。
  function fromChronicle() {
    const rows = [], hidden = [];
    const s = state();
    const chron = Array.isArray(s.chronicle) ? s.chronicle : [];
    chron.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      const vis = clean(c.visibility, 20);
      if (vis === 'hidden') {
        hidden.push({ ref: clean(c.id, 40), why: 'visibility=hidden' });
        return;
      }
      rows.push({
        at: num(c.at) || 0, ref: clean(c.id, 40) || ('chr:' + rows.length),
        source: 'chronicle', kind: clean(c.kind, 20) || 'event',
        title: clean(c.title, 80),
        // 边界 3：没有 summary 就如实留空 —— 不编描述。
        text: clean(c.summary || c.desc || '', 120),
        refs: Array.isArray(c.refs) ? c.refs.slice(0, 4) : [],
        horizon: !!c.horizon
      });
    });
    return { rows: rows, hidden: hidden };
  }

  function fromSediment() {
    const rows = [];
    const s = state();
    // 桶名与形状以现场为准：`core/store.js` 骨架 `sediment: { rows: [] }`，
    //   数组元素形如 `{ place, events: [{key,text,trace,at,kind}] }` —— **地点名在 rec.place**，
    //   初稿拿数组下标当地点名拼标题，会拼出「0：xx」这种无意义行。
    const arr = (((s.sediment || {}).rows) || []);
    if (!Array.isArray(arr)) return rows;
    arr.forEach(function (rec) {
      if (!rec || typeof rec !== 'object') return;
      const place = clean(rec.place, 40);
      const evs = Array.isArray(rec.events) ? rec.events : [];
      evs.forEach(function (e, i) {
        if (!e) return;
        rows.push({ at: num(e.at) || 0, ref: 'sed:' + place + '#' + i,
          source: 'sediment', kind: 'trace',
          title: place + '：' + clean(e.key, 30),
          text: clean(e.text, 120),
          refs: [], trace: clean(e.trace, 20) });
      });
    });
    return rows;
  }

  function fromCausal() {
    const rows = [];
    const s = state();
    // 形状以现场为准：`causal.stateView()` 走 `summarize()`，其 `chains` 字段是**计数（数字）**，
    //   不是链数组 —— 初稿按数组遍历过（`.forEach` 在数字上不存在，整源静默空转）。
    //   链数组的真源是 `state().causal.chains`（元素形如 {id,status,stage,title,at,delayed}）。
    const chains = (((s.causal || {}).chains) || []);
    if (!Array.isArray(chains)) return rows;
    chains.forEach(function (c) {
      if (!c || typeof c !== 'object' || !c.id) return;
      const st = clean(c.stage || c.status, 20);
      rows.push({ at: num(c.at) || num(c.settledAt) || 0, ref: 'cau:' + clean(c.id, 40),
        source: 'causal', kind: 'chain', stage: st,
        title: clean(c.title || c.key || c.id, 60),
        text: clean(c.summary || c.note || '', 120),
        refs: [] });
    });
    return rows;
  }

  const SOURCE_PROBES = [
    { name: 'chronicle', probe: function () { return Array.isArray(state().chronicle); } },
    { name: 'sediment', probe: function () { return !!(WA.sediment && typeof WA.sediment.feel === 'function'); } },
    { name: 'causal', probe: function () { return !!(WA.causal && typeof WA.causal.stateView === 'function'); } },
    { name: 'timeline', probe: function () { return !!(WA.timeline && typeof WA.timeline.auditRefs === 'function'); } },
    { name: 'chrono', probe: function () { return !!(WA.chrono && typeof WA.chrono.chronicle === 'function'); } }
  ];

  function storyLabel() {
    if (WA.playtime && typeof WA.playtime.story === 'function') {
      try { const s = WA.playtime.story(); if (s && s.ok) return { ok: true, label: s.label, dayIndex: s.dayIndex }; } catch (e) {}
    }
    const c = (state().clock) || {};
    const l = String(c.label || '').trim();
    return l ? { ok: true, label: l, dayIndex: num(c.dayIndex) } : { ok: false };
  }

  // ── 主读面：按剧情时间排序的纪事 ──────────────────────────
  function entries(opts) {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }
    if (!(WA.store && typeof WA.store.get === 'function')) { noteFault('no-store'); return { ok: false, reason: 'no-store', rows: [] }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const chr = fromChronicle();
    let sed = [], cau = [];
    try { sed = fromSediment(); } catch (e) { sed = []; }
    try { cau = fromCausal(); } catch (e) { cau = []; }
    const all = chr.rows.concat(sed, cau);
    all.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    const limit = (num(o.limit) && num(o.limit) > 0) ? Math.min(cfg.maxRows, Math.floor(num(o.limit))) : cfg.maxRows;
    const capped = all.length > limit;
    // 截断取**最近**的（历史向前滚动），并如实标注覆盖范围（边界 7）
    const kept = capped ? all.slice(-limit) : all;
    _stat.hiddenSeen += chr.hidden.length;
    _stat.reads++;
    const label = storyLabel();
    return { ok: true, rows: kept.map(function (r) { return Object.assign({}, r); }),
      count: kept.length, total: all.length, capped: capped,
      hiddenCount: chr.hidden.length,
      coverage: capped ? ('仅显示最近 ' + limit + ' / ' + all.length + ' 条（更早的历史已滚出视图，不等于没发生过）') : ('全部 ' + all.length + ' 条'),
      storyLabel: label.ok ? label.label : '', storyDay: label.ok ? label.dayIndex : null,
      perSource: { chronicle: chr.rows.length, sediment: sed.length, causal: cau.length },
      note: '玩家不可知的条目整条不进本视图（只计数）；叙事化不改事实，无 summary 者如实留空' };
  }

  // ── 下钻：单条纪事的来源记录 + 引用校验 ───────────────────
  function entry(ref) {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const key = clean(ref, 60);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'ref' }; }
    const e = entries({ limit: cfg.maxRows });
    if (!e.ok) return e;
    const hit = e.rows.filter(function (r) { return r.ref === key; })[0] || null;
    if (!hit) { noteFault('not-found'); return { ok: false, reason: 'not-found', ref: key }; }
    // 下钻到**来源记录逐字**（边界 5：只读既有记录）
    let sourceRecord = null;
    if (hit.source === 'chronicle') {
      const chron = Array.isArray(state().chronicle) ? state().chronicle : [];
      sourceRecord = chron.filter(function (c) { return c && clean(c.id, 40) === key; })[0] || null;
    } else if (hit.source === 'causal') {
      // 形状以现场为准：链数组真源是 `state().causal.chains`；
      //   `causal.stateView().chains` 是**计数（数字）**，拿它当数组会静默取不到来源。
      try {
        const chains = (((state().causal || {}).chains) || []);
        sourceRecord = (Array.isArray(chains) ? chains : []).filter(function (c) {
          return c && ('cau:' + clean(c.id, 40)) === key;
        })[0] || null;
      } catch (e2) { sourceRecord = null; }
    }
    // 引用校验走既有 timeline.auditRefs 口径（边界 8：不另写一份）
    let refAudit = null;
    if (WA.timeline && typeof WA.timeline.auditRefs === 'function') {
      try { refAudit = WA.timeline.auditRefs(hit.refs || []); } catch (e3) { refAudit = null; }
    }
    _stat.drills++;
    return { ok: true, ref: key, row: Object.assign({}, hit),
      sourceRecord: sourceRecord ? JSON.parse(JSON.stringify(sourceRecord)) : null,
      sourceRecordAbsent: !sourceRecord,
      refAudit: refAudit,
      note: sourceRecord ? null : '来源记录已不在（容量挤出或已被回收）—— 视图行仍在，来源缺失如实标注' };
  }

  function hiddenSummary() {
    const cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', count: 0, rows: [] };
    const chr = fromChronicle();
    return { ok: true, count: chr.hidden.length, rows: chr.hidden.slice(0, 24),
      note: '这些条目按 visibility=hidden 整条挡在玩家视图之外（不是隐藏样式、不是截断）' };
  }

  function coverage() {
    const cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const chr = fromChronicle();
    const chron = Array.isArray(state().chronicle) ? state().chronicle.length : 0;
    return { ok: true, chronicleTotal: chron, visible: chr.rows.length, hidden: chr.hidden.length,
      cap: cfg.maxRows,
      note: chron > cfg.maxRows ? ('归档历史共 ' + chron + ' 条，视图按 maxRows=' + cfg.maxRows + ' 滚动显示最近部分') : '全部在视图容量内' };
  }

  function sources() {
    return SOURCE_PROBES.map(function (s) {
      let available = false;
      try { available = !!s.probe(); } catch (e) { available = false; }
      return { name: s.name, available: available };
    });
  }

  function diagnose() {
    const checks = {
      store: !!(WA.store && typeof WA.store.get === 'function'),
      timeline: !!(WA.timeline && typeof WA.timeline.auditRefs === 'function'),
      sediment: !!(WA.sediment && typeof WA.sediment.feel === 'function'),
      causal: !!(WA.causal && typeof WA.causal.stateView === 'function'),
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.read === 'function')
    };
    return { ok: checks.store, closedLoop: checks.store, checks: checks, version: '2.182.0' };
  }

  function stat() {
    return { reads: _stat.reads, drills: _stat.drills, hiddenSeen: _stat.hiddenSeen,
      refused: _stat.refused, lastReason: _stat.lastReason, faults: Object.assign({}, _stat.faults),
      enabled: getSettings().enabled, maxRows: getSettings().maxRows };
  }

  function reset() { _stat.reads = 0; _stat.drills = 0; _stat.hiddenSeen = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  WA.chronicleView = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    entries: entries,
    entry: entry,
    hiddenSummary: hiddenSummary,
    coverage: coverage,
    sources: sources,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 10;
  var _exported = Object.keys(WA.chronicleView).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('chronicleView: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/chronicle-view.js', { kind: 'engine', ver: '2.182.0' });
})();