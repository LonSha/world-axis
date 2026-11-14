/**
 * WorldAxis engines/shadow-council.js (v2.408.0) — EXV23-7 影子议会、潜伏暗桩与双面谍报契约
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G5 实测：谍报系统缺乏双重效忠度（allegianceSplit）、暗室死信箱（dead-drop）、
 *   密语暗号单向异步投递与被动反噬灭口自毁机制。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `shadowCouncil.infiltrateAgent` 派遣潜伏暗桩，设定公开掩护身份与影子阵营效忠分化；
 *   `shadowCouncil.dropDeadLetter` 在隐蔽点异步投递密信；
 *   `shadowCouncil.triggerSanitization` 暴露度超限时执行紧急灭口自毁。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 严禁在公开集市或未建立暗桩死信箱的地点投递密信（refusal: dead-drop-unestablished）。
 *   ② 效忠度必须归一化且不可凭空捏造不存在的影子派系。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_shadow_council_settings_v1';
  const DEF = {
    enabled: true,
    exposureThreshold: 80
  };

  const __REG = {
    key: 'shadowCouncil',
    name: '影子潜伏与双面谍报 (EXV23-7)',
    desc: '双重效忠、死信箱异步暗号与潜伏自毁灭口契约',
    settingsKey: LS_KEY,
    schema: {
      enabled: { type: 'boolean', default: true },
      exposureThreshold: { type: 'number', default: 80 }
    }
  };

  let STATE = null;

  let stat = null;

  function settings() {
    // v2.408.0（OPV23-9 回归逮到）：本函数此前调 `WA.settingsBus.getModuleSettings(key, DEF)` ——
    //   该成员在 settingsBus 的真实导出面上**不存在**（真实读口是 `read(reg)`）。
    //   因为带 `typeof === 'function'` 守卫，调用**静默落空**：本引擎的开关恒等于 DEF，
    //   「关闭引擎」这件事在宿主里从来没生效过。它是 HEAD 上就存在的预存缺陷
    //   （tests/gates.js / member-surface-gate / settings-bus-api-gate 三处同时点名），
    //   不是本批引入；本批按既有库内口径修正（与 engines/affect.js 逐字同规）。
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }

  function clockNow() {
    if (WA.clock && typeof WA.clock.now === 'function') return WA.clock.now();
    return Date.now();
  }

  function establishDeadDrop(dropPointId) {
    if (!dropPointId) return { ok: false, refusal: 'missing-drop-point' };
    if (!STATE.deadDrops[dropPointId]) STATE.deadDrops[dropPointId] = [];
    return { ok: true, dropPointId: dropPointId };
  }

  function infiltrateAgent(agentId, shadowFaction, spec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, refusal: 'shadow-council-disabled' };
    if (!agentId || !shadowFaction) return { ok: false, refusal: 'missing-agent-spec' };

    const s = spec || {};
    STATE.agents[agentId] = {
      id: agentId,
      shadowFaction: shadowFaction,
      coverRole: s.coverRole || 'civil-servant',
      loyaltyToShadow: Math.max(0, Math.min(100, Number(s.loyalty) || 75)),
      exposureRisk: 0,
      active: true
    };
    stat.agentsInfiltrated++;

    return {
      ok: true,
      agentId: agentId,
      shadowFaction: shadowFaction,
      coverRole: STATE.agents[agentId].coverRole,
      at: clockNow()
    };
  }

  function dropDeadLetter(dropPointId, cipherPayload, fromAgentId) {
    if (!dropPointId || !STATE.deadDrops[dropPointId]) {
      return {
        ok: false,
        refusal: 'dead-drop-unestablished',
        hint: '指定地点未建立隐秘死信箱机制，禁止公开投递最高机密密信'
      };
    }
    if (!cipherPayload) return { ok: false, refusal: 'empty-cipher-payload' };

    const letterId = 'ltr_' + Math.random().toString(36).slice(2, 9);
    const letter = {
      letterId: letterId,
      cipher: cipherPayload,
      fromAgent: fromAgentId || 'anonymous',
      at: clockNow()
    };
    STATE.deadDrops[dropPointId].push(letter);
    stat.lettersDropped++;

    if (fromAgentId && STATE.agents[fromAgentId]) {
      STATE.agents[fromAgentId].exposureRisk = Math.min(100, STATE.agents[fromAgentId].exposureRisk + 15);
    }

    return {
      ok: true,
      dropPointId: dropPointId,
      letterId: letterId,
      at: letter.at
    };
  }

  function retrieveDeadLetters(dropPointId) {
    if (!dropPointId || !STATE.deadDrops[dropPointId]) {
      return { ok: false, refusal: 'dead-drop-unestablished' };
    }
    const letters = STATE.deadDrops[dropPointId].slice();
    STATE.deadDrops[dropPointId] = [];
    stat.lettersRetrieved += letters.length;
    return { ok: true, dropPointId: dropPointId, count: letters.length, letters: letters };
  }

  function triggerSanitization(agentId) {
    const ag = STATE.agents[agentId];
    if (!ag) return { ok: false, refusal: 'agent-not-found' };

    ag.active = false;
    stat.sanitizations++;
    return {
      ok: true,
      agentId: agentId,
      status: 'sanitized',
      hint: '暗桩身份被影子议会紧急灭口/自毁撤离，档案封存',
      at: clockNow()
    };
  }

  function reset() {
    STATE.agents = {};
    STATE.deadDrops = {};
    stat.agentsInfiltrated = 0;
    stat.lettersDropped = 0;
    stat.lettersRetrieved = 0;
    stat.sanitizations = 0;
    return { ok: true };
  }

  function ownerCall(fn, args, readOnly) {
    if (!WA.store || typeof WA.store.withOwnerState !== 'function') return { ok: false, refusal: 'owner-store-unavailable' };
    return WA.store.withOwnerState('shadowCouncil', function (owned) {
      const prevState = STATE, prevStat = stat;
      STATE = owned; stat = owned._stats;
      try { return fn.apply(null, args); }
      finally { STATE = prevState; stat = prevStat; }
    }, { readOnly: readOnly });
  }

  WA.shadowCouncil = {
    establishDeadDrop: function () { return ownerCall(establishDeadDrop, arguments, false); },
    infiltrateAgent: function () { return ownerCall(infiltrateAgent, arguments, false); },
    dropDeadLetter: function () { return ownerCall(dropDeadLetter, arguments, false); },
    retrieveDeadLetters: function () { return ownerCall(retrieveDeadLetters, arguments, false); },
    triggerSanitization: function () { return ownerCall(triggerSanitization, arguments, false); },
    reset: function () { return ownerCall(reset, arguments, false); },
    getSettings: settings
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/shadow-council.js', { kind: 'engine', ver: '2.408.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/shadow-council 已加载（2.408.0）');
  }
})();