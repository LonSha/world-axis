/**
 * WorldAxis engines/pilgrim-flow.js (v2.416.0) — EXV24-7 朝圣香客与香火
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「朝圣 / 香客 / 香火 / 还愿」全仓语料 0 命中。theology-cult 治**教义与教团**，
 *   city-folklore 治**禁忌与节庆** —— 但"远方的人为什么千里而来"这一层是空的：
 *   香客的往来账、还愿的凭证、香火对市集的增益，全都算不出来。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `arrive` 香客到庙 → `registerVow` 许愿（要还的东西说清楚）→
 *   `fulfilVow` 还愿（凭据硬门禁：当初许的什么就还什么）→ 香火档由往来+还愿推。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store：庙在哪、香客是谁，由调用方给。
 *   ② 还愿是硬门禁：还的东西 ≠ 许的东西一律拒收 `vow-mismatch` —— 愿不许赖、也不许换。
 *   ③ 香火档只报档位（冷清/有烟/鼎盛），**不自动生成人流** —— 人流由叙事层真来。
 *   ④ 条数有界（默认 40）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_pilgrim_flow_settings_v1';
  const DEF = { enabled: true, maxRows: 40 };
  const __REG = { key: LS_KEY, def: DEF, module: 'pilgrimFlow', bounds: { maxRows: [8, 128] } };
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
  const stat = { arrivals: 0, vowed: 0, fulfilled: 0, refused: 0, lastReason: '' };
  const TEMPLES = {}; // temple -> {visits, vows:[{id, who, promised, dueDays, at, status}], lastAt}
  const DAY = 86400000;
  function str(v) { return String(v == null ? '' : v).trim(); }
  function shrine(temple) {
    if (!TEMPLES[temple]) {
      if (Object.keys(TEMPLES).length >= settings().maxRows) {
        const oldest = Object.keys(TEMPLES).sort(function (a, b) { return (TEMPLES[a].lastAt || 0) - (TEMPLES[b].lastAt || 0); })[0];
        delete TEMPLES[oldest];
      }
      TEMPLES[temple] = { visits: 0, vows: [], lastAt: null };
    }
    return TEMPLES[temple];
  }
  function band(sh) {
    if (!sh) return '冷清';
    const y = sh.visits + sh.vows.filter(function (v) { return v.status === 'fulfilled'; }).length * 2;
    if (y >= 30) return '鼎盛';
    if (y >= 10) return '有烟';
    return '冷清';
  }
  function arrive(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const temple = str(s.temple), who = str(s.who);
    if (!temple) { stat.refused++; stat.lastReason = 'missing-temple'; return { ok: false, hint: 'missing-temple：到的是哪座庙？' }; }
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：香客是谁？' }; }
    const sh = shrine(temple);
    sh.visits++; sh.lastAt = s.at || null;
    stat.arrivals++;
    return { ok: true, temple: temple, visits: sh.visits, incense: band(sh) };
  }
  function registerVow(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const temple = str(s.temple), who = str(s.who), promised = str(s.promised);
    if (!temple || !who || !promised) { stat.refused++; stat.lastReason = 'missing-party'; return { ok: false, hint: 'missing-party：庙、香客、许愿内容，三样说清' }; }
    const sh = shrine(temple);
    const id = 'vw' + (++stat.vowed);
    sh.vows.push({ id: id, who: who, promised: promised, at: s.at || null, status: 'open' });
    return { ok: true, id: id, temple: temple };
  }
  function fulfilVow(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    let hit = null, host = null;
    Object.keys(TEMPLES).forEach(function (t) {
      const v = TEMPLES[t].vows.find(function (x) { return x.id === str(id) && x.status === 'open'; });
      if (v) { hit = v; host = t; }
    });
    if (!hit) { stat.refused++; stat.lastReason = 'unknown-vow'; return { ok: false, hint: 'unknown-vow：没有这条在还愿期内（open）的愿' }; }
    const paid = str(s.paid);
    if (paid !== hit.promised) { stat.refused++; stat.lastReason = 'vow-mismatch'; return { ok: false, hint: 'vow-mismatch：许的是『' + hit.promised + '』，还的是『' + paid + '』—— 愿不许赖，也不许换' }; }
    hit.status = 'fulfilled';
    stat.fulfilled++;
    return { ok: true, id: hit.id, temple: host, incense: band(TEMPLES[host]) };
  }
  function view(temple) {
    const t = str(temple);
    if (t) { const sh = TEMPLES[t]; return sh ? { ok: true, temple: t, visits: sh.visits, incense: band(sh), vows: JSON.parse(JSON.stringify(sh.vows)) } : { ok: false, hint: 'unknown-temple' }; }
    const rows = Object.keys(TEMPLES).map(function (k) { return { temple: k, visits: TEMPLES[k].visits, incense: band(TEMPLES[k]), openVows: TEMPLES[k].vows.filter(function (v) { return v.status === 'open'; }).length }; })
      .sort(function (a, b) { return b.visits - a.visits; });
    return { ok: true, count: rows.length, rows: rows };
  }
  function statView() { return Object.assign({ temples: Object.keys(TEMPLES).length, openVows: Object.keys(TEMPLES).reduce(function (n, k) { return n + TEMPLES[k].vows.filter(function (v) { return v.status === 'open'; }).length; }, 0) }, stat); }
  function reset() { Object.keys(TEMPLES).forEach(function (k) { delete TEMPLES[k]; }); stat.arrivals = 0; stat.vowed = 0; stat.fulfilled = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.pilgrimFlow = {
    arrive: arrive, registerVow: registerVow, fulfilVow: fulfilVow, view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/pilgrim-flow.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/pilgrim-flow 已加载（2.416.0）');
})();