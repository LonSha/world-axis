/**
 * WorldAxis engines/toxic-metabolism.js (v2.330.0)
 * EXV16-2: 生物机能毒素积蓄与生理解毒代谢引擎 (Toxicology & Toxin Metabolism)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用毒理生物学模型。无论生化毒气、奇幻猛毒草药、修仙尸瘴剧毒或废土核辐射，
 * 抽象为统一四大毒理病理学分类：
 *  1. neuro_paralysis (神经麻痹: 削减敏捷与感知响应，迟钝失调)
 *  2. tissue_corrosion (组织腐蚀: 剧烈消耗体力生命值，脏器与外表坏死)
 *  3. hallucinogen (致幻失真: 扭曲主观认知与视界，产生错误动线)
 *  4. asphyxiation (凝血窒息: 阻断氧气能量交换，耐力崩溃与休克昏迷)
 *
 * 核心方法：
 *  - applyToxin(actorId, toxinType, dose, opts)
 *  - metabolize(actorId, elapsedMinutes)
 *  - administerAntidote(actorId, antidotePower, targetToxinType)
 *  - getActorToxinStatus(actorId)
 *  - resetAll()
 *  - diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const VALID_TOXIN_TYPES = Object.freeze([
    'neuro_paralysis',
    'tissue_corrosion',
    'hallucinogen',
    'asphyxiation'
  ]);

  // 基础自然半衰期（分钟）
  const TOXIN_HALF_LIVES = Object.freeze({
    neuro_paralysis: 60.0,
    tissue_corrosion: 45.0,
    hallucinogen: 30.0,
    asphyxiation: 15.0
  });

  // 角色体内毒素台账: Map<actorId, Map<toxinType, { concentration, peakDose, stage, lastTick }>>
  const _actorToxins = new Map();

  function _ensureActorToxins(actorId) {
    if (!_actorToxins.has(actorId)) {
      _actorToxins.set(actorId, new Map());
    }
    return _actorToxins.get(actorId);
  }

  function _calcStage(concentration) {
    if (concentration <= 0) return 'none';
    if (concentration < 25) return 'mild';
    if (concentration < 60) return 'moderate';
    if (concentration < 90) return 'severe';
    return 'lethal';
  }

  /**
   * 角色染毒/注入毒素
   */
  function applyToxin(actorId, toxinType, dose, opts) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    if (!VALID_TOXIN_TYPES.includes(toxinType)) {
      return { ok: false, error: 'invalid_toxin_type', validTypes: VALID_TOXIN_TYPES };
    }
    const d = typeof dose === 'number' ? Math.max(0, dose) : 0;
    if (d <= 0) {
      return { ok: false, error: 'invalid_dose_must_be_positive' };
    }

    const tMap = _ensureActorToxins(actorId);
    let record = tMap.get(toxinType);
    if (!record) {
      record = {
        toxinType: toxinType,
        concentration: 0.0,
        peakDose: 0.0,
        stage: 'none',
        lastTick: Date.now()
      };
      tMap.set(toxinType, record);
    }

    // 叠加毒素浓度 (上限 100)
    record.concentration = Math.min(100.0, Math.round((record.concentration + d) * 10) / 10);
    record.peakDose = Math.max(record.peakDose, record.concentration);
    record.stage = _calcStage(record.concentration);
    record.lastTick = Date.now();

    // 计算即时机能减损判定
    const penalty = {
      agilityPenalty: toxinType === 'neuro_paralysis' ? record.concentration * 0.008 : 0,
      vitalityDrain: toxinType === 'tissue_corrosion' ? record.concentration * 0.15 : 0,
      hallucinationDistortion: toxinType === 'hallucinogen' ? record.concentration >= 25 : false,
      staminaLockout: toxinType === 'asphyxiation' ? record.concentration >= 60 : false
    };

    return {
      ok: true,
      actorId: actorId,
      toxinType: toxinType,
      concentration: record.concentration,
      stage: record.stage,
      penalty: penalty
    };
  }

  /**
   * 角色生理半衰期自然代谢演化
   */
  function metabolize(actorId, elapsedMinutes) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    const tMap = _actorToxins.get(actorId);
    if (!tMap || tMap.size === 0) {
      return { ok: true, actorId: actorId, activeToxins: [], clearedAll: true };
    }

    const minutes = typeof elapsedMinutes === 'number' && elapsedMinutes > 0 ? elapsedMinutes : 15.0;
    const results = [];

    for (const [tType, rec] of tMap.entries()) {
      const halfLife = TOXIN_HALF_LIVES[tType] || 45.0;
      // 指数衰减方程: C(t) = C0 * 0.5 ^ (t / halfLife)
      const decayFactor = Math.pow(0.5, minutes / halfLife);
      rec.concentration = Math.max(0.0, Math.round(rec.concentration * decayFactor * 10) / 10);
      rec.stage = _calcStage(rec.concentration);
      rec.lastTick = Date.now();

      results.push({
        toxinType: tType,
        concentration: rec.concentration,
        stage: rec.stage
      });

      if (rec.concentration <= 0.0) {
        tMap.delete(tType);
      }
    }

    return {
      ok: true,
      actorId: actorId,
      elapsedMinutes: minutes,
      toxinStatus: results,
      totalActiveToxins: tMap.size
    };
  }

  /**
   * 服用解药进行靶向中和
   */
  function administerAntidote(actorId, antidotePower, targetToxinType) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    const power = typeof antidotePower === 'number' ? Math.max(0, antidotePower) : 0;
    if (power <= 0) {
      return { ok: false, error: 'invalid_antidote_power' };
    }

    const tMap = _actorToxins.get(actorId);
    // 负控制拦截：无毒角色服用解药，指标绝不受损，绝不溢出负数毒性
    if (!tMap || tMap.size === 0) {
      return {
        ok: true,
        actorId: actorId,
        neutralizedDose: 0,
        message: 'actor_has_no_active_toxins',
        healthy: true
      };
    }

    let neutralizedTotal = 0;
    if (targetToxinType) {
      if (tMap.has(targetToxinType)) {
        const rec = tMap.get(targetToxinType);
        const prev = rec.concentration;
        rec.concentration = Math.max(0.0, Math.round((rec.concentration - power) * 10) / 10);
        neutralizedTotal = Math.round((prev - rec.concentration) * 10) / 10;
        rec.stage = _calcStage(rec.concentration);
        if (rec.concentration <= 0.0) tMap.delete(targetToxinType);
      } else {
        neutralizedTotal = 0;
      }
    } else {
      // 广谱解药中和所有毒素
      for (const [tType, rec] of tMap.entries()) {
        const prev = rec.concentration;
        rec.concentration = Math.max(0.0, Math.round((rec.concentration - power) * 10) / 10);
        neutralizedTotal += Math.round((prev - rec.concentration) * 10) / 10;
        rec.stage = _calcStage(rec.concentration);
        if (rec.concentration <= 0.0) tMap.delete(tType);
      }
    }

    return {
      ok: true,
      actorId: actorId,
      neutralizedDose: neutralizedTotal,
      remainingToxinsCount: tMap.size
    };
  }

  /**
   * 查询角色当前毒理状态
   */
  function getActorToxinStatus(actorId) {
    if (!actorId || !_actorToxins.has(actorId)) {
      return { ok: true, actorId: actorId, toxins: [], highestStage: 'none' };
    }
    const tMap = _actorToxins.get(actorId);
    const list = [];
    let highestStage = 'none';
    const stageRank = { none: 0, mild: 1, moderate: 2, severe: 3, lethal: 4 };

    for (const rec of tMap.values()) {
      list.push(Object.assign({}, rec));
      if (stageRank[rec.stage] > stageRank[highestStage]) {
        highestStage = rec.stage;
      }
    }

    return {
      ok: true,
      actorId: actorId,
      toxins: list,
      highestStage: highestStage
    };
  }

  function resetAll() {
    _actorToxins.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    VALID_TOXIN_TYPES: VALID_TOXIN_TYPES,
    applyToxin: applyToxin,
    metabolize: metabolize,
    administerAntidote: administerAntidote,
    getActorToxinStatus: getActorToxinStatus,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        poisonedActorsCount: _actorToxins.size,
        version: VERSION
      };
    }
  };

  WA.engines.toxicMetabolism = engine;
  WA.toxicMetabolism = engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();