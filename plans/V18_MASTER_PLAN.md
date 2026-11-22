# WorldAxis V18 超级版本总纲领：全景双九项史诗级演进大系（OPV18-1～9 + EXV18-1～9，共 18 项）
> **项目代号**：WorldAxis 活世界引擎系统（代码根目录 `/home/user/wa_opt1`）  
> **前序基准**：V17 因果心智与文明戏剧大系（commit `9b101d7`，全息沙盘、心智黑化、蝴蝶多米诺全域贯通）  
> **基线版本**：`v2.330.0` / 363 核心引擎 / 518 测试套件 / 1167 死导出受控台账  
> **目标版本**：`v2.340.0` / 371 核心引擎 / 525+ 测试套件 / 场景 32～37 专锁 100% 负控制达标  
> **核心哲学**：**框架中立，全题材通用（Genre-Neutral Architecture）**。严禁将规则硬编码为修仙、现代、西幻等单一题材，统一采用具身动能传导、心理防御击穿、生物习性本能、消耗战动力学与司法证据链模型。  
> **三插件生态协同边界铁律**：
> 1. **LonSha 记忆插件**：客观世界记忆真源（WorldAxis 严禁自建对话缓存与私有向量记忆树，只负责向 LonSha 投影深层战况、创伤要害与公审通缉客观事实）。
> 2. **RubyPhone 虚拟手机插件**：通信、群聊、LIME/微信消息流与朋友圈 SNS 动态主宰（WorldAxis 严禁复刻虚拟聊天 UI，仅接收通信事件并将其转化为物理因果与心智扰动）。
> 3. **WorldAxis 世界坐标轴**：客观物理演进、具身对抗、荒野生态、要塞围攻、司法断狱与机关博弈的纯粹发生器。
> **工程铁律纪律**：
> 1. **拒绝纯函数与死代码**：所有新机制必须具备内部状态持久化、业务控制器写口、ActionDesk 集中调度与专锁真实消费。
> 2. **真实破坏性负控制覆盖率 100%**：每个场景专锁必须具备参数越界拦截、非法前置阻断与非恒真失败判据。
> 3. **死导出门禁零反弹**：新增导出函数必须具备真实生产消费点或在 `dead-export-ledger.json` 中受控核减。
> 4. **双计划完工前严禁全量回归**：保持高效收口节奏，以定向场景专锁作为唯一衡量尺度。
---
## 零、 现场基线与演进读数

| 指标维度 | 来源 / 检验命令 | 现场实测读数 | V18 目标规划 |
| :--- | :--- | :--- | :--- |
| **系统版本** | `index.js` / `manifest.json` | `v2.330.0` | **跃迁至 v2.340.0** |
| **核心引擎数** | `ls -1 engines/*.js \| wc -l` | **363 个** | **新增 8 大史诗引擎，达 371 个** |
| **测试套件数** | `ls -1 tests/*.js \| wc -l` | **518 个** | **新增场景 32～37 专锁与专项测试** |
| **死导出台账** | `tests/dead-export-ledger.json` | **1167 项** (uiDead: 6) | 严格受控，新增写口全量接线 |
| **总线调度** | `engines/cascade-bus.js` | 4 层自治调度 | **战术碰撞 + 宏观围城 + 异化级联** |
---

## 一、 优化提升线（Optimization · OPV18-1 ～ OPV18-9）
| 编号 | 机制名称 | 核心落盘模块 | 业务写口与调度路由 | 普适通用抽象与解决的核心断点 |
| :--- | :--- | :--- | :--- | :--- |
| **OPV18-1** | **人性宿怨恩仇分化与实质赔偿硬门禁** | `engines/human-realism.js` | `humanRealism.settleGrudgeAdvanced`<br>`actionDesk: bio.settleGrudge` | 彻底拆分赔偿、表面和解与真诚原谅。支持“收下赔偿但暗中怀恨”，拒绝无条件增加愉悦的傻白甜逻辑。 |
| **OPV18-2** | **人物生活状态机事务与时间域统一化** | `engines/human-realism.js`<br>`engines/day-route.js` | `humanRealism.transactNeeds`<br>`dayRoute.syncTimeDomain` | 根除 `getRoot` 绕过事务写内存漏洞，全走 `store.transact`；修复小时与毫秒混域，确保日程时间戳绝对递增。 |
| **OPV18-3** | **暗流日历阶段别名全谱系对齐与推进器** | `engines/undercurrent-calendar.js`<br>`engines/storyline-advance.js` | `undercurrentCalendar.normalizeStage`<br>`actionDesk: story.advanceLine` | 扩充阶段窗口词表（消除 4 段兜底缺陷）；为暗流注入按轮次与时钟自主推进的动力学引擎。 |
| **OPV18-4** | **物种豁免矩阵的人物设定证据穿透** | `engines/human-realism.js` | `humanRealism.evaluateExemption` | 废除仅凭物种标签一刀切豁免生理与情感；角色私有人设事实证据优先判定。 |
| **OPV18-5** | **角色核心人格渐进位移与重大事件判据** | `engines/persona-anchor.js` | `personaAnchor.applyPersonalityDrift` | 统一重大事件判据，区分核心价值与外在应对方式的长期潜移默化。 |
| **OPV18-6** | **多角色动态排班冲突与连续课表/通勤** | `engines/labor-schedule.js` | `laborSchedule.bookTimeSlot` | 突破粗粒度排他插槽，支持细粒度连续课程、饭点与通勤冲突仲裁。 |
| **OPV18-7** | **提示词注面逐边诊断与节拍梯度压缩器** | `engines/inject-collector.js` | `injectCollector.compilePaced` | 引入剧情紧张度梯度裁剪，平静期自动折叠深水因果，决战期全量释放特写。 |
| **OPV18-8** | **跨插件真源投影双向防重与心智镜像增强** | `engines/bridge.js` | `bridge.snapshot.v18EpicClash`<br>`bridge.atomicTransact` | 汇出当前战场态势、要害伤情、围城粮储与司法通缉，跨插件原子事务确认。 |
| **OPV18-9** | **全域 363 引擎因果能耗平衡与死循环硬切断** | `engines/cascade-bus.js`<br>`engines/health-preflight.js` | `cascadeBus.pruneCausalRunaway` | 为级联总线引入对数能量衰减与环路熔断，防止同频自激振荡。 |

---

## 二、 拓展创新线（Expansion · EXV18-1 ～ EXV18-9）
| 编号 | 机制名称 | 核心落盘模块 | 业务写口与功能体验 | 机制创新与通用题材玩法价值 |
| :--- | :--- | :--- | :--- | :--- |
| **EXV18-1** | **具身战术交锋与致命要害创伤仲裁引擎** | `engines/tactical-combat.js` | `tacticalCombat.resolveClash`<br>`actionDesk: combat.resolveTacticalClash` | 抽象攻防招架、姿态失衡、要害（头/胸/肢）断骨大出血与武器崩刃反噬。 |
| **EXV18-2** | **微表情伪装破绽与审讯心理击穿引擎** | `engines/interrogation-tell.js` | `interrogationTell.pressInquest`<br>`actionDesk: interrogate.pressInquest` | 测谎心理防线、出示物证戳穿矛盾、心理外溢破绽与决堤式招供。 |
| **EXV18-3** | **荒野生物本能捕食与生态链迁徙引擎** | `engines/ecosystem-predation.js` | `ecosystemPredation.simulatePredation`<br>`actionDesk: wild.simulatePredation` | 模拟饥饿掠食、气味追踪、耐力围猎、畏火防御与食物链动态平衡。 |
| **EXV18-4** | **宏观围城消耗战与后勤辎重断粮引擎** | `engines/siege-attrition.js` | `siegeAttrition.advanceSiege`<br>`actionDesk: siege.advanceSiege` | 城防封锁、粮水见底、疫病滋生、士气崩溃与兵变献城演变。 |
| **EXV18-5** | **超自然异化侵蚀与道心畸变演化引擎** | `engines/anomaly-mutation.js` | `anomalyMutation.inflictCorruption`<br>`actionDesk: anomaly.inflictCorruption` | 侵蚀抗性、异化畸变等级、肉体魔变与幻听理智代价。 |
| **EXV18-6** | **功勋考绩与宗门/官僚派系推举引擎** | `engines/bureaucracy-ascension.js` | `bureaucracyAscension.evaluateAscension`<br>`actionDesk: org.evaluateAscension` | 功绩积分、派系背书、门阀垄断与破格提拔权力晋升链路。 |
| **EXV18-7** | **司法公审断狱与赏金猎人追捕追凶引擎** | `engines/judicial-inquest.js` | `judicialInquest.conductInquest`<br>`actionDesk: judicial.conductInquest` | 通缉悬赏、猎人搜捕、证据链公审庭、死刑斩决与劫狱因果。 |
| **EXV18-8** | **远古遗迹机关密码与环境自毁陷阱引擎** | `engines/ruin-mechanism.js` | `ruinMechanism.triggerMechanism`<br>`actionDesk: ruin.triggerMechanism` | 压力地砖、连环暗器、自毁注水倒计时与技巧拆解。 |
| **EXV18-9** | **V18 史诗宏观战局与生死交锋沙盘大盘** | `ui/panel.js` (V18 扩展) | `panel.renderV18EpicClashBoard`<br>`#wa-epic-v18-dash` | 玩家第一视角原生折叠展示：战局前线、要害创伤分布、围城倒计时与通缉榜。 |

---

## 三、 贯通新场景专锁矩阵（场景 32 ～ 场景 37）
1. **场景 32：雨夜巷战刀剑格挡与断臂要害创伤专锁 (`tests/scenario-v32-tactical-combat-trauma.js`)**
2. **场景 33：大堂公审物证击穿与决堤式招供专锁 (`tests/scenario-v33-interrogation-psychological-break.js`)**
3. **场景 34：风雪荒原狼群猎食与篝火御兽专锁 (`tests/scenario-v34-ecosystem-predation-wild.js`)**
4. **场景 35：孤城被困断水断粮与哗变献城专锁 (`tests/scenario-v35-siege-attrition-collapse.js`)**
5. **场景 36：远古地宫地砖连环陷阱与自毁逃生专锁 (`tests/scenario-v36-ruin-mechanism-escape.js`)**
6. **场景 37：V18 史诗全系融会贯通大脉冲锁 (`tests/scenario-v37-v18-epic-integration.js`)**