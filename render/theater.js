/** WorldAxis render/theater.js — 番外小剧场生成（缝合 st-theater）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.theater = {
    async generate(instruction) {
      try { return { ok: true, text: await WA.apiRouter.call('inference', [{ role: 'system', content: '你是小剧场编剧。基于指令生成一段独立番外（不影响正文）。' }, { role: 'user', content: instruction || '生成一段日常番外' }], { maxTokens: 4000 }) }; }
      catch (e) { return { ok: false, error: e }; }
    }
  };
})();
