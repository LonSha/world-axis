/**
 * WorldAxis core/boot-report.js (v2.523.0)
 *   OPV27-1 装载自述行收口 · OPV27-2 逐台装载耗时面
 *
 * ── 为什么存在这个文件（现场读数，不是推测）──────────────────────────────
 *   R1：`grep -rl '已加载' engines/ | wc -l` → **182**。182 台引擎在装载时各打一行
 *       `[WorldAxis] engines/xxx 已加载（ver）`，扩展一装好控制台就刷 182 行 ——
 *       玩家看不到「装好了」，维护者看不到「哪一行是告警」，两边都是噪音的受害者。
 *   R2：空世界装载 485ms / 508 命名空间 / 5698 成员是**总量**读数，但**没有任何一处**
 *       回答「这 485ms 花在谁身上」。没有热点读数，任何「启动优化」都只能靠猜。
 *
 * ── 做法（两条硬约束）──────────────────────────────────────────────
 *   ① **只截获这一种形态**的自述行（`[WorldAxis] <rel> 已加载（<ver>）`）。
 *      其余 console.log / warn / error **一律原样放行** —— 降噪不许拿「看不见故障」换，
 *      本仓的底线是「故障必须可见」，静音别人的告警来让日志好看是不许的。
 *   ② 被截获的行**不丢**：rel 与自述版本逐条留下（`selfLines`），配合 index.js 实测的
 *      逐台耗时合成逐台明细 —— 于是「玩家看不到刷屏」与「维护者看得见每一台」同时成立。
 *
 * ── 为什么是独立模块而不是写在 index.js 的 init() 里 ────────────────────
 *   测试桩（tests/v8-harness.js / ui-gate-sync.js）**只逐台 eval 模块，从不执行 init()**。
 *   把逻辑内联在 init() 里 = 这段代码在任何测试里都不会被执行 = 它坏没坏没人知道。
 *   故实现放这里（可单独开窗/关窗/自证），index.js 只做**接线**（顺序、计时、汇报）。
 *
 * ── 已知的一行漏账（如实写明，不假装全覆盖）──────────────────────────
 *   采集器由 index.js 在装载循环里**首次拿到本模块之后**才能开启，故 LOAD_ORDER[0]
 *   （正是本文件）自己的自述行会漏过窗口打一行。这一行进 `rows` 统计（rel/耗时/版本都在，
 *   版本由 index.js 以 `WA.bootReport.ver` 回填），不靠控制台自证。
 */
(function () {
  'use strict';
  // 别名形态必须与本仓其余模块**逐字同形**（module-cycle 的 ALIAS_RE 只认这一种）：
  //   const WA = window.WorldAxis = window.WorldAxis || {};
  //   换一种写法不会报错，但会在「解析出别名 516/517」上少一个文件 ——
  //   而覆盖率判据（B1 / N7）看的就是这两个数是否相等。
  const WA = window.WorldAxis = window.WorldAxis || {};

  var __VER = '2.523.0';

  // 自述行形态：`[WorldAxis] engines/pawn-redemption 已加载（2.523.0）`
  //   注意 `[WorldAxis]` 与 rel 之间是**一个空格**（182 处现场样本一致），
  //   但这里用 `\s+` 兜住历史上的双空格写法 —— 形态宽一点不损失判据：
  //   真正决定「该不该截」的是「以 [WorldAxis] 开头 + 含 已加载 + 括号版本号」三件同时成立。
  var SELF_RE = /^\[WorldAxis\]\s+(\S+)\s+已加载[（(]([^）)]+)[）)]\s*$/;

  var _stat = { opens: 0, closes: 0, captured: 0, passed: 0, restores: 0, lastReason: '' };
  var _handle = null;
  // 计时口径：走测量时钟（core/clock.js 的 wallNow），按本仓守卫写法「声明与兜底同行共现」。
  //   本文件是装载序第 2 位（紧跟 core/clock.js），但 clock 若装载失败也不许连带崩，
  //   故保留同一行的 `Date.now()` 兜底 —— 裸调 Date.now() 在别处是被禁的（tests/run.js K20），
  //   唯一允许的形态就是这种**带守卫**的声明。
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  function now() { return clockWall(); }


  /**
   * 开窗：开始截获自述行。
   *   **幂等**：重复调用返回同一个句柄（不允许叠两层代理 —— 叠了就没人还原得回去）。
   * @param {{ver?:string}} [opts]
   * @returns {{on:boolean, selfLines:Array, quietLines:number, close:Function}}
   */
  function open(opts) {
    opts = opts || {};
    if (_handle && _handle.on) return _handle;
    var c = (typeof console !== 'undefined') ? console : null;
    if (!c || typeof c.log !== 'function') {
      _stat.lastReason = 'no-console';
      // 没有 console ⇒ 没有可截的东西。返回一个「诚实空壳」，close() 也如实报 not-open。
      return { on: false, selfLines: [], quietLines: 0, ver: opts.ver || '',
        close: function () { return { selfLines: [], quietLines: 0, reason: 'no-console' }; } };
    }
    //   注意：**存原函数引用本身**，不存 `c.log.bind(c)` ——
    //     存 bind 出来的副本会让 close() 装回去的是一个「新函数」：功能一样，但
    //     `console.log === before` 不再成立。宿主/测试若在开窗前装过自己的收集器，
    //     装回去的必须是**那一个**函数本身，否则「我没有改坏别人的东西」就只是嘴上说。
    var orig = c.log;
    var h = { on: true, selfLines: [], quietLines: 0, t0: now(), ver: opts.ver || '',
      orig: orig, consoleObj: c };
    // 句柄上挂 close()：与「诚实空壳」那条返回路径保持**同一形状**。
    //   （踩过：空壳带 close、正常句柄却不带 ⇒ 调用方 `h.close()` 在正常路径上直接 TypeError，
    //     而"正常路径"恰恰是唯一会走进的那条 —— 形状不一致的代价由调用方承担。）
    h.close = close;
    c.log = function () {
      try {
        if (arguments.length === 1 && typeof arguments[0] === 'string') {
          var m = SELF_RE.exec(arguments[0]);
          if (m) {
            h.quietLines++;
            h.selfLines.push({ self: m[1], ver: m[2], at: Math.round((now() - h.t0) * 10) / 10 });
            _stat.captured++;
            return;                       // 截获：不进控制台
          }
        }
      } catch (e) { /* 解析异常 ⇒ 当普通日志放行，绝不吞掉任何一条非自述行 */ }
      _stat.passed++;
      return orig.apply(c, arguments);
    };
    _handle = h;
    _stat.opens++;
    return h;
  }

  /**
   * 关窗：还原 console.log 并把截获结果交出去。
   *   **无论装载成功与否都必须调用**（index.js 在 finally 里调）—— 采集器不许把宿主控制台改坏。
   * @returns {{selfLines:Array<{self,ver,at}>, quietLines:number, elapsedMs?:number, reason?:string}}
   */
  function close() {
    var h = _handle;
    if (!h) { _stat.lastReason = 'not-open'; return { selfLines: [], quietLines: 0, reason: 'not-open' }; }
    try {
      if (h.on && h.consoleObj && typeof h.consoleObj.log === 'function') {
        h.consoleObj.log = h.orig;
        _stat.restores++;
      }
    } catch (e) { _stat.lastReason = 'restore-fail:' + (e && e.message ? e.message : String(e)); }
    h.on = false;
    _handle = null;
    _stat.closes++;
    return { selfLines: h.selfLines.slice(), quietLines: h.quietLines,
      elapsedMs: Math.round(now() - h.t0) };
  }

  function percentile(sorted, p) {
    if (!sorted || !sorted.length) return 0;
    var i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
    return sorted[i];
  }

  /**
   * 把逐台行合成为「装载面读数」。
   * @param {Array<{rel:string, ms:number, ok:boolean, ver?:string}>} rows
   * @param {{ver?:string, quietLines?:number, elapsedMs?:number, total?:number, selfLines?:Array}} [meta]
   * @returns {object} 报告对象（rows / slow / report 三项 + 分位读数）
   */
  function summarize(rows, meta) {
    rows = Array.isArray(rows) ? rows : [];
    meta = meta || {};
    var verMap = meta.verMap || {};
    var norm = rows.map(function (x) {
      return { rel: String(x.rel || ''), ms: Number(x.ms) || 0, ok: !!x.ok,
        ver: String(x.ver || verMap[x.rel] || '') };
    });
    var okN = norm.filter(function (x) { return x.ok; }).length;
    var bad = norm.filter(function (x) { return !x.ok; });
    var engines = norm.filter(function (x) { return x.rel.indexOf('engines/') === 0; }).length;
    var sorted = norm.map(function (x) { return x.ms; }).sort(function (a, b) { return a - b; });
    var p50 = Math.round(percentile(sorted, 0.5) * 10) / 10;
    var p95 = Math.round(percentile(sorted, 0.95) * 10) / 10;
    var max = sorted.length ? Math.round(sorted[sorted.length - 1] * 10) / 10 : 0;
    var slowOf = function (n) {
      return norm.slice().sort(function (a, b) { return b.ms - a.ms; }).slice(0, n || 10);
    };
    var out = {
      ver: String(meta.ver || ''),
      total: Number(meta.total) || norm.length,
      ok: okN,
      failed: bad.map(function (x) { return x.rel; }),
      engines: engines,
      elapsedMs: Number(meta.elapsedMs) || 0,
      quietLines: Number(meta.quietLines) || 0,
      p50: p50,
      p95: p95,
      max: max,
      /** 逐台明细（rel / 实测耗时 / 自述版本 / 是否成功）。 */
      rows: function () { return norm.slice(); },
      /** 最慢的 n 台（默认 10）。 */
      slow: function (n) { return slowOf(n); },
      /** 一行汇报文本：控制台、诊断面板、场景验收共用**同一句**，避免两处口径漂移。 */
      report: function () {
        var top = slowOf(3).map(function (x) { return x.rel + ' ' + x.ms + 'ms'; }).join(' / ');
        return '已装载 ' + okN + '/' + out.total + '（引擎 ' + engines + '）'
          + '·失败 ' + bad.length + ' · ' + out.elapsedMs + 'ms（p50 ' + p50 + 'ms / p95 ' + p95 + 'ms）'
          + (top ? ' · 慢 TOP3：' + top : '');
      }
    };
    return out;
  }

  function stat() {
    return { opens: _stat.opens, closes: _stat.closes, captured: _stat.captured,
      passed: _stat.passed, restores: _stat.restores, open: !!(_handle && _handle.on),
      lastReason: _stat.lastReason };
  }

  // 导出面**只留真被读的口**（本仓口径：导出一个没人读的口就是给自己加一份要维护的接口面）：
  //   open / close  —— index.js 装载循环开窗与还原；
  //   summarize    —— index.js 合成装载面读数；
  //   stat         —— 采集器自身健康度（真机排查“窗口没开/没还原”用）；
  //   ver          —— index.js 回填 rows 里的模块版本。
  // percentile 是 summarize 的内部工具，reset / diagnose / selfLineRe 没有任何读方 ⇒ 不导出。
  WA.bootReport = {
    open: open,
    close: close,
    summarize: summarize,
    stat: stat,
    ver: __VER
  };
  var EXPORT_COUNT = 5;
  var _exported = Object.keys(WA.bootReport).length;
  if (_exported !== EXPORT_COUNT) throw new Error('bootReport: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')');

  if (typeof WA.registerModule === 'function') WA.registerModule('core/boot-report.js', { kind: 'core', ver: __VER });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] core/boot-report 已加载（' + __VER + '）');
})();
