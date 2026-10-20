/**
 * WorldAxis engines/auto-hide.js (v2.230.0) — 隐藏楼层
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓 `archive-hide` 管的是「**哪些楼有逐楼记忆覆盖** ⇒ 可隐藏」
 *   （依据记忆覆盖判可隐藏），但**不负责记「我已经把它隐藏了没有」**：
 *   现场实测：隐藏动作落点（`自动隐藏` / `autoHide` / `hiddenFloors`）在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：判定与动作之间没有一本账 —— 判过「可隐藏」不等于隐藏过，
 *   重掷 / 切分支后「哪些楼已经藏起来」回答不了。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 world-backstage 的 auto-hide.js：
 *     · **保留最近 N 楼**：只隐藏「最近 N 楼之外」的楼（`keepRecent` 有上下界）；
 *     · 已隐藏楼**有独立账本**（`auto_hidden` 一份记录，可查可撤）；
 *     · **只记自己隐藏过的**：别人 / 宿主自己隐藏的楼不在本账里（不冒领）。
 *   本模块只取其中**可判定的那一层**（保留窗 + 账本 + 增撤）；
 *   真正的 `/hide` 调用由宿主做，本模块只出**该隐藏的清单**并记账。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · archive-hide —— 「哪些楼**可**隐藏」（依据记忆覆盖），本模块不动它的判据；
 *   · timeline —— 「记忆出自哪一楼」，本模块不碰溯源；
 *   · 本模块 —— **保留窗 + 隐藏账本 + 该隐藏清单 + 撤销**（零宿主调用）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时计划 / 记账一律 `disabled`。
 *   ② **保留窗有上下界**：`keepRecent` 越界一律夹到边界并如实报 `clamped`。
 *   ③ **只计划不执行**：`plan` 恒 `executed:0`（本模块不调宿主的隐藏口）。
 *   ④ **别人的隐藏不冒领**：只记 `via` 由本模块产生的那些楼。
 *   ⑤ **楼层必须是正整数**：非正整数 ⇒ `bad-floor`（不认 `0`/负数/小数）。
 *   ⑥ **撤销只撤自己的**：`revoke` 对不在本账的楼层 ⇒ `not-owned`。
 *   ⑦ 台账**有硬上限**（FIFO 挤出最旧），挤出计数如实报。
 *   ⑧ 不落盘、不跨会话（隐藏是单会话内的动作账）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_auto_hide_settings_v1';
  const DEF = { enabled: false, keepRecent: 5, minKeepRecent: 0, maxKeepRecent: 100, maxLedger: 400 };
  const __REG = { key: LS_KEY, def: DEF, module: 'autoHide',
    bounds: { keepRecent: [0, 100], maxLedger: [8, 4000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const HIDDEN_KEY = 'world_backstage_auto_hidden';
  const VIA = ['auto-window', 'manual'];
  const VIA_LABEL = { 'auto-window': '保留窗自动', manual: '手动' };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    merged.keepRecent = Math.min(merged.maxKeepRecent, Math.max(merged.minKeepRecent, Math.floor(Number(merged.keepRecent) || 0)));
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, merged) : merged;
  }
  function saveSettings(next) {
    const raw = Object.assign({}, DEF, next || {});
    const clamped = Math.min(raw.maxKeepRecent, Math.max(raw.minKeepRecent, Math.floor(Number(raw.keepRecent) || 0)));
    const clampedFlag = clamped !== Math.floor(Number(raw.keepRecent));
    const out = WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, raw)) : raw;
    return Object.assign({}, out || {}, { clamped: clampedFlag, keepRecent: clamped });
  }

  const stat = { planned: 0, hidden: 0, revoked: 0, evicted: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : String(v == null ? '' : v).slice(0, max || 40); }

  const LEDGER = { rows: [] };   // [{ floor, via, at }]

  function floorOf(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && Math.floor(n) === n ? n : null;
  }
  /** 保留窗：返回「最近 keepRecent 楼之外、且未被本账已记」的该隐藏清单。 */
  function plan(totalFloors, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const total = floorOf(totalFloors);
    if (total === null) return refuse('bad-total');
    const keep = (opts && Number.isFinite(Number(opts.keepRecent))) ? Math.floor(Number(opts.keepRecent)) : cfg.keepRecent;
    const clamped = keep !== cfg.keepRecent;
    const k = Math.min(cfg.maxKeepRecent, Math.max(cfg.minKeepRecent, keep));
    const cutoff = total - k;
    const owned = LEDGER.rows.reduce(function (acc, r) { acc[r.floor] = 1; return acc; }, {});
    const targets = [];
    for (let f = 1; f <= cutoff; f++) if (!owned[f]) targets.push(f);
    stat.planned++;
    return { ok: true, reason: 'ok', keepRecent: k, clamped: clamped, cutoff: cutoff > 0 ? cutoff : 0,
      targets: targets, targetCount: targets.length, executed: 0, ledgerKey: HIDDEN_KEY, via: VIA[0] };
  }
  /** 记账：只记本模块隐藏的那些楼。 */
  function mark(floors, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const list = Array.isArray(floors) ? floors : [floors];
    if (!list.length) return refuse('empty-floors');
    const o = opts || {};
    const via = VIA.indexOf(clean(o.via, 20)) >= 0 ? clean(o.via, 20) : VIA[0];
    const added = []; const skipped = [];
    list.forEach(function (v) {
      const f = floorOf(v);
      if (f === null) { skipped.push({ floor: v, why: 'bad-floor' }); return; }
      if (LEDGER.rows.some(function (r) { return r.floor === f; })) { skipped.push({ floor: f, why: 'already' }); return; }
      LEDGER.rows.push({ floor: f, via: via, at: clockNow('autoHide') });
      added.push(f);
    });
    if (!added.length) return refuse('nothing-added');
    LEDGER.rows.sort(function (a, b) { return a.floor - b.floor; });
    let evicted = 0;
    while (LEDGER.rows.length > cfg.maxLedger) { LEDGER.rows.shift(); evicted++; }
    stat.hidden += added.length; stat.evicted += evicted;
    return { ok: true, reason: 'ok', added: added, addedCount: added.length, skipped: skipped,
      evicted: evicted, kept: LEDGER.rows.length, cap: cfg.maxLedger, via: via, viaLabel: VIA_LABEL[via] };
  }
  /** 撤销：只撤本账的楼（别人的隐藏不冒领）。 */
  function revoke(floors) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const list = Array.isArray(floors) ? floors : [floors];
    const out = []; const notOwned = [];
    list.forEach(function (v) {
      const f = floorOf(v);
      if (f === null) { notOwned.push({ floor: v, why: 'bad-floor' }); return; }
      const i = LEDGER.rows.findIndex(function (r) { return r.floor === f; });
      if (i < 0) { notOwned.push({ floor: f, why: 'not-owned' }); return; }
      LEDGER.rows.splice(i, 1); out.push(f);
    });
    if (!out.length) return refuse('not-owned');
    stat.revoked += out.length;
    return { ok: true, reason: 'ok', revoked: out, revokedCount: out.length, notOwned: notOwned };
  }
  function list() {
    return { ok: true, reason: 'ok', count: LEDGER.rows.length, key: HIDDEN_KEY,
      rows: LEDGER.rows.slice(-20).map(function (r) { return { floor: r.floor, via: r.via, viaLabel: VIA_LABEL[r.via] }; }) };
  }
  function isHidden(floor) {
    const f = floorOf(floor);
    if (f === null) return { ok: false, reason: 'bad-floor' };
    return { ok: true, reason: 'ok', floor: f, hidden: LEDGER.rows.some(function (r) { return r.floor === f; }) };
  }
  function clear() { const n = LEDGER.rows.length; LEDGER.rows = []; return { ok: true, reason: 'ok', dropped: n }; }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, keepRecent: cfg.keepRecent, minKeepRecent: cfg.minKeepRecent,
      maxKeepRecent: cfg.maxKeepRecent, maxLedger: cfg.maxLedger, ledgerKey: HIDDEN_KEY,
      vias: VIA.slice(), viaLabel: VIA_LABEL, kept: LEDGER.rows.length };
  }
  function resetStat() {
    stat.planned = 0; stat.hidden = 0; stat.revoked = 0; stat.evicted = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.autoHide = {
    getSettings: settings, setSettings: saveSettings, view: view,
    plan: plan, mark: mark, revoke: revoke, list: list, isHidden: isHidden, clear: clear,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    HIDDEN_KEY: HIDDEN_KEY, VIA: VIA, VIA_LABEL: VIA_LABEL,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/auto-hide.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'autoHide 已加载（2.230.0）');
})();