/**
 * WorldAxis engines/backstage.js (v0.2 完整版)
 * 世界演算底座：后台世界推演 + 认知边界协议 + 双轴可见性 + 世界脉搏 + 三列注入引用
 * 移植自 world-backstage：buildSimulationPrompt / WORLD_BACKSTAGE_CORE_REASONING_PROTOCOL / 结算器
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_SETTINGS = 'worldaxis_backstage_settings_v1';

  // ════════════════════════════════════════════════════════
  // 七步判断协议（世界背面推理协议移植，不输出思考过程）
  // ════════════════════════════════════════════════════════
  const REASONING_PROTOCOL = `
你是正文后的世界结算器，不续写正文。内部按固定顺序判断，勿输出思考过程：
1. 区分事实等级：正文事实 > 玩家输入 > 已有世界状态 > 推断。推断必须降级标注，不得与事实混同。
2. 时间以正文最新锚点为准（末尾优先），不臆造未发生的时间流逝。
3. 只结算到正文末态为止的变化；超出正文的推进写入暗流/趋势，不写成已发生事实。
4. 逐人维护知识边界：每个NPC只知道自己合理途径得知的事；未见未闻不知。
5. 因果链闭合：每个结算变化必须有cause来源（正文/旧暗流/旧事实），无源变化禁止入账。
6. 分类处理 CURRENT(当前有效) / RESIDUE(残余影响) / HISTORY(已归档)，不混淆时态。
7. next_turn_injection 只列现有引用（event:/fact:/person:/clue:），不复述全文。
`.trim();

  // ════════════════════════════════════════════════════════
  // 双轴可见性语义（visibility × publicity）
  // ════════════════════════════════════════════════════════
  const VISIBILITY_SEMANTICS = `
【双轴可见性】每个事件有两轴：
- visibility（角色能否感知）: hidden=完全隐匿 / trace=有异常迹象可察觉 / known=已知存在 / direct=直接目击参与
- publicity（公众传播度）: private=无公众知悉 / trace=只有论坛传闻、模糊流言 / public=已上新闻、公众可见
规则：publicity=trace 的事件不得出现具体可核实细节（只流传模糊说法）；publicity=public 才允许新闻级细节。
`.trim();

  // ════════════════════════════════════════════════════════
  // 事件身份稳定规则 + 单轮增量上限 + 知识路径 + 脉搏账本
  // ════════════════════════════════════════════════════════
  const STRUCTURAL_RULES = `
【事件身份稳定】事件一经创建标题即身份；禁止换标题重建同名事件（用12D-1禁令）。变化用更新原事件表达。
【知识路径】knowledge_updates 每项必须含 route：witnessed(目击)/told(被告知)/investigated(主动调查)/message(收到信息)/public_channel(公开渠道)/inferred(推断)。route=inferred 时状态只能是 suspected（嫌疑/猜测），禁止直接升为 fact。
【因果链】事件间用 cause/caused_by 引用连接，引用必须指向已存在的事件id或标题。
【单轮增量上限】people_upsert≤12, events_create≤6, events_update≤10, knowledge_updates≤20, chronicle≤8, foreshadows≤5。
【世界脉搏】world_pulse 描述世界活跃度：pressure 0-3（0平静/1微澜/2涌动/3风暴前兆），trend=rising|falling|steady，附一句话说明。pressure≥2 时应倾向产出可感知的暗流推进。
`.trim();

  // ════════════════════════════════════════════════════════
  // next_turn_injection 三列引用
  // ════════════════════════════════════════════════════════
  const INJECTION_RULES = `
【next_turn_injection】供下一轮正文参考的注入清单，只列引用不复述：
- required: 必须体现（正文人物已知或直接感知的变化），格式 "event:标题" 或 "fact:key"
- conditional: 条件触发（角色主动调查/接近时才暴露）
- suppress: 明确禁止下轮暴露（暗流尚未到浮出时机，防止剧透）
`.trim();

  // ── 模拟模式/时间策略/脉搏活跃度档位 ──
  const SIM_MODES = {
    light: '推演尺度：轻量。只结算直接受正文影响的NPC与暗流，单轮产出从严控制。',
    balanced: '推演尺度：均衡。结算直接+间接受影响的圈层，适度产出世界脉搏与新暗流。',
    deep: '推演尺度：深度。全圈层推演（含势力、舆情、经济面），允许较大规模世界变化。',
    manual: '推演尺度：手动。仅在用户手动触发时推演，且只做最小结算。'
  };
  const TIME_POLICIES = {
    explicit: '时间策略：严格。仅正文明示的时间流逝有效，未明示不推时间。',
    cautious: '时间策略：谨慎。可根据正文动作合理推断短时间流逝（分钟~小时）。',
    open: '时间策略：开放。允许根据剧情节奏推断较长时间流逝（小时~天），需标注。',
    world: '时间策略：世界钟。以世界状态clock为主时钟推进，正文时间冲突时以世界钟结算为准。'
  };
  const PULSE_LEVELS = {
    quiet: '世界脉搏：安静。世界很少自发产生新事件，以既有暗流演化为主。',
    normal: '世界脉搏：正常。世界按自身节奏运转，偶有新暗流诞生。',
    turbulent: '世界脉搏：激荡。世界频繁自发产生变化与新事件，镜头外暗流涌动。'
  };

  // ── 设置 ──
  function loadSettings() {
    const def = {
      simulationMode: 'balanced',   // light|balanced|deep|manual
      timePolicy: 'cautious',       // explicit|cautious|open|world
      pulseActivity: 'normal',      // quiet|normal|turbulent
      npcBudget: 8,                 // 单轮推演最多结算NPC数
      autoSimulate: true,           // after_reply 自动推演
      fullRules: false,             // v0.8.3: true=注入12模块完整规则全文, false=精简守则
      injectBudget: -1,             // v0.9.4: 注入预算；-1=自动(按上下文窗口6%)，0=不限，正数=手动上限
      customInstruction: ''         // 用户自定义推演指令（追加到系统提示）
    };
    try { return Object.assign(def, JSON.parse(WA.mainWin.localStorage.getItem(LS_SETTINGS) || '{}')); } catch (e) { return def; }
  }
  function saveSettings(s) { WA.mainWin.localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); }

  function getCtx() {
    try { return WA.mainWin.SillyTavern && WA.mainWin.SillyTavern.getContext ? WA.mainWin.SillyTavern.getContext() : null; }
    catch (e) { return null; }
  }

  // ── 串行推演链 ──
  let currentTask = null;
  let pendingAnchor = null;
  let taskSeq = 0;

  function latestAnchor() {
    const ctx = getCtx();
    const chat = ctx && ctx.chat;
    if (!chat || !chat.length) return null;
    const idx = chat.length - 1;
    const m = chat[idx];
    return { idx, swipe: m.swipe_id || 0, hash: String(m.mes || '').length + ':' + String(m.mes || '').slice(-32) };
  }

  // ── 世界快照裁剪（控制token）──
  function compactState(s, budget) {
    const peopleList = Object.values(s.people || {});
    const sorted = peopleList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return {
      clock: s.clock,
      background: s.background.text ? s.background.text.slice(0, 500) : '',
      pulse: s.worldPulse || null,
      facts: (s.worldFacts || []).slice(-20).map(f => ({ k: f.key, v: f.value })),
      people: sorted.slice(0, budget || 8).map(p => ({
        id: p.id, n: p.name, loc: p.location || '', act: p.action || '', intent: p.intent || '',
        knows: p.knowledge ? Object.keys(p.knowledge).slice(0, 10) : []
      })),
      currents: (s.currents || []).filter(c => !['已结束', 'closed'].includes(c.stage)).slice(0, 10).map(c => ({
        id: c.id, t: c.title, v: c.visibility, pub: c.publicity || 'private', st: c.stage, s: (c.summary || '').slice(0, 120)
      })),
      echoes_recent: (s.echoes || []).slice(-5).map(e => ({ r: e.refCurrent, res: (e.result || '').slice(0, 80) })),
      foreshadows: (s.memory.foreshadows || []).filter(f => f.status === 'waiting' || f.status === 'developing').slice(0, 8).map(f => ({ id: f.id, c: f.content.slice(0, 60), st: f.status })),
      opinion_top: (s.opinion.canon || []).slice(-3).map(o => ({ t: o.title || o, cl: o.claim_status || '' })),
      evolution_active: (WA.evolution && WA.evolution.activeSnapshot) ? WA.evolution.activeSnapshot() : { events: [], factions: [], winds: [] }
    };
  }

  // ── 近期正文提取 ──
  function recentText(n) {
    const ctx = getCtx();
    const chat = (ctx && ctx.chat) || [];
    return chat.slice(Math.max(0, chat.length - (n || 8))).map(m => {
      const who = m.is_user ? '【玩家】' : '【' + (m.name || '正文') + '】';
      return who + String(m.mes || '').slice(0, 1200);
    }).join('\n---\n');
  }

  const backstage = WA.backstage = {
    getSettings: loadSettings,
    setSettings(obj) { const s = Object.assign(loadSettings(), obj || {}); saveSettings(s); WA.emit('backstage:settings', s); },
    isRunning: () => !!currentTask,
    pending: () => pendingAnchor,

    requestSimulate(reason) {
      const st = loadSettings();
      if (!st.autoSimulate && reason === 'after-reply') return { ok: false, reason: 'auto-off' };
      if (st.simulationMode === 'manual' && reason === 'after-reply') return { ok: false, reason: 'manual-mode' };
      const anchor = latestAnchor();
      if (!anchor) return { ok: false, reason: 'no-chat' };
      if (currentTask) { pendingAnchor = { anchor, reason }; return { ok: true, queued: true }; }
      return this._start(anchor, reason);
    },

    /** 手动触发（绕过manual/auto限制） */
    forceSimulate() {
      const anchor = latestAnchor();
      if (!anchor) return { ok: false, reason: 'no-chat' };
      if (currentTask) { pendingAnchor = { anchor, reason: 'manual' }; return { ok: true, queued: true }; }
      return this._start(anchor, 'manual');
    },

    async _start(anchor, reason) {
      const id = ++taskSeq;
      const ac = new AbortController();
      currentTask = { id, ac, anchor, reason };
      WA.emit('backstage:started', { id, reason });
      try {
        // v0.8 账本存档点：推演前快照演化状态
        if (WA.ledger) WA.ledger.saveCheckpoint();
        const result = await this._runInference(anchor, ac.signal);
        if (ac.signal.aborted) return { ok: false, aborted: true };
        if (result) {
          // 字数限制截断（v0.5 limits引擎）
          const clamped = WA.limits ? WA.limits.clampBackstageResult(result) : result;
          const tx = WA.store.transact(draft => { this.applyResult(draft, clamped, anchor); });
          if (tx.ok) {
            WA.log('info', '世界推演结算完成 anchor=m' + anchor.idx);
            // v0.8 账本差分记录
            if (WA.ledger) WA.ledger.recordChanges();
          }
          else WA.log('error', '世界推演结算事务失败，未提交');
        }
        WA.emit('backstage:settled', { id, anchor });
        return { ok: true };
      } catch (e) {
        WA.log('error', '世界推演失败: ' + (e && e.message || e));
        return { ok: false, error: e };
      } finally {
        currentTask = null;
        if (pendingAnchor) { const p = pendingAnchor; pendingAnchor = null; this._start(p.anchor, p.reason || 'catch-up'); }
      }
    },

    abort() { if (currentTask) currentTask.ac.abort(); },

    // ════════════════════════════════════════════════════
    // 推演提示词（完整版）
    // ════════════════════════════════════════════════════
    buildPrompt(anchor, worldbookSection) {
      const st = loadSettings();
      const s = WA.store.get();
      const snap = compactState(s, st.npcBudget);
      // v0.8: 预设覆写（默认全null时使用内置段）
      const ov = WA.preset ? WA.preset.getSegmentOverrides() : {};
      const segEngineRole = ov['engine-role'] || '你是「世界背面」推演引擎：镜头之外，世界仍在继续。你不续写正文，只做世界结算。';
      const segReasoning = ov['reasoning'] || REASONING_PROTOCOL;
      const segOutFmt = ov['output-format'] || INJECTION_RULES;
      const segJsonNotes = ov['json-notes'] || '';
      // v0.8.3: 世界规则库（12模块铁律）——默认注入精简守则，全量模式注入完整规则
      const rulesBlock = WA.rules ? (st.fullRules ? WA.rules.getAll() : WA.rules.coreSummary()) : '';
      const sys = [
        segEngineRole,
        '',
        segReasoning,
        '',
        rulesBlock,
        '',
        VISIBILITY_SEMANTICS,
        '',
        STRUCTURAL_RULES,
        '',
        segOutFmt,
        '',
        SIM_MODES[st.simulationMode] || SIM_MODES.balanced,
        TIME_POLICIES[st.timePolicy] || TIME_POLICIES.cautious,
        PULSE_LEVELS[st.pulseActivity] || PULSE_LEVELS.normal,
        st.customInstruction ? '【用户自定义推演指令】' + st.customInstruction : '',
        '',
        '【输出契约】必须且只能回复一个JSON对象，结构：',
        '{',
        ' "clock": "新的世界时间标签(可空字符串表示不变)",',
        ' "world_pulse": {"pressure": 0-3, "trend": "rising|falling|steady", "note": "一句话"},',
        ' "worldFacts": [{"key":"...","value":"...","scope":"world|region|personal"}],',
        ' "people": [{"name":"...","location":"...","action":"...","intent":"...","body":"..."}],',
        ' "currents": [{"title":"...","summary":"...","visibility":"hidden|trace|known|direct","publicity":"private|trace|public","public_trace":"...","stage":"...","causes":[],"participants":[]}],',
        ' "knowledge_updates": [{"person":"...","about":"...","status":"fact|suspected","route":"witnessed|told|investigated|message|public_channel|inferred"}],',
        ' "echoes": [{"refCurrent":"事件标题","result":"...","exposure":"subtle|obvious"}],',
        ' "chronicle": [{"kind":"event|fact|pulse","title":"...","summary":"..."}],',
        ' "foreshadows": [{"id":"...","content":"...","status":"waiting|developing|triggered|recycled|dropped"}],',
        ' "factions": [{"name":"...","scope":"...","status":"鼎盛|稳固|倾轧|困顿|衰落|瓦解","relation":"血盟|盟友|友好|中立|冷淡|敌对|世仇","currentGoal":"...","core_person":"...","powerPillars":["..."]}],',
        ' "reputation": {"authority":"天怒人怨|声名狼藉|默默无闻|受人尊敬|万众敬仰","common":"...","shadow":"...","circuit":"...","lastChange":"..."},',
        ' "economy": {"climate":"繁荣|平稳|衰退|动荡","signals":[{"summary":"...","scope":"..."}]},',
        ' "winds": [{"topic":"...","type":"announcement|report|rumor|sentiment","level":1-4,"content":"...","scope":"...","source":"..."}],',
        ' "influenceChain": [{"trigger":"...","impact":"...","fallout":"..."}],',
        ' "enemies": [{"name":"...","reason":"...","type":"blood|grudge","status":"追踪中|策划中|执行中|已终结"}],',
        ' "blackbox": {"secretActions":[{"action":"...","witnesses":"..."}],"secretAssets":[{"name":"...","exposure":0-100,"status":"有效|过期|暴露|失效"}]},',
        ' "worldTrends": [{"name":"...","scope":"...","status":"持续中|已结束","description":"...","source":"..."}],',
        ' "regionalIncident": {"active":true,"title":"...","type":"bandit|plague|market|faction_clash|official|sect|infrastructure|ominous","scope":"...","impact":"..."}或null,',
         ' "distantEvent": {"type":"event|wind","title":"...","desc":"...","topic":"...","content":"...","level":1-5}或null,',
         ' "nearEvent": {"title":"...","desc":"...","urgent":true|false}或null,',
         ' "entities": {"organization":[{"name":"...","aliases":[],"desc":"..."}],"object":[],"ability":[],"location":[]}或省略,',
        ' "next_turn_injection": {"required":[],"conditional":[],"suppress":[]}',
        '}',
        '宁缺毋滥：无变化就给空数组。绝不代写玩家言行。绝不剧透suppress列内容。'
      ].filter(Boolean).join('\n');
      const user = [
        '【世界快照】' + JSON.stringify(snap),
        (worldbookSection || ''),
        (WA.regional ? (() => { const roll = WA.regional.roll(); return roll ? '\n' + roll.prompt : ''; })() : ''),
        (WA.horizon ? (() => { const block = WA.horizon.buildPromptBlock(); return block ? '\n' + block : ''; })() : ''),
        '【近期正文（最新锚点=m' + anchor.idx + '）】',
        recentText(8)
      ].join('\n');
      return [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ];
    },

    async _runInference(anchor, signal) {
      const cfg = WA.apiRouter.getChannel('inference');
      if (!cfg.baseUrl || !cfg.model) { WA.log('info', '推演通道未配置，跳过世界推演'); return null; }
      // v0.8: 世界书注入段（扫描文本=近期正文）
      let wbSection = '';
      if (WA.worldbook && WA.worldbook.hasSelection()) {
        try { wbSection = await WA.worldbook.buildPromptSection(recentText(8)); } catch (e) { WA.log('warn', '世界书段构建失败', e); }
      }
      const messages = this.buildPrompt(anchor, wbSection);
      return await WA.apiRouter.call('inference', messages, { json: true, signal, maxTokens: 5000, temperature: 0.6 });
    },

    // ════════════════════════════════════════════════════
    // 结算器（全量入账）
    // ════════════════════════════════════════════════════
    applyResult(draft, r, anchor) {
      const now = Date.now();
      const LIMITS = { people: 12, currents_new: 6, knowledge: 20, chronicle: 8, foreshadows: 5 };

      // 时钟
      if (r.clock && typeof r.clock === 'string' && r.clock.trim()) {
        draft.clock.label = r.clock.trim();
        draft.clock.source = 'engine';
      }

      // 世界脉搏
      if (r.world_pulse && typeof r.world_pulse === 'object') {
        draft.worldPulse = {
          pressure: Math.max(0, Math.min(3, r.world_pulse.pressure | 0)),
          trend: ['rising', 'falling', 'steady'].includes(r.world_pulse.trend) ? r.world_pulse.trend : 'steady',
          note: String(r.world_pulse.note || '').slice(0, 200),
          at: now
        };
      }

      // 世界事实（变更入纪事）
      (r.worldFacts || []).forEach(f => {
        if (!f || !f.key) return;
        const old = draft.worldFacts.find(x => x.key === f.key);
        if (old) {
          if (old.value !== f.value) {
            draft.chronicle.push({ id: 'chg' + now + Math.random().toString(36).slice(2, 5), kind: 'fact', title: f.key, summary: old.value + ' → ' + f.value, at: now });
            old.value = f.value; old.at = now;
          }
        } else {
          draft.worldFacts.push({ id: 'wf' + now + Math.random().toString(36).slice(2, 6), key: f.key, value: f.value, scope: f.scope || 'world', source: 'engine', at: now, branchId: anchor && anchor.idx });
        }
      });

      // 人物结算（上限）
      (r.people || []).slice(0, LIMITS.people).forEach(p => {
        if (!p || !p.name) return;
        const id = 'p_' + String(p.name);
        const old = draft.people[id] || { id, name: p.name, knowledge: {} };
        draft.people[id] = Object.assign(old, {
          location: p.location || old.location,
          action: p.action || old.action,
          intent: p.intent || old.intent,
          body: p.body || old.body,
          updatedAt: now
        });
      });

      // 认知边界入账（knowledge_updates，inferred只能suspected）
      (r.knowledge_updates || []).slice(0, LIMITS.knowledge).forEach(k => {
        if (!k || !k.person || !k.about) return;
        const id = 'p_' + String(k.person);
        const person = draft.people[id] = draft.people[id] || { id, name: k.person, knowledge: {} };
        person.knowledge = person.knowledge || {};
        const status = (k.route === 'inferred') ? 'suspected' : (k.status === 'fact' ? 'fact' : 'suspected');
        person.knowledge[String(k.about).slice(0, 80)] = { status, route: k.route || 'told', at: now };
        const keys = Object.keys(person.knowledge);
        if (keys.length > 30) { // 每人知识容量
          keys.sort((a, b) => (person.knowledge[a].at || 0) - (person.knowledge[b].at || 0));
          keys.slice(0, keys.length - 30).forEach(x => delete person.knowledge[x]);
        }
      });

      // 暗流（事件身份稳定：按标题匹配更新，不重建）
      let created = 0;
      (r.currents || []).forEach(c => {
        if (!c || !c.title) return;
        const old = draft.currents.find(x => x.title === c.title);
        if (old) {
          old.summary = c.summary || old.summary;
          old.stage = c.stage || old.stage;
          old.visibility = c.visibility || old.visibility;
          old.publicity = c.publicity || old.publicity || 'private';
          old.public_trace = c.public_trace || old.public_trace;
          old.updatedAt = now;
        } else if (created < LIMITS.currents_new) {
          created++;
          draft.currents.push({
            id: 'cu' + now + Math.random().toString(36).slice(2, 6),
            title: c.title, summary: c.summary || '',
            visibility: c.visibility || 'hidden',
            publicity: c.publicity || 'private',
            public_trace: c.public_trace || '',
            causes: c.causes || [], participants: c.participants || [],
            stage: c.stage || '发展', createdAt: now, updatedAt: now,
            branchId: anchor && anchor.idx
          });
        }
      });

      // 回声/纪事
      (r.echoes || []).forEach(e => {
        if (e && e.result) draft.echoes.push({ id: 'ec' + now + Math.random().toString(36).slice(2, 6), refCurrent: e.refCurrent || '', result: e.result, exposure: e.exposure || 'subtle', at: now });
      });
      (r.chronicle || []).slice(0, LIMITS.chronicle).forEach(c => {
        if (c && c.title) draft.chronicle.push({ id: 'ch' + now + Math.random().toString(36).slice(2, 6), kind: c.kind || 'event', title: c.title, summary: c.summary || '', at: now, refs: c.refs || [] });
      });

      // 伏笔生命周期
      (r.foreshadows || []).slice(0, LIMITS.foreshadows).forEach(f => {
        if (!f || !f.id) return;
        const old = (draft.memory.foreshadows || []).find(x => x.id === f.id);
        if (old) { old.status = f.status || old.status; old.content = f.content || old.content; }
        else (draft.memory.foreshadows = draft.memory.foreshadows || []).push({ id: f.id, content: f.content || '', status: f.status || 'waiting', links: f.links || [], at: now });
      });

      // 演化系统入账（势力/声誉/经济/风声/影响链）
      if (WA.evolution) {
        if (r.factions) WA.evolution.applyFactions(draft, r.factions);
        if (r.reputation) WA.evolution.applyReputation(draft, r.reputation);
        if (r.economy) WA.evolution.applyEconomy(draft, r.economy);
        if (r.influenceChain) WA.evolution.applyInfluenceChain(draft, r.influenceChain);
        (r.winds || []).slice(0, 4).forEach(w => {
          if (!w || !w.topic) return;
          draft.evolution.winds = draft.evolution.winds || [];
          const old = draft.evolution.winds.find(x => x.topic === w.topic);
          if (old) { old.content = w.content || old.content; old.level = Math.max(old.level || 1, w.level || 1); old.scope = w.scope || old.scope; old.quietRounds = 0; }
          else draft.evolution.winds.push({ id: 'w' + now + Math.random().toString(36).slice(2, 5), topic: w.topic, type: w.type || 'rumor', level: w.level || 1, content: w.content || '', scope: w.scope || '', source: w.source || '', quietRounds: 0 });
        });
      }
      // 仇敌/黑盒/天下大势入账
      if (WA.enemies) {
        if (r.enemies) WA.enemies.apply(draft, r.enemies);
        if (r.blackbox) WA.enemies.applyBlackbox(draft, r.blackbox);
        if (r.worldTrends) WA.enemies.applyWorldTrends(draft, r.worldTrends);
      }
      // 区域突发事件入账
      if (WA.regional && r.regionalIncident) WA.regional.applyIncident(draft, r.regionalIncident);
      // 实体记忆入账（v0.8 entities引擎）
      if (WA.entities && r.entities) WA.entities.applyEntities(draft, r.entities);
      // 远方/近端事件结果入账（v0.5 horizon引擎）
      if (WA.horizon) {
        if (r.distantEvent) WA.horizon.acceptResult('distant', r.distantEvent);
        if (r.nearEvent)    WA.horizon.acceptResult('near',    r.nearEvent);
      }
      // world_digest叙事生成（v0.5，结算后触发）
      if (WA.digest) WA.digest.generate();

      // next_turn_injection 持久化（before链读取）
      if (r.next_turn_injection && typeof r.next_turn_injection === 'object') {
        draft.nextTurnInjection = {
          required: (r.next_turn_injection.required || []).slice(0, 10),
          conditional: (r.next_turn_injection.conditional || []).slice(0, 10),
          suppress: (r.next_turn_injection.suppress || []).slice(0, 10),
          at: now, anchor: anchor && anchor.idx
        };
      }

      // 容量控制
      draft.echoes = draft.echoes.slice(-40);
      draft.chronicle = draft.chronicle.slice(-200);
      draft.worldFacts = draft.worldFacts.slice(-100);
      draft.currents = draft.currents.slice(-40);
    },

    /** before链：消费 next_turn_injection，生成连续性约束注入 */
    consumeInjection() {
      const s = WA.store.get();
      const nti = s.nextTurnInjection;
      if (!nti) return null;
      const parts = [];
      if (nti.required && nti.required.length) parts.push('本轮必须体现：' + nti.required.join('、'));
      if (nti.conditional && nti.conditional.length) parts.push('条件触发（玩家主动探查才暴露）：' + nti.conditional.join('、'));
      if (nti.suppress && nti.suppress.length) parts.push('本轮禁止暴露：' + nti.suppress.join('、'));
      if (!parts.length) return null;
      return '<world_axis_continuity>\n【世界连续性约束】\n' + parts.join('\n') + '\n</world_axis_continuity>';
    },

    /** 清空已消费的注入（生成后调用，避免重复注入） */
    clearInjection() {
      WA.store.transact(draft => { draft.nextTurnInjection = null; });
    }
  };

  // ── 工作流节点注册 ──
  WA.workflow.register({
    id: 'backstage.continuity', chain: 'before', order: 8, critical: false,
    label: '世界连续性约束注入',
    async run(ctx) {
      const block = WA.backstage.consumeInjection();
      if (block) {
        ctx.injections.push({ source: '连续性约束', position: 'after_last_user', depth: 0, content: block });
        WA.backstage.clearInjection(); // 一次性消费
      }
    }
  });

  WA.workflow.register({
    id: 'backstage.simulate', chain: 'after', order: 20, critical: false,
    label: '世界推演（后台）',
    async run(ctx) { WA.backstage.requestSimulate('after-reply'); }
  });
})();
