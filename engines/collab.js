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
  const DEF = { enabled: false, maxSessions: 32, maxQueue: 128, maxConflicts: 64, maxActor: 60 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'collab',
    bounds: { maxSessions: [2, 256], maxQueue: [8, 1024], maxConflicts: [8, 512], maxActor: [8, 200] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const REASONS = ['disabled', 'bad-session', 'no-session', 'bad-actor', 'bad-op',
    'claimed-by-other', 'duplicate', 'need-confirm', 'bad-strategy', 'bad-conflict', 'no-conflict',
    'capacity', 'store-unavailable', 'one-sided'];

  const STRATEGIES = ['last-write-wins', 'keep-a', 'keep-b'];

  const stat = { opened: 0, closed: 0, claims: 0, releases: 0, enqueued: 0, dupes: 0,
    flushed: 0, conflicts: 0, resolved: 0, blocked: 0, lastReason: '', faults: {} };
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
    } else {
      if (c.sessions.length > 64) c.sessions = c.sessions.slice(-64);
      if (c.queue.length > 128) c.queue = c.queue.slice(-128);
      if (c.conflicts.length > 64) c.conflicts = c.conflicts.slice(-64);
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
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { seq: 0, sessions: [], claims: {}, queue: [], conflicts: [] };
    return {
      seq: (typeof c.seq === 'number' && isFinite(c.seq)) ? Math.floor(c.seq) : 0,
      sessions: Array.isArray(c.sessions) ? c.sessions : [],
      claims: (c.claims && typeof c.claims === 'object' && !Array.isArray(c.claims)) ? c.claims : {},
      queue: Array.isArray(c.queue) ? c.queue : [],
      conflicts: Array.isArray(c.conflicts) ? c.conflicts : []
    };
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
      strategies: STRATEGIES.slice(), reasons: REASONS.slice()
    });
  }

  WA.collab = {
    REASONS: REASONS, STRATEGIES: STRATEGIES,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    open: open, close: close, claim: claim, release: release,
    enqueue: enqueue, flush: flush, noteConflict: noteConflict, resolve: resolve,
    active: active, sessions: sessions, pending: pending, conflicts: conflicts, holderOf: holderOf,
    stat: statOf
  };
})();