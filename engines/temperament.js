/**
 * WorldAxis engines/temperament.js (v2.67.0)
 * 双层性格：骨子里的底色 + 后天压出来的习惯；触发点让底色冒头。
 *
 * 缝合来源：《✵ 动态性格 [427]》——「角色必须区分出骨子里的底色，和后来被经历
 * 压出来的习惯。日常状态下由后天磨出的应对方式主导，到了某些触发点，原本的底色
 * 会突然冒头。」能落成引擎判据的是结构本身：两层都在场、二者不同、触发词登记在案。
 * 「语气随疲惫/饥饿变化」的量值面已由 affect.loads 承担，本模块不重复收编。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 read() 返回 reason:'disabled'。
 *   2 底色与习惯必须**同时在场**。缺任一层整次拒收（missing-fields）——
 *     只有一层就不是双层结构，是普通性格。
 *   3 二者必须**不同**。相同就是没分层（same-layer），拒收。
 *   4 底色冒头必须能指认触发：read() 带触发词时按登记的 triggers 匹配，
 *     命中才返回 base（底层主导）；未命中返回 habit（习惯主导）——顺序不能反。
 *   5 触发词表有界（per-person 最多 8 个），超容挤掉最旧（环形），不静默丢弃报错。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_temperament_settings_v1';
  const DEF = { enabled: false, maxRows: 12, maxTriggers: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'temperament', bounds: { maxRows: [2, 24], maxTriggers: [2, 16] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { sets: 0, reads: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().temperament; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  /**
   * 登记一个人的双层性格与触发词。两层缺一、两层相同都整次拒收。
   */
  function setTemperament(person, base, habit, triggers) {
    const who = clean(person, 40);
    const b = clean(base, 60), h = clean(habit, 60);
    if (!who || !b || !h) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (b === h) { noteFault('same-layer'); return { ok: false, reason: 'same-layer', person: who }; }
    const trg = Array.isArray(triggers) ? triggers.map(function (t) { return clean(t, 24); }).filter(Boolean) : [];
    let out = null;
    WA.store.transact(function (draft) {
      draft.temperament = draft.temperament && typeof draft.temperament === 'object' && !Array.isArray(draft.temperament) ? draft.temperament : { rows: [] };
      draft.temperament.rows = Array.isArray(draft.temperament.rows) ? draft.temperament.rows : [];
      const cap = Math.max(2, settings().maxTriggers);
      const hit = draft.temperament.rows.filter(function (r) { return r && r.person === who; })[0];
      const at = clockNow('temperament');
      if (hit) { hit.base = b; hit.habit = h; hit.triggers = trg.slice(-cap); hit.at = at; out = { ok: true, person: who, existed: true }; return; }
      draft.temperament.rows.push({ person: who, base: b, habit: h, triggers: trg.slice(-cap), at: at });
      if (WA.evict) WA.evict.array(draft.temperament.rows, 'temperament.rows');
      out = { ok: true, person: who, existed: false };
    }, 'temperament:set');
    if (out && out.ok) { stat.sets++; stat.lastReason = out.existed ? 'updated' : 'set'; } else noteFault('store-unavailable');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 读当前主导层。trigger 是本轮现场观察到的触发线索（可空）。
   * 未命中触发词返回 habit——日常由后天应对方式主导，这是本机制的默认态。
   */
  function read(person, trigger) {
    stat.reads++;
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, person: who, dominant: '', layer: '', reason: 'disabled' };
    const hit = rows().filter(function (r) { return r && r.person === who; })[0];
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', person: who }; }
    const cue = clean(trigger, 60);
    if (cue) {
      const fired = (hit.triggers || []).some(function (t) { return cue.indexOf(t) >= 0; });
      if (fired) return { ok: true, person: who, dominant: hit.base, layer: 'base', reason: 'trigger-fired' };
    }
    return { ok: true, person: who, dominant: hit.habit, layer: 'habit', reason: cue ? 'no-trigger' : 'default-habit' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) {
      return r.person + '：底色「' + r.base + '」/ 习惯「' + r.habit + '」（触发词：' + ((r.triggers || []).join('、') || '未登记') + '）';
    });
    return '[双层性格]\n' + lines.join('\n') + '\n日常由习惯主导；触发词在场时底色冒头，习惯让位——不是底色常驻。\n';
  }
  WA.temperament = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    setTemperament: setTemperament, read: read, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
