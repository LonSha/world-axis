/**
 * WorldAxis engines/operations.js (v2.172.0) — TX9 权限批准、组织项目与运营结算
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   inst 有提案/批准/违约核验，org 有资源/项目/薪酬/债务。但「批准→执行→结算」
 *   这条链没有一条线：批准通过后谁创建项目？资源拨付走哪条回执？周期结算怎么
 *   和 org 的 payroll/debt 衔接？人员交接后项目归谁？operations 补的就是这一层。
 *
 * ── 本模块落点（协调者，不替代）──────────────────────────────
 *   · enact(decisionId, spec) —— 以 inst 批准回执创建运营项目（绑预算/执行者/里程碑）
 *   · disburse(projId, opts) —— 受控资源拨付（采购/薪酬/履约走同一批准）
 *   · settle(projId) —— 按明确剧情周期有界结算（不重复 org 已有支付）
 *   · handover(projId, fromPerson, toPerson) —— 人员交接移交具体项目/义务引用
 *   · active()/pending()/view()/cancel()/buildBlock()/diagnose()/stat()/reset()
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 默认关（enabled:false）。
 *   2 只有批准通过不等于项目完成——enact 检查 inst.decide 返回 approved 才创建。
 *   3 不能把私人人际关系当批准权——authority 走 inst 的 holdersOf。
 *   4 无权提案不能拨款——disburse 检查 inst.authority。
 *   5 资源不足保留明确阻塞——org.canAfford 失败时拒收不半写。
 *   6 同一周期不重复结算——settle 用 cycleTag 去重。
 *   7 调职/离任不静默清空旧债——handover 移交项目引用，旧义务保留。
 *   8 不凭空造批准/造项目/造资源/造结算。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_operations_settings_v1';
  var DEF = { enabled: false, maxProjects: 32 };
  var __REG = { key: LS_KEY, def: DEF, module: 'operations',
    bounds: { maxProjects: [4, 128] } };
  function getSettings() {
    var raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    var base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function setSettings(patch) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})))
      : Object.assign({}, getSettings(), patch || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  var _stat = { enacted: 0, disbursed: 0, settled: 0, handedOver: 0, cancelled: 0, refused: 0, lastReason: '', faults: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  const clockNow = function (tag) { try { return WA.clock.now(tag || 'operations'); } catch (e) { return Date.now(); } };
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket(root) { var r = root || state(); if (!r.operations) r.operations = { projects: [] }; if (!Array.isArray(r.operations.projects)) r.operations.projects = []; return r.operations; }
  function projects() { return bucket().projects || []; }
  function find(id) { var k = clean(id, 60); return projects().filter(function (x) { return x && x.id === k; })[0] || null; }
  function findByDecision(decisionId) { var k = clean(decisionId, 60); return projects().filter(function (x) { return x && x.decisionId === k; })[0] || null; }
  function newId() { return WA.rand ? WA.rand.id('ops_', 4, 'id') : 'ops_0000'; }

  // ── v2.194.0（U2）：跨模块链的写口边界（本模块五个写面共用）────────────
  //   本模块的五个写口原先各自 `WA.store.transact`。它们一旦被别的模块**放进外层事务**里调
  //   （链的常规形态：一条链只有一个 draft），`store.transact` 走嵌套分支 —— 世界写入随外层
  //   提交，而这里的返回值**照样是 `{ok:true}`**。外层随后被拒 / 抛错时，调用方拿着一句
  //   「拨付成功」，世界一格没动。本仓点名过这类「谎报成功」，故在此立一道边界：
  //     · 写入**照原路走**（嵌套 ⇒ 落在链的那一份 draft 上，与链里其它写入同生共死）；
  //     · 只有**回执**改口径：链上如实标 `chain:true, persisted:false`（未提交，另附推算值）。
  //   为什么**不**把写入推迟到链提交之后（早先试过「邀约 + 收尾处理器」，已撤）：
  //     `org.transfer` 这类写口自带事务、拒绝时返回 `{deferred:true}` 而不抛 —— 推迟版会把
  //     「转账失败」读成「邀约登记成功」，即把本项要治的**谎报成功**搬到另一个层。
  //     现在这一版让「转不出去」当场落回调用方手里，故是**报错**而不是白拿一个假回执。
  //   跨模块的那几笔（`org.transfer`）仍与本地记账分属两个 draft —— 链能保证的是
  //     「**参与了链的那些写入**整链原子」，填不平模块自己分两次提交留下的缝。如实记此边界。
  // ── 链的 opId：**消费方必须自带唯一的那个** ──────────────────────────
  //   链面未收到 opId 时按 `chain@<floor>` 兜底 —— 同一个 floor（同一段聊天）里第二条链就会
  //   撞上自己的第一条（`duplicate-op`）。专锁实测：面板连点两次拨付，第二次整笔作废。
  //   故本口自己发号：墙钟 + 模块内单调序号（**不动 `WA.rand` 的抽数流** —— 那会改掉
  //   既有测试冻结的随机序列）。调用方显式给了 opId 就用它的（幂等重试走这条）。
  var __opSeq = 0;
  function nextOpId(tag) { __opSeq++; return clean(tag, 40) + ':' + wallNow() + ':' + __opSeq; }

  function chainInflight() {
    return (WA.commit && typeof WA.commit.inflight === 'function') ? WA.commit.inflight() : null;
  }
  /**
   * 本模块写口的**提交时机**统一入口。
   *   链外顶层 ⇒ 逐字走原路（自己开事务），回执 `chain:false, persisted:true`。
   *   链外**嵌套**（调用方自己开了事务）⇒ 写入落在**调用方**那一份 draft 上，不归本链管
   *     ⇒ 回执如实标 `chain:false, persisted:false, nested:true`（不许说「已提交」，那正是谎报）。
   *   链上 ⇒ 照样走原路（`store.transact` 的嵌套保存点让它落在链的那一份 draft 上，链被拒时
   *     它一格不留 —— 这是链的原子性来源），回执标 `chain:true, persisted:false`。
   *   **不把写入推迟到链之后**：推迟会让它与链里其它写入不再同生共死，那正是本项要治的半写。
   *   **按 store 的返回体如实归因**：内层被拒（`aborted`/`denied`/`error`）⇒ 写入**根本没发生**
   *     ⇒ 交回 `failed`，写口据此报错；顶层被拒（保存点之外才可能）⇒ 同样 `failed`。
   *     （此前只看事务深度、不看返回体，内层拒签会被读成「已登记」——谎报的另一个入口。）
   * @returns {{persisted:boolean, chain:boolean, nested?:boolean, nostore?:boolean, failed?:string}}
   */
  /**
   * 刚刚这一趟 transact，**本模块自己的写**有没有被保存点撤回？
   *   为什么需要它：本模块的写口是**跨模块业务链**的参与方 —— 一旦被嵌在外层事务里
   *   （链上，或调用方自己的事务），`store.transact` 会返回 `ok:true / deferred:true`，
   *   **不告诉我写口内部返回了 false**（内层拒签被保存点原地撤回，外面只看见一个成功信封）。
   *   于是「没写成功」会被读成「写成功」—— 正是本项要治的谎报。
   *   真源用 `store.txStat().lastNested`（store 自己在嵌套分支写的台账，不是我方常量），
   *   并做**时效校验**：读数必须是**我这一笔的**，否则是上一次留下的旧读数。
   *   ⚠ 时效判据用 store 记的**单调序号** `seq`（本笔嵌套事务在 `txStat().count` 上的序号），
   *     **不是墙钟毫秒** —— 毫秒在测试冻结时钟下会给出**相等**读数，把旧读数误判成本次的，
   *     于是「目标不在草稿里」被读成「第一次嵌套写被撤回了」而拒收整链（专锁 C1 实测的跨进程抖动）。
   * @param {number} n0 本次写调用开始时 store.txStat().count（= 之前已发生的事务数）
   * @returns {''|'aborted'|'threw'}
   */
  function nestedVerdictSince(n0) {
    try {
      if (!WA.store || typeof WA.store.txStat !== 'function') return '';
      const st = WA.store.txStat();
      const ln = st.lastNested;
      if (!ln || typeof ln !== 'object') return '';
      if (typeof ln.seq === 'number' && typeof n0 === 'number') {
        if (ln.seq < n0 + 1) return '';                 // 序号在本次之前 ⇒ 旧读数，不归本次
      } else if (typeof st.count === 'number' && typeof n0 === 'number' && st.count < n0 + 1) {
        return '';                                       // 老 store（无 seq）：回退到计数口径
      }
      return (ln.why === 'threw') ? 'threw' : 'aborted';
    } catch (e) { return ''; }
  }
  /** 取「本次调用前已发生的事务数」（时效判据的基准，见上）。 */
  function txCount() { try { return (WA.store && typeof WA.store.txStat === 'function') ? (WA.store.txStat().count || 0) : 0; } catch (e) { return 0; } }
  function wallNow() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }

  /**
   * 在**链的这一层草稿**上记一笔运营支出。
   *   为什么必须有它：链内后一步的**预检读的是已提交状态**（`state()` / `find()`）——
   *   看不到本链里刚写进 draft、尚未提交的实体（探针实测 `viaState:0 / viaDraft:1`）。
   *   因此「链里先 enact 建账、再对同一账做 disburse」这类真实业务链，写口自己的 `find()`
   *   必然落空。它把记账直接落在草稿上，绕开这个只读快照。
   *   找不到目标 ⇒ 返回 false（**静默空写不许读成成功**），由调用方当场中止整链。
   */
  function spendOnDraft(draft, id, amount) {
    try {
      var b = (draft.operations = draft.operations || {});
      if (!Array.isArray(b.projects)) b.projects = [];
      var t = b.projects.filter(function (x) { return x && x.id === id; })[0];
      if (!t) return false;
      t.spent = (Number(t.spent) || 0) + amount;
      return true;
    } catch (e) { return false; }
  }

  function chainWrite(kind, id, runInTx) {
    const ifl = chainInflight();
    const inner = (WA.commit && typeof WA.commit.active === 'function') ? WA.commit.active() : null;
    const hasStore = !!(WA.store && typeof WA.store.transact === 'function');
    if (!hasStore) {
      // 无 store：与各写口原先的 `else` 分支同形（直改内存，落不进任何地方）
      try { runInTx((WA.store && WA.store.get) ? WA.store.get() : {}); } catch (e) {}
      return { persisted: false, chain: false, nostore: true };
    }
    if (!ifl) {
      if (inner) {
        // 调用方自己的事务里：写入随调用方提交（不是本模块的链，也不该由本模块记账）
        const n0 = txCount();
        const r = WA.store.transact(runInTx, 'operations:' + kind);
        const nv = nestedVerdictSince(n0);          // 同上：真判据优先
        if (nv) return { persisted: false, chain: false, nested: true, failed: nv === 'threw' ? 'write-threw' : 'write-aborted' };
        if (r && r.ok === false) return { persisted: false, chain: false, nested: true, failed: 'tx-' + (r.aborted ? 'aborted' : (r.denied ? 'denied' : (r.error ? 'error' : 'unknown'))) };
        return { persisted: false, chain: false, nested: true };
      }
      const r1 = WA.store.transact(runInTx, 'operations:' + kind);
      if (r1 && r1.ok === false) return { persisted: false, chain: false, failed: 'tx-' + (r1.aborted ? 'aborted' : (r1.denied ? 'denied' : (r1.error ? 'error' : 'unknown'))) };
      return { persisted: true, chain: false };
      // 注：顶层路径**不**查 lastNested —— 顶层没有保存点，写入就是写入了（多查只会引入假警报）。
    }
    const n1 = txCount();
    const r = WA.store.transact(runInTx, 'operations:' + kind);   // 嵌套：落在链的 draft 上
    // 真判据优先：内层被保存点撤回时，`store.transact` 照样返回一个成功信封（`ok:true/deferred:true`），
    //   所以只看它会把「没写进去」读成「写进去了」。`lastNested` 是 store 自己写的现场读数。
    const nv1 = nestedVerdictSince(n1);
    if (nv1) {
      // 本模块这一笔**没写进去**（被保存点撤回）⇒ 不许登记成链的一步、不许说「已登记」
      return { persisted: false, chain: true, failed: nv1 === 'threw' ? 'write-threw' : 'write-aborted' };
    }
    if (r && r.ok === false) {
      return { persisted: false, chain: true, failed: 'tx-' + (r.aborted ? 'aborted' : (r.denied ? 'denied' : (r.error ? 'error' : 'unknown'))) };
    }
    if (WA.commit && typeof WA.commit.step === 'function') {
      WA.commit.step(null, { site: 'operations:' + kind + ':' + clean(id, 40) });
    }
    return { persisted: false, chain: true };
  }

  // ── 1. enact：以 inst 批准回执创建运营项目 ──
  function enact(decisionId, spec) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var s = spec || {};
    var decId = clean(decisionId, 60);
    if (!decId) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'decisionId' }; }
    // 检查是否已 enact 过（同一批准不重复建项目）
    if (findByDecision(decId)) { noteFault('duplicate-enact'); return { ok: false, reason: 'duplicate-enact', decisionId: decId }; }
    var orgId = clean(s.orgId, 60);
    if (!orgId) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'orgId' }; }
    var approver = clean(s.approver, 40);
    if (!approver) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'approver' }; }
    // 验证 inst 批准状态——只有 approved 才能创建
    if (WA.inst && typeof WA.inst.authority === 'function') {
      var auth = WA.inst.authority(orgId, approver);
      if (!auth || !auth.ok || !auth.canApprove) { noteFault('not-authorized'); return { ok: false, reason: 'not-authorized', by: approver }; }
    }
    // 从 store 读组织数据查找决策状态
    var st = state();
    var instData = (st.inst && Array.isArray(st.inst.orgs)) ? st.inst.orgs : [];
    var instOrg = instData.filter(function (x) { return x && x.id === orgId; })[0] || null;
    if (!instOrg) { noteFault('unknown-org'); return { ok: false, reason: 'unknown-org', id: orgId }; }
    var dec = (instOrg.pending || []).filter(function (x) { return x && x.id === decId; })[0] || null;
    if (!dec) { noteFault('unknown-decision'); return { ok: false, reason: 'unknown-decision', id: decId }; }
    if (dec.status !== 'approved') { noteFault('not-approved'); return { ok: false, reason: 'not-approved', status: dec.status }; }
    if (projects().length >= cfg.maxProjects) { noteFault('projects-full'); return { ok: false, reason: 'projects-full', cap: cfg.maxProjects }; }
    var budget = s.budget ? Number(s.budget) : 0;
    var budgetType = clean(s.budgetType || 'gold', 30);
    // 检查预算可用性——仅当组织已注册为 faction 时检查资源（inst org 不是 faction 时走内部预算跟踪）
    if (budget > 0 && WA.org && typeof WA.org.canAfford === 'function') {
      var _factions = ((state().evolution || {}).factions) || [];
      var _factionExists = _factions.some(function (f) { return f && clean(f.name, 40) === orgId; });
      if (_factionExists && !WA.org.canAfford('faction', orgId, budgetType, budget)) { noteFault('insufficient-budget'); return { ok: false, reason: 'insufficient-budget', need: budget, type: budgetType }; }
    }
    var now = clockNow('operations');
    var milestones = Array.isArray(s.milestones) ? s.milestones.slice(0, 8).map(function (m, i) {
      return { label: clean(m.label || ('里程碑 ' + (i + 1)), 60), done: false, receiptId: clean(m.receiptId || '', 60) };
    }) : [];
    var rec = {
      id: newId(), decisionId: decId, orgId: orgId, approver: approver,
      name: clean(s.name || '运营项目', 60), description: clean(s.description || '', 120),
      budget: budget, budgetType: budgetType, spent: 0,
      owner: clean(s.owner || approver, 40),
      milestones: milestones, completedMilestones: 0,
      cycleTag: '', lastSettledAt: 0,
      status: 'active', createdAt: now, closedAt: 0
    };
    const cw = chainWrite('enact', rec.id, function (d) { bucket(d).projects.push(rec); return true; });
    if (cw.failed) { noteFault(cw.failed); return { ok: false, reason: cw.failed, chain: !!cw.chain }; }
    if (!cw.persisted) {
      // **未落库**（链上，或写进了调用方自己的事务）：不许把「已登记」说成「已提交」
      return { ok: true, id: rec.id, name: rec.name, owner: rec.owner, budget: budget,
        chain: !!cw.chain, nested: !!cw.nested, persisted: false, projected: true,
        note: cw.chain ? '已写进链的草稿，尚未提交（链提交后才生效）'
          : '已写进调用方自己的事务（nested），本模块未单独提交' };
    }
    if (WA.evict && typeof WA.evict.array === 'function') {
      try { WA.evict.array(bucket().projects, 'operations.projects'); } catch (e) {}
    }
    _stat.enacted++;
    return { ok: true, id: rec.id, name: rec.name, owner: rec.owner, budget: budget, chain: false, persisted: true };
  }

  // ── 2. disburse：受控资源拨付 ──
  function disburse(projId, opts) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(projId);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(projId, 60) }; }
    if (rec.status !== 'active') { noteFault('not-active'); return { ok: false, reason: 'not-active', status: rec.status }; }
    var o = opts || {};
    var amount = o.amount ? Number(o.amount) : 0;
    if (!amount || amount <= 0) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'amount' }; }
    var itemType = clean(o.itemType || rec.budgetType, 30);
    var purpose = clean(o.purpose || '运营支出', 60);
    var by = clean(o.by || rec.owner, 40);
    // 检查预算
    if (rec.spent + amount > rec.budget) { noteFault('over-budget'); return { ok: false, reason: 'over-budget', spent: rec.spent, budget: rec.budget, requested: amount }; }
    // 检查组织资源可用性——仅当组织已注册为 faction 时检查。
    //   v2.194.0（U2）：**本口现在自己开一条链**。此前这两笔世界写（跨模块转账 + 本地记账）
    //   分属**两个顶层事务** —— 转账成了、记账没成，就是「钱出去了、账上没记」的半写。
    //   放进同一条链之后：转账失败 ⇒ 链中止 ⇒ 世界一格不动；链成立才两笔都在。
    //   `org.transfer` 自带事务，链内嵌时走 store 的嵌套保存点；它转的是**已存在的双方**，
    //   两边落在同一份 draft 上 ⇒ 它扣下的资源随链真实落地（专锁 B5b 逐字比对资源）。
    //   链内**次序固定为「先记账、后转账」**：`org.transfer` 内部事务成功时会写 org 的
    //   流水/统计，那类**副作用撤不回**（链只撤得回世界）—— 故「目标账在草稿里找不到」
    //   必须在任何副作用发生**之前**就被挡下（专锁 B5l 用注释次序锁住这条）。
    //   这是链面的**第一个真实产品消费者**（此前链只有测试在调 —— 一处零调用的公开面）。
    var _dfactions = ((state().evolution || {}).factions) || [];
    var _dfactionExists = !!(WA.org && typeof WA.org.canAfford === 'function')
      && _dfactions.some(function (f) { return f && clean(f.name, 40) === clean(rec.orgId, 40); });
    if (_dfactionExists && !WA.org.canAfford('faction', rec.orgId, itemType, amount)) {
      noteFault('insufficient-funds'); return { ok: false, reason: 'insufficient-funds', type: itemType, need: amount };
    }
    if (_dfactionExists && typeof WA.org.transfer === 'function') {
      const _chainable = !!(WA.commit && typeof WA.commit.chain === 'function');
      const _outer = (WA.commit && typeof WA.commit.active === 'function') ? WA.commit.active() : null;
      if (_chainable && !chainInflight() && !_outer) {
        // 链外顶层（正常路径）：由本口开链，转账 + 记账整链一次提交
        const ch = WA.commit.chain({
          opId: (o.opId ? clean(o.opId, 60) : nextOpId('ops:disburse')), site: 'operations:disburse',
          fn: function (c, draft) {
            // 第一步：记账写进**这一层草稿**。`enact` 在链里建的项目也落在同一份 draft 上
            //   （链内后一步的预检读的是已提交状态，看不到它 —— 这正是必须直接写 draft 的原因）。
            //   它**没有副作用**，失败得越早越好：目标不在草稿里 ⇒ 当场中止，此时什么都还没发生。
            if (!spendOnDraft(draft, rec.id, amount)) { c.abortWhy = 'ledger-target-missing'; return false; }
            WA.commit.step(null, { site: 'operations:disburse:ledger' });
            // 第二步：跨模块转账（有副作用的那一笔）。真因挂在**链对象**上 —— 本面交还给消费方
            //   的是 `chainPack` 的**白名单字段**，挂在 `fn` 的局部变量上取不出来；挂 `abortWhy`
            //   正是中止路径读的那个字段（专锁 B5e/B5f 取证）。
            const tr = WA.org.transfer('faction', rec.orgId, 'person', by, itemType, amount);
            if (!tr || !tr.ok) { c.abortWhy = 'transfer-failed'; return false; }
            WA.commit.step(null, { site: 'operations:disburse:transfer' });
            return true;
          }
        });
        if (ch.ok !== true) {
          const why = ch.reason || 'chain-failed';
          noteFault(why);
          return { ok: false, reason: why, chain: true, persisted: false,
            note: '拨付未成（本笔未执行）⇒ 世界不因本笔改变 —— 转账与记账要么都在、要么都不在' };
        }
        // 链已提交：`find` 读的是提交后的内存（含本链写入），**不再自己加一次 amount**
        //   —— 早先那版成功分支重复计数（`Number(find().spent) + amount`）会虚报一倍支出。
        var upd2 = find(rec.id) || rec;
        _stat.disbursed++;
        return { ok: true, id: upd2.id, spent: Number(upd2.spent) || 0, budget: upd2.budget, purpose: purpose,
          chain: false, persisted: true, projected: false, atomic: true, opId: ch.opId };
      }
      // 链内 / 别人事务内：保持原路（写入随外层 draft 同生共死），失败当场落回调用方手里
      const tr = WA.org.transfer('faction', rec.orgId, 'person', by, itemType, amount);
      if (!tr || !tr.ok) { noteFault('transfer-failed'); return { ok: false, reason: 'transfer-failed', detail: tr ? tr.reason : 'none' }; }
    }
    const cwD = chainWrite('disburse', rec.id, function (d) {
      var b = bucket(d);
      var t = b.projects.filter(function (x) { return x && x.id === rec.id; })[0];
      if (!t) return false;        // 草稿里找不到目标 ⇒ 如实失败（静默空写不许读成成功）
      t.spent += amount;
      return true;
    });
    if (cwD.failed) { noteFault(cwD.failed); return { ok: false, reason: cwD.failed, chain: !!cwD.chain }; }
    if (!cwD.persisted) {
      // 未落库：回执里给的是**推算值**（`projected:true`），不是既成事实。
      return { ok: true, id: rec.id, spent: rec.spent + amount, budget: rec.budget, purpose: purpose,
        chain: !!cwD.chain, nested: !!cwD.nested, persisted: false, projected: true,
        note: cwD.chain ? '已写进链的草稿，尚未提交；spent 是推算值' : '已写进调用方自己的事务（nested）；spent 是推算值' };
    }
    var upd = find(rec.id) || rec;
    _stat.disbursed++;
    return { ok: true, id: upd.id, spent: upd.spent, budget: upd.budget, purpose: purpose,
      chain: false, persisted: true, projected: false };
  }

  // ── 3. settle：按明确剧情周期有界结算 ──
  function settle(projId, opts) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(projId);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(projId, 60) }; }
    if (rec.status !== 'active') { noteFault('not-active'); return { ok: false, reason: 'not-active', status: rec.status }; }
    var o = opts || {};
    var cycleTag = clean(o.cycleTag || '', 40);
    if (!cycleTag) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'cycleTag' }; }
    // 同一周期不重复结算
    if (rec.cycleTag === cycleTag) { noteFault('duplicate-settle'); return { ok: false, reason: 'duplicate-settle', cycleTag: cycleTag }; }
    var now = clockNow('operations');
    // 更新里程碑状态
    var milestoneIdx = o.milestoneIdx !== undefined ? Number(o.milestoneIdx) : -1;
    var milestoneDone = false;
    if (milestoneIdx >= 0 && rec.milestones[milestoneIdx]) {
      milestoneDone = true;
    }
    const cwS = chainWrite('settle', rec.id, function (d) {
      var b = bucket(d);
      var t = b.projects.filter(function (x) { return x && x.id === rec.id; })[0];
      if (!t) return false;        // 同上：找不到目标就是失败
      t.cycleTag = cycleTag; t.lastSettledAt = now;
      if (milestoneDone && t.milestones[milestoneIdx]) {
        t.milestones[milestoneIdx].done = true; t.completedMilestones++;
      }
      // 全部里程碑完成则关闭项目
      if (t.completedMilestones >= t.milestones.length && t.milestones.length > 0) {
        t.status = 'completed'; t.closedAt = now;
      }
      return true;
    });
    if (cwS.failed) { noteFault(cwS.failed); return { ok: false, reason: cwS.failed, chain: !!cwS.chain }; }
    if (!cwS.persisted) {
      // 未落库 ⇒ 里程碑/完成状态都是**推算值**
      var doneAfter = rec.completedMilestones + (milestoneDone ? 1 : 0);
      return { ok: true, id: rec.id, cycleTag: cycleTag, milestoneDone: milestoneDone,
        completedMilestones: doneAfter, totalMilestones: rec.milestones.length,
        status: (rec.milestones.length > 0 && doneAfter >= rec.milestones.length) ? 'completed' : rec.status,
        chain: !!cwS.chain, nested: !!cwS.nested, persisted: false, projected: true,
        note: cwS.chain ? '已写进链的草稿，尚未提交；里程碑与状态为推算值' : '已写进调用方自己的事务（nested）；里程碑与状态为推算值' };
    }
    var updated = find(rec.id) || rec;
    _stat.settled++;
    return { ok: true, id: updated.id, cycleTag: cycleTag, milestoneDone: milestoneDone,
      completedMilestones: updated.completedMilestones, totalMilestones: updated.milestones.length,
      status: updated.status, chain: false, persisted: true, projected: false };
  }

  // ── 4. handover：人员交接移交项目引用 ──
  function handover(projId, fromPerson, toPerson) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(projId);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(projId, 60) }; }
    if (rec.status !== 'active') { noteFault('not-active'); return { ok: false, reason: 'not-active', status: rec.status }; }
    var from = clean(fromPerson, 40), to = clean(toPerson, 40);
    if (!from || !to) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (rec.owner !== from) { noteFault('not-owner'); return { ok: false, reason: 'not-owner', current: rec.owner, attempted: from }; }
    const cwH = chainWrite('handover', rec.id, function (d) {
      var b = bucket(d);
      var t = b.projects.filter(function (x) { return x && x.id === rec.id; })[0];
      if (!t) return false;
      t.owner = to;
      return true;
    });
    if (cwH.failed) { noteFault(cwH.failed); return { ok: false, reason: cwH.failed, chain: !!cwH.chain }; }
    if (!cwH.persisted) {
      return { ok: true, id: rec.id, from: from, to: to, chain: !!cwH.chain, nested: !!cwH.nested, persisted: false, projected: true,
        note: cwH.chain ? '已写进链的草稿，尚未提交（交接未生效）' : '已写进调用方自己的事务（nested）；交接未由本模块提交' };
    }
    _stat.handedOver++;
    return { ok: true, id: rec.id, from: from, to: to, chain: false, persisted: true };
  }

  // ── 5. active ──
  function active() {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', items: [] };
    var cur = projects().filter(function (x) { return x && x.status === 'active'; });
    return { ok: true, items: cur.map(function (x) { return { id: x.id, name: x.name, orgId: x.orgId, owner: x.owner, spent: x.spent, budget: x.budget }; }),
      count: cur.length, cap: cfg.maxProjects };
  }

  // ── 6. pending ──
  function pending() {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', items: [] };
    var cur = projects().filter(function (x) { return x && x.status === 'active' && x.completedMilestones < x.milestones.length; });
    return { ok: true, items: cur.map(function (x) { return { id: x.id, name: x.name, completed: x.completedMilestones, total: x.milestones.length }; }),
      count: cur.length };
  }

  // ── 7. view ──
  function view(id) {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    var rec = find(id);
    if (!rec) return { ok: false, reason: 'not-found', id: clean(id, 60) };
    return { ok: true, id: rec.id, decisionId: rec.decisionId, orgId: rec.orgId, name: rec.name,
      owner: rec.owner, budget: rec.budget, budgetType: rec.budgetType, spent: rec.spent,
      milestones: rec.milestones, completedMilestones: rec.completedMilestones,
      cycleTag: rec.cycleTag, lastSettledAt: rec.lastSettledAt,
      status: rec.status, createdAt: rec.createdAt, closedAt: rec.closedAt };
  }

  // ── 8. cancel ──
  function cancel(id, reason) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(id);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    if (rec.status !== 'active') { noteFault('not-active'); return { ok: false, reason: 'not-active', status: rec.status }; }
    var rsn = clean(reason || 'cancelled', 60);
    const cwC = chainWrite('cancel', rec.id, function (d) {
      var b = bucket(d);
      var t = b.projects.filter(function (x) { return x && x.id === rec.id; })[0];
      if (!t) return false;
      t.status = 'cancelled'; t.closedAt = clockNow('operations');
      return true;
    });
    if (cwC.failed) { noteFault(cwC.failed); return { ok: false, reason: cwC.failed, chain: !!cwC.chain }; }
    if (!cwC.persisted) {
      return { ok: true, id: rec.id, reason: rsn, chain: !!cwC.chain, nested: !!cwC.nested, persisted: false, projected: true,
        note: cwC.chain ? '已写进链的草稿，尚未提交（取消未生效）' : '已写进调用方自己的事务（nested）；取消未由本模块提交' };
    }
    _stat.cancelled++;
    return { ok: true, id: rec.id, reason: rsn, chain: false, persisted: true };
  }

  // ── 9. buildBlock ──
  function buildBlock() {
    var cfg = getSettings();
    if (!cfg.enabled) return '';
    var cur = projects().filter(function (x) { return x && x.status === 'active'; });
    if (!cur.length) return '';
    var lines = ['[运营项目]'];
    cur.slice(0, Math.max(1, Math.floor(cfg.maxProjects / 2))).forEach(function (x) {
      lines.push('· ' + x.name + '（' + x.owner + '）' + x.spent + '/' + x.budget + ' ' + x.budgetType +
        (x.completedMilestones > 0 ? ' 里程碑 ' + x.completedMilestones + '/' + x.milestones.length : ''));
    });
    return lines.join('\n');
  }

  // ── 10. diagnose ──
  function diagnose() {
    var checks = {
      inst: !!(WA.inst && typeof WA.inst.view === 'function' && typeof WA.inst.authority === 'function'),
      org: !!(WA.org && typeof WA.org.transfer === 'function' && typeof WA.org.canAfford === 'function'),
      store: !!(WA.store && typeof WA.store.transact === 'function'),
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.read === 'function')
    };
    var ok = checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.172.0' };
  }

  // ── 11. stat ──
  function stat() {
    var cur = projects();
    return { enacted: _stat.enacted, disbursed: _stat.disbursed, settled: _stat.settled,
      handedOver: _stat.handedOver, cancelled: _stat.cancelled, refused: _stat.refused,
      lastReason: _stat.lastReason,
      active: cur.filter(function (x) { return x && x.status === 'active'; }).length,
      completed: cur.filter(function (x) { return x && x.status === 'completed'; }).length,
      cancelled: cur.filter(function (x) { return x && x.status === 'cancelled'; }).length,
      total: cur.length, cap: getSettings().maxProjects,
      faults: Object.assign({}, _stat.faults) };
  }

  /**
   * EXV5-2: 据点暴露度与安全屋废弃机制（trackSafehouseExposure）
   * 记录据点出入频次与异常事件，计算暴露度；超过临界值触发弃用与撤离状态
   */
  function trackSafehouseExposure(safehouseId, options) {
    const sid = clean(safehouseId, 60);
    if (!sid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const opts = options || {};
    const visits = Math.max(0, Number(opts.visits) || 1);
    const incidentSeverity = Math.max(0, Number(opts.incidentSeverity) || 0); // 0-10
    const place = clean(opts.place, 60) || '秘密据点';

    let out = null;
    WA.store.transact(function (draft) {
      draft.operations = draft.operations || {};
      draft.operations.safehouses = draft.operations.safehouses || {};
      const sh = draft.operations.safehouses[sid] = draft.operations.safehouses[sid] || {
        id: sid,
        place: place,
        visits: 0,
        exposure: 0,
        status: 'secure', // 'secure', 'compromised', 'abandoned'
        history: []
      };

      sh.visits += visits;
      // 每次访问累积暴露度（+5），突发事件按严重度剧烈提升（每级+12）
      const addedExposure = visits * 5 + incidentSeverity * 12;
      sh.exposure = Math.min(100, (sh.exposure || 0) + addedExposure);

      if (sh.exposure >= 80) {
        sh.status = 'abandoned';
      } else if (sh.exposure >= 45) {
        sh.status = 'compromised';
      } else {
        sh.status = 'secure';
      }

      sh.history.push({
        at: clockNow('operations:exposure'),
        visits: visits,
        incidentSeverity: incidentSeverity,
        exposure: sh.exposure,
        status: sh.status
      });
      if (sh.history.length > 10) sh.history.shift();

      out = {
        ok: true,
        id: sid,
        place: place,
        visits: sh.visits,
        exposure: sh.exposure,
        status: sh.status,
        shouldEvacuate: sh.status === 'abandoned' || sh.status === 'compromised',
        note: sh.status === 'abandoned' ? '据点已彻底暴露，必须立刻弃用撤离！' : (sh.status === 'compromised' ? '据点受到怀疑，应减少出入' : '据点目前安全隐蔽')
      };
      return true;
    }, 'operations:trackSafehouseExposure');

    return out || { ok: false, reason: 'store-unavailable' };
  }

  // ── 12. reset ──
  function reset() { _stat.enacted = 0; _stat.disbursed = 0; _stat.settled = 0; _stat.handedOver = 0; _stat.cancelled = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }
  WA.operations = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    enact: enact,
    disburse: disburse,
    settle: settle,
    handover: handover,
    active: active,
    pending: pending,
    view: view,
    cancel: cancel,
    trackSafehouseExposure: trackSafehouseExposure,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  // 导出面自证：本模块的出口面是**冻结**的（新增导出必须同批改这个常量，否则装载即抛
  //   —— 防「成员被悄悄改名/删掉、调用方静默降级」。v2.242.0（EXV5-2）增加 trackSafehouseExposure：15）。
  var EXPORT_COUNT = 15;
  var _exported = Object.keys(WA.operations).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('operations: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/operations.js', { kind: 'engine', ver: '2.242.0' });
})();
