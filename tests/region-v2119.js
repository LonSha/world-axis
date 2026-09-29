#!/usr/bin/env node
// WorldAxis tests/region-v2119.js -- 拓展计划 ⑥ 专锁：跨地域持续变化与传播链（v2.119.0）
//
// 逐条守住：
//   ① 登记远方必须有距离与渠道；
//   ② 事件类型具名；
//   ③ 未到期不许提前落地（too-early 带还需多久）；
//   ④ 路断不吞事（受阻原地等，解除后照常到）；
//   ⑤ 只有已落地的事件才被听说，且传闻会变淡；
//   ⑥ 近处精细、远处粗粒度（摘要不带细节）；
//   ⑦ 总开关关闭零台账。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__region2119_';
const REL = 'engines/region.js';
const A_DIST = "    if (days === null || days < 0) {";
const A_KIND = "    if (EVENTS.indexOf(k) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', allowed: EVENTS.slice() }; }";
const A_EARLY = "    if (now < row.dueAt) {";
const A_BLK = "    if (place && place.blocked) {";
const A_HEARD = "    const rows = eventsOf().filter(function (e) { return e && e.deliveredAt; }).map(function (e) {";
const A_OFF = "    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const key = clean(name, 40);\n    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }\n    const days = num(o.distanceDays);\n";
const BROKEN = [
  { rel: REL, key: 'dist',  from: A_DIST,  to: "    if (false) {" },
  { rel: REL, key: 'kind',  from: A_KIND,  to: "    if (false) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind' }; }" },
  { rel: REL, key: 'early', from: A_EARLY, to: "    if (false) {" },
  { rel: REL, key: 'blk',   from: A_BLK,   to: "    if (false) {" },
  { rel: REL, key: 'heard', from: A_HEARD, to: "    const rows = eventsOf().map(function (e) {" },
  { rel: REL, key: 'off',   from: A_OFF,   to: "    if (false) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const key = clean(name, 40);\n    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }\n    const days = num(o.distanceDays);\n" }
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
  WA.region.setSettings({ enabled: false, maxEvents: 8, maxRoutes: 6, stalenessMs: 86400000 });
  WA.store.transact(function (d) { d.region = { places: [], events: [] }; }, TAG + 'reset');
  WA.region.setSettings({ enabled: true, maxEvents: 8, maxRoutes: 6, stalenessMs: 86400000 });
  return WA;
}
function register(WA, name, days, lane) { return WA.region.register(name, { distanceDays: days, lane: lane }); }
const PROBES = {
  pDist: function (env) {
    const WA = mkW(env.ov);
    const a = WA.region.register('隔海', { lane: 'river' });
    const b = register(WA, '近镇', 0, 'word');
    const v = WA.region.places();
    return (a.reason === 'missing-distance' && b.ok === true && v.length === 1
      && v[0].distanceDays === 0) ? 'distance-required'
      : 'x:' + JSON.stringify([a.reason, b.ok, v]);
  },
  pKind: function (env) {
    const WA = mkW(env.ov);
    register(WA, '北方城', 3, 'road');
    const a = WA.region.occur('北方城', '地震');
    const b = WA.region.occur('北方城', 'plague');
    const s = WA.region.statView();
    return (a.reason === 'bad-kind' && b.ok === true && s.events === 1) ? 'kind-named'
      : 'x:' + [a.reason, b.ok, s.events].join(',');
  },
  pEarly: function (env) {
    const WA = mkW(env.ov);
    register(WA, '北方城', 3, 'road');
    const o = WA.region.occur('北方城', 'plague');
    const a = WA.region.deliver(o.id, { now: o.dueAt - 1000 });
    const v1 = WA.region.statView();
    const b = WA.region.deliver(o.id, { now: o.dueAt + 1 });
    const v2 = WA.region.statView();
    return (a.reason === 'too-early' && a.waitMs === 1000 && v1.delivered === 0
      && b.ok === true && v2.delivered === 1) ? 'not-early'
      : 'x:' + JSON.stringify([a.reason, a.waitMs, v1.delivered, b.ok, v2.delivered]);
  },
  pBlk: function (env) {
    const WA = mkW(env.ov);
    register(WA, '北方城', 3, 'road');
    const o = WA.region.occur('北方城', 'feast');
    WA.region.markLane('北方城', true, { why: '封路' });
    const a = WA.region.deliver(o.id, { now: o.dueAt + 1 });
    const v1 = WA.region.places();
    WA.region.markLane('北方城', false);
    const b = WA.region.deliver(o.id, { now: o.dueAt + 1 });
    return (a.reason === 'route-blocked' && a.why === '封路' && v1[0].blocked === true
      && b.ok === true) ? 'blocked-waits'
      : 'x:' + JSON.stringify([a.reason, a.why, v1[0].blocked, b.ok]);
  },
  pHeard: function (env) {
    const WA = mkW(env.ov);
    register(WA, '北方城', 3, 'road');
    const o = WA.region.occur('北方城', 'plague');
    const before = WA.region.heard('阿明');
    WA.region.deliver(o.id, { now: o.dueAt + 1 });
    const after = WA.region.heard('阿明', { now: o.dueAt + 1000 });
    const stale = WA.region.heard('阿明', { now: o.dueAt + 86400000 * 3 });
    return (before.heard === 0 && after.heard === 1 && after.rows[0].fresh === true
      && stale.rows[0].fresh === false) ? 'only-delivered'
      : 'x:' + JSON.stringify([before.heard, after.heard, after.rows[0] && after.rows[0].fresh, stale.rows[0] && stale.rows[0].fresh]);
  },
  pGrain: function (env) {
    const WA = mkW(env.ov);
    register(WA, '北方城', 3, 'road');
    const o = WA.region.occur('北方城', 'plague', { text: '疫病起来' });
    WA.region.deliver(o.id, { now: o.dueAt + 1 });
    const a = WA.region.fine('北方城');
    const b = WA.region.fine('别处');
    return (a.grain === 'fine' && a.rows[0].text === '疫病起来'
      && b.grain === 'coarse' && b.rows[0].text === undefined
      && Object.keys(b.rows[0]).join(',') === 'id,kind,at') ? 'two-grains'
      : 'x:' + JSON.stringify([a.grain, b.grain, b.rows[0]]);
  },
  pOff: function (env) {
    const WA = mkW(env.ov);
    register(WA, '北方城', 3, 'road');
    WA.region.setSettings({ enabled: false });
    const a = register(WA, '新地', 1, 'road');
    const b = WA.region.occur('北方城', 'plague');
    const c = WA.region.markLane('北方城', true);
    const n = WA.region.statView().places;
    return (a.reason === 'disabled' && b.reason === 'disabled' && c.reason === 'disabled'
      && n === 1 && WA.region.buildBlock() === '') ? 'off-refused'
      : 'x:' + [a.reason, b.reason, c.reason, n].join(',');
  },
  pBound: function (env) {
    const WA = mkW(env.ov);
    let ok = 0;
    for (let i = 0; i < 10; i++) { if (register(WA, 'P' + i, i, 'road').ok) ok++; }
    const n = WA.region.statView().places;
    const cap = WA.store.sizeCaps()['region.places'].cap;
    return (n === 6 && ok === 6 && n <= cap) ? 'places-bounded' : 'x:n:' + n + '/ok:' + ok;
  }
};

const N1 = [
  { k: 'dist',  p: PROBES.pDist,  okk: 'distance-required', note: '无距离也能登记远方' },
  { k: 'kind',  p: PROBES.pKind,  okk: 'kind-named',        note: '自造事件类型也能记' },
  { k: 'early', p: PROBES.pEarly, okk: 'not-early',         note: '未到期也能提前落地' },
  { k: 'blk',   p: PROBES.pBlk,   okk: 'blocked-waits',     note: '路断也照常落地（消息不吞事失效）' },
  { k: 'heard', p: PROBES.pHeard, okk: 'only-delivered',    note: '没落地也能听说' },
  { k: 'off',   p: PROBES.pOff,   okk: 'off-refused',       note: '关闭时仍登记' }
];
const BAD_PREFIX = ['x:', 'threw:'];
function isOk(got) {
  return typeof got === 'string' && BAD_PREFIX.every(function (p) { return got.indexOf(p) !== 0; });
}
function judge(a) {
  const ev = readSrc('core/evict.js');
  const st = readSrc('core/store.js');
  const ix = readSrc('index.js');
  const rj = readSrc('tests/run.js');
  const td = readSrc('engines/tool-diag.js');
  const inj = readSrc('render/inject.js');
  const pn = readSrc('ui/panel.js');
  const src = readSrc(REL);
  a(ev.indexOf("'region.events'") >= 0 && ev.indexOf("{ path: 'region.places'") < 0
    && ev.indexOf("'region.places': '写入侧硬上界") >= 0,
    'v2119/region: [A1] events 走挤出站点；places 是**写入侧硬上界**（NON_EVICT 声明、SITES 不再登记）'
    + '——v2.119.0 优化③：原先按挤出站点登记 ⇒ 零调用站点（register() 满则 places-full 拒写，从不截断）');
  a(st.indexOf("'region.places'") >= 0 && st.indexOf('region: { places: [], events: [] }') >= 0,
    'v2119/region: [A2] store 骨架物化 region 且 __BOUNDED_CAPS 登记同键');
  a(ix.indexOf("'engines/region.js'") >= 0 && rj.indexOf("'engines/region.js'") >= 0,
    'v2119/region: [A3] index.js / tests/run.js 两处 LOAD 都登记');
  a(td.indexOf("'engines/region.js': 'region'") >= 0, 'v2119/region: [A4] tool-diag MODULE_EXPORTS 登记');
  a(inj.indexOf("'probe', 'region'") >= 0 && inj.indexOf('vis.region && WA.region') >= 0
    && inj.indexOf("'远方'") >= 0, 'v2119/region: [A5] 注入源表与注入分支同批登记');
  a(pn.indexOf("region: '远方'") >= 0, 'v2119/region: [A6] 面板显示名登记');
  a(td.indexOf("'wa-rg-register'") >= 0 && td.indexOf("'wa-rg-out'") >= 0,
    'v2119/region: [A7] 守卫表登记控件');
  a(src.indexOf('enabled: false, maxEvents: 24, maxRoutes: 8, stalenessMs: 86400000') >= 0,
    'v2119/region: [A8] 总开关默认关');
  a(src.indexOf("const LANES = { road: 120, river: 300, rail: 600, word: 40 };") >= 0,
    'v2119/region: [A9] 渠道带速率（没有速率就没有延迟）');
  a(src.indexOf('WA.registerModule(') >= 0 && src.indexOf('engines/region.js') >= 0,
    'v2119/region: [A10] 模块自注册');
  // 距离与事件类型是两条独立前置门；落地与听说各有一处真判据。
  a(src.indexOf('missing-distance') >= 0 && src.indexOf("reason: 'bad-kind'") >= 0,
    'v2119/region: [A11] 距离与类型两条前置门都在');
  a(src.indexOf("reason: 'too-early'") >= 0 && src.indexOf("reason: 'route-blocked'") >= 0,
    'v2119/region: [A12] 提前落地与路断两种拒收都在');
  a(src.indexOf('distanceDays === 0') >= 0 && src.indexOf("grain: 'coarse'") >= 0,
    'v2119/region: [A13] 近处精细/远处粗粒度两条分支都在');
  a(src.indexOf('autoDeliver') < 0 && src.indexOf('autoOccur') < 0,
    'v2119/region: [A14] 无「自动落地 / 自动出事」路径');
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/region: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
  });
  const W = mkW(null);
  const r1 = register(W, '北方城', 3, 'road');
  a(r1.ok === true && r1.distanceDays === 3 && r1.lane === 'road', 'v2119/region: [C] 登记远方得距离与渠道');
  const o1 = W.region.occur('北方城', 'plague', { text: '疫病起来' });
  a(o1.ok === true && o1.delayMs === 2160000, 'v2119/region: [C] 延迟 = 距离 ÷ 速率（3÷120 天）');
  const v1 = W.region.statView();
  a(v1.places === 1 && v1.events === 1 && v1.pending === 1 && v1.delivered === 0,
    'v2119/region: [C] statView 分列读数');
  const d1 = W.region.deliver(o1.id, { now: o1.dueAt });
  a(d1.ok === true && d1.place === '北方城', 'v2119/region: [C] 到期即可落地');
  const h1 = W.region.heard('阿明', { now: o1.dueAt + 100 });
  a(h1.ok === true && h1.heard === 1 && h1.rows[0].fresh === true, 'v2119/region: [C] 落地后才听说');
  const f1 = W.region.fine('北方城');
  a(f1.ok === true && f1.grain === 'fine' && f1.rows[0].text === '疫病起来', 'v2119/region: [C] 本地给明细');
  const bb = W.region.buildBlock();
  a(typeof bb === 'string' && bb.indexOf('[远方]') >= 0 && bb.indexOf('传来') >= 0
    && bb.indexOf('不要编细节') >= 0, 'v2119/region: [C] 注入块只报「传来消息」');
  const caps = W.store.sizeCaps();
  a(caps['region.places'].cap === 8 && caps['region.events'].cap === 24, 'v2119/region: [C] 容量登记可见');
  const arr = [];
  for (let i = 0; i < 12; i++) arr.push({ i: i });
  const rr = W.evict.array(arr, 'region.events', 8);
  a(rr.ok && rr.dropped === 4 && arr.length === 8, 'v2119/region: [C] 站点「声明即执行」实测通过');
  const before = JSON.stringify(W.store.get().region);
  W.region.heard('阿明'); W.region.fine('北方城'); W.region.statView(); W.region.places();
  a(JSON.stringify(W.store.get().region) === before, 'v2119/region: [C] 读取路径不写盘');
}
function runNegative(a) {
  a(BROKEN.length === 6 && new Set(BROKEN.map(function (x) { return x.key; })).size === 6,
    'v2119/region: [N0] 破坏面覆盖 6 个互异锚点（实 ' + BROKEN.length + '）');
  BROKEN.forEach(function (s) {
    a(anchorHits(s) === 1, 'v2119/region: [N0] 锚点在真源码中恰 1 次 :: ' + s.key);
  });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2119/region: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/region: [N2] 原版成立 :: ' + k + '（实 ' + got + '）');
  });
  a(probeWith(BROKEN[B['kind']], PROBES.pEarly) === 'not-early', 'v2119/region: [N3] 破坏类型准入不影响按期落地');
  a(probeWith(BROKEN[B['early']], PROBES.pBlk) === 'blocked-waits', 'v2119/region: [N3] 破坏提前落地不影响路断等待');
  a(probeWith(BROKEN[B['dist']], PROBES.pHeard) === 'only-delivered', 'v2119/region: [N3] 破坏距离门不影响听说门槛');
  const okv = probeClean(PROBES.pEarly);
  const badv = probeWith(BROKEN[B['early']], PROBES.pEarly);
  a(okv !== badv && okv === 'not-early',
    'v2119/region: [N4] 不许提前落地判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pBlk);
  const bad2 = probeWith(BROKEN[B['blk']], PROBES.pBlk);
  a(ok2 !== bad2 && ok2 === 'blocked-waits',
    'v2119/region: [N4] 路断等待判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pHeard);
  const bad3 = probeWith(BROKEN[B['heard']], PROBES.pHeard);
  a(ok3 !== bad3 && ok3 === 'only-delivered',
    'v2119/region: [N4] 只听说已落地判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('REGION-V2119: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('REGION-V2119: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };
