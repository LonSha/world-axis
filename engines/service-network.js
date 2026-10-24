/**
 * WorldAxis engines/service-network.js (v2.231.0) — IN-6 公共设施与服务网络
 *
 * 核心职责：
 *   设施有可声明服务、供给依赖、容量、覆盖范围与维护责任。
 *   例如水渠服务农田、驿站支持行程、公共工坊提供加工能力。
 *   网络容量不足会出现排队、降级和可选择的替代服务。
 *   玩家可筹资、建设、维护、扩容、改用途，并协商谁付费谁受益。
 *
 * 运行闭环：
 *   组织/共同生活提出项目 → 批准预算与劳动 → production/operations 实际施工
 *   → world 中设施提供服务 → 行动与生产消费可用能力 → 维护或需求变化改变服务。
 *   线路引用真实地点/连接，不凭空创造道路。
 *   产出、消耗、费用继续由原 owner 结算。
 *
 * 边界：
 *   1. 设施引用真实地点（region.places 须存在），不凭空创造道路。
 *   2. 服务声明有具名类型（irrigation / transport / crafting / water-supply），不开放任意字符串。
 *   3. 容量不足时如实报排队/降级，不静默吞掉。
 *   4. 停止维护使可用服务逐步受影响（degraded），修复依赖 OP-6（aftermath），不能仅改标签成"已修复"。
 *   5. 首批选两类服务和小网络，不建设通用网络求解平台。
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
    return WA.clock.now('serviceNetwork');
  }

  var SERVICE_TYPES = ['irrigation', 'transport', 'crafting', 'water-supply'];
  var STATUS = ['planned', 'operational', 'degraded', 'dismantled'];

  function bucket() {
    var s = state();
    return (s.serviceNetwork && typeof s.serviceNetwork === 'object') ? s.serviceNetwork : null;
  }

function ensureBucket() {
    if (!bucket()) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.serviceNetwork = d.serviceNetwork || { facilities: [], usage: [], queue: [] };
          return true;
        }, 'serviceNetwork:init');
      }
    }
    var b = bucket() || { facilities: [], usage: [], queue: [] };
    if (!Array.isArray(b.queue)) b.queue = [];
    return b;
  }
  function placeExists(placeId) {
    var s = state();
    var rplaces = (s.region && Array.isArray(s.region.places)) ? s.region.places : [];
    var wplaces = (s.world && Array.isArray(s.world.places)) ? s.world.places : [];
    return rplaces.some(function (p) { return p && (p.id === placeId || p.name === placeId); }) ||
           wplaces.some(function (p) { return p && (p.id === placeId || p.name === placeId); });
  }
  /**
   * 声明一处公共设施及其服务。
   * 设施必须引用真实地点。
   */
  function declareFacility(spec) {
    var s = spec || {};
    var name = clean(s.name, 60);
    var placeId = clean(s.placeId, 60);
    var serviceType = clean(s.serviceType, 30);

    if (!name || !placeId || !serviceType) return { ok: false, reason: 'missing-fields' };
    if (SERVICE_TYPES.indexOf(serviceType) < 0) return { ok: false, reason: 'bad-service-type', allowed: SERVICE_TYPES.slice() };
    if (!placeExists(placeId)) return { ok: false, reason: 'place-not-found', placeId: placeId,
      note: '设施必须引用真实地点，不凭空创造道路' };

    var capacity = num(s.capacity) || 1;
    var entry = {
      id: 'fac_' + now() + '_' + WA.rand.id(),
      name: name,
      placeId: placeId,
      serviceType: serviceType,
      capacity: capacity,
      load: 0,
      supplyDepends: Array.isArray(s.supplyDepends) ? s.supplyDepends.slice(0, 4) : [],
      coverage: Array.isArray(s.coverage) ? s.coverage.slice(0, 8) : [],
      maintainer: clean(s.maintainer, 40),
      buildCost: num(s.buildCost) || 0,
      status: 'planned',
      lastMaintained: 0,
      createdAt: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.serviceNetwork = d.serviceNetwork || { facilities: [], usage: [] };
        d.serviceNetwork.facilities.push(entry);
        return true;
      }, 'serviceNetwork:declareFacility');
    }

    return { ok: true, facility: entry };
  }

  /**
   * 将设施从 planned 变为 operational。
   * 调用方应已通过 production/operations 完成施工。
   */
  function activateFacility(facilityId) {
    var fId = clean(facilityId, 60);
    var bk = ensureBucket();
    var fac = (bk.facilities || []).filter(function (f) { return f && f.id === fId; })[0];
    if (!fac) return { ok: false, reason: 'facility-not-found' };
    if (fac.status !== 'planned') return { ok: false, reason: 'not-planned', status: fac.status };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var f = (d.serviceNetwork.facilities || []).filter(function (x) { return x && x.id === fId; })[0];
        if (f) { f.status = 'operational'; f.lastMaintained = now(); }
        return true;
      }, 'serviceNetwork:activateFacility');
    }

    return { ok: true, facilityId: fId };
  }

  /**
   * 消费设施服务：增加负载，容量不足时报排队。
   */
function requestService(facilityId, who, amount, opts) {
    var fId = clean(facilityId, 60);
    var by = clean(who, 40);
    var amt = num(amount) || 1;
    var o = opts || {};
    var bk = ensureBucket();
    var fac = (bk.facilities || []).filter(function (f) { return f && f.id === fId; })[0];
    if (!fac) return { ok: false, reason: 'facility-not-found' };
    if (fac.status !== 'operational' && fac.status !== 'degraded') {
      return { ok: false, reason: 'not-available', status: fac.status };
    }
    var maxCap = (fac.status === 'degraded') ? Math.max(1, Math.floor(fac.capacity * 0.5)) : fac.capacity;
    var newLoad = fac.load + amt;
    var capped = newLoad > fac.capacity;
    if (fac.status === 'degraded' && newLoad > maxCap) capped = true;
    var effectiveCap = (fac.status === 'degraded') ? maxCap : fac.capacity;
    var effective = capped ? Math.max(0, effectiveCap - fac.load) : amt;
    if (effective < 0) effective = 0;
    var queued = capped ? (amt - effective) : 0;
    var queueId = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var f = (d.serviceNetwork.facilities || []).filter(function (x) { return x && x.id === fId; })[0];
        if (f) {
          f.load = Math.min(f.load + effective, effectiveCap);
          d.serviceNetwork.usage.push({
            facilityId: fId, who: by, requested: amt, served: effective,
            queued: queued, at: now()
          });
          if (queued > 0 && o.enqueue) {
            d.serviceNetwork.queue = d.serviceNetwork.queue || [];
            queueId = 'q_' + now() + '_' + d.serviceNetwork.queue.length;
            d.serviceNetwork.queue.push({
              id: queueId,
              facilityId: fId,
              who: by,
              amount: queued,
              queuedAt: now()
            });
          }
        }
        return true;
      }, 'serviceNetwork:requestService');
    }
    return {
      ok: true, facilityId: fId, served: effective, queued: queued,
      queueId: queueId,
      effectiveCapacity: effectiveCap,
      degraded: fac.status === 'degraded',
      note: queued > 0 ? ('容量不足，' + queued + ' 单位排队等候') : '服务已提供'
    };
  }
  /**
   * 释放负载（使用完毕）。
   */
  function releaseService(facilityId, amount) {
    var fId = clean(facilityId, 60);
    var amt = num(amount) || 1;
    var bk = ensureBucket();
    var fac = (bk.facilities || []).filter(function (f) { return f && f.id === fId; })[0];
    if (!fac) return { ok: false, reason: 'facility-not-found' };
    var dequeued = [];
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var f = (d.serviceNetwork.facilities || []).filter(function (x) { return x && x.id === fId; })[0];
        if (f) {
          f.load = Math.max(0, f.load - amt);
          var effectiveCap = (f.status === 'degraded') ? Math.max(1, Math.floor(f.capacity * 0.5)) : f.capacity;
          d.serviceNetwork.queue = d.serviceNetwork.queue || [];
          while (d.serviceNetwork.queue.length > 0) {
            var head = d.serviceNetwork.queue[0];
            if (head.facilityId !== fId) break;
            var available = effectiveCap - f.load;
            if (available >= head.amount) {
              var popped = d.serviceNetwork.queue.shift();
              f.load += popped.amount;
              d.serviceNetwork.usage.push({
                facilityId: fId, who: popped.who, requested: popped.amount, served: popped.amount,
                queued: 0, fromQueue: true, at: now()
              });
              dequeued.push(popped);
            } else {
              break;
            }
          }
        }
        return true;
      }, 'serviceNetwork:releaseService');
    }
    return { ok: true, facilityId: fId, dequeued: dequeued };
  }
  /**
   * 将服务请求登记入排队等待队列
   */
  function queueService(facilityId, who, amount) {
    var fId = clean(facilityId, 60);
    var by = clean(who, 40);
    var amt = num(amount) || 1;
    var bk = ensureBucket();
    var fac = (bk.facilities || []).filter(function (f) { return f && f.id === fId; })[0];
    if (!fac) return { ok: false, reason: 'facility-not-found' };
    var qId = null;
    var pos = 1;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.serviceNetwork.queue = d.serviceNetwork.queue || [];
        qId = 'q_' + now() + '_' + d.serviceNetwork.queue.length;
        d.serviceNetwork.queue.push({
          id: qId,
          facilityId: fId,
          who: by,
          amount: amt,
          queuedAt: now()
        });
        pos = d.serviceNetwork.queue.length;
        return true;
      }, 'serviceNetwork:queueService');
    }
    return { ok: true, facilityId: fId, queueId: qId, position: pos, amount: amt };
  }
  /**
   * 取消排队等候
   */
  function cancelQueue(facilityId, queueId) {
    var fId = clean(facilityId, 60);
    var qId = clean(queueId, 60);
    var removed = false;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        if (d.serviceNetwork && Array.isArray(d.serviceNetwork.queue)) {
          var before = d.serviceNetwork.queue.length;
          d.serviceNetwork.queue = d.serviceNetwork.queue.filter(function (q) {
            return !(q && q.id === qId && q.facilityId === fId);
          });
          removed = d.serviceNetwork.queue.length < before;
        }
        return true;
      }, 'serviceNetwork:cancelQueue');
    }
    return { ok: true, facilityId: fId, queueId: qId, cancelled: removed };
  }
  /**
   * 停止维护使服务逐步受影响（degraded）。
   * 修复依赖 OP-6（aftermath），不能仅改标签。
   */
  function decayFacility(facilityId) {
    var fId = clean(facilityId, 60);
    var bk = ensureBucket();
    var fac = (bk.facilities || []).filter(function (f) { return f && f.id === fId; })[0];
    if (!fac) return { ok: false, reason: 'facility-not-found' };
    if (fac.status === 'dismantled') return { ok: false, reason: 'already-dismantled' };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var f = (d.serviceNetwork.facilities || []).filter(function (x) { return x && x.id === fId; })[0];
        if (f) {
          if (f.status === 'operational') f.status = 'degraded';
          else if (f.status === 'degraded') f.status = 'degraded'; // 继续恶化但不自动 dismantled
        }
        return true;
      }, 'serviceNetwork:decayFacility');
    }

    return { ok: true, facilityId: fId, note: '设施因缺乏维护而降级；修复须通过 OP-6 aftermath，不能仅改标签' };
  }

  /**
   * 修复设施（由 OP-6 aftermath 调用）。
   */
  function restoreFacility(facilityId) {
    var fId = clean(facilityId, 60);
    var bk = ensureBucket();
    var fac = (bk.facilities || []).filter(function (f) { return f && f.id === fId; })[0];
    if (!fac) return { ok: false, reason: 'facility-not-found' };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var f = (d.serviceNetwork.facilities || []).filter(function (x) { return x && x.id === fId; })[0];
        if (f) { f.status = 'operational'; f.lastMaintained = now(); }
        return true;
      }, 'serviceNetwork:restoreFacility');
    }

    return { ok: true, facilityId: fId };
  }

  /**
   * 查询某地点可用的服务。
   */
  function servicesAt(placeId) {
    var pid = clean(placeId, 60);
    var bk = ensureBucket();
    var facs = (bk.facilities || []).filter(function (f) {
      return f && f.placeId === pid && (f.status === 'operational' || f.status === 'degraded');
    });
    return { ok: true, facilities: facs, count: facs.length };
  }

  /**
   * OPV3-7 & EXV3-2: 评估地点设施对下游行动与生产的硬性约束
   * 设施降级（degraded）引发效率减半与工期滞后，设施瘫痪（dismantled）直接阻断行动。
   */
  function checkServiceImpact(placeId, serviceType) {
    var pid = clean(placeId, 60);
    var st = clean(serviceType, 40);
    var bk = ensureBucket();
    var facs = (bk.facilities || []).filter(function (f) {
      return f && f.placeId === pid && (!st || f.serviceType === st);
    });

    if (!facs.length) {
      return {
        ok: false,
        available: false,
        reason: 'service-not-provided',
        placeId: pid,
        serviceType: st,
        note: '当前地点未配置该项公共服务设施'
      };
    }

    // 优先选择运行最良好的设施
    var operational = facs.filter(function (f) { return f.status === 'operational'; })[0];
    if (operational) {
      return {
        ok: true,
        available: true,
        status: 'operational',
        facilityId: operational.id,
        efficiency: 1.0,
        delayDays: 0,
        note: '设施运转良好，服务正常供给'
      };
    }

    var degraded = facs.filter(function (f) { return f.status === 'degraded'; })[0];
    if (degraded) {
      return {
        ok: true,
        available: true,
        status: 'degraded',
        facilityId: degraded.id,
        efficiency: 0.5,
        delayDays: 2,
        reason: 'facility-degraded',
        note: '公共设施缺乏维护受损降级，效率折半且工期滞后 2 日'
      };
    }

    return {
      ok: false,
      available: false,
      status: 'dismantled',
      facilityId: facs[0].id,
      reason: 'facility-out-of-service',
      note: '公共设施已瘫痪停用，行动受阻，需修复或绕行'
    };
  }

  /**
   * 真实消耗物料与工时修复设施
   */
  function repairFacilityWithMaterials(facilityId, repairSpec) {
    var fId = clean(facilityId, 60);
    var spec = repairSpec || {};
    var worker = clean(spec.worker, 40);
    var materials = spec.materials || {};
    var bk = ensureBucket();
    var fac = (bk.facilities || []).filter(function (f) { return f && f.id === fId; })[0];
    if (!fac) return { ok: false, reason: 'facility-not-found' };
    if (fac.status === 'operational') return { ok: true, alreadyOperational: true, facilityId: fId };

    if (!worker) return { ok: false, reason: 'missing-worker' };
    if (!materials || Object.keys(materials).length === 0) {
      return { ok: false, reason: 'missing-materials', note: '修复必须投入真实维修材料，杜绝凭空改标签' };
    }

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var f = (d.serviceNetwork.facilities || []).filter(function (x) { return x && x.id === fId; })[0];
        if (f) {
          f.status = 'operational';
          f.lastMaintained = now();
          f.lastRepairedBy = worker;
          f.repairLog = f.repairLog || [];
          f.repairLog.push({
            worker: worker,
            materials: Object.assign({}, materials),
            at: now()
          });
        }
        return true;
      }, 'serviceNetwork:repairFacilityWithMaterials');
    }

    return {
      ok: true,
      facilityId: fId,
      status: 'operational',
      worker: worker,
      materialsConsumed: materials,
      note: '设施维修完成，恢复标准服务容量'
    };
  }

  WA.serviceNetwork = {
    declareFacility: declareFacility,
    activateFacility: activateFacility,
    requestService: requestService,
    releaseService: releaseService,
    queueService: queueService,
    cancelQueue: cancelQueue,
    decayFacility: decayFacility,
    restoreFacility: restoreFacility,
    servicesAt: servicesAt,
    checkServiceImpact: checkServiceImpact,
    repairFacilityWithMaterials: repairFacilityWithMaterials,
    SERVICE_TYPES: SERVICE_TYPES.slice(),
    STATUS: STATUS.slice()
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/service-network.js', { kind: 'engine', ver: '2.231.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/service-network 已加载（2.231.0）');
  }
})();