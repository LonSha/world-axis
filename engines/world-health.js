/**
 * WorldAxis engines/world-health.js (v2.182.0) — O5 玩家可读的「世界健康中心」
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   诊断能力在本仓极强，但**全部面向维护者**：engines/tool-diag.js 4327 行、约 60 个
 *   `secXxx()` 诊断节、`UI_BINDINGS` 约 130 个控件前缀族，面板 17 页全是原始读数。
 *   玩家打开面板读到的是一张张**表**，而玩家真正要问的只有三句：
 *     「我现在有什么没做完 / 卡住了 / 快满了」。
 *   这三问在本仓各处都有**数据**，但没有一处**回答**：
 *     · 待办 —— 十二个模块各有自己的 `pending()`，但没有任何一处合起来数；
 *     · 阻塞 —— 各模块 `stat().faults` 与 `lastReason` 分散在一百多个命名空间里，
 *              想知道「哪里在拒收」要逐个翻；
 *     · 水位 —— `store.sizeCaps()` 与 `storageForecast` 都只在维护者面。
 *
 * ── 本模块落点（只读聚合 + 下钻，不新增第二套状态）────────────
 *   · summary()  —— 三栏摘要（待办 / 阻塞 / 水位），一屏能答上面三问
 *   · drill(kind, id) —— **每条摘要的下钻**：落在哪个模块 / 哪个拒收码 / 哪个容器
 *                        / 哪个设置键（设置键从 settingsBus.registry() 反查，不硬编码）
 *   · sources()  —— 各源可用性（缺席如实报）
 *   · diagnose() / stat() / reset()
 *
 * ── 与既有两个面的分工（**必须写清，否则会长出第三本账**）────
 *   · 与 capacity-audit（O4，维护者面）：同读 `store.sizeCaps()` 唯一真源。
 *     O4 报**逐容器全表**（谁满没满、挤出站点、可回收面、迁移预检）；
 *     本模块只报**玩家摘要**（几个满、几个近满、最满的前几条）。
 *     粒度不同、真源同一 —— 不是两份 cap 表。
 *   · 与 tool-diag（维护者面）：同读各模块 `stat()`。tool-diag 报原始统计与内部路径；
 *     本模块只报「哪些模块在拒收、拒收码是什么、该去哪个设置页」。
 *     计划原文边界：**不把维护者诊断（原始统计、内部路径）搬进玩家面**。
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────
 *   1 默认关（enabled:false）。
 *   2 **只读**：不改存档、不写 stat 之外的世界状态、不触发任何模块动作。
 *     特别地不调 `pending()` 之外任何**会推进状态**的口（不 claim / 不 settle / 不 tick）。
 *   3 **只做聚合与下钻**，不新增第二套状态：待办来自各模块自己的 `pending()`
 *     （「什么算未完成」由各模块自己判，本模块不替它们判），阻塞来自它们自己的
 *     `stat().faults`，水位来自 `store.sizeCaps()`。
 *   4 不替代各模块自己的确认语义：本模块**不做**任何确认 / 拒绝 / 结算动作，
 *     只给「去哪看、看哪条」。
 *   5 空白与「全部正常」**可区分**：每栏都带 `empty`（没数据）与 `allClear`（有数据但无事）
 *     两个旗标分别报 —— 把两者压成一个绿点，正是「点了没反应」的另一种写法。
 *   6 关掉的模块其待办不出现：走各自 `pending()` 的 `disabled` 分支，如实进 `skipped`
 *     而不是静默当作「没有待办」。
 *   7 不把维护者诊断搬进玩家面：不报原始计数、不报内部路径、不报文件行。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_world_health_settings_v1';
  // maxRows 逐栏上限（一屏）；nearRatio 近满阈值；maxFaultModules 阻塞栏最多几个模块。
  const DEF = { enabled: false, maxRows: 6, nearRatio: 0.8, maxFaultModules: 6 };
  const __REG = { key: LS_KEY, def: DEF, module: 'worldHealth',
    bounds: { maxRows: [2, 24], nearRatio: [0.5, 1], maxFaultModules: [1, 24] } };
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

  var _stat = { reads: 0, drills: 0, refused: 0, lastReason: '', faults: {}, byKind: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function noteKind(kind, n) { _stat.byKind[kind] = (_stat.byKind[kind] || 0) + n; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function safe(fn, fb) { try { const r = fn(); return (r === undefined) ? fb : r; } catch (e) { return fb; } }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

  // ── 待办源：玩家真能去「做」的那几件 ──────────────────────────
  //   选中口径（不是「所有有 pending 的模块」，而是**玩家有事可做**的）：
  //     委托 / 运营 / 地点效果 / 线索 / 分支选择 / 行动调度 —— 六条都能在面板里点。
  //     在途货运、条约、传闻这三类**玩家不能直接处置**（只能等世界推进），
  //     故不进「待办」栏（它们在 O4 的维护者清点里，那里是完整的十二源）。
  //   为什么不用 capacityAudit.obligations() 复算一遍：那是**维护者面**且受它自己的
  //     开关管；玩家面不该被维护者开关挡住，故本表独立声明 —— 但它读的仍是各模块
  //     自己的 `pending()`（真源同一，不替它们判「什么算未完成」）。
  const TODO_SOURCES = [
    { key: 'commission', label: '委托', ns: 'commission', fn: 'pending',
      items: function (r) { return arr(r.items).map(function (x) {
        return { id: clean(x.id, 40), title: clean(x.title, 60),
          detail: '阶段 ' + ((num(x.stage) || 0) + 1) + '/' + (num(x.total) || 0) }; }); } },
    { key: 'operations', label: '运营项目', ns: 'operations', fn: 'pending',
      items: function (r) { return arr(r.items).map(function (x) {
        return { id: clean(x.id, 40), title: clean(x.name, 60),
          detail: '里程碑 ' + (num(x.completed) || 0) + '/' + (num(x.total) || 0) }; }); } },
    { key: 'aftermath', label: '地点修复', ns: 'aftermath', fn: 'pending',
      items: function (r) { return arr(r.items).map(function (x) {
        return { id: clean(x.id, 40), title: clean(x.placeId, 40),
          detail: '进度 ' + (num(x.progress) || 0) + '/' + (num(x.target) || 0) }; }); } },
    { key: 'investigation', label: '线索', ns: 'investigation', fn: 'pending',
      items: function (r) { return arr(r.items).map(function (x) {
        return { id: clean(x.id, 40), title: clean(x.title, 60),
          detail: clean(x.status, 20) + ' · 证据 ' + (num(x.evidence) || 0) }; }); } },
    { key: 'storyChoice', label: '待选择', ns: 'storyChoice', fn: 'pending',
      items: function (r) { return arr(r.points).map(function (x) {
        return { id: clean(x.id, 40), title: clean(x.prompt, 60),
          detail: (num(x.options) || 0) + ' 个选项' }; }); } },
    { key: 'agency', label: '行动调度', ns: 'agency', fn: 'pending',
      items: function (r) { return arr(r.items).map(function (x) {
        return { id: clean(x.id, 40), title: clean(x.who || x.person, 40),
          detail: clean(x.stage || x.step, 40) }; }); } }
  ];

  function todoBar() {
    const cfg = getSettings();
    const rows = [], skipped = [], perSource = {};
    TODO_SOURCES.forEach(function (s) {
      const m = WA[s.ns];
      if (!m || typeof m[s.fn] !== 'function') { skipped.push({ key: s.key, why: 'module-absent' }); return; }
      let r = null;
      try { r = m[s.fn](); } catch (e) { skipped.push({ key: s.key, why: 'threw' }); return; }
      // 各模块的 disabled 分支如实进 skipped —— 关掉的模块其待办**不出现**，
      //   但也不静默当作「没有待办」（边界 6：两者在读数上必须可分）。
      if (!r || r.ok === false) {
        if (r && r.reason === 'disabled') skipped.push({ key: s.key, why: 'disabled' });
        else skipped.push({ key: s.key, why: clean((r && r.reason) || 'no-result', 30) });
        return;
      }
      let list = [];
      try { list = s.items(r) || []; } catch (e) { list = []; }
      perSource[s.key] = list.length;
      list.forEach(function (it) { rows.push({ kind: 'todo', source: s.key, label: s.label,
        id: it.id, title: it.title, detail: it.detail, route: s.ns }); });
    });
    const total = rows.length;
    const limit = cfg.maxRows;
    const capped = total > limit;
    const kept = capped ? rows.slice(0, limit) : rows;
    noteKind('todo', total);
    return { bar: 'todo', total: total, rows: kept, count: kept.length, capped: capped,
      perSource: perSource, skipped: skipped,
      // empty = 这一栏**没有数据**（源全缺席/全关）；allClear = 有数据但确实没待办。
      empty: total === 0 && Object.keys(perSource).length === 0,
      allClear: total === 0 && Object.keys(perSource).length > 0,
      coverage: capped ? ('仅列前 ' + limit + ' / ' + total + ' 条（其余待办仍在世界状态里）') : ('全部 ' + total + ' 条'),
      note: '待办只列玩家能处置的六类；在途货运 / 条约 / 传闻不在此栏（玩家无法直接处置，它们在维护者清点面）' };
  }

  // ── 阻塞源：各模块自己的 faults 与 lastReason ────────────────
  //   模块清单**动态取自 settingsBus.registry()**（module 名即命名空间名），
  //   不硬编码 —— 硬编码清单就是第二个「谁算模块」的真源，长出来的模块它不认识。
  function blockedBar() {
    const cfg = getSettings();
    const regs = safe(function () { return WA.settingsBus && WA.settingsBus.registry ? WA.settingsBus.registry() : []; }, []) || [];
    const names = [];
    regs.forEach(function (r) { const m = r && r.module; if (m && names.indexOf(m) < 0) names.push(m); });
    const rows = [];
    names.sort().forEach(function (n) {
      const m = WA[n];
      if (!m || typeof m.stat !== 'function') return;
      const s = safe(function () { return m.stat(); }, null);
      if (!s || typeof s !== 'object') return;
      const faults = obj(s.faults);
      const keys = Object.keys(faults).filter(function (k) { return num(faults[k]) > 0; });
      const last = clean(s.lastReason, 40);
      if (!keys.length && !last) return;
      const total = keys.reduce(function (n2, k) { return n2 + (num(faults[k]) || 0); }, 0);
      rows.push({ kind: 'blocked', route: n, module: n,
        // 拒收码逐条列出（这是玩家能看见的唯一「为什么卡住」的解释面）；
        //   不列原始统计、不列内部路径（边界 7）。
        codes: keys.map(function (k) { return { code: k, count: num(faults[k]) || 0, hint: REJECT_HINT[k] || '' }; }),
        total: total, lastReason: last });
    });
    rows.sort(function (a, b) { return (b.total - a.total) || (a.module < b.module ? -1 : 1); });
    const limit = cfg.maxFaultModules;
    const capped = rows.length > limit;
    const kept = capped ? rows.slice(0, limit) : rows;
    noteKind('blocked', rows.length);
    return { bar: 'blocked', total: rows.length, rows: kept, count: kept.length, capped: capped,
      scanned: names.length,
      empty: rows.length === 0 && names.length === 0,
      allClear: rows.length === 0 && names.length > 0,
      coverage: capped ? ('仅列前 ' + limit + ' / ' + rows.length + ' 个模块（其余模块也有拒收记录）') : ('全部 ' + rows.length + ' 个模块'),
      note: '阻塞栏只报「哪个模块在拒收、拒收码是什么」；原始统计与内部路径在维护者诊断面，不搬到这里' };
  }
  // 拒收码 → 玩家能懂的下一步。**只登记玩家可处置的那一批**；未登记者如实留空
  //   （宁可空着，也不给一句编出来的建议 —— 那是「文档反向误导」那一类）。
  const REJECT_HINT = {
    'disabled': '该功能在设置页里是关的 —— 打开它即可',
    'no-person': '缺人物：先在人物页建或选一个对象',
    'missing-person': '缺人物：先在人物页建或选一个对象',
    'no-place': '缺地点：先在世界上页建一个地点',
    'unknown-place': '地点不存在 —— 检查地点名是否写错',
    'not-found': '目标已不在（可能被容量挤出）—— 刷新列表后重选',
    'cap': '容器已满 —— 去世界健康中心的水位栏看是哪一个',
    'full': '容器已满 —— 去世界健康中心的水位栏看是哪一个',
    'bad-text': '文本为空或过长 —— 缩短后重试',
    'missing-fields': '必填项缺失 —— 补齐后再提交'
  };

  // ── 水位栏：只报摘要，逐容器全表在 O4 的维护者面 ──────────────
  function waterBar() {
    const cfg = getSettings();
    const caps = safe(function () { return WA.store && WA.store.sizeCaps ? WA.store.sizeCaps() : null; }, null);
    if (!caps) { return { bar: 'water', total: 0, rows: [], count: 0, capped: false,
      empty: true, allClear: false, fullCount: 0, nearCount: 0, wildcardSkipped: 0,
      note: 'cap 表读不到（store 缺席）—— 不是「没有容器」，是「量不出来」' }; }
    const st = state();
    const keys = Object.keys(caps);
    const all = [];
    let wildcardSkipped = 0;
    keys.forEach(function (k) {
      const meta = caps[k] || {};
      if (meta.wildcard) { wildcardSkipped++; return; }
      const capNum = (typeof meta.cap === 'number' && isFinite(meta.cap)) ? meta.cap : null;
      if (capNum === null || capNum <= 0) return;
      const segs = k.split('.');
      let cur = st;
      for (let i = 0; i < segs.length; i++) {
        if (cur === null || cur === undefined || typeof cur !== 'object') { cur = null; break; }
        cur = cur[segs[i]];
      }
      const len = Array.isArray(cur) ? cur.length : (cur && typeof cur === 'object' ? Object.keys(cur).length : null);
      if (len === null) return;
      const ratio = len / capNum;
      const level = (len >= capNum) ? 'full' : (ratio >= cfg.nearRatio ? 'near' : 'ok');
      all.push({ path: k, len: len, cap: capNum, ratio: Math.round(ratio * 1000) / 1000, level: level });
    });
    const full = all.filter(function (r) { return r.level === 'full'; });
    const near = all.filter(function (r) { return r.level === 'near'; });
    const hot = full.concat(near).sort(function (a, b) { return b.ratio - a.ratio; });
    const limit = cfg.maxRows;
    const capped = hot.length > limit;
    const kept = capped ? hot.slice(0, limit) : hot;
    const fc = safe(function () {
      if (!WA.storageForecast || typeof WA.storageForecast.forecast !== 'function') return null;
      return WA.storageForecast.forecast();
    }, null);
    const saveStat = safe(function () { return WA.store && WA.store.saveStat ? WA.store.saveStat() : null; }, null);
    noteKind('water', hot.length);
    return { bar: 'water', total: hot.length, rows: kept.map(function (r) {
        return { kind: 'water', route: r.path, path: r.path, len: r.len, cap: r.cap, ratio: r.ratio, level: r.level }; }),
      count: kept.length, capped: capped,
      fullCount: full.length, nearCount: near.length, scanned: all.length, wildcardSkipped: wildcardSkipped,
      empty: false, allClear: hot.length === 0,
      persistedBytes: saveStat ? saveStat.bytes : null,
      saveOk: saveStat ? saveStat.ok : null,
      forecast: fc,
      coverage: capped ? ('仅列最满的前 ' + limit + ' / ' + hot.length + ' 个（其余容器水位未列，不等于没满）') : ('全部 ' + hot.length + ' 个已满 / 近满容器'),
      note: '水位栏只报摘要（几个满、几个近满、最满的前几条）；逐容器全表与挤出站点在维护者清点面' };
  }

  /**
   * 三栏摘要。一屏回答「有什么没做完 / 卡住了 / 快满了」。
   * @returns {{ok, bars:{todo,blocked,water}, headline, note}}
   */
  function summary(opts) {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', bars: null }; }
    if (!(WA.store && typeof WA.store.get === 'function')) { noteFault('no-store'); return { ok: false, reason: 'no-store', bars: null }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const want = arr(o.bars).length ? arr(o.bars) : ['todo', 'blocked', 'water'];
    const bars = {};
    const builders = { todo: todoBar, blocked: blockedBar, water: waterBar };
    want.forEach(function (k) { if (builders[k]) bars[k] = safe(function () { return builders[k](); }, { bar: k, empty: true, allClear: false }); });
    _stat.reads++;
    const t = bars.todo, b = bars.blocked, w = bars.water;
    // headline 是**一句话**，不是三个数字的拼盘：先报最紧的那件事。
    let headline = '';
    if (t && t.total > 0) headline = '有 ' + t.total + ' 件待办没做完';
    else if (b && b.total > 0) headline = '有 ' + b.total + ' 个模块在拒收（卡住）';
    else if (w && (w.fullCount || 0) > 0) headline = '有 ' + w.fullCount + ' 个容器已满';
    else if (t && t.allClear && b && b.allClear && w && w.allClear) headline = '一切正常：没有待办、没有卡住、没有满容器';
    else headline = '数据不全：先打开相应功能，健康中心才有读数';
    return { ok: true, bars: bars, headline: headline,
      barsAsked: want,
      note: '只做聚合与下钻：不替代各模块自己的确认语义，不做任何确认 / 拒绝 / 结算动作' };
  }

  /**
   * 下钻：给定摘要里的一行，告诉玩家「去哪看、看哪条」。
   *   kind='todo'  → 落在该模块 + 该条 id（面板里对应模块区块）
   *   kind='blocked' → 落在该模块 + 拒收码 + 它自己的设置键（从 registry 反查，不硬编码）
   *   kind='water'  → 落在容器路径 + cap + 当前长度
   * 本函数**不改任何状态**：它只回答路由，不执行动作。
   */
  function drill(kind, id) {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const k = clean(kind, 20), key = clean(id, 60);
    if (!k || !key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: (!k ? 'kind' : 'id') }; }
    _stat.drills++;
    if (k === 'todo') {
      const s = TODO_SOURCES.filter(function (x) { return x.key === key || x.ns === key; })[0];
      if (!s) { noteFault('not-found'); return { ok: false, reason: 'not-found', kind: k, id: key }; }
      return { ok: true, kind: k, route: s.ns, module: s.ns, label: s.label, id: key,
        howTo: '打开面板「' + s.label + '」区块；本模块只指路，不代替那里的确认动作' };
    }
    if (k === 'blocked') {
      const m = WA[key];
      if (!m) { noteFault('not-found'); return { ok: false, reason: 'not-found', kind: k, id: key }; }
      // 设置键从 registry 反查（键名不硬编码：模块改名 / 换键后这里自动跟随）。
      const regs = safe(function () { return WA.settingsBus && WA.settingsBus.registry ? WA.settingsBus.registry() : []; }, []) || [];
      const own = regs.filter(function (r) { return r && r.module === key; }).map(function (r) { return r.key; });
      const st = safe(function () { return m.stat(); }, null);
      const faults = obj(st && st.faults);
      const codes = Object.keys(faults).map(function (c) { return { code: c, count: num(faults[c]) || 0, hint: REJECT_HINT[c] || '' }; });
      return { ok: true, kind: k, route: key, module: key, codes: codes,
        lastReason: clean(st && st.lastReason, 40), settingKeys: own,
        howTo: codes.length ? ('先看拒收码：' + codes.map(function (c) { return c.code + (c.hint ? '（' + c.hint + '）' : ''); }).join('；'))
                            : '该模块没有累计拒收码',
        hintKnown: codes.filter(function (c) { return !!c.hint; }).length, hintUnknown: codes.filter(function (c) { return !c.hint; }).length };
    }
    if (k === 'water') {
      const caps = safe(function () { return WA.store && WA.store.sizeCaps ? WA.store.sizeCaps() : null; }, null);
      if (!caps) { noteFault('no-store'); return { ok: false, reason: 'no-store', kind: k }; }
      const meta = caps[key];
      if (!meta) { noteFault('not-found'); return { ok: false, reason: 'not-found', kind: k, id: key }; }
      const segs = key.split('.');
      let cur = state();
      for (let i = 0; i < segs.length; i++) {
        if (cur === null || cur === undefined || typeof cur !== 'object') { cur = null; break; }
        cur = cur[segs[i]];
      }
      const len = Array.isArray(cur) ? cur.length : (cur && typeof cur === 'object' ? Object.keys(cur).length : null);
      const capNum = (typeof meta.cap === 'number' && isFinite(meta.cap)) ? meta.cap : null;
      return { ok: true, kind: k, route: key, path: key, len: len, cap: capNum,
        level: (capNum && len !== null) ? (len >= capNum ? 'full' : 'ok') : 'unknown',
        capSource: 'store.sizeCaps()（唯一真源）',
        howTo: '该容器满时会按写入侧策略拒收或按挤出侧策略丢最旧 —— 具体策略见维护者清点面的可回收栏' };
    }
    noteFault('not-found');
    return { ok: false, reason: 'not-found', kind: k, known: ['todo', 'blocked', 'water'] };
  }

  const SOURCE_PROBES = [
    { name: 'store', probe: function () { return !!(WA.store && typeof WA.store.get === 'function'); } },
    { name: 'sizeCaps', probe: function () { return !!(WA.store && typeof WA.store.sizeCaps === 'function'); } },
    { name: 'settingsBus', probe: function () { return !!(WA.settingsBus && typeof WA.settingsBus.registry === 'function'); } },
    { name: 'storageForecast', probe: function () { return !!(WA.storageForecast && typeof WA.storageForecast.forecast === 'function'); } }
  ];
  function sources() {
    return SOURCE_PROBES.map(function (s) {
      let available = false;
      try { available = !!s.probe(); } catch (e) { available = false; }
      return { name: s.name, available: available };
    }).concat(TODO_SOURCES.map(function (s) {
      const m = WA[s.ns];
      let available = false;
      try { available = !!(m && typeof m[s.fn] === 'function'); } catch (e) { available = false; }
      return { name: s.key, available: available };
    }));
  }

  function diagnose() {
    const checks = {
      store: !!(WA.store && typeof WA.store.get === 'function'),
      sizeCaps: !!(WA.store && typeof WA.store.sizeCaps === 'function'),
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.registry === 'function'),
      storageForecast: !!(WA.storageForecast && typeof WA.storageForecast.forecast === 'function')
    };
    const ok = checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.182.0',
      bars: ['todo', 'blocked', 'water'], todoSources: TODO_SOURCES.length };
  }

  function stat() {
    return { reads: _stat.reads, drills: _stat.drills, refused: _stat.refused, lastReason: _stat.lastReason,
      faults: Object.assign({}, _stat.faults), byKind: Object.assign({}, _stat.byKind),
      enabled: getSettings().enabled, maxRows: getSettings().maxRows };
  }

  function reset() { _stat.reads = 0; _stat.drills = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; _stat.byKind = {}; return { ok: true }; }

  WA.worldHealth = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    summary: summary,
    drill: drill,
    sources: sources,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 8;
  var _exported = Object.keys(WA.worldHealth).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('worldHealth: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/world-health.js', { kind: 'engine', ver: '2.182.0' });
})();
