#!/usr/bin/env node
// WorldAxis tests/cost-v2880.js —— v2.88.0（O1 注入成本实测与分档）
//
// 【它治的病：注入的「时间账」从来没被记过】
//   本仓库从 v0.9.3 起就报「注入用了多少 token、谁被折叠、谁被丢弃」，但**耗时**这一维
//   从未被测量：「注入慢在哪、慢在谁身上、这 30ms 花在哪类事上」在治理面上完全不可答。
//   45 个源的注入链里，任何一处慢函数（正则回溯、排序、深拷贝）都只能以「反正有点慢」
//   的模糊体感存在，没有数字可追。
//
// 【本版口径】
//   ① 计时落在 **engineCall** —— v2.86.0 建立的唯一引擎调用出口（46 处调用点全过它）。
//      在一处落表天然覆盖全部引擎源；换到 46 个调用点各写一遭，迟早会漏一个，而漏掉的那个
//      会以「0ms」的样子出现在账上，看不出是漏的。
//   ② 墙体时钟 clockWall（测量时间），与参与判定的 clockNow 分列 —— v2.15.0 的时间源纪律。
//   ③ 账本主键是**引擎真调用过的源**，不是「进了 items 的源」。产出空串是常事（世界没这块
//      数据），但「产出空」≠「不花时间」。旧形从 list 出发，实测空世界下 42 源有耗时、
//      账上只见 0 源 —— B1 就是钉住这件事的。
//   ④ 三态如实：真耗时 / 0ms（低于计时精度，另计 subTick）/ 非计量项（快照·工艺·内联·外部
//      注入，进 unmeasured 且**不计入 totalMs**）。绝不拿 0ms 冒充「很快」。
//   ⑤ 分档纯属解释面：**不参与任何判定**，不因慢而丢源（B13 钉住）。
//
// 【判据】（A 成类锁 / B 运行时 / C 缺陷锁 / D 自指 / N 负控制）
//   A1 PRIORITY 的每个源必须被 ACCOUNTS 盖住（漏登的源归「未归类」，那张表就只是装饰）。
//   A2 ACCOUNTS 每条都是「账户 + 角色」齐全的三元组，且条目数与源面数相等。
//   A3 账本主键取自**调用方交来的成本表**，不是注入项清单（本版修的真缺陷）。
//   A4 成本面只导出 costOf / costView，且两个都真有消费方。
//   A5 noteCost 在 engineCall 内恰有 1 个调用点，且落在 finally（异常路径同样计时）。
//   A6 观测面（engineCost / noteCost / costStat）不上 WA.render —— 理由同 v2.86.0 A3：
//      接口面一动就要付冻结串 + 账本的代价，观测面不该按那个价买。
//   B1 空世界也能量到耗时（修前此处是 0）。
//   B2 可见性全关 ⇒ 引擎没被调用 ⇒ 账上如实为 0（不是「快」，是「没干」）。
//   B3 非计量项如实进 unmeasured 且不进 measured。
//   B4 subTick 与「0ms 但真跑过」的源数一致。
//   B5 分档计数守恒：short + medium + long === measured。
//   B6 科目账守恒：各科目 measured 求和 === measured。
//   B7 真注入链上 unclassified 必须为空。
//   B8 lastInjection.budget.cost 落盘，且 totalMs 与引擎台账一致。
//   B9 诊断包有真消费：budget.cost 在场、injectCostTop 每行带档位。
//   B10 摘要含成本句；有耗时读数时不得出现「本轮无引擎调用」。
//   B11 measured === 0 时如实说「本轮无引擎调用」（不冒充很快）。
//   B12 costView 收两种入参（plan 结果 / 裸成本账），读数一致；null 给零值结构。
//   B13 分档不参与判定：有无成本账，裁决结果逐字相同（极慢源也不被丢）。
//   B14 抛异常的源照样进成本账（坏掉的那一块也花了时间，账要认）。
//   C1 SRC_NAME 与注入项 source 名逐一对齐（ledger 案例：同一个源两套名字，两本账对不上）。
//   C2 未注入过 / 成本面缺席时，诊断与预算账各自不炸。
//   D1 科目表注释回指本锁（表与会长的集合由门禁看住，不靠记性）。
//   N0 三个锚点在真源码各恰中 1 次；N1 破坏 ⇒ B1 / C1 现形；N2 影响面有限；
//      N3 非恒真；N4 锚点工具两向自证（不存在 / 不唯一都必须抛）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const BUDGET = path.join(BASE, 'engines/inject-budget.js');
const INJECT = path.join(BASE, 'render/inject.js');
const DIAG = path.join(BASE, 'engines/tool-diag.js');
const PANEL = path.join(BASE, 'ui/panel.js');
const NL = String.fromCharCode(10);
function src(p) { return fs.readFileSync(p, 'utf8'); }
function budgetSrc() { return src(BUDGET); }
const ANCHOR_MAIN = 'Object.keys(cs || {}).forEach(function (name) {';
const ANCHOR_SUB = 'const sub = (raw === 0 && runs > 0);';
const ANCHOR_NAME = "    ledger: '账本',";
const EXT = [{ source: '剧情约束', content: '一段外部约束文本' }];
/** 锚点命中计数，要求恰为 1（工具两向自证：不存在 / 不唯一都必须抛） */
function hits(s, anchor) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + anchor.slice(0, 60));
  return n;
}
/** 从一行里取紧跟在 marker 之后的那个单引号参数 */
function argOf(ln, marker) {
  const i = ln.indexOf(marker);
  if (i < 0) return null;
  // marker 自带的那个引号已经吃掉了，剩下的是**字符串内部**：直接找下一个引号即闭合引号。
  const rest = ln.slice(i + marker.length);
  const k = rest.indexOf("'");
  if (k < 0) return null;
  return rest.slice(0, k);
}
function fresh(opts) { return gate.fresh(opts || {}).WA; }
function setAll(WA, on) { (WA.render.SOURCES || []).forEach(function (k) { WA.render.setVisibility(k, !!on); }); }
/** 一次真实注入：留下 lastInjection（含 budget.cost）与引擎耗时台账 */
function inject(WA, injections) {
  setAll(WA, true);
  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: injections || [] });
  return WA.store.get().lastInjection;
}
function keys(srcText, from, to, re) {
  const out = [];
  srcText.slice(srcText.indexOf(from), srcText.indexOf(to, srcText.indexOf(from))).replace(re, function (all, k) { out.push(k); return all; });
  return out;
}
function runAll(a) {
  // ─────────────── A 面：成类锁（静态） ───────────────
  {
    const s = budgetSrc();
    const priKeys = keys(s, 'const PRIORITY = {', 'const DEFAULT_RANK', /'([^']+)': \{ rank/g);
    const accKeys = keys(s, 'const ACCOUNTS = {}', 'forEach(function (r) { ACCOUNTS', /'([^']+)', '[^']+', '[^']+'/g);
    const miss = priKeys.filter(function (k) { return accKeys.indexOf(k) < 0; });
    a(priKeys.length >= 45, 'v2880: [A1] 源面至少 45 条（实 ' + priKeys.length + '）——源面长了而表没跟上，本条会先现形');
    a(miss.length === 0, 'v2880: [A1] PRIORITY 的 ' + priKeys.length + ' 个源全部被科目表盖住（缺: ' + (miss.join('/') || '无') + '）');
    a(accKeys.length === priKeys.length, 'v2880: [A2] 科目表条目数等于源面数（实 ' + accKeys.length + ' vs ' + priKeys.length + '）——多登记或漏登都会现形');
    const empty = accKeys.filter(function (k) { return !k; });
    a(empty.length === 0, 'v2880: [A2] 每条都带真名（空名: ' + empty.length + '）');
    a(s.indexOf(ANCHOR_MAIN) >= 0, 'v2880: [A3] 账本主键取自调用方交来的成本表（旧形从注入项清单出发，本版修的真缺陷）');
    a(s.indexOf('unmeasuredCount: unmeasured.length') >= 0, 'v2880: [A3] 非计量项单独成账（unmeasuredCount）');
    a(s.indexOf('subTick: subTick') >= 0, 'v2880: [A3] 低于计时精度的源单独成账（subTick）');
    const ex = s.slice(s.indexOf('WA.injectBudget = {'));
    a(ex.indexOf('costOf, costView') >= 0, 'v2880: [A4] 成本面导出 costOf 与 costView');
    a(ex.indexOf('COST_BANDS,') < 0 && ex.indexOf('ACCOUNTS,') < 0 && ex.indexOf('UNCLASSIFIED,') < 0, 'v2880: [A4] COST_BANDS / ACCOUNTS / UNCLASSIFIED 不导出（实现细节而非承诺）');
    a(src(DIAG).indexOf('WA.injectBudget.costOf') >= 0, 'v2880: [A4] costOf 的真消费方在 tool-diag（给最慢源贴档位）');
    a(src(PANEL).indexOf('WA.injectBudget.costView') >= 0, 'v2880: [A4] costView 的真消费方在 ui/panel（本轮注入耗时段）');
    const is = src(INJECT);
    a(is.split('noteCost(ns, clockWall() - t0)').length - 1 === 1, 'v2880: [A5] noteCost 在 engineCall 内恰有 1 个调用点');
    a(is.indexOf('finally { noteCost(ns, clockWall() - t0); }') >= 0, 'v2880: [A5] 计时落在 finally——异常路径同样计时（坏掉的源也花了时间）');
    const WA = fresh();
    a(typeof WA.render.engineCost === 'undefined' && typeof WA.render.noteCost === 'undefined' && typeof WA.render.costStat === 'undefined', 'v2880: [A6] 耗时观测面不上 WA.render（同 v2.86.0 A3 口径）');
    a(typeof WA.render.visibilityStat().injectCost === 'object', 'v2880: [A6] 耗时台账经既有 visibilityStat() 出（零新成员）');
  }
  // ─────────────── B 面：运行时 ───────────────
  {
    const WA = fresh();
    // 先给世界落一点内容：空世界连快照都是空串，那样就看不到「非计量项」这一态。
    WA.store.transact(function (d) { d.clock = { label: '第一日' }; d.background = { text: '背景' }; });
    const li = inject(WA, EXT);
    const c = li && li.budget && li.budget.cost;
    a(!!c, 'v2880: [B1] 注入后成本账落进 lastInjection.budget.cost');
    a(c && c.measured >= 30, 'v2880: [B1] 空世界也能量到耗时（measured = ' + (c && c.measured) + '；修前此处为 0，因为账本只数进了 items 的源）');
    a(c && c.bands.short + c.bands.medium + c.bands.long === c.measured, 'v2880: [B5] 分档计数守恒（' + JSON.stringify(c && c.bands) + ' vs ' + (c && c.measured) + '）');
    const accMeas = c ? Object.keys(c.accounts).reduce(function (x, k) { return x + c.accounts[k].measured; }, 0) : -1;
    a(accMeas === (c && c.measured), 'v2880: [B6] 科目账守恒（各科目 measured 和 ' + accMeas + ' vs 总 ' + (c && c.measured) + '）');
    a(c && c.subTick > 0, 'v2880: [B4] 快引擎存在低于 1ms 的构造（subTick = ' + (c && c.subTick) + '）');
    // B3/B4 走纯函数：快照里的成本账刻意**不带 rows**（42 行每轮落盘要多掏几 KB），
    //   而 rows 的读者是诊断包那一份（injectCostTop 读的是实时台账）。
    const probe = WA.injectBudget.plan(
      [{ source: '世界状态', content: 'w'.repeat(20) }, { source: '记忆', content: 'm'.repeat(20) }],
      { budget: 100, costs: { '记忆': { ms: 0, n: 2 } } }).cost;
    const zeroRuns = probe.rows.filter(function (r) { return r.ms === 0 && r.runs > 0; }).length;
    a(zeroRuns === probe.subTick && probe.subTick === 1, 'v2880: [B4] subTick 与「0ms 但真跑过」的源数一致（' + zeroRuns + ' vs ' + probe.subTick + '）');
    a(probe.rows.filter(function (r) { return r.source === '记忆'; })[0].runs === 2, 'v2880: [B4] 账上带调用次数（n=2）——墙体时钟只精到 1ms，不记次数就分不出「没量到」与「很快」');
    a(c && c.unmeasured.length >= 1 && c.unmeasured.indexOf('世界状态') >= 0, 'v2880: [B3] 快照属于非计量项，如实进 unmeasured（实 [' + (c ? c.unmeasured.join('/') : '') + ']');
    a(probe.unmeasuredCount === 1 && probe.unmeasured[0] === '世界状态', 'v2880: [B3] 非计量项不进 measured（世界状态只出现在 unmeasured）');
    a(c && c.unclassified.length === 0, 'v2880: [B7] 真注入链上无未归类源（实 [' + (c ? c.unclassified.join('/') : '') + ']）');
    const v = WA.render.visibilityStat();
    const sum = Object.keys(v.injectCost).reduce(function (x, k) { return x + v.injectCost[k].ms; }, 0);
    a(Math.abs(sum - (c && c.totalMs)) < 0.01, 'v2880: [B8] 快照 totalMs 与引擎台账一致（' + (c && c.totalMs) + ' vs ' + Math.round(sum * 100) / 100 + '）');
    const diag = WA.toolDiag.collect();
    a(!!(diag.inject && diag.inject.budget && diag.inject.budget.cost), 'v2880: [B9] 诊断包真有成本账（budget.cost）——记了没人看就不算数');
    const top = (diag.inject && diag.inject.budget && diag.inject.budget.injectCostTop) || [];
    a(top.length > 0 && top.every(function (x) { return !!x.band; }), 'v2880: [B9] 最慢源每行带档位（档位贴到读数上才有人看）');
    const sm = WA.injectBudget.summaryText({ used: li.budget.used, budget: li.budget.cap, folded: li.budget.folded, dropped: li.budget.dropped, saved: li.budget.saved, cost: c });
    a(sm.indexOf('耗时') >= 0, 'v2880: [B10] 摘要含成本句（实「' + sm + '」）');
    a(sm.indexOf('本轮无引擎调用') < 0, 'v2880: [B10] 有耗时读数时不得报「无引擎调用」');
    const W2 = fresh();
    setAll(W2, false);
    global.__lastExtensionPrompt = null;
    W2.render.applyInjections({ injections: EXT });
    const c2 = W2.store.get().lastInjection.budget.cost;
    a(c2.measured === 0 && c2.unmeasuredCount === 1, 'v2880: [B2] 可见性全关 ⇒ 引擎未调用 ⇒ measured = 0（实 ' + c2.measured + '，非计量 ' + c2.unmeasuredCount + '）');
    const sm2 = W2.injectBudget.summaryText({ used: 1, budget: 100, folded: [], dropped: [], saved: 0, cost: c2 });
    a(sm2.indexOf('本轮无引擎调用') >= 0, 'v2880: [B11] measured = 0 时如实说「本轮无引擎调用」（实「' + sm2 + '」）——不冒充很快');
    const pv = W2.injectBudget.plan([{ source: '世界状态', content: 'x'.repeat(40) }], { budget: 100, costs: { '世界状态': { ms: 0, n: 1 } } });
    const v1 = W2.injectBudget.costView(pv);
    const v2 = W2.injectBudget.costView(pv.cost);
    a(v1.planned === true && v2.planned === true && v1.totalMs === v2.totalMs && v1.subTick === v2.subTick && v1.measured === v2.measured, 'v2880: [B12] costView 收计划对象与裸成本账两种入参，读数一致');
    a(W2.injectBudget.costView(null).planned === false && W2.injectBudget.costView(null).bands.short === 0, 'v2880: [B12] costView(null) 给零值结构而不是 null');
    const items = [{ source: '世界状态', content: 's'.repeat(200) }, { source: '舆情', content: 'o'.repeat(200) }, { source: '驯兽', content: 'b'.repeat(200) }];
    const pA = W2.injectBudget.plan(items, { budget: 260 });
    const pB = W2.injectBudget.plan(items, { budget: 260, costs: { '世界状态': { ms: 999, n: 1 }, '舆情': { ms: 999, n: 1 } } });
    const sig = function (p) { return [p.used, p.kept.length, p.folded.length, p.dropped.length, p.overBudget].join('/'); };
    a(sig(pA) === sig(pB), 'v2880: [B13] 分档不参与裁决：有无成本账，裁决结果逐字相同（' + sig(pA) + ' vs ' + sig(pB) + '）');
    a(pA.kept.concat(pA.folded).some(function (x) { return x.source === '世界状态'; }), 'v2880: [B13] 极慢源（999ms）也不因此被丢弃（不因慢而丢源）');
    const W3 = fresh();
    setAll(W3, true);
    const keepL = W3.ladder.buildBlock;
    W3.ladder.buildBlock = function () { throw new Error('__v2880_boom__'); };
    global.__lastExtensionPrompt = null;
    W3.render.applyInjections({ injections: EXT });
    W3.ladder.buildBlock = keepL;
    const c3 = W3.store.get().lastInjection.budget.cost;
    a(!!(W3.render.visibilityStat().injectCost['原型阶梯']), 'v2880: [B14] 抛异常的源照样进实时台账（' + JSON.stringify(W3.render.visibilityStat().injectCost['原型阶梯'] || null) + '）——计时落在 finally');
    a((c3.unmeasured || []).indexOf('原型阶梯') < 0 && c3.measured >= 30, 'v2880: [B14] 抛异常的源不被算作非计量项（它就是花时间了）');
    a(W3.render.visibilityStat().engineFaultTotal === 1, 'v2880: [B14] 故障台账仍然 +1（成本账不吞故障账）');
  }
  // ─────────────── C 面：缺陷锁（SRC_NAME 与注入项名对齐） ───────────────
  {
    const s = src(INJECT);
    const nameMap = {};
    const s0 = s.indexOf('const SRC_NAME = {');
    const s1 = s.indexOf('};', s0);
    //   注意：同一个键在表里出现两次时（memorySampler / pmem 都列为「主观记忆」），
    //   真值是**最后一条**（JS 对象字面量后者覆前者），故此处不能只取首次命中。
    s.slice(s0, s1).replace(/([A-Za-z0-9_$]+): '([^']+)'/g, function (all, k, v) { nameMap[k] = v; return all; });
    const pairs = [];
    s.split(NL).forEach(function (ln) {
      const ns = argOf(ln, "engineCall('");
      if (!ns) return;
      const so = argOf(ln, "source: '");
      if (so) pairs.push({ ns: ns, src: so });
    });
    a(pairs.length >= 42, 'v2880: [C1] 成对调用点为 ' + pairs.length + ' 个（≥42：与 v2.86.0 A1 的 guarded ≥ 42 同源）');
    const bad = pairs.filter(function (p) { return nameMap[p.ns] !== p.src; });
    a(bad.length === 0, 'v2880: [C1] SRC_NAME 与注入项 source 名逐一对齐（不一致: ' + (bad.map(function (p) { return p.ns + '=' + nameMap[p.ns] + '/' + p.src; }).join('、') || '无') + '）');
    a(s.indexOf(ANCHOR_NAME) >= 0, 'v2880: [C1] ledger 源两处同名（ledger: 账本）');
    a(s.indexOf("ledger: '重大事件账本'") < 0, 'v2880: [C1] 旧名「重大事件账本」已从 SRC_NAME 消失（同一个源两套名字，两本账就对不上）');
    a(src(PANEL).indexOf("ledger: '重大事件账本'") >= 0, 'v2880: [C1] 面板显示名不受影响（VIS_NAMES 仍给用户看「重大事件账本」）');
  }
  // ─────────────── C2 面：降级路径不炸 / D 面：自指 ───────────────
  {
    const W4 = fresh();
    const diag = W4.toolDiag.collect();
    a(!!diag.inject, 'v2880: [C2] 未注入过时诊断包不炸（inject 节在场）');
    const W6 = fresh();
    const li6 = inject(W6, EXT);
    a(!!(li6 && li6.budget && li6.budget.used >= 0), 'v2880: [C2] 成本是新字段不回退旧账（used/kept/folded/dropped 照旧）');
    const s = budgetSrc();
    a(s.indexOf('本表由 tests/cost-v2880.js 看着') >= 0 || s.indexOf('tests/cost-v2880.js') >= 0, 'v2880: [D1] 科目表注释回指本锁（表与会长的集合由门禁看住，不靠记性）');
    a(s.indexOf("const UNCLASSIFIED = '未归类'") >= 0, 'v2880: [D1] 未归类桶仍在（源面长了而表没跟上时它不是静默的）');
    let threw = 0;
    try { hits(s, '锚点根本不在源码里__xyz'); } catch (e) { threw++; }
    try { hits(s + ANCHOR_MAIN, ANCHOR_MAIN); } catch (e) { threw++; }
    a(threw === 2, 'v2880: [N4] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
    a(hits(s, ANCHOR_MAIN) === 1 && hits(s, ANCHOR_SUB) === 1, 'v2880: [N0] 两个账本锚点在真源码各恰中 1 次');
  }
}
/** 负控制：真源码破坏 → 在破坏副本上重跑**同款**判据 */
function runNegative(a) {
  const s = budgetSrc();
  hits(s, ANCHOR_MAIN);
  hits(s, ANCHOR_SUB);
  const okMeas = inject(fresh(), EXT).budget.cost.measured;
  // N1a：把账本主键从「调用方交来的成本表」退回「注入项清单」（旧形）
  const broken = s.replace(ANCHOR_MAIN, 'Object.keys(byList).forEach(function (name) {');
  a(broken !== s, 'v2880: [N1] 破坏确实改写了源码（账本主键退回注入项清单）');
  const ov = { 'engines/inject-budget.js': broken };
  const WAb = gate.fresh({ files: ['engines/inject-budget.js'], srcOverride: ov }).WA;
  const cb = inject(WAb, EXT).budget.cost;
  a(cb.measured < okMeas, 'v2880: [N1] 破坏后 B1 现形：空世界下账上只剩 ' + cb.measured + ' 源（原版 ' + okMeas + ' 源）——判据不是瞎的');
  a(cb.bands.short + cb.bands.medium + cb.bands.long === cb.measured, 'v2880: [N2] 影响面有限：分档计数守恒在破坏副本上仍成立');
  const WAb2 = gate.fresh({ files: ['engines/inject-budget.js'], srcOverride: ov }).WA;
  setAll(WAb2, false);
  WAb2.render.applyInjections({ injections: EXT });
  a(WAb2.store.get().lastInjection.budget.cost.measured === 0, 'v2880: [N2] 引擎未调用那条在破坏副本上仍为 0——逐锚敏感');
  a(WAb.injectBudget.costOf(20).band === 'long' && WAb.injectBudget.costOf(-1).band === 'short', 'v2880: [N2] 纯函数 costOf 在破坏副本上行为不变（破坏只打中账本主键）');
  // N1b：把旧名放回 SRC_NAME ⇒ C1 现形
  const inj = src(INJECT);
  const broken2 = inj.replace(ANCHOR_NAME, "    ledger: '重大事件账本',");
  a(broken2 !== inj, 'v2880: [N1] 破坏确实改写了注入链源码（把旧名放回去）');
  const WN = gate.fresh({ files: ['render/inject.js'], srcOverride: { 'render/inject.js': broken2 } }).WA;
  const liN = inject(WN, EXT);
  a(liN.budget.cost.unclassified.indexOf('重大事件账本') >= 0, 'v2880: [N1] 破坏后 C1 现形：旧名重新变成未归类源（实 [' + liN.budget.cost.unclassified.join('/') + ']）');
  // N3：非恒真——读数确实随事实变化
  const Woff = fresh();
  setAll(Woff, false);
  Woff.render.applyInjections({ injections: EXT });
  const offMeas = Woff.store.get().lastInjection.budget.cost.measured;
  a(okMeas > 0 && offMeas === 0 && cb.measured > 0 && cb.measured < okMeas, 'v2880: [N3] 非恒真：正常 ' + okMeas + ' / 引擎未调用 ' + offMeas + ' / 破坏 ' + cb.measured + '（读数确实随事实变化）');
}
module.exports = { runAll: require('./lock-assert.js').restoring(runAll), runNegative: require('./lock-assert.js').restoring(runNegative) };
