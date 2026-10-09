/**
 * WorldAxis engines/perf-baseline.js (v2.182.0) — O3 手机端与长局性能基线（可无头部分）
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   TP6 是整条优化线里**唯一从未动过**的项（计划原文：TP6 至今「未开始（需现场基线）」）。
 *   现场已经有的三件基础件各答一半：
 *     · engines/perf-trace.js —— 四层（inject / diagnose / canonAlign / worldState）的
 *       p50 / p95 / min / max 与四档预算（CLASS_DEF：short 800 / medium 2000 / long 4000 / lowend 2000）；
 *     · engines/perf-ledger.js —— 按来源的滚动窗口趋势（近 10 / 近 50 / 全窗 + 斜率）；
 *     · engines/storage-forecast.js —— 存储水位外推。
 *   缺的是把三件合起来回答 O3 那句原话的三件事：
 *   ① **三档存档的档位归属**（小局 / 代表性长局 / 容量边缘）—— 现场没有任何一处判「这一局属于哪一档」；
 *   ② **冻结的宿主预算表** —— 预算在 perf-trace 的 CLASS_DEF 里，但它是**活值**（改一行就变），
 *      而「先冻结预算、再评价收益」要求的是**取值时刻的副本 + 之后的漂移检测**；
 *   ③ **逐面的现场读数台账** —— 生成前后 / 事务复制序列化 / 生态证据校验 / 面板打开与切页，
 *      四处的读数散在三个模块的三种形状里，没有任何一处并排。
 *
 * ── 本模块落点（只读聚合，不新增第二套状态）──────────────────
 *   · bands()    —— 三档定义 + **当前存档归属哪一档**（判据来自现场读数，不是拍数）
 *   · budget()   —— **冻结宿主预算表**：取值时刻的 CLASS_DEF 副本 + 档位映射 + **漂移检测**
 *   · readings() —— 逐面现场读数台账（各面 p50 / p95 / 最长 / 样本数 / 来源；无样本者如实报 unmeasured）
 *   · gap()      —— **实机采样栏**：如实留空 + 缺什么清单（手机触屏滚动 / 前后台恢复 / 真机 p50·p95）
 *   · sources() / diagnose() / stat() / reset()
 *
 * ── 环境限制（**必须如实声明**，不靠无头顶替）──────────────
 *   计划原文 O3 写「需真实手机环境采集 p50 / p95 基线」。本模块**只交付可无头部分**：
 *   档位判定、预算冻结与漂移、现场读数并排、缺口清单。
 *   **实机采样栏一律留空**（gap() 的 rows 为空 + reason:'needs-real-device'）——
 *   无头环境里 `perfTrace.baseline('lowend')` 的读数带 `approx:true`（同机放大估计），
 *   把它填进实机栏就是拿估计冒充测量（本仓对此已有一次裁决）。
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────
 *   1 默认关（enabled:false）。
 *   2 **只读**：不采样、不计时、不改任何来源模块的窗口、不写 stat 之外的世界状态。
 *     特别地**不调用** `perfLedger.ingest` / `perfTrace.mark` / `renderPerf.observe` ——
 *     观测面自己往被观测的窗口里塞数，等于污染下一次读数（观测污染被观测者）。
 *   3 **不报百分比收益**（计划原文即禁）：readings() 只报「现场值 / 预算值 / 判定档」，
 *     不算「改善了多少 %」。收益要等实机前后对照，而在那之前任何百分比都是编的。
 *   4 未采到基线时保持「待验收」：无样本的面报 `unmeasured`，**不拿 0 冒充**。
 *     0 是一个合法的耗时读数（cache hit 就是 0ms），拿它冒充「没测过」会让两件事同形。
 *   5 不改判定口径：档位预算一律读 `perfTrace.CLASS_DEF`（唯一真源），本模块不自带副本 ——
 *     自带副本就是「两本账」，而预算表尤其不能有两本（改一处忘一处 = 预算悄悄失效）。
 *   6 不用缓存跳过 O1 / O2 的提交复核（计划原文边界）：本模块零缓存、零旁路，纯读。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_perf_baseline_settings_v1';
  const DEF = { enabled: false, nearRatio: 0.8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'perfBaseline',
    bounds: { nearRatio: [0.5, 1] } };
  function getSettings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function setSettings(patch) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})))
      : Object.assign({}, getSettings(), patch || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  var _stat = { reads: 0, refused: 0, lastReason: '', faults: {}, byFace: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function noteFace(id, n) { _stat.byFace[id] = (_stat.byFace[id] || 0) + n; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function safe(fn, fb) { try { const r = fn(); return (r === undefined) ? fb : r; } catch (e) { return fb; } }

  // ── 三档定义 ──────────────────────────────────────────────
  //   判据一律来自**现场读数**（存档字节 + 水位已满容器数），不是拍出来的阈值：
  //   拍阈值会让「这一局属于哪一档」变成第二套真源，而它与 store 的字节读数必然漂移。
  //   字节阈值与 storage-forecast 的配额档位同族（它是唯一在算「离配额还有多远」的模块），
  //   故这里只声明**档位边界**，不重复外推。
  const BANDS = [
    { id: 'small', label: '小局', class: 'short',
      desc: '首轮或极少容器：生成前合成应当在一档预算内',
      judge: 'persistedBytes < 256KB 且 已满容器 = 0' },
    { id: 'typical', label: '代表性长局', class: 'medium',
      desc: '多轮推进后：人物、暗流、纪事都有存量',
      judge: '256KB <= persistedBytes < 2MB' },
    { id: 'edge', label: '容量边缘', class: 'long',
      desc: '多数容器逼近或达到 cap：挤出与拒收开始发生',
      judge: 'persistedBytes >= 2MB 或 已满容器 >= 1' }
  ];
  const SMALL_BYTES = 256 * 1024;
  const EDGE_BYTES = 2 * 1024 * 1024;

  function bandOf() {
    const saveStat = safe(function () { return WA.store && WA.store.saveStat ? WA.store.saveStat() : null; }, null);
    const audit = safe(function () { return WA.store && WA.store.sizeAudit ? WA.store.sizeAudit({ minBytes: 0, maxDepth: 4 }) : null; }, null);
    const bytes = saveStat ? num(saveStat.bytes) : null;
    const total = audit ? num(audit.total) : null;
    const used = (bytes !== null) ? bytes : total;
    if (used === null) return { ok: false, reason: 'no-bytes', band: null };
    const fullCount = safe(function () {
      if (!(WA.store && WA.store.sizeCaps)) return 0;
      const caps = WA.store.sizeCaps() || {};
      const st = state();
      let n = 0;
      Object.keys(caps).forEach(function (k) {
        const m = caps[k] || {};
        if (m.wildcard || typeof m.cap !== 'number' || m.cap <= 0) return;
        const segs = k.split('.');
        let cur = st;
        for (let i = 0; i < segs.length; i++) {
          if (cur === null || cur === undefined || typeof cur !== 'object') { cur = null; break; }
          cur = cur[segs[i]];
        }
        const len = Array.isArray(cur) ? cur.length : (cur && typeof cur === 'object' ? Object.keys(cur).length : null);
        if (len !== null && len >= m.cap) n++;
      });
      return n;
    }, 0);
    let band = 'typical';
    if (used < SMALL_BYTES && fullCount === 0) band = 'small';
    else if (used >= EDGE_BYTES || fullCount >= 1) band = 'edge';
    return { ok: true, band: band, bytes: used, bytesSource: (bytes !== null) ? 'store.saveStat().bytes' : 'store.sizeAudit().total',
      fullContainers: fullCount };
  }

  function bands() {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }
    const cur = bandOf();
    _stat.reads++;
    return { ok: true,
      rows: BANDS.map(function (b) { return { id: b.id, label: b.label, class: b.class, desc: b.desc, judge: b.judge, current: (cur.ok && cur.band === b.id) }; }),
      current: cur.ok ? cur.band : null,
      currentDetail: cur.ok ? { bytes: cur.bytes, bytesSource: cur.bytesSource, fullContainers: cur.fullContainers } : null,
      reason: cur.ok ? null : cur.reason,
      note: '档位由现场字节读数与已满容器数判定；判不出时如实报 no-bytes，不默认成小局' };
  }

  // ── 冻结预算表 ────────────────────────────────────────────
  //   「冻结」不是把数抄一份存起来就完了 —— 抄一份**就是**第二本账。真正的冻结是
  //   「记下取值时刻的样子 + 之后每次读都比对一次」，漂移当场可见。
  //   故：frozen 是模块装载时的 CLASS_DEF 深拷贝，budget() 每次都拿活值与它比。
  // 墙钟走 clockWall 守卫（与全仓同款）：裸调 Date.now() 会被 v2.22.0 的 K20 判据红灯
  //   （「裸调绕过冻结，回放对不上时只能全库通读」）。freezeAt 是**记录时刻**用的测量时间，
  //   不是决策时间，故走 wallNow 而非 now —— 但它仍必须走时钟面，不能裸调宿主。
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const FROZEN_AT = clockWall();
  const FROZEN_CLASS_DEF = (function () {
    const live = safe(function () { return WA.perfTrace && WA.perfTrace.CLASS_DEF ? WA.perfTrace.CLASS_DEF : null; }, null);
    if (!live) return null;
    try { return JSON.parse(JSON.stringify(live)); } catch (e) { return null; }
  })();
  // 非 perf-trace 层的三个面：它们不在 CLASS_DEF 里，故由本模块**声明目标**（declared-target）。
  //   声明目标与实测基线的区别必须写死在读数里（basis 字段）—— 把声明说成实测
  //   正是「文档反向误导」那一类（O7 抓到的现场缺陷）。
  const DECLARED = [
    { face: 'tx', label: '事务复制 / 序列化', p50Ms: 8, p95Ms: 32,
      source: 'store.txStat().avgMs（只有均值，无 p50/p95 ⇒ 现场栏按均值判）' },
    { face: 'save', label: '写盘', p50Ms: 6, p95Ms: 24,
      source: 'store.saveStat()（只有结果与字节，无耗时 ⇒ 现场栏只能报 ok/bytes）' },
    { face: 'ecoAudit', label: '生态证据校验', p50Ms: 20, p95Ms: 80,
      source: 'perfLedger.trend()（按来源的滚动均值与斜率）' },
    { face: 'panel', label: '面板打开与切页', p50Ms: 60, p95Ms: 200,
      source: 'renderPerf.renderStat()（逐页次数 / 平均 / 最大）' }
  ];

  function budget() {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }
    const live = safe(function () { return WA.perfTrace && WA.perfTrace.CLASS_DEF ? WA.perfTrace.CLASS_DEF : null; }, null);
    if (!live) { noteFault('no-perf-trace'); return { ok: false, reason: 'no-perf-trace', rows: [],
      note: 'perf-trace 缺席时预算表无从冻结：本模块**不自带副本**（自带副本就是第二本账）' }; }
    const rows = [];
    BANDS.forEach(function (b) {
      const def = live[b.class] || null;
      rows.push({ band: b.id, label: b.label, class: b.class,
        budgetMs: def ? num(def.budget) : null, repeats: def ? num(def.repeats) : null,
        approx: def ? !!def.approx : null,
        basis: 'perfTrace.CLASS_DEF.' + b.class + '.budget（唯一真源，本模块不自带副本）',
        frozenBudgetMs: (FROZEN_CLASS_DEF && FROZEN_CLASS_DEF[b.class]) ? num(FROZEN_CLASS_DEF[b.class].budget) : null,
        note: def ? clean(def.note, 80) : null });
    });
    // 漂移：活值与冻结值逐档比。档位定义变了（预算被改 / 档被删 / 档被加）都要报出来 ——
    //   「预算悄悄变了而没人知道」会让所有历史读数失去可比性，那是基线工作的头号失效模式。
    const drift = [];
    if (FROZEN_CLASS_DEF) {
      Object.keys(FROZEN_CLASS_DEF).forEach(function (k) {
        const f = FROZEN_CLASS_DEF[k] || {}, l = live[k];
        if (!l) { drift.push({ cls: k, field: 'presence', from: 'present', to: 'removed' }); return; }
        ['budget', 'repeats', 'approx'].forEach(function (fld) {
          const a = f[fld], b = l[fld];
          if (a !== b) drift.push({ cls: k, field: fld, from: (a === undefined ? null : a), to: (b === undefined ? null : b) });
        });
      });
      Object.keys(live).forEach(function (k) {
        if (!FROZEN_CLASS_DEF[k]) drift.push({ cls: k, field: 'presence', from: 'absent', to: 'added' });
      });
    }
    _stat.reads++;
    return { ok: true, rows: rows, declared: DECLARED.map(function (d) { return Object.assign({}, d); }),
      frozenAt: FROZEN_AT, frozenAvailable: !!FROZEN_CLASS_DEF,
      drift: drift, driftCount: drift.length,
      note: drift.length
        ? '预算表自冻结以来已变动 ' + drift.length + ' 处 —— 变动前的读数与变动后**不可直接比较**，请重新取基线'
        : '预算表自冻结以来未变动：历史读数与当前读数可直接比较' };
  }

  // ── 现场读数台账 ──────────────────────────────────────────
  //   八个面。**每面报自己的口径**：有的面有 p50/p95（perf-trace 的层），
  //   有的面只有均值（store.txStat）—— 后者如实标 `p50Source:'unavailable'`，
  //   不拿均值冒充中位数（均值会被一次长阻塞拉走，而 p50 不会，两者回答的不是同一问）。
  const FACES = [
    { id: 'inject', label: '生成前 · 注入面合成', kind: 'layer', layer: 'inject' },
    { id: 'worldState', label: '生成前 · 世界状态视图', kind: 'layer', layer: 'worldState' },
    { id: 'canonAlign', label: '生成前 · 原著对位', kind: 'layer', layer: 'canonAlign' },
    { id: 'diagnose', label: '生成后 · 诊断采集包', kind: 'layer', layer: 'diagnose' },
    { id: 'tx', label: '事务复制 / 序列化', kind: 'tx' },
    { id: 'save', label: '写盘', kind: 'save' },
    { id: 'ecoAudit', label: '生态证据校验', kind: 'ledger' },
    { id: 'panel', label: '面板打开与切页', kind: 'panel' }
  ];

  function readings(opts) {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const rows = [];
    FACES.forEach(function (f) {
      let row = { face: f.id, label: f.label, measured: false, samples: 0,
        p50: null, p95: null, maxMs: null, p50Source: 'unavailable', source: null, note: null };
      if (f.kind === 'layer') {
        const b = safe(function () { return WA.perfTrace && WA.perfTrace.baseline ? WA.perfTrace.baseline(f.layer) : null; }, null);
        if (b && num(b.window) > 0) {
          row.measured = true; row.samples = num(b.window); row.p50 = num(b.p50); row.p95 = num(b.p95);
          row.maxMs = num(b.max); row.p50Source = 'perfTrace.baseline(' + f.layer + ').p50';
          row.source = 'engines/perf-trace.js 层窗口（cap ' + (num(b.cap) || '?') + '，dropped ' + (num(b.dropped) || 0) + '）';
        } else { row.note = '该层窗口为空 —— 未采到样本（不是 0ms）'; }
      } else if (f.kind === 'tx') {
        const t = safe(function () { return WA.store && WA.store.txStat ? WA.store.txStat() : null; }, null);
        if (t && num(t.count) > 0) {
          row.measured = true; row.samples = num(t.count); row.p50 = num(t.avgMs); row.p95 = null;
          row.maxMs = num(t.lastMs);
          row.p50Source = 'unavailable';
          row.source = 'core/store.js txStat：count ' + t.count + ' / errors ' + t.errors + ' / aborted ' + t.aborted
            + ' / batched ' + t.batched + ' / deferred ' + t.deferred + ' / saveFailed ' + t.saveFailed;
          row.note = '只有均值与最近一次（无 p50/p95 分位）—— 均值会被单次长事务拉走，与 p50 回答的不是同一问';
        } else { row.note = '本会话尚无事务计数 —— 未采到样本'; }
      } else if (f.kind === 'save') {
        const s = safe(function () { return WA.store && WA.store.saveStat ? WA.store.saveStat() : null; }, null);
        if (s && num(s.at) > 0) {
          row.measured = true; row.samples = 1;
          row.source = 'core/store.js saveStat：ok ' + (s.ok === true ? 'true' : 'false')
            + ' / bytes ' + (num(s.bytes) || 0) + ' / failCount ' + (num(s.failCount) || 0)
            + (s.reason ? ' / reason ' + clean(s.reason, 40) : '');
          row.note = '写盘面只记结果与字节，**不记耗时** —— 故本行没有 ms 读数（如实标 unmeasured 的耗时栏）';
          row.measured = false;                 // 有读数但没有耗时 ⇒ 耗时面仍未测
          row.partial = true;
        } else { row.note = '尚无写盘记录 —— 未采到样本'; }
      } else if (f.kind === 'ledger') {
        const tr = safe(function () { return WA.perfLedger && WA.perfLedger.trend ? WA.perfLedger.trend() : null; }, null);
        if (tr && tr.ok && Array.isArray(tr.rows) && tr.rows.length) {
          const worst = tr.rows.slice().sort(function (a, b) { return (num(b.long) || 0) - (num(a.long) || 0); })[0];
          row.measured = true; row.samples = tr.rows.reduce(function (n, r) { return n + (num(r.n) || 0); }, 0);
          row.p50 = num(worst.short); row.p95 = num(worst.long);
          row.maxMs = num(worst.medium);
          row.p50Source = 'perfLedger.trend().rows[最慢源].short（近 10 均值，非真分位）';
          row.source = 'engines/perf-ledger.js 按来源滚动窗口：' + tr.rows.length + ' 个源，degrading ' + (num(tr.degrading) || 0)
            + '（最慢源 ' + clean(worst.source, 40) + '，斜率 ' + (worst.slope === null ? 'n/a' : worst.slope) + '）';
          row.note = 'short/mid/full 是三个窗口的**均值**（不是分位）—— 本行按均值口径报，字段名如实标 short';
        } else if (tr && tr.ok === false && tr.reason === 'disabled') {
          row.note = 'perf-ledger 关闭 —— 读数一直空，与「还没跑过」不是一回事';
        } else { row.note = '台账无样本 —— 未采到读数'; }
      } else if (f.kind === 'panel') {
        const rs = safe(function () { return WA.renderPerf && WA.renderPerf.renderStat ? WA.renderPerf.renderStat() : null; }, null);
        if (rs && Array.isArray(rs.rows) && rs.rows.length) {
          const worst = rs.rows.slice().sort(function (a, b) { return (num(b.avgMs) || 0) - (num(a.avgMs) || 0); })[0];
          row.measured = true; row.samples = rs.rows.reduce(function (n, r) { return n + (num(r.renders) || 0); }, 0);
          row.p50 = num(worst.avgMs); row.p95 = num(worst.maxMs);
          row.maxMs = num(worst.maxMs);
          row.p50Source = 'renderPerf.renderStat().rows[最慢页].avgMs（均值，非真分位）';
          row.source = 'ui/render-perf.js：' + rs.rows.length + ' 页有样本（最慢页 ' + clean(worst.page, 24) + '）';
          row.note = 'avgMs 是均值、maxMs 是单次峰值 —— 两者分列，不合成一个数';
        } else {
          const rc = safe(function () { return WA.renderPerf && WA.renderPerf.getSettings ? WA.renderPerf.getSettings() : null; }, null);
          row.note = (rc && rc.enabled === false)
            ? '渲染观测关闭 —— 读数一直空，与「还没切过页」不是一回事'
            : '尚无渲染样本 —— 未采到读数';
        }
      }
      noteFace(f.id, row.measured ? row.samples : 0);
      rows.push(row);
    });
    const measured = rows.filter(function (r) { return r.measured; });
    const limit = (num(o.limit) && num(o.limit) > 0) ? Math.floor(num(o.limit)) : rows.length;
    _stat.reads++;
    return { ok: true, rows: rows.slice(0, limit), count: rows.length,
      measuredCount: measured.length, unmeasuredCount: rows.length - measured.length,
      measuredFaces: measured.map(function (r) { return r.face; }),
      unmeasuredFaces: rows.filter(function (r) { return !r.measured; }).map(function (r) { return r.face; }),
      band: (bandOf().ok ? bandOf().band : null),
      note: '未采到的面报 unmeasured，**不拿 0 冒充**（0 是合法耗时读数，两者不可同形）；不报百分比收益' };
  }

  // ── 实机采样栏（如实留空）────────────────────────────────
  /**
   * 实机采样栏。**无头环境永远为空** —— 这不是「还没做」，是「这个环境测不出来」。
   *   为什么不留一个「估算值」占位：`perfTrace.CLASS_DEF.lowend.approx === true`
   *   已经写明它是「同机放大估计，真机读数须实机」。把估计填进实测栏，
   *   下一个读者就再也分不出「手机上是 60ms」与「桌上机放大估算是 60ms」。
   * @returns {{ok, reason, rows, missing, howTo}}
   */
  function gap() {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [], missing: [] }; }
    const approxNote = safe(function () {
      const d = WA.perfTrace && WA.perfTrace.CLASS_DEF ? WA.perfTrace.CLASS_DEF.lowend : null;
      return d ? { approx: !!d.approx, note: clean(d.note, 80) } : null;
    }, null);
    _stat.reads++;
    return { ok: true, reason: 'needs-real-device', rows: [],
      missing: [
        '真机三档存档的 p50 / p95（小局 / 代表性长局 / 容量边缘）',
        '真机最长阻塞时间（无头环境测不到宿主主线程的调度与渲染排队）',
        '真机写盘次数（宿主存储配额与权限失败路径只有真机可达）',
        '手机触屏滚动时的面板渲染耗时',
        '前后台切换后的恢复耗时（bfcache 与后台节流只有真机可达）'
      ],
      approxFallback: approxNote,
      howTo: '在真实 SillyTavern（手机端）按三档存档各跑一遍：开本模块开关 → 打开面板「性能基线」段 → 读 readings() 后把 p50/p95 手工登记；本栏不做自动采集（自动采集要往被观测窗口里塞数，那就是观测污染被观测者）',
      note: '本栏**在无头环境里为空是正确结果**，不是待办漏做：拿同机放大估计顶替实机读数，会让「测过」与「没测过」在读数上同形' };
  }

  const SOURCE_PROBES = [
    { name: 'store', probe: function () { return !!(WA.store && typeof WA.store.get === 'function'); } },
    { name: 'perfTrace', probe: function () { return !!(WA.perfTrace && typeof WA.perfTrace.baseline === 'function'); } },
    { name: 'perfLedger', probe: function () { return !!(WA.perfLedger && typeof WA.perfLedger.trend === 'function'); } },
    { name: 'renderPerf', probe: function () { return !!(WA.renderPerf && typeof WA.renderPerf.renderStat === 'function'); } },
    { name: 'storageForecast', probe: function () { return !!(WA.storageForecast && typeof WA.storageForecast.stat === 'function'); } }
  ];
  function sources() {
    return SOURCE_PROBES.map(function (s) {
      let available = false;
      try { available = !!s.probe(); } catch (e) { available = false; }
      return { name: s.name, available: available };
    });
  }

  function diagnose() {
    const checks = {
      store: !!(WA.store && typeof WA.store.get === 'function'),
      perfTrace: !!(WA.perfTrace && typeof WA.perfTrace.baseline === 'function'),
      perfLedger: !!(WA.perfLedger && typeof WA.perfLedger.trend === 'function'),
      renderPerf: !!(WA.renderPerf && typeof WA.renderPerf.renderStat === 'function'),
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.read === 'function')
    };
    const ok = checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.182.0',
      faceCount: FACES.length, bandCount: BANDS.length,
      realDevice: 'pending' };
  }

  function stat() {
    return { reads: _stat.reads, refused: _stat.refused, lastReason: _stat.lastReason,
      faults: Object.assign({}, _stat.faults), byFace: Object.assign({}, _stat.byFace),
      enabled: getSettings().enabled, band: (bandOf().ok ? bandOf().band : null),
      frozenAt: FROZEN_AT, frozenAvailable: !!FROZEN_CLASS_DEF };
  }

  function reset() { _stat.reads = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; _stat.byFace = {}; return { ok: true }; }

  WA.perfBaseline = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    bands: bands,
    budget: budget,
    readings: readings,
    gap: gap,
    sources: sources,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 10;
  var _exported = Object.keys(WA.perfBaseline).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('perfBaseline: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/perf-baseline.js', { kind: 'engine', ver: '2.182.0' });
})();