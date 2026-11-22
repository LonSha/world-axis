/**
 * WorldAxis engines/epoch-tide.js (v2.340.0)
 * EXV17-6: 宏观时代浪潮与文明生态周期演化引擎 (Epoch Tide & Civilized Ecology Cycle)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用宏观世界大势演进模型。无论是凛冬冰河纪元、修仙末法灵衰/灵气复苏狂暴潮、
 * 赛博核冬天极寒、还是废土电磁辐射风暴季，统一抽象为全局物理常数改写：
 *  1. epochType: 时代大潮类型:
 *     - 'glacial_frost' (冰河严冬: 全图降温, 水体冻结, 农耕停滞, 饥荒蔓延)
 *     - 'energy_drought' (末法灵衰/能量枯竭: 超自然能耗翻倍, 结界耐久骤降)
 *     - 'radiation_storm' (辐射风暴: 极端环境侵蚀暴增, 户外变异与生存负荷)
 *     - 'golden_renaissance' (大航海与黄金复兴: 通商阻力清零, 物资繁荣)
 *  2. severity: 严峻程度 (1.0~5.0)
 *  3. durationEpochTurns: 持续推演大轮周期 (turns)
 *
 * 核心方法：
 *  - shiftEpoch(epochType, severity, durationEpochTurns, opts)
 *  - advanceEpoch(turns)
 *  - getCurrentEpoch()
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

  const VALID_EPOCH_TYPES = Object.freeze([
    'glacial_frost',
    'energy_drought',
    'radiation_storm',
    'golden_renaissance'
  ]);

  let _currentEpoch = {
    epochType: 'normal_era',
    severity: 1.0,
    remainingTurns: 0,
    activeModifiers: {
      temperatureDelta: 0.0,
      resourceConsumptionMultiplier: 1.0,
      travelFrictionMultiplier: 1.0
    },
    startedAt: clockNow('epoch-tide')
  };

  function shiftEpoch(epochType, severity, durationEpochTurns, opts) {
    if (!VALID_EPOCH_TYPES.includes(epochType)) {
      return { ok: false, error: 'invalid_epoch_type' };
    }
    const sev = typeof severity === 'number' ? Math.max(1.0, Math.min(5.0, severity)) : 2.0;
    const dur = typeof durationEpochTurns === 'number' ? Math.max(1, Math.round(durationEpochTurns)) : 10;
    const opt = opts || {};

    // 负控制拦截：在世界处于繁荣和平稳固态且未满足天象/地质大变动条件时，严禁无故突变
    if (opt.stableWorldProtection === true && sev < 3.0) {
      return {
        ok: false,
        error: 'stable_world_resists_weak_epoch_shift',
        reason: 'insufficient_cosmic_or_geological_disturbance'
      };
    }

    const mods = {
      temperatureDelta: 0.0,
      resourceConsumptionMultiplier: 1.0,
      travelFrictionMultiplier: 1.0
    };

    if (epochType === 'glacial_frost') {
      mods.temperatureDelta = -15.0 * sev; // 全图气温剧降 -15℃ ~ -75℃
      mods.resourceConsumptionMultiplier = 1.0 + (sev * 0.5); // 粮食燃料消耗激增
      mods.travelFrictionMultiplier = 1.0 + (sev * 0.4); // 积雪冰冻阻碍交通
    } else if (epochType === 'energy_drought') {
      mods.resourceConsumptionMultiplier = 1.0 + (sev * 0.8);
    } else if (epochType === 'radiation_storm') {
      mods.resourceConsumptionMultiplier = 1.0 + (sev * 1.0);
    } else if (epochType === 'golden_renaissance') {
      mods.temperatureDelta = 5.0;
      mods.resourceConsumptionMultiplier = 0.7;
      mods.travelFrictionMultiplier = 0.5;
    }

    _currentEpoch = {
      epochType: epochType,
      severity: sev,
      remainingTurns: dur,
      activeModifiers: mods,
      startedAt: clockNow('epoch-tide')
    };

    return {
      ok: true,
      epochType: epochType,
      severity: sev,
      remainingTurns: dur,
      modifiers: mods
    };
  }

  function advanceEpoch(turns) {
    const t = typeof turns === 'number' ? Math.max(1, Math.round(turns)) : 1;
    if (_currentEpoch.remainingTurns > 0) {
      _currentEpoch.remainingTurns = Math.max(0, _currentEpoch.remainingTurns - t);
      if (_currentEpoch.remainingTurns === 0) {
        _currentEpoch.epochType = 'normal_era';
        _currentEpoch.severity = 1.0;
        _currentEpoch.activeModifiers = {
          temperatureDelta: 0.0,
          resourceConsumptionMultiplier: 1.0,
          travelFrictionMultiplier: 1.0
        };
      }
    }
    return {
      ok: true,
      currentEpoch: _currentEpoch.epochType,
      remainingTurns: _currentEpoch.remainingTurns
    };
  }

  function getCurrentEpoch() {
    return Object.assign({}, _currentEpoch);
  }

  function resetAll() {
    _currentEpoch = {
      epochType: 'normal_era',
      severity: 1.0,
      remainingTurns: 0,
      activeModifiers: {
        temperatureDelta: 0.0,
        resourceConsumptionMultiplier: 1.0,
        travelFrictionMultiplier: 1.0
      },
      startedAt: clockNow('epoch-tide')
    };
    return { ok: true, cleared: true };
  }

  function diagnose() {
    return {
      version: VERSION,
      currentEpoch: _currentEpoch
    };
  }

  const api = {
    VERSION: VERSION,
    VALID_EPOCH_TYPES: VALID_EPOCH_TYPES,
    shiftEpoch: shiftEpoch,
    advanceEpoch: advanceEpoch,
    getCurrentEpoch: getCurrentEpoch,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.engines.epochTide = api;
  WA.epochTide = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();