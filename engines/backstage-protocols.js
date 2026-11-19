/**
 * WorldAxis engines/backstage-protocols.js (v2.529.0) — backstage 的**协议常量与设置登记表**
 *
 * 这些原本长在 engines/backstage.js 里（行 51–179，129 行）。它们是纯数据：
 *   七步判断协议 REASONING_PROTOCOL · 可见性语义 VISIBILITY_SEMANTICS ·
 *   结构规则 STRUCTURAL_RULES · 注入规则 INJECTION_RULES ·
 *   模拟模式 SIM_MODES · 时间策略 TIME_POLICIES · 脉搏档 PULSE_LEVELS ·
 *   设置登记表 __REG_B（defaults / bounds / sentinels / module —— backstage 设置的**唯一真源**）
 *
 * 为什么单独成文件（OPV29-11）：
 *   ① 这些是「契约文本」，改一句话要在一千多行引擎里翻；拆出来之后，协议与算法的边界
 *      在文件层面就看得见（跟 inject-budget-tables / reject-recovery-tables 同一种做法）；
 *   ② 设置登记表与 bounds/sentinels 是 UI 与引擎共读的真源（`WA.settingsBus.boundsOf`），
 *      单独放一份更不会被顺手改坏；
 *   ③ 搬家**不动语义**：backstage 在求值期把它们解构进来用（下面的装载期守卫），
 *      所有调用点一字未改；缺表 / 空表当场抛错，不静默退化成「没有协议」。
 *
 * 本文件零算法：无具名函数、无 fs / store，只有一个 IIFE 外壳挂表。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** 与 engines/backstage.js 同值（设置键名；搬家前后逐字一致）。 */
  const LS_SETTINGS = 'worldaxis_backstage_settings_v1';

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
            wbAutoEnsure: false,
            // [v2.19.0] 酒馆缓存同步（engines/chatcache.js）的两把开关——**声明缺失修复**：
            //   该引擎读 `settings().syncToChat` / `settings().autoBackup` 决定「是否把存档镜像进
            //   聊天文件」「是否轮次推进时滚动备份」，但这两个键既不在 def、也从未在设置页出现。
            //   后果三重：① 子键补齐/`verifyDefaults`/声明完备性检查全都看不见它们；②
            //   `settingsBus.normalize` 把「未声明」的布尔键**原样透传**，引擎侧却写死 `=== true`，
            //   于是任何非 `true` 的存量值都等于「关」——一个「开关摆了却没有开关」的静默失效；
            //   ③ 消费端（engines/chatcache.js）成为全库唯一读它们的文件，产品侧零写入口。
            //   默认 false：这两个功能会写聊天文件 / 增内存快照，属**有副作用的能力**，
            //   默认关、由用户显式开启，与「自动推演」这类开箱即用项区分。
            syncToChat: false,           // 把本扩展存档镜像进 chat_metadata（随聊天文件跨设备同步）
            autoBackup: false,           // 轮次推进时滚动自动备份（保留最近 3 份，可恢复）
            // v2.35.0: 世界书蓝绿灯触发总开关。engines/worldbook.js 读 `s.worldbookTrigger === true`，
            //   此前键不在 def → 永远读不到 true（触发引擎恒关）。默认关：有副作用的注入筛选须用户显式打开。
            worldbookTrigger: false
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

  WA.backstageProtocols = {
    REASONING_PROTOCOL: REASONING_PROTOCOL, VISIBILITY_SEMANTICS: VISIBILITY_SEMANTICS,
    STRUCTURAL_RULES: STRUCTURAL_RULES, INJECTION_RULES: INJECTION_RULES,
    SIM_MODES: SIM_MODES, TIME_POLICIES: TIME_POLICIES, PULSE_LEVELS: PULSE_LEVELS,
    __REG_B: __REG_B
  };
  // OPV29-11：表文件也是模块，尾调 registerModule 让它进账本（否则 module-cycle-gate
  // 会把它记成 static-only 漂移 —— 与 OPV29-09/10 两个表文件踩过的同一个坑）。
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/backstage-protocols.js', { kind: 'data', ver: '2.529.0' });
  }
})();
