/**
 * WorldAxis engines/style.js (v2.51.0) — 叙事工艺设置面（纯只读引擎 + 受控写设置）
 *
 * 缝合来源：LoreFrame v1.5.4D（拟界文库）的四轴设置面 —— 压缩口径（原文 25 段命令压成 5 轴档位表）。
 *
 * 为什么要有这个文件（而不是把约束散在提示词里）：
 *   v2.51.0 面 1a 往 engines/rules.js 缝了 `craft` 模块，其正文写着
 *   「叙事工艺按设置面口径执行（字数/段落/视角/人称/转述/演绎）；未开启时不额外约束」。
 *   而**那个设置面根本不存在** —— 全库没有任何地方能"开启"它，也没有任何地方产出这段文本。
 *   这正是本仓库的招牌缺陷形态：声明了消费口径、却没有产生方（同族：v2.49.0 的主块账零读点、
 *   v2.50.0 的 modal 表零读点）。本文件补上唯一产生方。
 *
 * 五轴（全部默认 off = buildBlock() 返回空串 = 零 token 占用，与 craft 的"未开启时不额外约束"严格对齐）：
 *   ① paragraphStyle 段落节奏：free / short / medium / long
 *   ② perspective    叙事视角：第三人称全知 / 第三人称有限 / 第一人称有限 / 飘浮人称
 *   ③ userPronoun    对 user 的人称：第三人称 / 第二人称 / 第一人称 / 飘浮
 *   ④ takeover       演绎授权：closed 绝对旁观 / half_open 只代写动作 / assist 补细节 / open 完全代写
 *   ⑤ narrate        转述授权：closed 禁复读 / light / balanced / open
 *   另有 block 总开关（'off' 时整块不注入）与 custom 附加段（≤500 字）。
 *
 * 纪律（与仓库既有契约一致）：
 *   · 读路径：磁盘值非法（旧版残留 / 手改 / 结构不认）→ 回落该轴默认**并记账**
 *     （styleStat().fallbacks 与 lastFallback），绝不静默 —— 「配置读坏了」与「用户从未配置」
 *     必须可分辨（同 v2.11.0 读侧三面口径）。
 *   · 写路径：非法档位**显式拒绝**（{ok:false, reason:'bad-value', bad:[…]}）且**不写盘**，
 *     不静默改写用户输入（同 v2.14.0「非法参数不静默」）。
 *   · 不写 store、不进存档：设置走 settingsBus（与仓库其余设定同源、同治理）。
 *   · 本模块不渲染、不注入 —— 注入由 render/inject.js 消费 buildBlock()（单一消费方）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。本模块只产生**测量时间**（台账时间戳），不产生决策时间。
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const KEY = 'worldaxis_style_v1';
  const CUSTOM_MAX = 500;

  /** 轴的规范顺序（buildBlock 按此顺序渲染，保证产物逐字确定） */
  const AXES = ['block', 'paragraphStyle', 'perspective', 'userPronoun', 'takeover', 'narrate', 'custom'];
  /** 档位表：**判定表**（消费方只认这里的值；'off' 一律表示"该轴不注入"） */
  const CHOICES = {
    block: ['on', 'off'],
    paragraphStyle: ['off', 'free', 'short', 'medium', 'long'],
    perspective: ['off', 'third_person_omniscient', 'third_person_limited', 'first_person_limited', 'floating_person'],
    userPronoun: ['off', 'third_person', 'second_person', 'first_person', 'floating_person'],
    takeover: ['off', 'closed', 'half_open', 'assist', 'open'],
    narrate: ['off', 'closed', 'light', 'balanced', 'open']
  };
  /** 默认值：除总开关外全部 off ⇒ 默认产物为空串（不烧 token） */
  const DEFAULTS = { block: 'on', paragraphStyle: 'off', perspective: 'off', userPronoun: 'off', takeover: 'off', narrate: 'off', custom: '' };

  const AXIS_LABELS = {
    block: '叙事工艺块', paragraphStyle: '段落节奏', perspective: '叙事视角',
    userPronoun: '对玩家角色的人称', takeover: '演绎授权', narrate: '转述授权', custom: '附加工艺要求'
  };
  /** 档位中文名（面板/诊断展示用；与 CHOICES 同源，键名写错会在 styleStat().label 暴露为 key 本身） */
  const CHOICE_LABELS = {
    off: '不设定', on: '启用',
    free: '自由', short: '短段', medium: '中段', long: '长段',
    third_person_omniscient: '第三人称全知', third_person_limited: '第三人称有限',
    first_person_limited: '第一人称有限', floating_person: '飘浮',
    third_person: '第三人称', second_person: '第二人称', first_person: '第一人称',
    closed: '关闭', half_open: '半开', assist: '辅助', open: '开放'
  };

  // ── 五轴正文（压缩自 LoreFrame 原文，去掉了原文里的 <user_input>/{{lastUserMessage}} 模板变量——
  //    那属于宿主宏面的东西，本引擎不替换宏，写进去只会原样泄露给模型）──
  const PARA_TEXT = {
    free: '[段落节奏·自由]\n- 长短错落、制造呼吸感，单段 180-400 字之间动态波动\n- 对话可短脆、描写须深邃；不套单一模板\n- 禁止高频换行，禁止把对话/动作/心理切成零散碎段',
    short: '[段落节奏·短段]\n- 紧凑推进、保留清晰节拍，单段 90-180 字\n- 短而完整：每段至少一个明确事件点或情绪变化\n- 禁止口水化断句，禁止连续超短句堆叠',
    medium: '[段落节奏·中段]\n- 均衡段落、兼顾阅读节奏与信息密度，单段 180-320 字\n- 每段至少覆盖一条完整动作链或情绪链，段内保持因果衔接\n- 禁止高频空行，禁止把描述切成机械句群',
    long: '[段落节奏·长段]\n- 沉浸式长段落、拒绝碎片化换行，单段 250-600 字\n- 把对话/动作/环境/心理整合为高密度完整段，形成连续推进的叙事块\n- 禁止一两句就换段，禁止把同一场景拆成流水账短句'
  };
  const PERSP_TEXT = {
    third_person_omniscient: '[叙事视角·第三人称全知]\n- 以全知第三人称叙事\n- 可在出场的非玩家人物视角之间切换',
    third_person_limited: '[叙事视角·第三人称有限]\n- 以角色的限定第三人称（他/她/角色名）叙事，每个场景只展现该角色所见所思\n- 可在出场的非玩家人物视角之间切换',
    first_person_limited: '[叙事视角·第一人称有限]\n- 以角色的第一人称「我」叙事，可在出场的非玩家人物视角之间切换',
    floating_person: '[叙事视角·飘浮人称]\n- 允许按场景张力、心理距离与信息需求，在第一人称有限/第三人称有限/第三人称全知之间自然切换\n- 同一句与同一段之内人称必须稳定，不得在同一句里来回漂移，切换须顺滑可读'
  };
  const PRON_TEXT = {
    third_person: '[玩家角色人称·第三人称]\n- 始终以第三人称（他/她/姓名）指代玩家角色，绝对禁止使用「你」\n- 把自己定位为叙述者，而不是与玩家对话的人',
    second_person: '[玩家角色人称·第二人称]\n- 始终以第二人称「你」指代玩家角色；其与角色共同行动时用「你们」',
    first_person: '[玩家角色人称·第一人称]\n- 始终以第一人称「我」指代玩家角色',
    floating_person: '[玩家角色人称·飘浮人称]\n- 允许按叙事距离与语境，在第一人称「我」/第二人称「你」/第三人称（他/她/姓名）之间灵活选择指代玩家角色\n- 同一句与同一小段内必须保持一致，切换须自然清晰，禁止无意义频繁跳变'
  };
  const TAKEOVER_TEXT = {
    closed: '[演绎玩家角色·关闭]\n- 绝对旁观：你丧失对玩家角色的一切控制权\n- 禁止描写、引用、概括玩家角色的对话、动作、心理、立场与决策\n- 只扮演其他角色与 NPC',
    half_open: '[演绎玩家角色·只代写动作]\n- 动作代理：可代写玩家角色 3-4 个连贯的、纯粹的动作描写\n- 绝对禁止代写其对话、内心独白或语气词',
    assist: '[演绎玩家角色·补全细节]\n- 动作补全器：在不夺走控制权的前提下，可补 1-2 个与当前语义直接相关的动作或状态细节\n- 禁止代写其核心决策、立场与完整对话；补充必须短、准、贴合上下文，不喧宾夺主',
    open: '[演绎玩家角色·完全代写]（用户已在设置面显式授权）\n- 以玩家角色的视角与人设，为其撰写接下来完整的对话与伴随动作，自然推动剧情\n- 代写须贴合其既有设定，不得借代写改变其立场或注入其不可能知道的信息'
  };
  const NARRATE_TEXT = {
    closed: '[转述玩家输入·禁止]\n- 绝不引用、重复或概括玩家角色的上文输入；直接承接语义，零延迟进入其他角色与 NPC 的即时反应与情节推进',
    light: '[转述玩家输入·轻度]\n- 仅在必要时用极短提示承接其语义；默认直接推进 NPC 反应与剧情发展，避免显性复述原话',
    balanced: '[转述玩家输入·平衡]\n- 可转述其输入的核心信息，但必须先压缩再融入场景：优先保留意图、情绪、结果\n- 避免逐句复读与同义改写堆叠',
    open: '[转述玩家输入·开放]\n- 将其对话内容完整且无缝地融入叙事描写，使其成为场景互动的一部分\n- 严禁完全重复原对话'
  };

  // ── 设置登记（settingsBus 单一读写信道；多子键 def 供缺子键自愈）──
  const __REG = { key: KEY, def: { block: 'on', paragraphStyle: 'off', perspective: 'off', userPronoun: 'off', takeover: 'off', narrate: 'off', custom: '' }, module: 'style' };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const __stat = { reads: 0, fallbacks: 0, lastFallback: null, writes: 0, rejects: 0, lastReject: null, builds: 0, emptyBuilds: 0, lastLen: 0, lastAt: 0 };

  /** 归一化单轴：非法值回落默认**并记账**（静默回落是「配置读坏了查不出来」的成因） */
  function normAxis(axis, v) {
    if (CHOICES[axis].indexOf(v) >= 0) return v;
    __stat.fallbacks++;
    __stat.lastFallback = { axis: axis, got: (v === undefined ? null : String(v)), to: DEFAULTS[axis], at: clockWall() };
    return DEFAULTS[axis];
  }
  /** 归一化整份设置（不改计数；styleStat/summaryText 走它，避免诊断读把 reads 计量灌水） */
  function readNormalized() {
    const raw = WA.settingsBus.read(__REG) || {};
    const out = {};
    CHOICES && Object.keys(CHOICES).forEach(function (a) { out[a] = normAxis(a, raw[a]); });
    out.custom = (typeof raw.custom === 'string') ? raw.custom.slice(0, CUSTOM_MAX) : '';
    if (raw.custom != null && typeof raw.custom !== 'string') {
      __stat.fallbacks++; __stat.lastFallback = { axis: 'custom', got: typeof raw.custom, to: '', at: clockWall() };
    }
    return out;
  }
  /** 业务读入口（计入 reads 计量） */
  function getSettings() { __stat.reads++; return readNormalized(); }

  /**
   * 写入口。返回 {ok:true, settings} 或 {ok:false, reason, bad:[{axis,got}]}。
   * 非法档位整笔拒绝**且不写盘** —— 部分写入会让磁盘留下"一半新一半旧"的中间态，
   * 而调用方拿到 ok:false 却以为没生效（实际已生效一半）。
   */
  function setSettings(patch) {
    if (!patch || typeof patch !== 'object') { __stat.rejects++; __stat.lastReject = { bad: [{ axis: null, got: 'bad-patch' }], at: clockWall() }; return { ok: false, reason: 'bad-patch', bad: [{ axis: null, got: 'bad-patch' }] }; }
    const bad = [];
    const next = readNormalized();
    Object.keys(patch).forEach(function (k) {
      if (k === 'custom') {
        const v = patch.custom;
        if (v != null && typeof v !== 'string') { bad.push({ axis: 'custom', got: typeof v }); return; }
        next.custom = (v == null ? '' : String(v).slice(0, CUSTOM_MAX));
        return;
      }
      if (!CHOICES[k]) { bad.push({ axis: k, got: 'unknown-axis' }); return; }
      const v = patch[k];
      if (CHOICES[k].indexOf(v) < 0) { bad.push({ axis: k, got: (v === undefined ? 'undefined' : String(v)) }); return; }
      next[k] = v;
    });
    if (bad.length) {
      __stat.rejects++; __stat.lastReject = { bad: bad, at: clockWall() };
      return { ok: false, reason: 'bad-value', bad: bad };
    }
    const payload = {};
    AXES.forEach(function (a) { payload[a] = next[a]; });
    WA.settingsBus.save(__REG, payload);
    __stat.writes++;
    return { ok: true, settings: next };
  }

  /** 只读有效面：仅含**非 off 且非空**的轴（消费方要判"有没有约束"时不必自己比对档位表） */
  function effectiveSettings() {
    const st = readNormalized();
    const out = {};
    Object.keys(CHOICES).forEach(function (a) { if (a === 'block') return; if (st[a] !== 'off') out[a] = st[a]; });
    if (st.custom) out.custom = st.custom;
    out.enabled = (st.block === 'on') && Object.keys(out).length > 0;
    return out;
  }

  /**
   * 叙事工艺块（唯一产出口）。
   * 空串 = 没有任何约束生效 —— 与 rules.craft「未开启时不额外约束」对齐，且零 token 占用。
   * 尾部一句是三态诚实的兜底：工艺约束不得凌驾于角色/世界状态，也不能被模型在正文里自曝。
   */
  function buildBlock() {
    const st = readNormalized();
    __stat.builds++;
    if (st.block !== 'on') { __stat.emptyBuilds++; __stat.lastLen = 0; __stat.lastAt = clockWall(); return ''; }
    const lines = [];
    if (PARA_TEXT[st.paragraphStyle]) lines.push(PARA_TEXT[st.paragraphStyle]);
    if (PERSP_TEXT[st.perspective]) lines.push(PERSP_TEXT[st.perspective]);
    if (PRON_TEXT[st.userPronoun]) lines.push(PRON_TEXT[st.userPronoun]);
    if (TAKEOVER_TEXT[st.takeover]) lines.push(TAKEOVER_TEXT[st.takeover]);
    if (NARRATE_TEXT[st.narrate]) lines.push(NARRATE_TEXT[st.narrate]);
    if (st.custom) lines.push('[附加工艺要求]\n- ' + st.custom);
    if (!lines.length) { __stat.emptyBuilds++; __stat.lastLen = 0; __stat.lastAt = clockWall(); return ''; }
    const text = '[叙事工艺约束]\n' + lines.join('\n')
      + '\n（以上只约束正文的写法：不得在正文里提及这些约束本身；与角色设定、世界状态、玩家输入冲突时，以它们为准。）';
    __stat.lastLen = text.length; __stat.lastAt = clockWall();
    return text;
  }

  /** 一句话口径摘要（面板/诊断消费；全 off 时明确说"未启用"而不是返回空串） */
  function summaryText() {
    const st = readNormalized();
    if (st.block !== 'on') return '叙事工艺：整块已关闭（正文无额外约束）';
    const parts = [];
    ['paragraphStyle', 'perspective', 'userPronoun', 'takeover', 'narrate'].forEach(function (a) {
      if (st[a] !== 'off') parts.push(AXIS_LABELS[a] + '=' + (CHOICE_LABELS[st[a]] || st[a]));
    });
    if (st.custom) parts.push('附加=' + st.custom.length + '字');
    if (!parts.length) return '叙事工艺：未启用（正文无额外约束）';
    return '叙事工艺：' + parts.join(' · ');
  }

  /**
   * 档位表 ↔ 正文表 的覆盖度（**交叉校验用**）——返回 {轴: {档位: 正文字数}}。
   *
   * 为什么需要它：档位表（CHOICES）与正文表（PARA_TEXT 等）是**两处独立手写**的东西。
   * 二者漂移的症状是静默的：用户选了某档位 → 写入合法 → 但正文表里没有对应文本
   * → buildBlock 里那句 `if (TEXT[st.x]) push(...)` 直接跳过 → **档位看起来生效、正文零约束**，
   * 而 styleStat() 的 values 还忠实地显示着用户选的那个档位。这类「声明了却没实现」的档位，
   * 只有把两张表摆在一起数才看得见（v2.51.0 体检器 checker 12 消费本函数）。
   */
  function textCoverage() {
    const TABLES = { paragraphStyle: PARA_TEXT, perspective: PERSP_TEXT, userPronoun: PRON_TEXT, takeover: TAKEOVER_TEXT, narrate: NARRATE_TEXT };
    const out = {};
    Object.keys(TABLES).forEach(function (axis) {
      out[axis] = {};
      CHOICES[axis].forEach(function (c) {
        out[axis][c] = (c === 'off') ? 0 : String(TABLES[axis][c] || '').length;
      });
    });
    return out;
  }

  /** 只读视图（诊断/门禁消费）：档位表 + 当前值 + 记账（fallbacks/rejects 非零即"配置或调用出过问题"） */
  function styleStat() {
    const st = readNormalized();
    const values = {};
    AXES.forEach(function (a) { values[a] = st[a]; });
    const labels = {};
    AXES.forEach(function (a) { labels[a] = (a === 'custom') ? (st.custom ? '已设置' : '未设置') : (CHOICE_LABELS[st[a]] || st[a]); });
    return {
      key: KEY, axes: AXES.length, choices: CHOICES,
      values: values, labels: labels,
      // 与 effectiveSettings().enabled 同源（含 custom 也算已启用）——两处口径分叉会让
      // 「诊断说未启用、消费方说有约束」这种自相矛盾现场出现
      enabled: effectiveSettings().enabled,
      customLen: st.custom.length, customMax: CUSTOM_MAX,
      reads: __stat.reads, writes: __stat.writes, rejects: __stat.rejects,
      fallbacks: __stat.fallbacks, lastFallback: __stat.lastFallback,
      lastReject: __stat.lastReject, builds: __stat.builds, emptyBuilds: __stat.emptyBuilds,
      lastLen: __stat.lastLen, lastAt: __stat.lastAt,
      summary: summaryText()
    };
  }

  WA.style = {
    KEY, AXES, CHOICES, DEFAULTS, AXIS_LABELS, CHOICE_LABELS, CUSTOM_MAX,
    getSettings, setSettings, effectiveSettings, buildBlock, summaryText, textCoverage, styleStat
  };
  if (WA.log) WA.log('info', '叙事工艺设置面已加载（5 轴 · 默认全 off）');
})();
