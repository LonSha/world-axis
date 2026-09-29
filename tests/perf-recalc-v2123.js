#!/usr/bin/env node
// WorldAxis tests/perf-recalc-v2123.js —— v2.123.0（优化计划 P3 + P4）
//
// 【它治的两类病：读数有数、却无处可挂 / 无可比】
//   P3（增量 / 局部重算观测）：
//     v2.88.0（O1）的成本账答「这一轮的时间花在谁身上」，它答不出「这轮有几个源是白跑的」。
//     「跳过」这个读数在库里此前**根本不存在** —— 全部源每轮重建，跳过与否无从判定。
//     P3 把它做出来：源面求差（`known − touched`）+ 世界**键级**脏键，落进 `lastInjection.recalc`。
//   P4（性能基准三档对照）：
//     `bench()` 与成本账都只给**单点**读数 ——「够快吗」没有参照系；而 `split()` 把本地引擎耗时
//     与宿主 API 耗时混在一个 `totalMs` 里（两类成本不同源）。P4 把四档并排、本地 / API 分列。
//
// 【四条口径（都是本仓反复付过价的）】
//   ① **观测不污染被观测者**：P3 **不**把 `perfTrace.partial()` 接进每轮注入链
//      （partial 一旦发现世界步进变了就重跑四个面，含重量级 `toolDiag.collect()`）；
//      P4 的 `dryRun` **不跑任何一档**（诊断节读它时传 `dryRun: true`）。
//      这与 v2.102.0「诊断是旁观者、不触发基准」逐字同源。
//   ② **读数取本档前后的差值，不是全局累计**：`_span` 是自装载以来的累计桶（跨档只增不减），
//      直接读它，第四档会把前三档跑过的量一起算进来 —— 看着有值、却没有归属。
//   ③ **无读数就如实说无读数**：宿主 API 未上报时 `apiReported:false` + `undeclared` 含 host，
//      **绝不拿 0ms 冒充「API 很快」**；`reuse` 面缺席时报 `reuseKind:'absent'`，
//      不拿空数组冒充「一次都没复用」。
//   ④ **不变式可复算**：`touched ∩ untouched = ∅` 且并集 = 源面（`known`）。
//      「声称跳过却仍重算」的落地形态正是这条被破坏。
//
// 【判据】
//   A 面 P3 结构：incrementalCost 在位 / 出自 PRIORITY 的源面 / untouched 求差 / reuse 缺则 absent
//                / worldDirtyKeys 与三条口径 / 采样点在 resetCost 之后 / 落盘字段 / explain 透传
//                / 不接 partial / 面板真消费方
//   B 面 P3 运行时：守恒 + 交集空 + 脏键真从世界变化取出来（改 1 个人物 ⇒ people）
//                + 跳过不算重算 + 观测不触发基准（partialCalls 不增）
//   C 面 P4 结构：bandCompare 在位 / 前后差值 / apiReported 取 after / dryRun 分支
//                / judgeable=!approx / 诊断与面板两处真消费方
//   D 面 P4 运行时：dryRun 不跑档且结构面恒定 / 四档并排 / 每档 split 键集合一致
//                / host 未上报如实 / 各档差值之和 ≤ 全局累计 / judgeable 与 approx 互补
//   N1–N6 负控制：真源码破坏 ⇒ 在**破坏副本**上重跑**同款**真判据（逐锚）
//
// 【一条不改的事（留档）】
//   本锁**不**断言任何具体毫秒值：墙钟读数随机器漂移。凡涉及耗时的判据一律只判**结构**
//   （项数 / 键集合 / 单调关系），与 `tests/perf-regression-gate.js` 的四条否定式口径同向。
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const BUDGET = 'engines/inject-budget.js', INJECT = 'render/inject.js', PERF = 'engines/perf-trace.js';
const DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + tag + ' :: ' + x.slice(0, 70)); return n; }
function intersect(x, y) { return x.filter(function (k) { return y.indexOf(k) >= 0; }); }

// ── 真源码破坏锚点（各须恰中 1 次）────────────────────────────────────
//   锚点选的**就是判据所依赖的那一行**。
const A_KNOWN = "    const known = Object.keys(PRIORITY);";
const A_UNTOUCHED = "    const untouched = known.filter(function (k) { return touched.indexOf(k) < 0; }).sort();";
const A_REUSEKIND = "      reuseKind: rv ? 'reported' : 'absent',";
const A_SKIP = "    const SKIP = { meta: 1, lastInjection: 1 };";
const A_DIRTYNOW = "      const dirtyNow = worldDirtyKeys();";
const A_RECALC_STORE = "recalc: recalc, budget: planInfo ? {";
const A_RECALC_EXPLAIN = "        recalc: li.recalc || null";
const A_BEFORE = "      const before = split();";
const A_AFTER = "      const after = split();";
const A_APIRPT = "          apiReported: !!after.declared.host,";
const A_DRYRUN = "      if (o.dryRun) {";
// 破坏形态：**条件置假 / 换实现**，不删行（删链首 if 会留下悬空 else ⇒ 破坏副本语法错，
//   「装不起来」证明不了判据敏感）。
const B_UNTOUCHED = "    const untouched = known.slice();";
const B_SKIP = "    const SKIP = {};";
const B_RECALC_STORE = "recalc: null, budget: planInfo ? {";
const B_RECALC_EXPLAIN = "        recalc: null";
const B_BEFORE = "      const before = { localMs: 0, hostMs: 0, serializeMs: 0, renderMs: 0 };";
const B_DRYRUN = "      if (false) {";

function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
/** 显式复位：各 section 共享宿主面，不重置就会读到前序残留（v2900 教训③） */
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.clock = { iso: '', label: '第1日', dayIndex: 0, source: 'unset' };
    d.background = { text: 'BG', updatedAt: 0 };
    d.people = {};
    d.events = [];
    d.lastInjection = null;
  }, 'perf-recalc-v2123:seed');
  WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, true); });
}
function runOnce(WA) {
  return WA.render.applyInjections({ injections: [{ source: '世界状态', content: '【世界状态】边界' }] });
}

function runAll(a) {
  const bs = src(BUDGET), is = src(INJECT), ps = src(PERF), dg = src(DIAG), pn = src(PANEL);
  const rcBlock = (function () {
    const i = is.indexOf('var recalc = (function () {');
    const j = is.indexOf('})();', i);
    return (i < 0 || j < 0) ? '' : is.slice(i, j + 5);
  })();

  // ─────────────── A 面：P3 结构 ───────────────
  {
    a(bs.indexOf('function incrementalCost(costs, opts) {') > 0, 'v2123: [A1] inject-budget 有 incrementalCost 定义');
    a(bs.indexOf('costOf, costView,\n    incrementalCost') > 0, 'v2123: [A1] 且真导出（导出了没人能调等于没做）');
    must1(bs, A_KNOWN, 'A2 known 取自 PRIORITY');
    a(bs.indexOf('WA.render.SOURCES') < 0 && bs.indexOf('render.SOURCES') < 0,
      'v2123: [A2] 源面取自本模块自己的 PRIORITY（不引 render 侧源表 —— 两张表各有各的面，硬同步即新造第二套真源）');
    must1(bs, A_UNTOUCHED, 'A3 untouched = 源面求差');
    a(bs.indexOf('coverage:') > 0 && bs.indexOf('unrecognized: unrecognized,') > 0,
      'v2123: [A3] 且不认识的名字单列 unrecognized（不静默并入 touched ⇒ 源面长表而本账不认识会被看见）');
    must1(bs, A_REUSEKIND, 'A4 reuse 缺则 absent');
    a(bs.indexOf("reuseKind: rv ? 'reported' : 'absent'") > 0 && bs.indexOf('note:') > 0,
      'v2123: [A4] 缺读数时报 absent 而不是空数组（「一次都没复用」与「没人报」是两件事）');

    a(is.indexOf('function worldDirtyKeys() {') > 0, 'v2123: [A5] render/inject.js 有 worldDirtyKeys 定义');
    must1(is, A_SKIP, 'A5 观测自身产物不算世界变脏');
    a(is.indexOf("timeline && WA.timeline.hashText") > 0 || is.indexOf('WA.timeline.hashText') > 0,
      'v2123: [A5] 复用 timeline.hashText（不新造第二份指纹实现 —— 两份实现迟早在边界字符上分叉）');
    a(is.indexOf("return { keys: [], kind: 'unchanged-rev', rev: rev };") > 0,
      'v2123: [A5] 世界步进未变则不重复采样（不把 68 个顶层键的序列化成本喂进它要观测的成本账）');
    a(is.indexOf("kind: prev ? 'diffed' : 'first'") > 0 && is.indexOf("keys.push('-' + k)") > 0,
      'v2123: [A5] 首轮如实报 first、删键以 -key 报出（不假装「什么都没改」）');
    must1(is, A_DIRTYNOW, 'A6 采样点在 applyInjections 里');
    a(is.indexOf('function resetCost()') > 0 && is.indexOf('function resetCost()') < is.indexOf(A_DIRTYNOW),
      'v2123: [A6] 且落在 resetCost() 之后（采样早于任何引擎调用，读到的才是本轮世界）');
    must1(is, A_RECALC_STORE, 'A7 落盘 recalc 字段');
    must1(is, A_RECALC_EXPLAIN, 'A7 解释面透传 recalc');
    a(rcBlock.length > 0 && rcBlock.indexOf('partial') < 0 && is.indexOf('WA.perfTrace.partial') < 0,
      'v2123: [A8] **观测不污染被观测者**：注入链里不调 perfTrace.partial()（调它=每轮重跑四个面含重量级诊断采集）');
    a(pn.indexOf('li.recalc') > 0 && pn.indexOf('rc.touchedCount') > 0 && pn.indexOf('rc.untouchedCount') > 0,
      'v2123: [A9] 面板是**真消费方**：逐字段读「重算 N 源 / 跳过 M 源」（不是「导出了没人看」）');
    a(pn.indexOf("rc.reuseKind === 'reported'") > 0 && pn.indexOf('缺席（须真跑四面的读数走「增量面」按钮') > 0,
      'v2123: [A9] 面板把「复用读数缺席」如实印出来（不静默留白、也不冒充复用）');
  }

  // ─────────────── B 面：P3 运行时 ───────────────
  {
    const W1 = fresh(); seed(W1);
    const p0 = W1.perfTrace.stat().partialCalls;
    runOnce(W1);
    const r1 = W1.store.get().lastInjection.recalc;
    a(!!r1, 'v2123: [B1] 一轮注入后 lastInjection.recalc 落盘（读不到就是「数算完扔掉」）');
    a(r1.knownCount === Object.keys(W1.injectBudget.PRIORITY).length && r1.knownCount > 0,
      'v2123: [B1] 源面 = PRIORITY 键数（实 ' + r1.knownCount + '）');
    a(r1.touchedCount + r1.untouchedCount === r1.knownCount,
      'v2123: [B1] 守恒：重算 ' + r1.touchedCount + ' + 跳过 ' + r1.untouchedCount + ' = 源面 ' + r1.knownCount);
    a(intersect(r1.touched, r1.untouched).length === 0,
      'v2123: [B1] 且交集为空（**「声称跳过却仍重算」的落地形态就是这条被破坏**）');
    a(r1.touched.every(function (k) { return r1.untouched.indexOf(k) < 0; }) && r1.coverage > 0,
      'v2123: [B1] touched 全部来自现场台账（覆盖率 ' + r1.coverage + '）');
    a(r1.reuseKind === 'absent' && (r1.reused || []).length === 0,
      'v2123: [B1] 复用面如实报缺（reuseKind=' + r1.reuseKind + '）—— 与「一次都没复用」不同形');
    a(r1.dirtyKind === 'first' && r1.dirtyKeys.length === 0,
      'v2123: [B1] 首轮脏键口径：kind=' + r1.dirtyKind + ' / 脏键 ' + r1.dirtyKeys.length + '（没有前值可比 ⇒ 不假装「全都没改」）');

    // 改 1 个人物 ⇒ 脏键真从世界变化里取出来
    W1.store.transact(function (d) { d.people.p1 = { name: '甲', location: '街' }; }, 'v2123:edit');
    runOnce(W1);
    const r2 = W1.store.get().lastInjection.recalc;
    a(r2.dirtyKind === 'diffed' && r2.dirtyKeys.indexOf('people') >= 0,
      'v2123: [B2] 改 1 个人物 ⇒ 报脏键 people（实 [' + r2.dirtyKeys.join(',') + ']，kind=' + r2.dirtyKind + '）');
    a(r2.dirtyKeys.indexOf('meta') < 0 && r2.dirtyKeys.indexOf('lastInjection') < 0,
      'v2123: [B2] 观测自身的产物（meta / lastInjection）不在脏集里（收进来会让脏集恒为全集）');
    a(r2.touchedCount + r2.untouchedCount === r2.knownCount && intersect(r2.touched, r2.untouched).length === 0,
      'v2123: [B2] 第二轮守恒与交集仍成立（重算 ' + r2.touchedCount + ' / 跳过 ' + r2.untouchedCount + '）');
    a(W1.perfTrace.stat().partialCalls === p0,
      'v2123: [B2] **观测不触发基准**：两轮注入后 partialCalls 未增（实 ' + W1.perfTrace.stat().partialCalls + '，起点 ' + p0 + '）');
    const ex = W1.render.explain();
    a(!!ex && !!ex.omniscient && ex.omniscient.recalc && ex.omniscient.recalc.touchedCount === r2.touchedCount,
      'v2123: [B2] 解释面与落盘账**同一批事实**（逐字段照抄，不在解释面再算一遍）');
  }

  // ─────────────── C 面：P4 结构 ───────────────
  {
    a(ps.indexOf('function bandCompare(opts) {') > 0, 'v2123: [C1] perf-trace 有 bandCompare 定义');
    a(ps.indexOf('bench: bench, benchAll: benchAll, bandCompare: bandCompare,') > 0,
      'v2123: [C1] 且真导出（导出了没人能调等于没做）');
    must1(ps, A_BEFORE, 'C2 档前取读数');
    must1(ps, A_AFTER, 'C2 档后取读数');
    a(ps.indexOf("const d = function (k) { return Math.round(((after[k] || 0) - (before[k] || 0)) * 100) / 100; };") > 0,
      'v2123: [C2] 报的是 after − before（`_span` 是累计桶，直接读会把前三档算进第四档 —— 看着有值却没有归属）');
    must1(ps, A_APIRPT, 'C3 apiReported 取 after');
    a(ps.indexOf("apiReported: !!sp.declared.host") > 0 && ps.indexOf("undeclared: sp.undeclared.slice()") > 0,
      'v2123: [C3] dryRun 结构面同样如实报 host 未上报（两种路径一套口径）');
    must1(ps, A_DRYRUN, 'C4 dryRun 分支');
    a(ps.indexOf('judgeable: judgeable') > 0 && ps.indexOf('const judgeable = !def.approx;') > 0,
      'v2123: [C4] judgeable = !approx（lowend 是同机放大估计，不参与判定）');
    a(ps.indexOf('classes: classes, bands: bands, minSamples: minSamples,') > 0
      && ps.indexOf('judgeableClasses:') > 0 && ps.indexOf('driftNote:') > 0,
      'v2123: [C4] 返回结构含档位 / 门槛 / 可判档位 / 漂移边界（漂移边界写进读数，不只在注释里）');
    a(dg.indexOf('bandCompare({ dryRun: true })') > 0,
      'v2123: [C5] 诊断节是**旁观**：读档位面时传 dryRun（看一眼体检不该等于跑一轮基准）');
    a(pn.indexOf("id=\"wa-perf-band\"") > 0 && pn.indexOf("const perfBand = $('#wa-perf-band');") > 0,
      'v2123: [C5] 面板是第二个真消费方：档位面按钮 + 处理函数（两边都在位）');
    a(pn.indexOf('b.split.apiReported ?') > 0 && pn.indexOf("'未上报'") > 0,
      'v2123: [C5] 面板把「宿主 API 未上报」印成未上报（不写成 0ms）');
  }

  // ─────────────── D 面：P4 运行时 ───────────────
  {
    const W2 = fresh(); seed(W2);
    const st0 = W2.perfTrace.stat();
    const dry = W2.perfTrace.bandCompare({ dryRun: true });
    const st1 = W2.perfTrace.stat();
    a(dry.dryRun === true && dry.classes.length === W2.perfTrace.CLASSES.length
      && dry.faces.length === W2.perfTrace.LAYERS.length && dry.splitKeys.length === W2.perfTrace.SPANS.length,
      'v2123: [D1] dryRun 结构项数恒定（档 ' + dry.classes.length + ' / 面 ' + dry.faces.length + ' / 分列 ' + dry.splitKeys.length + '）');
    a(dry.classes.every(function (C) { return dry.bands[C].ran === false && dry.bands[C].totalMs === null; }),
      'v2123: [D1] dryRun **不跑任何一档**（ran 全 false / totalMs 全 null —— 不编 0ms）');
    a(st0.recompute === st1.recompute && st0.reuse === st1.reuse,
      'v2123: [D1] 且没碰诊断计数（recompute/reuse 不变 ⇒ 结构面真的是纯结构）');
    a(dry.bands.lowend.judgeable === false && dry.bands.short.judgeable === true,
      'v2123: [D1] judgeable 逐档如实（lowend 是估计值，不参与判定）');

    const r = W2.perfTrace.bandCompare();
    const keys = Object.keys(r.bands[r.classes[0]].split).sort().join(',');
    a(r.classes.every(function (C) { return Object.keys(r.bands[C].split).sort().join(',') === keys; }),
      'v2123: [D2] 四档 split 键集合一致（' + keys + '）');
    a(r.classes.every(function (C) { return r.bands[C].ran === true && r.bands[C].faces === W2.perfTrace.LAYERS.length; }),
      'v2123: [D2] 四档都真跑且每档面数恒定（' + W2.perfTrace.LAYERS.length + ' 面）');
    a(r.classes.every(function (C) { return r.bands[C].split.apiReported === false
      && r.bands[C].split.undeclared.indexOf('host') >= 0; }),
      'v2123: [D2] 宿主 API 无上报时如实报（apiReported=false 且 undeclared 含 host —— 不拿 0ms 冒充「API 很快」）');
    const sumLocal = r.classes.reduce(function (acc, C) { return acc + r.bands[C].split.localMs; }, 0);
    const globLocal = W2.perfTrace.split().localMs;
    a(sumLocal <= globLocal + 0.01,
      'v2123: [D2] 各档差值之和（' + Math.round(sumLocal * 100) / 100 + '）≤ 全局累计（' + globLocal
        + '）—— 这条正是「读的是差值不是累计」的判据');
    a(r.judgeableClasses.length + r.approxClasses.length === r.classes.length
      && r.judgeableClasses.indexOf('lowend') < 0 && r.approxClasses.indexOf('lowend') >= 0,
      'v2123: [D2] 可判 / 估计两集互补且 lowend 只落在估计一侧');
    a(r.classes.every(function (C) { return typeof r.bands[C].minSamples === 'number' && r.bands[C].minSamples > 0
      && r.bands[C].samples && r.bands[C].samples.need === r.bands[C].minSamples; }),
      'v2123: [D2] 每档都带 minSamples 门槛与现场样本数（够不够判可复算）');
  }
}

function runNegative(a) {
  const bs = src(BUDGET), is = src(INJECT), ps = src(PERF), dg = src(DIAG);

  // N0 原版可比面：先记下未破坏时的真实读数
  const W0 = fresh(); seed(W0);
  runOnce(W0);
  const r0 = W0.store.get().lastInjection.recalc;
  a(r0.touchedCount + r0.untouchedCount === r0.knownCount && intersect(r0.touched, r0.untouched).length === 0,
    'v2123: [N0] 原版上守恒与交集都成立（重算 ' + r0.touchedCount + ' / 跳过 ' + r0.untouchedCount + '）—— 下面破坏才有的可比');
  W0.store.transact(function (d) { d.people.p1 = { name: '甲', location: '街' }; }, 'v2123:n0-edit');
  runOnce(W0);
  const dk0 = W0.store.get().lastInjection.recalc.dirtyKeys;
  a(dk0.indexOf('people') >= 0 && dk0.indexOf('meta') < 0 && dk0.indexOf('lastInjection') < 0,
    'v2123: [N0] 原版脏键是 [' + dk0.join(',') + ']（含 people、不含 meta/lastInjection）');
  const P0 = fresh(); seed(P0);
  const b0 = P0.perfTrace.bandCompare();
  const sum0 = b0.classes.reduce(function (acc, C) { return acc + b0.bands[C].split.localMs; }, 0);
  const glob0 = P0.perfTrace.split().localMs;
  a(sum0 <= glob0 + 0.01, 'v2123: [N0] 原版各档差值之和 ≤ 全局累计（' + Math.round(sum0 * 100) / 100 + ' ≤ ' + glob0 + '）');

  // N1：untouched 不再求差（拿源面冒充「跳过的」）⇒ 交集非空（B1 现形）
  const bb = bs.replace(A_UNTOUCHED, B_UNTOUCHED);
  a(bb !== bs, 'v2123: [N1] 破坏确实改写了源码（untouched 不再求差）');
  const Wb = fresh({ [BUDGET]: bb }); seed(Wb);
  runOnce(Wb);
  const rb = Wb.store.get().lastInjection.recalc;
  a(intersect(rb.touched, rb.untouched).length > 0,
    'v2123: [N1] 破坏后 B1 现形：重算与跳过**有交集**（' + intersect(rb.touched, rb.untouched).length
      + ' 个源同时被算作「重算过了」和「跳过了」—— 这条正是「声称跳过却仍重算」）');
  a(rb.untouchedCount === rb.knownCount && rb.touchedCount > 0,
    'v2123: [N1] 且跳过数涨到源面全量（' + rb.untouchedCount + '/' + rb.knownCount
      + '），而真算过的 ' + rb.touchedCount + ' 源被一起说成跳过了');

  // N2：抹掉观测自身产物的排除集 ⇒ 脏集恒为全集（B2 现形）
  const ib = is.replace(A_SKIP, B_SKIP);
  a(ib !== is, 'v2123: [N2] 破坏确实改写了源码（SKIP 集清空）');
  const Wi = fresh({ [INJECT]: ib }); seed(Wi);
  runOnce(Wi);
  Wi.store.transact(function (d) { d.people.p1 = { name: '甲', location: '街' }; }, 'v2123:n2-edit');
  runOnce(Wi);
  const dki = Wi.store.get().lastInjection.recalc.dirtyKeys;
  a(dki.indexOf('meta') >= 0 && dki.indexOf('lastInjection') >= 0,
    'v2123: [N2] 破坏后 B2 现形：脏键里出现观测自身的产物（实 [' + dki.join(',')
      + ']）—— 每轮必变的键被收进脏集，脏集就退化成「每轮都有东西脏」的固定读数');
  a(dki.length > dk0.length,
    'v2123: [N2] 且脏键数从 ' + dk0.length + ' 涨到 ' + dki.length + '（读者再也分不出「世界真改了 people」与「账自己动了」）');

  // N3：落盘点不写 recalc ⇒ 面板与解释面都读不到（B1 现形）
  const i2 = is.replace(A_RECALC_STORE, B_RECALC_STORE);
  a(i2 !== is, 'v2123: [N3] 破坏确实改写了源码（落盘 recalc 恒 null）');
  const W2 = fresh({ [INJECT]: i2 }); seed(W2);
  runOnce(W2);
  a(W2.store.get().lastInjection.recalc === null,
    'v2123: [N3] 破坏后 B1 现形：落盘账里 recalc 恒 null —— 引擎照算、账照留，但**读的人永远看不到**（本版要防的那种静默）');

  // N4：解释面不透传 ⇒ 两条账不再同源
  const i3 = is.replace(A_RECALC_EXPLAIN, B_RECALC_EXPLAIN);
  a(i3 !== is, 'v2123: [N4] 破坏确实改写了源码（解释面 recalc 恒 null）');
  const W3 = fresh({ [INJECT]: i3 }); seed(W3);
  runOnce(W3);
  const li3 = W3.store.get().lastInjection.recalc;
  const ex3 = W3.render.explain();
  a(!!li3 && li3.touchedCount > 0 && (!ex3.omniscient.recalc),
    'v2123: [N4] 破坏后现形：落盘账里躺着 ' + li3.touchedCount + ' 源的重算读数，而解释面报 null ——「解释面与存档同一批事实」这句在破坏面上直接失效');

  // N5：档读数退回全局累计 ⇒ 各档之和超过全局（D2 现形）
  const p2 = ps.replace(A_BEFORE, B_BEFORE);
  a(p2 !== ps, 'v2123: [N5] 破坏确实改写了源码（档前读数恒 0 ⇒ 变成读累计）');
  const P2 = fresh({ [PERF]: p2 }); seed(P2);
  const b2 = P2.perfTrace.bandCompare();
  const sum2 = b2.classes.reduce(function (acc, C) { return acc + b2.bands[C].split.localMs; }, 0);
  const glob2 = P2.perfTrace.split().localMs;
  a(sum2 > glob2 + 0.01,
    'v2123: [N5] 破坏后 D2 现形：各档之和 ' + Math.round(sum2 * 100) / 100 + ' > 全局累计 ' + glob2
      + ' —— 每档都把前三档跑过的量算进了自己头上（读数看着有值、却没有归属）');
  a(b2.bands.long.split.localMs >= b2.bands.short.split.localMs
    && b2.bands.lowend.split.localMs >= b2.bands.long.split.localMs,
    'v2123: [N5] 且四档读数单调递增（' + b2.classes.map(function (C) { return b2.bands[C].split.localMs; }).join(' ≤ ')
      + '）—— 它们读的其实是同一本累计账在不同时刻的快照，差值全部落进同一个桶');
  // N6：dryRun 分支置假 ⇒ 档位面照跑（C5 现形）
  //   **摘掉诊断节那条边再跑**：诊断包里的 `perfTrace` 节本身读 `bandCompare`，置假后就成了
  //   `bandCompare → bench → diagnose 面 → collect → secPerfTrace → bandCompare` 的**面级递归**
  //   （本轮独立探针实测：真调 `collect()` 时跑满 120s 不返回、RSS 一路涨）。这与 v2.111.0
  //   记在 `secPerfTrace` 上的陈旧性缺口**同根**：`collect()` 自己不记「正在采集」。
  //   摘掉那条边，是为了把「守卫失守 ⇒ 四档真跑」这一半**单独**证出来 —— 它正是 C5 要钉的。
  const p3 = ps.replace(A_DRYRUN, B_DRYRUN);
  a(p3 !== ps, 'v2123: [N6] 破坏确实改写了源码（dryRun 分支失效）');
  const dgNoBand = dg.replace('        band: WA.perfTrace.bandCompare({ dryRun: true }),\n', '');
  a(dgNoBand !== dg && dgNoBand.indexOf('WA.perfTrace.bandCompare') < 0,
    'v2123: [N6] 同时摘掉诊断节对档位面的读取（隔离上述递归回路，让本条只证守卫那一半）');
  const P3 = fresh({ [PERF]: p3, [DIAG]: dgNoBand }); seed(P3);
  const t0 = Date.now();
  const dry3 = P3.perfTrace.bandCompare({ dryRun: true });
  const el3 = Date.now() - t0;
  a(dry3.classes.every(function (C) { return dry3.bands[C].ran === true; }) && dry3.bands.long.totalMs !== null,
    'v2123: [N6] 破坏后 C5 现形：dryRun 也真跑了四档（ran 全 true / 长档 ' + dry3.bands.long.totalMs
      + 'ms）—— 诊断节从「旁观」变成「负载」');
  a(el3 < 30000, 'v2123: [N6] 且这条在 30s 内返回（实 ' + el3 + 'ms）—— 摘掉那条边之后不再递归');
  a(dg.indexOf('WA.perfTrace.bandCompare({ dryRun: true }),') > 0,
    'v2123: [N6] 而原版诊断节**确实**读档位面（实源码里那条边在位）—— 摘边只是隔离手段，不是「本来就没有」');
  // 对照必须用**最后一次 fresh 的引用**：`gate.fresh()` 与 run.js 复用同一个 vm 上下文，
  //   各模块 IIFE 每次装载都重写 `global.WorldAxis` 上的同名属性 —— 早先取的 WA 引用
  //   会**跟着变成最后装载的那份**（本仓「取引用不等于钉住快照」的同一家族）。
  const P0b = fresh(); seed(P0b);
  a(P0b.perfTrace.bandCompare({ dryRun: true }).bands.short.ran === false
    && P0b.perfTrace.bandCompare({ dryRun: true }).bands.lowend.totalMs === null,
    'v2123: [N6] 对照：原版上传 dryRun 时各档 ran=false / totalMs=null（守卫在位，档没跑）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); } catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('PERF-RECALC-V2123: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('PERF-RECALC-V2123: pass（' + pass + ' 项）');
}