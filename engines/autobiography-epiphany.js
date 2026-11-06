/**
 * WorldAxis engines/autobiography-epiphany.js (v2.303.0)
 * EXV13-2: 角色自传性回忆重构与心路沙盘（Autobiographical Reshaping）
 *
 * 核心机制：
 *   1. 顿悟与主观回忆重构（triggerEpiphany）：
 *      角色遭遇背叛、破产或创伤时，主观覆写对过去关键里程碑事件的归因与回忆文本（自述而非客观记载）；
 *   2. 角色自传调阅（viewAutobiography）：
 *      聚合客观历史记录与角色主观解释层（interpretations），展现心理认知演进；
 *   3. 心理偏执度/执念积累（cynicism / fixation）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };

  const LS_KEY = 'worldaxis_autobiography_epiphany_settings_v1';
  const DEF = { enabled: true, maxMemories: 40 };
  const __REG = { key: LS_KEY, def: DEF, module: 'autobiographyEpiphany', bounds: {} };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function ensure(draft) {
    draft.autobiography = draft.autobiography && typeof draft.autobiography === 'object' && !Array.isArray(draft.autobiography)
      ? draft.autobiography : { actors: {} };
    if (!draft.autobiography.actors || typeof draft.autobiography.actors !== 'object') {
      draft.autobiography.actors = {};
    }
    return draft.autobiography;
  }

  const _stat = {
    epiphanies: 0,
    views: 0,
    refused: 0,
    lastReason: ''
  };

  /**
   * 1. 触发顿悟重构（triggerEpiphany）
   */
  function triggerEpiphany(actorId, eventId, newInterpretation, rationale, opts) {
    const aid = clean(actorId, 40);
    const eid = clean(eventId, 60);
    const text = clean(newInterpretation, 200);
    const why = clean(rationale, 150);
    const o = opts || {};

    if (!aid || !eid || !text) {
      _stat.refused++;
      _stat.lastReason = 'missing-epiphany-fields';
      return { ok: false, reason: 'missing-epiphany-fields' };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const actorMem = bag.actors[aid] || (bag.actors[aid] = {
        interpretations: {},
        cynicism: 0,
        epiphanyHistory: []
      });

      const now = clockNow('autobiographyEpiphany');
      const prev = actorMem.interpretations[eid] || null;

      actorMem.interpretations[eid] = {
        eventId: eid,
        originalText: prev ? prev.newText : (o.originalText || '最初以为只是偶然事件'),
        newText: text,
        rationale: why,
        reshapedAt: now,
        shiftDelta: clean(o.shiftDelta || 'gratitude_to_distrust', 40)
      };

      actorMem.cynicism = (actorMem.cynicism || 0) + (typeof o.cynicismGain === 'number' ? o.cynicismGain : 25);
      actorMem.epiphanyHistory.push({
        eventId: eid,
        at: now,
        rationale: why
      });

      out = {
        ok: true,
        actorId: aid,
        eventId: eid,
        cynicism: actorMem.cynicism,
        record: actorMem.interpretations[eid]
      };
      return true;
    }, 'autobiographyEpiphany:triggerEpiphany');

    if (out && out.ok) {
      _stat.epiphanies++;
      _stat.lastReason = 'epiphany_recorded';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 2. 调阅角色自传回忆（viewAutobiography）
   */
  function viewAutobiography(actorId) {
    const aid = clean(actorId, 40);
    if (!aid) {
      _stat.refused++;
      return { ok: false, reason: 'missing-actor-id' };
    }

    const s = state();
    const bag = (s.autobiography && s.autobiography.actors) ? s.autobiography.actors : {};
    const mem = bag[aid] || { interpretations: {}, cynicism: 0, epiphanyHistory: [] };

    _stat.views++;
    _stat.lastReason = 'viewed';

    return {
      ok: true,
      actorId: aid,
      cynicism: mem.cynicism || 0,
      interpretationCount: Object.keys(mem.interpretations || {}).length,
      interpretations: JSON.parse(JSON.stringify(mem.interpretations || {})),
      history: JSON.parse(JSON.stringify(mem.epiphanyHistory || []))
    };
  }

  function stat() {
    return Object.assign({}, _stat);
  }

  WA.autobiographyEpiphany = {
    triggerEpiphany: triggerEpiphany,
    viewAutobiography: viewAutobiography,
    stat: stat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/autobiography-epiphany.js', { kind: 'engine', ver: '2.303.0' });
  }
})();
