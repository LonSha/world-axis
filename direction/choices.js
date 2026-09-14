/** WorldAxis direction/choices.js (v0.2) — 行动选项生成（带剧情上下文+世界状态，缝合 choice） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function getCtx() { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } }

  WA.choices = {
    async generate(n) {
      try {
        const ctx = getCtx();
        const chat = (ctx && ctx.chat) || [];
        const recent = chat.slice(-3).map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 600)).join('\n');
        const s = WA.store.get();
        const worldHint = [
          s.clock.label ? '时间:' + s.clock.label : '',
          Object.keys(s.people).length ? '在场人物:' + Object.values(s.people).slice(0, 5).map(p => p.name + '@' + (p.location || '?')).join('、') : '',
          s.currents.filter(c => c.visibility !== 'hidden').length ? '可感知暗流:' + s.currents.filter(c => c.visibility !== 'hidden').slice(0, 3).map(c => c.title).join('、') : ''
        ].filter(Boolean).join('\n');
        const r = await WA.apiRouter.call('choices', [
          { role: 'system', content: '基于当前剧情与世界状态，为玩家生成' + (n || 4) + '个可选行动，只输出JSON：{"choices":["..."]}。要求：①选项是玩家下一步具体可做的事，简短(≤40字)、有区分度、覆盖不同方向(对话/行动/观察/离开等)；②至少一个选项能推动可感知暗流；③不代写NPC反应，只描述玩家动作。' },
          { role: 'user', content: '【世界状态】\n' + (worldHint || '（无）') + '\n【近期剧情】\n' + (recent || '（无）') }
        ], { json: true, maxTokens: 700, temperature: 0.9 });
        return (r && r.choices) || [];
      } catch (e) { return []; }
    }
  };
})();