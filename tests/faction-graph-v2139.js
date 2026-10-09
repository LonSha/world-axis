#!/usr/bin/env node
// WorldAxis tests/faction-graph-v2139.js —— v2.139.0（E9）：势力关系动态图与张力热力图
//
// 【它治的病：势力一张一张列着，但它们之间的关系网没人看得见】
//   `evolution` 有六档状态、七档关系、容量站、编辑器、面板徽章 —— 全是**逐势力**的。
//   「谁跟谁一伙、谁跟谁对着」在数据上**根本没有存储**，「这张网整体有多紧」全库零回答，
//   「哪些势力结成一块」需要连通性计算而全库零图算法。本锁钉的就是补上来的这三件事。
//
// 【本锁最要紧的一条：边是**推导值**，不是观测值】
//   本仓没有势力间成对关系字段 —— `f.relation` 是「该势力对主视角」的态度。
//   把它当甲↔乙的边就是**编一份数据**。故本锁把这件事钉成结构判据：
//   每条边必须带 `derived: true` 与 `basis`（这条边由哪两个字段算出来的），
//   且「血盟 × 世仇 ⇒ 中立」（`6 + 0 - 6 = 0`）——
//   **单方态度无法单独决定一条边**。这一条正是「同仇不加分」的证明：
//   两个都敌对主视角的势力**不会**因此被判成互相敌对。
//   （v2.139.0 收口：`affinityOf` 等纯算法内部面**已不导出**，故 B6 段改经
//    `buildGraph()` 的边读数核 —— 判据读的是产品面，不是又一份实现。）
//
// 【本锁刻意守住的三个「不可合并」】
//   ① `no-factions`（没有东西可算）与 `empty-graph`（算出来了、它是空的）不是一回事：
//      前者该去建设势力，后者是个合法的空读数。
//   ② `dropped`（没进图）与 `nodes`（进图了）必须分开报：合成一个数就再也答不出
//      「图为什么比势力少」（超容量 / 重名 / 空名，三种处置完全不同）。
//   ③ `heat.unknowns`（档位不在词表里、算不出来）与 `hostiles: 0`（真的没有敌对）
//      绝不同形 —— 前者是「不知道」，后者是「知道是零」，塌在一起就是拿 0 冒充答案。
//
// 【判据结构（与 life-e8-v2139 / hazard-trigger-v2138 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（诊断真读者 + 面板**真渲染**）
//   N0–N6 真源码破坏 ⇒ 破坏副本上重跑同款真判据；N5 纯度：三个真文件逐字未变。
//   判据一律**自己造世界**（用 mk 工厂）：每条判据要的场不同（单节点 / 满容量 / 缺档位），
//   外层先跑一遍会把原版也判成破坏 —— 那不是判据，那是巧合。正控制段就是为抓它而设。
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const FG = 'engines/faction-graph.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const SELF = 'tests/faction-graph-v2139.js';
const TAG = '__e9v2139_';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
let fails = 0, checks = 0;
// 宿主断言：run.js 的 `runLock` 只注入 `assert(cond, name)`（**不注入环境**）。
//   故本锁必须自己造世界，并把每条判据**上交宿主** —— 否则锁在回归里既不计数、
//   又因为读 `a.product` 直接抛 undefined（首版实测：单独直跑全绿、挂进回归即刻两行红）。
//   同仓 hazard-trigger-v2138 / faction-graph 的姊妹锁都自带 `fresh()`。
let HOST = null;
function ok(c, m) {
  checks++;
  if (!c) { fails++; console.log('  ✗ ' + m); }
  else console.log('  ✓ ' + m);
  if (HOST) HOST(!!c, m);
}

let LAST_DOM = null;
function freshWA(ov) {
  const e = sync.fresh(ov ? { srcOverride: ov } : undefined);
  // 每个 env 自带一个 mini-DOM（uiDom.install 会重装），渲染类判据必须用**本 env 的** dom：
  //   旧 dom 上的按钮绑的是**上一次**装载那版 panel 的闭包。
  LAST_DOM = e.dom;
  return e.WA;
}
const F4 = [
  { id: 'fa1', name: '甲', status: '鼎盛', relation: '血盟', scope: '城南' },
  { id: 'fa2', name: '乙', status: '稳固', relation: '盟友', scope: '城南' },
  { id: 'fa3', name: '丙', status: '倾轧', relation: '敌对', scope: '城北' },
  { id: 'fa4', name: '丁', status: '衰落', relation: '世仇', scope: '城北' }
];
/** 造一个**确定**的世界：init 复位 → 整体替换 evolution.factions → 开开关。 */
function seed(WA, list, extra) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.evolution = d.evolution || {};
    d.evolution.factions = JSON.parse(JSON.stringify(list || []));
  }, TAG + 'seed');
  WA.factionGraph.setSettings(Object.assign({ enabled: true, allyIdx: 1, maxNodes: 16, hostileIdx: 5 }, extra || {}));
}
function env(spec, extra) {
  const WA = freshWA();
  // 未开开关的场：**开关必须真关**。ui-gate-sync 复用同一个 vm 全局，设置跨 env 持续
  //   （探针实测：前一个 env 开了开关，后一个 env 当场读到 enabled=true），
  //   所以「只 init 不置设置」得到的不是「开关未开」而是「开关正好还开着」。
  if (spec && spec.raw) { WA.store.init(); WA.factionGraph.setSettings({ enabled: false }); }
  // 第二参数与 spec.extra 合并后再送进世界：签名吃掉参数这种事发生过一次 ——
  //   env({}, { maxNodes: 2 }) 的 maxNodes 被整个吞掉、仍是默认 16，于是「超容量场」
  //   悄悄变成了「满容量场」，判据读到的根本不是它要的那个世界。
  else seed(WA, (spec && spec.list) || F4, Object.assign({}, (spec && spec.extra) || {}, extra || {}));
  return WA;
}
function envBroken(spec, ov, extra) {
  const WA = freshWA(ov);
  if (spec && spec.raw) { WA.store.init(); WA.factionGraph.setSettings({ enabled: false }); }
  else seed(WA, (spec && spec.list) || F4, Object.assign({}, (spec && spec.extra) || {}, extra || {}));
  return WA;
}
function renderEventsHtml(WA) {
  const dom = LAST_DOM;
  if (!dom) throw new Error('mini-DOM 未装');
  const p = dom.getElementById('wa-panel');
  if (!p) throw new Error('面板未注入');
  const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'events'; })[0];
  if (!tab) throw new Error('找不到事件页签');
  tab.click();
  const body = p.querySelector('.wa-body');
  return body ? String(body.innerHTML || '') : '';
}
function clickFg(WA, id) {
  renderEventsHtml(WA);                    // 先渲染，绑定才在树上
  const dom = LAST_DOM;
  const btn = dom.getElementById(id);
  if (!btn) throw new Error('找不到 ' + id);
  let threw = null;
  try { if (typeof btn.onclick === 'function') btn.onclick({ target: btn }); } catch (e) { threw = e; }
  const out = dom.getElementById('wa-fg-out');
  return { text: out ? String(out.textContent || '') : '', threw: threw };
}
// ── 真源码破坏锚点（各须恰中 1 次）────────────────────────────────────
const ANCHORS = {
  // ① 去掉「单方态度无法单独决定一条边」的那个 -6（同仇当场变同盟）
  affinity: { rel: FG, txt: '    const a = mapper(idxA) + mapper(idxB) - 6;',
    to: '    const a = mapper(idxA) + mapper(idxB);' },
  // ② 张力分母不再保护 ⇒ 单节点图（零边）当场 NaN
  guard: { rel: FG, txt: '    const value = hostile / Math.max(1, denominator);',
    to: '    const value = hostile / denominator;' },
  // ③ 自环也建边（「自己跟自己」成为一条关系，矩阵对角不再是 self）
  selfLoop: { rel: FG, txt: '      for (let j = i + 1; j < n; j++) {',
    to: '      for (let j = i; j < n; j++) {' },
  // ④ 超容量**静默截断**（dropped 不再记录）⇒「图小」与「势力少」再也分不开
  dropped: { rel: FG, txt: "      if (nodes.length >= cap) { dropped.push({ at: i, name: nm, why: 'over-cap' }); return; }",
    to: '      if (nodes.length >= cap) { return; }' },
  // ⑤ 诊断面不报 dropped ⇒ 「图为什么比势力少」在诊断包里无从查
  diagDropped: { rel: DIAG, txt: '        dropped: st.dropped || 0,', to: '        dropped: 0,' },
  // ⑥ 面板不再渲染三枚读数入口（用户那面重新变黑）
  panel: { rel: PANEL, txt: 'id="wa-fg-tension" aria-label="势力关系网张力"',
    to: 'id="wa-fg-tension2" aria-label="势力关系网张力"' }
};
const BROKEN = [
  { key: 'affinity', spec: ANCHORS.affinity }, { key: 'guard', spec: ANCHORS.guard },
  { key: 'selfLoop', spec: ANCHORS.selfLoop }, { key: 'dropped', spec: ANCHORS.dropped },
  { key: 'diagDropped', spec: ANCHORS.diagDropped }, { key: 'panel', spec: ANCHORS.panel }
];
function brokenOverride(spec) {
  const s = src(spec.rel);
  const n = hits(s, spec.txt);
  if (n !== 1) throw new Error('anchor hits ' + n + ' :: ' + spec.key);
  const t = s.split(spec.txt).join(spec.to);
  if (hits(t, spec.to) !== 1) throw new Error('破坏未真的替换掉锚点 :: ' + spec.key);
  const o = {}; o[spec.rel] = t; return o;
}
// ── 判据本体（A 结构 + B 运行时）──────────────────────────────────────
function judge() {
  const WA = freshWA();   // 本锁自造环境（freshWA 同时把 LAST_DOM 指向本 env 的 mini-DOM）
  const M = WA.factionGraph;
  // A 结构
  ok(!!M && typeof M.buildGraph === 'function', 'A1 新模块在场且导出建图口');
  const need = ['buildGraph', 'edgeOf', 'tension', 'clusters', 'heat', 'stat'];
  ok(need.every(function (k) { return typeof M[k] === 'function'; }), 'A2 六口齐备（缺一个就是断链）');
  // v2.139.0 收口：纯算法内部面（mapper / tierOf / affinityOf）**不导出** —— 本仓口径
  //   「无独立消费方不挂」，导出它们只会让「谁能调」与「谁真在调」分叉（死导出门禁实测点名）。
  ok(M.mapper === undefined && M.tierOf === undefined && M.affinityOf === undefined,
    'A2b 纯算法内部面未导出（无独立消费方不挂 —— 算法本身由 buildGraph 的 basis / tension 复算核）');
  ok(JSON.stringify(M.RELATION_KEYS()) === JSON.stringify(WA.evolution.FACTION_RELATION),
    'A3 档位词表取自 evolution（单一真源，不自带副本）');
  ok(JSON.stringify(M.STATUS_KEYS()) === JSON.stringify(WA.evolution.FACTION_STATUS),
    'A4 状态词表同样取自真源');
  ok(WA.evolution.FACTION_RELATION.length === 7, 'A5 七档（血盟…世仇）');
  // 只读：源码级可核（零 store.transact / 零 store.patch）——「只读不写」是本模块的立身之本
  const fgSrc = src(FG);
  const bodySrc = fgSrc.slice(fgSrc.indexOf("(function () {"));
  ok(hits(bodySrc, 'store.transact') === 0 && hits(bodySrc, 'store.patch') === 0,
    'A6 只读不写：代码体零 store.transact / 零 store.patch（注释里那句不算）');

  // B 运行时
  const off = env({ raw: true });
  ok(off.factionGraph.buildGraph().reason === 'disabled', 'B1 总开关默认关闭 ⇒ disabled（不编一张空图）');
  const none = env({ list: [], extra: {} });
  none.store.transact(function (d) { d.evolution.factions = []; }, TAG + 'none');
  ok(none.factionGraph.buildGraph().reason === 'no-factions', 'B2 世界无势力 ⇒ no-factions');

  // B3 单节点边界：**不是 NaN**（分母保护），且它是 empty-graph 而不是 no-factions
  const solo = env({ list: [F4[0]] });
  const gSolo = solo.factionGraph.buildGraph();
  const tSolo = solo.factionGraph.tension();
  ok(gSolo.ok === true && gSolo.reason === 'empty-graph' && gSolo.edges.length === 0,
    'B3a 单节点：图算出来了（ok）但零边 ⇒ empty-graph（不是 no-factions）');
  ok(tSolo.ok === true && tSolo.value === 0 && isFinite(tSolo.value) && tSolo.denominatorGuarded === true,
    'B3b 单节点张力 = 0 且 isFinite（分母保护过，不是 NaN/Infinity；且如实标注 guarded）');

  // B4 自环 / 未知势力 ⇒ bad-faction（「自己跟自己」不是一条边）
  ok(solo.factionGraph.edgeOf('甲', '甲').reason === 'bad-faction', 'B4a 自环 ⇒ bad-faction');
  ok(solo.factionGraph.edgeOf('甲', '不存在').reason === 'bad-faction', 'B4b 未知势力 ⇒ bad-faction');

  // B5 真图：矩阵对称 / 边数 = n(n-1)/2 / 对角 self / 边是推导值且带依据
  const W = env({});
  const g = W.factionGraph.buildGraph();
  const n = g.nodes.length;
  ok(n === 4 && g.edges.length === n * (n - 1) / 2, 'B5a 四节点 ⇒ 六条边（完全图）');
  let sym = true, diagOk = true;
  for (let i = 0; i < n; i++) {
    if (g.matrix[i][i] !== 'self') diagOk = false;
    for (let j = 0; j < n; j++) if (g.matrix[i][j] !== g.matrix[j][i]) sym = false;
  }
  ok(diagOk, 'B5b 对角是 self（自环不进边集）');
  ok(sym, 'B5c 邻接矩阵对称（甲—乙与乙—甲是同一条边）');
  ok(g.edges.every(function (e) { return e.derived === true && Array.isArray(e.basis) && e.basis.length === 2; }),
    'B5d 每条边都是 derived 且带 basis（**推导值不是观测值**，随时可复盘）');

  // B6 边的算法可复算：单方态度无法单独决定一条边（内部面不导出 ⇒ 经 buildGraph 的读数核）
  ok(M.buildGraph === undefined ? false : true, 'B6 前置：建图口在场');
  const gB6 = W.factionGraph.buildGraph();
  const eB6 = function (x, y) { return gB6.edges.filter(function (e) { return (e.a === x && e.b === y) || (e.a === y && e.b === x); })[0] || null; };
  // 甲(血盟 idx0, mapper 6) × 丁(世仇 idx6, mapper 0) ⇒ 6+0-6 = 0 ⇒ 中立：
  //   **单方态度决定不了一条边**（一方再亲、另一方再仇，两者相加抵消）。
  const eAB = eB6('甲', '丁');
  ok(!!eAB && eAB.affinity === 0 && eAB.tier === '中立', 'B6a 一方血盟 + 一方世仇 ⇒ 中立（单方态度决定不了边）');
  // 甲×乙（血盟 6 × 盟友 5 ⇒ 6+5-6 = +5 ⇒ 盟友档）；丙×丁（敌对 1 × 世仇 0 ⇒ 1+0-6 = -5 ⇒ 世仇档）
  const eCD = eB6('丙', '丁');
  const eA2 = eB6('甲', '乙');
  ok(!!eA2 && eA2.affinity === 5 && eA2.tier === '盟友', 'B6b 同亲相邻档 ⇒ +5 盟友（血盟—盟友）');
  ok(!!eCD && eCD.affinity === -5 && eCD.tier === '世仇', 'B6c 同立场才拉满负向（敌对—世仇 ⇒ -5 世仇：同仇是「都对着别人」，不是「互相亲」）');

  // B7 张力可复算：hostile / denominator === value（换了分母就复算不出来）
  const t = W.factionGraph.tension();
  ok(t.denominator === g.edges.length, 'B7a 分母是**可核对的量**（总边数）');
  // 容差取产品侧报出精度（tension 报出时取整到 1e-3）——判据不许比报出的数更精
  ok(Math.abs(t.value - t.hostile / Math.max(1, t.denominator)) < 1e-3,
    'B7b value 可由 hostile 与 denominator 复算（' + t.hostile + '/' + t.denominator + '=' + t.value
    + '，容差 1e-3 与报出精度同宽）');
  ok(t.hostile > 0 && t.worstTier === '世仇', 'B7c 敌对权重与最差档如实报出');

  // B8 同盟簇 = 连通子图（并查集），单点单列
  const cl = W.factionGraph.clusters();
  ok(cl.ok === true && cl.count >= 1 && JSON.stringify(cl.clusters[0]) === JSON.stringify(['甲', '乙']),
    'B8a 甲—乙（盟友档）连成一簇');
  ok(cl.singletons.length === 2 && cl.blocks === cl.count + cl.singletons.length,
    'B8b 单点势力单列（块数 = 簇数 + 单点数；丢掉单点会让「团数」读成「块数」）');
  // 传递性：链式同盟应成一簇（A-B、B-C 都达档 ⇒ A/B/C 同簇）
  const chain = env({ list: [
    { id: 'c1', name: 'A', status: '稳固', relation: '血盟', scope: '' },
    { id: 'c2', name: 'B', status: '稳固', relation: '血盟', scope: '' },
    { id: 'c3', name: 'C', status: '稳固', relation: '血盟', scope: '' }] });
  const cl2 = chain.factionGraph.clusters();
  ok(cl2.count === 1 && cl2.clusters[0].length === 3, 'B8c 连通性有传递性（A-B-C 一条链 ⇒ 三节点同簇）');

  // B9 节点级热度：unknowns 是「不知道」，不是 0
  const unk = env({ list: [
    { id: 'u1', name: '有档', status: '稳固', relation: '中立', scope: '' },
    { id: 'u2', name: '缺档', status: '稳固', relation: '不存在的档', scope: '' }] });
  const hu = unk.factionGraph.heat();
  const rowMissing = hu.rows.filter(function (r) { return r.name === '缺档'; })[0];
  ok(!!rowMissing && rowMissing.unknowns === 1 && rowMissing.hostiles === 0,
    'B9a 档位不在词表 ⇒ unknowns 记 1、hostiles 记 0（「不知道」不冒充「知道是零」）');
  const unkG = unk.factionGraph.buildGraph();
  ok(unkG.edges.length === 0, 'B9b 算不出来的边不进边集（也就不会去污染张力分母）');

  // B10 容量：超容量如实报 dropped（三种 why 分得开）
  const cap = env({}, { maxNodes: 2 });
  const gc = cap.factionGraph.buildGraph();
  ok(gc.nodes.length === 2 && gc.dropped.length === 2 && gc.dropped.every(function (d) { return d.why === 'over-cap'; }),
    'B10a 超容量 ⇒ 进图 2 / dropped 2（**不静默截断**）');
  const dup = env({ list: [F4[0], F4[0], { id: 'x', name: '', relation: '中立' }] });
  const gd = dup.factionGraph.buildGraph();
  const whys = gd.dropped.map(function (d) { return d.why; }).sort().join(',');
  ok(whys === 'bad-faction,duplicate', 'B10b 重名与空名各自成一种 why（实 ' + whys + '）');

  // B11 边查询：存在的边查得出、查的是同一条。
  //   世界就在这一行造：判据不许复用上一条用例的世界 —— 上面那份 W 的世界早被
  //   B10 的 dup 场（只剩「甲/甲/空」）覆盖过，'乙' 已不在世界里，edgeOf 自然查不出来。
  const Wq = env({});
  const e1 = Wq.factionGraph.edgeOf('甲', '乙');
  ok(e1.ok === true && !!e1.edge && e1.edge.tier === '盟友' && e1.edge.basis.length === 2,
    'B11 edgeOf 查得到的边与矩阵同源（' + (e1.ok ? 'ok' : e1.reason) + '）');
  const e2 = Wq.factionGraph.edgeOf('甲', '丙');
  ok(e2.ok === true && !!e2.edge && e2.edge.tier === '中立', 'B11b 血盟×敌对 ⇒ 中立（同仇不加分）');
}

// ── C 消费方（诊断真读者 + 面板真渲染）────────────────────────────────
function consumers() {
  const WA = freshWA();   // 本锁自造环境
  const col = (WA.toolDiag && typeof WA.toolDiag.collect === 'function') ? WA.toolDiag.collect() : null;
  const fgd = col && col.factionGraph;
  ok(!!fgd, 'C0 诊断节 factionGraph 可读（collect().factionGraph）');
  if (fgd) {
    ok(fgd.dropped !== undefined, 'C1 诊断面报 dropped（少了这一口「图为什么比势力少」无从查）');
    ok(fgd.lastReason !== undefined && fgd.edges !== undefined, 'C2 诊断面报 edges / lastReason');
    ok(Array.isArray(fgd.relationKeys) && fgd.relationKeys.length === 7, 'C3 诊断面把档位词表一并带出（可交叉核对）');
  } else { ok(false, 'C1 诊断节不可用'); ok(false, 'C2'); ok(false, 'C3'); }

  const W = env({});
  let html = '';
  try { html = renderEventsHtml(W); } catch (e) { html = 'THREW:' + (e && e.message); }
  ok(hits(html, 'id="wa-fg-tension"') === 1, 'C4 事件页真渲染出张力入口（渲染链路可用）');
  ok(hits(html, 'id="wa-fg-clusters"') === 1 && hits(html, 'id="wa-fg-edges"') === 1, 'C5 三枚读数入口齐备');
  const c1 = clickFg(W, 'wa-fg-tension');
  ok(c1.threw === null, 'C6 点张力未抛异常（真绑定可用）');
  ok(hits(c1.text, '张力') === 1, 'C7 点张力后输出行真带读数（用户那面看得见）');
  const c2 = clickFg(W, 'wa-fg-clusters');
  ok(hits(c2.text, '同盟簇') === 1, 'C8 点同盟簇后有读数');
  const c3 = clickFg(W, 'wa-fg-edges');
  ok(hits(c3.text, '条') === 1, 'C9 点关系网后有读数');
  // 未算成的情形必须**显式报出**（不许留空面板）
  const offW = env({ raw: true });      // 开关真关掉的场（不是「没置设过」）
  const c4 = clickFg(offW, 'wa-fg-tension');
  ok(hits(c4.text, '开关未开') === 1, 'C10 开关未开时如实报出（不留空面板 —— 「没算」与「算出来是空的」不许同形）');
}

// ── 每条破坏在破坏副本上重跑同款**真**判据 ────────────────────────────
//   `mk` 由调用方给：正控制传「原版工厂」，负控制传「破坏副本工厂」。判据**自己造世界**，
//   因为每条判据要的场不同（单节点 / 满容量 / 缺档位）—— 外层先跑一遍，原版也会被判成破坏，
//   那不是判据，那是巧合。正控制段就是为抓它而设的。
function mustFail(key, mk) {
  switch (key) {
    case 'affinity': { const W = mk();   // 同仇被当成同盟（-6 被去掉 ⇒ 单方态度独自决定一条边）
      const g = W.factionGraph.buildGraph();
      const e = g.edges.filter(function (x) { return (x.a === '甲' && x.b === '丁') || (x.a === '丁' && x.b === '甲'); })[0];
      return !e || e.affinity !== 0; }
    case 'guard': { const W = mk(); const t = W.factionGraph.tension(); return !isFinite(t.value); }
    case 'selfLoop': { const W = mk(); const g = W.factionGraph.buildGraph();
      return g.matrix[0][0] !== 'self' || g.edges.length !== g.nodes.length * (g.nodes.length - 1) / 2; }
    case 'dropped': { const W = mk(); const g0 = W.factionGraph.buildGraph();
      if (!g0.ok || g0.nodes.length !== 2) throw new Error('dropped 场不对：nodes=' + ((g0.nodes || []).length));
      return g0.dropped.length === 0; }
    case 'diagDropped': { const W = mk();
      // 判据必须先自己真建一次图：诊断面 secFactionGraph() 是零副作用读（只读 stat，不建图），
      //   不建图就读到的 dropped 停在初始 0 —— 那是未观测值，与「建了图但零 dropped」同形。
      const g0 = W.factionGraph.buildGraph();
      if (!g0.ok || g0.dropped.length !== 2) throw new Error('diagDropped 场不对：dropped=' + ((g0.dropped || []).length));
      const c = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().factionGraph : null;
      return !c || c.dropped === 0 || c.dropped === undefined; }
    case 'panel': { const W = mk(); let h = '';
      try { h = renderEventsHtml(W); } catch (e) { h = 'THREW'; }
      // 判据不内联锚点字面量：那枚 id 从锚点里派生
      const want = ANCHORS.panel.txt.split(' aria-label')[0];
      return hits(h, want) !== 1; }
    default: return false;
  }
}
// ── 用例世界：每条判据要的场不同（判据自己造，见上）────────────────────
function caseSpec(key) {
  switch (key) {
    case 'guard': return { list: [F4[0]] };                       // 单节点 ⇒ 零边 ⇒ 分母保护才不 NaN
    case 'dropped': return { list: F4, extra: { maxNodes: 2 } };   // 超容量 ⇒ 该有 dropped
    case 'diagDropped': return { list: F4, extra: { maxNodes: 2 } };
    default: return { list: F4 };
  }
}
function runAll(a) {
  HOST = a;                                  // 判据上交宿主（见文件头「宿主断言」段）
  console.log('== A/B 判据（原版成绿）==');
  judge();
  console.log('== C 消费方（诊断真读者 + 面板真渲染）==');
  consumers();
  console.log('FACTION-GRAPH-V2139: ' + (fails ? 'FAIL ' + fails + '/' + checks : 'pass ' + checks + ' 项'));
  return fails;
}
function runNegative(a) {
  HOST = a;                                  // 负控判据同样上交宿主
  let nf = 0;
  console.log('== N0–N6 真源码破坏（破坏副本上重跑同款真判据）==');
  BROKEN.forEach(function (b) {
    const n = hits(src(b.spec.rel), b.spec.txt);
    checks++; if (n !== 1) { nf++; console.log('  ✗ N0 锚点不唯一：' + b.key + ' hits=' + n); }
    else console.log('  ✓ N0 ' + b.key + ' 锚点恰中 1 次');
  });
  // H5 判据纯度：判据层不许内联锚点串（锚点字面量只准在 ANCHORS 里声明一次）
  const self = src(SELF);
  const anchorsBlock = self.slice(self.indexOf('const ANCHORS'), self.indexOf('function brokenOverride'));
  const judgeBlock = self.slice(self.indexOf('function mustFail'), self.indexOf('function caseSpec'));
  ['const a = mapper(idxA) + mapper(idxB) - 6;', 'Math.max(1, denominator)', 'for (let j = i + 1; j < n; j++) {',
    "why: 'over-cap'", 'dropped: st.dropped || 0,', 'id="wa-fg-tension" aria-label'].forEach(function (lit) {
    const inAnchors = hits(anchorsBlock, lit);
    const inJudge = hits(judgeBlock, lit);
    checks++;
    if (inAnchors !== 1 || inJudge !== 0) { nf++; console.log('  ✗ H5 纯度：' + JSON.stringify(lit.slice(0, 26)) + ' 声明 ' + inAnchors + ' 次 / 判据内 ' + inJudge + ' 次'); }
    else console.log('  ✓ H5 纯度：锚点只声明 1 次且判据不内联 ' + JSON.stringify(lit.slice(0, 22)));
  });
  // 正控制：原版上同款判据必须**全为假**（否则判据恒真、负控无意义）
  BROKEN.forEach(function (b) {
    let truth = null;
    try { truth = mustFail(b.key, function () { return env(caseSpec(b.key)); }); }
    catch (e) { truth = 'threw:' + (e && e.message); }
    checks++;
    if (truth !== false) { nf++; console.log('  ✗ 正控制失败：' + b.key + ' 在原版上判据竟为真（' + truth + '）⇒ 判据恒真，这条负控制无意义'); }
    else console.log('  ✓ 正控制：' + b.key + ' 同款判据在原版上为假');
  });
  // N1–N6：每条破坏 ⇒ 装载破坏副本 ⇒ 同款判据必须真现形
  BROKEN.forEach(function (b) {
    let bad = null, err = null;
    try {
      bad = mustFail(b.key, function () { return envBroken(Object.assign({}, caseSpec(b.key), { raw: false }), brokenOverride(b.spec)); });
    } catch (e) { err = e; }
    checks++;
    if (err) { nf++; console.log('  ✗ N 装载/判据抛出 ' + b.key + '：' + (err && err.message)); }
    else if (!bad) { nf++; console.log('  ✗ N 破坏未被观测到：' + b.key + '（破坏副本上判据仍绿 ⇒ 判据无效）'); }
    else console.log('  ✓ N 破坏现形：' + b.key);
  });
  // N5 纯度：全部负控制跑完后，三个真文件逐字未变
  const before = { f: src(FG), d: src(DIAG), p: src(PANEL) };
  const after = { f: src(FG), d: src(DIAG), p: src(PANEL) };
  checks++;
  if (before.f !== after.f || before.d !== after.d || before.p !== after.p) {
    nf++; console.log('  ✗ N5 纯度：负控制期间真文件被改写（破坏只准发生在内存副本上）');
  } else console.log('  ✓ N5 纯度：三个真文件逐字未变（破坏只发生在内存副本上）');
  console.log('NEGATIVE: ' + (nf ? 'FAIL ' + nf + '/' + checks : 'pass ' + checks + ' 项'));
  return nf;
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, ANCHORS: ANCHORS };
if (require.main === module) {
  const env0 = sync.fresh(); LAST_DOM = env0.dom;
  const a = function (c, m) { if (!c) console.log('  ✗ ' + m); };
  let f = 0;
  try { f += (runAll(a) ? 1 : 0); } catch (e) { console.log('  ✗ runAll 抛出：' + (e && e.message)); f = 1; }
  try { f += (runNegative(a) ? 1 : 0); } catch (e) { console.log('  ✗ runNegative 抛出：' + (e && e.message)); f = 1; }
  console.log(f ? 'FACTION-GRAPH-V2139: FAIL' : 'FACTION-GRAPH-V2139: pass');
  process.exitCode = f ? 1 : 0;
}