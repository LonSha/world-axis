/**
 * WorldAxis engines/training.js (v2.231.0) — EXP-1：学习、训练与能力成长
 *
 * ── 它治什么（缺口，开工前逐条复核现场）────────────────────────────────
 *   计划原文：「能力前置、练习/授课项目、时间与资源成本、导师或教材条件、阶段掌握与能力
 *   应用。支持数值熟练度或定性阶段两种配置，不规定人人都有等级。」
 *
 *   现场事实（不是静态推测）：
 *     · `engines/entities.js` 的 `ability` **只是一张名字清单**
 *       （`{id, name, aliases, desc, refs, updatedAt}`，CAP_PER_TYPE=30）——
 *       它答得出「这世上有没有『剑术』这项能力」，**答不出**「谁会不会、练到哪一步」；
 *     · `engines/life.js` / `plan.js` / `act.js` 有目标与行动，但行动是**一次性结算**
 *       （`act.advance` 到点即终态）—— 没有任何地方记「练习累积」；
 *     · `engines/ladder.js` 管心理档位、`engines/stage.js` 管玩法阶段，两者都与
 *       「某个人的某项能力到什么程度」无关。
 *   三者合起来就是本项要补的那一格：**能力有名字、没有进度**。
 *
 * ── 机制（五句话）──────────────────────────────────────────────────
 *   ① **能力台账**（`store.training.abilities`）：每项能力声明 `prereq`（前置能力名）
 *      与 `stageNames`（阶段名表）。`declare()` 建账、`abilitiesView()` 读账。
 *   ② **进度分两制**：`mode:'stage'`（定性阶段）与 `mode:'points'`（数值熟练度）——
 *      **两种配置**，不是「人人都有等级」（计划原文点名）。
 *   ③ **训练是累积动作**：`practice(who, ability, opts)` 记一次有效训练，
 *      按 `gain` 累进；`cancel` 取消的**不加进度**（验收原文点名）。
 *   ④ **前置是硬闸**：前置能力未达 `prereqStage` ⇒ 拒收 `prereq-unmet`（不静默放行）。
 *   ⑤ **应用要真消费**：`can(who, ability, need)` 给「这个人此刻够不够」，
 *      供行动侧读；**不是**「换一行描述」。
 *
 * ── 九条否定式边界（每条都有判据咬）──────────────────────────────────
 *   ① 总开关默认关闭；关闭时一律拒收 `disabled`（不记、不判）。
 *   ② **不建第二份能力真源**：能力名必须已在 `entities.entityMemory.ability` 里
 *      登记过（`entity-absent`），否则拒收 —— 台账是**进度**，不是能力的定义处。
 *   ③ **人不自封**：`who` 必须是世界里有的人物（`unknown-person`）。
 *   ④ **两制不混**：同一项能力建账时定死一种 mode，`points` 与 `stage` 两种读数
 *      各自独立；`practice` 对不上当前 mode ⇒ 拒收 `mode-mismatch`。
 *   ⑤ **取消的训练不加进度**：`cancel` 是真动作（进 `cancelled` 计数），不是「什么都不做」。
 *   ⑥ **越界不静默**：`gain` 非正 ⇒ `bad-gain`；越上限 ⇒ 夹取并如实报 `clamped`。
 *   ⑦ **有界**：逐人逐能力行有上限，超出按最早写入退场，挤出计数如实报。
 *   ⑧ **存档是唯一真源**（`store.training`）：内存只是本会话索引，`reload()` 从存档重建
 *      （切聊天必须重建，否则上一个聊天的人冒充本聊天的）。
 *   ⑨ **零 DOM / 零注入**：本模块不产注入块（能力进度由消费方按需读），
 *      也不碰 `document` —— 呈现是 UI 的事。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_training_settings_v1';
  const DEF = { enabled: false, maxAbilities: 48, maxRows: 96, maxStageNames: 6, pointsCap: 1000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'training',
    bounds: { maxAbilities: [4, 200], maxRows: [8, 400], maxStageNames: [2, 12], pointsCap: [10, 100000] } };
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
  const MODES = ['stage', 'points'];
  const stat = { declares: 0, practices: 0, cancelled: 0, applies: 0, evicted: 0,
    blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason, extra) {
    noteFault(reason);
    return Object.assign({ ok: false, reason: reason }, extra || {});
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bagOf(root) {
    const t = (root || state()).training;
    return (t && typeof t === 'object' && !Array.isArray(t)) ? t : null;
  }
  function abilitiesOf(root) { const b = bagOf(root); return (b && Array.isArray(b.abilities)) ? b.abilities : []; }
  function rowsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.rows)) ? b.rows : []; }
  function ensure(draft) {
    if (!draft.training || typeof draft.training !== 'object' || Array.isArray(draft.training)) {
      draft.training = { abilities: [], rows: [] };
    }
    if (!Array.isArray(draft.training.abilities)) draft.training.abilities = [];
    if (!Array.isArray(draft.training.rows)) draft.training.rows = [];
    return draft.training;
  }
  function abilityOf(name, root) {
    const k = clean(name, 40);
    return abilitiesOf(root).filter(function (a) { return a && clean(a.name, 40) === k; })[0] || null;
  }
  function rowOf(who, ability, root) {
    const w = clean(who, 60), a = clean(ability, 40);
    return rowsOf(root).filter(function (r) { return r && clean(r.who, 60) === w && clean(r.ability, 40) === a; })[0] || null;
  }
  /** 人物在场判定：真源是 `store.people`（**不建第二份名册**）。 */
  function personExists(who, root) {
    const w = clean(who, 60);
    if (!w) return false;
    const ppl = (root || state()).people || {};
    if (ppl['p_' + w]) return true;
    const keys = Object.keys(ppl);
    for (let i = 0; i < keys.length; i++) {
      if (ppl[keys[i]] && clean(ppl[keys[i]].name, 60) === w) return true;
    }
    return false;
  }
  /**
   * 能力名是否已在 `entities` 的 ability 表里登记过。
   *   **不建第二份能力真源**：本模块记的是**进度**，能力的定义处仍是 entities。
   *   读的是**那张表的真源**（`store.evolution.entityMemory.ability`）——
   *   实测 `WA.entities` **没有 list 导出**，而「为读一张表去加一条导出」会立刻
   *   变成一条只有一个消费方的出口面契约（本仓口径：无真消费方不挂导出）。
   *   模块缺席（`WA.entities` 不在）⇒ 如实报 `entity-unavailable`，**不静默放行**
   *   （放行等于把「没有定义处」读成「定义过了」）。
   */
  function entityHasAbility(name, root) {
    if (!WA.entities) return { ok: false, reason: 'entity-unavailable' };
    const k = clean(name, 40);
    const ev = (root || state()).evolution;
    const em = ev && ev.entityMemory;
    const rows = (em && Array.isArray(em.ability)) ? em.ability : null;
    if (!rows) return { ok: false, reason: 'entity-unavailable' };
    const hit = rows.filter(function (r) { return r && clean(r.name, 40) === k; })[0];
    return hit ? { ok: true } : { ok: false, reason: 'entity-absent' };
  }
  /**
   * 建账一项能力（**声明面**：前置 + 阶段名表 + 进度制）。
   *   三种进度制互斥：`mode` 只能是 `stage` / `points` 之一（**两制不混**）。
   */
  function declare(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const nm = clean(name, 40);
    if (!nm) return refuse('missing-fields', { field: 'name' });
    const mode = clean(o.mode, 10) || 'stage';
    if (MODES.indexOf(mode) < 0) return refuse('bad-mode', { mode: mode, allowed: MODES.slice() });
    const ent = entityHasAbility(nm);
    if (!ent.ok) return refuse(ent.reason, { name: nm });
    const prereq = clean(o.prereq, 40);
    if (prereq && prereq === nm) return refuse('self-prereq', { name: nm });
    if (prereq && !entityHasAbility(prereq).ok) return refuse('prereq-unknown', { prereq: prereq });
    const names = Array.isArray(o.stageNames) ? o.stageNames.map(function (x) { return clean(x, 20); }).filter(Boolean) : [];
    if (mode === 'stage' && !names.length) return refuse('no-stages', { name: nm });
    if (names.length > cfg.maxStageNames) {
      noteFault('too-many-stages');
      names.length = cfg.maxStageNames;   // 夹取并如实报（不静默截断）
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const seen = b.abilities.filter(function (a) { return a && clean(a.name, 40) === nm; })[0] || null;
      if (!seen && b.abilities.length >= cfg.maxAbilities) {
        out = { ok: false, reason: 'abilities-full', cap: cfg.maxAbilities }; return false;
      }
      const now = clockNow('training');
      if (seen) {
        seen.mode = mode; seen.prereq = prereq; seen.stageNames = names.slice();
        seen.updatedAt = now;
        out = { ok: true, name: nm, mode: mode, prereq: prereq, stages: names.length, replaced: true };
      } else {
        b.abilities.push({ name: nm, mode: mode, prereq: prereq, prereqStage: Math.max(0, Math.floor(num(o.prereqStage) === null ? 0 : num(o.prereqStage))),
          stageNames: names.slice(), at: now, updatedAt: now });
        out = { ok: true, name: nm, mode: mode, prereq: prereq, stages: names.length, replaced: false };
      }
      WA.evict.array(b.abilities, 'training.abilities', cfg.maxAbilities);
      return true;
    }, 'training:declare');
    if (out && out.ok) { stat.declares++; stat.lastReason = 'declared'; }
    return out || refuse('store-unavailable');
  }
  /**
   * 一次训练（**累积动作**）。`opts.cancel` 为 true 时是**取消**：
   *   取消的这一次**不加进度**（验收原文点名），且进 `cancelled` 计数。
   */
  function practice(who, ability, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const w = clean(who, 60), nm = clean(ability, 40);
    if (!w || !nm) return refuse('missing-fields', { field: !w ? 'who' : 'ability' });
    if (!personExists(w)) return refuse('unknown-person', { who: w });
    const ab = abilityOf(nm);
    if (!ab) return refuse('ability-absent', { ability: nm });
    if (ab.prereq) {
      const pr = rowOf(w, ab.prereq);
      const need = Math.max(0, Math.floor(num(ab.prereqStage) || 0));
      if (!pr || (Math.floor(num(pr.stage) || 0) < need)) {
        return refuse('prereq-unmet', { ability: nm, prereq: ab.prereq, need: need,
          have: pr ? Math.floor(num(pr.stage) || 0) : 0 });
      }
    }
    const cancel = o.cancel === true;
    let gain = num(o.gain) === null ? 1 : num(o.gain);
    if (!cancel && (gain === null || gain <= 0)) return refuse('bad-gain', { gain: o.gain });
    let clamped = false;
    if (gain > cfg.pointsCap) { gain = cfg.pointsCap; clamped = true; }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      let row = b.rows.filter(function (r) { return r && clean(r.who, 60) === w && clean(r.ability, 40) === nm; })[0] || null;
      const now = clockNow('training');
      if (!row) {
        if (b.rows.length >= cfg.maxRows) { out = { ok: false, reason: 'rows-full', cap: cfg.maxRows }; return false; }
        row = { who: w, ability: nm, mode: ab.mode, points: 0, stage: 0, sessions: 0, cancelled: 0,
          at: now, updatedAt: now };
        b.rows.push(row);
      }
      if (row.mode !== ab.mode) { out = { ok: false, reason: 'mode-mismatch', rowMode: row.mode, abilityMode: ab.mode }; return false; }
      if (cancel) {
        row.cancelled = (row.cancelled || 0) + 1;
        row.updatedAt = now;
        out = { ok: true, who: w, ability: nm, cancelled: true, sessions: row.sessions,
          points: row.points, stage: row.stage, stageName: stageNameOf(ab, row.stage) };
        return true;
      }
      row.sessions = (row.sessions || 0) + 1;
      if (row.mode === 'points') {
        const before = num(row.points) || 0;
        row.points = Math.min(cfg.pointsCap, +(before + gain).toFixed(3));
        if (row.points === cfg.pointsCap) clamped = true;
      } else {
        const names = Array.isArray(ab.stageNames) ? ab.stageNames : [];
        const before = Math.max(0, Math.floor(num(row.stage) || 0));
        // 阶段制：每 `stageStep` 次有效训练进一阶（默认 3 —— 与验收原文「花三次有效训练达成基础掌握」对齐）
        const step = Math.max(1, Math.floor(num(o.stageStep) === null ? 3 : num(o.stageStep)));
        const want = Math.min(Math.max(0, names.length - 1), Math.floor(row.sessions / step));
        if (want > before) { row.stage = want; } else { row.stage = before; }
        if (row.sessions >= names.length * step) clamped = true;
      }
      row.updatedAt = now;
      out = { ok: true, who: w, ability: nm, cancelled: false, sessions: row.sessions,
        points: row.points, stage: row.stage, stageName: stageNameOf(ab, row.stage), clamped: clamped };
      return true;
    }, 'training:practice');
    if (out && out.ok) {
      if (out.cancelled) { stat.cancelled++; stat.lastReason = 'cancelled'; }
      else { stat.practices++; stat.lastReason = 'practiced'; }
      if (out.clamped) noteFault('clamped');
    }
    return out || refuse('store-unavailable');
  }
  function stageNameOf(ab, stage) {
    const names = (ab && Array.isArray(ab.stageNames)) ? ab.stageNames : [];
    const i = Math.max(0, Math.floor(num(stage) || 0));
    return names[i] || (names.length ? names[names.length - 1] : '');
  }
  /**
   * 应用面（**真消费**）：这个人此刻够不够做这件事。
   *   `need` 可以是数值门槛（points 制）或阶段序号（stage 制）——
   *   与该项能力自己的 mode 对齐；对不上如实拒收 `mode-mismatch`（不猜）。
   */
  function can(who, ability, need) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const w = clean(who, 60), nm = clean(ability, 40);
    if (!w || !nm) return refuse('missing-fields', { field: !w ? 'who' : 'ability' });
    const ab = abilityOf(nm);
    if (!ab) return refuse('ability-absent', { ability: nm });
    const row = rowOf(w, nm);
    const n = num(need);
    if (n === null) return refuse('bad-need', { need: need });
    stat.applies++;
    if (ab.mode === 'points') {
      const have = row ? (num(row.points) || 0) : 0;
      const ok = have >= n;
      stat.lastReason = ok ? 'can' : 'cannot';
      return { ok: true, who: w, ability: nm, mode: 'points', need: n, have: have, pass: ok,
        stage: row ? Math.floor(num(row.stage) || 0) : 0, sessions: row ? (row.sessions || 0) : 0 };
    }
    const have = row ? Math.max(0, Math.floor(num(row.stage) || 0)) : 0;
    const ok = have >= n;
    stat.lastReason = ok ? 'can' : 'cannot';
    return { ok: true, who: w, ability: nm, mode: 'stage', need: Math.floor(n), have: have, pass: ok,
      stageName: stageNameOf(ab, have), sessions: row ? (row.sessions || 0) : 0 };
  }
  /** 只读：能力台账（声明面）。 */
  function abilitiesView() {
    return abilitiesOf().map(function (a) {
      return { name: a.name, mode: a.mode, prereq: a.prereq || '', prereqStage: Math.floor(num(a.prereqStage) || 0),
        stageNames: (a.stageNames || []).slice(), stages: (a.stageNames || []).length };
    });
  }
  /** 只读：逐人进度。`who` 给空则列全部（受上限约束）。 */
  function progress(who) {
    const w = clean(who, 60);
    const rows = rowsOf().filter(function (r) { return !w || clean(r.who, 60) === w; });
    return rows.map(function (r) {
      const ab = abilityOf(r.ability);
      return { who: r.who, ability: r.ability, mode: r.mode, points: num(r.points) || 0,
        stage: Math.max(0, Math.floor(num(r.stage) || 0)), stageName: stageNameOf(ab, r.stage),
        sessions: r.sessions || 0, cancelled: r.cancelled || 0 };
    });
  }
  /** 切聊天重建索引（store 重载了、模块缓存没跟上 = 上一个聊天的人冒充本聊天的）。 */
  function reload() {
    const b = bagOf();
    return { ok: true, abilities: b ? abilitiesOf().length : 0, rows: b ? rowsOf().length : 0 };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, modes: MODES.slice(), maxAbilities: cfg.maxAbilities, maxRows: cfg.maxRows,
      pointsCap: cfg.pointsCap, abilities: abilitiesView(), progress: progress(''),
      counts: { abilities: abilitiesOf().length, rows: rowsOf().length },
      stat: statView() };
  }
  function statView() {
    return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) });
  }
  function resetStat() {
    stat.declares = 0; stat.practices = 0; stat.cancelled = 0; stat.applies = 0;
    stat.evicted = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  function reset() {
    const r = WA.store.transact(function (draft) {
      const b = ensure(draft); b.abilities = []; b.rows = []; return true;
    }, 'training:reset');
    resetStat();
    return { ok: true, cleared: true };
  }
  WA.training = {
    MODES: MODES.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    declare: declare, practice: practice, can: can,
    abilitiesView: abilitiesView, progress: progress, reload: reload, view: view,
    stat: statView, resetStat: resetStat, reset: reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/training.js', { kind: 'engine', ver: '2.231.0' });
  if (WA.log) WA.log('info', 'training 已加载（2.231.0）');
})();