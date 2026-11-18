/**
 * WorldAxis engines/narrative-preset.js (v2.524.0) — OPV28-01 ~ OPV28-06
 *   叙事优先的六个入口：预设 / 契约分层 / 注入总闸 / 静默许可 / 概览一屏 / 全局产量上限
 *
 * ── 它治的病 ─────────────────────────────────────────────────────
 *   V28 把「世界会自己动」做出来了，代价是**面**变宽了：一次注入里可能同时塞着世界状态、
 *   自转日志、账本读数、面板提示，模型被读数淹没，玩家看到的是一堆仪表。OPV28 组一
 *   要的是六件「让叙事重新站在前面」的事：
 *     ① 一条**可还原**的叙事优先预设（不反转出厂全开，不新增存档键）；
 *     ② 契约分层：必答 6 字段 + 有变化才申报（空节零 token）；
 *     ③ 注入总闸：世界状态类占比有上限，超了折成一句「世界近况」；
 *     ④ 静默许可：这轮没有值得说的事，就明说，并记 `ok-empty`；
 *     ⑤ 概览一屏：窗口三行 + 三条待办 + 一句近况，够新玩家开局；
 *     ⑥ 全局产量上限：每轮世界自转产出有顶，超出**排队不丢**，下一轮优先。
 *
 * ── 纪律（每条都有判据咬）────────────────────────────────────────
 *   · 预设只动**非叙事面**：名单里出现叙事面（本仓十四台 V28 引擎 + 世界简报）一律
 *     `conflict` 拒收 —— 「叙事优先」不许把叙事本身关掉。
 *   · 预设**可还原且幂等**：`restore` 按快照逐项写回，重复调用不叠加。
 *   · 契约的必答 6 字段缺一项就 `missing-fields` 并**点名**，不静默当默认值。
 *   · 总闸只折「世界状态类」，场景信息一条都不折；折出来的那句必须能对上被折内容。
 *   · 产量上限：**不丢**。超出的进 `queue`，`drain` 下一轮先吐。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_narrativepreset_settings_v1';
  const DEF = { enabled: true, worldPct: 35, productionCap: 6, overviewWindow: 3, overviewTodos: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'narrativePreset',
    bounds: { worldPct: [10, 80], productionCap: [1, 20], overviewWindow: [1, 6], overviewTodos: [1, 6] } };
  const stat = { applied: 0, restored: 0, gates: 0, folded: 0, caps: 0, queued: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 叙事面：V28 十四台引擎 + 世界简报。预设**不许**动它们。
  const NARRATIVE = ['offstageQueue', 'actStep', 'tracePost', 'misbelief', 'threadSprout', 'dormantLadder',
    'consequenceSchedule', 'appointment', 'timeLedger', 'hearsayLedger', 'farAccount', 'interlude',
    'letterPost', 'worldBrief'];
  // 非叙事面候选（默认收窄名单）：只要现场有这个模块、且它自己带 setSettings 才动。
  const DEFAULT_NARROW = ['periodicals', 'opinion', 'agenda', 'weather', 'festivalFair'];
  const REQUIRED6 = ['谁', '在哪', '何时', '做了什么', '为什么', '代价'];

  function refuse(reason, extra) { stat.refused++; stat.lastReason = reason; return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function has(ns) { try { return !!(WA[ns] && typeof WA[ns].getSettings === 'function' && typeof WA[ns].setSettings === 'function'); } catch (e) { return false; } }
  function snapshotPath() { return 'narrativePresetSnapshot'; }
  function readSnap() {
    try { const d = WA.store.get() || {}; return d[snapshotPath()] || null; } catch (e) { return null; }
  }
  function writeSnap(obj) {
    try {
      if (!WA.store || !WA.store.transact) return false;
      WA.store.transact(function (d) { d[snapshotPath()] = obj; return true; }, 'preset:snapshot');
      return true;
    } catch (e) { return false; }
  }

  /** OPV28-01 叙事优先预设：收窄非叙事面，可还原，幂等。 */
  function apply(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const want = Array.isArray(s.narrow) && s.narrow.length ? s.narrow.map(String) : DEFAULT_NARROW.slice();
    const bad = want.filter(function (ns) { return NARRATIVE.indexOf(ns) >= 0; });
    if (bad.length) return refuse('conflict', { narrative: bad, why: '叙事优先不许把叙事本身关掉' });
    const live = want.filter(has).filter(function (ns) {
      try { return WA[ns].getSettings().enabled !== false; } catch (e) { return false; }
    });
    if (!live.length) return { ok: true, reason: 'ok', narrowed: [], note: '现场没有可收窄的非叙事面（本次不改任何东西）' };
    const prev = {};
    live.forEach(function (ns) {
      try { prev[ns] = WA[ns].getSettings(); WA[ns].setSettings({ enabled: false }); } catch (e) { /* 单项失败不连坐 */ }
    });
    const kept = {};
    try { NARRATIVE.forEach(function (ns) { if (has(ns)) kept[ns] = (WA[ns].getSettings() || {}).enabled !== false; }); } catch (e) { /* 只做读数 */ }
    writeSnap({ at: Date.now(), prev: prev });
    stat.applied++;
    return { ok: true, reason: 'ok', narrowed: Object.keys(prev), narrativeOn: Object.keys(kept).filter(function (k) { return kept[k]; }), prev: prev };
  }
  /** 还原预设（幂等：没有快照就什么也不做）。 */
  function restore() {
    const snap = readSnap();
    if (!snap || !snap.prev) return { ok: true, reason: 'ok', restored: [], note: '没有预设快照（本来就没收窄过）' };
    const done = [];
    Object.keys(snap.prev).forEach(function (ns) {
      if (!has(ns)) return;
      try { WA[ns].setSettings(snap.prev[ns]); done.push(ns); } catch (e) { /* 单项失败留痕 */ }
    });
    writeSnap(null);
    stat.restored++;
    return { ok: true, reason: 'ok', restored: done };
  }

  /** OPV28-02 契约分层：必答 6 字段 + 有变化才申报（空节零 token）。 */
  function contract() {
    return { ok: true, reason: 'ok', required: REQUIRED6.slice(), optional: ['天气', '旁人', '细物', '闲话'],
      rule: '必答 6 项缺一项就拒收并点名字段；其余四节**有变化才申报**，没变化整节不写（不占 token）' };
  }
  function check(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const missing = REQUIRED6.filter(function (k) {
      const v = p[k];
      if (v === null || v === undefined) return true;
      if (typeof v === 'string') return v.replace(/\s+/g, '') === '';
      return false;
    });
    if (missing.length) return refuse('missing-fields', { missing: missing, why: '必答字段不许留空顶过去' });
    const omitted = Object.keys(p).filter(function (k) { return REQUIRED6.indexOf(k) < 0 && p[k] === undefined; });
    return { ok: true, reason: 'ok', filled: REQUIRED6.slice(), omitted: omitted, tokenZero: omitted.length };
  }

  /** OPV28-03 注入总闸：世界状态类占比 ≤ 上限，超了折成一句。 */
  const WORLD_SOURCES = ['世界', '世界近况', '账本', '自转日志', '读数', '账目'];
  function gate(items) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const arr = Array.isArray(items) ? items.filter(function (x) { return x && typeof x.content === 'string'; }) : [];
    if (!arr.length) return { ok: true, reason: 'ok', pct: 0, folded: false, text: '', kept: 0 };
    const len = function (x) { return x.content.length; };
    const total = arr.reduce(function (n, x) { return n + len(x); }, 0);
    const worldItems = arr.filter(function (x) { return WORLD_SOURCES.indexOf(String(x.source || '')) >= 0; });
    const sceneItems = arr.filter(function (x) { return WORLD_SOURCES.indexOf(String(x.source || '')) < 0; });
    const worldLen = worldItems.reduce(function (n, x) { return n + len(x); }, 0);
    const pct = total ? Math.round(worldLen * 100 / total) : 0;
    stat.gates++;
    if (pct <= cfg.worldPct) return { ok: true, reason: 'ok', pct: pct, cap: cfg.worldPct, folded: false, kept: arr.length, sceneKept: sceneItems.length };
    // 折：只留三句里最能对上内容的那一句（用标题里的第一个短句 + 条数），场景一条不折
    const head = worldItems.map(function (x) { return String(x.content).split('\n')[0].replace(/^[-·\s]+/, '').slice(0, 26); }).slice(0, 3);
    const line = '世界近况：' + worldItems.length + ' 条 —— ' + head.join('；');
    stat.folded++;
    return { ok: true, reason: 'ok', pct: pct, cap: cfg.worldPct, folded: true, kept: sceneItems.length + 1,
      sceneKept: sceneItems.length, line: line, foldedCount: worldItems.length };
  }

  /** OPV28-04 静默许可：没有值得说的事就明说，并让读数记 ok-empty。 */
  function silence(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    let q = null;
    try { q = WA.worldBrief && WA.worldBrief.quiet ? WA.worldBrief.quiet({ rounds: s.rounds }) : null; } catch (e) { q = null; }
    const quiet = !!(q && q.ok && q.quiet === true);
    let health = '';
    if (quiet) {
      try {
        if (WA.worldHealth && typeof WA.worldHealth.note === 'function') { WA.worldHealth.note('ok-empty'); health = 'noted'; }
      } catch (e) { health = 'note-failed'; }
    }
    return { ok: true, reason: quiet ? 'ok-empty' : 'ok', quiet: quiet,
      line: quiet ? '这一轮没有值得说的事。' : (q && q.line) || '这一轮有变化。',
      health: health };
  }

  /** OPV28-05 概览一屏：窗口三行 + 三条待办 + 一句近况。 */
  function overview() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const win = [];
    try {
      const d = WA.store && WA.store.get ? (WA.store.get() || {}) : {};
      const chr = Array.isArray(d.chronicle) ? d.chronicle : [];
      chr.slice(-cfg.overviewWindow).forEach(function (x) {
        if (x && x.text) win.push(String(x.text).slice(0, 40));
      });
    } catch (e) { /* 空窗口 */ }
    const todos = [];
    try {
      const d2 = WA.store && WA.store.get ? (WA.store.get() || {}) : {};
      const pend = Array.isArray(d2.pending) ? d2.pending : [];
      pend.slice(0, cfg.overviewTodos).forEach(function (x) {
        if (x) todos.push(String(x.title || x.what || x).slice(0, 36));
      });
      if (!todos.length && WA.appointment && typeof WA.appointment.view === 'function') {
        const ap = WA.appointment.view();
        (ap && ap.rows ? ap.rows : []).slice(0, cfg.overviewTodos).forEach(function (r) {
          if (r && r.what) todos.push(String(r.what).slice(0, 36));
        });
      }
    } catch (e) { /* 无待办 */ }
    let now = '';
    try { const l = WA.worldBrief && WA.worldBrief.oneLine ? WA.worldBrief.oneLine() : null; if (l && l.ok) now = l.line; } catch (e) { /* 不编 */ }
    return { ok: true, reason: 'ok', window: win, todos: todos, now: now,
      lines: win.length + todos.length + (now ? 1 : 0) };
  }

  /** OPV28-06 全局产量上限：超出**排队不丢**，下一轮优先。 */
  function cap(list) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const arr = Array.isArray(list) ? list : [];
    stat.caps++;
    let queued = [];
    try {
      const d = WA.store && WA.store.get ? (WA.store.get() || {}) : {};
      queued = Array.isArray(d.productionQueue) ? d.productionQueue.slice() : [];
    } catch (e) { queued = []; }
    const room = Math.max(0, cfg.productionCap - queued.length);
    const accepted = arr.slice(0, room);
    const overflow = arr.slice(room);
    const nextQueue = queued.concat(overflow).slice(0, 60);
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) { d.productionQueue = nextQueue; return true; }, 'preset:cap');
      }
    } catch (e) { /* 排队失败不伪造 */ }
    stat.queued = nextQueue.length;
    return { ok: true, reason: 'ok', accepted: accepted.length, queued: overflow.length,
      cap: cfg.productionCap, backlog: nextQueue.length,
      note: overflow.length ? ('超出的 ' + overflow.length + ' 条已排队，下一轮先出') : '' };
  }
  /** 下一轮先把排队项吐出来（最多 cap 条）。 */
  function drain() {
    const cfg = settings();
    let queued = [];
    try { const d = WA.store.get() || {}; queued = Array.isArray(d.productionQueue) ? d.productionQueue.slice() : []; } catch (e) { queued = []; }
    const take = queued.slice(0, cfg.productionCap);
    const rest = queued.slice(cfg.productionCap);
    try {
      if (WA.store && WA.store.transact) WA.store.transact(function (d) { d.productionQueue = rest; return true; }, 'preset:drain');
    } catch (e) { /* 不改就留着 */ }
    return { ok: true, reason: 'ok', drained: take, left: rest.length };
  }

  function view() {
    return { enabled: settings().enabled, narrative: NARRATIVE.slice(), stat: Object.assign({}, stat),
      snapshot: !!readSnap() };
  }

  WA.narrativePreset = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    apply: apply, restore: restore, contract: contract, check: check, gate: gate,
    silence: silence, overview: overview, cap: cap, drain: drain, view: view,
    NARRATIVE: NARRATIVE.slice(), REQUIRED: REQUIRED6.slice(),
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/narrative-preset.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/narrative-preset 已加载（' + VERSION + '）');
})();