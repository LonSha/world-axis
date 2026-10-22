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
      updatedAt: (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('epistemic') : Date.now()
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
      updatedAt: (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('epistemic') : Date.now()
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

  WA.epistemicView = {
    registerBelief: registerBelief,
    buildView: buildView,
    deriveAction: deriveAction,
    correctBelief: correctBelief
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/epistemic-view 已加载（2.231.0）');
  }
})();