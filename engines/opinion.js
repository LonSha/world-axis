/**
 * WorldAxis engines/opinion.js (v0.2)
 * 舆情引擎：canon新闻 / forum论坛传闻 / sandbox闲逛(NON-CANON) 三层
 * 移植自 world-backstage public-opinion.js（只读规则/trace限制/上限/claim_status）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_opinion_settings_v1';

  function loadSettings() {
    const def = { enabled: false, sandboxEnabled: false, everyNRounds: 3 };
    try { return Object.assign(def, JSON.parse(WA.mainWin.localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return def; }
  }
  const __REG = { key: LS_KEY, def: { enabled: false, sandboxEnabled: false, everyNRounds: 3 }, module: 'opinion' };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function saveSettings(s) { WA.settingsBus.save(__REG, s); }

  const OPINION_SYS = `你是「舆情观察器」，只读世界状态与暗流，产出公众舆论层内容。规则：
1. 你不改变世界事实，只描述公众能看到/传言的部分。
2. publicity=trace 的事件只能以论坛传闻形式出现（模糊说法，无可核实细节）；publicity=public 才能上新闻（允许细节）。
3. 输出上限：news≤3条、forums≤4个主题。
4. 每条必须带 related_event_id（引用已有暗流/事件标题，禁止无中生有）；无关联事件的舆情禁止产出。
5. claim_status 三值：fact(已核实) / mixed(真假掺杂) / rumor(纯传闻)。
只输出JSON：
{"news":[{"title":"...","body":"...","related_event_id":"...","claim_status":"fact|mixed|rumor","scope":"local|national|global"}],
 "forums":[{"board":"板块名","topic":"主题","related_event_id":"...","claim_status":"...","audience_tags":["..."],"replies":[{"author":"匿名昵称","text":"代表回复"}]}]}`;

  const SANDBOX_SYS = `你是「闲逛沙盒」生成器（NON-CANON，非正史）。产出一些与主线弱相关的生活化碎片：路人对话、街头小事、网络热帖。这些内容不进正史，只为世界增添烟火气。只输出JSON：{"fragments":[{"kind":"overheard|street|trending","text":"...","mood":"..."}]}，≤4条。`;

  const opinion = WA.opinion = {
    getSettings: loadSettings,
    setSettings(o) { saveSettings(Object.assign(loadSettings(), o || {})); },

    /** 生成canon舆情（新闻+论坛），写入store.opinion */
    async generate() {
      const cfg = WA.apiRouter.getChannel('observe');
      if (!cfg.baseUrl || !cfg.model) return { ok: false, reason: 'no-channel' };
      const s = WA.store.get();
      const candidates = (s.currents || []).filter(c => c.publicity === 'trace' || c.publicity === 'public').slice(0, 12)
        .map(c => ({ id: c.id, t: c.title, pub: c.publicity, pt: c.public_trace || '', st: c.stage }));
      if (!candidates.length) return { ok: false, reason: 'no-candidates' };
      const prev = (s.opinion.canon || []).slice(-6).map(o => ({ t: o.title, cl: o.claim_status }));
      const r = await WA.apiRouter.call('observe', [
        { role: 'system', content: OPINION_SYS },
        { role: 'user', content: '【候选公开事件】' + JSON.stringify(candidates) + '\n【上轮舆情快照】' + JSON.stringify(prev) }
      ], { json: true, maxTokens: 3000, temperature: 0.8 }).catch(e => { WA.log('warn', '舆情生成失败', e.message); return null; });
      if (!r) return { ok: false, reason: 'api-fail' };
      const now = Date.now();
      const validTitles = new Set(candidates.map(c => c.t));
      const news = (r.news || []).slice(0, 3).filter(n => n && n.title && validTitles.has(n.related_event_id))
        .map(n => ({ title: String(n.title).slice(0, 80), body: String(n.body || '').slice(0, 300), related_event_id: n.related_event_id, claim_status: ['fact', 'mixed', 'rumor'].includes(n.claim_status) ? n.claim_status : 'rumor', scope: n.scope || 'local', at: now, kind: 'news' }));
      const forums = (r.forums || []).slice(0, 4).filter(f => f && f.topic && validTitles.has(f.related_event_id))
        .map(f => ({ board: String(f.board || '综合').slice(0, 30), topic: String(f.topic).slice(0, 80), related_event_id: f.related_event_id, claim_status: ['fact', 'mixed', 'rumor'].includes(f.claim_status) ? f.claim_status : 'rumor', audience_tags: (f.audience_tags || []).slice(0, 5), replies: (f.replies || []).slice(0, 4).map(x => ({ author: String(x.author || '匿名').slice(0, 20), text: String(x.text || '').slice(0, 150) })), at: now, kind: 'forum' }));
      WA.store.transact(draft => {
        draft.opinion.canon = (draft.opinion.canon || []).concat(news).slice(-20);
        draft.opinion.forum = (draft.opinion.forum || []).concat(forums).slice(-20);
        draft.opinion.updatedAt = now;
      });
      WA.log('info', `舆情结算：新闻${news.length}条 论坛${forums.length}主题`);
      return { ok: true, news: news.length, forums: forums.length };
    },

    /** 闲逛沙盒（NON-CANON，独立存放不进正史） */
    async generateSandbox() {
      const cfg = WA.apiRouter.getChannel('observe');
      if (!cfg.baseUrl || !cfg.model) return { ok: false, reason: 'no-channel' };
      const r = await WA.apiRouter.call('observe', [
        { role: 'system', content: SANDBOX_SYS },
        { role: 'user', content: '生成一批世界碎片（纯氛围，NON-CANON）。' }
      ], { json: true, maxTokens: 1500, temperature: 1.0 }).catch(() => null);
      if (!r || !r.fragments) return { ok: false, reason: 'api-fail' };
      const now = Date.now();
      WA.store.transact(draft => {
        draft.opinion.sandbox = (r.fragments || []).slice(0, 4).map(f => ({ kind: f.kind || 'street', text: String(f.text || '').slice(0, 200), mood: f.mood || '', at: now }));
      });
      return { ok: true, count: (r.fragments || []).length };
    },

    /** 舆情注入块（before链，visibility=opinion开启时） */
    buildOpinionBlock() {
      const s = WA.store.get();
      const canon = (s.opinion.canon || []).slice(-3);
      const forum = (s.opinion.forum || []).slice(-2);
      if (!canon.length && !forum.length) return '';
      const parts = [];
      if (canon.length) parts.push('【世界新闻】' + canon.map(n => n.title).join('；'));
      if (forum.length) parts.push('【坊间传闻】' + forum.map(f => f.topic + '（' + f.claim_status + '）').join('；'));
      return '<world_axis_opinion>\n' + parts.join('\n') + '\n</world_axis_opinion>';
    }
  };

  // after链：每N轮自动生成舆情
  let roundCount = 0;
  WA.workflow.register({
    id: 'opinion.tick', chain: 'after', order: 50, label: '舆情观察（每N轮）',
    async run() {
      const st = loadSettings();
      if (!st.enabled) return;
      roundCount++;
      if (roundCount % Math.max(1, st.everyNRounds) !== 0) return;
      await WA.opinion.generate();
      if (st.sandboxEnabled) await WA.opinion.generateSandbox();
    }
  });
})();