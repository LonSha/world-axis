/**
 * WorldAxis engines/tactical-combat.js (v2.340.0)
 * EXV18-1: 具身战术交锋与致命要害创伤仲裁引擎 (Tactical Combat & Anatomical Trauma)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 普适通用且具身的战术对抗模型。无论是冷兵器白刃格斗、特警近距交火、武侠功法对决、
 * 还是机甲肉搏碰撞，均不依赖抽象的“血条平扣”，而是基于具身力学与战术行为：
 *  1. 姿态与平衡槽 (Posture 0~100):
 *     - 受到重击或被虚招诱骗时扣减；
 *     - 姿态崩解 (posture breakdown, <= 0) 时角色失去平衡倒地或产生大硬直，防御阻抗归零。
 *  2. 战术行为交互矩阵 (Tactical Actions):
 *     - 'strike' (强攻突刺): 输出物理破伤，易被 parry；
 *     - 'parry' (招架格挡): 依靠武器/盾牌硬抗动能，自身武器承受磨损，化解伤害并反震对手姿态；
 *     - 'dodge' (闪避步法): 消耗耐力彻底规避伤害，规避成功让对方招式落空硬直；
 *     - 'feint' (虚招诱骗): 破坏对方招架时机，重挫其姿态值；
 *     - 'disarm' (缴械锁技): 目标姿态受损时触发兵刃脱手。
 *  3. 要害部位解剖学创伤 (Anatomical Trauma Zones):
 *     - 'head' (头部): 脑震荡、眩晕昏厥、视野丧失；
 *     - 'torso' (胸腹): 内脏挫伤、气胸剧痛、体力恢复熔断；
 *     - 'arms' (双手/手臂): 骨裂断折、兵刃脱手、命中率骤降；
 *     - 'legs' (双腿/足踝): 断腿筋伤、移动减速、无法闪避。
 *  4. 创伤物理后果:
 *     - 创伤伴随大出血 (severe_bleeding) 与伤残惊恐精神代偿 (psychicStress)。
 *     - 武器防具耐久 (gear-wear) 承受真实应力冲击，临界时断裂。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};
  const VERSION = '2.340.0';

  const VALID_ACTIONS = Object.freeze(['strike', 'parry', 'dodge', 'feint', 'disarm']);
  const VALID_ZONES = Object.freeze(['head', 'torso', 'arms', 'legs']);

  // 战斗实体状态表: Map<actorId, CombatantState>
  const _combatants = new Map();

  function _clamp(n, min, max) {
    const num = Number(n);
    if (!isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function registerCombatant(actorId, opts) {
    const id = _cleanStr(actorId, 48);
    if (!id) return { ok: false, reason: 'missing-actor-id' };
    const opt = opts || {};
    const state = {
      actorId: id,
      posture: _clamp(opt.posture !== undefined ? opt.posture : 100, 0, 100),
      stamina: _clamp(opt.stamina !== undefined ? opt.stamina : 100, 0, 100),
      traumaZones: {
        head: { injured: false, severity: 0, desc: '' },
        torso: { injured: false, severity: 0, desc: '' },
        arms: { injured: false, severity: 0, desc: '' },
        legs: { injured: false, severity: 0, desc: '' }
      },
      bleedingRate: 0, // 每轮流失点数
      weaponId: _cleanStr(opt.weaponId, 48) || 'unarmed',
      isDisarmed: false,
      postureBroken: false,
      updatedAt: Date.now()
    };
    _combatants.set(id, state);
    return { ok: true, state: JSON.parse(JSON.stringify(state)) };
  }

  function getCombatant(actorId) {
    const id = _cleanStr(actorId, 48);
    if (!id || !_combatants.has(id)) return null;
    return JSON.parse(JSON.stringify(_combatants.get(id)));
  }

  /**
   * 战术对抗核心仲裁入口
   * @param {object} spec 
   *   attackerId, defenderId, attackAction ('strike'|'feint'|'disarm'),
   *   defendAction ('parry'|'dodge'|'none'), targetZone ('head'|'torso'|'arms'|'legs'),
   *   attackPower (0~100), defensePower (0~100), attackerStealth (0~100), distanceMeters
   */
  function resolveClash(spec) {
    const s = spec || {};
    const attId = _cleanStr(s.attackerId, 48);
    const defId = _cleanStr(s.defenderId, 48);
    if (!attId || !defId) return { ok: false, reason: 'missing-combatants' };
    if (attId === defId) return { ok: false, reason: 'cannot-clash-self' };

    let att = _combatants.get(attId);
    if (!att) {
      registerCombatant(attId, { weaponId: s.attackerWeaponId });
      att = _combatants.get(attId);
    }
    let def = _combatants.get(defId);
    if (!def) {
      registerCombatant(defId, { weaponId: s.defenderWeaponId });
      def = _combatants.get(defId);
    }

    const attackAction = VALID_ACTIONS.includes(s.attackAction) ? s.attackAction : 'strike';
    let defendAction = s.defendAction || 'none';
    if (!['parry', 'dodge', 'none'].includes(defendAction)) defendAction = 'none';
    const targetZone = VALID_ZONES.includes(s.targetZone) ? s.targetZone : 'torso';

    const attPower = _clamp(s.attackPower !== undefined ? s.attackPower : 50, 1, 100);
    const defPower = _clamp(s.defensePower !== undefined ? s.defensePower : 40, 0, 100);
    const stealthRating = _clamp(s.attackerStealth || 0, 0, 100);
    const distanceMeters = typeof s.distanceMeters === 'number' ? s.distanceMeters : 1.5;

    // 负控制铁律 1：背后无知盲区偷袭（stealth == 100 且近身 <= 1.5m），防守方绝不可能完美招架
    if (stealthRating >= 95 && distanceMeters <= 1.5 && defendAction === 'parry') {
      return { ok: false, reason: 'unaware-blindspot-cannot-parry' };
    }

    // 姿态崩溃角色无法进行有效防御
    if (def.postureBroken && defendAction !== 'none') {
      defendAction = 'none';
    }

    const result = {
      ok: true,
      attackerId: attId,
      defenderId: defId,
      clashOutcome: 'hit', // 'hit' | 'parried' | 'dodged' | 'feint_success' | 'disarmed'
      damageDealt: 0,
      targetZone: targetZone,
      traumaInflicted: null,
      postureDamageDef: 0,
      postureDamageAtt: 0,
      gearStressApplied: false,
      summary: ''
    };

    // 1. 虚招博弈 (feint)
    if (attackAction === 'feint') {
      if (defendAction === 'parry') {
        // 诱骗招架成功，防守方大硬直，姿态暴扣
        const pLoss = Math.round(attPower * 0.7);
        def.posture = Math.max(0, def.posture - pLoss);
        result.clashOutcome = 'feint_success';
        result.postureDamageDef = pLoss;
        result.summary = `虚招佯攻成功欺骗防御步调，${defId} 姿态失衡暴跌 ${pLoss} 点！`;
      } else {
        result.clashOutcome = 'feint_failed';
        result.summary = `${defId} 未受虚招诱导，严防死守。`;
      }
    }
    // 2. 招架博弈 (parry)
    else if (defendAction === 'parry') {
      if (defPower >= attPower * 0.8) {
        // 成功招架
        result.clashOutcome = 'parried';
        const attPostLoss = Math.round(defPower * 0.4);
        att.posture = Math.max(0, att.posture - attPostLoss);
        result.postureDamageAtt = attPostLoss;
        result.summary = `${defId} 兵刃横架完美封拆突击，强劲反震导致 ${attId} 虎口剧痛后挫！`;

        // 武器应力联动 (gear-wear)
        if (WA.gearWear && typeof WA.gearWear.applyStress === 'function' && def.weaponId !== 'unarmed') {
          WA.gearWear.applyStress(def.weaponId, Math.round(attPower * 0.5), 'impact');
          result.gearStressApplied = true;
        }
      } else {
        // 招架不完全，穿透格挡破防
        result.clashOutcome = 'hit';
        const penetrationDmg = Math.round(attPower - defPower * 0.5);
        result.damageDealt = penetrationDmg;
        result.summary = `${defId} 举刃勉强招架，但巨力透体撕裂防线，命中 ${targetZone}！`;
      }
    }
    // 3. 闪避博弈 (dodge)
    else if (defendAction === 'dodge') {
      if (defPower >= attPower * 0.7) {
        result.clashOutcome = 'dodged';
        def.stamina = Math.max(0, def.stamina - 15);
        result.summary = `${defId} 侧身滑步险险避开锋芒，锋刃擦身而过！`;
      } else {
        result.clashOutcome = 'hit';
        result.damageDealt = Math.round(attPower * 0.8);
        result.summary = `${defId} 闪避不及被锋刃带倒，重创 ${targetZone}！`;
      }
    }
    // 4. 直接命中或强攻破防 (strike / none)
    else {
      result.clashOutcome = 'hit';
      result.damageDealt = attPower;
      result.summary = `${attId} 杀招正面暴击，重重轰击在 ${defId} 的 ${targetZone}！`;
    }

    // 创伤与要害结算
    if (result.clashOutcome === 'hit' && result.damageDealt > 0) {
      const zoneRec = def.traumaZones[targetZone];
      zoneRec.injured = true;
      zoneRec.severity = Math.min(100, zoneRec.severity + Math.round(result.damageDealt * 0.8));

      let traumaDesc = '';
      if (targetZone === 'head') {
        traumaDesc = '剧烈脑震荡与额角骨裂，视野昏黑眩晕';
        def.posture = Math.max(0, def.posture - 40);
      } else if (targetZone === 'torso') {
        traumaDesc = '胸肋骨折大出血，脏器剧痛呼吸困难';
        def.bleedingRate += 8;
      } else if (targetZone === 'arms') {
        traumaDesc = '手臂关节撕裂断折，创口血流不止';
        def.bleedingRate += 5;
        if (result.damageDealt >= 50) {
          def.isDisarmed = true;
          traumaDesc += '，兵器当场崩飞脱手！';
        }
      } else if (targetZone === 'legs') {
        traumaDesc = '足踝贯穿伤筋，腿骨受创失去灵动步法';
        def.stamina = Math.max(0, def.stamina - 30);
        def.bleedingRate += 4;
      }
      zoneRec.desc = traumaDesc;
      result.traumaInflicted = { zone: targetZone, severity: zoneRec.severity, desc: traumaDesc };

      // 联动生理与惊恐系统 (metabolism-clock psychic stress)
      if (WA.metabolismClock && typeof WA.metabolismClock.applyPsychicStress === 'function') {
        WA.metabolismClock.applyPsychicStress(defId, Math.round(result.damageDealt * 0.6), `combat_trauma_${targetZone}`);
      }
    }

    // 姿态崩溃判定
    if (def.posture <= 0) {
      def.postureBroken = true;
      result.summary += ` [姿态崩溃] ${defId} 重心彻底瓦解，陷入僵直瘫倒！`;
    }

    att.updatedAt = Date.now();
    def.updatedAt = Date.now();

    return result;
  }

  function resetAll() {
    _combatants.clear();
  }

  function diagnose() {
    return {
      ok: true,
      version: VERSION,
      combatantsCount: _combatants.size,
      actions: VALID_ACTIONS,
      zones: VALID_ZONES
    };
  }

  const exportObj = {
    registerCombatant: registerCombatant,
    getCombatant: getCombatant,
    resolveClash: resolveClash,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.tacticalCombat = exportObj;
  WA.engines.tacticalCombat = exportObj;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/tactical-combat.js', { kind: 'engine', ver: VERSION });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();
