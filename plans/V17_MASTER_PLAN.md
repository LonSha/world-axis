# WorldAxis V17 超级版本总纲领：全景双九项演进大系（OPV17-1～9 + EXV17-1～9，共 18 项）
> **项目代号**：WorldAxis 活世界引擎系统（代码根目录 `/home/user/wa_opt1`）  
> **前序基准**：V16 活世界全域贯通（commit `bf2c1f2`，18 机制全面接入四层总线、工作流脉冲、真源投影与主生成注面）  
> **基线版本**：`v2.330.0` / 355 核心引擎 / 515 测试套件 / 1167 死导出受控台账  
> **目标版本**：`v2.340.0` / 363 核心引擎 / 525+ 测试套件 / 场景 26～29 专锁 100% 负控制达标  
> **核心哲学**：**框架中立，全题材通用（Genre-Neutral Architecture）**。严禁将规则硬编码为修仙、现代、西幻等单一题材，统一采用心理防御学机制、混沌拓扑传导、因果链多米诺、意识形态模因博弈、博弈论效用函数与文学戏剧张力梯度模型。  
> **三插件生态协同边界铁律**：
> 1. **LonSha 记忆插件**：客观世界记忆真源（WorldAxis 严禁自建对话缓存与私有向量记忆树，只负责向 LonSha 投影深层心智危机与因果大潮客观事实）。
> 2. **RubyPhone 虚拟手机插件**：通信、群聊、LIME/微信消息流与朋友圈 SNS 动态主宰（WorldAxis 严禁复刻虚拟聊天 UI，仅接收通信事件并将其转化为物理因果与心智扰动）。
> 3. **WorldAxis 世界坐标轴**：客观物理演进、长程因果多米诺、深层心智心理学、文明意识形态与戏剧张力悬念的纯粹发生器。
> **工程铁律纪律**：
> 1. **拒绝纯函数与死代码**：所有新机制必须具备内部状态持久化、业务控制器写口、ActionDesk 集中调度与专锁真实消费。
> 2. **真实破坏性负控制覆盖率 100%**：每个场景专锁必须具备参数越界拦截、非法前置阻断与非恒真失败判据。
> 3. **死导出门禁零反弹**：新增导出函数必须具备真实生产消费点或在 `dead-export-ledger.json` 中受控核减。
> 4. **双计划完工前严禁全量回归**：保持高效收口节奏，以定向场景专锁作为唯一衡量尺度。

---

## 零、 现场基线与演进读数

| 指标维度 | 来源 / 检验命令 | 现场实测读数 | V17 目标规划 |
| :--- | :--- | :--- | :--- |
| **系统版本** | `index.js` / `manifest.json` | `v2.330.0` | **跃迁至 v2.340.0** |
| **核心引擎数** | `ls -1 engines/*.js \| wc -l` | **355 个** | **新增 8 大引擎，达 363 个** |
| **测试套件数** | `ls -1 tests/*.js \| wc -l` | **515 个** | **新增场景 26～29 专锁与专项测试** |
| **死导出台账** | `tests/dead-export-ledger.json` | **1167 项** (uiDead: 6) | 严格受控，新增写口全量接线 |
| **总线调度** | `engines/cascade-bus.js` | 4 层自治调度 | **心智动机穿透 + 因果阻尼自愈** |

---

## 一、 优化提升线（Optimization · OPV17-1 ～ OPV17-9）

聚焦于将微观物理与既有 355 引擎深度升级，贯通长程因果与心智反射：

| 编号 | 机制名称 | 核心落盘模块 | 业务写口与调度路由 | 普适通用抽象与解决的核心断点 |
| :--- | :--- | :--- | :--- | :--- |
| **OPV17-1** | **生理极限剧痛与应激惊恐的精神代偿** | `engines/metabolism-clock.js`<br>`engines/human-realism.js` | `metabolism.applyPsychicStress`<br>`actionDesk: bio.applyPsychicStress` | 解决生理机能与心理创伤的割裂。濒死重创、极度严寒或恶性毒发在扣减体力同时，产生剧烈惊恐，迫使意志检定受挫，触发崩溃休克。 |
| **OPV17-2** | **四层总线深层动机与长程意图穿透** | `engines/cascade-bus.js`<br>`engines/intent-board.js` | `cascadeBus.penetrateIntent`<br>`actionDesk: bus.penetrateIntent` | 将底层物理遭遇（被夺、被刺）自下而上穿透到 Layer 3/4，动态重构角色一生追求的意图愿景图谱，杜绝行动随波逐流。 |
| **OPV17-3** | **微观空间私密环境对精神抚慰与冥想自愈** | `engines/spatial-topology.js`<br>`engines/sanctuary-scramble.js` | `spatialTopology.evaluateSanctuaryComfort`<br>`actionDesk: geo.evaluateComfort` | 赋予空间心理学属性。温暖避风的密室、静谧篝火旁或冥想静室加速心理创伤抚平与理智恢复；潮湿恶臭地牢加速理智崩溃。 |
| **OPV17-4** | **现场物证对犯罪动机与心虚神色的实时映射** | `engines/spatial-trace.js`<br>`engines/social-encounter.js` | `spatialTrace.bindGuiltProjection`<br>`actionDesk: geo.bindGuilt` | 当涉案嫌疑人重回作案节点，或在盘查时直面关键物证，自发产生心率过载与神色慌乱破绽，为侦查审讯提供心理学交互。 |
| **OPV17-5** | **多层暗格私藏禁忌信物的心结羁绊与道德负担** | `engines/personal-inventory.js`<br>`engines/bonds.js` | `inventory.anchorKeepsakeBond`<br>`actionDesk: item.anchorKeepsake` | 随身暗格不仅藏工具，还藏亡者遗物、密信血书。信物丢失直接触发绝望悲恸，信物被毁引发狂暴复仇。 |
| **OPV17-6** | **市井传闻情绪极化与集体偏见社会回响** | `engines/rumor.js`<br>`engines/rumor-cognition.js` | `rumor.polarizeSentiment`<br>`actionDesk: society.polarizeSentiment` | 传闻在民间传播中触发群体心理极化与妖魔化夸大，演化为对特定异端、家族或主角的集体排挤仇视风潮。 |
| **OPV17-7** | **作息日常中的梦魇回溯与失眠离魂状态机** | `engines/universal-routine.js`<br>`engines/routine-pacing.js` | `universalRoutine.injectNightmare`<br>`actionDesk: routine.injectNightmare` | 破坏机械化作息打卡。身负重大创伤或惊天秘密的角色，在睡眠窗口期有概率遭遇噩梦惊醒、午夜游荡或借酒浇愁。 |
| **OPV17-8** | **跨插件心智震颤真源单向投影与快照拓展** | `engines/bridge.js` | `bridge.snapshot.v17PsychicCrisis`<br>`bridge.atomicTransact` | 在对外 bridge 只读快照中汇出角色精神创伤指数、狂乱偏执等级与当前戏剧悬念，供 LonSha 长期记忆沉淀与情绪镜像映射。 |
| **OPV17-9** | **全仓 355 引擎因果死循环与概率混沌阻尼器** | `engines/health-preflight.js`<br>`engines/causal.js` | `healthPreflight.dampenCausalLoop`<br>`actionDesk: sys.dampenLoop` | 防御长程因果网络出现自激放大振荡（互怨互害死循环），自动注入物理与时间阻尼实现动态平稳。 |

---

## 二、 拓展创新线（Expansion · EXV17-1 ～ EXV17-9）

推出 8 大全新顶级机制引擎与 1 个全景大盘：

| 编号 | 机制名称 | 核心落盘模块 | 业务写口与功能体验 | 机制创新与通用题材玩法价值 |
| :--- | :--- | :--- | :--- | :--- |
| **EXV17-1** | **混沌蝴蝶长程多米诺因果拓扑引擎** | `engines/butterfly-cascade.js` | `butterflyCascade.triggerFlutter`<br>`actionDesk: causal.triggerButterfly` | 建立微观扰动跨时空级联放大模型。微小的物资短缺或失手刺杀，经数周演化为跨阵营全面冲突或经济休克。 |
| **EXV17-2** | **深层心智创伤、执念与精神失常心理学引擎** | `engines/psyche-trauma.js` | `psycheTrauma.inflictTrauma`<br>`actionDesk: mind.inflictTrauma` | 通用心智防御模型：创伤累积、偏执执念（复仇/狂热/护短）、认知失调否认现实、精神崩溃与黑化/救赎觉醒。 |
| **EXV17-3** | **阴谋集团权谋编织与政变颠覆引擎** | `engines/conspiracy-weaver.js` | `conspiracyWeaver.hatchConspiracy`<br>`actionDesk: faction.hatchConspiracy` | 模拟地下同盟、利益交换、密室名单、暗中买通守备、制造刺杀借口与在特定钟点发动政变夺权的全流程暗潮。 |
| **EXV17-4** | **意识形态模因共振与信仰狂热引擎** | `engines/ideology-memetics.js` | `ideologyMemetics.broadcastMeme`<br>`actionDesk: culture.broadcastMeme` | 无论玄幻香火神道、赛博反叛思潮还是宗教狂热，计算模因感染力、异端排斥度与群体朝圣狂热共鸣。 |
| **EXV17-5** | **戏剧性悬念弧光与契诃夫之枪引爆引擎** | `engines/dramatic-tension.js` | `dramaticTension.primeChekhovGun`<br>`actionDesk: drama.primeGun` | 在故事早期埋下的关键伏笔，设定引爆倒计时与张力阈值，在命运高潮时刻强制破土成为转折点。 |
| **EXV17-6** | **宏观时代浪潮与文明生态周期演化引擎** | `engines/epoch-tide.js` | `epochTide.shiftEpoch`<br>`actionDesk: world.shiftEpoch` | 模拟大时代气候潮汐（凛冬冰封纪元、灵气狂暴潮、废土辐射风暴季、大航海时代），全面改写全图物理常数与社会规则。 |
| **EXV17-7** | **道德两难伦理电车困境博弈引擎** | `engines/moral-dilemma.js` | `moralDilemma.poseDilemma`<br>`actionDesk: drama.poseDilemma` | 构建经典的不可兼得困局（救一人还是救万人、坚守名誉还是屈辱复仇），根据角色心智性格推演其撕心裂肺的抉择代价。 |
| **EXV17-8** | **非对称认知战争与视界虚假现实投毒引擎** | `engines/perception-manipulation.js` | `perceptionManipulation.forgeIllusion`<br>`actionDesk: society.forgeIllusion` | 角色通过伪造死讯、栽赃嫁祸、幻术结界或虚假军情，使敌对方在彻底失真的认知地图中作出自我毁灭式的错误决策。 |
| **EXV17-9** | **V17 全息宏观因果与心智戏剧沙盘大盘** | `ui/panel.js` (V17 扩展) | `panel.renderV17DramaPsycheBoard`<br>`#wa-drama-v17-dash` | 前端全景控制大盘：可视化因果多米诺连锁图谱、角色心智 SAN 值与执念雷达图、政变阴谋进度条与契诃夫之枪引爆倒计时。 |

---

## 三、 贯通新场景专锁矩阵（场景 26 ～ 场景 29）

严格采用真实破坏性负控制硬门禁，形成对 V17 核心机制的绝对闭环验证：

### 1. 场景 26：微光碎裂与心智黑化渡劫专锁 (`tests/scenario-v26-psyche-trauma-blackening.js`)
- **正向路径**：
  - 角色遭遇灭门背叛与深重剧痛（`psycheTrauma`），心理防卫彻底击穿；
  - 偏执执念（`obsession`）指数突破临界，转化为“灭世复仇”，角色发生“心智黑化（`blackening`）”；
  - 作息系统自动切入午夜梦魇失眠状态机（`universal-routine.injectNightmare`）；
  - 主生成 prompt 汇流自动提取心智狂暴白描行。
- **负控制门禁**：
  - 若角色天生具备“心如磐石（`stoic_sage`）”特性或创伤值未达临界（`trauma < threshold`），强行调用黑化接口断言必须被阻断，严禁毫无根据的突兀变脸。

### 2. 场景 27：深宫密谋弑君与政变夺权连锁专锁 (`tests/scenario-v27-conspiracy-coup-domino.js`)
- **正向路径**：
  - 权臣与失势将领组建秘密结盟（`conspiracyWeaver`），编织暗中篡权计划；
  - 投毒制造假警报与虚假防汛军情（`perceptionManipulation`），调离城防禁卫；
  - 午夜时分按计划引爆政变，刺杀目标并控制枢要，地缘政治版图彻底改写；
  - 成功全流程原子性投影至外部真源（`bridge.atomicTransact`）。
- **负控制门禁**：
  - 若密谋名单中任一核心成员忠诚度未跌破叛变阈值，或政变前密道被哨卡破坏性强拆起获密信，政变执行断言直接判定为“密谋败露当场伏诛”。

### 3. 场景 28：寒冬饥荒与电车难题绝境取舍专锁 (`tests/scenario-v28-moral-dilemma-tide.js`)
- **正向路径**：
  - 凛冬冰封大时代浪潮降临（`epochTide`），全城粮道被冻土封锁；
  - 避难所面临生死抉择，触发极端道德电车困局（`moralDilemma`）：牺牲伤病老弱省粮，还是全员等死；
  - 领袖作出残酷抉择后，全体幸存者心理承受剧烈创伤，社会信誉永久分裂。
- **负控制门禁**：
  - 若避难所物资充盈且时代未处于严寒危机，强行调用电车困境接口断言绝不产生悲剧强制抉择。

### 4. 场景 29：蝴蝶展翅与契诃夫之枪命运引爆专锁 (`tests/scenario-v29-butterfly-chekhov-gun.js`)
- **正向路径**：
  - 序章中遗落的一枚带血断簪，被作为契诃夫之枪埋下伏笔（`dramaticTension.primeChekhovGun`）；
  - 历经 10 轮长程多米诺因果级联放大（`butterflyCascade`），在终局对质时被起获；
  - 成为揭露凶手真正身份的铁证，引爆故事终局高潮。
- **负控制门禁**：
  - 若该物证在流转过程中已被高温火化或介质腐蚀消除，断言绝不可通过机械降神无凭无据凭空引爆。

---

## 四、 分批递进式工程实施步调

1. **批次 A（心智心理学与长程因果底座）**：
   - 落地 `engines/psyche-trauma.js`、`engines/butterfly-cascade.js`；
   - 改造 `engines/metabolism-clock.js` 与 `engines/human-realism.js` 心智惊恐联动；
   - 落地场景 26 专锁。
2. **批次 B（政变权谋与认知投毒对抗）**：
   - 落地 `engines/conspiracy-weaver.js`、`engines/perception-manipulation.js`；
   - 改造 `engines/spatial-trace.js` 罪疚心虚映射与 `engines/rumor.js` 情绪极化；
   - 落地场景 27 专锁。
3. **批次 C（时代浪潮、电车难题与契诃夫之枪）**：
   - 落地 `engines/epoch-tide.js`、`engines/moral-dilemma.js`、`engines/dramatic-tension.js`、`engines/ideology-memetics.js`；
   - 落地场景 28 与场景 29 专锁。
4. **批次 D（总线自主循环、主生成汇流与全息大盘）**：
   - `cascade-bus.js` 接入心智动机穿透与因果多米诺；
   - `inject-collector.js` 接入心智黑化、悬念张力与时代潮汐提示词白描；
   - `bridge.js` 汇出 V17 诊断状态，`ui/panel.js` 挂载全息沙盘大盘；
   - 刷新死导出与模块账本，终验收口。
