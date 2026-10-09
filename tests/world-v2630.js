#!/usr/bin/env node
// WorldAxis tests/world-v2630.js —— 世界织体「时空约束与在场证据」锁（v2.63.0）
//
// 【它治的病】路线图 V1「因果与社会」里，本模块最有价值的几条能力**全是否定式**：
//   · 地点没登记时，它必须**不可达**（不得猜「大概就在附近」）；
//   · 两地之间没有登记的道路时，它就是**走不过去**（不得按直线距离兜一条）；
//   · 同一人物同一时刻只能在一处，冲突要**被拒绝并分开归因**（不得静默覆盖先前安排）；
//   · 到场者名单**只由证据给出**（不得由「办了一场集市」推出「全城人都到了」）。
//   存在面判据（有 addPlace 吗 / 有 PLACE_KINDS 吗 / 有 reach 吗）对这四条一无所知：
//   一个用「未登记地点 ⇒ 当作附近某处」、用「无路 ⇒ 按 5 分钟/公里折算」兜底的实现，
//   同样拥有全套函数名、全套常量，而且**看起来更聪明**。
//
// 【为什么既有锁全都照不到】（与本锁正交的那些面）
//   · tests/run.js 的 G18 门禁钉「站点声明 ⇄ 调用点存在」，不问语义、不问可达性；
//   · tests/causal-v2620.js 钉的是**因果链的阶段格**（open→acted→immediate→settled），
//     与「谁在什么地点、走得通走不通」不同轴；
//   · v2610（evict-meta）钉「淘汰元字段由谁提供」，是生产者供给面；
//   · field-liveness / dead-export 是静态面（读写归属、导出承诺）。
//   一句话：既有锁把「这三张表存在且被调用」钉住了，没人钉「时空面拒了什么、凭什么拒」。
//
// 【做法】判据全部跑在**真源码**上：经 tests/ui-gate-sync.js 的 fresh() 装载真 LOAD
//   （含本版新插入的 engines/world.js），只借宿主的 localStorage / SillyTavern 桩，
//   **不 mock 被测逻辑本身**（把被测实现换成假货，判据就只在证明假货正确）。
//   破坏自证走 opts.srcOverride：把真源码在**内存副本**上改坏后重跑同款判据，一个字节都不改仓库文件。
//
// 【判据】
//   1  总开关默认关闭：不推演、不注入、不改变任何人的位置。
//   2  地点未登记 ⇒ addRoad 拒收（unknown-place），且不得留下半条道路。
//   3  两地无路 ⇒ reach 报 reachable:false（**不得**按直线距离兜一条）。
//   4  未登记起点/终点 ⇒ reach/move 明确 unknown-place（不猜）。
//   5  同一时刻只能在一处：canBeAt 把 unknown-place / closed / scheduled-elsewhere **分开归因**。
//   6  到场者只认证据：无日程依据的人一个都不返回（who 为空、evidence 字段说明依据来源）。
//   7  有日程且地点时段重叠者才入名单（地点不符 / 时段不重叠 / status 非 active 都不算）。
//   8  eventsBetween 按**时段重叠**取（不是按起点落区间）。
//   9  tick 只把共同日程推进状态（planned→ongoing→done），不凭空给人安排去处。
//   10 容量与挤出：容器恒 24、挤出经 evict 记账、剪枝走已登记站点（无 unknown-site）。
//   11 注入块有独立标题、明写「未登记的地点不存在 / 未登记的道路走不通」，且空库不产空头段。
//   12 观测面：被拒的调用**不落盘**，故必须按原因计入 stat.faults —— 否则
//      「世界没有因为一句话长出一条不存在的街」这件事在状态里完全不可见。
//
// 【负控制】N0 破坏锚点在真源码中各恰中 1 次；N1/N2 两向自证（改坏 ⇒ 现形 / 原版 ⇒ 全绿）；
//   N3 逐锚敏感；N4 非恒真（状态确实发生变化）；N5 判据纯度（哨兵不泄漏进真存档）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');                     // 宿主桩：localStorage / SillyTavern（与其它门禁同一份）
const LS = global.localStorage;

const SITE_PLACES = 'world.places';       // 站点名 = core/evict.js SITES 的键
const CAP_PLACES = 24;                    // 与 SITES / store.__BOUNDED_CAPS 同源
const TAG = '__wd2630_';                  // 哨兵前缀
// ── 四个破坏锚点：**只在真源码里各出现一次**（N0 校验） ──
const A_ROAD = "if (!placeByName(x) || !placeByName(y)) return { ok: false, reason: 'unknown-place' };";
const A_REACH = "if (!(t in dist)) return { ok: true, reachable: false, minutes: null, hops: null, path: [] };";
const A_ATT = "if (on) who.push(p.name || String(k).replace(/^p_/, ''));";
const A_FAULT = "if (r && r.ok === false && typeof r.reason === 'string' && r.reason) {";

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function worldOf(WA) {
  if (!WA.world) throw new Error('WA.world 未装载（engines/world.js 不在 LOAD 清单里？）');
  return WA.world;
}
function st(WA) { return WA.store.get() || {}; }
function wnode(WA) { const w = st(WA).world; return (w && typeof w === 'object' && !Array.isArray(w)) ? w : {}; }
function places(WA) { return Array.isArray(wnode(WA).places) ? wnode(WA).places : []; }
function roads(WA) { return Array.isArray(wnode(WA).roads) ? wnode(WA).roads : []; }
function events(WA) { return Array.isArray(wnode(WA).events) ? wnode(WA).events : []; }

/** 种一个人物（含日程）。日程是「在场」的唯一证据来源，故必须真写进 people。 */
function seedPerson(WA, name, schedule) {
  WA.store.transact(function (d) {
    d.people = d.people && typeof d.people === 'object' ? d.people : {};
    d.people['p_' + name] = { id: 'p_' + name, name: name,
      life: { schedule: schedule || [] } };
  }, TAG + 'person');
}
// ── 判据自身的无副作用隔离：快照 → 跑 → 还原 ──
// 为什么必须做：judge/probe 走 store.transact，批外 transact **会落盘**，
//   哨兵写进真存档后既污染后续判据，也让「判据无副作用」从契约变成奢望。
function snapshotLS() {
  const out = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) out[k] = LS.getItem(k); }
  return out;
}
function restoreLS(snap) {
  const drop = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
}
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k === null) continue;
    let v = '';
    try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}

// ══════════════ 判据 ══════════════
function judge(a) {
  const WA = fresh();
  const w = worldOf(WA);
  // 清场（上一批判据可能留下同名地点/道路；本锁自治，不依赖运行顺序）
  WA.store.transact(function (d) { d.world = { places: [], roads: [], events: [] }; }, TAG + 'reset');

  // ── 1 总开关默认关闭 ──
  const cfg0 = w.getSettings();
  a(cfg0 && cfg0.enabled === false, 'v2630/world: [1] 默认关闭（实 ' + JSON.stringify(cfg0 && cfg0.enabled) + '）');
  a(w.buildBlock() === '', 'v2630/world: [1] 关闭时注入块为空（不注入）');
  a(w.tick({}).reason === 'disabled', 'v2630/world: [1] 关闭时 tick 不推演（归因 disabled）');
  // 空库不产空头段：此刻一个地点一条日程都没有，即使开了开关也不该出现标题。
  //   为什么放在最前：判据必须**自成一体**——若挪到末尾，前面用例会先把库塞满，
  //   这条断言就再也看不到「空库」这一面（假绿）。
  w.setSettings({ enabled: true });
  a(w.buildBlock() === '', 'v2630/world: [1] 空库不产空头段（无地点无日程时应返回空串）');
  // 被拒的东西**不落盘**：这正是必须另立观测面的原因，故在最前（库空）时验一次最干净。
  const wEmpty0 = JSON.stringify(wnode(WA));
  w.reach('不存在的地方', '另一个不存在的地方');
  a(JSON.stringify(wnode(WA)) === wEmpty0,
    'v2630/world: [1] 被拒的地点**不落盘**（状态逐字不变——拒绝在状态里本应不可见）');
  a((w.stat().faults || {})['unknown-place'] >= 1,
    'v2630/world: [1] 但拒绝必须**可观测**（否则「世界没长出不存在的街」这件事无处可读；实 '
    + JSON.stringify(w.stat().faults) + '）');
  w.setSettings({ enabled: false });
  a(w.getSettings().enabled === false, 'v2630/world: [1] 关回去后确实关闭（不留跨用例残留）');

  // ── 2 地点未登记 ⇒ 道路拒收，且不留半条路 ──
  const p1 = w.addPlace({ name: '码头', kind: 'work' });
  a(p1.ok === true && p1.id === 'pl_码头', 'v2630/world: [2] 登记地点成功并回报稳定 id（实 ' + JSON.stringify(p1) + '）');
  const rd0 = w.addRoad('码头', '茶楼', 20);
  a(rd0.ok === false && rd0.reason === 'unknown-place',
    'v2630/world: [2] 一端未登记 ⇒ 道路拒收并归因 unknown-place（实 ' + JSON.stringify(rd0) + '）');
  a(roads(WA).length === 0, 'v2630/world: [2] 被拒的道路不得留下半条（实 ' + roads(WA).length + ' 条）');
  a(w.addRoad('码头', '码头', 5).reason === 'self-road', 'v2630/world: [2] 自环道路拒收（self-road）');
  a(w.addRoad('码头', '茶楼', 0).reason === 'bad-minutes', 'v2630/world: [2] 非正耗时拒收（bad-minutes）');

  // ── 3 两地无路 ⇒ 走不通（不得按直线距离兜底） ──
  w.addPlace({ name: '茶楼', kind: 'public' });
  const r0 = w.reach('码头', '茶楼');
  a(r0.ok === true && r0.reachable === false,
    'v2630/world: [3] 已登记但无路 ⇒ reachable:false（实 ' + JSON.stringify(r0) + '）');
  a(r0.minutes === null && r0.path.length === 0,
    'v2630/world: [3] 无路时**不得**给一个兜底耗时/路径（世界不许自己修一条街）');

  // ── 4 未登记地点 ⇒ 明确 unknown-place ──
  a(w.reach('码头', '不存在的地方').reason === 'unknown-place',
    'v2630/world: [4] reach 的未登记终点 ⇒ unknown-place');
  a(w.reach('不存在的地方', '码头').reason === 'unknown-place',
    'v2630/world: [4] reach 的未登记起点 ⇒ unknown-place');
  a(w.move('阿宁', '码头', '不存在的地方').reason === 'unknown-place',
    'v2630/world: [4] move 的未登记终点 ⇒ unknown-place（不猜）');

  // ── 5 同一时刻只能在一处：三种理由分开归因 ──
  seedPerson(WA, '阿宁', [{ id: 'sch1', activity: '值铺', location: '码头', start: 10, end: 12, status: 'active' }]);
  const c1 = w.canBeAt('阿宁', '码头', 11);
  a(c1.ok === true, 'v2630/world: [5] 日程就在此地 ⇒ 允许（实 ' + JSON.stringify(c1) + '）');
  const c2 = w.canBeAt('阿宁', '茶楼', 11);
  a(c2.ok === false && c2.reason === 'scheduled-elsewhere' && c2.place === '码头',
    'v2630/world: [5] 同一刻在别处 ⇒ scheduled-elsewhere 且写明**在哪**（实 ' + JSON.stringify(c2) + '）');
  const c3 = w.canBeAt('阿宁', '不存在的地方', 11);
  a(c3.ok === false && c3.reason === 'unknown-place',
    'v2630/world: [5] 「地点不存在」与「人在别处」**不是同一件事**（实 ' + JSON.stringify(c3) + '）');
  w.addPlace({ name: '夜禁街', kind: 'wild', open: 100, close: 200 });
  const c4 = w.canBeAt('阿宁', '夜禁街', 11);
  a(c4.ok === false && c4.reason === 'closed' && c4.open === 100 && c4.close === 200,
    'v2630/world: [5] 地点此刻不开放 ⇒ closed 并回报开闭时刻（实 ' + JSON.stringify(c4) + '）');

  // ── 6 到场者只认证据（本模块存在的全部理由） ──
  const ev1 = w.addEvent({ title: '码头集市', place: '码头', kind: 'market', start: 10, end: 12 });
  a(ev1.ok === true, 'v2630/world: [6] 共同日程登记成功（实 ' + JSON.stringify(ev1) + '）');
  seedPerson(WA, '丙', []);                     // 无任何日程依据
  const at1 = w.attendees(ev1.id);
  a(at1.ok === true && at1.who.length === 1 && at1.who[0] === '阿宁',
    'v2630/world: [6] 到场者只来自日程证据（丙无依据 ⇒ 一个都不返回；实 ' + JSON.stringify(at1.who) + '）');
  a(at1.evidence === 'schedule', 'v2630/world: [6] 回报依据来源（evidence=schedule），不含糊说「大概有人」');
  a(w.attendees('ev_不存在').reason === 'missing-event',
    'v2630/world: [6] 未登记的日程 ⇒ missing-event（不返回空名单冒充「没人来」）');

  // ── 7 三条入名单条件（地点 / 时段 / status）全部要过 ──
  seedPerson(WA, '丁', [{ id: 'sch2', activity: '买菜', location: '茶楼', start: 10, end: 12, status: 'active' }]);
  seedPerson(WA, '戊', [{ id: 'sch3', activity: '打更', location: '码头', start: 20, end: 22, status: 'active' }]);
  seedPerson(WA, '己', [{ id: 'sch4', activity: '歇业', location: '码头', start: 10, end: 12, status: 'done' }]);
  const at2 = w.attendees(ev1.id);
  a(at2.who.length === 1 && at2.who[0] === '阿宁',
    'v2630/world: [7] 地点不符（丁）/ 时段不重叠（戊）/ status 非 active（己）都不入名单（实 '
    + JSON.stringify(at2.who) + '）');

  // ── 8 eventsBetween 按时段重叠取 ──
  const ev2 = w.addEvent({ title: '节庆', place: '茶楼', kind: 'festival', start: 11, end: 13 });
  a(ev2.ok === true, 'v2630/world: [8] 第二场共同日程登记成功');
  const between = w.eventsBetween(11, 12);
  a(between.length === 2, 'v2630/world: [8] 区间取的是**时段重叠**（两场都跨过 11-12；实 ' + between.length + '）');
  const none8 = w.eventsBetween(1, 2);
  a(none8.length === 0, 'v2630/world: [8] 时段完全不重叠者不入（实 ' + none8.length + '）');
  a(w.eventsBetween(12, 12).length === 1,
    'v2630/world: [8] 半开区间语义：恰在 12 点结束的那场不算跨过 12 点（实 '
    + w.eventsBetween(12, 12).length + '）');

  // ── 9 tick 只改状态，不凭空给人安排去处 ──
  w.setSettings({ enabled: true });
  const beforePeople = JSON.stringify(st(WA).people);
  const t1 = w.tick({ now: 11 });
  a(t1.ok === true && t1.changed >= 1, 'v2630/world: [9] tick 把日程推进状态（实 changed=' + t1.changed + '）');
  a(events(WA).filter(function (e) { return e.status === 'ongoing'; }).length === 2,
    'v2630/world: [9] 落在时段内的日程转 ongoing');
  a(JSON.stringify(st(WA).people) === beforePeople,
    'v2630/world: [9] tick **不得**凭空给人安排去处（people 逐字不变）');
  const t2 = w.tick({ now: 99 });
  a(events(WA).every(function (e) { return e.status === 'done'; }),
    'v2630/world: [9] 结束后的日程转 done（实 ' + JSON.stringify(events(WA).map(function (e) { return e.status; })) + '）');

  // ── 10 容量与挤出 ──
  WA.evict.resetEvictStat();
  for (let i = 0; i < CAP_PLACES + 5; i++) w.addPlace({ name: TAG + 'p' + i, kind: 'public' });
  const es = WA.evict.evictStat();
  const bs = es.bySite[SITE_PLACES] || null;
  a(places(WA).length === CAP_PLACES, 'v2630/world: [10] 地点容器容量 = ' + CAP_PLACES + '（实 ' + places(WA).length + '）');
  a(!!bs && bs.evicts >= 1, 'v2630/world: [10] 挤出经 evict 记账（evicts=' + (bs && bs.evicts) + '）');
  a(!!bs && (bs.lastWhat || []).length > 0,
    'v2630/world: [10] 逐站点留住「丢的是谁」（lastWhat=' + JSON.stringify(bs && bs.lastWhat) + '）');
  a(es.failedBy['unknown-site'] === undefined,
    'v2630/world: [10] 剪枝走的是**已登记**站点（不得出现 unknown-site 归因）');
  const decl = WA.evict.siteDecls()[SITE_PLACES];
  a(!!decl && decl.cap === CAP_PLACES, 'v2630/world: [10] 站点声明与容器实际容量同源（cap=' + (decl && decl.cap) + '）');

  // ── 11 注入块 ──
  const blk = w.buildBlock();
  a(typeof blk === 'string' && blk.indexOf('[世界织体]') === 0,
    'v2630/world: [11] 注入块有独立标题（实 ' + JSON.stringify(String(blk).slice(0, 16)) + '）');
  a(blk.indexOf('未登记的地点不存在') >= 0 && blk.indexOf('不得据此推断') >= 0,
    'v2630/world: [11] 语义约束随块注入（不指望模型自己记得「不许推测距离」）');
  a(blk.indexOf('在场者只认日程证据') >= 0,
    'v2630/world: [11] 明写「在场者只认证据」（防「办了集市 ⇒ 满城人都到了」）');
  // ── 12 观测面：被拒的东西**不落盘**，故必须另立一面 ──
  //   注：这里刻意**不再另起一个 fresh()**。fresh() 复用同一个 global.WorldAxis 对象、
  //   把 store 换成新的——中途调用会让前面所有判据读到的状态集体清空，
  //   于是「不落盘」这类断言会退化成在空库上恒真（假绿）。空库面已在 [1] 验过。
  const f0 = w.stat().faults || {};
  a(typeof f0 === 'object' && f0 !== null, 'v2630/world: [12] stat 带 faults 面（被拒按原因计数）');
  a((f0['unknown-place'] || 0) >= 3,
    'v2630/world: [12] 全程累计的未知地点拒绝已被计数（实 ' + JSON.stringify(f0) + '）');
  const drafted = JSON.stringify(wnode(WA));
  a(drafted.indexOf('不存在的地方') < 0 && drafted.indexOf('pl_') >= 0,
    'v2630/world: [12] 被拒的地点不在存档里，而**已登记的地点确实在**（两侧都查，防空库恒真）');

  console.log('  ✓ v2630/world: 时空约束（未登记即不可达 / 无路即不通）与在场证据面');
}
// ══════════════ 破坏探针（每种破坏一个最小复现，只问一件事） ══════════════
/** 未登记的一端：原版应 unknown-place；road 守卫被破坏时应被收下 */
function probeRoad(WA) {
  const w = worldOf(WA);
  WA.store.transact(function (d) { d.world = { places: [], roads: [], events: [] }; }, TAG + 'pr');
  w.addPlace({ name: '码头' });
  const r = w.addRoad('码头', '茶楼', 20);
  return r && r.ok === false ? r.reason : 'accepted';
}
/** 无路可达性：原版应 reachable:false（不得兜底）；reach 兜底被破坏时应为 true */
function probeReach(WA) {
  const w = worldOf(WA);
  WA.store.transact(function (d) { d.world = { places: [], roads: [], events: [] }; }, TAG + 'pr2');
  w.addPlace({ name: '码头' }); w.addPlace({ name: '茶楼' });
  const r = w.reach('码头', '茶楼');
  return { reachable: r.reachable, hasMinutes: r.minutes !== null };
}
/** 到场者：原版只认日程证据；att 推入被破坏时应为空 */
function probeAtt(WA) {
  const w = worldOf(WA);
  WA.store.transact(function (d) { d.world = { places: [], roads: [], events: [] }; d.people = {}; }, TAG + 'pr3');
  w.addPlace({ name: '码头' });
  seedPerson(WA, '阿宁', [{ id: 's', activity: '值铺', location: '码头', start: 10, end: 12, status: 'active' }]);
  const ev = w.addEvent({ title: '集市', place: '码头', kind: 'market', start: 10, end: 12 });
  return w.attendees(ev.id).who;
}
/** 观测面：原版把 ok:false 的 reason 计入 faults；观测面被破坏时应为空 */
function probeFault(WA) {
  const w = worldOf(WA);
  WA.store.transact(function (d) { d.world = { places: [], roads: [], events: [] }; }, TAG + 'pr4');
  w.reach('不存在的地方', '另一个不存在的地方');
  return (w.stat().faults || {})['unknown-place'] || 0;
}
const BROKEN = [
  { key: 'road', rel: 'engines/world.js', from: A_ROAD, to: 'if (false) return { ok: false, reason: \'unknown-place\' };' },
  { key: 'reach', rel: 'engines/world.js', from: A_REACH,
    to: 'if (!(t in dist)) return { ok: true, reachable: true, minutes: Math.abs(t.length - s.length) * 5, hops: 1, path: [s, t] };' },
  { key: 'att', rel: 'engines/world.js', from: A_ATT, to: "if (false) who.push(p.name || String(k).replace(/^p_/, ''));" },
  { key: 'fault', rel: 'engines/world.js', from: A_FAULT, to: 'if (false) {' }
];
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点应恰中 1 次，实 ' + hits + ' 次：' + spec.rel + ' :: ' + spec.from);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function probeWith(spec, fn) {
  return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); });
}
function probeClean(fn) {
  return isolated(function () { return fn(fresh()); });
}
function anchorHits(spec) {
  return fs.readFileSync(path.join(BASE, spec.rel), 'utf8').split(spec.from).length - 1;
}
// ══════════════ 负控制 ══════════════
function runNegative(a) {
  // N0 四个破坏锚点在真源码中各恰中 1 次（锚点漂移即「负控制静默失效」）
  const anchorBad = BROKEN.filter(function (p) { return anchorHits(p) !== 1; })
    .map(function (p) { return p.key + '(' + anchorHits(p) + '次)'; });
  a(anchorBad.length === 0, 'v2630/world: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');
  // N0b 破坏副本确实生成且与真源码不同（否则「两向自证」是空转）
  const diffOk = BROKEN.every(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.rel), 'utf8');
    return brokenOverride(p)[p.rel] !== src;
  });
  a(diffOk, 'v2630/world: [N0] 四种破坏的内存副本都与真源码不同（非空转）');
  // N1 判据纯度：破坏后对应判据必须现形
  const rBad = probeWith(BROKEN[0], probeRoad);
  a(rBad !== 'unknown-place', 'v2630/world: [N1] 道路守卫被破坏 ⇒ 「未登记即拒收」判据现形（实 ' + String(rBad) + '）');
  const vBad = probeWith(BROKEN[1], probeReach);
  a(vBad.reachable === true, 'v2630/world: [N1] 可达性被改成兜底 ⇒ 「无路即不通」判据现形（实 ' + JSON.stringify(vBad) + '）');
  const aBad = probeWith(BROKEN[2], probeAtt);
  a(aBad.length === 0, 'v2630/world: [N1] 到场者推入被摘除 ⇒ 「只认日程证据」判据现形（实 ' + JSON.stringify(aBad) + '）');
  const fBad = probeWith(BROKEN[3], probeFault);
  a(fBad === 0, 'v2630/world: [N1] 观测面被摘除 ⇒ 「拒绝可观测」判据现形（实 ' + fBad + '）');
  // N2 两向自证：原版源码上同款探针全部通过
  a(probeClean(probeRoad) === 'unknown-place', 'v2630/world: [N2] 原版：未登记的一端被拒（unknown-place）');
  const vOk = probeClean(probeReach);
  a(vOk.reachable === false && vOk.hasMinutes === false, 'v2630/world: [N2] 原版：无路即不通且不给兜底耗时（实 ' + JSON.stringify(vOk) + '）');
  a(probeClean(probeAtt).length === 1, 'v2630/world: [N2] 原版：有日程依据者恰到场一人（实 ' + JSON.stringify(probeClean(probeAtt)) + '）');
  a(probeClean(probeFault) >= 1, 'v2630/world: [N2] 原版：被拒的原因确被计数（实 ' + probeClean(probeFault) + '）');
  // N3 逐锚敏感：四种破坏各自只触发对应判据（互不串扰）
  a(probeWith(BROKEN[0], probeFault) >= 1, 'v2630/world: [N3] 道路破坏不牵连观测面（逐锚敏感）');
  a(probeWith(BROKEN[1], probeRoad) === 'unknown-place', 'v2630/world: [N3] 可达性破坏不牵连道路守卫（逐锚敏感）');
  a(probeWith(BROKEN[1], probeAtt).length === 1, 'v2630/world: [N3] 可达性破坏不牵连到场者面（逐锚敏感）');
  a(probeWith(BROKEN[2], probeRoad) === 'unknown-place', 'v2630/world: [N3] 到场者破坏不牵连道路守卫（逐锚敏感）');
  a(probeWith(BROKEN[3], probeRoad) === 'unknown-place', 'v2630/world: [N3] 观测面破坏不改判定（只观测、不干预）');
  a(probeWith(BROKEN[3], probeAtt).length === 1, 'v2630/world: [N3] 观测面破坏不改结果结构（返回仍原样）');
  // N4 非恒真：判据观测到的状态确实发生过变化（防「什么都没跑也全绿」）
  const chg = isolated(function () {
    const WA = fresh();
    const w = worldOf(WA);
    WA.store.transact(function (d) { d.world = { places: [], roads: [], events: [] }; }, TAG + 'n4');
    w.addPlace({ name: '码头' });
    const p0 = places(WA).length;
    w.addPlace({ name: '茶楼' });
    const p1 = places(WA).length;
    w.addRoad('码头', '茶楼', 20);
    const r = w.reach('码头', '茶楼');
    return { p0: p0, p1: p1, reachable: r.reachable, minutes: r.minutes, path: r.path.join('>') };
  });
  a(chg.p0 === 1 && chg.p1 === 2 && chg.reachable === true && chg.minutes === 20 && chg.path === '码头>茶楼',
    'v2630/world: [N4] 状态确实发生过变化：有路后 20 分钟可达且路径可复算（实 ' + JSON.stringify(chg) + '）');
  // N5 无副作用：本锁的哨兵不得经落盘泄漏进真存档
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2630/world: [N5] 探测哨兵不泄漏进真存档（残留键: ' + (leak.join(',') || '无') + '）');
}
// ══════════════ 入口 ══════════════
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('WORLD-V2630: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('WORLD-V2630: pass（' + pass + ' 项）');
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeRoad: probeRoad, probeReach: probeReach, probeAtt: probeAtt, probeFault: probeFault,
  brokenOverride: brokenOverride
};