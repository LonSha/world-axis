/**
 * WorldAxis engines/veracity-arbitration.js (v2.330.0)
 * EXV16-6: 多角色视界非对称谎言与物证比对裁决引擎 (Veracity Arbitration & Forensic Corroboration)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 落实严格的非全知博弈裁决。在 SillyTavern 多角色互动中，当各角色口供相左、
 * 互相指控或掩盖罪行时，系统绝不采用模型“全知上帝视角”，而是基于各角色的
 * 有限微观视界与现场留存的物理客观痕迹（Forensic Trace）进行对账：
 *  - 口供记录：registerTestimony(caseId, actorId, claim)
 *  - 交叉对账：crossExamine(opts)
 *  - 裁决状态：truth (属实), lie (伪证败露), partial (模糊不全), insufficient_evidence (证据不足)
 *  - 信用制裁与司法记录
 *  - resetAll(), diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  // 案情与口供台账: Map<caseId, { caseId, testimonies: Map<actorId, Testimony>, evidenceTraces: Array<Trace>, status: string }>
  const _caseLedger = new Map();

  function _ensureCase(caseId) {
    if (!_caseLedger.has(caseId)) {
      _caseLedger.set(caseId, {
        caseId: caseId,
        testimonies: new Map(),
        evidenceTraces: [],
        verdicts: new Map(),
        createdAt: clockNow('veracity-arbitration')
      });
    }
    return _caseLedger.get(caseId);
  }

  /**
   * 录入角色证词与口供
   */
  function registerTestimony(caseId, actorId, claim) {
    if (!caseId || !actorId) {
      return { ok: false, error: 'missing_case_or_actor' };
    }
    const c = _ensureCase(caseId);
    const testimony = {
      actorId: actorId,
      locationClaimed: claim.locationClaimed || 'unknown_loc',
      timeClaimed: claim.timeClaimed || 0,
      deniesInvolvement: claim.deniesInvolvement !== false,
      alibiProvided: Boolean(claim.alibiProvided),
      statementText: claim.statementText || '',
      submittedAt: clockNow('veracity-arbitration')
    };
    c.testimonies.set(actorId, testimony);
    return { ok: true, caseId: caseId, actorId: actorId, testimonyRecorded: true };
  }

  /**
   * 交叉对账与物理痕迹验证
   * @param {Object} opts {
   *   caseId: string,
   *   crimeSceneNodeId: string,
   *   physicalTraces: Array<{ traceId, actorId, traceType, nodeKey, confidence }>,
   *   investigatorId: string
   * }
   */
  function crossExamine(opts) {
    if (!opts || !opts.caseId) {
      return { ok: false, error: 'missing_case_id' };
    }
    const c = _caseLedger.get(opts.caseId);
    if (!c || c.testimonies.size === 0) {
      return { ok: false, error: 'case_or_testimonies_not_found' };
    }

    const sceneNode = opts.crimeSceneNodeId || 'scene_default';
    const traces = Array.isArray(opts.physicalTraces) ? opts.physicalTraces : [];
    c.evidenceTraces = traces.slice();

    // 负控制拦截：在没有任何物理物证且无见证人支持时，依据“疑罪从无”，严禁凭空定罪
    if (traces.length === 0) {
      const defaultVerdicts = [];
      for (const aid of c.testimonies.keys()) {
        const v = {
          actorId: aid,
          verdict: 'insufficient_evidence',
          credibilityImpact: 0,
          reason: 'No physical traces recovered; innocent until proven guilty.'
        };
        c.verdicts.set(aid, v);
        defaultVerdicts.push(v);
      }
      return {
        ok: true,
        caseId: opts.caseId,
        verdicts: defaultVerdicts,
        arbitratedCount: defaultVerdicts.length,
        evidenceAvailable: false
      };
    }

    const verdicts = [];

    for (const [aid, t] of c.testimonies.entries()) {
      // 检验现场是否存在与该嫌疑人匹配的强物理物证
      const matchingTraces = traces.filter(tr => tr.actorId === aid && tr.nodeKey === sceneNode);

      let verdict = 'truth';
      let reason = 'Testimony is consistent with physical evidence.';
      let credibilityImpact = 0;

      if (t.deniesInvolvement && matchingTraces.length > 0) {
        // 谎言败露：声称不在场或未涉案，但案发现场提取到其确凿物证
        verdict = 'lie';
        reason = `Claimed absence at ${t.locationClaimed}, but found matching trace [${matchingTraces[0].traceType}] at crime scene.`;
        credibilityImpact = -40; // 信用与说服力剧烈受挫
      } else if (!t.deniesInvolvement && matchingTraces.length > 0) {
        // 承认在场，且物证吻合
        verdict = 'truth';
        reason = 'Admitted presence and confirmed by physical scene traces.';
        credibilityImpact = 5;
      } else if (t.alibiProvided && matchingTraces.length === 0) {
        // 有不在场证明且现场无任何物证
        verdict = 'truth';
        reason = 'Alibi intact and zero physical trace linked at scene.';
        credibilityImpact = 10;
      } else {
        verdict = 'partial';
        reason = 'Circumstantial mismatch; inconclusive.';
        credibilityImpact = 0;
      }

      const vRecord = {
        actorId: aid,
        verdict: verdict,
        credibilityImpact: credibilityImpact,
        reason: reason,
        contradictingTracesCount: verdict === 'lie' ? matchingTraces.length : 0
      };
      c.verdicts.set(aid, vRecord);
      verdicts.push(vRecord);
    }

    return {
      ok: true,
      caseId: opts.caseId,
      verdicts: verdicts,
      arbitratedCount: verdicts.length,
      evidenceAvailable: true
    };
  }

  function getCaseReport(caseId) {
    if (!caseId || !_caseLedger.has(caseId)) return null;
    const c = _caseLedger.get(caseId);
    return {
      caseId: c.caseId,
      testimoniesCount: c.testimonies.size,
      tracesCount: c.evidenceTraces.length,
      verdicts: Array.from(c.verdicts.values())
    };
  }

  function resetAll() {
    _caseLedger.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    registerTestimony: registerTestimony,
    crossExamine: crossExamine,
    getCaseReport: getCaseReport,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        activeCasesCount: _caseLedger.size,
        version: VERSION
      };
    }
  };

  WA.engines.veracityArbitration = engine;
  WA.veracityArbitration = engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();