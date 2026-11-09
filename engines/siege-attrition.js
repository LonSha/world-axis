/**
 * WorldAxis engines/siege-attrition.js (v2.340.0)
 * EXV18-4: 宏观围城消耗战与后勤辎重断粮引擎 (Siege Attrition & Logistics Starvation)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 抽象宏观据点围困动力学模型。不论是中世纪城堡要塞封锁、二战斯大林格勒/列宁格勒围城、
 * 玄幻宗门护山大阵封闭、废土避难所被尸潮围困，还是星际基地被轨道封锁：
 *  1. 围城态势四大核心指标:
 *     - fortification: 城防/工事完整度 (0~100);
 *     - rationDays: 粮食淡水储备可用天数 (0~365);
 *     - epidemicIndex: 疫病感染与恶劣卫生度 (0~100);
 *     - morale: 守军与城内军民士气 (0~100).
 *  2. 攻守对抗战术与封锁严苛度 (Blockade Dynamics):
 *     - blockadeTightness (0~100): 封锁严密系数，>=80 时补给线与走私彻底断绝；
 *     - siegeTactic:
 *       · 'starvation_blockade' (长围久困，静待粮绝);
 *       · 'bombardment' (投石/重炮/神雷轰击城墙);
 *       · 'poison_water' (污染水源，催生疫病);
 *       · 'tunnel_undermine' (暗挖地道破坏地基).
 *  3. 断粮与心理崩溃演变阶段 (Starvation Stages):
 *     - 'plentiful' (给养充足) -> 'rationed' (限量配给) -> 'starving' (杀马煮革/人相食) -> 'collapsed' (军心哗变/开城投降).
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};
  const VERSION = '2.340.0';

  const VALID_TACTICS = Object.freeze(['starvation_blockade', 'bombardment', 'poison_water', 'tunnel_undermine']);
  const VALID_STAGES = Object.freeze(['plentiful', 'rationed', 'starving', 'collapsed']);

  // 要塞围城台账: Map<fortressId, FortressSiegeRecord>
  const _fortresses = new Map();

  function _clamp(n, min, max) {
    const num = Number(n);
    if (!isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function registerFortress(fortressId, opts) {
    const id = _cleanStr(fortressId, 48);
    if (!id) return { ok: false, reason: 'missing-fortress-id' };
    const opt = opts || {};
    const state = {
      fortressId: id,
      fortification: _clamp(opt.fortification !== undefined ? opt.fortification : 100, 0, 100),
      rationDays: _clamp(opt.rationDays !== undefined ? opt.rationDays : 60, 0, 365),
      epidemicIndex: _clamp(opt.epidemicIndex || 0, 0, 100),
      morale: _clamp(opt.morale !== undefined ? opt.morale : 100, 0, 100),
      blockadeTightness: _clamp(opt.blockadeTightness || 0, 0, 100),
      stage: opt.stage || 'plentiful',
      isFallen: false,
      fallReason: '',
      updatedAt: clockNow('siege-attrition')
    };
    _fortresses.set(id, state);
    return { ok: true, fortress: JSON.parse(JSON.stringify(state)) };
  }

  function getFortress(fortressId) {
    const id = _cleanStr(fortressId, 48);
    if (!id || !_fortresses.has(id)) return null;
    return JSON.parse(JSON.stringify(_fortresses.get(id)));
  }

  /**
   * 推进围城时间与攻城战术演变
   * @param {object} spec
   *   fortressId, besiegerId, daysElapsed, tactic, blockadeTightness
   */
  function advanceSiege(spec) {
    const s = spec || {};
    const fortId = _cleanStr(s.fortressId, 48);
    if (!fortId) return { ok: false, reason: 'missing-fortress-id' };

    let fort = _fortresses.get(fortId);
    if (!fort) {
      registerFortress(fortId, {});
      fort = _fortresses.get(fortId);
    }

    const daysElapsed = _clamp(s.daysElapsed !== undefined ? s.daysElapsed : 7, 1, 60);
    const tactic = VALID_TACTICS.includes(s.tactic) ? s.tactic : 'starvation_blockade';
    const tightness = _clamp(s.blockadeTightness !== undefined ? s.blockadeTightness : fort.blockadeTightness, 0, 100);
    fort.blockadeTightness = tightness;

    // 负控制铁律：当粮食储备充裕（rationDays > 30）且无封锁或封锁为 0 时，绝不允许无故触发断粮哗变
    if (fort.rationDays > 30 && tightness === 0 && (s.forceSurrender || s.triggerMutiny)) {
      return { ok: false, reason: 'ample-supplies-cannot-collapse' };
    }

    const result = {
      ok: true,
      fortressId: fortId,
      daysElapsed: daysElapsed,
      rationDaysRemaining: 0,
      fortificationRemaining: 0,
      moraleRemaining: 0,
      epidemicIndex: 0,
      stage: fort.stage,
      mutinyTriggered: false,
      isFallen: false,
      summary: ''
    };

    // 1. 消耗粮食与后勤
    if (tightness >= 50) {
      fort.rationDays = Math.max(0, fort.rationDays - daysElapsed);
    } else {
      // 外部有小规模走私偷运，消耗打折
      fort.rationDays = Math.max(0, fort.rationDays - Math.round(daysElapsed * 0.5));
    }

    // 2. 攻城战术伤害
    if (tactic === 'bombardment') {
      const wallDmg = Math.round(daysElapsed * 2.5);
      fort.fortification = Math.max(0, fort.fortification - wallDmg);
      fort.morale = Math.max(0, fort.morale - Math.round(daysElapsed * 1.5));
      result.summary += `飞石雷火持续轰击城头，城防受创损耗 ${wallDmg} 点！`;
    } else if (tactic === 'poison_water') {
      const epiGain = Math.round(daysElapsed * 3.0);
      fort.epidemicIndex = Math.min(100, fort.epidemicIndex + epiGain);
      fort.morale = Math.max(0, fort.morale - Math.round(daysElapsed * 2.0));
      result.summary += `水源被投入污秽腐尸，城内爆发恶性伤寒疫病，卫生急剧恶化！`;
    } else if (tactic === 'tunnel_undermine') {
      fort.fortification = Math.max(0, fort.fortification - Math.round(daysElapsed * 3.5));
      result.summary += `工兵昼夜暗挖地道掏空城基，城堞出现触目惊心的巨大地陷裂痕！`;
    } else {
      result.summary += `敌军铁桶合围围而不打，长围封锁静待城内自毙。`;
    }

    // 3. 饥荒与士气阶梯演化
    if (fort.rationDays <= 0) {
      fort.stage = 'collapsed';
      fort.morale = Math.max(0, fort.morale - 40);
      result.summary += ` [绝粮] 仓廪见底，军民杀马煮皮带，士气雪崩！`;
    } else if (fort.rationDays < 15) {
      fort.stage = 'starving';
      fort.morale = Math.max(0, fort.morale - 20);
      result.summary += ` [饥馑] 粮秣告急削减配给，每日仅有一勺稀粥，怨声载道。`;
    } else if (fort.rationDays < 30) {
      fort.stage = 'rationed';
    } else {
      fort.stage = 'plentiful';
    }

    // 4. 城陷与哗变判定
    if (fort.fortification <= 0) {
      fort.isFallen = true;
      fort.fallReason = 'walls_breached';
      result.isFallen = true;
      result.summary += ` [城破] 城墙轰然垮塌，敌军突入缺口城防沦陷！`;
    } else if (fort.morale <= 0 || (fort.rationDays === 0 && fort.morale < 30)) {
      fort.isFallen = true;
      fort.fallReason = 'mutiny_surrender';
      result.mutinyTriggered = true;
      result.isFallen = true;
      result.summary += ` [哗变] 守军不堪绝境饥渴，发动兵变斩杀死战将领，开门纳降！`;
    }

    result.rationDaysRemaining = fort.rationDays;
    result.fortificationRemaining = fort.fortification;
    result.moraleRemaining = fort.morale;
    result.epidemicIndex = fort.epidemicIndex;
    result.stage = fort.stage;
    result.isFallen = fort.isFallen;
    fort.updatedAt = clockNow('siege-attrition');

    return result;
  }

  function resetAll() {
    _fortresses.clear();
  }

  function diagnose() {
    return {
      ok: true,
      version: VERSION,
      fortressesCount: _fortresses.size,
      tactics: VALID_TACTICS,
      stages: VALID_STAGES
    };
  }

  const exportObj = {
    registerFortress: registerFortress,
    getFortress: getFortress,
    advanceSiege: advanceSiege,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.siegeAttrition = exportObj;
  WA.engines.siegeAttrition = exportObj;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/siege-attrition.js', { kind: 'engine', ver: VERSION });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();