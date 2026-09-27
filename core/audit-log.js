/**
 * WorldAxis core/audit-log.js (v2.111.0) — 写操作审计日志（计划二 #67）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────
 *   世界被谁改过、改成了什么，在本仓**没有任何一处留痕**。`store` 有 `errors` 计数、
 *   `undo` 有操作栈（但那是**撤销语义**、且只覆盖参数编辑）、`settingsBus` 有写入计数——
 *   三者都回答不了「上一次存档被写是几点、谁触发的、写了什么形状」。
 *   代价不是「查不到历史」，而是**事后无法把一次异常状态归因到一次写**：
 *   实测现场就是「世界看起来不对了，但没人知道是哪一步写的」。
 *
 * ── 三条设计边界（都是否定式）────────────────────────────
 *   ① **只能追加**：本模块**不提供** remove / clear / delete / splice —— 不是「提供了但少用」，
 *      而是「函数不存在」。判据因此是**否定式**的：这五个名字在 `WA.auditLog` 上必须 `undefined`。
 *      唯一的清空入口是 `reset()`，它的定位与其余模块的 `reset()` 一致：**测试夹具**，
 *      且必须显式调用、且会留下一条 `reset` 事件（清空这件事自己也要留痕）。
 *   ② **审计不得改产品行为**：`record()` **从不抛**、`record()` 的失败不影响调用方；
 *      「记日志失败」不能变成「写世界失败」。与 v2.110.0 的 `permissions` 同一条纪律。
 *   ③ **不许替调用方编事实**：`ip` 恒为 `null` ——本扩展是宿主内的脚本，**没有网络身份**，
 *      「编一个 127.0.0.1」与「伪造一个 user」是同一种病。取不到就如实给 null，
 *      不压成 ''、不给 'unknown'（本仓 v2.98.0 / v2.110.0 反复钉过这条）。
 *
 * ── 与既有模块的分工 ──────────────────────────────────────
 *   · `permissions` 回答「**允许吗**」（判定面）；本模块回答「**发生了什么**」（事实面）。
 *     两者唯一的接触点是 `record()` 的 `user` 解析：能解析就写用户名，解析不到写 `null`。
 *   · `undo` 是**可逆**的操作栈（面向用户编辑）；本模块是**只增不减**的事实环（面向排查）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 事实环容量（内存，最多 256 条；最近的在末尾）。 */
  const CAP = 256;
  /** 单条 params 序列化上限（字符）——超长截断并**标记**，不静默截。 */
  const PARAM_CAP = 512;
  /** 固定字段（顺序即输出顺序；增加字段必须同步改这里与 BASES）。 */
  const FIELDS = ['seq', 'at', 'user', 'action', 'surface', 'params', 'paramsTruncated', 'result', 'ip'];
  /** **不存在**的成员（判据的否定面；写成数据是为了让门禁能「读」而不是「写死字符串」）。 */
  const FORBIDDEN = ['remove', 'clear', 'delete', 'splice', 'drop', 'purge'];

  let _seq = 0;
  const _ring = [];
  const _stat = { records: 0, truncated: 0, dropped: 0, badAction: 0, unknowns: 0, resets: 0, lastAt: null };

  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const txt = function (s, max) { return (typeof s === 'string' && s.length) ? s.slice(0, max) : null; };

  /** 当前用户（**捕一切异常**；解析不到如实给 null）。 */
  function currentUser() {
    try {
      const p = WA.permissions;
      if (!p) return null;
      // 优先问「谁是当前使用者」；本仓没有会话概念 ⇒ 只有调用方显式登记过的用户名可用。
      if (typeof p.currentUser === 'function') {
        const u = p.currentUser();
        if (typeof u === 'string' && u.length) return u.slice(0, 40);
      }
      return null;
    } catch (e) { return null; }
  }

  /**
   * 追加一条事实。**从不抛**。
   * @param {string} action 动作名（`'store.save'` / `'settings.set'` …）
   * @param {object} [params] 参数摘要（只存形状与标量；深对象序列化后截断）
   * @param {object} [opts] `{ result, surface, user }`
   * @returns {{ok:boolean, seq?:number, reason?:string}}
   */
  function record(action, params, opts) {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      const a = txt(action, 80);
      if (!a) {
        _stat.badAction++;
        return { ok: false, reason: 'bad-action' };
      }
      let ser = null, trunc = false;
      try {
        ser = (params === undefined || params === null) ? null : safeSerial(params);
        if (ser !== null && ser.length > PARAM_CAP) { ser = ser.slice(0, PARAM_CAP); trunc = true; _stat.truncated++; }
      } catch (e) { ser = null; }
      const row = {
        seq: ++_seq,
        at: clockWall(),
        user: (typeof o.user === 'string' && o.user.length) ? o.user.slice(0, 40) : currentUser(),
        action: a,
        surface: txt(o.surface, 40),
        params: ser,
        paramsTruncated: trunc,
        result: txt(o.result, 40),
        ip: null                       // 本扩展没有网络身份：如实 null（见文件头边界 ③）
      };
      if (row.user === null) _stat.unknowns++;
      _ring.push(row);
      if (_ring.length > CAP) { _ring.shift(); _stat.dropped++; }
      _stat.records++;
      _stat.lastAt = row.at;
      return { ok: true, seq: row.seq };
    } catch (e) {
      return { ok: false, reason: 'record-failed' };
    }
  }

  /** 循环安全的浅序列化（只走一层对象/数组；函数与 symbol 落成 null）。 */
  function safeSerial(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) {
      return JSON.stringify(v.slice(0, 32).map(function (x) { return (x === null || typeof x !== 'object') ? (typeof x === 'function' ? null : x) : '[obj]'; }));
    }
    if (typeof v === 'object') {
      const out = {};
      Object.keys(v).sort().slice(0, 32).forEach(function (k) {
        const x = v[k];
        out[k] = (x === null || typeof x !== 'object') ? (typeof x === 'function' ? null : x) : '[obj]';
      });
      return JSON.stringify(out);
    }
    return null;
  }

  /** 最近 n 条（默认全部；越界自动夹取）。返回**副本**，外部改不动环。 */
  function recent(n) {
    const k = (typeof n === 'number' && isFinite(n)) ? Math.max(0, Math.min(CAP, Math.floor(n))) : _ring.length;
    return _ring.slice(_ring.length - k).map(function (r) {
      const o = {};
      FIELDS.forEach(function (f) { o[f] = r[f]; });
      return o;
    });
  }

  /** 按动作名筛（**只读**；不改变环）。 */
  function byAction(action) {
    const a = txt(action, 80);
    if (!a) return [];
    return recent().filter(function (r) { return r.action === a; });
  }

  function count() { return _ring.length; }

  function stat() {
    return { records: _stat.records, inRing: _ring.length, cap: CAP,
      truncated: _stat.truncated, dropped: _stat.dropped, badAction: _stat.badAction,
      unknowns: _stat.unknowns, resets: _stat.resets, lastAt: _stat.lastAt,
      fields: FIELDS.slice(), forbidden: FORBIDDEN.slice() };
  }

  /** 唯一清空入口（测试夹具）；**清空自己也要留一条痕**（在清空之前写）。 */
  function reset() {
    _stat.resets++;
    _ring.length = 0;
    _seq = 0;
    _stat.lastAt = null;
    return { ok: true };
  }

  WA.auditLog = {
    record: record, recent: recent, byAction: byAction, count: count,
    stat: stat, reset: reset, CAP: CAP, PARAM_CAP: PARAM_CAP,
    FIELDS: FIELDS.slice(), FORBIDDEN: FORBIDDEN.slice()
  };
})();
