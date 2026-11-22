/**
 * WorldAxis actors/monologue.js (v2.231.0) — 发送前NPC独白推演注入
 * 预筛Gate → 按需并发推演 → 注入用户消息下方；失败/超时自动放行
 *
 * OPT-3（v2.231.0）：本模块此前有两处与产品意图相反的地方 ——
 *   ① 提示词硬性要求「使当前局面的性质发生明显变化」「禁止静观其变」：act 明明支持
 *      拒绝、延迟、维持现状，独白层却把所有人物都改写成「每轮必须变卦」。谨慎者被迫
 *      出手，安静场面被迫生戏，人物差异在注入层被抹平。
 *   ② 挑人只看名单：每轮把 registry.list() 全量丢给预筛模型，安静交谈也要为所有
 *      离场 NPC 各发一次请求；「未变化的人复用仍有效结果」根本没有实现。
 *
 * 本版口径（九条，全部可在 tests/opt3-monologue-v2231.js 上跑）：
 *   ① 一条主链：本地收窄 → 必要时模型预筛 → 分批并发独白。不并行第二套推演。
 *   ② 先本地收窄再调模型：最近消息里没提到、也没有可用缓存的人，不进预筛（`no-mention`）。
 *   ③ 缓存按「指纹」复用：档案 + 最近消息 + 楼层数同指纹即复用上一轮独白，
 *      复用轮次受 reuseTtl 限制（不无限复读同一句话）。
 *   ④ 合法结果包含等待 / 拒绝 / 维持现状：提示词改为允许，并要求观望者写明在等什么。
 *   ⑤ 立场可读：命中观望词表的人标 stance='hold'，注入块用 hold 属性与「｜观望」标出，
 *      下游知道「这人本轮不打算动」，而不是把他当成又一个必须行动的人。
 *   ⑥ 并发与通道按玩家设置：maxParallel 分批，useObserve 走 observe 通道。
 *   ⑦ 总开关关闭 → 零请求零注入（不猜、不降级成「全量推演」）。
 *   ⑧ 通道未配置 → 零开销放行。
 *   ⑨ 45 秒硬止损（时长可调，但有上下界），失败/超时自动放行。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 测量时间走 clockWall（耗时/台账），不参与决策。
  const clockWall = function (site) { try { return WA.clock.wallNow(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_monologue_settings_v1';
  const DEF = { enabled: true, maxParallel: 6, reuseSame: true, reuseTtl: 2, useObserve: false, timeoutMs: 45000 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'monologue',
    bounds: { maxParallel: [1, 8], reuseTtl: [1, 8], timeoutMs: [5000, 120000] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    if (!WA.settingsBus) return Object.assign({}, DEF, next || {});
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), next || {})));
  }

  const PRESCREEN_SYS = '你是「角色预筛」子agent。判断下一轮剧情中哪些已注册角色会开口/行动/有重要内心反应。只输出JSON：{"characters":["全名",...]}，最多6个。候选集仅限<Registered_Characters>名单，名单外一律不列入。在场判定从严、戏份判定从宽。';
  // v2.231.0（OPT-3）：删掉「使当前局面的性质发生明显变化」「禁止静观其变」两句。
  //   那两句把「有戏」写成了硬指标，于是谨慎者也被迫出手——而 act 一直支持
  //   拒绝 / 延迟 / 维持现状。允许不行动，但要求把「为什么等」写清楚，
  //   否则「什么都不写」与「选择等待」在注入层长得一样。
  const ROLEPLAY_SYS = '你是「角色扮演」子agent。扮演指定NPC，以第一人称写出本轮内心独白（心情、想法、下一步行动）。只输出一段纯文本内心独白，不要 JSON、不要标题、不要引号包裹。400字以内，体现信息盲区与认知框架；行动必须落在当前场景此刻能执行。合法的结果包含行动，也包含等待、拒绝与维持现状——按该角色的性格、处境与他实际掌握的信息自行决定：谨慎的人可以观望，急迫的人才出手，不要为了「有戏」强行变卦。若本轮不打算行动，就在独白里写明你在等什么、在顾虑什么。特殊场景服从该角色的关系与性格，不得覆盖上面的认知边界与信息盲区。';
  // 观望词表：只用来给注入块打标（下游据此知道此人本轮不动），不参与"质量"裁决。
  const HOLD_RE = /(静观|按兵不动|暂不|先不动|不动声色|不予理会|保持沉默|不作声|忍住|按住|观望|再等|等等看|等一等|先等等|拒绝|不去|不打算|维持现状|原地)/;

  const __stat = {
    prescreenCalls: 0, roleplayCalls: 0, reused: 0, skippedNoMention: 0,
    holdLines: 0, injectedRounds: 0, injectedLines: 0,
    lastNeed: 0, lastPicked: 0, lastSkipped: 0, lastReused: 0, elapsedMs: 0, lastAt: 0
  };
  const __memo = new Map(); // name -> { sig, text, stance, uses, at }（内存态：跨轮复用，不进存档）

  function hash(s) {
    let h = 5381;
    const str = String(s == null ? '' : s);
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0xffffffff;
    return (h >>> 0).toString(36);
  }

  // 纯文本优先，旧 JSON（{"monologue":"..."}）仍可注入。空串与超长在这里截掉。
  function parseMonologue(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return '';
    let body = text;
    const fence = body.match(/^```(?:json|text|markdown)?\s*([\s\S]*?)\s*```$/);
    if (fence) body = fence[1].trim();
    // 只有整段就是旧 JSON 才取 monologue。正文里顺口提到 JSON 不算，保持纯文本原样。
    if (body.charAt(0) === '{' || body.charAt(0) === '[') {
      const parsed = WA.apiRouter.extractJson(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.monologue === 'string') {
        body = parsed.monologue.trim();
      }
    }
    body = body.replace(/^\[[^\]\n]{1,40}\]的内心独白[:：]\s*/, '').trim();
    if (body.length > 400) body = body.slice(0, 400);
    return body;
  }
  function stanceOf(text) { return HOLD_RE.test(String(text || '')) ? 'hold' : 'act'; }

  function getCtx() { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } }
  function recentMessages(n) {
    const ctx = getCtx(); const chat = (ctx && ctx.chat) || [];
    return chat.slice(Math.max(0, chat.length - (n || 4))).map(m => (m.is_user ? '【玩家】' : '【' + (m.name || '角色') + '】') + String(m.mes || '').slice(0, 600)).join('\n');
  }
  function chatLen() { const ctx = getCtx(); return ((ctx && ctx.chat) || []).length; }

  // 指纹 = 这个人的档案（性格/关系/记忆/目标）。
  //   刻意**不**把楼层数或最近消息并进来：楼层数每轮必变，一并进来就等于「永不命中」，
  //   缓存写了也白写（这是上一版「未变化的人复用仍有效结果」落不了地的真实原因）。
  //   他眼前发生了什么，由 plan() 的「本轮是否被点名」单独判断：被点名就重推，
  //   没被点名且档案没动，说明没有新信息进这个人的脑子，他的内心仍是上一轮那个。
  function sigOf(name) {
    let prof = null;
    try { prof = WA.registry && WA.registry.getProfile ? WA.registry.getProfile(name) : null; } catch (e) { prof = null; }
    return hash(JSON.stringify(prof || null).slice(0, 2000));
  }

  // 本地收窄：谁需要重推、谁能复用、谁根本不进预筛。
  function plan(names, opts) {
    opts = opts || {};
    const st = settings();
    const recent = recentMessages(3);
    const need = [], reuse = [], skipped = [];
    (names || []).forEach(function (n) {
      const nm = String(n || '').trim();
      if (!nm) return;
      const m = __memo.get(nm);
      const mentioned = recent.indexOf(nm) >= 0;
      const fresh = m && m.sig === sigOf(nm);
      // 复用条件四项同时成立：开复用、指纹未变、本轮没被点名、复用轮次未耗尽。
      if (fresh && st.reuseSame && !mentioned && (m.uses || 0) < st.reuseTtl) {
        m.uses = (m.uses || 0) + 1;
        reuse.push({ character: nm, monologue: m.text, stance: m.stance, cached: true });
        return;
      }
      // 从未推演过、本轮也没被提到：不进预筛（安静场面不该为不在场的人各发一次请求）。
      if (!m && !mentioned && !opts.force) { skipped.push({ name: nm, why: 'no-mention' }); return; }
      need.push(nm);
    });
    return { need: need, reuse: reuse, skipped: skipped, mentions: recent };
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  WA.monologue = {
    getSettings: settings,
    setSettings: saveSettings,
    // plan 由面板「本轮推演对象」消费（产品侧真调用）；sigOf/stanceOf 只在本模块内部使用，
    //   不导出——导出面即承诺面，没人消费的能力不该留在承诺面上（死子面门禁口径）。
    plan: plan,
    stat: function () { return Object.assign({}, __stat, { memo: __memo.size, enabled: settings().enabled, chatLen: chatLen() }); },
    resetStat: function () { Object.keys(__stat).forEach(function (k) { __stat[k] = 0; }); return { ok: true, entries: Object.keys(__stat).length }; },
    // 清缓存：换聊天/重开档时不复用上一局的人物内心（不跨局串味）。
    resetMemo: function () { const n = __memo.size; __memo.clear(); return { dropped: n }; },

    async prescreen(names, signal) {
      const input = '<Registered_Characters>\n' + names.join('、') + '\n</Registered_Characters>\n<Recent_Messages>\n' + recentMessages(4) + '\n</Recent_Messages>';
      __stat.prescreenCalls++;
      const r = await WA.apiRouter.call('inference', [{ role: 'system', content: PRESCREEN_SYS }, { role: 'user', content: input }], { json: true, signal, maxTokens: 500, temperature: 0.3 });
      const list = (r && Array.isArray(r.characters)) ? r.characters.filter(n => names.includes(n)) : [];
      return list.slice(0, 6);
    },
    async roleplayOne(name, signal, opts) {
      opts = opts || {};
      const st = settings();
      const profile = WA.registry.getProfile(name);
      const input = '<Character_Profile>\n' + JSON.stringify(profile).slice(0, 1500) + '\n</Character_Profile>\n<Recent_Messages>\n' + recentMessages(4) + '\n</Recent_Messages>\n角色名：' + name;
      const channel = (opts.channel === 'observe' || (opts.channel !== 'inference' && st.useObserve)) ? 'observe' : 'inference';
      __stat.roleplayCalls++;
      const r = await WA.apiRouter.call(channel, [{ role: 'system', content: ROLEPLAY_SYS }, { role: 'user', content: input }], { signal, maxTokens: 800, temperature: 0.7 });
      const monologue = parseMonologue(r);
      if (!monologue) return null;
      const rec = { character: name, monologue: monologue, stance: stanceOf(monologue), channel: channel };
      // 结果按当前指纹入缓存：下一轮同指纹就能复用（不再复写 uses —— 那是 plan 的事）。
      __memo.set(name, { sig: sigOf(name), text: monologue, stance: rec.stance, uses: 0, at: clockWall() });
      return rec;
    }
  };

  WA.workflow.register({
    id: 'actors.monologue', chain: 'before', order: 40, label: 'NPC独白推演',
    async run(ctx) {
      const st = settings();
      if (!st.enabled) return; // ⑦ 关闭：零请求、零注入
      const names = WA.registry.list();
      if (!names.length) return;
      const channel = st.useObserve ? 'observe' : 'inference';
      const cfg = WA.apiRouter.getChannel(channel);
      if (!cfg.baseUrl || !cfg.model) return; // ⑧ 未配置零开销直接放行
      const t0 = clockWall();
      const pl = plan(names);
      __stat.skippedNoMention += pl.skipped.length;
      __stat.lastSkipped = pl.skipped.length;
      __stat.lastNeed = pl.need.length;
      __stat.lastReused = pl.reuse.length;
      __stat.reused += pl.reuse.length;
      let lines = pl.reuse.slice();
      if (pl.need.length) {
        const ac = new AbortController();
        const hardTimeout = setTimeout(() => ac.abort(), st.timeoutMs); // ⑨ 硬超时（设置可调）
        try {
          const picked = await WA.monologue.prescreen(pl.need, ac.signal);
          __stat.lastPicked = picked.length;
          if (picked.length) {
            const batches = chunk(picked, st.maxParallel); // ⑥ 并发数按设置
            for (const batch of batches) {
              const results = await Promise.allSettled(batch.map(n => WA.monologue.roleplayOne(n, ac.signal, { channel })));
              results.forEach(r => { if (r.status === 'fulfilled' && r.value) lines.push(r.value); });
            }
          }
        } finally { clearTimeout(hardTimeout); }
      }
      if (!lines.length) return;
      const holds = lines.filter(l => l.stance === 'hold').map(l => l.character);
      __stat.holdLines += holds.length;
      const block = lines.map(l => '【' + l.character + '·内心' + (l.stance === 'hold' ? '｜观望' : '') + '】' + l.monologue).join('\n');
      const attrs = holds.length ? ' hold="' + holds.join('、') + '"' : '';
      ctx.injections.push({
        source: 'NPC独白（' + lines.length + '人' + (pl.reuse.length ? '·复用' + pl.reuse.length : '') + '）',
        position: 'after_last_user', depth: 0,
        content: '<npc_inner_voices' + attrs + '>\n' + block + '\n</npc_inner_voices>'
      });
      __stat.injectedRounds++;
      __stat.injectedLines += lines.length;
      __stat.elapsedMs = clockWall() - t0;
      __stat.lastAt = clockWall();
    }
  });
})();
