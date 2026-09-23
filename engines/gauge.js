/**
 * WorldAxis engines/gauge.js (v2.70.0)
 * 阻尼量规：0..100 推进度 × 单步阻尼限幅 × 四大里程碑事件。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_gauge_settings_v1';
  const DEF = { enabled: false, maxRows: 16, maxStep: 35 };
  const __REG = { key: LS_KEY, def: DEF, module: 'gauge', bounds: { maxRows: [4, 32], maxStep: [5, 100] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const MILESTONES = [25, 50, 75, 100];
  const DEFAULT_MAX_STEP = 35;

  function rows() {
    const s = (WA.store && WA.store.get()) || {};
    return (s.gauge && s.gauge.rows) || [];
  }

  function create(key, opts) {
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    if (!key || typeof key !== 'string') return { ok: false, reason: 'missing-fields' };
    const o = opts || {};
    const initVal = typeof o.initial === 'number' ? Math.max(0, Math.min(100, o.initial)) : 0;
    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.gauge) draft.gauge = { rows: [] };
      const list = draft.gauge.rows || [];
      const existing = list.filter(function (r) { return r && r.key === key; })[0];
      if (existing && !o.force) {
        out = { ok: false, reason: 'exists', key: key };
        return;
      }
      const record = {
        key: key,
        val: initVal,
        desc: o.desc || key,
        history: [{ at: clockNow('gauge'), from: 0, to: initVal, ev: 'init' }]
      };
      if (existing) Object.assign(existing, record);
      else list.push(record);
      if (WA.evict) WA.evict.array(list, 'gauge.rows');
      out = { ok: true, key: key, val: initVal };
    }, 'gauge.create');
    return out;
  }

  function step(key, delta, event) {
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    if (!key || typeof delta !== 'number') return { ok: false, reason: 'missing-fields' };
    const lim = (settings().maxStep > 0) ? settings().maxStep : DEFAULT_MAX_STEP;
    if (Math.abs(delta) > lim) return { ok: false, reason: 'step-too-large', delta: delta, limit: lim };

    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.gauge) draft.gauge = { rows: [] };
      const list = draft.gauge.rows || [];
      const hit = list.filter(function (r) { return r && r.key === key; })[0];
      if (!hit) { out = { ok: false, reason: 'missing', key: key }; return; }
      if (hit.val >= 100 && delta > 0) { out = { ok: false, reason: 'top', key: key, val: hit.val }; return; }

      const nextVal = Math.max(0, Math.min(100, hit.val + delta));
      let crossedMilestone = null;
      for (let i = 0; i < MILESTONES.length; i++) {
        const ms = MILESTONES[i];
        if (hit.val < ms && nextVal >= ms) {
          crossedMilestone = ms;
          break;
        }
      }

      if (crossedMilestone !== null && (!event || typeof event !== 'string')) {
        out = { ok: false, reason: 'missing-event', key: key, milestone: crossedMilestone };
        return;
      }

      const prev = hit.val;
      hit.val = nextVal;
      if (!Array.isArray(hit.history)) hit.history = [];
      hit.history.push({ at: clockNow('gauge'), from: prev, to: nextVal, ev: event || 'step' });
      if (WA.evict) WA.evict.array(hit.history, 'gauge.history');
      out = { ok: true, key: key, from: prev, to: nextVal, crossed: crossedMilestone };
    }, 'gauge.step');
    return out;
  }

  function read(key) {
    if (!key) return { ok: false, reason: 'missing-fields' };
    const hit = rows().filter(function (r) { return r && r.key === key; })[0];
    if (!hit) return { ok: false, reason: 'missing', key: key };
    return { ok: true, key: hit.key, val: hit.val, desc: hit.desc, historyCount: (hit.history || []).length };
  }

  function buildBlock() {
    if (!settings().enabled) return '';
    const list = rows().filter(function (r) { return r && r.key; });
    if (!list.length) return '';
    const lines = ['[阻尼量规] 进度与高潮发展阻尼器：'];
    list.forEach(function (r) {
      lines.push('· ' + r.key + '（' + r.desc + '）: ' + r.val + '% [阻尼限制: 单步<=' + (settings().maxStep || DEFAULT_MAX_STEP) + '%]');
    });
    return lines.join('\n');
  }

  WA.gauge = {
    MILESTONES: MILESTONES,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    create: create,
    step: step,
    read: read,
    buildBlock: buildBlock
  };
})();
