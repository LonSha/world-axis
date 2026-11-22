/**
 * WorldAxis engines/perf-ledger.js (v2.148.0) — 性能历史台账（RP1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   perf-trace 已有基准与档位（v2.102.0 / v2.123.0），但都是「单点读数」——
 *   「这局跑 200 轮后世界变慢了吗」无法回答，因为**历史**不存在。
 *   一句话：**单点读数答得了「现在多快」，答不了「一直在变慢吗」。**
 *
 * ── 本模块落点 ────────────────────────────────────────────────
 *   只从既有真源收数（观测污染被观测者）:
 *     · record(name, ms, round) — 耗时样本进按源分桶的环形台账。**真生产方**：
 *       render/inject.js 在每轮注入链末尾把 engineCall（唯一引擎调用出口）已量到的读数
 *       分流进来——本模块不自带计时器、不重跑任何基准，只消费既有形态；
 *     · trend()               — 三基准对照（短10/中50/长全窗）+ LSQ 斜率，斜率超阈值报 degrading。
 *   台账容量登记入 __BOUNDED_CAPS（perfLedger.samples / perfLedger.known）。
 *
 *   v2.148.0（实施自纠）：**删掉两个零消费方的出口**——原设计的 `impactOf(path)`
 *   （局部重算成本）与内部 `saveSettings` 从来没有产品调用方：前者要答的「改这一条会重算多少
 *   注入面」已由 v2.123.0 的 `injectBudget.incrementalCost` + 注入链 recalc 快照承担
 *   （同一件事两个实现，且那个才有真读者）；后者是设置写入口的复制品，而本模块的设置只有
 *   一个布尔开关 + 一个斜率阈值，写路径走 settingsBus 的统一登记口（savereg）。
 *   删掉它们同时消掉了两个只会变成「未分类拒收码」的字面量（no-budget / no-bus）——
 *   「有写入方、零读者」的面不留（本仓已为这一类付过多次价）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 不做增量优化（观测面不是优化器）。
 *   2 不自动调优（趋势检出只报，不改配置）。
 *   3 不落盘（样本是进程态观测物，重启清零，与 causal.stat 同口径）。
 *   4 不替 perf-trace 计时（只消费既有读数形态）。
 */
(function () {
  'use strict';
  // v2.148.0：别名形态用本仓规范式（理由见 engines/tape-store.js 同段注释）：
  //   非规范式在 module-cycle-gate 上等于「没有提供方」，会把真导出读成悬空 ns。
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.148.0: 不设幂等守卫（对齐 causal.js / faction-graph.js 新范式）。
  //   测试侧 fresh() 在同一 global 上重评估全部 LOAD 模块，守卫会让第二次装载静默短路——
  //   srcOverride 破坏副本装不上、跨用例模块状态泄漏。产品侧由 index.js 顶层
  //   __WORLD_AXIS_LOADED__ 防重入，本守卫冗余。

  const LS_KEY = 'worldaxis_perf_ledger_v1';
  const __REG = { key: LS_KEY, def: { enabled: true, degradeSlope: 0.05 }, module: 'perfLedger',
    bounds: { degradeSlope: [0.01, 10] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = { enabled: true, degradeSlope: 0.05 };
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  /**
   * v2.148.0（实施自纠 · 第二刀）：**不导出设置写口**。
   *   原设计的 `saveSettings` 先说「总线缺席」、上一轮又改成 `savereg` 包一层——两次都是同一个病：
   *   **写口有、消费方零**。面板对「性能」页的消费是**读**（趋势 + 读数），没有任何控件要写
   *   这两个值；设置键 `worldaxis_perf_ledger_v1` 的写路径与其他只读观测模块同规格，走
   *   settingsBus 的统一口（设置页 / 导入配置），本模块不另开一个只有测试会去敲的写口。
   *   一个「写在源码里而产品零消费」的写口不是能力，是负债：本节头一条边界就是
   *   「不做自动调优（趋势检出只报，不改配置）」——连写口都不该有。
   */
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const CAP_SAMPLES = 240;
  const CAP_KNOWN = 56;
  const samples = new Map();
  const _stat = { recorded: 0, dropped: 0, unknownSource: 0, trendCalls: 0, lastRecordAt: 0, firstAt: 0, skipReasons: {} };

  function cfgOn() { return settings().enabled !== false; }

  /** 归类一次「没进账」：跳过与丢弃都要留下原因（读数下面的归因表）。 */
  function noteSkip(code) {
    _stat.skipReasons[code] = (_stat.skipReasons[code] || 0) + 1;
  }

  function record(name, ms, round) {
    // 注意：record **不自记归因**——它每次拒收都会经 ingest 记账一次。
    //   两层都记会让同一个 type 翻倍（实测：一次负数 ms 记成 2），
    //   而「归因表」的价值全在数字可信；记账点只能有一个（收数口）。
    if (!cfgOn()) return { ok: false, reason: 'disabled' };
    if (typeof name !== 'string' || !name) return { ok: false, reason: 'type', field: 'name', got: typeof name };
    if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return { ok: false, reason: 'type', field: 'ms', got: typeof ms };
    if (round !== undefined && (typeof round !== 'number' || !isFinite(round))) return { ok: false, reason: 'type', field: 'round', got: typeof round };
    let bucket = samples.get(name);
    if (!bucket) {
      if (samples.size >= CAP_KNOWN) { _stat.unknownSource++; return { ok: false, reason: 'source-cap' }; }
      bucket = [];
      samples.set(name, bucket);
    }
    bucket.push({ t: (typeof round === 'number' ? round : bucket.length), ms: ms });
    if (bucket.length > CAP_SAMPLES) bucket.shift();
    _stat.recorded++;
    _stat.lastRecordAt = (WA.clock ? WA.clock.wallNow() : Date.now());
    if (!_stat.firstAt) _stat.firstAt = _stat.lastRecordAt;
    return { ok: true, source: name, ms: ms, at: _stat.lastRecordAt };
  }

  function trend() {
    if (!cfgOn()) return { ok: false, reason: 'disabled' };
    const cfg = settings();
    const rows = [];
    samples.forEach(function (bucket, name) {
      if (!bucket || !bucket.length) return;
      const n = bucket.length;
      const sAvg = avgOf(bucket.slice(-10));
      const mAvg = avgOf(bucket.slice(-50));
      const lAvg = avgOf(bucket);
      const slope = lsqSlope(bucket);
      const flag = (slope !== null && slope > cfg.degradeSlope) ? 'degrading' : 'flat';
      rows.push({ source: name, n: n, short: sAvg, medium: mAvg, long: lAvg, slope: slope, flag: flag });
    });
    rows.sort(function (a, b) { return (b.slope || 0) - (a.slope || 0); });
    _stat.trendCalls++;
    return { ok: true, rows: rows, degrading: rows.filter(function (r) { return r.flag === 'degrading'; }).length, at: (WA.clock ? WA.clock.wallNow() : Date.now()) };
  }

  /**
   * v2.148.0：**分流入口**——把本轮已发生的计时读数收进台账（唯一产品生产方在
   *   render/inject.js 的注入链末尾；测试面也走这一口，不用第二个入口）。
   *   为什么是「分流」而不是「计时」：计时已经在 `engineCall` 的 finally 里做过一次
   *   （异常路径同样计时）；本模块再计一遍会把同一次调用算进两份账。
   * @returns {{ok:boolean, reason?:string, counted?:number, skipped?:number}}
   */
  function ingest(costs, round) {
    // 批次级违约与样本级违约**分账**（`batch` 与各样本码）：
    //   前者是「整批没进来」（调用方写错，一条样本都没碰），后者是「进来后被逐条退掉」
    //   （单条读数坏了）。合成一个计数就再也答不出「是我传错了还是数坏了」。
    if (!costs || typeof costs !== 'object') { noteSkip('batch'); return { ok: false, reason: 'type', field: 'costs', got: typeof costs }; }
    if (round !== undefined && round !== null && (typeof round !== 'number' || !isFinite(round))) {
      noteSkip('batch');
      return { ok: false, reason: 'type', field: 'round', got: typeof round };
    }
    const names = Object.keys(costs);
    let counted = 0, skipped = 0;
    for (let i = 0; i < names.length; i++) {
      const name = names[i], ent = costs[name];
      const obj = !!(ent && typeof ent === 'object');
      const ms = obj ? ent.ms : ent;
      // 坏行**不算入账、也不算跳过**：它不是「一个 0ms 的样本」，它是「没有读数」——
      //   把 0 收进趋势会把「没量到」写成「很快」，那正是本模块要防的那件事。
      if (typeof ms !== 'number' || !isFinite(ms)) { skipped++; noteSkip('no-reading'); continue; }
      const n = obj && (typeof ent.n === 'number' && ent.n > 0) ? Math.floor(ent.n) : 1;
      // n 次调用只量到一个 ms（墙体时钟精度 1ms，多次常量为 0）：
      //   按 n 记样本会让「同一 ms 复制 n 份」伪造出一个平坦序列（斜率因此被人为压平）。
      //   故如实记**一次**实测值，但把 n 挂在样本上——「这份读数代表几次调用」可查。
      const r = record(name, ms, (round === undefined || round === null) ? undefined : round);
      if (r.ok) {
        counted++;
        const b = samples.get(name);
        if (b && b.length) b[b.length - 1].n = n;
      } else {
        // 跳过必须能答「为什么」：把码吞成一个计数，等于「拒收码存在但不可读」——
        //   下一个改动者只会看到 skipped 涨了，分不出是源数超限（该扩容量或该分流）
        //   还是参数违约（该修生产方）。两种处置完全不同，故归因要落到 stat() 上，
        //   由诊断面真读出去（不是只进返回值——返回值没有产品消费方）。
        skipped++;
        noteSkip(r.reason || 'rejected');
      }
    }
    return { ok: true, counted: counted, skipped: skipped };
  }

  function avgOf(arr) {
    if (!arr || !arr.length) return null;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i].ms;
    return Math.round((s / arr.length) * 1000) / 1000;
  }

  function lsqSlope(bucket) {
    if (!bucket || bucket.length < 3) return null;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    const n = bucket.length;
    for (let i = 0; i < n; i++) { const y = bucket[i].ms; sx += i; sy += y; sxy += i * y; sxx += i * i; }
    const denom = (n * sxx - sx * sx);
    if (denom === 0) return null;
    return Math.round(((n * sxy - sx * sy) / denom) * 10000) / 10000;
  }

  function stat() {
    return {
      recorded: _stat.recorded, dropped: _stat.dropped, unknownSource: _stat.unknownSource,
      sources: samples.size, trendCalls: _stat.trendCalls,
      lastRecordAt: _stat.lastRecordAt, firstAt: _stat.firstAt,
      // 归因表：`recorded` 只答「进了多少」，答不了「退了多少、为什么」。
      //   四个码（disabled / type / source-cap / no-reading）在这里才第一次可读——
      //   不然拒收码就只是「源码里有、运行时不显形」的另一种写法。
      skipReasons: Object.assign({}, _stat.skipReasons),
      enabled: cfgOn(), caps: { samples: CAP_SAMPLES, known: CAP_KNOWN }
    };
  }
  WA.perfLedger = {
    // 收数口（产品生产方 = render/inject.js；读侧 = tool-diag / ui.panel）
    ingest: ingest,
    // 读口（趋势 + 设置快照 + 读数；面板与诊断两处真消费方）
    trend: trend,
    getSettings: settings,
    stat: stat
  };
})();
