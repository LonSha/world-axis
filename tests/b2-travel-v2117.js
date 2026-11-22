#!/usr/bin/env node
// WorldAxis tests/b2-travel-v2117.js -- B2 专锁：场所、出行与机会窗口（v2.117.0）
//
// 规划 02 的 B2 原文（逐句落到判据）：
//   ①「在已有地点层级、道路和通行容量之上增加场所用途与时间窗口」
//     —— 场所用途窗口（addUse/usesOf/useWindowOf）与「空白地点保持抽象」；
//   ②「人员移动、实物运输和消息传输分别定义通道。人员受路线、体力、费用及通行约束；
//     货物受容量、交接和运输时间约束；**消息是否依赖物理道路由渠道决定**」
//     ⇒ 判据：同一段路分通道容量可不同；人的行程与货运分表；
//       `via:'net'` 的消息**不因封路而延迟**，`via:'road'` 的会。
//   ③「天气、灾害和组织封锁向现有 world 通行层投递受影响的路段/窗口，
//     **先更新实际可达性再决定行动**」
//     ⇒ 判据：hazard 投递的地点级封锁在 `transit` 上生效；**路段级封锁让这段路真的走不通**
//       （可达性先更新）；解封要显式投 `unblock`；`until` 过期自动失效；
//       未登记的天气**不假装封锁**。
//   ④「旅行中的改道和中止处理已消耗部分与未执行部分，不直接把人物退回出发状态」
//     —— 前半由 act-b1 锁 + world.stop 守；本锁补「中止后不再被误算成到达」。
//   ⑤「批量快进应在有意义的时点结算，避免逐分钟空转」
//     ⇒ 判据：**窗口化的快进不越站**——本窗口走不完全程就只往前挪，**不宣告到达**；
//       「两账不一致」（账已归零而钟不答应）时显式 `deferred` 且**一格不动**；
//       非窗口化调用走 v2.65.0 台账语义（既有契约，不准被顺手改掉）。
//
// 两向自证：真源码成绿 / 就地破坏现形。破坏只改**内存副本**（srcOverride），零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__b2v2117_';
const REL = 'engines/world.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_DELIV   = "    if (d.blocked[ch] === false) {\n      out.pass = false; out.reason = 'blocked-delivered'; out.why = d.why; out.by = 'delivered';\n      return out;\n    }\n";
const A_CAPBY   = "    const per = (hit.capBy && typeof hit.capBy === 'object') ? hit.capBy[ch] : null;\n    if (per !== null && per !== undefined && isFinite(Number(per))) return Number(per);\n";
const A_NET     = "      const silent = !!(e.ok && e.blocked && e.blocked.person === false\n        && e.blocked.goods === false && e.blocked.message === false);\n";
const A_ROAD    = "        if (roadBlockOf(r.a, r.b).roadClosed) return;\n";
const A_CLOCK   = "          const clockOk = (eta === null) ? true : (eta <= now + step * 60000);\n          if (leftNext === 0 && clockOk) {\n            j.left = 0; j.status = 'arrived'; j.at = now;\n";
const A_WINDOW  = "    const windowed = (at !== null);\n";
const A_DEFER   = "          if (leftNext === 0) { deferred.push(j.person + '→' + j.to); return; }\n";
// 既有契约锚点（不是本批新写的，用来证明旧路径逐字未动）
const A_ARRIVE0 = "if (j.left === 0) { j.status = 'arrived'; arrived.push(j.person + '→' + j.to); }";
// v2.118.0（B7）：本锚点随 world.js 的执行上下文改造同步更新 —— 计数器门面 S 只是把
//   写入定向到**当前执行的**计数器袋（真跑即模块自己的 stat），闸门语义逐字不变：
//   总开关关闭时拒收且只此一处。锚点跟着源码走，不是判据放宽。
const A_GATE0   = "if (!settings().enabled) { S.blocked++; return { ok: false, reason: 'disabled', person: who }; }";

const BROKEN = [
  // ① 摘掉投递层 ⇒ 灾害/组织封锁在通行判定上完全不存在（B2 ③ 的缺口形态）
  { key: 'delivered', from: A_DELIV, to: '' },
  // ② 分通道容量失效（回落单一 cap）⇒「人挤不上但货能走」无法表达
  // 破坏写回旧形态：把「缺失」当 0 读 ⇒ 旧写法登记的容量永远读成「不限」。
  { key: 'capby', from: A_CAPBY, to: "    const per = (hit.capBy && typeof hit.capBy === 'object') ? hit.capBy[ch] : null;\n    if (isFinite(per)) return Number(per);\n" },
  // ③ 网络面按地点级 message 封判 ⇒「一座桥关了消息就延迟」（渠道意涵消失）
  { key: 'net', from: A_NET, to: "      const silent = !!(e.ok && e.blocked && e.blocked.message === false);\n" },
  // ④ 路段面不参与可达性 ⇒ 封路单只登记不生效（功能级失效）
  { key: 'road', from: A_ROAD, to: '' },
  // ⑤ 越站判据失效 ⇒ 账归零就宣告到达（不许「快进顺手送达」）
  // 破坏要**可解析**：删掉三行会留下没闭合的块；改成「钟恒不否决」同一语义的破坏。
  { key: 'clock', from: A_CLOCK, to: "          const clockOk = true;\n          if (leftNext === 0 && clockOk) {\n            j.left = 0; j.status = 'arrived'; j.at = now;\n" },
  // ⑥ 窗口判据处处启用 ⇒ 既有台账契约被顺手改掉
  { key: 'window', from: A_WINDOW, to: "    const windowed = true;\n" },
  // ⑦ 越站时把 left 抹成 0 冒充推进 ⇒ 证据被销毁
  { key: 'defer', from: A_DEFER, to: '' }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function anchorHits(spec) { return fs.readFileSync(path.join(BASE, REL), 'utf8').split(spec.from).length - 1; }
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  return ov;
}
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw:' + (e && e.message); } }; }
function probeWith(spec, fn) { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }
function probeClean(fn) { return guarded(fn)(fresh()); }

// ── 夹具 ────────────────────────────────────────────────────────────────
function seed(WA) {
  WA.world.setSettings({ enabled: true });
  WA.weather.setSettings({ enabled: false });
  // **各探针之间共享同一份聊天存档**（localStorage 键相同）⇒
  //   只重登记地点/道路是不够的：上一轮投下的封锁/货运/消息会漏进这一轮，
  //   症状表现为「第一句 transit 就被前一轮的封锁拦住」这类看不懂的红。
  WA.store.transact(function (d) {
    d.world = d.world || {};
    // `roads` 也必须清空：探针共享同一份存档，上一轮投的 `capBy` 会留在道路行上，
    //   下一轮读到的「货那层不限」会变成上一轮的值（实测让 N2/N3 假红）。
    d.world.journeys = []; d.world.shipments = []; d.world.messages = []; d.world.blocks = [];
    d.world.roads = [];
  }, TAG + 'reset');
  WA.world.addPlace({ name: '甲地', kind: 'public', open: 0, close: 9999999999999 });
  WA.world.addPlace({ name: '乙地', kind: 'public', open: 0, close: 9999999999999 });
  WA.world.addPlace({ name: '丙地', kind: 'public', open: 0, close: 9999999999999 });
  WA.world.addRoad('甲地', '乙地', 30, 0);
  WA.world.addRoad('乙地', '丙地', 25, 0);
}
function seedPerson(WA, name) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_' + name] = { id: 'p_' + name, name: name, knowledge: {}, resources: {}, life: { goals: [], schedule: [] } };
    d.world = d.world || {};
    d.world.journeys = [];
  }, TAG + 'person');
}
function journeys(WA) { return (WA.store.get().world || {}).journeys || []; }

// ══ 探针 ① 封锁投递：灾害/组织投递的地点级封锁必须在通行判定上生效 ══════
function probeDelivered(WA) {
  seed(WA); seedPerson(WA, '甲');
  const t = Date.now();
  const before = WA.world.transit('person', '甲地', '乙地');
  if (before.ok !== true) return 'base-fail:' + before.reason;
  // hazard 投下的封锁（**不是天气**）
  const bk = WA.world.addBlock({ source: 'hazard', place: '乙地', channels: ['person', 'goods'], until: t + 3600000, why: '塌方' });
  if (!bk.ok) return 'addblock-fail:' + bk.reason;
  const p = WA.world.transit('person', '甲地', '乙地');
  const g = WA.world.transit('goods', '甲地', '乙地');
  const m = WA.world.transit('message', '甲地', '乙地');
  if (!(p.ok === false && p.reason === 'blocked-delivered' && p.by === 'delivered' && p.why === '塌方')) {
    return 'person-open:' + p.reason;
  }
  if (g.ok !== false) return 'goods-open:' + g.reason;
  if (m.ok !== true) return 'message-blocked:' + m.reason;
  // 解封必须**显式投递**（unblock），不是删记录
  const un = WA.world.addBlock({ source: 'org', kind: 'unblock', place: '乙地', channels: ['person', 'goods'] });
  if (!un.ok) return 'unblock-fail:' + un.reason;
  const p2 = WA.world.transit('person', '甲地', '乙地');
  if (p2.ok !== true) return 'still-blocked:' + p2.reason;
  // 定时效：过期自动失效（不猜「反正是封锁所以还在」）
  const b2 = WA.world.addBlock({ source: 'org', place: '丙地', channels: ['person'], until: t + 10, why: '戒严' });
  if (!b2.ok) return 'addblock2-fail:' + b2.reason;
  const liveNow = WA.world.effectiveBlockOf('丙地', 'person', t + 5);
  const liveAfter = WA.world.effectiveBlockOf('丙地', 'person', t + 100);
  if (!(liveNow.ok && liveNow.pass === false)) return 'early-open';
  if (!(liveAfter.ok && liveAfter.pass === true)) return 'expired-still-blocked';
  // 未登记的天气不假装封锁（旧写法会返回 blocked:null 让调用方整体炸掉）
  WA.weather.setSettings({ enabled: true });
  const weird = WA.world.transit('person', '甲地', '乙地');
  if (weird.ok !== true && weird.reason !== 'weather-blocked') return 'weird-break:' + weird.reason;
  return 'delivered';
}

// ══ 探针 ② 分通道容量：人挤不上 ≠ 货走不了 ════════════════════════════
function probeCapBy(WA) {
  seed(WA); seedPerson(WA, '甲'); seedPerson(WA, '乙'); seedPerson(WA, '丙');
  // 道路只给「人」一层容量 1，货那层不限（缺省 ⇒ 缺省不是 0）
  const rd = WA.world.addRoad('甲地', '乙地', 30, 0, { capBy: { person: 1 } });
  if (!rd.ok) return 'addroad-fail:' + rd.reason;
  if (WA.world.roadCapOf('甲地', '乙地', 'person') !== 1) return 'person-cap:' + WA.world.roadCapOf('甲地', '乙地', 'person');
  if (WA.world.roadCapOf('甲地', '乙地', 'goods') !== 0) return 'goods-cap:' + WA.world.roadCapOf('甲地', '乙地', 'goods');
  // 第一个人出发占住那一个名额
  const tt0 = Date.now();
  const d1 = WA.world.depart('甲', '甲地', '乙地', tt0);
  if (!d1.ok) return 'depart1-fail:' + d1.reason;
  const d2 = WA.world.depart('乙', '甲地', '乙地', tt0 + 1000);
  if (!(d2.ok === false && d2.reason === 'road-crowded' && d2.channel === 'person')) return 'person-not-crowded:' + d2.reason;
  // 但货在同一段路上照走（容量分层的意思就在这句）
  const g1 = WA.world.deliverGoods('甲地', '乙地', '茶', 3, { at: tt0 + 2000 });
  if (g1.ok !== true) return 'goods-blocked:' + g1.reason;
  // 货那层也限 1 时，第二趟货被拒
  WA.world.addRoad('甲地', '乙地', 30, 0, { capBy: { goods: 1 } });
  const g2 = WA.world.deliverGoods('甲地', '乙地', '盐', 1, { at: tt0 + 3000 });
  if (!(g2.ok === false && g2.reason === 'road-crowded' && g2.channel === 'goods')) return 'goods-not-crowded:' + g2.reason;
  // **没有 capBy 层的旧写法必须照旧生效**：缺失 ≠ 0 容量。
  //   这一段防的是「把 null 当 0」——那时用 `addRoad(a,b,30,1)` 登记的容量
  //   会在通行检查里读成「不限」，等于旧语义被新功能悄悄吃掉。
  WA.world.addRoad('乙地', '丙地', 25, 1);
  if (WA.world.roadCapOf('乙地', '丙地', 'person') !== 1) return 'legacy-cap:' + WA.world.roadCapOf('乙地', '丙地', 'person');
  const d3 = WA.world.depart('丙', '乙地', '丙地', tt0 + 4000);
  if (!d3.ok) return 'legacy-depart1:' + d3.reason;
  const d4 = WA.world.depart('乙', '乙地', '丙地', tt0 + 5000);
  if (!(d4.ok === false && d4.reason === 'road-crowded' && d4.cap === 1 && d4.on === 1)) {
    return 'legacy-not-crowded:' + JSON.stringify(d4);
  }
  return 'layered';
}

// ══ 探针 ③ 消息分渠道：桥关了，网络消息照发，送信才被拦 ═══════════════
function probeMessage(WA) {
  seed(WA);
  const t0 = Date.now();
  const route = WA.world.sendMessage('甲地', '乙地', { via: 'road', at: t0 });
  if (route.ok !== true || route.via !== 'road') return 'road-fail:' + route.reason;
  const net = WA.world.sendMessage('甲地', '乙地', { via: 'net', at: t0 });
  if (net.ok !== true || net.via !== 'net') return 'net-fail:' + net.reason;
  if (!(net.minutes < route.minutes)) return 'no-difference:' + net.minutes + '/' + route.minutes;
  // 封**消息层**（桥断、驿站停）：道路消息走不了，网络消息照发
  WA.world.addBlock({ source: 'hazard', place: '乙地', channels: ['message'], why: '断路' });
  const road2 = WA.world.sendMessage('甲地', '乙地', { via: 'road', at: t0 + 1000 });
  const net2 = WA.world.sendMessage('甲地', '乙地', { via: 'net', at: t0 + 1000 });
  if (road2.ok !== false) return 'road-through-block';
  if (net2.ok !== true) return 'net-blocked:' + net2.reason;
  // 只有「完全静默」（人与货都进不去）才算断线
  const silent = WA.world.addBlock({ source: 'org', place: '丙地', channels: ['person', 'goods', 'message'], why: '全线封锁' });
  if (!silent.ok) return 'silent-fail:' + silent.reason;
  const net3 = WA.world.sendMessage('乙地', '丙地', { via: 'net', at: t0 + 2000 });
  if (!(net3.ok === false && net3.reason === 'blocked-delivered')) return 'not-silent:' + net3.reason;
  return 'by-channel';
}

// ══ 探针 ④ 路段级封锁：先更新可达性，再决定行动 ════════════════════════
function probeRoad(WA) {
  seed(WA); seedPerson(WA, '甲');
  const t0 = Date.now();
  if (WA.world.transit('person', '甲地', '乙地').ok !== true) return 'base-fail';
  // 投一条**路段**封锁（不伪造地点）
  const bk = WA.world.addBlock({ source: 'hazard', road: ['甲地', '乙地'], why: '桥断' });
  if (!bk.ok) return 'addblock-fail:' + bk.reason;
  const seg = WA.world.roadBlockOf('甲地', '乙地', t0);
  if (!(seg.ok === true && seg.roadClosed === true && seg.why === '桥断')) return 'seg-open:' + JSON.stringify(seg);
  // 可达性先更新：这段路不再参与最短路
  const r = WA.world.reach('甲地', '乙地');
  if (!(r.ok === true && r.reachable === false)) return 'still-reachable:' + JSON.stringify(r);
  // 通行判定据实报「哪一层断的」（不是合成一个「不行」）
  const p = WA.world.transit('person', '甲地', '乙地');
  if (!(p.ok === false && p.reason === 'road-closed' && p.why === '桥断')) return 'transit:' + JSON.stringify(p);
  // 人不得出发（拒绝零变化）
  const before = journeys(WA).length;
  const d = WA.world.depart('甲', '甲地', '乙地', t0);
  if (d.ok !== false) return 'departed-on-closed';
  if (journeys(WA).length !== before) return 'journey-leaked';
  // 绕行：丙地接到两端 ⇒ 换路仍可达（封路不等于孤岛）
  WA.world.addRoad('甲地', '丙地', 10, 0);
  WA.world.addRoad('丙地', '乙地', 10, 0);
  const r2 = WA.world.reach('甲地', '乙地');
  if (!(r2.ok === true && r2.reachable === true && r2.minutes === 20)) return 'detour-fail:' + JSON.stringify(r2);
  // 抢通：显式投 unblock（封路单不能「只能封不能解」）
  const un = WA.world.addBlock({ source: 'org', kind: 'unblock', road: ['甲地', '乙地'], why: '抢通' });
  if (!un.ok) return 'unblock-fail:' + un.reason;
  const seg2 = WA.world.roadBlockOf('甲地', '乙地', t0 + 1);
  if (!(seg2.ok === true && seg2.roadClosed === false)) return 'still-closed:' + JSON.stringify(seg2);
  const p3 = WA.world.transit('person', '甲地', '乙地');
  if (p3.ok !== true) return 'still-blocked:' + JSON.stringify(p3);
  return 'road-closed';
}

// ══ 探针 ⑤ 窗口化快进：本窗口走不完就不宣告到达 ════════════════════════
function probeAdvance(WA) {
  seed(WA); seedPerson(WA, '甲'); seedPerson(WA, '乙');
  const t0 = Date.now();
  const d1 = WA.world.depart('甲', '甲地', '乙地', t0);
  if (!d1.ok) return 'depart-fail:' + d1.reason;
  // 全程 30，窗口 15：人还在路上（不是 deferred —— 钟本来就没到点）
  const r1 = WA.world.advance(15, { at: t0 });
  const j1 = journeys(WA)[0];
  if (!(r1.arrived.length === 0 && r1.deferred.length === 0 && r1.still.length === 1
        && j1.status === 'in-transit' && j1.left === 15)) {
    return 'overrun-1:' + j1.left + '/' + JSON.stringify(r1.still) + '/' + JSON.stringify(r1.deferred);
  }
  // **窗口跨不满全程**（还剩 15，窗口只给 10）：只往前挪 10，绝不宣告到达
  const r2 = WA.world.advance(10, { at: t0 + 900000 });
  const j2 = journeys(WA)[0];
  if (!(r2.arrived.length === 0 && r2.deferred.length === 0 && j2.status === 'in-transit' && j2.left === 5)) {
    return 'crossed-station:' + j2.left + '/' + JSON.stringify(r2.arrived) + '/' + JSON.stringify(r2.deferred);
  }
  // 窗口末端越过到达时刻且账走完 ⇒ 到达
  const r3 = WA.world.advance(15, { at: t0 + 1200000 });
  const j3 = journeys(WA)[0];
  if (!(r3.arrived.length === 1 && j3.status === 'arrived' && j3.left === 0)) {
    return 'no-arrival:' + j3.status + '/' + JSON.stringify(r3.arrived);
  }
  // 分层推进：只推消息层时，人的新行程一格不动
  const t1 = t0 + 2000000;
  const d2 = WA.world.depart('甲', '甲地', '乙地', t1);
  if (!d2.ok) return 'depart2-fail:' + d2.reason;
  WA.world.sendMessage('甲地', '乙地', { via: 'net', at: t1 });
  const r4 = WA.world.advance(1, { channel: 'message', at: t1 });
  if (!(r4.arrived.length === 1 && r4.arrived[0].indexOf('message:') === 0)) return 'layer-miss:' + JSON.stringify(r4.arrived);
  const j4 = journeys(WA).filter(function (x) { return x.status === 'in-transit'; })[0];
  if (!(j4 && j4.left === 30)) return 'person-moved:' + (j4 && j4.left);
  // 非窗口化调用走 v2.65.0 台账语义（既有契约）：耗尽即到达
  const r5 = WA.world.advance(30);
  if (!(r5.arrived.length === 1 && r5.arrived[0] === '甲→乙地')) return 'ledger-broken:' + JSON.stringify(r5.arrived);
  return 'not-crossed';
}

// ══ 探针 ⑥ 越站：窗口早于出发时刻 ⇒ deferred 且一格不动 ════════════════
function probeOverskip(WA) {
  seed(WA); seedPerson(WA, '甲');
  const t0 = Date.now();
  const d = WA.world.depart('甲', '甲地', '乙地', t0);
  if (!d.ok) return 'depart-fail:' + d.reason;
  // 拿一段**早于该行程出发时刻**的窗口去推进它（回放/补算，B7 试演要用的那一类窗口）：
  //   账会被减到 0，而钟根本不承认这段路走完了。
  const r = WA.world.advance(30, { at: t0 - 3600000 });
  const j = journeys(WA)[0];
  if (r.arrived.length !== 0) return 'arrived-in-replay:' + JSON.stringify(r.arrived);
  if (r.deferred.length !== 1) return 'not-deferred:' + JSON.stringify({ d: r.deferred, s: r.still, st: j.status });
  if (!(j.status === 'in-transit' && j.left === 30)) return 'moved:' + j.status + '/' + j.left;
  return 'overskip';
}

// ══ 探针 ⑦ 就地等：过不去时不猜另一条路 ════════════════════════════════
function probeWait(WA) {
  seed(WA);
  const t0 = Date.now();
  const ok = WA.world.waitForChannel('person', '甲地', '乙地', t0);
  if (!(ok.ok === true && ok.canGo === true && ok.reason === 'pass')) return 'open-fail:' + JSON.stringify(ok);
  WA.world.addBlock({ source: 'hazard', place: '乙地', channels: ['person'], why: '塌方' });
  const no = WA.world.waitForChannel('person', '甲地', '乙地', t0 + 1000);
  if (!(no.ok === true && no.canGo === false && no.reason === 'blocked-delivered' && no.why === '塌方')) return 'wait-fail:' + JSON.stringify(no);
  // 就地等不改任何状态：没有凭空多出一条绕行路，也不改位置
  if (WA.store.get().world.roads.length !== 2) return 'roads-changed:' + WA.store.get().world.roads.length;
  if (journeys(WA).length !== 0) return 'journey-created';
  return 'waits';
}

// ══ 探针 ⑧ 中止后不再被误算成到达 ══════════════════════════════════════
function probeHalted(WA) {
  seed(WA); seedPerson(WA, '甲');
  const t0 = Date.now();
  const d = WA.world.depart('甲', '甲地', '乙地', t0);
  if (!d.ok) return 'depart-fail:' + d.reason;
  const st = WA.world.stop('甲', t0 + 600000, '改主意');
  if (!(st.ok === true && st.status === 'halted' && st.place === null && st.spent >= 0 && st.left >= 0)) return 'stop-fail:' + JSON.stringify(st);
  const w = WA.world.where('甲');
  if (!(w.place === null && w.reason === 'halted')) return 'where-fail:' + JSON.stringify(w);
  const r = WA.world.advance(600, { channel: 'person', at: t0 + 600000 });
  if (r.arrived.length !== 0) return 'halted-arrived:' + JSON.stringify(r.arrived);
  if (journeys(WA)[0].status !== 'halted') return 'halted-changed:' + journeys(WA)[0].status;
  return 'halted';
}

// ══ 探针 ⑨ 空白地点保持抽象 ════════════════════════════════════════════
function probeAbstract(WA) {
  seed(WA);
  WA.world.addPlace({ name: '丁地', kind: 'public' });   // 不给开闭
  const u = WA.world.useWindowOf('丁地', 'visit');
  if (!(u.ok === true && u.found === false)) return 'use-fail:' + JSON.stringify(u);
  const c = WA.world.canBeAt('甲', '丁地', Date.now());
  if (!(c.ok === true)) return 'canbeat-fail:' + JSON.stringify(c);
  // 丁地不与任何地点相连 ⇒ 走不过去（不按直线距离兜底）
  const r = WA.world.reach('甲地', '丁地');
  if (!(r.ok === true && r.reachable === false)) return 'reach-fail:' + JSON.stringify(r);
  return 'abstract';
}

// ══ 断 言 ══════════════════════════════════════════════════════════════
const results = [];
// 断言投递：run.js 聚合时把宿主 assert 喂进来（本文件因此不再是从不执行的孤儿）；
//   独立直跑时仍用本地 results 汇总并逐条打印（输出格式一字不变）。
let __sink = null;
function a(cond, msg) {
  if (__sink) { __sink(!!cond, msg); return; }
  results.push({ ok: !!cond, msg: msg });
}

const POS = {
  delivered: ['delivered', '封锁投递（hazard/org）在通行判定上生效', probeDelivered],
  cap: ['layered', '分通道容量：人挤不上 ≠ 货走不了', probeCapBy],
  msg: ['by-channel', '消息分渠道：封路只拦 road；只有完全静默才断线', probeMessage],
  road: ['road-closed', '路段级封锁先更新可达性 ⇒ 走不通、能绕行、能抢通', probeRoad],
  adv: ['not-crossed', '窗口化快进不越站 + 分层推进 + 台账语义未变', probeAdvance],
  skip: ['overskip', '越站（窗口早于出发）⇒ deferred 且一格不动', probeOverskip],
  wait: ['waits', '过不去时就地等，不猜另一条路', probeWait],
  halt: ['halted', '中止后不再被误算成到达', probeHalted],
  abst: ['abstract', '空白地点保持抽象 + 无路不可达', probeAbstract]
};

function runPositive() {
  Object.keys(POS).forEach(function (k) {
    const got = probeClean(POS[k][2]);
    a(got === POS[k][0], 'v2117/b2: ' + k + ' — ' + POS[k][1] + '（实 ' + got + '）');
  });
}

function runNegative() {
  // N0 锚点在真源码中恰 1 次
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2117/b2: [N0] 锚点恰 1 次 :: ' + s.key); });
  // 既有契约锚点（不许被本批顺手改掉）
  a(anchorHits({ from: A_ARRIVE0 }) === 1, 'v2117/b2: [N0] v2.65.0 台账到达行仍在（恰 1 次）');
  a(anchorHits({ from: A_GATE0 }) === 1, 'v2117/b2: [N0] 总开关闸门恰 1 处（不许抄成三份）');
  // N1 破坏现形（逐条，靶心各自对应）
  a(probeWith(BROKEN[B.delivered], probeDelivered) !== 'delivered', 'v2117/b2: [N1] 摘掉投递层 ⇒ 灾害封锁在通行上不存在');
  a(probeWith(BROKEN[B.capby], probeCapBy) !== 'layered', 'v2117/b2: [N1] 摘掉分通道容量 ⇒ 层间差异消失');
  a(probeWith(BROKEN[B.net], probeMessage) !== 'by-channel', 'v2117/b2: [N1] 网络面按地点级封判 ⇒ 渠道意涵消失');
  a(probeWith(BROKEN[B.road], probeRoad) !== 'road-closed', 'v2117/b2: [N1] 路段面不参与可达性 ⇒ 封路只登记不生效');
  a(probeWith(BROKEN[B.window], probeAdvance) !== 'not-crossed', 'v2117/b2: [N1] 窗口判据处处启用 ⇒ 既有台账契约被改');
  a(probeWith(BROKEN[B.clock], probeOverskip) !== 'overskip', 'v2117/b2: [N1] 压掉钟的否决权 ⇒ 越站时把人在时间轴外送到终点');
  a(probeWith(BROKEN[B.defer], probeOverskip) !== 'overskip', 'v2117/b2: [N1] 越站时抹平 left ⇒ 证据被销毁');
  // N2 真源码成绿（逐条，与正断言同源但独立重跑）
  Object.keys(POS).forEach(function (k) {
    a(probeClean(POS[k][2]) === POS[k][0], 'v2117/b2: [N2] 原版 ' + k);
  });
  // N3 破坏互不串扰（一个破坏不许把别的判据弄红，也不许把它们弄绿）
  a(probeWith(BROKEN[B.delivered], probeCapBy) === 'layered', 'v2117/b2: [N3] 投递破坏不影响容量分层');
  a(probeWith(BROKEN[B.delivered], probeRoad) === 'road-closed', 'v2117/b2: [N3] 投递破坏不影响路段封锁（两层各自独立）');
  a(probeWith(BROKEN[B.capby], probeDelivered) === 'delivered', 'v2117/b2: [N3] 容量破坏不影响投递');
  a(probeWith(BROKEN[B.net], probeAdvance) === 'not-crossed', 'v2117/b2: [N3] 消息破坏不影响快进');
  a(probeWith(BROKEN[B.road], probeAdvance) === 'not-crossed', 'v2117/b2: [N3] 路段破坏不影响快进');
  a(probeWith(BROKEN[B.window], probeOverskip) === 'overskip', 'v2117/b2: [N3] 窗口开关破坏不影响越站判据');
  a(probeWith(BROKEN[B.defer], probeAdvance) === 'not-crossed', 'v2117/b2: [N3] deferred 破坏不影响窗口化推进');
  a(probeWith(BROKEN[B.capby], probeMessage) === 'by-channel', 'v2117/b2: [N3] 容量破坏不影响消息渠道');
  // N4 判据非恒真：真状态确实改变
  const chg = (function () {
    const WA = fresh(); seed(WA);
    const s0 = JSON.stringify(WA.store.get().world);
    WA.world.addBlock({ source: 'org', place: '乙地', channels: ['person'], why: '戒严' });
    const s1 = JSON.stringify(WA.store.get().world);
    return s0 !== s1;
  })();
  a(chg === true, 'v2117/b2: [N4] 判据非恒真（真状态确实改变）');
  // 哨兵：夹具不许漏进 localStorage
  let leak = 0;
  try {
    for (let i = 0; i < global.localStorage.length; i++) {
      const k = global.localStorage.key(i);
      if (k && String(global.localStorage.getItem(k)).indexOf(TAG) >= 0) leak++;
    }
  } catch (e) {}
  a(leak === 0, 'v2117/b2: [N5] 哨兵未泄漏（' + leak + '）');
}

/** 聚合入口（run.js 调用）：整套正负判据跑一遍，结论交给宿主 assert。 */
function runAll(assert) {
  __sink = assert;
  try { runPositive(); runNegative(); } finally { __sink = null; }
}
/** 只跑负向自证（独立入口，供需要单跑负控的调用方）。 */
function runNegativeOnly(assert) {
  __sink = assert;
  try { runNegative(); } finally { __sink = null; }
}
module.exports = { runAll: runAll, runNegative: runNegativeOnly,
  POS: POS, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };
// 直跑守卫：**只有**被当成入口文件时才自己跑自己（被 require 时绝不 exit）。
if (require.main === module) {
  runPositive();
  runNegative();
  const bad = results.filter(function (r) { return !r.ok; });
  bad.forEach(function (r) { console.log('  x ' + r.msg); });
  if (bad.length) {
    console.log('B2-TRAVEL-V2117: FAIL ' + bad.length + ' / ' + results.length);
    process.exit(1);
  }
  console.log('B2-TRAVEL-V2117: pass (' + results.length + ')');
}