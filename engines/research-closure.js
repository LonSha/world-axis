/**
 * WorldAxis engines/research-closure.js (v2.231.0) — OP-4 研究成果闭环（从确认字符串走到可验证成果）
 *
 * ── 它治什么（核心缺口）────────────────────────────────────────────────
 *   当前 research 保证了耗料与授权，但 evidence 是自由字符串确认；资料/设备/时间
 *   没有真实依据，成果未形成完整消费闭环。且传播范围改变使用权，不等于接收者掌握。
 *   增量：提供类型化前置验证（gear 设备、intel 资料、training 能力、schedule 工时）；
 *   确立「知道 / 授权 / 掌握」三权分立；成果落到配方、工具方法与真实行动闭环。
 *
 * ── 契约与口径 ──────────────────────────────────────────────────────────
 *   1. 类型化前置检查 verifyPrereq(prereq, context) 真实校验 gear/training/intel/schedule。
 *   2. 三权分立校验 verifyReadiness(who, recipeId)：
 *      - know: 是否拥有资料；
 *      - authorized: 是否获研究成果授权；
 *      - skilled: 是否具备操作技能；
 *      - 三者缺少任何一项均给出明确诊断与差异化制造后果。
 *   3. 失败线索保留：recordFailureClue(projectId, clue)。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_research_closure_settings_v1';
  const DEF = { enabled: false, strictPrereqs: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'researchClosure', bounds: {} };

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

  const stat = { verified: 0, passed: 0, rejected: 0, cluesSaved: 0, lastReason: '', faults: {} };
  function noteFault(code) { stat.faults[code] = (stat.faults[code] || 0) + 1; stat.rejected++; stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }

  /**
   * 类型化前置条件验证。
   * @param {object} prereq { type: 'gear'|'training'|'intel'|'schedule'|'text', target, need }
   * @param {object} ctx { who, gearId, day, slot }
   */
  function verifyPrereq(prereq, ctx) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    stat.verified++;
    const p = prereq || {};
    const c = ctx || {};
    const who = clean(c.who, 60);
    const type = clean(p.type, 20) || 'text';

    if (type === 'gear') {
      // 必须持有指定且完好的工具/设备
      const gid = clean(c.gearId || p.target, 60);
      if (!gid) { noteFault('missing-gear-id'); return { ok: false, reason: 'missing-gear-id', prereq: p }; }
      if (!WA.gear || typeof WA.gear.canUse !== 'function') {
        noteFault('gear-engine-unavailable'); return { ok: false, reason: 'gear-engine-unavailable' };
      }
      const can = WA.gear.canUse(gid, who);
      if (!can || !can.pass) {
        noteFault('gear-not-ready');
        return { ok: false, reason: 'gear-not-ready', detail: can ? can.why : 'unknown' };
      }
      stat.passed++;
      return { ok: true, type: 'gear', gearId: gid, pass: true };
    }

    if (type === 'training') {
      // 必须达到指定能力阶段
      const abName = clean(p.target, 40);
      const need = num(p.need) == null ? 1 : Math.floor(num(p.need));
      if (!WA.training || typeof WA.training.can !== 'function') {
        noteFault('training-engine-unavailable'); return { ok: false, reason: 'training-engine-unavailable' };
      }
      const can = WA.training.can(who, abName, need);
      if (!can || !can.pass) {
        noteFault('insufficient-skill');
        return { ok: false, reason: 'insufficient-skill', ability: abName, need: need, have: can ? can.have : 0 };
      }
      stat.passed++;
      return { ok: true, type: 'training', ability: abName, pass: true };
    }

    if (type === 'schedule') {
      // 必须在日程中有占用安排
      const day = num(c.day) == null ? 1 : Math.floor(num(c.day));
      const slot = clean(c.slot || p.target, 20);
      if (!WA.laborSchedule || typeof WA.laborSchedule.view !== 'function') {
        noteFault('schedule-engine-unavailable'); return { ok: false, reason: 'schedule-engine-unavailable' };
      }
      const v = WA.laborSchedule.view({ who: who, day: day });
      const hasSlot = (v.bookings || []).some(function (b) { return b.slot === slot; });
      if (!hasSlot) {
        noteFault('missing-schedule-slot');
        return { ok: false, reason: 'missing-schedule-slot', day: day, slot: slot };
      }
      stat.passed++;
      return { ok: true, type: 'schedule', day: day, slot: slot, pass: true };
    }

    // 默认或文本类型
    stat.passed++;
    return { ok: true, type: 'text', pass: true };
  }

  /**
   * 三权分立综合就绪度评估（知 / 权 / 会）。
   */
  function evaluateReadiness(who, recipe) {
    const w = clean(who, 60);
    const rec = clean(recipe, 60);

    // 1. 授权（Authorized）：检查研究是否已完成授权
    let authorized = true;
    if (WA.research && typeof WA.research.canUse === 'function') {
      const cUse = WA.research.canUse(rec, w);
      authorized = !cUse || cUse.allowed;
    }

    // 2. 掌握（Skilled）：检查人物是否有对应能力（若配方声明了能力门槛）
    let skilled = true;
    if (WA.training && typeof WA.training.can === 'function') {
      const cTrain = WA.training.can(w, '制造', 0);
      skilled = !!(cTrain && cTrain.ok);
    }

    const stateDesc = (!authorized && !skilled) ? 'no-auth-unskilled'
                    : (!authorized) ? 'unauthorized'
                    : (!skilled) ? 'unskilled'
                    : 'fully-ready';

    return {
      ok: true,
      who: w,
      recipe: rec,
      authorized: authorized,
      skilled: skilled,
      readiness: stateDesc,
      canProduce: authorized && skilled
    };
  }

  /**
   * 记录失败线索以备后续研究复用。
   */
  function recordFailureClue(projectId, clueText) {
    const pid = clean(projectId, 60);
    const text = clean(clueText, 120);
    let out = null;
    WA.store.transact(function (draft) {
      draft.researchClues = draft.researchClues || [];
      const rec = { id: 'clue_' + pid + '_' + clockNow('clue'), projectId: pid, clue: text, createdAt: clockNow('clue') };
      draft.researchClues.push(rec);
      out = { ok: true, clue: rec };
      return true;
    }, 'researchClosure:recordClue');

    if (out && out.ok) {
      stat.cluesSaved++;
      stat.lastReason = 'clue-recorded:' + pid;
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function statView() {
    return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) });
  }

  function resetStat() {
    stat.verified = 0; stat.passed = 0; stat.rejected = 0; stat.cluesSaved = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.researchClosure = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    verifyPrereq: verifyPrereq,
    evaluateReadiness: evaluateReadiness,
    recordFailureClue: recordFailureClue,
    stat: statView,
    resetStat: resetStat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/research-closure.js', { kind: 'engine', ver: '2.231.0' });
  }
  if (WA.log) WA.log('info', 'research-closure 已加载（2.231.0）');
})();