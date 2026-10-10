/**
 * WorldAxis engines/commission.js (v2.169.0) — TX6 多阶段委托、交付核验与资源履约
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   opportunity 有窗口、接受/拒绝/延后；liaison 有约定、到期结算、证据；org 有项目、债务、支付。
 *   但「多阶段委托」没有一条链：接了委托不知道有几个阶段、每阶段交付什么、验收条件是什么、
 *   报酬怎么按阶段付、部分履约怎么结算。commission 补的就是这一层。
 *
 * ── 本模块落点（协调者，不替代）──────────────────────────────
 *   · create(spec) —— 登记委托合同（具名阶段 + 期限 + 交付对象 + 验收条件 + 报酬 + 预付/托管）。
 *   · advance(id, receipt) —— 核验回执满足当前阶段验收条件后推进到下一阶段。
 *   · settle(id) —— 按已完成阶段结算报酬（调 org.transfer 支付）。
 *   · cancel(id, reason) —— 取消委托，按已执行阶段结算余额与责任。
 *   · view/pending/buildBlock/diagnose/stat —— 只读面。
 *
 * ── 与既有模块的分工 ──
 *   · opportunity —— 机会窗口（本模块不重做窗口面）；
 *   · liaison —— 约定与到期（本模块不重做约定面）；
 *   · org —— 资源/薪酬/项目（本模块调 transfer 支付报酬，不自己造账）。
 *   · act/freight —— 阶段引用回执（act 回执 / freight 到货回执），本模块只核验不执行。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 默认关（enabled:false）。
 *   2 不根据正文一句「完成了」自动付钱——阶段验收必须有规则回执（receiptId）。
 *   3 没有预算的委托不能承诺可领取的奖励——create 时检查 org.canAfford。
 *   4 同一完成证据不能重复领报酬——settle 用 receiptId 去重。
 *   5 关系反馈复用 liaison 的真源——本模块不写关系面。
 *   6 托管资源有明确所有者和退回规则——cancel 时退回未消费的托管。
 *   7 超期不默认认定恶意——cancel 区分超期/主动取消/违约，结算不同。
 *   8 不凭空造回执/造资源/造阶段——回执来自 act/freight/org，报酬来自 org.transfer。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_commission_settings_v1';
  var DEF = { enabled: false, maxContracts: 24, maxStages: 8 };
  var __REG = { key: LS_KEY, def: DEF, module: 'commission',
    bounds: { maxContracts: [2, 64], maxStages: [2, 16] } };
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
  var _stat = { created: 0, advanced: 0, settled: 0, cancelled: 0, refused: 0, lastReason: '', faults: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  const clockNow = function (tag) { try { return WA.clock.now(tag || 'commission'); } catch (e) { return Date.now(); } };
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket(root) { var r = root || state(); if (!r.commission) r.commission = { contracts: [] }; if (!Array.isArray(r.commission.contracts)) r.commission.contracts = []; return r.commission; }
  function list() { return bucket().contracts || []; }
  function find(id) { var k = clean(id, 60); return list().filter(function (x) { return x && x.id === k; })[0] || null; }
  function newId() { return WA.rand ? WA.rand.id('cm_', 4, 'id') : 'cm_0000'; }

  // ── v2.194.0（U2）：本模块的**提交时机**统一入口 ────────────────────
  //   本模块四个写口原先各自 `WA.store.transact`。一旦被别的模块**放进外层事务**里调
  //   （链的常规形态：一条链只有一个 draft），`store.transact` 走嵌套分支 —— 世界写入随外层
  //   提交，而这里的返回值**照样是 `ok:true`**。外层随后被拒 / 抛错时，调用方拿着一句
  //   「委托已结算」，世界一格没动。本仓点名过这类「谎报成功」，故在此立一道边界：
  //     · 写入**照原路走**（嵌套 ⇒ 落在链的那一份 draft 上，与链里其它写入同生共死）；
  //     · 只有**回执**改口径：链上 / 别人事务内如实标 `persisted:false`（未提交，另附推算值）。
  //     · **不把写入推迟到链之后**（推迟会让它与链里其它写入不再同生共死，那正是本项要治的半写）。
  //   真源判据用 `store.txStat().lastNested`（store 自己写的台账，不是本模块的常量），
  //   并做时效校验：读数时刻必须晚于本次调用开始，否则是上一次事务留下的旧读数。
  function chainInflight() {
    return (WA.commit && typeof WA.commit.inflight === 'function') ? WA.commit.inflight() : null;
  }
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
  function wallNow() { try { return (WA.clock && WA.clock.wallNow) ? WA.clock.wallNow() : Date.now(); } catch (e) { return Date.now(); } }
  /**
   * 写口的提交时机统一入口（三态：`failed` / `nested` / `chain`；链外顶层形状不变）。
   * @returns {{persisted:boolean, chain:boolean, nested?:boolean, nostore?:boolean, failed?:string}}
   */
  function chainWrite(kind, runInTx) {
    const ifl = chainInflight();
    const inner = (WA.commit && typeof WA.commit.active === 'function') ? WA.commit.active() : null;
    const hasStore = !!(WA.store && typeof WA.store.transact === 'function');
    if (!hasStore) {
      try { runInTx(WA.store && WA.store.get ? (WA.store.get() || {}) : {}); } catch (e) {}
      return { persisted: false, chain: false, nostore: true };
    }
    if (!ifl) {
      if (inner) {
        const n0 = txCount();
        const r = WA.store.transact(runInTx, 'commission:' + kind);
        const nv = nestedVerdictSince(n0);
        if (nv) return { persisted: false, chain: false, nested: true, failed: nv === 'threw' ? 'write-threw' : 'write-aborted' };
        if (r && r.ok === false) return { persisted: false, chain: false, nested: true, failed: 'tx-' + (r.denied ? 'denied' : 'aborted') };
        return { persisted: false, chain: false, nested: true };
      }
      const n0 = txCount();
      const r = WA.store.transact(runInTx, 'commission:' + kind);
      const nv = nestedVerdictSince(n0);
      if (nv) return { persisted: false, chain: false, failed: nv === 'threw' ? 'write-threw' : 'write-aborted' };
      if (!r || r.ok !== true) {
        return { persisted: false, chain: false, failed: (r && r.denied) ? 'tx-denied' : ((r && r.error) ? 'tx-error' : 'tx-aborted') };
      }
      return { persisted: true, chain: false };
    }
    // 链上：写入落在链的那一份 draft 上（链提交后才生效）
    const n0 = txCount();
    const r = WA.store.transact(runInTx, 'commission:' + kind);
    const nv = nestedVerdictSince(n0);
    if (nv) return { persisted: false, chain: true, failed: nv === 'threw' ? 'write-threw' : 'write-aborted' };
    if (r && r.ok === false) return { persisted: false, chain: true, failed: 'tx-aborted' };
    return { persisted: false, chain: true };
  }
  /** 链的 opId：**消费方自带唯一的那个**（链面默认按 floor 去重，同段第二次会误判 duplicate-op）。 */
  var __opSeq = 0;
  function nextOpId(tag) { __opSeq++; return clean(tag, 40) + ':' + wallNow() + ':' + __opSeq; }

  /**
   * 在**链的这一层草稿**上标记合约状态。为什么必须有它：链内后一步的预检读的是**已提交状态**
   *   （`find()` / `list()`）—— 看不到本链里刚写进 draft、尚未提交的实体（v2.194.0 批次①实证：
   *   链内先建后读，`viaState:0 / viaDraft:1`）。故链内的状态改写在草稿上做，绕开这个只读快照。
   *   找不到目标 ⇒ 返回 false（**静默空写不许读成成功**），由调用方当场中止整链。
   */
  function markSettledOnDraft(draft, id) {
    try {
      var b = bucket(draft);
      var t = b.contracts.filter(function (x) { return x && x.id === id; })[0];
      if (!t) return false;
      t.status = 'settled'; t.settledAt = clockNow('commission');
      return true;
    } catch (e) { return false; }
  }
  function markCancelledOnDraft(draft, id, why) {
    try {
      var b = bucket(draft);
      var t = b.contracts.filter(function (x) { return x && x.id === id; })[0];
      if (!t) return false;
      t.status = 'cancelled'; t.cancelledAt = clockNow('commission'); t.cancelReason = why;
      return true;
    } catch (e) { return false; }
  }

  function create(spec) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var s = spec || {};
    var title = clean(s.title, 80);
    if (!title) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'title' }; }
    var principal = clean(s.principal, 60);
    var agent = clean(s.agent, 60);
    if (!principal || !agent) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: !principal ? 'principal' : 'agent' }; }
    var stages = Array.isArray(s.stages) ? s.stages : [];
    if (stages.length < 1) { noteFault('no-stages'); return { ok: false, reason: 'no-stages', have: stages.length, need: 1 }; }
    if (stages.length > cfg.maxStages) { noteFault('too-many-stages'); return { ok: false, reason: 'too-many-stages', cap: cfg.maxStages }; }
    var cur = list();
    if (cur.length >= cfg.maxContracts) { noteFault('contracts-full'); return { ok: false, reason: 'contracts-full', cap: cfg.maxContracts }; }
    // v2.194.0（U2）：**报酬的载体必须显式** —— 有报酬就必须说清「付的是哪一项资源」
    //   与「支付方/受托方是势力还是个人」（org 的世界里这笔转账靠这两样才成立）。
    //   此前 `canAfford(principal, reward)` 是**参数错位**（把 name 当 kind、把数当 name）
    //   ⇒ 恒 false ⇒ 任何 reward>0 的委托都建不出来，「按阶段付报酬」这条能力整个是死的（探针实测）。
    var reward = Number(s.reward) || 0;
    var item = clean(s.item || '', 30);
    var pk = clean(s.principalKind || 'person', 12);
    var ak = clean(s.agentKind || 'person', 12);
    var ek = clean(s.escrowKind || 'person', 12);
    if (reward > 0) {
      if (!item) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'item', hint: '有报酬就必须给出资源项（org 的转账按项成立）' }; }
      if (WA.org && Array.isArray(WA.org.KINDS)) {
        if (WA.org.KINDS.indexOf(pk) < 0) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'principalKind', allowed: WA.org.KINDS.slice() }; }
        if (WA.org.KINDS.indexOf(ak) < 0) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'agentKind', allowed: WA.org.KINDS.slice() }; }
      }
      if (WA.org && typeof WA.org.canAfford === 'function') {
        var aff = WA.org.canAfford(pk, principal, item, reward);
        if (!aff) { noteFault('no-budget'); return { ok: false, reason: 'no-budget', kind: pk, principal: principal, item: item, reward: reward }; }
      }
    }
    var stageList = stages.map(function (st, i) {
      return {
        index: i,
        label: clean(st.label || ('阶段' + (i + 1)), 60),
        deadline: st.deadline ? Number(st.deadline) : 0,
        deliverable: clean(st.deliverable || '', 120),
        verifyRule: clean(st.verifyRule || '', 120),
        reward: Number(st.reward) || 0,
        receiptId: '',
        status: i === 0 ? 'active' : 'pending',
        completedAt: 0
      };
    });
    var rec = {
      id: newId(), title: title, principal: principal, agent: agent,
      principalKind: pk, agentKind: ak, item: item,
      stages: stageList, currentStage: 0,
      reward: reward, prepaid: Number(s.prepaid) || 0,
      escrow: s.escrow ? clean(s.escrow, 60) : '', escrowKind: ek,
      status: 'active', at: clockNow('commission'),
      settledAt: 0, cancelledAt: 0, cancelReason: ''
    };
    const cwC = chainWrite('create', function (d) {
      var b = bucket(d);
      if (!Array.isArray(b.contracts)) b.contracts = [];
      if (b.contracts.length >= cfg.maxContracts) return false;   // 草稿上再判一次（并发/重复入册）
      b.contracts.push(rec);
      return true;
    });
    if (cwC.failed) { noteFault(cwC.failed); return { ok: false, reason: cwC.failed, chain: !!cwC.chain }; }
    if (!cwC.persisted) {
      return { ok: true, id: rec.id, title: title, stages: stageList.length,
        chain: !!cwC.chain, nested: !!cwC.nested, persisted: false, projected: true,
        note: cwC.chain ? '已写进链的草稿，尚未提交（链提交后才生效）'
          : (cwC.nostore ? '无 store：只改了内存，落不进任何地方' : '已写进调用方自己的事务（nested），本模块未单独提交') };
    }
    if (WA.evict && typeof WA.evict.array === 'function') {
      try { WA.evict.array(bucket().contracts, 'commission.contracts'); } catch (e) {}
    }
    _stat.created++;
    return { ok: true, id: rec.id, title: title, stages: stageList.length, chain: false, persisted: true };
  }

  function advance(id, receiptId) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(id);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    if (rec.status !== 'active') { noteFault('not-active'); return { ok: false, reason: 'not-active', status: rec.status }; }
    var st = rec.stages[rec.currentStage];
    if (!st || st.status !== 'active') { noteFault('bad-state'); return { ok: false, reason: 'bad-state', stage: rec.currentStage }; }
    var rid = clean(receiptId, 60);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'receiptId' }; }
    // 检查回执是否已用过（去重）
    var used = rec.stages.some(function (x) { return x.receiptId === rid; });
    if (used) { noteFault('duplicate-receipt'); return { ok: false, reason: 'duplicate-receipt', receiptId: rid }; }
    // 推进阶段
    const cwA = chainWrite('advance', function (d) {
      var b = bucket(d);
      var t = b.contracts.filter(function (x) { return x && x.id === rec.id; })[0];
      if (!t || !t.stages || !t.stages[rec.currentStage]) return false;   // 草稿里找不到目标 ⇒ 如实失败
      t.stages[rec.currentStage].receiptId = rid;
      t.stages[rec.currentStage].status = 'done';
      t.stages[rec.currentStage].completedAt = clockNow('commission');
      if (rec.currentStage + 1 < t.stages.length) {
        t.stages[rec.currentStage + 1].status = 'active';
        t.currentStage = rec.currentStage + 1;
      } else {
        t.status = 'completed';
      }
      return true;
    });
    if (cwA.failed) { noteFault(cwA.failed); return { ok: false, reason: cwA.failed, chain: !!cwA.chain }; }
    _stat.advanced++;
    return { ok: true, id: rec.id, stage: rec.currentStage, receiptId: rid,
      chain: !!cwA.chain, nested: !!cwA.nested, persisted: !!cwA.persisted,
      projected: !cwA.persisted };
  }

  function settle(id) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(id);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    if (rec.status === 'settled') { noteFault('already-settled'); return { ok: false, reason: 'already-settled' }; }
    if (rec.status === 'cancelled') { noteFault('not-active'); return { ok: false, reason: 'not-active', status: 'cancelled' }; }
    // 按已完成阶段计算报酬
    var doneStages = rec.stages.filter(function (x) { return x.status === 'done'; });
    var totalReward = doneStages.reduce(function (s, x) { return s + (Number(x.reward) || 0); }, 0);
    var paid = rec.prepaid || 0;
    var due = Math.max(0, totalReward - paid);
    // v2.194.0（U2）：**本口开链**（转账 + 记账同链一次提交）。
    //   此前这两笔分属两个顶层事务，且转账调用是**错的**：`org.transfer` 的真签名是
    //   `(fromKind, fromName, toKind, toName, item, amount)`，旧代码只给了 4 个实参
    //   ⇒ `clean(item)` 拿到的是个字符串标签 'commission:settle' 与 undefined ⇒ 恒 `bad-resource`。
    //   而返回值被读成 `r.ok !== false` ⇒ 转账**从未发生**，合约照样被记成 settled、回执照样报
    //   `paid:true`（探针实测）。现在：转账失败 ⇒ 整链中止（合约状态一格不动），归因如实交回。
    const _payable = due > 0 && WA.org && typeof WA.org.transfer === 'function';
    const _item = rec.item;
    const _pk = rec.principalKind || 'person', _ak = rec.agentKind || 'person';
    const _chainable = !!(WA.commit && typeof WA.commit.chain === 'function');
    const _outer = (WA.commit && typeof WA.commit.active === 'function') ? WA.commit.active() : null;
    if (_payable && !_item) {
      noteFault('missing-fields');
      return { ok: false, reason: 'missing-fields', field: 'item',
        hint: '有报酬的委托必须带资源项（旧委托可用 top-up 补：settle 无法凭空知道付的是什么）' };
    }
    if (_payable && !chainInflight() && !_outer && _chainable) {
      const ch = WA.commit.chain({
        opId: nextOpId('commission:settle'), site: 'commission:settle',
        fn: function (c, draft) {
          // 第一步：记账（无副作用）—— 目标不在草稿里 ⇒ 当场中止，此时什么都还没发生
          if (!markSettledOnDraft(draft, rec.id)) { c.abortWhy = 'ledger-target-missing'; return false; }
          WA.commit.step(null, { site: 'commission:settle:ledger' });
          // 第二步：跨模块转账（有副作用的那一笔）
          const tr = WA.org.transfer(_pk, rec.principal, _ak, rec.agent, _item, due);
          if (!tr || !tr.ok) { c.abortWhy = 'transfer-failed'; return false; }
          WA.commit.step(null, { site: 'commission:settle:transfer' });
          return true;
        }
      });
      if (ch.ok !== true) {
        const why = ch.reason || 'chain-failed';
        noteFault(why);
        return { ok: false, reason: why, chain: true, persisted: false,
          totalReward: totalReward, prepaid: paid, due: due,
          note: '结算未成（本笔未执行）⇒ 合约状态不因本笔改变 —— 转账与记账要么都在、要么都不在' };
      }
      _stat.settled++;
      return { ok: true, id: rec.id, totalReward: totalReward, prepaid: paid, due: due, paid: true,
        chain: false, persisted: true, projected: false, atomic: true, opId: ch.opId, item: _item };
    }
    // 链内 / 别人事务内 / 无可付（due=0）：走统一入口，写入与转账都留在调用方那层 draft 上
    let paid_ok = due === 0;
    if (_payable) {
      const tr = WA.org.transfer(_pk, rec.principal, _ak, rec.agent, _item, due);
      if (!tr || !tr.ok) { noteFault('transfer-failed'); return { ok: false, reason: 'transfer-failed', detail: tr ? tr.reason : 'none' }; }
      paid_ok = true;
    }
    const cwS = chainWrite('settle', function (d) { return markSettledOnDraft(d, rec.id); });
    if (cwS.failed) { noteFault(cwS.failed); return { ok: false, reason: cwS.failed, chain: !!cwS.chain }; }
    _stat.settled++;
    return { ok: true, id: rec.id, totalReward: totalReward, prepaid: paid, due: due, paid: paid_ok,
      chain: !!cwS.chain, nested: !!cwS.nested, persisted: !!cwS.persisted, projected: !cwS.persisted };
  }

  function cancel(id, reason) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(id);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    if (rec.status === 'cancelled' || rec.status === 'settled') { noteFault('not-active'); return { ok: false, reason: 'not-active', status: rec.status }; }
    var rsn = clean(reason || 'cancelled', 60);
    // 按已执行阶段结算余额
    var doneStages = rec.stages.filter(function (x) { return x.status === 'done'; });
    var earned = doneStages.reduce(function (s, x) { return s + (Number(x.reward) || 0); }, 0);
    var prepaid = rec.prepaid || 0;
    var refund = Math.max(0, prepaid - earned);
    // v2.194.0（U2）：与 settle 同型 —— **本口开链**。旧代码的退回同样是 4 实参调用
    //   （恒 `bad-resource`）且**异常被静默吞掉**（`catch (e) {}`）：托管没退回，合约照样记 cancelled。
    //   现在：退不回 ⇒ 整链中止（合约状态一格不动），归因如实交回。
    const _refundable = refund > 0 && WA.org && typeof WA.org.transfer === 'function' && !!rec.escrow;
    const _rk = rec.escrowKind || 'person', _pk2 = rec.principalKind || 'person';
    const _chainable = !!(WA.commit && typeof WA.commit.chain === 'function');
    const _outer = (WA.commit && typeof WA.commit.active === 'function') ? WA.commit.active() : null;
    if (_refundable && !rec.item) {
      noteFault('missing-fields');
      return { ok: false, reason: 'missing-fields', field: 'item', hint: '要退托管就必须有资源项（旧委托缺此项）' };
    }
    if (_refundable && !chainInflight() && !_outer && _chainable) {
      const ch = WA.commit.chain({
        opId: nextOpId('commission:cancel'), site: 'commission:cancel',
        fn: function (c, draft) {
          if (!markCancelledOnDraft(draft, rec.id, rsn)) { c.abortWhy = 'ledger-target-missing'; return false; }
          WA.commit.step(null, { site: 'commission:cancel:ledger' });
          const tr = WA.org.transfer(_rk, rec.escrow, _pk2, rec.principal, rec.item, refund);
          if (!tr || !tr.ok) { c.abortWhy = 'refund-failed'; return false; }
          WA.commit.step(null, { site: 'commission:cancel:refund' });
          return true;
        }
      });
      if (ch.ok !== true) {
        const why = ch.reason || 'chain-failed';
        noteFault(why);
        return { ok: false, reason: why, chain: true, persisted: false,
          earned: earned, refund: refund,
          note: '取消失败（本笔未执行）⇒ 合约状态不因本笔改变 —— 退款与记账要么都在、要么都不在' };
      }
      _stat.cancelled++;
      return { ok: true, id: rec.id, reason: rsn, earned: earned, refund: refund,
        chain: false, persisted: true, projected: false, atomic: true, opId: ch.opId };
    }
    if (_refundable) {
      const tr = WA.org.transfer(_rk, rec.escrow, _pk2, rec.principal, rec.item, refund);
      if (!tr || !tr.ok) { noteFault('refund-failed'); return { ok: false, reason: 'refund-failed', detail: tr ? tr.reason : 'none' }; }
    }
    const cwC = chainWrite('cancel', function (d) { return markCancelledOnDraft(d, rec.id, rsn); });
    if (cwC.failed) { noteFault(cwC.failed); return { ok: false, reason: cwC.failed, chain: !!cwC.chain }; }
    _stat.cancelled++;
    return { ok: true, id: rec.id, reason: rsn, earned: earned, refund: refund,
      chain: !!cwC.chain, nested: !!cwC.nested, persisted: !!cwC.persisted, projected: !cwC.persisted };
  }

  function view(id) {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    var rec = find(id);
    if (!rec) return { ok: false, reason: 'not-found', id: clean(id, 60) };
    return { ok: true, id: rec.id, title: rec.title, status: rec.status,
      principal: rec.principal, agent: rec.agent,
      stages: rec.stages, currentStage: rec.currentStage,
      reward: rec.reward, prepaid: rec.prepaid };
  }

  function pending() {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', items: [] };
    var cur = list().filter(function (x) { return x && x.status === 'active'; });
    return { ok: true, items: cur.map(function (x) { return { id: x.id, title: x.title, stage: x.currentStage, total: x.stages.length }; }),
      count: cur.length, cap: cfg.maxContracts };
  }

  function buildBlock() {
    var cfg = getSettings();
    if (!cfg.enabled) return '';
    var cur = list().filter(function (x) { return x && x.status === 'active'; });
    if (!cur.length) return '';
    var lines = ['[委托履约]'];
    cur.slice(0, Math.max(1, Math.floor(cfg.maxContracts))).forEach(function (x) {
      lines.push('· ' + x.title + '（阶段 ' + (x.currentStage + 1) + '/' + x.stages.length + '）');
    });
    return lines.join('\n');
  }

  function diagnose() {
    var checks = {
      org: !!(WA.org && typeof WA.org.transfer === 'function' && typeof WA.org.canAfford === 'function'),
      store: !!(WA.store && typeof WA.store.transact === 'function'),
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.read === 'function')
    };
    var ok = checks.org && checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.194.0' };
  }

  function stat() {
    var cur = list();
    return { created: _stat.created, advanced: _stat.advanced, settled: _stat.settled,
      cancelled: _stat.cancelled, refused: _stat.refused, lastReason: _stat.lastReason,
      active: cur.filter(function (x) { return x && x.status === 'active'; }).length,
      total: cur.length, cap: getSettings().maxContracts,
      faults: Object.assign({}, _stat.faults) };
  }

  function reset() { _stat.created = 0; _stat.advanced = 0; _stat.settled = 0; _stat.cancelled = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  WA.commission = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    create: create,
    advance: advance,
    settle: settle,
    cancel: cancel,
    view: view,
    pending: pending,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 12;
  var _exported = Object.keys(WA.commission).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('commission: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/commission.js', { kind: 'engine', ver: '2.194.0' });
})();
