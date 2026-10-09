/** WorldAxis direction/choices.js (v2.66.0) — 行动选项生成（带剧情上下文+世界状态，缝合 choice）
 *  v2.66.0 新增 generateGraded(n)：选项梯度（两易 / 一中 / 一难）。
 *  缝合来源：4.4「选项梯度」。预设里那是一条写作要求；本模块把它钉成引擎侧配额：
 *  梯度配额由骰子洗位、由引擎核验，模型不许自己改配额——违反即整次拒收（tier-mismatch）。
 *  兼容口径：generate(n) 保持 v0.2 行为（字符串数组，面板 ui/panel.js 唯一消费点不动）。 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const TIERS = ['easy', 'easy', 'mid', 'hard'];
  const TIER_LABEL = { easy: '易', mid: '中', hard: '难' };
  const stat = { gens: 0, rejected: 0, faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.rejected++; }
  function getCtx() { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } }
  function context() {
    const ctx = getCtx();
    const chat = (ctx && ctx.chat) || [];
    const recent = chat.slice(-3).map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 600)).join('\n');
    const s = WA.store.get();
    const worldHint = [
      s.clock.label ? '时间:' + s.clock.label : '',
      Object.keys(s.people).length ? '在场人物:' + Object.values(s.people).slice(0, 5).map(p => p.name + '@' + (p.location || '?')).join('、') : '',
      s.currents.filter(c => c.visibility !== 'hidden').length ? '可感知暗流:' + s.currents.filter(c => c.visibility !== 'hidden').slice(0, 3).map(c => c.title).join('、') : ''
    ].filter(Boolean).join('\n');
    return { worldHint: worldHint, recent: recent };
  }
  /** 配额：k=4 → 两易一中一难；k<4 时按 难→中→易 收缩，配额本身不许被改。 */
  function quota(k) {
    const base = TIERS.slice();
    while (base.length > k) {
      const drop = base.lastIndexOf('hard') >= 0 ? base.lastIndexOf('hard') : (base.lastIndexOf('mid') >= 0 ? base.lastIndexOf('mid') : base.length - 1);
      base.splice(drop, 1);
    }
    return base;
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = WA.rand.int(0, i);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  async function generateGraded(n) {
    const k = Math.max(2, Math.min(4, n || 4));
    const q = quota(k);
    const need = {};
    q.forEach(t => { need[t] = (need[t] || 0) + 1; });
    const quotaText = Object.keys(need).map(t => TIER_LABEL[t] + '×' + need[t]).join('、');
    try {
      const c = context();
      const r = await WA.apiRouter.call('choices', [
        { role: 'system', content: '基于当前剧情与世界状态，为玩家生成' + k + '个可选行动，只输出JSON：{"choices":[{"text":"...","tier":"easy|mid|hard"}]}。要求：①选项是玩家下一步具体可做的事，简短(≤40字)、有区分度；②难度配额固定为' + quotaText + '（easy=顺手可做，mid=需付出成本或冒小险，hard=高风险高代价），配额不许增减；③不代写NPC反应，只描述玩家动作。' },
        { role: 'user', content: '【世界状态】\n' + (c.worldHint || '（无）') + '\n【近期剧情】\n' + (c.recent || '（无）') }
      ], { json: true, maxTokens: 900, temperature: 0.9 });
      const list = (r && r.choices) || [];
      if (!Array.isArray(list) || list.length !== k) { noteFault('count-mismatch'); return []; }
      const out = [];
      const got = {};
      for (let i = 0; i < list.length; i++) {
        const it = list[i] || {};
        const text = String(it.text || '').trim().slice(0, 40);
        const tier = it.tier;
        if (!text || TIERS.indexOf(tier) < 0) { noteFault('bad-item'); return []; }
        got[tier] = (got[tier] || 0) + 1;
        out.push({ text: text, tier: tier });
      }
      for (const t in need) { if ((got[t] || 0) !== need[t]) { noteFault('tier-mismatch'); return []; } }
      stat.gens++;
      // 洗位只动展示顺序，不动配额。
      return shuffle(out);
    } catch (e) { noteFault('api-error'); return []; }
  }
  WA.choices = {
    async generate(n) {
      try {
        const c = context();
        const r = await WA.apiRouter.call('choices', [
          { role: 'system', content: '基于当前剧情与世界状态，为玩家生成' + (n || 4) + '个可选行动，只输出JSON：{"choices":["..."]}。要求：①选项是玩家下一步具体可做的事，简短(≤40字)、有区分度、覆盖不同方向(对话/行动/观察/离开等)；②至少一个选项能推动可感知暗流；③不代写NPC反应，只描述玩家动作。' },
          { role: 'user', content: '【世界状态】\n' + (c.worldHint || '（无）') + '\n【近期剧情】\n' + (c.recent || '（无）') }
        ], { json: true, maxTokens: 700, temperature: 0.9 });
        return (r && r.choices) || [];
      } catch (e) { return []; }
    },
    generateGraded: generateGraded,
    TIER_LABEL: TIER_LABEL,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();