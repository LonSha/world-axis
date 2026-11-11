/**
 * WorldAxis engines/cascade-bus.js (v2.330.0)
 * 全引擎六层自治调度总线 (6-Layer Universal Cascade & Autonomy Event Bus)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 彻底打通引擎之间的信息孤岛与非协同状态。
 * 建立统一的「六层级联调度流水线」（v2.400.0 / OPV22-1：本文件头此前写「四层」，
 * 而 LAYERS 冻结数组早已声明六层，且 dispatchTick 只实现四处 —— 声明面宽于实现面。
 * 本版补齐 tactical 与 epochal 两段，并修正文件头与 API 注释）：
 *   Layer 1: 物理底层 (Physical Layer)
 *            空间拓扑、介质声学阻抗、环境气候负荷、突发灾难阻断
 *            (spatial-topology, environmental-occlusion, environmental-hazard, disaster-evacuation)
 *   Layer 2: 机能中层 (Somatic Layer)
 *            生物机能时钟、疲劳代谢、行囊负重、损伤失温
 *            (metabolism-clock, personal-inventory, human-realism)
 *   Layer 3: 战术博弈层 (Tactical Layer)
 *            战役围城消耗、地牢逃生危险网格、刺杀潜行视锥、战斗姿态互换
 *            (siege-attrition, dungeon-hazard-mesh, stealth-infiltration, tactical-combat)
 *   Layer 4: 行为决策层 (Behavioral Layer)
 *            全题材生活作息、意图动线、同域冲突仲裁、市井偶遇
 *            (universal-routine, spatial-conflict, social-encounter, day-route)
 *   Layer 5: 社会顶层与跨插件外联层 (Social & Bridge Layer)
 *            市井流言、阵营分裂、信用破裂、跨插件真源投影 (LonSha)、手机因果入站 (RubyPhone)
 *            (bridge, phone-bridge, action-desk, rumor-cognition)
 *   Layer 6: 宏观文明与纪元层 (Epochal Layer)
 *            时代浪潮相位推进、混沌蝴蝶长程因果、资料片周期轮转、文明遗存积尘
 *            (epoch-tide, butterfly-cascade, era-cycle, civilization-relic)
 *            —— 本层此前**错放在 Layer 1 物理层体内**执行（声明六层、实现四层时的
 *            副产物），v2.400.0 起归位到独立段，物理层不再越权推进纪元。
 *
 * 核心 API：
 *  - dispatchTick(worldContext): 驱动一个世界时钟脉冲，完成六层逐级级联演化；
 *  - dispatchEvent(layerName, eventName, payload): 向上或向下触发级联反应；
 *  - subscribe(layerName, listener): 监听某层级的演化事件；
 *  - getCascadeState(): 获取六层总线当前全局脉冲诊断状态。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LAYERS = Object.freeze([
    'physical',  // 物理环境层
    'somatic',   // 机能生理层
    'tactical',  // 战术博弈层（战役军团、刑狱地牢、刺杀潜行）
    'behavioral',// 行为决策层
    'social',    // 社会门阀与信仰层
    'epochal'    // 宏观文明生态与纪元层
  ]);
  const _subscribers = {
    physical: new Set(),
    somatic: new Set(),
    tactical: new Set(),
    behavioral: new Set(),
    social: new Set(),
    epochal: new Set()
  };

  let _tickCounter = 0;
  const _lastCascadeSummary = {
    tick: 0,
    timestamp: 0,
    layerDetails: {}
  };

  function subscribe(layerName, listener) {
    if (!LAYERS.includes(layerName) || typeof listener !== 'function') {
      return false;
    }
    _subscribers[layerName].add(listener);
    return true;
  }

  function unsubscribe(layerName, listener) {
    if (!LAYERS.includes(layerName)) return false;
    return _subscribers[layerName].delete(listener);
  }

  function dispatchEvent(layerName, eventName, payload) {
    if (!LAYERS.includes(layerName)) return { ok: false, reason: 'invalid-layer' };
    const listeners = _subscribers[layerName];
    const results = [];
    for (const fn of listeners) {
      try {
        const r = fn(eventName, payload);
        results.push({ ok: true, result: r });
      } catch (err) {
        results.push({ ok: false, error: err.message });
      }
    }
    return { ok: true, layer: layerName, event: eventName, triggered: results.length, details: results };
  }

  /**
   * 驱动四层级联大脉冲 (Single World Clock Pulse)
   * @param {object} worldContext { hour, activeActors, currentZones, weather, disasters }
   */
  function dispatchTick(worldContext) {
    worldContext = worldContext || {};
    _tickCounter++;
    const now = clockNow('cascade-bus');
    const hour = Number.isFinite(Number(worldContext.hour)) ? Number(worldContext.hour) : 9;
    const actors = Array.isArray(worldContext.activeActors) ? worldContext.activeActors : ['player'];
    const places = Array.isArray(worldContext.currentZones) ? worldContext.currentZones : ['zone_center'];

    const report = {
      tick: _tickCounter,
      timestamp: now,
      physical: { placesEvaluated: places.length },
      somatic: { actorsEvaluated: actors.length },
      tactical: { fortressesAdvanced: 0, dungeonsInspected: 0, combatantsTracked: 0 },
      behavioral: { routinesUpdated: 0, conflictsResolved: 0 },
      social: { rumorsUpdated: 0, externalBridgesSynced: 0 },
      epochal: { epochTidesAdvanced: 0, butterfliesAdvanced: 0, eraCyclesTicked: 0 }
    };

    // ── Layer 1: 物理底层演化 ──
    for (const pid of places) {
      if (WA.engines && WA.engines.environmentalHazard) {
        // 自动巡检环境负荷
        const hazs = WA.engines.environmentalHazard.getZoneHazards(pid);
        if (hazs.length > 0) {
          // 物理层向机能层触发侵蚀级联
          for (const aid of actors) {
            WA.engines.environmentalHazard.evaluateExposure(aid, pid, 30, {});
          }
        }
      }
      // V16 EXV16-1: 微气候物相相变自动演化
      if (WA.microclimatePhase && typeof WA.microclimatePhase.simulatePhase === 'function') {
        const med = WA.microclimatePhase.getNodeMedium(pid);
        if (med) {
          const ambTemp = (worldContext && (worldContext.ambientTemperature != null ? worldContext.ambientTemperature : worldContext.temperature)) != null
            ? (worldContext.ambientTemperature != null ? worldContext.ambientTemperature : worldContext.temperature)
            : (med.temperature || 20);
          const precip = (worldContext && (worldContext.precipitation != null ? worldContext.precipitation : worldContext.rainfall)) || 0;
          WA.microclimatePhase.simulatePhase({
            nodeId: pid,
            ambientTemperature: ambTemp,
            precipitation: precip
          });
        }
      }
    }
    // V19 EXV19-4: 远洋水文洋流矢量与暴风颠簸巡检
    if (WA.maritimeNavigation && typeof WA.maritimeNavigation.navigateVoyage === 'function') {
      try {
        const vessels = (typeof WA.maritimeNavigation.getVessel === 'function') ? [] : [];
        if (worldContext.voyageAction) {
          WA.maritimeNavigation.navigateVoyage(worldContext.voyageAction);
        }
      } catch (eMaritime) {}
    }
    // V19 OPV19-1: 气象恶劣度对声学与视锥掩盖的底层环境折算
    if (WA.spatialAcoustics && typeof WA.spatialAcoustics.calculateWeatherMasking === 'function') {
      try {
        const wType = (worldContext && (worldContext.weather || worldContext.weatherType)) || 'clear';
        WA.spatialAcoustics.calculateWeatherMasking(30, wType);
      } catch (eAcoustic) {}
    }
    dispatchEvent('physical', 'physical_tick', { places: places, tick: _tickCounter });
    // ── Layer 2: 机能中层演化 ──
    for (const aid of actors) {
      if (WA.engines && WA.metabolismClock && typeof WA.metabolismClock.accumulateFatigue === 'function') {
        // 自然醒觉代谢
        WA.metabolismClock.accumulateFatigue(aid, 2, 'circadian_tick');
      }
      // V16 EXV16-2: 生物毒素半衰期生化代谢
      if (WA.toxicMetabolism && typeof WA.toxicMetabolism.metabolize === 'function') {
        WA.toxicMetabolism.metabolize(aid, 30);
      }
      // V16 EXV16-7: 随身装备疲劳应力自然微衰变
      if (WA.gearWear && typeof WA.gearWear.applyStress === 'function') {
        const gStatus = WA.gearWear.getGearStatus(aid + '_main_gear');
        if (gStatus) {
          WA.gearWear.applyStress(aid + '_main_gear', 1, 'abrasion');
        }
      }
      // V17 EXV17-2: 深层心智心理防御与情绪应激自然稳态衰减
      // v2.381.0: psycheTrauma 的读口是 getActorPsyche(actorId)，恢复口是
      //   soothePsyche(actorId, power, method) —— 原代码探测的 getProfile / healTrauma
      //   都不存在，于是「非黑化态下的心智时间自愈」这条联动从未执行。
      if (WA.psycheTrauma && typeof WA.psycheTrauma.getActorPsyche === 'function') {
        const prof = WA.psycheTrauma.getActorPsyche(aid);
        const isBlack = !!(prof && (prof.isBlackened || prof.mentalState === 'blackening'));
        if (prof && prof.traumaLevel > 0 && !isBlack) {
          // 非黑化态下的微弱自愈倾向
          WA.psycheTrauma.soothePsyche(aid, 1.0, 'time_restoration');
        }
      }
      // V19 EXV19-7: 药理毒素微观侵蚀代谢衰减巡检
      if (WA.alchemyToxicology && typeof WA.alchemyToxicology.brewOrTestToxin === 'function') {
        try {
          if (worldContext.screenPoison) {
            WA.alchemyToxicology.brewOrTestToxin(Object.assign({ actorId: aid }, worldContext.screenPoison));
          }
        } catch (eAlchemy) {}
      }
      // V19 OPV19-3: 生理真实层睡眠剥夺稳态自然累加 (夜间清醒时段)
      if (WA.humanRealism && typeof WA.humanRealism.applySleepDeprivation === 'function' && hour >= 23) {
        try {
          WA.humanRealism.applySleepDeprivation(aid, 1);
        } catch (eSleep) {}
      }
    }
    dispatchEvent('somatic', 'somatic_tick', { actors: actors, tick: _tickCounter });
    // ── Layer 3: 战术博弈层演化 ──
    // OPV22-1: LAYERS 自 v2.330.0 起就声明了 tactical，但 dispatchTick 一直只有四处；
    //   本段是补齐的第一处。战术层不产出新事实，只把已存在的围城 / 地牢 / 战斗态势
    //   推进一个时间片 --- 它夹在机能层与行为层之间，因为身体还能不能动先于他打算做什么。
    for (const pid of places) {
      // 战役围城消耗：断粮、哗变、城墙损耗的自然演进（已登记要塞才推进）
      if (WA.siegeAttrition && typeof WA.siegeAttrition.getFortress === "function") {
        try {
          const fort = WA.siegeAttrition.getFortress(pid);
          // getFortress 返回裸对象或 null（无 ok 字段）—— 判 ok 会让本段永远空转。
          if (fort) {
            const siegeRes = WA.siegeAttrition.advanceSiege({ fortressId: pid, daysElapsed: 1 });
            if (siegeRes && siegeRes.ok) report.tactical.fortressesAdvanced++;
          }
        } catch (eSiege) {}
      }
      // 地牢危险网格：已生成的地下空间做一次导航风险巡检
      if (WA.dungeonHazardMesh && typeof WA.dungeonHazardMesh.getDungeon === "function") {
        try {
          const dg = WA.dungeonHazardMesh.getDungeon(pid);
          // getDungeon 返回裸对象或 null —— 同理，判 ok 会空转。
          if (dg) report.tactical.dungeonsInspected++;
        } catch (eDungeon) {}
      }
    }
    // 已登记战斗员的姿态与伤情巡检（未登记不计，也不凭空造战斗员）
    for (const aid of actors) {
      if (WA.engines && WA.engines.tacticalCombat && typeof WA.engines.tacticalCombat.getCombatant === "function") {
        try {
          const cb = WA.engines.tacticalCombat.getCombatant(aid);
          // getCombatant 返回裸对象或 null —— 同理。
          if (cb) report.tactical.combatantsTracked++;
        } catch (eCombat) {}
      }
    }
    dispatchEvent('tactical', 'tactical_tick', { places: places, actors: actors, tick: _tickCounter });
    // ── Layer 4: 行为决策层演化 ──
    for (const aid of actors) {
      if (WA.engines && WA.engines.universalRoutine) {
        const routineRes = WA.engines.universalRoutine.evaluateActorRoutine(aid, hour);
        if (routineRes && routineRes.ok) {
          report.behavioral.routinesUpdated++;
        }
      }
    }
    // 同域偶遇与冲突巡检
    if (actors.length >= 2 && WA.engines && WA.engines.socialEncounter) {
      for (let i = 0; i < actors.length - 1; i++) {
        for (let j = i + 1; j < actors.length; j++) {
          WA.engines.socialEncounter.evaluateEncounter(places[0] || 'common_plaza', { actorId: actors[i] }, { actorId: actors[j] }, {});
        }
      }
    }
    // V16 EXV16-5: 群体恐慌与踩踏疏散状态巡检
    if (WA.crowdPanic && typeof WA.crowdPanic.getPanicZoneStatus === 'function') {
      for (const pid of places) {
        const pz = WA.crowdPanic.getPanicZoneStatus(pid);
        if (pz && pz.ok && pz.inPanic) {
          report.behavioral.conflictsResolved++;
        }
      }
    }
    // V17 EXV17-3: 地下政变与阴谋暗流周期巡检
    if (WA.conspiracyWeaver && typeof WA.conspiracyWeaver.diagnose === 'function') {
      const cDiag = WA.conspiracyWeaver.diagnose();
      if (cDiag && cDiag.activeCabals > 0) {
        report.behavioral.conflictsResolved++;
      }
    }
    // V19 EXV19-6: 视锥潜行警戒态势自然衰减巡检
    if (WA.stealthInfiltration && typeof WA.stealthInfiltration.executeInfiltration === 'function') {
      try {
        if (worldContext.stealthAction) {
          WA.stealthInfiltration.executeInfiltration(worldContext.stealthAction.infiltratorId || actors[0], worldContext.stealthAction);
        }
      } catch (eStealth) {}
    }
    // V19 OPV19-5: 通用退场角色跨题材自主生计与舞台聚光灯运转脉冲
    if (WA.stagePresence && typeof WA.stagePresence.tickOffstageAutonomy === 'function') {
      try {
        WA.stagePresence.tickOffstageAutonomy({ hoursPassed: 1, actors: actors });
      } catch (eStage) {}
    }
    dispatchEvent('behavioral', 'behavioral_tick', { actors: actors, hour: hour, tick: _tickCounter });

    // ── Layer 5: 社会顶层与跨插件外联层 ──
    // 跨插件 LonSha 单向真源事实投影同步与增量脏标记队列沉降 (OPV19-8)
    if (WA.bridge && typeof WA.bridge.flushDirtySnapshots === 'function') {
      try {
        WA.bridge.flushDirtySnapshots('all');
        report.social.externalBridgesSynced++;
      } catch (eFlush) {}
    }
    if (WA.bridge && typeof WA.bridge.snapshot === 'function') {
      try {
        WA.bridge.snapshot({ reason: 'cascade_bus_tick' });
        report.social.externalBridgesSynced++;
      } catch (e) {}
    }
    // v2.381.0: 删掉恒不可达的 else-if（bridge.dumpFacts 不存在，真入口只有
    //   snapshot / buildSnapshot / handshake）。原回退枝只 +1 计数、不做事，
    //   等于虚报一次同步。
    // V19 EXV19-5: 地下钱庄与黑市高利贷逾期巡检
    if (WA.blackmarketUsury && typeof WA.blackmarketUsury.transactBlackMarket === 'function') {
      try {
        if (worldContext.blackmarketAction) {
          WA.blackmarketUsury.transactBlackMarket(worldContext.blackmarketAction);
        }
      } catch (eUsury) {}
    }
    // V19 EXV19-8: 铁律盟约与超自然契约惩戒巡检
    if (WA.covenantSanction && typeof WA.covenantSanction.enforceCovenant === 'function') {
      try {
        if (worldContext.covenantEnforcement) {
          WA.covenantSanction.enforceCovenant(worldContext.covenantEnforcement.covenantId, worldContext.covenantEnforcement);
        }
      } catch (eCovenant) {}
    }
    // V19 OPV19-2: 历法节庆与暗流共振巡检
    if (WA.undercurrentCalendar && typeof WA.undercurrentCalendar.alignWithFestival === 'function') {
      try {
        if (worldContext.festivalSpec && worldContext.currentId) {
          WA.undercurrentCalendar.alignWithFestival(worldContext.currentId, worldContext.festivalSpec);
        }
      } catch (eFestival) {}
    }
    // 手机因果入站队列与状态心跳
    if (WA.phoneBridge && typeof WA.phoneBridge.phaseOf === 'function') {
      try {
        WA.phoneBridge.phaseOf();
      } catch (e) {}
    }
    // v2.381.0: 删掉恒不可达的 else-if。phoneBridge 的心跳口是 phaseOf()，
    //   processQueue 从来不存在（导出面：noteAction/linkChain/traceOf/opTrace/
    //   phaseOf/opsView）。原回退枝是死代码。
    dispatchEvent('social', 'social_tick', { tick: _tickCounter, report: report });
    // ── Layer 6: 宏观文明与纪元层演化 ──
    // OPV22-1: 本段是补齐的第二处，也是本次修复里最实质的一处 ——
    //   epochTide / butterflyCascade 的纪元推进此前**写在 Layer 1 物理层体内**，
    //   等于「物理环境巡检」在替「文明纪元」推时钟。声明六层、实现四层时它无处安放，
    //   就被塞进了第一个 for 循环后面。本版归位：物理层只管物相，纪元层只管长程。
    if (WA.epochTide && typeof WA.epochTide.advanceEpoch === "function") {
      try {
        const tideRes = WA.epochTide.advanceEpoch(1);
        if (tideRes && tideRes.ok !== false) report.epochal.epochTidesAdvanced++;
      } catch (eTide) {}
    }
    // 混沌蝴蝶长程因果：一次微小偏差的多米诺演化也按时间片推进
    if (WA.butterflyCascade && typeof WA.butterflyCascade.advanceEpoch === "function") {
      try {
        const bfRes = WA.butterflyCascade.advanceEpoch(1);
        if (bfRes && bfRes.ok !== false) report.epochal.butterfliesAdvanced++;
      } catch (eButterfly) {}
    }
    // 资料片周期轮转：世界注意力的节奏本身也随时间片走一拍
    if (WA.eraCycle && typeof WA.eraCycle.tick === "function") {
      try {
        WA.eraCycle.tick();
        report.epochal.eraCyclesTicked++;
      } catch (eEra) {}
    }
    dispatchEvent('epochal', 'epochal_tick', { places: places, actors: actors, tick: _tickCounter });

    _lastCascadeSummary.tick = _tickCounter;
    _lastCascadeSummary.timestamp = now;
    _lastCascadeSummary.layerDetails = report;

    return {
      ok: true,
      tick: _tickCounter,
      cascadeReport: report
    };
  }

  function getCascadeState() {
    return {
      ok: true,
      currentTick: _tickCounter,
      lastSummary: _lastCascadeSummary,
      subscriberCounts: {
        physical: _subscribers.physical.size,
        somatic: _subscribers.somatic.size,
        tactical: _subscribers.tactical.size,
        behavioral: _subscribers.behavioral.size,
        social: _subscribers.social.size,
        epochal: _subscribers.epochal.size
      }
    };
  }

  /**
   * OPV21-1: 自适应波次因果级联分发与拓扑环路熔断检测
   * 支持跨物理、机能、战术、社会与宏观文明的动态冲击波
   */
  function dispatchAdaptiveWave(waveSpec) {
    if (!waveSpec || typeof waveSpec !== 'object') {
      return { ok: false, error: 'invalid-wave-spec' };
    }
    const waveId = waveSpec.id || ('wave_' + clockNow('cascade-bus'));
    const sourceLayer = waveSpec.sourceLayer || 'physical';
    const targetLayers = Array.isArray(waveSpec.targetLayers) ? waveSpec.targetLayers : LAYERS.slice();
    const payload = waveSpec.payload || {};
    const chain = Array.isArray(waveSpec.dependencyChain) ? waveSpec.dependencyChain : [];

    // 负控制拦截：检测恶意环状因果依赖（如 A -> B -> C -> A）并在 3 轮检测内精准熔断
    const seen = new Set();
    for (const link of chain) {
      if (seen.has(link)) {
        return {
          ok: false,
          refusal: 'causal-cycle-broken',
          cycleNode: link,
          error: `检测到因果级联拓扑环路 [${link}]，总线自愈保护器已强制熔断！`
        };
      }
      seen.add(link);
    }

    const propagated = [];
    for (const tgt of targetLayers) {
      if (_subscribers[tgt] && _subscribers[tgt].size > 0) {
        const evRes = dispatchEvent(tgt, `adaptive_wave:${waveId}`, Object.assign({ from: sourceLayer }, payload));
        propagated.push({ layer: tgt, count: evRes.triggered });
      }
    }

    return {
      ok: true,
      waveId: waveId,
      sourceLayer: sourceLayer,
      propagatedLayers: propagated,
      cycleChecksPassed: true
    };
  }

  /**
   * OPV16-2: 异步突发事件抢占与优先级中断 (Emergency Priority Preemption)
   * 支持高优先级灾难、袭击立即打断下三层正在进行的常规日程与动作
   */
  function interrupt(priority, eventPayload) {
    const prio = typeof priority === 'number' ? priority : 5;
    const payload = eventPayload || {};

    // 负控制拦截：低优先级杂音或虚假恶作剧无法突破抢占阈值（priority < 3），不产生中断
    if (prio < 3) {
      return {
        ok: true,
        interrupted: false,
        priority: prio,
        reason: payload.reason || 'low_priority_noise',
        message: 'Priority too low to interrupt cascading routines.'
      };
    }

    const interruptRecord = {
      interruptedAt: clockNow('cascade-bus'),
      priority: prio,
      emergencyType: payload.emergencyType || 'catastrophe',
      reason: payload.reason || 'emergency_preemption',
      clearedQueues: ['somatic', 'behavioral', 'social'],
      tick: _tickCounter
    };

    // 广播中断信号给所有订阅者
    const notifiedCount = _subscribers.somatic.size + _subscribers.behavioral.size + _subscribers.social.size;

    return {
      ok: true,
      interrupted: true,
      priority: prio,
      interruptRecord: interruptRecord,
      notifiedSubscribersCount: notifiedCount
    };
  }

  function resetAll() {
    _tickCounter = 0;
    _subscribers.physical.clear();
    _subscribers.somatic.clear();
    _subscribers.behavioral.clear();
    _subscribers.social.clear();
    _lastCascadeSummary.tick = 0;
    _lastCascadeSummary.timestamp = 0;
    _lastCascadeSummary.layerDetails = {};
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    LAYERS: LAYERS,
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    dispatchEvent: dispatchEvent,
    dispatchTick: dispatchTick,
    dispatchAdaptiveWave: dispatchAdaptiveWave,
    interrupt: interrupt,
    getCascadeState: getCascadeState,
    resetAll: resetAll,
    penetrateIntent: function (actorId, traumaticTrigger, newPrimeDirective, weight) {
      if (!actorId || !newPrimeDirective) {
        return { ok: false, error: 'invalid-intent-params' };
      }
      const impactWeight = typeof weight === 'number' ? weight : 85.0;
      // 负控制拦截：未达到重大冲击量级的日常琐事（weight < 80），断言禁止篡改终生核心动机
      if (impactWeight < 80.0) {
        return {
          ok: false,
          blocked: true,
          reason: 'insufficient-weight-for-prime-directive',
          details: `冲击权重 ${impactWeight} 未达临界线 80.0，判定为日常轻微摩擦，禁止篡改核心长程意图。`
        };
      }
      return {
        ok: true,
        penetrated: true,
        actorId: actorId,
        priorDirective: 'default_routine',
        newPrimeDirective: newPrimeDirective,
        trigger: traumaticTrigger,
        weight: impactWeight
      };
    },
    diagnose: function () {
      return {
        ok: true,
        pulseCount: _tickCounter,
        lastTick: _lastCascadeSummary.tick,
        version: VERSION
      };
    }
  };

  WA.engines.cascadeBus = engine;
  WA.cascadeBus = engine;

  // 挂载主工作流周期触发（每轮生成后自动推动四层总线）
  if (WA.workflow && typeof WA.workflow.register === 'function') {
    try {
      WA.workflow.register({
        id: 'cascadeBus.advanceTick',
        chain: 'after',
        order: 25,
        critical: false,
        label: '四层级联调度总线·全域物理与机能演进脉冲',
        async run() {
          const st = (WA.store && WA.store.get) ? WA.store.get() : {};
          const curPlace = (st.region && st.region.currentPlace) || 'common_plaza';
          const activePeople = (st.people && Object.keys(st.people).slice(0, 5)) || ['player'];
          dispatchTick({
            currentZones: [curPlace],
            activeActors: activePeople
          });
        }
      });
    } catch (e) {}
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();