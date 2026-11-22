/**
 * WorldAxis engines/lazy-load.js (v2.529.0) — 惰性装载档
 *
 * 病：index.js 的 LOAD_ORDER 是一张**全装清单**，首帧把几百个引擎一个不落地
 *   串行 fetch + eval。可其中一批（导出/导入/存档迁移/楼层整理这类）首帧根本不碰 ——
 *   它们只在用户点某个按钮时才需要，却和面板首屏抢同一段启动时间。
 *
 * 但「把条目从清单里删掉」是假的治：数字立刻好看，代价是那台引擎**永远不装**，
 * 面板上对应的按钮变成静默失效。所以本模块只做一件事 —— 把「装」从「登记」里拆开：
 *
 *   ① `add(list)` —— 登记，不装；
 *   ② `ensure(rel)` —— 按需装，**幂等**（已装即返回；装载中复用在飞的同一 promise）；
 *   ③ `auto()` —— 首帧后**串行**补装，一个装完再下一个（并发装载会在同一份 WA 上打架）；
 *   ④ `plan()` —— 收支读数：登记了几条、装成几条、还欠几条、失败过哪几条。
 *
 * 边界（都是否定式）
 *   1 **失败退回 pending，不是 dead**：装不动就留着，下次 `ensure` 还能再试 ——
 *      一次 fetch 抖动不该让一台引擎在本次会话里永久消失。
 *   2 **不吞失败**：`plan().failed` 逐条点名（去重），且 `stat().fails` 计数。
 *   3 **不重复装**：同一条目并发 `ensure` 只发一次装载；`auto` 重入复用同一个在飞 promise。
 *   4 **没接装载器就说没接**：`ensure` 在 `bind` 之前返回 rejected，而不是假装装上。
 *   5 **自己不懒**：本文件必须在首帧装载（它本身就是那条「怎么补装」的规则）。
 *   6 不读任何别的 ns：装载器是外部注入的（`bind`），本模块不碰 store / clock / net。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.529.0';

  let loader = null;
  const lazy = [];              // 登记顺序（= 补装顺序）
  const status = {};            // rel -> 'pending' | 'loading' | 'loaded'
  const inflight = {};          // rel -> Promise（在飞的那一次）
  const fails = [];             // 失败过的条目（去重，可重试）
  let autoPromise = null;
  const stat = { adds: 0, ensures: 0, ok: 0, fails: 0, autos: 0, lastErr: null };

  function bind(fn) {
    loader = (typeof fn === 'function') ? fn : null;
    return !!loader;
  }

  function add(list) {
    const arr = Array.isArray(list) ? list : [];
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const rel = arr[i];
      if (typeof rel !== 'string' || !rel) continue;
      if (Object.prototype.hasOwnProperty.call(status, rel)) continue;   // 去重
      status[rel] = 'pending';
      lazy.push(rel);
      n++;
    }
    stat.adds += n;
    return n;
  }

  function ensure(rel) {
    if (typeof rel !== 'string' || !rel) return Promise.resolve({ rel: rel, ok: false, err: '空条目' });
    if (!loader) return Promise.reject(new Error('lazyLoad 还没接装载器：先 bind(loader)'));
    if (status[rel] === 'loaded') return Promise.resolve({ rel: rel, ok: true, reused: true });
    if (inflight[rel]) return inflight[rel];
    if (!Object.prototype.hasOwnProperty.call(status, rel)) {   // 未登记的也允许按需装
      status[rel] = 'pending';
      lazy.push(rel);
    }
    status[rel] = 'loading';
    stat.ensures++;
    const p = Promise.resolve()
      .then(function () { return loader(rel); })
      .then(function (r) {
        const ok = !!(r && r.ok === true);
        if (ok) {
          status[rel] = 'loaded';
          stat.ok++;
        } else {
          status[rel] = 'pending';            // 失败退回 pending：可重试
          stat.fails++;
          stat.lastErr = String((r && (r.error || r.failed)) || 'unknown');
          if (fails.indexOf(rel) < 0) fails.push(rel);
        }
        return { rel: rel, ok: ok, err: ok ? null : stat.lastErr };
      }, function (e) {
        status[rel] = 'pending';
        stat.fails++;
        stat.lastErr = String((e && e.message) || e);
        if (fails.indexOf(rel) < 0) fails.push(rel);
        return { rel: rel, ok: false, err: stat.lastErr };
      })
      .then(function (out) { inflight[rel] = null; return out; });
    inflight[rel] = p;
    return p;
  }

  function auto() {
    if (autoPromise) return autoPromise;
    stat.autos++;
    autoPromise = (function () {
      let i = 0;
      const step = function () {
        if (i >= lazy.length) return Promise.resolve(plan());
        const rel = lazy[i++];
        if (status[rel] === 'loaded') return step();
        return ensure(rel).then(step, step);   // 单条失败不终止整轮
      };
      return step();
    })().then(function (r) { autoPromise = null; return r; }, function (r) { autoPromise = null; return r; });
    return autoPromise;
  }

  function plan() {
    const loaded = [], pending = [], loading = [];
    lazy.forEach(function (rel) {
      if (status[rel] === 'loaded') loaded.push(rel);
      else if (status[rel] === 'loading') loading.push(rel);
      else pending.push(rel);
    });
    return { lazy: lazy.slice(), loaded: loaded, loading: loading, pending: pending, failed: fails.slice() };
  }

  WA.lazyLoad = {
    version: VERSION,
    bind: bind,
    add: add,
    ensure: ensure,
    auto: auto,
    plan: plan,
    stat: function () {
      return { adds: stat.adds, ensures: stat.ensures, ok: stat.ok, fails: stat.fails, autos: stat.autos, lastErr: stat.lastErr };
    }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/lazy-load.js', { kind: 'engine', ver: VERSION });
})();