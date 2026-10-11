/**
 * WorldAxis engines/agency.js (v2.194.0) — 行动反馈闭环（TX2）
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

  // ── v2.194.0（U2）：本模块的**提交时机**统一入口（与 freight / commission / investigation 同规格）──
  //   本模块原先在 plan/act 之外**自己不开事务**（它的写都是跨模块调 act.add / plan.settle）——
  //   于是「行动回执消化」这件事在两条独立事务之间没有任何原子性可言（见 processReceipts）。
  function commitOf() { try { return WA.commit || null; } catch (e) { return null; } }
  function chainInflight() {
    const c = commitOf();
    return (c && typeof c.inflight === 'function') ? c.inflight() : null;
  }
  let __opSeq = 0;
  // ── v2.197.0（G20 形态归一）────────────────────────────────────────
  //   此处原写 `t = (WA.clock && WA.clock.wallNow) ? WA.clock.wallNow() : Date.now();`。
  //   它是**合法**的能力守卫，但不是本仓的**时间源形态**：G20 只认「守卫声明 + 同行 fallback」
  //   与「内联三目」两类，其余一律判成**裸调**（=「判据看不见的形态」）。形态漂移不等于逻辑缺陷
  //   （v2.190.0 那轮 branch-tree 的 `clockNow_` 同型），但仍该归位 —— 判据看不见的写法，
  //   下一次真出问题时也照样看不见。归一为声明的守卫，fallback 逐字保留（`Date.now()` 不改）。
  function wallNow() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }
  function nextOpId(prefix) {
    __opSeq++;
    const t = wallNow();
    return clean(prefix, 24) + '@' + t + '#' + __opSeq;
  }
  function txCount() { try { return (WA.store && typeof WA.store.txStat === 'function') ? (WA.store.txStat().count || 0) : 0; } catch (e) { return 0; } }
  /**
   * 刚刚这一趟 transact，**本模块这一笔写**有没有被保存点撤回？
   *   真源是 `store.txStat().lastNested`（store 自己在嵌套分支写的台账，不是我方常量），
   *   时效判据用 store 记的**单调序号** `seq`（不是墙钟毫秒——毫秒在冻结时钟下会给出相等读数，
   *   把旧读数误判成本次的）。`seq` 缺失时回退计数口径（老 store）。
   * @returns {''|'aborted'|'threw'}
   */
  function nestedVerdictSince(n0) {
    try {
      if (!WA.store || typeof WA.store.txStat !== 'function') return '';
      const st = WA.store.txStat();
      const ln = st.lastNested;
      if (!ln || typeof ln !== 'object') return '';
      if (typeof ln.seq === 'number' && typeof n0 === 'number') {
        if (ln.seq < n0 + 1) return '';
      } else if (typeof st.count === 'number' && typeof n0 === 'number' && st.count < n0 + 1) {
        return '';
      }
      return (ln.why === 'threw') ? 'threw' : 'aborted';
    } catch (e) { return ''; }
  }
  /**
   * 取「当前该走的计划步」。**形状容忍**：`plan.current` 在 v2.1xx 收口成**扁平**回执
   *   （`{ok,id,status,seq,kind,text,need,place,tries}`），而本模块此前读的是 `planRow.step`
   *   ——那个字段**从来不存在** ⇒ `step` 恒 `undefined` ⇒ schedule 恒答 `no-step`、
   *   processReceipts 恒把回执塞进 `deferred`：「行动反馈闭环」这台机器 100% 空转，且没有任何
   *   一行读数报错（探针实测）。此处两种形状都认，并**把形状偏差留在自证位上**（WA.__agencyStepShapeWarn）。
   */
  function activeStepOf(who) {
    // 主源：`plan.view` —— 它把**每一步的状态**摆出来（running / pending / blocked / done）。
    //   为什么不用 `plan.current`：它的扁平回执只带当前 seq，且「当前步正在做」时它答
    //   `awaiting-after`（那一步的状态根本没被表达）⇒ 本模块拿不到 `status`，
    //   于是 `settle` 需要的 running 判据无从谈起。
    let row = null;
    try { if (WA.plan && WA.plan.view) row = WA.plan.view(who); } catch (e) { row = null; }
    if (row && row.ok === true) {
      const steps = Array.isArray(row.steps) ? row.steps : [];
      const running = steps.filter(function (x) { return x && x.status === 'running'; })[0] || null;
      const next = steps.filter(function (x) { return x && (x.status === 'pending' || x.status === 'blocked'); })[0] || null;
      const step = running || next;
      if (step) return { row: row, step: step, shape: 'view' };
      return { row: row, step: null, shape: 'no-step' };
    }
    // 回退：`plan.view` 缺席 / 答 not-ok ⇒ 用 `plan.current` 的扁平回执（它至少答得出 seq）
    let cur = null;
    try { if (WA.plan && WA.plan.current) cur = WA.plan.current(who); } catch (e) { cur = null; }
    if (!cur || cur.ok !== true) return { row: cur, step: null, shape: cur ? 'not-ok' : 'no-plan' };
    if (cur.step && typeof cur.step === 'object') return { row: cur, step: cur.step, shape: 'nested' };  // 老形状
    if (typeof cur.seq === 'number') return { row: cur, step: cur, shape: 'flat' };                       // 现行形状
    WA.__agencyStepShapeWarn = { got: Object.keys(cur).join(','), at: clockNow('agency') };
    return { row: cur, step: null, shape: 'unknown' };
  }
  /** 本模块的写入统一入口（三态：`failed` / `nested` / `chain`；链外顶层形状不变）。 */
  function chainWrite(kind, runInTx) {
    const ifl = chainInflight();
    const c = commitOf();
    const inner = (c && typeof c.active === 'function') ? c.active() : null;
    const hasStore = !!(WA.store && typeof WA.store.transact === 'function');
    if (!hasStore) {
      try { runInTx((WA.store && WA.store.get) ? (WA.store.get() || {}) : {}); } catch (e) {}
      return { persisted: false, chain: false, nostore: true };
    }
    if (!ifl) {
      if (inner) {
        const n0 = txCount();
        const r = WA.store.transact(runInTx, 'agency:' + kind);
        const nv = nestedVerdictSince(n0);
        if (nv) return { persisted: false, chain: false, nested: true, failed: nv === 'threw' ? 'write-threw' : 'write-aborted' };
        if (r && r.ok === false) return { persisted: false, chain: false, nested: true, failed: 'tx-failed' };
        return { persisted: false, chain: false, nested: true };
      }
      const r1 = WA.store.transact(runInTx, 'agency:' + kind);
      if (r1 && r1.ok === false) return { persisted: false, chain: false, failed: 'tx-failed' };
      return { persisted: true, chain: false };
    }
    const n1 = txCount();
    WA.store.transact(runInTx, 'agency:' + kind);   // 嵌套：落在链的那一份 draft 上
    const nv1 = nestedVerdictSince(n1);
    if (nv1) return { persisted: false, chain: true, failed: nv1 === 'threw' ? 'write-threw' : 'write-aborted' };
    return { persisted: false, chain: true };
  }
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
  /** 在指定层（草稿或已提交）上按人名找计划行 —— 镜像 plan 的 `planOf`，不跨层读。 */
  function planRowOf(root, who) {
    const st = (root && typeof root === 'object') ? root : state();
    const plans = (st.plan && Array.isArray(st.plan.plans)) ? st.plan.plans : [];
    const pid = 'p_' + clean(who, 60);
    return plans.filter(function (x) { return x && x.personId === pid; })[0] || null;
  }
  /** 当前待办步（**逐条对齐 plan.currentStep**：只认 pending，且前置已完成）。 */
  function pendingStepOf(row) {
    if (!row || !Array.isArray(row.steps)) return null;
    const doneSet = {};
    row.steps.forEach(function (s) { if (s && s.status === 'done') doneSet[s.seq] = true; });
    return row.steps.filter(function (s) {
      return s && s.status === 'pending'
        && (s.afterSeq === undefined || doneSet[s.afterSeq] === true);
    })[0] || null;
  }
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

    // ③ 读当前步（v2.194.0：`plan.current` 是**扁平**回执，此前读 `planRow.step` 恒 undefined ⇒ 恒 no-step）
    const _sp = activeStepOf(who);
    const step = _sp.step;
    const planId = (_sp.row && _sp.row.id) || planRow.id;
    if (!step) {
      stat.lastReason = 'no-step';
      return { ok: false, reason: 'no-step', person: who, planId: planId,
        hint: '计划当前没有可走的步（已做完 / 在等前置 / 形状不认）' };
    }
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
   * 在**这一层草稿**上「交出当前步」（plan.advance 的草稿版，只在链里用）。
   *   为什么不能直接调 `plan.advance`：它自带事务且**读已提交状态** —— 在链里调它，
   *   它会另开一笔顶层事务立刻提交，于是「步已交出」与紧随其后的结算**不同生共死**
   *   （专锁 A5b 实测：链被中止，计划步却停在 running）。
   *   闸门逐条对齐 plan.advance（尝试次数 / 前置 / 资源），**不镜像就等于比原实现更宽松**
   *   —— 「上游拒签的申请在下游被放行」是本仓点名过的谎报。
   */
  function advanceStepOnDraft(draft, who) {
    try {
      const cfg = settings();
      const row = planRowOf(draft, who);      // 闸门读**本层**那份计划行（链内 = 链的 draft）
      if (!row || !Array.isArray(row.steps)) return false;
      if ((row.tries || 0) >= (cfg.maxTries || 3)) return false;          // 尝试次数用尽 ⇒ 停下等人决定
      if (row.status === 'blocked') {                                     // 受阻不是锁：再交出一次 = 重试同一步
        row.steps.forEach(function (x) { if (x && x.status === 'blocked') x.status = 'pending'; });
        row.status = 'active'; row.reason = 'retrying';
      }
      const cur = pendingStepOf(row);                                     // 与 plan.currentStep 同口径（**只认 pending**）
      if (!cur) return false;                                             // 前置未满足
      if (cur.need && cur.need.resource) {                                // 资源不足只是「现在做不了」
        // 逐条对齐 `plan.stockOf`：取**人物行**（不是人名）再问 org —— org 缺席一律 null（不猜库存）
        const ppl = (draft && draft.people) || {};
        const prow = ppl['p_' + clean(who, 60)] || null;
        const st = (prow && WA.org && typeof WA.org.stockOf === 'function') ? WA.org.stockOf(prow) : null;
        if (st === null || !(Number(st[cur.need.resource]) >= cur.need.amount)) return false;
      }
      cur.status = 'running';
      cur.at = clockNow('agency');
      row.updatedAt = cur.at;
      return true;
    } catch (e) { return false; }
  }
  /**
   * 在**这一层草稿**上记下「这条回执已消化」。
   *   为什么必须有它：`!r._agencyProcessed` 是 `pending` 的唯一去重判据，而全库**没有任何地方写它**
   *   ——于是同一条回执每轮都会被当成新的再消化一次（探针实测：三次 processReceipts 全挂 deferred）。
   *   落在草稿上（而不是已提交那份）：这样它与「计划结算」同生共死，链被撤回时标记也一并回滚。
   *   找不到回执行 ⇒ 返回 false（静默空写不许读成成功），由调用方当场中止整链。
   */
  function markProcessedOnDraft(draft, actId, opId) {
    try {
      const rows = (draft.acts && Array.isArray(draft.acts.res)) ? draft.acts.res : null;
      if (!rows) return false;
      // 注：`draft` 在链内就是链那一份草稿；链外顶层自开事务时也是本笔的那份。
      const hit = rows.filter(function (q) { return q && ((opId && q.opId === opId) || (actId && (q.id === actId || q.actId === actId))); })[0];
      if (!hit) return false;
      hit._agencyProcessed = true;
      hit._agencyProcessedAt = clockNow('agency');
      return true;
    } catch (e) { return false; }
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
    let settledOut = null;

    if (!WA.plan || !WA.plan.settle) {
      stat.lastReason = 'plan-unavailable';
      return Object.assign(out, { reason: 'plan-unavailable' });
    }

    pending.forEach(function (r) {
      // 找到对应的行动行，拿到 person 和 goalId
      //   v2.194.0：`act` 的结算回执把行动 id 写在 **`id`** 上（`act.receipt()`：`{opId, id, person, ...}`），
      //   而本模块此前读 `r.actId` —— 那个字段**从来不存在** ⇒ `no-act-row` ⇒ 回执永远配不上行动行
      //   （探针实测：三次 processReceipts 全挂 deferred）。两处都认，并留下形状读数。
      const actId = r.actId || r.id || '';
      if (!actId) { out.deferred.push({ receipt: r.opId, reason: 'no-act-id', status: r.status }); return; }
      const rows = (st.acts && Array.isArray(st.acts.rows)) ? st.acts.rows : [];
      const actRow = rows.filter(function (x) { return x && (x.id === actId || (r.opId && x.opId === r.opId)); })[0] || null;
      if (!actRow) { out.deferred.push({ receipt: r.opId, reason: 'no-act-row', actId: actId }); return; }

      const who = actRow.person;
      const goalId = actRow.goalId;

      // 查计划当前步（v2.194.0：形状容忍 —— 此前读 `planRow.step` 恒 undefined，回执永远消化不了）
      const _sp2 = activeStepOf(who);
      const planRow = _sp2.row;
      if (!planRow || !planRow.ok) { out.deferred.push({ receipt: r.opId, reason: 'no-plan', person: who }); return; }

      const step = _sp2.step;
      if (!step) {
        out.deferred.push({ receipt: r.opId, reason: 'no-step', person: who });
        return;
      }
      // 步的状态**在链内才决定**：「交出这一步」（pending → running）必须与结算同一笔。
      //   此前本环走 `plan.advance`（自带事务、读已提交状态）—— 链外先把步标 running 并
      //   **立刻提交**，一旦随后的结算失败，世界就停在 running（专锁 A5b 实测）。
      //   故：终态（done/blocked/refused）才在此拒收；pending/running 都进链里办。
      if (step.status !== 'running' && step.status !== 'pending') {
        out.deferred.push({ receipt: r.opId, reason: 'step-not-running', person: who, seq: step.seq, status: step.status });
        return;
      }
      const needAdvance = (step.status === 'pending');

      // 行动结果映射到 plan 结算
      let outcome = 'done';
      let opts = {};
      if (r.status === 'failed') {
        outcome = 'blocked';
        opts.reason = str(r.reason || r.result || 'action-failed', 40);
      }

      // v2.194.0（U2）：**本笔开链** —— 「回执消化标记 + 计划结算」同链一次提交。
      //   此前两笔分属独立事务：settle 成了、消化标记没写上 ⇒ 同一条回执下一次**还会被再消化一次**
      //   （`pending` 的判据 `!r._agencyProcessed` 是**只读**字段，全库没有任何地方写它 —— 探针实测：
      //   连续三次 processReceipts 都把同一回执挂进 deferred，标记恒 null）。
      //   链内次序固定「先记账（无副作用）→ 后结算（有副作用）」，与 U2 各批同一条次序纪律。
      const ch = (function () {
        const c = commitOf();
        if (!c || typeof c.chain !== 'function' || chainInflight()) return null;   // 链内/无链面：走下面那支
        return c.chain({
          opId: nextOpId('agency:receipt'), site: 'agency:receipt',
          fn: function (cx, draft) {
            if (!markProcessedOnDraft(draft, actId, r.opId)) { cx.abortWhy = 'receipt-target-missing'; return false; }
            c.step(null, { site: 'agency:receipt:digest' });
            // 交出这一步：**在本链的草稿上**办（`plan.advance` 会另开一笔顶层事务立刻提交）
            if (needAdvance && !advanceStepOnDraft(draft, who)) {
              cx.abortWhy = 'advance-failed'; return false;
            }
            if (needAdvance) c.step(null, { site: 'agency:receipt:advance' });
            const st2 = WA.plan.settle(who, outcome, opts);
            if (!st2 || st2.ok !== true) { cx.abortWhy = 'plan-' + ((st2 && st2.reason) || 'settle-failed'); return false; }
            c.step(null, { site: 'agency:receipt:plan' });
            settledOut = st2;
            return true;
          }
        });
      })();
      if (ch) {
        if (ch.ok !== true) {
          out.deferred.push({ receipt: r.opId, reason: ch.reason || 'chain-failed', person: who,
            note: '回执未消化（本笔未执行）⇒ 计划步与消化标记不因本笔改变' });
          return;
        }
        out.processed++; out.chained = (out.chained || 0) + 1;
        if (outcome === 'done') { out.stepsDone++; stat.stepsDone++; } else { out.stepsBlocked++; stat.stepsBlocked++; }
        stat.receipts++;
        if (settledOut && settledOut.status === 'done') { out.goalsDone++; stat.goalsDone++; }
        return;
      }
      // 链内 / 无链面：先**交出这一步**（原路走 plan.advance），再结算，最后补消化标记。
      if (needAdvance) {
        let ad = null;
        try { ad = WA.plan.advance(who); } catch (e) { ad = null; }
        if (!ad || ad.ok !== true) {
          out.deferred.push({ receipt: r.opId, reason: 'step-not-running', person: who, seq: step.seq, why: (ad && ad.reason) || 'advance-failed' });
          return;
        }
      }
      const settled = WA.plan.settle(who, outcome, opts);
      if (settled && settled.ok) {
        const cw = chainWrite('receipt', function (d) { markProcessedOnDraft(d, actId, r.opId); });
        out.processed++;
        if (outcome === 'done') { out.stepsDone++; stat.stepsDone++; }
        else { out.stepsBlocked++; stat.stepsBlocked++; }
        stat.receipts++;
        if (!cw.persisted) out.unpersisted = (out.unpersisted || 0) + 1;
        if (settled.status === 'done') { out.goalsDone++; stat.goalsDone++; }
        // 不直接改 life.goals.status（life 是唯一写者）
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
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/agency.js', { kind: 'engine', ver: '2.194.0' });
})();
