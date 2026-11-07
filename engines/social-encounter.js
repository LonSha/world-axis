/**
 * WorldAxis engines/social-encounter.js (v2.330.0)
 * 通用市井偶遇与动态视线相交引擎 (Universal Social Encounter & Line-of-Sight Intersection)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 无论古代集市、现代商业街、修仙坊市、西幻冒险者公会大厅或废土集市，
 * 当不同阵营、身份或关系的具身实体在同一公共微观空间重叠时，
 * 必然因人群密度与感官敏锐度触发动态偶遇、目光相交与微观社交互动：
 *  1. 偶遇检测 (Encounter Check)：
 *     - 基于空间拥挤度 (crowdDensity 0..100) 与角色隐蔽性 (stealthRating 0..100)；
 *  2. 视线交汇与反应仲裁 (Glance & Micro-Reaction)：
 *     - 'gaze_lock'（彼此警觉对视、目光穿过人群定格）；
 *     - 'brush_past'（擦肩而过、衣袂相拂或轻微碰肩）；
 *     - 'avoidance'（低头拉紧斗篷/兜帽隐匿避开视线）；
 *     - 'overhear_fragment'（人潮喧嚣中捕捉到一句关键敏感谈资）；
 *  3. 联动 anti-omniscience 与 spatial-acoustics，真实且自然，绝不全知造假。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const VALID_INTERACTIONS = Object.freeze([
    'gaze_lock',
    'brush_past',
    'avoidance',
    'overhear_fragment'
  ]);

  // 记录最近的市井偶遇历史: Array<EncounterRecord>
  const _encounterHistory = [];
  const MAX_HISTORY = 40;

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
   * 评估两个角色在某地点的偶遇与视线相交
   * @param {string} placeId 发生微观地点
   * @param {object} actorA { actorId, name, stealth, perception, relationScore }
   * @param {object} actorB { actorId, name, stealth, perception, relationScore }
   * @param {object} envOpts { crowdDensity: 0..100, isRestrictedZone: boolean, backgroundNoiseDb: number }
   */
  function evaluateEncounter(placeId, actorA, actorB, envOpts) {
    const pid = _cleanStr(placeId);
    if (!pid) return { ok: false, reason: 'missing-place-id' };

    if (!actorA || !actorA.actorId) return { ok: false, reason: 'missing-actor-a' };
    if (!actorB || !actorB.actorId) return { ok: false, reason: 'missing-actor-b' };

    const aidA = _cleanStr(actorA.actorId);
    const aidB = _cleanStr(actorB.actorId);
    if (aidA === aidB) return { ok: false, reason: 'cannot-encounter-self' };

    envOpts = envOpts || {};
    const density = _clamp(Number(envOpts.crowdDensity != null ? envOpts.crowdDensity : 50), 0, 100);

    const stA = _clamp(Number(actorA.stealth || 0), 0, 100);
    const perA = _clamp(Number(actorA.perception || 50), 0, 100);
    const stB = _clamp(Number(actorB.stealth || 0), 0, 100);
    const perB = _clamp(Number(actorB.perception || 50), 0, 100);

    // 感知 vs 潜行判定
    // A 是否察觉到 B
    const aSpottedB = (perA + (density > 70 ? 10 : 0)) >= (stB + (density < 30 ? 20 : 0));
    // B 是否察觉到 A
    const bSpottedA = (perB + (density > 70 ? 10 : 0)) >= (stA + (density < 30 ? 20 : 0));

    let interactionType = 'avoidance';
    let narrativeBrief = '';
    const nameA = actorA.name || aidA;
    const nameB = actorB.name || aidB;

    if (!aSpottedB && !bSpottedA) {
      // 双方在人潮中彼此错过
      narrativeBrief = `${nameA} 与 ${nameB} 各自淹没在流动的人潮中，未曾察觉彼此的存在。`;
      return {
        ok: true,
        placeId: pid,
        actorA: aidA,
        actorB: aidB,
        encountered: false,
        interactionType: 'missed',
        narrativeBrief: narrativeBrief
      };
    }

    if (aSpottedB && bSpottedA) {
      // 双方同时察觉
      if (density >= 70) {
        interactionType = 'brush_past';
        narrativeBrief = `在熙攘拥挤的人流中，${nameA} 与 ${nameB} 擦肩而过，衣袂相拂间彼此眼神微凝。`;
      } else {
        interactionType = 'gaze_lock';
        narrativeBrief = `${nameA} 与 ${nameB} 的视线穿过空旷空隙瞬间交汇锁定，空气中弥漫着一瞬的审视与警觉。`;
      }
    } else if (aSpottedB && !bSpottedA) {
      // 仅 A 发现 B
      if (stA >= 50) {
        interactionType = 'avoidance';
        narrativeBrief = `${nameA} 率先瞥见 ${nameB}，迅速低头隐入阴影人群，避开了对方视线。`;
      } else {
        interactionType = 'overhear_fragment';
        narrativeBrief = `${nameA} 在人群侧方悄然注意到 ${nameB} 的身影，并捕捉到对方低语的断续只言片语。`;
      }
    } else {
      // 仅 B 发现 A
      if (stB >= 50) {
        interactionType = 'avoidance';
        narrativeBrief = `${nameB} 认出 ${nameA}，巧妙侧身隐入街角货架之后，未惊动对方。`;
      } else {
        interactionType = 'overhear_fragment';
        narrativeBrief = `${nameB} 在人流外围锁定了 ${nameA} 的行踪，暗中观察其去向。`;
      }
    }

    const record = {
      placeId: pid,
      actorA: aidA,
      actorB: aidB,
      encountered: true,
      interactionType: interactionType,
      narrativeBrief: narrativeBrief,
      timestamp: Date.now()
    };

    _encounterHistory.unshift(record);
    if (_encounterHistory.length > MAX_HISTORY) {
      _encounterHistory.pop();
    }

    return Object.assign({ ok: true }, record);
  }

  function getRecentEncounters(limit) {
    const l = Math.min(MAX_HISTORY, Math.max(1, Number(limit || 10)));
    return _encounterHistory.slice(0, l);
  }

  function resetAll() {
    _encounterHistory.length = 0;
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    evaluateEncounter: evaluateEncounter,
    getRecentEncounters: getRecentEncounters,
    resetAll: resetAll
  };

  WA.engines.socialEncounter = engine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();