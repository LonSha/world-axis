/**
 * WorldAxis engines/save-throttle.js (v2.417.0) — OPV25-5 存盘节流与尾随补存
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   本仓存盘有两条路：
 *     · `core/store.js` 的 `save()` / `transact()`——**每次写都真落盘**；
 *     · `bridge.flushDirtySnapshots()`（v2.x）——把脏快照推给目标插件，**一次也不省**。
 *   实测 `grep -rn '存盘节流\|saveThrottle\|trailingFlush' core/ engines/` —— 0 命中。
 *
 *   后果：一轮生成里如果有 20 处小写（时间前进、心情变了一点、看过的东西记一笔），
 *   就是 20 次全量刷盘。宿主那边表现为**卡顿与写入风暴**，而其中绝大多数写
 *   **马上会被下一次写覆盖** —— 白刷。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `note({key, at})` 记账「这个键脏了」，窗口内**合并**（同键只留最后一次）→
 *   `due({now})` 回答「窗口到了没、该刷哪些键」→ `flush({keys})` 真刷并出回执 →
 *   `trailing({at})` 关窗时的**尾随补存**：窗口最后一刻进来的脏键，必须再补一次，
 *   否则它要等下个窗口 —— 那一次丢失就是真的丢。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不真的写盘：本模块只决定**何时刷、刷哪些**，写由调用方执行（无写不落盘的责任仍在调用方）。
 *   ② 尾随补存**不许省**：只要关窗时还有脏键，就必须再给一次 flush —— 这是本模块的核心判据。
 *   ③ 合并只对同键生效；不同键一律保留（不能因为「只刷一个」把别人的脏丢下）。
 *   ④ 拒收码只用 disabled / missing-key / window-not-due。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const wallNow = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_save_throttle_settings_v1';
  const DEF = { enabled: true, windowMs: 1200, maxKeys: 256 };
  const __REG = { key: LS_KEY, def: DEF, module: 'saveThrottle',
    bounds: { windowMs: [100, 10000], maxKeys: [16, 1024] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { noted: 0, merged: 0, flushes: 0, flushedKeys: 0, trailingFlushes: 0, refused: 0, lastReason: '' };
  const DIRTY = {}; // key -> {key, firstAt, lastAt, hits}
  const ORDER = [];
  let windowStart = null;
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function keyList() { return ORDER.filter(function (k) { return DIRTY[k]; }); }
  function trimCap(cap) {
    while (ORDER.length > cap) {
      const victim = ORDER.shift();
      if (victim && DIRTY[victim]) delete DIRTY[victim];
    }
  }
  function note(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const keys = Array.isArray(s.keys) ? s.keys.map(str).filter(Boolean)
      : (str(s.key) ? [str(s.key)] : []);
    if (!keys.length) { stat.refused++; stat.lastReason = 'missing-key';
      return { ok: false, hint: 'missing-key：哪个键脏了？没键就没法合并' }; }
    const at = num(s.at) || wallNow();
    if (windowStart === null) windowStart = at;
    let merged = 0, fresh = 0;
    keys.forEach(function (k) {
      if (DIRTY[k]) { DIRTY[k].lastAt = at; DIRTY[k].hits++; merged++; stat.merged++; }
      else { DIRTY[k] = { key: k, firstAt: at, lastAt: at, hits: 1 }; ORDER.push(k); fresh++; }
      stat.noted++;
    });
    trimCap(cfg.maxKeys);
    return { ok: true, keys: keys, fresh: fresh, merged: merged,
      dirtyCount: keyList().length, windowStart: windowStart,
      hint: merged ? '合并生效：同键只留最后一次，前面的写本来也会被覆盖' : '' };
  }
  /** 窗口到了没、该刷哪些。 */
  function due(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    const now = num(s.at) || wallNow();
    const keys = keyList();
    const elapsed = windowStart === null ? 0 : (now - windowStart);
    const isDue = keys.length > 0 && (windowStart === null || elapsed >= cfg.windowMs);
    return { ok: true, due: isDue, elapsedMs: elapsed, windowMs: cfg.windowMs,
      keys: keys, dirtyCount: keys.length,
      hint: keys.length && !isDue ? '还没到窗口：再攒一会儿，同键会被合并' : (keys.length ? '' : '没有脏键') };
  }
  /** 真刷（由调用方执行写入，这里出回执）。 */
  function flush(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const want = Array.isArray(s.keys) ? s.keys.map(str).filter(Boolean) : keyList();
    if (!want.length) return { ok: true, flushed: [], flushCount: 0, hint: '没有脏键可刷' };
    const touched = [];
    const mergedAway = [];
    want.forEach(function (k) {
      if (!DIRTY[k]) return;
      touched.push(k);
      const rec = DIRTY[k];
      delete DIRTY[k];
      const i = ORDER.indexOf(k);
      if (i >= 0) ORDER.splice(i, 1);
      if (rec.hits > 1) mergedAway.push({ key: k, saved: rec.hits - 1 });
    });
    stat.flushes++; stat.flushedKeys += touched.length;
    windowStart = num(s.at) || wallNow();
    const left = keyList();
    return { ok: true, flushed: touched, flushCount: touched.length,
      merged: mergedAway, remaining: left,
      hint: left.length ? ('remaining：窗口期间又进来的 ' + left.length + ' 个键还在脏着 —— 关窗前必须补刷') : '' };
  }
  /** 尾随补存：关窗时必须再给一次 —— 这一条不许省。 */
  function trailing(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const keys = keyList();
    if (!keys.length) {
      windowStart = null;
      return { ok: true, needed: false, flushed: [], hint: '关窗时没有残留脏键：这次没有尾随要补' };
    }
    const at = num(s.at) || wallNow();
    stat.trailingFlushes++;
    const rec = flush({ keys: keys, at: at });
    windowStart = num(s.at) || wallNow();
    return { ok: true, needed: true, flushed: rec.flushed, flushCount: rec.flushCount,
      hint: '尾随补存：关窗前后进来的脏键已经补刷一遍 —— 不补这一次，它就要等下个窗口' };
  }
  function view() {
    const keys = keyList();
    return { ok: true, dirtyCount: keys.length, windowStart: windowStart,
      rows: keys.map(function (k) { return { key: k, hits: DIRTY[k].hits, firstAt: DIRTY[k].firstAt, lastAt: DIRTY[k].lastAt }; }) };
  }
  function statView() { return Object.assign({ dirty: keyList().length }, stat); }
  function reset() {
    Object.keys(DIRTY).forEach(function (k) { delete DIRTY[k]; });
    ORDER.length = 0; windowStart = null;
    stat.noted = 0; stat.merged = 0; stat.flushes = 0; stat.flushedKeys = 0;
    stat.trailingFlushes = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.saveThrottle = {
    note: note, due: due, flush: flush, trailing: trailing, view: view,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/save-throttle.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/save-throttle 已加载（2.417.0）');
})();