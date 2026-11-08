/**
 * WorldAxis engines/psyche-trauma.js (v2.340.0)
 * EXV17-2: 深层心智创伤、执念与精神失常心理学引擎 (Psyche Trauma & Mental Defense Dynamics)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用深层心理防御机制与精神演化模型。不硬编码具体题材，无论是修仙心魔渡劫、
 * 西幻克苏鲁理智判定（SAN Check）、赛博精神病狂暴、还是现实战争创伤后应激障碍（PTSD），
 * 统一抽象为四个通用心理学指标：
 *  1. sanityIndex: 心智稳定性/理智值 (0~100, 默认100)
 *  2. traumaLevel: 累积创伤深度 (0~100, 默认0)
 *  3. obsessionRating: 偏执执念强度 (0~100, 默认0)
 *  4. mentalState: 当前精神相态:
 *     - 'sound' (心智健全)
 *     - 'distressed' (焦虑应激)
 *     - 'cognitive_dissonance' (认知失调/否认现实)
 *     - 'obsessive_fixation' (偏执妄想/执念牢笼)
 *     - 'blackening' (心智黑化/阵营反转/狂热复仇)
 *     - 'psychic_collapse' (精神崩溃/意志瓦解)
 *
 * 核心方法：
 *  - registerActorPsyche(actorId, opts)
 *  - inflictTrauma(actorId, shockLevel, traumaType, sourceId, opts)
 *  - triggerBlackening(actorId, obsessionTarget, cause)
 *  - soothePsyche(actorId, soothePower, method)
 *  - getActorPsyche(actorId)
 *  - resetAll()
 *  - diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.340.0';

  const VALID_TRAUMA_TYPES = Object.freeze([
    'betrayal',       // 背叛出卖
    'bereavement',    // 丧亲剧痛
    'mutilation',     // 残疾毁伤
    'atrocity_witness', // 目睹惨剧
    'faith_collapse', // 信仰崩溃
    'existential_dread' // 终极恐惧/不可名状
  ]);

  // 角色心智存储: Map<actorId, { sanityIndex, traumaLevel, obsessionRating, mentalState, obsessionTarget, traumaHistory, immune, willpowerThreshold }>
  const _psycheRegistry = new Map();

  function registerActorPsyche(actorId, opts) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    const opt = opts || {};
    const record = {
      actorId: actorId,
      sanityIndex: typeof opt.sanityIndex === 'number' ? Math.max(0, Math.min(100, opt.sanityIndex)) : 100.0,
      traumaLevel: typeof opt.traumaLevel === 'number' ? Math.max(0, Math.min(100, opt.traumaLevel)) : 0.0,
      obsessionRating: typeof opt.obsessionRating === 'number' ? Math.max(0, Math.min(100, opt.obsessionRating)) : 0.0,
      mentalState: opt.mentalState || 'sound',
      obsessionTarget: opt.obsessionTarget || null,
      immune: opt.immune === true || opt.stoicSage === true, // 圣贤/道心豁免
      willpowerThreshold: typeof opt.willpowerThreshold === 'number' ? opt.willpowerThreshold : 60.0,
      traumaHistory: Array.isArray(opt.traumaHistory) ? opt.traumaHistory : [],
      updatedAt: Date.now()
    };
    _psycheRegistry.set(actorId, record);
    return { ok: true, actorId: actorId, record: record };
  }

  function getActorPsyche(actorId) {
    if (!actorId || !_psycheRegistry.has(actorId)) {
      // 惰性默认注册
      registerActorPsyche(actorId, {});
    }
    return _psycheRegistry.get(actorId);
  }

  /**
   * 遭受精神创伤冲击
   */
  function inflictTrauma(actorId, shockLevel, traumaType, sourceId, opts) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    const numShock = Number(shockLevel);
    if (isNaN(numShock) || numShock <= 0) {
      return { ok: false, error: 'invalid_shock_level' };
    }
    const profile = getActorPsyche(actorId);

    // 豁免检查 (负控制硬断言)
    if (profile.immune) {
      return {
        ok: false,
        error: 'psychic_immune_blocked',
        actorId: actorId,
        reason: 'actor_possesses_stoic_sage_or_psychic_immunity'
      };
    }

    const type = VALID_TRAUMA_TYPES.includes(traumaType) ? traumaType : 'betrayal';
    const opt = opts || {};

    // 冲击计算：理智值削减，创伤深度累积
    const effectiveShock = Math.max(1, Math.round(numShock));
    profile.sanityIndex = Math.max(0, profile.sanityIndex - effectiveShock * 0.8);
    profile.traumaLevel = Math.min(100, profile.traumaLevel + effectiveShock);
    profile.obsessionRating = Math.min(100, profile.obsessionRating + effectiveShock * 0.6);

    // 记录创伤历史
    profile.traumaHistory.push({
      type: type,
      shock: effectiveShock,
      sourceId: sourceId || 'unknown_origin',
      timestamp: Date.now()
    });

    // 状态转移判定
    if (profile.sanityIndex <= 0) {
      profile.mentalState = 'psychic_collapse';
    } else if (profile.traumaLevel >= 80 && profile.obsessionRating >= 70) {
      profile.mentalState = 'blackening';
      profile.obsessionTarget = sourceId || opt.target || 'world_vengeance';
    } else if (profile.traumaLevel >= 60) {
      profile.mentalState = 'obsessive_fixation';
    } else if (profile.traumaLevel >= 30) {
      profile.mentalState = 'cognitive_dissonance';
    } else if (profile.traumaLevel > 0) {
      profile.mentalState = 'distressed';
    }

    profile.updatedAt = Date.now();

    return {
      ok: true,
      actorId: actorId,
      traumaType: type,
      shockApplied: effectiveShock,
      currentSanity: profile.sanityIndex,
      currentTrauma: profile.traumaLevel,
      currentObsession: profile.obsessionRating,
      mentalState: profile.mentalState
    };
  }

  /**
   * 强制或自发触发黑化质变
   */
  function triggerBlackening(actorId, obsessionTarget, cause) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    const profile = getActorPsyche(actorId);

    // 负控制门禁：若具备免疫或创伤未达标（traumaLevel < 50 且 obsession < 50），严禁无凭据黑化
    if (profile.immune) {
      return { ok: false, error: 'blocked_by_immunity' };
    }
    if (profile.traumaLevel < 50 && profile.obsessionRating < 50) {
      return {
        ok: false,
        error: 'insufficient_trauma_precondition',
        currentTrauma: profile.traumaLevel,
        threshold: 50
      };
    }

    profile.mentalState = 'blackening';
    profile.obsessionTarget = obsessionTarget || 'nemesis';
    profile.sanityIndex = Math.min(profile.sanityIndex, 30);
    profile.obsessionRating = Math.max(profile.obsessionRating, 85);
    profile.updatedAt = Date.now();

    return {
      ok: true,
      actorId: actorId,
      mentalState: 'blackening',
      obsessionTarget: profile.obsessionTarget,
      cause: cause || 'unbearable_despair'
    };
  }

  /**
   * 心理抚慰与冥想自愈
   */
  function soothePsyche(actorId, soothePower, method) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    const power = Number(soothePower);
    if (isNaN(power) || power <= 0) {
      return { ok: false, error: 'invalid_soothe_power' };
    }
    const profile = getActorPsyche(actorId);

    // 若已彻底心智崩溃或极度黑化，低强度抚慰无法逆转
    if (profile.mentalState === 'blackening' && power < 50) {
      return {
        ok: false,
        error: 'deep_blackening_resists_weak_soothe',
        actorId: actorId,
        powerRequired: 50
      };
    }

    profile.sanityIndex = Math.min(100, profile.sanityIndex + power);
    profile.traumaLevel = Math.max(0, profile.traumaLevel - power * 0.7);
    profile.obsessionRating = Math.max(0, profile.obsessionRating - power * 0.5);

    // 降级恢复
    if (profile.traumaLevel < 20 && profile.sanityIndex > 70) {
      profile.mentalState = 'sound';
      if (profile.mentalState !== 'blackening') {
        profile.obsessionTarget = null;
      }
    } else if (profile.traumaLevel < 40) {
      profile.mentalState = 'distressed';
    }

    profile.updatedAt = Date.now();

    return {
      ok: true,
      actorId: actorId,
      method: method || 'meditation',
      currentSanity: profile.sanityIndex,
      currentTrauma: profile.traumaLevel,
      mentalState: profile.mentalState
    };
  }

  function resetAll() {
    _psycheRegistry.clear();
    return { ok: true, cleared: true };
  }

  function diagnose() {
    const list = [];
    for (const [id, rec] of _psycheRegistry.entries()) {
      list.push({
        actorId: id,
        sanity: rec.sanityIndex,
        trauma: rec.traumaLevel,
        obsession: rec.obsessionRating,
        state: rec.mentalState,
        immune: rec.immune
      });
    }
    return {
      version: VERSION,
      totalTracked: _psycheRegistry.size,
      actors: list
    };
  }

  const api = {
    VERSION: VERSION,
    VALID_TRAUMA_TYPES: VALID_TRAUMA_TYPES,
    registerActorPsyche: registerActorPsyche,
    getActorPsyche: getActorPsyche,
    inflictTrauma: inflictTrauma,
    triggerBlackening: triggerBlackening,
    soothePsyche: soothePsyche,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.engines.psycheTrauma = api;
  WA.psycheTrauma = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
