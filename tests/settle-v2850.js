#!/usr/bin/env node
// WorldAxis tests/settle-v2850.js —— v2.85.0（A4 注入效率 + B1 人物自主生活 + B2 地域与交通）
//
// 【它治的三类「承诺了但没人问过」】
//   A4 注入效率：inject-budget 的 PRIORITY 承诺「pinned（rank≤2）优先保障、绝不静默丢弃」，
//      但该表只写了 v0.9.3 的 8 个源名，而注入面已长到 45 个 —— 其余 38 个静默落 DEFAULT_RANK，
//      承诺对它们从未生效，且「有源没被声明」在运行时完全不可见。
//   B1 人物自主生活：推演名单按**插入序**截断（`Object.keys(people).slice(0, maxPeople)`），
//      于是「谁被推演」取决于谁先进场，有依据的人可能永远轮不到；另：单向宣布的合作
//      被当作已建立的协作（`kind='cooperation'` 只看自己那一行，不看对方回没回应）。
//   B2 地域与交通：本版新增的两条边界**全是否定式**，且都极易被实现成「更聪明的兜底」——
//      ① 层级只说明归属、不说明可达（A∈B 不得被读成「A 走得到 B」）；
//      ② 路走得通 ≠ 现在走得动（段容量满时拒收，且拒收不落盘）。
//      存在面判据（有 parent 字段吗 / 有 cap 字段吗）对这两条一无所知。
//
// 【判据】（A 世界织体 / B 人物生活 / C 注入优先级；末段 N 负控制）
//   A1 默认关闭与归因：unknown-parent / self-parent / parent-locked / parent-cycle 四个码分开归因。
//   A2 补全 vs 改写：无→有是补全（允许、且只许一次）；x→y 是冲突改写（拒收并写明现有归属）。
//   A3 层级 ≠ 可达：父子之间没登记道路时 reach 必须 reachable:false（**不得**因层级给一条路）。
//   A4 通行量：容量满拒收（road-crowded）、拒收不落盘、缺省不抹容量、显式 0 = 不限。
//   A5 容量按段算：各走各的相邻路段不算拥挤。
//   A6 注入块：地点行带归属，且明写「只说明归属、不说明可达」。
//   B1 有依据者优先：空壳人物排在前面也占不到名额（旧实现必翻车）+ skipped 可观测。
//   B2 单向协作 ⇒ wait/unreciprocated，且承诺本身**不被删**（事实存在过要留痕）。
//   B3 双向协作 ⇒ 走承诺路径（不报 unreciprocated）；有自己目标者不被单向协作拦住。
//   C1 真源覆盖（运行时）：注入面每个 source 喂给 plan() 后 unranked 必须为空。
//   C2 真源覆盖（静态）：真源码面里每个 `source: 'X'` 都必须在 PRIORITY 里（成类锁，防再漂移）。
//   C3 未声明可观测：plan().unranked 与 summaryText 都要报出未声明源。
//   C4 pinned 真生效：超预算时 rank1 不被丢弃（kept/folded），rank8 被丢 —— 承诺第一次可测。
//   N0 破坏锚点在真源码各恰中 1 次；N1 破坏 ⇒ 对应判据现形；N2 原版上同款判据仍绿；
//      N3 逐锚敏感（一种破坏不牵连另一面）；N4 非恒真（状态确实变化过）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const TAG = '__v2850_';

function fresh(opts) { return gate.fresh(opts).WA; }
function st(WA) { return WA.store.get() || {}; }
function wnode(WA) { const w = st(WA).world; return (w && typeof w === 'object' && !Array.isArray(w)) ? w : {}; }
function places(WA) { return Array.isArray(wnode(WA).places) ? wnode(WA).places : []; }
function roads(WA) { return Array.isArray(wnode(WA).roads) ? wnode(WA).roads : []; }
function journeys(WA) { return Array.isArray(wnode(WA).journeys) ? wnode(WA).journeys : []; }
/** 清场：本锁自治，不依赖运行顺序（也防上一批判据留下的同名地点） */
function resetWorld(WA) {
  WA.store.transact(function (d) {
    d.world = { places: [], roads: [], events: [], journeys: [] };
    d.people = {};
  }, TAG + 'reset');
}
function resetPeople(WA) {
  WA.store.transact(function (d) { d.people = {}; }, TAG + 'people');
}
function seedGoal(WA, name, text) { return WA.life.addGoal(name, { text: text }); }
function seedShell(WA, name) {
  WA.store.transact(function (d) { d.people['p_' + name] = { id: 'p_' + name, name: name, knowledge: {} }; }, TAG + 'shell');
}
function lastDecisionOf(WA, name) {
  const p = st(WA).people['p_' + name];
  return p && p.life && p.life.lastDecision ? p.life.lastDecision : null;
}
// ── 无副作用隔离（judge 走真 store，批外 transact 会落盘）──
function isolated(fn) {
  const LS = global.localStorage;
  const snap = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) snap.push([k, LS.getItem(k)]); }
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally {
    if (WA0 && origLog) WA0.log = origLog;
    const drop = [];
    for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !snap.some(function (x) { return x[0] === k; })) drop.push(k); }
    drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
    snap.forEach(function (x) { try { LS.setItem(x[0], x[1]); } catch (e) {} });
  }
}
// ══════════════ A 面：世界织体（B2 地域与交通） ══════════════
function judgeWorld(a) {
  const WA = fresh();
  const W = WA.world;
  resetWorld(WA);
  // A1 四个码分开归因（不是合成一个「不行」）
  a(W.addPlace({ name: TAG + '丁', parent: TAG + '不存在' }).reason === 'unknown-parent',
    'v2850/A1: 父级未登记 ⇒ unknown-parent（不猜「大概同城」）');
  a(W.addPlace({ name: TAG + '戊', parent: TAG + '戊' }).reason === 'self-parent',
    'v2850/A1: 自指父级 ⇒ self-parent');
  a(places(WA).filter(function (p) { return p.name === TAG + '丁' || p.name === TAG + '戊'; }).length === 0,
    'v2850/A1: 被拒的地点不得留下半个（实 ' + places(WA).length + ' 个）');
  // A2 补全 vs 改写
  a(W.addPlace({ name: TAG + '甲', kind: 'home' }).ok === true, 'v2850/A2: 登记甲');
  a(W.addPlace({ name: TAG + '乙', parent: TAG + '甲' }).ok === true, 'v2850/A2: 乙∈甲（父级已登记，合法）');
  const cyc = W.addPlace({ name: TAG + '甲', parent: TAG + '乙' });
  a(cyc.reason === 'parent-cycle', 'v2850/A2: 补全会让父子互相归属 ⇒ parent-cycle（实 ' + JSON.stringify(cyc) + '）');
  a(W.addPlace({ name: TAG + '丙', parent: TAG + '甲' }).ok === true, 'v2850/A2: 丙∈甲');
  const lock = W.addPlace({ name: TAG + '丙', parent: TAG + '乙' });
  a(lock.reason === 'parent-locked' && lock.parent === TAG + '甲',
    'v2850/A2: 已有归属被冲突改写 ⇒ parent-locked 且**写明现有归属**（实 ' + JSON.stringify(lock) + '）');
  // 补全：无 → 有（这是补全，不是改写）
  W.addPlace({ name: TAG + '己' });
  const fill = W.addPlace({ name: TAG + '己', parent: TAG + '甲' });
  a(fill.ok === true && fill.parent === TAG + '甲',
    'v2850/A2: 无→有 是**补全缺失事实**（允许，实 ' + JSON.stringify(fill) + '）');
  a(W.addPlace({ name: TAG + '己', parent: TAG + '乙' }).reason === 'parent-locked',
    'v2850/A2: 补全后即上锁（只许一次）');
  // A3 层级 ≠ 可达（本版最贵的一条）
  const r0 = W.reach(TAG + '甲', TAG + '乙');
  a(r0.ok === true && r0.reachable === false && r0.minutes === null,
    'v2850/A3: 父子之间**没登记道路** ⇒ 走不通（层级不得被读成可达；实 ' + JSON.stringify(r0) + '）');
  // A4 通行量
  a(W.addRoad(TAG + '甲', TAG + '乙', 10, 1).ok === true, 'v2850/A4: 登记容量 1 的路');
  a(W.addRoad(TAG + '甲', TAG + '乙', 10, 1.5).reason === 'bad-cap', 'v2850/A4: 非整数容量 ⇒ bad-cap');
  W.setSettings({ enabled: true });
  const d1 = W.depart(TAG + '行人甲', TAG + '甲', TAG + '乙', 0);
  a(d1.ok === true, 'v2850/A4: 第一个走这一段 ⇒ 放行（实 ' + JSON.stringify(d1) + '）');
  const before = journeys(WA).length;
  const d2 = W.depart(TAG + '行人乙', TAG + '甲', TAG + '乙', 0);
  a(d2.reason === 'road-crowded' && d2.cap === 1 && d2.on === 1,
    'v2850/A4: 容量满 ⇒ road-crowded 且回报 cap/on（实 ' + JSON.stringify(d2) + '）');
  a(journeys(WA).length === before,
    'v2850/A4: 被拒的行程**不落盘**（实 ' + journeys(WA).length + ' vs ' + before + '）——拒收本应在状态里不可见');
  a((W.stat().faults || {})['road-crowded'] >= 1, 'v2850/A4: 但拒绝必须**可观测**（按原因计数）');
  // 缺省不抹容量 / 显式 0 = 不限
  W.addRoad(TAG + '甲', TAG + '乙', 20);
  const row = roads(WA).filter(function (r) { return r.a === TAG + '甲' && r.b === TAG + '乙'; })[0];
  a(row && row.cap === 1 && row.minutes === 20,
    'v2850/A4: 只改耗时不抹容量（缺省参数不是「改成不限」；实 ' + JSON.stringify(row) + '）');
  W.addRoad(TAG + '甲', TAG + '乙', 20, 0);
  a(W.depart(TAG + '行人乙', TAG + '甲', TAG + '乙', 0).ok === true,
    'v2850/A4: 显式 0 = 不限 ⇒ 第二个人也能走');
  // A5 容量按段算
  W.addPlace({ name: TAG + '庚' });
  W.addRoad(TAG + '乙', TAG + '庚', 5, 1);
  a(W.depart(TAG + '行人丙', TAG + '乙', TAG + '庚', 0).ok === true,
    'v2850/A5: 各走各的**相邻路段**不算拥挤（容量按段算，不按整条路径算）');
  // A6 注入块
  const blk = W.buildBlock();
  a(blk.indexOf(TAG + '乙') >= 0 && blk.indexOf('∈' + TAG + '甲') >= 0,
    'v2850/A6: 注入块地点行带归属（A∈B）');
  a(blk.indexOf('只说明归属') >= 0 && blk.indexOf('不说明可达') >= 0,
    'v2850/A6: 语义约束随块注入（不指望模型自己记得「层级不等于可达」）');
  console.log('  ✓ v2850/A: 地域层级（归属≠可达）与交通通行量（走得通≠走得动）');
}
// ══════════════ B 面：人物自主生活（B1） ══════════════
function judgeLife(a) {
  const WA = fresh();
  const L = WA.life;
  resetPeople(WA);
  L.setSettings({ enabled: true, maxPeople: 2 });
  // 前 3 位是空壳（无任何依据），后 3 位有 active 目标
  [TAG + '壳1', TAG + '壳2', TAG + '壳3'].forEach(function (n) { seedShell(WA, n); });
  [TAG + '目1', TAG + '目2', TAG + '目3'].forEach(function (n) { seedGoal(WA, n, '把铺子盘回来'); });
  const r = L.tick({ now: 11 });
  const done = [TAG + '目1', TAG + '目2', TAG + '目3'].filter(function (n) { return !!lastDecisionOf(WA, n); });
  const shell = [TAG + '壳1', TAG + '壳2', TAG + '壳3'].filter(function (n) { return !!lastDecisionOf(WA, n); });
  a(done.length === 2, 'v2850/B1: 名额=2 ⇒ 恰 2 个**有依据**者被推演（实 ' + JSON.stringify(done) + '）');
  a(shell.length === 0,
    'v2850/B1: 无依据者**不占名额**（旧实现在这里必翻车：插入序前 3 位全是空壳，有依据者永远轮不到）');
  a(r.skipped === 1, 'v2850/B1: 名额不足**可观测**（skipped=1，实 ' + r.skipped + '）——静默少推演一个人与「他本来没事可做」在读数上长得一样');
  a((L.stat().skipped || 0) >= 1, 'v2850/B1: stat 累计 skipped（实 ' + L.stat().skipped + '）');
  // B2 单向协作
  resetPeople(WA);
  L.setSettings({ enabled: true, maxPeople: 4 });
  seedShell(WA, TAG + '独1'); seedShell(WA, TAG + '独2');
  const c1 = L.addCommitment(TAG + '独1', { kind: 'cooperation', target: TAG + '独2', text: '合办义仓' });
  a(c1.ok === true, 'v2850/B2: 承诺登记成功（单方面宣布也是事实，要留痕）');
  const r2 = L.tick({ now: 12 });
  const dec = lastDecisionOf(WA, TAG + '独1');
  a(dec && dec.action === 'wait' && dec.reason === 'unreciprocated',
    'v2850/B2: 单向宣布的合作 ⇒ wait / unreciprocated（不得当作已建立的协作；实 ' + JSON.stringify(dec) + '）');
  a(r2.unreciprocated >= 1, 'v2850/B2: 返回值可观测（unreciprocated=' + r2.unreciprocated + '）');
  const p1 = st(WA).people['p_' + TAG + '独1'];
  a(p1.life.commitments.length === 1 && p1.life.commitments[0].status === 'active',
    'v2850/B2: 承诺本身**不被删**（拒收/降级不得顺手抹掉事实存在过）');
  // B3 双向协作 ⇒ 走承诺路径
  L.addCommitment(TAG + '独2', { kind: 'cooperation', target: TAG + '独1', text: '合办义仓' });
  L.tick({ now: 13 });
  const dec2 = lastDecisionOf(WA, TAG + '独1');
  a(dec2 && dec2.reason === 'commitment',
    'v2850/B3: 对方回了一行同事项合作 ⇒ 走承诺路径（不再报 unreciprocated；实 ' + JSON.stringify(dec2) + '）');
  // 有自己目标者不被单向协作拦住
  resetPeople(WA);
  L.setSettings({ enabled: true, maxPeople: 4 });
  seedShell(WA, TAG + '忙2');
  seedGoal(WA, TAG + '忙1', '查清旧账');
  L.addCommitment(TAG + '忙1', { kind: 'cooperation', target: TAG + '忙2', text: '合伙开店' });
  L.tick({ now: 14 });
  const dec3 = lastDecisionOf(WA, TAG + '忙1');
  a(dec3 && dec3.reason !== 'unreciprocated',
    'v2850/B3: 有自己目标的人不被单向协作拦住（协作回没回应不该改变他本来的行动；实 ' + JSON.stringify(dec3) + '）');
  console.log('  ✓ v2850/B: 推演名单（有依据者优先）与协作对称性（单向≠协作）');
}
// ══════════════ C 面：注入优先级（A4） ══════════════
/** 真源码面里被注入的 source 名（与 render/inject.js 同源，成类锁） */
function injectSources() {
  const src = fs.readFileSync(path.join(BASE, 'render', 'inject.js'), 'utf8');
  const out = [];
  const re = /source:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}
function judgeBudget(a) {
  const WA = fresh();
  const B = WA.injectBudget;
  const srcs = injectSources();
  a(srcs.length >= 40, 'v2850/C1: 注入源面够大（' + srcs.length + ' 个，判据不在子集上恒真）');
  // C1a 运行时覆盖：把注入面每个 source 喂给真引擎，未声明列表必须为空
  const p = B.plan(srcs.map(function (s) { return { source: s, content: 'x' }; }), { budget: 4000 });
  a(p.unranked.length === 0,
    'v2850/C1: 真源**逐个**都在优先级声明里（未声明: ' + (p.unranked.join(',') || '无') + '）——'
    + '这正是旧版静默落默认档的地方');
  // C1b 静态覆盖：声明表即真源范围（反向也查：声明了却不存在的源）
  const declared = Object.keys(B.PRIORITY);
  const miss = srcs.filter(function (s) { return declared.indexOf(s) < 0; });
  const extra = declared.filter(function (s) { return srcs.indexOf(s) < 0; });
  a(miss.length === 0 && extra.length === 0,
    'v2850/C1: 声明面 ⇄ 注入面互为子集（缺 ' + JSON.stringify(miss) + ' / 多 ' + JSON.stringify(extra) + '）');
  // C2 未声明可观测
  const p2 = B.plan([{ source: TAG + '未知名', content: 'y' }], { budget: 100 });
  a(p2.unranked.indexOf(TAG + '未知名') >= 0,
    'v2850/C2: 未声明源进 plan().unranked（实 ' + JSON.stringify(p2.unranked) + '）——新增源忘了登记会当场可见');
  a(B.summaryText(p2).indexOf('未声明') >= 0,
    'v2850/C2: 摘要里同样看得见（实 ' + B.summaryText(p2) + '）');
  // C3 rank 分布
  a(B.rankOf('近端事件') === 1 && B.rankOf('世界状态') === 2,
    'v2850/C3: pinned 档仍是 rank1/2（实 ' + B.rankOf('近端事件') + '/' + B.rankOf('世界状态') + '）');
  a(B.rankOf('世界织体') === 5 && B.rankOf('人物生活') === 5,
    'v2850/C3: 这两个源此前静默落默认 6，现在有**明确声明**（实 ' + B.rankOf('世界织体') + '/' + B.rankOf('人物生活') + '）');
  // C4 pinned 真生效（承诺第一次可测）
  const big = '汉'.repeat(3000);
  const items = [{ source: '近端事件', content: big }];
  for (let i = 1; i <= 6; i++) items.push({ source: '外貌契约', content: '汉'.repeat(300) });
  const p3 = B.plan(items, { budget: 600 });
  const dropped0 = p3.dropped.map(function (d) { return d.source; });
  const keptOrFolded = p3.kept.some(function (k) { return k.source === '近端事件'; });
  a(dropped0.indexOf('近端事件') < 0 && keptOrFolded,
    'v2850/C4: 超预算时 pinned 仍被保留（kept/folded，不进 dropped；实 ' + JSON.stringify(dropped0) + '）');
  a(dropped0.indexOf('外貌契约') >= 0,
    'v2850/C4: 同时低优先项确实被丢弃（否则「保留」是恒真——什么都没丢）');
  console.log('  ✓ v2850/C: 注入优先级覆盖整个源面（pinned 承诺第一次真正可测）');
}
// ══════════════ 负控制 ══════════════
const BROKEN = [
  { key: 'crowd', rel: 'engines/world.js',
    from: "      if (lim2 > 0 && roadUsage(sa, sb) >= lim2) {",
    to: "      if (false && roadUsage(sa, sb) >= lim2) {",
    why: '摘掉路段占用校验 ⇒ 容量满时照样出发（「走得通 ≠ 走得动」判据现形）' },
  // 归属守卫是**双层**的（事务前只读判定 + 事务内复核透明中止），这是冗余防护的正面价值：
  //   实测只摘事务前那层，事务内的 `return false` 仍然兜住 ⇒ 症状不现形（reason 变成
  //   store-unavailable 且归属没被改）。所以这里的破坏必须**两层一起**改成「没有守卫的实现」，
  //   症状才是这条判据真正要抓的那个：已有归属被静默改写。
  { key: 'lock', rel: 'engines/world.js',
    from: "      if (cur0 && parent !== cur0) return { ok: false, reason: 'parent-locked', name: name, parent: cur0 };",
    to: "      if (false) return { ok: false, reason: 'parent-locked', name: name, parent: cur0 };",
    also: { from: "        if (parent && cur && parent !== cur) return false;",
      to: "        if (parent && cur && parent !== cur) { hit.parent = parent; }" },
    why: '摘掉归属改写守卫（两层）⇒ 已有归属被静默改写（parent-locked 从现场消失）' },
  { key: 'cycle', rel: 'engines/world.js',
    from: "          if (loop) { out = { ok: false, reason: 'parent-cycle', name: name, parent: parent }; return false; }",
    to: "          if (false) { out = { ok: false, reason: 'parent-cycle', name: name, parent: parent }; return false; }",
    why: '摘掉环检测 ⇒ 父子互相归属被收下（parent-cycle 从现场消失）' },
  { key: 'lone', rel: 'engines/life.js',
    from: "        const lone = !!(commitment && commitment.kind === 'cooperation' && !reciprocated(draft, p, commitment));",
    to: "        const lone = false;",
    why: '摘掉协作对偶检查 ⇒ 单向宣布的合作被当作已建立的协作（unreciprocated 从现场消失）' },
  { key: 'rank', rel: 'engines/inject-budget.js',
    from: "    '世界织体': { rank: 5, fold: true },",
    to: "",
    why: '删掉一个源声明 ⇒ plan().unranked 必须点名（覆盖判据现形）' },
  { key: 'basis', rel: 'engines/life.js',
    from: "      }).filter(function (r) { return r.n > 0; })\n        .sort(function (a, b) { return (b.n - a.n) || (a.i - b.i); });",
    to: "      });",
    why: '退回插入序口径（有依据者不再优先）⇒ 空壳人物重新占满名额、有依据者一个轮不到' }
];
function specAnchors(spec) {
  const list = [{ from: spec.from, to: spec.to }];
  if (spec.also) list.push({ from: spec.also.from, to: spec.also.to });
  return list;
}
/** 每个锚点各命中几次（多锚点破坏逐锚回报，N0 才能逐锚判「恰 1 次」） */
function anchorHits(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  return specAnchors(spec).map(function (p) { return src.split(p.from).length - 1; });
}
function brokenOverride(spec) {
  let src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  specAnchors(spec).forEach(function (p, i) {
    const hits = src.split(p.from).length - 1;
    if (hits !== 1) throw new Error('破坏锚点 #' + (i + 1) + ' 应恰中 1 次，实 ' + hits + ' 次：' + spec.rel + ' :: ' + p.from.slice(0, 50));
    src = src.split(p.from).join(p.to);
  });
  const ov = {};
  ov[spec.rel] = src;
  return ov;
}
// ── 探针（返回症状值，便于两向对照）──
function probeCrowd(WA) {
  const W = WA.world;
  resetWorld(WA);
  W.setSettings({ enabled: true });
  W.addPlace({ name: TAG + '甲' }); W.addPlace({ name: TAG + '乙' });
  W.addRoad(TAG + '甲', TAG + '乙', 10, 1);
  W.depart(TAG + '行人甲', TAG + '甲', TAG + '乙', 0);
  const r = W.depart(TAG + '行人乙', TAG + '甲', TAG + '乙', 0);
  return { reason: r.ok ? 'admitted' : r.reason, n: journeys(WA).length };
}
function probeLock(WA) {
  const W = WA.world;
  resetWorld(WA);
  W.addPlace({ name: TAG + '甲' }); W.addPlace({ name: TAG + '乙' });
  W.addPlace({ name: TAG + '丙', parent: TAG + '甲' });
  const r = W.addPlace({ name: TAG + '丙', parent: TAG + '乙' });
  const row = places(WA).filter(function (p) { return p.name === TAG + '丙'; })[0];
  return { reason: r.ok ? 'admitted' : r.reason, now: row ? row.parent : '' };
}
function probeCycle(WA) {
  const W = WA.world;
  resetWorld(WA);
  W.addPlace({ name: TAG + '甲' }); W.addPlace({ name: TAG + '乙', parent: TAG + '甲' });
  const r = W.addPlace({ name: TAG + '甲', parent: TAG + '乙' });
  const row = places(WA).filter(function (p) { return p.name === TAG + '甲'; })[0];
  return { reason: r.ok ? 'admitted' : r.reason, now: row ? String(row.parent) : '' };
}
function probeLone(WA) {
  const L = WA.life;
  resetPeople(WA);
  L.setSettings({ enabled: true, maxPeople: 4 });
  seedShell(WA, TAG + '独1'); seedShell(WA, TAG + '独2');
  L.addCommitment(TAG + '独1', { kind: 'cooperation', target: TAG + '独2', text: '合办义仓' });
  L.tick({ now: 20 });
  const d = lastDecisionOf(WA, TAG + '独1');
  return { reason: d ? d.reason : '', action: d ? d.action : '' };
}
function probeRank(WA) {
  return WA.injectBudget.plan([{ source: '世界织体', content: 'x' }], { budget: 100 }).unranked.slice();
}
function probeBasis(WA) {
  const L = WA.life;
  resetPeople(WA);
  L.setSettings({ enabled: true, maxPeople: 2 });
  [TAG + '壳1', TAG + '壳2'].forEach(function (n) { seedShell(WA, n); });
  [TAG + '目1', TAG + '目2'].forEach(function (n) { seedGoal(WA, n, '盘铺子'); });
  L.tick({ now: 21 });
  const done = [TAG + '目1', TAG + '目2'].filter(function (n) { return !!lastDecisionOf(WA, n); });
  const shell = [TAG + '壳1', TAG + '壳2'].filter(function (n) { return !!lastDecisionOf(WA, n); });
  return { done: done.length, shell: shell.length };
}
function withSpec(spec, fn) { return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); }); }
function clean(fn) { return isolated(function () { return fn(fresh()); }); }
function runNegative(a) {
  const byKey = {};
  BROKEN.forEach(function (s) { byKey[s.key] = s; });
  // N0 锚点各恰 1 次（多锚点破坏逐锚判定：any 一处不唯一都算锚点漂移）
  const bad = BROKEN.map(function (p) {
    const hits = anchorHits(p);
    const off = hits.map(function (h, i) { return h === 1 ? '' : '#' + (i + 1) + '(' + h + '次)'; })
      .filter(Boolean).join('');
    return off ? p.key + off : '';
  }).filter(Boolean);
  a(bad.length === 0, 'v2850: [N0] 破坏锚点在真源码各恰中 1 次（异: ' + (bad.join(',') || '无') + '）');
  // N1 逐条现形
  const cBad = withSpec(byKey.crowd, probeCrowd);
  a(cBad.reason === 'admitted' && cBad.n === 2,
    'v2850: [N1] 摘掉路段占用校验 ⇒ 容量满也放行（实 ' + JSON.stringify(cBad) + '）');
  const lBad = withSpec(byKey.lock, probeLock);
  a(lBad.reason !== 'parent-locked' && lBad.now === TAG + '乙',
    'v2850: [N1] 摘掉归属守卫（两层）⇒ 已有归属被静默改写（实 ' + JSON.stringify(lBad) + '）');
  const yBad = withSpec(byKey.cycle, probeCycle);
  a(yBad.reason !== 'parent-cycle',
    'v2850: [N1] 摘掉环检测 ⇒ 父子互相归属被收下（实 ' + JSON.stringify(yBad) + '）');
  const oBad = withSpec(byKey.lone, probeLone);
  a(oBad.reason !== 'unreciprocated',
    'v2850: [N1] 摘掉协作对偶 ⇒ 单向宣布被当协作（实 ' + JSON.stringify(oBad) + '）');
  const rBad = withSpec(byKey.rank, probeRank);
  a(rBad.indexOf('世界织体') >= 0,
    'v2850: [N1] 删掉一个源声明 ⇒ 未声明面点名它（实 ' + JSON.stringify(rBad) + '）');
  const bBad = withSpec(byKey.basis, probeBasis);
  // 实测形态：插入序前两位是空壳，而空壳没有 life 行 ⇒ 两个名额全被空转吃掉，
  //   有依据者一个也轮不到（done=0）。判据抓的是「有依据者轮不到」（done < 名额），
  //   不把它写成 done===0——那会把判据绑死在「空壳恰好没有 life」这个夹具细节上。
  a(bBad.done < 2,
    'v2850: [N1] 退回插入序口径 ⇒ 空壳占满名额、有依据者轮不到（实 ' + JSON.stringify(bBad) + '）');
  // N2 两向自证：原版上同款探针全部为「已修好」形态
  const cOk = clean(probeCrowd);
  a(cOk.reason === 'road-crowded' && cOk.n === 1,
    'v2850: [N2] 原版：容量满即拒且只留一条行程（实 ' + JSON.stringify(cOk) + '）');
  const lOk = clean(probeLock);
  a(lOk.reason === 'parent-locked' && lOk.now !== TAG + '乙',
    'v2850: [N2] 原版：冲突改写被拒且归属未变（实 ' + JSON.stringify(lOk) + '）');
  const yOk = clean(probeCycle);
  a(yOk.reason === 'parent-cycle', 'v2850: [N2] 原版：成环被拒（实 ' + JSON.stringify(yOk) + '）');
  const oOk = clean(probeLone);
  a(oOk.reason === 'unreciprocated' && oOk.action === 'wait',
    'v2850: [N2] 原版：单向协作 ⇒ wait/unreciprocated（实 ' + JSON.stringify(oOk) + '）');
  a(clean(probeRank).length === 0, 'v2850: [N2] 原版：真源全部已声明（未声明为空）');
  const bOk = clean(probeBasis);
  a(bOk.done === 2 && bOk.shell === 0,
    'v2850: [N2] 原版：名额全给有依据者（实 ' + JSON.stringify(bOk) + '）');
  // N3 逐锚敏感（一种破坏不牵连另一面）
  a(withSpec(byKey.crowd, probeLock).reason === 'parent-locked',
    'v2850: [N3] 交通破坏不牵连层级守卫（逐锚敏感）');
  a(withSpec(byKey.lock, probeCrowd).reason === 'road-crowded',
    'v2850: [N3] 层级破坏不牵连交通面（逐锚敏感）');
  a(withSpec(byKey.lone, probeBasis).done === 2,
    'v2850: [N3] 协作破坏不牵连名单优先级（逐锚敏感）');
  a(withSpec(byKey.basis, probeLone).reason === 'unreciprocated',
    'v2850: [N3] 名单破坏不牵连协作对偶（逐锚敏感）');
  a(withSpec(byKey.rank, probeCrowd).reason === 'road-crowded',
    'v2850: [N3] 优先级表破坏不牵连世界织体（逐锚敏感）');
  // N4 非恒真：状态确实发生过变化
  const chg = isolated(function () {
    const WA = fresh();
    const W = WA.world;
    resetWorld(WA);
    W.addPlace({ name: TAG + '甲' });
    const p0 = places(WA).length;
    W.addPlace({ name: TAG + '乙', parent: TAG + '甲' });
    const p1 = places(WA).length;
    W.addRoad(TAG + '甲', TAG + '乙', 10);
    const rr = W.reach(TAG + '甲', TAG + '乙');
    return { p0: p0, p1: p1, reachable: rr.reachable, minutes: rr.minutes };
  });
  a(chg.p0 === 1 && chg.p1 === 2 && chg.reachable === true && chg.minutes === 10,
    'v2850: [N4] 状态确实变化过：登记道路后 10 分钟可达（实 ' + JSON.stringify(chg) + '）');
}
// ══════════════ 入口 ══════════════
function runAll(a) {
  isolated(function () { judgeWorld(a); });
  isolated(function () { judgeLife(a); });
  isolated(function () { judgeBudget(a); });
}
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2850: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2850: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative,
  probeCrowd: probeCrowd, probeLock: probeLock, probeCycle: probeCycle,
  probeLone: probeLone, probeRank: probeRank, probeBasis: probeBasis };