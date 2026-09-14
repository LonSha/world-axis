/** WorldAxis render/theater.js (v0.2) — 番外小剧场（缝合 st-theater + titania-theater） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  WA.theater = {
    /** 生成一段番外小剧场（独立、不影响正文） */
    async generate(instruction, opts) {
      opts = opts || {};
      try {
        const cfg = WA.apiRouter.getChannel('inference');
        if (!cfg.baseUrl || !cfg.model) return { ok: false, reason: '推演通道未配置' };
        const s = WA.store.get();
        const people = Object.values(s.people).slice(0, 6).map(p => p.name + '(' + (p.location || '?') + ')').join('、');
        const sys = '你是小剧场编剧。基于指令与世界状态，写一段独立番外（' + (opts.length || '中篇500-800字') + '）。不影响正文正史，轻松/日常/幕后风格均可。可直接输出文本。';
        const user = '【剧场指令】' + (instruction || '生成一段日常番外') + (people ? '\n【可用人物】' + people : '') + (s.clock.label ? '\n【世界时间】' + s.clock.label : '');
        const text = await WA.apiRouter.call('inference', [{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: opts.maxTokens || 2500, temperature: 0.9 });
        return { ok: true, text: String(text || '').trim() };
      } catch (e) { return { ok: false, error: e }; }
    },
    /** 把剧场文本渲染为可插入正文的块（作为番外折叠） */
    wrap(title, text) {
      return '<details class="wa-theater"><summary>🎭 ' + (title || '番外小剧场') + '</summary>\n\n' + text + '\n\n</details>';
    }
  };
})();