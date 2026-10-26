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
    },

    /**
     * 正文衍生人物探测器 (FateLoom Detection 机制缝合)
     * 从正文切片提取有动作/台词的潜在建档角色
     */
    detectCandidates(sliceText, options) {
      options = options || {};
      const text = String(sliceText || '').trim();
      if (!text) return { ok: true, candidates: [] };
      const exclude = Array.isArray(options.excludeNames) ? options.excludeNames.slice() : [];
      const KNOWN_IGNORE = ['路人', '众人', '有人', '行人', '旁人', '大家', '士兵们', '人群', '对方', '村民们'];
      exclude.forEach(n => { if (n) KNOWN_IGNORE.push(n); });

      const candidates = [];
      // 常见称谓/动作捕捉正则
      const lines = text.split('\n');
      lines.forEach(line => {
        const str = line.trim();
        // 匹配：“那个店员端来热水”、“老太太叹了口气说…”、“药铺伙计抬起头”
        const m = str.match(/(?:那位|一位|某个|身旁的|林中)?([\u4e00-\u9fa5]{2,6}?)(?:端着|走来|走上前|叹息|皱眉|打量|低声说道|喊道|冷笑|说道|笑道|问道|回答|抬眼|开口)/);
        if (m && m[1]) {
          const rawName = m[1].replace(/^(那个|一位|某个|身旁的)/, '').trim();
          if (rawName && rawName.length >= 2 && rawName.length <= 8 && KNOWN_IGNORE.indexOf(rawName) < 0) {
            if (!candidates.some(c => c.name === rawName)) {
              candidates.push({
                name: rawName,
                context: str.slice(0, 100),
                unnamed: /店员|伙计|老太太|大爷|老板|掌柜|守卫|巡捕|随从|老者|少女|少妇|车夫/.test(rawName),
                confidence: 'high'
              });
            }
          }
        }
      });
      return { ok: true, candidates: candidates };
    },

    /**
     * 衍生角色非孤立转正纳管 (FateLoom 4+1规范 + 非孤立硬约束 + 防全知认知隔离)
     */
    enrollCandidate(candidateData) {
      candidateData = candidateData || {};
      const name = String(candidateData.name || '').trim();
      if (!name) return { ok: false, reason: 'bad-candidate-name' };

      const relUser = String(candidateData.rel_user || '').trim();
      if (!relUser || /^(陌生人|路人|无关系|路过|毫无关系)$/.test(relUser)) {
        return { ok: false, reason: 'bad-user-relation', hint: '与玩家关系必须具体，严禁填陌生人或无关系' };
      }

      const relAnchor = String(candidateData.rel_anchor || '').trim();
      if (!relAnchor) {
        return { ok: false, reason: 'missing-anchor-relation', hint: '必须锚定已在册的现存角色，严禁孤立角色' };
      }

      const s = WA.store && WA.store.get ? WA.store.get() : {};
      const people = (s && s.people) || {};
      // 验证锚定角色真实存在
      const anchorExists = !!people['p_' + relAnchor] || Object.keys(people).some(k => k === relAnchor || k === 'p_' + relAnchor);
      if (!anchorExists && !candidateData.skipAnchorCheck) {
        return { ok: false, reason: 'anchor-not-found', anchor: relAnchor };
      }

      let out = null;
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (draft) {
          draft.people = draft.people || {};
          const pKey = 'p_' + name;
          draft.people[pKey] = {   // fallback：转正建档直落，不经 registry.ensurePerson
            id: pKey,
            name: name,
            createdVia: 'observe:fallback',
            location: candidateData.location || '未知',
            rel_user: relUser,
            rel_anchor: relAnchor,
            profile: candidateData.profile || {},
            nsfwProfile: candidateData.nsfwProfile || null,
            hooks: Array.isArray(candidateData.hooks) ? candidateData.hooks : [],
            knowledge: {
              public_context: { status: 'observed', route: 'scene_witness' }
            },
            epistemicBoundary: {
              isolated: true,
              prohibitOmniscience: true,
              rule: '新转正角色仅持有本人目击范围事实，禁止读取场外全知信息'
            },
            enrolledAt: Date.now()
          };
          out = {
            ok: true,
            person: name,
            id: pKey,
            rel_user: relUser,
            rel_anchor: relAnchor,
            epistemicSafe: true
          };
        }, 'observe:enrollCandidate');
      }
      return out || { ok: false, reason: 'store-unavailable' };
    }
  };
})();