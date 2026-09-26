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
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_hazard_settings_v1';
  const DEF = { enabled: false, maxRows: 16, baseTarget: 10, floorTarget: 4, revealDelay: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'hazard',
    bounds: { maxRows: [4, 32], baseTarget: [6, 12], floorTarget: [2, 6], revealDelay: [1, 8] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { bumps: 0, rolls: 0, hits: 0, reveals: 0, blocked: 0, lastReason: '', faults: {} };
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
      draft.hazard.rows.push({ key: k, note: memo, count: 0, hits: 0, pending: false, waiting: 0, at: clockNow('hazard') });
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
  /** 读：单项风险账。未登记报 missing。 */
  function read(key) {
    const k = clean(key, 60);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = find(k);
    if (!row) { noteFault('missing'); return { ok: false, reason: 'missing', key: k }; }
    return { ok: true, key: k, note: row.note || '', count: Number(row.count) || 0, target: targetFor(row.count),
      hits: Number(row.hits) || 0, pending: !!row.pending, waiting: Number(row.waiting) || 0 };
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
    targetFor: targetFor,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
