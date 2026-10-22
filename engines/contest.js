/**
 * WorldAxis engines/contest.js (v2.231.0) — EXP-5：可选规则的对抗场景
 *
 * ── 它治什么（缺口，开工前逐条复核现场）──────────────────────────
 *   计划原文：「有目标、参与者、资源、阶段和退出条件的对抗：潜入、追逐、辩论、
 *   竞技或战斗。支持**对抗检定、部分成功、代价成功、撤退**；确定结果后由模型叙述
 *   表现，而非用正文反向决定所有数值。」
 *   验收原文：「追逐中选择抄近路，**付出体力换距离优势**；**部分成功保留代价**；
 *   **撤退结束场景并落实位置/资源**；**重新打开面板不重掷已确定的结果**。」
 *
 *   现场事实（不是静态推测）：
 *     · `engines/fate.js` 有 `roll` / `check` / `resolveDC` —— 它答的是**一次**掷骰
 *       与一次 DC 对比（`{roll, dc, pass, margin, crit, fumble}`），答不出
 *       「这场追逐已经跑到第三段、谁领先、还剩多少体力」；
 *     · `engines/difficulty.js` 给的是**行动成本与跨度**（resistance/stance/pace/cost/flow），
 *       是「做这件事要花多少」，不是「这件事现在走到哪一步」；
 *     · `engines/power-anchor.js` 记**战力区间**（0..5 档），是「这个人大概多强」，
 *       不是「这一回合谁占了上风」；
 *     · `engines/story-choice.js` 兑现的是**选项与 ops**（选了什么、世界怎么变），
 *       它的结果只有「兑现 / 未兑现」两态 —— 答不出「部分成功」这种**中间结果**。
 *   四者合起来仍缺的那一格：**一次判定 ≠ 一场对抗**。本模块补的就是这一层。
 *
 * ── 机制（六句话）──────────────────────────────────────────────────
 *   ① **场景跨轮**（`store.contest.scenes`）：`open()` 开一场，带参与方、轮数上限
 *      （`rounds`）与阶段表（`stages`）。一场对抗**不是一次掷骰**，是多轮多阶段。
 *   ② **对抗检定**：`stageResolve()` 一侧一掷，走 `WA.fate.check`（复用既有骰式与
 *      DC 解析，**不另建一套骰子**）。每一掷落一条台账行（`store.contest.rolls`）。
 *   ③ **三档结果**（封闭集）：按 `margin` 分档 —— `margin ≥ PARTIAL_BAND(5)` ⇒
 *      `success`；`0 ≤ margin < 5` ⇒ `partial`（**部分成功**）；`margin < 0` ⇒ `fail`。
 *      部分成功**必须带代价**：回执里点名「代价必须落实」，代价由 `spend()` 落账。
 *   ④ **代价成功**：`spend()` 把某人手里的资源（默认 `stamina`）扣进场景的 `cost`
 *      账，并换 `advantage`（距离 / 优势 / 分数）——「抄近路付出体力换距离优势」
 *      就是这一句。**先判后扣**：不够 ⇒ `short-cost`，一克都不动。
 *   ⑤ **撤退与收口**：`withdraw()` 结束场景（`withdrawn`），**已付代价不退**、
 *      已走的轮数照实保留；位置改动走**世界侧**（`world.depart`，本模块零直写）。
 *      `close()` 是正常收口（`resolved`）：按 `advantage` 定胜负并落 `winner`。
 *   ⑥ **重掷不重放**：同一个 `(场景, 阶段, 轮, 一方)` 已判定过 ⇒ `stage-resolved`
 *      拒收、零变化；给了 `opId` 时台账里已有同 opId ⇒ 同样拒收。**重新打开面板、
 *      切聊天重载之后，已确定的结果一格不动**（验收原文点名）。
 *
 * ── 十一条否定式边界（每条都有判据咬）────────────────────────────
 *   ① 总开关默认关闭；关闭时一律拒收 `disabled`。
 *   ② **不建第二套骰子**：掷骰与 DC 解析走 `WA.fate.check`（`dice-missing` 是
 *      「fate 缺席」，不是「本模块自己掷一个」）。
 *   ③ **不建第二份名册**：参与方必须是世界里的人物（`unknown-side`）。
 *   ④ **不替世界定位置**：撤退 / 收口只落**场景状态**；位置与行程改动走
 *      `world.depart` / `world.arrive`（本模块全文不写 `world.*`）。
 *   ⑤ **不预置职业表与伤害公式**：`kind` 是自由标签（`KINDS` 只是**建议清单**、
 *      不是封闭集），数值全由调用方给 —— 不同题材不必统一。本模块只保证
 *      「同一场对抗的数值前后一致」（优势与代价都记在场景行上）。
 *   ⑥ **不凭空判赢**：一场里零判定就收口 ⇒ `no-result` 拒收，不编一个结果。
 *   ⑦ **三档不合并**：`success` / `partial` / `fail` 分列，自造一个 ⇒ 拒收。
 *      「部分成功」既不是成功也不是失败 —— 合并了就没有代价可谈。
 *   ⑧ **代价不退**：撤退与收口都不退还已付资源（`cost` 照实留在场景里）。
 *   ⑨ **阶段不凭空造**：`stageResolve()` 的阶段必须先 `stageAdd()` 声明过
 *      （`no-such-stage`）—— 不许「先掷了再说这是什么阶段」。
 *   ⑩ **场景收口后不再收指令**：与「没这张场景」分列（`scene-closed` /
 *      `no-such-scene`）—— 一个「这张单不再动」、一个「没这回事」。
 *   ⑪ **存档是唯一真源**（`store.contest`）：`reload()` 从存档重建（切聊天必须重建）。
 *
 * ── 与邻近模块的分工（不是同一件事，故不合并）──────────────────
 *   · `fate`          —— 「这一掷是多少」（**判定**）；本模块只调它，不重算。
 *   · `difficulty`    —— 「这件事要花多少」（**成本档**）；本模块记的是已付的**实际**代价。
 *   · `powerAnchor`   —— 「这个人大概多强」（**区间档**）；本模块记的是**这一场**的优劣势。
 *   · `storyChoice`   —— 「选了什么、世界怎么变」（**兑现**）；本模块补的是它答不出的中间档。
 *   · `act`           —— 「他真做成了吗」（**行动回执**）；本模块是一场对抗的**过程**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_contest_settings_v1';
  const DEF = { enabled: false, maxScenes: 24, maxStages: 12, maxRounds: 20, maxRolls: 240, viewer: '' };
  const __REG = { key: LS_KEY, def: DEF, module: 'contest',
    bounds: { maxScenes: [2, 96], maxStages: [2, 40], maxRounds: [1, 60], maxRolls: [24, 960] } };
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

  // ── 场景状态（封闭集：自造一个 ⇒ 拒收）──
  const SCENE_STATUS = ['open', 'resolved', 'withdrawn'];
  const OPEN_SCENE = ['open'];
  // ── 单次检定的三档（封闭集）──
  const OUTCOMES = ['success', 'partial', 'fail'];
  // 部分成功的带宽：margin ∈ [0, PARTIAL_BAND) ⇒ partial。
  const PARTIAL_BAND = 5;
  // 建议题材清单（**不是**封闭集 —— 不同题材自己定义 kind，本模块不拒收）。
  const KINDS = ['chase', 'infiltration', 'debate', 'race', 'duel', 'custom'];

  const stat = { opened: 0, staged: 0, resolved: 0, spent: 0, advanced: 0, withdrawn: 0,
    closed: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason, extra) { noteFault(reason); return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : ''); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bagOf(root) {
    const p = (root || state()).contest;
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : null;
  }
  function scenesOf(root) { const b = bagOf(root); return (b && Array.isArray(b.scenes)) ? b.scenes : []; }
  function rollsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.rolls)) ? b.rolls : []; }
  function ensure(draft) {
    if (!draft.contest || typeof draft.contest !== 'object' || Array.isArray(draft.contest)) {
      draft.contest = { scenes: [], rolls: [] };
    }
    if (!Array.isArray(draft.contest.scenes)) draft.contest.scenes = [];
    if (!Array.isArray(draft.contest.rolls)) draft.contest.rolls = [];
    return draft.contest;
  }
  function sceneOf(id, root) {
    const k = clean(id, 60);
    if (!k) return null;
    return scenesOf(root).filter(function (s) { return s && clean(s.id, 60) === k; })[0] || null;
  }
  function stageOf(scene, name) {
    const k = clean(name, 40);
    if (!k) return null;
    return ((scene && Array.isArray(scene.stages)) ? scene.stages : [])
      .filter(function (x) { return x && clean(x.name, 40) === k; })[0] || null;
  }
  function sideOf(scene, who) {
    const k = clean(who, 60);
    if (!k) return null;
    return ((scene && Array.isArray(scene.sides)) ? scene.sides : [])
      .filter(function (x) { return x && clean(x.who, 60) === k; })[0] || null;
  }
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
  function purseOf(root, who) {
    const w = clean(who, 60);
    const pe = (root || state()).people || {};
    if (pe['p_' + w]) return pe['p_' + w].resources || null;
    let pur = null;
    Object.keys(pe).forEach(function (k) { if (pe[k] && clean(pe[k].name, 60) === w) pur = pe[k].resources; });
    return pur;
  }
  function haveOf(pur, material) { return (pur && typeof pur === 'object') ? (num(pur[material]) || 0) : 0; }
  function drawRes(pur, material, qty) {
    if (!pur || typeof pur !== 'object') return false;
    if (haveOf(pur, material) < qty) return false;
    pur[material] = +((haveOf(pur, material) - qty).toFixed(3));
    return true;
  }
  /** 一次检定的分档（**唯一的判档口**，消费方都读它）：三档不合并。 */
  function bandOf(margin) {
    const m = num(margin);
    if (m === null) return 'fail';
    if (m >= PARTIAL_BAND) return 'success';
    if (m >= 0) return 'partial';
    return 'fail';
  }
  /** 重掷判据：同一 `(场景, 阶段, 轮, 一方)` 只判一次（唯一真源是台账行）。 */
  function rollAt(sceneId, stage, round, side, root) {
    const sid = clean(sceneId, 60), st = clean(stage, 40), sd = clean(side, 60), rd = num(round);
    return rollsOf(root).filter(function (r) {
      return r && clean(r.scene, 60) === sid && clean(r.stage, 40) === st
        && num(r.round) === rd && clean(r.side, 60) === sd;
    })[0] || null;
  }

  /**
   * 开一场对抗。参与方**必须已在册**（`unknown-side`），且至少两方（`no-participants`）——
   *   「对抗」的定义就是有对手；一方独自推进那叫行动（`act`）。
   *   轮数超上限一律夹取并如实报 `clamped`（不静默）。
   */
  function open(spec, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const o = opts || {};
    const kind = clean(s.kind, 20) || 'custom';
    const title = clean(s.title, 60) || kind;
    const raw = Array.isArray(s.sides) ? s.sides : [];
    const sides = [];
    for (let i = 0; i < raw.length; i++) {
      const x = raw[i];
      const who = clean(typeof x === 'string' ? x : (x && x.who), 60);
      if (!who) continue;
      if (!personExists(who)) return refuse('unknown-side', { who: who });
      if (sides.some(function (y) { return y.who === who; })) continue;   // 同一人只列一次（不重复计优势）
      sides.push({ who: who, role: clean(x && x.role, 20) || 'side', stake: clean(x && x.stake, 40) || '' });
    }
    if (sides.length < 2) return refuse('no-participants', { have: sides.length, need: 2,
      hint: '对抗的定义就是有对手；一个人独自推进那叫行动（act），不是对抗场景' });
    let rounds = num(s.rounds) === null ? 3 : Math.floor(num(s.rounds));
    if (!(rounds >= 1)) return refuse('bad-rounds', { rounds: s.rounds });
    let clamped = false;
    if (rounds > cfg.maxRounds) { rounds = cfg.maxRounds; clamped = true; }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      if (b.scenes.length >= cfg.maxScenes) { out = { ok: false, reason: 'scenes-full', cap: cfg.maxScenes }; return false; }
      const now = clockNow('contest');
      const id = 'ct_' + now + '_' + b.scenes.length;
      const adv = {};
      sides.forEach(function (x) { adv[x.who] = 0; });
      b.scenes.push({ id: id, kind: kind, title: title, sides: sides, stages: [], round: 0,
        rounds: rounds, status: 'open', outcome: '', winner: '', advantage: adv, cost: {},
        at: now, updatedAt: now, closedAt: 0, closedBy: '', why: '' });
      WA.evict.array(b.scenes, 'contest.scenes', cfg.maxScenes);
      out = { ok: true, id: id, kind: kind, title: title,
        sides: sides.map(function (x) { return x.who; }), rounds: rounds, status: 'open',
        round: 0, clamped: clamped };
      return true;
    }, 'contest:open');
    if (out && out.ok) { stat.opened++; stat.lastReason = 'opened'; if (clamped) noteFault('clamped'); }
    return out || refuse('store-unavailable');
  }

  /** 声明一个阶段（**先声明后判定**：不许先掷了再说这是什么阶段）。 */
  function stageAdd(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const sc = sceneOf(id);
    if (!sc) return refuse('no-such-scene', { id: clean(id, 60) });
    if (OPEN_SCENE.indexOf(clean(sc.status, 12)) < 0) return refuse('scene-closed', { id: sc.id, status: sc.status });
    const name = clean(s.name, 40);
    if (!name) return refuse('missing-fields', { field: 'name' });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scenes.filter(function (x) { return x && clean(x.id, 60) === clean(sc.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-scene', id: sc.id }; return false; }
      if (OPEN_SCENE.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'scene-closed', id: row.id, status: row.status }; return false; }
      if (row.stages.length >= cfg.maxStages) {
        out = { ok: false, reason: 'scenes-full', cap: cfg.maxStages, on: 'stages' }; return false;
      }
      const now = clockNow('contest');
      const seen = row.stages.filter(function (x) { return x && clean(x.name, 40) === name; })[0] || null;
      if (seen) {
        seen.expr = clean(s.expr, 60) || seen.expr; seen.dc = (s.dc != null ? s.dc : seen.dc);
        seen.note = clean(s.note, 80); seen.updatedAt = now;
        out = { ok: true, scene: row.id, stage: name, replaced: true, dc: seen.dc };
      } else {
        row.stages.push({ name: name, expr: clean(s.expr, 60) || '', dc: (s.dc != null ? s.dc : null),
          note: clean(s.note, 80), at: now, updatedAt: now });
        out = { ok: true, scene: row.id, stage: name, replaced: false, dc: (s.dc != null ? s.dc : null) };
      }
      row.updatedAt = now;
      return true;
    }, 'contest:stage');
    if (out && out.ok) { stat.staged++; stat.lastReason = 'staged'; }
    return out || refuse('store-unavailable');
  }

  /**
   * 判定一个阶段的一侧（**对抗检定**）。走 `WA.fate.check`（复用骰式与 DC 解析）。
   *   三档结果由 `bandOf(margin)` 给出；部分成功在回执里点名「代价必须落实」。
   *   **重掷不重放**：同 `(阶段, 轮, 一方)` 已判定 ⇒ `stage-resolved`（零变化）。
   */
  function stageResolve(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (!WA.fate || typeof WA.fate.check !== 'function') {
      return refuse('dice-missing', { hint: '本模块复用 fate 的骰式与 DC 解析，不另建一套骰子' });
    }
    const s = spec || {};
    const sc = sceneOf(id);
    if (!sc) return refuse('no-such-scene', { id: clean(id, 60) });
    if (OPEN_SCENE.indexOf(clean(sc.status, 12)) < 0) return refuse('scene-closed', { id: sc.id, status: sc.status });
    const stageName = clean(s.stage, 40);
    if (!stageName) return refuse('missing-fields', { field: 'stage' });
    const st = stageOf(sc, stageName);
    if (!st) return refuse('no-such-stage', { scene: sc.id, stage: stageName,
      declared: (sc.stages || []).map(function (x) { return x.name; }) });
    const who = clean(s.side || s.who, 60);
    if (!who) return refuse('missing-fields', { field: 'side' });
    if (!sideOf(sc, who)) return refuse('unknown-side', { who: who,
      sides: (sc.sides || []).map(function (x) { return x.who; }) });
    let round = num(s.round) === null ? (num(sc.round) || 0) + 1 : Math.floor(num(s.round));
    if (!(round >= 1)) return refuse('bad-rounds', { round: s.round });
    if (round > (num(sc.rounds) || 1)) return refuse('bad-rounds', { round: round, max: num(sc.rounds) || 1 });
    // ── 重掷闸（两道：位置判据 + opId 判据）──
    const dup = rollAt(sc.id, stageName, round, who);
    if (dup) {
      return refuse('stage-resolved', { scene: sc.id, stage: stageName, round: round, side: who,
        outcome: dup.outcome, roll: dup.roll,
        hint: '这一格已经判过了 —— 重新打开面板 / 切聊天重载都不重掷' });
    }
    const opId = clean(s.opId, 60);
    if (opId) {
      const byOp = rollsOf().filter(function (r) { return r && clean(r.opId, 60) === opId; })[0] || null;
      if (byOp) {
        return refuse('stage-resolved', { opId: opId, scene: byOp.scene, stage: byOp.stage,
          hint: '同一个 opId 不重掷（与 events / act 的 duplicate-receipt 同口径）' });
      }
    }
    const expr = clean(s.expr, 60) || clean(st.expr, 60) || '1d20';
    const dc = (s.dc != null ? s.dc : st.dc);
    const chk = WA.fate.check({ expr: expr, dc: dc, direction: 'high' });
    if (!chk.ok) { noteFault(chk.reason); return { ok: false, reason: chk.reason, scene: sc.id, stage: stageName }; }
    const outcome = bandOf(chk.margin);
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scenes.filter(function (x) { return x && clean(x.id, 60) === clean(sc.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-scene', id: sc.id }; return false; }
      if (OPEN_SCENE.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'scene-closed', id: row.id, status: row.status }; return false; }
      const now = clockNow('contest');
      const rid = 'rl_' + now + '_' + b.rolls.length;
      const line = { id: rid, scene: row.id, stage: stageName, round: round, side: who,
        expr: chk.expr || expr, roll: chk.roll, dc: chk.dc, margin: chk.margin, outcome: outcome,
        crit: !!chk.crit, fumble: !!chk.fumble, opId: opId, costPending: outcome === 'partial', at: now };
      b.rolls.push(line);
      WA.evict.array(b.rolls, 'contest.rolls', cfg.maxRolls);
      // 优势：干净成功 +1 / 部分成功 0 / 失败 −1（方向与大小由调用方按题材读 advantageOf 决定）。
      const delta = outcome === 'success' ? 1 : (outcome === 'fail' ? -1 : 0);
      if (!row.advantage || typeof row.advantage !== 'object') row.advantage = {};
      row.advantage[who] = (num(row.advantage[who]) || 0) + delta;
      row.round = Math.max(num(row.round) || 0, round);
      row.updatedAt = now;
      out = { ok: true, id: rid, scene: row.id, stage: stageName, round: round, side: who,
        expr: line.expr, roll: line.roll, dc: line.dc, margin: line.margin, outcome: outcome,
        crit: line.crit, fumble: line.fumble, advantage: row.advantage[who],
        note: outcome === 'partial'
          ? '部分成功 —— 代价必须落实（不给代价就是白拿；用 spend() 记）'
          : (outcome === 'success' ? '干净成功（优势 +1）' : '失败（优势 −1）') };
      return true;
    }, 'contest:resolve');
    if (out && out.ok) { stat.resolved++; stat.lastReason = outcome; }
    return out || refuse('store-unavailable');
  }

  /**
   * 付代价换优势（**代价成功**：「抄近路付出体力换距离优势」）。
   *   **先判后扣**：手里不够 ⇒ `short-cost`，一克都不动。
   *   代价与优势都记在场景行上；撤退 / 收口**都不退**（不假装没发生）。
   */
  function spend(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const sc = sceneOf(id);
    if (!sc) return refuse('no-such-scene', { id: clean(id, 60) });
    if (OPEN_SCENE.indexOf(clean(sc.status, 12)) < 0) return refuse('scene-closed', { id: sc.id, status: sc.status });
    const who = clean(s.side || s.who, 60);
    if (!who) return refuse('missing-fields', { field: 'side' });
    if (!sideOf(sc, who)) return refuse('unknown-side', { who: who });
    const material = clean(s.material, 20) || 'stamina';
    const amount = num(s.amount) === null ? 1 : num(s.amount);
    if (!(amount > 0)) return refuse('missing-fields', { field: 'amount' });
    const gain = num(s.gain) === null ? 1 : Math.floor(num(s.gain));
    if (!(gain >= 0)) return refuse('missing-fields', { field: 'gain' });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scenes.filter(function (x) { return x && clean(x.id, 60) === clean(sc.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-scene', id: sc.id }; return false; }
      if (OPEN_SCENE.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'scene-closed', id: row.id, status: row.status }; return false; }
      const pur = purseOf(draft, who);
      if (haveOf(pur, material) < amount) {
        out = { ok: false, reason: 'short-cost', side: who, material: material,
          need: amount, have: haveOf(pur, material) }; return false;
      }
      drawRes(pur, material, amount);
      const now = clockNow('contest');
      if (!row.cost || typeof row.cost !== 'object') row.cost = {};
      row.cost[who] = row.cost[who] || {};
      row.cost[who][material] = +(((num(row.cost[who][material]) || 0) + amount).toFixed(3));
      if (!row.advantage || typeof row.advantage !== 'object') row.advantage = {};
      row.advantage[who] = (num(row.advantage[who]) || 0) + gain;
      row.updatedAt = now;
      out = { ok: true, scene: row.id, side: who, material: material, amount: amount, gain: gain,
        advantage: row.advantage[who], left: haveOf(pur, material),
        note: '代价已付、优势已记 —— 撤退或收口都不退（不假装没发生）' };
      return true;
    }, 'contest:spend');
    if (out && out.ok) { stat.spent++; stat.lastReason = 'spent'; }
    return out || refuse('store-unavailable');
  }

  /** 推进一轮（轮次上限内 +1；到顶如实返回 `changed:false`，不静默绕回去）。 */
  function advanceRound(id) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const sc = sceneOf(id);
    if (!sc) return refuse('no-such-scene', { id: clean(id, 60) });
    if (OPEN_SCENE.indexOf(clean(sc.status, 12)) < 0) return refuse('scene-closed', { id: sc.id, status: sc.status });
    const max = num(sc.rounds) || 1;
    const cur = num(sc.round) || 0;
    if (cur >= max) {
      return { ok: true, scene: sc.id, round: cur, rounds: max, changed: false,
        note: '已到轮数上限 —— 要接着打就开新的一场（不静默绕回第 1 轮）' };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scenes.filter(function (x) { return x && clean(x.id, 60) === clean(sc.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-scene', id: sc.id }; return false; }
      if (OPEN_SCENE.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'scene-closed', id: row.id, status: row.status }; return false; }
      row.round = (num(row.round) || 0) + 1;
      row.updatedAt = clockNow('contest');
      out = { ok: true, scene: row.id, round: row.round, rounds: num(row.rounds) || 1, changed: true };
      return true;
    }, 'contest:round');
    if (out && out.ok) { stat.advanced++; stat.lastReason = 'advanced'; }
    return out || refuse('store-unavailable');
  }

  /**
   * 撤退（**结束场景并落实位置/资源**）：场景转 `withdrawn`。
   *   已付代价**不退**、已走的轮数照实保留（回执里都带出来）；
   *   位置改动由**世界侧**落实（`world.depart`），本模块不瞬移。
   */
  function withdraw(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const sc = sceneOf(id);
    if (!sc) return refuse('no-such-scene', { id: clean(id, 60) });
    if (OPEN_SCENE.indexOf(clean(sc.status, 12)) < 0) return refuse('scene-closed', { id: sc.id, status: sc.status });
    const who = clean(s.side || s.who, 60);
    if (!who) return refuse('missing-fields', { field: 'side' });
    if (!sideOf(sc, who)) return refuse('unknown-side', { who: who });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scenes.filter(function (x) { return x && clean(x.id, 60) === clean(sc.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-scene', id: sc.id }; return false; }
      if (OPEN_SCENE.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'scene-closed', id: row.id, status: row.status }; return false; }
      const now = clockNow('contest');
      row.status = 'withdrawn';
      row.outcome = 'withdrawn';
      row.winner = '';
      row.closedBy = who;
      row.why = clean(s.why, 60) || 'withdrawn';
      row.closedAt = now;
      row.updatedAt = now;
      out = { ok: true, scene: row.id, side: who, status: 'withdrawn', outcome: 'withdrawn',
        round: num(row.round) || 0, rounds: num(row.rounds) || 1,
        cost: JSON.parse(JSON.stringify(row.cost || {})),
        advantage: JSON.parse(JSON.stringify(row.advantage || {})),
        resolved: rollsOf(draft).filter(function (r) { return r && clean(r.scene, 60) === row.id; }).length,
        note: '已付代价不退、已走的轮数照实保留；位置改动走 world.depart（本模块不瞬移）' };
      return true;
    }, 'contest:withdraw');
    if (out && out.ok) { stat.withdrawn++; stat.lastReason = 'withdrawn'; }
    return out || refuse('store-unavailable');
  }

  /**
   * 收口（正常结束）：按 `advantage` 定胜负并落 `winner`（并列 ⇒ `平局`）。
   *   **不凭空判赢**：一场里零判定 ⇒ `no-result` 拒收。
   */
  function close(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const sc = sceneOf(id);
    if (!sc) return refuse('no-such-scene', { id: clean(id, 60) });
    if (OPEN_SCENE.indexOf(clean(sc.status, 12)) < 0) return refuse('scene-closed', { id: sc.id, status: sc.status });
    const mine = rollsOf().filter(function (r) { return r && clean(r.scene, 60) === clean(sc.id, 60); });
    if (!mine.length) {
      return refuse('no-verdict', { scene: sc.id,
        hint: '一场里一条判定都没有 ⇒ 不编结果（要么先 stageResolve，要么用 withdraw 结束）' });
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scenes.filter(function (x) { return x && clean(x.id, 60) === clean(sc.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-scene', id: sc.id }; return false; }
      if (OPEN_SCENE.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'scene-closed', id: row.id, status: row.status }; return false; }
      const names = (row.sides || []).map(function (x) { return clean(x.who, 60); });
      let best = -Infinity, winner = '', tie = false;
      names.forEach(function (n) {
        const v = num((row.advantage || {})[n]) || 0;
        if (v > best) { best = v; winner = n; tie = false; }
        else if (v === best) { tie = true; }
      });
      const now = clockNow('contest');
      row.status = 'resolved';
      row.outcome = 'resolved';
      row.winner = tie ? '平局' : winner;
      row.closedBy = clean(s.by, 60) || 'close';
      row.why = clean(s.why, 60) || '';
      row.closedAt = now;
      row.updatedAt = now;
      out = { ok: true, scene: row.id, status: 'resolved', outcome: 'resolved',
        winner: row.winner, tie: tie, round: num(row.round) || 0, rounds: num(row.rounds) || 1,
        advantage: JSON.parse(JSON.stringify(row.advantage || {})),
        cost: JSON.parse(JSON.stringify(row.cost || {})),
        resolved: mine.length,
        note: '结果由数值定（advantage）—— 正文叙述表现，不反过来改数值' };
      return true;
    }, 'contest:close');
    if (out && out.ok) { stat.closed++; stat.lastReason = 'closed'; }
    return out || refuse('store-unavailable');
  }

  // ── 只读口 ──
  function advantageOf(id) {
    const sc = sceneOf(id);
    if (!sc) return { ok: false, reason: 'no-such-scene', id: clean(id, 60) };
    return { ok: true, scene: sc.id, advantage: JSON.parse(JSON.stringify(sc.advantage || {})),
      cost: JSON.parse(JSON.stringify(sc.cost || {})), round: num(sc.round) || 0,
      rounds: num(sc.rounds) || 1, status: clean(sc.status, 12) };
  }
  function outcomeOf(id) {
    const sc = sceneOf(id);
    if (!sc) return { ok: false, reason: 'no-such-scene', id: clean(id, 60) };
    return { ok: true, scene: sc.id, status: clean(sc.status, 12), outcome: clean(sc.outcome, 12),
      winner: clean(sc.winner, 60), closedBy: clean(sc.closedBy, 60), why: clean(sc.why, 60),
      open: OPEN_SCENE.indexOf(clean(sc.status, 12)) >= 0 };
  }
  function rolls(id) {
    const k = clean(id, 60);
    return rollsOf().filter(function (r) { return r && clean(r.scene, 60) === k; })
      .map(function (r) {
        return { id: r.id, stage: r.stage, round: num(r.round) || 0, side: r.side, expr: r.expr,
          roll: num(r.roll) || 0, dc: num(r.dc) || 0, margin: num(r.margin) || 0,
          outcome: r.outcome, crit: !!r.crit, fumble: !!r.fumble, costPending: !!r.costPending };
      });
  }
  function list(filter) {
    const f = filter || {};
    const st = clean(f.status, 12), who = clean(f.who, 60);
    return scenesOf().filter(function (x) {
      if (!x) return false;
      if (st && clean(x.status, 12) !== st) return false;
      if (who && !sideOf(x, who)) return false;
      return true;
    }).map(function (x) {
      return { id: x.id, kind: x.kind, title: x.title, sides: (x.sides || []).map(function (y) { return y.who; }),
        status: x.status || '', outcome: x.outcome || '', winner: x.winner || '',
        round: num(x.round) || 0, rounds: num(x.rounds) || 1,
        stages: (x.stages || []).length, advantage: Object.assign({}, x.advantage || {}),
        cost: JSON.parse(JSON.stringify(x.cost || {})) };
    });
  }
  function reload() {
    const b = bagOf();
    return { ok: true, scenes: b ? scenesOf().length : 0, rolls: b ? rollsOf().length : 0 };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, kinds: KINDS.slice(), statuses: SCENE_STATUS.slice(),
      outcomes: OUTCOMES.slice(), partialBand: PARTIAL_BAND,
      maxScenes: cfg.maxScenes, maxStages: cfg.maxStages, maxRounds: cfg.maxRounds,
      maxRolls: cfg.maxRolls, viewer: cfg.viewer || '',
      scenes: list({}),
      counts: { scenes: scenesOf().length, rolls: rollsOf().length,
        open: scenesOf().filter(function (x) { return x && OPEN_SCENE.indexOf(clean(x.status, 12)) >= 0; }).length,
        resolved: scenesOf().filter(function (x) { return x && clean(x.status, 12) === 'resolved'; }).length,
        withdrawn: scenesOf().filter(function (x) { return x && clean(x.status, 12) === 'withdrawn'; }).length },
      stat: statView() };
  }
  function statView() { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  function resetStat() {
    stat.opened = 0; stat.staged = 0; stat.resolved = 0; stat.spent = 0; stat.advanced = 0;
    stat.withdrawn = 0; stat.closed = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  function reset() {
    WA.store.transact(function (draft) { const b = ensure(draft); b.scenes = []; b.rolls = []; return true; }, 'contest:reset');
    resetStat();
    return { ok: true, cleared: true };
  }

  /**
   * 注入块：**只有指定了观察者才产**（`viewer` 为空 ⇒ 返回空串），且**只列他参与的场次**。
   *
   *   两道闸（纵深防御，与 survey.buildBlock 同规）：
   *     · 第一道：无观察者 ⇒ 零 token（绝不产出全知版战报）；
   *     · 第二道：他没有参与任何一场 ⇒ 仍是零 token（不靠「别人在打」把块撑起来）。
   *   口径：
   *     · 已判定的结果**列出来并点名「不得重掷」**（验收原文：重新打开面板不重掷）；
   *     · 部分成功的行**点名「代价必须落实」**（验收原文：部分成功保留代价）；
   *     · 撤退 / 收口**点名「已付代价不退、位置由世界侧落实」**（验收原文）。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const viewer = clean(cfg.viewer, 60);
    if (!viewer) return '';   // 无观察者 ⇒ 零 token（绝不产出全知版战报）
    const all = scenesOf().filter(function (s) { return s && sideOf(s, viewer); });
    if (!all.length) return '';   // 没参与任何一场 ⇒ 仍是零 token
    const open = all.filter(function (s) { return OPEN_SCENE.indexOf(clean(s.status, 12)) >= 0; });
    const done = all.filter(function (s) { return OPEN_SCENE.indexOf(clean(s.status, 12)) < 0; });
    const lines = [];
    open.forEach(function (s) {
      const mine = rolls(s.id).filter(function (r) { return clean(r.side, 60) === viewer; });
      const adv = num((s.advantage || {})[viewer]) || 0;
      const cost = (s.cost || {})[viewer] || {};
      const costTxt = Object.keys(cost).map(function (k) { return k + '×' + cost[k]; }).join('、') || '无';
      lines.push('· 你在进行中的对抗：' + clean(s.title, 60) + '（' + clean(s.kind, 20) + '，第 '
        + (num(s.round) || 0) + '/' + (num(s.rounds) || 1) + ' 轮）—— 阶段 ' + (s.stages || []).length
        + ' 个、你已判定 ' + mine.length + ' 条；你的优势 ' + adv + '，已付代价 ' + costTxt + '。');
      const pending = mine.filter(function (r) { return r.costPending; });
      if (pending.length) {
        lines.push('· **部分成功必须落实代价**：' + pending.map(function (r) {
          return clean(r.stage, 40) + '（第 ' + r.round + ' 轮，margin ' + r.margin + '）';
        }).join('、') + ' —— 没记代价就是白拿。');
      }
    });
    if (open.length) {
      lines.push('· 已判定的结果**不得重掷**（同阶段同轮同一方只判一次）；撤退或收口都**不退还已付代价**。');
      lines.push('· 位置与行程改动由世界侧落实（`world.depart`）—— 对抗结果不得被写成瞬移。');
    }
    done.forEach(function (s) {
      const who = clean(s.winner, 60);
      lines.push('· 已结束的对抗：' + clean(s.title, 60) + '（' + clean(s.status, 12)
        + (who ? '，' + who : '') + (s.why ? '，' + clean(s.why, 60) : '') + '）。');
    });
    return '[对抗场景]\n' + lines.join('\n') + '\n';
  }

  WA.contest = {
    KINDS: KINDS.slice(), STATUSES: SCENE_STATUS.slice(), OUTCOMES: OUTCOMES.slice(),
    PARTIAL_BAND: PARTIAL_BAND,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    open: open, stageAdd: stageAdd, stageResolve: stageResolve, spend: spend,
    advanceRound: advanceRound, withdraw: withdraw, close: close,
    sceneOf: function (id) {
      const s = sceneOf(id);
      return s ? { ok: true, id: s.id, kind: s.kind, title: s.title,
        sides: (s.sides || []).map(function (x) { return x.who; }), status: s.status,
        round: num(s.round) || 0, rounds: num(s.rounds) || 1, stages: (s.stages || []).length }
        : { ok: false, reason: 'no-such-scene', id: clean(id, 60) };
    },
    stageOf: function (id, name) {
      const st = stageOf(sceneOf(id), name);
      return st ? { ok: true, name: st.name, expr: st.expr, dc: st.dc, note: st.note }
        : { ok: false, reason: 'no-such-stage', stage: clean(name, 40) };
    },
    rolls: rolls, advantageOf: advantageOf, outcomeOf: outcomeOf,
    list: list, reload: reload, view: view, buildBlock: buildBlock,
    stat: statView, resetStat: resetStat, reset: reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/contest.js', { kind: 'engine', ver: '2.231.0' });
  if (WA.log) WA.log('info', 'contest 已加载（2.231.0）');
})();