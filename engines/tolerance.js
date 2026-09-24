/**
 * WorldAxis engines/tolerance.js (v2.72.0)
 * 手段耐受账：同一手段在近期轮次内的重复触达与钝化降级。
 *
 * 缝合来源：预设《情感浓度》「近 3 轮内重复触发的泄漏通道即降级」——原文把「同一句话、
 * 同一个动作、同一件道具、同一个称呼反复用」视作叙事上的失效信号，要求模型换手段。
 * 预设里那是给模型的一句劝告；能落成引擎判据的是**查重必须是数出来的、可复算的**：
 *   ① 每次触达显式入账轮号，重复次数 = **滑动窗口内的轮号个数**，不是终身累计；
 *   ② 窗口滑动即自愈——旧触达随轮次推进自动出窗，无需显式翻篇（与 marginal 相反）；
 *   ③ 同一轮内同一手段只允许生效一次（burst），第 N 次触达按 decay^(n−1) 折算，
 *      窗口内触达数**超过**上限即报 stale、本次不生效也不入账（幂等，不因重试而脏写）。
 *
 * 与 marginal.js 的分工：marginal 的主体维度是「对象」（对谁讨好），度量是**长期累计
 * 折旧**，只有显式翻篇或连续无增益才清零；本模块的主体维度是「手段」（用什么招），
 * 度量是**近期窗口查重**，会随时间自然消退。一个问「他对这招是不是腻了」，一个问
 * 「这招最近是不是用得太密了」。两者可叠加：先过 tolerance 查重，再过 marginal 折旧。
 * 与 fondness.js 的分工：那是好感值的审计；这是表达手段的重复度审计，不读写任何值。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时写路径报 reason:'disabled'，不推进轮号也不计数。
 *   2 手段名缺或空整次拒收（missing-fields）；类别须在白名单内（bad-kind）。
 *   3 未登记过的手段 read/drop 报 missing，use 则自动开行（首次使用本就该记账）。
 *   4 衰减只减不增：factor = decay^(n−1)，n 为窗口内第几次，绝不超过 1。
 *   5 tick 只推进轮号与出窗，绝不把触达数变大（单调不增）；清账只能由 drop 显式执行。
 *   6 轮号是本模块私有计数（state.tolerance.round），由 tick 驱动，与其它引擎的轮概念独立。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_tolerance_settings_v1';
  const KINDS = ['line', 'gesture', 'prop', 'address'];
  const DEF = { enabled: false, maxRows: 24, window: 3, maxRepeat: 3, decay: 50 };
  // decay 是「百分比整数」（50 = 0.5），与 clampNum 的整数夹取兼容。
  const __REG = { key: LS_KEY, def: DEF, module: 'tolerance',
    bounds: { maxRows: [4, 64], window: [1, 10], maxRepeat: [1, 6], decay: [10, 90] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { uses: 0, bursts: 0, stales: 0, drops: 0, ticks: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bucket(draft) {
    if (!draft.tolerance || typeof draft.tolerance !== 'object' || Array.isArray(draft.tolerance)) draft.tolerance = { round: 0, rows: [] };
    if (!Array.isArray(draft.tolerance.rows)) draft.tolerance.rows = [];
    if (!isFinite(Number(draft.tolerance.round))) draft.tolerance.round = 0;
    return draft.tolerance;
  }
  function bucketRead() {
    const t = state().tolerance;
    return (t && typeof t === 'object' && !Array.isArray(t)) ? { round: Number(t.round) || 0, rows: Array.isArray(t.rows) ? t.rows : [] } : { round: 0, rows: [] };
  }
  function rows() { return bucketRead().rows; }
  function roundOf() { return bucketRead().round; }
  function find(key) { return rows().filter(function (r) { return r && r.key === key; })[0]; }
  /** 窗口下界：本轮 r、窗口 w ⇒ 只看轮号 >= r−w+1 的触达。 */
  function lowBound(r, w) { return Math.max(0, r - Math.max(1, w) + 1); }
  /** 某个触达次数对应的折算因子（百分比整数 decay 为底）。 */
  function factorFor(n) {
    const cfg = settings();
    const k = Math.max(1, Math.floor(Number(n) || 1));
    const d = Math.max(0.1, Math.min(1, (Number(cfg.decay) || 50) / 100));
    return Math.max(0, Math.min(1, Math.pow(d, k - 1)));
  }
  /**
   * 使用一次手段。返回本次是否有效、是窗口内第几次、折算因子、以及是否已钝化。
   * stale 时本次不生效（不计因子、不入账），调用方应换手段而不是再加力度。
   */
  function use(key, kind) {
    const k = clean(key, 48);
    const kd = clean(kind, 16);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (KINDS.indexOf(kd) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', got: kind }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      const b = bucket(draft);
      const cfg = settings();
      const r = Math.max(0, Math.floor(Number(b.round) || 0));
      const win = Math.max(1, Math.floor(Number(cfg.window) || 3));
      const maxR = Math.max(1, Math.floor(Number(cfg.maxRepeat) || 3));
      const lo = lowBound(r, win);
      let row = b.rows.filter(function (x) { return x && x.key === k; })[0];
      if (!row) {
        if (b.rows.length >= cfg.maxRows) { out = { ok: false, reason: 'rows-full', key: k }; return; }
        row = { key: k, kind: kd, hits: [], tier: 0, at: clockNow('tolerance') };
        b.rows.push(row);
      }
      row.kind = kd;
      const hits = (Array.isArray(row.hits) ? row.hits : []).filter(function (n) { return Number(n) >= lo; });
      row.hits = hits;
      if (hits.indexOf(r) >= 0) { out = { ok: false, reason: 'burst', key: k, round: r }; return; }
      const before = hits.length;
      if (before >= maxR) { out = { ok: false, reason: 'stale', key: k, hits: before, round: r, maxRepeat: maxR }; return; }
      hits.push(r);
      const n = before + 1;
      row.tier = n;
      row.at = clockNow('tolerance');
      if (WA.evict) WA.evict.array(b.rows, 'tolerance.rows');
      out = { ok: true, key: k, kind: kd, round: r, hits: n, tier: n, maxRepeat: maxR,
        fresh: n === 1, factor: factorFor(n), nextFactor: n < maxR ? factorFor(n + 1) : 0 };
    }, 'tolerance:use');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.uses++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'used'; }
    else if (out && !out.ok) {
      if (out.reason === 'burst') stat.bursts++;
      else if (out.reason === 'stale') stat.stales++;
      noteFault(out.reason);
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 轮次推进：轮号 +1，并把窗口外的触达剔出。**只让触达数变小**，绝不清行（清行是 drop）。
   * 返回 survived（仍有窗口内触达的行数）与 expired（本次完全出窗的行数）。
   */
  function tick() {
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      const b = bucket(draft);
      const cfg = settings();
      const win = Math.max(1, Math.floor(Number(cfg.window) || 3));
      b.round = Math.max(0, Math.floor(Number(b.round) || 0)) + 1;
      const lo = lowBound(b.round, win);
      let survived = 0, expired = 0;
      b.rows.forEach(function (row) {
        if (!row) return;
        const had = Array.isArray(row.hits) ? row.hits.length : 0;
        const kept = (Array.isArray(row.hits) ? row.hits : []).filter(function (n) { return Number(n) >= lo; });
        row.hits = kept;
        row.tier = kept.length;
        if (kept.length) survived++;
        else if (had) expired++;
      });
      out = { ok: true, round: b.round, windowLow: lo, survived: survived, expired: expired };
    }, 'tolerance:tick');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.ticks++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'ticked'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 纯读：查重预判，不推进轮号、不入账。未登记报 missing。 */
  function check(key) {
    const k = clean(key, 48);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = find(k);
    const cfg = settings();
    const r = roundOf();
    const maxR = Math.max(1, Math.floor(Number(cfg.maxRepeat) || 3));
    if (!row) {
      return { ok: true, key: k, round: r, hits: 0, tier: 0, fresh: true, stale: false,
        factor: factorFor(1), nextFactor: maxR >= 2 ? factorFor(2) : 0 };
    }
    const lo = lowBound(r, Math.max(1, Math.floor(Number(cfg.window) || 3)));
    const hits = (Array.isArray(row.hits) ? row.hits : []).filter(function (n) { return Number(n) >= lo; }).length;
    return { ok: true, key: k, kind: row.kind, round: r, hits: hits, tier: hits, fresh: hits === 0,
      stale: hits >= maxR, factor: factorFor(hits + 1), nextFactor: hits + 1 < maxR ? factorFor(hits + 2) : 0 };
  }
  /** 显式清账（换场景/换对手/翻篇）。未登记报 missing。 */
  function drop(key) {
    const k = clean(key, 48);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      const b = bucket(draft);
      const idx = b.rows.map(function (r) { return r && r.key; }).indexOf(k);
      if (idx < 0) { out = { ok: false, reason: 'missing', key: k }; return; }
      b.rows.splice(idx, 1);
      out = { ok: true, key: k };
    }, 'tolerance:drop');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.drops++; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function clear() {
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      const b = bucket(draft);
      const n = b.rows.length;
      b.rows = [];
      out = { ok: true, cleared: n };
    }, 'tolerance:clear');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 注入块：仅列**窗口内仍有触达**的手段（已出窗的不算账，不占 token）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lo = lowBound(roundOf(), Math.max(1, Math.floor(Number(cfg.window) || 3)));
    const maxR = Math.max(1, Math.floor(Number(cfg.maxRepeat) || 3));
    const list = rows().filter(function (r) {
      return r && Array.isArray(r.hits) && r.hits.filter(function (n) { return Number(n) >= lo; }).length > 0;
    });
    if (!list.length) return '';
    const lines = list.slice(-Math.max(1, cfg.maxRows)).map(function (r) {
      const n = r.hits.filter(function (x) { return Number(x) >= lo; }).length;
      const pct = Math.round(factorFor(n + 1) * 100);
      if (n >= maxR) return '· ' + r.key + '：近 ' + cfg.window + ' 轮内已用 ' + n + ' 次，**已钝化**，再说一遍不会有效果，必须换手段';
      return '· ' + r.key + '：近 ' + cfg.window + ' 轮内已用 ' + n + ' 次，本次只有 ' + pct + '% 效果';
    });
    return '[手段耐受] 同一手段重复使用的查重（**次数是数出来的，不得凭感觉判断新不新鲜**）：\n' + lines.join('\n')
      + '\n耐受铁律：近 ' + cfg.window + ' 轮内同一句话/同一个动作/同一件道具/同一个称呼触达满 ' + maxR
      + ' 次即钝化，此后再说也不生效——不是加力度，是换说法、换角度、换时机；已出窗的手段恢复如新。\n';
  }
  WA.tolerance = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    use: use, tick: tick, check: check, drop: drop, clear: clear, buildBlock: buildBlock,
    factorFor: factorFor, round: roundOf, KINDS: KINDS.slice(),
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
