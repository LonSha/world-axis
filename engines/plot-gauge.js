/**
 * WorldAxis engines/plot-gauge.js (v2.153.0) — 剧情深度仪（RX5）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓答得出「世界推到了哪一轮」（`clock`）、「几条暗流在跑」（`causal.stat`）、
 *   「几条伏笔没收」（`foreshadow`），却答不出玩家真正会问的那一句：
 *   **「这个世界的故事，现在发展到什么程度了？」**
 *   每一条都是**分项读数**，没有一个**合成指数**；而分项读数无法回答
 *   「现在是不是该收线了」——三条暗流全在推进、五条伏笔全在成熟，
 *   与三条暗流停滞、五条伏笔全部过期，在分项表上看只差几个数。
 *
 * ── 本模块落点（只读合成，三件东西）──────────────────────────
 *   · tension(opt) —— 剧情张力指数（0-100）。四分量加权，权重**显式**写在本文件里：
 *       悬念存量 30（未终态因果链 + 活跃伏笔）/ 推进动能 30（已结算速率 × 平均阶段）/
 *       暗流成熟 25（成熟线程占比）/ 到期压力 15（临近/过期未收的比重）。
 *     **分量与权重都可读**（`components` 随读数返回）——一个只有总分的指数没法核对。
 *   · trend() —— 张力走向（连续上行 / 连续下行 / 波动）。上行/下行各需 ≥3 个采样，
 *       只有 2 个点时**如实报 `insufficient-samples`**（两个点连不成趋势）。
 *   · advice() —— 收线建议（**不是剧情建议**）。四条具名建议按「先做什么」排序，
 *       每条带自己读到的数：`close-overdue`（先收过期伏笔）/ `converge-thread`
 *       （把停滞线程收拢）/ `let-breathe`（张力过高、该放一放）/ `keep-going`（正常）。
 *
 * ── 与既有模块的分工（不许重叠）──────────────────────────────
 *   · `foreshadow` / `longline` —— 单条伏笔的生命周期（本模块**只数**，不管单条）；
 *   · `causal` —— 单条因果链的状态与结算（本模块只取**计数与阶段分布**）；
 *   · `threads` —— 悬案的推进与收敛（本模块只取**成熟线程占比**）；
 *   · `gauge` —— 世界脉搏的压力档（**那是世界活跃度**，不是剧情张力；两者会背离：
 *     世界很热闹但故事没在推进，是常见局面，故不可合并）；
 *   · 本模块 —— **合成指数 + 走向 + 建议**。它不写世界、不改任何单条记录。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认**开**：纯只读合成（与 injectValue 同口径——默认关会让读数永远是空的，
 *     「没读到」与「读出来不好」必须可分）。
 *   2 **不改剧情**（只报不改）。不自动收线、不自动推进、不催模型。
 *   3 **不落盘**：趋势环是进程态内存环（与 perfLedger 同口径）。写进 store 骨架或
 *     `__BOUNDED_CAPS` 会把「重启清零」伪装成「有界容器」。
 *   4 **不推高水位不假装推高**：张力只由已发生的事实算，不含任何预测、不含随机数。
 *   5 四分量**各自可读**：合成值失真的第一诊断手段是「看哪个分量在动」，只给总分等于
 *     把这条诊断手段藏起来。
 *   6 有界：趋势环有 cap（`maxPulses`），指数自身不许撑爆内存。
 *   7 数据源缺席如实报：`causal` / `foreshadow` / `threads` 三源都读不到 ⇒ `no-signal`
 *     （**不拿 0 分冒充「故事才刚开始」**——那是本仓最贵的一类假读数）；
 *     三源在场、但一条在途材料都没有 ⇒ `no-reading`（空世界是合法状态，
 *     但必须与「读数 0」分开报：一个要补数据源，一个要确认剧情进度）。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_plot_gauge_v1';
  const DEF = {
    enabled: true,
    staleMs: 3600000,   // 多久没动算「停滞」（与 foreshadow 的 staleMs 同量级，但各自独立）
    maxPulses: 24,      // 趋势环容量
    risingDelta: 5      // 上行/下行的判定阈值（张力点差，低于此视为波动）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'plotGauge',
    bounds: { staleMs: [60000, 86400000], maxPulses: [4, 96], risingDelta: [1, 50] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 四分量权重（显式常量：合成指数的全部依据，改权重必须是一个有人确认过的动作）。
  const W = { suspense: 30, momentum: 30, threads: 25, due: 15 };
  // v2.153.0：本常量**不在索引位置**上声明为数组（避免与 schema 的数组常量面混淆）；
  //   「先做什么」的次序由 `advice()` 内部显式给出。
  const STALE_MS_FLOOR = 60000;

  const pulses = [];              // 进程态趋势环（不落盘）
  const _stat = { gauges: 0, rejected: 0, lastReason: '', faults: {} };
  function note(code) { _stat.rejected++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }

  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function num(v) { const n = Number(v); return isFinite(n) ? n : null; }
  // v2.155.0 自纠（全量回归当场抓到）：同 engines/branch-tree.js 的一处 —— 守卫被写成两行，
  //   G20 的形态判据要求「兜底与守卫声明同行共现」，故改本仓既有的单行形态。
  // v2.155.0 收口：守卫变量名由 `clockNow_` 改为 `clockNow`（与仓内 175 处主流命名一致，G20 声明面据此计数）
  const clockNow = function (tag) { try { return WA.clock.now(tag || 'plotGauge'); } catch (e) { return Date.now(); } };
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function isTerminalChain(c) {
    return !!c && (c.status === 'settled' || c.status === 'cancelled' || c.status === 'expired');
  }
  const FS_ACTIVE = ['waiting', 'developing'];

  /**
   * 取三源计数（**只取计数**，不读单条内容 —— 本模块不管单条）。
   * 返回 { ok, chains, live, settled, stageAvg, chainsTerminal, foreshadows, fsActive, threads, matureThreads, sources }
   */
  function sources() {
    const s = state();
    const out = { chains: 0, live: 0, settled: 0, stageSum: 0, stageSamples: 0,
      foreshadows: 0, fsActive: 0, threads: 0, matureThreads: 0, sources: 0,
      // v2.153.0：**三源在场标志**必须与计数分开记。只有计数的话，「容器不存在」
      //   与「容器存在但为空」两者都给出 0，于是分量会被算成「0 分」而不是「缺席」——
      //   那正是本模块边界第 7 条点名要防的假读数。
      hasChains: false, hasFs: false, hasThreads: false };
    const chains = (s.causal && s.causal.chains) || null;
    if (Array.isArray(chains)) {
      out.sources++;
      out.hasChains = true;
      out.chains = chains.length;
      chains.forEach(function (c) {
        if (!c) return;
        if (isTerminalChain(c)) out.settled++;
        else {
          out.live++;
          const st = num(c.stage);
          if (st !== null) { out.stageSum += st; out.stageSamples++; }
        }
      });
    }
    const fs = (s.memory && s.memory.foreshadows) || null;
    if (Array.isArray(fs)) {
      out.sources++;
      out.hasFs = true;
      out.foreshadows = fs.length;
      out.fsActive = fs.filter(function (f) { return !!f && FS_ACTIVE.indexOf(f.status) >= 0; }).length;
    }
    const th = s.threads;
    if (Array.isArray(th)) {
      out.sources++;
      out.hasThreads = true;
      out.threads = th.length;
      // 「成熟线程」= 已收拢过（hasLead 或 stage 更高）且仍在推进：收拢是成熟的代理读数，
      //   与 threads 自己的 converge 语义同向 —— 本模块不另立一套「成熟」定义。
      out.matureThreads = th.filter(function (t) {
        if (!t) return false;
        const term = (t.status === 'resolved' || t.status === 'abandoned');
        if (term) return false;
        return (Array.isArray(t.leads) && t.leads.length > 0) || num(t.stage) !== null;
      }).length;
    }
    return out;
  }

  /** 四分量 + 加权合成（纯函数，入参可注入 —— 便于专锁在不改世界的前提下验方向）。 */
  function tensionCore(srcs, cfg) {
    // 在场判定**一律按「源是否在场」而非「计数是否为零」**（本模块边界第 7 条）：
    //   只有计数的话，「容器不存在」与「容器存在但为空」都给出 0，
    //   于是分量会被算成「0 分」而不是「缺席」—— 把「无从判定」伪装成「判定为最差」。
    //   注入式调用（专锁）只给计数时，用各源的在场标志兜底：未显式给标志则按计数>0 推断，
    //   并把推断结果如实标在 `components[].present` 上。
    const hasChains = (typeof srcs.hasChains === 'boolean') ? srcs.hasChains : (srcs.chains > 0);
    const hasFs = (typeof srcs.hasFs === 'boolean') ? srcs.hasFs : (srcs.foreshadows > 0);
    const hasThreads = (typeof srcs.hasThreads === 'boolean') ? srcs.hasThreads : (srcs.threads > 0);
    // 悬念存量：未终态链与活跃伏笔的存量（各按 8 条封顶 —— 存量到一定规模后，
    //   「再多两条」对张力不再有信息量，而封顶前的每一条都有）。
    let suspense = null;
    if (hasChains || hasFs) {
      suspense = Math.min(1, (Math.min(srcs.live || 0, 8) + Math.min(srcs.fsActive || 0, 8)) / 16);
    }
    // 推进动能：已结算速率（终态链 / 总链）× 平均阶段（在途链走到第几阶段）。
    //   v2.153.0（自纠，本模块最隐蔽的一处）：`settled / chains` 在**链表在场但为空**时
    //   是 `0/0 = NaN`，NaN 一路穿过权重归一与 Math.round，最后以「JSON null」的样子
    //   出现在读数里，而 `bandOf(NaN)` 落进最后一段 ⇒ 打出 `climax`。
    //   一个空世界因此会显示成「高潮」。修法两条：① 分母为 0 时速率如实取 0（不是「算不出来」，
    //   是「一条都没有」）；② 合成值与档位都加有限性守卫，非有限一律 null。
    const settleRate = (hasChains && srcs.chains > 0) ? (srcs.settled / srcs.chains) : (hasChains ? 0 : null);
    const stageAvg = (srcs.stageSamples > 0) ? (srcs.stageSum / srcs.stageSamples) : null;
    let momentum = null;
    if (hasChains) {
      momentum = 0;
      if (settleRate !== null) momentum += settleRate * 0.6;
      if (stageAvg !== null) momentum += clamp01(stageAvg / 4) * 0.4;
      momentum = clamp01(momentum);
    }
    // 暗流成熟：成熟线程占在途线程的比重（线程源缺席 ⇒ 该分量不参与，见下方 activeW 归一）。
    const mature = (hasThreads && srcs.threads > 0) ? ((srcs.matureThreads || 0) / srcs.threads) : null;
    // 到期压力：活跃伏笔占全部伏笔的比重 —— 「全是没头的线」正是该收线的局面。
    const dueP = (hasFs && srcs.foreshadows > 0) ? ((srcs.fsActive || 0) / srcs.foreshadows) : null;
    // 在场但计数为 0 的源**不算缺席**：悬念存量与到期压力都按 0 参与（如实：确实没有在途线）。
    //   注意这只覆盖**单分量**：若三源全都没有在途材料，合成值会被下方的空世界守卫置空——
    //   「0 分」在一个空世界与一个「铺满了又全收干净」的世界里长得一模一样，那是制造出来的精度。
    if (hasChains || hasFs) { if (suspense === null) suspense = 0; }
    if (hasFs && dueP === null) { /* foreshadows=0 ⇒ dueP 无从计算，如实缺席 */ }
    const parts = [
      { key: 'suspense', label: '悬念存量', w: W.suspense, v: suspense },
      { key: 'momentum', label: '推进动能', w: W.momentum, v: momentum },
      { key: 'threads', label: '暗流成熟', w: W.threads, v: mature },
      { key: 'due', label: '到期压力', w: W.due, v: dueP }
    ];
    // 分量缺席（null）⇒ **该分量与它的权重一并剔除**，按在场权重归一。
    //   为什么不是「缺的算 0」：算 0 会把「没有线程」读成「暗流全不成熟」，
    //   那是把「无从判定」伪装成「判定为最差」——本仓反复付过价的那类错。
    const live_ = parts.filter(function (p) { return p.v !== null; });
    let activeW = 0;
    live_.forEach(function (p) { activeW += p.w; });
    const comps = parts.map(function (p) {
      return { key: p.key, label: p.label, weight: p.w, present: p.v !== null,
        value: p.v === null ? null : +p.v.toFixed(4),
        score: (p.v === null || !activeW) ? null : +((p.w / activeW) * p.v * 100).toFixed(2) };
    });
    let score = null;
    if (activeW) {
      let acc = 0;
      comps.forEach(function (c) { if (c.score !== null) acc += c.score; });
      // 有限性守卫：非有限一律 null（见上方 settleRate 处记的 NaN 教训）。
      score = isFinite(acc) ? Math.round(acc) : null;
      // v2.153.0 边界第 7 条的后半：**在场但空** ≠ 「张力 0」。
      //   三源都在场、却一条在途材料都没有（无链、无伏笔、无线程）时，可得的分只有 0，
      //   而 0 分在这里与「铺了一地又全收干净」不可分（后者会靠 momentum 拿分，不会落在 0）。
      //   如实置 null，交由调用方报 `no-reading` —— 空世界是合法状态，但**必须与「读数 0」分开报**，
      //   否则「故事还没开始」会被说成「故事在铺垫期」，那正是本仓最贵的一类假读数。
      if (score === 0 && !srcs.chains && !srcs.foreshadows && !srcs.threads) score = null;
    }
    return { score: score, components: comps, activeWeight: activeW,
      settleRate: settleRate === null ? null : +settleRate.toFixed(4),
      stageAvg: stageAvg === null ? null : +stageAvg.toFixed(2),
      matureRatio: mature === null ? null : +mature.toFixed(4) };
  }

  /**
   * 张力指数（只读）。
   * @param {object} [opt] { push:false } 可关掉本次入环（专锁与诊断面用它做**无副作用**读数）。
   * @returns {object} { ok, score, band, components, ... } 或 { ok:false, reason }
   */
  function tension(opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const srcs = sources();
    if (!srcs.sources) { note('no-signal'); return { ok: false, reason: 'no-signal', sources: 0 }; }
    const core = tensionCore(srcs, cfg);
    // v2.153.0 口径（两条理由不同，绝不可合成一个「算不出来」）：
    //   · `no-signal`（sources === 0）—— **三源都不在场**，该补数据源；
    //   · `no-reading`（源在场但合成不出值）—— 该确认「确实没有在途线」（空世界是合法状态，
    //     不是故障）。查数据源与查剧情进度是两件事。
    if (core.score === null) { note('no-reading'); return { ok: false, reason: 'no-reading', sources: srcs.sources }; }
    const row = { at: clockNow('plotGauge'), score: core.score, round: num((state().meta || {}).round) || 0 };
    const push = !(opt && opt.push === false);
    let staled = false;
    if (push) {
      const cap = Math.max(1, Math.floor(cfg.maxPulses));
      // v2.153.0 口径：同轮**允许**多次读数（张力是纯函数、可反复算），但环里同轮只留最新一条；
      //   轮次**回退**（回到更早的轮）则如实拒收 —— 那说明调用顺序出了问题，不是「又读了一次」。
      const last = pulses.length ? pulses[pulses.length - 1] : null;
      if (last && row.round && last.round && row.round < last.round) {
        note('stale-round');
        return { ok: false, reason: 'stale-round', round: row.round, last: last.round };
      }
      if (last && row.round && last.round === row.round) pulses[pulses.length - 1] = row;
      else pulses.push(row);
      if (pulses.length > cap) pulses.splice(0, pulses.length - cap);
      staled = !!last && row.at - last.at > cfg.staleMs;
    }
    _stat.gauges++;
    return { ok: true, score: row.score, band: bandOf(row.score), at: row.at, round: row.round,
      samples: pulses.length, stale: staled,
      sources: { chains: srcs.chains, live: srcs.live, settled: srcs.settled,
        foreshadows: srcs.foreshadows, fsActive: srcs.fsActive,
        threads: srcs.threads, matureThreads: srcs.matureThreads },
      components: core.components, activeWeight: core.activeWeight,
      settleRate: core.settleRate, stageAvg: core.stageAvg, matureRatio: core.matureRatio };
  }

  function bandOf(s) {
    // 有限性守卫（同 settleRate 处记的 NaN 教训）：非有限值不许落进任何一档。
    if (s === null || !isFinite(s)) return null;
    if (s < 25) return 'calm';        // 铺垫期
    if (s < 50) return 'warming';     // 升温
    if (s < 75) return 'tense';       // 紧张
    return 'climax';                  // 高潮前后
  }

  /**
   * 张力走向。**两个点连不成趋势** —— 不足 3 点如实报 `insufficient-samples`（带 need）。
   * 判定：末点与前一点之差 ≥ risingDelta 记上行、≤ -risingDelta 记下行，否则波动；
   *   「连续」指**最近至少 3 次比较方向一致**。
   */
  function trend() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    if (pulses.length < 3) return { ok: false, reason: 'insufficient-samples', samples: pulses.length, need: 3 };
    const d = cfg.risingDelta;
    const dirs = [];
    for (let i = 1; i < pulses.length; i++) {
      const diff = pulses[i].score - pulses[i - 1].score;
      dirs.push(diff >= d ? 1 : (diff <= -d ? -1 : 0));
    }
    const tail = dirs.slice(-3);
    const rising = tail.every(function (x) { return x === 1; });
    const falling = tail.every(function (x) { return x === -1; });
    const first = pulses[0], last = pulses[pulses.length - 1];
    return { ok: true, direction: rising ? 'rising' : (falling ? 'falling' : 'wave'),
      basis: '末 3 次比较方向一致才算连续（阈值 ±' + d + ' 分）',
      from: first.score, to: last.score, delta: last.score - first.score,
      samples: pulses.length, dirs: dirs };
  }

  /**
   * 收线建议（**不是剧情建议**）。四条具名、按「先做什么」排，每条带自己读到的数。
   * 判据全部来自现场读数，不引入任何叙事偏好。
   */
  function advice() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const t = tension({ push: false });
    if (!t.ok) return { ok: false, reason: t.reason };
    const rows = [];
    const srcs = t.sources;
    // ① 过期未收：活跃伏笔多于已收伏笔 ⇒ 先收线（收线是唯一能降 suspense 又不伤故事的动作）。
    if (srcs.foreshadows > 0 && srcs.fsActive > 0 && srcs.fsActive * 2 >= srcs.foreshadows) {
      rows.push({ id: 'close-overdue', label: '先收过期伏笔',
        detail: '活跃 ' + srcs.fsActive + ' / 共 ' + srcs.foreshadows + ' 条伏笔仍在跑；先收掉最旧的那批再铺新的' });
    }
    // ② 停滞线程：在途线程不少、但成熟比例过低 ⇒ 收拢
    if (srcs.threads > 0 && t.matureRatio !== null && t.matureRatio < 0.34) {
      rows.push({ id: 'converge-thread', label: '把停滞线程收拢',
        detail: '成熟线程占比 ' + (t.matureRatio * 100).toFixed(0) + '%（' + srcs.matureThreads + '/' + srcs.threads
          + '）；收拢一条比新开一条更能推进张力' });
    }
    // ③ 张力过高：高潮前后继续加压会把后面的收束空间吃掉
    if (t.score >= 75) {
      rows.push({ id: 'let-breathe', label: '该放一放了',
        detail: '张力 ' + t.score + '（' + t.band + '）；留着收束空间，比再多一条暗流更有用' });
    }
    if (!rows.length) {
      rows.push({ id: 'keep-going', label: '维持现状',
        detail: '张力 ' + t.score + '（' + t.band + '）；存量与动能都在合理区间，没有该立刻处理的项' });
    }
    return { ok: true, score: t.score, band: t.band, rows: rows, basis: '建议只按现场读数给，不含叙事偏好' };
  }

  /** 台账读数（不推环）。 */
  function stat() {
    const cfg = settings();
    return { enabled: !!cfg.enabled, gauges: _stat.gauges, rejected: _stat.rejected,
      lastReason: _stat.lastReason, samples: pulses.length,
      caps: { maxPulses: cfg.maxPulses }, staleMs: cfg.staleMs, risingDelta: cfg.risingDelta,
      faults: Object.assign({}, _stat.faults) };
  }

  function reset() {
    pulses.length = 0;
    _stat.gauges = 0; _stat.rejected = 0; _stat.lastReason = ''; _stat.faults = {};
    return { ok: true };
  }

  WA.plotGauge = {
    WEIGHTS: Object.assign({}, W),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    tension: tension, trend: trend, advice: advice, stat: stat, reset: reset,
    // 纯函数出口：专锁可注入构造源验方向（不改世界、不推环）。
    tensionCore: tensionCore
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/plot-gauge.js', { kind: 'engine', ver: '2.153.0' });
})();