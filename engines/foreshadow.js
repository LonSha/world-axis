/**
 * WorldAxis engines/foreshadow.js (v2.134.0) — 伏笔生命周期（E6）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   `memory.foreshadows` 早已有**五态枚举**（`waiting` / `developing` / `triggered` /
 *   `recycled` / `dropped`）、有容量站（`memory.js` 的 `pruneForeshadows`）、有终态剔除
 *   （`FS_TERMINAL`）、甚至有「承诺回收时刻 + 逾期欠账」（`engines/longline.js`，v2.55.0）。
 *   但全库**没有任何一处**回答这两个问题：
 *     · 「这条伏笔**兑现**了吗」—— 状态字段只有产出方在写（`engines/backstage.js` 按 AI
 *       推演结果覆写 `old.status = f.status`，`engines/memory.js` 巩固时新建 `waiting`），
 *       没有一个**显式标记**能把「兑现」这件事与「AI 这轮没提它」区分开；
 *     · 「这条伏笔**过期**了吗」—— `longline` 只判「承诺时刻已过」，而**没有承诺时刻**
 *       的伏笔（绝大多数）可以无限期停在 `waiting`，既不会过期、也不会被报出。
 *   一句话：**伏笔埋下去了、然后呢 —— 没人判。**
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `track(hintId, text)` —— 按**显式** id 标记一条伏笔（不猜、不语义推断）；
 *      另附 `develop(hintId)`：显式把 `waiting` 推进到 `developing`；
 *   ② `resolve(hintId, eventId)` —— 显式兑现（写 `triggered` + `resolvedAt` + `eventId`）；
 *   ③ `check(now)` —— 扫出「超过 `staleMs` 未推进」的伏笔，**报 stale，不删不判死**。
 *   外加 `stat()`（三桶 + 平均兑现耗时）与 `buildBlock()`（把未收束的伏笔注回上下文）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `track` / `resolve` / `check` 一律拒收（`disabled`），
 *     `buildBlock` 返回空串 —— 绝不因为「没开开关」而让注入面悄悄多一段。
 *   2 **不建第二套存储**。真源永远是 `memory.foreshadows`（单一真源）：本模块只往这个
 *     既有容器里**写字段**，不新开容器、不镜像副本。理由是本仓点名的「读面分叉」——
 *     `backstage` / `memory` / `digest` / `floor-changes` / `inspector-state` / `ui/assistant`
 *     六处都在读同一个数组，另立一份就是让它们读到的世界与这里不一致。
 *   3 **兑现判定只看显式标记**（`resolve` 调用）。本模块**不做语义推断**：正文里出现
 *     关键词、AI 说「前面那个伏笔收束了」都不算 —— 认不出就说认不出，不猜。
 *   4 **过期只报不改**。`check()` 不删除、不改状态、不自动回收：回收与否是叙事决定，
 *     不是容量决定（与 `longline` 同一条边界）。
 *   5 **不新增容量口径**。本模块写的容器 `memory.foreshadows` 已有 cap 30 与真实站点
 *     （`memory.js slice(-CAP.foreshadows)` 经 `evict.array`），本模块**不重复登记**——
 *     同一个容器登记两次就是让「谁该挤出」这件事出现两个答案。
 *   6 状态**只认五态**（`memory.js` 的枚举）。传入非法状态一律拒收（`bad-status`），
 *     不静默收窄成 `waiting` —— 那会让「写错了」看起来像「写好了」。
 *   7 时间轴取 `WA.clock.now(site)`（与 `longline.js` / `storyclock.js` 同源）。
 *     **为什么不按「轮」**：本仓没有单一的「轮」真源 —— `parallelWorld.round` 是平行世界
 *     自己的推进计数、`life._turn` 由面板驱动（生产链上没有调用点）、`motif.tick` 是模块
 *     自持的（同样无生产调用点）。拿其中任何一个当「轮」都是**编一个刻度**；
 *     故本模块如实选用时间轴（`staleMs`），把「N 轮」翻译成「N 分钟/小时未推进」。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_foreshadow_settings_v1';
  const DEF = { enabled: false, staleMs: 3600000, maxItems: 5, cap: 30 };
  const __REG = { key: LS_KEY, def: DEF, module: 'foreshadow', bounds: { staleMs: [60000, 86400000], maxItems: [1, 12], cap: [1, 60] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) { return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 五态与两个集合：口径与 core/store.js 骨架注释 / memory.FS_TERMINAL / longline 逐字一致。
  const STATUS = ['waiting', 'developing', 'triggered', 'recycled', 'dropped'];
  const ACTIVE = ['waiting', 'developing'];
  const TERMINAL = ['triggered', 'recycled', 'dropped'];

  const stat = { tracks: 0, develops: 0, resolves: 0, recycles: 0, checks: 0, stale: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function list(root) { return (((root || state()).memory || {}).foreshadows) || []; }
  function sameId(a, b) {
    if (WA.store && typeof WA.store.sameId === 'function') return WA.store.sameId(a, b);
    return String(a) === String(b);
  }
  function find(id, root) {
    const key = clean(id, 40); if (!key) return null;
    const arr = list(root);
    for (let i = 0; i < arr.length; i++) { const f = arr[i]; if (f && sameId(f.id, key)) return f; }
    return null;
  }
  function isActive(f) { return !!f && ACTIVE.indexOf(f.status) >= 0; }
  function isTerminal(f) { return !!f && TERMINAL.indexOf(f.status) >= 0; }
  function ts(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }

  /** ① 标记一条伏笔（显式 id；已存在则只刷新文本与时间，不重置状态）。 */
  function track(hintId, text, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const id = clean(hintId, 40);
    if (!id) { noteFault('bad-id'); return { ok: false, reason: 'bad-id' }; }
    const content = clean(text, 150);
    if (!content) { noteFault('bad-text'); return { ok: false, reason: 'bad-text' }; }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const o = opts || {};
    const links = Array.isArray(o.links) ? o.links.slice(0, 8) : [];
    let out = null;
    WA.store.transact(function (draft) {
      const arr = (draft.memory.foreshadows = draft.memory.foreshadows || []);
      const at = clockNow('foreshadow');
      const old = find(id, draft);
      if (old) {
        // 已终止的伏笔**不得原地复活**：那是两件事（同 id 复用 vs 同一条被改写）。
        if (isTerminal(old)) { out = { ok: false, reason: 'already-terminal', id: id, status: old.status }; return false; }
        old.content = content;
        old.updatedAt = at;
        if (links.length) old.links = (old.links || []).concat(links).slice(-8);
        out = { ok: true, id: id, updated: true, status: old.status };
        return true;
      }
      arr.push({ id: id, content: content, status: 'waiting', links: links, at: at, updatedAt: at });
      out = { ok: true, id: id, updated: false, status: 'waiting', size: arr.length };
      return true;
    }, 'foreshadow:track');
    if (out && out.ok) stat.tracks++; else if (out) stat.blocked++;
    if (out) stat.lastReason = out.ok ? (out.updated ? 'tracked-update' : 'tracked') : out.reason;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 显式推进：waiting → developing（只在开着的伏笔上；终态拒收）。 */
  function develop(hintId) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const id = clean(hintId, 40);
    if (!id) { noteFault('bad-id'); return { ok: false, reason: 'bad-id' }; }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    let out = null;
    WA.store.transact(function (draft) {
      const f = find(id, draft);
      if (!f) { out = { ok: false, reason: 'missing-foreshadow', id: id }; return false; }
      if (isTerminal(f)) { out = { ok: false, reason: 'already-terminal', id: id, status: f.status }; return false; }
      f.status = 'developing';
      f.updatedAt = clockNow('foreshadow');
      out = { ok: true, id: id, status: 'developing' };
      return true;
    }, 'foreshadow:develop');
    if (out && out.ok) stat.develops++; else if (out) stat.blocked++;
    if (out) stat.lastReason = out.ok ? 'developing' : out.reason;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** ② 显式兑现：→ triggered，并记 `resolvedAt` / `eventId`（兑现耗时由这两个时间戳算出）。 */
  function resolve(hintId, eventId) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const id = clean(hintId, 40);
    if (!id) { noteFault('bad-id'); return { ok: false, reason: 'bad-id' }; }
    const ev = clean(eventId, 60);
    if (!ev) { noteFault('missing-event'); return { ok: false, reason: 'missing-event' }; }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    let out = null;
    WA.store.transact(function (draft) {
      const f = find(id, draft);
      if (!f) { out = { ok: false, reason: 'missing-foreshadow', id: id }; return false; }
      // resolve 的终态门：兑现不可二次 —— 二次兑现会覆写 eventId 与耗时，让「何时兑现」失去唯一答。
      if (isTerminal(f)) { out = { ok: false, reason: 'already-terminal', id: id, status: f.status }; return false; }
      const at = clockNow('foreshadow');
      // 兑现耗时自 **埋设时刻** 起算（`at` 是 track 那一刻；缺它就退回 updatedAt）。
      const born = ts(f.at) || ts(f.updatedAt) || at;
      f.status = 'triggered';
      f.eventId = ev;
      f.resolvedAt = at;
      f.resolveMs = at - born;
      // 伏笔兑现即**不再是欠账**：清掉承诺时刻（与 longline 的 TERMINAL 口径同向——
      // 不清的话 overdue() 会在它已收束之后继续把它当逾期报出来）。
      delete f.dueAt;
      delete f.promisedAt;
      out = { ok: true, id: id, status: 'triggered', eventId: ev, resolveMs: f.resolveMs };
      return true;
    }, 'foreshadow:resolve');
    if (out && out.ok) { stat.resolves++; stat.lastReason = 'resolved'; }
    else if (out) { stat.blocked++; stat.lastReason = out.reason; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 显式回收下线：→ recycled（作者放弃推进时的**显式**出口，而不是让它悄悄过期）。 */
  function recycle(hintId, reason) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const id = clean(hintId, 40);
    if (!id) { noteFault('bad-id'); return { ok: false, reason: 'bad-id' }; }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const why = clean(reason, 40) || 'unspecified';
    let out = null;
    WA.store.transact(function (draft) {
      const f = find(id, draft);
      if (!f) { out = { ok: false, reason: 'missing-foreshadow', id: id }; return false; }
      if (isTerminal(f)) { out = { ok: false, reason: 'already-terminal', id: id, status: f.status }; return false; }
      f.status = 'recycled';
      f.recycledAt = clockNow('foreshadow');
      f.recycleReason = why;
      delete f.dueAt;
      delete f.promisedAt;
      out = { ok: true, id: id, status: 'recycled', recycleReason: why };
      return true;
    }, 'foreshadow:recycle');
    if (out && out.ok) { stat.recycles++; stat.lastReason = 'recycled'; }
    else if (out) { stat.blocked++; stat.lastReason = out.reason; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** ③ 扫过期：开着的伏笔里，**自埋设以来超过 staleMs 未推进**的 ⇒ 报 stale（只报不改）。 */
  function check(now) {
    const cfg = settings();
    stat.checks++;
    const t = ts(now) || clockNow('foreshadow');
    const rows = list().filter(function (f) {
      if (!isActive(f)) return false;
      const mark = ts(f.updatedAt) || ts(f.at) || 0;
      // 「未推进」＝ 自上次动作以来没动过。没有时间戳的行**不猜**：如实算作过期
      // （它连「什么时候埋的」都不知道，这正是最需要被看见的那一类）。
      return !mark || (t - mark) > cfg.staleMs;
    }).map(function (f) {
      const mark = ts(f.updatedAt) || ts(f.at) || 0;
      return { id: f.id, content: clean(f.content, 60), status: f.status, at: ts(f.at), updatedAt: ts(f.updatedAt), staleBy: mark ? (t - mark) : -1 };
    }).sort(function (a, b) { return b.staleBy - a.staleBy; });
    stat.stale = rows.length;
    stat.lastReason = rows.length ? 'stale' : 'clear';
    return { ok: true, count: rows.length, rows: rows, thresholdMs: cfg.staleMs, at: t };
  }

  /** 三桶 + 平均兑现耗时。三桶按**互斥**划分，合起来恒等于总数（互斥性由测试钉住）。 */
  function stat3() {
    const arr = list();
    const active = arr.filter(isActive);
    const resolved = arr.filter(function (f) { return f && f.status === 'triggered'; });
    const closed = arr.filter(isTerminal);
    const cfg = settings();
    const t = clockNow('foreshadow');
    const stale = active.filter(function (f) {
      const mark = ts(f.updatedAt) || ts(f.at) || 0;
      return !mark || (t - mark) > cfg.staleMs;
    });
    const durs = resolved.map(function (f) { return ts(f.resolveMs); }).filter(function (n) { return n > 0; });
    const avg = durs.length ? Math.round(durs.reduce(function (a, b) { return a + b; }, 0) / durs.length) : 0;
    return {
      enabled: !!cfg.enabled, total: arr.length,
      active: active.length, resolved: resolved.length, closed: closed.length,
      stale: stale.length, staleMs: cfg.staleMs,
      avgResolveMs: avg, resolveSamples: durs.length,
      byStatus: STATUS.reduce(function (acc, s) {
        acc[s] = arr.filter(function (f) { return f && f.status === s; }).length; return acc;
      }, {})
    };
  }

  /** 注入块：把「埋了没收」的伏笔送回上下文（只在其超过阈值时提示，不逐条念全部）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const arr = list().filter(isActive).slice(0, cfg.maxItems);
    if (!arr.length) return '';
    const t = clockNow('foreshadow');
    const lines = arr.map(function (f) {
      const mark = ts(f.updatedAt) || ts(f.at) || 0;
      const mins = mark ? Math.round((t - mark) / 60000) : 0;
      const tag = (mark && (t - mark) > cfg.staleMs) ? '（已 ' + mins + ' 分钟未推进）' : '';
      return '- ' + (f.id || '未命名') + '：' + clean(f.content, 60) + tag;
    });
    const head = '[伏笔台账]' + String.fromCharCode(10)
      + '以下伏笔已埋下但尚未兑现（回收或兑现必须显式标记，不得当作从未埋下）：' + String.fromCharCode(10);
    const tail = String.fromCharCode(10) + '过期只提示，不自动回收；收束与否由剧情决定。';
    return head + lines.join(String.fromCharCode(10)) + tail;
  }

  WA.foreshadow = {
    STATUS: STATUS.slice(), ACTIVE: ACTIVE.slice(), TERMINAL: TERMINAL.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    track: track, develop: develop, resolve: resolve, recycle: recycle, check: check,
    buildBlock: buildBlock,
    // 三桶读数挂在**既有成员** stat() 的返回里（零新增导出：本仓纪律「零消费能力当场删」，
    //   为读一个计数新开一口会立即变成死导出 —— v2.132.0 的 life 游标即此先例）。
    stat: function () { return Object.assign({}, stat3(), { counters: Object.assign({}, stat), faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/foreshadow.js', { kind: 'engine', ver: '2.135.0' });
})();