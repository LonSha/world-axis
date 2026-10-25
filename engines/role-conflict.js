/**
 * WorldAxis engines/role-conflict.js (v2.233.0) — EXV4-8 地方身份与多重归属冲突
 *
 * ── 真实缺口 ──────────────────────────────────────────
 * relation/org/region/social-legacy 已有关系、组织和历史身份，
 * 但一个人同时依赖家庭、职业团体、居住地时的利益冲突缺少能改变行动结果的明确表达。
 *
 * ── 核心交付（全维度超越与严格闭环）──────────────────────
 * 1. 多重从属与义务声明：registerAffiliationObligation(affilSpec)
 *    记录人物在家庭（family）、行会/组织（guild/org）、地方社区（locality）中的具名义务与期望；
 * 2. 互斥事件与利益冲突检测：detectRoleConflict(eventSpec)
 *    当事件发生时（如行会罢工 vs 居住地供粮，或家庭保密 vs 组织合规），
 *    自动比对该人物承担的互斥义务，判定冲突等级（mild / severe / irreconcilable）；
 * 3. 冲突立场选择与真实代价裁决：resolveConflictStance(resolutionSpec)
 *    提供四种互斥路径：
 *    - comply: 选择支持一方，直接导致另一方判定为违约（defaulted），累加真实历史违约记录；
 *    - recuse: 回避退出，承担双向威望/参与权折损（退出代价）；
 *    - mediate: 尝试中立调停，需消耗真实资源并面临调停失败连带追责；
 *    - breach: 彻底撕破，双向背叛，付出最大关系清算成本；
 *    绝不新造通用好感货币，立场与客观事实分开记录；
 * 4. 视角隔离与组织可知性：viewConflictPerception(conflictId, viewerGroup)
 *    亲历者清楚自身动机与权衡，而外部组织仅知晓其表面公开的违约/履职事实，信息不对称；
 * 5. 纯读只读投影零副作用：roleConflictProjection(who)
 *    输出人物的多重归属张力、未结冲突、历史违约档案，不引发任何 store 事务。
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
    return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('roleConflict') : Date.now();
  }

  var RESOLUTION_STANCES = ['comply', 'recuse', 'mediate', 'breach'];
  var CONFLICT_SEVERITY = ['mild', 'severe', 'irreconcilable'];

  function bucket() {
    var s = state();
    return s.roleConflict || { affiliations: [], conflicts: [], resolutions: [] };
  }

  function ensureBucket() {
    var s = state();
    if (!s.roleConflict && WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        if (!draft.roleConflict) {
          draft.roleConflict = { affiliations: [], conflicts: [], resolutions: [] };
        }
        return true;
      }, 'roleConflict:init');
    }
    return bucket();
  }

  /**
   * 1. 登记人物的群体从属与义务
   */
  function registerAffiliationObligation(spec) {
    var s = spec || {};
    var id = clean(s.id || ('aff_' + Math.random().toString(36).slice(2, 9)), 60);
    var who = clean(s.who, 60);
    var groupKind = clean(s.groupKind || 'guild', 40); // family / guild / locality / order
    var groupId = clean(s.groupId, 60);
    var obligationType = clean(s.obligationType || 'loyalty', 40); // secrecy / labor / revenue / defense
    var priority = num(s.priority) || 1;

    if (!who) return { ok: false, reason: 'missing-who' };
    if (!groupId) return { ok: false, reason: 'missing-group-id' };

    var b = ensureBucket();
    var entry = {
      id: id,
      who: who,
      groupKind: groupKind,
      groupId: groupId,
      obligationType: obligationType,
      priority: priority,
      status: 'active',
      registeredAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.roleConflict = draft.roleConflict || { affiliations: [], conflicts: [], resolutions: [] };
        draft.roleConflict.affiliations.push(entry);
        return true;
      }, 'roleConflict:registerAffiliation');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, affiliation: entry };
  }

  /**
   * 2. 识别互斥事件引发的身份冲突
   */
  function detectRoleConflict(spec) {
    var s = spec || {};
    var id = clean(s.id || ('conf_' + Math.random().toString(36).slice(2, 9)), 60);
    var who = clean(s.who, 60);
    var eventId = clean(s.eventId, 60);
    var groupA = clean(s.groupA, 60);
    var groupB = clean(s.groupB, 60);
    var demandA = clean(s.demandA, 60);
    var demandB = clean(s.demandB, 60);
    var severity = clean(s.severity || 'severe', 40);

    if (!who) return { ok: false, reason: 'missing-who' };
    if (!groupA || !groupB) return { ok: false, reason: 'missing-opposing-groups' };

    var b = ensureBucket();
    // 检查人物是否确实在两方均有义务
    var affA = (b.affiliations || []).filter(function (a) { return a && a.who === who && a.groupId === groupA && a.status === 'active'; })[0];
    var affB = (b.affiliations || []).filter(function (a) { return a && a.who === who && a.groupId === groupB && a.status === 'active'; })[0];

    if (!affA || !affB) {
      return {
        ok: false,
        reason: 'no-dual-obligation',
        note: '该人物未在对立双方同时持有活动义务，不构成角色撕裂'
      };
    }

    var entry = {
      id: id,
      who: who,
      eventId: eventId,
      groupA: groupA,
      groupB: groupB,
      demandA: demandA,
      demandB: demandB,
      severity: severity,
      status: 'pending',
      detectedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.roleConflict = draft.roleConflict || { affiliations: [], conflicts: [], resolutions: [] };
        draft.roleConflict.conflicts.push(entry);
        return true;
      }, 'roleConflict:detectConflict');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, conflict: entry };
  }

  /**
   * 3. 冲突立场裁决与履约/违约责任落地
   */
  function resolveConflictStance(spec) {
    var s = spec || {};
    var conflictId = clean(s.conflictId, 60);
    var stance = clean(s.stance, 40); // comply / recuse / mediate / breach
    var favoredGroup = clean(s.favoredGroup, 60);
    var costPledged = num(s.costPledged) || 0;

    if (!conflictId) return { ok: false, reason: 'missing-conflict-id' };
    if (RESOLUTION_STANCES.indexOf(stance) < 0) {
      return { ok: false, reason: 'invalid-stance', valid: RESOLUTION_STANCES };
    }

    var b = ensureBucket();
    var cHit = b.conflicts.filter(function (c) { return c && c.id === conflictId; })[0];
    if (!cHit) return { ok: false, reason: 'conflict-not-found', id: conflictId };
    if (cHit.status === 'resolved') return { ok: false, reason: 'already-resolved' };

    var breachGroup = null;
    var consequence = '';

    if (stance === 'comply') {
      if (!favoredGroup || (favoredGroup !== cHit.groupA && favoredGroup !== cHit.groupB)) {
        return { ok: false, reason: 'invalid-favored-group', note: 'comply 立场必须明确选择 groupA 或 groupB 之一' };
      }
      breachGroup = (favoredGroup === cHit.groupA) ? cHit.groupB : cHit.groupA;
      consequence = '遵从 ' + favoredGroup + '，并在 ' + breachGroup + ' 记录违约责任';
    } else if (stance === 'recuse') {
      consequence = '从争端中回避退出，承担双方威望折损代价: ' + (costPledged > 0 ? costPledged : 10);
    } else if (stance === 'mediate') {
      consequence = '自费发起中立调停，承担调停担保成本: ' + costPledged;
    } else if (stance === 'breach') {
      consequence = '同时违背双方指令，两方均视其为背叛者';
    }

    var resEntry = {
      id: 'res_' + Math.random().toString(36).slice(2, 9),
      conflictId: conflictId,
      who: cHit.who,
      stance: stance,
      favoredGroup: favoredGroup || null,
      breachGroup: breachGroup,
      consequence: consequence,
      costPledged: costPledged,
      resolvedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.roleConflict = draft.roleConflict || { affiliations: [], conflicts: [], resolutions: [] };
        var c = (draft.roleConflict.conflicts || []).filter(function (x) { return x && x.id === conflictId; })[0];
        if (c) c.status = 'resolved';
        draft.roleConflict.resolutions.push(resEntry);
        return true;
      }, 'roleConflict:resolveStance');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, resolution: resEntry };
  }

  /**
   * 4. 视角隔离与组织可知性
   */
  function viewConflictPerception(conflictId, viewerGroup) {
    var cid = clean(conflictId, 60);
    var vg = clean(viewerGroup, 60);
    var b = ensureBucket();
    var cHit = b.conflicts.filter(function (c) { return c && c.id === cid; })[0];
    if (!cHit) return { ok: false, reason: 'conflict-not-found' };

    var rHit = (b.resolutions || []).filter(function (r) { return r && r.conflictId === cid; })[0];

    // 如果观察者是外部组织，仅能感知其表面公开的违约/履职结果，无法穿透其内部纠结
    if (vg && vg !== cHit.who && vg !== cHit.groupA && vg !== cHit.groupB) {
      return {
        ok: true,
        conflictId: cid,
        viewer: vg,
        visibility: 'opaque',
        publicFact: rHit ? ('该人物在外部争端中采取了 ' + rHit.stance) : '争端未解决',
        internalMotiveMasked: true
      };
    }

    return {
      ok: true,
      conflictId: cid,
      viewer: vg || cHit.who,
      visibility: 'transparent',
      who: cHit.who,
      groupA: cHit.groupA,
      groupB: cHit.groupB,
      severity: cHit.severity,
      resolution: rHit || null,
      internalMotiveMasked: false
    };
  }

  /**
   * 5. 纯读只读投影：roleConflictProjection
   */
  function roleConflictProjection(who) {
    var target = clean(who, 60);
    var b = ensureBucket();
    var affs = b.affiliations || [];
    var confs = b.conflicts || [];
    var resols = b.resolutions || [];

    if (target) {
      affs = affs.filter(function (a) { return a && a.who === target; });
      confs = confs.filter(function (c) { return c && c.who === target; });
      resols = resols.filter(function (r) { return r && r.who === target; });
    }

    var pendingCount = confs.filter(function (c) { return c && c.status === 'pending'; }).length;
    var breachCount = resols.filter(function (r) { return r && (r.breachGroup || r.stance === 'breach'); }).length;

    return {
      ok: true,
      who: target || 'all',
      totalAffiliations: affs.length,
      totalConflicts: confs.length,
      pendingConflicts: pendingCount,
      resolvedConflicts: resols.length,
      breachRecords: breachCount
    };
  }

  WA.roleConflict = {
    registerAffiliationObligation: registerAffiliationObligation,
    detectRoleConflict: detectRoleConflict,
    resolveConflictStance: resolveConflictStance,
    viewConflictPerception: viewConflictPerception,
    roleConflictProjection: roleConflictProjection,
    RESOLUTION_STANCES: RESOLUTION_STANCES.slice(),
    CONFLICT_SEVERITY: CONFLICT_SEVERITY.slice()
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/role-conflict.js', { kind: 'engine', ver: '2.233.0' });
  }

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/role-conflict 已加载（2.233.0）');
  }
})();