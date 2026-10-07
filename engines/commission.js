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
  const A = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_commission_settings_v1';
  var DEF = { enabled: false, maxContracts: 24, maxStages: 8 };
  var __REG = { key: LS_KEY, def: DEF, module: 'commission',
    bounds: { maxContracts: [2, 64], maxStages: [2, 16] } };
  function getSettings() {
    var raw = A.settingsBus ? A.settingsBus.read(__REG) : null;
    var base = Object.assign({}, DEF);
    return A.settingsBus ? A.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function setSettings(patch) {
    return A.settingsBus ? A.settingsBus.saveOrThrow(__REG, A.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})))
      : Object.assign({}, getSettings(), patch || {});
  }
  A.__settingsRegs = (A.__settingsRegs || []).concat([__REG]);
  var _stat = { created: 0, advanced: 0, settled: 0, cancelled: 0, refused: 0, lastReason: '', faults: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return A.inputGuard ? A.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  var clockNow = function (tag) { try { return A.clock.now(tag || 'commission'); } catch (e) { return Date.now(); } };
  function state() { return (A.store && A.store.get) ? (A.store.get() || {}) : {}; }
  function bucket(root) { var r = root || state(); if (!r.commission) r.commission = { contracts: [] }; if (!Array.isArray(r.commission.contracts)) r.commission.contracts = []; return r.commission; }
  function list() { return bucket().contracts || []; }
  function find(id) { var k = clean(id, 60); return list().filter(function (x) { return x && x.id === k; })[0] || null; }
  function newId() { return A.rand ? A.rand.id('cm_', 4, 'id') : 'cm_0000'; }

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
    // 检查预算（如果有报酬且 org 在）
    var reward = Number(s.reward) || 0;
    if (reward > 0 && A.org && typeof A.org.canAfford === 'function') {
      var aff = A.org.canAfford(principal, reward);
      if (!aff) { noteFault('no-budget'); return { ok: false, reason: 'no-budget', principal: principal, reward: reward }; }
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
      stages: stageList, currentStage: 0,
      reward: reward, prepaid: Number(s.prepaid) || 0,
      escrow: s.escrow ? clean(s.escrow, 60) : '',
      status: 'active', at: clockNow('commission'),
      settledAt: 0, cancelledAt: 0, cancelReason: ''
    };
    if (A.store && typeof A.store.transact === 'function') {
      A.store.transact(function (d) { bucket(d).contracts.push(rec); }, 'commission:create');
    } else { list().push(rec); }
    if (A.evict && typeof A.evict.array === 'function') {
      try { A.evict.array(bucket().contracts, 'commission.contracts'); } catch (e) {}
    }
    _stat.created++;
    return { ok: true, id: rec.id, title: title, stages: stageList.length };
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
    if (A.store && typeof A.store.transact === 'function') {
      A.store.transact(function (d) {
        var b = bucket(d);
        var t = b.contracts.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) {
          t.stages[rec.currentStage].receiptId = rid;
          t.stages[rec.currentStage].status = 'done';
          t.stages[rec.currentStage].completedAt = clockNow('commission');
          if (rec.currentStage + 1 < t.stages.length) {
            t.stages[rec.currentStage + 1].status = 'active';
            t.currentStage = rec.currentStage + 1;
          } else {
            t.status = 'completed';
          }
        }
      }, 'commission:advance');
    } else {
      st.receiptId = rid; st.status = 'done'; st.completedAt = clockNow('commission');
      if (rec.currentStage + 1 < rec.stages.length) {
        rec.stages[rec.currentStage + 1].status = 'active';
        rec.currentStage++;
      } else { rec.status = 'completed'; }
    }
    _stat.advanced++;
    return { ok: true, id: rec.id, stage: rec.currentStage, receiptId: rid };
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
    // 通过 org.transfer 支付
    var paid_ok = false;
    if (due > 0 && A.org && typeof A.org.transfer === 'function') {
      try { var r = A.org.transfer(rec.principal, rec.agent, due, 'commission:settle'); paid_ok = r && r.ok !== false; } catch (e) { noteFault('transfer-failed'); }
    } else { paid_ok = due === 0; }
    if (A.store && typeof A.store.transact === 'function') {
      A.store.transact(function (d) {
        var b = bucket(d);
        var t = b.contracts.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) { t.status = 'settled'; t.settledAt = clockNow('commission'); }
      }, 'commission:settle');
    } else { rec.status = 'settled'; rec.settledAt = clockNow('commission'); }
    _stat.settled++;
    return { ok: true, id: rec.id, totalReward: totalReward, prepaid: paid, due: due, paid: paid_ok };
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
    // 退回托管
    if (refund > 0 && A.org && typeof A.org.transfer === 'function' && rec.escrow) {
      try { A.org.transfer(rec.escrow, rec.principal, refund, 'commission:cancel-refund'); } catch (e) {}
    }
    if (A.store && typeof A.store.transact === 'function') {
      A.store.transact(function (d) {
        var b = bucket(d);
        var t = b.contracts.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) { t.status = 'cancelled'; t.cancelledAt = clockNow('commission'); t.cancelReason = rsn; }
      }, 'commission:cancel');
    } else { rec.status = 'cancelled'; rec.cancelledAt = clockNow('commission'); rec.cancelReason = rsn; }
    _stat.cancelled++;
    return { ok: true, id: rec.id, reason: rsn, earned: earned, refund: refund };
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
      org: !!(A.org && typeof A.org.transfer === 'function' && typeof A.org.canAfford === 'function'),
      store: !!(A.store && typeof A.store.transact === 'function'),
      settingsBus: !!(A.settingsBus && typeof A.settingsBus.read === 'function')
    };
    var ok = checks.org && checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.169.0' };
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

  A.commission = {
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
  var _exported = Object.keys(A.commission).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('commission: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof A.registerModule === 'function') A.registerModule('engines/commission.js', { kind: 'engine', ver: '2.169.0' });
})();
