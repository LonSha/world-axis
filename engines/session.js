/**
 * WorldAxis engines/session.js (v2.119.0) — 多人共享世界的连接层（拓展计划 ⑧）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   `coop`（B9）已有「提议 → 裁决 → 归档」的状态机，`collab` 记「谁占着哪个角色」——
 *   但那是**单机上的多个身份**：没有任何一处回答得了：
 *   「这个人是谁（凭什么信他）？他能做什么（授权到哪）？他断了再回来，漏掉的消息怎么补？」
 *   现场于是只剩两种做法：要么假定所有人可信（任何人都能冒充主持人裁决），
 *   要么一旦丢包就全盘重来（断线等于世界回滚）。
 *
 * ── 本模块只做六件事，每件都有一个硬条件 ───────────────────────
 *   ① `host`/`join` 入座：每人一个**一次性发出的凭证**（`token`），
 *      凭证不入日志（只存指纹）；同一名字不得重复入座（`name-taken`）；
 *      角色被人占了就 `role-taken`（除非显式 `takeover`）。
 *   ② `auth` 验票：凭证不匹配一律 `bad-token`；停用过的会话 `revoked`。
 *      本模块只认凭证，不认「他说他是谁」。
 *   ③ `post` 发消息：**顺序号必须连续**（`out-of-order`，带出期望值）——
 *      顺序控制是「同一场世界里发生的事有一个确定次序」的最低要求。
 *   ④ `since` 续传：断线重连后按**已收到的最大序号**拉取增量（`since`）；
 *      序号超出历史窗口则 `need-resync`（不能假装没漏）。
 *   ⑤ `resync` 重同步：给一个带**版本号与历史水位**的快照（`snapshot`），
 *      客户端必须接受水位后才能继续（否则新旧混用）。
 *   ⑥ `view` 视点：按**权限**过滤——主持人看全量，玩家只看自己角色的线；
 *      卸座（`leave`）后不再产生新视点，但已发出的不撤回（历史不可篡改）。
 *
 * ── 八条设计边界（全是否定式）──────────────────────────────────
 *   ① **凭证不落明文**：只存指纹（`fp`），日志里看不到能冒充人的东西。
 *   ② **一个名字一个座**：重名入座拒收。
 *   ③ **角色独占且可显式接管**：静默抢角色不行。
 *   ④ **序号连续**：跳号拒收（顺序是世界的一部分）。
 *   ⑤ **漏了必须补**：超出窗口不许「假装没漏」，要重同步。
 *   ⑥ **权限写在座位的权限表上**，不写在调用方心情上。
 *   ⑦ **历史不可撤**：离座不删已发消息。
 *   ⑧ **容量有界且挤出有账**：站点（seats / log）都走 evict 单一出口。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────────
 *   · 本模块**不做网络传输**：它只管「消息在该进来时的样子」；实际通道由宿主负责。
 *   · 本模块**不判断提议内容**：裁决语义的真源仍是 `coop`。
 *   · 总开关默认关闭；关闭时不入座、不验票、不发消息、不注入。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_session_settings_v1';
  const DEF = { enabled: false, maxSeats: 8, maxLog: 64, windowMs: 3600000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'session',
    bounds: { maxSeats: [2, 16], maxLog: [16, 256], windowMs: [300000, 86400000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 座位权限具名表：权限写在座位上，不写在调用方心情上。
  const SEAT_PERMS = ['post', 'advance', 'decide', 'invite'];
  const HOST_PERMS = ['post', 'advance', 'decide', 'invite'];

  const stat = { hosted: 0, joined: 0, posts: 0, authed: 0, resyncs: 0, refused: 0,
    // X6（v2.128.0）：身份面三读 —— 认出几个、其中几个真进了权限表、几个认不出。
    //   「认过 5 次」答不出「5 次里有没有一次是冒充的」——这正是本版要能分辨的那件事。
    identified: 0, adopted: 0, unidentified: 0,
    lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.refused++; stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function ssOf(root) {
    const c = (root || state()).session;
    return (c && typeof c === 'object' && !Array.isArray(c)) ? c : null;
  }
  function seatsOf(root) { const c = ssOf(root); return (c && Array.isArray(c.seats)) ? c.seats : []; }
  function logOf(root) { const c = ssOf(root); return (c && Array.isArray(c.log)) ? c.log : []; }
  function findSeat(name, root) {
    const key = clean(name, 40);
    return seatsOf(root).filter(function (s) { return s && clean(s.name, 40) === key; })[0] || null;
  }
  function seatByToken(fp, root) {
    const k = clean(fp, 80);
    if (!k) return null;
    return seatsOf(root).filter(function (s) { return s && clean(s.fp, 80) === k; })[0] || null;
  }
  function openSession(draft, cfg) {
    draft.session = (draft.session && typeof draft.session === 'object' && !Array.isArray(draft.session))
      ? draft.session : { seats: [], log: [], seq: 0, rev: 0, host: '' };
    if (!Array.isArray(draft.session.seats)) draft.session.seats = [];
    if (!Array.isArray(draft.session.log)) draft.session.log = [];
    if (typeof draft.session.seq !== 'number') draft.session.seq = 0;
    if (typeof draft.session.rev !== 'number') draft.session.rev = 0;
    return draft.session;
  }
  /**
   * 凭证指纹。**不存明文**：只存一个单向摘要的前缀。
   *   本模块不需要可逆——验票只要「同样的明文算出同样的指纹」。
   */
  function fpOf(token) {
    const t = clean(token, 120);
    if (!t) return '';
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return 'fp' + h.toString(16) + '_' + t.length;
  }
  /** ① 主持人开座（主持人是权限最全的那个座）。 */
  function host(name, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const who = clean(name, 40), role = clean(o.role, 40), token = clean(o.token, 120);
    if (!who || !role) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!token) { noteFault('missing-token'); return { ok: false, reason: 'missing-token', hint: '入座必须持票（本模块只认凭证）' }; }
    const fp = fpOf(token);
    if (findSeat(who)) { noteFault('name-taken'); return { ok: false, reason: 'name-taken', name: who }; }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const ss = openSession(draft, cfg);
      if (ss.seats.length >= cfg.maxSeats) { out = { ok: false, reason: 'seats-full', cap: cfg.maxSeats }; return false; }
      const occupier = ss.seats.filter(function (s) { return s && clean(s.role, 40) === role; })[0] || null;
      if (occupier && !o.takeover) {
        out = { ok: false, reason: 'role-taken', role: role, by: clean(occupier.name, 40) };
        return false;
      }
      const now = clockNow('session');
      const seat = { name: who, role: role, fp: fp, perms: HOST_PERMS.slice(),
        host: true, active: true, at: now, lastSeq: 0 };
      if (occupier) occupier.active = false;
      ss.seats.push(seat);
      ss.host = who;
      ss.rev += 1;
      WA.evict.array(ss.seats, 'session.seats', cfg.maxSeats);
      out = { ok: true, name: who, role: role, perms: seat.perms.slice(), rev: ss.rev, host: true };
    }, 'session:host');
    if (out && out.ok) { stat.hosted++; stat.lastReason = 'hosted'; } else if (out) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 玩家入座：重名拒收；角色被占除非显式接管。 */
  function join(name, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const who = clean(name, 40), role = clean(o.role, 40), token = clean(o.token, 120);
    if (!who || !role) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!token) { noteFault('missing-token'); return { ok: false, reason: 'missing-token' }; }
    const fp = fpOf(token);
    if (findSeat(who)) { noteFault('name-taken'); return { ok: false, reason: 'name-taken', name: who }; }
    const cur = ssOf();
    if (!cur || !cur.host) { noteFault('no-host'); return { ok: false, reason: 'no-host', hint: '先有主持人才能入座' }; }
    const cfg = settings();
    const req = (Array.isArray(o.perms) ? o.perms : ['post']).map(function (p) { return clean(p, 20); });
    const bad = req.filter(function (p) { return SEAT_PERMS.indexOf(p) < 0; });
    if (bad.length) { noteFault('bad-perms'); return { ok: false, reason: 'bad-perms', bad: bad, allowed: SEAT_PERMS.slice() }; }
    let out = null;
    WA.store.transact(function (draft) {
      const ss = openSession(draft, cfg);
      if (ss.seats.length >= cfg.maxSeats) { out = { ok: false, reason: 'seats-full', cap: cfg.maxSeats }; return false; }
      const occupier = ss.seats.filter(function (s) { return s && s.active && clean(s.role, 40) === role; })[0] || null;
      if (occupier && !o.takeover) {
        out = { ok: false, reason: 'role-taken', role: role, by: clean(occupier.name, 40) };
        return false;
      }
      const now = clockNow('session');
      const seat = { name: who, role: role, fp: fp, perms: req.slice(),
        host: false, active: true, at: now, lastSeq: 0 };
      if (occupier) occupier.active = false;
      ss.seats.push(seat);
      ss.rev += 1;
      WA.evict.array(ss.seats, 'session.seats', cfg.maxSeats);
      out = { ok: true, name: who, role: role, perms: seat.perms.slice(), rev: ss.rev, host: false };
    }, 'session:join');
    if (out && out.ok) { stat.joined++; stat.lastReason = 'joined'; } else if (out) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ② 验票：只认凭证（不认「他说他是谁」）。 */
  function auth(name, token) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(name, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const seat = findSeat(who);
    if (!seat) { noteFault('unknown-seat'); return { ok: false, reason: 'unknown-seat', name: who }; }
    if (!seat.active) { noteFault('revoked'); return { ok: false, reason: 'revoked', name: who }; }
    const fp = fpOf(token);
    if (!fp || fp !== clean(seat.fp, 80)) { noteFault('bad-token'); return { ok: false, reason: 'bad-token', name: who }; }
    stat.authed++; stat.lastReason = 'authed';
    return { ok: true, name: who, role: seat.role, perms: (seat.perms || []).slice(), host: !!seat.host };
  }
  /**
   * ③ 发消息：**顺序号必须连续**（跳号拒收，带出期望值）。
   *   本模块只登记「一段有序历史」；消息语义由调用方决定。
   */
  function post(name, token, body, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const who = clean(name, 40), text = clean(body, 200);
    if (!who || !text) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const seat = findSeat(who);
    if (!seat) { noteFault('unknown-seat'); return { ok: false, reason: 'unknown-seat', name: who }; }
    if (!seat.active) { noteFault('revoked'); return { ok: false, reason: 'revoked', name: who }; }
    if (fpOf(token) !== clean(seat.fp, 80)) { noteFault('bad-token'); return { ok: false, reason: 'bad-token', name: who }; }
    const perms = seat.perms || [];
    if (perms.indexOf('post') < 0) { noteFault('not-authorized'); return { ok: false, reason: 'not-authorized', need: 'post', have: perms.slice() }; }
    const cur = ssOf();
    const expect = ((cur && cur.seq) || 0) + 1;
    const no = num(o.seq);
    if (no !== null && no !== expect) {
      noteFault('out-of-order');
      return { ok: false, reason: 'out-of-order', seq: no, expect: expect, hint: '顺序是世界的一部分' };
    }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const ss = openSession(draft, cfg);
      const now = clockNow('session');
      const seq = ss.seq + 1;
      ss.seq = seq;
      ss.log.push({ seq: seq, by: who, role: seat.role, text: text, at: now,
        kind: clean(o.kind, 20) || 'chat' });
      WA.evict.array(ss.log, 'session.log', cfg.maxLog);
      const s2 = findSeat(who, draft);
      if (s2) s2.lastSeq = seq;
      out = { ok: true, seq: seq, by: who, at: now, rev: ss.rev };
    }, 'session:post');
    if (out && out.ok) { stat.posts++; stat.lastReason = 'posted'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ④ 续传：按已收到的最大序号拉增量；**超出历史窗口则不许假装没漏**。
   */
  function since(name, token, lastSeq, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(name, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const seat = findSeat(who);
    if (!seat) { noteFault('unknown-seat'); return { ok: false, reason: 'unknown-seat', name: who }; }
    if (!seat.active) { noteFault('revoked'); return { ok: false, reason: 'revoked', name: who }; }
    if (fpOf(token) !== clean(seat.fp, 80)) { noteFault('bad-token'); return { ok: false, reason: 'bad-token', name: who }; }
    const from = num(lastSeq);
    if (from === null || from < 0) { noteFault('bad-seq'); return { ok: false, reason: 'bad-seq', lastSeq: lastSeq }; }
    const cur = ssOf();
    const head = (cur && cur.seq) || 0;
    if (from > head) {
      noteFault('ahead-of-head');
      return { ok: false, reason: 'ahead-of-head', lastSeq: from, head: head, hint: '认的序号比服务端还多，说明这份客户端不是这条线上来的' };
    }
    const rows = logOf();
    const oldest = rows.length ? rows[0].seq : head + 1;
    // 请求的起点早于历史窗口下沿 ⇒ 中间那段已经挤出，**不能假装没漏**。
    if (from + 1 < oldest) {
      noteFault('need-resync');
      return { ok: false, reason: 'need-resync', lastSeq: from, oldest: oldest,
        hint: '要的那段已不在历史窗口内，必须先重同步' };
    }
    const delta = rows.filter(function (r) { return r && r.seq > from; });
    return { ok: true, name: who, from: from, head: head, count: delta.length,
      rows: delta.map(function (r) { return { seq: r.seq, by: r.by, text: r.text, at: r.at, kind: r.kind }; }) };
  }
  /** ⑤ 重同步：给带版本号与历史水位的快照（客户端须接受水位后才能继续）。 */
  function resync(name, token) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(name, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const seat = findSeat(who);
    if (!seat) { noteFault('unknown-seat'); return { ok: false, reason: 'unknown-seat', name: who }; }
    if (!seat.active) { noteFault('revoked'); return { ok: false, reason: 'revoked', name: who }; }
    if (fpOf(token) !== clean(seat.fp, 80)) { noteFault('bad-token'); return { ok: false, reason: 'bad-token', name: who }; }
    const cur = ssOf();
    const rows = logOf();
    const snapshot = { rev: (cur && cur.rev) || 0, head: (cur && cur.seq) || 0,
      oldest: rows.length ? rows[0].seq : ((cur && cur.seq) || 0) + 1,
      seats: seatsOf().map(function (s) { return { name: s.name, role: s.role, active: !!s.active, host: !!s.host }; }),
      rows: rows.map(function (r) { return { seq: r.seq, by: r.by, text: r.text, at: r.at, kind: r.kind }; }) };
    stat.resyncs++; stat.lastReason = 'resynced';
    return { ok: true, name: who, snapshot: snapshot, watermark: snapshot.head };
  }
  /** ⑥ 视点：按权限过滤（主持人全量，其他人只看自己那一条线）。 */
  function view(name, token) {
    const rows = logOf();
    if (!name) {
      // 无参：作者面总览（不含消息正文之外的任何东西，也不含凭证指纹）。
      return { ok: true, host: (ssOf() || {}).host || '', seq: (ssOf() || {}).seq || 0,
        seats: seatsOf().map(function (s) { return { name: s.name, role: s.role, active: !!s.active, host: !!s.host, perms: (s.perms || []).slice() }; }),
        log: rows.length };
    }
    const who = clean(name, 40);
    const seat = findSeat(who);
    if (!seat) return { ok: false, reason: 'unknown-seat', name: who };
    if (fpOf(token) !== clean(seat.fp, 80)) return { ok: false, reason: 'bad-token', name: who };
    if (!seat.active) return { ok: false, reason: 'revoked', name: who };
    const perms = seat.perms || [];
    // 主持人（有 decide 权）看全量；其余只看自己发的与发给自己的。
    const all = perms.indexOf('decide') >= 0;
    const mine = rows.filter(function (r) { return r && clean(r.by, 40) === who; });
    return { ok: true, name: who, role: seat.role, perms: perms.slice(), host: !!seat.host,
      scope: all ? 'all' : 'own', seq: (ssOf() || {}).seq || 0,
      rows: (all ? rows : mine).map(function (r) { return { seq: r.seq, by: r.by, text: r.text, at: r.at, kind: r.kind }; }) };
  }
  /** 卸座：不删已发消息（历史不可篡改）。 */
  function leave(name, token) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(name, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const seat = findSeat(who);
    if (!seat) { noteFault('unknown-seat'); return { ok: false, reason: 'unknown-seat', name: who }; }
    if (fpOf(token) !== clean(seat.fp, 80)) { noteFault('bad-token'); return { ok: false, reason: 'bad-token', name: who }; }
    let out = null;
    WA.store.transact(function (draft) {
      const s = findSeat(who, draft);
      if (!s) { out = { ok: false, reason: 'unknown-seat', name: who }; return false; }
      s.active = false;
      const ss = openSession(draft, settings());
      ss.rev += 1;
      out = { ok: true, name: who, kept: (ss.log || []).length, rev: ss.rev };
    }, 'session:leave');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /* ── X6（v2.128.0）身份与授权边界：这张票是谁的、授权到哪 ──────────────
   *   R105 ⑧ 的病：本模块有座、有票、有顺序号，却答不出「这个人**是谁**、**授权到哪**」——
   *   调用方每次都得自己拿名字+票来问（`auth`），而「刚才那一步是谁做的」在闸门那边
   *   只能读到 `permissions.currentUser()`（一个全局字符串），改不了、也留不下痕。
   *   本版补两口：`identify()` 把票换成**会话身份**（并通过 `permissions.adopt` 落到闸门上，
   *   此后写路径按位分权）；`identity()` 只读回报「此刻谁在场、授权到哪、门开着没有」。
   */
  /**
   * 凭票认人，并把结论**落到写路径闸门上**。
   *   三态各归各位（不许「验不过就当真」）：
   *     · 验不过 ⇒ 归 `anonymous`：恒注册、**一位不带**，并解除闸门当前使用者；
   *     · 验得过且该名字已登记权限表（`permissions.has` 认得它）⇒ 直接采用，闸门按位拦；
   *     · 验得过但权限表里没有这个人 ⇒ 如实报 `adopted:false`，并在**当前集合里**注册，
   *       不带任何权限位 —— 绝不往权限表里塞一个名字（那是权限模块自己的登记面）。
   *   边界：本口**不写世界**（不改席位、不落盘），只动会话身份与闸门。
   */
  function identify(token) {
    const t = clean(token, 120);
    if (!t) { noteFault('missing-token'); return { ok: false, reason: 'missing-token' }; }
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const fp = fpOf(t);
    const seat = seatByToken(fp);
    const Pm = WA.permissions;
    if (!seat) {
      // 验不过：落到匿名，且**收回**闸门上的当前使用者 —— 否则失败之后闸门还替上一次的人把门。
      stat.unidentified++;
      stat.lastReason = 'unidentified';
      const anon = { ok: true, known: false, identity: 'anonymous', perms: [], adopted: false, gated: false,
        note: '票对不上任何座位 ⇒ 归 anonymous（不带任何权限位）。' };
      if (Pm && typeof Pm.adopt === 'function') {
        const a = WA.permissions.adopt('anonymous', []);
        anon.adopted = !!(a && a.adopted);
        anon.gated = !!(a && a.gated);
      }
      return anon;
    }
    if (!seat.active) {
      stat.unidentified++;
      noteFault('revoked');
      const rv = { ok: true, known: false, identity: 'anonymous', name: clean(seat.name, 40),
        perms: [], adopted: false, gated: false, reason: 'revoked',
        note: '此座已卸 ⇒ 票不再作数，归 anonymous。' };
      if (Pm && typeof Pm.adopt === 'function') {
        const a = WA.permissions.adopt('anonymous', []);
        rv.adopted = !!(a && a.adopted);
        rv.gated = !!(a && a.gated);
      }
      return rv;
    }
    const who = clean(seat.name, 40);
    const perms = (seat.perms || []).slice();
    let known = false;
    if (Pm && typeof Pm.has === 'function') {
      try { known = Pm.has(who, 'read').allowed === true; } catch (e) { known = false; }
    }
    let adopted = false, gated = false;
    if (Pm && typeof Pm.adopt === 'function') {
      const a = WA.permissions.adopt(who, perms);
      adopted = !!(a && a.adopted);
      gated = !!(a && a.gated);
    }
    stat.identified++; stat.adopted += adopted ? 1 : 0;
    stat.lastReason = 'identified';
    return { ok: true, known: true, name: who, role: clean(seat.role, 40), identity: who,
      host: !!seat.host, perms: perms, knownToPerms: known, adopted: adopted, gated: gated,
      note: known ? '已在权限表中：闸门按位拦。'
        : '不在权限表中：**不在本口登记**（那是权限模块的登记面）；已按当前集合注册，位为空 ⇒ 同样过不去写闸门。' };
  }
  /** 此刻谁在场、授权到哪、写闸门开着没有（**纯只读**：认人走 identify，它动闸门）。 */
  function identity() {
    const cur = ssOf() || {};
    const seats = seatsOf().filter(function (s) { return s && s.active; })
      .map(function (s) { return { name: clean(s.name, 40), role: clean(s.role, 40), perms: (s.perms || []).slice(), host: !!s.host }; });
    const gate = (WA.permissions && typeof WA.permissions.gateStat === 'function')
      ? (function () { try { return WA.permissions.gateStat(); } catch (e) { return null; } })() : null;
    return { ok: true, enabled: settings().enabled, host: cur.host || '', seats: seats,
      anonymous: seats.length === 0,
      gate: gate ? { active: gate.active, user: gate.user, gates: gate.gates, denied: gate.denied, off: gate.off } : null,
      note: '身份只在**凭票认人**（identify）时确定；本口只报现状，不认人、不改授权。' };
  }
  function statView() {
    const cur = ssOf() || {};
    return { enabled: settings().enabled, host: cur.host || '', seats: seatsOf().length,
      active: seatsOf().filter(function (s) { return s && s.active; }).length,
      seq: cur.seq || 0, log: logOf().length, rev: cur.rev || 0,
      // X6（v2.128.0）：身份面三读。此前只有「验票通过几次」（authed），
      //   而「几次认不出」与「认出的人里几次真进了权限表」在读数上无处可寻 ——
      //    那正是「身份冒充无痕迹」这条红线的可观测形态。
      identified: stat.identified, adopted: stat.adopted, unidentified: stat.unidentified };
  }
  /** 注入块：只报「有谁在场、到第几楼」，不含凭证与视点外内容。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const cur = ssOf();
    if (!cur || !cur.host) return '';
    const act = seatsOf().filter(function (s) { return s && s.active; })
      .map(function (s) { return s.name + '（' + s.role + '）'; });
    return '[多人场]' + String.fromCharCode(10) + '主持：' + cur.host + '；在场：' + (act.join('、') || '无')
      + '；已进行到第 ' + (cur.seq || 0) + ' 条。'
      + String.fromCharCode(10) + '每条发言都出自持票的人；没有对应权限的角色不得代替裁决。';
  }
  WA.session = {
    SEAT_PERMS: SEAT_PERMS.slice(), HOST_PERMS: HOST_PERMS.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    host: host, join: join, auth: auth, post: post, since: since, resync: resync, view: view, leave: leave,
    // X6（v2.128.0）：身份与授权边界。`identify` 凭票认人并落到写闸门（调 permissions.adopt）；
    //   `identity` 只读回报在场与授权现状。两者各有真读者（诊断 secSession 与面板两枚控件）。
    identify: identify, identity: identity,
    statView: statView, buildBlock: buildBlock,
    fingerprint: function (t) { return fpOf(t); },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/session.js', { kind: 'engine', ver: '2.119.0' });
})();
