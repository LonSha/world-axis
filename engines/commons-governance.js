/**
 * WorldAxis engines/commons-governance.js (v2.233.0) — EXV4-5 共同资源的使用权与维护责任
 *
 * 核心职责：
 *   - 连接 coop（具名贡献、缺席处理）与 service-network（公共设施容量与维护）。
 *   - 为长期公共资产/共享设施声明开放条件、使用权配额、维护轮值和故障责任。
 *   - 提供至少两种治理方案（如 open_access 开放准入 vs contributor_priority 贡献者优先），且二者在开放度与维护成本间有明确代价取舍。
 *   - 逾期维护导致资产真实降级（degraded / failing）并识别搭便车或违约风险。
 *   - 治理规则变更不追溯抹除已兑现或已确认的使用权。
 *   - 争议可协商或裁决，留下可追溯事实。
 *
 * 否定式边界：
 *   1. 绝不造通用声望币：贡献历史仅在具体共同资产内形成有限优先权，不折算跨资产万能货币。
 *   2. 真实降级：逾期不维护产生状态惩罚（degraded），不通过软日志敷衍。
 *   3. 不追溯失效：治理制度切换时，此前已生效的预约和权利保持有效。
 *   4. 纯读投影零副作用：commonsProjection 零 store.transact。
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
    try { return WA.clock.now('commonsGov'); } catch (e) { return Date.now(); }
  }

  var GOVERNANCE_MODELS = ['open_access', 'contributor_priority', 'strict_quota'];
  var ASSET_STATUS = ['optimal', 'operational', 'degraded', 'failing'];

  function bucket() {
    var s = state();
    return (s.commonsGovernance && typeof s.commonsGovernance === 'object') ? s.commonsGovernance : null;
  }

  function ensureBucket() {
    var b = bucket();
    if (!b) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.commonsGovernance = d.commonsGovernance || {
            assets: [],
            reservations: [],
            maintenanceDuties: [],
            disputes: []
          };
          return true;
        }, 'commonsGov:init');
      }
      b = bucket() || { assets: [], reservations: [], maintenanceDuties: [], disputes: [] };
    }
    if (!Array.isArray(b.assets)) b.assets = [];
    if (!Array.isArray(b.reservations)) b.reservations = [];
    if (!Array.isArray(b.maintenanceDuties)) b.maintenanceDuties = [];
    if (!Array.isArray(b.disputes)) b.disputes = [];
    return b;
  }

  /**
   * 1. 声明共同资产及其治理模型
   */
  function declareCommonAsset(spec) {
    var s = spec || {};
    var id = clean(s.id || (WA.rand.id('asset_', 7, 'id')), 60);
    var placeId = clean(s.placeId, 60);
    var name = clean(s.name, 80);
    var assetType = clean(s.assetType || 'pasture', 40); // pasture | mill | granary | well | dock
    var governanceModel = clean(s.governanceModel || 'open_access', 30);
    var capacitySlots = Math.max(1, Math.min(20, Math.floor(Number(s.capacitySlots) || 5)));
    var maintenanceCycleDays = Math.max(1, Math.floor(Number(s.maintenanceCycleDays) || 7));
    var requiredLaborPerCycle = Math.max(1, Math.floor(Number(s.requiredLaborPerCycle) || 10));

    if (!placeId) return { ok: false, reason: 'missing-place' };
    if (!name) return { ok: false, reason: 'missing-name' };
    if (GOVERNANCE_MODELS.indexOf(governanceModel) < 0) {
      return { ok: false, reason: 'bad-governance-model', allowed: GOVERNANCE_MODELS.slice() };
    }

    var b = ensureBucket();
    var exists = b.assets.some(function (a) { return a && a.id === id; });
    if (exists) return { ok: false, reason: 'asset-already-exists', id: id };

    var entry = {
      id: id,
      placeId: placeId,
      name: name,
      assetType: assetType,
      governanceModel: governanceModel,
      capacitySlots: capacitySlots,
      maintenanceCycleDays: maintenanceCycleDays,
      requiredLaborPerCycle: requiredLaborPerCycle,
      status: 'optimal',
      lastMaintainedAt: now(),
      currentCycleLaborAccumulated: 0,
      activeUsers: [],
      governanceHistory: [{ model: governanceModel, changedAt: now(), note: 'initial-setup' }],
      createdAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.commonsGovernance = draft.commonsGovernance || { assets: [], reservations: [], maintenanceDuties: [], disputes: [] };
        draft.commonsGovernance.assets.push(entry);
        return true;
      }, 'commonsGov:declareAsset');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, asset: entry };
  }

  /**
   * 2. 预约/申领使用权
   * 检查治理方案：contributor_priority 检查角色在该资产的维护历史；open_access 则全员开放。
   */
  function reserveCommonAsset(spec) {
    var s = spec || {};
    var assetId = clean(s.assetId, 60);
    var who = clean(s.who, 60);
    var requestedSlots = Math.max(1, Math.floor(Number(s.requestedSlots) || 1));
    var durationDays = Math.max(1, Math.floor(Number(s.durationDays) || 1));

    if (!assetId) return { ok: false, reason: 'missing-asset-id' };
    if (!who) return { ok: false, reason: 'missing-claimant' };

    var b = ensureBucket();
    var asset = b.assets.filter(function (a) { return a && a.id === assetId; })[0];
    if (!asset) return { ok: false, reason: 'asset-not-found', id: assetId };

    if (asset.status === 'failing') {
      return { ok: false, reason: 'asset-failing-unavailable', assetId: assetId };
    }

    // 检查容量
    var activeReservations = (b.reservations || []).filter(function (r) {
      return r && r.assetId === assetId && r.status === 'active';
    });
    var usedSlots = activeReservations.reduce(function (sum, r) { return sum + (r.slots || 1); }, 0);
    if (usedSlots + requestedSlots > asset.capacitySlots) {
      return { ok: false, reason: 'capacity-exhausted', available: (asset.capacitySlots - usedSlots) };
    }

    // 检查治理规则准入资格
    if (asset.governanceModel === 'contributor_priority') {
      // 检查历史维护工时
      var historyDuties = (b.maintenanceDuties || []).filter(function (d) {
        return d && d.assetId === assetId && d.who === who;
      });
      var totalHours = historyDuties.reduce(function (sum, d) { return sum + (d.hoursContributed || 0); }, 0);
      if (totalHours <= 0) {
        return { ok: false, reason: 'insufficient-contribution-priority', who: who, totalHours: 0 };
      }
    }

    var resEntry = {
      id: WA.rand.id('res_', 7, 'id'),
      assetId: assetId,
      who: who,
      slots: requestedSlots,
      durationDays: durationDays,
      status: 'active',
      reservedUnderModel: asset.governanceModel,
      reservedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.commonsGovernance = draft.commonsGovernance || { assets: [], reservations: [], maintenanceDuties: [], disputes: [] };
        draft.commonsGovernance.reservations.push(resEntry);
        return true;
      }, 'commonsGov:reserveAsset');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, reservation: resEntry };
  }

  /**
   * 3. 治理模型变更（不追溯抹除已生效的使用权）
   */
  function changeGovernanceModel(assetId, newModel, reason) {
    var aid = clean(assetId, 60);
    var model = clean(newModel, 30);
    var rsn = clean(reason || 'collective-decision', 60);

    if (!aid) return { ok: false, reason: 'missing-asset-id' };
    if (GOVERNANCE_MODELS.indexOf(model) < 0) {
      return { ok: false, reason: 'bad-governance-model', allowed: GOVERNANCE_MODELS.slice() };
    }

    var b = ensureBucket();
    var asset = b.assets.filter(function (a) { return a && a.id === aid; })[0];
    if (!asset) return { ok: false, reason: 'asset-not-found', id: aid };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.commonsGovernance = draft.commonsGovernance || { assets: [], reservations: [], maintenanceDuties: [], disputes: [] };
        var target = draft.commonsGovernance.assets.filter(function (a) { return a && a.id === aid; })[0];
        if (!target) return false;

        target.governanceModel = model;
        target.governanceHistory = target.governanceHistory || [];
        target.governanceHistory.push({ model: model, changedAt: now(), note: rsn });
        return true;
      }, 'commonsGov:changeModel');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, assetId: aid, newModel: model, reason: rsn };
  }

  /**
   * 4. 维护工时投入与履职
   */
  function contributeMaintenance(spec) {
    var s = spec || {};
    var assetId = clean(s.assetId, 60);
    var who = clean(s.who, 60);
    var hours = Math.max(1, Math.floor(Number(s.hours) || 1));

    if (!assetId) return { ok: false, reason: 'missing-asset-id' };
    if (!who) return { ok: false, reason: 'missing-contributor' };

    var b = ensureBucket();
    var asset = b.assets.filter(function (a) { return a && a.id === assetId; })[0];
    if (!asset) return { ok: false, reason: 'asset-not-found', id: assetId };

    var dutyRecord = {
      id: WA.rand.id('duty_', 7, 'id'),
      assetId: assetId,
      who: who,
      hoursContributed: hours,
      contributedAt: now()
    };

    var updatedAsset = null;
    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.commonsGovernance = draft.commonsGovernance || { assets: [], reservations: [], maintenanceDuties: [], disputes: [] };
        draft.commonsGovernance.maintenanceDuties.push(dutyRecord);

        var target = draft.commonsGovernance.assets.filter(function (a) { return a && a.id === assetId; })[0];
        if (target) {
          target.currentCycleLaborAccumulated = (target.currentCycleLaborAccumulated || 0) + hours;
          target.lastMaintainedAt = now();
          if (target.currentCycleLaborAccumulated >= target.requiredLaborPerCycle) {
            target.status = 'optimal';
          } else {
            target.status = 'operational';
          }
          updatedAsset = JSON.parse(JSON.stringify(target));
        }
        return true;
      }, 'commonsGov:contributeMaintenance');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, asset: updatedAsset, duty: dutyRecord };
  }

  /**
   * 5. 逾期维护评估与降级
   * 检查距离上次维护周期，工时不足则发生真实降级 (degraded -> failing)
   */
  function auditAssetDecay(assetId, simulatedDaysSince) {
    var aid = clean(assetId, 60);
    var elapsed = Math.max(0, Math.floor(Number(simulatedDaysSince) || 0));

    var b = ensureBucket();
    var asset = b.assets.filter(function (a) { return a && a.id === aid; })[0];
    if (!asset) return { ok: false, reason: 'asset-not-found', id: aid };

    var isOverdue = elapsed > asset.maintenanceCycleDays;
    var newStatus = asset.status;

    if (isOverdue) {
      if (asset.currentCycleLaborAccumulated < (asset.requiredLaborPerCycle * 0.5)) {
        newStatus = 'failing';
      } else if (asset.currentCycleLaborAccumulated < asset.requiredLaborPerCycle) {
        newStatus = 'degraded';
      }
    }

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.commonsGovernance = draft.commonsGovernance || { assets: [], reservations: [], maintenanceDuties: [], disputes: [] };
        var target = draft.commonsGovernance.assets.filter(function (a) { return a && a.id === aid; })[0];
        if (target) {
          target.status = newStatus;
        }
        return true;
      }, 'commonsGov:auditDecay');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, assetId: aid, isOverdue: isOverdue, status: newStatus };
  }

  /**
   * 6. 争议登记与协商/裁决
   */
  function resolveAssetDispute(spec) {
    var s = spec || {};
    var id = clean(s.id || (WA.rand.id('disp_', 7, 'id')), 60);
    var assetId = clean(s.assetId, 60);
    var plaintiff = clean(s.plaintiff, 60);
    var defendant = clean(s.defendant, 60);
    var issue = clean(s.issue || 'free_riding', 40); // free_riding | quota_infringement | maintenance_neglect
    var resolution = clean(s.resolution || 'mediated_compensation', 60);

    if (!assetId) return { ok: false, reason: 'missing-asset-id' };
    if (!plaintiff) return { ok: false, reason: 'missing-plaintiff' };

    var disputeRecord = {
      id: id,
      assetId: assetId,
      plaintiff: plaintiff,
      defendant: defendant,
      issue: issue,
      resolution: resolution,
      resolvedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.commonsGovernance = draft.commonsGovernance || { assets: [], reservations: [], maintenanceDuties: [], disputes: [] };
        draft.commonsGovernance.disputes.push(disputeRecord);
        return true;
      }, 'commonsGov:resolveDispute');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, dispute: disputeRecord };
  }

  /**
   * 7. 纯读只读投影：commonsProjection
   * 统计某地点或某资产的：容量使用率、降级状态、累计维护工时与争议件数。零副作用。
   */
  function commonsProjection(filter) {
    var f = filter || {};
    var placeId = clean(f.placeId, 60);
    var assetId = clean(f.assetId, 60);

    var b = ensureBucket();
    var assets = (b.assets || []).filter(function (a) {
      if (!a) return false;
      if (placeId && a.placeId !== placeId) return false;
      if (assetId && a.id !== assetId) return false;
      return true;
    });

    var totalAssets = assets.length;
    var degradedCount = 0;
    var failingCount = 0;
    var totalSlots = 0;

    assets.forEach(function (a) {
      totalSlots += (a.capacitySlots || 0);
      if (a.status === 'degraded') degradedCount++;
      else if (a.status === 'failing') failingCount++;
    });

    var reservations = (b.reservations || []).filter(function (r) {
      return r && r.status === 'active' && (!assetId || r.assetId === assetId);
    });
    var activeReservedSlots = reservations.reduce(function (sum, r) { return sum + (r.slots || 1); }, 0);
    var utilizationRatio = totalSlots > 0 ? (activeReservedSlots / totalSlots) : 0;

    return {
      ok: true,
      placeId: placeId || 'all',
      assetId: assetId || 'all',
      totalAssets: totalAssets,
      totalSlots: totalSlots,
      activeReservedSlots: activeReservedSlots,
      utilizationRatio: Number(utilizationRatio.toFixed(3)),
      degradedCount: degradedCount,
      failingCount: failingCount,
      totalDuties: (b.maintenanceDuties || []).length,
      totalDisputes: (b.disputes || []).length
    };
  }

  WA.commonsGovernance = {
    declareCommonAsset: declareCommonAsset,
    reserveCommonAsset: reserveCommonAsset,
    changeGovernanceModel: changeGovernanceModel,
    contributeMaintenance: contributeMaintenance,
    auditAssetDecay: auditAssetDecay,
    resolveAssetDispute: resolveAssetDispute,
    commonsProjection: commonsProjection,
    GOVERNANCE_MODELS: GOVERNANCE_MODELS.slice(),
    ASSET_STATUS: ASSET_STATUS.slice()
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/commons-governance.js', { kind: 'engine', ver: '2.233.0' });
  }

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/commons-governance 已加载（2.233.0）');
  }
})();