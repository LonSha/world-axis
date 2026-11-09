# WorldAxis 优化提升计划：OPV21-1 至 OPV21-9
> **工程归属**：WorldAxis 活世界引擎系统 (`/home/user/wa_opt1`)  
> **基线**：`v2.360.0` / commit `30a1141`  
> **核心哲学**：框架中立，全题材通用（Genre-Neutral Architecture）  
> **实施纪律**：**双计划全部完成前，不执行全量回归（`node tests/run.js`）**。聚焦定向专锁、行为真源断言与局部闭环收口。测试门禁与死导出审计属于默认交付条件，不占 18 项名额。

---

### OPV21-1 · 383 全域引擎跨层因果级联总线（Cascade Bus）拓扑自愈与全量接线
- **现状底座**：`engines/cascade-bus.js` 目前硬编码挂载了 24 个重点引擎的时序分发，其余近 350 个引擎中，大量具备状态推进能力（`tick`, `advance`, `evaluate`）的模块处于孤岛或被动触发状态，无法自主感应上游物理大势或环境突变。
- **本期改造**：
  1. 建立五层自治调度编排总线拓扑：物理环境层（Physical/Atmosphere）→ 生理机能层（Somatic/Biological）→ 战术个体层（Tactical/Individual）→ 社会组织层（Social/Organizational）→ 宏观文明层（Macro/Epochal）；
  2. 实现动态自愈式级联分发（`cascadeBus.dispatchAdaptiveWave`），允许上游环境（如暴风、地震、极端极寒）直接向机能层和军团层辐射冲击，阻断孤岛化；
  3. 引入总线心跳巡检与无序依赖自愈机制，防止引擎异步执行时的状态撕裂。
- **调度接口**：
  - `cascadeBus.dispatchAdaptiveWave(waveSpec)`
  - `actionDesk: bus.dispatchAdaptiveWave`
- **验收旅程与负控制**：
  - 正向：暴风雨+极寒突发，总线自适应波次在 1 轮内精准触发机能失温、空间视口遮蔽与行军移速腰斩；
  - 负控制：传入含环状因果依赖（A→B→C→A）的恶意波次定义，断言在 3 次循环内精准熔断并记录自愈警告（`refusal: 'causal-cycle-broken'`）。

---

### OPV21-2 · ActionDesk 统一行动台全域 10 大子系统路由 100% 全覆盖
- **现状底座**：`engines/action-desk.js` 目前直接纳管 66 个引擎的路由分发，主要集中在常规行动、战斗、黑市与谍报，对于法统争夺、灾异疏散、纪元跃迁等高阶能力缺乏原生标准化写口封装。
- **本期改造**：
  1. 扩充 `ROUTES` 映射表，覆盖 10 大子系统域（机能、战术、谍报、经贸、门阀、水文、纪元、认知、调度、基石），达成对关键业务写口的统一路由收口；
  2. 规范化行动签名（`spec`）：强制要求每个动作具备 `actorId`, `targetId`, `actionKind`, `parameters`, `resourceCost`；
  3. 提供全局行动前置校验器（`preflightCheck`），在正式结算前精准阻断非法操作并返回机器可读的拒绝原由。
- **调度接口**：
  - `actionDesk.act(actionKind, spec)`
  - `actionDesk.preflight(actionKind, spec)`
- **验收旅程与负控制**：
  - 正向：通过 `actionDesk.act('history.advanceEpoch', {...})` 或 `actionDesk.act('theology.channelZealotry', {...})` 统一派发高阶指令；
  - 负控制：行动所需体力、行动点或权限不足时，断言被 preflight 拦截（`status: 'refused', reason: 'insufficient-action-points'`）。

---

### OPV21-3 · 深层具身知觉注入（Embodied Prompt Injection）自适应多阶动态分级压缩
- **现状底座**：`render/inject.js` 的 132 个注入源在多危机并发（重伤+瘟疫+暴风+被追杀）时，虽然有基础预算裁决，但仍容易因文本块过长挤占生成上下文，或因一刀切截断丢失关键生存线索。
- **本期改造**：
  1. 引入三阶自适应压缩模型：`CRITICAL`（濒死/致命威胁，保留微观痛觉与方位）、`URGENT`（高压态势，提炼战术要点与数值）、`AMBIENT`（宏观背景，高度压缩为一句话环境底色）；
  2. 动态依据玩家视线焦点与生理觉知（`sensoryAcuity`）计算注入权重，失血昏迷时自动剔除视口情报，强化耳鸣与眩晕心声；
  3. 彻底消除提示词无意义修饰符，确保 Token 产出密度提升 200%。
- **调度接口**：
  - `render.applyInjections(context, { adaptiveTier: true })`
  - `injectBudget.compressEmbodiedPayload(payload, targetBudget)`
- **验收旅程与负控制**：
  - 正向：重创失血昏迷场景下，环境风光被完全压制，生命体征与濒死痛觉以极限短句精准注入；
  - 负控制：健康平静角色强行申请 `CRITICAL` 阶注入，断言被降级为常态背景（`tier: 'AMBIENT'`）。

---

### OPV21-4 · 三插件（WorldAxis + LonSha + RubyPhone）生态因果回路原子级防撕裂与回滚
- **现状底座**：WorldAxis 向 LonSha 投影记忆真源、向 RubyPhone 吸收通讯事件时，如果遇到外部插件响应异常或局部断网，可能出现“物理事件已发生但跨插件投影悬空”的因果撕裂。
- **本期改造**：
  1. 在 `engines/bridge.js` 与 `engines/lonsha-reader.js` 建立两阶段确认（2PC）因果事务栅栏；
  2. 维护 `PendingBridgeLog` 离线未决队列表，当外部插件恢复后自动重放补偿；若最终判定失败，则原子回滚 WorldAxis 内部的悬空标记；
  3. 严格禁止 WorldAxis 私存聊天记录，仅保留客观物理因果校验哈希。
- **调度接口**：
  - `bridge.transactCrossPlugin(eventId, payload, commitCallback)`
  - `bridge.replayPendingLogs()`
- **验收旅程与负控制**：
  - 正向：RubyPhone 截获密谋短信，在 WorldAxis 事务落盘为间谍线索并成功向 LonSha 投影情报档案；
  - 负控制：外部写入接口人为注入 500 异常，断言 WorldAxis 内部事务自动 Rollback，无任何脏数据残留。

---

### OPV21-5 · 微观机能真实度（human-realism）与战役/刑狱生理创伤深层双向咬合
- **现状底座**：`engines/human-realism.js` 的饥饿、疲劳、脱水与痛觉，在遇到战俘刑讯或长期战役行军时，与战术层和牢狱层存在割裂，缺乏动态代偿性脏器衰竭模型。
- **本期改造**：
  1. 建立深层多器官生理病理学联动：重度脱水（`dehydration >= 80`）引发体温调节失常与战术反应延迟（`reactionSpeed -60%`）；
  2. 长期重度疲劳（`sleepDeprived >= 72h`）诱发谵妄（`delirium`）与幻听幻视，在感知层强制注入干扰假象；
  3. 牢狱水牢/暗室环境自动累积湿毒与失明代偿，受刑重伤未清创时引发脓毒血症（`sepsis`）。
- **调度接口**：
  - `humanRealism.applySystemicFailure(actorId, traumaProfile)`
  - `actionDesk: bio.applySystemicFailure`
- **验收旅程与负控制**：
  - 正向：士兵连续行军 3 日未饮水，直接触发肾功能衰竭与热射病虚脱；
  - 负控制：对具备机械构造或纯灵体豁免的角色调用多器官衰竭，断言被豁免矩阵拦截（`refusal: 'species-organ-exempt'`）。

---

### OPV21-6 · 宏观金融挤兑、商路断供与军团战备军饷断流的破产级联
- **现状底座**：`engines/financial-contagion.js` 与 `engines/economy.js` 虽能模拟商铺与钱庄暴雷，但军队军饷发放与阵营战备粮草是独立的抽象数值，未形成资金链断裂导致全军哗变的完整级联。
- **本期改造**：
  1. 建立国家财政/派系金库与军饷支出的直接管线：钱庄挤兑暴雷直接波及军费储银；
  2. 军饷欠薪动力学：欠饷 1 个月士气下跌 30%，欠饷 3 个月引发逃兵潮，欠饷 6 个月直接诱发前线哗变兵变（`mutiny`）；
  3. 战备粮道被阻断时，自动启动囤积居奇与军粮黑市倒卖，激化前线与后方矛盾。
- **调度接口**：
  - `financialContagion.cascadeMilitaryPayArrears(factionId, arrearsMonths)`
  - `actionDesk: econ.cascadeMilitaryArrears`
- **验收旅程与负控制**：
  - 正向：钱庄暴雷导致总督府银库空虚，前线军团连续两月未发饷银，士气暴跌并出现成建制逃兵；
  - 负控制：派系金库充沛（`treasuryReserve > requiredPay * 3`）时恶意触发欠薪哗变，断言被拦截（`refusal: 'solvency-verified'`）。

---

### OPV21-7 · 空间拓扑网格与迷宫机关/声学视锥的动态重构计算加速
- **现状底座**：`engines/spatial-topology.js` 与 `engines/room-acoustics.js` 在处理墙体破坏、地刺机关位移或塌方时，每次都需全量重算全图 Dijkstra/A* 与声场漫反射，在大尺度地图中存在算力冗余。
- **本期改造**：
  1. 引入增量局部拓扑脏标记树（`DirtyRegionTree`）：仅在发生坍塌、门锁闭合或机关升降的局部九宫格触发声光再计算；
  2. 视锥剪枝缓存：角色移动在同一可视扇区内时复用视锥边界，遭遇转角或烟雾遮蔽时做局部差分补齐；
  3. 支撑动态迷宫的实时回廊翻转与机关陷阱拓扑热重载。
- **调度接口**：
  - `spatialTopology.invalidateLocalRegion(regionId, boundaryChanges)`
  - `actionDesk: spatial.invalidateLocalRegion`
- **验收旅程与负控制**：
  - 正向：密室断龙石落下，局部房间声光视口即时阻断，声学混响从大厅模式切为狭小密室，耗时 < 1ms；
  - 负控制：在无物理连通的独立绝缘区域触发坍塌，断言相邻外部区域视口不发生误刷新。

---

### OPV21-8 · UI 控制台（panel.js）全景态势微件化拆分与即时响应性能极致优化
- **现状底座**：`ui/panel.js` 虽已实现折叠，但仍为万行级单体。直接操作 DOM 会带来微小渲染时延，需将仪表大盘解耦为微件驱动的轻量化组件。
- **本期改造**：
  1. 将 V20/V21 态势大盘细化为可拔插的微件渲染器：`MacroEpochWidget`, `SomaticVitalsWidget`, `EspionageRadarWidget`, `FinancialLedgerWidget`；
  2. 采用按需懒渲染机制（Lazy Component Mount）：折叠状态下的 `<details>` 内部不计算 HTML 字符串，仅在用户点击展开的一瞬间进行数据渲染，首屏加载性能提升 300%；
  3. 彻底杜绝内联 style 冗余，规范全套 CSS 变量体系。
- **调度接口**：
  - `panel.mountWidget(widgetId, containerEl)`
  - `panel.renderLazyFold(foldId, builderFn)`
- **验收旅程与负控制**：
  - 正向：用户点击展开“宏观纪元态势”，仪表盘在 5ms 内完成增量挂载并展示完整进度；
  - 负控制：传入未注册非法微件 ID，断言安全降级为空白占位符并打印警告，绝不引发页面崩溃。

---

### OPV21-9 · 活世界多线程推演事件日志与快照时间旅行调试审计沙盒
- **现状底座**：`core/audit-log.js` 仅记录基础写操作，无法在出现推演异常时一键回溯历史快照进行因果重演。
- **本期改造**：
  1. 构建“活世界时间旅行器（World Chrono Traveler）”：支持在内存沙盒中快速保存 N 个关键历史锚点快照（`ChronoSnapshot`）；
  2. 支持因果分叉重演：可以从 10 轮前的某一次暗杀、暴乱或金融暴雷点切出沙盒分支，更换决策后重跑级联总线，比对因果分叉差异；
  3. 为创作者和开发者提供确定性的回溯验证工具。
- **调度接口**：
  - `chrono.createTimelineFork(baseSnapshotId, alternativeDecisions)`
  - `actionDesk: chrono.createTimelineFork`
- **验收旅程与负控制**：
  - 正向：保存围城爆发前快照，在沙盒中分支测试“开仓放粮”与“闭城屠杀”，精准获取两套迥异的社会推演结局；
  - 负控制：快照校验和不匹配或数据损坏时，断言禁止载入并提示数据校验不通过（`refusal: 'corrupted-chrono-snapshot'`）。
