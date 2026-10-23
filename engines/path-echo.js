/**
 * WorldAxis engines/path-echo.js (v2.231.0) — IN-2 未走之路的回声（有限预期与经验修正）
 *
 * 核心职责：
 *   关键决定保存“当时认为会怎样”，并记录一到两个当时可行但未选的选项（未走之路）。
 *   事后将真实已知结果与预期比较，形成有限的遗憾（regret）、庆幸（relief）或信心修正。
 *   反事实只在可比范围估计，不可比的显示 unknown，绝不盲目断言“本来一定成功”。
 *   角色想象和预期仅保留在角色自身局部经历中，绝不写入地图、库存或他人的记忆。
 *   未合法收到消息的人绝不产生虚假遗憾。
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

  function getPerson(pId) {
    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const id = personId(pId);
    return (s.people && s.people[id]) ? s.people[id] : null;
  }

  function ensureEchoes(person) {
    if (!person.life) person.life = {};
    if (!Array.isArray(person.life.pathEchoes)) person.life.pathEchoes = [];
    if (!person.life.learnings) person.life.learnings = { biases: {}, history: [] };
    return person.life;
  }

  /**
   * 保存决策时的有限预期与未选备选项
   */
  function recordExpectation(pId, decision, alternatives, localFacts) {
    const p = getPerson(pId);
    if (!p) return { ok: false, reason: 'person-not-found' };

    const life = ensureEchoes(p);
    const dId = clean(decision.id || ('dec_' + WA.clock.now('pathEcho')), 40);

    // 限制最多记录 2 个备选项
    const alts = (Array.isArray(alternatives) ? alternatives.slice(0, 2) : []).map(function (a) {
      return {
        id: clean(a.id || 'alt', 40),
        title: clean(a.title || a.id, 60),
        kind: clean(a.kind || 'activity', 30),
        assumedOutcome: a.assumedOutcome || 'unknown' // 未走之路默认不可全知
      };
    });

    const record = {
      decisionId: dId,
      chosen: {
        id: clean(decision.selectedId || decision.id, 40),
        title: clean(decision.title || decision.selectedId, 60),
        kind: clean(decision.kind || 'activity', 30),
        expectedPayoff: decision.expectedPayoff || decision.payoff || {},
        expectedCost: decision.expectedCost || decision.cost || {}
      },
      alternatives: alts,
      localFactsSnapshot: Object.assign({}, localFacts || {}),
      status: 'pending_realization',
      registeredAt: WA.clock.now('pathEcho'),
      realization: null
    };

    // 限制历史最多 8 条，环形挤压
    if (life.pathEchoes.length >= 8) life.pathEchoes.shift();
    life.pathEchoes.push(record);

    return { ok: true, decisionId: dId, record: record };
  }

  /**
   * 事后将真实已知结果与预期比较
   */
  function realizeOutcome(pId, decisionId, actualOutcome, actualKnownFacts) {
    const p = getPerson(pId);
    if (!p) return { ok: false, reason: 'person-not-found' };

    const life = ensureEchoes(p);
    const record = life.pathEchoes.filter(function (r) { return r.decisionId === decisionId; })[0];
    if (!record) return { ok: false, reason: 'record-not-found' };

    const known = actualKnownFacts || {};
    const actual = actualOutcome || {};

    // 检查角色是否真的知晓结果：未收到相关消息或未在场，不产生凭空认知
    const isAware = actual.wasWitnessed || (actual.notifiedBy && known[actual.notifiedBy]) || known[record.chosen.id] || known[decisionId];
    if (!isAware && !actual.directExperience) {
      return {
        ok: true,
        realized: false,
        reason: 'unaware-of-outcome',
        note: '角色并未获知该事实际后果，不产生任何预期修正或遗憾'
      };
    }

    // 比较实际与预期
    const expPayoff = record.chosen.expectedPayoff || {};
    const actPayoff = actual.payoff || {};
    const expCost = record.chosen.expectedCost || {};
    const actCost = actual.cost || {};

    let payoffShortfall = 0;
    let costExcess = 0;
    Object.keys(expPayoff).forEach(function (k) {
      const diff = (Number(expPayoff[k]) || 0) - (Number(actPayoff[k]) || 0);
      if (diff > 0) payoffShortfall += diff;
    });
    Object.keys(actCost).forEach(function (k) {
      const diff = (Number(actCost[k]) || 0) - (Number(expCost[k]) || 0);
      if (diff > 0) costExcess += diff;
    });

    let sentiment = 'neutral';
    let revisedBias = {};
    let learningNote = '';

    // 判断未选备选项的反事实结果：不可测则保持 unknown
    const evaluatedAlts = record.alternatives.map(function (alt) {
      // 只有在世界事实显式提供了此备选项的客观情报（且角色已获知）时，才可比较
      const altFact = known['alt_truth_' + alt.id];
      if (altFact && altFact.certainty === 'proven') {
        return {
          id: alt.id,
          title: alt.title,
          counterfactual: altFact.betterThanChosen ? 'missed-opportunity' : 'inferior',
          proof: altFact.summary
        };
      }
      return {
        id: alt.id,
        title: alt.title,
        counterfactual: 'unknown',
        proof: '当时未走此路，实际发展不可断言'
      };
    });

    const hasMissedBetter = evaluatedAlts.some(function (a) { return a.counterfactual === 'missed-opportunity'; });

    if (payoffShortfall > 0 || costExcess > 0) {
      if (hasMissedBetter) {
        sentiment = 'regret';
        learningNote = '得知错失良机且当前选择受挫，对「' + record.chosen.title + '」类行动产生警惕';
        revisedBias[record.chosen.kind] = -1.5;
        revisedBias['commitment'] = 1.0;
      } else {
        sentiment = 'resignation';
        learningNote = '虽然未达预期，但未选备选项亦无确凿更优证据，认同当时选择';
      }
    } else {
      sentiment = 'relief';
      learningNote = '实际结果符合或超越预期，增强对「' + record.chosen.title + '」的决策信心';
      revisedBias[record.chosen.kind] = 1.0;
    }

    const realization = {
      realizedAt: WA.clock.now('pathEcho'),
      sentiment: sentiment,
      payoffShortfall: payoffShortfall,
      costExcess: costExcess,
      alternativesEvaluation: evaluatedAlts,
      learningNote: learningNote,
      revisedBias: revisedBias
    };

    record.status = 'realized';
    record.realization = realization;

    // 积累到角色的学习偏好中
    Object.keys(revisedBias).forEach(function (k) {
      life.learnings.biases[k] = (life.learnings.biases[k] || 0) + revisedBias[k];
    });
    life.learnings.history.push({
      decisionId: decisionId,
      sentiment: sentiment,
      note: learningNote,
      at: realization.realizedAt
    });

    return {
      ok: true,
      realized: true,
      decisionId: decisionId,
      sentiment: sentiment,
      realization: realization
    };
  }

  function getLearnings(pId) {
    const p = getPerson(pId);
    if (!p || !p.life || !p.life.learnings) return { biases: {}, history: [] };
    return p.life.learnings;
  }

  function clear(pId) {
    const p = getPerson(pId);
    if (p && p.life) {
      p.life.pathEchoes = [];
      p.life.learnings = { biases: {}, history: [] };
    }
    return { ok: true };
  }

  WA.pathEcho = {
    recordExpectation: recordExpectation,
    realizeOutcome: realizeOutcome,
    getLearnings: getLearnings,
    clear: clear
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/path-echo 已加载（2.231.0）');
  }
})();