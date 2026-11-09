/**
 * WorldAxis engines/collateral-rupture.js (v2.308.0) — 连带债务穿透与社会信用联合制裁（EXV14-2）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   信用总账（credit-ledger）此前仅记录主借款人单边账目，一旦借款人恶意违约或无力偿还，
 *   既无担保人连带责任追索机制，也无社会信用维度的联合惩戒（黑名单、关系恶化、社会排斥）。
 *   借贷违约无法转化为现实角色间的戏剧性冲突（如被追杀、担保人倾家荡产反水背叛）。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   主债务人逾期违约触发 `ruptureCollateral`：
 *   1. 连带债务穿透：向担保人强制划扣追偿或追加担保人负债；
 *   2. 社会信用降维：主债务人被列入行会黑名单（商贾抵制、买卖加价）；
 *   3. 人际关系反噬：担保人与主债务人亲密度断崖式下跌（-60），触发宗族追讨或报官追捕。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_collateral_rupture_settings_v1';
  const DEF = { enabled: true, maxRecords: 48, defaultPenaltyAffinity: 60, blacklistDurationDays: 30 };
  const __REG = { key: LS_KEY, def: DEF, module: 'collateralRupture' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function store() {
    return WA.store && typeof WA.store.get === 'function' ? WA.store.get() : {};
  }
  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'collateralRupture:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { triggered: 0, penalised: 0, refused: 0, lastReason: '' };

  /**
   * 触发连带违约穿透与制裁
   * @param {object} spec { loanId, borrowerId, guarantorId, defaultAmount, at }
   */
  function ruptureCollateral(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const borrowerId = String(s.borrowerId || '').trim();
    const guarantorId = String(s.guarantorId || '').trim();
    const defaultAmount = Number(s.defaultAmount) || 0;
    const at = Number.isFinite(s.at) ? s.at : clockNow('collateralRupture');

    if (!borrowerId) {
      stat.refused++; stat.lastReason = 'missing-borrower';
      return { ok: false, reason: 'missing-borrower' };
    }
    if (!guarantorId) {
      stat.refused++; stat.lastReason = 'missing-guarantor';
      return { ok: false, reason: 'missing-guarantor' };
    }
    if (borrowerId === guarantorId) {
      stat.refused++; stat.lastReason = 'same-borrower-guarantor';
      return { ok: false, reason: 'same-borrower-guarantor' };
    }
    if (defaultAmount <= 0) {
      stat.refused++; stat.lastReason = 'invalid-default-amount';
      return { ok: false, reason: 'invalid-default-amount' };
    }

    const res = {
      ok: true,
      reason: 'rupture-enacted',
      borrowerId: borrowerId,
      guarantorId: guarantorId,
      rupturedAmount: defaultAmount,
      blacklisted: true,
      guarantorDebtCreated: true,
      affinityPenalty: cfg.defaultPenaltyAffinity,
      // v2.382.0（死键族）：黑名单有效期改由登记的 blacklistDurationDays 生效（此前零消费）。
      blacklistDurationDays: cfg.blacklistDurationDays,
      blacklistUntil: at + (Number(cfg.blacklistDurationDays) || 0) * 86400000,
      timestamp: at
    };

    transact(function (d) {
      if (!d) return true;
      d.collateralRecords = d.collateralRecords || [];
      d.socialBlacklist = d.socialBlacklist || {};
      d.socialBlacklist[borrowerId] = {
        since: at,
        until: at + (Number(cfg.blacklistDurationDays) || 0) * 86400000,
        reason: 'collateral-default',
        defaultAmount: defaultAmount,
        guarantorId: guarantorId
      };

      // 穿透担保人追偿：担保人背负清偿义务
      d.guarantorDebts = d.guarantorDebts || {};
      d.guarantorDebts[guarantorId] = (d.guarantorDebts[guarantorId] || 0) + defaultAmount;

      // 扣减亲密关系与人际反噬
      if (d.actors) {
        if (d.actors[guarantorId]) {
          const gActor = d.actors[guarantorId];
          gActor.affinity = gActor.affinity || {};
          gActor.affinity[borrowerId] = (gActor.affinity[borrowerId] || 0) - cfg.defaultPenaltyAffinity;
          gActor.grudges = gActor.grudges || [];
          gActor.grudges.push({ target: borrowerId, reason: 'debt-breach', amount: defaultAmount, at: at });
        }
      }

      d.collateralRecords.push(res);
      if (d.collateralRecords.length > cfg.maxRecords) {
        d.collateralRecords.shift();
      }
      return true;
    }, 'ruptureCollateral');

    stat.triggered++;
    stat.penalised++;
    return res;
  }

  function statOf() {
    return Object.assign({}, stat);
  }

  WA.collateralRupture = {
    ruptureCollateral: ruptureCollateral
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/collateral-rupture 已加载（2.308.0）');
  }
})();
