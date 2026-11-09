/**
 * WorldAxis engines/moral-dilemma.js (v2.340.0)
 * EXV17-7: 道德两难伦理电车困境博弈引擎 (Moral Dilemma & Trolley Problem Dynamics)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用深层人性博弈与不可兼得价值冲突模型。无论是“牺牲挚爱保全一城”还是“牺牲老弱省粮突围”，
 * 抽象为纯粹效用函数与道德创伤代价模型：
 *  1. branchA vs branchB: 两个不可兼得的分支选项
 *     - branchA: 功利主义取舍（群体生存优先，代价为核心亲信/少数人牺牲）
 *     - branchB: 义务论/个人情感取舍（坚守个别承诺/亲人，代价为群体承受损失）
 *  2. decisionMakerId: 决断者 ID
 *  3. status: 'posed' | 'resolved'
 *  4. 道德代价: 承受深层心智创伤 (trauma) 与阵营声誉分裂代价
 *
 * 核心方法：
 *  - poseDilemma(dilemmaKey, decisionMakerId, branchA, branchB, opts)
 *  - resolveDilemma(dilemmaKey, chosenBranch, rationale)
 *  - getDilemma(dilemmaKey)
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

  // 电车困境台账: Map<dilemmaKey, { dilemmaKey, decisionMakerId, branchA, branchB, status, chosenBranch, rationale, resolvedAt }>
  const _dilemmaRegistry = new Map();

  function poseDilemma(dilemmaKey, decisionMakerId, branchA, branchB, opts) {
    if (!dilemmaKey || typeof dilemmaKey !== 'string') {
      return { ok: false, error: 'invalid_dilemma_key' };
    }
    if (!decisionMakerId || !branchA || !branchB) {
      return { ok: false, error: 'missing_parameters' };
    }
    const opt = opts || {};

    // 负控制拦截：若局面存在第三条和平通融路线或物资充分无需牺牲，严禁强加二元残酷死局
    if (opt.peacefulAlternative === true || opt.abundantResources === true) {
      return {
        ok: false,
        error: 'peaceful_resolution_available_no_forced_dilemma',
        dilemmaKey: dilemmaKey,
        reason: 'sufficient_resources_or_alternative_path_exists'
      };
    }

    const rec = {
      dilemmaKey: dilemmaKey,
      decisionMakerId: decisionMakerId,
      branchA: branchA,
      branchB: branchB,
      status: 'posed',
      chosenBranch: null,
      rationale: null,
      createdAt: clockNow('moral-dilemma')
    };

    _dilemmaRegistry.set(dilemmaKey, rec);

    return {
      ok: true,
      dilemmaKey: dilemmaKey,
      decisionMakerId: decisionMakerId,
      status: 'posed'
    };
  }

  function resolveDilemma(dilemmaKey, chosenBranch, rationale) {
    if (!dilemmaKey || !_dilemmaRegistry.has(dilemmaKey)) {
      return { ok: false, error: 'dilemma_not_found' };
    }
    const rec = _dilemmaRegistry.get(dilemmaKey);
    if (rec.status === 'resolved') {
      return { ok: false, error: 'dilemma_already_resolved', chosenBranch: rec.chosenBranch };
    }
    if (chosenBranch !== 'A' && chosenBranch !== 'B') {
      return { ok: false, error: 'invalid_branch_choice' };
    }

    rec.status = 'resolved';
    rec.chosenBranch = chosenBranch;
    rec.rationale = rationale || 'tragic_necessity';
    rec.resolvedAt = clockNow('moral-dilemma');

    // 联动心智创伤：决断者因残酷取舍承受 40 级不可逆心智创伤
    if (WA.psycheTrauma && typeof WA.psycheTrauma.inflictTrauma === 'function') {
      WA.psycheTrauma.inflictTrauma(rec.decisionMakerId, 40, 'existential_dread', dilemmaKey);
    }

    return {
      ok: true,
      dilemmaKey: dilemmaKey,
      decisionMakerId: rec.decisionMakerId,
      chosenBranch: chosenBranch,
      psychicCostApplied: 40,
      status: 'resolved'
    };
  }

  function getDilemma(dilemmaKey) {
    if (!dilemmaKey || !_dilemmaRegistry.has(dilemmaKey)) return null;
    return Object.assign({}, _dilemmaRegistry.get(dilemmaKey));
  }

  function resetAll() {
    _dilemmaRegistry.clear();
    return { ok: true, cleared: true };
  }

  function diagnose() {
    return {
      version: VERSION,
      totalDilemmas: _dilemmaRegistry.size
    };
  }

  const api = {
    VERSION: VERSION,
    poseDilemma: poseDilemma,
    resolveDilemma: resolveDilemma,
    getDilemma: getDilemma,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.engines.moralDilemma = api;
  WA.moralDilemma = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();