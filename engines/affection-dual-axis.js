/**
 * WorldAxis engines/affection-dual-axis.js (v2.417.0) — EXV25-2 内心好感与外在态度双轴
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   `fondness.js`（v2.77.0）是一根 0–100 的**数值轴**：步进白名单 / 好感不降 /
 *   上限 100 / 五段区间语义 / 阶段授权 / 提案过期 / 行级撤销。它管的是
 *   「分数怎么动」，一次都没问过「这份好感是心里的，还是脸上的」。
 *   实测 `grep -rn '内心好感\|外在态度\|dualAxis\|innerAffection' engines/` —— 430 引擎 0 命中。
 *
 *   后果三条，都能在正文里看见：
 *     ① **嘴硬被算成真心冷淡** —— 说反话的角色，数值一路降，最后连心里那点在意也没了；
 *     ② **客套被算成知己** —— 场面话堆出来的高数值，读起来像交心；
 *     ③ **没估过被当成中性** —— 没观察过的角色读成「平淡/如常」，而**未知不等于中性**：
 *        未知是「不知道他怎么想」，中性是「知道他不冷不热」，这两件事在叙事里完全不同。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   两根各五档的**文字**轴（内心：厌弃/冷淡/平常/在意/倾心；外在：回避/客套/如常/熟络/亲昵）
 *   + 未知档 + 证据门槛：`observe` 每次给两轴档位，必须带依据类别；
 *   **只给 `words`（言语）的依据能建立初判、但改不了已有档位** —— 嘴硬、客套、一时情绪都不算变心。
 *   `clear` 撤回估计回到未知。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store，也不写 fondness 的数值——两根轴与那根数值轴各记各的，互不覆盖。
 *   ② 不做语义推断：只认显式 `observe`，不读正文猜态度。
 *   ③ 每条轴各带 `weak` 标记（弱依据建立的初判），供注入层决定措辞强弱。
 *   ④ 拒收码只用 disabled / missing-* / unknown-tier / words-cannot-shift。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const LS_KEY = 'worldaxis_affection_dual_settings_v1';
  const DEF = { enabled: true, maxPeople: 128 };
  const __REG = { key: LS_KEY, def: DEF, module: 'affectionDual', bounds: { maxPeople: [8, 256] } };
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
  const INNER = ['厌弃', '冷淡', '平常', '在意', '倾心'];
  const OUTER = ['回避', '客套', '如常', '熟络', '亲昵'];
  const KINDS = ['deed', 'words', 'reveal', 'time'];
  const stat = { observed: 0, shifted: 0, cleared: 0, refused: 0, lastReason: '' };
  const MAP = {}; // whoKey -> {who, inner:{tier,idx,weak,at,kinds}, outer:{...}, at}
  const ORDER = []; // 插入序，用于有界挤出
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function keyOf(s) { return str(s).toLowerCase(); }
  function idxOf(list, v) { return list.indexOf(str(v)); }
  function trimCap(cap) {
    while (ORDER.length > cap) {
      const victim = ORDER.shift();
      if (victim) delete MAP[victim];
    }
  }
  function observe(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：估的是谁？' }; }
    const raw = s.evidence && Array.isArray(s.evidence.kinds) ? s.evidence.kinds : (Array.isArray(s.kinds) ? s.kinds : []);
    const kinds = raw.map(str).filter(function (k) { return KINDS.indexOf(k) >= 0; });
    if (!kinds.length) { stat.refused++; stat.lastReason = 'missing-evidence';
      return { ok: false, hint: 'missing-evidence：凭哪一条？（deed 行为 / words 言语 / reveal 真相 / time 长期）' }; }
    const k = keyOf(who);
    const now = num(s.at) || clockNow('affectionDual') || 0;
    let slot = MAP[k];
    if (!slot) { slot = MAP[k] = { who: who, inner: null, outer: null, at: now }; ORDER.push(k); trimCap(cfg.maxPeople); }
    const ni = s.inner == null || str(s.inner) === '' ? null : idxOf(INNER, s.inner);
    const no = s.outer == null || str(s.outer) === '' ? null : idxOf(OUTER, s.outer);
    if (ni !== null && ni < 0) { stat.refused++; stat.lastReason = 'unknown-tier';
      return { ok: false, hint: 'unknown-tier：内心一轴只有 ' + INNER.join('/') }; }
    if (no !== null && no < 0) { stat.refused++; stat.lastReason = 'unknown-tier';
      return { ok: false, hint: 'unknown-tier：外在一轴只有 ' + OUTER.join('/') }; }
    const weakOnly = kinds.every(function (x) { return x === 'words'; });
    const shiftI = ni !== null && slot.inner && slot.inner.idx !== ni;
    const shiftO = no !== null && slot.outer && slot.outer.idx !== no;
    if ((shiftI || shiftO) && weakOnly) {
      stat.refused++; stat.lastReason = 'words-cannot-shift';
      return { ok: false, hint: 'words-cannot-shift：嘴硬、客套、一时情绪都不改档——要改得给行为 / 真相 / 长期依据' };
    }
    if (ni !== null) slot.inner = { tier: INNER[ni], idx: ni, weak: weakOnly && !slot.inner, at: now, kinds: kinds.slice() };
    if (no !== null) slot.outer = { tier: OUTER[no], idx: no, weak: weakOnly && !slot.outer, at: now, kinds: kinds.slice() };
    slot.at = now;
    stat.observed++;
    if (shiftI || shiftO) stat.shifted++;
    return { ok: true, who: who,
      inner: slot.inner ? slot.inner.tier : null, outer: slot.outer ? slot.outer.tier : null,
      unknown: !slot.inner && !slot.outer, shifted: !!(shiftI || shiftO) };
  }
  /** 只读：未知就如实答未知，不折中成中性。 */
  function read(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who);
    if (!who) return { ok: false, hint: 'missing-who：读谁？' };
    const slot = MAP[keyOf(who)];
    if (!slot) return { ok: true, who: who, inner: null, outer: null, unknown: true,
      hint: '没估过：未知不是中性，不要当成平淡 / 如常' };
    return { ok: true, who: who,
      inner: slot.inner ? { tier: slot.inner.tier, at: slot.inner.at, weak: !!slot.inner.weak } : null,
      outer: slot.outer ? { tier: slot.outer.tier, at: slot.outer.at, weak: !!slot.outer.weak } : null,
      unknown: !slot.inner && !slot.outer,
      hint: (!slot.inner || !slot.outer) ? '缺的那一轴仍是未知，不要拿另一轴顶替' : '' };
  }
  /** 撤回估计：回到未知（不是回到中性）。 */
  function clear(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who);
    if (!who) return { ok: false, hint: 'missing-who：撤谁的估计？' };
    const k = keyOf(who);
    if (!MAP[k]) return { ok: true, who: who, cleared: false, hint: '本来就没有估计' };
    const axis = str(s.axis);
    if (axis === 'inner' || axis === 'outer') {
      MAP[k][axis] = null;
      stat.cleared++;
      return { ok: true, who: who, cleared: true, axis: axis };
    }
    delete MAP[k];
    const i = ORDER.indexOf(k);
    if (i >= 0) ORDER.splice(i, 1);
    stat.cleared++;
    return { ok: true, who: who, cleared: true, axis: 'both' };
  }
  function view() {
    const rows = ORDER.filter(function (k) { return MAP[k]; }).map(function (k) {
      const s = MAP[k];
      return { who: s.who,
        inner: s.inner ? s.inner.tier : null, outer: s.outer ? s.outer.tier : null,
        unknown: !s.inner && !s.outer, at: s.at };
    });
    return { ok: true, count: rows.length, rows: rows };
  }
  function statView() {
    return Object.assign({ people: ORDER.filter(function (k) { return MAP[k]; }).length }, stat);
  }
  function reset() {
    Object.keys(MAP).forEach(function (k) { delete MAP[k]; });
    ORDER.length = 0;
    stat.observed = 0; stat.shifted = 0; stat.cleared = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.affectionDual = {
    observe: observe, read: read, clear: clear, view: view,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings,
    INNER: INNER.slice(), OUTER: OUTER.slice(), KINDS: KINDS.slice()
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/affection-dual-axis.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/affection-dual-axis 已加载（2.417.0）');
})();