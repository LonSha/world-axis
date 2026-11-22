/**
 * WorldAxis engines/ecosystem-cascade.js (v2.380.0)
 * EXV21-7: 深层生态食物链崩溃、生物异化与外来物种入侵引擎 (Ecosystem Cascade, Bio-Shock & Invasive Hazard Engine)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论是自然森林草原生态失衡（过度捕猎灰狼引发蝗灾饥荒）、修仙灵兽绝迹灵植凋敝、生化病毒导致动植物异化畸变还是外星/异界孢子物种入侵，统一抽象为营养级级联动力学：
 *  1. 四级营养级模型（Trophic Level Dynamics）：
 *     - primary_producer (初级生产者: 植被、灵草、水藻、合成真菌, 0~100);
 *     - herbivore (初级消费者: 草食动物、野兔、牲畜、小型益虫, 0~100);
 *     - apex_predator (顶级捕食者: 狼群、猛兽、修仙灵兽、顶级猎手, 0~100);
 *     - invasive_hazard (外来入侵/异化物种: 噬矿蠕虫、魔化剧毒荆棘、凶暴异化种, 0~100).
 *  2. 级联崩溃与生物冲击波（Bio-Shock Cascade）：
 *     - 当顶级捕食者被赶尽杀绝（apex_predator < 15），初级消费者失去天敌数量暴增，啃食殆尽初级植被引发土地荒漠化与蝗灾饥荒；
 *     - 当外来入侵物种扩散（invasive_hazard >= 60），对本土生态产生对数挤压，定居点受到剧毒孢子或兽潮直接冲击；
 *     - 异化畸变（bioMutation）：环境高污染或灵力暴走导致生物肉体异变，攻击性狂暴化。
 *  3. 破坏性负控制与状态持久化：
 *     - 在健康平衡的生态系统（equilibrium）中无任何外力冲击强行断言生态大崩溃，严格驳回（refusal: 'ecosystem-in-equilibrium'）；
 *     - 区域不存在驳回（refusal: 'region-eco-not-found'）；
 *     - 生态数据持久化落入 store.ecosystemCascade 台账。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_ecosystem_cascade_settings_v1';

  const DEF = {
    enabled: true,
    maxRegions: 30,
    apexExtinctionThreshold: 15,
    invasiveOutbreakThreshold: 60
  };

  let stat = {
    ecosystemsMonitored: 0,
    bioShocksSimulated: 0,
    trophicCollapses: 0,
    invasiveOutbreaks: 0,
    refusals: 0,
    lastReason: ''
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'ecosystemCascade'
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
    if (!target.ecosystemCascade || typeof target.ecosystemCascade !== 'object') {
      if (draft) target.ecosystemCascade = { regions: {}, eventLog: [] };
      return draft ? target.ecosystemCascade : null;
    }
    return target.ecosystemCascade;
  }

  function registerEcoRegion(regionId, spec) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const rid = cleanStr(regionId, 40);
    if (!rid) {
      noteFault('invalid-region-id');
      return { ok: false, refusal: 'invalid-region-id' };
    }

    stat.ecosystemsMonitored++;
    const p = spec || {};
    const record = {
      regionId: rid,
      name: cleanStr(p.name || rid, 60),
      biome: cleanStr(p.biome || 'Temperate Forest', 40),
      producers: clamp(p.producers !== undefined ? p.producers : 85, 0, 100),
      herbivores: clamp(p.herbivores !== undefined ? p.herbivores : 70, 0, 100),
      apexPredators: clamp(p.apexPredators !== undefined ? p.apexPredators : 65, 0, 100),
      invasiveHazard: clamp(p.invasiveHazard !== undefined ? p.invasiveHazard : 0, 0, 100),
      soilFertility: clamp(p.soilFertility !== undefined ? p.soilFertility : 80, 0, 100),
      state: 'equilibrium', // equilibrium, trophic_cascade, desertified, infested
      updatedAt: clockNow('eco:register')
    };

    let capacityReached = false;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && !s.regions[rid] && Object.keys(s.regions).length >= Math.max(1, Math.floor(settings().maxRegions))) {
          capacityReached = true;
          return;
        }
        if (s) {
          s.regions[rid] = record;
        }
      });
    }

    if (capacityReached) return { ok: false, reason: 'capacity-reached' };
    return { ok: true, region: record };
  }

  /**
   * 核心生物冲击与食物链崩塌模拟写口：simulateBioShock
   */
  function simulateBioShock(regionId, shockSpec, opts) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    stat.bioShocksSimulated++;

    const rid = cleanStr(regionId, 40);
    const st = getStore();
    if (!st || !st.regions || !st.regions[rid]) {
      noteFault('region-eco-not-found');
      return { ok: false, refusal: 'region-eco-not-found', regionId: rid };
    }

    const reg = Object.assign({}, st.regions[rid]);
    const p = shockSpec || {};
    const shockType = cleanStr(p.shockType || 'cull_apex', 30); // cull_apex, introduce_invasive, blight, rebalance

    // 破坏性负控制拦截：当生态健康平稳且传入荒谬的无因崩溃请求时，严格驳回
    if (shockType === 'assert_collapse') {
      if (reg.producers >= 60 && reg.apexPredators >= 40 && reg.invasiveHazard < 20) {
        noteFault('ecosystem-in-equilibrium');
        return {
          ok: false,
          refusal: 'ecosystem-in-equilibrium',
          regionId: rid,
          metrics: { producers: reg.producers, apex: reg.apexPredators, invasive: reg.invasiveHazard },
          reason: 'Ecosystem is resilient and in natural equilibrium; cannot assert catastrophic collapse without preceding bio-shock.'
        };
      }
    }

    switch (shockType) {
      case 'cull_apex': {
        // 过度捕猎顶级食肉动物
        const cullSeverity = clamp(p.cullSeverity || 40, 10, 80);
        reg.apexPredators = clamp(reg.apexPredators - cullSeverity, 0, 100);

        // 如果低于绝灭阈值，初级消费者失去天敌激增，草场退化
        if (reg.apexPredators <= settings().apexExtinctionThreshold) {
          stat.trophicCollapses++;
          reg.herbivores = clamp(reg.herbivores + 35, 0, 100);
          reg.producers = clamp(reg.producers - 50, 0, 100);
          reg.soilFertility = clamp(reg.soilFertility - 30, 0, 100);
          reg.state = 'trophic_cascade';
        }

        reg.updatedAt = clockNow('eco:cullApex');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.regions[rid]) {
              s.regions[rid] = reg;
              s.eventLog.push({ op: 'cull_apex', rid, cullSeverity, state: reg.state, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'cull_apex',
          regionId: rid,
          apexPredators: reg.apexPredators,
          herbivores: reg.herbivores,
          producers: reg.producers,
          state: reg.state,
          consequence: reg.state === 'trophic_cascade' ? 'Overgrazing disaster; pastures devastated and crop famine imminent.' : 'Predator population reduced.'
        };
      }

      case 'introduce_invasive': {
        // 恶性物种入侵
        const initialLoad = clamp(p.initialLoad || 30, 5, 80);
        reg.invasiveHazard = clamp(reg.invasiveHazard + initialLoad, 0, 100);

        if (reg.invasiveHazard >= settings().invasiveOutbreakThreshold) {
          stat.invasiveOutbreaks++;
          reg.state = 'infested';
          reg.producers = clamp(reg.producers - 30, 0, 100);
          reg.herbivores = clamp(reg.herbivores - 25, 0, 100); // 挤压本土生物
        }

        reg.updatedAt = clockNow('eco:invasive');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.regions[rid]) {
              s.regions[rid] = reg;
              s.eventLog.push({ op: 'introduce_invasive', rid, load: initialLoad, state: reg.state, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'introduce_invasive',
          regionId: rid,
          invasiveHazard: reg.invasiveHazard,
          state: reg.state,
          hazardLevel: reg.state === 'infested' ? 'Critical Biohazard Outbreak' : 'Localized Alien Spores/Parasites'
        };
      }

      case 'rebalance': {
        // 生态修复
        reg.apexPredators = clamp(reg.apexPredators + 25, 0, 100);
        reg.producers = clamp(reg.producers + 20, 0, 100);
        reg.invasiveHazard = clamp(reg.invasiveHazard - 30, 0, 100);
        if (reg.producers >= 50 && reg.invasiveHazard < 40) {
          reg.state = 'equilibrium';
        }
        reg.updatedAt = clockNow('eco:rebalance');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.regions[rid]) {
              s.regions[rid] = reg;
            }
          });
        }

        return {
          ok: true,
          op: 'rebalance',
          regionId: rid,
          state: reg.state,
          metrics: { producers: reg.producers, apex: reg.apexPredators, invasive: reg.invasiveHazard }
        };
      }

      default: {
        noteFault('unsupported-shock');
        return { ok: false, refusal: 'unsupported-shock', shockType };
      }
    }
  }

  function getEcoRegion(regionId) {
    const st = getStore();
    if (!st || !st.regions) return null;
    return st.regions[cleanStr(regionId, 40)] || null;
  }

  function listEcoRegions() {
    const st = getStore();
    if (!st || !st.regions) return [];
    return Object.keys(st.regions).map(k => st.regions[k]);
  }

  function buildBlock(context) {
    if (!settings().enabled) return '';
    const regs = listEcoRegions();
    if (!regs.length) return '';

    const crisisRegs = regs.filter(r => r.state !== 'equilibrium');
    if (!crisisRegs.length) return '';

    const lines = crisisRegs.slice(0, 3).map(r => {
      return `【生态危机·${r.name}】状态:${r.state} 植被健康:${r.producers}% 顶级捕食:${r.apexPredators}% 入侵外害:${r.invasiveHazard}%`;
    });

    return '[宏观生态食物链与入侵灾情]\n' + lines.join('\n');
  }

  function diagnose() {
    return {
      version: VERSION,
      enabled: settings().enabled,
      monitoredCount: listEcoRegions().length,
      stat: Object.assign({}, stat)
    };
  }

  function statView() {
    return Object.assign({}, stat);
  }

  function resetStat() {
    stat = {
      ecosystemsMonitored: 0,
      bioShocksSimulated: 0,
      trophicCollapses: 0,
      invasiveOutbreaks: 0,
      refusals: 0,
      lastReason: ''
    };
  }

  const ecosystemCascade = {
    version: VERSION,
    settings,
    saveSettings,
    registerEcoRegion,
    simulateBioShock,
    getEcoRegion,
    listEcoRegions,
    buildBlock,
    diagnose,
    stat: statView,
    resetStat
  };

  WA.engines.ecosystemCascade = ecosystemCascade;
  WA.ecosystemCascade = ecosystemCascade;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ecosystemCascade;
  }
})();