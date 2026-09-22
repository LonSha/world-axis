/**
 * WorldAxis render/inject.js (v0.2) — 分源可见性注入
 * 接入 记忆块/舆情块/章节块 + 脉搏显示
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const mainWin = WA.mainWin || window;
  const LS_KEY = 'worldaxis_inject_visibility_v1';

  const SOURCES = ['clock', 'background', 'people', 'currents', 'echoes', 'memory', 'opinion', 'pulse', 'ledger', 'digest'];

  const __REG = { key: LS_KEY, def: { clock: true, background: true, people: true, currents: true, echoes: false, memory: true, opinion: false, pulse: true, ledger: true, digest: true }, module: 'inject' };
  // v2.3.0: 读路径统一走 settingsBus（写路径早已迁移）——可见性配置损坏此前静默回落默认
  /**
   * v2.4.0: 可见性读入口（含子键缺口自愈 + 声明完整性检查）。
   *   本键的消费语义是「真值即注入」：旧存档缺某子键时该值为 undefined（假值）= 静默关闭。
   *   实测磁盘只写 {"clock":false} 时，其余 9 个源全部读到 undefined ⇒ 一次性全关，
   *   而面板开关显示为「未勾选」，用户会以为是自己关的。
   *   这里在 settingsBus 补子键（整键级回落）之上再做一层：按 SOURCES 逐项确保真值，
   *   并把「def 未声明但 SOURCES 声明了」的漏登项记入缺陷视图（守卫可静态断言其为空）。
   */
  const __visStat = { filled: 0, undeclared: [], lastAt: 0 };
  function loadVis() {
    const v = WA.settingsBus.read(__REG) || {};
    const def = __REG.def;
    let filled = 0;
    SOURCES.forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(def, k)) {
        // 声明缺口：源在 SOURCES 里却没有默认值 → 无法归一化，显式记账而非静默
        if (__visStat.undeclared.indexOf(k) < 0) __visStat.undeclared.push(k);
        return;
      }
      if (v[k] === undefined) { v[k] = def[k]; filled++; }
    });
    if (filled) { __visStat.filled += filled; __visStat.lastAt = clockWall(); }
    return v;
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v0.1.19: 撤销台账——记录每次 uninject 的时间、触发源、结果（最多 20 条环形）
  const __uninjectLedger = [];
  // v0.1.43: 撤销台账按聊天分域——切聊天后旧聊天的撤销记录不得参与新聊天的一致性判定
  function ledgerChatId() {
    try { return (WA.store && WA.store.chatId) ? WA.store.chatId() : null; } catch (e) { return null; }
  }
  function persistUninjectLedger() {
    try {
      const cid = ledgerChatId() || 'wa_default';
      const curEntries = __uninjectLedger.filter(function (e) { return !e.chat || e.chat === cid; });
      const mainWin = (typeof window !== 'undefined' ? window : global);
      mainWin.localStorage.setItem('worldaxis_uninject_ledger_' + cid, JSON.stringify(curEntries.slice(-20)));
    } catch (e) {}
  }
  function recordUninject(trigger, result) {
    try {
      __uninjectLedger.push({ at: clockNow('render.inject'), chat: ledgerChatId(), trigger: trigger || 'unknown', ok: !!result.ok, reason: result.reason || null, cleared: result.cleared || [] });
      if (__uninjectLedger.length > 20) __uninjectLedger.splice(0, __uninjectLedger.length - 20);
      persistUninjectLedger();
    } catch (e) {}
  }
  function loadUninjectLedger(chatId) {
    try {
      const cid = chatId || ledgerChatId() || 'wa_default';
      const mainWin = (typeof window !== 'undefined' ? window : global);
      // v2.11.0: 读失败此前被外层空 catch 吞掉、并**照样合并**（raw=null ⇒ 当前聊天账本为空）
      //   ⇒ 「撤销账本读不出来」表现为「这个聊天没撤销过注入」，重复注入风险不可见。
      let raw = null;
      try { raw = mainWin.localStorage.getItem('worldaxis_uninject_ledger_' + cid); }
      catch (eR) {
        try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('uninjectLedger', 'worldaxis_uninject_ledger_' + cid, eR); } catch (e2) {}
        return;   // 读不到就不合并（保留内存既有账本，避免把「读失败」写成「无账本」）
      }
      const otherEntries = __uninjectLedger.filter(function (e) { return e.chat && e.chat !== cid; });
      const curEntries = raw ? JSON.parse(raw) : [];
      const merged = otherEntries.concat(Array.isArray(curEntries) ? curEntries : []);
      merged.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      __uninjectLedger.length = 0;
      merged.slice(-20).forEach(function (x) { __uninjectLedger.push(x); });
    } catch (e) {}
  }
  function clearUninjectLedger(chatId) {
    const cid = chatId || ledgerChatId() || 'wa_default';
    const remain = __uninjectLedger.filter(function (e) { return e.chat && e.chat !== cid; });
    __uninjectLedger.length = 0;
    remain.forEach(function (x) { __uninjectLedger.push(x); });
    try {
      // v2.9.0: 走 store 的受控删除出口（此前裸调 removeItem）——删不掉时台账会在下次装载时
      //   复活，导致「已卸载的注入」被误判为仍在生效。
      if (WA.store && typeof WA.store.removeVerified === 'function') WA.store.removeVerified('worldaxis_uninject_ledger_' + cid);
    } catch (e) {}
  }
  /** 取当前聊天域的台账条目（无域标识的历史条目视为同域，向后兼容） */
  function ledgerForCurrentChat() {
    const cur = ledgerChatId();
    if (!cur) return __uninjectLedger.slice();
    return __uninjectLedger.filter(function (e) { return !e.chat || e.chat === cur; });
  }

  /**
   * v0.1.41: 撤销-槽位关联审计（只读）——对照撤销台账、lastInjection 槽位 keys 与
   * 宿主实际注册状态，检测「快照说在场但台账已撤销」「keys 残留未清」等不一致。
   */
  function uninjectAudit() {
    const issues = [];
    const li = (WA.store && WA.store.get) ? (WA.store.get().lastInjection || null) : null;
    const ledger = ledgerForCurrentChat();
    const foreignCount = __uninjectLedger.length - ledger.length;   // v0.1.43: 被域隔离的跨聊天条目数
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
      foreignEntries: foreignCount,
      lastUninject: lastUnj ? { at: lastUnj.at, chat: lastUnj.chat || null, trigger: lastUnj.trigger, ok: lastUnj.ok, cleared: (lastUnj.cleared || []).length } : null,
      issues: issues
    };
  }
  WA.render = {
    /** v0.1.41: 撤销-槽位关联审计只读视图（tool-diag 消费） */
    uninjectAudit: uninjectAudit,
    SOURCES,
    /** v2.4.0: 可见性配置健康度只读视图（诊断消费）——undeclared 非空即「源存在但无默认值声明」 */
    visibilityStat() { return { sources: SOURCES.length, declared: Object.keys(__REG.def).length, filled: __visStat.filled, undeclared: __visStat.undeclared.slice(), lastAt: __visStat.lastAt, key: LS_KEY }; },
    getVisibility() { return loadVis(); },
    setVisibility(k, on) { const v = loadVis(); v[k] = !!on; WA.settingsBus.save(__REG, v); },

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
      // v2.38.0: 回声分支此前**完全缺失**——`echoes` 在 SOURCES 与面板开关里都有，
      //   但 buildWorldSnapshot 从无对应分支 ⇒ 复选框点了零效果（开/关产物逐字节相同），
      //   写进 state.echoes 的「已结算结果的正文触面」从不进正文（实测：回声「盐帮首领伏诛」查无）。
      //   口径与 currents 一致：obvious 给结果，subtle 只给「余波未明」的迹象，不剧透未结算内幕。
      if (vis.echoes) {
        const es = (s.echoes || []).slice(-4);
        if (es.length) parts.push('【已结算回声】' + es.map(e => e.exposure === 'obvious'
          ? ((e.refCurrent || '?') + '→' + (e.result || ''))
          : ((e.refCurrent || '?') + '（余波未明）')).join('；'));
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
      // v2.47.0: 留住 applySlots 的完整结果（含 landed 成功名单）——快照有了名单才能对账
      //   「哪个槽位真没落地」，而不是按「前 N 个成功」猜。
      let slotResOut = null;
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
          slotResOut = slotRes;
          const applied = slotRes.applied;
          // v2.48.0（第三十三面）：**部分成功也是一次真实的落地**，必须逐项区分处理。
          //   此前这里是「全成功才标记接管，否则只记错误」的二分——于是 applied>0 且 <total 时：
          //     · routedKeys 与 lastSlots 都不设 ⇒ 已经**成功落地**的槽位内容仍被并进主块
          //       ⇒ 同一段约束在 prompt 里出现两次（独立槽位 + 主块），白烧 token、模型看到重复指令；
          //     · 快照 slots=null ⇒ 「计划了哪些 / 哪些真落地」的证据被整段抹掉；
          //     · uninject 依据 slots.keys 清理，为 null ⇒ 真落地的槽位**永不被清**，
          //       内容残留在宿主里持续注入后续每一轮（幽灵注入，实测可复现）；
          //     · audit 对 null 快照反而判「一致」并谎称「未启用路由」。
          //   修法：真落地的键位（landed）按实际情况登记，接管判定按**逐项落地**而不是整体成功。
          const landedKeys = Array.isArray(slotRes.landed) ? slotRes.landed.slice() : [];
          if (applied > 0) {
            slotCount = applied;
            // 只把**真落地**的键位算作「已接管」——失败的项回退主块（值保住），成功的项不重复进主块
            routedKeys = landedKeys.length ? landedKeys : slots.map(function (sl) { return sl.slot; });
            lastSlots = slots;
          }
          if (applied !== slots.length) {
            // v0.1.9: 部分失败时收集错误快照，供 tool-diag 排障
            // v2.48.0: 与 landed 一起落快照——「计划 N / 落地 M / 失败 N-M」三数必须都在场
            slotErrors = (slotRes.errors || []).slice();
            WA.log('warn', '槽位路由部分失败（' + applied + '/' + slots.length + '），失败的 规则注入回退主块，已落地的 ' + applied + ' 路不重复注入');
          }
        }
      } catch (e) { WA.log('warn', '槽位路由失败，约束注入并入主块', e); }
      // 未被槽位路由接管的项（含路由失败时回退的 routable 项）才并入主块
      // v2.47.0: **删掉「内容指纹」这条判定**。它本意是「双保险」，实际是一条误伤通道：
      //   槽位只收带 position 的项（planSlots 吃的是 routable），而指纹按**内容相等**判定——
      //   于是任何**不带 position** 的项，只要正文恰好与某个槽位文本的一行相同（例如两条
      //   一模一样的提醒，一条走槽位、一条并主块），就会被当成「已被接管」从主块里剔掉：
      //   注入静默少一条，而槽位快照与预算账单里都查不到它——「谁把这条吃了」无迹可查。
      //   真正的判定只有一条：该项声明的 position 对应的槽位**确实被接管了**。
      const mainItems = routedKeys.length
        ? finalItems.filter(function (i) {
            if (i.position && routedKeys.indexOf(WA.injectChannel.SLOT_PREFIX + ':' + WA.injectChannel.normPos(i.position)) >= 0) return false;
            return true;
          })
        : finalItems;
      const combined = mainItems.map(i => i.content).join('\n');
      // v2.47.0: 去向账——「这条注入最后去哪了」必须逐项可答。
      //   此前只有三张互不相通的账：预算账单（折叠/丢弃，只按 source 名）、槽位快照
      //   （只有 slot 与字数）、主块（一个拼好的大字符串）。三者之间没有一条能把
      //   「第 i 个候选项」与「它的落点」连起来的线，于是「正文里少了那条约束」只能靠猜。
      //   这里按**输入位置**逐项记账，去向五态：slot / main / folded / dropped / empty。
      const trace = [];
      const __foldById = {}, __dropById = {};
      if (planInfo && typeof planInfo.inputCount === 'number' && planInfo.inputCount === items.length) {
        (planInfo.folded || []).forEach(function (f) { if (typeof f.id === 'number') __foldById[f.id] = f; });
        (planInfo.dropped || []).forEach(function (f) { if (typeof f.id === 'number') __dropById[f.id] = f; });
      }
      items.forEach(function (it, idx) {
        const src = (it && it.source) || '未命名';
        if (!it || !it.content) { trace.push({ i: idx, source: src, to: 'empty' }); return; }
        if (__dropById[idx]) { trace.push({ i: idx, source: src, to: 'dropped', reason: __dropById[idx].reason || null, tokens: __dropById[idx].tokens || 0 }); return; }
        if (__foldById[idx]) { trace.push({ i: idx, source: src, to: 'folded', reason: __foldById[idx].reason || null, foldedFrom: __foldById[idx].from, foldedTo: __foldById[idx].to }); return; }
        // v2.47.0 自纠：降级路径（injectChannel 缺席 / setExt 失败回退）下 routedKeys 为空，
        //   但 trace 仍会逐项走一遍 —— 此处必须自己判通道在不在，不能硬引用
        //   （实测：测试删掉 WA.injectChannel 后 applyInjections 直接 TypeError）。
        const slotKey = (it.position && WA.injectChannel && WA.injectChannel.SLOT_PREFIX && WA.injectChannel.normPos)
          ? (WA.injectChannel.SLOT_PREFIX + ':' + WA.injectChannel.normPos(it.position)) : null;
        if (slotKey && routedKeys.indexOf(slotKey) >= 0) {
          trace.push({ i: idx, source: src, to: 'slot', slot: slotKey });
          return;
        }
        trace.push({ i: idx, source: src, to: 'main' });
      });
      const traceSummary = { main: 0, slot: 0, folded: 0, dropped: 0, empty: 0 };
      trace.forEach(function (t) { if (traceSummary[t.to] !== undefined) traceSummary[t.to]++; });
      try {
        // 即使为空也要写入空串，清掉上一轮残留注入（swipe/重答场景关键）
        c.setExtensionPrompt('WorldAxis', combined, 1, 0, false);
        if (WA.injectInspector && WA.injectInspector.markRegistered) WA.injectInspector.markRegistered(combined.length);
        try {
          // v0.1.3: 快照补 slots 字段——排查「约束注入丢了」时可区分路由失败与槽位被覆盖
          const slotSnap = (WA.injectSlotAudit && lastSlots)
            ? WA.injectSlotAudit.snapshotSlots(lastSlots, slotResOut || slotCount)
            : null;
          WA.store.transact(d => { d.lastInjection = { at: clockNow('render.inject'), injected: (combined.length > 0 || slotCount > 0), len: combined.length, sources: mainItems.map(i => i.source), mainCount: mainItems.length, budget: planInfo ? { used: planInfo.used, cap: planInfo.budget, source: planInfo.budgetSource, contextSize: planInfo.contextSize || null, remain: planInfo.remain, inputTokens: planInfo.inputTokens, saved: planInfo.saved, overBudget: !!planInfo.overBudget, keptCount: planInfo.kept.length, folded: planInfo.folded.map(f => ({ source: f.source, reason: f.reason, from: f.from, to: f.to })), dropped: planInfo.dropped.map(x => ({ source: x.source, reason: x.reason, tokens: x.tokens })) } : null, slots: slotSnap, slotErrors: (slotErrors && slotErrors.length) ? slotErrors : null, trace: trace, traceSummary: traceSummary }; });
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
        // v2.48.0: 清理依据改为「**真落地**的键位」优先。只清计划里的键位会在两种情况下出错：
        //   · 部分失败轮：快照此前根本不存（slots=null）⇒ 真落地的槽位被漏清，残值持续注入；
        //   · 旧快照（无 landed 字段）：退回 keys（宁多清不可漏清——清一个未落地的键位是空操作）。
        const landedKeys = (li.slots && Array.isArray(li.slots.landed)) ? li.slots.landed.slice() : null;
        const plannedKeys = (li.slots && Array.isArray(li.slots.keys)) ? li.slots.keys.slice() : [];
        const slotKeys = [];
        (landedKeys || plannedKeys).forEach(function (k) { if (slotKeys.indexOf(k) < 0) slotKeys.push(k); });
        slotKeys.forEach(function (k) { try { c.setExtensionPrompt(k, '', 1, 0, false); cleared.push(k); } catch (e) {} });
        try { c.setExtensionPrompt('WorldAxis', '', 1, 0, false); cleared.push('WorldAxis'); } catch (e) {}
        if (WA.injectInspector && WA.injectInspector.markRegistered) WA.injectInspector.markRegistered(0);
        // v0.1.29: 撤销状态回写快照——槽位已清空但证据保留（幂等重放依赖 keys），
        // 诊断读到这里不应再把上一轮注入当作「仍在生效」的活证据
        try {
          if (WA.store && cleared.length) WA.store.transact(function (d) {
            if (d.lastInjection) { d.lastInjection.injected = false; d.lastInjection.clearedAt = clockNow('render.inject'); d.lastInjection.clearedBy = trigger || 'manual'; }
          });
        } catch (e) {}
        if (WA.log) WA.log('info', 'uninject 清空 ' + cleared.length + ' 个槽位（trigger=' + (trigger || 'manual') + '）');
        const r = { ok: true, cleared: cleared };
        recordUninject(trigger, r);
        return r;
      } catch (e) { if (WA.log) WA.log('warn', 'uninject 异常', e); const r = { ok: false, reason: 'error', error: String(e && (e.message || e)) }; recordUninject(trigger, r); return r; }
    },
    /** v0.1.19: 撤销台账只读视图（tool-diag 消费） */
    injectionLedger(opts) {
      const scoped = (opts && opts.all) ? __uninjectLedger.slice() : ledgerForCurrentChat();
      return { count: scoped.length, entries: scoped, total: __uninjectLedger.length, foreign: __uninjectLedger.length - scoped.length };
    },
    loadUninjectLedger: loadUninjectLedger,
    clearUninjectLedger: clearUninjectLedger,
  };
})();
