/**
 * WorldAxis engines/bridge.js (v2.16.0)
 * 对外只读互操作桥（window.worldaxis_bridge_v1）
 *
 * 【为什么需要这一面】WorldAxis 是这套三插件里**唯一没有对外接口**的一个——全库只有内部的
 *   `window.WorldAxis.*`，产品代码零 `VirtualPhone`、零 `LonSha` 引用（实测）。于是「镜头之外
 *   的世界」只活在本扩展自己的面板里，而同一个剧情里另外两个插件对「世界」各有各的看法：
 *     · RubyPhone「世界脉搏」App：自己再调一次 LLM 现编平行事件（与真推演结果毫无关联）
 *     · RubyPhone TimeManager：从正文/世界书**猜**当前时间
 *     · LonSha 记忆引擎：世界推进另记一本账
 *   三者与真正的世界状态（本扩展的 store）彼此不可见，同一件事在三处各说一遍。
 *
 * 【契约】与 LonSha 的 `window.lonsha_memory_bridge_v1` **同规格**（宿主侧可用同一套消费代码）：
 *   ① **只读投影**——本对象不提供任何写世界状态的方法；快照只由引擎在推演管线内 refresh。
 *   ② **纯读不抛**——任何异常返回 null / 降级值，绝不影响推演与注入主链。
 *   ③ **深拷贝**——外部改动快照不得反过来改到引擎内存态。
 *   ④ **不刷屏**——默认每 `FLOOR_GAP` 楼才重建快照（世界推演为本仓库最慢的链路），
 *      同楼内重复请求由 `debounceMs` 直接回上一次快照，避免 clone 风暴。
 *   ⑤ **不静默降级**——`invalidate('store-not-loaded')` 这类「外部问得太早 / 宿主没加载」
 *      必须可归因：`stat()` 前后都读得到，不靠日志。
 *
 * 【与 RubyPhone 的共享口径】过滤规则与 `LonShaBridge.recallBlock` 同规格——「注入格式化单一真源」
 *   的思路搬到这里：**盲过滤 visibility 反而制造串味**。以「传闻」形式进入公众舆情
 *   （`store.opinion.forum`）的 hidden 事件，本来就是「玩家该从传闻里隐约听到」的那一批，
 *   一条都不给会让舆情的来源凭空消失。故默认 `presumeUnknown = 'hidden'`：
 *     · 只有**显式**标记 `public` / `public_trace` 的暗流进 `external.currents[]`；
 *     · **未标记**的进 `notMarked` 清单并给出计数——「一条都没进来」与「进来的都是不该进的」
 *       从此可区分，且两侧（RubyPhone 侧同样会判 visibility）的过滤规则对称可达。
 *   把该值设为 `'public'` 则退化为「未标记一律视为公开」的宽松口径（由用户显式选择）。
 *
 * 【消费方式（宿主侧）】
 *   `WorldAxis.bridge.refresh({ reason: 'pull' })` 取最新快照；`stat()` 看记账；
 *   监听没有事件总线——本桥是**拉取面**（与 lonsha 快照桥同型）：广播一个无人订阅的事件
 *   正是本仓库门禁点名的「死信号」，故不提供。要新鲜数据就调 refresh（带 debounce 保护）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const BRIDGE_ID = 'worldaxis_bridge_v1';
  const BRIDGE_VERSION = 1;
  const LS_KEY = 'worldaxis_bridge_settings_v1';
  /** 每 N 楼重建一次快照（推演本身按 after_reply 触发，这里是「外部多久能看到新世界」的粒度） */
  const FLOOR_GAP = 5;
  // 上限只影响**外供投影**的大小，不剪除任何世界状态（本文件全程只读，零写世界）。
  const __REG = {
    key: LS_KEY,
    def: { enabled: false, includeHidden: false, presumeUnknown: 'hidden', maxCurrents: 20, maxEchoes: 12, maxOpinion: 8, debounceMs: 400 },
    bounds: { maxCurrents: [1, 80], maxEchoes: [1, 50], maxOpinion: [1, 30], debounceMs: [0, 5000] },
    // 枚举白名单：presumeUnknown 是**口径**，不是数值——非法值必须退回保守档（def），
    //   交给 bounds 的数值夹取管不了它（实测：无 enums 声明时 'wild' 会原样落盘 → 投影层的
    //   兜底成了唯一防线，设置里却写着一个没人认识的值）。「放宽过滤」这件事不该由拼错的值替用户决定。
    enums: { presumeUnknown: ['hidden', 'public'] },
    module: 'bridge'
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v2.3.0 口径：读路径统一走 settingsBus（本键 JSON 损坏时才有隔离留痕与来源归因）。
  function loadSettings() { return WA.settingsBus.read(__REG); }
  /** 写入即归一（与 opinion/regional/horizon 同规格）——原值落盘会让「界面显示的」与「引擎执行的不一致」。 */
  function saveSettings(o) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign(loadSettings(), o || {})));
  }
  const PRESUME = ['hidden', 'public'];

  const __stat = {
    refreshes: 0, publishes: 0, invalidations: 0, debounced: 0,
    failures: 0, refused: 0, externalReads: 0,
    lastReason: null, lastAt: 0, lastWallAt: 0,
    lastInvalidateReason: null, lastInvalidateAt: 0,
    lastRefusal: null, lastFailure: null, byInvalidate: {}
  };
  let __snapshot = null;
  let __publishedFloor = -1;
  let __publishedAtWall = 0;
  // v2.16.0: 「已作废」必须是**独立的**状态位。只把 __publishedFloor 归 -1 不够——
  //   `f - (-1) < FLOOR_GAP` 在近楼层恒成立，于是「作废」会被「间隔不够」吃掉，
  //   换会话 / 推演结算后的第一次 refresh 拿回来的还是旧世界（正是静默串味）。
  let __invalidated = false;

  function floor() {
    try {
      const c = (WA.compat && typeof WA.compat.context === 'function') ? WA.compat.context() : null;
      const n = c && c.chat && c.chat.length;
      return (typeof n === 'number' && n > 0) ? (n - 1) : -1;
    } catch (e) { return -1; }
  }
  function deep(v) {
    try { return (typeof structuredClone === 'function') ? structuredClone(v) : JSON.parse(JSON.stringify(v === undefined ? null : v)); }
    catch (e) { try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch (e2) { return null; } }
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function txt(v, n) { const s = String(v === undefined || v === null ? '' : v); return (n && s.length > n) ? s.slice(0, n) : s; }
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

  /**
   * 把暗流按可见性切成「可外供」与「未标记」两堆。
   * 纯函数、显式传 presume（不从设置里偷读）——单测可独立驱动，也避免同一次投影里两套口径。
   */
  function splitCurrents(list, presume) {
    const out = [];
    const notMarked = [];
    arr(list).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      const vis = c.visibility;
      if (vis === 'public' || vis === 'public_trace') out.push(c);
      else if (vis === 'hidden') { /* 显式隐藏：是否放行由投影层的 includeHidden 决定，这里不重复判 */ }
      else notMarked.push(c);
    });
    // presume='public' 时，未标记的并入可外供（用户显式选择的宽松口径）
    if (presume === 'public') return { out: out.concat(notMarked), notMarked: [] };
    return { out: out, notMarked: notMarked };
  }

  /** 组装投影。纯读：只调各引擎的只读出口与 store.get()，全程不改一个字段。 */
  function buildSnapshot(cfg, reason) {
    const st = WA.store.get() || {};
    const f = floor();
    // 口径值域归一：非法 presumeUnknown 一律退回保守档（与「非法阈值回落 2 而不放宽」同规格）。
    const presume = PRESUME.indexOf(cfg.presumeUnknown) >= 0 ? cfg.presumeUnknown : 'hidden';
    const cmSplit = splitCurrents(st.currents || [], presume);
    const withHidden = cfg.includeHidden ? arr(st.currents) : cmSplit.out;
    return {
      version: BRIDGE_VERSION,
      bridge: BRIDGE_ID,
      extVersion: (function () { try { return String(WA.VERSION || WA.version || ''); } catch (e) { return ''; } })(),
      floor: f,
      exportedAt: clockNow('bridge.exportedAt'),
      exportedAtWall: clockWall(),
      reason: txt(reason, 40),
      worldClock: {
        // 「世界钟」是决策时间：它进存档、参与判定，且是 RubyPhone TimeManager 猜时间的替代源。
        label: txt(obj(st.clock).label, 60),
        iso: txt(obj(st.clock).iso, 40),
        dayIndex: num(obj(st.clock).dayIndex),
        source: txt(obj(st.clock).source, 12)
      },
      pulse: st.worldPulse ? {
        pressure: num(st.worldPulse.pressure), trend: txt(st.worldPulse.trend, 16),
        note: txt(st.worldPulse.note, 200), at: num(st.worldPulse.at)
      } : null,
      digest: (st.evolution && st.evolution.worldDigest) ? {
        text: txt(st.evolution.worldDigest.text, 600), at: num(st.evolution.worldDigest.at)
      } : null,
      currents: withHidden.slice(0, cfg.maxCurrents).map(function (c) {
        return {
          id: txt(c.id, 40), title: txt(c.title, 60), summary: txt(c.summary, 240),
          visibility: txt(c.visibility, 16), stage: txt(c.stage, 20),
          participants: arr(c.participants).slice(0, 8).map(function (p) { return txt(p, 32); }),
          at: num(c.updatedAt || c.createdAt)
        };
      }),
      echoes: arr(st.echoes).slice(-cfg.maxEchoes).map(function (e) {
        return { id: txt(e.id, 40), refCurrent: txt(e.refCurrent, 40), result: txt(e.result, 200), exposure: txt(e.exposure, 20), at: num(e.at) };
      }),
      // 已结算的权威事实：外部要「引用世界事实」时的唯一真源（与 currents 的区别是它不再变）。
      facts: arr(st.worldFacts).slice(-24).map(function (x) {
        return { key: txt(x.key, 40), value: txt(x.value, 200), scope: txt(x.scope, 20), at: num(x.at) };
      }),
      people: Object.keys(obj(st.people)).slice(0, 60).map(function (k) {
        const p = obj(obj(st.people)[k]);
        return { id: txt(k, 40), name: txt(p.name, 40), location: txt(p.location, 60), action: txt(p.action, 60), lastSeenAt: num(p.lastSeenAt) };
      }),
      // 舆情：canon=已核实新闻、forum=论坛传闻、sandbox=NON-CANON 闲逛。
      //   claim_status 必须原样带出：「已核实」与「纯传闻」在外部侧是两种事实强度。
      opinion: {
        canon: arr(obj(st.opinion).canon).slice(-cfg.maxOpinion).map(function (o) {
          return { title: txt(o.title, 80), body: txt(o.body, 240), claim: txt(o.claim_status, 12), scope: txt(o.scope, 16), relatedEvent: txt(o.related_event_id, 60), at: num(o.at) };
        }),
        forum: arr(obj(st.opinion).forum).slice(-cfg.maxOpinion).map(function (o) {
          return {
            board: txt(o.board, 40), topic: txt(o.topic, 80), claim: txt(o.claim_status, 12),
            relatedEvent: txt(o.related_event_id, 60),
            replies: arr(o.replies).slice(0, 3).map(function (r) { return { author: txt(r.author, 32), text: txt(r.text, 120) }; }),
            at: num(o.at)
          };
        }),
        sandbox: arr(obj(st.opinion).sandbox).slice(-cfg.maxOpinion).map(function (o) {
          return { kind: txt(o.kind, 20), text: txt(o.text, 160), mood: txt(o.mood, 20) };
        }),
        updatedAt: num(obj(st.opinion).updatedAt)
      },
      counts: {
        currents: arr(st.currents).length, echoes: arr(st.echoes).length, facts: arr(st.worldFacts).length,
        people: Object.keys(obj(st.people)).length, chronicle: arr(st.chronicle).length,
        opinionCanon: arr(obj(st.opinion).canon).length, opinionForum: arr(obj(st.opinion).forum).length
      },
      // 过滤归因：外部侧能一眼看出「为什么这条没进来」。
      filter: {
        presumeUnknown: presume, includeHidden: !!cfg.includeHidden,
        exportedCurrents: Math.min(withHidden.length, cfg.maxCurrents),
        notMarkedCount: cmSplit.notMarked.length,
        notMarked: cmSplit.notMarked.slice(0, 8).map(function (c) { return txt(c && c.id, 40); }),
        hiddenCount: arr(st.currents).filter(function (c) { return c && c.visibility === 'hidden'; }).length,
        truncated: arr(st.currents).length > cfg.maxCurrents
      }
    };
  }

  function publish(cfg, reason) {
    ensureSubscribed();   // 真在跑才订阅总线（见 ensureSubscribed 注释）
    const snap = buildSnapshot(cfg, reason);
    __snapshot = snap;
    __publishedFloor = snap.floor;
    __publishedAtWall = clockWall();
    __invalidated = false;   // 新快照已覆盖作废前的世界——作废标记只在「未重建」期间有效
    __stat.publishes++;
    try { WA.log('info', '对外桥已发布快照（floor=' + snap.floor + '，暗流 ' + snap.filter.exportedCurrents + '，理由 ' + (reason || '?') + '）'); } catch (e) {}
    return snap;
  }

  function ensureMounted() {
    try {
      const w = WA.mainWin || window;
      if (w && w[BRIDGE_ID] !== bridge) w[BRIDGE_ID] = bridge;
    } catch (e) {}
  }

  /**
   * 重建并可外供的快照。
   * @param {{reason?:string, force?:boolean}} opts
   * @returns {object|null} 快照（被拒/降级时返回 null——调用方用 stat() 归因）
   */
  function refresh(opts) {
    opts = opts || {};
    const reason = txt(opts.reason || 'refresh', 40);
    __stat.refreshes++;
    __stat.lastReason = reason;
    __stat.lastAt = clockNow('bridge.refresh');
    __stat.lastWallAt = clockWall();
    let cfg = null;
    try { cfg = loadSettings(); } catch (eCfg) { cfg = Object.assign({}, __REG.def); }
    if (!cfg || cfg.enabled === false) {
      __stat.refused++;
      __stat.lastRefusal = { reason: 'disabled', at: __stat.lastAt };
      return null;
    }
    const f = floor();
    // ④ 不刷屏：同一条楼层间隔内不重建（世界推演是本仓库最慢的链路，快照 clone 不该更贵）。
    //   上界 `f >= __publishedFloor` 防「换了会话、楼层更小」时把**上一个会话**的快照当成
    //   「间隔不够」返回（f 变小后 f - publishedFloor 为负数，恒小于 FLOOR_GAP ⇒ 跨会话串味）。
    //   `__invalidated` 则防「同一会话、楼层没动」时把已作废的快照当成间隔不够返回——
    //   作废（换会话/推演结算）必须优先于去抖，否则作废后的第一问拿回来的还是旧世界。
    //   注：同楼层与「动了但没到粒度」在去抖口径下是同一件事（都回上一份快照），
    //   故只有一个计数器（debounced）。与之并列的另一刻度是 invalidations（作废⇒必然重建）。
    if (!__invalidated && !opts.force && f >= 0 && __snapshot && f >= __publishedFloor && (f - __publishedFloor) < FLOOR_GAP) {
      __stat.debounced++;
      return __snapshot;
    }
    try {
      const snap = publish(cfg, reason);
      ensureMounted();
      return snap;
    } catch (e) {
      __stat.failures++;
      __stat.lastFailure = { reason: txt(e && (e.message || e), 160), at: __stat.lastAt };
      try { WA.log('warn', '对外桥发布失败（不影响推演主链）', e); } catch (e2) {}
      return null;
    }
  }

  /**
   * 世界状态已变（换聊天 / 事务提交 / 外部主动拉）——作废当前快照，下次 refresh 必然重建。
   * @param {string} reason 归因标签（'chat:changed' / 'store-not-loaded' / 'pull' …）
   */
  function invalidate(reason) {
    const r = txt(reason || 'unspecified', 40);
    __stat.invalidations++;
    __stat.lastInvalidateReason = r;
    __stat.lastInvalidateAt = clockNow('bridge.invalidate');
    __stat.byInvalidate[r] = (__stat.byInvalidate[r] || 0) + 1;
    __publishedFloor = -1;
    __invalidated = true;
    return true;
  }

  /** after_reply 链挂钩：本仓库唯一的「世界刚推完」时机。cfg 关闭时零开销早退。
   *  刻意**不导出**：探针实测全库零外部消费（唯一调用点就在本文件内的 workflow 节点里）——
   *  按 v2.11.0 裁决摘除。留着零消费出口的风险不是多一个 API，而是下一个调用者会挑错的那个。 */
  function onAfterReply() {
    let cfg = null;
    try { cfg = loadSettings(); } catch (e) { return null; }
    if (!cfg || cfg.enabled === false) return null;
    return refresh({ reason: 'after-reply' });
  }

  /**
   * 外部读取入口。返回**深拷贝**（③ 契约：外部改快照不能改到引擎内存态）。
   * 外部主动取数也算一次刷新请求，但同样受 FLOOR_GAP / debounceMs 约束——外部轮询不会变成 clone 风暴。
   */
  function snapshot(opts) {
    __stat.externalReads++;
    // ② 契约：本方法是**外部入口**，最不该抛。设置读取本身可能因存储故障失败，
    //   故与 refresh 同规格走保守档（默认休眠 ⇒ 返回 null，且 stat().refused 可归因）。
    let cfg = null;
    try { cfg = loadSettings(); } catch (eCfg2) { cfg = Object.assign({}, __REG.def); }
    if (!cfg || cfg.enabled === false) {
      __stat.refused++;
      __stat.lastRefusal = { reason: 'disabled', at: clockWall() };
      return null;
    }
    const wait = num(cfg.debounceMs);
    // 时间维度的去抖同样让位给「已作废」：作废之后的第一问必须是新世界，不是 400ms 内的旧快照。
    if (!__invalidated && __snapshot && wait > 0 && (clockWall() - __publishedAtWall) < wait) {
      __stat.debounced++;
      return deep(__snapshot);
    }
    const snap = refresh({ reason: (opts && opts.reason) || 'pull' });
    return snap ? deep(snap) : null;
  }

  // 作废订阅是**惰性**的：默认休眠的桥不该在总线上占两个监听位。
  //   本仓库总线上「有发出无监听」是**刻意可见**的健康信号（诊断节与面板都会点名死信号），
  //   一个从不工作的桥常驻在两个事件上，等于把一条真实告警抹平——这是拿观测性换便利。
  //   故首次成功发布时才订阅：真在跑，才需要知道「世界什么时候变了」。
  let __subscribed = false;
  function ensureSubscribed() {
    if (__subscribed || !WA.on) return;
    __subscribed = true;
    try {
      // 推演结算后立即作废：下次读取必然拿到刚推完的世界，而不是上一次楼层间隔的旧态。
      //   用总线事件而不是在 backstage 里直接调本模块：backstage 是最热的链路，
      //   反向依赖会让它在无桥环境下也要持有本模块（本仓库反复治理的「悬空引用」形态）。
      WA.on('backstage:settled', function () { try { invalidate('backstage:settled'); } catch (e) {} });
      // 换聊天：上一个会话的世界投影必须立刻作废（否则外部侧会拿到别人的世界）。interceptor 已 emit。
      WA.on('chat:changed', function () { try { invalidate('chat:changed'); } catch (e) {} });
    } catch (e) {}
  }

  // after_reply 链挂钩：本仓库「一轮刚结束」的唯一统一时机（v2.8.0 起 after 链有 4 个消费者）。
  //   刻意**不设 critical**：对外投影失败绝不能拖住、更不能回滚世界推演主链。
  try {
    if (WA.workflow) WA.workflow.register({
      id: 'bridge.publish', chain: 'after', order: 70, critical: false,
      label: '对外只读快照（世界状态外供）',
      async run() { onAfterReply(); }
    });
  } catch (e) {}

  const bridge = WA.bridge = {
    id: BRIDGE_ID,
    version: BRIDGE_VERSION,
    FLOOR_GAP: FLOOR_GAP,
    buildSnapshot: buildSnapshot,
    splitCurrents: splitCurrents,
    refresh: refresh,
    // snapshot 与 refresh 是本桥**唯一的两个外部读取面**（最小消费面）：
    //   snapshot() 给外部读（深拷贝 + 去抖），refresh() 给外部「我知道世界变了，请重建」。
    snapshot: snapshot,
    invalidate: invalidate,
    // settings() 也会被**外部**调用（诊断节、健康分、宿主侧探测），同规格不抛。
    settings: function () { try { return loadSettings(); } catch (eS) { return Object.assign({}, __REG.def); } },
    setSettings: function (patch) { const next = saveSettings(patch); invalidate('settings-changed'); return next; },
    stat: function () {
      return {
        refreshes: __stat.refreshes, publishes: __stat.publishes, invalidations: __stat.invalidations,
        debounced: __stat.debounced, refused: __stat.refused,
        failures: __stat.failures, externalReads: __stat.externalReads,
        lastReason: __stat.lastReason, lastAt: __stat.lastAt, lastWallAt: __stat.lastWallAt,
        lastInvalidateReason: __stat.lastInvalidateReason, lastInvalidateAt: __stat.lastInvalidateAt,
        lastRefusal: __stat.lastRefusal ? { reason: __stat.lastRefusal.reason, at: __stat.lastRefusal.at } : null,
        lastFailure: __stat.lastFailure ? { reason: __stat.lastFailure.reason, at: __stat.lastFailure.at } : null,
        byInvalidate: Object.assign({}, __stat.byInvalidate),
        published: !!__snapshot,
        invalidated: __invalidated,
        // 惰性订阅状态：「总线上的两个监听位是真在跑才占的」——否则一个默认休眠的桥会
        //   把总线上「有发出无监听」这条真实健康信号抹平（诊断节/面板都会点名死信号）。
        subscribed: __subscribed,
        floorGap: FLOOR_GAP,     // 面板/诊断要念出「多少楼才重建」——此前面板引用了不存在的字段（渲染成 undefined）
        publishedFloor: __publishedFloor,
        publishedAt: __snapshot ? __snapshot.exportedAt : 0,
        ageMs: __publishedAtWall ? (clockWall() - __publishedAtWall) : -1,
        mounted: (function () { try { return (WA.mainWin || window)[BRIDGE_ID] === bridge; } catch (e) { return false; } })(),
        floor: floor(),
        snapshotBytes: (function () { try { return JSON.stringify(__snapshot || null).length; } catch (e) { return -1; } })()
      };
    }
    // 刻意**不导出** resetStat：探针实测全库零消费（写测试时可由 stat() 前后做差驱动，
    //   无需专用复位口）。同照 v2.11.0 裁决——零消费出口不该存在。
  };
  ensureMounted();
  // 「外部有人在吗」的可观测答案：挂载点在场即装好；被外部删掉后任一次 refresh 会补挂（宿主换页/清站点数据）。
  if (WA.log) WA.log('info', '对外只读互操作桥已就绪（' + BRIDGE_ID + '，默认休眠：' + (__REG.def.enabled === false) + '）');
})();