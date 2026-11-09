/**
 * WorldAxis engines/gear-wear.js (v2.330.0)
 * EXV16-7: 随身武器装备耐久损耗与物理形变破损引擎 (Equipment Wear & Structural Stress)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 抽象通用道具材质物理应力与结构老化模型。无论现代防弹衣插板、冷兵器刀剑、
 * 奇幻法杖晶石、修仙护身法宝还是机甲外骨骼装甲：
 *  - 应力阶段：pristine (完好) -> dull (钝化/疲劳) -> cracked (结构裂纹) -> shattered (崩断折毁)
 *  - 物理冲击与化学侵蚀载荷：impact (钝击/重载), abrasion (摩擦/研磨), heat (过热/熔蚀), acid (强酸腐蚀)
 *  - 临界折断后果：耐久归零、丧失防护阻抗、可能对使用者造成反噬割伤
 *  - 核心方法：
 *     - registerGear(gearId, initialDurability, materialType, opts)
 *     - applyStress(gearId, stressLoad, stressType)
 *     - repairGear(gearId, repairPoints)
 *     - getGearStatus(gearId)
 *     - resetAll()
 *     - diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const STRESS_TYPES = Object.freeze([
    'impact',
    'abrasion',
    'heat',
    'acid'
  ]);

  const MATERIAL_TYPES = Object.freeze({
    fabric: { hardness: 10, maxDurability: 50, shatterRisk: false },
    leather: { hardness: 25, maxDurability: 80, shatterRisk: false },
    wood: { hardness: 40, maxDurability: 100, shatterRisk: true },
    iron_steel: { hardness: 80, maxDurability: 200, shatterRisk: true },
    crystal_gem: { hardness: 95, maxDurability: 120, shatterRisk: true }
  });

  // 装备物理台账: Map<gearId, { gearId, durability, maxDurability, materialType, stage, stressAccumulated }>
  const _gearLedger = new Map();

  function _calcStage(durability, maxDurability) {
    if (durability <= 0) return 'shattered';
    const ratio = durability / maxDurability;
    if (ratio > 0.75) return 'pristine';
    if (ratio > 0.35) return 'dull';
    return 'cracked';
  }

  /**
   * 注册或初始化装备物理属性
   */
  function registerGear(gearId, maxDurability, materialType, opts) {
    if (!gearId || typeof gearId !== 'string') {
      return { ok: false, error: 'invalid_gear_id' };
    }
    const mat = MATERIAL_TYPES[materialType] ? materialType : 'iron_steel';
    const maxDur = typeof maxDurability === 'number' && maxDurability > 0
      ? maxDurability
      : MATERIAL_TYPES[mat].maxDurability;

    const opt = opts || {};
    const curDur = typeof opt.currentDurability === 'number'
      ? Math.max(0, Math.min(maxDur, opt.currentDurability))
      : maxDur;

    const gear = {
      gearId: gearId,
      ownerId: opt.ownerId || 'unassigned',
      materialType: mat,
      maxDurability: maxDur,
      durability: curDur,
      stage: _calcStage(curDur, maxDur),
      stressAccumulated: 0,
      lastUpdated: clockNow('gear-wear')
    };
    _gearLedger.set(gearId, gear);

    return { ok: true, gear: Object.assign({}, gear) };
  }

  /**
   * 施加物理与环境应力损耗
   * @param {string} gearId
   * @param {number} stressLoad 应力载荷强度
   * @param {string} stressType 载荷类型 ('impact'|'abrasion'|'heat'|'acid')
   */
  function applyStress(gearId, stressLoad, stressType) {
    if (!gearId || !_gearLedger.has(gearId)) {
      return { ok: false, error: 'gear_not_found' };
    }
    const gear = _gearLedger.get(gearId);

    // 负控制拦截：若装备存放于安全静态箱且载荷为 0，断言绝不产生莫名损耗
    const load = typeof stressLoad === 'number' ? Math.max(0, stressLoad) : 0;
    if (load === 0) {
      return {
        ok: true,
        gearId: gearId,
        durability: gear.durability,
        stage: gear.stage,
        damageSuffered: 0,
        message: 'Zero load applied; gear remains intact.'
      };
    }

    const sType = STRESS_TYPES.includes(stressType) ? stressType : 'impact';
    const matSpec = MATERIAL_TYPES[gear.materialType] || MATERIAL_TYPES.iron_steel;

    // 材质吸收与损耗计算：载荷超过材质硬度时损耗加剧
    let wearMultiplier = 1.0;
    if (sType === 'acid' && (gear.materialType === 'iron_steel' || gear.materialType === 'leather')) {
      wearMultiplier = 1.8;
    } else if (sType === 'heat' && (gear.materialType === 'wood' || gear.materialType === 'fabric')) {
      wearMultiplier = 2.2;
    } else if (sType === 'impact' && gear.materialType === 'crystal_gem') {
      wearMultiplier = 2.0; // 易脆碎
    }

    const damage = Math.round(load * wearMultiplier);
    gear.durability = Math.max(0, gear.durability - damage);
    gear.stressAccumulated += damage;
    gear.stage = _calcStage(gear.durability, gear.maxDurability);
    gear.lastUpdated = clockNow('gear-wear');

    const isBroken = gear.stage === 'shattered';

    return {
      ok: true,
      gearId: gearId,
      damageSuffered: damage,
      durability: gear.durability,
      maxDurability: gear.maxDurability,
      stage: gear.stage,
      broken: isBroken,
      protectionEffective: !isBroken
    };
  }

  /**
   * 修复装备耐久
   */
  function repairGear(gearId, repairPoints) {
    if (!gearId || !_gearLedger.has(gearId)) {
      return { ok: false, error: 'gear_not_found' };
    }
    const gear = _gearLedger.get(gearId);
    const pts = typeof repairPoints === 'number' ? Math.max(0, repairPoints) : 0;

    gear.durability = Math.min(gear.maxDurability, gear.durability + pts);
    gear.stage = _calcStage(gear.durability, gear.maxDurability);
    gear.lastUpdated = clockNow('gear-wear');

    return {
      ok: true,
      gearId: gearId,
      durability: gear.durability,
      maxDurability: gear.maxDurability,
      stage: gear.stage
    };
  }

  function getGearStatus(gearId) {
    if (!gearId || !_gearLedger.has(gearId)) return null;
    return Object.assign({}, _gearLedger.get(gearId));
  }

  function resetAll() {
    _gearLedger.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    STRESS_TYPES: STRESS_TYPES,
    MATERIAL_TYPES: MATERIAL_TYPES,
    registerGear: registerGear,
    applyStress: applyStress,
    repairGear: repairGear,
    getGearStatus: getGearStatus,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        registeredGearCount: _gearLedger.size,
        version: VERSION
      };
    }
  };

  WA.engines.gearWear = engine;
  WA.gearWear = engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();