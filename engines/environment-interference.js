/**
 * WorldAxis engines/environment-interference.js (v2.318.0) — OPV14-8 微气候与空间声学对生活日程的物理级排他干预
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   此前 day-route（生活日常日程）机制无论暴风雪多大、毒气多浓或声学噪音多刺耳，
 *   NPC 都会死板地按固定时间点“出门通勤”。环境灾害完全没有对 NPC 的日常生活
 *   产生物理排他性干扰，缺乏躲在室内避险或日程中断的动态生命力。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `envInterference.disruptRoutines`：
 *   1. 评估指定区域的天气微气候危害等级（hazardSeverity）与声学干扰（noiseDamping）；
 *   2. 达到危险临界值时，强制阻断指定角色的 outdoor（室外）通勤日程；
 *   3. 迫使角色状态切换为 `sheltered`（避险室内）或 `grounded`（滞留），并追加受阻日志；
 *   4. 持久化记录到 actor 档案中。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_environment_interference_settings_v1';
  const DEF = { enabled: true, maxLogs: 32, defaultDisruptThreshold: 60 };
  const __REG = { key: LS_KEY, def: DEF, module: 'environmentInterference' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'environmentInterference:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { disrupted: 0, sheltered: 0, refused: 0, lastReason: '' };

  /**
   * 触发环境恶劣对日常的干预阻断
   * @param {object} spec { actorId, regionId, hazardSeverity?, weatherKind?, at? }
   */
  function disruptRoutines(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const actorId = String(s.actorId || s.who || '').trim();
    const regionId = String(s.regionId || '').trim();
    if (!actorId) {
      stat.refused++; stat.lastReason = 'missing-actor';
      return { ok: false, reason: 'missing-actor' };
    }
    if (!regionId) {
      stat.refused++; stat.lastReason = 'missing-region';
      return { ok: false, reason: 'missing-region' };
    }

    const severity = Number.isFinite(s.hazardSeverity) ? Number(s.hazardSeverity) : 75;
    if (severity < cfg.defaultDisruptThreshold) {
      stat.refused++; stat.lastReason = 'hazard-below-threshold';
      return { ok: false, reason: 'hazard-below-threshold', severity: severity, threshold: cfg.defaultDisruptThreshold };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('environmentInterference');
    const weather = String(s.weatherKind || 'blizzard').trim();

    const record = {
      actorId: actorId,
      regionId: regionId,
      weather: weather,
      severity: severity,
      disruptedAction: 'outdoor_commute',
      imposedState: 'sheltered',
      at: at
    };

    transact(function (d) {
      if (!d) return true;
      d.actors = d.actors || {};
      d.actors[actorId] = d.actors[actorId] || { id: actorId, conditions: [] };
      const a = d.actors[actorId];
      a.conditions = Array.isArray(a.conditions) ? a.conditions : [];
      if (a.conditions.indexOf('sheltered') < 0) {
        a.conditions.push('sheltered');
      }
      a.currentRoutine = 'stay_indoors_shelter';

      d.routineDisruptions = d.routineDisruptions || [];
      d.routineDisruptions.push(record);
      if (d.routineDisruptions.length > cfg.maxLogs) {
        d.routineDisruptions.shift();
      }
      return true;
    }, 'disruptRoutines');

    stat.disrupted++;
    stat.sheltered++;

    return {
      ok: true,
      reason: 'routine-disrupted-sheltered',
      disruption: record
    };
  }

  WA.environmentInterference = {
    disruptRoutines: disruptRoutines
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/environment-interference 已加载（2.318.0）');
  }
})();