#!/usr/bin/env node
// WorldAxis tests/inject-value-v2150.js —— RP4 注入价值评估专锁（v2.150.0）
//
// 【它治的病】
//   P3（v2.123.0）与 RP1（v2.148.0）把「这一轮注入了什么、花掉多少预算、花了多久」三件事
//   都记上了账，但**没有一条读数回答「注进去的东西有没有被用上」**。于是
//   「预算花完了、正文里一个字都没提到」这种局面在诊断面上长得跟健康时一模一样：
//   预算读数满格、耗时读数正常、注入快照显示 landed。
//   本版补第四本账：把本轮**真落地**的注入项按源分组，拿源内容去本轮正文里做字面判定，
//   给出引用 / 采纳 / 连击三个读数，并在连续零引用时给出唯一的处置码 `value.zero-ref`。
//
// 【判据全部跑在真源码上】fresh 装载真 LOAD；破坏自证走 opts.srcOverride
//   （把真源码在内存副本上改坏，再重跑同款探针）。
//   注意：IV-13 / IV-14 / IV-15 读的是**磁盘源码**，srcOverride 不作用于它们，
//   故这三条不配假锚，由 run.js 的段断言与本节内的行为级锚点分担。
//
// 【正向判据】
//   IV-1  导出面六口齐全 + 默认设置（enabled 默认 **true**：纯只读评估，默认关会让读数恒空）。
//   IV-2  观察口：两源成表；同轮重复观察（再生/重步）计 reObserved。
//   IV-3  判定口：正文提到的源 distinct>0、未提到的为 0，settle 的 zeroRef 与之一致。
//   IV-4  **引用率 ≠ 采纳率**：正文念了源里的词（ref>0）但那些状态行一条都没被吸收（adopt=0）。
//   IV-5  **跨源通用片段不算数**：两源共有的片段命中 ⇒ ref=1 而 distinct=0。
//   IV-6  连续零引用阈值：第 2 轮不判（阈值真在生效）、第 3 轮判且带 code；中间引用一次即归零。
//   IV-7  **算不出来 ≠ 算出来是 0**：无数据时 rows 空但 ok=true 且带 note（不是错误）。
//   IV-8  拒答四态分开报：no-reading / stale-round（带 observed/current）/ disabled / text-too-short。
//   IV-9  轮次不符是**拒答**而不是「拿别的轮凑数」：轮次调回一致后同一个结算口恢复正常。
//   IV-10 有界：结算 30 轮 ⇒ 环停在 24、溢出 6 记 dropped、判定总数 30。
//   IV-11 写口真落盘：改阈值重读生效；表外值经 settingsBus.normalize 夹取进声明区间。
//   IV-12 **观测不污染被观测者**：自身耗时入的是性能台账（recorded 涨）。
//   IV-13 接线点：LOAD_ORDER 在 perf-ledger 之后、render/inject.js 之前；注入链的 observe 传 finalItems；
//         interceptor 的 settle **早于** after 链推进世界。
//   IV-14 诊断面：secInjectValue + collect 挂载 + MODULE_EXPORTS 登记，且该节只读 stat 不跑 report。
//   IV-15 面板面：四枚控件各渲染恰 1 次、全部登记进 UI_BINDINGS、都有 handler、且真消费写口。
//   IV-16 只读：observe / settle 前后世界状态逐字节不变（它不改世界）。
//
// 【负控制】N0 破坏锚点各恰中 1 次 + 副本非空转；N1 破坏后判据现形；N2 原版全绿（两向自证）；
//   N3 逐锚敏感（一个锚坏掉不把别的面的判据带偏）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');

// ── 破坏锚点：只在真源码里各出现一次，且破坏后**行为**可观测 ──
const BROKEN = [
  { key: 'common', rel: 'engines/inject-value.js',
    from: "    if (sourceCount > 1) Object.keys(df).forEach(function (f) { if (df[f] >= 2) common[f] = 1; });\n",
    to:   "    if (false) Object.keys(df).forEach(function (f) { if (df[f] >= 2) common[f] = 1; });\n" },
  { key: 'tokenface', rel: 'engines/inject-value.js',
    from: "      refDistinct++;             // 但**不计入 common**：英文专名天然特异，跨源同形不影响\n",
    to:   "      ref;             // 但**不计入 common**：英文专名天然特异，跨源同形不影响\n" },
  { key: 'harvest', rel: 'engines/inject-value.js',
    from: "      slot.frags = slot.frags.concat(fragmentsOf(content, cfg.maxKeys));\n",
    to:   "      slot.frags = slot.frags.concat([]);\n" },
  { key: 'streak', rel: 'engines/inject-value.js',
    from: "        a.zeroStreak = (j.refDistinct === 0) ? a.zeroStreak + 1 : 0;\n",
    to:   "        a.zeroStreak = (j.refDistinct === 0) ? a.zeroStreak + 1 : a.zeroStreak;\n" },
  { key: 'stale', rel: 'engines/inject-value.js',
    from: "    if (cur && _pending.round !== cur) {\n",
    to:   "    if (false) {\n" },
  { key: 'ring', rel: 'engines/inject-value.js',
    from: "    while (_rounds.length > CAP_ROUNDS) { _rounds.shift(); _stat.dropped = (_stat.dropped || 0) + 1; }\n",
    to:   "    while (false) { _rounds.shift(); _stat.dropped = (_stat.dropped || 0) + 1; }\n" },
  { key: 'perfsrc', rel: 'engines/inject-value.js',
    from: "WA.perfLedger.ingest({ '\\u6ce8\\u5165\\u4ef7\\u503c\\u8bc4\\u4f30': { ms: v, n: (n || 1) } });",
    to:   "WA.perfLedger.ingest({}, 0);" },
  { key: 'writeset', rel: 'engines/inject-value.js',
    from: "    setSettings: saveSettings\n",
    to:   "    setSettings: null\n" }
];

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts); }
function isolated(fn) {
  const LS = global.localStorage;
  const snap = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) snap[k] = LS.getItem(k); }
  try { return fn(); }
  finally {
    const drop = [];
    for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
    drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
    Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
  }
}

// ── 现场工具 ───────────────────────────────────────────────────────────
//   轮次唯一真源 = store.lastInjection.round（与 render/inject.js 的 roundNow 同源）。
function setRound(W, n) {
  let d = null;
  try { d = W.store.get(); } catch (e) {}
  if (!d) { try { W.store.transact(function (x) { x.lastInjection = { round: n }; }); d = W.store.get(); } catch (e) {} }
  if (d) d.lastInjection = Object.assign({}, d.lastInjection || {}, { round: n });
  return !!d;
}
function feed(W, round, items) { setRound(W, round); return W.injectValue.observe({ round: round, items: items }); }
function rowOf(W, name) {
  let out = null;
  W.injectValue.report().rows.forEach(function (r) { if (r.source === name) out = r; });
  return out;
}

// 夹具：两源共享一个片段（`北方大军压境`）；世界块另有英文专名（token 面）与 `盘踞城东`、`BloodHand`。
//   三条状态行**都含标点或空格**，故正文里不会整行出现 ⇒ adopt 恒 0（引用 ≠ 采纳）。
const SRC_W = '[世界]\n北方大军压境\nBloodHand 盘踞城东';
const SRC_F = '[仇敌]\n北方大军压境\n血手帮收了钱';
const PLAIN_W = '[世界]\n集市照常开';
const PLAIN_F = '[仇敌]\n血手帮盘踞城东';
const BODY = '大军压境的消息传开，BloodHand 的旗子升起。';
const BODY_COMMON = '北方大军压境的传闻，街上立刻安静了下来。';
const BODY_PLAIN = '集市照常开，人多，风大。';

// ══════════════ 探针 ══════════════
function probeBasics(W) {
  const iv = W.injectValue || {};
  const cfg = (typeof iv.getSettings === 'function') ? iv.getSettings() : {};
  const st = (typeof iv.stat === 'function') ? iv.stat() : {};
  return { keys: Object.keys(iv).sort(), enabled: cfg.enabled, zr: cfg.zeroRefRounds, mk: cfg.maxKeys,
    statKeys: Object.keys(st).sort(), capRounds: st.caps ? st.caps.rounds : null };
}

function probeEmpty(W) {
  const rep = W.injectValue.report();
  return { ok: rep.ok, rows: rep.rows.length, note: rep.note, flagged: rep.flagged.length };
}

function probeJudge(W) {
  const iv = W.injectValue;
  iv.setSettings({ zeroRefRounds: 3 });
  setRound(W, 1);
  const items = [{ source: '世界', content: SRC_W }, { source: '仇敌', content: SRC_F }];
  const ob = iv.observe({ round: 1, items: items });
  iv.observe({ round: 1, items: items });                      // 同轮重复观察
  const st = iv.settle(BODY);
  const w = rowOf(W, '世界') || {}, f = rowOf(W, '仇敌') || {};
  return { obOk: ob.ok, obSources: ob.sources, reObserved: iv.stat().reObserved,
    stOk: st.ok, stZero: st.zeroRef, rounds: iv.report().rounds,
    wRef: w.refAvg, wDistinct: w.refDistinctAvg, wAdopt: w.adoptAvg,
    fRef: f.refAvg, fDistinct: f.refDistinctAvg };
}

function probeCommon(W) {
  const iv = W.injectValue;
  iv.setSettings({ zeroRefRounds: 3 });
  feed(W, 1, [{ source: '世界', content: SRC_W }, { source: '仇敌', content: SRC_F }]);
  iv.settle(BODY_COMMON);
  const w = rowOf(W, '世界') || {}, f = rowOf(W, '仇敌') || {};
  return { wRef: w.refAvg, wDistinct: w.refDistinctAvg, fRef: f.refAvg, fDistinct: f.refDistinctAvg };
}

function probeStreak(W) {
  const iv = W.injectValue;
  iv.setSettings({ zeroRefRounds: 3 });
  const items = [{ source: '世界', content: PLAIN_W }, { source: '仇敌', content: PLAIN_F }];
  let flagAt2 = null;
  for (let r = 1; r <= 3; r++) {
    feed(W, r, items);
    iv.settle(BODY_PLAIN);
    if (r === 2) flagAt2 = iv.report().flagged.slice();
  }
  const rep3 = iv.report();
  const w3 = rowOf(W, '世界') || {}, f3 = rowOf(W, '仇敌') || {};
  feed(W, 4, items);
  iv.settle('血手帮盘踞城东，杀气很重。');                       // 引用一次 ⇒ 连击归零
  const f4 = rowOf(W, '仇敌') || {};
  return { flagAt2: flagAt2, flag3: rep3.flagged.slice(), code3: f3.code,
    w3Streak: w3.zeroStreak, f3Streak: f3.zeroStreak, f4Streak: f4.zeroStreak, flagged4: iv.report().flagged.slice() };
}

function probeRefuse(W) {
  const iv = W.injectValue;
  iv.setSettings({ enabled: true, zeroRefRounds: 3 });
  const noRead = iv.settle('这是一段足够长的正文。');           // 还没观察过
  feed(W, 5, [{ source: '世界', content: PLAIN_W }]);
  setRound(W, 9);                                              // 轮次被推进（世界已走到下一轮）
  const stale = iv.settle('这是一段足够长的正文。');
  setRound(W, 5);                                              // 调回一致
  const back = iv.settle(BODY_PLAIN);
  iv.setSettings({ enabled: false });
  const off = iv.observe({ round: 5, items: [{ source: '世界', content: PLAIN_W }] });
  const offSettle = iv.settle('这是一段足够长的正文。');
  iv.setSettings({ enabled: true });
  feed(W, 6, [{ source: '世界', content: PLAIN_W }]);
  const short = iv.settle('短');
  const st = iv.stat();
  return { noRead: noRead.reason, stale: stale.reason, staleObserved: stale.observed, staleCurrent: stale.current,
    backOk: back.ok, off: off.reason, offSettle: offSettle.reason, short: short.reason, shortLen: short.len,
    skip: st.skipReasons };
}

function probeRing(W) {
  const iv = W.injectValue;
  for (let r = 1; r <= 30; r++) {
    feed(W, r, [{ source: '世界', content: PLAIN_W }]);
    iv.settle(BODY_PLAIN);
  }
  const st = iv.stat();
  return { rounds: st.rounds, dropped: st.dropped, judged: st.judged, cap: st.caps.rounds };
}

function probeWrite(W) {
  const iv = W.injectValue;
  const has = typeof iv.setSettings === 'function' && iv.setSettings !== null;
  let a = null;
  if (has) { try { a = iv.setSettings({ zeroRefRounds: 5 }); } catch (e) { a = { err: String(e.message) }; } }
  const cfg1 = iv.getSettings().zeroRefRounds;
  if (has) { try { iv.setSettings({ zeroRefRounds: 999 }); } catch (e) {} }
  const cfg2 = iv.getSettings().zeroRefRounds;
  if (has) iv.setSettings({ zeroRefRounds: 3 });
  return { has: has, aOk: !!(a && a.ok === true), cfg1: cfg1, cfg2: cfg2 };
}

function probePerf(W) {
  const rec = function () { try { return W.perfLedger.stat().recorded; } catch (e) { return -1; } };
  const before = rec();
  feed(W, 1, [{ source: '世界', content: PLAIN_W }]);
  const after = rec();
  return { before: before, after: after, perfIngest: W.injectValue.stat().perfIngest };
}

function probeReadonly(W) {
  setRound(W, 1);
  const snap = JSON.stringify(W.store.get());
  W.injectValue.observe({ round: 1, items: [{ source: '世界', content: PLAIN_W }] });
  W.injectValue.settle(BODY_PLAIN);
  return { same: snap === JSON.stringify(W.store.get()) };
}

// 源头源码级断言（不受 srcOverride 影响）
function probeWiring() {
  const idx = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  const inj = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
  const ic = fs.readFileSync(path.join(BASE, 'core/interceptor.js'), 'utf8');
  const pIv = idx.indexOf("'engines/inject-value.js'");
  const pPerf = idx.indexOf("'engines/perf-ledger.js'");
  const pInj = idx.indexOf("'render/inject.js'");
  const pObs = inj.indexOf('WA.injectValue.observe({ round: roundNow, items: finalItems })');
  const pSettle = ic.indexOf('WA.injectValue.settle(tailMsg && tailMsg.mes)');
  const pAfter = ic.indexOf("await WA.workflow.run('after', actx)");
  return { loadOrdered: pIv > pPerf && pIv < pInj, observeWired: pObs > 0,
    settleWired: pSettle > 0, settleBeforeAfter: pSettle > 0 && pAfter > 0 && pSettle < pAfter };
}

function probeDiagPanel() {
  const td = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
  const pn = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  const ids = ['wa-iv-refresh', 'wa-iv-enabled', 'wa-iv-zero', 'wa-iv-max'];
  return { hasSec: td.indexOf('function secInjectValue()') > 0,
    hasCollect: td.indexOf('injectValue: secInjectValue()') > 0,
    hasExports: td.indexOf("'engines/inject-value.js': 'injectValue'") > 0,
    secReadsStatOnly: td.indexOf('const st = WA.injectValue.stat();') > 0 && td.indexOf('WA.injectValue.report(') < 0,
    registered: ids.filter(function (id) { return td.indexOf("'" + id + "'") > 0; }).length,
    rendered: ids.filter(function (id) { return (pn.split('id="' + id + '"').length - 1) === 1; }).length,
    bound: pn.indexOf("on('#wa-iv-refresh'") > 0 && pn.indexOf("$('#wa-iv-enabled')") > 0
      && pn.indexOf("$('#wa-iv-zero')") > 0 && pn.indexOf("$('#wa-iv-max')") > 0,
    usesWrite: pn.indexOf('WA.injectValue.setSettings') > 0 };
}

// ══════════════ 判据 ══════════════
function judge(a) {
  const envA = fresh();
  const WA = envA.WA;

  const bs = probeBasics(WA);
  a(bs.keys.join(',') === 'getSettings,observe,report,setSettings,settle,stat',
    'v2150: [IV-1] 导出面六口齐全且是闭集（实 ' + bs.keys.join(',') + '）');
  a(bs.enabled === true && bs.zr === 3 && bs.mk === 12,
    'v2150: [IV-1b] 默认设置：enabled 默认真（纯只读评估，默认关会让读数恒空）、阈值 3、片段上限 12（实 '
      + bs.enabled + '/' + bs.zr + '/' + bs.mk + '）');
  a(bs.statKeys.indexOf('skipReasons') >= 0 && bs.statKeys.indexOf('caps') >= 0 && bs.capRounds > 0,
    'v2150: [IV-1c] stat 带 skipReasons 归因表与 caps 上界（读数可归因、可判有界）');

  const em = probeEmpty(WA);
  a(em.ok === true && em.rows === 0 && em.flagged === 0 && typeof em.note === 'string' && em.note.length > 0,
    'v2150: [IV-7] 无数据时是**合法空读数**（ok=true、rows 空、带 note），不是错误也不是「都没用上」');

  const envB = fresh();
  const WB = envB.WA;
  const j = probeJudge(WB);
  a(j.obOk === true && j.obSources === 2,
    'v2150: [IV-2] 观察口：两源成表（实 ' + j.obSources + '）');
  a(j.reObserved === 1,
    'v2150: [IV-2b] 同轮重复观察（再生/重步）计 reObserved（实 ' + j.reObserved + '）');
  a(j.wRef === 2 && j.wDistinct === 2,
    'v2150: [IV-3] 正文提到的源：片段面与 token 面各命中一次（实 ref=' + j.wRef + '/' + j.wDistinct + '）');
  a(j.fDistinct === 0 && j.stZero === 1,
    'v2150: [IV-3b] 正文没提的源 distinct=0，settle 的 zeroRef 与之一致（实 ' + j.fDistinct + '/' + j.stZero + '）');
  a(j.wAdopt === 0 && j.wRef > 0,
    'v2150: [IV-4] 引用率 ≠ 采纳率：念了源里的词（ref=' + j.wRef + '）但那些状态行一条都没被吸收（adopt=' + j.wAdopt + '）');

  const envC = fresh();
  const cm = probeCommon(envC.WA);
  a(cm.wRef === 1 && cm.wDistinct === 0 && cm.fRef === 1 && cm.fDistinct === 0,
    'v2150: [IV-5] 跨源通用片段命中计入 ref、**不计入** distinct（两源都 ref=1 distinct=0；实 '
      + cm.wRef + '/' + cm.wDistinct + ' · ' + cm.fRef + '/' + cm.fDistinct + '）');

  // 连击判据另起环境：它数的是「最近连续几轮」的连续性，同环境里 probeJudge 已结算过
  //   一轮，基线被抬走（实测第 2 轮就读到连击 3 ⇒ 被误判成「阈值没生效」）。
  const envG = fresh();
  const sk = probeStreak(envG.WA);
  a(sk.flagAt2 && sk.flagAt2.length === 0,
    'v2150: [IV-6c] 阈值真在生效：2 轮零引用不判（实 flagged=' + JSON.stringify(sk.flagAt2) + '）');
  a(sk.flag3.length === 1 && sk.flag3[0] === '仇敌' && sk.code3 === 'value.zero-ref',
    'v2150: [IV-6] 3 轮连续零引用 ⇒ flagged 且带处置码（实 ' + JSON.stringify(sk.flag3) + '/' + sk.code3 + '）');
  a(sk.w3Streak === 0 && sk.f3Streak === 3,
    'v2150: [IV-6d] 被引用的源连击为 0、被忽略的源连击为 3（两源分开判；实 世界 ' + sk.w3Streak + ' / 仇敌 ' + sk.f3Streak + '）');
  a(sk.f4Streak === 0 && sk.flagged4.length === 0,
    'v2150: [IV-6b] 中间引用一次即归零：连击只认**最近连续**，不认累计（实 ' + sk.f4Streak + '）');

  const rf = probeRefuse(WB);
  a(rf.noRead === 'no-reading',
    'v2150: [IV-8a] 没观察过就结算 ⇒ no-reading（不拿上一轮凑数；实 ' + rf.noRead + '）');
  a(rf.stale === 'stale-round' && rf.staleObserved === 5 && rf.staleCurrent === 9,
    'v2150: [IV-8b] 轮次不符 ⇒ stale-round 且带 observed/current（实 ' + rf.stale + ' ' + rf.staleObserved + '→' + rf.staleCurrent + '）');
  a(rf.backOk === true,
    'v2150: [IV-9] 轮次调回一致后同一个结算口恢复正常（拒答是有条件的，不是坏了）');
  a(rf.off === 'disabled' && rf.offSettle === 'disabled',
    'v2150: [IV-8c] 总开关关闭 ⇒ 观察与结算都如实拒答 disabled（实 ' + rf.off + '/' + rf.offSettle + '）');
  a(rf.short === 'text-too-short' && rf.shortLen < 8,
    'v2150: [IV-8d] 过短正文 ⇒ text-too-short（说不出任何事；实 ' + rf.short + ' len=' + rf.shortLen + '）');
  a(rf.skip['no-reading'] >= 1 && rf.skip['stale-round'] >= 1 && rf.skip['text-too-short'] >= 1
    && rf.skip['disabled'] === 2 && Object.keys(rf.skip).length === 4,
    'v2150: [IV-8e] 四码分开归因，不合成一个「没算」（实 ' + JSON.stringify(rf.skip) + '）');

  const wr = probeWrite(WB);
  a(wr.has === true && wr.aOk === true && wr.cfg1 === 5,
    'v2150: [IV-11] 写口真落盘：改阈值后重读得到 5（实 has=' + wr.has + ' ok=' + wr.aOk + ' → ' + wr.cfg1 + '）');
  a(wr.cfg2 >= 1 && wr.cfg2 <= 20 && wr.cfg2 !== 999,
    'v2150: [IV-11b] 表外值经 settingsBus.normalize 夹取进声明区间（不是原样落盘；实 999 → ' + wr.cfg2 + '）');

  const envD = fresh();
  const ro = probeReadonly(envD.WA);
  a(ro.same === true,
    'v2150: [IV-16] observe / settle 前后世界状态逐字节不变（它不改世界）');
  // 有界判据另起一个环境：它数的是环长与溢出计数，同环境里先前跑过的探针会把基点抬走
  //   （实测共用环境时读到 31 次结算 ⇒ 溢出 7 —— 那不是产品不对，是基线没归零）。
  const envF = fresh();
  const rg = probeRing(envF.WA);
  a(rg.rounds === 24 && rg.dropped === 6 && rg.cap === 24 && rg.judged === 30,
    'v2150: [IV-10] 有界：结算 30 轮 ⇒ 环停在 24、溢出 6 记 dropped、判定总数 30（实 '
      + rg.rounds + '/' + rg.dropped + '/' + rg.judged + '）');

  const envE = fresh();
  const pf = probePerf(envE.WA);
  a(pf.after > pf.before && pf.perfIngest > 0,
    'v2150: [IV-12] 自身耗时入的是**性能台账**（recorded ' + pf.before + '→' + pf.after
      + '），不是本模块自己的账（perfIngest=' + pf.perfIngest + '）');

  const wi = probeWiring();
  a(wi.loadOrdered,
    'v2150: [IV-13a] index.js LOAD_ORDER：inject-value 在 perf-ledger 之后、render/inject.js 之前');
  a(wi.observeWired,
    'v2150: [IV-13b] render/inject.js 的观察口传的是 finalItems（真落地项，不是候选集）');
  a(wi.settleWired && wi.settleBeforeAfter,
    'v2150: [IV-13c] interceptor 的结算调用**早于** after 链推进世界（推进后 round 已 ++，比对必然全 stale）');

  const dp = probeDiagPanel();
  a(dp.hasSec && dp.hasCollect && dp.hasExports,
    'v2150: [IV-14] 诊断面三处到位：secInjectValue + collect 挂载 + MODULE_EXPORTS 登记');
  a(dp.secReadsStatOnly,
    'v2150: [IV-14b] 诊断节只读 stat、不跑 report（诊断面必须在任何面上留不下痕迹）');
  a(dp.registered === 4 && dp.rendered === 4,
    'v2150: [IV-15] 四枚控件既登记进 UI_BINDINGS 又各渲染恰 1 次（实 登记 ' + dp.registered + '/渲染 ' + dp.rendered + '）');
  a(dp.bound && dp.usesWrite,
    'v2150: [IV-15b] 四枚控件都有 handler，且面板真消费写口（只加控件不加 handler = 点了没反应）');
}

// ══════════════ 负控制 ══════════════
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  return { [spec.rel]: src.replace(spec.from, spec.to) };
}
function probeWith(spec, fn) {
  const env = fresh({ srcOverride: brokenOverride(spec) });
  return fn(env.WA, env.dom);
}
function probeClean(fn) {
  const env = fresh();
  return fn(env.WA, env.dom);
}

function runNegative(a) {
  const byKey = {};
  BROKEN.forEach(function (s) { byKey[s.key] = s; });

  // N0 破坏锚点恰中 1 次 + 副本非空转
  const bad = [];
  BROKEN.forEach(function (spec) {
    const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
    const hits = src.split(spec.from).length - 1;
    if (hits !== 1) bad.push(spec.key + '(' + hits + ')');
  });
  a(bad.length === 0, 'v2150: [N0] 八个破坏锚点在真源码中各恰中 1 次（异: ' + (bad.join(',') || '无') + '）');
  a(BROKEN.every(function (spec) {
    return brokenOverride(spec)[spec.rel] !== fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  }), 'v2150: [N0b] 八种破坏的内存副本都与真源码不同（非空转）');

  // N1 破坏后判据现形（每条都断言「原版真值」被破坏改变）
  const bCommon = probeWith(byKey.common, probeCommon);
  a(bCommon.wDistinct !== 0,
    'v2150: [N1a] 跨源通用判定被拆掉 ⇒ 通用片段被算成独有引用（distinct 由 0 变 ' + bCommon.wDistinct + '）');
  const bToken = probeWith(byKey.tokenface, probeJudge);
  a(bToken.wDistinct !== 2,
    'v2150: [N1b] token 面的 distinct 计数被摘掉 ⇒ 独有引用漏计（distinct 由 2 变 ' + bToken.wDistinct + '）');
  const bHarvest = probeWith(byKey.harvest, probeJudge);
  a(bHarvest.wDistinct !== 2 && bHarvest.obSources === 2,
    'v2150: [N1c] 片段抽取被短路 ⇒ 片段面归零、只剩 token 一条（distinct=' + bHarvest.wDistinct + ' 源数=' + bHarvest.obSources + '）');
  const bStreak = probeWith(byKey.streak, probeStreak);
  a(bStreak.f4Streak !== 0,
    'v2150: [N1d] 连击归零被拆掉 ⇒ 引用过一次也仍算「连续零引用」（实 ' + bStreak.f4Streak + '）');
  const bStale = probeWith(byKey.stale, probeRefuse);
  a(bStale.stale !== 'stale-round',
    'v2150: [N1e] 轮次比对被拆掉 ⇒ 轮次不符仍照算（拿别的轮的正文凑数；实 ' + bStale.stale + '）');
  const bRing = probeWith(byKey.ring, probeRing);
  a(bRing.rounds !== 24 && bRing.dropped === 0,
    'v2150: [N1f] 轮次环封顶被拆掉 ⇒ 读数无界增长（实 rounds=' + bRing.rounds + ' dropped=' + bRing.dropped + '）');
  const bPerf = probeWith(byKey.perfsrc, probePerf);
  a(!(bPerf.after > bPerf.before),
    'v2150: [N1g] 自身耗时不再入性能台账 ⇒ 观测开销对台账不可见（recorded ' + bPerf.before + '→' + bPerf.after + '）');
  const bWrite = probeWith(byKey.writeset, probeWrite);
  a(bWrite.has === false || bWrite.cfg1 !== 5,
    'v2150: [N1h] 导出面把写口摘掉 ⇒ 面板三枚控件点了没反应（实 has=' + bWrite.has + ' cfg=' + bWrite.cfg1 + '）');

  // N2 原版两向自证（同款判据在真源码上必须真）
  const cJ = probeClean(probeJudge);
  a(cJ.wDistinct === 2 && cJ.wAdopt === 0 && cJ.obSources === 2 && cJ.wRef === 2,
    'v2150: [N2a] 原版源码上判定三读数（ref / distinct / adopt）全绿');
  const cC = probeClean(probeCommon);
  a(cC.wDistinct === 0 && cC.fDistinct === 0 && cC.wRef === 1,
    'v2150: [N2b] 原版源码上通用片段排除判据全绿');
  const cS = probeClean(probeStreak);
  a(cS.flag3.length === 1 && cS.f4Streak === 0 && cS.flagAt2.length === 0,
    'v2150: [N2c] 原版源码上阈值与连击判据全绿');
  const cR = probeClean(probeRefuse);
  a(cR.noRead === 'no-reading' && cR.stale === 'stale-round' && cR.short === 'text-too-short' && cR.backOk === true,
    'v2150: [N2d] 原版源码上四态拒答与恢复判据全绿');
  const cW = probeClean(probeWrite);
  a(cW.cfg1 === 5 && cW.cfg2 <= 20 && cW.has === true,
    'v2150: [N2e] 原版源码上写口与区间夹取判据全绿');
  const cRing = probeClean(probeRing);
  a(cRing.rounds === 24 && cRing.dropped === 6 && cRing.judged === 30,
    'v2150: [N2f] 原版源码上环封顶判据全绿');
  const cPf = probeClean(probePerf);
  a(cPf.after > cPf.before && cPf.perfIngest > 0,
    'v2150: [N2g] 原版源码上性能入账判据全绿');

  // N3 逐锚敏感：一个锚坏掉不把别的面的判据带偏
  const x1 = probeWith(byKey.common, probeStreak);
  a(x1.flag3.length === 1 && x1.f4Streak === 0,
    'v2150: [N3a] common 破坏不影响阈值与连击判据（逐锚敏感）');
  const x2 = probeWith(byKey.streak, probeJudge);
  a(x2.wDistinct === 2 && x2.wAdopt === 0,
    'v2150: [N3b] streak 破坏不影响三读数判据（逐锚敏感）');
  const x3 = probeWith(byKey.ring, probeRefuse);
  a(x3.stale === 'stale-round' && x3.short === 'text-too-short' && x3.backOk === true,
    'v2150: [N3c] ring 破坏不影响拒答判据（逐锚敏感）');
  const x4 = probeWith(byKey.stale, probeJudge);
  a(x4.obSources === 2 && x4.wDistinct === 2,
    'v2150: [N3d] stale 破坏不影响观察与判定判据（逐锚敏感）');
  // harvest 破坏会把所有源的片段面清空 ⇒ 所有源都成零引用，阈值面必然跟着变
  //   （这是真耦合，不是「别的面被带偏」）。故逐锚敏感换到不受片段面影响的拒答面。
  const x5 = probeWith(byKey.harvest, probeRefuse);
  a(x5.stale === 'stale-round' && x5.short === 'text-too-short' && x5.noRead === 'no-reading',
    'v2150: [N3e] harvest 破坏不影响拒答判据（逐锚敏感）');
  const x6 = probeWith(byKey.writeset, probeRing);
  a(x6.rounds === 24,
    'v2150: [N3f] writeset 破坏不影响有界判据（逐锚敏感）');
  const x7 = probeWith(byKey.perfsrc, probeCommon);
  a(x7.wDistinct === 0,
    'v2150: [N3g] perfsrc 破坏不影响通用片段排除判据（逐锚敏感）');
}

function runAll(a) { isolated(function () { judge(a); }); }

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('INJECT-VALUE-V2150: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('INJECT-VALUE-V2150: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, brokenOverride: brokenOverride };