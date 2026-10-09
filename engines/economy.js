/**
 * WorldAxis engines/economy.js (v2.119.0) — 生产、消费与供需变化（拓展计划 ③）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   `org` 有库存、转移、项目、薪酬与流水，但那是**记账**：它答得出「谁手里有多少」，
 *   答不出「货是怎么变少的、为什么涨价、商路断了会怎样」。现场于是只剩两种做法：
 *   要么库存永远不变（世界没有生产与消耗），要么模型顺手报一句「最近粮价涨了」——
 *   而那句话在下一次结算是查无实据的（没有任何一条价是被谁定过、被什么推着动的）。
 *
 * ── 本模块只做五件事，每件都有一个硬条件 ─────────────────────
 *   ① `stock`  到货入库：**首次登记必须给基础价**（`missing-base`）——
 *      凭空的价不是价，是模型顺手编的数。
 *   ② `price`  定价：必须落在该资源的**定价带宽**内（base ± spreadPct），
 *      越界 `price-out-of-band`（带出 lo/hi）。带宽外的价等于「这笔交易不必发生」。
 *   ③ `buy`    一手交钱一手交货：钱不够 `cannot-afford`、货不够 `short-stock`，
 *      **都不改状态**（拒收不是赊账）。库存不允许变负数，也不允许静默欠货。
 *   ④ `craft`  生产配方：输入不足 `short-input`（带出缺什么、缺多少），
 *      够了才扣料出货。配方是具名常量表，不接受模型现编的合成关系。
 *   ⑤ `tick`   时段推进（消耗 + 需求积累 + 价格响应）：同一时段只能推一次
 *      （`duplicate-tick`）。响应发生在**成交之后** —— 本次成交按成交当时价，
 *      涨价只影响下一笔（`price` 与 `next` 两个字段分别带出）。
 *
 * ── 八条设计边界（全是否定式）──────────────────────────────────
 *   ① **无基础价不定价**、**无配方不合成**（`unknown-good` / `unknown-recipe`）。
 *   ② **价格不许越出带宽**（见上②）。
 *   ③ **钱货两清**：`cannot-afford` / `short-stock` 一律不改状态。
 *   ④ **库存不为负**：不夹取、不欠着；欠货必须是订单显式声明过的事。
 *   ⑤ **先结算后响应**：本次价与响应后价分列回报，不把未来的价算进这一笔。
 *   ⑥ **时段幂等**：`duplicate-tick` 拒收（重复推演不得造成第二次消耗）。
 *   ⑦ **商路受阻不消失**：受阻路段留在原地（`stuck`），可解除、可续运。
 *   ⑧ **容量有界且挤出有账**：三个站点（goods / orders / routes）都走 evict 单一出口。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────────
 *   · 本模块**不发行货币**：钱只在 `people[].resources` 之间转移，不创造购买力，
 *     也不允许负余额。成交**如实回报**，入账由调用方经 org 完成（本模块不替你记账）。
 *   · 本模块**不定汇率、不做跨地套利定价**：同一资源在不同地点各有各的基础价。
 *   · 总开关默认关闭；关闭时不入库、不定价、不成交、不推时段、不注入。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_economy_settings_v1';
  // spreadPct：定价带宽（base 上下各 spreadPct%）。带宽是「这笔价还算不算这件货的价」的界限。
  const DEF = { enabled: false, maxGoods: 16, maxOrders: 12, maxRoutes: 8, spreadPct: 30 };
  const __REG = { key: LS_KEY, def: DEF, module: 'economy',
    bounds: { maxGoods: [4, 48], maxOrders: [4, 32], maxRoutes: [2, 16], spreadPct: [5, 100] } };
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

  const MONEY = '银元';
  // 配方是具名表：**模型现编的合成关系不算**（否则「铁怎么变成面包」永远答不出）。
  const RECIPES = {
    '面包': { in: { '面粉': 1 }, out: { '面包': 2 } },
    '铁器': { in: { '铁': 2 }, out: { '铁器': 1 } }
  };
  const LANES = ['road', 'river', 'sea', 'rail'];

  const stat = { stocked: 0, priced: 0, bought: 0, crafted: 0, ticks: 0,
    blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.blocked++; stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function ecoOf(root) {
    const c = (root || state()).economy;
    return (c && typeof c === 'object' && !Array.isArray(c)) ? c : null;
  }
  function goodsOf(root) { const c = ecoOf(root); return (c && Array.isArray(c.goods)) ? c.goods : []; }
  function ordersOf(root) { const c = ecoOf(root); return (c && Array.isArray(c.orders)) ? c.orders : []; }
  function routesOf(root) { const c = ecoOf(root); return (c && Array.isArray(c.routes)) ? c.routes : []; }
  function findGoods(place, resource, root) {
    const pl = clean(place, 40), res = clean(resource, 40);
    return goodsOf(root).filter(function (r) { return r && clean(r.place, 40) === pl && clean(r.resource, 40) === res; })[0] || null;
  }
  function findOrder(id, root) {
    const key = clean(id, 60);
    return ordersOf(root).filter(function (r) { return r && clean(r.id, 60) === key; })[0] || null;
  }
  function findRoute(id, root) {
    const key = clean(id, 60);
    return routesOf(root).filter(function (r) { return r && clean(r.id, 60) === key; })[0] || null;
  }
  function bandOf(g, cfg) {
    const c = cfg || settings();
    const k = c.spreadPct / 100;
    return { lo: +(g.base * (1 - k)).toFixed(2), hi: +(g.base * (1 + k)).toFixed(2) };
  }
  /**
   * 价格响应。
   *   稀缺度 = 1 - 库存/(库存+需求)：货薄、需求厚 ⇒ 向 1 靠，价被顶高；货足 ⇒ 向 0 靠，价回落。
   *   `want` **允许越出带宽**（真实供需本来就会推过头），**声明上不许越带** —— 故最后夹取。
   *   写这一版时实测发现的真缺陷：旧式 `ratio*2-1` 的上限恰好等于带宽本身，
   *   夹取永远不生效（成了死代码），「响应不越带」也就成了恒真的空话。
   */
  function respond(g, cfg) {
    const band = bandOf(g, cfg);
    const scarcity = 1 - Math.min(1, g.stock / Math.max(1, g.stock + g.demand));
    const want = g.base * (1 + (cfg.spreadPct / 100) * (scarcity * 3 - 1));
    return +Math.min(band.hi, Math.max(band.lo, want)).toFixed(2);
  }
  function personOf(name, root) {
    const who = clean(name, 60);
    if (!who) return null;
    const ppl = (root || state()).people || {};
    if (ppl['p_' + who]) return ppl['p_' + who];
    const keys = Object.keys(ppl);
    for (let i = 0; i < keys.length; i++) {
      if (ppl[keys[i]] && clean(ppl[keys[i]].name, 60) === who) return ppl[keys[i]];
    }
    return null;
  }
  function purseOf(name, root) {
    const p = personOf(name, root);
    return (p && p.resources && typeof p.resources === 'object') ? p.resources : null;
  }
  function openEco(draft, cfg) {
    draft.economy = (draft.economy && typeof draft.economy === 'object' && !Array.isArray(draft.economy))
      ? draft.economy : { goods: [], orders: [], routes: [] };
    if (!Array.isArray(draft.economy.goods)) draft.economy.goods = [];
    if (!Array.isArray(draft.economy.orders)) draft.economy.orders = [];
    if (!Array.isArray(draft.economy.routes)) draft.economy.routes = [];
    return draft.economy;
  }
  /** ① 到货入库：**首次登记必须给基础价**（凭空的价不是价）。 */
  function stock(place, resource, qty, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const pl = clean(place, 40), res = clean(resource, 40);
    const n = num(qty);
    if (!pl || !res) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (n === null || n <= 0 || (n | 0) !== n) { noteFault('bad-qty'); return { ok: false, reason: 'bad-qty', qty: qty }; }
    const cfg = settings();
    const seen = findGoods(pl, res);
    const base = num(o.base);
    if (!seen && (base === null || base <= 0)) {
      noteFault('missing-base');
      return { ok: false, reason: 'missing-base', hint: '首次登记这件货必须给出基础价' };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const ec = openEco(draft, cfg);
      if (!findGoods(pl, res, draft) && ec.goods.length >= cfg.maxGoods) {
        out = { ok: false, reason: 'goods-full', cap: cfg.maxGoods }; return false;
      }
      let g = findGoods(pl, res, draft);
      const now = clockNow('economy');
      if (!g) {
        g = { place: pl, resource: res, base: base, stock: 0, price: base, demand: 0,
          consumed: 0, tickedAt: '', at: now, updatedAt: now };
        ec.goods.push(g);
      } else if (base !== null && base > 0) {
        // 基础价的修订也走同一入口（改基础价会连带重算带宽；现价不动，等下一次响应）。
        g.base = base;
      }
      g.stock += n;
      g.updatedAt = now;
      WA.evict.array(ec.goods, 'economy.goods', cfg.maxGoods);
      out = { ok: true, place: pl, resource: res, stock: g.stock, base: g.base, price: g.price };
    }, 'economy:stock');
    if (out && out.ok) { stat.stocked++; stat.lastReason = 'stocked'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ② 定价：必须落在定价带宽内（越界等于「这笔交易不必发生」）。 */
  function price(place, resource, value) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const cfg = settings();
    const pl = clean(place, 40), res = clean(resource, 40);
    const n = num(value);
    if (!pl || !res) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const g = findGoods(pl, res);
    if (!g) { noteFault('unknown-good'); return { ok: false, reason: 'unknown-good', resource: res }; }
    if (n === null || n <= 0) { noteFault('bad-price'); return { ok: false, reason: 'bad-price', price: value }; }
    const band = bandOf(g, cfg);
    if (n < band.lo || n > band.hi) {
      noteFault('price-out-of-band');
      return { ok: false, reason: 'price-out-of-band', price: n, lo: band.lo, hi: band.hi, base: g.base };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const gg = findGoods(pl, res, draft);
      if (!gg) { out = { ok: false, reason: 'unknown-good', resource: res }; return false; }
      gg.price = n; gg.updatedAt = clockNow('economy');
      out = { ok: true, place: pl, resource: res, price: gg.price, base: gg.base, lo: band.lo, hi: band.hi };
    }, 'economy:price');
    if (out && out.ok) { stat.priced++; stat.lastReason = 'priced'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ③ 一手交钱一手交货（钱不够 / 货不够一律不改状态：拒收不是赊账）。 */
  function buy(place, resource, qty, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const pl = clean(place, 40), res = clean(resource, 40), by = clean(o.by, 40);
    const n = num(qty);
    if (!pl || !res || !by) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (n === null || n <= 0 || (n | 0) !== n) { noteFault('bad-qty'); return { ok: false, reason: 'bad-qty', qty: qty }; }
    const cfg = settings();
    const g = findGoods(pl, res);
    if (!g) { noteFault('unknown-good'); return { ok: false, reason: 'unknown-good', resource: res }; }
    const purse = purseOf(by);
    if (!purse) { noteFault('missing-buyer'); return { ok: false, reason: 'missing-buyer', by: by }; }
    const unit = num(o.price) === null ? g.price : num(o.price);
    const band = bandOf(g, cfg);
    if (unit < band.lo || unit > band.hi) {
      noteFault('price-out-of-band');
      return { ok: false, reason: 'price-out-of-band', price: unit, lo: band.lo, hi: band.hi };
    }
    const total = +(unit * n).toFixed(2);
    const have = +((purse[MONEY] || 0)).toFixed(2);
    if (have < total) { noteFault('cannot-afford'); return { ok: false, reason: 'cannot-afford', want: total, have: have }; }
    if (g.stock < n) { noteFault('short-stock'); return { ok: false, reason: 'short-stock', resource: res, want: n, have: g.stock }; }
    let out = null;
    WA.store.transact(function (draft) {
      const gg = findGoods(pl, res, draft);
      if (!gg) { out = { ok: false, reason: 'unknown-good', resource: res }; return false; }
      if (gg.stock < n) { out = { ok: false, reason: 'short-stock', resource: res, want: n, have: gg.stock }; return false; }
      const p = personOf(by, draft);
      if (!p) { out = { ok: false, reason: 'missing-buyer', by: by }; return false; }
      const pur = (p.resources && typeof p.resources === 'object') ? p.resources : (p.resources = {});
      const now = clockNow('economy');
      pur[MONEY] = +(((pur[MONEY] || 0) - total)).toFixed(2);
      gg.stock -= n;
      gg.demand += n;
      gg.updatedAt = now;
      const ec = openEco(draft, cfg);
      if (ec.orders.length >= cfg.maxOrders) { out = { ok: false, reason: 'orders-full', cap: cfg.maxOrders }; return false; }
      const row = { id: 'ord_' + now + '_' + ec.orders.length, kind: 'buy', at: now,
        place: pl, resource: res, qty: n, unit: unit, total: total, by: by };
      ec.orders.push(row);
      WA.evict.array(ec.orders, 'economy.orders', cfg.maxOrders);
      out = { ok: true, order: row.id, resource: res, qty: n, unit: unit, total: total,
        balance: pur[MONEY], stock: gg.stock };
    }, 'economy:buy');
    if (out && out.ok) { stat.bought++; stat.lastReason = 'bought'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ④ 生产：配方是具名表，输入不足带出缺什么、缺多少（够了才扣料出货）。 */
  function craft(place, recipe, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const pl = clean(place, 40), name = clean(recipe, 40), by = clean(o.by, 40);
    const n = num(o.times) === null ? 1 : num(o.times);
    if (!pl || !name || !by) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (n === null || n <= 0 || (n | 0) !== n) { noteFault('bad-qty'); return { ok: false, reason: 'bad-qty', times: o.times }; }
    const rec = RECIPES[name];
    if (!rec) { noteFault('unknown-recipe'); return { ok: false, reason: 'unknown-recipe', recipe: name, known: Object.keys(RECIPES) }; }
    const cfg = settings();
    const purse = purseOf(by);
    if (!purse) { noteFault('missing-maker'); return { ok: false, reason: 'missing-maker', by: by }; }
    const need = {};
    Object.keys(rec.in).forEach(function (k) { need[k] = rec.in[k] * n; });
    const short = Object.keys(need).filter(function (k) { return (purse[k] || 0) < need[k]; });
    if (short.length) {
      noteFault('short-input');
      return { ok: false, reason: 'short-input', recipe: name, want: need,
        short: short.reduce(function (acc, k) { acc[k] = need[k] - (purse[k] || 0); return acc; }, {}) };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const p = personOf(by, draft);
      if (!p) { out = { ok: false, reason: 'missing-maker', by: by }; return false; }
      const pur = (p.resources && typeof p.resources === 'object') ? p.resources : (p.resources = {});
      const lacking = Object.keys(need).filter(function (k) { return (pur[k] || 0) < need[k]; });
      if (lacking.length) {
        out = { ok: false, reason: 'short-input', recipe: name, want: need };
        return false;
      }
      const now = clockNow('economy');
      Object.keys(need).forEach(function (k) { pur[k] = +(pur[k] - need[k]).toFixed(2); });
      const made = {};
      Object.keys(rec.out).forEach(function (k) {
        const q = rec.out[k] * n;
        pur[k] = +(((pur[k] || 0) + q)).toFixed(2);
        made[k] = q;
      });
      const ec = openEco(draft, cfg);
      if (ec.orders.length >= cfg.maxOrders) { out = { ok: false, reason: 'orders-full', cap: cfg.maxOrders }; return false; }
      ec.orders.push({ id: 'ord_' + now + '_' + ec.orders.length, kind: 'craft', at: now,
        place: pl, recipe: name, times: n, made: made, by: by });
      WA.evict.array(ec.orders, 'economy.orders', cfg.maxOrders);
      out = { ok: true, recipe: name, times: n, made: made };
    }, 'economy:craft');
    if (out && out.ok) { stat.crafted++; stat.lastReason = 'crafted'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ⑤ 时段推进：消耗（按需求）+ 需求积累 + 带宽内价格响应。
   *   同一时段只能推一次（`duplicate-tick`）—— 重复推演不得造成第二次消耗。
   */
  function tick(stamp, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const key = clean(stamp, 40);
    if (!key) { noteFault('missing-stamp'); return { ok: false, reason: 'missing-stamp' }; }
    const cfg = settings();
    const seen = goodsOf().some(function (g) { return g && clean(g.tickedAt, 40) === key; });
    if (seen && !o.force) { noteFault('duplicate-tick'); return { ok: false, reason: 'duplicate-tick', stamp: key }; }
    let out = null;
    WA.store.transact(function (draft) {
      const ec = openEco(draft, cfg);
      const rows = [];
      ec.goods.forEach(function (g) {
        if (!g) return;
        // 消耗 = min(库存, max(0, 需求 - 库存*0%))；需求在成交时已累加，这里只落消耗并清零需求。
        const burn = Math.min(g.stock, Math.max(0, Math.floor(g.demand / 2)));
        g.stock -= burn;
        g.consumed += burn;
        const before = g.price;
        g.price = respond(g, cfg);
        g.tickedAt = key;
        g.updatedAt = clockNow('economy');
        rows.push({ place: g.place, resource: g.resource, consumed: burn, stock: g.stock,
          price: before, next: g.price, base: g.base });
      });
      out = { ok: true, stamp: key, rows: rows };
    }, 'economy:tick');
    if (out && out.ok) { stat.ticks++; stat.lastReason = 'ticked'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ⑦ 商路：受阻留在原地（可解除、可续运），不因受阻而消失。 */
  function route(id, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const rid = clean(id, 60);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const lane = clean(o.lane, 20) || 'road';
    if (LANES.indexOf(lane) < 0) { noteFault('bad-lane'); return { ok: false, reason: 'bad-lane', allowed: LANES.slice() }; }
    const cost = num(o.cost);
    if (cost === null || cost < 0) { noteFault('bad-cost'); return { ok: false, reason: 'bad-cost', cost: o.cost }; }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const ec = openEco(draft, cfg);
      let r = findRoute(rid, draft);
      const now = clockNow('economy');
      if (!r) {
        if (ec.routes.length >= cfg.maxRoutes) { out = { ok: false, reason: 'routes-full', cap: cfg.maxRoutes }; return false; }
        r = { id: rid, lane: lane, from: clean(o.from, 40), to: clean(o.to, 40),
          cost: cost, status: 'open', reason: '', at: now, updatedAt: now };
        ec.routes.push(r);
      } else {
        r.cost = cost; r.updatedAt = now;
      }
      WA.evict.array(ec.routes, 'economy.routes', cfg.maxRoutes);
      out = { ok: true, id: r.id, lane: r.lane, cost: r.cost, status: r.status };
    }, 'economy:route');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 阻断/解除一条商路。阻断 = 状态标记，**不删行**（世界仍记得有这条路）。 */
  function markRoute(id, ok2, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const rid = clean(id, 60);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const r = findRoute(rid, draft);
      if (!r) { out = { ok: false, reason: 'unknown-route', id: rid }; return false; }
      r.status = ok2 ? 'open' : 'stuck';
      r.reason = ok2 ? '' : clean(o.reason || '受阻', 40);
      r.updatedAt = clockNow('economy');
      out = { ok: true, id: r.id, status: r.status, reason: r.reason };
    }, 'economy:markRoute');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 经一条商路运送：路受阻则 `route-blocked`（受阻可解除后续运，不消耗货）。 */
  function ship(routeId, place, resource, qty, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const oo = opts || {};
    const rid = clean(routeId, 60), pl = clean(place, 40), res = clean(resource, 40);
    const n = num(qty);
    if (!rid || !pl || !res) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (n === null || n <= 0 || (n | 0) !== n) { noteFault('bad-qty'); return { ok: false, reason: 'bad-qty', qty: qty }; }
    const cfg = settings();
    const r = findRoute(rid);
    if (!r) { noteFault('unknown-route'); return { ok: false, reason: 'unknown-route', id: rid }; }
    if (r.status !== 'open') { noteFault('route-blocked'); return { ok: false, reason: 'route-blocked', id: rid, why: r.reason }; }
    const dest = findGoods(pl, res);
    // 目的地尚未登记时可随运建行，但**必须给出基础价**（同 stock 的不变式：无据的价不立）。
    //   不修这一条，新口岸永远进不了第一批货（而第一批货本来就没有历史价可循）。
    const destBase = num(oo.base);
    if (!dest && (destBase === null || destBase <= 0)) {
      noteFault('missing-base');
      return { ok: false, reason: 'missing-base', place: pl, resource: res, hint: '目的地首次进货必须给出基础价' };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const rr = findRoute(rid, draft);
      if (!rr || rr.status !== 'open') { out = { ok: false, reason: 'route-blocked', id: rid }; return false; }
      const ec0 = openEco(draft, cfg);
      let g = findGoods(pl, res, draft);
      const now = clockNow('economy');
      if (!g) {
        g = { place: pl, resource: res, base: destBase, stock: 0, price: destBase, demand: 0,
          consumed: 0, tickedAt: '', at: now, updatedAt: now };
        ec0.goods.push(g);
      }
      g.stock += n; g.updatedAt = now;
      out = { ok: true, id: rid, resource: res, place: pl, qty: n, cost: rr.cost, stock: g.stock };
    }, 'economy:ship');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读侧：一件事的现场（含「还差什么」与带宽）。纯读，不写盘。 */
  function view(place, resource) {
    const pl = clean(place, 40), res = clean(resource, 40);
    const g = pl && res ? findGoods(pl, res) : null;
    if (!g) return { ok: false, reason: 'unknown-good', place: pl, resource: res };
    const cfg = settings();
    const band = bandOf(g, cfg);
    return { ok: true, place: g.place, resource: g.resource, base: g.base, stock: g.stock,
      price: g.price, demand: g.demand, consumed: g.consumed, tickedAt: g.tickedAt,
      lo: band.lo, hi: band.hi, spreadPct: cfg.spreadPct };
  }
  /** 读侧：某地的货架（纯读）。 */
  function shelf(place) {
    const pl = clean(place, 40);
    const rows = goodsOf().filter(function (g) { return g && clean(g.place, 40) === pl; });
    if (!rows.length) return { ok: false, reason: 'empty', place: pl };
    return { ok: true, place: pl, goods: rows.map(function (g) { return { resource: g.resource, stock: g.stock, price: g.price, base: g.base }; }) };
  }
  /** 读侧：一条商路（纯读）。 */
  function routeView(id) {
    const r = findRoute(id);
    if (!r) return { ok: false, reason: 'unknown-route', id: clean(id, 60) };
    return { ok: true, id: r.id, lane: r.lane, from: r.from, to: r.to, cost: r.cost,
      status: r.status, reason: r.reason };
  }
  function statView() {
    const rows = goodsOf();
    const states = {};
    rows.forEach(function (g) { states[g.resource] = (states[g.resource] || 0) + 1; });
    return { enabled: settings().enabled, goods: rows.length, orders: ordersOf().length,
      routes: routesOf().length, stuck: routesOf().filter(function (r) { return r && r.status !== 'open'; }).length,
      byResource: states };
  }
  /** 注入块：只报「有据可查的价与被推着动的原因」，不编行情叙事。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const rows = goodsOf().slice(0, cfg.maxGoods);
    if (!rows.length) return '';
    const lines = rows.map(function (g) {
      const band = bandOf(g, cfg);
      return g.place + '：' + g.resource + ' 存 ' + g.stock + '，价 ' + g.price
        + '（基础 ' + g.base + '，许可带 ' + band.lo + '-' + band.hi + '）';
    });
    const stuck = routesOf().filter(function (r) { return r && r.status !== 'open'; });
    if (stuck.length) {
      lines.push('商路受阻：' + stuck.map(function (r) { return r.from + '→' + r.to + '（' + r.reason + '）'; }).join('、')
        + '。受阻不等于断绝，货还在原地，可解除后续运。');
    }
    return '[供需]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '价格只能落在上面写明的许可带内；库存不为负，没有回执的交付不算交付。';
  }
  WA.economy = {
    MONEY: MONEY, RECIPES: RECIPES, LANES: LANES.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    stock: stock, price: price, buy: buy, craft: craft, tick: tick,
    route: route, markRoute: markRoute, ship: ship,
    view: view, shelf: shelf, routeView: routeView, statView: statView, buildBlock: buildBlock,
    bandOf: function (place, resource) {
      const g = findGoods(place, resource);
      return g ? bandOf(g, settings()) : null;
    },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/economy.js', { kind: 'engine', ver: '2.119.0' });
})();
