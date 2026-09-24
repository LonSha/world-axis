/**
 * WorldAxis engines/events.js (v2.81.0) — 事件调度（第十五面：排期 ≠ 触发）
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
 *   4 总开关默认关闭；关闭时不排期、不认领、不注入，也不凭空补写「已发生」。
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
  const DEF = { enabled: false, maxRows: 24, maxRuns: 12, maxFails: 12, retryDelayMs: 1000, maxRetries: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'events',
    bounds: { maxRows: [1, 24], maxRuns: [1, 60], maxFails: [1, 24], retryDelayMs: [0, 600000], maxRetries: [0, 5] } };
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

  const stat = { scheduled: 0, claimed: 0, completed: 0, cancelled: 0, replaced: 0, exhausted: 0, failed: 0, conditionMisses: 0, lastReason: '', faults: {} };
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
  function ensure(draft) {
    if (!draft.events || typeof draft.events !== 'object' || Array.isArray(draft.events)) draft.events = { rows: [], failQueue: [] };
    if (!Array.isArray(draft.events.rows)) draft.events.rows = [];
    if (!Array.isArray(draft.events.failQueue)) draft.events.failQueue = [];
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
    return x.status === 'pending' && isFinite(x.scheduledAt) && t >= x.scheduledAt;
  }
  /** 只读视图（**逐字段拷贝**：读面不得回传 store 内部活引用，v2.79.0 面 B）。 */
  function view(x) {
    return {
      id: x.id, kind: x.kind, title: x.title, priority: x.priority, status: x.status,
      scheduledAt: x.scheduledAt, intervalMs: x.intervalMs, condition: x.condition,
      runs: x.runs || 0, retries: x.retries || 0, lastNote: x.lastNote || '',
      payload: (x.payload && typeof x.payload === 'object' && !Array.isArray(x.payload)) ? Object.assign({}, x.payload) : {}
    };
  }

  /**
   * 排期一个事件。四类 kind 的必填项不同：
   *   once        时刻可选（缺省 = 现在，即立即可认领）
   *   delayed     必须给 `at`（绝对时刻）或 `inMs`（相对毫秒）
   *   repeat      必须给正的 `intervalMs`（首触发时刻同上，缺省 = 现在）
   *   conditional 必须给非空 `condition`
   * 排期**不改写既有事件**：同 id 且仍在活动态 ⇒ `duplicate` 拒收（不静默覆盖）。
   */
  function schedule(item) {
    const it = item || {};
    const id = str(it.id, 40), title = str(it.title, 40);
    const kind = str(it.kind, 16) || 'once';
    if (!id || !title) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (KINDS.indexOf(kind) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', kinds: KINDS.slice() }; }
    const hasAt = it.at !== undefined && it.at !== null;
    const hasIn = it.inMs !== undefined && it.inMs !== null;
    let at = NaN;
    if (hasAt) at = finite(it.at);
    else if (hasIn) {
      const rel = finite(it.inMs);
      if (isFinite(rel) && rel >= 0) at = clockNow('events') + rel;
    }
    if ((hasAt || hasIn) && !isFinite(at)) { noteFault('bad-time'); return { ok: false, reason: 'bad-time' }; }
    if (isFinite(at) && at < 0) { noteFault('bad-time'); return { ok: false, reason: 'bad-time' }; }
    let intervalMs = 0;
    if (kind === 'repeat') {
      const iv = finite(it.intervalMs);
      if (!isFinite(iv) || iv <= 0) { noteFault('bad-trigger'); return { ok: false, reason: 'bad-trigger', need: 'intervalMs>0' }; }
      intervalMs = iv;
    }
    const condition = str(it.condition, 60);
    if (kind === 'conditional' && !condition) { noteFault('bad-trigger'); return { ok: false, reason: 'bad-trigger', need: 'condition' }; }
    if (kind === 'delayed' && !isFinite(at)) { noteFault('bad-trigger'); return { ok: false, reason: 'bad-trigger', need: 'at|inMs' }; }
    let priority = DEF_PRIORITY;
    if (it.priority !== undefined && it.priority !== null) {
      const pr = finite(it.priority);
      if (!isFinite(pr) || pr < MIN_PRIORITY || pr > MAX_PRIORITY) { noteFault('bad-priority'); return { ok: false, reason: 'bad-priority', min: MIN_PRIORITY, max: MAX_PRIORITY }; }
      priority = Math.floor(pr);
    }
    const now = clockNow('events');
    const payload = (it.payload && typeof it.payload === 'object' && !Array.isArray(it.payload)) ? Object.assign({}, it.payload) : {};
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
        intervalMs: intervalMs,
        condition: condition,
        payload: payload,
        runs: 0, retries: 0, conditionMisses: 0,
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
    const items = [], blocked = [];
    let out = null;
    WA.store.transact(function (draft) {
      const e = ensure(draft);
      e.rows.forEach(function (x) {
        if (!x || !ready(x, t)) return;
        if (!conditionMet(x, met)) {
          // 条件未足：**不写任何字段**（状态零变化是本模块的判据之一）。
          blocked.push({ id: x.id, reason: 'condition-unmet', condition: x.condition });
          return;
        }
        x.status = 'claimed';
        x.claimedAt = t;
        items.push(view(x));
      });
      out = { ok: true, at: t, count: items.length, ids: items.map(function (x) { return x.id; }), items: items, blocked: blocked };
    }, 'events:claim');
    if (!out) return { ok: false, reason: 'store-unavailable' };
    out.items.sort(order);
    out.ids = out.items.map(function (x) { return x.id; });
    out.count = out.items.length;
    stat.claimed += out.items.length;
    stat.conditionMisses += out.blocked.length;
    stat.lastReason = out.items.length ? 'claimed' : (out.blocked.length ? 'condition-unmet' : 'nothing-due');
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
    let out = null;
    WA.store.transact(function (draft) {
      const e = ensure(draft);
      const x = e.rows.filter(function (y) { return y && y.id === rid; })[0];
      if (!x) { out = { ok: false, reason: 'missing', id: rid }; return false; }
      if (x.status !== 'claimed') { out = { ok: false, reason: 'not-claimed', id: rid, status: x.status }; return false; }
      const now = clockNow('events');
      if (r.ok === true) {
        x.runs = (x.runs || 0) + 1;
        x.lastExecutedAt = now;
        x.lastNote = note;
        if (x.kind === 'repeat' && x.runs < settings().maxRuns) {
          x.status = 'pending';
          x.scheduledAt = now + (isFinite(x.intervalMs) ? x.intervalMs : 0);
        } else if (x.kind === 'repeat') {
          x.status = 'exhausted'; x.executedAt = now;
        } else {
          x.status = 'executed'; x.executedAt = now;
        }
        out = { ok: true, id: rid, status: x.status, runs: x.runs };
      } else {
        x.retries = (x.retries || 0) + 1;
        x.lastFailAt = now;
        x.lastNote = note;
        e.failQueue.push({ id: rid, at: now, note: note, retries: x.retries });
        if (WA.evict) WA.evict.array(e.failQueue, 'events.failQueue', settings().maxFails);
        if (x.retries >= settings().maxRetries) { x.status = 'failed'; x.executedAt = now; }
        else { x.status = 'pending'; x.scheduledAt = now + settings().retryDelayMs; }
        out = { ok: true, id: rid, status: x.status, retries: x.retries, failed: x.status === 'failed' };
      }
    }, 'events:complete');
    if (!out) return { ok: false, reason: 'store-unavailable' };
    if (!out.ok) noteFault(out.reason);
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
      const x = ensure(draft).rows.filter(function (y) { return y && y.id === rid; })[0];
      if (!x) { out = { ok: false, reason: 'missing', id: rid }; return false; }
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
   */
  function replace(id, patch) {
    const rid = str(id, 40);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const old = row(rid);
    if (!old) { noteFault('missing'); return { ok: false, reason: 'missing', id: rid }; }
    if (isTerminal(old)) { noteFault('not-active'); return { ok: false, reason: 'not-active', id: rid, status: old.status }; }
    const patch2 = patch || {};
    const p = {
      id: str(patch2.id, 40) || (rid + '@' + clockNow('events')),
      kind: patch2.kind !== undefined ? patch2.kind : old.kind,
      title: patch2.title !== undefined ? patch2.title : old.title,
      priority: patch2.priority !== undefined ? patch2.priority : old.priority,
      at: patch2.at, inMs: patch2.inMs,
      intervalMs: patch2.intervalMs !== undefined ? patch2.intervalMs : old.intervalMs,
      condition: patch2.condition !== undefined ? patch2.condition : old.condition,
      payload: patch2.payload !== undefined ? patch2.payload : old.payload
    };
    const c = cancel(rid, 'replaced');
    if (!c.ok) return c;
    const s = schedule(p);
    if (!s.ok) return s;
    stat.replaced++;
    stat.lastReason = 'replaced';
    return { ok: true, replaced: rid, id: s.id, scheduledAt: s.scheduledAt };
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

  /** 注入块：只报已排期（含执行中），并明标「未到点 ≠ 已发生」。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const live = active();
    if (!live.length) return '';
    const now = clockNow('events');
    const lines = live.map(function (x) {
      const when = x.status === 'claimed' ? '执行中（已认领、未回报）'
        : (isFinite(x.scheduledAt) && now >= x.scheduledAt ? '已到点（待认领）' : '未到点');
      const cond = x.condition ? ('；条件：' + x.condition) : '';
      const rep = x.kind === 'repeat' ? ('；周期 ' + x.intervalMs + 'ms × ' + x.runs + '/' + cfg.maxRuns) : '';
      return '· [P' + x.priority + '] ' + x.title + '（' + x.kind + '；' + when + cond + rep + '）';
    });
    return '[事件调度]\n' + lines.join('\n')
      + '\n以上是**已排期**的事件（含执行中与未到点）。未到点的事件不得写成已发生；'
      + '条件未满足时必须停住，不得替它提前完成；已认领未回报的事件不得重复触发。';
  }

  WA.events = {
    KINDS: KINDS, ACTIVE: ACTIVE, TERMINAL: TERMINAL,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    schedule: schedule, due: due, claim: claim, complete: complete, cancel: cancel, replace: replace,
    active: active, fails: fails, buildBlock: buildBlock,
    stat: function () {
      return Object.assign({}, stat, {
        faults: Object.assign({}, stat.faults),
        live: rows().filter(isActive).length,
        tracked: rows().length
      });
    }
  };
})();