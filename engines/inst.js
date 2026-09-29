/**
 * WorldAxis engines/inst.js (v2.119.0) — 组织制度、任职权限与权力交接（拓展计划 ④）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   `org` 答得出「谁在哪个组织里、有多少资源、领过多少薪」，但答不出**制度**：
 *   这笔决策要不要批准、这个职位能拍什么板、他离任后在途的项目归谁。
 *   现场于是只剩两种做法：要么谁说了都算（组织与人群没有区别），
 *   要么所有事都卡在一句话上（「会长不在，谁也动不了」）——两者都不可执行。
 *
 * ── 本模块只做六件事，每件都有一个硬条件 ───────────────────────
 *   ① `charter` 建档：一个组织一个 kind，重复建档须显式 `replace`（否则 `exists`）。
 *   ② `post`    设职：权限必须是**具名权限表**的子集（`bad-perms`）——自造权限
 *      等于自造权力，而权力一旦不成表，下一任就无法接手。
 *   ③ `assign`  任职：职位必须**先存在**（`unknown-post`）；同职只一人，
 *      换人必须显式给 `replace:true`（否则 `occupied`）——「谁在任」不能靠覆盖。
 *   ④ `vacate`  离任：必须写明理由且理由在具名表内（`bad-reason`）。
 *   ⑤ `succession` 交接：**必须写明在途项目数与旧承诺数**（`missing-handover`）——
 *      这就是「换了领导，在途的事还算不算数」的唯一可判定形式；
 *      不写明就被拒收，而不是默认归零。
 *   ⑥ `propose`/`decide` 批准链：一项决策若需某权限（`needs`），
 *      则该权限**必须有人持有**（否则 `no-authority`）；批准者本人必须持有
 *      `approve`（否则 `not-authorized`）；已决不得再决（`already-decided`）。
 *      违约（`breach`）必须写明罚则（`missing-penalty`），结案必须有据（`missing-evidence`）。
 *
 * ── 八条设计边界（全是否定式）──────────────────────────────────
 *   ① **权限成群不成星**：具名权限表，自造权限拒收。
 *   ② **无职不任**：职位不存在时不得直接把人挂上去。
 *   ③ **一职一人**：换人必须显式（不许静默覆盖前任）。
 *   ④ **交接受检**：不写明在途与旧承诺的交接不算交接。
 *   ⑤ **无权限则无批准链**：没人能批的决策不许挂起（挂起等于永远办不了）。
 *   ⑥ **批者须有批准权**：批准不是「谁点一下都行」。
 *   ⑦ **罚则显式**：本模块**不自行判罚**，罚则必须由调用方写明。
 *   ⑧ **容量有界且挤出有账**：三个站点（orgs / pending / breaches）都走 evict 单一出口。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────────
 *   · 本模块**不动资源**：批准通过的资源后果由调用方经 org 完成。
 *   · 本模块**不定职级序列**：只记「这个职位有哪些权限」。
 *   · 总开关默认关闭；关闭时建档、设职、任免、批准、违约一律拒收且不注入。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_inst_settings_v1';
  const DEF = { enabled: false, maxOrgs: 8, maxPending: 12, maxBreaches: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'inst',
    bounds: { maxOrgs: [2, 24], maxPending: [4, 32], maxBreaches: [4, 32] } };
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

  // 具名权限表：**自造权限等于自造权力**（不成表的权力，下一任无法接手）。
  const PERMS = ['approve', 'grant', 'hire', 'punish'];
  const KINDS = ['公司', '学校', '家族', '帮派', '机关'];
  const REASONS = ['resigned', 'dismissed', 'succeeded'];
  const TERMINAL = ['approved', 'rejected'];

  const stat = { charters: 0, posts: 0, assigned: 0, vacated: 0, successions: 0,
    proposed: 0, approved: 0, rejected: 0, breached: 0, settled: 0,
    blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.blocked++; stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function orgsOf(root) {
    const c = (root || state()).inst;
    return (c && Array.isArray(c.orgs)) ? c.orgs : [];
  }
  function findOrg(id, root) {
    const key = clean(id, 60);
    if (!key) return null;
    return orgsOf(root).filter(function (r) { return r && clean(r.id, 60) === key; })[0] || null;
  }
  function postOf(o, title) {
    const t = clean(title, 40);
    return (o && Array.isArray(o.posts)) ? (o.posts.filter(function (p) { return p && clean(p.title, 40) === t; })[0] || null) : null;
  }
  function findPending(o, id) {
    const key = clean(id, 60);
    return (o && Array.isArray(o.pending)) ? (o.pending.filter(function (r) { return r && clean(r.id, 60) === key; })[0] || null) : null;
  }
  function openOrg(draft, cfg) {
    draft.inst = (draft.inst && typeof draft.inst === 'object' && !Array.isArray(draft.inst)) ? draft.inst : { orgs: [] };
    if (!Array.isArray(draft.inst.orgs)) draft.inst.orgs = [];
    return draft.inst;
  }
  /** 谁持有某个权限（可能多人）。没有则空数组。 */
  function holdersOf(o, perm) {
    if (!o || !Array.isArray(o.posts)) return [];
    return o.posts.filter(function (p) {
      return p && p.holder && Array.isArray(p.perms) && p.perms.indexOf(perm) >= 0;
    }).map(function (p) { return clean(p.holder, 40); });
  }
  /** ① 建档：一个组织一个 kind（重复建档必须显式 replace）。 */
  function charter(id, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const oid = clean(id, 60), kind = clean(o.kind, 20);
    if (!oid || !kind) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (KINDS.indexOf(kind) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', allowed: KINDS.slice() }; }
    const cfg = settings();
    const seen = findOrg(oid);
    if (seen && !o.replace) { noteFault('exists'); return { ok: false, reason: 'exists', id: oid, kind: seen.kind }; }
    if (seen && seen.kind !== kind && !o.replace) {
      noteFault('kind-locked');
      return { ok: false, reason: 'kind-locked', id: oid, kind: seen.kind, wanted: kind };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const it = openOrg(draft, cfg);
      const now = clockNow('inst');
      let org = findOrg(oid, draft);
      if (!org) {
        if (it.orgs.length >= cfg.maxOrgs) { out = { ok: false, reason: 'orgs-full', cap: cfg.maxOrgs }; return false; }
        org = { id: oid, kind: kind, name: clean(o.name, 60) || oid, posts: [], pending: [], breaches: [],
          successions: [], at: now, updatedAt: now };
        it.orgs.push(org);
      } else {
        org.kind = kind;
        if (o.name) org.name = clean(o.name, 60);
        org.updatedAt = now;
      }
      WA.evict.array(it.orgs, 'inst.orgs', cfg.maxOrgs);
      out = { ok: true, id: org.id, kind: org.kind, posts: org.posts.length };
    }, 'inst:charter');
    if (out && out.ok) { stat.charters++; stat.lastReason = 'charted'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ② 设职：权限必须落在具名权限表内（自造权限等于自造权力）。 */
  function post(orgId, title, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const t = clean(title, 40);
    if (!t) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const org = findOrg(orgId);
    if (!org) { noteFault('unknown-org'); return { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; }
    const want = Array.isArray(o.perms) ? o.perms.map(function (p) { return clean(p, 20); }) : [];
    const bad = want.filter(function (p) { return PERMS.indexOf(p) < 0; });
    if (bad.length) { noteFault('bad-perms'); return { ok: false, reason: 'bad-perms', bad: bad, allowed: PERMS.slice() }; }
    let out = null;
    WA.store.transact(function (draft) {
      const og = findOrg(orgId, draft);
      if (!og) { out = { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; return false; }
      const now = clockNow('inst');
      let p = postOf(og, t);
      if (!p) {
        p = { title: t, perms: want.slice(), holder: '', since: 0, seats: want.slice().length };
        og.posts.push(p);
      } else {
        p.perms = want.slice();
      }
      og.updatedAt = now;
      out = { ok: true, id: og.id, title: p.title, perms: p.perms.slice(), holder: p.holder || '' };
    }, 'inst:post');
    if (out && out.ok) { stat.posts++; stat.lastReason = 'posted'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ③ 任职：职位必须先存在；一职一人，换人必须显式 replace。 */
  function assign(orgId, title, person, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const t = clean(title, 40), who = clean(person, 40);
    if (!t || !who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const org = findOrg(orgId);
    if (!org) { noteFault('unknown-org'); return { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; }
    const p0 = postOf(org, t);
    // 无职不任：职位不存在时不得直接把人挂上去。
    if (!p0) { noteFault('unknown-post'); return { ok: false, reason: 'unknown-post', title: t, known: (org.posts || []).map(function (x) { return x.title; }) }; }
    if (p0.holder && clean(p0.holder, 40) !== who && !o.replace) {
      noteFault('occupied');
      return { ok: false, reason: 'occupied', title: t, holder: clean(p0.holder, 40), hint: '换人必须显式 replace' };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const og = findOrg(orgId, draft);
      const p = postOf(og, t);
      if (!p) { out = { ok: false, reason: 'unknown-post', title: t }; return false; }
      const now = clockNow('inst');
      p.holder = who; p.since = now;
      og.updatedAt = now;
      out = { ok: true, id: og.id, title: p.title, holder: p.holder, perms: (p.perms || []).slice(), replaced: !!o.replace };
    }, 'inst:assign');
    if (out && out.ok) { stat.assigned++; stat.lastReason = 'assigned'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ④ 离任：必须写明理由且理由在具名表内。 */
  function vacate(orgId, title, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const t = clean(title, 40), why = clean(o.why, 20);
    if (!t) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const org = findOrg(orgId);
    if (!org) { noteFault('unknown-org'); return { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; }
    const p0 = postOf(org, t);
    if (!p0) { noteFault('unknown-post'); return { ok: false, reason: 'unknown-post', title: t }; }
    if (!p0.holder) { noteFault('empty-post'); return { ok: false, reason: 'empty-post', title: t }; }
    if (REASONS.indexOf(why) < 0) { noteFault('bad-reason'); return { ok: false, reason: 'bad-reason', allowed: REASONS.slice() }; }
    let out = null;
    WA.store.transact(function (draft) {
      const og = findOrg(orgId, draft);
      const p = postOf(og, t);
      if (!p || !p.holder) { out = { ok: false, reason: 'empty-post', title: t }; return false; }
      const now = clockNow('inst');
      const from = clean(p.holder, 40);
      p.holder = ''; p.since = 0;
      og.updatedAt = now;
      out = { ok: true, id: og.id, title: p.title, from: from, why: why };
    }, 'inst:vacate');
    if (out && out.ok) { stat.vacated++; stat.lastReason = 'vacated'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ⑤ 权力交接：**必须写明在途项目数与旧承诺数**。
   *   这就是「换了领导，在途的事还算不算数」的唯一可判定形式 —— 不写明就拒收，而不是默认归零。
   */
  function succession(orgId, from, to, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const f = clean(from, 40), t2 = clean(to, 40);
    if (!f || !t2) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (f === t2) { noteFault('bad-pair'); return { ok: false, reason: 'bad-pair' }; }
    if (typeof o.openProjects !== 'number' || o.openProjects < 0 || (o.openProjects | 0) !== o.openProjects
      || typeof o.oldOaths !== 'number' || o.oldOaths < 0 || (o.oldOaths | 0) !== o.oldOaths) {
      noteFault('missing-handover');
      return { ok: false, reason: 'missing-handover', hint: '交接必须写明在途项目数与旧承诺数，不许默认归零' };
    }
    const org = findOrg(orgId);
    if (!org) { noteFault('unknown-org'); return { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const og = findOrg(orgId, draft);
      if (!og) { out = { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; return false; }
      const now = clockNow('inst');
      if (!Array.isArray(og.successions)) og.successions = [];
      og.successions.push({ at: now, from: f, to: t2,
        openProjects: o.openProjects, oldOaths: o.oldOaths,
        keep: o.keep !== false, note: clean(o.note, 60) });
      WA.evict.array(og.successions, 'inst.successions', cfg.maxPending);
      og.updatedAt = now;
      out = { ok: true, id: og.id, from: f, to: t2, openProjects: o.openProjects, oldOaths: o.oldOaths,
        keep: o.keep !== false, count: og.successions.length };
    }, 'inst:succession');
    if (out && out.ok) { stat.successions++; stat.lastReason = 'succeeded'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ⑥ 提一项待批决策。
   *   若该项需要某个权限（`needs`），则该权限**必须有人持有**（否则 `no-authority`）——
   *   没有人能批的决策不许挂起：挂起等于永远办不了（这正是「卡在一句话上」的形态）。
   */
  function propose(orgId, text, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const body = clean(text, 80), by = clean(o.by, 40);
    if (!body || !by) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const org = findOrg(orgId);
    if (!org) { noteFault('unknown-org'); return { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; }
    const need = clean(o.needs, 20) || 'approve';
    if (PERMS.indexOf(need) < 0) { noteFault('bad-perms'); return { ok: false, reason: 'bad-perms', allowed: PERMS.slice() }; }
    const hs = holdersOf(org, need);
    if (!hs.length) {
      noteFault('no-authority');
      return { ok: false, reason: 'no-authority', needs: need, hint: '没人能批的决策不许挂起（挂起等于永远办不了）' };
    }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const og = findOrg(orgId, draft);
      if (!og) { out = { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; return false; }
      if (!Array.isArray(og.pending)) og.pending = [];
      if (og.pending.length >= cfg.maxPending) { out = { ok: false, reason: 'pending-full', cap: cfg.maxPending }; return false; }
      const now = clockNow('inst');
      const row = { id: 'dec_' + now + '_' + og.pending.length, text: body, by: by,
        needs: need, status: 'pending', decider: '', why: '', at: now, decidedAt: 0 };
      og.pending.push(row);
      WA.evict.array(og.pending, 'inst.pending', cfg.maxPending);
      og.updatedAt = now;
      out = { ok: true, id: row.id, needs: need, holders: hs };
    }, 'inst:propose');
    if (out && out.ok) { stat.proposed++; stat.lastReason = 'proposed'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 裁决：批准者本人必须持有 `approve`（批准不是「谁点一下都行」）；已决不得再决。
   */
  function decide(orgId, decId, outcome, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const oc = clean(outcome, 20), who = clean(o.by, 40);
    if (TERMINAL.indexOf(oc) < 0) { noteFault('bad-outcome'); return { ok: false, reason: 'bad-outcome', allowed: TERMINAL.slice() }; }
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const org = findOrg(orgId);
    if (!org) { noteFault('unknown-org'); return { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; }
    const p0 = findPending(org, decId);
    if (!p0) { noteFault('unknown-decision'); return { ok: false, reason: 'unknown-decision', id: clean(decId, 60) }; }
    if (TERMINAL.indexOf(p0.status) >= 0) { noteFault('already-decided'); return { ok: false, reason: 'already-decided', status: p0.status }; }
    // 批准不是「谁点一下都行」。
    if (holdersOf(org, 'approve').indexOf(who) < 0) {
      noteFault('not-authorized');
      return { ok: false, reason: 'not-authorized', by: who, holders: holdersOf(org, 'approve') };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const og = findOrg(orgId, draft);
      const r = findPending(og, decId);
      if (!r) { out = { ok: false, reason: 'unknown-decision', id: clean(decId, 60) }; return false; }
      if (TERMINAL.indexOf(r.status) >= 0) { out = { ok: false, reason: 'already-decided', status: r.status }; return false; }
      const now = clockNow('inst');
      r.status = oc; r.decider = who; r.why = clean(o.why, 60); r.decidedAt = now;
      og.updatedAt = now;
      out = { ok: true, id: r.id, status: r.status, decider: who };
    }, 'inst:decide');
    if (out && out.ok) {
      if (oc === 'approved') { stat.approved++; stat.lastReason = 'approved'; }
      else { stat.rejected++; stat.lastReason = 'rejected'; }
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 违约登记：**必须写明罚则**（本模块不自行判罚）。 */
  function breach(orgId, who, what, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const by = clean(who, 40), body = clean(what, 80), penalty = clean(o.penalty, 60);
    if (!by || !body) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!penalty) { noteFault('missing-penalty'); return { ok: false, reason: 'missing-penalty', hint: '罚则必须写明，本模块不自行判罚' };
    }
    const org = findOrg(orgId);
    if (!org) { noteFault('unknown-org'); return { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const og = findOrg(orgId, draft);
      if (!og) { out = { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; return false; }
      if (!Array.isArray(og.breaches)) og.breaches = [];
      if (og.breaches.length >= cfg.maxBreaches) { out = { ok: false, reason: 'breaches-full', cap: cfg.maxBreaches }; return false; }
      const now = clockNow('inst');
      const row = { id: 'br_' + now + '_' + og.breaches.length, who: by, what: body,
        penalty: penalty, status: 'open', evidence: '', at: now, updatedAt: now };
      og.breaches.push(row);
      WA.evict.array(og.breaches, 'inst.breaches', cfg.maxBreaches);
      og.updatedAt = now;
      out = { ok: true, id: row.id, penalty: penalty };
    }, 'inst:breach');
    if (out && out.ok) { stat.breached++; stat.lastReason = 'breached'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 违约结案：必须有据（`missing-evidence`）。不删行。 */
  function settle(orgId, brId, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const ev = clean(o.evidence, 80);
    if (!ev) { noteFault('missing-evidence'); return { ok: false, reason: 'missing-evidence', hint: '结案必须有据' }; }
    const org = findOrg(orgId);
    if (!org) { noteFault('unknown-org'); return { ok: false, reason: 'unknown-org', id: clean(orgId, 60) }; }
    const b0 = (org.breaches || []).filter(function (r) { return r && clean(r.id, 60) === clean(brId, 60); })[0] || null;
    if (!b0) { noteFault('unknown-breach'); return { ok: false, reason: 'unknown-breach', id: clean(brId, 60) }; }
    if (b0.status === 'settled') { noteFault('already-settled'); return { ok: false, reason: 'already-settled', id: b0.id }; }
    let out = null;
    WA.store.transact(function (draft) {
      const og = findOrg(orgId, draft);
      const r = (og.breaches || []).filter(function (x) { return x && clean(x.id, 60) === clean(brId, 60); })[0] || null;
      if (!r) { out = { ok: false, reason: 'unknown-breach', id: clean(brId, 60) }; return false; }
      if (r.status === 'settled') { out = { ok: false, reason: 'already-settled', id: r.id }; return false; }
      const now = clockNow('inst');
      r.status = 'settled'; r.evidence = ev; r.updatedAt = now;
      og.updatedAt = now;
      out = { ok: true, id: r.id, status: r.status, penalty: r.penalty };
    }, 'inst:settle');
    if (out && out.ok) { stat.settled++; stat.lastReason = 'settled'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function view(orgId) {
    const o = findOrg(orgId);
    if (!o) return { ok: false, reason: 'unknown-org', id: clean(orgId, 60) };
    return { ok: true, id: o.id, kind: o.kind, name: o.name,
      posts: (o.posts || []).map(function (p) { return { title: p.title, holder: p.holder || '', perms: (p.perms || []).slice() }; }),
      open: (o.pending || []).filter(function (r) { return r && r.status === 'pending'; }).length,
      breaches: (o.breaches || []).filter(function (r) { return r && r.status !== 'settled'; }).length,
      successions: (o.successions || []).length,
      canApprove: holdersOf(o, 'approve') };
  }
  function statView() {
    const rows = orgsOf();
    const kinds = {};
    rows.forEach(function (o) { kinds[o.kind] = (kinds[o.kind] || 0) + 1; });
    return { enabled: settings().enabled, orgs: rows.length, byKind: kinds,
      posts: rows.reduce(function (n, o) { return n + ((o.posts || []).length); }, 0),
      pending: rows.reduce(function (n, o) { return n + ((o.pending || []).filter(function (r) { return r && r.status === 'pending'; }).length); }, 0),
      openBreaches: rows.reduce(function (n, o) { return n + ((o.breaches || []).filter(function (r) { return r && r.status !== 'settled'; }).length); }, 0) };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const rows = orgsOf().slice(0, cfg.maxOrgs);
    if (!rows.length) return '';
    const lines = rows.map(function (o) {
      const held = (o.posts || []).filter(function (p) { return p && p.holder; })
        .map(function (p) { return p.title + '=' + p.holder + '（' + (p.perms || []).join('/') + '）'; });
      const openP = (o.pending || []).filter(function (r) { return r && r.status === 'pending'; });
      return o.name + '（' + o.kind + '）：' + (held.length ? held.join('，') : '目前无人任职')
        + (openP.length ? '；待批 ' + openP.length + ' 项' : '');
    });
    return '[组织制度]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '没有对应权限的人不得批准；没人能批的事不许挂起。'
      + '职位空缺不等于制度消失——离任与交接都留有记录，旧承诺不因换人而自动作废。';
  }
  WA.inst = {
    PERMS: PERMS.slice(), KINDS: KINDS.slice(), REASONS: REASONS.slice(), TERMINAL: TERMINAL.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    charter: charter, post: post, assign: assign, vacate: vacate, succession: succession,
    propose: propose, decide: decide, breach: breach, settle: settle,
    view: view, statView: statView, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/inst.js', { kind: 'engine', ver: '2.119.0' });
})();
