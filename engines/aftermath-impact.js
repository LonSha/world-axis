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

  /**
   * 生产/施工安全事故：设施损坏、物资损毁、人身伤害与责任判定（OPV3-7）
   */
  function triggerIncident(spec) {
    var s = spec || {};
    var placeId = clean(s.placeId, 60);
    var facilityId = clean(s.facilityId, 60);
    var incidentType = clean(s.incidentType, 40) || 'industrial_failure';
    var operator = clean(s.operator, 40);
    var supervisor = clean(s.supervisor, 40);
    var forcedUnderDegraded = !!s.forcedUnderDegraded;
    var damageScale = clean(s.damageScale, 20) || 'severe';
    var note = clean(s.note, 120);

    var nowMs = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now() : Date.now();
    var incId = clean(s.id, 60) || ('inc_' + nowMs + '_' + (WA.rand ? WA.rand.id() : Math.random().toString(36).slice(2, 6)));

    // 责任判定：若设施处于带病运行仍强令开工，决策主管负主责；否则操作员负主责
    var faultParty = (forcedUnderDegraded && supervisor) ? supervisor : (operator || supervisor || 'unknown');
    var faultDegree = forcedUnderDegraded ? 'reckless_command' : 'operational_mishap';

    var destroyedMaterials = Object.assign({}, s.materials || {});
    var injuredPerson = clean(s.injuredPerson, 40);
    var energyCost = Math.max(10, Number(s.energyCost) || 30);

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.aftermathImpact = d.aftermathImpact || { incidents: [], redressLog: [] };
        // 设施停摆
        if (facilityId && d.serviceNetwork && Array.isArray(d.serviceNetwork.facilities)) {
          var fac = d.serviceNetwork.facilities.filter(function (x) { return x && x.id === facilityId; })[0];
          if (fac) {
            fac.status = 'inoperable';
            fac.breakdownReason = note || '发生严重生产责任事故，断轴损坏';
          }
        }
        // 扣除人员精力并标记受伤
        if (injuredPerson && d.people && d.people['p_' + injuredPerson]) {
          var p = d.people['p_' + injuredPerson];
          p.status = 'injured';
          p.energy = Math.max(0, (p.energy != null ? p.energy : 100) - energyCost);
        }
        // 记录责任事故
        var entry = {
          id: incId,
          placeId: placeId,
          facilityId: facilityId,
          incidentType: incidentType,
          faultParty: faultParty,
          faultDegree: faultDegree,
          operator: operator,
          supervisor: supervisor,
          injuredPerson: injuredPerson,
          destroyedMaterials: destroyedMaterials,
          status: 'unsettled',
          note: note,
          createdAt: nowMs
        };
        d.aftermathImpact.incidents.push(entry);
        return true;
      }, 'aftermathImpact:triggerIncident');
    }

    // 连线 pathEcho 注入遗憾与责任污点
    if (WA.pathEcho && typeof WA.pathEcho.recordExpectation === 'function' && faultParty) {
      try {
        WA.pathEcho.recordExpectation(faultParty, 'incident_' + incId, '生产安全运转', {
          failed: true,
          faultDegree: faultDegree,
          incidentId: incId
        });
      } catch (e) {}
    }

    return {
      ok: true,
      incidentId: incId,
      placeId: placeId,
      facilityId: facilityId,
      faultParty: faultParty,
      faultDegree: faultDegree,
      status: 'unsettled',
      facilityState: 'inoperable',
      injuredPerson: injuredPerson,
      destroyedMaterials: destroyedMaterials,
      note: '严重生产事故已立案，设施已彻底停摆，责任人留痕'
    };
  }

  /**
   * 代偿追索与责任赔付结算
   */
  function settleRedress(incidentId, opts) {
    var iId = clean(incidentId, 60);
    var o = opts || {};
    var payer = clean(o.payer, 40);
    var compensation = Object.assign({}, o.compensation || {});
    var note = clean(o.note, 120);
    var nowMs = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now() : Date.now();

    if (!iId) return { ok: false, reason: 'missing-incident-id' };
    if (!compensation || Object.keys(compensation).length === 0) {
      return { ok: false, reason: 'missing-compensation', note: '和解代偿必须付出真金白银或物资，严禁空口免责' };
    }

    var settled = false;
    var target = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.aftermathImpact = d.aftermathImpact || { incidents: [], redressLog: [] };
        var hit = (d.aftermathImpact.incidents || []).filter(function (x) { return x && x.id === iId; })[0];
        if (!hit) return false;
        if (hit.status === 'redressed') {
          settled = true;
          target = hit;
          return false;
        }
        var actualPayer = payer || hit.faultParty;
        // 从责任人私囊中真实扣减物料/资金
        if (actualPayer && d.people && d.people['p_' + actualPayer]) {
          var pRes = d.people['p_' + actualPayer].resources = d.people['p_' + actualPayer].resources || {};
          Object.keys(compensation).forEach(function (mat) {
            var cost = Number(compensation[mat]) || 0;
            pRes[mat] = Math.max(0, (pRes[mat] || 0) - cost);
          });
        }
        hit.status = 'redressed';
        hit.redressedAt = nowMs;
        hit.settledBy = actualPayer;
        hit.compensation = compensation;
        d.aftermathImpact.redressLog.push({
          incidentId: iId,
          payer: actualPayer,
          compensation: compensation,
          note: note,
          at: nowMs
        });
        target = hit;
        return true;
      }, 'aftermathImpact:settleRedress');
    }

    if (!target) return { ok: false, reason: 'incident-not-found' };
    if (settled) return { ok: false, reason: 'already-redressed', incidentId: iId };

    return {
      ok: true,
      incidentId: iId,
      status: 'redressed',
      payer: payer || target.faultParty,
      compensationPaid: compensation,
      originalFaultRetained: true,
      note: '生产事故代偿责任已结清，历史事故案卷永久留痕'
    };
  }

  function listIncidents(opts) {
    var o = opts || {};
    var place = clean(o.place, 60);
    var faultParty = clean(o.faultParty, 40);
    var st = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : {};
    var incs = ((st.aftermathImpact || {}).incidents) || [];
    return incs.filter(function (x) {
      if (!x) return false;
      if (place && x.placeId !== place) return false;
      if (faultParty && x.faultParty !== faultParty) return false;
      if (o.status && x.status !== o.status) return false;
      return true;
    });
  }

  WA.aftermathImpact = {
    inspectImpact: inspectImpact,
    findDetour: findDetour,
    commissionRepair: commissionRepair,
    triggerIncident: triggerIncident,
    settleRedress: settleRedress,
    listIncidents: listIncidents
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/aftermath-impact 已加载（2.231.0）');
  }
})();