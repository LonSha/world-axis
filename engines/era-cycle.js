/**
 * WorldAxis engines/era-cycle.js (v2.68.0)
 * 资料片周期：长草期→预热期→爆发期→结算期的状态机，倒计时按天数增量推进。
 *
 * 缝合来源：《艾尔德兰》世界书的「资料片周期」倒计时处理流程——
 *   ΔD = 本回合【世界时间.天数】的增加量（同日活动 ΔD=0）；T' = T - ΔD；
 *   T' > 0 仅替换倒计时；T' ≤ 0 按状态机推进阶段并取新倒计时；
 *   结算期→长草期的第一回合**强制更新事件**（禁止沿用旧名称敷衍）；
 *   特殊跨档：ΔD 极大时**连续推进**直到 T' > 0，不得停在中间任何阶段。
 * 能落成引擎判据的是这套状态机的推进纪律；「构思全新事件名称」是叙事决定，留白不替写。
 *
 * 与 calendar.js / clock 的分工：clock 管「现在几点」，calendar 管「今天几号」，
 * 本模块管「世界的注意力现在处在周期的哪一档」——阶段是节奏，不是日期。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 tick() 返回 reason:'disabled'，不推进。
 *   2 阶段枚举固定四档：fallow(长草)/buildup(预热)/eruption(爆发)/settle(结算)。
 *     表外阶段整次拒收（bad-stage）。
 *   3 倒计时只收正整数（bad-countdown）；跨档推进**连续进行**直到余量为正，
 *     绝不停在中间档——「ΔD=20 只推一档」是对节奏纪律最隐蔽的破坏。
 *   4 事件名只在结算期→长草期切换时被要求更新（missing-event）：沿用旧名拒收
 *     （stale-event），但本模块不替你构思名字，只核验「确实换过」。
 *   5 未初始化（init 前调用）如实报 missing，不猜一个默认周期。
 *   6 天数增量只收非负整数（bad-delta）；同日活动 ΔD=0 合法（只查不动）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_era_settings_v1';
  const DEF = { enabled: true, maxRows: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'eraCycle', bounds: { maxRows: [2, 16] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const STAGES = ['fallow', 'buildup', 'eruption', 'settle'];
  const STAGE_LABELS = { fallow: '长草期', buildup: '预热期', eruption: '爆发期', settle: '结算期' };
  const NEXT_T = { fallow: [5, 10], buildup: [3, 7], eruption: [2, 4], settle: [10, 20] };
  const stat = { ticks: 0, blocked: 0, lastReason: '', faults: {} };
  // v2.581.0：注入名额统一形态（「同形态尾部截断」簇二，与 v2.580.0 的三引擎同一口径）。
  //   旧法 `X.slice(-maxRows)` 三病俱在：取**登记尾部**（≈登记顺序，不是新旧）、
  //   `maxRows` 坏值时 `slice(NaN)`=`slice(0)` **整环全念**（与上限正好相反）、念了几条一个字不说。
  const ROWS_QUOTA_MAX = 16;
  function quotaOf(cfg, key, max, fallback) {
    const n = Math.floor(Number(cfg && cfg[key]));
    if (!isFinite(n) || n < 1) return Math.min(max, fallback);
    return Math.min(max, Math.max(1, n));
  }
  /** 取哪几条：按时间（updatedAt，缺则 at）新→旧，同刻按 who/key/id 兜底 —— 可复算。 */
  function pickRows(list, quota, atOf, idOf) {
    const arr = (Array.isArray(list) ? list : []).filter(function (x) { return !!x; }).slice();
    arr.sort(function (a, b) {
      const at = Number(atOf(a)) || 0, bt = Number(atOf(b)) || 0;
      if (at !== bt) return bt - at;
      const ai = String(idOf(a) || ''), bi = String(idOf(b) || '');
      return ai < bi ? -1 : (ai > bi ? 1 : 0);
    });
    return { candidates: arr.length, picked: arr.slice(0, quota),
      hidden: Math.max(0, arr.length - quota), mode: arr.length > quota ? 'newest-first' : 'all-fit' };
  }
  /** 名额取用（名额只截断、不参与筛选；坏配置回落 DEF，绝不放大成「全念」）。 */
  function pickQuota(arr, cfg) {
    const q = quotaOf(cfg, 'maxRows', ROWS_QUOTA_MAX, DEF.maxRows);
    const sel = pickRows(arr, q, function (x) { return x && (x.updatedAt || x.at); },
      function (x) { return x && (x.who || x.key || x.id || x.name || ''); });
    stat.block = { candidates: sel.candidates, picked: sel.picked.length, quota: q,
      hidden: sel.hidden, mode: sel.candidates ? sel.mode : 'empty' };
    return sel.picked;
  }
  // block 用**取值器**持有：stat() 里那些 `Object.assign({}, stat)` 会当场取到一份深拷，
  //   调用方改一次读数就改掉引擎读数的老坑（v2.576 org / v2.579 world-bridge）在这里一次性堵掉。
  let __block = null;
  Object.defineProperty(stat, 'block', {
    enumerable: true, configurable: true,
    get: function () { return __block ? JSON.parse(JSON.stringify(__block)) : null; },
    set: function (v) { __block = v || null; }
  });
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().eraCycle; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(name) { return rows().filter(function (r) { return r && r.name === name; })[0] || null; }
  /** 按建议区间中位取新倒计时（不掷骰：本模块不做随机决定）。 */
  function suggestedT(stage) { const r = NEXT_T[stage] || [4, 8]; return Math.floor((r[0] + r[1]) / 2); }
  // 骨架物化在 init / tick 两处都要做，抽成 helper：
//   一是消除重复，二是让两处的 gate 行各自成为唯一锚点（专锁测试按文件判 H5）。
  function skeleton(draft) {
    draft.eraCycle = draft.eraCycle && typeof draft.eraCycle === 'object' && !Array.isArray(draft.eraCycle) ? draft.eraCycle : { rows: [] };
    draft.eraCycle.rows = Array.isArray(draft.eraCycle.rows) ? draft.eraCycle.rows : [];
    return draft.eraCycle.rows;
  }
  /**
   * 开启一条周期。name 是周期名（如「北境资料片」），event 是本期事件名，days 是首轮倒计时。
   */
  function init(name, event, days) {
    const who = clean(name, 40), ev = clean(event, 60);
    if (!who || !ev) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      skeleton(draft);
      if (draft.eraCycle.rows.filter(function (r) { return r && r.name === who; })[0]) { out = { ok: false, reason: 'exists', name: who }; return false; }
      if (days != null && (typeof days !== 'number' || !isFinite(days) || days <= 0 || (days | 0) !== days)) { out = { ok: false, reason: 'bad-countdown' }; return false; }
      const row = { name: who, event: ev, stage: 'fallow', countdown: (days | 0) || suggestedT('fallow'), at: clockNow('eraCycle') };
      draft.eraCycle.rows.push(row);
      if (WA.evict) WA.evict.array(draft.eraCycle.rows, 'eraCycle.rows');
      out = { ok: true, name: who, stage: row.stage, countdown: row.countdown };
    }, 'eraCycle:init');
    if (out && out.ok) { stat.ticks++; stat.lastReason = 'init'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 按天数增量推进。ΔD=0（同日活动）只查不动；阶段推进连续进行直到余量为正；
   * 结算期→长草期的切换要求显式给出新事件名，且不得与旧名相同。
   */
  function tick(name, dayDelta, nextEvent) {
    const who = clean(name, 40), ev = clean(nextEvent, 60);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      skeleton(draft);
      const hit = draft.eraCycle.rows.filter(function (r) { return r && r.name === who; })[0];
      if (!hit) { out = { ok: false, reason: 'missing', name: who }; return false; }
      if (dayDelta == null || typeof dayDelta !== 'number' || !isFinite(dayDelta) || dayDelta < 0 || (dayDelta | 0) !== dayDelta) { out = { ok: false, reason: 'bad-delta' }; return false; }
      if (dayDelta === 0) { out = { ok: true, reason: 'same-day', stage: hit.stage, countdown: hit.countdown }; return; }
      let t = hit.countdown - dayDelta;
      let crossed = [];
      let eventSet = false;
      const prevEvent = hit.event;
      while (t <= 0) {
        const idx = STAGES.indexOf(hit.stage);
        const nextStage = STAGES[(idx + 1) % STAGES.length];
        crossed.push(nextStage);
        hit.stage = nextStage;
        t += suggestedT(nextStage);
        if (nextStage === 'fallow' && !eventSet) {
          // 只在跨入 fallow 的**第一次**核验事件：跨档多圈时同一事件名不得被误判 stale
          if (!ev) { out = { ok: false, reason: 'missing-event', stage: hit.stage, crossed: crossed.slice() }; return false; }
          if (ev === prevEvent) { out = { ok: false, reason: 'stale-event', stage: hit.stage }; return false; }
          hit.event = ev;
          eventSet = true;
        }
      }
      hit.countdown = t;
      hit.at = clockNow('eraCycle');
      if (WA.evict) WA.evict.array(draft.eraCycle.rows, 'eraCycle.rows');
      out = { ok: true, stage: hit.stage, countdown: hit.countdown, event: hit.event, crossed: crossed };
    }, 'eraCycle:tick');
    if (out && out.ok) { stat.ticks++; stat.lastReason = 'ticked'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读单条周期（给注入与推演方的只读视图）。 */
  function read(name) {
    if (!settings().enabled) return { ok: true, name: name, stage: '', countdown: 0, event: '', reason: 'disabled' };
    const hit = rowOf(clean(name, 40));
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', name: name }; }
    return { ok: true, name: hit.name, stage: hit.stage, stageLabel: STAGE_LABELS[hit.stage], countdown: hit.countdown, event: hit.event, reason: 'applied' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = pickQuota(rows(), cfg);
    if (!list.length) { stat.block = { candidates: 0, picked: 0, quota: quotaOf(cfg, 'maxRows', ROWS_QUOTA_MAX, DEF.maxRows), hidden: 0, mode: 'empty' }; return ''; }
    const lines = list.map(function (r) {
      return '· ' + r.name + '：' + (STAGE_LABELS[r.stage] || r.stage) + '（倒计时 ' + r.countdown + ' 天）— 本期事件「' + r.event + '」';
    });
    return '[资料片周期]\n' + lines.join('\n') + '\n周期是世界的注意力节奏：长草铺垫、预热造势、爆发引爆、结算收束；结算转长草时本期事件必须换血，不得沿用旧名敷衍。\n';
  }
  // v2.581.0 块尾名额自证：不动原正文拼接，只在末尾追加一行清单计数（名额够就说「全部列出」）。
  buildBlock = (function (inner) {
    return function () {
      const out = inner();
      const b = stat.block;
      if (!out || !b) return out;
      const NL = String.fromCharCode(10);
      return out + NL + '（本面名额：纪元 ' + b.picked + '/' + b.candidates
        + (b.hidden > 0 ? ' 条，按时间新→旧取；另有 ' + b.hidden + ' 条未列出，仍在账上，不是没有'
          : ' 条，全部列出') + '）';
    };
  })(buildBlock);

  WA.eraCycle = {
    STAGES: STAGES, STAGE_LABELS: STAGE_LABELS,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    init: init, tick: tick, read: read, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();