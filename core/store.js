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
        round: 0, digest: ''
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

  const store = WA.store = {
    SCHEMA_VERSION,
    defaultWorldState,

    init() {
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
        mainWin.localStorage.setItem(storageKey(chatId), JSON.stringify(s));
        memCache = s;
        return true;
      } catch (e) { WA.log('error', 'store.save失败', e); return false; }
    },

    get() { return memCache; },

    // 事务式更新：传入修改函数，成功才持久化（失败不留半份状态）
    transact(mutator, opts) {
      const draft = JSON.parse(JSON.stringify(memCache));
      let result;
      try { result = mutator(draft); }
      catch (e) { WA.log('error', 'store.transact修改异常，未提交', e); return { ok: false, error: e }; }
      if (result === false) return { ok: false, aborted: true };
      this.save(draft);
      return { ok: true, state: draft, result };
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
