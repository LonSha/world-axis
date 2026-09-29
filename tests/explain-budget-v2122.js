#!/usr/bin/env node
// WorldAxis tests/explain-budget-v2122.js —— v2.122.0（优化计划 P2：每轮执行解释下到「预算折叠 / 丢弃」层）
//
// 【它治的病：只报「几条被挤掉」，答不出「谁挤掉了谁」】
//   预算裁决是**顺序**发生的：pinned 先跑，optional 按 rank 升序填充，每一项判的时候
//   `used` 已经累计了前序占位。而 `plan()` 的旧账只留**结果**（`reason` = pinned_over_budget /
//   over_budget / no_budget / not_foldable / folded_too_small），留不下**过程**。于是
//   「这个源为什么没进正文」在解释面上只有两个干瘪的计数：折叠 N 条、丢弃 N 条。
//   同时被折叠 / 丢弃的源在七态归因里落到 `no-content` 一档 —— 与「本轮确实没内容」
//   这个**正常态**在存档上同形。两件事合并 = 「玩家看到『这源没了』却不知是被折叠还是丢弃」。
//
// 【本版口径】三条
//   ① **事后归因，不在分支上长记账点**（v2.56.0 教训）：占位账记在 `plan()` 的裁决循环里，
//      源表增长不需要谁记得去补一行；47 条注入分支**一条都没碰**。
//   ② **裁决当场记，事后不重算**：`remainAt`（裁决当时的余量）与 `blockedBy`（裁决当时
//      已占预算的项）都是**重算不出来**的事实 —— 重算要重跑 `plan()`，而输入内容不留档。
//   ③ **纯观测**：不改变任何裁决结果。故恒等式 `remainAt + ΣblockedBy.tokens = cap`
//      恒成立（pinned 保底可把预算挤爆 ⇒ 余量照实为负，钳到 0 就是把它说成「刚好用完」）。
//
// 【边界照实说（本版刻意不假装更强）】
//   · `blockedBy` 记的是**裁决顺序上的占位者**，不是「谁该负责」：预算裁决没有因果归属，
//     只有先后。报出来的是一份可复算的现场，不是一句归罪。
//   · 预算丢弃的项**不会**出现在 `landedNames` 里 ⇒ 它的归因码仍是「没进」那一类；
//     预算账把它细化为「被丢弃」（两条账各答各的问题，本文件把这句话写成断言）。
//   · 本版**不改** `decisions` 的宽度与 `state` 的封闭集合：新增字段是附加位，不是新状态。
//   · UI 只有无头静态核验（面板真读明细），未做浏览器实机联调。
//
// 【首跑两处失败的记录：一处是判据写错，一处是**真缺口**】
//   ① 判据写错（对账层级）：预算账**按源归拢**（`budgetBySource` 的键是源名），而同名折叠
//      可以有多条 —— 本文件的两条折叠都叫「世界状态」。首跑按「记录条数」对账去比
//      「带归因位的源数」，必然对不上。正确口径是**按源去重**后再比。这与 v2.47.0 的
//      「source 不唯一，按名索引会串味」是同族坑的另一面：归拢面按源、明细面按记录，
//      两者都不许拿去替对方对账。
//   ② **真缺口（本版当场补掉）**：`decisions` 的每一行对应 `SOURCES` 里的一个**源键**，
//      而注入面还有不在源表内的**块名** —— 「世界状态」是六个快照源合成的一块
//      （`items.push({ source: '世界状态', ... })`），恰好是 pinned 里最常被折的那一个。
//      实测：预算账里躺着 2 条「世界状态」折叠，而 `decisions` 上**没有一行**能挂它
//      ⇒ 最要紧的那条折叠在解释面上凭空消失，只剩一个「折叠 2」的计数。
//      修法不是往 `decisions` 里塞行（那会破坏宽度判据，v2910 的 [B4] 钉着它），
//      而是单列一处 `unmappedDetail`：按源提问的路走不通，就走块级的路。B6 钉这件事，
//      N1d 证它**非恒真**（破坏后折叠照样发生，只是又变得不可见）。
//
// 【判据】（A 结构 / B 运行时 / C 不变式 / N 负控制）
//   A1 三段落点都在：`plan()` 的占位账、`sourceDecisions` 的第四参、`explain()` 的明细切片。
//   A2 面板是**真消费方**（逐字段读，不是「导出了没人看」）；玩家分支一处不碰。
//   B1 触发折叠 + 丢弃后，每条记录都带 `remainAt` / `blockedBy`，且 `reason` 分类正确。
//   B2 `decisions` 逐源带上 `budgetOutcome`；未受裁决的源是 `null`（不是空对象，也不是漏字段）。
//   B3 「哪条挤掉了哪条」可逐项说出：占位者有序、可复算，且首条裁决时占位为空。
//   B4 `explain()` 的明细切片与落盘预算账**同一批事实**（整表切片，不是第二份实现）。
//   B5 未触发折叠 / 丢弃时不撒谎：逐源归因位全空，且没有明细。
//   B6 **块级出口**：不在源表内的块名（「世界状态」）被折叠时，仍能在解释面上逐项查到，
//      且与源表内的记录不重复计算。
//   C1 不变式：恒等式在每一条折叠 / 丢弃记录上成立（含余量为负的那条）。
//   C2 不变式：`decisions` 宽度不变、逐源键集 = {budgetOutcome,key,name,state}（附加位，不是新状态）。
//   N0 四个真源码锚点各恰中 1 次；N1a 污染占位账 ⇒ B3 现形；N1b 抹掉归因位 ⇒ B2 现形；
//      N1c 抹掉明细切片 ⇒ B4 现形；N1d 抹掉块级出口 ⇒ B6 现形；N2 影响面有限；N3 非恒真；
//      N4 锚点工具两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const BUDGET = path.join(BASE, 'engines/inject-budget.js');
const INJECT = path.join(BASE, 'render/inject.js');
const PANEL = path.join(BASE, 'ui/panel.js');
function src(p) { return fs.readFileSync(p, 'utf8'); }
function budgetSrc() { return src(BUDGET); }
function injectSrc() { return src(INJECT); }
// ── 三个真源码破坏锚点（各须恰中 1 次）──
//   锚点选的是**判据所依赖的那一行**：
//     · 占位快照的映射行 —— 「裁决当场拷一份」这条口径的落点（返回活引用 ⇒ 历史被后续占位污染）；
//     · 归因位的返回行 —— 「逐源说出预算去向」的落点；
//     · 明细切片行 —— 「解释面与落盘账同一批事实」的落点。
const ANCHOR_OCC = "      return occupied.map(function (o) { return { source: o.source, tokens: o.tokens }; });";
const ANCHOR_OUTCOME = "      return { key: k, name: name, state: st, budgetOutcome: (budget && budget[name]) || null };";
const ANCHOR_DETAIL = 'foldedDetail: (b.folded || []).slice(), droppedDetail: (b.dropped || []).slice(),';
const ANCHOR_UNMAPPED = "            return pick(b.folded, 'folded').concat(pick(b.dropped, 'dropped'));";
// 破坏形态：**条件置假 / 换实现**，不删行（v2900 教训⑤：删链首 if 会留下悬空 else ⇒ 破坏副本语法错，
//   「装不起来」证明不了判据敏感）。
const BREAK_OCC = "      return occupied;";
const BREAK_OUTCOME = "      return { key: k, name: name, state: st, budgetOutcome: null };";
const BREAK_DETAIL = 'foldedDetail: [], droppedDetail: [],';
const BREAK_UNMAPPED = '            return [];';
/** 锚点命中计数，要求恰为 1（工具两向自证：不存在 / 不唯一都必须抛） */
function hits(s, anchor) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + anchor.slice(0, 60));
  return n;
}
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
/** 造一条**注定超预算**的候选：CJK 逐字计 token，故 n 个汉字 ≈ n token（可复算，不是估的） */
function BIG(tag, n) { return '【' + tag + '】' + '字'.repeat(n); }
/** 显式复位：run.js 的各 section 共享宿主面（同一个 localStorage），不重置就会读到前序残留 */
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.clock = { iso: '', label: '第1日', dayIndex: 0, source: 'unset' };
    d.background = { text: 'BG', updatedAt: 0 };
    d.people = {};
    d.evolution = d.evolution || {};
    d.evolution.round = 3;
    d.evolution.factions = [];        // 派系库存会经 org 真落地 ⇒ 让「无内容」的对照源不再无内容
    d.memory = d.memory || {};
    d.memory.foreshadows = [];
    d.lastInjection = null;           // 不赌环境干净（v2900 教训③）
  }, 'explain-budget-v2122:seed');
  WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, true); });
}
/** 80t 预算 + 两条超长候选：`世界状态` 是 pinned（rank 2，不可折叠）⇒ 必折叠；`舆情` rank 8 ⇒ 必丢弃 */
function stress(WA, budget) {
  const BK = WA.backstage.getSettings().injectBudget;
  WA.backstage.setSettings({ injectBudget: (typeof budget === 'number' ? budget : 80) });
  WA.render.applyInjections({
    injections: [
      { source: '世界状态', content: BIG('世界状态', 300) },
      { source: '舆情', content: BIG('舆情', 300) }
    ].map(function (i) { return Object.assign({}, i); })
  });
  return {
    restore: function () { WA.backstage.setSettings({ injectBudget: (typeof BK === 'number' ? BK : 2400) }); },
    li: WA.store.get().lastInjection
  };
}
function decOf(ex, key) {
  return ex.omniscient.decisions.filter(function (x) { return x.key === key; })[0] || null;
}
/** 恒等式：裁决当时的余量 + 已占位者之和 = 预算（对某条折叠 / 丢弃记录） */
function occupiedSum(rec) {
  return (rec.blockedBy || []).reduce(function (a, x) { return a + (x.tokens || 0); }, 0);
}

function runAll(a) {
  const bs = budgetSrc(), is = injectSrc(), ps = src(PANEL);
  // ─────────────── A 面：结构 ───────────────
  {
    // A1 三段落点
    a(bs.indexOf('const occupied = [];') >= 0 && bs.indexOf('const occSnap = function () {') >= 0,
      'v2122: [A1] plan() 里立了占位账（裁决过程中顺带记，事后推不出来）');
    a(hits(bs, ANCHOR_OCC) === 1, 'v2122: [A1] 占位快照是**拷贝**（返回活引用会让历史占位被后续裁决污染）');
    a(bs.indexOf('remainAt: budget - used, blockedBy: occSnap()') >= 0
      && bs.indexOf('remainAt: remain, blockedBy: occSnap()') >= 0,
      'v2122: [A1] 四个裁决落点都记 remainAt / blockedBy（折叠与丢弃两条路径都在）');
    a(is.indexOf('function sourceDecisions(vis, landedNames, failNames, budgetBySource)') >= 0,
      'v2122: [A1] sourceDecisions 收第四参（按源归拢的预算去向）——不改 47 条注入分支');
    a(hits(is, ANCHOR_OUTCOME) === 1, 'v2122: [A1] 逐源返回项带 budgetOutcome（附加位：不动 state 封闭集合）');
    a(is.indexOf("const decisions = sourceDecisions(vis, landedNames, engineFailuresView(), budgetBySource);") >= 0,
      'v2122: [A1] 归拢结果真喂进 decisions（不是算完丢掉）');
    a(hits(is, ANCHOR_DETAIL) === 1, 'v2122: [A1] explain() 的明细切片在位（全知面才有：玩家面不列未落地项名）');
    a(bs.indexOf('const occupied = [];') > bs.indexOf('const kept = [], folded = [], dropped = [];'),
      'v2122: [A1] 占位账立在裁决循环**之前**（立晚了会漏首条占位者）');
    // A2 真消费方
    a(ps.indexOf('om.budget.foldedDetail') >= 0 && ps.indexOf('om.budget.droppedDetail') >= 0,
      'v2122: [A2] 面板是**真消费方**：逐字段读 foldedDetail / droppedDetail（不是「导出了没人看」）');
    a(ps.indexOf('裁决时余量') >= 0 && ps.indexOf('被占：') >= 0,
      'v2122: [A2] 面板把余量与占位者**都印出来**（只印一个是答半句）');
    a(ps.indexOf("lines.push('  · [折叠] '") >= 0 && ps.indexOf("lines.push('  · [丢弃] '") >= 0,
      'v2122: [A2] 折叠与丢弃分列两行（两种去向不合并成一句）');
    a(ps.indexOf('const occText = function (arr)') >= 0 && ps.indexOf("if (!arr || !arr.length) return '无占位';") >= 0,
      'v2122: [A2] 无占位者时如实说「无占位」（不静默留白）');
    // 玩家分支一处不碰：v2900 的 [B11] 钉着这两处字符串
    a(ps.indexOf('const p = ex.player') >= 0 && ps.indexOf('p.summary') >= 0,
      'v2122: [A2] 玩家面分支未被波及（本版明细只进全知面）');
  }

  // ─────────────── B 面：运行时 ───────────────
  {
    // B1 折叠 / 丢弃记录带全字段
    const W1 = fresh(); seed(W1);
    const st1 = stress(W1);
    const b1 = st1.li.budget;
    a(!!b1 && b1.overBudget === true && b1.used > b1.cap,
      'v2122: [B1] 压出超预算局面（used ' + (b1 && b1.used) + ' > cap ' + (b1 && b1.cap) + '）——判据不是空跑');
    a(b1.folded.length >= 2 && b1.dropped.length === 1 && b1.dropped[0].source === '舆情',
      'v2122: [B1] 折叠 ' + b1.folded.length + ' 条 / 丢弃 ' + b1.dropped.length + ' 条（实丢弃 '
        + (b1.dropped[0] && b1.dropped[0].source) + '）——两种去向都真发生了');
    a(b1.folded.every(function (f) { return typeof f.remainAt === 'number' && Array.isArray(f.blockedBy) && f.reason; })
      && b1.dropped.every(function (x) { return typeof x.remainAt === 'number' && Array.isArray(x.blockedBy) && x.reason; }),
      'v2122: [B1] 每条记录都带 remainAt / blockedBy / reason（三样缺一，解释面就只剩半句）');
    a(b1.folded[0].reason === 'pinned_over_budget' && b1.dropped[0].reason === 'no_budget',
      'v2122: [B1] 拒收因如实分类（pinned 保底折 ' + b1.folded[0].reason + ' / 可折叠源无预算丢 ' + b1.dropped[0].reason + '）');
    a(b1.dropped[0].remainAt < 0,
      'v2122: [B1] pinned 保底把预算挤爆 ⇒ 余量照实为负（实 ' + b1.dropped[0].remainAt + '）——钳到 0 就是把它说成「刚好用完」');
    st1.restore();

    // B2 decisions 逐源带 budgetOutcome
    const ex1 = W1.render.explain();
    const op = decOf(ex1, 'opinion'), ck = decOf(ex1, 'clock');
    a(!!op && !!op.budgetOutcome && op.budgetOutcome.dropped.length === 1
      && op.budgetOutcome.folded.length === 0,
      'v2122: [B2] 被丢弃的源在 decisions 上带出预算去向（舆情：丢弃 ' + (op && op.budgetOutcome && op.budgetOutcome.dropped.length) + ' 条）');
    a(!!op && op.budgetOutcome.dropped[0].reason === 'no_budget' && op.budgetOutcome.dropped[0].remainAt < 0,
      'v2122: [B2] 且带上拒收因与裁决时余量（reason=' + (op && op.budgetOutcome.dropped[0].reason)
        + ' / remainAt=' + (op && op.budgetOutcome.dropped[0].remainAt) + '）——解释面这才答得出「是被丢弃」');
    a(!!ck && ck.budgetOutcome === null,
      'v2122: [B2] 未受裁决的源是 null（不是空对象、也不是漏字段——「没被裁决」与「裁决了但没事」是两件事）');
    a(ex1.omniscient.decisions.filter(function (d) { return !!d.budgetOutcome; })
      .every(function (d) { return b1.folded.concat(b1.dropped).map(function (r) { return r.source; }).indexOf(d.name) >= 0; })
      && ex1.omniscient.decisions.filter(function (d) { return !!d.budgetOutcome; }).length >= 1,
      'v2122: [B2] 带归因位的源**都真在预算账里**（实 '
        + ex1.omniscient.decisions.filter(function (d) { return !!d.budgetOutcome; }).map(function (d) { return d.name; }).join(',')
        + '）——判断依据是这个子集关系，不是拿归拢面的源数去比明细面的记录数');
    a(!!op && op.state !== 'landed' && op.state !== 'landed-in-state',
      'v2122: [B2] 预算丢弃的项不会进 landedNames ⇒ 归因码仍是「没进」那一类（实 ' + (op && op.state) + '）；'
        + '预算账把它细化为「被丢弃」——两条账各答各的问题');

    // B3 「哪条挤掉了哪条」可逐项说出
    a(b1.folded[0].blockedBy.length === 0,
      'v2122: [B3] 首条裁决时占位为空（它谁也没挤——如实报空，而不是编一个占位者）');
    const lastF = b1.folded[b1.folded.length - 1];
    a(lastF.blockedBy.length === b1.folded.length - 1 && lastF.blockedBy[0].tokens === b1.folded[0].to,
      'v2122: [B3] 后一条折叠的占位者是前序折叠项、且记的是**折叠后**的 tokens（'
        + lastF.blockedBy.map(function (x) { return x.source + ':' + x.tokens; }).join('/') + '）');
    a(b1.dropped[0].blockedBy.length === b1.folded.length,
      'v2122: [B3] 被丢弃项能逐个数出「预算正被谁占着」（' + b1.dropped[0].blockedBy.length + ' 项）——'
        + '这就是「哪条挤掉了哪条」在解释面上的落点');
    a(b1.dropped[0].blockedBy.every(function (x) { return typeof x.source === 'string' && typeof x.tokens === 'number'; }),
      'v2122: [B3] 占位者自带源名与 token 数（只报个数等于把可修的线索丢了）');
    a(b1.dropped[0].blockedBy.map(function (x) { return x.tokens; }).join(',')
      === b1.folded.map(function (f) { return f.to; }).join(','),
      'v2122: [B3] 占位序列与折叠序一致（有序，不是一堆无序数字）');

    // B4 explain 明细与落盘账同一批事实
    a(ex1.omniscient.budget.foldedDetail.length === b1.folded.length
      && ex1.omniscient.budget.foldedDetail[0].remainAt === b1.folded[0].remainAt,
      'v2122: [B4] explain 的 foldedDetail 与落盘预算账**同源**（整表切片，不是第二份实现）');
    a(ex1.omniscient.budget.droppedDetail.length === b1.dropped.length
      && ex1.omniscient.budget.droppedDetail[0].tokens === b1.dropped[0].tokens,
      'v2122: [B4] droppedDetail 同上（丢了几条、每条多少 token 都对得上）');

    // B5 未触发折叠时不撒谎。两种「没折叠」要分开说，否则判据会踩在自己写错的前提上：
    //   ① `injectBudget: 0` = **不裁决**（`applyInjections` 的 `budget !== 0` 守卫）⇒ 连账都不该有；
    //   ② 预算充裕 = **裁决了，但没裁掉任何东西** ⇒ 账在场、逐项归因位为空。
    //   首跑把两者当成一件事（断言 budget.unmappedDetail 存在）⇒ 空指针。读数随事实变化，
    //   判据的前提也必须跟着事实分岔。
    const W2 = fresh(); seed(W2);
    const st2 = stress(W2, 0);
    a(!st2.li.budget,
      'v2122: [B5] 预算 0 = 不裁决 ⇒ 连账都不写（不是写一份空账冒充「裁决过」）');
    st2.restore();
    const W3 = fresh(); seed(W3);
    const st3 = stress(W3, 100000);
    const ex3 = W3.render.explain();
    a(!!st3.li.budget && st3.li.budget.folded.length === 0 && st3.li.budget.dropped.length === 0,
      'v2122: [B5] 预算充裕 ⇒ 账在场但零折叠零丢弃（读数随事实变化，不是恒报一个值）');
    a(ex3.omniscient.decisions.every(function (d) { return !d.budgetOutcome; }),
      'v2122: [B5] 且逐源 budgetOutcome 全为 null（裁决过而没裁掉谁，就不编一份明细）');
    a((ex3.omniscient.budget.unmappedDetail || []).length === 0,
      'v2122: [B5] 块级出口同样为空（无裁决时不留一个永远为空的摆设）');
    st3.restore();

    // B6 块级出口：不在源表内的块名也要能逐项查到
    const bg = ex1.omniscient.budget;
    const unm = bg.unmappedDetail || [];
    a(unm.length === b1.folded.length,
      'v2122: [B6] 块级出口报出 ' + unm.length + ' 条（= 该块被折叠的 ' + b1.folded.length
        + ' 条）——「世界状态」不在源表内，`decisions` 上挂不上它');
    a(unm.every(function (x) { return x.source === '世界状态' && x.kind === 'folded'; }),
      'v2122: [B6] 每条的块名与去向如实（' + unm.map(function (x) { return x.kind + ':' + x.source; }).join('/') + '）');
    a(unm[0].remainAt === b1.folded[0].remainAt && unm[0].from === b1.folded[0].from && unm[0].to === b1.folded[0].to,
      'v2122: [B6] 块级条目带全「裁决时余量 + 折叠前后」，与落盘账逐项对得上（不是只报个名）');
    a(unm.reduce(function (n, x) { return n + (x.blockedBy || []).length; }, 0) === 1,
      'v2122: [B6] 且占位者一并带出（两条合计 ' + unm.reduce(function (n, x) { return n + (x.blockedBy || []).length; }, 0)
        + ' 项——后折的那条是被前一条占掉的）');
    const srcNames = W1.render.SOURCES.map(function (k) { return decOf(ex1, k); }).filter(Boolean).map(function (d) { return d.name; });
    a(unm.every(function (x) { return srcNames.indexOf(x.source) < 0; }),
      'v2122: [B6] 与源表内的记录**不重复计算**（块级出口只收挂不上源键的，源表内的一律走 budgetOutcome）');
  }

  // ─────────────── C 面：不变式 ───────────────
  {
    const W = fresh(); seed(W);
    const st = stress(W);
    const b = st.li.budget;
    // C1 恒等式
    const eqF = b.folded.every(function (f) { return f.remainAt + occupiedSum(f) === b.cap; });
    const eqD = b.dropped.every(function (x) { return x.remainAt + occupiedSum(x) === b.cap; });
    a(eqF && eqD, 'v2122: [C1] 恒等式在每条记录上成立：remainAt + ΣblockedBy.tokens = cap（'
      + b.cap + '）——观测不改变裁决，这条式子就是证据');
    a(b.dropped.every(function (x) { return x.remainAt + occupiedSum(x) === b.cap; }),
      'v2122: [C1] 含余量为负的那条也成立（' + b.dropped[0].remainAt + ' + ' + occupiedSum(b.dropped[0])
        + ' = ' + b.cap + '）——「追不回来」的账一样对得上');
    // C2 宽度与键集
    const ex = W.render.explain();
    a(ex.omniscient.decisions.length === W.render.SOURCES.length,
      'v2122: [C2] decisions 宽度不变（' + ex.omniscient.decisions.length + ' / 源面 '
        + W.render.SOURCES.length + '）——新字段是附加位，不是新状态');
    a(ex.omniscient.decisions.every(function (d) { return Object.keys(d).sort().join(',') === 'budgetOutcome,key,name,state'; }),
      'v2122: [C2] 逐源键集 = {budgetOutcome,key,name,state}（v2900 的结构判据只查前三者为字符串 ⇒ 附加位合法）');
    // C2 收尾：折叠项**仍算保留**（pinned 保底不静默丢弃）。判据取**关系**而不是具体数：
    //   kept 里既有折叠后留下的项、也有没被裁决的项，故「kept ≥ 折叠数」是其下限；
    //   上限是「折叠 + 丢弃 + 保留 = 计划到的项数」，两边一起夹，等值断言才不是巧合。
    a(b.keptCount >= b.folded.length,
      'v2122: [C2] 折叠项仍算「保留」（保留 ' + b.keptCount + ' ≥ 折叠 ' + b.folded.length
        + '）——pinned 保底不静默丢弃，判定语义没被观测面改写');
    // 「被丢的项不会复活」要真判：拿同一批输入直接跑引擎，查三面 id 是否互不相交。
    //   写「kept ≤ 折叠 + 丢弃 + kept」那种夹法是**恒真式**——本仓库明令禁止用恒真式充判据。
    const p3 = W.injectBudget.plan([
      { source: '世界状态', content: BIG('世界状态', 300) },
      { source: '舆情', content: BIG('舆情', 300) }
    ], { budget: 80 });
    const foldedIds = p3.folded.map(function (f) { return f.id; });
    const droppedIds = p3.dropped.map(function (x) { return x.id; });
    const keptIds = p3.kept.map(function (k) { return k.id; });
    a(droppedIds.length === 1 && keptIds.indexOf(droppedIds[0]) < 0 && foldedIds.indexOf(droppedIds[0]) < 0,
      'v2122: [C2] 三面按**输入位置 id** 互不相交：被丢弃的那一项不在 kept 也不在 folded（实 id '
        + droppedIds.join(',') + '）——观测字段没让被丢的项复活');
    a(foldedIds.length >= 1 && foldedIds.every(function (id) { return keptIds.indexOf(id) >= 0; }),
      'v2122: [C2] 折叠项同时**留在 kept**（' + foldedIds.join(',') + ' ⊆ kept）——折叠 = 缩短保留，不是隐性丢弃');
    st.restore();
  }

  // ─────────────── N 面 ───────────────
  {
    a(hits(budgetSrc(), ANCHOR_OCC) === 1 && hits(injectSrc(), ANCHOR_OUTCOME) === 1
      && hits(injectSrc(), ANCHOR_DETAIL) === 1 && hits(injectSrc(), ANCHOR_UNMAPPED) === 1,
      'v2122: [N0] 四个真源码锚点各恰中 1 次（inject-budget×1 / inject×3）');
    let threw = 0;
    try { hits(budgetSrc(), '锚点根本不在源码里__v2122'); } catch (e) { threw++; }
    try { hits(budgetSrc() + ANCHOR_OCC, ANCHOR_OCC); } catch (e) { threw++; }
    a(threw === 2, 'v2122: [N4] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
  }
}

/** 负控制：真源码破坏 → **装上破坏副本** → 在副本上重跑与正面判据**同款**的断言 */
function runNegative(a) {
  const bs = budgetSrc(), is = injectSrc();
  hits(bs, ANCHOR_OCC); hits(is, ANCHOR_OUTCOME); hits(is, ANCHOR_DETAIL);
  // N3：非恒真——原版上两条读数都能取到真值（不是靠「什么都不做」才成立）
  const W0 = fresh(); seed(W0);
  const st0 = stress(W0);
  const b0 = st0.li.budget;
  a(b0.folded.length >= 2 && b0.dropped.length === 1,
    'v2122: [N3] 原版上折叠 / 丢弃都真发生（' + b0.folded.length + ' / ' + b0.dropped.length + '）——下面破坏才有的可比');
  const lastTrue = b0.folded[b0.folded.length - 1].blockedBy.length;
  a(lastTrue === b0.folded.length - 1,
    'v2122: [N3] 原版上末条折叠的占位数是 ' + lastTrue + '（裁决**当场**的快照）');
  st0.restore();

  // N1a：占位快照返回**活引用**（不拷贝）⇒ 历史占位被后续裁决污染（B3 现形）
  const bb = bs.replace(ANCHOR_OCC, BREAK_OCC);
  a(bb !== bs, 'v2122: [N1a] 破坏确实改写了源码（占位快照返回活引用）');
  const Wb = fresh({ 'engines/inject-budget.js': bb }); seed(Wb);
  const stB = stress(Wb);
  const bB = stB.li.budget;
  a(bB.folded[bB.folded.length - 1].blockedBy.length === bB.folded.length,
    'v2122: [N1a] 破坏后 B3 现形：末条折叠的占位账涨到 ' + bB.folded[bB.folded.length - 1].blockedBy.length
      + '（原版 ' + lastTrue + '）——它「挤掉」了自己');
  a(bB.folded[0].blockedBy.length > 0,
    'v2122: [N1a] 且首条裁决也凭空多出占位者（实 ' + bB.folded[0].blockedBy.length
      + ' 项）——「它谁也没挤」这句真话被抹掉了');
  a(bB.folded.every(function (f) { return f.remainAt + occupiedSum(f) !== bB.cap; }),
    'v2122: [N1a] 恒等式随之破裂（' + bB.folded.map(function (f) { return f.remainAt + '+' + occupiedSum(f); }).join(' / ')
      + ' ≠ ' + bB.cap + '）——「事后可复算」正是本版要保住的东西');
  // N2：影响面有限——错的是**观测面**，裁决面（折叠 / 丢弃的判决）逐项不变
  a(bB.folded.length === b0.folded.length && bB.dropped.length === b0.dropped.length
    && bB.folded.map(function (f) { return f.reason + ':' + f.from + '->' + f.to; }).join('|')
      === b0.folded.map(function (f) { return f.reason + ':' + f.from + '->' + f.to; }).join('|')
    && bB.used === b0.used,
    'v2122: [N2] 影响面有限：破坏观测面不改裁决结果（used ' + bB.used + ' / 判决逐项一致）——'
      + '纯观测这条口径的落点');
  a(bB.dropped[0].reason === b0.dropped[0].reason && bB.dropped[0].remainAt === b0.dropped[0].remainAt,
    'v2122: [N2] 丢弃项的拒收因与裁决时余量也不受影响（观测与裁决是两条独立可证的面）');
  stB.restore();

  // N1b：把归因位置空 ⇒ 逐源预算去向全丢（B2 现形）
  const ib = is.replace(ANCHOR_OUTCOME, BREAK_OUTCOME);
  a(ib !== is, 'v2122: [N1b] 破坏确实改写了源码（归因位恒 null）');
  const Wi = fresh({ 'render/inject.js': ib }); seed(Wi);
  const stI = stress(Wi);
  const exI = Wi.render.explain();
  a(exI.omniscient.decisions.every(function (d) { return d.budgetOutcome === null; }),
    'v2122: [N1b] 破坏后 B2 现形：逐源 budgetOutcome 全为 null（实带值 '
      + exI.omniscient.decisions.filter(function (d) { return !!d.budgetOutcome; }).length + ' 项）');
  a(stI.li.budget.dropped.length === 1 && exI.omniscient.budget.droppedDetail.length === 1,
    'v2122: [N1b] 而落盘账与明细切片仍在（丢弃 ' + stI.li.budget.dropped.length
      + ' 条）——「按源提问」这条路被切断，正是本版要防的那种静默');
  stI.restore();

  // N1c：抹掉 explain() 的明细切片 ⇒ 解释面说「没有明细」而存档里有（B4 现形）
  const id = is.replace(ANCHOR_DETAIL, BREAK_DETAIL);
  a(id !== is, 'v2122: [N1c] 破坏确实改写了源码（明细切片返回空表）');
  const Wd = fresh({ 'render/inject.js': id }); seed(Wd);
  const stD = stress(Wd);
  const exD = Wd.render.explain();
  a(exD.omniscient.budget.foldedDetail.length === 0 && stD.li.budget.folded.length >= 2,
    'v2122: [N1c] 破坏后 B4 现形：解释面报 0 条明细，而存档里躺着 ' + stD.li.budget.folded.length
      + ' 条——「两条账同源」这句在破坏面上直接失效');
  a(exD.omniscient.budget.folded === stD.li.budget.folded.length,
    'v2122: [N1c] 对照：计数仍在（' + exD.omniscient.budget.folded
      + '）——计数在、明细没了，读的人会以为「没什么可看的」');
  stD.restore();

  // N1d：抹掉**块级出口** ⇒ 不在源表内的块名又变得不可见（B6 现形）
  //   这一条同时证 B6 **非恒真**：破坏版里折叠照样发生（落盘账里躺着 2 条），
  //   只是「世界状态」这块又挂不上任何一行 —— 与补丁前的老状态同形。
  const iu = is.replace(ANCHOR_UNMAPPED, BREAK_UNMAPPED);
  a(iu !== is, 'v2122: [N1d] 破坏确实改写了源码（块级出口返回空表）');
  const Wu = fresh({ 'render/inject.js': iu }); seed(Wu);
  const stU = stress(Wu);
  const exU = Wu.render.explain();
  a((exU.omniscient.budget.unmappedDetail || []).length === 0,
    'v2122: [N1d] 破坏后 B6 现形：块级出口报 0 条（实 '
      + (exU.omniscient.budget.unmappedDetail || []).length + '）');
  a(stU.li.budget.folded.length === 2 && exU.omniscient.budget.folded === 2
    && exU.omniscient.budget.foldedDetail.length === 2,
    'v2122: [N1d] 而折叠照样发生（落盘 ' + stU.li.budget.folded.length + ' 条 / 计数 '
      + exU.omniscient.budget.folded + ' / 明细 ' + exU.omniscient.budget.foldedDetail.length
      + '）——「2 条折叠」这条计数下面没有任何一行能落名，正是本版要治的那种静默');
  a(exU.omniscient.decisions.filter(function (d) { return !!d.budgetOutcome; })
      .every(function (d) { return d.name !== '世界状态'; })
      && exU.omniscient.decisions.every(function (d) { return !d.budgetOutcome || d.name === '舆情'; }),
      'v2122: [N1d] 且能挂上归因位的只有被丢弃的「舆情」——`decisions` 里根本没有「世界状态」那一行'
        + '（块名不在源表内）⇒ 那 2 条 pinned 折叠**只**能靠块级出口落名');
  a(exU.omniscient.budget.unmappedDetail.length === 0 && exU.omniscient.budget.folded === 2,
    'v2122: [N1d] 破坏后：计数说「折叠 2」而块级出口报 0 —— 最要紧的那条折叠（pinned 保底折的'
      + '「世界状态」）在解释面上彻底消失');
  stU.restore();
}
module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); } catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('EXPLAIN-BUDGET-V2122: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('EXPLAIN-BUDGET-V2122: pass（' + pass + ' 项）');
}
