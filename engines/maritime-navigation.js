/**
 * WorldAxis engines/maritime-navigation.js (v2.351.0) — 远洋水文洋流、暴风巨浪与舟船航行动力学引擎 (EXV19-4)
 *
 * ── 它治什么（核心沙盒痛点）────────────────────────────────────
 *   既有移动系统仅处理陆地抽象网格与节点跳转，海上航行常被简化为「消耗几天直接到达」，
 *   完全丧失了海洋水文动力学、气象恶劣度、风向海流矢量对操舵的物理阻碍、
 *   船体触礁进水抽舱、折桅断缆、弃货防沉及弃船逃生的真实危机。
 *
 * ── 核心机制闭环 ───────────────────────────────────────────────
 *   ① 动态海洋水文环境（Hydrological Vector）：
 *      - currentKnots（海流流速 0~20 节）、driftHeading（海流朝向 0~360 度）；
 *      - waveMeters（浪高 0~15 米）、stormLevel（风暴等级 0~12 蒲福风级）；
 *      - reefDensity（暗礁暗涌密度 0~1.0）。
 *   ② 船舶具身工程状态（Vessel Hull State）：
 *      - hullIntegrity: 船体结构耐久（0~100，0 为解体）；
 *      - bilgeWater: 舱底积水百分比（0~100%，>=100% 倾覆沉没）；
 *      - riggingIntegrity: 帆缆与桅杆状态（0~100）；
 *      - cargoLoad: 载重吨位，直接影响吃水深度与颠簸倾覆力矩；
 *      - crewMorale: 水手士气与体力（0~100）。
 *   ③ 五大航海物理指令（navigateVoyage）：
 *      - tack: 逆风抢风航行或调头，根据流速与风向修正航向；
 *      - furlSails: 收帆减速防风暴拍断桅杆；
 *      - pumpBilge: 水手奋力抽水排水，降低舱底积水；
 *      - jettisonCargo: 弃货减重，快速提高船只干舷防倾覆；
 *      - repairHull: 应急堵漏损管，修补破裂龙骨船板。
 *   ④ 极限制裁与沉没负控制：
 *      - 当 bilgeWater >= 100% 或 hullIntegrity <= 0 时，船只进入沉没绝境（foundering），
 *        断言禁止执行常规航行巡航指令，强制抛出拒止判定（refusal: 'vessel-foundering-abandon-ship'）。
 *
 * ── 铁律与设计边界 ─────────────────────────────────────────────
 *   - 框架中立：无论木质帆船、铁甲舰、蒸汽货轮还是灵能飞舟，皆映射为浮力/结构/流场模型；
 *   - 状态持久化于 WA.store（root.maritimeVessels）；
 *   - 行为真源，杜绝虚构。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_maritime_navigation_settings_v1';
  const DEF = {
    enabled: true,
    maxVessels: 32,
    maxVoyageLogs: 64,
    drainEfficiencyPerPumping: 25,
    stormDamageFactor: 1.2
  };
  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'maritimeNavigation',
    bounds: {
      maxVessels: [4, 64],
      maxVoyageLogs: [8, 256],
      drainEfficiencyPerPumping: [5, 50],
      stormDamageFactor: [0.5, 3.0]
    }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    vesselsRegistered: 0,
    voyagesTacked: 0,
    pumpsExecuted: 0,
    cargoJettisoned: 0,
    shipwrecks: 0,
    refusals: 0,
    lastReason: ''
  };
  function noteFault(r) {
    stat.refusals++;
    stat.lastReason = String(r || 'unknown-refusal');
  }
  function cleanStr(val, maxLen) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen || 80);
  }
  function clamp(n, min, max) {
    const v = Number(n);
    if (isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
  }
  function getVessels(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return [];
    if (!target.maritimeVessels || !Array.isArray(target.maritimeVessels)) {
      if (draft) draft.maritimeVessels = [];
      return draft ? draft.maritimeVessels : [];
    }
    return target.maritimeVessels;
  }

  /**
   * 注册或初始化船舶档案
   */
  function registerVessel(spec) {
    spec = spec || {};
    const vesselId = cleanStr(spec.vesselId || spec.id || ('vessel_' + Date.now()), 48);
    const name = cleanStr(spec.name || '远洋探险舟', 48);
    const vesselType = cleanStr(spec.vesselType || 'caravel', 32);

    let created = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const vessels = getVessels(draft);
        let existing = vessels.find(function (v) { return v.vesselId === vesselId; });
        if (!existing) {
          existing = {
            vesselId: vesselId,
            name: name,
            vesselType: vesselType,
            hullIntegrity: clamp(spec.hullIntegrity != null ? spec.hullIntegrity : 100, 0, 100),
            bilgeWater: clamp(spec.bilgeWater != null ? spec.bilgeWater : 0, 0, 100),
            riggingIntegrity: clamp(spec.riggingIntegrity != null ? spec.riggingIntegrity : 100, 0, 100),
            cargoLoad: clamp(spec.cargoLoad != null ? spec.cargoLoad : 50, 0, 1000), // 吨
            maxCargoCapacity: clamp(spec.maxCargoCapacity != null ? spec.maxCargoCapacity : 100, 10, 2000),
            crewCount: clamp(spec.crewCount != null ? spec.crewCount : 20, 1, 500),
            crewMorale: clamp(spec.crewMorale != null ? spec.crewMorale : 85, 0, 100),
            status: 'docked', // docked | sailing | distressed | sunken
            heading: clamp(spec.heading != null ? spec.heading : 90, 0, 360), // 航向
            currentCoords: spec.coords || { x: 0, y: 0 },
            logs: [],
            createdAt: clockNow('maritime-reg'),
            updatedAt: clockNow('maritime-reg')
          };
          vessels.push(existing);
          stat.vesselsRegistered++;
        }
        created = JSON.parse(JSON.stringify(existing));
      });
    }
    return { ok: true, vessel: created };
  }

  /**
   * 远洋航行控制总枢纽
   */
  function navigateVoyage(spec) {
    spec = spec || {};
    const vesselId = cleanStr(spec.vesselId || spec.id, 48);
    const action = cleanStr(spec.action || 'tack', 32); // tack | furlSails | pumpBilge | jettisonCargo | repairHull
    if (!vesselId) {
      noteFault('missing-vessel-id');
      return { ok: false, refusal: 'missing-vessel-id', reason: '未指定船舶编号' };
    }

    let result = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const vessels = getVessels(draft);
        const vessel = vessels.find(function (v) { return v.vesselId === vesselId; });
        if (!vessel) {
          result = { ok: false, refusal: 'vessel-not-found', reason: '未找到该船舶记录' };
          noteFault('vessel-not-found');
          return;
        }

        // 负控制断言：船底积水达 100% 或结构归零，已经进入翻沉灭顶之灾，严禁正常航行
        if (vessel.bilgeWater >= 100 || vessel.hullIntegrity <= 0 || vessel.status === 'sunken') {
          vessel.status = 'sunken';
          stat.shipwrecks++;
          result = {
            ok: false,
            refusal: 'vessel-foundering-abandon-ship',
            reason: '船体破裂严重进水已达100%极限或龙骨断裂，船舶已倾覆沉没，全员必须弃船逃生！',
            vesselId: vesselId,
            bilgeWater: vessel.bilgeWater,
            hullIntegrity: vessel.hullIntegrity
          };
          noteFault('vessel-foundering-abandon-ship');
          return;
        }

        const env = spec.env || {};
        const stormLevel = clamp(env.stormLevel != null ? env.stormLevel : 0, 0, 12);
        const waveMeters = clamp(env.waveMeters != null ? env.waveMeters : 1.0, 0, 20);
        const currentKnots = clamp(env.currentKnots != null ? env.currentKnots : 2.0, 0, 20);
        const reefHazard = clamp(env.reefHazard != null ? env.reefHazard : 0, 0, 1.0);

        vessel.status = 'sailing';
        const now = clockNow('navigateVoyage');

        if (action === 'tack') {
          // 抢风航行或常规巡航
          const targetHeading = clamp(spec.heading != null ? spec.heading : vessel.heading, 0, 360);
          vessel.heading = targetHeading;

          // 若在风暴中强行全帆航行，增加进水与船体损伤
          if (stormLevel >= 6) {
            const waterIntake = Math.round(stormLevel * 4.5 * (1 + waveMeters * 0.1));
            const hullWear = Math.round(stormLevel * 2.0);
            vessel.bilgeWater = clamp(vessel.bilgeWater + waterIntake, 0, 100);
            vessel.hullIntegrity = clamp(vessel.hullIntegrity - hullWear, 0, 100);
            vessel.riggingIntegrity = clamp(vessel.riggingIntegrity - (stormLevel * 3), 0, 100);
          }
          // 暗礁刮擦危险
          if (reefHazard > 0.5) {
            const scrape = Math.round(reefHazard * 25);
            vessel.hullIntegrity = clamp(vessel.hullIntegrity - scrape, 0, 100);
            vessel.bilgeWater = clamp(vessel.bilgeWater + (scrape * 0.8), 0, 100);
          }

          if (vessel.bilgeWater >= 80) vessel.status = 'distressed';
          stat.voyagesTacked++;
          result = {
            ok: true,
            action: 'tack',
            vesselId: vesselId,
            newHeading: vessel.heading,
            hullIntegrity: vessel.hullIntegrity,
            bilgeWater: vessel.bilgeWater,
            status: vessel.status,
            narrative: `船只调整航向至 ${vessel.heading}°，顶着 ${stormLevel} 级海况与 ${waveMeters}m 涌浪劈波斩浪。`
          };
        } else if (action === 'furlSails') {
          // 收帆避风：保护桅杆与降低浪损
          vessel.riggingIntegrity = clamp(vessel.riggingIntegrity + 5, 0, 100);
          const safeWater = Math.max(0, Math.round(stormLevel * 1.5));
          vessel.bilgeWater = clamp(vessel.bilgeWater + safeWater, 0, 100);
          result = {
            ok: true,
            action: 'furlSails',
            vesselId: vesselId,
            bilgeWater: vessel.bilgeWater,
            riggingIntegrity: vessel.riggingIntegrity,
            narrative: '水手迅速收帆扎牢，极大减少了暴风雨对桅杆的扭力冲击。'
          };
        } else if (action === 'pumpBilge') {
          // 排水抽舱
          const pumpPwr = clamp(spec.pumpEfficiency || 25, 10, 60);
          const oldWater = vessel.bilgeWater;
          vessel.bilgeWater = clamp(vessel.bilgeWater - pumpPwr, 0, 100);
          if (vessel.bilgeWater < 80 && vessel.status === 'distressed') vessel.status = 'sailing';
          stat.pumpsExecuted++;
          result = {
            ok: true,
            action: 'pumpBilge',
            vesselId: vesselId,
            drainedPct: oldWater - vessel.bilgeWater,
            remainingBilgeWater: vessel.bilgeWater,
            narrative: `全员轮番踩动抽水机，舱底积水从 ${oldWater}% 排降至 ${vessel.bilgeWater}%。`
          };
        } else if (action === 'jettisonCargo') {
          // 弃货减重防倾覆
          const jettisonAmount = clamp(spec.amount || 20, 5, vessel.cargoLoad);
          vessel.cargoLoad = clamp(vessel.cargoLoad - jettisonAmount, 0, 1000);
          // 弃货提高船身干舷，降低 15% 积水翻沉危险
          vessel.bilgeWater = clamp(vessel.bilgeWater - 15, 0, 100);
          stat.cargoJettisoned++;
          result = {
            ok: true,
            action: 'jettisonCargo',
            vesselId: vesselId,
            jettisonedTons: jettisonAmount,
            remainingCargo: vessel.cargoLoad,
            bilgeWater: vessel.bilgeWater,
            narrative: `船长忍痛斩断货舱缆绳抛掷 ${jettisonAmount} 吨货物入海，船身大幅上浮恢复平衡！`
          };
        } else if (action === 'repairHull') {
          // 损管堵漏
          const repairVal = clamp(spec.materials ? 20 : 10, 5, 30);
          vessel.hullIntegrity = clamp(vessel.hullIntegrity + repairVal, 0, 100);
          result = {
            ok: true,
            action: 'repairHull',
            vesselId: vesselId,
            repairedIntegrity: vessel.hullIntegrity,
            narrative: `木工在底舱用帆布抹上沥青强行钉死漏水裂缝，船体耐久恢复至 ${vessel.hullIntegrity}。`
          };
        } else {
          result = { ok: false, refusal: 'unknown-action', reason: '未知航海指令: ' + action };
          noteFault('unknown-action');
          return;
        }

        vessel.updatedAt = now;
        vessel.logs.unshift({
          action: action,
          result: result.narrative,
          at: now
        });
        if (vessel.logs.length > 20) vessel.logs.length = 20;
      });
    }

    return result || { ok: false, refusal: 'store-unavailable' };
  }

  function getVessel(vesselId) {
    const vessels = getVessels();
    return vessels.find(function (v) { return v.vesselId === vesselId; }) || null;
  }

  function buildBlock() {
    const vessels = getVessels();
    if (!vessels || vessels.length === 0) return '';
    const active = vessels.filter(function (v) { return v.status !== 'docked'; }).slice(0, 3);
    if (active.length === 0) return '';
    const lines = ['【航海与水文动力学】'];
    active.forEach(function (v) {
      const stateBadge = v.status === 'distressed' ? '【告急】' : (v.status === 'sunken' ? '【沉没】' : '【航行中】');
      lines.push(`· ${v.name}${stateBadge}：航向 ${v.heading}°，船体耐久 ${v.hullIntegrity}/100，舱底积水 ${v.bilgeWater}%，载重 ${v.cargoLoad}T`);
    });
    return lines.join('\n');
  }

  WA.maritimeNavigation = {
    DEF: DEF,
    settings: settings,
    saveSettings: saveSettings,
    registerVessel: registerVessel,
    navigateVoyage: navigateVoyage,
    getVessel: getVessel,
    buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/maritime-navigation.js', { kind: 'engine', ver: '2.351.0' });
  }
})();
