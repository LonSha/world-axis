/**
 * WorldAxis engines/continuity-guard.js (v2.524.0) — OPV28-19 ~ OPV28-24
 *   连续性六闸：位置 / 知识 / 物品 / 关系数值 / 时间 / 终态不复活
 *
 * ── 它治的病 ─────────────────────────────────────────────────────
 *   世界会自己动之后，最容易坏的不是「不好看」，而是**不连续**：
 *     · 人瞬移（上一轮在码头，这一轮在城里，中间没有路程）；
 *     · 不在场的人张口就说出他没听过的事；
 *     · 一样东西凭空出现，或借出去的东西凭空回到手里；
 *     · 亲密度一夜之间 +30，没有任何事件支撑；
 *     · 正文时间与世界钟互相甩开，读者算不清过了几天；
 *     · 已经死了/已经拆了/已经结了的条目，被顺手写成「又出现了」。
 *
 * ── 纪律（每条都有判据咬）────────────────────────────────────────
 *   ① 每个闸都是**写入口的前置判据**：回执说 `ok:false` 就是不许写，不许「先写后修」。
 *   ② 位置：跨地点必须有路 + 花掉轮次；没路就 `no-path`（不是「下次注意」）。
 *   ③ 知识：不在场/没听过就说，一律 `leak` 并点名是哪条事实。
 *   ④ 物品：收支持平才放行，凭空增减 `shortfall` 并给出差多少。
 *   ⑤ 关系：单次跳变有上限，超了要事件支撑，否则 `weak-evidence`。
 *   ⑥ 时间：偏差只**报读数**不自动改写正文（`deviated:true` + 两侧读数）。
 *   ⑦ 终态：复活必须显式 `reopen:true` 且给理由，否则 `closed`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_continuityguard_settings_v1';
  const DEF = { enabled: true, maxRelationJump: 12, timeDeviationMin: 120, maxTravelPerRound: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'continuityGuard',
    bounds: { maxRelationJump: [2, 50], timeDeviationMin: [10, 720], maxTravelPerRound: [1, 6] } };
  const stat = { checked: 0, blocked: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function draft() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function refuse(reason, extra) { stat.blocked++; stat.refused++; stat.lastReason = reason; return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 60) : ''; }
  function person(who) {
    const d = draft();
    const list = Array.isArray(d.people) ? d.people : [];
    return list.filter(function (p) { return p && (clean(p.name, 40) === who || clean(p.id, 40) === who); })[0] || null;
  }

  /** OPV28-19 位置连续：跨地点要有路、要花时间。 */
  function position(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who, 40), from = clean(s.from, 40), to = clean(s.to, 40);
    if (!who || !to) return refuse('missing-fields', { need: ['who', 'to'] });
    if (!person(who)) return refuse('unknown-actor', { who: who });
    if (from && from === to) return { ok: true, reason: 'ok', moved: false, note: '本来就在这儿' };
    const hasRoad = s.road === true || (Number.isFinite(s.roundsUsed) && s.roundsUsed > 0);
    if (!hasRoad) return refuse('no-path', { who: who, from: from, to: to,
      why: '没有路、也没有花时间 —— 人不能瞬移' });
    const used = Number.isFinite(s.roundsUsed) ? s.roundsUsed : 0;
    if (used > cfg.maxTravelPerRound) return refuse('over-cap', { roundsUsed: used, cap: cfg.maxTravelPerRound });
    stat.checked++;
    return { ok: true, reason: 'ok', moved: true, who: who, from: from, to: to, roundsUsed: used };
  }

  /** OPV28-20 知识边界一致：不在场不能知道。 */
  function knowledge(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who, 40), fact = clean(s.fact, 60);
    if (!who || !fact) return refuse('missing-fields', { need: ['who', 'fact'] });
    const p = person(who);
    if (!p) return refuse('unknown-actor', { who: who });
    const knows = Array.isArray(p.knows) ? p.knows : [];
    const present = s.present === true;
    const heard = s.heard === true;
    if (knows.indexOf(fact) >= 0 || present || heard) {
      stat.checked++;
      return { ok: true, reason: 'ok', who: who, fact: fact, via: knows.indexOf(fact) >= 0 ? 'knows' : (present ? 'present' : 'heard') };
    }
    return refuse('leak', { who: who, fact: fact, why: '他既不在场、也没听人说过这条 —— 让他说出来就是越界' });
  }

  /** OPV28-21 物品连续：收支持平才放行。 */
  function items(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who, 40), item = clean(s.item, 40);
    const delta = Number.isFinite(s.delta) ? s.delta : 0;
    if (!who || !item) return refuse('missing-fields', { need: ['who', 'item'] });
    if (!delta) return refuse('missing-fields', { field: 'delta' });
    const p = person(who);
    if (!p) return refuse('unknown-actor', { who: who });
    const bag = (p.belongings && typeof p.belongings === 'object') ? p.belongings : {};
    const have = Number.isFinite(bag[item]) ? bag[item] : 0;
    if (have + delta < 0) {
      return refuse('shortfall', { who: who, item: item, have: have, delta: delta,
        why: '手里只有 ' + have + ' 件，却要减 ' + Math.abs(delta) + ' 件 —— 东西不会凭空多出来' });
    }
    if (delta > 0 && !clean(s.from, 40)) {
      return refuse('shortfall', { who: who, item: item, delta: delta,
        why: '凭空多出来的东西必须说出从谁那儿来的（`from`）' });
    }
    stat.checked++;
    return { ok: true, reason: 'ok', who: who, item: item, after: have + delta, from: clean(s.from, 40) };
  }

  /** OPV28-22 关系数值连续：大跳要有事件支撑。 */
  function relation(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who, 40), target = clean(s.target, 40);
    const delta = Number.isFinite(s.delta) ? s.delta : 0;
    if (!who || !target) return refuse('missing-fields', { need: ['who', 'target'] });
    if (!delta) return refuse('missing-fields', { field: 'delta' });
    if (Math.abs(delta) > cfg.maxRelationJump && !clean(s.event, 80)) {
      return refuse('weak-evidence', { who: who, delta: delta, cap: cfg.maxRelationJump,
        why: '一次跳 ' + delta + ' 太多，必须给出是哪件事造成的（`event`）' });
    }
    stat.checked++;
    return { ok: true, reason: 'ok', who: who, target: target, delta: delta, event: clean(s.event, 80) };
  }

  /** OPV28-23 时间一致：只报偏差读数，不自动改写正文。 */
  function time(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const story = Number.isFinite(s.storyClock) ? s.storyClock : null;
    const world = Number.isFinite(s.worldClock) ? s.worldClock : null;
    if (story === null && world === null) return refuse('missing-fields', { need: ['storyClock|worldClock'] });
    const dev = (story !== null && world !== null) ? Math.abs(story - world) : 0;
    stat.checked++;
    const deviated = dev > cfg.timeDeviationMin;
    return { ok: true, reason: 'ok', storyClock: story, worldClock: world, deviation: dev,
      threshold: cfg.timeDeviationMin, deviated: deviated, rewroteText: false,
      line: deviated ? ('正文时间与世界钟差了 ' + dev + '（阈值 ' + cfg.timeDeviationMin + '）—— 提示你，不替你改正文')
        : ('两侧对得上（差 ' + dev + '）') };
  }

  /** OPV28-24 终态不复活：复活必须显式重开口 + 理由。 */
  function terminal(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = clean(s.id, 60);
    if (!id) return refuse('missing-fields', { field: 'id' });
    const d = draft();
    const pools = [];
    ['threads', 'currents', 'places', 'organizations', 'projects'].forEach(function (k) {
      if (Array.isArray(d[k])) d[k].forEach(function (x) { if (x) pools.push(x); });
    });
    const row = pools.filter(function (x) { return clean(x.id, 60) === id; })[0];
    if (!row) return { ok: true, reason: 'ok', found: false, note: '现场没有这条 —— 不需要复活判据' };
    const ended = row.status === 'closed' || row.status === 'dead' || row.status === 'settled' ||
      row.ended === true || row.closedAt;
    if (!ended) return { ok: true, reason: 'ok', found: true, ended: false };
    if (s.reopen !== true) return refuse('closed', { id: id, status: clean(row.status, 20),
      why: '这条已经结束了：要复活必须显式重开口，不许顺手写成「又出现了」' });
    if (!clean(s.reason, 80)) return refuse('missing-fields', { field: 'reason', id: id,
      why: '重开口必须给理由（谁把它重新打开、凭什么）' });
    stat.checked++;
    return { ok: true, reason: 'ok', found: true, ended: true, reopened: true, reason: clean(s.reason, 80),
      note: '重开口已留痕（旧终态不删，另起一段）' };
  }

  function view() { return { enabled: settings().enabled, stat: Object.assign({}, stat) }; }

  WA.continuityGuard = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    position: position, knowledge: knowledge, items: items, relation: relation, time: time, terminal: terminal,
    view: view, stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/continuity-guard.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/continuity-guard 已加载（' + VERSION + '）');
})();