/**
 * WorldAxis engines/somatic-trauma.js (v2.408.0) — EXV23-2 具身创伤、肢体残损与知觉感官盲区
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G2 实测：角色伤病仅为抽象 HP 扣减，无解剖层级创伤（骨折/断肢/大出血），
 *   缺乏生理知觉剥夺（耳鸣/致盲黑蒙/失血重影）的提示词注入与行动惩罚。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `somaticTrauma.inflictWound` 在解剖部位施加具身创伤，计算失血率与机能损伤；
 *   `somaticTrauma.getSensoryProfile` 现算角色的感官剥夺状态（视界黑蒙/耳鸣/痛觉休克）；
 *   `somaticTrauma.performTriage` 对创口进行止血、夹板固定或清创缝合。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 严禁对已截断肢体进行常规包扎（refusal: limb-severed-requires-amputation-cauterization）。
 *   ② 感官剥夺剖面纯计算无副作用，供 inject.js 动态稀疏化剪裁。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_somatic_trauma_settings_v1';
  const DEF = {
    enabled: true,
    shockPainThreshold: 75,
    bloodLossFaintThreshold: 60
  };

  const __REG = {
    key: 'somaticTrauma',
    name: '具身创伤与知觉剥夺 (EXV23-2)',
    desc: '解剖部位分层创伤、出血代谢与感官知觉盲区模型',
    settingsKey: LS_KEY,
    schema: {
      enabled: { type: 'boolean', default: true },
      shockPainThreshold: { type: 'number', default: 75 },
      bloodLossFaintThreshold: { type: 'number', default: 60 }
    }
  };

  const ZONES = ['head', 'torso', 'mainHand', 'offHand', 'legs'];
  const SEVERITIES = ['minor', 'laceration', 'fracture', 'arterialBleed', 'severed'];

  const STATE = {
    wounds: {}, // actorId -> { [zone]: { severity, bleedingRate, pain, treated, severed } }
    bloodLevels: {} // actorId -> bloodPercent (100 is healthy)
  };

  const stat = {
    woundsInflicted: 0,
    triagesPerformed: 0,
    amputations: 0,
    shockEpisodes: 0
  };

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.getModuleSettings === 'function') {
      const s = WA.settingsBus.getModuleSettings(__REG.key, DEF);
      return Object.assign({}, DEF, s);
    }
    return Object.assign({}, DEF);
  }

  function clockNow() {
    if (WA.clock && typeof WA.clock.now === 'function') return WA.clock.now();
    return Date.now();
  }

  function ensureActor(actorId) {
    if (!STATE.wounds[actorId]) {
      STATE.wounds[actorId] = {};
      ZONES.forEach(function (z) {
        STATE.wounds[actorId][z] = { severity: 'none', bleedingRate: 0, pain: 0, treated: false, severed: false };
      });
    }
    if (typeof STATE.bloodLevels[actorId] !== 'number') {
      STATE.bloodLevels[actorId] = 100;
    }
  }

  /**
   * 施加具身创伤
   * @param {string} actorId
   * @param {string} zone - head|torso|mainHand|offHand|legs
   * @param {Object} damageSpec - { severity, bleedingRate, pain, bluntForce }
   */
  function inflictWound(actorId, zone, damageSpec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, refusal: 'somatic-trauma-disabled' };
    if (!actorId || !ZONES.includes(zone)) {
      return { ok: false, refusal: 'invalid-anatomical-zone', hint: '合法部位: ' + ZONES.join('/') };
    }
    ensureActor(actorId);
    const cur = STATE.wounds[actorId][zone];
    if (cur.severed) {
      return { ok: false, refusal: 'zone-already-severed', hint: '该部位已完全缺失截断' };
    }

    const d = damageSpec || {};
    const sev = SEVERITIES.includes(d.severity) ? d.severity : 'laceration';
    const bleed = Number(d.bleedingRate) || (sev === 'arterialBleed' ? 15 : (sev === 'severed' ? 25 : 3));
    const pain = Number(d.pain) || (sev === 'fracture' ? 40 : (sev === 'severed' ? 80 : 15));

    cur.severity = sev;
    cur.bleedingRate = bleed;
    cur.pain = Math.min(100, cur.pain + pain);
    cur.treated = false;
    if (sev === 'severed') {
      cur.severed = true;
      stat.amputations++;
    }

    stat.woundsInflicted++;
    return {
      ok: true,
      actorId: actorId,
      zone: zone,
      wound: Object.assign({}, cur),
      bloodLevel: STATE.bloodLevels[actorId],
      at: clockNow()
    };
  }

  /**
   * 医疗救护 / 清创
   * @param {string} actorId
   * @param {string} zone
   * @param {string} triageMethod - bandage|suture|splint|cauterize
   */
  function performTriage(actorId, zone, triageMethod) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, refusal: 'somatic-trauma-disabled' };
    if (!actorId || !ZONES.includes(zone)) return { ok: false, refusal: 'invalid-anatomical-zone' };
    ensureActor(actorId);

    const w = STATE.wounds[actorId][zone];
    if (w.severity === 'none' && !w.severed) {
      return { ok: false, refusal: 'no-wound-in-zone' };
    }
    if (w.severed && triageMethod !== 'cauterize') {
      return {
        ok: false,
        refusal: 'limb-severed-requires-amputation-cauterization',
        hint: '肢体截断大出血必须行烧灼止血（cauterize），常规包扎无法挽救生命'
      };
    }

    w.treated = true;
    w.bleedingRate = Math.max(0, Math.floor(w.bleedingRate * 0.2));
    w.pain = Math.max(0, w.pain - 20);
    stat.triagesPerformed++;

    return {
      ok: true,
      actorId: actorId,
      zone: zone,
      triageMethod: triageMethod,
      wound: Object.assign({}, w),
      at: clockNow()
    };
  }

  /**
   * 获取感官知觉剥夺剖面 (供 inject.js 与 actionDesk 决策)
   * @param {string} actorId
   */
  function getSensoryProfile(actorId) {
    ensureActor(actorId);
    const wounds = STATE.wounds[actorId];
    const blood = STATE.bloodLevels[actorId];

    let totalPain = 0;
    let totalBleed = 0;
    Object.values(wounds).forEach(function (w) {
      totalPain += (w.pain || 0);
      totalBleed += (w.bleedingRate || 0);
    });

    const headWound = wounds.head;
    const isBlindTinnitus = (headWound && (headWound.severity === 'fracture' || headWound.severity === 'arterialBleed'));
    const isShock = totalPain >= DEF.shockPainThreshold;
    const isFaint = blood <= DEF.bloodLossFaintThreshold;

    if (isShock) stat.shockEpisodes++;

    return {
      ok: true,
      actorId: actorId,
      bloodLevel: blood,
      totalPain: Math.min(100, totalPain),
      totalBleedRate: totalBleed,
      sensoryBlind: isBlindTinnitus,
      shock: isShock,
      fainting: isFaint,
      mobilityImpaired: wounds.legs.severity !== 'none',
      manipulationImpaired: wounds.mainHand.severity !== 'none' || wounds.mainHand.severed,
      sensoryRestrictions: {
        tunnelVision: isFaint || isBlindTinnitus,
        tinnitus: isBlindTinnitus,
        severeAgony: isShock
      }
    };
  }

  function tickMetabolism(actorId) {
    ensureActor(actorId);
    const wounds = STATE.wounds[actorId];
    let bleedTotal = 0;
    Object.values(wounds).forEach(function (w) {
      if (!w.treated) bleedTotal += w.bleedingRate;
      else bleedTotal += Math.floor(w.bleedingRate * 0.5);
    });
    if (bleedTotal > 0) {
      STATE.bloodLevels[actorId] = Math.max(0, STATE.bloodLevels[actorId] - bleedTotal);
    }
    return { ok: true, actorId: actorId, bloodLevel: STATE.bloodLevels[actorId] };
  }

  function reset() {
    STATE.wounds = {};
    STATE.bloodLevels = {};
    stat.woundsInflicted = 0;
    stat.triagesPerformed = 0;
    stat.amputations = 0;
    stat.shockEpisodes = 0;
    return { ok: true };
  }

  WA.somaticTrauma = {
    inflictWound: inflictWound,
    performTriage: performTriage,
    getSensoryProfile: getSensoryProfile,
    tickMetabolism: tickMetabolism,
    reset: reset,
    getSettings: settings
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/somatic-trauma.js', { kind: 'engine', ver: '2.408.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/somatic-trauma 已加载（2.408.0）');
  }
})();