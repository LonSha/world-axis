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
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
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
      const helperName = clean(o.helperName, 60);
      if (helperName) {
        const hId = personId(helperName);
        const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
        const hp = (s.people && s.people[hId]) ? s.people[hId] : null;
        if (hp) {
          if (hp.status === 'traveling' || hp.status === 'on_the_road') {
            return { ok: false, reason: 'helper-traveling', helper: helperName };
          }
          if (WA.laborSchedule && typeof WA.laborSchedule.isBooked === 'function') {
            const shift = clean(o.shift || 'day', 20);
            if (WA.laborSchedule.isBooked(helperName, shift)) {
              return { ok: false, reason: 'helper-schedule-conflict', helper: helperName, shift: shift };
            }
            WA.laborSchedule.book(helperName, shift, 'hire_help_care', { unitId: uId });
          }
        }
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
      const substituteName = clean(o.substituteName || o.substitute, 60);
      if (!substituteName) return { ok: false, reason: 'missing-substitute' };
      const subId = personId(substituteName);
      const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
      const subp = (s.people && (s.people[subId] || s.people[substituteName])) ? (s.people[subId] || s.people[substituteName]) : null;
      if (subp) {
        if (subp.status === 'traveling' || subp.status === 'on_the_road') {
          return { ok: false, reason: 'substitute-traveling', substitute: substituteName };
        }
      }
      let booked = false;
      if (WA.laborSchedule && typeof WA.laborSchedule.claim === 'function') {
        const slot = clean(o.slot || o.shift || 'morning', 20);
        const day = Number(o.day) || 1;
        const task = clean(o.task || 'care_substitute', 60);
        const cRes = WA.laborSchedule.claim({
          who: substituteName,
          day: day,
          slot: slot,
          task: task,
          kind: 'care_substitute'
        });
        if (!cRes.ok && cRes.reason !== 'disabled') {
          if (cRes.reason === 'person-traveling') {
            return { ok: false, reason: 'substitute-traveling', substitute: substituteName };
          }
          if (cRes.reason === 'slot-conflict') {
            return { ok: false, reason: 'substitute-conflict', substitute: substituteName, slot: slot };
          }
          return cRes;
        }
        if (cRes.ok) booked = true;
      }
      // 登记照护交接
      if (WA.family && typeof WA.family.transferCare === 'function' && o.target) {
        WA.family.transferCare(uId, o.target, substituteName, '代班照料以填补缺口');
      }
      actionTaken = {
        solution: 'substitute',
        cost: 0,
        substitute: substituteName,
        scheduled: booked,
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
    // 预检受益人
    const validShares = [];
    const invalidShares = [];
    shares.forEach(function (sh) {
      const w = clean(sh.who || sh.heir, 60);
      const bId = personId(w);
      if (s.people && s.people[bId]) {
        validShares.push({ who: w, id: bId, ratio: Number(sh.ratio) || 0 });
      } else {
        invalidShares.push({ who: w, ratio: Number(sh.ratio) || 0 });
      }
    });
    const distribution = [];
    const allocatedMap = {};
    let allocatedTotal = 0;
    let retainedRemaining = 0;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (stateObj) {
        const dp = stateObj.people[decId];
        dp.resources = dp.resources || {};
        validShares.forEach(function (sh, idx) {
          const bp = stateObj.people[sh.id];
          if (!bp) return;
          bp.resources = bp.resources || {};
          let amt = 0;
          if (idx === validShares.length - 1 && invalidShares.length === 0) {
            amt = decRes - allocatedTotal;
          } else {
            amt = Math.floor(decRes * sh.ratio);
          }
          allocatedTotal += amt;
          bp.resources[mKey] = (Number(bp.resources[mKey]) || 0) + amt;
          distribution.push({ who: sh.who, ratio: sh.ratio, amount: amt });
          allocatedMap[sh.who] = amt;
        });
        retainedRemaining = decRes - allocatedTotal;
        dp.resources[mKey] = retainedRemaining;
        return true;
      }, 'familyOps:inheritRatio');
    }
    return {
      ok: true,
      deceased: deceasedName,
      material: mKey,
      totalEstate: decRes,
      allocatedTotal: allocatedTotal,
      unallocatedRemaining: retainedRemaining,
      invalidRecipients: invalidShares,
      distribution: distribution,
      allocated: allocatedMap,
      conserved: invalidShares.length > 0 ? ((allocatedTotal + retainedRemaining) === decRes) : (allocatedTotal === decRes),
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

  /**
   * 共同体周期推进与履约结算（WP-6）
   * 真实扣减当期周期支出，产生赤字缺口时记录，推进共同目标进度
   */
  function advanceCycle(unitId, opts) {
    const unit = getFamilyUnit(unitId);
    if (!unit) return { ok: false, reason: 'unit-not-found' };
    const uId = clean(unitId, 40);
    const o = opts || {};
    const ops = ensureOpsStore();
    const budget = ops.budgets[uId] || { periodicExpense: 0, sharedGoals: [] };
    const mKey = getMoneyKey(unit, o);
    const curTreasury = (unit.treasury && Number(unit.treasury[mKey])) || 0;
    const expense = Math.max(0, Number(budget.periodicExpense) || 0);

    let deficit = 0;
    let actualPaid = 0;
    let updatedTreasury = curTreasury;

    if (curTreasury < expense) {
      deficit = expense - curTreasury;
      actualPaid = curTreasury;
      updatedTreasury = 0;
    } else {
      actualPaid = expense;
      updatedTreasury = curTreasury - expense;
    }

    const goalsProgressed = [];
    const laborContribution = Number(o.laborDays) || 0;
    const fundContribution = Number(o.fundsContributed) || 0;
    const fundContributions = (o.fundContributions && typeof o.fundContributions === 'object') ? o.fundContributions : {};
    const laborContributions = (o.laborContributions && typeof o.laborContributions === 'object') ? o.laborContributions : {};

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        const u = getFamilyUnit(uId, draft);
        if (u) {
          u.treasury = u.treasury || {};
          u.treasury[mKey] = updatedTreasury;
          u.cycleIndex = (Number(u.cycleIndex) || 0) + 1;
          u.history = u.history || [];
          u.history.push({
            type: 'cycle_settle',
            cycle: u.cycleIndex,
            expense: expense,
            paid: actualPaid,
            deficit: deficit,
            at: clockNow('familyOps')
          });
        }
        const b = draft.familyOps && draft.familyOps.budgets && draft.familyOps.budgets[uId];
        if (b) {
          b.accumulatedDeficit = (Number(b.accumulatedDeficit) || 0) + deficit;
          if (Array.isArray(b.sharedGoals)) {
            b.sharedGoals.forEach(function (g) {
              if (g.status === 'active') {
                const gFund = (fundContributions[g.id] != null) ? Number(fundContributions[g.id]) : fundContribution;
                const gLabor = (laborContributions[g.id] != null) ? Number(laborContributions[g.id]) : laborContribution;
                g.currentProgress = (Number(g.currentProgress) || 0) + gLabor * 10 + gFund * 2;
                g.targetProgress = Number(g.targetProgress) || 100;
                if (g.currentProgress >= g.targetProgress) {
                  g.status = 'completed';
                  g.completedAt = clockNow('familyOps:cycle');
                }
                goalsProgressed.push({
                  id: g.id,
                  progress: g.currentProgress,
                  funds: gFund,
                  laborDays: gLabor,
                  status: g.status
                });
              }
            });
          }
        }
        return true;
      }, 'familyOps:advanceCycle');
    }

    return {
      ok: true,
      unitId: uId,
      cycle: (unit.cycleIndex || 0) + 1,
      expense: expense,
      paid: actualPaid,
      deficit: deficit,
      treasuryLeft: updatedTreasury,
      hasDeficit: deficit > 0,
      goals: goalsProgressed,
      note: deficit > 0 ? ('金库出现缺口 ' + deficit + '，需要协商减支或补贴') : '周期费用正常结清'
    };
  }

  WA.familyOps = {
    setBudget: setBudget,
    handleGap: handleGap,
    inheritRatio: inheritRatio,
    retireMember: retireMember,
    advanceCycle: advanceCycle
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/family-ops 已加载（2.231.0）');
  }
})();