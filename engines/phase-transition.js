/**
 * WorldAxis engines/phase-transition.js (v2.231.0) — IN-9 历史相变
 *
 * 核心职责：
 *   用题材声明的少量条件组合描述局部社会状态。
 *   状态变化需要持续条件、参与者决定与已兑现设施/技术，而非单一数值阈值。
 *   加入进入/退出不同条件与恢复时滞，表示路径依赖。
 *   不同地区可以并存不同阶段，信息传播仍有限。
 *
 * 运行闭环：
 *   IN-4 制度、IN-5 技术、IN-6 服务与 IN-7 环境提供真实读数
 *   → 形成可解释的转型机会/压力 → 玩家与 NPC 采取行动
 *   → 各业务 owner 实际改变成本/方法/协作范围
 *   → 进入新局部状态 → chronicle 记录使变化成立的事件。
 *   阶段标签只是结果摘要，不能自己凭空改库存、道路、职位或人物。
 *
 * 边界：
 *   1. 是前八项联动的旗舰，不是独立大总管。
 *   2. 先完成一个题材、两个地区、三种局部状态的纵向玩法，再扩展规则库。
 *   3. 不写任意社会演化 AI，不声称能预测现实历史。
 *   4. 阶段标签只是结果摘要，不凭空改库存/道路/职位/人物。
 *   5. 短期需求波动不会在两个时代名之间抖动；回退需要明确代价与过渡。
 *   6. 回退不恢复已消耗资源，也不让远方人物全知更新。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60);
  }

  function num(v) {
    var n = Number(v);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function now() {
    return WA.clock.now('phaseTransition');
  }

  // 三个局部社会状态（题材声明，不声称预测现实历史）
  var PHASES = [
    {
      id: 'decentralized-craft',
      label: '分散手工',
      conditions: {
        techLevel: ['apprenticeship', 'expedition'],
        serviceCoverage: 0.3,
        ruleCount: 0,
        envStrain: ['healthy', 'strained']
      },
      note: '小规模分散生产，设施少，无统一制度'
    },
    {
      id: 'public-collaboration',
      label: '公共协作',
      conditions: {
        techLevel: ['apprenticeship', 'simulation'],
        serviceCoverage: 0.5,
        ruleCount: 1,
        envStrain: ['healthy', 'strained', 'depleted']
      },
      note: '有公共设施与基本制度，开始协作生产'
    },
    {
      id: 'service-tension',
      label: '服务紧张',
      conditions: {
        techLevel: ['simulation'],
        serviceCoverage: 0.3,
        ruleCount: 2,
        envStrain: ['depleted', 'critical']
      },
      note: '资源紧张，制度复杂化，服务降级'
    }
  ];

  function bucket() {
    var s = state();
    return (s.phaseTransition && typeof s.phaseTransition === 'object') ? s.phaseTransition : null;
  }

  function ensureBucket() {
    if (!bucket()) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.phaseTransition = d.phaseTransition || { regions: {}, history: [], paths: {}, investments: [] };
          return true;
        }, 'phaseTransition:init');
      }
    } else {
      var bk = bucket();
      if (!bk.paths || !bk.investments) {
        if (WA.store && WA.store.transact) {
          WA.store.transact(function (d) {
            d.phaseTransition = d.phaseTransition || {};
            d.phaseTransition.regions = d.phaseTransition.regions || {};
            d.phaseTransition.history = d.phaseTransition.history || [];
            d.phaseTransition.paths = d.phaseTransition.paths || {};
            d.phaseTransition.investments = d.phaseTransition.investments || [];
            return true;
          }, 'phaseTransition:ensureSubStores');
        }
      }
    }
    return bucket() || { regions: {}, history: [], paths: {}, investments: [] };
  }

  /**
   * 采集某区域的各项读数（从 IN-4/5/6/7 各 owner 读取真实状态）。
   */
  function collectReadings(regionId) {
    var rid = clean(regionId, 60);
    var s = state();
    var readings = {
      techLevel: [],
      serviceCoverage: 0,
      ruleCount: 0,
      envStrain: []
    };

    // IN-5 技术谱系：取该区域有活跃实践者的传统（直接从 state 读取）
    var tlState = s.techLineage || {};
    var traditions = tlState.traditions || {};
    Object.keys(traditions).forEach(function (tid) {
      var t = traditions[tid];
      if (t && t.status === 'active' && t.method) {
        readings.techLevel.push(t.method);
      }
    });

    // IN-6 服务网络：取该区域可用设施数与总容量
    if (WA.serviceNetwork && typeof WA.serviceNetwork.servicesAt === 'function') {
      try {
        var sv = WA.serviceNetwork.servicesAt(rid);
        if (sv && sv.facilities) {
          var totalCap = 0;
          sv.facilities.forEach(function (f) { totalCap += (f.capacity || 0); });
          readings.serviceCoverage = totalCap;
        }
      } catch (e) {}
    }

    // IN-4 习俗到制度：取该区域生效规则数
    if (WA.customLax && typeof WA.customLax.activeRules === 'function') {
      // customLax 按 orgId 查，此处取近似
      try {
        var bk = ensureBucket();
        var rules = (bk.rules || WA.customLax.activeRules(rid).rules) || [];
        if (Array.isArray(rules)) readings.ruleCount = rules.length;
      } catch (e) {}
    }

    // IN-7 环境承载：取该区域资源应变等级
    if (WA.envCapacity && typeof WA.envCapacity.regionStatus === 'function') {
      try {
        var rs = WA.envCapacity.regionStatus(rid);
        if (rs && rs.resources) {
          rs.resources.forEach(function (r) {
            if (r.strain) readings.envStrain.push(r.strain);
          });
        }
      } catch (e) {}
    }

    return readings;
  }

  /**
   * 评估某区域当前处于哪个局部社会状态。
   * 阶段标签只是结果摘要，不凭空改库存。
   */
  function evaluatePhase(regionId) {
    var rid = clean(regionId, 60);
    var readings = collectReadings(rid);
    var bk = ensureBucket();
    var currentPhase = (bk.regions || {})[rid] || { phaseId: 'decentralized-craft', enteredAt: 0, stable: true };

    // 匹配最符合的 phase
    var bestMatch = null;
    var bestScore = -1;
    PHASES.forEach(function (p) {
      var score = 0;
      // 技术匹配
      var techMatch = p.conditions.techLevel.some(function (t) { return readings.techLevel.indexOf(t) >= 0; });
      if (techMatch) score += 1;
      // 服务覆盖
      if (readings.serviceCoverage >= p.conditions.serviceCoverage) score += 1;
      // 规则数
      if (readings.ruleCount >= p.conditions.ruleCount) score += 1;
      // 环境应变
      var envMatch = p.conditions.envStrain.some(function (e) { return readings.envStrain.indexOf(e) >= 0; });
      if (envMatch) score += 1;
      if (score > bestScore) { bestScore = score; bestMatch = p; }
    });

    var newPhaseId = bestMatch ? bestMatch.id : 'decentralized-craft';
    var changed = newPhaseId !== currentPhase.phaseId;

    // 短期波动不抖动：需持续条件满足才过渡
    // 第一次评估或已有稳定状态时不立即切换
    if (changed && currentPhase.enteredAt > 0) {
      // 记录潜在过渡（但不立即生效）
      return {
        ok: true,
        regionId: rid,
        currentPhase: currentPhase.phaseId,
        candidatePhase: newPhaseId,
        readings: readings,
        stable: false,
        note: '检测到潜在相变条件，但需持续满足与参与者决定才能过渡（防抖动）'
      };
    }

    // 首次或确认过渡
    if (changed || currentPhase.enteredAt === 0) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.phaseTransition = d.phaseTransition || { regions: {}, history: [] };
          d.phaseTransition.regions[rid] = { phaseId: newPhaseId, enteredAt: now(), stable: true };
          d.phaseTransition.history.push({
            regionId: rid, from: currentPhase.phaseId, to: newPhaseId, at: now(),
            readings: readings
          });
          return true;
        }, 'phaseTransition:evaluate');
      }
    }

    var phaseLabel = '';
    var phaseNote = '';
    PHASES.forEach(function (p) {
      if (p.id === newPhaseId) { phaseLabel = p.label; phaseNote = p.note; }
    });

    return {
      ok: true,
      regionId: rid,
      currentPhase: newPhaseId,
      phaseLabel: phaseLabel,
      readings: readings,
      stable: true,
      note: phaseNote || '阶段标签只是结果摘要，不凭空改库存/道路/职位/人物'
    };
  }

  /**
   * 显式过渡（由参与者决定触发，需明示代价与过渡）。
   * 回退不恢复已消耗资源。
   */
  function transition(regionId, targetPhaseId, opts) {
    var rid = clean(regionId, 60);
    var target = clean(targetPhaseId, 40);
    var o = opts || {};
    var bk = ensureBucket();
    var current = (bk.regions || {})[rid] || { phaseId: 'decentralized-craft', enteredAt: 0 };

    // 验证目标 phase 存在
    var valid = PHASES.some(function (p) { return p.id === target; });
    if (!valid) return { ok: false, reason: 'bad-phase', allowed: PHASES.map(function (p) { return p.id; }) };
    if (target === current.phaseId) return { ok: false, reason: 'already-in-phase', phaseId: current.phaseId };

    var isRollback = false;
    // 判断是否为回退（从更后阶段回到更前阶段）
    var currentIdx = PHASES.findIndex(function (p) { return p.id === current.phaseId; });
    var targetIdx = PHASES.findIndex(function (p) { return p.id === target; });
    if (targetIdx < currentIdx) isRollback = true;

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.phaseTransition = d.phaseTransition || { regions: {}, history: [] };
        d.phaseTransition.regions[rid] = { phaseId: target, enteredAt: now(), stable: true };
        d.phaseTransition.history.push({
          regionId: rid, from: current.phaseId, to: target, at: now(),
          decidedBy: clean(o.by, 40), isRollback: isRollback,
          cost: clean(o.cost, 60) || ''
        });
        return true;
      }, 'phaseTransition:transition');
    }

    return {
      ok: true,
      regionId: rid,
      from: current.phaseId,
      to: target,
      isRollback: isRollback,
      note: isRollback ? '回退需要明确代价与过渡；不恢复已消耗资源，也不让远方人物全知更新' : '进入新局部状态'
    };
  }

  /**
   * 查询区域历史相变记录。
   */
  function history(regionId) {
    var rid = clean(regionId, 60);
    var bk = ensureBucket();
    var hist = (bk.history || []).filter(function (h) { return h && h.regionId === rid; });
    return { ok: true, regionId: rid, transitions: hist, count: hist.length };
  }

  // ── WX-9 地方发展路径与长期投资分化 ────────────────────────────────
  var PATH_LAYOUTS = [
    { id: 'decentralized_workshop', label: '分散工坊网络', note: '各工坊自备基础设备，单点故障影响小，但工序分散物流较多' },
    { id: 'shared_service_center', label: '集中共享服务中心', note: '公用高精尖工位与维修站，生产与维修效率高，但故障影响全域' },
    { id: 'transit_hub', label: '商路协作节点', note: '依托物流与周期集市，货物吞吐快，商路阻断时受冲击明显' }
  ];

  function declarePlaceLayout(placeId, layoutType, opts) {
    var pId = clean(placeId, 40);
    var lType = clean(layoutType, 40);
    if (!pId || !lType) return { ok: false, reason: 'missing-fields' };
    var valid = PATH_LAYOUTS.some(function (pl) { return pl.id === lType; });
    if (!valid) return { ok: false, reason: 'bad-layout-type', allowed: PATH_LAYOUTS.map(function (p) { return p.id; }) };

    var o = opts || {};
    var record = {
      placeId: pId,
      layoutType: lType,
      totalFundsInvested: 0,
      totalMaterialsInvested: {},
      consecutiveCycles: 1,
      investments: [],
      declaredAt: now(),
      declaredBy: clean(o.by || 'council', 40)
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        ensureBucket();
        d.phaseTransition.paths = d.phaseTransition.paths || {};
        d.phaseTransition.paths[pId] = record;
        return true;
      }, 'phaseTransition:declarePlaceLayout');
    }
    return { ok: true, layout: record };
  }

  function investPath(placeId, spec) {
    var pId = clean(placeId, 40);
    var s = spec || {};
    var bk = ensureBucket();
    var cur = bk.paths && bk.paths[pId];
    if (!cur) return { ok: false, reason: 'layout-not-declared' };

    var funds = Math.max(0, Number(s.funds) || 0);
    var materials = (s.materials && typeof s.materials === 'object') ? Object.assign({}, s.materials) : {};
    var title = clean(s.title || '基础设施投入', 60);

    var invRecord = {
      id: 'inv_' + now() + '_' + WA.rand.id(),
      placeId: pId,
      title: title,
      funds: funds,
      materials: materials,
      targetLayout: cur.layoutType,
      at: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        ensureBucket();
        var p = d.phaseTransition.paths[pId];
        p.totalFundsInvested += funds;
        Object.keys(materials).forEach(function (mKey) {
          p.totalMaterialsInvested[mKey] = (p.totalMaterialsInvested[mKey] || 0) + (materials[mKey] || 0);
        });
        p.investments.push(invRecord);
        d.phaseTransition.investments = d.phaseTransition.investments || [];
        d.phaseTransition.investments.push(invRecord);
        if (d.economy && d.economy.money && typeof d.economy.money.funds === 'number') {
          d.economy.money.funds = Math.max(0, d.economy.money.funds - funds);
        }
        return true;
      }, 'phaseTransition:investPath');
    }
    return { ok: true, investment: invRecord, currentPath: ensureBucket().paths[pId] };
  }

  function evaluatePlacePath(placeId) {
    var pId = clean(placeId, 40);
    var bk = ensureBucket();
    var cur = bk.paths && bk.paths[pId];
    if (!cur) {
      return {
        ok: true,
        placeId: pId,
        layoutType: 'undeclared',
        efficiencyFactor: 1.0,
        transitCostFactor: 1.0,
        failureImpact: 'moderate',
        resilienceRating: 'average',
        note: '尚未确立专项发展路径，保持默认离散手工水平'
      };
    }

    var invested = cur.totalFundsInvested || 0;
    var lType = cur.layoutType;

    var efficiency = 1.0;
    var transitCost = 1.0;
    var failureImpact = 'moderate';
    var resilience = 'medium';

    if (lType === 'shared_service_center') {
      efficiency = 1.25 + Math.min(0.5, invested / 200);
      transitCost = 0.85;
      failureImpact = 'high';
      resilience = 'low_single_point_of_failure';
    } else if (lType === 'decentralized_workshop') {
      efficiency = 1.05 + Math.min(0.2, invested / 300);
      transitCost = 1.2;
      failureImpact = 'low';
      resilience = 'high_fault_tolerant';
    } else if (lType === 'transit_hub') {
      efficiency = 1.15;
      transitCost = 0.7;
      failureImpact = 'critical_on_road_disruption';
      resilience = 'dependent_on_routes';
    }

    return {
      ok: true,
      placeId: pId,
      layoutType: lType,
      totalFundsInvested: invested,
      efficiencyFactor: Number(efficiency.toFixed(2)),
      transitCostFactor: Number(transitCost.toFixed(2)),
      failureImpact: failureImpact,
      resilienceRating: resilience,
      investmentCount: (cur.investments || []).length
    };
  }

  function planTransitionRoute(placeId, targetLayout, opts) {
    var pId = clean(placeId, 40);
    var target = clean(targetLayout, 40);
    var bk = ensureBucket();
    var cur = bk.paths && bk.paths[pId];
    if (!cur) return { ok: false, reason: 'layout-not-declared' };
    if (cur.layoutType === target) return { ok: false, reason: 'already-in-target-layout' };

    var valid = PATH_LAYOUTS.some(function (pl) { return pl.id === target; });
    if (!valid) return { ok: false, reason: 'bad-target-layout' };

    var sunkCost = Math.floor(cur.totalFundsInvested * 0.4);
    var transitionCost = 30;
    var transitionDays = 5;
    return {
      ok: true,
      placeId: pId,
      currentLayout: cur.layoutType,
      targetLayout: target,
      sunkCostLoss: sunkCost,
      transitionCost: transitionCost,
      transitionDays: transitionDays,
      note: '重组需要处置闲置设备并重新组织协作网络，历史消耗资源不可退回'
    };
  }

  function simulateIncidentStress(placeId, incidentType) {
    var pId = clean(placeId, 40);
    var iType = clean(incidentType || 'power_failure', 40);
    var evalRes = evaluatePlacePath(pId);
    var lType = evalRes.layoutType;

    var downtimeRatio = 0.3;
    var affectedWorkstations = 'partial';
    var resilienceLevel = 'average';
    var remedy = 'standard_repair';

    if (lType === 'shared_service_center') {
      if (iType === 'power_failure' || iType === 'machinery_breakdown' || iType === 'facility_damage') {
        downtimeRatio = 0.85;
        affectedWorkstations = 'all_central_stations';
        resilienceLevel = 'low_single_point_of_failure';
        remedy = 'urgent_central_overhaul';
      } else {
        downtimeRatio = 0.4;
        affectedWorkstations = 'logistics_dock';
        resilienceLevel = 'medium';
        remedy = 'local_clearing';
      }
    } else if (lType === 'decentralized_workshop') {
      if (iType === 'power_failure' || iType === 'machinery_breakdown' || iType === 'facility_damage') {
        downtimeRatio = 0.15;
        affectedWorkstations = 'single_hearth_only';
        resilienceLevel = 'high_fault_tolerant';
        remedy = 'shift_to_neighbor_workbench';
      } else {
        downtimeRatio = 0.35;
        affectedWorkstations = 'cart_transfer';
        resilienceLevel = 'high_fault_tolerant';
        remedy = 'use_hand_carts';
      }
    } else if (lType === 'transit_hub') {
      if (iType === 'road_block' || iType === 'route_disruption' || iType === 'supply_break') {
        downtimeRatio = 0.75;
        affectedWorkstations = 'entire_depot_frozen';
        resilienceLevel = 'vulnerable_to_routes';
        remedy = 'reroute_secondary_paths';
      } else {
        downtimeRatio = 0.2;
        affectedWorkstations = 'storage_bay_minor';
        resilienceLevel = 'high_local_autonomy';
        remedy = 'standard_repair';
      }
    }

    var stressReport = {
      ok: true,
      placeId: pId,
      layoutType: lType,
      incidentType: iType,
      downtimeRatio: downtimeRatio,
      affectedWorkstations: affectedWorkstations,
      resilienceLevel: resilienceLevel,
      recommendedRemedy: remedy,
      simulatedAt: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        ensureBucket();
        d.phaseTransition.stressReports = d.phaseTransition.stressReports || [];
        d.phaseTransition.stressReports.push(stressReport);
        return true;
      }, 'phaseTransition:simulateIncidentStress');
    }

    return stressReport;
  }

  function executeTransitionRoute(placeId, targetLayout, opts) {
    var pId = clean(placeId, 40);
    var target = clean(targetLayout, 40);
    var o = opts || {};
    var planRes = planTransitionRoute(pId, target);
    if (!planRes.ok) return planRes;

    var cost = planRes.transitionCost;
    var sunk = planRes.sunkCostLoss;
    var days = planRes.transitionDays;
    var failReason = '';
    var executedRecord = null;

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        ensureBucket();
        var p = d.phaseTransition.paths && d.phaseTransition.paths[pId];
        if (!p) { failReason = 'layout-not-declared'; return false; }

        if (cost > 0) {
          if (!d.economy || !d.economy.money || (d.economy.money.funds || 0) < cost) {
            failReason = 'insufficient-funds';
            return false;
          }
          d.economy.money.funds -= cost;
        }

        var prevLayout = p.layoutType;
        p.layoutType = target;
        p.totalFundsInvested = Math.max(0, (p.totalFundsInvested || 0) - sunk);
        p.lastTransitionAt = now();
        p.transitionDays = days;
        p.transitionUntil = now() + days;

        executedRecord = {
          placeId: pId,
          fromLayout: prevLayout,
          toLayout: target,
          sunkCostDeducted: sunk,
          fundsSpent: cost,
          transitionDays: days,
          executedBy: clean(o.by || 'council', 40),
          executedAt: now()
        };

        d.phaseTransition.transitionExecutions = d.phaseTransition.transitionExecutions || [];
        d.phaseTransition.transitionExecutions.push(executedRecord);
        return true;
      }, 'phaseTransition:executeTransitionRoute');
    }

    if (!executedRecord) return { ok: false, reason: failReason || 'execution-failed' };

    return {
      ok: true,
      execution: executedRecord,
      newLayout: target,
      sunkCostDeducted: sunk,
      fundsSpent: cost,
      transitionDays: days,
      note: '重组转型已真实扣款并注销沉没投资，进入过渡期'
    };
  }

  WA.phaseTransition = {
    evaluatePhase: evaluatePhase,
    transition: transition,
    history: history,
    declarePlaceLayout: declarePlaceLayout,
    investPath: investPath,
    evaluatePlacePath: evaluatePlacePath,
    planTransitionRoute: planTransitionRoute,
    simulateIncidentStress: simulateIncidentStress,
    executeTransitionRoute: executeTransitionRoute,
    PATH_LAYOUTS: PATH_LAYOUTS.slice(),
    PHASES: PHASES.map(function (p) { return { id: p.id, label: p.label, note: p.note }; })
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/phase-transition.js', { kind: 'engine', ver: '2.231.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/phase-transition 已加载（2.231.0）');
  }
})();