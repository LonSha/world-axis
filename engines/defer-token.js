/**
 * WorldAxis engines/defer-token.js (v2.251.0) — 延迟任务的代际令牌与串行尾链
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   全库 28 个文件里 65 处 `setTimeout`、11 个文件 22 处 `clearTimeout`，**没有一处带代际令牌**。
 *   惯例形状是 `if (_t) clearTimeout(_t); _t = setTimeout(...)`
 *   （engines/chatcache.js:247-248、engines/inject-inspector.js:194-195、
 *   engines/timeline.js:60-61 逐字同型）。这个形状只在「独占槽、同站点自己清自己」时成立。
 *   一旦两处共写同一个槽，或回调里再排一次队，旧回调就会**把新回调停掉**：
 *     · inject-inspector 的 `_retryTimer` 被 `reset()` 与 `init()` 两处写，重试代次一错就是互相掐；
 *     · offline-return.js:361 的 defer 排完 `setTimeout` 之后**没有任何句柄留底** ——
 *       排上了几次、到底跑没跑，事后查不出来（`stat.lastReason='deferred'` 之后断了线）。
 *   现场缺口实测：`timerToken` / `Symbol(deviceId)` 这类代际形状在 core 与 engines **零命中**。
 *
 *   （同名形状在**设备侧**已被别的项目独立验证过：dsh-toy `src/runtime.ts:39-44` 的
 *   `StopTimer{ token: symbol, timer }`，`scheduleStop` 里先比代际 `current?.token !== token`
 *   不符即早退；全部传输操作再经 `exclusive()` 串进一条尾链。本模块把同一形状搬到通用延迟任务上。）
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   每个 key 持一个递增代际。排进队列时记下代际，真跑前先比：不是当前代 ⇒ 判 `stale` 早退，
 *   **不去碰定时器句柄**。同一 key 后一轮顶掉前一轮，但被顶掉的那一轮仍会醒来一次并如实归因。
 *   `serial()` 把所有操作串进同一条尾链，前一个没结束，后一个不进。
 *
 * ── 缝合边界（否定式，每条都有判据咬）───────────────��──────────────
 *   ① 总开关默认关闭。关闭时 `schedule()` 不复用槽、直接 `setTimeout` 且无代际校验，
 *      但**仍回令牌**（关着也能读回执，不至于调了不知道排没排上）。
 *   ② **过期回调只能早退，不能取消别人的定时器**：比对失败时只记 `stale`，不清槽。
 *   ③ 槽数与尾链都有硬顶（`maxSlots` / `maxQueue`），满了拒收 `slot-full` / `queue-full`，
 *      不默默挤掉——静默挤掉正是本模块要治的那个病。
 *   ④ 定时器**不泄漏**：跑完自删槽；`cancel` / `cancelAll` / `dispose` 都真 `clearTimeout`。
 *   ⑤ 回调抛错**不上抛**（延迟链上抛出去没人接），归因 `threw` 并计次；`serial` 里才上抛给调用方。
 *   ⑥ 纯内存，**不写 store**：它只给「排上了没有 / 跑没跑 / 跑的是不是这一代」三个判据，
 *      不替调用方存业务结果。
 *   ⑦ `schedule()` 与判定结果**分离回报**：返回值只讲队列事实（ok/token/reason），
 *      不问「该不该排」——那是调用点的业务判断。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_defertoken_settings_v1';
  const DEF = { enabled: false, minDelayMs: 0, maxSlots: 32, maxQueue: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'deferToken',
    bounds: { minDelayMs: [0, 60000], maxSlots: [4, 128], maxQueue: [1, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // 无 settingsBus 时（裸上下文 / 自测）落模块内影子，否则 saveSettings 是空转，
  //   连「开关打开后行为变化」都验不了 —— 那正是本模块全部边界的前提。
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }
  function saveSettings(next) {
    const val = Object.assign({}, DEF, next || {});
    if (!WA.settingsBus) { shadow = val; return val; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, val));
  }
  const stat = { scheduled: 0, fired: 0, stale: 0, cancelled: 0, threw: 0, refused: 0,
    serialed: 0, lastReason: '', lastKey: '' };
  const slots = {};   // key -> { token, timer, at, delayMs, site }
  const queueState = { tail: Promise.resolve(), depth: 0 };
  let seq = 0;

  function keyOf(k) {
    const s = (k === null || k === undefined) ? '' : String(k).replace(/\s+/g, ' ').trim();
    return s ? s.slice(0, 48) : '';
  }
  function delayOf(ms, cfg) {
    const n = Number(ms);
    const d = (isFinite(n) && n >= 0) ? Math.floor(n) : cfg.minDelayMs;
    return d < cfg.minDelayMs ? cfg.minDelayMs : d;
  }
  function slotCount() { return Object.keys(slots).length; }

  /**
   * 排一个延迟任务。
   * @param {string} key 槽名（同 key 后一轮顶掉前一轮）
   * @param {function} fn 回调（抛错不上抛，记 threw）
   * @param {number} ms 延迟毫秒
   * @param {object} [opt] { site }
   * @returns {{ok:boolean, reason?:string, token?:number|null, delayMs?:number}}
   */
  function schedule(key, fn, ms, opt) {
    const cfg = settings();
    const k = keyOf(key);
    if (!k) { stat.refused++; stat.lastReason = 'bad-key'; return { ok: false, reason: 'bad-key' };
    }
    if (typeof fn !== 'function') { stat.refused++; stat.lastReason = 'bad-callback'; return { ok: false, reason: 'bad-callback' }; }
    if (cfg.enabled) {
      const cur = slots[k];
      if (!cur && slotCount() >= cfg.maxSlots) {
        stat.refused++; stat.lastReason = 'slot-full';
        return { ok: false, reason: 'slot-full', limit: cfg.maxSlots };
      }
      // ② 不 clearTimeout 前一代表：让旧的回调自然醒来自己验代际早退。
      //    clear 掉的后果是那一代永远醒不来，代际比对就退化成「谁最后排谁赢」；
      //    保留它反而多一次可观测的 stale。（真取消走 cancel()。）
    }
    const delay = delayOf(ms, cfg);
    const tok = cfg.enabled ? (++seq) : null;
    const timer = setTimeout(function () {
      fire(k, tok, fn, opt);
    }, delay);
    if (cfg.enabled) slots[k] = { token: tok, timer: timer, at: clockNow('deferToken.schedule'),
      delayMs: delay, site: (opt && opt.site) ? String(opt.site).slice(0, 40) : '' };
    else delete slots[k];
    stat.scheduled++; stat.lastKey = k; stat.lastReason = 'scheduled';
    return { ok: true, token: tok, delayMs: delay };
  }

  function fire(k, tok, fn, opt) {
    const cfg = settings();
    // 用「排进时的开关」判代际，不是触发时的：关闭时排进去的令牌是 null，
    //   若中途开了闸又按触发时状态校验，那条回调永远对不上槽而白丢。
    if (tok !== null) {
      const cur = slots[k];
      // ② 过期回调只早退：不是当前代就绝不碰槽
      if (!cur || cur.token !== tok) {
        stat.stale++; stat.lastReason = 'stale';
        return { ok: false, reason: 'stale', token: tok };
      }
      delete slots[k];
    }
    stat.fired++;
    try {
      fn({ key: k, token: tok, site: (opt && opt.site) || '' });
    } catch (e) {
      stat.threw++; stat.lastReason = 'threw';
      try { if (WA.log) WA.log('deferToken:threw', k, e && e.message); } catch (e2) {}
    }
    return { ok: true };
  }

  /** 取消一个槽。不存在则 cancelled:false（不是错，只是没东西可取消）。 */
  function cancel(key) {
    const k = keyOf(key);
    const cur = k ? slots[k] : null;
    if (!cur) return { ok: true, cancelled: false };
    if (cur.timer) clearTimeout(cur.timer);
    delete slots[k];
    stat.cancelled++;
    return { ok: true, cancelled: true };
  }

  function cancelAll() {
    const n = slotCount();
    Object.keys(slots).forEach(function (k) { if (slots[k].timer) clearTimeout(slots[k].timer); delete slots[k]; });
    stat.cancelled += n;
    return { ok: true, cancelled: n };
  }

  /** 释放：取消全部并把串行链复位（链本身不可取消，只能断开引用）。 */
  function dispose() {
    const r = cancelAll();
    queueState.tail = Promise.resolve();
    queueState.depth = 0;
    return r;
  }

  /**
   * 串行：同一条尾链上排队，前一个结束（成功或抛错）才轮到后一个。
   * 与 schedule 的正交处：schedule 管「晚点再跑」，serial 管「按顺序跑」。
   * 注意：**拒收不 reject，只是 resolve 一个 {ok:false}** —— 调用方要自己看一眼，
   *   否则会把拒收对象当成上一个函数的返回值。真正的抛错才 reject。
   */
  function serial(fn) {
    const cfg = settings();
    if (typeof fn !== 'function') return Promise.resolve({ ok: false, reason: 'bad-callback' });
    if (queueState.depth >= cfg.maxQueue) {
      stat.refused++; stat.lastReason = 'queue-full';
      return Promise.resolve({ ok: false, reason: 'queue-full', limit: cfg.maxQueue });
    }
    queueState.depth++;
    stat.serialed++;
    const run = function () {
      try { return Promise.resolve(fn()); }
      catch (e) { return Promise.reject(e); }
    };
    const p = queueState.tail.then(run, run);
    // 尾链不因单次失败而断：失败照抛给调用方，但链本身续在 settle 上
    queueState.tail = p.then(function () {}, function () {}).then(function () { queueState.depth--; });
    return p;
  }

  function pending() {
    return Object.keys(slots).map(function (k) {
      const r = slots[k] || {};
      return { key: k, token: r.token, delayMs: r.delayMs, site: r.site };
    });
  }
  function statOf() { return Object.assign({}, stat); }

  WA.deferToken = { schedule: schedule, cancel: cancel, cancelAll: cancelAll, dispose: dispose,
    serial: serial, pending: pending, stat: statOf, settings: settings, saveSettings: saveSettings,
    REG: __REG, DEF: DEF };
})();
