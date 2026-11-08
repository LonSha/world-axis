/**
 * WorldAxis engines/conspiracy-weaver.js (v2.340.0)
 * EXV17-3: 阴谋集团权谋编织与政变颠覆引擎 (Conspiracy Weaver & Coup d'État Engine)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用宏观权力对抗与秘密同盟模型。无论是封建朝堂夺嫡、赛博巨型企业董事会政变、
 * 宗门长老篡位夺权还是废土军阀兵变，统一抽象为四个核心要素：
 *  1. cabal: 秘密结盟网络 (ringleader, conspirators, targetAuthority)
 *  2. conspiracyRoster: 成员名单与其各自忠诚度/贪婪度/把柄 (loyaltyThreshold)
 *  3. phases: 政变步骤清单:
 *     - 'infiltrate_guards' (收买渗透禁卫)
 *     - 'smuggle_arms' (偷运私藏违禁兵刃)
 *     - 'fabricate_pretext' (制造刺杀借口/假警报)
 *     - 'strike_midnight' (午夜引爆夺权)
 *  4. status: 阴谋状态机:
 *     - 'hatching' (密谋编织中)
 *     - 'ready' (蓄势待发)
 *     - 'executed_success' (政变篡位成功)
 *     - 'unmasked_executed' (密谋败露当场伏诛)
 *
 * 核心方法：
 *  - hatchConspiracy(cabalId, ringleaderId, targetAuthorityId, members, opts)
 *  - advancePhase(cabalId, phaseName, evidence)
 *  - executeCoup(cabalId, opts)
 *  - unmaskConspiracy(cabalId, exposerId, proofTraceId)
 *  - getConspiracy(cabalId)
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

  // 阴谋结盟台账: Map<cabalId, { cabalId, ringleaderId, targetAuthorityId, members: Map<memberId, { loyalty, role }>, completedPhases: Set, status, secrecyRating }>
  const _cabalRegistry = new Map();

  function hatchConspiracy(cabalId, ringleaderId, targetAuthorityId, members, opts) {
    if (!cabalId || typeof cabalId !== 'string') {
      return { ok: false, error: 'invalid_cabal_id' };
    }
    if (!ringleaderId || !targetAuthorityId) {
      return { ok: false, error: 'missing_ringleader_or_target' };
    }
    const opt = opts || {};
    const memberMap = new Map();

    const rawList = Array.isArray(members) ? members : [ringleaderId];
    for (const m of rawList) {
      const mid = typeof m === 'string' ? m : (m.id || m.actorId);
      const loyalty = typeof m.loyalty === 'number' ? m.loyalty : 50; // 忠诚度/背叛阈值

      // 负控制拦截：密谋成员忠诚度若极高（loyalty >= 80，即誓死效忠原权威），严禁拉入谋逆同盟
      if (loyalty >= 80 && mid !== ringleaderId) {
        return {
          ok: false,
          error: 'member_loyalty_too_high_to_conspire',
          memberId: mid,
          loyalty: loyalty
        };
      }
      memberMap.set(mid, { loyalty: loyalty, role: m.role || 'conspirator' });
    }

    const cabal = {
      cabalId: cabalId,
      ringleaderId: ringleaderId,
      targetAuthorityId: targetAuthorityId,
      members: memberMap,
      completedPhases: new Set(),
      status: 'hatching',
      secrecyRating: typeof opt.secrecyRating === 'number' ? opt.secrecyRating : 80,
      createdAt: Date.now()
    };

    _cabalRegistry.set(cabalId, cabal);

    return {
      ok: true,
      cabalId: cabalId,
      status: cabal.status,
      memberCount: memberMap.size,
      targetAuthorityId: targetAuthorityId
    };
  }

  function advancePhase(cabalId, phaseName, evidence) {
    if (!cabalId || !_cabalRegistry.has(cabalId)) {
      return { ok: false, error: 'cabal_not_found' };
    }
    const cabal = _cabalRegistry.get(cabalId);
    if (cabal.status !== 'hatching' && cabal.status !== 'ready') {
      return { ok: false, error: 'cabal_not_active', currentStatus: cabal.status };
    }
    if (!phaseName || typeof phaseName !== 'string') {
      return { ok: false, error: 'invalid_phase_name' };
    }

    cabal.completedPhases.add(phaseName);
    if (cabal.completedPhases.size >= 3) {
      cabal.status = 'ready';
    }

    return {
      ok: true,
      cabalId: cabalId,
      phaseCompleted: phaseName,
      totalCompleted: cabal.completedPhases.size,
      currentStatus: cabal.status
    };
  }

  function executeCoup(cabalId, opts) {
    if (!cabalId || !_cabalRegistry.has(cabalId)) {
      return { ok: false, error: 'cabal_not_found' };
    }
    const cabal = _cabalRegistry.get(cabalId);
    const opt = opts || {};

    // 负控制拦截：政变执行前若已被告发揭露或阶段未就绪（未完成前置准备），严禁突兀判定成功
    if (cabal.status === 'unmasked_executed') {
      return {
        ok: false,
        error: 'coup_already_unmasked_and_suppressed',
        cabalId: cabalId
      };
    }
    if (cabal.status !== 'ready' && opt.force !== true) {
      return {
        ok: false,
        error: 'insufficient_coup_preparation',
        completedPhases: Array.from(cabal.completedPhases),
        status: cabal.status
      };
    }

    cabal.status = 'executed_success';

    return {
      ok: true,
      cabalId: cabalId,
      status: 'executed_success',
      usurper: cabal.ringleaderId,
      dethronedAuthority: cabal.targetAuthorityId,
      message: 'Coup executed successfully. Sovereign authority usurped.'
    };
  }

  function unmaskConspiracy(cabalId, exposerId, proofTraceId) {
    if (!cabalId || !_cabalRegistry.has(cabalId)) {
      return { ok: false, error: 'cabal_not_found' };
    }
    const cabal = _cabalRegistry.get(cabalId);
    cabal.status = 'unmasked_executed';

    return {
      ok: true,
      cabalId: cabalId,
      status: 'unmasked_executed',
      exposerId: exposerId || 'loyalist_guard',
      proofTraceId: proofTraceId || 'confiscated_letter',
      message: 'Conspiracy unmasked and conspirators subdued.'
    };
  }

  function getConspiracy(cabalId) {
    if (!cabalId || !_cabalRegistry.has(cabalId)) return null;
    const c = _cabalRegistry.get(cabalId);
    return {
      cabalId: c.cabalId,
      ringleaderId: c.ringleaderId,
      targetAuthorityId: c.targetAuthorityId,
      status: c.status,
      memberCount: c.members.size,
      completedPhases: Array.from(c.completedPhases),
      secrecyRating: c.secrecyRating
    };
  }

  function resetAll() {
    _cabalRegistry.clear();
    return { ok: true, cleared: true };
  }

  function diagnose() {
    const list = [];
    for (const [id, c] of _cabalRegistry.entries()) {
      list.push({
        cabalId: id,
        status: c.status,
        members: c.members.size
      });
    }
    return {
      version: VERSION,
      totalCabals: _cabalRegistry.size,
      cabals: list
    };
  }

  const api = {
    VERSION: VERSION,
    hatchConspiracy: hatchConspiracy,
    advancePhase: advancePhase,
    executeCoup: executeCoup,
    unmaskConspiracy: unmaskConspiracy,
    getConspiracy: getConspiracy,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.engines.conspiracyWeaver = api;
  WA.conspiracyWeaver = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();