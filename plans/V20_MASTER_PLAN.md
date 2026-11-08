# WorldAxis V20 纪元级超级版本总纲领：知觉具身与全息回响大系（OPV20-1～9 + EXV20-1～9，共 18 项）
> **项目代号**：WorldAxis 活世界引擎系统（代码根目录 `/home/user/wa_opt1`）  
> **前序基准**：V19 史诗级活世界深度网络（commit `654dd2b`，四层总线全域接线、航海毒理潜行疫病全域贯通）  
> **基线版本**：`v2.340.0` / 380 核心引擎 / 514 测试套件 / 1226 死导出受控台账  
> **目标版本**：`v2.360.0` / 388+ 核心引擎 / 525+ 测试套件 / 场景 44～49 专锁 100% 负控制达标  
> **核心哲学**：**框架中立，全题材通用（Genre-Neutral Architecture）**。严禁将规则硬编码为修仙、现代、西幻等单一题材，统一采用信息熵减、微观病理学、具身流体动能、暗黑金融学与博弈论信誉模型。  
> **三插件生态协同边界铁律**：
> 1. **LonSha 记忆插件**：客观世界记忆真源（WorldAxis 严禁自建对话缓存与私有向量记忆树，只负责向 LonSha 投影真实盟约契书、致命病历档案、谍报线索与黑市通缉等客观事实）。
> 2. **RubyPhone 虚拟手机插件**：通信、群聊、LIME/微信消息流与朋友圈 SNS 动态主宰（WorldAxis 严禁复刻虚拟聊天 UI，仅接收通信事件并将其转化为物理因果、眼线密报与心智扰动）。
> 3. **WorldAxis 世界坐标轴**：客观物理演进、具身对抗、远洋风暴、病理蔓延、地下暗网与暗杀潜行的纯粹物理与因果发生器。
> **工程铁律纪律**：
> 1. **拒绝纯函数与死代码**：所有新机制必须具备内部状态持久化、业务控制器写口、ActionDesk 集中调度与专锁真实消费。
> 2. **真实破坏性负控制覆盖率 100%**：每个场景专锁必须具备参数越界拦截、非法前置阻断与非恒真失败判据。
> 3. **死导出门禁零反弹**：新增导出函数必须具备真实生产消费点或在 `dead-export-ledger.json` 中受控核减。
> 4. **双计划完工前严禁全量回归**：保持高效收口节奏，以定向场景专锁作为唯一衡量尺度。
---
## 零、 现场基线与演进读数

| 指标维度 | 来源 / 检验命令 | 现场实测读数 | V20 目标规划 |
| :--- | :--- | :--- | :--- |
| **系统版本** | `manifest.json` / `index.js` | `v2.340.0` | **跃迁至 v2.360.0** |
| **核心引擎数** | `ls -1 engines/*.js \| wc -l` | **380 个** | **新增宏观灾异与纪元引擎，达 388+ 个** |
| **测试套件数** | `ls -1 tests/*.js \| wc -l` | **514 个** | **新增场景 44～49 专锁与专项测试** |
| **注入管线源** | `render/inject.js` `SOURCES` | 132 项 | **全面吸纳 V18/V19 悬空 buildBlock** |
| **跨插件快照** | `engines/bridge.js` `buildSnapshot` | 仅至 V17 | **全量汇入 V18 战况与 V19 暗网/疫病** |
---

## 一、 优化提升线（Optimization · OPV20-1 ～ OPV20-9）
| 编号 | 机制名称 | 核心落盘模块 | 关键写口与调度路由 | 普适通用抽象与解决的核心断点 |
| :--- | :--- | :--- | :--- | :--- |
| **OPV20-1** | **V18/V19 核心引擎 Prompt 注入管线全域贯通** | `render/inject.js`<br>`engines/inject-budget.js` | `render.applyInjections`<br>`SOURCES` 补齐 V18/V19 | 彻底消灭 45 个 `buildBlock` 悬空死角！将病理、创伤、毒素、海况、暗杀视野以极低 Token 消耗动态编入 Prompt。 |
| **OPV20-2** | **动态注面紧急度自适应加权剪枝（Token 熔断保护）** | `engines/inject-budget.js`<br>`engines/inject-slot-audit.js` | `injectBudget.allocateDynamicPacing` | 建立紧张度分级注入器：平静期自动折叠深水因果，生死决战/重病临危时优先保障创伤与危险情报透传，严防 Prompt 超限。 |
| **OPV20-3** | **Bridge V2 全域活世界事实快照矩阵全量升级** | `engines/bridge.js` | `bridge.buildSnapshot`<br>`snapshot.v18Epic`<br>`snapshot.v19Living` | 将宏观战况、病理传染指数、海况风力、黑市悬赏与血契违约全量汇入 Bridge，使外部插件可读到完整的客观物理世界。 |
| **OPV20-4** | **RubyPhone 虚拟通讯与 WorldAxis 谍报暗流全双工闭环** | `engines/lonsha-reader.js`<br>`engines/covert-espionage.js` | `covertEspionage.ingestCommTraffic`<br>`undercurrentCalendar.triggerByMessage` | RubyPhone 中的群聊泄密、密报或短信，在 WorldAxis 自动解析为眼线情报线索并推动对应暗流阶段，实现通讯与物理因果咬合。 |
| **OPV20-5** | **LonSha 记忆真源情感心锚与具身意志反哺互通** | `engines/lonsha-reader.js`<br>`engines/human-realism.js` | `humanRealism.applyMemoryResolve` | 提取 LonSha 中的深刻羁绊与血海深仇，反哺为角色在审讯时的意志抗性加成，或在濒死绝境中的生理潜能代偿。 |
| **OPV20-6** | **ActionDesk 行动看板 V18/V19 全域路由深度纳管** | `engines/action-desk.js` | `actionDesk.board`<br>`actionDesk.plan`<br>`ROUTES` 扩展 | 聚合 `board()` 的可执行行动项：战术格挡、战地清创、黑市洗钱、背后暗杀、验毒与公审，彻底打通玩家行动入口。 |
| **OPV20-7** | **28 个边缘孤岛引擎状态清洗与四层总线归位** | `engines/cascade-bus.js`<br>`engines/tool-diag.js` | `cascadeBus.dispatchTick`<br>`fieldWriters.audit` | 全面盘点 `environmental-capacity`、`lens-culling` 等 28 个孤岛引擎，将其规范为纯工具/守卫并登记台账，或接入级联时钟。 |
| **OPV20-8** | **超万行 UI 面板原生组件化重构与分层折叠降负** | `ui/panel.js` | `panel.renderV20UnifiedLivingHub` | 针对 17,000 行的 `panel.js` 进行零破损降负重组，引入模块化视图聚合引擎，玩家界面默认清爽，高阶机制一键抽屉展开。 |
| **OPV20-9** | **全系统四层级联总线（Cascade Bus）时序死锁与环路熔断** | `engines/cascade-bus.js` | `cascadeBus.detectAndBreakCycle` | 建立因果图 DAG 拓扑巡检，当物理、机能、行为、社会层出现互相依赖的自激振荡时，以对数能量衰减强行熔断。 |

---

## 二、 拓展创新线（Expansion · EXV20-1 ～ EXV20-9）
| 编号 | 机制名称 | 核心落盘模块 | 业务写口与功能体验 | 机制创新与通用题材玩法价值 |
| :--- | :--- | :--- | :--- | :--- |
| **EXV20-1** | **宏观历史突变与文明纪元跃迁引擎** | `engines/epochal-transition.js` | `epochalTransition.evaluateEpochShift`<br>`actionDesk: history.advanceEpoch` | 当围城断粮、瘟疫、统治者被刺等微观危机叠加突破阈值，触发“王朝崩溃/科技革命/废土纪元”宏观时代跃迁。 |
| **EXV20-2** | **极端自然灾异突发与大尺度地貌灾变引擎** | `engines/cataclysm-hazard.js` | `cataclysmHazard.triggerCataclysm`<br>`actionDesk: nature.triggerHazard` | 抽象地震地陷、海啸决堤、山火蔓延与陨石异象；永久改变局部空间拓扑，摧毁商路建筑并引发难民潮。 |
| **EXV20-3** | **战术潜入全景 QTE 与暗影搏杀交互式执行台** | `engines/tactical-infiltration-desk.js` | `tacticalInfiltrationDesk.planIncursion`<br>`actionDesk: stealth.planIncursion` | 将潜行视锥、声光掩蔽与背后暗杀整合成可视化微观战术推演台，支持分步下达潜入指令与声东击西。 |
| **EXV20-4** | **跨地域宗族门阀联姻与血脉利益博弈引擎** | `engines/dynasty-lineage.js` | `dynastyLineage.proposeMatrimony`<br>`actionDesk: dynasty.proposeMatrimony` | 政治联姻、继承权顺位争夺、私生子疑云、绝嗣分家与家族宗祠信托基金，支撑复杂中世纪/修仙家族政争。 |
| **EXV20-5** | **多方势力地下情报战与间谍反间计博弈网络** | `engines/counter-intelligence.js` | `counterIntelligence.runDoubleAgent`<br>`actionDesk: intel.runDoubleAgent` | 双面间谍、假情报投毒（Disinformation）、眼线清洗公审与策反策逆，让谍战从单兵潜伏上升为阵营情报战。 |
| **EXV20-6** | **法理正统性、舆论造势与王权篡位争夺引擎** | `engines/legitimacy-mandate.js` | `legitimacyMandate.claimMandate`<br>`actionDesk: crown.claimMandate` | 抽象“天命/宪政正统/军功威望/神谕背书”四维法统度；法统归零引发属臣割据与全民哗变叛乱。 |
| **EXV20-7** | **黑市金融危机、钱庄挤兑与假币通缩洗牌引擎** | `engines/financial-contagion.js` | `financialContagion.triggerRunOnBank`<br>`actionDesk: finance.triggerRunOnBank` | 地下钱庄兑付违约、伪造票据流窜、高利贷坏账连环暴雷，引发全城商业信用决堤与物价大崩溃。 |
| **EXV20-8** | **超自然法则异变、潮汐归墟与天道劫难仲裁引擎** | `engines/cosmic-anomaly.js` | `cosmicAnomaly.surgeAnomaly`<br>`actionDesk: cosmic.surgeAnomaly` | 通用超自然/科幻高维异象：灵气枯竭、魔力回潮、辐射风暴、AI失控信标；颠覆全图物理定律与战斗逻辑。 |
| **EXV20-9** | **V20 史诗全息世界态势仪表大盘（Holistic World Holomap）** | `ui/panel.js` (V20 扩展) | `panel.renderV20HolomapDashboard`<br>`#wa-holomap-v20` | 原生全景折叠仪表：集纪元时代倒计时、地貌灾情、谍网热力、法统声望与跨插件回响于一体的终极控制台。 |

---

## 三、 贯通新场景专锁矩阵（场景 44 ～ 场景 49）
1. **场景 44：雨夜潜行暗杀与 Prompt 创伤知觉即时具身专锁 (`tests/scenario-v44-embodied-prompt-perception.js`)**
2. **场景 45：三插件全双工因果回响与 RubyPhone 谍报密谋专锁 (`tests/scenario-v45-cross-plugin-full-duplex-resonance.js`)**
3. **场景 46：多重危机共振与王朝崩溃/历史纪元跃迁专锁 (`tests/scenario-v46-epochal-collapse-transition.js`)**
4. **场景 47：极端山洪灾异地貌永久改变与难民大迁徙专锁 (`tests/scenario-v47-cataclysm-topological-rupture.js`)**
5. **场景 48：地下钱庄挤兑暴雷与黑市商业信用连环破产专锁 (`tests/scenario-v48-financial-contagion-collapse.js`)**
6. **场景 49：V20 终极跨代全景史诗级活世界大闭环专锁 (`tests/scenario-v49-v20-epic-holistic-convergence.js`)**
