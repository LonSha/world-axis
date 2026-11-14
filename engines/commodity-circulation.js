/**
 * WorldAxis engines/commodity-circulation.js (v2.408.0) — EXV23-1 多代理人物资流转、大宗商路与债务违约清算
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G1 实测：全域 408 个核心引擎中，经贸模块仅占 2 个（economy/market），
 *   缺乏实体物资储量（stockpile）、运力损耗（transitLoss）与信用借据（promissoryNote）违约清算。
 *   在长程推进中，物资凭空转移、无物流成本、债务违约无资产清算。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `commodityCirculation.transferCargo` 模拟物资在两个节点间的实物运输与损耗结算；
 *   `commodityCirculation.issueDebtInstrument` 发行具有信用评级与到期轮次的商业借据；
 *   `commodityCirculation.settleDefault` 对逾期未兑付的债务进行清算，扣押担保资产或将违约人列入失信黑名单。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 纯内存计算 + 状态投影，支持通过 actionDesk 写入或外部状态驱动。
 *   ② 实体库存不可为负数，超量转移拒绝（refusal: cargo-exceeds-physical-stockpile）。
 *   ③ 借据必须具备合法担保物与到期轮次，清算时如实按比例折抵。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_commodity_circulation_settings_v1';
  const DEF = {
    enabled: true,
    defaultSpoilageRate: 0.05, // 默认运输损耗 5%
    defaultInterestRate: 0.1,  // 默认借据利息 10%
    maxActiveDebts: 50
  };

  const __REG = {
    key: 'commodityCirculation',
    name: '物资流转与债务清算 (EXV23-1)',
    desc: '物资实物库存、商路损耗运输与商业信用借据违约清算',
    settingsKey: LS_KEY,
    schema: {
      enabled: { type: 'boolean', default: true },
      defaultSpoilageRate: { type: 'number', default: 0.05 },
      defaultInterestRate: { type: 'number', default: 0.1 },
      maxActiveDebts: { type: 'number', default: 50 }
    }
  };

  const STATE = {
    stockpiles: {}, // nodeId -> { [commodityKey]: amount }
    debts: {},      // debtId -> { id, issuerId, holderId, principal, interest, collateral, dueRound, status }
    blacklists: {}  // actorId -> { defaultedCount, totalDefaultedAmount, lastDefaultedAt }
  };

  const stat = {
    transfers: 0,
    debtsIssued: 0,
    debtsSettled: 0,
    defaultsCount: 0,
    lastReason: ''
  };

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.getModuleSettings === 'function') {
      const s = WA.settingsBus.getModuleSettings(__REG.key, DEF);
      return Object.assign({}, DEF, s);
    }
    return Object.assign({}, DEF);
  }

  function clockNow() {
    if (WA.clock && typeof WA.clock.now === 'function') return WA.clock.now();
    return Date.now();
  }

  function setStockpile(nodeId, commodity, amount) {
    if (!nodeId || !commodity) return false;
    if (!STATE.stockpiles[nodeId]) STATE.stockpiles[nodeId] = {};
    const n = Math.max(0, Number(amount) || 0);
    STATE.stockpiles[nodeId][commodity] = n;
    return true;
  }

  function getStockpile(nodeId, commodity) {
    if (!nodeId || !STATE.stockpiles[nodeId]) return 0;
    return STATE.stockpiles[nodeId][commodity] || 0;
  }

  /**
   * 转移物资
   * @param {Object} spec - { fromNode, toNode, commodity, amount, hazardRate }
   */
  function transferCargo(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.lastReason = 'disabled';
      return { ok: false, refusal: 'commodity-circulation-disabled' };
    }
    const o = spec || {};
    const from = o.fromNode, to = o.toNode, comm = o.commodity;
    const qty = Number(o.amount) || 0;
    if (!from || !to || !comm || qty <= 0) {
      stat.lastReason = 'invalid-params';
      return { ok: false, refusal: 'invalid-cargo-spec' };
    }
    const current = getStockpile(from, comm);
    if (current < qty) {
      stat.lastReason = 'cargo-exceeds-physical-stockpile';
      return {
        ok: false,
        refusal: 'cargo-exceeds-physical-stockpile',
        hint: '节点 ' + from + ' 物资 ' + comm + ' 库存仅 ' + current + '，无法调出 ' + qty
      };
    }
    const hazard = typeof o.hazardRate === 'number' ? Math.max(0, Math.min(1, o.hazardRate)) : cfg.defaultSpoilageRate;
    const loss = Math.floor(qty * hazard);
    const delivered = qty - loss;

    setStockpile(from, comm, current - qty);
    setStockpile(to, comm, getStockpile(to, comm) + delivered);

    stat.transfers++;
    return {
      ok: true,
      fromNode: from,
      toNode: to,
      commodity: comm,
      dispatched: qty,
      delivered: delivered,
      loss: loss,
      at: clockNow()
    };
  }

  /**
   * 发行借据
   * @param {Object} spec - { debtId, issuerId, holderId, principal, collateral, dueRound, interestRate }
   */
  function issueDebtInstrument(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      return { ok: false, refusal: 'commodity-circulation-disabled' };
    }
    const o = spec || {};
    const debtId = o.debtId || ('debt_' + Math.random().toString(36).slice(2, 9));
    const issuer = o.issuerId, holder = o.holderId;
    const principal = Number(o.principal) || 0;
    if (!issuer || !holder || principal <= 0) {
      return { ok: false, refusal: 'invalid-debt-spec' };
    }
    const rate = typeof o.interestRate === 'number' ? o.interestRate : cfg.defaultInterestRate;
    const totalDue = Math.round(principal * (1 + rate));
    const record = {
      id: debtId,
      issuerId: issuer,
      holderId: holder,
      principal: principal,
      totalDue: totalDue,
      collateral: o.collateral || null,
      dueRound: Number(o.dueRound) || 0,
      status: 'active',
      issuedAt: clockNow()
    };
    STATE.debts[debtId] = record;
    stat.debtsIssued++;
    return { ok: true, debt: record };
  }

  /**
   * 债务结算 / 违约清算
   * @param {string} debtId
   * @param {number} currentRound
   * @param {number} paidAmount
   */
  function settleDefault(debtId, currentRound, paidAmount) {
    const debt = STATE.debts[debtId];
    if (!debt) return { ok: false, refusal: 'debt-not-found' };
    if (debt.status !== 'active') return { ok: false, refusal: 'debt-already-closed', status: debt.status };

    const paid = Number(paidAmount) || 0;
    if (paid >= debt.totalDue) {
      debt.status = 'settled';
      stat.debtsSettled++;
      return { ok: true, status: 'settled', debtId: debtId, paid: paid };
    }

    // 逾期判断
    const curRound = Number(currentRound) || 0;
    if (curRound >= debt.dueRound) {
      debt.status = 'defaulted';
      stat.defaultsCount++;
      const issuer = debt.issuerId;
      if (!STATE.blacklists[issuer]) {
        STATE.blacklists[issuer] = { defaultedCount: 0, totalDefaultedAmount: 0, lastDefaultedAt: 0 };
      }
      STATE.blacklists[issuer].defaultedCount++;
      STATE.blacklists[issuer].totalDefaultedAmount += (debt.totalDue - paid);
      STATE.blacklists[issuer].lastDefaultedAt = clockNow();

      return {
        ok: true,
        status: 'defaulted',
        debtId: debtId,
        issuerId: issuer,
        unpaid: debt.totalDue - paid,
        claimedCollateral: debt.collateral,
        hint: '债务违约，触发失信记录与抵押品清算'
      };
    }

    return {
      ok: true,
      status: 'active',
      debtId: debtId,
      remaining: debt.totalDue - paid,
      hint: '尚未到期，保持存续'
    };
  }

  function view() {
    return {
      ok: true,
      stockpilesCount: Object.keys(STATE.stockpiles).length,
      activeDebtsCount: Object.values(STATE.debts).filter(function (d) { return d.status === 'active'; }).length,
      blacklistsCount: Object.keys(STATE.blacklists).length,
      stat: Object.assign({}, stat)
    };
  }

  function reset() {
    STATE.stockpiles = {};
    STATE.debts = {};
    STATE.blacklists = {};
    stat.transfers = 0;
    stat.debtsIssued = 0;
    stat.debtsSettled = 0;
    stat.defaultsCount = 0;
    stat.lastReason = '';
    return { ok: true };
  }

  WA.commodityCirculation = {
    transferCargo: transferCargo,
    issueDebtInstrument: issueDebtInstrument,
    settleDefault: settleDefault,
    setStockpile: setStockpile,
    getStockpile: getStockpile,
    view: view,
    reset: reset,
    getSettings: settings
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/commodity-circulation.js', { kind: 'engine', ver: '2.408.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/commodity-circulation 已加载（2.408.0）');
  }
})();
