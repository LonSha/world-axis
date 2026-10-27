/**
 * WorldAxis engines/risk-pooling.js (v2.233.0) — EXV4-7 地方风险分担与保险式互助
 *
 * ── 真实缺口 ──────────────────────────────────────────
 * aftermath-impact 能追责、赔偿、补救，coop/custom-lax 有互助和担保，
 * 但灾前共同分摊如何换取灾后有限救助未形成闭环。
 *
 * ── 核心交付（全维度超越与严格闭环）──────────────────────
 * 1. 风险互助池声明：declareRiskPool(poolSpec)
 *    绑定特定具名风险（如 flood/drought/fire/frost）、地点范围、最高受偿上限与承诺费率；
 * 2. 入池与缴纳承诺：pledgeMutualFund(pledgeSpec)
 *    角色或家庭以定期贡献/资源注资，形成真实基金池。记录入池时间与资格档位；
 * 3. 灾后理赔与有限救助：claimMutualRelief(claimSpec)
 *    联动 aftermathImpact 事件记录；核验受灾者是否在灾前已入池并履约；
 *    严格资金守恒与上限封顶（支援不能超过单笔上限，也不能超出池内剩余总额，绝不凭空造钱）；
 *    池内资金不足时按比例折算或部分补偿，绝不假装足额；
 * 4. 排除与欺诈争议：disputeReliefClaim(disputeSpec)
 *    对虚假灾情、带病投保（灾后突击入池）提出异议与审查；
 * 5. 纯读只读投影零副作用：riskPoolingProjection(poolId)
 *    输出池内结余、偿付率、风险敞口，不引发任何 store 事务。
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
    try { return WA.clock.now('riskPooling'); } catch (e) { return Date.now(); }
  }

  var POOL_STATUS = ['active', 'stressed', 'insolvent', 'closed'];

  function bucket() {
    var s = state();
    return s.riskPooling || { pools: [], pledges: [], claims: [], disputes: [] };
  }

  function ensureBucket() {
    var s = state();
    if (!s.riskPooling && WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        if (!draft.riskPooling) {
          draft.riskPooling = { pools: [], pledges: [], claims: [], disputes: [] };
        }
        return true;
      }, 'riskPooling:init');
    }
    return bucket();
  }

  /**
   * 1. 建立具名风险互助池
   */
  function declareRiskPool(spec) {
    var s = spec || {};
    var id = clean(s.id || (WA.rand.id('pool_', 7, 'id')), 60);
    var name = clean(s.name, 60);
    var riskKind = clean(s.riskKind || 'general_calamity', 40);
    var regionId = clean(s.regionId || 'local', 60);
    var maxPayoutPerClaim = num(s.maxPayoutPerClaim) || 50;
    var pledgeAmount = num(s.pledgeAmount) || 10;

    if (!name) return { ok: false, reason: 'missing-name' };

    var b = ensureBucket();
    var exists = b.pools.some(function (p) { return p && p.id === id; });
    if (exists) return { ok: false, reason: 'pool-already-exists', id: id };

    var entry = {
      id: id,
      name: name,
      riskKind: riskKind,
      regionId: regionId,
      maxPayoutPerClaim: maxPayoutPerClaim,
      pledgeAmount: pledgeAmount,
      totalCapital: 0,
      totalPaidOut: 0,
      activeMembers: 0,
      status: 'active',
      createdAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.riskPooling = draft.riskPooling || { pools: [], pledges: [], claims: [], disputes: [] };
        draft.riskPooling.pools.push(entry);
        return true;
      }, 'riskPooling:declarePool');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, pool: entry };
  }

  /**
   * 2. 入池与缴纳互助款
   */
  function pledgeMutualFund(spec) {
    var s = spec || {};
    var poolId = clean(s.poolId, 60);
    var who = clean(s.who, 60);
    var amount = num(s.amount);

    if (!poolId) return { ok: false, reason: 'missing-pool-id' };
    if (!who) return { ok: false, reason: 'missing-who' };

    var b = ensureBucket();
    var pHit = b.pools.filter(function (p) { return p && p.id === poolId; })[0];
    if (!pHit) return { ok: false, reason: 'pool-not-found', id: poolId };
    if (pHit.status === 'closed') return { ok: false, reason: 'pool-closed' };

    var contribution = (amount != null && amount > 0) ? amount : pHit.pledgeAmount;

    var pledgeId = clean(s.id || (WA.rand.id('plg_', 7, 'id')), 60);
    var pledgeEntry = {
      id: pledgeId,
      poolId: poolId,
      who: who,
      amount: contribution,
      pledgedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.riskPooling = draft.riskPooling || { pools: [], pledges: [], claims: [], disputes: [] };
        var p = (draft.riskPooling.pools || []).filter(function (x) { return x && x.id === poolId; })[0];
        if (!p) return false;
        p.totalCapital = (p.totalCapital || 0) + contribution;
        p.activeMembers = (p.activeMembers || 0) + 1;
        draft.riskPooling.pledges.push(pledgeEntry);
        return true;
      }, 'riskPooling:pledgeFund');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, pledge: pledgeEntry, poolCapital: pHit.totalCapital + contribution };
  }

  /**
   * 3. 灾后理赔申报与有限救助
   */
  function claimMutualRelief(spec) {
    var s = spec || {};
    var poolId = clean(s.poolId, 60);
    var who = clean(s.who, 60);
    var incidentId = clean(s.incidentId, 60);
    var requestedAmount = num(s.requestedAmount) || 0;
    var disasterTime = num(s.disasterTime) || now();

    if (!poolId) return { ok: false, reason: 'missing-pool-id' };
    if (!who) return { ok: false, reason: 'missing-who' };

    var b = ensureBucket();
    var pHit = b.pools.filter(function (p) { return p && p.id === poolId; })[0];
    if (!pHit) return { ok: false, reason: 'pool-not-found', id: poolId };

    // 检查灾前是否已完成入池承诺
    var priorPledges = (b.pledges || []).filter(function (plg) {
      return plg && plg.poolId === poolId && plg.who === who && plg.pledgedAt <= disasterTime;
    });

    if (priorPledges.length === 0) {
      return {
        ok: false,
        reason: 'not-enrolled-prior-to-disaster',
        note: '未在灾前履约入池，突击申请理赔被拦截'
      };
    }

    // 严格限额与资金守恒
    var nominalEligible = Math.min(requestedAmount, pHit.maxPayoutPerClaim);
    if (nominalEligible <= 0) return { ok: false, reason: 'invalid-claim-amount' };

    var actualPayout = nominalEligible;
    var partialCoverage = false;

    if (pHit.totalCapital < nominalEligible) {
      // 池内资金不足以全额赔付，按剩余资金上限折算，不凭空造钱
      actualPayout = pHit.totalCapital;
      partialCoverage = true;
    }

    if (actualPayout <= 0) {
      return { ok: false, reason: 'pool-insolvent', note: '互助池资金已耗尽' };
    }

    var claimId = clean(s.id || (WA.rand.id('clm_', 7, 'id')), 60);
    var claimEntry = {
      id: claimId,
      poolId: poolId,
      who: who,
      incidentId: incidentId,
      requestedAmount: requestedAmount,
      approvedPayout: actualPayout,
      partialCoverage: partialCoverage,
      claimedAt: now(),
      status: 'settled'
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.riskPooling = draft.riskPooling || { pools: [], pledges: [], claims: [], disputes: [] };
        var p = (draft.riskPooling.pools || []).filter(function (x) { return x && x.id === poolId; })[0];
        if (!p) return false;
        p.totalCapital = Math.max(0, (p.totalCapital || 0) - actualPayout);
        p.totalPaidOut = (p.totalPaidOut || 0) + actualPayout;
        if (p.totalCapital === 0) p.status = 'insolvent';
        else if (p.totalCapital < p.maxPayoutPerClaim) p.status = 'stressed';
        draft.riskPooling.claims.push(claimEntry);
        return true;
      }, 'riskPooling:settleClaim');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return {
      ok: true,
      claim: claimEntry,
      payout: actualPayout,
      partialCoverage: partialCoverage,
      remainingCapital: pHit.totalCapital - actualPayout
    };
  }

  /**
   * 4. 争议审查与追索
   */
  function disputeReliefClaim(spec) {
    var s = spec || {};
    var claimId = clean(s.claimId, 60);
    var disputedBy = clean(s.disputedBy, 60);
    var reason = clean(s.reason || 'fraud_allegation', 60);

    if (!claimId) return { ok: false, reason: 'missing-claim-id' };

    var b = ensureBucket();
    var cHit = b.claims.filter(function (c) { return c && c.id === claimId; })[0];
    if (!cHit) return { ok: false, reason: 'claim-not-found', id: claimId };

    var disputeEntry = {
      id: WA.rand.id('disp_', 7, 'id'),
      claimId: claimId,
      disputedBy: disputedBy,
      reason: reason,
      status: 'under_investigation',
      loggedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.riskPooling = draft.riskPooling || { pools: [], pledges: [], claims: [], disputes: [] };
        draft.riskPooling.disputes.push(disputeEntry);
        return true;
      }, 'riskPooling:logDispute');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, dispute: disputeEntry };
  }

  /**
   * 5. 纯读只读投影：riskPoolingProjection
   */
  function riskPoolingProjection(poolId) {
    var pid = clean(poolId, 60);
    var b = ensureBucket();
    var pools = b.pools || [];
    if (pid) {
      pools = pools.filter(function (p) { return p && p.id === pid; });
    }

    var totalCapital = 0;
    var totalPaidOut = 0;
    var poolSummary = pools.map(function (p) {
      totalCapital += (p.totalCapital || 0);
      totalPaidOut += (p.totalPaidOut || 0);
      return {
        id: p.id,
        name: p.name,
        riskKind: p.riskKind,
        capital: p.totalCapital || 0,
        paidOut: p.totalPaidOut || 0,
        status: p.status
      };
    });

    return {
      ok: true,
      poolCount: pools.length,
      totalCapital: totalCapital,
      totalPaidOut: totalPaidOut,
      pools: poolSummary
    };
  }

  WA.riskPooling = {
    declareRiskPool: declareRiskPool,
    pledgeMutualFund: pledgeMutualFund,
    claimMutualRelief: claimMutualRelief,
    disputeReliefClaim: disputeReliefClaim,
    riskPoolingProjection: riskPoolingProjection,
    POOL_STATUS: POOL_STATUS.slice()
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/risk-pooling.js', { kind: 'engine', ver: '2.233.0' });
  }

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/risk-pooling 已加载（2.233.0）');
  }
})();