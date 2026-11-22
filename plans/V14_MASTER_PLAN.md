# WorldAxis V14 超级版本纲领：全域闭环与多角色博弈生态（OPV14-1～9 + EXV14-1～9）
> **项目**：WorldAxis 活世界引擎系统（代码根目录 `/home/user/wa_opt1`）  
> **基线版本**：`v2.306.0` / 提交 `4a0b17c`（远端 origin/master 同步）  
> **核心命题**：**打破 154 个只读引擎与孤岛模块的“单向沉淀”，让世界真正活过来**。在 SillyTavern 通用多角色与动态群聊生态下，实现全域引擎垂直贯通、数据持久化、写口代价回写、多角色非对称视界博弈与负控制定向门禁闭环。

---

## 一、 优化提升线（Optimization · OPV14-1 ～ OPV14-9）

| 编号 | 机制名称 | 核心落盘模块 | 业务写口与调度路由 | 解决的真实产品断点 |
| :--- | :--- | :--- | :--- | :--- |
| **OPV14-1** | 全域联络协调中枢（Liaison）激活与多角色意图仲裁 | `engines/liaison.js` | `liaison.coordinate`<br>`actionDesk: society.coordinate` | 激活 338 审计中的 liaison 孤岛，统一协调多角色发言优先级、插话与动机冲突。 |
| **OPV14-2** | 信用总账（Credit-Ledger）与生存资源硬约束闭环 | `engines/credit-ledger.js` | `creditLedger.enforceCreditLimit`<br>`actionDesk: finance.enforceCreditLimit` | 激活 credit-ledger 孤岛，将赤字与违约转化为封锁商户、工团罢工等生存硬制裁。 |
| **OPV14-3** | 154 个只读模块反哺：评估驱动行为代价回写 | `engines/action-cost-feedback.js` | `costFeedback.applyEvaluationCosts`<br>`actionDesk: actor.applyEvaluationCosts` | 打破 154 个只读模块孤芳自赏，将 difficulty/action-methods 评估结果强制回写为体力/损耗。 |
| **OPV14-4** | 远方世界离线演化与延迟消息投递真实回流 | `engines/courier-dispatch.js` | `courier.dispatchPending`<br>`actionDesk: chronicle.deliverRemoteEcho` | 解决 farfield/horizon 远方推演成果脱节问题，基于地理距离真实排队并在到期后揭晓。 |
| **OPV14-5** | 城市公共传闻与角色有限认知单向投影纠偏 | `engines/rumor-cognition.js` | `rumorCognition.projectRumorToActor`<br>`actionDesk: society.projectRumor` | 杜绝全知泄露，传闻依据社交圈层与情报网衰减投递，形成私有主观偏见档案。 |
| **OPV14-6** | 场景行动桌（ActionDesk）多角色协同操作台升级 | `engines/action-desk.js` | `actionDesk.boardMulti`<br>`actionDesk.planMulti` | 行动桌支持同屏 2~5 人博弈态势板，计算利益交集、行动阻断与多角色协同议程。 |
| **OPV14-7** | 阵营离心力与组织分裂/篡位连锁反应闭环 | `engines/faction-schism.js` | `factionSchism.triggerSchism`<br>`actionDesk: faction.triggerSchism` | 离心倾向突破临界时，自动触发派系拆分、反叛首领篡位与城市资产瓜分落盘。 |
| **OPV14-8** | 微气候与空间声学对生活日程的物理级排他干预 | `engines/environment-interference.js` | `envInterference.disruptRoutines`<br>`actionDesk: environment.disruptRoutines` | 暴雪、毒气或声学阻尼强制阻断 day-route 通勤，迫使 NPC 滞留室内或更改日常。 |
| **OPV14-9** | 历史分支语义对比（Branch-Diff）与局部记忆移植 | `engines/branch-transplant.js` | `branchTransplant.transplantFact`<br>`actionDesk: chronicle.transplantFact` | 打通只读 branchDiff，将平行世界线探索经历降级为“既视感/残余记忆”受控植入。 |

---

## 二、 拓展创新线（Expansion · EXV14-1 ～ EXV14-9）

| 编号 | 机制名称 | 核心落盘模块 | 业务写口与调度路由 | 机制创新与玩法价值 |
| :--- | :--- | :--- | :--- | :--- |
| **EXV14-1** | 公开宣称与私密背刺双轨视界分离（Whisper & Public Scope） | `engines/whisper-backchannel.js` | `whisper.sendWhisper`<br>`actionDesk: actor.sendWhisper` | 彻底拆分群聊公开表态与私下密谈，结合声学距离计算隔墙窃听与背刺告发。 |
| **EXV14-2** | 连带债务穿透与社会信用联合制裁（Collateral Rupture） | `engines/collateral-rupture.js` | `collateral.ruptureCollateral`<br>`actionDesk: finance.ruptureCollateral` | 主债务人违约触发担保人连带冻结，诱发人际追杀、信誉降维与宗族背离。 |
| **EXV14-3** | 伏笔自驱破土与历史遗留代价反噬（Foreshadow Germination） | `engines/foreshadow-germination.js` | `foreshadowGermination.germinate`<br>`actionDesk: drama.germinateForeshadow` | 历史伏笔种子具备成熟周期，满足环境/时钟条件后强制破土为核心危机。 |
| **EXV14-4** | 险道封闭与物资供应链动态断裂传导（Supply Choke） | `engines/supply-choke.js` | `supplyChoke.triggerChoke`<br>`actionDesk: environment.triggerSupplyChoke` | 关键交通险道塌方切断物资流，城市库存递减触发市民抢购限购与黑市暴利。 |
| **EXV14-5** | 假情报投毒与多角色认知盲区博弈（Cognitive Poisoning） | `engines/cognitive-poisoning.js` | `poisoning.plantForgedIntel`<br>`actionDesk: society.plantForgedIntel` | 允许角色通过密道投毒伪造情报，未被识破前诱使敌对 NPC 作出致命误判。 |
| **EXV14-6** | 复合利益困局动态生成与非零和协商协议（Dilemma Bargain） | `engines/dilemma-bargain.js` | `dilemmaBargain.negotiate`<br>`actionDesk: drama.negotiateDilemma` | 装配多方不可兼得利益困局，基于效用函数判定多方是否共同签署和解契约。 |
| **EXV14-7** | 制度变迁门槛与地方行会自治风潮（Institutional Schism） | `engines/institutional-schism.js` | `schism.enactReform`<br>`actionDesk: chronicle.enactReform` | 思想舆论发酵突破阻尼后，触发市政厅公决，永久改变特定世界规则集。 |
| **EXV14-8** | 空间坍缩避险与有限庇护所生存竞争（Sanctuary Scramble） | `engines/sanctuary-scramble.js` | `sanctuary.scramble`<br>`actionDesk: survival.scrambleSanctuary` | 灾难爆发时有限容纳位触发求生博弈，产生牺牲、让渡或暴力驱逐的人性弧光。 |
| **EXV14-9** | 深度反事实推演沙盘与虚实对照回响（Counterfactual Echo） | `engines/counterfactual-echo.js` | `counterfactualEcho.evokeEcho`<br>`actionDesk: drama.evokeCounterfactualEcho` | 历史抉择分歧在特定时刻作为“心魔/梦魇”回响，影响角色意志与潜台词。 |

---

## 三、 贯通新场景专锁矩阵（场景 11 ～ 场景 16）

1. **场景 11：暗流密室之会（多角色协同与私密耳语视界）**：
   - 旅店多方会谈，Liaison 仲裁 NPC 发言次序；张三公开支持商会协议，私下通过耳语向李捕头递送背刺密信；在场保镖敏锐截获触发告发危机（覆盖 OPV14-1 / EXV14-1）。
2. **场景 12：黑市债务清偿与连带信用穿透**：
   - 商行掌柜信用赤字突破硬上限，触发全城商会联合抵制；掌柜潜逃导致担保人房产被扣押，担保人反水带领捕快围堵黑市老巢（覆盖 OPV14-2 / EXV14-2）。
3. **场景 13：雪崩险道与物资供应链瘫痪**：
   - 北境峡谷暴雪塌方封路，生药与精铁运输线断裂；城内药铺发生恐慌抢购，黑市价格飙升三倍，行会紧急出台定量配给限购令（覆盖 OPV14-4 / EXV14-4）。
4. **场景 14：谍报投毒与致命误判困局**：
   - 密探制造伪造关防调兵令诱骗守将移防；守将洞察力不足中计出击；多方利益纠缠下玩家组织和解谈判桌，避免流血冲突（覆盖 OPV14-5 / EXV14-5 / EXV14-6）。
5. **场景 15：行会自治风暴与派系破裂政变**：
   - 期刊思潮指数积累引发工团公决抗税，旧领主阵营内部离心爆发，副将发动兵变篡夺兵权，城市底层税收规则永久改写（覆盖 OPV14-7 / EXV14-7）。
6. **场景 16：空间坍缩避难与反事实梦魇终极收口**：
   - 地脉震颤引发地牢空间坍缩，唯一庇护所名额有限；角力求生后残存者故地重游，心魔回响浮现出未曾发生的平行结局（覆盖 OPV14-3 / OPV14-8 / OPV14-9 / EXV14-8 / EXV14-9）。

---

## 四、 铁律纪律
1. **坚决拒绝纯函数假落地**：所有机制必须具备独立数据存储、控制器写口、ActionDesk 集中调度与场景专锁真实调用。
2. **全链路死导出门禁零新增**：任何新导出的方法必须在生产代码或场景专锁中具备真实引用。
3. **严格配备破坏性负控制测试**：每项机制必须配有参数篡改、非法输入或前置缺席的断言，确保门禁真报警而非恒真假绿。
4. **双计划完工前严禁全量回归**：保持敏捷收口节奏，以定向场景专锁作为唯一衡量尺度。
