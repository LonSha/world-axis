/**
 * WorldAxis engines/sediment.js (v2.149.0) — 世界沉积层（X1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   chronicle / echoes 都是**流水账**：事件发生了、记下来了，然后沉进环形缓冲区，
 *   永不与「发生的地点」重新发生关系。后果是玩家路过三个月前的旧战场，世界答不出
 *   「这里发生了什么」——地上没有残骸、NPC 不会谈起、势力对它没有特别态度。
 *   一句话：**世界会记事，但地点不会沉积 —— 走过一处旧战场，地上什么也没有。**
 *
 * ── 本模块落点 ────────────────────────────────────────────────
 *   · settle(placeId, fact)  — 按**显式**地点入账一条沉积（不猜、不从正文提取语义）。
 *       痕迹等级 trace（1 minor / 2 marked / 3 scar）由调用方给，本模块只裁决合法性。
 *   · feel(placeId)          — **当前**痕迹档（含衰减）：读得出「这里现在留下什么」。
 *   · buildBlock(placeId)    — 入口注入块（预算内，只念前若干条非传说痕迹）。
 *   · stat()                 — 圆形独立统计（本模块 stat 的口径，见下）。
 *
 * ── 与 rumor / intel / chronicle 的差异化口径（关键，不许重叠）──
 *   · rumor  —— **某人**传开了什么（活的、会失真的传播面）；
 *   · intel  —— **某人手里**持有什么情报（知情面，带来源与置信度）；
 *   · chronicle —— **时间序**的世界大事记（流水账，无地点维度）。
 *   本模块是第四件东西：**地点**上沉积了什么（地点的记忆，带衰减）。
 *   三者交叉引用（一条 rumor 的来源可以是一场大战的沉积），但**绝不互相替代**。
 *
 * ── 痕迹衰减（为什么必须衰减，而不是只记不消）──────────────────
 *   痕迹**不消失**，只**降档**：scar → marked → minor → legend。
 *   「不消失」是本仓的一条硬边界——「记录被删掉」是最贵的一类默认值，
 *   玩家三个月后回到旧战场，答「这里什么都没发生过」比答「痕迹淡了」糟得多。
 *   legend 是**永驻地**：再衰减也不再降（旧战场永远可以被当成「传说里的地方」谈起）。
 *   衰减是**读出来的**（feel 现算），不是**写回去的**——把衰减写成落盘字段，
 *   就等于让「现在什么档」出现两份真源（读到的与算出来的会漂移）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 settle / feel 拒收（disabled），buildBlock 返回空串。
 *   2 **不做语义提取**。不从正文里认地点名、不从事件文本推地点——认不出就说认不出。
 *   3 **不改世界事实**。沉积是「地点留下了什么痕迹」，不是「事件真的发生过」——
 *      真源永远是 chronicle / worldFacts，本模块只持有**地点视角的投影**。
 *   4 **衰减只报不改**。feel 现算档位，不写回任何字段（写回即第二真源）。
 *   5 **有界**。三容器全部登记容量并走 WA.evict 单一出口（place / events / total 三重上限）。
 *   6 地点 id 与事实键**一律显式**（不给就拒收，不自动生成、不猜）。
 */

(function () {
  'use strict';
  // v2.149.0：别名形态用本仓规范式（module-cycle-gate 只认这一种形态）。
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_sediment_settings_v1';
  const DEF = {
    enabled: false,
    traceWindowMs: 86400000,   // 一档衰减所需时间（默认一天一档）
    maxItems: 4,               // 注入块最多念几条
    capPlaces: 24,             // 地点数上限
    capEvents: 48,             // 单地点事件上限
    capTotal: 96               // 沉积总条数上限
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'sediment',
    bounds: { traceWindowMs: [60000, 2592000000], maxItems: [1, 12], capPlaces: [4, 48], capEvents: [8, 96], capTotal: [16, 240] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  /**
   * v2.149.0（X1 收口）：设置**写口**。与 settings() 是一对（读 / 写）。
   *   为什么必须有它：面板的总开关读 getSettings、写 setSettings —— 只给读口等于
   *   「启用世界沉积层」是一个**点了没有任何反应**的控件（实测面板引用此口而导出面缺席，
   *   于是恒走 module-missing 分支：静默、不报错、看起来像没实现）。
   *   形态与 perspective-lock 的 saveSettings 同规格：normalize（表外值一律夹回 bounds）
   *   → saveOrThrow（落盘失败如实返回，不假装成功）。
   */
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // ── 痕迹三档 + 永驻档 ──────────────────────────────────────────
  //   为什么必须成表：自造档位等于自造判定——不成表的档位，下一手（面板、诊断、
  //   注入链）无法接手。「随口写一个痕迹名」正是本模块要治的那种失真
  //   （与 perspective-lock 的 LENSES、lifeline 的 KINDS 同一条纪律）。
  const TRACES = ['minor', 'marked', 'scar'];
  // 衰减阶梯：scar → marked → minor → legend（legend 永驻，不再降）。
  const LADDER = { scar: 'marked', marked: 'minor', minor: 'legend', legend: 'legend' };
  const TRACE_LABEL = { minor: '隐约可见', marked: '清晰可辨', scar: '遍地残骸', legend: '传说' };

  const stat = { settled: 0, feels: 0, blocks: 0, evicted: 0, byTrace: {}, faults: {} };

  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function cfgOn() { return settings().enabled !== false; }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().sediment; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(placeId, root) {
    const arr = ((((root || state()).sediment) || {}).rows) || [];
    const key = clean(placeId, 40);
    for (let i = 0; i < arr.length; i++) { if (arr[i] && String(arr[i].place) === key) return arr[i]; }
    return null;
  }
  function evictOf(op) {
    // 挤出走单一出口（cap 的单一真源是 core/evict.js 的 SITES，与 store.__BOUNDED_CAPS 同源）。
    if (!WA.evict) return;
    const list = ((state().sediment) || {}).rows || [];
    WA.evict.array(list, 'sediment.places');
    list.forEach(function (r) { if (r && Array.isArray(r.events)) WA.evict.array(r.events, 'sediment.events'); });
    // 总量挤出：最旧地点优先（total 是**跨地点**上限，防「每个地点都不超、合起来撑爆」）。
    const flat = [];
    list.forEach(function (r) { (r.events || []).forEach(function (e) { flat.push({ r: r, e: e }); }); });
    const capTotal = settings().capTotal;
    if (flat.length > capTotal) {
      flat.sort(function (a, b) { return (a.e.at || 0) - (b.e.at || 0); });
      const drop = flat.slice(0, flat.length - capTotal);
      drop.forEach(function (x) {
        const arr = x.r.events;
        const idx = arr.indexOf(x.e);
        if (idx >= 0) { arr.splice(idx, 1); stat.evicted++; }
      });
    }
  }

  /**
   * 入账一条沉积。
   * @param {string} placeId 地点 id（显式，不给即拒收）
   * @param {object} fact   { key, text, trace, kind, persons, factions, at }
   * @returns {{ok:boolean, reason?:string, place?:string, trace?:string, size?:number}}
   */
  function settle(placeId, fact) {
    if (!cfgOn()) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const place = clean(placeId, 40);
    if (!place) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'place' }; }
    if (!fact || typeof fact !== 'object') { noteFault('bad-value'); return { ok: false, reason: 'bad-value', field: 'fact' }; }
    const key = clean(fact.key, 48);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'key' }; }
    const text = clean(fact.text, 120);
    const trace = clean(fact.trace, 12) || 'minor';
    // 表外痕迹档拒收 —— 与 perspective 的 bad-lens 同规格：自造档位等于自造判定。
    if (TRACES.indexOf(trace) < 0) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', field: 'trace', allowed: TRACES.slice() };
    }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const at = isFinite(Number(fact.at)) && Number(fact.at) > 0 ? Math.floor(Number(fact.at)) : (WA.clock ? WA.clock.now('sediment') : Date.now());
    let out = null;
    WA.store.transact(function (draft) {
      const root = (draft.sediment = draft.sediment || { rows: [] });
      if (!Array.isArray(root.rows)) root.rows = [];
      let row = null;
      for (let i = 0; i < root.rows.length; i++) { if (root.rows[i] && String(root.rows[i].place) === place) { row = root.rows[i]; break; } }
      if (!row) { row = { place: place, events: [] }; root.rows.push(row); }
      if (!Array.isArray(row.events)) row.events = [];
      // 同键不堆行：同一件事在同一地点只记一次（重复入账只刷新痕迹与时间）。
      let prev = null;
      for (let i = 0; i < row.events.length; i++) { if (row.events[i] && String(row.events[i].key) === key) { prev = row.events[i]; break; } }
      if (prev) {
        // 痕迹**只升不降**：旧战场再打一仗 ⇒ scar 覆盖 marked；反过来不许把它降回去
        //（「这里曾经遍地残骸」是事实，不能因为后来有人扫了地就假装没发生过）。
        const better = TRACES.indexOf(trace) > TRACES.indexOf(prev.trace) ? trace : prev.trace;
        prev.trace = better;
        prev.at = at;
        if (text) prev.text = text;
        out = { ok: true, place: place, key: key, trace: better, updated: true, size: row.events.length };
      } else {
        row.events.push({ key: key, text: text, trace: trace, kind: clean(fact.kind, 20) || 'other',
          persons: Array.isArray(fact.persons) ? fact.persons.slice(0, 6) : [],
          factions: Array.isArray(fact.factions) ? fact.factions.slice(0, 4) : [], at: at });
        out = { ok: true, place: place, key: key, trace: trace, updated: false, size: row.events.length };
      }
      return true;
    }, 'sediment:settle');
    if (out && out.ok) {
      stat.settled++;
      stat.byTrace[out.trace] = (stat.byTrace[out.trace] || 0) + 1;
      stat.lastReason = 'settled';
      evictOf();
    } else if (out) { stat.faults[out.reason] = (stat.faults[out.reason] || 0) + 1; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 一条沉积**现在**的档位（衰减现算，不写回任何字段）。
   *   年龄按「距入账时刻过了几个 traceWindowMs」降几档；legend 永驻。
   */
  function decayedTrace(trace, at, now, windowMs) {
    const w = windowMs > 0 ? windowMs : DEF.traceWindowMs;
    const age = Math.max(0, now - (at || now));
    const steps = Math.floor(age / w);
    let cur = trace;
    for (let i = 0; i < steps; i++) { cur = LADDER[cur] || 'legend'; }
    return cur;
  }

  /**
   * 「这里现在留下什么痕迹」——地点视角的投影读数（含衰减）。
   * @returns {{ok:boolean, reason?:string, place?:string, rows?:Array, peak?:string, count?:number}}
   */
  function feel(placeId) {
    if (!cfgOn()) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const place = clean(placeId, 40);
    if (!place) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'place' }; }
    const row = rowOf(place);
    stat.feels++;
    if (!row) { stat.lastReason = 'absent'; return { ok: true, place: place, rows: [], peak: null, count: 0, absent: true }; }
    const cfg = settings();
    const now = WA.clock ? WA.clock.now('sediment') : Date.now();
    const rows = (row.events || []).map(function (e) {
      const tr = decayedTrace(e.trace, e.at, now, cfg.traceWindowMs);
      return { key: e.key, text: clean(e.text, 80), trace: e.trace, now: tr, label: TRACE_LABEL[tr] || tr,
        kind: e.kind || 'other', at: e.at || 0, faded: tr !== e.trace };
    }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    // peak = 当前最强档（按 TRACES 序 + legend 最低）。
    let peak = null;
    rows.forEach(function (r) { if (peak === null || TRACES.indexOf(r.now) > TRACES.indexOf(peak)) peak = r.now; });
    if (rows.length && peak === null) peak = 'legend';
    stat.lastReason = 'felt';
    return { ok: true, place: place, rows: rows, peak: peak || (rows.length ? 'minor' : null), count: rows.length };
  }

  /**
   * 注入块：进入有沉积的地点时念「此地的历史痕迹」（预算内，只念非传说的前若干条）。
   *   不给 placeId 时从**当前场景**取地点（`sceneSlice` 是「此刻在哪个地点」的既有真源）——
   *   本模块**不另立一份「当前地点」**：那正是第二真源，会与 sceneSlice 漂移。
   */
  function currentPlace() {
    try {
      if (!WA.sceneSlice || typeof WA.sceneSlice.read !== 'function') return null;
      const cur = WA.sceneSlice.read();
      return (cur && cur.ok && cur.place) ? cur.place : null;
    } catch (e) { return null; }
  }
  function buildBlock(placeId) {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const place = clean(placeId, 40) || currentPlace();
    if (!place) return '';
    const f = feel(place);
    if (!f.ok || !f.count) return '';
    const alive = f.rows.filter(function (r) { return r.now !== 'legend'; }).slice(0, cfg.maxItems);
    if (!alive.length) return '';
    stat.blocks++;
    const lines = alive.map(function (r) {
      return '- ' + (r.label || r.now) + '：' + (r.text || r.key) + (r.faded ? '（痕迹已淡）' : '');
    });
    return '[此地的历史痕迹]' + String.fromCharCode(10)
      + '这处地方留有旧事的痕迹（痕迹会随时间变淡，但不会消失）：' + String.fromCharCode(10)
      + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '痕迹只说明这里发生过什么，不等于当事人此刻在场。';
  }

  function statOf() {
    const arr = rows();
    const cfg = settings();
    const now = WA.clock ? WA.clock.now('sediment') : Date.now();
    let total = 0, legend = 0;
    arr.forEach(function (r) { (r.events || []).forEach(function (e) {
      total++;
      if (decayedTrace(e.trace, e.at, now, cfg.traceWindowMs) === 'legend') legend++;
    }); });
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      byTrace: Object.assign({}, stat.byTrace),
      enabled: !!cfg.enabled,
      places: arr.length, events: total, legends: legend,
      caps: { places: cfg.capPlaces, events: cfg.capEvents, total: cfg.capTotal }
    });
  }

  WA.sediment = {
    TRACES: TRACES.slice(),
    LADDER: Object.assign({}, LADDER),
    LABEL: Object.assign({}, TRACE_LABEL),
    getSettings: settings,
    // v2.149.0（X1 收口）：写口与读口成对（面板总开关的真消费方）。
    setSettings: saveSettings,
    settle: settle, feel: feel, buildBlock: buildBlock,
    stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/sediment.js', { kind: 'engine', ver: '2.149.0' });
})();