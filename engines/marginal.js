/**
 * WorldAxis engines/marginal.js (v2.72.0)
 * 边际递减账：重复正向互动的收益衰减与冷却重置。
 *
 * 缝合来源：预设《灵魂调香师》「动态角色表 —— 好感度获取衰减：仅对正面的『日常』和
 * 『行为』事件生效；每次触发，计数器+1；最终增加值 = 原始增加值 × (0.8 ^ (短期互动
 * 计数器 − 1))；计数器在发生重大/负面事件后，或连续5轮无好感增加后清零」
 * 「情感冲击冷却期：若因『剧情冲击』或『极端事件』产生 >±5.0 的变动，则接下来 3轮内，
 * 『日常』和『行为』事件效果减半 (x0.5)」。
 *
 * 预设里那是给模型的一段算式；能落成引擎判据的是**衰减必须是算出来的、可复算的**：
 *   ① 计数器（重复次数）显式入账，增益 = 原始 × ratio^(count−1)，结果四舍五入到 step；
 *   ② 计数器有两条清零路径——重大事件（reset）与连续 N 轮无增益（tick 自然归零）；
 *   ③ 冷却期是独立开关态（cooldown 轮数倒计时），冷却期内增益再乘 cooldownFactor。
 *
 * 与 fondness.js 的分工：fondness 是「好感本身的审计」（步进白名单 + 不降准则 + 信任
 * 对冲），管的是**值**；本模块管的是**同一动作第 N 次还值多少**（折旧率），
 * 不读写 fondness 的值，也不判断好感升降。两者可叠加：fondness 定步进、marginal 定折扣。
 * 与 karma.js 的分工：那是跨世俗的道德量值；这是人际互动的收益衰减。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时写路径报 reason:'disabled'，不计账。
 *   2 对象名缺或空整次拒收（missing-fields）；原始增益须为正有限数（bad-amount）。
 *   3 未登记过的对象 gain/reset 报 missing，不建空行（首次互动本就该走原始值）。
 *   4 折扣不会让增益变负或归零（保底 floorRatio），也绝不超过原始值。
 *   5 冷却只能由显式 cool() 开启；tick 只做递减，不能让冷却变长（单调不增）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_marginal_settings_v1';
  const DEF = { enabled: false, maxRows: 16, ratio: 80, floorRatio: 20, idleRounds: 5, coolRounds: 3 };
  // ratio / floorRatio 都是「百分比整数」（80 = 0.8），与 clampNum 的整数夹取兼容。
  const __REG = { key: LS_KEY, def: DEF, module: 'marginal',
    bounds: { maxRows: [4, 32], ratio: [50, 100], floorRatio: [5, 50], idleRounds: [2, 12], coolRounds: [1, 10] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { gains: 0, resets: 0, cools: 0, idles: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().marginal; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function find(who) { return rows().filter(function (r) { return r && r.who === who; })[0]; }
  /** 折扣因子 = max(floor, ratio^count)，count 为**本次之前的**重复次数（首次 count=0 无折扣）。 */
  function factorFor(count) {
    const cfg = settings();
    const n = Math.max(0, Math.floor(Number(count) || 0));
    const r = Math.max(0.05, Math.min(1, (Number(cfg.ratio) || 80) / 100));
    const f = Math.pow(r, n);
    const floor = Math.max(0.01, Math.min(1, (Number(cfg.floorRatio) || 20) / 100));
    return Math.max(floor, Math.min(1, f));
  }
  /** 登记一个对象（零次重复、无冷却）。 */
  function open(who) {
    const w = clean(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.marginal = draft.marginal && typeof draft.marginal === 'object' && !Array.isArray(draft.marginal) ? draft.marginal : { rows: [] };
      draft.marginal.rows = Array.isArray(draft.marginal.rows) ? draft.marginal.rows : [];
      if (draft.marginal.rows.filter(function (r) { return r && r.who === w; })[0]) { out = { ok: false, reason: 'exists', who: w }; return false; }
      if (draft.marginal.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', who: w }; return false; }
      draft.marginal.rows.push({ who: w, count: 0, idle: 0, cool: 0, at: clockNow('marginal') });
      if (WA.evict) WA.evict.array(draft.marginal.rows, 'marginal.rows');
      out = { ok: true, who: w, count: 0, factor: factorFor(0) };
    }, 'marginal:open');
    if (out && out.ok) stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'opened';
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 计算并记账一次增益：value = raw × factor(count) × (冷却中 ? 0.5 : 1)。
   * 全程**不改变 fondness**（只给出「折算后该加多少」），调用方拿 applied 去落值。
   */
  function gain(who, raw) {
    const w = clean(who, 40);
    const amt = Number(raw);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!isFinite(amt) || amt <= 0) { noteFault('bad-amount'); return { ok: false, reason: 'bad-amount', got: raw }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.marginal = draft.marginal && typeof draft.marginal === 'object' && !Array.isArray(draft.marginal) ? draft.marginal : { rows: [] };
      draft.marginal.rows = Array.isArray(draft.marginal.rows) ? draft.marginal.rows : [];
      const row = draft.marginal.rows.filter(function (r) { return r && r.who === w; })[0];
      if (!row) { out = { ok: false, reason: 'missing', who: w }; return false; }
      const count = Math.max(0, Math.floor(Number(row.count) || 0));
      const cool = Math.max(0, Math.floor(Number(row.cool) || 0));
      const f = factorFor(count);
      const coolMul = cool > 0 ? 0.5 : 1;
      const applied = Math.max(0, amt * f * coolMul);
      row.count = count + 1;
      row.idle = 0;                        // 有增益 ⇒ 连续无增益计数归零
      row.at = clockNow('marginal');
      out = { ok: true, who: w, raw: amt, factor: f, cool: cool, coolMul: coolMul,
        applied: applied, count: row.count, nextFactor: factorFor(row.count) };
    }, 'marginal:gain');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.gains++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'gained'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 重大事件：计数器清零（且顺带清冷却，叙事上翻篇）。 */
  function reset(who) {
    const w = clean(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.marginal = draft.marginal && typeof draft.marginal === 'object' && !Array.isArray(draft.marginal) ? draft.marginal : { rows: [] };
      draft.marginal.rows = Array.isArray(draft.marginal.rows) ? draft.marginal.rows : [];
      const row = draft.marginal.rows.filter(function (r) { return r && r.who === w; })[0];
      if (!row) { out = { ok: false, reason: 'missing', who: w }; return false; }
      const had = Math.max(0, Math.floor(Number(row.count) || 0));
      row.count = 0; row.idle = 0; row.cool = 0;
      row.at = clockNow('marginal');
      out = { ok: true, who: w, cleared: had, factor: factorFor(0) };
    }, 'marginal:reset');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.resets++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'reset'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 开启冷却（情感冲击/极端事件后的减半期）。 */
  function cool(who, rounds) {
    const w = clean(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.marginal = draft.marginal && typeof draft.marginal === 'object' && !Array.isArray(draft.marginal) ? draft.marginal : { rows: [] };
      draft.marginal.rows = Array.isArray(draft.marginal.rows) ? draft.marginal.rows : [];
      const row = draft.marginal.rows.filter(function (r) { return r && r.who === w; })[0];
      if (!row) { out = { ok: false, reason: 'missing', who: w }; return false; }
      const n = (rounds === undefined || rounds === null) ? settings().coolRounds : Math.floor(Number(rounds));
      if (!isFinite(n) || n <= 0) { out = { ok: false, reason: 'bad-amount', got: rounds }; return false; }
      row.cool = n;                                     // 冷却**不叠加**，取指定值
      row.at = clockNow('marginal');
      out = { ok: true, who: w, cool: row.cool };
    }, 'marginal:cool');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.cools++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'cooled'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 轮次推进：冷却 −1（单调不增）；无增益的连续轮数 +1，达 idleRounds 则计数器自然归零。
   * 注意：**无增益轮**由调用方显式推进（不自动判断「本轮加没加」，那是叙事判断）。
   */
  function tick(noGain) {
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.marginal = draft.marginal && typeof draft.marginal === 'object' && !Array.isArray(draft.marginal) ? draft.marginal : { rows: [] };
      draft.marginal.rows = Array.isArray(draft.marginal.rows) ? draft.marginal.rows : [];
      let cooled = 0, idled = 0;
      const limit = Math.max(1, settings().idleRounds);
      draft.marginal.rows.forEach(function (r) {
        if (!r) return;
        if ((Number(r.cool) || 0) > 0) { r.cool = Math.max(0, (Number(r.cool) || 0) - 1); cooled++; }
        if (noGain) {
          r.idle = Math.max(0, Number(r.idle) || 0) + 1;
          if (r.idle >= limit && (Number(r.count) || 0) > 0) { r.count = 0; r.idle = 0; idled++; }
        }
      });
      out = { ok: true, cooled: cooled, idled: idled };
    }, 'marginal:tick');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.idles += (out.idled || 0); stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'ticked'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读：当前折扣与计数。未登记报 missing。 */
  function read(who) {
    const w = clean(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = find(w);
    if (!row) { noteFault('missing'); return { ok: false, reason: 'missing', who: w }; }
    const count = Math.max(0, Math.floor(Number(row.count) || 0));
    return { ok: true, who: w, count: count, idle: Number(row.idle) || 0, cool: Number(row.cool) || 0,
      factor: factorFor(count), nextFactor: factorFor(count + 1) };
  }
  function drop(who) {
    const w = WA.inputGuard.text(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.marginal = draft.marginal && typeof draft.marginal === 'object' && !Array.isArray(draft.marginal) ? draft.marginal : { rows: [] };
      draft.marginal.rows = Array.isArray(draft.marginal.rows) ? draft.marginal.rows : [];
      const idx = draft.marginal.rows.map(function (r) { return r && r.who; }).indexOf(w);
      if (idx < 0) { out = { ok: false, reason: 'missing', who: w }; return false; }
      draft.marginal.rows.splice(idx, 1);
      out = { ok: true, who: w };
    }, 'marginal:drop');
    if (out && !out.ok && out.reason !== 'disabled') noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 注入块：计数与折扣读数 + 铁律。关闭或无账返回空串（零 token）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().filter(function (r) { return r && ((Number(r.count) || 0) > 0 || (Number(r.cool) || 0) > 0); });
    if (!list.length) return '';
    const lines = list.slice(-Math.max(1, cfg.maxRows)).map(function (r) {
      const count = Math.max(0, Math.floor(Number(r.count) || 0));
      const cool = Math.max(0, Math.floor(Number(r.cool) || 0));
      const pct = Math.round(factorFor(count) * 100);
      return '· ' + r.who + '：同类互动已重复 ' + count + ' 次，本次增益按 ' + pct + '% 折算' + (cool > 0 ? '（冷却减半期剩余 ' + cool + ' 轮）' : '');
    });
    return '[边际折旧] 同类互动的收益衰减（**折扣是算出来的，不得凭感觉给值**）：\n' + lines.join('\n')
      + '\n折旧铁律：只对正面的日常/行为事件生效；重大事件（翻篇）或连续 ' + Math.max(1, cfg.idleRounds)
      + ' 轮无增益则计数器归零，恢复原值；重复同一种「讨好」其边际收益递减，角色应当感到它在变淡——换方式、换场合、或让事件本身升级，而不是加倍用力。\n';
  }
  WA.marginal = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    open: open, gain: gain, reset: reset, cool: cool, tick: tick, read: read, drop: drop, buildBlock: buildBlock,
    factorFor: factorFor,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
