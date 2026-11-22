/**
 * WorldAxis engines/faction-chronicle.js (v2.303.0)
 * EXV13-3: 历史大事件的跨阵营文献对照档案（Multi-Factions Historiography）
 *
 * 核心功能：
 *   1. 跨阵营史料收录（archiveFactionRecord）：
 *      对同一历史重大冲突事件（eventId），允许多个阵营（factionId）登记各自具有主观偏见的 perspectiveText 与 claims；
 *   2. 跨阵营文献对照（comparePerspectives）：
 *      对比同一事件在不同势力的立场差异、主张分歧（claimDiscrepancies）与事实核心；
 *   3. 豁免与合法性条款检索（findExemptionClause）：
 *      在文献档案中检索针对古老盟约/债务的豁免条款与历史停火协议。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };

  const LS_KEY = 'worldaxis_faction_chronicle_settings_v1';
  const DEF = { enabled: true, maxEvents: 60 };
  const __REG = { key: LS_KEY, def: DEF, module: 'factionChronicle', bounds: {} };

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
    draft.factionChronicle = draft.factionChronicle && typeof draft.factionChronicle === 'object' && !Array.isArray(draft.factionChronicle)
      ? draft.factionChronicle : { archives: {} };
    if (!draft.factionChronicle.archives || typeof draft.factionChronicle.archives !== 'object') {
      draft.factionChronicle.archives = {};
    }
    return draft.factionChronicle;
  }

  const _stat = {
    archived: 0,
    compared: 0,
    exemptionsFound: 0,
    refused: 0,
    lastReason: ''
  };

  /**
   * 1. 归档阵营史料
   */
  function archiveFactionRecord(spec) {
    const s = spec || {};
    const eid = clean(s.eventId, 60);
    const fid = clean(s.factionId, 40);
    const title = clean(s.title, 80);
    const perspectiveText = clean(s.perspectiveText || s.text, 300);
    const claims = Array.isArray(s.claims) ? s.claims.map(function (c) { return clean(c, 80); }).filter(Boolean) : [];
    const exemptions = Array.isArray(s.exemptions) ? s.exemptions.map(function (e) { return clean(e, 100); }).filter(Boolean) : [];

    if (!eid || !fid || !perspectiveText) {
      _stat.refused++;
      _stat.lastReason = 'missing-fields';
      return { ok: false, reason: 'missing-fields' };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const evArchive = bag.archives[eid] || (bag.archives[eid] = {
        eventId: eid,
        eventTitle: title || eid,
        records: {}
      });

      const now = clockNow('factionChronicle');
      const record = {
        factionId: fid,
        title: title || evArchive.eventTitle,
        perspectiveText: perspectiveText,
        claims: claims,
        exemptions: exemptions,
        archivedAt: now
      };

      evArchive.records[fid] = record;
      out = { ok: true, eventId: eid, factionId: fid, record: record };
      return true;
    }, 'factionChronicle:archiveFactionRecord');

    if (out && out.ok) {
      _stat.archived++;
      _stat.lastReason = 'archived';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 2. 对照跨阵营史料
   */
  function comparePerspectives(eventId) {
    const eid = clean(eventId, 60);
    if (!eid) {
      _stat.refused++;
      return { ok: false, reason: 'missing-event-id' };
    }

    const s = state();
    const bag = (s.factionChronicle && s.factionChronicle.archives) ? s.factionChronicle.archives : {};
    const evArchive = bag[eid];

    if (!evArchive || !evArchive.records) {
      return { ok: false, reason: 'no-archive-found', eventId: eid };
    }

    const factions = Object.keys(evArchive.records);
    const allClaims = {};
    const allExemptions = [];

    factions.forEach(function (f) {
      const rec = evArchive.records[f];
      allClaims[f] = rec.claims || [];
      if (Array.isArray(rec.exemptions)) {
        rec.exemptions.forEach(function (ex) {
          allExemptions.push({ faction: f, clause: ex });
        });
      }
    });

    _stat.compared++;
    _stat.lastReason = 'compared';

    return {
      ok: true,
      eventId: eid,
      factionCount: factions.length,
      factions: factions,
      perspectives: JSON.parse(JSON.stringify(evArchive.records)),
      claimsComparison: allClaims,
      exemptionClauses: allExemptions
    };
  }

  /**
   * 3. 寻找豁免条款
   */
  function findExemptionClause(eventId, keyword) {
    const comp = comparePerspectives(eventId);
    if (!comp || !comp.ok) return comp;

    const kw = clean(keyword, 40);
    const matched = (comp.exemptionClauses || []).filter(function (item) {
      return !kw || item.clause.indexOf(kw) >= 0;
    });

    if (matched.length > 0) {
      _stat.exemptionsFound++;
      _stat.lastReason = 'exemption-found';
    }

    return {
      ok: true,
      eventId: clean(eventId, 60),
      keyword: kw,
      foundCount: matched.length,
      exemptions: matched
    };
  }

  function stat() {
    return Object.assign({}, _stat);
  }

  WA.factionChronicle = {
    archiveFactionRecord: archiveFactionRecord,
    comparePerspectives: comparePerspectives,
    findExemptionClause: findExemptionClause,
    stat: stat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/faction-chronicle.js', { kind: 'engine', ver: '2.303.0' });
  }
})();
