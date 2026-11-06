/**
 * WorldAxis engines/contraband.js (v2.302.0)
 * OPV13-3 守恒经济网的跨区域通胀、供需失衡与走私黑市
 *
 * 机制设计：
 *   1. 区域物价动态敏感曲线（assessInflation）：现货存量低于安全库存时触发价格指数阶梯暴涨；
 *   2. 官方通道受阻或物资极度匮乏时，黑市走私路线激活（openRoute），以暴利吸引行商冒险；
 *   3. 走私伴随查扣、没收与信用破产风险（smuggle / inspectBust）：巡防查扣罚没物资，并处以巨额罚款与信用污点；
 *   4. 严格遵循物资守恒原则：货物来自真实源库存或走私者背包，扣减源并在成功时入库宿地。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_contraband_settings_v1';
  const DEF = {
    enabled: true,
    maxRoutes: 16,
    maxShipments: 32,
    maxBusts: 32,
    defaultSafetyStock: 20,
    baseInflationFactor: 1.0,
    maxInflationFactor: 4.0
  };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'contraband',
    bounds: { maxRoutes: [2, 32], maxShipments: [4, 64], maxBusts: [4, 64] }
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { assessed: 0, routesOpened: 0, smuggled: 0, busted: 0, confiscatedValue: 0, lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v || '').slice(0, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }

  function openContrabandStore(draft) {
    draft.contraband = draft.contraband && typeof draft.contraband === 'object' && !Array.isArray(draft.contraband)
      ? draft.contraband : { routes: [], shipments: [], busts: [], confiscated: [] };
    if (!Array.isArray(draft.contraband.routes)) draft.contraband.routes = [];
    if (!Array.isArray(draft.contraband.shipments)) draft.contraband.shipments = [];
    if (!Array.isArray(draft.contraband.busts)) draft.contraband.busts = [];
    if (!Array.isArray(draft.contraband.confiscated)) draft.contraband.confiscated = [];
    return draft.contraband;
  }

  /**
   * 1. 评估区域物价通胀指数与黑市供求张力
   */
  function assessInflation(place, resource, opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const pl = clean(place, 40), res = clean(resource, 40);
    const o = opts || {};
    if (!pl || !res) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }

    let currentStock = 0;
    let basePrice = 10;
    // 从 economy 引擎拉取真实库存与价格
    if (WA.economy && typeof WA.economy.view === 'function') {
      const v = WA.economy.view(pl, res);
      if (v && v.ok) {
        currentStock = v.stock || 0;
        basePrice = v.base || v.price || 10;
      }
    }
    const safetyStock = num(o.safetyStock) !== null ? num(o.safetyStock) : cfg.defaultSafetyStock;
    const stockRatio = Math.max(0, currentStock / Math.max(1, safetyStock));

    // 物价通胀因子：库存越低，通胀倍数越高（最高可达 maxInflationFactor）
    let inflationFactor = 1.0;
    let shortageSeverity = 'normal';
    if (stockRatio <= 0.25) {
      shortageSeverity = 'critical_scarcity';
      inflationFactor = cfg.maxInflationFactor;
    } else if (stockRatio < 0.5) {
      shortageSeverity = 'severe_shortage';
      inflationFactor = 1.0 + (1.0 - stockRatio) * 2.5;
    } else if (stockRatio < 0.8) {
      shortageSeverity = 'mild_shortage';
      inflationFactor = 1.0 + (1.0 - stockRatio) * 1.0;
    }
    inflationFactor = +Math.min(cfg.maxInflationFactor, Math.max(1.0, inflationFactor)).toFixed(2);
    const inflatedPrice = +(basePrice * inflationFactor).toFixed(2);
    const blackMarketMargin = +(inflationFactor * 1.5).toFixed(2); // 黑市溢价倍数

    stat.assessed++;
    stat.lastReason = 'assessed';
    return {
      ok: true,
      place: pl,
      resource: res,
      currentStock: currentStock,
      safetyStock: safetyStock,
      stockRatio: +stockRatio.toFixed(2),
      shortageSeverity: shortageSeverity,
      basePrice: basePrice,
      inflationFactor: inflationFactor,
      inflatedPrice: inflatedPrice,
      blackMarketSuggestedPrice: +(basePrice * blackMarketMargin).toFixed(2),
      blackMarketMargin: blackMarketMargin,
      recommendContraband: stockRatio < 0.5
    };
  }

  /**
   * 2. 开辟黑市走私路线
   */
  function openRoute(spec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const s = spec || {};
    const rid = clean(s.id || ('route_contra_' + Date.now()), 60);
    const from = clean(s.from, 40);
    const to = clean(s.to, 40);
    const res = clean(s.resource, 40);
    const riskRate = Math.max(5, Math.min(95, num(s.riskRate) !== null ? num(s.riskRate) : 35));
    const profitMargin = Math.max(1.2, num(s.profitMargin) !== null ? num(s.profitMargin) : 3.0); // 默认 300% 暴利
    const blackMarketPrice = num(s.blackMarketPrice) !== null ? num(s.blackMarketPrice) : +(10 * profitMargin).toFixed(2);

    if (!from || !to || !res) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }

    let out = null;
    WA.store.transact(function (draft) {
      const contra = openContrabandStore(draft);
      let hit = contra.routes.filter(function (r) { return r && r.id === rid; })[0];
      const now = clockNow('contraband');
      if (!hit) {
        hit = {
          id: rid,
          from: from,
          to: to,
          resource: res,
          riskRate: riskRate,
          profitMargin: profitMargin,
          blackMarketPrice: blackMarketPrice,
          status: 'active',
          bustCount: 0,
          successCount: 0,
          createdAt: now,
          updatedAt: now
        };
        contra.routes.push(hit);
      } else {
        hit.riskRate = riskRate;
        hit.profitMargin = profitMargin;
        hit.blackMarketPrice = blackMarketPrice;
        hit.updatedAt = now;
      }
      WA.evict.array(contra.routes, 'contraband.routes', cfg.maxRoutes);
      out = Object.assign({ ok: true }, hit);
    }, 'contraband:openRoute');

    if (out && out.ok) { stat.routesOpened++; stat.lastReason = 'route-opened'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 3. 实施走私运输（伴随巡防查扣与守恒结算）
   */
  function smuggle(spec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const s = spec || {};
    const rid = clean(s.routeId, 60);
    const smuggler = clean(s.smuggler || s.who, 60);
    const qty = Math.max(1, Math.floor(num(s.qty) || 1));
    const evasionRoll = num(s.evasionRoll); // 1~100，若未提供则随机生成

    if (!rid || !smuggler) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }

    const st = state();
    const contra = (st.contraband && Array.isArray(st.contraband.routes)) ? st.contraband : { routes: [] };
    const route = contra.routes.filter(function (r) { return r && r.id === rid; })[0];
    if (!route) { noteFault('unknown-route'); return { ok: false, reason: 'unknown-route', routeId: rid }; }

    // 检查物资持有情况（优先扣走私者背包，若无背包则扣源地库存）
    let person = (st.people && st.people['p_' + smuggler]) || (st.people && st.people[smuggler]);
    let hasPersonalStock = false;
    if (person && person.resources && (person.resources[route.resource] || 0) >= qty) {
      hasPersonalStock = true;
    }

    // 巡防判定：投骰与风险率对抗
    const rollVal = evasionRoll !== null ? evasionRoll : Math.floor(Math.random() * 100) + 1;
    const isBusted = rollVal <= route.riskRate;

    let out = null;
    WA.store.transact(function (draft) {
      const c = openContrabandStore(draft);
      const r = c.routes.filter(function (x) { return x && x.id === rid; })[0];
      const p = (draft.people && draft.people['p_' + smuggler]) || (draft.people && draft.people[smuggler]);
      const now = clockNow('contraband');

      // 扣减走私源物资（守恒原则）
      if (p && p.resources && (p.resources[r.resource] || 0) >= qty) {
        p.resources[r.resource] = +(p.resources[r.resource] - qty).toFixed(2);
      } else if (draft.economy && Array.isArray(draft.economy.goods)) {
        const srcGood = draft.economy.goods.filter(function (g) { return g && g.place === r.from && g.resource === r.resource; })[0];
        if (srcGood && srcGood.stock >= qty) {
          srcGood.stock -= qty;
        }
      }

      if (isBusted) {
        // 【被巡防查扣截获】
        r.bustCount = (r.bustCount || 0) + 1;
        const totalGoodsVal = +(qty * r.blackMarketPrice).toFixed(2);
        const penalty = +(totalGoodsVal * 1.5).toFixed(2); // 处以货值 150% 巨额罚金
        stat.confiscatedValue += totalGoodsVal;

        // 没收货物落盘
        const bustRecord = {
          id: 'bust_' + now + '_' + c.busts.length,
          routeId: rid,
          smuggler: smuggler,
          resource: r.resource,
          qty: qty,
          totalValue: totalGoodsVal,
          penalty: penalty,
          at: now
        };
        c.busts.push(bustRecord);
        WA.evict.array(c.busts, 'contraband.busts', cfg.maxBusts);

        // 惩罚与走私前科落盘
        let bankrupt = false;
        if (p) {
          p.resources = p.resources || {};
          const currentFunds = num(p.resources.funds) || num(p.resources['银元']) || 0;
          if (currentFunds < penalty) {
            bankrupt = true;
            p.resources.funds = 0;
          } else {
            p.resources.funds = +(currentFunds - penalty).toFixed(2);
          }
          p.life = p.life || {};
          p.life.commitments = Array.isArray(p.life.commitments) ? p.life.commitments : [];
          p.life.commitments.push({
            type: 'criminal_record',
            felony: 'smuggling_contraband',
            confiscatedQty: qty,
            resource: r.resource,
            bankrupt: bankrupt,
            timestamp: now
          });
        }

        out = {
          ok: true,
          status: 'busted',
          routeId: rid,
          smuggler: smuggler,
          confiscatedQty: qty,
          resource: r.resource,
          penalty: penalty,
          bankrupt: bankrupt,
          roll: rollVal,
          riskRate: r.riskRate,
          summary: '走私货物遭边境巡防彻底查扣并课以巨额罚金！'
        };
      } else {
        // 【成功突破封锁抵达】
        r.successCount = (r.successCount || 0) + 1;
        const revenue = +(qty * r.blackMarketPrice).toFixed(2);

        // 目的地黑市物资入库（通过 economy 增加或在目标地增加）
        if (draft.economy && Array.isArray(draft.economy.goods)) {
          let destGood = draft.economy.goods.filter(function (g) { return g && g.place === r.to && g.resource === r.resource; })[0];
          if (destGood) {
            destGood.stock += qty;
          }
        }

        // 走私利润入账走私者账户
        if (p) {
          p.resources = p.resources || {};
          const cur = num(p.resources.funds) || num(p.resources['银元']) || 0;
          p.resources.funds = +(cur + revenue).toFixed(2);
        }

        const shipmentRec = {
          id: 'contra_shp_' + now + '_' + c.shipments.length,
          routeId: rid,
          smuggler: smuggler,
          resource: r.resource,
          qty: qty,
          revenue: revenue,
          at: now
        };
        c.shipments.push(shipmentRec);
        WA.evict.array(c.shipments, 'contraband.shipments', cfg.maxShipments);

        out = {
          ok: true,
          status: 'success',
          routeId: rid,
          smuggler: smuggler,
          deliveredQty: qty,
          resource: r.resource,
          revenue: revenue,
          roll: rollVal,
          riskRate: r.riskRate,
          summary: '走私队伍巧妙规避边防，黑市暴利兑现成功！'
        };
      }
    }, 'contraband:smuggle');

    if (out && out.ok) {
      if (out.status === 'busted') {
        stat.busted++;
        stat.lastReason = 'smuggle-busted';
      } else {
        stat.smuggled++;
        stat.lastReason = 'smuggle-success';
      }
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 4. 查阅巡防查扣台账
   */
  function inspectBust(routeId, opts) {
    const st = state();
    const c = (st.contraband && typeof st.contraband === 'object') ? st.contraband : { busts: [], routes: [] };
    const rid = clean(routeId, 60);
    const busts = (Array.isArray(c.busts) ? c.busts : []).filter(function (b) {
      return !rid || b.routeId === rid;
    });
    return {
      ok: true,
      routeId: rid || 'all',
      bustCount: busts.length,
      records: busts
    };
  }

  WA.contraband = {
    assessInflation: assessInflation,
    openRoute: openRoute,
    smuggle: smuggle,
    inspectBust: inspectBust
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/contraband.js', { kind: 'engine', ver: '2.302.0' });
  }
})();
