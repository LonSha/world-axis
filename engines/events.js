/**
 * WorldAxis engines/events.js (v2.291.0) — 事件调度（第十五面：排期 ≠ 触发）
 *
 * 为什么需要它（与既有四处的分工，先说清不重复）：
 *   · engines/causal.js          —— 因果链：原因→条件→行动→后果。**结算面**（事情怎么发生）。
 *   · engines/parallel-events.js —— 场外事件：此刻别处在发生什么。**登记面**（防全知）。
 *   · engines/direct-event.js    —— 突发事件：一轮生成、多轮解封。**叙事面**。
 *   · core/workflow.js           —— 生成链节点：before/after 两链的顺序执行。**管线面**。
 *   这四处都碰「事件」，但**没有一处回答「排期」两个字**：谁被排在什么时候、
 *   到点该不该动、动了之后下一次什么时候、失败了怎么办、同一件事会不会被触发两次。
 *   真实缺口（本仓库此前零覆盖）：
 *     ① 一次性 / 延迟 / 周期 / 条件触发 —— 四种排期语义此前没有统一承载；
 *     ② **同一事件不得被无意重复执行** —— 没有「认领」这道闸，调用方只能靠自觉；
 *     ③ **条件不满足 ≠ 执行失败** —— 二者此前共用一句 reason，读面上不可分；
 *     ④ 执行失败要有明确回滚策略与失败队列，且不能让单个失控事件拖垮整轮。
 *
 * 三态口径（本模块存在的全部意义）：
 *   ① **排期 ≠ 触发 ≠ 已发生**。`pending`（已排期待触发）/ `claimed`（已认领未回报）
 *      / `executed|exhausted|cancelled|failed`（终态）**四态各自成词**。
 *      为什么必须把 `claimed` 单列：没有它，「本轮没有到期事件」与「有一个事件正在执行、
 *      还没回报」在读数上是同一句话——这正是本仓库反复治理的「两态不可分」。
 *   ② **条件未满足时状态零变化**。`condition-unmet` 走的是「如实报告、不落盘」那条路，
 *      与「执行失败」（要入失败队列、要排重试）严格分开：前者是世界的条件还没到，
 *      后者是这次动作失败了。把两者混成一件事，模型就会把「还不到时候」读成「出事了」。
 *   ③ **认领才是唯一的触发闸**。`due()` 只回答「谁到点了」（纯读，调用 N 次不改任何状态），
 *      `claim()` 才把它们标成 `claimed`——同一事件在同一时刻只能被认领一次，
 *      重复调用拿不到第二次。这不是防呆，是「同一事件不能无意重复执行」这条约束的实现。
 *
 * 记账层次（与 writes / removes / evicts / draws / nowCalls 对偶）：
 *   · scheduled / claimed / completed / cancelled / replaced / exhausted / failed —— 逐动作计量；
 *   · conditionMisses —— **条件未满足**次数（与 failures 分开记，这正是口径②的载体）；
 *   · retries —— 失败后重排次数；failQueue —— 有界失败队列（答「上次为什么没成」）。
 *
 * 不做什么：
 *   1 不执行副作用。本模块是**状态机 + 记账**：`claim()` 认领、`complete()` 回报结果。
 *     谁去真正做事（调用推演通道 / 写世界事实）是调用方的责任——引擎不掷骰、不代写正文。
 *   2 不新增持久键；只新增 `events.rows` / `events.failQueue` 两个有界容器。
 *   3 不接管 workflow 的 before/after 链，也不自动定时——「轮」由调用方推进
 *     （与 causal.tick / parallelEvents 的用法一致：世界心跳在任何时刻都是显式的）。
 *   3b **拒收 ⇒ 零变化**（v2.115.0 补，规划 01 的 E2）：`schedule()` / `replace()` 一律
 *      「先纯校验、后落地」。校验提成 `plan()`（不碰 store、不写字段、不记 fault），
 *      于是「参数不合法」这件事不会以任何形式改动世界——包括
 *      **不得顺手取消掉正在被改期的那条待办**。
 *   4 总开关默认关闭；关闭时不排期、不认领、不注入，也不凭空补写「已发生」。
 *
 * v2.116.0（规划 01 的 A2 第二段：任务预算与恢复协议）——四处缺口全在同一件事上：
 * **「认领了、然后没人回报」这件事此前没有任何落点**。
 *   ① **认领无预算**：`claim()` 一次把全部到点事件认领光，于是一次调用就能把整个世界
 *      的待办搬进「执行中」；真实酒馆里那是几十个引擎同时开工。
 *   ② **认领无所有权**：认领后那一行不带「谁认领的」，多个调用方（面板 / 自动流程 /
 *      别的插件）之间的账根本对不上。
 *   ③ **认领无租约**：崩一次 / 切一次聊天，`claimed` 的行既不再进 due（不是 pending）、
 *      也不是终态（永远不会有结论）——「正在执行」与「永远不会有人来执行」**同形**，
 *      那件事被静默丢掉且没有任何读数能发现。
 *   ④ **回执无稳定操作 id**：`complete()` 只看「当前是不是 claimed」，于是任何重放
 *      （重连、重试、宿主重复通知）都会**二次结算**同一件事。
 * 对应修法：`maxClaims` 预算（超额者进 `deferred` 显式留痕，不静默跳过）+
 *   `owner` / `opId`（默认 `id@到点时刻`，回收后重新认领仍是同一笔）+
 *   `leaseMs` 租约（到期行在**同一次 claim 的同一事务里**先回收再进候选）+
 *   `events.res` 有界回执台账（重复回执 ⇒ `duplicate-receipt` 拒收且零变化）。
 * 一条口径边界（如实写明，不假称完备）：回执台账与 `failQueue` 同界，**极久之后的重放
 *   无法去重**——那时它读到的是终端用户视角的「一笔新事」，不是「同一笔的重放」。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_events_settings_v1';
  // maxRows 与 evict 站点 events.rows 的 cap 同步（24）：**待办不静默丢**——
  //   与 causal 的「满则挤出最旧」不同，这里是「满则拒收新排期」（capacity）。
  //   理由：因果链是**历史**（挤掉最旧的仍答得出「发生过什么」），排期是**待办**
  //   （挤掉最旧的就是把那件事悄悄取消了，而调用方会以为它还在队列里）。
  //   `cancel()` 是唯一合法的取消入口——「世界没发生这件事」必须说得出口。
  const DEF = { enabled: false, autoFulfill: false, maxRows: 24, maxRuns: 12, maxFails: 12, retryDelayMs: 1000, maxRetries: 2,
    maxClaims: 24, leaseMs: 0 };
  const __REG = { key: LS_KEY, def: DEF, module: 'events',
    bounds: { maxRows: [1, 24], maxRuns: [1, 60], maxFails: [1, 24], retryDelayMs: [0, 600000], maxRetries: [0, 5],
      maxClaims: [1, 24], leaseMs: [0, 3600000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 四种排期语义：一次性 / 延迟 / 周期 / 条件触发。白名单是判据的来源，不只是文档。
  const KINDS = ['once', 'delayed', 'repeat', 'conditional'];
  // 活动态与终态**穷尽互斥**：ACTIVE ∩ TERMINAL = ∅，且两者之并 = 全部合法状态。
  const ACTIVE = ['pending', 'claimed'];
  const TERMINAL = ['executed', 'exhausted', 'cancelled', 'failed'];
  const DEF_PRIORITY = 5;
  const MIN_PRIORITY = 0;
  const MAX_PRIORITY = 9;

  const stat = { scheduled: 0, claimed: 0, completed: 0, cancelled: 0, replaced: 0, exhausted: 0, failed: 0,
    conditionMisses: 0, reclaimed: 0, duplicates: 0, deferred: 0, late: 0, lastReason: '', faults: {},
    // v2.291.0（EXV7-7）：未来轴的读取次数 —— 零计数即「这个口没被调用过」。
    timelineReads: 0 };
  function noteFault(reason) {
    const tag = String(reason == null ? 'unknown' : reason);
    stat.faults[tag] = (stat.faults[tag] || 0) + 1;
    return tag;
  }
  /**
   * 字符串字段的**受控**收窄。
   *   v2.79.0 面 C 的纪律：`String(v == null ? '' : v)` 会把 NaN / 对象 / 数组**静默升格**
   *   成 'NaN' / '[object Object]'，于是一次「参数传错」被记成「世界里真发生了这件事」。
   *   故这里先判类型：非字符串一律视为**空**（走 missing-fields 拒收），不做字符串化兜底。
   */
  function str(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }
  /** 有限数收窄：NaN / ±Infinity / 空串（Number('')===0 是陷阱）/ 布尔一律 NaN。 */
  function finite(v) {
    if (v === undefined || v === null || v === '' || typeof v === 'boolean') return NaN;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().events; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function row(id) { const k = str(id, 40); return k ? (rows().filter(function (x) { return x && x.id === k; })[0] || null) : null; }
  function isActive(x) { return !!x && ACTIVE.indexOf(x.status) >= 0; }
  function isTerminal(x) { return !!x && TERMINAL.indexOf(x.status) >= 0; }
  /** 比对用归一（只去空白）：**不截断**——截断后两个长 id 会坍成同一个别名。 */
  function sameId(a, b) { return String(a == null ? '' : a).replace(/\s+/g, '') === String(b == null ? '' : b).replace(/\s+/g, ''); }
  /** 租约到期视图（0 或未给 = 不生效：行为与 v2.115.0 逐字一致）。 */
  function expired(x, t) { return !!x && x.status === 'claimed' && isFinite(x.leaseUntil) && x.leaseUntil > 0 && t >= x.leaseUntil; }
  function ensure(draft) {
    if (!draft.events || typeof draft.events !== 'object' || Array.isArray(draft.events)) draft.events = { rows: [], failQueue: [], res: [] };
    if (!Array.isArray(draft.events.rows)) draft.events.rows = [];
    if (!Array.isArray(draft.events.failQueue)) draft.events.failQueue = [];
    if (!Array.isArray(draft.events.res)) draft.events.res = [];
    return draft.events;
  }
  /** 多件事同时到点时的先后：优先级高者先，其次到点早者先，最后按 id 定序（不得靠插入顺序）。 */
  function order(a, b) {
    return ((b.priority || 0) - (a.priority || 0)) || ((a.scheduledAt || 0) - (b.scheduledAt || 0)) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
  }
  /** 外部传入的「已满足条件」集合（与 causal 同口径：条件满足与否由世界状态给出，不自己发明表达式语言）。 */
  function metSet(opts) {
    const o = opts || {};
    return Array.isArray(o.metConditions) ? o.metConditions.map(function (x) { return String(x); }) : [];
  }
  function conditionMet(x, met) {
    if (x.kind !== 'conditional') return true;
    return !!(x.condition && met.indexOf(x.condition) >= 0);
  }
  /** 到期判定：活动态 + 未认领 + 有限时刻 + 已到点。 */
  function ready(x, t) {
    if (expired(x, t)) return true;   // v2.116.0：租约到期 ⇒ 重新进候选（否则崩溃一次那件事就永久卡在 claimed）
    return x.status === 'pending' && isFinite(x.scheduledAt) && t >= x.scheduledAt;
  }
  /** 只读视图（**逐字段拷贝**：读面不得回传 store 内部活引用，v2.79.0 面 B）。 */
  function view(x) {
    return {
      id: x.id, kind: x.kind, title: x.title, priority: x.priority, status: x.status,
      scheduledAt: x.scheduledAt, intervalMs: x.intervalMs, condition: x.condition,
      runs: x.runs || 0, retries: x.retries || 0, lastNote: x.lastNote || '',
      owner: x.owner || '', opId: x.opId || '', leaseUntil: isFinite(x.leaseUntil) ? x.leaseUntil : 0,
      payload: (x.payload && typeof x.payload === 'object' && !Array.isArray(x.payload)) ? Object.assign({}, x.payload) : {}
    };
  }

  /**
   * 参数**纯校验**：只判形、只取整，不碰 store、不改任何行、不记 fault。
   *
   * 为什么必须把「校验」与「落地」拆成两件事（v2.115.0 · 规划 01 的 E2）：
   *   `replace()` 此前的实现是「先 `cancel()` 旧行，再 `schedule()` 新参数」两步。
   *   新参数不合法时（例如 `{ at: -1 }`），**旧行已经被取消**——返回值虽是 `bad-time`，
   *   世界里那件事却已经从待办队列里消失了：调用方以为「改期失败 = 什么都没发生」，
   *   实际丢了待办，而这正是本模块最不能出的错（排期是待办，不是历史）。
   *   把校验提成纯函数之后，`schedule()` 与 `replace()` 都能**先校验、后落地**，
   *   「拒收 ⇒ 状态零变化」才不靠约定，而是源码结构本身保证的。
   *
   * 返回：`{ ok: true, id, title, kind, at, hasTime, intervalMs, condition, priority, payload, now }`
   *       或 `{ ok: false, reason: ... }`（reason 与 schedule 旧口径逐字一致，reject 面不变）。
   *   `now` 是本次校验时刻（调用方落地时复用，避免一次改期读两次钟）。
   */
  function plan(it) {
    const x = it || {};
    const id = str(x.id, 40), title = str(x.title, 40);
    const kind = str(x.kind, 16) || 'once';
    if (!id || !title) return { ok: false, reason: 'missing-fields' };
    if (KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kinds: KINDS.slice() };
    const hasAt = x.at !== undefined && x.at !== null;
    const hasIn = x.inMs !== undefined && x.inMs !== null;
    const hasTime = hasAt || hasIn;
    let at = NaN;
    if (hasAt) at = finite(x.at);
    else if (hasIn) {
      const rel = finite(x.inMs);
      if (isFinite(rel) && rel >= 0) at = clockNow('events') + rel;
    }
    if (hasTime && !isFinite(at)) return { ok: false, reason: 'bad-time' };
    if (isFinite(at) && at < 0) return { ok: false, reason: 'bad-time' };
    let intervalMs = 0;
    if (kind === 'repeat') {
      const iv = finite(x.intervalMs);
      if (!isFinite(iv) || iv <= 0) return { ok: false, reason: 'bad-trigger', need: 'intervalMs>0' };
      intervalMs = iv;
    }
    const condition = str(x.condition, 60);
    if (kind === 'conditional' && !condition) return { ok: false, reason: 'bad-trigger', need: 'condition' };
    if (kind === 'delayed' && !isFinite(at)) return { ok: false, reason: 'bad-trigger', need: 'at|inMs' };
    let priority = DEF_PRIORITY;
    if (x.priority !== undefined && x.priority !== null) {
      const pr = finite(x.priority);
      if (!isFinite(pr) || pr < MIN_PRIORITY || pr > MAX_PRIORITY) return { ok: false, reason: 'bad-priority', min: MIN_PRIORITY, max: MAX_PRIORITY };
      priority = Math.floor(pr);
    }
    const payload = (x.payload && typeof x.payload === 'object' && !Array.isArray(x.payload)) ? Object.assign({}, x.payload) : {};
    return { ok: true, id: id, title: title, kind: kind, at: at, hasTime: hasTime,
      intervalMs: intervalMs, condition: condition, priority: priority, payload: payload, now: clockNow('events') };
  }

  /**
   * 排期一个事件。四类 kind 的必填项不同：
   *   once        时刻可选（缺省 = 现在，即立即可认领）
   *   delayed     必须给 `at`（绝对时刻）或 `inMs`（相对毫秒）
   *   repeat      必须给正的 `intervalMs`（首触发时刻同上，缺省 = 现在）
   *   conditional 必须给非空 `condition`
   * 排期**不改写既有事件**：同 id 且仍在活动态 ⇒ `duplicate` 拒收（不静默覆盖）。
   * 校验走 `plan()`（纯函数）：不合法时**一个字段都不写**，只记 fault。
   */
  function schedule(item) {
    const pl = plan(item);
    if (!pl.ok) { noteFault(pl.reason); return pl; }
    const id = pl.id, title = pl.title, kind = pl.kind, priority = pl.priority;
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const at = pl.at;
    const now = pl.now;
    const payload = pl.payload;
    let out = null;
    WA.store.transact(function (draft) {
      const e = ensure(draft);
      const dup = e.rows.filter(function (x) { return x && x.id === id && isActive(x); })[0];
      if (dup) { out = { ok: false, reason: 'duplicate', id: id, status: dup.status }; return false; }
      // 容量口径：**只数活动态**。终态是历史，不该把队列占满——
      //   否则长跑之后每一件待办都会被「很久以前的记录」挡住，而调用方看到的只是 capacity。
      const live = e.rows.filter(isActive).length;
      if (live >= cfg.maxRows) { out = { ok: false, reason: 'capacity', live: live, max: cfg.maxRows }; return false; }
      const item2 = {
        id: id, kind: kind, title: title, priority: priority,
        status: 'pending',
        scheduledAt: isFinite(at) ? at : now,
        intervalMs: pl.intervalMs,
        condition: pl.condition,
        payload: payload,
        runs: 0, retries: 0, conditionMisses: 0, claims: 0,
        createdAt: now, claimedAt: 0, executedAt: 0, lastExecutedAt: 0, lastFailAt: 0, lastNote: ''
      };
      e.rows.push(item2);
      // 挤出走单一出口（站点名与 core/evict.js 的 SITES 键逐字一致）。
      //   被挤出的是**最旧的终态行**（活动态已被上面的 capacity 拒收保护，不可能被挤掉）。
      //   per-call：上限 = 当前 maxRows 设置（与容量拒收同源，改设置不漂移）。
      if (WA.evict) WA.evict.array(e.rows, 'events.rows', cfg.maxRows);
      out = { ok: true, id: id, kind: kind, priority: priority, scheduledAt: item2.scheduledAt };
    }, 'events:schedule');
    if (out && out.ok) { stat.scheduled++; stat.lastReason = 'scheduled'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 只读查询：谁到点了（按优先级/到点时刻/id 定序）。
   * **纯读**——调用 N 次不改变任何状态、不产生任何副作用、不回传活引用。
   * 要真动它们，请走 claim()。
   */
  function due(now, opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', items: [] };
    const t0 = finite(now);
    const t = isFinite(t0) ? t0 : clockNow('events');
    const met = metSet(opts);
    const items = [], blocked = [];
    rows().forEach(function (x) {
      if (!x || !ready(x, t)) return;
      if (!conditionMet(x, met)) { blocked.push({ id: x.id, reason: 'condition-unmet', condition: x.condition }); return; }
      items.push(view(x));
    });
    items.sort(order);
    return { ok: true, at: t, count: items.length, items: items, blocked: blocked };
  }

  /**
   * 认领本轮到点且条件成立的事件：把它们从 `pending` 标成 `claimed`。
   * 这是**唯一的触发闸**——同一事件被认领后不进 due/claim 的候选，
   * 故「同一事件不得被无意重复执行」由状态机本身保证，不依赖调用方自觉。
   * 条件未满足者**状态零变化**（只进 blocked 与 conditionMisses 台账）。
   */
  function claim(now, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const t0 = finite(now);
    const t = isFinite(t0) ? t0 : clockNow('events');
    const met = metSet(opts);
    const o = opts || {};
    const owner = str(o.owner, 40);
    const asked = finite(o.max);
    // 本轮预算：显式 `max` 优先（但不得超设置上界），否则用设置 maxClaims。
    const budget = (isFinite(asked) && asked > 0)
      ? Math.max(1, Math.min(Math.floor(asked), cfg.maxClaims)) : cfg.maxClaims;
    const lease = cfg.leaseMs > 0 ? t + cfg.leaseMs : 0;
    const items = [], blocked = [], deferred = [];
    let reclaimed = 0;
    let out = null;
    WA.store.transact(function (draft) {
      const e = ensure(draft);
      // ① **先回收租约到期的行**（同一事务内：回收与认领一起提交，
      //    不留下「标回 pending 却没真让位」的中间态）。
      //    为什么必须有这一步：`claimed` 之后若调用方崩了 / 被切聊天打断，
      //    那一行既不再是 `pending`（不再进 due）、也不是终态（永远不会有结论）——
      //    「正在执行」与「永远不会有人来执行」在此之前完全同形，也就是那件事被**静默丢掉**。
      e.rows.forEach(function (x) {
        if (!x || !expired(x, t)) return;
        x.status = 'pending';
        x.claimedAt = 0;
        x.leaseUntil = 0;
        x.reclaimed = (x.reclaimed || 0) + 1;
        reclaimed++;
      });
      // ② 候选按**同一套定序**取（不得走插入序：位置决定命运是 v2.115.0 刚治过的病）。
      const cands = e.rows.filter(function (x) { return x && ready(x, t); }).sort(order);
      // ③ 条件未足者状态零变化，且**不占预算**（它们本轮本来就不会被执行）。
      const ready2 = [];
      cands.forEach(function (x) {
        if (!conditionMet(x, met)) {
          blocked.push({ id: x.id, reason: 'condition-unmet', condition: x.condition });
          return;
        }
        ready2.push(x);
      });
      // ④ 本轮取用名额。
      const take = Math.max(0, Math.min(budget, ready2.length));
      // ⑤ 超额者**显式留痕**（跳过了谁、为什么）——否则「本轮为什么没推进它」又要靠猜。
      ready2.slice(take).forEach(function (x) {
        deferred.push({ id: x.id, reason: 'budget', priority: x.priority || 0, scheduledAt: x.scheduledAt || 0 });
      });
      // ⑥ 认领：钉下**所有者 / 稳定操作 id / 租约**。
      //    `opId` 默认 = id@到点时刻 —— 同一笔待办在「回收后重新认领」时得到**同一个** opId，
      //    于是重复回执按它去重（见 complete() 的口径）。
      ready2.slice(0, take).forEach(function (x) {
        x.status = 'claimed';
        x.claimedAt = t;
        x.owner = owner;
        // **本次尝试**的稳定操作 id：由「内容」派生（id@到点时刻）+ 认领序号。
        //   为什么必须每次重钉（实测修正）：`repeat` 成功后回到 `pending` 并带**新的**
        //   scheduledAt 再次到点、`retry` 同理；若沿用上一次的 opId，第二次回报会被
        //   自己的台账判成 duplicate-receipt——**周期事件只能执行一次**。
        //   序号让「同一笔的第 N 次尝试」各自成键；崩溃重试（租约回收后重新认领）
        //   得到 `#2`，如实记下「这是重试」，不假装它是第一次。
        x.claims = (x.claims || 0) + 1;
        x.opId = x.id + '@' + Math.floor(x.scheduledAt || 0) + '#' + x.claims;
        x.leaseUntil = lease;
        items.push(view(x));
      });
      out = { ok: true, at: t, count: items.length, ids: items.map(function (x) { return x.id; }),
        items: items, blocked: blocked, deferred: deferred, reclaimed: reclaimed,
        budget: budget, owner: owner, leaseUntil: lease };
    }, 'events:claim');
    if (!out) return { ok: false, reason: 'store-unavailable' };
    out.items.sort(order);
    out.ids = out.items.map(function (x) { return x.id; });
    out.count = out.items.length;
    stat.claimed += out.items.length;
    stat.conditionMisses += out.blocked.length;
    stat.deferred += out.deferred.length;
    stat.reclaimed += out.reclaimed;
    stat.lastReason = out.items.length ? 'claimed'
      : (out.blocked.length ? 'condition-unmet' : (out.reclaimed ? 'reclaimed' : 'nothing-due'));
    return out;
  }

  /**
   * 回报一次执行结果。
   *   `res.ok === true`  ⇒ 计入 runs；repeat 排下一次（到 maxRuns 转 `exhausted`），其余转 `executed`。
   *   `res.ok !== true`  ⇒ 计入 retries 与 failQueue（有界）；到 maxRetries 转终态 `failed`，
   *                        否则退回 `pending` 并按 `retryDelayMs` 重排。
   * 失败**只动这一行**——同一批里其余事件的状态不受影响（单个失控事件不得拖垮整轮）。
   * 未认领就回报 ⇒ `not-claimed` 拒收：防的是「没认领就宣称自己做完了」。
   */
  function complete(id, res) {
    const rid = str(id, 40);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const r = res || {};
    const note = str(r.note, 80);
    // 回执的**稳定操作 id**：调用方给的是真源（它知道这一笔到底是什么）；
    //   未给则沿用认领时钉下的 opId —— 于是「同一笔」在崩溃重试路径上仍是同一笔。
    const wantOp = str(r.opId, 64);
    let out = null;
    WA.store.transact(function (draft) {
      const e = ensure(draft);
      const x = e.rows.filter(function (y) { return y && y.id === rid; })[0];
      if (!x) { out = { ok: false, reason: 'missing', id: rid }; return false; }
      // ① **重复回执**：这一笔已经回报过了 ⇒ 拒收且零变化（不记 runs、不排重试、不动状态）。
      //    判据是「回执台账里有同一个 opId」，不是「行当前是不是 claimed」——
      //    一行可以在回报后被回收重新认领（opId 不变），此时它**不是** claimed，
      //    但那不代表这一笔没结算过。旧口径只看状态，于是重放会二次结算。
      //    台账有界（与 failQueue 同口径）：极久之后的重放无法去重，如实写明，不假称完备。
      //    优先级：**调用方显式给的 opId 优先**，行上的只作兜底。
      //    为什么不能让行上优先（v2.116.0 实测修正）：一笔**迟到回执**若被记到「回收后新一次
      //    尝试」的 opId 名下，新尝试自己的回执随后就会被判成 duplicate-receipt——
      //    救回来的活反而被旧回执挡死。调用方知道它在报哪一次，就该以它为准。
      const have = str(x.opId, 64);
      const key = wantOp || have;
      if (key && e.res.some(function (q) { return q && sameId(q.opId, key); })) {
        stat.duplicates++;
        stat.lastReason = 'duplicate-receipt';
        out = { ok: false, reason: 'duplicate-receipt', id: rid, opId: key };
        return false;
      }
      if (x.status !== 'claimed') { out = { ok: false, reason: 'not-claimed', id: rid, status: x.status }; return false; }
      const now = clockNow('events');
      // ② **迟到回执**：租约已过期才回报 ⇒ 如实计数（不动状态、不拒收——
      //    拒收它会让调用方连「这笔做完了」都提交不了）。回收与回报谁先到，这里读得出来。
      const lateOne = isFinite(x.leaseUntil) && x.leaseUntil > 0 && now >= x.leaseUntil;
      if (r.ok === true) {
        if (r.archiveScheduled === true) {
          if (!WA.backstage || typeof WA.backstage.archiveScheduled !== 'function') {
            out = { ok: false, reason: 'bridge-missing', id: rid }; return false;
          }
          WA.backstage.archiveScheduled(draft, x.title, x.id, key);
        }
        x.runs = (x.runs || 0) + 1;
        x.lastExecutedAt = now;
        x.lastNote = note;
        x.leaseUntil = 0;
        if (x.kind === 'repeat' && x.runs < settings().maxRuns) {
          x.status = 'pending';
          x.scheduledAt = now + (isFinite(x.intervalMs) ? x.intervalMs : 0);
        } else if (x.kind === 'repeat') {
          x.status = 'exhausted'; x.executedAt = now;
          // 终态清空 opId：否则台账被挤出（有界）之后，一笔**早已跑满**的周期事件会在
          //   「租约到期 ⇒ 重新进候选」的旧路上被重新认领执行（终态不得可回卷）。
          x.opId = '';
        } else {
          x.status = 'executed'; x.executedAt = now;
        }
        // ③ 回执入台账（有界）：已完成本地副作用与这个 id 的确认**一起持久化**。
        e.res.push({ opId: key, id: rid, at: now, ok: true, note: note });
        if (WA.evict) WA.evict.array(e.res, 'events.res', settings().maxFails);
        out = { ok: true, id: rid, status: x.status, runs: x.runs, opId: key, late: lateOne };
      } else {
        x.retries = (x.retries || 0) + 1;
        x.lastFailAt = now;
        x.lastNote = note;
        x.leaseUntil = 0;
        e.failQueue.push({ id: rid, at: now, note: note, retries: x.retries });
        if (WA.evict) WA.evict.array(e.failQueue, 'events.failQueue', settings().maxFails);
        if (x.retries >= settings().maxRetries) { x.status = 'failed'; x.executedAt = now; x.opId = ''; }
        else { x.status = 'pending'; x.scheduledAt = now + settings().retryDelayMs; }
        e.res.push({ opId: key, id: rid, at: now, ok: false, note: note });
        if (WA.evict) WA.evict.array(e.res, 'events.res', settings().maxFails);
        out = { ok: true, id: rid, status: x.status, retries: x.retries, failed: x.status === 'failed',
          opId: key, late: lateOne };
      }
    }, 'events:complete');
    if (!out) return { ok: false, reason: 'store-unavailable' };
    if (!out.ok) noteFault(out.reason);
    else if (out.late) { stat.late++; stat.lastReason = 'late-receipt'; }
    else if (out.status === 'exhausted') { stat.exhausted++; stat.lastReason = 'exhausted'; }
    else if (out.status === 'failed') { stat.failed++; stat.lastReason = 'failed'; }
    else if (out.retries) { stat.lastReason = 'retried'; }
    else { stat.completed++; stat.lastReason = 'completed'; }
    return out;
  }

  /** 显式取消（唯一合法的「这件事不做了」入口）。终态行不可再取消（报告它已是什么状态）。 */
  function cancel(id, reason) {
    const rid = str(id, 40);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      const e = ensure(draft);
      const x = e.rows.filter(function (y) { return y && y.id === rid; })[0];
      if (!x) { out = { ok: false, reason: 'missing', id: rid }; return false; }
      // 终态行不可取消。v2.116.0 复核结论（负向留档）：原先加过一条
      //   「已回报 ⇒ `already-receipted`」守卫，实测**不可达**——回报成功的那一笔已经是
      //   `executed`/`exhausted`/`failed`，上面这句抢先返回 `not-active`；
      //   而它唯一可达的场合（周期事件两次触发之间的 `pending`，且上一次回执还在台账里）
      //   会把**合法的取消**挡回去：周期事件从此不可取消。故已撤除，改为守住下面这句。
      if (isTerminal(x)) { out = { ok: false, reason: 'not-active', id: rid, status: x.status }; return false; }
      x.status = 'cancelled';
      x.executedAt = clockNow('events');
      x.cancelReason = str(reason, 60) || '调用方取消';
      out = { ok: true, id: rid, status: x.status };
    }, 'events:cancel');
    if (!out) return { ok: false, reason: 'store-unavailable' };
    if (out.ok) { stat.cancelled++; stat.lastReason = 'cancelled'; } else noteFault(out.reason);
    return out;
  }

  /**
   * 替换：把旧排期取消（理由固定为 `replaced`，留痕可查）再按新参数排一条。
   * 新 id 缺省为 `旧id@时刻` —— 不用同一个 id 覆盖，因为「被替换过」本身是事实，
   * 覆盖掉就答不出「它原本排在什么时候、为什么换了」。
   *
   * v2.115.0 的两条纪律（规划 01 的 E2）：
   *   ① **先校验、后落地**。旧实现是「先 cancel 再 schedule」：新参数不合法时旧行已被取消，
   *      `bad-time` 成了「拒收但已造成损失」——排期队列里那件事凭空消失。
   *      现在校验由纯函数 `plan()` 在前置完成，不合格 ⇒ **不进事务、旧行原样保留**。
   *   ② **单事务原子替换**。旧行转 `cancelled` 与新行落地在**同一个** `transact` 里完成，
   *      不会留下「旧的没了、新的没来」的半截状态（读侧要么看到改期前的样子，要么改期后的样子）。
   *   另：patch 未给 `at`/`inMs` 时**沿用原时刻**。旧实现把 `at` 留成 NaN，而
   *      schedule 的「缺省 = 现在」会把一次只想改标题的改期顺手挪到当下——
   *      「只改我点名的字段」是 replace 的语义，时间轴不因此移动。
   */
  function replace(id, patch) {
    const rid = str(id, 40);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const old = row(rid);
    if (!old) { noteFault('missing'); return { ok: false, reason: 'missing', id: rid }; }
    if (isTerminal(old)) { noteFault('not-active'); return { ok: false, reason: 'not-active', id: rid, status: old.status }; }
    const patch2 = patch || {};
    const hasTime = (patch2.at !== undefined && patch2.at !== null) || (patch2.inMs !== undefined && patch2.inMs !== null);
    const p = {
      id: str(patch2.id, 40) || (rid + '@' + clockNow('events')),
      kind: patch2.kind !== undefined ? patch2.kind : old.kind,
      title: patch2.title !== undefined ? patch2.title : old.title,
      priority: patch2.priority !== undefined ? patch2.priority : old.priority,
      at: hasTime ? patch2.at : old.scheduledAt,
      inMs: hasTime ? patch2.inMs : undefined,
      intervalMs: patch2.intervalMs !== undefined ? patch2.intervalMs : old.intervalMs,
      condition: patch2.condition !== undefined ? patch2.condition : old.condition,
      payload: patch2.payload !== undefined ? patch2.payload : old.payload
    };
    // ① 纯校验：不合格 ⇒ 旧排期原样保留（零事务、零字段写入）
    const pl = plan(p);
    if (!pl.ok) { noteFault(pl.reason); return pl; }
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const now = pl.now;
    const newId = pl.id;
    // ② 单事务：旧行取消 + 新行落地一起提交（没有「旧的没了、新的没来」的中间态）
    let out = null;
    WA.store.transact(function (draft) {
      const e = ensure(draft);
      const x = e.rows.filter(function (y) { return y && y.id === rid; })[0];
      if (!x) { out = { ok: false, reason: 'missing', id: rid }; return false; }
      if (isTerminal(x)) { out = { ok: false, reason: 'not-active', id: rid, status: x.status }; return false; }
      if (newId !== rid) {
        const dup = e.rows.filter(function (y) { return y && y.id === newId && isActive(y); })[0];
        if (dup) { out = { ok: false, reason: 'duplicate', id: newId, status: dup.status }; return false; }
      }
      // 容量口径：**将被替换的旧行算作已释放**——它同一事务里就转终态了。
      //   故这里比 schedule 的闸门「宽一档」：`live` 含本行，用 `live - 1` 与本行让位后的
      //   实际占用比较（若照抄 schedule 那行，一次满员时的改期会被自己的旧行挡回去，
      //   而改期在语义上**不是新增待办**）。报出的 `live` 也是让位后的占用。
      const live = e.rows.filter(isActive).length;
      if (live - 1 >= cfg.maxRows) { out = { ok: false, reason: 'capacity', live: live - 1, max: cfg.maxRows }; return false; }
      x.status = 'cancelled';
      x.executedAt = now;
      x.cancelReason = 'replaced';
      const row2 = {
        id: newId, kind: pl.kind, title: pl.title, priority: pl.priority,
        status: 'pending',
        scheduledAt: isFinite(pl.at) ? pl.at : now,
        intervalMs: pl.intervalMs,
        condition: pl.condition,
        payload: pl.payload,
        runs: 0, retries: 0, conditionMisses: 0, claims: 0,
        createdAt: now, claimedAt: 0, executedAt: 0, lastExecutedAt: 0, lastFailAt: 0, lastNote: ''
      };
      e.rows.push(row2);
      if (WA.evict) WA.evict.array(e.rows, 'events.rows', cfg.maxRows);
      out = { ok: true, replaced: rid, id: newId, kind: pl.kind, scheduledAt: row2.scheduledAt };
    }, 'events:replace');
    if (!out) return { ok: false, reason: 'store-unavailable' };
    if (out.ok) { stat.cancelled++; stat.replaced++; stat.lastReason = 'replaced'; }
    else noteFault(out.reason);
    return out;
  }

  /** 活动态清单（只读，按同一序）。 */
  function active() { return rows().filter(isActive).sort(order).map(view); }
  /** 失败队列只读视图（最近优先）——答「上一次为什么没成」。 */
  function fails(topN) {
    const m = state().events;
    const q = (m && Array.isArray(m.failQueue)) ? m.failQueue : [];
    const n = (typeof topN === 'number' && topN > 0) ? topN : 10;
    return q.slice(-n).reverse().map(function (x) { return { id: x.id, at: x.at, note: x.note, retries: x.retries }; });
  }

  /**
   * v2.291.0（V7 EXV7-7）：**事件钟**上的未来时间轴。只读，不改 stage。
   *
   * ── 它答什么 ────────────────────────────────────────────────
   *   `active()` 答「有哪些已排期」，但那是一份**状态清单**（按 priority 排序），
   *   答不出「按时间看，接下来先后会到点什么」。`due()` 更窄：它只报**已经到点**的。
   *   于是一个只想画时间轴的消费方（面板 / 诊断 / 未来的日历面）只能自己遍历 `rows()`
   *   再逐条判 kind 与时间 —— 那是各自重算，不是一份读数（本仓反复治理的那条）。
   *
   * ── 时间基准：**事件钟**，不是剧情钟 ────────────────────────────
   *   本模块的 `scheduledAt` 从它诞生的第一天起就写在 `clockNow('events')` 上
   *   （墙钟口径：`nextAt = now + intervalMs` 这类推进只有在同一把尺子上才成立）。
   *   而 `engines/agenda.js` 走的是**剧情日**（`playtime.story` / `store.clock.dayIndex`），
   *   两者混算过一次的代价写在 agenda 的注释里（离线间隔被抹平）。
   *   故这里**只报事件钟自己的时刻**，一行都不折算成剧情日：`day` 字段恒为 null，
   *   理由不是「懒得算」，而是**这两种时刻之间没有换算率**。
   *
   * ── 四种 kind 各自的「什么时候」────────────────────────────────
   *   不能把四个 kind 塞进一个 `at` 字段再排序 —— 它们答的不是同一个问题：
   *     · once        —— 到点就跑一次：`at = scheduledAt`；
   *     · delayed     —— 同 once（延迟只是排期时的一种写法），`at = scheduledAt`；
   *     · repeat      —— 到点后**还会再来**：`at = scheduledAt`，另报 `nextAt` 与剩余轮次；
   *     · conditional —— **没有确定时刻**：条件是外部事实，本模块拒不猜它哪天成立。
   *                      故 `at = null` 且 `unknown = true`，单列到 `untimed`，不排进时间序。
   *
   * ── 否定式边界（每一条都对着本仓付过代价的坑）──────────────────
   *   1 **只读**：不 claim、不取消、不改 `scheduledAt`、不写 stat 以外的任何字段
   *     （写 stat 的 `timelineReads` 只是读数留痕，与 sediment 的 `placesReads` 同规）。
   *   2 **不猜条件**：`conditional` 行不带时刻，也不拿「现在」冒充。
   *   3 **不代判到期**：`due` 判定仍归 `due()` / `ready()`；本口只报时刻与状态，
   *     且把「已到点未认领」与「未到点」在 `due` 字段上分开，不让消费方自己算。
   *   4 **有界**：`cap` 夹在 1..48，`truncated` / `dropped` 如实报 —— 截断不静默。
   *   5 **不自造事件**：只投影 `rows()` 里的真行，绝不按 kind 补齐占位行。
   *   6 **关闭态如实拒收**（`reason:'disabled'`），不回落成空表 ——
   *      「没排期」与「这个模块关着」在空表上长得一模一样。
   *   7 未到点的行**一律** `due:false`；已到点但条件未满足的**不标 due**（那是 `due()` 的判定），
   *     改为 `blocked:true` + `condition` 原文，让「等着」与「到点了」分开。
   *
   * @param {{maxRows?:number, includeTerminal?:boolean, now?:number}} [opts]
   * @returns {{ok:boolean, reason?:string, now?:number, total?:number, cap?:number,
   *   truncated?:boolean, dropped?:number, timedCount?:number, untimedCount?:number,
   *   dueCount?:number, blockedCount?:number, byKind?:Object, byStatus?:Object,
   *   rows?:Array, untimed?:Array, note?:string}}
   */
  function timelineView(opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const cap = Math.max(1, Math.min(48, Number(o.maxRows) > 0 ? Math.floor(Number(o.maxRows)) : 24));
    const t = isFinite(Number(o.now)) && Number(o.now) >= 0 ? Math.floor(Number(o.now)) : clockNow('events');
    const all = rows();
    const byKind = {}, byStatus = {};
    const timed = [], untimed = [];
    all.forEach(function (x) {
      if (!x || !x.id) return;
      const st = String(x.status || '');
      // 终态行：默认不进未来轴（已经发生过的事不是「未来」）。
      //   要复盘时给 includeTerminal —— 但那时它们仍不进 timed（时刻已过去）。
      if (!o.includeTerminal && TERMINAL.indexOf(st) >= 0) return;
      byStatus[st] = (byStatus[st] || 0) + 1;
      byKind[String(x.kind || '')] = (byKind[String(x.kind || '')] || 0) + 1;
      const at = isFinite(x.scheduledAt) && x.scheduledAt > 0 ? x.scheduledAt : null;
      const cond = x.condition ? String(x.condition) : '';
      // once / delayed / repeat 有确定时刻；conditional 没有 —— 不猜。
      const hasAt = at !== null && String(x.kind) !== 'conditional';
      const row = {
        id: String(x.id), kind: String(x.kind || ''), title: String(x.title || ''),
        status: st, priority: isFinite(x.priority) ? x.priority : 0,
        at: hasAt ? at : null,
        due: hasAt ? (x.status === 'pending' && at <= t) : false,
        blocked: hasAt ? false : !!cond,
        condition: cond,
        unknown: !hasAt,
        nextAt: null, remainRuns: null,
        intervalMs: isFinite(x.intervalMs) && x.intervalMs > 0 ? x.intervalMs : null,
        runs: isFinite(x.runs) ? x.runs : 0,
        // 与 agenda 的行形状对齐一处：`canAct` 让消费方不必自己判「能不能动手」。
        //   claimed（执行中、已认领未回报）**不可再触发** —— 重复触发是本模块最强的禁令。
        canAct: st === 'pending',
        ref: String(x.id), source: 'events'
      };
      if (row.kind === 'repeat') {
        row.remainRuns = Math.max(0, cfg.maxRuns - row.runs);
        // `nextAt` 只在「还没到点」时才有意义：到点之后的下一跳要等 claim 落地才定，
        //   提前算出来就是把「还没发生的事」写成已知时刻（本仓的老病）。
        row.nextAt = (hasAt && at > t) ? at : null;
      }
      if (hasAt) timed.push(row); else untimed.push(row);
    });
    // 排序：时刻升序；同刻按 priority 降序、再按 id 升序 —— 与 order() 同源口径，
    //   但不复用它（order 吃的是原始行、且以 priority 为首键；未来轴以时刻为首键）。
    timed.sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    // 未知时刻者按 priority 降序、id 升序（稳定，不用「现在」冒充）。
    untimed.sort(function (a, b) {
      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    const merged = timed.concat(untimed);
    const truncated = merged.length > cap;
    const kept = truncated ? merged.slice(0, cap) : merged;
    stat.timelineReads = (stat.timelineReads || 0) + 1;
    return {
      ok: true, now: t, clock: 'events',
      total: merged.length, cap: cap, truncated: truncated, dropped: truncated ? merged.length - cap : 0,
      timedCount: timed.length, untimedCount: untimed.length,
      dueCount: timed.filter(function (r) { return r.due === true; }).length,
      blockedCount: timed.filter(function (r) { return r.blocked === true; }).length,
      byKind: byKind, byStatus: byStatus,
      rows: kept.map(function (r) { return Object.assign({}, r); }),
      untimed: untimed.slice(0, cap).map(function (r) { return Object.assign({}, r); }),
      note: '事件钟（不是剧情日）：两种时刻之间没有换算率，故 day 恒为 null；'
        + 'conditional 无确定时刻、不猜；已到点未认领才算 due；终态行默认不进未来轴'
    };
  }
  /** V8: opt-in schedule-to-archive bridge. Never resolves unproven conditions or guesses payload facts. */
  function fulfillDue(opts) {
    const cfg = settings();
    if (!cfg.enabled || !cfg.autoFulfill) return { ok: false, reason: 'disabled' };
    if (!WA.backstage || typeof WA.backstage.archiveScheduled !== 'function') return { ok: false, reason: 'bridge-missing' };
    // Do not claim rows already owned by another executor; crash-reclaimed rows use the same owner.
    const live = active();
    if (live.some(function (x) { return x.status === 'claimed' && x.owner !== 'events.archive'; })) {
      return { ok: false, reason: 'foreign-owner' };
    }
    const asked = Number((opts || {}).max);
    const budget = isFinite(asked) && asked > 0 ? Math.max(1, Math.min(Math.floor(asked), cfg.maxClaims)) : cfg.maxClaims;
    const retry = live.filter(function (x) { return x.status === 'claimed' && x.owner === 'events.archive'; }).slice(0, budget);
    const c = retry.length < budget ? claim(undefined, Object.assign({}, opts || {}, { owner: 'events.archive', max: budget - retry.length }))
      : { ok: true, items: [], blocked: [], deferred: [] };
    if (!c.ok) return c;
    const results = retry.concat(c.items).map(function (x) {
      try { return complete(x.id, { ok: true, opId: x.opId, archiveScheduled: true, note: 'scheduled title archived' }); }
      catch (e) { return { ok: false, reason: 'archive-failed', id: x.id, error: String(e && e.message || e).slice(0, 120) }; }
    });
    return { ok: results.every(function (r) { return r.ok; }), count: results.filter(function (r) { return r.ok; }).length, results: results, blocked: c.blocked, deferred: c.deferred };
  }
  function fulfilledBlock() {
    const s = state(), chron = Array.isArray(s.chronicle) ? s.chronicle : [];
    const recent = chron.filter(function (c) { return c && c.kind === 'scheduled-event' && c.visibility !== 'hidden'; }).slice(-settings().maxRows);
    return recent.length ? '[排期事件·已兑现]\n' + recent.map(function (c) { return '· ' + c.title; }).join('\n')
      + '\n以上仅为已登记排期的兑现记录；不得补造结果或人物反应。' : '';
  }
  /** 注入块：只报已排期（含执行中），并明标「未到点 ≠ 已发生」。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const live = active();
    const archived = fulfilledBlock();
    if (!live.length) return archived;
    const now = clockNow('events');
    const lines = live.map(function (x) {
      const when = x.status === 'claimed' ? '执行中（已认领、未回报）'
        : (isFinite(x.scheduledAt) && now >= x.scheduledAt ? '已到点（待认领）' : '未到点');
      const cond = x.condition ? ('；条件：' + x.condition) : '';
      const rep = x.kind === 'repeat' ? ('；周期 ' + x.intervalMs + 'ms × ' + x.runs + '/' + cfg.maxRuns) : '';
      return '· [P' + x.priority + '] ' + x.title + '（' + x.kind + '；' + when + cond + rep + '）';
    });
    return (archived ? archived + '\n' : '') + '[事件调度]\n' + lines.join('\n')
      + '\n以上是**已排期**的事件（含执行中与未到点）。未到点的事件不得写成已发生；'
      + '条件未满足时必须停住，不得替它提前完成；已认领未回报的事件不得重复触发。';
  }

  WA.events = {
    KINDS: KINDS, ACTIVE: ACTIVE, TERMINAL: TERMINAL,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    schedule: schedule, due: due, claim: claim, complete: complete, cancel: cancel, replace: replace, fulfillDue: fulfillDue,
    active: active, fails: fails, buildBlock: buildBlock,
    // v2.291.0（EXV7-7）：事件钟上的未来时间轴（只读投影，不改 stage）。
    timelineView: timelineView,
    stat: function () {
      return Object.assign({}, stat, {
        faults: Object.assign({}, stat.faults),
        live: rows().filter(isActive).length,
        tracked: rows().length
      });
    }
  };
  WA.workflow.register({ id: 'events.fulfill', chain: 'before', order: 7, critical: false, label: '排期事件兑现',
    run: function (ctx) { return WA.events.fulfillDue({ metConditions: (ctx && ctx.metConditions) || [] }); } });
})();