/**
 * WorldAxis engines/plan.js (v2.119.0) — 人物多步计划与受挫重决策（拓展计划 ①）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   `life.js` 的目标只有一个字符串格子 `goal.next`，于是「长期意图」在长局里退化成
 *   一句注释：tick 走到 `advance` 时把 next 写成 `'推进中'`，答不出四件事：
 *   这一步之后干什么、要谁在场、需要什么、卡住了改走哪条路。
 *   于是模型只能自己编一条「合理」的后续 —— 编出来的步骤与已结算事实脱钩。
 *
 * ── 本模块把目标展开为**有限步数的计划**，每步四个显式声明 ──────
 *   ① `need`     这一步要消耗的资源（真源是 org 的库存，不由本模块持有）
 *   ② `after`    前置步（必须是**更小**的 seq，防环）
 *   ③ `place`    这一步发生在哪（交给 act 的地点准入去核）
 *   ④ `fallback` 受挫后的改选描述（**只声明，不自动改**）
 *
 * ── 九条设计边界（全是否定式）──────────────────────────────────
 *   ① **只为已存在的目标展开**。目标必须真的在 `people.<id>.life.goals` 里且 active；
 *      不做「建计划顺手建目标」，更不建人（registry 才是人物唯一写者）。
 *   ② **步数有硬上限**：超出 `maxSteps` 一律 `too-many-steps` 拒收，**不静默截断**
 *      （截断会把「他本来打算做第五步」变成从未存在过的意图）。
 *   ③ **前置步防环**：`after` 必须指向更小的 seq ⇒ 否则 `bad-after`。
 *      环状计划会让「现在该做哪一步」永远答不出。
 *   ④ **依据不足就等**。`need` 不足 ⇒ 如实报 `need-unmet` 且**不改状态**（可重试）；
 *      只有显式 `settle('blocked')` 才进 blocked。这与 life.decide 的 `wait` 同口径：
 *      「现在做不了」与「这条路走不通」是两件事。
 *   ⑤ **受挫只标记、不自动改写**。`blocked` 记原因与次数；改选必须由调用方
 *      **显式传入新步骤**（`rechoose`）——本模块没有任何「自动挑一条替代路」的代码路径。
 *   ⑥ **重试有上限且可追溯**：`maxTries` 用尽 ⇒ `tries-exhausted`，然后停下等人决定。
 *   ⑦ **拒收不消耗次数**。`refused` 回到 pending 且不计 tries ——
 *      被拒不是「他试过了没成」，混在一起会让复盘读不出到底谁的问题。
 *   ⑧ **进度只读面如实空**。没有计划的人 `current()` 报 `no-plan`，不造一条空计划。
 *   ⑨ **容量有界且挤出有账**：站点 `plan.plans`（cap 12）走 evict 单一出口。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────────
 *   · 本模块**不执行**任何步骤：`advance` 只把当前步交出来，真正开工走 `act.add`
 *     （准入、路线、资源扣减都在那边，本模块不复制一份判定）。
 *   · 与 `longline` 的分工：longline 度量「伏笔承诺何时该回收」；本模块排「一个人接下来
 *     要做哪几步」。两者都不改写对方的状态。
 *   · 总开关默认关闭；关闭时不展开、不结算、不注入。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_plan_settings_v1';
  const DEF = { enabled: false, maxSteps: 4, maxPlans: 12, maxTries: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'plan',
    bounds: { maxSteps: [1, 8], maxPlans: [1, 24], maxTries: [1, 6] } };
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

  // 计划态与步骤态**穷尽互斥**（与 act 的 ACTIVE/TERMINAL 同口径）。
  const STATUS = ['active', 'blocked', 'done', 'abandoned'];
  const FINAL = ['done', 'abandoned'];

  const stat = { expanded: 0, advanced: 0, settled: 0, blocked: 0, refused: 0,
    replanned: 0, dropped: 0, lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.dropped++; stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rowsOf(root) { const c = (root || state()).plan; return (c && Array.isArray(c.plans)) ? c.plans : []; }
  function personOf(name, root) {
    const id = clean(name, 60);
    return (id && ((root || state()).people || {})['p_' + id]) || null;
  }
  function goalOf(person, goalId) {
    const goals = (person && person.life && Array.isArray(person.life.goals)) ? person.life.goals : [];
    const gid = clean(goalId, 60);
    return goals.filter(function (g) { return g && clean(g.id, 60) === gid; })[0] || null;
  }
  function planOf(personName, root) {
    const who = clean(personName, 60), id = 'p_' + who;
    return rowsOf(root).filter(function (r) { return r && r.personId === id && FINAL.indexOf(r.status) < 0; })[0] || null;
  }
  function stockOf(personName) {
    const p = personOf(personName);
    if (!p) return null;
    // org 缺席时**不猜库存**（与 act.stock 同规：org 缺席 ⇒ 返回 null，调用方拒收）。
    if (WA.org && typeof WA.org.stockOf === 'function') return WA.org.stockOf(p);
    return null;
  }
  /** 步骤归一：形状不对返回 null（调用方拒收整份计划，不做「跳过这一步」）。 */
  function normStep(raw, i) {
    if (!raw || typeof raw !== 'object') return null;
    const text = clean(raw.text, 80);
    if (!text) return null;
    const kind = clean(raw.kind, 20) || 'step';
    const rn = raw.need;
    let need = null;
    if (rn && typeof rn === 'object') {
      const resource = clean(rn.resource, 30), amount = Math.round(Number(rn.amount));
      if (!resource || !isFinite(amount) || amount <= 0) return null;
      need = { resource: resource, amount: amount };
    }
    const cost = Number(raw.costMs);
    return {
      seq: i, kind: kind, text: text, need: need,
      after: clean(raw.after, 40), place: clean(raw.place, 40),
      costMs: (isFinite(cost) && cost > 0) ? Math.round(cost) : 0,
      fallback: clean(raw.fallback, 80),
      status: 'pending', at: 0, reason: ''
    };
  }
  /** 前置步解析：必须指向**更小的 seq**（防环）；解析失败返回 null。 */
  function linkAfter(norm, list) {
    for (let i = 0; i < norm.length; i++) {
      const a = norm[i].after;
      if (!a) continue;
      const hit = norm.filter(function (x) { return String(x.seq) === a || clean(x.kind, 20) === a; })[0];
      if (!hit || hit.seq >= norm[i].seq) return { ok: false, at: i, after: a };
      norm[i].afterSeq = hit.seq;
    }
    return { ok: true };
  }
  function normalize(list, cap) {
    if (!Array.isArray(list) || !list.length) return { ok: false, reason: 'missing-steps' };
    if (list.length > cap) return { ok: false, reason: 'too-many-steps', want: list.length, cap: cap };
    const norm = [];
    for (let i = 0; i < list.length; i++) {
      const s = normStep(list[i], i);
      if (!s) return { ok: false, reason: 'bad-step', at: i };
      norm.push(s);
    }
    const link = linkAfter(norm, list);
    if (!link.ok) return { ok: false, reason: 'bad-after', at: link.at, after: link.after };
    return { ok: true, steps: norm };
  }
  /** 展开：为一个**已存在的目标**排有限步数的计划。 */
  function expand(personName, goalId, steps) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(personName, 60);
    if (!who) { noteFault('missing-person'); return { ok: false, reason: 'missing-person' }; }
    const cfg = settings();
    const nz = normalize(steps, cfg.maxSteps);
    if (!nz.ok) { noteFault(nz.reason); return nz; }
    const p = personOf(who);
    if (!p) { noteFault('missing-person'); return { ok: false, reason: 'missing-person', person: who }; }
    const goal = goalOf(p, goalId);
    if (!goal) { noteFault('unknown-goal'); return { ok: false, reason: 'unknown-goal', goalId: clean(goalId, 60) }; }
    if (goal.status !== 'active') { noteFault('goal-not-active'); return { ok: false, reason: 'goal-not-active', goalId: goal.id, status: goal.status }; }
    if (planOf(who)) { noteFault('exists'); return { ok: false, reason: 'exists', person: who }; }
    let out = null;
    WA.store.transact(function (draft) {
      draft.plan = (draft.plan && typeof draft.plan === 'object' && !Array.isArray(draft.plan)) ? draft.plan : { plans: [] };
      draft.plan.plans = Array.isArray(draft.plan.plans) ? draft.plan.plans : [];
      if (draft.plan.plans.length >= cfg.maxPlans) { out = { ok: false, reason: 'plans-full', cap: cfg.maxPlans }; return false; }
      const now = clockNow('plan');
      const row = {
        id: 'plan_' + now + '_' + draft.plan.plans.length,
        personId: 'p_' + who, goalId: clean(goalId, 60),
        goalText: clean(goal.text, 80),
        steps: nz.steps, cursor: 0, status: 'active', tries: 0,
        reason: '', at: now, updatedAt: now
      };
      draft.plan.plans.push(row);
      WA.evict.array(draft.plan.plans, 'plan.plans', cfg.maxPlans);
      out = { ok: true, id: row.id, steps: nz.steps.length };
    }, 'plan:expand');
    if (out && out.ok) { stat.expanded++; stat.lastReason = 'expanded'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 当前步：第一个 pending 且前置步都已完成的步（不跳步）。 */
  function currentStep(row) {
    if (!row || !Array.isArray(row.steps)) return null;
    const doneSet = {};
    row.steps.forEach(function (s) { if (s && s.status === 'done') doneSet[s.seq] = true; });
    return row.steps.filter(function (s) {
      return s && s.status === 'pending' && (s.afterSeq === undefined || doneSet[s.afterSeq] === true);
    })[0] || null;
  }
  /**
   * 当前步的**放宽版**：受阻步也算候选。
   *   受阻是**标记不是锁** —— 调用方再 advance 一次，意思就是「再试同一这一步」；
   *   若这里不把受阻步算候选，重试入口就不存在了（见 advance 的说明）。
   */
  function currentRelaxed(row) {
    if (!row || !Array.isArray(row.steps)) return null;
    const doneSet = {};
    row.steps.forEach(function (s) { if (s && s.status === 'done') doneSet[s.seq] = true; });
    return row.steps.filter(function (s) {
      return s && (s.status === 'pending' || s.status === 'blocked')
        && (s.afterSeq === undefined || doneSet[s.afterSeq] === true);
    })[0] || null;
  }
  function current(personName) {
    const who = clean(personName, 60);
    const row = planOf(who);
    if (!row) return { ok: false, reason: 'no-plan', person: who };
    const step = currentStep(row);
    if (!step) {
      // 受阻时如实报「该决策了」（比他看不到那一步更有用）。
      if (row.status === 'blocked') {
        const b = row.steps.filter(function (s) { return s && s.status === 'blocked'; })[0];
        return { ok: false, reason: 'blocked', id: row.id, status: row.status,
          seq: b ? b.seq : -1, why: row.reason, tries: row.tries || 0 };
      }
      // 剩下的 pending 步都被前置卡住 ⇒ 如实报「等前置」，不挑一步顶上。
      return { ok: false, reason: 'awaiting-after', id: row.id, status: row.status };
    }
    return { ok: true, id: row.id, status: row.status, seq: step.seq, kind: step.kind,
      text: step.text, need: step.need ? Object.assign({}, step.need) : null,
      place: step.place, tries: row.tries || 0 };
  }
  /**
   * 交出当前步并标 running：**不执行**，只登记「他打算做这一步了」。
   *
   * 受阻（blocked）**不是锁**：调用方再 advance 一次 = 「重试同一步」，受阻步被复位成待办。
   *   为何必须如此：若受阻后 advance 一律拒、而唯一的退出路径 rechoose 又把 tries 清零，
   *   则 tries 永远到不了 maxTries ⇒「重试有上限」只活在注释里、tries-exhausted 永不可达
   *   （本版实测抓出：maxTries=3 时反复受阻仍只报 blocked）。现在唯一闸门就是尝试次数。
   */
  function advance(personName) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(personName, 60);
    const row = planOf(who);
    if (!row) return { ok: false, reason: 'no-plan', person: who };
    const cfg = settings();
    // 唯一闸门：尝试次数用尽 ⇒ 停下等人决定（重试 / 改选 / 放弃由调用方显式选）。
    if ((row.tries || 0) >= cfg.maxTries) {
      noteFault('tries-exhausted');
      return { ok: false, reason: 'tries-exhausted', id: row.id, tries: row.tries || 0 };
    }
    const cur = currentRelaxed(row);
    if (!cur) return { ok: false, reason: 'awaiting-after', id: row.id, status: row.status };
    // 资源不足 ⇒ 只是「现在做不了」，**不改状态**（可重试）。
    if (cur.need) {
      const st = stockOf(who);
      if (st === null) return { ok: false, reason: 'org-missing', resource: cur.need.resource };
      const have = Number(st[cur.need.resource]);
      if (!(isFinite(have) && have >= cur.need.amount)) {
        return { ok: false, reason: 'need-unmet', resource: cur.need.resource,
          have: isFinite(have) ? have : 0, want: cur.need.amount };
      }
    }
    let out = null;
    WA.store.transact(function (draft) {
      const r = planOf(who, draft);
      if (!r) { out = { ok: false, reason: 'no-plan', person: who }; return false; }
      if (r.status === 'blocked') {
        r.steps.forEach(function (s) { if (s && s.status === 'blocked') s.status = 'pending'; });
        r.status = 'active'; r.reason = 'retrying';
      }
      const s = currentStep(r);
      if (!s || s.seq !== cur.seq) { out = { ok: false, reason: 'stale-step' }; return false; }
      s.status = 'running'; s.at = clockNow('plan');
      r.updatedAt = s.at;
      out = { ok: true, id: r.id, seq: s.seq, kind: s.kind, text: s.text,
        place: s.place, costMs: s.costMs, need: s.need ? Object.assign({}, s.need) : null,
        tries: r.tries || 0 };
    }, 'plan:advance');
    if (out && out.ok) { stat.advanced++; stat.lastReason = 'advanced'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 结算当前步。outcome 三档**语义互斥**：
   *   · done    —— 这一步真的完成了 ⇒ 前进；全部完成 ⇒ plan 终态 done；
   *   · blocked —— 这条路走不通 ⇒ 进 blocked（计一次 tries，超限报 tries-exhausted）；
   *   · refused —— 被世界/他人拒绝 ⇒ **回到 pending 且不计 tries**（拒收不是他的错）。
   * `wait` 不是结算：等就是什么都不做，由 advance 的 need-unmet 承载。
   */
  function settle(personName, outcome, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(personName, 60), o = opts || {};
    const kind = clean(outcome, 20);
    if (['done', 'blocked', 'refused'].indexOf(kind) < 0) {
      noteFault('bad-outcome');
      return { ok: false, reason: 'bad-outcome', allowed: ['done', 'blocked', 'refused'] };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const r = planOf(who, draft);
      if (!r) { out = { ok: false, reason: 'no-plan', person: who }; return false; }
      const s = r.steps.filter(function (x) { return x && x.status === 'running'; })[0];
      if (!s) { out = { ok: false, reason: 'not-running', id: r.id }; return false; }
      const now = clockNow('plan');
      if (kind === 'done') {
        s.status = 'done'; s.at = now; s.reason = '';
        r.cursor = s.seq + 1; r.reason = '';
        if (!r.steps.some(function (x) { return x && x.status !== 'done'; })) { r.status = 'done'; r.reason = 'all-steps-done'; }
      } else if (kind === 'blocked') {
        s.status = 'blocked'; s.at = now; s.reason = clean(o.reason || 'blocked', 40);
        r.status = 'blocked'; r.reason = s.reason; r.tries = (r.tries || 0) + 1;
      } else {
        // refused：回到 pending、**不计 tries**（拒收不消耗他的尝试次数）。
        s.status = 'pending'; s.at = now; s.reason = clean(o.reason || 'refused', 40);
        r.reason = s.reason;
      }
      r.updatedAt = now;
      const nxt = currentStep(r);
      out = { ok: true, id: r.id, seq: s.seq, status: r.status, step: s.status,
        tries: r.tries || 0, next: nxt ? nxt.seq : -1 };
    }, 'plan:settle');
    if (out && out.ok) {
      stat.settled++;
      if (kind === 'blocked') stat.blocked++; else if (kind === 'refused') stat.refused++;
      stat.lastReason = kind;
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 受挫后的候选（**只读**）：给出被卡住的步、它声明的 fallback、仍可行后续步与余量。
   * 本模块**不替调用方选**（选是叙事决定）。
   */
  function candidates(personName) {
    const who = clean(personName, 60);
    const row = planOf(who);
    if (!row) return { ok: false, reason: 'no-plan', person: who };
    const stuck = row.status === 'blocked'
      ? (row.steps.filter(function (s) { return s && s.status === 'blocked'; })[0] || null)
      : currentStep(row);
    if (!stuck) return { ok: false, reason: 'nothing-to-choose', id: row.id, status: row.status };
    const rest = row.steps.filter(function (s) { return s && s.status === 'pending'; }).map(function (s) {
      return { seq: s.seq, text: s.text, blockedBy: (s.afterSeq === undefined ? '' : String(s.afterSeq)) };
    });
    const cfg = settings();
    return { ok: true, id: row.id, status: row.status, reason: row.reason,
      stuck: { seq: stuck.seq, text: stuck.text, fallback: stuck.fallback },
      // tries 用尽时**照实带出**：调用方该知道「他没有余量了」。
      tries: row.tries || 0, exhausted: (row.tries || 0) >= cfg.maxTries, rest: rest,
      hint: stuck.fallback ? '可按 fallback 改选，或显式重排后续步骤' : '未声明改选路径，需显式重排' };
  }
  /** 改选：**必须显式给新步骤**，把该计划从 blocked 拉回 active（不自动编）。 */
  function rechoose(personName, steps) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(personName, 60);
    const cfg = settings();
    const nz = normalize(steps, cfg.maxSteps);
    if (!nz.ok) { noteFault(nz.reason); return nz; }
    let out = null;
    WA.store.transact(function (draft) {
      const r = planOf(who, draft);
      if (!r) { out = { ok: false, reason: 'no-plan', person: who }; return false; }
      if (r.steps.some(function (s) { return s && s.status === 'running'; })) {
        // 正在做的步骤没结算就改选 ⇒ 会让「这一步到底做了没有」无法判定。
        out = { ok: false, reason: 'step-running' }; return false;
      }
      const kept = r.steps.filter(function (s) { return s && s.status === 'done'; });
      const offset = kept.length;
      // 新步的 after 已在 normalize 阶段解析为**批内**序号；平移后重挂。
      const inBatch = {};
      nz.steps.forEach(function (s) { inBatch[String(s.seq)] = offset + s.seq; });
      nz.steps.forEach(function (s) {
        s.seq = offset + s.seq;
        if (s.afterSeq !== undefined) s.afterSeq = inBatch[String(s.afterSeq)];
      });
      r.steps = kept.concat(nz.steps);
      r.status = 'active'; r.reason = 'rechosen'; r.tries = 0; r.updatedAt = clockNow('plan');
      out = { ok: true, id: r.id, kept: kept.length, steps: nz.steps.length };
    }, 'plan:rechoose');
    if (out && out.ok) { stat.replanned++; stat.lastReason = 'rechosen'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function abandon(personName, reason) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(personName, 60);
    let out = null;
    WA.store.transact(function (draft) {
      const r = planOf(who, draft);
      if (!r) { out = { ok: false, reason: 'no-plan', person: who }; return false; }
      r.status = 'abandoned'; r.reason = clean(reason || 'abandoned', 40); r.updatedAt = clockNow('plan');
      out = { ok: true, id: r.id };
    }, 'plan:abandon');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function view(personName) {
    const who = clean(personName, 60);
    const row = planOf(who);
    if (!row) return { ok: false, reason: 'no-plan', person: who };
    return { ok: true, id: row.id, personId: row.personId, goalId: row.goalId, goalText: row.goalText,
      status: row.status, reason: row.reason, tries: row.tries || 0,
      cursor: row.cursor, steps: row.steps.map(function (s) {
        return { seq: s.seq, kind: s.kind, text: s.text, status: s.status, reason: s.reason || '',
          need: s.need ? Object.assign({}, s.need) : null, fallback: s.fallback || '',
          afterSeq: (s.afterSeq === undefined ? -1 : s.afterSeq) };
      }) };
  }
  /**
   * X1（v2.127.0）长期意图链 —— 把「人物当前计划」与「它挂靠的目标」对成一条可判定的链。
   *
   * ── 它治什么（缺口）────────────────────────────────────────────
   *   `life.goals` 的 `next` 是一个**字符串格子**：`life.tick` 走到 `advance` 时把它写死成
   *   `'推进中'`，而真正的步骤住在 `plan.steps`。「这一步之后干什么 / 缺什么前置 / 卡在哪」
   *   三问里，前两问只有本模块答得出、第三问只有 life 侧那句字符串在猜 —— 两侧从未摆在一起过。
   *   现场那句原话（R105 ①）正是这个：**「长期意图」退化成一句注释**。
   *
   * ── 本函数只读，做四件事 ────────────────────────────────────────
   *   ① `step`      当前第几步（复用 `currentStep`；**正在做的那一步也算当前**）
   *   ② `blockedBy` 卡在哪 —— 资源不足（need）与前置步未完成（after）**分开报**
   *   ③ `rest`      这一步之后干什么（后续 pending 步，按 seq 升序）
   *   ④ `drift`     目标的 `next` 与当前步是否**同指**（不同指即如实报，不修、不猜）
   *
   * ── v2.127.0 修掉的两处（都是「答不出」而非「答错」）───────────────
   *   · 只认 pending 步 ⇒ 第 0 步已 `advance`（running）而后续步都在等它时，`step` 答 `null`，
   *     而那一刻他明明正在做第 0 步。凡「这一步走没走成」的问句都会读到一个空步骤。
   *   · 「缺前置」原先只对 `at` 自己判前置，而 `at` 能取到的三种形态（current / blocked /
   *     running）**其前置必然已完成**（`advance` 的前置准入把它写死了）⇒ 那一段读数是
   *     **永远取不到值的分支**。现在改为对**最早的待办步**判：它在等谁、那个人什么状态。
   *
   * ── 四条边界（全是否定式）──────────────────────────────────────
   *   ① **不建链**：目标不在 `life.goals` 里、或计划不在场 ⇒ 如实报 `no-plan` / `unknown-goal`，
   *      绝不顺手造一条空链（那会把「他没打算做」变成「他打算做但没写」）。
   *   ② **不改状态**：本函数一个字节都不写存档（推进仍只走 advance / settle / rechoose）。
   *   ③ **不自动规划**：`rest` 只列**已声明**的后续步；「该走哪条」是叙事决定，本模块不代选。
   *   ④ **漂移只报不修**：`drift:true` 是读数不是错误 —— 对齐不由本函数做。
   */
  function chain(personName) {
    const who = clean(personName, 60);
    const row = planOf(who);
    if (!row) return { ok: false, reason: 'no-plan', person: who };
    const p = personOf(who);
    // 目标必须**真的**在这人自己的 life.goals 里 —— 计划挂着的目标被人删了就如实报。
    const goal = p ? goalOf(p, row.goalId) : null;
    if (!goal) return { ok: false, reason: 'unknown-goal', id: row.id, goalId: clean(row.goalId, 60) };
    const done = row.steps.filter(function (s) { return s && s.status === 'done'; }).length;
    const cur = currentStep(row);
    const stuck = row.status === 'blocked'
      ? (row.steps.filter(function (s) { return s && s.status === 'blocked'; })[0] || null) : null;
    // v2.127.0：正在做的那一步（running）**也是当前** —— 只认 pending 会让「第 0 步已开工、
    //   后续步都在等它」的那一刻答 `step:null`，而那一刻他明明在做第 0 步。
    const running = row.steps.filter(function (s) { return s && s.status === 'running'; })[0] || null;
    const at = cur || running || stuck || null;
    // 「卡在哪」拆成两种不同的事：资源不够（可以等）与前置没完成（得先做前面的）。
    const blockedBy = [];
    if (at) {
      if (at.need) blockedBy.push({ kind: 'need', detail: at.need.resource + '×' + at.need.amount });
    }
    // 前置面：对**最早的待办步**判它在等谁。为什么不判 `at` 自己的前置：`at` 的三种形态
    //   （current / running / blocked）都经过 advance 的前置准入 —— 它们的前置**必然已完成**，
    //   判了也永远是空（一段读不出值的判据比没有判据更坏）。
    //   真正会「等」的是**待办步**：上一步受阻（blocked）或正在做（running）时，
    //   它后面的待办步链上就断了，而这一刻的链状态此前无人答得出（R105 ① 的形状）。
    const todo = row.steps.filter(function (s) { return s && s.status === 'pending'; })[0] || null;
    const head = todo || at;
    if (head && head.afterSeq !== undefined) {
      const pre = row.steps.filter(function (s) { return s && s.seq === head.afterSeq; })[0];
      if (pre && pre.status !== 'done') {
        blockedBy.push({ kind: 'after', seq: pre.seq, text: pre.text, status: pre.status,
          // 它在等的那一步此刻什么状态：running=正在做（等它完工）、blocked=那一步自己卡住了、
          //   pending=还没轮到自己（链上的顺序约束）。三态各自通向不同的处置。
          waitingOn: pre.status, forSeq: head.seq });
      }
    }
    // 后续步：**只列已声明**的（按 seq 升序），不补一条「合理的下一步」。
    //   起点是 `at`（他此刻在做/在等的那一步）—— 故 `head` 不会重复出现在这里：
    //   同一个步骤既报「卡在它前面」又报「之后还有它」会让读者把一步读成两步。
    const rest = row.steps.filter(function (s) {
      return s && s.status === 'pending' && (!at || s.seq > at.seq);
    }).map(function (s) {
      return { seq: s.seq, text: s.text, need: s.need ? Object.assign({}, s.need) : null };
    });
    // 漂移：`next` 是 tick 写死的那句注释；当前步才是真在做的。两者不同指即如实报。
    const goalNext = clean(goal.next, 60);
    const stepText = at ? at.text : '';
    return { ok: true, id: row.id, personId: row.personId, goalId: row.goalId,
      goalText: clean(goal.text, 80), goalStatus: clean(goal.status, 20),
      status: row.status, reason: row.reason || '', tries: row.tries || 0,
      total: row.steps.length, done: done, cursor: row.cursor,
      step: at ? { seq: at.seq, kind: at.kind, text: at.text, status: at.status } : null,
      blockedBy: blockedBy, rest: rest, goalNext: goalNext,
      drift: !!(goalNext && stepText && goalNext !== stepText),
      // 卡住了**不等于**放弃：与 life.decide 的 wait 同口径（「现在做不了」≠「这条路走不通」）。
      note: stuck ? '受阻不等于放弃：可再 advance 一次重试，或按 fallback 显式改选' : '' };
  }
  /**
   * X1：意图链的**推演侧**块（消费者是 `backstage.buildPrompt` 的 user 段）。
   *
   * 与 `buildBlock()` 的分工（两块谁看什么，绝不混）：
   *   · `buildBlock()` 给**正文模型**：只说「他现在打算做这一步」——摊开后续步骤会让模型照着演。
   *   · `chainBlock()` 给**推演引擎**：要说「他在第几步、缺什么前置、卡在哪」，因为推演引擎的活
   *     正是结算「这一步走没走成」；不给链状态，它会另编一条合理后续（那正是 R105 ① 的病）。
   *
   * 三条边界：① 关闭时返回空串；② 每人只出**未终结**的计划；③ 出错整块吞掉（推演提示词
   * 不该因为一个读数异常而整体失败 —— 与 `backstage` 其余附属段的纪律一致）。
   */
  function chainBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lines = [];
    try {
      rowsOf().filter(function (r) { return r && FINAL.indexOf(r.status) < 0; })
        .slice(0, cfg.maxPlans).forEach(function (r) {
          const c = chain(String(r.personId || '').replace(/^p_/, ''));
          if (!c.ok) return;
          const bits = ['第 ' + ((c.step && c.step.seq) || 0) + '/' + c.total + ' 步'];
          if (c.step) bits.push('「' + c.step.text + '」');
          if (c.blockedBy.length) {
            bits.push('卡在：' + c.blockedBy.map(function (b) {
              // v2.127.0：两类受阻都说得出「等的是什么」——资源类报缺额，前置类报它在等第几步。
              //   此前只渲染 need，前置面即使被算出来也进不了推演提示词（算得出、说不到）。
              return b.kind === 'need' ? '缺 ' + b.detail : '前置第 ' + b.seq + ' 步（' + b.status + '）未完成';
            }).join('、'));
          }
          if (c.rest.length) bits.push('之后还有 ' + c.rest.length + ' 步');
          lines.push(c.goalText + '：' + bits.join('，'));
        });
    } catch (e) { return ''; }
    if (!lines.length) return '';
    return '【人物意图链】' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '只按这些**已声明**的步骤结算「这一步走没走成」；'
      + '缺前置 / 缺资源就如实推进受阻，不要替人物另编一条后续。';
  }
  /** 台账（诊断/面板读；只读不改）。 */
  function statView() {
    const rows = rowsOf();
    const byStatus = {};
    STATUS.forEach(function (k) { byStatus[k] = 0; });
    rows.forEach(function (r) { if (r && byStatus[r.status] !== undefined) byStatus[r.status]++; });
    return { enabled: settings().enabled, rows: rows.length, byStatus: byStatus,
      blocked: rows.filter(function (r) { return r && r.status === 'blocked'; }).length };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lines = [];
    rowsOf().filter(function (r) { return r && FINAL.indexOf(r.status) < 0; })
      .slice(0, cfg.maxPlans).forEach(function (r) {
        const p = (state().people || {})[r.personId];
        const name = (p && p.name) || String(r.personId || '').replace(/^p_/, '');
        const s = (r.status === 'blocked' ? r.steps.filter(function (x) { return x && x.status === 'blocked'; })[0] : null) || currentStep(r);
        if (!s) return;
        lines.push(name + '（目标「' + (r.goalText || r.goalId) + '」）' + (r.status === 'blocked' ? '受阻' : '进行中')
          + '：' + s.text
          + (s.need ? '，需要 ' + s.need.resource + '×' + s.need.amount : '')
          + (r.status === 'blocked' && s.reason ? '（因 ' + s.reason + '）' : ''));
      });
    if (!lines.length) return '';
    return '[人物计划]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '只把这些当作人物已声明的多步意图；受阻不等于放弃，也不要替人物编造未声明的步骤。';
  }
  WA.plan = {
    STATUS: STATUS.slice(), FINAL: FINAL.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    expand: expand, current: current, advance: advance, settle: settle,
    candidates: candidates, rechoose: rechoose, abandon: abandon,
    // X1（v2.127.0）：长期意图链的只读读数（消费者是 backstage 推演与 tool-diag）。
    //   chain 给读数，chainBlock 给推演提示词段 —— 两块各有一个真消费方，不留裸导出。
    chain: chain, chainBlock: chainBlock,
    view: view, statView: statView, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/plan.js', { kind: 'engine', ver: '2.119.0' });
})();