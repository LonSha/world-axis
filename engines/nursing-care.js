/**
 * WorldAxis engines/nursing-care.js (v2.416.0) — EXV24-5 乳母雇佣与育儿
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「乳母 / 奶妈 / 育儿」全仓语料 0 命中。care-chain 治的是**病弱照护**，
 *   family.assignCare 治的是家庭内部分工 —— 但"雇一个乳母来喂孩子"这层
 *   **花钱买育儿劳务**的市场是空的。婴儿的"谁在养"查无实名。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `hire` 雇乳母 → `assignNursing` 把婴孩分派给乳母（一人有上限）→
 *   `wean` 断奶结工。**婴孩的哺育责任人查无实名时，buildBlock 会替他说实话**：
 *   注面里明写"以下婴孩尚无登记的哺育责任人"。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store：婴孩是谁家、乳母是谁，由调用方给。
 *   ② 一名乳母同时哺育上限（默认 2），超额拒收 `wetnurse-capped` —— 一人奶不了三个。
 *   ③ 同一婴孩只许一位在岗乳母（`already-nursed`）。
 *   ④ 雇佣/分派都要钱（wagePerMonth 正整数），断奶不结工钱要走 settled 说明。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_nursing_care_settings_v1';
  const DEF = { enabled: true, maxWetnurses: 16, perWetnurse: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'nursingCare',
    bounds: { maxWetnurses: [4, 64], perWetnurse: [1, 4] } };
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
  const stat = { hired: 0, assigned: 0, weaned: 0, refused: 0, lastReason: '' };
  const NURSES = {}; // nurseId -> {wagePerMonth, babies:[], hiredAt, status}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function pint(v) { const n = Number(v); return (Number.isInteger(n) && n > 0) ? n : null; }
  function hire(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = str(s.nurseId || s.who);
    const wage = pint(s.wagePerMonth);
    if (!id) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：乳母是谁？' }; }
    if (wage === null) { stat.refused++; stat.lastReason = 'bad-amount'; return { ok: false, hint: 'bad-amount：月钱须为正整数，白干活是卖身不是雇佣' }; }
    if (NURSES[id]) { stat.refused++; stat.lastReason = 'already-hired'; return { ok: false, hint: 'already-hired：' + id + ' 已在雇' }; }
    if (Object.keys(NURSES).length >= cfg.maxWetnurses) {
      const oldest = Object.keys(NURSES).sort(function (a, b) { return (NURSES[a].hiredAt || 0) - (NURSES[b].hiredAt || 0); })[0];
      delete NURSES[oldest];
    }
    NURSES[id] = { wagePerMonth: wage, babies: [], hiredAt: s.at || null, status: 'serving' };
    stat.hired++;
    return { ok: true, id: id, wagePerMonth: wage };
  }
  function assignNursing(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const nurse = str(s.nurseId), baby = str(s.babyId || s.who);
    if (!NURSES[nurse]) { stat.refused++; stat.lastReason = 'unknown-nurse'; return { ok: false, hint: 'unknown-nurse：这个乳母没雇过' }; }
    if (!baby) { stat.refused++; stat.lastReason = 'missing-baby'; return { ok: false, hint: 'missing-baby：哺育的是哪个孩子？' }; }
    const holder = Object.keys(NURSES).find(function (k) { return NURSES[k].babies.indexOf(baby) >= 0; });
    if (holder) { stat.refused++; stat.lastReason = 'already-nursed'; return { ok: false, hint: 'already-nursed：这孩子已由 ' + holder + ' 哺育，先 wean 再换人' }; }
    if (NURSES[nurse].babies.length >= cfg.perWetnurse) { stat.refused++; stat.lastReason = 'wetnurse-capped'; return { ok: false, hint: 'wetnurse-capped：一人奶不了三个（上限 ' + cfg.perWetnurse + '）' }; }
    NURSES[nurse].babies.push(baby);
    stat.assigned++;
    return { ok: true, nurse: nurse, baby: baby, load: NURSES[nurse].babies.length };
  }
  function wean(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const baby = str(s.babyId || s.who), nurse = str(s.nurseId);
    const holder = Object.keys(NURSES).find(function (k) { return NURSES[k].babies.indexOf(baby) >= 0; });
    if (!holder) { stat.refused++; stat.lastReason = 'not-nursed'; return { ok: false, hint: 'not-nursed：这孩子没有在岗乳母' }; }
    if (nurse && nurse !== holder) { stat.refused++; stat.lastReason = 'wrong-nurse'; return { ok: false, hint: 'wrong-nurse：孩子归 ' + holder + '，不归 ' + nurse }; }
    if (s.unpaid === true && !str(s.settled)) { stat.refused++; stat.lastReason = 'missing-settled'; return { ok: false, hint: 'missing-settled：工钱没结清要走 settled 说明，不许赖账断奶' }; }
    NURSES[holder].babies = NURSES[holder].babies.filter(function (b) { return b !== baby; });
    stat.weaned++;
    return { ok: true, baby: baby, nurse: holder };
  }
  /** 只读：全册哺育面 + 无责任人婴孩点名（由调用方传 infants 名单）。 */
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const rows = Object.keys(NURSES).map(function (k) { const r = NURSES[k];
      return { id: k, wagePerMonth: r.wagePerMonth, babies: r.babies.slice(), load: r.babies.length }; });
    const unassigned = (Array.isArray(s.infants) ? s.infants.map(str) : []).filter(function (b) {
      return !rows.some(function (r) { return r.babies.indexOf(b) >= 0; });
    });
    return { ok: true, serving: rows.length, rows: rows, unassigned: unassigned };
  }
  function statView() { return Object.assign({ serving: Object.keys(NURSES).length, babies: Object.keys(NURSES).reduce(function (n, k) { return n + NURSES[k].babies.length; }, 0) }, stat); }
  function reset() { Object.keys(NURSES).forEach(function (k) { delete NURSES[k]; }); stat.hired = 0; stat.assigned = 0; stat.weaned = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.nursingCare = {
    hire: hire, assignNursing: assignNursing, wean: wean, view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/nursing-care.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/nursing-care 已加载（2.416.0）');
})();