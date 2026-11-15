/**
 * WorldAxis engines/bathhouse-laundry.js (v2.416.0) — EXV24-9 浴堂浆洗与衣冠
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「澡堂 / 浆洗 / 沐浴」全仓语料 0 命中。sartorial-regalia 治制度性穿着（僭越），
 *   appearance 治长相 —— 但「这人三天没洗澡、衣衫上有汗渍」这类身体与衣物的
 *   日常状态没有刻度，社交印象的干净/邋遢全凭模型口说无凭。
 *
 * ── 机制 ── openBath 入浴（记洁净档）→ washGarments 浆洗（记衣物洁净档）
 *   → 洁净档随故事时间按天衰减（调用方传 at）→ bandOf 只读回答此刻档位。
 *
 * ── 边界 ── ① 不碰 store。② 衰减按故事时间（at），不给 at 拒收 —— 不拿设备墙钟。
 *   ③ 洁净档只报档位（清爽/尚可/有味/酸馊），不自动改外观 —— 外观由调用方消费档位。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_bathhouse_laundry_settings_v1';
  const DEF = { enabled: true, maxRows: 48, decayDays: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'bathhouseLaundry', bounds: { maxRows: [8, 128], decayDays: [1, 14] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) {
    shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const stat = { baths: 0, washed: 0, refused: 0, lastReason: '' };
  const FRESH = {}; // who -> {lastBathAt, lastWashAt}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function band(daysSince) {
    if (daysSince == null) return '有味';
    if (daysSince <= 1) return '清爽';
    if (daysSince <= 3) return '尚可';
    if (daysSince <= 7) return '有味';
    return '酸馊';
  }
  function openBath(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：谁在洗？' }; }
    const at = Number(s.at);
    if (!Number.isFinite(at)) { stat.refused++; stat.lastReason = 'missing-at'; return { ok: false, hint: 'missing-at：入浴时刻要有（故事时间）' }; }
    FRESH[who] = Object.assign({}, FRESH[who], { lastBathAt: at });
    if (Object.keys(FRESH).length > cfg.maxRows) {
      const oldest = Object.keys(FRESH).sort(function (a, b) { return (FRESH[a].lastBathAt || 0) - (FRESH[b].lastBathAt || 0); })[0];
      delete FRESH[oldest];
    }
    stat.baths++;
    return { ok: true, who: who, band: band(0) };
  }
  function washGarments(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：浆洗的是谁的衣裳？' }; }
    const at = Number(s.at);
    if (!Number.isFinite(at)) { stat.refused++; stat.lastReason = 'missing-at'; return { ok: false, hint: 'missing-at：浆洗时刻要有（故事时间）' }; }
    FRESH[who] = Object.assign({}, FRESH[who], { lastWashAt: at });
    if (Object.keys(FRESH).length > cfg.maxRows) {
      const oldest = Object.keys(FRESH).sort(function (a, b) { return (FRESH[a].lastBathAt || 0) - (FRESH[b].lastBathAt || 0); })[0];
      delete FRESH[oldest];
    }
    stat.washed++;
    return { ok: true, who: who, band: band(0) };
  }
  function bandOf(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who);
    const at = Number(s.at);
    if (!who) return { ok: false, hint: 'missing-who' };
    if (!Number.isFinite(at)) return { ok: false, hint: 'missing-at' };
    const rec = FRESH[who];
    const bathDays = rec ? Math.floor((at - rec.lastBathAt) / 86400000) : null;
    const washDays = rec && rec.lastWashAt ? Math.floor((at - rec.lastWashAt) / 86400000) : null;
    return { ok: true, who: who, bathBand: band(bathDays), washBand: band(washDays) };
  }
  function view() { return { ok: true, rows: Object.keys(FRESH).map(function (k) { return Object.assign({ who: k }, FRESH[k]); }) }; }
  function statView() { return Object.assign({ tracked: Object.keys(FRESH).length }, stat); }
  function reset() { Object.keys(FRESH).forEach(function (k) { delete FRESH[k]; }); stat.baths = 0; stat.washed = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.bathhouseLaundry = {
    openBath: openBath, washGarments: washGarments, bandOf: bandOf, view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/bathhouse-laundry.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/bathhouse-laundry 已加载（2.416.0）');
})();
