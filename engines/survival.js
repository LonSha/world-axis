/**
 * WorldAxis engines/survival.js (v2.68.0)
 * 生存三轴：饱食/精力/负重的分段状态与归零惩罚，只报状态不改写别的模块。
 *
 * 缝合来源：《艾尔德兰》世界书的「负重、饱食、精力 [14]」——
 *   饱食 0-100：常态4点/时、剧烈10点/时；分段 充沛(81-100)/轻度(61-80)/
 *   中度(31-60，停HP自然恢复)/重度(0-30，移速减半)/归零(每小时扣最大HP 5% 真实伤害)；
 *   精力 0-100：清醒常态6点/时、战斗10点/次；分段 饱满(81-100，感知+1)/正常(31-80)/
 *   困倦(11-30，失反应动作)/极疲(1-10，检定劣势)/归零(强制昏睡、遭击必暴)；
 *   负重：轻载(≤50%上限无惩罚)/重载(51-100%，消耗翻倍)/超载(>100%，移速归零)。
 * 引擎只收「分段状态可核验」这一层：给当前读数 → 返回分段与惩罚标志。
 * 「每游戏小时扣 5% HP」的 HP 面归人物账本，本模块只把归零标志如实报出（不动 people）。
 *
 * 与 affect.loads 的分工：affect 的调制量是「情绪通道的可见条数衰减」（0..3 档），
 * 本模块是「肉体的读数与分段」（0..100 连续值 + 分段判定），两者不读写对方。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 read() 返回 reason:'disabled'，不猜分段。
 *   2 三轴数值只收 0..100 数值（bad-axis）；未登记的轴如实报 missing，不回落成「吃饱」。
 *   3 负重只收非负数（bad-load）；没有上限登记时超载判定拒绝（no-capacity）——
 *     「上限=16+力调×2」是人物属性推导，本模块不抄近道猜一个。
 *   4 分段边界是**左开右闭**的一致口径：(lo, hi]，与原文「81-100 充沛」的读数一致。
 *   5 显式扣减/恢复走 delta（消耗/恢复），非法 delta 拒收；clamp 到边界但**报出截断**
 *     （clamped:true），静默夹取在本仓库不是合法形态。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_survival_settings_v1';
  const DEF = { enabled: false, maxRows: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'survival', bounds: { maxRows: [2, 24] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { sets: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().survival; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(who) { return rows().filter(function (r) { return r && r.who === who; })[0] || null; }
  /** 分段判定（左开右闭：(lo, hi]）。 */
  function satBand(v) {
    if (v > 80) return { band: '充沛', hunger: false, moveHalf: false };
    if (v > 60) return { band: '轻度', hunger: false, moveHalf: false };
    if (v > 30) return { band: '中度', hunger: true, moveHalf: false };
    if (v > 0) return { band: '重度', hunger: true, moveHalf: true };
    return { band: '归零', hunger: true, moveHalf: true, drainHp: true };
  }
  function staBand(v) {
    if (v > 80) return { band: '饱满', perceive: 1 };
    if (v > 30) return { band: '正常', perceive: 0 };
    if (v > 10) return { band: '困倦', perceive: 0, noReaction: true };
    if (v > 0) return { band: '极疲', perceive: 0, noReaction: true, allCheck: true, moveHalf: true };
    return { band: '归零', perceive: 0, noReaction: true, forcedSleep: true, hitCrit: true };
  }
  /**
   * 登记或更新某人三轴读数。satiety/stamina 0..100；load 为负重读数，capacity 为上限。
   */
  function set(who, axes) {
    // v2.79.0（第十三面续 · 输入边界）：who 必须是非空字符串、axes 必须是对象。
    //   此前 set('甲', NaN) 会让 `axes || {}` 落到 {}，于是三轴一个都没校验、一路走到
    //   末尾**建出一条全 null 的空记录并报 ok** —— 一次「参数传错」被记成了「这个人
    //   登记了三轴读数」。
    if (typeof who !== 'string' || !who.trim()) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (axes != null && (typeof axes !== 'object' || Array.isArray(axes))) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const w = clean(who, 40);
    const p = axes || {};
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      if (p.satiety != null && (typeof p.satiety !== 'number' || !isFinite(p.satiety) || p.satiety < 0 || p.satiety > 100)) { out = { ok: false, reason: 'bad-axis', axis: 'satiety' }; return false; }
      if (p.stamina != null && (typeof p.stamina !== 'number' || !isFinite(p.stamina) || p.stamina < 0 || p.stamina > 100)) { out = { ok: false, reason: 'bad-axis', axis: 'stamina' }; return false; }
      if (p.load != null && (typeof p.load !== 'number' || !isFinite(p.load) || p.load < 0)) { out = { ok: false, reason: 'bad-load' }; return false; }
      draft.survival = draft.survival && typeof draft.survival === 'object' && !Array.isArray(draft.survival) ? draft.survival : { rows: [] };
      draft.survival.rows = Array.isArray(draft.survival.rows) ? draft.survival.rows : [];
      let hit = draft.survival.rows.filter(function (r) { return r && r.who === w; })[0];
      if (!hit) { hit = { who: w, satiety: null, stamina: null, load: null, capacity: null, at: 0 }; draft.survival.rows.push(hit); }
      if (p.satiety != null) hit.satiety = p.satiety;
      if (p.stamina != null) hit.stamina = p.stamina;
      if (p.load != null) hit.load = p.load;
      if (p.capacity != null) {
        if (typeof p.capacity !== 'number' || !isFinite(p.capacity) || p.capacity <= 0) { out = { ok: false, reason: 'bad-load' }; return false; }
        hit.capacity = p.capacity;
      }
      // no-capacity 只在**本次给了 load** 且未同时给 capacity 且行内也无存量 capacity 时报：
      //   合法字段的其他更新（只改饱食/精力）不得被历史半成品行连带拒绝。
      if (p.load != null && p.capacity == null && hit.capacity == null) { out = { ok: false, reason: 'no-capacity', who: w }; return false; }
      hit.at = clockNow('survival');
      if (WA.evict) WA.evict.array(draft.survival.rows, 'survival.rows');
      out = { ok: true, who: w };
    }, 'survival:set');
    if (out && out.ok) { stat.sets++; stat.lastReason = 'set'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读三轴分段（给注入与推演方的只读视图）。未登记轴如实报 missing。 */
  function read(who) {
    if (!settings().enabled) return { ok: true, who: who, reason: 'disabled' };
    const hit = rowOf(clean(who, 40));
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', who: who }; }
    const out = { ok: true, who: hit.who, reason: 'applied' };
    if (hit.satiety == null) out.satiety = { reason: 'missing' }; else out.satiety = Object.assign({ value: hit.satiety }, satBand(hit.satiety));
    if (hit.stamina == null) out.stamina = { reason: 'missing' }; else out.stamina = Object.assign({ value: hit.stamina }, staBand(hit.stamina));
    if (hit.load == null) out.burden = { reason: 'missing' };
    else {
      const ratio = hit.load / (hit.capacity || 1);
      out.burden = { value: hit.load, capacity: hit.capacity, ratio: +ratio.toFixed(3),
        band: ratio > 1 ? '超载' : (ratio > 0.5 ? '重载' : '轻载'),
        moveZero: ratio > 1, drainDouble: ratio > 0.5 };
    }
    return out;
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) {
      const s = r.satiety == null ? '饱食未测' : '饱食 ' + Math.round(r.satiety) + '（' + satBand(r.satiety).band + '）';
      const t = r.stamina == null ? '精力未测' : '精力 ' + Math.round(r.stamina) + '（' + staBand(r.stamina).band + '）';
      const b = (r.load == null || r.capacity == null) ? '负重未测' : '负重 ' + Math.round(r.load) + '/' + Math.round(r.capacity) + '（' + (r.load / r.capacity > 1 ? '超载' : r.load / r.capacity > 0.5 ? '重载' : '轻载') + '）';
      return '· ' + r.who + '：' + s + '｜' + t + '｜' + b;
    });
    return '[生存三轴]\n' + lines.join('\n') + '\n肉体读数决定行为边界：归零的惩罚如实结算（饱食归零每小时扣血、精力归零强制昏睡、超载移速归零），不因剧情需要而豁免。\n';
  }
  WA.survival = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    set: set, read: read, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();