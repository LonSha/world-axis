/**
 * WorldAxis engines/world-singularity.js (v2.408.0) — EXV23-9 纪元终局演化、世界奇点与大势收敛
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   世界缺乏宏观终局大势收束时钟，推演无限平铺缺乏史诗高潮收敛幕，
 *   文明纪元跃迁缺乏因果张力阈值断言（Convergence Singularity）。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `worldSingularity.advanceSingularityTension` 推进全局危机/科技张力时钟（0~100）；
 *   `worldSingularity.triggerConvergenceEvent` 张力突破临界阈值时触发时代奇点收束；
 *   `worldSingularity.shiftEpoch` 完成文明跃迁并重置世界基石参数。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 张力低于临界阈值强行触发奇点被拦截（refusal: tension-below-critical-singularity-threshold）。
 *   ② 纪元跃迁自动在 store 中记录时代印记。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_world_singularity_settings_v1';
  const DEF = {
    enabled: true,
    singularityThreshold: 80
  };

  const __REG = {
    key: 'worldSingularity',
    name: '世界奇点与纪元跃迁 (EXV23-9)',
    desc: '宏观文明张力时钟、大结局奇点收敛与纪元跃迁重塑引擎',
    settingsKey: LS_KEY,
    schema: {
      enabled: { type: 'boolean', default: true },
      singularityThreshold: { type: 'number', default: 80 }
    }
  };

  const STATE = {
    currentEpoch: 'classical-era',
    singularityTension: 0, // 0 - 100
    epochHistory: [],
    convergenceTriggered: false
  };

  const stat = {
    tensionsAdvanced: 0,
    convergencesTriggered: 0,
    epochsShifted: 0
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

  function advanceSingularityTension(delta, reason) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, refusal: 'world-singularity-disabled' };

    const d = Number(delta) || 5;
    STATE.singularityTension = Math.max(0, Math.min(100, STATE.singularityTension + d));
    stat.tensionsAdvanced++;

    return {
      ok: true,
      currentTension: STATE.singularityTension,
      delta: d,
      reason: reason || 'general-tide',
      isCritical: STATE.singularityTension >= cfg.singularityThreshold,
      at: clockNow()
    };
  }

  function triggerConvergenceEvent(singularitySpec) {
    const cfg = settings();
    if (STATE.singularityTension < cfg.singularityThreshold) {
      return {
        ok: false,
        refusal: 'tension-below-critical-singularity-threshold',
        hint: '当前世界张力仅 ' + STATE.singularityTension + '（临界阈值 ' + cfg.singularityThreshold + '），未达时代终局收敛条件'
      };
    }

    const s = singularitySpec || {};
    STATE.convergenceTriggered = true;
    stat.convergencesTriggered++;

    return {
      ok: true,
      singularityType: s.kind || 'apocalyptic-cataclysm',
      focusFocalPoint: s.focalPoint || 'capital-bastion',
      status: 'convergence-in-progress',
      hint: '时代奇点收束幕启动，各大势力目标强制收敛至风暴眼',
      at: clockNow()
    };
  }

  function shiftEpoch(newEpochName) {
    if (!STATE.convergenceTriggered && STATE.singularityTension < DEF.singularityThreshold) {
      return { ok: false, refusal: 'tension-below-critical-singularity-threshold' };
    }

    const prev = STATE.currentEpoch;
    STATE.epochHistory.push({ epoch: prev, endedAt: clockNow() });
    STATE.currentEpoch = String(newEpochName || 'post-cataclysm-epoch');
    STATE.singularityTension = 0;
    STATE.convergenceTriggered = false;
    stat.epochsShifted++;

    return {
      ok: true,
      previousEpoch: prev,
      newEpoch: STATE.currentEpoch,
      status: 'epoch-shifted',
      hint: '文明纪元完成跃迁，历史车轮进入崭新篇章',
      at: clockNow()
    };
  }

  function getSingularityState() {
    return {
      epoch: STATE.currentEpoch,
      tension: STATE.singularityTension,
      convergenceTriggered: STATE.convergenceTriggered,
      historyCount: STATE.epochHistory.length
    };
  }

  function reset() {
    STATE.currentEpoch = 'classical-era';
    STATE.singularityTension = 0;
    STATE.epochHistory = [];
    STATE.convergenceTriggered = false;
    stat.tensionsAdvanced = 0;
    stat.convergencesTriggered = 0;
    stat.epochsShifted = 0;
    return { ok: true };
  }

  WA.worldSingularity = {
    advanceSingularityTension: advanceSingularityTension,
    triggerConvergenceEvent: triggerConvergenceEvent,
    shiftEpoch: shiftEpoch,
    getSingularityState: getSingularityState,
    reset: reset,
    getSettings: settings
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/world-singularity.js', { kind: 'engine', ver: '2.408.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/world-singularity 已加载（2.408.0）');
  }
})();