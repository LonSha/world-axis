/**
 * WorldAxis core/store.js
 * 按聊天隔离的 schema 化世界状态存储 + 恢复点 + 分支覆盖
 * 缝合来源：世界背面 store/schema/恢复点/branchOverrides 思路 + World引擎 chatcache
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;

  const SCHEMA_VERSION = 1;
  // v0.1.36: draft 克隆 feature-detect——structuredClone 优先（原生实现快 1.5-2x 且保留类型），
  // 不可用时降级 JSON 往返（与旧版行为完全一致）
  const cloneDraft = (typeof structuredClone === 'function')
    ? (st) => structuredClone(st)
    : (st) => JSON.parse(JSON.stringify(st));
  const MAX_RECOVERY_POINTS = 3;

  // ── 默认世界状态（纯框架：世界观由世界书/用户设定注入，此处只留结构）──
  function defaultWorldState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      // 世界钟
      clock: { iso: '', label: '', dayIndex: 0, source: 'unset' }, // source: unset|user|text|engine
      // 世界背景（用户设定或世界书注入的自由文本，纯框架不预设内容）
      background: { text: '', updatedAt: 0 },
      // 权威世界事实（已结算，正文连续性约束）
      worldFacts: [],           // {id, key, value, scope, source, at, branchId}
      // 人物（NPC）状态：位置/行动/意图/身体/资源/认知边界
      people: {},               // id -> {id,name,avatar,location,action,intent,body,resources,knowledge:{},personalityAnchor,speakingStyle,behaviorBoundaries,innerVoice,lastSeenAt,updatedAt}
      // 暗流（未结算事件链）
      currents: [],             // {id,title,summary,visibility:hidden|trace|public,public_trace,causes:[],participants:[],stage,createdAt,updatedAt,branchId}
      // 回声（已结算结果与正文的接触面）
      echoes: [],               // {id,refCurrent,result,exposure,at}
      // 纪事（归档历史）
      chronicle: [],            // {id,kind,title,summary,at,refs}
      // 舆情（新闻/论坛/闲逛，闲逛=NON-CANON）
      opinion: { canon: [], forum: [], sandbox: [], signature: '', updatedAt: 0 },
      // 记忆分层 L0-L3
      memory: {
        facts: [],              // 长期事实 {key,value,version,active,reason,at}
        foreshadows: [],        // 伏笔 {id,content,status:waiting|developing|triggered|recycled|dropped,links:[],at}
        l0: [], l1: [], l2: [], l3: []   // 分层经历摘要
      },
      // 事件演化（World引擎：冲突/进度阶段机 + 势力/声誉/经济/仇敌/黑盒/天下大势）
      evolution: {
        events: [], factions: [], winds: [], trends: [], enemies: [],
        blackbox: { secretActions: [], secretAssets: [] }, worldTrends: [], regionalIncident: null,
        reputation: { authority: '默默无闻', common: '默默无闻', shadow: '默默无闻', circuit: '默默无闻', lastChange: '' },
        economy: { climate: '平稳', signals: [] },
        round: 0, digest: '',
        // v0.5 远方/近端事件泳道
        horizon: {
          distant: { ledger: 0, cooldown: 0, pending: null, lastFired: 0 },
          near:    { ledger: 0, cooldown: 0, pending: null, lastFired: 0 }
        },
        // v0.5 world_digest叙事
        worldDigest: null
      },
      // 章节叙事（beat-tracker：章/节/故事线/关系）
      chapters: {
        active: false, current: null,  // {no,title,script,notes,startedAt}
        history: [], storylines: [], relations: {},
        seq: 0                         // v0.1.43/45: 章号计数器，与 history 长度解耦
      },
      // 突发事件（direct-event：一轮生成多轮解封的小纸条）
      directEvents: [],         // {id,title,totalTurns,currentTurn,status:active|done|aborted,opponent,box,notes:[],createdAt}
      // 一致性记录（冲突诊断，不静默覆盖）
      consistency: [],          // {kind, detail, at}
      // 世界脉搏（backstage结算）
      worldPulse: null,         // {pressure:0-3, trend:rising|falling|steady, note, at}
      // 下轮注入三列引用（after链产出，before链一次性消费）
      nextTurnInjection: null,  // {required:[], conditional:[], suppress:[], at, anchor}
      // 元信息
      meta: { createdAt: Date.now(), updatedAt: Date.now(), lastAnchor: null }
    };
  }

  // ── 存储键：聊天metadata优先，localStorage回退 ──
  function getCtx() {
    try { return mainWin.SillyTavern && mainWin.SillyTavern.getContext ? mainWin.SillyTavern.getContext() : null; }
    catch (e) { return null; }
  }
  function getChatId() {
    const ctx = getCtx();
    return (ctx && (ctx.chatId || ctx.chatMetadata?.file_name)) || 'wa_default';
  }
  function storageKey(chatId) { return 'worldaxis_state_' + (chatId || getChatId()); }
  function recoveryKey(chatId) { return 'worldaxis_recovery_' + (chatId || getChatId()); }

  let memCache = {}; // 内存态（当前聊天的权威副本）
  // v0.1.31: 写合并——批作用域内 transact 只推进内存，批退出统一落盘一次
  let __epoch = 0; // v0.1.35: 聊天纪元——init()（含切聊天）自增，在飞批跨纪元即作废
  const __batch = { depth: 0, dirty: false, flushes: 0, lastFlushAt: 0, epoch: 0, orphaned: false };
  // v0.1.33: 嵌套事务栈——非空时内层 transact 直接在最外层 draft 上修改，提交延迟到最外层
  const __tx = [];
  // v0.1.30: 事务计量——按提交状态聚合计数与耗时
  const __txStat = { count: 0, ok: 0, errors: 0, aborted: 0, saveFailed: 0, batched: 0, deferred: 0, totalMs: 0, lastMs: 0, lastAt: 0, lastStatus: null };
  function recTx(ms, status) {
    try {
      __txStat.count++; __txStat.totalMs += ms; __txStat.lastMs = ms; __txStat.lastAt = Date.now(); __txStat.lastStatus = status;
      if (status === 'ok') __txStat.ok++;
      else if (status === 'error') __txStat.errors++;
      else if (status === 'aborted') __txStat.aborted++;
      else if (status === 'save-failed') __txStat.saveFailed++;
      else if (status === 'ok-batched') { __txStat.ok++; __txStat.batched++; }
      else if (status === 'ok-deferred') { __txStat.deferred++; }
    } catch (e) {}
  }
  // v0.1.22: 保存观测——最近一次 save 的结果与失败归因（配额耗尽不再静默）
  const __saveStat = { at: 0, ok: null, bytes: 0, reason: null, failCount: 0 };
  // v0.3.0: 隔离现场处置审计（只读观测 + 恢复/丢弃动作留痕）
  const __quarantineStat = { restores: 0, drops: 0, lastRestoreAt: 0, lastDropAt: 0, lastKey: null };
  // v0.3.0: 配额救援审计——save 遇配额耗尽时的自动回收与重试结果
  const __rescueStat = { attempts: 0, recovered: 0, failed: 0, lastFreedBytes: 0, lastAt: 0, lastRemoved: 0 };
  // v0.1.38: 加载观测——状态键损坏时隔离原始 payload 而非静默丢弃
  const __loadStat = { loads: 0, hits: 0, misses: 0, errors: 0, healed: 0, shapeConflicts: 0, lastFix: { filled: 0, conflicts: 0, at: 0 }, lastError: null, lastAt: 0 };
  // v0.1.46: 版本链迁移步注册表（fromVersion -> fn(state)）
  const __migrations = {};
  let __keyHygieneScanSig = null;    // v0.1.54: 上次 dry-run 扫描的清理计划指纹（纯指纹幂等：变化才告警，同指纹静默）
  // ── v0.1.51: 存储键卫生（key hygiene）────────────────────────
  // worldaxis_* 键空间分类：state/recovery/diagnostic/corrupt/settings/wb/other
  const KEY_FAMILIES = {
    state: /^worldaxis_state_(?!.+_(?:syncrev|corrupt_\d+)$)(.+)$/,
    // v0.2.3: state 派生键（同聊天的附属槽位，非独立聊天）——chatcache 同步修订号等
    stateDerived: /^worldaxis_state_(.+)_(syncrev)$/,
    recovery: /^worldaxis_recovery_(.+)$/,
    diag_eventLog: /^worldaxis_event_log_(.+)$/,
    diag_errorLog: /^worldaxis_error_log_(.+)$/,
    diag_wfHistory: /^worldaxis_wf_history_(.+)$/,
    diag_uninjectLedger: /^worldaxis_uninject_ledger_(.+)$/,
    corrupt: /^worldaxis_state_(.+)_corrupt_(\d+)$/,
    corruptSettings: /^worldaxis_(?!state_)([a-z_0-9]+)_corrupt_\d+$/,
    wb: /^worldaxis_wb_selection_(.+)$/,
    settingsSettings: /^worldaxis_(backstage_settings_v1|evolution_settings_v1|opinion_settings_v1|regional_settings_v1|api_channels_v1|workflow_v1|inject_visibility_v1|purifier_rules_v1|npc_registry_v1|oracle_plan_v1|active_preset|custom_presets)$/
  };
  function classifyKey(key) {
    let m;
    // v0.2.3: 隔离键必须保留 chat 归属——否则「当前聊天的键永不被清理」不变量对隔离副本失效
    // （当前聊天唯一幸存的可恢复现场被 sweep 当溢出删除），且隔离聊天的 recovery 快照被判孤儿删除
    if ((m = key.match(KEY_FAMILIES.corrupt))) return { family: 'corrupt', chat: m[1], quarantine: 'state' };
    if (KEY_FAMILIES.corruptSettings.test(key)) return { family: 'corrupt', chat: null, quarantine: 'settings' };
    if ((m = key.match(KEY_FAMILIES.stateDerived))) return { family: 'stateDerived', kind: m[2], chat: m[1] };
    if ((m = key.match(KEY_FAMILIES.state))) return { family: 'state', chat: m[1] };
    if ((m = key.match(KEY_FAMILIES.recovery))) return { family: 'recovery', chat: m[1] };
    if ((m = key.match(KEY_FAMILIES.diag_eventLog))) return { family: 'diagnostic', kind: 'event_log', chat: m[1] };
    if ((m = key.match(KEY_FAMILIES.diag_errorLog))) return { family: 'diagnostic', kind: 'error_log', chat: m[1] };
    if ((m = key.match(KEY_FAMILIES.diag_wfHistory))) return { family: 'diagnostic', kind: 'wf_history', chat: m[1] };
    if ((m = key.match(KEY_FAMILIES.diag_uninjectLedger))) return { family: 'diagnostic', kind: 'uninject_ledger', chat: m[1] };
    if ((m = key.match(KEY_FAMILIES.wb))) return { family: 'wb', chat: m[1] };
    if (KEY_FAMILIES.settingsSettings.test(key)) return { family: 'settings', settings: true, chat: null };
    return { family: 'settings', chat: null };
  }
  function listWorldAxisKeys() {
    const ls = mainWin.localStorage;
    const out = [];
    try {
      const n = typeof ls.length === 'number' ? ls.length : 0;
      for (let i = 0; i < n; i++) {
        const k = ls.key(i);
        if (typeof k === 'string' && k.indexOf('worldaxis_') === 0) out.push(k);
      }
    } catch (e) { /* 枚举失败（非标准实现）→ 空清单，不炸 */ }
    return out;
  }
  function keyBytes(key) {
    try { return byteLen(mainWin.localStorage.getItem(key) || ''); } catch (e) { return 0; }
  }
  /** 聊天活跃时间：读 state 键 payload 的 meta.updatedAt（无 state 键/解析失败回退 0 = 最冷） */
  function chatActivityAt(chat) {
    try {
      const raw = mainWin.localStorage.getItem('worldaxis_state_' + chat);
      if (!raw) return 0;
      const st = JSON.parse(raw);
      return (st && st.meta && typeof st.meta.updatedAt === 'number') ? st.meta.updatedAt : 0;
    } catch (e) { return 0; }
  }
  // v0.1.47: 最近一次 migrate 的报告（观测层承载，不写进 state，避免污染持久 payload）
  let __migrateReport = null;
  function classifySaveError(e) {
    const name = (e && e.name) || '';
    const msg = String((e && e.message) || e);
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota|exceed|full/i.test(msg)) return 'quota';
    return 'error';
  }
  function byteLen(s) {
    try {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
      return s.length * 3; // 中文兜底估算（UTF-8 最多 3 字节）
    } catch (e) { return s.length * 3; }
  }

  // v0.1.44: 有界容器登记表——path -> { cap: 裁剪后长度硬上限, site: 源码裁剪点 }
  // cap 值必须与源码中的裁剪常量一致，tests/run.js 会反查源码，防止登记表与代码漂移。
  /**
   * v0.1.45: 结构自愈——按默认状态递归补齐「缺失的嵌套字段」。
   * 背景：migrate() 是浅合并（Object.assign），旧存档整体替换顶层键后，
   *      后续版本新增的嵌套字段（memory.l0-l3 等）不会被补齐；而引擎侧
   *      存在 draft.memory.l1.push(...) 这类无守卫写入，会抛错并被 transact
   *      的 catch 吞成 {ok:false} —— 表现为「记忆巩固每轮静默丢失」且永不自愈
   *      （旧存档 schemaVersion 已等于当前值，根本不会走 migrate 分支）。
   * 语义：只填 undefined 的空位，绝不覆盖任何已有值；类型不符时保留原值。
   */
  function ensureShape(target, fresh) {
    let filled = 0, conflicts = 0;
    if (!target || typeof target !== 'object' || Array.isArray(target)) return { state: target, filled: 0, conflicts: 0 };
    Object.keys(fresh || {}).forEach(function (k) {
      const dv = fresh[k], tv = target[k];
      if (tv === undefined) {
        try { target[k] = JSON.parse(JSON.stringify(dv)); } catch (e) { target[k] = dv; }
        filled++;
        return;
      }
      const dArr = Array.isArray(dv), tArr = Array.isArray(tv);
      const dObj = dv !== null && typeof dv === 'object' && !dArr;
      const tObj = tv !== null && typeof tv === 'object' && !tArr;
      if (dObj && tObj) {
        const sub = ensureShape(tv, dv);
        filled += sub.filled; conflicts += sub.conflicts;
        return;
      }
      // 仅当默认期望容器（对象/数组）而实测不是，才算污染；
      // 默认为 null 的字段（lastInjection/worldPulse 等）运行时变对象属正常演进，不判冲突
      if ((dObj || dArr) && !(tObj || tArr)) conflicts++;
    });
    return { state: target, filled: filled, conflicts: conflicts };
  }
  const __BOUNDED_CAPS = {
    'chronicle': { cap: 200, site: 'backstage.js slice(-200)' },
    'currents': { cap: 40, site: 'backstage.js slice(-40)' },
    'echoes': { cap: 40, site: 'backstage.js slice(-40)' },
    'worldFacts': { cap: 100, site: 'backstage.js slice(-100)' },
    'consistency': { cap: 0, site: '当前无写入方' },
    'memory.l0': { cap: 20, site: 'memory.js slice(-CAP.l0)' },
    'memory.l1': { cap: 30, site: 'memory.js slice(-CAP.l1)' },
    'memory.l2': { cap: 40, site: 'memory.js slice(-CAP.l2)' },
    'memory.l3': { cap: 60, site: 'memory.js slice(-CAP.l3)' },
    'memory.facts': { cap: 100, site: 'memory.js slice(-CAP.facts)' },
    'memory.foreshadows': { cap: 30, site: 'memory.js slice(-CAP.foreshadows)' },
    'memory.pmem': { cap: 60, site: 'pmem.js CAP_TOTAL=60' },
    'opinion.canon': { cap: 20, site: 'opinion.js slice(-20)' },
    'evolution.events': { cap: 16, site: 'editor-events.js MAX_EVENTS=16' },
    'evolution.factions': { cap: 16, site: 'editor-faction.js MAX_FACTIONS=16' },
    'directEvents': { cap: 4, site: 'direct-event.js pruneDirect(KEEP_DONE=3 + 1 活跃)' },
    'chapters.history': { cap: 20, site: 'chapters.js pruneHistory(MAX_HISTORY=20)' }
  };
  // v0.1.48: 派生逻辑单一实现——sizeAudit 与 sizeAuditFull 共用，防两处语义单边漂移
  function memStateBytes() {
    try { return byteLen(JSON.stringify(memCache)); } catch (e) { return -1; }
  }
  function auditTotal() {
    const b = memStateBytes();
    return b >= 0 ? b : ((WA.store.saveStat ? WA.store.saveStat().bytes : 0) || 0);
  }
  /** 由数组明细派生 unbounded/suspects/drifted 结论 */
  function deriveAuditRows(arrays, minBytes) {
    // 顶层路径才参与有界判定（a.b[0].c 这类元素内嵌数组由父容器隐式约束）
    const topRows = (arrays || []).filter(function (a) { return a.path.indexOf('[') < 0; });
    const unregistered = topRows.filter(function (a) { return !a.bounded && a.len > 0; });
    // v0.1.48: 排序一律带 path 次级键——主键（bytes / 超容量）可能并列，
    // 而 sizeAudit(栈式DFS) 与 sizeAuditFull(分片合并) 的输入序不同，
    // 不稳定排序会让两入口结论逐字节不等。
    function byBytesDesc(x, y) { return (y.bytes - x.bytes) || (x.path < y.path ? -1 : x.path > y.path ? 1 : 0); }
    function byExcessDesc(x, y) { return ((y.len - y.cap) - (x.len - x.cap)) || (x.path < y.path ? -1 : x.path > y.path ? 1 : 0); }
    const suspects = unregistered.filter(function (a) { return a.bytes >= minBytes; }).sort(byBytesDesc);
    // v0.1.44 漂移：已登记容器长度超出 cap —— 白名单自身失效的信号
    const drifted = topRows.filter(function (a) { return a.bounded && a.cap !== null && a.len > a.cap; }).sort(byExcessDesc);
    return {
      unbounded: unregistered.map(function (a) { return a.path; }),
      suspects: suspects.map(function (a) { return { path: a.path, len: a.len, bytes: a.bytes }; }),
      drifted: drifted.map(function (a) { return { path: a.path, len: a.len, cap: a.cap, bytes: a.bytes, site: a.site }; })
    };
  }
  const store = WA.store = {
    SCHEMA_VERSION,
    /** v0.1.44: 有界容器登记表只读副本（测试反查源码一致性用） */
    sizeCaps() { const c = {}; Object.keys(__BOUNDED_CAPS).forEach(function (k) { c[k] = { cap: __BOUNDED_CAPS[k].cap, site: __BOUNDED_CAPS[k].site }; }); return c; },
    defaultWorldState,
    chatId: getChatId,        // v0.9.1: 供导出/诊断读取当前聊天id

    init() {
      // v0.1.35: 聊天切换/重载时，作废在飞写合并批——旧聊天的未落盘改动不再写向新聊天键
      __epoch++;
      if (__batch.depth > 0) {
        __batch.orphaned = true; __batch.dirty = false;
        WA.log('warn', '聊天切换时存在在飞写合并批：已作废其未落盘改动（防跨聊天污染）');
      }
      memCache = this.load() || defaultWorldState();
      __migrateReport = null;   // v0.1.47: 报告以「本次载入」为边界，不跨载入粘留（防议题永久挂红）
      // v0.1.49: 恢复当前聊天的事件日志与工作流历史
      try { if (WA.loadEventLog) WA.loadEventLog(); } catch (e) {}
      try { if (WA.workflow && WA.workflow.loadHistory) WA.workflow.loadHistory(); } catch (e) {}
      // v0.1.50: 恢复当前聊天的撤销台账
      try { if (WA.render && WA.render.loadUninjectLedger) WA.render.loadUninjectLedger(); } catch (e) {}
      // v0.1.52→0.1.54: 存储键卫生静默巡检——init 时 dry-run 一次，大额可回收仅留痕告警（不自动删，删否属用户决策）。
      // 节流纯指纹幂等（v0.1.54 定稿）：每次 init 都 dry-run（枚举 <10ms，无需时间窗——时间窗会制造「窗内新垃圾不可见」陷阱），
      // 清理计划指纹变化（新垃圾集出现/清理后消失）才告警；同指纹重复 init 静默。
      try {
        if (WA.store.sweepStaleKeys) {
          const plan = WA.store.sweepStaleKeys({});   // dry-run
          const sig = (plan.remove || []).map(function (r) { return r.key; }).sort().join('|');
          const changed = sig !== __keyHygieneScanSig;
          __keyHygieneScanSig = sig;
          if (changed && plan.remove.length && plan.freedBytes > 256 * 1024) {
            WA.log('warn', '存储键卫生：发现 ' + plan.remove.length + ' 个过期键可回收 ' + Math.round(plan.freedBytes / 1024) + 'KB（过期诊断 ' + (plan.byFamily['diag-idle'] || 0) + '/隔离溢出 ' + (plan.byFamily['corrupt-overflow'] || 0) + '/孤儿恢复点 ' + (plan.byFamily['orphan-recovery'] || 0) + '），诊断面板「存储键体检」可执行清理');
          }
        }
      } catch (e) {}
      if (!memCache.schemaVersion || memCache.schemaVersion < SCHEMA_VERSION) {
        this.createRecoveryPoint(); // 升级前先留恢复点
        memCache = this.migrate(memCache);
        this.save();
      }
      // v0.1.45: 结构自愈——版本号相同但字段较旧（分阶段演进的历史存档）同样补齐
      const shapeFix = ensureShape(memCache, defaultWorldState());
      // v0.1.45: lastFix 记录本次载入结果（议题据此报，避免状态恢复后永久挂红）；
      // healed/shapeConflicts 为历史累计，供回溯「是否曾发生过」
      __loadStat.lastFix = { filled: shapeFix.filled, conflicts: shapeFix.conflicts, at: Date.now() };
      if (shapeFix.filled > 0) {
        __loadStat.healed += shapeFix.filled;
        WA.log('warn', '载入状态缺失 ' + shapeFix.filled + ' 个字段，已按默认值补齐（旧存档兼容）');
        this.save();
      }
      // 类型冲突不擅自改写用户数据，但必须留下可见痕迹（否则又回到静默失败）
      if (shapeFix.conflicts > 0) {
        __loadStat.shapeConflicts += shapeFix.conflicts;
        WA.log('error', '载入状态有 ' + shapeFix.conflicts + ' 处字段类型与默认结构不符，已保留原值（查状态键是否被外部写入污染）');
      }
      WA.log('info', 'store就绪 chat=' + getChatId() + ' schema=' + memCache.schemaVersion);
    },

    /**
     * v0.1.46: 版本链步进迁移——registerMigration(from, fn) 注册 from→from+1 的转换步，
     *        migrate() 沿链逐版本应用直到 SCHEMA_VERSION，再统一补齐嵌套缺字段。
     *        这样后续版本升 schema 时只需新增一步，老存档可跨多版本连续升级。
     */
    registerMigration(fromVersion, fn) {
      if (typeof fromVersion !== 'number' || typeof fn !== 'function') return false;
      __migrations[fromVersion] = fn;
      return function () { if (__migrations[fromVersion] === fn) delete __migrations[fromVersion]; };
    },
    migrations() { return Object.keys(__migrations).map(Number).sort(function (a, b) { return a - b; }); },
    /** v0.1.47: 最近一次跨版本迁移报告（tool-diag 消费） */
    migrateReport() { return __migrateReport ? JSON.parse(JSON.stringify(__migrateReport)) : null; },
    migrate(state, targetVersion) {
      // 起始版本必须读 state 原值：Object.assign 会让缺 schemaVersion 的远古存档
      // 继承默认值(SCHEMA_VERSION)，从而跳过整条版本链
      const fromV = (state && typeof state.schemaVersion === 'number') ? state.schemaVersion : 0;
      const out = Object.assign(defaultWorldState(), state);
      // targetVersion 可显式指定（默认当前版本）：便于跨多版本链的测试与调试
      const target = typeof targetVersion === 'number' && targetVersion >= 0 ? targetVersion : SCHEMA_VERSION;
      let v = fromV;
      const steps = [], failed = [];
      // 沿版本链步进（防死循环：步数不超过版本跨度）
      let guard = 0;
      while (v < target && guard++ <= target + 1) {
        const step = __migrations[v];
        if (step) {
          try { step(out); steps.push(v + '->' + (v + 1)); }
          // v0.1.47: 失败步也要进报告——否则「哪一步炸了」只存在于瞬时日志里
          catch (e) { failed.push({ at: v, error: String((e && e.message) || e) }); WA.log('error', '迁移步 ' + v + '->' + (v + 1) + ' 失败', e); }
        }
        v++;
      }
      ensureShape(out, defaultWorldState());   // v0.1.45: 升级路径同样补齐嵌套缺字段
      out.schemaVersion = SCHEMA_VERSION;
      // v0.1.47: 迁移结果不再落到 state（曾以 _migratedFrom 永久留在持久 payload 里，
      // 无人消费且每次载入都自我延续），改为写观测层并显式剥离历史残留
      __migrateReport = { from: fromV, to: SCHEMA_VERSION, path: steps, steps: steps.length, failed: failed, at: Date.now() };
      delete out._migratedFrom;
      return out;
    },

    load(chatId) {
      // v0.1.38: 解析失败不再静默——原始 payload 存入 *_corrupt_<ts> 隔离键，
      // 避免默认状态在下次 save 时覆盖可恢复现场（部分写入/扩展冲突等导致的状态键损坏）
      __loadStat.loads++; __loadStat.lastAt = Date.now();
      let raw = null;
      try { raw = mainWin.localStorage.getItem(storageKey(chatId)); }
      catch (e) { __loadStat.errors++; __loadStat.lastError = String((e && e.message) || e); WA.log('error', 'store.load读取失败', e); return null; }
      if (!raw) { __loadStat.misses++; return null; }
      try {
        const st = JSON.parse(raw);
        __loadStat.hits++;
        return st;
      } catch (pe) {
        __loadStat.errors++; __loadStat.lastError = String((pe && pe.message) || pe);
        try { mainWin.localStorage.setItem(storageKey(chatId) + '_corrupt_' + Date.now(), raw); } catch (e2) {}
        WA.log('error', 'store.load解析失败：状态键已隔离（*_corrupt_*），下次保存不会覆盖原始现场', pe);
        return null;
      }
    },

    save(state, chatId) {
      try {
        const s = state || memCache;
        s.meta = s.meta || {};
        s.meta.updatedAt = Date.now();
        const payload = JSON.stringify(s);
        mainWin.localStorage.setItem(storageKey(chatId), payload);
        memCache = s;
        __saveStat.at = Date.now(); __saveStat.ok = true; __saveStat.bytes = byteLen(payload); __saveStat.reason = null;
        return true;
      } catch (e) {
        // v0.1.22: save 失败归因 + 计数；内存副本仍推进，避免本轮结算在半份状态里丢失
        __saveStat.at = Date.now(); __saveStat.ok = false; __saveStat.reason = classifySaveError(e); __saveStat.failCount++;
        const s = state || memCache; if (s) memCache = s;
        // v0.3.0: 配额耗尽不再只记日志——先尝试安全回收（过期诊断/孤儿恢复点/隔离溢出），成功则立刻重试落盘。
        // 救援只动「可安全回收」的键（当前聊天/settings/wb/state 本体永不参与），失败则保持可见错误。
        if (__saveStat.reason === 'quota') {
          const rescued = this.__rescueQuota(state, chatId);
          if (rescued) {
            __saveStat.ok = true; __saveStat.reason = null;
            WA.log('warn', 'store.save 遇配额耗尽：已自动回收 ' + __rescueStat.lastRemoved + ' 个可回收键（释放 ' + Math.round(__rescueStat.lastFreedBytes / 1024) + 'KB）并重试落盘成功');
            return true;
          }
          WA.log('error', 'store.save失败：配额耗尽且自动回收未能释放足够空间（可回收 ' + __rescueStat.lastRemoved + ' 个键 / ' + Math.round(__rescueStat.lastFreedBytes / 1024) + 'KB 仍不足）——导出快照并手动清理旧聊天数据', e);
          return false;
        }
        WA.log('error', 'store.save失败', e);
        return false;
      }
    },
    /** v0.1.30: 事务计量只读视图（tool-diag 消费） */
    txStat() { return { count: __txStat.count, ok: __txStat.ok, errors: __txStat.errors, aborted: __txStat.aborted, saveFailed: __txStat.saveFailed, batched: __txStat.batched, deferred: __txStat.deferred, lastStatus: __txStat.lastStatus, avgMs: Math.round(__txStat.totalMs / Math.max(1, __txStat.count)), lastMs: __txStat.lastMs, lastAt: __txStat.lastAt }; },
    /** v0.1.30: 清零事务计量（诊断重置入口） */
    resetTxStat() { __txStat.count = 0; __txStat.ok = 0; __txStat.errors = 0; __txStat.aborted = 0; __txStat.saveFailed = 0; __txStat.batched = 0; __txStat.deferred = 0; __txStat.totalMs = 0; __txStat.lastMs = 0; __txStat.lastAt = 0; __txStat.lastStatus = null; },
    /**
     * v0.1.31: 写合并批作用域——fn 内的 transact 只推进内存（保留每事务深拷贝隔离），
     * 批退出时统一落盘一次。异步安全：支持 async fn 与嵌套（depth 计数）。
     * 批退出 save 失败不抛（save 内部已归因 saveStat）。
     */
    async batch(fn) {
      if (__batch.depth === 0) { __batch.orphaned = false; __batch.epoch = __epoch; }
      __batch.depth++;
      try { return await fn(); }
      finally {
        __batch.depth--;
        if (__batch.depth === 0) {
          // v0.1.35: 批横跨了聊天纪元（init 发生在批进行中）→ 丢弃 flush
          if (__batch.orphaned || __batch.epoch !== __epoch) {
            __batch.dirty = false; __batch.orphaned = false;
            WA.log('warn', '写合并批跨聊天纪元退出：未落盘改动已丢弃');
          } else if (__batch.dirty) {
            __batch.dirty = false;
            try { this.save(); __batch.flushes++; __batch.lastFlushAt = Date.now(); } catch (e) { WA.log('error', 'batch 退出落盘失败', e); }
          }
        }
      }
    },
    /** v0.1.31: 批深度只读视图（诊断用：>0 表示当前处于写合并作用域） */
    batchDepth() { return __batch.depth; },
    /** v0.1.32: 批健康只读视图——flushes 即「写合并后实际落盘次数」（对照 txStat.batched 观察合并率） */
    batchStat() { return { depth: __batch.depth, dirty: __batch.dirty, flushes: __batch.flushes, lastFlushAt: __batch.lastFlushAt, orphaned: __batch.orphaned }; },
    /**
     * v0.3.0: 配额救援（内部）——配额耗尽时回收可安全释放的键并重试一次落盘。
     * 安全边界：复用 sweepStaleKeys 的保守规则（绝不碰当前聊天/settings/wb/state 本体）。
     * 返回 true 表示重试成功。
     */
    __rescueQuota(state, chatId) {
      __rescueStat.attempts++; __rescueStat.lastAt = Date.now();
      let removed = 0, freed = 0;
      try {
        const plan = this.sweepStaleKeys({ apply: true });   // 只回收过期诊断/孤儿恢复点/隔离溢出
        removed = plan.remove.length; freed = plan.freedBytes;
      } catch (e) { removed = 0; freed = 0; }
      __rescueStat.lastRemoved = removed; __rescueStat.lastFreedBytes = freed;
      if (!removed) { __rescueStat.failed++; return false; }
      // 重试落盘
      try {
        const s = state || memCache;
        s.meta = s.meta || {};
        s.meta.updatedAt = Date.now();
        const payload = JSON.stringify(s);
        mainWin.localStorage.setItem(storageKey(chatId), payload);
        memCache = s;
        __saveStat.bytes = byteLen(payload);
        __rescueStat.recovered++;
        return true;
      } catch (e2) {
        __rescueStat.failed++;
        return false;
      }
    },
    /** v0.3.0: 配额救援观测（tool-diag/面板消费）——attempts>0 表示本会话曾撞配额墙 */
    rescueStat() { const r = __rescueStat; return { attempts: r.attempts, recovered: r.recovered, failed: r.failed, lastRemoved: r.lastRemoved, lastFreedBytes: r.lastFreedBytes, lastAt: r.lastAt }; },
    /** v0.3.0: 隔离现场处置审计视图 */
    quarantineAudit() { const q = __quarantineStat; return { restores: q.restores, drops: q.drops, lastRestoreAt: q.lastRestoreAt, lastDropAt: q.lastDropAt, lastKey: q.lastKey }; },
    /** v0.1.22: 保存观测只读视图（tool-diag 消费）。bytes = 上次成功落盘的 UTF-8 体积 */
    saveStat() { return { at: __saveStat.at, ok: __saveStat.ok, bytes: __saveStat.bytes, reason: __saveStat.reason, failCount: __saveStat.failCount }; },
    /** v0.1.38: 加载观测只读视图（tool-diag 消费）——errors>0 意味着发生过状态键损坏 */
    loadStat() { return { loads: __loadStat.loads, hits: __loadStat.hits, misses: __loadStat.misses, errors: __loadStat.errors, healed: __loadStat.healed || 0, shapeConflicts: __loadStat.shapeConflicts || 0, lastFix: { filled: (__loadStat.lastFix && __loadStat.lastFix.filled) || 0, conflicts: (__loadStat.lastFix && __loadStat.lastFix.conflicts) || 0, at: (__loadStat.lastFix && __loadStat.lastFix.at) || 0 }, migrated: __migrateReport ? { from: __migrateReport.from, to: __migrateReport.to, steps: __migrateReport.steps, failed: (__migrateReport.failed || []).length, at: __migrateReport.at } : null, lastError: __loadStat.lastError, lastAt: __loadStat.lastAt }; },
    /** v0.1.22: 体积画像——各顶层分区序列化字节数 Top N（长团膨胀排查入口） */
    sizeProfile(topN) {
      const rows = [];
      try {
        Object.keys(memCache || {}).forEach(function (k) {
          if (k === 'meta') return;
          let b = 0;
          try { b = byteLen(JSON.stringify(memCache[k])); } catch (e) { b = -1; }
          rows.push({ path: k, bytes: b });
        });
        rows.sort(function (a, b) { return b.bytes - a.bytes; });
      } catch (e) { return { error: String(e && e.message || e) }; }
      const n = topN && topN > 0 ? topN : 8;
      return { total: __saveStat.bytes, top: rows.slice(0, n) };
    },

    /**
     * v0.1.43: 无界增长审计——递归扫描 state 中所有数组路径，与「已核实有界」白名单比对。
     * v0.1.44: 白名单从纯文本升级为可运行时验证的 cap——登记每条容器的源码硬上限，
     *        长度超出 cap 即报「漂移」（裁剪代码被删 / 存在绕过写入 / 登记值有误），
     *        使守卫本身不再静默失效。cap:0 表示当前无写入方，一旦增长即需登记真实上限。
     * 只读：不写 store、不落盘。
     */
    sizeAudit(opts) {
      const o = opts || {};
      const minBytes = typeof o.minBytes === 'number' ? o.minBytes : 256;
      const maxDepth = typeof o.maxDepth === 'number' ? o.maxDepth : 3;
      const maxNodes = typeof o.maxNodes === 'number' && o.maxNodes > 0 ? o.maxNodes : 800;
      // path -> { cap: 裁剪后长度硬上限, site: 裁剪点出处 }
      const BOUNDED = __BOUNDED_CAPS;
      const arrays = [];
      let visited = 0;
      // v0.1.46: 游标化 DFS——预算耗尽时把待访路径写入 cursor，resumeCursor 可从断点续扫
      let truncated = false;
      const pending = [];   // 待访问路径栈（DFS 后进先出）
      function schedule(node, pathStr, depth) {
        if (depth > maxDepth) return;
        if (Array.isArray(node)) {
          let b = 0;
          try { b = byteLen(JSON.stringify(node)); } catch (e) { b = -1; }
          const meta = Object.prototype.hasOwnProperty.call(BOUNDED, pathStr) ? BOUNDED[pathStr] : null;
          const top = pathStr.indexOf('[') < 0;
          arrays.push({ path: pathStr, len: node.length, bytes: b, bounded: !!meta && top, cap: meta ? meta.cap : null, site: meta ? meta.site : null });
          if (depth < maxDepth) { for (let ix = Math.min(2, node.length - 1); ix >= 0; ix--) pending.push(pathStr + '[' + ix + ']'); }
          return;
        }
        if (node && typeof node === 'object') {
          const ks = Object.keys(node);
          for (let i = ks.length - 1; i >= 0; i--) pending.push(pathStr ? pathStr + '.' + ks[i] : ks[i]);
        }
      }
      function resolvePath(root, pathStr) {
        if (!pathStr) return root;
        const segs = pathStr.replace(/\[(\d+)\]/g, '.$1').split('.');
        let cur = root;
        for (let i = 0; i < segs.length; i++) {
          if (cur === null || cur === undefined) return undefined;
          const k = segs[i];
          cur = /^\d+$/.test(k) && Array.isArray(cur) ? cur[Number(k)] : cur[k];
        }
        return cur;
      }
      // 初始化：resumeCursor 优先，其次 startCursor（供外部分片），否则从根开始
      const startPaths = (o.resumeCursor && Array.isArray(o.resumeCursor) && o.resumeCursor.length) ? o.resumeCursor.slice()
        : (o.startCursor && Array.isArray(o.startCursor) && o.startCursor.length) ? o.startCursor.slice() : [''];
      for (let pi = startPaths.length - 1; pi >= 0; pi--) pending.push(startPaths[pi]);
      try {
        while (pending.length) {
          if (visited >= maxNodes) { truncated = true; break; }
          const pth = pending.pop();
          const node = resolvePath(memCache || {}, pth);
          visited++;
          // schedule 会把子路径压栈；深度超限时内部直接忽略
          const depth = pth ? (pth.replace(/\[(\d+)\]/g, '.$1').split('.').length) : 0;
          schedule(node, pth, depth);
        }
      } catch (e) { return { error: String(e && e.message || e) }; }
      // 截断时剩余 pending 即断点游标（供下次续扫）
      const cursor = truncated ? pending.slice() : null;
      const concl = deriveAuditRows(arrays, minBytes);
      return {
        total: auditTotal(),
        persisted: (WA.store.saveStat ? WA.store.saveStat().bytes : 0) || 0,
        scanned: arrays.length,
        scannedNodes: visited,
        nodeBudget: maxNodes,
        depthCap: maxDepth,
        truncated: truncated,
        cursor: cursor,                // v0.1.46: 断点游标，resumeCursor 续扫
        trackedBounded: Object.keys(BOUNDED).length,
        arrays: arrays.slice().sort(function (a, b) { return (b.bytes - a.bytes) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0); }).slice(0, (o.topN && o.topN > 0) ? o.topN : 12),
        unbounded: concl.unbounded,
        suspects: concl.suspects,
        drifted: concl.drifted
      };
    },
    /**
     * v0.1.47: 分片扫描编排——自动用 cursor 接力 sizeAudit 直到扫完，调用方不必手写循环。
     * 收敛保证：每趟至少弹出一个待访路径（visited 递增、pending 严格递减），故必然收敛；
     *          另设 chunks 上限与「无进展」检测作双保险，异常时如实报告而非静默返回部分结果。
     * complete=false 表示未扫完（触顶或卡住），此时 unbounded/suspects 不可当作全量结论。
     */
    exportAuditReport(opts) {
      const audit = this.sizeAuditFull(opts);
      if (audit.error) return 'Error generating size audit report: ' + audit.error;
      const lines = [];
      lines.push('# WorldAxis 内存/持久化审计报告 (sizeAudit)');
      lines.push('生成时间: ' + new Date().toLocaleString());
      lines.push('总内存/状态体积: ' + (audit.total ? audit.total.bytes + ' Bytes' : '未知'));
      lines.push('扫描完整度: ' + (audit.complete ? '完全扫描 (' + audit.chunks + ' 分片 / ' + audit.visitedNodes + ' 节点)' : '部分扫描 (分片触顶/截断)'));
      lines.push('');
      lines.push('## 状态统计概览');
      lines.push('- 有界注册容器: ' + audit.registeredCount + ' 个');
      lines.push('- 异常超限 (drifted): ' + audit.drifted.length + ' 个');
      lines.push('- 未规整无界风险 (suspects): ' + audit.suspects.length + ' 个');
      lines.push('');
      if (audit.drifted.length > 0) {
        lines.push('## ⚠️ 异常超限容器 (Drifted)');
        audit.drifted.forEach(function (r) {
          lines.push('- **' + r.path + '**: 实际 ' + r.len + ' 项 / 上限 ' + r.cap + ' 项 (' + r.bytes + ' Bytes) | 出处: ' + r.site);
        });
        lines.push('');
      }
      if (audit.suspects.length > 0) {
        lines.push('## ⚠️ 未规整风险容器 (Suspects)');
        audit.suspects.forEach(function (r) {
          lines.push('- **' + r.path + '**: ' + r.len + ' 项 (' + r.bytes + ' Bytes)');
        });
        lines.push('');
      }
      lines.push('## 📦 存储键空间（localStorage）');
      try {
        const ss = this.storageStat();
        lines.push('- worldaxis_* 键总数: ' + ss.totalKeys + '（' + ss.totalBytes + ' Bytes）');
        lines.push('- state(存档): ' + ss.families.state + ' 键 / ' + ss.perFamilyBytes.state + 'B · 派生槽(同步修订号): ' + ss.families.stateDerived + ' 键 · recovery(恢复点): ' + ss.families.recovery + ' / ' + ss.perFamilyBytes.recovery + 'B');
        lines.push('- diagnostic(诊断): ' + ss.families.diagnostic + ' 键 / ' + ss.perFamilyBytes.diagnostic + 'B · corrupt(隔离): ' + ss.families.corrupt + ' / ' + ss.perFamilyBytes.corrupt + 'B');
        lines.push('- settings(设置): ' + ss.families.settings + ' 键 · wb(世界书): ' + ss.families.wb + ' 键' + (ss.currentChatQuarantines > 0 ? ' · 当前聊天隔离副本: ' + ss.currentChatQuarantines + ' 个（受保护，需人工处置）' : ''));
        lines.push('- 跨聊天过期诊断键候选: ' + (ss.staleDiagCandidates || []).length + ' 个（store.sweepStaleKeys() 可清理）');
      } catch (e) { lines.push('- storageStat 不可用: ' + String(e && e.message)); }
      lines.push('');
      lines.push('## 📊 Top 容器内存占用排行');
      (audit.arrays || []).slice(0, 15).forEach(function (r, i) {
        lines.push((i + 1) + '. `' + r.path + '`: ' + r.len + ' 项 (' + r.bytes + 'B)' + (r.bounded ? ' [有界 cap=' + r.cap + ']' : ' [无界]'));
      });
      return lines.join('\n');
    },
    sizeAuditFull(opts) {
      const o = opts || {};
      const chunkNodes = typeof o.chunkNodes === 'number' && o.chunkNodes > 0 ? o.chunkNodes : 800;
      const maxChunks = typeof o.maxChunks === 'number' && o.maxChunks > 0 ? o.maxChunks : 64;
      const minBytes = typeof o.minBytes === 'number' ? o.minBytes : 256;
      const merged = {};   // path -> row（同路径取较大体积，保守上报）
      let cursor = null, chunks = 0, visitedSum = 0, truncated = false, stalled = false;
      let depthCap = null;
      for (;;) {
        const pass = WA.store.sizeAudit({
          minBytes: minBytes, maxNodes: chunkNodes,
          maxDepth: typeof o.maxDepth === 'number' ? o.maxDepth : 3,
          topN: 1000000, resumeCursor: cursor
        });
        if (pass && pass.error) return { error: pass.error };
        chunks++;
        if (depthCap === null) depthCap = pass.depthCap;
        (pass.arrays || []).forEach(function (r) {
          const prev = merged[r.path];
          if (!prev || r.bytes >= prev.bytes) merged[r.path] = r;
        });
        visitedSum += pass.scannedNodes;
        truncated = !!pass.truncated;
        cursor = pass.cursor;
        if (!cursor || !cursor.length) { cursor = null; break; }      // 扫完
        if (pass.scannedNodes === 0) { stalled = true; break; }        // 无进展（防御）
        if (chunks >= maxChunks) { stalled = true; break; }            // 片数触顶
      }
      const rows = Object.keys(merged).map(function (k) { return merged[k]; });
      const concl = deriveAuditRows(rows, minBytes);   // v0.1.48: 与 sizeAudit 同一派生实现
      const complete = !truncated && !stalled;
      return {
        complete: complete,
        chunks: chunks,
        visitedNodes: visitedSum,
        chunkNodes: chunkNodes,
        maxChunks: maxChunks,
        depthCap: depthCap,
        stalled: stalled,
        total: auditTotal(),       // v0.1.48: 改读当前内存态（此前用 saveStat.bytes，写合并下滞后）
        persisted: (WA.store.saveStat ? WA.store.saveStat().bytes : 0) || 0,
        scanned: rows.length,
        trackedBounded: Object.keys(__BOUNDED_CAPS).length,
        arrays: rows.slice().sort(function (a, b) { return (b.bytes - a.bytes) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0); }).slice(0, (o.topN && o.topN > 0) ? o.topN : 12),
        unbounded: concl.unbounded,
        suspects: concl.suspects,
        drifted: concl.drifted
      };
    },
    get() { return memCache; },

    // 事务式更新：传入修改函数，成功才持久化（失败不留半份状态）
    transact(mutator, opts) {
      // v0.1.30: 事务计量——每轮生成触发多少次 transact、耗时多少（排查链式落盘）
      const t0 = Date.now();
      // v0.1.33: 嵌套事务——内层 mutator 直接在最外层 draft 上修改，提交延迟到最外层统一 save。
      // 修复：外层 save(draft) 用外层开始时的旧快照整体覆盖内层已提交改动
      // （backstage.applyResult → horizon.acceptResult/digest.generate 链路的静默丢失）
      if (__tx.length) {
        const outer = __tx[__tx.length - 1];
        let result;
        try { result = mutator(outer); }
        catch (e) { recTx(Date.now() - t0, 'error'); WA.log('error', 'store.transact嵌套修改异常（外层事务继续）', e); return { ok: false, error: e }; }
        if (result === false) { recTx(Date.now() - t0, 'aborted'); return { ok: false, aborted: true, deferred: true }; }
        // v0.1.34: 嵌套事务纳入计量（deferred=随外层提交的内层数）
        recTx(Date.now() - t0, 'ok-deferred');
        return { ok: true, deferred: true, state: outer, result };
      }
      const draft = cloneDraft(memCache);
      __tx.push(draft);
      let result, ret;
      try { result = mutator(draft); }
      catch (e) { __tx.pop(); recTx(Date.now() - t0, 'error'); WA.log('error', 'store.transact修改异常，未提交', e); return { ok: false, error: e }; }
      if (result === false) { __tx.pop(); recTx(Date.now() - t0, 'aborted'); return { ok: false, aborted: true }; }
      // v0.1.31: 批作用域内只推进内存，落盘延迟到批退出（写合并）
      if (__batch.depth > 0 && __batch.orphaned) {
        // v0.1.35: 跨纪元僵尸批——不执行 mutator（防旧轮逻辑改写新聊天状态）
        __tx.pop();
        recTx(Date.now() - t0, 'aborted');
        return { ok: false, aborted: true, stale: true };
      }
      if (__batch.depth > 0) {
        memCache = draft; __batch.dirty = true;
        recTx(Date.now() - t0, 'ok-batched');
        ret = { ok: true, persisted: null, batched: true, state: draft, result };
      } else {
        const saved = this.save(draft);
        recTx(Date.now() - t0, saved ? 'ok' : 'save-failed');
        // ok=内存事务语义（v0.1.22 契约：落盘失败不回滚内存）；persisted=v0.1.30 新增落盘结果
        ret = { ok: true, persisted: saved, state: draft, result };
      }
      __tx.pop();
      return ret;
    },

    // ── 恢复点 ──
    createRecoveryPoint(chatId) {
      try {
        const key = recoveryKey(chatId);
        const list = JSON.parse(mainWin.localStorage.getItem(key) || '[]');
        list.unshift({ at: Date.now(), state: JSON.parse(JSON.stringify(memCache || defaultWorldState())) });
        while (list.length > MAX_RECOVERY_POINTS) list.pop();
        mainWin.localStorage.setItem(key, JSON.stringify(list));
      } catch (e) { WA.log('warn', '创建恢复点失败', e); }
    },
    listRecoveryPoints(chatId) {
      try { return JSON.parse(mainWin.localStorage.getItem(recoveryKey(chatId)) || '[]'); }
      catch (e) { return []; }
    },
    /**
     * v0.1.51: 存储键卫生观测（只读）——枚举 worldaxis_* 键空间，按 family/chat 分类计量。
     * diagnostic 键按其聊天活跃时间（state.meta.updatedAt）标记 stale 候选。
     */
    storageStat(opts) {
      const o = opts || {};
      const maxIdleMs = (typeof o.maxIdleDays === 'number' && o.maxIdleDays >= 0 ? o.maxIdleDays : 30) * 86400000;
      const cur = getChatId();
      const keys = listWorldAxisKeys();
      const families = { state: 0, stateDerived: 0, recovery: 0, diagnostic: 0, corrupt: 0, settings: 0, wb: 0, other: 0 };
      const perFamilyBytes = { state: 0, stateDerived: 0, recovery: 0, diagnostic: 0, corrupt: 0, settings: 0, wb: 0, other: 0 };
      let totalBytes = 0, stateKeys = 0, stateDerivedKeys = 0, diagKeys = 0, corruptKeys = 0, curBytes = 0, curQuarantines = 0;
      const staleDiagCandidates = [];   // 仅超期项（与 sweepStaleKeys 同阈值）：{ key, chat, kind, idleMs }
      const now = Date.now();
      keys.forEach(function (k) {
        const cls = classifyKey(k);
        const b = keyBytes(k);
        totalBytes += b;
        families[cls.family]++; perFamilyBytes[cls.family] += b;
        if (cls.family === 'state') stateKeys++;
        if (cls.family === 'stateDerived') stateDerivedKeys++;
        if (cls.family === 'diagnostic') {
          diagKeys++;
          if (cls.chat !== cur) {
            const act = chatActivityAt(cls.chat);
            const idleMs = act > 0 ? now - act : Infinity;   // 无 state 键 = 冷透（聊天已删或从未落盘）
            if (idleMs > maxIdleMs) staleDiagCandidates.push({ key: k, chat: cls.chat, kind: cls.kind, lastActiveAt: act, idleMs: idleMs });
          }
        }
        if (cls.family === 'corrupt') {
          corruptKeys++;
          // v0.2.3: 当前聊天的隔离副本受保护（sweep 不清理）——单独计量以便面板透出与手动处置
          if (cls.chat === cur) curQuarantines++;
        }
        if (cls.chat === cur) curBytes += b;
      });
      return {
        totalKeys: keys.length,
        totalBytes: totalBytes,
        families: families,
        perFamilyBytes: perFamilyBytes,
        currentChat: cur,
        currentChatBytes: curBytes,
        chats: stateKeys,
        stateDerivedKeys: stateDerivedKeys,
        diagKeys: diagKeys,
        corruptKeys: corruptKeys,
        currentChatQuarantines: curQuarantines,
        staleDiagCandidates: staleDiagCandidates.sort(function (a, b2) { return a.idleMs - b2.idleMs; }),
        enumerable: typeof mainWin.localStorage.length === 'number' && mainWin.localStorage.length >= 0
      };
    },
    /**
     * v0.1.51: 过期存储键清理（默认 dry-run）。返回清理计划；apply:true 才真正删除。
     * 规则（保守优先，宁可漏删不可误删）：
     *  - diagnostic 键：所属聊天超过 maxIdleDays 天未活跃（state.meta.updatedAt 基准）→ 候选
     *  - corrupt 键：state 损坏隔离与 settingsBus 设置损坏隔离统一只保留最近 keepCorrupt 个（按键名时间戳排序），更老的候选
     *  - state/recovery：聊天既无 state 本体也无 state 隔离副本 → 一并清理（孤儿恢复点）
     *  - 隔离副本（*_corrupt_*）：与 state 本体同样受「当前聊天保护」约束
     *  - settings/wb：永不清理（用户数据）
     *  - 当前聊天的任何键：永不清理
     */
    sweepStaleKeys(opts) {
      const o = opts || {};
      const apply = o.apply === true;
      const maxIdleMs = (typeof o.maxIdleDays === 'number' && o.maxIdleDays >= 0 ? o.maxIdleDays : 30) * 86400000;
      const keepCorrupt = typeof o.keepCorrupt === 'number' && o.keepCorrupt >= 0 ? o.keepCorrupt : 5;
      const cur = getChatId();
      const keys = listWorldAxisKeys();
      const now = Date.now();
      const plan = { remove: [], keep: [], byFamily: { diagnostic: 0, corrupt: 0, orphanRecovery: 0 }, freedBytes: 0, apply: apply };
      // ── corrupt：state 隔离键与 settings 隔离键（settingsBus 损坏隔离产出）统一按键名时间戳排序，留最近 keepCorrupt 个 ──
      const corruptKeysSorted = keys.filter(function (k) { return classifyKey(k).family === 'corrupt'; })
        .sort(function (a, b2) { return (parseInt((b2.match(/_corrupt_(\d+)$/) || [])[1], 10) || 0) - (parseInt((a.match(/_corrupt_(\d+)$/) || [])[1], 10) || 0); });
      const corruptKeepSet = {};
      corruptKeysSorted.slice(0, keepCorrupt).forEach(function (k) { corruptKeepSet[k] = true; });
      // ── 每聊天活跃度缓存 ──
      const actCache = {};
      function act(chat) { if (!(chat in actCache)) actCache[chat] = chatActivityAt(chat); return actCache[chat]; }
      // ── 孤儿 recovery 判定：聊天无 state 键（state 被清/从未写）→ recovery 为孤儿 ──
      const stateChats = {};
      // v0.2.3: state 隔离键（corrupt/quarantine=state）视为该聊天存档仍存在——隔离是为保命而非删除，
      // 其 recovery 快照不得判为孤儿（否则用户唯一可回滚的数据被清理）
      keys.forEach(function (k) {
        const c = classifyKey(k);
        if (c.family === 'state' || (c.family === 'corrupt' && c.quarantine === 'state')) stateChats[c.chat] = true;
      });
      keys.forEach(function (k) {
        const c = classifyKey(k);
        if (c.chat === cur || c.family === 'settings' || c.family === 'wb') { plan.keep.push(k); return; }
        if (c.family === 'corrupt') {
          if (corruptKeepSet[k]) { plan.keep.push(k); return; }
          plan.remove.push({ key: k, reason: 'corrupt-overflow', family: c.family, quarantine: c.quarantine || 'state', bytes: keyBytes(k) });
          return;
        }
        if (c.family === 'diagnostic') {
          const last = act(c.chat);
          const idleMs = last > 0 ? now - last : Infinity;
          if (idleMs > maxIdleMs) plan.remove.push({ key: k, reason: 'diag-idle', family: c.family, kind: c.kind, chat: c.chat, idleMs: idleMs, lastActiveAt: last, bytes: keyBytes(k) });
          else plan.keep.push(k);
          return;
        }
        if (c.family === 'recovery' && !stateChats[c.chat]) {
          plan.remove.push({ key: k, reason: 'orphan-recovery', family: c.family, chat: c.chat, bytes: keyBytes(k) });
          return;
        }
        if (c.family === 'stateDerived') { plan.keep.push(k); return; }   // v0.2.3: state 派生键跟随存档本体保留
        plan.keep.push(k);   // state（其他聊天的存档本体，默认保留——清理属用户决策）与未过期 recovery
      });
      plan.remove.forEach(function (r) { plan.freedBytes += r.bytes; plan.byFamily[r.reason] = (plan.byFamily[r.reason] || 0) + 1; });
      if (apply) plan.remove.forEach(function (r) { try { mainWin.localStorage.removeItem(r.key); } catch (e) {} });
      return plan;
    },
    /**
     * v0.2.0: 诊断体积预算——storageStat 现成计量上增加「当前聊天诊断键体积占比」。
     * 诊断环（eventLog/errorLog/wfHistory/uninjectLedger）随轮次增长，超阈值提示精简/扩容。
     */
    diagBudget(opts) {
      const o = opts || {};
      const maxPct = typeof o.maxPct === 'number' && o.maxPct > 0 ? o.maxPct : 20;
      const stat = this.storageStat();
      const cur = stat.currentChat;
      const keys = listWorldAxisKeys();
      let diagBytes = 0, stateBytes = 0;
      keys.forEach(function (k) {
        const c = classifyKey(k);
        if (c.chat !== cur) return;
        if (c.family === 'diagnostic') diagBytes += keyBytes(k);
        else if (c.family === 'state') stateBytes += keyBytes(k);
      });
      const total = diagBytes + stateBytes;
      const pct = total > 0 ? Math.round(diagBytes * 1000 / total) / 10 : 0;
      return { chat: cur, diagBytes: diagBytes, stateBytes: stateBytes, totalBytes: total, diagPct: pct, maxPct: maxPct, exceeded: pct > maxPct };
    },
    /** v0.2.0: orphan settings 候选——注册表标记 orphan 且键已不存在的项（幽灵配置，建议面板一键移除注册） */
    orphanSettingsKeys() {
      try { return WA.settingsBus && WA.settingsBus.pendingOrphan ? WA.settingsBus.pendingOrphan() : []; } catch (e) { return []; }
    },
    /**
     * v0.3.0: 导出全部恢复点（可下载 JSON，离机备份出口）。
     * 缺陷背景：恢复点环形窗口仅 3 个且只存于 localStorage——一旦配额清理或用户清浏览器数据即全部丢失。
     */
    exportRecoveryPoints(chatId) {
      const cid = chatId || getChatId();
      const list = this.listRecoveryPoints(cid);
      let bytes = 0;
      try { bytes = JSON.stringify(list).length; } catch (e) { bytes = -1; }
      return {
        worldaxis: SCHEMA_VERSION,
        kind: 'recovery-points',
        exportedAt: new Date().toISOString(),
        chatId: cid,
        count: list.length,
        max: MAX_RECOVERY_POINTS,
        bytes: bytes,
        points: list
      };
    },
    /**
     * v0.3.0: 丢弃单个恢复点（按索引）——用户确认某点已无用时可腾出环形窗口，
     * 而不必等它被新点挤出（避免「想保留新点却被旧点占位」）。
     */
    dropRecoveryPoint(chatId, index) {
      const cid = chatId || getChatId();
      const list = this.listRecoveryPoints(cid);
      const i = typeof index === 'number' ? index : -1;
      if (i < 0 || i >= list.length) return { ok: false, reason: '索引越界（当前 ' + list.length + ' 个恢复点）' };
      const dropped = list.splice(i, 1)[0];
      try { mainWin.localStorage.setItem(recoveryKey(cid), JSON.stringify(list)); }
      catch (e) { return { ok: false, reason: '写入失败：' + ((e && e.message) || e) }; }
      WA.log('info', '已丢弃 1 个恢复点（' + new Date(dropped.at).toLocaleString() + '），剩余 ' + list.length + ' 个');
      return { ok: true, remaining: list.length, droppedAt: dropped.at };
    },
    /** v0.1.37: 恢复点计量只读视图（tool-diag 消费）——bytes 为序列化总体积，count===max 提示环形覆盖将发生 */
    recoveryStat(chatId) {
      const list = this.listRecoveryPoints(chatId);
      let bytes = 0;
      try { bytes = JSON.stringify(list).length; } catch (e) { bytes = -1; }
      return { count: list.length, max: MAX_RECOVERY_POINTS, full: list.length >= MAX_RECOVERY_POINTS, bytes: bytes, lastAt: list.length ? list[0].at : 0 };
    },
    /**
     * v0.3.0: 隔离现场清单（只读）——state/settings 损坏时保存的原始字节现场。
     * 缺陷背景：隔离机制把损坏现场存进 *_corrupt_<ts> 后无任何读回通道，
     * 「数据被保存了」不等于「数据可恢复」。此处提供可发现性 + 内容摘要。
     */
    listQuarantineSites(opts) {
      const o = opts || {};
      const keys = listWorldAxisKeys();
      const out = [];
      keys.forEach(function (k) {
        const c = classifyKey(k);
        if (c.family !== 'corrupt') return;
        let raw = '';
        try { raw = mainWin.localStorage.getItem(k) || ''; } catch (e) { raw = ''; }
        const ts = parseInt((k.match(/_corrupt_(\d+)$/) || [])[1], 10) || 0;
        let parseable = null;   // state 隔离现场：损坏字节通常不可解析，但值得试探（部分写入可能仍可解析）
        if (c.quarantine === 'state') { try { JSON.parse(raw); parseable = true; } catch (e) { parseable = false; } }
        out.push({
          key: k, chat: c.chat, quarantine: c.quarantine, at: ts,
          bytes: byteLen(raw), parseable: parseable,
          isCurrentChat: c.chat === getChatId(),
          head: raw.slice(0, 120)   // 摘要（不泄露全文，供人工判断现场性质）
        });
      });
      out.sort(function (a, b) { return b.at - a.at; });
      return o.chat ? out.filter(function (x) { return x.chat === o.chat; }) : out;
    },
    /** v0.3.0: 隔离现场聚合计量（面板/报告消费） */
    quarantineStat() {
      const sites = this.listQuarantineSites();
      const byChat = {};
      sites.forEach(function (x) {
        const cid = x.chat || '(settings)';
        byChat[cid] = (byChat[cid] || 0) + 1;
      });
      const parseable = sites.filter(function (x) { return x.parseable === true; }).length;
      let bytes = 0;
      sites.forEach(function (x) { bytes += x.bytes; });
      return {
        total: sites.length, bytes: bytes, byChat: byChat,
        stateSites: sites.filter(function (x) { return x.quarantine === 'state'; }).length,
        settingsSites: sites.filter(function (x) { return x.quarantine === 'settings'; }).length,
        parseable: parseable,
        currentChatSites: sites.filter(function (x) { return x.isCurrentChat; }).length,
        restores: __quarantineStat.restores, drops: __quarantineStat.drops,
        lastRestoreAt: __quarantineStat.lastRestoreAt, lastDropAt: __quarantineStat.lastDropAt
      };
    },
    /**
     * v0.3.0: 从隔离现场恢复（数据救援出口）。
     * 现场可解析 → 写回 state 本体（写前自动留恢复点，防二次损坏无退路）；
     * 现场不可解析（真损坏字节）→ 拒绝写入并说明原因（不把垃圾灌回 state）。
     * 恢复成功后隔离现场保留（作为审计证据），由 dropQuarantine 显式丢弃。
     */
    restoreQuarantine(key, chatId) {
      if (typeof key !== 'string') return { ok: false, reason: '缺少隔离键' };
      const c = classifyKey(key);
      if (c.family !== 'corrupt' || c.quarantine !== 'state') {
        return { ok: false, reason: '非 state 隔离现场（settings 隔离现场请用设置面板重置）' };
      }
      let raw = null;
      try { raw = mainWin.localStorage.getItem(key); } catch (e) { return { ok: false, reason: '读取隔离键失败：' + ((e && e.message) || e) }; }
      if (!raw) return { ok: false, reason: '隔离现场不存在' };
      let parsed = null;
      try { parsed = JSON.parse(raw); }
      catch (e) { return { ok: false, reason: '隔离现场为真损坏字节（无法解析），不可恢复——如确认放弃可 dropQuarantine 删除' }; }
      const target = chatId || c.chat;
      try {
        this.createRecoveryPoint(target);   // 写前留点：即使恢复的内容不对也有退路
        memCache = parsed;
        const saved = this.save(memCache, target);
        if (!saved) return { ok: false, reason: '恢复内容已载入内存，但落盘失败（配额？）——请先清理存储键空间' };
      } catch (e) {
        return { ok: false, reason: '恢复写入失败：' + ((e && e.message) || e) };
      }
      __quarantineStat.restores++; __quarantineStat.lastRestoreAt = Date.now(); __quarantineStat.lastKey = key;
      WA.log('warn', '已从隔离现场恢复 state（' + key + '，聊天 ' + target + '）——原隔离键保留作为审计证据');
      return { ok: true, chat: target, bytes: byteLen(raw) };
    },
    /** v0.3.0: 显式丢弃隔离现场（用户确认无需再恢复）——审计留痕，不静默删 */
    dropQuarantine(key) {
      if (typeof key !== 'string') return { ok: false, reason: '缺少隔离键' };
      const c = classifyKey(key);
      if (c.family !== 'corrupt') return { ok: false, reason: '非隔离键，拒绝删除（防误用成通用删除器）' };
      let existed = null;
      try { existed = mainWin.localStorage.getItem(key); } catch (e) {}
      if (existed === null) return { ok: false, reason: '隔离现场不存在（可能已被清理或键名有误）' };
      try { mainWin.localStorage.removeItem(key); }
      catch (e) { return { ok: false, reason: '删除失败：' + ((e && e.message) || e) }; }
      __quarantineStat.drops++; __quarantineStat.lastDropAt = Date.now();
      WA.log('info', '已丢弃隔离现场（用户确认）: ' + key);
      return { ok: true, key: key, quarantine: c.quarantine };
    },

    restore(index, chatId) {
      const list = this.listRecoveryPoints(chatId);
      if (!list[index]) return false;
      this.createRecoveryPoint(chatId); // 恢复前也留点
      memCache = list[index].state;
      this.save(memCache, chatId);
      WA.log('info', '已恢复到 ' + new Date(list[index].at).toLocaleString());
      return true;
    },

    // ── 便捷读写 ──
    patch(path, value) {
      return this.transact(draft => {
        const segs = path.split('.');
        let node = draft;
        for (let i = 0; i < segs.length - 1; i++) { node[segs[i]] = node[segs[i]] || {}; node = node[segs[i]]; }
        node[segs[segs.length - 1]] = value;
      });
    },
    read(path, fallback) {
      let node = memCache;
      for (const seg of path.split('.')) { if (node == null) return fallback; node = node[seg]; }
      return node === undefined ? fallback : node;
    },

    // 正文锚点/分支（swipe）隔离：当前分支id
    currentBranchId() {
      const ctx = getCtx();
      try {
        const chat = ctx && ctx.chat;
        if (!chat || !chat.length) return 'b0';
        const last = chat[chat.length - 1];
        return 'm' + (chat.length - 1) + '_s' + (last && last.swipe_id != null ? last.swipe_id : 0);
      } catch (e) { return 'b0'; }
    }
  };
})();
