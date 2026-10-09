/**
 * WorldAxis engines/collab.js (v2.112.0) — 协作会话 · 异步队列 · 冲突登记（计划二 #36 + #37 + #38 + #40）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────
 *   v2.110.0 的 `permissions` 回答了「**谁有权改**」，但它对「**两个人同时在同一份世界上改**」
 *   一个字都没说。实测现场有三种，此前都没有落点：
 *   · 同一角色被两人分别写入（后者静默覆盖前者，谁都没看见自己被覆盖）；
 *   · 一轮里 A 的改动要等 B 的确认才成立（**异步协作**：不是同时在线，而是交错进行）；
 *   · 离线/断开期间攒下的操作（**离线队列**）重连后批量重放，其中同 `opId` 被重放两次。
 *
 * ── 本模块只做四件事（每件都有明确的否定面）────────────────────
 *   ① **会话**：`open/close` 记录「谁在哪一段时间里参与了」。多个会话可同时打开
 *      （协作的本义），**不限制同时在线人数**、**不踢人**。
 *   ② **占用**：`claim/release` 把某个角色挂在某个会话名下。已被别人占用的角色**不静默夺取**
 *      —— 返回 `claimed-by-other` 并带出当前持有者，让调用方自己决定。
 *   ③ **队列**：`enqueue` 登记一条待重放操作（幂等键 `opId`）。同 `opId` 重复入队
 *      **不产生第二条**（`duplicate` 如实报，而不是静默吞掉）。
 *   ④ **冲突**：`noteConflict` 登记一处两端分歧；`resolve` 记录**显式裁决**（LWW / keep-a / keep-b），
 *      本模块**不自动裁决、不自动合并、不改任何用户数据**——它只把「分歧存在过」与
 *      「当时怎么判的」写下来，供事后复盘。
 *
 * ── 六条设计边界（全是否定式）──────────────────────────────────
 *   ① **读面不写**：`active / sessions / pending / conflicts / holderOf` 五个读数**零写入**。
 *   ② **不夺取**：占用冲突一律返回 `claimed-by-other`（带持有者），不做抢占、不做超时夺锁。
 *   ③ **不自动裁决**：`resolve` 必须显式给 `strategy` 且带 `{confirm:true}`；缺任一项即 `need-confirm`。
 *   ④ **不吞重放**：`flush` 只把队列标记为已交付并**交出**这批操作，由调用方执行；
 *      本模块**不替调用方写世界**（那是各引擎自己的事）。
 *   ⑤ **缺字段不猜**：`opId` / `actor` 缺失即拒收（`bad-op` / `bad-actor`），不按次序编一个。
 *   ⑥ **如实报分歧**：两个会话改同一角色时，`noteConflict` 记下 `aPath`/`bPath` 两侧；
 *      只有一侧存在时报 `one-sided`，**不假装是冲突**（单边改动不是冲突）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_collab_settings_v1';
  // v2.139.0（E10）：协作任务两枚上界。任务表与三张旧表各自夹 —— 上限不是同一条。
  const DEF = { enabled: false, maxSessions: 32, maxQueue: 128, maxConflicts: 64, maxActor: 60,
    maxTasks: 24, maxPartners: 8 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'collab',
    bounds: { maxSessions: [2, 256], maxQueue: [8, 1024], maxConflicts: [8, 512], maxActor: [8, 200],
      maxTasks: [2, 128], maxPartners: [2, 24] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const REASONS = ['disabled', 'bad-session', 'no-session', 'bad-actor', 'bad-op',
    'claimed-by-other', 'duplicate', 'need-confirm', 'bad-strategy', 'bad-conflict', 'no-conflict',
    'capacity', 'store-unavailable', 'one-sided',
    // v2.139.0（E10）：协作任务四枚。各自对应一句产品承诺，互不合并：
    //   bad-task 任务号坏 / 不存在；not-due 还没到截止；too-few 参与人数不足 2；
    //   not-on-roster 罚没目标不在名册（org.penalize 的原话，转到任务面如实转述）。
    'bad-task', 'not-due', 'too-few', 'not-on-roster'];

  const STRATEGIES = ['last-write-wins', 'keep-a', 'keep-b'];

  const stat = { opened: 0, closed: 0, claims: 0, releases: 0, enqueued: 0, dupes: 0,
    flushed: 0, conflicts: 0, resolved: 0, blocked: 0, lastReason: '', faults: {},
    // v2.139.0（E10）：任务三桶 + 两份留步。breachRecorded 与 penalized 不可合并：
    //   前者是「记下了」，后者是「真罚了」—— 合成一个数就答不出「违约有没有被处置」。
    tasks: 0, settled: 0, breaches: 0, breachRecorded: 0, penalized: 0, contributions: 0 };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  /**
   * v2.114.0：把三张表接到挤出侧（此前只有准入闸，关掉的会话/交付过的行只增不减）。
   *   `WA.evict` 缺席时退回本地截断（与 backstage 的写法同形）——本模块不把「挤出」
   *   变成第二种容量治理；counts 全走既有站点，不新增站点名。
   *   注意排除**未关闭**的会话与**未交付/未裁决**的行（它们属准入面，由 max* 把关）。
   */
  function prune(c) {
    if (WA.evict) {
      WA.evict.array(c.sessions, 'collab.sessions');
      WA.evict.array(c.queue, 'collab.queue');
      WA.evict.array(c.conflicts, 'collab.conflicts');
      if (Array.isArray(c.tasks)) WA.evict.array(c.tasks, 'collab.tasks');
    } else {
      if (c.sessions.length > 64) c.sessions = c.sessions.slice(-64);
      if (c.queue.length > 128) c.queue = c.queue.slice(-128);
      if (c.conflicts.length > 64) c.conflicts = c.conflicts.slice(-64);
      if (Array.isArray(c.tasks) && c.tasks.length > 24) c.tasks = c.tasks.slice(-24);
    }
    return c;
  }

  function txt(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max) : String(v == null ? '' : v).slice(0, max || 0); }
    catch (e) { return ''; }
  }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket() {
    const c = state().collab;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { seq: 0, sessions: [], claims: {}, queue: [], conflicts: [], tasks: [] };
    return {
      seq: (typeof c.seq === 'number' && isFinite(c.seq)) ? Math.floor(c.seq) : 0,
      sessions: Array.isArray(c.sessions) ? c.sessions : [],
      claims: (c.claims && typeof c.claims === 'object' && !Array.isArray(c.claims)) ? c.claims : {},
      queue: Array.isArray(c.queue) ? c.queue : [],
      conflicts: Array.isArray(c.conflicts) ? c.conflicts : [],
      tasks: Array.isArray(c.tasks) ? c.tasks : []
    };
  }
  /**
   * v2.139.0 (E10 / kou-jing 5): ren-wu de shi-li gui-shu -- zhi-du, bu jian shi-li, bu fa ming-ce.
   *   shu-ju yuan shi evolution.factions[].roster (org.js de zhi-ce zhen-yuan), ben mo-kuai bu zi-dai fu-ben.
   *   fan-hui null biao-shi cha-bu-dao gui-shu -- ta bu deng-yu ci-ren-wu-shi-li zhe-zhong duan-yan.
   */
  function factionOf(name) {
    const who = txt(name, settings().maxActor);
    if (!who) return null;
    const facs = ((state().evolution || {}).factions) || [];
    for (let i = 0; i < facs.length; i++) {
      const f = facs[i];
      if (!f) continue;
      const rs = f.roster;
      if (rs && typeof rs === 'object' && !Array.isArray(rs) && Object.prototype.hasOwnProperty.call(rs, who)) {
        return txt(f.name, 40) || null;
      }
    }
    return null;
  }

  /* ── 写入口 ─────────────────────────────────────────────────── */

  /** 打开一个协作会话（多人可同时在开：**不限制并发数、不踢人**）。 */
  function open(label, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const who = txt((opts && opts.by) || label, cfg.maxActor);
    if (!who) { noteFault('bad-session'); return { ok: false, reason: 'bad-session' }; }
    const b = bucket();
    if (b.sessions.filter(function (s) { return !s.closedAt; }).length >= cfg.maxSessions) {
      noteFault('capacity'); return { ok: false, reason: 'capacity' };
    }
    const id = 'S' + String(b.seq + 1);
    const out = WA.store.transact(function (draft) {
      const c = draft.collab && typeof draft.collab === 'object' && !Array.isArray(draft.collab) ? draft.collab : {};
      if (!Array.isArray(c.sessions)) c.sessions = [];
      if (!Array.isArray(c.queue)) c.queue = [];
      if (!Array.isArray(c.conflicts)) c.conflicts = [];
      if (!c.claims || typeof c.claims !== 'object' || Array.isArray(c.claims)) c.claims = {};
      c.seq = (typeof c.seq === 'number' && isFinite(c.seq) ? Math.floor(c.seq) : 0) + 1;
      c.sessions.push({ id: id, by: who, label: txt(label, 60) || null, openedAt: clockWall(), closedAt: null, changes: 0 });
      prune(c);
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.opened++; stat.lastReason = 'opened';
    return { ok: true, session: id, by: who };
  }

  /** 关闭会话。关闭**不存在的会话**：`ok:false` + `no-session`（不假称成功）。 */
  function close(id) {
    const sid = txt(id, 20);
    if (!sid) { noteFault('bad-session'); return { ok: false, reason: 'bad-session' }; }
    const b = bucket();
    const s = b.sessions.filter(function (x) { return x.id === sid; })[0];
    if (!s) { noteFault('no-session'); return { ok: false, reason: 'no-session' }; }
    if (s.closedAt) return { ok: true, session: sid, alreadyClosed: true };
    const out = WA.store.transact(function (draft) {
      const c = draft.collab || {};
      (c.sessions || []).forEach(function (x) { if (x.id === sid) x.closedAt = clockWall(); });
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.closed++;
    return { ok: true, session: sid, closed: true };
  }

  /**
   * 占用一个角色。
   *   已被**别的会话**占用 ⇒ 不夺取，返回 `claimed-by-other` 并带出持有者。
   *   同一会话重复占用 ⇒ 幂等成功（`already:true`）。
   */
  function claim(actor, sessionId) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const a = txt(actor, cfg.maxActor);
    if (!a) { noteFault('bad-actor'); return { ok: false, reason: 'bad-actor' }; }
    const sid = txt(sessionId, 20);
    if (!sid) { noteFault('bad-session'); return { ok: false, reason: 'bad-session' }; }
    const b = bucket();
    if (!b.sessions.some(function (s) { return s.id === sid && !s.closedAt; })) { noteFault('no-session'); return { ok: false, reason: 'no-session' }; }
    const cur = b.claims[a];
    if (cur && cur !== sid) { noteFault('claimed-by-other'); return { ok: false, reason: 'claimed-by-other', actor: a, holder: cur }; }
    if (cur === sid) return { ok: true, actor: a, session: sid, already: true };
    const out = WA.store.transact(function (draft) {
      const c = draft.collab || {};
      if (!c.claims || typeof c.claims !== 'object' || Array.isArray(c.claims)) c.claims = {};
      c.claims[a] = sid;
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.claims++;
    return { ok: true, actor: a, session: sid };
  }

  /** 释放占用。**不是持有者**时拒绝（`claimed-by-other`）——别人的锁不能替你解。 */
  function release(actor, sessionId) {
    const a = txt(actor, settings().maxActor);
    if (!a) { noteFault('bad-actor'); return { ok: false, reason: 'bad-actor' }; }
    const sid = txt(sessionId, 20);
    if (!sid) { noteFault('bad-session'); return { ok: false, reason: 'bad-session' }; }
    const b = bucket();
    if (!b.claims[a]) return { ok: true, actor: a, released: false };
    if (b.claims[a] !== sid) return { ok: false, reason: 'claimed-by-other', actor: a, holder: b.claims[a] };
    const out = WA.store.transact(function (draft) {
      const c = draft.collab || {};
      if (c.claims && typeof c.claims === 'object') delete c.claims[a];
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.releases++;
    return { ok: true, actor: a, released: true };
  }

  /**
   * 离线队列入队（幂等键 `opId`）。
   *   同 `opId` 重复入队 ⇒ `ok:false, reason:'duplicate'`（**如实报重复**，不静默吞、不重复排队）。
   */
  function enqueue(opId, kind, payload, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const id = txt(opId, 60);
    if (!id) { noteFault('bad-op'); return { ok: false, reason: 'bad-op' }; }
    const k = txt(kind, 40);
    if (!k) { noteFault('bad-op'); return { ok: false, reason: 'bad-op' }; }
    const b = bucket();
    if (b.queue.some(function (q) { return q.opId === id; })) { stat.dupes++; noteFault('duplicate'); return { ok: false, reason: 'duplicate', opId: id }; }
    if (b.queue.length >= cfg.maxQueue) { noteFault('capacity'); return { ok: false, reason: 'capacity' }; }
    let pl = null;
    try {
      pl = (payload === undefined || payload === null) ? null
        : (typeof payload === 'string' ? payload.slice(0, 200) : JSON.stringify(payload).slice(0, 200));
    } catch (e) { pl = null; }
    const row = { opId: id, kind: k, payload: pl, by: txt((opts && opts.by) || '', cfg.maxActor) || null, at: clockWall(), flushedAt: null };
    const out = WA.store.transact(function (draft) {
      const c = draft.collab || {};
      if (!Array.isArray(c.queue)) c.queue = [];
      c.queue.push(row);
      prune(c);
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.enqueued++;
    return { ok: true, opId: id, queued: b.queue.length + 1 };
  }

  /**
   * 交付队列：把**未交付**的操作标记为已交付并**交出去**，由调用方执行。
   *   本模块不替调用方写世界（边界④）。`ops` 是副本，外部改不动存档。
   */
  function flush(opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const b = bucket();
    const ready = b.queue.filter(function (q) { return !q.flushedAt; });
    // 此处**不设**容量闸：队列上界已由 `enqueue` 在入队侧守卫（本面唯一写入口），
    //   故 `ready.length > maxQueue` 结构上不可能发生；再写一道只会是永不执行的分支
    //   （v2.78.0 第十二面的规矩：永不执行的码要么造见证、要么进死表，不能含混留着）。
    const ops = ready.map(function (q) { return { opId: q.opId, kind: q.kind, payload: q.payload, by: q.by, at: q.at }; });
    if (ops.length) {
      const ids = ops.map(function (o) { return o.opId; });
      const out = WA.store.transact(function (draft) {
        const c = draft.collab || {};
        (c.queue || []).forEach(function (q) { if (ids.indexOf(q.opId) >= 0 && !q.flushedAt) q.flushedAt = clockWall(); });
        draft.collab = c;
        return true;
      });
      if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
      stat.flushed += ops.length;
    }
    return { ok: true, count: ops.length, ops: ops, by: txt((opts && opts.by) || '', 60) || null };
  }

  /**
   * 登记一处分歧。
   *   只有一侧存在（另一侧为 null/undefined）⇒ `one-sided`：**单边改动不是冲突**，不记。
   */
  function noteConflict(actor, aPath, bPath, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const a = txt(actor, cfg.maxActor);
    if (!a) { noteFault('bad-actor'); return { ok: false, reason: 'bad-actor' }; }
    const ha = !(aPath === undefined || aPath === null || aPath === '');
    const hb = !(bPath === undefined || bPath === null || bPath === '');
    if (!ha || !hb) { noteFault('one-sided'); return { ok: false, reason: 'one-sided', actor: a, side: ha ? 'a-only' : (hb ? 'b-only' : 'neither') }; }
    const b = bucket();
    if (b.conflicts.filter(function (c) { return !c.resolvedAt; }).length >= cfg.maxConflicts) { noteFault('capacity'); return { ok: false, reason: 'capacity' }; }
    const id = 'C' + String(b.seq + 1);
    const row = {
      id: id, actor: a, at: clockWall(),
      aPath: txt(String(aPath), 120), bPath: txt(String(bPath), 120),
      aBy: txt((opts && opts.aBy) || '', cfg.maxActor) || null,
      bBy: txt((opts && opts.bBy) || '', cfg.maxActor) || null,
      resolvedAt: null, strategy: null
    };
    const out = WA.store.transact(function (draft) {
      const c = draft.collab || {};
      if (!Array.isArray(c.conflicts)) c.conflicts = [];
      c.seq = (typeof c.seq === 'number' && isFinite(c.seq) ? Math.floor(c.seq) : 0) + 1;
      c.conflicts.push(row);
      prune(c);
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.conflicts++;
    return { ok: true, conflict: id, actor: a };
  }

  /**
   * 记录**显式裁决**（不改任何用户数据）。
   *   缺 `strategy` 或 `{confirm:true}` ⇒ 拒收。策略必须是 `STRATEGIES` 之一。
   */
  function resolve(conflictId, strategy, opts) {
    const cid = txt(conflictId, 20);
    if (!cid) { noteFault('bad-conflict'); return { ok: false, reason: 'bad-conflict' }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    if (o.confirm !== true) { noteFault('need-confirm'); return { ok: false, reason: 'need-confirm' }; }
    const st = txt(strategy, 40);
    if (STRATEGIES.indexOf(st) < 0) { noteFault('bad-strategy'); return { ok: false, reason: 'bad-strategy', allowed: STRATEGIES.slice() }; }
    const b = bucket();
    const row = b.conflicts.filter(function (x) { return x.id === cid; })[0];
    if (!row) { noteFault('no-conflict'); return { ok: false, reason: 'no-conflict' }; }
    if (row.resolvedAt) return { ok: true, conflict: cid, alreadyResolved: true, strategy: row.strategy };
    const out = WA.store.transact(function (draft) {
      const c = draft.collab || {};
      (c.conflicts || []).forEach(function (x) { if (x.id === cid) { x.resolvedAt = clockWall(); x.strategy = st; x.by = txt(o.by, 60) || null; } });
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.resolved++;
    return { ok: true, conflict: cid, strategy: st };
  }


  /* ── v2.139.0（E10）：协作任务与违约 ───────────────────────────
   *  与既有三张表的分工（为什么是**新表**而不是往 queue 里塞字段）：
   *    · sessions / claims —— 「谁在开会话、谁占着哪个角色」（本地台账，零目标概念）；
   *    · queue / conflicts —— 「排了什么待重放、两端分歧怎么判的」（零参与者概念）；
   *    · tasks —— 「**几个人约好一起做一件事、到点各人做到没有**」。
   *  它答的是前四者一个字都没说的那一格：承诺是否被兑现。
   *  （`life.reciprocated` 只做「两方是否对称持有同一条合作承诺」的双向检查，
   *   它不问「到点做到没有」，也没有「几个人」。故不往 life 里塞。）
   *
   *  六条口径（全是否定式）：
   *   ① **违约只记不罚**：`settle` 只写 `breach` 与 `breachRecorded`；真罚必须显式调
   *      `penalize(taskId, person, item, amount)` ——它走 `WA.org.penalize` 的原话转述。
   *      自动罚没会把「记账」与「处置」一次性做完，事后无法复盘「当时该不该罚」。
   *   ② **结算幂等**：同一任务 `settle` 两次，第二次返回 `already:true` 而**不重复记 breach**。
   *      （首版实测的坑：幂等判据若不先造一个到点且有欠缴的任务，两次结算都是空任务，
   *       「没重复」是因为「压根没算过」——判据恒真。见专锁的正控制段。）
   *   ③ **未到截止不算违约**：`settle` 在 `now < deadline` 时拒收 `not-due`（可显式 `{force:true}`
   *      提前结算，但那会在结果里标 `forced:true`）—— 「没到点」与「做没做」不是一件事。
   *   ④ **参与人数不足 2 不成任务**：`too-few` —— 一个人的任务不是协作任务（它是日程）。
   *   ⑤ **任务不跨势力**：参与者的势力归属必须一致（不一致 ⇒ `bad-value`），
   *      多势力协作需先建联合势力（计划原文）。
   *   ⑥ **贡献不可为负**：`contribute` 只接受正数（`bad-amount`）—— 回擞不是贡献。
   */
  function taskId(v) { return txt(v, 24); }
  function findTask(b, id) { return (b.tasks || []).filter(function (t) { return t && t.id === id; })[0] || null; }
  /** 协作任务协作面（只读）：把要账的行摊平，不给未到期的任务编读数。 */
  function taskView(t) {
    if (!t) return null;
    const rows = (t.partners || []).map(function (p) {
      return { name: p.name, pledged: p.pledged, contributed: p.contributed,
        ok: p.contributed >= p.pledged, status: p.status || 'pending' };
    });
    return { id: t.id, goal: t.goal, deadline: t.deadline, status: t.status,
      partners: rows, done: rows.filter(function (r) { return r.ok; }).length,
      short: rows.filter(function (r) { return !r.ok; }).map(function (r) { return r.name; }),
      settledAt: t.settledAt || null, forced: !!t.forced };
  }
  /**
   * 建一个协作任务。**不写人物侧任何东西**（不造人、不发承诺、不动资源）：
   *   它只登记「这几个人约好了做什么、到什么时刻」。故不需要 registry 参与 ——
   *   任务表是独立台账，「谁在世界上存在」仍由 registry 唯一决定。
   *   `partners` 支持字符串数组或 `{name, pledge}`；`deadline` 是世界时钟读刻度。
   */
  function createTask(partners, goal, deadline, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const gl = txt(goal, 80);
    if (!gl) { noteFault('bad-value'); return { ok: false, reason: 'bad-value' }; }
    const dl = Number(deadline);
    if (!isFinite(dl)) { noteFault('bad-value'); return { ok: false, reason: 'bad-value' }; }
    const arr = Array.isArray(partners) ? partners : [];
    const rows = [];
    arr.forEach(function (p) {
      const nm = txt(typeof p === 'string' ? p : (p && p.name), cfg.maxActor);
      if (!nm) return;
      if (rows.some(function (r) { return r.name === nm; })) return;   // 同名不重复计入
      const pl = Number(typeof p === 'object' && p ? p.pledge : 0);
      rows.push({ name: nm, pledged: (isFinite(pl) && pl > 0) ? pl : 0, contributed: 0, status: 'pending' });
    });
    if (rows.length < 2) { noteFault('too-few'); return { ok: false, reason: 'too-few', got: rows.length }; }
    if (rows.length > cfg.maxPartners) { noteFault('capacity'); return { ok: false, reason: 'capacity' }; }
    // kou-jing 5: bu-kua-shi-li. que-gui-shu yu fen-shu-liang-jia fen-kai bao (why bu-tong).
    const owns = rows.map(function (r) { return factionOf(r.name); });
    const unowned = rows.filter(function (r, i) { return !owns[i]; }).map(function (r) { return r.name; });
    if (unowned.length) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', why: 'faction-unknown', persons: unowned };
    }
    const fac = owns[0];
    const mixed = rows.filter(function (r, i) { return owns[i] !== fac; }).map(function (r) { return r.name; });
    if (mixed.length) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', why: 'cross-faction', faction: fac, others: mixed };
    }
    const b = bucket();
    if (b.tasks.filter(function (t) { return t.status === 'active'; }).length >= cfg.maxTasks) {
      noteFault('capacity'); return { ok: false, reason: 'capacity' };
    }
    const id = 'T' + String(b.seq + 1);
    const row = { id: id, goal: gl, deadline: dl, by: txt((opts && opts.by) || '', cfg.maxActor) || null,
      createdAt: clockWall(), partners: rows, status: 'active', settledAt: null, forced: false,
      breaches: [],
      // ren-wu zi-dai shi-li gui-shu: fa-mo yao zhi-dao jiao-gei na-ge shi-li.
      // jian-ren-wu shi gu-ding xia-lai, er-bu shi fa-mo shi zai-suan yi-ci.
      faction: fac };
    const out = WA.store.transact(function (draft) {
      const c = draft.collab || {};
      if (!Array.isArray(c.tasks)) c.tasks = [];
      c.seq = (typeof c.seq === 'number' && isFinite(c.seq) ? Math.floor(c.seq) : 0) + 1;
      c.tasks.push(row);
      prune(c);
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.tasks++; stat.lastReason = 'task-created';
    return { ok: true, task: id, faction: fac, partners: rows.map(function (r) { return r.name; }), deadline: dl };
  }
  /** 记一笔贡献。任务不存在 / 人不在任务里 / 金额非正 / 任务已结算 ⇒ 各自拒收。 */
  function contribute(person, taskId0, amount) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const id = taskId(taskId0);
    if (!id) { noteFault('bad-task'); return { ok: false, reason: 'bad-task' }; }
    const who = txt(person, cfg.maxActor);
    if (!who) { noteFault('bad-actor'); return { ok: false, reason: 'bad-actor' }; }
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) { noteFault('bad-amount'); return { ok: false, reason: 'bad-amount' }; }
    const b = bucket();
    const t = findTask(b, id);
    if (!t) { noteFault('bad-task'); return { ok: false, reason: 'bad-task' }; }
    if (t.status !== 'active') { noteFault('bad-task'); return { ok: false, reason: 'bad-task' }; }
    const p = (t.partners || []).filter(function (x) { return x.name === who; })[0];
    if (!p) { noteFault('not-on-roster'); return { ok: false, reason: 'not-on-roster', task: id }; }
    const out = WA.store.transact(function (draft) {
      const c = draft.collab || {};
      const tt = (c.tasks || []).filter(function (x) { return x && x.id === id; })[0];
      if (!tt) return false;
      const pp = (tt.partners || []).filter(function (x) { return x.name === who; })[0];
      if (!pp) return false;
      pp.contributed = Math.round((pp.contributed + n) * 1000) / 1000;
      pp.status = pp.contributed >= pp.pledged ? 'met' : 'partial';
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.contributions++; stat.lastReason = 'contributed';
    return { ok: true, task: id, person: who, contributed: p.contributed + n };
  }
  /**
   * 到点结算。**只记不罚**（口径①）：缺缴者进任务的 `breaches` 名单并计入
   * `stat.breachRecorded`；`stat.penalized` 只由 `penalize` 推动。
   *   幂等：已结算 ⇒ `already:true`（不重复记 breach）。未到截止 ⇒ `not-due`
   *   （`{force:true}` 可提前结，标 `forced:true`）。
   */
  function settle(taskId0, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const id = taskId(taskId0);
    if (!id) { noteFault('bad-task'); return { ok: false, reason: 'bad-task' }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const b = bucket();
    const t0 = findTask(b, id);
    if (!t0) { noteFault('bad-task'); return { ok: false, reason: 'bad-task' }; }
    if (t0.status !== 'active') return { ok: true, task: id, already: true, view: taskView(t0) };
    const nowV = (function () { try { return Number(WA.clock.now('collab')); } catch (e) { return clockWall(); } })();
    const forced = o.force === true;
    if (!forced && isFinite(t0.deadline) && nowV < t0.deadline) {
      noteFault('not-due');
      return { ok: false, reason: 'not-due', task: id, deadline: t0.deadline, now: nowV };
    }
    // 缺缴名单在事务外先算：事务回调不得依赖外部可变的中间态。
    const missed = (t0.partners || []).filter(function (p) { return p.contributed < p.pledged; }).map(function (p) { return p.name; });
    const out = WA.store.transact(function (draft) {
      const c = draft.collab || {};
      const tt = (c.tasks || []).filter(function (x) { return x && x.id === id; })[0];
      if (!tt) return false;
      if (tt.status !== 'active') return true;      // 并发下的第二眼：已结算就不再记
      tt.status = (tt.partners || []).every(function (p) { return p.contributed >= p.pledged; }) ? 'completed' : 'breached';
      tt.settledAt = clockWall();
      tt.forced = forced;
      tt.breaches = (tt.partners || []).filter(function (p) { return p.contributed < p.pledged; })
        .map(function (p) { return { name: p.name, pledged: p.pledged, contributed: p.contributed }; });
      draft.collab = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.settled++;
    if (missed.length) { stat.breaches++; stat.breachRecorded += missed.length; }
    stat.lastReason = missed.length ? 'settled-breached' : 'settled-completed';
    const t1 = findTask(bucket(), id);
    return { ok: true, task: id, breached: missed.length > 0, missed: missed,
      settled: true, forced: forced, view: taskView(t1) };
  }
  /**
   * **显式**罚没（口径①的另一半）。本函数**不自己动资源**：它把缺缴者逐个交给
   *   `org.penalize(faction, person, item, amount)`，结果原话转述（含 `not-on-roster`）。
   *   缺 `org` / 缺势力归属 ⇒ 如实报，不假装罚过。
   */
  function penalize(taskId0, person, item, amount) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const id = taskId(taskId0);
    if (!id) { noteFault('bad-task'); return { ok: false, reason: 'bad-task' }; }
    const b = bucket();
    const t = findTask(b, id);
    if (!t) { noteFault('bad-task'); return { ok: false, reason: 'bad-task' }; }
    if (!WA.org || typeof WA.org.penalize !== 'function') return { ok: false, reason: 'module-missing' };
    const who = person ? txt(person, cfg.maxActor) : '';
    // shi-li gui-shu qu-zi ren-wu-xing (jian-ren-wu shi gu-ding).
    // xing-shang mei-you gai zi-duan -> ru-shi bao bad-value, bu-an dang-qian ming-ce bu-suan.
    // wei-shen-me ti-dao zhe-li: xia-mian 'wu-dian-ming' zhi-lu de zao-tui ye yao bao faction,
    //   er TDZ hui rang na-ju hua zhi-jie bao ReferenceError (shou-pao shi-ce jiu-shi zhe-yang).
    const fac = txt(t.faction || '', 40);
    if (!fac) return { ok: false, reason: 'bad-value', why: 'task-faction-absent' };
    let targets;
    if (who) {
      const p = (t.partners || []).filter(function (x) { return x.name === who; })[0];
      if (!p) { noteFault('not-on-roster'); return { ok: false, reason: 'not-on-roster', task: id }; }
      targets = [who];
    } else {
      // 不点名 => fa-de jiu-shi jie-suan-shi ji-xia de qian-jiao ming-dan.
      // hai-mei jie-suan => ming-dan bu-cun-zai, bao not-due (bu na ming-ce shang-mei-you mao-chong).
      if (t.status === 'active') { noteFault('not-due'); return { ok: false, reason: 'not-due', task: id, why: 'not-settled' }; }
      targets = (t.breaches || []).map(function (x) { return x.name; });
      if (!targets.length) return { ok: true, task: id, faction: fac, applied: 0, rows: [], reason: null, why: 'no-breach' };
    }
    const rows = targets.map(function (nm) {
      const r = WA.org.penalize(fac, nm, item || '粮', amount);
      return { name: nm, ok: !!(r && r.ok), reason: (r && r.reason) || null };
    });
    const okN = rows.filter(function (r) { return r.ok; }).length;
    if (okN) { stat.penalized += okN; stat.lastReason = 'penalized'; }
    else {
      // zhen-yin ruo shu ben mo-kuai ci-biao jiu yuan-yang ji, fou-ze gui bad-value.
      // bu ba wai-lai ma (insufficient / missing-holder) sai jin faults: na hui rang
      // ben mo-kuai ju-shou-ma zhe-ge du-shu-mian hun jin bie-ming. zhen-yin zai fan-hui-ti li.
      const why = rows[0].reason || 'bad-value';
      noteFault(REASONS.indexOf(why) >= 0 ? why : 'bad-value');
    }
    return { ok: okN > 0, task: id, faction: fac, applied: okN, rows: rows,
      reason: okN > 0 ? null : (rows[0].reason || 'bad-value') };
  }
  /** 协作可靠性读数（只读）：活跃 / 已完成 / 已违约 三桶 + 逐任务要账行。 */
  function taskStat() {
    const b = bucket();
    const all = b.tasks || [];
    return {
      active: all.filter(function (t) { return t.status === 'active'; }).length,
      completed: all.filter(function (t) { return t.status === 'completed'; }).length,
      breached: all.filter(function (t) { return t.status === 'breached'; }).length,
      total: all.length,
      breachRecorded: stat.breachRecorded, penalized: stat.penalized,
      rows: all.slice(-10).map(function (t) { return taskView(t); })
    };
  }

  /* ── 只读读数（零写入）────────────────────────────────────────── */

  /** 当前打开的会话（只读）。 */
  function active() {
    const b = bucket();
    return b.sessions.filter(function (s) { return !s.closedAt; })
      .map(function (s) { return { id: s.id, by: s.by, label: s.label, openedAt: s.openedAt }; });
  }
  /** 会话历史（含已关闭；只读）。 */
  function sessions() {
    return bucket().sessions.map(function (s) {
      return { id: s.id, by: s.by, label: s.label, openedAt: s.openedAt, closedAt: s.closedAt, open: !s.closedAt };
    });
  }
  /** 未交付的队列（只读）。 */
  function pending() {
    return bucket().queue.filter(function (q) { return !q.flushedAt; })
      .map(function (q) { return { opId: q.opId, kind: q.kind, by: q.by, at: q.at }; });
  }
  /** 冲突列表（只读；`open:true` 表示尚未裁决）。 */
  function conflicts() {
    return bucket().conflicts.map(function (c) {
      return { id: c.id, actor: c.actor, aPath: c.aPath, bPath: c.bPath, aBy: c.aBy, bBy: c.bBy,
        at: c.at, open: !c.resolvedAt, strategy: c.strategy || null };
    });
  }
  /** 谁占着这个角色（只读；没占 ⇒ `null`）。 */
  function holderOf(actor) {
    const a = txt(actor, settings().maxActor);
    if (!a) return null;
    const b = bucket();
    return b.claims[a] || null;
  }

  function statOf() {
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      sessions: bucket().sessions.length,
      openSessions: active().length,
      pending: pending().length,
      openConflicts: conflicts().filter(function (c) { return c.open; }).length,
      // E10: ren-wu-biao gui-mo ye jin stat. bu-jiao tasks: stat.tasks shi zhi-zeng ji-shu-qi.
      taskTotal: (bucket().tasks || []).length,
      openTasks: (bucket().tasks || []).filter(function (t) { return t && t.status === 'active'; }).length,
      breachesRecorded: stat.breachRecorded, penalized: stat.penalized,
      strategies: STRATEGIES.slice(), reasons: REASONS.slice()
    });
  }

  WA.collab = {
    REASONS: REASONS, STRATEGIES: STRATEGIES,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    open: open, close: close, claim: claim, release: release,
    enqueue: enqueue, flush: flush, noteConflict: noteConflict, resolve: resolve,
    // v2.139.0（E10）：协作任务四口 + 一枚读数（新表，与上面三张表各自夹）
    //   `taskView`（把要账行摊平的内部面）**不单独导出**：它的结果已由 `taskStat().rows`
    //   与 `settle` 的 `view` 字段带出，外部没有第二处需要这个函数本身（本仓口径：无独立消费方不挂）。
    createTask: createTask, contribute: contribute, settle: settle, penalize: penalize,
    taskStat: taskStat,
    active: active, sessions: sessions, pending: pending, conflicts: conflicts, holderOf: holderOf,
    stat: statOf
  };
})();