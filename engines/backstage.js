/**
 * WorldAxis engines/backstage.js (v0.2 完整版)
 * 世界演算底座：后台世界推演 + 认知边界协议 + 双轴可见性 + 世界脉搏 + 三列注入引用
 * 移植自 world-backstage：buildSimulationPrompt / WORLD_BACKSTAGE_CORE_REASONING_PROTOCOL / 结算器
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_SETTINGS = 'worldaxis_backstage_settings_v1';
  // v1.0.0: 人物容器容量（与 __BOUNDED_CAPS['people'] 登记同源）
  const PEOPLE_CAP = 48;
  // v1.2.0: 终态容器回收——带终态语义的容器此前只做「按数组位置的环形截断」，
  // 已终结条目永驻占位、把长期活跃条目挤出（与 events/worldTrends 的 v0.6.0 终态回收同构缺失）。
  const CURRENT_TERMINAL_STAGES = ['已结束', 'closed'];   // 与快照过滤口径同源（buildSimulationPrompt）
  const FS_TERMINAL_STATUSES = ['recycled', 'dropped'];   // 伏笔终态（已回收/已放弃）
  const FS_CAP = 30;                                       // 与 __BOUNDED_CAPS['memory.foreshadows'] 登记同源

  // v1.1.0: 别名并集去重（人设载体贯通——AI 多次返回别名时累积）
  function unionAliases(a, b) {
    const out = [];
    const seen = new Set();
    [].concat(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []).forEach(function (x) {
      const v = String(x == null ? '' : x).trim();
      if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    });
    return out;
  }

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
  const __REG_B = { key: LS_SETTINGS, def: {
            simulationMode: 'balanced',   // light|balanced|deep|manual
            timePolicy: 'cautious',       // explicit|cautious|open|world
            pulseActivity: 'normal',      // quiet|normal|turbulent
            npcBudget: 8,                 // 单轮推演最多结算NPC数
            autoSimulate: true,           // after_reply 自动推演
            fullRules: false,             // v0.8.3: true=注入12模块完整规则全文, false=精简守则
            injectBudget: -1,             // v0.9.4: 注入预算；-1=自动(按上下文窗口6%)，0=不限，正数=手动上限
            memSamplerLimit: 8,            // v0.9.9: 主观记忆每轮注入采样上限
            memSamplerDice: 10000,         // v0.9.9: 采样骰子面数（1000-10000，越大越平滑）
            memSamplerRelevance: 'on',   // v0.9.9: 上下文相关召回 on/off
            customInstruction: '',        // 用户自定义推演指令（追加到系统提示）
            // v2.11.0（面C · 声明缺失修复）: 以下 4 个子键**一直被子系统读取**，却从未进 def：
            //   · proactive      ← engines/proactive.js `settings().proactive !== false`（主动拉动总开关）
            //   · wbInject       ← engines/wb-inject.js  `s.wbInject !== false`（世界书变量镜像总开关）
            //   · wbWorldbookName← 镜像目标世界书名
            //   · wbAutoEnsure   ← 是否自动补建配套世界书条目
            //   后果（三重）：① 子键补齐/声明完备性检查**看不见它们**，「这条配置从哪来」无从回答；
            //   ② 任何写入它们的路径都会新造 def 之外子键（v2.6.0 治的正是这个增量死键源头）；
            //   ③ `verifyDefaults` 拿磁盘值与 def 比对时，这 4 个键必被报成「声明与存量不符」——
            //   一个**永远为真**的告警，读的人会逐渐无视整个校验器（这才是最贵的损失）。
            //   默认值与各自消费端的语义逐字对齐（均「默认开」，故写 true）。
            proactive: true,
            wbInject: true,
            wbWorldbookName: '',
            wbAutoEnsure: false
          },
          // v2.7.0（收口）: 区间与枚举声明上收到登记表——此前这些合法范围**只存在于设置页的
          //   `<input min max>` 与 `<select>` 选项里**，引擎一侧承认的只有少数几个（且分散）：
          //     · npcBudget 全库零夹取 —— 填 -5 会让 `sorted.slice(0, -5)` 返回**空数组**，
          //       NPC 一个都不结算，而界面照显「-5」且无任何提示（静默失效，最难查的一类）；
          //     · memSamplerLimit / memSamplerDice 的区间常量住在**另一个文件**
          //       （engines/memory-sampler.js 的 MIN_LIMIT/MIN_SIDES），声明与消费跨文件——
          //       改一处忘一处就是「滑块能拖到的值被引擎夹掉」；
          //     · injectBudget 是三态值（-1 自动 / 0 不限 / 正数手动），**不是**普通区间 ——
          //       直接按区间夹取会把「自动档」变成「手动 200t」（静默改变用户意图），
          //       故它只声明哨兵（见下方 sentinels），正数部分原样透传。
          //   声明收到此处后，UI 与引擎取同一份（`WA.settingsBus.boundsOf(key)`）。
          bounds: { npcBudget: [1, 16], memSamplerLimit: [1, 30], memSamplerDice: [1000, 10000] },
          //   injectBudget 刻意**不声明区间**：它是三态值（-1 自动 / 0 不限 / 正数手动），
          //   而「正数」的合法域在 UI 上是 200-6000——但引擎与既有测试都用过 60/80 这类小值
          //   来表达「极紧的预算」并断言落盘值等于该值。若在此声明 [200,6000]，那些写入会被
          //   静默改成 200，等于**在写路径上改动调用方语义**，与「归一不是猜用户想要什么」相悖。
          //   故只声明哨兵（-1/0 原样保留），正数原样透传 —— 归一只收窄「已确认是契约」的域。
          sentinels: { injectBudget: [-1, 0] },
          enums: {
            simulationMode: ['light', 'balanced', 'deep', 'manual'],
            timePolicy: ['explicit', 'cautious', 'open', 'world'],
            pulseActivity: ['quiet', 'normal', 'turbulent'],
            memSamplerRelevance: ['on', 'off']
          },
          module: 'backstage' };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG_B]);
  function loadSettings() { return WA.settingsBus.read(__REG_B); }
  // v2.6.0: 走 saveOrThrow 以便回传失败原因（save() 的布尔不足以说明「为什么没落盘」）
  function saveSettings(s) { return WA.settingsBus.saveOrThrow(__REG_B, s); }

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
  // v0.9.0: 分支标识统一构造——worldFacts/currents 的 branchId 存「分支标识」（m{idx}_s{swipe}，
  // 与 store.currentBranchId() 同构），而非裸楼层号。旧实现仅存 anchor.idx，命名-语义错位。
  function anchorBranchId(anchor) {
    if (!anchor || typeof anchor.idx !== 'number') return '';
    return 'm' + anchor.idx + '_s' + (anchor.swipe || 0);
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

  // v2.2.0: 事件链入账计量——「推演说要发生的事件」是否真进了 state，此前完全不可观测
  //   （applyResult 对 events_create/events_update 零消费，整条链静默丢弃）
  const __applyStat = { eventsCreated: 0, eventsUpdated: 0, eventsLoose: 0, lastAt: 0 };
  const backstage = WA.backstage = {
    getSettings: loadSettings,
    // v2.6.0: 回传写入结果——面板据此区分「真保存」与「被环境吞掉」，不再无条件报成功。
    // v2.7.0: 落盘前先归一（`settingsBus.normalize`）——区间/枚举的声明已在 __REG_B 上，
    //   写进去的就是界面显示的那份，不再有「磁盘 -5、引擎按 1 算」的隐性第二套值。
    setSettings(obj) {
      const s = WA.settingsBus.normalize(__REG_B, Object.assign(loadSettings(), obj || {}));
      const w = saveSettings(s); WA.emit('backstage:settings', s); return w;
    },
    isRunning: () => !!currentTask,
    pending: () => pendingAnchor,

    requestSimulate(reason) {
      const st = loadSettings();
      // v2.4.0: 布尔配置归一化。此前 `!st.autoSimulate` 把 undefined（旧存档缺该子键）
      //   与字符串 'false' 一并判为「关」，自动推演被静默关停且用户看不到任何开关变化。
      //   回落值取登记 def（单一真源），不在此另写一份默认值。
      if (!WA.settingsBus.toBool(st.autoSimulate, __REG_B.def.autoSimulate) && reason === 'after-reply') return { ok: false, reason: 'auto-off' };
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
        ' "events_create": [{"title":"事件名≤30字","type":"conflict|progress","level":1-4,"desc":"≤50字"}],',
        ' "events_update": [{"title":"要更新的已有事件名（改名不换链）","name":"改名后的新名（可选）","stage":"该类型合法阶段","desc":"≤50字","stall":true|false,"stallReason":"停滞原因"}],',
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
      const now = clockNow('backstage');
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
            draft.chronicle.push({ id: WA.rand.id('chg', 3, 'id'), kind: 'fact', title: f.key, summary: old.value + ' → ' + f.value, at: now });
            old.value = f.value; old.at = now;
          }
        } else {
          draft.worldFacts.push({ id: WA.rand.id('wf', 4, 'id'), key: f.key, value: f.value, scope: f.scope || 'world', source: 'engine', at: now, branchId: anchorBranchId(anchor) });
        }
      });

      // 人物结算（上限）
      (r.people || []).slice(0, LIMITS.people).forEach(p => {
        if (!p || !p.name) return;
        const id = 'p_' + String(p.name);
        const old = draft.people[id] || { id, name: p.name, knowledge: {} };
        // v1.1.0: 人设载体贯通——补齐 schema 声明但此前未入账的字段（AI 未给则保留旧值）
        const mergedAliases = unionAliases(old.aliases, p.aliases);
        draft.people[id] = Object.assign(old, {
          location: p.location || old.location,
          action: p.action || old.action,
          intent: p.intent || old.intent,
          body: p.body || old.body,
          avatar: p.avatar || old.avatar,
          resources: p.resources || old.resources,
          personalityAnchor: p.personalityAnchor || old.personalityAnchor,
          speakingStyle: p.speakingStyle || old.speakingStyle,
          behaviorBoundaries: p.behaviorBoundaries || old.behaviorBoundaries,
          innerVoice: p.innerVoice || old.innerVoice,
          updatedAt: now
        });
        if (mergedAliases.length) draft.people[id].aliases = mergedAliases;
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
          // v2.13.0: 认知边界对象型挤出走单一出口（此前静默删除「这个人知道的事」最早条目）
          if (WA.evict) WA.evict.object(person.knowledge, 'people.knowledge', keys);
          else keys.slice(0, keys.length - 30).forEach(x => delete person.knowledge[x]);
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
            id: WA.rand.id('cu', 4, 'id'),
            title: c.title, summary: c.summary || '',
            visibility: c.visibility || 'hidden',
            publicity: c.publicity || 'private',
            public_trace: c.public_trace || '',
            causes: c.causes || [], participants: c.participants || [],
            stage: c.stage || '发展', createdAt: now, updatedAt: now,
            branchId: anchorBranchId(anchor)
          });
        }
      });

      // 回声/纪事
      (r.echoes || []).forEach(e => {
        if (!e || !e.result) return;
        const ecTitle = String(e.refCurrent || '');
        // v0.9.0: 软引用生产方——记录入账时目标暗流是否在场（danglingAtWrite），
        // 区分「AI幻觉/数据损坏（入账即悬空，可检出）」与「暗流正常生命周期消失（入账后裁剪/终局，不告警）」。
        const ecDangling = ecTitle ? !(Array.isArray(draft.currents) ? draft.currents : []).some(c => c && c.title === ecTitle) : false;
        draft.echoes.push({ id: WA.rand.id('ec', 4, 'id'), refCurrent: ecTitle, result: e.result, exposure: e.exposure || 'subtle', danglingAtWrite: ecDangling, at: now });
      });
      (r.chronicle || []).slice(0, LIMITS.chronicle).forEach(c => {
        if (!c || !c.title) return;
        // v0.9.0: 纪事来源引用生产方——AI schema 无 refs 字段时锚定结算楼层溯源（可审计）
        const cRefs = (Array.isArray(c.refs) && c.refs.length)
          ? c.refs
          : ((WA.timeline && WA.timeline.captureRange) ? WA.timeline.captureRange(Math.max(0, (anchor && anchor.idx) || 0), (anchor && anchor.idx) || 0) : []);
        draft.chronicle.push({ id: WA.rand.id('ch', 4, 'id'), kind: c.kind || 'event', title: c.title, summary: c.summary || '', at: now, refs: cRefs });
      });

      // 伏笔生命周期
      (r.foreshadows || []).slice(0, LIMITS.foreshadows).forEach(f => {
        if (!f || !f.id) return;
        const old = (draft.memory.foreshadows || []).find(x => x.id === f.id);
        // v0.8.0: 伏笔 links 生产方补齐——推演结果未给 links 时捕获当前楼层溯源
        const links = (Array.isArray(f.links) && f.links.length)
          ? f.links
          : ((WA.timeline && WA.timeline.captureRange) ? WA.timeline.captureRange(Math.max(0, (anchor && anchor.idx) || 0), (anchor && anchor.idx) || 0) : []);
        if (old) {
          old.status = f.status || old.status; old.content = f.content || old.content;
          if (links.length) old.links = WA.timeline && WA.timeline.unionRefs ? WA.timeline.unionRefs([old.links || [], links]) : (old.links || []).concat(links);
        }
        else (draft.memory.foreshadows = draft.memory.foreshadows || []).push({ id: f.id, content: f.content || '', status: f.status || 'waiting', links, at: now });
      });

      // v2.2.0: 推演事件链入账 —— 此前 events_create / events_update 被完全丢弃：
      //   提示词要求 AI 输出它们、limits 为它们写了截断与「改名不换链/type禁改」稳定契约，
      //   但 applyResult 没有消费端 → AI 宣告的「将要发生的事件」全部消失，
      //   「世界在自己运转」这一核心能力断链且不可观测。
      //   复用 limits 契约（locateStable 定位 / applyStableUpdate 稳定写），避免第二套实现漂移。
      if (Array.isArray(r.events_create) && r.events_create.length) {
        draft.evolution.events = draft.evolution.events || [];
        const evArr = draft.evolution.events;
        const TERM_OF = (WA.editorEvents && WA.editorEvents.TERMINAL) || {};
        const evMax = (WA.editorEvents && WA.editorEvents.MAX_EVENTS) || 16;
        r.events_create.slice(0, 6).forEach(function (e) {
          if (!e) return;
          const name = String(e.title || e.name || '').trim().slice(0, 30);
          if (!name) return;
          if (evArr.some(function (x) { return x && x.name === name; })) return; // 同名归并（推演侧契约）
          while (evArr.length >= evMax) {
            // 挤出优先级与 evolution.addEvent 一致：终局 > 最早
            let ix = evArr.findIndex(function (x) { return x && (TERM_OF[x.type] || []).includes(x.stage); });
            if (ix < 0) ix = 0;
            evArr.splice(ix, 1);
          }
          const stages = (WA.editorEvents && WA.editorEvents.stagesOf) ? WA.editorEvents.stagesOf(e.type) : null;
          const type = (e.type === 'progress') ? 'progress' : 'conflict';
          const fallback = type === 'progress' ? ['筹备', '执行', '关键', '已完成', '已失败'] : ['萌芽', '发酵', '逼近', '已爆发', '已消散'];
          const useStages = stages || fallback;
          const stage = (e.stage && useStages.indexOf(e.stage) >= 0) ? e.stage : useStages[0];
          evArr.push({
            id: WA.rand.id('ev', 4, 'id'),
            // title 与 name 双写：limits.locateStable 按 title 匹配（「改名不换链」契约），
            // 而编辑器/推演读的是 name —— 只写其一会让 events_update 永远匹配不上（静默失效）。
            title: name, type: type, name: name, level: Math.max(1, Math.min(4, Number(e.level) || 1)),
            stage: stage, stageRound: 1, desc: String(e.desc || '').slice(0, 50),
            stall: false, consecutiveFails: 0, createdRound: (draft.evolution && draft.evolution.round) || 0,
            source: 'backstage', at: now
          });
          __applyStat.eventsCreated++;
        });
        __applyStat.lastAt = now;
      }
      if (Array.isArray(r.events_update) && r.events_update.length) {
        draft.evolution.events = draft.evolution.events || [];
        const evArr = draft.evolution.events;
        r.events_update.slice(0, 10).forEach(function (u) {
          if (!u) return;
          const upd = Object.assign({}, u, { title: u.title || u.name });
          let hit = -1;
          if (WA.limits && WA.limits.locateStable) hit = WA.limits.locateStable(evArr, upd).idx;
          if (hit < 0) {
            // 兜底按引用名匹配：u.title 是「指向哪个已有事件」的引用（约定），u.name 才是新名字——
            // state 里可能只有 name（limits.locateStable 只认 title），只写其一即断链。
            const want = String(u.title || u.name || '').trim();
            if (want) hit = evArr.findIndex(function (x) { return x && (x.name === want || x.title === want); });
          }
          if (hit < 0 || !evArr[hit]) { __applyStat.eventsLoose++; return; }   // 无对应事件：计数不臆造
          if (WA.limits && WA.limits.applyStableUpdate) {
            WA.limits.applyStableUpdate(evArr[hit], upd);
          } else {
            Object.keys(u).forEach(function (k) { if (k !== 'id' && k !== 'type' && u[k] !== undefined) evArr[hit][k] = u[k]; });
          }
          __applyStat.eventsUpdated++;
        });
        __applyStat.lastAt = now;
      }

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
          else draft.evolution.winds.push({ id: WA.rand.id('w', 3, 'id'), topic: w.topic, type: w.type || 'rumor', level: w.level || 1, content: w.content || '', scope: w.scope || '', source: w.source || '', quietRounds: 0 });
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
      // v2.13.0: 四处截断改走挤出侧单一出口——此前是静默破坏性丢弃，
      //   用户「我的编年史/事实怎么少了」在面板与诊断上完全没有出口。cap 来自 evict.SITES 单一真源。
      if (WA.evict) {
        WA.evict.array(draft.echoes, 'backstage.echoes');
        WA.evict.array(draft.chronicle, 'backstage.chronicle');
        WA.evict.array(draft.worldFacts, 'backstage.worldFacts');
      } else {
        draft.echoes = draft.echoes.slice(-40);
        draft.chronicle = draft.chronicle.slice(-200);
        draft.worldFacts = draft.worldFacts.slice(-100);
      }
      // v1.2.0: 终态暗流回收——stage 已结束/closed 的暗流正文触面已由 echoes 承载，
      // 本体永驻会挤出长期活跃暗流（探针实证活跃暗流被 34 条终态暗流挤出）。回收先于截断。
      const curArr = draft.currents = draft.currents || [];
      for (let i = curArr.length - 1; i >= 0; i--) {
        if (curArr[i] && CURRENT_TERMINAL_STAGES.indexOf(curArr[i].stage) >= 0) curArr.splice(i, 1);
      }
      draft.currents = WA.evict ? (WA.evict.array(curArr, 'backstage.currents'), curArr) : curArr.slice(-40);
      // v1.2.0: 伏笔终态回收——已回收/已放弃（recycled/dropped）语义上已终止，
      // 其信息在回收时点已被剧情消化；本体永驻会挤出活跃伏笔（探针实证活跃伏笔被 29 条终态伏笔挤出）。
      // 单一实现 WA.memory.pruneForeshadows（与 memory.js 巩固路径同口径，防两处漂移）。
      const fsArr = (draft.memory && draft.memory.foreshadows) || [];
      if (WA.memory && WA.memory.pruneForeshadows) WA.memory.pruneForeshadows(fsArr);
      else {
        for (let i = fsArr.length - 1; i >= 0; i--) {
          if (fsArr[i] && FS_TERMINAL_STATUSES.indexOf(fsArr[i].status) >= 0) fsArr.splice(i, 1);
        }
        if (WA.evict) WA.evict.array(fsArr, 'memory.foreshadows');
        else if (fsArr.length > FS_CAP) fsArr.splice(0, fsArr.length - FS_CAP);
      }
      // v0.6.0: 演化容器容量治理——
      // ① 终局事件回收：终局即剧情已完结，正文触面已由 echoes 承载；快照此前只做呈现过滤，
      //    本体永驻会让长局 events 无限膨胀（探针实证 10 个终局全部留存）。回收前信息已入 chronicle。
      if (WA.evolution) {
        const evArr = draft.evolution.events = draft.evolution.events || [];
        for (let i = evArr.length - 1; i >= 0; i--) {
          const ev = evArr[i];
          if (!ev) continue;
          const term = (WA.editorEvents && WA.editorEvents.TERMINAL && WA.editorEvents.TERMINAL[ev.type]) || [];
          if (term.includes(ev.stage)) evArr.splice(i, 1);
        }
        // ② 有机容器环形 cap（与编辑器容量一致；挤出最早创建，不阻塞入账）
        // v2.13.0: 改走挤出侧单一出口（cap 与 editorEvents/editorFaction/MAX_WINDS 同源，见 evict.SITES）
        const evMax = (WA.editorEvents && WA.editorEvents.MAX_EVENTS) || 16;
        if (WA.evict) WA.evict.array(evArr, 'evolution.events'); else if (evArr.length > evMax) evArr.splice(0, evArr.length - evMax);
        const faArr = draft.evolution.factions = draft.evolution.factions || [];
        const faMax = (WA.editorFaction && WA.editorFaction.MAX_FACTIONS) || 16;
        if (WA.evict) WA.evict.array(faArr, 'evolution.factions'); else if (faArr.length > faMax) faArr.splice(0, faArr.length - faMax);
        // ③ 风声兜底 cap（衰减引擎是常态收敛，单源 MAX_WINDS 防漂移）
        const wArr = draft.evolution.winds = draft.evolution.winds || [];
        const wMax = WA.evolution.MAX_WINDS || 12;
        if (WA.evict) WA.evict.array(wArr, 'evolution.winds'); else if (wArr.length > wMax) wArr.splice(0, wArr.length - wMax);
        // ④ 天下大势：终态已结束的从本体回收（快照/注入均按「持续中」过滤，本体留存只占容量）
        const wtArr = draft.evolution.worldTrends = draft.evolution.worldTrends || [];
        for (let i = wtArr.length - 1; i >= 0; i--) {
          if (wtArr[i] && wtArr[i].status === '已结束') wtArr.splice(i, 1);
        }
        if (WA.evict) WA.evict.array(wtArr, 'evolution.worldTrends'); else if (wtArr.length > 12) wtArr.splice(0, wtArr.length - 12);
      }
      // v1.0.0: 人物容器容量治理（对象型）——此前 people 无人数上限，长局 NPC 无界膨胀；
      // 按 updatedAt 最旧优先挤出（保留近期活跃者），日志留痕。cap 与登记表同源 PEOPLE_CAP。
      if (draft.people && typeof draft.people === 'object') {
        const pKeys = Object.keys(draft.people);
        if (pKeys.length > PEOPLE_CAP) {
          pKeys.sort((a, b) => ((draft.people[a] && draft.people[a].updatedAt) || 0) - ((draft.people[b] && draft.people[b].updatedAt) || 0));
          // v2.13.0: 挤出侧单一出口——对象型容器同样须记账（「挤出长期未更新 NPC」此前只留日志）
          if (WA.evict) {
            const rEvP = WA.evict.object(draft.people, 'people', pKeys);
            if (rEvP.ok && rEvP.dropped) WA.log('info', '人物容量治理：挤出 ' + rEvP.dropped + ' 个长期未更新 NPC（上限 ' + PEOPLE_CAP + '）');
          } else {
            pKeys.slice(0, pKeys.length - PEOPLE_CAP).forEach(k => {
              const pname = draft.people[k] && draft.people[k].name;
              delete draft.people[k];
              WA.log('info', '人物容量治理：挤出长期未更新 NPC ' + (pname || k));
            });
          }
        }
      }
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

    /** v2.2.0: 推演入账计量只读视图（诊断/面板消费）——入账链是否真的在跑，此前不可观测 */
    applyStat() {
      return { eventsCreated: __applyStat.eventsCreated, eventsUpdated: __applyStat.eventsUpdated, eventsLoose: __applyStat.eventsLoose, lastAt: __applyStat.lastAt };
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
