# WorldAxis V23 超级史诗总纲领：全域因果觉醒与深层涌现文明大系

> **工程根基**：`/home/user/wa_opt1`（WorldAxis 活世界引擎系统）  
> **基线起点**：`v2.407.0` / commit `e48d16a` / 408 核心引擎 / 554 证据条目  
> **设计哲学**：**框架中立、全题材通用（Genre-Neutral Architecture）**，不绑定特定题材与特定世界观；拒绝对话层虚胖修饰，坚决贯彻“**无源不入账、无写不落盘、无验不上线**”的世界仿真工程铁律。  
> **实施纪律**：**双计划全部完成前，严禁执行 85 分钟全量回归（`node tests/run.js`）**。每项独立交付必须携带专属定向专锁（真源码破坏负控制自证），所有新接口均配齐 ActionDesk 统一写口、容量边界与死导出闭环。

---

## 零、立项依据与当前缺陷审计（G1～G8）

每条缺口均有可复算命令。指不到下表的条目不进计划。

| 编号 | 缺口（现场实测事实） | 复算路径 | 归属治理 |
| :--- | :--- | :--- | :--- |
| **G1** | **实物经济与资源流通真空**：全域 408 个引擎中，经贸模块仅占 2 个（`economy`/`market`），缺乏物资实物库存、跨域路线损耗与信用债务违约链。 | `grep -rn 'stockpile\|commodity' engines/` | EXV23-1 |
| **G2** | **具身伤残与知觉剥夺缺失**：角色伤病仅为宏观数值，无解剖层级创伤（骨折/断肢/失血），缺乏知觉感官盲区（耳鸣/失明/虚弱重影）的提示词注入与行动惩罚。 | `grep -rn 'amputation\|triage' engines/` | EXV23-2 |
| **G3** | **心智解离与群体狂乱盲区**：缺乏创伤闪回（Flashback）、偏执妄想、记忆虚构（Confabulation）以及城市级暴民恐慌踩踏动力学。 | `grep -rn 'dissociation\|confabulation' engines/` | EXV23-3, EXV23-4 |
| **G4** | **物理地质与器械材质疲劳空白**：暴雨地震仅为临时天气标签，无道路地貌永久冲毁塌方；冷兵器与机械无应力疲劳、形变卡死与炸膛碎裂机制。 | `grep -rn 'metalFatigue\|ruptureInfrastructure' engines/` | EXV23-5, EXV23-6 |
| **G5** | **谍报暗桩与门阀宗族法统缺失**：缺乏双重效忠、死信箱暗号通讯、宗族三代族谱门荫特权、遗传病隐疾与嫡庶争夺法统。 | `grep -rn 'deadLetter\|lineageBloodline' engines/` | EXV23-7, EXV23-8 |
| **G6** | **级联总线孤岛化**：`engines/cascade-bus.js` 虽有六层结构，但 300+ 引擎处于 L2e/L3 孤岛，未建立层间自愈因果波（Atmosphere→Somatic→Tactical→Social→Epochal）。 | `grep -rn 'dispatchAdaptiveWave' engines/` | OPV23-1 |
| **G7** | **复合动作事务缺乏原子保障**：`actionDesk` 仅支持单动派发，多动组合若中途失败会导致状态撕裂；推演模型输入中缺乏物理法则硬约束。 | `grep -rn 'transactActions' engines/action-desk.js` | OPV23-2, OPV23-3 |
| **G8** | **时空试演沙盒缺失与长局千轮膨胀**：缺乏秒级无损影子分支试演（Time-Travel Fork）；长局 500+ 轮缺乏死外键孤儿垃圾回收与深度紧凑压缩。 | `grep -rn 'forkBranch\|runDeepEvictSweep' core/` | OPV23-4, OPV23-8 |

---

## 一、拓展创新线（EXV23-1 ～ EXV23-9）

| 编号 | 机制名称 | 落盘模块 | 机制核心与验收边界 |
| :--- | :--- | :--- | :--- |
| **EXV23-1** | 物资流转、大宗商路与债务清算 | `engines/commodity-circulation.js` | 实体物资储量（stockpile）、运力损耗、商业借据（promissoryNote）、违约追讨。写口：commodityCirculation.transferCargo / market.transferCargo |
| **EXV23-2** | 具身创伤、肢体残损与知觉感官盲区 | `engines/somatic-trauma.js` | 解剖分部伤害、动脉出血、耳鸣致盲与注入面知觉剪裁、创口坏疽。写口：somaticTrauma.inflictWound / body.inflictWound |
| **EXV23-3** | 心智解离、创伤闪回与记忆虚构 | `engines/psyche-dissociation.js` | 创伤闪回（flashback）、投射敌意、偏执妄想、被盘问时虚构记忆。写口：psycheDissociation.triggerTraumaShock / mind.triggerTraumaShock |
| **EXV23-4** | 群体无意识狂乱、暴民踩踏与谣言裂变 | `engines/mob-stampede.js` | 谣言每轮裂变激化、人群聚集度与恐慌踩踏、城门阻塞与商铺纵火。写口：mobStampede.igniteRumorWave / crowd.igniteRumorWave |
| **EXV23-5** | 水文侵蚀、地表崩塌与天灾地貌重塑 | `engines/geophysical-reshaping.js` | 暴雨堰塞湖溃决、山体滑坡导致道路拓扑永久熔断（impassable）。写口：geophysicalReshaping.simulateTerrainShift / geo.simulateTerrainShift |
| **EXV23-6** | 冶炼物理疲劳、材料裂解与器械损耗 | `engines/artifice-degradation.js` | 兵器防具机械疲劳（metalFatigue）、铠甲卡死、超频炸膛、环境锈蚀。写口：artificeDegradation.applyStress / craft.applyStress |
| **EXV23-7** | 影子议会、潜伏暗桩与双面谍报契约 | `engines/shadow-council.js` | 双重效忠度、暗室死信箱（dead-drop）、密语信标、紧急灭口自毁。写口：shadowCouncil.infiltrateAgent / spy.infiltrateAgent |
| **EXV23-8** | 门阀族谱、血脉门荫与嫡庶承袭争夺 | `engines/dynastic-lineage.js` | 三代五服族谱、门荫免试入仕、近亲遗传病、长老会立嗣夺嫡政变。写口：dynasticLineage.bindLineage / clan.bindLineage |
| **EXV23-9** | 纪元终局演化、世界奇点与大势收敛 | `engines/world-singularity.js` | 全局张力时钟（0~100）、终局奇点收束幕、文明纪元跃迁大势重置。写口：worldSingularity.advanceSingularityTension / epoch.advanceSingularityTension |

---

## 二、优化提升线（OPV23-1 ～ OPV23-9）

| 编号 | 机制名称 | 落盘模块 | 现状治理与技术指标 |
| :--- | :--- | :--- | :--- |
| **OPV23-1** | 408 引擎 Cascade Bus 六层因果波全域接线 | `engines/cascade-bus.js` | 五层因果自适应广播（Atmosphere→Somatic→Tactical→Social→Epochal），带三级循环熔断自愈。 |
| **OPV23-2** | ActionDesk 复合多动原子事务与前置预检 | `engines/action-desk.js` | 支持 transactActions([s1, s2, s3]) 原子批处理，任一失败全量事务回滚。 |
| **OPV23-3** | Backstage 主动推演认知扩容与物理法则注面 | `engines/backstage.js` | compactState 增 world_physics 物理法则硬约束，输出增加反常识事后审计拦截。 |
| **OPV23-4** | 时空分支秒级差分试演（Time-Travel Fork）沙盒 | `core/store.js` + `direction/` | store.forkBranch 纯内存克隆影子树空转 3~5 轮，零污染产出因果分叉差异报告。 |
| **OPV23-5** | 具身知觉自适应剪裁与注意力稀疏化注入 | `render/inject.js` | 引入生死显著性算法（Saliency Scoring），近身危机彻底静默 80% 宏观背景，聚焦微观生理。 |
| **OPV23-6** | 资源因果排他租约锁与并发竞态围栏 | `core/store.js` | acquireResourceLease 悲观互斥锁，多引擎抢夺资源优先级仲裁，杜绝负库存。 |
| **OPV23-7** | World-Reader 全息动态事件流瀑布与地缘热力拓扑 | `engines/world-reader.js` | 流式事件因果卡片呈现，区域紧张度/繁荣度地缘态势热力下钻，纯只读无状态。 |
| **OPV23-8** | 千轮长局深度自愈、弱引用淘汰（GC）与状态紧凑化 | `core/evict.js` + `core/store.js` | 孤儿外键引用自动脱扣回收，压缩冗余空字段，千轮存档体积下降 50% 以上。 |
| **OPV23-9** | 极速分层回归调度器与真破坏自愈矩阵 | `tools/smart-runner.js` | 构建 L0~L3 四级金字塔测试（10s/45s/3min/全量），解决长时间运行超时中断。 |

---

## 三、贯通场景专锁矩阵（场景 62～67）

1. **场景 62：物资断绝→商路溃散→债务挤兑→平民暴动** (`tests/scenario-v62-famine-debt-riot.js`)
   - 粮食短缺 → 物价暴涨 → 商贾借据违约 → 恐慌谣言裂变 → 暴民踩踏冲击官仓。
2. **场景 63：具身创伤→知觉致盲→战术失衡→心智闪回** (`tests/scenario-v63-somatic-blind-flashback.js`)
   - 头部贯穿耳鸣目眩 → 注入面环境剥离 → 闪回发作投射敌意 → 战术动作受阻。
3. **场景 64：暴雨决堤→道路塌方断绝→军情受阻→伏击全歼** (`tests/scenario-v64-flood-landslide-ambush.js`)
   - 地质崩塌冲毁道路拓扑 → 驿马路线熔断延误 → 增援受阻 → 装备疲劳断弦。
4. **场景 65：宗族夺嫡→影子潜伏→死信箱刺杀→法统更迭** (`tests/scenario-v65-lineage-dead-drop-coup.js`)
   - 长老会立嗣争端 → 双重效忠死信箱传递布防图 → 毒杀家主 → 夺取宗主印信。
5. **场景 66：时空差分试演→原子复合行动→因果租约裁决** (`tests/scenario-v66-fork-atomic-lease.js`)
   - 影子沙盒无损空转试演 → 复合原子事务提交 → 资源互斥锁防负库存。
6. **场景 67：V23 终极跨域大融合大系专锁** (`tests/scenario-v67-v23-grand-singularity.js`)
   - 奇点张力突破临界 → 终末收束幕推进 → 六层总线级联涌现 → 全息事件瀑布流与全域状态自愈。

---

## 四、实施铁律与验收规约

1. **先专锁、再实现、真负控制必备**：每个模块交付必须有对应的专项测试，且必须包含对源码的真实破坏负控制（若篡改核心逻辑，专锁断言必须能当场抓住报错）。
2. **写口统一收拢至 ActionDesk**：所有业务写操作必须注册在 `actionDesk.ROUTES` 中，提供统一预检和可读拒收原因。
3. **容量与状态骨架一致性**：新增的持久状态键必须在 `core/evict.js` 中登记站点容量，并在 `core/store.js` 的 `defaultWorldState` 中物化，杜绝悬空直写。
4. **死导出与账本严格受控**：新增公共函数必须拥有调用链证据，未被外部引用的纯程序化读口需显式列入控制账本，禁止任何静默漂移。
5. **双计划期间绝不跑全量**：全部 18 项未交付完成前，严禁启动 85 分钟全量回归，开发收口均走局部闭环与快档门禁。
