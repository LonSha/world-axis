/**
 * WorldAxis core/fault-context.js (v2.110.0) — 异常的上下文追踪与恢复（计划一 #21）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   本仓的关键入口（`store.save()` / `render.*` / `canon.*` …）在抛错时给出的是**裸错误**：
 *   `TypeError: Cannot read properties of undefined (reading 'actors')`。
 *   这句话回答不了三个问题，而这三个问题恰是排查的全部：
 *     · 哪一次调用出的（operation）？  · 当时世界长什么样（actors / step / rev）？
 *     · 这个错该不该重试（是网络抖动，还是类型写错了）？
 *   现状的代价不是「报错难看」，而是**错误没有归属**：同一个 TypeError 可能来自 40 个入口，
 *   而本仓的回归与实机日志只能按**行号**区分它们。
 *
 * ── 三条设计边界（都是否定式）──────────────────────────────────────────
 *   ① **不改被包装函数的语义**：`wrap(op, fn)` 默认在捕获后**返回结果对象**而不是继续抛
 *      （`{ ok:false, reason:'fault-handled', ... }`），但显式 `{rethrow:true}` 时**原样重抛同一个
 *      错误对象**（不包装、不 New、不改 message）——包装器一旦改写错误类型，上层 `instanceof`
 *      判据会静默失效（v2.84.0 的教训：安全网自己成了断点）。
 *   ② **取证不得改被取证对象**：`e.waContext = ctx` 在**冻结 error** 上会抛，故该赋值本身
 *      包 try/catch 且失败**不影响** ctx 的返回（ctx 始终随返回值/`stat().lastCtx` 可得）。
 *   ③ **上下文采集自己不许抛**：`stateBrief()` 捕一切异常并如实给 `null` ——
 *      「取不到现场」与「现场是空的」是两件事，不许压成同一个值。
 *
 * ── 与既有模块的分工 ───────────────────────────────────────────────────
 *   · `core/input-guard.js` 管**入参形态**（值进世界之前）；本模块管**执行期故障**（调用之后）。
 *   · 重试只对 `classify()` 判定的 `network` / `transient` **两类**开放，且必须调用方显式
 *     声明 `{retry:true, tries:N}` —— 默认**不重试**。「默认自动重试」会把一次性错误
 *     放大成 N 倍副作用，而本仓的写入口大多不是幂等的。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 上下文环（内存，最多 60 条；最近的在末尾）。 */
  const CAP = 60;
  let _seq = 0;
  const _ring = [];
  const _stat = { wraps: 0, caught: 0, rethrown: 0, recovered: 0, retried: 0,
    retryOk: 0, retryFail: 0, annotated: 0, annotateFailed: 0, lastCtx: null };
  /** 可重试的两类故障（其余一律不重试）。 */
  const RETRIABLE = ['network', 'transient'];

  /** 墙钟守卫（与仓库其余 130 处同形：先试产品时钟、异常回落 Date.now ——
   *  形态刻意与 core/store.js 的 clockWall 逐字同构：tests/run.js 的 v2.20.0 段用一对
   *  「声明数 == 兜底数」的判据抄这一族，**函数名与写法都在判据的观察面上**）。 */
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  /**
   * 世界现场摘要（**捕一切异常**）。
   *   返回 `{actorCount, step, rev, phase}`；取不到的字段如实为 `null`，不是 0、不是 ''。
   */
  function stateBrief() {
    const out = { actorCount: null, step: null, rev: null, phase: null };
    try {
      const st = (WA.store && typeof WA.store.read === 'function') ? WA.store.read() : null;
      if (st && typeof st === 'object') {
        const a = st.actors;
        if (Array.isArray(a)) out.actorCount = a.length;
        else if (a && typeof a === 'object') out.actorCount = Object.keys(a).length;
        const meta = st.meta;
        if (meta && typeof meta === 'object') {
          if (typeof meta.step === 'number' && isFinite(meta.step)) out.step = meta.step;
          if (typeof meta.stateRev === 'number' && isFinite(meta.stateRev)) out.rev = meta.stateRev;
        }
      }
    } catch (e) { /* 现场取不到 ⇒ 保持 null：取证不改事实 */ }
    return out;
  }

  /** 栈深（不含 "Error" 首行）；无 stack 时给 1（**不抛**）。 */
  function stackDepth(err) {
    try {
      const s = String((err && err.stack) || '');
      if (!s) return 1;
      const n = s.split('\n').length - 1;
      return n > 0 ? n : 1;
    } catch (e) { return 1; }
  }

  /**
   * 故障分类（决定「该不该重试」的唯一依据）。
   *   只认几类可判定的：network / transient / type / range / other。
   *   判据落在 message + code 上（不读 stack 文本 —— 栈里的文件名会随打包变化）。
   */
  function classify(err) {
    let msg = '', code = '';
    try { msg = String((err && err.message) || err || ''); } catch (e) { msg = ''; }
    try { code = String((err && err.code) || ''); } catch (e) { code = ''; }
    const hay = (msg + ' ' + code).toLowerCase();
    try { if (err && err.name === 'TypeError') return 'type'; } catch (e) { /* 保持下面继续判 */ }
    try { if (err && err.name === 'RangeError') return 'range'; } catch (e) { /* 同上 */ }
    if (/network|fetch|econn|etimedout|timeout|offline|dns/.test(hay)) return 'network';
    if (/storage|quota|busy|locked|transient|temporar|unavailable/.test(hay)) return 'transient';
    if (/cannot read|undefined|not a function|null/.test(hay)) return 'type';
    if (/out of range|invalid array|maximum call/.test(hay)) return 'range';
    return 'other';
  }

  /** 该故障类型是否属可重试档（导出给调用方自判：判据只有一处）。 */
  function isRetriable(kind) { return RETRIABLE.indexOf(String(kind)) >= 0; }

  function push(ctx) {
    _ring.push(ctx);
    while (_ring.length > CAP) _ring.shift();
  }

  /**
   * 包装一次调用。
   * @param {string} operation 业务名（不是函数名 —— 用户能读懂的「哪一步」）
   * @param {Function} fn      被包装的调用（**无参**：参数由调用方闭包捕获，便于重试）
   * @param {Object} [opts]    `{params, state, rethrow, annotate, fallback, retry, tries, sleep}`
   * @returns 正常返回 fn() 的结果；抛出后按 opts 返回 fallback / 结果对象 / 原样重抛
   */
  function wrap(operation, fn, opts) {
    const o = opts || {};
    const name = WA.inputGuard ? WA.inputGuard.text(operation, 80) : String(operation == null ? '' : operation).slice(0, 80);
    if (typeof fn !== 'function') {
      return { ok: false, reason: 'not-a-function', operation: name, kind: 'other' };
    }
    _stat.wraps++;
    try {
      return fn();
    } catch (e) {
      _stat.caught++;
      const ctx = {
        seq: ++_seq,
        at: clockWall(),
        operation: name,
        params: o.params === undefined ? null : o.params,
        state: o.state === undefined ? stateBrief() : o.state,
        depth: stackDepth(e),
        kind: classify(e),
        message: String((e && e.message) || e || '').slice(0, 200),
        attempts: 1
      };
      push(ctx);
      _stat.lastCtx = ctx;
      // ③ 取证不得改被取证对象：冻结 error 上挂不上去，如实记 annotateFailed。
      if (o.annotate !== false) {
        try { e.waContext = ctx; _stat.annotated++; }
        catch (e2) { _stat.annotateFailed++; }
      }
      // 重试：默认关；只在调用方显式声明且故障属可重试档时开。
      const tries = Math.max(1, Math.min(5, (o.tries | 0) || 1));
      if (o.retry && tries > 1 && isRetriable(ctx.kind)) {
        for (let i = 1; i < tries; i++) {
          _stat.retried++;
          if (typeof o.sleep === 'function') {
            try { o.sleep(i); } catch (e4) { /* 等待器自己炸不该改变故障结论 */ }
          }
          try {
            const v = fn();
            _stat.retryOk++;
            ctx.attempts = i + 1;
            return v;
          } catch (e3) {
            ctx.message = String((e3 && e3.message) || e3 || '').slice(0, 200);
            ctx.attempts = i + 1;
          }
        }
        _stat.retryFail++;
      }
      if (o.rethrow) {
        _stat.rethrown++;
        throw e;                                     // 原样重抛：类型/身份都不改
      }
      _stat.recovered++;
      if (o.fallback !== undefined) return o.fallback;
      return { ok: false, reason: 'fault-handled', kind: ctx.kind, operation: name, ctx: ctx };
    }
  }

  /** 最近 n 条上下文（默认全部；越界自动夹取）。返回**副本**，外部改不动环。 */
  function recent(n) {
    const k = (typeof n === 'number' && isFinite(n)) ? Math.max(0, Math.min(CAP, Math.floor(n))) : _ring.length;
    return _ring.slice(_ring.length - k).map(function (c) {
      return { seq: c.seq, at: c.at, operation: c.operation, kind: c.kind, depth: c.depth,
        message: c.message, attempts: c.attempts, params: c.params, state: c.state };
    });
  }

  function stat() {
    return { wraps: _stat.wraps, caught: _stat.caught, rethrown: _stat.rethrown,
      recovered: _stat.recovered, retried: _stat.retried, retryOk: _stat.retryOk,
      retryFail: _stat.retryFail, annotated: _stat.annotated, annotateFailed: _stat.annotateFailed,
      ring: _ring.length, cap: CAP, retriable: RETRIABLE.slice(),
      lastCtx: _stat.lastCtx ? { operation: _stat.lastCtx.operation, kind: _stat.lastCtx.kind, seq: _stat.lastCtx.seq } : null };
  }

  function reset() {
    _ring.length = 0;
    _seq = 0;
    Object.keys(_stat).forEach(function (k) { if (k !== 'lastCtx') _stat[k] = 0; });
    _stat.lastCtx = null;
  }

  WA.faultContext = {
    wrap: wrap, recent: recent, stat: stat, reset: reset,
    classify: classify, isRetriable: isRetriable, stateBrief: stateBrief,
    CAP: CAP, RETRIABLE: RETRIABLE.slice()
  };
})();