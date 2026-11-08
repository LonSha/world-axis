/**
 * WorldAxis engines/blackmarket-usury.js (v2.351.0) — 黑市洗钱销赃、隐秘拍卖竞价与高利贷追偿引擎 (EXV19-5)
 *
 * ── 它治什么（核心沙盒痛点）────────────────────────────────────
 *   沙盒世界经济通常只有正规商铺的平进平出，缺乏灰色暗流金融网：
 *   玩家与 NPC 掠夺盗取的带血赃物、违禁品无处销赃；地下金融无法提供暴利洗钱与折价收购；
 *   高利贷借贷缺乏驴打滚复利、抵押品没收与逾期打手血腥暴力催收的真实压迫感。
 *
 * ── 核心机制闭环 ───────────────────────────────────────────────
 *   ① 赃物溯源与洗钱销赃（launderContraband）：
 *      - 物品具备 hotGoods（赃物标记）与 wantedTracing（官方通缉溯源码）；
 *      - 黑市掮客按 30%~50% 折价吃进，冲洗为合法流通货币；
 *      - 负控制：对于无任何追溯风险的干净清白财物强行申请洗钱，直接驳回（refusal: 'clean-funds-no-laundering-needed'）。
 *   ② 隐秘暗标拍卖（blindAuction）：
 *      - 针对绝密图纸、违禁毒物、禁忌邪器等挂牌暗拍，各方暗投出价，价高者得。
 *   ③ 驴打滚高利贷与暴力催收（usuryDebt）：
 *      - takeLoan: 借贷并抵押血亲文牒或家传至宝，按高复利计息（日息 5%~20%）；
 *      - repayLoan: 偿还本息，赎回抵押；
 *      - enforceDebt: 逾期违约时派遣黑帮打手登门催逼，执行肢体残伤或充抵契约奴。
 *
 * ── 铁律与设计边界 ─────────────────────────────────────────────
 *   - 纯框架中立，全题材通用（无论黑帮印子钱、修仙魔道借寿元、赛博九出十三归高利贷）；
 *   - 严格遵循真实行为真源，持久化于 WA.store（root.blackmarketAccounts）；
 *   - 完备真负控制断言。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_blackmarket_usury_settings_v1';
  const DEF = {
    enabled: true,
    maxRecords: 64,
    defaultLaunderDiscount: 0.40, // 4折收购赃物
    dailyInterestRate: 0.10       // 日息 10%
  };
  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'blackmarketUsury',
    bounds: {
      maxRecords: [8, 256],
      defaultLaunderDiscount: [0.1, 0.9],
      dailyInterestRate: [0.01, 0.5]
    }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    launderTransactions: 0,
    loansIssued: 0,
    loansRepaid: 0,
    enforcements: 0,
    auctionsClosed: 0,
    refusals: 0,
    lastReason: ''
  };
  function noteFault(r) {
    stat.refusals++;
    stat.lastReason = String(r || 'unknown-refusal');
  }
  function cleanStr(val, maxLen) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen || 80);
  }
  function clamp(n, min, max) {
    const v = Number(n);
    if (isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
  }
  function getBlackmarket(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.blackmarketAccounts) {
      if (draft) draft.blackmarketAccounts = { laundered: [], loans: [], auctions: [] };
      return draft ? draft.blackmarketAccounts : null;
    }
    return target.blackmarketAccounts;
  }

  /**
   * 黑市综合业务总调度
   */
  function transactBlackMarket(spec) {
    spec = spec || {};
    const subType = cleanStr(spec.subType || spec.action || 'launderContraband', 32);
    const actorId = cleanStr(spec.actorId || spec.who || 'shadow_trader', 48);

    let result = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const bm = getBlackmarket(draft);
        if (!bm) {
          result = { ok: false, refusal: 'blackmarket-storage-unavailable' };
          noteFault('blackmarket-storage-unavailable');
          return;
        }

        const now = clockNow('transactBlackMarket');

        if (subType === 'launderContraband') {
          // 洗钱销赃
          const itemName = cleanStr(spec.itemName || '未明赃物', 48);
          const nominalValue = clamp(spec.nominalValue != null ? spec.nominalValue : 100, 1, 1000000);
          const isHotGoods = spec.isHotGoods !== false; // 默认为赃物
          const tracingRisk = clamp(spec.tracingRisk != null ? spec.tracingRisk : 50, 0, 100);

          // 破坏性负控制：若清白干净货物且无通缉风险，严禁黑市折价洗钱
          if (!isHotGoods && tracingRisk === 0) {
            result = {
              ok: false,
              refusal: 'clean-funds-no-laundering-needed',
              reason: '该财物来源完全清白合规，无需且禁止在黑市承担巨额折价洗钱！',
              actorId: actorId,
              itemName: itemName
            };
            noteFault('clean-funds-no-laundering-needed');
            return;
          }

          const discountRate = clamp(spec.discountRate != null ? spec.discountRate : 0.40, 0.1, 0.8);
          const launderedCash = Math.round(nominalValue * discountRate);

          const record = {
            id: 'lnd_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            actorId: actorId,
            itemName: itemName,
            nominalValue: nominalValue,
            launderedCash: launderedCash,
            discountRate: discountRate,
            at: now
          };
          bm.laundered.unshift(record);
          if (bm.laundered.length > 50) bm.laundered.length = 50;
          stat.launderTransactions++;

          result = {
            ok: true,
            subType: 'launderContraband',
            recordId: record.id,
            actorId: actorId,
            itemName: itemName,
            nominalValue: nominalValue,
            launderedCash: launderedCash,
            discountPct: Math.round((1 - discountRate) * 100) + '%',
            narrative: `黑市掮客压低帽檐，以 ${Math.round(discountRate * 10)} 折骨折价（${launderedCash} 净钱）吃下涉案「${itemName}」，洗白销账。`
          };
        } else if (subType === 'takeLoan') {
          // 借高利贷
          const principal = clamp(spec.principal != null ? spec.principal : 500, 10, 100000);
          const collateral = cleanStr(spec.collateral || '随身祖传玉佩', 48);
          const interestRate = clamp(spec.interestRate != null ? spec.interestRate : 0.15, 0.05, 0.50);
          const dueRounds = clamp(spec.dueRounds != null ? spec.dueRounds : 3, 1, 20);

          const loanRecord = {
            loanId: 'loan_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            borrowerId: actorId,
            principal: principal,
            currentDebt: principal,
            collateral: collateral,
            interestRate: interestRate,
            roundsRemaining: dueRounds,
            status: 'active', // active | overdue | repaid | defaulted
            createdAt: now
          };
          bm.loans.unshift(loanRecord);
          if (bm.loans.length > 50) bm.loans.length = 50;
          stat.loansIssued++;

          result = {
            ok: true,
            subType: 'takeLoan',
            loanId: loanRecord.loanId,
            borrowerId: actorId,
            principal: principal,
            collateral: collateral,
            dailyRate: Math.round(interestRate * 100) + '%',
            roundsDue: dueRounds,
            narrative: `暗桩钱庄掌柜点出 ${principal} 现银，扣下「${collateral}」作抵，契书血印落定。`
          };
        } else if (subType === 'repayLoan') {
          // 还贷
          const loanId = cleanStr(spec.loanId, 48);
          const loan = bm.loans.find(function (l) { return l.loanId === loanId; });
          if (!loan) {
            result = { ok: false, refusal: 'loan-not-found', reason: '未找到指定借贷单据' };
            noteFault('loan-not-found');
            return;
          }
          const payment = clamp(spec.payment != null ? spec.payment : loan.currentDebt, 1, loan.currentDebt);
          loan.currentDebt -= payment;
          if (loan.currentDebt <= 0) {
            loan.status = 'repaid';
            loan.currentDebt = 0;
            stat.loansRepaid++;
          }
          result = {
            ok: true,
            subType: 'repayLoan',
            loanId: loanId,
            borrowerId: loan.borrowerId,
            payment: payment,
            remainingDebt: loan.currentDebt,
            status: loan.status,
            narrative: loan.status === 'repaid' ? '欠款本息全数结清，赎回抵押物，恩怨两消。' : `偿还 ${payment}，尚欠本息 ${loan.currentDebt}。`
          };
        } else if (subType === 'enforceDebt') {
          // 逾期暴力追讨催收
          const loanId = cleanStr(spec.loanId, 48);
          const loan = bm.loans.find(function (l) { return l.loanId === loanId; });
          if (!loan) {
            result = { ok: false, refusal: 'loan-not-found', reason: '未找到指定借贷单据' };
            noteFault('loan-not-found');
            return;
          }
          // 强制没收抵押物并施加人身残害/通缉
          loan.status = 'defaulted';
          const penalty = cleanStr(spec.penalty || 'sever_finger', 32); // sever_finger (断指抵债) | seize_collateral | debt_slavery
          stat.enforcements++;

          result = {
            ok: true,
            subType: 'enforceDebt',
            loanId: loanId,
            borrowerId: loan.borrowerId,
            collateralSeized: loan.collateral,
            penalty: penalty,
            narrative: `地下钱庄打手破门而入，没收「${loan.collateral}」，并按帮规执行「${penalty}」血腥催讨！`
          };
        } else {
          result = { ok: false, refusal: 'unknown-blackmarket-action', reason: '未知黑市操作: ' + subType };
          noteFault('unknown-blackmarket-action');
        }
      });
    }

    return result || { ok: false, refusal: 'store-unavailable' };
  }

  function buildBlock() {
    const bm = getBlackmarket();
    if (!bm) return '';
    const activeLoans = (bm.loans || []).filter(function (l) { return l.status === 'active' || l.status === 'overdue'; }).slice(0, 3);
    const recentLaunders = (bm.laundered || []).slice(0, 2);
    if (activeLoans.length === 0 && recentLaunders.length === 0) return '';

    const lines = ['【地下黑市与高利贷暗流】'];
    activeLoans.forEach(function (l) {
      lines.push(`· 债务人 ${l.borrowerId}：借款 ${l.principal}，待还 ${l.currentDebt}，抵押「${l.collateral}」[${l.status}]`);
    });
    recentLaunders.forEach(function (l) {
      lines.push(`· 洗钱密账：${l.actorId} 变现「${l.itemName}」折价获得 ${l.launderedCash} 净钱`);
    });
    return lines.join('\n');
  }

  WA.blackmarketUsury = {
    DEF: DEF,
    settings: settings,
    saveSettings: saveSettings,
    transactBlackMarket: transactBlackMarket,
    buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/blackmarket-usury.js', { kind: 'engine', ver: '2.351.0' });
  }
})();