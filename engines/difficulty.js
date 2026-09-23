/**
 * WorldAxis engines/difficulty.js (v2.65.0)
 * 世界难度档：三个可落盘的全局参数，分别喂给因果、态度与时间流速。
 *
 * 缝合来源：真实的世界 v0.46「世界难度调整」五档。只取其中三档，且改写口径：
 *   · 行动阻力（resistance）：行动要多消耗多少成本，喂给 causal。
 *   · 居民初始态度（stance）：新登场者的起始态度，喂给 opinion。
 *   · 时间流速（pace）：世界钟跨度的乘数，喂给 calendar。
 * 不做「心想事成」：概率扭曲与本仓库的因果纪律冲突，故该源的「关联度」档不收。
 *
 * 边界：
 *   1 总开关默认关闭。关闭时三个查询都回落成中性值（阻力 1、态度 neutral、流速 1），
 *     且回报 reason:'disabled'——调用方必须能区分「用户选了中性」与「模块没开」。
 *   2 非法枚举不落盘。setProfile 遇到白名单之外的值，整次写入拒收（bad-enum），
 *     不得只收下合法的那一半、把非法的那一半静默丢掉。
 *   3 三档各自独立：改阻力不得顺便改态度或流速。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_difficulty_settings_v1';
  const RESISTANCE = ['easy', 'normal', 'hard'];
  const STANCE = ['hostile', 'neutral', 'friendly'];
  const PACE = ['slow', 'normal', 'fast'];
  const DEF = { enabled: false, resistance: 'normal', stance: 'neutral', pace: 'normal' };
  const __REG = { key: LS_KEY, def: DEF, module: 'difficulty',
    enums: { resistance: RESISTANCE, stance: STANCE, pace: PACE } };
  const COST = { easy: 0.5, normal: 1, hard: 2 };
  const FLOW = { slow: 0.5, normal: 1, fast: 2 };
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

  /**
   * 整次写入。任一档非法，整次拒收且不改动已有值。
   * 为什么不借 settingsBus.normalize 的「非法值回落默认」：那会把用户的错误输入静默改成中性值，
   * 而用户看到的仍是「已保存」。这里要的是明确的拒绝。
   */
  function setProfile(patch) {
    const p = patch || {};
    const bad = [];
    if ('resistance' in p && RESISTANCE.indexOf(p.resistance) < 0) bad.push('resistance');
    if ('stance' in p && STANCE.indexOf(p.stance) < 0) bad.push('stance');
    if ('pace' in p && PACE.indexOf(p.pace) < 0) bad.push('pace');
    if (bad.length) { noteFault('bad-enum'); return { ok: false, reason: 'bad-enum', fields: bad }; }
    const next = Object.assign({}, settings(), p);
    const saved = saveSettings(next);
    if (saved && saved.ok === false) { noteFault(saved.reason || 'save-failed'); return saved; }
    stat.sets++; stat.lastReason = 'set';
    return { ok: true, profile: effective() };
  }

  /** 关闭时回落中性值，但 reason 写明 disabled，与「用户主动选了中性」可区分。 */
  function effective() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, enabled: false, cost: 1, stance: 'neutral', flow: 1, reason: 'disabled' };
    return { ok: true, enabled: true,
      resistance: cfg.resistance, cost: COST[cfg.resistance],
      stance: cfg.stance, pace: cfg.pace, flow: FLOW[cfg.pace] };
  }

  /** 行动成本换算。关闭时原样返回并写明理由，不静默折扣。 */
  function actionCost(base) {
    const n = Number(base);
    if (!isFinite(n) || n < 0) { noteFault('bad-cost'); return { ok: false, reason: 'bad-cost' }; }
    const e = effective();
    return { ok: true, base: n, cost: e.cost, value: Math.ceil(n * e.cost), reason: e.reason || 'applied' };
  }

  /** 时间跨度换算（分钟）。供 calendar 消费：慢流速把一天拉长，快流速压缩。 */
  function spanMinutes(minutes) {
    const n = Number(minutes);
    if (!isFinite(n) || n < 0) { noteFault('bad-minutes'); return { ok: false, reason: 'bad-minutes' }; }
    const e = effective();
    return { ok: true, base: n, flow: e.flow, minutes: Math.ceil(n * e.flow), reason: e.reason || 'applied' };
  }

  function buildBlock() {
    const e = effective();
    if (!e.enabled) return '';
    return '[世界难度]\n'
      + '行动阻力：' + e.resistance + '（成本 ×' + e.cost + '）\n'
      + '居民初始态度：' + e.stance + '\n'
      + '时间流速：' + e.pace + '（跨度 ×' + e.flow + '）\n'
      + '难度改变的是成本、态度与时间跨度，不改变概率：不得把「想要」写成「会发生」。\n';
  }

  WA.difficulty = {
    RESISTANCE: RESISTANCE, STANCE: STANCE, PACE: PACE, COST: COST, FLOW: FLOW,
    getSettings: settings, setSettings: function (patch) { return setProfile(patch || {}); },
    setProfile: setProfile, effective: effective, actionCost: actionCost, spanMinutes: spanMinutes,
    buildBlock: buildBlock, stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
