/**
 * WorldAxis engines/demographic-flow.js (v2.233.0) — EXV4-2 人口迁入迁出与地方能力变化
 *
 * 核心职责：
 *   以迁居/季节性流动事件改变现有角色地点、可用时段和关系责任。
 *   迁入由居住/服务/工作承载约束，迁出留下待接续义务。
 *   人口统计为纯读投影，绝不新建第二人物库。
 *
 * 运行闭环：
 *   流动意向/计划（planMigration）→ 承载力与通路预检（capacity & passage check）
 *   → 迁出责任移交/处置确认（commitMigration / handoff obligations）
 *   → 触发在途行程（travel/in-transit）→ 抵达目的地更新角色地点与可用性
 *   → demographicProjection 投影当地人口分布、劳动力与抚养比，改变地方生产/服务能力。
 *
 * 边界：
 *   1. 不建第二人物库：人物身份唯一真源为 registry / store.people，本模块仅维护流动事件与责任记录。
 *   2. 迁入必须受地方承载约束：住房/服务网络过载或环境极度承压时明确拒收，不静默塞入。
 *   3. 迁出责任不抹除：未移交的家庭照护或组织职责留下 pendingObligations，产生真实后果。
 *   4. 未到达者不提前参与：在途（in-transit）人员不得计算为目的地有效劳动力或服务供给者。
 *   5. 只读投影零写入：demographicProjection 纯计算投影，绝不修改世界状态。
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
    return WA.clock ? WA.clock.now('demographicFlow') : Date.now();
  }

  var MIGRATION_TYPES = ['relocation', 'seasonal'];
  var FLOW_STATUS = ['planned', 'in_transit', 'settled', 'cancelled', 'returned'];

  function bucket() {
    var s = state();
    return (s.demographicFlow && typeof s.demographicFlow === 'object') ? s.demographicFlow : null;
  }

  function ensureBucket() {
    if (!bucket()) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.demographicFlow = d.demographicFlow || {
            migrations: [],
            seasonalRecords: [],
            pendingObligations: [],
            placeCapacities: {}
          };
          return true;
        }, 'demographicFlow:init');
      }
    }
    var b = bucket() || { migrations: [], seasonalRecords: [], pendingObligations: [], placeCapacities: {} };
    if (!Array.isArray(b.migrations)) b.migrations = [];
    if (!Array.isArray(b.seasonalRecords)) b.seasonalRecords = [];
    if (!Array.isArray(b.pendingObligations)) b.pendingObligations = [];
    if (!b.placeCapacities || typeof b.placeCapacities !== 'object') b.placeCapacities = {};
    return b;
  }

  /**
   * 声明或配置地点人口/居住承载上限
   */
  function setPlaceCapacity(placeId, spec) {
    var pid = clean(placeId, 60);
    if (!pid) return { ok: false, reason: 'missing-place' };
    var sp = spec || {};
    var maxPopulation = Math.max(1, Math.floor(num(sp.maxPopulation) || 50));
    var housingLimit = Math.max(1, Math.floor(num(sp.housingLimit) || maxPopulation));
    var entry = {
      placeId: pid,
      maxPopulation: maxPopulation,
      housingLimit: housingLimit,
      updatedAt: now()
    };
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.demographicFlow = d.demographicFlow || { migrations: [], seasonalRecords: [], pendingObligations: [], placeCapacities: {} };
        d.demographicFlow.placeCapacities = d.demographicFlow.placeCapacities || {};
        d.demographicFlow.placeCapacities[pid] = entry;
        return true;
      }, 'demographicFlow:setPlaceCapacity');
    }
    return { ok: true, placeId: pid, capacity: entry };
  }

  /**
   * 规划人口流动/迁居预检
   */
  function planMigration(spec) {
    var sp = spec || {};
    var who = clean(sp.who || sp.person, 60);
    var from = clean(sp.from, 60);
    var to = clean(sp.to, 60);
    var flowType = clean(sp.type || 'relocation', 30);

    if (!who || !from || !to) return { ok: false, reason: 'missing-fields' };
    if (from === to) return { ok: false, reason: 'same-origin-destination' };
    if (MIGRATION_TYPES.indexOf(flowType) < 0) {
      return { ok: false, reason: 'invalid-flow-type', allowed: MIGRATION_TYPES.slice() };
    }

    var s = state();
    var pId = who.indexOf('p_') === 0 ? who : 'p_' + who;
    var person = (s.people && s.people[pId]) ? s.people[pId] : null;

    // 检查人物在途状态
    if (person && (person.traveling || person.status === 'traveling' || person.status === 'transit')) {
      return { ok: false, reason: 'person-already-traveling', who: who };
    }

    // 检查目标地点人口与居住承载力
    var proj = demographicProjection(to);
    var bk = ensureBucket();
    var capSpec = (bk.placeCapacities && bk.placeCapacities[to]) ? bk.placeCapacities[to] : null;
    var maxPop = capSpec ? capSpec.maxPopulation : 100;
    var housingLimit = capSpec ? capSpec.housingLimit : 80;

    if (proj.residentCount >= maxPop) {
      return {
        ok: false,
        reason: 'destination-capacity-exhausted',
        place: to,
        current: proj.residentCount,
        max: maxPop,
        note: '目标地点总人口已达承载上限，拒绝迁入'
      };
    }
    if (proj.settledCount >= housingLimit && flowType === 'relocation') {
      return {
        ok: false,
        reason: 'housing-capacity-exhausted',
        place: to,
        current: proj.settledCount,
        limit: housingLimit,
        note: '目标地点居住用房已满，无法接纳常住迁居'
      };
    }

    // 检查公共服务网络影响（如需过所或关卡封锁）
    if (WA.serviceNetwork && typeof WA.serviceNetwork.checkPassage === 'function') {
      var passCheck = WA.serviceNetwork.checkPassage(from, to, who, sp);
      if (!passCheck.ok || !passCheck.permitted) {
        return {
          ok: false,
          reason: 'passage-blocked',
          checkpoint: passCheck.name || passCheck.checkpointId,
          detail: passCheck.note || passCheck.reason
        };
      }
    }

    // 清点出发地未移交的家庭照护与组织责任
    var unhandledObligations = [];
    if (s.family && Array.isArray(s.family.units)) {
      s.family.units.forEach(function (u) {
        if (!u) return;
        var isMem = Array.isArray(u.members) && u.members.some(function (m) {
          return m && (m.who === who || m.name === who || m.id === who || m.id === pId);
        });
        if (isMem && Array.isArray(u.care)) {
          u.care.forEach(function (c) {
            var isCg = c && (c.caregiver === who || c.caregiver === pId);
            var isActive = (c.active !== false);
            var wardName = c.ward || c.target;
            if (isCg && isActive && wardName) {
              unhandledObligations.push({
                kind: 'family_care',
                unitId: u.id,
                target: wardName,
                ward: wardName,
                label: '照料责任（被照护者: ' + wardName + '）'
              });
            }
          });
        }
      });
    }

    return {
      ok: true,
      ready: true,
      plan: {
        who: who,
        from: from,
        to: to,
        flowType: flowType,
        estimatedDurationDays: num(sp.durationDays) || 3,
        unhandledObligations: unhandledObligations,
        requiresHandoff: unhandledObligations.length > 0
      }
    };
  }

  /**
   * 提交并执行人口流动/迁居事件
   */
  function commitMigration(spec, opts) {
    var pRes = planMigration(spec);
    if (!pRes.ok) return pRes;
    var plan = pRes.plan;
    var o = opts || {};
    var allowUntransferred = !!o.forceWithoutHandoff;

    if (plan.requiresHandoff && !allowUntransferred && (!o.handoffs || !o.handoffs.length)) {
      return {
        ok: false,
        reason: 'unhandled-obligations',
        obligations: plan.unhandledObligations,
        note: '存在未转交的家庭照料或关键义务，须完成转交或声明强制离去后果'
      };
    }

    var mid = 'mig_' + now() + '_' + (WA.rand ? WA.rand.id() : Math.random().toString(36).slice(2, 8));
    var entry = {
      id: mid,
      who: plan.who,
      from: plan.from,
      to: plan.to,
      flowType: plan.flowType,
      status: o.instantArrive ? 'settled' : 'in_transit',
      createdAt: now(),
      arrivedAt: o.instantArrive ? now() : null,
      leftObligations: plan.unhandledObligations.map(function (ob) {
        return {
          kind: ob.kind,
          unitId: ob.unitId,
          target: ob.target,
          abandoned: true,
          consequence: 'care_gap_recorded'
        };
      })
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.demographicFlow = d.demographicFlow || { migrations: [], seasonalRecords: [], pendingObligations: [], placeCapacities: {} };
        d.demographicFlow.migrations = d.demographicFlow.migrations || [];
        d.demographicFlow.migrations.push(entry);

        if (entry.leftObligations.length) {
          d.demographicFlow.pendingObligations = d.demographicFlow.pendingObligations || [];
          entry.leftObligations.forEach(function (lo) {
            d.demographicFlow.pendingObligations.push({
              migrationId: mid,
              who: plan.who,
              place: plan.from,
              obligation: lo,
              recordedAt: now()
            });
          });
        }

        // 更新人物地点状态（若是即时到达，或标记在途）
        var pId = plan.who.indexOf('p_') === 0 ? plan.who : 'p_' + plan.who;
        d.people = d.people || {};
        if (!d.people[pId]) {
          d.people[pId] = { id: pId, name: plan.who, location: plan.from };
        }
        if (o.instantArrive) {
          d.people[pId].location = plan.to;
          d.people[pId].traveling = false;
          d.people[pId].status = 'resident';
        } else {
          d.people[pId].traveling = true;
          d.people[pId].status = 'transit';
          d.people[pId].transitFrom = plan.from;
          d.people[pId].transitTo = plan.to;
        }

        // 若执行了责任转交
        if (Array.isArray(o.handoffs) && d.family && Array.isArray(d.family.units)) {
          o.handoffs.forEach(function (h) {
            if (!h || !h.unitId || (!h.target && !h.ward) || (!h.substitute && !h.newCaregiver)) return;
            var tgt = h.target || h.ward;
            var sub = h.substitute || h.newCaregiver;
            var u = d.family.units.filter(function (x) { return x && x.id === h.unitId; })[0];
            if (u && Array.isArray(u.care)) {
              var cRec = u.care.filter(function (c) { return c && (c.target === tgt || c.ward === tgt) && (c.active !== false); })[0];
              if (cRec) {
                cRec.caregiver = sub;
                cRec.transferredAt = now();
                cRec.reason = 'migration_handoff';
              }
            }
          });
        }
        return true;
      }, 'demographicFlow:commitMigration');
    }

    return {
      ok: true,
      migrationId: mid,
      status: entry.status,
      arrived: entry.status === 'settled',
      leftObligationsCount: entry.leftObligations.length,
      note: entry.status === 'settled' ? '角色已成功迁至新地点' : '角色已启程处于在途状态，未到达前不参与目的地服务'
    };
  }

  /**
   * 记录角色抵达目的地，解除在途并完成落户
   */
  function arriveMigration(migrationId) {
    var mid = clean(migrationId, 60);
    var bk = ensureBucket();
    var mig = (bk.migrations || []).filter(function (m) { return m && m.id === mid; })[0];
    if (!mig) return { ok: false, reason: 'migration-not-found' };
    if (mig.status === 'settled') return { ok: true, alreadySettled: true, migrationId: mid };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var mList = (d.demographicFlow && d.demographicFlow.migrations) || [];
        for (var i = 0; i < mList.length; i++) {
          if (mList[i] && mList[i].id === mid) {
            mList[i].status = 'settled';
            mList[i].arrivedAt = now();
            var who = mList[i].who;
            var to = mList[i].to;
            var pId = who.indexOf('p_') === 0 ? who : 'p_' + who;
            if (d.people && d.people[pId]) {
              d.people[pId].location = to;
              d.people[pId].traveling = false;
              d.people[pId].status = 'resident';
              delete d.people[pId].transitFrom;
              delete d.people[pId].transitTo;
            }
            break;
          }
        }
        return true;
      }, 'demographicFlow:arriveMigration');
    }
    return { ok: true, migrationId: mid, status: 'settled' };
  }

  /**
   * 记录季节性外出劳作/流动（外出）
   */
  function recordSeasonalDeparture(who, fromPlace, toPlace, purpose, durationDays) {
    var w = clean(who, 60);
    var from = clean(fromPlace, 60);
    var to = clean(toPlace, 60);
    var purp = clean(purpose || 'seasonal_labor', 40);
    var dur = Math.max(1, Math.floor(num(durationDays) || 30));

    if (!w || !from || !to) return { ok: false, reason: 'missing-fields' };
    var planRes = planMigration({ who: w, from: from, to: to, type: 'seasonal' });
    if (!planRes.ok) return planRes;

    var sId = 'sea_' + now() + '_' + (WA.rand ? WA.rand.id() : Math.random().toString(36).slice(2, 8));
    var rec = {
      id: sId,
      who: w,
      homePlace: from,
      workPlace: to,
      purpose: purp,
      durationDays: dur,
      departedAt: now(),
      status: 'active'
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.demographicFlow = d.demographicFlow || { migrations: [], seasonalRecords: [], pendingObligations: [], placeCapacities: {} };
        d.demographicFlow.seasonalRecords = d.demographicFlow.seasonalRecords || [];
        d.demographicFlow.seasonalRecords.push(rec);

        var pId = w.indexOf('p_') === 0 ? w : 'p_' + w;
        if (d.people && d.people[pId]) {
          d.people[pId].location = to;
          d.people[pId].seasonalHome = from;
          d.people[pId].isSeasonal = true;
        }
        return true;
      }, 'demographicFlow:recordSeasonalDeparture');
    }

    return { ok: true, seasonalId: sId, record: rec };
  }

  /**
   * 记录季节性劳作返乡（返还）
   */
  function recordSeasonalReturn(seasonalId) {
    var sid = clean(seasonalId, 60);
    var bk = ensureBucket();
    var rec = (bk.seasonalRecords || []).filter(function (r) { return r && r.id === sid; })[0];
    if (!rec) return { ok: false, reason: 'record-not-found' };
    if (rec.status === 'returned') return { ok: true, alreadyReturned: true, seasonalId: sid };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var list = (d.demographicFlow && d.demographicFlow.seasonalRecords) || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].id === sid) {
            list[i].status = 'returned';
            list[i].returnedAt = now();
            var who = list[i].who;
            var home = list[i].homePlace;
            var pId = who.indexOf('p_') === 0 ? who : 'p_' + who;
            if (d.people && d.people[pId]) {
              d.people[pId].location = home;
              d.people[pId].isSeasonal = false;
              delete d.people[pId].seasonalHome;
            }
            break;
          }
        }
        return true;
      }, 'demographicFlow:recordSeasonalReturn');
    }

    return { ok: true, seasonalId: sid, status: 'returned' };
  }

  /**
   * 人口统计纯读投影（绝不建第二人物库，从已有人物、名册与行程中聚合计算）
   * 纯读保证：多次连续调用，store 零写入
   */
  function demographicProjection(locationId) {
    var loc = clean(locationId, 60);
    var s = state();
    var pMap = s.people || {};
    var pKeys = Object.keys(pMap);

    var residents = [];
    var seasonalWorkers = [];
    var inTransitApproaching = [];
    var totalWorkforce = 0;
    var dependentCount = 0;

    pKeys.forEach(function (k) {
      var p = pMap[k];
      if (!p) return;
      var pLoc = p.location;
      var isTraveling = !!(p.traveling || p.status === 'traveling' || p.status === 'transit');

      // 处于在途状态的人物，即使其目标或来源是本地点，也不能计入现时有效在场劳动力
      if (isTraveling) {
        if (p.transitTo === loc) {
          inTransitApproaching.push(p.name || k);
        }
        return;
      }

      if (pLoc === loc) {
        if (p.isSeasonal) {
          seasonalWorkers.push(p.name || k);
        } else {
          residents.push(p.name || k);
        }

        // 劳动力与抚养比统计
        var role = p.role || p.occupation || 'labor';
        if (role === 'dependent' || role === 'child' || role === 'elder' || p.isDependent) {
          dependentCount++;
        } else {
          totalWorkforce++;
        }
      }
    });

    var bk = (s.demographicFlow && typeof s.demographicFlow === 'object') ? s.demographicFlow : null;
    var capSpec = (bk && bk.placeCapacities && bk.placeCapacities[loc]) ? bk.placeCapacities[loc] : null;
    var maxPop = capSpec ? capSpec.maxPopulation : 100;
    var housingLimit = capSpec ? capSpec.housingLimit : 80;

    var totalPresent = residents.length + seasonalWorkers.length;
    var dependencyRatio = totalWorkforce > 0 ? Number((dependentCount / totalWorkforce).toFixed(2)) : 0;
    var pressureRatio = maxPop > 0 ? Number((totalPresent / maxPop).toFixed(2)) : 0;

    // 地方生产/服务能力影响评估系数 (capacityFactor)
    // 劳动力充足且无过载时为 1.0；劳动力匮乏或过载拥挤时出现降级
    var capacityFactor = 1.0;
    if (totalWorkforce === 0) capacityFactor = 0.2;
    else if (totalWorkforce < 3) capacityFactor = 0.6;
    if (pressureRatio > 0.9) capacityFactor = Number((capacityFactor * 0.8).toFixed(2));

    return {
      ok: true,
      placeId: loc,
      residentCount: residents.length,
      seasonalWorkerCount: seasonalWorkers.length,
      totalPresent: totalPresent,
      settledCount: residents.length,
      inTransitApproaching: inTransitApproaching,
      totalWorkforce: totalWorkforce,
      dependentCount: dependentCount,
      dependencyRatio: dependencyRatio,
      pressureRatio: pressureRatio,
      capacityFactor: capacityFactor,
      isCongested: pressureRatio >= 1.0,
      limits: {
        maxPopulation: maxPop,
        housingLimit: housingLimit
      }
    };
  }

  WA.demographicFlow = {
    setPlaceCapacity: setPlaceCapacity,
    planMigration: planMigration,
    commitMigration: commitMigration,
    arriveMigration: arriveMigration,
    recordSeasonalDeparture: recordSeasonalDeparture,
    recordSeasonalReturn: recordSeasonalReturn,
    demographicProjection: demographicProjection
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/demographic-flow.js', { kind: 'engine', ver: '2.233.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/demographic-flow 已加载（2.233.0）');
  }
})();
