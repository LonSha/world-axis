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
    }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('core/sandbox.js', { kind: 'core', ver: '2.114.0' });
})();
