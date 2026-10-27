/**
 * WorldAxis engines/social-legacy.js (v2.231.0) — IN-8 社会遗产
 *
 * 核心职责：
 *   由真实已结算事件形成可被看见、传述、承接或拒绝的遗产。
 *   未完事业、公共设施、具名物件、师承、被不同群体记住的声誉。
 *   继任者可接受目标、重新解释、改用途或放弃。
 *   不同见证者可以保留不同版本。
 *   纪念活动和地名/物品意义来自历史，不按每轮强制加仪式。
 *
 * 运行闭环：
 *   完成事件 → 具有来源的物件/地点/承诺关联 → 显式离任/迁居/剧情交接
 *   → 后继者通过接触/学习获知 → 选择承接范围 → 原 life/gear/operations/family/inst 执行。
 *   知识与能力靠传授，秘密靠合法知情路径，生老病死和亲属关系不由计时器强造。
 *
 * 边界：
 *   1. 社会遗产不得覆盖客观事实。
 *   2. 不把声誉、技能、情感或记忆当可继承财产。
 *   3. 遗产必须有可追溯来源事件（sourceEventId）。
 *   4. 不同见证者可保留不同版本，不自动合并为官方真相。
 *   5. 重载后物件出处、责任与选择仍可追溯。
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
    return WA.clock.now('socialLegacy');
  }

  var LEGACY_TYPES = ['unfinished-work', 'facility', 'named-item', 'lineage', 'reputation'];
  var ACCEPT_STATUSES = ['pending', 'accepted', 'reinterpreted', 'declined'];

  function bucket() {
    var s = state();
    return (s.socialLegacy && typeof s.socialLegacy === 'object') ? s.socialLegacy : null;
  }

  function ensureBucket() {
    if (!bucket()) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.socialLegacy = d.socialLegacy || { legacies: [], witnesses: [], claims: [], groupMemories: {}, handovers: {} };
          return true;
        }, 'socialLegacy:init');
      }
    } else {
      var bk = bucket();
      if (!bk.claims || !bk.groupMemories || !bk.handovers) {
        if (WA.store && WA.store.transact) {
          WA.store.transact(function (d) {
            d.socialLegacy = d.socialLegacy || {};
            d.socialLegacy.legacies = d.socialLegacy.legacies || [];
            d.socialLegacy.witnesses = d.socialLegacy.witnesses || [];
            d.socialLegacy.claims = d.socialLegacy.claims || [];
            d.socialLegacy.groupMemories = d.socialLegacy.groupMemories || {};
            d.socialLegacy.handovers = d.socialLegacy.handovers || {};
            return true;
          }, 'socialLegacy:ensureSubStores');
        }
      }
    }
    return bucket() || { legacies: [], witnesses: [], claims: [], groupMemories: {}, handovers: {} };
  }

  /**
   * 从已结算事件形成遗产。
   */
  function formLegacy(spec) {
    var s = spec || {};
    var legacyType = clean(s.legacyType, 30);
    var sourceEventId = clean(s.sourceEventId, 80);
    var originator = clean(s.originator, 40);
    var description = clean(s.description, 120);

    if (!legacyType || !sourceEventId || !originator) return { ok: false, reason: 'missing-fields' };
    if (LEGACY_TYPES.indexOf(legacyType) < 0) return { ok: false, reason: 'bad-legacy-type', allowed: LEGACY_TYPES.slice() };

    var entry = {
      id: 'leg_' + now() + '_' + WA.rand.id(),
      legacyType: legacyType,
      sourceEventId: sourceEventId,
      originator: originator,
      description: description,
      acceptStatus: 'pending',
      successor: '',
      acceptScope: [],
      declinedScope: [],
      witnessAccounts: [],
      formedAt: now(),
      acceptedAt: 0
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.socialLegacy = d.socialLegacy || { legacies: [], witnesses: [] };
        d.socialLegacy.legacies.push(entry);
        return true;
      }, 'socialLegacy:formLegacy');
    }

    return { ok: true, legacy: entry };
  }

  /**
   * 后继者承接遗产。
   * 可接受、重新解释、改用途或放弃。
   */
  function acceptLegacy(legacyId, opts) {
    var s = opts || {};
    var lId = clean(legacyId, 60);
    var successor = clean(s.successor, 40);
    var status = clean(s.status, 20);

    if (!lId || !successor || !status) return { ok: false, reason: 'missing-fields' };
    if (ACCEPT_STATUSES.indexOf(status) < 0 && status !== 'pending') {
      return { ok: false, reason: 'bad-status', allowed: ACCEPT_STATUSES.slice() };
    }
    if (status === 'pending') return { ok: false, reason: 'bad-status', allowed: ACCEPT_STATUSES.slice() };

    var bk = ensureBucket();
    var leg = (bk.legacies || []).filter(function (l) { return l && l.id === lId; })[0];
    if (!leg) return { ok: false, reason: 'legacy-not-found' };
    if (leg.acceptStatus !== 'pending') return { ok: false, reason: 'already-decided', status: leg.acceptStatus };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var l = (d.socialLegacy.legacies || []).filter(function (x) { return x && x.id === lId; })[0];
        if (!l) return false;
        l.acceptStatus = status;
        l.successor = successor;
        l.acceptScope = Array.isArray(s.acceptScope) ? s.acceptScope.slice(0, 6) : [];
        l.declinedScope = Array.isArray(s.declinedScope) ? s.declinedScope.slice(0, 6) : [];
        l.acceptedAt = now();
        if (s.note) l.acceptNote = clean(s.note, 80);
        return true;
      }, 'socialLegacy:acceptLegacy');
    }

    return { ok: true, legacyId: lId, status: status, successor: successor };
  }

  /**
   * 登记见证者对遗产的描述（不同见证者可保留不同版本）。
   */
  function witnessAccount(legacyId, witness, account) {
    var lId = clean(legacyId, 60);
    var who = clean(witness, 40);
    var text = clean(account, 120);
    if (!lId || !who || !text) return { ok: false, reason: 'missing-fields' };

    var entry = {
      legacyId: lId, witness: who, account: text, at: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.socialLegacy = d.socialLegacy || { legacies: [], witnesses: [] };
        d.socialLegacy.witnesses.push(entry);
        return true;
      }, 'socialLegacy:witnessAccount');
    }

    return { ok: true, witness: entry };
  }

  /**
   * 查询遗产及其全部见证描述。
   */
  function viewLegacy(legacyId) {
    var lId = clean(legacyId, 60);
    var bk = ensureBucket();
    var leg = (bk.legacies || []).filter(function (l) { return l && l.id === lId; })[0];
    if (!leg) return { ok: false, reason: 'legacy-not-found' };

    var witnesses = (bk.witnesses || []).filter(function (w) { return w && w.legacyId === lId; });

    return {
      ok: true,
      legacy: JSON.parse(JSON.stringify(leg)),
      witnessAccounts: witnesses.map(function (w) { return { witness: w.witness, account: w.account, at: w.at }; }),
      note: '不同见证者可保留不同版本，不自动合并为官方真相'
    };
  }

  /**
   * 查询某角色留下的全部遗产。
   */
  function legaciesOf(originator) {
    var who = clean(originator, 40);
    var bk = ensureBucket();
    var legs = (bk.legacies || []).filter(function (l) { return l && l.originator === who; });
    return { ok: true, legacies: legs, count: legs.length };
  }

  // ── WX-7 多版本社会记忆与群体立场 ─────────────────────────────────
  var CLAIM_NATURES = ['eyewitness', 'hearsay', 'memorial'];
  var CLAIM_STANCES = ['praise', 'misunderstanding', 'controversy', 'neutral'];

  function registerClaim(eventId, spec) {
    var eId = clean(eventId, 80);
    var s = spec || {};
    var claimant = clean(s.claimant, 40);
    var text = clean(s.claimText || s.text, 160);
    if (!eId || !claimant || !text) return { ok: false, reason: 'missing-fields' };

    var nature = clean(s.nature || 'hearsay', 20);
    if (CLAIM_NATURES.indexOf(nature) < 0) nature = 'hearsay';
    var stance = clean(s.stance || 'neutral', 20);
    if (CLAIM_STANCES.indexOf(stance) < 0) stance = 'neutral';

    var claimId = 'clm_' + now() + '_' + WA.rand.id();
    var entry = {
      id: claimId,
      eventId: eId,
      claimant: claimant,
      nature: nature,
      stance: stance,
      targetWho: clean(s.targetWho || '', 40),
      text: text,
      evidence: clean(s.evidence || '', 80),
      createdAt: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        ensureBucket();
        d.socialLegacy = d.socialLegacy || {};
        d.socialLegacy.claims = d.socialLegacy.claims || [];
        d.socialLegacy.claims.push(entry);
        return true;
      }, 'socialLegacy:registerClaim');
    }
    return { ok: true, claim: entry };
  }

  function spreadClaim(claimId, targetGroupId, opts) {
    var cId = clean(claimId, 60);
    var gId = clean(targetGroupId, 40);
    if (!cId || !gId) return { ok: false, reason: 'missing-fields' };

    var bk = ensureBucket();
    var claim = (bk.claims || []).filter(function (c) { return c && c.id === cId; })[0];
    if (!claim) return { ok: false, reason: 'claim-not-found' };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.socialLegacy = d.socialLegacy || {};
        d.socialLegacy.groupMemories = d.socialLegacy.groupMemories || {};
        d.socialLegacy.groupMemories[gId] = d.socialLegacy.groupMemories[gId] || {};
        d.socialLegacy.groupMemories[gId][claim.eventId] = {
          claimId: claim.id,
          stance: claim.stance,
          targetWho: claim.targetWho,
          adoptedAt: now()
        };
        return true;
      }, 'socialLegacy:spreadClaim');
    }
    return { ok: true, groupId: gId, eventId: claim.eventId, adoptedStance: claim.stance };
  }

  function clarifyClaim(eventId, who, evidence, targetGroupId) {
    var eId = clean(eventId, 80);
    var w = clean(who, 40);
    var gId = clean(targetGroupId, 40);
    var ev = clean(evidence, 80);
    if (!eId || !w || !gId || !ev) return { ok: false, reason: 'missing-fields' };

    var bk = ensureBucket();
    var grp = (bk.groupMemories && bk.groupMemories[gId]) || {};
    var existing = grp[eId];
    if (!existing) return { ok: false, reason: 'no-prior-memory-in-group' };

    var newStance = (existing.stance === 'misunderstanding') ? 'clarified' : 'neutral';
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.socialLegacy = d.socialLegacy || {};
        d.socialLegacy.groupMemories = d.socialLegacy.groupMemories || {};
        d.socialLegacy.groupMemories[gId] = d.socialLegacy.groupMemories[gId] || {};
        d.socialLegacy.groupMemories[gId][eId] = {
          claimId: existing.claimId,
          stance: newStance,
          targetWho: w,
          clarifiedBy: w,
          evidence: ev,
          clarifiedAt: now()
        };
        return true;
      }, 'socialLegacy:clarifyClaim');
    }
    return { ok: true, groupId: gId, eventId: eId, previousStance: existing.stance, newStance: newStance };
  }

  function groupMemoryStance(groupId, who) {
    var gId = clean(groupId, 40);
    var w = clean(who, 40);
    var bk = ensureBucket();
    var grp = (bk.groupMemories && bk.groupMemories[gId]) || {};
    var stances = [];
    Object.keys(grp).forEach(function (eId) {
      var item = grp[eId];
      if (item && (!w || item.targetWho === w)) {
        stances.push(item.stance);
      }
    });

    var praiseCount = stances.filter(function (s) { return s === 'praise'; }).length;
    var badCount = stances.filter(function (s) { return s === 'misunderstanding' || s === 'controversy'; }).length;
    var clarifiedCount = stances.filter(function (s) { return s === 'clarified'; }).length;

    var discountFactor = 1.0;
    var trustModifier = 0;
    if (praiseCount > badCount) {
      discountFactor = 0.9;
      trustModifier = 10;
    } else if (badCount > praiseCount) {
      discountFactor = 1.25;
      trustModifier = -15;
    }

    return {
      ok: true,
      groupId: gId,
      who: w,
      summaryStance: (badCount > praiseCount) ? 'suspicious' : (praiseCount > 0 ? 'favorable' : 'neutral'),
      praiseCount: praiseCount,
      adverseCount: badCount,
      clarifiedCount: clarifiedCount,
      trustModifier: trustModifier,
      costModifier: discountFactor
    };
  }

  // ── WX-8 多方承继、退出与未完项目再组织 ────────────────────────────
  function initiateHandover(spec) {
    var s = spec || {};
    var departingWho = clean(s.departingWho, 40);
    var reason = clean(s.reason || 'relocation', 40);
    if (!departingWho) return { ok: false, reason: 'missing-fields' };

    var inv = s.inventory || {};
    var handoverId = 'hnd_' + now() + '_' + WA.rand.id();
    var record = {
      id: handoverId,
      departingWho: departingWho,
      reason: reason,
      items: {
        gear: Array.isArray(inv.gear) ? inv.gear.slice() : [],
        positions: Array.isArray(inv.positions) ? inv.positions.slice() : [],
        projects: Array.isArray(inv.projects) ? inv.projects.slice() : [],
        liabilities: Array.isArray(inv.liabilities) ? inv.liabilities.slice() : [],
        stationAccess: Array.isArray(inv.stationAccess) ? inv.stationAccess.slice() : []
      },
      proposals: [],
      resolvedAllocations: {},
      unclaimedItems: [],
      contestedItems: [],
      status: 'pending',
      createdAt: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        ensureBucket();
        d.socialLegacy.handovers = d.socialLegacy.handovers || {};
        d.socialLegacy.handovers[handoverId] = record;
        return true;
      }, 'socialLegacy:initiateHandover');
    }
    return { ok: true, handover: record };
  }

  function proposeSuccession(handoverId, candidateWho, acceptedScope, terms) {
    var hId = clean(handoverId, 60);
    var cWho = clean(candidateWho, 40);
    if (!hId || !cWho) return { ok: false, reason: 'missing-fields' };

    var bk = ensureBucket();
    var hnd = bk.handovers && bk.handovers[hId];
    if (!hnd) return { ok: false, reason: 'handover-not-found' };
    if (hnd.status !== 'pending') return { ok: false, reason: 'handover-closed', status: hnd.status };

    var proposal = {
      candidate: cWho,
      acceptedScope: Array.isArray(acceptedScope) ? acceptedScope.slice() : [],
      declinedScope: (terms && Array.isArray(terms.declinedScope)) ? terms.declinedScope.slice() : [],
      terms: terms || {},
      submittedAt: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var h = d.socialLegacy.handovers[hId];
        h.proposals.push(proposal);
        return true;
      }, 'socialLegacy:proposeSuccession');
    }
    return { ok: true, proposal: proposal };
  }

  function resolveHandover(handoverId, opts) {
    var hId = clean(handoverId, 60);
    var bk = ensureBucket();
    var hnd = bk.handovers && bk.handovers[hId];
    if (!hnd) return { ok: false, reason: 'handover-not-found' };
    if (hnd.status !== 'pending') return { ok: false, reason: 'handover-closed', status: hnd.status };

    var o = opts || {};
    var itemOwners = {};
    var allItems = [];
    ['gear', 'positions', 'projects', 'liabilities', 'stationAccess'].forEach(function (cat) {
      (hnd.items[cat] || []).forEach(function (itm) {
        var key = cat + ':' + itm;
        allItems.push(key);
        itemOwners[key] = [];
      });
    });

    hnd.proposals.forEach(function (p) {
      p.acceptedScope.forEach(function (scopeKey) {
        if (itemOwners[scopeKey]) {
          itemOwners[scopeKey].push(p.candidate);
        }
      });
    });

    var allocations = {};
    var unclaimed = [];
    var contested = [];

    allItems.forEach(function (k) {
      var bids = itemOwners[k] || [];
      if (bids.length === 0) {
        allocations[k] = { status: 'unclaimed', winner: null };
        unclaimed.push(k);
      } else if (bids.length === 1) {
        allocations[k] = { status: 'assigned', winner: bids[0] };
      } else {
        var arbiterPick = (o.arbitration && o.arbitration[k]) ? clean(o.arbitration[k], 40) : null;
        if (arbiterPick && bids.indexOf(arbiterPick) >= 0) {
          allocations[k] = { status: 'assigned_by_arbitration', winner: arbiterPick };
        } else {
          allocations[k] = { status: 'contested', contenders: bids };
          contested.push(k);
        }
      }
    });

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var h = d.socialLegacy.handovers[hId];
        h.resolvedAllocations = allocations;
        h.unclaimedItems = unclaimed;
        h.contestedItems = contested;
        h.status = contested.length > 0 ? 'contested' : 'resolved';
        h.resolvedAt = now();
        return true;
      }, 'socialLegacy:resolveHandover');
    }

    return {
      ok: true,
      handoverId: hId,
      status: contested.length > 0 ? 'contested' : 'resolved',
      allocations: allocations,
      unclaimed: unclaimed,
      contested: contested
    };
  }

  function reorganizeUnclaimed(handoverId, policyMap) {
    var hId = clean(handoverId, 60);
    var bk = ensureBucket();
    var hnd = bk.handovers && bk.handovers[hId];
    if (!hnd) return { ok: false, reason: 'handover-not-found' };

    var pol = policyMap || {};
    var results = {};

    (hnd.unclaimedItems || []).forEach(function (itemKey) {
      var action = clean(pol[itemKey] || 'custody', 20);
      results[itemKey] = {
        action: action,
        note: action === 'close' ? '项目/责任受控关闭，违约与善后按实记录' : '已交由公堂/组织托管'
      };
    });

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var h = d.socialLegacy.handovers[hId];
        h.reorganization = results;
        h.reorganizedAt = now();
        return true;
      }, 'socialLegacy:reorganizeUnclaimed');
    }
    return { ok: true, handoverId: hId, reorganization: results };
  }

  /**
   * EXV5-7: 世代意志托付与绝笔信使契约（entrustDeathbedPact & claimDeathbedPact）
   * 角色濒死或离场时，向受托人订立绝笔文书契约与遗志交接，附带见证信物与遗愿义务
   */
  function entrustDeathbedPact(pactSpec) {
    var p = pactSpec || {};
    var testator = clean(p.testator || p.who, 40);
    var trustee = clean(p.trustee, 40);
    var bequest = clean(p.bequest || p.lastWill, 160);
    var keepsake = clean(p.keepsake, 40) || '生锈的镖局铜令';
    if (!testator || !trustee || !bequest) {
      return { ok: false, reason: 'missing-fields' };
    }

    var pactId = WA.rand.id('pact_', 6, 'id');
    var out = null;

    WA.store.transact(function (draft) {
      draft.socialLegacy = draft.socialLegacy || {};
      draft.socialLegacy.deathbedPacts = draft.socialLegacy.deathbedPacts || {};
      var entry = {
        id: pactId,
        testator: testator,
        trustee: trustee,
        bequest: bequest,
        keepsake: keepsake,
        status: 'pending_fulfillment', // 'pending_fulfillment', 'fulfilled', 'betrayed'
        entrustedAt: now()
      };
      draft.socialLegacy.deathbedPacts[pactId] = entry;
      out = {
        ok: true,
        pactId: pactId,
        testator: testator,
        trustee: trustee,
        bequest: bequest,
        keepsake: keepsake,
        status: entry.status,
        note: '绝笔遗愿契约已建立，见证信物已妥善交付'
      };
      return true;
    }, 'socialLegacy:entrustDeathbedPact');

    return out || { ok: false, reason: 'store-unavailable' };
  }

  function fulfillDeathbedPact(pactId, trustee, outcome) {
    var pid = clean(pactId, 60);
    var t = clean(trustee, 40);
    var outc = clean(outcome, 20) || 'fulfilled'; // 'fulfilled', 'betrayed'
    if (!pid || !t) return { ok: false, reason: 'missing-fields' };

    var out = null;
    WA.store.transact(function (draft) {
      var pacts = (draft.socialLegacy && draft.socialLegacy.deathbedPacts) ? draft.socialLegacy.deathbedPacts : {};
      var p = pacts[pid];
      if (!p) {
        out = { ok: false, reason: 'pact-not-found' };
        return false;
      }
      if (p.trustee !== t) {
        out = { ok: false, reason: 'unauthorized-trustee' };
        return false;
      }
      p.status = outc;
      p.fulfilledAt = now();
      out = {
        ok: true,
        pactId: pid,
        testator: p.testator,
        trustee: t,
        status: p.status,
        note: outc === 'fulfilled' ? '遗志已圆满恪守兑现' : '受托人背弃了临终嘱托'
      };
      return true;
    }, 'socialLegacy:fulfillDeathbedPact');

    return out || { ok: false, reason: 'store-unavailable' };
  }

  WA.socialLegacy = {
    formLegacy: formLegacy,
    acceptLegacy: acceptLegacy,
    witnessAccount: witnessAccount,
    viewLegacy: viewLegacy,
    legaciesOf: legaciesOf,
    registerClaim: registerClaim,
    spreadClaim: spreadClaim,
    clarifyClaim: clarifyClaim,
    groupMemoryStance: groupMemoryStance,
    initiateHandover: initiateHandover,
    proposeSuccession: proposeSuccession,
    resolveHandover: resolveHandover,
    reorganizeUnclaimed: reorganizeUnclaimed,
    entrustDeathbedPact: entrustDeathbedPact,
    fulfillDeathbedPact: fulfillDeathbedPact,
    LEGACY_TYPES: LEGACY_TYPES.slice(),
    ACCEPT_STATUSES: ACCEPT_STATUSES.slice()
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/social-legacy.js', { kind: 'engine', ver: '2.231.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/social-legacy 已加载（2.231.0）');
  }
})();