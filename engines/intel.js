/**
 * WorldAxis engines/intel.js (v2.53.0)
 * 因果与情报：可追溯事件链、带来源的人物认知。
 *
 * 边界：
 *   1 总开关默认关闭；关闭时不推进、不注入。
 *   2 因果必须指向已存在的事实、事件或上一环，不凭空生成原因。
 *   3 情报必须有来源与置信度；低置信只能标为怀疑，不能升格为事实。
 *   4 人物只能使用自己持有的情报，不把全知伪装成推理。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };
  const LS_KEY = 'worldaxis_intel_settings_v1';
  const DEF = { enabled: false, maxLinks: 4, maxItems: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'intel', bounds: { maxLinks: [1, 8], maxItems: [1, 4] } };
  const LEVELS = ['rumor', 'report', 'witness', 'record'];
  const CONF = { rumor: 25, report: 55, witness: 75, record: 90 };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { links: 0, intel: 0, blocked: 0, lastReason: '' };
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 80); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function knownCause(id) {
    const key = clean(id, 80); if (!key) return false;
    const st = state();
    const facts = [].concat(st.worldFacts || [], (st.memory || {}).facts || []);
    const events = ((st.evolution || {}).events || []);
    const currents = st.currents || [];
    return facts.some(function (x) { return x && (x.id === key || x.key === key); })
      || events.some(function (x) { return x && x.id === key; })
      || currents.some(function (x) { return x && (x.id === key || (x.causes || []).indexOf(key) >= 0); });
  }
  function addLink(item) {
    const cause = clean(item && item.cause, 80), effect = clean(item && item.effect, 80);
    if (!cause || !effect) return { ok: false, reason: 'missing-fields' };
    if (cause === effect) return { ok: false, reason: 'self-cause' };
    if (!knownCause(cause)) return { ok: false, reason: 'unknown-cause' };
    let out = null;
    WA.store.transact(function (draft) {
      draft.currents = Array.isArray(draft.currents) ? draft.currents : [];
      const row = draft.currents.filter(function (x) { return x && x.id === effect; })[0];
      const target = row || { id: effect, title: effect, summary: '', visibility: 'trace', causes: [], participants: [], stage: 'open', createdAt: clockNow('intel'), updatedAt: 0 };
      target.causes = Array.isArray(target.causes) ? target.causes : [];
      if (target.causes.indexOf(cause) < 0) target.causes.push(cause);
      target.updatedAt = clockNow('intel');
      if (!row) draft.currents.push(target);
      if (draft.currents.length > 40) draft.currents.splice(0, draft.currents.length - 40);
      out = { ok: true, id: target.id, causes: target.causes.slice() };
    }, 'intel:add-link');
    if (out && out.ok) { stat.links++; stat.lastReason = 'linked'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function addIntel(person, item) {
    const who = clean(person, 60), claim = clean(item && item.claim, 100), source = clean(item && item.source, 60);
    const level = LEVELS.indexOf(item && item.level) >= 0 ? item.level : '';
    if (!who || !claim || !source || !level) return { ok: false, reason: 'missing-fields' };
    const about = clean(item.about, 80);
    if (about && !knownCause(about)) return { ok: false, reason: 'unknown-subject' };
    let out = null;
    WA.store.transact(function (draft) {
      const id = 'p_' + who;
      const p = draft.people[id] || (draft.people[id] = { id: id, name: who, knowledge: {} });
      p.knowledge = p.knowledge && typeof p.knowledge === 'object' ? p.knowledge : {};
      p.knowledge.intel = Array.isArray(p.knowledge.intel) ? p.knowledge.intel : [];
      const row = { id: 'intel_' + clockNow('intel') + '_' + p.knowledge.intel.length, claim: claim, source: source, level: level, confidence: CONF[level], about: about, status: CONF[level] >= 75 ? 'believed' : 'suspected', at: clockNow('intel') };
      p.knowledge.intel = p.knowledge.intel.concat([row]).slice(-12);
      out = { ok: true, id: row.id, status: row.status };
    }, 'intel:add');
    if (out && out.ok) { stat.intel++; stat.lastReason = 'recorded'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function visibleTo(person, subject) {
    const who = clean(person, 60), about = clean(subject, 80);
    const p = (state().people || {})['p_' + who];
    const rows = p && p.knowledge && Array.isArray(p.knowledge.intel) ? p.knowledge.intel : [];
    return rows.filter(function (x) { return !about || x.about === about; }).slice(-4);
  }
  function explain(effect) {
    const key = clean(effect, 80);
    const row = (state().currents || []).filter(function (x) { return x && x.id === key; })[0];
    if (!row) return { ok: false, reason: 'missing-effect' };
    const causes = (row.causes || []).filter(knownCause);
    return causes.length ? { ok: true, id: row.id, causes: causes } : { ok: false, reason: 'unexplained' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const currents = (state().currents || []).filter(function (x) { return x && Array.isArray(x.causes) && x.causes.length; }).slice(-cfg.maxLinks);
    const people = Object.values(state().people || {}).filter(function (p) { return p && p.knowledge && Array.isArray(p.knowledge.intel) && p.knowledge.intel.length; }).slice(0, cfg.maxItems);
    const lines = [];
    currents.forEach(function (x) { lines.push('因果：' + x.causes.slice(-2).join('、') + ' → ' + (x.title || x.id)); });
    people.forEach(function (p) {
      const rows = p.knowledge.intel.slice(-cfg.maxItems);
      lines.push(p.name + '：' + rows.map(function (x) { return x.status + '「' + x.claim + '」（来源 ' + x.source + '，' + x.confidence + '）'; }).join('；'));
    });
    return lines.length ? '[因果与情报]\n' + lines.join('\n') + '\n人物只能依据自己持有的情报行动；怀疑不得写成既成事实，缺少来源的内容不得补写。' : '';
  }
  WA.intel = {
    LEVELS: LEVELS, CONFIDENCE: CONF,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    addLink: addLink, addIntel: addIntel, visibleTo: visibleTo, explain: explain, knownCause: knownCause, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
})();
