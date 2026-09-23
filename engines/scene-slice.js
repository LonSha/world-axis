/**
 * WorldAxis engines/scene-slice.js (v2.70.0)
 * 情境切片契约：空间属性 × 恶劣天气挂起 × 自然时段七档收敛。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_scene_slice_settings_v1';
  const DEF = { enabled: false, maxRows: 20 };
  const __REG = { key: LS_KEY, def: DEF, module: 'sceneSlice', bounds: { maxRows: [4, 40] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const ENV_TYPES = ['indoor', 'outdoor'];
  const SEGMENTS = [
    { id: 'dawn', label: '清早', start: 5 * 60, end: 8 * 60 - 1 },
    { id: 'morning', label: '午前', start: 8 * 60, end: 11 * 60 - 1 },
    { id: 'noon', label: '午时', start: 11 * 60, end: 13 * 60 - 1 },
    { id: 'afternoon', label: '午后', start: 13 * 60, end: 17 * 60 - 1 },
    { id: 'dusk', label: '傍晚', start: 17 * 60, end: 20 * 60 - 1 },
    { id: 'night', label: '夜晚', start: 20 * 60, end: 24 * 60 - 1 },
    { id: 'midnight', label: '凌晨', start: 0, end: 5 * 60 - 1 }
  ];

  function rows() {
    const s = (WA.store && WA.store.get()) || {};
    return (s.sceneSlice && s.sceneSlice.rows) || [];
  }

  function parseMinutes(str) {
    if (!str || typeof str !== 'string') return -1;
    const m = str.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return -1;
    const hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return -1;
    return hh * 60 + mm;
  }

  function resolveSegment(timeStr) {
    const mins = parseMinutes(timeStr);
    if (mins < 0) return { ok: false, reason: 'bad-time', got: timeStr };
    for (let i = 0; i < SEGMENTS.length; i++) {
      const seg = SEGMENTS[i];
      if (mins >= seg.start && mins <= seg.end) {
        return { ok: true, segment: seg.id, label: seg.label, minutes: mins };
      }
    }
    return { ok: true, segment: 'midnight', label: '凌晨', minutes: mins };
  }

  function set(place, env, opts) {
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    if (!place || typeof place !== 'string' || !env) return { ok: false, reason: 'missing-fields' };
    const e = String(env).toLowerCase();
    if (ENV_TYPES.indexOf(e) < 0) return { ok: false, reason: 'bad-env', got: env };

    const o = opts || {};
    let timeSeg = null;
    if (o.time) {
      const res = resolveSegment(o.time);
      if (!res.ok) return res;
      timeSeg = res;
    }

    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.sceneSlice) draft.sceneSlice = { rows: [] };
      const list = draft.sceneSlice.rows || [];
      const existing = list.filter(function (r) { return r && r.place === place; })[0];
      const record = {
        place: place,
        env: e,
        weatherSuppressed: (e === 'indoor'),
        segment: timeSeg ? timeSeg.segment : (existing ? existing.segment : 'noon'),
        segmentLabel: timeSeg ? timeSeg.label : (existing ? existing.segmentLabel : '午时'),
        at: clockNow('sceneSlice')
      };
      if (existing) {
        Object.assign(existing, record);
      } else {
        list.push(record);
      }
      if (WA.evict) WA.evict.array(list, 'sceneSlice.rows');
      out = { ok: true, place: place, env: e, weatherSuppressed: record.weatherSuppressed, segment: record.segment };
    }, 'sceneSlice.set');
    return out;
  }

  function read(place) {
    if (!place) return { ok: false, reason: 'missing-fields' };
    const hit = rows().filter(function (r) { return r && r.place === place; })[0];
    if (!hit) return { ok: false, reason: 'missing', place: place };
    return { ok: true, place: hit.place, env: hit.env, weatherSuppressed: hit.weatherSuppressed, segment: hit.segment, segmentLabel: hit.segmentLabel };
  }

  function buildBlock() {
    if (!settings().enabled) return '';
    const list = rows().filter(function (r) { return r && r.place; });
    if (!list.length) return '';
    const lines = ['[情境切片] 场景空间与自然时段契约：'];
    list.forEach(function (r) {
      const wNote = r.weatherSuppressed ? '（室内：恶劣天气挂起）' : '（室外：承受天气全量修正）';
      lines.push('· ' + r.place + ' ｜ ' + (r.env === 'indoor' ? '室内' : '室外') + wNote + ' ｜ 时段: ' + r.segmentLabel);
    });
    return lines.join('\n');
  }

  WA.sceneSlice = {
    ENV_TYPES: ENV_TYPES,
    SEGMENTS: SEGMENTS,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    resolveSegment: resolveSegment,
    set: set,
    read: read,
    buildBlock: buildBlock
  };
})();
