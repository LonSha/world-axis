/**
 * WorldAxis engines/affect.js (v2.66.0)
 * 情绪通道：输出开放动作、硬关闭动作和过载回退，不输出情绪词。
 *
 * 缝合来源：4.4「情绪通道」。那一条是给模型的描写指令；本模块只取结算含义：
 *   一个角色此刻能被看见的，是动作，不是「他很生气」这种词。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 channel() 返回 reason:'disabled'，不给动作，也不猜一个。
 *   2 情绪词不进任何出口。setChannel 若把词写进 open/closed/fallback，整次拒收（emotion-word）。
 *   3 开放通道与硬关闭通道不得相交。相交整次拒收（overlap），不留下「一半合法」。
 *   4 过载回退必须是已登记的开放动作之一。不在开放表里的回退等于凭空造行为（bad-fallback）。
 *   5 调制量（疲惫/饥饿/疼痛/社交消耗）只改变开放通道的可见条数，不改变动作本身，也不产生情绪词。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_affect_settings_v1';
  const DEF = { enabled: false, maxOpen: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'affect', bounds: { maxOpen: [1, 3] } };
  const WORDS = ['愤怒', '悲伤', '喜悦', '恐惧', '厌恶', '焦虑', '绝望', '崩溃', '开心', '难过', '生气', '害怕'];
  const LOADS = ['fatigue', 'hunger', 'pain', 'social'];
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
  function rows() { const a = state().affect; return (a && Array.isArray(a.channels)) ? a.channels : []; }
  function loadsOf(root) { const a = (root || state()).affect; return (a && a.loads && typeof a.loads === 'object') ? a.loads : {}; }
  function hasWord(text) {
    const s = String(text || '');
    for (let i = 0; i < WORDS.length; i++) { if (s.indexOf(WORDS[i]) >= 0) return WORDS[i]; }
    return '';
  }
  function acts(list) {
    const out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (x) {
      const t = clean(x, 40);
      if (!t || seen[t]) return;
      seen[t] = true; out.push(t);
    });
    return out.slice(0, 3);
  }
  /** 登记一条通道。情绪词、相交、非法回退都整次拒收，不改已有行。 */
  function setChannel(person, spec) {
    const who = clean(person, 40);
    const p = spec || {};
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const open = acts(p.open), closed = acts(p.closed), fallback = clean(p.fallback, 40);
    if (!open.length || !closed.length || !fallback) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const blob = open.concat(closed).concat([fallback]).join(' ');
    const word = hasWord(blob);
    if (word) { noteFault('emotion-word'); return { ok: false, reason: 'emotion-word', word: word }; }
    const overlap = open.filter(function (x) { return closed.indexOf(x) >= 0; });
    if (overlap.length) { noteFault('overlap'); return { ok: false, reason: 'overlap', actions: overlap }; }
    if (open.indexOf(fallback) < 0) { noteFault('bad-fallback'); return { ok: false, reason: 'bad-fallback', fallback: fallback }; }
    let out = null;
    WA.store.transact(function (draft) {
      draft.affect = draft.affect && typeof draft.affect === 'object' && !Array.isArray(draft.affect) ? draft.affect : { channels: [], loads: {} };
      draft.affect.channels = Array.isArray(draft.affect.channels) ? draft.affect.channels : [];
      const hit = draft.affect.channels.filter(function (x) { return x && x.person === who; })[0];
      const row = { person: who, open: open, closed: closed, fallback: fallback, at: clockNow('affect') };
      if (hit) { hit.open = open; hit.closed = closed; hit.fallback = fallback; hit.at = row.at; out = { ok: true, person: who, existed: true }; return; }
      draft.affect.channels.push(row);
      WA.evict.array(draft.affect.channels, 'affect.channels');
      out = { ok: true, person: who, existed: false };
    }, 'affect:set');
    if (out && out.ok) { stat.sets++; stat.lastReason = out.existed ? 'updated' : 'set'; } else noteFault('store-unavailable');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 调制量。只收 0..3 的四项，非法整次拒收。它不产生动作，也不产生情绪词。 */
  function setLoad(person, patch) {
    const who = clean(person, 40);
    const p = patch || {};
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const bad = [];
    const next = {};
    LOADS.forEach(function (k) {
      if (!(k in p)) return;
      const n = Number(p[k]);
      if (!isFinite(n) || n < 0 || n > 3 || Math.floor(n) !== n) bad.push(k);
      else next[k] = n;
    });
    if (bad.length) { noteFault('bad-load'); return { ok: false, reason: 'bad-load', fields: bad }; }
    if (!Object.keys(next).length) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      draft.affect = draft.affect && typeof draft.affect === 'object' && !Array.isArray(draft.affect) ? draft.affect : { channels: [], loads: {} };
      draft.affect.loads = draft.affect.loads && typeof draft.affect.loads === 'object' ? draft.affect.loads : {};
      const cur = draft.affect.loads[who] && typeof draft.affect.loads[who] === 'object' ? draft.affect.loads[who] : {};
      draft.affect.loads[who] = Object.assign({ fatigue: 0, hunger: 0, pain: 0, social: 0 }, cur, next);
      draft.affect.loads[who].at = clockNow('affect');
      // v2610 [A] 门：对象型站点的淘汰调用点必须自报排序键（按登记时间最旧优先挤出）。
      const lk = Object.keys(draft.affect.loads);
      lk.sort(function (a, b) { return (((draft.affect.loads[a] || {}).at) || 0) - (((draft.affect.loads[b] || {}).at) || 0); });
      WA.evict.object(draft.affect.loads, 'affect.loads', lk);
      out = { ok: true, person: who, load: Object.assign({}, draft.affect.loads[who]) };
    }, 'affect:load');
    if (out && out.ok) { stat.sets++; stat.lastReason = 'load'; } else noteFault('store-unavailable');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function loadSum(who) {
    const row = loadsOf()[who] || {};
    return LOADS.reduce(function (n, k) { return n + (Number(row[k]) || 0); }, 0);
  }
  /**
   * 读通道。关闭时不给动作。过载（四项之和 ≥ 6）时开放通道收成只剩回退那一条，
   * 硬关闭通道原样保留——过载不是放行禁区的理由。
   */
  function channel(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, person: who, open: [], closed: [], fallback: '', reason: 'disabled' };
    const hit = rows().filter(function (x) { return x && x.person === who; })[0];
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', person: who }; }
    const sum = loadSum(who);
    const open = sum >= 6 ? [hit.fallback] : hit.open.slice();
    return { ok: true, person: who, open: open, closed: hit.closed.slice(), fallback: hit.fallback, overloaded: sum >= 6, load: sum, reason: sum >= 6 ? 'overloaded' : 'applied' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(0, Math.max(1, cfg.maxOpen));
    if (!list.length) return '';
    const lines = list.map(function (x) {
      const c = channel(x.person);
      return x.person + '：可做 ' + c.open.join('、') + '；不做 ' + c.closed.join('、') + (c.overloaded ? '；过载回退 ' + c.fallback : '');
    });
    return '[情绪通道]\n' + lines.join('\n') + '\n通道给出的是动作，不是情绪词；过载时退回已登记的那一个动作，不新造行为。\n';
  }
  WA.affect = {
    WORDS: WORDS.slice(), LOADS: LOADS.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    setChannel: setChannel, setLoad: setLoad, channel: channel,
    buildBlock: buildBlock, stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
