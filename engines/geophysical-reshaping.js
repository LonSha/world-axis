/**
 * WorldAxis engines/geophysical-reshaping.js (v2.408.0) — EXV23-5 水文侵蚀、地表崩塌与天灾地貌重塑
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G4 实测：暴雨、地震、洪水仅为临时天气标签，无道路永久冲毁塌方，
 *   无法直接联动 atlas/road-traffic 实现通路物理拓扑熔断（impassable）。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `geophysicalReshaping.simulateTerrainShift` 根据暴雨或地质压力计算滑坡或决堤概率；
 *   `geophysicalReshaping.ruptureInfrastructure` 物理破坏指定道路或桥梁，将其标记为不可通行；
 *   `geophysicalReshaping.repairInfrastructure` 组织工程队抢修疏通。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 严禁在干旱无水域地点引发水力冲决（refusal: hydro-deficit-cannot-breach）。
 *   ② 被毁坏的道路在修复前严禁恢复通车（refusal: infrastructure-remains-ruptured）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_geophysical_reshaping_settings_v1';
  const DEF = {
    enabled: true,
    ruptureThreshold: 65
  };

  const __REG = {
    key: 'geophysicalReshaping',
    name: '地质重塑与道路熔断 (EXV23-5)',
    desc: '水文侵蚀、山体滑坡与道路拓扑物理熔断重塑引擎',
    settingsKey: LS_KEY,
    schema: {
      enabled: { type: 'boolean', default: true },
      ruptureThreshold: { type: 'number', default: 65 }
    }
  };

  const STATE = {
    ruptures: {}, // pathId -> { id, kind, severity, impassable: true, rupturedAt }
    hydrology: {} // regionId -> { waterTable, saturation, floodRisk }
  };

  const stat = {
    terrainShifts: 0,
    rupturesCount: 0,
    repairsCount: 0
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

  function simulateTerrainShift(regionId, environmentalPressures) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, refusal: 'geophysical-reshaping-disabled' };
    if (!regionId) return { ok: false, refusal: 'missing-region-id' };

    const ep = environmentalPressures || {};
    const rainfall = Number(ep.rainfall) || 0;
    const seismic = Number(ep.seismicActivity) || 0;
    const isArid = Boolean(ep.isArid);

    if (isArid && rainfall <= 0) {
      return {
        ok: false,
        refusal: 'hydro-deficit-cannot-breach',
        hint: '极度干旱无水源环境无法引发水力决堤'
      };
    }

    const stressScore = Math.min(100, rainfall * 0.8 + seismic * 1.2);
    stat.terrainShifts++;

    const isBreached = stressScore >= cfg.ruptureThreshold;
    return {
      ok: true,
      regionId: regionId,
      stressScore: stressScore,
      landslideTriggered: isBreached,
      at: clockNow()
    };
  }

  function ruptureInfrastructure(pathId, spec) {
    if (!pathId) return { ok: false, refusal: 'missing-path-id' };
    const s = spec || {};
    const severity = Math.max(1, Math.min(100, Number(s.severity) || 50));
    STATE.ruptures[pathId] = {
      id: pathId,
      kind: s.kind || 'bridge-collapse',
      severity: severity,
      impassable: true,
      rupturedAt: clockNow()
    };
    stat.rupturesCount++;

    return {
      ok: true,
      pathId: pathId,
      impassable: true,
      severity: severity,
      hint: '地貌崩塌，道路拓扑已物理熔断，所有商旅与军队必须重算绕行',
      at: clockNow()
    };
  }

  function repairInfrastructure(pathId, laborSupplies) {
    const r = STATE.ruptures[pathId];
    if (!r) return { ok: false, refusal: 'path-not-ruptured' };
    const supplies = Number(laborSupplies) || 0;
    if (supplies < r.severity) {
      return {
        ok: false,
        refusal: 'infrastructure-remains-ruptured',
        hint: '抢修劳力物资不足以排险，仍处于塌方不可通行状态'
      };
    }
    delete STATE.ruptures[pathId];
    stat.repairsCount++;
    return {
      ok: true,
      pathId: pathId,
      impassable: false,
      status: 'restored',
      at: clockNow()
    };
  }

  function isPathPassable(pathId) {
    const r = STATE.ruptures[pathId];
    return { ok: true, pathId: pathId, passable: !r, rupture: r || null };
  }

  function reset() {
    STATE.ruptures = {};
    STATE.hydrology = {};
    stat.terrainShifts = 0;
    stat.rupturesCount = 0;
    stat.repairsCount = 0;
    return { ok: true };
  }

  WA.geophysicalReshaping = {
    simulateTerrainShift: simulateTerrainShift,
    ruptureInfrastructure: ruptureInfrastructure,
    repairInfrastructure: repairInfrastructure,
    isPathPassable: isPathPassable,
    reset: reset,
    getSettings: settings
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/geophysical-reshaping.js', { kind: 'engine', ver: '2.408.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/geophysical-reshaping 已加载（2.408.0）');
  }
})();