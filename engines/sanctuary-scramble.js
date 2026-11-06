/**
 * WorldAxis engines/sanctuary-scramble.js (v2.319.0) — EXV14-8 空间坍缩避险与有限庇护所生存竞争
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   此前庇护所（shelter/sanctuary）容纳人数永远假定为“无限”。
 *   当灾难发生时，所有 NPC 都能轻松躲入，缺乏名额有限时的人性博弈、
 *   争抢名额、暴力驱逐或自我牺牲让渡名额的戏剧张力。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `sanctuary.scramble`：
 *   1. 庇护所声明有限空位（capacity）；
 *   2. 角色进入求生争夺（scramble），当人数超载时依据力量/求生意志进行排挤；
 *   3. 争夺成功者获得入内避险许可（admitted: true），失败者被关在门外（locked-out）；
 *   4. 持久化记录到 sanctuaryOccupants 档案中。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_sanctuary_scramble_settings_v1';
  const DEF = { enabled: true, maxSanctuaries: 16, defaultCapacity: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'sanctuaryScramble' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'sanctuaryScramble:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { scrambled: 0, admitted: 0, lockedOut: 0, refused: 0, lastReason: '' };

  /**
   * 避险争夺
   * @param {object} spec { sanctuaryId, candidateActorId?, actorId?, applicants?: Array, capacity?, at? }
   */
  function scramble(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const sanctuaryId = String(s.sanctuaryId || '').trim();
    if (!sanctuaryId) {
      stat.refused++; stat.lastReason = 'missing-sanctuary-id';
      return { ok: false, reason: 'missing-sanctuary-id' };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('sanctuaryScramble');
    const cap = Number.isFinite(s.capacity) ? Number(s.capacity) : cfg.defaultCapacity;

    // 多申请者批量仲裁模式
    if (Array.isArray(s.applicants)) {
      if (!s.applicants.length) {
        stat.refused++; stat.lastReason = 'empty-applicants';
        return { ok: false, reason: 'empty-applicants' };
      }
      const willingSacrifices = [];
      const contenders = [];
      s.applicants.forEach(function (app) {
        const aId = String(app.actorId || app.id || app.who || '').trim();
        if (!aId) return;
        if (app.sacrifice === true) willingSacrifices.push(Object.assign({}, app, { actorId: aId }));
        else contenders.push(Object.assign({}, app, { actorId: aId }));
      });
      contenders.sort(function (a, b) {
        const pDiff = (Number(b.priority) || 0) - (Number(a.priority) || 0);
        if (pDiff !== 0) return pDiff;
        return (Number(b.strength) || 0) - (Number(a.strength) || 0);
      });
      const admitted = contenders.slice(0, cap);
      const expelled = contenders.slice(cap).concat(willingSacrifices);

      transact(function (d) {
        if (!d) return true;
        d.sanctuaries = d.sanctuaries || {};
        d.sanctuaries[sanctuaryId] = d.sanctuaries[sanctuaryId] || { id: sanctuaryId, occupants: [] };
        d.sanctuaries[sanctuaryId].occupants = admitted.map(function (x) { return x.actorId; });
        d.actors = d.actors || {};
        admitted.forEach(function (adm) {
          d.actors[adm.actorId] = d.actors[adm.actorId] || { id: adm.actorId, conditions: [] };
          const a = d.actors[adm.actorId];
          a.conditions = Array.isArray(a.conditions) ? a.conditions : [];
          if (a.conditions.indexOf('sheltered') < 0) a.conditions.push('sheltered');
        });
        willingSacrifices.forEach(function (sac) {
          d.actors[sac.actorId] = d.actors[sac.actorId] || { id: sac.actorId, conditions: [] };
          const a = d.actors[sac.actorId];
          a.conditions = Array.isArray(a.conditions) ? a.conditions : [];
          if (a.conditions.indexOf('heroic_sacrifice') < 0) a.conditions.push('heroic_sacrifice');
        });
        expelled.forEach(function (exp) {
          d.actors[exp.actorId] = d.actors[exp.actorId] || { id: exp.actorId, conditions: [] };
          const a = d.actors[exp.actorId];
          a.conditions = Array.isArray(a.conditions) ? a.conditions : [];
          if (a.conditions.indexOf('stranded') < 0) a.conditions.push('stranded');
        });
        return true;
      }, 'scramble:batch');

      stat.scrambled++;
      stat.admitted += admitted.length;
      return {
        ok: true,
        reason: 'scramble-completed',
        sanctuaryId: sanctuaryId,
        capacity: cap,
        admitted: admitted.map(function (x) { return x.actorId; }),
        expelled: expelled.map(function (x) { return x.actorId; }),
        sacrifices: willingSacrifices.map(function (x) { return x.actorId; })
      };
    }

    // 单角色角逐模式
    const candidateActorId = String(s.candidateActorId || s.actorId || '').trim();
    if (!candidateActorId) {
      stat.refused++; stat.lastReason = 'missing-candidate-actor';
      return { ok: false, reason: 'missing-candidate-actor' };
    }
    let admitted = false;
    let currentOccupantsCount = 0;
    transact(function (d) {
      if (!d) return true;
      d.sanctuaryOccupants = d.sanctuaryOccupants || {};
      d.sanctuaryOccupants[sanctuaryId] = Array.isArray(d.sanctuaryOccupants[sanctuaryId])
        ? d.sanctuaryOccupants[sanctuaryId] : [];
      const occ = d.sanctuaryOccupants[sanctuaryId];
      if (occ.indexOf(candidateActorId) >= 0) {
        admitted = true;
        currentOccupantsCount = occ.length;
        return true;
      }

      if (occ.length < cap) {
        occ.push(candidateActorId);
        admitted = true;
      } else {
        admitted = false;
      }
      currentOccupantsCount = occ.length;
      d.actors = d.actors || {};
      d.actors[candidateActorId] = d.actors[candidateActorId] || { id: candidateActorId, conditions: [] };
      const a = d.actors[candidateActorId];
      a.conditions = Array.isArray(a.conditions) ? a.conditions : [];
      if (admitted) {
        if (a.conditions.indexOf('safe-haven') < 0) a.conditions.push('safe-haven');
      } else {
        if (a.conditions.indexOf('exposed-hazard') < 0) a.conditions.push('exposed-hazard');
      }
      return true;
    }, 'scramble');

    stat.scrambled++;
    if (admitted) stat.admitted++;
    else stat.lockedOut++;
    return {
      ok: true,
      admitted: admitted,
      reason: admitted ? 'scramble-admitted' : 'sanctuary-full-locked-out',
      sanctuaryId: sanctuaryId,
      candidateActorId: candidateActorId,
      capacity: cap,
      occupantsCount: currentOccupantsCount
    };
  }

  WA.sanctuaryScramble = {
    scramble: scramble
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/sanctuary-scramble 已加载（2.319.0）');
  }
})();