/**
 * WorldAxis engines/dice-den.js (v2.416.0) — EXV24-8 赌坊骰局与赌债
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「赌坊 / 骰局 / 赌债」全仓语料 0 命中。blackmarket-usury 有黑市高利贷，
 *   contest 有正规竞赛 —— 但"骰子一摇，有人倾家荡产"这层**赌桌经济**是空的。
 *
 * ── 机制 ── `openTable` 开局 → `placeBet` 押注（走 WA.rand 决策流，可复现）
 *   → `settle` 开骰（win/lose 入账，输家赌债留痕；出千败露走 cheat-attempt 留痕）。
 *
 * ── 边界 ── ① 不碰 store、不动钱袋。② 押注额正整数；同一桌押注有顶。③ 开骰必须
 *   走决策流随机源（WA.rand.pick），**不裸调 Math.random** —— 与 fate/hazard 同纪律。
 *   ④ 出千不是自动判负：先留痕（cheat-attempt），败露与否由叙事/调用方裁决。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_dice_den_settings_v1';
  const DEF = { enabled: true, maxTables: 12, maxBetsPerTable: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'diceDen',
    bounds: { maxTables: [2, 48], maxBetsPerTable: [4, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const stat = { tables: 0, bets: 0, settled: 0, cheats: 0, refused: 0, lastReason: '' };
  const TABLES = {}; // tableId -> {name, bets:[], status, openedAt, closedAt}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function pint(v) { const n = Number(v); return (Number.isInteger(n) && n > 0) ? n : null; }
  function openTable(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const name = str(s.name);
    if (!name) { stat.refused++; stat.lastReason = 'missing-name'; return { ok: false, hint: 'missing-name：赌坊开局要有名号' }; }
    const id = 'dt' + (++stat.tables) + '-' + name;
    if (Object.keys(TABLES).length >= cfg.maxTables) {
      const oldest = Object.keys(TABLES).sort(function (a, b) { return (TABLES[a].openedAt || 0) - (TABLES[b].openedAt || 0); })[0];
      delete TABLES[oldest];
    }
    TABLES[id] = { id: id, name: name, bets: [], status: 'open', openedAt: s.at || null, closedAt: null };
    return { ok: true, id: id };
  }
  function placeBet(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const t = TABLES[str(id)];
    if (!t || t.status !== 'open') { stat.refused++; stat.lastReason = 'table-closed'; return { ok: false, hint: 'table-closed：没有这张在开的桌' }; }
    const who = str(s.who), stake = pint(s.stake), on = str(s.on);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：谁押的？' }; }
    if (stake === null) { stat.refused++; stat.lastReason = 'bad-amount'; return { ok: false, hint: 'bad-amount：押注额须为正整数' }; }
    if (!on) { stat.refused++; stat.lastReason = 'missing-on'; return { ok: false, hint: 'missing-on：押大还是押小？空押不下注' }; }
    if (t.bets.length >= cfg.maxBetsPerTable) { stat.refused++; stat.lastReason = 'table-full'; return { ok: false, hint: 'table-full：这桌押满了' }; }
    t.bets.push({ who: who, stake: stake, on: on, result: null, at: s.at || null });
    stat.bets++;
    return { ok: true, id: t.id, bets: t.bets.length };
  }
  /** 开骰：走决策流随机源（WA.rand），不可复现环境显式拒收。 */
  function settle(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const t = TABLES[str(id)];
    if (!t || t.status !== 'open') { stat.refused++; stat.lastReason = 'table-closed'; return { ok: false, hint: 'table-closed：没有这张在开的桌' }; }
    if (!t.bets.length) { stat.refused++; stat.lastReason = 'no-bets'; return { ok: false, hint: 'no-bets：空桌不开骰' }; }
    const rand = WA.rand;
    if (!rand || typeof rand.pick !== 'function') { stat.refused++; stat.lastReason = 'rand-unavailable'; return { ok: false, reason: 'rand-unavailable', hint: 'rand-unavailable：没有可复现随机源不开骰 —— 绝不裸调 Math.random 兜底' }; }
    const roll = rand.pick(['大', '小'], 'diceDen:roll');
    const rows = t.bets.map(function (b) {
      const win = b.on === roll;
      return { who: b.who, stake: b.stake, on: b.on, win: win, payout: win ? b.stake * 2 : 0, debt: win ? 0 : b.stake };
    });
    t.bets = t.bets.map(function (b, i) { b.result = rows[i]; return b; });
    t.status = 'closed';
    t.closedAt = s.at || null;
    stat.settled++;
    return { ok: true, id: t.id, roll: roll, rows: rows, debts: rows.filter(function (r) { return r.debt > 0; }).map(function (r) { return { who: r.who, debt: r.debt }; }) };
  }
  /** 出千：只留痕不裁决。 */
  function cheatAttempt(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const t = TABLES[str(id)];
    if (!t) { stat.refused++; stat.lastReason = 'table-closed'; return { ok: false, hint: 'table-closed' }; }
    const by = str(s.by);
    if (!by) { stat.refused++; stat.lastReason = 'missing-by'; return { ok: false, hint: 'missing-by：谁出的千？' }; }
    stat.cheats++;
    return { ok: true, id: t.id, by: by, note: 'cheat-attempt 已留痕；败露与否由叙事/调用方裁决' };
  }
  function view(id) {
    if (id) { const t = TABLES[str(id)]; return t ? { ok: true, row: JSON.parse(JSON.stringify(t)) } : { ok: false, hint: 'table-closed' }; }
    const rows = Object.keys(TABLES).map(function (k) { const t = TABLES[k];
      return { id: t.id, name: t.name, status: t.status, bets: t.bets.length }; });
    return { ok: true, open: rows.filter(function (r) { return r.status === 'open'; }).length, rows: rows };
  }
  function statView() { return Object.assign({ openTables: Object.keys(TABLES).filter(function (k) { return TABLES[k].status === 'open'; }).length }, stat); }
  function reset() { Object.keys(TABLES).forEach(function (k) { delete TABLES[k]; }); stat.tables = 0; stat.bets = 0; stat.settled = 0; stat.cheats = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.diceDen = {
    openTable: openTable, placeBet: placeBet, settle: settle, cheatAttempt: cheatAttempt, view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/dice-den.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/dice-den 已加载（2.416.0）');
})();