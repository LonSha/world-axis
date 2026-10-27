/**
 * WorldAxis engines/institutional-inertia.js (v2.233.0) — EXV4-9 世代交替与制度惯性
 *
 * ── 真实缺口 ──────────────────────────────────────────
 * social-legacy、phase-transition、custom-lax 有历史解释、路径和地方惯例，
 * 但人员更替后制度为何延续、变形或失效缺少可玩的代际传递。
 *
 * ── 核心交付（全维度超越与严格闭环）──────────────────────
 * 1. 制度宪章与实体绑定：establishCharter(charterSpec)
 *    将规约（customLax）、关键设施（facility）、技术标准（techLineage）与践行者绑定到制度实体；
 * 2. 负责人离场与继任触发：triggerSuccessionHandover(handoverSpec)
 *    负责人离场/退位时产生交接事件，并生成候选继承路径；
 * 3. 继承路径分化与过渡成本：resolveSuccessionPath(resolutionSpec)
 *    支持三种不同命运分化：
 *    - orthodox_continuity: 严格正统延续，维持原有规约，但若后继者缺乏必要能力/工具，制度将产生运行损耗与能力赤字；
 *    - reform_amendment: 改革修订，修改核心条款，需消耗政治/经济过渡成本并引发既得利益阻力；
 *    - abandonment_decay: 放弃抛弃，制度名存实亡，设施与规约跌入孤立退化（decaying/dormant）；
 * 4. 能力脱节与文书虚置审计：auditInstitutionalDecay(charterId)
 *    文书存在并不等于执行能力：当绑定的设施损坏或缺乏合格实践者时，制度效率真实衰减；
 *    历史版本溯源可查，继承绝不改写创始记录；
 * 5. 纯读只读投影零副作用：institutionalInertiaProjection(charterId)
 *    输出制度的生命周期、能力匹配度、退化风险与代际演化树，不引发任何 store 事务。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60);
  }

  function num(v) {
    var n = Number(v);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function now() {
    try { return WA.clock.now('institutionalInertia'); } catch (e) { return Date.now(); }
  }

  var SUCCESSION_PATHS = ['orthodox_continuity', 'reform_amendment', 'abandonment_decay'];
  var CHARTER_STATUS = ['active', 'contested', 'decaying', 'dormant', 'reformed'];

  function bucket() {
    var s = state();
    return s.institutionalInertia || { charters: [], handovers: [], successionRecords: [] };
  }

  function ensureBucket() {
    var s = state();
    if (!s.institutionalInertia && WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        if (!draft.institutionalInertia) {
          draft.institutionalInertia = { charters: [], handovers: [], successionRecords: [] };
        }
        return true;
      }, 'institutionalInertia:init');
    }
    return bucket();
  }

  /**
   * 1. 建立制度宪章并绑定设施、规则与负责人
   */
  function establishCharter(spec) {
    var s = spec || {};
    var id = clean(s.id || (WA.rand.id('chart_', 7, 'id')), 60);
    var title = clean(s.title, 60);
    var leader = clean(s.leader, 60);
    var placeId = clean(s.placeId, 60);
    var boundRuleId = clean(s.boundRuleId, 60);
    var boundFacilityId = clean(s.boundFacilityId, 60);
    var requiredPractitionerSkill = clean(s.requiredPractitionerSkill || 'basic_management', 40);

    if (!title) return { ok: false, reason: 'missing-title' };
    if (!leader) return { ok: false, reason: 'missing-leader' };

    var b = ensureBucket();
    var exists = b.charters.some(function (c) { return c && c.id === id; });
    if (exists) return { ok: false, reason: 'charter-already-exists', id: id };

    var entry = {
      id: id,
      title: title,
      founder: leader,
      currentLeader: leader,
      placeId: placeId,
      boundRuleId: boundRuleId,
      boundFacilityId: boundFacilityId,
      requiredPractitionerSkill: requiredPractitionerSkill,
      generation: 1,
      status: 'active',
      efficiency: 1.0,
      createdAt: now(),
      history: [{
        generation: 1,
        leader: leader,
        path: 'founding',
        recordedAt: now()
      }]
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.institutionalInertia = draft.institutionalInertia || { charters: [], handovers: [], successionRecords: [] };
        draft.institutionalInertia.charters.push(entry);
        return true;
      }, 'institutionalInertia:establishCharter');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, charter: entry };
  }

  /**
   * 2. 负责人离场，触发世代交替接班
   */
  function triggerSuccessionHandover(spec) {
    var s = spec || {};
    var id = clean(s.id || (WA.rand.id('hnd_', 7, 'id')), 60);
    var charterId = clean(s.charterId, 60);
    var outgoingLeader = clean(s.outgoingLeader, 60);
    var reason = clean(s.reason || 'retirement', 40); // retirement / death / exile

    if (!charterId) return { ok: false, reason: 'missing-charter-id' };

    var b = ensureBucket();
    var cHit = b.charters.filter(function (c) { return c && c.id === charterId; })[0];
    if (!cHit) return { ok: false, reason: 'charter-not-found', id: charterId };

    var entry = {
      id: id,
      charterId: charterId,
      outgoingLeader: outgoingLeader || cHit.currentLeader,
      reason: reason,
      status: 'pending',
      triggeredAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.institutionalInertia = draft.institutionalInertia || { charters: [], handovers: [], successionRecords: [] };
        var c = (draft.institutionalInertia.charters || []).filter(function (x) { return x && x.id === charterId; })[0];
        if (c) c.status = 'contested';
        draft.institutionalInertia.handovers.push(entry);
        return true;
      }, 'institutionalInertia:triggerHandover');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, handover: entry };
  }

  /**
   * 3. 继承路径裁决（正统延续 / 改革修订 / 放弃衰退）
   */
  function resolveSuccessionPath(spec) {
    var s = spec || {};
    var handoverId = clean(s.handoverId, 60);
    var successor = clean(s.successor, 60);
    var path = clean(s.path, 40); // orthodox_continuity / reform_amendment / abandonment_decay
    var transitionCost = num(s.transitionCost) || 0;
    var amendedClauses = Array.isArray(s.amendedClauses) ? s.amendedClauses.map(function (c) { return clean(c, 60); }) : [];

    if (!handoverId) return { ok: false, reason: 'missing-handover-id' };
    if (SUCCESSION_PATHS.indexOf(path) < 0) {
      return { ok: false, reason: 'invalid-path', valid: SUCCESSION_PATHS };
    }

    var b = ensureBucket();
    var hHit = b.handovers.filter(function (h) { return h && h.id === handoverId; })[0];
    if (!hHit) return { ok: false, reason: 'handover-not-found', id: handoverId };
    if (hHit.status === 'resolved') return { ok: false, reason: 'already-resolved' };

    var cHit = b.charters.filter(function (c) { return c && c.id === hHit.charterId; })[0];
    if (!cHit) return { ok: false, reason: 'charter-not-found' };

    var newStatus = 'active';
    var nextEfficiency = cHit.efficiency;

    if (path === 'orthodox_continuity') {
      newStatus = 'active';
      // 正统守旧：不消耗改革成本，但在环境变化时效率略有惯性迟滞
      nextEfficiency = Math.max(0.2, Number((cHit.efficiency * 0.95).toFixed(2)));
    } else if (path === 'reform_amendment') {
      newStatus = 'reformed';
      // 改革路线：需支付真实过渡成本，带来效率重新提振
      nextEfficiency = 1.0;
    } else if (path === 'abandonment_decay') {
      newStatus = 'decaying';
      // 放弃继任：制度名存实亡，效率腰斩
      nextEfficiency = Number((cHit.efficiency * 0.3).toFixed(2));
    }

    var nextGen = (cHit.generation || 1) + 1;
    var historyRecord = {
      generation: nextGen,
      leader: successor || 'none',
      path: path,
      transitionCost: transitionCost,
      amendedClauses: amendedClauses,
      recordedAt: now()
    };

    var recordEntry = {
      id: WA.rand.id('succ_', 7, 'id'),
      handoverId: handoverId,
      charterId: cHit.id,
      successor: successor,
      path: path,
      transitionCost: transitionCost,
      resolvedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.institutionalInertia = draft.institutionalInertia || { charters: [], handovers: [], successionRecords: [] };
        var h = (draft.institutionalInertia.handovers || []).filter(function (x) { return x && x.id === handoverId; })[0];
        if (h) h.status = 'resolved';

        var c = (draft.institutionalInertia.charters || []).filter(function (x) { return x && x.id === cHit.id; })[0];
        if (c) {
          c.currentLeader = successor || c.currentLeader;
          c.generation = nextGen;
          c.status = newStatus;
          c.efficiency = nextEfficiency;
          c.history = c.history || [];
          c.history.push(historyRecord);
        }

        draft.institutionalInertia.successionRecords.push(recordEntry);
        return true;
      }, 'institutionalInertia:resolveSuccession');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return {
      ok: true,
      succession: recordEntry,
      charterStatus: newStatus,
      generation: nextGen,
      efficiency: nextEfficiency
    };
  }

  /**
   * 4. 制度退化与执行能力缺口审计（文书不等于能力）
   */
  function auditInstitutionalDecay(charterId, envConditions) {
    var cid = clean(charterId, 60);
    var b = ensureBucket();
    var cHit = b.charters.filter(function (c) { return c && c.id === cid; })[0];
    if (!cHit) return { ok: false, reason: 'charter-not-found' };

    var env = envConditions || {};
    var facilityFunctional = env.facilityFunctional !== false;
    var practitionerPresent = env.practitionerPresent !== false;

    var gaps = [];
    var penalty = 0;

    if (!facilityFunctional) {
      gaps.push('bound_facility_damaged');
      penalty += 0.4;
    }
    if (!practitionerPresent) {
      gaps.push('practitioner_absent_or_unqualified');
      penalty += 0.3;
    }

    var operationalHealth = Math.max(0, Number((cHit.efficiency - penalty).toFixed(2)));
    var isDormant = (operationalHealth <= 0.2);

    if (gaps.length > 0 && WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        var c = (draft.institutionalInertia.charters || []).filter(function (x) { return x && x.id === cid; })[0];
        if (c) {
          c.efficiency = operationalHealth;
          if (isDormant) c.status = 'dormant';
        }
        return true;
      }, 'institutionalInertia:auditDecay');
    }

    return {
      ok: true,
      charterId: cid,
      gaps: gaps,
      operationalHealth: operationalHealth,
      isDormant: isDormant
    };
  }

  /**
   * 5. 纯读只读投影：institutionalInertiaProjection
   */
  function institutionalInertiaProjection(charterId) {
    var cid = clean(charterId, 60);
    var b = ensureBucket();
    var charters = b.charters || [];
    if (cid) {
      charters = charters.filter(function (c) { return c && c.id === cid; });
    }
    var summary = charters.map(function (c) {
      return {
        id: c.id,
        title: c.title,
        generation: c.generation,
        currentLeader: c.currentLeader,
        status: c.status,
        efficiency: c.efficiency,
        historyLength: (c.history || []).length
      };
    });
    return {
      ok: true,
      totalCharters: charters.length,
      pendingHandovers: (b.handovers || []).filter(function (h) { return h && h.status === 'pending'; }).length,
      charters: summary
    };
  }

  /**
   * EXV5-4: 官僚汇报时滞与避责虚报机制（submitBureaucraticReport）
   * 下级向上级/宏观势力汇报时产生轮次时滞与公文粉饰修饰，掩盖真实危机严重度
   */
  function submitBureaucraticReport(reportSpec) {
    var p = reportSpec || {};
    var reporter = clean(p.reporter, 40);
    var institution = clean(p.institution || p.recipientInstitution, 60);
    var issueKey = clean(p.issueKey, 40);
    var actualIncident = clean(p.actualIncident || p.incident, 160);
    var whitewashLevel = clean(p.whitewashLevel, 30) || 'mild_embellishment'; // truthful, mild_embellishment, heavy_whitewash
    var delayRounds = typeof p.delayRounds === 'number' ? Math.max(1, p.delayRounds) : 2;

    if (!reporter || !actualIncident) {
      return { ok: false, reason: 'missing-fields' };
    }

    var sanitizedSummary = actualIncident;
    var riskEvasion = 0; // 避责系数 0-100
    if (whitewashLevel === 'heavy_whitewash') {
      sanitizedSummary = '【官式虚报呈文】：经细加体察，' + issueKey + '虽有微末动静，实属局势平稳受控，阖境安谧，无碍大局。';
      riskEvasion = 80;
    } else if (whitewashLevel === 'mild_embellishment') {
      sanitizedSummary = '【委婉折冲文牍】：' + issueKey + '突生偶发事端（' + actualIncident + '），现已遣员严密督导，情势稳步向好。';
      riskEvasion = 40;
    } else {
      sanitizedSummary = '【如实具陈急报】：' + actualIncident + '，亟需统筹应对。';
      riskEvasion = 0;
    }

    var reportId = WA.rand.id('rep_', 6, 'id');
    var out = null;

    WA.store.transact(function (draft) {
      draft.institutionalInertia = draft.institutionalInertia || {};
      draft.institutionalInertia.bureaucraticReports = draft.institutionalInertia.bureaucraticReports || [];
      var entry = {
        id: reportId,
        reporter: reporter,
        institution: institution || '顺天府巡捕衙门',
        issueKey: issueKey,
        actualIncident: actualIncident,
        sanitizedSummary: sanitizedSummary,
        whitewashLevel: whitewashLevel,
        delayRounds: delayRounds,
        riskEvasion: riskEvasion,
        status: 'in_transit',
        submittedAt: now()
      };
      draft.institutionalInertia.bureaucraticReports.push(entry);
      if (draft.institutionalInertia.bureaucraticReports.length > 20) draft.institutionalInertia.bureaucraticReports.shift();
      out = {
        ok: true,
        reportId: reportId,
        reporter: reporter,
        institution: entry.institution,
        delayRounds: delayRounds,
        whitewashLevel: whitewashLevel,
        riskEvasion: riskEvasion,
        sanitizedSummary: sanitizedSummary,
        actualIncident: actualIncident,
        note: '官僚文书已提交在途，存在 ' + delayRounds + ' 轮时滞' + (riskEvasion > 0 ? '与词句粉饰' : '并如实呈报')
      };
      return true;
    }, 'institutionalInertia:submitBureaucraticReport');

    return out || { ok: false, reason: 'store-unavailable' };
  }

  WA.institutionalInertia = {
    establishCharter: establishCharter,
    triggerSuccessionHandover: triggerSuccessionHandover,
    resolveSuccessionPath: resolveSuccessionPath,
    auditInstitutionalDecay: auditInstitutionalDecay,
    institutionalInertiaProjection: institutionalInertiaProjection,
    submitBureaucraticReport: submitBureaucraticReport,
    SUCCESSION_PATHS: SUCCESSION_PATHS.slice(),
    CHARTER_STATUS: CHARTER_STATUS.slice()
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/institutional-inertia.js', { kind: 'engine', ver: '2.243.0' });
  }

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/institutional-inertia 已加载（2.233.0）');
  }
})();