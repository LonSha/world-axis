/**
 * WorldAxis core/store.js
 * 按聊天隔离的 schema 化世界状态存储 + 恢复点 + 分支覆盖
 * 缝合来源：世界背面 store/schema/恢复点/branchOverrides 思路 + World引擎 chatcache
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const SCHEMA_VERSION = 1;
  // v0.1.36: draft 克隆 feature-detect——structuredClone 优先（原生实现快 1.5-2x 且保留类型），
  // 不可用时降级 JSON 往返（与旧版行为完全一致）
  const cloneDraft = (typeof structuredClone === 'function')
    ? (st) => structuredClone(st)
    : (st) => JSON.parse(JSON.stringify(st));
  const MAX_RECOVERY_POINTS = 3;

  // ── 模块注册表（v2.0.0）──────────────────────────────────
  //   契约下沉到数据层：此前定义在入口文件 index.js，凡不经 index.js 的加载路径
  //   （vm 测试链、TH 脚本按需加载）注册表都不存在，tool-diag 的 registeredModules 恒空。
  //   store 是加载序列第 2 位、且所有路径必经，故放这里；index.js 保留同名转发。
  WA.modules = WA.modules || {};
  if (typeof WA.registerModule !== 'function') {
    WA.registerModule = function (name, meta) {
      if (!name) return null;
      const rec = { name: name, at: clockNow('store.module'), ver: (meta && meta.ver) || WA.version || 'unknown', kind: (meta && meta.kind) || 'engine' };
      WA.modules[name] = rec;
      return rec;
    };
  }
  if (typeof WA.moduleRegistry !== 'function') {
    WA.moduleRegistry = function () { return Object.keys(WA.modules || {}).sort(); };
  }
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
      // v2.51.0 新增（位于 people.<id>.profile 内部）：persona 人格机制（slot/locked/d1-d5/at/note）、
      //   relations 单向关系量值数组（target/intimacy/trust/hostility/vigilance/attachment/boundary_status/at）。
      //   与 profile 既有五节分开：五节是叙述性人设文本条，relations/persona 是带钳制的量值与机制面。
      people: {},               // id -> {id,name,avatar,location,action,intent,body,resources,knowledge:{},personalityAnchor,speakingStyle,behaviorBoundaries,innerVoice,lastSeenAt,updatedAt,profile:{...}}
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
        // v2.13.0 物化：阶段纪要 / 大总述环形（登记 cap 24/8 此前未在骨架声明）。
        //   与 v1.6.0 补登 entityMemory 同类：登记了却不在骨架里，registryParity 会报
        //   「未在骨架物化」，冷启动直写也会炸事务——登记不等于物化，两件事都要做。
        smallSummaries: [], bigSummaries: [],
        l0: [], l1: [], l2: [], l3: []   // 分层经历摘要
      },
      // 事件演化（World引擎：冲突/进度阶段机 + 势力/声誉/经济/仇敌/黑盒/天下大势）
      evolution: {
        events: [], factions: [], winds: [], trends: [], enemies: [],
        blackbox: { secretActions: [], secretAssets: [] }, worldTrends: [], regionalIncident: null,
        // v1.6.0 物化：实体记忆库（登记四键 cap 30 此前未在骨架声明——冷启动审计不可见、直写即炸事务）
        entityMemory: { organization: [], object: [], ability: [], location: [] },
        // v2.35.0 物化：重大事件账本（ledger.js KEEP_ROUNDS=20；此前只在 evict.SITES 登记，骨架缺字段）
        ledger: [],
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
      // v2.34.0 平行世界（parallel-world.js：主线之外的独立推演 —— NPC档案/关系网/事件模块）
      parallelWorld: { clock: '', npcs: [], relations: [], modules: [], round: 0, snapshots: [] },
      // 一致性记录（冲突诊断，不静默覆盖）
      consistency: [],          // {kind, detail, at}
      // 世界脉搏（backstage结算）
      worldPulse: null,         // {pressure:0-3, trend:rising|falling|steady, note, at}
      // v2.40.0 物化：上轮注入打点快照（render/inject.js:293 写入方，诊断/撤销读）
      //   why：它与 worldPulse/nextTurnInjection 同族（默认 null、运行时变对象），
      //   store.js 下方 ensureShape 的注释也把它俩并列写成「默认为 null 的字段
      //   （lastInjection/worldPulse 等）」——但 worldPulse 在骨架里声明了、它没有。
      //   后果不是崩溃（读侧有 `|| null` 守卫），而是**骨架清单失真**：任何按骨架
      //   白名单裁剪/体检的路径都不认识它，ensureShape 也补齐不到（v2.39.0 同型的
      //   另一半：那轮修的是「读了骨架里没有的字段」，这里是「写了骨架里没有的字段」）。
      lastInjection: null,      // {at, injected, len, sources, budget, slots, slotErrors, clearedAt, clearedBy}
      // v2.40.0 物化：主动拉动的冷却轮次（engines/proactive.js:86 写入方）
      //   真源是 evolution.round（v2.39.0 收口），此字段只是「上次拉动时的轮次」留痕。
      proactiveLastRound: 0,    // 与 parallelWorld.round 同类：0 表示「从未拉动」
      // 下轮注入三列引用（after链产出，before链一次性消费）
      nextTurnInjection: null,  // {required:[], conditional:[], suppress:[], at, anchor}
      // v2.62.0 因果结算（causal.js：原因→条件→行动→直接后果→延迟后果）
      //   chains ：在推进的因果链（含终态 settled/cancelled/expired —— **不删记录**，
      //            删了就答不出「为什么后来没发生」）
      //   settled：已结算后果的流水（与 echoes 分开：echoes 是正文触面，这里是结算台账）
      causal: { chains: [], settled: [] },
      // v2.63.0 世界织体（world.js：社会生活 / 共同日程 / 地点与路途）
      //   places：已登记的地点（没登记的地方**不存在**，不是「大概很近」）
      //   roads ：已登记的道路（无向，带耗时分钟；没登记的路**走不通**）
      //   events：共同日程（集市/节庆/庭审/仪式/聚会），带 status planned→ongoing→done
      //   为什么三张表都要有界：它们都是「会被 AI 源源不断写进来」的容器，
      //   无界 = 存档体积被单机长跑拖垮；而**在场者名单不落盘**（由日程+地点现算，
      //   落盘就成了一份会过期的第二真源——「谁在场」必须永远能从证据重新推出来）。
      world: { places: [], roads: [], events: [], journeys: [] },
      // v2.65.0 天气与在途情报。登记了容量却不在骨架里，冷启动直写会炸事务。
      weather: { rows: [] },
      intelQueue: [],
      // v2.66.0 情绪通道 / 关系六型 / 假面。登记了容量却不在骨架里，冷启动直写会炸事务。
      affect: { channels: [], loads: {} },
      bonds: { rows: [] },
      masks: { rows: [] },
      // v2.67.0 时间锁 / 双层性格 / 好感审计 / 场外事件。登记了容量却不在骨架里，冷启动直写会炸事务。
      //   temporal.lock 用空对象表示未锁定（registryParity 对 kind:'object' 不认 null）。
      temporal: { lock: {} },
      temperament: { rows: [] },
      fondness: { rows: [] },
      parallelEvents: { rows: [] },
      // v2.68.0 资料片周期 / 生存三轴 / 通缉 / 驯兽。登记了容量却不在骨架里，冷启动直写会炸事务。
      eraCycle: { rows: [] },
      survival: { rows: [] },
      warrant: { rows: [] },
      beastBond: { rows: [] },
      // v2.69.0 外貌分级契约 / 原型阶梯。登记了容量却不在骨架里，冷启动直写会炸事务。
      appearance: { rows: [] },
      ladder: { rows: [] },
      sceneSlice: { rows: [] },
      gauge: { rows: [] },
      rivalry: { rows: [] },
      // v2.71.0 叙事纪律四件套。登记了容量却不在骨架里，冷启动直写会炸事务。
      enigma: { rows: [] },
      tempo: { gear: 'andante', shifts: [] },
      quota: { rows: [] },
      spotlight: { rows: [], pending: [] },
      // v2.72.0 叙事动力四件套。登记了容量却不在骨架里，冷启动直写会炸事务。
      karma: { rows: [] },
      hazard: { rows: [] },
      marginal: { rows: [] },
      tolerance: { round: 0, rows: [] },
      // v2.63.0 社交漩涡（shadow.js：关系经历与承诺深化）
      //   rows       ：共同隐瞒（双方各持一行），带 severity 与 status active/faded
      //   experiences：关系经历流水（open/kept/broken 分开归因）
      //   为什么与 registry 的 relations 分开：量值可逆、经历不可逆。并表会让
      //   「你替他顶过一次罪」被几次数值变动抹平——那是这个世界最不该丢的东西。
      shadow: { rows: [], experiences: [] },
      // v2.63.0 悬案（threads.js：调查与情报玩法面）。数组根，每案自带 leads 环。
      //   为什么与 intel 分开：intel 是「某人以为」（可以错），本模块是「查到了哪」（必须有据）。
      threads: [],
      // 元信息
      meta: { createdAt: clockNow('store.meta'), updatedAt: clockNow('store.meta'), lastSettle: null }
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
  // ── v2.30.0（分支世界不归零）: 聊天镜像回落 ──────────────────────
  // 病：ST 建分支（`mes_create_branch`）会**整份复制 chat_metadata**，而按聊天隔离的
  //   `worldaxis_state_<chatId>` 是新键、必然为空 ⇒ 分支里活世界**立刻归零**（人物/事件/记忆/
  //   纪事全没），而 chat_metadata 镜像里明明躺着一份完整存档，**没有任何代码去读它**——
  //   写入侧 engines/chatcache.js 一直在推镜像（live.data.state），读侧此前只认 localStorage。
  // 口径（保守五条）：
  //   ① **只在 miss 时回落**：本地键存在（哪怕解析失败）一律不走镜像——绝不覆盖本地真源；
  //   ② **命中即落盘**：把镜像那份用 writeVerified 写回本聊天键，后续所有路径统一走 localStorage
  //      （不新造第二条读路径）；写回失败如实记账，不假装继承成功；
  //   ③ **读不出来 ≠ 没有**：镜像在但读失败/解析失败 ⇒ mirrorErrors++，与「镜像也没有」
  //      （mirrorMisses++）分开报（本仓既有裁决：读失败掩盖缺失是重罪）；
  //   ④ **损坏现场要隔离**：镜像存在但解析不了时，原文另存隔离键再记账——否则用户的下一次
  //      保存会把这份唯一的可恢复现场冲掉（与 load() 本地解析失败同规格）；
  //   ⑤ **继承关系显式记账**：live.chatId !== 当前 chatId ⇒ 这份世界是**继承来的**（分支现场），
  //      台账 lastMirror.inherited=true + fromChatId 落证，用户能看见「世界是从哪个聊天接过来的」。
  //   ⑥ **自动回落仅分支**：branchParentId() 为空（同聊天空键）一律不写回 ——
  //      跨设备同聊天安装走 chatcache.installPack；用户主动补救走 rescueFromMirror。
  //      若此处无条件写回，LS.clear()+init() 会被持久 chatMetadata 镜像凭空重建 state 键。
  const MIRROR_NS = 'worldaxis';
  /**
   * 读聊天镜像。**三种结果必须可分**（本仓裁决：读失败掩盖缺失是重罪）：
   *   { raw }        镜像里有存档原文
   *   { absent:true } 镜像里确实没有（或没挂载镜像）
   *   { err }        镜像在/可能在上，但读不出来 —— **不等于没有**
   */
  function readChatMirror() {
    let md = null;
    try {
      const ctx = getCtx();
      md = ctx && ctx.chatMetadata;
    } catch (e) { return { err: e }; }
    if (!md || typeof md !== 'object') return { absent: true };
    let ns = null;
    try { ns = md[MIRROR_NS]; } catch (e) { return { err: e }; }
    if (!ns || typeof ns !== 'object') return { absent: true };
    const live = ns.live;
    if (!live || typeof live !== 'object') return { absent: true };
    const d = live.data;
    if (!d || typeof d !== 'object' || d.state == null) return { absent: true, live: live };
    const raw = d.state;
    if (typeof raw !== 'string' || !raw) return { absent: true, live: live };
    return { raw: raw, live: live };
  }
  /** 当前聊天是否是**分支**（ST 把母聊天 id 记在 chat_metadata.main_chat） */
  function branchParentId() {
    try {
      const ctx = getCtx();
      const md = ctx && ctx.chatMetadata;
      const p = md && md.main_chat;
      return (typeof p === 'string' && p) ? p : null;
    } catch (e) { return null; }
  }
  /** 镜像解析失败时的现场隔离（与本地 load 解析失败同规格，防下次保存冲掉唯一证据） */
  function quarantineMirror(cid, raw) {
    try {
      const key = storageKey(cid) + '_corrupt_' + clockNow('store.mirrorCorrupt');
      mainWin.localStorage.setItem(key, raw);
      return key;
    } catch (e) { return null; }
  }
  /** miss 回落：把镜像那份救回本地。仅分支才落盘（writeVerified），并记完整归因。 */
  function loadFromMirror(chatId) {
    const cid = chatId || getChatId();
    // 自动回落只对分支世界动手（ST 把母聊天记在 chat_metadata.main_chat）。
    // 同聊天空键由 chatcache.installPack / 用户显式 rescueFromMirror 负责，本函数不写盘。
    if (!branchParentId()) return null;
    const m = readChatMirror();
    if (m.err) {
      __loadStat.mirrorErrors++;
      __loadStat.lastError = 'mirror:' + String((m.err && m.err.message) || m.err);
      WA.log('error', 'store.load：本地键为空且聊天镜像**读取失败**——无法判定这个世界是「空白新分支」还是「有一份存档没读出来」（本地键：' + storageKey(cid) + '）', m.err);
      return null;
    }
    if (m.absent) { __loadStat.mirrorMisses++; return null; }
    let st = null;
    try { st = JSON.parse(m.raw); }
    catch (pe) {
      __loadStat.mirrorErrors++;
      const qk = quarantineMirror(cid, m.raw);
      __loadStat.lastError = 'mirror-parse:' + String((pe && pe.message) || pe);
      WA.log('error', 'store.load：聊天镜像存在但**解析失败**（本次未采用；原文已隔离到 ' + (qk || '（隔离失败）')
        + '，本地键仍为空）', pe);
      return null;
    }
    const live = m.live || {};
    const from = live.chatId || null;
    const inherited = !!(from && from !== cid);
    // 命中即落盘：后续读取路径统一走 localStorage（不新造第二条真源）
    const w = writeVerified(storageKey(cid), m.raw);
    __loadStat.mirrorHits++;
    __lastMirror = {
      at: clockWall(), chatId: cid, fromChatId: from, inherited: inherited,
      branchParent: branchParentId(), rev: (typeof live.rev === 'number') ? live.rev : null,
      bytes: byteLen(m.raw), writtenBack: !!(w && w.ok), writeReason: (w && w.ok) ? null : ((w && w.reason) || 'unknown'),
      manual: false
    };
    __loadStat.lastMirror = __lastMirror;
    if (w && w.ok) {
      WA.log('warn', 'store.load：本地键为空，已从聊天镜像救回世界状态（' + Math.round(__lastMirror.bytes / 1024) + 'KB'
        + (inherited ? '，继承自聊天 ' + from : '') + '）——若这是新分支，世界不该归零，本份即其起点');
    } else {
      WA.log('error', 'store.load：聊天镜像已读到（' + Math.round(__lastMirror.bytes / 1024) + 'KB）但**写回本地失败**（'
        + __lastMirror.writeReason + '）——本次仍以镜像内容工作，刷新后会再次回落到镜像');
    }
    return st;
  }
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
      __txStat.count++; __txStat.totalMs += ms; __txStat.lastMs = ms; __txStat.lastAt = clockWall(); __txStat.lastStatus = status;
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
  // v2.10.0: 读侧计量（与 __integrityStat 的**写侧**、v2.9.0 的 __removeStat **删侧**构成三面）。
  //   现场：`keyBytes` 的 `catch (e) { return 0 }` 把「读失败」吞成「0 字节」——于是容量体检里
  //   「这个键是空的」与「这个键读不出来」长得一模一样；实测该路径的读失败会让 `totalBytes`
  //   少算、让 `sweepStaleKeys` 判不出体积、让面板报出一份**偏小**的占用表，而用户照着它清理
  //   永远清不出空间（与 v2.9.0 修掉的「删除计数虚高」是同一类「结论不实」）。
  const __readStat = { readFailed: 0, lastReadFail: null, bySource: { bytes: 0, activity: 0, enumerate: 0 } };
  /**
   * v2.10.0: 存储层读失败记账的**单一实现**——与 settings-bus 的 noteReadFail、
   *   noteFail（写侧）/ noteRemoveFail（删侧）同规格：一处实现、一处自增、一处归因。
   *   为什么必须单一实现：本仓库的写侧与删侧都因为「各点各写一份」漏过路径（写侧漏四条、
   *   删侧被包在空 catch 里），读侧若不收口必然重演——而读侧的漏点恰恰是最难发现的，
   *   因为读失败**不会产生任何可见症状**，它只让结论悄悄失真。
   *   语义：永不抛（记账本身不得打断读取）。
   * @param {string} source 来源（bytes / activity / enumerate）
   * @param {string} key 涉及的键（枚举失败用 '(enumerate)'）
   * @param {*} err 原始错误
   */
  function noteStoreReadFail(source, key, err) {
    try {
      const src = source || 'bytes';
      __readStat.readFailed++;
      __readStat.bySource[src] = (__readStat.bySource[src] || 0) + 1;
      __readStat.lastReadFail = { key: key, source: src, at: clockWall(), error: String((err && err.message) || err).slice(0, 120) };
    } catch (e) { /* 记账失败不影响读取 */ }
  }
  // ── v2.9.0: 删除侧完整性计量 ─────────────────────────────────
  // 背景（本版命题）：写入侧自 v0.4.0 就有 writeVerified（写后读回逐字符比对 + 一次重试），
  //   而**删除侧完全没有对应物**——全库 13 处 localStorage.removeItem 直调，清完之后谁也不复核
  //   「键是不是真的没了」。而删除与写入在失败模式上并不对称：写入失败通常至少能抛配额错，
  //   删除失败则可能**静默无效**（键仍在、无异常），此时清理策略会报「已释放 N 字节」而磁盘
  //   一个字节都没释放，用户按提示继续清理却永远清不出空间。
  //   判据与 writeVerified 同规格：删完立刻读回，仍能读到即视为**这次删除没有发生**。
  const __removeStat = { attempts: 0, removed: 0, failed: 0, verified: 0, staged: 0, lastKey: null, lastAt: 0, lastReason: null };
  /**
   * v2.9.0: 受控删除（唯一实现）——删除后读回复核，失败分类留痕。
   *
   * 语义：与 writeVerified 对齐但不重试。理由：写入毒化常可被「立刻重写一遍」自愈，
   *   而删除失败（键仍在）重试同一动作通常无效——问题在存储层而非时序。故只如实报告。
   * @param {string} key
   * @returns {{ok:boolean, removed:boolean, reason:string|null}}
   *   removed=true 表示「本次调用确实把键删掉了」；键本来就不存在时 ok=true 但 removed=false。
   */
  function removeVerified(key) {
    __removeStat.attempts++;
    __removeStat.lastKey = key;
    __removeStat.lastAt = clockWall();
    // v2.9.0（当前态口径）: 与 settings-bus 的 rmRemove 同规格——每次调用先清「最近一次结果」，
    //   使维持健康分的判据是当前态而非历史累计（见 v0.4.0 的 lastOk/lastFailAt 裁决）。
    __removeStat.lastReason = null;
    let existed = false;
    // v2.11.0: 本行已是「读失败 ⇒ 结论为失败」的诚实实现，但**没有进读侧台账**——
    //   消费端 readStat() 看不到它，诊断只能从 removeStat 的 lastReason 间接猜。
    //   同一件事（一次失败的读取）必须只有一个记账入口。
    try { const cur = mainWin.localStorage.getItem(key); existed = (cur !== null && cur !== undefined); }
    catch (e) {
      noteStoreReadFail('verify', key, e);
      __removeStat.failed++; __removeStat.lastReason = 'read-failed';
      return { ok: false, removed: false, reason: 'read-failed' };
    }
    if (!existed) { __removeStat.verified++; return { ok: true, removed: false, reason: 'absent' }; }
    try { mainWin.localStorage.removeItem(key); }
    catch (e) { __removeStat.failed++; __removeStat.lastReason = 'remove-threw'; return { ok: false, removed: false, reason: 'remove-threw' }; }
    let back = null, backReadErr = null;
    try { back = mainWin.localStorage.getItem(key); } catch (e) { back = null; backReadErr = e; }
    if (backReadErr) {
      // v2.10.0: 删后复核失败（复核本身就是一次读取）**不能**与「键仍在」共用同一个结论——
      //   前者要查存储可读性，后者要查删除权限/策略。此前后者还会被当成 staged-still-present
      //   推进「静默无效删除」的计数与健康分扣分（归因不实）。
      noteStoreReadFail('verify', key, backReadErr);
      __removeStat.failed++; __removeStat.lastReason = 'readback-failed';
      return { ok: false, removed: false, reason: 'readback-failed' };
    }
    if (back !== null && back !== undefined) {
      // 静默无效：removeItem 没抛错，但键还在。这是删除侧最危险的形态——调用方会以为清掉了。
      __removeStat.staged++; __removeStat.failed++; __removeStat.lastReason = 'staged-still-present';
      return { ok: false, removed: false, reason: 'staged-still-present' };
    }
    __removeStat.removed++; __removeStat.verified++; __removeStat.lastReason = null;
    return { ok: true, removed: true, reason: null };
  }
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
          __externalWrite.lastAt = clockWall();
          __externalWrite.lastKey = e.key;
          __externalWrite.lastRev = rev;
          __externalWrite.lastWriter = writer;
          __externalWrite.staleSince = __externalWrite.staleSince || clockWall();
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
      // v2.10.0: 读失败同样归因——此前空 catch 吞掉，「标识被外部清除」与「读不出来」不可分辨。
      try { if (mainWin.localStorage.getItem('worldaxis_writer_id') !== __writerId) mainWin.localStorage.setItem('worldaxis_writer_id', __writerId); }
      catch (e) { noteStoreReadFail('writerId', 'worldaxis_writer_id', e); }
      return __writerId;
    }
    try {
      let w = mainWin.localStorage.getItem('worldaxis_writer_id');
      if (!w) {
        w = WA.rand.id('w', 6, 'writer');
        mainWin.localStorage.setItem('worldaxis_writer_id', w);
      }
      __writerId = w;
    } catch (e) { noteStoreReadFail('writerId', 'worldaxis_writer_id', e); __writerId = WA.rand.id('w-mem-', 6, 'writer'); }
    return __writerId;
  }
  /**
   * 读取磁盘上某聊天的 stateRev。
   * v2.10.0（逆向审计自纠）: 返回值改为结构化 `{ ok, rev }`。此前读失败与「键不存在」
   *   都返回 0，于是并发检测里 `dRev > __seenRev` 恒不成立——**多实例覆盖会静默发生**
   *   （用户数轮进度被另一个窗口覆盖而无任何告警），这比本版命题本身更严重，故当版修掉：
   *   读失败必须与「磁盘上确实没有」可分辨，且失败进读侧台账（诊断/健康分可见）。
   * @returns {{ok:boolean, rev:number, error?:*}}
   */
  function diskRev(chatId) {
    try {
      const raw = mainWin.localStorage.getItem(storageKey(chatId));
      if (!raw) return { ok: true, rev: 0 };
      const st = JSON.parse(raw);
      return { ok: true, rev: (st && st.meta && typeof st.meta.stateRev === 'number') ? st.meta.stateRev : 0 };
    } catch (e) {
      // 解析失败与读取抛错都算「磁盘序号不可知」——两者都不该被当成 rev=0 参与冲突判定。
      noteStoreReadFail('diskRev', String(chatId || ''), e);
      return { ok: false, rev: 0, error: e };
    }
  }
  /** 保全他实例 payload 为冲突现场（不覆盖已有同名键） */
  function quarantineConflict(chatId, disc, mine) {
    const ts = clockNow('store.conflict');
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
        // v2.9.0: 走受控删除并复核——此前裸调 + `catch(e){}`，删不掉时轮转静默失效
        //   （冲突现场会无限累积直到配额耗尽，而日志里什么都没有）。
        const r0 = removeVerified(all.shift());
        if (!r0.ok && WA.log) WA.log('warn', '并发冲突现场轮转：删除失败（' + r0.reason + '）——现场可能持续累积', null);
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
  // v2.1.0: 巡视消费游标——工作流失败台账的**单调序号**（本轮末尾才推进）。
  //   ① 不能复用 __maintainStat.lastAt：它在巡视开头就被刷新，用它当 since 会把
  //      游标推成本轮开始时刻，使「上轮结束 → 本轮开始」窗口内的失败被永久漏检；
  //   ② 也不能用时间戳游标：毫秒同刻的失败会被下一轮重复计入，且系统时钟回拨
  //      （NTP 校时）会让游标回退、已发生的失败静默漏报。
  //   -1 = 尚未建立基线：首轮巡视只建立游标、不追溯存量失败（沿用 v1.9.0 存量不追溯原则）。
  let __lastPatrolSeq = -1;
  // v1.9.0: 世界逻辑瑕疵基线——载入期存量记为基线不扣分（避免历史脏数据把健康分永久锁死），
  //   基线之上的新增才扣分；codes 为 error 级 code 集合签名，用于识别「量不变但劣化项易主」。
  const __logicBaseline = { codes: null };
  /** v2.0.0: 标记巡视采集节降级（失败节不静默——否则 signals 归零伪装成健康） */
  function markDegraded(section, err) {
    try {
      __maintainDegraded.sections.push({ section: section, at: clockWall(), msg: String(err && (err.message || err)).slice(0, 120) });
      if (__maintainDegraded.sections.length > 12) __maintainDegraded.sections.splice(0, __maintainDegraded.sections.length - 12);
      __maintainDegraded.lastAt = clockWall(); __maintainDegraded.total++;
    } catch (e) { /* 台账自身失败不得影响巡视 */ }
  }
  // v1.9.0: 引擎故障观测快照（errorLog 巡视间增量 + 逻辑瑕疵计量），经 maintainStat() 透出
  const __faultWatch = { total: 0, recent: 0, recentCodes: [], logicErrors: 0, logicWarns: 0, logicNewErrors: 0, scansWithFault: 0, cursor: null, primed: false, primedAt: 0 };
  // v2.0.0: 巡视自身降级台账——采集节抛错即记录（此前裸 catch 使「巡视半瞎」与「一切正常」不可区分）
  const __maintainDegraded = { sections: [], lastAt: 0, total: 0 };
  // v0.1.38: 加载观测——状态键损坏时隔离原始 payload 而非静默丢弃
  const __loadStat = { loads: 0, hits: 0, misses: 0, errors: 0, healed: 0, shapeConflicts: 0, lastFix: { filled: 0, conflicts: 0, at: 0 }, lastError: null, lastAt: 0,
    // v2.30.0（分支世界不归零）: 镜像回落计量——「本地键空、但聊天镜像里躺着一份完整存档」此前
    //   完全不可观测：load() 只读 localStorage，miss 即返回 null，调用方拿到 defaultWorldState()。
    //   ST 建分支会**整份复制 chat_metadata**（镜像随分支走），而 `worldaxis_state_<新chatId>` 是新键、
    //   必然为空 ⇒ 新分支＝活世界当场归零，而镜像里那份存档无人读取。三个计数回答三件事：
    //     mirrorHits   = 本次确实从镜像救回了世界（带 from/rev/bytes 证据）
    //     mirrorMisses = 镜像里也没有（真·空白分支，归零是正确行为）
    //     mirrorErrors = 镜像在/可能在上，但**读不出来或解析不了**（绝不与「没有」同形）
    mirrorHits: 0, mirrorMisses: 0, mirrorErrors: 0, lastMirror: null };
  // v2.30.0: 镜像命中台账（最近一次回落的完整归因，UI/诊断据此说「这份世界从哪来」）
  let __lastMirror = null;
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
    wb: /^worldaxis_wb_selection_(.+)$/
    // v2.5.0: 删除 `settingsSettings` 硬编码白名单。原因（实测口径）：
    //   ① 它是「12 个设置键」的第二份真源，必然漂移——实查已漏掉 calendar_settings_v1 与
    //      horizon_settings_v1 两个既存键（后者正是 v2.3.0 新加的）；
    //   ② 它唯一的产物标记 `settings: true` **全库无人消费**——classifyKey 的调用方只读
    //      `.family/.chat/.kind/.quarantine`，而白名单外的键走兜底 `return { family:'settings' }`
    //      **结果完全一致**。即：删掉它不改变任何行为，只消除一份会过期的副本。
    //   ③ 真源在 `WA.__settingsRegs`（各模块自持登记），需要「这个键是不是设置」时应查登记表，
    //      而不是维护第十三条清单。
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
    // v2.5.0: 键卫生——settings 家族细分 `settings`(已登记) / `settingsUnregistered`(幽灵设置)。
    //   细分让「设置键 xx 个」不再把「功能已删除、却永久留在用户磁盘上的旧键」算成用户配置：
    //   后者此前**无人负责**——登记表管不到（从未登记），sweepStaleKeys 也管不到
    //   （白名单外的键一律兜底成 settings 家族，而 settings 家族「永不清理」）。
    //   实证：worldaxis_director_tags_v1 由 v0.1.0 写入、v0.2.0 功能移除，此后永久滞留。
    if (KEY_FAMILIES.wb.test(key)) return { family: 'wb', chat: key.match(KEY_FAMILIES.wb)[1] };
    if (isRegisteredSettingsKey(key)) return { family: 'settings', chat: null };
    return { family: 'settingsUnregistered', chat: null };
  }
  /**
   * v2.5.0: 该键是否在 settingsBus 登记表内（= 仍是本扩展在用的设置键）。
   *   真源是 `WA.__settingsRegs`（各模块自持），而非本文件的键名清单——
   *   此前那份硬编码白名单既漏了 calendar/horizon 两键，产物标记也无人消费，已删。
   */
  function isRegisteredSettingsKey(key) {
    try {
      const regs = WA.__settingsRegs || [];
      for (let i = 0; i < regs.length; i++) {
        if (regs[i] && regs[i].key === key) return true;
      }
    } catch (e) { /* 登记表不可用 → 保守视为未登记（只影响归类与诊断，不影响清理） */ }
    return false;
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
    } catch (e) {
      // v2.10.0: 枚举失败回落空清单 —— 后果是**全部键都看不见**（体积 0、无孤儿、无可回收），
      //   而面板会照样报出一份「存储很干净」的结论。这是比单键读失败更严重的失真，必须归因。
      noteStoreReadFail('enumerate', '(enumerate)', e);
    }
    return out;
  }
  function keyBytes(key) {
    // v2.10.0: 读失败必须与「值就是空」可分辨——此前两者都返回 0。
    //   返回 0 的语义保持不变（不破坏容量表结构），但故障进 __readStat 并且调用方
    //   （storageStat）会把它计入 `readFailedKeys`，让「这份占用表是否可信」可判定。
    try { return byteLen(mainWin.localStorage.getItem(key) || ''); }
    catch (e) { noteStoreReadFail('bytes', key, e); return 0; }
  }
  /** 聊天活跃时间：读 state 键 payload 的 meta.updatedAt（无 state 键/解析失败回退 0 = 最冷） */
  function chatActivityAt(chat) {
    try {
      const raw = mainWin.localStorage.getItem('worldaxis_state_' + chat);
      if (!raw) return 0;
      const st = JSON.parse(raw);
      return (st && st.meta && typeof st.meta.updatedAt === 'number') ? st.meta.updatedAt : 0;
    } catch (e) {
      // v2.10.0: 读失败回落 0 = 「最冷」→ 该聊天的诊断键会被判为可回收。
      //   这是**破坏性后果**（读失败可能诱发误回收），必须与「确实没有 state 键」区分开归因。
      noteStoreReadFail('activity', 'worldaxis_state_' + chat, e);
      return 0;
    }
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
      catch (e) { __integrityStat.lastOk = false; __integrityStat.lastFailAt = clockWall(); return { ok: false, verified: false, retried: attempt > 0, reason: 'write', error: e }; }
      let back = null, backReadErr = null;
      try { back = mainWin.localStorage.getItem(key); } catch (e) { back = null; backReadErr = e; }
      // v2.10.0: 写后读回校验的「读」本身也会失败——此前与「读回内容不匹配」混成一个形态
      //   （missing-after-write），归因不实会把用户引向「写入被截断」而实际是读取被拒。
      if (backReadErr) noteStoreReadFail('verify', key, backReadErr);
      if (back === payload) {
        if (attempt > 0) { __integrityStat.retried++; __integrityStat.recoveredByRetry++; }
        __integrityStat.verified++; __integrityStat.lastAt = clockWall();
        __integrityStat.lastOk = true;   // 当前态：最近一次写入校验通过（含重试自愈）
        return { ok: true, verified: true, retried: attempt > 0, reason: null };
      }
      // 读回不一致：磁盘上的副本不是我们写的东西
      __integrityStat.mismatches++; __integrityStat.lastAt = clockWall();
      __integrityStat.lastReason = backReadErr ? 'readback-failed'
        : back === null ? 'missing-after-write'
          : (typeof back === 'string' && typeof payload === 'string' && back.length !== payload.length) ? 'length-mismatch' : 'content-mismatch';
      if (attempt === 0) continue;   // 重试一次（瞬时写入毒化/回收常可自愈）
    }
    __integrityStat.lastOk = false; __integrityStat.lastFailAt = clockWall();   // 当前态：最近一次写入校验失败
    return { ok: false, verified: false, retried: true, reason: 'verify' };
  }
  function byteLen(s) {
    try {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
      return s.length * 3; // 中文兜底估算（UTF-8 最多 3 字节）
    } catch (e) { return s.length * 3; }
  }

  // v0.1.44: 有界容器登记表——path -> { cap: 裁剪后长度硬上限, site: 源码裁剪点 }
  // v2.13.0: 口径已换。原先注释写「tests/run.js 会反查源码」——那条**源码正则反查**
  //   只能证明字面量出现过，证明不了「运行时真按这个 cap 裁」（cap 改成变量、走函数、
  //   或同一容器第二个写入方各自裁剪，正则一概看不出来）。现由挤出侧单一出口接管：
  //   站点表 core/evict.js SITES 是可执行的 cap 真源，门禁做**运行时声明即执行实测**；
  //   本登记表保留为「体检/漂移检测」口径，与站点表逐键对账。
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
    // v2.34.0 平行世界三容器（parallel-world.js 入账器环形剪枝，上限与引擎常量同源）
    'parallelWorld.npcs': { cap: 24, site: 'parallel-world.js CAP_NPCS=24' },
    'parallelWorld.relations': { cap: 120, site: 'parallel-world.js CAP_RELATIONS=120' },
    'parallelWorld.modules': { cap: 80, site: 'parallel-world.js CAP_MODULES=80' },
    'parallelWorld.snapshots': { cap: 12, site: 'parallel-world.js CAP_SNAPSHOTS=12（v2.35.0）' },
    'evolution.ledger': { cap: 20, site: 'ledger.js KEEP_ROUNDS=20（v2.35.0 补登，与 evict.SITES 对齐）' },
    'chapters.history': { cap: 20, site: 'chapters.js pruneHistory(MAX_HISTORY=20)' },
    // v2.62.0 因果结算两容器（causal.js 走 WA.evict.array 单一出口，cap 与 evict.SITES 同源）。
    //   chains 是**含终态**的环形：settled/cancelled/expired 三种终态都保留记录，
    //   「记录被删掉」正是本仓库最贵的一类默认值——删了就再也答不出「这件事为什么没发生」。
    //   settled 与 echoes 分开：echoes 是正文触面（世界里的响动），settled 是结算台账。
    'causal.chains': { cap: 24, site: 'causal.js WA.evict.array(causal.chains)' },
    'causal.settled': { cap: 40, site: 'causal.js WA.evict.array(causal.settled)' },
    // v2.63.0 世界织体三容器（world.js 走 WA.evict.array 单一出口，cap 与 evict.SITES 同源）。
    //   注意「在场者名单」**不在此表**：它由日程 + 地点现算，不落盘，
    //   落盘就会变成一份会过期的第二真源——「谁在场」必须永远能从证据重新推出来。
    'world.places': { cap: 24, site: 'world.js WA.evict.array(world.places)' },
    'world.roads': { cap: 40, site: 'world.js WA.evict.array(world.roads)' },
    'world.events': { cap: 12, site: 'world.js WA.evict.array(world.events)' },
    // v2.65.0 行程表与天气。cap 与 evict.SITES 同源；不登记会被 sizeAudit 报 unbounded。
    'world.journeys': { cap: 24, site: 'world.js WA.evict.array(world.journeys)' },
    'weather.rows': { cap: 24, site: 'weather.js WA.evict.array(weather.rows)' },
    'intelQueue': { cap: 24, site: 'intel.js WA.evict.array(intel.queue)' },
    // v2.66.0 情绪通道 / 关系六型 / 假面。cap 与 evict.SITES 同源；不登记会被 sizeAudit 报 unbounded。
    'affect.channels': { cap: 12, site: 'affect.js WA.evict.array(affect.channels)' },
    'affect.loads': { cap: 24, kind: 'object', site: 'affect.js WA.evict.object(affect.loads)' },
    'bonds.rows': { cap: 24, site: 'bonds.js WA.evict.array(bonds.rows)' },
    'masks.rows': { cap: 20, site: 'masks.js WA.evict.array(masks.rows)' },
    // v2.67.0 时间锁 / 双层性格 / 好感审计 / 场外事件。cap 与 evict.SITES 同源；不登记会被 sizeAudit 报 unbounded。
    'temporal.lock': { cap: 2, kind: 'object', site: 'temporal-lock.js WA.evict.object(temporal.lock)' },
    'temperament.rows': { cap: 12, site: 'temperament.js WA.evict.array(temperament.rows)' },
    'fondness.rows': { cap: 16, site: 'fondness.js WA.evict.array(fondness.rows)' },
    'parallelEvents.rows': { cap: 15, site: 'parallel-events.js WA.evict.array(parallelEvents.rows)' },
    // v2.77.0 好感行内两环（与 evict.SITES 同源；不登记会被 sizeAudit 报 unbounded）。
    'fondness.rows.*.history': { cap: 8, kind: 'array', wildcard: true, site: 'fondness.js WA.evict.array(hit.history)（每行各自有界）' },
    'fondness.rows.*.corrections': { cap: 8, kind: 'array', wildcard: true, site: 'fondness.js WA.evict.array(hit.corrections)（每行各自有界）' },
    // v2.68.0 资料片周期 / 生存三轴 / 通缉 / 驯兽。cap 与 evict.SITES 同源；不登记会被 sizeAudit 报 unbounded。
    'eraCycle.rows': { cap: 8, site: 'era-cycle.js WA.evict.array(eraCycle.rows)' },
    'survival.rows': { cap: 12, site: 'survival.js WA.evict.array(survival.rows)' },
    'warrant.rows': { cap: 16, site: 'warrant.js WA.evict.array(warrant.rows)' },
    'beastBond.rows': { cap: 10, site: 'beast-bond.js WA.evict.array(beastBond.rows)' },
    // v2.69.0 外貌分级契约 / 原型阶梯。cap 与 evict.SITES 同源；不登记会被 sizeAudit 报 unbounded。
    'appearance.rows': { cap: 24, site: 'appearance.js WA.evict.array(appearance.rows)' },
    'ladder.rows': { cap: 16, site: 'ladder.js WA.evict.array(ladder.rows)' },
    // v2.70.0 情境切片 / 阻尼量规 / 竞争焦点
    'sceneSlice.rows': { cap: 20, site: 'scene-slice.js WA.evict.array(sceneSlice.rows)' },
    'gauge.rows': { cap: 16, site: 'gauge.js WA.evict.array(gauge.rows)' },
    'rivalry.rows': { cap: 16, site: 'rivalry.js WA.evict.array(rivalry.rows)' },
    // v2.71.0 叙事纪律四件套。cap 与 evict.SITES 同源；不登记会被 sizeAudit 报 unbounded。
    'enigma.rows': { cap: 24, site: 'enigma.js WA.evict.array(enigma.rows)' },
    'tempo.shifts': { cap: 32, site: 'tempo.js WA.evict.array(tempo.shifts, maxShifts)（per-call，取设置上界）' },
    'quota.rows': { cap: 24, site: 'quota.js WA.evict.array(quota.rows)' },
    'spotlight.rows': { cap: 32, site: 'spotlight.js WA.evict.array(spotlight.rows)' },
    'spotlight.pending': { cap: 32, site: 'spotlight.js WA.evict.array(spotlight.pending)（per-call，取设置上界）' },
    'gauge.rows.*.history': { cap: 8, kind: 'array', wildcard: true, site: 'gauge.js WA.evict.array(hit.history)（每行各自有界）' },
    // v2.72.0 叙事动力四件套。cap 与 evict.SITES 同源；不登记会被 sizeAudit 报 unbounded。
    'karma.rows': { cap: 16, site: 'karma.js WA.evict.array(karma.rows)' },
    'karma.rows.*.notes': { cap: 8, kind: 'array', wildcard: true, site: 'karma.js WA.evict.array(row.notes)（每行各自有界）' },
    'hazard.rows': { cap: 16, site: 'hazard.js WA.evict.array(hazard.rows)' },
    'marginal.rows': { cap: 16, site: 'marginal.js WA.evict.array(marginal.rows)' },
    'tolerance.rows': { cap: 24, site: 'tolerance.js WA.evict.array(tolerance.rows)' },
    // v2.63.0 社交漩涡两容器（shadow.js）+ 悬案两容器（threads.js）
    'shadow.rows': { cap: 12, site: 'shadow.js WA.evict.array(shadow.rows)' },
    'shadow.experiences': { cap: 20, site: 'shadow.js WA.evict.array(shadow.experiences)' },
    // 悬案是**数组根**（每案自带 leads 环），故登记键就是 'threads' 本身，
    //   与 evict.SITES 的 path:'threads' 逐字同名——G18 会拿站点 path 反查登记键，
    //   写成 'threads.cases' 会两边对不上（站点 path 不含通配段时只能全等）。
    'threads': { cap: 6, site: 'threads.js WA.evict.array(threads)' },
    // 通配登记：每案的线索环（精确键无法枚举；'*' 段吃 1 段）
    'threads.*.leads': { cap: 8, wildcard: true, site: 'threads.js WA.evict.array(thread.leads)' },
    // v1.4.0 补登：entityMemory 四类实体库（entities.js CAP_PER_TYPE=30 双处裁剪）——此前漏登致 sizeAudit 误报 unbounded、maintain 盲区
    'evolution.entityMemory.organization': { cap: 30, site: 'entities.js CAP_PER_TYPE=30' },
    'evolution.entityMemory.object': { cap: 30, site: 'entities.js CAP_PER_TYPE=30' },
    'evolution.entityMemory.ability': { cap: 30, site: 'entities.js CAP_PER_TYPE=30' },
    'evolution.entityMemory.location': { cap: 30, site: 'entities.js CAP_PER_TYPE=30' },
    // v1.4.0 新增：通配登记——嵌套动态路径（每实体 events 环，精确键无法枚举；'*' 段吃 1..n 段）
    'evolution.entityMemory.*.events': { cap: 8, wildcard: true, site: 'entities.js 实体事件环（保留最新 8 条）' },
    // v1.5.0 补登：people.<id>.profile 五节（profile.js 档案维护切片 cap）——此前漏登致深扫误报 unbounded、drifted/maintain 盲区
    'people.*.profile.personality': { cap: 15, wildcard: true, site: 'actors/registry.js 档案节写入（上限取自本登记表，v2.2.0 单一真源）' },
    'people.*.profile.worldview': { cap: 10, wildcard: true, site: 'actors/registry.js 档案节写入（上限取自本登记表，v2.2.0 单一真源）' },
    'people.*.profile.family': { cap: 10, wildcard: true, site: 'actors/registry.js 档案节写入（上限取自本登记表，v2.2.0 单一真源）' },
    'people.*.profile.memory': { cap: 25, wildcard: true, site: 'actors/registry.js 档案节写入（上限取自本登记表，v2.2.0 单一真源）' },
    'people.*.profile.relationships': { cap: 15, wildcard: true, site: 'actors/registry.js 档案节写入（上限取自本登记表，v2.2.0 单一真源）' },
    // v2.51.0 补登：单向关系量值（缝合万相锚典亲密度语义区间，压缩口径）。
    //   未登记会让 sizeAudit 把 people.<id>.profile.relations 报成 unbounded。
    //   persona 是对象且非顶层，不计入 maintain 的 rows7 盘点，故无需登记 cap。
    'people.*.profile.relations': { cap: 40, wildcard: true, site: 'actors/registry.js 关系量值写入（上限取自本登记表；单次变化±20 硬边界）' },
    // v1.5.0 补登：people.<id>.knowledge 对象键容器（backstage 按 at 排序逐出，保留 30 键）
    'people.*.knowledge': { cap: 30, kind: 'object', wildcard: true, site: 'backstage.js knowledge 容量30逐出' },
    // v2.13.0 补登（挤出侧广谱侦察发现的**真盲区**）：阶段纪要 / 大总述环形。
    //   此前这两条**根本没在本登记表上**，于是 sizeAudit 把它们报成 unbounded
    //   （全库唯一两条），而代码其实一直在 slice(-N) 静默裁剪——「被误判为无界」
    //   与「裁剪无人知晓」两个缺陷同时存在。上限与 summarizer.js 的 CAP_SMALL/CAP_BIG 同源。
    'memory.smallSummaries': { cap: 24, site: 'summarizer.js CAP_SMALL=24（v2.13.0 补登 + 接挤出台账）' },
    'memory.bigSummaries': { cap: 8, site: 'summarizer.js CAP_BIG=8（v2.13.0 补登 + 接挤出台账）' },
    // v2.13.0: 人物档案节（people.<id>.profile.<节>）的上限**逐节不同**，上面五条具名
    //   登记已足够说明「这些数组归谁管」；挤出侧站点 people.profile 的 path 是
    //   people.*.profile.*（per-call，写的时候才由 registry 逐节取值传入），
    //   不需要在登记表里再补一条通配键——补了反而会让 registryParity 的
    //   「每项登记都要有写入方」计数多算一项（实测触发 11 条既有断言失败）。
    //   （这条注释本身是留痕：撤掉的是**看起来更全**、实则会破坏既有对账的那条。）
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
  // 通配键（按定义不在默认状态）不参与判定；精确键（array + object）一律纳入，
  // object 键同时校验「未物化」与「类型错配」（v1.7.0：与 array 同构收口，此前整体 continue 是盲区）。
  function registryParity() {
    const missing = [];
    const ks = Object.keys(__BOUNDED_CAPS);
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i], meta = __BOUNDED_CAPS[k];
      if (!meta || meta.wildcard) continue;
      const wantObj = meta.kind === 'object';
      const segs = k.split('.');
      let cur = memCache, okPath = true;
      for (let j = 0; j < segs.length; j++) {
        if (cur === null || cur === undefined || typeof cur !== 'object' || !(segs[j] in cur)) { okPath = false; break; }
        cur = cur[segs[j]];
      }
      let bad = false, reason = '';
      if (!okPath) { bad = true; reason = '未在骨架物化'; }
      else if (wantObj) {
        if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) { bad = true; reason = '类型错配（应为普通对象）'; }
      } else if (!Array.isArray(cur)) { bad = true; reason = '类型错配（应为数组）'; }
      if (bad) missing.push({ path: k, cap: meta.cap, site: meta.site || '', kind: wantObj ? 'object' : 'array', reason: reason });
    }
    const checkedKeys = ks.filter(k => !__BOUNDED_CAPS[k].wildcard);
    return { checked: checkedKeys.length, checkedKeys: checkedKeys, missing: missing, ok: missing.length === 0 };
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
  function deriveAuditRows(arrays, minBytes, bloatBytes) {
    const BLOAT_MIN = (typeof bloatBytes === 'number' && bloatBytes > 0) ? bloatBytes : 65536;  // v1.8.0：字节膨胀告警阈值（默认 64KB）
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
    // v1.8.0：字节膨胀维度——已登记容器条数合规（未进 drifted）但序列化字节超阈，体积风险此前静默
    const bloat = topRows.filter(function (a) { return a.bounded && typeof a.cap === 'number' && a.cap > 0 && a.len <= a.cap && a.bytes >= BLOAT_MIN; }).sort(byBytesDesc);
    return {
      unbounded: unregistered.map(function (a) { return a.path; }),
      suspects: suspects.map(function (a) { return { path: a.path, len: a.len, bytes: a.bytes }; }),
      drifted: drifted.map(function (a) { return { path: a.path, len: a.len, cap: a.cap, bytes: a.bytes, site: a.site }; }),
      bloat: bloat.map(function (a) { return { path: a.path, len: a.len, cap: a.cap, bytes: a.bytes, site: a.site }; })
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
      __loadStat.lastFix = { filled: shapeFix.filled, conflicts: shapeFix.conflicts, at: clockWall() };
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
      __migrateReport = { from: fromV, to: SCHEMA_VERSION, path: steps, steps: steps.length, failed: failed, at: clockWall() };
      delete out._migratedFrom;
      return out;
    },

    load(chatId) {
      // v0.1.38: 解析失败不再静默——原始 payload 存入 *_corrupt_<ts> 隔离键，
      // 避免默认状态在下次 save 时覆盖可恢复现场（部分写入/扩展冲突等导致的状态键损坏）
      __loadStat.loads++; __loadStat.lastAt = clockWall();
      let raw = null;
      try { raw = mainWin.localStorage.getItem(storageKey(chatId)); }
      catch (e) {
        // v2.11.0: 载入失败此前只进 __loadStat.errors（载入域），而读侧台账（__readStat）
        //   查不到。后果：诊断报「存储读取全部成功」的同时，当前聊天其实**根本没载入**。
        //   载入失败是读失败里后果最重的一种（整份存档不可见），必须两个域都可见。
        noteStoreReadFail('load', String(chatId || ''), e);
        __loadStat.errors++; __loadStat.lastError = String((e && e.message) || e);
        WA.log('error', 'store.load读取失败', e); return null;
      }
      if (!raw) {
        __loadStat.misses++;
        // v2.30.0: 自动回落**只对分支世界**动手（母聊天 id 在 chat_metadata.main_chat）。
        //   同聊天空键由 chatcache 跨设备安装负责；若此处无条件写回，LS.clear()+init()
        //   会被持久 chatMetadata 镜像凭空重建 state 键（破坏「拒绝恢复未凭空创建」契约）。
        //   用户主动补救走 rescueFromMirror（无视本地键，必须显式调用）。
        if (branchParentId()) return loadFromMirror(chatId);
        return null;
      }
      try {
        const st = JSON.parse(raw);
        __loadStat.hits++;
        return st;
      } catch (pe) {
        __loadStat.errors++; __loadStat.lastError = String((pe && pe.message) || pe);
        try { mainWin.localStorage.setItem(storageKey(chatId) + '_corrupt_' + clockNow('store.corrupt'), raw); } catch (e2) {}
        WA.log('error', 'store.load解析失败：状态键已隔离（*_corrupt_*），下次保存不会覆盖原始现场', pe);
        return null;
      }
    },

    save(state, chatId) {
      try {
        const s = state || memCache;
        s.meta = s.meta || {};
        s.meta.updatedAt = clockNow('store.meta');
        // v0.5.0: 写入者标识与全局单调序号（多实例并发防护的可观测基础）
        const cidW = chatId || getChatId();
        let conflict = null;
        try {
          const dRevRes = diskRev(cidW);
          const dRev = dRevRes.ok ? dRevRes.rev : 0;
          // v2.10.0: 磁盘序号读失败时**不做冲突判定**。此前 diskRev 把读失败返回成 0，
          //   而 0 > __seenRev 恒不成立 ⇒ 冲突检测被静默跳过 ⇒ 他实例 payload 不保全、
          //   本实例直接覆盖且无痕迹（**读失败掩盖并发覆盖**）。宁可本次不判定（故障已在
          //   读侧台账里可见），也不能把「不可知」当成「没有冲突」。
          // 磁盘序号与本实例上次所见不一致 → 他实例写过。若此刻直接写，其改动将被覆盖。
          if (dRevRes.ok && __seenRev > 0 && dRev > __seenRev) {
            // v2.11.0（结论不实 · 现场四）: 本分支已确认「他实例写过、本次保存将覆盖其改动」，
            //   保全对方的唯一手段就是读出其磁盘 payload。此处读失败此前被压成 rawDisc=null ⇒
            //   走「if (rawDisc)」的 else 路径，即**静默跳过保全**——他实例的进度就这么没了，
            //   而 __conflictStat.detected 也不计，诊断与面板上都看不到「有一次覆盖没保住对方」。
            //   与 v2.10.0 修的 diskRev 读失败同源，但后果更重：连保全机会都没有。
            let rawDisc = null, rawDiscErr = null;
            try { rawDisc = mainWin.localStorage.getItem(storageKey(cidW)); } catch (e) { rawDisc = null; rawDiscErr = e; }
            if (rawDiscErr) {
              noteStoreReadFail('saveConflict', storageKey(cidW), rawDiscErr);
              try { __conflictStat.unpreserved = (__conflictStat.unpreserved || 0) + 1; __conflictStat.lastUnpreservedAt = clockWall(); } catch (eU) {}
              WA.log('error', '检测到并发写入（对方序号 ' + dRev + ' > 本实例所见 ' + __seenRev
                + '）但对方 payload **读取失败**，本次覆盖**未能保全**其改动（键：' + storageKey(cidW) + '）', rawDiscErr);
            }
            if (rawDisc) {
              const kept = quarantineConflict(cidW, rawDisc, s);
              __conflictStat.detected++; __conflictStat.lastAt = clockWall(); __conflictStat.lastChat = cidW;
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
          __saveStat.at = clockWall(); __saveStat.ok = false; __saveStat.reason = 'verify'; __saveStat.failCount++;
          memCache = s;
          WA.log('error', 'store.save 写后读回校验失败（' + __integrityStat.lastReason + '）：磁盘副本与内存不一致，重试一次仍失败——数据可能未真正落盘');
          return false;
        }
        if (!w.ok) throw (w.error || new Error('write failed'));
        memCache = s;
        __saveStat.at = clockWall(); __saveStat.ok = true; __saveStat.bytes = byteLen(payload); __saveStat.reason = null;
        return true;
      } catch (e) {
        // v0.1.22: save 失败归因 + 计数；内存副本仍推进，避免本轮结算在半份状态里丢失
        __saveStat.at = clockWall(); __saveStat.ok = false; __saveStat.reason = classifySaveError(e); __saveStat.failCount++;
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
            try { this.save(); __batch.flushes++; __batch.lastFlushAt = clockWall(); } catch (e) { WA.log('error', 'batch 退出落盘失败', e); }
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
      __rescueStat.attempts++; __rescueStat.lastAt = clockWall();
      let removed = 0, freed = 0;
      try {
        const plan = this.sweepStaleKeys({ apply: true });   // 只回收过期诊断/孤儿恢复点/隔离溢出
        removed = plan.remove.length; freed = plan.freedBytes;
      } catch (e) { removed = 0; freed = 0; }
      __rescueStat.lastRemoved = removed; __rescueStat.lastFreedBytes = freed;
      if (!removed) { __rescueStat.failed++; __rescueStat.lastOk = false; __rescueStat.lastFailAt = clockWall(); return false; }
      // 重试落盘
      try {
        const s = state || memCache;
        s.meta = s.meta || {};
        s.meta.updatedAt = clockNow('store.meta');
        const payload = JSON.stringify(s);
        const w2 = writeVerified(storageKey(chatId), payload);
        if (!w2.ok) { __rescueStat.failed++; __rescueStat.lastOk = false; __rescueStat.lastFailAt = clockWall(); return false; }
        memCache = s;
        __saveStat.bytes = byteLen(payload);
        __rescueStat.recovered++;
        __rescueStat.lastOk = true;   // 当前态：最近一次救援成功
        return true;
      } catch (e2) {
        __rescueStat.failed++; __rescueStat.lastOk = false; __rescueStat.lastFailAt = clockWall();
        return false;
      }
    },
    /**
     * v0.4.0: 统一健康巡视——把分散的治理信号（存储计量/键卫生/诊断预算/隔离现场/救援/写入完整性/全库状态）
     * 收敛为「一个健康分 + 分级议题 + 建议动作」。这是治理层从「各自出数」走向「统一裁决」的关键一步。
     * v1.9.0: 巡视范畴从「存储治理」扩展到「世界逻辑 + 引擎健康」——消费 inspectorState.inspect() 的
     * 10 组检查器（logic.consistency）与 errorLog 增量（engine.faultRate），两者均按基线/游标口径判定
     * 「是否恶化」，载入期存量不追溯扣分、同一恶化不重复惩罚。
     * v2.0.0: 巡视自身也可观测——采集节抛错进 __maintainDegraded 台账并出 patrol.degraded 议题
     * （此前五个采集点全为裸空 catch，任一节失败都会让 signals 归零、健康分保持 100 假绿，
     * 使「巡视半瞎」与「真健康」不可区分）；同时新增 module.integrity（模块装载失败/注册缺口）
     * 与 deep 专属的 engine.contract/engine.sampler/engine.purifier（三个自检能力此前零运行时消费）。
     * 只读（apply:false 默认）；apply:true 时仅执行安全子集（过期诊断/孤儿恢复点/隔离溢出回收）。
     */
    maintain(opts) {
      const o = opts || {};
      const apply = o.apply === true;
      __maintainStat.scans++; __maintainStat.lastAt = clockWall();
      __maintainDegraded.sections.length = 0;   // v2.0.0: 巡视降级台账按轮计，不跨轮粘留
      const issues = [];
      const actions = [];
      let score = 100;

      // ── 1. 存储计量 + 键卫生 ──
      let stat = null, plan = null;
      try { stat = this.storageStat(); } catch (e) { markDegraded('storageStat', e); }
      try { plan = this.sweepStaleKeys({}); } catch (e) { markDegraded('sweepStaleKeys', e); }
      if (plan && plan.remove.length) {
        const freedKB = Math.round(plan.freedBytes / 1024);
        if (plan.freedBytes > 512 * 1024) { score -= 12; issues.push({ level: 'warn', key: 'hygiene.reclaimable', detail: '可回收 ' + plan.remove.length + ' 键 / ' + freedKB + 'KB' }); }
        else { score -= 3; issues.push({ level: 'info', key: 'hygiene.reclaimable', detail: '可回收 ' + plan.remove.length + ' 键 / ' + freedKB + 'KB' }); }
        actions.push({ id: 'sweep', safe: true, detail: '回收过期诊断/孤儿恢复点/隔离溢出（' + plan.remove.length + ' 键）' });
      }

      // ── 2. 诊断体积预算 ──
      let db = null;
      try { db = this.diagBudget(); } catch (e) { markDegraded('diagBudget', e); }
      if (db && db.exceeded) { score -= 8; issues.push({ level: 'warn', key: 'diag.budget', detail: '当前聊天诊断 ' + db.diagPct + '% > ' + db.maxPct + '%' }); actions.push({ id: 'trim-diag', safe: true, detail: '诊断环自适应收紧（由 index.js logCaps 执行）' }); }
      else if (db && db.diagPct > 10) { issues.push({ level: 'info', key: 'diag.budget', detail: '诊断占比 ' + db.diagPct + '%' }); }

      // ── 3. 隔离现场（需人工决策，不可自动）──
      let qs = null;
      try { qs = this.quarantineStat(); } catch (e) { markDegraded('quarantineStat', e); }
      if (qs && qs.stateSites > 0) {
        score -= Math.min(10, qs.stateSites * 3);
        issues.push({ level: qs.parseable > 0 ? 'warn' : 'info', key: 'quarantine.sites', detail: qs.stateSites + ' 个 state 隔离现场（可解析 ' + qs.parseable + '）——面板「隔离现场」可恢复/丢弃' });
        if (qs.parseable > 0) actions.push({ id: 'restore-quarantine', safe: false, detail: '存在可解析现场，可能可恢复更多进度（需人工确认）' });
      }

      // ── 4. 全库状态健康 ──
      let va = null;
      try { va = this.verifyAll({ deep: o.deep === true }); } catch (e) { markDegraded('verifyAll', e); }
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

      // ── 5.5 v2.9.0 删除侧完整性 ──
      //   与写入侧对称的裁决：删除静默无效（removeItem 没抛错但键仍在）会让清理策略报出
      //   「已释放 N 字节」而磁盘一个字节没释放——用户按提示继续清理，永远清不出空间。
      //   属**当前态缺陷**（本会话内真实发生过），扣分并把处置写进 actions。
      const rmS = (function () { try { return __removeStat; } catch (e) { return null; } })();
      // v2.9.0（当前态口径）: 判据取自 lastReason（最近一次删除的结果），累计数只作展示。
      //   与写入侧 integrityStat 的 lastOk 同规格——历史经历过一次删除失败不应把健康分永久压低，
      //   而一旦**最近一次**删除静默无效，就必须当场是 error（当下正在骗人）。
      if (rmS && rmS.lastReason === 'staged-still-present') {
        score -= 12;
        issues.push({ level: 'error', key: 'storage.removeStaged', detail: '最近一次删除**静默无效**（removeItem 没报错但键仍在，键：' + String(rmS.lastKey || '').slice(0, 60) + '；本会话累计 ' + rmS.staged + ' 次）——清理报出的「已释放」与实际不符，释放空间请勿依赖计数' });
        actions.push({ id: 'review-storage', safe: true, detail: '存储写入/删除被环境静默丢弃，先导出诊断包留证，再考虑清理其他聊天' });
      } else if (rmS && rmS.lastReason) {
        score -= 9;
        issues.push({ level: 'warn', key: 'storage.removeFailed', detail: '最近一次受控删除未成功（原因：' + rmS.lastReason + '；本会话累计失败 ' + rmS.failed + ' 次，成功 ' + rmS.removed + ' 次）——' + (rmS.lastReason === 'remove-threw' ? '删除被拒（权限/策略）' : '删除未生效，相关键仍在磁盘上') });
      } else if (rmS && rmS.removed > 0) {
        issues.push({ level: 'info', key: 'storage.removeOk', detail: '受控删除 ' + rmS.removed + ' 次全部复核通过（键确已移除）' });
      }
      // ── 5.6 v2.10.0 读侧完整性 ──
      //   与前两面严格对偶：写侧判「写进去了吗」（integrity）、删侧判「真删掉了吗」（remove），
      //   读侧判「**拿到的是用户配置还是兜底值**」。这是唯一会被用户当成「设置被程序改回去」
      //   的故障，而它此前在诊断与健康分里完全不存在。
      //   ① `storageStat.readFailedKeys > 0` ⇒ 占用表偏小：容量结论不可用（warn）。
      //      注意判据用**本次盘点**引发的读失败数，而非累计——累计数只增不减，
      //      会让「存储修好后分数复原」无法成立（与 v2.9.0 删除侧同一裁决）。
      //   ② 活跃时间读失败 ⇒ 该聊天会被判「最冷」而进可回收候选 ⇒ 有**误删风险**（warn，更重）。
      let ssRead = null;
      try { ssRead = this.storageStat(); } catch (e) { markDegraded('storageStat.read', e); }
      if (ssRead && ssRead.readFailedKeys > 0) {
        score -= 7;
        const rdSrc = ssRead.readFailedDetail || {};
        // v2.10.0（逆向审计自纠第四轮）: 分桶明细**全量列出**（此前只列三个已知来源）。
        // v2.11.0: 来源标签必须覆盖**全部**归因点。本版把引擎侧 7 处裸读点接入同一台账
        //   （chatcacheState / chatcacheRev / worldbookSelection / workflowHistory /
        //   uninjectLedger / eventLog / errorLog），以及 core 侧 5 处（rmExisted / verifyBack /
        //   legacyRead / saveInherit / subkeyAudit / pendingOrphan / verifyDefaults / load /
        //   saveConflict / verifyState）。标签缺失会让这些来源在消费端退回裸桶名——
        //   与 v2.10.0 修掉的「有归因但看不见」是同一个坑。
        // v2.23.0: 本表标注的是 `readFailedDetail`（store 域 bySource），来源集合 = 21 个。
        //   此前它保留了 8 个 **settings-bus 域**的键（rmExisted/verifyBack/legacyRead/saveInherit/
        //   subkeyAudit/pendingOrphan/verifyDefaults/lsRaw）——这 8 个投递的是 settings-bus 自己的
        //   `noteReadFail`（进 stats.readFailedBy），**永不流入 store 的 bySource**（settings-bus 不向
        //   store 转发读失败），故在此表里是永不命中的幽灵键；同时又漏了 `readSpotCheck`。
        //   与 ui/panel.js 的 LAB_P（v2.22.0 已修）是同一条「跨域错放」线索的第二处现场。
        const LAB = { bytes: '按字节', activity: '活跃时间', enumerate: '枚举', diskRev: '磁盘序号',
          verify: '写后校验/删后复核读回', recovery: '恢复点清单', conflict: '冲突现场',
          quarantine: '隔离现场', writerId: '写入者标识',
          load: '存档载入（整份存档不可见）', saveConflict: '并发覆盖前的保全读回',
          verifyState: '存档巡检', readSpotCheck: '诊断抽查列目录',
          chatcacheState: '聊天快照', chatcacheRev: '同步修订号',
          chatcacheInstallBack: '快照安装回读', worldbookSelection: '世界书条目选择',
          workflowHistory: '工作流历史', uninjectLedger: '撤销注入账本',
          eventLog: '事件日志载入', errorLog: '错误日志载入' };
        const rTxt = Object.keys(rdSrc).filter(function (k) { return rdSrc[k] > 0; })
          .map(function (k) { return (LAB[k] || k) + ' ' + rdSrc[k]; }).join(' / ');
        issues.push({ level: 'warn', key: 'storage.readFailed',
          detail: '存储读取失败 ' + ssRead.readFailedKeys + ' 个键（' + rTxt + '）——读失败的键被按 0 字节计，占用表**偏小**，'
            + '据此判断「已释放多少 / 还剩多少」不可靠' });
        actions.push({ id: 'review-storage', safe: true, detail: '存储读取被环境静默拒绝，先导出诊断包留证（占用数据当前不完整）' });
      }
      if (ssRead && ssRead.readFailedDetail && ssRead.readFailedDetail.activity > 0) {
        score -= 5;
        issues.push({ level: 'warn', key: 'storage.readActivity',
          detail: '聊天活跃时间读取失败 ' + ssRead.readFailedDetail.activity + ' 次——回落 0 等于「最冷」，'
            + '这些聊天的诊断键会被列为可回收候选，清理时**可能误删仍在使用的聊天**' });
      }
      // v2.10.0（逆向审计自纠第四轮）: 「恢复点保护失效」——清单读失败时创建被跳过（保命优先），
      //   用户此刻**没有恢复点保护**，属当下缺陷（error 级，扣分重于容量失真）。
      //   判据用**最近一次读失败事件**（`lastFail.source`）而非累计数：累计数只增不减，会让
      //   「历史失败」把分数永久压低（v0.4.0 裁决；本版已因同型坑自纠三次）。
      //   注意也不可用 `readFailedDetail.recovery`——那是「本次盘点」差值，而盘点本身不读恢复点键，
      //   恒为 0（这正是本版第三次自纠踩过的同型口径错误）。
      if (__readStat.lastReadFail && __readStat.lastReadFail.source === 'recovery') {
        score -= 12;
        issues.push({ level: 'error', key: 'storage.readRecoveryBlocked',
          detail: '**最近一次**存储读取失败发生在恢复点清单上（本会话累计 '
            + ((ssRead && ssRead.readFailedCumulative && ssRead.readFailedCumulative.recovery) || 1)
            + ' 次）——为避免覆盖丢弃全部历史恢复点，恢复点创建已被跳过（读不到就不写），'
            + '当前**没有恢复点保护**，推进后无法回退' });
        actions.push({ id: 'export-diag', safe: true, detail: '先导出诊断包留证，再排查存储可读性（恢复点保护当前不可用）' });
      }
      // ── 5.7 v2.11.0 读侧完整性扩展：结论级读失败（比容量数字失真重得多）──
      //   ① 存档载入读失败 ⇒ **当前聊天整份存档不可见**（默认状态顶上）。这是读失败里
      //      后果最重的一种：用户看到的是一个空世界，而磁盘上他的进度还在。error。
      //   ② 存档巡检读失败 ⇒ 「所有聊天存档可解析」这句结论建立在失败的读取上。error。
      //   ③ 并发覆盖未保全 ⇒ 已确认他实例写过、本次保存将覆盖其改动，而对方 payload
      //      **读不出来** ⇒ 连保全机会都没有。他实例进度被静默吞掉，是本版修掉的最严重现场。
      //   ④ 快照安装回读失败 ⇒ 安装后无法确认内容一致（只有这一处能发现静默截断）。
      //   判据一律用**最近一次读失败事件**（lastFail.source）而非累计数——累计数只增不减，
      //   会让「历史失败」把分数永久压低（v0.4.0 裁决；本仓库已因同型坑自纠四次）。
      const lfSrc = (__readStat.lastReadFail && __readStat.lastReadFail.source) || null;
      if (lfSrc === 'load') {
        score -= 15;
        issues.push({ level: 'error', key: 'storage.readLoadBlocked',
          detail: '**最近一次**存储读取失败发生在存档载入上（当前聊天）：整份存档对本实例不可见，'
            + '界面呈现的是默认世界而磁盘上仍有你的进度——此时**不要保存**，任何保存都会用空状态覆盖真档。'
            + '请先导出诊断包留证并排查存储可读性' });
        actions.push({ id: 'export-diag', safe: true, detail: '存档未载入（读失败）——先导出诊断包留证，暂勿保存以免覆盖真档' });
      }
      if (lfSrc === 'saveConflict') {
        score -= 12;
        issues.push({ level: 'error', key: 'storage.coverageUnpreserved',
          detail: '**最近一次**存储读取失败发生在并发覆盖前的保全读回上：已确认另一实例写过该聊天、'
            + '本次保存将覆盖其改动，而对方的 payload 读不出来 ⇒ **本次覆盖未能保全对方进度**'
            + '（本会话累计 ' + ((__conflictStat && __conflictStat.unpreserved) || 1) + ' 次）。'
            + '他实例的改动已被静默吞掉，无现场可查' });
        actions.push({ id: 'review-conflict', safe: false, detail: '存在未能保全的并发覆盖（对方 payload 读失败），建议先导出诊断包留证' });
      }
      if (lfSrc === 'verifyState') {
        score -= 6;
        issues.push({ level: 'error', key: 'storage.readVerifyBlocked',
          detail: '**最近一次**存储读取失败发生在存档巡检上：「所有聊天存档可解析」这一结论建立在一次失败的读取之上，'
            + '该聊天既没被判定为正常、也没被判定为损坏（巡检留了空档）' });
      }
      if (lfSrc === 'chatcacheInstallBack') {
        score -= 6;
        issues.push({ level: 'warn', key: 'storage.readInstallBlocked',
          detail: '**最近一次**存储读取失败发生在快照安装回读上：安装后无法确认磁盘内容与安装值一致，'
            + '静默截断（写入被接受但只落了一部分）与读失败在本会话内不可分辨' });
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
      let capDrifted = 0, capUnregistered = 0, capBloat = 0, schemaPollution = 0;  // v1.8.0
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
            issues.push({ level: 'warn', key: 'capacity.unmaterialized', detail: rp.missing.length + ' 个已登记容器与状态骨架不一致（容量治理对其空转、直写会回滚事务）：' + rp.missing.slice(0, 4).map(m => m.path + '[' + (m.reason || '未物化') + ']').join('、') + (rp.missing.length > 4 ? ' 等' : '') + '——数组请在 defaultWorldState 补 []、对象补 {}' });
          }
        } catch (e) { WA.log('warn', '物化一致性自检异常（不阻断巡视）', e); }
        if (unreg7.length) {
          // 未登记非空数组：要么登记表漏登（登记义务），要么运行时新演进容器（需要确认是否有界）
          score -= Math.min(10, unreg7.length * 2);
          issues.push({ level: 'warn', key: 'capacity.unregistered', detail: unreg7.length + ' 个非空数组未登记容量：' + unreg7.slice(0, 4).join('、') + (unreg7.length > 4 ? ' 等' : '') + '——若无界增长会拖垮存档，请确认后登记 __BOUNDED_CAPS' });
        }
        // v1.8.0 块2：schema 类型污染可观测——ensureShape 检出但刻意保守保留原值的冲突，此前只沉睡在 loadStat
        const ls8 = this.loadStat();
        schemaPollution = (ls8 && ls8.lastFix && ls8.lastFix.conflicts) || 0;
        if (schemaPollution > 0) {
          score -= Math.min(12, schemaPollution * 4);
          issues.push({ level: 'warn', key: 'schema.pollution', detail: '本次载入检出 ' + schemaPollution + ' 处字段类型与默认结构不符（已保留原值未自动改写，防误删用户数据）——请用编辑器或 WA.store 核对这些容器是否被外部写入污染' });
        }
        // v1.8.0 块3：字节膨胀巡视（deep 模式专属，避免高频路径全量序列化）——条数合规但体积超阈的登记容器
        if (o.deep === true) {
          const bz8 = this.sizeAudit({ minBytes: 0, maxDepth: 8, bloatBytes: o.bloatBytes });
          if (bz8.bloat && bz8.bloat.length) {
            capBloat = bz8.bloat.length;
            score -= Math.min(8, capBloat * 2);
            issues.push({ level: 'warn', key: 'capacity.bloat', detail: capBloat + ' 个登记容器条数合规但字节超阈（体积膨胀）：' + bz8.bloat.slice(0, 4).map(function (b) { return b.path + '(' + Math.round(b.bytes / 1024) + 'KB)'; }).join('、') + (capBloat > 4 ? ' 等' : '') + '——单条过大，考虑收紧条目体积或调低 cap' });
          }
        }
      } catch (e) { WA.log('warn', '容量盘点异常（不阻断巡视）', e); }

      // ── 8. 世界逻辑自洽（v1.9.0）──
      //   inspector-state 的 10 组只读检查器（事件/势力/脉搏/认知/记忆/引用/软引用/注入/主观记忆/突发）
      //   此前只有人工点面板「状态体检」才会跑，自动巡视完全不知道世界有没有逻辑矛盾——治理层
      //   与检查层的断链接入后消除：世界坏了，巡视必须有人知道。
      let logicErrors = 0, logicWarns = 0, logicNewErrors = 0;
      try {
        if (WA.inspectorState && typeof WA.inspectorState.inspect === 'function') {
          const repL = WA.inspectorState.inspect(memCache || undefined);
          const cL = (repL && repL.counts) || {};
          logicErrors = cL.error || 0; logicWarns = cL.warn || 0;
          // 按 code 聚合的出现次数多重集：可区分「同类变多」与「旧项修掉但新项顶替」两种劣化
          const tallyL = (function () {
            const t = {};
            (repL.sections || []).forEach(function (sec) {
              (sec.issues || []).forEach(function (it) {
                if (it.level !== 'error') return;
                const ck = sec.code + ':' + it.code;
                t[ck] = (t[ck] || 0) + 1;
              });
            });
            return t;
          })();
          if (__logicBaseline.codes === null) {
            __logicBaseline.codes = tallyL;                       // 首次可见：整份记为基线，不追溯扣分
          } else {
            const baseL = __logicBaseline.codes;
            Object.keys(tallyL).forEach(function (ck) {
              const prev = baseL[ck] || 0;
              if (tallyL[ck] > prev) logicNewErrors += tallyL[ck] - prev;
            });
          }
          const worstL = (function () {
            const flat = WA.inspectorState.flatten(repL).filter(function (it) { return it.level === 'error'; });
            return flat.length ? String(flat[0].detail || '').slice(0, 60) : '';
          })();
          if (logicErrors > 0) {
            if (logicNewErrors > 0) {
              score -= Math.min(15, logicNewErrors * 5);
              issues.push({ level: 'error', key: 'logic.consistency', detail: logicErrors + ' 处世界逻辑瑕疵（较载入基线新增 ' + logicNewErrors + '）：' + worstL + '——推演/注入正基于矛盾数据，面板「状态体检」有逐条定位与修法' });
              actions.push({ id: 'review-logic', safe: false, detail: '面板「状态体检」查看 ' + logicErrors + ' 条明细并逐条修正（涉及取值判断，不自动改写）' });
            } else {
              issues.push({ level: 'info', key: 'logic.consistency', detail: logicErrors + ' 处历史遗留逻辑瑕疵（自载入基线以来未恶化，不扣健康分）：' + worstL });
            }
          }
          __logicBaseline.codes = tallyL;  // 基线滚动：恶化按次计，不重复惩罚同一存量
        }
      } catch (e) { WA.log('warn', '世界逻辑巡视异常（不阻断巡视）', e); }

      // ── 9. 引擎故障率（v1.9.0）──
      //   errorLog 此前只在面板显示条数，巡视不看；55 处静默 catch 也吞掉了引擎异常。
      //   口径取「自上次巡视以来的新增」而非绝对存量：存量可能是载入期历史，重复扣分会让分数永久锁死。
      //   游标用条目对象身份而非时间戳：Date.now() 为毫秒精度，同一批故障会跨两次巡视重复计入。
      //   游标失位（环被裁剪到底/切换聊天重载入）时按「整环皆新增」处理——宁可多报一次也不静默丢故障。
      let errTotal = 0, errRecent = 0, errSamples = [];
      try {
        const el = Array.isArray(WA.errorLog) ? WA.errorLog : [];
        errTotal = el.length;
        let recent = el;
        if (!__faultWatch.primed) {
          recent = [];                                          // 从未巡视过：只建基线，不追溯载入期历史
          __faultWatch.primedAt = clockWall();
        } else {
          const ix = el.indexOf(__faultWatch.cursor);
          // 游标可用 → 精确切片；失位（上次环空/环被重建）→ 退到「基线时刻之后产生」的时间口径，
          //   这样 loadEventLog 恢复的历史条目（t 早于基线）不会被误判为本周期新增。
          if (ix >= 0) recent = el.slice(ix + 1);
          else recent = el.filter(function (x) { return x && Number(x.t) >= __faultWatch.primedAt; });
        }
        errRecent = recent.length;
        errSamples = recent.slice(0, 3).map(function (x) { return String((x && x.msg) || '').slice(0, 24); });
        if (errRecent >= 3) {
          score -= Math.min(15, errRecent * 3);
          issues.push({ level: 'error', key: 'engine.faultRate', detail: '自上次巡视以来新增 ' + errRecent + ' 次引擎异常（error 环共 ' + errTotal + ' 条）：' + errSamples.join('、') + '——引擎在失败而非仅变慢，世界可能未按预期推进' });
          actions.push({ id: 'review-faults', safe: true, detail: '面板「诊断」查看错误环明细与来源模块' });
        } else if (errRecent > 0) {
          score -= 2;
          issues.push({ level: 'warn', key: 'engine.faultRate', detail: '自上次巡视以来新增 ' + errRecent + ' 条引擎异常：' + errSamples[0] });
        }
        __faultWatch.cursor = el.length ? el[el.length - 1] : null;  // 推进游标（空环时不保留失效引用）
        __faultWatch.primed = true;   // 与 cursor 分离：空环也要记住「已建立过基线」
      } catch (e) { WA.log('warn', '引擎故障巡视异常（不阻断巡视）', e); }
      __faultWatch.total = errTotal; __faultWatch.recent = errRecent;
      __faultWatch.recentCodes = errSamples;
      __faultWatch.logicErrors = logicErrors; __faultWatch.logicWarns = logicWarns; __faultWatch.logicNewErrors = logicNewErrors;
      if (errRecent > 0 || logicErrors > 0) __faultWatch.scansWithFault++;

      // ── 11. 模块装载完整性（v2.0.0）──
      //   模块加载失败 = 该引擎整块缺席（render 失败则插图全丢），但此前对健康分毫无影响。
      //   注册表（v2.0.0 块1 建立）也要校验：已加载 / 已注册 / 清单声明 是否三方对齐。
      let modDeclared = 0, modLoaded = 0, modFailed = 0, modMissing = 0, modFailedList = [];
      try {
        const decl = Array.isArray(WA.__loadOrder) ? WA.__loadOrder : null;
        if (decl && decl.length) {
          modDeclared = decl.length;
          modFailedList = (Array.isArray(WA.__loadFailed) ? WA.__loadFailed : []).slice();
          modFailed = modFailedList.length;
          modLoaded = modDeclared - modFailed;
          const reg = WA.modules || {};
          const missing = decl.filter(function (rel) { return !reg[rel] && modFailedList.indexOf(rel) < 0; });
          modMissing = missing.length;
          if (modFailed > 0) {
            score -= Math.min(24, modFailed * 8);
            issues.push({ level: 'error', key: 'module.integrity', detail: modFailed + '/' + modDeclared + ' 个模块加载失败（' + modFailedList.slice(0, 5).join('、') + (modFailed > 5 ? ' 等' : '') + '）——对应引擎整块缺席，本世界可能功能残缺，健康分不能代表完整体检' });
            actions.push({ id: 'review-modules', safe: false, detail: '面板「诊断」查看加载失败模块与尝试来源（多为文件缺失或语法错误）' });
          }
          if (modMissing > 0) {
            score -= Math.min(9, modMissing * 3);
            issues.push({ level: 'warn', key: 'module.integrity', detail: modMissing + ' 个模块已加载却未登记注册表（' + missing.slice(0, 5).join('、') + (modMissing > 5 ? ' 等' : '') + '）——装载审计与实际不符，插件清单可能被外部改写' });
          }
        }
      } catch (e) { /* 装载信息读取失败不阻断巡视 */ }
      // ── 12. 引擎自检能力接入（v2.0.0，deep 专属）──
      //   三个自检能力此前零运行时消费：contractAudit（推演契约对账）、samplerCheck（采样器自检）、
      //   purifier（净化规则有效性）。它们正是「引擎自己的体检」，本该由巡视统一裁决。
      //   deep 专属：全量契约扫描与多轮采样有可观开销，高频巡视路径不跑。
      let contractErrors = 0, contractWarns = 0, samplerPass = 0, samplerTotal = 0, samplerOk = true, purifierBad = 0, selfCheckRan = false;
      let purifyRuns = 0, purifyChanged = 0, purifyRuleErrors = 0;   // v2.1.0
      if (o.deep === true) {
        try {
          if (WA.contractAudit && typeof WA.contractAudit.audit === 'function') {
            selfCheckRan = true;
            const ca = WA.contractAudit.audit();
            const v = (ca && ca.verdict) || {};
            contractErrors = v.errorCount || 0; contractWarns = v.warnCount || 0;
            if (contractErrors > 0) {
              score -= Math.min(15, contractErrors * 5);
              const ci = (ca.issues || []).filter(function (i) { return i.level === 'error'; }).slice(0, 3).map(function (i) { return i.code; }).join('、');
              issues.push({ level: 'error', key: 'engine.contract', detail: contractErrors + ' 项推演契约阻断（' + ci + '）——契约声明与消费端已漂移，推演可能读到未声明字段' });
              actions.push({ id: 'review-contract', safe: false, detail: '面板「诊断」查看契约对账明细（声明/实测消费/枚举/跨模块漂移）' });
            } else if (contractWarns > 0) {
              // 存量提醒不扣分（与 v1.9.0「载入期存量不追溯扣分」一致）：declared_not_consumed
              // 等属长期观察项，每轮 deep 扣分会成噪音并污染基线分。
              issues.push({ level: 'info', key: 'engine.contract', detail: contractWarns + ' 项契约提醒（可用但需留意）：' + (ca.issues || []).filter(function (i) { return i.level !== 'error'; }).slice(0, 3).map(function (i) { return i.code; }).join('、') });
            }
          }
        } catch (e) { markDegraded('contractAudit', e); }
        try {
          if (WA.samplerCheck && typeof WA.samplerCheck.runChecks === 'function') {
            selfCheckRan = true;
            const sc = WA.samplerCheck.runChecks({});
            const sv = (sc && sc.verdict) || {};
            samplerPass = sv.pass || 0; samplerTotal = sv.total || 0; samplerOk = sv.ok !== false;
            if (!samplerOk) {
              const bad = (sc.checks || []).filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join('、');
              score -= Math.min(12, (samplerTotal - samplerPass) * 4);
              issues.push({ level: 'warn', key: 'engine.sampler', detail: '记忆采样器自检未通过（' + samplerPass + '/' + samplerTotal + '）：' + bad + '——注入的记忆挑选可能偏离预期（引用丢失/近期偏置失效）' });
            }
          }
        } catch (e) { markDegraded('samplerCheck', e); }
        try {
          if (WA.purifier && typeof WA.purifier.getRules === 'function') {
            selfCheckRan = true;
            const rules = WA.purifier.getRules() || [];
            rules.forEach(function (r) {
              if (!r || !r.enabled) return;
              try { new RegExp(r.find, r.flags || 'g'); } catch (e) { purifierBad++; }
            });
            // v2.1.0: 净化运行观测——规则存在但从未命中/规则异常，都要看得见
            const ps = (typeof WA.purifier.stat === 'function') ? WA.purifier.stat() : null;
            if (ps) { purifyRuns = ps.runs || 0; purifyChanged = ps.changed || 0; purifyRuleErrors = ps.ruleErrors || 0; }
            if (purifyRuleErrors > 0) {
              score -= Math.min(6, purifyRuleErrors * 2);
              issues.push({ level: 'warn', key: 'engine.purifier', detail: purifyRuleErrors + ' 次净化规则执行异常（正则非法或替换值异常）——该规则已跳过，输出未按其预期净化' });
            }
            if (purifierBad > 0) {
              score -= Math.min(9, purifierBad * 3);
              issues.push({ level: 'warn', key: 'engine.purifier', detail: purifierBad + ' 条启用中的净化规则正则非法——该规则在 apply() 时静默失效，输出文本未按预期净化' });
              actions.push({ id: 'review-purifier', safe: false, detail: '面板「净化规则」修正非法正则（转义遗漏最常见）' });
            }
          }
        } catch (e) { markDegraded('purifier', e); }
      }
      // ── 13. 世界钟自动推进（v2.1.0）──
      //   calendar.suggestAdvance 此前零消费 = 世界钟功能整体失效（只能手动设时间）。
      //   接入 after 链后：模块缺失（时钟永远不会自动走）与「跑了但从未推进」必须可区分。
      let calendarAuto = false, calendarAdvances = 0, calendarRuns = 0;
      try {
        if (WA.calendar && typeof WA.calendar.stat === 'function') {
          const cs = WA.calendar.stat();
          calendarAuto = !!cs.auto; calendarAdvances = cs.advanced || 0; calendarRuns = cs.runs || 0;
        } else {
          score -= 4;
          issues.push({ level: 'warn', key: 'engine.calendar', detail: '世界钟模块缺失——after 链无时间推进节点，世界时间只能手动设定（正文写「次日」也不会推进）' });
        }
      } catch (e) { markDegraded('calendar', e); }
      // ── 14. 剧情参谋（v2.1.0）──
      //   generatePlan 此前零调用 = AI 弧线能力形同虚设（面板只能手写节拍）。
      //   注意：judge 通道未配置属用户配置缺失，不是故障——不扣分，只提示。
      let oracleGenerated = 0, oracleFailed = 0, oracleLastReason = null;
      try {
        if (WA.oracle && typeof WA.oracle.stat === 'function') {
          const os = WA.oracle.stat();
          oracleGenerated = os.generated || 0; oracleFailed = os.failed || 0; oracleLastReason = os.lastReason || null;
          if (oracleFailed > 0 && oracleLastReason && oracleLastReason !== 'judge-not-configured' && oracleLastReason !== 'empty-goal') {
            score -= Math.min(4, oracleFailed * 2);
            issues.push({ level: 'warn', key: 'engine.oracle', detail: oracleFailed + ' 次剧情参谋生成失败（原因：' + oracleLastReason + '）——弧线只能手写节拍' });
          }
        }
      } catch (e) { markDegraded('oracle', e); }
      // ── 15. 事件总线死信号（v2.1.0）──
      //   广播出去无人接收 = 世界推进的痕迹丢失（曾有 9 个死事件长期存在且完全不可见）。
      //   计分门控：只在实际挂载 UI 的运行时计分——测试/无头环境不加载面板，
      //   否则会把「环境没装 UI」当成故障扣分（污染基线）。
      let busDead = 0, busDeadEvents = [];
      try {
        if (WA.ui && WA.ui.mounted === true && typeof WA.busStats === 'function') {
          const bs = WA.busStats(999);
          const rows = (bs && bs.events) || [];
          // 口径：「曾经无人接」不算病——dead 是累计计数，扩展加载期（UI 未挂载）的广播会被永久计入；
          //   真正的病是「现在仍然无人接」（dead>0 且 listeners===0）——否则挂载后永久误报。
          busDeadEvents = rows.filter(function (r) { return (r.dead || 0) > 0 && (r.listeners || 0) === 0; }).map(function (r) { return r.event + '(' + r.dead + ')'; });
          busDead = busDeadEvents.length;
          if (busDead > 0) {
            score -= Math.min(6, busDead * 2);
            issues.push({ level: 'warn', key: 'bus.dead', detail: busDead + ' 个事件只广播无接收（状态变了界面/引擎都不知情）：' + busDeadEvents.slice(0, 4).join('、') + (busDead > 4 ? ' 等' : '') });
          }
        }
      } catch (e) { markDegraded('busStats', e); }
      // ── 16. 工作流节点失败（v2.1.0）──
      //   非 critical 节点失败不中断链（设计如此），但此前**巡视完全看不见**：
      //   世界推演/记忆巩固/演化等节点静默失败时，健康分照样满分。
      //   口径：只对「本轮新增」失败扣分（存量不追溯——沿用 v1.9.0 原则，防历史失败永久挂红）。
      let wfNewFails = 0, wfFailNodes = [], wfFailSample = null;
      try {
        if (WA.workflow && typeof WA.workflow.fails === 'function') {
          // v2.1.0: 首轮（-1）只建立基线不追溯；此后只算「上一轮之后新增」的失败。
          const fl = (__lastPatrolSeq < 0) ? { items: [] } : WA.workflow.fails(6, __lastPatrolSeq);
          wfNewFails = (fl.items || []).length;
          wfFailNodes = Array.from(new Set((fl.items || []).map(function (f) { return f.id; })));
          wfFailSample = (fl.items && fl.items[0]) || null;
          if (wfNewFails > 0) {
            score -= Math.min(8, wfNewFails * 3);
            const who = (fl.items || []).slice(0, 3).map(function (f) { return f.label + '（' + f.msg.slice(0, 40) + '）'; }).join('；');
            issues.push({ level: 'warn', key: 'engine.workflow', detail: '本轮 ' + wfNewFails + ' 次工作流节点失败（单节点失败不中断链，但该环节本轮未生效）：' + who });
            actions.push({ id: 'review-workflow-fail', safe: false, detail: '面板「日志」页查看失败留痕，或「概览」关闭该节点' });
          }
        }
      } catch (e) { markDegraded('workflowFails', e); }
      // ── 17. 宿主兼容层（v2.2.0）──
      //   背景：compatMvu.sync / compatTH.expose 在 v2.0.0 才被 init 激活，但「桥是否真的接上」
      //        仍无巡视可见性——MVU 没同步、TH 桥没暴露，健康分照样满分。
      //   计分口径（关键）：只对**真故障**扣分。宿主未启用 MVU（mvu-not-enabled）或未跑在
      //        TH 沙箱（非 TH 环境）属环境差异，不是扩展的缺陷——与「环境差异不得当故障扣分」
      //        （v1.9.0 原则、块4 的 WA.ui.mounted 门控）保持一致，否则每台机器基线都被压低。
      let compatMvuActive = null, compatThActive = null, compatMvuReason = null, compatThReason = null, compatFails = 0;
      try {
        if (WA.compatMvu && typeof WA.compatMvu.status === 'function') {
          const ms = WA.compatMvu.status();
          compatMvuActive = !!ms.active; compatMvuReason = ms.lastReason || null;
          if (String(compatMvuReason || '').indexOf('error:') === 0) {
            compatFails++;
            issues.push({ level: 'error', key: 'engine.compat', detail: 'MVU 兼容层异常：' + compatMvuReason + '——世界状态不再镜像进 stat_data' });
          }
        }
        if (WA.compatTH && typeof WA.compatTH.status === 'function') {
          const ts = WA.compatTH.status();
          compatThActive = !!ts.active; compatThReason = ts.lastReason || null;
          if (String(compatThReason || '').indexOf('error:') === 0) {
            compatFails++;
            issues.push({ level: 'error', key: 'engine.compat', detail: 'TH 桥接异常：' + compatThReason + '——TH 脚本/正则读不到世界状态快照' });
          }
        }
        if (compatFails > 0) {
          score -= Math.min(6, compatFails * 3);
          actions.push({ id: 'review-compat', safe: false, detail: '面板「工具」→「宿主兼容层」查看激活原因与同步计数' });
        }
      } catch (e) { markDegraded('compat', e); }
      // ── 18. 人物档案覆盖率（v2.2.0）──
      //   背景：registry.setProfile 是唯一人设写入 API 却全库零调用，用户无从建档，
      //        独白/观测子agent 的「性格锚点」永远显示「未建立」而无人知晓。
      //   计分口径：不扣分——「不建档」是用户的合法选择（纯剧情流也可能不需要档案），
      //        这里只把「注册了 NPC 却零档案」这一可用性缺口报成 info 可行动信号。
      let profRegistered = 0, profWith = 0, profEntries = 0;
      try {
        if (WA.registry && typeof WA.registry.profileStat === 'function') {
          const ps = WA.registry.profileStat();
          profRegistered = ps.registered || 0; profWith = ps.withProfile || 0; profEntries = ps.entries || 0;
          if (profRegistered > 0 && profWith === 0) {
            issues.push({ level: 'info', key: 'actors.profile', detail: '已注册 ' + profRegistered + ' 个 NPC 但档案全空——独白/观测子agent 的性格锚点将退化为「未建立」，推演缺少人设约束' });
            actions.push({ id: 'edit-npc-profile', safe: false, detail: '面板「人物」页点某人「档案」录入性格/观念/家庭/关系/经历（供推演作为认知边界）' });
          } else if (profRegistered > 0) {
            issues.push({ level: 'info', key: 'actors.profile', detail: profWith + '/' + profRegistered + ' 个 NPC 已建档（共 ' + profEntries + ' 条档案条目）' });
          }
        }
      } catch (e) { markDegraded('actorsProfile', e); }
      // ── 19. 设置键卫生（v2.2.0）──
      //   背景：settingsBus.pendingOrphan / store.orphanSettingsKeys 零消费——模块自己声明废弃的
      //        幽灵设置键既不可见也不可清；隔离处置史（quarantineAudit）同样没有出口。
      //   计分口径：不扣分（幽灵键是历史残留、不占运行成本），报 info 并给出清理入口。
      let orphanKeys = [], quarantineRestores = 0, quarantineDrops = 0;
      let sbIncoherent = 0, sbDormant = 0;
      let evictsN = 0, evictFailedN = 0, evictSitesN = 0;   // v2.13.0: 挤出侧三计量
      let randDrawsN = 0, randFailedN = 0, randReproducible = false;   // v2.14.0: 随机源三计量
      // v2.15.0: 时间源三计量（与上面完全并列——可复现性的两个输入各占一组）
      let clockNowCallsN = 0, clockFailedN = 0, clockReproducible = false;
      try {
        if (typeof this.orphanSettingsKeys === 'function') orphanKeys = this.orphanSettingsKeys() || [];
        // v2.3.0: 登记表自洽性与休眠登记——只采集不产议题（同 orphan 口径：
        //   自洽问题只在登记表被改坏时出现，休眠登记是「声明废弃但从未落盘」的正常状态，
        //   二者对普通用户都不是可行动项，报议题会造成告警疲劳）
        try {
          if (WA.settingsBus && typeof WA.settingsBus.selfCheck === 'function') {
            sbIncoherent = (WA.settingsBus.selfCheck().issues || []).length;
          }
          if (WA.settingsBus && typeof WA.settingsBus.dormantGhosts === 'function') {
            sbDormant = (WA.settingsBus.dormantGhosts() || []).length;
          }
        } catch (eSb) {}
        if (typeof this.quarantineAudit === 'function') {
          const qa = this.quarantineAudit();
          quarantineRestores = qa.restores || 0; quarantineDrops = qa.drops || 0;
        }
        //   口径（关键）：这里**只采集、不产议题**。orphan 候选的含义是「orphan:true 且键尚未落盘」，
        //   而 preset/oracle 两处内置注册天然满足该条件（用户还没建自定义预设/还没设弧线）——
        //   把它报成议题会让每个新库永久挂一条不可消除的 info（告警疲劳，且非用户可行动项）。
        //   可见性改由按需路径承担：面板「工具」→「设置键」与诊断 runtime.settingsBus / verdict。
        //   隔离处置史同理：一旦处置过一次就永久 >0，属历史事实而非当前缺陷。
      } catch (e) { markDegraded('settingsHygiene', e); }
      // ── 9.5 挤出侧（v2.13.0）──
      //   为什么健康分要看它：挤出是本仓库唯一「按设计把数据丢掉」的路径，
      //   而它此前零计量——长局跑了 200 轮之后 NPC 只剩 48 个、伏笔被终态条目挤掉，
      //   面板/诊断/健康分上都没有出口，用户只能凭记忆发现「少了谁」。
      //   分级口径与写侧/删侧一致：**失败**是缺陷（未知站点/参数非法＝代码问题）报 error；
      //   正常挤出是设计行为，只报 info 并点名最近被丢的是谁。
      try {
        const es = (WA.evict && typeof WA.evict.evictStat === 'function') ? WA.evict.evictStat() : null;
        if (es) {
          evictsN = es.evicts; evictFailedN = es.evictFailed; evictSitesN = es.sites;
          if (es.evictFailed > 0) {
            score -= 6;
            issues.push({ level: 'error', key: 'evict.failed', detail: '挤出侧有 ' + es.evictFailed + ' 次失败（' + JSON.stringify(es.failedBy) + '）：未知站点/参数非法＝代码缺陷，数据未被截断而是继续超限增长——最近：' + ((es.lastFail || {}).site || '?') + '/' + ((es.lastFail || {}).reason || '?') });
            actions.push({ id: 'review-evict-fail', safe: false, detail: '面板「诊断」查看挤出失败明细（须改代码或补站点登记，不是清存储能解决的）' });
          } else if (es.evicts > 0) {
            const top = Object.keys(es.bySite).sort(function (a, b) { return es.bySite[b].dropped - es.bySite[a].dropped; })[0];
            // v2.13.0（端到端审计自纠）：取**该站点自己的**丢弃物摘要，而不是全局最近几条。
            //   全局环形 12 条在多站点场景下会被后发生的站点冲掉，于是「最频繁的那个站点
            //   到底丢了谁」反而看不到（实测：people 丢 32 人，报表里只剩「伏笔18、伏笔19」）。
            const topWhat = ((es.bySite || {})[top] || {}).lastWhat || [];
            const what = topWhat.slice(-2).join('、') || (es.lastDropped || []).slice(-2).map(function (x) { return x.what; }).join('、');
            issues.push({ level: 'info', key: 'evict', detail: '本轮已发生 ' + es.evicts + ' 次容量挤出，共丢弃 ' + es.evicted + ' 项（最频繁：' + (top || '?') + '，其最近丢弃：' + (what || '—') + '）——这是设计内的有界收纳，但「丢了什么」应当可见' });
          }
        }
      } catch (eEv) { markDegraded('evict', eEv); }
      let bridgePublishesN = 0, bridgeFailuresN = 0, bridgeExternalReadsN = 0, bridgeEnabledN = false; // v2.16.0: 对外桥
      // v2.17.0: 记忆桥消费面——上面那组信号答的是「我发得出去吗」，这组答「我读得进来吗」。
      //   两者是同一套互操作的两条边：只有发文没有读入，说明这个扩展只把世界摆在门口，
      //   却不看另一个插件记的那本账，「两个钟对不上」就永远没人发现。
      let lonshaAvailableN = false, lonshaVerdictN = '', lonshaDaysN = null;
      // [v2.18.0] 反向消费面扩到九本账：账本画像 + 对读面（环有没有被认出来 / 三本账可比几处 / 差集多大）
      let lonshaLedgersN = 0, lonshaAbsentLedgersN = 0, lonshaEchoPresentN = false;
      let lonshaBridgesComparableN = 0, lonshaBridgeDriftN = 0, lonshaBridgeConflictN = 0;
      // ── 9.6 随机源（v2.14.0）──
      //   为什么健康分要看随机源：它本身不是「世界坏了」，但它决定**其余所有体检结论能不能被复核**。
      //   v2.13.0 让「长局里丢的是谁」可见，而丢的那个「谁」正是随机采样挑中的——
      //   同一存档重放一次被挤出的就是另一批人，于是「我修好了吗」在原理上无法回答。
      //   分级：参数非法（非法种子被静默接受会让复现结论本身不可信）＝缺陷，报 error；
      //   未显式播种＝正常默认态，只报 info（它是「结果不可复核」的**根因说明**，不是故障）。
      try {
        const rs = (WA.rand && typeof WA.rand.randStat === 'function') ? WA.rand.randStat() : null;
        if (rs) {
          randDrawsN = rs.draws; randFailedN = rs.failed; randReproducible = !!rs.reproducible;
          if (rs.failed > 0) {
            score -= 6;
            issues.push({ level: 'error', key: 'rand.failed', detail: '随机源有 ' + rs.failed + ' 次参数非法（' + JSON.stringify(rs.failedBy) + '）：非法种子/区间未被静默接受（已归因并退回默认），但调用点是缺陷——若非法的是种子，「已复现」的结论不可信' });
          } else if (rs.draws > 0 && !rs.reproducible) {
            issues.push({ level: 'info', key: 'rand', detail: '本会话 ' + rs.draws + ' 次决策抽取来自**自动种子**（' + rs.channels + ' 个通道，最近：' + (rs.lastChannel || '?') + '）——「同样操作两次结果不同」是随机源头没定，不是引擎不稳定；要复现执行 `WA.rand.seed(<数字>)`' });
          }
        }
      } catch (eRd) { markDegraded('rand', eRd); }
      // ── 9.7 时间源（v2.15.0）──
      //   为什么健康分要看时间源：v2.14.0 把随机源收成单一出口，于是「掷骰」这一半可复现了，
      //   而可复现性要两个输入同时确定——第二个输入（时间）在此前一格未管。
      //   后果不是「世界坏了」，而是**其余所有体检结论都不能被复核**：
      //   同一份存档 + 同一个种子重放，写进磁盘的每一个时间戳仍然不同。
      //   分级与随机源同口径：参数非法（非法冻结时刻被静默接受）＝缺陷，报 error；
      //   未冻结＝正常默认态（跟墙钟走），只报 info——它是「明明播了种还是对不上」的根因说明。
      try {
        const ck = (WA.clock && typeof WA.clock.clockStat === 'function') ? WA.clock.clockStat() : null;
        if (ck) {
          clockNowCallsN = ck.nowCalls; clockFailedN = ck.failed; clockReproducible = !!ck.reproducible;
          if (ck.failed > 0) {
            score -= 6;
            issues.push({ level: 'error', key: 'clock.failed', detail: '时间源有 ' + ck.failed + ' 次参数非法（' + JSON.stringify(ck.failedBy) + '）：非法冻结时刻/步长未被静默接受（已归因并退回默认），但调用点是缺陷——若非法的是冻结时刻，「已冻结」的结论不可信，本轮复现结论同样不可信' });
          } else if (ck.nowCalls > 0 && !ck.reproducible) {
            issues.push({ level: 'info', key: 'clock', detail: '本会话 ' + ck.nowCalls + ' 次决策时间读取来自**墙钟**（' + ck.sites + ' 个站点，最近：' + (ck.lastSite || '?') + '）——「同样的种子两次跑出来的存档还是不一样」根因在此：随机源定了，时刻没定；要复现执行 `WA.clock.freeze(<时刻戳>)`' });
          }
        }
      } catch (eCk) { markDegraded('clock', eCk); }
      // ── 9.8 对外只读互操作桥（v2.16.0）──
      //   为什么健康分要看对外桥：本扩展此前全库零对外引用，是这套三插件里**唯一没有出口**的一个。
      //   于是「另两个插件看到的世界」与「真正的世界状态」是不是同一份，没有任何地方答得上来。
      //   分级与随机源/时间源同型——「休眠」是设计内默认态（info），「开闸却发不出去」才是缺陷：
      //     · 发布失败 > 0 ⇒ error（外部拿到 null 且不知道原因＝静默降级）；
      //     · 开闸但零发布 ⇒ warn（开关在，活儿没干）；
      //     · 闸关着外面却在一遍遍读 ⇒ warn（对方拿到的永远是 null，看起来像「世界是空的」）。
      try {
        const bd = (WA.bridge && typeof WA.bridge.stat === 'function') ? WA.bridge.stat() : null;
        if (bd) {
          bridgePublishesN = bd.publishes; bridgeFailuresN = bd.failures;
          bridgeExternalReadsN = bd.externalReads; bridgeEnabledN = (WA.bridge.settings() || {}).enabled === true;
          if (bd.failures > 0) {
            score -= 5;
            issues.push({ level: 'error', key: 'bridge.failed', detail: '对外桥有 ' + bd.failures + ' 次发布失败（最近：' + ((bd.lastFailure || {}).reason || '?') + '）：外部侧拿到的是 null 且分不清「世界是空的」与「投影坏了」——占位失败会静默持续' });
          } else if (bridgeEnabledN && bd.publishes === 0) {
            score -= 3;
            issues.push({ level: 'warn', key: 'bridge', detail: '对外桥已开闸（' + bd.refreshes + ' 次刷新请求）却一次也没发布——开关开着没在干活' });
          } else if (!bridgeEnabledN && bd.externalReads > 0) {
            score -= 3;
            issues.push({ level: 'warn', key: 'bridge', detail: '对外桥休眠但已被外部读取 ' + bd.externalReads + ' 次：对方拿到的永远是 null，看起来像「这个世界没有任何世界状态」（开闸：WA.bridge.setSettings({ enabled: true })）' });
          } else if (!bridgeEnabledN) {
            issues.push({ level: 'info', key: 'bridge', detail: '对外桥休眠（默认）：RubyPhone 世界脉搏/TimeManager 与 LonSha 世界推进此刻各自描述世界——不是故障，但「两边对不上」的根因在此' });
          } else if (bd.publishes > 0) {
            issues.push({ level: 'info', key: 'bridge', detail: '对外桥已发布 ' + bd.publishes + ' 次快照（' + (bd.snapshotBytes || 0) + ' 字节，floor=' + bd.publishedFloor + '，外部读取 ' + bd.externalReads + ' 次，作废 ' + bd.invalidations + ' 次）' });
          }
        }
      } catch (eBd) { markDegraded('bridge', eBd); }
      // ── 9.9 记忆桥消费面（v2.17.0 → v2.18.0 扩到九本账）──
      //   与 9.8 是同一套互操作的两条边。分级：读不到＝info（对方未装是常见合法配置，
      //   且 reason 已可归因，不必扣分）；两钟不一致＝info（不是故障——正文校准的钟与
      //   推演钟本来就各自演化，但它必须可见，否则「两边对不上」永远只是用户的感觉）。
      try {
        if (WA.lonshaReader && typeof WA.lonshaReader.readLonshaSnapshot === 'function') {
          const lrd = WA.lonshaReader.readLonshaSnapshot({ refresh: false });
          lonshaAvailableN = !!lrd.ok;
          if (lrd.ok) {
            const ldf = WA.lonshaReader.diffWithLonsha(lrd.snapshot);
            lonshaVerdictN = ldf.verdict; lonshaDaysN = ldf.days;
            if (ldf.verdict === 'world-ahead' || ldf.verdict === 'world-behind') {
              issues.push({ level: 'info', key: 'lonsha.drift', detail: '记忆桥对账：两个钟相差 ' + ldf.days + ' 天（本扩展 ' + (ldf.worldDate || '?') + ' vs LonSha ' + (ldf.lonshaDate || '?') + '）——不是故障，是此前根本看不见的事实' });
            } else if (ldf.verdict === 'lonsha-empty') {
              issues.push({ level: 'info', key: 'lonsha', detail: '记忆桥已就绪，但对方尚未记录时间（等它即可，与本扩展的无公历钟是两件事）' });
            }
            // [v2.18.0] 反向消费面扩到九本账 + **环归因**：本侧真正吃进来的是三类读数——
            //   ① 对方给了几本账：`ledgers` 三态画像 + **上游键集自证**（`echoShape.missing` 非空
            //      即说明本侧读了一个上游并不外供的键；那种缺陷在真实联调下恒为 absent，
            //      却能靠手工夹具喂绿——正是「测试绿而生产不工作」）；
            //   ② 环：`worldLedgerRead` 是对方**读本扩展**所得的投影，`kind='echo'`，
            //      不是「对方的世界」——必须可见，否则会被当外部事实引用；
            //   ③ 三处对读面：**透传**对方已算好的差集结论（本侧不自算，自算等于拿投影跟自己对账），
            //      不可比时一律 0，绝不出现假的「我这边多出来 N 项」。
            try {
              const lsum = WA.lonshaReader.ledgerSummary(lrd.snapshot);
              lonshaLedgersN = lsum.total; lonshaAbsentLedgersN = lsum.absentList.length;
              lonshaEchoPresentN = !!lsum.echoPresent;
              if (lsum.absentList.length) {
                issues.push({ level: 'info', key: 'lonsha.ledgers',
                  detail: '记忆桥：对方未外供 ' + lsum.absentList.length + ' 本账（' + lsum.absentList.join('/') + '）——'
                    + '「没外供」与「显式为空」是两件事：前者本侧应降级，后者照常推演' });
              }
              const lb = WA.lonshaReader.ledgerBridges(lrd.snapshot);
              if (lsum.echoPresent) {
                issues.push({ level: 'info', key: 'lonsha.echo',
                  detail: '对方外供了对读读数（' + WA.lonshaReader.ECHO_SECTION + '）——它反映的是**对方眼里的本扩展**，'
                    + '不是「对方的世界」；引用前须认得这是环（kind=echo），别拿自己的投影当外部事实' });
                // 上游键集自证：本侧**认**的键里，哪些上游其实没给（真缺陷）；上游给了哪些本侧还没读（漏读）。
                const esh = lb.echoShape || {};
                if (esh.missing && esh.missing.length) {
                  issues.push({ level: 'warn', key: 'lonsha.echoKeys',
                    detail: '对读读数：本侧读了上游并不外供的键 ' + esh.missing.join('/')
                      + '——真实联调下这几处读数恒为空（测试夹具喂绿也改不了这一点）' });
                }
                if (esh.unknown && esh.unknown.length) {
                  issues.push({ level: 'info', key: 'lonsha.echoNew',
                    detail: '对读读数：上游多给了 ' + esh.unknown.length + ' 个本侧尚未消费的键（' + esh.unknown.join('/') + '）' });
                }
              }
              const cmpB = lb.items.filter(function (x) { return x.comparable; });
              lonshaBridgesComparableN = cmpB.length;
              lonshaBridgeDriftN = cmpB.reduce(function (a, x) { return a + (x.worldOnlyTotal || 0) + (x.localOnlyTotal || 0); }, 0);
              lonshaBridgeConflictN = lb.items.reduce(function (a, x) { return a + (x.conflicts || 0); }, 0);
              if (lonshaBridgeDriftN > 0) {
                issues.push({ level: 'info', key: 'lonsha.bridgeDrift',
                  detail: '两本账对不上：对读面 ' + cmpB.length + '/3 可比，差集共 ' + lonshaBridgeDriftN
                    + ' 项（明细由**对方**算出，本侧透传不重算）——只报差集，不合并、不覆盖' });
              }
              if (lonshaBridgeConflictN > 0) {
                issues.push({ level: 'info', key: 'lonsha.bridgeConflict',
                  detail: '对读面检出 ' + lonshaBridgeConflictN + ' 处**位置冲突**（两侧都记了、记的不一样）——'
                    + '「一边没记」（one-sided）不算冲突，本侧不把两者混报' });
              }
              if (cmpB.length === 0 && lb.items.length) {
                issues.push({ level: 'info', key: 'lonsha.bridgeUncomparable',
                  detail: '对读面 3 处**全部不可比**——对方未外供对读读数，或本侧 store 尚无对应账本；'
                    + '此时不得报「差集为 0」（那会被误读成「两边一致」）' });
              }
            } catch (eLb) { markDegraded('lonsha.ledgers', eLb); }
          } else {
            lonshaVerdictN = lrd.reason;
          }
        }
      } catch (eLs2) { markDegraded('lonsha', eLs2); }
      // ── 10. 巡视自身完整性（v2.0.0）──
      //   采集节静默失败会让 signals 归零、健康分假绿——「体检没做」与「体检健康」必须可区分。
      let degradedN = 0;
      try {
        degradedN = __maintainDegraded.sections.length;
        if (degradedN > 0) {
          const names = __maintainDegraded.sections.map(function (x) { return x.section; });
          score -= Math.min(20, degradedN * 6);
          issues.push({ level: 'error', key: 'patrol.degraded', detail: degradedN + ' 个巡视采集节异常（' + names.join('、') + '）——本轮健康分不完整，对应信号已归零，不能据此判定世界健康' });
          actions.push({ id: 'review-degraded', safe: false, detail: '面板「诊断」查看生成器异常明细（采集节抛错通常意味着上游数据损坏）' });
          // v2.0.0 fix: 降级轮分数封顶——采集节失败会把该节 signals 归零，连带抹掉它本应产生的扣分
          // （曾出现「降级只扣 12，却抹掉 8 分 diag warn，净 Δ 仅 4」）。若被抹掉的是更大额扣分，
          // 分数会不降反升——巡视坏了反而更「健康」。故有降级时不得报 ok 档（≥90）。
          score = Math.min(score, 89);   // 封顶 89：保留降级分级粒度
        }
      } catch (e) { /* 台账读取失败不阻断 */ }
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
          // v2.9.0: 受控删除 + 只对**真的删掉**的键计数。此前 `removed++` 在裸调用之后无条件执行，
          //   删除失败也计入 removed / freedBytes → 巡视报「已自动释放 N KB」而实际一个字节没释放，
          //   用户按提示继续清理却永远清不出空间（与 v2.6.0 修掉的「writes 计尝试而非成功」同型）。
          const rr = removeVerified(r.key);
          if (rr.ok && rr.removed) { removed++; freed += (r.bytes || 0); }
        });
        applied = { removed: removed, freedBytes: freed };
        __maintainStat.autoApplies++; __maintainStat.lastAutoFreedKeys = removed; __maintainStat.lastAutoFreedBytes = freed;
      }
      __maintainStat.lastScore = score; __maintainStat.lastLevel = level;
      // v2.1.0: 游标推进到当前台账序号（下一轮的 since）。台账缺失时保持不动，避免误推。
      try { if (WA.workflow && typeof WA.workflow.failStats === 'function') { const _fsq = WA.workflow.failStats(); if (_fsq && typeof _fsq.seq === 'number') __lastPatrolSeq = _fsq.seq; } } catch (e) {}
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
          capacityBloat: capBloat, schemaPollution: schemaPollution,  // v1.8.0
          logicErrors: logicErrors, logicWarns: logicWarns, logicNewErrors: logicNewErrors,
          engineErrors: errTotal, engineErrorsRecent: errRecent,  // v1.9.0
          patrolDegraded: degradedN, patrolDegradedSections: __maintainDegraded.sections.map(function (x) { return x.section; }),  // v2.0.0
          moduleDeclared: modDeclared, moduleLoaded: modLoaded, moduleFailed: modFailed, moduleMissing: modMissing,  // v2.0.0
          moduleFailedList: modFailedList.slice(0, 12),
          contractErrors: contractErrors, contractWarns: contractWarns,  // v2.0.0
          samplerOk: samplerOk, samplerPass: samplerPass, samplerTotal: samplerTotal, purifierBadRules: purifierBad, selfCheckRan: selfCheckRan,
          purifyRuns: purifyRuns, purifyChanged: purifyChanged, purifyRuleErrors: purifyRuleErrors,  // v2.1.0
          calendarAuto: calendarAuto, calendarAdvances: calendarAdvances, calendarRuns: calendarRuns,  // v2.1.0
          oracleGenerated: oracleGenerated, oracleFailed: oracleFailed,  // v2.1.0
          busDead: busDead, busDeadEvents: busDeadEvents.slice(0, 8),  // v2.1.0
          wfNewFails: wfNewFails, wfFailNodes: wfFailNodes.slice(0, 6), wfFailSample: wfFailSample,  // v2.1.0
          compatMvuActive: compatMvuActive, compatThActive: compatThActive,  // v2.2.0
          compatMvuReason: compatMvuReason, compatThReason: compatThReason, compatFails: compatFails,
          profRegistered: profRegistered, profWith: profWith, profEntries: profEntries,  // v2.2.0
          orphanSettings: orphanKeys.length, quarantineRestores: quarantineRestores, quarantineDrops: quarantineDrops,  // v2.2.0
          sbIncoherent: sbIncoherent, sbDormant: sbDormant,  // v2.3.0
           // v2.13.0: 挤出侧（七面治理最后一面）——evicts>0 是设计内行为，evictFailed>0 是代码缺陷
           evicts: evictsN, evictFailed: evictFailedN, evictSites: evictSitesN,
           // v2.14.0: 随机源——randDraws>0 且 randReproducible=false 说明「本轮结论不可复核」（设计内默认态），
           //   randFailed>0 才是缺陷（非法种子被静默接受会让「已复现」的结论本身不可信）。
           randDraws: randDrawsN, randFailed: randFailedN, randReproducible: randReproducible,
            // v2.15.0: 时间源——与上面并列的两半。clockNowCalls>0 且 clockReproducible=false
            //   说明「本轮存档时间戳不可复核」（设计内默认态）；clockFailed>0 才是缺陷。
            clockNowCalls: clockNowCallsN, clockFailed: clockFailedN, clockReproducible: clockReproducible,
            // v2.16.0: 对外桥——「另两个插件看到的那个世界」是不是这一份，第一次有信号。
            //   bridgePublishes>0 = 外部集成在真跑；bridgeExternalReads>0 而 bridgeEnabled=false 是**失配**
            //   （对方拿到的永远是 null），bridgeFailures>0 才是缺陷。
            bridgePublishes: bridgePublishesN, bridgeFailures: bridgeFailuresN,
            bridgeExternalReads: bridgeExternalReadsN, bridgeEnabled: bridgeEnabledN,
            // v2.17.0: 记忆桥消费面——lonshaAvailable=false 且 lonshaVerdict 为归因字符串时，
            //   说明「读不到」这件事本身是**可归因**的（未装/未就绪/契约不匹配各有其名），
            //   而不是一个无名的 null。lonshaDays 为真不一致时的天数。
            lonshaAvailable: lonshaAvailableN, lonshaVerdict: lonshaVerdictN, lonshaDays: lonshaDaysN,
            // [v2.18.0] 九本账面：对方给了几本 / 哪几本没给 / 对读面是不是环 / 三本账可比几处、差集多大、冲突几处。
            //   lonshaEchoPresent=true **不是缺陷**（对方在读我是设计如此），但必须可见——
            //   否则「对方眼里的我」会被当成「对方的世界」引用。
            lonshaLedgers: lonshaLedgersN, lonshaAbsentLedgers: lonshaAbsentLedgersN, lonshaEchoPresent: lonshaEchoPresentN,
            lonshaBridgesComparable: lonshaBridgesComparableN, lonshaBridgeDrift: lonshaBridgeDriftN,
            lonshaBridgeConflict: lonshaBridgeConflictN,
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
          let raw = '';
          try { raw = ls.getItem(k) || ''; } catch (eR) { noteStoreReadFail('conflict', k, eR); }
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
        let cur = null, curErr = null;
        try { cur = mainWin.localStorage.getItem(key); } catch (e0) { curErr = e0; }
        if (curErr) {
          // v2.10.0: 读失败此前直接冒到外层 catch，被当成通用失败原因回显；且与「键不存在」
          //   不可分辨。归因后「读不出来」与「本来就没有」分开，前者不该被当成已丢弃。
          noteStoreReadFail('conflict', key, curErr);
          return { ok: false, reason: '读取冲突现场失败（无法确认其是否存在，本次未做任何删除）：' + ((curErr && curErr.message) || curErr) };
        }
        if (cur === null) return { ok: false, reason: '键不存在' };
        // v2.9.0: 受控删除 + 复核。此前删除若静默无效会返回 ok:true（界面报「已丢弃」而键仍在，
        //   用户以为处理完了、实际冲突现场永远不会消失）。
        const r = removeVerified(key);
        if (!r.ok) return { ok: false, reason: '删除失败：' + r.reason };
        return { ok: true, removed: r.removed };
      } catch (e) { noteStoreReadFail('conflict', key, e); return { ok: false, reason: String((e && e.message) || e) }; }
    },
    /** v0.5.0: 提取冲突现场全文（离机备份用） */
    exportConflict(key) {
      try {
        if (typeof key !== 'string' || key.indexOf('worldaxis_conflict_') !== 0) return { ok: false, reason: '非冲突现场键' };
        let raw = null, rawErr = null;
        try { raw = mainWin.localStorage.getItem(key); } catch (e0) { rawErr = e0; }
        if (rawErr) {
          // v2.10.0: 导出（离机备份）是用户处理冲突的最后手段——读失败必须与「键不存在」分开。
          noteStoreReadFail('conflict', key, rawErr);
          return { ok: false, reason: '读取冲突现场失败（导出未完成）：' + ((rawErr && rawErr.message) || rawErr) };
        }
        if (raw === null) return { ok: false, reason: '键不存在' };
        let st = null, parseable = false;
        try { st = JSON.parse(raw); parseable = true; } catch (e) {}
        return { ok: true, worldaxis: true, kind: 'conflict-site', key: key, exportedAt: new Date().toISOString(), bytes: byteLen(raw), parseable: parseable, raw: raw, state: st };
      } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
    },
    /** v0.4.0: 巡视计量视图（面板/报告消费） */
    maintainStat() { const m = __maintainStat; const w = __faultWatch; return { scans: m.scans, lastAt: m.lastAt, lastScore: m.lastScore, lastLevel: m.lastLevel, autoApplies: m.autoApplies, lastAutoFreedKeys: m.lastAutoFreedKeys, lastAutoFreedBytes: m.lastAutoFreedBytes, patrol: { degraded: __maintainDegraded.total, lastSections: __maintainDegraded.sections.map(function (x) { return x.section; }) }, modules: { declared: (Array.isArray(WA.__loadOrder) ? WA.__loadOrder.length : 0), registered: Object.keys(WA.modules || {}).length, failed: (Array.isArray(WA.__loadFailed) ? WA.__loadFailed.length : 0) }, faultWatch: { total: w.total, recent: w.recent, recentCodes: w.recentCodes.slice(0, 5), logicErrors: w.logicErrors, logicWarns: w.logicWarns, logicNewErrors: w.logicNewErrors, scansWithFault: w.scansWithFault } }; },
    /**
     * v0.4.0: 完整性审计视图（只读）——writes 为写后校验次数，mismatches>0 说明本会话出现过静默写入失败
     */
    integrityStat() {
      const i = __integrityStat;
      return { writes: i.writes, verified: i.verified, mismatches: i.mismatches, retried: i.retried, recoveredByRetry: i.recoveredByRetry, lastAt: i.lastAt, lastReason: i.lastReason, lastOk: i.lastOk, lastFailAt: i.lastFailAt };
    },
    /**
     * v2.9.0: 删除侧完整性视图（只读）——integrityStat 的删除侧对偶。
     *   attempts 为受控删除调用次数；removed 为**真的删掉了**的次数；staged 为
     *   「removeItem 没抛错但键仍在」的静默无效次数（删除侧最危险形态）。
     */
    removeStat() {
      const r = __removeStat;
      return { attempts: r.attempts, removed: r.removed, failed: r.failed, verified: r.verified, staged: r.staged, lastKey: r.lastKey, lastAt: r.lastAt, lastReason: r.lastReason };
    },
    /**
     * v2.9.0: 受控删除（对外）——清理类调用方应走这里而非裸 removeItem。
     * @param {string} key
     * @returns {{ok:boolean, removed:boolean, reason:string|null}}
     */
    removeVerified(key) { return removeVerified(key); },
    /**
     * v0.4.0: 单聊天状态体检（只读）——解析可用性 + 结构完整度 + 体积。
     * deep:true 时额外按默认结构比对缺失字段（不修改任何数据）。
     */
    verifyState(chatId, opts) {
      const o = opts || {};
      const cid = chatId || getChatId();
      const key = 'worldaxis_state_' + cid;
      let raw = null;
      // v2.11.0: 返回的 reason 已诚实区分 read-failed / missing，但没用计量出口——
      //   「存储巡检报告『所有聊天存档可解析』」这句话的可信度取决于读没读到，必须可见。
      try { raw = mainWin.localStorage.getItem(key); }
      catch (e) { noteStoreReadFail('verifyState', key, e); return { chat: cid, exists: false, ok: false, reason: 'read-failed' }; }
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
    /** v2.30.0: 镜像回落视图（本次世界从哪来 / 是否分支继承 / 写回是否成功） */
    mirrorStat() {
      return { hits: __loadStat.mirrorHits, misses: __loadStat.mirrorMisses, errors: __loadStat.mirrorErrors,
        last: __lastMirror ? JSON.parse(JSON.stringify(__lastMirror)) : null,
        branchParent: branchParentId() };
    },
    /**
     * v2.30.0: 手动补救入口（对齐 ref_app branch-rescue-tool 的产品意图：用户主动把镜像里的世界装回来）。
     * 与自动回落的分工：自动回落**只在本地键为空时**动手（绝不覆盖活世界）；本入口**无视本地键存在与否**
     * 作出裁决，故必须由用户显式调用。返回体如实区分「没有镜像」「读不出来」「解析不了」「写不回」。
     * @param {string} [chatId]
     * @returns {{ok:boolean, reason?:string, bytes?:number, fromChatId?:string|null, inherited?:boolean}}
     */
    rescueFromMirror(chatId) {
      const cid = chatId || getChatId();
      const m = readChatMirror();
      if (m.err) return { ok: false, reason: '镜像读取失败（无法判定有没有）：' + String((m.err && m.err.message) || m.err) };
      if (m.absent) return { ok: false, reason: '聊天镜像里没有可恢复的存档' };
      let st = null;
      try { st = JSON.parse(m.raw); }
      catch (pe) {
        const qk = quarantineMirror(cid, m.raw);
        return { ok: false, reason: '镜像内容解析失败（原文已隔离到 ' + (qk || '（隔离失败）') + '）：' + String((pe && pe.message) || pe) };
      }
      const w = writeVerified(storageKey(cid), m.raw);
      if (!w || !w.ok) return { ok: false, reason: '写回失败：' + ((w && w.reason) || 'unknown') };
      const live = m.live || {};
      const from = live.chatId || null;
      __lastMirror = { at: clockWall(), chatId: cid, fromChatId: from, inherited: !!(from && from !== cid),
        branchParent: branchParentId(), rev: (typeof live.rev === 'number') ? live.rev : null,
        bytes: byteLen(m.raw), writtenBack: true, writeReason: null, manual: true };
      __loadStat.lastMirror = __lastMirror;
      memCache = st;
      return { ok: true, bytes: byteLen(m.raw), fromChatId: from, inherited: !!(from && from !== cid) };
    },
    loadStat() { return { loads: __loadStat.loads, hits: __loadStat.hits, misses: __loadStat.misses, errors: __loadStat.errors, healed: __loadStat.healed || 0, shapeConflicts: __loadStat.shapeConflicts || 0, lastFix: { filled: (__loadStat.lastFix && __loadStat.lastFix.filled) || 0, conflicts: (__loadStat.lastFix && __loadStat.lastFix.conflicts) || 0, at: (__loadStat.lastFix && __loadStat.lastFix.at) || 0 }, migrated: __migrateReport ? { from: __migrateReport.from, to: __migrateReport.to, steps: __migrateReport.steps, failed: (__migrateReport.failed || []).length, at: __migrateReport.at } : null,
      // v2.30.0: 镜像回落三计数同域可见——「本地 miss 但镜像救回」此前在诊断上全无痕迹
      mirrorHits: __loadStat.mirrorHits, mirrorMisses: __loadStat.mirrorMisses, mirrorErrors: __loadStat.mirrorErrors,
      lastError: __loadStat.lastError, lastAt: __loadStat.lastAt }; },
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
      const concl = deriveAuditRows(arrays, minBytes, o.bloatBytes);
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
        drifted: concl.drifted,
        bloat: concl.bloat
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
      const concl = deriveAuditRows(rows, minBytes, o.bloatBytes);   // v0.1.48: 与 sizeAudit 同一派生实现
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
        drifted: concl.drifted,
        bloat: concl.bloat
      };
    },
    get() { return memCache; },

    // 事务式更新：传入修改函数，成功才持久化（失败不留半份状态）
    transact(mutator, opts) {
      // v0.1.30: 事务计量——每轮生成触发多少次 transact、耗时多少（排查链式落盘）
      const t0 = clockWall();
      // v0.1.33: 嵌套事务——内层 mutator 直接在最外层 draft 上修改，提交延迟到最外层统一 save。
      // 修复：外层 save(draft) 用外层开始时的旧快照整体覆盖内层已提交改动
      // （backstage.applyResult → horizon.acceptResult/digest.generate 链路的静默丢失）
      if (__tx.length) {
        const outer = __tx[__tx.length - 1];
        let result;
        try { result = mutator(outer); }
        catch (e) { recTx(clockWall() - t0, 'error'); WA.log('error', 'store.transact嵌套修改异常（外层事务继续）', e); return { ok: false, error: e }; }
        if (result === false) { recTx(clockWall() - t0, 'aborted'); return { ok: false, aborted: true, deferred: true }; }
        // v0.1.34: 嵌套事务纳入计量（deferred=随外层提交的内层数）
        recTx(clockWall() - t0, 'ok-deferred');
        return { ok: true, deferred: true, state: outer, result };
      }
      const draft = cloneDraft(memCache);
      __tx.push(draft);
      let result, ret;
      try { result = mutator(draft); }
      catch (e) { __tx.pop(); recTx(clockWall() - t0, 'error'); WA.log('error', 'store.transact修改异常，未提交', e); return { ok: false, error: e }; }
      if (result === false) { __tx.pop(); recTx(clockWall() - t0, 'aborted'); return { ok: false, aborted: true }; }
      // v0.1.31: 批作用域内只推进内存，落盘延迟到批退出（写合并）
      if (__batch.depth > 0 && __batch.orphaned) {
        // v0.1.35: 跨纪元僵尸批——不执行 mutator（防旧轮逻辑改写新聊天状态）
        __tx.pop();
        recTx(clockWall() - t0, 'aborted');
        return { ok: false, aborted: true, stale: true };
      }
      if (__batch.depth > 0) {
        memCache = draft; __batch.dirty = true;
        recTx(clockWall() - t0, 'ok-batched');
        ret = { ok: true, persisted: null, batched: true, state: draft, result };
      } else {
        const saved = this.save(draft);
        recTx(clockWall() - t0, saved ? 'ok' : 'save-failed');
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
        let list = [];
        try {
          const rawList = mainWin.localStorage.getItem(key);
          if (rawList === null || rawList === undefined) list = [];
          else {
            const parsedList = JSON.parse(rawList);
            if (!Array.isArray(parsedList)) throw new Error('recovery-list-not-array（现有恢复点清单不是数组）');
            list = parsedList;
          }
        } catch (eR) {
          // v2.10.0（逆向审计自纠，保命优先）: 恢复点清单读取失败时**绝不覆盖写入**。
          //   此前写法 `JSON.parse(getItem(key) || '[]')`：读到损坏字节（或读被拒）时抛错 →
          //   外层 catch 只打一条 warn → 恢复点一个都不建；紧接着的 `setItem` 会把
          //   「只有新点的数组」整份覆盖上去 ⇒ **用户全部历史恢复点被静默丢弃**，
          //   且失败路径没有任何可检索痕迹。读不到就不写，并如实归因。
          noteStoreReadFail('recovery', key, eR);
          WA.log('error', '创建恢复点失败：现有恢复点清单读取失败，为避免覆盖丢弃全部历史恢复点，本次**不写入**（键：' + key + '）', eR);
          return null;
        }
        // v0.5.0: 记录来源实例与当时序号——多窗口并存时可辨认「这份点谁建的」
        list.unshift({
          at: clockNow('store.recovery'),
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
      catch (e) {
        // v2.10.0: 此前读失败与「确实没有恢复点」都返回空数组，用户会以为「没有历史点可
        //   恢复」而实际是读不出来（诊断里也查不到）。归因后两者可分辨。
        noteStoreReadFail('recovery', recoveryKey(chatId), e);
        return [];
      }
    },
    /**
     * v0.1.51: 存储键卫生观测（只读）——枚举 worldaxis_* 键空间，按 family/chat 分类计量。
     * diagnostic 键按其聊天活跃时间（state.meta.updatedAt）标记 stale 候选。
     */
    /**
     * v2.10.0: 存储层读侧台账（只读）——与 integrityStat（写侧）/ removeStat（删侧）三面对称。
     *   `ok` 语义：本会话**存储层读取从未失败**。读失败在本仓库有两个破坏性后果：
     *     ① 体积表偏小（容量结论不实）；② 活跃时间回落 0 = 最冷（可能诱发误回收）。
     *   故这不是「统计好看不好看」的问题，而是**结论是否可用**的问题。
     */
    readStat() {
      // v2.10.0（逆向审计自纠）: bySource 改为**全量透出**。此前只列举 bytes/activity/enumerate
      //   三个已知来源，而 noteStoreReadFail 支持动态建桶 ⇒ 本版新增的来源（diskRev / verify /
      //   recovery / quarantine / conflict / writerId）会「有归因但看不见」，等于又一处声明面空转。
      const by = {};
      try {
        const src = __readStat.bySource || {};
        Object.keys(src).forEach(function (k) { by[k] = src[k]; });
      } catch (e) {}
      return { readFailed: __readStat.readFailed, ok: __readStat.readFailed === 0,
        bySource: by, lastFail: __readStat.lastReadFail };
    },
    /**
     * v2.11.0: **跨模块读侧归因出口**——其他模块（chatcache / worldbook / workflow /
     *   render.inject / index 宿主）有自己的裸读点，它们的读失败同样只让结论悄悄失真。
     *
     * 为什么不给每个模块发一份自己的计量：本仓库反复出现的同型缺陷是「各点各写一份」
     *   （写侧漏四条、删侧被包在空 catch 里、v2.10.0 读侧 15 处漏网）。**一份实现 + 一个计量**
     *   才是台账能对账的前提。本出口就是那个「一份实现」对外的那扇门。
     *
     * 语义：永不抛（记账本身不得打断读取），且**只投放**——不改变调用方的控制流。
     *   调用方仍须自己决定「读不到就不算没有」（本版已在各点落实）。
     * @param {string} source 来源标签（chatcache / worldbook / workflow / inject / host …）
     * @param {string} key 涉及的键
     * @param {*} err 原始错误
     */
    reportReadFail(source, key, err) { noteStoreReadFail(source, key, err); return true; },
    storageStat(opts) {
      const o = opts || {};
      const maxIdleMs = (typeof o.maxIdleDays === 'number' && o.maxIdleDays >= 0 ? o.maxIdleDays : 30) * 86400000;
      const cur = getChatId();
      // v2.10.0（逆向审计自纠）: 差值基线必须在**任何读取之前**取。`listWorldAxisKeys()` 本身
      //   就是一次读取（枚举），基线若取在它之后，枚举失败会被排除在「本次盘点」口径之外——
      //   而枚举失败恰恰是最严重的失真：全部键都看不见，`totalKeys/totalBytes` 全 0，
      //   面板却照样报出一份「存储很干净」的结论；消费端拿到的 `readFailedKeys` 也不含它。
      //   口径不一致（主计数与分桶明细不同源）是本版第三次踩到的同型坑，故当版修掉并加断言钉住。
      const __rfBefore = __readStat.readFailed;
      // v2.23.0: 基线快照改为**全来源**。bySource 是动态建桶（noteStoreReadFail / reportReadFail
      //   支持未知来源），此前这里与下面两处明细都硬编码成 3 键（bytes/activity/enumerate），
      //   于是本会话新增的 12+ 个来源（diskRev/verify/load/saveConflict/verifyState/recovery/
      //   quarantine/conflict/writerId/chatcache*/worldbookSelection/workflowHistory/uninjectLedger/
      //   eventLog/errorLog/readSpotCheck）在明细里**根本没有键**——消费端读它们恒得 undefined。
      //   现场：store.js:1200 读 `readFailedCumulative.recovery || 1` ⇒ 无论真实发生几十次，
      //   诊断永远报「本会话累计 1 次」（结论不实，正是本仓库反复治的那一类）。
      const __byBefore = {};
      Object.keys(__readStat.bySource).forEach(function (k) { __byBefore[k] = __readStat.bySource[k]; });
      const keys = listWorldAxisKeys();
      const families = { state: 0, stateDerived: 0, recovery: 0, diagnostic: 0, corrupt: 0, conflict: 0, writerId: 0, settings: 0, settingsUnregistered: 0, wb: 0, other: 0 };
      const perFamilyBytes = { state: 0, stateDerived: 0, recovery: 0, diagnostic: 0, corrupt: 0, conflict: 0, writerId: 0, settings: 0, settingsUnregistered: 0, wb: 0, other: 0 };
      let totalBytes = 0, stateKeys = 0, stateDerivedKeys = 0, diagKeys = 0, corruptKeys = 0, curBytes = 0, curQuarantines = 0;
      let conflictKeys = 0, conflictBytes = 0;
      let keysReadFailed = 0;           // v2.10.0: 本次盘点中读失败的键数（体积表可信度判据）
      const staleDiagCandidates = [];   // 仅超期项（与 sweepStaleKeys 同阈值）：{ key, chat, kind, idleMs }
      const now = clockNow('store.stale');
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
      keysReadFailed = __readStat.readFailed - __rfBefore;   // 本次盘点引发的读失败数
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
        // v2.10.0: 读侧完整性——本份占用表在生成过程中有多少个键**读失败**（按 0 字节计入）。
        //   `readFailedKeys > 0` 意味着 totalBytes / perFamilyBytes **偏小**，
        //   「已释放 / 剩余空间」这类结论在此数非零时不可信。
        readFailedKeys: keysReadFailed,
        // v2.10.0（逆向审计自纠）: 三个分桶必须与 keysReadFailed **同口径**（都是「本次盘点」的差值）。
        //   首版填的是累计值，于是消费端（store.maintain / tool-diag）拿它做 `activity > 0` 判据时，
        //   实际上是在读**历史累计**——一旦曾经发生过一次活跃时间读失败，健康分就会永久带着这个
        //   warn，而用户把存储问题修好后分数不会复原。这正是 v0.4.0 立下的裁决
        //   （「健康分只看当前态，否则历史一次失败会把分数永久压低」）所要禁止的形态，
        //   本版删除侧（P9）刚修过一次，store 读侧这里又踩了一遍，故当版修掉。
        // v2.23.0: 全来源动态枚举（此前硬编码 3 键 ⇒ 新增来源在明细里查无此键）。
        //   口径不变：detail = 本次盘点差值，cumulative = 本会话累计，二者同源同键集。
        readFailedDetail: (function () {
          const d = {};
          Object.keys(__readStat.bySource).forEach(function (k) { d[k] = __readStat.bySource[k] - (__byBefore[k] || 0); });
          return d;
        })(),
        readFailedCumulative: (function () {
          const c = {};
          Object.keys(__readStat.bySource).forEach(function (k) { c[k] = __readStat.bySource[k]; });
          return c;
        })(),
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
     *  - settingsUnregistered（v2.5.0）：**默认保留**（可能是用户手改或旧版本写的，仍属用户数据），
     *    仅当显式 `o.ghostSettings === true` 时列为候选——「永不清理」与「无人可清理」是两回事，
     *    本参数给出真实出口，默认行为不变（宁可漏删不可误删）。
     *  - 当前聊天的任何键：永不清理
     */
    sweepStaleKeys(opts) {
      const o = opts || {};
      const apply = o.apply === true;
      const maxIdleMs = (typeof o.maxIdleDays === 'number' && o.maxIdleDays >= 0 ? o.maxIdleDays : 30) * 86400000;
      const keepCorrupt = typeof o.keepCorrupt === 'number' && o.keepCorrupt >= 0 ? o.keepCorrupt : 5;
      const cur = getChatId();
      const keys = listWorldAxisKeys();
      const now = clockNow('store.stale');
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
        // v2.5.0: 未登记设置键（幽灵设置）——默认保留（保守），显式开启才纳入候选。
        //   这些键此前**责任真空**：不在登记表（登记表管不到），兜底成 settings 家族（清理规则也管不到）。
        if (c.family === 'settingsUnregistered') {
          if (o.ghostSettings === true) plan.remove.push({ key: k, reason: 'unregistered-setting', family: c.family, bytes: keyBytes(k) });
          else plan.keep.push(k);
          return;
        }
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
      // v2.9.0: apply 阶段走受控删除，并**逐条记录实际结果**。
      //   此前裸删 + 空 catch：删除失败既无返回也无计量，而调用方（面板「体检」）会照着
      //   plan.remove 的长度向用户报「已清理 N 项」——计划长度被当成了执行结果。
      //   现在 plan.applied 承载真实结果，plan.remove 保持「计划」语义不变（兼容既有断言）。
      let sweptRemoved = 0, sweptFailed = 0, sweptBytes = 0;
      if (apply) plan.remove.forEach(function (r) {
        const rr = removeVerified(r.key);
        if (rr.ok && rr.removed) { sweptRemoved++; sweptBytes += (r.bytes || 0); }
        else if (!rr.ok) sweptFailed++;
      });
      if (apply) plan.applied = { removed: sweptRemoved, failed: sweptFailed, freedBytes: sweptBytes };
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
     * v2.5.0: 键家族分类器导出（单一真源）。
     *
     * 为什么必须导出：本轮在 settings-bus.js 里新增了「未登记设置键」盘点（幽灵设置），它需要
     *   回答「这个键属于哪个家族」，而 KEY_FAMILIES/classifyKey 的真源就在本文件。若 settings-bus
     *   另存一份前缀清单，就与本轮刚从本文件删掉的 `settingsSettings` 白名单属**同型缺陷**
     *   （第二份真源必漂移）。故把分类器开出来，由 settings-bus 懒查（它先于本文件加载，
     *   顶层引用会踩 TDZ，所以只能懒查）。
     * 返回：{ family, chat?, kind?, at?, seq?, quarantine? }；`settingsUnregistered` 表示
     *   前缀是本扩展的、但不在 __settingsRegs 登记表里（幽灵设置）。
     */
    classifyKey(key) { return classifyKey(key); },
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
        try { raw = mainWin.localStorage.getItem(k) || ''; }
        catch (e) {
          // v2.10.0: 读失败此前回落空串 ⇒ 隔离现场被显示成「0 字节、不可解析」，
          //   用户会据此判断「这个现场没内容、可以丢」，而实际只是读不出来。
          noteStoreReadFail('quarantine', k, e);
          raw = '';
        }
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
      // v2.11.0: 恢复隔离现场是**唯一的用户数据回滚手段**——读失败必须归因（此前只回显字符串）。
      try { raw = mainWin.localStorage.getItem(key); }
      catch (e) { noteStoreReadFail('quarantine', key, e); return { ok: false, reason: '读取隔离键失败：' + ((e && e.message) || e) }; }
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
      __quarantineStat.restores++; __quarantineStat.lastRestoreAt = clockWall(); __quarantineStat.lastKey = key;
      WA.log('warn', '已从隔离现场恢复 state（' + key + '，聊天 ' + target + '）——原隔离键保留作为审计证据');
      return { ok: true, chat: target, bytes: byteLen(raw) };
    },
    /** v0.3.0: 显式丢弃隔离现场（用户确认无需再恢复）——审计留痕，不静默删 */
    dropQuarantine(key) {
      if (typeof key !== 'string') return { ok: false, reason: '缺少隔离键' };
      const c = classifyKey(key);
      if (c.family !== 'corrupt') return { ok: false, reason: '非隔离键，拒绝删除（防误用成通用删除器）' };
      let existed = null, existReadErr = null;
      try { existed = mainWin.localStorage.getItem(key); } catch (e) { existReadErr = e; }
      if (existReadErr) {
        // v2.10.0: 读失败与「不存在」此前都报「隔离现场不存在（可能已被清理）」——
        //   用户会以为现场已被清理，实际是读不出来（且本次确实没做任何删除）。
        noteStoreReadFail('quarantine', key, existReadErr);
        return { ok: false, reason: '读取隔离现场失败（无法确认其是否存在，本次未做任何删除）：' + ((existReadErr && existReadErr.message) || existReadErr) };
      }
      if (existed === null) return { ok: false, reason: '隔离现场不存在（可能已被清理或键名有误）' };
      // v2.9.0: 受控删除 + 复核（此前只包住「抛错」，静默无效会被当成成功丢弃）。
      //   隔离现场的丢弃是**不可逆**操作（原键已不在），报「已丢弃」而实际没删是双重误导。
      const r = removeVerified(key);
      if (!r.ok) return { ok: false, reason: '删除失败：' + r.reason };
      __quarantineStat.drops++; __quarantineStat.lastDropAt = clockWall();
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
    // ── 引用判据收口（v2.30.0，P1-1）──
    // why：全库 15 处 `x.id === y.id` 形态的实体匹配，此前各写各的——null 与 null 相等、
    // 数字 id 与字符串 id 不等、空串能匹配空串。judge 只住一处（ref_sw2 ref-rules 的
    // 核心纪律：判据住一处，调用方只消费）：所有 id/键身份判定都从这里走。
    // 三条裁决（都有判据钉住）：
    //   ① null/undefined 不参与匹配（两边都没有 ≠ 是同一个；实体查找语境下误配比漏配危险）
    //   ② 数字与字符串按字符串形态归一（id 类型漂移不该让匹配静默失效）
    //   ③ 空串不是 id（与 ① 同理）
    sameId(a, b) {
      if (a == null || b == null) return false;
      const sa = typeof a === 'string' ? a : String(a);
      const sb = typeof b === 'string' ? b : String(b);
      if (sa === '' || sb === '') return false;
      return sa === sb;
    },
    // v2.30.0（P0-2）：patch 是手动参数编辑的受控入口——写回成功后把「变更前」交给撤销栈。
    // 钩子只挂 patch 不挂 transact：transact 是引擎高频链路（每轮几十次），入栈会让
    // 撤销栈被自动演进淹没；patch 是面板/用户语义的编辑动作，才配得上「可撤销」。
    // 显式值优先：before 在改内存之前取好，写回成功后才 capture（写失败不入栈）。
    patch(path, value) {
      // before 的读取也必须包住：坏 path 时 read 会抛，不能让它在 transact 之外炸栈
      // （旧契约：patch 对坏输入如实返回 ok:false，绝不由钩子引入新的抛出路径）
      let before;
      try { before = this.read(path, undefined); }
      catch (_e) { before = undefined; }
      const r = this.transact(draft => {
        const segs = path.split('.');
        let node = draft;
        for (let i = 0; i < segs.length - 1; i++) { node[segs[i]] = node[segs[i]] || {}; node = node[segs[i]]; }
        node[segs[segs.length - 1]] = value;
      });
      if (r && r.ok === true && WA.undo && typeof WA.undo.capture === 'function') {
        try { WA.undo.capture('参数编辑', path, before); }
        catch (_e) { WA.log('warn', 'undo.capture 失败（编辑已生效，仅撤销栈未记）', _e); }
      }
      return r;
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
