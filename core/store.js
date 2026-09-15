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
        history: [], storylines: [], relations: {}
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

  const store = WA.store = {
    SCHEMA_VERSION,
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
      WA.log('info', 'store就绪 chat=' + getChatId() + ' schema=' + memCache.schemaVersion);
    },

    migrate(state) {
      // 未来schema升级走这里；当前v1直接补齐缺字段
      const fresh = defaultWorldState();
      const out = Object.assign(fresh, state);
      out.schemaVersion = SCHEMA_VERSION;
      return out;
    },

    load(chatId) {
      try {
        const raw = mainWin.localStorage.getItem(storageKey(chatId));
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) { WA.log('error', 'store.load失败', e); return null; }
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
      const draft = JSON.parse(JSON.stringify(memCache));
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
