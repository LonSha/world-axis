/**
 * WorldAxis actors/observe.js (v0.2)
 * 观测切片：从NPC视角生成一段镜头外观察文本（供面板查看/注入）
 * 缝合来源：世界背面观测模式 + SoulLink视角切片
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function getCtx() { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } }

  WA.observe = {
    /** 生成NPC视角的观测切片 */
    async slice(name, opts) {
      opts = opts || {};
      const cfg = WA.apiRouter.getChannel('observe');
      if (!cfg.baseUrl || !cfg.model) return { ok: false, reason: 'observe通道未配置' };
      const s = WA.store.get();
      const p = s.people['p_' + name] || {};
      const knowledge = p.knowledge || {};
      const knowledgeLines = Object.entries(knowledge).slice(-10).map(([k, v]) => `- ${k}（${v.status}，途径:${v.route}）`).join('\n');
      const profile = p.profile || {};
      const ctx = getCtx();
      const chat = (ctx && ctx.chat) || [];
      const recent = chat.slice(-4).map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 500)).join('\n');

      const sys = `你是「观测切片」生成器。以NPC「${name}」的视角，写一段其镜头外的当下观察/处境（150-250字，第一人称或贴身第三人称）。
要求：
1. 严格受该NPC认知边界约束——他只能基于自己知道的信息思考；
2. 体现其性格锚点与当前意图；
3. 可感知publicity=public或visibility=trace的公共迹象，但不得知晓hidden级暗流内情；
4. 只输出切片文本本身，不加解释。`;

      const user = [
        '【NPC状态】位置:' + (p.location || '未知') + ' 行动:' + (p.action || '无') + ' 意图:' + (p.intent || '无'),
        '【性格锚点】' + ((profile.personality || []).slice(-3).map(x => x.text || x).join('；') || '未建立'),
        '【已知信息】\n' + (knowledgeLines || '（无）'),
        '【可感知的公开暗流】' + (s.currents || []).filter(c => c.visibility === 'trace' || c.publicity === 'public').slice(-3).map(c => c.public_trace || c.title).join('；'),
        '【近期正文（仅供参考情境，该NPC未必在场）】\n' + recent
      ].join('\n');

      const text = await WA.apiRouter.call('observe', [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ], { maxTokens: 600, temperature: 0.85 }).catch(e => null);
      if (!text) return { ok: false, reason: 'api-fail' };
      const trimmed = String(text).trim().slice(0, 600);
      if (opts.inject) {
        return { ok: true, text: trimmed, injectable: '<npc_observation name="' + name + '">\n' + trimmed + '\n</npc_observation>' };
      }
      return { ok: true, text: trimmed };
    }
  };
})();