/**
 * WorldAxis engines/takeover-yield.js (v2.417.0) — OPV25-2 接管让路可见提示
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   本仓有大量「接管」形态：`director` 接管叙事、`oracle` 接管走向、
 *   `backstage` 接管幕后推演、`interceptor` 接管请求。它们在接管时**不告诉宿主**
 *   「我这会儿在占着」，宿主那边看到的是**一片空白**——用户不知道是在算、还是卡死了。
 *   实测 `grep -rn '接管让路\|yieldNotice\|takeoverHint' engines/` —— 430 引擎 0 命中。
 *
 *   后果：引擎重活期间界面无提示，用户以为崩了；更糟的是**接管与宿主渲染抢同一层**，
 *   于是「引擎在推进」和「宿主在刷新」互相踩，表现为正文忽然回退、或消息重复。
 *   本模块给这件事一个**可见的、非阻塞的**说法：谁在占、要占多久、宿主该不该让、让到什么时候。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `yieldFor({holder, scope, estMs, reason})` 声明「我要占用一段」→ 回执里给
 *   **显式可见文案**（不是空白）与 `blocking:false`（宿主不该阻塞等待，应让路而非停摆）→
 *   `release({token})` 收工。`holds()` 只读现状。**超时不自动清净**：过期条目照样亮着，
 *   标 `stale:true`，让调用方看见「有人占着且早该回来了」——静默清理会把真卡死藏起来。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不接管任何真实渲染：本模块只产出**说法**，让不让路是宿主的事。
 *   ② 不写 store、不改时间轴。
 *   ③ 并发占位有界（默认 16），超出拒收而不是挤掉别人 —— 挤掉会让在跑的活无声丢提示。
 *   ④ 拒收码只用 disabled / missing-holder / missing-token / unknown-token / too-many-holds。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const wallNow = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_takeover_yield_settings_v1';
  const DEF = { enabled: true, maxHolds: 16, staleMs: 8000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'takeoverYield',
    bounds: { maxHolds: [2, 64], staleMs: [1000, 120000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const SCOPES = ['narration', 'oracle', 'backstage', 'request', 'render'];
  const stat = { holds: 0, released: 0, staleHits: 0, refused: 0, lastReason: '' };
  const HOLDS = []; // {token, holder, scope, estMs, reason, at, note}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  /** 可见文案：必须说清「谁、在干什么、大概多久」，而不是留空。 */
  function textOf(h, now) {
    const spent = Math.max(0, now - h.at);
    const left = h.estMs == null ? null : Math.max(0, h.estMs - spent);
    const parts = [];
    parts.push(h.holder + ' 正在处理' + (h.reason ? '（' + h.reason + '）' : ''));
    if (left !== null) {
      parts.push(left > 0 ? '预计还需约 ' + Math.ceil(left / 1000) + ' 秒' : '已超出预计时长，仍在进行');
    } else {
      parts.push('时长未估计');
    }
    parts.push('界面照常可用，稍候即可');
    return parts.join('，');
  }
  function staleOf(h, now, staleMs) {
    if (h.estMs == null) return (now - h.at) > staleMs;
    return (now - h.at) > (h.estMs + staleMs);
  }
  function yieldFor(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const holder = str(s.holder);
    if (!holder) { stat.refused++; stat.lastReason = 'missing-holder';
      return { ok: false, hint: 'missing-holder：谁在占用？没有名字的占用等于空白' }; }
    if (HOLDS.length >= cfg.maxHolds) { stat.refused++; stat.lastReason = 'too-many-holds';
      return { ok: false, hint: 'too-many-holds：同时占用已达上限（' + cfg.maxHolds + '），不挤掉别人——先 release 或查 stale' }; }
    const scope = SCOPES.indexOf(str(s.scope)) >= 0 ? str(s.scope) : 'narration';
    const now = wallNow();
    const h = { token: 'ty' + (++stat.holds) + '-' + holder, holder: holder, scope: scope,
      estMs: num(s.estMs), reason: str(s.reason), at: now, note: str(s.note) };
    HOLDS.push(h);
    return { ok: true, token: h.token, scope: scope,
      blocking: false,
      yield: true,
      text: textOf(h, now),
      hint: '宿主不该停摆等待：显式提示、让路、照常可用' };
  }
  function release(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const token = str(s.token);
    if (!token) { stat.refused++; stat.lastReason = 'missing-token'; return { ok: false, hint: 'missing-token：要放掉哪一段占用？' }; }
    const idx = HOLDS.findIndex(function (h) { return h.token === token; });
    if (idx < 0) { stat.refused++; stat.lastReason = 'unknown-token'; return { ok: false, hint: 'unknown-token：没有这个占用' }; }
    const h = HOLDS.splice(idx, 1)[0];
    stat.released++;
    const now = wallNow();
    return { ok: true, token: token, holder: h.holder, scope: h.scope, spentMs: now - h.at };
  }
  /** 只读现状：过期不自动清净，如实标 stale。 */
  function holds(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    const now = wallNow();
    const rows = HOLDS.map(function (h) {
      const stale = staleOf(h, now, cfg.staleMs);
      if (stale) stat.staleHits++;
      return { token: h.token, holder: h.holder, scope: h.scope, estMs: h.estMs,
        spentMs: now - h.at, stale: stale, reason: h.reason,
        text: textOf(h, now), blocking: false };
    });
    const anyStale = rows.some(function (r) { return r.stale; });
    return { ok: true, count: rows.length, staleCount: rows.filter(function (r) { return r.stale; }).length,
      anyStale: anyStale, rows: rows,
      hint: anyStale ? '有人占着且已超出预计：不是空白，是卡住了——去看是谁' : (rows.length ? '' : '当前没人占用') };
  }
  function statView() {
    return Object.assign({ active: HOLDS.length }, stat);
  }
  function reset() {
    HOLDS.length = 0;
    stat.holds = 0; stat.released = 0; stat.staleHits = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.takeoverYield = {
    yieldFor: yieldFor, release: release, holds: holds,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings,
    SCOPES: SCOPES.slice()
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/takeover-yield.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/takeover-yield 已加载（2.417.0）');
})();