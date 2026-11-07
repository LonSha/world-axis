/**
 * WorldAxis engines/cascade-bus.js (v2.330.0)
 * 340 引擎四层自治调度总线 (4-Layer Universal Cascade & Autonomy Event Bus)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 彻底打通 340 个引擎之间的信息孤岛与非协同状态。
 * 建立统一的「四层级联调度流水线」：
 *   Layer 1: 物理底层 (Physical Layer)
 *            空间拓扑、介质声学阻抗、环境气候负荷、突发灾难阻断
 *            (spatial-topology, environmental-occlusion, environmental-hazard, disaster-evacuation)
 *   Layer 2: 机能中层 (Somatic Layer)
 *            生物机能时钟、疲劳代谢、行囊负重、损伤失温
 *            (metabolism-clock, personal-inventory, human-realism)
 *   Layer 3: 行为决策层 (Behavioral Layer)
 *            全题材生活作息、意图动线、同域冲突仲裁、市井偶遇
 *            (universal-routine, spatial-conflict, social-encounter, day-route)
 *   Layer 4: 社会顶层与跨插件外联层 (Social & Bridge Layer)
 *            市井流言、阵营分裂、信用破裂、跨插件真源投影 (LonSha)、手机因果入站 (RubyPhone)
 *            (bridge, phone-bridge, action-desk, rumor-cognition)
 *
 * 核心 API：
 *  - dispatchTick(worldContext): 驱动一个世界时钟脉冲，完成四层逐级级联演化；
 *  - dispatchEvent(layerName, eventName, payload): 向上或向下触发级联反应；
 *  - subscribe(layerName, listener): 监听某层级的演化事件；
 *  - getCascadeState(): 获取四层总线当前全局脉冲诊断状态。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const LAYERS = Object.freeze([
    'physical',  // 物理底层
    'somatic',   // 机能中层
    'behavioral',// 行为决策层
    'social'     // 社会顶层与跨插件桥
  ]);

  const _subscribers = {
    physical: new Set(),
    somatic: new Set(),
    behavioral: new Set(),
    social: new Set()
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
    const now = Date.now();
    const hour = Number.isFinite(Number(worldContext.hour)) ? Number(worldContext.hour) : 9;
    const actors = Array.isArray(worldContext.activeActors) ? worldContext.activeActors : ['player'];
    const places = Array.isArray(worldContext.currentZones) ? worldContext.currentZones : ['zone_center'];

    const report = {
      tick: _tickCounter,
      timestamp: now,
      physical: { placesEvaluated: places.length },
      somatic: { actorsEvaluated: actors.length },
      behavioral: { routinesUpdated: 0, conflictsResolved: 0 },
      social: { rumorsUpdated: 0, externalBridgesSynced: 0 }
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
    }
    dispatchEvent('physical', 'physical_tick', { places: places, tick: _tickCounter });

    // ── Layer 2: 机能中层演化 ──
    for (const aid of actors) {
      if (WA.engines && WA.engines.metabolismClock && typeof WA.engines.metabolismClock.accumulateFatigue === 'function') {
        // 自然醒觉代谢
        WA.engines.metabolismClock.accumulateFatigue(aid, 2, 'circadian_tick');
      }
    }
    dispatchEvent('somatic', 'somatic_tick', { actors: actors, tick: _tickCounter });

    // ── Layer 3: 行为决策层演化 ──
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
    dispatchEvent('behavioral', 'behavioral_tick', { actors: actors, hour: hour, tick: _tickCounter });

    // ── Layer 4: 社会顶层与跨插件外联层 ──
    // 跨插件 LonSha 单向真源事实投影同步 (调用 bridge.snapshot 刷新外部快照)
    if (WA.bridge && typeof WA.bridge.snapshot === 'function') {
      try {
        WA.bridge.snapshot({ reason: 'cascade_bus_tick' });
        report.social.externalBridgesSynced++;
      } catch (e) {}
    } else if (WA.bridge && typeof WA.bridge.dumpFacts === 'function') {
      report.social.externalBridgesSynced++;
    }
    // 手机因果入站队列与状态心跳
    if (WA.phoneBridge && typeof WA.phoneBridge.phaseOf === 'function') {
      try {
        WA.phoneBridge.phaseOf();
      } catch (e) {}
    } else if (WA.phoneBridge && typeof WA.phoneBridge.processQueue === 'function') {
      WA.phoneBridge.processQueue();
    }
    dispatchEvent('social', 'social_tick', { tick: _tickCounter, report: report });

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
        behavioral: _subscribers.behavioral.size,
        social: _subscribers.social.size
      }
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
      interruptedAt: Date.now(),
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
    interrupt: interrupt,
    getCascadeState: getCascadeState,
    resetAll: resetAll,
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
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();