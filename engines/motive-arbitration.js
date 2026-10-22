/**
 * WorldAxis engines/motive-arbitration.js (v2.231.0) — IN-1 动机竞合
 *
 * 核心职责：
 *   NPC 不再机械执行动作列表的第一项。
 *   在 life / agency 决策之前，提供有限候选的动机权衡（生计、承诺、抱负、恢复、安全）。
 *   底色给人格偏好，动态经历（资金短缺、承诺临期、重度疲劳、威胁）影响实时权重。
 *   保留选择理由与被放弃事项（forsaken），禁止编造未读到的虚假事实。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const DIMENSIONS = ['livelihood', 'commitment', 'ambition', 'rest', 'safety'];

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : '');
  }

  function getBaseWeights(person) {
    const w = { livelihood: 1.0, commitment: 1.0, ambition: 1.0, rest: 1.0, safety: 1.0 };
    if (!person) return w;

    // 检查 temperament 或 profile
    let traits = [];
    if (person.profile && Array.isArray(person.profile.traits)) {
      traits = traits.concat(person.profile.traits);
    }
    if (person.temperament) {
      if (typeof person.temperament === 'string') traits.push(person.temperament);
      if (person.temperament.base) traits.push(person.temperament.base);
      if (person.temperament.habit) traits.push(person.temperament.habit);
    }
    if (WA.temperament && typeof WA.temperament.read === 'function' && person.id) {
      try {
        const tr = WA.temperament.read(person.id);
        if (tr && tr.active) traits.push(tr.active);
      } catch (e) {}
    }

    const tStr = traits.join(' ').toLowerCase();
    if (/dutiful|loyal|honorable|守约|重诺|忠诚/.test(tStr)) w.commitment += 1.5;
    if (/ambitious|curious|craftsman|进取|好奇|工匠|精进/.test(tStr)) w.ambition += 1.5;
    if (/cautious|timid|careful|谨慎|胆小|稳重/.test(tStr)) w.safety += 1.5;
    if (/pragmatic|poor|frugal|务实|贫困|简朴/.test(tStr)) w.livelihood += 1.5;
    if (/slothful|weary|tired|倦怠|安逸/.test(tStr)) w.rest += 1.5;

    return w;
  }

  function getEffectiveWeights(person, facts) {
    const base = getBaseWeights(person);
    const f = facts || {};
    const effective = Object.assign({}, base);
    const dynamicSources = [];

    // 动态经历与紧迫状态加权
    if (f.lowFunds || f.moneyShortage || f.poverty || f.livelihoodCrisis) {
      effective.livelihood += 4.5;
      dynamicSources.push('lowFunds');
    }
    if (f.commitmentUrgent || f.deadlineSoon || f.promiseUrgent) {
      effective.commitment += 4.5;
      dynamicSources.push('commitmentUrgent');
    }
    if (f.exhausted || f.fatigueHigh || f.weary) {
      effective.rest += 5.0;
      dynamicSources.push('exhausted');
    }
    if (f.danger || f.highRisk || f.threat) {
      effective.safety += 4.5;
      dynamicSources.push('danger');
    }

    return { weights: effective, base: base, dynamicSources: dynamicSources };
  }

  function evaluate(person, candidates, facts) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { ok: false, reason: 'empty-candidates', selected: null, forsaken: [] };
    }

    const f = facts || {};
    const weightCalc = getEffectiveWeights(person, f);
    const w = weightCalc.weights;

    // 评分并校验事实引用
    const scored = candidates.map(function (c) {
      const id = clean(c.id || c.name || 'cand', 40);
      const title = clean(c.title || c.label || id, 60);
      const kind = clean(c.kind || 'activity', 30);
      const payoff = c.payoff || {};
      const cost = c.cost || {};
      const impact = c.commitmentImpact || null;
      const factsRef = Array.isArray(c.factsRef) ? c.factsRef : [];

      // 验证引用的事实：确保不编造未存在的事实
      const invalidFacts = factsRef.filter(function (ref) {
        return f[ref] === undefined && !(person && person[ref] !== undefined);
      });

      let benefit = 0;
      let penalty = 0;
      DIMENSIONS.forEach(function (dim) {
        const pVal = Number(payoff[dim]) || 0;
        const cVal = Number(cost[dim]) || 0;
        benefit += pVal * (w[dim] || 1.0);
        penalty += cVal * (w[dim] || 1.0);
      });

      // 承诺影响惩罚/激励
      let commitmentPenalty = 0;
      if (impact) {
        if (impact.effect === 'break') {
          // 背弃承诺受重度惩罚
          commitmentPenalty = (w.commitment || 1.0) * 5.0;
        } else if (impact.effect === 'delay' || impact.effect === 'substitute') {
          // 延期或协商替代受中度惩罚
          commitmentPenalty = (w.commitment || 1.0) * 2.0;
        } else if (impact.effect === 'fulfill') {
          benefit += (w.commitment || 1.0) * 2.0;
        }
      }

      const totalScore = Math.round((benefit - penalty - commitmentPenalty) * 100) / 100;

      return {
        id: id,
        title: title,
        kind: kind,
        score: totalScore,
        benefit: Math.round(benefit * 100) / 100,
        penalty: Math.round(penalty * 100) / 100,
        commitmentPenalty: Math.round(commitmentPenalty * 100) / 100,
        commitmentImpact: impact,
        factsRef: factsRef,
        invalidFacts: invalidFacts,
        rawCandidate: c
      };
    });

    // 稳定排序：得分高在前；同分按 id 字母序，绝不随机抖动
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.id.localeCompare(b.id);
    });

    const best = scored[0];
    const forsaken = scored.slice(1).map(function (cand) {
      let reason = 'lower-score';
      if (weightCalc.dynamicSources.indexOf('exhausted') >= 0 && cand.rawCandidate.cost && cand.rawCandidate.cost.rest > 0) {
        reason = 'deferred-due-to-exhaustion';
      } else if (weightCalc.dynamicSources.indexOf('lowFunds') >= 0 && (!cand.rawCandidate.payoff || !cand.rawCandidate.payoff.livelihood)) {
        reason = 'deferred-due-to-livelihood-crisis';
      } else if (weightCalc.dynamicSources.indexOf('commitmentUrgent') >= 0 && (!cand.commitmentImpact || cand.commitmentImpact.effect !== 'fulfill')) {
        reason = 'deferred-due-to-commitment-urgency';
      }
      return {
        id: cand.id,
        title: cand.title,
        score: cand.score,
        reason: reason,
        commitmentImpact: cand.commitmentImpact
      };
    });

    // 确定决策类型与主要驱动力
    let decision = 'accept';
    if (best.commitmentImpact) {
      if (best.commitmentImpact.effect === 'delay') decision = 'defer';
      else if (best.commitmentImpact.effect === 'substitute') decision = 'substitute';
      else if (best.commitmentImpact.effect === 'break') decision = 'reject';
    }

    // 查出最关键的正向驱动维度
    let maxWeightedDim = 'livelihood';
    let maxWeightedVal = -1;
    DIMENSIONS.forEach(function (dim) {
      const p = (Number(best.rawCandidate.payoff && best.rawCandidate.payoff[dim]) || 0) * (w[dim] || 1.0);
      if (p > maxWeightedVal) {
        maxWeightedVal = p;
        maxWeightedDim = dim;
      }
    });

    const rationale = {
      primaryMotive: maxWeightedDim,
      activeFacts: weightCalc.dynamicSources,
      verifiedFacts: best.factsRef.filter(function (ref) { return best.invalidFacts.indexOf(ref) < 0; }),
      hasFabrication: best.invalidFacts.length > 0,
      invalidFacts: best.invalidFacts,
      summary: '因' + (weightCalc.dynamicSources.length ? weightCalc.dynamicSources.join('与') : '固有偏好') + '驱动，选择「' + best.title + '」'
    };

    return {
      ok: true,
      selected: best,
      decision: decision,
      forsaken: forsaken,
      rationale: rationale,
      weightsUsed: w
    };
  }

  function decide(person, candidates, facts) {
    const evalRes = evaluate(person, candidates, facts);
    if (!evalRes.ok) return evalRes;

    // 记录到人物 life 状态中（若存在）
    if (person && person.life) {
      person.life.lastArbitration = {
        selectedId: evalRes.selected.id,
        decision: evalRes.decision,
        rationale: evalRes.rationale,
        forsakenCount: evalRes.forsaken.length,
        at: (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('motive') : Date.now()
      };

      // 若有承诺受到影响且承诺列表存在，更新承诺状态
      if (evalRes.selected.commitmentImpact && Array.isArray(person.life.commitments)) {
        const impact = evalRes.selected.commitmentImpact;
        const cmt = person.life.commitments.filter(function (c) { return c && c.id === impact.id; })[0];
        if (cmt) {
          if (impact.effect === 'delay') {
            cmt.status = 'deferred';
            cmt.deferReason = evalRes.rationale.summary;
          } else if (impact.effect === 'break') {
            cmt.status = 'broken';
            cmt.breakReason = evalRes.rationale.summary;
          }
        }
      }
    }

    return evalRes;
  }

  WA.motiveArbitration = {
    DIMENSIONS: DIMENSIONS,
    getBaseWeights: getBaseWeights,
    getEffectiveWeights: getEffectiveWeights,
    evaluate: evaluate,
    decide: decide
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/motive-arbitration 已加载（2.231.0）');
  }
})();
