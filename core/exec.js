/**
 * WorldAxis core/exec.js (v2.118.0) — 显式执行上下文（计划二 B7 的承重结构）
 *
 * ── 它治什么（缺口原句）────────────────────────────────────
 *   计划二 B7 原文：「在 A1 和 B1 的共享执行逻辑上，构造隔离的世界快照、故事时钟、随机源及本轮候选。
 *   **真实运行与试演使用同样的准入、冲突与效果处理，执行上下文显式传入。**
 *   检查当轮因果推进里读取全局状态的分支，确保**试演不回读真实世界，也不产生外部副作用**。」
 *
 *   此前本仓的执行模块把上下文**隐式钉死在全局**（直呼 `WA.store` / `WA.world` / `WA.clock`）。
 *   后果是一条结构性死路：想让这段逻辑跑在副本上，只有两条路——
 *     ① 另写一套推进规则（两份实现**必然漂移**，而漂移最难发现：用户据预览做决定，真跑走另一条）；
 *     ② 把真世界改掉（那就不叫试演了，且中途崩溃会把真世界留在半路）。
 *   两条都不是本仓接受的答案。第三种答案就是本模块：**把上下文收成一个显式传入的对象**。
 *
 * ── 一条纪律（写在最前面，因为它决定本模块的所有签名）──────────
 *   **上下文只在栈上，不在全局。** 本次执行去哪个世界、哪个时钟、写进哪一份状态，
 *   全部由 `withContext(ctx, fn)` 的**调用帧**决定；离开这一段就回到真世界。
 *   为什么不做成「模块级临时变量 + 手动复位」：那是不可见的全局状态，一次 early return
 *   就能把后续整局的执行都指向副本（v2.89.0 O2 的录制态漏出是同一形态的病，代价是整局被静默记录）。
 *   `withContext` 的 `finally` 无条件复位；嵌套时由深度计数保证只有最外层能改写。
 *
 * ── 缺席时的行为（降级可见，不是静默）──────────────────────────
 *   调用方（engines/act.js / engines/world.js）**不**依赖本模块存在：
 *   `WA.exec` 缺席时它们一律按「真世界」执行（与 v2.117.0 逐字一致），
 *   而此时试演入口会以 `exec-absent` 拒收 —— 宁可拒收，也不在真世界上跑一次假试演。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // ── 上下文栈（深度 + 当前）──────────────────────────────────
  //   深度是必需的：`withContext` 可以嵌套（试演里再跑一段定点预览），
  //   内层结束时不得把外层的上下文一起抹掉。
  let __ctx = null;
  let __depth = 0;

  function current() { return (__depth > 0) ? __ctx : null; }
  function inDryRun() { const c = current(); return !!(c && c.sink); }

  /**
   * 在上下文里跑一段。**唯一入口**。
   *   `ctx` 的形状（缺哪个面就落回哪个面的真值，故意如此：漏传一个面不会静默成功，
   *   而会在那个面上读到真世界 —— 这正是「显式传入」要暴露的东西）：
   *     { store, world, clock, stat, sink }
   *   · store —— 读门面（至少要能 `get()`）
   *   · world —— 世界门面（reach / canBeAt / depart / arrive / stop）
   *   · clock —— `{ now(site) }`（试演期是冻结的故事时钟）
   *   · stat  —— 计数器袋（试演落这里，**不碰模块计数器**）
   *   · sink  —— **副作用去向**。非空即「试演」：所有写落到这个对象上，
   *               一次都不进真 store（这是「不产生外部副作用」的唯一实现路径）。
   */
  function withContext(ctx, fn) {
    const prev = __ctx, prevDepth = __depth;
    __ctx = ctx || null;
    __depth = prevDepth + 1;
    try { return fn(); }
    finally {
      __depth = prevDepth;
      __ctx = prev;
    }
  }

  // ── 四个取值口（调用方只经这四个，不直接看 __ctx）─────────────
  function storeOf(fallback) {
    const c = current();
    return (c && c.store) ? c.store : fallback;
  }
  function worldOf(fallback) {
    const c = current();
    return (c && c.world) ? c.world : fallback;
  }
  /**
   * 时钟取值口 —— 形如 `WA.exec.now(site, () => WA.clock.now('...'))`。
   *
   * v2.119.0（优化③「产品代码零裸调 Date.now」）：`now()` 本身就是**时钟守卫的取值口**，
   *   而它原先的兜底是裸调 `Date.now()`——那一处会被 tests/run.js 的 ①裸调归零 判成
   *   `bare`（裸调绕过冻结：回放对不上时全库通读也找不出这一处）。本仓对守卫 fallback 的
   *   口径是「可留，但必须与 `WA.clock.` **同行共现**」——判据按行看，跨行看不出这是守卫。
   *   故把守卫声明与 fallback 收在**同一行**（与 core/store.js / core/api-router.js 的
   *   `const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };`
   *   逐字同形）。语义逐字不变：无上下文且未传 fallbackFn 时仍返回当前墙钟。
   */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  function now(site, fallbackFn) {
    const c = current();
    if (c && c.clock && typeof c.clock.now === 'function') return c.clock.now(site);
    return (typeof fallbackFn === 'function') ? fallbackFn() : clockNow(site);
  }
  function statBag(fallback) {
    const c = current();
    return (c && c.stat) ? c.stat : fallback;
  }

  /**
   * 副作用去向。**真跑与试演的唯一分岔点**，只有这一处：
   *   · 在试演里（`sink` 非空）—— 写进 sink，**不碰 store**，并计入 `ctx.writes` 供取证；
   *   · 真跑 —— 原样交给 store 的 `transact`（返回值契约逐字不变）。
   *   mutator 的 `false` 中止语义两路一致（试演里也如实回 `aborted`）：
   *   两路若在这一点上不一致，「试演通过、真跑中止」就会成为一种无法解释的现象。
   */
  function mutate(storeFacade, fn, opt) {
    const c = current();
    if (c && c.sink) {
      c.writes = (c.writes || 0) + 1;
      let r;
      try { r = fn(c.sink); }
      catch (e) { return { ok: false, error: e, dryRun: true }; }
      if (r === false) return { ok: false, aborted: true, dryRun: true };
      return { ok: true, applied: false, persisted: null, dryRun: true, state: c.sink, result: r };
    }
    if (!storeFacade || typeof storeFacade.transact !== 'function') return { ok: false, reason: 'store-absent' };
    return storeFacade.transact(fn, opt);
  }

  /**
   * 隔离 store 门面：**一份深拷贝 + 一个只服务本次执行的门面**。
   *   为什么不是「真 store + 跑完还原」：中途抛异常/超时会把真世界留在半路，
   *   而「留在半路」这件事在读数上完全看不出来（本仓反复治理的形态）。
   *   `read` 逐段走拷贝，坏入参回落 fallback —— 与 store.read 的契约同口径。
   */
  function sandStore(base) {
    const b = base || {};
    function read(path, fallback) {
      if (typeof path !== 'string' || !path) return fallback;
      let node = b;
      const segs = path.split('.');
      for (let i = 0; i < segs.length; i++) {
        if (node == null) return fallback;
        node = node[segs[i]];
      }
      return node === undefined ? fallback : node;
    }
    return {
      sand: true,
      get: function () { return b; },
      read: read,
      transact: function (fn, opt) {
        let r;
        try { r = fn(b); }
        catch (e) { return { ok: false, error: e, dryRun: true }; }
        if (r === false) return { ok: false, aborted: true, dryRun: true };
        return { ok: true, applied: false, persisted: null, dryRun: true, state: b, result: r };
      },
      currentBranchId: function () {
        try { return (WA.store && WA.store.currentBranchId) ? WA.store.currentBranchId() : 'b0'; }
        catch (e) { return 'b0'; }
      }
    };
  }

  /** 深拷贝一份世界（试演的唯一世界来源）。失败（循环引用等）返回 null，由调用方拒收。 */
  function cloneState(wa) {
    try {
      const src = (wa && wa.store && wa.store.get) ? wa.store.get() : {};
      return JSON.parse(JSON.stringify(src || {}));
    } catch (e) { return null; }
  }

  WA.exec = {
    withContext: withContext,
    current: current,
    inDryRun: inDryRun,
    storeOf: storeOf,
    worldOf: worldOf,
    now: now,
    statBag: statBag,
    mutate: mutate,
    sandStore: sandStore,
    cloneState: cloneState,
    depth: function () { return __depth; }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('core/exec.js', { kind: 'core', ver: '2.118.0' });
})();
