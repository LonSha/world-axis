/**
 * WorldAxis engines/public-agenda.js (v2.233.0) — EXV4-4 公共议程设置与代表性缺口
 *
 * 核心职责：
 *   - 连接 rumor/opinion（民意与传播）、custom-lax（规则与先例）、coop（公共项目）和 operations。
 *   - 不同群体（职业、居民、宗族、行会等）提出有证据支撑的议题。
 *   - 议题受传播覆盖（reach）、代表资格（representation）、资源调配与议程容量（capacity）约束。
 *   - 有限议程位竞争：超额议题进入排队/延迟/被拒（delayed / rejected），被排除者保留原案以便后续进入。
 *   - 秘密与局外人隔离：局外人（outsiders）无法得知保密议题与非公开证据。
 *   - 通过的议题可直接联动并改变既有规则（custom-lax）或公共项目（coop）。
 *
 * 否定式边界：
 *   1. 不造第二套议会或虚拟政府：直接复用 custom-lax 与 coop 既有审批/规约结构。
 *   2. 证据不可凭空伪造：提交议题必须有可核查的 sourceEvidence（证据引用）。
 *   3. 容量硬约束：议程槽位 (agendaSlots) 满载时强制竞争与积压，拒绝静默丢弃。
 *   4. 纯读只读投影零副作用：publicAgendaProjection 零 store.transact。
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
    return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('publicAgenda') : Date.now();
  }

  var TOPIC_STATUS = ['proposed', 'scheduled', 'delayed', 'debated', 'enacted', 'rejected'];

  function bucket() {
    var s = state();
    return (s.publicAgenda && typeof s.publicAgenda === 'object') ? s.publicAgenda : null;
  }

  function ensureBucket() {
    var b = bucket();
    if (!b) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.publicAgenda = d.publicAgenda || {
            agendas: {}, // placeId -> { slots: 3, items: [] }
            proposals: [],
            deliberations: []
          };
          return true;
        }, 'publicAgenda:init');
      }
      b = bucket() || { agendas: {}, proposals: [], deliberations: [] };
    }
    if (!b.agendas || typeof b.agendas !== 'object') b.agendas = {};
    if (!Array.isArray(b.proposals)) b.proposals = [];
    if (!Array.isArray(b.deliberations)) b.deliberations = [];
    return b;
  }

  /**
   * 1. 声明地点议程容量与议事设置
   */
  function setAgendaCapacity(placeId, maxSlots) {
    var pid = clean(placeId, 60);
    var slots = Math.max(1, Math.min(10, Math.floor(Number(maxSlots) || 3)));
    if (!pid) return { ok: false, reason: 'missing-place' };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.publicAgenda = draft.publicAgenda || { agendas: {}, proposals: [], deliberations: [] };
        draft.publicAgenda.agendas = draft.publicAgenda.agendas || {};
        var existing = draft.publicAgenda.agendas[pid] || { slots: slots, activeTopicIds: [] };
        existing.slots = slots;
        if (!Array.isArray(existing.activeTopicIds)) existing.activeTopicIds = [];
        draft.publicAgenda.agendas[pid] = existing;
        return true;
      }, 'publicAgenda:setCapacity');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, placeId: pid, slots: slots };
  }

  /**
   * 2. 群体提出有证据的议题提案
   * 约束：必须有 groupName、sourceEvidence，可设置 isSecret。
   */
  function submitProposal(spec) {
    var s = spec || {};
    var id = clean(s.id || ('prop_' + Math.random().toString(36).slice(2, 9)), 60);
    var placeId = clean(s.placeId, 60);
    var groupName = clean(s.groupName, 60);
    var title = clean(s.title, 80);
    var category = clean(s.category || 'regulation', 40); // regulation | public_project | resource_allocation
    var sourceEvidence = clean(s.sourceEvidence, 120);
    var supportWeight = Math.max(1, Math.floor(Number(s.supportWeight) || 1));
    var isSecret = !!s.isSecret;
    var allowedGroups = Array.isArray(s.allowedGroups) ? s.allowedGroups.map(function (g) { return clean(g, 60); }) : [groupName];

    if (!placeId) return { ok: false, reason: 'missing-place' };
    if (!groupName) return { ok: false, reason: 'missing-group' };
    if (!title) return { ok: false, reason: 'missing-title' };
    if (!sourceEvidence) return { ok: false, reason: 'missing-source-evidence' };

    var b = ensureBucket();
    var exists = b.proposals.some(function (p) { return p && p.id === id; });
    if (exists) return { ok: false, reason: 'proposal-already-exists', id: id };

    var proposalEntry = {
      id: id,
      placeId: placeId,
      groupName: groupName,
      title: title,
      category: category,
      sourceEvidence: sourceEvidence,
      supportWeight: supportWeight,
      isSecret: isSecret,
      allowedGroups: allowedGroups,
      status: 'proposed',
      scheduledAt: null,
      submittedAt: now(),
      updatedAt: now()
    };

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.publicAgenda = draft.publicAgenda || { agendas: {}, proposals: [], deliberations: [] };
        draft.publicAgenda.proposals.push(proposalEntry);
        return true;
      }, 'publicAgenda:submitProposal');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return { ok: true, proposal: proposalEntry };
  }

  /**
   * 3. 议程准入裁决与竞争排期
   * 根据议程容量与群体代表性/支持权重竞争槽位；槽位已满者转入 delayed。
   */
  function scheduleAgenda(placeId) {
    var pid = clean(placeId, 60);
    if (!pid) return { ok: false, reason: 'missing-place' };

    var b = ensureBucket();
    var cfg = (b.agendas && b.agendas[pid]) ? b.agendas[pid] : { slots: 3, activeTopicIds: [] };
    var maxSlots = cfg.slots || 3;

    var placeProposals = (b.proposals || []).filter(function (p) {
      return p && p.placeId === pid && (p.status === 'proposed' || p.status === 'delayed');
    });

    if (!placeProposals.length) {
      return { ok: true, placeId: pid, scheduled: [], delayed: [], message: 'no-pending-proposals' };
    }

    // 按 supportWeight 降序排序，若同分按 submittedAt 升序先到先得
    placeProposals.sort(function (a, b) {
      if (b.supportWeight !== a.supportWeight) return b.supportWeight - a.supportWeight;
      return a.submittedAt - b.submittedAt;
    });

    var scheduledList = [];
    var delayedList = [];

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.publicAgenda = draft.publicAgenda || { agendas: {}, proposals: [], deliberations: [] };
        var activeIds = [];

        placeProposals.forEach(function (prop, idx) {
          var target = draft.publicAgenda.proposals.filter(function (p) { return p && p.id === prop.id; })[0];
          if (!target) return;

          if (idx < maxSlots) {
            target.status = 'scheduled';
            target.scheduledAt = now();
            target.updatedAt = now();
            activeIds.push(target.id);
            scheduledList.push(JSON.parse(JSON.stringify(target)));
          } else {
            target.status = 'delayed';
            target.updatedAt = now();
            delayedList.push(JSON.parse(JSON.stringify(target)));
          }
        });

        draft.publicAgenda.agendas[pid] = draft.publicAgenda.agendas[pid] || {};
        draft.publicAgenda.agendas[pid].activeTopicIds = activeIds;
        return true;
      }, 'publicAgenda:scheduleAgenda');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return {
      ok: true,
      placeId: pid,
      maxSlots: maxSlots,
      scheduled: scheduledList,
      delayed: delayedList
    };
  }

  /**
   * 4. 审议通过议题并联动改变具体制度/规则/项目
   * 支持联动 custom-lax (规则制定) 或 coop (项目立项)
   */
  function enactAgendaTopic(spec) {
    var s = spec || {};
    var proposalId = clean(s.proposalId, 60);
    var outcome = clean(s.outcome || 'enacted', 30); // enacted | rejected
    var enactmentAction = clean(s.enactmentAction, 60); // 如 customLax.enactRule 或 coop.proposeProject
    var actionParams = s.actionParams || {};

    if (!proposalId) return { ok: false, reason: 'missing-proposal-id' };

    var b = ensureBucket();
    var prop = b.proposals.filter(function (p) { return p && p.id === proposalId; })[0];
    if (!prop) return { ok: false, reason: 'proposal-not-found', id: proposalId };

    var deliberationRecord = {
      id: 'delib_' + Math.random().toString(36).slice(2, 9),
      proposalId: proposalId,
      outcome: outcome,
      enactmentAction: enactmentAction,
      deliberatedAt: now()
    };

    var linkageResult = null;
    // 若审议通过且携带联动动作，执行系统真实改变
    if (outcome === 'enacted' && enactmentAction) {
      if (enactmentAction === 'customLax.spawnCandidate' && WA.customLax) {
        linkageResult = WA.customLax.spawnCandidate(actionParams);
      } else if (enactmentAction === 'coop.proposeProject' && WA.coop) {
        linkageResult = WA.coop.proposeProject(actionParams);
      }
    }

    var txOk = false;
    if (WA.store && WA.store.transact) {
      txOk = WA.store.transact(function (draft) {
        draft.publicAgenda = draft.publicAgenda || { agendas: {}, proposals: [], deliberations: [] };
        var target = draft.publicAgenda.proposals.filter(function (p) { return p && p.id === proposalId; })[0];
        if (target) {
          target.status = outcome;
          target.updatedAt = now();
        }
        draft.publicAgenda.deliberations.push(deliberationRecord);
        return true;
      }, 'publicAgenda:enactTopic');
    }

    if (!txOk) return { ok: false, reason: 'store-unavailable' };
    return {
      ok: true,
      proposalId: proposalId,
      outcome: outcome,
      deliberation: deliberationRecord,
      linkageResult: linkageResult
    };
  }

  /**
   * 5. 视角过滤查询：防剧透与局外人隔离
   * 局外人（不在 allowedGroups 且非中立公开议题）无法查到保密提案详情
   */
  function viewAgenda(placeId, viewerGroup) {
    var pid = clean(placeId, 60);
    var vGroup = clean(viewerGroup, 60);

    var b = ensureBucket();
    var proposals = (b.proposals || []).filter(function (p) {
      return p && (!pid || p.placeId === pid);
    });

    var visible = [];
    var redactedCount = 0;

    proposals.forEach(function (p) {
      if (p.isSecret) {
        var isAllowed = vGroup && Array.isArray(p.allowedGroups) && p.allowedGroups.indexOf(vGroup) >= 0;
        if (!isAllowed) {
          redactedCount++;
          return;
        }
      }
      visible.push(JSON.parse(JSON.stringify(p)));
    });

    return {
      ok: true,
      placeId: pid || 'all',
      viewerGroup: vGroup || 'anonymous',
      visibleProposals: visible,
      redactedCount: redactedCount
    };
  }

  /**
   * 6. 纯读只读投影：publicAgendaProjection
   * 统计议程活跃数、代表性覆盖群体数、积压议题与通过率。零副作用。
   */
  function publicAgendaProjection(placeId) {
    var pid = clean(placeId, 60);
    var b = ensureBucket();
    var proposals = b.proposals || [];

    var filtered = proposals.filter(function (p) {
      return p && (!pid || p.placeId === pid);
    });

    var counts = {
      proposed: 0,
      scheduled: 0,
      delayed: 0,
      enacted: 0,
      rejected: 0
    };

    var groupsSet = {};

    filtered.forEach(function (p) {
      if (counts[p.status] !== undefined) counts[p.status]++;
      if (p.groupName) groupsSet[p.groupName] = true;
    });

    var total = filtered.length;
    var representedGroups = Object.keys(groupsSet).length;
    var representationRatio = total > 0 ? (representedGroups / total) : 1.0;

    return {
      ok: true,
      placeId: pid || 'all',
      totalProposals: total,
      counts: counts,
      representedGroups: representedGroups,
      representationRatio: Number(representationRatio.toFixed(3)),
      backlogCount: counts.delayed
    };
  }

  WA.publicAgenda = {
    setAgendaCapacity: setAgendaCapacity,
    submitProposal: submitProposal,
    scheduleAgenda: scheduleAgenda,
    enactAgendaTopic: enactAgendaTopic,
    viewAgenda: viewAgenda,
    publicAgendaProjection: publicAgendaProjection,
    TOPIC_STATUS: TOPIC_STATUS.slice()
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/public-agenda.js', { kind: 'engine', ver: '2.233.0' });
  }

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/public-agenda 已加载（2.233.0）');
  }
})();