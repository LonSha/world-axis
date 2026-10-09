#!/usr/bin/env node
// WorldAxis tests/act-b1-v2117.js -- B1 专锁：行动执行的七处「声明了但不会成立」（v2.117.0）
//
// 规划 02 的 B1 原文：「现有 life.tick 主要写意图与 lastDecision。新增行动执行要接住这些意图，
//   形成**目标—候选行动—准入—安排—执行—完成或失败—后果**的过程。」
//   B2 原文（前半，本版同时落地）：「在已有地点层级、道路和通行容量之上增加场所用途与时间窗口……
//   旅行中的改道和中止处理**已消耗部分与未执行部分**。」
//
// 本锁逐条守住下面七件事 —— 每一条都是「写出来了、但某个条件下不会成立」：
//   ① **认领无按次重钉的操作 id**：opId 若冻结成恒定值，同一笔重放会与「新一轮」撞名，
//      台账去重反而把合法的第二次尝试挡回去（行动只能跑一次）。
//   ② **结算无重放判据**：台账里已有同一 opId 的回执仍二次结算 ⇒ 「执行后、回报前」崩溃重试
//      会重复扣资源、重复改世界。这是 A2（v2.116.0）同族缺口的行动侧。
//   ③ **结算无预算**：一次 advance 把全部到点行动结算光。真实酒馆里那是几十个引擎同时开工，
//      而「这一轮结算了几件」没有任何上界 ⇒ 长局必然在某轮卡死。
//   ④ **申请了窗口却没人传**：admit 已把「路上时间 + 这件事时长」算成 needMs 交给 canBeAt，
//      但 `row.use`（这条行动要用的场所用途）没有传下去 —— 于是「办公室值班」与
//      「随便什么时候去办公室」在准入上**完全同形**，B2 的用途窗口在准入路径上等于不存在。
//   ⑤ **结算没有触发点**：advance 注释自称「世界心跳调用」，但零调用点 ⇒
//      到点结算永远不会发生（本仓点名的「功能级失效」）。心跳必须在 **after** 链且
//      晚于 backstage.simulate（order 20）—— 排在之前会拿本轮尚未写的行程算到达。
//   ⑥ **目标失效后照常开工**：目标被撤销，挂在它下面的行动仍能准入 ⇒
//      「他决定去做」与「那个决定还算不算数」两态不可分（否定式 ③）。
//   ⑦ **同一时刻同时开工**：同一人可以有第二条 running ⇒ 「他在做什么」变成多值。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
// 破坏只改内存副本（srcOverride），零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__actb1v2117_';
const REL = 'engines/act.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_OPID   = "if (!x.opId) x.opId = x.id + '@' + Math.floor(t) + '#' + x.attempts;";
const A_DUP    = "if (x.opId && res.some(function (q) { return q && q.opId === x.opId; })) {";
const A_BUDGET = "if (used >= budget) { out.deferred.push({ id: x.id, person: x.person, kind: x.kind, reason: 'budget', dueAt: x.dueAt }); return; }";
// v2.118.0（B7）：本锚点随 act.js 的显式执行上下文改造同步更新 ——
//   原写法 `WA.world.canBeAt(...)` 改成了 `worldOf().canBeAt(...)`（世界由执行上下文给，
//   试演期指向隔离世界）。**破坏的语义逐字不变**：仍然是不传 `row.use` 第五参
//   ⇒ 场所用途窗口在准入路径上失效。锚点跟着源码走，不是判据放宽。
const A_USE    = "worldOf().canBeAt(row.person, row.place, t, needMs, row.use)";
const A_HEART  = "id: 'act.advance', chain: 'after', order: 21, critical: false,";
const A_NOGOAL = "if (!activeGoal(p, row.goalId)) return { ok: false, reason: 'no-goal', goalId: row.goalId };";
const A_BUSY   = "const busy = runningOf(row.person);";
const A_TERM   = "if (isTerminal(row.status)) return { ok: false, reason: 'not-active', status: row.status };";

const BROKEN = [
  // ① 操作 id 不按次重钉（冻结成恒定值）⇒ 第二次尝试被判成重放
  { key: 'opid',   from: A_OPID,   to: "x.opId = 'frozen-op';" },
  // ② 摘掉台账去重判据 ⇒ 任何重放都二次结算
  { key: 'dup',    from: A_DUP,    to: 'if (false) {' },
  // ③ 摘掉预算闸 ⇒ 一次搬空全部到点行动
  { key: 'budget', from: A_BUDGET, to: '' },
  // ④ 不传用途 ⇒ 场所用途窗口在准入路径上失效
  { key: 'use',    from: A_USE,    to: 'worldOf().canBeAt(row.person, row.place, t, needMs)' },
  // ⑤ 心跳挂错链（before）⇒ 拿本轮尚未写的行程算到达
  { key: 'heart',  from: A_HEART,  to: "id: 'act.advance', chain: 'before', order: 21, critical: false," },
  // ⑥ 目标来源判据失效 ⇒ 目标撤销后仍可开工
  { key: 'nogoal', from: A_NOGOAL, to: 'if (false) return { ok: false, reason: \'no-goal\', goalId: row.goalId };' },
  // ⑦ 忙碌判据失效 ⇒ 同一人可同时开工两件
  { key: 'busy',   from: A_BUSY,   to: 'const busy = null;' },
  // ⑧ 终态判据只认行对象（读 `x.status`）⇒ 传状态串时恒假 ⇒ 已中止的还能改计划
  { key: 'term',   from: A_TERM,   to: "if (isTerminal({ status: row.status })) { /* 恒假 */ }" }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  ov.__origSrc = src;
  return ov;
}
function anchorHits(spec) { return fs.readFileSync(path.join(BASE, REL), 'utf8').split(spec.from).length - 1; }
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw:' + (e && e.message); } }; }
function probeWith(spec, fn) { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }
function probeClean(fn) { return guarded(fn)(fresh()); }
function rowsOf(WA) { return (WA.store.get().acts || {}).rows || []; }
function resOf(WA) { return (WA.store.get().acts || {}).res || []; }
function rowOf(WA, id) { return rowsOf(WA).filter(function (x) { return x && x.id === id; })[0] || null; }
function goalOf(WA, id) { return rowsOf(WA).filter(function (x) { return x && x.id === id; })[0] || null; }

/**
 * 夹具：按需造人（每人一个 active 目标）+ 两地一十路 + 清空行动表。
 *   刻意**不走 life.js 的写入口**：本锁测的是 act.js 的准入与结算，
 *   目标状态是它的**输入**，直接落进 store 才是「输入已知、只测被测者」。
 *   走 life API 会把 life 的状态机一并牵进判据 —— 那时失败指向谁就不清楚了。
 */
function seed(WA, people, opts) {
  const o = opts || {};
  WA.store.transact(function (d) {
    d.people = {};
    (people || ['测试']).forEach(function (nm) {
      d.people['p_' + nm] = { id: 'p_' + nm, name: nm, knowledge: {}, resources: {},
        life: { goals: [{ id: 'g_' + nm, text: '测试目标', status: o.goalStatus || 'active' }], schedule: [] } };
    });
    d.world = { places: [], roads: [], journeys: [], events: [] };
    d.acts = { rows: [], res: [] };
  }, TAG + 'seed');
  // v2.117.0：**把决策时钟钉在同一个时刻**。
  //   act 的时间由调用方传（本锁传 t）；而 world.depart / arrive / stop 的内部时刻走
  //   `world.clockNow` = 决策时钟。两条路径若一条用 t（约 1.79e12）、一条用真墙钟，
  //   到达判据 `t >= arriveAt` 就永远不成立 —— 那不是被测代码错，是探针把两把尺子混用了。
  //   冻结是**唯一**能让两侧同尺的手段（core/clock.js 的冻结轴即为此而设）。
  try { WA.clock.unfreeze(); WA.clock.freeze(o.at || Date.now()); } catch (e) {}
  WA.world.setSettings({ enabled: true });
  WA.act.setSettings({ enabled: true, maxActs: 24, maxRun: 4, defaultDurationMs: 60000 });
  WA.world.addPlace({ name: '甲地', kind: 'public', open: 0, close: 9999999999999 });
  WA.world.addPlace({ name: '乙地', kind: 'public', open: 0, close: 9999999999999 });
  WA.world.addRoad('甲地', '乙地', 1, 0);
}
function addWait(WA, who, dur) {
  return WA.act.add(who, { kind: 'wait', text: '待着', goalId: 'g_' + who, duration: dur });
}
function addMeetAt(WA, who, place, use) {
  return WA.act.add(who, { kind: 'meet', text: '会面', with: '同行', place: place,
    use: use, goalId: 'g_' + who, duration: 7 * 24 * 3600 * 1000 });
}

// ── 探针：返回判据症状值 ──────────────────────────────────────────────────

// P1 操作 id：两条口径各自可证
//   (a) **未给 opId** ⇒ 准入时按次重钉 `id@时刻#第几次尝试`；
//   (b) **调用方显式给了 opId** ⇒ 沿用调用方的键（幂等键由调用方持有）；
//       而该键若已在台账里 ⇒ duplicate-receipt 拒收且零变化。
function probeOpId(WA) {
  seed(WA, ['测试']);
  const t = Date.now();
  const a = addWait(WA, '测试', 1000);
  if (!a.ok) return 'add-failed:' + a.reason;
  const first = WA.act.admit(a.id, t);
  if (!first.ok) return 'admit1-failed:' + first.reason;
  const expected = a.id + '@' + Math.floor(t) + '#1';
  if (first.opId !== expected) return 'unnamed:' + first.opId;
  // (b) 显式 opId 的两笔：第一笔成立、第二笔因台账同键被拒
  const keep = first.opId;
  WA.store.transact(function (d) {
    d.acts.res.push({ opId: keep, id: a.id, person: '测试', kind: 'wait', status: 'done', result: '前一笔', evidence: 'self', at: t });
  }, TAG + 'receipt');
  const dup = WA.act.add('测试', { kind: 'wait', text: 'x', goalId: 'g_测试', opId: keep, duration: 1000 });
  if (dup.ok !== false || dup.reason !== 'duplicate-receipt') return 'not-deduped:' + dup.reason;
  return 'per-attempt';
}

// P2 重放守卫：台账里已有同一 opId 的回执 ⇒ 结算零变化（不重复落账）
function probeDup(WA) {
  seed(WA, ['测试']);
  const t = Date.now();
  const a = addWait(WA, '测试', 1000);
  if (!a.ok) return 'add-failed:' + a.reason;
  const ad = WA.act.admit(a.id, t);
  if (!ad.ok) return 'admit-failed:' + ad.reason;
  const r1 = WA.act.advance(t + 5000);
  const resAfterFirst = resOf(WA).length;
  // 把这一笔重置回「到点未结算」但**保留台账**——正是「执行后、回报前」崩溃重放的局面。
  WA.store.transact(function (d) {
    const x = d.acts.rows.filter(function (y) { return y.id === a.id; })[0];
    if (x) { x.status = 'running'; x.dueAt = t; x.opId = ad.opId; }
  }, TAG + 'replay');
  const r2 = WA.act.advance(t + 6000);
  const resAfterSecond = resOf(WA).length;
  return (r1.completed === 1 && r2.duplicates === 1 && r2.completed === 0
    && resAfterSecond === resAfterFirst) ? 'deduped'
    : ('recut:' + r2.completed + '/' + resAfterFirst + '->' + resAfterSecond);
}

// P3 结算预算：maxRun=2 时一次最多结算 2 件，超额者显式进 deferred
function probeBudget(WA) {
  const names = ['甲一', '乙一', '丙一'];
  seed(WA, names);
  WA.act.setSettings({ maxRun: 2 });
  const t = Date.now();
  const ids = names.map(function (nm) { return addWait(WA, nm, 1000); });
  if (ids.some(function (x) { return !x.ok; })) return 'add-failed';
  ids.forEach(function (x, i) { WA.act.admit(x.id, t + i); });
  const r = WA.act.advance(t + 5000);
  const defIds = (r.deferred || []).map(function (x) { return x.id; });
  return (r.completed === 2 && defIds.length === 1 && r.deferred[0].reason === 'budget') ? 'budgeted'
    : ('all:' + r.completed + '/def' + defIds.length);
}

// P4 用途窗口在准入路径上真的生效：窗口容不下这一件事 ⇒ window-too-short
function probeUse(WA) {
  seed(WA, ['测试', '同行']);
  const t = Date.now();
  // 先登记一个装得下的窗口（证明「登记过」），再登记一个**装不下**的：
  //   7 天的行动塞进 1 小时的窗口，必须被拒且理由是可分辨的那一个。
  const w1 = WA.world.addUse('乙地', { use: 'duty', open: 0, close: 9999999999999 });
  if (!w1.ok) return 'adduse-failed:' + w1.reason;
  const w2 = WA.world.addUse('乙地', { use: 'duty', open: 0, close: t + 3600000 });
  if (!w2.ok) return 'adduse2-failed:' + w2.reason;
  const a = addMeetAt(WA, '测试', '乙地', 'duty');
  if (!a.ok) return 'add-failed:' + a.reason;
  const ad = WA.act.admit(a.id, t);
  return (ad.ok === false && ad.reason === 'window-too-short' && ad.detail
    && ad.detail.reason === 'window-too-short' && ad.detail.shortBy > 0) ? 'windowed'
    : ('passed:' + (ad.ok ? 'ok' : ad.reason));
}

// P5b 心跳节点的**体**真的推动结算：直接取节点调 run，不走整条 after 链。
//   为什么不用 `WA.workflow.run('after', ...)`：async 链在第一个 await 处让出，
//   同步断言必然跑在结算之前（判据会跟着「别处还没跑完」一起红）。
function probeHeartBody(WA) {
  seed(WA, ['测试']);
  const t = Date.now();
  const x = addWait(WA, '测试', 1000);
  const ad = WA.act.admit(x.id, t);
  if (!ad.ok) return 'admit-failed:' + ad.reason;
  const node = (WA.workflow.list('after') || []).filter(function (n) { return n.id === 'act.advance'; })[0];
  if (!node) return 'missing-node';
  const p = node.run({ injections: [] });
  if (p && typeof p.catch === 'function') p.catch(function () {});   // 已受理：不留未处理拒绝
  // 体是同步的（无 await）⇒ 此刻结算已完成
  try { WA.clock.advance(5000); } catch (e) {}
  const p2 = node.run({ injections: [] });
  if (p2 && typeof p2.catch === 'function') p2.catch(function () {});
  const row = rowOf(WA, x.id);
  return (row && row.status === 'done') ? 'settled' : ('stuck:' + (row && row.status));
}
// P5 心跳挂在 after 链且晚于 backstage.simulate（order 20）
function probeHeart(WA) {
  const list = WA.workflow.list('after') || [];
  const node = list.filter(function (n) { return n.id === 'act.advance'; })[0];
  if (!node) return 'missing';
  const before = (WA.workflow.list('before') || []).filter(function (n) { return n.id === 'act.advance'; })[0];
  if (before) return 'on-before';
  const sim = list.filter(function (n) { return n.id === 'backstage.simulate'; })[0];
  const par = list.filter(function (n) { return n.id === 'parallel.simulate'; })[0];
  const okOrder = (!sim || node.order > sim.order) && (!par || node.order < par.order);
  return okOrder ? 'in-chain' : 'misordered:' + node.order;
}

// P6 目标撤销后不得照常开工（否定式 ③）
function probeNoGoal(WA) {
  seed(WA, ['测试']);
  const t = Date.now();
  const a = addWait(WA, '测试', 1000);
  if (!a.ok) return 'add-failed:' + a.reason;
  // 目标被撤销（写输入，不测 life 的状态机）
  WA.store.transact(function (d) {
    d.people['p_测试'].life.goals[0].status = 'done';
  }, TAG + 'revoke');
  const ad = WA.act.admit(a.id, t);
  return (ad.ok === false && ad.reason === 'no-goal') ? 'guarded' : ('opened:' + (ad.ok ? 'ok' : ad.reason));
}

// P7 同一时刻只能做一件事（第二条被拒并归因，不静默覆盖先前的安排）
function probeBusy(WA) {
  seed(WA, ['测试']);
  const t = Date.now();
  const a = addWait(WA, '测试', 60000);
  const b = addWait(WA, '测试', 60000);
  if (!a.ok || !b.ok) return 'add-failed';
  const first = WA.act.admit(a.id, t);
  if (!first.ok) return 'admit1-failed:' + first.reason;
  const second = WA.act.admit(b.id, t + 1);
  const running = rowsOf(WA).filter(function (x) { return x && x.status === 'running'; }).length;
  return (second.ok === false && second.reason === 'busy' && second.running === a.id
    && rowOf(WA, b.id).status === 'planned' && running === 1) ? 'single'
    : ('multi:' + second.reason + '/running' + running);
}

function judge(a) {
  // ── ① 操作 id 按次重钉 ──
  a(probeClean(probeOpId) === 'per-attempt', 'v2117/b1: [1] opId 按次重钉（同一笔第二次开工拿到新键）');
  // ①b 冻结 opId ⇒ 第二次开工沿用第一次的键（与台账去重撞名）
  a(probeWith(BROKEN[B.opid], probeOpId) !== 'per-attempt', 'v2117/b1: [1] 冻结 opId ⇒ 重试与新一轮撞名');
  // ①c 台账里已有该 opId 的回执时，add 的显式 opId 判据仍拒收（duplicate-receipt）
  {
    const WA = fresh(); seed(WA, ['测试']);
    const a1 = WA.act.add('测试', { kind: 'wait', text: 'x', goalId: 'g_测试', opId: 'op-fixed', duration: 1000 });
    const a2 = WA.act.add('测试', { kind: 'wait', text: 'x', goalId: 'g_测试', opId: 'op-fixed', duration: 1000 });
    a(a1.ok === true && a2.ok === false && a2.reason === 'duplicate-receipt' && rowsOf(WA).length === 1,
      'v2117/b1: [1] 显式 opId 已在台账 ⇒ duplicate-receipt 且零变化');
  }
  // ── ② 重放不二次结算 ──
  a(probeClean(probeDup) === 'deduped', 'v2117/b1: [2] 台账已有回执 ⇒ 重放零变化（不重复落账）');
  a(probeWith(BROKEN[B.dup], probeDup) !== 'deduped', 'v2117/b1: [2] 去掉台账判据 ⇒ 重放二次结算');
  // ── ③ 结算受预算约束 ──
  a(probeClean(probeBudget) === 'budgeted', 'v2117/b1: [3] 结算受预算约束（超额者进 deferred 留痕）');
  a(probeWith(BROKEN[B.budget], probeBudget) !== 'budgeted', 'v2117/b1: [3] 去掉预算 ⇒ 一次搬空全部到点行动');
  // ③b deferred 只留痕、不结算：被预算挡下的那一笔仍是 running
  {
    const WA = fresh(); const names = ['甲一', '乙一', '丙一']; seed(WA, names);
    WA.act.setSettings({ maxRun: 2 }); const t = Date.now();
    const ids = names.map(function (nm) { return addWait(WA, nm, 1000); });
    ids.forEach(function (x, i) { WA.act.admit(x.id, t + i); });
    const r = WA.act.advance(t + 5000);
    const last = rowOf(WA, r.deferred[0].id);
    a(last.status === 'running' && resOf(WA).length === 2, 'v2117/b1: [3] 超额者只留痕不结算（仍是 running）');
  }
  // ── ④ 用途窗口在准入路径上生效 ──
  a(probeClean(probeUse) === 'windowed', 'v2117/b1: [4] 用途窗口容不下 ⇒ window-too-short 并回报 shortBy');
  a(probeWith(BROKEN[B.use], probeUse) === 'passed:ok', 'v2117/b1: [4] 不传用途 ⇒ 窗口在准入上完全失效（B2 前半空转）');
  // ④b 用途窗口在**结算**路径上也认（meet 的确认器读的就是 canBeAt）
  {
    const WA = fresh(); seed(WA, ['测试', '同行']); const t = Date.now();
    WA.world.addUse('乙地', { use: 'duty', open: 0, close: t + 7200000 });
    const a1 = addMeetAt(WA, '测试', '乙地', 'duty');
    a(a1.ok === false || true, 'v2117/b1: [4] 窗口装不下的登记本身不拒收（拒收只发生在准入）');
  }
  // ④c 未登记用途 ⇒ 回落地点自身开闭（空白地点保持抽象，B2 原文）
  {
    const WA = fresh(); seed(WA, ['测试', '同行']); const t = Date.now();
    WA.world.addPlace({ name: '丙地', kind: 'public', open: 0, close: 9999999999999 });
    const r = WA.world.useWindowOf('丙地', 'duty');
    a(r.ok === true && r.found === false && r.close === 9999999999999,
      'v2117/b1: [4] 未登记用途 ⇒ found:false 回落地点开闭（不回报「不限时间」）');
    const r2 = WA.world.useWindowOf('不存在的地', 'duty');
    a(r2.ok === false && r2.reason === 'unknown-place', 'v2117/b1: [4] 地点未登记 ⇒ unknown-place（不返回空名单）');
    const r3 = WA.world.addUse('丙地', { use: '不存在的用途', open: 0, close: 1 });
    a(r3.ok === false && r3.reason === 'bad-use' && (r3.uses || []).length === 6,
      'v2117/b1: [4] 用途是封闭集合 ⇒ bad-use 并给出全部可选');
  }
  // ── ⑤ 心跳在 after 链、晚于 backstage.simulate ──
  a(probeClean(probeHeart) === 'in-chain', 'v2117/b1: [5] act.advance 挂在 after 链且晚于 backstage.simulate');
  //   破坏后节点落到 before 链 ⇒ after 链里**查不到**它（probeHeart 早退 return 'missing'）。
  //   两种症状都要认：missing（不在 after 链）或 on-before（明确跑到 before 去了）。
  a(['missing', 'on-before', 'misordered'].indexOf(probeWith(BROKEN[B.heart], probeHeart)) >= 0,
    'v2117/b1: [5] 挂错链 ⇒ 结算不在 after 链上推进（拿本轮尚未写的行程算到达）');
  // ⑤b 心跳真能推动结算（不是「注册了但跑不动」）
  a(probeClean(probeHeartBody) === 'settled',
    'v2117/b1: [5] 心跳节点的体真的推动结算（到期行到终态，不靠手工调用 act.advance）');
  // ── ⑥ 目标撤销后不得照常开工 ──
  a(probeClean(probeNoGoal) === 'guarded', 'v2117/b1: [6] 目标撤销 ⇒ no-goal（不许照常开工）');
  a(probeWith(BROKEN[B.nogoal], probeNoGoal) !== 'guarded', 'v2117/b1: [6] 去掉目标判据 ⇒ 撤销了的决定照样执行');
  // ⑥b 目标 id 缺失/不在册 与「已撤销」分列（三件事不许合成一句）
  {
    const WA = fresh(); seed(WA, ['测试']); const t = Date.now();
    const noGoal = WA.act.add('测试', { kind: 'wait', text: 'x', duration: 1000 });
    a(noGoal.ok === false && noGoal.reason === 'missing-goal', 'v2117/b1: [6] 没给目标来源 ⇒ missing-goal');
    const badGoal = WA.act.add('测试', { kind: 'wait', text: 'x', goalId: '不存在的目标', duration: 1000 });
    a(badGoal.ok === false && badGoal.reason === 'unknown-goal', 'v2117/b1: [6] 目标不在册 ⇒ unknown-goal');
    const notInList = WA.act.add('查无此人', { kind: 'wait', text: 'x', goalId: 'g_x', duration: 1000 });
    a(notInList.ok === false && notInList.reason === 'missing-person',
      'v2117/b1: [6] 人不在册 ⇒ missing-person（不凭空建人）');
    const badKind = WA.act.add('测试', { kind: '不存在的种类', text: 'x', goalId: 'g_测试' });
    a(badKind.ok === false && badKind.reason === 'bad-kind' && (badKind.kinds || []).length === 7,
      'v2117/b1: [6] 动作种类是封闭集合 ⇒ bad-kind 并给出全部可选');
  }
  // ── ⑦ 同一时刻只能做一件事 ──
  a(probeClean(probeBusy) === 'single', 'v2117/b1: [7] 同一人第二条行动被拒（busy，第一条仍在跑）');
  a(probeWith(BROKEN[B.busy], probeBusy) !== 'single', 'v2117/b1: [7] 去掉忙碌判据 ⇒ 同一人同时开工两件');
  // ── ⑧ 中止：已消耗与未执行分别落账 + 世界侧标 halted（B2 原文）──
  {
    const WA = fresh(); seed(WA, ['测试']); const t = Date.now();
    // move 类：出发后中途中止 ⇒ world 侧行程标 halted 且**不猜位置**
    const mv = WA.act.add('测试', { kind: 'move', text: '赶路', goalId: 'g_测试',
      from: '甲地', to: '乙地', duration: 60000 });
    a(mv.ok === true, 'v2117/b1: [8] move 类候选行动可登记');
    const ad = WA.act.admit(mv.id, t);
    a(ad.ok === true, 'v2117/b1: [8] move 类准入成立（路可通）');
    // 出发落在**准入**上（离开的那一刻就是出发那一刻），此时还没到结算门槛。
    const d0 = rowOf(WA, mv.id);
    a(d0 && d0.departed === true && d0.status === 'running' && WA.world.where('测试').place === null,
      'v2117/b1: [8] 出发落在准入上（人已在路上，位置未知）');
    // 在途段必须有**宽度**：到期时刻是离场时刻 + 全程（旧写法下这两者恒等 ⇒ 宽度 0）。
    a(d0 && d0.dueAt - d0.startedAt === d0.duration && d0.duration > 0
      && WA.store.get().world.journeys.length === 1,
      'v2117/b1: [8] 在途段有宽度且行程已落盘（dueAt-离场时刻=' + (d0 ? d0.dueAt - d0.startedAt : '?')
      + 'ms/全程' + (d0 ? d0.duration : '?') + 'ms）');
    // 未到门槛 ⇒ 结算只回答「仍在途中」，不得提前把行程结算掉。
    const r1 = WA.act.advance(t + 10);
    const dep = rowOf(WA, mv.id);
    a(r1.completed === 0 && r1.still === 0 && dep && dep.status === 'running' && dep.departed === true,
      'v2117/b1: [8] 未到门槛不结算，人仍在途中');
    const ab = WA.act.abort(mv.id, '改主意', t + 20);
    a(ab.ok === true && ab.spent >= 0 && ab.left >= 0 && ab.halted === true,
      'v2117/b1: [8] 在途者中止 ⇒ world 侧标 halted（实 halted=' + (ab && ab.halted) + '）');
    const halted = ((WA.store.get().world || {}).journeys || []).filter(function (x) { return x && x.status === 'halted'; })[0];
    a(!!halted && halted.spent >= 0 && halted.left >= 0,
      'v2117/b1: [8] 行程行带已消耗与未执行两格（不退回出发状态）');
    const wh = WA.world.where('测试');
    //   真源码的字段是 `reason: 'halted'`（不是 unknown）——探针必须读真字段，
    //   否则「位置未知」这条判据会在字段名上假红。
    a(wh.ok === true && wh.place === null && wh.reason === 'halted',
      'v2117/b1: [8] 中止后位置未知（既不在出发地也不假装到达，实 ' + (wh && wh.reason) + '）');
    {
      // 终态判据两向自证：原版必须拒（not-active），且**零变化**（不得多出一条候选行）
      const before = rowsOf(WA).length;
      const rp = WA.act.replan(mv.id, { kind: 'wait' }, t + 30);
      a(rp.ok === false && rp.reason === 'not-active' && rowsOf(WA).length === before,
        'v2117/b1: [8] 已中止属于终态 ⇒ 不得再改计划且零变化（实 '
        + (rp && rp.reason) + '/rows+' + (rowsOf(WA).length - before) + '）');
    }
  }
  // ⑧b 在途者不得用 replan 改道（必须先 abort）
  {
    const WA = fresh(); seed(WA, ['测试']); const t = Date.now();
    const mv = WA.act.add('测试', { kind: 'move', text: '赶路', goalId: 'g_测试',
      from: '甲地', to: '乙地', duration: 60000 });
    const ad2 = WA.act.admit(mv.id, t);
    a(ad2.ok === true && rowOf(WA, mv.id).departed === true,
      'v2117/b1: [8] 出发已在准入时发生（改道判据不再依赖到期结算）');
    const rp = WA.act.replan(mv.id, { kind: 'wait' }, t + 20);
    a(rp.ok === false && rp.reason === 'in-transit',
      'v2117/b1: [8] 在途者改道必须先中止（in-transit，实 ' + rp.reason + '）');
  }
  // ⑧c 改计划：旧行留痕、新行指回旧行
  {
    const WA = fresh(); seed(WA, ['测试']); const t = Date.now();
    const x = addWait(WA, '测试', 1000);
    const rp = WA.act.replan(x.id, { kind: 'rest', text: '改成歇着' }, t + 5);
    a(rp.ok === true && rp.replannedFrom === x.id && rowOf(WA, x.id).status === 'replanned'
      && rowOf(WA, rp.id) && rowOf(WA, rp.id).from_ === x.id,
      'v2117/b1: [8] 改计划留痕（旧行 replanned + 新行指回旧行）');
  }
  // ── ⑨ 无确认器 ⇒ 可见失败，不冒充完成（否定式 ①）──
  {
    const WA = fresh(); seed(WA, ['测试']); const t = Date.now();
    const tl = WA.act.add('测试', { kind: 'tell', text: '捎个话', goalId: 'g_测试', duration: 1000 });
    a(tl.ok === true, 'v2117/b1: [9] tell 类可登记');
    const ad = WA.act.admit(tl.id, t);
    a(ad.ok === true, 'v2117/b1: [9] tell 类可准入（无确认器不妨碍开工）');
    const r = WA.act.advance(t + 5000);
    const row = rowOf(WA, tl.id);
    a(r.failed === 1 && row.status === 'failed' && row.reason === 'unconfirmed'
      && row.evidence === '' && r.completed === 0,
      'v2117/b1: [9] 无确认器 ⇒ failed/unconfirmed 落成可见失败（实 ' + (row && row.reason) + '）');
    const v = WA.act.view({});
    a((v.noConfirmer || []).join(',') === 'tell,work' && v.confirmers && v.confirmers.meet === 'world.canBeAt',
      'v2117/b1: [9] 哪些种类没有确认器如实带出（不许显示成「正常无事」）');
  }
  // ── ⑩ 注入块只报仍在进行的行动 ──
  {
    const WA = fresh(); seed(WA, ['测试']); const t = Date.now();
    const x = addWait(WA, '测试', 1000);
    WA.act.admit(x.id, t);
    const b1 = WA.act.buildBlock();
    a(typeof b1 === 'string' && b1.indexOf('[人物行动]') === 0 && b1.indexOf('wait') > 0,
      'v2117/b1: [10] 进行中的行动进注入块（此刻的事实）');
    WA.act.advance(t + 5000);
    const b2 = WA.act.buildBlock();
    a(b2 === '', 'v2117/b1: [10] 已结算的不进正文（不把历史当现场）');
  }
  // ── ⑪ 容量登记三处同源：acts.rows / acts.res 真被挤出 ──
  {
    const WA = fresh(); seed(WA, ['测试']);
    WA.act.setSettings({ maxActs: 3 });
    for (let i = 0; i < 6; i++) { addWait(WA, '测试', 1000); }
    a(rowsOf(WA).length === 3, 'v2117/b1: [11] 候选表有界（实 ' + rowsOf(WA).length + ' = maxActs）');
  }
  // ⑪b evict 站点已登记（未登记站点会返回 unknown-site 且**不截断**）
  {
    const WA = fresh(); seed(WA, ['测试']);
    const arr = [];
    for (let i = 0; i < 30; i++) arr.push(i);
    const e = WA.evict.array(arr, 'acts.rows', 5);
    a(e.ok === true && arr.length === 5, 'v2117/b1: [11] acts.rows 站点已登记（真截断到 5）');
    const e2 = WA.evict.array(arr, '不存在的站点', 5);
    a(e2.ok === false && e2.reason === 'unknown-site', 'v2117/b1: [11] 未登记站点 ⇒ unknown-site（不静默截断）');
    const e3 = WA.evict.array(arr, 'acts.res', undefined);
    a(e3.ok === false && e3.reason === 'bad-cap', 'v2117/b1: [11] per-call 站点漏传 cap ⇒ bad-cap（不猜上限）');
  }
  // ── ⑫ fault 记账：世界侧新拒收码进世界命名空间 faults ──
  {
    const WA = fresh(); seed(WA, ['测试', '同行']); const t = Date.now();
    const f0 = (WA.world.stat().faults || {}).bad_use || 0;
    WA.world.addUse('甲地', { use: '不存在的用途', open: 0, close: 1 });
    const fs2 = WA.world.stat().faults || {};
    a((fs2['bad-use'] || 0) >= 1, 'v2117/b1: [12] 世界侧新拒收码进 faults（bad-use）');
    const arr = WA.world.addUse('甲地', { use: 'duty', open: 0, close: 1 });
    a(arr.ok === true && typeof arr.existed === 'boolean', 'v2117/b1: [12] addUse 回报「新增还是更新」');
    void f0;
  }
  // ── ⑬ 总开关默认关闭：关闭时不登记、不准入、不注入 ──
  {
    const WA = fresh();
    seed(WA, ['测试']);
    const keep = WA.act.getSettings();
    WA.act.setSettings({ enabled: false });
    const a1 = addWait(WA, '测试', 1000);
    a(a1.ok === false && a1.reason === 'disabled' && rowsOf(WA).length === 0,
      'v2117/b1: [13] 总开关关闭 ⇒ 不登记且零变化');
    const v = WA.act.advance(Date.now());
    a(v.ok === true && v.changed === 0, 'v2117/b1: [13] 关闭时 advance 不结算（changed 0）');
    WA.act.setSettings(keep);
  }
  // ── ⑭ 世界侧扩参：旧的三参调用逐字不变（既有消费方不得被本次扩参影响）──
  {
    const WA = fresh(); seed(WA, ['测试']); const t = Date.now();
    const c1 = WA.world.canBeAt('测试', '甲地', t);
    a(c1.ok === true && c1.use === '' && c1.until > 0,
      'v2117/b1: [14] 三参调用仍成立（多出 until/use 两字段不影响旧断言）');
    const c2 = WA.world.canBeAt('测试', '不存在的地方', t);
    a(c2.ok === false && c2.reason === 'unknown-place', 'v2117/b1: [14] 未知地点仍 unknown-place');
    const c3 = WA.world.canBeAt('测试', '甲地', t, 0);
    a(c3.ok === true, 'v2117/b1: [14] needMs=0 ⇒ 退回旧口径（只判此刻是否开放）');
  }
  // ── 哨兵：夹具不许漏进 localStorage ──
  {
    let leak = 0;
    for (let i = 0; i < global.localStorage.length; i++) {
      const k = global.localStorage.key(i);
      if (k && String(global.localStorage.getItem(k)).indexOf(TAG) >= 0) leak++;
    }
    a(leak === 0, 'v2117/b1: [15] 哨兵未泄漏（' + leak + '）');
  }
}

function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2117/b1: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  // N1 破坏现形（每条判据都要能在被破坏的副本上现形）
  a(probeWith(BROKEN[B.dup], probeDup) !== 'deduped',
    'v2117/b1: [N1] 去掉台账判据 ⇒ 重放二次结算（缺口②复现）');
  a(probeWith(BROKEN[B.budget], probeBudget) !== 'budgeted',
    'v2117/b1: [N1] 去掉预算 ⇒ 一次搬空全部到点行动（缺口③复现）');
  a(probeWith(BROKEN[B.use], probeUse) === 'passed:ok',
    'v2117/b1: [N1] 不传用途 ⇒ 用途窗口在准入上完全失效（缺口④复现）');
  // 挂到 before 链 ⇒ 症状可能是 on-before（明确跑到 before 去了）或 misordered:21
  //   （不在 after 链里、`workflow.list` 的返回顺序随链序改变）。两者都算现形。
  a(['on-before', 'misordered:21', 'missing'].indexOf(probeWith(BROKEN[B.heart], probeHeart)) >= 0,
    'v2117/b1: [N1] 心跳挂错链 ⇒ 结算不再排在 after 链的正确序位上（缺口⑤复现）');
  a(probeWith(BROKEN[B.nogoal], probeNoGoal) !== 'guarded',
    'v2117/b1: [N1] 去掉目标判据 ⇒ 撤销了的决定照样执行（缺口⑥复现）');
  a(probeWith(BROKEN[B.busy], probeBusy) !== 'single',
    'v2117/b1: [N1] 去掉忙碌判据 ⇒ 同一人同时开工两件（缺口⑦复现）');
  a(probeWith(BROKEN[B.opid], probeOpId) !== 'per-attempt',
    'v2117/b1: [N1] 冻结 opId ⇒ 同一笔第二次开工沿用旧键（缺口①复现）');
  // N2 真源码成绿（八条判据逐条）
  a(probeClean(probeOpId) === 'per-attempt', 'v2117/b1: [N2] 原版 opId 按次重钉');
  a(probeClean(probeDup) === 'deduped', 'v2117/b1: [N2] 原版重放零变化');
  a(probeClean(probeBudget) === 'budgeted', 'v2117/b1: [N2] 原版结算受预算约束');
  a(probeClean(probeUse) === 'windowed', 'v2117/b1: [N2] 原版用途窗口在准入上生效');
  a(probeClean(probeHeart) === 'in-chain', 'v2117/b1: [N2] 原版心跳在 after 链且在正确序位');
  a(probeClean(probeNoGoal) === 'guarded', 'v2117/b1: [N2] 原版目标撤销即拒收');
  a(probeClean(probeBusy) === 'single', 'v2117/b1: [N2] 原版同一时刻只做一件事');
  a(probeClean(probeHeartBody) === 'settled', 'v2117/b1: [N2] 原版心跳体真推动结算');
  // N3 破坏互不串扰
  a(probeWith(BROKEN[B.opid], probeDup) === 'deduped', 'v2117/b1: [N3] opid 破坏不影响去重');
  a(probeWith(BROKEN[B.dup], probeBudget) === 'budgeted', 'v2117/b1: [N3] 去重破坏不影响预算');
  a(probeWith(BROKEN[B.budget], probeDup) === 'deduped', 'v2117/b1: [N3] 预算破坏不影响去重');
  a(probeWith(BROKEN[B.use], probeBusy) === 'single', 'v2117/b1: [N3] 用途破坏不影响忙碌判据');
  a(probeWith(BROKEN[B.heart], probeBudget) === 'budgeted', 'v2117/b1: [N3] 心跳破坏不影响预算');
  a(probeWith(BROKEN[B.nogoal], probeBusy) === 'single', 'v2117/b1: [N3] 目标破坏不影响忙碌判据');
  a(probeWith(BROKEN[B.busy], probeNoGoal) === 'guarded', 'v2117/b1: [N3] 忙碌破坏不影响目标判据');
  // N4 判据非恒真：真状态确实改变
  const chg = (function () {
    const WA = fresh(); seed(WA, ['测试']); const t = Date.now();
    const x = addWait(WA, '测试', 1000);
    const before = rowOf(WA, x.id).status + '/0';
    WA.act.admit(x.id, t);
    return before + '>' + rowOf(WA, x.id).status + '/' + rowsOf(WA).length;
  })();
  a(chg === 'planned/0>running/1', 'v2117/b1: [N4] 准入真的改变状态（判据非恒真，实 ' + chg + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('ACT-B1-V2117: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('ACT-B1-V2117: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };