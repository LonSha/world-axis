/**
 * WorldAxis engines/sim-rehearsal.js (v2.417.0) — OPV25-3 整轮推演执行链
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   本仓有四处「推演」，但**没有一处是带执行链的整轮推演**：
 *     · `digest.js` 产出一段 150–200 字的世界叙事（一次成型，无步骤、无中止）；
 *     · `plan.js` 的 `chainBlock` 把每人未终结的计划渲染成提示词（是**渲染面**）；
 *     · `rehearsal.js` 做的是「预览→跑」的两态检查，不是可中止的多步执行；
 *     · `backstage.js` 跑幕后模拟，但没有占位符替换、没有逐步留痕。
 *   实测 `grep -rn '推演占位符\|simRehearsal\|rehearsalStep' engines/` —— 430 引擎 0 命中。
 *
 *   后果：推演一跑就跑到底，**中途发现方向错了也停不下来**；而且模板里的占位符
 *   （`{{who}}` / `{{where}}` / `{{when}}`）没人替换，模型看到的就是字面花括号。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `plan({name, steps:[{id, template, vars}]})` 立一条执行链 →
 *   `step({runId, id})` 逐步执行，执行时**真替换占位符**（模板里没有的变量
 *   写进 `unresolved`，绝不猜值）→ `commit` 收尾 / `abort` 中途中止（已跑完的步骤留痕）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不调模型、不写 store：本模块只编排步骤与替换占位符，产物给调用方。
 *   ② 占位符缺值**不猜**：留 `unresolved` 列出来，让调用方看得见缺口。
 *   ③ 中止保留已完成步骤的产物（已发生的不能当没发生）。
 *   ④ 拒收码只用 disabled / missing-* / unknown-run / unknown-step / step-done / run-closed。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const LS_KEY = 'worldaxis_sim_rehearsal_settings_v1';
  const DEF = { enabled: true, maxRuns: 16, maxSteps: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'simRehearsal',
    bounds: { maxRuns: [2, 64], maxSteps: [1, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { plans: 0, steps: 0, commits: 0, aborts: 0, unresolvedHits: 0, refused: 0, lastReason: '' };
  const RUNS = []; // {runId, name, state, steps:[{id, template, vars, state, out, unresolved, at}], at, closedAt}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function findRun(id) { return RUNS.find(function (r) { return r.runId === str(id); }); }
  function trimCap(cap) {
    while (RUNS.length > cap) {
      const idx = RUNS.findIndex(function (r) { return r.state !== 'running'; });
      if (idx < 0) break;
      RUNS.splice(idx, 1);
    }
  }
  /** 占位符替换：{{name}} 形态；模板里没有的变量**不猜**，进 unresolved。 */
  function fill(template, vars) {
    const v = vars && typeof vars === 'object' ? vars : {};
    const seen = [];
    const unresolved = [];
    const out = String(template == null ? '' : template).replace(/\{\{\s*([A-Za-z0-9_\u4e00-\u9fa5]+)\s*\}\}/g, function (m, name) {
      if (!seen.includes(name)) seen.push(name);
      if (Object.prototype.hasOwnProperty.call(v, name) && v[name] != null && str(v[name]) !== '') {
        return str(v[name]);
      }
      if (!unresolved.includes(name)) unresolved.push(name);
      return m;
    });
    return { text: out, vars: seen, unresolved: unresolved };
  }
  function plan(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const name = str(s.name);
    if (!name) { stat.refused++; stat.lastReason = 'missing-name'; return { ok: false, hint: 'missing-name：这一轮推演叫什么？没有名字的链没法复查' }; }
    const raw = Array.isArray(s.steps) ? s.steps : [];
    if (!raw.length) { stat.refused++; stat.lastReason = 'missing-steps';
      return { ok: false, hint: 'missing-steps：推演要跑哪几步？空链不叫执行链' }; }
    const steps = raw.slice(0, cfg.maxSteps).map(function (it, i) {
      const o = it && typeof it === 'object' ? it : {};
      return { id: str(o.id) || ('s' + (i + 1)), template: String(o.template == null ? '' : o.template),
        vars: (o.vars && typeof o.vars === 'object') ? Object.assign({}, o.vars) : {},
        state: 'pending', out: null, unresolved: [], at: null };
    });
    const runId = 'sr' + (++stat.plans) + '-' + name.slice(0, 8);
    const now = num(s.at) || clockNow('simRehearsal') || 0;
    const run = { runId: runId, name: name, state: 'running', steps: steps, at: now, closedAt: null };
    RUNS.push(run);
    trimCap(cfg.maxRuns);
    return { ok: true, runId: runId, name: name, steps: steps.map(function (x) { return x.id; }),
      truncated: raw.length > steps.length, totalInput: raw.length };
  }
  function step(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const run = findRun(s.runId);
    if (!run) { stat.refused++; stat.lastReason = 'unknown-run'; return { ok: false, hint: 'unknown-run：没有这条推演链' }; }
    if (run.state !== 'running') { stat.refused++; stat.lastReason = 'run-closed';
      return { ok: false, hint: 'run-closed：这条链已 ' + run.state + '，不能再推' }; }
    const id = str(s.id);
    if (!id) { stat.refused++; stat.lastReason = 'missing-step'; return { ok: false, hint: 'missing-step：要跑哪一步？' }; }
    const st = run.steps.find(function (x) { return x.id === id; });
    if (!st) { stat.refused++; stat.lastReason = 'unknown-step'; return { ok: false, hint: 'unknown-step：这条链里没有这一步（可用：' + run.steps.map(function (x) { return x.id; }).join('/') + '）' }; }
    if (st.state === 'done') { stat.refused++; stat.lastReason = 'step-done';
      return { ok: false, hint: 'step-done：这一步已经跑过，产物在 out —— 不重复跑（重复跑等于世界多走一遍）' }; }
    const vars = Object.assign({}, st.vars, (s.vars && typeof s.vars === 'object') ? s.vars : {});
    const filled = fill(st.template, vars);
    st.state = 'done'; st.out = filled.text; st.unresolved = filled.unresolved;
    st.at = num(s.at) || clockNow('simRehearsal') || 0;
    stat.steps++;
    if (filled.unresolved.length) stat.unresolvedHits++;
    return { ok: true, runId: run.runId, id: st.id, out: filled.text,
      vars: filled.vars, unresolved: filled.unresolved,
      hint: filled.unresolved.length ? ('unresolved：' + filled.unresolved.join('/') + ' 没有值，已原样保留 —— 不猜') : '',
      pending: run.steps.filter(function (x) { return x.state === 'pending'; }).map(function (x) { return x.id; }) };
  }
  function commit(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const run = findRun(s.runId);
    if (!run) { stat.refused++; stat.lastReason = 'unknown-run'; return { ok: false, hint: 'unknown-run：没有这条推演链' }; }
    if (run.state !== 'running') { stat.refused++; stat.lastReason = 'run-closed'; return { ok: false, hint: 'run-closed：已 ' + run.state }; }
    const pending = run.steps.filter(function (x) { return x.state === 'pending'; });
    if (pending.length) { stat.refused++; stat.lastReason = 'steps-pending';
      return { ok: false, hint: 'steps-pending：还有 ' + pending.length + ' 步没跑（' + pending.map(function (x) { return x.id; }).join('/') + '），跑完再收' }; }
    const at = num(s.at) || clockNow('simRehearsal') || 0;
    run.state = 'committed'; run.closedAt = at;
    stat.commits++;
    return { ok: true, runId: run.runId, state: 'committed',
      outputs: run.steps.map(function (x) { return { id: x.id, out: x.out, unresolved: x.unresolved }; }) };
  }
  function abort(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const run = findRun(s.runId);
    if (!run) { stat.refused++; stat.lastReason = 'unknown-run'; return { ok: false, hint: 'unknown-run：没有这条推演链' }; }
    if (run.state !== 'running') { stat.refused++; stat.lastReason = 'run-closed'; return { ok: false, hint: 'run-closed：已 ' + run.state }; }
    const at = num(s.at) || clockNow('simRehearsal') || 0;
    run.state = 'aborted'; run.closedAt = at; run.abortReason = str(s.reason) || 'aborted';
    stat.aborts++;
    return { ok: true, runId: run.runId, state: 'aborted',
      doneSteps: run.steps.filter(function (x) { return x.state === 'done'; }).map(function (x) { return x.id; }),
      hint: '已跑完的步骤产物照旧保留 —— 已经发生过的不能当成没发生' };
  }
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    if (s.runId) {
      const run = findRun(s.runId);
      if (!run) return { ok: false, hint: 'unknown-run：没有这条推演链' };
      return { ok: true, run: { runId: run.runId, name: run.name, state: run.state,
        steps: run.steps.map(function (x) { return { id: x.id, state: x.state, unresolved: x.unresolved.slice() }; }) } };
    }
    return { ok: true, count: RUNS.length, runs: RUNS.map(function (r) {
      return { runId: r.runId, name: r.name, state: r.state, steps: r.steps.length,
        done: r.steps.filter(function (x) { return x.state === 'done'; }).length };
    }) };
  }
  function statView() {
    return Object.assign({ runs: RUNS.length,
      running: RUNS.filter(function (r) { return r.state === 'running'; }).length }, stat);
  }
  function reset() {
    RUNS.length = 0;
    stat.plans = 0; stat.steps = 0; stat.commits = 0; stat.aborts = 0;
    stat.unresolvedHits = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.simRehearsal = {
    plan: plan, step: step, commit: commit, abort: abort, view: view, fill: fill,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/sim-rehearsal.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/sim-rehearsal 已加载（2.417.0）');
})();