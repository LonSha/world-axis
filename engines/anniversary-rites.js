/**
 * WorldAxis engines/anniversary-rites.js (v2.416.0) — EXV24-1 忌日周年与祭仪
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「忌日 / 周年 / 纪念日」全仓 421 引擎语料 0 命中。死亡有 family.inherit 分财产、
 *   有 mortuary-rites 服丧，但**人死之后的每一年**没有任何东西记得：
 *   到了日子没人提醒、没祭没访不产生任何后果 —— 逝者在世界里只活一轮。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `register` 登记一条忌日/周年 → `observe({at})` 只读回答「此刻谁的日子到了、
 *   距今多久」→ `markObserved` 写祭访回执。**过期不自动消账**：到日未祭的条目一直
 *   在 `observe` 里亮着，直到真有人（叙事层）去祭 —— 祭不由机器代行。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store：谁死了、谁与逝者什么关系由调用方给，本模块只记账与提醒。
 *   ② 到日判据用 story 时间轴（clock.now），不给 at 就拒收 —— 不拿设备墙钟驱动故事。
 *   ③ 条数有界（默认 48，超出挤出最旧的已祭条目，**未祭的优先保留**）。
 *   ④ 拒收码只用 disabled / missing-* / unknown-* / already-observed，其余走 hint。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const LS_KEY = 'worldaxis_anniversary_rites_settings_v1';
  const DEF = { enabled: true, maxRows: 48 };
  const __REG = { key: LS_KEY, def: DEF, module: 'anniversaryRites',
    bounds: { maxRows: [8, 128] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const stat = { registered: 0, observed: 0, refused: 0, lastReason: '' };
  const RITES = []; // {id, who, what, kind, at(yearly anchor ms), observedLast, obsCount}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function trim_(arr, cap) {
    if (arr.length <= cap) return;
    const spare = arr.filter(function (r) { return !r.due; });
    while (arr.length > cap && spare.length) {
      const i = arr.indexOf(spare.shift());
      if (i >= 0) arr.splice(i, 1);
    }
  }
  /** 周年换算：最近一个**已到**的周年（floor，不是 ceil —— 到了就是到了）。
   *  未满一年时不算到日，给出距首个周年的天数。已祭访过本轮周年则不再亮。 */
  function lastAnniv(rec, now) {
    const yearMs = 360 * 24 * 3600 * 1000;
    const elapsed = now - rec.at;
    if (elapsed < yearMs) {
      return { due: false, years: 0, at: rec.at + yearMs, nextAt: rec.at + yearMs,
        inDays: Math.ceil((yearMs - elapsed) / 86400000) };
    }
    const k = Math.floor(elapsed / yearMs);
    const aAt = rec.at + k * yearMs;
    const observed = rec.observedLast != null && rec.observedLast >= aAt;
    return { due: !observed, years: k, at: aAt, nextAt: aAt + yearMs, inDays: 0 };
  }
  function register(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who), what = str(s.what), kind = str(s.kind) || '忌日';
    const at = num(s.at);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：这是谁的忌日/周年？没有名就没有祭' }; }
    if (!what) { stat.refused++; stat.lastReason = 'missing-what'; return { ok: false, hint: 'missing-what：纪念的是什么事？空白的牌位立不住' }; }
    if (at === null) { stat.refused++; stat.lastReason = 'missing-at'; return { ok: false, hint: 'missing-at：原事发生在何时？周年从那一刻起算' }; }
    const now = num(s.now) || clockNow('anniversaryRites') || at;
    const rec = { id: 'ri' + (++stat.registered) + '-' + str(s.key || ''), who: who, what: what, kind: kind, at: at, observedLast: null, obsCount: 0 };
    rec.due = lastAnniv(rec, now).due;
    rec.nextAt = lastAnniv(rec, now).nextAt;
    RITES.push(rec);
    trim_(RITES, cfg.maxRows);
    return { ok: true, id: rec.id, kind: kind, due: rec.due, nextAt: rec.nextAt };
  }
  /** 只读：此刻谁的日子到了/将至。不改账。 */
  function observe(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const now = num(s.at) || clockNow('anniversaryRites');
    if (now === null) return { ok: false, hint: 'missing-at：observe 要一个故事时刻，本模块不猜今天几号' };
    const rows = RITES.map(function (r) {
      const d = lastAnniv(r, now);
      return { id: r.id, who: r.who, what: r.what, kind: r.kind,
        due: d.due, years: d.years,
        inDays: d.due ? 0 : d.inDays,
        observedLast: r.observedLast, obsCount: r.obsCount };
    }).sort(function (a, b) { return (b.due - a.due) || (a.inDays - b.inDays); });
    return { ok: true, count: rows.length, dueCount: rows.filter(function (r) { return r.due; }).length, rows: rows };
  }
  function markObserved(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = RITES.find(function (r) { return r.id === str(id); });
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-rite'; return { ok: false, hint: 'unknown-rite：没有这条祭账' }; }
    const now = num(s.at) || clockNow('anniversaryRites');
    if (now === null) { stat.refused++; stat.lastReason = 'missing-at'; return { ok: false, hint: 'missing-at：祭访发生在何时？' }; }
    const l = lastAnniv(rec, now);
    if (!l.due && !s.force) { stat.refused++; stat.lastReason = 'not-due'; return { ok: false, hint: l.years === 0 ? 'not-due：未满一年，日子还没到' : 'not-due：本轮周年已祭过，下一轮在 ' + l.nextAt }; }
    rec.observedLast = now; rec.obsCount++; rec.due = false; rec.nextAt = l.nextAt;
    stat.observed++;
    return { ok: true, id: rec.id, obsCount: rec.obsCount, nextAt: rec.nextAt };
  }
  function view() { return { ok: true, rows: JSON.parse(JSON.stringify(RITES)) }; }
  function statView() { return Object.assign({ rites: RITES.length, dueNow: RITES.filter(function (r) { return r.due; }).length }, stat); }
  function reset() { RITES.length = 0; stat.registered = 0; stat.observed = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.anniversaryRites = {
    register: register, observe: observe, markObserved: markObserved,
    view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/anniversary-rites.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/anniversary-rites 已加载（2.416.0）');
})();
