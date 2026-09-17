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
      opinion: { canon: [], forum: [], sandbox: [], updatedAt: 0 },
      // 记忆分层 L0-L3
      memory: {
        facts: [],              // 长期事实 {key,value,version,active,reason,at}
        pmem: [],               // v1.5.0 物化：个人主观记忆（登记 cap 60，pmem.js 写入方自此前置自愈，直写不再炸事务）
        foreshadows: [],        // 伏笔 {id,content,status:waiting|developing|triggered|recycled|dropped,links:[],at}
        l0: [], l1: [], l2: [], l3: []   // 分层经历摘要
      },
      // 事件演化（World引擎：冲突/进度阶段机 + 势力/声誉/经济/仇敌/黑盒/天下大势）
      evolution: {
        events: [], factions: [], winds: [], trends: [], enemies: [],
        blackbox: { secretActions: [], secretAssets: [] }, worldTrends: [], regionalIncident: null,
        // v1.6.0 物化：实体记忆库（登记四键 cap 30 此前未在骨架声明——冷启动审计不可见、直写即炸事务）
        entityMemory: { organization: [], object: [], ability: [], location: [] },
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
        history: [],
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
      meta: { createdAt: Date.now(), updatedAt: Date.now(), lastSettle: null }
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
  // v0.4.0: lastOk = 「当前态」信号（最近一次救援是否成功），与累积 failed 分离——
  // 健康分只看当前态，否则历史一次配额失败会把健康分永久压低（与 integrity 同类裁决）。
  const __rescueStat = { attempts: 0, recovered: 0, failed: 0, lastFreedBytes: 0, lastAt: 0, lastRemoved: 0, lastOk: null, lastFailAt: 0 };
  // v0.4.0: 写入完整性审计——写后读回校验（检测静默截断/丢弃写入）
  // v0.4.0: lastOk/lastFailAt = 「当前态」信号（最近一次写后校验结果），
  // 与 writes/verified/mismatches 等「历史经历」计数分离——
  // 健康分只看当前态，否则一次瞬时毒化会把健康分永久压低（误报警）。
  const __integrityStat = { writes: 0, verified: 0, mismatches: 0, retried: 0, recoveredByRetry: 0, lastAt: 0, lastReason: null, lastOk: null, lastFailAt: 0 };
  // ── v0.5.0: 多实例并发防护 ──────────────────────────────────
  // 背景：localStorage 为多标签页共享；两个窗口同时推进同一聊天时，后写会静默覆盖前写，
  // 且 save 返回 true、无任何告警——用户数轮进度永久丢失却无从察觉。
  // 对策：① 每次写入打上「写入者 + 全局单调序号」；② 写入前比对磁盘序号与本实例上次所见，
  //      不一致即判定「他实例已写过且本次将覆盖其改动」→ 先把对方 payload 存为冲突隔离键（不丢数据），
  //      再写入自己的版本，并计数/告警/进健康分。
  // 说明：浏览器 localStorage 无 CAS/锁原语，故不阻塞写入（阻塞会毁掉可用性），
  //      改为「覆盖前先保全 + 事后可观测 + 提供冲突现场出口」。
  const CONFLICT_KEEP = 3;   // 每聊天保留最近 N 个冲突现场
  let __conflictSeq = 0;
  // 键名必须唯一：仅用 Date.now() 时，同毫秒内的多次冲突会共用同一键 → 现场互相覆盖
  // （先发生的冲突被静默丢弃，与「不静默丢数据」的初衷相悖）。故追加单调序号。
  function conflictKey(chatId, ts) { return 'worldaxis_conflict_' + (chatId || getChatId()) + '_' + ts + '_' + (++__conflictSeq); }
  const __conflictStat = { detected: 0, quarantined: 0, lastAt: 0, lastChat: null, lastLostBytes: 0, lastKeptKey: null };
  let __writerId = null;      // 本实例标识（惰性生成，会话级稳定）
  let __lastConflict = null;  // 最近一次 save 检出的冲突（只读观测用）
  // v0.5.0: 跨实例实时感知——他实例写入本聊天 state 键时立即记录（不等本实例下次 save）
  const __externalWrite = { count: 0, lastAt: 0, lastKey: null, lastRev: 0, lastWriter: null, staleSince: 0 };
  let __storageHookInstalled = false;
  /** 判断某键是否为「本实例关心的聊天」的状态键 */
  function keyChatId(key) {
    const c = classifyKey(key);
    if (!c || !c.chat) return null;
    if (c.family === 'state' || c.family === 'stateDerived') return c.chat;
    return null;
  }
  function installStorageHook() {
    if (__storageHookInstalled) return;
    try {
      if (!mainWin.addEventListener) return;
      mainWin.addEventListener('storage', function (e) {
        try {
          if (!e || !e.key) return;
          const chat = keyChatId(e.key);
          if (!chat) return;
          // 只关心当前聊天的状态键（其他聊天落盘不影响本实例内存态）
          if (chat !== getChatId()) return;
          let rev = 0, writer = null;
          try {
            const st = JSON.parse(e.newValue || 'null');
            if (st && st.meta) { rev = st.meta.stateRev || 0; writer = st.meta.writer || null; }
          } catch (err) {}
          // 自己的写入不会产生 storage 事件；若 writer 与本实例相同则视为误触发（mock/兼容场景）
          if (writer && writer === __writerId) return;
          __externalWrite.count++;
          __externalWrite.lastAt = Date.now();
          __externalWrite.lastKey = e.key;
          __externalWrite.lastRev = rev;
          __externalWrite.lastWriter = writer;
          __externalWrite.staleSince = __externalWrite.staleSince || Date.now();
          WA.log('warn', '检测到另一实例更新了当前聊天的世界状态（序号 ' + rev + '）：'
            + '本窗口内存态可能已落后——继续推进会覆盖对方进度。建议刷新页面以载入最新状态'
            + '（若已覆盖，诊断面板「冲突现场」保留了对方快照）');
        } catch (err) {}
      });
      __storageHookInstalled = true;
    } catch (e) {}
  }
  let __writeSeq = 0;         // 本实例写入序号
  let __seenRev = 0;          // 本实例上次见到/写入的全局 stateRev（用于检出他方写入）
  function writerId() {
    if (__writerId) {
      // v0.5.0: 键被外部清除（清站点数据/配额回收）时重建——否则标识在存储侧永久消失
      try { if (mainWin.localStorage.getItem('worldaxis_writer_id') !== __writerId) mainWin.localStorage.setItem('worldaxis_writer_id', __writerId); } catch (e) {}
      return __writerId;
    }
    try {
      let w = mainWin.localStorage.getItem('worldaxis_writer_id');
      if (!w) {
        w = 'w' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        mainWin.localStorage.setItem('worldaxis_writer_id', w);
      }
      __writerId = w;
    } catch (e) { __writerId = 'w-mem-' + Math.random().toString(36).slice(2, 8); }
    return __writerId;
  }
  /** 读取磁盘上某聊天的 stateRev（0 = 不存在/不可解析） */
  function diskRev(chatId) {
    try {
      const raw = mainWin.localStorage.getItem(storageKey(chatId));
      if (!raw) return 0;
      const st = JSON.parse(raw);
      return (st && st.meta && typeof st.meta.stateRev === 'number') ? st.meta.stateRev : 0;
    } catch (e) { return 0; }
  }
  /** 保全他实例 payload 为冲突现场（不覆盖已有同名键） */
  function quarantineConflict(chatId, disc, mine) {
    const ts = Date.now();
    const key = conflictKey(chatId, ts);
    let bytes = 0;
    try {
      bytes = byteLen(disc);
      mainWin.localStorage.setItem(key, disc);
      __conflictStat.quarantined++;
      __conflictStat.lastKeptKey = key;
      __conflictStat.lastLostBytes = bytes;
      // 环形保留
      let all = [];
      try {
        const ls = mainWin.localStorage;
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k && k.indexOf('worldaxis_conflict_' + chatId + '_') === 0) all.push(k);
        }
      } catch (e) {}
      // 排序：先按时间戳段（第 4 段）再按序号段（第 5 段）——字符串序天然满足
      all.sort(function (a, b) {
        const pa = a.split('_'), pb = b.split('_');
        const ta = parseInt(pa[pa.length - 2], 10) || 0, tb = parseInt(pb[pb.length - 2], 10) || 0;
        if (ta !== tb) return ta - tb;
        return (parseInt(pa[pa.length - 1], 10) || 0) - (parseInt(pb[pb.length - 1], 10) || 0);
      });
      while (all.length > CONFLICT_KEEP) {
        try { mainWin.localStorage.removeItem(all.shift()); } catch (e) {}
      }
    } catch (e) {
      // 保全失败绝不能阻断写入（否则一撞配额就写不进去）——如实留痕
      WA.log('warn', '并发冲突现场保全失败（空间不足？）：他实例改动可能被覆盖', e);
      return null;
    }
    return { key: key, bytes: bytes };
  }

  // v0.4.0: 自动治理巡视状态——上次巡视签名（防重复告警）+ 历次自动动作审计
  let __maintainSig = '';
  const __maintainStat = { scans: 0, lastAt: 0, lastScore: 100, lastLevel: 'ok', autoApplies: 0, lastAutoFreedKeys: 0, lastAutoFreedBytes: 0 };
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
    // v0.5.0: 冲突现场键（另一实例被覆盖前的 payload）——key = worldaxis_conflict_<chat>_<ts>_<seq>
    conflict: /^worldaxis_conflict_(.+)_(\d+)_(\d+)$/,
    // v0.5.0: 本实例写入者标识（全局单键，非聊天隔离）
    writerId: /^worldaxis_writer_id$/,
    corrupt: /^worldaxis_state_(.+)_corrupt_(\d+)$/,
    corruptSettings: /^worldaxis_(?!state_)([a-z_0-9]+)_corrupt_\d+$/,
    wb: /^worldaxis_wb_selection_(.+)$/,
    settingsSettings: /^worldaxis_(backstage_settings_v1|evolution_settings_v1|opinion_settings_v1|regional_settings_v1|api_channels_v1|workflow_v1|inject_visibility_v1|purifier_rules_v1|npc_registry_v1|oracle_plan_v1|active_preset|custom_presets)$/
  };
  function classifyKey(key) {
    let m;
    // v0.2.3: 隔离键必须保留 chat 归属——否则「当前聊天的键永不被清理」不变量对隔离副本失效
    // （当前聊天唯一幸存的可恢复现场被 sweep 当溢出删除），且隔离聊天的 recovery 快照被判孤儿删除
    // v0.5.0: 冲突现场与写入者标识须先于 state 判定（否则 worldaxis_conflict_* 不会被识别）
    if ((m = key.match(KEY_FAMILIES.conflict))) return { family: 'conflict', chat: m[1], at: parseInt(m[2], 10) || 0, seq: parseInt(m[3], 10) || 0 };
    if (KEY_FAMILIES.writerId.test(key)) return { family: 'writerId', chat: null };
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
  /**
   * v0.4.0: 写后读回校验——setItem 不抛错 ≠ 数据真的落盘。
   * 移动端浏览器/SillyTavern 在配额临界、写入毒化、后台回收等情况下可能静默截断或丢弃写入。
   * 此处写后立刻读回并逐字符比对，不一致则重试一次；两次都不一致 → 如实报告失败（不再假装成功）。
   * 返回 { ok, verified, retried, reason }
   */
  function writeVerified(key, payload) {
    __integrityStat.writes++;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { mainWin.localStorage.setItem(key, payload); }
      catch (e) { __integrityStat.lastOk = false; __integrityStat.lastFailAt = Date.now(); return { ok: false, verified: false, retried: attempt > 0, reason: 'write', error: e }; }
      let back = null;
      try { back = mainWin.localStorage.getItem(key); } catch (e) { back = null; }
      if (back === payload) {
        if (attempt > 0) { __integrityStat.retried++; __integrityStat.recoveredByRetry++; }
        __integrityStat.verified++; __integrityStat.lastAt = Date.now();
        __integrityStat.lastOk = true;   // 当前态：最近一次写入校验通过（含重试自愈）
        return { ok: true, verified: true, retried: attempt > 0, reason: null };
      }
      // 读回不一致：磁盘上的副本不是我们写的东西
      __integrityStat.mismatches++; __integrityStat.lastAt = Date.now();
      __integrityStat.lastReason = back === null ? 'missing-after-write'
        : (typeof back === 'string' && typeof payload === 'string' && back.length !== payload.length) ? 'length-mismatch' : 'content-mismatch';
      if (attempt === 0) continue;   // 重试一次（瞬时写入毒化/回收常可自愈）
    }
    __integrityStat.lastOk = false; __integrityStat.lastFailAt = Date.now();   // 当前态：最近一次写入校验失败
    return { ok: false, verified: false, retried: true, reason: 'verify' };
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
    'chronicle': { cap: 200, site: 'backstage.js slice(-200) + horizon.js CHRONICLE_CAP 同源（v1.3.0）' },
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
    'opinion.forum': { cap: 20, site: 'opinion.js concat slice(-20)' },
    // v1.0.0 补登：有界但漏登 → sizeAudit 误报 unbounded
    'evolution.trends': { cap: 20, site: 'evolution.js slice(-20)' },
    'evolution.blackbox.secretActions': { cap: 15, site: 'enemies.js slice(-15)' },
    'evolution.blackbox.secretAssets': { cap: 15, site: 'enemies.js slice(-15)' },
    'opinion.sandbox': { cap: 4, site: 'opinion.js slice(0,4)' },
    // v1.0.0 新增：对象型容器（kind:'object'，len = Object.keys().length）
    'people': { cap: 48, kind: 'object', site: 'backstage.js 人物入账剪枝（v1.0.0）' },
    // 活跃 MAX_ACTIVE(24) + 终结保留 TERMINATED_MAX(20) → 总量硬上限 44
    'evolution.enemies': { cap: 44, site: 'enemies.js 活跃/终结双口径剪枝（v1.0.0）' },
    'evolution.winds': { cap: 12, site: 'evolution.js MAX_WINDS=12 + backstage splice' },
    'evolution.worldTrends': { cap: 12, site: 'backstage.js wtArr splice 12' },
    'evolution.economy.signals': { cap: 3, site: 'evolution.js applyEconomy slice(0,3)' },
    'evolution.events': { cap: 16, site: 'editor-events.js MAX_EVENTS=16' },
    'evolution.factions': { cap: 16, site: 'editor-faction.js MAX_FACTIONS=16' },
    'directEvents': { cap: 4, site: 'direct-event.js pruneDirect(KEEP_DONE=3 + 1 活跃)' },
    'chapters.history': { cap: 20, site: 'chapters.js pruneHistory(MAX_HISTORY=20)' },
    // v1.4.0 补登：entityMemory 四类实体库（entities.js CAP_PER_TYPE=30 双处裁剪）——此前漏登致 sizeAudit 误报 unbounded、maintain 盲区
    'evolution.entityMemory.organization': { cap: 30, site: 'entities.js CAP_PER_TYPE=30' },
    'evolution.entityMemory.object': { cap: 30, site: 'entities.js CAP_PER_TYPE=30' },
    'evolution.entityMemory.ability': { cap: 30, site: 'entities.js CAP_PER_TYPE=30' },
    'evolution.entityMemory.location': { cap: 30, site: 'entities.js CAP_PER_TYPE=30' },
    // v1.4.0 新增：通配登记——嵌套动态路径（每实体 events 环，精确键无法枚举；'*' 段吃 1..n 段）
    'evolution.entityMemory.*.events': { cap: 8, wildcard: true, site: 'entities.js 实体事件环（保留最新 8 条）' },
    // v1.5.0 补登：people.<id>.profile 五节（profile.js 档案维护切片 cap）——此前漏登致深扫误报 unbounded、drifted/maintain 盲区
    'people.*.profile.personality': { cap: 15, wildcard: true, site: 'profile.js 档案五节切片' },
    'people.*.profile.worldview': { cap: 10, wildcard: true, site: 'profile.js 档案五节切片' },
    'people.*.profile.family': { cap: 10, wildcard: true, site: 'profile.js 档案五节切片' },
    'people.*.profile.memory': { cap: 25, wildcard: true, site: 'profile.js 档案五节切片' },
    'people.*.profile.relationships': { cap: 15, wildcard: true, site: 'profile.js 档案五节切片' },
    // v1.5.0 补登：people.<id>.knowledge 对象键容器（backstage 按 at 排序逐出，保留 30 键）
    'people.*.knowledge': { cap: 30, kind: 'object', wildcard: true, site: 'backstage.js knowledge 容量30逐出' }
  };
  // v1.4.0: 容量查找单一实现——精确键 → 下标归一化精确键 → 通配键 → null。
  // 通配键（wildcard:true）中 '*' 段匹配 1..n 个路径段（如 entityMemory.<type>.<idx>）；
  // sizeAudit（数组/对象分支）与 maintain 未登记判定共用本实现，防多路查找语义漂移。
  function matchWildcard(kSegs, pSegs) {
    const star = kSegs.indexOf('*');
    if (star < 0) return false;
    if (pSegs.length < kSegs.length) return false;   // '*' 至少吃 1 段
    const starExtra = pSegs.length - (kSegs.length - 1);
    for (let eat = 1; eat <= starExtra; eat++) {
      let ok = true;
      for (let si = 0; si < kSegs.length && ok; si++) {
        if (si === star) continue;
        const pi = si < star ? si : si + eat - 1;
        if (kSegs[si] !== pSegs[pi]) ok = false;
      }
      if (ok) return true;
    }
    return false;
  }
  function capsFor(pathStr) {
    if (!pathStr) return null;
    if (Object.prototype.hasOwnProperty.call(__BOUNDED_CAPS, pathStr)) return __BOUNDED_CAPS[pathStr];
    const norm = String(pathStr).replace(/\[(\d+)\]/g, '.$1');
    if (norm !== pathStr && Object.prototype.hasOwnProperty.call(__BOUNDED_CAPS, norm)) return __BOUNDED_CAPS[norm];
    const pSegs = norm.split('.');
    const ks = Object.keys(__BOUNDED_CAPS);
    for (let i = 0; i < ks.length; i++) {
      const m = __BOUNDED_CAPS[ks[i]];
      if (!m || !m.wildcard) continue;
      if (matchWildcard(ks[i].split('.'), pSegs)) return m;
    }
    return null;
  }
  // v1.6.0: 登记表↔schema 物化一致性自检（单一实现）——找出「登记表声明但状态中不存在」的容器。
  // 通配键（按定义不在默认状态）与 kind:'object' 键（键名集合由运行时决定）不参与判定。
  function registryParity() {
    const missing = [];
    const ks = Object.keys(__BOUNDED_CAPS);
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i], meta = __BOUNDED_CAPS[k];
      if (!meta || meta.wildcard) continue;
      if (meta.kind === 'object') continue;
      const segs = k.split('.');
      let cur = memCache, okPath = true;
      for (let j = 0; j < segs.length; j++) {
        if (cur === null || cur === undefined || typeof cur !== 'object' || !(segs[j] in cur)) { okPath = false; break; }
        cur = cur[segs[j]];
      }
      if (!okPath || !Array.isArray(cur)) missing.push({ path: k, cap: meta.cap, site: meta.site || '' });
    }
    return { checked: ks.filter(k => !__BOUNDED_CAPS[k].wildcard && __BOUNDED_CAPS[k].kind !== 'object').length, missing: missing, ok: missing.length === 0 };
  }
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
    /** v0.1.44: 有界容器登记表只读副本（测试反查源码一致性用）；v1.0.0: 透传 kind（array|object） */
    capsFor: capsFor,
    registryParity: registryParity,
    sizeCaps() { const c = {}; Object.keys(__BOUNDED_CAPS).forEach(function (k) { c[k] = { cap: __BOUNDED_CAPS[k].cap, site: __BOUNDED_CAPS[k].site, kind: __BOUNDED_CAPS[k].kind || 'array', wildcard: __BOUNDED_CAPS[k].wildcard === true ? true : undefined }; }); return c; },
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
      // v0.5.0: 跨实例实时感知钩子（幂等安装）
      try { installStorageHook(); } catch (e) {}
      try { if (memCache && memCache.meta && typeof memCache.meta.stateRev === 'number') __seenRev = memCache.meta.stateRev; } catch (e) {}
      // v0.5.0: init = 以磁盘为准重新同步内存 → 「内存已落后」条件此刻消解，清零外部写入标记。
      // 否则用户按提示刷新/切换聊天后警告仍不消失（顽固误报）。冲突审计与现场列表属历史事实，保留。
      try { __externalWrite.count = 0; __externalWrite.lastAt = 0; __externalWrite.lastKey = null; __externalWrite.lastRev = 0; __externalWrite.lastWriter = null; __externalWrite.staleSince = 0; } catch (e) {}
      // v0.1.49: 恢复当前聊天的事件日志与工作流历史
      try { if (WA.loadEventLog) WA.loadEventLog(); } catch (e) {}
      try { if (WA.workflow && WA.workflow.loadHistory) WA.workflow.loadHistory(); } catch (e) {}
      // v0.1.50: 恢复当前聊天的撤销台账
      try { if (WA.render && WA.render.loadUninjectLedger) WA.render.loadUninjectLedger(); } catch (e) {}
      // v0.1.52→0.1.54: 存储键卫生静默巡检——init 时 dry-run 一次，大额可回收仅留痕告警（不自动删，删否属用户决策）。
      // 节流纯指纹幂等（v0.1.54 定稿）：每次 init 都 dry-run（枚举 <10ms，无需时间窗——时间窗会制造「窗内新垃圾不可见」陷阱），
      // 清理计划指纹变化（新垃圾集出现/清理后消失）才告警；同指纹重复 init 静默。
      try {
        if (WA.store.maintain) {
          // v0.4.0: 统一健康巡视——把分散信号收敛为健康分，并在体积超阈值时自动执行安全回收子集。
          // 自动边界（严格保守）：仅回收过期诊断/孤儿恢复点/隔离溢出；当前聊天、settings、wb、
          // state 本体、可解析隔离现场永不自动动。动作全部进 maintainStat 审计。
          const m = WA.store.maintain({ apply: true, deep: false, minFreedBytes: 256 * 1024 });
          // v0.5.0: 指纹只取「卫生范畴」议题——否则 diag.budget / integrity / concurrent / rescue
          // 等无关议题的等级抖动会改变签名，使同一垃圾集反复告警（告警疲劳）。
          const hySig = m.issues
            .filter(function (x) { return /^(hygiene|quarantine|state)\./.test(x.key); })
            .map(function (x) { return x.key + ':' + x.level; })
            .sort().join('|');
          const sig = (m.planKeys || []).join('|') + '#' + hySig;
          const changed = sig !== __keyHygieneScanSig;
          __keyHygieneScanSig = sig;
          // 分级（严格沿用 v0.1.52 告警门槛「可回收 >256KB」）：
          //   ① 已自动回收 → warn（动作必留痕）
          //   ② 大额可回收（>256KB）→ warn（v0.1.52 契约；指纹节流，首见一次）
          //   ③ 健康降级 → warn（新增能力；指纹节流）
          //   ④ 其余（小额可回收 / 轻微议题）→ info，不污染 warn 计数
          const bigReclaim = m.signals.reclaimable > 0 && m.signals.reclaimableBytes > 256 * 1024;
          if (m.applied && m.applied.removed > 0) {
            WA.log('warn', '存储键卫生：已自动回收 ' + m.applied.removed + ' 个「聊天已消失」的残留键 / ' + Math.round(m.applied.freedBytes / 1024) + 'KB（健康分 ' + m.score + '，' + m.level + '）——现有聊天/设置/世界书/隔离现场未动');
          } else if (changed && bigReclaim) {
            WA.log('warn', '存储键卫生：发现 ' + m.signals.reclaimable + ' 个过期键可回收 ' + Math.round(m.signals.reclaimableBytes / 1024) + 'KB（健康分 ' + m.score + '）——诊断面板「存储键体检」可执行清理');
          } else if (changed && m.level === 'degraded') {
            WA.log('warn', '存储键卫生：健康分 ' + m.score + '（降级），' + m.issues.length + ' 项议题' + (m.issues.length ? '——' + m.issues[0].detail : ''));
          } else if (changed && m.issues.length) {
            WA.log('info', '存储键卫生：健康分 ' + m.score + '，' + m.issues.length + ' 项议题——' + m.issues[0].detail);
          }
        } else if (WA.store.sweepStaleKeys) {
          const plan = WA.store.sweepStaleKeys({});   // 回退路径：仅在缺 maintain 时保留旧 dry-run 指纹告警
          const sig = (plan.remove || []).map(function (r) { return r.key; }).sort().join('|');
          const changed = sig !== __keyHygieneScanSig;
          __keyHygieneScanSig = sig;
          if (changed && plan.remove.length && plan.freedBytes > 256 * 1024) {
            WA.log('warn', '存储键卫生：发现 ' + plan.remove.length + ' 个过期键可回收 ' + Math.round(plan.freedBytes / 1024) + 'KB，诊断面板「存储键体检」可执行清理');
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
        // v0.5.0: 写入者标识与全局单调序号（多实例并发防护的可观测基础）
        const cidW = chatId || getChatId();
        let conflict = null;
        try {
          const dRev = diskRev(cidW);
          // 磁盘序号与本实例上次所见不一致 → 他实例写过。若此刻直接写，其改动将被覆盖。
          if (__seenRev > 0 && dRev > __seenRev) {
            let rawDisc = null;
            try { rawDisc = mainWin.localStorage.getItem(storageKey(cidW)); } catch (e) { rawDisc = null; }
            if (rawDisc) {
              const kept = quarantineConflict(cidW, rawDisc, s);
              __conflictStat.detected++; __conflictStat.lastAt = Date.now(); __conflictStat.lastChat = cidW;
              conflict = { detected: true, otherRev: dRev, myRev: __seenRev, kept: kept };
              if (kept) {
                WA.log('warn', '检测到并发写入：另一实例已写入该聊天（序号 ' + dRev + ' > 本实例所见 ' + __seenRev
                  + '），本次保存将覆盖其改动——对方 payload 已保全为冲突现场（' + Math.round(kept.bytes / 1024)
                  + 'KB），诊断面板「冲突现场」可查看/提取');
              }
            }
          }
          if (dRev > __seenRev) __seenRev = dRev;
        } catch (e) {}
        s.meta.writer = writerId();
        s.meta.writeSeq = ++__writeSeq;
        s.meta.stateRev = (__seenRev || 0) + 1;
        __seenRev = s.meta.stateRev;
        const payload = JSON.stringify(s);
        if (conflict) __lastConflict = conflict;
        // v0.4.0: 写后读回校验（含一次重试）——替换裸 setItem，静默截断不再被当成成功
        const w = writeVerified(storageKey(chatId), payload);
        if (!w.ok && w.reason === 'verify') {
          __saveStat.at = Date.now(); __saveStat.ok = false; __saveStat.reason = 'verify'; __saveStat.failCount++;
          memCache = s;
          WA.log('error', 'store.save 写后读回校验失败（' + __integrityStat.lastReason + '）：磁盘副本与内存不一致，重试一次仍失败——数据可能未真正落盘');
          return false;
        }
        if (!w.ok) throw (w.error || new Error('write failed'));
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
      if (!removed) { __rescueStat.failed++; __rescueStat.lastOk = false; __rescueStat.lastFailAt = Date.now(); return false; }
      // 重试落盘
      try {
        const s = state || memCache;
        s.meta = s.meta || {};
        s.meta.updatedAt = Date.now();
        const payload = JSON.stringify(s);
        const w2 = writeVerified(storageKey(chatId), payload);
        if (!w2.ok) { __rescueStat.failed++; __rescueStat.lastOk = false; __rescueStat.lastFailAt = Date.now(); return false; }
        memCache = s;
        __saveStat.bytes = byteLen(payload);
        __rescueStat.recovered++;
        __rescueStat.lastOk = true;   // 当前态：最近一次救援成功
        return true;
      } catch (e2) {
        __rescueStat.failed++; __rescueStat.lastOk = false; __rescueStat.lastFailAt = Date.now();
        return false;
      }
    },
    /**
     * v0.4.0: 统一健康巡视——把分散的治理信号（存储计量/键卫生/诊断预算/隔离现场/救援/写入完整性/全库状态）
     * 收敛为「一个健康分 + 分级议题 + 建议动作」。这是治理层从「各自出数」走向「统一裁决」的关键一步。
     * 只读（apply:false 默认）；apply:true 时仅执行安全子集（过期诊断/孤儿恢复点/隔离溢出回收）。
     */
    maintain(opts) {
      const o = opts || {};
      const apply = o.apply === true;
      __maintainStat.scans++; __maintainStat.lastAt = Date.now();
      const issues = [];
      const actions = [];
      let score = 100;

      // ── 1. 存储计量 + 键卫生 ──
      let stat = null, plan = null;
      try { stat = this.storageStat(); } catch (e) {}
      try { plan = this.sweepStaleKeys({}); } catch (e) {}
      if (plan && plan.remove.length) {
        const freedKB = Math.round(plan.freedBytes / 1024);
        if (plan.freedBytes > 512 * 1024) { score -= 12; issues.push({ level: 'warn', key: 'hygiene.reclaimable', detail: '可回收 ' + plan.remove.length + ' 键 / ' + freedKB + 'KB' }); }
        else { score -= 3; issues.push({ level: 'info', key: 'hygiene.reclaimable', detail: '可回收 ' + plan.remove.length + ' 键 / ' + freedKB + 'KB' }); }
        actions.push({ id: 'sweep', safe: true, detail: '回收过期诊断/孤儿恢复点/隔离溢出（' + plan.remove.length + ' 键）' });
      }

      // ── 2. 诊断体积预算 ──
      let db = null;
      try { db = this.diagBudget(); } catch (e) {}
      if (db && db.exceeded) { score -= 8; issues.push({ level: 'warn', key: 'diag.budget', detail: '当前聊天诊断 ' + db.diagPct + '% > ' + db.maxPct + '%' }); actions.push({ id: 'trim-diag', safe: true, detail: '诊断环自适应收紧（由 index.js logCaps 执行）' }); }
      else if (db && db.diagPct > 10) { issues.push({ level: 'info', key: 'diag.budget', detail: '诊断占比 ' + db.diagPct + '%' }); }

      // ── 3. 隔离现场（需人工决策，不可自动）──
      let qs = null;
      try { qs = this.quarantineStat(); } catch (e) {}
      if (qs && qs.stateSites > 0) {
        score -= Math.min(10, qs.stateSites * 3);
        issues.push({ level: qs.parseable > 0 ? 'warn' : 'info', key: 'quarantine.sites', detail: qs.stateSites + ' 个 state 隔离现场（可解析 ' + qs.parseable + '）——面板「隔离现场」可恢复/丢弃' });
        if (qs.parseable > 0) actions.push({ id: 'restore-quarantine', safe: false, detail: '存在可解析现场，可能可恢复更多进度（需人工确认）' });
      }

      // ── 4. 全库状态健康 ──
      let va = null;
      try { va = this.verifyAll({ deep: o.deep === true }); } catch (e) {}
      if (va && va.problems.length) {
        score -= Math.min(20, va.problems.length * 6);
        issues.push({ level: 'error', key: 'state.corrupt', detail: va.problems.length + ' 个聊天状态有问题（' + va.problems.map(function (p) { return p.chat + ':' + p.reason; }).slice(0, 3).join(', ') + '）' });
      }

      // ── 5. 救援/完整性经历 ──
      const rs = (function () { try { return __rescueStat; } catch (e) { return null; } })();
      // v0.4.0 语义统一（与 integrity 同类裁决）：
      //   ① 最近一次救援失败 → 当前空间不足（扣分 warn）
      //   ② 历史失败但当前无碍 → info 议题（可追溯，不扣分、不污染分级）
      // 关键：rescue.lastOk 只在「救援被调用」时更新；历史失败后再未触发救援它会一直停在 false。
      // 故当前态必须叠加「最近一次 save 是否仍因配额失败」——save 成功即证明空间问题已缓解。
      const rescueNow = !!(rs && rs.lastOk === false && __saveStat.ok === false && __saveStat.reason === 'quota');
      if (rescueNow) {
        score -= Math.min(15, Math.max(5, rs.failed * 5));
        issues.push({ level: 'warn', key: 'rescue.failing', detail: '最近一次配额救援失败且落盘仍失败（空间不足）——历史失败累计 ' + rs.failed + ' 次' });
      } else if (rs && rs.failed > 0) {
        issues.push({ level: 'info', key: 'rescue.history', detail: '历史配额救援失败 ' + rs.failed + ' 次（曾空间不足），当前落盘正常' });
      }
      const is = (function () { try { return __integrityStat; } catch (e) { return null; } })();
      // v0.4.0 语义裁决：健康分 = 「当前状态」，审计计数 = 「历史经历」。
      //   ① 最近一次写入校验失败 → 当前缺陷（扣分 warn）：磁盘副本可能落后于内存
      //   ② 历史失败但当前正常 → info 议题（可追溯，不扣分、不污染告警分级）
      //   ③ 全部通过 → info 议题
      if (is && is.lastOk === false) {
        score -= 15;
        issues.push({ level: 'warn', key: 'integrity.failing', detail: '最近一次写入校验失败（' + (is.lastReason || 'unknown') + '）——磁盘副本可能落后于内存' });
      } else if (is && is.mismatches > 0) {
        issues.push({ level: 'info', key: 'integrity.history', detail: '历史写后校验不一致 ' + is.mismatches + ' 次（重试自愈 ' + is.recoveredByRetry + '），当前写入正常' });
      } else if (is && is.verified > 0) {
        issues.push({ level: 'info', key: 'integrity.ok', detail: '写入完整性校验 ' + is.verified + ' 次全部通过' });
      }

      // ── 6. 多实例并发一致性 ──
      //   ① 存在未处置的冲突现场 → 当前态缺陷（有他实例数据等待用户决策）→ 扣分 warn
      //   ② 本实例内存态已落后他实例（收到过 storage 事件）→ 提示刷新 → 扣分 warn
      //   ③ 历史曾冲突但现场已清 → info 可追溯（不扣分，与 v0.4.0 语义裁决一致）
      let conflictSites = [];
      try { conflictSites = this.listConflicts(); } catch (e) { conflictSites = []; }
      const extW = __externalWrite.count;
      if (conflictSites.length > 0) {
        score -= Math.min(12, conflictSites.length * 4);
        issues.push({ level: 'warn', key: 'concurrent.conflict', detail: '存在 ' + conflictSites.length + ' 个并发冲突现场（另一实例的进度快照未处置）——面板「冲突现场」可查看/提取/丢弃' });
        actions.push({ id: 'review-conflict', safe: false, detail: '另一实例的改动已被保全，确认无用后可丢弃（需人工判断保留哪一份）' });
      }
      if (__externalWrite.count > 0) {
        score -= 8;
        issues.push({ level: 'warn', key: 'concurrent.external', detail: '本会话期间另一实例更新过当前聊天 ' + extW + ' 次——本窗口内存态可能已落后，建议刷新页面' });
        actions.push({ id: 'reload-page', safe: false, detail: '刷新页面以载入他实例的最新状态（避免本窗口继续推进时覆盖）' });
      }
      if (conflictSites.length === 0 && __externalWrite.count === 0 && __conflictStat.detected > 0) {
        issues.push({ level: 'info', key: 'concurrent.history', detail: '历史检出并发写入 ' + __conflictStat.detected + ' 次（现场已处置），当前无冲突' });
      }

      // ── 7. 状态容量治理（v0.6.0）──
      // 轻量盘点：只枚举顶层与 4 个父对象的直接子键长度（不做全 state 序列化，init 高频路径零负担）。
      // 与 sizeAudit 的关系：sizeAudit 深扫（含 suspects 字节级明细），此处只做 maintain 高频可负担的
      // drifted/unregistered 判定；两者登记表同源（__BOUNDED_CAPS）。
      let capDrifted = 0, capUnregistered = 0;
      try {
        const st7 = memCache || {};
        const rows7 = [];
        Object.keys(st7).forEach(function (k) {
          if (Array.isArray(st7[k])) rows7.push({ path: k, len: st7[k].length });
          // v1.0.0: 对象型容器可见性——登记 kind:'object' 的顶层对象参与容量盘点
          else if (st7[k] && typeof st7[k] === 'object' && __BOUNDED_CAPS[k] && __BOUNDED_CAPS[k].kind === 'object') {
            rows7.push({ path: k, len: Object.keys(st7[k]).length });
          }
        });
        // v1.5.0: people 档案盘点——profile 五节数组 + knowledge 对象键容器（此前二/三层嵌套完全不可见）
        (function () {
          const ppl = st7.people;
          if (!ppl || typeof ppl !== 'object') return;
          Object.keys(ppl).forEach(function (pid) {
            const p = ppl[pid];
            if (!p || typeof p !== 'object') return;
            const prof = p.profile;
            if (prof && typeof prof === 'object') {
              ['personality', 'worldview', 'family', 'memory', 'relationships'].forEach(function (sec) {
                if (Array.isArray(prof[sec])) rows7.push({ path: 'people.' + pid + '.profile.' + sec, len: prof[sec].length });
              });
            }
            if (p.knowledge && typeof p.knowledge === 'object' && !Array.isArray(p.knowledge)) {
              rows7.push({ path: 'people.' + pid + '.knowledge', len: Object.keys(p.knowledge).length });
            }
          });
        })();
        ['memory', 'opinion', 'evolution', 'chapters'].forEach(function (pk) {
          const sub = st7[pk];
          if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
            Object.keys(sub).forEach(function (k) {
              const v = sub[k];
              if (Array.isArray(v)) { rows7.push({ path: pk + '.' + k, len: v.length }); return; }
              // v1.4.0: 二层扩展——父键子对象（如 evolution.entityMemory）之下的数组纳入盘点，
              // 实体型孙节点（entityMemory.<type>[i]）的 events 环也纳入（通配 cap 8）
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                Object.keys(v).forEach(function (k2) {
                  const v2 = v[k2];
                  if (Array.isArray(v2)) { rows7.push({ path: pk + '.' + k + '.' + k2, len: v2.length }); return; }
                  if (v2 && typeof v2 === 'object' && Array.isArray(v2.events)) rows7.push({ path: pk + '.' + k + '.' + k2 + '.events', len: v2.events.length });
                });
              }
            });
          }
        });
        const drift7 = [], unreg7 = [];
        rows7.forEach(function (r) {
          const reg = capsFor(r.path);
          if (reg) { if (typeof reg.cap === 'number' && reg.cap > 0 && r.len > reg.cap) drift7.push(r.path + '(' + r.len + '>' + reg.cap + ')'); }
          else if (r.len > 0) unreg7.push(r.path + '(' + r.len + '项)');
        });
        capDrifted = drift7.length; capUnregistered = unreg7.length;
        if (drift7.length) {
          // 已登记容器超出自身 cap = 裁剪站点失效（编辑器拒绝制被绕过/新路径未接入），最重扣分
          score -= Math.min(15, drift7.length * 5);
          issues.push({ level: 'error', key: 'capacity.drift', detail: drift7.length + ' 个已登记容器超出容量：' + drift7.slice(0, 4).join('、') + (drift7.length > 4 ? ' 等' : '') + '——下一次结算会自动挤出，或用编辑器手动清理' });
          actions.push({ id: 'trim-containers', safe: true, detail: '继续推进一轮（结算链尾部容量控制自动挤出超限部分）' });
        }
        // v1.6.0: 登记表↔schema 物化一致性——登记声明但状态中不存在的容器（审计空转隐患）
        try {
          const rp = registryParity();
          if (rp.missing.length) {
            score -= Math.min(6, rp.missing.length);
            issues.push({ level: 'warn', key: 'capacity.unmaterialized', detail: rp.missing.length + ' 个已登记容器未在状态骨架物化（容量治理对其空转、直写会回滚事务）：' + rp.missing.slice(0, 4).map(m => m.path).join('、') + (rp.missing.length > 4 ? ' 等' : '') + '——请在 defaultWorldState 补骨架声明' });
          }
        } catch (e) { WA.log('warn', '物化一致性自检异常（不阻断巡视）', e); }
        if (unreg7.length) {
          // 未登记非空数组：要么登记表漏登（登记义务），要么运行时新演进容器（需要确认是否有界）
          score -= Math.min(10, unreg7.length * 2);
          issues.push({ level: 'warn', key: 'capacity.unregistered', detail: unreg7.length + ' 个非空数组未登记容量：' + unreg7.slice(0, 4).join('、') + (unreg7.length > 4 ? ' 等' : '') + '——若无界增长会拖垮存档，请确认后登记 __BOUNDED_CAPS' });
        }
      } catch (e) { WA.log('warn', '容量盘点异常（不阻断巡视）', e); }

      score = Math.max(0, Math.min(100, score));
      const level = score >= 90 ? 'ok' : score >= 70 ? 'warn' : 'degraded';
      let applied = null;
      // v0.4.0: 自动回收门槛（保守优先，与 v0.1.52「删除属用户决策」契约兼容）——
      // 只自动回收「聊天已彻底消失」的键：既无 state 本体、也无 state 隔离副本。
      //   ① 该聊天的过期诊断键（宿主不存在，纯噪音）
      //   ② 该聊天的孤儿恢复点（无处可回滚）
      // 绝不自动回收：仍存在聊天的诊断键（用户可能要看日志）、隔离溢出（可能是唯一幸存现场）、
      // 当前聊天 / settings / wb / state 本体。
      const minFreed = typeof o.minFreedBytes === 'number' && o.minFreedBytes > 0 ? o.minFreedBytes : 0;
      let eligible = [];
      if (apply && plan && plan.remove.length) {
        const liveChats = {};
        listWorldAxisKeys().forEach(function (k) {
          const c = classifyKey(k);
          if (c.family === 'state' || (c.family === 'corrupt' && c.quarantine === 'state')) liveChats[c.chat] = true;
        });
        eligible = plan.remove.filter(function (r) {
          return r.reason !== 'corrupt-overflow' && r.chat && !liveChats[r.chat] && r.chat !== getChatId();
        });
        const eligibleBytes = eligible.reduce(function (acc, r) { return acc + (r.bytes || 0); }, 0);
        if (eligibleBytes < minFreed) eligible = [];
      }
      if (eligible.length) {
        let removed = 0, freed = 0;
        eligible.forEach(function (r) {
          try { mainWin.localStorage.removeItem(r.key); removed++; freed += (r.bytes || 0); }
          catch (e) {}
        });
        applied = { removed: removed, freedBytes: freed };
        __maintainStat.autoApplies++; __maintainStat.lastAutoFreedKeys = removed; __maintainStat.lastAutoFreedBytes = freed;
      }
      __maintainStat.lastScore = score; __maintainStat.lastLevel = level;
      return {
        score: score, level: level, issues: issues, actions: actions, applied: applied,
        // v0.4.0: 可回收键名清单（供 init 指纹节流；与 v0.1.54「键名排序串」契约同粒度——
        // 只报议题名会让新垃圾集签名不变，导致指纹告警失效）
        planKeys: (plan && plan.remove ? plan.remove.map(function (r) { return r.key; }).sort() : []),
        signals: {
          totalKeys: stat ? stat.totalKeys : 0, totalBytes: stat ? stat.totalBytes : 0,
          reclaimable: plan ? plan.remove.length : 0, reclaimableBytes: plan ? plan.freedBytes : 0,
          diagPct: db ? db.diagPct : 0,
          quarantineSites: qs ? qs.stateSites : 0, quarantineParseable: qs ? qs.parseable : 0,
          chatsChecked: va ? va.total : 0, chatsProblem: va ? va.problems.length : 0,
          rescueFailed: rs ? rs.failed : 0, rescueFailing: rescueNow,
          conflictSites: conflictSites.length, conflictDetected: __conflictStat.detected,
          externalWrites: extW, conflictQuarantined: __conflictStat.quarantined,
          capacityDrifted: capDrifted, capacityUnregistered: capUnregistered,
          rescueRecovered: rs ? rs.recovered : 0,
          integrityMismatches: is ? is.mismatches : 0, integrityOk: is ? is.lastOk !== false : true
        }
      };
    },
    /** v0.5.0: 并发冲突观测（detected=检出次数，quarantined=成功保全次数） */
    conflictStat() {
      const c = __conflictStat;
      return { detected: c.detected, quarantined: c.quarantined, lastAt: c.lastAt, lastChat: c.lastChat, lastLostBytes: c.lastLostBytes, lastKeptKey: c.lastKeptKey, writer: (function () { try { return writerId(); } catch (e) { return null; } })(), writeSeq: __writeSeq, seenRev: __seenRev };
    },
    /** v0.5.0: 跨实例外部写入观测（count>0 = 本会话期间他实例改过当前聊天） */
    externalWriteStat() {
      const x = __externalWrite;
      return { count: x.count, lastAt: x.lastAt, lastKey: x.lastKey, lastRev: x.lastRev, lastWriter: x.lastWriter, staleSince: x.staleSince, hookInstalled: __storageHookInstalled };
    },
    /** v0.5.0: 本实例内存态是否可能已落后他实例（供 UI 提示刷新） */
    staleSinceExternal() { return __externalWrite.count > 0; },
    /** v0.5.0: 最近一次 save 的冲突详情（null = 无冲突） */
    lastConflict() { return __lastConflict ? JSON.parse(JSON.stringify(__lastConflict)) : null; },
    /** v0.5.0: 冲突现场清单（只读）——含键/时间/体积/可解析性/摘要 */
    listConflicts(chatId) {
      const cid = chatId || getChatId();
      const out = [];
      try {
        const ls = mainWin.localStorage;
        const prefix = 'worldaxis_conflict_' + cid + '_';
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (!k || k.indexOf(prefix) !== 0) continue;
          const raw = ls.getItem(k) || '';
          let at = 0;
          const parts = k.split('_');
          at = parseInt(parts[parts.length - 2], 10) || 0;
          let parseable = false, head = '';
          try {
            const st = JSON.parse(raw);
            parseable = !!(st && typeof st === 'object');
            head = String((st && st.clock && st.clock.label) || '').slice(0, 60);
          } catch (e) { parseable = false; head = raw.slice(0, 60); }
          out.push({ key: k, chat: cid, at: at, bytes: byteLen(raw), parseable: parseable, head: head });
        }
      } catch (e) {}
      return out;
    },
    /** v0.5.0: 冲突现场丢弃（需显式指定键，防误用为通用删除器） */
    dropConflict(key) {
      try {
        if (typeof key !== 'string' || key.indexOf('worldaxis_conflict_') !== 0) return { ok: false, reason: '非冲突现场键，拒绝删除' };
        if (mainWin.localStorage.getItem(key) === null) return { ok: false, reason: '键不存在' };
        mainWin.localStorage.removeItem(key);
        return { ok: true };
      } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
    },
    /** v0.5.0: 提取冲突现场全文（离机备份用） */
    exportConflict(key) {
      try {
        if (typeof key !== 'string' || key.indexOf('worldaxis_conflict_') !== 0) return { ok: false, reason: '非冲突现场键' };
        const raw = mainWin.localStorage.getItem(key);
        if (raw === null) return { ok: false, reason: '键不存在' };
        let st = null, parseable = false;
        try { st = JSON.parse(raw); parseable = true; } catch (e) {}
        return { ok: true, worldaxis: true, kind: 'conflict-site', key: key, exportedAt: new Date().toISOString(), bytes: byteLen(raw), parseable: parseable, raw: raw, state: st };
      } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
    },
    /** v0.4.0: 巡视计量视图（面板/报告消费） */
    maintainStat() { const m = __maintainStat; return { scans: m.scans, lastAt: m.lastAt, lastScore: m.lastScore, lastLevel: m.lastLevel, autoApplies: m.autoApplies, lastAutoFreedKeys: m.lastAutoFreedKeys, lastAutoFreedBytes: m.lastAutoFreedBytes }; },
    /**
     * v0.4.0: 完整性审计视图（只读）——writes 为写后校验次数，mismatches>0 说明本会话出现过静默写入失败
     */
    integrityStat() {
      const i = __integrityStat;
      return { writes: i.writes, verified: i.verified, mismatches: i.mismatches, retried: i.retried, recoveredByRetry: i.recoveredByRetry, lastAt: i.lastAt, lastReason: i.lastReason, lastOk: i.lastOk, lastFailAt: i.lastFailAt };
    },
    /**
     * v0.4.0: 单聊天状态体检（只读）——解析可用性 + 结构完整度 + 体积。
     * deep:true 时额外按默认结构比对缺失字段（不修改任何数据）。
     */
    verifyState(chatId, opts) {
      const o = opts || {};
      const cid = chatId || getChatId();
      const key = 'worldaxis_state_' + cid;
      let raw = null;
      try { raw = mainWin.localStorage.getItem(key); } catch (e) { return { chat: cid, exists: false, ok: false, reason: 'read-failed' }; }
      if (raw === null) return { chat: cid, exists: false, ok: false, reason: 'missing' };
      let parsed = null;
      try { parsed = JSON.parse(raw); }
      catch (e) { return { chat: cid, exists: true, ok: false, parseable: false, bytes: byteLen(raw), reason: 'unparseable' }; }
      const out = { chat: cid, exists: true, ok: true, parseable: true, bytes: byteLen(raw), schemaVersion: parsed && parsed.schemaVersion };
      if (o.deep) {
        const fresh = defaultWorldState();
        const probe = JSON.parse(JSON.stringify(parsed));
        const r = ensureShape(probe, fresh);
        out.missingFields = r.filled;
        out.typeConflicts = r.conflicts;
        out.shapeOk = r.filled === 0;
      }
      return out;
    },
    /**
     * v0.4.0: 全库状态巡检（只读）——枚举所有聊天的 state 键，逐一验证解析与结构。
     * 这是「治理层能自证健康」的关键：单个聊天载入成功不代表整个键空间无腐坏。
     */
    verifyAll(opts) {
      const o = opts || {};
      const keys = listWorldAxisKeys();
      const chats = [];
      const problems = [];
      keys.forEach(function (k) {
        const c = classifyKey(k);
        if (c.family !== 'state') return;
        const r = this.verifyState(c.chat, { deep: o.deep === true });
        chats.push(r);
        if (!r.ok) problems.push({ chat: c.chat, reason: r.reason, bytes: r.bytes || 0 });
        else if (o.deep === true && r.shapeOk === false) problems.push({ chat: c.chat, reason: 'missing-fields', missingFields: r.missingFields, typeConflicts: r.typeConflicts });
      }, this);
      let bytes = 0;
      chats.forEach(function (r) { bytes += r.bytes || 0; });
      return {
        total: chats.length, healthy: chats.filter(function (r) { return r.ok; }).length,
        problems: problems, bytes: bytes, deep: o.deep === true,
        currentChat: getChatId(),
        currentOk: (function (self) { const r = self.verifyState(); return r; })(this)
      };
    },
    /** v0.3.0: 配额救援观测（tool-diag/面板消费）——attempts>0 表示本会话曾撞配额墙 */
    rescueStat() { const r = __rescueStat; return { attempts: r.attempts, recovered: r.recovered, failed: r.failed, lastRemoved: r.lastRemoved, lastFreedBytes: r.lastFreedBytes, lastAt: r.lastAt, lastOk: r.lastOk, lastFailAt: r.lastFailAt }; },
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
          const meta = capsFor(pathStr);
          arrays.push({ path: pathStr, len: node.length, bytes: b, bounded: !!meta, cap: meta ? meta.cap : null, site: meta ? meta.site : null });
          if (depth < maxDepth) { for (let ix = Math.min(2, node.length - 1); ix >= 0; ix--) pending.push(pathStr + '[' + ix + ']'); }
          return;
        }
        if (node && typeof node === 'object') {
          // v1.0.0: 对象型容器可见性——登记为 kind:'object' 的对象参与容量盘点
          // （修复审计盲区：此前 schedule 只收集数组，people 等对象型容器膨胀对 sizeAudit 完全不可见）
          const metaO = capsFor(pathStr);
          if (metaO && metaO.kind === 'object' && pathStr.indexOf('[') < 0) {
            let b = 0;
            try { b = byteLen(JSON.stringify(node)); } catch (e) { b = -1; }
            arrays.push({ path: pathStr, len: Object.keys(node).length, bytes: b, bounded: true, cap: metaO.cap, site: metaO.site, kind: 'object' });
          }
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
        // v0.5.0: 记录来源实例与当时序号——多窗口并存时可辨认「这份点谁建的」
        list.unshift({
          at: Date.now(),
          by: (function () { try { return writerId(); } catch (e) { return null; } })(),
          rev: (function () { const g = memCache; return (g && g.meta && typeof g.meta.stateRev === 'number') ? g.meta.stateRev : 0; })(),
          state: JSON.parse(JSON.stringify(memCache || defaultWorldState()))
        });
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
      const families = { state: 0, stateDerived: 0, recovery: 0, diagnostic: 0, corrupt: 0, conflict: 0, writerId: 0, settings: 0, wb: 0, other: 0 };
      const perFamilyBytes = { state: 0, stateDerived: 0, recovery: 0, diagnostic: 0, corrupt: 0, conflict: 0, writerId: 0, settings: 0, wb: 0, other: 0 };
      let totalBytes = 0, stateKeys = 0, stateDerivedKeys = 0, diagKeys = 0, corruptKeys = 0, curBytes = 0, curQuarantines = 0;
      let conflictKeys = 0, conflictBytes = 0;
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
        if (cls.family === 'conflict') { conflictKeys++; conflictBytes += b; }
        if (cls.family === 'corrupt') {
          corruptKeys++;
          // v0.2.3: 当前聊天的隔离副本受保护（sweep 不清理）——单独计量以便面板透出与手动处置
          if (cls.chat === cur) curQuarantines++;
        }
        // v0.5.0: 活跃体积只计「活跃家族」——冲突现场是他实例副本（待处置），
        // 计入会让用户误判当前存档膨胀（实测虚高一倍）
        if (cls.chat === cur && cls.family !== 'conflict') curBytes += b;
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
        conflictKeys: conflictKeys,
        conflictBytes: conflictBytes,
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
        // v0.5.0: 冲突现场与写入者标识永不自动清理（前者是他实例唯一幸存的进度快照，
        // 后者是并发防护的身份基础；删除一律属用户经面板的显式决策）
        if (c.family === 'conflict' || c.family === 'writerId') { plan.keep.push(k); return; }
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
      // v0.5.0: 多实例可见性——累计出现过的来源实例数（>1 表示曾跨窗口留点）
      let writers = {};
      try { list.forEach(function (p) { if (p && p.by) writers[p.by] = 1; }); } catch (e) {}
      const wCount = Object.keys(writers).length;
      return { count: list.length, max: MAX_RECOVERY_POINTS, full: list.length >= MAX_RECOVERY_POINTS, bytes: bytes, lastAt: list.length ? list[0].at : 0, lastBy: list.length ? (list[0].by || null) : null, writers: wCount, multiInstance: wCount > 1 };
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
