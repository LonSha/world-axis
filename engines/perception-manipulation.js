/**
 * WorldAxis engines/perception-manipulation.js (v2.340.0)
 * EXV17-8: 非对称认知战争与视界虚假现实投毒引擎 (Perception Manipulation & Cognitive Deception)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用有限视界与信息不对称欺骗模型。无论是谍战假情报诱敌、修仙幻阵制造伪相、
 * 赛博黑客数据投毒篡改监控、还是战场伪造败退佯动，统一抽象为四个要素：
 *  1. forgerId: 投毒施加者
 *  2. targetVictimId: 欺骗受害者
 *  3. illusionType: 假现实分类:
 *     - 'false_casualty' (虚假死讯/伤亡)
 *     - 'false_intel_retreat' (伪造撤退败象)
 *     - 'fabricated_scandal' (栽赃诬陷罪证)
 *     - 'phantom_distraction' (声东击西伪信号)
 *  4. credibilityScore: 可信度评分 (0~100) 与现场破绽判定
 *
 * 核心方法：
 *  - forgeIllusion(forgerId, targetVictimId, illusionType, payload, credibilityScore, opts)
 *  - verifyBelief(victimId, illusionId, currentWitnessContext)
 *  - unmaskIllusion(victimId, illusionId)
 *  - getVictimPerceptionMap(victimId)
 *  - resetAll()
 *  - diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.340.0';

  // 受害者认知地图: Map<victimId, Map<illusionId, { illusionId, forgerId, illusionType, payload, credibilityScore, unmasked, plantedAt }>>
  const _victimPerceptionMaps = new Map();

  function forgeIllusion(forgerId, targetVictimId, illusionType, payload, credibilityScore, opts) {
    if (typeof forgerId === 'object' && forgerId !== null) {
      const o = forgerId;
      return forgeIllusion(o.forgerId, o.targetVictimId, o.illusionType || 'false_intel', o.payload || { falseBeliefFact: o.falseBeliefFact }, o.credibilityScore, o.opts || o);
    }
    if (!forgerId || !targetVictimId) {
      return { ok: false, error: 'missing_forger_or_victim' };
    }
    const opt = opts || {};
    const cred = typeof credibilityScore === 'number' ? Math.max(0, Math.min(100, credibilityScore)) : 60;

    // 负控制拦截：受害者若身处第一现场且亲眼目睹真实事实，断言投毒直接被当场戳穿拒绝
    if (opt.victimIsDirectWitness === true) {
      return {
        ok: false,
        error: 'victim_is_direct_eyewitness_unmask_immediate',
        forgerId: forgerId,
        targetVictimId: targetVictimId,
        reason: 'direct_observation_rejects_illusion'
      };
    }

    if (!_victimPerceptionMaps.has(targetVictimId)) {
      _victimPerceptionMaps.set(targetVictimId, new Map());
    }
    const victimMap = _victimPerceptionMaps.get(targetVictimId);

    const illusionId = opt.illusionId || ('ill_' + clockNow('perception-manipulation') + '_' + Math.floor(WA.rand.next('perception-manipulation') * 1000));
    const record = {
      illusionId: illusionId,
      forgerId: forgerId,
      targetVictimId: targetVictimId,
      illusionType: illusionType || 'false_intel_retreat',
      payload: payload || {},
      credibilityScore: cred,
      unmasked: false,
      plantedAt: clockNow('perception-manipulation')
    };

    victimMap.set(illusionId, record);

    return {
      ok: true,
      illusionId: illusionId,
      forgerId: forgerId,
      targetVictimId: targetVictimId,
      illusionType: record.illusionType,
      credibilityScore: cred
    };
  }

  function verifyBelief(victimId, illusionId, currentWitnessContext) {
    if (!victimId || !_victimPerceptionMaps.has(victimId)) {
      return { ok: false, error: 'no_perception_map_for_victim' };
    }
    const map = _victimPerceptionMaps.get(victimId);
    let rec = map.get(illusionId);
    if (!rec) {
      // 容错：按 payload 内容或第一个 illusion 查找
      for (const item of map.values()) {
        if (item.illusionId === illusionId || (item.payload && item.payload.falseBeliefFact === illusionId) || (typeof illusionId === 'string' && item.illusionType === illusionId)) {
          rec = item;
          break;
        }
      }
      if (!rec && map.size > 0) {
        rec = map.values().next().value;
      }
    }
    if (!rec) {
      return { ok: false, error: 'illusion_not_found' };
    }
    if (rec.unmasked) {
      return { ok: true, believed: false, reason: 'already_unmasked' };
    }
    const ctx = (typeof currentWitnessContext === 'boolean')
      ? { witnessedReality: currentWitnessContext }
      : (currentWitnessContext || {});
    // 若受害者获得了实锤铁证物证或亲临现场，认知崩塌
    if (ctx.hasDirectProof === true || ctx.witnessedReality === true) {
      rec.unmasked = true;
      return {
        ok: true,
        believed: false,
        epiphany: true,
        message: 'Reality witnessed. False belief shattered.'
      };
    }
    // 维持受骗相信状态
    return {
      ok: true,
      believed: true,
      perceivedReality: rec.payload,
      credibility: rec.credibilityScore
    };
  }

  function unmaskIllusion(victimId, illusionId) {
    if (!victimId || !_victimPerceptionMaps.has(victimId)) {
      return { ok: false, error: 'victim_not_found' };
    }
    const map = _victimPerceptionMaps.get(victimId);
    if (!map.has(illusionId)) {
      return { ok: false, error: 'illusion_not_found' };
    }
    const rec = map.get(illusionId);
    rec.unmasked = true;
    return { ok: true, illusionId: illusionId, unmasked: true };
  }

  function getVictimPerceptionMap(victimId) {
    if (!victimId || !_victimPerceptionMaps.has(victimId)) return [];
    const map = _victimPerceptionMaps.get(victimId);
    return Array.from(map.values());
  }

  function resetAll() {
    _victimPerceptionMaps.clear();
    return { ok: true, cleared: true };
  }

  function diagnose() {
    return {
      version: VERSION,
      totalVictimsTracked: _victimPerceptionMaps.size
    };
  }

  const api = {
    VERSION: VERSION,
    forgeIllusion: forgeIllusion,
    verifyBelief: verifyBelief,
    unmaskIllusion: unmaskIllusion,
    getVictimPerceptionMap: getVictimPerceptionMap,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.engines.perceptionManipulation = api;
  WA.perceptionManipulation = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();