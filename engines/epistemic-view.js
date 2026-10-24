/**
 * WorldAxis engines/epistemic-view.js (v2.231.0) — OP-7 让角色按自己手里的版本行动
 *
 * 核心职责：
 *   行动前生成角色局部事实视图：本人所见、听闻版本、确信度、来源与过期信息。
 *   基于手里的局部版本选择行动（调查、询问、防范、合作），杜绝全知。
 *   新证据可以纠正信念，但已经造成的损失与关系裂痕不被系统静默擦除。
 *   公开更正只影响实际收到更正的人，曾因误会取消的约定不自动恢复。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : '');
  }

  function personId(name) {
    const n = clean(name, 60);
    return n ? (n.indexOf('p_') === 0 ? n : 'p_' + n) : '';
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function ensureEpistemicStore() {
    let s = state();
    if (!s.epistemicStore || typeof s.epistemicStore !== 'object') {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.epistemicStore = d.epistemicStore || { beliefs: {} };
          return true;
        }, 'epistemicView:init');
      }
      s = state();
    }
    return s.epistemicStore || { beliefs: {} };
  }

  /**
   * 登记或更新某角色对某事实的信念版本
   */
  function registerBelief(whoName, topicId, beliefData) {
    const pId = personId(whoName);
    const tId = clean(topicId, 60);
    const b = beliefData || {};

    if (!pId || !tId) return { ok: false, reason: 'missing-fields' };

    const entry = {
      personId: pId,
      topicId: tId,
      version: clean(b.version || 'v1', 40),
      summary: clean(b.summary || '', 100),
      claimTruth: !!b.claimTruth,
      certainty: clean(b.certainty || 'tentative', 20), // 'certain' | 'tentative' | 'distrusted'
      source: clean(b.source || 'hearsay', 30), // 'witnessed' | 'hearsay' | 'document' | 'rumor'
      faithful: b.faithful !== false, // 是否与客观事实相符
      updatedAt: WA.clock.now('epistemic')
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        s.epistemicStore = s.epistemicStore || { beliefs: {} };
        const key = pId + ':' + tId;
        s.epistemicStore.beliefs[key] = entry;
        return true;
      }, 'epistemicView:registerBelief');
    }

    return { ok: true, belief: entry };
  }

  /**
   * 生成角色局部事实视图
   */
  function buildView(whoName, topicId) {
    const pId = personId(whoName);
    const tId = clean(topicId, 60);
    const eStore = ensureEpistemicStore();
    const key = pId + ':' + tId;
    const belief = eStore.beliefs && eStore.beliefs[key];

    // 若无明确登记，通过 noesis 查询
    if (!belief) {
      let known = false;
      let faithful = false;
      if (WA.noesis && typeof WA.noesis.knows === 'function') {
        const kRes = WA.noesis.knows(pId, tId);
        known = !!(kRes && kRes.known);
      }
      if (WA.noesis && typeof WA.noesis.fidelity === 'function') {
        const fRes = WA.noesis.fidelity(pId, tId);
        faithful = !!(fRes && fRes.faithful);
      }

      return {
        ok: true,
        personId: pId,
        topicId: tId,
        known: known,
        version: known ? 'v_implicit' : null,
        summary: known ? '已知晓基本概要' : '完全未知',
        certainty: known ? 'tentative' : 'unaware',
        source: 'implicit',
        faithful: faithful
      };
    }

    return {
      ok: true,
      personId: pId,
      topicId: tId,
      known: true,
      version: belief.version,
      summary: belief.summary,
      claimTruth: belief.claimTruth,
      certainty: belief.certainty,
      source: belief.source,
      faithful: belief.faithful
    };
  }

  /**
   * 根据角色局部信念推导行动
   */
  function deriveAction(whoName, topicId) {
    const view = buildView(whoName, topicId);
    if (!view.known || view.certainty === 'unaware') {
      return {
        action: 'investigate',
        reason: 'unaware-of-topic',
        note: '角色对此一无所知，需先开展调查打听'
      };
    }

    // 若角色相信该事项被破坏/背约/欺诈（不忠实事实或负面摘要）
    if (!view.claimTruth || !view.faithful) {
      return {
        action: 'suspend_and_interrogate',
        reason: 'belief-distorted-or-hostile',
        versionHeld: view.version,
        note: '角色掌握的是失真/负面版本「' + view.summary + '」，决定暂停合作并质询对方'
      };
    }

    // 若角色确信为正向事实
    if (view.certainty === 'certain') {
      return {
        action: 'cooperate_fully',
        reason: 'firm-belief-in-truth',
        versionHeld: view.version,
        note: '角色确信事实成立，全力推进合作'
      };
    }

    // 虽正向但半信半疑
    return {
      action: 'verify_before_commit',
      reason: 'tentative-belief',
      versionHeld: view.version,
      note: '角色听闻好消息但尚未确凿证实，保持审慎求证'
    };
  }

  /**
   * 出示证据纠正信念（公开更正仅影响接收者，历史约定不自动撤销）
   */
  function correctBelief(whoName, topicId, evidence, opts) {
    const pId = personId(whoName);
    const tId = clean(topicId, 60);
    const ev = evidence || {};

    if (!ev.proofText) {
      return { ok: false, reason: 'insufficient-evidence', note: '证据不足，无法改变固有成见' };
    }

    const o = opts || {};
    const eStore = ensureEpistemicStore();
    const key = pId + ':' + tId;
    const oldBelief = eStore.beliefs && eStore.beliefs[key];

    const corrected = {
      personId: pId,
      topicId: tId,
      version: clean(ev.version || 'v_corrected', 40),
      summary: clean(ev.proofText, 100),
      claimTruth: true,
      certainty: 'certain',
      source: clean(ev.source || 'direct_proof', 30),
      faithful: true,
      previousDistortion: oldBelief ? oldBelief.summary : null,
      updatedAt: WA.clock.now('epistemic')
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        s.epistemicStore = s.epistemicStore || { beliefs: {} };
        s.epistemicStore.beliefs[key] = corrected;
        return true;
      }, 'epistemicView:correctBelief');
    }
    return {
      ok: true,
      corrected: true,
      personId: pId,
      topicId: tId,
      previousSummary: oldBelief ? oldBelief.summary : null,
      newSummary: corrected.summary,
      historicalActionsIntact: true, // 曾因误会产生的违约不被系统静默抹去
      requiresReconciliation: true // 仍需走显式和解
    };
  }

  /**
   * OPV3-5: 角色完全按自己手头掌握的信息版本做决策
   * 杜绝全知视角，不同角色因掌握版本不同产生截然不同的行动。
   */
  function decideAction(whoName, topicId, situationContext) {
    const pId = personId(whoName);
    const tId = clean(topicId, 60);
    if (!pId || !tId) return { ok: false, reason: 'missing-fields' };

    const view = buildView(whoName, topicId);
    const ctx = situationContext || {};

    // 1. 完全不知情
    if (!view.known || view.source === 'uninformed') {
      return {
        ok: true,
        person: whoName,
        topicId: tId,
        chosenAction: 'unaware_inaction',
        reason: 'uninformed',
        costIncurred: null,
        note: '角色全然不知该项事态，未采取任何针对性行动'
      };
    }

    // 2. 持有走样或失真信息
    if (!view.faithful || view.status === 'distorted') {
      return {
        ok: true,
        person: whoName,
        topicId: tId,
        chosenAction: 'misguided_precaution',
        distortionHeld: view.summary,
        faithful: false,
        costIncurred: { energy: 10, timeHours: 2 },
        note: '角色听信走样传闻，做出了偏差防范并付出了真实代价'
      };
    }

    // 3. 确凿事实
    if (view.certainty === 'certain') {
      return {
        ok: true,
        person: whoName,
        topicId: tId,
        chosenAction: 'targeted_response',
        rationale: view.summary,
        faithful: true,
        costIncurred: { energy: 5, timeHours: 1 },
        note: '角色掌握确凿事实，采取了精准有效的应对行动'
      };
    }

    // 4. 听闻但半信半疑
    return {
      ok: true,
      person: whoName,
      topicId: tId,
      chosenAction: 'verify_before_commit',
      rationale: view.summary,
      faithful: true,
      costIncurred: { energy: 2, timeHours: 0.5 },
      note: '角色虽有所耳闻但缺乏确据，决定先行核实再予表态'
    };
  }

  /**
   * OPV4-5：证据可信度评估（weighEvidence）。
   * 纯读计算：输入证据集与人物视角，输出可信度总分、排序、主导证词与冲突点。
   * 严守契约：零写入，不修改已有 store，不凭空注入后台真值。
   */
  function weighEvidence(whoName, topicId, evidenceItems, opts) {
    const pId = personId(whoName);
    const tId = clean(topicId, 60);
    const items = Array.isArray(evidenceItems) ? evidenceItems : [];
    const o = opts || {};
    const view = buildView(whoName, topicId);

    // 来源基准权重表
    const SOURCE_WEIGHTS = {
      eyewitness: 0.9,     // 亲眼目睹 / 直接见证
      official_doc: 0.85,  // 官署公文 / 盖印契约
      ledger: 0.8,        // 账册凭证 / 实物字据
      trusted_ally: 0.75,  // 密友转述 / 盟友信函
      hearsay: 0.45,       // 市井传言 / 坊间耳闻
      anonymous: 0.2,     // 匿名飞书 / 涂鸦
      rival_claim: 0.15    // 竞争对手的单方面指控
    };

    let totalWeight = 0;
    let weighedItems = items.map(function (it, idx) {
      const src = clean(it.source || 'hearsay', 30);
      let baseW = SOURCE_WEIGHTS[src] != null ? SOURCE_WEIGHTS[src] : 0.4;
      // 链路衰减：每多一层转述，衰减 20%
      const hops = Math.max(0, Math.min(5, Number(it.hops) || 0));
      const decay = Math.pow(0.8, hops);
      // 时效衰减：超过有效天数时折扣
      const ageDays = Math.max(0, Number(it.ageDays) || 0);
      const timeDecay = ageDays > 30 ? 0.5 : (ageDays > 7 ? 0.8 : 1.0);
      const finalScore = Math.round(baseW * decay * timeDecay * 100) / 100;
      totalWeight += finalScore;

      return {
        id: it.id || ('ev_' + idx),
        claim: clean(it.claim || it.text || '', 100),
        stance: clean(it.stance || 'support', 20), // 'support' | 'oppose' | 'neutral'
        source: src,
        hops: hops,
        ageDays: ageDays,
        credibility: finalScore
      };
    });

    // 按可信度降序排序
    weighedItems.sort(function (a, b) { return b.credibility - a.credibility; });

    // 统计支持度与反对度
    let supportSum = 0;
    let opposeSum = 0;
    weighedItems.forEach(function (x) {
      if (x.stance === 'support') supportSum += x.credibility;
      else if (x.stance === 'oppose') opposeSum += x.credibility;
    });

    const dominantStance = supportSum >= opposeSum ? 'support' : 'oppose';
    const hasConflict = supportSum > 0 && opposeSum > 0;
    const confidenceGap = Math.abs(supportSum - opposeSum);

    return {
      ok: true,
      personId: pId,
      topicId: tId,
      priorView: { version: view.version, certainty: view.certainty, summary: view.summary },
      totalEvidenceCount: items.length,
      dominantStance: dominantStance,
      hasConflict: hasConflict,
      confidenceGap: Math.round(confidenceGap * 100) / 100,
      supportScore: Math.round(supportSum * 100) / 100,
      opposeScore: Math.round(opposeSum * 100) / 100,
      rankedItems: weighedItems
    };
  }

  /**
   * OPV4-5：基于证据可信度更新信念（updateBeliefWithEvidence）。
   * 根据 weighEvidence 的裁决结果，决定是否推翻角色旧判断并留痕历史反证。
   */
  function updateBeliefWithEvidence(whoName, topicId, evidenceItems, opts) {
    const pId = personId(whoName);
    const tId = clean(topicId, 60);
    if (!pId || !tId) return { ok: false, reason: 'missing-fields' };

    const weigh = weighEvidence(whoName, topicId, evidenceItems, opts);
    if (!weigh.ok) return weigh;

    const eStore = ensureEpistemicStore();
    const key = pId + ':' + tId;
    const oldBelief = eStore.beliefs && eStore.beliefs[key];

    // 如果最高可信度证据未达到门槛（0.3），角色坚持既有信念，认为证据不足以服人
    const topEv = weigh.rankedItems[0];
    if (!topEv || topEv.credibility < 0.3) {
      return {
        ok: true,
        changed: false,
        reason: 'evidence-too-weak',
        topCredibility: topEv ? topEv.credibility : 0,
        currentBelief: oldBelief ? oldBelief.summary : '无既有信念',
        note: '出示的证据可信度不足以改变角色判断'
      };
    }

    const newClaimTruth = weigh.dominantStance === 'support';
    const newCertainty = weigh.confidenceGap >= 0.5 ? 'certain' : 'tentative';
    const newSummary = topEv.claim;

    const nextBelief = {
      personId: pId,
      topicId: tId,
      version: clean(opts && opts.version || 'v_ev_' + topEv.id, 40),
      summary: newSummary,
      claimTruth: newClaimTruth,
      certainty: newCertainty,
      source: topEv.source,
      faithful: true,
      previousDistortion: oldBelief ? oldBelief.summary : null,
      evidenceHops: topEv.hops,
      evidenceScore: topEv.credibility,
      counterEvidenceConflict: weigh.hasConflict,
      updatedAt: WA.clock.now('epistemic')
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        s.epistemicStore = s.epistemicStore || { beliefs: {} };
        s.epistemicStore.beliefs[key] = nextBelief;
        return true;
      }, 'epistemicView:updateBeliefWithEvidence');
    }

    return {
      ok: true,
      changed: true,
      personId: pId,
      topicId: tId,
      previousSummary: oldBelief ? oldBelief.summary : null,
      newSummary: nextBelief.summary,
      certainty: nextBelief.certainty,
      topSource: topEv.source,
      hasConflict: weigh.hasConflict,
      requiresReconciliation: !!(oldBelief && oldBelief.claimTruth !== nextBelief.claimTruth)
    };
  }

  WA.epistemicView = {
    registerBelief: registerBelief,
    buildView: buildView,
    deriveAction: deriveAction,
    correctBelief: correctBelief,
    decideAction: decideAction,
    // v2.233.0 (OPV4-5): 证据可信度评估与判断更替
    weighEvidence: weighEvidence,
    updateBeliefWithEvidence: updateBeliefWithEvidence
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/epistemic-view 已加载（2.231.0）');
  }
})();