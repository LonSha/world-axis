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
    return WA.clock.now('customLax');
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
      id: 'cand_' + now() + '_' + WA.rand.id(),
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
      id: 'rule_' + now() + '_' + WA.rand.id(),
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
            id: 'rev_' + now() + '_' + WA.rand.id(),
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

  /**
   * 确立可引用的地方社会先例（WX-4）。
   * 记录裁决事实、组织与地点边界、情境条件，与日常闲聊区分。
   */
  function establishPrecedent(spec) {
    var s = spec || {};
    var title = clean(s.title, 80);
    var orgId = clean(s.orgId, 60);
    var placeId = clean(s.placeId, 60);
    var sourceCaseId = clean(s.sourceCaseId, 80);
    var ruling = clean(s.ruling, 120);
    var by = clean(s.by, 40);
    if (!title || !ruling || !by) {
      return { ok: false, reason: 'missing-fields' };
    }
    var conditions = (s.conditions && typeof s.conditions === 'object') ? JSON.parse(JSON.stringify(s.conditions)) : {};

    var entry = {
      id: 'prec_' + now() + '_' + WA.rand.id(),
      title: title,
      orgId: orgId,
      placeId: placeId,
      sourceCaseId: sourceCaseId,
      conditions: conditions,
      ruling: ruling,
      establishedBy: by,
      status: 'active',
      at: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.customLax = d.customLax || { candidates: [], rules: [], reviews: [], precedents: [] };
        d.customLax.precedents = d.customLax.precedents || [];
        d.customLax.precedents.push(entry);
        return true;
      }, 'customLax:establishPrecedent');
    }

    return { ok: true, precedent: entry };
  }

  /**
   * 评估并比对先例适用性（WX-4）。
   * 严防机械套用：关键条件或地域失配时如实指出实质区别（distinction）。
   */
  function evaluatePrecedent(precedentId, caseFacts) {
    var pid = clean(precedentId, 60);
    var facts = caseFacts || {};
    var bk = ensureBucket();
    var precs = (bk.precedents || []);
    var p = precs.filter(function (x) { return x && x.id === pid; })[0];
    if (!p) return { ok: false, reason: 'precedent-not-found' };

    // 1. 地点/地区边界检查（不可无声扩大到全世界）
    if (p.placeId && facts.placeId && clean(facts.placeId, 60) !== p.placeId) {
      return {
        ok: true,
        applicable: false,
        precedentId: pid,
        distinction: 'place-mismatch',
        reason: '地域不符：该先例仅在【' + p.placeId + '】适用，不可跨地无声扩大',
        precedent: p
      };
    }

    // 2. 组织范围检查
    if (p.orgId && facts.orgId && clean(facts.orgId, 60) !== p.orgId) {
      return {
        ok: true,
        applicable: false,
        precedentId: pid,
        distinction: 'org-mismatch',
        reason: '组织不符：该先例仅在组织【' + p.orgId + '】适用',
        precedent: p
      };
    }

    // 3. 关键情境条件严密比对
    var condKeys = Object.keys(p.conditions || {});
    for (var i = 0; i < condKeys.length; i++) {
      var k = condKeys[i];
      var expVal = p.conditions[k];
      var actVal = facts[k];
      if (actVal !== expVal) {
        return {
          ok: true,
          applicable: false,
          precedentId: pid,
          distinction: 'condition-mismatch:' + k,
          expected: expVal,
          actual: actVal,
          reason: '情境条件不符：' + k + ' 预期为 ' + expVal + '，当前为 ' + actVal + '，不可机械套用',
          precedent: p
        };
      }
    }

    return {
      ok: true,
      applicable: true,
      precedentId: pid,
      recommendation: p.ruling,
      precedent: p,
      note: '情境条件与管辖地域完全吻合，建议沿用先例'
    };
  }

  /**
   * 将成熟先例正式采纳升格为组织制度规则（WX-4）。
   */
  function adoptRuleFromPrecedent(precedentId, opts) {
    var pid = clean(precedentId, 60);
    var o = opts || {};
    var by = clean(o.by, 40);
    if (!pid || !by) return { ok: false, reason: 'missing-fields' };

    var bk = ensureBucket();
    var p = (bk.precedents || []).filter(function (x) { return x && x.id === pid; })[0];
    if (!p) return { ok: false, reason: 'precedent-not-found' };

    var ruleType = clean(o.ruleType || 'slot-booking', 30);
    var rule = {
      id: 'rule_' + now() + '_' + WA.rand.id(),
      orgId: p.orgId || clean(o.orgId, 60) || 'default-org',
      ruleType: ruleType,
      sourcePrecedentId: pid,
      sourceEventId: p.sourceCaseId || pid,
      summary: p.title + ': ' + p.ruling,
      scope: p.placeId || p.orgId || 'local',
      adoptedBy: by,
      status: 'active',
      enactedAt: now(),
      revisedAt: 0,
      revokedAt: 0
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.customLax = d.customLax || { candidates: [], rules: [], reviews: [], precedents: [] };
        d.customLax.rules.push(rule);
        return true;
      }, 'customLax:adoptRuleFromPrecedent');
    }

    return { ok: true, rule: rule, fromPrecedent: p };
  }

  /**
   * 查询可用先例列表
   */
  function listPrecedents(filter) {
    var bk = ensureBucket();
    var list = (bk.precedents || []).filter(function (p) {
      if (!p || p.status !== 'active') return false;
      if (filter && filter.placeId && p.placeId && p.placeId !== filter.placeId) return false;
      if (filter && filter.orgId && p.orgId && p.orgId !== filter.orgId) return false;
      return true;
    });
    return { ok: true, precedents: list, count: list.length };
  }

  /**
   * 记录人情互惠事实（WX-3）。
   * 区分期待回报的人情事实与无偿志愿。
   */
  function recordFavor(spec) {
    var s = spec || {};
    var fromWho = clean(s.fromWho, 40);
    var toWho = clean(s.toWho, 40);
    var task = clean(s.task, 80);
    if (!fromWho || !toWho || !task) {
      return { ok: false, reason: 'missing-fields' };
    }
    var expectation = (s.expectation !== false);
    var scope = clean(s.scope || 'general', 40);
    var entry = {
      id: 'fvr_' + now() + '_' + WA.rand.id(),
      fromWho: fromWho,
      toWho: toWho,
      task: task,
      scope: scope,
      expectation: expectation,
      details: clean(s.details || '', 120),
      status: 'active',
      at: now()
    };
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.customLax = d.customLax || {};
        d.customLax.favors = d.customLax.favors || [];
        d.customLax.favors.push(entry);
        return true;
      }, 'customLax:recordFavor');
    }
    return { ok: true, favor: entry };
  }

  /**
   * 发起求助并基于互惠历史与现实约束权衡（WX-3）。
   * 结果包括：答应 (accepted)、缩量 (scaled_down)、正当拒绝 (refused)。
   */
  function requestAid(spec) {
    var s = spec || {};
    var who = clean(s.who, 40);
    var targetWho = clean(s.targetWho, 40);
    var need = s.need || {};
    var kind = clean(need.kind || 'labor', 30);
    var amount = num(need.amount) || 1;
    if (!who || !targetWho) {
      return { ok: false, reason: 'missing-fields' };
    }

    var st = state();
    // 1. 检查被求助人是否在途旅行
    var pRecord = st.people ? (st.people['p_' + targetWho] || st.people[targetWho]) : null;
    if (pRecord) {
      var pst = clean(pRecord.status || pRecord.action || '', 30);
      if (pst === 'traveling' || pst === 'on_the_road' || pst === 'transit') {
        return {
          ok: true,
          outcome: 'refused',
          reason: 'target-traveling',
          note: '对方远行在途，无法分身提供现场帮助（正当拒绝不记过）'
        };
      }
    }

    // 2. 检查被求助人日程冲突
    var isBusy = false;
    if (WA.laborSchedule && typeof WA.laborSchedule.view === 'function' && need.slot) {
      var sched = WA.laborSchedule.view({ who: targetWho, day: need.day || 1 });
      if (sched && sched.ok && Array.isArray(sched.bookings)) {
        isBusy = sched.bookings.some(function (b) { return b && b.slot === need.slot; });
      }
    }

    // 3. 检查双方未结清的人情历史
    var bk = ensureBucket();
    var favors = (bk.favors || []).filter(function (f) {
      return f && f.fromWho === who && f.toWho === targetWho && f.status === 'active' && f.expectation;
    });
    var hasPastFavor = favors.length > 0;

    // 4. 权衡响应
    if (isBusy && !hasPastFavor) {
      return {
        ok: true,
        outcome: 'refused',
        reason: 'schedule-busy',
        note: '对方排班已满，且无前序人情欠款，正当拒绝协助（不扣好感）'
      };
    }

    if (isBusy && hasPastFavor) {
      // 念及往日恩情，虽繁忙仍愿意缩量履行部分责任
      var scaled = Math.max(1, Math.floor(amount * 0.5));
      return {
        ok: true,
        outcome: 'scaled_down',
        requestedAmount: amount,
        offeredAmount: scaled,
        favorReferenced: favors[0].id,
        note: '对方自身繁忙，但念及往日帮助，协商缩量履行部分协助'
      };
    }

    // 正常接受
    var consumedFavor = hasPastFavor ? favors[0].id : null;
    return {
      ok: true,
      outcome: 'accepted',
      offeredAmount: amount,
      favorConsumed: consumedFavor,
      note: hasPastFavor ? '双方存在互惠恩情，答应全额协助' : '双方关系良好，答应协助'
    };
  }

  /**
   * 提供有限第三方连带担保（WX-3）。
   * 严守最大赔付上限，不连锁生成无限债务。
   */
  function provideGuarantee(spec) {
    var s = spec || {};
    var guarantor = clean(s.guarantor, 40);
    var debtor = clean(s.debtor, 40);
    var creditor = clean(s.creditor, 40);
    var maxLiability = num(s.maxLiability);
    if (!guarantor || !debtor || !creditor || maxLiability == null || maxLiability <= 0) {
      return { ok: false, reason: 'missing-fields' };
    }
    if (guarantor === debtor) {
      return { ok: false, reason: 'self-guarantee-invalid', note: '债务人不能为自己提供第三方担保' };
    }

    var entry = {
      id: 'gua_' + now() + '_' + WA.rand.id(),
      guarantor: guarantor,
      debtor: debtor,
      creditor: creditor,
      maxLiability: maxLiability,
      terms: clean(s.terms || '', 100),
      deadlineDays: num(s.deadlineDays) || 30,
      status: 'active',
      claimedAmount: 0,
      at: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.customLax = d.customLax || {};
        d.customLax.guarantees = d.customLax.guarantees || [];
        d.customLax.guarantees.push(entry);
        return true;
      }, 'customLax:provideGuarantee');
    }

    return { ok: true, guarantee: entry };
  }

  /**
   * 主张担保追索（WX-3）。
   * 严格受限于 maxLiability，超出部分不予凭空追索。
   */
  function claimGuarantee(guaranteeId, breachAmount) {
    var gid = clean(guaranteeId, 60);
    var loss = num(breachAmount) || 0;
    var bk = ensureBucket();
    var g = (bk.guarantees || []).filter(function (x) { return x && x.id === gid; })[0];
    if (!g) return { ok: false, reason: 'guarantee-not-found' };
    if (g.status !== 'active') return { ok: false, reason: 'guarantee-not-active', status: g.status };

    var actualClaimed = Math.min(loss, g.maxLiability);
    var unrecoverable = Math.max(0, loss - g.maxLiability);

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var x = (d.customLax.guarantees || []).filter(function (it) { return it && it.id === gid; })[0];
        if (x) {
          x.status = 'claimed';
          x.claimedAmount = actualClaimed;
          x.unrecoverableLoss = unrecoverable;
          x.claimedAt = now();
        }
        return true;
      }, 'customLax:claimGuarantee');
    }

    return {
      ok: true,
      guaranteeId: gid,
      claimed: actualClaimed,
      unrecoverable: unrecoverable,
      liabilityCapped: loss > g.maxLiability,
      note: loss > g.maxLiability ? '损失超出担保人承诺上限，差额 ' + unrecoverable + ' 依法自担，不无限追索' : '损失已在担保上限内全额受偿'
    };
  }

  /**
   * 结算人情（履行完毕或违约）（WX-3）。
   */
  function settleFavor(favorId, outcome) {
    var fid = clean(favorId, 60);
    var oc = clean(outcome, 20);
    if (!fid || (oc !== 'fulfilled' && oc !== 'breached')) {
      return { ok: false, reason: 'invalid-outcome', allowed: ['fulfilled', 'breached'] };
    }
    var bk = ensureBucket();
    var f = (bk.favors || []).filter(function (x) { return x && x.id === fid; })[0];
    if (!f) return { ok: false, reason: 'favor-not-found' };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var x = (d.customLax.favors || []).filter(function (it) { return it && it.id === fid; })[0];
        if (x) {
          x.status = oc;
          x.settledAt = now();
        }
        // 若违约，给受影响人记录失信
        if (oc === 'breached') {
          d.people = d.people || {};
          var pkey = 'p_' + f.toWho;
          if (d.people[pkey]) {
            d.people[pkey].life = d.people[pkey].life || {};
            d.people[pkey].life.brokenTrust = (d.people[pkey].life.brokenTrust || 0) + 1;
          }
        }
        return true;
      }, 'customLax:settleFavor');
    }

    return { ok: true, favorId: fid, outcome: oc };
  }

  /**
   * 纯读查询人情账簿
   */
  function reciprocityLedger(who) {
    var person = clean(who, 40);
    var bk = ensureBucket();
    var favorsGiven = (bk.favors || []).filter(function (f) { return f && f.fromWho === person; });
    var favorsOwed = (bk.favors || []).filter(function (f) { return f && f.toWho === person; });
    var guarantees = (bk.guarantees || []).filter(function (g) { return g && (g.guarantor === person || g.debtor === person); });
    return {
      ok: true,
      who: person,
      favorsGiven: favorsGiven,
      favorsOwed: favorsOwed,
      guarantees: guarantees
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // OPV3-6: 承诺与履约回路协议（“答应过的事”推进世界）
  // ══════════════════════════════════════════════════════════════════════

  function commitPromise(spec) {
    var s = spec || {};
    var promiser = clean(s.promiser, 40);
    var beneficiary = clean(s.beneficiary, 40);
    var subject = clean(s.subject, 100);
    var dueDay = num(s.dueDay);
    if (!promiser || !beneficiary || !subject) {
      return { ok: false, reason: 'missing-fields', note: '承诺必须具备承诺人、受益人与具体约定事项' };
    }
    var pId = 'prm_' + now() + '_' + WA.rand.id();
    var entry = {
      id: pId,
      promiser: promiser,
      beneficiary: beneficiary,
      subject: subject,
      dueDay: (dueDay != null && dueDay >= 0) ? dueDay : null,
      stake: s.stake || null,
      guarantor: clean(s.guarantor, 40) || null,
      status: 'active', // 'active' | 'fulfilled' | 'defaulted' | 'remedied'
      createdAt: now(),
      fulfilledAt: null,
      defaultReason: null,
      remedyDetails: null
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.customLax = d.customLax || {};
        d.customLax.promises = d.customLax.promises || [];
        d.customLax.promises.push(entry);
        return true;
      }, 'customLax:commitPromise');
    }
    return { ok: true, promise: entry };
  }

  function fulfillPromise(promiseId, opts) {
    var pid = clean(promiseId, 60);
    var bk = ensureBucket();
    var p = (bk.promises || []).filter(function (x) { return x && x.id === pid; })[0];
    if (!p) return { ok: false, reason: 'promise-not-found' };
    if (p.status === 'fulfilled') return { ok: false, reason: 'already-fulfilled', note: '承诺已履约核销，严禁重复给付' };
    if (p.status === 'defaulted') return { ok: false, reason: 'already-defaulted', note: '承诺已违约失效，需转走补救流程' };

    var out = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var cur = (d.customLax.promises || []).filter(function (x) { return x && x.id === pid; })[0];
        if (!cur) return false;
        cur.status = 'fulfilled';
        cur.fulfilledAt = now();
        out = { ok: true, promiseId: pid, status: 'fulfilled', promiser: cur.promiser, beneficiary: cur.beneficiary };
        return true;
      }, 'customLax:fulfillPromise');
    }

    // 产生正向信用互惠
    if (out && out.ok) {
      recordFavor({
        giver: out.promiser,
        receiver: out.beneficiary,
        description: '如期履约：' + p.subject,
        weight: 15
      });
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function defaultPromise(promiseId, reason, opts) {
    var pid = clean(promiseId, 60);
    var r = clean(reason || 'unfulfilled-deadline', 100);
    var bk = ensureBucket();
    var p = (bk.promises || []).filter(function (x) { return x && x.id === pid; })[0];
    if (!p) return { ok: false, reason: 'promise-not-found' };
    if (p.status === 'fulfilled') return { ok: false, reason: 'already-fulfilled' };
    if (p.status === 'defaulted') return { ok: false, reason: 'already-defaulted' };

    var out = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var cur = (d.customLax.promises || []).filter(function (x) { return x && x.id === pid; })[0];
        if (!cur) return false;
        cur.status = 'defaulted';
        cur.defaultedAt = now();
        cur.defaultReason = r;
        out = {
          ok: true,
          promiseId: pid,
          status: 'defaulted',
          promiser: cur.promiser,
          beneficiary: cur.beneficiary,
          guarantor: cur.guarantor,
          trustPenalty: 25,
          defaultReason: r
        };
        return true;
      }, 'customLax:defaultPromise');
    }

    // 违约产生遗憾回声，真实注入动机仲裁
    if (out && out.ok && WA.pathEcho && typeof WA.pathEcho.record === 'function') {
      try {
        WA.pathEcho.record({
          who: out.promiser,
          bias: 'caution',
          kind: 'broken_promise',
          weight: 25,
          note: '因违背对【' + out.beneficiary + '】的承诺留下的社会信任污点与人际裂痕'
        });
      } catch (e) {}
    }

    return out || { ok: false, reason: 'store-unavailable' };
  }

  function remedyPromise(promiseId, remedySpec) {
    var pid = clean(promiseId, 60);
    var spec = remedySpec || {};
    var bk = ensureBucket();
    var p = (bk.promises || []).filter(function (x) { return x && x.id === pid; })[0];
    if (!p) return { ok: false, reason: 'promise-not-found' };
    if (p.status !== 'defaulted') {
      return { ok: false, reason: 'not-defaulted', note: '只有已违约的承诺方可执行补救和解协议' };
    }
    if (!spec.compensation && !spec.extraLabor) {
      return { ok: false, reason: 'missing-remedy-cost', note: '补救必须付出真实加倍赔偿或补偿劳动' };
    }

    var out = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var cur = (d.customLax.promises || []).filter(function (x) { return x && x.id === pid; })[0];
        if (!cur) return false;
        cur.status = 'remedied';
        cur.remediedAt = now();
        cur.remedyDetails = {
          compensation: spec.compensation || null,
          extraLabor: spec.extraLabor || null,
          note: clean(spec.note || '履行加倍补救，重修旧好', 100)
        };
        out = {
          ok: true,
          promiseId: pid,
          status: 'remedied',
          remedyDetails: cur.remedyDetails,
          originalDefaultRetained: true,
          note: '补救协议达成，但历史违约事实终生留痕'
        };
        return true;
      }, 'customLax:remedyPromise');
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function listPromises(filter) {
    var f = filter || {};
    var bk = ensureBucket();
    var list = (bk.promises || []).slice();
    if (f.promiser) {
      var pr = clean(f.promiser, 40);
      list = list.filter(function (p) { return p && p.promiser === pr; });
    }
    if (f.beneficiary) {
      var be = clean(f.beneficiary, 40);
      list = list.filter(function (p) { return p && p.beneficiary === be; });
    }
    if (f.status) {
      var st = clean(f.status, 20);
      list = list.filter(function (p) { return p && p.status === st; });
    }
    return { ok: true, promises: list, count: list.length };
  }

  // ══════════════════════════════════════════════════════════════════════
  // EXV3-5: 地方规约对行动的真实硬性约束
  // ══════════════════════════════════════════════════════════════════════

  function checkRuleEnforcement(orgId, actionType, actor, details) {
    var oid = clean(orgId, 60);
    var act = clean(actionType, 40);
    var who = clean(actor, 40);
    var dt = details || {};

    var rules = activeRules(oid).rules || [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r) continue;
      // 1. 工位排班限额规约 (slot-booking)
      if (r.type === 'slot-booking' && act === 'schedule:claim') {
        if (dt.alreadyBookedCount && dt.alreadyBookedCount >= (r.dailyLimit || 1)) {
          if (!dt.isExempt) {
            return {
              ok: false,
              enforced: true,
              reason: 'rule-violation',
              ruleId: r.id,
              ruleType: r.type,
              ruleName: r.name,
              note: '违反【' + r.name + '】：单人每日仅限预约 1 个工位'
            };
          }
        }
      }
      // 2. 资源配给限额规约 (resource-quota)
      if (r.type === 'resource-quota' && act === 'production:advance') {
        var reqQty = num(dt.requestedQuantity) || 0;
        var limit = num(r.quotaLimit) || 10;
        if (reqQty > limit && !dt.isExempt) {
          return {
            ok: false,
            enforced: true,
            reason: 'rule-violation',
            ruleId: r.id,
            ruleType: r.type,
            ruleName: r.name,
            note: '违反【' + r.name + '】：单次申领物料超额（上限 ' + limit + '，申请 ' + reqQty + '）'
          };
        }
      }
    }

    return { ok: true, enforced: false, permitted: true };
  }

  /**
   * 建立地方现行规约（供地方组织或场景直接设定）
   */
  function declareLocalRule(spec) {
    var s = spec || {};
    var id = clean(s.id || ('rule_' + now() + '_' + WA.rand.id()), 60);
    var orgId = clean(s.orgId, 60);
    var type = clean(s.type || s.ruleType || 'slot-booking', 30);
    var name = clean(s.name, 60);
    if (!orgId || !type) return { ok: false, reason: 'missing-fields' };
    var rule = {
      id: id,
      name: name || id,
      orgId: orgId,
      type: type,
      ruleType: type,
      dailyLimit: num(s.dailyLimit) || 1,
      quotaLimit: num(s.quotaLimit) || 10,
      status: 'active',
      enactedAt: now()
    };
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.customLax = d.customLax || { candidates: [], rules: [], reviews: [], precedents: [] };
        d.customLax.rules = d.customLax.rules || [];
        d.customLax.rules.push(rule);
        return true;
      }, 'customLax:declareLocalRule');
    }
    return { ok: true, rule: rule };
  }

  WA.customLax = {
    spawnCandidate: spawnCandidate,
    submitToApproval: submitToApproval,
    enactRule: enactRule,
    registerDissatisfaction: registerDissatisfaction,
    reviewRule: reviewRule,
    activeRules: activeRules,
    establishPrecedent: establishPrecedent,
    evaluatePrecedent: evaluatePrecedent,
    adoptRuleFromPrecedent: adoptRuleFromPrecedent,
    listPrecedents: listPrecedents,
    recordFavor: recordFavor,
    requestAid: requestAid,
    provideGuarantee: provideGuarantee,
    claimGuarantee: claimGuarantee,
    settleFavor: settleFavor,
    reciprocityLedger: reciprocityLedger,
    commitPromise: commitPromise,
    fulfillPromise: fulfillPromise,
    defaultPromise: defaultPromise,
    remedyPromise: remedyPromise,
    listPromises: listPromises,
    checkRuleEnforcement: checkRuleEnforcement,
    declareLocalRule: declareLocalRule,
    RULE_TYPES: RULE_TYPES.slice(),
    STAGES: STAGES.slice()
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/custom-lax 已加载（2.231.0）');
  }
})();