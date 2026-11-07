# WorldAxis V16 超级版本纲领：全景双九项演进体系（OPV16-1～9 + EXV16-1～9，共 18 项）
> **项目代号**：WorldAxis 活世界引擎系统（代码根目录 `/home/user/wa_opt1`）  
> **前序基准**：V15 超级活世界版本（commit `1f4e6da`，四层调度总线与 7 大中立物理引擎全量接线入库）  
> **基线版本**：`v2.330.0` / 347 核心引擎 / 491 测试套件 / 1167 死导出受控台账  
> **核心哲学**：**框架中立，全题材通用（Genre-Neutral Architecture）**。严禁题材硬编码，统一采用通用标量、能量守恒、声光介质阻滞、拓扑几何、博弈论效用函数与有限状态机模型。  
> **三插件协同边界铁律**：
> 1. **LonSha 记忆插件**：客观世界事实真源消费端，WorldAxis 仅单向向其投影物理与社会真实事实（严禁自建会话记忆缓存与私有向量记忆库）。
> 2. **RubyPhone 虚拟手机插件**：通信、群聊、LIME/微信与现代社交动态主宰，WorldAxis 通过幂等网关接收手机通信事件并将其转化为物理因果（严禁复刻虚拟聊天 UI 与即时通信界面）。
> 3. **WorldAxis 世界坐标轴**：纯粹客观物理世界发生器、空间几何与介质阻抗、灾难侵蚀、生物机能与长序社会自治演化。
> **工程铁律纪律**：
> 1. **拒绝纯函数与虚假代码**：所有新机制必须具备内部状态存储、控制器写口、ActionDesk 集中调度与场景专锁真实调用。
> 2. **真实破坏性负控制覆盖率 100%**：每个场景专锁必须配有参数越界拦截、非法前置阻断与非恒真失败判据。
> 3. **死导出门禁零反弹**：新增导出函数必须具备真实生产消费点或在 `dead-export-ledger.json` 中完整核减。
> 4. **双计划完工前严禁全量回归**：保持敏捷收口节奏，以定向场景专锁作为唯一衡量尺度。

---

## 零、 立项现状硬读数（现场基线实测）

| 指标维度 | 来源 / 检验命令 | 现场实测读数 | 诊断与演进方向 |
| :--- | :--- | :--- | :--- |
| **系统版本** | `index.js` / `manifest.json` | **v2.324.0 / v2.322.0** | 计划统一对齐跃迁至 **v2.330.0** |
| **顶层引擎文件数** | `ls engines/*.js \| wc -l` | **347 个** | 涵盖 7 个 V15 新引擎与既有 340 引擎底座 |
| **测试套件总数** | `ls tests/*.js \| wc -l` | **491 个** | 包含 20 套场景专锁矩阵与基线保护套件 |
| **死导出受控规模** | `tests/dead-export-ledger.json` | **1167 项** (uiDead: 6) | V15 接线净压降 1 项，V16 持续推动业务消费收敛 |
| **总线调度层级** | `engines/cascade-bus.js` | 4 层自治调度 | 需打通长周期宏观潮汐与突发应激双总线流 |

---

## 一、 优化提升线（Optimization · OPV16-1 ～ OPV16-9）

聚焦于已有引擎的深度贯通、数值闭环、生理边界下限、长时序事实衰变与跨层级联调度增强：

| 编号 | 机制名称 | 核心落盘模块 | 业务写口与调度路由 | 普适通用抽象与解决的核心断点 |
| :--- | :--- | :--- | :--- | :--- |
| **OPV16-1** | **微观代谢与极端环境负荷的双向代偿** | `engines/metabolism-clock.js`<br>`engines/environmental-hazard.js` | `metabolism.applyHazardLoad`<br>`actionDesk: bio.applyHazardLoad` | 彻底打破机能与环境的割裂。在极寒、酷暑、毒瘴环境下，生物体为了抵御恶劣环境必须以 2~5 倍速率额外消耗体能与热量储备，储备耗尽则进入不可逆组织损伤。 |
| **OPV16-2** | **四层总线异步突发事件中断与优先级抢占** | `engines/cascade-bus.js` | `cascadeBus.interrupt`<br>`actionDesk: bus.interrupt` | 解决既有四层总线仅支持周期轮询脉冲的问题。支持突发灾难、刺杀与险阻对各层角色既定常规行为（UniversalRoutine）执行高优先级中断与行动清退。 |
| **OPV16-3** | **同域动线挤压仲裁的动能损耗与伤损判定** | `engines/spatial-conflict.js` | `spatialConflict.resolveKinetic`<br>`actionDesk: geo.resolveKinetic` | 扩展空间争夺模型：在狭道拥挤、恐慌踩踏或掩体争抢中，失败方不仅被动让位，还将承受动能冲击、衣物撕裂与轻微挫伤，形成真实的物理代价。 |
| **OPV16-4** | **物证与感官痕迹的环境介质吸附与异化** | `engines/spatial-trace.js` | `spatialTrace.evolveTrace`<br>`actionDesk: geo.evolveTrace` | 物证不再只是单调线性衰减。多孔材质（泥土、布料、木质）吸收痕迹延长半衰期；流水冲刷加速消除；高温与化学腐蚀使痕迹异化为不可辨识残渣。 |
| **OPV16-5** | **多层暗格搜查的对抗博弈与暴力破坏检验** | `engines/personal-inventory.js` | `inventory.forceInspect`<br>`actionDesk: item.forceInspect` | 扩展搜身对抗：当常规感知检定失败但搜查者高度起疑时，允许采取撕裂缝线、强拆暗格等破坏性手段强制发现，但导致物品破损与人际关系剧烈恶化。 |
| **OPV16-6** | **市井动线交汇视线阻断与盲区背刺仲裁** | `engines/social-encounter.js`<br>`engines/lens-culling.js` | `socialEncounter.checkBlindspot`<br>`actionDesk: stealth.checkBlindspot` | 结合视线遮蔽锥角与环境人流掩护，仲裁暗中尾随、盲区接近与反侦察识破。在高度遮蔽环境下允许近身触发无声暗算。 |
| **OPV16-7** | **全题材作息表反骨偏离与应激滞留重构** | `engines/universal-routine.js` | `universalRoutine.deviate`<br>`actionDesk: routine.deviate` | 彻底杜绝机械化打卡。当 NPC 遭遇恐惧、利益诱惑、重度伤残或外部禁足管制时，自主违抗或中断标准作息，转入避险滞留或地下隐匿状态。 |
| **OPV16-8** | **三插件跨界因果投影的事务原子性保障** | `engines/bridge.js`<br>`engines/phone-bridge.js` | `bridge.atomicTransact`<br>`actionDesk: bridge.atomicTransact` | 针对 LonSha 事实投影与 RubyPhone 手机因果入站，构建原子事务锁。当跨插件物理结算失败时自动执行补偿回滚，杜绝幽灵物品与虚假事实。 |
| **OPV16-9** | **347 引擎全局拓扑环路死锁断路与自愈** | `engines/health-preflight.js` | `healthPreflight.breakDeadlock`<br>`actionDesk: sys.breakDeadlock` | 深度扫描多角色多系统交织下可能出现的“互等资源/互相避让/互相掩护”逻辑环路，超时自动强加随机扰动与断路豁免，保障万轮无卡顿。 |

---

## 二、 拓展创新线（Expansion · EXV16-1 ～ EXV16-9）

聚焦于全新物理规则引入、超视距感知阻抗、微观化学毒性代谢、暗格走私链与动态环境相变：

| 编号 | 机制名称 | 核心落盘模块 | 业务写口与功能体验 | 机制创新与通用题材玩法价值 |
| :--- | :--- | :--- | :--- | :--- |
| **EXV16-1** | **微气候相变与极端介质传导引擎** | `engines/microclimate-phase.js` | `microclimatePhase.simulate`<br>`actionDesk: env.simulatePhase` | 支持水液结冰打滑、泥泞粘滞降速、水雾降低能见度、火油蔓延阻路等通用介质物相转换，直接改变微观节点通行与感知成本。 |
| **EXV16-2** | **生物机能毒素积蓄与生理解毒代谢引擎** | `engines/toxic-metabolism.js` | `toxicMetabolism.metabolize`<br>`actionDesk: bio.metabolizeToxin` | 通用毒素分类（神经麻痹、腐蚀衰减、致幻恍惚、凝血阻滞）。毒素按肝肾代谢半衰期衰减，超限触发运动失调或强制濒死昏迷。 |
| **EXV16-3** | **视听超视距光热与烟火信号传导引擎** | `engines/pyro-telecom.js` | `pyroTelecom.broadcastSignal`<br>`actionDesk: geo.broadcastSignal` | 在无现代通信的自然题材中，基于地理视线遮蔽与地形高度，计算烽火、信号弹、响箭与法宝辉光的有效传播半径与被各方察觉概率。 |
| **EXV16-4** | **全题材地下黑市汇流与走私违禁供应链引擎** | `engines/contraband-pipeline.js` | `contrabandPipeline.smuggle`<br>`actionDesk: market.smuggleContraband` | 联动随身多层暗格与官方关卡管制，建立走私路线风险溢价模型。查获触发全城缉捕，成功走私获得高额收益并改变黑市货源。 |
| **EXV16-5** | **空间群体恐慌共振与踩踏踩空动力学引擎** | `engines/crowd-panic.js` | `crowdPanic.triggerStampede`<br>`actionDesk: geo.triggerStampede` | 灾难突发时，狭小封闭空间内人群焦虑度相互传染共振，演化为失去理智的群体盲动冲撞、出口堵塞与踩踏挤压险情。 |
| **EXV16-6** | **多角色视界非对称谎言与物证比对裁决引擎** | `engines/veracity-arbitration.js` | `veracityArbitration.crossExamine`<br>`actionDesk: society.crossExamine` | 当 NPC 之间就某一事件各执一词时，基于各方有限认知、视听遮蔽程度与现场物证（Trace）留存比对，裁决谁在说谎或记忆失真。 |
| **EXV16-7** | **随身武器装备耐久损耗与物理形变破损引擎** | `engines/gear-wear.js` | `gearWear.applyStress`<br>`actionDesk: item.applyStress` | 道具与防具在承受极端物理冲击、高温侵蚀或过载使用时产生金属疲劳与刃口卷曲，到达临界值直接断裂或功能丧失。 |
| **EXV16-8** | **微观空间掩体物理防护与流弹穿透破片引擎** | `engines/cover-ballistics.js` | `coverBallistics.resolveCover`<br>`actionDesk: combat.resolveCover` | 通用远程攻击（弓箭、枪弹、飞剑、投石）与掩体材质对抗。实木提供有限阻滞，石掩体具备防跳弹，薄铁板存在流弹穿透杀伤。 |
| **EXV16-9** | **沙盘动态微气候与机能体征全局监控大盘** | `ui/panel.js` (V16 扩展) | `panel.renderV16AdvPhysDashboard`<br>`#wa-phys-v16-dash` | 在前端控制台提供微观气候物相分布、毒素代谢曲线图、狭道拥挤度热力图与暗格查验历史的全息控制面板。 |

---

## 三、 贯通新场景专锁矩阵（场景 21 ～ 场景 24）

严格采用真实破坏性负控制硬门禁，形成对 V16 核心机制的绝对闭环验证：

### 1. 场景 21：寒夜泥沼渡口与动能争渡锁 (`tests/scenario-v21-quagmire-crossing.js`)
- **正向路径**：
  - 极端低温使渡口浅水结薄冰，岸边形成深泥泞滑介质（`microclimate-phase`）；
  - 渡河者体能代谢以 3 倍速率骤降，轻微失温（`metabolism-hazard 代偿`）；
  - 最后一艘渡船离岸在即，两名赶路者狭路相逢争抢登船位，触发动能挤压仲裁（`spatial-conflict`）；
  - 胜利者登船，落败者被撞跌入泥沼并承受挫伤代价。
- **负控制门禁**：
  - 若登船者体能已归零（昏迷状态），系统强制拦截登船并转入濒死救援程序，断言绝不可凭空操作。

### 2. 场景 22：密林毒瘴追击与生理解毒代谢锁 (`tests/scenario-v22-toxic-pursuit.js`)
- **正向路径**：
  - 角色逃入充满腐蚀毒瘴的山谷（`environmental-hazard`），吸入神经毒素（`toxic-metabolism`）；
  - 毒素浓度持续上升，机能敏捷度按阶梯受罚，产生动作迟缓失误；
  - 角色服用随身携带的解毒草药，启动机能生理解毒半衰期代谢，压制毒性蔓延；
  - 追兵依据地面遗留的被酸液腐蚀鞋底痕迹（`spatial-trace`）展开定向追踪。
- **负控制门禁**：
  - 追兵若未进行感知检定且环境降水冲刷已达对数阈值，强行搜索必须断言为“无法辨识任何有效物证”。

### 3. 场景 23：关卡暗格强拆与走私违禁截击锁 (`tests/scenario-v23-contraband-pipeline.js`)
- **正向路径**：
  - 走私者将高价值禁运核心封入随身双层暗格（`personal-inventory`）试图通过官方管卡；
  - 哨卡守卫常规搜查未突破暗格阈值，但发现走私者心率异常神色慌乱（`social-encounter`）；
  - 守卫执行破坏性强拆检查（`forceInspect`），划开内衬成功起获违禁品；
  - 违禁供应链触发警报，全城黑市相关渠道紧急切断规避稽捕（`contraband-pipeline`）。
- **负控制门禁**：
  - 守卫若无正当搜查权限或猜疑度低于 50，强行执行破坏性强拆必须被法律/声誉惩罚机制阻断。

### 4. 场景 24：火灾避难所恐慌踩踏与掩体弹道防御锁 (`tests/scenario-v24-panic-cover-ballistics.js`)
- **正向路径**：
  - 市政厅走水引发剧烈火势与浓烟，四层总线立即触发高优先级中断（`cascade-bus.interrupt`）；
  - 大量避难群众涌向单一侧门，焦虑度共振引发恶性群体踩踏冲撞（`crowd-panic`）；
  - 门框受重压变形垮塌阻断通路，主角寻找石质承重墙掩体规避倒塌重物（`cover-ballistics`）；
  - 石质掩体有效抵挡物理冲击，全过程事实单向投影至 LonSha 插件真源（`bridge.snapshot`）。
- **负控制门禁**：
  - 若角色躲藏于薄木板掩体后，面对重型落石断言必须穿透并造成真实骨折伤残，严禁软性免伤。

---

## 四、 分批递进式实施路径与纪律

1. **批次 A（物理微观与生物机能底座）**：
   - 落地 `engines/microclimate-phase.js`、`engines/toxic-metabolism.js`；
   - 强化 `engines/metabolism-clock.js` 与 `engines/environmental-hazard.js` 双向代偿写口；
   - 编写并打通场景 21、场景 22 专锁。
2. **批次 B（动线群体与空间物理对抗）**：
   - 落地 `engines/contraband-pipeline.js`、`engines/crowd-panic.js`、`engines/cover-ballistics.js`；
   - 强化 `engines/personal-inventory.js` 破坏性搜身与 `engines/cascade-bus.js` 突发中断；
   - 编写并打通场景 23、场景 24 专锁。
3. **批次 C（社会认知、装备磨损与跨插件原子闭环）**：
   - 落地 `engines/pyro-telecom.js`、`engines/veracity-arbitration.js`、`engines/gear-wear.js`；
   - 补齐 `engines/bridge.js` 原子性事务与 `engines/health-preflight.js` 死锁熔断。
4. **批次 D（前端全息视窗与死子账本收敛）**：
   - 在 `ui/panel.js` 挂载 V16 全息物理大盘与交互按钮；
   - 执行 `tests/dead-export-gate.js --update` 重新核减死导出台账并回归验收；
   - 统一提升版本至 `v2.330.0` 并提交推送远端。