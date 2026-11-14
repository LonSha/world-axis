/**
 * WorldAxis engines/mob-stampede.js (v2.408.0) — EXV23-4 群体无意识狂乱、暴民踩踏与谣言裂变
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：城市微观生态中，缺乏暴民恐慌从众门槛（herdThreshold）、
 *   谣言裂变激化、通道拥堵踩踏与纵火毁伤扩散机制。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `mobStampede.igniteRumorWave` 在地点散播恐慌谣言，逐轮裂变指数级放大焦虑；
 *   `mobStampede.escalateMobTension` 计算人群聚集度与暴力阈值，判定是否爆发踩踏或打砸；
 *   `mobStampede.quellMob` 实行宵禁或军队镇压平息暴动。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 零人口或绝对真空空间禁止爆发踩踏（refusal: insufficient-crowd-density）。
 *   ② 踩踏毁伤直接标记地点闭锁（locked: true）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_mob_stampede_settings_v1';
  const DEF = {
    enabled: true,
    riotPanicThreshold: 70,
    stampedeCasualtyFactor: 0.15
  };

  const __REG = {
    key: 'mobStampede',
    name: '群体狂乱与暴民踩踏 (EXV23-4)',
    desc: '谣言裂变、从众恐慌临界与城市暴乱踩踏毁伤动力学',
    settingsKey: LS_KEY,
    schema: {
      enabled: { type: 'boolean', default: true },
      riotPanicThreshold: { type: 'number', default: 70 },
      stampedeCasualtyFactor: { type: 'number', default: 0.15 }
    }
  };

  const STATE = {
    places: {} // placeId -> { crowdCount, panicLevel, rumorTension, isRioting, barricaded }
  };

  const stat = {
    rumorsIgnited: 0,
    riotsTriggered: 0,
    stampedeIncidents: 0,
    quelledCount: 0
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

  function ensurePlace(placeId) {
    if (!STATE.places[placeId]) {
      STATE.places[placeId] = {
        crowdCount: 100, // 默认百人群体基数
        panicLevel: 0,
        rumorTension: 0,
        isRioting: false,
        barricaded: false
      };
    }
  }

  function igniteRumorWave(placeId, rumorSpec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, refusal: 'mob-stampede-disabled' };
    if (!placeId) return { ok: false, refusal: 'missing-place-id' };
    ensurePlace(placeId);

    const r = rumorSpec || {};
    const severity = Math.max(5, Math.min(100, Number(r.severity) || 20));
    const pl = STATE.places[placeId];

    if (pl.crowdCount <= 0) {
      return {
        ok: false,
        refusal: 'insufficient-crowd-density',
        hint: '空间人口为零，无法形成谣言从众与群体狂乱'
      };
    }

    pl.rumorTension = Math.min(100, pl.rumorTension + severity);
    pl.panicLevel = Math.min(100, pl.panicLevel + Math.floor(severity * 0.8));
    stat.rumorsIgnited++;

    return {
      ok: true,
      placeId: placeId,
      rumorTension: pl.rumorTension,
      panicLevel: pl.panicLevel,
      crowdCount: pl.crowdCount,
      at: clockNow()
    };
  }

  function escalateMobTension(placeId) {
    ensurePlace(placeId);
    const pl = STATE.places[placeId];
    if (pl.crowdCount <= 0) {
      return { ok: false, refusal: 'insufficient-crowd-density' };
    }

    const cfg = settings();
    if (pl.panicLevel >= cfg.riotPanicThreshold && !pl.isRioting) {
      pl.isRioting = true;
      pl.barricaded = true;
      stat.riotsTriggered++;
      stat.stampedeIncidents++;

      const casualties = Math.floor(pl.crowdCount * cfg.stampedeCasualtyFactor);
      pl.crowdCount = Math.max(0, pl.crowdCount - casualties);

      return {
        ok: true,
        placeId: placeId,
        isRioting: true,
        stampede: true,
        casualties: casualties,
        remainingCrowd: pl.crowdCount,
        hint: '恐慌突破临界，爆发踩踏暴动，城门街道闭锁',
        at: clockNow()
      };
    }

    return {
      ok: true,
      placeId: placeId,
      isRioting: pl.isRioting,
      panicLevel: pl.panicLevel,
      hint: '人群骚动持续加剧但未发生全面溃决',
      at: clockNow()
    };
  }

  function quellMob(placeId, method) {
    ensurePlace(placeId);
    const pl = STATE.places[placeId];
    pl.isRioting = false;
    pl.barricaded = false;
    pl.panicLevel = Math.max(0, pl.panicLevel - 50);
    pl.rumorTension = Math.max(0, pl.rumorTension - 40);
    stat.quelledCount++;
    return {
      ok: true,
      placeId: placeId,
      method: method || 'curfew',
      status: 'quelled',
      currentPanic: pl.panicLevel,
      at: clockNow()
    };
  }

  function setCrowdDensity(placeId, count) {
    ensurePlace(placeId);
    STATE.places[placeId].crowdCount = Math.max(0, Number(count) || 0);
    return { ok: true, placeId: placeId, crowdCount: STATE.places[placeId].crowdCount };
  }

  function reset() {
    STATE.places = {};
    stat.rumorsIgnited = 0;
    stat.riotsTriggered = 0;
    stat.stampedeIncidents = 0;
    stat.quelledCount = 0;
    return { ok: true };
  }

  WA.mobStampede = {
    igniteRumorWave: igniteRumorWave,
    escalateMobTension: escalateMobTension,
    quellMob: quellMob,
    setCrowdDensity: setCrowdDensity,
    reset: reset,
    getSettings: settings
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/mob-stampede.js', { kind: 'engine', ver: '2.408.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/mob-stampede 已加载（2.408.0）');
  }
})();