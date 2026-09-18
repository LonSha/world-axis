/**
 * WorldAxis engines/memory.js (v0.3)
 * 记忆引擎：L0单轮摘要 / L1近期巩固 / L2章节回顾 / L3长线沉淀 + facts更迭 + 伏笔生命周期
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const CAP = { l0: 20, l1: 30, l2: 40, l3: 60, facts: 100, foreshadows: 30 };
  const L1_EVERY = 5;   // L0攒5条→L1
  const L2_EVERY = 4;   // L1攒4条→L2
  const L3_EVERY = 3;   // L2攒3条→L3

  // v1.2.0: 伏笔终态回收（单一实现）——已回收/已放弃语义上已终止，回收先于 cap 截断，
  // 防活跃伏笔被终态伏笔挤出（与 backstage 容量控制段同口径）。
  const FS_TERMINAL = ['recycled', 'dropped'];
  function pruneForeshadows(arr) {
    const a = Array.isArray(arr) ? arr : [];
    for (let i = a.length - 1; i >= 0; i--) {
      const st = a[i] && a[i].status;
      if (FS_TERMINAL.indexOf(st) >= 0) a.splice(i, 1);
    }
    // v2.13.0: cap 截断改走挤出侧单一出口（此前静默丢弃活跃伏笔，无任何留痕）
    if (WA.evict) WA.evict.array(a, 'memory.foreshadows');
    else if (a.length > CAP.foreshadows) a.splice(0, a.length - CAP.foreshadows);
    return a;
  }

  function getCtx() { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } }
  function recentText(n) {
    const ctx = getCtx(); const chat = (ctx && ctx.chat) || [];
    return chat.slice(Math.max(0, chat.length - (n || 4))).map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 900)).join('\n---\n');
  }
  // v0.8.0: 捕获最近 n 层楼层的来源引用（供记忆层入账写 refs，修复「审计空转」）
  function recentRefs(n) {
    try {
      const ctx = getCtx(); const chat = (ctx && ctx.chat) || [];
      if (!chat.length) return [];
      const start = Math.max(0, chat.length - (n || 3));
      return (WA.timeline && WA.timeline.captureRange) ? WA.timeline.captureRange(start, chat.length - 1) : [];
    } catch (e) { return []; }
  }
  // v0.8.0: 从若干记忆条目继承并集来源引用（L1/L2/L3 合并时保留溯源）
  function inheritRefs(entries) {
    if (!WA.timeline || !WA.timeline.unionRefs) return [];
    return WA.timeline.unionRefs((entries || []).map(e => (e && Array.isArray(e.refs)) ? e.refs : []));
  }

  // v0.1.40: 分层巩固计量——每层耗时与最近结果（tool-diag 消费）
  const __memStat = { rounds: 0, lastMs: 0, totalMs: 0, layers: {}, lastAt: 0 };
const memory = WA.memory = {
    /** v1.2.0: 终态伏笔回收（单一实现，backstage 容量控制段复用，防两处口径漂移） */
    pruneForeshadows: pruneForeshadows,
    /** v0.1.40: 分层巩固计量只读视图（tool-diag 消费） */
    stats() { return { rounds: __memStat.rounds, lastMs: __memStat.lastMs, avgMs: Math.round(__memStat.totalMs / Math.max(1, __memStat.rounds)), lastAt: __memStat.lastAt, layers: JSON.parse(JSON.stringify(__memStat.layers)) }; },
    async digestRound() {
      const cfg = WA.apiRouter.getChannel('digest');
      if (!cfg.baseUrl || !cfg.model) return null;
      const r = await WA.apiRouter.call('digest', [
        { role: 'system', content: '你是记忆摘要器。把最近一段剧情压缩为一条≤80字的客观摘要（第三人称、含关键事实与状态变化）。只输出JSON：{"summary":"..."}' },
        { role: 'user', content: recentText(3) }
      ], { json: true, maxTokens: 300, temperature: 0.3 }).catch(() => null);
      if (!r || !r.summary) return null;
      WA.store.transact(draft => {
        draft.memory.l0.push({ t: clockNow('memory'), s: String(r.summary).slice(0, 120), refs: recentRefs(3) });
        if (WA.evict) WA.evict.array(draft.memory.l0, 'memory.l0'); else draft.memory.l0 = draft.memory.l0.slice(-CAP.l0);
      });
      return r.summary;
    },

    async consolidateL1() {
      const s = WA.store.get();
      const l0 = s.memory.l0 || [];
      if (l0.length < L1_EVERY) return false;
      const cfg = WA.apiRouter.getChannel('digest');
      if (!cfg.baseUrl || !cfg.model) return false;
      const batch = l0.slice(-L1_EVERY);
      const r = await WA.apiRouter.call('digest', [
        { role: 'system', content: '你是记忆巩固器。把多条单轮摘要合成一条阶段性回顾（≤150字，保留关键转折与人物状态）。同时提取≤3条长期事实候选与≤1条伏笔候选。只输出JSON：{"recap":"...","facts":[{"key":"...","value":"..."}],"foreshadow":{"content":"..."}或null}' },
        { role: 'user', content: batch.map((b, i) => (i + 1) + '. ' + b.s).join('\n') }
      ], { json: true, maxTokens: 600, temperature: 0.3 }).catch(() => null);
      if (!r || !r.recap) return false;
      WA.store.transact(draft => {
        draft.memory.l1.push({ t: clockNow('memory'), s: String(r.recap).slice(0, 200), refs: inheritRefs(batch) });
        if (WA.evict) WA.evict.array(draft.memory.l1, 'memory.l1'); else draft.memory.l1 = draft.memory.l1.slice(-CAP.l1);
        (r.facts || []).slice(0, 3).forEach(f => { if (f && f.key) memory.upsertFact(draft, f.key, f.value, 'digest'); });
        if (r.foreshadow && r.foreshadow.content) {
          (draft.memory.foreshadows = draft.memory.foreshadows || []).push({ id: WA.rand.id('fs', 3, 'id'), content: String(r.foreshadow.content).slice(0, 150), status: 'waiting', links: inheritRefs(batch), at: clockNow('memory') });
          // v1.2.0: 终态回收先于截断（单一实现 pruneForeshadows，与 backstage 容量控制段同口径）
          pruneForeshadows(draft.memory.foreshadows);
        }
        draft.memory.l0 = draft.memory.l0.slice(0, draft.memory.l0.length - L1_EVERY);
      });
      return true;
    },

    /** L2：章节回顾（L1攒L2_EVERY条触发，合并为长线叙事段落） */
    async consolidateL2() {
      const s = WA.store.get();
      const l1 = s.memory.l1 || [];
      if (l1.length < L2_EVERY) return false;
      const cfg = WA.apiRouter.getChannel('digest');
      if (!cfg.baseUrl || !cfg.model) return false;
      const batch = l1.slice(-L2_EVERY);
      const r = await WA.apiRouter.call('digest', [
        { role: 'system', content: '你是章节回顾器。把多条阶段回顾合并为一条章节级叙事（≤250字，呈现主线进展与重大转折）。同时更新≤3条长期事实。只输出JSON：{"chapter":"...","facts":[{"key":"...","value":"..."}]}' },
        { role: 'user', content: batch.map((b, i) => (i + 1) + '. ' + b.s).join('\n') }
      ], { json: true, maxTokens: 800, temperature: 0.3 }).catch(() => null);
      if (!r || !r.chapter) return false;
      WA.store.transact(draft => {
        draft.memory.l2.push({ t: clockNow('memory'), s: String(r.chapter).slice(0, 350), refs: inheritRefs(batch) });
        if (WA.evict) WA.evict.array(draft.memory.l2, 'memory.l2'); else draft.memory.l2 = draft.memory.l2.slice(-CAP.l2);
        (r.facts || []).slice(0, 3).forEach(f => { if (f && f.key) memory.upsertFact(draft, f.key, f.value, 'l2'); });
        draft.memory.l1 = draft.memory.l1.slice(0, draft.memory.l1.length - L2_EVERY);
      });
      WA.log('info', 'L2章节回顾入账');
      return true;
    },

    /** L3：长线沉淀（L2攒L3_EVERY条触发，沉淀为世界底层基调/长期主题） */
    async consolidateL3() {
      const s = WA.store.get();
      const l2 = s.memory.l2 || [];
      if (l2.length < L3_EVERY) return false;
      const cfg = WA.apiRouter.getChannel('digest');
      if (!cfg.baseUrl || !cfg.model) return false;
      const batch = l2.slice(-L3_EVERY);
      const r = await WA.apiRouter.call('digest', [
        { role: 'system', content: '你是长线沉淀器。把多条章节回顾提炼为贯穿性长线主题/世界底层变化（≤200字，如势力格局演变、角色关系网定型、时代基调）。只输出JSON：{"theme":"...","worldShift":"..."}' },
        { role: 'user', content: batch.map((b, i) => (i + 1) + '. ' + b.s).join('\n') }
      ], { json: true, maxTokens: 600, temperature: 0.3 }).catch(() => null);
      if (!r || !r.theme) return false;
      WA.store.transact(draft => {
        draft.memory.l3.push({ t: clockNow('memory'), theme: String(r.theme).slice(0, 250), worldShift: String(r.worldShift || '').slice(0, 200), refs: inheritRefs(batch) });
        if (WA.evict) WA.evict.array(draft.memory.l3, 'memory.l3'); else draft.memory.l3 = draft.memory.l3.slice(-CAP.l3);
        draft.memory.l2 = draft.memory.l2.slice(0, draft.memory.l2.length - L3_EVERY);
      });
      WA.log('info', 'L3长线沉淀入账');
      return true;
    },

    upsertFact(draft, key, value, source) {
      const facts = draft.memory.facts;
      const old = facts.find(f => f.key === key && f.active);
      if (old) {
        if (old.value === value) return false;
        old.active = false; old.reason = 'superseded@' + clockNow('memory');
        facts.push({ key, value, version: (old.version || 1) + 1, active: true, reason: source || '', at: clockNow('memory') });
      } else {
        facts.push({ key, value, version: 1, active: true, reason: source || '', at: clockNow('memory') });
      }
      if (WA.evict) { WA.evict.array(facts, 'memory.facts'); draft.memory.facts = facts; }
      else draft.memory.facts = facts.slice(-CAP.facts);
      return true;
    },

    /** 供注入的记忆块（L3主题+L1回顾+facts+发展中伏笔） */
    buildMemoryBlock() {
      const s = WA.store.get();
      const parts = [];
      const l3 = (s.memory.l3 || []).slice(-1)[0];
      if (l3) parts.push('【长线主题】' + l3.theme + (l3.worldShift ? ' / ' + l3.worldShift : ''));
      const fs = (s.memory.facts || []).filter(f => f.active).slice(-10);
      if (fs.length) parts.push('【长期事实】' + fs.map(f => f.key + '=' + f.value).join('；'));
      const l1 = (s.memory.l1 || []).slice(-3);
      if (l1.length) parts.push('【阶段回顾】' + l1.map(x => x.s).join(' / '));
      const fsw = (s.memory.foreshadows || []).filter(f => f.status === 'developing');
      if (fsw.length) parts.push('【发展中的伏笔】' + fsw.map(f => f.content).join('；'));
      if (!parts.length) return '';
      return '<world_axis_memory>\n' + parts.join('\n') + '\n</world_axis_memory>';
    }
  };

  WA.workflow.register({
    id: 'memory.digest', chain: 'after', order: 40, label: '记忆L0→L1→L2→L3分层巩固',
    async run() {
      // v0.1.40: 分层计时——每层耗时入 __memStat，供诊断观察巩固链路开销
      const t0 = clockWall();
      let l1r = false, l2r = false, l3r = false;
      try { await WA.memory.digestRound(); } catch (e) { WA.log('warn', 'digestRound 异常（巩固链继续）', e); }
      try { l1r = await WA.memory.consolidateL1() !== false; } catch (e) { WA.log('warn', 'consolidateL1 异常（巩固链继续）', e); }
      const t1 = clockWall(); __memStat.layers.l1 = { ms: t1 - t0, ran: l1r };
      try { l2r = await WA.memory.consolidateL2() !== false; } catch (e) { WA.log('warn', 'consolidateL2 异常（巩固链继续）', e); }
      const t2 = clockWall(); __memStat.layers.l2 = { ms: t2 - t1, ran: l2r };
      try { l3r = await WA.memory.consolidateL3() !== false; } catch (e) { WA.log('warn', 'consolidateL3 异常（巩固链继续）', e); }
      __memStat.layers.l3 = { ms: clockWall() - t2, ran: l3r };
      __memStat.rounds++; __memStat.lastMs = clockWall() - t0; __memStat.totalMs += __memStat.lastMs; __memStat.lastAt = clockWall();
    }
  });
})();