/**
 * WorldAxis engines/campaign.js (v2.187.0) — E4 场景 / 战役层（目标、阶段、结束条件）
 *
 * ── 它治什么（缺口，计划原文）──────────────────────────────────
 *   「世界能自转，但**一局游戏没有目标与阶段**」。现场确实如此：
 *   `world-blueprint` 有场景模板（`SCENES`：blank / cold-open / market-day）与保留层级，
 *   `rehearsal` 有偏离策略，`difficulty` 有难度，`story-choice` 有选择点 ——
 *   四件都齐，但**没有任何东西回答「这一局现在该干什么、还差什么才算过关」**。
 *
 * ── 本模块只做一件事：把「目标 / 阶段 / 结束条件」变成**可机械判定的读数** ──
 *   选一个场景模板（复用 `worldBlueprint.SCENES` 的 id，**不另立第二套模板**）⇒
 *   得到一组**阶段**，每阶段的进阶段判据是**引用既有世界事实的谓词**：
 *     · `diplomacy-state` —— 某两势力达到某档外交状态（读 `diplomacy.pairView`）
 *     · `freight-arrived` —— 某条在途货运抵达（读 `freight.view` 的 status）
 *     · `relation-tier`   —— 某对势力关系达档（读 `factionGraph.edgeOf`）
 *     · `day-reached`     —— 世界天数达到 N（读 store 的 `clock.dayIndex`）
 *   谓词**只读**既有引擎的公开读口；本模块自己**不判任何剧情语义**。
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────────
 *   1 默认关（enabled:false）。
 *   2 **只登记目标与阶段判定，不新增世界机制**：不写别人的键；自有进度只落**单一键**
 *      `campaign`（骨架已声明）。
 *   3 **判据必须由既有世界状态机械判定**，不由 AI 文本裁定 —— 本模块没有「文本判定」这条路。
 *   4 **不为「有进度」而伪造完成**：谓词读不到时报 `unreadable` 且**阶段不前进**
 *      （不是 false，也不是 true —— 未知不得当代替）。
 *   5 **结束不自动清空世界**：达成结束条件只记 `finished` + 复盘，开新局是玩家的动作。
 *   6 不重复蓝图场景模板：模板 id 直接读 `worldBlueprint.SCENES`，没装蓝图就**如实报缺席**。
 *   7 阶段**不得跳级**：前一阶段未成时，后一阶段即便谓词为真也不计（顺序是阶段的本义）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_campaign_settings_v1';
  const DEF = { enabled: false, stageCap: 12, logCap: 24, planCap: 6 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'campaign',
    bounds: { stageCap: [3, 24], logCap: [4, 64], planCap: [1, 12] }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    if (WA.settingsBus) return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
    return Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }

  // ── 谓词表：**唯一的世界事实读取面**（每条都必须能由既有引擎的公开读口复算）──
  //   `ok:false` = **读不到**（引擎缺席 / 参数非法）。它与 `met:false` 是两件事：
  //   前者既不得当前进依据，也不得当「没达成」（边界 4）。
  const PREDICATES = {
    'diplomacy-state': {
      label: '外交状态达档',
      eval: function (p) {
        const D = WA.diplomacy;
        if (!D || typeof D.pairView !== 'function') return { ok: false, why: 'diplomacy-absent' };
        const v = D.pairView(p.a, p.b);
        if (!v || v.ok === false) return { ok: false, why: (v && v.reason) || 'diplomacy-unreadable' };
        const cur = v.state || v.status || null;
        if (cur === null) return { ok: false, why: 'diplomacy-no-state' };
        // 「达档」= 已进入 accord / alliance 一族。cold / hostile **不是「更好」**，
        //   把任一档都当成「达档」会让「结了盟」与「打起来了」在判据上长得一样。
        const good = (cur === 'accord' || cur === 'alliance');
        return { ok: true, met: good && cur === p.state, reading: cur, why: good ? 'in-accord' : 'not-in-accord' };
      }
    },
    'freight-arrived': {
      label: '货运抵达',
      eval: function (p) {
        const F = WA.freight;
        if (!F || typeof F.view !== 'function') return { ok: false, why: 'freight-absent' };
        const v = F.view(p.id);
        if (!v || v.ok === false) return { ok: false, why: (v && v.reason) || 'freight-unreadable' };
        return { ok: true, met: v.status === 'arrived', reading: v.status, why: 'status:' + v.status };
      }
    },
    'relation-tier': {
      label: '势力关系达档',
      eval: function (p) {
        const G = WA.factionGraph;
        if (!G || typeof G.edgeOf !== 'function') return { ok: false, why: 'factionGraph-absent' };
        const e = G.edgeOf(p.a, p.b);
        if (!e || e.ok === false) return { ok: false, why: (e && e.reason) || 'factionGraph-unreadable' };
        const tier = (e.edge && (e.edge.tier || e.edge.rel)) || null;
        if (tier === null) return { ok: false, why: 'edge-no-tier' };
        return { ok: true, met: String(tier) === String(p.tier), reading: String(tier), why: 'tier:' + tier };
      }
    },
    'day-reached': {
      label: '世界天数达标',
      // 【字段名必须来自骨架，不许凭印象写】初版这里读的是 clock 下的一个「回合」字段 ——
      //   而 clock 块**只有** { iso, label, dayIndex, source }（store 骨架第 43 行），
      //   那个字段并不存在 ⇒ 这条谓词**恒 unreadable**；而「恒不可读」在面板上与
      //   「引擎没装」同形 —— 本模块最要紧的那条区分（读不到 / 未达成）当场失效。
      //   本谓词要的是**世界时间推进**，故读 dayIndex（真实存在，就是「第几天」）。
      eval: function (p) {
        let d = null;
        try { d = (WA.store && WA.store.read) ? WA.store.read('clock.dayIndex') : null; } catch (e) { d = null; }
        if (typeof d !== 'number' || !isFinite(d)) return { ok: false, why: 'clock-unreadable' };
        const want = Number(p.day);
        if (!isFinite(want)) return { ok: false, why: 'bad-day-arg' };
        return { ok: true, met: d >= want, reading: d, why: 'day:' + d + '/' + want };
      }
    }
  };
  const PREDICATE_IDS = Object.keys(PREDICATES);

  /** 场景模板 —— **读蓝图真源**，不自带第二份（边界 6）。 */
  function templates() {
    const B = WA.worldBlueprint;
    if (!B || !Array.isArray(B.SCENES)) return { ok: false, reason: 'blueprint-absent', scenes: [] };
    return {
      ok: true,
      scenes: B.SCENES.map(function (s) { return { id: s.id, label: s.label, note: s.note }; })
    };
  }

  // ── 场景 id → 阶段表（**登记，不是新增机制**）────────────────────
  //   每阶段一条谓词；顺序即本义（不得跳级，边界 7）。
  //   blank 刻意只有一条「读得到轮次」的阶段 —— 空白开局本来就没有目标，
  //   为它编一条剧情目标是「为了有进度而编目标」，正是边界 4 禁止的。
  const PLANS = {
    blank: [
      { id: 'p1', label: '开局设定', goal: '世界天数到 1（把世界时间推起来）', pred: { kind: 'day-reached', day: 1 } },
      // 【为什么有两阶段】一局至少要有「起步」与「稳定推进」两步，阶段这个概念才立得住 ——
      //   单阶段时「跳级」与「结束后清空世界」这两条边界**在行为上不可观测**（负控制实测）。
      //   两条判据都读同一个真实字段（时钟天序），不新增任何机制。
      { id: 'p2', label: '稳定推进', goal: '世界天数到 3（世界确实在往前走）', pred: { kind: 'day-reached', day: 3 } }
    ],
    'cold-open': [
      { id: 'p1', label: '接触', goal: '让事件里的两方达成协议（外交状态 accord）', pred: { kind: 'diplomacy-state', a: '', b: '', state: 'accord' } }
    ],
    'market-day': [
      { id: 'p1', label: '集散', goal: '指定的一条货运抵达', pred: { kind: 'freight-arrived', id: '' } }
    ]
  };
  /** 需要玩家填的参数（本模块**不猜世界里的名字**：猜一个势力名 = 凭空造一个世界事实，
   *  那是本仓最贵的一类默认值）。参数存在自有设置里，键 `argA` / `argB` / `argId`。 */
  const PARAM_KEYS = { 'diplomacy-state': ['a', 'b'], 'freight-arrived': ['id'], 'relation-tier': ['a', 'b'] };

  // ── N1：可编辑战役层（v2.218.0）──────────────────────────────
  //   玩家可以把「目标 / 阶段 / 结束条件」**存成自己的计划**。计划是纯登记：
  //   阶段判据仍走既有 PREDICATES（不新增谓词面），自有进度仍只写 `campaign` 键下
  //   的 `plans` 子结构 —— **不新增第二条世界键**（E4 边界 2 同规）。
  //
  //   每个阶段可比模板多三个可选字段（全部**读既有世界事实**，不引入 AI 裁定）：
  //     · optional:true —— 可选目标：未成不阻塞主线结束（跳级判定只约束主线阶段）；
  //     · reward:N —— 阶段奖励：阶段达成时记入 `bonus` 累计与 `bonusLog`（自有键内账本）；
  //     · failWhen:{kind,...} —— 失败条件：该条件满足即战役失败终态（failed:true + 复盘），
  //       与「未达成」是两件事（达成主线结束 ≠ 触发失败）；
  //     · branchFrom:阶段id + branchCond:{kind,...} —— 分支：主线阶段推进后，若分支条件
  //       满足则跳到其目标阶段（不违反「一次只走一格」：分支只在推进**时**判定一次）。
  const PLAN_MAX_STAGES = 12;
  const KNOWN_KINDS = PREDICATE_IDS;              // 只认既有四类谓词
  const FILTER_KEYS = ['label', 'goal', 'id', 'reason']; // 文本清洗白名单
  // day-reached 的参数是**数值**（天数），必须与字符串参数分开校验 ——
  //   混在 PARAM_KEYS 里会让清洗只保留字符串、把 day 丢掉（实测恒 bad-day-arg）。
  const NUM_KEYS = { 'day-reached': ['day'] };
  function cleanText(v, max) { return clean(v, max || 80); }
  /** 一条谓词参数的机械校验（对照 PARAM_KEYS 的参数面）。 */
  function validPred(pred) {
    if (!pred || typeof pred !== 'object') return false;
    const kind = pred.kind;
    if (KNOWN_KINDS.indexOf(kind) < 0) return false;
    const keys = PARAM_KEYS[kind] || [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = pred[k];
      if (typeof v !== 'string' || v === '') return false;
    }
    const nk = NUM_KEYS[kind] || [];
    for (let i = 0; i < nk.length; i++) {
      const nv = pred[nk[i]];
      if (!(typeof nv === 'number' && isFinite(nv) && nv >= 0)) return false;
    }
    return true;
  }
  /** 计划整体机械校验（返回 null 或原因）。 */
  function validPlan(plan) {
    if (!plan || typeof plan !== 'object') return 'not-object';
    if (typeof plan.id !== 'string' || !plan.id || plan.id.length > 24) return 'bad-id';
    if (!Array.isArray(plan.stages) || plan.stages.length < 1) return 'no-stages';
    if (plan.stages.length > PLAN_MAX_STAGES) return 'too-many-stages';
    for (let i = 0; i < plan.stages.length; i++) {
      const st = plan.stages[i];
      if (!st || typeof st !== 'object') return 'bad-stage';
      if (typeof st.id !== 'string' || !st.id || st.id.length > 24) return 'bad-stage-id';
      if (typeof st.label !== 'string' || !st.label) return 'bad-label';
      if (typeof st.goal !== 'string' || !st.goal) return 'bad-goal';
      if (!validPred(st.pred)) return 'bad-pred:' + i;
      if (st.optional !== undefined && typeof st.optional !== 'boolean') return 'bad-optional:' + i;
      if (st.reward !== undefined && !(typeof st.reward === 'number' && isFinite(st.reward) && st.reward >= 0 && st.reward <= 1e6)) return 'bad-reward:' + i;
        if (st.failWhen !== undefined && !validPred(st.failWhen)) return 'bad-failWhen:' + i;
      if (st.branchFrom !== undefined && (typeof st.branchFrom !== 'string' || !st.branchFrom)) return 'bad-branchFrom:' + i;
      if (st.branchCond !== undefined && !validPred(st.branchCond)) return 'bad-branchCond:' + i;
    }
    // branchFrom 必须是本计划内存在的阶段
    for (let i = 0; i < plan.stages.length; i++) {
      const st = plan.stages[i];
      if (st.branchFrom) {
        const hit = plan.stages.some(function (x) { return x.id === st.branchFrom; });
        if (!hit) return 'bad-branchTarget';
        if (st.branchCond) { /* 已由 validPred 校验 */ }
      }
    }
    return null;
  }
  function sanitizeStage(st) {
    const out = { id: clean(st.id, 24), label: cleanText(st.label, 80), goal: cleanText(st.goal, 160) };
    out.pred = {};
    const kind = st.pred && st.pred.kind;
    out.pred.kind = kind;
    (PARAM_KEYS[kind] || []).forEach(function (k) { out.pred[k] = cleanText(st.pred[k], 60); });
    (NUM_KEYS[kind] || []).forEach(function (k) {
      const nv = st.pred[k];
      if (typeof nv === 'number' && isFinite(nv)) out.pred[k] = Math.max(0, Math.floor(nv));
    });
    if (st.optional !== undefined) out.optional = !!st.optional;
    if (st.reward !== undefined && typeof st.reward === 'number' && isFinite(st.reward)) out.reward = Math.max(0, Math.min(1e6, st.reward));
    if (st.failWhen !== undefined && st.failWhen && typeof st.failWhen === 'object') {
      out.failWhen = { kind: st.failWhen.kind };
      (PARAM_KEYS[st.failWhen.kind] || []).forEach(function (k) { out.failWhen[k] = cleanText(st.failWhen[k], 60); });
      (NUM_KEYS[st.failWhen.kind] || []).forEach(function (k) {
        const nv = st.failWhen[k];
        if (typeof nv === 'number' && isFinite(nv)) out.failWhen[k] = Math.max(0, Math.floor(nv));
      });
    }
    if (st.branchFrom !== undefined) out.branchFrom = clean(st.branchFrom, 24);
    if (st.branchCond !== undefined && st.branchCond && typeof st.branchCond === 'object') {
      out.branchCond = { kind: st.branchCond.kind };
      (PARAM_KEYS[st.branchCond.kind] || []).forEach(function (k) { out.branchCond[k] = cleanText(st.branchCond[k], 60); });
      (NUM_KEYS[st.branchCond.kind] || []).forEach(function (k) {
        const nv = st.branchCond[k];
        if (typeof nv === 'number' && isFinite(nv)) out.branchCond[k] = Math.max(0, Math.floor(nv));
      });
    }
    return out;
  }
  function plansOf() {
    const camp = store();
    return (camp && Array.isArray(camp.plans)) ? camp.plans : [];
  }
  /** 保存 / 覆盖一个自定义计划（机械校验不通过则整批拒收，不半套落地）。 */
  function planSave(input) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!input || typeof input !== 'object') { fault('bad-plan'); return { ok: false, reason: 'bad-plan' }; }
    const why = validPlan(input);
    if (why) { fault('invalid-plan:' + why); return { ok: false, reason: 'invalid-plan', why: why }; }
    const p = sanitizeStage ? { id: clean(input.id, 24), stages: input.stages.map(sanitizeStage) } : null;
    const budget = plansOf().filter(function (x) { return x && x.id !== p.id; }).length;
    if (budget >= cfg.planCap) { fault('plan-cap'); return { ok: false, reason: 'plan-cap', cap: cfg.planCap }; }
    // 再整体校验一次清洗后的版本（防绕过）
    const why2 = validPlan(p);
    if (why2) { fault('invalid-plan:' + why2); return { ok: false, reason: 'invalid-plan', why: why2 }; }
    const w = write(function (c) {
      c.plans = c.plans || [];
      const idx = c.plans.map(function (x) { return x && x.id; }).indexOf(p.id);
      if (idx >= 0) c.plans[idx] = p; else c.plans.push(p);
      return { id: p.id, stages: p.stages.length };
    });
    if (!w.ok) { fault(w.reason); return { ok: false, reason: w.reason }; }
    _stat.saves = (_stat.saves || 0) + 1;
    return { ok: true, id: p.id, stages: p.stages.length };
  }
  function planList() {
    return { ok: true, plans: plansOf().map(function (p) { return { id: p.id, stages: (p.stages || []).length }; }), cap: settings().planCap };
  }
  function planDelete(id) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const pid = clean(id, 24);
    if (!pid) { fault('bad-plan-id'); return { ok: false, reason: 'bad-plan-id' }; }
    const w = write(function (c) {
      const before = (c.plans || []).length;
      c.plans = (c.plans || []).filter(function (x) { return !x || x.id !== pid; });
      return { removed: before - c.plans.length };
    });
    if (!w.ok) { fault(w.reason); return { ok: false, reason: w.reason }; }
    return { ok: true, removed: w.value.removed, id: pid };
  }
  /** planOf：自定义计划优先，模板兜底（模板读蓝图真源不变）。 */
  function planOf(sceneId) {
    const raw = clean(sceneId, 24) || '';
    if (raw) {
      const saved = plansOf().filter(function (p) { return p && p.id === raw; })[0];
      if (saved) return { ok: true, id: raw, stages: saved.stages.map(function (s) { return Object.assign({}, s); }), custom: true };
    }
    const t = templates();
    const known = t.ok ? t.scenes.map(function (s) { return s.id; }) : [];
    if (raw && known.indexOf(raw) < 0) return { ok: false, reason: 'unknown-scene', id: raw };
    const base = PLANS[raw] || PLANS.blank;
    return { ok: true, id: raw || 'blank', stages: base.map(function (s) { return Object.assign({}, s); }), custom: false };
  }

  // ── 自有状态：**单一键**（骨架已声明的 `campaign`）──────────────────
  function store() {
    if (!WA.store || typeof WA.store.read !== 'function') return null;
    try { return WA.store.read('campaign'); } catch (e) { return null; }
  }
  function write(fn) {
    if (!WA.store || typeof WA.store.transact !== 'function') return { ok: false, reason: 'store-absent' };
    let out = null;
    const tx = WA.store.transact(function (d) {
      if (!d.campaign || typeof d.campaign !== 'object') {
        d.campaign = { scene: '', stage: 0, rounds: [], finished: false, verdict: null, history: [] };
      }
      out = fn(d.campaign);
    });
    if (!tx || tx.ok === false) return { ok: false, reason: (tx && tx.reason) || 'transact-failed' };
    return { ok: true, value: out };
  }

  let _stat = { starts: 0, advances: 0, finishes: 0, refused: 0, lastReason: '', faults: {}, reads: 0 };
  function fault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }

  /** 参数从自有设置里取（不散落进世界状态）。 */
  function argsFor(pred) {
    const cfg = settings();
    const k = PARAM_KEYS[pred.kind] || [];
    const out = Object.assign({}, pred);
    k.forEach(function (n) {
      const key = 'arg' + n.charAt(0).toUpperCase() + n.slice(1);
      const v = cfg[key];
      if (typeof v === 'string' && v !== '') out[n] = v;
    });
    return out;
  }
  /** 逐阶段求值（**只读**）。 */
  function evaluate(camp) {
    if (!camp || !camp.scene) return { ok: false, reason: 'no-campaign' };
    const pl = planOf(camp.scene);
    if (!pl.ok) return { ok: false, reason: pl.reason };
    const cfg = settings();
    const cap = Math.max(1, Math.min(cfg.stageCap || 12, pl.stages.length));
    const rows = [];
    for (let i = 0; i < pl.stages.length; i++) {
      const s = pl.stages[i];
      const P = PREDICATES[s.pred.kind];
      if (!P) {
        rows.push({ id: s.id, label: s.label, goal: s.goal, kind: s.pred.kind, ok: false, met: false, reading: null, why: 'predicate-absent', beyondCap: i >= cap });
        continue;
      }
      const r = P.eval(argsFor(s.pred));
      rows.push({
        id: s.id, label: s.label, goal: s.goal, kind: s.pred.kind,
        ok: !!r.ok, met: !!r.met, reading: r.reading === undefined ? null : r.reading,
        why: r.why || '', beyondCap: i >= cap,
        optional: !!s.optional, reward: (typeof s.reward === 'number') ? s.reward : null,
        failWhen: s.failWhen ? s.failWhen.kind : null,
        failPred: s.failWhen ? Object.assign({}, s.failWhen) : null,
        branchFrom: s.branchFrom || '',
        branchCond: s.branchCond ? s.branchCond.kind : null,
        branchPred: s.branchCond ? Object.assign({}, s.branchCond) : null
      });
    }
    return { ok: true, scene: pl.id, stages: rows, cap: cap };
  }

  /** 阶段前进 —— **唯一写口**。一次只前进一阶段（不得跳级），且判据须 ok 且 met。 */
  function advance() {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const camp = store();
    if (!camp) { fault('store-absent'); return { ok: false, reason: 'store-absent' }; }
    if (!camp.scene) { fault('no-scene'); return { ok: false, reason: 'no-scene' }; }
    if (camp.finished) return { ok: false, reason: 'finished' };
    if (camp.failed) return { ok: false, reason: 'failed' };
    const ev = evaluate(camp);
    if (!ev.ok) { fault(ev.reason); return { ok: false, reason: ev.reason }; }
    const idx = Math.max(0, Number(camp.stage) || 0);
    const cur = ev.stages[idx];
    if (!cur) { fault('stage-out-of-range'); return { ok: false, reason: 'stage-out-of-range', stage: idx, total: ev.stages.length }; }
    // 当前阶段若有失败条件：条件满足即整局失败（不是「未达成」—— 达成主线 ≠ 触发失败）
    if (cur.failWhen) {
      const P = PREDICATES[cur.failWhen];
      if (P) {
        const fr = P.eval(argsFor(cur.failPred || { kind: cur.failWhen }));
        if (fr.ok && fr.met) {
          const wF = write(function (c) {
            c.failed = true; c.verdict = 'failed'; c.failReason = cur.id;
            c.history = (c.history || []).concat([{ at: (WA.clock ? WA.clock.now('campaign') : Date.now()), stage: cur.id, note: 'failed:' + cur.failWhen }]);
          });
          if (wF.ok) _stat.finishes += 1;
          fault('failed');
          return { ok: false, reason: 'failed', stage: cur.id, review: review() };
        }
      }
    }
    if (!cur.ok) { fault('unreadable'); return { ok: false, reason: 'unreadable', stage: cur.id, why: cur.why }; }
    if (!cur.met) return { ok: false, reason: 'not-met', stage: cur.id, reading: cur.reading, why: cur.why };
    // 主进度只推进「主线阶段」：可选目标未成不阻塞主线（它的达成另行记账）
    const passed = ev.stages.filter(function (r) { return !r.optional; });
    const mainIdx = passed.indexOf(cur);
    let nextIdx = idx + 1;
    let optReward = 0;
    const optDone = [];
    if (mainIdx >= 0 && mainIdx + 1 < passed.length) {
      // 主线前进到下一主线阶段；**夹在中间的可选阶段逐个现场评估**：
      //   满足的记为达成并计其奖励，不满足的不阻塞主进度（可选目标的本义）。
      const targetIdx = ev.stages.indexOf(passed[mainIdx + 1]);
      for (let j = idx + 1; j < targetIdx; j++) {
        const r = ev.stages[j];
        if (r && r.optional && r.ok && r.met) {
          optReward += (typeof r.reward === 'number' ? r.reward : 0);
          optDone.push(r.id);
        }
      }
      nextIdx = targetIdx;
    } else {
      // 当前是最后一条主线：其后夹的可选阶段一并评估，然后收尾
      for (let j = idx + 1; j < ev.stages.length; j++) {
        const r = ev.stages[j];
        if (r && r.optional && r.ok && r.met) {
          optReward += (typeof r.reward === 'number' ? r.reward : 0);
          optDone.push(r.id);
        }
      }
      nextIdx = ev.stages.length;
    }
    // 分支：本阶段 branchCond 满足 ⇒ 跳到目标阶段（不违反「一次只走一格」：只在此刻判定一次）
    let branchHit = false;
    if (cur.branchCond) {
      const BP = PREDICATES[cur.branchCond];
      if (BP) {
        const br = BP.eval(argsFor(cur.branchPred || { kind: cur.branchCond }));
        if (br.ok && br.met) {
          const target = ev.stages.filter(function (r) { return r.id === cur.branchFrom; })[0] || null;
          if (target) {
            nextIdx = ev.stages.indexOf(target);
            branchHit = true;
          }
        }
      }
    }
    const done = nextIdx >= ev.stages.length;
    const reward = ((typeof cur.reward === 'number' && cur.reward > 0) ? cur.reward : 0) + optReward;
    const w = write(function (c) {
      c.stage = nextIdx;
      const h = { at: (WA.clock ? WA.clock.now('campaign') : Date.now()), stage: cur.id, reading: cur.reading, kind: cur.kind };
      if (branchHit) h.branch = cur.branchFrom;
      if (optDone.length) h.optionalDone = optDone.slice();
      c.history = (c.history || []).concat([h]);
      if (c.history.length > cfg.logCap) c.history = c.history.slice(-cfg.logCap);
      if (reward > 0) {
        c.bonus = (typeof c.bonus === 'number' ? c.bonus : 0) + reward;
        c.bonusLog = (c.bonusLog || []).concat([{ at: (WA.clock ? WA.clock.now('campaign') : Date.now()), stage: cur.id, reward: reward }]);
        if (c.bonusLog.length > cfg.logCap) c.bonusLog = c.bonusLog.slice(-cfg.logCap);
      }
      if (done) c.finished = true;
      return { stage: nextIdx, done: done, branch: branchHit, reward: reward, optionalDone: optDone.slice() };
    });
    if (!w.ok) { fault(w.reason); return { ok: false, reason: w.reason }; }
    _stat.advances += 1;
    if (done) { _stat.finishes += 1; return { ok: true, done: true, branch: branchHit, reward: reward, review: review() }; }
    return { ok: true, done: false, stage: nextIdx, branch: branchHit, reward: reward, optionalDone: optDone.slice() };
  }

  /** 复盘：数字**全部现场读**（不与落盘历史比对 —— 一比对就成了两套真源）。 */
  function review() {
    const camp = store();
    if (!camp) return { ok: false, reason: 'store-absent' };
    const ev = evaluate(camp);
    let round = null;
    let day = null;
    try { day = (WA.store && WA.store.read) ? WA.store.read('clock.dayIndex') : null; } catch (e) { day = null; }
    return {
      ok: true, scene: camp.scene, stage: camp.stage, finished: !!camp.finished,
      failed: !!camp.failed, failReason: camp.failReason || '',
      bonus: (typeof camp.bonus === 'number') ? camp.bonus : 0,
      custom: !!(planOf(camp.scene) || {}).custom,
      stages: ev.ok ? ev.stages.length : null,
      day: (typeof day === 'number') ? day : null,
      history: (camp.history || []).slice(-8).map(function (h) { return { stage: h.stage, kind: h.kind, reading: h.reading }; })
    };
  }

  function start(sceneId) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const pl = planOf(sceneId);
    if (!pl.ok) { fault(pl.reason); return { ok: false, reason: pl.reason, id: sceneId }; }
    const w = write(function (c) {
      c.scene = pl.id; c.stage = 0; c.finished = false; c.verdict = null;
      c.failed = false; c.failReason = ''; c.bonus = 0; c.bonusLog = [];
      c.history = [];
      let d0 = 0;
      try { d0 = Number((WA.store && WA.store.read) ? WA.store.read('clock.dayIndex') : 0) || 0; } catch (e) { d0 = 0; }
      c.rounds = [d0];   // 开局时的世界天数（字段名沿用骨架里的 rounds，语义是「开局基点」）
      return { scene: pl.id };
    });
    if (!w.ok) { fault(w.reason); return { ok: false, reason: w.reason }; }
    _stat.starts += 1;
    return { ok: true, scene: pl.id, stages: pl.stages.length };
  }

  /** 显式开新局（**清战役进度，不动世界** —— 边界 5）。 */
  function reset(keepScene) {
    const camp = store();
    const sid = keepScene && camp ? camp.scene : '';
    const w = write(function (c) {
      c.scene = sid; c.stage = 0; c.finished = false; c.verdict = null; c.history = []; c.rounds = [];
      c.failed = false; c.failReason = ''; c.bonus = 0; c.bonusLog = [];
      return { scene: sid };
    });
    if (!w.ok) { fault(w.reason); return { ok: false, reason: w.reason }; }
    return { ok: true, scene: sid, note: '战役进度已清空；世界状态未动（开新局是玩家的动作）' };
  }

  function status() {
    const cfg = settings();
    const camp = store();
    if (!camp || !camp.scene) {
      return { ok: false, reason: 'no-campaign', enabled: !!cfg.enabled, templates: templates() };
    }
    const ev = evaluate(camp);
    return {
      ok: true, enabled: !!cfg.enabled, scene: camp.scene, stage: camp.stage,
      finished: !!camp.finished, failed: !!camp.failed,
      bonus: (typeof camp.bonus === 'number') ? camp.bonus : 0,
      custom: !!(planOf(camp.scene) || {}).custom,
      stages: ev.ok ? ev.stages : [],
      reason: ev.ok ? null : ev.reason, review: review()
    };
  }
  function current() {
    const camp = store();
    if (!camp || !camp.scene) return { ok: false, reason: 'no-campaign' };
    const ev = evaluate(camp);
    if (!ev.ok) return { ok: false, reason: ev.reason };
    const idx = Math.max(0, Number(camp.stage) || 0);
    const cur = ev.stages[idx] || null;
    return { ok: true, scene: camp.scene, stage: idx, current: cur, done: idx >= ev.stages.length,
      finished: !!camp.finished, failed: !!camp.failed };
  }
  function diagnose() {
    const cfg = settings();
    const t = templates();
    const s = store();
    return {
      ok: true, enabled: !!cfg.enabled,
      deps: {
        store: !!WA.store, settingsBus: !!WA.settingsBus, inputGuard: !!WA.inputGuard,
        worldBlueprint: !!(WA.worldBlueprint && Array.isArray(WA.worldBlueprint.SCENES)),
        diplomacy: !!(WA.diplomacy && typeof WA.diplomacy.pairView === 'function'),
        factionGraph: !!(WA.factionGraph && typeof WA.factionGraph.edgeOf === 'function'),
        freight: !!(WA.freight && typeof WA.freight.view === 'function')
      },
      templatesOk: t.ok, templateCount: t.ok ? t.scenes.length : 0, templateReason: t.ok ? null : t.reason,
      plans: (s && Array.isArray(s.plans)) ? s.plans.map(function (p) { return p && p.id; }) : [],
      planCap: settings().planCap,
      hasCampaign: !!(s && s.scene), scene: s ? s.scene : '', stage: s ? s.stage : null,
      predicates: PREDICATE_IDS.slice(),
      faults: Object.assign({}, _stat.faults)
    };
  }
  function statOf() {
    const cfg = settings();
    const s = store();
    return Object.assign({}, _stat, {
      faults: Object.assign({}, _stat.faults),
      enabled: !!cfg.enabled, stageCap: cfg.stageCap, logCap: cfg.logCap, planCap: cfg.planCap,
      hasCampaign: !!(s && s.scene), scene: s ? s.scene : '', stage: s ? s.stage : null,
      finished: s ? !!s.finished : false, failed: s ? !!s.failed : false,
      bonus: (s && typeof s.bonus === 'number') ? s.bonus : 0,
      plans: (s && Array.isArray(s.plans)) ? s.plans.length : 0,
      predicates: PREDICATE_IDS.slice()
    });
  }
  function resetStat() {
    _stat = { starts: 0, advances: 0, finishes: 0, refused: 0, lastReason: '', faults: {}, reads: 0 };
    return { ok: true };
  }

  WA.campaign = {
    PREDICATES: PREDICATE_IDS.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    templates: templates, planOf: planOf,
    planSave: planSave, planList: planList, planDelete: planDelete, validPlan: validPlan,
    start: start, advance: advance, reset: reset,
    status: status, current: current, review: review,
    evaluate: evaluate, diagnose: diagnose, stat: statOf, resetStat: resetStat
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/campaign.js', { kind: 'engine', ver: '2.218.0' });
})();