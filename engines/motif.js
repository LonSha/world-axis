/**
 * WorldAxis engines/motif.js (v2.129.0) — 文体档案 / 意象登记（缝 A5）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓有两个近邻，量的都不是「意象」：
 *     · `engines/style.js` —— 文风面（怎么写），是**设定**不是**账**；
 *     · `engines/tolerance.js` —— **手段**同窗口重复的钝化（同一句话/动作/道具/称呼）；
 *     · `engines/proactive.js` 的「语义枯竭检测」读的是 **user 回复**是否敷衍，
 *       不是**作者自己用过的意象**。
 *   于是「上一章用雨写了三次」「这个比喻用了两遍」在全库**不在任何账上**。
 *   缝合来源：st-beat-tracker 的 Chapter 模型 `dynamicState.stylistic_archive`
 *   —— 「文体消耗记录（避免重复意象）」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `note(motif)` —— 登记一次意象使用（自动计次，超上限挤出最旧的）；
 *   ② `used(motif)` —— 纯只读答「用了几次、最近一次在第几轮」；
 *   ③ `buildBlock()` —— 把「近 N 轮用过的意象」列给正文，要求换新的。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `note` 报 `disabled` 且不落账。
 *   2 意象名必须非空具名（`no-name`）；不做同义词归并 ——
 *      「雨」与「大雨」是不是同一个意象，本模块**答不了**，故不猜（去重是人的事）。
 *   3 计数是**滑动窗口内**的次数，不是终身累计：窗口外的使用自动出窗，
 *      与 tolerance 同口径（终身累计会让「一年前用过」也算重）。
 *   4 `buildBlock` 只列**窗口内用过的**；全空时返回空串（不凭空给约束）。
 *   5 只登记、不判优劣：本模块不评「这个意象好不好」，只答「重复了几次」。
 *   6 不写正文、不改正文：意象是作者用出来的，本模块只记账。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_motif_settings_v1';
  const DEF = { enabled: false, window: 6, maxRows: 60, limit: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'motif', bounds: { window: [2, 20], maxRows: [8, 120], limit: [1, 6] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { notes: 0, repeats: 0, ticks: 0, drops: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }

  function bucket(draft) {
    if (!draft.motif || typeof draft.motif !== 'object' || Array.isArray(draft.motif)) draft.motif = { round: 0, rows: [] };
    const b = draft.motif;
    if (typeof b.round !== 'number') b.round = 0;
    if (!Array.isArray(b.rows)) b.rows = [];
    return b;
  }
  function rows() { const s = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; return (s.motif && Array.isArray(s.motif.rows)) ? s.motif.rows : []; }
  function roundOf() { const s = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; return (s.motif && typeof s.motif.round === 'number') ? s.motif.round : 0; }
  function inWin(r, win) { return r && Array.isArray(r.hits) && r.hits.filter(function (n) { return Number(n) > (roundOf() - win); }).length > 0; }

  function note(motif, opts) {
    const o = opts || {};
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const name = clean(motif, 60);
    if (!name) { noteFault('no-name'); return { ok: false, reason: 'no-name', detail: '意象名必填' }; }
    let out = null;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const win = settings().window;
      let row = b.rows.filter(function (x) { return x && x.name === name; })[0];
      if (!row) {
        if (b.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', name: name }; return false; }
        row = { name: name, hits: [], at: clockNow('motif') };
        b.rows.push(row);
      }
      row.hits = (Array.isArray(row.hits) ? row.hits : []).filter(function (n) { return Number(n) > (b.round - win); });
      row.hits.push(b.round);
      row.at = clockNow('motif');
      const n = row.hits.length;
      if (WA.evict) WA.evict.array(b.rows, 'motif.rows', settings().maxRows);
      out = { ok: true, name: name, count: n, window: win, repeated: n > settings().limit, at: b.round };
      return true;
    }, 'motif:note') : null;
    if (!out || !r || r.ok !== true) { noteFault(out ? out.reason : 'store-unavailable'); return out || { ok: false, reason: 'store-unavailable' }; }
    stat.notes++; if (out.repeated) stat.repeats++;
    stat.lastReason = out.repeated ? 'repeated' : 'noted';
    return out;
  }

  /** 轮次推进：轮号 +1，出窗的行自然失去计数（不清行；清行只能由 drop）。 */
  function tick() {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    let out = null;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const win = settings().window;
      b.round++;
      b.rows.forEach(function (x) {
        if (!x || !Array.isArray(x.hits)) return;
        const before = x.hits.length;
        x.hits = x.hits.filter(function (n) { return Number(n) > (b.round - win); });
        if (x.hits.length < before) stat.drops += (before - x.hits.length);
      });
      b.rows = b.rows.filter(function (x) { return x && Array.isArray(x.hits) && x.hits.length > 0; });
      if (WA.evict) WA.evict.array(b.rows, 'motif.rows', settings().maxRows);
      out = { ok: true, round: b.round, live: b.rows.length };
      return true;
    }, 'motif:tick') : null;
    if (!out || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.ticks++;
    return out;
  }

  function used(motif) {
    const name = clean(motif, 60);
    if (!name) return { ok: false, reason: 'no-name' };
    const win = settings().window;
    const row = rows().filter(function (x) { return x && x.name === name; })[0];
    if (!row) return { ok: true, count: 0, name: name };
    const hits = (Array.isArray(row.hits) ? row.hits : []).filter(function (n) { return Number(n) > (roundOf() - win); });
    return { ok: true, name: name, count: hits.length, window: win, lastAt: hits.length ? hits[hits.length - 1] : null };
  }

  function drop(motif) {
    const name = clean(motif, 60);
    if (!name) { noteFault('no-name'); return { ok: false, reason: 'no-name' }; }
    let found = false;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const i = b.rows.map(function (x) { return x && x.name; }).indexOf(name);
      if (i < 0) return false;
      b.rows.splice(i, 1); found = true; return true;
    }, 'motif:drop') : null;
    return (found && r && r.ok === true) ? { ok: true, name: name } : { ok: false, reason: 'not-found', name: name };
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const list = rows().filter(function (x) { return inWin(x, cfg.window); });
    if (!list.length) return '';
    const lines = list.slice(-cfg.maxRows).map(function (r) {
      const n = r.hits.length;
      return '· ' + r.name + '：近 ' + cfg.window + ' 轮已用 ' + n + ' 次' + (n > cfg.limit ? '，**已过量**' : '');
    });
    return '[文体档案] 近期用过的意象（**次数是数出来的，不得凭感觉换新**）：\n' + lines.join('\n')
      + '\n意象铁律：近 ' + cfg.window + ' 轮内同一意象用满 ' + cfg.limit + ' 次即为过量，'
      + '此后不得再用同一物象描摹同一情绪——不是换形容词，是换一个完全不同的物。\n';
  }

  function clear() {
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) { const b = bucket(d); b.rows = []; b.round = 0; return true; }, 'motif:clear') : null;
    return { ok: !!(r && r.ok === true) };
  }

  WA.motif = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    note: note, tick: tick, used: used, drop: drop, clear: clear, buildBlock: buildBlock,
    round: roundOf,
    list: function () { return rows().map(function (r) { return { name: r.name, count: Array.isArray(r.hits) ? r.hits.length : 0, at: r.at }; }); },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/motif.js', { kind: 'engine', ver: '2.129.0' });
})();