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

  function triggerCascadingChain(spec) {
    var s = spec || {};
    var sourceId = clean(s.sourceIncidentId || s.sourceEventId || 'inc_root', 60);
    var sourcePlace = clean(s.sourcePlaceId || s.originPlace, 40);
    var shockType = clean(s.shockType || 'supply_break', 40);
    var initialSeverity = Math.min(1.0, Math.max(0.1, Number(s.severity) || 0.8));
    var rawNodes = Array.isArray(s.nodes) ? s.nodes : [];
    if (!sourcePlace || rawNodes.length === 0) {
      return { ok: false, reason: 'missing-source-or-nodes' };
    }
    var maxHops = Math.min(5, Math.max(1, Number(s.maxHops) || 3));
    var attenuation = Math.min(0.9, Math.max(0.2, Number(s.attenuation) || 0.6));
    var nowVal = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now() : Date.now();
    var chainId = 'chn_' + nowVal + '_' + ((WA.rand && WA.rand.id) ? WA.rand.id() : Math.random().toString(36).slice(2, 7));

    var validatedNodes = [];
    var currentSev = initialSeverity;
    for (var i = 0; i < rawNodes.length && i < maxHops; i++) {
      var n = rawNodes[i];
      var pId = clean(n.placeId, 40);
      if (!pId) continue;
      var delay = Math.max(1, Number(n.delayDays) || (i + 1));
      var buf = Math.max(0, Number(n.capacityBuffer) || 0);
      var effectiveSev = Number(Math.max(0.05, currentSev - (buf > 0 ? 0.15 : 0)).toFixed(2));
      validatedNodes.push({
        index: i,
        placeId: pId,
        impactType: clean(n.impactType || shockType, 40),
        delayDays: delay,
        remainingDays: delay,
        capacityBuffer: buf,
        severity: effectiveSev,
        status: (i === 0) ? 'pending' : 'queued',
        intervened: false
      });
      currentSev = currentSev * attenuation;
    }

    var chainRecord = {
      id: chainId,
      sourceIncidentId: sourceId,
      sourcePlaceId: sourcePlace,
      shockType: shockType,
      initialSeverity: initialSeverity,
      nodes: validatedNodes,
      currentNodeIndex: 0,
      status: 'active',
      createdAt: nowVal,
      history: [{ action: 'triggered', at: nowVal, note: '重大事件触发有限跨节点影响链' }]
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.aftermathImpact = d.aftermathImpact || {};
        d.aftermathImpact.cascadingChains = d.aftermathImpact.cascadingChains || [];
        d.aftermathImpact.cascadingChains.push(chainRecord);
        return true;
      }, 'aftermathImpact:triggerCascadingChain');
    }

    return {
      ok: true,
      chain: chainRecord,
      nodeCount: validatedNodes.length,
      note: '连锁冲击链已生成，受容量衰减与传播延迟硬约束'
    };
  }

  function interveneCascadingChain(chainId, nodeIndex, actionSpec) {
    var cId = clean(chainId, 60);
    var idx = Number(nodeIndex);
    var act = actionSpec || {};
    var actionType = clean(act.action || 'emergency_supply', 40);
    var actor = clean(act.actor || 'town_magistrate', 40);
    var funds = Math.max(0, Number(act.funds) || 0);
    var materials = (act.materials && typeof act.materials === 'object') ? Object.assign({}, act.materials) : {};
    var nowVal = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now() : Date.now();

    var targetChain = null;
    var targetNode = null;
    var failReason = '';

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.aftermathImpact = d.aftermathImpact || {};
        var list = d.aftermathImpact.cascadingChains || [];
        var hit = list.filter(function (c) { return c && c.id === cId; })[0];
        if (!hit) { failReason = 'chain-not-found'; return false; }
        if (hit.status !== 'active') { failReason = 'chain-not-active'; return false; }
        var node = hit.nodes && hit.nodes[idx];
        if (!node) { failReason = 'node-not-found'; return false; }
        if (node.status === 'resolved' || node.intervened) { failReason = 'already-intervened'; return false; }

        if (funds > 0) {
          if (!d.economy || !d.economy.money || (d.economy.money.funds || 0) < funds) {
            failReason = 'insufficient-funds';
            return false;
          }
          d.economy.money.funds -= funds;
        }

        node.intervened = true;
        node.intervenedBy = actor;
        node.interventionAction = actionType;
        node.interventionFunds = funds;
        node.interventionMaterials = materials;

        if (actionType === 'containment') {
          node.status = 'contained';
          hit.status = 'contained';
          for (var k = idx + 1; k < hit.nodes.length; k++) {
            hit.nodes[k].status = 'prevented';
          }
          hit.history.push({
            action: 'contained',
            at: nowVal,
            nodeIndex: idx,
            actor: actor,
            note: '在中继节点下达行政隔离，阻断后续节点蔓延'
          });
        } else if (actionType === 'emergency_supply') {
          node.severity = 0;
          node.status = 'mitigated';
          hit.history.push({
            action: 'mitigated',
            at: nowVal,
            nodeIndex: idx,
            actor: actor,
            fundsPaid: funds,
            note: '动用应急储备物资平抑中继节点冲击'
          });
        } else if (actionType === 'reroute_provider') {
          node.severity = Number((node.severity * 0.4).toFixed(2));
          node.status = 'rerouted';
          hit.history.push({
            action: 'rerouted',
            at: nowVal,
            nodeIndex: idx,
            actor: actor,
            note: '开辟备用物流路线分流'
          });
        }

        if (WA.pathEcho && typeof WA.pathEcho.record === 'function') {
          WA.pathEcho.record('intervene_shock', {
            actor: actor,
            placeId: node.placeId,
            action: actionType,
            costFunds: funds
          });
        }

        targetChain = hit;
        targetNode = node;
        return true;
      }, 'aftermathImpact:interveneCascadingChain');
    }

    if (!targetChain) return { ok: false, reason: failReason || 'failed' };
    return {
      ok: true,
      chainId: cId,
      nodeIndex: idx,
      placeId: targetNode.placeId,
      action: actionType,
      nodeStatus: targetNode.status,
      chainStatus: targetChain.status,
      fundsSpent: funds,
      note: '中继介入已生效，真实资财已扣减并阻止/平抑进一步扩散'
    };
  }

  function advanceCascadingChains(days) {
    var stepDays = Math.max(1, Number(days) || 1);
    var resolvedEvents = [];

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.aftermathImpact = d.aftermathImpact || {};
        var list = d.aftermathImpact.cascadingChains || [];
        list.forEach(function (chain) {
          if (!chain || chain.status !== 'active') return;
          var curIdx = chain.currentNodeIndex;
          var node = chain.nodes && chain.nodes[curIdx];
          if (!node) { chain.status = 'resolved'; return; }

          node.remainingDays -= stepDays;
          if (node.remainingDays <= 0) {
            if (!node.intervened) {
              node.status = 'impact_realized';
              resolvedEvents.push({
                chainId: chain.id,
                nodeIndex: curIdx,
                placeId: node.placeId,
                impactType: node.impactType,
                severity: node.severity
              });
              var nextIdx = curIdx + 1;
              if (nextIdx < chain.nodes.length) {
                chain.currentNodeIndex = nextIdx;
                chain.nodes[nextIdx].status = 'pending';
              } else {
                chain.status = 'exhausted';
              }
            } else {
              if (node.status === 'contained') {
                chain.status = 'contained';
              } else {
                var nextIdx = curIdx + 1;
                if (nextIdx < chain.nodes.length) {
                  chain.currentNodeIndex = nextIdx;
                  chain.nodes[nextIdx].status = 'pending';
                } else {
                  chain.status = 'resolved';
                }
              }
            }
          }
        });
        return true;
      }, 'aftermathImpact:advanceCascadingChains');
    }

    return {
      ok: true,
      daysAdvanced: stepDays,
      realizedEvents: resolvedEvents
    };
  }

  function listCascadingChains(opts) {
    var o = opts || {};
    var place = clean(o.place, 40);
    var status = clean(o.status, 20);
    var st = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : {};
    var list = ((st.aftermathImpact || {}).cascadingChains) || [];
    return list.filter(function (c) {
      if (!c) return false;
      if (status && c.status !== status) return false;
      if (place) {
        var matchSource = (c.sourcePlaceId === place);
        var matchNode = (c.nodes || []).some(function (n) { return n && n.placeId === place; });
        if (!matchSource && !matchNode) return false;
      }
      return true;
    });
  }

  WA.aftermathImpact = {
    inspectImpact: inspectImpact,
    findDetour: findDetour,
    commissionRepair: commissionRepair,
    triggerIncident: triggerIncident,
    settleRedress: settleRedress,
    listIncidents: listIncidents,
    triggerCascadingChain: triggerCascadingChain,
    interveneCascadingChain: interveneCascadingChain,
    advanceCascadingChains: advanceCascadingChains,
    listCascadingChains: listCascadingChains
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/aftermath-impact 已加载（2.231.0）');
  }
})();