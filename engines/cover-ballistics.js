/**
 * WorldAxis engines/cover-ballistics.js (v2.330.0)
 * EXV16-8: 微观空间掩体物理防护与流弹穿透破片引擎 (Cover Physics & Ballistic Penetration)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 抽象通用掩体物理防御阻抗与动能飞行投射物穿透模型。无论弓箭暗器、火枪弹丸、
 * 飞剑法宝还是飞溅的碎石爆炸破片：
 *  - 掩体材质阻滞力 (Stopping Power):
 *     fabric_screen (布帘屏风: 阻滞 5, 穿透率 95%)
 *     wood_barrier (实木板障: 阻滞 35, 吸收中度动能)
 *     brick_masonry (砖砌矮墙: 阻滞 80, 防跳弹)
 *     reinforced_stone (厚花岗岩/玄武岩: 阻滞 180, 绝对吸收, 产生碎屑流弹)
 *     metal_plate (钢板/玄铁甲: 阻滞 220, 高偏折防穿透)
 *  - 穿透伤害计算：Residual_Damage = max(0, Projectile_Energy - Stopping_Power)
 *  - 核心方法：
 *     - resolveCoverProtection(opts)
 *     - registerCoverNode(nodeId, materialType, coverHp)
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

  const COVER_MATERIALS = Object.freeze({
    fabric_screen: { stoppingPower: 5, ricochetRisk: 0.0, spallRisk: 0.0, penetrationAllowed: true },
    wood_barrier: { stoppingPower: 35, ricochetRisk: 0.05, spallRisk: 0.1, penetrationAllowed: true },
    brick_masonry: { stoppingPower: 85, ricochetRisk: 0.2, spallRisk: 0.25, penetrationAllowed: true },
    reinforced_stone: { stoppingPower: 200, ricochetRisk: 0.4, spallRisk: 0.35, penetrationAllowed: false },
    metal_plate: { stoppingPower: 250, ricochetRisk: 0.6, spallRisk: 0.15, penetrationAllowed: false }
  });

  // 掩体节点登记: Map<nodeId, { materialType, coverHp, maxHp, destroyed }>
  const _coverNodes = new Map();

  function registerCoverNode(nodeId, materialType, coverHp) {
    if (!nodeId) return { ok: false, error: 'missing_node_id' };
    const mat = COVER_MATERIALS[materialType] ? materialType : 'wood_barrier';
    const hp = typeof coverHp === 'number' && coverHp > 0 ? coverHp : 100;
    const cover = {
      nodeId: nodeId,
      materialType: mat,
      coverHp: hp,
      maxHp: hp,
      destroyed: false,
      lastUpdated: clockNow('cover-ballistics')
    };
    _coverNodes.set(nodeId, cover);
    return { ok: true, cover: Object.assign({}, cover) };
  }

  /**
   * 掩体物理防护与动能穿透结算
   * @param {Object} opts {
   *   targetId: string,
   *   projectileEnergy: number, // 投射物动能点数 (例如弓箭 30, 火枪 70, 巨石/狙击 150)
   *   coverMaterial: string, // 'fabric_screen' | 'wood_barrier' | 'brick_masonry' | 'reinforced_stone' | 'metal_plate'
   *   coverNodeId: string,
   *   noCover: boolean // 是否完全无掩体 (负控制用)
   * }
   */
  function resolveCoverProtection(opts) {
    if (!opts || !opts.targetId) {
      return { ok: false, error: 'missing_target_id' };
    }

    const energy = typeof opts.projectileEnergy === 'number' ? Math.max(0, opts.projectileEnergy) : 50;

    // 负控制拦截：若角色毫无掩体 (noCover: true)，动能直接 100% 作用于肉体
    if (opts.noCover === true) {
      return {
        ok: true,
        targetId: opts.targetId,
        hasCover: false,
        stoppingPower: 0,
        penetrationOccurred: true,
        residualDamage: energy,
        absorbedDamage: 0,
        message: 'Target is completely exposed without cover; full impact taken.'
      };
    }

    const matKey = opts.coverMaterial && COVER_MATERIALS[opts.coverMaterial]
      ? opts.coverMaterial
      : 'wood_barrier';
    const mat = COVER_MATERIALS[matKey];

    // 负控制拦截：轻质布帘屏风面对重型攻击，掩体防御阻抗判定为 0，穿透率 100%
    if (matKey === 'fabric_screen' && energy >= 30) {
      return {
        ok: true,
        targetId: opts.targetId,
        hasCover: true,
        coverMaterial: matKey,
        stoppingPower: 0,
        penetrationOccurred: true,
        residualDamage: energy,
        absorbedDamage: 0,
        message: 'Fabric screen provides negligible resistance; high-energy projectile penetrated fully.'
      };
    }

    const stopping = mat.stoppingPower;
    const absorbed = Math.min(energy, stopping);
    const residual = Math.max(0, energy - stopping);
    const penetrated = residual > 0;

    // 碎石流弹破片或跳弹次生伤害
    let secondaryShrapnel = 0;
    if (mat.spallRisk > 0 && energy >= 80) {
      secondaryShrapnel = Math.round(energy * mat.spallRisk * 0.2);
    }

    // 掩体扣血磨损
    if (opts.coverNodeId && _coverNodes.has(opts.coverNodeId)) {
      const c = _coverNodes.get(opts.coverNodeId);
      c.coverHp = Math.max(0, c.coverHp - absorbed);
      if (c.coverHp <= 0) c.destroyed = true;
    }

    return {
      ok: true,
      targetId: opts.targetId,
      hasCover: true,
      coverMaterial: matKey,
      stoppingPower: stopping,
      absorbedDamage: absorbed,
      residualDamage: residual,
      penetrationOccurred: penetrated,
      secondaryShrapnelDamage: secondaryShrapnel,
      totalDamageTaken: residual + secondaryShrapnel
    };
  }

  function getCoverStatus(nodeId) {
    if (!nodeId || !_coverNodes.has(nodeId)) return null;
    return Object.assign({}, _coverNodes.get(nodeId));
  }

  function resetAll() {
    _coverNodes.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    COVER_MATERIALS: COVER_MATERIALS,
    registerCoverNode: registerCoverNode,
    resolveCoverProtection: resolveCoverProtection,
    getCoverStatus: getCoverStatus,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        registeredCoversCount: _coverNodes.size,
        version: VERSION
      };
    }
  };

  WA.engines.coverBallistics = engine;
  WA.coverBallistics = engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();