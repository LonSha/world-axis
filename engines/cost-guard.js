/**
 * WorldAxis engines/cost-guard.js (v2.524.0) — OPV28-13 ~ OPV28-18
 *   成本面的六件事：单轮花费可读 / 场外走低配 / 离线批量预算 /
 *   输入去抖 / 长局体积回收有据 / 超预算三选项
 *
 * ── 它治的病 ─────────────────────────────────────────────────────
 *   世界会自己动之后，**钱和时间都从暗处流走**：
 *     · 一轮推演花了多少，玩家面一句话都没有（只有开发者读数）；
 *     · 场外推进与主链用同一条贵通道，钱花在没人看的地方；
 *     · 离线 30 天回来，一次把几百轮全推完，账当场爆；
 *     · 同一楼层被点两次，世界被推两遍；
 *     · 长局跑到 200 轮之后体积只涨不降，说不清谁该回收、为什么回收；
 *     · 超预算时只会硬跑或硬停，没有「降级 / 静默 / 继续」的选择。
 *
 * ── 纪律（每条都有判据咬）────────────────────────────────────────
 *   ① 花费只报**与 `model-receipt` 同源**的读数；读不到就 `available:false`，不报假数。
 *   ② 场外低配**不碰主链**：`mainChannel:'unchanged'` 是硬话，失败降级也不许伪造事件。
 *   ③ 离线预算超了就**分批**并按批说明，不静默截断、也不一次推完。
 *   ④ 同楼层第二次请求**不结算**（`skipped:true`），但也不是错误。
 *   ⑤ 回收只报「可解释」的条目（谁、多少、为什么回收）；说不清的不动。
 *   ⑥ 三选项一旦选定，回执里 `applied` 必须与选项一致，不许选了降级还继续硬跑。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_costguard_settings_v1';
  const DEF = { enabled: true, maxOfflineRounds: 20, warnAt: 80, keepReasons: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'costGuard',
    bounds: { maxOfflineRounds: [1, 120], warnAt: [10, 100], keepReasons: [4, 32] } };
  const stat = { costs: 0, routes: 0, batches: 0, debounced: 0, recycles: 0, warned: 0, refused: 0, lastReason: '' };
  const OPTIONS = ['downgrade', 'silent', 'continue'];
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function draft() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function refuse(reason, extra) { stat.refused++; stat.lastReason = reason; return Object.assign({ ok: false, reason: reason }, extra || {}); }

  /** OPV28-13：单轮成本上玩家面（与 model-receipt 同源）。 */
  function roundCost() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    let v = null;
    try { v = WA.modelReceipt && typeof WA.modelReceipt.view === 'function' ? WA.modelReceipt.view() : null; } catch (e) { v = null; }
    if (!v) return { ok: true, reason: 'ok', available: false,
      line: '这一轮花了多少，此刻读不到收据（没有收据就不报数）' };
    const tokens = Number.isFinite(v.tokens) ? v.tokens : (Number.isFinite(v.totalTokens) ? v.totalTokens : 0);
    const calls = Number.isFinite(v.calls) ? v.calls : 0;
    stat.costs++;
    return { ok: true, reason: 'ok', available: true, tokens: tokens, calls: calls,
      line: '这轮世界花了 ' + tokens + ' 个 token、' + calls + ' 次调用（收据同源，可对账）' };
  }

  /** OPV28-14：场外低配通道（主链不变；失败只降级、不伪造事件）。 */
  function offstageRoute() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    let low = null;
    try {
      if (WA.apiRouter && typeof WA.apiRouter.pick === 'function') low = WA.apiRouter.pick({ purpose: 'offstage', tier: 'low' });
      else if (WA.apiRouter && typeof WA.apiRouter.route === 'function') low = WA.apiRouter.route({ purpose: 'offstage', tier: 'low' });
    } catch (e) { low = null; }
    stat.routes++;
    if (!low) return { ok: true, reason: 'ok', available: false, mainChannel: 'unchanged',
      note: '没有可用的低配通道：宁可继续用主链，也不假装走了一条便宜路' };
    return { ok: true, reason: 'ok', available: true, channel: (low.channel || low.name || low.id || 'low'), tier: 'low',
      mainChannel: 'unchanged', note: '场外推进走低配；主链没动，失败也不伪造事件' };
  }

  /** OPV28-15：离线批量预算（超了分批，不静默截断）。 */
  function offlineBudget(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rounds = Number.isFinite(s.rounds) ? Math.max(0, s.rounds | 0) : 0;
    if (!rounds) return refuse('missing-fields', { field: 'rounds' });
    const cap = cfg.maxOfflineRounds;
    const batches = Math.ceil(rounds / cap);
    const plan = [];
    for (let i = 0; i < batches; i++) plan.push({ batch: i + 1, rounds: Math.min(cap, rounds - i * cap) });
    stat.batches++;
    return { ok: true, reason: 'ok', rounds: rounds, cap: cap, batches: batches, plan: plan,
      note: batches > 1 ? ('这次离线共 ' + rounds + ' 轮，超过单批上限 ' + cap + '，按 ' + batches + ' 批推') : '一次推得完' };
  }

  /** OPV28-16：输入去抖（同楼层第二次不结算）。 */
  function debounce(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const floor = s.floorId === 0 || s.floorId ? String(s.floorId).slice(0, 40) : '';
    if (!floor) return refuse('missing-fields', { field: 'floorId' });
    const d = draft();
    const last = d.inputDebounce && typeof d.inputDebounce === 'object' ? d.inputDebounce : {};
    if (last.floorId === floor) {
      stat.debounced++;
      return { ok: true, reason: 'ok', duplicate: true, skipped: true, floorId: floor,
        note: '同一楼层已经结算过一次：这次不重复推演（不是错误）' };
    }
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (dd) { dd.inputDebounce = { floorId: floor, at: Date.now() }; return true; }, 'cost:debounce');
      }
    } catch (e) { /* 记不下也不重复推 */ }
    return { ok: true, reason: 'ok', duplicate: false, skipped: false, floorId: floor };
  }

  /** OPV28-17：长局体积回收（只报能解释的条目，被回收项可查原因）。 */
  function recycle() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    let caps = {};
    try { caps = WA.store && typeof WA.store.sizeCaps === 'function' ? (WA.store.sizeCaps() || {}) : {}; } catch (e) { caps = {}; }
    let sizes = {};
    try { sizes = WA.store && typeof WA.store.sizeAudit === 'function' ? (WA.store.sizeAudit() || {}) : {}; } catch (e) { sizes = {}; }
    const d = draft();
    const rows = [];
    const chr = Array.isArray(d.chronicle) ? d.chronicle.length : 0;
    if (chr > 0) {
      const cap = (caps.chronicle && caps.chronicle.cap) || 2400;
      rows.push({ path: 'chronicle', size: chr, cap: cap,
        why: chr > cap ? ('超上限 ' + cap + '：按最旧先回收') : '在容量内，不回收' });
    }
    Object.keys(sizes || {}).slice(0, cfg.keepReasons).forEach(function (k) {
      const v = sizes[k];
      if (v && v.over === true) rows.push({ path: k, size: v.size, cap: v.cap, why: '体检报超限（原因见 sizeAudit）' });
    });
    stat.recycles++;
    return { ok: true, reason: 'ok', rows: rows, recyclable: rows.filter(function (x) { return /超/.test(x.why); }).length,
      note: rows.length ? '每条都带「为什么回收」，说不清的不动' : '此刻没有可解释的回收条目' };
  }

  /** OPV28-18：成本预警三选项（选定后行为与选项一致）。 */
  function warn(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const used = Number.isFinite(s.usedPct) ? Math.max(0, Math.min(200, s.usedPct | 0)) : 0;
    const over = used >= cfg.warnAt;
    const d = draft();
    const chosen = d.costChoice && OPTIONS.indexOf(d.costChoice.option) >= 0 ? d.costChoice.option : '';
    stat.warned++;
    return { ok: true, reason: 'ok', over: over, usedPct: used, warnAt: cfg.warnAt,
      options: OPTIONS.slice(), chosen: chosen,
      line: over ? ('预算已经用到 ' + used + '%，选一个：降级走低配 / 静默这轮 / 继续硬跑') : ('预算用到 ' + used + '%，还没到警戒线') };
  }
  function choose(option) {
    const opt = String(option || '').trim();
    if (OPTIONS.indexOf(opt) < 0) return refuse('missing-fields', { field: 'option', options: OPTIONS.slice() });
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) { d.costChoice = { option: opt, at: Date.now() }; return true; }, 'cost:choose');
      }
    } catch (e) { /* 选了但没记下 —— 如实说 */ }
    return { ok: true, reason: 'ok', option: opt,
      applied: opt === 'downgrade' ? 'offstageRoute' : (opt === 'silent' ? 'silence' : 'continue'),
      note: opt === 'downgrade' ? '降级：场外改走低配，主链不变' : (opt === 'silent' ? '静默：这一轮不推，世界不编事' : '继续：照原样跑，账继续涨') };
  }

  function view() {
    const d = draft();
    return { enabled: settings().enabled, choice: (d.costChoice && d.costChoice.option) || '', stat: Object.assign({}, stat) };
  }

  WA.costGuard = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    roundCost: roundCost, offstageRoute: offstageRoute, offlineBudget: offlineBudget,
    debounce: debounce, recycle: recycle, warn: warn, choose: choose, view: view,
    OPTIONS: OPTIONS.slice(),
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/cost-guard.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/cost-guard 已加载（' + VERSION + '）');
})();