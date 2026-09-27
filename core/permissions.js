/**
 * WorldAxis core/permissions.js (v2.110.0) — 权限系统与角色管理（计划二 #39 / #70 同一机制两处消费）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   本仓有「谁能改什么」的全部**前提**（`store.save` 的写入口、`core/undo.js` 的操作栈、
 *   `engines/bridge.js` 的对外投影面），却**没有任何一处问过权限**：
 *   · `#39` 多人协作：GM 与玩家对同一份世界有不同程度的写权，此前只能靠「谁打开面板」区分；
 *   · `#70` 多租户：细粒度权限位（读/写/删/管理）在 API 边界上完全缺失。
 *   两处病灶同源，故本模块**只做一处机制**：角色 → 权限位 → 判定。
 *
 * ── 三条设计边界（都是否定式）──────────────────────────────────────────
 *   ① **审计模式，不改变产品行为**：`check()` 只回答「允不允许」，**不阻断**任何既有调用。
 *      本仓的写路径全部是产品内部路径（不是多用户 API），在这里硬拦会把卡面自己写死。
 *      真正的阻断留给未来的 server/api 层 —— 那时它调用同一个 `check()`。
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
    if (!rec) { out.reason = 'unknown-user'; _stat.unknownUser++; _stat.denied++; return out; }
    if (WA.auditLog && typeof WA.auditLog.record === 'function') {
      try { WA.auditLog.record('permissions.deny', { user: u, action: a, reason: 'unknown-user' }, { result: 'denied', surface: 'core/permissions.js' }); } catch (e) {}
    }
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
      users: Object.keys(USERS).length, roles: Object.keys(ROLES).sort(), actions: ACTIONS.slice() };
  }
  function reset() { Object.keys(USERS).forEach(function (k) { delete USERS[k]; }); Object.keys(_stat).forEach(function (k) { _stat[k] = 0; }); }

  WA.permissions = {
    defineRole: defineRole, grant: grant, revoke: revoke, grantDirect: grantDirect,
    effective: effective, has: has, can: can, check: check, matrix: matrix,
    stat: stat, reset: reset, ROLE_LABELS: ROLE_LABELS, ACTIONS: ACTIONS.slice()
  };
})();