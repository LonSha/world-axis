/**
 * WorldAxis engines/tool-diag.js (v0.9.2) — 自检报告与诊断包（纯只读）
 * 缝合来源：DlSNlGHT World —— world-engine-diag.js（分级采集 + 脱敏 + safe 包裹）
 *
 * 与 inspector-state / tool-analyzer 的分工：
 *  - inspector-state ：世界数据「逻辑层」一致性（事件/势力/认知/引用）
 *  - tool-analyzer    ：世界数据「态势层」量化（六路压力/负载）
 *  - tool-diag        ：扩展「运行环境层」——模块装载完整性、注入落地、UI 绑定、视图开关、
 *                       缓存/工作流/API 通道状态；即「为什么它没跑起来」的排查入口
 *
 * 设计约定：
 *  - 每一节均 safe 包裹，单节炸不拖垮整包
 *  - 默认脱敏：不导完整 prompt、不导 API Key、不导聊天正文，只报长度/计数/角色链
 *  - 只读：不写 store、不改配置、不改 prompt
 */
(function () {
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const mainWin = WA.mainWin || G;

  // OPV29-07：注册表 / 可选面名单 / 面板绑定表 / 引擎端口表在 engines/tool-diag-tables.js（纯表）。
  //   求值期先取表，**缺表当场抛错** —— 缺表的自检会把「模块全在」报成「模块全缺」，
  //   那是「不崩的错」，比崩溃更难发现。
  const __TD = WA.toolDiagTables;
  if (!__TD || !__TD.MODULE_EXPORTS || !__TD.UI_BINDINGS || !__TD.ENGINE_PORTS) {
    throw new Error('tool-diag: 诊断表未装载（engines/tool-diag-tables.js 必须先于 engines/tool-diag.js 装载）');
  }
  const MODULE_EXPORTS = __TD.MODULE_EXPORTS;
  const OPTIONAL_EXPORTS = __TD.OPTIONAL_EXPORTS;
  const UI_BINDINGS = __TD.UI_BINDINGS;
  const ENGINE_PORTS = __TD.ENGINE_PORTS;

  const PACKAGE_FORMAT = 'worldaxis-diag';
  const PACKAGE_VERSION = 2;

  function safe(fn, fallback) {
    try { const v = fn(); if (v !== undefined) return v; }
    catch (e) { return { error: String((e && e.message) || e) }; }
    return fallback === undefined ? null : fallback;
  }
  /** v2.39.0: 轮次读口——唯一真源 WA.evolution.roundOf（未加载时兜底 evolution.round）。 */
  function roundOfSafe(state) {
    try { if (WA.evolution && typeof WA.evolution.roundOf === 'function') return WA.evolution.roundOf(state); } catch (e) {}
    try { const s = state || WA.store.get(); if (s && s.evolution && typeof s.evolution.round === 'number') return s.evolution.round; } catch (e) {}
    return 0;
  }
  function len(a) { return Array.isArray(a) ? a.length : 0; }
  function redact(v) {
    if (v == null) return v;
    const s = String(v);
    if (!s) return s;
    if (s.length <= 6) return '***';
    return s.slice(0, 3) + '***' + s.slice(-2);
  }
  function getCtx() { return safe(function () { const S = mainWin.SillyTavern; return S && S.getContext ? S.getContext() : null; }, null); }

  // ── 1. 元信息 ─
  function secMeta() {
    return {
      extVersion: safe(function () { return WA.VERSION || WA.version || null; }, null),
      packageFormat: PACKAGE_FORMAT,
      packageVersion: PACKAGE_VERSION,
      collectedAt: safe(function () { return new Date().toISOString(); }, ''),
      userAgent: safe(function () { return (mainWin.navigator && mainWin.navigator.userAgent) || '未知'; }, '未知')
    };
  }

  // ── 2. 运行环境／宿主能力 ──
  function secEnv() {
    return safe(function () {
      const ctx = getCtx();
      const chat = (ctx && ctx.chat) || [];
      let user = 0, ai = 0;
      for (let i = 0; i < chat.length; i++) { if (chat[i] && chat[i].is_user) user++; else ai++; }
      return {
        chatId: (ctx && ctx.chatId) || null,
        chat: { total: chat.length, user: user, ai: ai },
        characterId: (ctx && ctx.characterId != null) ? ctx.characterId : null,
        hasChatMetadata: !!(ctx && ctx.chatMetadata),
        tavernApi: {
          setExtensionPrompt: !!(ctx && typeof ctx.setExtensionPrompt === 'function'),
          updateChatMetadata: !!(ctx && typeof ctx.updateChatMetadata === 'function'),
          saveMetadataDebounced: !!(ctx && typeof ctx.saveMetadataDebounced === 'function'),
          saveChat: !!(ctx && typeof ctx.saveChat === 'function')
        },
        eventSource: !!(ctx && ctx.eventSource),
        eventTypesKnown: !!(ctx && (ctx.eventTypes || ctx.event_types))
      };
    }, {});
  }

// ── v2.50.0: 宿主两侧 + 时间轴三节（消费面）────────────────────────────
  // 为什么单独出节：这三笔账此前**不存在**（宿主世界书激活、楼层变更处置、台账时间维），
  //   如果不进诊断包，它们就只是「引擎里有、用户永远看不到」——与 v2.49.0 修掉的主块账同病。
  // 三态如实：宿主不给事件 ⇒ state='unsupported' 并原样带出文案，绝不落成「一切正常」。
  function secHostWb() {
    return safe(function () {
      if (!WA.hostWbTrace) return { error: 'hostWbTrace 模块不可用' };
      const st = WA.hostWbTrace.stat();
      return {
        state: st.state, subscribed: st.subscribed, attempts: st.attempts,
        lastCount: st.lastCount, lastNames: st.lastNames, at: st.lastAt,
        sysExcluded: st.sysExcluded,
        shapeUnknownKeys: st.shapeUnknownKeys,
        rounds: st.rounds,
        text: WA.hostWbTrace.stateText ? WA.hostWbTrace.stateText() : null
      };
    });
  }
  function secFloorChanges() {
    return safe(function () {
      if (!WA.floorChanges) return { error: 'floorChanges 模块不可用' };
      const p = WA.floorChanges.plan();     // 只读：出计划、不执行
      return {
        state: p.state, subscribedAt: WA.floorChanges.stat().subscribed,
        events: (p.events || []).length,
        scanned: p.scanned,
        missing: p.missing, changed: p.changed,
        guardVerdict: p.guard ? p.guard.verdict : null,
        guardNote: p.guard ? p.guard.note : null,
        actions: (p.actions || []).map(function (a) { return { act: a.act, needConfirm: a.needConfirm, detail: a.detail }; }),
        executable: p.executable,
        text: WA.floorChanges.stateText ? WA.floorChanges.stateText() : null
      };
    });
  }
  function secLedgerTimeline() {
    return safe(function () {
      if (!WA.ledgerTimeline) return { error: 'ledgerTimeline 模块不可用' };
      const st = WA.ledgerTimeline.stat();
      return {
        sites: st.sites, failing: st.failing, stalled: st.stalled,
        stallThreshold: st.stallThreshold,
        detail: st.detail,
        text: WA.ledgerTimeline.summaryText ? WA.ledgerTimeline.summaryText() : null
      };
    });
  }
  // ── v2.51.0（第三十六面）: 叙事工艺设置面 ────────────────────────────
  // 为什么单独出节：rules.craft 的正文自 v2.x 起就写着「叙事工艺按设置面口径执行
  //   （字数/段落/视角/人称/转述/演绎）」——而那个设置面**不存在**，即「声明了消费口径
  //   却没有产生方」的招牌缺陷形态。本版补上产生方（engines/style.js）之后，若诊断包里
  //   看不到它，就只是把同一型病从「无产生方」换成「有产生方但没人能看见它为什么不出话」。
  // 本节的判据设计（三态如实，不落「一切正常」）：`enabled` 只说明「轴选得对不对」，
  //   真正决定「正文有没有被约束」的是**第二道闸**——render 侧的可见性源。两者必须并列，
  //   否则「我明明设了却没生效」与「我根本没设」在诊断包里同形。
  function secStyle() {
    return safe(function () {
      if (!WA.style || typeof WA.style.styleStat !== 'function') return { error: 'style 模块不可用' };
      const st = WA.style.styleStat();
      const vis = (WA.render && WA.render.getVisibility) ? WA.render.getVisibility() : {};
      // 覆盖度交叉校验：档位表（CHOICES）↔ 正文表（PARA_TEXT 等）是两处手写。
      //   漂移的症状是静默的（档位可选、写入合法、正文零约束），故这里直接把「有档位但正文为空」
      //   的轴列出来——空数组 = 两张表一致，非空 = 存在「看起来生效其实不出话」的档位。
      const uncovered = [];
      try {
        const cov = WA.style.textCoverage ? WA.style.textCoverage() : {};
        Object.keys(cov).forEach(function (axis) {
          Object.keys(cov[axis]).forEach(function (c) {
            if (c !== 'off' && !(cov[axis][c] > 0)) uncovered.push(axis + '=' + c);
          });
        });
      } catch (e) { /* 覆盖度取不到不影响其余诊断 */ }
      return {
        key: st.key, axes: st.axes,
        values: st.values, labels: st.labels,
        enabled: st.enabled,
        summary: st.summary,
        // 二道闸：可见性源关着 ⇒ 「设置生效但正文不注入」——这是本面最容易被误判成
        //   「新功能坏掉了」的局面，必须与 enabled 分开报。
        injectSource: 'style',
        injectReady: !!vis.style,
        customLen: st.customLen, customMax: st.customMax,
        reads: st.reads, writes: st.writes, rejects: st.rejects,
        fallbacks: st.fallbacks, lastFallback: st.lastFallback,
        lastReject: st.lastReject,
        builds: st.builds, emptyBuilds: st.emptyBuilds,
        lastLen: st.lastLen, lastAt: st.lastAt,
        uncovered: uncovered,
        text: WA.style.summaryText ? WA.style.summaryText() : null
      };
    });
  }
  function secIntel() {
    return safe(function () {
      if (!WA.intel || typeof WA.intel.stat !== 'function') return { error: 'intel 模块不可用' };
      const st = WA.intel.stat(); const cfg = WA.intel.getSettings ? WA.intel.getSettings() : {};
      const nw = typeof WA.intel.networkStat === 'function' ? WA.intel.networkStat() : null;
      return { enabled: !!cfg.enabled, links: st.links || 0, intel: st.intel || 0, blocked: st.blocked || 0, lastReason: st.lastReason || '', levels: WA.intel.LEVELS || [],
        network: nw ? { people: nw.people, held: nw.held, inTransit: nw.inTransit, currentRound: nw.currentRound, cap: nw.cap } : { error: 'networkStat 不可用' } };
    });
  }

  function secOrg() {
    return safe(function () {
      if (!WA.org || typeof WA.org.stat !== 'function') return { error: 'org 模块不可用' };
      const st = WA.org.stat(); const cfg = WA.org.getSettings ? WA.org.getSettings() : {};
      // v2.92.0（O5）：资源账本读数——存量 / 流量 / 笔数 / 异常笔 / 对账结论。
      //   ledgerView 与 reconcile 的真消费方各在此一处（「导出即有承诺」）。
      const led = (WA.org.ledgerView ? safe(function () { return WA.org.ledgerView(); }, null) : null);
      // v2.94.0（O6/O8）：经济风读数 + 流水卷头（**纯读**：exportJournal 不挤出、不清空、不改 stat）。
      //   本节同样**不调** grant / transfer——观测不得改变被观测对象。
      const cli = led && led.climate ? led.climate : null;
      const vol = (WA.org.exportJournal ? safe(function () { const v = WA.org.exportJournal(); return v && v.ok ? { format: v.format, formatVersion: v.formatVersion, cap: v.cap, entries: v.entries, recorded: v.recorded, dropped: v.dropped, truncated: v.truncated, savedAt: v.savedAt } : { error: (v && v.reason) || 'export-unavailable' }; }, null) : null);
      const rc = (WA.org.reconcile ? safe(function () { return WA.org.reconcile(); }, null) : null);
      // v2.95.0（X2）：组织面读数——名册规模 / 欠薪总量 / 经济风两档（词与倍率同源）。
      //   只读：organizationSummary 不调 grant / transfer（观测不得改变被观测对象）。
      const orgz = led && led.organization ? led.organization : null;
      return { enabled: !!cfg.enabled, grants: st.grants || 0, transfers: st.transfers || 0, blocked: st.blocked || 0,
        lastReason: st.lastReason || '', kinds: WA.org.KINDS || [],
        ledger: led ? {
          entries: led.entries, recorded: led.recorded, dropped: led.dropped, holderCount: led.holderCount,
          flowIn: led.flow.in, flowOut: led.flow.out,
          abnormal: led.anomalies.count, abnormalDetail: led.anomalies,
          reconciled: rc ? rc.ok : led.reconciled.ok, reconcileBreaks: rc ? rc.breakCount : led.reconciled.breakCount,
          truncated: led.reconciled.truncated
        } : { error: 'ledgerView 不可用' },
        // v2.289.0（EXV7-5）：势力账本聚合与 ledgerView 同源，面板和诊断不各自扫描存档。
        accounts: led && led.accounts ? led.accounts : { error: 'faction accounts 不可用' },
        // v2.94.0（O8）：经济风——引擎缺席 / 字段缺失 / 表外气候词三态照实带出，不回落成「平稳」。
        // v2.95.0（X2）：名册与欠薪——「组织面有没有人、欠着谁」在诊断里可读。
        organization: orgz ? { rosterCount: orgz.rosterCount, owedTotal: orgz.owedTotal,
          factions: (orgz.factions || []).length,
          tide: orgz.tide ? { known: !!orgz.tide.known, reason: orgz.tide.reason,
            climate: orgz.tide.climate, mul: orgz.tide.mul, word: orgz.tide.word } : null }
          : { error: 'organizationSummary 不可用' },
        climate: cli ? { available: cli.available, reason: cli.reason, climate: cli.climate,
          recognized: !!cli.recognized, signals: (cli.signals || []).length } : { error: 'climate 不可用' },
        // v2.117.0（计划二 B5）：项目面与债务面——「组织在办什么 / 欠着谁为什么」。
        //   纯读：projectView / debtsView 都不调 grant / transfer。
        //   逐个势力取项目（诊断面要看到全部势力的项目，不只第一个），债务同理。
        projects: (function () {
          if (!WA.org || typeof WA.org.projectView !== 'function') return { error: 'projectView 不可用' };
          return safe(function () {
            const st2 = WA.store.get() || {};
            const facs = ((st2.evolution || {}).factions) || [];
            const rows = [];
            let openCount = 0, missingCount = 0;
            facs.forEach(function (f) {
              if (!f) return;
              const v = WA.org.projectView(f.name);
              if (!v || !v.ok) return;
              v.projects.forEach(function (p) {
                if (p.live) openCount++;
                if (p.missing.length) missingCount++;
                rows.push({ faction: f.name, what: p.what, status: p.status, by: p.by, due: p.due,
                  live: p.live, tier: p.tier, tierWords: p.tierWords,
                  covered: p.covered.filter(function (x) { return x.need !== null; })
                    .map(function (x) { return x.item + ':' + x.covered + '/' + x.need; }).join(','),
                  narrative: p.covered.filter(function (x) { return x.need === null; })
                    .map(function (x) { return x.item + ':' + (x.tierWord || 'unrecorded'); }).join(','),
                  missing: p.missing.map(function (x) { return x.item + ':' + x.gap; }).join(','),
                  canClose: p.canClose });
              });
            });
            return { count: rows.length, openCount: openCount, missingCount: missingCount,
              rows: rows.slice(0, 12) };
          }, { error: 'projectView-throw' });
        })(),
        debts: (function () {
          if (!WA.org || typeof WA.org.debtsView !== 'function') return { error: 'debtsView 不可用' };
          return safe(function () {
            const st2 = WA.store.get() || {};
            const facs = (((st2.evolution || {}).factions) || []).map(function (f) { return f && f.name; }).filter(Boolean);
            const byFaction = facs.map(function (n) {
              const v = WA.org.debtsView('faction', n);
              if (!v || !v.ok) return { faction: n, error: v && v.reason };
              return { faction: n, receivable: v.receivableTotal, payable: v.payableTotal,
                receivableRows: v.receivable.length, payableRows: v.payable.length,
                // 逐条带原因：欠账答不出「为什么欠」，日后没人核得出它是不是编的。
                reasons: v.receivable.concat(v.payable).slice(0, 6)
                  .map(function (x) { return (x.item || '') + ':' + (x.why || ''); }) };
            });
            const tot = byFaction.reduce(function (a2, b) {
              return { recv: a2.recv + (b.receivable || 0), pay: a2.pay + (b.payable || 0) };
            }, { recv: 0, pay: 0 });
            return { factions: byFaction.slice(0, 8), receivableTotal: tot.recv, payableTotal: tot.pay };
          }, { error: 'debtsView-throw' });
        })(),
        // v2.94.0（O6）：流水卷头（能否跨会话可查，看它是不是空卷 + 有没有被截断）。
        journal: vol && vol.error ? vol : (vol ? {
          format: vol.format, formatVersion: vol.formatVersion, cap: vol.cap,
          entries: vol.entries, recorded: vol.recorded, dropped: vol.dropped, truncated: vol.truncated
        } : { error: 'exportJournal 不可用' }) };
    });
  }

  function secLongline() {
    return safe(function () {
      if (!WA.longline || typeof WA.longline.stat !== 'function') return { error: 'longline 模块不可用' };
      const st = WA.longline.stat(); const cfg = WA.longline.getSettings ? WA.longline.getSettings() : {};
      const pr = WA.longline.pressure ? WA.longline.pressure() : { count: 0, worstMs: 0, level: 'clear' };
      return { enabled: !!cfg.enabled, graceMs: cfg.graceMs, promises: st.promises || 0, sweeps: st.sweeps || 0,
        overdue: st.overdue || 0, blocked: st.blocked || 0, lastReason: st.lastReason || '',
        pressure: pr.level, worstMs: pr.worstMs, terminal: WA.longline.TERMINAL || [] };
    });
  }

  /**
   * v2.135.0（E6）：伏笔生命周期的只读读数。
   *   本节的消费面与 secLongline 同规格——诊断包是这些读数的**产品侧真读者**
   *   （漏登记 ⇒ 对应成员落进死导出面，当场红灯）。
   *   报三桶 + 五态计数 + 计量账；`faults` 只记异常（disabled / bad-id / bad-text /
   *   missing-event / store-unavailable），业务拒收走 counters.blocked（口径见引擎头部边界 6）。
   */
  function secForeshadow() {
    return safe(function () {
      if (!WA.foreshadow || typeof WA.foreshadow.stat !== 'function') return { error: 'foreshadow 模块不可用' };
      const st = WA.foreshadow.stat(); const cfg = WA.foreshadow.getSettings ? WA.foreshadow.getSettings() : {};
      return { enabled: !!cfg.enabled, staleMs: cfg.staleMs, maxItems: cfg.maxItems, cap: cfg.cap,
        total: st.total || 0, active: st.active || 0, resolved: st.resolved || 0, closed: st.closed || 0,
        stale: st.stale || 0, avgResolveMs: st.avgResolveMs || 0, resolveSamples: st.resolveSamples || 0,
        byStatus: st.byStatus || {}, counters: st.counters || {}, faults: st.faults || {},
        // v2.555.0：名额面读数（最近一次注入单）。null = 本进程还没构建过；picked 0 = 构建过但空表。
        //   与 stale 并列报出：`stale: 5` 说的是「作者面有 5 条过期」，
        //   `block: { stale: 5, picked: 1 }` 说的是「注入面只提 1 条」—— 两个数不许互相顶替。
        block: st.block || null,
        // 三个封闭集合一并报出（五态枚举是判据的比对基准，不是装饰）。
        statuses: (WA.foreshadow.STATUS || []).slice(),
        activeStates: (WA.foreshadow.ACTIVE || []).slice(),
        terminalStates: (WA.foreshadow.TERMINAL || []).slice() };
    });
  }

  /**
   * v2.139.0（E9）：势力关系网采集节。
   *   报的**不是**「有几条边」这种一眼能数出来的量，而是三种**只在读数上分得开**的情形：
   *     · `nodes/edges` —— 图有多大（规模）；
   *     · `reason` —— 最近一次是 `built` 还是 `empty-graph`（**算出来的空图**与
   *       「没东西可算」是两件事，前者是 `ok:true` 的合法结果）；
   *     · `dropped` —— 有多少节点**没进图**（超容量 / 重名 / 名字为空）。
   *   末一条是本节的要点：图小与势力少在旧读数上长得一样，`dropped` 让它们分开。
   *   **零副作用**：只读 stat 与 settings，不建图（建图会计数、会污染现场读数）。
   */
  /**
   * v2.148.0（RP1）：性能历史台账读数——「一直在变慢吗」第一次可答。
   *   只读 stat 与 trend（trend 纯读内存台账，不计时、不落盘、不重跑基准）。
   *   **零副作用**：不调 record（record 是 interceptor 计时点的职责，诊断只旁观）。
   */
  function secPerfLedger() {
    return safe(function () {
      if (!WA.perfLedger || typeof WA.perfLedger.stat !== 'function') return { error: 'engines/perf-ledger.js 未加载（性能历史读数缺席）' };
      const st = WA.perfLedger.stat();
      const cfg = WA.perfLedger.getSettings();
      const tr = WA.perfLedger.trend();
      return {
        enabled: st.enabled, sources: st.sources, recorded: st.recorded, trendCalls: st.trendCalls,
        caps: st.caps, degradeSlope: cfg.degradeSlope,
        // v2.148.0：退场归因（disabled / type / source-cap / no-reading）。
        //   只报 recorded 的话，「台账在长」与「台账在退」在诊断面上长得一样——
        //   而这两种局面一个不用管、一个要立刻查（源数超限？生产方传错参数？）。
        skipReasons: st.skipReasons || {},
        degrading: tr.ok ? tr.degrading : null,
        rows: tr.ok ? tr.rows.slice(0, 5) : null, // 只带 Top5（诊断包体积纪律）
        degradingNote: tr.ok && tr.degrading > 0 ? ('趋势检出 ' + tr.degrading + ' 个劣化源（斜率 > ' + cfg.degradeSlope + 'ms/样本）') : null
      };
    });
  }

  /**
   * v2.148.0（RP2）：磁带卷仓库读数——跨会话重放的仓库面。
   *   只读 stat 与 list。**零副作用**：不 save / 不 load / 不 drop（那些是面板按钮的职责）。
   */
  function secTapeStore() {
    return safe(function () {
      if (!WA.tapeStore || typeof WA.tapeStore.stat !== 'function') return { error: 'engines/tape-store.js 未加载（磁带仓库读数缺席）' };
      const st = WA.tapeStore.stat();
      const li = WA.tapeStore.list();
      return {
        total: st.total, cap: st.cap, saved: st.saved, loaded: st.loaded, evicted: st.evicted,
        writeFails: st.writeFails, lastWriteFailReason: st.lastWriteFailReason,
        rows: li.ok ? li.rows.slice(0, 5) : null,
        storageNote: st.total + '/' + st.cap + ' 卷' + (st.writeFails > 0 ? '；落盘失败 ' + st.writeFails + ' 次' : '')
      };
    });
  }

  function secFactionGraph() {
    return safe(function () {
      if (!WA.factionGraph || typeof WA.factionGraph.stat !== 'function') return { error: 'engines/faction-graph.js 未加载（势力关系网读数缺席）' };
      const st = WA.factionGraph.stat();
      const cfg = WA.factionGraph.getSettings ? WA.factionGraph.getSettings() : {};
      return {
        enabled: !!cfg.enabled, allyIdx: cfg.allyIdx, hostileIdx: cfg.hostileIdx, maxNodes: cfg.maxNodes,
        builds: st.builds || 0, tensions: st.tensions || 0, clusters: st.clusters || 0,
        nodes: st.nodes || 0, edges: st.edges || 0,
        // dropped 与 nodes 必须**分开报**：合成「共 N 个」之后，就再也答不出
        //   「图为什么比势力少」（超容量？重名？空名？三种处置完全不同）。
        dropped: st.dropped || 0,
        blocked: st.blocked || 0, lastReason: st.lastReason || '', lastAt: st.lastAt || 0,
        faults: Object.assign({}, st.faults || {}),
        relationKeys: (WA.factionGraph.RELATION_KEYS && WA.factionGraph.RELATION_KEYS()) || null,
        // v2.139.0（E9）：状态词表也一并带出。两套词表都是**单一真源**（evolution 的
        //   FACTION_RELATION / FACTION_STATUS）——诊断面把两份都报出来，才能交叉核对
        //   「引擎用的档位」与「编辑器能填的档位」是同一套（各带副本必然漂移）。
        statusKeys: (WA.factionGraph.STATUS_KEYS && WA.factionGraph.STATUS_KEYS()) || null,
        // v2.139.0（E9）：逐节点热度前几名（`heat` 的真产品消费方）。
        //   为什么不是又一份「全表」：这张表答的是「**最紧张的是谁**」——诊断包里先给
        //   头部几行就够定位，全量逐节点留给面板的关系网入口。两处都读同一个 heat()。
        hot: (function () {
          try {
            const h = WA.factionGraph.heat ? WA.factionGraph.heat() : null;
            if (!h || !h.ok) return null;
            return h.rows.slice(0, 5).map(function (r) {
              return { name: r.name, hostiles: r.hostiles, allies: r.allies, unknowns: r.unknowns };
            });
          } catch (e) { return null; }
        })()
      };
    });
  }
  function secNoesis() {
    return safe(function () {
      if (!WA.noesis || typeof WA.noesis.boundary !== 'function') return { error: 'engines/noesis.js 未加载（防全知读数缺席）' };
      const b = WA.noesis.boundary();
      return {
        enabled: !!b.enabled, rangeEnabled: !!b.rangeEnabled, timeEnabled: !!b.timeEnabled,
        // v2.143.0（F4）：在岗闸门是**第三轴**（与感知半径 / 时点并列），开关位必须能被诊断面看见。
        dutyEnabled: !!b.dutyEnabled,
        maxLeaks: b.maxLeaks,
        knows: b.knows || 0, allows: b.allows || 0, denies: b.denies || 0,
        gates: b.gates || 0, scans: b.scans || 0,
        // leaks 与 scans 必须**分开报**：合成「查过 N 次」之后，就再也答不出
        //   「是真穿帮多，还是只是扫得勤」（前者要改边界，后者只是用法不同）。
        leaks: b.leaks || 0,
        blocked: b.blocked || 0, lastReason: b.lastReason || '', lastAt: b.lastAt || 0,
        faults: Object.assign({}, b.faults || {}),
        // 四源在场面：哪个知情面缺席，裁决就少一票——诊断面必须能看出来「现在有几源在把门」。
        sources: (b.sources || []).map(function (s) { return { key: s.key, loaded: !!s.loaded }; }),
        // v2.141.0（F2）：四码分布**分开报**。合成一个「不知」之后，就再也答不出
        //   该补账（not-registered）、该拦人（not-holder）、该等时间（premature），
        //   还是该叫他一声（attenuated）——四种处置完全不同。
        //   感知三态同理：perceiveIn / perceiveOut / perceiveUnknown 各占一格。
        premature: b.premature || 0,
        perceiveIn: b.perceiveIn || 0, perceiveOut: b.perceiveOut || 0, perceiveUnknown: b.perceiveUnknown || 0,
        // v2.143.0（F4）：在岗闸门两码同样**分开报** —— off-duty（有岗没上）该等排班 / 改日程，
        //   not-in-office（没有岗）该走任职流程。合成一个「不在岗」就再也答不出该动哪一手。
        offDuty: b.offDuty || 0, notInOffice: b.notInOffice || 0,
        // v2.144.0（F5）：记忆失真面。第四轴开关位必须能被看见（关掉一轴 = 如实报缺席）；
        //   `distorted` 与 denies 分开报 —— 「他记岔了」该更正记录，「他不该知道」该拦住发言。
        fidelityEnabled: !!b.fidelityEnabled, distorted: b.distorted || 0
      };
    });
  }
  /**
   * v2.141.0（F2）：生理与照护真实层的诊断节。
   *   报**计数 + 枚举表规模 + 现场行数**，不报病名 —— 病名是剧情内容，
   *   诊断包会被导出与分享，症状与病名不该随包外流（与 noesis「不列秘密名」同一条纪律）。
   */
  function secLifeline() {
    return safe(function () {
      if (!WA.lifeline || typeof WA.lifeline.boundary !== 'function') return { error: 'engines/lifeline.js 未加载（生理与照护读数缺席）' };
      const b = WA.lifeline.boundary();
      return {
        enabled: !!b.enabled, maxRows: b.maxRows,
        regs: b.regs || 0, advances: b.advances || 0, reads: b.reads || 0,
        blocked: b.blocked || 0, lastReason: b.lastReason || '',
        faults: Object.assign({}, b.faults || {}),
        // 四张表的规模：词表被改小/改大在这里看得见（判据口径的可观测面）。
        kinds: (b.KINDS || []).length, course: (b.COURSE || []).length,
        limits: (b.LIMITS || []).length, steps: (b.STEPS || []).length,
        rows: b.rows || 0
      };
    });
  }
  /**
   * v2.142.0（F3）：视角锁的诊断节。
   *   报**计数 + 四类拒绝分布 + 三张表规模**，不报视角人物名与场景名
   *   —— 视角行里可能有作者预登记、尚未登场的角色，列名就是剧透
   *   （与 noesis「不列秘密名」、lifeline「不列症状名」同一条纪律）。
   */
  function secPerspective() {
    return safe(function () {
      if (!WA.perspective || typeof WA.perspective.boundary !== 'function') return { error: 'engines/perspective-lock.js 未加载（视角锁读数缺席）' };
      const b = WA.perspective.boundary();
      return {
        enabled: !!b.enabled, maxScenes: b.maxScenes, strictInterior: !!b.strictInterior,
        maxLeaks: b.maxLeaks,
        assigns: b.assigns || 0, allows: b.allows || 0, permits: b.permits || 0,
        audits: b.audits || 0, scans: b.scans || 0, leaks: b.leaks || 0,
        // 四类拒绝**分开报**（见边界 5）：合成一个「不许写」之后，
        //   作者就再也知道该改词表、先登记、补共视角，还是换渠道。
        outOfLens: b.outOfLens || 0, interiorBlocked: b.interiorBlocked || 0,
        noScene: b.noScene || 0, rows: b.rows || 0,
        lastReason: b.lastReason || '', lastAt: b.lastAt || 0,
        faults: Object.assign({}, b.faults || {}),
        // 三张表的规模：词表被改小/改大在这里看得见（判据口径的可观测面）。
        lenses: (b.LENSES || []).length, channels: (b.CHANNELS || []).length,
        access: (b.ACCESS || []).length, maxPov: b.MAX_POV || 0,
        // v2.149.0（P3）：全局观测视角（面板给谁看）。viewSwitches 是切换留痕——
        //   「谁在什么时候把它切到玩家视角」这件事必须可审计（否则「这页为什么少了一块」无从追）。
        view: b.view || 'omniscient', viewSwitches: b.viewSwitches || 0,
        viewFiltered: b.viewFiltered || 0, viewLastAt: b.viewLastAt || 0
      };
    });
  }
  /**
   * v2.149.0（X1）：世界沉积层读数——地点视角的痕迹面。
   *   只读 stat（**不跑 feel / 不跑 buildBlock**：那两个会写 stat 计数与 blocks，
   *   诊断面必须在任何面上留不下痕迹——与 secTapeStore「零副作用」同规）。
   */
  function secSediment() {
    return safe(function () {
      if (!WA.sediment || typeof WA.sediment.stat !== 'function') return { error: 'engines/sediment.js 未加载（地点沉积读数缺席）' };
      const st = WA.sediment.stat();
      const cfg = WA.sediment.getSettings();
      return {
        enabled: st.enabled, places: st.places, events: st.events, legends: st.legends,
        settled: st.settled, feels: st.feels, blocks: st.blocks, evicted: st.evicted,
        byTrace: st.byTrace || {}, caps: st.caps, traceWindowMs: cfg.traceWindowMs,
        // 表外痕迹档 / 缺地点 / 缺键 的拒收分布：合成一个「没记上」之后，
        //   作者就再也知道该改档位写法、补地点，还是补键（与 secPerspective 的 faults 同规）。
        faults: Object.assign({}, st.faults || {}),
        // v2.290.0（EXV7-6）：跨地点沉积台账。**只读投影**（placesView 不写盘、不改档位），
        //   与「不跑 feel / 不跑 buildBlock」同规：诊断面不在任何面上留痕迹。
        //   为什么必须在这里：此前 secSediment 只报「几处地方 / 几条痕迹」三个标量，
        //   「哪几处地方还留着事、各自什么档」只能靠逐个地点 feel —— 那是面板逐个循环，
        //   不是一份读数。缺这一面时的外显是「台账只有总数，点开哪个地点都得自己去猜」。
        accountsView: (function () {
          if (!WA.sediment || typeof WA.sediment.placesView !== 'function') return { error: 'placesView 缺席（沉积台账不可用）' };
          try {
            const pv = WA.sediment.placesView({ maxPlaces: 12 });
            if (!pv || pv.ok !== true) return { error: (pv && pv.reason) || 'placesView 拒收' };
            return { total: pv.total, cap: pv.cap, truncated: pv.truncated, dropped: pv.dropped,
              peakCount: pv.peakCount || {}, aliveCount: pv.aliveCount, legendCount: pv.legendCount,
              rows: (pv.rows || []).map(function (x) {
                return { place: x.place, count: x.count, alive: x.alive, legends: x.legends,
                  peak: x.peak, peakLabel: x.peakLabel };
              }),
              placesNote: pv.total + ' 处地点留有痕迹（' + pv.aliveCount + ' 条仍可辨 / '
                + pv.legendCount + ' 条已淡为传说）'
                + (pv.truncated ? '（另有 ' + pv.dropped + ' 处未列出）' : '') };
          } catch (e) { return { error: 'placesView 抛错: ' + (e && e.message ? e.message : String(e)) }; }
        })(),
        sedimentNote: st.places + '/' + (st.caps ? st.caps.places : '?') + ' 地点 · '
          + st.events + '/' + (st.caps ? st.caps.total : '?') + ' 条沉积'
          + (st.legends > 0 ? '（' + st.legends + ' 条已淡为传说）' : '')
      };
    });
  }
  /**
   * v2.153.0(RX5): 剧情深度仪读数——「这个故事现在发展到什么程度」。
   *   只读 stat 与一次**无副作用**指数（`tension({push:false})`：不推趋势环）。
   *   为什么不跑入环版本：诊断面每次调用都会往趋势环里塞一个样本，于是「打开诊断」
   *   这件事本身会改变走向读数 —— 观测污染被观测者（与 secSediment「不跑 feel」同规）。
   *   四分量与权重**全量透出**：合成值失真的第一诊断手段就是「看哪个分量在动」。
   */
  function secPlotGauge() {
    return safe(function () {
      if (!WA.plotGauge || typeof WA.plotGauge.stat !== 'function') return { error: 'engines/plot-gauge.js 未加载（剧情深度读数缺席）' };
      const st = WA.plotGauge.stat();
      const t = (typeof WA.plotGauge.tension === 'function') ? WA.plotGauge.tension({ push: false }) : null;
      const tr = (typeof WA.plotGauge.trend === 'function') ? WA.plotGauge.trend() : null;
      return {
        enabled: st.enabled, gauges: st.gauges, rejected: st.rejected, lastReason: st.lastReason,
        samples: st.samples, caps: st.caps, risingDelta: st.risingDelta,
        // 无副作用指数：ok:false 时带 reason（no-signal / disabled），**不拿 0 分冒充「故事刚开始」**
        score: (t && t.ok) ? t.score : null, band: (t && t.ok) ? t.band : null,
        reason: (t && t.ok) ? '' : ((t && t.reason) || 'unavailable'),
        components: (t && t.ok) ? t.components : [],
        sources: (t && t.ok) ? t.sources : null,
        trend: tr ? { ok: !!tr.ok, direction: tr.ok ? tr.direction : '', reason: tr.ok ? '' : tr.reason,
          samples: (typeof tr.samples === 'number') ? tr.samples : 0 } : null,
        faults: Object.assign({}, st.faults || {})
      };
    });
  }
  /**
   * v2.153.0(RX6): 多结局分支树读数——「我的选择把故事引向了多少种可能」。
   *   只读 stat 与 tree()（两者都是纯读，不推演、不预演）。
   *   `dangling` 单列：悬空边恒应为 0，但**报出来才是可核的**（不报就等于没人核）。
   */
  /**
   * v2.229.0（拓展 N11）：阻尼量规读数。与 secPlotGauge 分列不合并 ——
   *   那一个答「故事张力到几档」（剧情深度仪），这一个答「每张量表**相对目标**到了几成」
   *   （占比档位读数）。两者同名不同物，合并会让「占比制」这一新口径无处可报。
   */
  function secGauge() {
    return safe(function () {
      if (!WA.gauge || typeof WA.gauge.bandOf !== 'function') return { error: 'engines/gauge.js 未加载（量规读数缺席）' };
      const cfg = WA.gauge.getSettings();
      const st = (WA.store && WA.store.get) ? WA.store.get() : null;
      const rows = ((st && st.gauge) || {}).rows || [];
      return {
        enabled: !!cfg.enabled, rows: rows.length, maxStep: cfg.maxStep,
        // 逐表读数：val 是绝对值，band 是**相对目标**的占比档（0..4）。两者不可互相顶替 ——
        //   「涨到 30」在目标 40 与目标 4000 下是两回事（这正是占比制要治的那个缺口）。
        gauges: rows.filter(function (r) { return r && r.key; }).slice(0, 12).map(function (r) {
          const b = WA.gauge.bandOf(r.val, 100);
          return { key: r.key, val: r.val, band: b.ok ? b.band : null, bands: b.ok ? b.bands : null,
            percent: b.ok ? b.percent : null, history: (r.history || []).length };
        })
      };
    });
  }
  function secBranchTree() {
    return safe(function () {
      if (!WA.branchTree || typeof WA.branchTree.stat !== 'function') return { error: 'engines/branch-tree.js 未加载（分支树读数缺席）' };
      const st = WA.branchTree.stat();
      const t = (typeof WA.branchTree.tree === 'function') ? WA.branchTree.tree() : null;
      return {
        enabled: st.enabled, nodes: st.nodes, roots: st.roots,
        withChoice: st.withChoice, withPreview: st.withPreview,
        forks: st.forks, refused: st.refused, lastReason: st.lastReason, caps: st.caps,
        edges: (t && t.ok) ? t.edges.length : null,
        dangling: (t && t.ok) ? t.dangling : null,
        treeReason: (t && t.ok) ? t.reason : ((t && t.reason) || 'unavailable'),
        faults: Object.assign({}, st.faults || {})
      };
    });
  }
  /**
   * v2.181.0（UI 主题化）：界面主题层读数 —— 「现在套的是哪套皮、样式表到底装上没有」。
   *
   *   为什么必须有这一节：v2.174.0~v2.180.0 引入的赛博朋克主题层是**可切换**的，
   *   而「主题切了但样式没装上 / 装上了两套 / 想切回去切不掉」这三种失效在界面上
   *   表现为同一件事（看起来没变），用户无从归因。本节把三件事分开答：
   *     · 当前主题是谁（themeSwitch.current）—— 与持久化键读回的值是否一致；
   *     · 已登记的样式表有几份、当前实际挂在 DOM 上的有几份（themeStyles.ids/active）；
   *     · 主题层的构成（有几个主题可选、各自带几份样式）。
   *   只读，不装卸任何样式（诊断面不许改变被诊断的界面——与 secSediment 同规）。
   */
  function secUiTheme() {
    return safe(function () {
      const ts = WA.themeStyles;
      const sw = WA.themeSwitch;
      const ids = (ts && typeof ts.ids === 'function') ? ts.ids() : null;
      const active = (ts && typeof ts.active === 'function') ? ts.active() : null;
      // 装载顺序有语义：wa-cyberpunk-theme 提供 :root 变量，必须最先注入。
      //   把它显式报出来，顺序被改坏时这一节是唯一能看见的地方。
      const rootFirst = ids ? ids.indexOf('wa-cyberpunk-theme') === 0 : null;
      return {
        moduleLoaded: !!(ts && sw),
        themeStylesMissing: !ts ? 'ui/cyberpunk-theme.js 未加载（样式注册表缺席）' : null,
        themeSwitchMissing: !sw ? 'ui/theme-switch.js 未加载（主题开关缺席）' : null,
        registered: ids ? ids.length : null,
        registeredIds: ids,
        active: active ? active.length : null,
        activeIds: active,
        // 「登记了 N 份、装上 M 份」是切主题是否真的生效的直接证据（默认主题下 M=0 是正确态）
        consistent: (ids && active) ? active.every(function (id) { return ids.indexOf(id) >= 0; }) : null,
        rootFirst: rootFirst,
        current: sw && typeof sw.current === 'function' ? sw.current() : null,
        themes: sw && typeof sw.themes === 'function'
          ? sw.themes().map(function (t) { return { id: t.id, label: t.label, styles: (t.styles || []).length }; })
          : null,
        // 构建器库：这 5 个模块导出的是「拼 HTML 的函数」，消费方是 ui/panel.js。
        //   两个读数一起报：导出了几个（库存有多大）、其中几个已被 UI 层真调（兑现了多少）。
        //   只报其一都看不见缺口 —— 导出了 12 个而一个都没调，与导出了 12 个且全用上，
        //   在界面上长得一模一样。
        //   每模块另点出**一枚具名成员**做存在性探针：静态图只认 `WA.<ns>.<mem>` 字面形态，
        //   动态取键在静态面里等于没读（故不能只靠 Object.keys 消掉过期登记）。
        builders: (function () {
          const MODS = [
            ['cyberDashboard', 'ui/cyberpunk-dashboard.js', 'statCard'],
            ['cyberPeople', 'ui/cyberpunk-people.js', 'personCard'],
            ['cyberLogs', 'ui/cyberpunk-logs.js', 'logLine'],
            ['cyberAnimate', 'ui/cyberpunk-animations.js', 'notify'],
            ['cyberResponsive', 'ui/cyberpunk-responsive.js', 'tier']
          ];
          const panelSrc = (function () {
            try { return WA.mainDoc && WA.mainDoc.__waPanelSrc ? WA.mainDoc.__waPanelSrc : ''; } catch (e) { return ''; }
          })();
          // 具名探针表：逐模块真读一枚代表性出口（`WA.<ns>.<mem>` 形态，静态面可解析）。
          const probe = [
            typeof WA.cyberDashboard.statCard, typeof WA.cyberPeople.personCard,
            typeof WA.cyberLogs.logLine, typeof WA.cyberAnimate.notify,
            typeof WA.cyberResponsive.tier
          ];
          return MODS.map(function (m, i) {
            const ns = WA[m[0]];
            const fns = ns ? Object.keys(ns).filter(function (k) { return typeof ns[k] === 'function' && k.charAt(0) !== '_'; }) : [];
            return {
              ns: m[0], file: m[1], probeMember: m[2],
              loaded: !!ns,
              probeOk: !!ns && probe[i] === 'function',
              exported: fns.length,
              // UI 层是否真调过（面板源码里出现 `NS.member(` 形态即算；面板未装载时如实报 null）
              wiredToPanel: panelSrc ? fns.filter(function (k) {
                return panelSrc.indexOf(m[0] + '.' + k + '(') >= 0;
              }).length : null
            };
          });
        })(),
        // 主题层各模块的版本，便于「皮是新的、逻辑是旧的」这类错配被看见
        versions: {
          cyberpunkTheme: WA.cyberpunkTheme ? WA.cyberpunkTheme.version : null,
          themeSwitch: sw ? sw.version : null
        }
      };
    });
  }
  /**
   * v2.150.0(RP4): 注入价值读数——「预算告诉你花掉了，价值告诉你有没有白花」。
   *   只读 stat（**不跑 report**：report 会遍历已结算轮次做聚合、按源归拢，那是一份
   *   读数生成物，面板要榜单时自己调；诊断面必须在任何面上留不下痕迹——与
   *   secSediment「不跑 feel / 不跑 buildBlock」同规）。
   */
  function secInjectValue() {
    return safe(function () {
      if (!WA.injectValue || typeof WA.injectValue.stat !== 'function') return { error: 'engines/inject-value.js 未加载（注入价值读数缺席）' };
      const st = WA.injectValue.stat();
      return {
        enabled: st.enabled, zeroRefRounds: st.zeroRefRounds, maxKeys: st.maxKeys,
        observes: st.observes, settles: st.settles, judged: st.judged, reObserved: st.reObserved,
        rounds: st.rounds, pending: st.pending, sources: st.sources, caps: st.caps,
        selfMs: st.selfMs, perfIngest: st.perfIngest,
        textTruncated: st.textTruncated, dropped: st.dropped, lastReason: st.lastReason,
        // 拒答归因（disabled / type / no-reading / stale-round / empty-observation / text-too-short）。
        //   只报 settles 的话，「还没打几轮」与「接线断了、每轮都被拒」在诊断面上长得一样——
        //   而这两种局面一个不用管、一个要立刻查（与 secPerfLedger 的 skipReasons 同规）。
        skipReasons: st.skipReasons || {},
        note: st.judged === 0 ? '还没有已结算的轮次（读数空不等于「都没用上」）' : null
      };
    });
  }
  /**
   * v2.151.0（RX2）：跨会话记忆锚读数。
   *   只读 stat（**不跑 tick / 不跑 buildBlock**：那两个会写 stat 计数与 blocks，
   *   诊断面必须在任何面上留不下痕迹——与 secSediment「不跑 feel」同规）。
   */
  function secOfflineTick() {
    return safe(function () {
      if (!WA.offlineTick || typeof WA.offlineTick.stat !== 'function') return { error: 'engines/offline-tick.js 未加载（离线推进读数缺席）' };
      const st = WA.offlineTick.stat();
      const cfg = WA.offlineTick.getSettings();
      return {
        enabled: st.enabled, anchors: st.anchors, released: st.released, batches: st.batches, skips: st.skips,
        ticks: st.ticks, firsts: st.firsts, anchored: st.anchored, protectedRows: st.protectedRows,
        rounds: st.rounds, lastReason: st.lastReason, byKind: st.byKind || {}, caps: st.caps,
        stepMs: cfg.stepMs, maxRounds: cfg.maxRounds, minGapMs: cfg.minGapMs,
        // 拒收归因（disabled / missing-fields / bad-value / anchors-full / unknown-anchor /
        //   no-draft / no-elapsed / too-short / apply-throw / no-apply / store-unavailable）。
        //   只报 ticks 的话，「玩家很久没回来」与「接线断了、每调必拒」在诊断面上长得一样——
        //   而这两种局面一个不用管、一个要立刻查（与 secInjectValue 的 skipReasons 同规）。
        faults: Object.assign({}, st.faults || {}),
        note: st.ticks === 0 && st.firsts > 0 ? '已落基准但没有跨会话批次（「不知道你走了多久」不等于「你走了零秒」）' : null
      };
    });
  }
  /**
   * v2.151.0（RX3）：远方世界脉搏读数。
   *   只读 stat（**不跑 tick / deliver / settlePulse**：那几个都会改世界与计数；
   *   partition 只读 region.places()，与面板同一口子，故这里读它不算副作用）。
   */
  function secFarfield() {
    return safe(function () {
      if (!WA.farfield || typeof WA.farfield.stat !== 'function') return { error: 'engines/farfield.js 未加载（远方脉搏读数缺席）' };
      const st = WA.farfield.stat();
      const cfg = WA.farfield.getSettings();
      return {
        enabled: st.enabled, pulses: st.pulses, pendingInFlight: st.pendingInFlight, heard: st.heard,
        nearCount: st.nearCount, farCount: st.farCount, ticks: st.ticks, delivered: st.delivered,
        distorted: st.distorted, skipped: st.skipped, settled: st.settled, relays: st.relays,
        lastReason: st.lastReason, byTrend: st.byTrend || {}, caps: st.caps,
        // v2.157.0（SP4 + S2）：四类上限的消费现场。三个新计数各自可独立
        //   抓到一个局面：预算没推完 / 在途满而暂停 / 自动真跑过没有。
        carriedOnce: st.carriedOnce, pendingFull: st.pendingFull, transfers: st.transfers,
        autoTicks: st.autoTicks, autoFirsts: st.autoFirsts, autoOn: !!cfg.auto,
        autoDay: (function () { try { const f = (WA.store.get() || {}).farfield; return (f && f.autoDay != null) ? f.autoDay : null; } catch (e) { return null; } })(),
        nearDays: cfg.nearDays, maxItems: cfg.maxItems, autoMaxWindows: cfg.autoMaxWindows, capTransfer: cfg.capTransfer,
        // 拒收归因（disabled / no-draft / no-far / too-early / nothing-pending /
        //   missing-fields / unknown-pulse / unknown-message / sediment-absent / rumor-absent /
        //   settle-failed / relay-failed）。六码处置不同：分别要建远场地区 / 等世界钟走 / 补事实键 /
        //   救沉积或 rumor 模块，故必须分列而不合成一个「没成」。
        faults: Object.assign({}, st.faults || {}),
        note: st.ticks === 0 ? '还没有推进过远场（读数空不等于「远方没事发生」）' : null
      };
    });
  }
/**
   * v2.154.0（RX4）：世界联网面读数。
   *   只读 stat / worldKey / view —— **不跑 exportLegends / importLegends / toRumor**
   *   （那三个都会改世界状态或写入传说链）。`worldKey()` 只把身份读出来，零副作用。
   */
  function secWorldBridge() {
    return safe(function () {
      if (!WA.worldBridge || typeof WA.worldBridge.stat !== 'function') return { error: 'engines/world-bridge.js 未加载（世界联网面读数缺席）' };
      const st = WA.worldBridge.stat();
      const cfg = WA.worldBridge.getSettings();
      return {
        enabled: st.enabled, sig: st.sig || null, label: st.label || null,
        identityComplete: !!st.identityComplete,
        legends: st.legends, exportedSigs: st.exportedSigs, seeds: st.seeds,
        exported: st.exported, imported: st.imported, relays: st.relays, dropped: st.dropped,
        redacted: st.redacted, reads: st.reads, refusals: st.refusals, lastReason: st.lastReason,
        kinds: st.kinds || [], caps: st.caps,
        maxExported: cfg.maxExported, maxItems: cfg.maxItems,
        // 拒收归因（disabled / identity-incomplete / no-chronicle / nothing-to-export /
        //   self-origin / bad-payload / no-legends / nothing-to-import / unknown-legend /
        //   rumor-absent / relay-failed）。五码处置不同：分别要填身份 / 等世界攒下大事 /
        //   换一份传说包 / 换一个来源世界，故必须分列而不合成一个「没成」。
        faults: Object.assign({}, st.faults || {}),
        note: st.legends === 0 ? '还没有收进任何别世界传说（空不等于「别处没事」，只说明还没导入过）' : null
      };
    });
  }

  /**
   * v2.154.0（RX7）：世界生态自洽审计读数。
   *   取 stat() + lastSweep()（**不跑 sweep**：重扫会把审计器自己的开销塞进一次诊断调用，
   *   而「打开诊断」本身不该改变世界 —— 与 v2.153.0 对张力取 `push:false` 同一条纪律）。
   *   从没扫过时如实报 `never-swept`，不拿一个 0 冒充「四类全过」。
   */
  function secEcoAudit() {
    return safe(function () {
      if (!WA.ecoAudit || typeof WA.ecoAudit.stat !== 'function') return { error: 'engines/eco-audit.js 未加载（自洽审计读数缺席）' };
      const st = WA.ecoAudit.stat();
      const cfg = WA.ecoAudit.getSettings();
      const last = (typeof WA.ecoAudit.lastSweep === 'function') ? WA.ecoAudit.lastSweep() : null;
      const has = !!(last && last.ok === true);
      return {
        enabled: st.enabled, rules: st.rules, cats: (WA.ecoAudit.CATS || []).slice(),
        sweeps: st.sweeps, issues: st.issues, truncated: st.truncated,
        byCode: Object.assign({}, st.byCode || {}), byCat: Object.assign({}, st.byCat || {}),
        lastMs: st.lastMs, lastAt: st.lastAt, lastReason: st.lastReason,
        // 「扫过」与「没扫过」分开报（同 maintain 的 patrol.degraded 纪律）。
        swept: has, lastErrors: has ? last.errors : 0, lastWarns: has ? last.warns : 0,
        lastTotal: has ? last.total : 0, lastTruncated: has ? last.truncated : 0,
        lastFailedSections: has ? last.failedSections : 0,
        sources: has ? Object.assign({}, last.sources) : null,
        caps: { issues: cfg.maxIssues, people: cfg.maxPeople },
        perfSource: st.perfSource,
        note: has ? null : '自洽审计尚未扫描过（never-swept）——「没扫」不等于「四类都对得上」'
      };
    });
  }

  /**
   * 世界生成种子库读数（RX8）。
   *   与 secEcoAudit 同规格：直读现场，不转发摘要。
   *   两个「没得看」的态要分开：「没有提取过」（hasLast false）与「库是空的」（total 0）
   *   —— 前者是还没拍快照，后者是拍了没存，处置不同（一个去 extract，一个去 save）。
   */
  function secWorldSeed() {
    return safe(function () {
      if (!WA.worldSeed || typeof WA.worldSeed.stat !== 'function') return { error: 'engines/world-seed.js 未加载（种子库读数缺席）' };
      const st = WA.worldSeed.stat();
      const cfg = WA.worldSeed.getSettings();
      const li = (typeof WA.worldSeed.list === 'function') ? WA.worldSeed.list() : { rows: [] };
      return {
        enabled: st.enabled, libCap: st.libCap, total: st.total,
        extracts: st.extracts, saves: st.saves, sows: st.sows, refused: st.refused,
        lastReason: st.lastReason, faults: Object.assign({}, st.faults || {}),
        hasLast: st.hasLast, lastSig: st.lastSig,
        seedVer: st.seedVer, variance: Object.assign({}, st.variance || {}),
        tags: (st.tags || []).slice(),
        rows: (li.rows || []).map(function (r) {
          return { id: r.id, name: r.name, tags: (r.tags || []).slice(), sig: r.sig, counts: r.counts };
        }),
        note: st.hasLast ? null : '尚未提取过任何种子（extract 未调用）——「没提取过」不等于「这个格局不值得存」'
      };
    });
  }

  /**
   * v2.164.0（TX5）：版本化完整世界蓝图读数。
   *   为什么单列一节而不并进 worldSeed 节：种子那节答「我抽到了什么格局」（**有损**，
   *   只有显示名），本节答「我导出了一份能不能原样搬走的世界」（**无损**，稳定 ID + 别名 +
   *   方向化关系 + 道路端点）。两问的失效模式不同：种子失效在「同名合并了却没人知道」，
   *   蓝图失效在「版本对不上却按 v1 猜着收」——后者会静默污染目标存档，必须把
   *   bpVer / 待确认票据 / 安装留痕三组读数摊开，而不是只报「导出了 N 条」。
   *   两个「没得看」的态要分开：「没导出过」（exports 0）与「导出了没存」（total 0）
   *   —— 前者去 exportBlueprint，后者去 save。
   */
  function secWorldBlueprint() {
    return safe(function () {
      if (!WA.worldBlueprint || typeof WA.worldBlueprint.stat !== 'function') return { error: 'engines/world-blueprint.js 未加载（蓝图库读数缺席）' };
      const st = WA.worldBlueprint.stat();
      const li = (typeof WA.worldBlueprint.list === 'function') ? WA.worldBlueprint.list() : { rows: [] };
      return {
        enabled: st.enabled, libCap: st.libCap, total: st.total,
        exports: st.exports, saves: st.saves, previews: st.previews, imports: st.imports, refused: st.refused,
        lastReason: st.lastReason, faults: Object.assign({}, st.faults || {}),
        bpVer: st.bpVer,
        keepLevels: (st.keepLevels || []).slice(),
        scenes: (st.scenes || []).slice(),
        hasPending: !!st.hasPending, hasInstalled: !!st.hasInstalled,
        hasLast: !!st.hasLast, lastSig: st.lastSig,
        installedBpVer: st.installedBpVer, installedSig: st.installedSig,
        limits: Object.assign({}, st.limits || {}),
        retainNote: st.retainNote,
        rows: (li.rows || []).map(function (r) {
          return { id: r.id, name: r.name, tags: (r.tags || []).slice(), at: r.at,
            bpVer: r.bpVer, bpSig: r.bpSig, keep: r.keep, counts: r.counts };
        }),
        note: st.hasPending ? '有一张待确认的导入票据尚未 settle —— 未确认的导入不落盘（防「预览了一下世界就被换了」）'
          : (st.exports === 0 ? '尚未导出过任何蓝图（exportBlueprint 未调用）——「没导出过」不等于「这个世界不值得搬」'
            : (st.total === 0 ? '导出过但没有存进库（save 未调用）—— 蓝图不落库就不会被清空存档的操作碰到' : null))
      };
    });
  }

  /**
   * v2.257.0（V6 OPV6-2）：启用面可见 —— 谁在跑、谁没跑、为什么。
   *   与上方 `capabilities` 节（9. 能力清单，答「三件套/编辑器/自检 API 装齐没」）
   *   **分列不合并**：那一节答的是「接口齐不齐」，本节答的是「这些接口背后的机制此刻谁在跑」。
   *   两问的失效模式完全不同 —— 前者失效在「少了一个方法」，后者失效在「方法都在、但开关关着，
   *   于是玩家装了插件却只看到 4/107 个注入源」（V6 立项读数）。合并会让后者无处可报。
   *
   *   本节把审计引擎的三档归因原样搬出来（default-off / user-off / no-builder），
   *   不做二次归类：维护者面要的正是「这一台到底是哪种没跑」。
   */
  function secCapability() {
    return safe(function () {
      if (!WA.capabilityAudit || typeof WA.capabilityAudit.audit !== 'function') {
        return { error: 'engines/capability-audit.js 未加载（启用面读数缺席）' };
      }
      const a = WA.capabilityAudit.audit();
      const sm = (typeof WA.capabilityAudit.summary === 'function') ? WA.capabilityAudit.summary() : null;
      const tv = (WA.capabilityTier && typeof WA.capabilityTier.view === 'function') ? WA.capabilityTier.view() : null;
      const st = (typeof WA.capabilityAudit.stat === 'function') ? WA.capabilityAudit.stat() : {};
      return {
        // 总账：179 / 95 两组真读数（计划验收口径）
        switches: a.switches, mechanisms: a.mechanisms,
        running: a.running, dormant: a.dormant,
        byReason: Object.assign({}, a.byReason || {}),
        // 逐条全表（维护者面看名字，玩家面看 summary 那句）
        runningRows: (a.runningRows || []).map(function (r) { return { ns: r.ns, hasBuild: r.hasBuild }; }),
        dormantRows: (a.dormantRows || []).map(function (r) { return { ns: r.ns, hasBuild: r.hasBuild, reason: r.reason }; }),
        // 档位侧（与审计同源但不同问：审计答「现在什么样」，档位答「换一档会怎样」）
        tier: tv ? tv.tier : null,
        tiers: tv ? (tv.tiers || []).map(function (t) { return { name: t.name, size: t.size, on: t.on }; }) : [],
        next: tv ? tv.next : '', gap: tv ? tv.gap : 0,
        rollbackDepth: tv ? tv.rollbackDepth : 0, rollbackCap: tv ? tv.rollbackCap : 0,
        // 玩家面摘要那句（与 OPV6-8 同源，不另编）
        summary: sm ? { line: sm.line, showSummary: sm.showSummary } : null,
        note: a.switches === 0
          ? '一个带开关的引擎都没看见 —— 这不是「全都关着」，是装载面本身没起来（先看 modules 节）'
          : (a.dormant === 0 ? '全部开关都在跑（没有关着的）'
            : ('关着的 ' + a.dormant + ' 台里，出厂默认 ' + a.byReason.defaultOff
              + ' · 玩家自己关的 ' + a.byReason.userOff + ' · 压根没有注入面 ' + a.byReason.noBuilder
              + '；后两组不该被档位擅自打开')),
        audits: st.audits, lastAt: st.lastAt, lastReason: st.lastReason
      };
    });
  }
 /**
   * v2.275.0（V7 OPV7-5）：驱动者登记表读数。谁在什么时机驱动哪个引擎。
   *
   *   与上方 `capability` 节（v2.257.0）**分列不合并**，也与 `health` 节（v2.259.0）分列：
   *     · capability 答「179 个开关此刻谁在跑」——读的是 enabled 开关面；
   *     · health    答「跑着的那些为什么内容还是没出来」——读的是注入门槛；
   *     · 本节      答「这台机制有没有任何人会去驱动它」——读的是**调用面**。
   *   三问正交。V7 立项抓的正是第三种：开关开着、门槛也过，但四条调用面一条都没登记它，
   *   于是它永远不出内容 —— 前两节都读不出这一格。
   *
   *   本节只是转述 `driverLedger.view()` 的读数，**不做二次归类**：分层判据（L1 链自动 /
   *   L2r 路由登记 / L2p 面板控件 / L2e 已可达引擎的互调 / L3a 只被诊断面读 / L3b 没人碰）
   *   全部在引擎里，维护者面要的正是「这一台归到哪一档、凭什么」。
   *
   *   与 secSediment / secTapeStore 同规：**只报读数、不写世界** —— 不切档位、不开关引擎、
   *   不改任何 enabled。`scan.canConclude === false` 时如实报「未判定」，不冒充「没有驱动者」。
   */
  /**
   * v2.280.0（V7 OPV7-4）：写口契约自描述读数。
   *
   * 本节刻意**不做全表 dump**：`scan()` 会遍历 3000+ 导出函数、对每个做一次 toString，
   *   诊断包塞满 1189 行契约表只会把真正有用的那几行埋掉。故只取读数与几个样例。
   *
   * 两件必须分开报的事：
   *   ① **带 hint 的写口数 vs 全部有拒收码的写口数** —— 前者是「作者写了下一步」的那部分，
   *      后者是「会拒收」的那部分。只报前者会让「大部分写口拒了不说怎么办」隐形。
   *   ② **unreadable** —— 函数体读不到的写口。这不是「没有约束」，是「读不出来」，
   *      两者的处置完全相反（前者可以直接调，后者要先确认运行环境）。
   */
  /**
   * v2.281.0（V7 OPV7-6）：开局播种读数。
   *
   * 与相邻各节**分列不合并**（每节答一问，合并就丢掉归因）：
   *   · `secCapability` 答「开关有没有开」；
   *   · `secHealth`     答「跑着的为什么内容没出来」（三面门槛）；
   *   · `secDriver`     答「有没有任何人会去驱动它」；
   *   · 本节           答「**开局那一刻，结构化引擎里到底被喂进了什么**」。
   * 第四问独有：探针实测真实开局后 people 6 / places 12，而 lifeGoals / schedule /
   *   bonds / roster **全零** —— 世界有演员、没剧本。前四节都读不出这一格
   *   （开关是开的、门槛是过的、写口也有人调，只是没人给它们内容）。
   *
   * 三件事必须分开报（否则本节的读数和「全空」长得一样）：
   *   ① `planned` / `noSource` —— 要播几行、有几行**取不到实词**（不编值，如实不播）；
   *   ② `stat.reasons` —— 逐条拒因（disabled / missing-holder / already / …）；
   *   ③ `blueprint` —— 播的是哪份蓝图。**没有已安装蓝图**时如实报 `no-blueprint`，
   *      不渲染成「播过了但没内容」（那是两种完全不同的处置）。
   * 与 secSediment / secTapeStore 同规：**只读** —— 不触发播种、不改任何开关。
   */
  function secPlayableSeed() {
    return safe(function () {
      if (!WA.playableSeed || typeof WA.playableSeed.view !== 'function') {
        return { error: 'engines/playable-seed.js 未加载（开局播种读数缺席）' };
      }
      const v = WA.playableSeed.view();
      return {
        enabled: v.enabled, bondPairs: v.bondPairs, roster: v.roster,
        blueprint: v.blueprint,
        planned: v.planned,
        counts: v.counts,
        // 取不到实词的行**必须点出来**：那是「这一行没播」的原因，不是噪声
        noSource: (v.noSource || []).slice(0, 12),
        noSourceCount: (v.noSource || []).length,
        stat: v.stat,
        note: v.blueprint
          ? null
          : '当前没有已安装的玩法蓝图：播种无输入（这不是「播过了但世界还是空」）',
        line: '要播 ' + v.planned + ' 行（目标 ' + (v.counts || {}).goal + ' / 日程 '
          + (v.counts || {}).schedule + ' / 关系 ' + (v.counts || {}).bond
          + ' / 势力归属 ' + (v.counts || {}).roster + '）'
          + ((v.noSource || []).length ? '｜取不到实词 ' + v.noSource.length + ' 行（不播，不编）' : '')
      };
    });
  }

  function secWriteContract() {
    return safe(function () {
      if (!WA.writeContract || typeof WA.writeContract.scan !== 'function') {
        return { error: 'engines/write-contract.js 未加载（写口契约读数缺席）' };
      }
      const r = WA.writeContract.scan();
      const st = (typeof WA.writeContract.stat === 'function') ? WA.writeContract.stat() : {};
      const withHint = (r.rows || []).filter(function (x) { return x.hints && Object.keys(x.hints).length > 0; });
      return {
        scanned: r.scanned, truncated: r.truncated, cap: r.cap,
        entries: r.entries, withHint: r.withHint, unreadable: r.unreadable,
        line: (typeof WA.writeContract.summaryText === 'function') ? WA.writeContract.summaryText() : '',
        // 样例：带自述的写口各取一条 hint 原文。它们**不是**精选的好例子，
        //   而是「能拿到什么就报什么」—— 谁在第一页完全取决于 Object.keys 的顺序，不做美化。
        samples: withHint.slice(0, 8).map(function (x) {
          const code = Object.keys(x.hints)[0];
          return { at: x.ns + '.' + x.method, code: code, hint: x.hints[code] };
        }),
        // 读不到的写口：名字必须点出来（这是要人在运行环境里确认的事，不是噪声）
        unreadableRows: (r.rows || []).filter(function (x) { return x.readable === false; })
          .slice(0, 20).map(function (x) { return x.ns + '.' + x.method; }),
        stat: st
      };
    });
  }

  function secDriver() {
    return safe(function () {
      if (!WA.driverLedger || typeof WA.driverLedger.view !== 'function') {
        return { error: 'engines/driver-ledger.js 未加载（驱动者读数缺席）' };
      }
      const v = WA.driverLedger.view();
      const sm = (typeof WA.driverLedger.summaryText === 'function') ? WA.driverLedger.summaryText() : '';
      const st = (typeof WA.driverLedger.stat === 'function') ? WA.driverLedger.stat() : {};
      return {
        total: v.total,
        // 六档计数原样搬出。L3a 与 L3b 必须分开：一个还有人看（诊断面），一个彻底没人碰。
        counts: Object.assign({}, v.counts || {}),
        // 悬空清单：这是本节唯一值得玩家逐条看的东西。
        //   清单本身要截断（面板不能一次吐 109 个名字），但**计数必须读引擎给的字段**，
        //   不能拿 arr.length 当总数 —— 截断后长度就成了「上限 60」而不是真实条数，
        //   那是最容易被当真的一类假读数（探针实测：blind 显示 30，实际 33）。
        orphans: (v.orphans || []).slice(0, 60),
        orphanCount: v.orphanCount,
        diagOnlyOrphans: (v.diagOnlyOrphans || []).slice(0, 30),
        diagOnlyOrphanCount: v.diagOnlyOrphanCount,
        blindOrphans: (v.blindOrphans || []).slice(0, 30),
        blindOrphanCount: v.blindOrphanCount,
        // 各档名单（维护者面看名字，玩家面看 summary 那句）
        layerNames: v.layerNames || {},
        // 未判定必须对外可见：藏起来就会让读者把「未判定」读成「已确认没有驱动者」
        undetermined: (v.undetermined || []).slice(0, 30),
        undeterminedCount: v.undeterminedCount,
        // 扫描口径自述：这一栏是「事实」还是「下界」，全看这几个字段
        scan: Object.assign({}, v.scan || {}),
        summary: sm,
        // 归因句：与 capability 的 note 同规 —— 不给一句「全部正常」就算完
        note: !v.scan || !v.scan.canConclude
          ? ('本宿主读不到完整的调用面（' + ((v.scan && v.scan.level) || 'none') + '），'
            + '未判定的 ' + (v.undeterminedCount || 0) + ' 台只说明「读到的面里没登记它」，'
            + '不等于「没有驱动者」—— 要确认得在能读到全量产品源码的环境里跑一次')
          : (v.orphanCount === 0
            ? '所有机制都有产品登记的驱动入口（链/路由/面板/互调 四条面至少命中一条）'
            : ('没有驱动入口的 ' + v.orphanCount + ' 台里，只被诊断面读的 '
              + v.diagOnlyOrphanCount + ' 台 · 彻底没人碰的 '
              + v.blindOrphanCount + ' 台；'
              + '这些机制开关开着也不会出内容 —— 该补驱动入口，不是该开开关')),
        reads: st.calls, lastAt: st.lastAt
      };
    });
  }

 /**
   * v2.259.0（V6 OPV6-4）：首轮零内容的三重门槛自检。
   *   与上方 `capability` 节（v2.257.0）**分列不合并**：那一节答「179 个开关此刻谁在跑」，
   *   本节答「跑着的那些，为什么内容还是没出来」。两问的失效模式完全不同 ——
   *   前者失效在「机制没开」，后者失效在「机制开着但注入源被挡住 / 预算挤掉」。
   *   V6 立项读数正是后者：107 个注入源里三重门槛全通的只有 6 个，而 `capability` 节
   *   当时报的是「running 5 / dormant 95」，读不出那 74 个被模块总开关挡住的源。
   *
   *   本节是 `healthPreflight.threeGates()` 在**产品侧的真读者**（口径：产品零引用即
   *   冻结面）。与 secSediment / secTapeStore 同规：**只报读数、不写世界** ——
   *   不切档位、不开模块、不改可见性、不调预算（`fix` 只是「该按哪个写入口」的转述，
   *   点了才算数；本节目自己不点）。给不出动作的门槛如实报 `fix: null`。
   */
  /**
   * v2.276.0（V7 OPV7-7）：空产出归因。
   *
   * 与相邻两节的分工（三问都不合并）：
   *   · `secCapability` —— 答「179 个开关此刻谁在跑」；
   *   · `secHealth`     —— 答「跑着的那些，为什么内容还是没出来」（三面门槛）；
   *   · 本节           —— 答「**具体哪几台引擎**在空着、各自卡在哪一面」（逐引擎）。
   * 失效模式互不覆盖：门槛全过、首局在跑，照样可能有一批引擎永远空产。
   *
   * 本节是 `healthPreflight.yieldAttrib()` 在**产品侧的真读者**（口径：产品零引用即
   * 冻结面）。与 secSediment / secHealth 同规：**只报读数、不写世界** ——
   * 不切档位、不开模块、不改可见性；`action` 只是「该按哪个写入口」的转述，
   * 点了才算数，本节目自己不点。
   *
   * 四态 + 两条单列名单必须一起报出，缺一样就答不出「哪种空」：
   *   fault（构建抛异常）/ yield（有产出）/ off（开关关着）/ no-data（开着没内容）
   *   + suspicious（有真实调用面却空：**嫌疑，不是结论**）
   *   + weakRows（容器里有记录但从未被产出过：**判不了，如实报**）
   */
  // Runtime receipts are evidence, not guessed stat-field semantics. No diagnostic writes.
  function secPanelYield() {
    return safe(function () {
      const ledger = WA.driverLedger.view();
      const keys = (ledger.layerNames || {}).L2p || [];
      const sampled = WA.healthPreflight.yieldAttrib({ limit: 100, keys: keys });
      const activity = WA.writeDesk ? WA.writeDesk.stat().activity || {} : {};
      const rows = keys.map(function (key) {
        let raw = (sampled.rows || []).filter(function (r) { return r.key === key; })[0];
        // Some builders intentionally have no enabled setting: capabilityTier.shapeOf excludes them.
        // Their absence from that switch inventory is not a failed builder.
        if (!raw) {
          try {
            const text = WA[key].buildBlock();
            raw = { state: text ? 'yield' : 'no-data', len: String(text || '').length, signals: { records: 0 } };
          } catch (e) { raw = { state: 'fault', threw: String(e && e.message || e), len: -1, signals: { records: 0 } }; }
        }
        const receipt = activity[key] || { calls: 0, written: 0, rejected: 0 };
        let state = raw ? raw.state : 'fault';
        let why = raw ? (raw.threw || '') : 'builder-read-unavailable';
        if (raw && state === 'no-data' && receipt.written > 0 && raw.signals.records > 0) {
          state = 'fault'; why = 'written-container-without-yield';
        }
        return { key: key, state: state, why: why, receipt: receipt,
          records: raw ? raw.signals.records : null, len: raw ? raw.len : null,
          evidence: receipt.calls > 0 ? 'write-desk' : 'not-observed' };
      });
      const count = function (s) { return rows.filter(function (r) { return r.state === s; }).length; };
      return { ok: !!(sampled.ok && ledger.scan && ledger.scan.canConclude), total: rows.length,
        yield: count('yield'), off: count('off'), fault: count('fault'), noData: count('no-data'), rows: rows,
        scan: ledger.scan, receiptScope: 'write-desk-only; dedicated panel writes not inferred' };
    }, { ok: false, reason: 'panel-yield-unavailable' });
  }
  function secControlUsage() {
    return safe(function () {
      if (!WA.ui || typeof WA.ui.usageStat !== 'function') return { ok: false, reason: 'ui-not-loaded' };
      const use = WA.ui.usageStat(), calls = use.controls || {};
      const rows = [];
      UI_BINDINGS.forEach(function (g) {
        // v2.382.0：四层必须全遍历。此前只走 ids/cond/dynamic，于是 v2.381.0 新增的
        //   `player` 层那三枚（wa-set-devmode / wa-set-simple-mode / wa-set-simple-save）
        //   在「控件使用统计」里**整条不出现**——不是读数偏差，是这三枚永远进不了
        //   `zero` 名单，于是「渲染了但没人点」这类缺陷在这层永远查不出来。
        //   `layer` 字段原样报 'player'，读者据此知道「它在玩家面，开发者面本就不该有」。
        ['ids', 'cond', 'dynamic', 'player'].forEach(function (layer) {
          (g[layer] || []).forEach(function (entry) {
            const id = typeof entry === 'string' ? entry : entry.id;
            if (id) rows.push({ page: g.page, id: id, layer: layer, calls: calls[id] || 0 });
          });
        });
      });
      return { ok: true, observed: use.events, since: 'current-runtime', rows: rows,
        zero: rows.filter(function (r) { return r.calls === 0; }),
        note: 'zero means no captured user click/change in this runtime, not unreachable; dynamic/conditional outputs may have no input action' };
    }, { ok: false, reason: 'control-usage-unavailable' });
  }
  function secYield() {
    return safe(function () {
      if (!WA.healthPreflight || typeof WA.healthPreflight.yieldAttrib !== 'function') {
        return { error: 'engines/health-preflight.js 未加载或缺 yieldAttrib（空产出归因缺席）' };
      }
      const r = WA.healthPreflight.yieldAttrib({ limit: 20 });
      const line = (typeof WA.healthPreflight.yieldAttribLine === 'function')
        ? WA.healthPreflight.yieldAttribLine({})
        : null;
      return {
        ok: r.ok,
        // 四态计数：四者相加 = total，缺一项就无法对账
        total: r.total, yield: r.yield, off: r.off, fault: r.fault, noData: r.noData,
        // 巡视名单：只收「构建抛异常」—— 本仓唯一能自证的缺陷
        faults: (r.faults || []).map(function (f) {
          return { key: f.key, why: f.why, records: f.records, activity: f.activity,
            injected: f.injected, lastReason: f.lastReason };
        }),
        // 关着的：一条动作就能救回来（开它就是），故与 faults 分列
        offRows: (r.offRows || []).map(function (f) {
          return { key: f.key, records: f.records, activity: f.activity, action: f.action };
        }),
        // 嫌疑：判不了是不是缺陷，如实单列（verdict 里写明 unattributed）
        suspicious: (r.suspicious || []).map(function (f) {
          return { key: f.key, why: f.why, records: f.records, mounts: f.mounts,
            injected: f.injected, callFaults: f.callFaults, activity: f.activity, verdict: f.verdict };
        }),
        // 弱归因：容器有记录但没产出 —— 只报，不下结论
        weakRows: (r.weakRows || []).map(function (f) {
          return { key: f.key, records: f.records, mounts: f.mounts, injected: f.injected, activity: f.activity };
        }),
        // 调用面是否可用：诊断包要能分清「本轮没跑注入链」与「跑了但它没被调用」
        callFace: r.callFace,
        line: line,
        at: r.at,
        panelYield: secPanelYield(),
        controlUsage: secControlUsage(),
        injectionVolume: ((WA.store.get() || {}).lastInjection || {}).volume || null,
        collector: WA.injectCollector ? WA.injectCollector.stat() : null,
        collectorDiagnosis: WA.injectCollector ? WA.injectCollector.diagnose() : null,
        managedCurrents: WA.storylineAdvance ? WA.storylineAdvance.stat() : null,
        worldChanges: WA.worldChanges ? WA.worldChanges.view() : null,
        note: (r.fault !== 0 || (r.suspicious || []).length !== 0)
          ? '有引擎交不出内容：抛异常的按 faults 逐个查；suspicious 那一组只能人去判断（本仓判不了）'
          : null
      };
    }, {});
  }
  function secHealth() {
    return safe(function () {
      if (!WA.healthPreflight || typeof WA.healthPreflight.threeGates !== 'function') {
        return { error: 'engines/health-preflight.js 未加载（三重门槛自检缺席）' };
      }
      const r = WA.healthPreflight.threeGates({ sample: 8 });
      const line = (typeof WA.healthPreflight.threeGatesLine === 'function')
        ? WA.healthPreflight.threeGatesLine({ sample: 8 })
        : null;
      return {
        // 五态结论（v2.278.0 起由三态扩为五态）：
        //   empty-risk（这一轮大概率零内容）/ partial（有内容但远少于该有的量）/
        //   dormant（能判的都过，但有一批机制开着却没人喂 —— 世界看着在转、一部分机制永不产出）/
        //   unknown（读数取不到，不假称健康）/ running（能判的全都过）。
        //   ⚠ 「五态」不是修辞：把 dormant 折进 running 就是本仓点名的「空转冒充健康」；
        //     把它折进 partial 则会让「内容少」与「机制空转」两种病因在诊断包里同形。
        verdict: r.verdict, ok: r.ok,
        passed: r.passed, blocked: r.blocked, degraded: r.degraded, absent: r.absent,
        // v2.278.0（V7 OPV7-2）：degraded 的两个子桶与「判不了」的个数**分列报出**。
        //   degraded 合报会让诊断面失去归因（内容面 degraded 要切档，驱动面 degraded 要接写口），
        //   unverifiable 不报则「不知道」在诊断包里静默消失。
        degradedContent: r.degradedContent, degradedDrive: r.degradedDrive,
        // v2.279.0（V7 OPV7-3）：产出面读数也带出 —— 它是「世界有没有在说话」的直接度量，
        //   而上面的 gates 数组只有 state，看不到「几台有产出 / 趋势」。
        //   这里刻意不复算：整块取自同一份 threeGates 返回体的 yield 门槛 nums。
        yieldFace: (function () {
          const gy = (r.gates || []).filter(function (g) { return g.id === 'yield'; })[0];
          return gy ? Object.assign({ state: gy.state }, gy.nums || {}) : null;
        })(),
        unverifiable: r.unverifiable, unverifiableIds: (r.unverifiableIds || []).slice(),
        // 玩家实际能看到多少世界：这是本节最该被念出来的两个数
        sourcePassing: r.sourcePassing, sourceTotal: r.sourceTotal,
        gates: (r.gates || []).map(function (g) {
          return { id: g.id, label: g.label, state: g.state,
            nums: Object.assign({}, g.nums || {}), why: g.why || '',
            fix: g.fix ? { do: g.fix.do, arg: g.fix.arg, hint: g.fix.hint } : null };
        }),
        nextAction: r.nextAction,
        line: line,
        // v2.263.0（V6 OPV6-8）：首局体检结论。与上面的门槛读数**分列不合并** ——
        //   上面那一组答「哪道门槛没过、按什么修」（诊断面语言，逐门槛）；
        //   本节答「所以这一局到底跑起来了没有」（玩家面语言，一个结论 + 一条动作）。
        //   两句话给两个读者：把玩家结论混进门槛清单会让诊断包多出一句非机器可读的行。
        firstRun: (function () {
          try {
            if (!WA.healthPreflight || typeof WA.healthPreflight.firstRunView !== 'function') {
              return { error: 'firstRunView 缺席' };
            }
            const fv = WA.healthPreflight.firstRunView({ sample: 0 });
            return { state: fv.state, line: fv.line,
              next: fv.next ? { do: fv.next.do, arg: fv.next.arg, hint: fv.next.hint } : null,
              nums: Object.assign({}, fv.nums || {}), at: fv.at };
          } catch (e) { return { error: String((e && e.message) || e).slice(0, 80) }; }
        })(),
        at: r.at,
        note: r.verdict === 'empty-risk'
          ? '有门槛把内容全卡住了 —— 这一轮正文大概率是空的（先按 nextAction 修一条，不必全修）'
          : (r.verdict === 'partial'
            ? ('三道门槛只过了一部分：注入源全通 ' + r.sourcePassing + '/' + r.sourceTotal
              + '。部分成功不是成功 —— 玩家看到的世界就这么多')
            : (r.verdict === 'unknown' ? '有读数取不到：这是「不知道」，不是「健康」' : null))
      };
    }, {});
  }
  /**
   * v2.265.0（V6 EXV6-1）：世界日记读数。
   *
   * 与上面 health / capability 两节的分工必须说清：那两节答「机制跑没跑起来」，
   *   本节答「跑起来之后世界**说出了什么**」—— 即玩家在概览页读到的那一到三句人话
   *   是从哪几路事实里压出来的、压的时候哪一路不在场。
   *
   * 本节必须把三组「看起来一样」的态分开，分开才叫读数（本仓反复付过价的那类假绿）：
   *   ① **「这几轮没事」与「读数取不到」**：前者是 `emptyBuilds > 0 && quiet`，
   *      后者是 `sources` 里某一路缺席。前者是正常，后者要修 —— 同形不同因。
   *   ② **「判不了」与「看不见」**：`boundary.available:false` 意味着**根本没有边界口**
   *      （玩家名取不到 / noesis 未加载），此时引擎不隐地名是因为**判不了**，不是因为
   *      「全都看得见」。报告里这两件事必须分行，否则「隐去 0 条」会被读成「世界全公开」。
   *   ③ **三路来源各自的在场与否**：`livingWorld` / `elsewhere` / `offlineTick` 缺一路
   *      不是「那一路没发生事」，是**那个容器没装上**。
   *
   * 只读：不 build 也不写世界（`build` 会推进本模块自己的计量，诊断面不该污染它）——
   *   本节只读 `stat()` 与 `getSettings()`，两者都是纯读口。
   */
  function secWorldDiary() {
    return safe(function () {
      if (!WA.worldDiary || typeof WA.worldDiary.stat !== 'function') {
        return { error: 'engines/world-diary.js 未加载（世界日记读数缺席）' };
      }
      const st = WA.worldDiary.stat();
      const cfg = (typeof WA.worldDiary.getSettings === 'function') ? WA.worldDiary.getSettings() : null;
      const src = (st && st.sources) || {};
      const bnd = (src.boundary || { available: false, sources: [] });
      return {
        enabled: !!(cfg && cfg.enabled === true),
        // 设置面原样带出（诊断包要能复原「当时是按什么上限压的」）
        settings: cfg ? { maxLines: cfg.maxLines, maxItems: cfg.maxItems,
          includeOffline: cfg.includeOffline, hidePlace: cfg.hidePlace } : null,
        // 计分面：四栏各自可数 —— 「压了几次 / 说出了几行 / 有几次确实没事 / 溢出丢掉几条」
        builds: st.builds, linesEmitted: st.linesEmitted,
        emptyBuilds: st.emptyBuilds, dropped: st.dropped,
        lastReason: st.lastReason || null,
        faults: Object.assign({}, st.faults || {}),
        // 边界面：**判不了 vs 看不见**必须分行（合并会让「隐去 0 条」被读成「世界全公开」）
        boundary: {
          consulted: st.boundaryConsulted, available: st.boundaryAvailable,
          present: !!(bnd.available === true),
          sources: Array.isArray(bnd.sources) ? bnd.sources.slice() : [],
          why: bnd.available === true ? null : '边界口不在场 ⇒ 地名一律不点名是**判不了**，不是「全都看得见」'
        },
        // 三路来源在场与否：缺一路不是「那一路没发生事」，是那个容器没装上
        sources: {
          livingWorld: src.livingWorld === true,
          elsewhere: src.elsewhere === true,
          offlineTick: src.offlineTick === true
        },
        note: (cfg && cfg.enabled !== true)
          ? '世界日记关着 —— 这一栏零读数是「关着」，不是「没内容」'
          : (st.builds === 0
            ? '还没构建过一次（概览页没打开过 / 面板未挂载）—— 零读数不等于零内容'
            : (st.emptyBuilds === st.builds
              ? '每次都空：确认不是三路来源都没装上（见 sources）'
              : null))
      };
    }, {});
  }
  /**
   * v2.285.0（V7 EXV7-1）：今日世界简报读面。
   *
   * 本节要答的问题与世界日记节不同：那一节问「压了几句、隐了几条」，
   *   本节问「**快照链**断没断、六源核对到了几路」。简报是差分流水：
   *   `snap()` 每轮被 backstage 在事务副作用层直调（不走总线订阅 —— 那会
   *   污染 bridge 惰性订阅点的读数），故它的失效模式独有三种，混在一起
   *   就再也答不出来：
   *   ① **没被调过** —— backstage 挂载点断了 / 简报关着，`snaps === 0`。
   *      这与「世界没动静」同形（面板一样显示 quiet），必须靠 stat 分行；
   *   ② **六源核对不到** —— `sources` 里某一路 false 不是「那一轮没写入」，
   *      是**那台引擎缺席**（engines/* 未加载或 stat 键变了）；
   *   ③ **计数回落被吞** —— `dropped` 计的是「引擎计数比上次小」的次数。
   *      该轮 delta 置 null 不冒充负流水，但这件事本身值得被看见。
   *
   * 只读：不 snap（`snap` 会改本模块自己的基线与计量，诊断面不该污染它）——
   *   本节只读 `stat()` 与 `getSettings()`，两者都是纯读口。
   */
  function secWorldBriefing() {
    return safe(function () {
      if (!WA.worldBriefing || typeof WA.worldBriefing.stat !== 'function') {
        return { error: 'engines/world-briefing.js 未加载（世界简报读数缺席）' };
      }
      const st = WA.worldBriefing.stat();
      const cfg = (typeof WA.worldBriefing.getSettings === 'function') ? WA.worldBriefing.getSettings() : null;
      const src = (st && st.sources) || {};
      return {
        enabled: !!(cfg && cfg.enabled === true),
        // 设置面原样带出（诊断包要能复原「当时是按几行的上限压的」）
        settings: cfg ? { maxRows: cfg.maxRows } : null,
        // 快照链面：压了几次快照 / 最近一次在第几轮 / 最近一次为什么没压
        snaps: st.snaps, lastRound: st.lastRound, lastReason: st.lastReason || null,
        // 计数回落被吞的次数（该轮 delta 置 null，不是故障但要可见）
        dropped: st.dropped, faults: Object.assign({}, st.faults || {}),
        // 六源在场与否：缺一路不是「那一轮没写入」，是那台引擎缺席
        sources: {
          life: src.life === true, events: src.events === true, intel: src.intel === true,
          bonds: src.bonds === true, temperament: src.temperament === true, enigma: src.enigma === true
        },
        note: (cfg && cfg.enabled !== true)
          ? '世界简报关着 —— 这一栏零读数是「关着」，不是「没流水」'
          : (st.snaps === 0
            ? '还没压过一次快照（还没跑过一轮世界结算 / backstage 挂载点断了）—— 零读数不等于零流水'
            : null)
      };
    }, {});
  }
  /**
   * v2.286.0（V7 EXV7-2）：人物意图看板读面。
   *
   * 本节要答的是**数据面那一侧**的问题，与面板那一栏不同：面板答「谁在图什么、卡在哪」，
   * 本节答「为什么这一栏空着 / 这些读数可不可信」。三种空法必须分行，混在一起就再也答不出来：
   *   ① **plan 引擎缺席** —— `WA.plan.chain` 不在场。这与「大家都没计划」同形（面板一样空），
   *      但处置完全不同：一个是引擎没装，一个是世界确实还没长计划；
   *   ② **查了但没人有链** —— 人在场、plan 也在场，只是没有一条能出行的链
   *      （`checked` 有数、`rows` 为空）；
   *   ③ **被行数上限压掉** —— `skipped` / `capped` 计的是「这些人在场上但进不了看板」，
   *      不报这一格，玩家会以为世界上只有 8 个人。
   *
   * 只读：不 board（`board()` 会推进本模块自己的计量，诊断面不该污染它）——
   *   本节读 `stat()` / `getSettings()`，两者都是纯读口。
   */
  function secIntentBoard() {
    return safe(function () {
      if (!WA.intentBoard || typeof WA.intentBoard.stat !== 'function') {
        return { error: 'engines/intent-board.js 未加载（意图看板读数缺席）' };
      }
      const st = WA.intentBoard.stat();
      const cfg = (typeof WA.intentBoard.getSettings === 'function') ? WA.intentBoard.getSettings() : null;
      return {
        enabled: !!(cfg && cfg.enabled === true),
        settings: cfg ? { maxRows: cfg.maxRows, maxRest: cfg.maxRest } : null,
        // plan 引擎在场与否：缺它不是「没人有计划」，是**没有可读的链**
        planAvailable: st.planAvailable === true,
        // 看板链面：压了几张 / 出行几人 / 跳过几人 / 其中受阻几人
        boards: st.boards, rows: st.rows, skipped: st.skipped, blocked: st.blocked,
        faults: Object.assign({}, st.faults || {}),
        note: (cfg && cfg.enabled !== true)
          ? '意图看板关着 —— 这一栏零读数是「关着」，不是「没人有计划」'
          : (st.planAvailable !== true
            ? 'plan 引擎缺席 —— 看板没有可读的链（这不是「世界上没人有目标」）'
            : (st.boards === 0
              ? '还没出过一张看板（没打开过概览页 / 引擎挂载点断了）—— 零读数不等于零计划'
              : null))
      };
    }, {});
  }
  /**
   * v2.266.0（V6 EXV6-2）：人物今日动线读面。
   *
   * 本节要答的问题与世界日记节不同：那一节问「压了几句、隐了几条」，本节问
   *   **「为什么这一栏空着」**。动线有三个彼此独立的空法，混在一起就再也答不出来：
   *   ① **没扫到人** —— 幕后生活的 `people` 里没人，或 life 总开关关着；
   *   ② **扫到了但地名说不出口** —— 又分四支：known 念了 / hidden 真看不见 /
   *      unjudgeable 事实在场但判不了可见性 / suppressed 玩家自己要求不报地名 /
   *      unknown 连地点事实都没有。**判不了与看不见必须分行**，
   *      否则「隐去 0 条」会被读成「世界全公开」，「不显示地名」会被读成「他不在那」；
   *   ③ **日程时间域不对** —— 这是本版抓到的最隐蔽的一条：`life.tick` 是拿
   *      `f.now`（毫秒）去比 `start/end`，而档期预约里存的是「第几点」的钟点。
   *      两种口径混在同一个字段里，钟点口径的排班**永远命中不了**。
   *      引擎对此的处理是「不硬猜」：只有 absolute 域才答「此刻正在做什么」，
   *      clock 域只答「今天排了几段」并计入 `schedule.clock`。
   *      诊断面必须把这一栏单列 —— 否则「今日做了什么」全空会被读成「他今天没安排」。
   *
   * 只读：不 build（`build` 会推进本模块自己的计量，诊断面不该污染它）。
   *   `stat()` / `getSettings()` / `scheduleDomain([])` / `storyDay()` 四个口都是纯读。
   */
  function secDayRoute() {
    return safe(function () {
      if (!WA.dayRoute || typeof WA.dayRoute.stat !== 'function') {
        return { error: 'engines/day-route.js 未加载（人物动线读数缺席）' };
      }
      const st = WA.dayRoute.stat();
      const cfg = (typeof WA.dayRoute.getSettings === 'function') ? WA.dayRoute.getSettings() : null;
      const src = (st && st.sources) || {};
      const wh = (st && st.where) || {};
      const sc = (st && st.schedule) || {};
      const bnd = (typeof WA.dayRoute.boundary === 'function') ? WA.dayRoute.boundary() : { available: false, sources: [] };
      // 判域自证：拿一组钟点口径与一组绝对口径当场各判一次，证「两种口径确实不同域」
      //   —— 这条不是装饰：域判错时「此刻在做什么」会**静默**变成「没有安排」，
      //   而设置页那行说明是照着这个判据写的。
      const domProbe = (typeof WA.dayRoute.scheduleDomain === 'function')
        ? {
          clock: WA.dayRoute.scheduleDomain([{ start: 8, end: 12, status: 'active' }]).state,
          absolute: WA.dayRoute.scheduleDomain([{ start: 1.79e12, end: 1.79e12 + 60e3, status: 'active' }]).state,
          bad: WA.dayRoute.scheduleDomain([{ start: 12, end: 8, status: 'active' }]).state
        }
        : { error: 'scheduleDomain 未导出（判域契约缺席）' };
      const dayRead = (typeof WA.dayRoute.storyDay === 'function')
        ? WA.dayRoute.storyDay()
        : { error: 'storyDay 未导出（故事日契约缺席）' };
      return {
        enabled: !!(cfg && cfg.enabled === true),
        // 设置面原样带出（诊断包要能复原「当时是按几个人的上限压的」）
        settings: cfg ? { maxPeople: cfg.maxPeople, showNext: !!cfg.showNext, hidePlace: !!cfg.hidePlace } : null,
        builds: st.builds, peopleScanned: st.peopleScanned,
        linesEmitted: st.linesEmitted, quietBuilds: st.quietBuilds,
        lastReason: st.lastReason || null,
        faults: Object.assign({}, st.faults || {}),
        // 地名五栏各自可数：**判不了 / 玩家要求不报 / 真看不见**三件不同的事，分行
        where: { known: wh.known, hidden: wh.hidden, unjudgeable: wh.unjudgeable,
          suppressed: wh.suppressed, unknown: wh.unknown },
        // 日程域三栏：absolute 能答此刻，clock 判不了此刻 —— 合并就答不出「为什么这一栏空」
        schedule: { absolute: sc.absolute, clock: sc.clock, unjudgeable: sc.unjudgeable,
          probe: domProbe },
        // 故事日：读不到与「真的是第 1 天」必须分开（`dayReadable:false` 时 `day` 不可信）
        storyDay: dayRead,
        // 边界面：复用的是世界日记的口子（不新建第二套真源），缺席时引擎退化为本地探测并计量
        boundary: {
          consulted: st.boundary && st.boundary.consulted, available: st.boundary && st.boundary.available,
          fallback: st.boundary && st.boundary.fallback,
          present: !!(bnd && bnd.available === true),
          sources: Array.isArray(bnd && bnd.sources) ? bnd.sources.slice() : [],
          why: (bnd && bnd.available === true) ? null : '边界口不在场 ⇒ 地名一律不点名是**判不了**，不是「他不在任何地方」'
        },
        // 五路来源在场与否：缺一路不是「那一路没事」，是那个容器没装上
        sources: {
          life: src.life === true, lifeEnabled: src.lifeEnabled === true,
          laborSchedule: src.laborSchedule === true,
          boundaryOwner: src.boundaryOwner === true,
          clock: src.clock === true
        },
        note: (cfg && cfg.enabled !== true)
          ? '人物动线关着 —— 这一栏零读数是「关着」，不是「没人可报」'
          : (st.builds === 0
            ? '还没构建过一次（概览页没打开过 / 面板未挂载）—— 零读数不等于零内容'
            : (st.quietBuilds === st.builds
              ? '每次都空：先看 sources（life / laborSchedule 是否装上）再看 where（地名是否全被判不了）'
              : (src.lifeEnabled !== true
                ? '幕后生活总开关关着 —— 「今天做了什么」这一栏空是**没有安排来源**，不是「他今天没动」'
                : null)))
      };
    }, {});
  }
  /**
   * v2.273.0（V6 EXV6-9）：一键交班读数。
   *   「缺块」与「四块齐全」是两件事，本节分列报 —— 只报 complete 的话，
   *   「少了一块」与「四块都在」在诊断面上就只剩一个布尔，看不出缺的是谁、为什么。
   */
  function secHandoffPack() {
    return safe(function () {
      if (!WA.handoffPack || typeof WA.handoffPack.pack !== 'function') {
        return { error: 'engines/handoff-pack.js 未加载（一键交班读数缺席）' };
      }
      const st = WA.handoffPack.stat();
      const cfg = typeof WA.handoffPack.getSettings === 'function' ? WA.handoffPack.getSettings() : null;
      const p = WA.handoffPack.pack();
      const v = (typeof WA.handoffPack.verify === 'function') ? WA.handoffPack.verify(p) : null;
      return {
        enabled: !!(cfg && cfg.enabled),
        include: {
          blueprint: !!(cfg && cfg.includeBlueprint !== false),
          rules: !!(cfg && cfg.includeRules !== false),
          tier: !!(cfg && cfg.includeTier !== false),
          theme: !!(cfg && cfg.includeTheme !== false)
        },
        complete: !!(p && p.complete),
        blockCount: (p && p.blocks) ? Object.keys(p.blocks).length : 0,
        missing: (p && Array.isArray(p.missing)) ? p.missing.map(function (m) {
          return { id: m.id, label: m.label, why: m.why };
        }) : [],
        verdict: (v && v.verdict) ? v.verdict : null,
        verifyOk: !!(v && v.ok === true),
        packs: st.packs, verifies: st.verifies, restores: st.restores,
        missingBlocks: st.missingBlocks,
        sources: st.sources,
        note: (cfg && cfg.enabled !== true)
          ? '一键交班关着 —— 这一栏零读数是「关着」，不是「四块齐全」'
          : ((p && p.complete !== true)
            ? ('包不完整：缺 ' + ((p && p.missing) ? p.missing.length : 0) + ' 块（缺块不等于没有包）')
            : null)
      };
    }, {});
  }
  /**
   * v2.271.0（V6 EXV6-7）：开局引导读数。
   *   「测不到」与「没做」是两件事，本节分列报 —— 只报 state 的话，
   *   cannot-tell（缺读数口）会与 todo（读了、确实没做）在诊断面上长得一样。
   */
  function secFirstRun() {
    return safe(function () {
      if (!WA.firstRun || typeof WA.firstRun.build !== 'function') {
        return { error: 'engines/first-run.js 未加载（开局引导读数缺席）' };
      }
      // ⚠ 顺序：**先 build 再 stat** —— cannot-tell 计数是在 build() 里累加的，
      //   反过来读的话本次判决还没进账，诊断包里那三个计数会永远显示上一次的值
      //   （首跑因此报「计数恒 0」，而实现没问题）。与 secRoundCost / secSaveHealth 同规。
      const b = WA.firstRun.build();
      const st = WA.firstRun.stat();
      const cfg = typeof WA.firstRun.getSettings === 'function' ? WA.firstRun.getSettings() : null;
      return {
        enabled: !!(cfg && cfg.enabled),
        dismissed: !!(cfg && cfg.dismissed),
        showWhenDone: !!(cfg && cfg.showWhenDone),
        cold: !!(b && b.cold),
        visible: !!(b && b.visible),
        doneCount: (b && typeof b.doneCount === 'number') ? b.doneCount : 0,
        pendingId: (b && b.pendingId) ? b.pendingId : null,
        // 每一步：最终态 + 环境态 + 来源（env / manual / none）+ 判不出的原因
        steps: (b && Array.isArray(b.steps)) ? b.steps.map(function (s) {
          return { id: s.id, order: s.order, state: s.state, envState: s.envState,
            source: s.source, why: s.why2 || null, manualAllowed: !!s.manualAllowed };
        }) : [],
        cannotTell: {
          api: st.apiCannotTell, tier: st.tierCannotTell, talk: st.talkCannotTell
        },
        // ⚠ 注：这里**不能**再放 `cold: st.cold` —— 上面已经用 `cold` 报「本次判决是不是冷启动」
        //   （布尔），同名再写一次会让后者覆盖它，值变成 stat 的累计计数。首跑就是这么红的
        //   （`cold` 读数成了 6 而不是 true）——同一个对象里同名键写两次，JS 不报错、静默覆盖。
        coldBuilds: st.cold, warm: st.warm, builds: st.builds,
        dismissedBuilds: st.dismissedBuilds,
        manual: st.manual,
        sources: st.sources,
        note: (cfg && cfg.enabled !== true)
          ? '开局引导关着 —— 这一栏零读数是「关着」，不是「装好了」'
          // ⚠ 优先级：「有档测不到」要**排在「冷启动」之前**。反过来的话，一个上游整块缺席
          //   又恰逢冷启动的现场，note 只会说「冷启动不是故障」，把「有一档根本判不了」
          //   这件事盖掉 —— 那是把「测不到」混进「已确认的没做」（本模块最忌的形态）。
          : ((st.apiCannotTell + st.tierCannotTell + st.talkCannotTell > 0)
            ? '至少有一档是「测不到」（读数口不在场）—— 测不到不等于没做'
            : ((b && b.doneCount === 0)
              ? '三步全未完成（冷启动）—— 世界还不会出内容，这不是故障'
              : null))
      };
    }, {});
  }
  /**
   * v2.270.0（V6 EXV6-6）：存档体检读数。
   *   「上游关着」与「真的够用」是两件事，本节分列报 —— 只报 state 的话，
   *   出厂态（两个上游全关）会与「查完没事」在诊断面上长得一样。
   */
  function secSaveHealth() {
    return safe(function () {
      if (!WA.saveHealth || typeof WA.saveHealth.build !== 'function') {
        return { error: 'engines/save-health.js 未加载（存档体检读数缺席）' };
      }
      const st = WA.saveHealth.stat();
      const cfg = typeof WA.saveHealth.getSettings === 'function' ? WA.saveHealth.getSettings() : null;
      const card = WA.saveHealth.build();
      const cardState = (card && card.state) || 'unknown';
      return {
        enabled: !!(cfg && cfg.enabled),
        warnRounds: (cfg && cfg.warnRounds) || 0,
        urgentRounds: (cfg && cfg.urgentRounds) || 0,
        state: cardState,
        bytes: (card && card.bytes !== undefined) ? card.bytes : null,
        quotaBytes: (card && card.quotaBytes !== undefined) ? card.quotaBytes : null,
        usedPct: (card && card.usedPct !== undefined) ? card.usedPct : null,
        trendAvailable: !!(card && card.trend && card.trend.available),
        trendReason: (card && card.trend && card.trend.reason) ? card.trend.reason : null,
        trendInRounds: (card && card.trend && card.trend.inRounds !== undefined) ? card.trend.inRounds : null,
        waterlineAvailable: !!(card && card.waterline && card.waterline.available),
        waterlineFull: (card && card.waterline) ? card.waterline.fullCount : null,
        waterlineNear: (card && card.waterline) ? card.waterline.nearCount : null,
        obligationsAvailable: !!(card && card.obligations && card.obligations.available),
        obligationsTotal: (card && card.obligations) ? card.obligations.total : null,
        adviceCount: (card && Array.isArray(card.advice)) ? card.advice.length : 0,
        adviceTotal: (card && typeof card.adviceTotal === 'number') ? card.adviceTotal : 0,
        adviceCodes: (card && Array.isArray(card.advice)) ? card.advice.map(function (x) { return x.code; }) : [],
        builds: st.builds, healthy: st.healthy, watch: st.watch, urgent: st.urgent,
        noData: st.noData, forecasterOff: st.forecasterOff, waterlineOff: st.waterlineOff,
        sources: st.sources,
        note: (cfg && cfg.enabled !== true)
          ? '存档体检关着 —— 这一栏零读数是「关着」，不是「存档很空」'
          : (cardState === 'no-data'
            ? '这张体检单读不全（上游缺面）—— 缺口不等于健康'
            : (cardState === 'healthy' && st.forecasterOff > 0
              ? '本局读数尚可，但历史上至少有一次趋势面不在场（forecasterOff 计数）'
              : null))
      };
    }, {});
  }
  /**
   * v2.269.0（V6 EXV6-5）：单轮成本卡读数。
   *   「还没有注入过任何一轮」与「本轮花了 0」是两件事，本节分开报 —— 只报 used 的话，
   *   出厂态（从没推演过）与「预算裁决真的裁了 0t」在诊断面上长得一样。
   */
  function secRoundCost() {
    return safe(function () {
      if (!WA.roundCost || typeof WA.roundCost.build !== 'function') {
        return { error: 'engines/round-cost.js 未加载（单轮成本读数缺席）' };
      }
      const st = WA.roundCost.stat();
      const cfg = typeof WA.roundCost.getSettings === 'function' ? WA.roundCost.getSettings() : null;
      const card = WA.roundCost.build();
      // ⚠ note 必须读**本次 build 的返回值**（`card.state`），不能读 `st.lastState` ——
      //   stat() 在 build() **之前**调用，那次读到的是上一轮的判决，首次打开诊断包时
      //   它必然是空串 ⇒ note 恒 null。「拿旧判决描述本次状态」是本节最容易写出的假绿
      //   （判据照样绿，玩家拿到的 note 永远是空的）。
      const cardState = (card && card.state) || 'unknown';
      return {
        enabled: !!(cfg && cfg.enabled),
        topN: (cfg && cfg.topN) || 0,
        showTiming: !!(cfg && cfg.showTiming),
        showLongTrend: !!(cfg && cfg.showLongTrend),
        state: cardState,
        used: (card && card.used !== undefined) ? card.used : null,
        cap: (card && card.cap !== undefined) ? card.cap : null,
        chars: (card && card.chars !== undefined) ? card.chars : null,
        round: (card && card.round !== undefined) ? card.round : null,
        boarded: (card && card.board) ? card.board.rows : 0,
        boardFresh: (card && card.board) ? card.board.fresh : 0,
        boardStale: (card && card.board) ? card.board.stale : 0,
        boardCapped: !!(card && card.board && card.board.capped),
        zeroInBoard: (card && card.board) ? card.board.zeroInBoard : 0,
        flaggedAll: (card && Array.isArray(card.flaggedAll)) ? card.flaggedAll.slice(0, 8) : [],
        builds: st.builds, cards: st.cards, noReading: st.noReading, disabled: st.disabled,
        longTrendReads: st.longTrendReads,
        sources: st.sources,
        note: (cfg && cfg.enabled !== true)
          ? '单轮成本卡关着 —— 这一栏零读数是「关着」，不是「没有成本」'
          : (cardState === 'no-reading'
            ? '还没有注入过任何一轮（读不到 ≠ 这一轮没花钱）'
            : (cardState === 'empty'
              ? '上一轮没有可裁的注入项（有快照、无预算裁决）'
              : null))
      };
    }, {});
  }
  /**
   * v2.268.0（V6 EXV6-4）：暗流日历读数。
   *   「未来三天未发现迫近的未结算暗流」与「日历关着」是两件事，本节分列报。
   */
  function secUndercurrentCalendar() {
    return safe(function () {
      if (!WA.undercurrentCalendar || typeof WA.undercurrentCalendar.stat !== 'function') {
        return { error: 'engines/undercurrent-calendar.js 未加载（暗流日历读数缺席）' };
      }
      const st = WA.undercurrentCalendar.stat();
      const cfg = typeof WA.undercurrentCalendar.getSettings === 'function' ? WA.undercurrentCalendar.getSettings() : null;
      let last = null;
      try { last = WA.undercurrentCalendar.build(); } catch (e) { last = null; }
      return {
        enabled: !!(cfg && cfg.enabled),
        horizonDays: (cfg && cfg.horizonDays) || 0,
        maxItems: (cfg && cfg.maxItems) || 0,
        showHidden: !!(cfg && cfg.showHidden),
        builds: st.builds || 0,
        emptyBuilds: st.emptyBuilds || 0,
        itemsProjected: st.itemsProjected || 0,
        hiddenShielded: st.hiddenShielded || 0,
        totalActive: (last && typeof last.totalActive === 'number') ? last.totalActive : 0,
        visibleNow: (last && Array.isArray(last.items)) ? last.items.length : 0,
        baseDayLabel: (last && last.baseDay && last.baseDay.label) || '',
        baseDaySource: (last && last.baseDay && last.baseDay.source) || '',
        note: (cfg && cfg.enabled !== true)
          ? '暗流日历关着 —— 这一栏零读数是「关着」，不是「没有未结算暗流」'
          : (st.builds === 0
            ? '还没构建过一次（概览页没打开过 / 面板未挂载）'
            : null)
      };
    }, {});
  }
  /**
   * v2.267.0（V6 EXV6-3）：关系温度计读数。
   */
  function secRelationTemp() {
    return safe(function () {
      if (!WA.relationTemp || typeof WA.relationTemp.stat !== 'function') {
        return { error: 'engines/relation-temp.js 未加载（关系温度计读数缺席）' };
      }
      const st = WA.relationTemp.stat();
      const ns = typeof WA.relationTemp.networkStat === 'function' ? WA.relationTemp.networkStat() : {};
      const cfg = typeof WA.relationTemp.getSettings === 'function' ? WA.relationTemp.getSettings() : null;
      return {
        enabled: !!(cfg && cfg.enabled),
        builds: st.builds || 0,
        linesEmitted: st.linesEmitted || 0,
        emptyBuilds: st.emptyBuilds || 0,
        warmer: st.warmerCount || 0,
        colder: st.colderCount || 0,
        steady: st.steadyCount || 0,
        lastReason: st.lastReason || '',
        sources: {
          bonds: !!(WA.bonds && typeof WA.bonds.read === 'function'),
          fondness: !!(WA.fondness && typeof WA.fondness.read === 'function')
        },
        network: {
          builds: ns.builds || 0,
          rowsEmitted: ns.rowsEmitted || 0,
          emptyBuilds: ns.emptyBuilds || 0,
          lastReason: ns.lastReason || '',
          owner: !!(WA.bonds && typeof WA.bonds.network === 'function'),
          enriched: !!(WA.relationTemp && typeof WA.relationTemp.network === 'function')
        },
        note: (cfg && cfg.enabled !== true)
          ? '关系温度计关着 —— 这一栏零读数是「关着」，不是「无关系记录」'
          : (st.builds === 0
            ? '还没构建过一次（概览页没打开过 / 面板未挂载）'
            : null)
      };
    }, {});
  }
/**
   * v2.165.0（TX1）：势力外交读面。
   *   与 faction-graph 节的分工必须在这里说清：那一节答「按双方立场**推导**出来的关系图是
   *   什么样」（derived:true），本节答「**谈成了什么**」（pairId / 双边态度 / 有效条款 / 到期）。
   *   两问的失效模式完全不同：推导面失效在「算出来没人看」，事实面失效在
   *   「条约到期了没人收」—— 后者会让一张早该失效的禁运永远挂在商路上，
   *   故本节必须把 `activeTerms` 与 `open`（未结提案）分列读数，而不是只报「有几对势力」。
   *   两个「没得看」的态也要分开：「开关关着」（enabled false）与「开关开着但一对都没谈过」
   *   —— 前者去设置页，后者去 propose。
   */
  function secDiplomacy() {
    return safe(function () {
      if (!WA.diplomacy || typeof WA.diplomacy.stat !== 'function') return { error: 'engines/diplomacy.js 未加载（外交事实读数缺席）' };
      const st = WA.diplomacy.stat();
      const v = (typeof WA.diplomacy.view === 'function') ? WA.diplomacy.view() : { pairs: [], open: [] };
      return {
        enabled: st.enabled,
        pairs: st.live ? st.live.pairs : 0,
        open: st.live ? st.live.open : 0,
        activeTerms: st.live ? st.live.activeTerms : 0,
        signed: st.signed, refused: st.refused, lastReason: st.lastReason,
        faults: Object.assign({}, st.faults || {}),
        terms: (WA.diplomacy.TERMS || []).slice(),
        states: (WA.diplomacy.STATES || []).slice(),
        rows: (v.pairs || []).map(function (r) {
          return { pairId: r.pairId, a: r.a, b: r.b, state: r.state, stateLabel: r.stateLabel,
            att: { a2b: r.att.a2b, b2a: r.att.b2a },
            active: (r.activeTerms || []).map(function (x) { return { term: x.term, label: x.label, until: x.until }; }) };
        }),
        // v2.165.0（TX1）：pairId 对称性探针 + 自证面（pairId / diagnose 的诊断消费方）。
        //   为什么在这里再探一次：诊断节是「按什么口径算」的唯一答处——同一对势力
        //   参数顺序颠倒后 id 必须相同（[a,b].sort() + FNV-1a 的契约），这里当场证，
        //   不等外部脚本旁证。
        pairSymmetry: (typeof WA.diplomacy.pairId === 'function')
          ? { probe: '甲盟×乙邦 正反各算一次', same: WA.diplomacy.pairId('甲盟', '乙邦') === WA.diplomacy.pairId('乙邦', '甲盟'),
              sample: WA.diplomacy.pairId('甲盟', '乙邦') }
          : { error: 'pairId 未导出（稳定 ID 契约缺席）' },
        self: (typeof WA.diplomacy.diagnose === 'function')
          ? WA.diplomacy.diagnose()
          : { error: 'diagnose 未导出（自证面缺席）' },
        note: !st.enabled ? '外交总开关关闭（默认关）—— 关闭时不提案、不签约、不注入'
          : ((st.live && st.live.pairs === 0) ? '开关开着但一对都没谈过（propose 未调用）——「没谈过」不等于「推导图上写着中立」'
            : ((st.live && st.live.open > 0) ? '有未结提案（proposed / countered / accepted）—— 未签约提案不产生正式世界效果' : null))
      };
    });
  }
  // v2.166.0（TX2）：行动调度诊断面（agency.diagnose / agency.stat 的诊断消费方）。
  //   与 secDiplomacy 同规格：模块缺席报 error，开关关着报 note，自证面探 closedLoop。
  //   诊断节是「按什么口径算」的唯一答处——这里当场探闭环完整性，不等外部脚本旁证。
  function secAgency() {
    return safe(function () {
      if (!WA.agency || typeof WA.agency.diagnose !== 'function') return { error: 'engines/agency.js 未加载（行动调度读数缺席）' };
      var d = WA.agency.diagnose();
      var st = (typeof WA.agency.stat === 'function') ? WA.agency.stat() : {};
      return {
        enabled: d.enabled,
        maxSchedulePerTurn: d.maxSchedulePerTurn,
        maxReceiptsPerTurn: d.maxReceiptsPerTurn,
        autoPlanExpand: d.autoPlanExpand,
        scheduled: st.scheduled || 0, admitted: st.admitted || 0,
        receipts: st.receipts || 0, stepsDone: st.stepsDone || 0,
        stepsBlocked: st.stepsBlocked || 0, goalsDone: st.goalsDone || 0,
        goalsBlocked: st.goalsBlocked || 0, deferred: st.deferred || 0,
        lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}),
        lifeAvailable: d.lifeAvailable,
        planAvailable: d.planAvailable,
        actAvailable: d.actAvailable,
        closedLoop: d.closedLoop,
        self: d,
        note: !d.enabled ? '行动闭环总开关关闭（默认关）—— 关闭时不调度、不处理回执、不注入'
          : (!d.closedLoop ? '开关开着但闭环不完整（life / plan / act 有缺席）—— 调度会返回 module-unavailable'
            : null)
      };
    });
  }

  /**
   * v2.167.0（TX3）：守恒运输与在途履约读数。
   *   为什么单列一节而不并进 economy 节：economy 那节答「货架上的价与量」，
   *   本节答「这批货从哪发到哪、走到哪了、能不能取消/改道」——两问的失效模式不同
   *   （前者失效在「没库存」，后者失效在「在途丢了 ⇒ 守恒断裂」，
   *   而后者还有一个更坏的形态：「已到货」与「在途」看起来都是「有货在路上」）。
   */
  function secFreight() {
    return safe(function () {
      if (!WA.freight || typeof WA.freight.diagnose !== 'function') return { error: 'engines/freight.js 未加载（货运读数缺席）' };
      var d = WA.freight.diagnose();
      var st = (typeof WA.freight.stat === 'function') ? WA.freight.stat() : {};
      return {
        enabled: d.enabled,
        economyAvailable: d.economyAvailable,
        storeAvailable: d.storeAvailable,
        closedLoop: d.closedLoop,
        shipments: d.shipments,
        inTransit: d.inTransit,
        arrived: d.arrived,
        cancelled: d.cancelled,
        cap: d.cap,
        dispatched: st.dispatched || 0,
        cancelledCount: st.cancelled || 0,
        rerouted: st.rerouted || 0,
        blocked: st.blocked || 0,
        lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}),
        self: d,
        note: !d.enabled ? '货运总开关关闭（默认关）—— 关闭时不发运、不到货、不注入'
          : (!d.closedLoop ? '开关开着但闭环不完整（economy 或 store 缺席）—— dispatch 会返回 store-unavailable'
            : null)
      };
    });
  }
  function secStoryChoice() {
    var sc = WA.storyChoice;
    if (!sc) return { error: 'storyChoice 模块未装载', closedLoop: false };
    var d = sc.diagnose();
    return { module: 'storyChoice', loaded: true, closedLoop: d.closedLoop,
      checks: d.checks, version: d.version,
      stat: sc.stat() };
  }
  function secStoryWindow() {
    // v2.518.0（EX-1/OP-6）：故事回应窗口的诊断面。
    //   答三问：窗口开了几次、当前挂的是哪一条、玩家那一笔落到哪个 owner 的哪个阶段。
    //   **不读世界事实、不重算痕迹** —— 只读窗口自己记下的账，避免诊断面变成第二个真源。
    var sw = WA.storyWindow;
    if (!sw) return { error: 'storyWindow 模块未装载', closedLoop: false };
    // 显式走 `WA.storyWindow.diagnose()` 全名而不用局部别名 `sw.diagnose()`：
    //   死子面清册（tests/inventory.js 的 REF_RE）认的正是 `WA <sep> ns <sep> mem` 形态，
    //   别名调用在产品面里是**看不见的消费** —— 会被 tests/dead-export-gate.js 判成
    //   「define 了但产品零引用」，于是逼着人把它登记成死导出。
    //   这里不是为讨好门禁而改名：**诊断面确实消费这两个成员**，让引用可见才与事实同宽。
    var d = WA.storyWindow.diagnose();
    // stat 同理：诊断面确实读它（窗口累计读数），显式消费而不是让它漂成「过度导出」。
    var swStat = WA.storyWindow.stat();
    // evidence 也走全名：诊断面原样转出这三组读数，消费方必须看得到。
    var swEvidence = WA.storyWindow.evidence();
    return { module: 'storyWindow', loaded: true, closedLoop: d.closedLoop,
      checks: d.checks, version: d.version,
      // 投影故障自证位：哪个 owner 的数据形状让投影块抛错了，在这里看得见。
      projection: d.projection || null,
      // v2.518.0（OP-7/OP-8/OP-9）：三组只读证据面。
      //   stability = 有没有被截断/重试/中止；health = 有没有降智迹象（行为面 + 身份面分开报）；
      //   routing = 谁应答了、钉版对不对、卡在哪一段。
      //   读不到一律 unknown —— 绝不把「读不到」当「一切正常」。
      evidence: swEvidence,
      stat: swStat };
  }
  function secCommission() {
    var cm = WA.commission;
    if (!cm) return { error: 'commission 模块未装载', closedLoop: false };
    var d = cm.diagnose();
    return { module: 'commission', loaded: true, closedLoop: d.closedLoop,
      checks: d.checks, version: d.version,
      stat: cm.stat() };
  }
  function secInvestigation() {
    var iv = WA.investigation;
    if (!iv) return { error: 'investigation 模块未装载', closedLoop: false };
    var d = iv.diagnose();
    return { module: 'investigation', loaded: true, closedLoop: d.closedLoop,
      checks: d.checks, version: d.version,
      stat: iv.stat() };
  }
  function secAftermath() {
    var af = WA.aftermath;
    if (!af) return { error: 'aftermath 模块未装载', closedLoop: false };
    var d = af.diagnose();
    return { module: 'aftermath', loaded: true, closedLoop: d.closedLoop,
      checks: d.checks, version: d.version,
      stat: af.stat() };
  }
  /**
   * v2.156.0（SP1）：时间来源与游玩活动基准读数。
   *   为什么单列一节而不并进 life 节：life 那节答「人物这一轮做了什么」，
   *   本节答「玩家离开的这段真实时间被谁记着」——两问的失效模式不同
   *   （前者失效在「人物没动」，后者失效在「基准丢了 ⇒ 离线间隔被抹平」，
   *   而后者还有一个更坏的形态：「从没记过」与「盘读不出来」长得一模一样）。
   */
  function secPlaytime() {
    return safe(function () {
      if (!WA.playtime || typeof WA.playtime.stat !== 'function') return { error: 'engines/playtime.js 未加载（游玩活动基准读数缺席）' };
      const st = WA.playtime.stat();
      const la = (typeof WA.playtime.lastActive === 'function') ? WA.playtime.lastActive() : { ok: false, reason: 'module-missing' };
      const sc = (typeof WA.playtime.story === 'function') ? WA.playtime.story() : { ok: false, reason: 'module-missing' };
      // 取用表进诊断面：四种时间「各自的读法 / 用途 / 是否写盘」是 SP1 的拟交付物之一，
      //   而**只导出不消费**等于它没交付 —— 诊断面是它唯一的读者（读的人不必去猜边界在哪）。
      const tb = (typeof WA.playtime.sources === 'function') ? WA.playtime.sources() : [];
      return {
        enabled: st.enabled, updateMinMs: st.updateMinMs, maxChats: st.maxChats,
        touches: st.touches, throttled: st.throttled, reads: st.reads,
        readFails: st.readFails, writeFails: st.writeFails, pruned: st.pruned,
        lastReason: st.lastReason, faults: Object.assign({}, st.faults || {}),
        names: (WA.playtime.SOURCE_NAMES || []).slice(),
        sourcesTable: tb.map(function (r) { return { name: r.name, api: r.api, writes: !!r.writes }; }),
        dataKey: WA.playtime.DATA_KEY, dataVer: st.dataVer,
        hasBaseline: !!la.ok, baselineAt: la.ok ? la.at : 0, baselineAgeMs: la.ok ? la.ageMs : null,
        storyOk: !!sc.ok, storyLabel: sc.ok ? sc.label : '', storyReason: sc.ok ? '' : sc.reason,
        note: la.ok ? null : (st.readFails > 0
          ? '活动基准读不出，且本会话有 ' + st.readFails + ' 次存储读失败 —— 这是存储故障，不是「本聊天从没记过」'
          : '本聊天尚未记过活动基准（touch 未被调用过）—— 「没记过」不等于「你走了零秒」')
      };
    });
  }

  /**
   * v2.156.0（S1）：离线恢复编排读数。
   *   为什么单列一节：playtime 那节答「你上次什么时候在」，本节答「这段离开被怎么结算、
   *   有没有被重复结算」—— 后者的失效模式是**静默的**（重复推演与真的又离开一次
   *   在读数上同形），故票据/重试/磁带三组计数必须摊开。
   */
  function secOfflineReturn() {
    return safe(function () {
      if (!WA.offlineReturn || typeof WA.offlineReturn.stat !== 'function') return { error: 'engines/offline-return.js 未加载（离线恢复编排读数缺席）' };
      const st = WA.offlineReturn.stat();
      return {
        enabled: !!st.enabled, deferMs: st.deferMs,
        recovers: st.recovers, firsts: st.firsts, skipped: st.skipped, fails: st.fails,
        retries: st.retries, settleTicks: st.settleTicks, rounds: st.rounds, protectedRows: st.protectedRows,
        ticketChecks: st.ticketChecks, staleTickets: st.staleTickets,
        consumeChecks: st.consumeChecks, consumes: st.consumes, consumeSkips: st.consumeSkips,
        running: !!st.running, subscribed: !!st.subscribed, hasRetryTape: !!st.hasRetryTape,
        chatId: st.chatId, settledAt: st.settledAt, pending: st.pending,
        offlineTickEnabled: !!st.offlineTickEnabled, stepMs: st.stepMs, minGapMs: st.minGapMs,
        lastReason: st.lastReason || '', lastAt: st.lastAt || 0, lastGapMs: st.lastGapMs,
        faults: Object.assign({}, st.faults || {}),
        src: st.src, settingsKey: st.settingsKey,
        note: st.staleTickets > 0
          ? '本会话有 ' + st.staleTickets + ' 次票据复核未过 —— 那是「同一段离线被拦下第二次」的现场，不是失败'
          : null
      };
    });
  }

  // ── v2.182.0（第二批 E2/E5/O4/O3/O5）：五只只读聚合面的现场读数 ──────────
  //   五节分列不合并 —— 它们答的是**五个不同的问题**，失效模式也各自独立：
  //     · agenda        答「接下来会发生什么」（失效在「未知时间被拿现在冒充」）；
  //     · chronicleView 答「已经发生过什么、有哪些被藏起来」（失效在「空历史与读不到同形」）；
  //     · capacityAudit 答「仓库还剩多少、能回收什么」（失效在「离配额多远没人算」）；
  //     · perfBaseline  答「这一局属于哪一档、离预算多远」（失效在「没测过被写成小局」）；
  //     · worldHealth   答「我现在有什么没做完 / 卡住了 / 快满了」（失效在「三问都要逐个模块翻」）。
  //   共同纪律：只念现场，不替用户跑动作（跑清点 / 跑基准是面板出口的事）。
  /**
   * v2.291.0（V7 EXV7-7）：事件日历读数 —— 未来会发生什么、谁承诺了。
   *   两条来源合在一节里，因为它们答的是**同一个问题**（「接下来」），
   *   但**不合并成一个计数**：事件有确定时刻、承诺只有到期窗口，
   *   合成一个数之后就再也答不出「这周是要跑事还是要还债」。
   *
   *   与 secSediment / secTapeStore 同规：**只报读数、不写世界** ——
   *   不 claim、不 tick、不改 stage、不推进任何状态。
   *
   *   两种「没得看」必须分开报（本仓反复付过代价的那条）：
   *     · 模块关着（disabled）≠ 表里空了（total:0）≠ 读不出来（error）；
   *     · conditional 行**没有确定时刻**，进 untimed 而不是被猜一个日期。
   */
  function secCalendar() {
    return safe(function () {
      const out = { events: null, commitments: null };
      // ① 事件钟未来轴
      out.events = (function () {
        if (!WA.events || typeof WA.events.timelineView !== 'function') {
          return { error: 'engines/events.js 的 timelineView 缺席（未来轴不可用）' };
        }
        try {
          const tv = WA.events.timelineView({ maxRows: 24 });
          if (!tv || tv.ok !== true) return { error: (tv && tv.reason) || 'timelineView 拒收' };
          return {
            clock: tv.clock, now: tv.now,
            total: tv.total, timedCount: tv.timedCount, untimedCount: tv.untimedCount,
            dueCount: tv.dueCount, blockedCount: tv.blockedCount,
            byKind: Object.assign({}, tv.byKind || {}), byStatus: Object.assign({}, tv.byStatus || {}),
            truncated: !!tv.truncated, dropped: tv.dropped,
            // 行的字段裁剪到「读者要判的那几个」：引擎把整行透出，但诊断面报全字段
            //   会让「这一条在哪一刻、到没到点」淹没在 payload 里。
            rows: (tv.rows || []).map(function (r) {
              return { id: r.id, kind: r.kind, title: r.title, at: r.at, due: r.due,
                unknown: r.unknown, blocked: r.blocked, priority: r.priority };
            }),
            calendarNote: tv.total + ' 条在未来轴上（有时间 ' + tv.timedCount + ' / 条件待触发 '
              + tv.untimedCount + '）· 已到点未认领 ' + tv.dueCount + ' 条'
              + (tv.truncated ? '（另有 ' + tv.dropped + ' 条未列出）' : '')
          };
        } catch (e) { return { error: 'timelineView 抛错: ' + (e && e.message ? e.message : String(e)) }; }
      })();
      // ② 承诺台账（人物许下的、欠下的、瞒着的、约定的、划下的）
      out.commitments = (function () {
        if (!WA.life || typeof WA.life.commitmentsView !== 'function') {
          return { error: 'engines/life.js 的 commitmentsView 缺席（承诺台账不可用）' };
        }
        try {
          const cv = WA.life.commitmentsView({});
          if (!cv || cv.ok !== true) return { error: (cv && cv.reason) || 'commitmentsView 拒收' };
          return {
            total: cv.total, overdueCount: cv.overdueCount,
            people: cv.people, peopleTotal: cv.peopleTotal, cap: cv.cap, truncated: !!cv.truncated,
            byKind: Object.assign({}, cv.byKind || {}),
            rows: (cv.rows || []).map(function (p) {
              return { person: p.person, count: p.count, shown: p.shown,
                overdue: (p.items || []).filter(function (i) { return i.overdue; }).length,
                kinds: (p.items || []).map(function (i) { return i.kind; }) };
            }),
            commitNote: cv.people + ' 人有承诺（共 ' + cv.total + ' 条，其中已过期 '
              + cv.overdueCount + ' 条）'
              + (cv.truncated ? '（另有 ' + (cv.peopleTotal - cv.people) + ' 人未列出）' : '')
          };
        } catch (e) { return { error: 'commitmentsView 抛错: ' + (e && e.message ? e.message : String(e)) }; }
      })();
      out.note = '事件走事件钟、承诺只有到期窗口 —— 两条来源不合并成一个计数；'
        + 'conditional 无确定时刻，不猜日期';
      return out;
    });
  }
  /**
   * v2.292.0（V7 EXV7-8）：世界自传读数 —— 长局分几个阶段、每个阶段留了什么。
   *
   *   与相邻两节答的**不是同一问**（这也是它不能并进任何一节的理由）：
   *     · secChronicleView 答「逐条发生了什么」（扁平时间序，长局滚成几百条）；
   *     · 本节答「整局下来世界分几个阶段、每阶段留了什么」——把扁平列表压成有边界的分章；
   *     · 世界日记 / 简报**只作尾部附记**（覆盖最近几轮 / 单轮流水，不属于任何一章）。
   *
   *   三种「没得看」必须分开报（本仓反复付过代价的那条）：
   *     · 模块关着（disabled）≠ 一条归档都没有（chapters:0，ok:true）
   *       ≠ 源读不出来（chrono-absent / chrono-threw / chronicle-refused，各自如实报）。
   *   把这几个合成一句「失败」，读者就再也分不清「没发生过」与「看不到」。
   *
   *   与 secSediment / secTapeStore 同规：**只报读数、不写世界** ——
   *   不生成情节、不润色、不写盘；本模块本身没有写口。
   */
  /**
   * v2.293.0（V7 EXV7-9）：一键播种读数 —— 空世界能种出什么、种不动是因为哪一条。
   *
   *   本节**只读**：它调 `view()`（读数）与 `plan()`（只算不写），**绝不调 `seed()`** ——
   *   诊断面一旦写世界，「点开诊断看一眼」就等于播了一批人，那是本仓最不能接受的那种副作用
   *   （与 world-autobiography / sediment 各节同规：诊断节永不写）。
   *
   *   为什么 `plan` 不算「写」：它只现场抽一份名单给你看（`names` / `places` / `roads` /
   *   `factions` / `pairs` / `goals`），一个写口都不碰。计划里的 `will` 与 `want` 并列 ——
   *   「你要几个」与「真能写几个」分开报，是因为缩水（容器没余量）与参数没生效在读数上同形。
   *
   *   四路「播不动」必须分列（不许合成一句失败）：
   *     · `disabled`      —— 入口关着（去开开关）；
   *     · `writes-absent` —— 写口/上限登记不全（去查装配，不是去改参数）；
   *     · `no-room`       —— 容器真满了（去清理，或换一局）；
   *     · 参数夹取 `clamped` —— 参数合法但被夹（去改参数）。
   */
  function secPopulate() {
    return safe(function () {
      if (!WA.populate || typeof WA.populate.view !== 'function') {
        return { error: 'engines/populate.js 未加载（一键播种读数缺席）' };
      }
      const v = WA.populate.view();
      const out = {
        enabled: !!v.enabled,
        writesPresent: !!v.writesPresent,
        yieldVerification: v.yieldVerification || null,
        writesMissing: (v.writesMissing || []).slice(),
        used: Object.assign({}, v.used || {}),
        rooms: Object.assign({}, v.rooms || {}),
        // 三路「播不动」的原因分列（view 已经算好；缺失即为空串 = 没有拦路石）
        blockedWhy: v.blockedWhy || '',
        cfg: Object.assign({}, v.cfg || {}),
        seed: Object.assign({}, v.seed || {}),
        // stat 走**自己的读口**，不套在 view() 的返回体里：view 答「此刻能不能播」、
        //   stat 答「此前播过几次、成了几笔」。混在一处之后，「还没播过」与「播了但没记」同形。
        stat: (typeof WA.populate.stat === 'function')
          ? Object.assign({}, WA.populate.stat() || {})
          : Object.assign({}, v.stat || {}),
        note: v.note || ''
      };
      // 计划预览：只在「开且写面齐」时才算 —— 其余情形算出来的 plan 一定是 ok:false，
      //   把它塞进读数只会让诊断包多一张「必然失败」的表，读者反而看不见真正的拦路石。
      if (v.enabled && v.writesPresent) {
        let p = null;
        try { p = WA.populate.plan({}); } catch (e) {
          return Object.assign(out, { planError: 'plan 抛错: ' + (e && e.message ? e.message : String(e)) });
        }
        if (p && p.ok === true) {
          out.plan = {
            region: p.region, regionSource: p.regionSource,
            want: Object.assign({}, p.want), will: Object.assign({}, p.will),
            clamped: (p.clamped || []).slice(),
            names: (p.names || []).slice(0, 16),
            places: (p.places || []).map(function (x) { return x.name; }).slice(0, 12),
            roads: (p.roads || []).length, factions: (p.factions || []).map(function (x) { return x.name; }),
            bonds: (p.pairs || []).length, goals: (p.goals || []).length
          };
        } else {
          out.planRefused = { reason: (p && p.reason) || 'unknown',
            note: (p && p.note) || '', missing: (p && p.missing) || null };
        }
      }
      out.note2 = '本节只读：调 view() 与 plan()，绝不调 seed() —— 看诊断不该播出一批人';
      return out;
    });
  }
  function secAutobio() {
    return safe(function () {
      if (!WA.worldAutobiography || typeof WA.worldAutobiography.autobiography !== 'function') {
        return { error: 'engines/world-autobiography.js 未加载（世界自传读数缺席）' };
      }
      const cfg = (typeof WA.worldAutobiography.getSettings === 'function')
        ? WA.worldAutobiography.getSettings() : {};
      let a = null;
      try { a = WA.worldAutobiography.autobiography({}); }
      catch (e) { return { error: 'autobiography 抛错: ' + (e && e.message ? e.message : String(e)) }; }
      if (!a || a.ok !== true) {
        const why = (a && a.reason) || 'refused';
        return {
          enabled: !!cfg.enabled,
          reason: why,
          chapters: 0,
          // 关着 ≠ 读不到：两者的处置完全不同（一个去开开关，一个去查源）
          note: (why === 'disabled')
            ? '世界自传关着 —— 这不是「这一局没发生过事」，开关打开后才有自传'
            : '编年史这一侧读不出来（' + String(why) + '）—— 拒绝给出半份自传'
        };
      }
      return {
        enabled: true,
        chapterMode: a.chapterMode, degraded: !!a.degraded,
        chapters: a.chapters, chaptersTotal: a.chaptersTotal, droppedChapters: a.droppedChapters,
        total: a.total, lines: a.lines, droppedLines: a.droppedLines,
        hiddenCount: a.hiddenCount, roundMisses: a.roundMisses,
        cappedBySource: !!a.cappedBySource,
        byKind: Object.assign({}, a.byKind || {}),
        storyLabel: a.storyLabel,
        // 章只报「边界 + 计数 + 头两行」：诊断包是读数面，不是第二份自传
        chaptersList: (a.rows || []).map(function (c) {
          return {
            index: c.index, from: c.from, to: c.to, rounds: c.rounds,
            count: c.count, shown: c.shown, dropped: c.dropped,
            kinds: Object.assign({}, c.kinds || {}),
            head: (c.lines || []).slice(0, 2)
          };
        }),
        appendix: {
          diary: (a.appendix && a.appendix.diary) ? {
            absent: !!a.appendix.diary.absent, quiet: !!a.appendix.diary.quiet,
            why: a.appendix.diary.why || '',
            lines: (a.appendix.diary.lines || []).slice(0, 2)
          } : null,
          briefing: (a.appendix && a.appendix.briefing) ? {
            absent: !!a.appendix.briefing.absent, quiet: !!a.appendix.briefing.quiet,
            why: a.appendix.briefing.why || '',
            round: a.appendix.briefing.round,
            sources: a.appendix.briefing.sources,
            lines: (a.appendix.briefing.lines || []).slice(0, 2)
          } : null
        },
        // by-volume 必须说破：不写这句，读者会把「按体积切的」当成「按阶段切的」。
        modeNote: (a.chapterMode === 'by-volume')
          ? '本局没有任何两条相邻条目同时带轮号 ⇒ 按条数断章（by-volume）——'
            + '章的先后只反映归档体积，不反映阶段'
          : '按轮断章：只用两个都带轮号的相邻条目之间的轮差，不折算时间',
        // 本读口自己的观测计数（reads / exports / byRound / byVolume / roundMisses）：
        //   它是「这个读口被用过几次、退化过几次」的唯一答案，诊断包不读就没人读。
        //   取不到就如实报 null —— 不拿一份全零冒充「从没跑过」。
        stat: (typeof WA.worldAutobiography.stat === 'function') ? WA.worldAutobiography.stat() : null,
        autobioNote: a.chapters + ' 章 / 归档 ' + a.total + ' 条 · 已摘 ' + a.lines + ' 行'
          + (a.droppedLines ? '（另有 ' + a.droppedLines + ' 行未摘录）' : '')
          + (a.droppedChapters ? '（另有 ' + a.droppedChapters + ' 章已略去）' : '')
          + ' · 轮坐标缺失 ' + a.roundMisses + ' 条（缺轮号可能漏掉真实边界 —— 已知上限，不补轮号）'
      };
    });
  }
  function secAgenda() {
    return safe(function () {
      if (!WA.agenda || typeof WA.agenda.stat !== 'function') return { error: 'engines/agenda.js 未加载（世界日程读数缺席）' };
      const st = WA.agenda.stat();
      const cfg = WA.agenda.getSettings();
      const up = WA.agenda.upcoming();
      return {
        enabled: !!cfg.enabled, maxRows: cfg.maxRows,
        reads: st.reads, refused: st.refused, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}), bySource: Object.assign({}, st.bySource || {}),
        // 读面现状：ok:false 时带 reason —— 「拒算」与「算出来是空表」在读数上必须可分。
        ok: !!up.ok, reason: up.ok ? null : (up.reason || '?'),
        count: up.ok ? up.count : null, total: up.ok ? up.total : null, capped: up.ok ? !!up.capped : null,
        timedCount: up.ok ? up.timedCount : null, untimedCount: up.ok ? up.untimedCount : null,
        storyDay: up.ok ? up.storyDay : null, storyLabel: up.ok ? up.storyLabel : null,
        note: up.ok ? '未知时间保持未知（不用「现在」冒充）；表里没有不等于不会发生' : null
      };
    });
  }
  function secChronicleView() {
    return safe(function () {
      if (!WA.chronicleView || typeof WA.chronicleView.stat !== 'function') return { error: 'engines/chronicle-view.js 未加载（编年史视图读数缺席）' };
      const st = WA.chronicleView.stat();
      const cfg = WA.chronicleView.getSettings();
      const co = WA.chronicleView.coverage();
      return {
        enabled: !!cfg.enabled, maxRows: cfg.maxRows,
        reads: st.reads, drills: st.drills, hiddenSeen: st.hiddenSeen,
        refused: st.refused, lastReason: st.lastReason || '', faults: Object.assign({}, st.faults || {}),
        // 覆盖率的**两个旗标**：empty（没数据）与 hiddenCount（有但藏起来了）分开报 ——
        //   合成一个绿点就是本仓反复裁决过的「点了没反应」。
        ok: !!co.ok, reason: co.ok ? null : (co.reason || '?'),
        empty: co.ok ? !!co.empty : null, rows: co.ok ? co.total : null,
        bySource: co.ok ? Object.assign({}, co.bySource || {}) : null,
        hiddenCount: co.ok ? co.hiddenCount : null,
        note: co.ok ? co.note : null
      };
    });
  }
  function secCapacityAudit() {
    return safe(function () {
      if (!WA.capacityAudit || typeof WA.capacityAudit.stat !== 'function') return { error: 'engines/capacity-audit.js 未加载（存储压力读数缺席）' };
      const st = WA.capacityAudit.stat();
      const cfg = WA.capacityAudit.getSettings();
      const wl = WA.capacityAudit.waterline();
      return {
        enabled: !!cfg.enabled, maxRows: cfg.maxRows,
        reads: st.reads, refused: st.refused, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}), bySource: Object.assign({}, st.bySource || {}),
        ok: !!wl.ok, reason: wl.ok ? null : (wl.reason || '?'),
        // 水位只报**摘要**（几满几近满），逐容器全表在面板「容量」段：诊断包体积纪律。
        fullCount: wl.ok ? wl.fullCount : null, nearCount: wl.ok ? wl.nearCount : null,
        totalCaps: wl.ok ? wl.totalCaps : null, rows: wl.ok ? wl.rows.slice(0, 5) : null,
        note: wl.ok ? wl.note : null
      };
    });
  }
  function secPerfBaseline() {
    return safe(function () {
      if (!WA.perfBaseline || typeof WA.perfBaseline.stat !== 'function') return { error: 'engines/perf-baseline.js 未加载（性能基线读数缺席）' };
      const st = WA.perfBaseline.stat();
      const cfg = WA.perfBaseline.getSettings();
      const bd = WA.perfBaseline.bands();
      const bud = WA.perfBaseline.budget();
      const gp = WA.perfBaseline.gap();
      return {
        enabled: !!cfg.enabled,
        reads: st.reads, refused: st.refused, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}), byFace: Object.assign({}, st.byFace || {}),
        band: st.band, frozenAt: st.frozenAt, frozenAvailable: !!st.frozenAvailable,
        bandsOk: !!bd.ok, bandsReason: bd.ok ? null : (bd.reason || '?'),
        current: bd.ok ? bd.current : null,
        currentDetail: bd.ok ? bd.currentDetail : null,
        budgetOk: !!bud.ok, budgetReason: bud.ok ? null : (bud.reason || '?'),
        driftCount: bud.ok ? bud.driftCount : null, budgetRows: bud.ok ? bud.rows.length : null,
        // 实机栏**一律留空**并带必测清单：把估计填进实测栏，下一个读者就再也分不出
        //   「手机上 60ms」与「桌上机估算 60ms」。故这里只报「缺什么」，不报「大概多少」。
        realDevice: gp.reason || null, realDeviceMissing: (gp.missing || []).length,
        note: gp.note || null
      };
    });
  }
  function secWorldHealth() {
    return safe(function () {
      if (!WA.worldHealth || typeof WA.worldHealth.stat !== 'function') return { error: 'engines/world-health.js 未加载（世界健康读数缺席）' };
      const st = WA.worldHealth.stat();
      const cfg = WA.worldHealth.getSettings();
      const sm = WA.worldHealth.summary();
      return {
        enabled: !!cfg.enabled, maxRows: cfg.maxRows, nearRatio: cfg.nearRatio,
        reads: st.reads, drills: st.drills, refused: st.refused, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}), byKind: Object.assign({}, st.byKind || {}),
        ok: !!sm.ok, reason: sm.ok ? null : (sm.reason || '?'),
        // 三栏各带 empty / allClear 两旗标 —— 「没数据」与「有数据但无事」必须可分
        //   （计划原文边界 5；把两者压成一个绿点正是「点了没反应」的另一种写法）。
        headline: sm.ok ? sm.headline : null,
        bars: sm.ok ? ['todo', 'blocked', 'water'].map(function (k) {
          const b = sm.bars[k] || {};
          return { kind: k, count: b.count, empty: !!b.empty, allClear: !!b.allClear,
            skipped: (b.skipped || []).length };
        }) : null,
        note: sm.ok ? '只做聚合与下钻：待办来自各模块自己的 pending()，阻塞来自它们的 stat().faults，水位来自 store.sizeCaps()' : null
      };
    });
  }
  // v2.183.0（第一批 E1）：统一待办事项中心（engines/pending-center.js）。
  //   诊断面的三件事**分别报**，不合成一个绿点：
  //     · 源可用性（八源各在场否 —— 缺席 ≠ 没有事项）
  //     · 三态旗标（unavailable / emptyAll / allClear —— 「读不到」「没数据」「处理完」三件事）
  //     · **可达性证据**（emptyReporterCount / emptyAllReachable）—— 「全空」这一态
  //       在现版本亮不了（八源都没申报 empty），这件事必须可答；否则那是一盏
  //       永远不亮、也没人知道为什么的死灯。
  function secPendingCenter() {
    return safe(function () {
      if (!WA.pendingCenter || typeof WA.pendingCenter.stat !== 'function') return { error: 'engines/pending-center.js 未加载（统一待办读数缺席）' };
      const st = WA.pendingCenter.stat();
      const cfg = WA.pendingCenter.getSettings();
      const rows = WA.pendingCenter.bySource();
      const it = WA.pendingCenter.items({});
      const dg = WA.pendingCenter.diagnose();
      return {
        enabled: !!cfg.enabled, maxRows: cfg.maxRows, soonCount: cfg.soonCount,
        reads: st.reads, refused: st.refused, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}), bySource: Object.assign({}, st.bySource || {}),
        // 逐源在场：缺席的源如实列名（不静默当作「这类事项没有」）
        sourceCount: rows.filter(function (r) { return r.available; }).length,
        sourcesTotal: rows.length,
        absent: rows.filter(function (r) { return !r.available; }).map(function (r) { return r.name; }),
        // 可达性：emptyReported 是「有几个在场源真的申报了 empty」—— 为 0 时 emptyAll 不可达。
        emptyReporterCount: dg.emptyReporterCount, emptyAllReachable: dg.emptyAllReachable,
        ok: !!it.ok, reason: it.ok ? null : (it.reason || '?'),
        // 三旗标**分列**：初版只有 emptyAll / allClear，八源全缺席时 allClear=true
        //   —— 把「读不到」报成「全处理完」。这是本仓反复裁决过的那类误报。
        emptyAll: it.ok ? !!it.emptyAll : null,
        allClear: it.ok ? !!it.allClear : null,
        unavailable: it.ok ? !!it.unavailable : null,
        emptyReported: it.ok ? it.emptyReported : null,
        total: it.ok ? it.total : null, count: it.ok ? it.count : null,
        capped: it.ok ? !!it.capped : null,
        skipped: it.ok ? (it.skipped || []).length : null,
        note: it.ok ? '三态可分：unavailable（读不到）/ emptyAll（有源且全部自报无数据）/ allClear（读过且此刻没有待办）' : null
      };
    });
  }

  // v2.187.0（E4）：场景 / 战役层。诊断面**分列**四件事，不合成一个「进度」绿点：
  //   · 阶段读数（当前阶段 / 总阶段 / 是否已结束）—— 与谓词的现场值并排
  //   · **不可读与未达成分列**（unreadable 计数）—— 「引擎没装」不许读成「还没做到」
  //   · 依赖在场（蓝图 / 外交 / 势力图 / 货运四个谓词源）—— 缺席就是谓词不可读
  //   · 模板来源（来自蓝图真源还是蓝图缺席）—— 缺席时本模块**不兜底**
  function secCampaign() {
    return safe(function () {
      if (!WA.campaign || typeof WA.campaign.stat !== 'function') return { error: 'engines/campaign.js 未加载（战役读数缺席）' };
      const st = WA.campaign.stat();
      const cfg = WA.campaign.getSettings();
      const dg = WA.campaign.diagnose();
      const cur = WA.campaign.current();
      return {
        enabled: !!cfg.enabled, stageCap: cfg.stageCap, logCap: cfg.logCap,
        starts: st.starts || 0, advances: st.advances || 0, finishes: st.finishes || 0,
        refused: st.refused || 0, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}),
        // **不可读与未达成必须分列**（这是本模块最要紧的一条读数）
        unreadable: (st.faults && st.faults.unreadable) || 0,
        notMet: (st.faults && st.faults['not-met']) || 0,
        hasCampaign: !!st.hasCampaign, scene: st.scene || '', stage: st.stage, finished: !!st.finished,
        currentOk: !!cur.ok, currentId: (cur.current && cur.current.id) || null,
        currentReading: (cur.current && cur.current.reading !== undefined) ? cur.current.reading : null,
        predicates: st.predicates || [],
        deps: dg.deps || {},
        templatesOk: !!dg.templatesOk, templateCount: dg.templateCount || 0, templateReason: dg.templateReason || null
      };
    });
  }
  function secAtlas() {
    return safe(function () {
      if (!WA.atlas || typeof WA.atlas.stat !== 'function') return { error: 'engines/atlas.js 未加载（地图读数缺席）' };
      const st = WA.atlas.stat();
      const cfg = WA.atlas.getSettings();
      const dg = WA.atlas.diagnose();
      // **三层分列**（这是本模块最要紧的一条读数）：几何 / 推导边 / 已确立事实 ——
      //   压成一个「关系数」就等于把「算出来的」与「谈成的」混成一件事。
      const rel = WA.atlas.relations();
      const pl = WA.atlas.places();
      const rt = WA.atlas.routes();
      return {
        enabled: !!cfg.enabled, maxPlaces: cfg.maxPlaces, maxEdges: cfg.maxEdges, showFacts: cfg.showFacts !== false,
        reads: st.reads || 0, refused: st.refused || 0, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}),
        placesOk: !!pl.ok, placeCount: pl.ok ? pl.count : 0, placeUnplaced: pl.ok ? pl.unplaced.length : 0,
        zoneUnknown: pl.ok ? pl.zoneUnknown : 0, nearDays: pl.ok ? pl.nearDays : null,
        routesOk: !!rt.ok, roadCount: rt.ok ? rt.count : 0,
        transitCount: rt.ok ? rt.transitCount : 0, routeUnplaced: rt.ok ? rt.unplaced.length : 0,
        derivedCount: rel.derivedCount, derivedReason: rel.derivedReason, derivedTruncated: rel.derivedTruncated,
        factsCount: rel.factsCount, factsReason: rel.factsReason,
        gaps: rel.gaps.length,
        deps: dg.deps || {}
      };
    });
  }
  /**
   * v2.187.0（E8）：依赖体检与迁移助手。
   *   本节的落点是**体检口径本身**，不是某一坨可搬物的结论 —— 故这里逐项报出：
   *     ① 四处版本真源各读得到吗（读不到时总判必然降级，得给出**原因**）；
   *     ② 哪些类目**结构性不可验**（本仓无登记面 ⇒ 对所有可搬物一样，不参与总判）；
   *     ③ 迁移链现状；
   *     ④ 体检台账（四项判定计数 + 拒收归因）。
   *   为什么不在这里跑一次 check()：那要传一份可搬物进来，而**选哪一份**是用户的事 ——
   *   诊断节若挑一份来念，读的人会把「那一份的结论」当成「这个面的结论」。
   */
  function secDepCheck() {
    return safe(function () {
      if (!WA.depCheck || typeof WA.depCheck.diagnose !== 'function') {
        return { error: 'engines/dep-check.js 未加载（依赖体检面缺席）' };
      }
      const dg = WA.depCheck.diagnose();
      const st = WA.depCheck.stat();
      const cfg = WA.depCheck.getSettings();
      const cat = (typeof WA.depCheck.catalog === 'function') ? WA.depCheck.catalog() : null;
      return {
        enabled: !!cfg.enabled, maxDeps: cfg.maxDeps, maxDegrade: cfg.maxDegrade,
        // 版本真源逐项：null 表示**读不到**（不是「版本是 0」）—— 这两件事在读数上必须可分。
        versionSources: dg.versionSources || {},
        missingVersionSource: dg.missingVersionSource || [],
        migrationChain: dg.migrationChain,
        // 体检台账：四种总判各自的次数 + 拒收归因（拒收码逐条可复算）。
        checks: st.checks || 0, prepared: st.prepared || 0,
        blocked: st.blocked || 0, degraded: st.degraded || 0, unknown: st.unknown || 0,
        refused: st.refused || 0, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}),
        kinds: cat ? cat.kinds : [],
        verdicts: cat ? cat.verdicts : [],
        sources: dg.deps || {}
      };
    });
  }
  function secRulePack() {
    return safe(function () {
      if (!WA.rulePack || typeof WA.rulePack.diagnose !== 'function') {
        return { error: 'engines/rule-pack.js 未加载（规则包面缺席）' };
      }
      const dg = WA.rulePack.diagnose();
      const st = WA.rulePack.stat();
      const cfg = WA.rulePack.getSettings();
      const cat = (typeof WA.rulePack.catalog === 'function') ? WA.rulePack.catalog() : null;
      return {
        enabled: !!cfg.enabled, maxPacks: cfg.maxPacks, maxKeys: cfg.maxKeys,
        packs: dg.packs || 0, active: dg.active || '',
        // 可进包的键：**调用期**从 __settingsRegs 现场筛出来的名单（不是写死的一份）。
        //   它空着有两种原因：本侧一个相关模块都没装 / 那些模块都还没登记 —— 两种都要看得见。
        packableCount: dg.packableCount || 0,
        packable: (dg.packable || []).slice(0, 24),
        actionIds: dg.actionIds || [],
        // 词表逐口现场核对：`present:false` = 那一口在这台机器上找不到 —— 声明面空转的入口。
        actionTargets: dg.actionTargets || [],
        actionsResolved: dg.actionsResolved || 0,
        templates: dg.templateCount || 0,
        saves: st.saves || 0, applies: st.applies || 0, drops: st.drops || 0,
        exports: st.exports || 0, imports: st.imports || 0,
        templateRuns: st.templateRuns || 0, templateRefused: st.templateRefused || 0,
        refused: st.refused || 0, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}),
        failPolicies: cat ? cat.failPolicies : [],
        modules: cat ? cat.modules : [],
        // ── v2.203.0（Y8）四栏回带：冲突三类 / 回滚栈形状 / 组合口依赖 / 夹带名单 ──
        //   四项新功能各自依赖一个**可能不在场**的声明面（recipe / presetWorld）。
        //   不回带的后果：“冲突判不了”与“没有冲突”在诊断面上完全同形。
        conflictKinds: dg.conflictKinds || [],
        conflictSources: dg.conflictSources || [],
        rollback: dg.rollback || null, rollbackCap: (cat && cat.rollbackCap) || 0,
        composeDeps: dg.composeDeps || {},
        worldFactNames: (cat && cat.worldFactNames) || dg.worldFactNames || [],
        historyDepth: st.historyDepth || 0, conflictKindCount: st.conflictKinds || 0,
        sources: dg.deps || {}
      };
    });
  }
  /** v2.227.0(拓展 N9):三项目剧情事件闭环读数(只读)。 */
  function secStoryLoop() {
    const sl = WA.storyLoop;
    if (!sl || typeof sl.audit !== 'function') return { ok: false, reason: 'module-missing' };
    let a = null, cs = null, st = null;
    try { a = sl.audit(); } catch (e) { a = { verdict: 'threw', reasons: [String(e && e.message || e)] }; }
    try { cs = sl.contracts(); } catch (e) { cs = null; }
    try { st = sl.stat(); } catch (e) { st = null; }
    return { ok: true,
      verdict: a.verdict, reasons: (a.reasons || []).slice(),
      matchedCount: a.matchedCount, edgeTotal: a.edgeTotal,
      ops: a.ops, linked: a.linked, unlinked: a.unlinked, closedLoops: a.closedLoops, dangling: a.dangling,
      guardCounts: a.guardCounts, clock: a.clock,
      edges: (cs && cs.edges ? cs.edges.map(function (e) {
        return { edge: e.edge, present: e.present, version: e.version, expect: e.expect, matched: e.matched, why: e.why };
      }) : []),
      confirms: (st && st.confirms) || 0, refusals: (st && st.refusals) || 0, traced: (st && st.traced) || 0 };
  }
  function secWorldLab() {
    return safe(function () {
      if (!WA.worldLab || typeof WA.worldLab.diagnose !== 'function') {
        return { error: 'engines/world-lab.js 未加载（世界实验室缺席）' };
      }
      const dg = WA.worldLab.diagnose();
      const st = WA.worldLab.stat();
      const cfg = WA.worldLab.getSettings();
      const cat = (typeof WA.worldLab.catalog === 'function') ? WA.worldLab.catalog() : null;
      return {
        enabled: !!cfg.enabled, maxSteps: cfg.maxSteps,
        hasLab: !!dg.hasLab, labId: dg.labId || '', labAt: dg.labAt || 0,
        // 过期与「live 有没有被实验改到」两栏分开报：前者答「这份读数还算不算数」，
        //   后者答「这次观测有没有动到被观测的世界」—— 合成一个绿点就两件事都说不清了。
        stale: dg.stale === true, staleReason: dg.staleReason || '',
        liveUnchanged: (dg.liveUnchanged === null || dg.liveUnchanged === undefined) ? null : dg.liveUnchanged,
        arms: dg.arms || [],
        // 动作词表**逐字取自 rehearsal**（本模块不自带副本）：null 表示读不到，不是空词表。
        kinds: cat ? cat.kinds : null,
        kindSource: cat ? cat.kindSource : '',
        rows: cat ? (cat.rows || []).map(function (r) { return r.key; }) : [],
        runs: st.runs || 0, armRuns: st.arms || 0, discarded: st.discarded || 0,
        exports: st.exports || 0, staleReads: st.staleReads || 0,
        refused: st.refused || 0, lastReason: st.lastReason || '',
        faults: Object.assign({}, st.faults || {}),
        unknowns: dg.unknowns || [],
        // ── v2.203.0（Y9）仿真面回带：沙盒推进 / 报告 / 采纳 / 拍引擎联动 ──
        //   四功能各自的门写在 deps 里（causalTick / commitChain /
        //   beatLedgerView）—— 它们缺席时各自报各的码，而不是合成一个「不许」。
        sim: Object.assign({}, dg.y9 || {}),
        simRows: st.simRows || 0, hasReport: !!st.hasReport, writesSingle: st.writesSingle || '',
        // ── v2.223.0(N7)适配器面回带:逐类隔离判定 + 上次多引擎推进的零写读数 ──
        //   两栏都直接取自引擎(dg 面),本层**不**重算 —— 重算就是把判据复制成两份。
        adapters: dg.adapters || [],
        adaptersSupported: dg.adaptersSupported || [],
        adaptersUnsupported: dg.adaptersUnsupported || [],
        adaptersScope: dg.adaptersScope || '',
        advance: dg.advance || null,
        adapterProbes: st.adapterProbes || 0, advances: st.advances || 0,
        sources: dg.deps || {}
      };
    });
  }
  function secLife() {
    return safe(function () {
      if (!WA.life || typeof WA.life.stat !== 'function') return { error: 'life 模块不可用' };
      const st = WA.life.stat();
      const cfg = WA.life.getSettings ? WA.life.getSettings() : {};
      return {
        enabled: !!cfg.enabled, maxPeople: cfg.maxPeople, maxItems: cfg.maxItems,
        ticks: st.ticks || 0, changed: st.changed || 0, blocked: st.blocked || 0,
        lastReason: st.lastReason || '', lastAt: st.lastAt || 0,
        // v2.132.0（O19）：游标三口读数进诊断面。
        //   为什么必须报：这是一个**只可观测才能判得清对错**的量 ——
        //   「跨会话延续了吗」在面板与诊断里此前都是空白，于是「延续」与「每次都从 0 开始」
        //   两件事长得一模一样（本仓的老病：账在进程里、答案在世界外）。
        lastTurn: isFinite(Number(st.lastTurn)) ? Number(st.lastTurn) : 0,
        turnRestored: st.turnRestored === true,
        crossSession: cfg.crossSession === true,
        // v2.139.0（E8）：二阶公平读数进诊断面。三个字段各自答一个问题，**不可合并**：
        //   sd        —— 「最近 10 轮里大家被推演的频率差多少」（null = 样本不足，还没法判）；
        //   fair      —— 「按同一处阈值判下来公平吗」（null 同上，**不拿 false 冒充**）；
        //   throws    —— 「加权随机有没有在背后静默降级回环形定序」（> 0 即机制没在跑）。
        //   少了 throws 这一口，「公平」会变成一个**永远为真**的读数（退回环形也照样公平）。
        fairnessSd: (st.fairness && st.fairness.sd !== null && isFinite(Number(st.fairness.sd))) ? Number(st.fairness.sd) : null,
        fairnessFair: (st.fairness && st.fairness.fair === true) ? true : (st.fairness && st.fairness.fair === false ? false : null),
        fairnessThrows: (st.fairness && isFinite(Number(st.fairness.throws))) ? Number(st.fairness.throws) : 0,
        fairRounds: isFinite(Number(st.fairRounds)) ? Number(st.fairRounds) : 0,
actions: WA.life.ACTIONS || [], commitments: WA.life.COMMITMENTS || []
      };
    });
  }

  // ── 3. 模块装载完整性（文件 ↔ 导出对象） ──
  /**
   * v2.62.0：因果结算采集节。
   *   报出的重点不是「有几条链」，而是**「为什么没发生」的三个出口各有多少**：
   *     · cancelled  —— 有人主动叫停；
   *     · expired    —— 前提消失导致自动失效；
   *     · blocked    —— 被拒（原因不存在 / 参数不全 / 已终态）。
   *   这三者此前在世界状态里长得一模一样（都表现为「链没了」），本节的全部意义
   *   就是让它们**分得开**——「悄悄消失的旧计划」是本仓库最贵的一类静默失败。
   */
  // v2.117.0（计划二 B6）：机会面——「此刻有几个可参与的窗口 / 都由什么变化产生」。
  //   纯读：collect 是不登记的发现在册（不写盘），statView 只读在途行。
  //   此处**刻意不调 sweep**：诊断必须零副作用，而扫描会改阶段、会挤出、会写 stat。
  //   三档如实：模块缺席报不可用，不回落成「没有机会」（那正是本模块要治的病）。
  function secOpportunity() {
    return safe(function () {
      if (!WA.opportunity || typeof WA.opportunity.statView !== 'function') return { error: 'opportunity 模块不可用' };
      const v = WA.opportunity.statView();
      const cfg = WA.opportunity.getSettings ? WA.opportunity.getSettings() : {};
      let found = null;
      try { found = WA.opportunity.collect ? WA.opportunity.collect().length : null; } catch (e) { found = null; }
      return { enabled: !!cfg.enabled, maxOpen: cfg.maxOpen, defaultWindowMs: cfg.defaultWindowMs,
        total: v.total, active: v.active, open: v.open, taken: v.taken, declined: v.declined,
        deferred: v.deferred, lapsed: v.lapsed, sweeps: v.sweeps, formed: v.formed,
        candidates: found, lapses: v.lapses, reopens: v.reopens, refused: v.refused,
        lastReason: v.lastReason, sources: (WA.opportunity.SOURCES || []).slice(), faults: v.faults };
    });
  }
  // v2.117.0（计划二 B6）：配方面——「这一局按哪张配方跑 / 静态核对有没有漂移」。
  //   三项漂移（动作词汇不在 act.KINDS / 题材不在 theme.THEMES / 政策不在封闭集合）
  //   与两处声明面（basicsStale：基础事实的代码锚点；themeClash：题材叠加冲突）逐项带出。
  //   `basicsStale`（确凿落空）与 `basicsUnverified`（未核）**分列两个字段**——
  //   不把「没核对过」与「核对落空」印成同一个词，两者也都不等于「核对通过」。
  function secRecipe() {
    return safe(function () {
      if (!WA.recipe || typeof WA.recipe.statView !== 'function') return { error: 'recipe 模块不可用' };
      const v = WA.recipe.statView();
      const cat = (WA.recipe.catalogView ? WA.recipe.catalogView() : null);
      return { name: v.name, known: (v.known || []).slice(), policyCount: v.policyCount,
        staleness: v.staleness, basicsStale: (v.basicsStale || []).slice(),
        basicsUnverified: (v.basicsUnverified || []).slice(),
        recipes: cat ? cat.recipes.length : 0,
        themeClash: cat ? cat.themeClash.map(function (c) { return c.id; }) : [],
        previews: v.previews, applies: v.applies, rejects: v.rejects, seeds: v.seeds,
        lastReason: v.lastReason, faults: v.faults };
    });
  }
  /**
   * v2.231.0（优化 OPT-8）：**世界词汇面**读数 —— 这一局用哪些词。
   *
   *   它治的缺口（现场复核）：`economy` 的货币是写死的 `银元`、配方是写死的两行，
   *   `fate` 的属性白名单是写死的六项 —— 于是现代校园、历史、仙侠或科幻局都被
   *   底层固定词汇拉回同一种游戏，而**诊断面此前完全看不到这件事**（面板上也看不到）。
   *   本节的四组读数各自回答一问：
   *     · `theme`      题材目录里哪些是扩展的（真源是 theme.THEMES，不是别处另存一份）；
   *     · `economy`    货币名 / 可选配方 / 声明价目 / 基准价查询（真源是 recipe 的配方声明）；
   *     · `judge`      判定维度四态（沿用旧白名单 / 用声明的维度 / 已关闭 / 声明写坏了）；
   *     · `satisfied`  逐张配方的**前置自洽**核对（题材在真源里 / 行动词汇在 act.KINDS 里 /
   *                    经济面自洽 / 判定面自洽）—— 「我声明了」不等于「它真在那儿」。
   *
   *   本节**只读**：不写设置、不改世界、不落存档（与 v2.153.0 对张力取 `push:false` 同规）。
   *   缺一个模块就如实报 `absent`，**不回落成「没声明」** —— 那是两种事实。
   */
  function secWorldLexicon() {
    return safe(function () {
      const R = WA.recipe, E = WA.economy, Ft = WA.fate, Th = WA.theme;
      const name = (R && typeof R.statView === 'function') ? (R.statView().name || '') : '';
      const themes = (WA.recipe && typeof WA.recipe.themeCatalog === 'function')
        ? (function () { const t = WA.recipe.themeCatalog(); return t ? Object.keys(t).sort() : null; })() : null;
      const ext = (WA.recipe && typeof WA.recipe.extendedThemes === 'function')
        ? (function () { const e = WA.recipe.extendedThemes(); return e ? Object.keys(e).sort() : null; })() : null;
      // ⚠ 全限定名（同 economy.spec 的纪律）：引用面只认 `WA.ns.mem`。
      const eco = (WA.recipe && typeof WA.recipe.economySpec === 'function' && name)
        ? (function () { try { return WA.recipe.economySpec(name); } catch (e) { return { ok: false, reason: 'threw' }; } })() : null;
      const judge = (WA.fate && typeof WA.fate.judgeView === 'function')
        ? (function () { try { return WA.fate.judgeView(); } catch (e) { return { error: 'threw' }; } })() : { error: 'fate 未加载（判定面读数缺席）' };
      // economy 侧的**读取面**（它才是执行器真正消费的那一层）：声明缺席时它回落到旧常量。
      const money = (WA.economy && typeof WA.economy.money === 'function') ? (function () { try { return WA.economy.money(); } catch (e) { return null; } })() : null;
      const recipes = (WA.economy && typeof WA.economy.recipeKeys === 'function') ? (function () { try { return WA.economy.recipeKeys(); } catch (e) { return null; } })() : null;
      const es = (WA.economy && typeof WA.economy.economySpec === 'function') ? (function () { try { return WA.economy.economySpec(); } catch (e) { return null; } })() : null;
      // 基准价查询：拿第一件声明货做样本，证明「表内价真的查得到」（不拿一个 0 冒充）。
      const sample = (es && es.goods) ? Object.keys(es.goods)[0] : '';
      const base = (WA.economy && typeof WA.economy.declaredBase === 'function' && sample)
        ? (function () { try { return WA.economy.declaredBase(sample); } catch (e) { return null; } })() : null;
      const recOf = (WA.economy && typeof WA.economy.recipeOf === 'function' && recipes && recipes.length)
        ? (function () { try { return WA.economy.recipeOf(recipes[0]) ? recipes[0] : null; } catch (e) { return null; } })() : null;
      // 逐张配方的前置自洽（三列分列：missing 真缺陷 / unknown 核不了 / fallback 未声明沿用旧常量）
      const sat = (WA.recipe && typeof WA.recipe.satisfied === 'function' && WA.recipe.list)
        ? WA.recipe.list().map(function (r) {
          const s = (function () { try { return WA.recipe.satisfied(r.key); } catch (e) { return { ok: false, reason: 'threw' }; } })();
          return { name: r.key, cn: r.cn, ok: !!s.ok, satisfied: !!s.satisfied,
            missing: (s.missing || []).map(function (x) { return x.kind + ':' + x.id; }),
            unknown: (s.unknown || []).map(function (x) { return x.kind + ':' + x.id; }),
            fallback: (s.fallback || []).map(function (x) { return x.kind; }) };
        }) : null;
      return {
        // 当前生效的配方名（留空 = 未生效，如实报空串而不是「默认」）
        recipe: name,
        // v2.258.0（OPV6-3）：题材节点现在也报**引擎面**——题材不再只改模块顺序，
        //   它真开机制。这里报「本题材要开几个、此刻真在跑几个、有几个无注入面」，
        //   并如实带出判据来源（capabilityTier 在场 / 降级 fallback），
        //   否则「题材没生效」与「题材没装」在读数上长得一样。
        theme: { source: Th ? 'theme.THEMES（单一真源）' : 'theme 未加载', count: themes ? themes.length : null,
          keys: themes, extended: ext,
          // 引擎面（只读；缺 theme 时如实 null，不回落成「零个」）
          engines: (Th && typeof Th.engineFace === 'function')
            ? (function () { try { const f = Th.engineFace(); return { want: f.want.length, running: f.running.length,
              granted: f.granted.length, gap: f.gap, notInjected: f.notInjected.slice(), via: f.via }; } catch (e) { return { error: 'threw' }; } })()
            : null,
          note: Th ? null : 'theme 未加载 ⇒ 题材目录核不了（不假装「题材都不在」）' },
        economy: { source: (es && es.source) || (E ? 'default（旧常量）' : 'economy 未加载'),
          declared: !!es, money: money, recipes: recipes, goods: es ? Object.keys(es.goods || {}).sort() : null,
          sample: sample || null, sampleBase: base, firstRecipe: recOf,
          note: !E ? 'economy 未加载（读取面缺席）'
            : (es ? null : '这一局未声明经济面 ⇒ 执行器沿用旧常量（银元 / 面包·铁器两行配方）；旧档余额不被换算') },
        judge: judge,
        satisfied: sat,
        satisfiedSummary: sat ? {
          total: sat.length,
          pass: sat.filter(function (x) { return x.satisfied; }).length,
          missing: sat.filter(function (x) { return x.missing.length; }).map(function (x) { return x.name + '×' + x.missing.length; }),
          unknown: sat.filter(function (x) { return x.unknown.length; }).map(function (x) { return x.name + '×' + x.unknown.length; }),
          fallback: sat.filter(function (x) { return x.fallback.length; }).map(function (x) { return x.name + '×' + x.fallback.length; })
        } : null,
        note: '只读：本节不写设置、不改世界、不落存档（打开诊断不该改变世界）'
      };
    }, {});
  }
  /**
   * v2.231.0（拓展 EXP-1）：能力成长面读数 —— 「这个人已经会了什么、练到哪一步」。
   *
   *   为什么单列一节而不并进 life / plan 节：那两节答「他打算做什么」（目标与行动），
   *   本节答「他已经会了什么」（能力的掌握程度）—— 两问的失效模式不同：
   *   前者失效在「打算了没做」，后者失效在「做了却不长本事」。
   *
   *   本节**只读**：不写设置、不改世界、不落存档（与 secWorldLexicon 同规）。
   *   三态分开：模块缺席 / 关着 / 开着（「没练过」与「这一面被关掉了」必须分得开）。
   */
  function secTraining() {
    return safe(function () {
      const T = WA.training;
      if (!T || typeof T.view !== 'function') return { error: 'engines/training.js 未加载（能力成长读数缺席）' };
      const v = T.view();
      return {
        enabled: v.enabled, modes: (v.modes || []).slice(),
        caps: { maxAbilities: v.maxAbilities, maxRows: v.maxRows, pointsCap: v.pointsCap },
        abilities: (v.abilities || []).map(function (a) {
          return { name: a.name, mode: a.mode, prereq: a.prereq, prereqStage: a.prereqStage, stages: a.stages };
        }),
        progress: (v.progress || []).map(function (r) {
          return { who: r.who, ability: r.ability, mode: r.mode, points: r.points, stage: r.stage,
            stageName: r.stageName, sessions: r.sessions, cancelled: r.cancelled };
        }),
        counts: v.counts,
        declares: v.stat.declares, practices: v.stat.practices, cancelled: v.stat.cancelled,
        applies: v.stat.applies, blocked: v.stat.blocked, lastReason: v.stat.lastReason, faults: v.stat.faults,
        note: v.enabled ? null : '能力成长关着（不记也不判）—— 这与「还没练过」不是一回事'
      };
    }, {});
  }
  /**
   * v2.231.0（拓展 EXP-2）：唯一物件面读数 —— 「这一件在谁手上、还能用几次」。
   *
   *   为什么单列一节而不并进 economy 节：economy 那节答「**堆叠资源**的价与量」
   *   （「铁锤 ×2」在那里是同一个键的两个单位，两件分不开）；本节答「**唯一物件**的
   *   身份、持有人与损耗」—— 两问的失效模式不同：前者失效在「没库存」，
   *   后者失效在「两件分不开 / 借出去还能用」。
   *
   *   本节**只读**：不写设置、不改世界、不落存档。
   */
  function secGear() {
    return safe(function () {
      const G = WA.gear;
      if (!G || typeof G.view !== 'function') return { error: 'engines/gear.js 未加载（唯一物件读数缺席）' };
      const v = G.view();
      return {
        enabled: v.enabled, carries: (v.carries || []).slice(),
        caps: { maxItems: v.maxItems, maxSlots: v.maxSlots, maxDurability: v.maxDurability },
        slots: (v.slots || []).map(function (s) { return s.name; }),
        items: (v.items || []).map(function (x) {
          return { id: x.id, name: x.name, holder: x.holder, carry: x.carry, slot: x.slot,
            uses: x.uses, durability: x.durability, maxDurability: x.maxDurability, repairs: x.repairs };
        }),
        counts: v.counts,
        made: v.stat.made, used: v.stat.used, lent: v.stat.lent, repaired: v.stat.repaired,
        equipped: v.stat.equipped, blocked: v.stat.blocked, lastReason: v.stat.lastReason, faults: v.stat.faults,
        note: v.enabled ? null : '唯一物件关着（不记也不判）—— 这与「还没有物件」不是一回事'
      };
    }, {});
  }
  /**
   * v2.231.0（拓展 EXP-3）：持续生产面读数 —— 「这张单在产什么、走到第几天、占着哪个工位」。
   *
   *   为什么单列一节而不并进 economy 节：economy 那节答「**即时生产**做成了什么」
   *   （一笔事务里扣料出货，答不出「这炉要烧两天、今天只烧了一天」）；本节答「**正在生产**
   *   这件事本身」—— 工单跨日、缺料暂停、班次占用、设施容量、完工只入库一次。
   *   两问的失效模式不同：前者失效在「没料/没货」，后者失效在「工期被静默吞掉 / 同一人
   *   同时在两个工位 / 交一次货入两次库」。
   *
   *   本节**只读**：不写设置、不改世界、不落存档（与 secGear / secTraining 同规）。
   *   三态分开：模块缺席 / 关着 / 开着（「还没开过单」与「这一面被关掉了」必须分得开）。
   */
  function secProduction() {
    return safe(function () {
      const P = WA.production;
      if (!P || typeof P.view !== 'function') return { error: 'engines/production.js 未加载（持续生产读数缺席）' };
      const v = P.view();
      return {
        enabled: v.enabled, statuses: (v.statuses || []).slice(), openStatus: (v.openStatus || []).slice(),
        caps: { maxJobs: v.maxJobs, maxFacilities: v.maxFacilities, maxCrew: v.maxCrew, maxDays: v.maxDays },
        facilities: (v.facilities || []).map(function (f) {
          return { name: f.name, label: f.label, slots: f.slots, used: f.used };
        }),
        jobs: (v.jobs || []).map(function (j) {
          return { id: j.id, recipe: j.recipe, qty: j.qty, days: j.days, done: j.done, status: j.status,
            facility: j.facility, place: j.place, by: j.by,
            crew: (j.crew || []).map(function (c) { return { who: c.who, shift: c.shift }; }),
            reserve: Object.assign({}, j.reserve || {}), pausedReason: j.pausedReason || '',
            delivered: Object.assign({}, j.delivered || {}) };
        }),
        counts: v.counts,
        opened: v.stat.opened, staffed: v.stat.staffed, resupplied: v.stat.resupplied,
        advanced: v.stat.advanced, paused: v.stat.paused, resumed: v.stat.resumed,
        delivered: v.stat.delivered, cancelled: v.stat.cancelled,
        blocked: v.stat.blocked, lastReason: v.stat.lastReason, faults: v.stat.faults,
        note: v.enabled ? null : '持续生产关着（不记也不判）—— 这与「还没开过工单」不是一回事'
      };
    }, {});
  }
  /**
   * v2.231.0（拓展 EXP-4）：探索与地理发现面读数 —— 「谁知道了哪些地方、还有多少没发现」。
   *
   *   为什么单列一节而不并进 world 节：world 那节答「**世界有什么**」（客观地图：
   *   地点 / 道路 / 日程 / 在途），本节答「**谁知道**」—— 同一张地图，逐人认知分档。
   *   两问的失效模式不同：前者失效在「地点没登记、道路走不通」，后者失效在
   *   「未发现的地名从注入或标签提前泄露 / 听说被当成亲历 / 亲历者被写成路痴」。
   *
   *   本节**只读**：不写设置、不改世界、不落存档（与 secProduction / secGear 同规）。
   *   三态分开：模块缺席 / 关着 / 开着（「还没勘察过」与「这一面被关掉了」必须分得开）。
   *   ⚠ 未发现的地点**只报条数不列名**（与 fog() 同口径：带了名字就等于没遮）。
   */
  function secSurvey() {
    return safe(function () {
      const S = WA.survey;
      if (!S || typeof S.view !== 'function') return { error: 'engines/survey.js 未加载（探索与地理发现读数缺席）' };
      const v = S.view();
      return {
        enabled: v.enabled, knows: (v.knows || []).slice(), statuses: (v.statuses || []).slice(),
        openStatus: (v.openStatus || []).slice(),
        caps: { maxSpots: v.maxSpots, maxViews: v.maxViews, maxDays: v.maxDays },
        spots: (v.spots || []).map(function (s) {
          return { name: s.name, label: s.label, kind: s.kind, place: s.place, days: s.days };
        }),
        scouts: (v.scouts || []).map(function (s) {
          return { id: s.id, who: s.who, from: s.from, to: s.to, spot: s.spot, days: s.days,
            done: s.done, status: s.status, supply: s.supply, spent: Object.assign({}, s.spent || {}),
            pausedReason: s.pausedReason || '' };
        }),
        counts: v.counts,
        declared: v.stat.declared, surveyed: v.stat.surveyed, advanced: v.stat.advanced,
        arrived: v.stat.arrived, paused: v.stat.paused, resumed: v.stat.resumed,
        reported: v.stat.reported, confirmed: v.stat.confirmed, halted: v.stat.halted,
        blocked: v.stat.blocked, lastReason: v.stat.lastReason, faults: v.stat.faults,
        note: v.enabled ? null : '探索与地理发现关着（不记也不判）—— 这与「还没勘察过」不是一回事'
      };
    }, {});
  }
  /**
   * v2.231.0（拓展 EXP-5）：对抗场景面（多轮多阶段 / 对抗检定 / 部分成功 / 代价成功 / 撤退）。
   *
   *   与 fate 节分列的失效模式不同：fate 失效在「掷不出来 / DC 解析不了」，
   *   本节失效在「一次判定被当成一场对抗 / 部分成功没代价 / 撤退把代价吞了 /
   *   已判定的结果被重掷」。
   *
   *   本节**只读**：不写设置、不改世界、不落存档（与 secSurvey / secProduction 同规）。
   *   三态分开：模块缺席 / 关着 / 开着（「还没开过场」与「这一面被关掉了」必须分得开）。
   */
  function secContest() {
    return safe(function () {
      const C = WA.contest;
      if (!C || typeof C.view !== 'function') return { error: 'engines/contest.js 未加载（对抗场景读数缺席）' };
      const v = C.view();
      return {
        enabled: v.enabled, kinds: (v.kinds || []).slice(), statuses: (v.statuses || []).slice(),
        outcomes: (v.outcomes || []).slice(), partialBand: v.partialBand,
        caps: { maxScenes: v.maxScenes, maxStages: v.maxStages, maxRounds: v.maxRounds, maxRolls: v.maxRolls },
        scenes: (v.scenes || []).map(function (s) {
          return { id: s.id, kind: s.kind, title: s.title, sides: (s.sides || []).slice(),
            status: s.status, outcome: s.outcome, winner: s.winner,
            round: s.round, rounds: s.rounds, stages: s.stages,
            advantage: Object.assign({}, s.advantage || {}),
            cost: Object.assign({}, s.cost || {}) };
        }),
        counts: v.counts,
        opened: v.stat.opened, staged: v.stat.staged, resolved: v.stat.resolved,
        spent: v.stat.spent, advanced: v.stat.advanced, withdrawn: v.stat.withdrawn,
        closed: v.stat.closed, blocked: v.stat.blocked, lastReason: v.stat.lastReason,
        faults: v.stat.faults,
        note: v.enabled ? null : '对抗场景关着（不记也不判）—— 这与「还没开过场」不是一回事'
      };
    }, {});
  }
  // v2.231.0（拓展 EXP-6）：案件裁决与处罚执行 —— 与 warrant 分列。
  //   那一节答「谁在通缉名单上」（记录）；本节答「这桩指控走到哪一段、判了什么、罚了没有」。
  //   三态分开：只读（view / list / verdictOf / penalties），零写入、零副作用。
  function secRuling() {
    const R = WA.ruling;
    if (!R || typeof R.view !== 'function') return { error: 'engines/ruling.js 未加载（案件裁决读数缺席）' };
    const v = R.view();
    const cases = R.list().map(function (c) {
      const vs = R.verdictOf(c.id) || {};
      return { id: c.id, accused: c.accused, charge: c.charge, place: c.place,
        jurisdiction: c.jurisdiction, status: c.status, verdict: c.verdict,
        exhibits: c.exhibits, solid: c.solid, seq: vs.seq || 0, ruledBy: vs.ruledBy || '' };
    });
    const pens = [];
    cases.forEach(function (c) {
      R.penalties(c.id).forEach(function (p) { pens.push(Object.assign({ case: c.id }, p)); });
    });
    return { enabled: v.enabled, statuses: v.statuses, verdicts: v.verdicts,
      penaltyKinds: v.penaltyKinds, exhibitKinds: v.exhibitKinds, parties: v.parties,
      minGrounds: v.minGrounds, jurisdictions: v.jurisdictions, currency: v.currency,
      counts: { cases: v.cases, exhibits: v.exhibits, rulings: v.rulings, penalties: v.penalties },
      cases: cases, penalties: pens,
      stat: R.stat() };
  }

  // v2.231.0（拓展 EXP-7）：公共活动 —— 与 agenda 分列。
  //   那一节是**只读聚合器**（把别人的排期汇成一张表）；本节答的是「活动自己」：
  //   谁报了名（三权限）、名额还剩几个、开到第几轮、谁缺席、奖发给谁、延了几次。
  //   三态分开：只读（list / activityOf / signups / rounds / awards），零写入。
  function secActivity() {
    const A = WA.activity;
    if (!A || typeof A.list !== 'function') return { error: 'engines/activity.js 未加载（公共活动读数缺席）' };
    const cfg = A.getSettings();
    const v = A.list();
    const rows = v.rows.map(function (a) {
      const sg = A.signups(a.id);
      const rd = A.rounds(a.id);
      const aw = A.awards(a.id);
      const last = rd.length ? rd[rd.length - 1] : null;
      return { id: a.id, title: a.title, place: a.place, kind: a.kind, day: a.day,
        status: a.status, resumeStatus: a.resumeStatus, quota: a.quota, rounds: a.rounds,
        contenders: a.contenders, hosts: a.hosts, audience: a.audience,
        roundsDone: a.roundsDone, postponeCount: a.postponeCount, awards: a.awards,
        absentLast: last ? last.absent.slice() : [],
        signups: sg.map(function (s) { return { who: s.who, role: s.role, present: s.present }; }),
        prizes: aw.map(function (x) { return { who: x.who, material: x.material, amount: x.amount }; }) };
    });
    return { enabled: cfg.enabled, statuses: A.STATUS.slice(), roles: A.ROLES.slice(),
      quotaRule: '名额只对 contestant 生效（主持/观众不计名额）；0 表示不限',
      counts: { activities: v.rows.length,
        signups: v.rows.reduce(function (n, a) { return n + a.contenders + a.hosts + a.audience; }, 0),
        rounds: v.rows.reduce(function (n, a) { return n + a.roundsDone; }, 0),
        awards: v.rows.reduce(function (n, a) { return n + a.awards; }, 0) },
      activities: rows, stat: A.stat(),
      note: v.enabled ? null : '公共活动关着（不排期也不结算）—— 这与「还没办过活动」不是一回事' };
  }

  function secCausal() {
    return safe(function () {
      if (!WA.causal || typeof WA.causal.stat !== 'function') return { error: 'causal 模块不可用' };
      const st = WA.causal.stat();
      const cfg = WA.causal.getSettings ? WA.causal.getSettings() : {};
      const chains = (function () {
        try { const c = (WA.store.get().causal || {}).chains || []; return c.length; } catch (e) { return 0; }
      })();
      const settledRows = (function () {
        try { const c = (WA.store.get().causal || {}).settled || []; return c.length; } catch (e) { return 0; }
      })();
      const due = (WA.causal.due ? WA.causal.due().length : 0);
      // v2.87.0 B6：当前状态与累计分列。stateView 只读存档（现在怎么样），
      //   st 是本次进程累计（发生过几次）—— 两份读数都报，但**不混在同一个键里**。
      const now = (WA.causal.stateView ? WA.causal.stateView() : null);
      // v2.89.0 O2：回放证据段。诊断侧只能读、不能回放（replay 要重跑代码，而诊断必须零副作用），
      //   故这里报的是两件只读的事实：① 磁带在不在、有多少格、有没有未命中；
      //   ② 用 verifyTape 从种子重算的逐值复核结论（纯算术，不跑产品代码）。
      //   `ev.replayable` 与 `ev.reproducible` 分列，理由见 causal.evidence 注释：
      //   把「种子是显式定的」当成「这一轮能重放」是本版要消灭的那类失实。
      const ev = (WA.causal.evidence ? WA.causal.evidence() : null);
      const tape = (function () {
        try {
          const t = WA.rand && WA.rand.tape ? WA.rand.tape() : null;
          if (!t) return null;
          const last = (st.lastTape && st.lastTape.ok) ? st.lastTape.tape : null;
          const vf = (last && WA.rand.verifyTape) ? WA.rand.verifyTape(last) : null;
          return { mode: t.mode, open: t.open, entries: t.entries, values: t.values,
            seed: t.seed, seedMatched: t.seedMatched, miss: t.miss, lastMiss: t.lastMiss,
            channels: t.channels, verify: vf };
        } catch (e) { return { error: String((e && e.message) || e) }; }
      })();
      const replay = ev ? {
        replayable: ev.replayable, blockedBy: ev.replayBlockedBy,
        records: ev.records, replays: ev.replays, recordFails: ev.recordFails,
        tapeMode: ev.tape ? ev.tape.mode : null
      } : null;
      // v2.97.0 O10：语义坐标面（第四十四面）。两句必须**分开念**：
      //   · coord     —— 当前标记（无人标记时 round 为 null，照实说不，不编一个轮次）；
      //   · coordGaps —— 无坐标的格数。0 时可以指着「第几轮第几步」，>0 时只能说「第几格」。
      //   两句合成一句（例如拿 0 冒充「没有坐标」）会让复核结论的定位粒度变成假话。
      //   这里是**直读现场**（与上面直读 tape / verifyTape 同规格）：诊断的职责是自己去看，
      //   而不是转发另一个模块的摘要——转发会让「诊断看到的」与「模块报的」之间多一层信任假设。
      const coordFace = (function () {
        try { return (WA.rand && WA.rand.coordOf) ? WA.rand.coordOf() : null; } catch (e) { return null; }
      })();
      const coordGaps = (ev && ev.coordGaps) ? ev.coordGaps : null;
      return { enabled: !!cfg.enabled, maxChains: cfg.maxChains, maxItems: cfg.maxItems,
        replay: replay, tape: tape, coord: coordFace, coordGaps: coordGaps,
        chains: chains, settledRows: settledRows, now: now, adds: st.chains || 0, acts: st.acts || 0,
        deferred: st.deferred || 0, cancelled: st.cancelled || 0, expired: st.expired || 0,
        blocked: st.blocked || 0, dueNow: due, lastReason: st.lastReason || '',
        // v2.146.0（F2/W3）：后果涟漪网 + 多结局预演（只读推导，零副作用——诊断只读不改）。
        ripple: (WA.causal.rippleWeb ? WA.causal.rippleWeb() : null),
        endings: (WA.causal.endingsTree ? WA.causal.endingsTree() : null),
        trace: (WA.causal.traceGraph ? WA.causal.traceGraph('') : null),
        stages: WA.causal.STAGES || [], terminal: WA.causal.TERMINAL || [] };
    });
  }

  // v2.121.0 P1：审计事实面（取证三件套的第三件）。诊断侧只读，且**只调纯读口**：
  //   · exportVol() —— 纯读导出当前环（不挤出、不清环、不改计数）。诊断侧拿它当「此刻环里
  //     有什么」的直接读数，与上面直读 tape / verifyTape 同规格（自己去看，不转发摘要）。
  //   · 为什么不在这里调 verifyVolWith —— 核对的对象是**外来卷**，而诊断现场没有外来卷；
  //     本机那一份在 localStorage（走 restore 读回），且 restore 明确「不并进环」。把自己
  //     刚导出的卷再核一遍只会答「自洽」——那是废话，不是证据（同 v2.98.0 对磁带两口的判断）。
  function secAudit() {
    return safe(function () {
      if (!WA.auditLog || typeof WA.auditLog.stat !== 'function') return { error: 'auditLog 模块不可用' };
      const st = WA.auditLog.stat();
      const vol = (typeof WA.auditLog.exportVol === 'function') ? WA.auditLog.exportVol() : null;
      return {
        records: st.records, inRing: st.inRing, cap: st.cap,
        dropped: st.dropped, unknowns: st.unknowns, badAction: st.badAction, truncated: st.truncated,
        // 落盘面（v2.112.0）：flush / restore 的读数——「本机存过什么」那一路
        flushes: st.flushes, persisted: st.persisted, flushFailed: st.flushFailed,
        restored: st.restored, restoreFailed: st.restoreFailed, lost: st.lost, lineageResets: st.lineageResets,
        // v2.121.0：卷面读数（照实带出；导不出就 null，不编一个空卷出来）
        vol: (vol && vol.ok) ? { format: vol.format, formatVersion: vol.formatVersion,
          entries: vol.entries, truncated: vol.truncated, lineageResets: vol.lineageResets } : null
      };
    });
  }

  /**
   * v2.63.0：世界织体采集节。
   *   报出的重点不是「登记了几个地点」，而是**时空面拒了什么**（按原因分列）：
   *     · unknown-place  —— 用了没登记的地点（世界不猜「大概很近」）；
   *     · unreachable    —— 两地之间没有登记的道路（不按直线距离兜底）；
   *     · scheduled-elsewhere / closed —— 人在别处、或地点此刻不开放。
   *   这几类此前在状态里长得一模一样（都表现为「什么也没发生」），本节的全部意义
   *   就是让它们**分得开**——「悄悄不存在的地点」是本仓库最贵的一类静默失败。
   */
  function secWorld() {
    return safe(function () {
      if (!WA.world || typeof WA.world.stat !== 'function') return { error: 'world 模块不可用' };
      const st = WA.world.stat();
      const cfg = WA.world.getSettings ? WA.world.getSettings() : {};
      const ws = (WA.world.whereStat ? WA.world.whereStat() : {});
      return { enabled: !!cfg.enabled, maxPlaces: cfg.maxPlaces, maxEvents: cfg.maxEvents,
        places: ws.places || 0, roads: ws.roads || 0, events: ws.events || 0, upcoming: ws.upcoming || 0,
        moves: st.moves || 0, checks: st.checks || 0, blocked: st.blocked || 0,
        faults: st.faults || {}, faultKinds: Object.keys(st.faults || {}).sort(),
        lastReason: st.lastReason || '', placeKinds: WA.world.PLACE_KINDS || [],
        eventKinds: WA.world.EVENT_KINDS || [],
        // v2.93.0（X4）：通行三层的读数。**本节不调 transit**——它会增 stat 计数，
        //   而观测不得改变被观测对象；这里的数是面板按钮真跑出来的产物。
        channels: WA.world.CHANNELS || [],
        transits: (st.transits || { person: 0, goods: 0, message: 0 }),
        transitBlocks: (st.blocks || { person: 0, goods: 0, message: 0 }) };
    });
  }
  /**
   * v2.96.0（X3）：传播与辟谣采集节。**四层分列**——把「多少还停在事实层」
   *   与「多少已经烂成流言」分开数；合成一个总数就再也答不出这条链烂到哪一层。
   * 全知面（fullView）只在此处被消费：它是「谣言层不进玩家面」的对照面，
   *   没有它，「不剧透」这句话就无从复核（作者看不见底牌，就不知道玩家面是不是漏了）。
   */
  function secRumor() {
    return safe(function () {
      if (!WA.rumor || typeof WA.rumor.stat !== 'function') return { error: 'rumor 模块不可用' };
      const st = WA.rumor.stat(); const cfg = WA.rumor.getSettings ? WA.rumor.getSettings() : {};
      const fv = (cfg.enabled && WA.rumor.fullView) ? safe(function () { return WA.rumor.fullView(); }, null) : null;
      const rows = (fv && fv.ok && Array.isArray(fv.chains)) ? fv.chains : [];
      const byLayer = WA.rumor.LAYERS.reduce(function (a, L) {
        a[L] = rows.filter(function (x) { return x && x.layer === L; }).length; return a; }, {});
      // 两处纯读（fullView 与 LAYERS 归并），**不调** startChain / relay / refute / conceal：
      //   观测不得改变被观测对象——本节的存在本身不该让任何一条链多经一手。
      return { enabled: !!cfg.enabled, maxChains: cfg.maxChains, maxHops: cfg.maxHops, maxSuppressed: cfg.maxSuppressed,
        layers: WA.rumor.LAYERS || [], motives: WA.rumor.MOTIVES || [],
        publicLayers: WA.rumor.PUBLIC_LAYERS || [],
        started: st.started || 0, relays: st.relays || 0, concealed: st.concealed || 0, refuted: st.refuted || 0,
        blocked: st.blocked || 0, lastReason: st.lastReason || '',
        chains: rows.length, tampered: rows.filter(function (x) { return x && !x.intact; }).length,
        hops: rows.reduce(function (a, x) { return a + ((x && x.hopCount) || 0); }, 0),
        suppressed: rows.reduce(function (a, x) { return a + ((x && x.suppressed) || 0); }, 0),
        byLayer: byLayer,
        faults: st.faults || {}, faultKinds: Object.keys(st.faults || {}).sort() };
    });
  }
  /**
   * v2.99.0：原著幕目采集节。
   *   它要答的**不是**「切了几幕」——那是过程量。要答的是三件在存档里长得像
   *   「什么都没发生」的事：
   *     · 有没有基准（adopted）——没采纳过原著大纲，「已偏离原著哪一段」这类问题
   *       连**输入面**都没有（没有幕坐标就没有偏离的基准）；
   *     · 截断有没有被如实报出（cutActs / cutPoints **分两列**）——截断静默
   *       等于用户以为全整理完了，而分点被砍与分幕被砍是两种不同的丢失；
   *     · 定位被拒了几次、按什么理由（blocked + lastReason）——`out-of-range` /
   *       `bad-coord` / `no-outline` 在界面上都长得像「点了没反应」。
   *   全节**纯读**：只调 outlineView / actsBrief / stat，
   *   不调 buildOutline / adopt / clearOutline——观测不得改变被观测对象。
   *   （尤其 buildOutline：它会改 stat.builds，探一次就把「本轮构建过几次」污染了。）
   */
  function secCanon() {
    return safe(function () {
      if (!WA.canon || typeof WA.canon.stat !== 'function') return { error: 'canon 模块不可用' };
      const st = WA.canon.stat(); const cfg = WA.canon.getSettings ? WA.canon.getSettings() : {};
      const view = (typeof WA.canon.outlineView === 'function') ? safe(function () { return WA.canon.outlineView(); }, null) : null;
      // 幕目简报只在**已采纳**且开关打开时取。未采纳时 actsBrief 会返回 no-outline——
      //   那是合法态（还没喂原著），不是故障；把它当异常报会让「刚装上还没用」看起来像坏了。
      const brief = (cfg.enabled && view && view.adopted) ? safe(function () { return WA.canon.actsBrief(6); }, null) : null;
      // v2.100.0（第五十七面）：对位只读视图。**它连 stat 都不写**（alignView 内部走 alignCalc
      //   纯算核心，不碰任何计数）——诊断面上每一次「看一眼」都不该改账。
      //   未采纳原著 / 世界侧还没历史 / 一行都没撞上，三种都照实报 hasSignal:false + reason，
      //   不当异常报（与 brief 同一取舍：刚装上还没用不是坏了）。
      const align = (typeof WA.canon.alignView === 'function') ? safe(function () { return WA.canon.alignView(); }, null) : null;
      return { enabled: !!cfg.enabled, perAct: cfg.perAct, segChars: cfg.segChars,
        maxActs: cfg.maxActs, maxPoints: cfg.maxPoints, minPointChars: cfg.minPointChars,
        adopted: !!(view && view.adopted),
        acts: (view && view.acts) || 0, acts0: (view && view.acts0) || 0,
        points: (view && view.points) || 0, chars: (view && view.chars) || 0, segs: (view && view.segs) || 0,
        cutActs: !!(view && view.truncated && view.truncated.acts),
        cutPoints: !!(view && view.truncated && view.truncated.points),
        note: (view && view.note) || '',
        builds: st.builds || 0, adoptedCount: st.adopted || 0, cleared: st.cleared || 0,
        blocked: st.blocked || 0, truncated: st.truncated || 0, lastReason: st.lastReason || '',
        lastActs: st.lastActs || 0, lastPoints: st.lastPoints || 0, lastChars: st.lastChars || 0,
        brief: (brief && brief.ok) ? brief.rows.map(function (a) { return 'A' + a.no + ' ' + a.title; }) : [],
        // v2.100.0 对位段：读数 + 证据 + 三态分母一起报（说不出证据的读数不报）。
        align: align ? { adopted: !!align.adopted, hasSignal: !!align.hasSignal, reason: align.reason || '',
          coord: align.coord || '', title: align.title || '', score: align.score || 0, votes: align.votes || 0,
          evidence: align.evidence || [], runners: align.runners || [],
          rows: align.rows || 0, hitRows: align.hitRows || 0, hitActs: align.hitActs || 0,
          sources: align.sources || {}, passed: align.passed || 0, remain: align.remain || 0,
          cutActs: !!align.cutActs, cutPoints: !!align.cutPoints } : null,
        // 对位面三计数与整理面分列（signals/aligns/gaps —— 「看了几眼」不是「整理了几次」）
        signals: st.signals || 0, aligns: st.aligns || 0, gaps: st.gaps || 0,
        // v2.139.0（E11）：偏离度面。**零 stat 写入**（deviationTrend 内部不碰任何计数）——
        //   与 alignView 同口径：「看一眼曲线」不该改账。两个分量各自报出（口径⑤）。
        deviation: (typeof WA.canon.deviationTrend === 'function')
          ? safe(function () {
            const t = WA.canon.deviationTrend(10);
            if (!t || !t.adopted) return { adopted: false, points: 0 };
            const last = t.points.length ? t.points[t.points.length - 1] : null;
            return { adopted: true, points: t.points.length, thin: !!t.thin,
              last: last ? last.score : null,
              series: t.points.map(function (p) { return p.score; }) };
          }, null)
          : null,
        deviations: st.deviations || 0,
        deviationAlert: (typeof cfg.deviationAlert === 'number') ? cfg.deviationAlert : null,
        faults: st.faults || {}, faultKinds: Object.keys(st.faults || {}).sort() };
    });
  }
  /**
   * v2.63.0：社交漩涡采集节。
   *   重点报**履行与背弃各有多少**（kept / broken 分开），以及「想加深却没有秘密可加深」
   *   被拒了几次（no-shadow / shadow-closed，按原因分列）。
   *   合成一个「关系结束」就再也答不出「他到底守没守」——本节不让它被合掉。
   */
  function secShadow() {
    return safe(function () {
      if (!WA.shadow || typeof WA.shadow.stat !== 'function') return { error: 'shadow 模块不可用' };
      const st = WA.shadow.stat();
      const cfg = WA.shadow.getSettings ? WA.shadow.getSettings() : {};
      const ss = (WA.shadow.shadowStat ? WA.shadow.shadowStat() : {});
      return { enabled: !!cfg.enabled, maxRows: cfg.maxRows, maxExp: cfg.maxExp,
        rows: ss.rows || 0, active: ss.active || 0, faded: ss.faded || 0,
        experiences: ss.experiences || 0, kept: ss.kept || 0, broken: ss.broken || 0,
        deepened: st.deepened || 0, brightened: st.brightened || 0, blocked: st.blocked || 0,
        faults: st.faults || {}, faultKinds: Object.keys(st.faults || {}).sort(),
        lastReason: st.lastReason || '',
        kinds: WA.shadow.SHADOW_KINDS || [], stakes: WA.shadow.STAKES || [] };
    });
  }
  /**
   * v2.63.0：悬案采集节。
   *   重点报**查到了哪一步**：open（在查）/ stalled（悬置，仍在查）/ resolved（结案）
   *   / abandoned（放下并写明理由）四态分开；外加 overruled —— 矛盾未解却强行结案的案数。
   *   「悬着」与「破了」在状态里曾经长得一样，而那是推理玩法唯一重要的区分。
   */
  function secThreads() {
    return safe(function () {
      if (!WA.threads || typeof WA.threads.stat !== 'function') return { error: 'threads 模块不可用' };
      const st = WA.threads.stat();
      const cfg = WA.threads.getSettings ? WA.threads.getSettings() : {};
      const ts = (WA.threads.threadStat ? WA.threads.threadStat() : {});
      const overruled = (function () {
        try {
          const arr = Array.isArray(WA.store.get().threads) ? WA.store.get().threads : [];
          return arr.reduce(function (a, x) { return a + (x && x.overruled ? 1 : 0); }, 0);
        } catch (e) { return 0; }
      })();
      return { enabled: !!cfg.enabled, maxThreads: cfg.maxThreads, maxLeads: cfg.maxLeads,
        cases: ts.cases || 0, open: ts.open || 0, stalled: ts.stalled || 0,
        resolved: ts.resolved || 0, abandoned: ts.abandoned || 0, leads: ts.leads || 0,
        opened: st.opened || 0, blocked: st.blocked || 0, overruled: overruled,
        faults: st.faults || {}, faultKinds: Object.keys(st.faults || {}).sort(),
        lastReason: st.lastReason || '', reliability: WA.threads.RELIABILITY || [],
        terminal: WA.threads.TERMINAL || [] };
    });
  }
  /**
   * v2.64.0：随机性面采集节（远方/近端事件泳道）。
   *   报出的重点不是「触发了几次」，而是**「为什么没触发」各有多少**。
   *   `rolls` 与 `skipped` 必须互斥：前者只数真的掷了的、后者数「通道关着根本没掷」。
   *   本版此前这两行在通道检查**之前**，于是用户主动关掉随机事件时，
   *   面板那句「掷骰 N 次但零触发」是假的——它一次都没掷。
   */
  function secHorizon() {
    return safe(function () {
      if (!WA.horizon || typeof WA.horizon.stat !== 'function') return { error: 'horizon 模块不可用' };
      const st = WA.horizon.stat();
      return {
        enabled: st.enabled, config: st.config,
        rolls: st.rolls || 0, skipped: st.skipped || 0,
        distantFired: st.distantFired || 0, nearFired: st.nearFired || 0,
        reasons: st.reasons || {}, reasonKinds: st.reasonKinds || [],
        lastReason: st.lastReason || null,
        ledgers: (function () {
          try {
            const h = (WA.store.get().evolution || {}).horizon || {};
            return { distant: h.distant || null, near: h.near || null };
          } catch (e) { return null; }
        })(),
        defaults: { ledgerThreshold: WA.horizon.LEDGER_THRESHOLD, cooldown: WA.horizon.COOLDOWN_ROUNDS,
          baseChance: WA.horizon.BASE_CHANCE }
      };
    });
  }
  /**
   * v2.64.0：敌意面采集节（仇敌 / 黑盒 / 天下大势）。
   *   报出的重点不是「有几个仇敌」，而是**被丢弃的入账条目**（按原因分列）。
   *   本模块的否定式边界一律写作 `if (!e || !e.name) return;` —— 被丢的当然不落盘，
   *   于是「上游输出不合规」这件事在状态里此前**没有任何读法**。
   *   `applied` 四数与之成对：只报丢弃不报入账，读者会以为入账也坏了。
   */
  function secEnemies() {
    return safe(function () {
      if (!WA.enemies || typeof WA.enemies.dropStat !== 'function') return { error: 'enemies 模块不可用' };
      const ds = WA.enemies.dropStat();
      const cnt = (function () {
        try {
          const ev = WA.store.get().evolution || {};
          const all = ev.enemies || [];
          const bb = ev.blackbox || {};
          return { active: all.filter(function (e) { return e && e.status !== '已终结'; }).length,
            terminated: all.filter(function (e) { return e && e.status === '已终结'; }).length,
            trends: (ev.worldTrends || []).length,
            actions: (bb.secretActions || []).length, assets: (bb.secretAssets || []).length };
        } catch (e) { return {}; }
      })();
      return {
        dropped: ds.dropped || {}, dropKinds: ds.dropKinds || [],
        applied: ds.applied || {}, lastDropped: ds.lastDropped || '',
        statuses: WA.enemies.ENEMY_STATUS || [], types: WA.enemies.ENEMY_TYPE || [],
        assetStatuses: WA.enemies.ASSET_STATUS || [], counts: cnt
      };
    });
  }
  /**
   * v2.64.0：独立性面采集节（平行世界）。
   *   报出的重点有两项：
   *     ① `shouldAutoNow` —— after 链的唯一闸门此刻判成什么。此前它只在引擎内部被调用，
   *        「自动推进没发生」与「根本没开」在诊断包里长得完全一样；
   *     ② `settingsRaw` vs `settingsEffective` 与 `settingsDrift` —— 磁盘原值与归一后
   *        生效值的对照，是 v2.7.0「写入即归一」的唯一现场证据。
   */
  function secParallelWorld() {
    return safe(function () {
      if (!WA.parallelWorld || typeof WA.parallelWorld.stat !== 'function') return { error: 'parallelWorld 模块不可用' };
      const st = WA.parallelWorld.stat();
      const cfg = (WA.parallelWorld.effectiveSettings ? WA.parallelWorld.effectiveSettings() : {});
      const raw = (WA.parallelWorld.getSettings ? WA.parallelWorld.getSettings() : {});
      const auto = (typeof WA.parallelWorld.shouldAuto === 'function') ? WA.parallelWorld.shouldAuto() : null;
      const drift = (function () {
        try {
          const ks = ['enabled', 'autoMode', 'autoInterval', 'diceEnabled', 'detailLevel'];
          return ks.filter(function (k) { return String((raw || {})[k]) !== String((cfg || {})[k]); });
        } catch (e) { return null; }
      })();
      const cnt = (function () {
        try {
          const pw = WA.store.get().parallelWorld || {};
          return { npcs: (pw.npcs || []).length, relations: (pw.relations || []).length,
            modules: (pw.modules || []).length, snapshots: (pw.snapshots || []).length, round: pw.round || 0 };
        } catch (e) { return {}; }
      })();
      const round = (function () { try { return WA.store.read('evolution.round', 0) || 0; } catch (e) { return 0; } })();
      return { enabled: !!cfg.enabled, autoMode: cfg.autoMode, autoInterval: cfg.autoInterval,
        diceEnabled: !!cfg.diceEnabled, detailLevel: cfg.detailLevel,
        settingsRaw: raw, settingsEffective: cfg, settingsDrift: drift,
        running: st.running === true, advances: st.advances || 0, failed: st.failed || 0,
        notConfigured: st.notConfigured || 0, lastErr: st.lastErr || '',
        shouldAutoNow: auto, evolutionRound: round,
        impacts: WA.parallelWorld.IMPACTS || [], injectMinImpact: WA.parallelWorld.INJECT_MIN_IMPACT || null,
        caps: { npcs: WA.parallelWorld.CAP_NPCS, relations: WA.parallelWorld.CAP_RELATIONS, modules: WA.parallelWorld.CAP_MODULES },
        counts: cnt };
    });
  }
  /**
   * v2.80.0（第十四面）：故障台账总目。
   *   背景：v2.63.0 起，world / shadow / threads 各自把「被拒了什么」按原因计入 stat.faults，
   *   并由本模块的 secWorld / secShadow / secThreads 三节分别报出。此后陆续又有二十余个模块
   *   照同一口径建了台账（choices / affect / bonds / masks / temporal-lock / temperament /
   *   fondness / parallel-events / era-cycle / survival / warrant / beast-bond / appearance /
   *   ladder / enigma / tempo / quota / spotlight / karma / hazard / marginal / tolerance /
   *   weather / difficulty），却一个都没被念出来——台账建了，读侧没长。
   *   后果是分级的：那三个老模块的拒收分得开（unknown-place / unreachable / no-shadow /
   *   missing-question …），其余二十四个模块的拒收在**本面板上**与「什么也没发生」不可分，
   *   而这恰是 v2.63.0 立那三面时要根除的那类静默失败。
   *   本节的判据只有一条：**凡以 stat().faults 记账的模块，必须出现在同一张总目里**。
   *   逐模块单列采集节在结构上兜不住这条——漏一个模块，它的采集节与它一起缺席，面板照绿；
   *   一张会自己长大的总目才兜得住（新增台账模块自动进表，无需有人记得来加一节）。
   *   实现纪律：只读观测。不改判定、不改返回结构、不新增模块导出成员。模块缺席、
   *   stat() 抛错、或无 faults 容器的一律跳过（那是「没台账」，不是「台账坏了」）。
   *   读数一律**快照拷贝**：本节的立场是「观测不该成为可被观测者改写的东西」，
   *   故它不能把 stat() 交回来的 faults 原样转手（structural 模块曾整份交回内部引用）。
   */
  /**
   * v2.228.0(拓展 N10):历史留存与检索读数。与 storyLoop / plotGauge 两节分列不合并 ——
   *   那两节答「闭环走完没」「张力到几档」,这一节答「这一轮把哪些旧事拉回眼前了、
   *   拉回来的东西**装得下装不下**」。
   *   本模块的 `assemble`(有界紧凑包)在此处接上产品侧读者:不接上,「超限先压紧、
   *   压不下就显式报 capacity」这条口径在产品代码里就没有任何消费方
   *   (口径:产品零引用即冻结面 —— dead-export-gate 当场红灯)。
   *   读数只念现场,不替用户跑检索(跑检索是面板「留存」页出口的事)。
   */
  function secRetrieval() {
    return safe(function () {
      if (!WA.retrieval || typeof WA.retrieval.audit !== 'function') return { error: 'engines/retrieval.js 未加载（留存读数缺席）' };
      const cfg = WA.retrieval.getSettings();
      const a = WA.retrieval.audit();
      const cs = WA.retrieval.contracts();
      const st = WA.retrieval.stat();
      // 有界包读数:真走一遍「候选 -> 装包」,量出 入包几行 / 掉了几行 / 超没超容量。
      //   为什么不照抄 a.assembled:那个数在 capacity 态与「本来就没有」同形 ——
      //   只有真调 assemble 才拿得到 rowsIn/rowsOut/dropped/mode 这一组,
      //   而「被预算丢掉」与「本来就没有」必须分得开(本模块口径 4)。
      //   如实记账:本节这两次调用会给 stat.calls / stat.assemblies 各 +1 ——
      //   那是**读数计数器**,不是世界状态(与 secPlotGauge「不推趋势环」同一取舍)。
      let pack = null, cand = null;
      try {
        cand = WA.retrieval.candidates({ text: '' });
        pack = WA.retrieval.assemble(cand, {});
      } catch (e) { pack = null; cand = null; }
      return {
        enabled: !!cfg.enabled, windowMs: cfg.windowMs, maxRows: cfg.maxRows, maxChars: cfg.maxChars,
        verdict: a.verdict, reasons: (a.reasons || []).slice(),
        edges: (cs.edges || []).map(function (e) { return { edge: e.edge, present: e.present, why: e.why }; }),
        presentCount: a.presentCount, edgeTotal: a.edgeTotal,
        candidates: a.candidates, assembled: a.assembled, dropped: a.dropped, capacity: a.capacity,
        guards: Object.assign({}, a.guardCounts || {}),
        // 有界包五项一并透出 ——「装不下」只有在这一组数里看得见
        //   (只看 text 长度会把它读成「内容少」)。
        pack: pack ? { rowsIn: pack.rowsIn, rowsOut: pack.rowsOut, dropped: pack.dropped,
          chars: pack.chars, capacity: pack.capacity, mode: pack.mode,
          // v2.231.0(OPT-1):「当前值与历史分列」了几行 —— 只看 chars 看不出这件事。
          split: pack.split } : null,
        // v2.231.0(OPT-1):越窗召回读数(词表规模 + 本轮是否在问旧事 + 召回了多少行)。
        //   与 pack.split 分开报:一个是「记起了什么」,一个是「分列了几行」。
        recall: cand ? { hints: (WA.retrieval.RECALL_HINTS || []).length,
          wanted: !!cand.recall, rows: cand.recalled } : null,
        calls: st.calls, historyOf: st.historyOf, assemblies: st.assemblies,
        absents: st.absents, faults: Object.assign({}, st.faults || {})
      };
    });
  }
  function secFaultLedger() {
    return safe(function () {
      const rows = [];
      let owners = 0, accounted = 0;
      Object.keys(WA).forEach(function (k) {
        const m = WA[k];
        if (!m || typeof m !== 'object' || typeof m.stat !== 'function') return;
        let st = null;
        try { st = m.stat(); } catch (e) { return; }
        if (!st || typeof st !== 'object') return;
        const f = st.faults;
        if (!f || typeof f !== 'object') return;
        owners++;
        const kinds = Object.keys(f).sort();
        const sum = kinds.reduce(function (a, r) { return a + (typeof f[r] === 'number' ? f[r] : 0); }, 0);
        accounted += sum;
        if (!kinds.length) return;                 // 空台账不进总目（否则总目被几十行零填满）
        const counts = {};
        kinds.forEach(function (r) { counts[r] = f[r]; });
        rows.push({ module: k, kinds: kinds, total: sum, counts: counts });
      });
      rows.sort(function (a, b) { return b.total - a.total || (a.module < b.module ? -1 : 1); });
      return { owners: owners, modules: rows.length, accounted: accounted, rows: rows };
    }, { owners: 0, modules: 0, accounted: 0, rows: [], error: 'fault-ledger collect failed' });
  }

  function secModules() {
    const missing = [], loaded = [], optionalMissing = [];
    Object.keys(MODULE_EXPORTS).forEach(function (file) {
      const key = MODULE_EXPORTS[file];
      if (WA[key]) loaded.push({ file: file, key: key });
      else if (OPTIONAL_EXPORTS.indexOf(key) >= 0) optionalMissing.push({ file: file, key: key });
      else missing.push({ file: file, key: key });
    });
    // v2.86.0 A3：把「人物条目是谁建出来的」接进模块节。
    //   它是 registry.personOriginStat 的真消费方——观测出口没人读就是死导出，
    //   而这条读数正是「有没有人又绕开唯一写者」的唯一现场证据。
    const personOrigin = safe(function () { return WA.registry && WA.registry.personOriginStat ? WA.registry.personOriginStat() : null; }, null);
    // v2.87.0 B7：题材规则组合的现场读数（启用哪些题材 / 生效模块 / 拒收次数）。
    //   它是 WA.theme.statView 的真消费方——「题材装上了没」在诊断面必须可答。
    const theme = safe(function () { return WA.theme && WA.theme.statView ? WA.theme.statView() : null; }, null);
    // X7（v2.128.0）：题材**差异对照**的现场读数（B7 收口）。
    //   它是 `render.themeContrast` 的真消费方——「题材到底影响不影响注入面」必须在诊断面可答，
    //   否则「两题材装出来一样」这种缺陷没有任何出口能看见。默认对**全量 → 当前题材**做一次对照
    //   （当前无题材时两侧一致，那是如实结论，不是缺陷）。
    const themeContrast = safe(function () {
      if (!WA.render || typeof WA.render.themeContrast !== 'function') return null;
      const cur = (WA.theme && WA.theme.statView) ? (WA.theme.statView().themes || []) : [];
      const r = WA.render.themeContrast([], cur);
      if (!r || !r.ok) return r || null;
      return { ok: true, from: '全量', to: cur, identical: r.identical,
        addedSources: r.addedSources, removedSources: r.removedSources,
        addedModules: r.addedModules, removedModules: r.removedModules,
        coverage: r.coverage, note: r.note };
    }, null);
    return {
      loadedCount: loaded.length,
      missingCount: missing.length,
      personOrigin: personOrigin,
      theme: theme,
      // X7（v2.128.0）：题材差异对照读数（主体是 render.themeContrast）。
      themeContrast: themeContrast,
      // v2.91.0 O4：跨模块身份引用的**悬空对账**（只报不删）。
      //   它是 registry.danglingRefs 的真消费方——关系 / 量值 / 承诺三类行里的 target
      //   都是名字引用，而「名字的生死」此前没有任何出口可见（idStat 只对账
      //   people 容器键 ↔ 持久 id，看不见**行内 target** 这一层）。
      danglingRefs: safe(function () { return WA.registry && WA.registry.danglingRefs ? WA.registry.danglingRefs() : null; }, null),
      missing: missing,
      optionalMissingList: optionalMissing,
      optionalMissing: optionalMissing.map(function (x) { return x.key; }),
      registeredModules: safe(function () { return Object.keys(WA.modules || {}); }, [])
    };
  }

  // ── 4. 视图开关 ─
  function secVisibility() {
    return safe(function () {
      const vis = WA.render && WA.render.getVisibility ? WA.render.getVisibility() : {};
      const on = Object.keys(vis).filter(function (k) { return vis[k] === true; });
      return { sources: vis, enabled: on, enabledCount: on.length };
    }, {});
  }

  // ── 5. 注入落地自检 ─
  function secInject() {
    return safe(function () {
      if (!WA.injectInspector) return { error: 'injectInspector 模块不可用' };
      const snap = WA.injectInspector.getLastSnapshot('world');
      // v2.48.0: 无快照**不再提前退出**。注入器快照（snapEnv/classify/snapshotChat）与槽位证据
      //   （store.lastInjection 的 slots / slotErrors / budget）是**两套独立子系统**：前者要等到
      //   一次真实发送才生成，后者上一轮注入完就已经在场。此前 `if (!snap) return ...` 把后者
      //   一起挡在门外——于是「槽位部分失败（现场缺失）」「预算超支折叠」这些最该被看见的现场，
      //   在快照尚未生成时**完全不可见**（用户只会看到一句「尚未生成，暂无注入记录」）。
      //   探针 L 实测：造好 slotErrors 与 slots 后调 secInject，返回里连 slotConsistent 都没有。
      const out = snap
        ? {
            hasSnapshot: true, status: snap.status,
            statusText: WA.injectInspector.statusText ? WA.injectInspector.statusText(snap.status) : null,
            apiType: snap.apiType, round: snap.round, ts: snap.ts, landed: snap.landed,
            injectEnabled: snap.injectEnabled, registeredAtSend: snap.registeredAtSend
          }
        : { hasSnapshot: false, status: 'NOT_YET', statusText: WA.injectInspector.statusText('NOT_YET') };
      if (snap && snap.apiType === 'chat') { out.messageCount = snap.messageCount; out.ourIndex = snap.ourIndex; out.ourContentLen = snap.ourContentLen; }
      // v0.1.6: 补槽位落地信息（来自 injectSlotAudit 对 lastInjection 的对账结果）
      const li = (WA.store && WA.store.get) ? (WA.store.get().lastInjection || null) : null;
      // v0.1.29: 快照已撤销时标注——槽位证据保留但注入已不在场
      if (li && li.injected === false) { out.injected = false; out.clearedAt = li.clearedAt || null; out.clearedBy = li.clearedBy || null; }
      // v2.49.0（第三十四面）：**主块自身的账**。len / sources 由 render/inject.js 每轮写入，
      //   但自 v0.2.1 起全库零读点——「上一轮主块多少字、由哪些源拼成」在诊断包与面板里
      //   都查不到。缺了它，「主块 0 字」这句结论无法区分两种截然不同的局面：
      //     · 全部走独立槽位（约束已生效）——正常；
      //     · 本轮确实没有可注入内容（什么都没进 prompt）——可能有问题。
      //   两者在旧账上完全同形（len=0 / sources=[] / injected=true）。
      if (li) {
        out.main = { len: li.len | 0, sources: Array.isArray(li.sources) ? li.sources.slice() : [], count: (typeof li.mainCount === 'number') ? li.mainCount : null };
        out.main.dupWithSlots = (WA.injectSlotAudit && WA.injectSlotAudit.audit) ? (function () {
          try { const a = WA.injectSlotAudit.audit(li); return (a.issues || []).filter(function (x) { return x.code === 'slot.mainDuplicate'; }).map(function (x) { return x.detail; }); } catch (e) { return []; }
        })() : [];
      }
      // v2.50.0（第三十五面）：本轮**宿主世界书激活**与我这批注入的交叉核对结果。
      //   由 render/inject.js 在落地时写入（引擎侧算，快照侧存），这里只是把结果读出来——
      //   缺了这一步，hostWbTrace 就又变成「记了没人看」（与 v2.49.0 主块账同病）。
      if (li && li.hostWb) {
        out.hostWb = {
          available: !!li.hostWb.available, state: li.hostWb.state || null,
          checked: li.hostWb.checked | 0, uncomparable: li.hostWb.uncomparable | 0,
          overlaps: (li.hostWb.overlaps || []).slice(0, 5), note: li.hostWb.note || ''
        };
      }
      // v0.1.41: 撤销-槽位关联审计
      if (WA.render && WA.render.uninjectAudit) { const ua = WA.render.uninjectAudit(); if (ua.issues.length) out.uninjectIssues = ua.issues; }
      // v2.48.0: 前置条件从 li.slots 放宽到「有快照 或 有槽位失败」。
      //   此前只要 slots 为 null 就整段跳过——而部分失败轮在旧版根本不写快照，
      //   恰好是最需要结论的那一轮，诊断包却什么都不说（新错误码也永远到不了这里）。
      if (li && (li.slots || li.slotErrors)) {
        if (li.slots) out.slots = li.slots;
        const slotAudit = WA.injectSlotAudit ? WA.injectSlotAudit.audit(li) : null;
        if (slotAudit) {
          out.slotConsistent = slotAudit.consistent;
          if (slotAudit.issues.length) out.slotIssues = slotAudit.issues;
          // v2.48.0: 结论本身也要能带走——note 写的是「现场缺失」还是「未启用路由」，
          //   是两种截然不同的处置方向，不能只留一个 consistent 布尔。
          if (slotAudit.note) out.slotAuditNote = slotAudit.note;
        }
      }
      // v0.1.24: 上轮注入预算账单（超支/折叠/丢弃明细）
      if (li && li.budget) {
        const b = li.budget;
        out.budget = { used: b.used, cap: b.cap, source: b.source, contextSize: b.contextSize || null, remain: b.remain, inputTokens: b.inputTokens, saved: b.saved, overBudget: !!b.overBudget, keptCount: b.keptCount || 0, foldedCount: (b.folded || []).length, droppedCount: (b.dropped || []).length };
        if ((b.dropped || []).length) out.budget.dropped = b.dropped;
        // v2.524.0（OPV27-4）：**被裁清单要能一句话回答**「这轮关系块为什么没进来」。
        //   修前诊断包里 dropped 只是 {source, reason, tokens, remainAt} 四列的原始账：
        //   读者知道「它没进来、因为 no_budget」，却答不出「丢了它我损失了多少信息、
        //   同一科的事还有没有别人在说」。故这里把 plan 的档位与 **explain() 的人话**
        //   一并提到诊断面上（与面板同一判据，不各算一套）。
        out.budget.droppedForced = (b.dropped || []).filter(function (x) { return x.tier === 'unique'; })
          .map(function (x) { return { source: x.source, tokens: x.tokens, reason: x.reason }; });
        out.budget.droppedExplain = (function () {
          const first = (b.dropped || [])[0];
          if (!first) return null;
          if (!WA.injectBudget || typeof WA.injectBudget.explain !== 'function') return null;
          // 用**快照里的账单**当计划喂给 explain：诊断包只能读快照（plan 已随轮次丢弃），
          //   故 explain 只依赖 kept/folded/dropped 三张表这一事实在此处变得关键。
          const pseudo = { kept: b.keptRaw || [], folded: b.folded || [], dropped: b.dropped || [] };
          const ex = WA.injectBudget.explain(pseudo, first.source);
          return { source: first.source, tier: first.tier || null, savedTokens: first.savedTokens == null ? first.tokens : first.savedTokens,
            text: ex && ex.text ? ex.text : null, ok: !!(ex && ex.ok) };
        })();
        out.budget.summary = WA.injectBudget && WA.injectBudget.summaryText ? WA.injectBudget.summaryText({ used: b.used, budget: b.cap, overBudget: !!b.overBudget, folded: b.folded || [], dropped: b.dropped || [], saved: b.saved, cost: b.cost || null, headroom: b.headroom || null }) : null;
        // v2.524.0（V27 优化线剩余六项）：六张新读数一次挂进诊断包。
        //   它们都是「玩家问一句、面板答一句」的面，没有各自的深层结构，
        //   所以在诊断面统一成一行行 text，而不是各开一棵树（开树要各自的读口与契约，
        //   那六棵树本轮没有消费者，就是下一个「死面」）。
        out.v27 = (function () {
          const r = {};
          try {
            if (WA.saveCurve) {
              const sc = WA.saveCurve.report();
              r.saveCurve = { text: sc.text,
                points: (sc.curve && sc.curve.points) ? sc.curve.points.length : 0,
                growthTop: (sc.growth && sc.growth.ok) ? sc.growth.rows.slice(0, 3) : [] };
            }
          } catch (e) { r.saveCurve = { text: '读不到：' + String(e && e.message) }; }
          try {
            if (WA.narrowConsumers) {
              const nb = WA.narrowConsumers.board();
              r.narrow = { text: nb.text, byKind: nb.byKind,
                rows: (nb.rows || []).map(function (x) { return { zh: x.zh, kind: x.kind, text: x.text }; }) };
            }
          } catch (e) { r.narrow = { text: '读不到：' + String(e && e.message) }; }
          try { if (WA.settingsIndex) r.settingsIndex = WA.settingsIndex.coverage(); }
          catch (e) { r.settingsIndex = { text: '读不到：' + String(e && e.message) }; }
          try { if (WA.rejectPhrase) r.rejectPhrase = WA.rejectPhrase.stat(); }
          catch (e) { r.rejectPhrase = { text: '读不到：' + String(e && e.message) }; }
          try {
            if (WA.injectDelta && WA.injectDelta.last) {
              const dl = WA.injectDelta.last();
              r.injectDelta = dl ? { text: dl.text, dupRate: dl.dupRate, sources: dl.sources } : { text: '本轮还没有读数' };
            }
          } catch (e) { r.injectDelta = { text: '读不到：' + String(e && e.message) }; }
          try {
            if (WA.store && WA.store.loadStat) {
              const ls = WA.store.loadStat();
              const lf = (ls && ls.lastFix) || {};
              // v2.553.0：**这个读数此前会说假话**。
              //   `migrate` 的第一句就把缺键补齐，`ensureShape` 随后面对的是**已补齐**的对象
              //   ⇒ `missingTotal` 恒 0 ⇒ 这里永远打印「本次载入骨架完整（缺 0 键）」，
              //   哪怕这份存档进来时缺了 235 个键。治疗跑在体检之前，诊断就被治疗抹平了。
              //   现在把 `lastAudit`（**治疗前**那份，见 core/store.js 的 auditLoadedArchive）
              //   并列出来：audit 说进来时什么样，shape 说补过之后什么样，两者不许互相顶替。
              const la = (ls && ls.lastAudit) || null;
              const codes = (la && la.codes) || {};
              // 归因码的中文名：只在本处用；未知码原样透出（不猜）。
              const codeZh = { missing: '缺键', 'missing-version': '缺版本键', 'bad-type': '类型错',
                forbidden: '禁用键存在', 'unknown-version': '版本未知', unserializable: '不可序列化',
                'bad-blob': '非对象存档' };
              const brk = Object.keys(codes)
                .sort(function (a, b) { return codes[b] - codes[a] || (a < b ? -1 : 1); })
                .map(function (k) { return (codeZh[k] || k) + ' ' + codes[k]; })
                .join(' / ');
              r.shape = { filled: lf.filled || 0, conflicts: lf.conflicts || 0,
                missingTotal: lf.missingTotal || 0, missing: (lf.missing || []).slice(0, 8),
                // 治疗前（载入体检）；null = 本次载入不是从盘上读出来的（新聊天），**不是**「没问题」
                audit: la ? { at: la.at, ok: la.ok, problemCount: la.problemCount, codes: codes,
                  codesCapped: la.codesCapped === true, truncated: la.truncated === true,
                  version: la.version, bytes: la.bytes, source: la.source, error: la.error } : null,
                text: !la
                  ? ('这次载入不是从盘上读出来的（新聊天）⇒ 没有载入体检读数；'
                    + (lf.missingTotal ? ('骨架缺 ' + lf.missingTotal + ' 键（已补齐）') : '骨架无缺键'))
                  : (la.problemCount > 0
                    ? ('载入体检：' + la.problemCount + ' 项（' + brk + '）——这是**补齐之前**的样子；'
                      + '补齐之后骨架缺 ' + (lf.missingTotal || 0) + ' 键（只看 shape 会以为没事）')
                    : ('载入体检：0 项问题（' + (la.bytes || 0) + ' 字节）')) };
            }
          } catch (e) { r.shape = { text: '读不到：' + String(e && e.message) }; }
          return r;
        })();
        // v2.261.0（V6 OPV6-6）：**余量账**。修前诊断包里只有 `used/cap` 两个裸数——
        //   「还剩多少、算不算饱和、还能再开几个源」三问在诊断包上**无一可答**，
        //   于是「预算不够」永远是玩家的第一直觉（现场实测长局只用 43%）。
        //   本块走 `injectBudget.budgetView`（与面板、backstage 同一判据，不各算一套）。
        if (WA.injectBudget && typeof WA.injectBudget.budgetView === 'function') {
          const bv = WA.injectBudget.budgetView(b);
          if (bv) {
            out.budget.headroom = {
              remain: bv.remain, usedPct: bv.usedPct, freePct: bv.freePct,
              saturated: bv.saturated, overBudget: bv.overBudget,
              avgKeptTokens: bv.avgKeptTokens, spareSources: bv.spareSources,
              derived: bv.derived
            };
            if (bv.mode) out.budget.mode = bv.mode;
            if (bv.modeText) out.budget.modeText = bv.modeText;
            if (bv.advice) out.budget.advice = bv.advice;
            out.budget.headroomText = bv.text;
          }
        }
        // v2.88.0 O1：成本账的**真消费点**。快照里写了 cost 而无人读，就只是「记了没人看」
        //   （与 v2.49.0 的主块账、v2.50.0 的宿主账同病）。这里把分档/科目/最慢源提到诊断面上：
        //   「注入慢在哪、慢在谁身上」从本版起在诊断包里可答。
        if (b.cost) {
          out.budget.cost = {
            measured: b.cost.measured | 0, unmeasuredCount: b.cost.unmeasuredCount | 0,
            subTick: b.cost.subTick | 0, totalMs: b.cost.totalMs, bands: b.cost.bands,
            slowest: b.cost.slowest, unclassified: (b.cost.unclassified || []).slice(0, 6),
            accounts: b.cost.accounts
          };
          // 「未归类非空」是一面镜子：源面长了而科目表没跟上（含新增源名）
          if ((b.cost.unclassified || []).length) out.budget.cost.note = '科目表缺登记：' + b.cost.unclassified.slice(0, 4).join('/');
        }
        // 本轮引擎耗时的实时读数（与快照里的成本账互为佐证：一个记「本地刚跑过的」，一个记「上一轮存下的」）
        const icost = (WA.render && WA.render.visibilityStat) ? WA.render.visibilityStat() : null;
        if (icost && icost.injectCost) {
          const keys = Object.keys(icost.injectCost);
          out.budget.injectCostTotal = icost.injectCostTotal || 0;
          out.budget.injectCostSources = keys.length;
          // 只报最慢的 5 个——全量列表会把诊断包撑大，而「哪几个慢」才是要看的
          // v2.88.0 O1：每行贴上档位（injectBudget.costOf 的真消费方）。只报一个裸 ms
          //   要读者自己换算「1ms 算快吗」；贴了档位才是可行动的读数。
          const bandOf = (WA.injectBudget && WA.injectBudget.costOf) ? WA.injectBudget.costOf : null;
          out.budget.injectCostTop = keys.sort(function (a, c) { return icost.injectCost[c].ms - icost.injectCost[a].ms; }).slice(0, 5)
            .map(function (k) { const ms = icost.injectCost[k].ms; return { source: k, ms: ms, n: icost.injectCost[k].n, band: bandOf ? bandOf(ms).band : null }; });
        }      }
      // v2.90.0 O3：本轮执行解释的**真消费点**。
      //   修前：一个轮里「哪些源进了、哪些没进、为什么」只能靠人手比对
      //   main.sources 与可见性配置——而「模块未加载」与「本轮无内容」在旧读数上同形。
      //   这里只报全知面的计数与未落地项（玩家面的叙事句子属面板）——
      //   诊断包不该把 47 条逐源明细撞进去（那是另一个已有的账）。
      if (WA.render && typeof WA.render.explain === 'function') {
        const ex = WA.render.explain();
        if (ex && ex.ok) {
          out.explain = {
            round: ex.round, candidates: ex.omniscient.candidates,
            landedCount: ex.omniscient.landedCount, missedCount: ex.omniscient.missedCount,
            playerSummary: ex.player.summary,
            missed: ex.omniscient.decisions.filter(function (x) {
              return x.state !== 'landed' && x.state !== 'landed-in-state';
            }).map(function (x) { return x.name + '(' + x.state + ')'; })
          };
          if (!out.explain.missed.length) delete out.explain.missed;
        } else out.explain = { error: (ex && ex.reason) || 'unavailable' };
      }
      // v2.91.0 O4：开关两面真值的诊断读数。
      //   只报**异常面**（mod-off 是「勾了却无效」，必须点出来）；on / unavailable 是常态，
      //   逐条撞进诊断只是噪声。零新增导出：走既有 visibilityStat 口。
      if (WA.render && typeof WA.render.visibilityStat === 'function') {
        try {
          const fa = (WA.render.visibilityStat() || {}).faceAudit || [];
          const offRows = fa.filter(function (r) { return r.face === 'mod-off'; });
          if (offRows.length) out.faceOff = offRows.map(function (r) { return r.name + '(' + r.key + ')'; });
          out.faceUnavailable = fa.filter(function (r) { return r.face === 'unavailable'; }).length;
        } catch (e) { out.faceAuditError = String((e && e.message) || e).slice(0, 120); }
      }
      // v2.260.0（V6 OPV6-5）：**缺省面**读数 —— 与上面 faceAudit（「每个源此刻是哪个面」）
      //   分列不合并：本段答的是「出厂缺省替你关了什么、那份缺省是不是真在用」。
      //   修前这一面在诊断包里**完全不可见**：visibility 整键可以是 null，107 个源全走
      //   `__REG.def` 缺省，玩家与诊断者都看不出「有一批源默认关着」，而现场表现是
      //   「引擎在跑、正文没内容」。只报读数，一个 save 都不调（走 visibilityDefault 口）。
      if (WA.render && typeof WA.render.visibilityDefault === 'function') {
        try {
          const vd = WA.render.visibilityDefault();
          out.visDefault = {
            configured: vd.configured, sources: vd.sources,
            defaultOff: (vd.defaultOff || []).slice(),
            silent: vd.silent | 0, silentKeys: (vd.silentKeys || []).slice(),
            doubleOff: vd.doubleOff | 0, doubleOffKeys: (vd.doubleOffKeys || []).slice(),
            noSwitch: vd.noSwitch | 0, noSwitchKeys: (vd.noSwitchKeys || []).slice()
          };
          if (vd.note) out.visDefault.note = vd.note;
        } catch (e) { out.visDefaultError = String((e && e.message) || e).slice(0, 120); }
      }
      // v0.1.9: 槽位路由错误快照（部分失败时存在）
      if (li && li.slotErrors) out.slotErrors = li.slotErrors;
      else if (snap) { out.promptLength = snap.promptLength; out.ourExcerptLen = snap.ourExcerptLen; }
      return out;
    }, {});
  }

  // ── 6. 世界状态摘要 + 上轮注入打点 ─
  function secWorldState() {
    return safe(function () {
      const st = WA.store && WA.store.get ? WA.store.get() : null;
      if (!st) return { error: 'store 不可用' };
      const ev = st.evolution || {};
      return {
        schemaVersion: st.schemaVersion,
        round: roundOfSafe(st),   // v2.39.0: 顶层 state.round 幽灵 ⇒ 诊断包 round 缺失
        clock: (st.clock && st.clock.label) || null,
        counts: {
          events: len(ev.events), factions: len(ev.factions),
          people: Object.keys(st.people || {}).length,
          currents: len(st.currents), foreshadows: len(ev.foreshadows),
          pmem: len((st.memory || {}).pmem), chapters: len(st.chapters)
        },
        pulse: st.worldPulse ? { pressure: st.worldPulse.pressure, trend: st.worldPulse.trend } : null,
        lastInjection: st.lastInjection || null,
        recoveryPoints: safe(function () { return WA.store.listRecoveryPoints ? WA.store.listRecoveryPoints().length : null; }, null),
        // v0.1.22: 持久化观测——落盘状态、体积画像与失败归因
        storage: safe(function () {
          if (!WA.store || !WA.store.saveStat) return null;
          const stat = WA.store.saveStat();
          const prof = WA.store.sizeProfile ? WA.store.sizeProfile(6) : null;
          return {
            // v2.229.0（拓展 N11）：face = 保存四态（saved / partial / unconfirmed / failed）。
            //   此前这里只有 ok/bytes/reason —— 救援成功（有损）与干净落盘同形。
            lastSave: { at: stat.at, ok: stat.ok, bytes: stat.bytes, reason: stat.reason, failCount: stat.failCount,
              face: stat.face || 'unknown', faceNote: stat.faceNote || '' },
            transactions: WA.store.txStat ? WA.store.txStat() : null,
            batch: WA.store.batchStat ? WA.store.batchStat() : null,
            recovery: WA.store.recoveryStat ? WA.store.recoveryStat() : null,
            load: WA.store.loadStat ? WA.store.loadStat() : null,
            // v0.1.51: 存储键卫生——worldaxis_* 键空间分类计量与孤儿候选
            storageKeys: WA.store.storageStat ? WA.store.storageStat() : null,
            diagBudget: (WA.store.diagBudget && WA.store.storageStat) ? (function () { try { return WA.store.diagBudget(); } catch (e) { return null; } })() : null,
            // v0.4.0: 统一健康巡视（只读不 apply）+ 写入完整性审计
            maintain: WA.store.maintain ? (function () { try { return WA.store.maintain({ deep: false }); } catch (e) { return null; } })() : null,
            maintainStat: WA.store.maintainStat ? WA.store.maintainStat() : null,
            integrity: WA.store.integrityStat ? WA.store.integrityStat() : null,
            // v2.9.0: 删除侧台账（store 域）——与 integrity（写入侧）对偶。
            //   此前 store.removeStat() 是纯声明面：导出了却零产品消费（本版逆向审计抓出），
            //   接入此处后「清理类操作到底删掉没有」第一次能被诊断包回答。
            remove: WA.store.removeStat ? WA.store.removeStat() : null,
            // v2.10.0: 读侧台账（store 域）——与 integrity（写侧）/ remove（删侧）三面对称。
            //   读失败在 store 域有两个破坏性后果：① 体积表偏小（容量结论不实）；
            //   ② 活跃时间回落 0 = 最冷 ⇒ 该聊天的诊断键会被判为可回收（**读失败诱发误删除**）。
            //   故必须与「值就是空」严格可分辨，否则用户按诊断清空间会清错东西。
            read: WA.store.readStat ? WA.store.readStat() : null,
            // v2.113.0（A1 收口）：**闸门读数**进诊断包。
            //   此前 `permissions.gateStat` 只被测试消费（死子面记 self-only）——
            //   「保护到底启用了没有、闸门放行了多少次」在产品侧没有一个落点，
            //   于是 store 的写被闸门拦下时，诊断包回答不了「为什么被拦」。
            //   与 store 侧写入台账同址（worldState.storage），纯只读、不触发任何写。
            permissions: (WA.permissions && WA.permissions.gateStat) ? WA.permissions.gateStat() : null,
            // v0.7.0: 楼层结算守卫观测（settles/skips 归因 / 最后结算楼层）
            settleGuard: WA.settleGuard ? (function () { try { return WA.settleGuard.stat(); } catch (e) { return null; } })() : null,
            // v2.159.0（TP1/TP2）：**异步归属票据**台账 —— 被拒的写回必须可见。
            //   此前「模型没返回」与「返回了但被归属检查丢掉」在读数上同形（用户只看到
            //   摘要/档案不动，无从判断原因）。本行把 issued/passed/blocked/byReason 摊开。
            claims: WA.store.claimStat ? (function () { try { return WA.store.claimStat(); } catch (e) { return null; } })() : null,
            // v2.160.0（TP4）：**跨引擎提交台账**。claims 只答「票据层面放行了多少」，
            //   而「一条跨引擎的链整条提交过没有、副作用落了没有」只有 core/commit.js 知道。
            //   两者分开报，是因为「票据放行但链没提交」与「链提交了但副作用没落」是两回事。
            commit: WA.commit ? (function () { try { return WA.commit.stat(); } catch (e) { return null; } })() : null,
            // v2.159.0（TP2）：**各消费者自己的写回台账**。store 的 claimStat 只答「票据层面
            //   放行了多少」；「这次写回究竟写进了哪一层（摘要/记忆/档案/舆情）」只有各引擎
            //   自己知道。两者分开报，是因为「票据放行但引擎没写」与「票据拒收」是两回事。
            writeback: {
              summarizer: (WA.summarizer && WA.summarizer.stat) ? (function () { try {
                // `cursorOf` 一并报出：它是本版写回判据依赖的那个游标 —— 不报的话，
                // 「摘要为什么被判过期」只能靠猜（游标变了 = 这一段原文动过）。
                return Object.assign({}, WA.summarizer.stat(), {
                  cursor: (typeof WA.summarizer.cursorOf === 'function') ? WA.summarizer.cursorOf() : null
                });
              } catch (e) { return null; } })() : null,
              pmem: (WA.pmem && WA.pmem.stat) ? (function () { try { return WA.pmem.stat(); } catch (e) { return null; } })() : null,
              memory: (WA.memory && WA.memory.claimStat) ? (function () { try { return WA.memory.claimStat(); } catch (e) { return null; } })() : null,
              opinion: (WA.opinion && WA.opinion.claimStat) ? (function () { try { return WA.opinion.claimStat(); } catch (e) { return null; } })() : null,
              profile: (WA.profile && WA.profile.stat) ? (function () { try { return WA.profile.stat(); } catch (e) { return null; } })() : null
            },
            // v0.5.0: 多实例并发观测（写入者标识 / 冲突检出 / 现场 / 外部写入）
            concurrency: (WA.store.conflictStat && WA.store.externalWriteStat) ? (function () {
              try {
                return {
                  conflict: WA.store.conflictStat(),
                  external: WA.store.externalWriteStat(),
                  sites: WA.store.listConflicts ? WA.store.listConflicts() : [],
                  lastConflict: WA.store.lastConflict ? WA.store.lastConflict() : null
                };
              } catch (e) { return null; }
            })() : null,
            sizeProfile: prof,
            // v0.1.47: 诊断走自动续扫编排（消费方不必手写 cursor 循环）
            sizeAudit: WA.store.sizeAuditFull ? WA.store.sizeAuditFull({ minBytes: 512, chunkNodes: 800 }) : (WA.store.sizeAudit ? WA.store.sizeAudit({ minBytes: 512 }) : null),
      // v2.30.0: 韧性面自检——镜像回落/撤销栈/主动拉动三台账并入诊断包（消费方=诊断视图）
      mirrorStat: WA.store.mirrorStat ? WA.store.mirrorStat() : null,
      undoStat: WA.undo && WA.undo.stat ? WA.undo.stat() : null,
      mirrorOwner: WA.chatcache && WA.chatcache.mirrorOwner ? WA.chatcache.mirrorOwner() : null,
      proactiveStat: WA.proactive && WA.proactive.stat ? WA.proactive.stat() : null
          };
        }, null)
      };
    }, {});
  }

// v2.3.0: 默认值真源提供者——每个键返回「模块在磁盘无值时的实际默认值」。
  //   校验意义：loadSettings 内联默认值 与 登记表 def 是两处手写文本，任一改动漏同步都不可见。
  const DEFAULT_PROVIDERS = {
    // v2.3.0 块3: 随机事件通道配置（新增键必须同时登记提供者，否则 verifyDefaults
    //   会因「无提供者」跳过它 —— 新键在默认值漂移校验里静默无人守）
    'worldaxis_horizon_settings_v1': function () { return WA.horizon && WA.horizon.getSettings ? WA.horizon.getSettings() : undefined; },
    'worldaxis_evolution_settings_v1': function () { return WA.evolution && WA.evolution.getSettings ? WA.evolution.getSettings() : undefined; },
    'worldaxis_opinion_settings_v1': function () { return WA.opinion && WA.opinion.getSettings ? WA.opinion.getSettings() : undefined; },
    'worldaxis_regional_settings_v1': function () { return WA.regional && WA.regional.getSettings ? WA.regional.getSettings() : undefined; },
    'worldaxis_calendar_settings_v1': function () { return WA.calendar && WA.calendar.getSettings ? WA.calendar.getSettings() : undefined; },
    'worldaxis_backstage_settings_v1': function () { return WA.backstage && WA.backstage.getSettings ? WA.backstage.getSettings() : undefined; }
  };

  // ── 7. 缓存 / 工作流 / API 通道 / 加载器 ──
  function secRuntime() {
    return {
      // v2.13.0: 挤出侧（七面治理最后一面）——本仓库唯一「按设计丢数据」的路径。
      //   此前零出口：写侧/删侧/读侧/活性面都有台账，唯独挤出没有，于是
      //   「长局 200 轮后 NPC 只剩 48 个」在诊断包里完全不可见。
      //   这里透出「谁在丢、丢了多少、最近丢的是什么」，供 verdict 分级与面板展示。
      evict: safe(function () {
        if (!WA.evict || typeof WA.evict.evictStat !== 'function') return { error: 'core/evict.js 未加载（挤出侧无台账，破坏性丢弃将静默发生）' };
        const s = WA.evict.evictStat();
        return {
          evicts: s.evicts, evicted: s.evicted, evictNoops: s.evictNoops,
          evictFailed: s.evictFailed, failedBy: s.failedBy,
          sites: s.sites, activeSites: Object.keys(s.bySite || {}).length,
          bySite: s.bySite, lastEvict: s.lastEvict, lastFail: s.lastFail,
          lastDropped: s.lastDropped
        };
      }, {}),
      // v2.14.0: 随机源（第八面）——在此之前「本轮为什么是这个结果」不可复现：
      //   16 个产品文件裸调 Math.random，其中 5 处是**行为性决策**（进化骰决定成功/受挫/保持、
      //   风声消散骰、区域事件是否触发与抽中哪种、远景通道是否开火、记忆采样决定谁被挤出）。
      //   v2.13.0 刚让「丢的是谁」可见，但被丢的那个「谁」恰是随机挑中的——
      //   于是报表在两次运行间不可比，「我修好了吗」在原理上无法回答。
      //   这里透出种子来源（explicit 才算可复现）、逐通道抽数与非法参数归因。
      rand: safe(function () {
        if (!WA.rand || typeof WA.rand.randStat !== 'function') return { error: 'core/rand.js 未加载（随机源无台账，同种子不可复现）' };
        const s = WA.rand.randStat();
        return {
          seedSource: s.seedSource, reproducible: s.reproducible,
          draws: s.draws, ids: s.ids, reseeds: s.reseeds,
          failed: s.failed, failedBy: s.failedBy,
          channels: s.channels, byChannel: s.byChannel, channelNames: s.channelNames,
          lastChannel: s.lastChannel, lastAt: s.lastAt
        };
      }, {}),
      // v2.15.0: 时间源（第九面）——随机源收口之后，可复现性只完成了**一半**：
      //   第二个输入（时间）在此前一格未管，全库 165 处裸调 `Date.now()`（40 个产品文件），
      //   其中好几处不是「记个时间戳好看」而是在**判定与写入**——`idleMs > maxIdleMs` 决定
      //   哪些键被当过数据清理掉、`meta.updatedAt`/记忆摘要的 `t`/伏笔的 `at`/快照 id 与 `at`
      //   全部直接落盘。于是 v2.14.0 的复现结论是半张的：同样的种子，只要跑的时刻不同
      //   （甚至只差一毫秒），存档就不再逐字节相同。
      //   这里透出「两个数」而不是一个：决策读取（进存档/参与判定）与测量读取
      //   （耗时台账/渲染展示，不受冻结影响）必须分列——混在一起会让「耗时统计还在不在」不可判。
      clock: safe(function () {
        if (!WA.clock || typeof WA.clock.clockStat !== 'function') return { error: 'core/clock.js 未加载（时间源无台账，存档时间戳不可复现）' };
        const s = WA.clock.clockStat();
        return {
          frozen: s.frozen, reproducible: s.reproducible,
          virtualAt: s.virtualAt, drift: s.drift,
          nowCalls: s.nowCalls, wallCalls: s.wallCalls,
          freezes: s.freezes, unfreezes: s.unfreezes, advances: s.advances,
          // v2.15.0（探针自纠）: failed/failedBy 必须一并透出——首版漏了这两个字段，
          //   而 verdict 的 error 分支判据正是 `ck.failed > 0`。漏透出的后果不是「少一行显示」：
          //   非法冻结时刻在诊断包里**恒不可见**，verdict 只会落到 info 分支说「未冻结」，
          //   于是「我以为冻结了，其实没有」这件事永远不会被报出来——正是本版要消灭的那类失败。
          //   这正是「声明面空转」的变体：台账记了，但出口没接上，消费端看不见。
          failed: s.failed, failedBy: s.failedBy,
          sites: s.sites, bySite: s.bySite, siteNames: s.siteNames,
          lastSite: s.lastSite, lastAt: s.lastAt, lastWallAt: s.lastWallAt,
          frozenFrom: s.frozenFrom
        };
      }, {}),
      chatcache: safe(function () {
        if (!WA.chatcache || !WA.chatcache.listSnapshots) return { error: 'chatcache 不可用' };
        const snaps = WA.chatcache.listSnapshots() || [];
        // v2.7.0: 存档安装写盘台账——跨设备恢复此前只有「恢复完成」这一个信号，
        //   装配失败时用户看到的是成功而磁盘上还是旧状态（下次刷新进度整段回退）。
        const inst = WA.chatcache.installStat ? WA.chatcache.installStat() : null;
        return { count: snaps.length, install: inst,
          latest: snaps.length ? { id: snaps[0].id, name: snaps[0].name, auto: !!snaps[0].auto, round: snaps[0].round } : null };
      }, {}),
        // v2.2.0: 设置键登记表与孤儿候选（此前 registry/pendingOrphan 全库零消费）
        settingsBus: safe(function () {
          if (!WA.settingsBus) return { error: 'settingsBus 不可用' };
          const st = WA.settingsBus.registryStat ? WA.settingsBus.registryStat() : null;
          const orphans = WA.store && WA.store.orphanSettingsKeys ? WA.store.orphanSettingsKeys() : [];
          // v2.3.0: 登记表自洽性 + 默认值单一真源漂移（两者此前都无从观测）
          const coherent = WA.settingsBus.selfCheck ? WA.settingsBus.selfCheck() : null;
          const drift = WA.settingsBus.verifyDefaults ? WA.settingsBus.verifyDefaults({ providers: DEFAULT_PROVIDERS }) : null;
          const dormant = WA.settingsBus.dormantGhosts ? WA.settingsBus.dormantGhosts() : [];
          // v2.4.0: 子键缺口盘点——「整键在、子键缺」此前完全没有出口：
          //   它不像 JSON 损坏那样留痕，只是让消费端拿到 undefined 后静默改变行为。
          const subkeys = WA.settingsBus.subkeyAudit ? WA.settingsBus.subkeyAudit() : null;
          // v2.5.0: 键的生命周期——「结构迁移能力是否被行使」「幽灵设置键有几个」。
          //   此前 registry 有 migrate 字段却零调用、rawRevive 根本不存在，
          //   而治理层看不到这种空转；未登记键更是登记表与清理规则都不覆盖的责任真空。
          const lifecycle = (WA.settingsBus.registryStat && WA.settingsBus.selfCheck)
            ? (WA.settingsBus.selfCheck().lifecycle || null) : null;
          const mig = WA.settingsBus.migrationStat ? WA.settingsBus.migrationStat() : null;
          const ghosts = WA.settingsBus.ghostScan ? WA.settingsBus.ghostScan() : null;
          // v2.6.0: 写入侧台账——此前「保存了却没生效」在诊断包里与「功能没实现」不可区分：
          //   save() 返回 false 却零记录、零日志，调用方零检查。写失败必须与读侧计量同等可见。
          const writes = WA.settingsBus.writeStat ? WA.settingsBus.writeStat() : null;
          // v2.9.0: 删除侧台账——写入侧自 v2.6.0/v2.7.0 收口后已有 writes/verifyFailed 两条口径，
          //   而**删除侧零计量**：删成功没计数、删失败没归因、删完没复核（全库 13 处裸 removeItem）。
          //   删除是破坏性操作，它不可观测比写入不可观测更危险——「已清理 N 项」可能是假的。
          const removes = WA.settingsBus.removeStat ? WA.settingsBus.removeStat() : null;
          // v2.10.0: 读侧台账——写入侧自 v2.6.0（writes）/ v2.7.0（verifyFailed）有两条口径，
          //   删除侧自 v2.9.0（removes/removeVerified）有一条，**读侧零归因**：全库只有一个
          //   `stats.failures` 单桶，且实测产品侧零消费。于是「用户配置读坏了、回落成默认值」
          //   与「用户从没配过」在诊断包里长得一模一样——而前者是唯一会被用户当成
          //   「我的设置被程序改回去了」的故障，也是本仓库里后果最严重的静默失效。
          const reads = WA.settingsBus.readStat ? WA.settingsBus.readStat() : null;
          // v2.400.0（V22 OPV22-7）: 设置面**总账**——此前没有任何读口回答
          //   「一共几个设置面、几个出厂默认就是关着的」。
          //   与 registryStat 的区别（不是重复读口）：registryStat 数的是**登记表行**，
          //   faces 数的是**设置面**并按 enabled 缺省=true 折算出厂默认分布，且单独报重复 key
          //   （同一 key 被两个模块登记 = 双真源，必然有一方读到别人的值）。
          //   「玩家以为开着、其实是关的」这类投诉此前在诊断包里无从判定，这一节就是判据。
          const faces = WA.settingsBus.faces ? WA.settingsBus.faces() : null;
          // v2.10.0（逆向审计自纠）: `readEx`（带来源的结构化读取）若只导出不给消费端，
          //   就是本版命题所治的「声明面空转」——一个没人用的出口等于没有。此处做**真实抽查**：
          //   对登记表里有磁盘值的若干键走 readEx，回答「诊断包里我看到的配置是不是用户配的」。
          //   只抽查有磁盘值的键（无值时回落默认值是正常语义，不该报「没读到」），且限量 8 个
          //   （热路径成本可控，且 read 本身幂等——迁移/盖章只做一次）。
          const spot = (function () {
            if (typeof WA.settingsBus.readEx !== 'function') return null;
            const ls = (WA.mainWin || window).localStorage;
            const rows = (WA.__settingsRegs || []).filter(function (r) {
              if (!r || !r.key || r.orphan) return false;
              // v2.11.0: 本行是「列目录」性质（决定哪些键进入抽查范围），读失败此前静默
              //   返回 false ⇒ 该键被排除在抽查之外，抽查结论「checked 个键全部命中」的
              //   覆盖面悄悄缩小。归因后「有键没进抽查」这件事在台账里可见。
              try { return ls.getItem(r.key) !== null; }
              catch (e) {
                try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('readSpotCheck', r.key, e); } catch (e2) {}
                return false;
              }
            }).slice(0, 8);
            const misses = [];
            rows.forEach(function (r) {
              try {
                const ex = WA.settingsBus.readEx(r);
                if (!ex.ok) misses.push({ key: r.key, source: ex.source, reason: ex.reason });
              } catch (e) { /* 抽查失败不影响其余诊断 */ }
            });
            return { checked: rows.length, misses: misses };
          })();
          return { registry: st, orphans: orphans, stats: WA.settingsBus.stats,
            coherent: coherent, defaultDrift: drift, dormant: dormant, subkeys: subkeys,
            lifecycle: lifecycle, migrations: mig, ghosts: ghosts, writes: writes, removes: removes,
            reads: reads, readSpotCheck: spot,
            // v2.400.0（V22 OPV22-7）：设置面总账（设置面数 / 出厂默认分布 / 重复 key）。
            faces: faces,
            // v2.11.0: 结构指纹状态（面B 的读侧消费口）——与读失败台账并列，
            //   才可判定「配置读到了，但它可能是另一个结构版本写的」。
            schema: (reads && reads.schema) ? reads.schema : null };
        }, {}),
        // v2.4.0: 可见性配置健康度——「源在 SOURCES 里却没有默认值声明」是子键级死配置
        visibility: safe(function () {
          if (!WA.render || typeof WA.render.visibilityStat !== 'function') return { error: 'render.visibilityStat 不可用' };
          return WA.render.visibilityStat();
        }, {}),
        // v2.4.0: 采样配置回落留痕（配置不可解析时读到的值从哪来）
        samplerCfg: safe(function () {
          if (!WA.memorySampler || typeof WA.memorySampler.samplerCfgStat !== 'function') return { error: 'memorySampler.samplerCfgStat 不可用' };
          return WA.memorySampler.samplerCfgStat();
        }, {}),
        // v2.3.0 块3: 随机事件通道运行视图（此前「通道关了」与「掷了没中」不可区分）
        horizon: safe(function () {
          if (!WA.horizon || typeof WA.horizon.stat !== 'function') return { error: 'horizon 不可用' };
          const st = WA.horizon.stat();
          // v2.64.0: rolls 与 skipped 从此互斥（前者只数真掷），并透出「为什么没触发」的分类。
          return { enabled: st.enabled, config: st.config, rolls: st.rolls,
            distantFired: st.distantFired, nearFired: st.nearFired, skipped: st.skipped,
            reasons: st.reasons || {}, reasonKinds: st.reasonKinds || [],
            lastReason: st.lastReason || null };
        }, {}),
        // v2.2.0: 隔离处置史与存档迁移报告（此前 quarantineAudit/migrateReport 零消费）
        quarantineAudit: safe(function () { return WA.store && WA.store.quarantineAudit ? WA.store.quarantineAudit() : null; }, null),
        migrateReport: safe(function () { return WA.store && WA.store.migrateReport ? WA.store.migrateReport() : null; }, null),
        // v2.2.0: 推演入账计量（事件链是否真的进 state —— 此前 events_create 被整条丢弃）
        backstage: safe(function () {
          if (!WA.backstage || !WA.backstage.applyStat) return { error: 'backstage 不可用' };
          // v2.11.0: 运行态接线——`isRunning` / `pending` 此前零调用，于是「推演卡住了」这件事
          //   在诊断包里完全不可见（用户看到的是界面不动，而唯一能回答「它还在跑吗、有没有
          //   排队堆积」的出口没人用）。本项只读，不触发任何推演。
          const __runState = (typeof WA.backstage.isRunning === 'function') ? WA.backstage.isRunning() : null;
          const __pend0 = (typeof WA.backstage.pending === 'function') ? WA.backstage.pending() : null;
          const st = WA.backstage.applyStat();
          const evs = (WA.store && WA.store.read) ? (WA.store.read('evolution.events', []) || []) : [];
          return { apply: st, eventsInState: evs.length, fromBackstage: evs.filter(function (e) { return e && e.source === 'backstage'; }).length,
            running: __runState, pending: __pend0 ? { reason: __pend0.reason || null, anchorIdx: (__pend0.anchor && __pend0.anchor.idx != null) ? __pend0.anchor.idx : null } : null };
        }, {}),
        // v2.11.0: 开关状态接线——`proactive.isEnabled` / `wbInject.isEnabled` 此前全库零调用。
        //   两者都会让**功能整体不注入**（主动拉动约束 / 世界书条目镜像）而界面无任何提示：
        //   诊断必须能回答「它到底开没开」，否则「这轮没注入」永远查不出原因。
        switches: safe(function () {
          const out = {};
          out.proactive = (WA.proactive && typeof WA.proactive.isEnabled === 'function') ? WA.proactive.isEnabled() : null;
          out.wbInject = (WA.wbInject && typeof WA.wbInject.isEnabled === 'function') ? WA.wbInject.isEnabled() : null;
          // 世界书镜像的实际活跃量（与开关并列才可判定「开着但没生效」）
          out.wbActiveOrders = (WA.wbInject && typeof WA.wbInject.activeOrders === 'function') ? (WA.wbInject.activeOrders() || []).length : null;
          return out;
        }, {}),
        // v2.2.0: 人物档案覆盖率（人设写入链是否真的在用）
        actors: safe(function () {
          if (!WA.registry || !WA.registry.profileStat) return { error: 'registry 不可用' };
          return WA.registry.profileStat();
        }, {}),
        // v2.62.0：人物身份的持久面（路线图前置收口①）。
        //   与上面的 actors（档案覆盖率）互补：actor 说的是「写进去多少」，
        //   本节说的是「这些人**是谁**、长期状态挂在哪个键上」。
        //   关键读数是 stateWithoutId —— 「有履历却没有身份」的人，此前无从发现。
        identity: safe(function () {
          if (!WA.registry || typeof WA.registry.idStat !== 'function') return { error: 'registry 身份面不可用' };
          const st = WA.registry.idStat();
          const withoutId = st.stateWithoutId || [];
          return {
            chatId: st.chatId, bound: st.bound, persisted: st.persisted,
            slotCapacity: st.slotCapacity, slotUsed: st.slotUsed, beyondSlots: st.beyondSlots,
            slotsExhausted: st.slotsExhausted,
            // 身份 ↔ 存档键（people 容器）：由 registry 单一入口生成，不在此重拼
            worldKeys: st.worldKeys || {},
            stateWithoutId: withoutId, idWithoutState: st.idWithoutState || [],
            drifted: !!st.drifted,
            slotPurpose: (WA.registry.slotStat ? WA.registry.slotStat().purpose : '')
          };
        }, {}),
        // v0.1.40: 记忆巩固链路计时（L0→L1→L2→L3）
        memory: safe(function () {
          if (!WA.memory || !WA.memory.stats) return null;
          return WA.memory.stats();
        }, null),
      workflow: safe(function () {
        if (!WA.workflow) return { error: 'workflow 不可用' };
        const nodes = WA.workflow.list ? (WA.workflow.list() || []) : [];
        const byChain = {};
        nodes.forEach(function (nd) { const c = nd.chain || '?'; byChain[c] = (byChain[c] || 0) + 1; });
        const out = { nodeCount: nodes.length, byChain: byChain, disabled: nodes.filter(function (nd) { return nd.enabled === false; }).map(function (nd) { return nd.id; }) };
        // v0.1.23: 节点执行画像（最慢节点 + 报错节点 + 链耗时）
        if (WA.workflow.stats) {
          const st = WA.workflow.stats(5);
          out.slowest = st.nodes.map(function (r) { return { id: r.id, lastMs: r.lastMs, avgMs: r.avgMs, count: r.count, errors: r.errors, lastStatus: r.lastStatus }; });
          out.tracked = st.tracked;
          out.chains = st.lastChains;
        }
        // v0.1.42: 链运行历史（最近 5 次运行的逐节点耗时序列）
        if (WA.workflow.history) {
          const hh = WA.workflow.history(5);
          out.history = { tracked: hh.tracked, max: hh.max, runs: hh.runs };
        }
        return out;
      }, {}),
      apiRouter: safe(function () {
        if (!WA.apiRouter) return { error: 'apiRouter 不可用' };
        const list = WA.apiRouter.listChannels ? WA.apiRouter.listChannels() : [];
        return {
          concurrency: WA.apiRouter.getConcurrency ? WA.apiRouter.getConcurrency() : null,
          queue: WA.apiRouter.queueLength ? WA.apiRouter.queueLength() : null,
          // v0.1.41: 通道配置变更计量
          cfg: WA.apiRouter.cfgStat ? WA.apiRouter.cfgStat() : null,
          channels: list.map(function (c) {
            const e = c.effective || {};
            return { name: c.name, configured: !!(e.baseUrl && e.model), keyMasked: redact(e.apiKey), model: e.model || null };
          }),
          // v0.1.27: 通道调用台账（成功/失败归因/耗时）
          calls: (function () {
            if (!WA.apiRouter.callStats) return null;
            const st = WA.apiRouter.callStats(6);
            return { tracked: st.tracked, channels: st.channels };
          })()
        };
      }, {}),
      // v0.1.20: CDN 加载器状态（已加载模块数、CDN 容灾命中的模块、失败源冷却）
      loader: safe(function () {
        if (!WA.loaderStatus) return { error: 'loaderStatus 不可用' };
        const st = WA.loaderStatus();
        return {
          loadedCount: (st.loaded || []).length,
          cdnFallbacks: (st.loaded || []).filter(function (x) { return x && x.fallback; }).map(function (x) { return { rel: x.rel, fallback: x.fallback }; }),
          cdnCooldowns: (st.cdnFailures || []).map(function (x) { return { base: x[0], failedAt: x[1] }; }),
          failedModules: (st.failedModules || []).map(function (x) { return { rel: x.rel, at: x.at, sourcesTried: x.sourcesTried }; }),
          failedCount: (st.failedModules || []).length
        };
      }, {})
    };
  }

  // ── 8. UI 绑定一致性（渲染出的控件 id ↔ 绑定代码引用的 id） ─
  // v2.2.0 块8：守卫分层——
  //   ids    ：无条件渲染的控件（面板/页面打开即在场；缺失 = 真断裂）
  //   cond   ：条件渲染的控件（依赖状态，如「有活跃事件才渲染中止按钮」；缺失不必然是缺陷）
  //   dynamic：由 JS 动态生成的节点集合，按其容器/模板锚点守（容器缺失才是断裂）
  function secOperations() {
    var op = WA.operations;
    if (!op) return { error: 'operations 模块未装载', closedLoop: false };
    var d = op.diagnose();
    return { module: 'operations', loaded: true, closedLoop: d.closedLoop,
      checks: d.checks, version: d.version };
  }
  /**
   * v2.194.0（U2）：跨模块原子提交链的读数（core/commit.js 的链面）。
   *   链是**进程态编排**（不开开关、不进注册表），它的读数只在进程里有 —— 因此更需要一个
   *   当着人面把它答出来的地方：跑过几条链、提交/中止各几笔、哪几个失败码被触发过、
   *   此刻有没有链开着、以及本面**按什么口径算、哪几条边界是硬编码的**（自证）。
   *   v2.195.0（U2 批次⑤）：本节再接上 `effect` / `pending` 两个新读面（同上口径 ——
   *   「跨层副作用做没做到」必须在产品面上答得出来，不能只活在专锁里）。
   *   为什么必须有它：`chainStat` / `chainSelfCheck` 这两个读面此前**只有测试在调**，
   *   生导出冻结门禁当场报「新增死导出 [test-only]」。诊断面是它们的产品消费者 ——
   *   与本仓 playtime 的取用表同一条纪律：只导出不消费，等于没交付。
   */
  function secCommit() {
    return safe(function () {
      // 直呼 `WA.commit.xxx`（**不**起局部别名）：生导出冻结门禁按字面计数「谁在引用这个出口」，
      //   别名会被读成「产品代码零引用」——那样这两个读面就永远停在 test-only，等于没接消费方。
      if (!WA.commit || typeof WA.commit.chainStat !== 'function') return { error: 'core/commit.js 未装载（链读数缺席）' };
      const st = WA.commit.chainStat();
      const sc = (typeof WA.commit.chainSelfCheck === 'function') ? WA.commit.chainSelfCheck() : { ok: false, failed: ['chainSelfCheck'] };
      return {
        chains: st.chains, commits: st.commits, aborts: st.aborts, failed: st.failed,
        replayed: st.replayed, capped: st.capped, overLimit: st.overLimit, leaks: st.leaks,
        open: st.open, limit: st.limit,
        lastReason: st.lastReason, lastAt: st.lastAt,
        faultCodes: (st.faultCodes || []).slice(),
        faults: Object.assign({}, st.faults || {}),
        selfCheckOk: !!sc.ok, selfCheckFailed: (sc.failed || []).slice(),
        active: (typeof WA.commit.active === 'function') ? WA.commit.active() : null,
        // v2.195.0（U2 批次⑤）：跨层副作用面 —— 「世界装成了」与「世界装成的前提做到没有」
        //   在这里分开报。`pending()` 里那几条是**已经做过、但链没提交**的（如实列出，不自动重做：
        //   机制开关是全局的，自动重做等于把一个聊天的配置写到所有聊天上）。
        effects: (function () {
          if (typeof WA.commit.pending !== 'function') return null;
          const p = WA.commit.pending();
          return { pending: p.count, cap: p.cap, items: (p.items || []).slice(0, 8) };
        }()),
        // v2.212.0(优化 Q3):中断与跨层恢复面。与上面 effects 节**分列不合并** ——
        //   一个答「本进程里还有什么没提交」,一个答「**上一轮(含刷新前)**中断时做过什么、
        //   断在哪一层、能不能恢复」。后者是本版之前根本不存在的那一格(进程态重装即归零)。
        resume: (function () {
          if (typeof WA.commit.resumeStat !== 'function') return null;
          const r = WA.commit.resumeStat();
          return {
            rows: r.rows, resumable: r.resumable, foreign: r.foreign, cap: r.cap,
            persisted: r.persisted, lastReason: r.lastReason,
            // 逐条只列**可恢复**的那些:外来行(别的 chat/分支)只进计数,不在这里铺开 ——
            //   它们不属于当前现场,铺开等于把「别处的一段配置」摆到本现场的台面上。
            items: (function () {
              if (typeof WA.commit.scanInterrupted !== 'function') return [];
              try {
                const sc = WA.commit.scanInterrupted({});
                return (sc.rows || []).slice(0, 8).map(function (x) {
                  return { opId: x.opId, site: x.site, reason: x.reason,
                    steps: (x.steps || []).slice(-3), effects: (x.effects || []).slice(0, 4) };
                });
              } catch (e) { return []; }
            }()),
            identity: (typeof WA.commit.resumeIdentity === 'function') ? WA.commit.resumeIdentity() : null
          };
        }())
      };
    }, { error: 'commit 节采集失败' });
  }
  // v2.47.0 注记：「注入项去向」区块**不引入控件**（纯只读文本渲染，无 input/button），
  //   故上面 inject 组 id 不变。此处明写，以免后续把这版 UI 面误判成「漏登记」。
  function secUi() {
    return safe(function () {
      const doc = (WA.mainDoc || (mainWin && mainWin.document)) || null;
      if (!doc || !doc.getElementById) return { note: '无 document 可查（非浏览器环境），UI 项跳过' };
      // 面板一次只渲染「当前页」——非当前页的控件必然不在 DOM（这是渲染模型，不是缺陷）。
      // 不做该区分的话，除当前页外全组误报 missing（历史上守卫只覆盖 tools 页正是此因）。
      const cur = (WA.ui && typeof WA.ui.currentPage === 'function') ? WA.ui.currentPage() : null;
      const out = UI_BINDINGS.map(function (grp) {
        const active = !cur || grp.page === cur;   // 无页面信息（未挂载）时按全量检查
        const miss = function (id) { return !doc.getElementById(id); };
        const missing = grp.ids.filter(miss);
        // 条件渲染：依赖态，缺失只记不判失败（否则静态检查必然误报）
        const condMissing = (grp.cond || []).filter(miss);
        // 动态生成：只在容器在场时校验（容器不在 ⇒ 该域未展开，不算断裂）
        const dynMissing = (grp.dynamic || []).filter(miss);
        // v2.381.0 收口：**渲染面互斥**的第三层——「只在玩家分支里才有的控件」。
        //   病灶（本版实测）：`ui/settings.js` 自 v2.325.0「界面简化动线」起有两个互斥分支
        //   （`playerSettingsHtml()` / `devSettingsHtml()`），而 UI_BINDINGS 的 settings 组
        //   把两个分支的 id 混装在同一份 `ids` 里。于是**任何单一模式下都会有一撮必缺**：
        //     · 开发者模式：[wa-set-devmode, wa-set-simple-mode, wa-set-simple-save] 缺
        //       （这三枚只由玩家分支拼出——玩家分支出厂就渲染，它是玩家的「出口」）
        //     · 玩家模式：其余两百枚缺（它们只由开发者分支拼出）
        //   而 `ids` 的语义必须保持「在本页它就该在」——那是这条门禁的全部力量所在。
        //   故新增 `player` 层：登记「只由玩家分支渲染」的控件。校验规则与 cond 同形
        //   （缺失只记不判失败，因为另一个分支下它们**本来就不该存在**），
        //   但**用独立读数报出**，避免与「依赖态缺失」混在一起说不清是哪种局面。
        //   反向判据仍在 tests/run.js 的「玩家模式下设置页只出玩家面」那一条上：
        //   那条钉的是「玩家面不泄漏开发者控件」，与本层不重复。
        const playerMissing = (grp.player || []).filter(miss);
        return {
          page: grp.page, active: active,
          expected: grp.ids.length, missing: missing, ok: !active || missing.length === 0,
          condExpected: (grp.cond || []).length, condMissing: condMissing,
          dynamicExpected: (grp.dynamic || []).length, dynamicMissing: dynMissing,
          playerExpected: (grp.player || []).length, playerMissing: playerMissing
        };
      });
      const activeGroups = out.filter(function (g) { return g.active; });
      return {
        groups: out, currentPage: cur,
        allOk: activeGroups.every(function (g) { return g.ok; }),
        // 全量口径：只统计当前页（其余页不在 DOM，无法校验）
        totalExpected: activeGroups.reduce(function (a, g) { return a + g.expected; }, 0),
        totalMissing: activeGroups.reduce(function (a, g) { return a + g.missing.length; }, 0),
        totalGroups: out.length
      };
    }, {});
  }

  // ── 9. 能力清单（三件套/编辑器/自检 API 是否齐全） ─
  function secCapabilities() {
    const caps = [
      { key: 'editorFaction', api: ['add', 'update', 'remove', 'shiftRelation', 'reputationPressure'], label: '势力编辑器' },
      { key: 'editorEvents', api: ['add', 'update', 'shiftStage', 'stats', 'isTerminal'], label: '事件链编辑器' },
      { key: 'inspectorState', api: ['inspect', 'flatten', 'summaryText'], label: '状态检查器' },
      { key: 'toolSnapshot', api: ['buildPayload', 'toJSON', 'validate', 'restore'], label: '快照导出/恢复' },
      { key: 'toolAnalyzer', api: ['analyze', 'summaryText', 'pressureOf'], label: '态势分析器' },
      { key: 'toolImport', api: ['detect', 'preview', 'importData'], label: '外部导入器' },
      { key: 'injectInspector', api: ['init', 'getLastSnapshot', 'statusText'], label: '注入自检' },
      { key: 'pmem', api: ['applyPersonalMemory', 'recall', 'knows', 'buildBlock'], label: '人物主观记忆' },
      { key: 'injectBudget', api: ['plan', 'apply', 'trim', 'summaryText'], label: '注入预算裁判' },
      // v2.50.0（第三十五面）：三账能力面——缺任一项即为断裂（能力清单是「装上了没」的证据）
      { key: 'hostWbTrace', api: ['stat', 'crossCheck', 'stateText'], label: '宿主世界书激活账' },
      { key: 'floorChanges', api: ['plan', 'sweep', 'guardReconcile', 'stateText'], label: '楼层变更联动账' },
      { key: 'ledgerTimeline', api: ['note', 'siteStat', 'stat', 'probeDefault'], label: '台账时间轴' },
      { key: 'toolDiag', api: ['collect', 'verdict', 'toJSON', 'summaryText', 'flatten'], label: '自检诊断包' }
    ];
    return caps.map(function (c) {
      const mod = WA[c.key];
      if (!mod) return { label: c.label, key: c.key, ok: false, reason: '模块未加载' };
      const lack = c.api.filter(function (m) { return typeof mod[m] !== 'function'; });
      return { label: c.label, key: c.key, ok: lack.length === 0, missingApi: lack };
    });
  }

  // ── 9b. v2.2.0: 宿主兼容层激活态（MVU / TavernHelper 桥接） ──
  //   背景：compatMvu.status / compatTH.status 自 v2.0.0 定义起注释写着「供巡视/诊断消费」，
  //        但全库零消费——兼容层是活是死、为什么没激活，从未出现在任何报告里。
  //   「已加载但未激活」与「加载都没加载」必须可区分：前者是环境（宿主没开 MVU），后者是故障。
  function secCompat() {
    return safe(function () {
      const out = { mvuLoaded: !!(WA.compatMvu && typeof WA.compatMvu.status === 'function'), thLoaded: !!(WA.compatTH && typeof WA.compatTH.status === 'function') };
      if (out.mvuLoaded) {
        const m = WA.compatMvu.status();
        out.mvu = { active: !!m.active, reason: m.lastReason, syncCount: m.syncCount, lastSyncAt: m.lastSyncAt, failed: String(m.lastReason || '').indexOf('error:') === 0 };
      } else out.mvu = { error: 'compat/mvu.js 未加载或 status 缺失（兼容层成死代码）' };
      if (out.thLoaded) {
        const t = WA.compatTH.status();
        out.th = { active: !!t.active, reason: t.lastReason, exposedAt: t.exposedAt, isTH: !!t.isTH, failed: String(t.lastReason || '').indexOf('error:') === 0 };
      } else out.th = { error: 'compat/th-helper.js 未加载或 status 缺失（兼容层成死代码）' };
      return out;
    }, {});
  }

  // ── 10. v0.1.19: 宿主能力探测（compat/host 的结构化输出接入诊断） ──
  function secHost() {
    return safe(function () {
      if (!WA.compat || !WA.compat.snapshot) return { error: 'compat/host 模块不可用' };
      const s = WA.compat.snapshot();
      return {
        sillyTavern: s.sillyTavern, eventSource: s.eventSource, appReady: s.appReady,
        generation: s.generation, chatChanged: s.chatChanged, extensionPrompt: s.extensionPrompt,
        tavernHelper: s.tavernHelper, variables: s.variables, worldbook: s.worldbook,
        probedAt: s.at
      };
    }, {});
  }
  // ── 11. v0.1.19: 撤销台账（谁在什么时候撤了什么） ──
  function secUninjectLedger() {
    return safe(function () {
      if (!WA.render || !WA.render.injectionLedger) return { error: 'render.injectionLedger 不可用' };
      return WA.render.injectionLedger();
    }, {});
  }
  // ── 13. v0.1.28: 事件总线健康（监听器数 / 异常计数 / 死信号 / 泄漏嫌疑） ──
  function secBus() {
    return safe(function () {
      if (!WA.busStats) return { error: '事件总线统计不可用（interceptor 未加载）' };
      const st = WA.busStats(20);
      const failing = st.events.filter(function (r) { return r.errors > 0; });
      const dead = st.events.filter(function (r) { return r.dead > 0; });
      const leaking = st.events.filter(function (r) { return r.leakSuspect; });
      return {
        totalListeners: st.totalListeners, tracked: st.tracked,
        failing: failing.map(function (r) { return { event: r.event, errors: r.errors, lastError: r.lastError }; }),
        deadSignals: dead.map(function (r) { return { event: r.event, dead: r.dead }; }),
        leakSuspects: leaking.map(function (r) { return { event: r.event, listeners: r.listeners }; }),
        top: st.events.slice(0, 6).map(function (r) { return { event: r.event, listeners: r.listeners, emits: r.emits, errors: r.errors }; })
      };
    }, {});
  }
  // ── 12. v0.1.21: wb 变量镜像通道（配置 + 活跃 order 清单） ──
  function secWbChannel() {
    return safe(function () {
      if (!WA.wbInject) return { error: 'wbInject 模块不可用' };
      const cfg = WA.wbInject.getConfig ? WA.wbInject.getConfig() : null;
      const orders = WA.wbInject.activeOrders ? WA.wbInject.activeOrders() : [];
      return {
        enabled: cfg ? cfg.enabled : null,
        worldbookName: cfg ? (cfg.worldbookName || '(auto)') : null,
        autoEnsure: cfg ? cfg.autoEnsure : null,
        companionName: safe(function () { return WA.wbInject.findCompanionName(); }, null),
        activeOrders: orders,
        activeOrderCount: orders.length,
        totalChars: orders.reduce(function (a, x) { return a + (x.chars || 0); }, 0)
      };
    }, {});
  }
  // ── 13. v2.551.0: 世界书写回队列（按书串行 + 积压/失败读数）──
  //   为什么诊断要看它：本仓的世界书写回是「读整本 → 改一条 → 写整本」，三个写入口
  //   （outline-inject.apply / .undo 的 flip / wb-inject.ensureEntry）在 v2.551.0 起排同一条
  //   `wb:<书名>` 队列。它失败时**不会抛给用户**（队列必须继续），只记 lastError ——
  //   也就是说「写失败了」这件事只活在这里。诊断面不读它，就等于这条链没有读数。
  //   分级：failed > 0 ⇒ 上游会再看到一次「条目没落地」，但原因只在 lastError 里。
  function secWriteSerial() {
    return safe(function () {
      if (!WA.writeSerial || typeof WA.writeSerial.serials !== 'function') {
        return { error: 'engines/write-serial.js 未加载（世界书写回没有串行队列）' };
      }
      const list = WA.writeSerial.serials() || [];
      let pending = 0, failed = 0;
      let lastError = null;
      list.forEach(function (q) {
        pending += (q.pending || 0);
        failed += (q.failed || 0);
        if (q.lastError && (!lastError || String(q.lastError.at) > String(lastError.at))) {
          lastError = { queue: q.name, at: q.lastError.at, message: q.lastError.message };
        }
      });
      return {
        queues: list.map(function (q) {
          return { name: q.name, pending: q.pending, done: q.done, failed: q.failed };
        }),
        queueCount: list.length,
        pendingTotal: pending,
        failedTotal: failed,
        lastError: lastError
      };
    }, {});
  }
  // ── 14. v2.16.0: 对外只读互操作桥（worldaxis_bridge_v1）──
  //   为什么诊断要看它：本仓库此前**没有任何对外接口**，「世界状态有没有被外部读走」既不可见
  //   也不可归因——外部问得太早（store 未就绪）、宿主没挂上、ctx 下挂载点被删，四种处境在
  //   外部侧看过去完全一样（都是「读不到」）。本块把「拉了没有 / 被谁拉 / 拉不到为什么」摆出来。
  //   分级：桥未装载＝warn（外部集成整条断链，须查装载）；开闸但零发布＝warn（开着的开关没在干活）；
  //   发布失败/被拒＞0＝error（外部拿到 null 却不知道原因）；最近一次失效标签进 info 供排障。
  function secBridge() {
    return safe(function () {
      if (!WA.bridge || typeof WA.bridge.stat !== 'function') {
        return { error: 'engines/bridge.js 未加载（外部无法读取世界状态：另两个插件各说各话）' };
      }
      const s = WA.bridge.stat();
      const cfg = safe(function () { return WA.bridge.settings(); }, {});
      return {
        id: WA.bridge.id, version: WA.bridge.version, floorGap: WA.bridge.FLOOR_GAP,
        enabled: cfg ? cfg.enabled : null,
        includeHidden: cfg ? cfg.includeHidden : null,
        presumeUnknown: cfg ? cfg.presumeUnknown : null,
        mounted: s.mounted, published: s.published, publishedFloor: s.publishedFloor,
        invalidated: s.invalidated, subscribed: s.subscribed,
        ageMs: s.ageMs, snapshotBytes: s.snapshotBytes,
        refreshes: s.refreshes, publishes: s.publishes, invalidations: s.invalidations,
        debounced: s.debounced, refused: s.refused,
        externalReads: s.externalReads, failures: s.failures,
        lastReason: s.lastReason, lastInvalidateReason: s.lastInvalidateReason, byInvalidate: s.byInvalidate,
        lastRefusal: s.lastRefusal, lastFailure: s.lastFailure, floor: s.floor,
        // X8（v2.128.0）：**契约握手**读数。本节答「本桥活着没有」，本字段答「三条边
        //   （对外投影 / 上游快照 / 手机侧入站）的**契约**对不对得上」——
        //   「对端装了但契约版本不是这一版」此前与「对端没装」在读数上同形。
        //   纯读：不驱动对端（不调它的 refresh），缺席如实降级。
        handshake: safe(function () {
          const h = WA.bridge.handshake();
          return h ? { matched: h.matched, matchedCount: h.matchedCount, degraded: h.degraded, edges: h.edges, note: h.note } : null;
        }, null)
      };
    }, {});
  }
  // v2.97.0（X5）: 跨插件因果桥（**入站边**）——手机侧的动作有没有进到世界里来。
  //   为什么诊断要看它：v2.16.0 把**出站**边做出来了（本扩展的世界外供），本节管的是反向那条边。
  //   入站整条断链的后果比出站更隐蔽：手机侧一次「拉黑」在世界里没有任何痕迹，
  //   而 WorldAxis 侧的因果面照旧只有正文里冒出来的那些 cause —— 同一件事两边各说一遍，
  //   从世界状态里看不出「少了一笔」。故本节把「收了几笔 / 卡在哪一步 / 有没有接上链」摆出来。
  //   分级：模块未装载＝error（入站整条断链，手机侧的因永远进不来）；
  //   休眠但有上报＝warn（**那几笔操作已经丢了**——桥没开闸时上报不落盘，不是「以后会补上」）；
  //   有拒收（不认识的动作 / 缺 opId）＝warn（那正是「让外部决定本扩展因果词汇表」的前兆）；
  //   台账满＝warn（后续上报被拒收，须知道）；其余＝info。
  function secPhoneBridge() {
    return safe(function () {
      if (!WA.phoneBridge || typeof WA.phoneBridge.stat !== 'function') {
        return { error: 'engines/phone-bridge.js 未加载（手机侧的因进不来：同一件事两边各说一遍）' };
      }
      const s = WA.phoneBridge.stat();
      const cfg = safe(function () { return WA.phoneBridge.getSettings(); }, {});
      const p = safe(function () { return WA.phoneBridge.phaseOf(); }, {});
      return {
        id: WA.phoneBridge.id, version: WA.phoneBridge.version,
        acts: WA.phoneBridge.PHONE_ACTS, actLabels: WA.phoneBridge.ACT_LABEL, phases: WA.phoneBridge.PHASES,
        enabled: cfg ? cfg.enabled : null, linkCausal: cfg ? cfg.linkCausal : null, maxOps: s.maxOps,
        phase: p ? p.phase : null, phaseSinceMs: p ? p.sinceMs : null, phaseNote: p ? p.note : null,
        noted: s.noted, reused: s.reused, blocked: s.blocked,
        linked: s.linked, linkFails: s.linkFails,
        rows: s.rows, unlinked: s.unlinked, linkedRows: s.linked_rows,
        byAct: s.byAct, faults: s.faults,
        // 链 → 操作（traceOf）的诊断消费：计划判据是「evidence() 可把链回放到手机操作记录」，
        //   而「这条链的因在不在手机侧」必须在诊断面可答——否则一笔上报接上了链、
        //   接了哪条链，只有写它的那一方知道。
        traces: safe(function () {
          const v = WA.phoneBridge.opsView(40);
          const chains = [];
          (v.items || []).forEach(function (x) { if (x.chainId && chains.indexOf(x.chainId) < 0) chains.push(x.chainId); });
          return chains.slice(0, 5).map(function (cid) {
            const tr = WA.phoneBridge.traceOf(cid);
            return { chainId: cid, count: tr.count, acts: (tr.items || []).map(function (y) { return y.act; }) };
          });
        }, []),
        lastReason: s.lastReason, lastAct: s.lastAct, lastOpId: s.lastOpId
      };
    }, {});
  }
  // v2.17.0: 记忆桥消费面（另一个插件记的那本账，本扩展读不读得到）
  //   为什么要有这一节：v2.16.0 把本扩展的**出口**做出来了（外部能读到这个世界），
  //   但反向那条边一直是断的——全库 grep lonsha_memory_bridge_v1 的命中**全在注释与
  //   面板提示文本里**，产品代码零消费。于是「同一场剧情里，LonSha 记的那本账」
  //   在本扩展侧完全不可观测，两个「现在」对不上也没人知道。本节就是那个观测口。
  //   分级：未装载＝info（LonSha 没装是常见合法配置）；桥在但读不到＝info 且带归因
  //   （「对方还没就绪」与「对方坏了」必须分开——这正是 LonSha v3.174 的 sourceState 想解决的）；
  //   两钟不一致＝info（不是故障：正文校准的钟与推演钟本来就可能不同步，但它必须**可见**）。
  function secLonsha() {
    return safe(function () {
      if (!WA.lonshaReader || typeof WA.lonshaReader.readLonshaSnapshot !== 'function') {
        return { error: 'engines/lonsha-reader.js 未加载（读不到另一个插件记的那本账）' };
      }
      // 诊断是**旁观**：不强制对方重建快照（refresh:false），只看它此刻持有什么。
      //   强制重建会把「我这轮体检」变成「我顺手命令另一个插件干活」——诊断不该有副作用。
      // v2.87.0 B7：三插件职责分离（事实结算 / 证据读取 / 交互执行）。
      //   谁的活谁干：本扩展只做事实结算面，缺席方如实标注而非写死「已接入」。
      const separation = safe(function () { return WA.theme && WA.theme.separation ? WA.theme.separation() : null; }, null);
      const read = WA.lonshaReader.readLonshaSnapshot({ refresh: false });
      const src = read.source || safe(function () { return WA.lonshaReader.lonshaSource(WA.lonshaReader.LONSHA_BRIDGE_ID); }, {});
      const out = {
        mounted: !!src.mounted, ok: !!read.ok, reason: read.reason,
        separation: separation,
        sourceState: src.sourceState || null, lastError: src.lastError || null,
        describe: WA.lonshaReader.describeLonsha(read)
      };
      if (read.ok) {
        const sum = WA.lonshaReader.summarizeSnapshot(read.snapshot);
        const diff = WA.lonshaReader.diffWithLonsha(read.snapshot);
        out.floor = sum.floor; out.pluginVersion = sum.pluginVersion; out.contract = sum.contract;
        out.selfBytes = sum.selfBytes; out.strictJsonOk = sum.strictJsonOk;
        out.hasFieldTypes = sum.hasFieldTypes;
        out.absent = sum.absent; out.nullish = sum.nullish;
        out.verdict = diff.verdict; out.days = diff.days;
        out.worldDate = diff.worldDate; out.lonshaDate = diff.lonshaDate;
        // [v2.18.0] 反向消费面扩到**九本账**：此前本侧只读对方快照的 `clock` 一个字段，
        //   而对方外供的是八本账 + 一本对读读数。这里把账本画像、**上游键集自证**与三处对读面一并采出。
        //   全部只读、可归因；任何一处缺位都如实标 absent，不当成「空」。
        const lsum = WA.lonshaReader.ledgerSummary(read.snapshot);
        out.ledgers = { total: lsum.total, sections: lsum.sections, absent: lsum.absentList,
          echoPresent: lsum.echoPresent, echoExported: lsum.echoExported, entries: lsum.entries };
        const lb = WA.lonshaReader.ledgerBridges(read.snapshot);
        out.bridges = { echoKind: lb.echoKind, echoOk: lb.echoOk, echoReason: lb.echoReason,
          shape: lb.echoShape, notice: lb.echoNotice, items: lb.items };
        out.echoPresent = lsum.echoPresent;
        // 上游键集自证：`readKeys` 是本侧认的键，`missing` 是上游其实没给的（真缺陷），
        //   `unknown` 是上游给了、本侧还没消费的（漏读）。两者都上诊断面，不靠人肉核对。
        out.echoKeys = (function () {
          const sh = lb.echoShape || {};
          return { readKeys: sh.readKeys || [], present: !!sh.present,
            missing: sh.missing || [], unknown: sh.unknown || [] };
        })();
      }
      return out;
    }, {});
  }
  // ── v2.101.0（O11）：跨插件互操作验收面（三伙伴五态分列；纯读，不驱动对方重建） ──
  function secInterop() {
    return safe(function () {
      if (!WA.interop || typeof WA.interop.probeAll !== 'function') {
        return { error: 'engines/interop.js 未加载（跨插件面读数缺席）' };
      }
      // 诊断是**旁观**：probeAll 内部一律 refresh:false，不命令对方插件干活。
      const r = WA.interop.probeAll();
      return {
        partners: r.rows.map(function (x) {
          return { key: x.key, label: x.label, duty: x.duty, state: x.state, evidence: x.evidence, detail: x.detail };
        }),
        matrix: r.matrix, ready: r.ready, degraded: r.degraded, allReady: r.allReady,
        summary: WA.interop.summaryText(),
        // 协议冻结面与兼容矩阵：只报当前值，不做冻结动作
        bridges: WA.interop.freeze().bridges,
        compat: WA.interop.compatGaps(),
        stat: WA.interop.stat()
      };
    }, {});
  }

  // ── v2.102.0（A2/O12）：性能基线与分层增量（纯内存观测；本节目**不触发基准**） ──
  function secPerfTrace() {
    return safe(function () {
      if (!WA.perfTrace || typeof WA.perfTrace.stat !== 'function') {
        return { error: 'engines/perf-trace.js 未加载（性能面读数缺席）' };
      }
      // 诊断是**旁观**：只念已经发生过的读数。
      //   为什么不在这里跑 coldStart：跑一次会真调四个面的真源（注入/诊断/对位/快照）——
      //   「看一眼体检」不该等于「跑一轮全量」，那会把无头诊断变成有负载的操作。
      const st = WA.perfTrace.stat();
      const sp = WA.perfTrace.split();
      const cur = {};
      WA.perfTrace.LAYERS.forEach(function (L) {
        const c = WA.perfTrace.curve(L);
        cur[L] = { n: c.n, window: c.window, p50: c.p50, p95: c.p95, max: c.max, subTick: c.subTick, dropped: c.dropped };
      });
      return {
        stat: st, split: sp, layers: cur,
        // v2.102.0：**增量的现场**——世界步进与「上一轮增量各面被怎么处置」。
        //   注意这里**不调 partial()**：本节目是旁观（调一次会真跑四个面 = 把体检变成负载）。
        //   故只念 `stat()` 里已累计的读数 + 当前世界步进；谁要看本轮逐面处置，走面板「增量面」。
        incremental: { rev: st.rev, calls: st.partialCalls, reused: st.partialReused },
        historyCap: st.historyCap, fingerprintCap: st.fingerprintCap,
        classes: WA.perfTrace.CLASSES.map(function (c) {
          const d = WA.perfTrace.CLASS_DEF[c] || {};
          return { cls: c, repeats: d.repeats, budget: d.budget, approx: !!d.approx, note: d.note };
        }),
        dirty: WA.perfTrace.dirtyAll(),
        // v2.123.0 P4：**档位结构面**（`bandCompare` 的真消费方之一；此处只念结构）。
        //   传 `dryRun: true` 是本节目的纪律所要求的：诊断是**旁观**，看一眼体检
        //   不该等于跑一轮基准（四档真跑会真调四个面的真源）。故此处的读数是
        //   「有哪几档 / 每档几面 / 哪档可判 / 哪档只是估计」，**不含任何毫秒**——
        //   要 ms 走面板「档位面」按钮。
        band: WA.perfTrace.bandCompare({ dryRun: true }),
        summary: WA.perfTrace.summaryText(),
        note: '只报已发生过的读数（本节目不触发基准）；host/render 未上报即 declared:false；lowend 档为同机放大估计（真机读数须实机）'
      };
    }, {});
  }

  // ── v2.112.0：因果链追踪（只读旁观；不调 record/applyUndo） ──
  function secPlugin() {
    return safe(function () {
      if (!WA.plugin || typeof WA.plugin.stat !== 'function') {
        return { error: 'core/plugin.js 未加载（插件面读数缺席）' };
      }
      const st = WA.plugin.stat();
      const sb = (WA.sandbox && WA.sandbox.stat) ? WA.sandbox.stat() : null;
      return {
        plugins: st.plugins, fires: st.fires, blocked: st.blocked, hookThrow: st.hookThrow,
        lastReason: st.lastReason || '', lastHook: st.lastHook || '', lastPlugin: st.lastPlugin || '',
        sandbox: sb ? { runs: sb.runs, denied: sb.denied, timeouts: sb.timeouts, lastReason: sb.lastReason } : { error: 'sandbox-absent' },
        // v2.125.0（P7）：把「隔离了什么 / 没隔离什么」一并纳入诊断 —— 此前那三条边界
        //   只写在 core/sandbox.js 的注释里，诊断只报三个计数，读的人看不出「这不等于真隔离」。
        //   报告自身带当场探针（probes），故它与事实脱钩时**同一条读数**就现形。
        //   刻意**只读**这几个字段（不整段透传）：诊断是旁观者，不该让一份会随时间膨胀的
        //   结构整包进入诊断包体积。
        isolation: (function () {
          try {
            if (!WA.sandbox || typeof WA.sandbox.isolationReport !== 'function') return { error: 'report-absent' };
            const ir = WA.sandbox.isolationReport();
            const pr = ir.probes || {};
            return { isolated: ir.isolated.length, notIsolated: ir.notIsolated.length,
              probesOk: !!(pr.forbidProbe && pr.forbidProbe.blocked && pr.freezeProbe && pr.freezeProbe.frozen
                && pr.denyProbe && pr.denyProbe.reached) };
          } catch (e) { return { error: String((e && e.message) || e).slice(0, 80) }; }
        })(),
        note: '只报注册/触发/拦写计数（本节目不 register、不 fire）；isolation 三项是只读读数'
      };
    }, {});
  }

  function secChrono() {
    return safe(function () {
      if (!WA.chrono || typeof WA.chrono.stat !== 'function') {
        return { error: 'engines/chrono.js 未加载（因果链读数缺席）' };
      }
      const st = WA.chrono.stat();
      const staleN = (typeof WA.chrono.stale === 'function') ? (WA.chrono.stale() || []).length : 0;
      // v2.127.0（X2）：世界编年史读数。此前 `chronicle` 只有定义、全库零外部读者 ——
      //   而「这世界此前发生过什么、有几条被 hidden 挡在表外」正是本节的活。
      //   读不到就如实置 null（不拿 stat().records 冒充编年史行数：两者是两件事）。
      let chron = null;
      try {
        if (typeof WA.chrono.chronicle === 'function') {
          const cr = WA.chrono.chronicle({ limit: 12 });
          chron = { count: cr.count, total: cr.total, capped: cr.capped,
            hiddenCount: cr.hiddenCount, themes: cr.themes.length };
        }
      } catch (eCh) { chron = null; }
      return {
        enabled: !!(WA.chrono.getSettings && WA.chrono.getSettings().enabled),
        layers: st.layers, records: st.records, reverts: st.reverts, blocked: st.blocked,
        lastReason: st.lastReason || '', stale: staleN,
        faults: st.faults || {},
        chronicle: chron,
        note: '只报已登记变更与失准下游计数（本节目不写世界、不试演撤销）'
      };
    }, {});
  }

  /* ── v2.128.0（拓展计划 X3–X6）：四个「此前不可判定」面的只读读数 ──
   *   四节同规格：**只报读数、不写世界**（不 roll / 不 resolve / 不 approve / 不 identify），
   *   与 secCollab「不占角色、不重放、不裁决」同纪律 —— 诊断是旁观者。
   */
  function secRegion() {
    return safe(function () {
      if (!WA.region || typeof WA.region.statView !== 'function') {
        return { error: 'engines/region.js 未加载（远方传播面读数缺席）' };
      }
      const v = WA.region.statView();
      const st = WA.region.stat ? WA.region.stat() : {};
      // X3 的活：离线推进**动没动**。累计计数答不出「上一次推了多远」，
      //   故 `lastOffline` 是这一节的主读（first=true 表示只落了基准、还没结算过）。
      return {
        enabled: !!v.enabled, places: v.places, events: v.events,
        pending: v.pending, delivered: v.delivered, blocked: v.blocked,
        offlineRuns: st.offline || 0,
        offlineDelivered: st.offlineDelivered || 0,
        offlineOccurred: st.offlineOccurred || 0,
        offlineSkipped: st.offlineSkipped || 0,
        lastOffline: st.lastOffline || null,
        faults: st.faults || {},
        note: '只报登记过的远方与离线结算读数（本节目不 roll、不落地、不推进）'
      };
    }, {});
  }
  function secProbe() {
    return safe(function () {
      if (!WA.probe || typeof WA.probe.statView !== 'function') {
        return { error: 'engines/probe.js 未加载（调查卷宗读数缺席）' };
      }
      const v = WA.probe.statView();
      // X4 的活：卷宗读得出来，但「两条并排线索互相打脸时该采信谁」此前无口可问。
      //   本节报**裁决面的存在与边界**（等级表 + 定案仍只走 decide），不替任何卷宗定案。
      return {
        enabled: !!v.enabled, cases: v.cases, open: v.open,
        evidence: v.evidence, wrongs: v.wrongs, byVerdict: v.byVerdict,
        levels: (WA.probe.LEVELS || []).slice(),
        hasResolve: typeof WA.probe.resolve === 'function',
        hasAudit: typeof WA.probe.auditRecord === 'function',
        note: '只报卷宗计数与裁决面能力（本节目不举证、不对质、不定案、不裁决）'
      };
    }, {});
  }
  function secInst() {
    return safe(function () {
      if (!WA.inst || typeof WA.inst.statView !== 'function') {
        return { error: 'engines/inst.js 未加载（组织制度读数缺席）' };
      }
      const v = WA.inst.statView();
      // X5 的活：制度答不出「要不要批准、谁能拍板、离任后在途项目归谁」。
      //   本节把三问各自的**可判定面**报出来：权限表（谁能拍板）、审批出口是否存在、
      //   以及各组织当前的在途项目数（离任时的归属靠它说得清）。
      return {
        enabled: !!v.enabled, orgs: v.orgs, posts: v.posts, holders: v.holders,
        decisions: v.decisions, open: v.open, breached: v.breached,
        perms: (WA.inst.PERMS || []).slice(),
        reasons: (WA.inst.REASONS || []).slice(),
        hasApprove: typeof WA.inst.approve === 'function',
        note: '只报组织/职位/决策计数与制度能力（本节目不任免、不批准、不交接）'
      };
    }, {});
  }
  function secSession() {
    return safe(function () {
      if (!WA.session || typeof WA.session.statView !== 'function') {
        return { error: 'engines/session.js 未加载（多人场读数缺席）' };
      }
      const v = WA.session.statView();
      // X6 的活：coop 是「单机上的多个身份」，答不出「这个人是谁、授权到哪」。
      //   本节报身份面的现状（在座几席、有没有主持人、授权出口是否在位），
      //   **不含任何凭证**（与注入面同纪律：指纹永不出场）。
      return {
        enabled: !!v.enabled, seats: v.seats, active: v.active, host: v.host || '',
        posts: v.posts, rev: v.rev,
        seatPerms: (WA.session.SEAT_PERMS || []).slice(),
        hostPerms: (WA.session.HOST_PERMS || []).slice(),
        hasIdentify: typeof WA.session.identify === 'function',
        // X5（v2.128.0）：`authority` 这一问的出口在不在（「谁能拍板」的另一半）。
        hasAuthority: !!(WA.inst && typeof WA.inst.authority === 'function'),
        // X6（v2.128.0）：`identify` 落到写闸门走的是 `permissions.adopt`（X6 依赖 P5 的那条边）。
        //   本节只报「那口在不在」——闸门到底拦不拦由 gate 一栏答，两者分开才读得出「认了人但拦不住」。
        hasAdopt: !!(WA.permissions && typeof WA.permissions.adopt === 'function'),
        note: '只报席位/序号/授权面读数，**不含凭证指纹**（本节目不入座、不发消息、不验票）'
      };
    }, {});
  }
  // ── v2.112.0：协作会话 / 队列 / 冲突（只读旁观；不调 claim/flush/resolve） ──
  function secCollab() {
    return safe(function () {
      if (!WA.collab || typeof WA.collab.stat !== 'function') {
        return { error: 'engines/collab.js 未加载（协作面读数缺席）' };
      }
      const st = WA.collab.stat();
      return {
        enabled: !!(WA.collab.getSettings && WA.collab.getSettings().enabled),
        sessions: st.sessions, openSessions: st.openSessions, pending: st.pending,
        openConflicts: st.openConflicts, blocked: st.blocked, lastReason: st.lastReason || '',
        faults: st.faults || {},
        // v2.139.0（E10）：协作任务面。三桶 + 两份留步**分开报**：
        //   breachRecorded 是「记下了」，penalized 是「真罚了」——合成一个数就答不出
        //   「违约有没有被处置」。taskTotal 与 st.tasks（累计建过几个）也不是同一件事。
        taskActive: st.openTasks, taskTotal: st.taskTotal,
        breachRecorded: st.breachesRecorded, penalized: st.penalized,
        note: '只报会话/队列/未裁决冲突与任务三桶（本节目不占角色、不重放、不裁决、不罚没）'
      };
    }, {});
  }

  /* ── v2.129.0（缝 A1–A10）：三个“侧路”引擎的只读读数 ──
   *   A2 改写器 / A7 静态设定缓存 / A9 报文预览器 三者都不产注入块
   *   （没有 `buildBlock`）——它们的消费者是面板、创世纪与用户。而本节是这三项能力在
   *   **产品侧的唯一读者**：没它们就是冻结面上的死导出（口径：产品零引用即冻结）。
   *   同 secChrono / secRegion 纪律：**只报读数、不写世界**（不 rewrite、不 put、不 capture）。
   */
  function secStitch2129() {
    return safe(function () {
      const rw = (WA.rewriter && typeof WA.rewriter.stat === 'function')
        ? (function () {
          const st = WA.rewriter.stat();
          const cfg = (WA.rewriter.getSettings ? WA.rewriter.getSettings() : {});
          return { enabled: !!cfg.enabled, channel: WA.rewriter.CHANNEL || null,
            runs: st.runs, changed: st.changed, unchanged: st.unchanged,
            blocked: st.blocked, lastReason: st.lastReason || '', faults: st.faults || {} };
        })() : { error: 'engines/rewriter.js 未加载（AI 改写通道席位缺席）' };
      const pw = (WA.presetWorld && typeof WA.presetWorld.preview === 'function')
        ? (function () {
          const pv = WA.presetWorld.preview();
          const cfg = (WA.presetWorld.getSettings ? WA.presetWorld.getSettings() : {});
          const st = (typeof WA.presetWorld.stat === 'function') ? WA.presetWorld.stat() : {};
          return { enabled: !!cfg.enabled, rows: pv.total, byKind: pv.byKind,
            cap: cfg.maxRows, updatedAt: pv.updatedAt,
            puts: st.puts, overrides: st.overrides, drops: st.drops };
        })() : { error: 'engines/preset-world.js 未加载（静态设定缓存缺席）' };
      const rv = (WA.requestViewer && typeof WA.requestViewer.stat === 'function')
        ? (function () {
          const st = WA.requestViewer.stat();
          const cfg = (WA.requestViewer.getSettings ? WA.requestViewer.getSettings() : {});
          const chans = (typeof WA.requestViewer.CHANNELS === 'function') ? WA.requestViewer.CHANNELS() : [];
          return { enabled: !!cfg.enabled, kept: WA.requestViewer.size(), maxKeep: cfg.maxKeep,
            maskKey: !!cfg.maskKey, channels: chans.length,
            previews: st.previews, captures: st.captures, drops: st.drops, blocked: st.blocked };
        })() : { error: 'engines/request-viewer.js 未加载（报文预览器缺席）' };
      return { rewriter: rw, presetWorld: pw, requestViewer: rv,
        note: '只报席位与计数（本节目不改写、不落盘、不捕获报文）' };
    }, {});
  }

  /* ── v2.130.0（拓展计划 A1..A4 / B1 / C1 / C2 / D1..D4）：十二个引擎的只读读数 ──
   *   本批十二个引擎里，只有两个产注入块（reasoning / storyTone），其余十个是
   *   「旁路能力」（拦截 / 变换 / 换算 / 预演 / 预览）——它们的消费者是面板与用户。
   *   本节是这十项能力在**产品侧的唯一读者**：没它们就是冻结面上的死导出（口径：
   *   产品零引用即冻结）。同 secStitch2129 / secChrono 纪律：**只报读数、不写世界**
   *   （不替换文本、不写配置、不落存档、不发请求）。
   */
  function secStitch2130() {
    return safe(function () {
      function st(ns) {
        const m = WA[ns];
        if (!m || typeof m.stat !== 'function') return { error: 'engines/' + ns + ' 未加载（席位缺席）' };
        const s = m.stat();
        const cfg = (typeof m.getSettings === 'function') ? m.getSettings() : {};
        return { enabled: !!cfg.enabled, blocked: s.blocked, lastReason: s.lastReason || '',
          faults: s.faults || {}, counts: Object.keys(s).filter(function (k) { return k !== 'faults' && k !== 'lastReason' && typeof s[k] === 'number'; }).map(function (k) { return k + '=' + s[k]; }) };
      }
      return {
        staleGuard: st('staleGuard'), purifyScope: st('purifyScope'),
        groupGuard: (WA.groupGuard && typeof WA.groupGuard.detect === 'function') ? (function () { const g = WA.groupGuard.detect(); return { group: !!g.group, unknown: !!g.unknown, reasons: (g.reasons || []).length }; })() : { error: 'engines/group-refuse.js 未加载' },
        reasoning: st('reasoning'), storyTone: st('storyTone'), calendarPlan: st('calendarPlan'),
        preflight: st('preflight'), archiveHide: st('archiveHide'), wordBudget: st('wordBudget'),
        binding: st('binding'), refine: st('refine'), polish: st('polish'),
        note: '只报席位与计数（本节目不拦截、不替换文本、不写配置、不落存档）'
      };
    }, {});
  }

  // ── 汇总 ──
  function collect() {
    const diag = {
      meta: secMeta(), env: secEnv(), modules: secModules(), visibility: secVisibility(), style: secStyle(), life: secLife(), factionGraph: secFactionGraph(), noesis: secNoesis(), lifeline: secLifeline(), perfLedger: secPerfLedger(), tapeStore: secTapeStore(), intel: secIntel(), perspective: secPerspective(), sediment: secSediment(), org: secOrg(), longline: secLongline(), foreshadow: secForeshadow(), causal: secCausal(), opportunity: secOpportunity(), recipe: secRecipe(),
      // v2.231.0（OPT-8）：世界词汇面（货币 / 配方 / 判定维度 / 题材目录 + 逐配方前置自洽）。
      //   与 recipe 节分列：那一节答「这一局按哪张配方跑」，本节答「这一局用哪些词」。
      playerArchive: safe(function () { const v = WA.playerArchive.view(); return { settings: WA.playerArchive.getSettings(), count: v.works.length, rounds: v.works.map(function (x) { return x.round; }), note: v.note }; }, {}),
      worldLexicon: secWorldLexicon(),
      // v2.231.0（拓展 EXP-1）：能力成长面（声明 + 逐人进度 + 台账）。
      //   与 life / plan 节分列：那两节答「他打算做什么」，本节答「他已经会了什么」。
      training: secTraining(),
      // v2.231.0（拓展 EXP-2）：唯一物件面（逐件身份 / 持有人 / 损耗 + 槽位）。
      //   与 economy 节分列：那一节答「堆叠资源的价与量」，本节答「这一件在谁手上」。
      gear: secGear(),
      // v2.231.0（拓展 EXP-3）：持续生产面（工单跨日 / 设施容量 / 班次 / 停工复工 / 交货）。
      //   与 economy 节分列：那一节答「即时生产做成了什么」，本节答「正在生产这件事本身」。
      production: secProduction(),
      // v2.231.0（拓展 EXP-4）：探索与地理发现面（逐人认知 / 勘察单 / 未发现条数）。
      //   与 world 节分列：那一节答「世界有什么」，本节答「谁知道」。
      survey: secSurvey(),
      // v2.231.0（拓展 EXP-5）：对抗场景面（场景 / 阶段 / 判定台账 / 优势与代价账）。
      //   与 fate 节分列：那一节答「这一掷是多少」，本节答「这场对抗走到哪一步」。
      contest: secContest(),
      ruling: secRuling(),
      // v2.231.0（拓展 EXP-7）：公共活动面（活动 / 报名 / 分轮 / 奖品 / 延期）。
      //   与 agenda 节分列：那一节答「接下来有什么事」（只读聚合），本节答
      //   「这场活动办到哪一步、谁报了名、谁缺席、奖发了没有」。
      activity: secActivity(),
      world: secWorld(), shadow: secShadow(), threads: secThreads(), rumor: secRumor(),
      // v2.99.0：原著幕目。缝入源是 Persona-Arena 的「幕 → 剧情点」流水线（ADR-0009）。
      //   与本仓既有的全部叙事面**正交**：那些记的是「这个世界自己长出来的历史」，
      //   这一节记的是「原著里本该长什么样」——清一色世界侧状态里的唯一一处外部基准。
      canon: secCanon(),
      // v2.64.0（第五十一 / 五十二 / 五十三面）：随机性面 / 敌意面 / 独立性面
      horizon: secHorizon(), enemies: secEnemies(), parallelWorld: secParallelWorld(),
      inject: secInject(), worldState: secWorldState(), runtime: secRuntime(),
      ui: secUi(), capabilities: secCapabilities(),
      host: secHost(), uninjectLedger: secUninjectLedger(), wbChannel: secWbChannel(), writeSerial: secWriteSerial(), bus: secBus(),
      bridge: secBridge(),
      phoneBridge: secPhoneBridge(),
      lonsha: secLonsha(),
      // v2.101.0（O11）：跨插件互操作验收面。与 bridge / phoneBridge / lonsha 三节
      //   互补——那三节各报**一个方向**的现场，这一节把三伙伴归一成一张可核对的矩阵。
      interop: secInterop(),
      // v2.102.0（A2/O12）：性能基线与分层增量。与 interop 同一取舍：读数**只念现场**，
      //   不替用户跑基准（跑基准是面板出口的事）。
      perfTrace: secPerfTrace(),
      chrono: secChrono(),
      // v2.129.0（缝 A1–A10）：三个侧路引擎（改写器 / 静态设定 / 报文预览）的只读读数。
      //   这三项不产注入块，故本节是它们在产品侧的唯一读者；漏登记 ⇒ 死导出面当场红灯。
      stitch2129: secStitch2129(),
      // v2.128.0（拓展计划 X3–X6）：远方离线演化 / 认知冲突裁决 / 组织制度 / 多人身份。
      //   四节都在这里登记 —— 诊断包是这四个新面**唯一**的产品侧读者，
      //   漏登记 ⇒ 死导出面当场红灯（口径：产品零引用即冻结面）。
      region: secRegion(), probe: secProbe(), inst: secInst(), session: secSession(),
      collab: secCollab(),
      plugin: secPlugin(),
      compat: secCompat(),
      // v2.121.0 P1：审计事实面（取证三件套的第三件）。与 causal 节并列——
      //   那一节报「世界被推进得怎么样」，这一节报「世界被谁改过」。两节都不写世界。
      audit: secAudit(),
      // v2.50.0（第三十五面）：宿主两侧 + 时间轴三节
      hostWb: secHostWb(), floorChanges: secFloorChanges(), ledgerTimeline: secLedgerTimeline(),
      // v2.80.0（第十四面）：故障台账总目（凡以 stat().faults 记账的模块必须出现在这里）
      faultLedger: secFaultLedger(),
      // v2.150.0(RP4)：注入价值面。与 inject 节相邻但不合并——那一节答「这一轮注入了什么、
      //   花掉多少预算」，这一节答「注入进去的东西有没有被正文用上」，两问的失效模式不同。
      injectValue: secInjectValue(),
      // v2.151.0（RX2+RX3）：离线推进面 + 远方世界脉搏。两节分列不合并：
      //   一个答「你不在的这段时间世界推进了什么、哪些没许动」，
      //   一个答「你不在的地方此刻在发生什么」（前者失效在「没保护住关键进展」，后者在「距离被抹平」）。
      offlineTick: secOfflineTick(), farfield: secFarfield(),
      // v2.153.0（RX5+RX6）：导演面两节。分列不合并 ——
      //   一个答「故事发展到什么程度」（合成指数 + 走向），一个答「玩家分过几次叉」（历史账）；
      //   前者失效在「指数不反映实际节奏」，后者失效在「分叉点丢了或悬空边」，两问互不覆盖。
      plotGauge: secPlotGauge(), branchTree: secBranchTree(),
      // v2.229.0（拓展 N11）：阻尼量规占比档位读数。与上两节同取舍：读数**只念现场**，不替用户跑。
      gauge: secGauge(),
      // v2.154.0（RX4+RX7）：联网面与自洽审计面。两节分列不合并 ——
      //   一个答「别的世界传过来什么、本世界的身份是什么」，一个答「这个世界自己前后对不对得上」；
      //   前者失效在「传说被当成本地事实 / 同名异世界被认成同一个」，后者失效在「四本账互相矛盾却看不见」。
      worldBridge: secWorldBridge(), ecoAudit: secEcoAudit(), worldSeed: secWorldSeed(),
      // v2.164.0（TX5）：版本化完整世界蓝图。与 worldSeed 节分列不合并 ——
      //   一个答「我抽到了什么格局」（有损、只有显示名），一个答「我导出的世界能不能原样搬走」
      //   （无损、稳定 ID + 方向化关系 + 道路端点）；前者失效在「同名被静默合并」，
      //   后者失效在「版本对不上却按 v1 猜着收 ⇒ 静默污染目标存档」。
      worldBlueprint: secWorldBlueprint(),
      // v2.257.0（V6 OPV6-2）：启用面可见。与上方 capabilities 节分列（接口齐不齐 vs 机制跑没跑）。
      capability: secCapability(),
      // v2.275.0（V7 OPV7-5）：驱动者登记表。与 capability 节分列不合并 ——
      //   那一节读「开关有没有开」，本节读「有没有任何人会去驱动它」（调用面）。
      //   开关开着但没有驱动者，正是 V7 立项要抓的那一类，前两节都读不出这一格。
      driver: secDriver(),
      // v2.280.0（V7 OPV7-4）：写口契约自描述。与 driver 节分列不合并 ——
      //   那一节答「有没有人会驱动它」，本节答「驱动的时候该给什么形状、被拒了怎么办」。
      //   实测：3335 个导出函数里 95 个在拒收时自带 hint，而那些 hint 只存在于函数体内部，
      //   调用方拿到之前无从知道 ⇒ 同一类调用要试错三轮，每一轮都要真写一次世界。
      //   本节是 writeContract 的产品侧真读者（维护者面：哪些写口带自述、哪些读不到）。
      writeContract: secWriteContract(),
      // v2.281.0（V7 OPV7-6）：开局播种读数。与 writeContract 节分列不合并 ——
      //   那一节答「驱动的时候该给什么形状」，本节答「开局那一刻到底喂进去了什么」。
      playableSeed: secPlayableSeed(),
      // v2.259.0（V6 OPV6-4）：三重门槛自检。与 capability 节分列不合并 ——
      //   那一节答「179 个开关谁在跑」，本节答「跑着的那些为什么内容还是没出来」
      //   （107 个源里三门槛全通只有 6 个）。本节是 threeGates 的产品侧唯一真读者。
      health: secHealth(),
      // v2.276.0（V7 OPV7-7）：空产出归因。与 health 节分列不合并 ——
      //   那一节答「三面门槛过没过」，本节答「**具体哪几台引擎**在空着、各自卡在哪一面」
      //   （门槛全过、首局在跑，照样可能有一批引擎永远空产）。本节是
      //   healthPreflight.yieldAttrib 的产品侧唯一真读者。
      yieldAttrib: secYield(),
      // v2.265.0（V6 EXV6-1）：世界日记读数。与 health 节分列不合并 ——
      //   那一节答「机制跑没跑起来」，本节答「跑起来之后世界说出了什么」
      //   （三路来源哪一路不在场 / 边界是判不了还是真看不见）。
      worldDiary: secWorldDiary(),
      dayRoute: secDayRoute(),
      // v2.285.0（V7 EXV7-1）：今日世界简报读数。与世界日记节分列不合并 ——
      //   那一节答「镜头外发生过什么（叙事面）」，本节答「这一轮结构化引擎
      //   各自吃进了几笔（机制面）」：快照链断没断 / 六源核对到了几路 /
      //   计数回落被吞了几次。快照由 backstage 直调不进总线，故挂载点断了
      //   只有这一节能看出来。
      worldBriefing: secWorldBriefing(),
      // v2.286.0（V7 EXV7-2）：人物意图看板读数。与简报节分列不合并 ——
      //   那一节答「机制这一轮吃了几笔」（系统面），本节答「人物这一侧有没有
      //   可读的链、看板为什么空」（人物面）。plan 引擎缺席与「没人有计划」
      //   在面板上同形，只有这一节能把两者分开。
      intentBoard: secIntentBoard(),
      relationTemp: secRelationTemp(),
      undercurrentCalendar: secUndercurrentCalendar(),
      roundCost: secRoundCost(),
      saveHealth: secSaveHealth(),
      firstRun: secFirstRun(),
      handoffPack: secHandoffPack(),
      // v2.181.0（UI 主题化）：界面主题层读数。与上面各节分列不合并 ——
      //   它答的是「界面这一层现在是什么状态」，与世界观/剧情/经济各面正交；
      //   失效模式也独立（主题切了没生效 / 样式叠了两套 / 切不回去）。
      uiTheme: secUiTheme(),
      diplomacy: secDiplomacy(),
      agency: secAgency(),
      freight: secFreight(),
      storyChoice: secStoryChoice(),
      // v2.518.0：故事回应窗口的诊断节。与 storyChoice 分列不合并 ——
      //   一个答「有哪些分支可选」，一个答「正文推进后世界回应了什么、玩家介入落到哪」。
      storyWindow: secStoryWindow(),
      commission: secCommission(),
      investigation: secInvestigation(),
      aftermath: secAftermath(),
      operations: secOperations(),
      // v2.194.0（U2）：跨模块原子提交链。与 operations 节分列不合并 ——
      //   一个答「项目在办什么」，一个答「这些写入是怎么被一次提交掉的、哪一步拒的」。
      commit: secCommit(),
      // v2.166.0（TX2）：行动调度（动机 / 计划 / 行动闭环）。与 diplomacy 节分列不合并
      //   —— 一个答「谈成的事实」，一个答「谁在做什么、计划步到哪、有没有在途行动」。
      // v2.156.0（SP1）：时间来源与游玩活动基准。与 life 节分列不合并（两问的失效模式不同）。
      playtime: secPlaytime(),
      // v2.156.0（S1）：离线恢复编排。与 playtime 节分列不合并 ——
      //   一个答「基准在不在」，一个答「这段离开被结算了几次、有没有被重复结算」。
      offlineReturn: secOfflineReturn(),
      // v2.182.0（第二批 E2/E5/O4/O3/O5）：五只只读聚合面。五节分列不合并 ——
      //   诊断包是这些新面**唯一**的产品侧读者，漏登记 ⇒ 死导出面当场红灯
      //   （口径：产品零引用即冻结面）。
      agenda: secAgenda(), calendar: secCalendar(), chronicleView: secChronicleView(), capacityAudit: secCapacityAudit(),
      // v2.292.0（EXV7-8）：世界自传。与 chronicleView 分列不合并 ——
      //   一个答「逐条发生了什么」，一个答「分几个阶段、每阶段留了什么」；
      //   合成一节之后「长局滚成几百条」与「阶段划错了」在读数面上同形。
      autobiography: secAutobio(),
      // v2.293.0（EXV7-9）：一键播种。与 autobiography 分列不合并 ——
      //   一个答「这局跑成什么样了」（只读），一个答「空世界能种出什么」（唯一带写面的入口）；
      //   合成一节之后「自传读不出」与「播不动」在读数面上会同形。
      populate: secPopulate(),
      perfBaseline: secPerfBaseline(), worldHealth: secWorldHealth(),
      // v2.183.0（第一批 E1）：统一待办事项中心。与 worldHealth 的待办栏分列不合并 ——
      //   两者答的是**两个粒度**：世界健康栏答「还有几件事没做完」（计数 + 是否全清），
      //   本中心答「具体是哪几件、分别去哪看、能不能处置」（逐条归一 + 路由）。
      //   合并会让「源缺席」「归一失败」「emptyAll 可达性」这三个本中心独有的读数无处可报。
      pendingCenter: secPendingCenter(),
      // v2.187.0（E4）：场景 / 战役层。与待办中心分列 —— 两者答的不是一件事：
      //   待办中心答「现在有哪些事等着办」，战役层答「这一局的目标走到哪一步了」。
      campaign: secCampaign(),
      atlas: secAtlas(),
      // v2.187.0（E8）：蓝图 / 种子依赖包与迁移助手。与蓝图/种子节分列 ——
      //   那两节答「库里有什么」，本节答「搬过来能不能用、缺什么、会降级什么」。
      depCheck: secDepCheck(),
      // v2.188.0（E7）：玩家自定义规则包与自动化模板。与 settings 节分列 ——
      //   那一节答「设置键的落盘台账」，本节答「玩家侧那几套命名规则包与其模板台账」。
      rulePack: secRulePack(),
      // v2.188.0（E9）：隔离世界实验室与反事实对比。与 rehearsal 节分列 ——
      //   那一节答「一次试演跑了什么」，本节答「三条路径摆在一起的差在哪、这份结论过期没有」。
      worldLab: secWorldLab(),
      // v2.227.0(拓展 N9):三项目剧情事件闭环。与 bridge / phoneBridge / lonsha 三节分列
      //   不合并:那三节各报**一条边**的现场,本节报**整条链走完没**(回执 → 因果 → 记忆)。
      storyLoop: secStoryLoop(),
      // v2.228.0(拓展 N10):历史留存与检索。与前两节同取舍:读数只念现场,不替用户跑。
      //   它同时是 retrieval.assemble(有界紧凑包)在**产品侧的唯一读者** ——
      //   不在此处接上,那条口径就只活在测试里(产品零引用即冻结面)。
      retrieval: secRetrieval(),
      // v2.230.0（拓展 N12）：26 枚新引擎的只读采集节。本批 305 项导出此前产品零引用，
      //   本版取「真接线」而非「--update 冻结放行」——本节是 88 个 read 口在产品侧的唯一读者，
      //   217 个 act 口由面板「引擎台」页真调（诊断不触发写口）。漏登记 ⇒ 死子面当场红灯。
      engines230: secEngines230()
    };
    diag.verdict = verdict(diag);
    return diag;
  }

  /** 顶层判语：把「扩展到底健康不健康」压成一句话 + 问题清单 */
  function verdict(diag) {
    const issues = [];
    const m = diag.modules || {};
    if (m.missingCount) issues.push({ level: 'error', key: 'modules', detail: '有 ' + m.missingCount + ' 个模块未导出：' + (m.missing || []).map(function (x) { return x.key; }).join('/') });
    (diag.capabilities || []).forEach(function (c) {
      if (!c.ok) issues.push({ level: 'error', key: 'cap:' + c.key, detail: c.label + ' 不可用（' + (c.reason || ('缺 ' + (c.missingApi || []).join('/'))) + '）' });
    });
    const inj = diag.inject || {};
    if (inj.status === 'MISSING') issues.push({ level: 'error', key: 'inject', detail: '上轮注入已注册但未进最终 prompt（真注入失败，查其它扩展/depth）' });
    else if (inj.status === 'SKIPPED_DISABLED') issues.push({ level: 'warn', key: 'inject', detail: '注入可见性全关，世界状态不会进正文' });
    const vis = diag.visibility || {};
    if (!vis.enabledCount) issues.push({ level: 'warn', key: 'visibility', detail: '所有注入源均关闭' });
    // v2.2.0 块8: 分层口径——无条件渲染控件缺失才是断裂（warn）；
    //   条件渲染控件缺失只作 info 提示（依赖状态，静态检查下必然缺席）
    if (diag.ui && diag.ui.allOk === false) issues.push({ level: 'warn', key: 'ui', detail: '当前页（' + ((diag.ui || {}).currentPage || '?') + '）部分控件未渲染——绑定会静默失效，用户点击无反应（见 ui.groups）' });
    const uiCondMiss = (((diag.ui || {}).groups) || []).reduce(function (a, g) { return a + ((g.condMissing || []).length); }, 0);
    if (uiCondMiss > 0 && diag.ui && diag.ui.groups) issues.push({ level: 'info', key: 'ui.cond', detail: uiCondMiss + ' 个条件渲染控件当前不在场（依赖世界状态，非缺陷）' });
    // v0.1.19: 宿主能力缺失 → warn（降级仍可运行但功能受限）
    const h = diag.host || {};
    // v2.17.0: 记忆桥对账——两个钟不同步＝info（不是故障，但必须可见）。
    //   正文校准的 GameClock 与推演出的世界钟本来就可能不同步；此前这件事在本扩展侧
    //   完全不可观测（产品代码对 lonsha 桥零消费）。现在它至少能被念出来。
    try {
      const ls = diag.lonsha || {};
      if (ls.ok && (ls.verdict === 'world-ahead' || ls.verdict === 'world-behind')) {
        issues.push({ level: 'info', key: 'lonsha.drift',
          detail: '两个钟不同步：' + ls.describe + '（本扩展 ' + (ls.worldDate || '?')
            + ' vs LonSha ' + (ls.lonshaDate || '?') + '，差 ' + (ls.days || 0)
            + ' 天）——正文校准的钟与推演钟各自演化，此事此前不可观测，现在只报不管（谁拍板由用户决定）' });
      }
    } catch (eLs) {}
    // v2.3.0 块3: 随机事件通道全关——info 级。这是合法配置（用户就是不想要随机事件），
    //   但「推演从不产生远方/近端事件」必须可归因，否则会被当成引擎坏了。
    try {
      const hz = (diag.runtime || {}).horizon || {};
      const en = hz.enabled || {};
      if (en.distant === false && en.near === false) {
        issues.push({ level: 'info', key: 'horizon', detail: '远方与近端随机事件通道均已关闭：推演不会产生 viewport 外的偶发事件（这是设置，不是故障）' });
      } else if (hz.skipped > 0 && (hz.distantFired || 0) + (hz.nearFired || 0) === 0 && hz.rolls > 0) {
        issues.push({ level: 'info', key: 'horizon', detail: '随机事件本会话掷骰 ' + hz.rolls + ' 次但零触发（最近：' + (hz.lastReason || '?') + '）' });
      }
    } catch (eHz) {}
    // v2.14.0: 随机源分级——分两件不同的事，级也不同：
    //   ① 参数非法（种子为 NaN/对象、区间反向、骰面数<1）⇒ **代码缺陷**，error。
    //      特别是「非法种子被静默接受」会让「我以为复现了，其实没有」——复现结论本身不可信。
    //   ② 未显式播种 ⇒ 当前会话不可复现。这**不是故障**（auto 是默认行为），
    //      但它解释了一件用户会觉得怪的事：「同样的操作两次结果不同」不是引擎坏了，
    //      而是随机源头没定。故 info，并明确告知怎么定住。
    try {
      const rd = (diag.runtime || {}).rand || {};
      if (rd.failed > 0) {
        issues.push({ level: 'error', key: 'rand', detail: '随机源有 ' + rd.failed + ' 次参数非法（' + JSON.stringify(rd.failedBy || {}) + '）：非法种子/区间不被静默接受，已归因并退回默认；但调用点是缺陷（须改代码）' });
      } else if (rd.draws > 0 && rd.reproducible === false) {
        issues.push({ level: 'info', key: 'rand', detail: '随机源未显式播种（本会话 ' + rd.draws + ' 次决策抽取，涉及 ' + rd.channels + ' 个通道，最近：' + (rd.lastChannel || '?') + '）——「同样操作两次结果不同」属正常；要复现运行 `WA.rand.seed(<数字>)`（决策流同种子同序列，标识流不受影响）' });
      }
    } catch (eRd) {}
    // v2.15.0: 时间源分级——与随机源**完全同型**，因为它们是同一个命题的两半：
    //   ① 参数非法（freeze(NaN/Infinity/对象)、advance 步长非法）⇒ **代码缺陷**，error。
    //      尤其是「非法冻结时刻被静默接受」会让「我以为冻结了，其实没有」——复现结论本身不可信。
    //   ② 未冻结 ⇒ 本会话写进存档的时间戳不可复现。这**不是故障**（跟墙钟走是默认行为），
    //      但它解释了另一件用户会觉得怪的事：明明播了种，两次跑出来的存档还是不一样。
    //      故 info，并明确告知怎么把时刻定住。
    try {
      const ck = (diag.runtime || {}).clock || {};
      if (ck.failed > 0) {
        issues.push({ level: 'error', key: 'clock', detail: '时间源有 ' + ck.failed + ' 次参数非法（' + JSON.stringify(ck.failedBy || {}) + '）：非法冻结时刻/步长不被静默接受，已归因并退回默认；但调用点是缺陷（须改代码）——若非法的是冻结时刻，「已冻结」的结论不可信' });
      } else if (ck.nowCalls > 0 && ck.reproducible === false) {
        issues.push({ level: 'info', key: 'clock', detail: '决策时钟未冻结（本会话 ' + ck.nowCalls + ' 次决策时间读取，涉及 ' + ck.sites + ' 个站点，最近：' + (ck.lastSite || '?') + '；另有 ' + ck.wallCalls + ' 次测量读取不受影响）——「同样的种子两次跑出来的存档还是不一样」根因在此：随机源定了，时刻没定；要复现运行 `WA.clock.freeze(<时刻戳>)`（此后所有进存档的时间戳都取该虚拟时刻，每轮用 advance() 推进）' });
      }
    } catch (eCk) {}
    // v2.16.0: 对外只读互操作桥分级——分四件不同的事，级也不同：
    //   ① 桥不可用（模块没装载/stat 缺失）⇒ **外部集成整条断链**，warn：本扩展仍能独立运行，
    //      但另两个插件读不到世界（它们各自回落成「自己猜」，用户看到的是「两个世界对不上」）。
    //   ② 开闸却零发布 ⇒ warn：开关开着、也有刷新请求，却没有一次成功——须查 store 是否就绪。
    //   ③ 发布失败 > 0 ⇒ error：外部拿到 null 又不知道原因，正是本仓库反复治理的「静默降级」形态。
    //   ④ 闸关着但外面在读 ⇒ warn：**外部拿到的永远是 null，而它看起来像「这个世界是空的」**。
    //      这是本版最隐蔽的一种失配（与 lonsha 侧「未开启快照桥」同一形状），故显式点出。
    try {
      const bd = diag.bridge || {};
      if (bd.error) {
        issues.push({ level: 'warn', key: 'bridge', detail: '对外桥不可用：' + bd.error });
      } else {
        if (bd.failures > 0) {
          issues.push({ level: 'error', key: 'bridge', detail: '对外桥发布失败 ' + bd.failures + ' 次（最近：' + ((bd.lastFailure || {}).reason || '?') + '）——外部侧拿到的是 null，且它分不清「世界是空的」与「投影坏了」，须改代码或查 store 状态' });
        }
        if (bd.enabled === true && bd.publishes === 0) {
          issues.push({ level: 'warn', key: 'bridge', detail: '对外桥已开闸且有 ' + bd.refreshes + ' 次刷新请求，但一次也没成功发布（最近理由：' + (bd.lastReason || '?') + '）——开关开着却没在干活' });
        }
        if (bd.enabled === false && bd.externalReads > 0) {
          // v2.382.0（历史欠账消红 · 与 core/store.js 的 maintain 同批同规）：
          //   本格原为 warn，但 `externalReads` 是**进程级累计计数**（engines/bridge.js 的
          //   模块级 __stat，只增不减、清 localStorage 清不掉），拿它判「当前有没有缺陷」
          //   会让这条 warn 在第一次外部读取之后**永久**亮着 —— 与 v0.4.0 给 rescue /
          //   integrity 立的「健康分=当前状态、审计计数=历史经历」直接矛盾。
          //   且桥的 `enabled:false` 是**出厂默认**，本扩展休眠时返回 null 并把每次拒绝
          //   记进 refused/lastRefusal 是**正确行为**：这不是故障，是「对方需要它但闸关着」
          //   的**配置建议**。故降为 info，措辞按建议写（保留全部可追溯读数与开闸写口）。
          issues.push({ level: 'info', key: 'bridge.idleRead', detail: '对外桥当前**休眠**（出厂默认，设置键 worldaxis_bridge_settings_v1 的 enabled=false），期间被外部读取过 ' + bd.externalReads + ' 次：每次返回 null 并已如实记入 refused —— 本扩展行为正确，这是**配置建议**（若确需互操作，开闸：WorldAxis.bridge.setSettings({ enabled: true })），不计为当前缺陷' });
        }
        if (bd.enabled === false) {
          issues.push({ level: 'info', key: 'bridge', detail: '对外桥休眠中（默认）：另两个插件（RubyPhone 世界脉搏 / TimeManager、LonSha 世界推进）此刻各自用自己的办法描述世界；要共享真值开 `WorldAxis.bridge.setSettings({ enabled: true })`' });
        }
        if (bd.enabled !== false && bd.lastInvalidateReason) {
          issues.push({ level: 'info', key: 'bridge.invalidated', detail: '快照最近一次作废理由：' + bd.lastInvalidateReason + '（分布 ' + JSON.stringify(bd.byInvalidate || {}) + '）——推演结算/换聊天后外部读到的必须是新世界' });
        }
      }
    } catch (eBd) {}
    // v2.97.0（X5）: 入站桥分级——与上面出站桥**对称**（一发一收，缺任一边这套互操作都是半条）。
    //   ① 模块不可用 ⇒ error：手机侧的交互动作在世界里不留痕迹，而状态里看不出「少了一笔」。
    //   ② 休眠却有上报 ⇒ warn：**那几笔已经丢了**。入站桥没开闸时上报不落盘、也不排队，
    //      「以后会补上」是假的——手机侧看到的是「我报了」，本扩展看到的是「什么都没发生」。
    //   ③ 有拒收 ⇒ warn：对方发来了本扩展不认识的动作（或没带 opId）——那正是
    //      「让外部决定本扩展因果词汇表」的前兆。
    //   ④ 台账满 ⇒ warn：后续上报被拒收（不静默挤掉，但须知道）。
    try {
      const pb = diag.phoneBridge || {};
      if (pb.error) {
        issues.push({ level: 'error', key: 'phoneBridge', detail: '入站桥不可用：' + pb.error });
      } else {
        if (pb.enabled === false && (pb.blocked > 0 || pb.noted > 0)) {
          issues.push({ level: 'warn', key: 'phoneBridge', detail: '入站桥休眠，但手机侧已上报过 ' + (pb.blocked + pb.noted) + ' 笔——桥没开闸时上报**不落盘也不排队**，那几笔操作已经丢了（要收就开 `WorldAxis.phoneBridge.setSettings({ enabled: true })`）' });
        }
        if (pb.enabled === true && pb.blocked > 0) {
          issues.push({ level: 'warn', key: 'phoneBridge', detail: '入站桥拒收 ' + pb.blocked + ' 笔（' + JSON.stringify(pb.faults || {}) + '）——拒收本身是对的（不认识的动作不许照收），但须看是「对方发错了」还是「本扩展的词汇表该扩了」' });
        }
        if (pb.enabled === true && pb.rows >= pb.maxOps) {
          issues.push({ level: 'warn', key: 'phoneBridge', detail: '入站台账已满（' + pb.rows + '/' + pb.maxOps + '），后续上报会被拒收（ops-full）——不静默挤掉是对的，但满员本身要处理' });
        }
        if (pb.enabled === true && pb.rows > 0 && pb.unlinked === pb.rows) {
          issues.push({ level: 'info', key: 'phoneBridge', detail: '入站台账 ' + pb.rows + ' 笔全部未接链——手机侧的操作已经进来了，但还没人把「它是哪条链的因」接上（`linkChain`）' });
        }
      }
    } catch (ePb) {}
    if (h && h.sillyTavern === false) issues.push({ level: 'warn', key: 'host', detail: '未检测到 SillyTavern 宿主（无事件源，仅拦截器函数可用）' });
    else if (h && h.eventSource === false) issues.push({ level: 'warn', key: 'host', detail: '宿主无事件源：after 链与切聊天重载将不生效' });
    if (h && h.extensionPrompt === false) issues.push({ level: 'error', key: 'host', detail: '宿主无 setExtensionPrompt：注入通道完全不可用' });
    if (h && h.variables === false) issues.push({ level: 'warn', key: 'host', detail: 'TavernHelper 变量 API 缺失：wb 变量镜像通道降级为即时注入' });
    if (h && h.worldbook === false) issues.push({ level: 'warn', key: 'host', detail: 'TavernHelper 世界书 API 缺失：wb 条目自动创建不可用' });
    // v0.1.20: CDN 失败源全数冷却 → warn（当前会话内 CDN 容灾已耗尽）
    // v0.1.22: 最近一次落盘失败 → error（世界状态未持久化，刷新即丢）
    const wsStor = ((diag.worldState || {}).storage || {});
    const lsav = wsStor.lastSave || null;
    try {
      const db = (diag && diag.diagBudget) || (WA.store.diagBudget ? WA.store.diagBudget() : null);
      if (db && db.exceeded) issues.push({ level: 'warn', key: 'storage.diagBudget', detail: '当前聊天诊断键 ' + Math.round(db.diagBytes / 1024) + 'KB / 存档 ' + Math.round(db.stateBytes / 1024) + 'KB（' + db.diagPct + '%，阈值 ' + db.maxPct + '%）超预算——诊断环过大，建议清理或提高 maxPct' });
      else if (db && db.diagPct > 10) issues.push({ level: 'info', key: 'storage.diagBudget', detail: '当前聊天诊断键 ' + db.diagPct + '%（' + Math.round(db.diagBytes / 1024) + 'KB / ' + Math.round(db.totalBytes / 1024) + 'KB），正常' });
    } catch (e) {}
    if (lsav && lsav.ok === false) issues.push({ level: 'error', key: 'storage', detail: '最近一次 store 落盘失败（' + (lsav.reason || 'error') + '，累计 ' + lsav.failCount + ' 次）：内存态已更新但未持久化' });
    else if (lsav && lsav.failCount > 0) issues.push({ level: 'warn', key: 'storage', detail: 'store 历史落盘失败 ' + lsav.failCount + ' 次（当前已恢复）' });
    // v0.1.30: 事务健康——独立 transactions 键（与 lastSave 议题解耦）：
    //   lastStatus='save-failed' → error（当下在丢数据）；saveFailed>0 但已恢复 → warn（历史失败）；errors>0 → warn（修改器抛错但状态未提交）
    // v0.1.37: 恢复点满额 → info（环形覆盖属正常行为，但用户应知晓最旧快照将被丢弃）
    // v0.1.38: 状态键曾损坏 → warn（隔离键存在但默认状态已接管，需人工检查 *_corrupt_*）
    const lst = (((diag.worldState || {}).storage || {}).load) || null;
    if (lst && lst.errors > 0) issues.push({ level: 'warn', key: 'load', detail: '状态加载发生过 ' + lst.errors + ' 次失败（最近：' + (lst.lastError || '?') + '）：损坏现场已隔离到 *_corrupt_* 键，请人工导出后清理' });
    const rstat = (((diag.worldState || {}).storage || {}).recovery) || null;
    if (rstat && rstat.full) issues.push({ level: 'info', key: 'recovery', detail: '恢复点已达上限（' + rstat.count + '/' + rstat.max + '，共 ' + rstat.bytes + ' 字节）：下次创建时最旧快照将被覆盖' });
    const txs = (((diag.worldState || {}).storage || {}).transactions) || null;
    if (txs && txs.lastStatus === 'save-failed') issues.push({ level: 'error', key: 'transactions', detail: '最近一次事务落盘失败（' + txs.saveFailed + '/' + txs.count + ' 次历史失败）：内存态已推进但 localStorage 未持久化，建议导出快照' });
    else if (txs && txs.saveFailed > 0) issues.push({ level: 'warn', key: 'transactions', detail: '历史事务落盘失败 ' + txs.saveFailed + ' 次（当前已恢复）' });
    if (txs && txs.errors > 0) issues.push({ level: 'warn', key: 'transactions', detail: '事务修改器异常 ' + txs.errors + ' 次（未提交，世界状态保持一致）' });
    // v0.1.23: 工作流节点有历史报错 → warn（不阻断但需排查）
      const wfSt = ((diag.runtime || {}).workflow || {});
      const errNodes = (wfSt.slowest || []).filter(function (r) { return r.errors > 0; });
      if (errNodes.length) issues.push({ level: 'warn', key: 'workflow', detail: errNodes.length + ' 个工作流节点历史报错：' + errNodes.map(function (r) { return r.id + '(' + r.errors + ')'; }).join('、') });
    // v0.1.24: 预算账单分级告警
    const bgt = inj.budget || null;
    if (bgt) {
      if (bgt.overBudget) issues.push({ level: 'error', key: 'budget', detail: '上轮注入超出预算（' + bgt.used + '/' + bgt.cap + 't，档源 ' + bgt.source + '）' });
      else if (bgt.droppedCount) issues.push({ level: 'warn', key: 'budget', detail: '预算裁决丢弃 ' + bgt.droppedCount + ' 源：' + ((bgt.dropped || []).map(function (d) { return d.source; }).join('、')) });
      else if (bgt.foldedCount) issues.push({ level: 'info', key: 'budget', detail: '预算裁决折叠 ' + bgt.foldedCount + ' 源（' + bgt.summary + '）' });
    }
    // v0.1.43: 无界增长守卫——白名单外的数组路径长到一定体积即报议题
    const aud = (((diag.worldState || {}).storage || {}).sizeAudit) || null;
    if (aud && Array.isArray(aud.suspects) && aud.suspects.length) {
      issues.push({ level: 'warn', key: 'sizeAudit', detail: aud.suspects.length + ' 个未见裁剪的持久数组：' + aud.suspects.map(function (x) { return x.path + '(' + x.len + '项/' + x.bytes + 'B)'; }).join('、') });
    }
    // v0.1.44: 白名单漂移——已登记容器超出其源码 cap，意味着裁剪代码失效或被绕过写入
    if (aud && Array.isArray(aud.drifted) && aud.drifted.length) {
      issues.push({ level: 'error', key: 'sizeDrift', detail: aud.drifted.length + ' 个容器超出登记的裁剪上限（守卫失效）：' + aud.drifted.map(function (x) { return x.path + '(' + x.len + '>' + x.cap + '，见 ' + x.site + ')'; }).join('、') });
    }
    // v0.1.51: 存储键堆积——诊断键跨聊天无限堆积或 corrupt 隔离键超保留数
    const skStat = (((diag.worldState || {}).storage || {}).storageKeys) || null;
    if (skStat && skStat.enumerable) {
      const staleCount = (skStat.staleDiagCandidates || []).length;
      if (staleCount > 20) {
        issues.push({ level: 'warn', key: 'storageKeys', detail: staleCount + ' 个跨聊天诊断键超出活跃期（最大闲置 ' + Math.round((skStat.staleDiagCandidates[0] && skStat.staleDiagCandidates[0].idleMs !== Infinity) ? skStat.staleDiagCandidates[0].idleMs / 86400000 : 999) + ' 天），可用 store.sweepStaleKeys() 清理' });
      }
      if (skStat.totalKeys > 200) {
        issues.push({ level: 'warn', key: 'storageKeysTotal', detail: 'worldaxis_* 键总数 ' + skStat.totalKeys + '（' + Math.round(skStat.totalBytes / 1024) + 'KB），建议运行 sweepStaleKeys 复核' });
      }
    }
    // v0.1.45: 扫描预算耗尽——此时 unbounded/suspects 是「没看见」而非「真没有」，不得当作全绿
    if (aud && aud.complete === false) {
      issues.push({ level: 'warn', key: 'sizeScanTruncated', detail: '无界增长扫描未收敛（' + aud.chunks + ' 片 / 访问 ' + aud.visitedNodes + ' 节点，片数上限 ' + aud.maxChunks + (aud.stalled ? '，已停滞' : '') + '），本轮 unbounded/suspects 不完整' });
    }
    // v0.1.45: 旧存档结构自愈留痕——补过字段说明存档比代码旧，类型冲突说明状态键被外部污染
    const ldStat = (((diag.worldState || {}).storage || {}).load) || null;
    const fix = (ldStat && ldStat.lastFix) || null;
    if (fix && fix.conflicts > 0) {
      issues.push({ level: 'error', key: 'stateShape', detail: '最近载入有 ' + fix.conflicts + ' 处字段类型与默认结构不符（已保留原值，未擅自改写）' });
    } else if (fix && fix.filled > 0) {
      issues.push({ level: 'info', key: 'stateShape', detail: '旧存档兼容：本次载入补齐 ' + fix.filled + ' 个缺失字段' });
    }
    // v0.1.47: 跨版本迁移留痕——失败步必须报红（否则只存在于瞬时日志）
    const mig = (ldStat && ldStat.migrated) || null;
    // v2.162.0（TP7）：未来档**拒收**必须报红——拒收是「本次没救回」，不是「无迁移」（后者静默）。
    //   复用同一议题键（不新增键面）：两者同属「存档版本与代码版本对不上」这一件事。
    if (mig && mig.refused === 'future-schema') {
      issues.push({ level: 'error', key: 'schemaMigrate', detail: '存档 schema v' + mig.from + ' 高于当前代码 v' + mig.current + '——已拒收不降级（请升级扩展；旧代码本次未改写任何存档字节）' });
    } else if (mig && (mig.failed > 0 || mig.steps > 0)) {
      if (mig.failed > 0) {
        issues.push({ level: 'error', key: 'schemaMigrate', detail: '存档迁移有 ' + mig.failed + ' 步失败（v' + mig.from + '→v' + mig.to + '），部分字段可能未转换' });
      } else {
        issues.push({ level: 'info', key: 'schemaMigrate', detail: '存档已跨版本迁移：v' + mig.from + '→v' + mig.to + '（' + mig.steps + ' 步）' });
      }
    }
    // v0.1.27: API 通道健康——只统计已配置且有调用的通道
    const apiSec = ((diag.runtime || {}).apiRouter || {});
    const callRows = ((apiSec.calls || {}).channels || []);
    const badCh = callRows.filter(function (r) { return r.errors > 0 && r.ok === 0 && r.count > 0; });
    if (badCh.length) issues.push({ level: 'error', key: 'api', detail: badCh.map(function (r) { return r.channel + ' 通道 ' + r.count + ' 次调用全失败（' + (r.errorKinds || '未知') + '）'; }).join('；') });
    else {
      const lossy = callRows.filter(function (r) { return r.errors > 0; });
      if (lossy.length) issues.push({ level: 'warn', key: 'api', detail: lossy.map(function (r) { return r.channel + ' 有 ' + r.errors + '/' + r.count + ' 次失败（' + r.errorKinds + '）'; }).join('；') });
    }
    // v0.1.28: 事件总线异常分级——监听器抛错 warn、有发出无监听 warn、泄漏嫌疑 warn
    const bus = diag.bus || {};
    if ((bus.failing || []).length) issues.push({ level: 'warn', key: 'bus', detail: '事件监听器抛错：' + bus.failing.map(function (r) { return r.event + '(' + r.errors + ')'; }).join('、') });
    if ((bus.deadSignals || []).length) issues.push({ level: 'warn', key: 'bus', detail: '事件有发出但无人监听（接线断裂）：' + bus.deadSignals.map(function (r) { return r.event + '×' + r.dead; }).join('、') });
    if ((bus.leakSuspects || []).length) issues.push({ level: 'warn', key: 'bus', detail: '监听器数量异常（疑似重复订阅未解绑）：' + bus.leakSuspects.map(function (r) { return r.event + '=' + r.listeners; }).join('、') });
    // v2.13.0: 挤出侧议题（七面治理最后一面）。
    //   为什么诊断必须看它：挤出是本仓库唯一「按设计丢数据」的路径。写失败用户看得出
    //   （数据没变），删失败复核能发现（数据还在），而**挤出成功 → 数据真的没了，且这正是
    //   代码的本意**——于是「长局 200 轮后 NPC 只剩 48 个」在面板/诊断/健康分上全无出口。
    //   分级：evictFailed>0 是缺陷（未知站点/参数非法＝代码问题）报 error；
    //   正常挤出报 info，但**必须点名站点与最近丢弃物**（只说「丢了 N 条」等于什么都没说）。
    const ev = diag.runtime && diag.runtime.evict;
    if (ev && typeof ev.evictFailed === 'number' && ev.evictFailed > 0) {
      issues.push({ level: 'error', key: 'evict.failed', detail: '挤出侧 ' + ev.evictFailed + ' 次失败（' + JSON.stringify(ev.failedBy || {}) + '）：站点未登记或参数非法，数据未被截断而是继续超限增长——须改代码，不是清存储' });
    } else if (ev && ev.evicts > 0) {
      const _topSites = Object.keys(ev.bySite || {}).sort(function (a, b) { return ev.bySite[b].dropped - ev.bySite[a].dropped; }).slice(0, 3)
        .map(function (s) { return s + '(' + ev.bySite[s].dropped + ')'; });
      // v2.13.0（端到端审计自纠）：点名**最频繁站点各自丢了谁**，而不是只给全局最近几条。
      //   现场：长局里 people 丢 32 人、chronicle 丢 60 条，而全局环形只留最近 12 条摘要，
      //   于是议题只能说「最近被挤出的是：伏笔17、伏笔18」——「丢了哪 32 个角色」看不见。
      const _topSite = Object.keys(ev.bySite || {}).sort(function (a, b) { return ev.bySite[b].dropped - ev.bySite[a].dropped; })[0];
      const _topWhat = ((ev.bySite || {})[_topSite] || {}).lastWhat || [];
      const _what = _topWhat.slice(-3).join('、') || (ev.lastDropped || []).slice(-3).map(function (x) { return x.what; }).join('、');
      issues.push({ level: 'info', key: 'evict', detail: '容量挤出 ' + ev.evicts + ' 次 / 丢弃 ' + ev.evicted + ' 项（涉及 ' + Object.keys(ev.bySite || {}).length + ' 个站点，最频繁：' + (_topSites.join('、') || '—') + '）；' + _topSite + ' 最近被挤出的是：' + (_what || '—') + '——有界收纳属设计内，但「丢的是谁」应可见' });
    }
    const ldr = (diag.runtime || {}).loader || {};
    // v0.1.25: 加载失败的模块点名（对照装载清单升级为 error）
    if (ldr.failedModules && ldr.failedModules.length) {
      const failedRels = ldr.failedModules.map(function (f) { return f.rel; });
      const hit = (m.missing || []).filter(function (x) { return failedRels.indexOf(x.file) >= 0; });
      issues.push({ level: hit.length ? 'error' : 'warn', key: 'loader', detail: hit.length ? '加载失败且导出缺失的模块：' + hit.map(function (x) { return x.file; }).join('、') : '曾加载失败但导出齐全（可能已恢复）：' + failedRels.join('、') });
    }
    if (ldr.cdnCooldowns && ldr.cdnCooldowns.length >= 3) issues.push({ level: 'warn', key: 'loader', detail: '全部 3 个 CDN 容灾源均在冷却中（60s 内不重试），期间加载失败模块将彻底失败' });
    // v2.2.0: 兼容层——桥上不去要能说话（此前「MVU 没同步」在任何报告里都看不见）
    //   口径：status 缺失 = error（死代码回归）；reason 以 error: 开头 = error（真故障）；
    //        其余（no-chat-metadata / mvu-not-enabled）= info（宿主没开该能力，不是扩展的错）。
    const cp = diag.compat || {};
    if (cp.mvuLoaded === false) issues.push({ level: 'warn', key: 'compat.mvu', detail: 'compatMvu 模块不可用：世界状态不会镜像进 MVU stat_data' });
    else if (cp.mvu && cp.mvu.failed) issues.push({ level: 'error', key: 'compat.mvu', detail: 'MVU 兼容层异常：' + cp.mvu.reason });
    else if (cp.mvu && !cp.mvu.active) issues.push({ level: 'info', key: 'compat.mvu', detail: 'MVU 未激活（' + (cp.mvu.reason || '未知') + '）：宿主未启用 MVU 变量框架，镜像通道待命' });
    else if (cp.mvu && cp.mvu.active) issues.push({ level: 'info', key: 'compat.mvu', detail: 'MVU 已激活：已同步 ' + cp.mvu.syncCount + ' 次' });
    if (cp.thLoaded === false) issues.push({ level: 'warn', key: 'compat.th', detail: 'compatTH 模块不可用：TH 脚本/正则无法读取世界状态快照' });
    else if (cp.th && cp.th.failed) issues.push({ level: 'error', key: 'compat.th', detail: 'TH 桥接异常：' + cp.th.reason });
    else if (cp.th && cp.th.active) issues.push({ level: 'info', key: 'compat.th', detail: 'TH 桥接已暴露 WorldAxisSnapshot()' });
    // v2.2.0: 设置键卫生——孤儿候选是「模块自己声明废弃却还挂在登记表里」的幽灵配置
    const sbDiag = ((diag.runtime || {}).settingsBus) || {};
    const orphanN = (sbDiag.orphans || []).length;
    if (orphanN > 0) issues.push({ level: 'info', key: 'settingsBus.orphan', detail: orphanN + ' 个孤儿设置键登记（模块已声明废弃）：' + (sbDiag.orphans || []).slice(0, 4).map(function (o) { return o.key; }).join('、') + '——面板「工具」→「设置键」可注销' });
    // v2.3.0: 登记表自洽性——重复登记/矛盾声明会让「哪条登记在生效」变得不可判定，属真故障
    //   口径：orphan_still_read / duplicate-key / orphan_optional_conflict = error（登记表与实际行为不一致）
    //         missing-def = warn（缺失键时读到 undefined，但不阻断运行）
    const cohD = sbDiag.coherent || null;
    if (cohD && cohD.issues && cohD.issues.length) {
      const errsC = cohD.issues.filter(function (i) { return i.level === 'error'; });
      const warnsC = cohD.issues.filter(function (i) { return i.level === 'warn'; });
      if (errsC.length) issues.push({ level: 'error', key: 'settingsBus.coherent', detail: '设置登记表不自洽（' + errsC.length + ' 项）：' + errsC.slice(0, 3).map(function (i) { return i.detail; }).join('；') });
      else if (warnsC.length) issues.push({ level: 'warn', key: 'settingsBus.coherent', detail: '设置登记表待补声明（' + warnsC.length + ' 项）：' + warnsC.slice(0, 3).map(function (i) { return i.detail; }).join('；') });
    }
    // v2.3.0: 默认值漂移——「用户没配置时的实际行为」与「登记表展示的默认值」不一致
    const driftD = sbDiag.defaultDrift || null;
    if (driftD && driftD.drift && driftD.drift.length) {
      issues.push({ level: 'warn', key: 'settingsBus.defaultDrift', detail: driftD.drift.length + ' 项设置默认值与登记声明不一致：' + driftD.drift.slice(0, 3).map(function (x) { return x.key + '(' + x.source + ')'; }).join('、') + '——诊断展示的默认值已过时' });
    }
    const dormantD = (sbDiag.dormant || []);
    if (dormantD.length) issues.push({ level: 'info', key: 'settingsBus.dormant', detail: dormantD.length + ' 个休眠登记（模块声明废弃但从未落盘）：' + dormantD.slice(0, 3).map(function (o) { return o.key; }).join('、') });
    // v2.4.0: 子键缺口——老存档缺新字段。运行时已自愈（read 补默认值），但用户实际配置
    //   仍少几项，属需要告知的状态（不是 error：行为已按默认值正确回落）。
    const skD = sbDiag.subkeys || null;
    if (skD && skD.keys && skD.keys.length) {
      issues.push({ level: 'info', key: 'settingsBus.subkeys', detail: skD.keys.length + ' 个设置键存在子键缺口（共缺 ' + skD.totalMissing + ' 项，运行已按声明补默认值）：' + skD.keys.slice(0, 3).map(function (x) { return (x.module || '?') + '.' + x.missing.slice(0, 3).join('/'); }).join('、') + '——下次保存设置即写回完整结构' });
    }
    // v2.5.0: 结构迁移失败——迁移抛错 = 旧结构继续被当作畸形值消费，属真故障（必须人处理）
    const migD = sbDiag.migrations || null;
    if (migD && migD.failed > 0) {
      issues.push({ level: 'error', key: 'settingsBus.migration', detail: migD.failed + ' 个设置键的结构迁移抛错（' + (migD.failedKeys || []).slice(0, 3).join('、') + '）：这些键会按原值继续被消费，结构升级未完成' });
    } else if (migD && migD.ok > 0) {
      issues.push({ level: 'info', key: 'settingsBus.migration', detail: '已成功迁移 ' + migD.ok + ' 个设置键的存储结构（最近 ' + ((migD.last || {}).key || '?') + '）' });
    }
    // v2.5.0: 生命周期空转——「登记表声明了迁移能力却一个键都没行使」是治理盲区（此前正是如此：
    //   migrate 字段零调用、rawRevive 根本不存在，而面板与诊断都看不见这种空转）。
    //   口径：info 级（新装用户本就不该有迁移发生），但一旦某类能力声明数为 0 就点名，防止再次退化。
    const lcD = sbDiag.lifecycle || null;
    if (lcD && lcD.migrate === 0 && lcD.rawRevive === 0) {
      issues.push({ level: 'info', key: 'settingsBus.lifecycle', detail: '全部 ' + ((sbDiag.registry || {}).total || '?') + ' 个设置键都未声明生命周期钩子（migrate / rawRevive 均为 0）：本插件结构仍在演化，无键声明升级路径意味着缺声明或能力再次空转' });
    }
    // v2.5.0: 幽灵设置键——未登记（登记表管不到）且被当用户数据保护（清理规则管不到）的责任真空。
    //   实证案例 worldaxis_director_tags_v1：v0.1.0 引入 → v0.2.0 移除 → 至今永久滞留用户磁盘。
    const ghD = sbDiag.ghosts || null;
    if (ghD && ghD.total > 0) {
      issues.push({ level: 'warn', key: 'settingsBus.ghosts', detail: ghD.total + ' 个未登记设置键滞留磁盘（共 ' + Math.round(ghD.bytes / 1024 * 10) / 10 + 'KB，登记表与清理规则都不覆盖）：' + ghD.keys.slice(0, 3).map(function (x) { return x.key.replace(/^worldaxis_/, '') + '(' + x.bytes + 'B)'; }).join('、') + '——如需清理，用「存储键体检」并显式开启幽灵设置项' });
    }
    // v2.6.0: 写入失败——用户点了保存却没落盘，是「配置丢失」里最难取证的一类。
    //   分级：writeFailed>0 即 warn（可能是历史失败后已恢复），最近一次失败仍未被后续成功写入
    //   覆盖（lastError 非空）则 error（当下正在丢配置）。两者必须分开：只看累计数无法判断
    //   「还在坏」还是「曾经坏过一次」，而这正是用户要的结论。
    const wD = sbDiag.writes || null;
    if (wD && wD.writeFailed > 0) {
      // v2.6.0（收口）: 归因必须区分「环境问题」与「代码缺陷」。首版只说「配额已满」，会把
      //   登记项未声明 key / 值不可序列化这类**实现缺陷**也引导用户去清存储——照着提示修永远修不好。
      //   来源分类 bySource 由写出口统一记账（本版收口后覆盖全部写路径，见 settings-bus 的 lsWrite）。
      const WRITE_SRC_LABEL = { missingKey: '登记项缺key(实现缺陷)', stringify: '值不可序列化(实现缺陷)',
        setItem: '写盘被拒(配额/隐私模式)', writeback: '迁移回写', rawRevive: '格式复活',
        quarantine: '损坏隔离副本', legacy: '旧键迁移', stamp: '结构指纹',
        verify: '写后读回不一致' };
      const wBy = wD.bySource || {};
      const srcTxt = Object.keys(wBy).filter(function (k) { return wBy[k] > 0; })
        .map(function (k) { return (WRITE_SRC_LABEL[k] || k) + '×' + wBy[k]; }).join('、');
      const codeBug = (wBy.missingKey || 0) + (wBy.stringify || 0) > 0;
      const errNow = wD.lastError ? '，最近一次失败原因为 ' + String(wD.lastError).slice(0, 80) + '（此后尚无成功写入覆盖）' : '';
      issues.push({ level: wD.lastError ? 'error' : 'warn', key: 'settingsBus.write',
        detail: '设置写盘失败 ' + wD.writeFailed + ' 次（成功 ' + wD.writes + ' 次）'
          + (srcTxt ? '，来源：' + srcTxt : '') + errNow
          + (codeBug ? '：其中含**实现缺陷**（登记项未声明 key / 值不可序列化），须改调用方，清存储无效'
                     : '：配额已满/隐私模式/键被拒绝时，用户改动不会落盘且界面无提示') });
    }
    // v2.7.0: 「写盘被拒」与「写进去又没留住」分列——setItem 不抛错 ≠ 数据在盘上。
    //   两者处置完全不同：前者清空间/关隐私模式即可，后者是存储层静默截断（只能留证/换键）。
    if (wD && wD.verifyFailed > 0) {
      const stg = wD.staged || {};
      issues.push({ level: 'error', key: 'settingsBus.writeStaged',
        detail: '设置写盘 ' + wD.verifyFailed + ' 次**写完读回不一致**（最近 ' + (stg.key || '?') + '：' + (stg.reason || '?') + '）'
          + '——setItem 没报错但磁盘上的值不是刚写的那份：移动端配额临界/写入毒化/后台回收下会静默发生。'
          + '此类失败重试无效，请先导出配置与诊断包留证' });
    }
    if (wD && wD.subkeyDrift && wD.subkeyDrift.count > 0) {
      const lp = wD.subkeyDrift.last || {};
      issues.push({ level: 'warn', key: 'settingsBus.subkeyDrift',
        detail: '写入侧出现 ' + wD.subkeyDrift.count + ' 个登记 def 之外的子键' + (lp.key ? '（最近 ' + lp.key + '：' + (lp.keys || []).slice(0, 4).join('/') + '）' : '') + '：迁移只治存量（老存档），这些是调用方新写入的存量之外死键，需在调用点收口' });
    }
    // v2.9.0: 删除侧失败——「清理了却没清掉」是「空间清不出来」里最难取证的一类。
    //   与写入侧同一裁决口径：静默无效（removeItem 没抛错但键仍在）→ error（当下正在骗人）；
    //   删除抛错 → warn（可恢复，但相关键仍在磁盘上）。
    const rmD = sbDiag.removes || null;
    // v2.9.0（当前态口径）: 用 lastRemoveStaged / lastRemoveError（rmRemove 每次调用先清零）
    //   而非累计数——与 store.integrityStat 的 lastOk 同裁决，且保证「恢复后不再报」可成立。
    if (rmD && rmD.lastRemoveStaged) {
      const stgR = rmD.lastRemoveStaged || {};
      issues.push({ level: 'error', key: 'settingsBus.removeStaged',
        detail: '设置键删除 ' + rmD.removeStaged + ' 次**删完读回仍在**（最近 ' + String(stgR.key || '?').slice(0, 60) + '）'
          + '——removeItem 没报错但键还在磁盘上：清理报出的「已释放」与实际不符，别依赖计数判断空间是否腾出。'
          + '此类失败重试同一动作通常无效，请先导出诊断包留证' });
    }
    else if (rmD && rmD.lastRemoveError) {
      const byR = rmD.removeFailedBy || {};
      const srcRTxt = Object.keys(byR).filter(function (k) { return byR[k] > 0; })
        .map(function (k) { return ({ guarded: '删完仍在', missing: '登记项缺 key', setItem: '删除被拒', quarantine: '隔离路径', legacy: '旧键迁移', settings: '设置键出口', verifyBack: '写后/删后复核读回', permission: '无 delete 位被拦' }[k] || k) + '×' + byR[k]; }).join('、');
      issues.push({ level: 'warn', key: 'settingsBus.remove',
        detail: '设置键删除失败 ' + rmD.removeFailed + ' 次（成功 ' + rmD.removes + ' 次）'
          + (srcRTxt ? '，来源：' + srcRTxt : '')
          + (rmD.lastRemoveError ? '，最近原因 ' + String(rmD.lastRemoveError).slice(0, 80) : '')
          + '：删除失败时相关键仍在磁盘上占据空间，而清理策略已把它计入「已释放」' });
    }
    // v2.10.0: 读侧失败——「拿到的是默认值而不是用户配置」是唯一会被用户当成
    //   「设置被程序改回去了」的故障，而此前它在诊断包里**完全不存在**（单桶 failures 零消费）。
    //   分级裁决：`defaultAfterFailure > 0` ⇒ error（用户当前看到的配置不是他配的，属当下失真）；
    //   仅有 copyFallback ⇒ warn（返回值与内部对象共享引用，改动可能「莫名生效」）。
    const rdD = sbDiag.reads || null;
    if (rdD && rdD.defaultAfterFailure > 0) {
      const lf = rdD.lastFail || {};
      issues.push({ level: 'error', key: 'settingsBus.readFailed',
        detail: '设置读取失败 ' + rdD.defaultAfterFailure + ' 次**回落了默认值**（读取总次数 ' + rdD.reads
          + (lf.tag ? '，最近来源 ' + lf.tag : '') + '）：磁盘上曾有用户配置但没读成功，用户看到的「设置」并不是他配的东西'
          + '——与「从未配置」在界面上完全一样。若是配额/隐私模式导致，先导出诊断包留证再排查' });
    } else if (rdD && rdD.readFailed > 0) {
      const byRd = rdD.bySource || {};
      const srcTxt = Object.keys(byRd).filter(function (k) { return byRd[k] > 0; })
        .map(function (k) { return ({ read: '存储层读取', parse: '值解析', migrate: '迁移', copy: '返回值拷贝',
          rmExisted: '受控删除的存在性探测', verifyBack: '写后/删后复核读回', legacyRead: 'legacy 旧键读取',
          saveInherit: '保存时继承结构指纹', subkeyAudit: '子键缺口盘点', pendingOrphan: '幽灵键盘点',
          verifyDefaults: '默认值声明校验', lsRaw: '幽灵设置盘点原文' }[k] || k) + '×' + byRd[k]; }).join('、');
      issues.push({ level: 'warn', key: 'settingsBus.readFailed',
        detail: '设置读取失败 ' + rdD.readFailed + ' 次' + (srcTxt ? '（来源：' + srcTxt + '）' : '')
          + (rdD.lastError ? '，最近原因 ' + String(rdD.lastError).slice(0, 80) : '')
          + '：这些读取未命中用户配置（多数已回落默认值或旧值）' });
    }
    // v2.10.0（逆向审计自纠）: 抽查结论——这是 `readEx` 的真实消费端，也是唯一能回答
    //   「诊断包里那份配置可信吗」的判据（readStat 只说发生过多少次，抽查说的是**现在**）。
    const rdSpot = sbDiag.readSpotCheck || null;
    if (rdSpot && rdSpot.misses && rdSpot.misses.length) {
      issues.push({ level: 'error', key: 'settingsBus.readSpotCheck',
        detail: '现场抽查 ' + rdSpot.checked + ' 个有值的设置键，其中 ' + rdSpot.misses.length
          + ' 个**没读到用户配置**（' + rdSpot.misses.slice(0, 3).map(function (m) { return m.key + ':' + (m.reason || m.source); }).join('、')
          + '）：这些键在磁盘上有数据却读不回来，诊断与界面展示的是兜底默认值' });
    }
    // v2.11.0（面B 消费端）: 结构指纹陈旧——回答「这份磁盘值是**哪一个结构版本**写的」。
    //   此前 `.d` / `.at` 零消费、无任何出口：指纹不符时引擎静默重盖，于是「键的结构在上个
    //   版本变过而迁移钩子未行使」这件事只能靠人猜。它的后果不是读不到，而是**在错的形状上
    //   生效**：缩减型结构变更会让旧子键被原样写回，新增型则由补齐逻辑兜住（两者后果不同，
    //   故 detail 里逐条写明）；而指纹写入失败意味着「结构版本」这一维度在磁盘上不可查。
    //   判据裁决：指纹陈旧是**已被重盖动作自愈**的经历，属 warn——与 readFailed 同规格的
    //   「warn 用经历（累计）、error 用当前态」（v0.4.0 裁决）。此前本处注释自称「当前态判据」
    //   而实现取 lastStale 的存在性＝累计语义，是**归因不实**（本版自身命题所治的毛病），
    //   故当版改正：detail 里如实给出「本会话发生过几次」，避免只看最近一次会把「一次」
    //   读成「一直在」。详情字段（prevDigest / prevAt）自 v2.5.0 写盘起首次被消费。
    const rdSchema = sbDiag.schema || null;
    if (rdSchema && rdSchema.lastStale) {
      const lsS = rdSchema.lastStale;
      issues.push({ level: 'warn', key: 'settingsBus.schemaStale',
        detail: '设置键 ' + String(lsS.key || '?') + ' 的磁盘结构指纹与当前声明不符（本会话累计 '
          + String((rdSchema.status || {}).stale || 1) + ' 次；最近一次旧结构摘要 '
          + String(lsS.prevDigest || String(lsS.prevFp || '?').slice(0, 8))
          + (lsS.prevAt ? '，于 ' + new Date(lsS.prevAt).toLocaleString() + ' 写入' : '')
          + '）：已按当前结构重盖。这通常意味着该键的结构在上个版本变过、而迁移钩子未行使——'
          + '若该变更是**缩减型**（删过子键），旧子键会被原样写回；若为**新增型**，'
          + '旧存档缺的子键由补齐逻辑兜住（后者无害，前者需在迁移钩子里补一次显式清除）' });
    }
    if (rdSchema && rdSchema.status && rdSchema.status.failed > 0) {
      issues.push({ level: 'warn', key: 'settingsBus.schemaStampFailed',
        detail: '结构指纹写入失败 ' + rdSchema.status.failed + ' 次：每次读取都会重算并重试，'
          + '因此「这份值属于哪个结构版本」在磁盘上始终不可查——'
          + '后续结构变更将无法判定该键是「旧形状」还是「本就未盖章」，'
          + '缩减型迁移会被跳过。若为配额/隐私模式导致，请先导出诊断包留证' });
    }
    // v2.11.0（R3 自纠）: 结构**读不出来**与「从未配置」分开报（error 级）。
    //   为什么是 error 而不是 warn：读侧既有的 `defaultAfterFailure > 0` 口径已把
    //   「磁盘上有用户数据却没读到」定为 error（用户当前看到的配置不是他配的）。
    //   本项是同一件事在**结构维度**上的呈现，且它意味着这些键此刻正以默认值运行——
    //   不报出来用户就会按「我没配过」处理，而不是去导出诊断包留证。
    //   但**不与上面那条合并计数**：`unreadable` 表示「值读不出来」，`failed` 表示
    //   「值读得出来、只是结构标识写不进盘」——前者用户需要重建该键，后者只需留意。
    if (rdSchema && rdSchema.status && rdSchema.status.unreadable > 0) {
      issues.push({ level: 'error', key: 'settingsBus.schemaUnreadable',
        detail: '有 ' + rdSchema.status.unreadable + ' 次设置读取遇到**磁盘上有值但读不出结构**：'
          + '损坏值已被隔离副本留证并回落默认值，因此本次运行中这些键的配置**不是用户配的那份**。'
          + '「有配置被读坏」与「从未配置」是两种事故——前者请导出诊断包留证（含隔离副本）'
          + '再决定是否重建该键，后者无需处理' });
    }
    if (rdD && rdD.copyFallback > 0) {
      issues.push({ level: 'warn', key: 'settingsBus.readonlyCopy',
        detail: '设置读取返回值深拷贝降级 ' + rdD.copyFallback + ' 次（最近 '
          + String(((rdD.lastCopyFallback || {}).key) || '?').slice(0, 60) + '）：返回的是总线内部对象的引用，'
          + '消费端改动它会影响后续读取，而磁盘上一个字节都没变（改动「莫名生效」的来源之一）' });
    }
    // v2.10.0: store 域读侧失败——与 settingsBus 侧同判据、同分级。两处都报的理由与删除侧相同：
    //   两个域有各自独立的裸读点，只报一处会让另一半的「容量表偏小 / 误判最冷」继续不可见。
    const rdStore = ((diag.worldState || {}).storage || {}).read || null;
    if (rdStore && !rdStore.ok) {
      const byS = rdStore.bySource || {};
      // v2.10.0（逆向审计自纠第四轮）: 来源明细**全量列出**。此前只列 bytes/activity/enumerate
      //   三个已知来源，而 noteStoreReadFail 支持动态建桶 ⇒ 本版新增的读点（diskRev / verify /
      //   recovery / conflict / quarantine / writerId）会「有归因但在诊断里看不见」。
      //   每个来源的后果不同（有的只是容量数字失真，有的是静默覆盖/丢恢复点），必须逐项可读。
      // v2.11.0: 标签表必须覆盖**全部**归因点。store 域来源包括 core 侧的
      //   load / saveConflict / verifyState / verify / recovery / conflict / quarantine /
      //   writerId / diskRev，以及引擎侧 chatcache* / worldbookSelection / workflowHistory /
      //   uninjectLedger / eventLog / errorLog / readSpotCheck。缺标签 ⇒ 消费端退回裸桶名
      //   ⇒ 「有归因但看不懂」。（v2.26.0 修正：rmExisted/verifyBack/legacyRead/saveInherit/
      //   subkeyAudit/pendingOrphan/verifyDefaults/lsRaw 属 settings-bus 域，已移出本表。）
      // v2.26.0（第十四面）：本表是 store 读侧标签的**第三份真源**（另两份：core/store.js 的 LAB、
      //   ui/panel.js 的 LAB_P）。此前它同时犯了两处「跨域错放」——漏了 store 域自己的
      //   `readSpotCheck`，又混入 8 个 **settings-bus 域**键（rmExisted / verifyBack / legacyRead /
      //   saveInherit / subkeyAudit / pendingOrphan / verifyDefaults / lsRaw）：这 8 个投递的是
      //   settings-bus 的 readFailedBy，由 toolDiag.readLabel 管。后果与 v2.22.0/v2.23.0 同型——
      //   诊断包里 store 读失败明细「缺标签退回裸桶名 + 幽灵标签永不被消费」，而这份表**此前无门禁**。
      //   判据已补：tests/ui-gate-sync.js 的 toolDiag.SRC_LABEL 组（= store 读侧真源键集）。
      const SRC_LABEL = {
        bytes: '容量计量', activity: '活跃时间', enumerate: '键枚举',
        diskRev: '磁盘序号（读失败 ⇒ 并发覆盖检测失效）',
        verify: '写后校验/删后复核的读回', recovery: '恢复点清单',
        conflict: '冲突现场', quarantine: '隔离现场', writerId: '写入者标识',
        load: '存档载入（读失败 ⇒ 整份存档不可见）',
        saveConflict: '并发覆盖前的保全读回（读失败 ⇒ 对方进度未被保全）',
        verifyState: '存档巡检',
        // v2.11.0（逆向审计自纠）: `readSpotCheck` 是本版新增的 store 域归因来源
        //   （tool-diag 自己的抽查列目录读失败），首版漏进本表 ⇒ 消费端退回裸桶名，
        //   读者只看到 `readSpotCheck×1` 而不知其后果。归因**不可读**等于归因不实
        //   （本仓库既有裁决），故补标签并加断言钉住「凡是投递进 store 台账的来源都得有标签」。
        readSpotCheck: '诊断抽查列目录',
        chatcacheState: '聊天快照',
        chatcacheRev: '同步修订号（读失败 ⇒ 同步序号判成倒退）',
        chatcacheInstallBack: '快照安装回读（唯一能发现静默截断处）',
        worldbookSelection: '世界书条目选择（读失败 ⇒ 注入静默少一块）',
        workflowHistory: '工作流历史', uninjectLedger: '撤销注入账本（读失败 ⇒ 重复注入）',
        eventLog: '事件日志载入', errorLog: '错误日志载入',
        // v2.108.0 (plan-1 #18): store 域新增归因来源（L2 自愈读后备键）。
        //   漏进本表 ⇒ 诊断包退回裸桶名；而「读不到后备键」与「没有后备键」是两种完全不同的
        //   处置建议（前者查环境/隐私模式，后者查备份周期是否跑过），不可混同。
        recoverBak: '后备存档读回（读失败 ⇒ L2 自愈不可用）',
        // v2.294.0（V8 收口）：player-archive 投递 reportReadFail('playerArchive')。
        //   三份标签表（store.LAB / panel.LAB_P / toolDiag.SRC_LABEL）同源同键集 ——
        //   缺这一条时诊断包会退回裸桶名 reader，等于「有归因但看不懂」。
        playerArchive: '玩家归档读回（读失败 ⇒ 会答成「还没归档过」）',
        // v2.113.0（A1 收口）: 审计落盘面新增两个 store 域归因来源。
        //   成因与 recoverBak 同型：v2.112.0 给 auditLog 加了落盘（flush / restore），两处裸读
        //   localStorage 却**不投递归因**——「盘坏了」与「盘上本来就没历史」在诊断上同形。
        //   两处已补投 store.reportReadFail（与 chatcache 同一条出口），故此处必须同步贴标签：
        //   漏进本表 = 消费端退回裸桶名，等于把「读失败静默」换成「读失败可读但读不懂」。
        auditlogFlush: '审计日志落盘前的历史读回（读失败 ⇒ 按「无历史」重建，磁盘前缀可能被覆盖）',
        auditlogRestore: '审计日志历史读回（读失败 ⇒ 与「本次会话没有历史」同形）',
        // v2.132.0（O19）: 跨会话轮转游标的读回（life.turnLoad 的 JSON 解析失败）。
        //   漏进本表 = 消费端退回裸桶名，读者只看到 `lifeTurn×1` 而不知其后果。
        //   为什么这条**必须可读**：读失败时本模块如实答「本会话从 0 开始」（**不回落**是
        //   刻意设计），而那与「真的从 0 开始」在面板与诊断上同形 —— 标签就是那个唯一的分辨口
        //   （「游标读不出来 ⇒ 这一轮从谁开始是猜的」，与「游标本来就是 0」是两件事）。
        lifeTurn: '跨会话轮转游标读回（读失败 ⇒ 本会话轮转起点按 0 计，与「真的从 0 开始」同形）',
        // v2.156.0（SP1）：与 store.LAB / panel.LAB_P 同源同键集。漏进本表 ⇒ 消费端退回裸桶名，
        //   而「活动基准读不出来」与「本聊天从没记过」在无标签时同形（前者要查存储，后者是正常开局）。
        playtime: '游玩活动基准读回（读失败 ⇒ 与「本聊天从没记过」同形）',
        // v2.156.0（S1）：离线恢复**不新增任何存储键**（票据就是世界状态里的 lastSettledAt），
        //   故本表没有它对应的条目 —— 这不是遗漏，是「零 localStorage」这条边界在诊断面上的样子。
        // v2.203.0（读侧归因收口）：store 域新增两个来源（history-search / world-snapshot 的裸读）。
        //   漏进本表 = 消费端退回裸桶名 ⇒ 读者只看到 `historySearch×1` 而不知其后果。
        //   同族先例：v2.11.0 的 readSpotCheck（自己新增的来源首版漏标）、v2.132.0 的 lifeTurn。
        historySearch: '历史检索词库读回（读失败 ⇒ 与「从来没查过」同形）',
        worldSnapshot: '世界快照库读回（读失败 ⇒ 与「本地没有快照」同形）',
        tapeStore: '磁带仓库读回（读失败 ⇒ 空仓库与存储故障同形）',
        // v2.274.0（V6 收口）：capability-audit 的 wroteFalse 读回点（G16 新增来源）。
        //   漏进本表 = 消费端退回裸桶名 ⇒ 读者只看到 `capabilityAudit×1` 而不知其后果。
        capabilityAudit: '能力档位表态读回（读失败 ⇒ 与「玩家没表过态」同形）',
        // v2.381.0 收口：两个新引擎的裸读点补投归因（G16 排查）。与 store.LAB / panel.LAB_P 同源同键集。
        //   漏进本表 ⇒ 诊断包退回裸桶名 ⇒ 读者只看到 `channelProbe×1` / `inlineTags×1` 而不知其后果。
        channelProbe: '渠道探针账本读回（读失败 ⇒ 与「本渠道还没有任何结论」同形）',
        inlineTags: '内联标签解析账读回（读失败 ⇒ 与「本聊天还没有任何内联标签」同形）'
      };
      const srcTxt = Object.keys(byS).filter(function (k) { return byS[k] > 0; })
        .map(function (k) { return (SRC_LABEL[k] || k) + '×' + byS[k]; }).join('、');
      issues.push({ level: 'warn', key: 'store.readFailed',
        detail: '存储读取失败 ' + rdStore.readFailed + ' 次（' + srcTxt + '）：读失败的键被按 0 字节计入，占用表**偏小**；'
          + '活跃时间回落 0 会被判为「最冷」而进入可回收候选——据此清理存储可能误删仍在用的聊天' });
    }
    // v2.11.0: 结论级读失败——容量数字失真只是「算不准」，以下几种是「结论本身不成立」，
    //   故必须单列且分级更重（与 store.maintain 同判据、同分级，两处都报）。
    //   判据一律取**最近一次读失败事件**（lastFail.source）：累计数只增不减，会让历史失败
    //   永久挂红（v0.4.0 裁决；本仓库已因同型坑自纠四次）。
    const lfSrc = (rdStore && rdStore.lastFail && rdStore.lastFail.source) || null;
    if (lfSrc === 'load') {
      issues.push({ level: 'error', key: 'store.readLoadBlocked',
        detail: '**最近一次**存储读取失败发生在存档载入上：当前聊天整份存档对本实例不可见，'
          + '诊断包呈现的是默认世界而磁盘上仍有用户进度——此时**任何保存都会用空状态覆盖真档**。'
          + '请先导出诊断包留证，再排查存储可读性' });
    }
    if (lfSrc === 'saveConflict') {
      issues.push({ level: 'error', key: 'store.coverageUnpreserved',
        detail: '**最近一次**存储读取失败发生在并发覆盖前的保全读回上：已确认另一实例写过该聊天、'
          + '本次保存将覆盖其改动，而对方 payload 读不出来 ⇒ **本次覆盖未能保全对方进度**，'
          + '他实例的改动已被静默吞掉且无现场可查（与「已保全为冲突现场」是两回事）' });
    }
    if (lfSrc === 'verifyState') {
      issues.push({ level: 'error', key: 'store.readVerifyBlocked',
        detail: '**最近一次**存储读取失败发生在存档巡检上：巡检报告「所有聊天存档可解析」这一结论'
          + '建立在一次失败的读取之上——该聊天既未被判定正常、也未被判定损坏（结论留了空档）' });
    }
    if (lfSrc === 'chatcacheInstallBack') {
      issues.push({ level: 'warn', key: 'store.readInstallBlocked',
        detail: '**最近一次**存储读取失败发生在快照安装回读上：安装后无法确认磁盘内容与安装值一致，'
          + '静默截断与读失败在本会话内不可分辨（这是唯一能发现安装被截断的检查）' });
    }
    // v2.10.0（逆向审计自纠第四轮）: 「恢复点保护失效」单列 error。
    //   恢复点清单读失败时 createRecoveryPoint **拒绝写入**（保命优先：宁可不建点，也不覆盖丢弃
    //   用户全部历史恢复点）。但「保护住了」不等于「没事」——此刻用户实际处于**无恢复点保护**
    //   状态，一旦继续推进就再也退不回来。这是当下缺陷（不是历史经历），故为 error。
    // 判据用**最近一次读失败事件**（与健康分的 lastReason/lastOk 同规格）：累计数只增不减，
    //   拿它做当前态判据会让「历史失败」永久挂红（v0.4.0 裁决）；累计值只进 detail 作可追溯。
    if (rdStore && rdStore.lastFail && rdStore.lastFail.source === 'recovery') {
      issues.push({ level: 'error', key: 'store.readRecoveryBlocked',
        detail: '**最近一次**存储读取失败发生在恢复点清单上（本会话累计 '
          + ((rdStore.bySource || {}).recovery || 1) + ' 次）：为避免覆盖丢弃全部历史恢复点，'
          + '本会话的恢复点创建已被**跳过**（读不到就不写）——用户当前处于无恢复点保护状态，'
          + '继续推进将无法回退。请先导出诊断包留证再排查存储可读性' });
    }
    // v2.9.0: store 侧受控删除结论——与 settingsBus 侧同判据、同分级。
    //   为什么两处都要报：两个域各自有独立的裸删点（settings-bus 管设置键、store 管
    //   冲突现场/隔离/诊断键），只报一处会让另一半的「删了却没删掉」继续不可见。
    // 读路径必须与采集路径同源。探针实测：store 域的持久化子节挂在 **worldState.storage**
    //   下（secRuntime 只含 chatcache/settingsBus/... 而没有 store），首版读 runtime.storage
    //   在无头环境恒为 undefined ⇒ 这条判据悄悄永不成立（正是本版要治的「结论不实」）。
    const stRm = ((diag.worldState || {}).storage || {}).remove || null;
    if (stRm && stRm.lastReason === 'staged-still-present') {
      issues.push({ level: 'error', key: 'store.removeStaged',
        detail: '受控删除 ' + stRm.staged + ' 次**删完读回仍在**（最近 ' + String(stRm.lastKey || '?').slice(0, 60)
          + '）——removeItem 没报错但键仍在磁盘上：清理报出的「已释放」与实际不符。此类失败重试同一动作'
          + '通常无效（问题在存储层而非时序），请先导出诊断包留证' });
    } else if (stRm && stRm.lastReason) {
      issues.push({ level: 'warn', key: 'store.remove',
        detail: '受控删除失败 ' + stRm.failed + ' 次（成功 ' + stRm.removed + ' 次，最近原因 ' + (stRm.lastReason || 'unknown') + '）'
          + (stRm.lastReason === 'remove-threw' ? '：删除被拒（权限/策略），相关键仍在磁盘上' : '：删除未生效，相关键仍在磁盘上') });
    }
    // v2.4.0: 可见性声明完整性——SOURCES 声明了但 def 未给默认值的源，无法归一化
    const visD = ((diag.runtime || {}).visibility) || null;
    if (visD && visD.undeclared && visD.undeclared.length) {
      issues.push({ level: 'error', key: 'inject.visibilityUndeclared', detail: '注入可见性存在未声明默认值的源（' + visD.undeclared.join('、') + '）：这些开关没有默认值可回落，旧存档下会被判为「关」' });
    }
    // v2.7.0: 存档安装写盘失败——「恢复完成」与「恢复其实没写进去」必须可分辨
    const instD = ((diag.runtime || {}).chatcache || {}).install || null;
    if (instD && instD.failed > 0) {
      issues.push({ level: 'error', key: 'chatcache.install',
        detail: '存档安装写盘失败 ' + instD.failed + '/' + instD.attempts + ' 次（最近 ' + (instD.lastKey || '?') + '：' + (instD.lastReason || '?') + '）'
          + '——跨设备恢复的存档没装进本地，界面提示的成功不代表磁盘上真的换了' });
    }
    const qaD = ((diag.runtime || {}).quarantineAudit) || null;
    if (qaD && (qaD.restores > 0 || qaD.drops > 0)) issues.push({ level: 'info', key: 'quarantine.history', detail: '隔离现场处置史：恢复 ' + qaD.restores + ' 次 / 丢弃 ' + qaD.drops + ' 次' + (qaD.lastKey ? '（最近 ' + qaD.lastKey + '）' : '') });
    // ── v2.50.0（第三十五面）：宿主两侧 + 时间轴三账的议题规则 ─────────────
    // 分级口径照仓库既有规格：
    //   · 「环境没给这个能力」= info（不是故障，但必须可见，否则用户以为已覆盖）；
    //   · 「真有该处理而没处理的事」= warn；
    //   · 「观测本身坏了（载荷形状未知）」= warn（读不出结论 ≠ 没问题）。
    try {
      const hw = diag.hostWb || {};
      if (hw.error) {
        issues.push({ level: 'warn', key: 'hostWb', detail: '宿主世界书激活账不可用：' + hw.error });
      } else if (hw.state === 'unsupported') {
        issues.push({ level: 'info', key: 'hostWb', detail: '宿主未提供世界书激活事件：宿主那一半注入（它自己扫描出的条目）本会话不可观测——这不是「没有激活」，是「无从得知」' });
      } else if (hw.state === 'shape-unknown') {
        issues.push({ level: 'warn', key: 'hostWb', detail: '宿主世界书激活事件的载荷形状未知（保留键：' + ((hw.shapeUnknownKeys || []).join('、') || '?') + '）：已拒绝猜测字段名，本次未做交叉核对' });
      } else if (hw.state === 'awaiting') {
        issues.push({ level: 'info', key: 'hostWb', detail: '已订阅世界书激活事件，本会话尚未派发（宿主只在真实发送时派发）' });
      } else if (hw.state === 'ok' && typeof hw.lastCount === 'number') {
        issues.push({ level: 'info', key: 'hostWb', detail: '宿主世界书本轮激活 ' + hw.lastCount + ' 条' + (hw.sysExcluded ? '（另排除系统条目 ' + hw.sysExcluded + ' 条）' : '') + '：' + (hw.lastNames || []).slice(0, 4).join('、') });
      }
    } catch (eHw) {}
    try {
      const fc = diag.floorChanges || {};
      if (fc.error) {
        issues.push({ level: 'warn', key: 'floorChanges', detail: '楼层变更联动账不可用：' + fc.error });
      } else if (fc.state === 'found') {
        issues.push({ level: 'warn', key: 'floorChanges',
          detail: '有 ' + (fc.missing || []).length + ' 处派生数据引用了**已删除楼层**（' + ((fc.scanned || {}).refs || 0) + ' 个有效引用中）'
            + '｜与结算守卫对账：' + (fc.guardVerdict || '?') + '（' + String(fc.guardNote || '') + '）'
            + '｜本版**不自动回收**（回收不可逆）：' + ((fc.actions || []).map(function (a) { return a.act; }).join('、') || '无') });
      } else if (fc.state === 'changed') {
        issues.push({ level: 'info', key: 'floorChanges', detail: '无楼层缺失，但 ' + (fc.changed || []).length + ' 处派生数据所依据的楼层内容被编辑/重roll：摘要与事实可能已过时（按设计不自动改写）' });
      } else if (fc.state === 'quiet' && fc.subscribedAt === false) {
        issues.push({ level: 'info', key: 'floorChanges', detail: '宿主未提供楼层删除/编辑事件：楼层变更面不可观测（盘点仍可在诊断包手动触发）' });
      }
      const gv = fc.guardVerdict;
      if (gv === 'guard-blind' || gv === 'divergent') {
        issues.push({ level: 'warn', key: 'floorChanges.guard',
          detail: '楼层变更账与结算守卫口径不一致（' + gv + '）：' + String(fc.guardNote || '') + '——两套结论都可能是对的，处置前必须人工判断谁是当前真相' });
      } else if (gv === 'no-guard' || gv === 'unreadable') {
        issues.push({ level: 'info', key: 'floorChanges.guard', detail: '结算守卫不可对账（' + gv + '）：楼层变更账不据此推断一致性' });
      }
    } catch (eFc) {}
    try {
      const lt = diag.ledgerTimeline || {};
      if (lt.error) {
        issues.push({ level: 'warn', key: 'ledgerTimeline', detail: '台账时间轴不可用：' + lt.error });
      } else if (!lt.sites) {
        issues.push({ level: 'info', key: 'ledgerTimeline', detail: '台账时间轴尚未观测到站点（采样点随注入链，本轮尚未写入）' });
      } else {
        if ((lt.failing || []).length) {
          issues.push({ level: 'warn', key: 'ledgerTimeline.failing', detail: (lt.failing || []).length + ' 个台账站点**本窗口内新增失败**：' + (lt.failing || []).slice(0, 4).join('、') + '（单值 lastAt 无法区分「每轮都在失败」与「刚失败一次」，这一面补的正是它）' });
        }
        if ((lt.stalled || []).length) {
          issues.push({ level: 'info', key: 'ledgerTimeline.stalled', detail: (lt.stalled || []).length + ' 个台账站点连续 ' + (lt.stallThreshold || 3) + ' 次以上同态：' + (lt.stalled || []).slice(0, 4).join('、') + '——中性结论，可能是稳定也可能是停摆，需人工核对' });
        }
      }
    } catch (eLt) {}
    const errs = issues.filter(function (i) { return i.level === 'error'; }).length;
    return { ok: errs === 0, errorCount: errs, warnCount: issues.length - errs, issues: issues };
  }

  function toJSON(pretty) {
    const d = collect();
    return pretty === false ? JSON.stringify(d) : JSON.stringify(d, null, 2);
  }
  function summaryText(diag) {
    const d = diag || collect();
    const v = d.verdict || {};
    if (!v.errorCount && !v.warnCount) return '扩展自检通过（模块齐全、注入正常、UI 绑定完好）';
    return (v.ok ? '可用但需留意' : '存在阻断项') + '：' + v.errorCount + ' 错误 / ' + v.warnCount + ' 警告';
  }
  function flatten(diag) {
    const d = diag || collect();
    const out = ((d.verdict && d.verdict.issues) || []).map(function (i) { return { level: i.level, key: i.key, detail: i.detail }; });
    out.push({ level: 'info', key: 'meta', detail: '版本 ' + ((d.meta || {}).extVersion || '?') + '，模块 ' + ((d.modules || {}).loadedCount || 0) + ' 个已导出' });
    out.push({ level: 'info', key: 'inject', detail: ((d.inject || {}).statusText) || '无注入记录' });
    // v2.2.0: 兼容层摘要行——否则 flatten 出来的清单里「MVU/TH 桥是死是活」完全缺席
    const cpF = d.compat || {};
    if (cpF.mvuLoaded !== undefined) {
      const mv = cpF.mvu || {}, th = cpF.th || {};
      out.push({ level: (mv.failed || th.failed) ? 'error' : 'info', key: 'compat',
        detail: 'MVU ' + (mv.active ? '已激活(同步 ' + mv.syncCount + ')' : '未激活(' + (mv.reason || '?') + ')')
          + ' · TH ' + (th.active ? '已暴露' : '未激活(' + (th.reason || '?') + ')') });
    }
    // v2.50.0（第三十五面）：三账各占一行——本节的所有「三态」结论都要在这里落地。
    //   教训来自 v2.49.0 的 F3/F4：`summaryText()` 只回一行汇总，**逐条 issue 在 flatten()**
    //   里；只写 section 不写 flatten，用户仍然看不到「宿主那一半到底观测到了没有」。
    const hwF = d.hostWb || {};
    if (hwF.error) {
      out.push({ level: 'warn', key: 'hostWb', detail: '宿主世界书激活账不可用：' + hwF.error });
    } else if (hwF.state === 'unsupported') {
      out.push({ level: 'info', key: 'hostWb', detail: '宿主世界书激活面**不可观测**（宿主无此事件）：宿主自己扫描注入了哪几条无从得知——这不是「没有激活」' });
    } else if (hwF.state === 'shape-unknown') {
      out.push({ level: 'warn', key: 'hostWb', detail: '宿主世界书激活事件载荷形状未知（保留键 ' + ((hwF.shapeUnknownKeys || []).join('、') || '?') + '），已拒绝猜字段名' });
    } else if (hwF.state === 'ok') {
      out.push({ level: 'info', key: 'hostWb', detail: '宿主世界书本轮激活 ' + (hwF.lastCount | 0) + ' 条：' + (hwF.lastNames || []).slice(0, 5).join('、') + (hwF.sysExcluded ? '（另排除系统条目 ' + hwF.sysExcluded + '）' : '') });
    } else {
      out.push({ level: 'info', key: 'hostWb', detail: '已订阅世界书激活事件，本轮尚未派发（宿主只在真实发送时派发）' });
    }
    const fcF = d.floorChanges || {};
    if (fcF.error) {
      out.push({ level: 'warn', key: 'floorChanges', detail: '楼层变更联动账不可用：' + fcF.error });
    } else {
      out.push({
        level: ((fcF.missing || []).length || fcF.guardVerdict === 'divergent' || fcF.guardVerdict === 'guard-blind') ? 'warn' : 'info', key: 'floorChanges',
        detail: '楼层变更：盘点 ' + ((fcF.scanned || {}).sites | 0) + ' 处引用面 · 缺失 ' + ((fcF.missing || []).length) + ' 处 · 内容变更 ' + ((fcF.changed || []).length) + ' 处'
          + '｜守卫对账 ' + (fcF.guardVerdict || '?') + '｜待处置 ' + ((fcF.actions || []).length) + ' 项（executable=' + fcF.executable + '，回收不可逆故本版不自动执行）'
      });
    }
    const ltF = d.ledgerTimeline || {};
    if (ltF.error) {
      out.push({ level: 'warn', key: 'ledgerTimeline', detail: '台账时间轴不可用：' + ltF.error });
    } else {
      out.push({
        level: (ltF.failing || []).length ? 'warn' : 'info', key: 'ledgerTimeline',
        detail: (ltF.sites | 0) ? ('台账时间轴 ' + ltF.sites + ' 站：本窗口新增失败 ' + (ltF.failing || []).length + ' 站'
          + '，连续同态 ' + (ltF.stalled || []).length + ' 站（阈值 ' + (ltF.stallThreshold || 3) + '）')
          : '台账时间轴尚未观测到站点'
      });
    }
    const inF = d.intel || {};
    if (inF.error) out.push({ level: 'info', key: 'intel', detail: '因果与情报不可用：' + inF.error });
    else out.push({ level: 'info', key: 'intel', detail: '因果与情报' + (inF.enabled ? '已启用' : '未启用') + '：链 ' + (inF.links || 0) + ' / 情报 ' + (inF.intel || 0) + ' / 拒收 ' + (inF.blocked || 0) + (inF.lastReason ? '（最近：' + inF.lastReason + '）' : '') });
    const lfF = d.life || {};
    if (lfF.error) out.push({ level: 'info', key: 'life', detail: '人物生活不可用：' + lfF.error });
    else out.push({ level: 'info', key: 'life', detail: '人物生活' + (lfF.enabled ? '已启用' : '未启用') + '：结算 ' + (lfF.ticks || 0) + ' 次 / 改变 ' + (lfF.changed || 0) + ' / 无变化 ' + (lfF.blocked || 0) + (lfF.lastReason ? '（最近：' + lfF.lastReason + '）' : '') });
    // v2.16.0: 对外桥摘要行——否则 flatten 出来的清单里「另两个插件能不能读到世界」完全缺席。
    const bdF = d.bridge || {};
    if (bdF.error) {
      out.push({ level: 'warn', key: 'bridge', detail: '对外桥不可用：' + bdF.error });
    } else if (bdF.enabled === false) {
      out.push({ level: 'info', key: 'bridge', detail: '对外桥休眠（外部读取 ' + (bdF.externalReads || 0) + ' 次）——另两个插件各自描述世界' });
    } else {
      out.push({
        level: (bdF.failures > 0) ? 'error' : 'info', key: 'bridge',
        detail: '对外桥' + (bdF.mounted ? '已挂载' : '未挂载') + '：发布 ' + (bdF.publishes || 0)
          + ' 次（floor=' + (bdF.publishedFloor === undefined ? '?' : bdF.publishedFloor) + '，'
          + (bdF.snapshotBytes || 0) + ' 字节）｜外部读取 ' + (bdF.externalReads || 0) + ' 次｜作废 '
          + (bdF.invalidations || 0) + ' 次（最近：' + (bdF.lastInvalidateReason || '—') + '）'
          + (bdF.failures > 0 ? '｜失败 ' + bdF.failures + ' 次' : '')
      });
    }
    // v2.97.0（X5）: 入站桥摘要行——与上面 bridge 行**对称**（那一行答「我发得出去吗」，
    //   这一行答「我收得进来吗」；缺这一行，「手机侧按下的按钮进没进世界」在总览里完全缺席）。
    const pbF = d.phoneBridge || {};
    if (pbF.error) {
      out.push({ level: 'error', key: 'phoneBridge', detail: '入站桥不可用：' + pbF.error });
    } else if (pbF.enabled === false) {
      out.push({ level: 'info', key: 'phoneBridge', detail: '入站桥休眠（手机侧动作不进世界台账；已丢 ' + (pbF.blocked || 0) + ' 笔上报）' });
    } else {
      out.push({
        level: (pbF.blocked > 0 || (pbF.rows >= pbF.maxOps)) ? 'warn' : 'info', key: 'phoneBridge',
        detail: '入站桥开闸：台账 ' + (pbF.rows || 0) + '/' + (pbF.maxOps || 0) + ' 笔（未接链 ' + (pbF.unlinked || 0)
          + '）｜收下 ' + (pbF.noted || 0) + ' 次（重复上报 ' + (pbF.reused || 0) + ' 次）｜接链 ' + (pbF.linked || 0)
          + ' 次（失败 ' + (pbF.linkFails || 0) + '）｜拒收 ' + (pbF.blocked || 0) + ' 笔'
          + (pbF.blocked > 0 ? '（' + JSON.stringify(pbF.faults || {}) + '）' : '')
          + '｜手机侧推送相位 ' + (pbF.phase || '?')
      });
    }
    // v2.17.0: 记忆桥消费面摘要行——否则 flatten 出来的清单里「另一个插件记的那本账」
    //   完全缺席（与上面 bridge 行互为镜像：一发一收，缺任一边这套互操作都是半条）。
    const lsF = d.lonsha || {};
    if (lsF.error) {
      out.push({ level: 'info', key: 'lonsha', detail: '记忆桥消费面未加载：' + lsF.error });
    } else if (!lsF.ok) {
      out.push({ level: 'info', key: 'lonsha',
        detail: '记忆桥不可读（' + (lsF.reason || '?') + '）：' + (lsF.describe || '')
          + '（LonSha 未装是常见合法配置；已装却读不到才需查）' });
    } else {
      const vd = lsF.verdict;
      const vdTxt = (vd === 'same') ? '两钟同日'
        : (vd === 'world-ahead') ? '本扩展世界钟在前 ' + Math.abs(Number(lsF.days) || 0) + ' 天'
        : (vd === 'world-behind') ? '本扩展世界钟在后 ' + Math.abs(Number(lsF.days) || 0) + ' 天'
        : (vd === 'lonsha-empty') ? '对方尚未记录时间'
        : (vd === 'world-uncomparable') ? '本扩展世界钟无公历形态（自由标签，本就不比）'
        : '日期串读不出';
      out.push({ level: (vd === 'same' || vd === 'world-uncomparable') ? 'info' : 'warn', key: 'lonsha',
        detail: '记忆桥就绪（floor=' + (lsF.floor || 0) + '，' + (lsF.selfBytes || 0) + ' 字节'
          + (lsF.pluginVersion ? '，对方 ' + lsF.pluginVersion : '') + '）｜对账：' + vdTxt
          + (lsF.absent && lsF.absent.length ? '｜对方未外供 ' + lsF.absent.join('/') : '')
          + (lsF.nullish && lsF.nullish.length ? '｜对方显式为空 ' + lsF.nullish.join('/') : '') });
      // [v2.18.0] 反向消费面扩到九本账后的**新增两行**：
      //   ① 账本画像——对方给了几本、哪几本压根没给（未外供 ≠ 显式为空，两者处置相反）。
      //   ② 对读面——对方的对读读数是**环**（反映的是「对方眼里的我」），必须单独念出来，
      //      否则它会以「对方的世界」的形态混进剧情引用。
      const lgs = lsF.ledgers || {};
      if (lgs.total) {
        const secs = lgs.sections || {};
        out.push({ level: 'info', key: 'lonshaLedgers',
          detail: '对方账本 ' + lgs.total + ' 本：有值 ' + (secs.value || 0) + '｜显式为空 ' + (secs.nullish || 0)
            + '｜未外供 ' + (secs.absent || 0)
            + ((lgs.absent && lgs.absent.length) ? '（' + lgs.absent.join('/') + '）' : '')
            + '｜含对读读数 ' + (lgs.echoPresent ? '是' : '否') });
      }
      // 上游键集自证行：读的键上游是不是真有。**「上游没给」与「上游给了个空的」不同形**，
      //   而「本侧读了上游没有的键」是真缺陷（真实联调恒为空、手工夹具却能喂绿）。
      const eks = lsF.echoKeys || {};
      if (eks.present) {
        const missK = eks.missing || [], unkK = eks.unknown || [];
        out.push({ level: missK.length ? 'warn' : 'info', key: 'lonshaEchoKeys',
          detail: '对读读数键集：本侧认 ' + (eks.readKeys || []).length + ' 键，上游实给 '
            + ((eks.readKeys || []).length - missK.length) + ' 键'
            + (missK.length ? '｜⚠️ 本侧读了上游没有的 ' + missK.join('/') + '（那些读数在真实联调里恒为空）' : '')
            + (unkK.length ? '｜上游另有本侧未消费的 ' + unkK.join('/') : '') });
      }
      const lbs = lsF.bridges;
      if (lbs && lbs.items && lbs.items.length) {
        const cmp = lbs.items.filter(function (x) { return x.comparable; });
        const drift = cmp.reduce(function (a, x) { return a + (x.worldOnlyTotal || 0) + (x.localOnlyTotal || 0); }, 0);
        const conf = lbs.items.reduce(function (a, x) { return a + (x.conflicts || 0); }, 0);
        // 缺口支：缺口四态（full/complete/gapped/no-filter）必须念出来——尤其 `no-filter`
        //   （上游没告诉我有没有缺口）与 `complete`（上游明确说没有缺口）不是一回事。
        const gapIt = lbs.items.filter(function (x) { return x.id === 'currents'; })[0] || {};
        const gv = gapIt.verdict || '';
        out.push({ level: lgs.echoPresent ? 'warn' : 'info', key: 'lonshaBridges',
          detail: '对读面 3 处（' + (lbs.echoKind === 'echo' ? 'kind=echo：对方读本扩展所得，非外部事实' : '对方未外供对读读数')
            + '）｜可比 ' + cmp.length + '/3'
            + (gv ? '｜缺口 ' + gv : '')
            + (drift ? '｜差集 ' + drift + ' 项（两本账对不上，明细见诊断 JSON）' : '')
            + (conf ? '｜位置冲突 ' + conf + ' 处' : '') });
      }
    }
    // v0.1.6: 槽位落地摘要
    const inj = d.inject || {};
    if (inj.slots) {
      out.push({ level: inj.slotConsistent === false ? 'warn' : 'info', key: 'injectSlots', detail: '槽位 ' + inj.slots.applied + '/' + inj.slots.count + ' 落地' + (inj.slotConsistent === false ? '（不一致）' : '') });
    }
    // v2.49.0: 主块账摘要——「主块 0 字但槽位有落地」必须是**一句能读懂的话**，
    //   而不是让读者自己从两个数字里去猜到底是哪种局面。
    const mAccounts = (d.inject || {}).main;
    if (mAccounts) {
      const srcN = (mAccounts.sources || []).length;
      if (mAccounts.dupWithSlots && mAccounts.dupWithSlots.length) {
        out.push({ level: 'error', key: 'injectMainDuplicate', detail: mAccounts.dupWithSlots.join('；') });
      }
      if (mAccounts.len === 0) {
        const slotLanded = !!(inj.slots && inj.slots.applied > 0);
        out.push({ level: 'info', key: 'injectMain', detail: slotLanded
          ? '主块 0 字（本轮全部经独立槽位落地——约束类注入已生效，不是「没注入」）'
          : '主块 0 字且无独立槽位落地（本轮确实没有可注入内容）' });
      } else {
        out.push({ level: srcN ? 'info' : 'warn', key: 'injectMain',
          detail: '主块 ' + mAccounts.len + ' 字符｜' + srcN + ' 个来源'
            + (srcN ? '（' + (mAccounts.sources || []).join('、') + '）' : '（来源未登记——记账断裂，请报此现场）') });
      }
    }
    // v0.1.9: 槽位路由错误快照（部分失败时升级为 warn）
    if (inj.slotErrors && inj.slotErrors.length) {
      out.push({ level: 'warn', key: 'injectSlotErrors', detail: '槽位路由错误 ' + inj.slotErrors.length + ' 处：' + inj.slotErrors.map(function (e) { return e.slot; }).join('、') });
    }
    return out;
  }
  function download() {
    return safe(function () {
      const json = toJSON(true);
      const doc = WA.mainDoc || (mainWin && mainWin.document);
      if (!doc || !mainWin.URL || !mainWin.Blob) return { ok: false, reason: '非浏览器环境，无法下载（用 toJSON 取文本）' };
      const blob = new mainWin.Blob([json], { type: 'application/json' });
      const url = mainWin.URL.createObjectURL(blob);
      const a = doc.createElement('a');
      if (typeof a.click !== 'function') return { ok: false, reason: '非浏览器环境，无法下载（用 toJSON 取文本）' };
      a.href = url;
      a.download = 'worldaxis-diag-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      doc.body.appendChild(a);
      if (typeof a.click === 'function') a.click();
      if (typeof a.remove === 'function') a.remove();
      setTimeout(function () { mainWin.URL.revokeObjectURL(url); }, 4000);
      return { ok: true, bytes: json.length };
    }, {});
  }

  /**
   * v0.1.54: 错误报告包——一键生成可贴给开发者的故障报告（纯文本）。
   * 组装：版本/环境头 + error 子环 + 自检议题（error/warn 级）+ sizeAudit 摘要 + 存储键统计。
   */
  function buildErrorReport() {
    const lines = [];
    const v = (WA.version || '?');
    const chatId = (WA.store && WA.store.chatId) ? WA.store.chatId() : '?';
    lines.push('# WorldAxis 错误报告');
    lines.push('- 版本: v' + v + ' · 生成时间: ' + new Date().toLocaleString() + ' · 聊天: ' + chatId);
    lines.push('');
    // ── error 子环（v0.1.53，≤50 条）──
    const errs = Array.isArray(WA.errorLog) ? WA.errorLog.slice() : [];
    lines.push('## 错误日志（error 子环，' + errs.length + ' 条）');
    if (!errs.length) lines.push('（无 error 级日志）');
    errs.forEach(function (l) {
      lines.push('- [' + new Date(l.t).toLocaleTimeString() + '] ' + l.msg + (l.data ? ' | ' + l.data : ''));
    });
    lines.push('');
    // ── 自检议题（仅 error/warn 级）──
    lines.push('## 自检议题（error/warn 级）');
    try {
      const dg = collect();
      const flat = flatten(dg);
      const ew = flat.filter(function (x) { return x.level === 'error' || x.level === 'warn'; });
      if (!ew.length) lines.push('（无 error/warn 级议题）');
      ew.forEach(function (x) { lines.push('- [' + x.level + '] ' + x.key + ': ' + x.detail); });
    } catch (e) { lines.push('- （自检不可用: ' + String(e && e.message) + '）'); }
    lines.push('');
    // ── sizeAudit 摘要（复用 v0.1.48 派生结论，不再全量重扫）──
    lines.push('## 内存审计摘要');
    try {
      const aud = WA.store.sizeAudit ? WA.store.sizeAudit({ minBytes: 512 }) : null;
      if (aud && !aud.error) {
        lines.push('- 总体积: ' + ((aud.total && aud.total.bytes) || '?') + 'B · 超限: ' + ((aud.drifted || []).length) + ' · 疑似无界: ' + ((aud.suspects || []).length) + (aud.complete === false ? ' ·（分片未收敛，数据不完整）' : ''));
        (aud.drifted || []).forEach(function (x) { lines.push('  - drifted ' + x.path + '(' + x.len + '>' + x.cap + ')'); });
        (aud.suspects || []).slice(0, 10).forEach(function (x) { lines.push('  - suspect ' + x.path + '(' + x.len + '项/' + x.bytes + 'B)'); });
        // ── v2.275.0：**豁免面必须当场说出来** ──────────────────────────────
        //   治的病：`store.sizeAudit()` 的 unbounded 面把「每轮整体覆盖的瞬时快照」
        //     （lastInjection / slotErrors / nextTurnInjection）整族摘掉了 —— 摘得对
        //     （它们没有裁剪点，也没有累积），但摘了不说，读者会把「疑似无界 0」当成
        //     「世界状态很干净」，而实际上有一批容器**从未进入体检**。
        //   读数与结论必须分开交代：这里把豁免名单连同「它们为什么不算」一并印出来。
        //   这是 `store.transientSnapshotKeys()` 的产品级消费方（诊断文本面），
        //   也是「容量体检的范围」这件事唯一对玩家可见的地方。
        let trans = [];
        try {
          if (WA.store && typeof WA.store.transientSnapshotKeys === 'function') {
            trans = WA.store.transientSnapshotKeys() || [];
          }
        } catch (e) { trans = []; }
        if (trans.length) {
          lines.push('- 本趟豁免 ' + trans.length + ' 个瞬时快照键（每轮整体覆盖、无裁剪点，不计入「疑似无界」）: '
            + trans.join('、'));
        } else {
          lines.push('- 瞬时快照豁免名单为空（容量体检覆盖全部顶层容器）');
        }
      } else lines.push('- sizeAudit 不可用');
    } catch (e) { lines.push('- sizeAudit 异常: ' + String(e && e.message)); }
    lines.push('');
    // ── 存储键统计 ──
    lines.push('## 存储键统计');
    try {
      const sk = WA.store.storageStat ? WA.store.storageStat() : null;
      if (sk && sk.enumerable) {
        lines.push('- worldaxis_* 键: ' + sk.totalKeys + ' 个 / ' + Math.round(sk.totalBytes / 1024) + 'KB · 过期诊断键候选: ' + (sk.staleDiagCandidates || []).length);
        lines.push('- 派生槽(同步修订号): ' + (sk.families.stateDerived || 0) + ' 键 · 当前聊天隔离副本: ' + (sk.currentChatQuarantines || 0) + ' 个（受保护）');
        try {
          const qs = WA.store.quarantineStat ? WA.store.quarantineStat() : null;
          if (qs && qs.total > 0) lines.push('- 隔离现场: ' + qs.total + ' 个 / ' + Math.round(qs.bytes / 1024) + 'KB（可解析 ' + qs.parseable + ' · 本聊天 ' + qs.currentChatSites + ' · 已恢复 ' + qs.restores + ' · 已丢弃 ' + qs.drops + '）——诊断面板「隔离现场」可恢复/丢弃');
        } catch (e) {}
        try {
          const rs = WA.store.rescueStat ? WA.store.rescueStat() : null;
          if (rs && rs.attempts > 0) lines.push('- 配额救援: 触发 ' + rs.attempts + ' 次（成功 ' + rs.recovered + ' · 失败 ' + rs.failed + ' · 最近回收 ' + rs.lastRemoved + ' 键 / ' + Math.round(rs.lastFreedBytes / 1024) + 'KB）');
        } catch (e) {}
        lines.push('- 损坏隔离键: ' + (sk.families.corrupt || 0) + ' 个（state/settings 统一保留最近 5 个）· settings 迁移: ' + ((WA.settingsBus && WA.settingsBus.stats.upgrades) || 0) + ' 次 · 损坏隔离累计: ' + ((WA.settingsBus && WA.settingsBus.stats.quarantines) || 0) + ' 次');
      } else lines.push('- storageStat 不可用');
    } catch (e) { lines.push('- storageStat 异常: ' + String(e && e.message)); }
    // ── v0.4.0: 健康巡视（统一裁决视图 + 写入完整性）──
    lines.push('');
    lines.push('## 健康巡视');
    try {
      const mt = WA.store.maintain ? WA.store.maintain({ deep: false }) : null;
      if (mt) {
        lines.push('- 健康分: ' + mt.score + '/100（' + mt.level + '）· 议题 ' + mt.issues.length + ' 项 · 建议动作 ' + mt.actions.length + ' 项');
        mt.issues.slice(0, 8).forEach(function (x) { lines.push('  - [' + x.level + '] ' + x.key + ': ' + x.detail); });
        if (mt.applied) lines.push('- 本次自动回收: ' + mt.applied.removed + ' 键 / ' + Math.round(mt.applied.freedBytes / 1024) + 'KB');
        const ms = WA.store.maintainStat ? WA.store.maintainStat() : null;
        if (ms) lines.push('- 巡视累计: ' + ms.scans + ' 次 · 自动动作 ' + ms.autoApplies + ' 次');
      } else lines.push('- maintain 不可用');
    } catch (e) { lines.push('- maintain 异常: ' + String(e && e.message)); }
    try {
      const ig = WA.store.integrityStat ? WA.store.integrityStat() : null;
      if (ig) lines.push('- 写入完整性: 校验 ' + ig.verified + '/' + ig.writes + ' 次 · 不一致 ' + ig.mismatches + ' · 重试自愈 ' + ig.recoveredByRetry + ' · 当前态 ' + (ig.lastOk === null ? '未采样' : ig.lastOk ? '正常' : '失败(' + (ig.lastReason || '?') + ')'));
    } catch (e) {}
    try {
      const rv = WA.store.removeStat ? WA.store.removeStat() : null;
      if (rv) lines.push('- 删除完整性: 尝试 ' + rv.attempts + ' · 真删掉 ' + rv.removed + ' · 删完仍在 ' + rv.staged + ' · 失败 ' + rv.failed + (rv.lastKey ? ' · 最近 ' + String(rv.lastKey).slice(0, 60) : ''));
    } catch (e) {}
    // ── v0.5.0: 多实例并发一致性 ──
    lines.push('');
    lines.push('## 并发一致性');
    try {
      const cs = WA.store.conflictStat ? WA.store.conflictStat() : null;
      if (cs) lines.push('- 本实例写入者: ' + cs.writer + ' · 本会话写入 ' + cs.writeSeq + ' 次 · 当前序号 ' + cs.seenRev);
      if (cs) lines.push('- 冲突检出: ' + cs.detected + ' 次 · 已保全 ' + cs.quarantined + ' 份' + (cs.lastAt ? ' · 最近 ' + new Date(cs.lastAt).toLocaleTimeString() : ''));
      const xs = WA.store.externalWriteStat ? WA.store.externalWriteStat() : null;
      if (xs) lines.push('- 外部写入（其他标签页）: ' + xs.count + ' 次' + (xs.count ? ' · 最近序号 ' + xs.lastRev + ' —— 本窗口内存态可能已落后，建议刷新' : ''));
      const sites = WA.store.listConflicts ? WA.store.listConflicts() : [];
      if (sites.length) {
        lines.push('- 冲突现场 ' + sites.length + ' 个（另一实例的进度快照，面板「冲突现场」可提取/丢弃）:');
        sites.forEach(function (x) { lines.push('  - ' + x.key + ' · ' + Math.round(x.bytes / 1024) + 'KB · ' + (x.parseable ? '可解析' : '不可解析') + (x.head ? ' · ' + x.head : '')); });
      } else {
        lines.push('- 冲突现场: 无');
      }
    } catch (e) { lines.push('- 并发观测异常: ' + String(e && e.message)); }
    return lines.join('\n');
  }

  /** 诊断采集节：把 26 枚引擎的只读口逐一真调（act 口只报席位，不代替操作者触发）。 */
  function secEngines230() {
    return safe(function () {
      const out = { namespaces: [], read: {}, act: {}, totals: { ns: 0, read: 0, act: 0, missing: 0 } };
      Object.keys(ENGINE_PORTS).forEach(function (ns) {
        const p = ENGINE_PORTS[ns] || {};
        const rows = {};
        out.namespaces.push(ns);
        out.totals.ns += 1;
        Object.keys(p.read || {}).forEach(function (m) {
          out.totals.read += 1;
          rows[m] = safe(p.read[m], { error: "read 失败" });
        });
        const acts = Object.keys(p.act || {});
        out.totals.act += acts.length;
        out.read[ns] = rows;
        out.act[ns] = acts;
      });
      out.totals.missing = out.namespaces.filter(function (ns) { return !WA[ns]; }).length;
      out.note = "只报读数：act 口是写口，诊断不代替操作者触发（它们由面板「引擎台」页真调）";
      return out;
    }, {});
  }

  WA.toolDiag = {
    PACKAGE_FORMAT, PACKAGE_VERSION, MODULE_EXPORTS, UI_BINDINGS,
    collect, verdict, toJSON, summaryText, flatten, download, buildErrorReport,
    OPTIONAL_EXPORTS,
    secPanelYield, secControlUsage,
    secMeta, secEnv, secModules, secVisibility, secInject, secWorldState, secRuntime, secUi, secCapabilities, secCompat,
    secHostWb, secFloorChanges, secLedgerTimeline,   // v2.50.0（第三十五面）
    secFaultLedger, // v2.80.0（第十四面）
    secHorizon, secEnemies, secParallelWorld,        // v2.64.0（第五十一 / 五十二 / 五十三面）
    secStitch2129,                                   // v2.129.0（缝 A2 / A7 / A9：改写器 / 静态设定 / 报文预览）
    secStitch2130,                                   // v2.130.0（十二引擎：拦截 / 变换 / 换算 / 预演旁路能力）
    secAgenda, secChronicleView, secCapacityAudit, secPerfBaseline, secWorldHealth,  // v2.182.0（第二批五聚合面）
    secEngines230, ENGINE_PORTS,   // v2.230.0（N12）：26 枚新引擎端口表 + 只读采集节（死导出接线的单一真源）
    safe  // v0.1.12: 导出供语义一致性单测（异常时返回 {error} 为诊断特例）
  };
  if (WA.log) WA.log('info', '自检诊断引擎已加载');
})();
