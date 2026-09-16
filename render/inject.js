/**
 * WorldAxis render/inject.js (v0.2) — 分源可见性注入
 * 接入 记忆块/舆情块/章节块 + 脉搏显示
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;
  const LS_KEY = 'worldaxis_inject_visibility_v1';

  const SOURCES = ['clock', 'background', 'people', 'currents', 'echoes', 'memory', 'opinion', 'pulse', 'ledger', 'digest'];

  function loadVis() {
    const def = { clock: true, background: true, people: true, currents: true, echoes: false, memory: true, opinion: false, pulse: true, ledger: true, digest: true };
    try { return Object.assign(def, JSON.parse(mainWin.localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return def; }
  }
  // v0.1.19: 撤销台账——记录每次 uninject 的时间、触发源、结果（最多 20 条环形）
  const __uninjectLedger = [];
  function recordUninject(trigger, result) {
    try {
      __uninjectLedger.push({ at: Date.now(), trigger: trigger || 'unknown', ok: !!result.ok, reason: result.reason || null, cleared: result.cleared || [] });
      if (__uninjectLedger.length > 20) __uninjectLedger.splice(0, __uninjectLedger.length - 20);
    } catch (e) {}
  }

  /**
   * v0.1.41: 撤销-槽位关联审计（只读）——对照撤销台账、lastInjection 槽位 keys 与
   * 宿主实际注册状态，检测「快照说在场但台账已撤销」「keys 残留未清」等不一致。
   */
  function uninjectAudit() {
    const issues = [];
    const li = (WA.store && WA.store.get) ? (WA.store.get().lastInjection || null) : null;
    const ledger = __uninjectLedger.slice();
    const lastUnj = ledger.length ? ledger[ledger.length - 1] : null;
    // 快照在场声明 vs 撤销台账末条：台账比快照新且成功 → 快照过期
    let staleSnapshot = false;
    if (li && li.injected === true && lastUnj && lastUnj.ok && lastUnj.at > (li.at || 0)) staleSnapshot = true;
    if (staleSnapshot) issues.push({ code: 'stale-snapshot', detail: '快照声明 injected=true 但台账在其后已有成功撤销（trigger=' + (lastUnj.trigger || '?') + '）' });
    // clearedBy 与台账末条 trigger 不一致 → 回写异常
    if (li && li.injected === false && li.clearedBy && lastUnj && lastUnj.ok && lastUnj.trigger !== li.clearedBy) {
      issues.push({ code: 'cleared-by-mismatch', detail: '快照 clearedBy=' + li.clearedBy + ' 与台账末条 trigger=' + lastUnj.trigger + ' 不一致' });
    }
    // 注入声明在场但从未有撤销记录且台账非空且末条晚于快照——已由 stale-snapshot 覆盖；
    // 这里查反向：快照已撤销但撤销发生在快照写入之前（回写时序异常）
    if (li && li.injected === false && li.clearedAt && (li.at || 0) > li.clearedAt) {
      issues.push({ code: 'writeback-before-land', detail: 'clearedAt 早于快照 at：撤销回写时序异常' });
    }
    return {
      snapshotInjected: li ? li.injected : null,
      snapshotKeys: (li && li.slots && Array.isArray(li.slots.keys)) ? li.slots.keys.slice() : [],
      ledgerCount: ledger.length,
      lastUninject: lastUnj ? { at: lastUnj.at, trigger: lastUnj.trigger, ok: lastUnj.ok, cleared: (lastUnj.cleared || []).length } : null,
      issues: issues
    };
  }
  WA.render = {
    /** v0.1.41: 撤销-槽位关联审计只读视图（tool-diag 消费） */
    uninjectAudit: uninjectAudit,
    SOURCES,
    getVisibility() { return loadVis(); },
    setVisibility(k, on) { const v = loadVis(); v[k] = !!on; mainWin.localStorage.setItem(LS_KEY, JSON.stringify(v)); },

    buildWorldSnapshot() {
      const vis = loadVis(); const s = WA.store.get(); const parts = [];
      if (vis.clock && s.clock.label) parts.push('【世界时间】' + s.clock.label);
      if (vis.pulse && s.worldPulse) parts.push('【世界脉搏】压力' + s.worldPulse.pressure + '/3（' + s.worldPulse.trend + '）' + (s.worldPulse.note || ''));
      if (vis.background && s.background.text) parts.push('【世界背景】' + s.background.text.slice(0, 500));
      if (vis.people) {
        const ps = Object.values(s.people).filter(p => p.location || p.action).slice(0, 8);
        if (ps.length) parts.push('【人物此刻】' + ps.map(p => p.name + '：' + (p.location || '?') + '，' + (p.action || '')).join('；'));
      }
      if (vis.currents) {
        const cs = s.currents.filter(c => c.visibility !== 'hidden').slice(0, 6);
        if (cs.length) parts.push('【可感知暗流】' + cs.map(c => c.visibility === 'trace' ? (c.public_trace || c.title + '（异常迹象）') : c.title).join('；'));
      }
      // v0.1.29: 呈现铁律只在真有状态内容时追加——此前无条件 push 导致
      // parts.length 恒真、可见性全关仍注入 221 字空壳（开关对世界状态失效）
      if (parts.length) {
        parts.push('〔呈现铁律〕以上状态只供你构建舞台。输出时必须全部经过 NPC 视角过滤：信息只可由 NPC 口述/信件/公告/路人议论呈现，绝不使用系统旁白；禁止输出属性面板、好感度数值、经济指标或声望分数。')
        return '<world_axis_state>\n' + parts.join('\n') + '\n</world_axis_state>';
      }
      return '';
    },

    applyInjections(ctx) {
      const c = (() => { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } })();
      if (!c || !c.setExtensionPrompt) { if (ctx.injections.length) WA.log('warn', '宿主无setExtensionPrompt，注入丢弃'); return; }
      const vis = loadVis();
      const items = [];
      const snap = this.buildWorldSnapshot();
      if (snap) items.push({ source: '世界状态', content: snap });
      // 记忆块（visibility控制）
      if (vis.memory && WA.memory) { const mb = WA.memory.buildMemoryBlock(); if (mb) items.push({ source: '记忆', content: mb }); }
      // v0.8.2: 人物主观记忆块（认知与信息不对称）
      // v0.9.8: 采样器接管——指数衰减采样 + 上下文相关召回，替代 slice(-8) 无差别截取
      if (vis.memory && WA.memorySampler) {
        const recent = WA.pmem && WA.pmem.recentText ? WA.pmem.recentText(4) : '';
        const pb = WA.memorySampler.buildBlock({ recentText: recent });
        if (pb) items.push({ source: '主观记忆', content: pb });
      } else if (vis.memory && WA.pmem) { const pb = WA.pmem.buildBlock(); if (pb) items.push({ source: '主观记忆', content: pb }); }
      // v0.8.3: 双层叙事摘要块（优先总述回退纪要）
      if (vis.memory && WA.summarizer) { const sb = WA.summarizer.buildBlock(); if (sb) items.push({ source: '叙事摘要', content: sb }); }
      // 舆情块
      if (vis.opinion && WA.opinion) { const ob = WA.opinion.buildOpinionBlock(); if (ob) items.push({ source: '舆情', content: ob }); }
      // v0.8: 重大事件账本块
      // v0.1.29: 账本/世界推演此前不受可见性控制（不在 SOURCES 内），
      // 关掉所有注入源仍会注入账本与推演块——补齐开关覆盖，默认开保持旧行为
      if (vis.ledger && WA.ledger) { const lb = WA.ledger.buildLedgerText(); if (lb) items.push({ source: '账本', content: '[重大事件账本]\n' + lb }); }
      // v0.7: world_digest块
      if (vis.digest && WA.digest) { const db = WA.digest.buildBlock(); if (db) items.push({ source: '世界推演', content: db }); }
      // v0.7: 近端事件一次性消费
      const st = WA.store.get();
      if (st && st.nextTurnInjection && st.nextTurnInjection.nearEvent) {
        const ne = st.nextTurnInjection.nearEvent;
        items.push({ source: '近端事件', content: `[突发事件] ${ne.title}${ne.urgent ? '（紧急）' : ''}：${ne.desc}` });
        // 一次性消费：清除 nearEvent；若三列也为空则整体归零（v0.1.4：避免留下空壳对象）
        WA.store.transact(d => {
          if (!d.nextTurnInjection) return;
          delete d.nextTurnInjection.nearEvent;
          const nti = d.nextTurnInjection;
          const empty = !nti.required && !nti.conditional && !nti.suppress && !nti.nearEvent;
          if (empty) d.nextTurnInjection = null;
        });
      }
      // v0.1.1: 剧情约束类注入由槽位路由独立落地，不并入主块（避免重复注入）
      const ctxInj = (ctx.injections || []);
      // 无 position 的项保持旧行为（并入主块）；带 position 的项默认也并入主块，
      // 仅当槽位路由成功接管后才从主块移除——保证任何降级路径都不丢注入
      ctxInj.forEach(function (i) { if (i && i.content) items.push(i); });
      // v0.9.3: 注入预算裁决（pinned 保底 / optional 先折叠后丢弃；0=不限）
      let planInfo = null;
      let finalItems = items;
      try {
        const budget = (WA.backstage && WA.backstage.getSettings) ? WA.backstage.getSettings().injectBudget : null;
        if (WA.injectBudget && budget !== 0 && items.length) {
          planInfo = WA.injectBudget.plan(items, { budget: (budget == null ? -1 : budget) });
          finalItems = WA.injectBudget.apply(items, planInfo);
          if (planInfo.folded.length || planInfo.dropped.length) {
            WA.log('info', '注入预算裁决：' + WA.injectBudget.summaryText(planInfo)
              + '｜折叠 ' + planInfo.folded.map(f => f.source).join('/')
              + (planInfo.dropped.length ? '｜丢弃 ' + planInfo.dropped.map(d => d.source).join('/') : ''));
          }
        }
      } catch (e) { WA.log('warn', '预算裁决失败，回退全量注入', e); planInfo = null; finalItems = items; }
      // v0.1.1: 槽位路由——显式带 position 的剧情约束类走独立槽位，
      // 不与主世界状态块互相覆盖；预算裁决只作用于主槽位
      // 无 position 的注入项保持旧行为（并入主块），保证向后兼容
      let slotCount = 0;
      let routedKeys = [];
      let lastSlots = null;
      let slotErrors = [];   // v0.1.9: 槽位路由错误快照
      try {
        const routable = ctxInj.filter(function (i) { return !!(i && i.position); });
        // v0.1.42: 路由覆盖审计——同 position 多源 depth 不一致时显式告警（不改变路由行为）
        if (routable.length > 1 && WA.injectSlotAudit && WA.injectSlotAudit.routeAudit) {
          try {
            const ra = WA.injectSlotAudit.routeAudit(routable);
            (ra.conflicts || []).forEach(function (cf) {
              WA.log('warn', '槽位深度覆盖[' + cf.position + ']: ' + cf.detail + '（源: ' + cf.sources.join('/') + '）');
            });
          } catch (e) { /* 审计失败不影响注入落地 */ }
        }
        if (WA.injectChannel && routable.length) {
          const slots = WA.injectChannel.planSlots(routable);
          const slotRes = WA.injectChannel.applySlots(function (slotName, text, pos, depth, scan) {
            c.setExtensionPrompt(slotName, text, pos, depth, scan);
          }, slots);
          const applied = slotRes.applied;
          // 原子语义：只有 applySlots 全部成功后才标记接管，避免「注入了但没标记」的丢失
          if (applied === slots.length) {
            slotCount = applied;
            routedKeys = slots.map(function (sl) { return sl.slot; });
            lastSlots = slots;
          } else {
            // v0.1.9: 部分失败时收集错误快照，供 tool-diag 排障
            slotErrors = (slotRes.errors || []).slice();
            WA.log('warn', '槽位路由部分失败（' + applied + '/' + slots.length + '），约束注入并入主块');
          }
        }
      } catch (e) { WA.log('warn', '槽位路由失败，约束注入并入主块', e); }
      // 未被槽位路由接管的项（含路由失败时回退的 routable 项）才并入主块
      // v0.1.2: 预算裁决已透传原始字段，优先用 position 过滤；内容指纹作双保险
      const routedSet = routedKeys.length ? WA.injectChannel.planSlots(ctxInj) : [];
      const routedContents = routedSet.length
        ? routedSet.reduce(function (acc, sl) { return acc.concat(sl.text.split('\n')); }, [])
        : [];
      const mainItems = routedKeys.length
        ? finalItems.filter(function (i) {
            if (i.position && routedKeys.indexOf(WA.injectChannel.SLOT_PREFIX + ':' + WA.injectChannel.normPos(i.position)) >= 0) return false;
            return routedContents.indexOf(i.content) < 0;
          })
        : finalItems;
      const combined = mainItems.map(i => i.content).join('\n');
      try {
        // 即使为空也要写入空串，清掉上一轮残留注入（swipe/重答场景关键）
        c.setExtensionPrompt('WorldAxis', combined, 1, 0, false);
        if (WA.injectInspector && WA.injectInspector.markRegistered) WA.injectInspector.markRegistered(combined.length);
        try {
          // v0.1.3: 快照补 slots 字段——排查「约束注入丢了」时可区分路由失败与槽位被覆盖
          const slotSnap = (WA.injectSlotAudit && lastSlots)
            ? WA.injectSlotAudit.snapshotSlots(lastSlots, slotCount)
            : null;
          WA.store.transact(d => { d.lastInjection = { at: Date.now(), injected: (combined.length > 0 || slotCount > 0), len: combined.length, sources: mainItems.map(i => i.source), budget: planInfo ? { used: planInfo.used, cap: planInfo.budget, source: planInfo.budgetSource, contextSize: planInfo.contextSize || null, remain: planInfo.remain, inputTokens: planInfo.inputTokens, saved: planInfo.saved, overBudget: !!planInfo.overBudget, keptCount: planInfo.kept.length, folded: planInfo.folded.map(f => ({ source: f.source, reason: f.reason, from: f.from, to: f.to })), dropped: planInfo.dropped.map(x => ({ source: x.source, reason: x.reason, tokens: x.tokens })) } : null, slots: slotSnap, slotErrors: (slotErrors && slotErrors.length) ? slotErrors : null }; });
        } catch (e) { /* 快照失败不影响注入 */ }
        if (combined) WA.log('info', '注入落地：' + mainItems.map(i => i.source).join(' + ') + '（' + combined.length + '字）' + (slotCount ? '｜独立槽位 ' + slotCount + ' 路' : ''));
      } catch (e) { WA.log('error', 'setExtensionPrompt失败', e); }
    },
    /**
     * v0.1.15: 真撤销。按上一轮落地记录清空全部已注入槽位。
     * 旧的写空串只清主槽位，独立槽位路由落地的那部分会残留到下一轮；
     * 这里从 store.lastInjection 快照取实际用过的全部 slot key 逐一清空。
     * 幂等：无快照或无 setExtensionPrompt 时安全跳过，重复调用不报错。
     * v0.1.19: trigger 参数标注撤销来源（interceptor/chat-changed/manual），并写入台账。
     */
    uninject(trigger) {
      try {
        const c = (WA.mainWin && WA.mainWin.SillyTavern && WA.mainWin.SillyTavern.getContext) ? WA.mainWin.SillyTavern.getContext() : null;
        if (!c || !c.setExtensionPrompt) { const r = { ok: false, reason: 'no-host' }; recordUninject(trigger, r); return r; }
        const li = (WA.store && WA.store.get) ? (WA.store.get().lastInjection || null) : null;
        if (!li) { const r = { ok: false, reason: 'no-snapshot' }; recordUninject(trigger, r); return r; }
        const cleared = [];
        const slotKeys = (li.slots && Array.isArray(li.slots.keys)) ? li.slots.keys.slice() : [];
        slotKeys.forEach(function (k) { try { c.setExtensionPrompt(k, '', 1, 0, false); cleared.push(k); } catch (e) {} });
        try { c.setExtensionPrompt('WorldAxis', '', 1, 0, false); cleared.push('WorldAxis'); } catch (e) {}
        if (WA.injectInspector && WA.injectInspector.markRegistered) WA.injectInspector.markRegistered(0);
        // v0.1.29: 撤销状态回写快照——槽位已清空但证据保留（幂等重放依赖 keys），
        // 诊断读到这里不应再把上一轮注入当作「仍在生效」的活证据
        try {
          if (WA.store && cleared.length) WA.store.transact(function (d) {
            if (d.lastInjection) { d.lastInjection.injected = false; d.lastInjection.clearedAt = Date.now(); d.lastInjection.clearedBy = trigger || 'manual'; }
          });
        } catch (e) {}
        if (WA.log) WA.log('info', 'uninject 清空 ' + cleared.length + ' 个槽位（trigger=' + (trigger || 'manual') + '）');
        const r = { ok: true, cleared: cleared };
        recordUninject(trigger, r);
        return r;
      } catch (e) { if (WA.log) WA.log('warn', 'uninject 异常', e); const r = { ok: false, reason: 'error', error: String(e && (e.message || e)) }; recordUninject(trigger, r); return r; }
    },
    /** v0.1.19: 撤销台账只读视图（tool-diag 消费） */
    injectionLedger() { return { count: __uninjectLedger.length, entries: __uninjectLedger.slice() }; }
  };
})();
