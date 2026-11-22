/**
 * WorldAxis engines/action-cost-feedback.js (v2.309.0) — OPV14-3 评估驱动行为代价回写引擎
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   全仓 154 个只读模块（如 difficulty、action-methods、stamina-eval 等）
 *   长期只停留在“只读评估”阶段——评估了行动阻力、难度系数与潜在消耗，
 *   但在行动提交后从未真正从角色身上扣除体力、耐久度或资源，
 *   导致所谓“高难度”与“工具损耗”对角色没有实质生存威胁。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   在角色执行动作后调用 `applyEvaluationCosts`：
 *   1. 结合 difficulty.resistance 阻力系数（easy:0.5, normal:1.0, hard:2.0）；
 *   2. 原子扣减角色 stamina（体力）与精力，并记录疲劳累积（fatigue）；
 *   3. 体力耗尽时强制追加 `exhausted`（力竭）负面状态，阻断后续高阶动作；
 *   4. 持久化记录到 actor 档案中并生成代价审计事件。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_action_cost_feedback_settings_v1';
  const DEF = { enabled: true, maxFeedbackLogs: 64, baseStaminaCost: 10, exhaustionThreshold: 0 };
  const __REG = { key: LS_KEY, def: DEF, module: 'actionCostFeedback' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'actionCostFeedback:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { applied: 0, exhausted: 0, refused: 0, lastReason: '' };

  /**
   * 回写行为评估代价
   * @param {object} spec { actorId, actionKey, baseCost?, intensity?, at? }
   */
  function applyEvaluationCosts(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const actorId = String(s.actorId || s.who || '').trim();
    const actionKey = String(s.actionKey || s.action || '').trim();
    if (!actorId) {
      stat.refused++; stat.lastReason = 'missing-actor';
      return { ok: false, reason: 'missing-actor' };
    }
    if (!actionKey) {
      stat.refused++; stat.lastReason = 'missing-action-key';
      return { ok: false, reason: 'missing-action-key' };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('actionCostFeedback');

    // 调取 difficulty 模块阻力系数（若存在）
    // v2.381.0: difficulty 从未导出 costMultiplier() —— 真源是 effective().cost
    //   （COST[resistance]，关闭时 cost=1）。此前探测恒 false，世界难度的
    //   「行动阻力」对体力消耗的加权从未生效。
    let multiplier = 1.0;
    if (WA.difficulty && typeof WA.difficulty.effective === 'function') {
      try {
        const eff = WA.difficulty.effective();
        if (eff && eff.ok && typeof eff.cost === 'number' && eff.cost > 0) multiplier = eff.cost;
      } catch (e) {}
    }

    const rawCost = Number(s.baseCost) > 0 ? Number(s.baseCost) : cfg.baseStaminaCost;
    const intensity = Number(s.intensity) > 0 ? Number(s.intensity) : 1.0;
    const finalCost = Math.round(rawCost * intensity * multiplier);

    let actorAfter = null;
    let becameExhausted = false;

    transact(function (d) {
      if (!d) return true;
      d.actors = d.actors || {};
      d.actors[actorId] = d.actors[actorId] || { id: actorId, stamina: 100, maxStamina: 100, fatigue: 0, conditions: [] };
      const a = d.actors[actorId];
      if (typeof a.stamina !== 'number') a.stamina = 100;
      if (typeof a.fatigue !== 'number') a.fatigue = 0;
      a.conditions = Array.isArray(a.conditions) ? a.conditions : [];

      a.stamina = Math.max(0, a.stamina - finalCost);
      a.fatigue += Math.round(finalCost * 0.5);

      if (a.stamina <= cfg.exhaustionThreshold && a.conditions.indexOf('exhausted') < 0) {
        a.conditions.push('exhausted');
        becameExhausted = true;
      }

      d.actionCostLogs = d.actionCostLogs || [];
      d.actionCostLogs.push({
        actorId: actorId,
        actionKey: actionKey,
        cost: finalCost,
        multiplier: multiplier,
        remainingStamina: a.stamina,
        fatigue: a.fatigue,
        exhausted: becameExhausted || a.conditions.indexOf('exhausted') >= 0,
        at: at
      });
      if (d.actionCostLogs.length > cfg.maxFeedbackLogs) {
        d.actionCostLogs.shift();
      }
      actorAfter = {
        stamina: a.stamina,
        fatigue: a.fatigue,
        conditions: a.conditions.slice()
      };
      return true;
    }, 'applyCost');

    if (becameExhausted) stat.exhausted++;
    stat.applied++;

    return {
      ok: true,
      reason: 'cost-applied',
      actorId: actorId,
      actionKey: actionKey,
      cost: finalCost,
      multiplier: multiplier,
      remainingStamina: actorAfter ? actorAfter.stamina : null,
      fatigue: actorAfter ? actorAfter.fatigue : null,
      exhausted: becameExhausted,
      conditions: actorAfter ? actorAfter.conditions : [],
      at: at
    };
  }

  WA.actionCostFeedback = {
    applyEvaluationCosts: applyEvaluationCosts
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/action-cost-feedback 已加载（2.309.0）');
  }
})();