/**
 * WorldAxis engines/offline-return.js (v2.161.0 → 自 v2.156.0 S1) — 离线恢复编排（S1 + TP3 入口收口）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   本仓此前有三块**各自正确、但没有编排者**的零件：
 *     · `engines/playtime.js`（SP1）—— 每聊天的**真实活动基准**（你上次有效活动是什么时候）；
 *     · `engines/offline-tick.js`（RX2 + SP3）—— 跨会话的**批次账 / 锚保护 / 摘要消费口**；
 *     · `life.tickDraft` / `evolution.rollEventsDraft` / `world.tickDraft`（SP2）——
 *       可在**给定草稿**上推一轮的草稿体。
 *   三块齐了，但**没有任何一处把它们串成「玩家回来了」这一件事**：
 *     ① 谁来读基准、谁来算出「离开了多久」、谁来把这段时长交给批次账？
 *     ② 推演**失败**时（回调抛错 / 草稿过期 / 存储故障），谁来保证「下次不是重新掷一次骰子」？
 *     ③ 推演成功后，**同一段离线**会不会被推第二遍（票据不复核 ⇒ 重复推进，而读数上
 *        与「这次真的又离开了一回」长得一模一样）？
 *   三个缺口的共同后果是一句话：**离线恢复要么不发生，要么发生两次。**
 *
 * ── 本模块落点（三件东西，一件都不多）──────────────────────
 *   · `recover(opts)`   —— 一次恢复编排：读基准（纯读）→ 算 gap → 过门 → 票据 →
 *       磁带 → 事务内推演（SP2 的四个草稿体）→ 成功后并回结算袋。
 *   · `consume(opts)`   —— 摘要消费：**真的把块递进正文之后**才把批次记成已消费。
 *       判据是 `store.lastInjection.sources` 里有没有本模块那一源 —— 那是「这轮真落地了
 *       哪些源」的唯一现场读数，不是猜的。
 *   · `stat()`          —— 恢复台账（含票据复核、陈旧票据、失败、重试各计数）。
 *
 * ── 与既有模块的分工（关键：不重叠、不替代）──────────────────
 *   · `playtime` 管「你上次什么时候在」；`offlineTick` 管「这一批推了几轮、哪些不许动」；
 *     本模块管「**何时**去问、**失败怎么办**、**成功之后谁记账**」——它自己**不推世界**
 *     （推演全部委托 SP2 的草稿体），**不写批次账**（那是 offlineTick 的事），
 *     **不读盘写盘**（基准的读写各只有 playtime 一个口）。
 *
 * ── 边界（全是否定式）────────────────────────────────────
 *   1 总开关默认**关闭**。关闭时 recover / consume 一律拒收（`disabled`），
 *     且**不占总线监听位**（见边界 5）。默认不替任何人改动世界。
 *   2 **零 localStorage**。本模块没有自己的持久化：票据就是世界状态里的 `lastSettledAt`
 *     （进程侧不留第二份真源 —— 同 life 的 TURN_KEY 裁决）。故它不进 G16 裸读清册。
 *   3 **失败不吞随机**：首跑录磁带（`beginTape(true)`），失败保留那卷；下次**重放**它而
 *     不是重新掷骰。于是「重试」不改变这一批的抽取序列 —— 换一次运气等于换一个世界。
 *   4 **票据复核两道**：进门前比 `chatId`（切聊天 ⇒ `stale-chat`），事务内比
 *     `lastSettledAt` 快照（`stale-baseline`）。任一不符即**不推**，如实拒收。
 *   5 **订阅是惰性的**：默认休眠的模块不该在总线上占位（本仓「有发出无监听」是刻意可见的
 *     健康信号，v2.16.0 起 bridge 同规）。只有**真结算过一次**才挂
 *     `chat:changed` —— 打开开关本身不挂（开关是意图，「跑过」才是事实）。
 *   6 失败一律进 `faults` 台账并**不上抛**（附属面的异常不是主链的异常，与 bridge.publish /
 *     region.offline 同规格）。
 */

(function () {
  'use strict';
  // v2.156.0：别名形态用本仓规范式（module-cycle-gate 只认这一种形态）。
  const WA = window.WorldAxis = window.WorldAxis || {};

  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_offline_return_v1';
  const DEF = {
    enabled: false,       // 默认关：本模块**写世界**，不许默认替用户改
    deferMs: 0            // >0 时把编排推迟到下一拍（留给宿主先完成切聊天的重载）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'offlineReturn',
    bounds: { deferMs: [0, 60000] } };

  /** 摘要注入块的源名 —— 与 render/inject.js 的 `items.push({source: ...})` **逐字同名**。
   *    它同时是 consume 的判据输入（「这一轮真落地了哪些源」）与面板回显的一半。 */
  const SRC = '你不在时';

  const stat = { recovers: 0, firsts: 0, skipped: 0, fails: 0, retries: 0,
    ticketChecks: 0, staleTickets: 0, settleTicks: 0, rounds: 0, protectedRows: 0,
    consumeChecks: 0, consumes: 0, consumeSkips: 0,
    // v2.161.0（TP3）：页面恢复入口的留痕位。**必须进声明行** —— `stat.x++` 在 undefined 上
    //   得到 NaN，面板与诊断里那几个读数会恒为 NaN（看起来像「这个读数没实现」），
    //   而只钒「≥1」的两向探针恰好漏过这种形态（v2.157.0 实测过同一个坑）。
    //   pageCoalesced 与 pageSkips 分开：前者是「宿主重复通知」（同一次回来发了几拍），
    //   后者是「通知来了但没得跑」（关着 / 没基准）—— 两种处置不是一件事。
    pageResumes: 0, pageCoalesced: 0, pageHookBound: false, lastPageReason: '',
    lastReason: '', lastAt: 0, lastGapMs: null, faults: {} };

  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  /** 可空时刻判据。**不可用 `isFinite(Number(v))` 包裹**：`Number(null) === 0` 而 0 是合法时刻
   *    （Unix 纪元），把它当真值会让「没有结算点」映射成「你从 1970 年就在玩」——
   *    与 engines/offline-tick.js 的 `num()` 注释（v2.151.0 实测自纠）是同一个坑。 */
  function num(v) {
    const n = (v === null || v === undefined || v === '') ? NaN : Number(v);
    return isFinite(n) ? n : null;
  }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    // 返回值是**写结果**（settingsBus.saveOrThrow 的契约是 `{ ok, ... }`，**不是**设置值本身）——
    //   故这里不读 `out.enabled` 做任何判定。订阅是惰性的，挂在「真跑过一次」那里（见 run）。
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function curChatId() {
    try { return WA.store && WA.store.chatId ? String(WA.store.chatId()) : 'wa_default'; } catch (e) { return 'wa_default'; }
  }
  function state() { try { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  /** 当前结算点（票据的一半）。null = 这个聊天还没结算过（≠ 结算点是 0）。 */
  function settledAt() {
    const b = state().offlineTick;
    return b ? num(b.lastSettledAt) : null;
  }
  function tickCfg() {
    try { return WA.offlineTick && WA.offlineTick.getSettings ? WA.offlineTick.getSettings() : null; } catch (e) { return null; }
  }

  // ── 总线订阅：惰性（边界 5）──────────────────────────────────
  let __subscribed = false;
  function ensureSubscribed() {
    if (__subscribed || typeof WA.on !== 'function') return false;
    __subscribed = true;
    try {
      // 换聊天 ⇒ 上一个会话的离线段落必须作废：新聊天有自己的票据，旧票据拿过去
      //   会推演别人的世界（票据复核的第一道就是这个，这里是让它**根本没机会**发生）。
      WA.on('chat:changed', function () { try { recover({ trigger: 'chat-changed' }); } catch (e) {} });
    } catch (e) { __subscribed = false; return false; }
    return true;
  }

  // ── 页面恢复入口（v2.161.0 / TP3）────────────────────────────
  //   缺口（源码搜索确证）：全产品面**没有任何** page-resume 入口 ——
  //     `visibilitychange` / `pageshow` 零命中。于是「你关掉页面又回来」这件事
  //     在宿主真实事件源里**无人监听**：恢复只在别人恰好又跑一次 before 链
  //     或 chat:changed 时才发生，而这两件都不必然发生。
  //   三条纪律与总线订阅（边界 5）同规格，一条不放宽：
  //     ① **惰性**：只有**真结算过一次**才挂（打开开关是意图，「跑过」才是事实）；
  //     ② **不进主链**：回调里的失败一律**不上抛**（附属面故障不是主链故障），且本函数自身永不抛；
  //     ③ **合并通知**：宿主对同一次回前台可能连发多拍（后台节流恢复时尤其如此），
  //        故按**测量时间**做一个去重窗，窗内只跑一次，并如实记下合并了几拍。
  //   为什么夹在**测量时间**上：这一层判的是「两拍之间隔了多久」，属测量域；
  //     而判定用的时刻在 recover 内部按注入与否分域取（见 recover 头注的 v2.161.0 段）。
  let __pageHookBound = false;
  const PAGE_COALESCE_MS = 1000;
  let __lastResumeAt = 0;
  //   合并窗的**执行点刻意放在 recover 内部**（见 recover 头注），本函数只负责
  //   「把宿主的这一拍翻译成一次 page- 触发」—— 于是合并与判定共用同一个入口，
  //   不再多出一个导出面（导出面恰 5 个口是已钉住的契约）。
  function onPageResume(kind) {
    try {
      return recover({ trigger: 'page-' + clean(kind || 'resume', 20) });
    } catch (e) { noteFault('page-hook-throw'); stat.lastPageReason = 'throw'; return { ok: false, reason: 'throw' }; }
  }
  /** 宿主事件面取用（与 playtime.win() 同规：WA.mainWin 优先，缺席回落 window）。本函数永不抛。 */
  function ensurePageHook() {
    if (__pageHookBound) return false;
    let win = null;
    try { win = WA.mainWin || (typeof window !== 'undefined' ? window : null); } catch (e) { win = null; }
    if (!win || typeof win.addEventListener !== 'function') return false;
    __pageHookBound = true;
    try {
      win.addEventListener('visibilitychange', function () {
        // 只认「变回可见」那一半：同一事件名在隐藏时也会发一次，而那一刻你并没有回来。
        try { if (String(win.document && win.document.visibilityState) === 'hidden') return; } catch (e) {}
        onPageResume('visibility');
      });
      win.addEventListener('pageshow', function (e) {
        // 只认 bfcache 恢复（`persisted`）。首次加载也发 pageshow，但那时事务链还没跑过 ——
        //   若一并处理，会与 before 链的 first-baseline 抢同一个「首见」局面，把一次首次装载
        //   记成一次「你回来了」。无参视角下**不认**（宁可不处理，也不误处理）。
        try { if (!e || !e.persisted) return; } catch (err) { return; }
        onPageResume('pageshow');
      });
    } catch (e) { __pageHookBound = false; return false; }
    return true;
  }

  // ── 磁带：首跑录、失败留、重试放（边界 3）────────────────────
  let __retryTape = null;
  let __running = false;

  /**
   * 合成 `apply`（交给 offlineTick.tick 的注入点）。
   *   推演的**四段全部委托 SP2 的草稿体**，本模块一个数值都不自己算 ——
   *   这里唯一的自有逻辑是「谁先谁后」与「把 touched 报回去」（锚保护靠 touched + 逐路径 diff
   *   双重判据，报 touched 只是让「被改过」这件事在**值没变**的情形下也不漏）。
   *
   * `WA.evolution.rollEventsDraft / decayWindsDraft` **必须以成员形式调用**：
   *   它们体内用 `this.getMaxFails` / `this.advanceStageRound` / `this._num`
   *   （见 engines/evolution.js 的注释），解引用成裸函数会在严格模式下丢 this 并当场抛。
   */
  function makeApply(now) {
    const box = { bag: null, results: [], decayed: [], touched: [], lifeChanged: 0 };
    const fn = function (draft) {
      if (WA.life && typeof WA.life.tickDraft === 'function' && typeof WA.life.makeBag === 'function') {
        if (!box.bag) box.bag = WA.life.makeBag();
        const lr = WA.life.tickDraft(draft, { now: now }, box.bag);
        if (lr && lr.ok === false) return { ok: false, reason: lr.reason || 'life-failed' };
        if (lr && lr.changed) { box.lifeChanged += lr.changed; box.touched.push('people'); }
      }
      // 两个草稿体**必须以成员形式调用**：它们体内用 `this.getMaxFails / this.advanceStageRound
      //   / this._num`（见 evolution 的 rollEventsDraft 头注），解引用成裸函数会在严格模式下
      //   丢 this 并当场抛。此处刻意写成 `WA.evolution.xxx(...)` 而非先取一个局部别名 ——
      //   别名会让成员访问路径**从文本上消失**，dead-export 门禁随即把这两个导出判成死导出
      //   （实测：本模块第一版用 `const evo = WA.evolution` 就被该门禁点名）。
      // 门在外面（同上头注）：真跑的门留在 `rollEvents` 里，**离线批的合成侧必须自己过同一门**，
      //   否则「关了骰子」只在真跑路径生效、离线批里静默失效（事件照旧随离线时长推进）。
      //   三段的门三种形状，合成侧必须逐段对上：life 的门在草稿体**内部**（tickDraft 自己在
      //   第 310 行判 disabled 并早退，故合成侧无需补）；evolution / world 的门在**外面**
      //   （`rollEvents` / `world.tick` 各留一条早退），故由本函数逐段补门（见下两处）。
      //   v2.156.0 收口自纠：world 段此前漏补门 —— `enabled: false` 时离线批仍把共同日程
      //   从 planned 推成 done（实测复现）。漏的不是一行 if：它把「世界织体关着」这个用户
      //   意图在离线路径上静默吞掉了，而读数（batches/rounds）与正常推进长得一样。
      const diceOn = (WA.settingsBus && typeof WA.settingsBus.toBool === 'function'
        && WA.evolution && typeof WA.evolution.getSettings === 'function')
        ? WA.settingsBus.toBool(WA.evolution.getSettings().diceEnabled, true) : true;
      if (diceOn && WA.evolution && typeof WA.evolution.rollEventsDraft === 'function') {
        const before = box.results.length;
        WA.evolution.rollEventsDraft(draft, box.results);
        if (box.results.length > before) box.touched.push('evolution');
      }
      if (diceOn && WA.evolution && typeof WA.evolution.decayWindsDraft === 'function') {
        const before = box.decayed.length;
        WA.evolution.decayWindsDraft(draft, box.decayed);
        if (box.decayed.length > before) box.touched.push('evolution');
      }
      // 第三道门：world 自己的开关（同 evolution 的形态 —— 门在公开入口 `world.tick` 里，
      //   合成侧不补就会「关着也推」，头注已点名的那个失效模式）。
      const worldOn = (WA.settingsBus && typeof WA.settingsBus.toBool === 'function'
        && WA.world && typeof WA.world.getSettings === 'function')
        ? WA.settingsBus.toBool(WA.world.getSettings().enabled, true) : true;
      if (worldOn && WA.world && typeof WA.world.tickDraft === 'function') {
        if (WA.world.tickDraft(draft, { now: now })) box.touched.push('world');
      }
      return { ok: true, touched: box.touched };
    };
    return { fn: fn, box: box };
  }

  /**
   * 事务内核：票据复核 → 推演 → 结果回收。**不开事务**（由调用方给边界）。
   *   返回 `{ ok, reason?, ... }`；`ok === false` 时事务被如实中止（零落地）。
   */
  function settle(expected, now, opts) {
    const o = opts || {};
    if (!WA.store || typeof WA.store.transact !== 'function') return { ok: false, reason: 'store-unavailable' };
    if (!WA.offlineTick || typeof WA.offlineTick.tick !== 'function') return { ok: false, reason: 'module-missing' };
    const A = makeApply(now);
    let out = null;
    let tickRes = null;
    const tx = WA.store.transact(function (draft) {
      // 票据复核（第二道）：进门到起事务之间世界可能已经结算过（并发的第二次 recover）。
      //   不符即**不推**：宁可这次什么都不做，也不把同一段离线推两遍。
      const cur = num(draft.offlineTick && draft.offlineTick.lastSettledAt);
      if (cur !== expected) { out = { ok: false, reason: 'stale-baseline', expected: expected, found: cur }; return false; }
      tickRes = WA.offlineTick.tick(draft, { now: now, apply: o.apply === false ? undefined : A.fn });
      if (!tickRes || tickRes.ok === false) { out = { ok: false, reason: (tickRes && tickRes.reason) || 'tick-failed' }; return false; }
      out = { ok: true };
      return true;
    }, 'offlineReturn:settle');
    if (out && out.ok) {
      // 成功路径：结算袋整体并回（失败路径整袋丢弃 —— 袋里那份 stat/游标从未落到模块态）。
      if (A.box.bag && WA.life && typeof WA.life.commitBag === 'function') {
        try { WA.life.commitBag(A.box.bag); } catch (e) { noteFault('commit-failed'); }
      }
      return { ok: true, tick: tickRes, box: A.box, txOk: !!tx && tx.ok !== false };
    }
    const reason = (out && out.reason) || (tx && tx.aborted ? 'aborted' : 'tx-failed');
    if (tx && tx.denied) noteFault('permission-denied');
    return { ok: false, reason: reason, tick: tickRes, box: A.box, txOk: !!tx && tx.ok !== false };
  }

  /**
   * 一次恢复编排。**同步返回**（deferMs > 0 时返回 deferred 并在下一拍真跑）。
   *
   * 顺序刻意的三处：
   *   ① **先读基准再更新基准**（playtime 头注点名的前置纪律）：「先读取上一份有效活动
   *      基准再决定恢复」——先 touch 会把「你离开了多久」当场抹成 0；
   *   ② 读基准是**纯读**（lastActive），失败与「从没记过」分开报（no-baseline vs 读故障）；
   *   ③ 票据快照取在**事务之前**，事务内复核 —— 中间那段时间正是并发第二次恢复的窗口。
   *
   * @param {{trigger?:string, now?:number}} [opts]
   */
  function recover(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (__running) { stat.skipped++; stat.lastReason = 'busy'; return { ok: false, reason: 'busy' }; }
    // v2.161.0（TP3 时间编排收口）：**判定时刻与推进时刻分域**。
    //   病灶：`gapMs = now - base.at` 里的 now 取的是**决策时间**（clockNow），而 base.at 由
    //   `playtime.touch()` 用**测量时间**（clockWall）写入 —— 一次跨源相减，而 core/clock.js
    //   的头注写得很清楚：「时间分两类，不得混流」。未冻结时两者数值相等，所以这个缺陷
    //   **只在决策时钟被冻结/回放时现形**：时钟一冻，gapMs 当场变成「冻结时刻 − 墙钟基准」，
    //   于是每一次真实离开都被判成 `backward`（或读成一个与事实无关的时长），
    //   而读数上跟「你根本没离开」完全同形。
    //   修法两条，缺一不可：
    //     ① **未注入时刻时**：判定用测量时间（与 base.at 的写入口同源），推进仍用决策时间
    //        （它要写进批次账与存档 —— 那是世界内刻，属决策域）；
    //     ② **注入了 `o.now` 时逐字沿用调用方给的时刻**：那是显式自证（面板显式动作 / 夹具 /
    //        外层已按同一基准算过），契约逐字不变 —— 所以本修复对既有调用点零行为变化。
    // v2.161.0（TP3）：**页面入口的合并窗**。宿主对同一次回前台可能连发多拍（后台节流
    //   恢复时尤其如此），三拍各跑一次编排 = 同一段离线被连推三次；而读数上（recovers）
    //   与「真的离开了三回」完全同形。故按**测量时间**做窗：窗内只跑一次，
    //   拍数与结果分开记（pageCoalesced 回答「合并了几拍」，lastPageReason 回答「那一拍后来怎么了」）。
    //   只在 `trigger` 以 `page-` 开头时生效：总线订阅与工作流节点各有自己的时序，
    //   被这一层窗口改写会让「它们什么时候跑」失去解释。
    const trig = clean(o.trigger || 'manual', 40);
    if (trig.indexOf('page-') === 0) {
      const at = clockWall();
      if (at - __lastResumeAt < PAGE_COALESCE_MS) {
        stat.pageCoalesced++; stat.lastPageReason = 'coalesced';
        return { ok: false, reason: 'coalesced', sinceMs: at - __lastResumeAt, trigger: trig };
      }
      __lastResumeAt = at;
      stat.pageResumes++;
    }
    const injected = num(o.now);
    const gapAt = injected === null ? clockWall() : injected;
    const now = injected === null ? clockNow('offlineReturn') : injected;
    const cid = curChatId();

    // ① 纯读基准
    let base = null;
    try { base = (WA.playtime && typeof WA.playtime.lastActive === 'function') ? WA.playtime.lastActive(cid) : null; }
    catch (e) { base = null; }
    if (!base || base.ok !== true) {
      // 首见：**没有基准不等于走了零秒**，故不结算，只把两本账的起点落下。
      //   起点落盘的唯一写方仍是各自模块（playtime.touch / offlineTick.tick 的 first 分支）。
      let touchedAt = null;
      try { const t = WA.playtime && WA.playtime.touch ? WA.playtime.touch({ force: true }) : null; touchedAt = t && t.ok ? t.at : null; } catch (e) {}
      const f = settle(settledAt(), now, { apply: false });
      stat.firsts++;
      stat.lastReason = 'first-baseline';
      stat.lastAt = clockWall();
      return { ok: true, first: true, chatId: cid, at: touchedAt, reason: 'first-baseline',
        tick: f.ok ? f.tick : null, note: '首次见到这个聊天：只落基准点，不结算' };
    }

    // v2.161.0：与 base.at **同源**（base.at 由 playtime.touch 以 clockWall 写入）——
    //   跨源相减会得到「冻结时刻 − 墙钟基准」，一个既不是也没意义的数。
    const gapMs = gapAt - base.at;
    if (!(gapMs > 0)) {
      // 时钟回拨 / 同刻重入：**不推**，也不改任何账（把负时长当 0 会让「时间倒流」静默消失）。
      stat.skipped++; stat.lastReason = 'backward'; stat.lastGapMs = gapMs;
      // v2.161.0：回拨归因里带上**两个时刻各自的去处**。为什么必须分开报：
      //   只报一个差值时，「时钟被冻住」与「用户把手机时间改乱了」在读数上同形，
      //   而两者处置完全不同（前者是程序环境、后者是用户域）。
      return { ok: false, reason: 'backward', chatId: cid, gapMs: gapMs, at: base.at,
        gapAt: gapAt, decisionAt: now, crossSource: injected === null };
    }

    // ② 短到不可能是一次离开：零写盘早退（刷新页面 / 连续两条消息）。
    //    门槛取 offlineTick 自己的 minGapMs —— 两处各写一个「多短算短」就是第二份真源。
    const tc = tickCfg();
    const minGap = (tc && isFinite(Number(tc.minGapMs))) ? Number(tc.minGapMs) : 60000;
    if (gapMs < minGap) {
      stat.skipped++; stat.lastReason = 'too-short'; stat.lastGapMs = gapMs;
      return { ok: false, reason: 'too-short', chatId: cid, gapMs: gapMs, minGapMs: minGap };
    }

    const plan = { chatId: cid, expected: settledAt(), baseAt: base.at, now: now, gapMs: gapMs, trigger: trig };

    if (cfg.deferMs > 0) {
      try {
        setTimeout(function () { try { run(plan); } catch (e) { noteFault('deferred-throw'); } }, cfg.deferMs);
        stat.lastReason = 'deferred';
        return { ok: true, deferred: true, chatId: cid, gapMs: gapMs, deferMs: cfg.deferMs };
      } catch (e) { noteFault('defer-failed'); }
    }
    return run(plan);
  }

  /** 真跑：防重入 → 票据 → 磁带 → 事务 → 收尾。**任何异常都不上抛**（边界 6）。 */
  function run(plan) {
    __running = true;
    stat.recovers++;
    stat.lastAt = clockWall();
    stat.lastGapMs = plan.gapMs;
    let mode = 'none';
    let failed = false;
    try {
      // 切聊天复核（第一道票据，见边界 4）：defer / 总线两条路径都会走到这里。
      stat.ticketChecks++;
      if (curChatId() !== plan.chatId) {
        stat.staleTickets++; stat.lastReason = 'stale-chat';
        return { ok: false, reason: 'stale-chat', chatId: plan.chatId, found: curChatId() };
      }

      // 磁带：有留卷则重放（重试不改运气），否则起录。
      if (__retryTape) {
        let rp = null;
        try { rp = (WA.rand && WA.rand.replay) ? WA.rand.replay(__retryTape) : null; } catch (e) { rp = null; }
        if (rp && rp.ok) { mode = 'replay'; stat.retries++; }
        else { __retryTape = null; }
      }
      if (mode === 'none') {
        let bt = null;
        try { bt = (WA.rand && WA.rand.beginTape) ? WA.rand.beginTape(true) : null; } catch (e) { bt = null; }
        if (bt && bt.ok) mode = 'record';
        else noteFault((bt && bt.reason) || 'tape-unavailable');
      }

      const r = settle(plan.expected, plan.now, {});
      if (!r.ok) {
        failed = true;
        stat.fails++;
        if (r.reason === 'stale-baseline') stat.staleTickets++;
        noteFault(r.reason);
        return { ok: false, reason: r.reason, chatId: plan.chatId, gapMs: plan.gapMs };
      }
      // 首次真跑成功 ⇒ 这时才占总线监听位（边界 5）。与 bridge 的 ensureSubscribed 同规：
      //   「真在跑，才需要知道世界什么时候变了」—— 打开开关只是意图，跑过才是事实。
      //   关掉不摘：本仓总线无 off，摘不了的东西别假装能摘；回调首行有 enabled 门，关闭时零副作用。
      ensureSubscribed();
      // v2.161.0（TP3）：首个真结算成功后，除总线订阅外再补**页面恢复入口** ——
      //   两处监听各自的门都是同一个「跑过才是事实」判据，不另立第二套。
      ensurePageHook();
      const t = r.tick || {};
      if (t.first) {
        stat.firsts++; stat.lastReason = 'first';
        return { ok: true, first: true, chatId: plan.chatId, gapMs: plan.gapMs, reason: 'first' };
      }
      stat.settleTicks++;
      stat.rounds += (t.rounds || 0);
      stat.protectedRows += (t.protectedRows || 0);
      stat.lastReason = t.applied ? 'settled' : (t.reason || 'no-apply');
      // 成功 ⇒ 基准前移（有界频率；失败路径**不动**基准，好让下次仍算作一次「离开」）。
      try { if (WA.playtime && WA.playtime.touch) WA.playtime.touch({}); } catch (e) {}
      return { ok: true, chatId: plan.chatId, gapMs: plan.gapMs, reason: stat.lastReason,
        rounds: t.rounds || 0, protectedRows: t.protectedRows || 0, applied: !!t.applied,
        capped: !!t.capped, elapsedMs: t.elapsedMs };
    } catch (e) {
      failed = true;
      stat.fails++;
      noteFault('throw');
      try { WA.log('warn', '离线恢复编排异常（不影响推演主链）', e); } catch (e2) {}
      return { ok: false, reason: 'throw', chatId: plan.chatId, gapMs: plan.gapMs };
    } finally {
      // 磁带收尾与 run 的成败无关，且**必须在 finally**：中途 return 不能把会话留在回放态
      //   （留在回放态 = 之后所有随机抽取都走一盘已经用完的磁带）。
      try {
        if (mode === 'replay' && WA.rand && WA.rand.stopReplay) WA.rand.stopReplay();
        else if (mode === 'record' && WA.rand && WA.rand.endTape) {
          const et = WA.rand.endTape();
          // 只在**这一轮真失败**时留卷：成功还留着，下次会拿一盘已经放完的磁带重跑。
          if (failed && et && et.ok && et.tape) __retryTape = et.tape;
        }
      } catch (e) {}
      // 留卷判据只有一条：**这一轮真失败了，且失败发生在录卷的那次**。
      //   其余情形一律清空 —— 尤其**重试成功之后**必须清：留着它，下一次与本批无关的
      //   恢复会重放同一盘旧磁带，把上一批的运气当成这一批的（重试不改运气，但只对本批）。
      if (!failed || mode !== 'record') __retryTape = null;
      __running = false;
    }
  }

  /**
   * 摘要消费：**把「这一批的摘要已经进过正文」这件事落到账上**（SP3 的 markConsumed 口）。
   *   为什么要有这一道而不是「生成块时就算消费」：`buildBlock` 在生成那一刻**无从判断**
   *   这一轮会不会真的把它递进 prompt（预算裁决可能折叠它、可见性开关可能关它）。
   *   唯一现场证据是 `store.lastInjection.sources` —— 它是「本轮真落地了哪些源」的读数。
   *   没有它 ⇒ 报 `not-injected` 并**不记消费**（宁可多注入一次，也不把没发生的事记成发生）。
   */
  function consume(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!WA.offlineTick || typeof WA.offlineTick.summary !== 'function') { noteFault('module-missing'); return { ok: false, reason: 'module-missing' }; }
    stat.consumeChecks++;
    const s = WA.offlineTick.summary();
    if (!s || s.ok !== true) { stat.consumeSkips++; stat.lastReason = (s && s.reason) || 'no-batch'; return { ok: false, reason: (s && s.reason) || 'no-batch' }; }
    if (s.consumed) { stat.consumeSkips++; stat.lastReason = 'already-consumed'; return { ok: true, already: true, reason: 'already-consumed', at: s.consumedAt }; }
    const li = state().lastInjection;
    const sources = (li && Array.isArray(li.sources)) ? li.sources : [];
    if (sources.indexOf(SRC) < 0) {
      stat.consumeSkips++; stat.lastReason = 'not-injected';
      return { ok: false, reason: 'not-injected', chatId: curChatId(), seen: sources.slice(0, 8) };
    }
    if (typeof WA.offlineTick.markConsumed !== 'function') { noteFault('module-missing'); return { ok: false, reason: 'module-missing' }; }
    const now = num(o.now) === null ? clockNow('offlineReturn') : num(o.now);
    let r = null;
    try { r = WA.offlineTick.markConsumed({ now: now }); } catch (e) { r = null; }
    if (r && r.ok) {
      if (!r.already) stat.consumes++;
      stat.lastReason = r.already ? 'already-consumed' : 'consumed';
      return r;
    }
    noteFault((r && r.reason) || 'consume-failed');
    return r || { ok: false, reason: 'consume-failed' };
  }

  function statOf() {
    const cfg = settings();
    const b = state().offlineTick || {};
    const sc = (tickCfg() || {});
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      enabled: !!cfg.enabled, deferMs: cfg.deferMs,
      running: __running, subscribed: __subscribed, hasRetryTape: !!__retryTape,
      pageHookBound: !!__pageHookBound,
      chatId: curChatId(), settledAt: settledAt(),
      offlineTickEnabled: !!sc.enabled, stepMs: sc.stepMs, minGapMs: sc.minGapMs,
      pending: (Array.isArray(b.batches) ? b.batches : []).filter(function (x) { return x && num(x.consumedAt) === null; }).length,
      src: SRC, settingsKey: LS_KEY
    });
  }

  // 导出面**只留被真实消费的口**：`SRC` 不导出（它已由 `stat().src` 暴露 —— 「导出了没人调」
  //   在本仓是一条会红的死债）；`recover` / `consume` 的调用点在两个工作流节点上（见下，
  //   刻意写成**成员调用**，与 evolution 的 `WA.evolution.tick()` 同形）。
  WA.offlineReturn = {
    getSettings: settings,
    setSettings: saveSettings,
    recover: recover,
    consume: consume,
    stat: statOf
  };

  // ── 工作流节点（两个，critical 皆 false —— 边界 6 同规格）──────
  //   · before order 7：**早于全部注入节点**（最早的是 backstage.continuity order 8）。
  //     位置就是这件事的全部意义：本节点恢复出的批次要在**同一轮**的注入链里被念给模型
  //     （晚于注入链跑，玩家要等到下一轮才看得到「你不在时」）。
  //   · after order 41：紧跟 memory.digest（order 40）之后。消费必须在**本轮注入已经落地
  //     之后**判定（lastInjection 是本轮那份），且在下一轮 before 之前 —— 否则下一轮的
  //     buildBlock 会读到一份「还没被记成已消费」的批次，把同一段摘要再念一遍。
  try {
    if (WA.workflow && typeof WA.workflow.register === 'function') {
      WA.workflow.register({
        id: 'offlineReturn.gate', chain: 'before', order: 7, critical: false,
        label: '离线恢复（玩家回来了）',
        async run() { try { WA.offlineReturn.recover({ trigger: 'before-chain' }); } catch (e) { /* 附属面失败不拖主链 */ } }
      });
      WA.workflow.register({
        id: 'offlineReturn.consume', chain: 'after', order: 41, critical: false,
        label: '离线摘要消费',
        async run() { try { WA.offlineReturn.consume({ trigger: 'after-chain' }); } catch (e) { /* 同上 */ } }
      });
    }
  } catch (e) { /* 无工作流环境（纯单测）不阻断模块本体 */ }

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/offline-return.js', { kind: 'engine', ver: '2.161.0' });
})();
