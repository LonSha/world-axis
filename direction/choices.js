/** WorldAxis direction/choices.js — 行动选项生成（缝合 choice）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.choices = {
    async generate(n) {
      try {
        const r = await WA.apiRouter.call('choices', [
          { role: 'system', content: '基于当前剧情为玩家生成' + (n || 4) + '个可选行动，只输出JSON：{"choices":["..."]}。选项是玩家下一步可做的事，简短、有区分度。' },
          { role: 'user', content: '生成行动选项' }
        ], { json: true, maxTokens: 600, temperature: 0.9 });
        return (r && r.choices) || [];
      } catch (e) { return []; }
    }
  };
})();
