/**
 * WorldAxis engines/ecosystem-predation.js (v2.340.0)
 * EXV18-3: 荒野生物本能捕食与生态链迁徙引擎 (Ecosystem Predation & Wild Instincts)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用荒野自然动力学生态模型。不局限于特定生物物种，无论是玄幻妖兽潮、
 * 荒野狼群、废土辐射变异兽、还是凡俗猛兽，均遵循自然法则与生物四驱力：
 *  1. 生物链生态位阶 (Ecological Niches):
 *     - 'apex_predator' (顶级掠食者，如虎、龙、暴龙、高阶凶兽)
 *     - 'pack_predator' (群体协作猎杀者，如狼群、迅猛龙、野狗)
 *     - 'prey_herbivore' (草食猎物，如鹿群、羊、角马)
 *     - 'scavenger' (食腐者，如秃鹫、鬣狗、尸虫)
 *  2. 动物本能驱动状态机 (Instinct Drives):
 *     - hungerLevel (饥饿度 0~100, >75 发动舍命捕食);
 *     - thirstLevel (口渴度 0~100, 趋向水源);
 *     - fearLevel (恐惧应激 0~100, 遇烈火/巨响/上位威压时溃逃);
 *     - scentTracking (下风向顺气味追踪猎物);
 *  3. 生态容量与迁徙演变 (Carrying Capacity):
 *     - 寒冬、暴雪或干旱天灾导致猎物群体断崖下跌；
 *     - 饥饿迫使深山掠食兽群越界突破生态红线，侵袭人类边境村落或袭击商道。
 *  4. 营火与声光防御 (Repellent Dynamics):
 *     - 明火营地 (campfire) 与金属巨响对常规掠食兽产生高额恐惧排斥；
 *     - 战场残存血腥味吸引食腐兽群汇聚。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};
  const VERSION = '2.340.0';

  const VALID_NICHES = Object.freeze(['apex_predator', 'pack_predator', 'prey_herbivore', 'scavenger']);

  // 生态区域台账: Map<regionId, RegionEcosystemRecord>
  const _ecosystems = new Map();

  function _clamp(n, min, max) {
    const num = Number(n);
    if (!isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function registerEcosystem(regionId, opts) {
    const id = _cleanStr(regionId, 48);
    if (!id) return { ok: false, reason: 'missing-region-id' };
    const opt = opts || {};
    const state = {
      regionId: id,
      preyPopulation: _clamp(opt.preyPopulation !== undefined ? opt.preyPopulation : 200, 0, 5000),
      predatorPacks: Array.isArray(opt.predatorPacks) ? opt.predatorPacks.slice() : [],
      scavengerCount: _clamp(opt.scavengerCount !== undefined ? opt.scavengerCount : 50, 0, 1000),
      carryingCapacity: _clamp(opt.carryingCapacity || 1000, 100, 10000),
      scentIntensity: _clamp(opt.scentIntensity || 0, 0, 100), // 区域血腥/气味残留
      hasActiveCampfire: !!opt.hasActiveCampfire,
      updatedAt: Date.now()
    };
    _ecosystems.set(id, state);
    return { ok: true, ecosystem: JSON.parse(JSON.stringify(state)) };
  }

  function getEcosystem(regionId) {
    const id = _cleanStr(regionId, 48);
    if (!id || !_ecosystems.has(id)) return null;
    return JSON.parse(JSON.stringify(_ecosystems.get(id)));
  }

  /**
   * 模拟荒野生态本能交互与捕食行为
   * @param {object} spec
   *   regionId, packId, hungerDelta, campfirePresent, weatherSevere, bloodSpill
   */
  function simulatePredation(spec) {
    const s = spec || {};
    const regId = _cleanStr(s.regionId, 48);
    if (!regId) return { ok: false, reason: 'missing-region-id' };

    let eco = _ecosystems.get(regId);
    if (!eco) {
      registerEcosystem(regId, {});
      eco = _ecosystems.get(regId);
    }

    const packId = _cleanStr(s.packId, 48) || 'wolf_pack_alpha';
    let pack = eco.predatorPacks.find(p => p.id === packId);
    if (!pack) {
      pack = {
        id: packId,
        species: s.species || 'wild_wolf',
        count: _clamp(s.count || 8, 1, 100),
        hunger: _clamp(s.initialHunger || 50, 0, 100),
        morale: 80,
        targetSettlement: null
      };
      eco.predatorPacks.push(pack);
    }

    const campfire = s.campfirePresent !== undefined ? !!s.campfirePresent : eco.hasActiveCampfire;
    const weatherSevere = !!s.weatherSevere;
    const bloodSpill = _clamp(s.bloodSpill || 0, 0, 100);

    // 负控制铁律：当野兽饱腹（hunger <= 20）且营地有熊熊篝火防御时，断言绝不主动发动突击
    if (pack.hunger <= 20 && campfire) {
      return { ok: false, reason: 'sated-beasts-repelled-by-fire' };
    }

    // 演化推进
    const hungerGain = _clamp(s.hungerDelta !== undefined ? s.hungerDelta : 15, 0, 50);
    pack.hunger = Math.min(100, pack.hunger + hungerGain);
    if (bloodSpill > 0) {
      eco.scentIntensity = Math.min(100, eco.scentIntensity + bloodSpill);
      eco.scavengerCount = Math.min(1000, eco.scavengerCount + Math.round(bloodSpill * 0.5));
    }

    // 极端气候削减草食猎物
    if (weatherSevere) {
      eco.preyPopulation = Math.max(0, eco.preyPopulation - 40);
    }

    const result = {
      ok: true,
      regionId: regId,
      packId: packId,
      hungerLevel: pack.hunger,
      actionTaken: 'patrol', // 'hunted_prey' | 'repelled_by_fire' | 'raided_settlement' | 'patrol'
      preyConsumed: 0,
      scavengersGathered: eco.scavengerCount,
      summary: ''
    };

    // 行为决策树
    if (campfire && pack.hunger < 85) {
      // 畏火退避
      result.actionTaken = 'repelled_by_fire';
      result.summary = `夜色中兽群眼冒绿光靠近营地，但畏惧熊熊篝火与火把噼啪声，呜咽逡巡后退回树林深处。`;
    } else if (eco.preyPopulation > 20 && pack.hunger >= 50) {
      // 荒野自然捕食猎物
      const killCount = Math.min(eco.preyPopulation, Math.round(pack.count * 1.5));
      eco.preyPopulation -= killCount;
      pack.hunger = Math.max(0, pack.hunger - 45);
      result.actionTaken = 'hunted_prey';
      result.preyConsumed = killCount;
      result.summary = `${pack.species} 群协作围猎，在山谷捕杀 ${killCount} 头野鹿，撕咬饱餐后饥饿显著平息。`;
    } else if (eco.preyPopulation <= 20 && pack.hunger >= 80) {
      // 猎物断绝且极度饥饿 -> 孤注一掷突袭人类定居点或车队
      result.actionTaken = 'raided_settlement';
      pack.targetSettlement = s.targetSettlement || 'border_outpost';
      result.summary = `大雪封山猎物灭绝！饥肠辘辘的 ${pack.species} 群被逼入绝境，突破荒野防线狂暴袭击 ${pack.targetSettlement}！`;
    } else {
      result.actionTaken = 'patrol';
      result.summary = `兽群在领地边缘游荡巡视，警惕嗅探空气中的顺风气味。`;
    }

    eco.hasActiveCampfire = campfire;
    eco.updatedAt = Date.now();

    return result;
  }

  function resetAll() {
    _ecosystems.clear();
  }

  /**
   * OPV19-7: 野兽趋利避害与定居点灯火防护哨卫结界威慑判定
   */
  function checkPerimeterDeterrent(beastId, settlementId, envSpec) {
    beastId = String(beastId || 'beast_pack').trim();
    settlementId = String(settlementId || 'settlement_camp').trim();
    envSpec = envSpec || {};

    const fireDeterrent = !!envSpec.fireDeterrent; // 是否有营火篝火
    const barrier = !!envSpec.barrier;             // 是否有木栅栏/城墙
    const acousticWarning = !!envSpec.acousticWarning; // 是否有号角/钟声
    const hungerLevel = envSpec.hunger != null ? Number(envSpec.hunger) : 60; // 0~100
    const isFrenzy = hungerLevel >= 95 || !!envSpec.frenzy;

    // 破坏性负控制：面对毫无灯火防具且无警报的营地，野兽绝对不会无故惊慌逃逸
    if (!fireDeterrent && !barrier && !acousticWarning && !isFrenzy) {
      return {
        ok: false,
        refusal: 'no-deterrent-present',
        reason: '该定居点/营地周围无任何篝火、栅栏或声响防御结界，野兽绝不会无故惊慌逃跑！',
        beastId: beastId,
        settlementId: settlementId
      };
    }

    if (isFrenzy) {
      // 狂暴突破火线
      return {
        ok: true,
        beastId: beastId,
        settlementId: settlementId,
        deterred: false,
        frenzyBreakthrough: true,
        narrative: `饥饿突破极限（饥饿度 ${hungerLevel}）！猛兽眼眶猩红丧失痛觉，竟悍然顶着火把浓烟跨越栅栏发起自杀式突袭！`
      };
    }

    // 正常被威慑逼退
    let deterrentFactor = 0;
    if (fireDeterrent) deterrentFactor += 50;
    if (barrier) deterrentFactor += 30;
    if (acousticWarning) deterrentFactor += 20;

    return {
      ok: true,
      beastId: beastId,
      settlementId: settlementId,
      deterred: true,
      deterrentScore: deterrentFactor,
      narrative: `营地周遭熊熊火光照亮荒野，号角声此起彼伏，兽群低吼着被逼退在防御圈 15 米开外，徘徊逡巡不敢贸然进犯。`
    };
  }

  function diagnose() {
    return {
      ok: true,
      version: VERSION,
      ecosystemsCount: _ecosystems.size,
      niches: VALID_NICHES
    };
  }
  const exportObj = {
    registerEcosystem: registerEcosystem,
    getEcosystem: getEcosystem,
    simulatePredation: simulatePredation,
    checkPerimeterDeterrent: checkPerimeterDeterrent,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.ecosystemPredation = exportObj;
  WA.engines.ecosystemPredation = exportObj;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/ecosystem-predation.js', { kind: 'engine', ver: VERSION });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();