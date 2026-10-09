/**
 * WorldAxis engines/act.js (v2.117.0) — 行动执行（计划二 B1 主体 + B2 前半）
 *
 * ── 它治什么（缺口原句）────────────────────────────────────
 *   计划二 B1 原文：「现有 life.tick 主要写意图与 lastDecision。新增行动执行要接住这些意图，
 *   形成**目标—候选行动—准入—安排—执行—完成或失败—后果**的过程。」
 *   本仓库此前这段**后半截完全不存在**：life.js 只写 `lastDecision`（「他决定怎么做」），
 *   而「他真做成了吗」没有任何落点——于是「决定去做」与「做成了」在状态里长得一样。
 *   这正是本仓库反复治理的「两态不可分」，只是这次落在人物行动上。
 *
 * ── 责任分工（计划原文点名，不得混）──────────────────────
 *   目标表达**想实现什么**（life.goals，真源仍在 life.js）；
 *   行动表达**怎么做**（本模块）；
 *   events 负责**何时可执行**（engines/events.js 的排期面）。
 *   故本模块的行动记录**不复制整份人物档案**，只带：人物 id / 目标 id / 动作种类 /
 *   对象 / 地点 / 必要条件（资源）/ 时间需求（时长、窗口）/ 是否可中断 / 结果依据 / 操作 id。
 *
 * ── 四条否定式（本模块存在的全部理由）──────────────────────
 *   ① **不凭一句话创造世界**。`meet` / `tell` / `work` 三类**没有内置确认器**，
 *      在没有业务确认器时一律以 `unconfirmed` 落成**可见失败**——不得冒充完成。
 *      （计划原文：「不能凭模型一句『已完成』直接创造钱、改变位置或完成任务」。）
 *   ② **不凭空建人**。行动主体必须已在册（`registry` 是唯一写者）；本模块只会
 *      拒收 `missing-person`，不会因为「要写一条行动」顺手多出一个人。
 *   ③ **不凭空生目标**。`admit` 要求行动的目标来源**当场仍是 active**——目标被撤销之后，
 *      挂在它下面的行动不得照常开工（`no-goal`）。
 *   ④ **位置只由世界给**。移动的完成判据是 `world` 的行程表（`departed` / `arrived`），
 *      不是本模块自己算出来的钟点；路不通就是不通（`unreachable`），**不瞬移**。
 *
 * ── 与 A2（v2.116.0）同一套恢复纪律 ────────────────────────
 *   · 每笔行动在**准入**时钉 `opId = id@开工时刻#第几次尝试`（每次重钉、序号自增）；
 *   · 结算台账 `acts.res` 持久化「已完成本地副作用 + 该 opId 的确认」；
 *   · **调用方显式给的 opId 优先**（`wantOp || have`，与 events 同口径）；
 *     `res` 台账里已有同一 opId ⇒ `duplicate-receipt` 拒收且零变化——
 *     「执行后、回报前」崩溃后重试，不得重复扣资源。
 *   · 本轮结算预算 `maxRun`（与 events 的 `maxClaims` 同形）：超额者进 `deferred`
 *     **显式留痕**，不静默跳过。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────
 *   · `meet` 的确认器看的是**世界证据**（双方在该地点该时刻都可容纳，`canBeAt`），
 *     不是「一边说了算」；它证明的是「两人都有条件到场」，不是「两人真的谈成了什么」。
 *   · 「知不知道备用路线」属于认知面（B3），本模块只承认**可达性**证据：
 *     不知道路的人在框架上不会因此自动选对——但「按认知选路」由 B3 落地。
 *   · 租约 / 崩溃恢复只覆盖本模块自己的状态机；跨进程互斥不在范围内（同 events 的口径）。
 *   · **合法不行动**（v2.141.0 F2）：`verdict()` 判**这一笔的结果属于哪一档**
 *     （action / refuse / delay / status-quo，四档不可合并）。它是只读判定面，
 *     **不是写口** —— 本模块的写口仍然只有 add / admit / advance / abort / replan。
 *     本仓此前的现场：准入制答得出「能不能开工」，答不出「他合法地什么都没做」，
 *     于是「没动」与「没算」在状态里同形（缝合自 BSW 推演原则的「行动、拒绝行动、
 *     延迟行动与状态维持均为合法的推演结果」）。
 *   · 总开关默认关闭；关闭时不登记、不准入、不结算、不注入。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.118.0（计划二 B7）：墙钟读取改走**显式执行上下文**（试演期指向隔离时钟）。
  //   形态必须保持 `catch (e) { return Date.now(); }` —— run.js 的 K20 判据只认这一种守卫写法，
  //   换成三元或别的兜底会被判成「产品代码裸调墙钟」（裸调绕过冻结，回放对不上时只能全库通读）。
  // v2.119.0：本行必须同时满足两件事 —— ①`WA.clock.` 与本行的 catch 兜底同行共现
  //   （run.js 的 G20/K20 只认这种写法：走独立取值口时锁**看不见**这条墙钟旁路）；
  //   ② exec 上下文在场时取隔离时钟（试演期是冻结的故事钟）。与原先经取值口的写法
  //   逐字等价：整条表达式同被本 try/catch 包住。
  const clockNow = function (site) { try { return exec() ? exec().now(site || 'act', function () { return WA.clock ? WA.clock.now(site || 'act') : Date.now(); }) : (WA.clock ? WA.clock.now(site || 'act') : Date.now()); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_act_settings_v1';
  const DEF = { enabled: false, maxActs: 8, maxRun: 4, defaultDurationMs: 60000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'act',
    bounds: { maxActs: [1, 24], maxRun: [1, 12], defaultDurationMs: [1000, 3600000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 第一批动作种类（计划原文点名六类，`wait`/`rest` 合并计一条、`move` 单列成两条语义）：
  //   等待/休息、移动、会面/邀约、传话/通知、工作或准备、交付资源。
  const KINDS = ['wait', 'rest', 'move', 'meet', 'tell', 'work', 'deliver'];
  // 状态：活动态与终态**穷尽互斥**（与 events.js 的 ACTIVE/TERMINAL 同口径）。
  const ACTIVE = ['planned', 'running'];
  const TERMINAL = ['done', 'failed', 'aborted', 'replanned'];
  // 一次行动的时长上限（防「排一个跨年的行动」把队列钉死）：7 天。
  const MAX_DURATION = 7 * 24 * 3600 * 1000;
  // **内置确认器**。表里没有的种类 = 没有确认器 ⇒ `unconfirmed` 可见失败。
  //   为什么只有两个：世界能确认「人到了」与「货转了」；其余三类（会面谈成什么、
  //   传话是否被听懂、工作成果如何）需要业务侧确认器，本版**不假装有**。
  const CONFIRMERS = { move: 'world.journey', deliver: 'org.transfer', meet: 'world.canBeAt' };
  // 需要外部确认器、但本版未接的种类（如实登记，供诊断与文档引用同一份真源）。
  const NO_CONFIRMER = ['tell', 'work'];
  // ── 合法不行动（v2.141.0 F2）────────────────────────────────────────
  //   缝合来源：BSW 动态受力推演约束引擎的推演原则（原文逐字）：
  //     「行动、拒绝行动、延迟行动与状态维持（即维持现状）均为合法的推演结果。」
  //     「当当前受力形成稳定僵局时，不强行制造角色行动；允许时间流逝、环境变化、
  //      外部事件或关系互动作为新的输入。」
  //   本仓此前的现场：`admit` 是**准入制**——它答得出「这一笔能不能开工」，
  //   却答不出「他这一轮**合法地什么都没做**」；于是「他没动」在状态里只能表现为
  //   「行数没变」，与「这一轮根本没算」长得一模一样（本仓反复治的两态不可分）。
  //   四种结果的处置完全不同，故**不合并成一个「没行动」**：
  //     action      真做了（本轮有可观察的行动落地）；
  //     refuse      拒绝了（有能力、路也通，但按性格/立场/代价不愿做）——要写理由与代价；
  //     delay       延后了（时辰未到/窗口不合/条件不齐）——条件变了会自动重新显现；
  //     status-quo  维持现状（他在忙别的、目标已撤、或有更重的事）——这一轮合法地没有变化。
  //   边界（如实写明）：本函数只**判定与归类**，不写世界、不改行动状态。
  //   它刻意不是第四个写口 —— 本模块的写口仍然只有 add / admit / advance / abort / replan。
  const VERDICTS = ['action', 'refuse', 'delay', 'status-quo'];
  /** 未受阻的活体行动按种类落档：等待/休息就是「延后」，其余是「真做了」。 */
  function verdictOfRow(row) {
    const k = str((row && typeof row === 'object') ? row.kind : row, 20);
    if (k === 'wait' || k === 'rest') return 'delay';
    return 'action';
  }
  /**
   * 受阻断时的档位映射。**只映射本模块自己的拒收原因**（别处的码不猜）。
   *   不在这张表里的一律落 `refuse` 兜底，并把原码逐字带出（`original`），
   *   而不是悄悄塞进某一档 —— 「为什么没做成」必须能从读数反推回那句拒收。
   */
  const BLOCKED_VERDICT = {
    'busy': 'status-quo',            // 他在做别的事：这一轮合法地没有新变化
    'no-goal': 'status-quo',         // 目标已撤：不是他拒绝，是这件事不再算他的事
    'missing-person': 'status-quo',  // 人不在册：谈不上行动，也谈不上拒绝
    'not-planned': 'status-quo',     // 这一笔本就不在待开工态
    'need-unmet': 'refuse',          // 资源不够：做不了（要写代价与替代）
    'org-missing': 'refuse',         // 连库存真源都没有：做不了
    'unreachable': 'refuse',         // 路不通
    'missing-route': 'refuse',
    'closed': 'delay',               // 门关着：时辰不对，不是不愿
    'window-too-short': 'delay',
    'scheduled-elsewhere': 'status-quo',
    'bad-time': 'delay',
    'world-missing': 'refuse'
  };
  /**
   * 判定面（只读）：**这一笔的合法结果是什么档**。
   *   两种入参形态，都是调用方实际会拿到的东西：
   *     · 传一个动作种类（'wait'/'move'/…）⇒ 未受阻时的档位；
   *     · 传 opts.blockedReason（admit / advance 的拒收码）⇒ 受阻断时的档位。
   *   返回体里 `allowed` 四档齐带 —— 「有哪几档合法」本身是纪律的一部分，
   *   不许让它只活在注释里（本仓点名过的「声明了却没有产生方」）。
   */
  function verdict(kind, opts) {
    const k = str(kind, 20);
    if (KINDS.indexOf(k) < 0) return { ok: false, reason: 'bad-kind', kinds: KINDS.slice() };
    const o = opts || {};
    const hit = str(o.blockedReason, 40);
    let v = verdictOfRow(k), blocked = false;
    if (hit) {
      blocked = true;
      v = BLOCKED_VERDICT[hit] || 'refuse';
    }
    return { ok: true, kind: k, verdict: v, blocked: blocked,
      reason: hit || null, original: hit || null, allowed: VERDICTS.slice(),
      note: '行动、拒绝行动、延迟行动与状态维持都是合法结果：「他没动」不等于「这一轮没算」。' };
  }

  const stat = { added: 0, admitted: 0, completed: 0, failed: 0, aborted: 0, replanned: 0,
    deferred: 0, duplicates: 0, unconfirmed: 0, lastReason: '', faults: {} };
  // ── 计数器门面 S（v2.118.0 · B7）──────────────────────────────────────
  //   `stat` 是**模块自己的**累计读数。试演跑的是同一套执行路径，但它不许在任何面上留痕，
  //   所以计数器也必须跟着执行上下文走。门面按 stat 的键集合用 defineProperty 生成 ——
  //   将来给 stat 添字段时门面自动跟上，不会出现「新字段漏改、试演从此开始污染真计数器」。
  //   getter/setter 双向转发，`S.x++` / `S.x += n` 这类既有写法逐字不改。
  function statOf() { const c = ctxOf(); return (c && c.stat) ? c.stat : stat; }
  const S = (function () {
    const f = {};
    Object.keys(stat).forEach(function (k) {
      Object.defineProperty(f, k, {
        enumerable: true,
        get: function () { return statOf()[k]; },
        set: function (v) { statOf()[k] = v; }
      });
    });
    return f;
  })();
  function noteFault(reason) {
    const tag = String(reason == null ? 'unknown' : reason);
    S.faults[tag] = (S.faults[tag] || 0) + 1;
    return tag;
  }
  /** 字符串字段受控收窄（与 events.js 的 str 同口径：非字符串一律视为空，不做字符串化兜底）。 */
  function str(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }
  /** 有限数收窄：NaN / ±Infinity / 空串 / 布尔一律 NaN（`Number('')===0` 是陷阱）。 */
  function finite(v) {
    if (v === undefined || v === null || v === '' || typeof v === 'boolean') return NaN;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : str(v, max); }
  // ── 显式执行上下文（v2.118.0 · 计划二 B7 的承重结构）────────────────────────
  //   计划二 B7 原文：「真实运行与试演使用同样的准入、冲突与效果处理，**执行上下文显式传入**。」
  //   此前本模块把执行上下文**隐式钉死在全局**（直呼 `WA.store` / `WA.clock`），于是
  //   「在副本上跑一遍真规则」这件事没有立足点：要么另写一套推进规则（两份实现必然漂移），
  //   要么把真世界改掉（试演就不是试演了）。两种都不是本仓接受的答案。
  //
  //   本段只做一件事：把「这一次执行在世界、时钟、副作用上的去向」收成**一个显式对象**。
  //   上下文栈本体在 `core/exec.js`（正式格，与 world.js 的行程面共用同一份栈 ——
  //   共用是关键：试演期 action 写「人已出发」，世界必须能看见那趟行程）。
  //
  //   为什么不用「模块级临时变量」：临时变量是不可见的全局状态，一次 early return 就能
  //   把后续整局的执行都指向副本（v2.89.0 O2 的录制态漏出是同一形态的病）。显式传入
  //   在调用点就看得见，stack 上也看得见。
  //
  //   降级可见：`core/exec.js` 缺席时**一律按真世界执行**（与 v2.117.0 逐字一致）——
  //   此时试演入口会以 `exec-absent` 拒收，而不是在真世界上跑一次假试演。
  function exec() { return (WA.exec && typeof WA.exec.withContext === 'function') ? WA.exec : null; }
  function ctxOf() {
    const e = exec();
    return e ? e.current() : null;
  }
  function worldOf() {
    const e = exec();
    return e ? e.worldOf(WA.world) : WA.world;
  }
  function storeOf() {
    const e = exec();
    return e ? e.storeOf(WA.store) : WA.store;
  }
  /** 副作用去向：真跑走 store.transact，试演写进调用方给的 sink（唯一分岔点，在 core/exec.js）。 */
  function mutate(facade, fn, opt) {
    const e = exec();
    if (!e) return (facade && typeof facade.transact === 'function')
      ? facade.transact(fn, opt) : { ok: false, reason: 'store-absent' };
    return e.mutate(facade, fn, opt);
  }
  function state() { const s = storeOf(); return s && s.get ? (s.get() || {}) : {}; }
  function acts() {
    const a = state().acts;
    const rows = (a && typeof a === 'object' && Array.isArray(a.rows)) ? a.rows : [];
    return rows;
  }
  function receipts() {
    const a = state().acts;
    return (a && typeof a === 'object' && Array.isArray(a.res)) ? a.res : [];
  }
  /**
   * v2.117.0：**活动候选**里是否已有同一幂等键。
   *   只看结算台账 `res` 会漏掉「已登记、未结算」的那一笔 —— 于是同一个键能反复登记，
   *   候选表长出 N 条同键行，而它们共享（最后一条的）回执：两态不可分在候选表上的形态。
   *   终态行在结算/中止时已清空 opId，故此处命中必是活动候选。
   */
  function hotOpId(rows, op) {
    return rows.filter(function (x) { return x && x.opId && x.opId === op; })[0] || null;
  }
  function find(id) {
    const k = clean(id, 60);
    return acts().filter(function (x) { return x && x.id === k; })[0] || null;
  }
  /**
   * 终态判据。**接受行对象或状态字符串两种形态**。
   *   v2.117.0 修复：此前只认行对象（读 `x.status`），而 `replan` 的两处调用点传的是状态字符串
   *   ⇒ `'aborted'.status === undefined` ⇒ 判据**恒假**。表现：已中止/已完成的行动还能被改计划
   *   并复活成新的 planned 行 ——「这一笔已经结束了」与「这一笔还能改」两态不可分。
   */
  function isTerminal(x) {
    const s = (x && typeof x === 'object') ? x.status : x;
    return TERMINAL.indexOf(s) >= 0;
  }
  function personRow(name) {
    const k = 'p_' + clean(name, 60);
    const p = (state().people || {})[k];
    return (p && typeof p === 'object') ? p : null;
  }
  /** 人物当前有个**在册且 active** 的目标？——行动的目标来源判据（否定式 ③）。 */
  function activeGoal(p, goalId) {
    if (!p) return null;
    const lf = p.life;
    const goals = (lf && Array.isArray(lf.goals)) ? lf.goals : [];
    return goals.filter(function (x) { return x && x.id === goalId && x.status === 'active'; })[0] || null;
  }
  /** 该人物此刻是否已有 running 行动（同一时刻只能做一件事）。 */
  function runningOf(name) {
    const who = clean(name, 60);
    return acts().filter(function (x) { return x && x.person === who && x.status === 'running'; })[0] || null;
  }
  function stock(person) {
    const p = personRow(person);
    if (!p) return null;
    if (WA.org && typeof WA.org.stockOf === 'function') return WA.org.stockOf(p);
    // org 缺席时**不猜库存**：返回 null 由调用方拒收 `org-missing`（本仓最贵的一类默认值）。
    return null;
  }

  /**
   * 登记一条候选行动。**只登记，不开工**——准入是 admit 的事。
   *   拒收一律零变化（与 events.schedule 的「先纯校验、后落地」同规）。
   */
  function add(person, spec) {
    const cfg = settings();
    if (!cfg.enabled) { S.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(person, 60), it = spec || {};
    if (!who) return { ok: false, reason: 'missing-person' };
    const kind = str(it.kind, 20);
    if (KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kinds: KINDS.slice() };
    const p = personRow(who);
    if (!p) return { ok: false, reason: 'missing-person', person: who };   // 否定式 ②：不凭空建人
    const goalId = str(it.goalId, 60);
    if (!goalId) return { ok: false, reason: 'missing-goal' };
    if (!activeGoal(p, goalId)) return { ok: false, reason: 'unknown-goal', goalId: goalId };
    // 时长：显式给的优先（clamp 到上限），否则用设置里的默认「一件事大概多久」。
    const rawDur = finite(it.duration);
    const duration = (rawDur > 0) ? Math.min(Math.round(rawDur), MAX_DURATION) : cfg.defaultDurationMs;
    const need = it.need && typeof it.need === 'object' ? it.need : {};
    const amount = finite(need.amount);
    const resource = str(need.resource, 30);
    if (resource && !(amount > 0)) return { ok: false, reason: 'bad-need' };
    // **调用方显式给的 opId 优先**（与 events.complete 的 `wantOp || have` 同口径）。
    //   台账里已有同一 opId ⇒ 这是「重放」，拒收且零变化（重复不重复扣资源）。
    const wantOp = str(it.opId, 80);
    if (wantOp) {
      // 幂等键查**两处**：活动候选（已登记未结算）与结算台账（已完成）。
      //   只查台账 ⇒ 同一个键可以反复登记，候选表里长出同键的 N 条行，
      //   而它们共享一条回执；「执行后、回报前」的重试于是二次落账。
      const hot = hotOpId(acts(), wantOp);
      const cold = receipts().some(function (q) { return q && q.opId === wantOp; });
      if (hot || cold) {
        S.duplicates++;
        return { ok: false, reason: 'duplicate-receipt', opId: wantOp, on: hot ? hot.status : 'receipt' };
      }
    }
    let out = null;
    mutate(storeOf(), function (draft) {
      draft.acts = (draft.acts && typeof draft.acts === 'object' && !Array.isArray(draft.acts))
        ? draft.acts : { rows: [], res: [] };
      draft.acts.rows = Array.isArray(draft.acts.rows) ? draft.acts.rows : [];
      const now = clockNow('act');
      const row = {
        id: 'act_' + now + '_' + draft.acts.rows.length,
        person: who, goalId: goalId, kind: kind,
        text: str(it.text, 80), with: str(it.with, 60), target: str(it.target, 60),
        item: str(it.item, 30), amount: amount > 0 ? Math.round(amount) : 0,
        from: str(it.from, 40), to: str(it.to, 40),
        place: str(it.place, 40), use: str(it.use, 30),
        need: resource ? { resource: resource, amount: Math.round(amount) } : null,
        duration: duration, interruptible: it.interruptible !== false,
        status: 'planned', attempts: 0, opId: wantOp,
        spent: 0, left: duration, dueAt: 0, startedAt: 0, endedAt: 0,
        departed: false, arriveAt: 0,
        result: '', reason: '', evidence: '', blockedBy: '', from_: str(it.from_, 60),
        at: now
      };
      draft.acts.rows.push(row);
      // 挤出走单一出口（cap 的单一真源是 core/evict.js 的 SITES，与 store.__BOUNDED_CAPS 同源）。
      WA.evict.array(draft.acts.rows, 'acts.rows', cfg.maxActs);
      out = { ok: true, id: row.id, duration: duration };
    }, 'act:add');
    if (out && out.ok) { S.added++; S.lastReason = 'added'; } else if (!out) S.lastReason = 'store-unavailable';
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 准入：这一刻这个人**能不能开始做这件事**。
   *   全部判据只读，拒收不进事务（「拒收却推进 rev / 半条记录落盘」没有立足点）。
   *   顺序刻意从「这件事本身」到「世界条件」：行动不存在 → 目标失效 → 忙 → 资源 → 地点/窗口 → 路线。
   */
  function admit(id, at, opts) {
    const cfg = settings();
    if (!cfg.enabled) { S.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const row = find(id);
    if (!row) return { ok: false, reason: 'missing', id: clean(id, 60) };
    if (row.status !== 'planned') return { ok: false, reason: 'not-planned', status: row.status };
    const t = finite(at);
    if (!isFinite(t)) return { ok: false, reason: 'bad-time' };
    // 目标来源（否定式 ③）：目标被撤销 ⇒ 挂在它下面的行动不得照常开工。
    const p = personRow(row.person);
    if (!p) return { ok: false, reason: 'missing-person', person: row.person };
    if (!activeGoal(p, row.goalId)) return { ok: false, reason: 'no-goal', goalId: row.goalId };
    // 同一时刻只能做一件事（第二条被拒并归因，不静默覆盖先前的安排）。
    const busy = runningOf(row.person);
    if (busy) return { ok: false, reason: 'busy', running: busy.id, kind: busy.kind };
    // 必要条件：资源不够就是不够，不把负数伪装成成功。
    if (row.need) {
      const st = stock(row.person);
      if (st === null) return { ok: false, reason: 'org-missing' };
      const have = finite(st[row.need.resource]);
      if (!(have >= row.need.amount)) return { ok: false, reason: 'need-unmet', resource: row.need.resource, have: isFinite(have) ? have : 0, want: row.need.amount };
    }
    // 移动：先把「路走得通吗」问清楚，并把耗时钉在行上（时长不得短于路的耗时）。
    let travel = null;
    if (row.kind === 'move') {
      if (!row.from || !row.to) return { ok: false, reason: 'missing-route' };
      if (!worldOf() || typeof worldOf().reach !== 'function') return { ok: false, reason: 'world-missing' };
      const r = worldOf().reach(row.from, row.to);
      if (!r || r.ok === false) return { ok: false, reason: (r && r.reason) || 'unreachable', from: row.from, to: row.to };
      if (!r.reachable) return { ok: false, reason: 'unreachable', from: row.from, to: row.to };
      travel = r;
    }
    // 地点与时间窗口：地点必须先登记；窗口必须容得下这一件事（含路上的时间）。
    let win = null;
    if (row.place) {
      if (!worldOf() || typeof worldOf().canBeAt !== 'function') return { ok: false, reason: 'world-missing' };
      const needMs = (travel ? travel.minutes * 60000 : 0) + row.duration;
      // v2.117.0（B2 前半）：把 `row.use` 一并传下去。此前这里只传 4 参 ——
      //   于是「办公室值班」与「随便哪会儿去办公室」在准入上**完全同形**，
      //   场所用途窗口在准入路径上等于不存在（声明了、没人消费）。
      //   第五参是给程序的（只回 ok/reason）；作者要看的「几点开、差多少」走面板的用途窗口入口。
      const w = worldOf().canBeAt(row.person, row.place, t, needMs, row.use);
      if (!w || w.ok !== true) return { ok: false, reason: (w && w.reason) || 'unknown-place', detail: w || null };
      win = w;
    }
    // 落盘：状态、开工时刻、到期时刻、操作 id（**每次尝试重钉、序号自增**）。
    let out = null;
    mutate(storeOf(), function (draft) {
      const rows = (draft.acts && Array.isArray(draft.acts.rows)) ? draft.acts.rows : [];
      const x = rows.filter(function (y) { return y && y.id === row.id; })[0];
      if (!x || x.status !== 'planned') { out = { ok: false, reason: 'not-planned', status: x ? x.status : 'missing' }; return false; }
      x.attempts = (x.attempts || 0) + 1;
      x.status = 'running';
      x.startedAt = t;
      x.duration = travel ? travel.minutes * 60000 : x.duration;
      x.left = x.duration;
      x.dueAt = t + x.duration;
      // v2.117.0（B2「旅行中的改道和中止」）：**离开的那一刻就是出发那一刻**。
      //   旧写法把 `world.depart` 推迟到 `resolve()`（只在 `t >= dueAt` 时才被调用），
      //   而 dueAt = 离场时刻 + 全程、depart 给出的 arriveAt 也是 离场时刻 + 全程 ⇒ 两式必然相等：
      //     人「已经在路上」这段时间在状态里的**宽度恒为 0**，行程永不落盘，
      //     `abort → world.stop`（中止在途者、标 halted、不猜位置）那整支**不可达**。
      //   世界拒绝出发 ⇒ 本笔零变化拒收（事务整体回滚：状态/开工时刻/到期时刻一格都不落）。
      // v2.119.0（出口面信号修复）：真跑支**逐字写全** `WA.world.depart/arrive/stop`，并保持
      //   `WA` `.` `world` `.` `<mem>` 三 token 相邻 —— 本仓引用面正则只认这一种形态
      //   （README v2.11.0 的既定先例：`_S.html(s)` 被改回 `WA.sanitize.html(s)`，
      //    判词是「真在用的东西不许看起来像死的」）。此前只经 `worldOf()` 取值，
      //   成员名字面落在 core/exec.js，于是这三项在静态面上「零产品引用」，
      //   契约会记下**与事实相反**的证据。
      //   语义逐字不变：exec 上下文缺席时 `worldOf()` 恒等于 `WA.world`（「降级可见」口径），
      //   两支同值；上下文在场时（试演）仍取隔离世界，路径与改前一致。
      if (travel && worldOf() && typeof worldOf().depart === 'function') {
        const d = (exec() ? worldOf().depart : WA.world.depart)(x.person, x.from, x.to, t);
        if (!d || d.ok !== true) {
          out = { ok: false, reason: (d && d.reason) || 'depart-failed', detail: (d && d.reason) || 'unknown' };
          return false;
        }
        x.departed = true;
        // 到达时刻由**世界**给出（否定式 ④：位置与钟点只由世界给，本模块不自算）。
        x.arriveAt = finite(d.arriveAt) || (t + x.duration);
        x.dueAt = x.arriveAt;
      }
      // opId：调用方显式给过就沿用（幂等键由调用方持有），否则按次重钉。
      if (!x.opId) x.opId = x.id + '@' + Math.floor(t) + '#' + x.attempts;
      out = { ok: true, id: x.id, opId: x.opId, dueAt: x.dueAt, duration: x.duration,
        travel: travel ? { minutes: travel.minutes, path: travel.path.slice() } : null,
        window: win ? { place: win.place, at: win.at, until: win.until } : null };
    }, 'act:admit');
    // 出发被世界拒绝（路封了、人在别处、开关关了）⇒ **零变化拒收**，且必须记成 fault：
    //   这一笔没有开工，把它算进 admitted 是最贵的一类谎。
    if (out && out.ok) { S.admitted++; S.lastReason = 'admitted'; }
    else if (out && out.reason) { noteFault(out.reason); S.lastReason = out.reason; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 写一条结算回执：**已完成本地副作用 + 该 opId 的确认一起持久化**。 */
  function receipt(draft, row, status, result, evidence, t, cfg) {
    draft.acts.res = Array.isArray(draft.acts.res) ? draft.acts.res : [];
    draft.acts.res.push({ opId: row.opId || '', id: row.id, person: row.person, kind: row.kind,
      status: status, result: str(result, 120), evidence: str(evidence, 40), at: t });
    WA.evict.array(draft.acts.res, 'acts.res', cfg.maxActs);
  }
  /**
   * 结算一条到期的活动作。返回 `{ status, result, evidence }` 形态的结论；**不改世界**的部分
   *   一律委托出去：移动问 world，交付问 org，会面问 world 的证据面。
   */
  function resolve(row, t) {
    const kind = row.kind;
    if (kind === 'wait' || kind === 'rest') return { status: 'done', result: '到时结束', evidence: 'self' };
    if (kind === 'move') {
      if (!worldOf()) return { status: 'failed', result: 'world 缺席', evidence: '' };
      if (!row.departed) {
        // v2.117.0：**兜底**路径。出发本应在 `admit` 时发生；走到这里的是升级前登记的 running 行
        //   （没有 `departed` 标记）。升级不该让在途的人消失，故保留一次补出发。
        const d = (exec() ? worldOf().depart : WA.world.depart)(row.person, row.from, row.to, row.startedAt);
        if (!d || d.ok !== true) return { status: 'failed', result: '出发被拒：' + ((d && d.reason) || 'unknown'), evidence: 'world.depart', reason: (d && d.reason) || 'unknown' };
        row.departed = true; row.arriveAt = d.arriveAt;
        // 兜底路径同样让「在途段」有宽度：到期时刻不得早于世界给出的到达时刻。
        if (isFinite(d.arriveAt) && d.arriveAt > row.dueAt) row.dueAt = d.arriveAt;
        return { status: 'running', result: '已在途中', evidence: 'world.depart' };
      }
      if (t < row.arriveAt) return { status: 'running', result: '仍在途中', evidence: 'world.journey' };
      const a = (exec() ? worldOf().arrive : WA.world.arrive)(row.person, t);
      if (a && a.ok === true && a.arrived === true) return { status: 'done', result: '到达 ' + row.to, evidence: 'world.journey' };
      return { status: 'running', result: '行程未结算', evidence: 'world.journey' };
    }
    if (kind === 'deliver') {
      if (!WA.org || typeof WA.org.transfer !== 'function') return { status: 'failed', result: 'org 缺席', evidence: '' };
      const r = WA.org.transfer('person', row.person, 'person', row.target, row.item, row.amount);
      if (!r || r.ok !== true) return { status: 'failed', result: '交付被拒：' + ((r && r.reason) || 'unknown'), evidence: 'org.transfer', reason: (r && r.reason) || 'unknown' };
      return { status: 'done', result: row.item + '×' + row.amount + ' → ' + row.target, evidence: 'org.transfer' };
    }
    if (kind === 'meet') {
      if (!worldOf() || typeof worldOf().canBeAt !== 'function') return { status: 'failed', result: 'world 缺席', evidence: '' };
      if (!row.with || !row.place) return { status: 'failed', result: '会面缺对方或地点', evidence: 'world.canBeAt', reason: 'missing-fields' };
      // 世界能确认的是「两人都有条件到场」——**不是**「两人谈成了什么」（边界如实写在此处）。
      const a = worldOf().canBeAt(row.person, row.place, t);
      const b = worldOf().canBeAt(row.with, row.place, t);
      if (a && a.ok === true && b && b.ok === true) return { status: 'done', result: '双方到场条件成立（' + row.place + '）', evidence: 'world.canBeAt' };
      return { status: 'failed', result: '会面条件不成立：' + ((b && b.reason) || (a && a.reason) || 'unknown'), evidence: 'world.canBeAt', reason: (b && b.reason) || (a && a.reason) || 'unknown' };
    }
    // tell / work：**没有内置确认器** ⇒ 可见失败，不冒充完成（否定式 ①）。
    return { status: 'failed', result: '无确认器：' + kind + ' 需要业务侧确认', evidence: '', reason: 'unconfirmed' };
  }

  /**
   * 结算所有到点的活动作（世界心跳调用）。预算 `maxRun` 之外的一律进 `deferred` 显式留痕。
   * 已终态的行不动；台账里已有同一 opId 的回执 ⇒ 视为重放，**零变化**并计入 duplicates。
   */
  function advance(at, opts) {
    const cfg = settings();
    if (!cfg.enabled) { S.lastReason = 'disabled'; return { ok: true, changed: 0, reason: 'disabled' }; }
    const t = finite(at);
    if (!isFinite(t)) return { ok: false, reason: 'bad-time' };
    const o = opts || {};
    const budget = (finite(o.max) > 0 && finite(o.max) <= cfg.maxRun) ? Math.floor(finite(o.max)) : cfg.maxRun;
    let out = { changed: 0, completed: 0, failed: 0, still: 0, deferred: [], duplicates: 0 };
    mutate(storeOf(), function (draft) {
      const rows = (draft.acts && Array.isArray(draft.acts.rows)) ? draft.acts.rows : [];
      const res = (draft.acts && Array.isArray(draft.acts.res)) ? draft.acts.res : [];
      let used = 0;
      rows.forEach(function (x) {
        if (!x || x.status !== 'running') return;
        if (!(t >= x.dueAt)) return;
        // 重放守卫：这一笔的操作 id 已在台账里 ⇒ 不得二次结算（重复不重复扣资源）。
        if (x.opId && res.some(function (q) { return q && q.opId === x.opId; })) {
          x.status = 'done'; x.endedAt = t; x.result = '重放已忽略'; x.evidence = 'receipt';
          x.spent = x.duration; x.left = 0; x.opId = '';
          out.duplicates++;
          return;
        }
        if (used >= budget) { out.deferred.push({ id: x.id, person: x.person, kind: x.kind, reason: 'budget', dueAt: x.dueAt }); return; }
        used++;
        const r = resolve(x, t) || { status: 'failed', result: 'unknown', evidence: '' };
        if (r.status === 'running') { out.still++; return; }
        x.status = r.status;
        x.result = str(r.result, 120);
        x.evidence = str(r.evidence, 40);
        if (r.status === 'failed') { x.reason = str(r.reason || 'failed', 40); out.failed++; }
        else { x.reason = ''; out.completed++; }
        x.spent = Math.max(0, Math.min(x.duration, t - x.startedAt));
        x.left = Math.max(0, x.duration - x.spent);
        x.endedAt = t;
        receipt(draft, x, r.status, r.result, r.evidence, t, cfg);
        // 终态清空 opId（与 v2.116.0 的第 ③ 条同规：台账老化后终态不得被回卷重跑）。
        x.opId = '';
      });
    }, 'act:advance');
    out.changed = out.completed + out.failed;
    S.completed += out.completed; S.failed += out.failed;
    S.deferred += out.deferred.length; S.duplicates += out.duplicates;
    S.lastReason = out.changed ? 'settled' : (out.still ? 'in-progress' : (out.deferred.length ? 'budget' : 'nothing-to-do'));
    return Object.assign({ ok: true, reason: S.lastReason }, out);
  }

  /**
   * 中止（B2 的「旅行中的改道和中止」）：**已消耗部分与未执行部分分别落账**，
   *   `spent` / `left` 各记一格。在途者中止时交给 `world.stop`——
   *   世界侧把行程标成 `halted` 并**不猜位置**（既不停在出发地，也不假装已到达）。
   */
  function abort(id, why, at) {
    const cfg = settings();
    if (!cfg.enabled) { S.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const row = find(id);
    if (!row) return { ok: false, reason: 'missing', id: clean(id, 60) };
    if (row.status !== 'running') return { ok: false, reason: 'not-running', status: row.status };
    const t = finite(at);
    if (!isFinite(t)) return { ok: false, reason: 'bad-time' };
    let halt = null;
    if (row.departed && worldOf() && typeof worldOf().stop === 'function') {
      halt = (exec() ? worldOf().stop : WA.world.stop)(row.person, t, str(why, 40) || 'aborted');
    }
    let out = null;
    mutate(storeOf(), function (draft) {
      const rows = (draft.acts && Array.isArray(draft.acts.rows)) ? draft.acts.rows : [];
      const x = rows.filter(function (y) { return y && y.id === row.id; })[0];
      if (!x || x.status !== 'running') { out = { ok: false, reason: 'not-running', status: x ? x.status : 'missing' }; return false; }
      x.status = 'aborted';
      x.endedAt = t;
      x.reason = str(why, 40) || 'aborted';
      x.spent = Math.max(0, Math.min(x.duration, t - x.startedAt));
      x.left = Math.max(0, x.duration - x.spent);
      x.result = '中止（已消耗 ' + x.spent + 'ms / 未执行 ' + x.left + 'ms）';
      // v2.117.0 修复：终态清空 opId 必须**排在回执之后**。
      //   旧序（先清后写）让中止回执永远带空 opId —— 而 opId 是那一笔去重键的唯一载体，
      //   于是「执行后、回报前」崩溃重放会在中止路径上二次落账（与 v2.116.0 第 ③ 条同族）。
      receipt(draft, x, 'aborted', x.result, halt ? 'world.stop' : 'self', t, cfg);
      x.opId = '';
      out = { ok: true, id: x.id, spent: x.spent, left: x.left, halted: !!(halt && halt.ok) };
    }, 'act:abort');
    if (out && out.ok) { S.aborted++; S.lastReason = 'aborted'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 重规划（B1 的「受阻后改计划」）：旧行变 `replanned` 并留痕，新行带 `from_` 指回旧行。
   *   在途者**不得**用本入口改道——那时人或货已经在路上，必须走 `abort` 把已消耗部分落账，
   *   否则「改道」会把一段真实走过的路抹成没发生。
   */
  function replan(id, spec, at) {
    const cfg = settings();
    if (!cfg.enabled) { S.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const row = find(id);
    if (!row) return { ok: false, reason: 'missing', id: clean(id, 60) };
    if (isTerminal(row.status)) return { ok: false, reason: 'not-active', status: row.status };
    if (row.status === 'running' && row.departed) return { ok: false, reason: 'in-transit', id: row.id };
    const t = finite(at);
    if (!isFinite(t)) return { ok: false, reason: 'bad-time' };
    const it = Object.assign({}, row, spec || {});
    it.goalId = row.goalId; it.opId = str((spec || {}).opId, 80);
    let out = null;
    mutate(storeOf(), function (draft) {
      const rows = (draft.acts && Array.isArray(draft.acts.rows)) ? draft.acts.rows : [];
      const x = rows.filter(function (y) { return y && y.id === row.id; })[0];
      if (!x || isTerminal(x.status)) { out = { ok: false, reason: 'not-active', status: x ? x.status : 'missing' }; return false; }
      if (x.status === 'running' && x.departed) { out = { ok: false, reason: 'in-transit', id: x.id }; return false; }
      x.status = 'replanned'; x.endedAt = t; x.reason = 'replanned';
      x.spent = x.startedAt ? Math.max(0, Math.min(x.duration, t - x.startedAt)) : 0;
      x.left = Math.max(0, x.duration - x.spent);
      x.result = '改计划'; x.opId = '';
      out = { ok: true, id: x.id };
    }, 'act:replan');
    if (!out || !out.ok) return out || { ok: false, reason: 'store-unavailable' };
    S.replanned++;
    // v2.117.0 修复（专锁 tests/act-b1-v2117.js 抓出）：thunk **必须带 goalId**。
    //   上面那句 `it.goalId = row.goalId` 只管到了 it —— 而 add() 只从 spec 里读 goalId，
    //   于是改计划永远以 missing-goal 失败：B1 的「受阻后改计划」这条能力整条不存在。
    //   改计划继承**原计划的目标来源**（新计划不是新目标），这是唯一正确的取值。
    const thunk = { kind: it.kind, text: it.text, with: it.with, target: it.target, item: it.item,
      amount: it.amount, from: it.from, to: it.to, place: it.place, use: it.use,
      goalId: row.goalId,
      need: it.need, duration: it.duration, interruptible: it.interruptible, from_: row.id };
    const n = add(row.person, thunk);
    if (n && n.ok) { S.lastReason = 'replanned'; n.replannedFrom = row.id; }
    return n;
  }

  /** 只读视图（面板 / 诊断消费）：按状态分列，只报事实，不做解释。 */
  function view(opts) {
    const o = opts || {};
    const lim = (finite(o.limit) > 0) ? Math.floor(finite(o.limit)) : 12;
    const rows = acts();
    const byStatus = {};
    rows.forEach(function (x) { if (x && x.status) byStatus[x.status] = (byStatus[x.status] || 0) + 1; });
    const open = rows.filter(function (x) { return x && ACTIVE.indexOf(x.status) >= 0; });
    const recent = rows.slice(-lim).map(function (x) {
      return { id: x.id, person: x.person, kind: x.kind, status: x.status, place: x.place,
        startedAt: x.startedAt, dueAt: x.dueAt, spent: x.spent, left: x.left,
        result: x.result, evidence: x.evidence, reason: x.reason };
    });
    return { ok: true, total: rows.length, open: open.length, byStatus: byStatus,
      receipts: receipts().length, recent: recent,
      // 哪些种类**没有**确认器，如实带出（诊断不许把它显示成「正常无事」）。
      noConfirmer: NO_CONFIRMER.slice(), confirmers: Object.assign({}, CONFIRMERS) };
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const rows = acts().filter(function (x) { return x && ACTIVE.indexOf(x.status) >= 0; }).slice(0, cfg.maxRun);
    if (!rows.length) return '';
    const lines = rows.map(function (x) {
      const left = (x.status === 'running' && x.dueAt) ? '，预计 ' + Math.max(0, x.dueAt - clockNow('act')) + 'ms 后结束' : '';
      const where = x.place ? '（' + x.place + '）' : (x.departed ? '（在途中，位置未知）' : '');
      return x.person + '：' + x.kind + (x.text ? '「' + x.text + '」' : '') + where + ' ' + x.status + left;
    });
    return '[人物行动]\n' + lines.join('\n')
      + '\n行动必须有目标来源；**没有确认器的行动不得写成已完成**，在途者的位置未知时不得替他指定所在。\n';
  }

  WA.act = {
    KINDS: KINDS, ACTIVE: ACTIVE, TERMINAL: TERMINAL, CONFIRMERS: CONFIRMERS, NO_CONFIRMER: NO_CONFIRMER,
    // v2.141.0（F2）：四档合法结果同表导出（面板与诊断都要判档，各写一份必然漂移）。
    VERDICTS: VERDICTS.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    add: add, admit: admit, advance: advance, abort: abort, replan: replan, view: view, buildBlock: buildBlock,
    // 判定面（只读）：这一笔的合法结果落在哪一档。**不是写口**，不动行动状态（见头部边界）。
    verdict: verdict,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  // ── 工作流节点注册（v2.117.0）─────────────────────────────────────────
  //   为什么必须有这一段：`advance` 的注释自称「世界心跳调用」，但**全库零调用点** ——
  //   注释说得好听、真跑起来永远不会被调用，这正是本仓点名的「功能级失效」
  //   （导出了 API 但零消费方）。挂进 after 链之后，「到点结算」才真的每轮发生。
  //   位置理由（三条都是硬约束，不是偏好）：
  //     · 必须在 **after** 链：行动结算读的是世界行程表，而行程是世界侧在推演里写的；
  //       排在 before 会拿上一轮的行程去算本轮该不该到达。
  //     · 必须晚于 `backstage.simulate`（order 20）：后台推演会写 life.goals 与 world 行程，
  //       结算排在它之前 ⇒ 本轮新产生的行程要等下一轮才算，读数整整慢一拍。
  //     · 必须早于 `parallel.simulate`（order 22）：平行世界是**主线之外**的独立推演，
  //       不得插在「主线行动」与「世界」之间。故 order 取 21。
  //   带守卫调用（与 calendar.js / bridge.js / wb-inject.js 同规）：core/workflow.js 缺席时
  //   不静默半截 —— 结算入口不可用本身就该在 moduleRegistry 里现形，而不是这里抛错。
  if (WA.workflow && typeof WA.workflow.register === 'function') {
    WA.workflow.register({
      id: 'act.advance', chain: 'after', order: 21, critical: false,
      label: '人物行动结算',
      async run() {
        // 时刻取**真实墙钟**：与 events / calendar 的自动推进同口径（推演时刻由那些模块写进状态，
        //   此处要的是「现在该结算了」，不是「故事里第几天」）。
        //   v2.117.0：本行原先写的是 `WA.clock && typeof WA.clock.now === 'function' ? … : Date.now()`
        //   —— 那是**全库唯一一种不被 K20 判据认下的墙钟写法**（判据只放行 `WA.clock ?` 这一种三元）。
        //   裸调绕过冻结，回放对不上时只能全库通读；此处改回与 core/rand.js 同规的写法。
        const t = (WA.clock ? WA.clock.now('act.advance') : Date.now());
        return WA.act.advance(t, { max: 2 });
      }
    });
  }
})();
