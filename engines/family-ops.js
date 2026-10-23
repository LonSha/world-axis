/**
 * WorldAxis engines/family-ops.js (v2.231.0) — OP-5 共同生活经营
 *
 * 核心职责：
 *   让共同生活单位运转起来：周期预算、照护轮值、成员外出缺口处置与自定义继承。
 *   支持合伙、租住、船员、家庭等共同体。
 *   缺口应对至少两条真解法：雇工（花钱保时间）vs 代班（花时间省钱）vs 延期目标。
 *   具名比例资产守恒继承，零凭空造钱，不继承私人记忆与能力。
 *   退出成员后旧责任承诺有明确处置记录。
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

  function getMoneyKey(unit, opts) {
    if (opts && opts.material) return clean(opts.material, 40);
    if (unit && unit.treasury) {
      const keys = Object.keys(unit.treasury);
      if (keys.length > 0 && Number(unit.treasury[keys[0]]) > 0) return keys[0];
    }
    return (WA.economy && typeof WA.economy.money === 'function') ? WA.economy.money() : 'funds';
  }

  function getPersonMoneyKey(person, opts) {
    if (opts && opts.material) return clean(opts.material, 40);
    if (person && person.resources) {
      const keys = Object.keys(person.resources);
      if (keys.length > 0 && Number(person.resources[keys[0]]) > 0) return keys[0];
    }
    return (WA.economy && typeof WA.economy.money === 'function') ? WA.economy.money() : 'funds';
  }

  function getFamilyUnits(stateObj) {
    const s = stateObj || ((WA.store && WA.store.get) ? (WA.store.get() || {}) : {});
    const f = s.family || {};
    return Array.isArray(f.units) ? f.units : [];
  }

  function getFamilyUnit(unitId, stateObj) {
    const uid = clean(unitId, 40);
    const units = getFamilyUnits(stateObj);
    return units.filter(function (u) { return u && u.id === uid; })[0] || null;
  }

  function ensureOpsStore() {
    let s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    if (!s.familyOps || typeof s.familyOps !== 'object') {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.familyOps = d.familyOps || { budgets: {}, goals: {}, dispositions: {} };
          return true;
        }, 'familyOps:init');
      }
      s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    }
    return s.familyOps || { budgets: {}, goals: {}, dispositions: {} };
  }

  /**
   * 设立周期预算与共同目标
   */
  function setBudget(unitId, plan) {
    const unit = getFamilyUnit(unitId);
    if (!unit) return { ok: false, reason: 'unit-not-found' };

    const p = plan || {};
    const uId = clean(unitId, 40);

    const budget = {
      unitId: uId,
      periodicExpense: Math.max(0, Number(p.periodicExpense) || 0),
      careRoster: Array.isArray(p.careRoster) ? p.careRoster.map(function (c) {
        return { caregiver: clean(c.caregiver, 60), target: clean(c.target, 60), slot: clean(c.slot || 'day', 20) };
      }) : [],
      sharedGoals: Array.isArray(p.sharedGoals) ? p.sharedGoals.map(function (g) {
        return { id: clean(g.id, 40), text: clean(g.text, 80), deadlineDays: Number(g.deadlineDays) || 30, status: 'active' };
      }) : []
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        s.familyOps = s.familyOps || { budgets: {}, goals: {}, dispositions: {} };
        s.familyOps.budgets[uId] = budget;
        return true;
      }, 'familyOps:setBudget');
    }

    return { ok: true, budget: budget };
  }

  /**
   * 处置因成员外出/缺席导致的缺口
   */
  function handleGap(unitId, gapType, solution, opts) {
    const unit = getFamilyUnit(unitId);
    if (!unit) return { ok: false, reason: 'unit-not-found' };

    const o = opts || {};
    const uId = clean(unitId, 40);
    const mKey = getMoneyKey(unit, o);
    const ops = ensureOpsStore();
    const budget = ops.budgets[uId] || { sharedGoals: [] };

    let actionTaken = null;

    if (solution === 'hire_help') {
      const wage = Math.max(1, Number(o.cost) || 10);
      const currentTreasury = (unit.treasury && Number(unit.treasury[mKey])) || 0;
      if (currentTreasury < wage) {
        return { ok: false, reason: 'insufficient-treasury', treasury: currentTreasury, needed: wage };
      }

      if (WA.store && WA.store.transact) {
        WA.store.transact(function (s) {
          const u = getFamilyUnit(uId, s);
          if (u) {
            u.treasury = u.treasury || {};
            u.treasury[mKey] = Math.max(0, (Number(u.treasury[mKey]) || 0) - wage);
            u.history = u.history || [];
            u.history.push({
              type: 'hire_help',
              cost: wage,
              material: mKey,
              helper: clean(o.helperName || '雇工', 40),
              gapType: gapType,
              at: WA.clock.now('familyOps')
            });
          }
          return true;
        }, 'familyOps:hireHelp');
      }

      actionTaken = {
        solution: 'hire_help',
        cost: wage,
        material: mKey,
        scheduleImpact: 'none',
        treasuryLeft: currentTreasury - wage
      };
    } else if (solution === 'substitute') {
      const substituteName = clean(o.substituteName, 60);
      if (!substituteName) return { ok: false, reason: 'missing-substitute' };

      // 登记照护交接
      if (WA.family && typeof WA.family.transferCare === 'function' && o.target) {
        WA.family.transferCare(uId, o.target, substituteName, '代班照料以填补缺口');
      }

      actionTaken = {
        solution: 'substitute',
        cost: 0,
        substitute: substituteName,
        scheduleImpact: 'care-assigned-to-' + substituteName
      };
    } else if (solution === 'defer_goal') {
      const goalId = clean(o.goalId, 40);
      let deferred = false;

      if (WA.store && WA.store.transact) {
        WA.store.transact(function (s) {
          const b = s.familyOps && s.familyOps.budgets && s.familyOps.budgets[uId];
          if (b && Array.isArray(b.sharedGoals)) {
            const g = b.sharedGoals.filter(function (x) { return x.id === goalId; })[0];
            if (g) {
              g.status = 'deferred';
              g.deadlineDays += Number(o.delayDays) || 30;
              deferred = true;
            }
          }
          return true;
        }, 'familyOps:deferGoal');
      }

      actionTaken = {
        solution: 'defer_goal',
        cost: 0,
        goalId: goalId,
        deferred: deferred,
        scheduleImpact: 'none'
      };
    } else {
      return { ok: false, reason: 'unknown-solution' };
    }

    return {
      ok: true,
      unitId: uId,
      gapType: gapType,
      action: actionTaken
    };
  }

  /**
   * 具名比例遗产分配（严格守恒，无私密记忆继承）
   */
  function inheritRatio(unitId, deceasedName, shares, opts) {
    const unit = getFamilyUnit(unitId);
    if (!unit) return { ok: false, reason: 'unit-not-found' };

    const decId = personId(deceasedName);
    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const decPerson = (s.people && s.people[decId]) ? s.people[decId] : null;
    if (!decPerson) return { ok: false, reason: 'deceased-not-found' };

    const o = opts || {};
    const mKey = getPersonMoneyKey(decPerson, o);
    const decRes = (decPerson.resources && Number(decPerson.resources[mKey])) || 0;
    if (decRes <= 0) return { ok: false, reason: 'no-estate-to-inherit' };

    if (!Array.isArray(shares) || shares.length === 0) {
      return { ok: false, reason: 'empty-shares' };
    }

    let totalRatio = shares.reduce(function (sum, item) { return sum + (Number(item.ratio) || 0); }, 0);
    if (Math.abs(totalRatio - 1.0) > 0.01) {
      return { ok: false, reason: 'invalid-ratio-sum', sum: totalRatio };
    }

    const distribution = [];
    let allocatedTotal = 0;

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (stateObj) {
        const dp = stateObj.people[decId];
        dp.resources = dp.resources || {};
        dp.resources[mKey] = 0; // 扣减到 0

        shares.forEach(function (sh, idx) {
          const bId = personId(sh.who);
          const bp = stateObj.people[bId];
          if (!bp) return;

          bp.resources = bp.resources || {};
          let amt = 0;
          if (idx === shares.length - 1) {
            amt = decRes - allocatedTotal;
          } else {
            amt = Math.floor(decRes * sh.ratio);
          }
          allocatedTotal += amt;
          bp.resources[mKey] = (Number(bp.resources[mKey]) || 0) + amt;

          distribution.push({ who: sh.who, ratio: sh.ratio, amount: amt });
        });
        return true;
      }, 'familyOps:inheritRatio');
    }

    return {
      ok: true,
      deceased: deceasedName,
      material: mKey,
      totalEstate: decRes,
      allocatedTotal: allocatedTotal,
      distribution: distribution,
      conserved: allocatedTotal === decRes,
      noMemoryTransferred: true
    };
  }

  /**
   * 退出共同体并明确处置承诺
   */
  function retireMember(unitId, whoName, disposition) {
    const unit = getFamilyUnit(unitId);
    if (!unit) return { ok: false, reason: 'unit-not-found' };

    const wId = personId(whoName);
    const disp = disposition || 'settled';

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        const u = getFamilyUnit(unitId, s);
        if (u && Array.isArray(u.members)) {
          u.members = u.members.filter(function (m) { return personId(m.who || m.name) !== wId; });
        }
        s.familyOps = s.familyOps || { budgets: {}, goals: {}, dispositions: {} };
        s.familyOps.dispositions[clean(unitId, 40) + ':' + wId] = {
          retiredMember: whoName,
          disposition: disp,
          disposedAt: WA.clock.now('familyOps')
        };
        return true;
      }, 'familyOps:retireMember');
    }

    return {
      ok: true,
      unitId: unitId,
      retired: whoName,
      disposition: disp
    };
  }

  WA.familyOps = {
    setBudget: setBudget,
    handleGap: handleGap,
    inheritRatio: inheritRatio,
    retireMember: retireMember
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/family-ops 已加载（2.231.0）');
  }
})();