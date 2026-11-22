/**
 * WorldAxis engines/contraband-pipeline.js (v2.330.0)
 * EXV16-4: 全题材地下黑市汇流与走私违禁供应链引擎 (Underground Contraband & Black Market Pipeline)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 抽象通用非法/违禁物资流通与风险溢价博弈模型。无论古代盐铁军械、修仙禁忌血丹、
 * 西幻违禁死灵卷轴还是科幻军规武器核心，统一抽象为官方管卡管制等级、随身藏匿对抗
 * 与黑市暴利供给机制：
 *  - 政策与管制：defineContrabandPolicy(jurisdictionId, itemKeys, severity)
 *  - 走私通关博弈：smuggleContraband(opts)
 *  - 黑市动态货架：getBlackMarketInventory(marketId)
 *  - 缉捕与黑市断流风控
 *  - diagnose(), resetAll()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  // 区域管辖管制政策: Map<jurisdictionId, { restrictedItems: Set<string>, severityLevel: number, inspectionBonus: number }>
  const _jurisdictionPolicies = new Map();
  // 黑市货架存量: Map<marketId, Map<itemKey, { quantity, basePrice, blackMarketPrice, premiumRatio }>>
  const _blackMarkets = new Map();
  // 缉捕黑名单: Map<actorId, { wantedLevel, reason, bounty, timestamp }>
  const _wantedLedger = new Map();

  /**
   * 定义或更新管辖区域的违禁品管制条令
   */
  function defineContrabandPolicy(jurisdictionId, contrabandItemKeys, severityLevel, opts) {
    if (!jurisdictionId || typeof jurisdictionId !== 'string') {
      return { ok: false, error: 'invalid_jurisdiction_id' };
    }
    const items = Array.isArray(contrabandItemKeys) ? contrabandItemKeys : [];
    const sev = typeof severityLevel === 'number' ? Math.max(1, Math.min(5, severityLevel)) : 2;
    const opt = opts || {};

    const policy = {
      jurisdictionId: jurisdictionId,
      restrictedItems: new Set(items),
      severityLevel: sev,
      inspectionBonus: typeof opt.inspectionBonus === 'number' ? opt.inspectionBonus : sev * 15,
      lastUpdated: clockNow('contraband-pipeline')
    };
    _jurisdictionPolicies.set(jurisdictionId, policy);

    return {
      ok: true,
      jurisdictionId: jurisdictionId,
      contrabandCount: policy.restrictedItems.size,
      severityLevel: policy.severityLevel
    };
  }

  /**
   * 走私行动结算
   * @param {Object} opts {
   *   smugglerId: string,
   *   jurisdictionId: string,
   *   destinationMarketId: string,
   *   cargoItems: Array<{ itemKey: string, quantity: number, declaredValue: number }>,
   *   stealthRating: number, // 随身暗格隐匿值或潜行评级 (0~100)
   *   checkpointInspectionRating: number // 哨卡盘查严苛度 (0~100)
   * }
   */
  function smuggleContraband(opts) {
    if (!opts || !opts.smugglerId || !opts.jurisdictionId) {
      return { ok: false, error: 'missing_smuggler_or_jurisdiction' };
    }
    const policy = _jurisdictionPolicies.get(opts.jurisdictionId);
    if (!policy) {
      return { ok: false, error: 'jurisdiction_policy_not_found' };
    }

    const cargo = Array.isArray(opts.cargoItems) ? opts.cargoItems : [];
    // 筛出其中的管制违禁品
    const contrabandCargo = cargo.filter(item => item && policy.restrictedItems.has(item.itemKey));

    // 负控制拦截：走私货物列表中若不包含任何管制违禁品，系统直接拦截并拒绝走私判定
    if (contrabandCargo.length === 0) {
      return {
        ok: false,
        error: 'no_contraband_in_cargo',
        message: 'Cargo does not contain any restricted items under current jurisdiction'
      };
    }

    const stealth = typeof opts.stealthRating === 'number' ? Math.max(0, opts.stealthRating) : 50;
    const inspection = typeof opts.checkpointInspectionRating === 'number'
      ? opts.checkpointInspectionRating
      : policy.inspectionBonus;

    // 对抗判定：潜行/暗格 vs 哨卡盘查
    const intercepted = inspection > stealth;

    if (intercepted) {
      // 查获截击：货物没收，上榜通缉
      const totalConfiscated = contrabandCargo.reduce((acc, c) => acc + (c.quantity || 1), 0);
      _wantedLedger.set(opts.smugglerId, {
        wantedLevel: policy.severityLevel,
        reason: 'contraband_smuggling_caught',
        bounty: policy.severityLevel * 500,
        timestamp: clockNow('contraband-pipeline')
      });

      return {
        ok: true,
        success: false,
        intercepted: true,
        smugglerId: opts.smugglerId,
        confiscatedItemsCount: totalConfiscated,
        wantedLevel: policy.severityLevel,
        message: 'Smuggler intercepted by checkpoint guards; cargo seized and warrant issued.'
      };
    }

    // 成功通关：注货入地下黑市，结算暴利
    const destMarket = opts.destinationMarketId || 'default_black_market';
    if (!_blackMarkets.has(destMarket)) {
      _blackMarkets.set(destMarket, new Map());
    }
    const marketMap = _blackMarkets.get(destMarket);

    let totalProfit = 0;
    const premiumMultiplier = 1.0 + (policy.severityLevel * 0.75); // 溢价 1.75x ~ 4.75x

    for (const c of contrabandCargo) {
      const qty = c.quantity || 1;
      const baseVal = c.declaredValue || 100;
      const bPrice = Math.round(baseVal * premiumMultiplier);
      totalProfit += (bPrice - baseVal) * qty;

      let mItem = marketMap.get(c.itemKey);
      if (!mItem) {
        mItem = {
          itemKey: c.itemKey,
          quantity: 0,
          basePrice: baseVal,
          blackMarketPrice: bPrice,
          premiumRatio: premiumMultiplier
        };
        marketMap.set(c.itemKey, mItem);
      }
      mItem.quantity += qty;
      mItem.blackMarketPrice = bPrice;
    }

    return {
      ok: true,
      success: true,
      intercepted: false,
      smugglerId: opts.smugglerId,
      deliveredItemsCount: contrabandCargo.length,
      estimatedProfit: totalProfit,
      marketId: destMarket,
      premiumMultiplier: premiumMultiplier
    };
  }

  /**
   * 查看黑市货架列表
   */
  function getBlackMarketInventory(marketId) {
    const mId = marketId || 'default_black_market';
    if (!_blackMarkets.has(mId)) return [];
    return Array.from(_blackMarkets.get(mId).values()).map(v => Object.assign({}, v));
  }

  /**
   * 查询角色是否在通缉名单
   */
  function getWantedStatus(actorId) {
    if (!_wantedLedger.has(actorId)) {
      return { wanted: false, actorId: actorId };
    }
    return Object.assign({ wanted: true, actorId: actorId }, _wantedLedger.get(actorId));
  }

  function resetAll() {
    _jurisdictionPolicies.clear();
    _blackMarkets.clear();
    _wantedLedger.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    defineContrabandPolicy: defineContrabandPolicy,
    smuggleContraband: smuggleContraband,
    getBlackMarketInventory: getBlackMarketInventory,
    getWantedStatus: getWantedStatus,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        jurisdictionsCount: _jurisdictionPolicies.size,
        blackMarketsCount: _blackMarkets.size,
        wantedSmugglersCount: _wantedLedger.size,
        version: VERSION
      };
    }
  };

  WA.engines.contrabandPipeline = engine;
  WA.contrabandPipeline = engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();