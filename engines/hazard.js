/**
 * WorldAxis engines/hazard.js (v2.72.0)
 * 累积风险账：重复事件的概率滑落与延迟显形。
 *
 * 缝合来源：预设《果实之心》「怀孕风险｜选开·联动seeds」全条：
 *   「累计计数 n：从 seeds 的长期伏笔里读出「已累计第几次无避孕」→ 目标值 = 10 − n，
 *    最低到 4（n=1 目标 9 / n=2 目标 8 / … / n≥6 目标 4 封顶）；掷骰 roll = 1d10，
 *    roll ≥ 目标值即为受孕；结果不当场宣布，也不写进正文；之后由身体自己显形——
 *    至少隔几轮再出现第一个信号；一次受孕确认之后本判定停止，计数清零」。
 *
 * 预设里那是给模型的一段长句；能落成引擎判据的是**三个可证伪的分离**：
 *   ① 「重复」与「风险」分离——计数只增，目标值单调不增（次数越多越危险），封底不归零；
 *   ② 「判定」与「宣告」分离——roll 命中后只写 pending（暗账），必须显式 confirm 才转 hit；
 *   ③ 「显形」与「时间」分离——命中后必须隔 revealDelay 轮才允许 confirm，
 *      防「下一轮就揭晓」（预设明确禁止）。
 *
 * 与 quota.js 的分工：quota 是「叙事者手动播的种子」的并发配额与存龄；
 * 本模块是「重复行为累积出的概率」——无文本、无池、只有计数与目标值。
 * 与 causal.js / longline.js 的分工：它们排「承诺时刻」；本模块排的是「显形延迟」。
 * 与 rand.js 的关系：掷骰走 `WA.rand.dice(sides, 'hazard')`，**不自己造随机**，
 * 因而随冻结种子可复现（同种子同序列）。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时写路径报 reason:'disabled'，不掷骰也不计数。
 *   2 对象名缺或空整次拒收（missing-fields）。
 *   3 未登记过的对象 bump/roll 报 missing，不建空行（「没发生过的事不该有风险账」）。
 *   4 命中后重复 roll 拒收（already-pending）；未命中时不计 pending。
 *   5 confirm 未到期拒收（too-soon）——预设明言「至少隔几轮」；无 pending 拒收（not-pending）。
 *
 *   6（v2.96.0 · X6）**判定面只读天气**：roll(key, {at: 地点}) 会读 weather.effect(该地)，
 *     恶劣天气把目标值往下压（越好命中）——但 hazard 侧**绝不调天气的写入口**，
 *     也不把天气写回 row。观测不得改变被观测对象，这条在判据里是源码级的（见专锁 N 面）。
 *   7（v2.96.0 · X6）**天气面不可用不回落成「无影响」**：weather 缺席报 engine-absent、
 *     未登记报 missing、联动关闭报 link-off —— 三种都照实带进回执的 weather.reason，
 *     且本次不加任何修正（factor 1）。「没报天气」不等于「天气没影响」，两者必须能分辨。
 *   8（v2.96.0 · X6）**目标值有硬下界 1**：天气再差也不许把目标压到 ≤0
 *     （face ≥ 0 恒真 ⇒ 风险变成必然发生，那已不是「概率滑落」而是「判决」）。
 *
 *   9（v2.138.0 · E7，**反向**）**天气造灾害**：X6 只做「hazard 读天气」（判定面下调目标值），
 *     反向这条此前不存在 —— 天气再恶劣也不会自己长出一行风险账，全靠人手工 open()。
 *     本版补 `weatherTrigger(place, opts)`：天气达阈值 ⇒ 自动**建一行**灾害账，
 *     并把成因写在行上（`causedBy ∈ manual|weather|cascade`，天气造的那一行是 `weather`）。
 *     · **自动触发不替代手工创建**：`open()` 逐字未动，两条入口并存且各留各的成因。
 *     · **天气封锁不改 severity**：`world.canBeAt` 的天气层（BLOCK_LEVEL）读的是 weather.effect，
 *       与 hazard 的行**互不写回**；本模块只建账，不调 weather 的写入口、不改 BLOCK_LEVEL。
 *     · 总开关 `weatherLink` **默认关闭**：不打开时 weatherTrigger 拒收 link-off，
 *       且一次账都不建（「没打开」与「天气没恶劣到」是两件事，回执里分得开）。
 *     · 同地同天气**不重复建行**（already-open）：重复触发只记触发计数，不再堆行 ——
 *       否则一次连阴雨会长出几十行同样的账。
 *   10（v2.138.0 · E7）阈值是 `triggerFactor`（默认 2 = 只有 storm/snow 这一档触发），
 *     且**只认天气名白名单里的严重档**（storm/snow）；「系数够大」不足以触发 ——
 *     词表外的未来天气不该因为凑巧系数高就被判成灾害。两条判据并存时以**词表**为准。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_hazard_settings_v1';
  const DEF = { enabled: false, maxRows: 16, baseTarget: 10, floorTarget: 4, revealDelay: 3,
    // v2.138.0（E7）：天气→灾害反向联动。默认关闭；阈值 2 = only storm/snow 这一档。
    weatherLink: false, triggerFactor: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'hazard',
    bounds: { maxRows: [4, 32], baseTarget: [6, 12], floorTarget: [2, 6], revealDelay: [1, 8],
      triggerFactor: [1.25, 2] } };
  // v2.138.0（E7）：能触发灾害的天气白名单。**以词表为准**，不靠「系数凑巧够大」——
  //   词表外的未来天气不该因为 FACTOR 值高就被判成灾害（那是猜）。
  const TRIGGER_KINDS = ['storm', 'snow'];
  // 成因三态。manual = 人手工 open；weather = 本版天气自动造；cascade = 由别的灾害派生。
  const CAUSED_BY = ['manual', 'weather', 'cascade'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { bumps: 0, rolls: 0, hits: 0, reveals: 0, triggers: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().hazard; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function find(key) { return rows().filter(function (r) { return r && r.key === key; })[0]; }
    // v2.96.0（X6）：恶劣天气把目标值往下压多少。
  //   为什么不是设置项：天气的严重程度已经是 weather.FACTOR 的单一真源（1/1.25/1.5/2）；
  //   再叠一个用户旋钮就等于同一件事有第二套数，而「两套数并存」正是本仓库最贵的一类缺陷。
  //   映射：每 +0.5 系数 → 目标 −1（fog/rain/heat −1，snow/storm −2）。
  const WEATHER_GAIN = 2;
  /** 目标值 = baseTarget − count，封底 floorTarget（次数越多越容易命中，但封底不归零）。 */
  function targetFor(count) {
    const cfg = settings();
    const n = Math.max(0, Math.floor(Number(count) || 0));
    return Math.max(cfg.floorTarget, cfg.baseTarget - n);
  }
  /** 系数 → 目标值下调量。系数 ≤1 或非数即 0（不猜一个加成）。 */
  function weatherGain(factor) {
    const f = Number(factor);
    if (!isFinite(f) || f <= 1) return 0;
    return Math.max(0, Math.round((f - 1) * WEATHER_GAIN));
  }
  /**
   * v2.96.0（X6）：判定面读该地天气。**纯读**——不调天气的写入口、不落盘、不动 stat。
   * 四态如实：engine-absent（weather 模块缺席）/ missing（该地未登记天气）/
   *   link-off（未给地点）/ ok（带 kind 与 factor）。**三态都不回落成「无影响」**。
   */
  function weatherAt(place) {
    const pl = clean(place, 40);
    if (!pl) return { ok: false, reason: 'link-off', place: '', factor: 1 };
    const wx = WA.weather;
    if (!wx || typeof wx.effect !== 'function') return { ok: false, reason: 'engine-absent', place: pl, factor: 1 };
    const e = wx.effect(pl);
    if (!e || !e.ok) return { ok: false, reason: (e && e.reason) || 'missing', place: pl, factor: 1 };
    // 天气模块关着时 effect 会交回 { ok:true, factor:1, reason:'disabled' } ——
    //   若照抄成 valid:true，回执就自我矛盾（说「有效」却同时说「没参与」），
    //   而「关闭」与「晴天」正是本版最不该长得一样的那一对。故显式归成不可用态。
    if (e.reason === 'disabled') return { ok: false, reason: 'disabled', place: pl, factor: 1 };
    return { ok: true, place: pl, kind: e.kind || '', factor: Number(e.factor) || 1, reason: e.reason || 'ok' };
  }
  /** 天气修正后的目标值（判定面专用）。**硬下界 1**：天气不许把风险变成必然。 */
  function targetWith(count, eff) {
    const base = targetFor(count);
    const g = (eff && eff.ok) ? weatherGain(eff.factor) : 0;
    return Math.max(1, base - g);
  }
  /** 登记一个风险项（尚零次）。 */
  function open(key, note) {
    const k = clean(key, 60);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const memo = clean(note, 60);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.hazard = draft.hazard && typeof draft.hazard === 'object' && !Array.isArray(draft.hazard) ? draft.hazard : { rows: [] };
      draft.hazard.rows = Array.isArray(draft.hazard.rows) ? draft.hazard.rows : [];
      if (draft.hazard.rows.filter(function (r) { return r && r.key === k; })[0]) { out = { ok: false, reason: 'exists', key: k }; return false; }
      if (draft.hazard.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', key: k }; return false; }
      draft.hazard.rows.push({ key: k, note: memo, count: 0, hits: 0, pending: false, waiting: 0, at: clockNow('hazard'), causedBy: 'manual' });
      if (WA.evict) WA.evict.array(draft.hazard.rows, 'hazard.rows');
      out = { ok: true, key: k, count: 0, target: targetFor(0) };
    }, 'hazard:open');
    if (out && out.ok) stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'opened';
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 累加一次（一次「无防护的风险事件」）：count+1，目标值随之滑落。 */
  function bump(key) {
    // v2.84.0：走统一输入边界（NaN/对象不再被升格成 'NaN'/'[object Object]'）
    const k = WA.inputGuard.text(key, 60);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.hazard = draft.hazard && typeof draft.hazard === 'object' && !Array.isArray(draft.hazard) ? draft.hazard : { rows: [] };
      draft.hazard.rows = Array.isArray(draft.hazard.rows) ? draft.hazard.rows : [];
      const row = draft.hazard.rows.filter(function (r) { return r && r.key === k; })[0];
      if (!row) { out = { ok: false, reason: 'missing', key: k }; return false; }
      row.count = WA.inputGuard.count(row.count) + 1;
      row.at = clockNow('hazard');
      out = { ok: true, key: k, count: row.count, target: targetFor(row.count) };
    }, 'hazard:bump');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.bumps++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'bumped'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 掷骰判定：roll = 1..baseTarget；roll >= target 即命中。
   * **命中不当场宣布**——只写 row.pending = true（暗账），正文不得出现数字/术语。
   */
  function roll(key, opts) {
    const k = clean(key, 60);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    // v2.96.0（X6）：天气在**写事务之外**预读（weather.effect 是纯读，但它走 store.get，
    //   放进事务里就是读自己正在写的快照）。
    //   两分是**有意的**且各自可测：
    //     · 调用方**显式给了 at**（哪怕是空串）⇒ 一定带出天气面读数。空地点是 link-off
    //       ——「没给地点」与「天气很好」必须能分辨，否则本版要防的那件事就没防住；
    //     · 完全不给 opts.at（旧调用单参形态）⇒ 走旧路径，回执里**不出现** weather 字段。
    const hasAt = !!(opts && opts.at !== undefined);
    const at = clean(opts && opts.at, 40);
    const eff = hasAt ? weatherAt(at) : null;
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.hazard = draft.hazard && typeof draft.hazard === 'object' && !Array.isArray(draft.hazard) ? draft.hazard : { rows: [] };
      draft.hazard.rows = Array.isArray(draft.hazard.rows) ? draft.hazard.rows : [];
      const row = draft.hazard.rows.filter(function (r) { return r && r.key === k; })[0];
      if (!row) { out = { ok: false, reason: 'missing', key: k }; return false; }
      if (row.pending) { out = { ok: false, reason: 'already-pending', key: k }; return false; }
      // 掷骰必须走决策流：不可用时**显式拒收**，绝不用裸调 Math.random 兜底
      //（裸调绕过冻结种子 ⇒ 同一剧本复现不出同一结果，v2.14.0 起的全库纪律）。
      if (!WA.rand || typeof WA.rand.dice !== 'function') { out = { ok: false, reason: 'rand-unavailable', key: k }; return false; }
      const sides = Math.max(2, settings().baseTarget);
      const face = WA.rand.dice(sides, 'hazard');
      // v2.96.0（X6）：判定面接天气——恶劣天气把目标往下压（更好命中），但**目标值恒 ≥1**。
      const tg = targetWith(row.count, eff);
      const hit = face >= tg;
      if (hit) { row.pending = true; row.waiting = 0; }
      row.at = clockNow('hazard');
      row.lastFace = face;
      out = { ok: true, key: k, face: face, target: tg, targetBase: targetFor(row.count),
        weatherGain: (eff && eff.ok) ? weatherGain(eff.factor) : 0,
        hit: hit, pending: hit, count: row.count };
    }, 'hazard:roll');
    // 天气面**照实带出**（含不可用时的 reason）：不加修正 ≠ 天气没影响，两者必须能分辨。
    if (out && eff) out.weather = { place: eff.place, kind: eff.kind || '', factor: eff.factor,
      valid: !!eff.ok, reason: eff.reason };
    if (out && out.ok) {
      if (out.reason !== 'disabled') { stat.rolls++; if (out.hit) stat.hits++; }
      stat.lastReason = out.reason === 'disabled' ? 'disabled' : (out.hit ? 'hit' : 'miss');
    } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 轮次推进：pending 项的等待数 +1（用于 enforce 显形延迟）。 */
  function tick() {
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.hazard = draft.hazard && typeof draft.hazard === 'object' && !Array.isArray(draft.hazard) ? draft.hazard : { rows: [] };
      draft.hazard.rows = Array.isArray(draft.hazard.rows) ? draft.hazard.rows : [];
      let advanced = 0;
      draft.hazard.rows.forEach(function (r) { if (r && r.pending) { r.waiting = Math.max(0, Math.floor(Number(r.waiting) || 0)) + 1; advanced++; } });
      out = { ok: true, advanced: advanced };
    }, 'hazard:tick');
    if (out && out.ok) stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'ticked';
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 显形：命中隔 revealDelay 轮后才允许（预设明言「至少隔几轮再出现第一个信号」）。 */
  function confirm(key) {
    const k = clean(key, 60);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.hazard = draft.hazard && typeof draft.hazard === 'object' && !Array.isArray(draft.hazard) ? draft.hazard : { rows: [] };
      draft.hazard.rows = Array.isArray(draft.hazard.rows) ? draft.hazard.rows : [];
      const row = draft.hazard.rows.filter(function (r) { return r && r.key === k; })[0];
      if (!row) { out = { ok: false, reason: 'missing', key: k }; return false; }
      if (!row.pending) { out = { ok: false, reason: 'not-pending', key: k }; return false; }
      const need = Math.max(1, settings().revealDelay);
      if ((Number(row.waiting) || 0) < need) { out = { ok: false, reason: 'too-soon', key: k, waiting: Number(row.waiting) || 0, need: need }; return false; }
      row.pending = false; row.waiting = 0; row.hits = Math.floor(Number(row.hits) || 0) + 1; row.count = 0;
      row.lastHitAt = clockNow('hazard');
      out = { ok: true, key: k, hits: row.hits, count: row.count };
    }, 'hazard:confirm');
    if (out && out.ok) { if (out.reason !== 'disabled') { stat.reveals++; stat.hits++; } stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'revealed'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * v2.138.0（E7）：**天气造灾害**（X6 的反向）。
   *
   *   X6 已做的是「判定面读天气」——恶劣天气把 roll 的目标值往下压。反向那条一直缺着：
   *   天气再恶劣也不会自己长出一行风险账，全靠人记得手工 open()。缺了它，「台风过境」
   *   在世界里就只是一串描写，而没有任何账。
   *
   *   三条边界（全是否定式，逐条可判）：
   *     · **只建账，不动天气**：本函数不调天气模块的写入口、不改 world 的 BLOCK_LEVEL、
   *       不把 hazard 的 severity/行数写进任何天气面。「封锁」与「建账」是两件事：
   *       前者是通行判定（canBeAt 读 weather.effect），后者是风险台账（本行）。
   *     · **不替代手工创建**：open() 逐字未动；两条入口并存，各有各的 causedBy。
   *     · **同地同天气不堆行**：命中已有行就报 already-open，只累加 triggerHits。
   *
   *   触发判据两条并存、以**词表**为准：天气名必须在 TRIGGER_KINDS 里，且 factor ≥ triggerFactor。
   *   词表外的高系数天气**不触发**（不猜「系数高就等于灾害」）。
   */
  function weatherTrigger(place, opts) {
    const cfg = settings();
    const pl = clean(place, 40);
    if (!pl) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', place: pl }; }
    // 「没打开联动」与「天气没恶劣到」必须分得开：前者是 link-off（开关事），后者是 below-threshold（天气事）。
    if (cfg.weatherLink !== true) { noteFault('link-off'); return { ok: false, reason: 'link-off', place: pl }; }
    const eff = weatherAt(pl);
    if (!eff.ok) return { ok: false, reason: eff.reason, place: pl };
    const kind = eff.kind || '';
    const factor = Number(eff.factor) || 1;
    // 词表为准：不在白名单里的天气**一律不触发**（哪怕系数够大）。
    if (TRIGGER_KINDS.indexOf(kind) < 0) {
      return { ok: false, reason: 'below-threshold', place: pl, kind: kind, factor: factor,
        need: TRIGGER_KINDS.slice(), why: 'kind-not-in-whitelist' };
    }
    const thr = Number(cfg.triggerFactor);
    if (!isFinite(thr) || factor < thr) {
      return { ok: false, reason: 'below-threshold', place: pl, kind: kind, factor: factor,
        threshold: isFinite(thr) ? thr : null, why: 'factor-below-threshold' };
    }
    const k = clean((opts && opts.key) || ('weather:' + pl), 60);
    const memo = clean((opts && opts.note) || (kind + '@' + pl), 60);
    let out = null;
    WA.store.transact(function (draft) {
      draft.hazard = draft.hazard && typeof draft.hazard === 'object' && !Array.isArray(draft.hazard) ? draft.hazard : { rows: [] };
      draft.hazard.rows = Array.isArray(draft.hazard.rows) ? draft.hazard.rows : [];
      const row = draft.hazard.rows.filter(function (r) { return r && r.key === k; })[0];
      if (row) {
        // 不堆行：只记「这次也触发了」，并刷新成因与观测时刻（成因不许被后来的手工行冒名顶替）。
        row.triggerHits = Math.floor(Number(row.triggerHits) || 0) + 1;
        row.causedBy = 'weather';
        row.weatherKind = kind;
        row.at = clockNow('hazard');
        out = { ok: true, key: k, existed: true, reason: 'already-open', kind: kind, factor: factor,
          triggerHits: row.triggerHits, count: Number(row.count) || 0 };
        return;
      }
      if (draft.hazard.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', key: k }; return false; }
      draft.hazard.rows.push({ key: k, note: memo, count: 0, hits: 0, pending: false, waiting: 0,
        at: clockNow('hazard'), causedBy: 'weather', weatherKind: kind, triggerHits: 1 });
      if (WA.evict) WA.evict.array(draft.hazard.rows, 'hazard.rows');
      out = { ok: true, key: k, created: true, reason: 'triggered', kind: kind, factor: factor,
        triggerHits: 1, count: 0, target: targetFor(0) };
    }, 'hazard:weather-trigger');
    if (out && out.ok) { if (out.created) stat.triggers++; stat.lastReason = out.reason; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读：单项风险账。未登记报 missing。 */
  function read(key) {
    const k = clean(key, 60);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = find(k);
    if (!row) { noteFault('missing'); return { ok: false, reason: 'missing', key: k }; }
    // v2.138.0（E7）：成因面**回读**。此前 read() 只答「几个数」，不答「这一行是谁造的」——
    //   于是天气自动造的行与手工 open 的行在读数上长得一模一样，而本版恰恰要让两者分辨得开。
    //   成因走白名单归一：认不出的值**不编**，照实报 'manual' 之外的 raw（其值原样带出）。
    const rawBy = row.causedBy;
    const by = (typeof rawBy === 'string' && CAUSED_BY.indexOf(rawBy) >= 0) ? rawBy : '';
    return { ok: true, key: k, note: row.note || '', count: Number(row.count) || 0, target: targetFor(row.count),
      hits: Number(row.hits) || 0, pending: !!row.pending, waiting: Number(row.waiting) || 0,
      // 缺成因字段的旧存档行照实报 'unrecorded'——**不回落成 'manual'**（那等于替旧行认领成因）。
      causedBy: by || 'unrecorded',
      weatherKind: typeof row.weatherKind === 'string' ? row.weatherKind : '',
      triggerHits: Number(row.triggerHits) || 0 };
  }
  function drop(key) {
    const k = WA.inputGuard.text(key, 60);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.hazard = draft.hazard && typeof draft.hazard === 'object' && !Array.isArray(draft.hazard) ? draft.hazard : { rows: [] };
      draft.hazard.rows = Array.isArray(draft.hazard.rows) ? draft.hazard.rows : [];
      const idx = draft.hazard.rows.map(function (r) { return r && r.key; }).indexOf(k);
      if (idx < 0) { out = { ok: false, reason: 'missing', key: k }; return false; }
      draft.hazard.rows.splice(idx, 1);
      out = { ok: true, key: k };
    }, 'hazard:drop');
    if (out && !out.ok && out.reason !== 'disabled') noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 注入块：**只出「有暗账在身」的计数纪律，不出概率数字**（预设明言结果不进正文）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().filter(function (r) { return r && ((Number(r.count) || 0) > 0 || r.pending || (Number(r.hits) || 0) > 0); });
    if (!list.length) return '';
    const lines = list.slice(-Math.max(1, cfg.maxRows)).map(function (r) {
      const tail = r.pending ? '（已暗记命中，等待身体自行显形）' : ('（累计 ' + (Number(r.count) || 0) + ' 次）');
      return '· ' + r.key + tail;
    });
    return '[风险暗账] 重复行为的概率滑落（**禁止在正文写出任何数字、概率或术语**）：\n' + lines.join('\n')
      + '\n风险铁律：结果不当场宣布；命中后必须隔几轮才允许身体自行显形（迟来的日期、犯困、反胃、忽然吃不下某样东西）；角色怎么反应由各自处境与性格决定，不预设喜忧、不替谁做决定。\n';
  }
  WA.hazard = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    open: open, bump: bump, roll: roll, tick: tick, confirm: confirm, read: read, drop: drop, buildBlock: buildBlock,
    // v2.138.0（E7）：天气造灾害的反向入口与两张词表。
    //   导出 CAUSED_BY / TRIGGER_KINDS 的理由不是「方便」，而是**它们已是判据的单一真源**：
    //   面板要标成因、见证要驱动触发，若各自抄一份字面量，枚举改了就是静默漂移
    //   （本仓库最贵的一类缺陷）。
    weatherTrigger: weatherTrigger,
    CAUSED_BY: CAUSED_BY.slice(), TRIGGER_KINDS: TRIGGER_KINDS.slice(),
    // v2.138.0（E7）：逐落地结算入口（主链消费者，非「等人手调」）与地点清单读口同批导出。
    rollAll: rollAll,
    targetFor: targetFor,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  /**
   * v2.138.0（E7）：**逐落地结算** —— 一次把「哪些地方此刻真有恶劣天气」过一遍。
   *
   *   为什么必须有它（而不是留个 API 等人调）：把天气造灾害写成「等人手动调一次」，
   *   等于这个能力在世界里从来不会发生 —— 正是 v2.129.0 那十项「能力已落盘、零消费者」
   *   的同型病。所以它挂在主链上（见文件尾的 workflow 节点），结算时机由 `calendar.advance`
   *   调用（与 `hazard.tick` 的「一轮过去了」同一时机）。
   *
   *   三条边界：
   *     · **联动没打开就一次地点都不问**（连 `weather.places()` 都不调）—— 关闭即零开销；
   *     · 逐地调 `weatherTrigger`，**每地的拒收理由照实记进 results**（不吞、不合并成一个「失败」）；
   *     · **只读天气**：地点清单向天气问（`WA.weather.places()`），本模块不自己翻天气的存档。
   */
  function rollAll() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', asked: 0, results: [] };
    if (cfg.weatherLink !== true) return { ok: false, reason: 'link-off', asked: 0, results: [] };
    const wx = WA.weather;
    if (!wx || typeof wx.places !== 'function') return { ok: false, reason: 'engine-absent', asked: 0, results: [] };
    const list = wx.places();
    const results = list.map(function (pl) { return weatherTrigger(pl); });
    const created = results.filter(function (r) { return r && r.created; }).length;
    stat.lastReason = 'roll-all';
    return { ok: true, asked: list.length, created: created, results: results };
  }
  WA.hazard.rollAll = rollAll;
  /**
   * 主链挂点：`calendar.advance` 的时点（after / order 13 —— 紧随 `calendar.autoAdvance` 的 12）。
   *   ⚠ 排位的**唯一**依据是 12（世界钟先走）。本文件早先的注释把 `hazard.tick` 说成「14」，
   *   而实测它**并未挂节点**（`tests/dead-export-ledger.json` 登记为 test-only、产品代码零引用）——
   *   于是这里只按 `autoAdvance` 定位：13 是「推进之后的第一格」，既不预留空洞、也不替未挂点的
   *   函数占位。将来 tick 若真挂点，次序要重排（那是一次需重跑的变更，不由本注释预先认领）。
   *   选择理由：天气造灾害是「世界往前'走了一步'之后的账」，
   *   故必须排在**推进之后**；而它不产注入块、不参与裁决，`critical: false`——
   *   附属面失败绝不拖住、更不回滚世界推演主链（与 `region.offline` 同规格）。
   */
  if (WA.workflow && typeof WA.workflow.register === 'function') {
    WA.workflow.register({
      id: 'hazard.weatherTrigger', chain: 'after', order: 13, critical: false,
      label: '天气造灾害·逐落地结算（区域天气与灾害深度联动）',
      async run() {
        try { if (WA.hazard && typeof WA.hazard.rollAll === 'function') WA.hazard.rollAll(); }
        catch (e) { /* 附属面失败不拖主链 */ }
      }
    });
  }
})();