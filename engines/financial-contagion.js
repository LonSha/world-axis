/**
 * WorldAxis engines/financial-contagion.js (v2.380.0)
 * EXV20-7: 黑市金融危机、钱庄挤兑与假币通缩洗牌引擎
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_financial_contagion_settings_v1';
  const DEF = {
    enabled: true,
    insolvencyThreshold: 0.35,
    maxHistory: 30
  };
  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'financialContagion'
  };
  // v2.381.0: 补齐设置键登记 —— 与 engines/court-intrigue.js 同一处漏项（那一处已在
  //   同版修掉，且注释里写着「全仓 274 个引擎里唯一的登记漏项」；实测这句在本版已不成立，
  //   因为本引擎也漏着）。症状不是「少一行」：
  //     · render/inject.js 的 SRC_MOD_SETTING 里本源的键是**对的**
  //       （financialContagion → worldaxis_financial_contagion_settings_v1），
  //       但 moduleEnabled 的三态读以 __settingsRegs 为唯一真源 ⇒ 查不到 ⇒ 返回 null，
  //       于是对账面把本源判成 unavailable（「没有模块级总开关」——而它明明有）；
  //     · 更坏的是它同时**计数错位**：判据 A1 说「表内 108 + 表外 36 = 源面 144」，
  //       而本源既在表内（有映射）又被算进表外（不可判定），两件事各自为真、
  //       合起来就成了「表内 + 表外 ≠ 源面」——一个源被算了两次。
  //     · settingsBus 的 ghostScan / applyDefaults / verifyDefaults 也以本表为唯一真源：
  //       未登记则该键被判成幽灵键（进清理候选），子键级默认值永不回填。
  //   教训同 court-intrigue 那处：**映射表里有键 ≠ 登记表里有项**，两张表的两跳
  //   （源键 → settings 键 → 模块名）必须两跳都通，只通第一跳时读数看起来「有归属」，
  //   而开关实际读不到。
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let stat = {
    runsTriggered: 0,
    defaultsOccurred: 0,
    bailoutsInjected: 0,
    refusalCount: 0
  };

  function noteFault(code) {
    stat.refusalCount++;
    if (WA.health && typeof WA.health.noteFault === 'function') {
      try { WA.health.noteFault('financial-contagion', code); } catch (e) {}
    }
  }

  function clockNow() {
    try { if (WA.clock && typeof WA.clock.now === 'function') return WA.clock.now('financial.contagion'); } catch (e) {}
    return clockNow('financial-contagion');
  }

  function getFinancialStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.financialContagions || typeof target.financialContagions !== 'object') {
      if (draft) target.financialContagions = { banks: {}, collapseLedger: [] };
      return draft ? target.financialContagions : null;
    }
    return target.financialContagions;
  }

  function triggerRunOnBank(p) {
    p = p || {};
    if (!p.bankId || !p.place) {
      noteFault('invalid-bank-target');
      return { ok: false, refusal: 'invalid-bank-target', reason: '必须指定受波及的钱庄银行机构(bankId)与所在城邦地点(place)' };
    }

    const cashReserves = Math.max(0, Number(p.cashReserves != null ? p.cashReserves : 1000));
    const issuedNotes = Math.max(1, Number(p.issuedNotes != null ? p.issuedNotes : 2000));
    const withdrawalDemand = Math.max(0, Number(p.withdrawalDemand != null ? p.withdrawalDemand : 500));
    const panicIndex = Math.min(100, Math.max(0, Number(p.panicIndex != null ? p.panicIndex : 20)));
    const counterfeitRatio = Math.min(1, Math.max(0, Number(p.counterfeitRatio != null ? p.counterfeitRatio : 0)));

    const coverageRatio = cashReserves / issuedNotes;

    if (cashReserves >= withdrawalDemand && coverageRatio >= 0.8 && panicIndex < 30 && counterfeitRatio < 0.1) {
      noteFault('reserves-sufficient-no-run');
      return {
        ok: false,
        refusal: 'reserves-sufficient-no-run',
        reason: '钱庄准备金充裕，刚性兑付未被击穿'
      };
    }

    const store = getFinancialStore();
    const existingBank = store && store.banks ? store.banks[p.bankId] : null;
    if (existingBank && existingBank.status === 'insolvent') {
      noteFault('bank-already-insolvent');
      return {
        ok: false,
        refusal: 'bank-already-insolvent',
        reason: '钱庄此前已宣告破产清算，柜台已彻底停业'
      };
    }

    stat.runsTriggered++;
    const liquidityDeficit = Math.max(0, withdrawalDemand - cashReserves);
    const isDefault = liquidityDeficit > 0 || coverageRatio < DEF.insolvencyThreshold || panicIndex >= 70;

    const contagionIndex = Math.min(100, Math.round(
      (liquidityDeficit > 0 ? 50 : 20) + (panicIndex * 0.3) + (counterfeitRatio * 100 * 0.2)
    ));
    const priceInflationMultiplier = +(1.0 + (contagionIndex / 100) * 1.5).toFixed(2);
    const eventTime = clockNow();

    const record = {
      bankId: p.bankId,
      place: p.place,
      cashReserves: cashReserves,
      issuedNotes: issuedNotes,
      withdrawalDemand: withdrawalDemand,
      liquidityDeficit: liquidityDeficit,
      coverageRatio: coverageRatio,
      panicIndex: panicIndex,
      counterfeitRatio: counterfeitRatio,
      isDefault: isDefault,
      status: isDefault ? 'insolvent' : 'strained',
      contagionIndex: contagionIndex,
      priceInflationMultiplier: priceInflationMultiplier,
      timestamp: eventTime,
      summary: isDefault ? '金融暴雷，钱庄破产！' : '挤兑承压，信用下调。'
    };

    if (isDefault) stat.defaultsOccurred++;

    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const finStore = getFinancialStore(draft);
        if (finStore) {
          finStore.banks[p.bankId] = {
            bankId: p.bankId,
            place: p.place,
            status: record.status,
            lastDeficit: liquidityDeficit,
            lastUpdated: eventTime
          };
          finStore.collapseLedger.unshift(record);
          if (finStore.collapseLedger.length > DEF.maxHistory) {
            finStore.collapseLedger.length = DEF.maxHistory;
          }
        }
      });
    }

    // v2.381.0: events 是事件钟排期表，不提供 emit 即时广播原语（导出面只有
    //   schedule/due/claim/complete/cancel/replace/fulfillDue/active/fails/...）。
    //   原代码探测 emit 恒 false，于是「金融机构暴雷」这件大事从未进入统一事件钟，
    //   timelineView / fulfillDue 都看不见它。改为排一条立即可认领的 once 事件，
    //   事实与数字原样进 payload，不额外编造。
    if (WA.events && typeof WA.events.schedule === 'function') {
      try {
        WA.events.schedule({
          id: 'financial.contagion:' + record.bankId + ':' + record.timestamp,
          title: record.bankId + (record.status === 'insolvent' ? ' 金融暴雷' : ' 挤兑承压'),
          kind: 'once',
          priority: record.status === 'insolvent' ? 8 : 5,
          payload: {
            source: 'financialContagion',
            bankId: record.bankId,
            place: record.place,
            status: record.status,
            isDefault: record.isDefault,
            contagionIndex: record.contagionIndex,
            panicIndex: record.panicIndex,
            coverageRatio: record.coverageRatio,
            summary: record.summary
          }
        });
      } catch (eSchedule) {}
    }

    return { ok: true, data: record };
  }

  function injectLiquidityBailout(p) {
    p = p || {};
    if (!p.bankId || !p.bailoutFunds || p.bailoutFunds <= 0) {
      noteFault('invalid-bailout-funds');
      return { ok: false, refusal: 'invalid-bailout-funds', reason: '必须指定注资救市的银行与合法的救市注资金额' };
    }
    stat.bailoutsInjected++;
    const eventTime = clockNow();
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const finStore = getFinancialStore(draft);
        if (finStore && finStore.banks[p.bankId]) {
          finStore.banks[p.bankId].status = 'bailed_out';
          finStore.banks[p.bankId].bailoutFunds = p.bailoutFunds;
          finStore.banks[p.bankId].lastUpdated = eventTime;
        }
      });
    }
    return { ok: true, bankId: p.bankId, bailoutFunds: p.bailoutFunds, status: 'bailed_out' };
  }

  function buildBlock() {
    const store = getFinancialStore();
    if (!store || !store.collapseLedger || store.collapseLedger.length === 0) return '';
    const recent = store.collapseLedger.slice(0, 2);
    const lines = ['【地下金融与信用挤兑风暴】'];
    recent.forEach(function (r) {
      lines.push(`· ${r.bankId}(${r.place}): [${r.status}] 传染指数 ${r.contagionIndex}%，物价乘数 x${r.priceInflationMultiplier} | ${r.summary}`);
    });
    return lines.join("\n");
  }

  WA.financialContagion = {
    DEF: DEF,
    triggerRunOnBank: triggerRunOnBank,
    injectLiquidityBailout: injectLiquidityBailout,
    buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/financial-contagion.js', { kind: 'engine', ver: VERSION });
  }
})();
