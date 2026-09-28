/**
 * WorldAxis core/permissions.js (v2.112.0) — 权限系统与角色管理（计划二 #39 / #70 同一机制两处消费）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   本仓有「谁能改什么」的全部**前提**（`store.save` 的写入口、`core/undo.js` 的操作栈、
 *   `engines/bridge.js` 的对外投影面），却**没有任何一处问过权限**：
 *   · `#39` 多人协作：GM 与玩家对同一份世界有不同程度的写权，此前只能靠「谁打开面板」区分；
 *   · `#70` 多租户：细粒度权限位（读/写/删/管理）在 API 边界上完全缺失。
 *   两处病灶同源，故本模块**只做一处机制**：角色 → 权限位 → 判定。
 *
 * ── 三条设计边界（都是否定式）──────────────────────────────────────────
 *   ① **判定与阻断是两件事**：`has()` / `check()` 只回答「允不允许」，**不阻断**任何调用 ——
 *      这条永远成立。v2.112.0 起新增**显式闸门** `gate()`（消费方是 `core/store.js` 的 `save()`）：
 *      只有在调用方**显式**登记了当前使用者（`session(name)`）且该使用者自己没有 `write` 位时，
 *      写才被拦下。**没有登记当前使用者时一律放行** —— 本仓的主场景就是单机，
 *      「有权限表 ⇒ 拦一切写」会让面板保存被自己的权限表挡回去。
 *      取舍理由：v2.110.0 把阻断「留给未来的 server/api 层」，而 server 层已判不做（仓库红线），
 *      于是这条边界此前是**悬空的**：判定接了真调用方（audit-log 读它取当前用户），
 *      却没有任何一处拿它挡下一次写。v2.112.0 把它落到唯一的写入口上，同时保留单机默认放行。
 *   ② **未声明 ≠ 允许**：`has()` 对**未注册**用户返回 `allowed:false` + `reason:'unknown-user'`。
 *      「谁都没说不行」与「说了行」是两件事（本仓 `default answer` 的纪律）。
 *   ③ **通配只认一种写法**：`'*'` 是唯一的全域权限位；`'actor.*'` 这类前缀通配**支持**，
 *      但 `'*.*'` 一类的多重通配**不支持**（不做正则、不猜）。判定只用 `startsWith(前缀 + '.')`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 权限位（#70 的四个基础位 + #39 协作位的全集）。 */
  const ACTIONS = ['READ_ACTOR', 'WRITE_ACTOR', 'DELETE_ACTOR', 'ADMIN',
    'read', 'write', 'delete', 'admin', 'publish', 'review'];
  /** 内置角色（可被 defineRole 覆盖；标签只用于人读）。 */
  const ROLE_LABELS = { owner: '所有者', gm: '游戏主持', editor: '编辑', viewer: '只读', guest: '访客' };
  const BUILTIN = {
    owner: ['ADMIN', 'read', 'write', 'delete', 'admin', 'publish', 'review', 'READ_ACTOR', 'WRITE_ACTOR', 'DELETE_ACTOR'],
    gm: ['read', 'write', 'delete', 'publish', 'review', 'READ_ACTOR', 'WRITE_ACTOR', 'DELETE_ACTOR'],
    editor: ['read', 'write', 'READ_ACTOR', 'WRITE_ACTOR'],
    viewer: ['read', 'READ_ACTOR'],
    guest: []
  };
  const ROLES = {};
  Object.keys(BUILTIN).forEach(function (k) { ROLES[k] = BUILTIN[k].slice(); });

  const USERS = {};                 // user -> {roles:Set<string>, direct:Set<string>, at}
  const _stat = { checks: 0, allowed: 0, denied: 0, unknownUser: 0, grants: 0, revokes: 0 };

  function txt(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max) : String(v == null ? '' : v).slice(0, max || 0); }
    catch (e) { return ''; }
  }
  /** 墙钟守卫（与仓库其余 130 处同形：先试产品时钟、异常回落 Date.now ——
   *  形态刻意与 core/store.js 的 clockWall 逐字同构：tests/run.js 的 v2.20.0 段用一对
   *  「声明数 == 兜底数」的判据抄这一族，**函数名与写法都在判据的观察面上**）。 */
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  function defineRole(name, perms) {
    const n = txt(name, 40).toLowerCase();
    if (!n) return { ok: false, reason: 'missing-role' };
    const arr = Array.isArray(perms) ? perms.map(function (p) { return txt(p, 40); }).filter(Boolean) : [];
    ROLES[n] = arr;
    return { ok: true, role: n, perms: arr.slice() };
  }

  function ensureUser(u) {
    const k = txt(u, 60);
    if (!k) return null;
    if (!USERS[k]) USERS[k] = { roles: [], direct: [], at: clockWall() };
    return USERS[k];
  }

  /** 授予角色（幂等）。未知角色**不静默接受**：如实报 unknown-role，除非 `{allowUnknown:true}`。 */
  function grant(user, role, opts) {
    const rec = ensureUser(user);
    const r = txt(role, 40).toLowerCase();
    if (!rec) return { ok: false, reason: 'missing-user' };
    if (!Object.prototype.hasOwnProperty.call(ROLES, r) && !(opts && opts.allowUnknown)) {
      return { ok: false, reason: 'unknown-role', role: r, known: Object.keys(ROLES).sort() };
    }
    if (rec.roles.indexOf(r) < 0) { rec.roles.push(r); _stat.grants++; }
    return { ok: true, user: txt(user, 60), role: r, roles: rec.roles.slice() };
  }
  /** 撤销角色。撤销**不存在的角色**返回 `removed:false`（不是失败，也不假称成功）。 */
  function revoke(user, role) {
    const k = txt(user, 60);
    const r = txt(role, 40).toLowerCase();
    const rec = USERS[k];
    if (!rec) return { ok: false, reason: 'unknown-user', removed: false };
    const i = rec.roles.indexOf(r);
    if (i < 0) return { ok: true, removed: false, roles: rec.roles.slice() };
    rec.roles.splice(i, 1); _stat.revokes++;
    return { ok: true, removed: true, roles: rec.roles.slice() };
  }
  /** 直授权限位（绕过角色；用于「这个人额外能发布」这类例外）。 */
  function grantDirect(user, perm) {
    const rec = ensureUser(user);
    const p = txt(perm, 40);
    if (!rec) return { ok: false, reason: 'missing-user' };
    if (!p) return { ok: false, reason: 'missing-perm' };
    if (rec.direct.indexOf(p) < 0) rec.direct.push(p);
    return { ok: true, user: txt(user, 60), perm: p };
  }

  /** 该用户当前**有效权限位**（角色并集 + 直授），去重升序。 */
  function effective(user) {
    const rec = USERS[txt(user, 60)];
    if (!rec) return null;
    const set = [];
    rec.roles.forEach(function (r) {
      (ROLES[r] || []).forEach(function (p) { if (set.indexOf(p) < 0) set.push(p); });
    });
    rec.direct.forEach(function (p) { if (set.indexOf(p) < 0) set.push(p); });
    return set.sort();
  }

  /**
   * 权限判定。
   *   返回 `{ok, allowed, user, action, via, reason}` —— `via ∈ role / direct / '*' / ''`。
   *   未注册用户 ⇒ `allowed:false, reason:'unknown-user'`（边界②）。
   *   前缀通配：持有 `actor.*` 即持有 `actor.name`；持有 `*` 即持有全部。
   */
  function has(user, action) {
    _stat.checks++;
    const u = txt(user, 60), a = txt(action, 40);
    const out = { ok: false, allowed: false, user: u, action: a, via: '', reason: '' };
    if (!u || !a) { out.reason = 'missing-args'; _stat.denied++; return out; }
    const rec = USERS[u];
    // v2.112.0：**未注册用户也是「被拒」的一种**，同样要留痕 —— 原先这条审计写在了早退**之后**
    //   （`return out` 不可达；v2.78.0 第十二面的规矩：永不执行的码要么造见证、要么进死表）。
    //   它不该进死表：`unknown-user` 是本模块最要命的一种拒绝，而「没有这条记录」与「当时被拒了」
    //   在排查时读起来一模一样。故把留痕块提到早退**之前**执行。
    //   下一行**保持原样逐字不动**：tests/permissions-v2110.js 的负控制 N1 锚点指着它
    //   （「锚点恰中 1 次」是那条判据的前置）。
    if (!rec && WA.auditLog && typeof WA.auditLog.record === 'function') {
      try { WA.auditLog.record('permissions.deny', { user: u, action: a, reason: 'unknown-user' }, { result: 'denied', surface: 'core/permissions.js' }); } catch (e) {}
    }
    if (!rec) { out.reason = 'unknown-user'; _stat.unknownUser++; _stat.denied++; return out; }
    const eff = effective(u) || [];
    if (eff.indexOf('*') >= 0) { out.ok = true; out.allowed = true; out.via = '*'; _stat.allowed++; return out; }
    if (eff.indexOf(a) >= 0) {
      // 归属：直授优先于角色（直授是更明确的意图）
      out.ok = true; out.allowed = true; _stat.allowed++;
      out.via = rec.direct.indexOf(a) >= 0 ? 'direct' : 'role';
      return out;
    }
    for (let i = 0; i < eff.length; i++) {
      const p = eff[i];
      if (p.length > 2 && p.indexOf('.*') === p.length - 2 && a.indexOf(p.slice(0, -1)) === 0) {
        out.ok = true; out.allowed = true; out.via = rec.direct.indexOf(p) >= 0 ? 'direct' : 'role';
        _stat.allowed++;
        return out;
      }
    }
    out.reason = 'permission-denied';
    // v2.111.0（计划二 #67）：**被拒**也要留痕。
    //   只记「允许」的审计表在排查时会误导——“没有这条记录”与“当时被拒了”读起来一模一样。
    if (WA.auditLog && typeof WA.auditLog.record === 'function') {
      try { WA.auditLog.record('permissions.deny', { user: u, action: a, reason: 'permission-denied' }, { result: 'denied', surface: 'core/permissions.js' }); } catch (e) {}
    }
    out.required = a;
    _stat.denied++;
    return out;
  }
  /** 别名：语义化调用点用 `can(user, 'publish')`。 */
  function can(user, action) { return has(user, action); }
  /**
   * 便捷检查（供未来 API 层用）：允许时返回 null，不允许时返回**拒收体**
   * `{ok:false, reason:'permission-denied', required:'editor'}`（#39 验收的形态）。
   */
  function check(user, action, needRole) {
    const r = has(user, action);
    if (r.allowed) return null;
    const body = { ok: false, reason: r.reason === 'unknown-user' ? 'unknown-user' : 'permission-denied',
      user: r.user, required: needRole || r.required || action };
    if (r.reason === 'unknown-user') body.note = '未注册用户一律拒绝（「谁都没说不行」不等于「说了行」）';
    return body;
  }

  /* ── v2.112.0：闸门开关与当前使用者（收 v2.110.0 边界①的「不阻断」尾巴）──────
   *
   * 为什么需要一开关，而不是「有用户就自动拦」：
   *   本仓的写路径**全部是产品内部路径**（45 处 store.save 调用点：面板保存、事务提交、
   *   批退出落盘……），没有任何一处带着「谁按的按钮」这个信息。若「登记了某个用户 ⇒ 立刻
   *   拦所有写」，那么单机使用者在面板里点一下保存就会被自己的权限表挡回去 —— 那是灾难。
   *   故这里的语义是**显式启用**：`WA.permissions.session(name)` 是一次明确的
   *   「从现在起，这个人是当前使用者」，此后写路径才要求 `write` 位。
   *
   * 与边界②（未声明 ≠ 允许）不矛盾，两条管的不是同一个问题：
   *   · 边界②是对**判定函数**说的：`has(未注册用户)` 必须答 `allowed:false`。这条永远成立，
   *     不受本开关影响（`has()` 一个字节都没改）。
   *   · 本开关是对**写路径**说的：`WA.permissions` 是否具备「拦下产品内部写」的资格。
   *     判据不同是本仓屡次踩过的坑（把「谁都没说不行」与「闸门没启用」读成同一件事）。
   */
  let _session = null;
  let _gates = 0, _gatesAllowed = 0;
  // v2.113.0（计划一 A1）：「保护**没启用**」也要单独可数。此前「没人登记当前使用者」
  //   与「查过了、允许」都返回 `null`，读数上也分不出来 ⇒ 闸门形同虚设时看起来一切正常
  //   （本仓反复点名的「没查 ≠ 通过」）。行为一个字不改（单机默认放行是刻意的），
  //   改的是可分辨性：这一格单独计数，`gateStat().off` 读它。
  let _gatesOff = 0;
  /** 登记当前使用者（传空字符串 = 退出会话，闸门随之关闭）。 */
  function session(user) {
    const u = txt(user, 60);
    _session = u || null;
    return { ok: true, user: _session };
  }
  function currentUser() { return _session; }
  /**
   * 写路径闸门（**唯一实现**；`core/store.js` 的 `save()` 是唯一消费方）。
   *   返回 `null` = 放行；返回拒收体 = 拦下（形态与 `check()` 一致）。
   *   **默认放行**的三种情形，逐条都是刻意的：
   *     ① 无当前使用者（单机场景，本仓的主场景）；
   *     ② 调用方 `{auditOnly:true}`（诊断/测试需要无条件写）；
   *     ③ 当前使用者自己没登记过 `write` 位 —— 这是**唯一**会拦的情形。
   *   为什么不返回 `{allowed:true}`：本仓的放行形态一律是「无异议时不留噪声」（`check` 同款）。
   */
  function gate(action, opts) {
    _gates++;
    if (opts && opts.auditOnly) { _gatesAllowed++; return null; }
    if (!_session) { _gatesOff++; _gatesAllowed++; return null; }
    const r = has(_session, action);
    if (r.allowed) { _gatesAllowed++; return null; }
    return { ok: false, reason: r.reason === 'unknown-user' ? 'unknown-user' : 'permission-denied',
      user: _session, required: 'write', action: txt(action, 40) || 'write' };
  }
  // v2.113.0（A1）：`off` = 因「没人登记当前使用者」而放行的次数——与 `allowed` 分开读，
  //   否则「保护没开」与「保护开着且放行」在面板上是同一个数字。
  function gateStat() { return { active: !!_session, user: _session, gates: _gates, allowed: _gatesAllowed, denied: _gates - _gatesAllowed, off: _gatesOff }; }

  /** 权限矩阵（用户 × 判定面）——诊断/UI 用；纯只读。 */
  function matrix(actions) {
    const acts = (Array.isArray(actions) && actions.length ? actions : ACTIONS).map(function (a) { return txt(a, 40); }).filter(Boolean);
    const users = Object.keys(USERS).sort();
    return { actions: acts, users: users.map(function (u) {
      return { user: u, roles: USERS[u].roles.slice(), direct: USERS[u].direct.slice(),
        allow: acts.filter(function (a) { return has(u, a).allowed; }) };
    }) };
  }
  function stat() {
    return { checks: _stat.checks, allowed: _stat.allowed, denied: _stat.denied,
      unknownUser: _stat.unknownUser, grants: _stat.grants, revokes: _stat.revokes,
      // v2.112.0：闸门读数（写路径真被拦了几次、放行了几次——「拦了」与「没查」必须可分）
      gates: _gates, gatesAllowed: _gatesAllowed, gatesDenied: _gates - _gatesAllowed,
      session: _session,
      users: Object.keys(USERS).length, roles: Object.keys(ROLES).sort(), actions: ACTIONS.slice() };
  }
  function reset() {
    Object.keys(USERS).forEach(function (k) { delete USERS[k]; });
    Object.keys(_stat).forEach(function (k) { _stat[k] = 0; });
    // v2.112.0：会话也是**状态面**（与用户表同族），reset 必须一并清 ——
    //   留着会话会让「reset 之后谁在写」变成上一节的残留，而本仓的模块态在 run.js 里是跨 section 共享的。
    _session = null; _gates = 0; _gatesAllowed = 0; _gatesOff = 0;
  }

  WA.permissions = {
    defineRole: defineRole, grant: grant, revoke: revoke, grantDirect: grantDirect,
    effective: effective, has: has, can: can, check: check, matrix: matrix,
    stat: stat, reset: reset, ROLE_LABELS: ROLE_LABELS, ACTIONS: ACTIONS.slice(),
    // v2.112.0（收 v2.110.0 边界①的尾巴）：显式闸门 + 当前使用者。写路径的唯一消费方是 core/store.js。
    session: session, currentUser: currentUser, gate: gate, gateStat: gateStat
  };
})();