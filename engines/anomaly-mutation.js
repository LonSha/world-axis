/**
 * WorldAxis engines/anomaly-mutation.js (v2.340.0)
 * EXV18-5: 超自然异化侵蚀与道心畸变演化引擎 (Supernatural Anomaly & Mutation Dynamics)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 普适通用的超常侵蚀机制。面向玄幻修仙心魔入魔、克苏鲁旧日低语侵蚀、
 * 赛博义体植入物排异赛博精神病、废土核辐射基因畸变等所有“以理智/肉体换取禁忌力量”的题材：
 *  1. 侵蚀抗性与畸变指标:
 *     - corruptionLevel: 侵蚀深度 (0~100, 初始0);
 *     - corruptionResist: 灵魂/基因/防火墙抗性 (0~100);
 *     - mutationTier: 异化阶位 (0 纯净 ~ 5 彻底非人化/旧日化/狂暴怪化);
 *  2. 畸变特性与代价双生矩阵 (Mutation Manifestations):
 *     - 肉体畸变 (Physical): 'chitin_armor' (几丁质外骨骼/鳞甲), 'shadow_claws' (黑焰魔爪), 'tentacle_limb' (触手肢节);
 *     - 心智代偿 (Mental): 'auditory_hallucination' (不可名状低语幻听), 'bloodlust' (嗜血饥渴), 'megalomania' (神性妄想);
 *  3. 净化自愈与压制 (Cleansing):
 *     - 圣水、清心丹药、抑制剂、道家静心咒等减缓侵蚀并压制幻听。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};
  const VERSION = '2.340.0';

  const VALID_MUTATION_TIERS = Object.freeze([0, 1, 2, 3, 4, 5]);

  // 异化档案表: Map<actorId, MutationProfile>
  const _mutations = new Map();

  function _clamp(n, min, max) {
    const num = Number(n);
    if (!isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function registerAnomalyProfile(actorId, opts) {
    const id = _cleanStr(actorId, 48);
    if (!id) return { ok: false, reason: 'missing-actor-id' };
    const opt = opts || {};
    const state = {
      actorId: id,
      corruptionLevel: _clamp(opt.corruptionLevel || 0, 0, 100),
      corruptionResist: _clamp(opt.corruptionResist !== undefined ? opt.corruptionResist : 50, 0, 100),
      mutationTier: VALID_MUTATION_TIERS.includes(opt.mutationTier) ? opt.mutationTier : 0,
      mutations: Array.isArray(opt.mutations) ? opt.mutations.slice() : [],
      hallucinations: [],
      isAscendedOrMonster: false,
      updatedAt: clockNow('anomaly-mutation')
    };
    _mutations.set(id, state);
    return { ok: true, profile: JSON.parse(JSON.stringify(state)) };
  }

  function getAnomalyProfile(actorId) {
    const id = _cleanStr(actorId, 48);
    if (!id || !_mutations.has(id)) return null;
    return JSON.parse(JSON.stringify(_mutations.get(id)));
  }

  /**
   * 施加超常侵蚀判定
   * @param {object} spec
   *   actorId, sourceAnomalyId, dose (0~100), catalyst ('forbidden_tome'|'void_stone'|'cyber_overdrive'|'radiation')
   */
  function inflictCorruption(spec) {
    const s = spec || {};
    const actId = _cleanStr(s.actorId, 48);
    if (!actId) return { ok: false, reason: 'missing-actor-id' };

    let prof = _mutations.get(actId);
    if (!prof) {
      registerAnomalyProfile(actId, {});
      prof = _mutations.get(actId);
    }

    const dose = _clamp(s.dose !== undefined ? s.dose : 20, 0, 100);
    const sourceId = _cleanStr(s.sourceAnomalyId, 48);

    // 负控制铁律：无任何异化侵蚀剂量或身处凡俗安全环境（dose <= 0 且无异化源），断言绝不产生异化畸变
    if (dose <= 0 && !sourceId) {
      return { ok: false, reason: 'mundane-environment-no-corruption' };
    }

    const netDose = Math.max(0, Math.round(dose * (1 - prof.corruptionResist / 150)));
    prof.corruptionLevel = Math.min(100, prof.corruptionLevel + netDose);

    const result = {
      ok: true,
      actorId: actId,
      corruptionGained: netDose,
      currentCorruption: prof.corruptionLevel,
      tierPromoted: false,
      newTier: prof.mutationTier,
      newMutation: null,
      summary: ''
    };

    // 异化阶位晋升
    const previousTier = prof.mutationTier;
    if (prof.corruptionLevel >= 90) prof.mutationTier = 5;
    else if (prof.corruptionLevel >= 70) prof.mutationTier = 4;
    else if (prof.corruptionLevel >= 50) prof.mutationTier = 3;
    else if (prof.corruptionLevel >= 30) prof.mutationTier = 2;
    else if (prof.corruptionLevel >= 15) prof.mutationTier = 1;
    else prof.mutationTier = 0;

    if (prof.mutationTier > previousTier) {
      result.tierPromoted = true;
      result.newTier = prof.mutationTier;

      let mut = { tier: prof.mutationTier, name: '', powerBonus: '', costDesc: '' };
      if (prof.mutationTier === 1) {
        mut.name = '灵视/过载感知 (Aberrant Vision)';
        mut.powerBonus = '洞察暗影微光，命中率提升 10%';
        mut.costDesc = '白昼偶发眼角抽搐流泪';
      } else if (prof.mutationTier === 2) {
        mut.name = '角质魔甲 (Chitinous Scales)';
        mut.powerBonus = '体表覆盖黑鳞，格挡肉搏钝击伤害';
        mut.costDesc = '触觉麻木迟钝，体温骤降如冰';
      } else if (prof.mutationTier === 3) {
        mut.name = '黑焰魔爪 (Shadow Claws)';
        mut.powerBonus = '徒手撕裂甲胄，造成穿透撕裂伤';
        mut.costDesc = '耳畔响彻不可名状嘶吼幻听，理智衰退';
        prof.hallucinations.push('不可名状低语：血肉苦弱，拥抱深渊！');
      } else if (prof.mutationTier >= 4) {
        mut.name = '神魔道体/非人形态 (Eldritch Apotheosis)';
        mut.powerBonus = '超常自愈力与无上威压';
        mut.costDesc = '凡俗人性彻底解构，被列为异端极度危险品';
        prof.isAscendedOrMonster = true;
      }
      prof.mutations.push(mut);
      result.newMutation = mut;
      result.summary = `[异化突破] ${actId} 侵蚀加剧突破至第 ${prof.mutationTier} 阶位！诞生异象 [${mut.name}]！`;
    } else {
      result.summary = `${actId} 经受异化源冲击，侵蚀度上升至 ${prof.corruptionLevel}%，神志勉强守住。`;
    }

    prof.updatedAt = clockNow('anomaly-mutation');
    return result;
  }

  function resetAll() {
    _mutations.clear();
  }

  function diagnose() {
    return {
      ok: true,
      version: VERSION,
      profilesCount: _mutations.size,
      tiers: VALID_MUTATION_TIERS
    };
  }

  const exportObj = {
    registerAnomalyProfile: registerAnomalyProfile,
    getAnomalyProfile: getAnomalyProfile,
    inflictCorruption: inflictCorruption,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.anomalyMutation = exportObj;
  WA.engines.anomalyMutation = exportObj;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/anomaly-mutation.js', { kind: 'engine', ver: VERSION });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();