/**
 * WorldAxis engines/power-anchor.js (v2.129.0) — 战力锚（缝 A8）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓有 `engines/enemies.js`（仇敌录：status/type/active 上限 24）与 `engines/rivalry.js`
 *   （竞争焦点），但**没有数值锚**：一条仇敌的身份/战力级/能力风格/弱点盲区全是自由文本，
 *   写在哪、多少，无人比对。于是「同一个对手第二章还是三流打手、第八章突然五五开」
 *   这类**机械膨胀**在仓内没有任何出口——用户只能凭记忆发现「这个人怎么变强了」。
 *   全仓 `战力锁` / `powerLevel` / `防膨胀` 零命中。
 *
 *   缝合来源：st-direct-event 的「战力天平与势力库管理」——
 *   原文口径：「严格锁定对手名称、战力等级、能力风格与弱点盲区，**杜绝战力忽高忽低的机械膨胀**」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `anchor(who, tier, opts)` —— 给一个对手钉上战力锚（等级 + 区间宽 + 弱点盲区）；
 *   ② `check(who, value)` —— 纯只读答「这个数值还在锚定区间内吗」（越界一并报出超出多少）；
 *   ③ `buildBlock()` —— 把锚定的对手与它们的区间交给正文（要求不得越界）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `anchor` 报 `disabled` 且不落盘、不计数。
 *   2 **只记账不掷骰**（本仓元规则⑬）：本模块**不做任何数值运算**——
 *      不减伤、不结算、不重算等级、不「修正」越界值。`check` 只回答「在不在区间内」
 *      与「超出多少」，**绝不修改调用方传入的任何值**。理由：一旦本模块开始算，
 *      它就从「账」变成了「规则」，而规则要跟战斗系统对齐——本仓没有战斗系统。
 *   3 对手名必填（`no-name`），等级必填（`missing-key`），等级必须是有限数（`bad-tier`）。
 *   4 同级重复登记为**覆盖**（幂等，`existed:true`）：改设定是一次迁移，不是新增一个对手。
 *   5 **越界不静默**：`check` 越界返回 `over:true` + `delta`（超了多少），**绝不回落**、
 *      绝不把越界值写回任何地方（也不写盘：本函数不动存储）。
 *   6 `buildBlock` 只列**已锚定**的对手，不列从未登记过的（没锚的对手就该按没锚处理），
 *      也不替调用方排序。
 *   7 不写正文、不改正文：数值是作者定的，本模块只记账。
 *   8 弱点盲区是**文本**不是标签表：本模块不归并、不分类、不推断「这个弱点算不算真弱点」。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_poweranchor_settings_v1';
  const DEF = { enabled: false, maxRows: 32, band: 1 };
  const __REG = { key: LS_KEY, def: DEF, module: 'powerAnchor', bounds: { maxRows: [4, 128], band: [0, 5] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { anchors: 0, overrides: 0, drops: 0, checks: 0, overs: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }

  function bucket(draft) {
    if (!draft.powerAnchor || typeof draft.powerAnchor !== 'object' || Array.isArray(draft.powerAnchor)) draft.powerAnchor = { round: 0, rows: [] };
    const b = draft.powerAnchor;
    if (typeof b.round !== 'number') b.round = 0;
    if (!Array.isArray(b.rows)) b.rows = [];
    return b;
  }
  function rows() { const s = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; return (s.powerAnchor && Array.isArray(s.powerAnchor.rows)) ? s.powerAnchor.rows : []; }
  function findRow(who) { const rs = rows(); for (let i = 0; i < rs.length; i++) if (rs[i] && rs[i].who === who) return rs[i]; return null; }

  /**
   * 钉一个战力锚。同级重复为覆盖（改设定是一次迁移，不是新增一个对手）。
   * @param {string} who 对手名（必填）
   * @param {number} tier 战力级（有限数，必填）
   * @param {object} [opts] { band: number, style: string, weakpoints: string[] }
   */
  function anchor(who, tier, opts) {
    const o = opts || {};
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const name = clean(who, 60);
    if (!name) { noteFault('no-name'); return { ok: false, reason: 'no-name', detail: '对手名必填' }; }
    if (tier === undefined || tier === null || tier === '') { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: '战力级必填' }; }
    const t = Number(tier);
    if (!isFinite(t)) { noteFault('bad-tier'); return { ok: false, reason: 'bad-tier', who: name, tier: String(tier) }; }
    const bandIn = (o.band === undefined || o.band === null) ? settings().band : o.band;
    const bd = Number(bandIn);
    if (!isFinite(bd) || bd < 0) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', detail: 'band 必须是非负数' }; }
    let out = null;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const i = b.rows.map(function (x) { return x && x.who; }).indexOf(name);
      const existed = i >= 0;
      if (!existed && b.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', who: name, cap: settings().maxRows }; return false; }
      const row = { who: name, tier: t, band: bd, lo: t - bd, hi: t + bd,
        style: clean(o.style, 80) || null,
        weakpoints: Array.isArray(o.weakpoints) ? o.weakpoints.slice(0, 6).map(function (w) { return clean(w, 60); }).filter(Boolean) : [],
        at: clockNow('powerAnchor') };
      if (existed) { row.at = b.rows[i].at || row.at; b.rows[i] = row; stat.overrides++; }
      else b.rows.push(row);
      if (WA.evict) WA.evict.array(b.rows, 'powerAnchor.rows', settings().maxRows);
      out = { ok: true, who: name, tier: t, lo: row.lo, hi: row.hi, existed: existed, total: b.rows.length };
      return true;
    }, 'powerAnchor:anchor') : null;
    if (!out || !r || r.ok !== true) { noteFault(out ? out.reason : 'store-unavailable'); return out || { ok: false, reason: 'store-unavailable' }; }
    stat.anchors++; stat.lastReason = out.existed ? 'overridden' : 'anchored';
    return out;
  }

  function drop(who) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const name = clean(who, 60);
    if (!name) { noteFault('no-name'); return { ok: false, reason: 'no-name' }; }
    let found = false;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const i = b.rows.map(function (x) { return x && x.who; }).indexOf(name);
      if (i < 0) return false;
      b.rows.splice(i, 1); found = true; return true;
    }, 'powerAnchor:drop') : null;
    if (!found || !r || r.ok !== true) { noteFault('not-found'); return { ok: false, reason: 'not-found', who: name }; }
    stat.drops++;
    return { ok: true, who: name };
  }

  /**
   * 纯只读：这个数值还在锚定区间内吗？
   * **绝不修改传入值、绝不写盘**；越界只报出（含超出多少），不回落、不修正。
   * 未登记的对手 → `not-found`（没人锚过的对手不该被默认为「随便多少都行」）。
   */
  function check(who, value) {
    const name = clean(who, 60);
    if (!name) { noteFault('no-name'); return { ok: false, reason: 'no-name' }; }
    if (value === undefined || value === null || value === '') { noteFault('missing-key'); return { ok: false, reason: 'missing-key', who: name }; }
    const v = Number(value);
    if (!isFinite(v)) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', who: name, value: String(value) }; }
    const row = findRow(name);
    stat.checks++;
    if (!row) { noteFault('not-found'); return { ok: false, reason: 'not-found', who: name }; }
    const over = v < row.lo ? -1 : (v > row.hi ? 1 : 0);
    if (over !== 0) stat.overs++;
    return { ok: true, who: name, value: v, lo: row.lo, hi: row.hi,
      over: over !== 0, dir: over === 0 ? 'in' : (over < 0 ? 'below' : 'above'),
      delta: over === 0 ? 0 : (over < 0 ? row.lo - v : v - row.hi) };
  }

  function get(who) {
    const name = clean(who, 60);
    if (!name) return { ok: false, reason: 'no-name' };
    const row = findRow(name);
    if (!row) return { ok: false, reason: 'not-found', who: name };
    return { ok: true, who: row.who, tier: row.tier, lo: row.lo, hi: row.hi, band: row.band,
      style: row.style, weakpoints: (row.weakpoints || []).slice(), at: row.at };
  }
  function list() { return rows().map(function (r) { return { who: r.who, tier: r.tier, lo: r.lo, hi: r.hi }; }); }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const rs = rows();
    if (!rs.length) return '';
    const lines = rs.slice(-cfg.maxRows).map(function (r) {
      const wp = (r.weakpoints && r.weakpoints.length) ? '；盲区：' + r.weakpoints.join('、') : '';
      return '· ' + r.who + '：' + r.lo + '~' + r.hi + '（已定级）'
        + (r.style ? '（风格：' + r.style + '）' : '') + wp;
    });
    return '[战力锚] 下列对手的战力**已经定过**，不得因剧情需要临时抬高（机械膨胀）：\n'
      + lines.join('\n')
      + '\n战力铁律：这些对手很强或很弱是**已定的事实**，不是可以调节的参数。'
      + '若正文需要一个更强的对手，那是**另一个**对手（新登场、另起名字），不是把这个人改成五五开。\n';
  }

  WA.powerAnchor = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    anchor: anchor, drop: drop, check: check, get: get, list: list, buildBlock: buildBlock,
    round: function () { const s = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; return (s.powerAnchor && typeof s.powerAnchor.round === 'number') ? s.powerAnchor.round : 0; },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/power-anchor.js', { kind: 'engine', ver: '2.129.0' });
})();
