# WorldAxis V19 超级版本总纲领：全景双九项史诗级演进大系（OPV19-1～9 + EXV19-1～9，共 18 项）
> **项目代号**：WorldAxis 活世界引擎系统（代码根目录 `/home/user/wa_opt1`）  
> **前序基准**：V18 活世界动力学与社会生态大系（commit `c03969e`，交锋致残、审讯决堤、荒野围猎、围城断粮全域贯通）  
> **基线版本**：`v2.340.0` / 371 核心引擎 / 508 测试套件 / 场景 32～37 专锁全绿  
> **目标版本**：`v2.350.0` / 379 核心引擎 / 515+ 测试套件 / 场景 38～43 专锁 100% 负控制达标  
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

| 指标维度 | 来源 / 检验命令 | 现场实测读数 | V19 目标规划 |
| :--- | :--- | :--- | :--- |
| **系统版本** | `manifest.json` / `index.js` | `v2.340.0` | **跃迁至 v2.350.0** |
| **核心引擎数** | `ls -1 engines/*.js \| wc -l` | **371 个** | **新增 8 大史诗引擎，达 379 个** |
| **测试套件数** | `ls -1 tests/*.js \| wc -l` | **508 个** | **新增场景 38～43 专锁与专项测试** |
| **死导出台账** | `tests/dead-export-ledger.json` | 严格受控 | 新增写口全量接线 |
| **总线调度** | `engines/cascade-bus.js` | 5 层自治调度 | **谍报暗网 + 水文风暴 + 疫病创伤** |

---

## 一、 优化提升线（Optimization · OPV19-1 ～ OPV19-9）

| 编号 | 机制名称 | 核心落盘模块 | 业务写口与调度路由 | 普适通用抽象与解决的核心断点 |
| :--- | :--- | :--- | :--- | :--- |
| **OPV19-1** | **宏观通胀商路断供与囤积居奇物价传导** | `engines/economy.js` | `economy.simulateTradeShock`<br>`actionDesk: econ.simulateTradeShock` | 根除孤立地点静态物价；当商路阻断或战争围城时，物价依稀缺度呈指数级脉冲跃升。 |
| **OPV19-2** | **战术碰撞与随身行囊耗材双向损耗联动** | `engines/tactical-combat.js`<br>`engines/personal-inventory.js` | `tacticalCombat.linkInventoryAttrition` | 解决战斗不耗装备、行囊道具与肉身伤情脱节缺陷；格挡直接损耗刀具耐久，重创即时扣减急救包。 |
| **OPV19-3** | **水文洋流与声学视口在空间拓扑的级联感知** | `engines/spatial-topology.js`<br>`engines/room-acoustics.js` | `spatialTopology.evaluateSensoryOcclusion` | 打通地理视口与声音传播：暴风雨/浪潮轰鸣直接压制脚步声，迷雾严重压缩角色感知半径。 |
| **OPV19-4** | **剧情暗流与历法重大节庆/天文异象共振** | `engines/undercurrent-calendar.js`<br>`engines/calendar-custom.js` | `undercurrentCalendar.alignWithFestival` | 告别暗流与世界日常节庆割裂；月圆潮汐、祭典狂欢期间特定暗流加速爆发或临时冻结。 |
| **OPV19-5** | **多角色深度疲劳代偿与睡眠剥夺生理崩溃** | `engines/human-realism.js` | `humanRealism.applySleepDeprivation` | 细化疲劳机制：连续剥夺睡眠产生感知扭曲、注意力涣散，并触发不可逆的昏厥代偿机制。 |
| **OPV19-6** | **酷吏刑讯反噬与人际网络不可逆仇恨决裂** | `engines/interrogation-tell.js`<br>`engines/bonds.js` | `interrogationTell.applyBacklashGrudge` | 审讯过激时引发受审方派系剧烈仇视，亲属好友信任崩塌，杜绝“严刑拷打后好感不变”违和感。 |
| **OPV19-7** | **野兽趋利避害与定居点灯火防护哨卫结界** | `engines/ecosystem-predation.js`<br>`engines/spatial-topology.js` | `ecosystemPredation.checkPerimeterDeterrent` | 生态捕食接入定居点火把、围栏与哨塔判定；猛兽绝不无脑冲击重兵把守有火光的要塞。 |
| **OPV19-8** | **跨插件真源快照增量脏标记同步优化** | `engines/bridge.js` | `bridge.flushDirtySnapshots` | 根除每次全量导出大快照导致的吞吐瓶颈；仅在谍报、伤势与盟约变迁时推送增量变更。 |
| **OPV19-9** | **沉浸式健康创伤态势与暗网通缉原生折叠面板** | `ui/panel.js` | `panel.renderV19ImmersionFold` | 秉持去工程化无噪准则，将病理感染、骨折创伤与黑市悬赏以原生折叠形式优雅嵌入面板。 |

---

## 二、 拓展创新线（Expansion · EXV19-1 ～ EXV19-9）

| 编号 | 机制名称 | 核心落盘模块 | 业务写口与功能体验 | 机制创新与通用题材玩法价值 |
| :--- | :--- | :--- | :--- | :--- |
| **EXV19-1** | **间谍潜伏渗透、假身份伪造与眼线暗网引擎** | `engines/covert-espionage.js` | `covertEspionage.operateSpy`<br>`actionDesk: spy.operateSpy` | 假身份掩护度、刺探机密、策反眼线、密函截留与反间计因果。 |
| **EXV19-2** | **病理飞沫水源接触传播与隔离检疫引擎** | `engines/epidemic-contagion.js` | `epidemicContagion.propagateDisease`<br>`actionDesk: bio.propagateDisease` | R0传染指数、潜伏期、接触传播介质（空气/水/接触）、封城检疫与病死潮。 |
| **EXV19-3** | **战地外科清创、止血缝合与药物救治引擎** | `engines/surgical-triage.js` | `surgicalTriage.performSurgery`<br>`actionDesk: medical.performSurgery` | 创伤感染化脓、失血休克、截肢缝合、无菌条件、止痛麻醉与术后并发症。 |
| **EXV19-4** | **远洋水文洋流、暴风巨浪与舟船航行动力学引擎** | `engines/maritime-navigation.js` | `maritimeNavigation.navigateVoyage`<br>`actionDesk: naval.navigateVoyage` | 船体破损度、吃水深度、顶风逆流航行、触礁沉船与水手抗浪晕船。 |
| **EXV19-5** | **黑市洗钱销赃、隐秘拍卖竞价与高利贷追偿引擎** | `engines/blackmarket-usury.js` | `blackmarketUsury.transactBlackMarket`<br>`actionDesk: market.transactBlackMarket` | 赃物折价洗白、隐秘拍卖叫价抬价、暴力催收断手与高利滚雪球。 |
| **EXV19-6** | **阴影遮蔽、声光隐蔽与巡逻视野暗杀引擎** | `engines/stealth-infiltration.js` | `stealthInfiltration.executeInfiltration`<br>`actionDesk: stealth.executeInfiltration` | 掩体光照度、脚步声浪、哨卫视锥（Cone of Vision）、从容潜伏与背后致命刺杀。 |
| **EXV19-7** | **毒理相生相克、药剂提炼与银针验毒引擎** | `engines/alchemy-toxicology.js` | `alchemyToxicology.brewOrTestToxin`<br>`actionDesk: alchemy.brewOrTestToxin` | 急性见血封喉、慢性侵蚀内脏、相克草药中和解毒、下毒隐蔽度与验毒试剂。 |
| **EXV19-8** | **铁律盟约契书、违约清算与超自然契约反噬引擎** | `engines/covenant-sanction.js` | `covenantSanction.enforceCovenant`<br>`actionDesk: covenant.enforceCovenant` | 具有沙盒硬约束的停火/经商/效忠契约；违约引发信誉崩盘、财产没收或血契咒杀。 |
| **EXV19-9** | **V19 史诗宏观暗网态势与生理病理仪表综合大盘** | `ui/panel.js` (V19 扩展) | `panel.renderV19LivingNetwork`<br>`#wa-living-network-v19` | 玩家第一视角原生折叠展示：潜伏情报网、病理蔓延热力、海况风向与黑市交易榜。 |

---

## 三、 贯通新场景专锁矩阵（场景 38 ～ 场景 43）

1. **场景 38：雨夜谍影潜伏伪装与密函刺探专锁 (`tests/scenario-v38-covert-espionage-heist.js`)**
   - 验证间谍身份伪装（`coverIdentity`）、眼线收买、密函刺探成功率与破绽暴露被捕门禁。
2. **场景 39：封闭客栈瘟疫爆发隔离与外科缝合急救专锁 (`tests/scenario-v39-epidemic-surgical-triage.js`)**
   - 验证空气/飞沫病原体蔓延（`R0`）、隔离阻断、重创大出血紧急缝合止血与抗感染清创负控制。
3. **场景 40：怒海狂涛触礁遇险与水手舟船动力学专锁 (`tests/scenario-v40-maritime-navigation-storm.js`)**
   - 验证暴风逆流航行、船体触礁进水修补、帆缆损毁与弃船救生舱逃生逻辑。
4. **场景 41：黑市暗仓销赃洗钱与高利贷追杀专锁 (`tests/scenario-v41-blackmarket-usury-chase.js`)**
   - 验证战利品黑市洗白、暗拍竞价争夺、借贷利息违约与亡命追债连锁。
5. **场景 42：守卫视野巡逻穿梭与背后锁喉暗杀专锁 (`tests/scenario-v42-stealth-infiltration-kill.js`)**
   - 验证光影遮蔽、避开巡逻视锥盲区潜入、无声暗杀守卫与尸体拖拽隐藏。
6. **场景 43：V19 史诗全系活世界深度网络大脉冲专锁 (`tests/scenario-v43-v19-epic-living-network-pulse.js`)**
   - 跨机制终极闭环：谍报截获契约情报 -> 黑市购入剧毒配方 -> 潜行刺杀要员触发违约反噬 -> 负伤逃亡遭遇怒海风暴 -> 船上突发疫病外科救护，十环级联全绿验证。
