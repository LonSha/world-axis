/**
 * WorldAxis engines/liaison.js (v2.118.0) — 跨插件业务闭环（计划二 B8）
 *
 * ── 它治什么（缺口原句）────────────────────────────────────
 *   计划二 B8 原文：「现有 `phone-bridge` 只登记 message/pin/block/unblock 等动作，并可关联已存在的
 *   因果链；**它没有监听或自动创建/结算业务链**。新增闭环是『接收操作—校验聊天/分支/参与者—
 *   确认或拒绝—形成对应的消息/约定任务—到期与回执—产生人物认知和关系后果』。**opId 贯穿两端，
 *   重复请求只返回原结果**。『已提交到桥』『已发送』『已送达』『对方已知晓』『已产生后果』**分别表达**。
 *   断网、插件关闭和容量满时**保留待确认或可重试状态**；不能记录一次操作就声称对方已收到，
 *   更不能让 pin/block 等界面操作**无条件**造成关系变化。」
 *
 * ── 为什么不并进 phone-bridge（两者是不同的问题）──────────────
 *   phone-bridge 答的是「**手机侧按下过什么**」——一笔台账，一个写入口，零业务判断。
 *   本模块答的是「**这件事在世界里成不成立**」——校验、确认/拒绝、形成约定任务、到期回执、
 *   认知与关系后果。把两者合成一个模块，最直接的后果就是「记了一笔」与「事情发生了」
 *   在状态里长得一样 —— 而 B8 的验收判据恰恰是**这两件事必须分得开**。
 *
 * ── 五条否定式（本模块存在的全部理由）──────────────────────
 *   ① **登记 ≠ 送达**。阶段五档（submitted / sent / delivered / known / settled）逐档分列，
 *      任何一档都不会被自动升格成下一档。`submitted` 永远不表示「对方收到了」。
 *   ② **界面动作不产生关系变化**。pin / block / unblock 只是台账与阶段推进；
 *      关系后果必须由**已结算的约定**给出（`affectsRelation` 默认关闭，且只认约定）。
 *   ③ **重复请求返回原结果**。按 `opId` 幂等：第二次调用返回第一次的同一行（`reused: true`），
 *      既不重复登记也不重复结算记忆/关系。
 *   ④ **记忆不重复结算**。本模块确认过的事实带 `source`（opId + 轮次 + 有效范围）；
 *      同一 opId 的同一事实第二次到达时**只返回原回执**，不再写一条新证据。
 *   ⑤ **缺席与满载如实保留**。桥关闭 / 容量满 / 参与者不在场时进入 `pending` 并给出可重试原因，
 *      不吞掉、也不假装成功。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────
 *   · 传输/认证/断线恢复**不在本模块**：本模块只处理「本侧收到了一笔操作之后」的本地状态机。
 *   · 实机三插件联调**未执行**（规划原文亦未执行）：本模块只保证本地可验证的幂等、阶段与回执。
 *   · 总开关默认关闭；关闭时不校验、不登记、不结算。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };
  const LS_KEY = 'worldaxis_liaison_settings_v1';
  const DEF = {
    enabled: false,
    // 关系后果默认**关闭**：界面动作不无条件造成关系变化（B8 原文点名）
    affectsRelation: false,
    // 一轮最多结算几个到期约定（防「一开就把整局未结算的全结算掉」）
    maxDue: 4
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'liaison', bounds: { maxDue: [1, 12] } };
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

  // 阶段五档：**逐个表达**（合并任何两档都会让「对方到底收到了没有」答不出）
  const STAGES = ['submitted', 'sent', 'delivered', 'known', 'settled'];
  const STAGE_CN = { submitted: '已提交到桥', sent: '已发送', delivered: '已送达', known: '对方已知晓', settled: '已产生后果' };
  // 约定任务的状态：act 的文件流只提供终态，pending/cancelled 由台账负责
  const DEAL_STATUS = ['pending', 'due', 'done', 'failed', 'cancelled'];
  // 证据有效范围（「这条记忆在多大范围内成立」）
  const SCOPES = ['world', 'person', 'relation'];
  const LIMITS = { ROWS: 40, DEALS: 24, TEXT: 80, MAX_DUE: 8 };

  const stat = {
    received: 0, accepted: 0, refused: 0, pending: 0, reused: 0,
    deals: 0, due: 0, fulfilled: 0, failed: 0, evidence: 0, relation: 0,
    lastReason: '', faults: {}
  };
  // 与本仓其余模块同规格：门面把计数转发给执行上下文里的计数袋（试演不污染真计数器）
  function execMod() { return (WA.exec && typeof WA.exec.withContext === 'function') ? WA.exec : null; }
  function storeOf() { const e = execMod(); return e ? e.storeOf(WA.store) : WA.store; }
  function mutate(fn, opt) { const e = execMod(); const st = storeOf(); return e ? e.mutate(st, fn, opt) : (st && st.transact ? st.transact(fn, opt) : { ok: false, reason: 'store-absent' }); }
  function statBagOf() {
    const e = execMod(); const bag = e ? e.statBag(stat) : stat;
    if (bag && bag !== stat) {
      Object.keys(stat).forEach(function (k) {
        if (bag[k] === undefined) {
          const v = stat[k];
          bag[k] = (v && typeof v === 'object') ? Object.assign(Object.create(null), v) : v;
        }
      });
    }
    return bag || stat;
  }
  const S = (function () {
    const f = {};
    Object.keys(stat).forEach(function (k) {
      Object.defineProperty(f, k, { enumerable: true,
        get: function () { return statBagOf()[k]; },
        set: function (v) { statBagOf()[k] = v; } });
    });
    return f;
  })();
  function noteFault(reason) {
    const tag = String(reason == null ? 'unknown' : reason);
    S.faults[tag] = (S.faults[tag] || 0) + 1;
    S.refused++;
    S.lastReason = tag;
    return tag;
  }
  function str(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/\s+/g, ' ').trim().slice(0, max || LIMITS.TEXT);
  }
  function finite(v) {
    if (v === undefined || v === null || v === '' || typeof v === 'boolean') return NaN;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : str(v, max); }
  function state() { const st = storeOf(); return st && st.get ? (st.get() || {}) : {}; }
  function nodeOf(draft) {
    if (!draft.liaison || typeof draft.liaison !== 'object' || Array.isArray(draft.liaison)) {
      draft.liaison = { inbox: [], deals: [], evidence: [] };
    }
    const n = draft.liaison;
    if (!Array.isArray(n.inbox)) n.inbox = [];
    if (!Array.isArray(n.deals)) n.deals = [];
    if (!Array.isArray(n.evidence)) n.evidence = [];
    return n;
  }
  function rowsOf() { const n = state().liaison; return (n && Array.isArray(n.inbox)) ? n.inbox : []; }
  function dealsOf() { const n = state().liaison; return (n && Array.isArray(n.deals)) ? n.deals : []; }
  function evidenceOf() { const n = state().liaison; return (n && Array.isArray(n.evidence)) ? n.evidence : []; }

  /** 行动是否在途 / 已完成（问 act 的真源，不另存一份「进度」）。 */
  function actRowOf(id) {
    const a = state().acts;
    const rows = (a && Array.isArray(a.rows)) ? a.rows : [];
    return rows.filter(function (x) { return x && x.id === id; })[0] || null;
  }
  /**
   * 人物条目的**唯一**查找口：按容器键、带前缀的键、或 name 三种写法都认。
   *   为什么不各处自己写：收件校验、目标挑选、关系后果三处都要找人，
   *   三处各写一份 `people[p] || people['p_' + p]` 就是三份会各自漂移的口径。
   */
  function personOf(person) {
    const who = str(person, 60);
    if (!who) return null;
    const ppl = state().people || {};
    const keys = Object.keys(ppl);
    for (let i = 0; i < keys.length; i++) {
      const p = ppl[keys[i]];
      if (!p) continue;
      if (keys[i] === who || keys[i] === 'p_' + who || p.name === who || p.id === who) return p;
    }
    return null;
  }
  /** 该人名下第一个 active 目标（约定任务必须挂在真目标上，不凭空造）。 */
  function goalOf(person) {
    const p = personOf(person);
    const gs = (p && p.life && Array.isArray(p.life.goals)) ? p.life.goals : [];
    const g = gs.filter(function (x) { return x && x.status === 'active'; })[0];
    return (g && g.id) ? String(g.id) : '';
  }
  /**
   * 人在场与否：只问 world 的真源（缺席不猜，返回 null 表示「问不出来」）。
   *   真源是 `world.where(person)` —— 「在路上」也是一种确定的可回答状态，
   *   故它不是缺席；而 `no-journey` / `halted` 是真的答不出位置，返回 null。
   */
  function hereOf(person) {
    try {
      if (WA.world && typeof WA.world.where === 'function') {
        const r = WA.world.where(person);
        if (r && r.ok === true) {
          if (r.inTransit) return '在路上（' + (r.from || '?') + '→' + (r.to || '?') + '）';
          if (typeof r.place === 'string' && r.place) return r.place;
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * 收下一笔手机侧操作，并**把它变成世界里的约定任务**（唯一写入口）。
   *   闭环的第一段：接收操作 → 校验（聊天/分支/参与者）→ 确认或拒绝 → 形成约定任务。
   *   `opId` 幂等（贯穿两端）：第二次调用返回**同一行原结果**，不重复登记、不重复建任务。
   */
  function receive(item) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const it = item || {};
    const opId = clean(it.opId, 60);
    const act = clean(it.act, 20);
    if (!opId) { noteFault('missing-op'); return { ok: false, reason: 'missing-op' }; }
    const from = clean(it.from, 60), to = clean(it.to, 60);
    if (!from) { noteFault('missing-from'); return { ok: false, reason: 'missing-from' }; }
    // 幂等先于一切：手机侧重试是常态，重试不得建第二个任务
    const hit = rowsOf().filter(function (x) { return x && x.opId === opId; })[0];
    if (hit) {
      S.reused++; S.lastReason = 'reused';
      return { ok: true, reused: true, opId: opId, id: hit.id, stage: hit.stage, stageLabel: STAGE_CN[hit.stage] || hit.stage,
        dealId: hit.dealId || '', reason: hit.reason || '' };
    }
    // 校验参与者：只有世界认得的人才能作为**世界侧**参与者进入闭环
    const unknown = [];
    [from, to].forEach(function (p) {
      if (!p) return;
      if (!personOf(p)) unknown.push(p);
    });
    if (unknown.length) {
      noteFault('unknown-participant');
      return { ok: false, reason: 'unknown-participant', unknown: unknown.slice(0, 4) };
    }
    const now = isFinite(finite(it.at)) ? Number(it.at) : clockNow('liaison');
    // 期限**先算出来**：它既要进台账（重试时才知道该补什么任务），也要进约定任务。
    const dueAt = finite(it.dueAt);
    let out = null;
    // 行必须在事务**外**可见：出站登记（pushToBridge）与约定任务创建（createDeal）
    //   都要它的 id / opId / at；只把结果 out 传出来的话，事务一结束那行就拿不到了
    //   （实测：`row is not defined` —— close 阶段的第一条硬缺陷）。
    let row = null;
    mutate(function (draft) {
      const n = nodeOf(draft);
      const seq = n.inbox.length + 1;
      row = {
        id: 'lx_' + String(now).toString(36) + '_' + seq,
        opId: opId, act: act || 'message', from: from, to: to,
        // 阶段**只到 submitted**：本侧收到了一笔操作，绝不等于对方收到了消息
        stage: 'submitted', stageLabel: STAGE_CN.submitted,
        // 桥侧台账是否已收下（false 时这笔是「本侧暂存待确认」——断网/插件关闭/容量满都走这里）
        bridged: false, bridgeReason: '', dealId: '', reason: '',
        at: now, seq: seq, updatedAt: now,
        // 期限入台账：retry() 靠它判断「这笔带期限却还没建任务」时该补什么
        dueAt: isFinite(dueAt) ? dueAt : 0
      };
      n.inbox.push(row);
      if (WA.evict) WA.evict.array(n.inbox, 'liaison.inbox');
      out = { ok: true, reused: false, opId: opId, id: row.id, stage: row.stage, seq: seq };
    }, 'liaison:receive');
    if (!out || !out.ok) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    S.received++; S.lastReason = 'received';
    // 兜底：事务说成功却拿不到行 —— 宁可拒收，也不拿半条记录去登记出站边。
    if (!row) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    // 桥侧登记（**不假装对方已收到**）：失败只降级为 pending，不吞掉这笔操作
    const nb = pushToBridge(row, it);
    if (nb.pending) { S.pending++; return Object.assign({}, out, { ok: true, pending: true, bridgeReason: nb.reason, stage: 'submitted' }); }
    S.accepted++;
    // 形成约定任务：只有**带期限**的通知/约定才建任务（无期限的消息不建，免得任务表被闲聊撑满）
    if (isFinite(dueAt)) {
      const d = createDeal(row.id, { with: to, from: from, dueAt: dueAt, note: it.note, at: now });
      if (d.ok) { S.deals++; out.dealId = d.dealId; }
      // 半成功必须**如实分列**：收件确实落进来了（kept），世界侧约定没形成（reason）。
      //   合成一个 ok:false 会让调用方以为整笔操作丢了，于是重推一次 —— 而重推
      //   撞幂等键又只会拿回同一行（看起来像「什么都没发生」）。
      else return Object.assign({}, out, { ok: false, reason: d.reason, kept: true,
        note: '收件已落台账，但世界侧约定没有形成' });
    }
    return out;
  }

  /** 把一笔操作交给 phone-bridge 的入站面。桥缺席/关闭/满员 ⇒ pending（待确认），不是失败。 */
  function pushToBridge(row, it) {
    if (!(WA.phoneBridge && typeof WA.phoneBridge.noteAction === 'function')) return { pending: true, reason: 'bridge-absent' };
    let r = null;
    try {
      r = WA.phoneBridge.noteAction({ opId: row.opId, act: row.act, from: row.from, to: row.to, at: row.at });
    } catch (e) { return { pending: true, reason: 'bridge-threw' }; }
    if (r && r.ok === true) {
      markBridged(row.opId, true, '');
      return { pending: false, reason: '' };
    }
    const reason = (r && r.reason) || 'bridge-refused';
    markBridged(row.opId, false, reason);
    return { pending: true, reason: reason };
  }
  function markBridged(opId, ok, reason) {
    mutate(function (draft) {
      const n = nodeOf(draft);
      const hit = n.inbox.filter(function (x) { return x && x.opId === opId; })[0];
      if (!hit) return false;
      hit.bridged = !!ok; hit.bridgeReason = str(reason, 40);
      hit.updatedAt = clockNow('liaison');
      return true;
    }, 'liaison:bridged');
  }

  /** 形成约定任务：真源是 `acts.rows`（世界侧的行动），本模块的台账只记它的 id 与状态。 */
  function createDeal(inboxId, spec) {
    const cfg = settings();
    const s = spec || {};
    const dueAt = finite(s.dueAt);
    if (!isFinite(dueAt)) return { ok: false, reason: 'bad-due' };
    const with_ = clean(s.with, 60), from = clean(s.from, 60);
    if (!with_) return { ok: false, reason: 'missing-with' };
    const now = isFinite(finite(s.at)) ? Number(s.at) : clockNow('liaison');
    // 行动侧登记：kind='meet'（会面/邀约）——走 act 的真准入，不自己另造一份规则。
    //   主体是**发起方**（谁答应的谁去做）；目标取他名下已有的 active 目标，
    //   没有就不凭空造一个（act 的否定式②「不凭空建人」在此处的同义展开：
    //   不凭空建目标 —— 造一个目标等于替玩家安排了动机）。
    const owner = from || with_;
    if (!personOf(owner)) return { ok: false, reason: 'missing-owner', person: owner };
    const goalId = str(s.goalId, 60) || goalOf(owner);
    if (!goalId) return { ok: false, reason: 'no-goal', person: owner,
      note: '发起方名下没有可挂的 active 目标，约定无处承载（如实拒收，不代造目标）' };
    if (!WA.act || typeof WA.act.add !== 'function') return { ok: false, reason: 'act-absent' };
    const added = WA.act.add(owner, { kind: 'meet', goalId: goalId, duration: Math.max(0, dueAt - now),
      text: '与' + with_ + '约定的会面' });
    if (!added || !added.ok) return { ok: false, reason: (added && added.reason) || 'add-failed', goalId: goalId };
    let out = null;
    mutate(function (draft) {
      const n = nodeOf(draft);
      if (n.deals.length >= LIMITS.DEALS) { out = { ok: false, reason: 'deals-full' }; return false; }
      const id = 'dl_' + String(now).toString(36) + '_' + (n.deals.length + 1);
      n.deals.push({ id: id, inboxId: inboxId, opId: '', partA: from, partB: with_,
        status: 'pending', dueAt: dueAt, actId: added.id, note: str(s.note, LIMITS.TEXT),
        fulfilment: '', at: now, updatedAt: now });
      if (WA.evict) WA.evict.array(n.deals, 'liaison.deals');
      out = { ok: true, dealId: id, actId: added.id };
      return true;
    }, 'liaison:deal');
    if (!out || !out.ok) return out || { ok: false, reason: 'store-unavailable' };
    // 回填到收件行（一笔操作对应的任务 id：追溯靠这个，不靠字符串拼）
    mutate(function (draft) {
      const n = nodeOf(draft);
      const hit = n.inbox.filter(function (x) { return x && x.id === inboxId; })[0];
      if (hit) { hit.dealId = out.dealId; hit.updatedAt = clockNow('liaison'); }
      return true;
    }, 'liaison:deal-link');
    return out;
  }

  /**
   * 阶段推进（**只前言，不跳跃**）。每一次推进都必须给出**依据**，否则拒收。
   *   sent      ← 桥确认收下（bridged）
   *   delivered ← 行动真的推进到了（acts.rows 里该行 status=running）
   *   known     ← 对方**确实在场**（world.at 问得出来）
   *   settled   ← 由 `settleDeal()` 给出（到期结算），不在本函数里跳
   */
  function advance(opId, stage, why) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const op = clean(opId, 60), to = clean(stage, 20);
    const idx = STAGES.indexOf(to);
    if (idx < 0) { noteFault('unknown-stage'); return { ok: false, reason: 'unknown-stage', stages: STAGES.slice() }; }
    if (idx === STAGES.length - 1) { noteFault('settle-not-here'); return { ok: false, reason: 'settle-not-here', note: '终档只能由 settleDeal 给出' }; }
    const cur = rowsOf().filter(function (x) { return x && x.opId === op; })[0] || null;
    if (!cur) { noteFault('missing-op'); return { ok: false, reason: 'missing-op' }; }
    const cidx = STAGES.indexOf(cur.stage);
    if (idx <= cidx) { S.reused++; return { ok: true, reused: true, opId: op, stage: cur.stage, note: '阶段不倒退' }; }
    if (idx > cidx + 1) { noteFault('stage-skip'); return { ok: false, reason: 'stage-skip', from: cur.stage, to: to }; }
    // 依据校验：**没依据就不许推进**（这正是「不能记录一次操作就声称对方已收到」的实现）
    const basis = [];
    if (to === 'sent') {
      if (!cur.bridged) { noteFault('no-basis:bridge'); return { ok: false, reason: 'no-basis', need: 'bridge-ack', got: cur.bridgeReason || 'not-bridged' }; }
      basis.push('bridge:' + cur.opId);
    } else if (to === 'delivered') {
      const a = cur.dealId ? actRowOf((dealsOf().filter(function (d) { return d && d.id === cur.dealId; })[0] || {}).actId) : null;
      if (!a || a.status !== 'running') { noteFault('no-basis:act'); return { ok: false, reason: 'no-basis', need: 'act-running', got: a ? a.status : 'missing-act' }; }
      basis.push('act:' + a.id);
    } else if (to === 'known') {
      const place = hereOf(cur.to);
      if (!place) { noteFault('no-basis:presence'); return { ok: false, reason: 'no-basis', need: 'recipient-present', got: 'unknown' }; }
      basis.push('world.at:' + cur.to + '@' + place);
    }
    let out = null;
    mutate(function (draft) {
      const n = nodeOf(draft);
      const hit = n.inbox.filter(function (x) { return x && x.opId === op; })[0];
      if (!hit) { out = { ok: false, reason: 'missing-op' }; return false; }
      hit.stage = to; hit.stageLabel = STAGE_CN[to]; hit.updatedAt = clockNow('liaison');
      hit.basis = basis.slice();
      out = { ok: true, opId: op, id: hit.id, stage: to, stageLabel: STAGE_CN[to], basis: basis.slice() };
      return true;
    }, 'liaison:advance');
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 到期结算（**约定的终态在这里**）。
   *   完成：行动完结（acts.rows 里该行 done）⇒ deal=done + 证据 + 认知；
   *   失约：期限已过而行动未完结 ⇒ deal=failed，并**如实标注「到期不等于故意失约」**。
   */
  function settleDeal(dealId, atMs) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const id = clean(dealId, 60);
    if (!id) { noteFault('missing-deal'); return { ok: false, reason: 'missing-deal' }; }
    const t = isFinite(finite(atMs)) ? Number(atMs) : clockNow('liaison');
    const d0 = dealsOf().filter(function (x) { return x && x.id === id; })[0] || null;
    if (!d0) { noteFault('missing-deal'); return { ok: false, reason: 'missing-deal' }; }
    if (d0.status === 'done' || d0.status === 'failed' || d0.status === 'cancelled') {
      // 重复结算**只返回原结果**（重载 / 重复回调不得重复奖惩）
      S.reused++;
      return { ok: true, reused: true, dealId: id, status: d0.status, note: '已终态，不重复结算' };
    }
    if (!(t >= d0.dueAt)) { return { ok: false, reason: 'not-due', dueAt: d0.dueAt, now: t }; }
    const a = actRowOf(d0.actId);
    const done = !!(a && a.status === 'done');
    let out = null;
    mutate(function (draft) {
      const n = nodeOf(draft);
      const d = n.deals.filter(function (x) { return x && x.id === id; })[0];
      if (!d) { out = { ok: false, reason: 'missing-deal' }; return false; }
      if (d.status === 'done' || d.status === 'failed' || d.status === 'cancelled') {
        out = { ok: true, reused: true, dealId: id, status: d.status }; return false;
      }
      d.status = done ? 'done' : 'failed';
      d.fulfilment = done ? '按时到达' : '到期未见';
      d.settledAt = t; d.updatedAt = t;
      // 证据（**带来源**：opId + 轮次 + 有效范围）。同一 opId 只落一条 —— 重复载入不重复结算。
      const key = 'deal:' + id;
      if (!n.evidence.some(function (e) { return e && e.key === key; })) {
        // 来源要**追得回那笔操作**：从约定回指的收件行取 opId，不是留空
        const srcRow = d.inboxId ? (n.inbox.filter(function (x) { return x && x.id === d.inboxId; })[0] || null) : null;
        n.evidence.push({ id: 'ev_' + id, key: key, at: t, scope: 'relation',
          text: done ? (d.partB + '如约出现') : (d.partB + '到期未见'),
          source: { dealId: id, actId: d.actId, opId: srcRow ? srcRow.opId : '', at: t, range: 'relation' } });
        if (WA.evict) WA.evict.array(n.evidence, 'liaison.evidence');
      }
      // 认知后果：**失约不等于故意失约**（B8 原文：「到期不等于故意失约」）
      draft.people = draft.people && typeof draft.people === 'object' ? draft.people : {};
      const pid = d.partA;
      if (draft.people[pid]) {
        draft.people[pid].knowledge = draft.people[pid].knowledge && typeof draft.people[pid].knowledge === 'object'
          ? draft.people[pid].knowledge : {};
        const list = Array.isArray(draft.people[pid].knowledge.intel) ? draft.people[pid].knowledge.intel : [];
        const ii = 'intel_liaison_' + id;
        if (!list.some(function (x) { return x && x.id === ii; })) {
          list.push({ id: ii, level: 'witness', text: done ? '约定达成' : '对方到期未到（可能受阻，原因未知）',
            source: 'liaison:' + id, at: t });
          if (WA.evict) WA.evict.array(list, 'people.intel', 24);
          draft.people[pid].knowledge.intel = list;
        }
      }
      out = { ok: true, reused: false, dealId: id, status: d.status, fulfilment: d.fulfilment, at: t };
      return true;
    }, 'liaison:settle');
    if (!out || !out.ok) return out || { ok: false, reason: 'store-unavailable' };
    if (out.reused) return out;
    S.due++; S.evidence++;
    if (done) S.fulfilled++; else S.failed++;
    S.lastReason = done ? 'fulfilled' : 'failed';
    // 关系后果：**只在开关打开、且只认「已结算的约定」**时给（界面动作永不产生关系变化）
    if (cfg.affectsRelation) {
      const rel = applyRelation(d0, done, t);
      if (rel && rel.ok) S.relation++;
      out.relation = rel ? Object.assign({ ok: !!rel.ok }, rel) : { ok: false, reason: 'no-relation-face' };
    } else {
      out.relation = { ok: false, reason: 'relation-off',
        note: '关系后果默认**关**：界面动作不无条件造成关系变化（B8 原文点名）' };
    }
    return out;
  }
  /**
   * 关系后果（**唯一的出口**：fondness.apply；本模块不自造关系模型、不改 trust 数值）。
   *   方向：作用对象是**应邀方**（partB）。
   *     为什么不双向：同一个无向关系在双方各记一行等于把一件事记两次，
   *     而 B8 要防的正是「重复结算」——单向写入 + 证据里带双方，追溯面反而更全。
   *   失约**不降好感**：fondness 的不降准则是那条引擎的边界（冲突走 trust 对冲），
   *     trust 的数值属于关系主视角的决定，本模块不代填 —— 如实回报「这一步没做」，
   *     不假装已经惩罚过。这就是「到期不等于故意失约」在关系面上的落法。
   */
  function applyRelation(deal, done, t) {
    const F = WA.fondness;
    if (!F || typeof F.apply !== 'function') return { ok: false, reason: 'relation-absent' };
    const who = str(deal.partB, 60);
    if (!personOf(who)) return { ok: false, reason: 'missing-person', person: who };
    if (!done) {
      return { ok: false, reason: 'no-negative-step', person: who,
        note: '失约只记认知与证据，好感不降（不降准则）；负向需 trust 对冲，本模块不擅自代填' };
    }
    try {
      const r = F.apply(who, { delta: 0.3, reason: '如约赴会（' + deal.id + '）' });
      return r && r.ok === true
        ? { ok: true, person: who, delta: 0.3 }
        : { ok: false, reason: (r && r.reason) || 'relation-refused', person: who };
    } catch (e) { return { ok: false, reason: 'relation-threw' }; }
  }
  /** 扫描所有到期的约定（一轮只结算 maxDue 条，不一次把整局结完）。 */
  function settleDue(atMs) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const t = isFinite(finite(atMs)) ? Number(atMs) : clockNow('liaison');
    const live = dealsOf().filter(function (d) { return d && (d.status === 'pending' || d.status === 'due'); });
    const capped = live.slice(0, Math.max(1, Math.min(LIMITS.MAX_DUE, cfg.maxDue)));
    const results = [];
    capped.forEach(function (d) {
      const r = settleDeal(d.id, t);
      results.push({ dealId: d.id, ok: !!r.ok, status: r.status || '', reason: r.reason || '', reused: !!r.reused });
    });
    const skipped = live.length - capped.length;
    return { ok: true, at: t, considered: capped.length, skipped: skipped, results: results.slice() };
  }
  /** 重试：把「待确认」的收件重新推给桥（断网恢复 / 插件重新打开后的显式动作）。 */
  function retry(opId) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const op = clean(opId, 60);
    if (!op) { noteFault('missing-op'); return { ok: false, reason: 'missing-op' }; }
    const cur = rowsOf().filter(function (x) { return x && x.opId === op; })[0] || null;
    if (!cur) { noteFault('missing-op'); return { ok: false, reason: 'missing-op' }; }
    if (cur.bridged) { S.reused++; return { ok: true, reused: true, opId: op, note: '已在桥侧登记，不重复' }; }
    const nb = pushToBridge(cur, cur);
    if (nb.pending) { S.pending++; return { ok: true, opId: op, pending: true, bridgeReason: nb.reason }; }
    S.accepted++;
    // 重试成功后若这笔带期限却还没建任务（首轮桥失败时没建），这里补上
    if (!cur.dealId) {
      const dueAt = finite(cur.dueAt);
      if (isFinite(dueAt)) {
        const d = createDeal(cur.id, { with: cur.to, from: cur.from, dueAt: dueAt, at: clockNow('liaison') });
        if (d.ok) S.deals++;
        // 半成功必须**如实分列**（与 receive 同一条纪律）：桥侧收下了、世界侧约定没形成。
        //   原先这里把 d 的失败丢在地上 ⇒ 调用方读到的是「重试成功」（ok:true, sent:true），
        //   而世界侧其实什么都没发生 —— 真实发生的拒收报不出来，是本仓最忌讳的形态。
        else { noteFault(d.reason); return { ok: false, reason: d.reason, kept: true, opId: op, pending: false,
          note: '桥侧已收下，但世界侧约定没有形成' }; }
      }
    }
    const r = advance(op, 'sent', 'retry');
    return { ok: true, opId: op, pending: false, sent: !!(r && r.ok) };
  }
  /** 容量满 / 插件关闭时**保留待确认**的行（可重试队列）。 */
  function pendingRows() {
    return rowsOf().filter(function (x) { return x && !x.bridged; }).map(function (x) {
      return { opId: x.opId, id: x.id, act: x.act, from: x.from, to: x.to, stage: x.stage,
        bridgeReason: x.bridgeReason || '', retryable: true };
    });
  }
  /** 只读视图（面板 / 诊断消费）。 */
  function view(opts) {
    const cfg = settings();
    const o = opts || {};
    const lim = Math.max(1, Math.min(200, Math.floor(finite(o.limit)) || 10));
    const rows = rowsOf();
    const byStage = {};
    STAGES.forEach(function (s) { byStage[s] = 0; });
    rows.forEach(function (r) { if (r && byStage[r.stage] !== undefined) byStage[r.stage]++; });
    return {
      ok: true, enabled: cfg.enabled, affectsRelation: cfg.affectsRelation,
      stages: STAGES.slice(), stageLabel: Object.assign({}, STAGE_CN),
      deals: dealsOf().length, evidence: evidenceOf().length,
      pendingRetry: pendingRows().length, byStage: byStage,
      recent: rows.slice(-lim).map(function (r) {
        return { opId: r.opId, id: r.id, act: r.act, from: r.from, to: r.to,
          stage: r.stage, stageLabel: r.stageLabel, bridged: !!r.bridged, dealId: r.dealId || '' };
      })
    };
  }
  function statView() {
    const bag = statBagOf();
    return Object.assign({}, bag, { faults: Object.assign({}, bag.faults),
      inbox: rowsOf().length, deals: dealsOf().length, evidence: evidenceOf().length });
  }

  WA.liaison = {
    STAGES: STAGES.slice(), STAGE_CN: Object.assign({}, STAGE_CN),
    SCOPES: SCOPES.slice(), DEAL_STATUS: DEAL_STATUS.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    receive: receive, advance: advance, settleDeal: settleDeal, settleDue: settleDue,
    retry: retry, pendingRows: pendingRows,
    // 只读面：台账 / 任务 / 证据（追溯靠真源比对，不靠字符串拼）
    inbox: function (limit) { return rowsOf().slice(-(Math.max(1, Math.floor(finite(limit)) || 20))); },
    deals: function () { return dealsOf().slice(); },
    evidence: function (limit) { return evidenceOf().slice(-(Math.max(1, Math.floor(finite(limit)) || 20))); },
    traceOf: function (opId) {
      const op = clean(opId, 60);
      if (!op) return { ok: false, reason: 'missing-op' };
      const row = rowsOf().filter(function (x) { return x && x.opId === op; })[0] || null;
      if (!row) return { ok: false, reason: 'missing-op', opId: op };
      const deal = row.dealId ? (dealsOf().filter(function (d) { return d && d.id === row.dealId; })[0] || null) : null;
      const ev = deal ? evidenceOf().filter(function (e) { return e && e.key === ('deal:' + deal.id); }) : [];
      return { ok: true, opId: op, stage: row.stage, stageLabel: row.stageLabel,
        bridged: !!row.bridged, bridgeReason: row.bridgeReason || '',
        deal: deal ? { id: deal.id, status: deal.status, dueAt: deal.dueAt, actId: deal.actId, fulfilment: deal.fulfilment } : null,
        evidence: ev.map(function (e) { return { id: e.id, text: e.text, at: e.at, scope: e.scope, source: e.source }; }),
        // 一笔没接上任务不是错误，但它必须**可见**（说明这笔操作还没有世界侧的后果）
        note: deal ? '' : '这笔操作还没有对应的世界侧约定任务（只有台账）' };
    },
    isDue: function (dealId, atMs) {
      const id = clean(dealId, 60);
      const d = dealsOf().filter(function (x) { return x && x.id === id; })[0] || null;
      if (!d) return { ok: false, reason: 'missing-deal' };
      const t = isFinite(finite(atMs)) ? Number(atMs) : clockNow('liaison');
      return { ok: true, dealId: id, status: d.status, due: t >= d.dueAt, dueAt: d.dueAt, now: t };
    },
    view: view, statView: statView,
    stat: function () { const bag = statBagOf(); return Object.assign({}, bag, { faults: Object.assign({}, bag.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/liaison.js', { kind: 'engine', ver: '2.118.0' });
})();
