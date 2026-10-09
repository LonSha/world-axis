/**
 * WorldAxis actors/monologue.js — 发送前NPC独白推演注入（缝合 SoulLink 角色扮演子agent）
 * 预筛Gate → 并发推演 → 注入用户消息下方；失败/超时自动放行
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const PRESCREEN_SYS = '你是「角色预筛」子agent。判断下一轮剧情中哪些已注册角色会开口/行动/有重要内心反应。只输出JSON：{"characters":["全名",...]}，最多6个。候选集仅限<Registered_Characters>名单，名单外一律不列入。在场判定从严、戏份判定从宽。';
  // v2.44.0：对齐 SoulLink v1.7.1。独白改纯文本，不再要求 JSON；预筛 Gate 仍是 JSON。
  // 特殊场景只留一句边界，不把上游的具体写法搬进世界引擎默认注入。
  const ROLEPLAY_SYS = '你是「角色扮演」子agent。扮演指定NPC，以第一人称写出本轮内心独白（心情、想法、下一步行动），使当前局面的性质发生明显变化。只输出一段纯文本内心独白，不要 JSON、不要标题、不要引号包裹。400字以内，体现信息盲区与认知框架；行动必须能改变剧情状态、落在当前场景此刻能执行，禁止「静观其变」类废戏。特殊场景服从该角色的关系与性格，不得覆盖上面的认知边界与信息盲区。';
  // 纯文本优先，旧 JSON（{"monologue":"..."}）仍可注入。空串与超长在这里截掉。
  function parseMonologue(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return '';
    let body = text;
    const fence = body.match(/^```(?:json|text|markdown)?\s*([\s\S]*?)\s*```$/);
    if (fence) body = fence[1].trim();
    // 只有整段就是旧 JSON 才取 monologue。正文里顺口提到 JSON 不算，保持纯文本原样。
    if (body.charAt(0) === "{" || body.charAt(0) === "[") {
      const parsed = WA.apiRouter.extractJson(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.monologue === "string") {
        body = parsed.monologue.trim();
      }
    }
    body = body.replace(/^\[[^\]\n]{1,40}\]的内心独白[:：]\s*/, '').trim();
    if (body.length > 400) body = body.slice(0, 400);
    return body;
  }

  function getCtx() { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } }
  function recentMessages(n) {
    const ctx = getCtx(); const chat = (ctx && ctx.chat) || [];
    return chat.slice(Math.max(0, chat.length - (n || 4))).map(m => (m.is_user ? '【玩家】' : '【' + (m.name || '角色') + '】') + String(m.mes || '').slice(0, 600)).join('\n');
  }

  WA.monologue = {
    async prescreen(names, signal) {
      const input = '<Registered_Characters>\n' + names.join('、') + '\n</Registered_Characters>\n<Recent_Messages>\n' + recentMessages(4) + '\n</Recent_Messages>';
      const r = await WA.apiRouter.call('inference', [{ role: 'system', content: PRESCREEN_SYS }, { role: 'user', content: input }], { json: true, signal, maxTokens: 500, temperature: 0.3 });
      const list = (r && Array.isArray(r.characters)) ? r.characters.filter(n => names.includes(n)) : [];
      return list.slice(0, 6);
    },
    async roleplayOne(name, signal) {
      const profile = WA.registry.getProfile(name);
      const input = '<Character_Profile>\n' + JSON.stringify(profile).slice(0, 1500) + '\n</Character_Profile>\n<Recent_Messages>\n' + recentMessages(4) + '\n</Recent_Messages>\n角色名：' + name;
      const r = await WA.apiRouter.call('inference', [{ role: 'system', content: ROLEPLAY_SYS }, { role: 'user', content: input }], { signal, maxTokens: 800, temperature: 0.7 });
      const monologue = parseMonologue(r);
      return monologue ? { character: name, monologue: monologue } : null;
    }
  };

  WA.workflow.register({
    id: 'actors.monologue', chain: 'before', order: 40, label: 'NPC独白推演',
    async run(ctx) {
      const names = WA.registry.list();
      if (!names.length) return;
      const cfg = WA.apiRouter.getChannel('inference');
      if (!cfg.baseUrl || !cfg.model) return; // 未配置零开销直接放行
      const ac = new AbortController();
      const hardTimeout = setTimeout(() => ac.abort(), 45000); // 45秒硬超时
      try {
        const picked = await WA.monologue.prescreen(names, ac.signal);
        if (!picked.length) return;
        const results = await Promise.allSettled(picked.map(n => WA.monologue.roleplayOne(n, ac.signal)));
        const lines = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
        if (!lines.length) return;
        const block = lines.map(l => '【' + l.character + '·内心】' + l.monologue).join('\n');
        ctx.injections.push({ source: 'NPC独白（' + lines.length + '人）', position: 'after_last_user', depth: 0, content: '<npc_inner_voices>\n' + block + '\n</npc_inner_voices>' });
      } finally { clearTimeout(hardTimeout); }
    }
  });
})();
