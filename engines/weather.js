/**
 * WorldAxis engines/weather.js (v2.65.0)
 * \u5929\u6c14\u4e0e\u7269\u5019\uff1a\u628a\u5b63\u8282\u4e0e\u5929\u6c14\u843d\u6210**\u53ef\u67e5\u8be2\u7684\u7ed3\u7b97\u4fee\u6b63**\uff0c\u800c\u4e0d\u662f\u63cf\u5199\u3002
 *
 * \u7f1d\u5408\u6765\u6e90\uff1a\u771f\u5b9e\u7684\u4e16\u754c v0.46\u300c\u771f\u5b9e\u7684\u5929\u6c14\u4e0e\u5b63\u8282\u7cfb\u7edf\u300d\u3002\u90a3\u4e00\u6761\u662f\u7ed9\u6a21\u578b\u7684\u63cf\u5199\u6307\u4ee4\uff1b
 * \u672c\u6a21\u5757\u53ea\u53d6\u5b83\u7684\u7ed3\u7b97\u542b\u4e49\uff1a\u9177\u6691\u3001\u66b4\u96e8\u3001\u4e25\u5bd2\u6539\u53d8\u7684\u662f**\u8017\u65f6\u4e0e\u4e8b\u4ef6\u6743\u91cd**\uff0c\u4e0d\u662f\u6587\u98ce\u3002
 *
 * \u8fb9\u754c\uff08\u5168\u662f\u5426\u5b9a\u5f0f\uff09\uff1a
 *   1 \u603b\u5f00\u5173\u9ed8\u8ba4\u5173\u95ed\u3002\u5173\u95ed\u65f6\u4e0d\u63a8\u6f14\u3001\u4e0d\u6ce8\u5165\uff0c\u4e14 travelFactor() \u6052\u4e3a 1\uff08\u4e0d\u6539\u53d8\u4efb\u4f55\u8017\u65f6\uff09\u3002
 *   2 \u5929\u6c14\u4e0d\u5f97\u51ed\u7a7a\u751f\u6210\u3002\u6ca1\u6709 setWeather \u8fc7\u7684\u5730\u70b9\uff0cweatherOf \u62a5 missing\uff0c
 *     \u4e0d\u56de\u843d\u6210\u300c\u6674\u300d\u2014\u2014\u300c\u6ca1\u8bf4\u5929\u6c14\u5c31\u5f53\u6674\u5929\u300d\u662f\u672c\u4ed3\u5e93\u6700\u8d35\u7684\u4e00\u7c7b\u9ed8\u8ba4\u503c\u3002
 *   3 \u4fee\u6b63\u53ea\u6765\u81ea\u5df2\u767b\u8bb0\u7684\u5929\u6c14\uff0ceffect() \u5bf9\u672a\u767b\u8bb0\u5730\u70b9\u62a5 unknown-place\uff0c\u4e0d\u7ed9\u4e00\u4e2a\u515c\u5e95\u7cfb\u6570\u3002
 *   4 \u5b63\u8282\u7531\u4e16\u754c\u949f\u7684 dayIndex \u6d3e\u751f\uff08\u6bcf 90 \u5929\u4e00\u5b63\uff09\uff0c\u4e0d\u53e6\u7ef4\u62a4\u4e00\u4efd\u300c\u4eca\u5929\u662f\u51e0\u6708\u300d\u3002
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_weather_settings_v1';
  const DEF = { enabled: false, maxItems: 4 };
  const __REG = { key: LS_KEY, def: DEF, module: 'weather', bounds: { maxItems: [1, 8] } };
  const WEATHERS = ['clear', 'rain', 'storm', 'snow', 'heat', 'fog'];
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  // \u8017\u65f6\u4e58\u6570\uff1a1 = \u4e0d\u53d8\u3002\u53ea\u6709\u771f\u6b63\u6539\u53d8\u884c\u7a0b\u7684\u5929\u6c14\u624d\u5927\u4e8e 1\u3002
  const FACTOR = { clear: 1, fog: 1.25, rain: 1.5, heat: 1.5, snow: 2, storm: 2 };
  // \u4e8b\u4ef6\u6743\u91cd\u504f\u79fb\uff1a\u6b63\u6570\u63d0\u9ad8\u8be5\u7c7b\u4e8b\u4ef6\u6743\u91cd\uff0c\u4f9b horizon \u7b49\u6d88\u8d39\u65b9\u8bfb\u3002\u672c\u6a21\u5757\u4e0d\u81ea\u5df1\u6295\u9ab0\u3002
  const WEIGHT = {
    clear: {}, fog: { delay: 1 }, rain: { delay: 1, indoor: 1 },
    storm: { delay: 2, shelter: 2 }, snow: { delay: 2, cold: 1 }, heat: { rest: 2, water: 1 }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { sets: 0, blocked: 0, lastReason: '', faults: {} };
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const w = state().weather; return (w && Array.isArray(w.rows)) ? w.rows : []; }
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }

  /** \u5b63\u8282\u53ea\u7531\u4e16\u754c\u949f\u6d3e\u751f\u3002\u65e0\u949f\u5219\u62a5 no-clock\uff0c\u4e0d\u731c\u300c\u5927\u6982\u662f\u6625\u5929\u300d\u3002 */
  function season() {
    const st = state();
    const day = st.clock && isFinite(Number(st.clock.dayIndex)) ? Number(st.clock.dayIndex) : null;
    if (day === null) return { ok: false, reason: 'no-clock' };
    return { ok: true, season: SEASONS[Math.floor(day / 90) % 4], day: day };
  }

  /** \u767b\u8bb0\u67d0\u5730\u7684\u5929\u6c14\u3002\u5730\u70b9\u5fc5\u987b\u5df2\u5728 world \u767b\u8bb0\uff1b\u5929\u6c14\u5fc5\u987b\u5728\u767d\u540d\u5355\u5185\u3002\u540c\u5730\u8986\u76d6\u800c\u4e0d\u65b0\u589e\u884c\u3002 */
  function setWeather(place, kind) {
    const pl = clean(place, 40), k = clean(kind, 12);
    if (!pl || !k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (WEATHERS.indexOf(k) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', kinds: WEATHERS.slice() }; }
    if (!WA.world || typeof WA.world.reach !== 'function') { noteFault('world-missing'); return { ok: false, reason: 'world-missing' }; }
    const known = WA.world.reach(pl, pl);
    if (!known.ok) { noteFault(known.reason); return { ok: false, reason: known.reason, place: pl }; }
    let out = null;
    WA.store.transact(function (draft) {
      draft.weather = draft.weather && typeof draft.weather === 'object' && !Array.isArray(draft.weather) ? draft.weather : {};
      draft.weather.rows = Array.isArray(draft.weather.rows) ? draft.weather.rows : [];
      const hit = draft.weather.rows.filter(function (x) { return x && x.place === pl; })[0];
      if (hit) { hit.kind = k; hit.at = clockNow('weather'); out = { ok: true, place: pl, kind: k, existed: true }; return; }
      draft.weather.rows.push({ place: pl, kind: k, at: clockNow('weather') });
      WA.evict.array(draft.weather.rows, 'weather.rows');
      out = { ok: true, place: pl, kind: k, existed: false };
    }, 'weather:set');
    if (out && out.ok) { stat.sets++; stat.lastReason = out.existed ? 'updated' : 'set'; } else noteFault('store-unavailable');
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** \u67e5\u67d0\u5730\u5929\u6c14\u3002\u6ca1\u767b\u8bb0\u5c31\u662f missing\uff0c\u4e0d\u56de\u843d\u6210\u6674\u3002 */
  function weatherOf(place) {
    const pl = clean(place, 40);
    if (!pl) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const hit = rows().filter(function (x) { return x && x.place === pl; })[0];
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', place: pl }; }
    return { ok: true, place: pl, kind: hit.kind, factor: FACTOR[hit.kind] };
  }

  /**
   * \u7ed3\u7b97\u4fee\u6b63\u3002\u5173\u95ed\u65f6 factor \u6052\u4e3a 1\uff08\u4e0d\u6539\u53d8\u4efb\u4f55\u8017\u65f6\uff09\uff1b\u5f00\u542f\u4f46\u8be5\u5730\u672a\u767b\u8bb0\u5929\u6c14\u5219\u62a5 missing\uff0c
   * **\u4e0d\u7ed9\u515c\u5e95\u7cfb\u6570**\u2014\u2014\u8c03\u7528\u65b9\u5fc5\u987b\u81ea\u5df1\u51b3\u5b9a\u600e\u4e48\u529e\uff0c\u4e0d\u5f97\u88ab\u672c\u51fd\u6570\u66ff\u4ed6\u5047\u8bbe\u4e00\u4e2a\u3002
   */
  function effect(place) {
    const cfg = settings();
    const pl = clean(place, 40);
    if (!pl) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!cfg.enabled) return { ok: true, place: pl, factor: 1, weights: {}, reason: 'disabled' };
    const w = weatherOf(pl);
    if (!w.ok) return w;
    return { ok: true, place: pl, kind: w.kind, factor: FACTOR[w.kind], weights: Object.assign({}, WEIGHT[w.kind] || {}), season: season() };
  }

  /** \u8017\u65f6\u6362\u7b97\uff1a\u539f\u59cb\u5206\u949f \u00d7 \u4fee\u6b63\uff0c\u5411\u4e0a\u53d6\u6574\u3002\u5173\u95ed\u6216\u672a\u767b\u8bb0\u65f6**\u539f\u6837\u8fd4\u56de\u539f\u503c\u5e76\u5199\u660e\u7406\u7531**\uff0c\u4e0d\u9759\u9ed8\u6539\u5199\u3002 */
  function travelMinutes(place, minutes) {
    const base = Number(minutes);
    if (!isFinite(base) || base < 0) { noteFault('bad-minutes'); return { ok: false, reason: 'bad-minutes' }; }
    const e = effect(place);
    if (!e.ok) return e;
    return { ok: true, place: clean(place, 40), base: base, factor: e.factor, minutes: Math.ceil(base * e.factor), reason: e.reason || 'applied' };
  }

  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(0, Math.max(1, cfg.maxItems));
    if (!list.length) return '';
    const sea = season();
    const lines = list.map(function (x) { return x.place + '\uff1a' + x.kind + '\uff08\u8017\u65f6 \u00d7' + FACTOR[x.kind] + '\uff09'; });
    let out = '[\u5929\u6c14\u4e0e\u7269\u5019]\n' + (sea.ok ? ('\u5b63\u8282\uff1a' + sea.season + '\n') : '') + lines.join('\n');
    out += '\n\u5929\u6c14\u6539\u53d8\u7684\u662f\u8017\u65f6\u4e0e\u4e8b\u4ef6\u6743\u91cd\uff0c\u4e0d\u662f\u63cf\u5199\uff1b\u672a\u767b\u8bb0\u5929\u6c14\u7684\u5730\u70b9\u4e0d\u5f97\u88ab\u5199\u6210\u6674\u5929\u3002';
    return out + '\n';
  }

  WA.weather = {
    WEATHERS: WEATHERS, SEASONS: SEASONS, FACTOR: FACTOR,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    season: season, setWeather: setWeather, weatherOf: weatherOf, effect: effect, travelMinutes: travelMinutes,
    buildBlock: buildBlock, stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
