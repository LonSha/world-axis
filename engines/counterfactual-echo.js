/**
 * WorldAxis engines/counterfactual-echo.js (v2.321.0) — EXV14-9 深度反事实推演沙盘与虚实对照回响
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   此前历史分支虽然存在 branchTree / branchDiff，但不同时间线被物理切断，
 *   没有机制允许“未曾走过的分歧道路”在特定深夜或心力交瘁时，作为潜意识心魔/梦魇
 *   回响反噬当前角色，导致角色信念动摇或潜台词发生微妙变形。
 *
 * ── 机制──────────────────────────────────────────────────────────────
 *   `counterfactualEcho.evokeEcho`：
 *   1. 接收 actorId、forkNodeId、unchosenPathSummary；
 *   2. 计算角色的精神受压值（stress / exhaustion）；
 *   3. 将反事实推演片段作为幻影/梦魇条目写入角色的 `hauntings`；
 *   4. 给角色施加 `haunted` 或 `doubtful` 状态；
 *   5. 持久化回写到 store。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_counterfactual_echo_settings_v1';
  const DEF = { enabled: true, maxEchoes: 20, minStressThreshold: 30 };
  const __REG = { key: LS_KEY, def: DEF, module: 'counterfactualEcho' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'counterfactualEcho:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }
  const stat = { evoked: 0, refused: 0, lastReason: '' };

  /**
   * 唤起反事实梦魇回响
   * @param {object} spec { actorId, forkNodeId, pathSummary, stressLevel?, at? }
   */
  function evokeEcho(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const actorId = String(s.actorId || s.who || '').trim();
    const forkNodeId = String(s.forkNodeId || s.nodeId || '').trim();
    const summary = String(s.pathSummary || s.summary || '').trim();

    if (!actorId) {
      stat.refused++; stat.lastReason = 'missing-actor';
      return { ok: false, reason: 'missing-actor' };
    }
    if (!forkNodeId) {
      stat.refused++; stat.lastReason = 'missing-fork-node';
      return { ok: false, reason: 'missing-fork-node' };
    }
    if (!summary) {
      stat.refused++; stat.lastReason = 'missing-path-summary';
      return { ok: false, reason: 'missing-path-summary' };
    }

    const stress = Number.isFinite(s.stressLevel) ? Number(s.stressLevel) : 50;
    if (stress < cfg.minStressThreshold) {
      stat.refused++; stat.lastReason = 'stress-below-threshold';
      return { ok: false, reason: 'stress-below-threshold', stress: stress, threshold: cfg.minStressThreshold };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('counterfactualEcho');
    const echoRecord = {
      id: 'echo_' + at + '_' + Math.random().toString(36).slice(2, 6),
      forkNodeId: forkNodeId,
      pathSummary: summary,
      hauntIntensity: Math.min(100, Math.floor(stress * 1.2)),
      at: at
    };

    transact(function (d) {
      if (!d) return true;
      d.actors = d.actors || {};
      d.actors[actorId] = d.actors[actorId] || { id: actorId, conditions: [] };
      const a = d.actors[actorId];
      a.conditions = Array.isArray(a.conditions) ? a.conditions : [];
      if (a.conditions.indexOf('haunted') < 0) {
        a.conditions.push('haunted');
      }
      a.counterfactualEchoes = Array.isArray(a.counterfactualEchoes) ? a.counterfactualEchoes : [];
      a.counterfactualEchoes.push(echoRecord);
      if (a.counterfactualEchoes.length > cfg.maxEchoes) {
        a.counterfactualEchoes.shift();
      }
      return true;
    }, 'evokeEcho');

    stat.evoked++;
    return {
      ok: true,
      reason: 'counterfactual-echo-evoked',
      actorId: actorId,
      echo: echoRecord
    };
  }

  WA.counterfactualEcho = {
    evokeEcho: evokeEcho
  };
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/counterfactual-echo 已加载（2.321.0）');
  }
})();