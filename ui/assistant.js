/** WorldAxis ui/assistant.js (v0.2) — 世界助手对话（缝合 酒馆询问机，就世界状态问答） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  WA.assistant = {
    /** 就当前世界状态回答用户问题 */
    async ask(question) {
      const cfg = WA.apiRouter.getChannel('default');
      if (!cfg.baseUrl || !cfg.model) return { ok: false, reason: 'default通道未配置' };
      const s = WA.store.get();
      const snap = {
        clock: s.clock.label, pulse: s.worldPulse,
        people: Object.values(s.people).slice(0, 10).map(p => ({ n: p.name, loc: p.location, act: p.action, intent: p.intent })),
        currents: s.currents.slice(-8).map(c => ({ t: c.title, v: c.visibility, st: c.stage, s: c.summary.slice(0, 80) })),
        facts: s.worldFacts.slice(-10).map(f => f.key + '=' + f.value),
        opinion: (s.opinion.canon || []).slice(-3).map(o => o.title),
        foreshadows: (s.memory.foreshadows || []).filter(f => f.status !== 'dropped').slice(-6).map(f => f.content)
      };
      const sys = '你是「世界枢轴」助手。基于世界状态快照回答用户关于世界/人物/暗流/舆情的问题。可透露hidden级信息给用户（用户是上帝视角），但提醒哪些内容正文角色不该知道。简洁回答。';
      const text = await WA.apiRouter.call('default', [
        { role: 'system', content: sys },
        { role: 'user', content: '【世界快照】' + JSON.stringify(snap) + '\n【提问】' + question }
      ], { maxTokens: 1500, temperature: 0.5 }).catch(e => null);
      if (!text) return { ok: false, reason: 'api-fail' };
      return { ok: true, text: String(text).trim() };
    }
  };
})();