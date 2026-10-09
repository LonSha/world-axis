/**
 * WorldAxis engines/beat-mask.js (v2.129.0) — 信息迷雾 / 蓝图遮罩（缝 A6）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓有一个同名词、不同物的模块：`engines/masks.js` 是**角色对他人伪装**
 *   （谁知道谁的真面目），不是「对模型屏蔽未来剧情」。二者共用一个「mask」，
 *   于是「蓝图遮蔽未来节拍」这件事在全仓**零命中**：
 *     · `engines/chapters.js` / `direction/oracle.js` 都写「节拍」（beat），
 *       但那是**结构**（第几幕、张弛几档），不是「还没到的那一段不许提前说」；
 *     · `engines/quota.js` 管伏笔**配给**（埋多少、回收多少），不管**可见性**。
 *   结果：编排好的后续节拍一旦落进任何注入面，模型就会照着写——
 *   作者精心设计的转折在到达之前就被自己剧透了。
 *
 *   缝合来源：r13 §6.2 `_applyBlueprintMask`（屏蔽未来节拍防剧透）。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `plan(beats)` —— 登记蓝图节拍（标题 + 到达轮 + 正文），全量替换；
 *   ② `advance()` —— 推进「已到达轮」（**单调不减**，不许回退）；
 *   ③ `buildBlock()` —— 只报「还有几个节拍没到」+ 抵达纪律，**一个节拍正文都不给**。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `plan` 报 `disabled` 且不落账、`buildBlock` 返回空串。
 *   2 **只遮不给**：`buildBlock` 永不输出未到达节拍的标题或正文 ——
 *      标题本身就是剧透（「主角师父就是凶手」这种标题一进提示词就等于说完了）。
 *      要看那一段的人走 `peek(id)`（作者侧接口，不进注入面）。
 *   3 已到达的节拍**必须放行**：遮罩只遮「还没到」，把到达的也遮住等于让作者写不出来。
 *      判据由 `due()` 正面答「此刻哪些能写」。
 *   4 `advance()` 单调不减：轮号回退会让已放行的节拍重新变成遮罩态，
 *      正文里已经写过的东西会与「未到达」自相矛盾。
 *   5 节拍标题必填非空（`no-name`），轮号必须是有限数（`bad-round`）——
 *      缺轮号的节拍一律**不登记**：它会在任何一轮都算「没到」，永远遮着。
 *   6 只登记、不排序、不去重：本模块不判断「这两个节拍是不是同一件事」。
 *   7 不写正文、不改正文。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_beatmask_settings_v1';
  const DEF = { enabled: false, maxRows: 80, lead: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'beatMask', bounds: { maxRows: [8, 200], lead: [0, 8] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { plans: 0, blocked: 0, advanced: 0, faults: {}, lastReason: '' };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function finite(v) { return typeof v === 'number' && isFinite(v); }

  function bucket(draft) {
    if (!draft.beatMask || typeof draft.beatMask !== 'object' || Array.isArray(draft.beatMask)) draft.beatMask = { round: 0, rows: [] };
    const b = draft.beatMask;
    if (!finite(b.round) || b.round < 0) b.round = 0;
    if (!Array.isArray(b.rows)) b.rows = [];
    return b;
  }
  function state() { const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; return (s.beatMask && typeof s.beatMask === 'object') ? s.beatMask : { round: 0, rows: [] }; }
  function rows() { const b = state(); return Array.isArray(b.rows) ? b.rows : []; }
  function roundOf() { const b = state(); return finite(b.round) ? b.round : 0; }
  function dueRows() { const r = roundOf(); return rows().filter(function (x) { return x && finite(x.at) && x.at <= r; }); }
  function pendingRows() { const r = roundOf(); return rows().filter(function (x) { return x && finite(x.at) && x.at > r; }); }

  /** 登记蓝图（全量替换；返回登记条数与被丢弃的原因）。 */
  function plan(beats) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!Array.isArray(beats)) { noteFault('not-array'); return { ok: false, reason: 'not-array' }; }
    const cfg = settings();
    const kept = [];
    const dropped = { 'no-name': 0, 'bad-value': 0, 'rows-full': 0 };
    beats.forEach(function (x) {
      if (!x || typeof x !== 'object') { dropped['no-name']++; return; }
      const title = clean(x.title || x.name, 80);
      if (!title) { dropped['no-name']++; return; }
      if (!finite(x.at)) { dropped['bad-value']++; return; }
      if (kept.length >= cfg.maxRows) { dropped['rows-full']++; return; }
      kept.push({ id: clean(x.id, 40) || ('b' + (kept.length + 1)), title: title, at: Math.max(0, Math.floor(x.at)), text: clean(x.text, 600), at_: clockNow('beatMask') });
    });
    let out = null;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      b.rows = kept;
      if (WA.evict) WA.evict.array(b.rows, 'beatMask.rows', settings().maxRows);
      out = { ok: true, kept: b.rows.length, dropped: dropped };
      return true;
    }, 'beatMask:plan') : null;
    if (!out || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.plans++;
    stat.lastReason = 'planned';
    return out;
  }

  function advance(to) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const t = finite(to) ? Math.floor(to) : roundOf() + 1;
    if (t < roundOf()) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', detail: '轮号单调不减' }; }
    let out = null;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      b.round = Math.max(b.round, t);
      out = { ok: true, round: b.round, due: dueRows().length, pending: pendingRows().length };
      return true;
    }, 'beatMask:advance') : null;
    if (!out || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.advanced++;
    return out;
  }

  /** 作者侧：看某一个节拍（**不进注入面**）。 */
  function peek(id) {
    const key = clean(id, 40);
    if (!key) { noteFault('no-name'); return { ok: false, reason: 'no-name' }; }
    const row = rows().filter(function (x) { return x && x.id === key; })[0];
    if (!row) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: key }; }
    return { ok: true, id: row.id, title: row.title, at: row.at, text: row.text, due: row.at <= roundOf() };
  }

  /** 此刻**能写**的节拍（到达判据的正面形态）。 */
  function due() {
    const r = roundOf();
    return { ok: true, round: r, due: dueRows().map(function (x) { return { id: x.id, title: x.title, at: x.at }; }), pendingCount: pendingRows().length };
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const pend = pendingRows();
    if (!pend.length) return '';
    const r = roundOf();
    const soon = pend.filter(function (x) { return x.at <= r + cfg.lead; }).length;
    return '[信息迷雾] 蓝图里还有 ' + pend.length + ' 个节拍**尚未到达**（当前第 ' + r + ' 轮，其中 ' + soon + ' 个在第 ' + (r + cfg.lead) + ' 轮内）。\n'
      + '迷雾铁律：未到达的节拍**一个字都不得提前写出** —— 不写它的结局、不写它的转折、不给它埋伏笔式的暗示。\n'
      + '已到达的节拍不受此限（正常写）。这不是「缓慢揭示」，是**此刻不存在**。\n';
  }

  function clear() {
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) { const b = bucket(d); b.rows = []; b.round = 0; return true; }, 'beatMask:clear') : null;
    return { ok: !!(r && r.ok === true) };
  }

  WA.beatMask = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    plan: plan, advance: advance, peek: peek, due: due, buildBlock: buildBlock, clear: clear,
    round: roundOf,
    list: function () { const r = roundOf(); return rows().map(function (x) { return { id: x.id, title: x.title, at: x.at, due: x.at <= r }; }); },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/beat-mask.js', { kind: 'engine', ver: '2.129.0' });
})();
