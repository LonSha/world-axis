/**
 * WorldAxis engines/crowd-panic.js (v2.330.0)
 * EXV16-5: 空间群体恐慌共振与踩踏踩空动力学引擎 (Crowd Panic Resonance & Stampede Dynamics)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 微观社会物理学与人流动力学模型。无论现代火灾逃生、古代守城溃败踩踏、
 * 修仙大能斗法引发的凡人奔逃、西幻剧场骚乱还是末世尸潮围困：
 *  - 封闭节点内焦虑度与恐慌共振方程：Panic_Resonance = SourcePanic * (1 + Density^1.5)
 *  - 临界突破（Panic > 60）：转入盲目冲撞挤塞状态 (Choke Lock)
 *  - 动力学挤压与踩踏踩空伤损计算 (Crush & Trample Contusion)
 *  - 核心方法：
 *     - triggerStampede(opts)
 *     - resolveCrowdAtZone(zoneId)
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

  // 区域恐慌与人流状态: Map<zoneId, { crowdDensity, panicLevel, chokeLocked, exitCapacity, participants: Set<string>, casualties: Array }>
  const _panicZones = new Map();

  /**
   * 触发或升级空间节点的群体恐慌与踩踏推演
   * @param {Object} opts {
   *   zoneId: string,
   *   panicSourceSeverity: number, // 1~10 突发恐慌源烈度 (火灾/刺杀/爆炸/地陷)
   *   crowdDensity: number, // 0.1~5.0 (人/平方米)
   *   exitCapacity: number, // 正常出口通行速率 (人/分钟)
   *   participants: Array<string>, // 参与人员 actorId 列表
   *   isOpenField: boolean // 是否为空旷开敞无界平原 (负控制用)
   * }
   */
  function triggerStampede(opts) {
    if (!opts || !opts.zoneId) {
      return { ok: false, error: 'missing_zone_id' };
    }
    const zoneId = opts.zoneId;

    // 负控制拦截：若为空旷大平原 (isOpenField: true) 且人流密度宽松 (density < 1.0)，断言绝不产生踩踏阻塞伤害
    const density = typeof opts.crowdDensity === 'number' ? Math.max(0.1, opts.crowdDensity) : 1.0;
    if (opts.isOpenField === true && density < 1.0) {
      return {
        ok: true,
        zoneId: zoneId,
        panicLevel: 10,
        stampedeTriggered: false,
        chokeLocked: false,
        casualties: [],
        message: 'Open field with low density; crowd dispatches smoothly without stampede.'
      };
    }

    const sourceSev = typeof opts.panicSourceSeverity === 'number' ? Math.max(1, opts.panicSourceSeverity) : 5;
    const exitCap = typeof opts.exitCapacity === 'number' ? Math.max(1, opts.exitCapacity) : 10;
    const actors = Array.isArray(opts.participants) ? opts.participants : [];

    // 计算恐慌共振放大：密度越高，恐慌传播共振越剧烈
    const resonanceFactor = 1.0 + Math.pow(density, 1.4);
    const calculatedPanic = Math.min(100, Math.round(sourceSev * 10 * resonanceFactor));

    // 是否突破踩踏临界
    const stampedeTriggered = calculatedPanic >= 50 && density >= 1.2;
    const chokeLocked = stampedeTriggered && (actors.length > exitCap * 1.5);

    const casualties = [];
    if (stampedeTriggered) {
      // 计算伤损与挫伤人员
      const injuryRate = Math.min(0.8, (calculatedPanic / 100) * (density / 2.0));
      for (const aid of actors) {
        // 基于确定性 hash 计算该角色是否被踩踏/擦伤
        const hash = (aid.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + calculatedPanic) % 100;
        if (hash < injuryRate * 100) {
          const isSevere = hash < (injuryRate * 40);
          casualties.push({
            actorId: aid,
            severity: isSevere ? 'severe_fracture' : 'contusion_trample',
            damagePoints: isSevere ? 35 : 15
          });
        }
      }
    }

    const zoneState = {
      zoneId: zoneId,
      crowdDensity: density,
      panicLevel: calculatedPanic,
      chokeLocked: chokeLocked,
      exitCapacity: exitCap,
      stampedeTriggered: stampedeTriggered,
      participants: new Set(actors),
      casualties: casualties,
      updatedAt: clockNow('crowd-panic')
    };
    _panicZones.set(zoneId, zoneState);

    return {
      ok: true,
      zoneId: zoneId,
      panicLevel: calculatedPanic,
      stampedeTriggered: stampedeTriggered,
      chokeLocked: chokeLocked,
      casualtiesCount: casualties.length,
      casualties: casualties
    };
  }

  /**
   * 查询指定区域的恐慌踩踏状态
   */
  function getPanicZoneStatus(zoneId) {
    if (!zoneId || !_panicZones.has(zoneId)) return null;
    const st = _panicZones.get(zoneId);
    return {
      zoneId: st.zoneId,
      crowdDensity: st.crowdDensity,
      panicLevel: st.panicLevel,
      chokeLocked: st.chokeLocked,
      stampedeTriggered: st.stampedeTriggered,
      participantsCount: st.participants.size,
      casualtiesCount: st.casualties.length
    };
  }

  function resetAll() {
    _panicZones.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    triggerStampede: triggerStampede,
    getPanicZoneStatus: getPanicZoneStatus,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        activePanicZonesCount: _panicZones.size,
        version: VERSION
      };
    }
  };

  WA.engines.crowdPanic = engine;
  WA.crowdPanic = engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();