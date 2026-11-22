/**
 * WorldAxis engines/environmental-hazard.js (v2.330.0)
 * 通用极端环境侵蚀与生存负荷引擎 (Universal Environmental Hazard & Survival Exposure)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 彻底剥离单一题材硬编码。无论现代极寒暴雪、西幻严寒冰原、修仙极阴寒潭、科幻太空辐射或末世酸雨毒瘴，
 * 均抽象为普适的五大通用物理负荷矢量：
 *  1. cold (极低温/寒潮/阴煞) -> 导致失温 (hypothermia) 与肢体僵硬；
 *  2. heat (极高温/热浪/地火) -> 导致热衰竭/中暑 (heatstroke) 与脱水；
 *  3. toxic (毒瘴/化学毒气/生化辐射/瘴气) -> 导致毒素累积 (toxicity) 与呼吸道损伤；
 *  4. vacuum (低氧/水下窒息/真空/高压缺氧) -> 导致窒息 (suffocation) 与意识迷蒙；
 *  5. gravity (高重力/灵压/重场压迫) -> 导致负重过载骨骼压迫与机能迟缓。
 *
 * 运行逻辑：
 *  - registerZoneHazard(placeId, hazardType, severity, opts)
 *  - clearZoneHazard(placeId, hazardType)
 *  - evaluateExposure(actorId, placeId, durationMinutes, gear)
 *  - 联动 metabolism-clock: 当发生侵蚀时，自动加剧机能疲劳与虚弱状态。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const VALID_HAZARD_TYPES = Object.freeze([
    'cold',
    'heat',
    'toxic',
    'vacuum',
    'gravity'
  ]);

  // 基础每小时侵蚀速率 (severity 1..5 线性缩放)
  const BASE_EROSION_RATE_PER_HOUR = Object.freeze({
    cold: 12,
    heat: 10,
    toxic: 15,
    vacuum: 30,
    gravity: 8
  });

  // 区域环境负荷表: Map<placeId, Map<hazardType, HazardInfo>>
  const _zoneHazards = new Map();

  // 角色暴露侵蚀记录表: Map<actorId, Map<hazardType, ExposureRecord>>
  const _actorExposures = new Map();

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function _clamp(num, min, max) {
    const n = Number(num);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  /**
   * 登记区域环境物理负荷
   * @param {string} placeId 地点标识
   * @param {string} hazardType 负荷类型 (cold|heat|toxic|vacuum|gravity)
   * @param {number} severity 严重度 (1~5)
   * @param {object} opts 扩展选项 (desc, shelterEffectiveness: 庇护减免率 0..1)
   */
  function registerZoneHazard(placeId, hazardType, severity, opts) {
    const pid = _cleanStr(placeId);
    if (!pid) return { ok: false, reason: 'missing-place-id' };

    const ht = _cleanStr(hazardType).toLowerCase();
    if (!VALID_HAZARD_TYPES.includes(ht)) {
      return { ok: false, reason: 'invalid-hazard-type', valid: VALID_HAZARD_TYPES };
    }

    const sev = Math.round(Number(severity));
    if (!Number.isFinite(sev) || sev < 1 || sev > 5) {
      return { ok: false, reason: 'severity-out-of-range', range: [1, 5] };
    }

    opts = opts || {};
    const shelterReduction = _clamp(opts.shelterReduction != null ? opts.shelterReduction : 0, 0, 1);

    if (!_zoneHazards.has(pid)) {
      _zoneHazards.set(pid, new Map());
    }
    const zoneMap = _zoneHazards.get(pid);

    const record = {
      placeId: pid,
      hazardType: ht,
      severity: sev,
      shelterReduction: shelterReduction,
      desc: _cleanStr(opts.desc || '', 120),
      registeredAt: clockNow('environmental-hazard')
    };

    zoneMap.set(ht, record);
    return { ok: true, placeId: pid, hazard: record };
  }

  /**
   * 清除区域指定环境负荷
   */
  function clearZoneHazard(placeId, hazardType) {
    const pid = _cleanStr(placeId);
    if (!pid) return { ok: false, reason: 'missing-place-id' };
    const ht = _cleanStr(hazardType).toLowerCase();

    if (!_zoneHazards.has(pid)) {
      return { ok: false, reason: 'place-not-registered' };
    }
    const zoneMap = _zoneHazards.get(pid);
    if (ht) {
      if (!zoneMap.has(ht)) {
        return { ok: false, reason: 'hazard-not-active-in-place' };
      }
      zoneMap.delete(ht);
      if (zoneMap.size === 0) _zoneHazards.delete(pid);
      return { ok: true, cleared: ht, placeId: pid };
    } else {
      _zoneHazards.delete(pid);
      return { ok: true, clearedAll: true, placeId: pid };
    }
  }

  /**
   * 获取某地点的全部活跃环境负荷
   */
  function getZoneHazards(placeId) {
    const pid = _cleanStr(placeId);
    if (!pid || !_zoneHazards.has(pid)) return [];
    return Array.from(_zoneHazards.get(pid).values());
  }

  /**
   * 评估角色在该区域暴露一定时间后的生理机能侵蚀
   * @param {string} actorId 角色标识
   * @param {string} placeId 地点标识
   * @param {number} durationMinutes 暴露分钟数 (> 0)
   * @param {object} gear 角色防护装备与抗性加成 { gearResistance: 0..1, inShelter: boolean, naturalResistance: 0..1 }
   */
  function evaluateExposure(actorId, placeId, durationMinutes, gear) {
    const aid = _cleanStr(actorId);
    if (!aid) return { ok: false, reason: 'missing-actor-id' };

    const pid = _cleanStr(placeId);
    if (!pid) return { ok: false, reason: 'missing-place-id' };

    const dur = Number(durationMinutes);
    if (!Number.isFinite(dur) || dur <= 0) {
      return { ok: false, reason: 'invalid-duration', expected: '> 0' };
    }

    const activeHazards = getZoneHazards(pid);
    if (activeHazards.length === 0) {
      return {
        ok: true,
        actorId: aid,
        placeId: pid,
        benign: true,
        totalErosion: 0,
        symptoms: [],
        details: []
      };
    }

    gear = gear || {};
    const gearRes = _clamp(Number(gear.gearResistance || 0), 0, 0.95); // 装备抗性最高抵御 95%
    const natRes = _clamp(Number(gear.naturalResistance || 0), 0, 0.90); // 先天/功法抗性
    const inShelter = !!gear.inShelter;

    if (!_actorExposures.has(aid)) {
      _actorExposures.set(aid, new Map());
    }
    const actorRecords = _actorExposures.get(aid);

    let totalNewErosion = 0;
    const symptoms = [];
    const details = [];

    for (const haz of activeHazards) {
      const ht = haz.hazardType;
      const sev = haz.severity;
      const basePerHour = BASE_EROSION_RATE_PER_HOUR[ht] || 10;

      // 综合防护折减
      let protectionFactor = (1 - gearRes) * (1 - natRes);
      if (inShelter && haz.shelterReduction > 0) {
        protectionFactor *= (1 - haz.shelterReduction);
      }
      protectionFactor = Math.max(0.05, protectionFactor); // 最少保留 5% 穿透

      // 计算本轮侵蚀增量: (base * sev * (dur / 60)) * protectionFactor
      const rawDelta = (basePerHour * (sev * 0.8)) * (dur / 60) * protectionFactor;
      const erosionDelta = Math.round(rawDelta * 10) / 10;

      // 累计到角色记录
      const prevRecord = actorRecords.get(ht) || { accumulatedErosion: 0, stage: 'none' };
      const nextAccum = Math.min(100, Math.round((prevRecord.accumulatedErosion + erosionDelta) * 10) / 10);

      // 判定症状阶段: none -> mild -> moderate -> severe -> critical
      let stage = 'none';
      let symptomText = '';
      if (nextAccum >= 80) {
        stage = 'critical';
        if (ht === 'cold') symptomText = '重度失温：神志恍惚、脉搏微弱、濒临冻僵休克';
        else if (ht === 'heat') symptomText = '重度热射病：体温急剧飙升、谵妄昏迷、多器官衰竭风险';
        else if (ht === 'toxic') symptomText = '致命剧毒：毒素攻心侵袭神经，视野发黑失明';
        else if (ht === 'vacuum') symptomText = '完全窒息：意识深度丧失、剧烈痉挛缺氧休克';
        else if (ht === 'gravity') symptomText = '骨骼断裂与内脏出血压迫：无法行动彻底倒地';
      } else if (nextAccum >= 50) {
        stage = 'severe';
        if (ht === 'cold') symptomText = '中度失温：剧烈寒战停止、言语含糊、反应极其迟钝';
        else if (ht === 'heat') symptomText = '热衰竭：恶心呕吐、极度虚脱脱水、视线重影';
        else if (ht === 'toxic') symptomText = '严重中毒：呼吸困难、剧烈咳嗽咳血、四肢麻痹';
        else if (ht === 'vacuum') symptomText = '严重缺氧：紫绀胸闷剧痛、动作失调';
        else if (ht === 'gravity') symptomText = '极度重力压迫：内脏受损、挪步维艰';
      } else if (nextAccum >= 25) {
        stage = 'moderate';
        if (ht === 'cold') symptomText = '轻度失温：无法自控寒颤、指尖麻木发青、协调性下降';
        else if (ht === 'heat') symptomText = '中暑先兆：大汗淋漓口渴如焚、头晕目眩乏力';
        else if (ht === 'toxic') symptomText = '轻度毒性反应：咽喉灼痛、头痛泛恶';
        else if (ht === 'vacuum') symptomText = '轻度缺氧：呼吸急促气短、心悸慌乱';
        else if (ht === 'gravity') symptomText = '沉重负荷：肌肉剧烈酸痛、动作沉重缓慢';
      } else if (nextAccum > 5) {
        stage = 'mild';
        if (ht === 'cold') symptomText = '寒意侵袭：体表寒凉、轻微冷战';
        else if (ht === 'heat') symptomText = '燥热气闷：出汗黏腻';
        else if (ht === 'toxic') symptomText = '刺鼻异味：轻微呛咳喉咙干痒';
        else if (ht === 'vacuum') symptomText = '气压不适：轻度气闷';
        else if (ht === 'gravity') symptomText = '身体沉重，稍易疲乏';
      }

      actorRecords.set(ht, {
        hazardType: ht,
        accumulatedErosion: nextAccum,
        stage: stage,
        symptom: symptomText,
        lastEvaluatedAt: clockNow('environmental-hazard')
      });

      totalNewErosion += erosionDelta;
      if (symptomText) symptoms.push(`[${ht.toUpperCase()}] ${symptomText}`);

      details.push({
        hazardType: ht,
        severity: sev,
        erosionDelta: erosionDelta,
        accumulatedErosion: nextAccum,
        stage: stage,
        protectionFactor: Math.round(protectionFactor * 100) / 100
      });
    }

    // 若挂载了 metabolism-clock，级联反哺疲劳
    if (WA.engines && WA.metabolismClock && typeof WA.metabolismClock.accumulateFatigue === 'function') {
      const extraFatigue = Math.round(totalNewErosion * 0.4);
      if (extraFatigue > 0) {
        WA.metabolismClock.accumulateFatigue(aid, extraFatigue, `hazard_exposure:${pid}`);
      }
    }

    return {
      ok: true,
      actorId: aid,
      placeId: pid,
      benign: false,
      totalNewErosion: Math.round(totalNewErosion * 10) / 10,
      symptoms: symptoms,
      details: details
    };
  }

  /**
   * 查询角色当前的负荷侵蚀状态
   */
  function getActorExposureStatus(actorId) {
    const aid = _cleanStr(actorId);
    if (!aid || !_actorExposures.has(aid)) {
      return { ok: true, actorId: aid, activeHazards: [], maxStage: 'none' };
    }
    const list = Array.from(_actorExposures.get(aid).values());
    const stages = ['none', 'mild', 'moderate', 'severe', 'critical'];
    let maxStageIdx = 0;
    for (const r of list) {
      const idx = stages.indexOf(r.stage);
      if (idx > maxStageIdx) maxStageIdx = idx;
    }
    return {
      ok: true,
      actorId: aid,
      activeHazards: list,
      maxStage: stages[maxStageIdx]
    };
  }

  /**
   * 救治/缓解角色的环境侵蚀负荷
   */
  function treatActorExposure(actorId, hazardType, recoveryPoints) {
    const aid = _cleanStr(actorId);
    if (!aid) return { ok: false, reason: 'missing-actor-id' };
    const ht = _cleanStr(hazardType).toLowerCase();
    const pts = Number(recoveryPoints);
    if (!Number.isFinite(pts) || pts <= 0) {
      return { ok: false, reason: 'invalid-recovery-points' };
    }

    if (!_actorExposures.has(aid)) {
      return { ok: false, reason: 'actor-has-no-exposure-records' };
    }
    const actorRecords = _actorExposures.get(aid);

    if (ht) {
      if (!actorRecords.has(ht)) return { ok: false, reason: 'hazard-record-not-found' };
      const rec = actorRecords.get(ht);
      rec.accumulatedErosion = Math.max(0, Math.round((rec.accumulatedErosion - pts) * 10) / 10);
      if (rec.accumulatedErosion === 0) rec.stage = 'none';
      else if (rec.accumulatedErosion < 25) rec.stage = 'mild';
      else if (rec.accumulatedErosion < 50) rec.stage = 'moderate';
      else if (rec.accumulatedErosion < 80) rec.stage = 'severe';
      return { ok: true, actorId: aid, treatedHazard: ht, currentErosion: rec.accumulatedErosion, stage: rec.stage };
    } else {
      for (const rec of actorRecords.values()) {
        rec.accumulatedErosion = Math.max(0, Math.round((rec.accumulatedErosion - pts) * 10) / 10);
        if (rec.accumulatedErosion === 0) rec.stage = 'none';
        else if (rec.accumulatedErosion < 25) rec.stage = 'mild';
        else if (rec.accumulatedErosion < 50) rec.stage = 'moderate';
        else if (rec.accumulatedErosion < 80) rec.stage = 'severe';
      }
      return { ok: true, actorId: aid, treatedAll: true };
    }
  }

  function resetAll() {
    _zoneHazards.clear();
    _actorExposures.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    registerZoneHazard: registerZoneHazard,
    clearZoneHazard: clearZoneHazard,
    getZoneHazards: getZoneHazards,
    evaluateExposure: evaluateExposure,
    getActorExposureStatus: getActorExposureStatus,
    treatActorExposure: treatActorExposure,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        hazardProfilesCount: _zoneHazards.size,
        activeExposuresCount: _actorExposures.size,
        version: VERSION
      };
    }
  };

  WA.engines.environmentalHazard = engine;
  WA.environmentalHazard = engine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();
