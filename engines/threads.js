/**
 * WorldAxis engines/threads.js (v2.63.0)
 * 悬案：调查与情报的玩法面——线索的汇聚、矛盾与结案依据。
 *
 * 为什么单独成模块，而不并进 intel.js：
 *   intel.js 是**认知面**（谁知道什么、凭什么相信、置信多少），它管的是「某人以为」；
 *   本模块是**调查面**（一桩悬案被查到了哪一步、有哪些线索、彼此是否矛盾、凭什么结案），
 *   它管的是「事情查到了哪」。两者真源不同：认知可以**错**（谣言、误认），
 *   调查必须**有据**（结案要给出依据）。并在一起，最直接的后果是
 *   「有人怀疑是他」与「查下来确实是他」在状态里长得一样——而那是推理玩法最贵的区分。
 *
 * 设计边界（**全是否定式**）：
 *   1 总开关默认关闭；关闭时不登记线索、不注入。
 *   2 结案必须**有依据**：`resolve` 要求至少一条线索支撑，否则拒收（不得凭空结案）。
 *      推理玩法里最贵的一类失败，就是「没查出来也能给答案」。
 *   3 矛盾线索**必须被报出**、不得被平均掉：两条互相打脸的线索平均成一个「大概」，
 *      等于把一条真线索和一条假线索一起销毁。`converge` 把矛盾单独列出来。
 *   4 悬置与结案是两件事：查不下去 ⇒ `stalled`（**仍在查**，记录不删）；
 *      主动放下 ⇒ `abandoned`（并写明为什么放下）。合成一个「结束了」，
 *      就再也答不出「这案子是破了还是搁了」。
 *   5 线索不等于结论：注入时明写这条约束，且低置信**不得**被写成定论。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_threads_settings_v1';
  const DEF = { enabled: false, maxThreads: 6, maxLeads: 5 };
  const __REG = { key: LS_KEY, def: DEF, module: 'threads',
    bounds: { maxThreads: [1, 16], maxLeads: [1, 12] } };
  const RELIABILITY = ['hearsay', 'trace', 'document', 'testimony', 'physical'];
  const REL_W = { hearsay: 20, trace: 40, document: 60, testimony: 75, physical: 90 };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { opened: 0, leads: 0, resolved: 0, stalled: 0, abandoned: 0, blocked: 0, lastReason: '', faults: {} };

  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function list() { const t = state().threads; return Array.isArray(t) ? t : []; }
  function byId(id) { const k = clean(id, 60); return list().filter(function (x) { return x && x.id === k; })[0] || null; }

  /** 立一桩悬案（待查的问题）。问题必须具体：空问题不是悬案。 */
  function open(item) {
    // v2.79.0（第十三面续 · 输入边界）：入参必须是对象。
    //   此前 `item && item.question` 对 NaN 求值为 NaN（falsy 短路不生效，因为 NaN 直接
    //   参与 &&），clean(NaN) → 'NaN' 非空 → **立出一桩问题叫「NaN」的悬案**并报 ok。
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: 'missing-question' };
    const q = clean(item && item.question, 80);
    if (!q) return { ok: false, reason: 'missing-question' };
    const subject = clean(item && item.subject, 60);
    let out = null;
    WA.store.transact(function (draft) {
      draft.threads = Array.isArray(draft.threads) ? draft.threads : [];
      const row = { id: 'th_' + clockNow('threads') + '_' + draft.threads.length,
        question: q, subject: subject, leads: [], status: 'open',
        openedAt: clockNow('threads'), updatedAt: clockNow('threads') };
      draft.threads.push(row);
      WA.evict.array(draft.threads, 'threads.cases');
      out = { ok: true, id: row.id };
    }, 'threads:open');
    if (out && out.ok) { stat.opened++; stat.lastReason = 'opened'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 加线索。来源分级必须合法（可靠性由**来源类型**决定，不由「我觉得可信」决定）。
   *   `points` 为一句话主张；同一悬案里互相打脸的线索由 converge 报出，不在此处调和。
   */
  function addLead(threadId, item) {
    const id = clean(threadId, 60);
    const row = byId(id);
    if (!row) return { ok: false, reason: 'missing-thread' };
    if (row.status !== 'open' && row.status !== 'stalled') return { ok: false, reason: 'thread-terminal', status: row.status };
    const claim = clean(item && item.claim, 80);
    if (!claim) return { ok: false, reason: 'missing-claim' };
    const src = clean(item && item.source, 60);
    if (!src) return { ok: false, reason: 'missing-source' };   // 没来源的线索不是线索
    const rel = clean(item && item.reliability, 20);
    if (RELIABILITY.indexOf(rel) < 0) return { ok: false, reason: 'bad-reliability', reliability: RELIABILITY.slice() };
    const polarity = clean(item && item.polarity, 8) || 'supports';
    if (['supports', 'refutes'].indexOf(polarity) < 0) return { ok: false, reason: 'bad-polarity' };
    let out = null;
    WA.store.transact(function (draft) {
      const arr = Array.isArray(draft.threads) ? draft.threads : [];
      const t = arr.filter(function (x) { return x && x.id === id; })[0];
      if (!t) { out = { ok: false, reason: 'missing-thread' }; return false; }
      t.leads = Array.isArray(t.leads) ? t.leads : [];
      const lead = { id: 'ld_' + clockNow('threads') + '_' + t.leads.length,
        claim: claim, source: src, reliability: rel, weight: REL_W[rel], polarity: polarity,
        points: clean(item && item.points, 40) || '', at: clockNow('threads') };
      t.leads.push(lead);
      WA.evict.array(t.leads, 'threads.leads');
      if (t.status === 'stalled') t.status = 'open';   // 新线索 ⇒ 案子重新动起来
      t.updatedAt = clockNow('threads');
      out = { ok: true, id: t.id, lead: lead.id, weight: lead.weight, status: t.status };
    }, 'threads:lead');
    if (out && out.ok) { stat.leads++; stat.lastReason = 'lead'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 线索汇聚：一致面与**矛盾面**分开报出。
   *   矛盾 = 指向同一『points』的两条线索 polarity 相反。
   *   把矛盾平均掉 = 一条真线索与一条假线索同归于尽——本函数**绝不**做这件事，
   *   它把矛盾原样列出，并给出「这桩案子现在还不能结」的结论。
   */
  function converge(threadId) {
    const id = clean(threadId, 60);
    const t = byId(id);
    if (!t) return { ok: false, reason: 'missing-thread' };
    const leads = Array.isArray(t.leads) ? t.leads : [];
    const byPoint = {};
    leads.forEach(function (l) {
      const p = l.points || l.claim;
      (byPoint[p] = byPoint[p] || []).push(l);
    });
    const conflicts = [];
    Object.keys(byPoint).forEach(function (p) {
      const g = byPoint[p];
      const sup = g.filter(function (x) { return x.polarity !== 'refutes'; });
      const ref = g.filter(function (x) { return x.polarity === 'refutes'; });
      if (sup.length && ref.length) {
        conflicts.push({ points: p,
          supports: sup.map(function (x) { return x.source + '(' + x.reliability + ')'; }),
          refutes: ref.map(function (x) { return x.source + '(' + x.reliability + ')'; }) });
      }
    });
    const net = leads.reduce(function (a, l) { return a + (l.polarity === 'refutes' ? -l.weight : l.weight); }, 0);
    const evidence = leads.filter(function (x) { return x.polarity !== 'refutes'; });
    return { ok: true, id: id, leads: leads.length,
      supports: evidence.length, refutes: leads.length - evidence.length,
      conflicts: conflicts, conflicted: conflicts.length > 0,
      net: net, strongest: evidence.reduce(function (a, x) { return Math.max(a, x.weight || 0); }, 0) };
  }

  /**
   * 结案：**必须有依据**。
   *   basis 可以是指向的一串线索 id，也可以是「按汇聚结论」——但两者都不能为空；
   *   有矛盾未解时**默认拒收**（要强行结案须显式 `{overruleConflicts:true}`，并留痕）。
   */
  function resolve(threadId, opts) {
    const o = opts || {};
    const id = clean(threadId, 60);
    const t = byId(id);
    if (!t) return { ok: false, reason: 'missing-thread' };
    if (t.status === 'resolved') return { ok: false, reason: 'already-resolved' };
    if (t.status === 'abandoned') return { ok: false, reason: 'already-abandoned' };
    const answer = clean(o.answer, 100);
    if (!answer) return { ok: false, reason: 'missing-answer' };
    const leads = Array.isArray(t.leads) ? t.leads : [];
    const basis = Array.isArray(o.basis) ? o.basis.map(function (x) { return clean(x, 60); }).filter(Boolean) : [];
    if (!basis.length) return { ok: false, reason: 'no-basis', leads: leads.length };   // 不得凭空结案
    const have = leads.map(function (x) { return x.id; });
    const missing = basis.filter(function (b) { return have.indexOf(b) < 0; });
    if (missing.length) return { ok: false, reason: 'unknown-basis', missing: missing };
    const cv = converge(id);
    if (cv.conflicted && o.overruleConflicts !== true) {
      return { ok: false, reason: 'conflicts-unresolved', conflicts: cv.conflicts };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const arr = Array.isArray(draft.threads) ? draft.threads : [];
      const row = arr.filter(function (x) { return x && x.id === id; })[0];
      if (!row) { out = { ok: false, reason: 'missing-thread' }; return false; }
      row.status = 'resolved'; row.answer = answer; row.basis = basis.slice();
      row.resolvedAt = clockNow('threads'); row.updatedAt = row.resolvedAt;
      if (cv.conflicted && o.overruleConflicts === true) {
        row.overruled = cv.conflicts.length;
        row.overruleNote = clean(o.overruleNote, 120) || '矛盾未解，强行结案';
      }
      out = { ok: true, id: id, basis: basis.length, overruled: row.overruled || 0 };
    }, 'threads:resolve');
    if (out && out.ok) { stat.resolved++; stat.lastReason = 'resolved'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 悬置：查不下去但**仍在查**。这不是结案——记录不删，status 不进终态。 */
  function stall(threadId, why) {
    const id = clean(threadId, 60);
    const t = byId(id);
    if (!t) return { ok: false, reason: 'missing-thread' };
    if (t.status !== 'open') return { ok: false, reason: 'not-open', status: t.status };
    const reason = clean(why, 80);
    let out = null;
    WA.store.transact(function (draft) {
      const arr = Array.isArray(draft.threads) ? draft.threads : [];
      const row = arr.filter(function (x) { return x && x.id === id; })[0];
      if (!row) { out = { ok: false, reason: 'missing-thread' }; return false; }
      row.status = 'stalled'; row.stallReason = reason; row.stalledAt = clockNow('threads');
      row.updatedAt = row.stalledAt;
      out = { ok: true, id: id, status: 'stalled' };
    }, 'threads:stall');
    if (out && out.ok) { stat.stalled++; stat.lastReason = 'stalled'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 放弃：主动放下并写明为什么。与「悬置」分开归因——「搁着」和「不查了」是两种事实。 */
  function abandon(threadId, why) {
    const id = clean(threadId, 60);
    const t = byId(id);
    if (!t) return { ok: false, reason: 'missing-thread' };
    if (t.status === 'resolved') return { ok: false, reason: 'already-resolved' };
    if (t.status === 'abandoned') return { ok: false, reason: 'already-abandoned' };
    const reason = clean(why, 80);
    if (!reason) return { ok: false, reason: 'missing-reason' };   // 放弃必须写明理由
    let out = null;
    WA.store.transact(function (draft) {
      const arr = Array.isArray(draft.threads) ? draft.threads : [];
      const row = arr.filter(function (x) { return x && x.id === id; })[0];
      if (!row) { out = { ok: false, reason: 'missing-thread' }; return false; }
      row.status = 'abandoned'; row.abandonReason = reason; row.abandonedAt = clockNow('threads');
      row.updatedAt = row.abandonedAt;
      out = { ok: true, id: id, status: 'abandoned' };
    }, 'threads:abandon');
    if (out && out.ok) { stat.abandoned++; stat.lastReason = 'abandoned'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 结案详情：结案**依据**必须可复核（「凭什么这么判」）。 */
  function explain(threadId) {
    const id = clean(threadId, 60);
    const t = byId(id);
    if (!t) return { ok: false, reason: 'missing-thread' };
    if (t.status !== 'resolved') return { ok: false, reason: 'not-resolved', status: t.status };
    const leads = Array.isArray(t.leads) ? t.leads : [];
    const basis = (Array.isArray(t.basis) ? t.basis : []).map(function (b) {
      const l = leads.filter(function (x) { return x && x.id === b; })[0];
      return l ? { id: l.id, source: l.source, reliability: l.reliability } : { id: b, missing: true };
    });
    return { ok: true, id: id, answer: t.answer, basis: basis, overruled: t.overruled || 0 };
  }

  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const live = list().filter(function (x) { return x && (x.status === 'open' || x.status === 'stalled'); }).slice(0, cfg.maxThreads);
    if (!live.length) return '';
    const lines = live.map(function (t) {
      const ls = (Array.isArray(t.leads) ? t.leads : []).slice(-cfg.maxLeads);
      const txt = ls.length
        ? ls.map(function (l) { return l.claim + '（' + l.source + '／' + l.reliability + (l.polarity === 'refutes' ? '／反证' : '') + '）'; }).join('；')
        : '尚无线索';
      return t.question + '[' + t.status + ']：' + txt;
    });
    lines.push('线索不等于结论：未结案的不得被当成已知事实写进正文；结案须有依据。');
    lines.push('互相矛盾的线索要各自保留，不得取平均；查不下去时标为悬置而不是给一个答案。');
    return '[悬案]\n' + lines.join('\n') + '\n';
  }

  WA.threads = {
    RELIABILITY: RELIABILITY, REL_W: REL_W, TERMINAL: ['resolved', 'abandoned'],
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    open: open, addLead: addLead, converge: converge, resolve: resolve,
    stall: stall, abandon: abandon, explain: explain, buildBlock: buildBlock,
    threadStat: function () {
      const all = list();
      return { cases: all.length,
        open: all.filter(function (x) { return x && x.status === 'open'; }).length,
        stalled: all.filter(function (x) { return x && x.status === 'stalled'; }).length,
        resolved: all.filter(function (x) { return x && x.status === 'resolved'; }).length,
        abandoned: all.filter(function (x) { return x && x.status === 'abandoned'; }).length,
        leads: all.reduce(function (a, x) { return a + ((x && Array.isArray(x.leads)) ? x.leads.length : 0); }, 0) };
    },
    stat: function () { return Object.assign({}, stat); }
  };
  // v2.63.0 观测面：把「被拒了什么」按原因计入 stat.faults。
  //   为什么必须另立一面：拒绝是**不落盘**的——被拒的东西当然写不进存档，
  //   于是「世界没有因为一句话长出一条不存在的街」这件事在状态里完全不可见，
  //   而它恰恰是本模块存在的全部理由。
  //   实现纪律：只读观测。不改判定、不改返回结构、不新增导出成员——
  //   包在总线上而不是散进各个函数里，是为了让「有没有漏掉某条出口」在结构上不可能发生。
  (function () {
    const api = WA.threads;
    if (!api) return;
    Object.keys(api).forEach(function (k) {
      const fn = api[k];
      if (typeof fn !== 'function') return;
      api[k] = function () {
        const r = fn.apply(null, arguments);
        if (r && r.ok === false && typeof r.reason === 'string' && r.reason) {
          stat.faults[r.reason] = (stat.faults[r.reason] || 0) + 1;
        }
        return r;
      };
    });
  })();
})();