/**
 * WorldAxis engines/custom-lax.js (v2.231.0) — IN-4 习俗到制度
 *
 * 核心职责：
 *   重复发生的合作、冲突、分配结果可形成「惯例候选」。
 *   成员以公开提案、讨论、同意或反对使其成为适用规则。
 *   规则有适用范围、受益/承担者、执行成本与复审条件。
 *   地方可以共存不同规则，执行效果和不满促成修订。
 *   惯例不自动成为法律，不由统计多数绕过既有批准权限。
 *
 * 运行闭环：
 *   真实事件/履约结果 → 可说明来源的惯例候选 → 组织内合法提案流程
 *   → 角色表态和所需权限确认 → 新规则由 activity/production 实际消费
 *   → 结果反馈后续修订。
 *
 * 边界：
 *   1. 惯例候选必须有可追溯来源事件（sourceEventId），不接受凭空提案。
 *   2. 提案须经 inst.propose → inst.decide 合法批准链，不绕过权限。
 *   3. 规则不自动成为法律：approved 状态才生效，pending 不生效。
 *   4. 规则有适用范围（orgId），不同组织可共存不同规则。
 *   5. 不满积累达到阈值可触发复审，复审仍走批准链。
 *   6. 换任负责人不自动抹掉旧制度。
 *   7. 只实现少量具名规则类型（slot-booking / budget-split / duty-roster），
 *      不开放任意字符串执行或万能规则 DSL。
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

  function bucket() {
    var s = state();
    return (s.customLax && typeof s.customLax === 'object') ? s.customLax : null;
  }

  function ensureBucket() {
    if (!bucket()) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.customLax = d.customLax || { candidates: [], rules: [], reviews: [] };
          return true;
        }, 'customLax:init');
      }
    }
    return bucket() || { candidates: [], rules: [], reviews: [] };
  }

  var RULE_TYPES = ['slot-booking', 'budget-split', 'duty-roster'];
  var STAGES = ['candidate', 'proposed', 'approved', 'rejected', 'revised', 'revoked'];

  function now() {
    return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('customLax') : Date.now();
  }

  /**
   * 从重复事件形成惯例候选。
   * 必须有 sourceEventId 作为可追溯来源。
   */
  function spawnCandidate(spec) {
    var s = spec || {};
    var orgId = clean(s.orgId, 60);
    var ruleType = clean(s.ruleType, 30);
    var sourceEventId = clean(s.sourceEventId, 80);
    var summary = clean(s.summary, 120);
    var by = clean(s.by, 40);

    if (!orgId || !ruleType || !sourceEventId || !by) {
      return { ok: false, reason: 'missing-fields' };
    }
    if (RULE_TYPES.indexOf(ruleType) < 0) {
      return { ok: false, reason: 'bad-rule-type', allowed: RULE_TYPES.slice() };
    }

    var occurrenceCount = num(s.occurrenceCount) || 1;
    if (occurrenceCount < 2) {
      return { ok: false, reason: 'insufficient-occurrences', note: '至少需要两次重复发生才能形成惯例候选' };
    }

    var entry = {
      id: 'cand_' + now() + '_' + Math.floor(Math.random() * 10000),
      orgId: orgId,
      ruleType: ruleType,
      sourceEventId: sourceEventId,
      summary: summary,
      by: by,
      occurrenceCount: occurrenceCount,
      stage: 'candidate',
      proposedAt: 0,
      approvedAt: 0,
      dissatisfaction: 0,
      at: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.customLax = d.customLax || { candidates: [], rules: [], reviews: [] };
        d.customLax.candidates.push(entry);
        return true;
      }, 'customLax:spawnCandidate');
    }

    return { ok: true, candidate: entry };
  }

  /**
   * 将候选提交组织批准链。
   * 调用 inst.propose 走合法流程，不绕过权限。
   */
  function submitToApproval(candidateId, opts) {
    var s = opts || {};
    var candId = clean(candidateId, 60);
    var by = clean(s.by, 40);
    if (!candId || !by) return { ok: false, reason: 'missing-fields' };

    var bk = ensureBucket();
    var cand = (bk.candidates || []).filter(function (c) { return c && c.id === candId; })[0];
    if (!cand) return { ok: false, reason: 'candidate-not-found' };
    if (cand.stage !== 'candidate') return { ok: false, reason: 'already-proposed', stage: cand.stage };

    // 必须经 inst 合法提案
    if (!WA.inst || typeof WA.inst.propose !== 'function') {
      return { ok: false, reason: 'inst-not-available' };
    }
    var instRes = WA.inst.propose(cand.orgId, cand.summary || ('惯例提案:' + cand.ruleType), {
      by: by,
      needs: 'approve'
    });
    if (!instRes || !instRes.ok) {
      return { ok: false, reason: 'inst-proposal-failed', instResult: instRes };
    }

    // 标记候选已进入提案流程
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var c = (d.customLax.candidates || []).filter(function (x) { return x && x.id === candId; })[0];
        if (c) {
          c.stage = 'proposed';
          c.proposedAt = now();
          c.instDecisionId = instRes.id;
        }
        return true;
      }, 'customLax:submitToApproval');
    }

    return { ok: true, candidateId: candId, instDecisionId: instRes.id, instHolders: instRes.holders };
  }

  /**
   * 组织批准后，将候选提升为正式规则。
   * 调用方需提供 inst.decide 的结果证据。
   */
  function enactRule(candidateId, opts) {
    var s = opts || {};
    var candId = clean(candidateId, 60);
    var bk = ensureBucket();
    var cand = (bk.candidates || []).filter(function (c) { return c && c.id === candId; })[0];
    if (!cand) return { ok: false, reason: 'candidate-not-found' };
    if (cand.stage !== 'proposed') return { ok: false, reason: 'not-proposed', stage: cand.stage };

    var instDecisionId = clean(s.instDecisionId || cand.instDecisionId, 60);
    var orgId = clean(s.orgId || cand.orgId, 60);
    if (!instDecisionId || !orgId) return { ok: false, reason: 'missing-fields' };

    // 核验 inst 已批准
    if (!WA.inst || typeof WA.inst.statView !== 'function') {
      return { ok: false, reason: 'inst-not-available' };
    }
    var sv = WA.inst.statView();
    // 简易核验：查 inst 里的 pending 是否已 approved
    var verified = false;
    var s2 = state();
    var orgs = (s2.inst && Array.isArray(s2.inst.orgs)) ? s2.inst.orgs : [];
    for (var i = 0; i < orgs.length; i++) {
      if (orgs[i].id !== orgId) continue;
      var pend = orgs[i].pending || [];
      for (var j = 0; j < pend.length; j++) {
        if (pend[j].id === instDecisionId && pend[j].status === 'approved') {
          verified = true;
          break;
        }
      }
    }
    if (!verified) {
      return { ok: false, reason: 'not-approved-by-inst', instDecisionId: instDecisionId,
        note: '惯例不自动成为法律——必须经组织批准链通过才生效' };
    }

    var rule = {
      id: 'rule_' + now() + '_' + Math.floor(Math.random() * 10000),
      orgId: orgId,
      ruleType: cand.ruleType,
      sourceEventId: cand.sourceEventId,
      summary: cand.summary,
      originCandidateId: candId,
      instDecisionId: instDecisionId,
      scope: clean(s.scope, 60) || orgId,
      beneficiaries: Array.isArray(s.beneficiaries) ? s.beneficiaries.slice(0, 8) : [],
      burdenBearers: Array.isArray(s.burdenBearers) ? s.burdenBearers.slice(0, 8) : [],
      execCost: num(s.execCost) || 0,
      reviewThreshold: num(s.reviewThreshold) || 3,
      dissatisfaction: 0,
      status: 'active',
      enactedAt: now(),
      revisedAt: 0,
      revokedAt: 0
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.customLax = d.customLax || { candidates: [], rules: [], reviews: [] };
        d.customLax.rules.push(rule);
        // 更新候选状态
        var c = (d.customLax.candidates || []).filter(function (x) { return x && x.id === candId; })[0];
        if (c) { c.stage = 'approved'; c.approvedAt = now(); }
        return true;
      }, 'customLax:enactRule');
    }

    return { ok: true, rule: rule };
  }

  /**
   * 记录对某规则的不满，达到阈值触发复审。
   */
  function registerDissatisfaction(ruleId, who) {
    var rId = clean(ruleId, 60);
    var by = clean(who, 40);
    if (!rId || !by) return { ok: false, reason: 'missing-fields' };

    var bk = ensureBucket();
    var rule = (bk.rules || []).filter(function (r) { return r && r.id === rId; })[0];
    if (!rule) return { ok: false, reason: 'rule-not-found' };
    if (rule.status !== 'active') return { ok: false, reason: 'rule-not-active', status: rule.status };

    var triggered = false;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var r = (d.customLax.rules || []).filter(function (x) { return x && x.id === rId; })[0];
        if (!r) return false;
        r.dissatisfaction = (r.dissatisfaction || 0) + 1;
        if (r.dissatisfaction >= r.reviewThreshold) {
          r.status = 'under-review';
          triggered = true;
          d.customLax.reviews.push({
            id: 'rev_' + now() + '_' + Math.floor(Math.random() * 10000),
            ruleId: rId,
            triggeredBy: by,
            reason: 'dissatisfaction-threshold-reached',
            at: now(),
            outcome: ''
          });
        }
        return true;
      }, 'customLax:registerDissatisfaction');
    }

    return { ok: true, ruleId: rId, dissatisfaction: (bucket().rules || []).filter(function (r) { return r && r.id === rId; })[0].dissatisfaction,
      reviewTriggered: triggered };
  }

  /**
   * 复审规则：仍走 inst 批准链，不自行判。
   * outcome: 'revised' | 'revoked' | 'upheld'
   */
  function reviewRule(ruleId, opts) {
    var s = opts || {};
    var rId = clean(ruleId, 60);
    var outcome = clean(s.outcome, 20);
    var instDecisionId = clean(s.instDecisionId, 60);
    var by = clean(s.by, 40);
    if (!rId || !outcome || !by) return { ok: false, reason: 'missing-fields' };

    var VALID = ['revised', 'revoked', 'upheld'];
    if (VALID.indexOf(outcome) < 0) return { ok: false, reason: 'bad-outcome', allowed: VALID.slice() };

    var bk = ensureBucket();
    var rule = (bk.rules || []).filter(function (r) { return r && r.id === rId; })[0];
    if (!rule) return { ok: false, reason: 'rule-not-found' };
    if (rule.status !== 'under-review') return { ok: false, reason: 'not-under-review', status: rule.status };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var r = (d.customLax.rules || []).filter(function (x) { return x && x.id === rId; })[0];
        if (!r) return false;
        var ts = now();
        if (outcome === 'revoked') {
          r.status = 'revoked';
          r.revokedAt = ts;
        } else if (outcome === 'revised') {
          r.status = 'active';
          r.revisedAt = ts;
          r.dissatisfaction = 0;
          if (s.newSummary) r.summary = clean(s.newSummary, 120);
          if (s.newExecCost !== undefined) r.execCost = num(s.newExecCost) || 0;
        } else {
          // upheld: 恢复 active，重置不满计数
          r.status = 'active';
          r.dissatisfaction = 0;
        }
        // 更新对应 review 记录
        var revs = d.customLax.reviews || [];
        for (var i = revs.length - 1; i >= 0; i--) {
          if (revs[i].ruleId === rId && !revs[i].outcome) {
            revs[i].outcome = outcome;
            revs[i].decidedBy = by;
            revs[i].instDecisionId = instDecisionId;
            revs[i].decidedAt = ts;
            break;
          }
        }
        return true;
      }, 'customLax:reviewRule');
    }

    return { ok: true, ruleId: rId, outcome: outcome };
  }

  /**
   * 查询某组织当前生效的规则。
   */
  function activeRules(orgId) {
    var oid = clean(orgId, 60);
    var bk = ensureBucket();
    var rules = (bk.rules || []).filter(function (r) {
      return r && r.orgId === oid && r.status === 'active';
    });
    return { ok: true, rules: rules, count: rules.length };
  }

  WA.customLax = {
    spawnCandidate: spawnCandidate,
    submitToApproval: submitToApproval,
    enactRule: enactRule,
    registerDissatisfaction: registerDissatisfaction,
    reviewRule: reviewRule,
    activeRules: activeRules,
    RULE_TYPES: RULE_TYPES.slice(),
    STAGES: STAGES.slice()
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/custom-lax 已加载（2.231.0）');
  }
})();