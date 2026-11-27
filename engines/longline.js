/**
 * WorldAxis engines/longline.js (v2.55.0)
 * 长线伏笔：承诺回收时刻 + 逾期欠账（只度量，不改写）。
 *
 * 为什么要有它：
 *   memory.foreshadows 早已有状态枚举（waiting/developing/triggered/recycled/dropped）
 *   与终态回收（pruneForeshadows），但**没有任何「承诺何时回收」的字段**，
 *   于是「埋了没收」这件事在全库不可观测：伏笔可以无限期 waiting，
 *   既不会被回收、也不会被报出，长线靠人记。本模块只把这条信息补上。
 *
 * 边界：
 *   1 总开关默认开启；关闭时不结算、不注入。
 *   2 只给**已存在的伏笔**设定承诺，不创建伏笔、不改写伏笔状态。
 *   3 逾期只报欠账，**不自行回收**——回收与否是叙事决定，不是容量决定。
 *   4 注入面名额（maxItems）只截断不参与筛选（排序已是「最逾期优先」），
 *     但截断必须自证「另有几条未列」——否则读者不知道自己看到的是全部还是抽样。（v2.564.0）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_longline_settings_v1';
  const DEF = { enabled: true, graceMs: 600000, maxItems: 4 };
  const __REG = { key: LS_KEY, def: DEF, module: 'longline', bounds: { graceMs: [0, 86400000], maxItems: [1, 8] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) { return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // 终态：已收/已弃/已引爆——都不再算「欠账」（与 memory.FS_TERMINAL / backstage 同口径）
  const TERMINAL = ['recycled', 'dropped', 'triggered'];
  const stat = { promises: 0, sweeps: 0, overdue: 0, blocked: 0, lastReason: '',
    block: null };
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function ts(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function list(root) { return (((root || state()).memory || {}).foreshadows) || []; }
  function find(id, root) {
    const key = clean(id, 40); if (!key) return null;
    return list(root).filter(function (f) { return f && clean(f.id, 40) === key; })[0] || null;
  }
  function isOpen(f) { return !!f && TERMINAL.indexOf(f.status) < 0; }
  // 承诺：只对已存在伏笔设定 dueAt（不创建、不改状态）
  function promise(id, dueAt) {
    const at = ts(dueAt);
    if (!at) { stat.blocked++; stat.lastReason = 'bad-due'; return { ok: false, reason: 'bad-due' }; }
    if (!WA.store || !find(id)) { stat.blocked++; stat.lastReason = 'missing-foreshadow'; return { ok: false, reason: 'missing-foreshadow' }; }
    let out = null;
    WA.store.transact(function (draft) {
      const f = find(id, draft);
      if (!f) { out = { ok: false, reason: 'missing-foreshadow' }; return false; }
      if (!isOpen(f)) { out = { ok: false, reason: 'already-terminal' }; return false; }
      f.dueAt = at;
      f.promisedAt = clockNow('longline');
      out = { ok: true, id: clean(id, 40), dueAt: at };
    }, 'longline:promise');
    if (out && out.ok) { stat.promises++; stat.lastReason = 'promised'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  // 逾期：只报，不改。grace 内的不算逾期。
  function overdue(now) {
    const cfg = settings();
    const t = ts(now) || clockNow('longline');
    return list().filter(function (f) {
      return isOpen(f) && f.dueAt && t > (f.dueAt + cfg.graceMs);
    }).map(function (f) {
      return { id: f.id, content: clean(f.content, 60), status: f.status, dueAt: f.dueAt, lateBy: t - f.dueAt };
    }).sort(function (a, b) { return b.lateBy - a.lateBy; });
  }
  function sweep(now) {
    stat.sweeps++;
    const rows = overdue(now);
    stat.overdue = rows.length;
    stat.lastReason = rows.length ? 'overdue' : 'clear';
    return { ok: true, count: rows.length, rows: rows };
  }
  function pressure(now) {
    const rows = overdue(now);
    if (!rows.length) return { count: 0, worstMs: 0, level: 'clear' };
    const worst = rows[0].lateBy;
    return { count: rows.length, worstMs: worst, level: worst > 3600000 ? 'heavy' : 'light' };
  }
  // 名额：来自设置面 maxItems（1..8），但提成具名函数，避免 NaN/0
  function quotaOf(cfg) {
    var n = Math.floor(Number(cfg && cfg.maxItems));
    return isFinite(n) && n > 0 ? n : 1;
  }
  function buildBlock() {
    var cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    var rows = overdue();
    var quota = quotaOf(cfg);
    var picked = rows.slice(0, quota);
    var hidden = Math.max(0, rows.length - quota);
    var mode = !rows.length ? 'empty' : (hidden ? 'worst-first' : 'all-fit');
    // v2.564.0：旧写法只截断不读数、也不说还有几条（探针 s1：10 条只念
    //   4 条，读者无从知道）。排序早已是「最逾期优先」，本批只补自证与读数。
    stat.block = { candidates: rows.length, picked: picked.length,
      quota: quota, hidden: hidden, mode: mode };
    if (!rows.length) return '';
    var lines = picked.map(function (r) {
      return '- ' + (r.id || '未命名') + '：' + r.content
        + '（已逾 ' + Math.round(r.lateBy / 60000) + ' 分钟）';
    });
    if (hidden > 0) {
      lines.push('- 另有 ' + hidden + ' 条逾期未列出'
        + '（本面只念最逾期的 ' + picked.length + ' 条）');
    }
    var head = '[长线伏笔]' + String.fromCharCode(10)
      + '以下伏笔已过承诺回收时刻但仍未收束，请在叙事中推进或明确放弃（不得当作从未埋下）：'
      + String.fromCharCode(10);
    var tail = String.fromCharCode(10) + '逾期只提示，不自动回收；收束与否由剧情决定。';
    return head + lines.join(String.fromCharCode(10)) + tail;
  }

WA.longline = {
    TERMINAL: TERMINAL.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    promise: promise, overdue: overdue, sweep: sweep, pressure: pressure, buildBlock: buildBlock,
    stat: function () { var o = Object.assign({}, stat);
      o.block = stat.block ? Object.assign({}, stat.block) : null;
      return o; }
  };
})();
