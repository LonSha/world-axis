/**
 * WorldAxis engines/environmental-capacity.js (v2.231.0) — IN-7 有承载力的环境
 *
 * 核心职责：
 *   对题材声明的水、林地、牧场、土壤等抽象资源定义存量、再生条件、使用压力与恢复时滞。
 *   开采和生产产生实际需求，休养、修复、替代工艺改变压力。
 *   超过承载力影响产能与生活成本。
 *   不是每轮随机生成灾难逼玩家干活。
 *
 * 运行闭环：
 *   服务/生产/生活需求 → 从已有资源账实际取用 → 记录区域压力
 *   → 按剧情季节和已声明规则恢复 → 下一周期可用量影响路线、工期或替代选择。
 *   环境数据是少量区域级状态，不模拟每棵树。
 *   交易库存与环境存量有明确提取接口，不能各记一份可无限提取的资源。
 *
 * 边界：
 *   1. 环境数据是少量区域级状态，不模拟每棵树。
 *   2. 一次「下雨」不自动清除所有累积损耗，物资不凭空再生。
 *   3. 关闭环境模拟后仍能按原经济模式游玩。
 *   4. 公式和参数属于题材可解释规则，不宣称现实生态预测精度。
 *   5. 缺数据不编造科学结论。
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
    return WA.clock.now('envCapacity');
  }

  var RESOURCE_TYPES = ['water', 'forest', 'pasture', 'soil'];
  var STRAIN_LEVELS = ['healthy', 'strained', 'depleted', 'critical'];

  function bucket() {
    var s = state();
    return (s.envCapacity && typeof s.envCapacity === 'object') ? s.envCapacity : null;
  }

  function ensureBucket() {
    if (!bucket()) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.envCapacity = d.envCapacity || { resources: {}, log: [] };
          return true;
        }, 'envCapacity:init');
      }
    }
    return bucket() || { resources: {}, log: [] };
  }

  /**
   * 声明一处区域级环境资源。
   */
  function declareResource(spec) {
    var s = spec || {};
    var resourceId = clean(s.resourceId, 60);
    var resourceType = clean(s.resourceType, 30);
    var regionId = clean(s.regionId, 60);

    if (!resourceId || !resourceType || !regionId) return { ok: false, reason: 'missing-fields' };
    if (RESOURCE_TYPES.indexOf(resourceType) < 0) return { ok: false, reason: 'bad-resource-type', allowed: RESOURCE_TYPES.slice() };

    var stock = num(s.stock);
    var maxStock = num(s.maxStock) || stock || 100;
    var regenRate = num(s.regenRate) || 0;
    var recoveryDelay = num(s.recoveryDelay) || 1;

    if (stock === null) return { ok: false, reason: 'missing-fields', field: 'stock' };

    var strain = computeStrain({ stock: stock, maxStock: maxStock });
    var entry = {
      resourceId: resourceId,
      resourceType: resourceType,
      regionId: regionId,
      stock: stock,
      maxStock: maxStock,
      regenRate: regenRate,
      recoveryDelay: recoveryDelay,
      strain: strain,
      lastWithdrawnAt: 0,
      lastRegenAt: 0,
      declaredAt: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.envCapacity = d.envCapacity || { resources: {}, log: [] };
        d.envCapacity.resources[resourceId] = entry;
        return true;
      }, 'envCapacity:declareResource');
    }

    return { ok: true, resource: entry };
  }

  function computeStrain(entry) {
    var ratio = entry.stock / entry.maxStock;
    if (ratio > 0.6) return 'healthy';
    if (ratio > 0.3) return 'strained';
    if (ratio > 0.1) return 'depleted';
    return 'critical';
  }

  /**
   * 从环境资源中取用（生产/生活需求）。
   * 记录区域压力，超承载力影响产能。
   */
  function withdraw(resourceId, amount, opts) {
    var rId = clean(resourceId, 60);
    var amt = num(amount);
    if (!rId || amt === null || amt <= 0) return { ok: false, reason: 'missing-fields' };

    var bk = ensureBucket();
    var res = (bk.resources || {})[rId];
    if (!res) return { ok: false, reason: 'resource-not-found' };

    var actual = Math.min(amt, res.stock);
    var shortfall = amt - actual;
    var newStock = res.stock - actual;
    var strain = computeStrain({ stock: newStock, maxStock: res.maxStock });
    var prevStrain = res.strain;

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var r = (d.envCapacity.resources || {})[rId];
        if (!r) return false;
        r.stock = newStock;
        r.strain = strain;
        r.lastWithdrawnAt = now();
        d.envCapacity.log.push({
          resourceId: rId, action: 'withdraw', amount: actual, requested: amt,
          shortfall: shortfall, strain: strain, at: now()
        });
        return true;
      }, 'envCapacity:withdraw');
    }

    return {
      ok: true, resourceId: rId, served: actual, shortfall: shortfall,
      stock: newStock, strain: strain,
      degraded: strain !== 'healthy',
      note: strain === 'critical' ? '资源临界，产能与生活成本受影响' :
            strain === 'depleted' ? '资源枯竭，需休养或替代工艺' :
            strain === 'strained' ? '资源紧张，建议轮休或替代' : '资源健康'
    };
  }

  /**
   * 按剧情季节恢复（休养、修复）。
   * 一次下雨不自动清除所有累积损耗，按已声明 regenRate 恢复。
   */
  function regenerate(resourceId, opts) {
    var rId = clean(resourceId, 60);
    var bk = ensureBucket();
    var res = (bk.resources || {})[rId];
    if (!res) return { ok: false, reason: 'resource-not-found' };

    var o = opts || {};
    var factor = num(o.factor) || 1;
    var regenAmount = Math.round(res.regenRate * factor);
    if (regenAmount <= 0) return { ok: true, resourceId: rId, recovered: 0, stock: res.stock, note: '再生率为0，无自然恢复' };

    var newStock = Math.min(res.stock + regenAmount, res.maxStock);
    var actualRecover = newStock - res.stock;
    var strain = computeStrain({ stock: newStock, maxStock: res.maxStock });

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var r = (d.envCapacity.resources || {})[rId];
        if (!r) return false;
        r.stock = newStock;
        r.strain = strain;
        r.lastRegenAt = now();
        d.envCapacity.log.push({
          resourceId: rId, action: 'regen', amount: actualRecover,
          strain: strain, at: now()
        });
        return true;
      }, 'envCapacity:regen');
    }

    return { ok: true, resourceId: rId, recovered: actualRecover, stock: newStock, strain: strain };
  }

  /**
   * 查询某区域的全部环境资源状态。
   */
  function regionStatus(regionId) {
    var rid = clean(regionId, 60);
    var bk = ensureBucket();
    var resources = bk.resources || {};
    var items = [];
    Object.keys(resources).forEach(function (k) {
      var r = resources[k];
      if (r && r.regionId === rid) {
        items.push({
          resourceId: r.resourceId, resourceType: r.resourceType,
          stock: r.stock, maxStock: r.maxStock, strain: r.strain,
          ratio: (r.stock / r.maxStock).toFixed(2)
        });
      }
    });
    return { ok: true, regionId: rid, resources: items, count: items.length };
  }

  /**
   * EXV3-1: 承载力对下游行动与生产工期的影响评估。
   * 纯读计算：将压力级别映射为工期滞后、成本加成与替代工艺建议。
   */
  function evaluateImpact(regionId, resourceType) {
    var rid = clean(regionId, 60);
    var rtype = clean(resourceType, 30);
    var bk = ensureBucket();
    var resources = bk.resources || {};
    var hit = null;
    Object.keys(resources).forEach(function (k) {
      var r = resources[k];
      if (r && r.regionId === rid && (!rtype || r.resourceType === rtype)) {
        if (!hit || (r.stock / r.maxStock) < (hit.stock / hit.maxStock)) {
          hit = r;
        }
      }
    });

    if (!hit) {
      return {
        ok: true,
        regionId: rid,
        resourceType: rtype || 'any',
        strain: 'healthy',
        impactFactor: 1.0,
        extraDays: 0,
        costMultiplier: 1.0,
        alternativeSuggested: null,
        note: '未发现高压资源，按标准参数运行'
      };
    }

    var strain = hit.strain || 'healthy';
    var extraDays = 0;
    var costMultiplier = 1.0;
    var alternative = null;

    if (strain === 'strained') {
      extraDays = 1;
      costMultiplier = 1.2;
      alternative = '建议采用低消耗替代物料或分批次作业';
    } else if (strain === 'depleted') {
      extraDays = 3;
      costMultiplier = 1.5;
      alternative = '资源严重匮乏，需从外地调配补给或休整轮换';
    } else if (strain === 'critical') {
      extraDays = 6;
      costMultiplier = 2.0;
      alternative = '承载力已达临界，常规作业受阻，必须立即停工养护或就地修复水土';
    }

    return {
      ok: true,
      regionId: rid,
      resourceId: hit.resourceId,
      resourceType: hit.resourceType,
      strain: strain,
      stock: hit.stock,
      maxStock: hit.maxStock,
      ratio: Number((hit.stock / hit.maxStock).toFixed(2)),
      extraDays: extraDays,
      costMultiplier: costMultiplier,
      alternativeSuggested: alternative,
      note: '承载力压力改变下游工期与成本'
    };
  }

  // ─────────────────────────────────────────────────────────────
  // EXV4-1: 材料生命周期与废弃物回流
  // 覆盖“使用—损耗—废料—回收/处置—再投入”完整闭环
  // ─────────────────────────────────────────────────────────────

  var DEFAULT_RECYCLABLE = {
    metal: { name: '金属废料', yieldRate: 0.75, unitCost: 3, laborRequired: 1, facilityType: 'workshop' },
    timber: { name: '木材碎料', yieldRate: 0.60, unitCost: 1, laborRequired: 1, facilityType: 'yard' },
    fabric: { name: '布匹碎渣', yieldRate: 0.50, unitCost: 2, laborRequired: 1, facilityType: 'tailor' }
  };

  function computeBacklogLevel(amt) {
    if (amt > 50) return 'choked';
    if (amt > 20) return 'congested';
    return 'normal';
  }

  /**
   * 声明一种可回收材料规格（产出率、处置工位与折损系数）。
   */
  function declareRecyclableMaterial(materialId, spec) {
    var mid = clean(materialId, 60);
    if (!mid) return { ok: false, reason: 'missing-material-id' };
    var s = spec || {};
    var name = clean(s.name, 60) || mid;
    var yieldRate = num(s.yieldRate);
    if (yieldRate === null || yieldRate <= 0) yieldRate = 0.70;
    if (yieldRate > 0.95) yieldRate = 0.95; // 严禁 100% 或超额转化
    if (yieldRate < 0.05) yieldRate = 0.05;

    var unitCost = num(s.unitCost) != null ? Math.max(0, num(s.unitCost)) : 2;
    var laborRequired = num(s.laborRequired) != null ? Math.max(1, Math.floor(num(s.laborRequired))) : 1;
    var facilityType = clean(s.facilityType, 40) || 'workshop';
    var resourceType = clean(s.resourceType, 30) || null;

    var entry = {
      materialId: mid,
      name: name,
      yieldRate: yieldRate,
      unitCost: unitCost,
      laborRequired: laborRequired,
      facilityType: facilityType,
      resourceType: resourceType,
      declaredAt: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.envCapacity = d.envCapacity || { resources: {}, log: [] };
        d.envCapacity.materials = d.envCapacity.materials || {};
        d.envCapacity.materials[mid] = entry;
        return true;
      }, 'envCapacity:declareRecyclableMaterial');
    }

    return { ok: true, material: entry };
  }

  /**
   * 产生废料/副产物（来自生产消耗、设施维修或突发事故）。
   */
  function generateScrap(materialId, amount, source, locationId, opts) {
    var mid = clean(materialId, 60);
    var amt = num(amount);
    var loc = clean(locationId, 60) || 'default_site';
    var src = clean(source, 60) || 'production';

    if (!mid) return { ok: false, reason: 'missing-material-id' };
    if (amt === null || amt <= 0) return { ok: false, reason: 'invalid-amount' };

    var bk = ensureBucket();
    var mat = (bk.materials || {})[mid];
    if (!mat && DEFAULT_RECYCLABLE[mid]) {
      // 自动加载默认材料规格
      declareRecyclableMaterial(mid, DEFAULT_RECYCLABLE[mid]);
      bk = ensureBucket();
      mat = (bk.materials || {})[mid];
    }

    var scrapKey = loc + '::' + mid;
    var curEntry = ((bk.scraps || {})[scrapKey]) || {
      locationId: loc, materialId: mid, scrapAmount: 0, totalGenerated: 0, totalRecycled: 0
    };
    var newAmount = curEntry.scrapAmount + amt;
    var newTotalGen = curEntry.totalGenerated + amt;
    var backlog = computeBacklogLevel(newAmount);

    var record = {
      locationId: loc,
      materialId: mid,
      scrapAmount: newAmount,
      totalGenerated: newTotalGen,
      totalRecycled: curEntry.totalRecycled,
      backlogLevel: backlog,
      lastUpdated: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.envCapacity = d.envCapacity || { resources: {}, log: [] };
        d.envCapacity.scraps = d.envCapacity.scraps || {};
        d.envCapacity.scraps[scrapKey] = record;
        d.envCapacity.log.push({
          action: 'scrap_generated',
          materialId: mid,
          amount: amt,
          locationId: loc,
          source: src,
          backlogLevel: backlog,
          at: now()
        });
        return true;
      }, 'envCapacity:generateScrap');
    }

    return {
      ok: true,
      materialId: mid,
      locationId: loc,
      source: src,
      scrapAdded: amt,
      currentScrap: newAmount,
      backlogLevel: backlog,
      congested: backlog !== 'normal'
    };
  }

  /**
   * 将积压废料投入回收工位，经过劳动与损耗转换为再生材料回流库存。
   * 严格遵守物质守恒：produced = floor(scrap * yieldRate), loss = scrap - produced
   */
  function recycleScrap(materialId, amount, worker, facilityId, opts) {
    var mid = clean(materialId, 60);
    var amt = num(amount);
    var wkr = clean(worker, 60);
    var fac = clean(facilityId, 60) || 'workshop';
    var o = opts || {};
    var loc = clean(o.locationId, 60) || 'default_site';

    if (!mid) return { ok: false, reason: 'missing-material-id' };
    if (amt === null || amt <= 0) return { ok: false, reason: 'invalid-amount' };
    if (!wkr) return { ok: false, reason: 'missing-worker' };

    var bk = ensureBucket();
    var mat = (bk.materials || {})[mid];
    if (!mat && DEFAULT_RECYCLABLE[mid]) {
      declareRecyclableMaterial(mid, DEFAULT_RECYCLABLE[mid]);
      bk = ensureBucket();
      mat = (bk.materials || {})[mid];
    }
    if (!mat) return { ok: false, reason: 'unrecognized-material' };

    var scrapKey = loc + '::' + mid;
    var curScrap = ((bk.scraps || {})[scrapKey]) || { scrapAmount: 0, totalRecycled: 0 };
    if (curScrap.scrapAmount < amt) {
      return {
        ok: false,
        reason: 'insufficient-scrap',
        available: curScrap.scrapAmount,
        requested: amt
      };
    }

    // 严密计算物质守恒
    var produced = Math.floor(amt * mat.yieldRate);
    var loss = amt - produced;
    var remaining = curScrap.scrapAmount - amt;
    var newTotalRecycled = (curScrap.totalRecycled || 0) + amt;
    var backlog = computeBacklogLevel(remaining);

    // 回收回流库存：若启用了经济库存且明确指示入库，回流到 economy.stock
    var stockFeedback = null;
    if (o.returnToStock && WA.economy && typeof WA.economy.stock === 'function' && produced > 0) {
      try {
        var goodName = clean(o.goodName, 40) || mat.name || mid;
        stockFeedback = WA.economy.stock(goodName, produced, o.basePrice || 10);
      } catch (e) {
        stockFeedback = { error: String(e) };
      }
    }

    var record = {
      locationId: loc,
      materialId: mid,
      scrapAmount: remaining,
      totalGenerated: curScrap.totalGenerated || 0,
      totalRecycled: newTotalRecycled,
      backlogLevel: backlog,
      lastUpdated: now()
    };

    var recycleLogEntry = {
      action: 'scrap_recycled',
      materialId: mid,
      locationId: loc,
      scrapConsumed: amt,
      produced: produced,
      loss: loss,
      worker: wkr,
      facilityId: fac,
      at: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.envCapacity = d.envCapacity || { resources: {}, log: [] };
        d.envCapacity.scraps = d.envCapacity.scraps || {};
        d.envCapacity.scraps[scrapKey] = record;
        d.envCapacity.recycleLog = d.envCapacity.recycleLog || [];
        d.envCapacity.recycleLog.push(recycleLogEntry);
        d.envCapacity.log.push(recycleLogEntry);
        return true;
      }, 'envCapacity:recycleScrap');
    }

    return {
      ok: true,
      materialId: mid,
      locationId: loc,
      worker: wkr,
      facilityId: fac,
      scrapConsumed: amt,
      producedAmount: produced,
      lossAmount: loss,
      remainingScrap: remaining,
      backlogLevel: backlog,
      yieldRate: mat.yieldRate,
      stockFeedback: stockFeedback,
      note: '废料回收完成，产出物资按损耗回流'
    };
  }

  /**
   * 纯读查询：材料全生命周期概况、地点积压与回收效能对比。
   * 严格纯读零写入。
   */
  function materialLifecycle(materialId, locationId) {
    var mid = clean(materialId, 60);
    var loc = clean(locationId, 60);
    var bk = ensureBucket();
    var mat = mid ? ((bk.materials || {})[mid] || DEFAULT_RECYCLABLE[mid] || null) : null;

    var scrapList = [];
    var allScraps = bk.scraps || {};
    Object.keys(allScraps).forEach(function (k) {
      var item = allScraps[k];
      if (!item) return;
      if (mid && item.materialId !== mid) return;
      if (loc && item.locationId !== loc) return;
      scrapList.push({
        locationId: item.locationId,
        materialId: item.materialId,
        scrapAmount: item.scrapAmount,
        totalGenerated: item.totalGenerated,
        totalRecycled: item.totalRecycled,
        backlogLevel: item.backlogLevel
      });
    });

    var totalCurrentScrap = scrapList.reduce(function (sum, x) { return sum + (x.scrapAmount || 0); }, 0);
    var totalRecycledSoFar = scrapList.reduce(function (sum, x) { return sum + (x.totalRecycled || 0); }, 0);

    return {
      ok: true,
      materialId: mid || 'all',
      locationId: loc || 'all',
      materialSpec: mat ? {
        name: mat.name,
        yieldRate: mat.yieldRate,
        unitCost: mat.unitCost,
        facilityType: mat.facilityType
      } : null,
      scraps: scrapList,
      totalCurrentScrap: totalCurrentScrap,
      totalRecycled: totalRecycledSoFar,
      efficiencyComparison: mat ? {
        rawEfficiency: 1.0,
        recycledEfficiency: mat.yieldRate,
        lossPerUnit: Number((1.0 - mat.yieldRate).toFixed(2))
      } : null,
      hasChokedBacklog: scrapList.some(function (x) { return x.backlogLevel === 'choked'; })
    };
  }

  WA.envCapacity = {
    declareResource: declareResource,
    withdraw: withdraw,
    regenerate: regenerate,
    regionStatus: regionStatus,
    evaluateImpact: evaluateImpact,
    declareRecyclableMaterial: declareRecyclableMaterial,
    generateScrap: generateScrap,
    recycleScrap: recycleScrap,
    materialLifecycle: materialLifecycle,
    RESOURCE_TYPES: RESOURCE_TYPES.slice(),
    STRAIN_LEVELS: STRAIN_LEVELS.slice()
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/environmental-capacity.js', { kind: 'engine', ver: '2.231.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/environmental-capacity 已加载（2.231.0）');
  }
})();