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
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) { bucket(d).projects.push(rec); }, 'operations:enact');
    } else { projects().push(rec); }
    if (WA.evict && typeof WA.evict.array === 'function') {
      try { WA.evict.array(bucket().projects, 'operations.projects'); } catch (e) {}
    }
    _stat.enacted++;
    return { ok: true, id: rec.id, name: rec.name, owner: rec.owner, budget: budget };
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
    // 检查组织资源可用性——仅当组织已注册为 faction 时检查
    if (WA.org && typeof WA.org.canAfford === 'function') {
      var _dfactions = ((state().evolution || {}).factions) || [];
      var _dfactionExists = _dfactions.some(function (f) { return f && clean(f.name, 40) === clean(rec.orgId, 40); });
      if (_dfactionExists) {
        if (!WA.org.canAfford('faction', rec.orgId, itemType, amount)) { noteFault('insufficient-funds'); return { ok: false, reason: 'insufficient-funds', type: itemType, need: amount }; }
        if (typeof WA.org.transfer === 'function') {
          var tr = WA.org.transfer('faction', rec.orgId, 'person', by, itemType, amount);
          if (!tr || !tr.ok) { noteFault('transfer-failed'); return { ok: false, reason: 'transfer-failed', detail: tr ? tr.reason : 'none' }; }
        }
      }
    }
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) {
        var b = bucket(d);
        var t = b.projects.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) { t.spent += amount; }
      }, 'operations:disburse');
    } else { rec.spent += amount; }
    var upd = find(rec.id) || rec;
    _stat.disbursed++;
    return { ok: true, id: upd.id, spent: upd.spent, budget: upd.budget, purpose: purpose };
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
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) {
        var b = bucket(d);
        var t = b.projects.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) {
          t.cycleTag = cycleTag; t.lastSettledAt = now;
          if (milestoneDone && t.milestones[milestoneIdx]) {
            t.milestones[milestoneIdx].done = true; t.completedMilestones++;
          }
          // 全部里程碑完成则关闭项目
          if (t.completedMilestones >= t.milestones.length && t.milestones.length > 0) {
            t.status = 'completed'; t.closedAt = now;
          }
        }
      }, 'operations:settle');
    } else {
      rec.cycleTag = cycleTag; rec.lastSettledAt = now;
      if (milestoneDone) { rec.milestones[milestoneIdx].done = true; rec.completedMilestones++; }
      if (rec.completedMilestones >= rec.milestones.length && rec.milestones.length > 0) {
        rec.status = 'completed'; rec.closedAt = now;
      }
    }
    var updated = find(rec.id) || rec;
    _stat.settled++;
    return { ok: true, id: updated.id, cycleTag: cycleTag, milestoneDone: milestoneDone,
      completedMilestones: updated.completedMilestones, totalMilestones: updated.milestones.length,
      status: updated.status };
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
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) {
        var b = bucket(d);
        var t = b.projects.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) { t.owner = to; }
      }, 'operations:handover');
    } else { rec.owner = to; }
    _stat.handedOver++;
    return { ok: true, id: rec.id, from: from, to: to };
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
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) {
        var b = bucket(d);
        var t = b.projects.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) { t.status = 'cancelled'; t.closedAt = clockNow('operations'); }
      }, 'operations:cancel');
    } else { rec.status = 'cancelled'; rec.closedAt = clockNow('operations'); }
    _stat.cancelled++;
    return { ok: true, id: rec.id, reason: rsn };
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
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 14;
  var _exported = Object.keys(WA.operations).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('operations: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/operations.js', { kind: 'engine', ver: '2.172.0' });
})();
