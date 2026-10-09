/**
 * WorldAxis engines/opportunity.js (v2.117.0) — 机会形成（计划二 B6 前半）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────
 *   causal / longline / chapters / spotlight / tempo / theme / canon 七个引擎各自**已经**
 *   回答了「世界上正在发生什么」，但**没有一个**把那些状态变化收敛成
 *   「此刻有一个可参与的窗口」这件事。于是两种失效同时存在：
 *     · 模型想给玩家一个机会，只能凭空编一个（与已结算事实脱钩，编出来的机会
 *       在下一次注入里就查无实据）；
 *     · 世界侧明明攒了一堆「承诺逾期 / 项目缺口 / 情报未核实」，**没有任何出口**
 *       把它们交到玩家面前，长局里那些线只能躺着。
 *
 * ── 本模块只做四件事（每件都有明确的否定面）────────────────────
 *   ① **形成**：从六个**已存在**的状态面收集候选机会（`collect`，纯读）。
 *      六个来源都不是新状态：承诺逾期（memory.foreshadows 的 dueAt，经 longline）、
 *      项目缺口或过期（org 项目环）、目标互斥（life.goals 的 obstacle 精确指向另一目标）、
 *      情报未核实（knowledge.intel 且无亲见无记档）、欠账未清（org 名册欠薪）、
 *      因果后果到期（causal.delayed）。**表外来源不收**——自由文本进不来。
 *   ② **登记**：`sweep` 把候选写进 `opportunity.openings`（在途窗口）。同一机会
 *      重复扫描**不产生第二行**（键稳定），窗口起点只记一次。
 *   ③ **作答**：`respond` 三选一——参与 / 拒绝 / 延后。延后必须显式给新窗口（`by`），
 *      没有默认延长期（「先放着」在账面上与「没看见」长得一样，必须可分辨）。
 *   ④ **如实报**：`view` / `list` / `buildBlock` / `stat` 四个只读口。
 *
 * ── 九条设计边界（全是否定式）──────────────────────────────────
 *   ① **世界不会因玩家没接任务停摆**：本模块**只登记与作答**，不改任何源状态面。
 *      机会没被作答 ⇒ 到窗口末尾变 `lapsed`（留痕）；源侧的事按它自己的规则继续
 *      （承诺仍然逾期、项目仍然缺货、欠薪仍然欠着）。而**源条件仍然成立时，
 *      作废的机会会被重新开窗**（`reopen`，次数留痕）——世界会再次敲门，
 *      但绝不替玩家选一次。「世界停摆」在本模块里没有任何一条代码路径可以产生。
 *   ② **不猜涉及谁**：来源没记涉及谁就报 `actors: []`，注入块如实印「涉及：未记录」，
 *      **不替它挑一个相关人**——编出来的主体会把「谁在这件事里」变成永远查不实的说法。
 *   ③ **窗口两档不混同**：`windowBasis` 分 `recorded`（源显式给了期限，如项目 due）
 *      与 `default`（本模块的默认宽限，源未记期限）。只有 `recorded` 才给 `deadline`
 *      与 `deadlineAt`；`default` 一律报「源未记期限」——把默认宽限说成「源记录的期限」，
 *      就是「不知道多久」被写成了「知道多久」。
 *   ④ **窗口判定的单一真源**：结束时刻只由 `endOf(row, cfg)` 给出（sweep 与 respond
 *      共用同一个函数）。两份算法各算一次，就是「同一个窗口在两处不一样宽」。
 *   ⑤ **不知道就不给**：`actors` 非空且作答者不在其中 ⇒ `not-entitled`。世界侧没有
 *      登记玩家知情这条信息差时，作答不会被受理（信息差是事实，不是态度）。
 *   ⑥ **失败不留半截痕迹**：`take` 先在事务里落阶段，再调 `act.add`；行动被拒或抛错时
 *      **回滚阶段**并如实报 `action-refused`（带行动侧原因），不留一个「已接但没动作」
 *      的悬空行——那是本仓库最贵的一类默认值（看起来做了，实际什么都没发生）。
 *   ⑦ **在途行不删**：已拒 / 已延 / 已接 / 已作废**都留痕**。「当时给过这个选择」
 *      是复盘证据；答完即删就再也答不出「他后来为什么去了码头」。
 *   ⑧ **容量有界且挤出有账**：站点 `opportunity.openings`（cap 8）走 evict 单一出口，
 *      挤出记在 evict 台账里，不静默丢弃。
 *   ⑨ **不自动作答**：本模块**没有**任何「到期自动接」的路径。lapsed 是唯一由时间
 *      产生的终态，而且它是**作废**而不是**替你选了**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_opportunity_settings_v1';
  // defaultWindowMs 的语义是**本模块给机会的默认宽限**（源未记期限时用它），
  //   不是「源记录的期限」——故凡是用了它的行，windowBasis 一律报 'default'。
  const DEF = { enabled: false, maxOpen: 4, defaultWindowMs: 86400000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'opportunity',
    bounds: { maxOpen: [1, 12], defaultWindowMs: [60000, 604800000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** 六个来源。表外来源**不接受**——机会必须能回答「由哪项变化产生」。 */
  const SOURCES = ['promise', 'pressure', 'conflict', 'intel', 'debt', 'causal'];
  const SOURCE_CN = {
    promise: '承诺逾期', pressure: '项目缺口', conflict: '目标互斥',
    intel: '情报未核实', debt: '欠账未清', causal: '因果后果到期'
  };
  /** 阶段五态：开放 / 已接 / 已延 / 已拒 / 已作废（作废**只**由时间产生，且是作废不是代选）。 */
  const STAGES = ['open', 'taken', 'deferred', 'declined', 'lapsed'];
  const ACTIVE = ['open', 'deferred'];
  const CHOICES = ['take', 'decline', 'defer'];
  const MAX_WINDOW = 604800000;

  const stat = { sweeps: 0, formed: 0, added: 0, updated: 0, lapses: 0, reopens: 0,
    taken: 0, declined: 0, deferred: 0, blocked: 0, refused: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function str(v, max) { return WA.inputGuard.text(v, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() {
    const o = state().opportunity;
    return (o && Array.isArray(o.openings)) ? o.openings : [];
  }
  function isActive(r) { return !!r && ACTIVE.indexOf(r.stage) >= 0; }
  /** 窗口结束时刻的**单一真源**：源记了期限用源的，否则用「本模块起点 + 宽限」。 */
  function endOf(r, cfg) {
    const dl = Number(r && r.deadlineAt) || 0;
    if (dl > 0) return dl;
    const wm = Number(r && r.windowMs) > 0 ? Number(r.windowMs) : cfg.defaultWindowMs;
    return (Number(r && r.lastAt) || 0) + wm;
  }
  /**
   * 机会 id：**来源 + 稳定引用**，故同一机会反复扫描得到同一个 id。
   *   为什么不用自增序号：自增会让「同一个机会被扫两次」长成两条，
   *   而「重复触发不再登记」正是这一族模块的验收线。
   */
  function idOf(source, ref) {
    return 'op:' + source + ':' + String(ref || '').replace(/[:,;|]/g, '/');
  }
  function windowOf(ms, basis) { return { windowMs: Math.max(0, Number(ms) || 0), windowBasis: basis }; }

  // ── 六个来源（全部纯读；每个只回答「由哪项变化产生」）────────────────

  /** ① 承诺逾期：memory.foreshadows 已过承诺回收时刻仍未收束（longline 只度量，不改写）。 */
  function fromPromise(t, out) {
    const ll = WA.longline;
    if (!ll || typeof ll.overdue !== 'function') return;
    let list = null;
    try { list = ll.overdue(t); } catch (e) { return; }
    (Array.isArray(list) ? list : []).forEach(function (r) {
      const id = clean(r && r.id, 40);
      if (!id) return;
      const mins = Math.round((Number(r && r.lateBy) || 0) / 60000);
      out.push({
        source: 'promise', key: 'promise:' + id,
        from: '伏笔 ' + id + '（' + clean(r.content, 60) + '）已过承诺回收时刻 ' + mins + ' 分钟仍未收束',
        actors: [], due: Number(r.dueAt) || 0, windowMs: 0, windowBasis: 'default',
        ignoredRef: 'longline:' + id,
        conflict: '（忽略：这条伏笔会继续挂着，下一轮仍会报同一笔账）',
        severity: mins >= 1440 ? 'heavy' : 'normal'
      });
    });
  }

  /** ② 项目缺口 / 已过期：只对**未结项**的项目成立；未记刻数的清单项**不算缺口**。 */
  function fromPressure(t, out) {
    const org = WA.org;
    if (!org || typeof org.projectView !== 'function') return;
    const facs = (((state().evolution || {}).factions) || []);
    facs.forEach(function (f) {
      const fn = clean(f && f.name, 40);
      if (!fn) return;
      let v = null;
      try { v = org.projectView(fn); } catch (e) { return; }
      if (!v || !v.ok) return;
      (v.projects || []).forEach(function (p) {
        if (!p || !p.live) return;
        const due = Number(p.due) || 0;
        const late = due > 0 && t > due;
        const gap = (p.missing || []).length;                 // 只认刻数缺口
        const unrec = (p.needs || []).filter(function (x) { return x && x.need === null; }).length;
        if (!late && !gap) return;                            // 未过期且无刻数缺口 ⇒ 没有可回答的变化
        // 未过期 ⇒ 窗口就是**源记录的**剩余期限（recorded）；已过期 ⇒ 显式期限已失效，只剩默认宽限。
        const w = late ? windowOf(0, 'default') : windowOf(due - t, 'recorded');
        const bits = [];
        bits.push(clean(p.what, 60) + '（' + fn + '）');
        if (late) bits.push('交付期限已过 ' + Math.round((t - due) / 60000) + ' 分钟');
        if (gap) bits.push('缺 ' + (p.missing || []).map(function (x) { return clean(x.item, 30) + '×' + x.gap; }).join('、'));
        if (unrec) bits.push('另有 ' + unrec + ' 项未记数量（不计缺口）');
        out.push({
          source: 'pressure', key: 'pressure:' + fn + ':' + clean(p.what, 60),
          from: bits.join('；'),
          actors: clean(p.by, 60) ? [clean(p.by, 60)] : [],
          due: due, windowMs: w.windowMs, windowBasis: w.windowBasis,
          ignoredRef: 'org:project:' + fn + ':' + clean(p.what, 60),
          conflict: late ? '（忽略：项目会一直挂在未结项里，缺口不会自己补齐）'
            : '（忽略：到期限仍未备齐，交付会失败）',
          severity: late ? 'heavy' : 'normal'
        });
      });
    });
  }

  /**
   * ③ 目标互斥：同一人一条在办目标的 `obstacle` **精确等于**另一条在办目标的文本。
   *   为什么用这个口径而不是「看哪两条目标像冲突」：前者是**字段级判定**、可复现、
   *   零猜测；后者要求引擎替人判断意图，判错了没人能发现。
   */
  function fromConflict(t, out) {
    const ppl = (state().people || {});
    Object.keys(ppl).sort().forEach(function (k) {
      const p = ppl[k];
      const lf = p && p.life;
      if (!lf || !Array.isArray(lf.goals)) return;
      const gs = lf.goals.filter(function (g) { return g && g.status === 'active' && clean(g.text, 60); });
      gs.forEach(function (a) {
        const ob = clean(a.obstacle, 60);
        if (!ob) return;
        gs.forEach(function (b) {
          if (!b || b === a) return;
          if (clean(b.text, 60) !== ob) return;
          const who = clean(p.name, 60) || String(k).replace(/^p_/, '');
          out.push({
            source: 'conflict', key: 'conflict:' + k + ':' + clean(a.id, 40),
            from: who + ' 想「' + clean(a.text, 60) + '」，而它的障碍正是他另一项在办目标「' + ob + '」',
            actors: who ? [who] : [],
            due: 0, windowMs: 0, windowBasis: 'default',
            ignoredRef: 'life:' + clean(a.id, 40) + '|' + clean(b.id, 40),
            conflict: '（忽略：两条目标会互相拖着，谁都推不动）',
            severity: 'normal'
          });
        });
      });
    });
  }

  /**
   * ④ 情报未核实：该人**只有转述**（未亲见、未记档）且置信度不高。
   *   已亲见或已记档 ⇒ 不是信息差，不进本来源（那是已知事实，不是机会）。
   */
  function fromIntel(t, out) {
    const intel = WA.intel;
    if (!intel || typeof intel.entitledTo !== 'function') return;
    const ppl = (state().people || {});
    Object.keys(ppl).sort().forEach(function (k) {
      const p = ppl[k];
      if (!p || !p.knowledge || !Array.isArray(p.knowledge.intel)) return;
      const who = clean(p.name, 60) || String(k).replace(/^p_/, '');
      p.knowledge.intel.forEach(function (r) {
        const about = clean(r && r.about, 80);
        if (!about) return;                                   // 没有事由 ⇒ 无从核实，不产候选
        if (r.status === 'retracted' || r.status === 'superseded') return;
        const c = Number(r.confidence);
        // 未记置信度**也算未核实**：缺一项记录不等于已经确认过。
        const low = isFinite(c) ? (c <= 50) : true;
        if (!low) return;
        let ent = false;
        try { ent = intel.entitledTo(who, about) === true; } catch (e) { ent = false; }
        if (ent) return;
        out.push({
          source: 'intel', key: 'intel:' + k + ':' + about,
          from: who + ' 手上只有转述、未核实：「' + clean(r.claim, 100) + '」（事由 ' + about + '）',
          actors: who ? [who] : [],
          due: 0, windowMs: 0, windowBasis: 'default',
          ignoredRef: 'intel:' + k + ':' + about,
          conflict: '（忽略：他会按传闻行事，而传闻与实情的差会在后果里现形）',
          severity: 'normal'
        });
      });
    });
  }

  /** ⑤ 欠账未清：名册内有人被欠着薪俸（债权人是势力）。 */
  function fromDebt(t, out) {
    const org = WA.org;
    if (!org || typeof org.debtsView !== 'function') return;
    const facs = (((state().evolution || {}).factions) || []);
    facs.forEach(function (f) {
      const fn = clean(f && f.name, 40);
      if (!fn) return;
      let v = null;
      try { v = org.debtsView('faction', fn); } catch (e) { return; }
      if (!v || !v.ok || !(v.receivable || []).length) return;
      const who = (v.receivable || []).map(function (x) { return clean(x.from, 60); }).filter(Boolean);
      out.push({
        source: 'debt', key: 'debt:faction:' + fn,
        from: fn + ' 名册内有 ' + (v.receivable || []).length + ' 人被欠着（合计 ' + (Number(v.receivableTotal) || 0) + '）',
        actors: who,
        due: 0, windowMs: 0, windowBasis: 'default',
        ignoredRef: 'org:debts:' + fn,
        conflict: '（忽略：欠账会继续累积，被欠的人会自己来问）',
        severity: 'heavy'
      });
    });
  }

  /** ⑥ 因果后果到期：延迟后果到了期（到期 ≠ 已发生，结算与否是显式决定）。 */
  function fromCausal(t, out) {
    const causal = WA.causal;
    if (!causal || typeof causal.due !== 'function') return;
    let list = null;
    try { list = causal.due(t); } catch (e) { return; }
    const byChain = {};
    (Array.isArray(list) ? list : []).forEach(function (r) {
      const cid = clean(r && r.chain, 40);
      if (!cid) return;
      (byChain[cid] = byChain[cid] || []).push(r);
    });
    Object.keys(byChain).sort().forEach(function (cid) {
      const list2 = byChain[cid];
      const first = list2[0];
      out.push({
        source: 'causal', key: 'causal:' + cid,
        from: '因果链 ' + cid + ' 的延迟后果已到期 ' + list2.length + ' 条（首条：' + clean(first && first.text, 80) + '）',
        actors: [],
        due: Number(first && first.dueAt) || 0, windowMs: 0, windowBasis: 'default',
        ignoredRef: 'causal:' + cid,
        conflict: '（忽略：这条后果既不会自己结算，也不会自己消失）',
        severity: 'normal'
      });
    });
  }

  /** 候选汇总：纯读、零写入、零 stat（sweep 与只读口径共用同一份来源表）。 */
  function collect(now) {
    const t = isFinite(Number(now)) ? Number(now) : clockNow('opportunity');
    const out = [];
    fromPromise(t, out);
    fromPressure(t, out);
    fromConflict(t, out);
    fromIntel(t, out);
    fromDebt(t, out);
    fromCausal(t, out);
    out.forEach(function (c) { c.id = idOf(c.source, c.key.replace(/^[a-z]+:/, '')); });
    return out;
  }

  /**
   * 扫描：把候选登记进在途窗口。
   *   ① 到窗口末尾的在途行转 `lapsed`（如实报，不删）；
   *   ② 同键已在册：在途 ⇒ 只更新描述与窗口（`open` 才动窗口起点，`deferred` 的延长期不许被刷掉）；
   *   ③ **已作废（lapsed）且源条件仍在 ⇒ 重新开窗**（`reopens` 计数留痕）——
   *      世界会再次敲门。已接 / 已拒是玩家的明确决定，**永不重开**。
   */
  function sweep(now) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    if (!WA.store || typeof WA.store.transact !== 'function') { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.sweeps++;
    const t = isFinite(Number(now)) ? Number(now) : clockNow('opportunity');
    const found = collect(t);
    stat.formed = found.length;   // 覆盖式：它答「最近一次扫描看到几个候选」，不是累计
    let out = null;
    WA.store.transact(function (draft) {
      draft.opportunity = (draft.opportunity && typeof draft.opportunity === 'object' && !Array.isArray(draft.opportunity))
        ? draft.opportunity : { openings: [] };
      draft.opportunity.openings = Array.isArray(draft.opportunity.openings) ? draft.opportunity.openings : [];
      const rs = draft.opportunity.openings;
      let lapsed = 0, added = 0, updated = 0, reopened = 0;
      rs.forEach(function (r) {
        if (!isActive(r)) return;
        if (t > endOf(r, cfg)) { r.stage = 'lapsed'; r.lapsedAt = t; r.updatedAt = t; lapsed++; }
      });
      found.forEach(function (c) {
        const wm = c.windowMs > 0 ? c.windowMs : cfg.defaultWindowMs;
        const hit = rs.filter(function (r) { return r && r.key === c.key; }).pop();
        if (!hit) {
          rs.push({ id: c.id, key: c.key, source: c.source, sourceLabel: SOURCE_CN[c.source] || c.source,
            from: c.from, actors: (c.actors || []).slice(), severity: c.severity || 'normal',
            due: c.due || 0, windowMs: wm, windowBasis: c.windowBasis,
            deadlineAt: c.windowBasis === 'recorded' ? (c.due || 0) : 0,
            ignoredRef: c.ignoredRef || '', conflict: c.conflict || '', stage: 'open', actor: '',
            firstAt: t, lastAt: t, decidedAt: 0, reopens: 0, updatedAt: t });
          added++;
          return;
        }
        if (hit.stage === 'lapsed') {
          // 源条件仍然成立 ⇒ 重新开窗（世界再次敲门）。计数留痕：第几次被重新提起。
          hit.stage = 'open'; hit.actor = ''; hit.decidedAt = 0;
          hit.windowMs = wm; hit.windowBasis = c.windowBasis;
          hit.deadlineAt = c.windowBasis === 'recorded' ? (c.due || 0) : 0;
          hit.lastAt = t; hit.reopenedAt = t; hit.reopens = (Number(hit.reopens) || 0) + 1; hit.updatedAt = t;
          reopened++;
          return;
        }
        if (!isActive(hit)) {
          // taken / declined：玩家的明确决定。只补描述变化，**不改阶段**。
          if (hit.from !== c.from) { hit.from = c.from; hit.updatedAt = t; updated++; }
          return;
        }
        hit.from = c.from; hit.actors = (c.actors || []).slice(); hit.severity = c.severity || hit.severity;
        hit.due = c.due || 0; hit.ignoredRef = c.ignoredRef || ''; hit.conflict = c.conflict || '';
        // 只有「仍开放」的行才刷新窗口起点；延后的行用的是玩家给的延长期，不许被扫描刷掉。
        if (hit.stage === 'open') {
          hit.windowMs = wm; hit.windowBasis = c.windowBasis;
          hit.deadlineAt = c.windowBasis === 'recorded' ? (c.due || 0) : 0;
          hit.lastAt = t;
        }
        hit.updatedAt = t; updated++;
      });
      if (WA.evict) WA.evict.array(rs, 'opportunity.openings');   // 挤出有账
      else if (rs.length > 8) rs.splice(0, rs.length - 8);
      out = { ok: true, formed: found.length, added: added, updated: updated, lapsed: lapsed,
        reopened: reopened, active: rs.filter(isActive).length };
    }, 'opportunity:sweep');
    if (out && out.ok) {
      stat.added += out.added; stat.updated += out.updated; stat.lapses += out.lapsed; stat.reopens += out.reopened;
      stat.lastReason = out.added ? 'formed' : (out.reopened ? 'reopened' : (out.lapsed ? 'lapsed' : 'unchanged'));
    } else noteFault('sweep-failed');
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 作答：参与 / 拒绝 / 延后。
   *   三条硬约束：
   *     · `take` 会真的建一次行动（act.add），行动被拒或抛错 ⇒ **回滚阶段**，
   *       绝不留下「已接但没有动作」的悬空行；
   *     · `defer` 必须显式给新窗口（`by`）——没有默认延长期，
   *       「先放着」与「没看见」必须可分辨；
   *     · 本模块**不改任何源状态面**：参与的后果由 act/org/world 自己结算。
   */
  function respond(id, choice, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const cid = clean(id, 120), ch = str(choice, 20);
    if (!cid) return { ok: false, reason: 'missing-id' };
    if (CHOICES.indexOf(ch) < 0) { noteFault('bad-choice'); return { ok: false, reason: 'bad-choice', choices: CHOICES.slice() }; }
    if (!WA.store || typeof WA.store.transact !== 'function') { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const o = opts || {};
    const who = clean(o.actor, 60);
    const t = isFinite(Number(o.now)) ? Number(o.now) : clockNow('opportunity');
    let out = null, actSpec = null;
    WA.store.transact(function (draft) {
      const rs = ((((draft || {}).opportunity || {}).openings) || []);
      const r = rs.filter(function (x) { return x && x.id === cid; }).pop();
      if (!r) { out = { ok: false, reason: 'unknown-opportunity', id: cid }; return false; }
      if (!isActive(r)) { out = { ok: false, reason: 'already-answered', id: cid, stage: r.stage }; return false; }
      if (t > endOf(r, cfg)) {
        r.stage = 'lapsed'; r.lapsedAt = t; r.updatedAt = t;
        out = { ok: false, reason: 'window-closed', id: cid };
        // 这里**不能** `return false`：作废是世界的既有规则（到点即作废），与「这次作答
        //   被拒」是两件事。放弃整笔事务会把刚打上的作废标记一起回滚，行就永远停在
        //   deferred/open 上——而「窗口真的会关」也就成了一句谁也看不到的声明。
        return;
      }
      // 信息差：世界侧记了涉及谁、而作答者不在其中 ⇒ 不受理（不替人补知情）
      if (who && (r.actors || []).length && (r.actors || []).indexOf(who) < 0) {
        out = { ok: false, reason: 'not-entitled', id: cid, actor: who, actors: (r.actors || []).slice() };
        return false;
      }
      if (ch === 'decline') {
        r.stage = 'declined'; r.actor = who; r.decidedAt = t; r.updatedAt = t;
        out = { ok: true, id: cid, source: r.source, choice: 'decline', actor: who };
        return;
      }
      if (ch === 'defer') {
        const by = Number(o.by);
        if (!isFinite(by) || by <= 0) { out = { ok: false, reason: 'missing-window', id: cid }; return false; }
        r.stage = 'deferred'; r.actor = who; r.decidedAt = t;
        // 玩家给的延长期是**显式**的，但它仍属「本模块的宽限」而非「源记录的期限」⇒ default。
        r.windowMs = Math.min(Math.round(by), MAX_WINDOW); r.windowBasis = 'default';
        r.deadlineAt = 0; r.lastAt = t; r.updatedAt = t;
        out = { ok: true, id: cid, source: r.source, choice: 'defer', actor: who, windowMs: r.windowMs };
        return;
      }
      // take：先落阶段，事务外真建行动；被拒或抛错则回滚（下方）
      if (!who) { out = { ok: false, reason: 'no-actor', id: cid }; return false; }
      const kinds = (WA.act && Array.isArray(WA.act.KINDS)) ? WA.act.KINDS : [];
      const kind = str(o.kind, 20);
      if (kinds.indexOf(kind) < 0) { out = { ok: false, reason: 'bad-kind', id: cid, kinds: kinds.slice() }; return false; }
      const goalId = str(o.goalId, 60);
      if (!goalId) { out = { ok: false, reason: 'missing-goal', id: cid }; return false; }
      actSpec = { kind: kind, goalId: goalId, duration: o.duration, need: o.need, opId: o.opId };
      r.stage = 'taken'; r.actor = who; r.decidedAt = t; r.updatedAt = t;
      out = { ok: true, id: cid, source: r.source, choice: 'take', actor: who };
    }, 'opportunity:respond');
    if (out && out.ok && out.choice === 'take') {
      // 行动侧是**真消费方**：机会接了就真排队，不是只改一个词。
      let added = null;
      try { added = (WA.act && typeof WA.act.add === 'function') ? WA.act.add(out.actor, actSpec) : { ok: false, reason: 'no-action' }; }
      catch (e) { added = { ok: false, reason: 'action-throw' }; }
      if (!added || !added.ok) {
        // 回滚：不留「已接但没有动作」的悬空行；源面本来就一个字都没改过。
        let rolled = false;
        WA.store.transact(function (draft) {
          const rs = ((((draft || {}).opportunity || {}).openings) || []);
          const r = rs.filter(function (x) { return x && x.id === cid; }).pop();
          if (!r) return false;
          r.stage = 'open'; r.actor = ''; r.decidedAt = 0; r.updatedAt = t;
          rolled = true;
        }, 'opportunity:rollback');
        stat.refused++;
        stat.lastReason = 'action-refused';
        return { ok: false, reason: 'action-refused', id: cid, actReason: (added && added.reason) || 'unavailable', rolledBack: rolled };
      }
      stat.taken++;
      stat.lastReason = 'taken';
      out.actId = added.id;
      return out;
    }
    if (out && out.ok) {
      if (out.choice === 'decline') stat.declined++;
      if (out.choice === 'defer') stat.deferred++;
      stat.lastReason = out.choice;
    } else if (out) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }

  // ── 只读面 ──────────────────────────────────────────────────
  function rowView(r, t) {
    const recorded = r.windowBasis === 'recorded';
    const end = endOf(r, settings());
    return {
      id: r.id, key: r.key, source: r.source, sourceLabel: r.sourceLabel || SOURCE_CN[r.source] || r.source,
      from: r.from, actors: (r.actors || []).slice(), severity: r.severity || 'normal',
      stage: r.stage, active: isActive(r), actor: r.actor || '',
      // 只有**源显式给了期限**才给 deadline；默认宽限一律给 0 并带 windowBasis:'default'
      windowMs: Number(r.windowMs) || 0, windowBasis: r.windowBasis,
      deadline: recorded ? (Number(r.deadlineAt) || 0) : 0,
      // 「这扇窗曾经关上过吗」而不是「此刻点过了没有」：已作废的行哪怕后来被源条件
      //   重新开窗，它**上一次确实关过**——把两者混成一句，作废就再也读不出来。
      endAt: end, windowClosed: (t > end) || !!r.lapsedAt,
      due: Number(r.due) || 0, ignoredRef: r.ignoredRef || '', conflict: r.conflict || '',
      firstAt: Number(r.firstAt) || 0, decidedAt: Number(r.decidedAt) || 0, reopens: Number(r.reopens) || 0
    };
  }
  function view(id, opts) {
    const cid = clean(id, 120);
    if (!cid) return { ok: false, reason: 'missing-id' };
    const r = rows().filter(function (x) { return x && x.id === cid; }).pop();
    if (!r) return { ok: false, reason: 'unknown-opportunity', id: cid };
    const o = opts || {};
    const t = isFinite(Number(o.now)) ? Number(o.now) : clockNow('opportunity');
    return Object.assign({ ok: true }, rowView(r, t));
  }
  /** 只读列举：默认只给在途（open/deferred）；`{all:true}` 或 `{active:false}` 给全量含已答与已作废。 */
  function list(opts) {
    const o = opts || {};
    const t = isFinite(Number(o.now)) ? Number(o.now) : clockNow('opportunity');
    const all = o.all === true || o.active === false;
    return rows().map(function (r) { return rowView(r, t); })
      .filter(function (v) { return all ? true : v.active; });
  }
  function statView() {
    const cfg = settings();
    const rs = rows();
    const cnt = function (s) { return rs.filter(function (r) { return r && r.stage === s; }).length; };
    return { enabled: !!cfg.enabled, maxOpen: cfg.maxOpen, defaultWindowMs: cfg.defaultWindowMs,
      sources: SOURCES.slice(), stages: STAGES.slice(),
      total: rs.length, active: rs.filter(isActive).length,
      open: cnt('open'), deferred: cnt('deferred'), taken: cnt('taken'), declined: cnt('declined'), lapsed: cnt('lapsed'),
      sweeps: stat.sweeps, formed: stat.formed, added: stat.added, lapses: stat.lapses, reopens: stat.reopens,
      takenNow: stat.taken, declinedNow: stat.declined, deferredNow: stat.deferred, refused: stat.refused,
      lastReason: stat.lastReason, faults: Object.assign({}, stat.faults) };
  }
  /**
   * 注入块：只出**在途**机会。已答与已作废的不进正文——
   *   否则模型会把「上周拒掉的那件事」当成此刻还摆着。
   *   四个必答项（由哪项变化产生 / 涉及谁 / 窗口多久 / 忽略会怎样）逐项落地。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const t = clockNow('opportunity');
    const rs = rows().filter(isActive);
    if (!rs.length) return '';
    const lines = rs.slice(0, cfg.maxOpen).map(function (r) {
      const v = rowView(r, t);
      const bits = ['- ' + v.id + '（' + v.sourceLabel + '）由：' + v.from];
      bits.push('涉及：' + ((v.actors || []).length ? v.actors.join('、') : '未记录'));
      bits.push(v.windowBasis === 'recorded' && v.deadline
        ? ('窗口：至 ' + v.deadline + '（源记录了期限）')
        : ('窗口：本模块默认宽限 ' + Math.round(v.windowMs / 60000) + ' 分钟（源未记期限）'));
      if (v.conflict) bits.push(v.conflict);
      return bits.join('；');
    });
    const nl = String.fromCharCode(10);
    const head = '[机会]' + nl
      + '以下窗口由世界状态的变化生成（承诺逾期 / 项目缺口 / 目标互斥 / 情报未核实 / 欠账未清 / 因果后果到期）。'
      + '参与、拒绝、延后都必须显式作答；不答到期即作废。世界不会因为没人接而停摆——'
      + '它按已有规则继续，只是这件事会照它原本的走向发生。' + nl;
    return head + lines.join(nl) + nl + '机会只登记「有一个可参与的窗口」，不改任何既有事实。';
  }

  WA.opportunity = {
    SOURCES: SOURCES.slice(), SOURCE_CN: Object.assign({}, SOURCE_CN),
    STAGES: STAGES.slice(), ACTIVE: ACTIVE.slice(), CHOICES: CHOICES.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    collect: collect, sweep: sweep, respond: respond,
    view: view, list: list, buildBlock: buildBlock, statView: statView,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (WA.log) WA.log('info', '机会形成已加载');
})();