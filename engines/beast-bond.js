/**
 * WorldAxis engines/beast-bond.js (v2.68.0)
 * 驯兽：驯服度→忠诚度的转化 + 红线状态机（死忠/信赖/勉强/危险），只记账不替演出。
 *
 * 缝合来源：《艾尔德兰》世界书的「宠物系统 [10]」——
 *   驯服度 0-100：满 100 时**清零并转化**为忠诚度；转化方式与初始忠诚：
 *   压制奴役(10-30)/常规投喂(40-60)/救助安抚(60-90)；
 *   忠诚红线状态机：死忠(81-100，无条件服从)/信赖(61-80，稳定战术)/
 *   勉强(21-60，执行基础指令)/危险(0-20，临阵叛逃、极度饥饿必定噬主)；
 *   忠诚异动：并肩作战/喂极品食材增，挨饿/强迫送死剧烈暴跌。
 * 能落成引擎判据的是**转化事件**（驯服满 100 清零转忠诚，带方式与初始档）与
 * **红线分段**（忠诚读数 → 行为档），以及「危险档 + 饥饿 → 噬主风险」的**必须报出**。
 *
 * 与 bonds.js 的分工：bonds 是人与人之间的关系六型（结构账），本模块是
 * 人与兽的主仆读数（量值账）；与 fondness 的分工：好感没有「清零转化」事件，
 * 驯服有——两套语义不合流。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 register()/feed() 返回 reason:'disabled'。
 *   2 转化方式三档白名单：subdue(压制)/feed(投喂)/rescue(救助)，表外拒收（bad-method）。
 *   3 驯服度只收 0..100 数值（bad-value）；满 100 必须转化（满而不转 = 静默卡死，拒收）。
 *   4 忠诚度只收 0..100 数值（bad-value）；危险档（≤20）+ 挨饿必须报出（starving: true），
 *     噬主风险不由本模块演出，但**不可不报**。
 *   5 显式变动走 delta；变动后越界截断必须报 clamped:true，不静默。
 *   6 状态机只按读数分段，无内部隐变量——分段可从读数唯一推出（无暗表）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_beast_settings_v1';
  const DEF = { enabled: false, maxRows: 10 };
  const __REG = { key: LS_KEY, def: DEF, module: 'beastBond', bounds: { maxRows: [2, 20] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const METHODS = ['subdue', 'feed', 'rescue'];
  const METHOD_INIT = { subdue: [10, 30], feed: [40, 60], rescue: [60, 90] };
  const stat = { acts: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().beastBond; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(name) { return rows().filter(function (r) { return r && r.beast === name; })[0] || null; }
  /** 忠诚红线分段（危险/勉强/信赖/死忠）。 */
  function bondBand(v) {
    if (v > 80) return { band: '死忠', obeyAll: true, mayShield: true };
    if (v > 60) return { band: '信赖', steady: true };
    if (v > 20) return { band: '勉强', basicOnly: true, fleeAtLow: true };
    return { band: '危险', mayBetray: true, starveBite: true };
  }
  /**
   * 登记一头兽（带驯服度初值）。tame 0..100。
   */
  function register(beast, owner, tame) {
    const b = clean(beast, 40), w = clean(owner, 40);
    if (!b || !w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (typeof tame !== 'number' || !isFinite(tame) || tame < 0 || tame > 100) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', axis: 'tame' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.beastBond = draft.beastBond && typeof draft.beastBond === 'object' && !Array.isArray(draft.beastBond) ? draft.beastBond : { rows: [] };
      draft.beastBond.rows = Array.isArray(draft.beastBond.rows) ? draft.beastBond.rows : [];
      if (draft.beastBond.rows.filter(function (r) { return r && r.beast === b; })[0]) { out = { ok: false, reason: 'exists', beast: b }; return false; }
      const row = { beast: b, owner: w, tame: tame, loyalty: 0, hunger: false, at: clockNow('beastBond') };
      draft.beastBond.rows.push(row);
      if (WA.evict) WA.evict.array(draft.beastBond.rows, 'beastBond.rows');
      out = { ok: true, beast: b, tame: tame, loyalty: 0 };
    }, 'beastBond:register');
    if (out && out.ok) { stat.acts++; stat.lastReason = 'registered'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 驯服推进。delta > 0 且驯服度到 100 时**必须**带 method 转化：驯服清零、
   * 忠诚取该方式的初始档中位。满而不转（method 缺失）整次拒收（needs-method）。
   */
  function train(beast, delta, method) {
    const b = clean(beast, 40);
    const m = method || null;
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.beastBond = draft.beastBond && typeof draft.beastBond === 'object' && !Array.isArray(draft.beastBond) ? draft.beastBond : { rows: [] };
      draft.beastBond.rows = Array.isArray(draft.beastBond.rows) ? draft.beastBond.rows : [];
      const hit = draft.beastBond.rows.filter(function (r) { return r && r.beast === b; })[0];
      if (!hit) { out = { ok: false, reason: 'missing', beast: b }; return false; }
      if (typeof delta !== 'number' || !isFinite(delta) || delta <= 0) { out = { ok: false, reason: 'bad-delta' }; return false; }
      if (METHODS.indexOf(m) < 0) { out = { ok: false, reason: 'bad-method', got: m }; return false; }
      let t = hit.tame + delta;
      let clamped = false, converted = null;
      if (t >= 100) {
        // 满 100 必须转化：清零驯服、按方式给初始忠诚（区间中位）
        const r = METHOD_INIT[m] || [40, 60];
        hit.tame = 0;
        hit.loyalty = Math.floor((r[0] + r[1]) / 2);
        converted = { method: m, loyalty: hit.loyalty };
        clamped = true;
      } else { hit.tame = t; }
      hit.at = clockNow('beastBond');
      if (WA.evict) WA.evict.array(draft.beastBond.rows, 'beastBond.rows');
      out = { ok: true, beast: b, tame: hit.tame, loyalty: hit.loyalty, converted: converted, clamped: clamped };
    }, 'beastBond:train');
    if (out && out.ok) { stat.acts++; stat.lastReason = 'trained'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 忠诚显式变动（并肩/投喂增，挨饿/送死减）。delta 任意符号；越界截断必须报出。
   */
  function bond(beast, delta, opts) {
    const b = clean(beast, 40);
    const p = opts || {};
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.beastBond = draft.beastBond && typeof draft.beastBond === 'object' && !Array.isArray(draft.beastBond) ? draft.beastBond : { rows: [] };
      draft.beastBond.rows = Array.isArray(draft.beastBond.rows) ? draft.beastBond.rows : [];
      const hit = draft.beastBond.rows.filter(function (r) { return r && r.beast === b; })[0];
      if (!hit) { out = { ok: false, reason: 'missing', beast: b }; return false; }
      if (typeof delta !== 'number' || !isFinite(delta) || delta === 0) { out = { ok: false, reason: 'bad-delta' }; return false; }
      if (delta < 0 && !p.cause) { out = { ok: false, reason: 'missing-cause' }; return false; }
      let v = hit.loyalty + delta;
      let clamped = false;
      if (v > 100) { v = 100; clamped = true; }
      if (v < 0) { v = 0; clamped = true; }
      hit.loyalty = v;
      if (p.hunger != null) hit.hunger = !!p.hunger;
      hit.at = clockNow('beastBond');
      if (WA.evict) WA.evict.array(draft.beastBond.rows, 'beastBond.rows');
      out = { ok: true, beast: b, loyalty: v, clamped: clamped, band: bondBand(v).band, starving: hit.hunger && v <= 20 };
    }, 'beastBond:bond');
    if (out && out.ok) { stat.acts++; stat.lastReason = 'bonded'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读一头兽（给注入与推演方的只读视图）。 */
  function read(beast) {
    if (!settings().enabled) return { ok: true, beast: beast, reason: 'disabled' };
    const hit = rowOf(clean(beast, 40));
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', beast: beast }; }
    return { ok: true, beast: hit.beast, owner: hit.owner, tame: hit.tame, loyalty: hit.loyalty, band: bondBand(hit.loyalty).band, hunger: !!hit.hunger, starving: !!hit.hunger && hit.loyalty <= 20, reason: 'applied' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) {
      const bd = bondBand(r.loyalty);
      return '· ' + r.beast + '（主：' + r.owner + '）：驯服 ' + Math.round(r.tame) + ' / 忠诚 ' + Math.round(r.loyalty) + '（' + bd.band + '）' + (bd.starveBite && r.hunger ? '【饥饿 + 危险档：噬主风险】' : '');
    });
    return '[驯兽]\n' + lines.join('\n') + '\n驯服满百清零转化为忠诚（方式定初始档）；危险档挨饿必噬主——红线的演出由叙事结算，本表只把读数与风险如实报出。\n';
  }
  WA.beastBond = {
    METHODS: METHODS, METHOD_INIT: METHOD_INIT,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    register: register, train: train, bond: bond, read: read, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();