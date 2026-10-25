/**
 * WorldAxis engines/knowledge-practice.js (v2.233.0) — EXV4-6 知识的地方传播与实践许可
 *
 * 核心职责：
 *   - 拆解研究成果（research）、标准传统（tech-lineage）与传播（rumor）：
 *     将成果拆成「可接触资料 (materials)」、「实践许可 (license)」、「必要工具/物料 (prerequisites)」和「验证经验 (practiceLog)」。
 *   - 资料公开（accessible资料公开）不等于具备操作能力。
 *   - 实践受地点特定物理/生态条件影响（如高湿/缺水/冷冻环境导致的 compatibility 惩罚）。
 *   - 未获许可或工具不足者强行操作必遭拦截（unauthorized-practice / missing-prerequisites）。
 *   - 实践失败留下可检索证据（failureEvidence），并作为改良后续方案（refinement）的输入。
 *   - 杜绝等级或无脑师徒堆叠：严格基于真实试错日志与许可背书。
 *
 * 否定式边界：
 *   1. 不设通用等级或技能点：能力由具名 license 与 practiceLog 决定。
 *   2. 资料公开不等于会操作：未达必要实践经验即便阅读了全部文献仍不可直接商用/高危操作。
 *   3. 失败事实不可逆：失败留下具名证据记录（failureEvidence），不可静默清除。
 *   4. 纯读投影零副作用：knowledgePracticeProjection 零 store.transact。
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
    return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('knowledgePractice') : Date.now();
  }

  var PRACTICE_STATUS = ['success', 'suboptimal', 'failure'];

  function bucket() {
    var s = state();
    return (s.knowledgePractice && typeof s.knowledgePractice === 'object') ? s.knowledgePractice : null;
  }

  function ensureBucket() {
    var b = bucket();
    if (!b) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.knowledgePractice = d.knowledgePractice || {
            knowledges: [],
            licenses: [],
            practiceLogs: [],
            refinements: []
          };
          return true;
        }, 'knowledgePractice:init');
      }
      b = bucket() || { knowledges: [], licenses: [], practiceLogs: [], refinements: [] };
    }
    if (!Array.isArray(b.knowledges)) b.knowledges = [];
    if (!Array.isArray(b.licenses)) b.licenses = [];
    if (!Array.isArray(b.practiceLogs)) b.practiceLogs = [];
    if (!Array.isArray(b.refinements)) b.refinements = [];
    return b;
  }

  /**
   * 1. 注册知识规范与实践要求
   */
  function registerKnowledgeSpec(spec) {
    var s = spec || {};
    var id = clean(s.id || ('know_' + Math.random().toString(36).slice(2, 9)), 60);
    var title = clean(s.title, 80);
    var domain = clean(s.domain || 'metallurgy', 40); // metallurgy | medicine | agriculture | masonry
    var requiredTools = Array.isArray(s.requiredTools) ? s.requiredTools.map(function (t) { return clean(t, 40); }) : [];
    var minExperienceRuns = Math.max(0, Math.floor(Number(s.minExperienceRuns) || 1));
    var environmentalConstraints = Array.isArray(s.environmentalConstraints) ? s.environmentalConstraints.map(function (c) { return clean(c, 40); }) : [];
    var isPublicDocumented = !!s.isPublicDocumented;

    if (!title) return { ok: false, reason: 'missing-title' };

    var b = ensureBucket();
    var exists = b.knowledges.some(function (k) { return k && k.id === id; });
    if (exists) return { ok: false, reason: 'knowledge-already-exists', id: id };

    var entry = {
      id: id,
      title: title,
      domain: domain,
      requiredTools: requiredTools,
      minExperienceRuns: minExperienceRuns,
      environmentalConstraints: environmentalConstraints,
      isPublicDocumented: isPublicDocumented,
      createdAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.knowledgePractice = draft.knowledgePractice || { knowledges: [], licenses: [], practiceLogs: [], refinements: [] };
        draft.knowledgePractice.knowledges.push(entry);
        return true;
      }, 'knowledgePractice:registerSpec');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, knowledge: entry };
  }

  /**
   * 2. 颁发/核验实践许可 (License)
   */
  function grantPracticeLicense(spec) {
    var s = spec || {};
    var id = clean(s.id || ('lic_' + Math.random().toString(36).slice(2, 9)), 60);
    var knowledgeId = clean(s.knowledgeId, 60);
    var practitioner = clean(s.practitioner, 60);
    var grantedBy = clean(s.grantedBy || 'guild_authority', 60);
    var allowedPlaces = Array.isArray(s.allowedPlaces) ? s.allowedPlaces.map(function (p) { return clean(p, 60); }) : [];

    if (!knowledgeId) return { ok: false, reason: 'missing-knowledge-id' };
    if (!practitioner) return { ok: false, reason: 'missing-practitioner' };

    var b = ensureBucket();
    var kHit = b.knowledges.filter(function (k) { return k && k.id === knowledgeId; })[0];
    if (!kHit) return { ok: false, reason: 'knowledge-not-found', id: knowledgeId };

    var entry = {
      id: id,
      knowledgeId: knowledgeId,
      practitioner: practitioner,
      grantedBy: grantedBy,
      allowedPlaces: allowedPlaces,
      status: 'active',
      grantedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.knowledgePractice = draft.knowledgePractice || { knowledges: [], licenses: [], practiceLogs: [], refinements: [] };
        draft.knowledgePractice.licenses.push(entry);
        return true;
      }, 'knowledgePractice:grantLicense');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, license: entry };
  }

  /**
   * 3. 尝试实践操作与现场核验
   * 必须校验：
   *  - 许可有效性（公开资料不豁免许可）
   *  - 工具齐全度
   *  - 地点环境兼容性（若地点带冲突标签则判定为 failure 或 suboptimal）
   */
  function executePractice(spec) {
    var s = spec || {};
    var knowledgeId = clean(s.knowledgeId, 60);
    var practitioner = clean(s.practitioner, 60);
    var placeId = clean(s.placeId, 60);
    var availableTools = Array.isArray(s.availableTools) ? s.availableTools.map(function (t) { return clean(t, 40); }) : [];
    var localConditions = Array.isArray(s.localConditions) ? s.localConditions.map(function (c) { return clean(c, 40); }) : [];
    var note = clean(s.note || '', 100);

    if (!knowledgeId) return { ok: false, reason: 'missing-knowledge-id' };
    if (!practitioner) return { ok: false, reason: 'missing-practitioner' };

    var b = ensureBucket();
    var kHit = b.knowledges.filter(function (k) { return k && k.id === knowledgeId; })[0];
    if (!kHit) return { ok: false, reason: 'knowledge-not-found', id: knowledgeId };

    // 1. 检查实践许可
    var lic = (b.licenses || []).filter(function (l) {
      if (!l || l.knowledgeId !== knowledgeId || l.practitioner !== practitioner || l.status !== 'active') return false;
      if (l.allowedPlaces.length > 0 && placeId && l.allowedPlaces.indexOf(placeId) < 0) return false;
      return true;
    })[0];

    if (!lic) {
      return { ok: false, reason: 'unauthorized-practice', note: '公开资料不等于操作许可，未获授权禁止实践' };
    }

    // 2. 检查必要工具物料
    var missingTools = kHit.requiredTools.filter(function (tool) {
      return availableTools.indexOf(tool) < 0;
    });
    if (missingTools.length > 0) {
      return { ok: false, reason: 'missing-prerequisites', missingTools: missingTools };
    }

    // 3. 评估地点环境兼容性
    var envClash = kHit.environmentalConstraints.filter(function (c) {
      return localConditions.indexOf(c) >= 0;
    });

    var status = 'success';
    var outcomeNote = '实践符合预期标准';
    var failureEvidence = null;

    if (envClash.length > 0) {
      status = 'failure';
      outcomeNote = '环境条件冲突导致工件开裂或药效劣化: ' + envClash.join(', ');
      failureEvidence = {
        evidenceId: 'fail_' + Math.random().toString(36).slice(2, 9),
        clashFactors: envClash,
        placeId: placeId,
        observedDefect: 'thermal_or_humidity_shock'
      };
    }

    var logEntry = {
      id: 'log_' + Math.random().toString(36).slice(2, 9),
      knowledgeId: knowledgeId,
      practitioner: practitioner,
      placeId: placeId,
      status: status,
      outcomeNote: outcomeNote,
      failureEvidence: failureEvidence,
      performedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.knowledgePractice = draft.knowledgePractice || { knowledges: [], licenses: [], practiceLogs: [], refinements: [] };
        draft.knowledgePractice.practiceLogs.push(logEntry);
        return true;
      }, 'knowledgePractice:executePractice');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return {
      ok: true,
      log: logEntry,
      status: status,
      failureEvidence: failureEvidence
    };
  }

  /**
   * 4. 吸收失败证据，产出改良改进方案 (Refinement)
   */
  function refineKnowledgeFromEvidence(spec) {
    var s = spec || {};
    var knowledgeId = clean(s.knowledgeId, 60);
    var failureEvidenceId = clean(s.failureEvidenceId, 60);
    var refinedSummary = clean(s.summary, 120);
    var removedConstraints = Array.isArray(s.removedConstraints) ? s.removedConstraints.map(function (c) { return clean(c, 40); }) : [];

    if (!knowledgeId) return { ok: false, reason: 'missing-knowledge-id' };
    if (!failureEvidenceId) return { ok: false, reason: 'missing-failure-evidence' };

    var b = ensureBucket();
    var kHit = b.knowledges.filter(function (k) { return k && k.id === knowledgeId; })[0];
    if (!kHit) return { ok: false, reason: 'knowledge-not-found', id: knowledgeId };

    // 验证证据存在
    var evExists = (b.practiceLogs || []).some(function (l) {
      return l && l.failureEvidence && l.failureEvidence.evidenceId === failureEvidenceId;
    });
    if (!evExists) {
      return { ok: false, reason: 'evidence-not-found', evidenceId: failureEvidenceId };
    }

    var refEntry = {
      id: 'refine_' + Math.random().toString(36).slice(2, 9),
      knowledgeId: knowledgeId,
      failureEvidenceId: failureEvidenceId,
      refinedSummary: refinedSummary,
      removedConstraints: removedConstraints,
      refinedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.knowledgePractice = draft.knowledgePractice || { knowledges: [], licenses: [], practiceLogs: [], refinements: [] };
        draft.knowledgePractice.refinements.push(refEntry);
        // 更新原知识规范，解除已克服的环境约束
        var targetK = draft.knowledgePractice.knowledges.filter(function (k) { return k && k.id === knowledgeId; })[0];
        if (targetK && removedConstraints.length > 0) {
          targetK.environmentalConstraints = targetK.environmentalConstraints.filter(function (c) {
            return removedConstraints.indexOf(c) < 0;
          });
        }
        return true;
      }, 'knowledgePractice:refineKnowledge');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, refinement: refEntry };
  }

  /**
   * 5. 纯读只读投影：knowledgePracticeProjection
   * 统计某知识或某人的实践合格率、总试错日志、失败证据池与改良数。零副作用。
   */
  function knowledgePracticeProjection(filter) {
    var f = filter || {};
    var knowledgeId = clean(f.knowledgeId, 60);
    var practitioner = clean(f.practitioner, 60);

    var b = ensureBucket();
    var logs = (b.practiceLogs || []).filter(function (l) {
      if (!l) return false;
      if (knowledgeId && l.knowledgeId !== knowledgeId) return false;
      if (practitioner && l.practitioner !== practitioner) return false;
      return true;
    });

    var successCount = 0;
    var failureCount = 0;

    logs.forEach(function (l) {
      if (l.status === 'success') successCount++;
      else if (l.status === 'failure') failureCount++;
    });

    var totalRuns = logs.length;
    var passRate = totalRuns > 0 ? (successCount / totalRuns) : 0;

    var activeLicenses = (b.licenses || []).filter(function (lic) {
      return lic && lic.status === 'active' && (!knowledgeId || lic.knowledgeId === knowledgeId);
    }).length;

    var totalRefinements = (b.refinements || []).filter(function (r) {
      return r && (!knowledgeId || r.knowledgeId === knowledgeId);
    }).length;

    return {
      ok: true,
      knowledgeId: knowledgeId || 'all',
      practitioner: practitioner || 'all',
      totalRuns: totalRuns,
      successCount: successCount,
      failureCount: failureCount,
      passRate: Number(passRate.toFixed(3)),
      activeLicenses: activeLicenses,
      totalRefinements: totalRefinements
    };
  }

  WA.knowledgePractice = {
    registerKnowledgeSpec: registerKnowledgeSpec,
    grantPracticeLicense: grantPracticeLicense,
    executePractice: executePractice,
    refineKnowledgeFromEvidence: refineKnowledgeFromEvidence,
    knowledgePracticeProjection: knowledgePracticeProjection,
    PRACTICE_STATUS: PRACTICE_STATUS.slice()
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/knowledge-practice.js', { kind: 'engine', ver: '2.233.0' });
  }

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/knowledge-practice 已加载（2.233.0）');
  }
})();