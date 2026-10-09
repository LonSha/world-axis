/**
 * WorldAxis engines/freight.js (v2.167.0) — 守恒运输与在途履约（TX3）
 *
 * ── 它治什么（缺口）────────────────────────────────────────
 *   economy.ship 即时增加目的地库存——无源扣减、无在途跟踪、无到货回执。
 *   这不是守恒运输系统：凭空增加了世界总库存量，且无法回答「这批货走到哪了」。
 *   TX3 补的就是这一层：源扣减 → 在途跟踪 → 到货入库 → 守恒校验。
 *
 * ── 与 economy.ship 的分工（不重叠）────────────────────────
 *   · economy.ship = 即时补货（旧语义保留，不悄悄改成新运输）
 *   · 本模块        = 守恒运输（源扣减 + 在途 + 到货 + 取消/改道）
 *   两者并存：旧 ship 标注为即时补货，freight 是真正的守恒运输。
 *   economy.goods 仍是库存唯一真源；freight 是 economy.goods 的协调写者
 *   （dispatch 扣源、arrive 到货），与 economy 内部的 stock/buy/tick/ship 同层。
 *
 * ── 八条否定式边界 ────────────────────────────────────────
 *   ① 默认关（enabled:false）——运输会扣库存改世界
 *   ② 守恒：源扣减 + 在途 = 原量；到货后 在途→目的地
 *   ③ 未到货库存不可买（在途 ≠ 已抵达）
 *   ④ 缺路线/缺运输时长 → 拒算（不凭空造距离）
 *   ⑤ 封路保留货物（不消失，可解除续运）
 *   ⑥ 取消按已执行阶段结算（退货运、损运费，不全额退也不全损）
 *   ⑦ 重复到货被状态标记拦截（幂等：status !== 'transit' 即拒）
 *   ⑧ 不凭空造库存/造路线/造资源（economy 是库存真源，本模块只协调）
 *
 * ── 玩家路径 ────────────────────────────────────────────
 *   查看已知缺货与报价 → 采购/生产 → 选择路线、费用与预计时间 →
 *   发运 → 遭遇封路或外交限制 → 等待、改道或取消 → 到货后供应与价格真实变化
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // ── 工具函数（与 economy/agency 同规格）──
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : ''); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function clockNow(site) { try { return WA.clock ? WA.clock.now(site || 'freight') : Date.now(); } catch (e) { return Date.now(); } }
  var MS_PER_DAY = 86400000;
  // ── 设置 ──
  var LS_KEY = 'worldaxis_freight_settings_v1';
  var DEF = { enabled: false, maxShipments: 32 };
  var __REG = { key: LS_KEY, def: DEF, module: 'freight',
    bounds: { maxShipments: [4, 64] } };
  function settings() {
    var raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // ── 统计 ──
  var stat = { dispatched: 0, arrived: 0, cancelled: 0, rerouted: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.blocked++; stat.lastReason = reason;
  }
  // ── Store 辅助（读 economy 既有面 + 自有 shipments 台账）──
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function ecoOf(root) { return (root && root.economy) ? root.economy : { goods: [], orders: [], routes: [] }; }
  function ecoGoods(root) { var c = ecoOf(root || state()); return Array.isArray(c.goods) ? c.goods : []; }
  function ecoRoutes(root) { var c = ecoOf(root || state()); return Array.isArray(c.routes) ? c.routes : []; }
  function findRoute(id, root) {
    var key = clean(id, 60);
    return ecoRoutes(root).filter(function (r) { return r && clean(r.id, 60) === key; })[0] || null;
  }
  function findGoods(place, resource, root) {
    var pl = clean(place, 40), res = clean(resource, 40);
    return ecoGoods(root).filter(function (g) { return g && clean(g.place, 40) === pl && clean(g.resource, 40) === res; })[0] || null;
  }
  function openFreight(draft) {
    if (!draft.freight) draft.freight = { shipments: [] };
    if (!Array.isArray(draft.freight.shipments)) draft.freight.shipments = [];
    return draft.freight;
  }
  function shipmentsOf() {
    var f = state().freight;
    return (f && Array.isArray(f.shipments)) ? f.shipments : [];
  }
  function findShipment(id) {
    var key = clean(id, 60);
    return shipmentsOf().filter(function (s) { return s && clean(s.id, 60) === key; })[0] || null;
  }
  // ── ① dispatch：源扣减 + 创建在途记录 ──
  function dispatch(routeId, from, resource, qty, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    var o = opts || {};
    var rid = clean(routeId, 60), src = clean(from, 40), res = clean(resource, 40);
    var n = num(qty);
    if (!rid || !src || !res) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (n === null || n <= 0 || (n | 0) !== n) { noteFault('bad-qty'); return { ok: false, reason: 'bad-qty', qty: qty }; }
    var cfg = settings();
    var r = findRoute(rid);
    if (!r) { noteFault('unknown-route'); return { ok: false, reason: 'unknown-route', id: rid }; }
    if (r.status !== 'open') { noteFault('route-blocked'); return { ok: false, reason: 'route-blocked', id: rid, why: r.reason }; }
    var dest = clean(r.to, 40) || clean(o.to, 40);
    if (!dest) { noteFault('missing-dest'); return { ok: false, reason: 'missing-dest', hint: '路线缺少目的地' }; }
    var g = findGoods(src, res);
    if (!g) { noteFault('unknown-source'); return { ok: false, reason: 'unknown-source', place: src, resource: res }; }
    if (g.stock < n) { noteFault('short-stock'); return { ok: false, reason: 'short-stock', resource: res, want: n, have: g.stock }; }
    var days = num(o.transitDays);
    if (days === null || days <= 0) { noteFault('missing-transit-time'); return { ok: false, reason: 'missing-transit-time', hint: '运输时长未指定，缺少距离就拒算' }; }
    // 目的地首次进货需基础价（与 economy.ship 同口径：无据的价不立）
    var destGoods = findGoods(dest, res);
    var destBase = num(o.base);
    if (!destGoods && (destBase === null || destBase <= 0)) {
      noteFault('missing-base');
      return { ok: false, reason: 'missing-base', place: dest, resource: res, hint: '目的地首次进货必须给出基础价' };
    }
    var now = clockNow('freight');
    var eta = now + Math.round(days * MS_PER_DAY);
    var out = null;
    WA.store.transact(function (draft) {
      var gg = findGoods(src, res, draft);
      if (!gg || gg.stock < n) { out = { ok: false, reason: 'short-stock', resource: res, want: n, have: gg ? gg.stock : 0 }; return false; }
      var rr = findRoute(rid, draft);
      if (!rr || rr.status !== 'open') { out = { ok: false, reason: 'route-blocked', id: rid }; return false; }
      // 扣减源库存
      gg.stock -= n;
      gg.updatedAt = now;
      // 创建在途记录
      var fr = openFreight(draft);
      if (fr.shipments.length >= cfg.maxShipments) { out = { ok: false, reason: 'shipments-full', cap: cfg.maxShipments }; return false; }
      var sid = 'shp_' + now + '_' + fr.shipments.length;
      fr.shipments.push({
        id: sid, routeId: rid, from: src, to: dest, resource: res, qty: n,
        status: 'transit', dispatchedAt: now, eta: eta, arrivedAt: null,
        cancelledAt: null, refund: 0, loss: rr.cost, reroutedFrom: null,
        lane: rr.lane, cost: rr.cost, destBase: destBase || (destGoods ? destGoods.base : null),
        at: now, updatedAt: now
      });
      WA.evict.array(fr.shipments, 'freight.shipments', cfg.maxShipments);
      out = { ok: true, id: sid, qty: n, from: src, to: dest, resource: res, eta: eta, stock: gg.stock };
    }, 'freight:dispatch');
    if (out && out.ok) { stat.dispatched++; stat.lastReason = 'dispatched'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  // ── ② arrive：到货入库（在途 → 目的地）──
  function arrive(shipmentId, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    var o = opts || {};
    var sid = clean(shipmentId, 60);
    if (!sid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    var sh = findShipment(sid);
    if (!sh) { noteFault('unknown-shipment'); return { ok: false, reason: 'unknown-shipment', id: sid }; }
    if (sh.status === 'arrived') { noteFault('already-arrived'); return { ok: false, reason: 'already-arrived', id: sid }; }
    if (sh.status !== 'transit') { noteFault('bad-state'); return { ok: false, reason: 'bad-state', id: sid, status: sh.status }; }
    var now = clockNow('freight');
    if (now < sh.eta && !o.force) {
      noteFault('too-early');
      return { ok: false, reason: 'too-early', id: sid, eta: sh.eta, remaining: sh.eta - now };
    }
    var out = null;
    WA.store.transact(function (draft) {
      var fr = openFreight(draft);
      var s = fr.shipments.filter(function (x) { return x && clean(x.id, 60) === sid; })[0] || null;
      if (!s) { out = { ok: false, reason: 'unknown-shipment', id: sid }; return false; }
      if (s.status !== 'transit') { out = { ok: false, reason: 'bad-state', id: sid, status: s.status }; return false; }
      // 到货入库：写入 economy.goods（库存真源）
      var ec = draft.economy;
      if (!ec) ec = draft.economy = { goods: [], orders: [], routes: [] };
      if (!Array.isArray(ec.goods)) ec.goods = [];
      var dg = ec.goods.filter(function (g) { return g && clean(g.place, 40) === clean(s.to, 40) && clean(g.resource, 40) === clean(s.resource, 40); })[0] || null;
      if (!dg) {
        var base = num(o.base) !== null ? num(o.base) : s.destBase;
        if (base === null || base <= 0) { out = { ok: false, reason: 'missing-base', place: s.to, resource: s.resource }; return false; }
        dg = { place: clean(s.to, 40), resource: clean(s.resource, 40), base: base, stock: 0, price: base, demand: 0, consumed: 0, tickedAt: '', at: now, updatedAt: now };
        ec.goods.push(dg);
      }
      dg.stock += s.qty;
      dg.updatedAt = now;
      s.status = 'arrived';
      s.arrivedAt = now;
      s.updatedAt = now;
      out = { ok: true, id: sid, qty: s.qty, to: s.to, resource: s.resource, stock: dg.stock };
    }, 'freight:arrive');
    if (out && out.ok) { stat.arrived++; stat.lastReason = 'arrived'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  // ── ③ cancel：取消（退货运、损运费）──
  function cancel(shipmentId, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    var sid = clean(shipmentId, 60);
    if (!sid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    var sh = findShipment(sid);
    if (!sh) { noteFault('unknown-shipment'); return { ok: false, reason: 'unknown-shipment', id: sid }; }
    if (sh.status !== 'transit') { noteFault('bad-state'); return { ok: false, reason: 'bad-state', id: sid, status: sh.status }; }
    var now = clockNow('freight');
    var out = null;
    WA.store.transact(function (draft) {
      var fr = openFreight(draft);
      var s = fr.shipments.filter(function (x) { return x && clean(x.id, 60) === sid; })[0] || null;
      if (!s) { out = { ok: false, reason: 'unknown-shipment', id: sid }; return false; }
      if (s.status !== 'transit') { out = { ok: false, reason: 'bad-state', id: sid, status: s.status }; return false; }
      // 退货至源库存
      var ec = draft.economy;
      if (!ec) ec = draft.economy = { goods: [], orders: [], routes: [] };
      if (!Array.isArray(ec.goods)) ec.goods = [];
      var sg = ec.goods.filter(function (g) { return g && clean(g.place, 40) === clean(s.from, 40) && clean(g.resource, 40) === clean(s.resource, 40); })[0] || null;
      if (sg) { sg.stock += s.qty; sg.updatedAt = now; }
      // 运费损失（已付出，不退）
      s.status = 'cancelled';
      s.cancelledAt = now;
      s.refund = s.qty;
      s.loss = s.cost;
      s.updatedAt = now;
      out = { ok: true, id: sid, refund: s.qty, loss: s.cost, from: s.from, resource: s.resource };
    }, 'freight:cancel');
    if (out && out.ok) { stat.cancelled++; stat.lastReason = 'cancelled'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  // ── ④ reroute：改道（换路线、重估 ETA）──
  function reroute(shipmentId, newRouteId, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    var o = opts || {};
    var sid = clean(shipmentId, 60), nrid = clean(newRouteId, 60);
    if (!sid || !nrid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    var sh = findShipment(sid);
    if (!sh) { noteFault('unknown-shipment'); return { ok: false, reason: 'unknown-shipment', id: sid }; }
    if (sh.status !== 'transit') { noteFault('bad-state'); return { ok: false, reason: 'bad-state', id: sid, status: sh.status }; }
    var nr = findRoute(nrid);
    if (!nr) { noteFault('unknown-route'); return { ok: false, reason: 'unknown-route', id: nrid }; }
    if (nr.status !== 'open') { noteFault('route-blocked'); return { ok: false, reason: 'route-blocked', id: nrid, why: nr.reason }; }
    var days = num(o.transitDays);
    if (days === null || days <= 0) { noteFault('missing-transit-time'); return { ok: false, reason: 'missing-transit-time', hint: '改道后运输时长须重新给定' }; }
    var now = clockNow('freight');
    var newEta = now + Math.round(days * MS_PER_DAY);
    var out = null;
    WA.store.transact(function (draft) {
      var fr = openFreight(draft);
      var s = fr.shipments.filter(function (x) { return x && clean(x.id, 60) === sid; })[0] || null;
      if (!s) { out = { ok: false, reason: 'unknown-shipment', id: sid }; return false; }
      if (s.status !== 'transit') { out = { ok: false, reason: 'bad-state', id: sid, status: s.status }; return false; }
      s.reroutedFrom = s.routeId;
      s.routeId = nrid;
      s.eta = newEta;
      s.cost = nr.cost;
      s.lane = nr.lane;
      s.updatedAt = now;
      out = { ok: true, id: sid, newRouteId: nrid, newEta: newEta, oldRouteId: s.reroutedFrom };
    }, 'freight:reroute');
    if (out && out.ok) { stat.rerouted++; stat.lastReason = 'rerouted'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  // ── ⑤ view：查看单笔货运（含守恒校验）──
  function view(shipmentId) {
    var sid = clean(shipmentId, 60);
    var sh = findShipment(sid);
    if (!sh) return { ok: false, reason: 'unknown-shipment', id: sid };
    var srcG = findGoods(sh.from, sh.resource);
    var destG = findGoods(sh.to, sh.resource);
    var inTransit = (sh.status === 'transit') ? sh.qty : 0;
    var arrived = (sh.status === 'arrived') ? sh.qty : 0;
    var refunded = (sh.status === 'cancelled') ? sh.refund : 0;
    return {
      ok: true,
      id: sh.id, status: sh.status, from: sh.from, to: sh.to, resource: sh.resource, qty: sh.qty,
      dispatchedAt: sh.dispatchedAt, eta: sh.eta, arrivedAt: sh.arrivedAt, cancelledAt: sh.cancelledAt,
      refund: sh.refund, loss: sh.loss, routeId: sh.routeId, lane: sh.lane, cost: sh.cost,
      reroutedFrom: sh.reroutedFrom,
      sourceStock: srcG ? srcG.stock : null,
      destStock: destG ? destG.stock : null,
      conservation: 'qty=' + sh.qty + ' 在途=' + inTransit + ' 到货=' + arrived + ' 退款=' + refunded + ' (=qty)'
    };
  }
  // ── 注入块：只报在途货物，不编行情叙事 ──
  function buildBlock() {
    var cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    var ships = shipmentsOf();
    if (!ships.length) return '';
    var transit = ships.filter(function (s) { return s && s.status === 'transit'; });
    if (!transit.length) return '';
    var lines = transit.slice(0, cfg.maxShipments).map(function (s) {
      var remaining = Math.max(0, Math.ceil((s.eta - clockNow('freight')) / MS_PER_DAY * 10) / 10);
      return s.from + '→' + s.to + '：' + s.resource + ' ' + s.qty + '（在途，约剩 ' + remaining + ' 天）';
    });
    return '[货运在途]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '在途货物尚未抵达目的地，不可购买；到货需确认 ETA 后方可入库。';
  }
  // ── 诊断面：自证 closedLoop（economy + store 双在）──
  function diagnose() {
    var cfg = settings();
    var ships = shipmentsOf();
    var transit = ships.filter(function (s) { return s && s.status === 'transit'; });
    var arrived = ships.filter(function (s) { return s && s.status === 'arrived'; });
    var cancelled = ships.filter(function (s) { return s && s.status === 'cancelled'; });
    return {
      enabled: cfg.enabled,
      economyAvailable: !!(WA.economy),
      storeAvailable: !!(WA.store && WA.store.get && WA.store.transact),
      closedLoop: !!(WA.economy && WA.store),
      shipments: ships.length,
      inTransit: transit.length,
      arrived: arrived.length,
      cancelled: cancelled.length,
      cap: cfg.maxShipments
    };
  }
  // ── 统计面 ──
  function statView() {
    return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) });
  }
  // ── 导出 ──
  WA.freight = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign({}, settings(), patch || {})); },
    dispatch: dispatch,
    arrive: arrive,
    cancel: cancel,
    reroute: reroute,
    view: view,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: statView
  };
  // ── 自证块（导出数 === 10）──
  var EXPECTED = ['getSettings','setSettings','dispatch','arrive','cancel','reroute','view','buildBlock','diagnose','stat'];
  var exported = Object.keys(WA.freight).sort();
  if (exported.length !== EXPECTED.length) {
    WA.__freightWarn = 'export mismatch: expected ' + EXPECTED.length + ' got ' + exported.length;
  }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/freight.js', { kind: 'engine', ver: '2.167.0' });
})();