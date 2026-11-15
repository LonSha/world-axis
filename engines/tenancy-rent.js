/**
 * WorldAxis engines/tenancy-rent.js (v2.416.0) — EXV24-3 租佃与田租
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「佃农 / 租佃 / 田租 / 地租」全仓语料 0 命中。levy-corvee 治的是**官对民**的
 *   单向征发，economy 治的是**你情我愿**的现货买卖 —— 而"地主与佃农"这层
 *   **私人的、持续的、会欠的**生产关系是空的。史书里"丰年亦饥"的机制不存在。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `lease` 立佃约 → `collectRent` 按季收租（收不到记欠）→ 欠满两季 `evictTenant`
 *   才许逼佃 → 佃约终止、田回荒田（回流由调用方接 sediment/production）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store、不动钱包：收租只记账面缴欠，钱袋谁扣由调用方拿回执自己做。
 *   ② 逼佃有硬门禁：欠 < 2 季一律拒收 `arrears-insufficient` —— 收成不好不是罪。
 *   ③ 同一田只许一张活约（`plot-leased`），同一佃农活约数有顶（默认 3）。
 *   ④ 租与欠都是正整数（`bad-amount`），不受理 0 租约（白种田不是租佃是慈善）。
 *   ⑤ 条数有界（默认 24 张活约 + 已闭约留档环 32）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_tenancy_rent_settings_v1';
  const DEF = { enabled: true, maxActive: 24, maxPerTenant: 3, closedKeep: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'tenancyRent',
    bounds: { maxActive: [4, 96], maxPerTenant: [1, 12], closedKeep: [8, 64] } };
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
  const stat = { leased: 0, collected: 0, evicted: 0, refused: 0, lastReason: '' };
  const ACTIVE = {}; // leaseId -> row
  const CLOSED = [];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function pint(v) { const n = Number(v); return (Number.isInteger(n) && n > 0) ? n : null; }
  function closeRow(row, how) {
    row.status = how;
    CLOSED.push(row);
    while (CLOSED.length > settings().closedKeep) CLOSED.shift();
    delete ACTIVE[row.id];
  }
  function lease(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const landlord = str(s.landlord), tenant = str(s.tenant), plot = str(s.plot);
    const rent = pint(s.rentPerSeason);
    if (!landlord || !tenant || !plot) { stat.refused++; stat.lastReason = 'missing-party'; return { ok: false, hint: 'missing-party：地主、佃农、田，三样缺一不可' }; }
    if (rent === null) { stat.refused++; stat.lastReason = 'bad-amount'; return { ok: false, hint: 'bad-amount：每季租须为正整数，0 租是慈善不是租佃' }; }
    const dupPlot = Object.keys(ACTIVE).find(function (k) { return ACTIVE[k].plot === plot; });
    if (dupPlot) { stat.refused++; stat.lastReason = 'plot-leased'; return { ok: false, hint: 'plot-leased：这块田已有活约 ' + dupPlot + '，一田不二佃' }; }
    const n = Object.keys(ACTIVE).filter(function (k) { return ACTIVE[k].tenant === tenant; }).length;
    if (n >= cfg.maxPerTenant) { stat.refused++; stat.lastReason = 'tenant-capped'; return { ok: false, hint: 'tenant-capped：佃农耕得过来吗？活约已有 ' + n + ' 张' }; }
    const id = 'tl' + (++stat.leased) + '-' + str(s.key || '');
    ACTIVE[id] = { id: id, landlord: landlord, tenant: tenant, plot: plot, rentPerSeason: rent, arrears: 0, seasonsPaid: 0, openedAt: s.at || null, status: 'active' };
    return { ok: true, id: id, rentPerSeason: rent };
  }
  function collectRent(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const row = ACTIVE[str(id)];
    if (!row) { stat.refused++; stat.lastReason = 'unknown-lease'; return { ok: false, hint: 'unknown-lease：没有这张活约' }; }
    const amount = s.amount === undefined ? row.rentPerSeason : pint(s.amount);
    if (amount === null) { stat.refused++; stat.lastReason = 'bad-amount'; return { ok: false, hint: 'bad-amount：缴租额须为正整数（缺省按整季租）' }; }
    const short = Math.max(0, row.rentPerSeason - amount);
    row.arrears += short;
    if (short === 0) { row.seasonsPaid++; row.arrears = Math.max(0, row.arrears - row.rentPerSeason >= 0 ? row.arrears - row.rentPerSeason : 0); stat.collected++; }
    return { ok: true, id: row.id, paid: amount, short: short, arrears: row.arrears, seasonsPaid: row.seasonsPaid,
      evictable: row.arrears >= 2 * row.rentPerSeason };
  }
  function evictTenant(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const row = ACTIVE[str(id)];
    if (!row) { stat.refused++; stat.lastReason = 'unknown-lease'; return { ok: false, hint: 'unknown-lease：没有这张活约' }; }
    if (row.arrears < 2 * row.rentPerSeason) { stat.refused++; stat.lastReason = 'arrears-insufficient'; return { ok: false, hint: 'arrears-insufficient：只欠 ' + row.arrears + '（不足两季 ' + 2 * row.rentPerSeason + '），收成不好不是罪' }; }
    if (!str(s.reason)) { stat.refused++; stat.lastReason = 'missing-reason'; return { ok: false, hint: 'missing-reason：逼佃要给个说法，写进约底' }; }
    closeRow(row, 'evicted');
    stat.evicted++;
    return { ok: true, id: row.id, plot: row.plot, tenant: row.tenant, arrears: row.arrears };
  }
  function view(id) {
    if (id) { const row = ACTIVE[str(id)] || CLOSED.find(function (r) { return r.id === str(id); }); return row ? { ok: true, row: JSON.parse(JSON.stringify(row)) } : { ok: false, hint: 'unknown-lease' }; }
    const rows = Object.keys(ACTIVE).map(function (k) { const r = ACTIVE[k];
      return { id: r.id, landlord: r.landlord, tenant: r.tenant, plot: r.plot, arrears: r.arrears, seasonsPaid: r.seasonsPaid, evictable: r.arrears >= 2 * r.rentPerSeason }; });
    return { ok: true, active: rows.length, rows: rows, closedKept: CLOSED.length };
  }
  function statView() { return Object.assign({ active: Object.keys(ACTIVE).length, closed: CLOSED.length }, stat); }
  function reset() { Object.keys(ACTIVE).forEach(function (k) { delete ACTIVE[k]; }); CLOSED.length = 0; stat.leased = 0; stat.collected = 0; stat.evicted = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.tenancyRent = {
    lease: lease, collectRent: collectRent, evictTenant: evictTenant, view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/tenancy-rent.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/tenancy-rent 已加载（2.416.0）');
})();
