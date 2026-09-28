/**
 * WorldAxis core/audit-log.js (v2.112.0) — 写操作审计日志（计划二 #67）
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

  // ══════════════════════════════════════════════════════════════════════════
  // v2.112.0（计划二 #67 收尾）：**落盘**——v2.111.0 的事实环只驻内存，跨会话不可查。
  //
  // 为什么是「缓存 + 显式落盘」而不是「每条都写盘」：
  //   ① `record()` 的契约是**从不抛、不改产品行为**（文件头边界②）。给它接一次 localStorage
  //      写入，就等于把「记日志失败」的风险接进了每一条产品路径 —— 那是本模块存在的意义反面。
  //   ② 写世界（store.save）本身是低频动作，而 record 在拒绝路径上会被调用得很密。
  //      把 I/O 交给一个**显式**落盘点（写世界之后），成本与风险都落在可解释的位置上。
  // 载体选择（为什么进 localStorage 而不是进 store 存档）：
  //   存档是**用户数据**（导出/备份/冲突保全的对象），审计是**运行痕迹**。把痕迹写进存档会让
  //   每一次存档都变大、让冲突保全多一份噪声，且审计本身会成为「用户可编辑的东西」——
  //   那正是「事实不可被事后改写」（B14）要防的。故单列一个存储键。
  const PERSIST_KEY = 'worldaxis_auditlog_v1';
  /** 落盘上限：只保留最近这些条（与内存环同量级；审计是排查面，不是归档面）。 */
  const PERSIST_CAP = 256;
  /** 落盘格式版本（读回时用；不识别的版本按「无历史」处理并如实标注）。 */
  const PERSIST_FORMAT = 1;

  let _seq = 0;
  const _ring = [];
  /** 已落盘的最高序号（断点）。读回历史时从这里续，不会重复写。 */
  let _persistedSeq = 0;
  /**
   * v2.112.0：序号谱系已断裂（下一次 flush 必须另起一条落盘线）。
   *   **唯一**置位点是 `reset()` —— 内存序号空间的唯一重启来源。刻意**不**用「环里序号比断点小」
   *   这类推断：新谱系的最大序号完全可能正好等于旧断点（实测：断点 2、reset 后写两条 ⇒ 推断法
   *   认不出重启，新行被判成「已落盘」而静默丢失）。能直接知道的事，不靠猜。
   */
  let _lineageBreak = false;
  const _stat = { records: 0, truncated: 0, dropped: 0, badAction: 0, unknowns: 0, resets: 0, lastAt: null,
    flushes: 0, persisted: 0, flushFailed: 0, lastFlushAt: null, restored: 0, restoreFailed: 0, lost: 0, lineageResets: 0 };

  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const txt = function (s, max) { return (typeof s === 'string' && s.length) ? s.slice(0, max) : null; };

  /** 当前用户（**捕一切异常**；解析不到如实给 null）。 */
  function currentUser() {
    try {
      if (!WA.permissions) return null;
      // 优先问「谁是当前使用者」；本仓没有会话概念 ⇒ 只有调用方显式登记过的用户名可用。
      //
      // v2.112.0 收口：调用点**逐字写全**（此前是 `const p = WA.permissions` 再 `p.currentUser()`）。
      //   引用面判据（tests/inventory.js 的 REF_RE）只认 `WA.<ns>.<mem>` 这一种写法，
      //   于是「**真被调用**的导出」在死子面账本里被记成 refs=0 / self-only ——
      //   门禁的否定面比事实宽（判据的输入面必须与结论面同宽，本仓 R67 规矩）。
      //   同款纪律在本仓已有先例：ui/panel.js 调用 sanitize 时逐字写全并注明理由。
      if (typeof WA.permissions.currentUser === 'function') {
        const u = WA.permissions.currentUser();
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
      // v2.112.0：落盘面计数。**写进去的计数必须能被读出来**——否则它们是只写不读的活性缺口。
      flushes: _stat.flushes, persisted: _stat.persisted, flushFailed: _stat.flushFailed,
      lastFlushAt: _stat.lastFlushAt, restored: _stat.restored, restoreFailed: _stat.restoreFailed,
      lost: _stat.lost, lineageResets: _stat.lineageResets, persistedSeq: _persistedSeq,
      fields: FIELDS.slice(), forbidden: FORBIDDEN.slice() };
  }

  /** 唯一清空入口（测试夹具）；**清空自己也要留一条痕**（在清空之前写）。 */
  function reset() {
    _stat.resets++;
    _ring.length = 0;
    _seq = 0;
    _stat.lastAt = null;
    // v2.112.0：序号空间重启 ⇒ 下一次 flush 必须另起一条落盘线（见 `_lineageBreak` 的注释）。
    _lineageBreak = true;
    return { ok: true };
  }

  /* ── v2.112.0：落盘与读回（收 v2.111.0 的「只驻内存」尾巴）───────────── */

  /** localStorage 取用（宿主不可用时如实返回 null，不抛）。 */
  function lsOf() {
    try { return ((WA.mainWin || window).localStorage) || null; } catch (e) { return null; }
  }

  /**
   * 落盘：把**尚未落盘**的行追加到持久键（只增不减；不覆写比断点更旧的历史）。
   *   返回 `{ok, written, total, lost, reason?}`；**从不抛**（与 `record()` 同一条纪律）。
   *
   * 为什么按序号断点续写而不是整环覆写：环会被挤出，整环覆写等于在磁盘上留一份
   *   「已经不完整的前缀」，而按 `_persistedSeq` 续写的语义是「追加我还没写过的」——
   *   与「只能追加」这条边界同向。
   * `lost` 如实报出「在两次落盘之间被环挤出、因此没能落盘」的条数（不静默吞）。
   */
  function flush() {
    _stat.flushes++;
    try {
      const ls = lsOf();
      if (!ls) { _stat.flushFailed++; return { ok: false, reason: 'storage-unavailable', written: 0, lost: 0 }; }
      let hist = null;
      try {
        const raw = ls.getItem(PERSIST_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.format === PERSIST_FORMAT && Array.isArray(parsed.rows)) hist = parsed.rows;
        }
      } catch (e) {
        hist = null;                             // 坏历史 ⇒ 按「无历史」重建；不抛
        // v2.113.0（A1 收口）：读盘失败**必须留痕**。此前这一处（以及 restore 里同款的一处）
        //   是全仓唯二两个「在模块里裸读 localStorage、却不向读侧台账投递归因」的点
        //   ——G16 的清单里根本没有 core/audit-log.js 这个名字（现场 44 处裸读点、清单只登记 42）。
        //   出口复用 store 的读失败台账（`reportReadFail`，与 chatcache / index.js 同一条出口：
        //   单一真源，不新开第二个记账面）。本行**不改行为**——flush 的返回体与成败判定逐字未动。
        //   ★ 位置：必须落在**读到失败的那个内层 catch 里**。首版把投递写在 `return` 之后、
        //     且引用外层 `e` ⇒ 既永不执行、又引用了不存在的变量（注释说已留痕 ≠ 真的留痕）。
        try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('auditlogFlush', PERSIST_KEY, e); } catch (e2) {}
      }
      const oldest = _ring.length ? _ring[0].seq : 0;
      // v2.112.0：`reset()`（测试夹具）会把内存序号重新从 1 起算，而落盘断点仍停在旧谱系的高位。
      //   此时若照旧按 `seq > _persistedSeq` 取增量，**环里所有新行都会被判成「已落盘」而静默丢失**。
      //   处理：识别出「序号空间重启」后另起一条落盘谱系（旧谱系是夹具产物，不并进来——
      //   按 seq 相并等于伪造一段从未发生过的历史），并如实标注 `lineageRestart`。
      //
      //   **怎么认**：不靠数值推断（试过两种都不成立 —— 拿环首比会误判每一次续写；
      //   拿环内最大比会漏掉「新谱系长度恰好等于旧断点」那种情形），而是让 `reset()` 直接置位：
      //   内存序号空间的**唯一**重启来源就是它。能直接知道的事，不靠猜。
      const restarted = _lineageBreak && _ring.length > 0;
      if (restarted) { _stat.lineageResets++; hist = null; _lineageBreak = false; }
      const base = Array.isArray(hist) ? hist.slice() : [];
      const lost = (!restarted && _persistedSeq > 0 && oldest > _persistedSeq + 1)
        ? Math.max(0, oldest - _persistedSeq - 1) : 0;
      const fresh = restarted ? _ring.slice() : _ring.filter(function (r) { return r.seq > _persistedSeq; });
      if (lost) _stat.lost = (_stat.lost || 0) + lost;
      if (!fresh.length) { _stat.lastFlushAt = clockWall(); return { ok: true, written: 0, total: base.length, lost: lost, lineageRestart: restarted }; }
      const merged = base.concat(fresh);
      const kept = merged.length > PERSIST_CAP ? merged.slice(merged.length - PERSIST_CAP) : merged;
      ls.setItem(PERSIST_KEY, JSON.stringify({ format: PERSIST_FORMAT, savedAt: clockWall(), rows: kept }));
      _persistedSeq = fresh[fresh.length - 1].seq;
      _stat.persisted += fresh.length; _stat.lastFlushAt = clockWall();
      return { ok: true, written: fresh.length, total: kept.length, lost: lost, lineageRestart: restarted };
    } catch (e) {
      _stat.flushFailed++;
      return { ok: false, reason: 'flush-failed', written: 0, lost: 0 };
    }
  }

  /**
   * 读回落盘历史（**只读**；**不**合并进内存环——环是**本次会话**的现场，
   *   历史是**上一次会话**的现场，两者混在一起会让「这次看到的是不是新事实」无法回答）。
   *   返回 `{available, rows}`；`available:false` 时给出 `reason`（不假称「没有历史」）。
   */
  function restore(n) {
    try {
      const ls = lsOf();
      if (!ls) { _stat.restoreFailed++; return { available: false, reason: 'storage-unavailable', rows: [], total: 0 }; }
      const raw = ls.getItem(PERSIST_KEY);
      if (!raw) { _stat.restored++; return { available: true, reason: 'no-history', rows: [], total: 0 }; }
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) {
        parsed = null;
        // v2.113.0（A1 收口）：与 flush 侧同款留痕（见上）。两处同源，故两处都要投递——
        //   只补一处等于把「读失败静默」从一处搬到另一处。同前：必须落在真读出失败的内层 catch 里。
        try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('auditlogRestore', PERSIST_KEY, e); } catch (e2) {}
      }
      if (!parsed || parsed.format !== PERSIST_FORMAT || !Array.isArray(parsed.rows)) {
        _stat.restoreFailed++;
        return { available: false, reason: 'bad-format', rows: [], total: 0 };
      }
      const all = parsed.rows;
      const k = (typeof n === 'number' && isFinite(n)) ? Math.max(0, Math.min(PERSIST_CAP, Math.floor(n))) : all.length;
      _stat.restored++;
      return { available: true, savedAt: parsed.savedAt || null, total: all.length,
        rows: all.slice(Math.max(0, all.length - k)).map(function (r) {
          const o = {};
          FIELDS.forEach(function (f) { o[f] = r[f]; });
          return o;
        }) };
    } catch (e) {
      _stat.restoreFailed++;
      return { available: false, reason: 'restore-failed', rows: [], total: 0 };
    }
  }

  WA.auditLog = {
    record: record, recent: recent, byAction: byAction, count: count,
    stat: stat, reset: reset,
    flush: flush, restore: restore,
    CAP: CAP, PARAM_CAP: PARAM_CAP, PERSIST_KEY: PERSIST_KEY, PERSIST_CAP: PERSIST_CAP,
    FIELDS: FIELDS.slice(), FORBIDDEN: FORBIDDEN.slice()
  };
})();
