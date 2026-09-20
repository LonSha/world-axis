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
    'core/clock.js': 'clock',
    'core/store.js': 'store', 'core/settings-bus.js': 'settingsBus', 'core/evict.js': 'evict', 'core/rand.js': 'rand', 'core/workflow.js': 'workflow', 'core/settle-guard.js': 'settleGuard', 'core/interceptor.js': 'interceptor',
    'core/api-router.js': 'apiRouter',
    'engines/backstage.js': 'backstage', 'engines/evolution.js': 'evolution', 'engines/enemies.js': 'enemies',
    'engines/regional.js': 'regional', 'engines/horizon.js': 'horizon', 'engines/digest.js': 'digest',
    'engines/limits.js': 'limits', 'engines/worldbook.js': 'worldbook', 'engines/ledger.js': 'ledger',
    'engines/timeline.js': 'timeline', 'engines/entities.js': 'entities',
    'engines/preset.js': 'preset', 'engines/chatcache.js': 'chatcache', 'engines/pmem.js': 'pmem',
    'engines/rules.js': 'rules', 'engines/summarizer.js': 'summarizer', 'engines/chapters.js': 'chapters',
    'engines/direct-event.js': 'directEvent',
    'engines/editor-faction.js': 'editorFaction', 'engines/editor-events.js': 'editorEvents',
    'engines/inspector-state.js': 'inspectorState', 'engines/tool-snapshot.js': 'toolSnapshot',
    'engines/tool-analyzer.js': 'toolAnalyzer', 'engines/tool-import.js': 'toolImport',
    'engines/inject-inspector.js': 'injectInspector', 'engines/inject-budget.js': 'injectBudget', 'engines/tool-diag.js': 'toolDiag', 'engines/contract-audit.js': 'contractAudit', 'engines/memory-sampler.js': 'memorySampler', 'engines/sampler-check.js': 'samplerCheck', 'engines/inject-channel.js': 'injectChannel', 'engines/inject-slot-audit.js': 'injectSlotAudit', 'engines/proactive.js': 'proactive', 'engines/wb-inject.js': 'wbInject',
    'engines/calendar.js': 'calendar', 'engines/memory.js': 'memory', 'engines/opinion.js': 'opinion',
    'engines/bridge.js': 'bridge',
    'engines/lonsha-reader.js': 'lonshaReader',
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
      // v0.1.41: 撤销-槽位关联审计
      if (WA.render && WA.render.uninjectAudit) { const ua = WA.render.uninjectAudit(); if (ua.issues.length) out.uninjectIssues = ua.issues; }
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
            // v0.7.0: 楼层结算守卫观测（settles/skips 归因 / 最后结算楼层）
            settleGuard: WA.settleGuard ? (function () { try { return WA.settleGuard.stat(); } catch (e) { return null; } })() : null,
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
            sizeAudit: WA.store.sizeAuditFull ? WA.store.sizeAuditFull({ minBytes: 512, chunkNodes: 800 }) : (WA.store.sizeAudit ? WA.store.sizeAudit({ minBytes: 512 }) : null)
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
          return { enabled: st.enabled, config: st.config, rolls: st.rolls,
            distantFired: st.distantFired, nearFired: st.nearFired, skipped: st.skipped,
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
  const UI_BINDINGS = [
    { page: 'tools', ids: ['wa-an-run', 'wa-an-out', 'wa-snap-dl', 'wa-snap-up', 'wa-snap-file', 'wa-snap-out', 'wa-imp-pick', 'wa-imp-file', 'wa-imp-text', 'wa-imp-run', 'wa-imp-out', 'wa-diag-run', 'wa-diag-dl', 'wa-diag-out',
      // v2.2.0: 诊断出口收口——三个新增控件同样纳入「渲染 ↔ 绑定」一致性校验
      'wa-stat-reset', 'wa-compat-view', 'wa-wf-reset',
      // v2.2.0 块5：存档恢复点 / 设置键卫生
      'wa-recovery-view', 'wa-orphan-view',
      // v2.2.0 块8：工具页既有控件（此前全在守卫之外 → 绑定断裂无人发现）
      'wa-audit-copy', 'wa-key-check', 'wa-quar-view', 'wa-recovery-dl', 'wa-maintain', 'wa-conf-view', 'wa-settle-view'],
      cond: ['wa-orph-all', 'wa-settle-unforce'],
      dynamic: ['wa-diag-out', 'wa-an-out', 'wa-snap-out', 'wa-imp-out', 'wa-key-sweep-go', 'wa-key-sweep-ghost', 'wa-q-restore', 'wa-q-drop', 'wa-conf-dl', 'wa-conf-drop', 'wa-settle-force', 'wa-rv-confirm', 'wa-rv-cancel'] },
    { page: 'world', ids: ['wa-set-clock', 'wa-cal-auto', 'wa-bg', 'wa-save-bg'], dynamic: ['wa-conc-v'] },
    { page: 'people', ids: ['wa-npc-name', 'wa-npc-add', 'wa-observe-out', 'wa-prof-mini', 'wa-prof-out'],
      dynamic: ['wa-prof-save', 'wa-prof-clear', 'wa-prof-msg'] },
    { page: 'events', ids: ['wa-de-prompt', 'wa-de-turns', 'wa-de-create', 'wa-ef-name', 'wa-ef-scope', 'wa-ef-goal', 'wa-ef-core', 'wa-ef-pillars', 'wa-ef-add', 'wa-ee-name', 'wa-ee-type', 'wa-ee-add', 'wa-inspect-run', 'wa-inspect-out'],
      // v2.11.0: `wa-bs-abort` 是**条件渲染**控件（只在推演运行中出现），故归入 cond 层——
      //   与 wa-de-abort（有活跃突发事件才渲染）同一语义。纳入守卫表后，「按钮渲染了但
      //   绑定代码引用了别的 id」这类断裂会被发现（本版新增的绑定正需要这道守）。
      cond: ['wa-de-abort', 'wa-ch-end', 'wa-ch-title', 'wa-ch-start', 'wa-bs-abort'] },
    { page: 'director', ids: ['wa-plan-beats', 'wa-plan-start', 'wa-or-goal', 'wa-or-beats', 'wa-or-gen', 'wa-or-out', 'wa-gen-choices', 'wa-choices-out'],
      cond: ['wa-beat-next', 'wa-plan-clear'] },
    { page: 'logs', ids: ['wa-log-copy', 'wa-log-err', 'wa-err-report'] },
    { page: 'assistant', ids: ['wa-ask-input', 'wa-ask-btn', 'wa-ask-out', 'wa-theater-input', 'wa-theater-btn', 'wa-theater-insert', 'wa-theater-copy', 'wa-theater-out'] },
    { page: 'events', ids: ['wa-inspect-run', 'wa-inspect-out'] },
    { page: 'logs', ids: ['wa-log-copy'] },
    { page: 'connect', ids: ['wa-conc'] },
    // v2.3.0 块3: 设置页整页此前在守卫之外——10 页里只守了 8 页，设置页 30 余个控件
    //   （含推演尺度/预算/净化规则/舆情/演化/随机事件）绑定断裂无人发现。
    //   净化规则区在 purifier 未加载时整段不渲染 → 归入 cond（依赖态，缺失不判失败）。
    { page: 'settings', ids: [
      'wa-set-mode', 'wa-set-time', 'wa-set-pulse', 'wa-set-npc',
      'wa-set-auto', 'wa-set-fullrules', 'wa-set-sync', 'wa-set-autobak', 'wa-set-budget-mode', 'wa-set-budget',
      'wa-set-mslimit', 'wa-set-msdice', 'wa-set-msrel', 'wa-set-custom', 'wa-set-save',
      'wa-op-enable', 'wa-op-sandbox', 'wa-op-n', 'wa-op-now', 'wa-sim-now',
      'wa-ev-dice', 'wa-ev-mod', 'wa-ev-roll', 'wa-ev-out',
      // v2.3.0 块3: 随机事件通道配置（新增出口）
      'wa-hz-d-en', 'wa-hz-d-chance', 'wa-hz-d-cd', 'wa-hz-d-ledger',
      'wa-hz-n-en', 'wa-hz-n-chance', 'wa-hz-n-cd', 'wa-hz-n-ledger',
      'wa-hz-save', 'wa-hz-out',
      // v2.3.0 块3: 数值回显 span 同样是「在场控件」——它们一直渲染在设置页，
      //   只是该页此前整体在守卫之外，从未被发现。既然纳管就一并登记（缺失同样意味着
      //   滑块拖动时数值不更新，属真缺陷）。
      'wa-set-npcv', 'wa-set-budgetv', 'wa-set-mslimitv', 'wa-set-msdicev', 'wa-ev-modv',
      'wa-hz-d-chancev', 'wa-hz-d-cdv', 'wa-hz-d-ledgerv',
      'wa-hz-n-chancev', 'wa-hz-n-cdv', 'wa-hz-n-ledgerv',
      // v2.7.0: 区域突发事件配置（生效值视图接入界面后的新增出口）
      'wa-rg-enable', 'wa-rg-chance', 'wa-rg-dur', 'wa-rg-save', 'wa-rg-out',
      'wa-rg-chancev', 'wa-rg-durv',
      'wa-set-out'],
      cond: ['wa-prm-find', 'wa-prm-repl', 'wa-prm-add', 'wa-prm-reset', 'wa-prm-import', 'wa-prm-json', 'wa-prm-out'] }
  ];
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
        return {
          page: grp.page, active: active,
          expected: grp.ids.length, missing: missing, ok: !active || missing.length === 0,
          condExpected: (grp.cond || []).length, condMissing: condMissing,
          dynamicExpected: (grp.dynamic || []).length, dynamicMissing: dynMissing
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
        lastRefusal: s.lastRefusal, lastFailure: s.lastFailure, floor: s.floor
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
      const read = WA.lonshaReader.readLonshaSnapshot({ refresh: false });
      const src = read.source || safe(function () { return WA.lonshaReader.lonshaSource(WA.lonshaReader.LONSHA_BRIDGE_ID); }, {});
      const out = {
        mounted: !!src.mounted, ok: !!read.ok, reason: read.reason,
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
  // ── 汇总 ──
  function collect() {
    const diag = {
      meta: secMeta(), env: secEnv(), modules: secModules(), visibility: secVisibility(),
      inject: secInject(), worldState: secWorldState(), runtime: secRuntime(),
      ui: secUi(), capabilities: secCapabilities(),
      host: secHost(), uninjectLedger: secUninjectLedger(), wbChannel: secWbChannel(), bus: secBus(),
      bridge: secBridge(),
      lonsha: secLonsha(),
      compat: secCompat()
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
          issues.push({ level: 'warn', key: 'bridge', detail: '对外桥当前**休眠**（设置键 worldaxis_bridge_settings_v1 的 enabled=false），但外部已尝试读取 ' + bd.externalReads + ' 次——对方拿到的永远是 null，看起来像「这个世界没有任何世界状态」' });
        }
        if (bd.enabled === false) {
          issues.push({ level: 'info', key: 'bridge', detail: '对外桥休眠中（默认）：另两个插件（RubyPhone 世界脉搏 / TimeManager、LonSha 世界推进）此刻各自用自己的办法描述世界；要共享真值开 `WorldAxis.bridge.setSettings({ enabled: true })`' });
        }
        if (bd.enabled !== false && bd.lastInvalidateReason) {
          issues.push({ level: 'info', key: 'bridge.invalidated', detail: '快照最近一次作废理由：' + bd.lastInvalidateReason + '（分布 ' + JSON.stringify(bd.byInvalidate || {}) + '）——推演结算/换聊天后外部读到的必须是新世界' });
        }
      }
    } catch (eBd) {}
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
    if (mig && (mig.failed > 0 || mig.steps > 0)) {
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
        quarantine: '损坏隔离副本', legacy: '旧键迁移', stamp: '结构指纹' };
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
        .map(function (k) { return ({ guarded: '删完仍在', missing: '登记项缺 key', setItem: '删除被拒', quarantine: '隔离路径', legacy: '旧键迁移', settings: '设置键出口' }[k] || k) + '×' + byR[k]; }).join('、');
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
        .map(function (k) { return ({ read: '存储层读取', parse: '值解析', migrate: '迁移', copy: '返回值拷贝' }[k] || k) + '×' + byRd[k]; }).join('、');
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
      // v2.11.0: 标签表必须覆盖**全部**归因点。本版新增的来源包括 core 侧的
      //   load / saveConflict / verifyState / rmExisted / verifyBack / legacyRead /
      //   saveInherit / subkeyAudit / pendingOrphan / verifyDefaults / lsRaw，
      //   以及引擎侧 chatcache* / worldbookSelection / workflowHistory / uninjectLedger /
      //   eventLog / errorLog。缺标签 ⇒ 消费端退回裸桶名 ⇒ 「有归因但看不懂」。
      const SRC_LABEL = {
        bytes: '容量计量', activity: '活跃时间', enumerate: '键枚举',
        diskRev: '磁盘序号（读失败 ⇒ 并发覆盖检测失效）',
        verify: '写后校验/删后复核的读回', recovery: '恢复点清单',
        conflict: '冲突现场', quarantine: '隔离现场', writerId: '写入者标识',
        load: '存档载入（读失败 ⇒ 整份存档不可见）',
        saveConflict: '并发覆盖前的保全读回（读失败 ⇒ 对方进度未被保全）',
        verifyState: '存档巡检', rmExisted: '受控删除的存在性探测',
        verifyBack: '写后/删后复核读回', legacyRead: 'legacy 旧键读取',
        saveInherit: '保存时继承结构指纹', subkeyAudit: '子键缺口盘点',
        pendingOrphan: '幽灵键盘点', verifyDefaults: '默认值声明校验',
        lsRaw: '幽灵设置盘点原文',
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
        eventLog: '事件日志载入', errorLog: '错误日志载入'
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

  WA.toolDiag = {
    PACKAGE_FORMAT, PACKAGE_VERSION, MODULE_EXPORTS, UI_BINDINGS,
    collect, verdict, toJSON, summaryText, flatten, download, buildErrorReport,
    OPTIONAL_EXPORTS,
    secMeta, secEnv, secModules, secVisibility, secInject, secWorldState, secRuntime, secUi, secCapabilities, secCompat,
    safe  // v0.1.12: 导出供语义一致性单测（异常时返回 {error} 为诊断特例）
  };
  if (WA.log) WA.log('info', '自检诊断引擎已加载');
})();
