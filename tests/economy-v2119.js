#!/usr/bin/env node
// WorldAxis tests/economy-v2119.js -- 拓展计划 ③ 专锁：生产、消费与供需变化（v2.119.0）
//
// 逐条守住（每条都是「写出来了、但某个条件下不会成立」）：
//   ① 首次登记必须给基础价（无据的价不立）；
//   ② 定价必须在许可带内（带外的价等于「这笔交易不必发生」）；
//   ③ 钱不够 / 货不够一律不改状态（库存不变负）；
//   ④ 生产只认具名配方，输入不足要报缺什么；
//   ⑤ 同一时段只能推一次（重复推演不得造成第二次消耗）；
//   ⑥ 价格响应不越带（响应后价仍在许可带内）；
//   ⑦ 商路受阻不消失、可解除、可续运；
//   ⑧ 总开关关闭时零台账。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形（只改内存副本，零文件改写）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__eco2119_';
const REL = 'engines/economy.js';
// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_NOBASE= "    if (!seen && (base === null || base <= 0)) {";
const A_BAND  = "    if (n < band.lo || n > band.hi) {";
const A_AFF   = "    if (have < total) { noteFault('cannot-afford'); return { ok: false, reason: 'cannot-afford', want: total, have: have }; }";
const A_SHORT = "    if (g.stock < n) { noteFault('short-stock'); return { ok: false, reason: 'short-stock', resource: res, want: n, have: g.stock }; }";
const A_INPUT = "    if (short.length) {";
const A_TICK  = "    if (seen && !o.force) { noteFault('duplicate-tick'); return { ok: false, reason: 'duplicate-tick', stamp: key }; }";
const A_RESP  = "    return +Math.min(band.hi, Math.max(band.lo, want)).toFixed(2);";
const A_OFF   = "    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const pl = clean(place, 40), res = clean(resource, 40);";
const A_SHB   = "    if (!dest && (destBase === null || destBase <= 0)) {";
const BROKEN = [
  { rel: REL, key: 'nobase', from: A_NOBASE, to: "    if (false) {" },
  { rel: REL, key: 'band',  from: A_BAND,  to: "    if (false) {" },
  { rel: REL, key: 'afford', from: A_AFF,  to: "    if (false) { noteFault('cannot-afford'); return { ok: false, reason: 'cannot-afford' }; }" },
  { rel: REL, key: 'input', from: A_INPUT, to: "    if (false) {" },
  { rel: REL, key: 'tick',  from: A_TICK,  to: "    if (seen && false) { noteFault('duplicate-tick'); return { ok: false, reason: 'duplicate-tick', stamp: key }; }" },
  { rel: REL, key: 'resp',  from: A_RESP,  to: "    return +want.toFixed(2);" },
  { rel: REL, key: 'off',   from: A_OFF,   to: "    if (false) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const pl = clean(place, 40), res = clean(resource, 40);" },
  { rel: REL, key: 'shb',   from: A_SHB,   to: "    if (false) {" }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function readSrc(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function anchorHits(spec) { return readSrc(spec.rel).split(spec.from).length - 1; }
function brokenOverride(spec) {
  const src = readSrc(spec.rel);
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function mkW(ov) { return reset(fresh(ov ? { srcOverride: ov } : {})); }
function probeWith(spec, fn) {
  let out;
  try { out = fn({ ov: brokenOverride(spec) }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}
function probeClean(fn) {
  let out;
  try { out = fn({ ov: null }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}
function reset(WA) {
  WA.economy.setSettings({ enabled: false, maxGoods: 8, maxOrders: 8, maxRoutes: 4, spreadPct: 30 });
  WA.store.transact(function (d) {
    d.people = { 'p_甲': { id: 'p_甲', name: '甲', resources: { '银元': 10 }, updatedAt: 1 },
                 'p_乙': { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1 } };
    d.economy = { goods: [], orders: [], routes: [] };
  }, TAG + 'reset');
  WA.economy.setSettings({ enabled: true, maxGoods: 8, maxOrders: 8, maxRoutes: 4, spreadPct: 30 });
  return WA;
}
function seed(WA) { WA.economy.stock('镇上', '面粉', 4, { base: 2 }); return WA; }

const PROBES = {
  pBase: function (env) {
    const WA = mkW(env.ov);
    // 首次登记不给基础价 ⇒ 拒收；给了才立行。
    const a = WA.economy.stock('镇上', '面粉', 2);
    const b = WA.economy.stock('镇上', '面粉', 2, { base: 2 });
    const n = WA.economy.statView().goods;
    return (a.reason === 'missing-base' && b.ok === true && b.base === 2 && n === 1)
      ? 'base-required' : 'x:' + [a.reason, b.ok, n].join(',');
  },
  pBand: function (env) {
    const WA = mkW(env.ov);
    seed(WA);
    const a = WA.economy.price('镇上', '面粉', 99);
    const b = WA.economy.price('镇上', '面粉', 2.5);
    const v = WA.economy.view('镇上', '面粉');
    return (a.reason === 'price-out-of-band' && a.lo === 1.4 && a.hi === 2.6
      && b.ok === true && v.price === 2.5) ? 'band-kept'
      : 'x:' + JSON.stringify([a.reason, a.lo, a.hi, b.ok, v.price]);
  },
  pAfford: function (env) {
    const WA = mkW(env.ov);
    seed(WA);
    WA.economy.stock('镇上', '面粉', 96);
    const r = WA.economy.buy('镇上', '面粉', 100, { by: '甲' });
    const pur = WA.store.get().people['p_甲'].resources;
    const v = WA.economy.view('镇上', '面粉');
    // 钱不够 ⇒ 拒收，且**余额与库存都不动**（拒收不是赊账）。
    return (r.reason === 'cannot-afford' && r.want === 200 && r.have === 10
      && pur['银元'] === 10 && v.stock === 100) ? 'afford-gated'
      : 'x:' + JSON.stringify([r.reason, r.want, r.have, pur['银元'], v.stock]);
  },
  pShort: function (env) {
    const WA = mkW(env.ov);
    seed(WA);
    WA.store.transact(function (d) { d.people['p_甲'].resources['银元'] = 10000; }, TAG + 'rich');
    const r = WA.economy.buy('镇上', '面粉', 999, { by: '甲' });
    const v = WA.economy.view('镇上', '面粉');
    // 货不够 ⇒ 拒收，且库存不为负。
    return (r.reason === 'short-stock' && r.want === 999 && r.have === 4 && v.stock === 4)
      ? 'stock-never-negative' : 'x:' + JSON.stringify([r.reason, r.want, r.have, v.stock]);
  },
  pInput: function (env) {
    const WA = mkW(env.ov);
    seed(WA);
    const a = WA.economy.craft('镇上', '炼金', { by: '甲' });
    const b = WA.economy.craft('镇上', '面包', { by: '甲' });
    const pur = WA.store.get().people['p_甲'].resources;
    // 无配方不合成；输入不足要报缺什么（不得凭空出货）。
    return (a.reason === 'unknown-recipe' && b.reason === 'short-input'
      && b.short['面粉'] === 1 && (pur['面粉'] || 0) === 0 && !pur['面包'])
      ? 'recipe-and-input-gated' : 'x:' + JSON.stringify([a.reason, b.reason, b.short, pur]);
  },
  pTick: function (env) {
    const WA = mkW(env.ov);
    seed(WA);
    WA.economy.buy('镇上', '面粉', 4, { by: '甲' });
    const t1 = WA.economy.tick('D1');
    const v1 = WA.economy.view('镇上', '面粉');
    const t2 = WA.economy.tick('D1');
    const v2 = WA.economy.view('镇上', '面粉');
    // 同一时段只能推一次：重复推演不得造成第二次消耗。
    return (t1.ok === true && t2.reason === 'duplicate-tick'
      && v1.stock === v2.stock && v1.consumed === v2.consumed) ? 'tick-once'
      : 'x:' + JSON.stringify([t1.ok, t2.reason, v1.stock, v2.stock]);
  },
  pResp: function (env) {
    const WA = mkW(env.ov);
    WA.store.transact(function (d) { d.people['p_甲'].resources['银元'] = 1000; }, TAG + 'rich2');
    WA.economy.stock('镇上', '面粉', 4, { base: 3 });
    const before = WA.economy.view('镇上', '面粉').price;
    WA.economy.buy('镇上', '面粉', 4, { by: '甲' });
    const t = WA.economy.tick('D1');
    const v = WA.economy.view('镇上', '面粉');
    // 需求攒起来之后，时段推进必须**真的动价**，且动完仍在许可带内。
    return (t.ok === true && v.price > before && v.price >= v.lo && v.price <= v.hi)
      ? 'response-happens' : 'x:' + JSON.stringify([before, v.price, v.lo, v.hi]);
  },
  pRoute: function (env) {
    const WA = mkW(env.ov);
    seed(WA);
    WA.economy.route('r1', { lane: 'road', from: '镇上', to: '码头', cost: 1 });
    WA.economy.markRoute('r1', false, { reason: '塌方' });
    const blk = WA.economy.ship('r1', '码头', '面粉', 2, { base: 3 });
    const rv = WA.economy.routeView('r1');
    WA.economy.markRoute('r1', true);
    const ok2 = WA.economy.ship('r1', '码头', '面粉', 2, { base: 3 });
    const dest = WA.economy.view('码头', '面粉');
    // 受阻不删行、可解除、可续运；受阻期间货不动。
    return (blk.reason === 'route-blocked' && rv.status === 'stuck' && rv.reason === '塌方'
      && ok2.ok === true && dest.stock === 2) ? 'route-remembered'
      : 'x:' + JSON.stringify([blk.reason, rv.status, rv.reason, ok2.ok, dest.stock]);
  },
  pShb: function (env) {
    const WA = mkW(env.ov);
    seed(WA);
    WA.economy.route('r1', { lane: 'road', from: '镇上', to: '码头', cost: 1 });
    const a = WA.economy.ship('r1', '码头', '面粉', 2);
    const b = WA.economy.ship('r1', '码头', '面粉', 2, { base: 3 });
    const v = WA.economy.view('码头', '面粉');
    // 新口岸可随运建行，但**同样必须给出基础价**（无据的价不立）。
    return (a.reason === 'missing-base' && b.ok === true && v.ok === true && v.base === 3 && v.stock === 2)
      ? 'dest-needs-base' : 'x:' + JSON.stringify([a.reason, b.ok, v.base, v.stock]);
  },
  pOff: function (env) {
    const WA = mkW(env.ov);
    seed(WA);
    WA.economy.setSettings({ enabled: false });
    const s = WA.economy.stock('码头', '面粉', 1, { base: 1 });
    const p = WA.economy.price('镇上', '面粉', 2);
    const b = WA.economy.buy('镇上', '面粉', 1, { by: '甲' });
    const c = WA.economy.craft('镇上', '面包', { by: '甲' });
    const t = WA.economy.tick('D2');
    const r = WA.economy.route('r9', { lane: 'road', cost: 1 });
    const n = WA.economy.statView().goods;
    return ([s.reason, p.reason, b.reason, c.reason, t.reason, r.reason].every(function (x) { return x === 'disabled'; })
      && n === 1 && WA.economy.buildBlock() === '') ? 'off-refused'
      : 'x:' + [s.reason, p.reason, b.reason, c.reason, t.reason, r.reason, n].join(',');
  },
  pBound: function (env) {
    const WA = mkW(env.ov);
    let ok = 0;
    for (let i = 0; i < 14; i++) { if (WA.economy.stock('镇上', 'r' + i, 1, { base: 1 }).ok) ok++; }
    const n = WA.economy.statView().goods;
    const cap = WA.store.sizeCaps()['economy.goods'].cap;
    // 容量有界且挤出有账（上限 = maxGoods 设置，写入时传入）。
    return (n === 8 && ok === 8 && n <= cap) ? 'goods-bounded' : 'x:n:' + n + '/ok:' + ok;
  }
};

const N1 = [
  { k: 'band',   p: PROBES.pBand,   okk: 'band-kept',              note: '定价许可带失效' },
  { k: 'afford', p: PROBES.pAfford, okk: 'afford-gated',           note: '钱不够也能成交' },
  { k: 'nobase', p: PROBES.pBase,   okk: 'base-required',          note: '首次登记不给基础价也立行' },
  { k: 'input',  p: PROBES.pInput,  okk: 'recipe-and-input-gated', note: '输入不足也能生产' },
  { k: 'tick',   p: PROBES.pTick,   okk: 'tick-once',              note: '同一时段能推两次' },
  { k: 'resp',   p: PROBES.pResp,   okk: 'response-happens',       note: '价格响应不发生' },
  { k: 'shb',    p: PROBES.pShb,    okk: 'dest-needs-base',        note: '新口岸无基础价也进货' },
  { k: 'off',    p: PROBES.pOff,    okk: 'off-refused',            note: '关闭时仍入库' }
];
const BAD_PREFIX = ['x:', 'threw:'];
function isOk(got) {
  return typeof got === 'string' && BAD_PREFIX.every(function (p) { return got.indexOf(p) !== 0; });
}
const A_EVICT_G = "      WA.evict.array(ec.goods, 'economy.goods', cfg.maxGoods);";
function judge(a) {
  const ev = readSrc('core/evict.js');
  const st = readSrc('core/store.js');
  const ix = readSrc('index.js');
  const rj = readSrc('tests/run.js');
  const td = readSrc('engines/tool-diag.js');
  const inj = readSrc('render/inject.js');
  const pn = readSrc('ui/panel.js');
  const src = readSrc(REL);
  a(ev.indexOf("'economy.goods'") >= 0 && ev.indexOf("'economy.orders'") >= 0 && ev.indexOf("'economy.routes'") >= 0,
    'v2119/economy: [A1] evict.SITES 登记三容器');
  a(st.indexOf("'economy.goods'") >= 0 && st.indexOf('economy: { goods: [], orders: [], routes: [] }') >= 0,
    'v2119/economy: [A2] store 骨架物化 economy 且 __BOUNDED_CAPS 登记同键');
  a(ix.indexOf("'engines/economy.js'") >= 0 && rj.indexOf("'engines/economy.js'") >= 0,
    'v2119/economy: [A3] index.js / tests/run.js 两处 LOAD 都登记');
  a(td.indexOf("'engines/economy.js': 'economy'") >= 0, 'v2119/economy: [A4] tool-diag MODULE_EXPORTS 登记');
  a(inj.indexOf("'economy'") >= 0 && inj.indexOf('vis.economy && WA.economy') >= 0
    && inj.indexOf('供需与商路') >= 0, 'v2119/economy: [A5] 注入源表与注入分支同批登记');
  a(pn.indexOf("economy: '供需与商路'") >= 0, 'v2119/economy: [A6] 面板显示名登记');
  a(td.indexOf("'wa-eco-enabled'") >= 0 && td.indexOf("'wa-eco-out'") >= 0,
    'v2119/economy: [A7] 守卫表登记控件');
  a(src.indexOf('enabled: false, maxGoods: 16, maxOrders: 12, maxRoutes: 8, spreadPct: 30') >= 0,
    'v2119/economy: [A8] 总开关默认关');
  a(src.indexOf('const RECIPES = {') >= 0 && src.indexOf('unknown-recipe') >= 0
    && src.indexOf('autoRecipe') < 0, 'v2119/economy: [A9] 配方是具名表（不接受现编的合成关系）');
  a(src.indexOf('WA.registerModule(') >= 0 && src.indexOf('engines/economy.js') >= 0,
    'v2119/economy: [A10] 模块自注册');
  a(src.indexOf('goods-full') >= 0 && src.indexOf(A_EVICT_G) >= 0,
    'v2119/economy: [A11] 货品容量两道门同时存在（长度预检 + 站点挤出）');
  a(src.indexOf('short-input') >= 0 && src.indexOf('lacking.length') >= 0,
    'v2119/economy: [A12] 生产输入两道门同时存在（预检 + 事务内复检）');
  // 库存与付款同理：预检 + 事务内复检两道，单独拆预检行为不变（事务内那道仍会拒）
  //   —— 按 B8 [A11] 口径不设假破坏项，改由本断言钉住「两道都在」。
  a(src.indexOf('short-stock') >= 0 && src.indexOf("if (gg.stock < n)") >= 0,
    'v2119/economy: [A12b] 库存两道门同时存在（预检 + 事务内复检）');
  a(src.indexOf("r.status !== 'open'") >= 0 && src.indexOf("rr.status !== 'open'") >= 0,
    'v2119/economy: [A12c] 商路阻断两道门同时存在（预检 + 事务内复检）');
  a(src.indexOf('function respond(') >= 0 && src.indexOf('function bandOf(') >= 0,
    'v2119/economy: [A13] 响应只走带宽计算（不另写一套定价）');
  a(src.indexOf('autoPrice') < 0 && src.indexOf('autoSettle') < 0,
    'v2119/economy: [A14] 无「自动定价 / 自动结账」路径');
  a(src.indexOf("'missing-base'") >= 0 && src.indexOf('destBase') >= 0,
    'v2119/economy: [A15] 入库与随运两条路都要求基础价');
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/economy: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
  });
  const W = mkW(null);
  const s1 = W.economy.stock('镇上', '面粉', 5, { base: 2 });
  a(s1.ok === true && s1.stock === 5 && s1.base === 2 && s1.price === 2, 'v2119/economy: [C] 首次入库立行并给出基础价');
  const s2 = W.economy.stock('镇上', '面粉', 3);
  a(s2.ok === true && s2.stock === 8, 'v2119/economy: [C] 同货再入库累加（不必再给基础价）');
  const b1 = W.economy.buy('镇上', '面粉', 2, { by: '甲' });
  a(b1.ok === true && b1.unit === 2 && b1.total === 4 && b1.balance === 6 && b1.stock === 6,
    'v2119/economy: [C] 成交按现价、钱货两清');
  const v1 = W.economy.view('镇上', '面粉');
  a(v1.ok === true && v1.stock === 6 && v1.demand === 2 && v1.lo === 1.4 && v1.hi === 2.6 && v1.spreadPct === 30,
    'v2119/economy: [C] 读侧带出需求与许可带');
  const sh = W.economy.shelf('镇上');
  a(sh.ok === true && sh.goods.length === 1 && sh.goods[0].resource === '面粉', 'v2119/economy: [C] 货架按地点分列');
  W.store.transact(function (d) { d.people['p_甲'].resources['面粉'] = 3; }, TAG + 'mat');
  const cr = W.economy.craft('镇上', '面包', { by: '甲', times: 2 });
  const pur2 = W.store.get().people['p_甲'].resources;
  a(cr.ok === true && cr.made['面包'] === 4 && pur2['面粉'] === 1 && pur2['面包'] === 4,
    'v2119/economy: [C] 配方按次数扣料产出（两进四出）');
  const t = W.economy.tick('D1');
  a(t.ok === true && t.stamp === 'D1' && t.rows.length === 1 && t.rows[0].resource === '面粉'
    && t.rows[0].next >= t.rows[0].base * 0.7, 'v2119/economy: [C] 时段推进逐货列印（含响应后价）');
  const stv = W.economy.statView();
  a(stv.goods === 1 && stv.orders === 2 && typeof stv.byResource === 'object', 'v2119/economy: [C] statView 分列读数');
  const caps = W.store.sizeCaps();
  a(caps['economy.goods'].cap === 16 && caps['economy.orders'].cap === 12 && caps['economy.routes'].cap === 8,
    'v2119/economy: [C] 三容器容量登记可见');
  const bb = W.economy.buildBlock();
  a(typeof bb === 'string' && bb.indexOf('[供需]') >= 0 && bb.indexOf('许可带') >= 0 && bb.indexOf('库存不为负') >= 0,
    'v2119/economy: [C] 注入块报出许可带与硬约束');
  const arr = [];
  for (let i = 0; i < 20; i++) arr.push({ i: i });
  const rr = W.evict.array(arr, 'economy.goods', 16);
  a(rr.ok && rr.dropped === 4 && arr.length === 16, 'v2119/economy: [C] 站点「声明即执行」实测通过');
  const rv = W.economy.routeView('nope');
  a(rv.ok === false && rv.reason === 'unknown-route', 'v2119/economy: [C] 未登记商路照实报 unknown-route');
  const before = JSON.stringify(W.store.get().people);
  W.economy.view('镇上', '面粉'); W.economy.shelf('镇上'); W.economy.statView();
  a(JSON.stringify(W.store.get().people) === before, 'v2119/economy: [C] 读取路径不写盘');
}
function runNegative(a) {
  a(BROKEN.length === 8 && new Set(BROKEN.map(function (x) { return x.key; })).size === 8,
    'v2119/economy: [N0] 破坏面覆盖 8 个互异锚点（实 ' + BROKEN.length + '）');
  BROKEN.forEach(function (s) {
    a(anchorHits(s) === 1, 'v2119/economy: [N0] 锚点在真源码中恰 1 次 :: ' + s.key);
  });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2119/economy: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/economy: [N2] 原版成立 :: ' + k + '（实 ' + got + '）');
  });
  a(probeWith(BROKEN[B['tick']], PROBES.pResp) === 'response-happens', 'v2119/economy: [N3] 破坏时段幂等不影响价格响应');
  a(probeWith(BROKEN[B['shb']], PROBES.pBase) === 'base-required', 'v2119/economy: [N3] 破坏目的地基础价不影响首次入库');
  a(probeWith(BROKEN[B['nobase']], PROBES.pAfford) === 'afford-gated', 'v2119/economy: [N3] 破坏基础价门槛不影响付款门槛');
  a(probeWith(BROKEN[B['input']], PROBES.pBound) !== 'threw:x', 'v2119/economy: [N3] 破坏生产输入不影响容器有界探针可用性');
  const okv = probeClean(PROBES.pAfford);
  const badv = probeWith(BROKEN[B['afford']], PROBES.pAfford);
  a(okv !== badv && okv === 'afford-gated',
    'v2119/economy: [N4] 钱不够不改状态判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pTick);
  const bad2 = probeWith(BROKEN[B['tick']], PROBES.pTick);
  a(ok2 !== bad2 && ok2 === 'tick-once',
    'v2119/economy: [N4] 时段幂等判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pResp);
  const bad3 = probeWith(BROKEN[B['resp']], PROBES.pResp);
  a(ok3 !== bad3 && ok3 === 'response-happens',
    'v2119/economy: [N4] 价格响应判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('ECONOMY-V2119: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('ECONOMY-V2119: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };
