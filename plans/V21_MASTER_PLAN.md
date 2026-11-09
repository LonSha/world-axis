# WorldAxis V21 纪元级超级版本总纲领：文明盛衰、神权军团与生态全景大系（OPV21-1～9 + EXV21-1～9，共 18 项）
> **项目代号**：WorldAxis 活世界引擎系统（代码根目录 `/home/user/wa_opt1`）  
> **前序基准**：V20 知觉具身与全息回响大系（commit `30a1141`，纪元突变、地壳灾变、金融暴雷全域贯通并推送至 GitHub）  
> **基线版本**：`v2.360.0` / 383 核心引擎 / 520 测试套件 / 1218 死导出受控台账  
> **目标版本**：`v2.380.0` / 391+ 核心引擎 / 535+ 测试套件 / 场景 50～55 专锁 100% 破坏性负控制达标  
> **核心哲学**：**框架中立，全题材通用（Genre-Neutral Architecture）**。严禁将规则硬编码为单一特定题材，统一抽象为信息论、博弈论、营养级级联动力学与流体/微观物理拓扑模型。  
> **三插件生态协同边界铁律**：
> 1. **LonSha 记忆插件**：客观世界记忆真源（WorldAxis 严禁自建对话缓存与私有向量记忆树，只负责向 LonSha 投影真实盟约契书、教派异端档案、家谱信托与刑狱通缉事实）。
> 2. **RubyPhone 虚拟手机插件**：通信、群聊、LIME/微信消息流与朋友圈 SNS 动态主宰（WorldAxis 严禁复刻虚拟聊天 UI，仅接收通信事件并将其转化为物理因果、军情密报与心智扰动）。
> 3. **WorldAxis 世界坐标轴**：客观物理演进、军团对撞、神权仪式、生态崩溃、宫廷政变与越狱暗杀的纯粹物理与因果发生器。
> **工程铁律纪律**：
> 1. **拒绝纯函数与死代码**：所有新机制必须具备内部状态持久化、业务控制器写口、ActionDesk 集中调度与专锁真实消费。
> 2. **真实破坏性负控制覆盖率 100%**：每个场景专锁必须具备参数越界拦截、非法前置阻断与非恒真失败判据。
> 3. **死导出门禁零反弹**：新增导出函数必须具备真实生产消费点或在 `dead-export-ledger.json` 中受控核减。
> 4. **双计划完工前严禁全量回归**：保持高效收口节奏，以定向场景专锁作为唯一衡量尺度。

---

## 零、 现场基线与演进读数

| 指标维度 | 来源 / 检验命令 | 现场实测读数 | V21 目标规划 |
| :--- | :--- | :--- | :--- |
| **系统版本** | `manifest.json` / `index.js` | `v2.360.0` | **跃迁至 v2.380.0** |
| **核心引擎数** | `ls -1 engines/*.js | wc -l` | **383 个** | **新增神权、军团、刑狱等 8 大核心，达 391+ 个** |
| **测试套件数** | `ls -1 tests/*.js | wc -l` | **520 个** | **新增场景 50～55 专锁与专项门禁，达 535+ 个** |
| **ActionDesk 纳管** | `engines/action-desk.js` `ROUTES` | 66 引擎 | **跃迁至全域 10 大子系统 100% 全覆盖** |
| **总线自适应分发** | `engines/cascade-bus.js` | 24 引擎 | **跃迁至五层全域自治调度总线网络** |

---

## 一、 优化提升线（Optimization · OPV21-1 ～ OPV21-9）
| 编号 | 机制名称 | 核心落盘模块 | 关键写口与调度路由 | 普适通用抽象与解决的核心断点 |
| :--- | :--- | :--- | :--- | :--- |
| **OPV21-1** | **383 全域引擎跨层因果级联总线拓扑自愈与全量接线** | `engines/cascade-bus.js` | `cascadeBus.dispatchAdaptiveWave`<br>`actionDesk: bus.dispatchAdaptiveWave` | 彻底打破近 350 个引擎的调用孤岛；五层自适应分发上游环境冲击，阻断时序撕裂与环状死锁。 |
| **OPV21-2** | **ActionDesk 统一行动台全域 10 大子系统路由 100% 全覆盖** | `engines/action-desk.js` | `actionDesk.act`<br>`actionDesk.preflight` | 纳管 10 大子系统（机能、战术、谍报、经贸、门阀、水文、纪元、认知、调度、基石），统一动作签名与前置拦截。 |
| **OPV21-3** | **深层具身知觉注入自适应多阶动态分级压缩** | `render/inject.js`<br>`engines/inject-budget.js` | `render.applyInjections`<br>`injectBudget.compressEmbodiedPayload` | 建立 CRITICAL / URGENT / AMBIENT 三阶知觉动态压缩模型，濒死感知极限透传，Token 产出密度提升 200%。 |
| **OPV21-4** | **三插件生态因果回路原子级防撕裂与回滚** | `engines/bridge.js`<br>`engines/lonsha-reader.js` | `bridge.transactCrossPlugin`<br>`bridge.replayPendingLogs` | 建立两阶段确认（2PC）因果事务栅栏与离线未决队列，防止外部异常导致的跨插件因果漂移与状态脏读。 |
| **OPV21-5** | **微观机能真实度与战役/刑狱生理创伤深层双向咬合** | `engines/human-realism.js` | `humanRealism.applySystemicFailure`<br>`actionDesk: bio.applySystemicFailure` | 引入脱水虚脱、长期失眠谵妄幻视、水牢湿毒与战俘受刑脓毒血症（Sepsis）等多器官衰竭病理联动。 |
| **OPV21-6** | **宏观金融挤兑、商路断供与战备军饷断流的破产级联** | `engines/financial-contagion.js`<br>`engines/economy.js` | `financialContagion.cascadeMilitaryPayArrears` | 金融暴雷直接穿透国库私帑，欠薪动力学诱发前线军队逃兵潮与哗变兵变（Mutiny）。 |
| **OPV21-7** | **空间拓扑网格与迷宫机关/声学视锥的动态重构加速** | `engines/spatial-topology.js`<br>`engines/room-acoustics.js` | `spatialTopology.invalidateLocalRegion` | 引入局部脏标记树，坍塌与机关翻转仅触发局部九宫格再计算，实现动态迷宫与声场毫秒级重构。 |
| **OPV21-8** | **UI 控制台全景态势微件化拆分与即时响应极致优化** | `ui/panel.js` | `panel.mountWidget`<br>`panel.renderLazyFold` | 解耦为按需懒渲染微件（Lazy Mount），折叠状态零性能损耗，首屏渲染提速 300%，杜绝内联 style 冗余。 |
| **OPV21-9** | **活世界多线程推演日志与快照时间旅行调试审计沙盒** | `core/audit-log.js`<br>`engines/chrono.js` | `chrono.createTimelineFork`<br>`actionDesk: chrono.createTimelineFork` | 建立世界时间旅行沙盒，支持从任意历史关键点切出因果分支重演，比对决策分叉差异。 |

---

## 二、 拓展创新线（Expansion · EXV21-1 ～ EXV21-9）
| 编号 | 机制名称 | 核心落盘模块 | 业务写口与功能体验 | 机制创新与通用题材玩法价值 |
| :--- | :--- | :--- | :--- | :--- |
| **EXV21-1** | **宗教信仰、教派崇拜与狂热神权布道引擎** | `engines/theology-cult.js` | `theologyCult.conductTheologyOp`<br>`actionDesk: cult.conductTheologyOp` | 正统信条、狂热度、布道传教、异端审判与圣战反噬，支撑通用神权与信仰博弈。 |
| **EXV21-2** | **战役级军团排阵、士气溃散与三军阵形对撞引擎** | `engines/regiment-tactics.js` | `regimentTactics.clashRegiments`<br>`actionDesk: army.clashRegiments` | 方阵/锋矢阵形克制、侧翼包抄、督战队与士气决堤大溃散（Rout），填补大兵团作战空白。 |
| **EXV21-3** | **司法陪审团审判、狱政囚禁与亡命越狱追缉引擎** | `engines/incarceration-jailbreak.js` | `incarcerationJailbreak.executeJailOp`<br>`actionDesk: prison.executeJailOp` | 水牢禁闭、地道挖掘、警报封锁、猎犬气味搜捕与牢狱黑市，打造完整牢狱求生闭环。 |
| **EXV21-4** | **跨世代血脉遗赠、家谱传续与家族诅咒信托引擎** | `engines/bloodline-heritage.js` | `bloodlineHeritage.transactLineage`<br>`actionDesk: bloodline.transactLineage` | 家谱树、隐性生理/心智诅咒、不可撤销宗族信托基金与绝嗣夺宗，支撑家族史诗演进。 |
| **EXV21-5** | **文明发明工坊、工程器械与技术图纸跃迁引擎** | `engines/engineering-blueprint.js` | `engineeringBlueprint.engineerDevice`<br>`actionDesk: craft.engineerDevice` | 攻城器械组装、技术研发试错、间谍窃密扩散与工坊灾难性大爆炸事故。 |
| **EXV21-6** | **动态地下城地牢迷宫、机关陷阱拓扑与秘境演变引擎** | `engines/dungeon-hazard-mesh.js` | `dungeonHazardMesh.navigateOrTrigger`<br>`actionDesk: dungeon.navigateOrTrigger` | 房间网络 DAG、断龙石/毒弩陷阱级联、地灾时钟与爆破破壁强攻，支撑未知迷宫探秘。 |
| **EXV21-7** | **深层生态食物链崩溃、生物异化与外来物种入侵引擎** | `engines/ecosystem-cascade.js` | `ecosystemCascade.simulateBioShock`<br>`actionDesk: eco.simulateBioShock` | 营养级失衡蝗灾、恶性外来物种指数暴增吞噬定居点、辐射/异象导致的生物畸变。 |
| **EXV21-8** | **宫廷深宫内斗、派系结党与权臣政变逼宫引擎** | `engines/court-intrigue.js` | `courtIntrigue.executeIntrigue`<br>`actionDesk: court.executeIntrigue` | 禁军兵权、罗织罪名、伪造诏书、午夜玄武门政变与诛灭九族，撑起王权中枢争斗。 |
| **EXV21-9** | **V21 史诗级活世界文明与生态全景控制中心** | `ui/panel.js` (V21 扩展) | `panel.renderV21CivEcoHub`<br>`#wa-civ-eco-hub-v21` | 原生折叠仪表：信仰天平、三军士气、刑狱地道、发明图纸与食物链健康全景透视。 |

---

## 三、 贯通新场景专锁矩阵（场景 50 ～ 场景 55）
1. **场景 50：灾民暴乱冲击官邸与神权异端审判火刑专锁 (`tests/scenario-v50-theology-cult-purge.js`)**
   - 验证饥民信仰转化、神迹加持、裁判所罗织异端罪名与狂热圣战反噬门禁。
2. **场景 51：平原主力方阵对决与侧翼铁骑包抄士气溃散专锁 (`tests/scenario-v51-regiment-tactics-clash.js`)**
   - 验证五大阵形相克结算、战线交锋伤亡、主将被斩诱发全军溃逃（Rout）与督战队负控制。
3. **场景 52：死牢暗道挖掘、雨夜越狱暴动与猎犬搜捕专锁 (`tests/scenario-v52-jailbreak-hound-pursuit.js`)**
   - 验证狱中违禁品交易、地道挖掘进度、触发全城警报搜捕与涉水脱困逻辑。
4. **场景 53：宗祠血契验亲继承与家族诅咒绝嗣逼宫专锁 (`tests/scenario-v53-bloodline-curse-succession.js`)**
   - 验证家谱顺位、先祖遗泽/隐性遗传病、宗族信托验亲阻断与旁系叛变夺宗。
5. **场景 54：重型攻城器械轰塌城垣与工坊失火图纸被窃专锁 (`tests/scenario-v54-engineering-siege-blueprint.js`)**
   - 验证攻城机械图纸试错、组装破城槌摧毁要塞、研发爆炸事故与商业间谍缴获。
6. **场景 55：V21 终极跨文明军政生态全景史诗级大融合专锁 (`tests/scenario-v55-v21-civ-eco-grand-convergence.js`)**
   - 跨 18 大机制终极连环：宫廷政变失败被捕入狱 -> 越狱联络反抗军团排阵对抗 -> 财政枯竭诱发欠饷哗变 -> 神权祭司煽动圣战并引发生态食物链大崩溃，全域无缝闭环验证。
