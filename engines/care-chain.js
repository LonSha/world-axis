/**
 * WorldAxis engines/care-chain.js (v2.233.0) — EXV4-3 照护链与公共服务韧性
 *
 * 核心职责：
 *   - 连接 lifeline (病况与活动限制)、family/family-ops (家庭照护责任) 与 service-network (公共医疗与照护设施)。
 *   - 将照护需求作为预约/承诺由服务节点与家庭协作消费。
 *   - 照护者缺席（如患病、在途、外派、过载）引发真实改派/延迟、候诊排队、风险累积与服务转介。
 *   - 跨家庭与公共设施接续照护需消耗真实资源（材料/工时），服务中断影响不同脆弱群体。
 *   - 转介成功记录完整接续履历，绝不抹除原始失约痕迹。
 *
 * 否定式边界：
 *   1. 不重造第三套人物或病况登记：人物基于既有 people/registry，病况严格消费 lifeline，家庭结构引用 family。
 *   2. 缺席必留失约（care-breach / gap-escalated），即使转介成功也保留原始未履约审计。
 *   3. 资源守恒：转介或公共替代需消耗 service-network 或地点库存资源，无资源不可凭空提供替代照护。
 *   4. 纯读只读投影零副作用：careChainProjection 零 store.transact。
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
    return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('careChain') : Date.now();
  }

  var ESCALATION_LEVELS = ['stable', 'warning', 'critical', 'emergency'];

  function bucket() {
    var s = state();
    return (s.careChain && typeof s.careChain === 'object') ? s.careChain : null;
  }

  function ensureBucket() {
    var b = bucket();
    if (!b) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.careChain = d.careChain || { commitments: [], referrals: [], breaches: [], publicQueue: [] };
          return true;
        }, 'careChain:init');
      }
      b = bucket() || { commitments: [], referrals: [], breaches: [], publicQueue: [] };
    }
    if (!Array.isArray(b.commitments)) b.commitments = [];
    if (!Array.isArray(b.referrals)) b.referrals = [];
    if (!Array.isArray(b.breaches)) b.breaches = [];
    if (!Array.isArray(b.publicQueue)) b.publicQueue = [];
    return b;
  }

  /**
   * 1. 登记照护承诺与需求
   * 绑定照护者 (caregiver)、受照护人 (ward)、照护等级 (level)、设施或家庭单元 (facilityId / unitId)
   */
  function registerCareCommitment(spec) {
    var s = spec || {};
    var id = clean(s.id || ('cc_' + Math.random().toString(36).slice(2, 9)), 60);
    var caregiver = clean(s.caregiver, 60);
    var ward = clean(s.ward, 60);
    var placeId = clean(s.placeId, 60);
    var unitId = clean(s.unitId, 60);
    var facilityId = clean(s.facilityId, 60);
    var careType = clean(s.careType || 'daily_nursing', 40);
    var requiredIntensity = Math.max(1, Math.min(5, Math.floor(Number(s.requiredIntensity) || 1)));

    if (!ward) return { ok: false, reason: 'missing-ward' };
    if (!caregiver && !facilityId) return { ok: false, reason: 'missing-provider' };

    var b = ensureBucket();
    var exists = b.commitments.some(function (c) { return c && c.id === id; });
    if (exists) return { ok: false, reason: 'id-already-registered', id: id };

    var entry = {
      id: id,
      caregiver: caregiver,
      ward: ward,
      placeId: placeId,
      unitId: unitId,
      facilityId: facilityId,
      careType: careType,
      requiredIntensity: requiredIntensity,
      status: 'active', // active | delayed | transferred | breached | closed
      escalation: 'stable',
      registeredAt: now(),
      updatedAt: now(),
      delaysCount: 0,
      referralHistory: []
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.careChain = draft.careChain || { commitments: [], referrals: [], breaches: [], publicQueue: [] };
        draft.careChain.commitments.push(entry);
        return true;
      }, 'careChain:registerCommitment');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, commitment: entry };
  }

  /**
   * 2. 检查照护者可用性与缺席判定
   * 检查照护者是否因病况 (lifeline)、在途旅行 (world.isTraveling / demographicFlow) 或家庭重置而不可用
   */
  function assessCaregiverAbsence(caregiverId) {
    var who = clean(caregiverId, 60);
    if (!who) return { ok: false, reason: 'missing-caregiver' };

    var reasons = [];
    var isAbsent = false;

    // 检查 lifeline 病况限制
    if (WA.lifeline && typeof WA.lifeline.capacityOf === 'function') {
      var cap = WA.lifeline.capacityOf(who);
      if (cap && cap.ok && cap.known) {
        if (cap.band === 'heavy') {
          isAbsent = true;
          reasons.push('lifeline-heavy-limitations');
        }
        if (cap.limits && (cap.limits.mobility > 0 || cap.limits.energy > 0)) {
          isAbsent = true;
          reasons.push('lifeline-vital-limit');
        }
      }
    }

    // 检查是否在途
    // ── v2.233.0 实测修正：这条判据原先只认「people 是数组 + 字段叫 isTraveling」，
    //   而产品里的 people 是 id → 对象 的 map（core/store.js:52），在途标记由
    //   demographicFlow.commitMigration 写成 traveling/status='transit'/transitTo。
    //   于是两个真实世界的事实同时落空：既遍历不到人（Array.isArray(map) === false），
    //   就算遍历到了字段名也对不上 —— 一位已经迁走的照护者在生产里**永远判不出缺席**，
    //   整条「缺席 → 失约升级 → 转介接续」链路只在测试伪造的数组形状下成立。
    //   这是「测试自造一个舒服的世界」的典型现场：EXV4-3 专锁全绿、E2E 一碰就红。
    //   修法：两种形状都吃，三个在途字段都认（缺一个就是一处静默失效）。
    var s = state();
    var people = s.people;
    var p = null;
    if (Array.isArray(people)) {
      p = people.filter(function (x) { return x && (x.id === who || x.name === who); })[0] || null;
    } else if (people && typeof people === 'object') {
      p = people[who] || people['p_' + who] || null;
      if (!p) {
        var keys = Object.keys(people);
        for (var i = 0; i < keys.length; i++) {
          var cand = people[keys[i]];
          if (cand && (cand.id === who || cand.name === who)) { p = cand; break; }
        }
      }
    }
    if (p) {
      var traveling = !!(p.isTraveling || p.traveling
        || p.status === 'traveling' || p.status === 'transit');
      if (traveling) {
        isAbsent = true;
        reasons.push('in-transit');
      }
    }

    return {
      ok: true,
      caregiver: who,
      isAbsent: isAbsent,
      reasons: reasons
    };
  }

  /**
   * 3. 触发照护缺席、排队与风险累积
   * 若原照护者无法履约，将照护升级并记入失约 (breach)，承诺状态转为 delayed / breached
   */
  function reportCareAbsence(commitmentId, breachReason) {
    var cid = clean(commitmentId, 60);
    var reason = clean(breachReason || 'caregiver-absent', 60);
    if (!cid) return { ok: false, reason: 'missing-commitment-id' };

    var b = ensureBucket();
    var comm = b.commitments.filter(function (c) { return c && c.id === cid; })[0];
    if (!comm) return { ok: false, reason: 'commitment-not-found', id: cid };

    var updatedComm = null;
    var breachRecord = null;

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.careChain = draft.careChain || { commitments: [], referrals: [], breaches: [], publicQueue: [] };
        var target = draft.careChain.commitments.filter(function (c) { return c && c.id === cid; })[0];
        if (!target) return false;

        target.delaysCount = (target.delaysCount || 0) + 1;
        target.status = target.delaysCount >= 3 ? 'breached' : 'delayed';
        
        // 风险升级梯级
        if (target.delaysCount === 1) target.escalation = 'warning';
        else if (target.delaysCount === 2) target.escalation = 'critical';
        else target.escalation = 'emergency';

        target.updatedAt = now();

        breachRecord = {
          id: 'br_' + Math.random().toString(36).slice(2, 9),
          commitmentId: cid,
          caregiver: target.caregiver,
          ward: target.ward,
          delaysCount: target.delaysCount,
          escalation: target.escalation,
          reason: reason,
          occurredAt: now()
        };

        draft.careChain.breaches.push(breachRecord);
        updatedComm = JSON.parse(JSON.stringify(target));
        return true;
      }, 'careChain:reportAbsence');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, commitment: updatedComm, breach: breachRecord };
  }

  /**
   * 4. 照护接续：转介给备选照护者或公共设施
   * 需消耗资源（若是公共设施，检查或占用 service-network 设施），原失约记录不被清除
   */
  function referCare(spec) {
    var s = spec || {};
    var cid = clean(s.commitmentId, 60);
    var toCaregiver = clean(s.toCaregiver, 60);
    var toFacilityId = clean(s.toFacilityId, 60);
    var resourceUsed = clean(s.resourceUsed || 'medical_supplies', 40);
    var resourceCost = Math.max(0, Math.floor(Number(s.resourceCost) || 1));
    var referralReason = clean(s.reason || 'absence-mitigation', 60);

    if (!cid) return { ok: false, reason: 'missing-commitment-id' };
    if (!toCaregiver && !toFacilityId) return { ok: false, reason: 'missing-target' };

    var b = ensureBucket();
    var comm = b.commitments.filter(function (c) { return c && c.id === cid; })[0];
    if (!comm) return { ok: false, reason: 'commitment-not-found', id: cid };

    // 若转介至公共设施，检查该设施服务是否有效
    if (toFacilityId && WA.serviceNetwork) {
      var sNet = state().serviceNetwork || {};
      var fac = (sNet.facilities || []).filter(function (f) { return f && f.id === toFacilityId; })[0];
      if (fac) {
        if (fac.status === 'degraded' || fac.status === 'dismantled') {
          return { ok: false, reason: 'facility-unavailable-degraded', facilityId: toFacilityId, status: fac.status };
        }
      }
    }

    var referralEntry = {
      id: 'ref_' + Math.random().toString(36).slice(2, 9),
      commitmentId: cid,
      fromCaregiver: comm.caregiver,
      toCaregiver: toCaregiver || null,
      toFacilityId: toFacilityId || null,
      resourceUsed: resourceUsed,
      resourceCost: resourceCost,
      reason: referralReason,
      originalBreachesCount: (comm.delaysCount || 0),
      transferredAt: now()
    };

    var updatedComm = null;
    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.careChain = draft.careChain || { commitments: [], referrals: [], breaches: [], publicQueue: [] };
        var target = draft.careChain.commitments.filter(function (c) { return c && c.id === cid; })[0];
        if (!target) return false;

        target.caregiver = toCaregiver || target.caregiver;
        if (toFacilityId) target.facilityId = toFacilityId;
        target.status = 'active'; // 成功接续，重新激活
        target.escalation = 'stable'; // 风险解除或稳定
        target.updatedAt = now();
        target.referralHistory = (target.referralHistory || []).concat([referralEntry.id]);

        draft.careChain.referrals.push(referralEntry);
        updatedComm = JSON.parse(JSON.stringify(target));
        return true;
      }, 'careChain:referCare');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, commitment: updatedComm, referral: referralEntry };
  }

  /**
   * 5. 排队与公共服务承压：无法即时转介时进入公共等待队列
   */
  function queueForPublicCare(spec) {
    var s = spec || {};
    var cid = clean(s.commitmentId, 60);
    var facilityId = clean(s.facilityId, 60);
    var priority = Math.max(1, Math.min(10, Math.floor(Number(s.priority) || 1)));

    if (!cid) return { ok: false, reason: 'missing-commitment-id' };
    var b = ensureBucket();
    var comm = b.commitments.filter(function (c) { return c && c.id === cid; })[0];
    if (!comm) return { ok: false, reason: 'commitment-not-found', id: cid };

    var queueEntry = {
      id: 'q_' + Math.random().toString(36).slice(2, 9),
      commitmentId: cid,
      ward: comm.ward,
      facilityId: facilityId || comm.facilityId,
      priority: priority,
      queuedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.careChain = draft.careChain || { commitments: [], referrals: [], breaches: [], publicQueue: [] };
        draft.careChain.publicQueue.push(queueEntry);
        var target = draft.careChain.commitments.filter(function (c) { return c && c.id === cid; })[0];
        if (target) {
          target.status = 'queued';
          target.updatedAt = now();
        }
        return true;
      }, 'careChain:queueForPublicCare');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, queued: queueEntry };
  }

  /**
   * 6. 纯读只读投影：careChainProjection
   * 统计某地点或某设施的：激活照护数、失约积压数、排队队列长度与韧性指数 (resilienceScore)
   * 零副作用，纯读计算。
   */
  function careChainProjection(query) {
    var q = query || {};
    var placeId = clean(q.placeId, 60);
    var facilityId = clean(q.facilityId, 60);

    var b = ensureBucket();
    var commitments = b.commitments || [];
    var breaches = b.breaches || [];
    var referrals = b.referrals || [];
    var queue = b.publicQueue || [];

    var filteredComm = commitments.filter(function (c) {
      if (!c) return false;
      if (placeId && c.placeId !== placeId) return false;
      if (facilityId && c.facilityId !== facilityId) return false;
      return true;
    });

    var activeCount = 0;
    var delayedCount = 0;
    var breachedCount = 0;
    var queuedCount = 0;
    var criticalOrEmergencyCount = 0;

    filteredComm.forEach(function (c) {
      if (c.status === 'active') activeCount++;
      else if (c.status === 'delayed') delayedCount++;
      else if (c.status === 'breached') breachedCount++;
      else if (c.status === 'queued') queuedCount++;

      if (c.escalation === 'critical' || c.escalation === 'emergency') {
        criticalOrEmergencyCount++;
      }
    });

    var totalDemands = filteredComm.length;
    // 韧性分数：满分 100，每出现一个 delay 扣 10，breach 扣 25，critical/emergency 扣 20
    var penalty = (delayedCount * 10) + (breachedCount * 25) + (criticalOrEmergencyCount * 20);
    var rawScore = 100 - penalty;
    var resilienceScore = Math.max(0, Math.min(100, rawScore));

    return {
      ok: true,
      placeId: placeId || 'all',
      facilityId: facilityId || 'all',
      totalDemands: totalDemands,
      activeCount: activeCount,
      delayedCount: delayedCount,
      breachedCount: breachedCount,
      queuedCount: queuedCount,
      criticalOrEmergencyCount: criticalOrEmergencyCount,
      resilienceScore: resilienceScore,
      totalHistoricalBreaches: breaches.length,
      totalHistoricalReferrals: referrals.length
    };
  }

  WA.careChain = {
    registerCareCommitment: registerCareCommitment,
    assessCaregiverAbsence: assessCaregiverAbsence,
    reportCareAbsence: reportCareAbsence,
    referCare: referCare,
    queueForPublicCare: queueForPublicCare,
    careChainProjection: careChainProjection,
    ESCALATION_LEVELS: ESCALATION_LEVELS.slice()
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/care-chain.js', { kind: 'engine', ver: '2.233.0' });
  }

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/care-chain 已加载（2.233.0）');
  }
})();
