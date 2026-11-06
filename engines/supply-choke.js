/**
 * WorldAxis engines/supply-choke.js (v2.312.0) — EXV14-4 险道封闭与物资供应链动态断裂传导
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   此前虽然有 terrain-hazard 和 supply-chain，但供应链断裂从未反噬到
 *   城市资源库存与物价飞涨的现实经济。当暴雪封路或险道塌方后，城市商铺
 *   依旧可以凭空刷新物资，缺乏供应链物理阻断导致的缺货危机与限购恐慌。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `supplyChoke.triggerChoke`：
 *   1. 封闭特定关键运输路线（chokeRoute），设置阻断持续天数与通行阻力；
 *   2. 扣减下游城市的物资供应量（stock），计算短缺倍率（shortageMultiplier）；
 *   3. 触发黑市价格暴涨（priceInflation）与紧急配给限购政策（rationing）；
 *   4. 持久化记录到 supplyChokes 账簿中。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_supply_choke_settings_v1';
  const DEF = { enabled: true, maxChokes: 24, defaultPriceInflationRate: 2.5 };
  const __REG = { key: LS_KEY, def: DEF, module: 'supplyChoke' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'supplyChoke:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { choked: 0, relieved: 0, refused: 0, lastReason: '' };

  /**
   * 触发险道封锁与供应链断裂
   * @param {object} spec { routeId, destinationCity, resourceKind, durationDays?, severity?, at? }
   */
  function triggerChoke(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const routeId = String(s.routeId || '').trim();
    const destinationCity = String(s.destinationCity || '').trim();
    const resourceKind = String(s.resourceKind || '').trim();
    if (!routeId) {
      stat.refused++; stat.lastReason = 'missing-route-id';
      return { ok: false, reason: 'missing-route-id' };
    }
    if (!destinationCity) {
      stat.refused++; stat.lastReason = 'missing-destination';
      return { ok: false, reason: 'missing-destination' };
    }
    if (!resourceKind) {
      stat.refused++; stat.lastReason = 'missing-resource-kind';
      return { ok: false, reason: 'missing-resource-kind' };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('supplyChoke');
    const durationDays = Number(s.durationDays) > 0 ? Number(s.durationDays) : 7;
    const severity = Number(s.severity) > 0 ? Number(s.severity) : 1.0;
    const priceMultiplier = +(1 + (cfg.defaultPriceInflationRate - 1) * severity).toFixed(2);

    const chokeRecord = {
      chokeId: 'chk_' + routeId + '_' + (at % 10000),
      routeId: routeId,
      destinationCity: destinationCity,
      resourceKind: resourceKind,
      durationDays: durationDays,
      severity: severity,
      priceMultiplier: priceMultiplier,
      status: 'active',
      startedAt: at,
      expiresAt: at + durationDays * 86400 * 1000
    };

    transact(function (d) {
      if (!d) return true;
      d.supplyChokes = d.supplyChokes || [];
      d.supplyChokes.push(chokeRecord);
      if (d.supplyChokes.length > cfg.maxChokes) {
        d.supplyChokes.shift();
      }

      // 影响目标城市的物资价格乘数与配给状态
      d.cityMarkets = d.cityMarkets || {};
      d.cityMarkets[destinationCity] = d.cityMarkets[destinationCity] || { prices: {}, stock: {}, rationing: false };
      const m = d.cityMarkets[destinationCity];
      m.prices[resourceKind] = (m.prices[resourceKind] || 10) * priceMultiplier;
      m.stock[resourceKind] = Math.max(0, (m.stock[resourceKind] || 100) - Math.round(50 * severity));
      if (severity >= 1.0) {
        m.rationing = true;
      }
      return true;
    }, 'triggerChoke');

    stat.choked++;
    return {
      ok: true,
      reason: 'choke-triggered',
      choke: chokeRecord
    };
  }

  WA.supplyChoke = {
    triggerChoke: triggerChoke
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/supply-choke 已加载（2.312.0）');
  }
})();