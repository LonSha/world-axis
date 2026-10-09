/**
 * WorldAxis engines/spotlight.js (v2.71.0)
 * 焦点分配：登场轮次的连续计数与久缺名单（均衡读数，不改剧情）。
 *
 * 缝合来源：MoM 果实「各角色有自己的事务、偏好与目的。只展开当前相关的人物，
 * 不强制人人表态，也不让配角只负责赞叹、嫉妒或附和」；打工喵「🌊叙事独立」——
 * 「双方可以同时进行彼此无关的活动……交集必须具有合理的因果来源」；Phantasm
 * 「阶段推进」中「每阶段都会根据不同角色的行动触发一些小事件」。
 *
 * 预设里那是给模型的均衡要求；能落成引擎判据的是**登场是可数事件**：
 * 谁在场、连续在场多少轮、谁已经多少轮没露面——都是登记与计数，不是感觉。
 * 本模块只产出读数与注入提示，**不阻断任何剧情**（均衡是建议不是闸门，
 * 与 ladder/rivalry 那类「不满足即拒收」的纪律型模块区分开）。
 *
 * 与 actors/observe.js 的分工：observe 从正文切片观察「谁出现在场景里」（文本面）；
 * 本模块是叙事者**显式登记**的登场账（声明面），不读正文、不猜。两账可互相印证。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时写路径报 reason:'disabled'，不出读数。
 *   2 名字缺或空整次拒收（bad-who）——空名登场不是登场。
 *   3 同一轮内重复登记同一人**幂等**（不重复计数，报 already 标记但不拒收——
 *      「他这轮说过三次话」与「他这轮在场」是同一件事）。
 *   4 seal() 结算轮次；未 seal 就再 seal 会报 empty-round（没有任何登记者时
 *     结算不进历史）——空轮不算「所有人缺席」，缺省语义必须显式。
 *   5 单轮登记名单有界（maxRows）：满员后新面孔拒收（pending-full），
 *     不静默顶掉本轮更早的登记者；结算（seal）后名单清空。
 *   6 报告只含**已登记过的人**；从未登记的名字不出现在任何读面（不猜存在性）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_spotlight_settings_v1';
  const DEF = { enabled: false, idleThreshold: 5, hotStreak: 6, maxRows: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'spotlight',
    bounds: { idleThreshold: [2, 20], hotStreak: [2, 30], maxRows: [8, 64] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { notes: 0, seals: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().spotlight; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function pendingRound() { const m = state().spotlight; return (m && Array.isArray(m.pending)) ? m.pending : []; }
  /**
   * 登记登场：本轮 who 在场（幂等——同一轮重复登记不重复计数）。
   * 返回值带 already 标记：调用方可以知道「这是本轮第一次还是重复登记」。
   */
  function note(who) {
    const w = clean(who, 40);
    if (!w) { noteFault('bad-who'); return { ok: false, reason: 'bad-who' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.spotlight = draft.spotlight && typeof draft.spotlight === 'object' && !Array.isArray(draft.spotlight) ? draft.spotlight : { rows: [], pending: [] };
      draft.spotlight.rows = Array.isArray(draft.spotlight.rows) ? draft.spotlight.rows : [];
      draft.spotlight.pending = Array.isArray(draft.spotlight.pending) ? draft.spotlight.pending : [];
      if (draft.spotlight.pending.indexOf(w) >= 0) { out = { ok: true, who: w, already: true, pending: draft.spotlight.pending.length }; return; }
      const pendCap = settings().maxRows;
      if (draft.spotlight.pending.length >= pendCap) { out = { ok: false, reason: 'pending-full', who: w, cap: pendCap }; return false; }
      draft.spotlight.pending.push(w);
      if (WA.evict) WA.evict.array(draft.spotlight.pending, 'spotlight.pending', pendCap);
      out = { ok: true, who: w, already: false, pending: draft.spotlight.pending.length };
    }, 'spotlight:note');
    if (out && out.ok) { if (out.reason !== 'disabled' && !out.already) stat.notes++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'noted'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 结算轮次：本轮登记者 seen+1（连续在场 streak+1、missed 清零）；
   * 其余已建档者 missed+1（streak 清零）。本轮没人登记 ⇒ empty-round（不进历史）。
   */
  function seal() {
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.spotlight = draft.spotlight && typeof draft.spotlight === 'object' && !Array.isArray(draft.spotlight) ? draft.spotlight : { rows: [], pending: [] };
      draft.spotlight.rows = Array.isArray(draft.spotlight.rows) ? draft.spotlight.rows : [];
      draft.spotlight.pending = Array.isArray(draft.spotlight.pending) ? draft.spotlight.pending : [];
      if (WA.evict) WA.evict.array(draft.spotlight.pending, 'spotlight.pending', settings().maxRows);
      const pend = draft.spotlight.pending.slice();
      if (!pend.length) { out = { ok: false, reason: 'empty-round' }; return false; }
      const known = {};
      draft.spotlight.rows.forEach(function (r) { if (r && r.who) known[r.who] = r; });
      pend.forEach(function (w) {
        let r = known[w];
        if (!r) {
          const cap = settings().maxRows;
          if (draft.spotlight.rows.length >= cap) return;   // 容量已满：新人不建档（旧档不受影响）
          r = { who: w, seen: 0, missed: 0, streak: 0, at: clockNow('spotlight') };
          draft.spotlight.rows.push(r);
          known[w] = r;
        }
        r.seen = (r.seen || 0) + 1;
        r.streak = (r.streak || 0) + 1;
        r.missed = 0;
        r.at = clockNow('spotlight');
      });
      draft.spotlight.rows.forEach(function (r) {
        if (!r || pend.indexOf(r.who) >= 0) return;
        r.missed = (r.missed || 0) + 1;
        r.streak = 0;
      });
      if (WA.evict) WA.evict.array(draft.spotlight.rows, 'spotlight.rows');
      draft.spotlight.pending = [];
      out = { ok: true, round: pend.slice(), total: draft.spotlight.rows.length };
    }, 'spotlight:seal');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.seals++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'sealed'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读数：全档（seen/missed/streak），按 streak 降序。未启用返回 disabled。 */
  function report() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled' };
    const list = rows().map(function (r) { return { who: r.who, seen: r.seen || 0, missed: r.missed || 0, streak: r.streak || 0 }; });
    list.sort(function (a, b) { return b.streak - a.streak || b.seen - a.seen; });
    return { ok: true, rows: list, pending: pendingRound().slice() };
  }
  /** 久缺名单：missed >= 阈值的人（从未登记的人不出现在这里）。 */
  function idle(threshold) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled', rows: [] };
    const t = Number(threshold);
    const th = isFinite(t) && t > 0 ? Math.floor(t) : cfg.idleThreshold;
    const list = rows().filter(function (r) { return (r.missed || 0) >= th; })
      .map(function (r) { return { who: r.who, missed: r.missed, seen: r.seen || 0 }; });
    list.sort(function (a, b) { return b.missed - a.missed; });
    return { ok: true, threshold: th, rows: list };
  }
  /** 注入块：久缺 + 过热 + 均衡铁律（零 token：关闭或无档案时返回空串）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const all = rows();
    if (!all.length) return '';
    const idleList = all.filter(function (r) { return (r.missed || 0) >= cfg.idleThreshold; })
      .sort(function (a, b) { return b.missed - a.missed; }).slice(0, 4);
    const hotList = all.filter(function (r) { return (r.streak || 0) >= cfg.hotStreak; })
      .sort(function (a, b) { return b.streak - a.streak; }).slice(0, 3);
    const lines = ['[焦点分配] 登场均衡读数：'];
    if (idleList.length) lines.push('· 久未登场：' + idleList.map(function (r) { return r.who + '（缺 ' + r.missed + ' 轮）'; }).join('、'));
    if (hotList.length) lines.push('· 连续在场：' + hotList.map(function (r) { return r.who + '（连 ' + r.streak + ' 轮）'; }).join('、'));
    lines.push('均衡铁律：各角色有自己的事务与目的，不强制人人表态，也不让配角只负责附和；镜头外的角色可以继续与主线无关的活动，交集必须具有合理的因果来源。');
    return lines.join('\n') + '\n';
  }
  WA.spotlight = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    note: note, seal: seal, report: report, idle: idle, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();