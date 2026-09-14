/** WorldAxis actors/observe.js — 人物观测：第一人称切片（缝合 世界背面观测）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.observe = {
    async slice(name) {
      const p = WA.store.get().people['p_' + name];
      if (!p) return { ok: false, reason: 'not-found' };
      const profile = WA.registry.getProfile(name);
      const sys = '你只做一件事：给出该人物此刻的第一人称切片（她在做什么/想什么），只使用她自己拥有的认知、记忆与口吻。不让她突然成为剧情中心。直接输出短文，不要JSON。';
      const input = '【人物档案】' + JSON.stringify(profile).slice(0, 1200) + '\n【当前状态】位置:' + (p.location || '?') + ' 行动:' + (p.action || '日常') + ' 意图:' + (p.intent || '无');
      try { const text = await WA.apiRouter.call('observe', [{ role: 'system', content: sys }, { role: 'user', content: input }], { maxTokens: 800, temperature: 0.8 }); return { ok: true, text }; }
      catch (e) { return { ok: false, error: e }; }
    }
  };
})();
