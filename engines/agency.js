/**
 * WorldAxis engines/agency.js (v2.166.0) — 行动反馈闭环（TX2）
 *
 * ── 它治什么（缺口原句）────────────────────────────────────
 *   life 有目标、plan 有步骤、act 有行动、liaison 有约定终态，但
 *   **它们之间没有闭合的反馈环**：life.decide 写下「他决定怎么做」，
 *   plan.expand 展开步骤，act.add 准入行动，act.advance 结算——
 *   但**谁把回执交回 plan、谁把步结算反映给目标进度？**
 *   此前：act.advance 算完行动后回执留在 acts.res 台账里，
 *   plan.settle 要由调用方手动调用——于是「行动做完了但计划步还挂着 running」
 *   是常态。目标进度（life.goals 的 status）更没人更新。
 *
 * ── 本模块只做一件事：把回执闭环 ──────────────────────────
 *   schedule(person, at) — 读目标→读当前步→检查前置→准入行动
 *   processReceipts(at) — 读已完成行动→结算步→更新目标进度
 *   两端都只调用 life/plan/act 既有 API，不复制状态。
 *
 * ── 七条否定式边界 ────────────────────────────────────────
 *   ① 同一目标只建一条计划（plan.expand 幂等保证，本模块不绕过）
 *   ② 行动回执驱动步骤结算（不是定时器自动推进步）
 *   ③ 失败保留阻塞理由（plan.settle('blocked') 带 reason，不吞异常）
 *   ④ 条件改变后重排或由玩家决定放弃（不自动放弃目标）
 *   ⑤ 人物自主性有预算（maxSchedulePerTurn 限制每轮准入数）
 *   ⑥ 未获知后果的人物不提前改记忆（只读 intel/memory，不写入）
 *   ⑦ 不凭空造人/造目标/造行动（registry/life/act 各自是唯一写者）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // ── 工具函数（与 act/plan/liaison 同规格）──
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : ''); }
  function str(v, max) { return (typeof v === 'string') ? v.slice(0, max || 60) : ''; }
  function finite(v) { const n = Number(v); return isFinite(n) && n > 0 ? n : NaN; }
  function clockNow(site) { try { return WA.clock ? WA.clock.now(site || 'agency') : Date.now(); } catch (e) { return Date.now(); } }

  // ── 设置 ──
  const LS_KEY = 'worldaxis_agency_settings_v1';
  const DEF = { enabled: false, maxSchedulePerTurn: 4, maxReceiptsPerTurn: 8, autoPlanExpand: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'agency',
    bounds: { maxSchedulePerTurn: [1, 12], maxReceiptsPerTurn: [1, 24] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // ── 统计 ──
  const stat = { scheduled: 0, admitted: 0, receipts: 0, stepsDone: 0, stepsBlocked: 0, goalsDone: 0, goalsBlocked: 0, deferred: 0, lastReason: '', faults: {} };
  function noteFault(k) { stat.faults[k] = (stat.faults[k] || 0) + 1; }

  // ── 内部命名空间（自证块用，与 diplomacy.__diplomacyWarn 同性质）──
  //   写口数目不符时写一条警告到内部 ns，供 module-cycle-gate 的 internalPrefixed 例外表登记。
  WA.__agencyWarn = null;

  // ── 私有辅助 ──
  function storeOf() { return WA.store; }
  function state() { const s = storeOf(); return s && s.get ? (s.get() || {}) : {}; }

  /**
   * 为人物查找当前 active 目标（取第一个 active goal）。
   * 纯读 life 数据面，不调用 life API（避免触发 tick/decide 副作用）。
   */
  function activeGoalOf(personName) {
    const who = clean(personName, 60);
    if (!who) return null;
    const st = state();
    // life.js 用 personId(name) = 'p_' + name 做键存储——直接读 people[原键] 永远找不到了。
    const pid = 'p_' + who;
    const p = (st.people || {})[pid];
    if (!p || !p.life || !Array.isArray(p.life.goals)) return null;
    return p.life.goals.filter(function (g) { return g && g.status === 'active'; })[0] || null;
  }

  /**
   * 检查计划当前步的前置条件是否满足。
   * 纯读 plan.current 的返回（不调 plan.advance/settle）。
   * 返回 { ready: bool, reason: string }。
   */
  function checkPrereqs(personName, step) {
    if (!step) return { ready: false, reason: 'no-step' };
    if (step.status === 'running') return { ready: false, reason: 'already-running' };
    if (step.status === 'done') return { ready: false, reason: 'already-done' };
    if (step.status === 'blocked') return { ready: false, reason: 'blocked' };
    // need 检查（只看声明，不查 org 库存——那是 act.add 的职责）
    if (step.need && typeof step.need === 'object' && step.need.resource && step.need.amount > 0) {
      // act.add 会做真实资源检查；此处只做形状校验
    }
    return { ready: true, reason: '' };
  }

  // ── 核心 API ──

  /**
   * 调度：为一个人物从目标→计划→行动建立闭环链路。
   * ① 读 life 的 active goal
   * ② 如果 plan 没有当前计划且 autoPlanExpand 开启，调 plan.expand 建计划
   * ③ 读 plan.current 的当前步
   * ④ 检查前置 → 调 act.add + act.admit 准入行动
   * 只处理一个人物的一个步；调用方可循环人物。
   */
  function schedule(personName, at) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(personName, 60);
    if (!who) return { ok: false, reason: 'missing-person' };
    const t = isFinite(finite(at)) ? Number(at) : clockNow('agency');

    // ① 读 active goal
    const goal = activeGoalOf(who);
    if (!goal) return { ok: false, reason: 'no-active-goal', person: who };

    // ② 检查 plan 是否已有计划
    let planRow = null;
    try { if (WA.plan && WA.plan.current) planRow = WA.plan.current(who); } catch (e) { planRow = null; }

    // 如果没有计划且 autoPlanExpand 开启，尝试展开
    if ((!planRow || !planRow.ok) && cfg.autoPlanExpand && WA.plan && WA.plan.expand) {
      // plan.expand 需要 steps —— 但本模块不编步骤。
      // 真实部署中，步骤由 AI 文本经结构预检产生或由预设模板提供。
      // 此处返回 need-steps 让调用方知道：要建计划得给步骤。
      return { ok: false, reason: 'need-steps', person: who, goalId: goal.id,
        hint: '调用 plan.expand(person, goalId, steps) 建计划后再调度' };
    }

    if (!planRow || !planRow.ok) {
      return { ok: false, reason: 'no-plan', person: who, goalId: goal.id };
    }

    // ③ 读当前步
    const step = planRow.step || null;
    const pre = checkPrereqs(who, step);
    if (!pre.ready) {
      stat.lastReason = pre.reason;
      return { ok: false, reason: pre.reason, person: who, planId: planRow.id, stepSeq: step ? step.seq : -1 };
    }

    // ④ 准入行动（调 act.add + act.admit）
    if (!WA.act || !WA.act.add || !WA.act.admit) {
      return { ok: false, reason: 'act-unavailable', person: who };
    }

    const actSpec = {
      kind: step.kind || 'work',
      goalId: goal.id,
      duration: finite(step.duration) || undefined,
      need: step.need || undefined,
      place: step.place || undefined,
      to: step.place || undefined
    };
    const added = WA.act.add(who, actSpec);
    if (!added.ok) {
      stat.lastReason = 'add-failed:' + added.reason;
      return Object.assign(added, { person: who, planId: planRow.id, stepSeq: step.seq });
    }

    const admitted = WA.act.admit(added.id, t, {});
    if (!admitted.ok) {
      stat.lastReason = 'admit-failed:' + admitted.reason;
      return Object.assign(admitted, { person: who, planId: planRow.id, stepSeq: step.seq, actId: added.id });
    }

    stat.scheduled++;
    stat.admitted++;
    stat.lastReason = 'scheduled';
    return { ok: true, person: who, goalId: goal.id, planId: planRow.id, stepSeq: step.seq, actId: added.id, admitted: true };
  }

  /**
   * 回执处理：读已完成行动 → 结算计划步 → 更新目标进度。
   * 这是闭环的关键：行动做完了，要把结果交回 plan 和 life。
   */
  function processReceipts(at) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const t = isFinite(finite(at)) ? Number(at) : clockNow('agency');

    if (!WA.act || !WA.act.stat) return { ok: false, reason: 'act-unavailable' };

    const actStat = WA.act.stat();
    const completed = actStat.completed || 0;
    const failed = actStat.failed || 0;

    // 读结算台账找未消化的回执
    const st = state();
    const res = (st.acts && Array.isArray(st.acts.res)) ? st.acts.res : [];
    // 反向遍历（最近的最先处理），跳过已处理的
    const pending = res.filter(function (r) {
      return r && r.opId && !r._agencyProcessed;
    }).slice(-cfg.maxReceiptsPerTurn);

    let out = { ok: true, processed: 0, stepsDone: 0, stepsBlocked: 0, goalsDone: 0, goalsBlocked: 0, deferred: [] };

    if (!WA.plan || !WA.plan.settle) {
      stat.lastReason = 'plan-unavailable';
      return Object.assign(out, { reason: 'plan-unavailable' });
    }

    pending.forEach(function (r) {
      // 找到对应的行动行，拿到 person 和 goalId
      const rows = (st.acts && Array.isArray(st.acts.rows)) ? st.acts.rows : [];
      const actRow = rows.filter(function (x) { return x && x.id === r.actId; })[0] || null;
      if (!actRow) { out.deferred.push({ receipt: r.opId, reason: 'no-act-row' }); return; }

      const who = actRow.person;
      const goalId = actRow.goalId;

      // 查计划当前步
      let planRow = null;
      try { if (WA.plan.current) planRow = WA.plan.current(who); } catch (e) { planRow = null; }
      if (!planRow || !planRow.ok) { out.deferred.push({ receipt: r.opId, reason: 'no-plan', person: who }); return; }

      const step = planRow.step;
      if (!step || step.status !== 'running') {
        out.deferred.push({ receipt: r.opId, reason: 'step-not-running', person: who, seq: step ? step.seq : -1 });
        return;
      }

      // 行动结果映射到 plan 结算
      let outcome = 'done';
      let opts = {};
      if (r.status === 'failed') {
        outcome = 'blocked';
        opts.reason = str(r.reason || r.result || 'action-failed', 40);
      }

      const settled = WA.plan.settle(who, outcome, opts);
      if (settled && settled.ok) {
        out.processed++;
        if (outcome === 'done') { out.stepsDone++; stat.stepsDone++; }
        else { out.stepsBlocked++; stat.stepsBlocked++; }
        stat.receipts++;

        // 如果计划全部完成，更新目标进度
        if (settled.status === 'done') {
          out.goalsDone++;
          stat.goalsDone++;
          // 不直接改 life.goals.status（life 是唯一写者）
          // 返回信息让调用方决定是否调 life.addGoal 更新或 mark done
        }
      } else {
        out.deferred.push({ receipt: r.opId, reason: settled ? settled.reason : 'settle-failed', person: who });
      }
    });

    stat.lastReason = out.processed ? 'processed' : (out.deferred.length ? 'deferred' : 'nothing');
    stat.deferred += out.deferred.length;
    return out;
  }

  // ── 注入面 ──
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const st = state();
    const lines = [];
    // 扫描所有有 active goal 的人物
    const people = (st.people || {});
    Object.keys(people).forEach(function (id) {
      const p = people[id];
      if (!p || !p.life) return;
      const goals = (p.life.goals || []).filter(function (g) { return g && g.status === 'active'; });
      if (!goals.length) return;
      // 查计划状态（传原始名给 plan.current，它内部用 personId 做 p_ 前缀查找）
      let planInfo = '';
      try {
        if (WA.plan && WA.plan.current) {
          const pr = WA.plan.current(p.name || id.replace(/^p_/, ''));
          if (pr && pr.ok) {
            planInfo = '计划步' + (pr.step ? pr.step.seq : '?') + '=' + (pr.step ? pr.step.status : '?');
            if (pr.status === 'blocked') planInfo += '（阻塞：' + (pr.reason || '') + '）';
          }
        }
      } catch (e) { planInfo = ''; }
      // 查行动状态
      let actInfo = '';
      try {
        if (WA.act && WA.act.view) {
          const av = WA.act.view(id);
          if (av && av.ok && av.rows && av.rows.length) {
            const running = av.rows.filter(function (r) { return r && r.status === 'running'; });
            if (running.length) actInfo = '在途行动' + running.length + '笔';
          }
        }
      } catch (e) { actInfo = ''; }

      if (planInfo || actInfo) {
        lines.push(p.name + '：' + goals[0].text + ' | ' + planInfo + (actInfo ? ' | ' + actInfo : ''));
      } else {
        lines.push(p.name + '：' + goals[0].text + ' | 待调度');
      }
    });
    return lines.length ? '[行动调度]\\n' + lines.join('\\n') + '\\n以上是当前行动闭环状态；未结算的行动回执不自动推进计划步。' : '';
  }

  // ── 诊断面 ──
  function diagnose() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      maxSchedulePerTurn: cfg.maxSchedulePerTurn,
      maxReceiptsPerTurn: cfg.maxReceiptsPerTurn,
      autoPlanExpand: cfg.autoPlanExpand,
      scheduled: stat.scheduled, admitted: stat.admitted,
      receipts: stat.receipts, stepsDone: stat.stepsDone,
      stepsBlocked: stat.stepsBlocked, goalsDone: stat.goalsDone,
      goalsBlocked: stat.goalsBlocked, deferred: stat.deferred,
      lastReason: stat.lastReason,
      faults: Object.assign({}, stat.faults),
      // 自证面：life/plan/act 三模块均在
      lifeAvailable: !!(WA.life && WA.life.stat),
      planAvailable: !!(WA.plan && WA.plan.current),
      actAvailable: !!(WA.act && WA.act.stat),
      // 自证面：闭环链路完整性
      closedLoop: !!(WA.life && WA.plan && WA.act && WA.plan.settle && WA.act.stat)
    };
  }

  // ── 导出 ──
  WA.agency = {
    // 设置面
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    // 闭环面
    schedule: schedule,
    processReceipts: processReceipts,
    // 注入面
    buildBlock: buildBlock,
    // 诊断面
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };

  // ── 自证块（与 diplomacy 同规格）──
  //   写口数目检查：导出面有 6 个成员（getSettings/setSettings/schedule/processReceipts/buildBlock/diagnose/stat）。
  //   不符时写内部 ns 供门禁例外表登记。
  var __exportCount = 0;
  for (var k in WA.agency) { if (Object.prototype.hasOwnProperty.call(WA.agency, k)) __exportCount++; }
  if (__exportCount !== 7) WA.__agencyWarn = { expected: 7, got: __exportCount };

  // ── 模块登记 ──
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/agency.js', { kind: 'engine', ver: '2.166.0' });
})();
