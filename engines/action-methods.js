/**
 * WorldAxis engines/action-methods.js (v2.231.0) — OP-2 能力—工具—行动结果联动
 *
 * ── 它治什么（计划原文核心缺口）────────────────────────────────────────
 *   成长、装备、对抗均已存在，但定向入口检索没有证明普通行动会消费新 training/gear；
 *   gear.use 目前主要结算使用次数和耐久。只涨数字却不改变选择，成长缺少意义。
 *   增量：让已声明能力决定可用方法，让具体物件的功能/状态影响方法可行性与成本。
 *   训练后开放替代解法，而不只是统一加成；有工具但不熟练、熟练但工具损坏应产生不同结果。
 *   非数值题材可使用“可做/需协助/暂不可做”的阶段规则。
 *
 * ── 核心契约与口径 ──────────────────────────────────────────────────────
 *   1. 纯读评估：evaluate() 为只读计算，零写入（前后存档逐字不变、工具耐久不磨损）。
 *   2. 能力与工具双维度分支：
 *      - 新手 + 完好工具 → 基础工具路径（耗时长/高磨损/或基础产出）；
 *      - 熟练者 + 损坏工具 → 开放熟练应急替代路径（无需好工具/凭经验绕过）；
 *      - 熟练者 + 完好工具 → 开放最佳熟练路径（低磨损/高效/高质量）；
 *      - 无能力且无工具 → 明确 blocked，附具体缺项（不含糊折成「不可用」）。
 *   3. 借出即失权：工具借出（gear.lend）后原持有人评估该工具必为 blocked（not-holder），不准使用。
 *   4. 单次扣除：只有在 execute() 提交确认时才扣除耐久与材料；取消选择绝不磨损。
 *   5. 防重复计费：同一动作不被多个模块重复收费。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_action_methods_settings_v1';
  const DEF = { enabled: false, maxMethods: 64, maxPathsPerTask: 8, defaultWear: 1 };
  const __REG = { key: LS_KEY, def: DEF, module: 'actionMethods',
    bounds: { maxMethods: [8, 200], maxPathsPerTask: [2, 16], defaultWear: [0, 10] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { evaluations: 0, executed: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(code) { stat.faults[code] = (stat.faults[code] || 0) + 1; stat.blocked++; stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }

  /**
   * 任务定义库（题材与核心内置通用模板）。
   * 任务包含多种解决路径（methods），每种路径声明所需能力门槛与工具条件。
   */
  const TASKS = {
    'task:repair': {
      id: 'task:repair',
      name: '设备检修',
      ability: '修理',
      gearKind: '工具',
      methods: [
        {
          id: 'novice_tool',
          name: '新手照图检修',
          minStage: 0,
          requireGear: true,
          wear: 2,
          path: 'path:novice_guided',
          desc: '按说明书使用专业工具逐步排查，耗时较长且工具磨损较大'
        },
        {
          id: 'expert_improvise',
          name: '熟练者应急替代',
          minStage: 2,
          requireGear: false,
          wear: 0,
          path: 'path:expert_improvised',
          desc: '凭借丰富经验使用简易替代方案跳过标准工具，不损耗专业工具'
        },
        {
          id: 'expert_standard',
          name: '熟练工标准精修',
          minStage: 2,
          requireGear: true,
          wear: 1,
          path: 'path:expert_standard',
          desc: '熟练手法配合完好工具，快速精准修复且工具损耗轻微'
        }
      ]
    }
  };

  /**
   * 注册或扩充任务模板。
   */
  function declareTask(taskDef) {
    if (!taskDef || !taskDef.id) return { ok: false, reason: 'invalid-task-def' };
    const cfg = settings();
    if (Object.keys(TASKS).length >= (cfg.maxMethods || 64)) return { ok: false, reason: 'max-methods-exceeded' };
    const id = clean(taskDef.id, 60);
    TASKS[id] = Object.assign({}, taskDef, { id: id });
    return { ok: true, id: id };
  }

  /**
   * 获取任务定义。
   */
  function getTask(taskId) {
    const id = clean(taskId, 60);
    return TASKS[id] || null;
  }

  /**
   * 纯读评估：评估特定人物使用指定工具面对某任务时，开放哪些可行解法。
   * @param {string} taskId 任务标识（如 'task:repair'）
   * @param {string} who 执行人姓名
   * @param {object} opts { gearId, target, customMethods }
   * @returns {object} { ok, taskId, who, available: [...], blocked: [...] }
   */
  function evaluate(taskId, who, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const w = clean(who, 60);
    if (!w) return { ok: false, reason: 'missing-person' };
    const o = opts || {};
    const task = getTask(taskId);
    if (!task) { noteFault('unknown-task'); return { ok: false, reason: 'unknown-task', taskId: taskId }; }

    stat.evaluations++;
    const maxP = Math.max(1, cfg.maxPathsPerTask || 8);
    const methods = ((Array.isArray(o.methods) && o.methods.length) ? o.methods : task.methods).slice(0, maxP);
    const abilityName = clean(task.ability, 40);
    const gearId = clean(o.gearId, 60);

    // 1. 查能力进度 (纯读 training.can)
    let abilityStage = 0;
    if (WA.training && typeof WA.training.can === 'function' && abilityName) {
      const c = WA.training.can(w, abilityName, 0);
      if (c && c.ok) {
        abilityStage = num(c.have) || (num(c.stage) || 0);
      }
    }

    // 2. 查工具可用性 (纯读 gear.canUse)
    let gearOk = false;
    let gearItem = null;
    let gearReason = 'no-gear-provided';
    if (gearId && WA.gear && typeof WA.gear.canUse === 'function') {
      const gCheck = WA.gear.canUse(gearId, w);
      if (gCheck && gCheck.ok) {
        gearOk = !!gCheck.pass;
        gearReason = gCheck.why || gCheck.reason || (gCheck.pass ? 'can' : 'unusable');
        gearItem = { id: gearId, durability: num(gCheck.durability) || 0, holder: gCheck.holder };
      } else {
        gearOk = false;
        gearReason = (gCheck && (gCheck.why || gCheck.reason)) ? (gCheck.why || gCheck.reason) : 'unknown-gear';
      }
    }

    const available = [];
    const blockedList = [];

    methods.forEach(function (m) {
      const minStage = num(m.minStage) || 0;
      const needGear = !!m.requireGear;
      const reasons = [];

      // 能力条件判定
      if (abilityStage < minStage) {
        reasons.push('insufficient-ability:stage_' + abilityStage + '_need_' + minStage);
      }

      // 工具条件判定
      if (needGear) {
        if (!gearId) {
          reasons.push('missing-gear');
        } else if (!gearOk) {
          reasons.push('gear-unusable:' + gearReason);
        }
      }

      if (reasons.length === 0) {
        available.push({
          methodId: m.id,
          name: m.name,
          path: m.path,
          desc: m.desc,
          wear: num(m.wear) != null ? num(m.wear) : cfg.defaultWear,
          gearId: needGear ? gearId : null,
          abilityStage: abilityStage,
          status: 'ready'
        });
      } else {
        blockedList.push({
          methodId: m.id,
          name: m.name,
          reasons: reasons,
          status: 'blocked'
        });
      }
    });

    return {
      ok: true,
      taskId: task.id,
      taskName: task.name,
      who: w,
      ability: abilityName,
      abilityStage: abilityStage,
      gearId: gearId || null,
      gearReason: gearReason,
      available: available,
      blocked: blockedList
    };
  }

  /**
   * 提交执行：确认选用特定方法，原子扣除耐久并结算产出路径。
   * 取消选择绝不磨损（未调用 execute 即零副作用）。
   */
  function execute(taskId, who, methodId, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const evalRes = evaluate(taskId, who, o);
    if (!evalRes.ok) return evalRes;

    const chosen = evalRes.available.filter(function (m) { return m.methodId === clean(methodId, 60); })[0];
    if (!chosen) {
      noteFault('method-not-available');
      return {
        ok: false,
        reason: 'method-not-available',
        methodId: methodId,
        available: evalRes.available.map(function (m) { return m.methodId; }),
        blocked: evalRes.blocked
      };
    }

    // 执行真实工具磨损（仅在提交且该方法需要工具时）
    let wearResult = null;
    if (chosen.gearId && chosen.wear > 0 && WA.gear && typeof WA.gear.use === 'function') {
      wearResult = WA.gear.use(chosen.gearId, {
        by: who,
        wear: chosen.wear,
        note: 'methods:' + taskId + ':' + chosen.methodId
      });
      if (!wearResult || !wearResult.ok) {
        noteFault('wear-failed');
        return { ok: false, reason: 'wear-failed', detail: wearResult };
      }
    }

    stat.executed++;
    stat.lastReason = 'executed:' + chosen.path;

    return {
      ok: true,
      taskId: taskId,
      who: who,
      methodId: chosen.methodId,
      methodName: chosen.name,
      path: chosen.path,
      desc: chosen.desc,
      wear: chosen.wear,
      gearId: chosen.gearId,
      gearRemaining: wearResult ? wearResult.durability : null,
      timestamp: clockNow('action-methods')
    };
  }

  function statView() {
    return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) });
  }

  function resetStat() {
    stat.evaluations = 0; stat.executed = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.actionMethods = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    declareTask: declareTask,
    getTask: getTask,
    evaluate: evaluate,
    execute: execute,
    stat: statView,
    resetStat: resetStat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/action-methods.js', { kind: 'engine', ver: '2.231.0' });
  }
  if (WA.log) WA.log('info', 'action-methods 已加载（2.231.0）');
})();
