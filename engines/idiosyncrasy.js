/**
 * WorldAxis engines/idiosyncrasy.js (v2.306.0)
 * EXV13-7: 潜意识动作与下意识心理微反应（Subconscious Idiosyncrasy）
 *
 * 核心机制：
 *   1. 登记角色潜意识微反应模式（registerIdiosyncrasy）：
 *      将角色长期创伤或隐藏秘密绑定到特定情境/话题触发器（triggerTag）与下意识微动作（microBehavior）；
 *   2. 情境压力下下意识触发（triggerReaction）：
 *      当对话/质询涉及敏感话题或压力激增时，角色无法自控地流露生理微动作；
 *   3. 敏锐洞察侦测（observeSubconscious）：
 *      外部观察者在交互中敏锐捕捉到微动作破绽，进而推导或揭开潜在隐秘（leakedSecretKey）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };
  const LS_KEY = 'worldaxis_idiosyncrasy_settings_v1';
  const DEF = { enabled: true, defaultSensitivity: 0.65, maxPerActor: 10 };
  const __REG = { key: LS_KEY, def: DEF, module: 'idiosyncrasy', bounds: {} };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }
  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }
  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  const _stat = {
    registered: 0,
    triggered: 0,
    observed: 0,
    refused: 0,
    lastReason: ''
  };

  /**
   * 1. 登记角色潜意识微反应模式
   */
  function registerIdiosyncrasy(actorId, spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      _stat.refused++;
      _stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const aid = clean(actorId, 40);
    spec = spec || {};
    const triggerTag = clean(spec.triggerTag || spec.trigger, 40);
    const microBehavior = clean(spec.microBehavior || spec.behavior, 120);
    const leakedSecretKey = clean(spec.leakedSecretKey || spec.secretKey || spec.secret, 60);

    if (!aid || !triggerTag || !microBehavior) {
      _stat.refused++;
      _stat.lastReason = 'missing-params';
      return { ok: false, reason: 'missing-params' };
    }

    let out = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        draft.people = draft.people || {};
        const pKey = draft.people[aid] ? aid : (draft.people['p_' + aid] ? 'p_' + aid : aid);
        draft.people[pKey] = draft.people[pKey] || { id: pKey, name: aid, resources: {}, life: {} };
        const p = draft.people[pKey];
        p.idiosyncrasies = Array.isArray(p.idiosyncrasies) ? p.idiosyncrasies : [];

        // 避免重复登记同类触发标签
        const existingIdx = p.idiosyncrasies.findIndex(x => x.triggerTag === triggerTag);
        const record = {
          id: 'idio_' + aid + '_' + triggerTag.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          triggerTag: triggerTag,
          microBehavior: microBehavior,
          leakedSecretKey: leakedSecretKey || null,
          stressThreshold: Number(spec.stressThreshold != null ? spec.stressThreshold : 30),
          involuntary: spec.involuntary !== false,
          registeredAt: clockNow('idiosyncrasy')
        };

        if (existingIdx >= 0) {
          p.idiosyncrasies[existingIdx] = record;
        } else {
          p.idiosyncrasies.push(record);
          if (p.idiosyncrasies.length > cfg.maxPerActor) p.idiosyncrasies.shift();
        }

        _stat.registered++;
        out = {
          ok: true,
          actorId: aid,
          idiosyncrasy: record,
          total: p.idiosyncrasies.length
        };
      }, 'idiosyncrasy:register');
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 2. 情境/话题压力匹配与微动作触发
   */
  function triggerReaction(actorId, context) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const aid = clean(actorId, 40);
    context = context || {};
    const topic = clean(context.topic || context.tag, 40);
    const s = state();
    const p = (s.people && (s.people[aid] || s.people['p_' + aid])) || null;
    if (!p || !Array.isArray(p.idiosyncrasies) || p.idiosyncrasies.length === 0) {
      return { ok: true, triggered: false, reason: 'no-idiosyncrasies' };
    }

    const currentStress = Number(context.stress != null ? context.stress : (p.stress || 0));
    const matched = p.idiosyncrasies.filter(item => {
      const tagMatch = !topic || item.triggerTag.toLowerCase() === topic.toLowerCase() || (context.tags && context.tags.includes(item.triggerTag));
      const stressMatch = currentStress >= item.stressThreshold;
      return tagMatch && stressMatch;
    });

    if (matched.length === 0) {
      return { ok: true, triggered: false, reason: 'threshold-not-met' };
    }

    const selected = matched[0];
    _stat.triggered++;

    // 沉淀至短期遥测记录
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        const pKey = draft.people[aid] ? aid : (draft.people['p_' + aid] ? 'p_' + aid : aid);
        const target = draft.people[pKey];
        if (target) {
          target.recentMicroBehaviors = Array.isArray(target.recentMicroBehaviors) ? target.recentMicroBehaviors : [];
          target.recentMicroBehaviors.push({
            behavior: selected.microBehavior,
            triggerTag: selected.triggerTag,
            leakedSecretKey: selected.leakedSecretKey,
            at: clockNow('idiosyncrasy')
          });
          if (target.recentMicroBehaviors.length > 10) target.recentMicroBehaviors.shift();
        }
      }, 'idiosyncrasy:trigger');
    }

    return {
      ok: true,
      triggered: true,
      actorId: aid,
      behavior: selected.microBehavior,
      leakedSecretKey: selected.leakedSecretKey,
      involuntary: selected.involuntary
    };
  }

  /**
   * 3. 敏锐洞察侦测：观察者捕捉潜意识微破绽
   */
  function observeSubconscious(observerId, targetId, opts) {
    const cfg = settings();
    if (!cfg.enabled) {
      _stat.refused++;
      _stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const obsId = clean(observerId, 40);
    const tgtId = clean(targetId, 40);
    const o = opts || {};

    if (!obsId || !tgtId) {
      _stat.refused++;
      _stat.lastReason = 'missing-params';
      return { ok: false, reason: 'missing-params' };
    }

    // 先行评估目标是否在当前情境下触发了微反应
    const reaction = triggerReaction(tgtId, o);
    const s = state();
    const obs = (s.people && (s.people[obsId] || s.people['p_' + obsId])) || {};
    const insight = Number(o.insightScore != null ? o.insightScore : (obs.resources && obs.resources.insight ? obs.resources.insight : 50));

    _stat.observed++;
    if (!reaction.triggered) {
      return {
        ok: true,
        detected: false,
        observerId: obsId,
        targetId: tgtId,
        note: '目标神色如常，未流露异常微动作'
      };
    }

    // 观察力检定：若洞察力超过门槛，则洞悉弦外之音与隐秘线索
    const success = insight >= 40 || o.forceDetect;
    return {
      ok: true,
      detected: true,
      observerId: obsId,
      targetId: tgtId,
      microBehavior: reaction.behavior,
      secretKey: success ? reaction.leakedSecretKey : null,
      insightGrade: success ? 'acute_insight' : 'fleeting_impression',
      exposition: success
        ? '观察到「' + tgtId + '」流露出「' + reaction.behavior + '」，暴露了与「' + reaction.leakedSecretKey + '」相关的隐秘心防破绽！'
        : '察觉到「' + tgtId + '」有些坐立不安，但未完全摸清其缘由。'
    };
  }

  function stat() {
    return Object.assign({}, _stat);
  }
  function resetStat() {
    _stat.registered = 0;
    _stat.triggered = 0;
    _stat.observed = 0;
    _stat.refused = 0;
    _stat.lastReason = '';
  }
  function getSettings() {
    return settings();
  }
  function setSettings(patch) {
    if (WA.settingsBus) WA.settingsBus.write(__REG, patch);
  }

  WA.idiosyncrasy = {
    registerIdiosyncrasy: registerIdiosyncrasy,
    observeSubconscious: observeSubconscious
  };

  if (WA.log) WA.log('info', '潜意识动作与下意识心理微反应引擎已加载（v2.306.0）');
})();
