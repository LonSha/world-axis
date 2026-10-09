#!/usr/bin/env node
// WorldAxis tests/perf-tape-v2148.js —— RP1+RP2 双引擎锁（v2.148.0）
//
// 【它治的病】perf-trace 自 v2.102.0 有基准与档位，但「这局 200 轮后世界变慢了吗」
//   不可判定——历史不存在（单点读数答得了「现在多快」答不了「一直在变慢吗」）。
//   rand 磁带自 v2.98.0 有导出/带外核对，但「请重放昨晚那一轮」不可判定——
//   磁带只有导出口没有仓库，证据活不过一次会话。
//
// 【做法】判据全部跑在真源码上（gate.fresh 装载真 LOAD），只借宿主桩。
//   破坏自证走 opts.srcOverride：把真源码在内存副本上改坏后重跑同款探针。
//
// 【正向判据】
//   RP1（perf-ledger）：
//   1  record 三态：合法样本入账 / disabled 拒收 / 非法参数（负数、非串名）拒收带 field。
//   2  trend：劣化源（单调递增 ms）flag=degrading、平坦源 flag=flat、斜率排序。
//   3  环形上限：单源超 240 样本自动挤出最旧（样本数 == 240）。
//   4  stat：recorded/sources/caps 读数在（面板与诊断的真源）。
//   5  ingest 分流口：合法行入账 / 坏行**既不入账也不冒充 0ms** / 非法入参报 type。
//   5b source-cap：源数超 CAP_KNOWN 时如实拒收（台账是**有界面**，不许随世界长大而膨胀）。
//   RP2（tape-store）：
//   6  save/list/load/drop 四口往返：存入 → 清单可见 → 取回还原 → 删除消失。
//   7  环形回收：存 21 卷后最旧被回收（total==20）。
//   8  版本拒收：formatVersion 不匹配报 tape-version-mismatch 不落盘。
//   9  空卷拒收：rows=[] 报 empty-tape。
//   10 stat：saved/loaded/dropped/evicted 计数正确。
//
// 【负控制】N0 破坏锚点恰中 1 次；N1 破坏后判据现形；N2 原版全绿（两向自证）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;

const TAG = '__pt2148_';

// ── 三个破坏锚点：只在真源码里各出现一次 ──
const BROKEN = [
  { key: 'slope',  rel: 'engines/perf-ledger.js',
    from: 'return Math.round(((n * sxy - sx * sy) / denom) * 10000) / 10000;',
    to:   'return 0;' },
  { key: 'badrow', rel: 'engines/perf-ledger.js',
    from: "if (typeof ms !== 'number' || !isFinite(ms)) { skipped++; noteSkip('no-reading'); continue; }",
    to:   'if (typeof ms !== \'number\' || !isFinite(ms)) { record(name, 0, round); counted++; continue; }' },
  { key: 'capchk', rel: 'engines/perf-ledger.js',
    from: "if (samples.size >= CAP_KNOWN) { _stat.unknownSource++; return { ok: false, reason: 'source-cap' }; }",
    to:   'if (false) { return { ok: false }; }' },
  { key: 'batchrec', rel: 'engines/perf-ledger.js',
    from: "if (!costs || typeof costs !== 'object') { noteSkip('batch'); return { ok: false, reason: 'type', field: 'costs', got: typeof costs }; }",
    to:   "if (!costs || typeof costs !== 'object') { return { ok: false, reason: 'type', field: 'costs', got: typeof costs }; }" },
  { key: 'evict',  rel: 'engines/tape-store.js',
    from: 'while (Object.keys(store).length > CAP_VOLS) {',
    to:   'while (false) {' },
  { key: 'verchk', rel: 'engines/tape-store.js',
    from: "if (vol.formatVersion !== TAPE_FORMAT_VERSION) return { ok: false, reason: 'tape-version-mismatch', want: TAPE_FORMAT_VERSION, got: vol.formatVersion };",
    to:   'if (false) return { ok: false };' }
];

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }

// ── LS 快照隔离 ──
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
function isolated(fn) {
  const snap = snapshotLS();
  try { return fn(); }
  finally { restoreLS(snap); }
}


// ── 合成磁带卷构造器 ──
function mkVol(seed, n, ver) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ c: 'test', v: (seed + i) % 100, k: 'd', n: i + 1, r: null, s: null });
  return { format: 'worldaxis.rand.tape', formatVersion: (ver === undefined ? 1 : ver), seed: seed, rows: rows };
}

// ── 探针（返回判据面）──
//   为什么不用 `pl.record(...)` 直接灌数：record 是**内部实现**，不在导出面上。
//   产品面唯一收数口是 `ingest`（render/inject.js 在注入链末尾分流既有读数），
//   所以判据也只走这一口——测试面与产品面同口，测的才是真契约。
//   「拒收」也不靠返回值猜：`stat().skipReasons` 是真读路径（诊断面与面板都读它），
//   故一条被拒的样本必须在那里留下名字。
function feed(pl, name, ms, round) {
  const o = {}; o[name] = { ms: ms };
  return pl.ingest(o, round);
}
function skipOf(pl, code) { return (pl.stat().skipReasons || {})[code] || 0; }
function probeTrend(WA) {
  const pl = WA.perfLedger;
  // 平坦源：恒定 5ms
  for (let i = 0; i < 20; i++) feed(pl, 'flat-src', 5, i);
  // 劣化源：单调递增 1..30ms（斜率约 1）
  for (let i = 0; i < 30; i++) feed(pl, 'deg-src', 1 + i, i);
  const t = pl.trend();
  const flat = t.rows.filter(function (r) { return r.source === 'flat-src'; })[0] || null;
  const deg  = t.rows.filter(function (r) { return r.source === 'deg-src'; })[0] || null;
  return { ok: t.ok, degrading: t.degrading, flat: flat, deg: deg,
    flatFlag: flat ? flat.flag : null, degFlag: deg ? deg.flag : null,
    degSlope: deg ? deg.slope : null, sortedTop: t.rows.length ? t.rows[0].source : null };
}

function probeRing(WA) {
  const pl = WA.perfLedger;
  for (let i = 0; i < 300; i++) feed(pl, 'ring-src', 3, i);
  const t = pl.trend();
  const ring = t.rows.filter(function (r) { return r.source === 'ring-src'; })[0] || null;
  return { n: ring ? ring.n : null, caps: pl.stat().caps };
}

function probeStore(WA) {
  const ts = WA.tapeStore;
  const r1 = ts.save(mkVol(42, 10));
  const li = ts.list();
  const id = r1.ok ? r1.id : null;
  const ld = id ? ts.load(id) : null;
  const st = ts.stat();
  const dr = id ? ts.drop(id) : null;
  const li2 = ts.list();
  return { saved: r1.ok, id: id, listed: li.ok && li.rows.length >= 1,
    loaded: ld && ld.ok && ld.tape.entries.length === 10,
    loadedSeed: ld && ld.ok ? ld.tape.seed : null,
    statSaved: st.saved >= 1, dropped: dr && dr.ok, afterDrop: li2.rows.filter(function (r) { return r.id === id; }).length === 0 };
}

function probeEvict(WA) {
  const ts = WA.tapeStore;
  const ids = [];
  for (let i = 0; i < 21; i++) { const r = ts.save(mkVol(i, 3)); if (r.ok) ids.push(r.id); }
  const li = ts.list();
  const st = ts.stat();
  // 21 卷存入后：total 应为 20，最早一卷（ids[0]）应被回收
  return { total: li.total, firstEvicted: ids.length > 0 ? li.rows.filter(function (r) { return r.id === ids[0]; }).length === 0 : null,
    evicted: st.evicted, lastSurvives: li.rows.filter(function (r) { return r.id === ids[ids.length-1]; }).length === 1 };
}

function probeVer(WA) {
  const ts = WA.tapeStore;
  const before = ts.list().total;   // 判据基线（judge 内 probeEvict 先跑留 20 卷，不假设空仓）
  const r = ts.save(mkVol(7, 5, 99));  // 版本 99 = 不匹配
  const li = ts.list();
  return { rejected: r.ok === false && r.reason === 'tape-version-mismatch',
    notStored: li.total === before };
}

function probeEmpty(WA) {
  const ts = WA.tapeStore;
  const r = ts.save({ format: 'worldaxis.rand.tape', formatVersion: 1, seed: 1, rows: [] });
  return { rejected: r.ok === false && r.reason === 'empty-tape' };
}

// ── RP1 分流口（ingest）与源数上限 ──
//   「坏行不入账」为什么值得一条判据：把没量到的行当成 0ms 收进趋势，
//   等于把「没量到」写成「很快」——台账要防的正是这件事。
function probeIngest(WA) {
  const pl = WA.perfLedger;
  const rec0 = pl.stat().recorded;
  const n0 = skipOf(pl, 'no-reading');
  const rBad = pl.ingest({ 'a-ok': { ms: 12, n: 3 }, 'b-bad': { ms: 'x' }, 'c-nan': { ms: NaN } }, 7);
  const rec1 = pl.stat().recorded;
  const t = pl.trend();
  const rowA = t.rows.filter(function (r) { return r.source === 'a-ok'; })[0] || null;
  const rowB = t.rows.filter(function (r) { return r.source === 'b-bad'; })[0] || null;
  const rowC = t.rows.filter(function (r) { return r.source === 'c-nan'; })[0] || null;
  return {
    ok: rBad.ok, counted: rBad.counted, skipped: rBad.skipped,
    delta: rec1 - rec0,                       // 只该 +1（坏行不占账）
    aSeen: !!rowA, aMs: rowA ? rowA.long : null,
    bAbsent: !rowB, cAbsent: !rowC,           // 坏行不入账
    noread: skipOf(pl, 'no-reading') - n0     // 且必须具名（不是沉默地消失）
  };
}

function probeCap(WA) {
  const pl = WA.perfLedger;
  const cap = pl.stat().caps.known;
  // 「还剩几个新槽」= 容量 − 已在册源数（已存在的源不占新槽，重复计数会算错超限拐点）。
  const free = cap - pl.stat().sources;
  const c0 = skipOf(pl, 'source-cap'), u0 = pl.stat().unknownSource;
  let rejCount = 0;
  for (let i = 0; i < free + 12; i++) {
    const r = feed(pl, '__cap2148_' + i, 1 + (i % 5), i);
    if (r.skipped) rejCount++;
  }
  return { cap: cap, free: free, rejCount: rejCount,
    capSkips: skipOf(pl, 'source-cap') - c0, unknownDelta: pl.stat().unknownSource - u0,
    sourcesNow: pl.stat().sources };
}

function probeRecordNeg(WA) {
  const pl = WA.perfLedger;
  const t0 = skipOf(pl, 'type'), n0 = skipOf(pl, 'no-reading'), b0 = skipOf(pl, 'batch');
  // 四种参数违约都从**产品收数口**走（不是调内部 record）：
  //   批次级违约（null / 字符串 / 非数轮次）由 ingest 当场拒，**不占样本账**——
  //   「整批没进来」和「进来后被逐条退掉」混进同一张归因表会答错问题；
  //   样本级违约（负数 ms / 空名）转到 record 后被拒，必须落到同一个 `type` 码上；
  //   非数 ms 走坏行分支，落 `no-reading`（「没有读数」不是「参数写错」）。
  const batchNull = pl.ingest(null), batchStr = pl.ingest('x');
  const batchRound = pl.ingest({ 'neg-d': { ms: 5 } }, 'z');
  pl.ingest({ 'neg-a': { ms: -1 } });        // 负数 → record 拒（type）
  pl.ingest({ '': { ms: 5 } });              // 空名 → record 拒（type）
  pl.ingest({ 'neg-c': { ms: 'x' } });       // 非数 → 坏行（no-reading）
  return {
    batchGuard: batchNull.reason === 'type' && batchStr.reason === 'type' && batchRound.reason === 'type',
    batchSkips: skipOf(pl, 'batch') - b0,        // 应 = 3（三批没进来，不占样本账）
    typeSkips: skipOf(pl, 'type') - t0,          // 应 = 2（负数 + 空名）——两层都记会是 4
    noreadSkips: skipOf(pl, 'no-reading') - n0   // 应 = 1（非数）
  };
}


// ── 破坏副本机制 ──
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点应恰中 1 次，实 ' + hits + ' 次：' + spec.rel + ' :: ' + spec.from);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function probeWith(spec, fn) { return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); }); }
function probeClean(fn) { return isolated(function () { return fn(fresh()); }); }

// ══════════════ 正向判据 ══════════════
function judge(a) {
  const WA = fresh();
  // RP1
  const tr = probeTrend(WA);
  a(tr.ok && tr.flatFlag === 'flat' && tr.degFlag === 'degrading',
    'v2148: [RP1-1] 趋势判定：劣化源 degrading / 平坦源 flat（实 deg=' + tr.degFlag + ' flat=' + tr.flatFlag + '）');
  a(tr.degrading === 1, 'v2148: [RP1-1b] 劣化源恰 1 个（实 ' + tr.degrading + '）');
  a(tr.degSlope !== null && tr.degSlope > 0.5, 'v2148: [RP1-1c] 递增源斜率 ~1（实 ' + tr.degSlope + '）');
  a(tr.sortedTop === 'deg-src', 'v2148: [RP1-1d] 劣化源排首位（斜率降序）');

  const rg = probeRing(WA);
  a(rg.n === 240, 'v2148: [RP1-3] 单源 300 样本后桶长 240（实 ' + rg.n + '）');
  a(rg.caps && rg.caps.samples === 240 && rg.caps.known === 56, 'v2148: [RP1-4] caps 读数（240/56）');
  const neg = probeRecordNeg(WA);
  a(neg.batchGuard && neg.batchSkips === 3 && neg.typeSkips === 2 && neg.noreadSkips === 1,
    'v2148: [RP1-5] 参数违约分账：批次级 batch ×3（不占样本账）+ 样本级 type ×2 / no-reading ×1（实 batch=' + neg.batchSkips + ' type=' + neg.typeSkips + ' noread=' + neg.noreadSkips + '）');

  // [RP1-5c/5d] 分流口：坏行既不入账也不冒充 0ms；且退场必须具名
  const ing = probeIngest(WA);
  a(ing.ok && ing.counted === 1 && ing.skipped === 2 && ing.delta === 1,
    'v2148: [RP1-5c] ingest 分流：1 行入账 / 2 坏行跳过 / recorded 只 +1（实 counted=' + ing.counted + ' skipped=' + ing.skipped + ' delta=' + ing.delta + '）');
  a(ing.aSeen && ing.aMs === 12 && ing.bAbsent && ing.cAbsent,
    'v2148: [RP1-5d] 坏行不入账（不许把「没量到」写成 0ms 的「很快」）：a 在册 aMs=' + ing.aMs + ' b 缺席=' + ing.bAbsent + ' c 缺席=' + ing.cAbsent);
  a(ing.noread === 2,
    'v2148: [RP1-5e] 跳过具名：两条没读数的行在 stat().skipReasons 里留名 no-reading ×2（实 ' + ing.noread + '）');

  // [RP1-5f] 源数上限：台账是有界面，源数超限必须如实拒收（不是静默丢弃）
  const cp = probeCap(WA);
  a(cp.sourcesNow === cp.cap && cp.rejCount === 12 && cp.capSkips === cp.rejCount,
    'v2148: [RP1-5f] 源数恰好填满 CAP_KNOWN，超出的 12 个源如实拒收 source-cap（' + cp.sourcesNow + '/' + cp.cap + ' 拒 ' + cp.rejCount + ' 归因 ' + cp.capSkips + '）');
  a(cp.unknownDelta === cp.rejCount,
    'v2148: [RP1-5g] 超限拒收同时计入 unknownSource 读数（增量 ' + cp.unknownDelta + ' / 拒 ' + cp.rejCount + '）');



  // RP2
  const stt = probeStore(WA);
  a(stt.saved && stt.listed && stt.loaded && stt.statSaved && stt.dropped && stt.afterDrop,
    'v2148: [RP2-6] 四口往返：存→列→取→删（loaded=' + stt.loaded + ' dropped=' + stt.dropped + '）');
  a(stt.loadedSeed === 42, 'v2148: [RP2-6b] 取回卷 seed 还原（实 ' + stt.loadedSeed + '）');

  const ev = probeEvict(WA);
  a(ev.total === 20 && ev.firstEvicted === true && ev.evicted >= 1 && ev.lastSurvives,
    'v2148: [RP2-7] 环形回收：21 卷后 total=20 最旧回收（实 total=' + ev.total + ' evicted=' + ev.evicted + '）');

  const vr = probeVer(WA);
  a(vr.rejected && vr.notStored, 'v2148: [RP2-8] 版本不匹配拒收且不落盘');

  const em = probeEmpty(WA);
  a(em.rejected, 'v2148: [RP2-9] 空卷拒收 empty-tape');
}

// ══════════════ 负控制 ══════════════
function runNegative(a) {
  const byKey = {};
  BROKEN.forEach(function (s) { byKey[s.key] = s; });

  // N0 破坏锚点恰中 1 次
  const bad = [];
  BROKEN.forEach(function (spec) {
    const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
    const hits = src.split(spec.from).length - 1;
    if (hits !== 1) bad.push(spec.key + '(' + hits + ')');
  });
  a(bad.length === 0, 'v2148: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (bad.join(',') || '无') + '）');

  // N0b 破坏副本非空转（每一种都要真的改动字节）
  const srcP = fs.readFileSync(path.join(BASE, 'engines/perf-ledger.js'), 'utf8');
  const srcT = fs.readFileSync(path.join(BASE, 'engines/tape-store.js'), 'utf8');
  const dP0 = brokenOverride(byKey.slope)['engines/perf-ledger.js'] !== srcP;
  const dP1 = brokenOverride(byKey.badrow)['engines/perf-ledger.js'] !== srcP;
  const dP2 = brokenOverride(byKey.capchk)['engines/perf-ledger.js'] !== srcP;
  const dP3 = brokenOverride(byKey.batchrec)['engines/perf-ledger.js'] !== srcP;
  const dT1 = brokenOverride(byKey.evict)['engines/tape-store.js'] !== srcT;
  const dT2 = brokenOverride(byKey.verchk)['engines/tape-store.js'] !== srcT;
  a(dP0 && dP1 && dP2 && dP3 && dT1 && dT2, 'v2148: [N0b] 六种破坏的内存副本都与真源码不同（非空转）');

  // N1 破坏后判据现形
  const sSlope = probeWith(byKey.slope, probeTrend);
  a(sSlope.degFlag !== 'degrading' || sSlope.degrading === 0,
    'v2148: [N1a] 斜率公式被替换为恒 0⇒ 劣化检出消失（实 deg=' + sSlope.degFlag + ' n=' + sSlope.degrading + '）');

  const sBad = probeWith(byKey.badrow, probeIngest);
  a(sBad.delta !== 1 && sBad.bAbsent === false,
    'v2148: [N1d] 坏行被改成「记 0ms 且计入账」⇒ 坏行不入账判据现形（实 delta=' + sBad.delta + ' bAbsent=' + sBad.bAbsent + '）');

  const sCap = probeWith(byKey.capchk, probeCap);
  a(sCap.sourcesNow > sCap.cap && sCap.rejCount === 0,
    'v2148: [N1e] 源数上限守卫被拆掉 ⇒ 源数越过 CAP_KNOWN 且零拒收（实 ' + sCap.sourcesNow + '/' + sCap.cap + ' 拒 ' + sCap.rejCount + '）');

  const sBatch = probeWith(byKey.batchrec, probeRecordNeg);
  a(sBatch.batchSkips !== 3,
    'v2148: [N1f] 批次级拒收的记账被摘掉 ⇒ 归因表数不出「整批没进来」（实 batch=' + sBatch.batchSkips + '）');

  const sEvict = probeWith(byKey.evict, probeEvict);
  a(sEvict.total !== 20,
    'v2148: [N1b] 环形回收被破坏 ⇒ 21 卷后 total 超限（实 ' + sEvict.total + '）');

  const sVer = probeWith(byKey.verchk, probeVer);
  a(sVer.rejected === false,
    'v2148: [N1c] 版本校验被破坏 ⇒ 坏版本卷不再拒收（实 rejected=' + sVer.rejected + '）');

  // N2 两向自证：原版全绿
  const cTrend = probeClean(probeTrend);
  a(cTrend.ok && cTrend.degFlag === 'degrading' && cTrend.flatFlag === 'flat',
    'v2148: [N2] 原版源码上趋势判据全绿');
  const cIng = probeClean(probeIngest);
  a(cIng.ok && cIng.counted === 1 && cIng.skipped === 2 && cIng.aMs === 12 && cIng.bAbsent && cIng.cAbsent,
    'v2148: [N2d] 原版源码上 ingest 分流判据全绿');
  const cCap = probeClean(probeCap);
  a(cCap.sourcesNow === cCap.cap && cCap.rejCount === 12 && cCap.capSkips === cCap.rejCount,
    'v2148: [N2e] 原版源码上源数上限判据全绿（' + cCap.sourcesNow + '/' + cCap.cap + ' 拒 ' + cCap.rejCount + '）');
  const cNeg = probeClean(probeRecordNeg);
  a(cNeg.batchGuard && cNeg.batchSkips === 3 && cNeg.typeSkips === 2 && cNeg.noreadSkips === 1,
    'v2148: [N2f] 原版源码上参数违约分账判据全绿——含「归因只在收数口记一次」'
    + '（type=2 而非 4：record 与 ingest 两层都记会让同一个违约翻倍，归因表就不再可信）（实 batch=' + cNeg.batchSkips + ' type=' + cNeg.typeSkips + '）');
  const cEvict = probeClean(probeEvict);
  a(cEvict.total === 20 && cEvict.firstEvicted === true,
    'v2148: [N2b] 原版源码上环形回收判据全绿');
  const cVer = probeClean(probeVer);
  a(cVer.rejected === true && cVer.notStored,
    'v2148: [N2c] 原版源码上版本拒收判据全绿');

  // N3 逐锚敏感：一个锚坏掉不该把别的面的判据带偏
  const x1 = probeWith(byKey.slope, probeStore);
  a(x1.saved && x1.loaded && x1.dropped, 'v2148: [N3a] slope 破坏不影响仓库四口（逐锚敏感）');
  const x2 = probeWith(byKey.evict, probeTrend);
  a(x2.ok && x2.degFlag === 'degrading', 'v2148: [N3b] evict 破坏不影响趋势判定（逐锚敏感）');
  const x3 = probeWith(byKey.slope, probeIngest);
  a(x3.ok && x3.delta === 1 && x3.bAbsent, 'v2148: [N3c] slope 破坏不影响 ingest 分流判据（逐锚敏感）');
  const x4 = probeWith(byKey.badrow, probeTrend);
  a(x4.ok && x4.degFlag === 'degrading', 'v2148: [N3d] badrow 破坏不影响趋势判定（逐锚敏感）');
  const x5 = probeWith(byKey.capchk, probeTrend);
  a(x5.ok && x5.degFlag === 'degrading' && x5.flatFlag === 'flat',
    'v2148: [N3e] capchk 破坏不影响趋势判定（逐锚敏感）');
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
  if (fail) { console.log('PERF-TAPE-V2148: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('PERF-TAPE-V2148: pass（' + pass + ' 项）');
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeTrend: probeTrend, probeStore: probeStore, probeEvict: probeEvict,
  brokenOverride: brokenOverride
};
