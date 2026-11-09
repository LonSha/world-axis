/**
 * WorldAxis engines/motive-arbitration.js (v2.247.0) — IN-1 动机竞合
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

    // 读取与应用过往经历与未走之路回声所积累的经验偏置 (WP-5)
    if (person && person.life && person.life.learnings && person.life.learnings.biases) {
      const bMap = person.life.learnings.biases;
      DIMENSIONS.forEach(function (dim) {
        if (typeof bMap[dim] === 'number' && !isNaN(bMap[dim])) {
          effective[dim] = Math.max(0.1, +(effective[dim] + bMap[dim]).toFixed(2));
          dynamicSources.push('echo:' + dim);
        }
      });
    }

    return { weights: effective, base: base, dynamicSources: dynamicSources };
  }

  // v2.302.0 (OPV13-1): 物理生理极限硬熔断检查 (Physiological Hard Lockout)
  function checkPhysiologicalCircuit(person, facts) {
    if (!person) return null;
    const f = facts || {};
    let stamina = (person.resources && person.resources.stamina != null) ? Number(person.resources.stamina) : null;
    // v2.381.0: survival 从未导出 rowOf —— 真源是 read(who)，读口是 read().stamina.value。
    //   此前探测恒 false，于是「动机仲裁前先按生理精力做硬熔断」这条链路
    //   完全拿不到 survival 的精力值，只能依赖调用方自己塞进 person.resources。
    if (stamina == null && WA.survival && typeof WA.survival.read === 'function' && person.id) {
      const sRow = WA.survival.read(person.id);
      if (sRow && sRow.ok && sRow.stamina && typeof sRow.stamina.value === 'number') {
        stamina = Number(sRow.stamina.value);
      }
    }
    const stress = (person.stress != null) ? Number(person.stress) : ((f.stress != null) ? Number(f.stress) : 0);
    const trauma = (person.trauma != null) ? Number(person.trauma) : ((f.trauma != null) ? Number(f.trauma) : 0);
    const bloodLoss = (f.heavyBloodLoss || f.exsanguination || (person.resources && person.resources.bloodLoss > 50));

    // 1. 体力彻底归零或极端失血 -> 昏厥崩解 (collapse / faint)
    if ((stamina != null && stamina <= 0) || bloodLoss) {
      return {
        lockout: true,
        type: 'collapse',
        action: 'faint',
        reason: bloodLoss ? '重度失血导致休克昏迷' : '体力枯竭导致生理性昏厥',
        scar: 'physiological_exhaustion_scar'
      };
    }
    // 2. 压力/创伤超载极限 (stress >= 95 或 trauma >= 90) -> 惊恐失语/应激僵直 (mute_panic)
    if (stress >= 95 || trauma >= 90) {
      return {
        lockout: true,
        type: 'mute_panic',
        action: 'freeze',
        reason: '急性应激心理创伤突破耐受极限，陷入失语僵直',
        scar: 'acute_stress_trauma'
      };
    }
    return null;
  }

  function evaluate(person, candidates, facts) {
    const circuit = checkPhysiologicalCircuit(person, facts);
    if (circuit && circuit.lockout) {
      const lockoutAction = {
        id: 'lockout_' + circuit.type,
        title: '生理硬熔断：' + (circuit.action === 'faint' ? '昏厥休克' : '惊恐僵直'),
        kind: 'involuntary_physiological_reaction',
        score: 9999,
        hardLockout: true,
        circuit: circuit,
        benefit: 0,
        penalty: 0,
        commitmentPenalty: 0,
        realityPenalty: 0,
        sycophancyPenalty: 0,
        factsRef: [],
        invalidFacts: [],
        rawCandidate: {
          id: 'lockout_' + circuit.type,
          title: '生理硬熔断：' + circuit.reason,
          kind: 'involuntary_reaction',
          hardLockout: true
        }
      };
      return {
        ok: true,
        hardLockout: true,
        circuit: circuit,
        selected: lockoutAction,
        decision: 'hard_lockout',
        forsaken: (candidates || []).map(function (c) {
          return {
            id: c.id || c.name || 'cand',
            title: c.title || c.label || 'cand',
            score: 0,
            reason: 'intercepted-by-physiological-circuit-breaker',
            circuit: circuit.type
          };
        }),
        rationale: {
          primaryMotive: 'physiological_survival',
          activeFacts: ['hard_lockout:' + circuit.type],
          verifiedFacts: [],
          hasFabrication: false,
          invalidFacts: [],
          summary: '【生理硬熔断】' + circuit.reason + '，所有主动意图被物理级强制阻断。'
        },
        weightsUsed: { livelihood: 0, commitment: 0, ambition: 0, rest: 99, safety: 99 }
      };
    }

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

      // v2.247.0 (NPC-GRAVITY): 现实重力与 NPC 解绑 user 协议 (反谄媚与反悬浮)
      // ① 现实重力阻尼 (gravity): 若行动要求超出角色的阶层/财力/精力底线，施加重力惩罚
      let realityPenalty = 0;
      if (c.requiresResource && person && person.resources) {
        Object.keys(c.requiresResource).forEach(function (rKey) {
          const req = Number(c.requiresResource[rKey]) || 0;
          const avail = Number(person.resources[rKey]) || 0;
          if (req > avail) {
            realityPenalty += (req - avail) * 3.5;
          }
        });
      }
      // ② 解绑 user 协议 (anti-sycophancy): 若行动纯粹迎合玩家但严重违背角色核心底线与自主生计
      let sycophancyPenalty = 0;
      if (c.target === 'user' || c.forUser) {
        const selfLoss = (Number(cost.livelihood) || 0) + (Number(cost.safety) || 0);
        if (selfLoss > 2.0 && (!person || !person.bonds || !person.bonds.deepAffection)) {
          // 未建立深层羁绊时强行牺牲自身生存迎合玩家，重度惩罚
          sycophancyPenalty += selfLoss * 2.5;
        }
      }

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

      const totalScore = Math.round((benefit - penalty - commitmentPenalty - realityPenalty - sycophancyPenalty) * 100) / 100;

      return {
        id: id,
        title: title,
        kind: kind,
        score: totalScore,
        benefit: Math.round(benefit * 100) / 100,
        penalty: Math.round(penalty * 100) / 100,
        commitmentPenalty: Math.round(commitmentPenalty * 100) / 100,
        realityPenalty: Math.round(realityPenalty * 100) / 100,
        sycophancyPenalty: Math.round(sycophancyPenalty * 100) / 100,
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

  // Integration read path: detached inputs/outputs; never commit promises or scars.
  function preview(person, candidates, facts) {
    const clone = function (v) { return v == null ? v : JSON.parse(JSON.stringify(v)); };
    try {
      const result = evaluate(clone(person), clone(candidates), clone(facts));
      return Object.assign({}, clone(result), {status:'candidate', applied:false});
    } catch (e) {
      return {ok:false, reason:'invalid-arbitration-input', status:'candidate', applied:false};
    }
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
        at: WA.clock.now('motive')
      };

      // 生理硬熔断沉淀持久伤痕与虚弱回声 (OPV13-1)
      if (evalRes.hardLockout && evalRes.circuit && evalRes.circuit.scar) {
        person.life.physiologicalScars = Array.isArray(person.life.physiologicalScars) ? person.life.physiologicalScars : [];
        if (person.life.physiologicalScars.indexOf(evalRes.circuit.scar) < 0) {
          person.life.physiologicalScars.push(evalRes.circuit.scar);
        }
        person.life.debilityEcho = {
          scar: evalRes.circuit.scar,
          active: true,
          reason: evalRes.circuit.reason,
          at: WA.clock.now('motive')
        };
      }

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
    preview: preview,
    decide: decide
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/motive-arbitration 已加载（2.247.0）');
  }
})();
