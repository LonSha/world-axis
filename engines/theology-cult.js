/**
 * WorldAxis engines/theology-cult.js (v2.380.0)
 * EXV21-1: 宗教信仰、教派崇拜与狂热神权布道引擎 (Theology Faith, Cult Worship & Divine Inquisition Engine)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论是中世纪神圣教会、异界邪神低语崇拜、修仙宗门道统香火还是赛博机械神教，统一抽象为四维神圣属性模型：
 *  1. 四维神圣动力学：
 *     - 正统教条完整度（orthodoxy, 0~100）：教律威严、神学经典自洽性；
 *     - 秘仪狂热度（fervor, 0~100）：狂信徒献祭冲动、盲从与极端化倾向；
 *     - 世俗权势度（secularInfluence, 0~100）：免税领地、赎罪券收入与世俗官员渗透；
 *     - 圣迹信仰共鸣（miracleResonance, 0~100）：圣物、异象与显圣威能。
 *  2. 神权核心事务操作：
 *     - preach: 公开布道与信众吸纳，转化盲流难民；
 *     - ritual: 宗庙祭祀、血祭献礼或神恩加护，提升狂热度与圣物共鸣；
 *     - purge: 异端裁判所审判清洗，没收家财并火刑处决异端；
 *     - sanctify_relic: 铸造或加持圣遗物，永久固化区域信仰心锚；
 *     - holy_war: 发动神圣远征或宗门灭门圣战。
 *  3. 破坏性负控制与状态持久化：
 *     - 信仰荒漠或无神论城邦信众为零且无圣物时强行发动圣战，严惩驳回（refusal: 'fervor-depleted-no-following'）；
 *     - 证据不足或查无此人强行异端审判驳回（refusal: 'inquisition-charges-invalid'）；
 *     - 所有教派状态持久化落入 store.theologySects 台账。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_theology_cult_settings_v1';

  const DEF = {
    enabled: true,
    maxSects: 30,
    minFervorForHolyWar: 60,
    heresyPurgeThreshold: 40
  };

  let stat = {
    opsConducted: 0,
    preaches: 0,
    rituals: 0,
    purges: 0,
    relicsSanctified: 0,
    holyWarsDeclared: 0,
    refusals: 0,
    lastReason: ''
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'theologyCult'
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }

  function saveSettings(next) {
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      return WA.settingsBus.saveOrThrow(__REG, Object.assign({}, DEF, next || {}));
    }
    return Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function cleanStr(s, max) { return String(s || '').trim().slice(0, max || 80); }
  function clamp(v, min, max) { const n = Number(v); if (isNaN(n)) return min; return Math.max(min, Math.min(max, n)); }
  function clockNow(site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } }
  function noteFault(r) { stat.refusals++; stat.lastReason = String(r || 'unknown'); }

  function getStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.theologySects || typeof target.theologySects !== 'object') {
      if (draft) target.theologySects = { sects: {}, log: [] };
      return draft ? target.theologySects : null;
    }
    return target.theologySects;
  }

  function registerSect(sectId, spec) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const sid = cleanStr(sectId, 40);
    if (!sid) {
      noteFault('invalid-sect-id');
      return { ok: false, refusal: 'invalid-sect-id' };
    }

    const payload = spec || {};
    const record = {
      sectId: sid,
      name: cleanStr(payload.name || sid, 60),
      creed: cleanStr(payload.creed || 'Universal Truth', 100),
      orthodoxy: clamp(payload.orthodoxy !== undefined ? payload.orthodoxy : 70, 0, 100),
      fervor: clamp(payload.fervor !== undefined ? payload.fervor : 30, 0, 100),
      secularInfluence: clamp(payload.secularInfluence !== undefined ? payload.secularInfluence : 25, 0, 100),
      miracleResonance: clamp(payload.miracleResonance !== undefined ? payload.miracleResonance : 10, 0, 100),
      followersCount: Math.max(0, parseInt(payload.followersCount, 10) || 100),
      relics: Array.isArray(payload.relics) ? payload.relics.slice(0, 10) : [],
      updatedAt: clockNow('theology:register')
    };

    let capacityReached = false;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && !s.sects[sid] && Object.keys(s.sects).length >= Math.max(1, Math.floor(settings().maxSects))) {
          capacityReached = true;
          return;
        }
        if (s) {
          s.sects[sid] = record;
        }
      });
    }

    if (capacityReached) return { ok: false, reason: 'capacity-reached' };
    return { ok: true, sect: record };
  }

  function conductTheologyOp(sectIdOrKind, opKindOrSpec, specOrOpts) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    stat.opsConducted++;

    let sid = '';
    let op = '';
    let p = {};

    if (typeof sectIdOrKind === 'string' && typeof opKindOrSpec === 'string') {
      sid = cleanStr(sectIdOrKind, 40);
      op = cleanStr(opKindOrSpec, 30);
      p = specOrOpts || {};
    } else {
      op = cleanStr(sectIdOrKind, 30);
      p = opKindOrSpec || {};
      sid = cleanStr(p.sectId, 40);
    }

    const st = getStore();
    const currentSect = (st && st.sects && st.sects[sid]) ? Object.assign({}, st.sects[sid]) : null;

    if (!currentSect && op !== 'register') {
      noteFault('sect-not-found');
      return { ok: false, refusal: 'sect-not-found', sectId: sid };
    }

    switch (op) {
      case 'preach': {
        stat.preaches++;
        const intensity = clamp(p.intensity || 1, 1, 10);
        const targetAudience = Math.max(10, parseInt(p.targetAudience, 10) || 100);
        
        const converted = Math.round(targetAudience * (currentSect.orthodoxy / 100) * 0.25 * intensity);
        const fervorGain = Math.round(3 * intensity);
        
        currentSect.followersCount += converted;
        currentSect.fervor = clamp(currentSect.fervor + fervorGain, 0, 100);
        currentSect.updatedAt = clockNow('theology:preach');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.sects[sid]) {
              s.sects[sid] = currentSect;
              s.log.push({ op: 'preach', sid, converted, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'preach',
          sectId: sid,
          converted,
          newFollowers: currentSect.followersCount,
          newFervor: currentSect.fervor
        };
      }

      case 'ritual': {
        stat.rituals++;
        const sacrificeValue = Math.max(0, parseInt(p.sacrificeValue, 10) || 0);
        const isBloodSacrifice = !!p.bloodSacrifice;

        let fervorDelta = 5 + Math.min(20, Math.floor(sacrificeValue / 50));
        let orthodoxyDelta = isBloodSacrifice ? -10 : 3;

        currentSect.fervor = clamp(currentSect.fervor + fervorDelta, 0, 100);
        currentSect.orthodoxy = clamp(currentSect.orthodoxy + orthodoxyDelta, 0, 100);
        currentSect.miracleResonance = clamp(currentSect.miracleResonance + (isBloodSacrifice ? 15 : 5), 0, 100);
        currentSect.updatedAt = clockNow('theology:ritual');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.sects[sid]) {
              s.sects[sid] = currentSect;
            }
          });
        }

        return {
          ok: true,
          op: 'ritual',
          sectId: sid,
          fervor: currentSect.fervor,
          orthodoxy: currentSect.orthodoxy,
          miracleResonance: currentSect.miracleResonance
        };
      }

      case 'purge': {
        stat.purges++;
        const targetActorId = cleanStr(p.targetActorId, 60);
        const charges = cleanStr(p.charges, 120);

        if (!targetActorId || !charges) {
          noteFault('inquisition-charges-invalid');
          return {
            ok: false,
            refusal: 'inquisition-charges-invalid',
            reason: 'Charges and targetActorId must be explicitly specified.'
          };
        }

        if (currentSect.orthodoxy < settings().heresyPurgeThreshold && currentSect.fervor < 30) {
          noteFault('insufficient-religious-authority');
          return {
            ok: false,
            refusal: 'insufficient-religious-authority',
            reason: 'Sect lacks orthodox validity or mob fervor to conduct an inquisition purge.'
          };
        }

        const seizedWealth = Math.round((currentSect.secularInfluence / 100) * 500);
        currentSect.secularInfluence = clamp(currentSect.secularInfluence + 5, 0, 100);
        currentSect.fervor = clamp(currentSect.fervor + 8, 0, 100);

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.sects[sid]) {
              s.sects[sid] = currentSect;
              s.log.push({ op: 'purge', sid, targetActorId, seizedWealth, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'purge',
          targetActorId,
          executed: true,
          seizedWealth,
          sectSecularPower: currentSect.secularInfluence
        };
      }

      case 'holy_war': {
        const cfg = settings();
        if (currentSect.fervor < cfg.minFervorForHolyWar || currentSect.followersCount < 50) {
          noteFault('fervor-depleted-no-following');
          return {
            ok: false,
            refusal: 'fervor-depleted-no-following',
            reason: 'Cannot declare holy war: fervor < ' + cfg.minFervorForHolyWar + ' or insufficient disciples.'
          };
        }

        stat.holyWarsDeclared++;
        const warTide = {
          sectId: sid,
          targetFaction: cleanStr(p.targetFaction || 'Heretics', 60),
          crusadersMobilized: Math.round(currentSect.followersCount * 0.4),
          fanaticismMultiplier: (currentSect.fervor / 50).toFixed(2),
          declaredAt: clockNow('theology:holyWar')
        };

        currentSect.fervor = clamp(currentSect.fervor + 10, 0, 100);
        currentSect.secularInfluence = clamp(currentSect.secularInfluence + 15, 0, 100);

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.sects[sid]) {
              s.sects[sid] = currentSect;
            }
          });
        }

        return {
          ok: true,
          op: 'holy_war',
          warTide
        };
      }

      case 'sanctify_relic': {
        stat.relicsSanctified++;
        const relicName = cleanStr(p.relicName, 60);
        if (!relicName) {
          noteFault('relic-name-missing');
          return { ok: false, refusal: 'relic-name-missing' };
        }

        const relicObj = {
          name: relicName,
          sacredPower: clamp(p.power || 50, 1, 100),
          consecratedAt: clockNow('theology:relic')
        };

        currentSect.relics.push(relicObj);
        currentSect.miracleResonance = clamp(currentSect.miracleResonance + 20, 0, 100);

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.sects[sid]) {
              s.sects[sid] = currentSect;
            }
          });
        }

        return {
          ok: true,
          op: 'sanctify_relic',
          sectId: sid,
          relic: relicObj,
          miracleResonance: currentSect.miracleResonance
        };
      }

      default: {
        noteFault('unsupported-op');
        return { ok: false, refusal: 'unsupported-op', opKind };
      }
    }
  }

  function getSect(sectId) {
    const st = getStore();
    if (!st || !st.sects) return null;
    return st.sects[cleanStr(sectId, 40)] || null;
  }

  function listSects() {
    const st = getStore();
    if (!st || !st.sects) return [];
    return Object.keys(st.sects).map(k => st.sects[k]);
  }

  function buildBlock(context) {
    if (!settings().enabled) return '';
    const sects = listSects();
    if (!sects.length) return '';

    const lines = sects.map(s => {
      return `【神权宗派·${s.name}】信徒:${s.followersCount} 狂热度:${s.fervor}% 正统度:${s.orthodoxy}% 圣物:${s.relics.length}件`;
    });

    return '[教派崇拜与信仰态势]\n' + lines.join('\n');
  }

  function diagnose() {
    const sects = listSects();
    return {
      version: VERSION,
      enabled: settings().enabled,
      sectCount: sects.length,
      stat: Object.assign({}, stat)
    };
  }

  function statView() {
    return Object.assign({}, stat);
  }

  function resetStat() {
    stat = {
      opsConducted: 0,
      preaches: 0,
      rituals: 0,
      purges: 0,
      relicsSanctified: 0,
      holyWarsDeclared: 0,
      refusals: 0,
      lastReason: ''
    };
  }

  const theologyCult = {
    version: VERSION,
    settings,
    saveSettings,
    registerSect,
    conductTheologyOp,
    getSect,
    listSects,
    buildBlock,
    diagnose,
    stat: statView,
    resetStat
  };

  WA.engines.theologyCult = theologyCult;
  WA.theologyCult = theologyCult;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = theologyCult;
  }
})();
