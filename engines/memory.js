/**
 * WorldAxis engines/memory.js (v0.2)
 * 记忆引擎：L0单轮摘要 / L1近期巩固 / L2章节回顾 / L3长线沉淀 + facts更迭 + 伏笔生命周期
 * 缝合来源：世界背面记忆分层 + WNE事实版本管理
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const CAP = { l0: 20, l1: 30, l2: 40, l3: 60, facts: 100, foreshadows: 30 };
  const CONSOLIDATE_EVERY = 5;  // 每5轮L0触发一次L1巩固

  function getCtx() { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } }
  function recentText(n) {
    const ctx = getCtx(); const chat = (ctx && ctx.chat) || [];
    return chat.slice(Math.max(0, chat.length - (n || 4))).map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 900)).join('\n---\n');
  }

  const memory = WA.memory = {
    /** L0：单轮摘要（after链每轮执行，复用digest通道，无配置则跳过） */
    async digestRound() {
      const cfg = WA.apiRouter.getChannel('digest');
      if (!cfg.baseUrl || !cfg.model) return null;
      const sys = '你是记忆摘要器。把最近一段剧情压缩为一条≤80字的客观摘要（第三人称、含关键事实与状态变化）。只输出JSON：{"summary":"..."}';
      const r = await WA.apiRouter.call('digest', [
        { role: 'system', content: sys },
        { role: 'user', content: recentText(3) }
      ], { json: true, maxTokens: 300, temperature: 0.3 }).catch(() => null);
      if (!r || !r.summary) return null;
      WA.store.transact(draft => {
        draft.memory.l0.push({ t: Date.now(), s: String(r.summary).slice(0, 120) });
        draft.memory.l0 = draft.memory.l0.slice(-CAP.l0);
      });
      return r.summary;
    },

    /** L1：近期巩固（L0攒够CONSOLIDATE_EVERY条时触发，合成一条L1） */
    async consolidateL1() {
      const s = WA.store.get();
      const l0 = s.memory.l0 || [];
      if (l0.length < CONSOLIDATE_EVERY) return false;
      const cfg = WA.apiRouter.getChannel('digest');
      if (!cfg.baseUrl || !cfg.model) return false;
      const batch = l0.slice(-CONSOLIDATE_EVERY);
      const sys = '你是记忆巩固器。把多条单轮摘要合成一条阶段性回顾（≤150字，保留关键转折与人物状态）。同时提取≤3条长期事实候选与≤1条伏笔候选。只输出JSON：{"recap":"...","facts":[{"key":"...","value":"..."}],"foreshadow":{"content":"..."}或null}';
      const r = await WA.apiRouter.call('digest', [
        { role: 'system', content: sys },
        { role: 'user', content: batch.map((b, i) => (i + 1) + '. ' + b.s).join('\n') }
      ], { json: true, maxTokens: 600, temperature: 0.3 }).catch(() => null);
      if (!r || !r.recap) return false;
      WA.store.transact(draft => {
        draft.memory.l1.push({ t: Date.now(), s: String(r.recap).slice(0, 200) });
        draft.memory.l1 = draft.memory.l1.slice(-CAP.l1);
        (r.facts || []).slice(0, 3).forEach(f => { if (f && f.key) memory.upsertFact(draft, f.key, f.value, 'digest'); });
        if (r.foreshadow && r.foreshadow.content) {
          (draft.memory.foreshadows = draft.memory.foreshadows || []).push({
            id: 'fs' + Date.now() + Math.random().toString(36).slice(2, 5),
            content: String(r.foreshadow.content).slice(0, 150), status: 'waiting', links: [], at: Date.now()
          });
          draft.memory.foreshadows = draft.memory.foreshadows.slice(-CAP.foreshadows);
        }
        draft.memory.l0 = draft.memory.l0.slice(0, draft.memory.l0.length - CONSOLIDATE_EVERY); // 已巩固的移出L0
      });
      return true;
    },

    /** facts版本化更迭（被backstage与digest共用） */
    upsertFact(draft, key, value, source) {
      const facts = draft.memory.facts;
      const old = facts.find(f => f.key === key && f.active);
      if (old) {
        if (old.value === value) return false;
        old.active = false; old.reason = 'superseded@' + Date.now();
        facts.push({ key, value, version: (old.version || 1) + 1, active: true, reason: source || '', at: Date.now() });
      } else {
        facts.push({ key, value, version: 1, active: true, reason: source || '', at: Date.now() });
      }
      draft.memory.facts = facts.slice(-CAP.facts);
      return true;
    },

    /** 供注入的记忆块（before链） */
    buildMemoryBlock() {
      const s = WA.store.get();
      const parts = [];
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
    id: 'memory.digest', chain: 'after', order: 40, label: '记忆L0摘要+L1巩固',
    async run() {
      await WA.memory.digestRound();
      await WA.memory.consolidateL1();
    }
  });
})();