#!/usr/bin/env node
// WorldAxis tests/x3-offline-v2128.js —— v2.128.0（拓展计划 X3）：远方离线演化
//
// 【它治的病】
//   R105 ⑥ 的现场原话是：**「玩家离开之后那地方还在变吗」**。
//   本仓的 region 此前只有**注视驱动**的推进：事件由 `occur` 登记、由 `deliver` 落地、
//   由 `heard` 被听说 —— 三处全部要有人在场按一下。玩家不在场时，远方在代码里是**静止的**，
//   于是「你走了三年再回来」与「你出去吃了顿饭」在世界上没有任何区别。
//   这不是「少写了个定时器」：静止的远方会让长局里的空间感彻底塌掉 ——
//   那些登记过的地方只剩一个名字，从没自己出过事。
//
// 【本版落点】
//   · `region.tickOffline(draft, opts)` —— **在事务里**按世界钟结算登记过的远方：
//     追平应落地的事件、逐窗口确定性掷骰让远方自己出事、容量满即停手。
//     消费者是 `engines/regional.js` 的 after 链节点 `region.offline`（order 36，
//     紧挨既有的 `regional.tick`）—— 那儿是「一轮刚结束、世界该往前走一步」的唯一统一时机。
//     为什么由 regional 消费而不是 region 自己挂：region 是**拓扑**（路有几条、几天到），
//     regional 是**时间驱动**（每轮往前走）。两处各挂一个时序节点会让「世界往前走了一步」
//     出现两个时机 —— 本仓反复治理过的形态。
//   · 诊断 `secRegion` 报 `lastOffline` —— 累计计数答不出「上一次推了多远、动了几个地区」，
//     而「一次推了 0 个地区」与「一次没跑」在只有计数时长得一模一样。
//
// 【七条边界（全是否定式，逐条带可执行判据）】
//   ① **本地不在离线范围**：本地由 `roll()` 管；离线推演替本地掷骰等于两份世界在动。
//   ② **受阻整体跳过**：路断的地方消息过不来，也**不该在被注视时突然冒出一堆历史**。
//   ③ **落地时点取 `dueAt` 不取 `now`**：它是在路上早就该到的，
//      推成「你回来那刻刚到」会让整段远方历史挤在同一个时间戳上。
//   ④ **不编细节**：自行发生的事件 `text` 为空 —— 细节只能由调用方经 `occur` 给。
//   ⑤ **不发散历史**：容量满记 `events-full` 并停手，**不挤出**既有事件
//      （离线推演无权删掉玩家已经见过的那段历史）。
//   ⑥ **没有基准点不假装**：首次调用只落基准、不结算 ——
//      「我不知道你走了多久」与「你走了零秒」是两件事。
//   ⑦ **随机源不依赖现场**：掷骰只由 `(地区, 窗口)` 决定（FNV-1a）。
//      用 `WA.rand` 会让同一次离开在两次重放里长出两段不同的远方历史 —— 那正是「不可复现」。
//
// 【判据结构（与 x1-chain-v2127 / x2-chronicle-v2127 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（真读者）· N1–N8 真源码破坏 ⇒ 破坏副本上重跑同款判据
//   N9 纯度：全部负控制跑完后三个真文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const REGION = 'engines/region.js', REGIONAL = 'engines/regional.js', DIAG = 'engines/tool-diag.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
function breakOnce(s, from, to, label) {
  const out = s.split(from).join(to);
  if (out === s) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
// ── 真源码破坏锚点（各须恰中 1 次）───────────────────────────────────
const ANCHORS = {
  first: { rel: REGION, txt: "if (last === null) {" },
  local: { rel: REGION, txt: "if (p.distanceDays === 0) { skipped.push({ name: p.name, why: 'local' }); return; }" },
  lane: { rel: REGION, txt: "if (!LANES[p.lane]) { skipped.push({ name: p.name, why: 'bad-lane' }); return; }" },
  blocked: { rel: REGION, txt: "if (p.blocked) { skipped.push({ name: p.name, why: 'route-blocked' }); return; }" },
  due: { rel: REGION, txt: "if (!(e.dueAt <= now)) return;" },
  landAt: { rel: REGION, txt: "e.deliveredAt = e.dueAt;" },
  windows: { rel: REGION, txt: "for (let w = win0 + 1; w <= win; w++) {" },
  chance: { rel: REGION, txt: "if (rollOffline(p.name, w, 'event') >= OFFLINE_CHANCE) continue;" },
  full: { rel: REGION, txt: "if (rg.events.length >= cfg.maxEvents) { skipped.push({ name: p.name, why: 'events-full' }); break; }" },
  delay: { rel: REGION, txt: "const delay = Math.round((p.distanceDays / LANES[p.lane]) * MS_PER_DAY);" },
  noText: { rel: REGION, txt: "text: '', at: at, dueAt: dueAt," },
  fnv: { rel: REGION, txt: "let h = 2166136261 >>> 0;" },
  mark: { rel: REGION, txt: "    rg.lastSettledAt = now;\n    stat.offline = (stat.offline || 0) + 1;" },
  noDraft: { rel: REGION, txt: "if (!draft || typeof draft !== 'object') { noteFault('no-draft'); return { ok: false, reason: 'no-draft' }; }" },
  // 消费方锚点：regional 的 after 链节点（v2.128.0 起本文件多这一处挂载）
  node: { rel: REGIONAL, txt: "id: 'region.offline', chain: 'after', order: 36, critical: false," },
  nodeCall: { rel: REGIONAL, txt: "WA.store.transact(function (draft) { WA.region.tickOffline(draft, {}); }, 'region:offline');" },
  // 诊断读者
  diag: { rel: DIAG, txt: "lastOffline: st.lastOffline || null," }
};
// ── 夹具 ────────────────────────────────────────────────────────────
const DAY = 86400000;
const TAG = '__x3_2128_';
const DEF = { enabled: true, maxEvents: 24, maxRoutes: 8, stalenessMs: DAY };
function reset(WA, cfg) {
  WA.region.setSettings({ enabled: false, maxEvents: 24, maxRoutes: 8, stalenessMs: DAY });
  WA.store.transact(function (d) { d.region = { places: [], events: [] }; }, TAG + 'reset');
  WA.region.setSettings(Object.assign({}, DEF, cfg || {}));
  return WA;
}
function reg(WA, name, days, lane) { return WA.region.register(name, { distanceDays: days, lane: lane }); }
function tick(WA, atMs) {
  let out = null;
  WA.store.transact(function (d) { out = WA.region.tickOffline(d, { now: atMs }); }, TAG + 'tick');
  return out;
}
/** 标准现场：本地一处 + 远方一处（渠慢） + 受阻一处。 */
function scene(WA, cfg) {
  reset(WA, cfg);
  reg(WA, '近镇', 0, 'word');
  reg(WA, '远城', 40, 'word');
  reg(WA, '阻地', 40, 'word');
  WA.region.markLane('阻地', true, { why: '路断' });
  return WA;
}
// ── A 面：结构 ──────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2128/x3: [A] 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const r = src(REGION);
  a(r.indexOf('function tickOffline(draft, opts) {') > 0 && r.indexOf('function rollOffline(name, win, salt) {') > 0,
    'v2128/x3: [A] 两块都在位（tickOffline 给推演、rollOffline 给确定性掷骰）');
  a(r.indexOf('tickOffline: tickOffline,') > 0,
    'v2128/x3: [A] 导出面已登记（不在导出面 = 没有承诺）');
  // 只开事务的调用方：tickOffline 自己**不**开事务（避免嵌套事务与半提交）
  const body = r.slice(r.indexOf('function tickOffline(draft, opts) {'), r.indexOf('function statView() {'));
  ['WA.store.transact', 'saveSettings('].forEach(function (bad) {
    a(body.indexOf(bad) < 0, 'v2128/x3: [A] tickOffline **自己不开事务**、不写设置（体内零 `' + bad + '`）');
  });
  a(body.indexOf('WA.rand') < 0,
    'v2128/x3: [A] 掷骰不经 `WA.rand`（那是现场骰子；离线演化的可复现性要求随机源只依赖地区与时间）');
  // 七条否定式边界以注释形态留证（判据读代码面，注释作旁证）
  const head = r.slice(r.indexOf('X3（v2.128.0）'), r.indexOf('const OFFLINE_CHANCE = 0.4;'));
  ['只结算报备过的远方', '本地不在此列', '受阻不推进', '不编细节', '不发散历史',
    '没有基准点不假装', '随机源不依赖现场'].forEach(function (k) {
    a(head.indexOf(k) > 0, 'v2128/x3: [A] 边界留证 `' + k + '` 在函数头注释里');
  });
  // 第三条边界（落地时点取 `dueAt`）逐字住在**函数体内**的注释里 —— 判据读哪儿就写哪儿。
  a(body.indexOf('落地时点取') > 0,
    'v2128/x3: [A] 边界留证 `落地时点取` 在函数体内注释里（它讲的是那一行的写法，故贴身放着）');
  a(body.indexOf('续跑：正常批次') < 0,
    'v2128/x3: [A] 体内没有「续跑」这样的越界说法（离线推演不重建历史，只结算到此刻）');
}
// ── B 面：运行时（原版成绿）──────────────────────────────────────────
function runB(a) {
  // B1 **边界⑥**：首次调用只落基准、不结算 ——「不知道你走了多久」≠「你走了零秒」
  const WA = scene(fresh());
  const o1 = tick(WA, 100 * DAY);
  a(o1.ok === true && o1.first === true && o1.elapsedMs === 0 && o1.elapsedDays === 0
    && o1.delivered === 0 && o1.occurred === 0 && o1.settled.length === 0 && o1.skipped.length === 0,
    'v2128/x3: [B1] 首次只落基准（零结算 —— 不回头猜你走了多久；实 ' + JSON.stringify(o1) + '）');
  a(WA.store.get().region.events.length === 0 && WA.store.get().region.lastSettledAt === 100 * DAY,
    'v2128/x3: [B1] 基准落盘、事件表为空（「从这一趟起算」有据可查）');
  // B2 二次结算：按世界钟追平十天
  const o2 = tick(WA, 110 * DAY);
  a(o2.ok === true && o2.first === false && o2.elapsedDays === 10 && o2.windows === 10,
    'v2128/x3: [B2] 二次结算报出「隔了几天、走过几个窗口」（实 ' + o2.elapsedDays + ' 天 / ' + o2.windows + ' 窗口）');
  a(o2.occurred > 0 && o2.delivered > 0,
    'v2128/x3: [B2] 远方的确自己出事了（occured ' + o2.occurred + ' / delivered ' + o2.delivered + '）—— 玩家不在场，那边照常动');
  // B3 **边界①**：本地不在此列（本地由 roll() 管）
  const sk = {};
  o2.skipped.forEach(function (x) { sk[x.name] = x.why; });
  a(sk['近镇'] === 'local',
    'v2128/x3: [B3] 本地被如实跳过（不替 roll() 掷骰 —— 两处都动等于两份世界；实 ' + sk['近镇'] + '）');
  // B4 **边界②**：受阻整体跳过，且那边不留任何自生事件
  a(sk['阻地'] === 'route-blocked',
    'v2128/x3: [B4] 受阻地区整体跳过（实 ' + sk['阻地'] + '）');
  a(WA.store.get().region.events.filter(function (e) { return e.place === '阻地'; }).length === 0,
    'v2128/x3: [B4] 受阻地区零自生事件（路断时攒一堆历史，解除后会一次性倒灌进正文）');
  // B5 **边界③**：落地时点取 `dueAt` 而不是 `now`
  const evs = WA.store.get().region.events;
  a(evs.length > 0 && evs.every(function (e) { return e.deliveredAt === e.dueAt; }),
    'v2128/x3: [B5] 落地时点 = `dueAt`（它在路上早就该到；实 ' + JSON.stringify(evs.map(function (e) { return e.deliveredAt + '/' + e.dueAt; }).slice(0, 3)) + '）');
  a(evs.every(function (e) { return e.deliveredAt !== 110 * DAY; }),
    'v2128/x3: [B5] 没有任何一条被推成「你回来那刻刚到」（整段远方历史挤在同一时间戳 = 时间感塌掉）');
  // B6 **边界④**：不编细节（text 为空，细节只能由调用方给）
  a(evs.every(function (e) { return e.text === ''; }),
    'v2128/x3: [B6] 自生事件不带细节（离线推演不替世界编人与事）');
  a(evs.every(function (e) { return e.offline === true; }),
    'v2128/x3: [B6] 自生事件带 `offline` 标记（与调用方显式登记的区分得开）');
  // B7 **边界⑦**：确定性重放 —— 同一段离开，两次跑出逐字相同的远方历史
  const idsA = (function () { const W = scene(fresh()); tick(W, 100 * DAY); return tick(W, 110 * DAY).settled.map(function (x) { return x.id; }); })();
  const idsB = (function () { const W = scene(fresh()); tick(W, 100 * DAY); return tick(W, 110 * DAY).settled.map(function (x) { return x.id; }); })();
  a(idsA.length > 0 && JSON.stringify(idsA) === JSON.stringify(idsB),
    'v2128/x3: [B7] 两段独立重放产出逐字相同的远方历史（' + idsA.length + ' 条；现场骰子做不到这一点）');
  // B8 未到期的事件**不许**提前落地（追平面只认 dueAt）
  const W2 = scene(fresh());
  tick(W2, 100 * DAY);
  const o3 = tick(W2, 101 * DAY);   // 只走 1 天：远城是 word/40 天，dueAt 一定还没到
  a(o3.occurred > 0 && o3.delivered === 0,
    'v2128/x3: [B8] 只走一天时事件已发生但**未落地**（追平只认 `dueAt`；实 occurred ' + o3.occurred + ' / delivered ' + o3.delivered + '）');
  a(W2.store.get().region.events.every(function (e) { return e.deliveredAt === 0; }),
    'v2128/x3: [B8] 存档里这些事件 `deliveredAt` 仍为 0（在路上就是还在路上）');
  // B9 **边界⑤**：容量满即停手、**不挤出**既有事件
  const W3 = scene(fresh(), { maxEvents: 4 });
  tick(W3, 100 * DAY);                      // 先落基准（首次调用只落基准，不结算 —— 边界⑥）
  W3.store.transact(function (d) {
    d.region.events = [0, 1, 2, 3].map(function (i) {
      return { id: 'pre_' + i, place: '远城', kind: 'market', text: '旧闻' + i, at: 1, dueAt: 1, deliveredAt: 1 };
    });
  }, TAG + 'pre');
  const o4 = tick(W3, 110 * DAY);
  a(o4.occurred === 0 && o4.skipped.some(function (x) { return x.why === 'events-full'; }),
    'v2128/x3: [B9] 容量满 ⇒ 记 `events-full` 并停手（实 ' + JSON.stringify(o4.skipped) + '）');
  const after = W3.store.get().region.events;
  a(after.length === 4 && after[0].id === 'pre_0' && after[3].id === 'pre_3',
    'v2128/x3: [B9] 既有事件一条都没被挤出（离线推演无权删掉玩家已经见过的那段历史）');
  // B12 读数面：累计 + **最近一次**（只有累计时「推了0个地区」与「没跑」同形）。
  //   读数**当场取**：`gate.fresh()` 会把 `WA.region` 换成新模块实例，留到本节末尾再读
  //   读到的是别人的实例（首版实测踩到 —— 判据的前提被别处的调用改掉了）。
  const st3 = W3.region.stat();
  // B10 `elapsed <= 0`：不重复结算（同一时刻结算两次不会凭空多出一段历史）
  const W4 = scene(fresh());
  tick(W4, 200 * DAY);
  const n5 = W4.store.get().region.events.length;
  const o5 = tick(W4, 200 * DAY);
  a(o5.elapsedDays === 0 && o5.delivered === 0 && o5.occurred === 0 && o5.settled.length === 0
    && W4.store.get().region.events.length === n5,
    'v2128/x3: [B10] 同一时刻再结算一次 ⇒ 零推进（实 ' + JSON.stringify(o5) + '）');
  // B11 无草稿 / 关闭时如实拒收（不假装推进了零天）
  a(WA.region.tickOffline(null).reason === 'no-draft' && WA.region.tickOffline('不是草稿').reason === 'no-draft',
    'v2128/x3: [B11] 没有事务草稿 ⇒ `no-draft`（不把「我拿不到草稿」说成「你走了零秒」）');
  const W5 = scene(fresh());
  W5.region.setSettings({ enabled: false });
  a(W5.region.tickOffline({ region: { places: [], events: [] } }).reason === 'disabled',
    'v2128/x3: [B11] 总开关关闭 ⇒ 一律拒收（关闭时零台账）');
  a(st3.offline >= 1 && st3.lastOffline && st3.lastOffline.first === false && st3.lastOffline.elapsedDays === 10,
    'v2128/x3: [B12] `stat().lastOffline` 答出「上一次推了多远」（实 ' + JSON.stringify(st3.lastOffline) + '）');
  a(typeof W3.region.statView().places === 'number' && W3.region.statView().places === 3,
    'v2128/x3: [B12] 既有读数面（statView）未被动过（本版只加口，不改旧面）');
}
// ── C 面：真消费方 ──────────────────────────────────────────────────
function runC(a) {
  const rg = src(REGIONAL);
  a(hits(rg, "id: 'region.offline'") === 1,
    'v2128/x3: [C] regional 恰有 1 个离线推进挂载点');
  const WA = scene(fresh());
  const nodes = WA.workflow.list('after');
  const node = nodes.filter(function (n) { return n.id === 'region.offline'; })[0];
  a(!!node && node.order === 36 && node.critical === false && node.enabled === true,
    'v2128/x3: [C] 节点真注册在 after 链上（order 36 / 非关键 / 默认启用；实 ' + JSON.stringify(node && { order: node.order, critical: node.critical, enabled: node.enabled }) + '）');
  a(nodes.filter(function (n) { return n.id === 'regional.tick'; }).length === 1,
    'v2128/x3: [C] 既有 `regional.tick` 仍在（本版只加一个相邻节点，不替换时机）');
  // 关闭时**零写**：不进事务（不白开一次事务，也不留半个基准）
  tick(WA, 100 * DAY);                     // 落基准
  WA.region.setSettings({ enabled: false });
  const before = JSON.stringify(WA.store.get().region);
  let txCalls = 0;
  const keepTx = WA.store.transact;
  WA.store.transact = function () { txCalls++; return keepTx.apply(this, arguments); };
  try { node.run({}); } finally { WA.store.transact = keepTx; }
  a(txCalls === 0, 'v2128/x3: [C] 节点在总开关关闭时**不进事务**（零开销早退；实测 transact 调用 ' + txCalls + ' 次）');
  a(JSON.stringify(WA.store.get().region) === before,
    'v2128/x3: [C] 关闭时存档逐字节未变（「关掉它」是真的）');
  // 开启时**真推进**：节点跑一次 ⇒ 存档里的基准前进
  WA.region.setSettings({ enabled: true });
  WA.clock.freeze(300 * DAY);
  try { node.run({}); } finally { WA.clock.unfreeze(); }
  a(WA.store.get().region.lastSettledAt === 300 * DAY,
    'v2128/x3: [C] 节点跑一次后基准前进到当前世界钟（实 ' + WA.store.get().region.lastSettledAt + '）—— 推演链上真的有人调它');
  a(WA.store.get().region.events.length > 0,
    'v2128/x3: [C] 那一跑真让远方出了事（不是只推了个基准）');
  // 附属面失败不拖主链（与 bridge.publish 同规格）
  a(rg.indexOf('} catch (e) { /* 附属面失败不拖主链（与 bridge.publish 同规格） */ }') > 0,
    'v2128/x3: [C] 节点自身吞掉异常（离线演化失败绝不回滚世界推演主链）');
  // 诊断读者
  const dg = src(DIAG);
  a(dg.indexOf(ANCHORS.diag.txt) > 0 && dg.indexOf('offlineRuns: st.offline || 0,') > 0,
    'v2128/x3: [C] 诊断 secRegion 真读「最近一次离线结算」（累计计数答不出「上一次推了多远」）');
  a(dg.indexOf("note: '只报登记过的远方与离线结算读数（本节目不 roll、不落地、不推进）'") > 0,
    'v2128/x3: [C] 诊断节明写它**不推进**（只读节不许顺手把世界往前推一步）');
}
// ── N 面：真源码破坏 ⇒ 破坏副本上重跑同款判据 ────────────────────────
function runNegative(a) {
  const R0 = src(REGION), G0 = src(REGIONAL), D0 = src(DIAG);
  // 同款判据（正例与负控制共用同一份实现 —— 两侧不同源就会「写进去的对不上复算的」）
  const pFirst = function (WA) { scene(WA); return tick(WA, 100 * DAY).occurred; };
  const pLocal = function (WA) {
    scene(WA);
    tick(WA, 100 * DAY);                    // 落基准
    tick(WA, 110 * DAY);                    // 真结算一次
    return WA.store.get().region.events.filter(function (e) { return e.place === '近镇'; }).length;
  };
  const pBlocked = function (WA) {
    scene(WA);
    tick(WA, 100 * DAY);
    tick(WA, 110 * DAY);
    return WA.store.get().region.events.filter(function (e) { return e.place === '阻地'; }).length;
  };
  // 判「落地时点等不等于 dueAt」而不是「有没有落地」：破坏改的是**时点**，
  //   拿「条数」当判据在破坏前后同真（首版实测踩到：两份都 > 0 ⇒ 负控制静默哑火）。
  const pLandAt = function (WA) {
    scene(WA);
    tick(WA, 100 * DAY);   // 落基准
    // 预置一条「已到期、还没落地」的远路事件 ⇒ 下一次结算必走**追平**分支
    //   （首版现场让事件全从「发生」分支产出，而那条路径的落地时点写在对象字面量里
    //    ⇒ 破坏打在未执行的代码上，负控制静默哑火）。
    WA.store.transact(function (d) {
      d.region.events.push({ id: 'ev_wait', place: '远城', kind: 'market', text: '', at: 1,
        dueAt: 100 * DAY + 1000, deliveredAt: 0, lane: 'word', distanceDays: 40 });
    }, TAG + 'landAt-pre');
    tick(WA, 110 * DAY);
    const e = WA.store.get().region.events.filter(function (x) { return x.id === 'ev_wait'; })[0];
    return (e && e.deliveredAt === e.dueAt) ? 1 : 0;
  };
  const pText = function (WA) {
    scene(WA);
    tick(WA, 100 * DAY);
    tick(WA, 110 * DAY);
    return WA.store.get().region.events.every(function (e) { return e.text === ''; });
  };
  // 签名把「几个窗口出事」与「落了几条」一起带上：只用其中一个会因巧合而「看起来可复现」
  //   （首版只用事件条数，四份采样恰好都是 3 ⇒ 负控制静默哑火）。
  const pDup = function (WA) {
    scene(WA);
    tick(WA, 100 * DAY);
    const o = tick(WA, 110 * DAY);
    return o.occurred + '|' + o.delivered + '|' +
      o.settled.filter(function (x) { return x.kind === 'occurred'; }).map(function (x) { return x.id; }).join(',');
  };
  const pFull = function (WA) {
    scene(WA, { maxEvents: 4 });
    WA.store.transact(function (d) {
      d.region.events = [0, 1, 2, 3].map(function (i) {
        return { id: 'pre_' + i, place: '远城', kind: 'market', text: '旧闻' + i, at: 1, dueAt: 1, deliveredAt: 1 };
      });
    }, TAG + 'neg-pre');
    const o = tick(WA, 110 * DAY);
    return o.skipped.filter(function (x) { return x.why === 'events-full'; }).length;
  };
  const pDelay = function (WA) {
    scene(WA);
    tick(WA, 100 * DAY);
    tick(WA, 110 * DAY);
    const e = WA.store.get().region.events[0];
    return e ? (e.dueAt - e.at) : -1;
  };
  const pDraft = function (WA) {
    scene(WA);
    // 自带 catch：草稿闸被拆后 `openReg(null)` 直接抛 —— 不包的话这一抛会逃逸出负控制段，
    //   让**后面所有断言静默漏跑**（假通过/假失败都由此而来；v2.127.0 X1 已付过学费）。
    try { return (WA.region.tickOffline(null) || {}).reason || 'ok'; }
    catch (e) { return 'threw:' + (e && e.message); }
  };
  const pNode = function (WA) {
    scene(WA);
    tick(WA, 100 * DAY);
    const node = WA.workflow.list('after').filter(function (n) { return n.id === 'region.offline'; })[0];
    if (!node) return 'no-node';
    WA.clock.freeze(300 * DAY);
    try { node.run({}); } finally { WA.clock.unfreeze(); }
    return WA.store.get().region.lastSettledAt;
  };
  // N1 **边界⑥**的反证：摘掉「没有基准点」闸 ⇒ 首次就凭空长出一整段远方历史
  const n1 = breakOnce(R0, ANCHORS.first.txt, 'if (false) {', 'N1');
  a(pFirst(fresh(over(REGION, n1))) > 0,
    'v2128/x3: [N1] 摘掉基准闸后首次调用就凭空产出远方历史（B1 不是恒真）');
  // N2 **边界①**的反证：本地不再跳过 ⇒ 离线推演替 roll() 掷骰
  const n2 = breakOnce(R0, ANCHORS.local.txt, '', 'N2');
  a(pLocal(fresh(over(REGION, n2))) > 0,
    'v2128/x3: [N2] 本地不再跳过 ⇒ 本地也长出「自己发生的事」（B3 不是恒真）');
  // N3 **边界②**的反证：受阻不再跳过 ⇒ 路断的地方照样攒历史
  const n3 = breakOnce(R0, ANCHORS.blocked.txt, '', 'N3');
  a(pBlocked(fresh(over(REGION, n3))) > 0,
    'v2128/x3: [N3] 受阻地区不再跳过 ⇒ 解除后会一次性倒灌（B4 不是恒真）');
  // N4 **边界③**的反证：落地时点改取 now ⇒ 整段历史挤在同一时间戳
  const n4 = breakOnce(R0, ANCHORS.landAt.txt, 'e.deliveredAt = now;', 'N4');
  a(pLandAt(fresh(over(REGION, n4))) === 0 && pLandAt(fresh()) > 0,
    'v2128/x3: [N4] 落地时点改取 `now` ⇒ 追平那一支不再产出落地（B5 不是恒真）');
  // N5 **边界④**的反证：给自生事件编一句细节
  const n5 = breakOnce(R0, ANCHORS.noText.txt, "text: '（离线推演编的）', at: at, dueAt: dueAt,", 'N5');
  a(pText(fresh(over(REGION, n5))) === false,
    'v2128/x3: [N5] 自生事件带上编造的细节（B6 不是恒真）');
  // N6 **边界⑦**的反证：把 FNV 换成现场骰子 ⇒ 两次重放长出两段历史
  const n6 = breakOnce(R0, ANCHORS.fnv.txt, 'let h = Math.floor(Math.random() * 4294967296) >>> 0;', 'N6');
  // 单次采样可能巧合相同（实测踩到：两份都是 3 条），故**两向**都断言：
  //   原版六份必须全同（可复现），破坏版六份必须不全同（不可复现）。
  //   判据要的是「可复现 / 不可复现」这件事本身，而不是「某一次恰好不相等」。
  const sig = function (WA) { return pDup(WA); };
  const sixOrig = [0, 1, 2, 3, 4, 5].map(function () { return sig(fresh()); });
  const sixRand = [0, 1, 2, 3, 4, 5].map(function () { return sig(fresh(over(REGION, n6))); });
  a(new Set(sixOrig).size === 1,
    'v2128/x3: [N6]（正）原版六份重放逐字相同（可复现是原版的既有事实；实 ' + sixOrig.join(' / ') + '）');
  a(new Set(sixRand).size > 1,
    'v2128/x3: [N6]（负）随机源换成现场骰子后六份重放**不全同**（B7 不是恒真；实 ' + sixRand.join(' / ') + '）');
  // N7 **边界⑤**的反证：容量闸被拆掉 ⇒ 既有历史被挤出
  const n7 = breakOnce(R0, ANCHORS.full.txt, '', 'N7');
  a(pFull(fresh(over(REGION, n7))) === 0,
    'v2128/x3: [N7] 容量闸拆掉后不再记 `events-full`（B9 不是恒真）');
  // N8 延迟公式退化 ⇒ 事件的到达时刻不再由距离与渠道决定
  const n8 = breakOnce(R0, ANCHORS.delay.txt, 'const delay = 0;', 'N8');
  a(pDelay(fresh(over(REGION, n8))) === 0 && pDelay(fresh()) > 0,
    'v2128/x3: [N8] 延迟归零后 `dueAt === at`（距离与渠道不再决定什么时候到；B5/B8 的测量基础现形）');
  // N9 无草稿闸被拆 ⇒ 坏输入被当成「零推进」（与「你走了零秒」同形）
  const n9 = breakOnce(R0, ANCHORS.noDraft.txt, '', 'N9');
  a(pDraft(fresh(over(REGION, n9))) !== 'no-draft',
    'v2128/x3: [N9] 草稿闸拆掉后坏输入不再如实拒收（B11 不是恒真）');
  // N10 摘掉 regional 的挂载点 ⇒ 消费方判据现形
  const n10 = breakOnce(G0, ANCHORS.node.txt, 'id: \'region.offline.neg\', chain: \'after\', order: 36, critical: false,', 'N10');
  const W10 = fresh(over(REGIONAL, n10));
  scene(W10);
  a(W10.workflow.list('after').filter(function (n) { return n.id === 'region.offline'; }).length === 0,
    'v2128/x3: [N10] 摘掉挂载点后 after 链上查不到它（C 面判据不是恒真）');
  // N11 摘掉诊断读者 ⇒ 诊断判据现形（源码面判，避免诊断未装载时的假绿）
  const n11 = breakOnce(D0, ANCHORS.diag.txt, '', 'N11');
  a(n11.indexOf(ANCHORS.diag.txt) < 0
    && D0.indexOf(ANCHORS.diag.txt) > 0,
    'v2128/x3: [N11] 摘掉诊断读点后该读数在破坏副本里为零、在原版里为一（C 面判据不是恒真）');
  // N12 纯度：全部负控制跑完后三个真文件逐字未变
  a(src(REGION) === R0 && src(REGIONAL) === G0 && src(DIAG) === D0,
    'v2128/x3: [N12]（纯度）全部负控制跑完后三个真文件逐字未变');
  a(pFirst(fresh()) === 0 && pLocal(fresh()) === 0 && pDelay(fresh()) > 0,
    'v2128/x3: [N12]（纯度）原版上同款判据为真 —— 两向自证成立');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: REGION
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); } catch (e) { fail++; console.log('  x A/B/C threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('X3-OFFLINE-V2128: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('X3-OFFLINE-V2128: pass（' + pass + ' 项）');
}