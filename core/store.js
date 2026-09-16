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
  // v0.1.38: 加载观测——状态键损坏时隔离原始 payload 而非静默丢弃
  const __loadStat = { loads: 0, hits: 0, misses: 0, errors: 0, healed: 0, shapeConflicts: 0, lastFix: { filled: 0, conflicts: 0, at: 0 }, lastError: null, lastAt: 0 };
  // v0.1.46: 版本链迁移步注册表（fromVersion -> fn(state)）
  const __migrations = {};
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
    migrate(state, targetVersion) {
      // 起始版本必须读 state 原值：Object.assign 会让缺 schemaVersion 的远古存档
      // 继承默认值(SCHEMA_VERSION)，从而跳过整条版本链
      const fromV = (state && typeof state.schemaVersion === 'number') ? state.schemaVersion : 0;
      const out = Object.assign(defaultWorldState(), state);
      // targetVersion 可显式指定（默认当前版本）：便于跨多版本链的测试与调试
      const target = typeof targetVersion === 'number' && targetVersion >= 0 ? targetVersion : SCHEMA_VERSION;
      let v = fromV;
      const steps = [];
      // 沿版本链步进（防死循环：步数不超过版本跨度）
      let guard = 0;
      while (v < target && guard++ <= target + 1) {
        const step = __migrations[v];
        if (step) { try { step(out); steps.push(v + '->' + (v + 1)); } catch (e) { WA.log('error', '迁移步 ' + v + '->' + (v + 1) + ' 失败', e); } }
        v++;
      }
      ensureShape(out, defaultWorldState());   // v0.1.45: 升级路径同样补齐嵌套缺字段
      out.schemaVersion = SCHEMA_VERSION;
      out._migratedFrom = steps.length ? { from: fromV, to: SCHEMA_VERSION, path: steps } : out._migratedFrom;
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
        WA.log('error', __saveStat.reason === 'quota' ? 'store.save失败：localStorage 配额耗尽，世界状态未能落盘（导出快照并清理旧聊天数据）' : 'store.save失败', e);
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
    /** v0.1.22: 保存观测只读视图（tool-diag 消费）。bytes = 上次成功落盘的 UTF-8 体积 */
    saveStat() { return { at: __saveStat.at, ok: __saveStat.ok, bytes: __saveStat.bytes, reason: __saveStat.reason, failCount: __saveStat.failCount }; },
    /** v0.1.38: 加载观测只读视图（tool-diag 消费）——errors>0 意味着发生过状态键损坏 */
    loadStat() { return { loads: __loadStat.loads, hits: __loadStat.hits, misses: __loadStat.misses, errors: __loadStat.errors, healed: __loadStat.healed || 0, shapeConflicts: __loadStat.shapeConflicts || 0, lastFix: { filled: (__loadStat.lastFix && __loadStat.lastFix.filled) || 0, conflicts: (__loadStat.lastFix && __loadStat.lastFix.conflicts) || 0, at: (__loadStat.lastFix && __loadStat.lastFix.at) || 0 }, lastError: __loadStat.lastError, lastAt: __loadStat.lastAt }; },
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
      // 顶层路径才参与有界判定（a.b[0].c 这类元素内嵌数组由父容器隐式约束）
      const topRows = arrays.filter(function (a) { return a.path.indexOf('[') < 0; });
      const unregistered = topRows.filter(function (a) { return !a.bounded && a.len > 0; });
      const suspects = unregistered.filter(function (a) { return a.bytes >= minBytes; }).sort(function (x, y) { return y.bytes - x.bytes; });
      // v0.1.44 漂移：已登记容器长度超出 cap —— 白名单自身失效的信号
      const drifted = topRows.filter(function (a) { return a.bounded && a.cap !== null && a.len > a.cap; })
        .sort(function (x, y) { return (y.len - y.cap) - (x.len - x.cap); });
      let currentBytes = 0;
      try { currentBytes = byteLen(JSON.stringify(memCache)); } catch (e) { currentBytes = -1; }
      return {
        total: currentBytes >= 0 ? currentBytes : ((WA.store.saveStat ? WA.store.saveStat().bytes : 0) || 0),
        persisted: (WA.store.saveStat ? WA.store.saveStat().bytes : 0) || 0,
        scanned: arrays.length,
        scannedNodes: visited,
        nodeBudget: maxNodes,
        depthCap: maxDepth,
        truncated: truncated,
        cursor: cursor,                // v0.1.46: 断点游标，resumeCursor 续扫
        trackedBounded: Object.keys(BOUNDED).length,
        arrays: arrays.slice().sort(function (a, b) { return b.bytes - a.bytes; }).slice(0, (o.topN && o.topN > 0) ? o.topN : 12),
        unbounded: unregistered.map(function (a) { return a.path; }),
        suspects: suspects.map(function (a) { return { path: a.path, len: a.len, bytes: a.bytes }; }),
        drifted: drifted.map(function (a) { return { path: a.path, len: a.len, cap: a.cap, bytes: a.bytes, site: a.site }; })
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
    /** v0.1.37: 恢复点计量只读视图（tool-diag 消费）——bytes 为序列化总体积，count===max 提示环形覆盖将发生 */
    recoveryStat(chatId) {
      const list = this.listRecoveryPoints(chatId);
      let bytes = 0;
      try { bytes = JSON.stringify(list).length; } catch (e) { bytes = -1; }
      return { count: list.length, max: MAX_RECOVERY_POINTS, full: list.length >= MAX_RECOVERY_POINTS, bytes: bytes, lastAt: list.length ? list[0].at : 0 };
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
