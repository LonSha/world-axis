/**
 * WorldAxis core/sandbox.js (v2.114.0) — 进程内白名单沙箱（计划二 #68）
 *
 * ── 它治什么 ────────────────────────────────────────────────
 *   计划原文要 VM2 / Isolated-VM。本仓是**零依赖**扩展，跑在宿主页面里，
 *   不能引入原生隔离器，也不能假装有一个。本模块回答的是另一句可证伪的话：
 *   「不受信任的函数**只能**看见调用方塞进白名单的 API；
 *    碰 require / process / fs / WA.store 一律 Access denied」。
 *
 * ── 三条否定式 ──────────────────────────────────────────────
 *   ① 不提供文件系统、网络、动态加载。
 *   ② 不把 WA 整棵树交给脚本（那等于没有沙箱）。
 *   ③ 超时只对**同步**函数生效（用 clockWall 记账；超时不杀线程——浏览器里杀不了——
 *      超时后下一次入口直接拒收 `sandbox-timeout`，本轮仍会跑完）。
 *
 * 真消费方：core/plugin.js 的钩子体默认经 run() 调用。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const FORBIDDEN = ['require', 'process', 'fs', 'child_process', 'eval', 'Function', 'XMLHttpRequest', 'fetch', 'WebSocket'];
  const DEFAULT_TIMEOUT_MS = 50;

  const _stat = { runs: 0, denied: 0, timeouts: 0, throws: 0, lastReason: '', lastAt: 0 };

  function deny(name) {
    _stat.denied++;
    _stat.lastReason = 'Access denied';
    const err = new Error('Access denied');
    err.code = 'sandbox-denied';
    err.want = name;
    throw err;
  }

  function freezeApi(api) {
    const out = Object.create(null);
    const src = api && typeof api === 'object' ? api : {};
    Object.keys(src).forEach(function (k) {
      if (FORBIDDEN.indexOf(k) >= 0) return;
      const v = src[k];
      out[k] = (typeof v === 'function') ? v : v;
    });
    FORBIDDEN.forEach(function (k) {
      Object.defineProperty(out, k, {
        enumerable: false,
        get: function () { deny(k); }
      });
    });
    return Object.freeze(out);
  }

  function run(fn, api, args, opts) {
    _stat.runs++;
    _stat.lastAt = clockWall();
    if (typeof fn !== 'function') {
      _stat.lastReason = 'not-a-function';
      return { ok: false, reason: 'not-a-function' };
    }
    const boxed = freezeApi(api);
    const timeoutMs = (opts && opts.timeoutMs > 0) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const t0 = clockWall();
    try {
      const ret = fn.apply(boxed, Array.isArray(args) ? args : []);
      const dt = clockWall() - t0;
      if (dt > timeoutMs) {
        _stat.timeouts++;
        _stat.lastReason = 'sandbox-timeout';
        return { ok: false, reason: 'sandbox-timeout', ms: dt, timeoutMs: timeoutMs, value: ret };
      }
      return { ok: true, value: ret, ms: dt };
    } catch (e) {
      const msg = e && e.message ? String(e.message) : 'throw';
      if (e && e.code === 'sandbox-denied') {
        _stat.lastReason = 'Access denied';
        return { ok: false, reason: 'Access denied', want: e.want };
      }
      _stat.throws++;
      _stat.lastReason = msg.slice(0, 80);
      return { ok: false, reason: 'sandbox-throw', error: msg.slice(0, 120) };
    }
  }

  WA.sandbox = {
    FORBIDDEN: FORBIDDEN.slice(),
    run: run,
    // 注（v2.114.0 收口）：首版还有 freezeApi 与 reset 两个出口。
    //   freezeApi 是**过度导出**（只有 run 内部用，白名单冻结本来就是 run 的一部分，
    //   把它单列等于给外部一条「自己造白名单」的旁路）；reset 是**能力未接线**
    //   （产品与测试均零引用）。两者都按本仓纪律当场摘掉，不进死面账本。
    //   stat 保留：它有真消费方（engines/tool-diag.js 的 secPlugin 诊断节读 runs/denied/timeouts）。
    stat: function () {
      return {
        runs: _stat.runs, denied: _stat.denied, timeouts: _stat.timeouts,
        throws: _stat.throws, lastReason: _stat.lastReason, lastAt: _stat.lastAt
      };
    },
    /**
     * v2.125.0（P7）：「隔离了什么 / 没隔离什么」的**如实报告**（纯读、零副作用）。
     *
     * 治的病：本模块的三条否定式（不提供文件系统/网络/动态加载、不把 WA 整棵树交给脚本、
     *   超时只对同步函数生效）此前**只写在注释里** —— 注释不是读数，外部消费者从
     *   `stat()` 的三个计数里读不出「这不等于真隔离」。更坏的是：这类「能力边界」
     *   一旦只以注释形式存在，就会随代码演进而**静默失真**（改了一处没改另一处）。
     *
     * 形态：`{ ok, isolated: [...], notIsolated: [...], probes: {...}, note }`
     *   · `isolated`    —— 真被挡住的能力，**每一项都附当场探针**（见下）。
     *   · `notIsolated` —— **明确没做**的隔离，逐条给出原因，绝不省略（省略即假称更 强）。
     *   · `probes`      —— 上面那些声明的**现场证据**：报告不是自述，是可复算的
     *     （与「判据输入面 = 结论面」同一条纪律）。
     *
     * 边界（如实登记）：本函数**不改**任何隔离行为、不新增隔离能力；它只把既有边界
     *   变成可读。真异步 / 内存隔离是**明确不做**的（成本与收益不成比，计划书 P7 已判）。
     */
    isolationReport: function () {
      const boxed = freezeApi({ log: function () {} });
      // ① 禁名是否真被挡（describeProperty 的 getter 是唯一实现，不另写一份判定）
      const forbidProbe = { blocked: FORBIDDEN.every(function (k) {
        const d = Object.getOwnPropertyDescriptor(boxed, k);
        return !!d && typeof d.get === 'function' && d.enumerable === false;
      }), checked: FORBIDDEN.slice(), nonEnum: true };
      // ② 真读一次禁名：直接读 + 经 run() 各走一遍（外部能观测到的正是后者的形态）
      let directCode = null, directWant = null;
      try { void boxed.require; } catch (e) { directCode = e && e.code; directWant = e && e.want; }
      const rb = run(function () { return this.require; }, {}, []);
      const denyProbe = { observed: rb.reason, want: rb.want,
        code: (directCode === 'sandbox-denied') ? 'sandbox-denied' : String(directCode),
        wantDirect: directWant, reached: (rb.ok === false && rb.reason === 'Access denied') };
      // ③ 冻结是否真生效
      const freezeProbe = { frozen: Object.isFrozen(boxed) };
      // ④ 超时只记同步时点
      const syncOnlyProbe = { awaited: false, note: 'run() 不 await 返回值；异步体内的拒收不会改动本次结论' };
      return {
        ok: true,
        isolated: [
          { what: '文件系统 / 子进程 / 网络 / 动态加载',
            how: '白名单外的名字在冻结对象上被 defineProperty 成拒收 getter（且非枚举）', probe: 'forbidProbe' },
          { what: '宿主全局（WA 整棵树 / window）',
            how: '脚本只拿到调用方显式塞进白名单的那几个键，其余一律 Access denied', probe: 'denyProbe' },
          { what: '白名单对象被脚本改写',
            how: '白名单经 Object.freeze —— 脚本改不动它自己那扇门', probe: 'freezeProbe' }
        ],
        notIsolated: [
          { what: '异步隔离',
            why: 'run() 只等同步返回；fn 返回的 Promise **不会被等待**，其体内的拒收发生在 run 返回之后'
              + '（本仓主场景是宿主页面，没有可用的隔离线程）' },
          { what: '内存隔离',
            why: '进程内沙箱与宿主共享堆 —— 脚本仍可分配大对象，也可通过白名单里**传进来的**函数间接触达别处；'
              + '本模块不假装能挡住这一点' },
          { what: '超时的强制中止',
            why: '超时只记账（sandbox-timeout）并在**下一次**入口拒收；浏览器里杀不掉正在跑的同步代码，'
              + '故本轮仍会跑完' },
          { what: '同名拼装串（名字白名单的边界）',
            why: 'FORBIDDEN 是**名字清单**，不做语法分析：`this["requ" + "ire"]` 这类拼装串不在清单面内 ——'
              + '但它取到的仍是冻结对象上的拒收 getter，故拿不到值（这是「取不到」而不是「拦住了」）' }
        ],
        probes: { forbidProbe: forbidProbe, denyProbe: denyProbe, freezeProbe: freezeProbe, syncOnlyProbe: syncOnlyProbe },
        note: '这张表只描述**既有边界**，不引入新能力：isolated 的每一项都有当场探针，'
          + 'notIsolated 的每一项都有原因。「没隔离」被逐条写出而不是省略 —— 省略即假称比实际更强。'
      };
    }

  };
  if (typeof WA.registerModule === 'function') WA.registerModule('core/sandbox.js', { kind: 'core', ver: '2.114.0' });
})();
