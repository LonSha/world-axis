/**
 * WorldAxis engines/butterfly-cascade.js (v2.340.0)
 * EXV17-1: 混沌蝴蝶长程多米诺因果拓扑引擎 (Butterfly Cascade & Domino Dynamics)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用混沌理论微观扰动多级放大模型。微小的因果火花（种子扰动）随时间推演与社会空间拓扑
 * 进行非线性传导，突破阻尼阈值后，引发宏观系统性巨变：
 *  1. 种子扰动注入 (triggerFlutter):
 *     - seedEventId: 触发事件唯一键
 *     - initialEnergy: 初始能量势能 (1~100)
 *     - amplifier: 介质放大系数 (1.0~5.0)
 *     - dampingFloor: 环境吸收阻尼下限 (低于此值自然平息)
 *  2. 多米诺阶段 (Domino Stages):
 *     - 'incubation' (潜伏孕育)
 *     - 'ripple' (涟漪扩散)
 *     - 'amplification' (共振放大)
 *     - 'macro_crisis' (宏观危机爆发)
 *
 * 核心方法：
 *  - triggerFlutter(seedEventId, initialEnergy, targetTopologyChain, opts)
 *  - advanceTurn(stepCount)
 *  - getCascadeState(seedEventId)
 *  - listActiveCascades()
 *  - resetAll()
 *  - diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.340.0';

  // 蝴蝶级联台账: Map<seedEventId, { seedEventId, currentEnergy, amplifier, dampingFloor, currentStage, turnsElapsed, targetTopologyChain, macroOutcome, settled }>
  const _cascadeRegistry = new Map();

  function triggerFlutter(seedEventId, initialEnergy, targetTopologyChain, opts) {
    if (typeof seedEventId === 'object' && seedEventId !== null) {
      const o = seedEventId;
      return triggerFlutter(o.seedId || o.seedEventId, o.initialMagnitude || o.initialEnergy || 25, o.targetTopologyChain, o.opts || o);
    }
    if (!seedEventId || typeof seedEventId !== 'string') {
      return { ok: false, error: 'invalid_seed_event_id' };
    }
    const energy = Number(initialEnergy);
    if (isNaN(energy) || energy <= 0) {
      return { ok: false, error: 'invalid_initial_energy' };
    }
    const opt = opts || {};
    const dampingFloor = typeof opt.dampingFloor === 'number' ? opt.dampingFloor : 10.0;

    // 负控制硬门禁：若初始能量被环境阻尼完全吸收，断言自然平息，严禁无限凭空放大
    if (energy <= dampingFloor) {
      return {
        ok: false,
        error: 'energy_absorbed_by_damping_floor',
        seedEventId: seedEventId,
        energy: energy,
        dampingFloor: dampingFloor
      };
    }

    const amplifier = typeof opt.amplifier === 'number' ? Math.max(1.0, Math.min(5.0, opt.amplifier)) : 1.5;
    const chain = Array.isArray(targetTopologyChain) ? targetTopologyChain : ['local_node', 'district', 'city_wide'];

    const record = {
      seedEventId: seedEventId,
      currentEnergy: energy,
      amplifier: amplifier,
      dampingFloor: dampingFloor,
      currentStage: 'incubation',
      turnsElapsed: 0,
      targetTopologyChain: chain,
      macroOutcome: null,
      settled: false,
      createdAt: Date.now()
    };

    _cascadeRegistry.set(seedEventId, record);

    return {
      ok: true,
      seedEventId: seedEventId,
      initialEnergy: energy,
      stage: record.currentStage,
      amplifier: amplifier
    };
  }

  function advanceTurn(stepCount) {
    const steps = typeof stepCount === 'number' ? Math.max(1, Math.round(stepCount)) : 1;
    const reports = [];

    for (const [id, rec] of _cascadeRegistry.entries()) {
      if (rec.settled) continue;

      for (let s = 0; s < steps; s++) {
        rec.turnsElapsed += 1;
        // 能量放大
        rec.currentEnergy = Math.round(rec.currentEnergy * rec.amplifier);

        // 阶段推进
        if (rec.turnsElapsed >= 5 || rec.currentEnergy >= 500) {
          rec.currentStage = 'macro_crisis';
          rec.macroOutcome = 'systemic_turbulence_triggered';
          rec.settled = true;
          break;
        } else if (rec.turnsElapsed >= 3 || rec.currentEnergy >= 120) {
          rec.currentStage = 'amplification';
        } else if (rec.turnsElapsed >= 1 || rec.currentEnergy >= 40) {
          rec.currentStage = 'ripple';
        }
      }

      reports.push({
        seedEventId: id,
        currentStage: rec.currentStage,
        currentEnergy: rec.currentEnergy,
        turnsElapsed: rec.turnsElapsed,
        settled: rec.settled
      });
    }

    return {
      ok: true,
      steps: steps,
      activeCount: _cascadeRegistry.size,
      reports: reports
    };
  }

  function getCascadeState(seedEventId) {
    if (!seedEventId || !_cascadeRegistry.has(seedEventId)) {
      return null;
    }
    const rec = _cascadeRegistry.get(seedEventId);
    return Object.assign({}, rec, {
      currentMagnitude: rec.currentEnergy,
      ok: true
    });
  }

  function listActiveCascades() {
    const res = [];
    for (const [id, rec] of _cascadeRegistry.entries()) {
      res.push({
        seedEventId: id,
        stage: rec.currentStage,
        energy: rec.currentEnergy,
        settled: rec.settled
      });
    }
    return res;
  }

  function resetAll() {
    _cascadeRegistry.clear();
    return { ok: true, cleared: true };
  }

  function diagnose() {
    return {
      ok: true,
      version: VERSION,
      totalCascades: _cascadeRegistry.size,
      cascades: listActiveCascades()
    };
  }

  const api = {
    VERSION: VERSION,
    triggerFlutter: triggerFlutter,
    advanceTurn: advanceTurn,
    advanceEpoch: advanceTurn,
    getCascadeState: getCascadeState,
    getCascadeStatus: getCascadeState,
    listActiveCascades: listActiveCascades,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.engines.butterflyCascade = api;
  WA.butterflyCascade = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();