/**
 * WorldAxis engines/narrow-consumers.js (v2.524.0)
 * OPV27-5 窄消费引擎接产品链：`docs/engine-integration-inventory.md` 里有 **55 台**引擎
 *   的「Consumer files ≤2」——装进来了、也在跑，但产品侧没人读，等于白装。
 *
 * 本轮实测（/tmp/pprobe.cjs，对 consumer≤3 且有 view 的 22 台逐台调 view() 看返回结构）
 *   逮住一件比「没接线」更根本的事：
 *     · 只有 4 台给出**运行时数据**（autoHide.vias / laborSchedule.bookings /
 *       sceneBudget.rows / ephemeralScrub.tags）；
 *     · 11 台给的是**静态词表/注册表**（l3Registry.entries 28、worldClock.weekdays 7、
 *       backstageTone.eras 5 …）——它们永远有「数」，但那个数不是你这一局玩出来的；
 *     · 7 台压根没有 view 读口（publicAgenda / roleConflict / sceneNarrative / sharedAwareness …）。
 *   所以「consumer 少」不是接线懒，很大一部分是**它们连「这一局发生了什么」都读不出来**。
 *
 * 本模块据此做两件事，而不是把 12 台硬塞进正文：
 *   1 `board()`：12 台逐台给档位——`runtime`（有运行时数据）/ `static`（只有静态词表）/
 *      `no-reader`（没读口）。这是「为什么它们是死面」的读数。
 *   2 `buildBlock()`：注入正文只出现 **runtime 且真有条目** 的那几台——
 *      静态词表不进正文（否则每局都印一张星期表，纯噪音）。
 *
 * 边界（否定式）：
 *   1 不写任何引擎状态；接产品链 ≠ 改行为。
 *   2 不把静态词表当「在用」：档位分开报，正文只收 runtime。
 *   3 读失败/没读口如实标，不猜一个「应该有用」。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_narrow_consumers_settings_v1';
  const DEF = { enabled: true, maxRows: 12, blockMax: 120 };
  const __REG = { key: LS_KEY, def: DEF, module: 'narrowConsumers', bounds: { maxRows: [3, 24], blockMax: [40, 400] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign({}, base, raw || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 12 台按实测档位挑齐：4 台 runtime + 6 台 static + 2 台有 view 但只给配置。
  const REG = [
    { ns: 'autoHide', file: 'engines/auto-hide.js', zh: '自动隐去' },
    { ns: 'laborSchedule', file: 'engines/labor-schedule.js', zh: '劳作排班' },
    { ns: 'sceneBudget', file: 'engines/scene-budget.js', zh: '场景预算' },
    { ns: 'ephemeralScrub', file: 'engines/ephemeral-scrub.js', zh: '短暂冲刷' },
    { ns: 'l3Registry', file: 'engines/l3-registry.js', zh: 'L3 注册表' },
    { ns: 'pushApiRegistry', file: 'engines/push-api-registry.js', zh: '推送登记' },
    { ns: 'fieldWriters', file: 'engines/field-writers.js', zh: '字段写者' },
    { ns: 'memoryTiers', file: 'engines/memory-tiers.js', zh: '记忆分层' },
    { ns: 'redactLayer', file: 'engines/redact-layer.js', zh: '脱敏层' },
    { ns: 'scopeTag', file: 'engines/scope-tag.js', zh: '作用域标记' },
    { ns: 'worldClock', file: 'engines/world-clock.js', zh: '世界钟源' },
    { ns: 'prefilterGate', file: 'engines/prefilter-gate.js', zh: '预筛闸' }
  ];

  /** 静态词表的数组键名——它们有长度，但长度与「这局发生了什么」无关。 */
  const STATIC_KEYS = ['tags', 'words', 'weekdays', 'eras', 'sources', 'authorityOrder', 'guidelines',
    'labelWords', 'labelWordsZh', 'patterns', 'secretKeys', 'fields', 'tiers', 'kinds', 'noteKinds',
    'shichen', 'openTags', 'closeTags', 'columns', 'headers', 'steps', 'stages',
    // v2.524.0（实测修正）：`entries` 在实测里全是**注册表条目**（l3Registry 28 / pushApiRegistry 15），
    //   与「这局发生了什么」无关。初版把它归进运行时键，于是「L3 注册表·entries 28」被当成在用。
    'entries'];
  /** 运行时数据的数组键名——这些才是「本局产出」。 */
  const RUNTIME_KEYS = ['rows', 'bookings', 'vias', 'changes', 'records', 'log', 'voices', 'agenda', 'items'];

  const stat = { boards: 0, blocks: 0, readOk: 0, readFail: 0, lastAt: 0 };

  /**
   * 档位判定：先看运行时键（非空→runtime，空→runtime-empty），再看静态键（→static）。
   * **空运行时容器也算 runtime**：它说明这台引擎「有一条会长的账」，只是这局还没长。
   * 若什么都没有（只有配置/时间戳）→ no-data。
   */
  function classify(v) {
    if (v == null) return { kind: 'no-data', text: null };
    if (typeof v !== 'object') return { kind: 'no-data', text: null };
    const keys = Object.keys(v);
    let runtimeEmpty = null;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (RUNTIME_KEYS.indexOf(k) < 0) continue;
      if (Array.isArray(v[k])) {
        if (v[k].length) return { kind: 'runtime', text: k + ' ' + v[k].length };
        runtimeEmpty = k;
      }
    }
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (STATIC_KEYS.indexOf(k) < 0) continue;
      if (Array.isArray(v[k])) return { kind: 'static', text: k + ' ' + v[k].length + '（静态词表）' };
    }
    if (runtimeEmpty) return { kind: 'runtime-empty', text: runtimeEmpty + ' 0' };
    return { kind: 'no-data', text: null };
  }

  function readOne(e) {
    const ns = WA[e.ns];
    if (!ns) return { ns: e.ns, file: e.file, zh: e.zh, ok: false, kind: 'no-reader', reason: 'not-loaded', text: null };
    const fn = (typeof ns.view === 'function') ? ns.view : (typeof ns.stat === 'function' ? ns.stat : null);
    if (!fn) return { ns: e.ns, file: e.file, zh: e.zh, ok: false, kind: 'no-reader', reason: 'no-reader', text: null };
    try {
      const c = classify(fn.call(ns));
      stat.readOk++;
      return { ns: e.ns, file: e.file, zh: e.zh, ok: true, kind: c.kind, text: c.text };
    } catch (err) {
      stat.readFail++;
      return { ns: e.ns, file: e.file, zh: e.zh, ok: false, kind: 'no-reader', reason: 'read-threw',
        detail: String((err && err.message) || err).slice(0, 60), text: null };
    }
  }

  /** board()：12 台逐台档位（为什么它们是死面，一眼可见）。 */
  function board() {
    stat.boards++; stat.lastAt = clockNow('narrowConsumers');
    const s = settings();
    if (!s.enabled) return { ok: false, reason: 'disabled', rows: [], text: '窄消费引擎总览已关闭' };
    const rows = REG.slice(0, s.maxRows).map(readOne);
    const by = { runtime: 0, 'runtime-empty': 0, static: 0, 'no-reader': 0, 'no-data': 0 };
    rows.forEach(function (r) { by[r.kind] = (by[r.kind] || 0) + 1; });
    return {
      ok: true, at: stat.lastAt, rows: rows, byKind: by, total: rows.length,
      text: '窄消费引擎 12 台：运行时数据 ' + by.runtime + ' 台 · 有账未长 ' + by['runtime-empty']
        + ' 台 · 只有静态词表 ' + by.static + ' 台 · 无读口 ' + by['no-reader'] + ' 台'
    };
  }

  /** buildBlock()：注入正文只收 runtime（真有本局条目）。静态词表不进正文。 */
  function buildBlock() {
    stat.blocks++;
    const s = settings();
    if (!s.enabled) return '';
    const b = board();
    if (!b.ok) return '';
    const live = b.rows.filter(function (r) { return r.kind === 'runtime' && r.text; });
    if (!live.length) return '';
    const parts = [];
    let used = 0, rest = 0;
    for (let i = 0; i < live.length; i++) {
      const piece = live[i].zh + '·' + live[i].text;
      if (used + piece.length + 3 > s.blockMax) { rest++; continue; }
      parts.push(piece); used += piece.length + 3;
    }
    return '[在用机制] ' + parts.join(' · ') + (rest > 0 ? ' · 另 ' + rest + ' 台有数' : '');
  }

  WA.narrowConsumers = {
    board: board, buildBlock: buildBlock,
    registry: function () { return REG.map(function (e) { return { ns: e.ns, file: e.file, zh: e.zh }; }); },
    settings: settings,
    stat: function () { return Object.assign({}, stat); }
  };
  // 装载面登记与自述行：与全部引擎同形态（少这两行会在装载汇报里被算成「未自述」，
  //   而 module-registry 的装载期边也要靠 registerModule 才能记到这台）。
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/narrow-consumers.js', { kind: 'engine', ver: '2.524.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/narrow-consumers 已加载（2.524.0）');
})();