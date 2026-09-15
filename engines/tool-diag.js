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

  const PACKAGE_FORMAT = 'worldaxis-diag';
  const PACKAGE_VERSION = 2;

  function safe(fn, fallback) {
    try { const v = fn(); if (v !== undefined) return v; }
    catch (e) { return { error: String((e && e.message) || e) }; }
    return fallback === undefined ? null : fallback;
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

  // ── 3. 模块装载完整性（文件 ↔ 导出对象） ─
  const MODULE_EXPORTS = {
    'core/store.js': 'store', 'core/workflow.js': 'workflow', 'core/interceptor.js': 'interceptor',
    'core/api-router.js': 'apiRouter',
    'engines/backstage.js': 'backstage', 'engines/evolution.js': 'evolution', 'engines/enemies.js': 'enemies',
    'engines/regional.js': 'regional', 'engines/horizon.js': 'horizon', 'engines/digest.js': 'digest',
    'engines/limits.js': 'limits', 'engines/worldbook.js': 'worldbook', 'engines/ledger.js': 'ledger',
    'engines/inspector.js': 'inspector', 'engines/timeline.js': 'timeline', 'engines/entities.js': 'entities',
    'engines/preset.js': 'preset', 'engines/chatcache.js': 'chatcache', 'engines/pmem.js': 'pmem',
    'engines/rules.js': 'rules', 'engines/summarizer.js': 'summarizer', 'engines/chapters.js': 'chapters',
    'engines/direct-event.js': 'directEvent',
    'engines/editor-faction.js': 'editorFaction', 'engines/editor-events.js': 'editorEvents',
    'engines/inspector-state.js': 'inspectorState', 'engines/tool-snapshot.js': 'toolSnapshot',
    'engines/tool-analyzer.js': 'toolAnalyzer', 'engines/tool-import.js': 'toolImport',
    'engines/inject-inspector.js': 'injectInspector', 'engines/inject-budget.js': 'injectBudget', 'engines/tool-diag.js': 'toolDiag', 'engines/contract-audit.js': 'contractAudit', 'engines/memory-sampler.js': 'memorySampler', 'engines/sampler-check.js': 'samplerCheck', 'engines/inject-channel.js': 'injectChannel', 'engines/inject-slot-audit.js': 'injectSlotAudit', 'engines/proactive.js': 'proactive', 'engines/wb-inject.js': 'wbInject',
    'engines/calendar.js': 'calendar', 'engines/memory.js': 'memory', 'engines/opinion.js': 'opinion',
    'render/inject.js': 'render', 'render/theater.js': 'theater', 'render/purifier.js': 'purifier',
    'actors/registry.js': 'registry', 'actors/monologue.js': 'monologue',
    'actors/observe.js': 'observe', 'actors/profile.js': 'profile',
    'direction/oracle.js': 'oracle', 'direction/tags.js': 'tags', 'direction/choices.js': 'choices',
    'compat/host.js': 'compat', 'compat/mvu.js': 'compatMvu', 'compat/th-helper.js': 'compatTH',
    'ui/panel.js': 'ui', 'ui/settings.js': 'uiSettings', 'ui/assistant.js': 'assistant'
  };
  // 无头环境（tests/命令行）不加载 UI 层，故这些导出为可选
  const OPTIONAL_EXPORTS = ['ui', 'uiSettings', 'assistant', 'compat'];
  function secModules() {
    const missing = [], loaded = [], optionalMissing = [];
    Object.keys(MODULE_EXPORTS).forEach(function (file) {
      const key = MODULE_EXPORTS[file];
      if (WA[key]) loaded.push({ file: file, key: key });
      else if (OPTIONAL_EXPORTS.indexOf(key) >= 0) optionalMissing.push({ file: file, key: key });
      else missing.push({ file: file, key: key });
    });
    return {
      loadedCount: loaded.length,
      missingCount: missing.length,
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
      if (!snap) return { hasSnapshot: false, status: 'NOT_YET', statusText: WA.injectInspector.statusText('NOT_YET') };
      const out = {
        hasSnapshot: true, status: snap.status,
        statusText: WA.injectInspector.statusText ? WA.injectInspector.statusText(snap.status) : null,
        apiType: snap.apiType, round: snap.round, ts: snap.ts, landed: snap.landed,
        injectEnabled: snap.injectEnabled, registeredAtSend: snap.registeredAtSend
      };
      if (snap.apiType === 'chat') { out.messageCount = snap.messageCount; out.ourIndex = snap.ourIndex; out.ourContentLen = snap.ourContentLen; }
      // v0.1.6: 补槽位落地信息（来自 injectSlotAudit 对 lastInjection 的对账结果）
      const li = (WA.store && WA.store.get) ? (WA.store.get().lastInjection || null) : null;
      // v0.1.29: 快照已撤销时标注——槽位证据保留但注入已不在场
      if (li && li.injected === false) { out.injected = false; out.clearedAt = li.clearedAt || null; out.clearedBy = li.clearedBy || null; }
      if (li && li.slots) {
        out.slots = li.slots;
        const slotAudit = WA.injectSlotAudit ? WA.injectSlotAudit.audit(li) : null;
        if (slotAudit) {
          out.slotConsistent = slotAudit.consistent;
          if (slotAudit.issues.length) out.slotIssues = slotAudit.issues;
        }
      }
      // v0.1.24: 上轮注入预算账单（超支/折叠/丢弃明细）
      if (li && li.budget) {
        const b = li.budget;
        out.budget = { used: b.used, cap: b.cap, source: b.source, contextSize: b.contextSize || null, remain: b.remain, inputTokens: b.inputTokens, saved: b.saved, overBudget: !!b.overBudget, keptCount: b.keptCount || 0, foldedCount: (b.folded || []).length, droppedCount: (b.dropped || []).length };
        if ((b.dropped || []).length) out.budget.dropped = b.dropped;
        out.budget.summary = WA.injectBudget && WA.injectBudget.summaryText ? WA.injectBudget.summaryText({ used: b.used, budget: b.cap, folded: b.folded || [], dropped: b.dropped || [], saved: b.saved }) : null;
      }
      // v0.1.9: 槽位路由错误快照（部分失败时存在）
      if (li && li.slotErrors) out.slotErrors = li.slotErrors;
      else { out.promptLength = snap.promptLength; out.ourExcerptLen = snap.ourExcerptLen; }
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
        round: st.round,
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
            lastSave: { at: stat.at, ok: stat.ok, bytes: stat.bytes, reason: stat.reason, failCount: stat.failCount },
            transactions: WA.store.txStat ? WA.store.txStat() : null,
            batch: WA.store.batchStat ? WA.store.batchStat() : null,
            recovery: WA.store.recoveryStat ? WA.store.recoveryStat() : null,
            sizeProfile: prof
          };
        }, null)
      };
    }, {});
  }

// ── 7. 缓存 / 工作流 / API 通道 / 加载器 ──
  function secRuntime() {
    return {
      chatcache: safe(function () {
        if (!WA.chatcache || !WA.chatcache.listSnapshots) return { error: 'chatcache 不可用' };
        const snaps = WA.chatcache.listSnapshots() || [];
        return { count: snaps.length, latest: snaps.length ? { id: snaps[0].id, name: snaps[0].name, auto: !!snaps[0].auto, round: snaps[0].round } : null };
      }, {}),
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
        return out;
      }, {}),
      apiRouter: safe(function () {
        if (!WA.apiRouter) return { error: 'apiRouter 不可用' };
        const list = WA.apiRouter.listChannels ? WA.apiRouter.listChannels() : [];
        return {
          concurrency: WA.apiRouter.getConcurrency ? WA.apiRouter.getConcurrency() : null,
          queue: WA.apiRouter.queueLength ? WA.apiRouter.queueLength() : null,
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
  const UI_BINDINGS = [
    { page: 'tools', ids: ['wa-an-run', 'wa-an-out', 'wa-snap-dl', 'wa-snap-up', 'wa-snap-file', 'wa-snap-out', 'wa-imp-pick', 'wa-imp-file', 'wa-imp-text', 'wa-imp-run', 'wa-imp-out', 'wa-diag-run', 'wa-diag-dl', 'wa-diag-out'] },
    { page: 'events', ids: ['wa-inspect-run', 'wa-inspect-out'] },
    { page: 'logs', ids: ['wa-log-copy'] },
    { page: 'connect', ids: ['wa-conc'] }
  ];
  function secUi() {
    return safe(function () {
      const doc = (WA.mainDoc || (mainWin && mainWin.document)) || null;
      if (!doc || !doc.getElementById) return { note: '无 document 可查（非浏览器环境），UI 项跳过' };
      const out = UI_BINDINGS.map(function (grp) {
        const missing = grp.ids.filter(function (id) { return !doc.getElementById(id); });
        return { page: grp.page, expected: grp.ids.length, missing: missing, ok: missing.length === 0 };
      });
      return { groups: out, allOk: out.every(function (g) { return g.ok; }) };
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
      { key: 'toolDiag', api: ['collect', 'verdict', 'toJSON', 'summaryText', 'flatten'], label: '自检诊断包' }
    ];
    return caps.map(function (c) {
      const mod = WA[c.key];
      if (!mod) return { label: c.label, key: c.key, ok: false, reason: '模块未加载' };
      const lack = c.api.filter(function (m) { return typeof mod[m] !== 'function'; });
      return { label: c.label, key: c.key, ok: lack.length === 0, missingApi: lack };
    });
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
  // ── 汇总 ──
  function collect() {
    const diag = {
      meta: secMeta(), env: secEnv(), modules: secModules(), visibility: secVisibility(),
      inject: secInject(), worldState: secWorldState(), runtime: secRuntime(),
      ui: secUi(), capabilities: secCapabilities(),
      host: secHost(), uninjectLedger: secUninjectLedger(), wbChannel: secWbChannel(), bus: secBus()
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
    if (diag.ui && diag.ui.allOk === false) issues.push({ level: 'warn', key: 'ui', detail: '部分面板控件未绑定（见 ui.groups）' });
    // v0.1.19: 宿主能力缺失 → warn（降级仍可运行但功能受限）
    const h = diag.host || {};
    if (h && h.sillyTavern === false) issues.push({ level: 'warn', key: 'host', detail: '未检测到 SillyTavern 宿主（无事件源，仅拦截器函数可用）' });
    else if (h && h.eventSource === false) issues.push({ level: 'warn', key: 'host', detail: '宿主无事件源：after 链与切聊天重载将不生效' });
    if (h && h.extensionPrompt === false) issues.push({ level: 'error', key: 'host', detail: '宿主无 setExtensionPrompt：注入通道完全不可用' });
    if (h && h.variables === false) issues.push({ level: 'warn', key: 'host', detail: 'TavernHelper 变量 API 缺失：wb 变量镜像通道降级为即时注入' });
    if (h && h.worldbook === false) issues.push({ level: 'warn', key: 'host', detail: 'TavernHelper 世界书 API 缺失：wb 条目自动创建不可用' });
    // v0.1.20: CDN 失败源全数冷却 → warn（当前会话内 CDN 容灾已耗尽）
    // v0.1.22: 最近一次落盘失败 → error（世界状态未持久化，刷新即丢）
    const wsStor = ((diag.worldState || {}).storage || {});
    const lsav = wsStor.lastSave || null;
    if (lsav && lsav.ok === false) issues.push({ level: 'error', key: 'storage', detail: '最近一次 store 落盘失败（' + (lsav.reason || 'error') + '，累计 ' + lsav.failCount + ' 次）：内存态已更新但未持久化' });
    else if (lsav && lsav.failCount > 0) issues.push({ level: 'warn', key: 'storage', detail: 'store 历史落盘失败 ' + lsav.failCount + ' 次（当前已恢复）' });
    // v0.1.30: 事务健康——独立 transactions 键（与 lastSave 议题解耦）：
    //   lastStatus='save-failed' → error（当下在丢数据）；saveFailed>0 但已恢复 → warn（历史失败）；errors>0 → warn（修改器抛错但状态未提交）
    // v0.1.37: 恢复点满额 → info（环形覆盖属正常行为，但用户应知晓最旧快照将被丢弃）
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
    const ldr = (diag.runtime || {}).loader || {};
    // v0.1.25: 加载失败的模块点名（对照装载清单升级为 error）
    if (ldr.failedModules && ldr.failedModules.length) {
      const failedRels = ldr.failedModules.map(function (f) { return f.rel; });
      const hit = (m.missing || []).filter(function (x) { return failedRels.indexOf(x.file) >= 0; });
      issues.push({ level: hit.length ? 'error' : 'warn', key: 'loader', detail: hit.length ? '加载失败且导出缺失的模块：' + hit.map(function (x) { return x.file; }).join('、') : '曾加载失败但导出齐全（可能已恢复）：' + failedRels.join('、') });
    }
    if (ldr.cdnCooldowns && ldr.cdnCooldowns.length >= 3) issues.push({ level: 'warn', key: 'loader', detail: '全部 3 个 CDN 容灾源均在冷却中（60s 内不重试），期间加载失败模块将彻底失败' });
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
    // v0.1.6: 槽位落地摘要
    const inj = d.inject || {};
    if (inj.slots) {
      out.push({ level: inj.slotConsistent === false ? 'warn' : 'info', key: 'injectSlots', detail: '槽位 ' + inj.slots.applied + '/' + inj.slots.count + ' 落地' + (inj.slotConsistent === false ? '（不一致）' : '') });
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

  WA.toolDiag = {
    PACKAGE_FORMAT, PACKAGE_VERSION, MODULE_EXPORTS, UI_BINDINGS,
    collect, verdict, toJSON, summaryText, flatten, download,
    OPTIONAL_EXPORTS,
    secMeta, secEnv, secModules, secVisibility, secInject, secWorldState, secRuntime, secUi, secCapabilities,
    safe  // v0.1.12: 导出供语义一致性单测（异常时返回 {error} 为诊断特例）
  };
  if (WA.log) WA.log('info', '自检诊断引擎已加载');
})();
