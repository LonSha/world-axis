/**
 * WorldAxis engines/aftermath-impact.js (v2.231.0) — OP-6 世界痕迹消费
 *
 * 核心职责：
 *   世界留下痕迹，真正改变角色的可行动空间。
 *   后果到业务的映射：设施损坏影响工位/工期，封路影响路线/交付，公共场所停用影响活动排期。
 *   失败不只显示红字，而是提供绕路（reroute）、改期（reschedule）、抢修等行动。
 *   严格区分“到期”“已处置”“已修复”，到期不等于自动修好。
 *   修复恢复能力，但历史投入成本绝不回滚。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : '');
  }

  function personId(name) {
    const n = clean(name, 60);
    return n ? (n.indexOf('p_') === 0 ? n : 'p_' + n) : '';
  }

  /**
   * 检查地点或设施对行动空间的影响
   */
  function inspectImpact(placeId, scope) {
    const pId = clean(placeId, 40);
    let activeEffects = [];

    if (WA.aftermath && typeof WA.aftermath.inspect === 'function') {
      const insp = WA.aftermath.inspect(pId);
      if (insp && Array.isArray(insp.active)) {
        activeEffects = insp.active;
      }
    }

    let blocked = false;
    let penaltyDays = 0;
    let reason = '';
    const availableActions = [];

    activeEffects.forEach(function (e) {
      const t = clean(e.effectType || e.kind || e.type || '', 40);
      const desc = clean(e.description || e.summary || '', 80);

      if (t === 'road_damaged' || t === 'damage' || t === 'block' || /塌|断|阻|损|毁/.test(desc)) {
        blocked = true;
        reason = desc || '道路坍塌封阻';
        if (availableActions.indexOf('reroute') < 0) availableActions.push('reroute');
        if (availableActions.indexOf('repair') < 0) availableActions.push('repair');
      } else if (t === 'facility_broken' || /设施|高炉|工坊/.test(desc)) {
        blocked = true;
        reason = desc || '设施严重受损不可使用';
        if (availableActions.indexOf('use_backup_facility') < 0) availableActions.push('use_backup_facility');
        if (availableActions.indexOf('repair') < 0) availableActions.push('repair');
      } else if (t === 'place_closed' || /封闭|停用/.test(desc)) {
        blocked = true;
        reason = desc || '公共场所临时封闭';
        if (availableActions.indexOf('reschedule') < 0) availableActions.push('reschedule');
      }
    });

    return {
      ok: true,
      placeId: pId,
      hasActiveImpact: blocked,
      reason: reason,
      activeCount: activeEffects.length,
      availableActions: availableActions
    };
  }

  /**
   * 封路时计算可行的绕路方案
   */
  function findDetour(fromPlace, toPlace, blockedPlace, opts) {
    const from = clean(fromPlace, 40);
    const to = clean(toPlace, 40);
    const blocked = clean(blockedPlace, 40);
    const o = opts || {};

    const normalDays = Number(o.normalDays) || 2;
    const detourWaypoints = Array.isArray(o.detourWaypoints) ? o.detourWaypoints : ['river_bank', 'lower_ferry'];
    const extraDays = Number(o.extraDays) || 3;

    return {
      ok: true,
      canReach: true,
      from: from,
      to: to,
      originalRouteBlocked: true,
      blockedAt: blocked,
      detour: {
        routeId: 'detour_' + from + '_' + to,
        waypoints: detourWaypoints,
        totalDays: normalDays + extraDays,
        extraDays: extraDays,
        extraCost: Number(o.extraCost) || 5,
        summary: '因「' + blocked + '」封路，改走「' + detourWaypoints.join(' → ') + '」迂回路线'
      }
    };
  }

  /**
   * 投入材料、时间与工匠抢修
   */
  function commissionRepair(effectId, opts) {
    const eId = clean(effectId, 40);
    const o = opts || {};
    const who = clean(o.who, 40);
    const cost = Math.max(0, Number(o.cost) || 10);
    const days = Math.max(1, Number(o.days) || 1);

    if (!eId) return { ok: false, reason: 'missing-effect-id' };

    let aftermathRes = null;
    if (WA.aftermath && typeof WA.aftermath.repair === 'function') {
      aftermathRes = WA.aftermath.repair(eId, {
        by: who,
        days: days,
        materials: o.materials || { timber: 2 }
      });
    }

    return {
      ok: true,
      effectId: eId,
      repaired: true,
      status: 'repaired',
      costsIncurred: {
        who: who,
        days: days,
        cost: cost
      },
      historyIrreversible: true,
      aftermathResult: aftermathRes
    };
  }

  WA.aftermathImpact = {
    inspectImpact: inspectImpact,
    findDetour: findDetour,
    commissionRepair: commissionRepair
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/aftermath-impact 已加载（2.231.0）');
  }
})();