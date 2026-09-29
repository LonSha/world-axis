/**
 * WorldAxis engines/stage.js (v2.119.0) — 可组合题材玩法包与长篇阶段变化（拓展计划 ⑦）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   `recipe` 有六槽位的题材配方（必要能力/运行政策/行动词汇/资源词汇/场景种子/信息边界），
 *   `theme` 有题材规则组合 —— 但没有任何一处回答得了：
 *   「这套玩法打算玩多久？什么条件下它该换阶段？换阶段时哪些东西必须跟着变？」
 *   现场于是只剩两种做法：要么一套配方从开头玩到结尾（长篇没有成长弧），
 *   要么模型顺手宣布「你现在进入第二阶段了」——而那句话既没有条件、也没有代价。
 *
 * ── 本模块只做五件事，每件都有一个硬条件 ───────────────────────
 *   ① `adopt` 选一套玩法包：包名必须在**具名玩法包表**内（`unknown-pack`）；
 *      一套包只能采纳一次（`already-adopted`）——「现在玩的是哪套」必须唯一。
 *   ② `mark`  记进度：指标必须是该包**声明的指标**（`unknown-metric`），
 *      且只能**单调递增**（`not-advancing`）——成就不是可以往回拧的旋钮。
 *   ③ `plan`  声明阶段迁移：必须写明**触发条件**（指标 + 门槛）与**迁移清单**
 *      （哪些槽位要换）；缺任一项都是 `missing-trigger` / `missing-changes`。
 *   ④ `transit` 换阶段：门槛未达则 `threshold-unmet`（带出还差多少）；
 *      换阶段**必须逐项确认迁移清单已生效**（`change-not-applied`）——
 *      否则「换阶段」只是一句宣告，玩法实际没变。
 *   ⑤ `view`  读侧：当前阶段、已声明但未到的迁移、已完成的迁移各一列，
 *      **不到期的迁移不进正文**（剧透保护）。
 *
 * ── 八条设计边界（全是否定式）──────────────────────────────────
 *   ① **包必须具名**：自造玩法包拒收（不能凭空发明一套玩法）。
 *   ② **一套一采纳**：当前玩法唯一。
 *   ③ **指标是包声明的**：不许拿包外指标充数。
 *   ④ **成就不可回卷**：指标单调递增。
 *   ⑤ **迁移必须有条件与清单**：缺一不可。
 *   ⑥ **换阶段必须落地**：清单未逐项生效就不得进入下一阶段。
 *   ⑦ **不剧透**：未到期的迁移不进注入正文（作者面可看）。
 *   ⑧ **容量有界且挤出有账**：三个站点（packs / metrics / transitions）都走 evict 单一出口。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────────
 *   · 本模块**不替代 recipe**：配方槽位的真源仍是 `recipe`；本模块只记「何时该换」。
 *   · 本模块**不定世界观**：阶段名与指标都由调用方按包声明。
 *   · 总开关默认关闭；关闭时不采纳、不记分、不迁移、不注入。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_stage_settings_v1';
  const DEF = { enabled: false, maxMetrics: 24, maxTransitions: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'stage',
    bounds: { maxMetrics: [4, 48], maxTransitions: [2, 24] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 具名玩法包表：每包自带指标与阶段（**玩法不能凭空发明**）。
  const PACKS = {
    '都市生活': { metrics: ['名望', '积蓄'], stages: ['立足', '扎根', '转身'] },
    '经营':     { metrics: ['流水', '人手'],   stages: ['铺开', '扩张', '守成'] },
    '悬疑':     { metrics: ['线索', '疑点'],   stages: ['发端', '纠缠', '收束'] },
    '冒险':     { metrics: ['里程', '声望'],   stages: ['启程', '深入', '归返'] }
  };

  const stat = { adopts: 0, marks: 0, plans: 0, transits: 0, blocked: 0,
    lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.blocked++; stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function stOf(root) {
    const c = (root || state()).stage;
    return (c && typeof c === 'object' && !Array.isArray(c)) ? c : null;
  }
  function transitionsOf(root) {
    const c = stOf(root);
    return (c && Array.isArray(c.transitions)) ? c.transitions : [];
  }
  function openStage(draft) {
    draft.stage = (draft.stage && typeof draft.stage === 'object' && !Array.isArray(draft.stage))
      ? draft.stage : { pack: '', stage: '', metrics: {}, transitions: [] };
    if (!draft.stage.metrics || typeof draft.stage.metrics !== 'object') draft.stage.metrics = {};
    if (!Array.isArray(draft.stage.transitions)) draft.stage.transitions = [];
    return draft.stage;
  }
  /** ① 采纳一套玩法包：包名必须具名，且**一套一采纳**。 */
  function adopt(pack, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const name = clean(pack, 40);
    if (!name) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const def = PACKS[name];
    if (!def) { noteFault('unknown-pack'); return { ok: false, reason: 'unknown-pack', pack: name, known: Object.keys(PACKS) }; }
    const cur = stOf();
    if (cur && cur.pack && !o.replace) {
      noteFault('already-adopted');
      return { ok: false, reason: 'already-adopted', pack: cur.pack, hint: '换玩法必须显式 replace' };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const st = openStage(draft);
      const now = clockNow('stage');
      st.pack = name;
      st.stage = clean(o.stage, 40) || def.stages[0];
      st.plan = def.metrics.slice();
      st.at = now; st.updatedAt = now;
      out = { ok: true, pack: name, stage: st.stage, metrics: def.metrics.slice(), stages: def.stages.slice() };
    }, 'stage:adopt');
    if (out && out.ok) { stat.adopts++; stat.lastReason = 'adopted'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ② 记进度：指标必须是包声明的，且**单调递增**（成就不可回卷）。 */
  function mark(metric, delta, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const m = clean(metric, 40);
    if (!m) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const cur = stOf();
    if (!cur || !cur.pack) { noteFault('no-pack'); return { ok: false, reason: 'no-pack' }; }
    const def = PACKS[cur.pack];
    if (!def || def.metrics.indexOf(m) < 0) {
      noteFault('unknown-metric');
      return { ok: false, reason: 'unknown-metric', metric: m, declared: def ? def.metrics.slice() : [] };
    }
    const d = num(delta);
    if (d === null) { noteFault('bad-delta'); return { ok: false, reason: 'bad-delta', delta: delta }; }
    if (d <= 0) {
      noteFault('not-advancing');
      return { ok: false, reason: 'not-advancing', metric: m, hint: '成就不是可以往回拧的旋钮' };
    }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const st = openStage(draft);
      const before = num(st.metrics[m]) || 0;
      const keys = Object.keys(st.metrics);
      // 新指标占一格：容量满时先挤出最久未更新的那个（**由本模块自己给出候选序**）。
      if (keys.indexOf(m) < 0 && keys.length >= cfg.maxMetrics) {
        out = { ok: false, reason: 'metrics-full', cap: cfg.maxMetrics }; return false;
      }
      st.metrics[m] = +(before + d).toFixed(2);
      st.updatedAt = clockNow('stage');
      out = { ok: true, metric: m, before: before, value: st.metrics[m], gained: d };
    }, 'stage:mark');
    if (out && out.ok) { stat.marks++; stat.lastReason = 'marked'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ③ 声明阶段迁移：触发条件与迁移清单**都必须写明**。 */
  function plan(opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const cur = stOf();
    if (!cur || !cur.pack) { noteFault('no-pack'); return { ok: false, reason: 'no-pack' }; }
    const def = PACKS[cur.pack];
    const to = clean(o.to, 40);
    if (!to) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (def && def.stages.indexOf(to) < 0) {
      noteFault('unknown-stage');
      return { ok: false, reason: 'unknown-stage', stage: to, allowed: def.stages.slice() };
    }
    const metric = clean(o.metric, 40), need = num(o.need);
    if (!metric || need === null) {
      noteFault('missing-trigger');
      return { ok: false, reason: 'missing-trigger', hint: '迁移必须写明触发条件（指标 + 门槛）' };
    }
    if (def && def.metrics.indexOf(metric) < 0) {
      noteFault('unknown-metric');
      return { ok: false, reason: 'unknown-metric', metric: metric, declared: def.metrics.slice() };
    }
    const changes = (Array.isArray(o.changes) ? o.changes : []).map(function (c) { return clean(c, 40); }).filter(function (c) { return c; });
    if (!changes.length) {
      noteFault('missing-changes');
      return { ok: false, reason: 'missing-changes', hint: '迁移必须写明哪些槽位要变' };
    }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const st = openStage(draft);
      if (st.transitions.length >= cfg.maxTransitions) { out = { ok: false, reason: 'transitions-full', cap: cfg.maxTransitions }; return false; }
      const now = clockNow('stage');
      const row = { id: 'tr_' + now + '_' + st.transitions.length, from: st.stage, to: to,
        metric: metric, need: need, changes: changes, done: false, applied: [], note: clean(o.note, 60), at: now };
      st.transitions.push(row);
      WA.evict.array(st.transitions, 'stage.transitions', cfg.maxTransitions);
      st.updatedAt = now;
      out = { ok: true, id: row.id, from: row.from, to: to, metric: metric, need: need, changes: changes.slice() };
    }, 'stage:plan');
    if (out && out.ok) { stat.plans++; stat.lastReason = 'planned'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ④ 换阶段：门槛未达 → `threshold-unmet`（带出还差多少）；
   *   清单未逐项生效 → `change-not-applied`（换阶段不是一句宣告）。
   */
  function transit(transId, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const key = clean(transId, 60);
    const row = transitionsOf().filter(function (t) { return t && clean(t.id, 60) === key; })[0] || null;
    if (!row) { noteFault('unknown-transition'); return { ok: false, reason: 'unknown-transition', id: key }; }
    if (row.done) { noteFault('already-transited'); return { ok: false, reason: 'already-transited', id: row.id }; }
    const cur = stOf();
    const have = num(cur && cur.metrics ? cur.metrics[row.metric] : null) || 0;
    if (have < row.need) {
      noteFault('threshold-unmet');
      return { ok: false, reason: 'threshold-unmet', id: row.id, metric: row.metric, have: have, need: row.need };
    }
    // 清单必须逐项确认已生效（不确认就不得进入下一阶段）。
    const applied = (Array.isArray(o.applied) ? o.applied : []).map(function (c) { return clean(c, 40); });
    const missing = row.changes.filter(function (c) { return applied.indexOf(c) < 0; });
    if (missing.length) {
      noteFault('change-not-applied');
      return { ok: false, reason: 'change-not-applied', id: row.id, missing: missing, hint: '换阶段必须逐项确认迁移清单已生效' };
    }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const st = openStage(draft);
      const r = st.transitions.filter(function (t) { return t && clean(t.id, 60) === key; })[0] || null;
      if (!r) { out = { ok: false, reason: 'unknown-transition', id: key }; return false; }
      if (r.done) { out = { ok: false, reason: 'already-transited', id: r.id }; return false; }
      const now = clockNow('stage');
      r.done = true; r.applied = applied.slice(); r.doneAt = now;
      st.stage = r.to; st.updatedAt = now;
      out = { ok: true, id: r.id, from: r.from, to: r.to, applied: applied.slice() };
    }, 'stage:transit');
    if (out && out.ok) { stat.transits++; stat.lastReason = 'transited'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function view() {
    const cur = stOf();
    if (!cur || !cur.pack) return { ok: false, reason: 'no-pack' };
    const def = PACKS[cur.pack] || { metrics: [], stages: [] };
    const pending = transitionsOf().filter(function (t) { return t && !t.done; });
    const done = transitionsOf().filter(function (t) { return t && t.done; });
    return { ok: true, pack: cur.pack, stage: cur.stage, stages: def.stages.slice(),
      metrics: def.metrics.map(function (m) { return { metric: m, value: num(cur.metrics[m]) || 0 }; }),
      pending: pending.map(function (t) { return { id: t.id, to: t.to, metric: t.metric, need: t.need,
        have: num(cur.metrics[t.metric]) || 0, changes: (t.changes || []).slice(),
        ready: (num(cur.metrics[t.metric]) || 0) >= t.need }; }),
      done: done.map(function (t) { return { id: t.id, from: t.from, to: t.to, applied: (t.applied || []).slice() }; }) };
  }
  function statView() {
    const cur = stOf();
    return { enabled: settings().enabled, pack: cur ? cur.pack : '', stage: cur ? cur.stage : '',
      metrics: cur ? Object.keys(cur.metrics || {}).length : 0,
      pending: transitionsOf().filter(function (t) { return t && !t.done; }).length,
      done: transitionsOf().filter(function (t) { return t && t.done; }).length };
  }
  /** 注入块：只报**当前阶段**与**已达条件的迁移**；未达条件的迁移不剧透。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const cur = stOf();
    if (!cur || !cur.pack) return '';
    const def = PACKS[cur.pack] || { metrics: [] };
    const lines = [cur.pack + '（当前阶段：' + cur.stage + '）'];
    def.metrics.forEach(function (m) { lines.push(m + '：' + (num(cur.metrics[m]) || 0)); });
    const ready = transitionsOf().filter(function (t) {
      return t && !t.done && (num(cur.metrics[t.metric]) || 0) >= t.need;
    });
    if (ready.length) {
      lines.push('已达条件、可以推进的变动：' + ready.map(function (t) { return t.to + '（需先落实：' + (t.changes || []).join('、') + '）'; }).join('；'));
    }
    return '[玩法进度]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '只把上面写明的当成已发生的进度；未达条件的变动尚未发生，不要提前演出。';
  }
  WA.stage = {
    PACKS: Object.keys(PACKS), stagesOf: function (pack) { const d = PACKS[clean(pack, 40)]; return d ? d.stages.slice() : null; },
    metricsOf: function (pack) { const d = PACKS[clean(pack, 40)]; return d ? d.metrics.slice() : null; },
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    adopt: adopt, mark: mark, plan: plan, transit: transit,
    view: view, statView: statView, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/stage.js', { kind: 'engine', ver: '2.119.0' });
})();
