/**
 * WorldAxis engines/round-cost.js (v2.269.0) — 单轮成本卡：这一轮我花了多少上下文 (EXV6-5)
 *
 * ── 它治什么（缺口，探针 tools/v6probes/p_roundcost.js 立据）──────────────
 *   「这一轮花了多少、哪几个源白花」这件事，本仓**三个面各自都知道一部分**：
 *     · injectBudget → 本轮裁决用了 512/2400t、余量、档位口径（`modeText`）；
 *     · injectValue  → 本轮在册源、每源引用率 / 采纳率、连续零引用连击；
 *     · perfLedger   → 各源耗时的历史趋势（`trend`）。
 *   实测三个面**分散在三处出口**（概览页「④ 性能趋势」段、预算段、注入价值榜单），
 *   玩家要自己对齐轮次坐标才能拼出「这一轮到底值不值」。本模块把三面**并列成一张卡**，
 *   一轮一行，不新增任何容器、不重算任何一条读数（全部走既有只读口）。
 *
 * ── 四条不许（每条都对应一类会静默冒充真值的读法）─────────────────────
 *   ① **「没有上一轮」≠「上一轮没花钱」**：无 `store.lastInjection` 时报
 *      `state:'no-reading'` + `used:null`，**绝不**报 `used:0`。零读数的样子不许与
 *      「一分没花」同形（本仓口径：读不到就说读不到）。
 *   ② **榜单不是全集、也不是本轮**：`injectValue.report().rows` 有两个错位 ——
 *      它按 `topN` **截断**（须带 `capped` 与全量 `flaggedAll`），
 *      且它覆盖**最近 24 轮**的累计（`rows[].lastRound` 才是「这一条最后出现在哪一轮」）。
 *      故本卡把榜单切成 `fresh`（`lastRound === 本轮`，**这才是本轮在册源**）与
 *      `stale`（更早的历史条目）两桶，**只有 fresh 参与零引用计数**——
 *      拿历史条目当本轮零引用，等于把「上个月没用的源」报成「这一轮白花」。
 *   ③ **长期趋势不是本轮读数**：`perfLedger.trend()` 覆盖全窗样本，答的是「一直在变慢吗」。
 *      本轮耗时只认 `lastInjection.budget.cost`。两者分列，绝不互相填坑。
 *   ④ **token 与字符不互算**：`budget.used` 是裁决 token 数，`lastInjection.len` 是字符数。
 *      本卡分列 `usedTokens` / `chars`，不做任何换算（没有可靠换算率，编一个就是造假）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────────────
 *   · 纯读：零 `store.transact`、零 `settingsBus` 写（除非玩家显式 `setSettings`）、
 *     零 `localStorage`、零新容器；
 *   · 不跑任何引擎、不触发任何结算（`build()` 只读既有读数口）；
 *   · 不生成、不调用模型；
 *   · 不「归因」到模型身上：说不出原因的零引用就只是零引用，不做「大概率没用」的臆断。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const LS_KEY = 'worldaxis_round_cost_settings_v1';
  const DEF = {
    enabled: true,
    topN: 4,            // 榜单里最多列几个源（1～12）
    showZero: true,     // 是否列出「本轮没被用上」的源
    showTiming: true,   // 是否带本轮耗时（来自 lastInjection.budget.cost，非趋势）
    showLongTrend: false // 是否附带 perfLedger 的长期趋势一句（默认关：它不是本轮读数）
  };
  const BOUNDS = { topN: [1, 12] };
  const __REG = { key: LS_KEY, def: DEF, module: 'roundCost', bounds: BOUNDS };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
      const raw = WA.settingsBus.read(__REG);
      const merged = Object.assign({}, DEF, raw || {});
      return typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
    }
    return Object.assign({}, DEF);
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }

  const __stat = {
    builds: 0, cards: 0, noReading: 0, disabled: 0,
    zeroRefReported: 0, longTrendReads: 0, lastState: ''
  };

  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function str(v, max) { return String(v == null ? '' : v).slice(0, max || 40); }
  function safe(fn, fb) { try { const r = fn(); return (r === undefined) ? fb : r; } catch (e) { return fb; } }

  /** 上一轮注入快照（唯一真源：store.lastInjection）。读不到就是 null，不合成空对象。 */
  function lastInjection() {
    return safe(function () {
      const d = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : null;
      return (d && d.lastInjection && typeof d.lastInjection === 'object') ? d.lastInjection : null;
    }, null);
  }

  /**
   * 成本卡主口。**纯读**：不写 store、不跑引擎、不结算任何东西。
   * @returns {object} 三态：`state` ∈ `disabled` / `no-reading` / `empty` / `live`。
   */
  function build(opts) {
    const cfg = Object.assign({}, settings(), opts || {});
    __stat.builds++;
    if (cfg.enabled !== true) {
      __stat.disabled++; __stat.lastState = 'disabled';
      return { ok: false, reason: 'disabled', state: 'disabled',
        used: null, cap: null, line: '单轮成本卡已停用（设置页可开）' };
    }
    const li = lastInjection();
    // ① 没有上一轮 ⇒ 三件事分开说，**绝不**折成 used:0。
    if (!li) {
      __stat.noReading++; __stat.lastState = 'no-reading';
      return { ok: false, reason: 'no-reading', state: 'no-reading',
        used: null, cap: null, chars: null, round: null,
        note: '还没有注入过任何一轮（读不到 ≠ 这一轮没花钱）',
        line: '还没有注入过任何一轮 —— 这一格没有读数，不是「零成本」' };
    }
    const b = (li.budget && typeof li.budget === 'object') ? li.budget : null;
    if (!b || num(b.used) === null || num(b.cap) === null) {
      // 快照在、预算读数不在：曾经注入过，但没有可裁项（或该轮没走到裁决）——如实说这一档。
      __stat.lastState = 'empty';
      return { ok: true, state: 'empty', reason: 'no-budget',
        round: num(li.round), injected: li.injected !== false,
        used: null, cap: null, chars: num(li.len),
        served: Array.isArray(li.sources) ? li.sources.slice(0, 12) : [],
        note: '上一轮注入了，但没有预算裁决读数（该轮没有可裁项）',
        line: '上一轮没有可裁的注入项（' + (num(li.len) || 0) + ' 字符已落地）' };
    }

    const used = num(b.used), cap = num(b.cap);
    const hr = (b.headroom && typeof b.headroom === 'object') ? b.headroom : null;
    const remain = hr ? num(hr.remain) : (cap !== null && used !== null ? Math.max(0, cap - used) : null);
    const usedPct = (used !== null && cap !== null && cap > 0) ? Math.round((used / cap) * 1000) / 10 : null;
    const freePct = (remain !== null && cap !== null && cap > 0) ? Math.round((remain / cap) * 1000) / 10 : null;
    const overBudget = (typeof b.overBudget === 'boolean') ? b.overBudget : (used !== null && cap !== null && used > cap);
    const mode = b.budgetMode || b.mode || null;
    const modeText = safe(function () {
      const bv = WA.injectBudget && typeof WA.injectBudget.budgetView === 'function' ? WA.injectBudget.budgetView(b) : null;
      return bv ? bv.modeText : null;
    }, null);

    // ② 榜单面：rows 是**截断**的，flagged 不是。两者必须分开报，否则「前 N 名里的零引用」
    //    会被读成「全体的零引用」—— 那是本模块立项时要防的那一类假绿。
    const topN = (typeof cfg.topN === 'number' && cfg.topN > 0) ? Math.floor(cfg.topN) : DEF.topN;
    let rep = null;
    try {
      rep = (WA.injectValue && typeof WA.injectValue.report === 'function')
        ? WA.injectValue.report({ topN: topN }) : null;
    } catch (eR) { rep = null; }
    const rows = (rep && rep.ok && Array.isArray(rep.rows)) ? rep.rows : [];
    const flaggedAll = (rep && rep.ok && Array.isArray(rep.flagged)) ? rep.flagged.slice() : [];
    const boardCount = (rep && rep.ok && typeof rep.sources === 'number') ? rep.sources : rows.length;
    const capped = boardCount > rows.length;
    // ②b 榜单**不是本轮**：report 覆盖最近 CAP_ROUNDS 轮的累计，`lastRound` 才是「最后出现在哪轮」。
    //   只有 `lastRound === 本轮` 的条目才算这一轮在册源；否则把「24 轮前用过、这轮没注」的源
    //   报成「这一轮白花」—— 那是把历史当现在（与本版纪律 ③ 同一类错位）。
    const roundNow = num(li.round);
    let freshInBoard = 0, staleInBoard = 0;
    // fresh 里的零引用才算「这一轮白花」：`refDistinctAvg` 是**本轮**均值（该条本轮只判过一次时
    //   就是本轮读数；跨轮条目被 stale 分出来，不参与计数）。
    let zeroFresh = 0;
    rows.forEach(function (r) {
      const lr = num(r.lastRound);
      const isFresh = (roundNow !== null && lr !== null && lr === roundNow);
      if (isFresh) {
        freshInBoard++;
        if (num(r.refDistinctAvg) === 0) zeroFresh++;
      } else staleInBoard++;
    });
    const zeroInBoard = zeroFresh;
    const adopted = rows.filter(function (r) {
      return num(r.lastRound) === roundNow && num(r.adoptAvg) > 0;
    }).map(function (r) { return str(r.source, 32); });

    // ③ 本轮耗时：唯一来源是 lastInjection.budget.cost（**不是** perfLedger.trend）。
    const cost = (b.cost && typeof b.cost === 'object') ? b.cost : null;
    const timing = cost ? {
      totalMs: num(cost.totalMs), measured: num(cost.measured),
      unmeasuredCount: num(cost.unmeasuredCount),
      slowest: (cost.slowest && typeof cost.slowest === 'object')
        ? { source: str(cost.slowest.source, 32), ms: num(cost.slowest.ms), band: str(cost.slowest.band, 16) || null }
        : null
    } : null;

    // ④ 长期趋势（默认不读：它不是本轮读数）。读了就显式计数，便于诊断面区分「没读」与「读了是平的」。
    let longTrend = null;
    if (cfg.showLongTrend === true) {
      longTrend = safe(function () {
        __stat.longTrendReads++;
        const tr = WA.perfLedger && typeof WA.perfLedger.trend === 'function' ? WA.perfLedger.trend() : null;
        if (!tr || !tr.ok) return { ok: false, note: '趋势面读不到' };
        return { ok: true, degrading: tr.degrading, sampled: Array.isArray(tr.rows) ? tr.rows.length : 0,
          note: '长期趋势（全窗样本，**不是**本轮）：' + (tr.degrading > 0 ? tr.degrading + ' 个源在劣化' : '零劣化源') };
      }, null);
    }

    if (cfg.showZero === true) __stat.zeroRefReported += zeroInBoard;
    __stat.cards++; __stat.lastState = 'live';

    const served = Array.isArray(li.sources) ? li.sources.map(function (x) { return str(x, 32); }) : [];
    const chars = num(li.len);
    return {
      ok: true, state: 'live',
      round: num(li.round), injected: li.injected !== false,
      // token 面（裁决）与字符面分列——不互算（纪律 ④）
      used: used, cap: cap, remain: remain, usedPct: usedPct, freePct: freePct,
      overBudget: overBudget, saturated: !!(hr && hr.saturated === true),
      chars: chars,
      mode: mode, modeText: modeText,
      avgKeptTokens: hr ? num(hr.avgKeptTokens) : null,
      spareSources: hr ? num(hr.spareSources) : null,
      // 源面
      served: served, servedCount: served.length,
      judgedRounds: (rep && typeof rep.rounds === 'number') ? rep.rounds : null,
      zeroRefRounds: (rep && typeof rep.zeroRefRounds === 'number') ? rep.zeroRefRounds : null,
      // 榜单面（**截断 + 跨轮**）与连击面（**全量**）分列
      board: {
        topN: topN, rows: rows.length, total: boardCount, capped: capped,
        // fresh = 本轮真的在册（lastRound === 本轮）；stale = 榜单里更早的历史条目。
        //   只有 fresh 参与零引用计数 —— 拿 stale 当本轮零引用就是「把上个月报成本轮」。
        fresh: freshInBoard, stale: staleInBoard,
        zeroInBoard: zeroInBoard,
        adopted: adopted
      },
      flaggedAll: flaggedAll,
      timing: (cfg.showTiming === true) ? timing : null,
      longTrend: longTrend,
      note: (capped || staleInBoard > 0)
        ? ((capped ? ('本卡只看到榜单前 ' + topN + ' 名（共 ' + boardCount + ' 个在册源）——') : '')
          + (staleInBoard > 0
            ? ('榜单里另有 ' + staleInBoard + ' 条是**更早轮次**的历史条目，不计入本轮零引用；')
            : '')
          + '「榜单内零引用」不等于全体零引用；全体连击名单见 flaggedAll')
        : null,
      line: line(cfg, used, cap, remain, usedPct, zeroInBoard, freshInBoard, boardCount, timing, staleInBoard)
    };
  }

  /** 人话一行：面板整行逐字取它（与 world-diary / day-route / relation-temp 同规）。 */
  function line(cfg, used, cap, remain, usedPct, zeroInBoard, freshCount, boardCount, timing, staleCount) {
    if (cfg && cfg.enabled === false) return '单轮成本卡已停用（设置页可开）';
    const parts = [];
    if (used !== null && cap !== null) {
      parts.push('这一轮用了 ' + used + '/' + cap + 't（' + (usedPct === null ? '?' : usedPct) + '%）'
        + (remain !== null ? '，还剩 ' + remain + 't' : ''));
    }
    if (freshCount > 0) {
      parts.push(zeroInBoard > 0
        ? ('本轮 ' + freshCount + ' 个源里有 ' + zeroInBoard + ' 个零引用')
        : ('本轮 ' + freshCount + ' 个源都被引到了'));
    }
    if (staleCount > 0) parts.push('另有 ' + staleCount + ' 个更早轮次的源不列入本轮');
    if (timing && timing.totalMs !== null && timing.measured > 0) {
      parts.push('注入链耗时 ' + timing.totalMs + 'ms'
        + (timing.slowest ? '（' + timing.slowest.source + ' 最慢 ' + timing.slowest.ms + 'ms）' : ''));
    }
    return parts.length ? ('本轮开销：' + parts.join('；')) : '本轮开销：无可读读数';
  }

  function stat() {
    return {
      enabled: settings().enabled !== false, topN: settings().topN,
      builds: __stat.builds, cards: __stat.cards, noReading: __stat.noReading,
      disabled: __stat.disabled, zeroRefReported: __stat.zeroRefReported,
      longTrendReads: __stat.longTrendReads, lastState: __stat.lastState,
      sources: {
        injectBudget: !!(WA.injectBudget && typeof WA.injectBudget.budgetView === 'function'),
        injectValue: !!(WA.injectValue && typeof WA.injectValue.report === 'function'),
        perfLedger: !!(WA.perfLedger && typeof WA.perfLedger.trend === 'function'),
        store: !!(WA.store && typeof WA.store.get === 'function')
      }
    };
  }
  function reset() {
    __stat.builds = 0; __stat.cards = 0; __stat.noReading = 0; __stat.disabled = 0;
    __stat.zeroRefReported = 0; __stat.longTrendReads = 0; __stat.lastState = '';
    return { ok: true };
  }

  WA.roundCost = {
    DEF: Object.assign({}, DEF),
    BOUNDS: BOUNDS,
    getSettings: settings,
    setSettings: saveSettings,
    build: build,
    stat: stat,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/round-cost.js', { kind: 'engine', ver: '2.269.0' });
  }
  if (WA.log) WA.log('info', '单轮成本卡已加载（只读聚合）');
})();
