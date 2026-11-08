# WorldAxis 优化提升计划：OPV18-1 至 OPV18-9
> **工程归属**：WorldAxis 活世界引擎系统 (`/home/user/wa_opt1`)  
> **基线**：`v2.330.0` / commit `9b101d7`  
> **核心哲学**：框架中立，全题材通用（Genre-Neutral Architecture）  
> **实施纪律**：**双计划全部完成前，不执行全量回归（`node tests/run.js`）**。聚焦定向专锁、行为真源断言与局部闭环收口。测试门禁与死导出审计属于默认交付条件，不占 18 项名额。
---
### OPV18-1 · 人性宿怨恩仇分化与实质赔偿硬门禁
- **现状底座**：`engines/human-realism.js` 的 `settleGrudge` 只要传入非空 `resolution`，便无条件判定 `settled=true` 并增加 `joy`，抹杀人性深层矛盾。
- **本期改造**：
  1. 拆分宿怨化解维度：`compensationAccepted`（赔偿收下）、`truceAgreed`（表面停火）与 `heartForgiven`（彻底释怀）；
  2. 引入实质赔偿价值检定（`compensationValue` 必须对齐甚至超出侵害损失）；
  3. 支持“收下买命钱但怀恨在心（`cold_grudge`）”，在角色没有真心原谅前，暗中阻抗与背刺概率仍存；
  4. 唯有当真诚赔偿、诚恳谢罪与时间冲淡三重满足时，才清除心结并恢复正常情感。
- **调度接口**：
  - `humanRealism.settleGrudgeAdvanced(actorId, grudgeId, spec)`
  - `actionDesk: bio.settleGrudge`
- **验收旅程与负控制**：
  - 正向：受害角色收下三倍赔偿金后达成停火（`truce=true`），但心结尚未原谅（`forgiven=false`），拒绝主动提供协助；
  - 负控制：赔偿金额低于损失或无实质付出（`value <= 0`），强行调用释怀断言直接拒绝（`refusal: 'insufficient-compensation'`）。

---
### OPV18-2 · 人物生活状态机事务与时间域统一化
- **现状底座**：`engines/human-realism.js` 的 `getRoot` 直接返回内部对象引用，绕过持久化事务修改；`engines/day-route.js` 混用小时与毫秒。
- **本期改造**：
  1. `human-realism.js` 的所有生理指标写口全量接入 `store.transact`，提供回滚与校验支持；
  2. 严格规范生活日程时间戳：统一使用 ISO 时分与全局世界钟单调递增时钟戳，彻底清除设备墙钟干扰；
  3. 日程命中判定与状态机变迁通过原子事务落盘，拒绝脏读。
- **调度接口**：
  - `humanRealism.transactNeeds(actorId, updaterFn, reason)`
  - `dayRoute.syncTimeDomain(timestamp)`
- **验收旅程与负控制**：
  - 正向：多并发修改角色体力与饥渴时，经由 `store.transact` 保证数据 ACID 一致性；
  - 负控制：事务内抛出异常或校验失败时，断言状态自动回滚至修改前，严禁内存状态单向漂移。

---
### OPV18-3 · 暗流日历阶段别名全谱系对齐与推进器
- **现状底座**：`engines/undercurrent-calendar.js` 面对上游阶段词表（起线/延展/成形/收束/淡出）有 4 段走兜底 fallback，且暗流全靠外部被动写，缺乏自主推进动力学。
- **本期改造**：
  1. 在 `STAGE_WINDOWS` 中显式扩展 `起线/initiation`、`延展/extension`、`成形/maturation`、`收束/convergence` 与 `淡出/fadeout`，赋予精准的 `etaDays` 与张力窗口；
  2. 强化 `engines/storyline-advance.js` 作为暗流的核心推进器，根据推演轮次、时间跨度与未结算因果动态推进阶段。
- **调度接口**：
  - `undercurrentCalendar.normalizeStage(rawStage)`
  - `storylineAdvance.advanceUndercurrent(currentId, roundsElapsed)`
- **验收旅程与负控制**：
  - 正向：暗流状态输入“起线”，精准解析为潜伏酝酿期（`urgency: 'low'`，`etaDays: 5`），推进 3 轮后自主过渡为“延展”；
  - 负控制：已处于“淡出”或“已收束”的暗流，推进器断言禁止再次倒流或重复推进。

---
### OPV18-4 · 物种豁免矩阵的人物设定证据穿透
- **现状底座**：`engines/human-realism.js` 中 `PRESET_EXEMPTIONS` 仅根据物种名（divine/construct/spirit）一刀切豁免全部肉身机能，无法处理同人复杂设定。
- **本期改造**：
  1. 建立角色私有人设事实优先仲裁链（`evidenceBasedExemption`）；
  2. 角色声明（如“具备痛觉神经的仿生机械人”、“转世历劫需受饥馑之苦的神明”）强力覆写预设豁免白名单；
  3. 支持分项细粒度豁免（`hunger`, `fatigue`, `pain`, `emotion`, `excretion`），杜绝打包化。
- **调度接口**：
  - `humanRealism.evaluateExemption(actorId, needCategory, customTraits)`
- **验收旅程与负控制**：
  - 正向：神明角色若被人设标记为“散功受难中”，对其施加饥饿与剧痛判定正常生效；
  - 负控制：无任何私有弱点声明的纯粹灵体角色，断言其生理饥渴指标绝对保持豁免（`exempt=true`）。

---
### OPV18-5 · 角色核心人格渐进位移与重大事件判据
- **现状底座**：`engines/persona-anchor.js` 判定重大事件时阈值固定且判据不统一，缺乏长期温和环境熏陶导致的性格渐进位移。
- **本期改造**：
  1. 统一重大事件判据：综合考虑事件情感烈度（`intensity`）与事实证据链（`evidence`）；
  2. 引入长效环境漂移模型：在特定阵营或氛围（如血腥杀戮竞技场 vs 清修道观）长驻时，角色的宽容度/好战性以微小斜率渐进演变；
  3. 保留防崩坏底线锚点，防止角色人设一夜突兀撕裂。
- **调度接口**：
  - `personaAnchor.applyPersonalityDrift(actorId, environmentalBias, durationWeeks)`
- **验收旅程与负控制**：
  - 正向：温和文官长期置身边塞军旅，决断力与坚韧度逐步提升；
  - 负控制：单次轻微琐碎事件（`intensity < 30` 且无证据），断言绝对禁止改变角色的核心道德取向。

---
### OPV18-6 · 多角色动态排班冲突与连续课表/通勤
- **现状底座**：`engines/labor-schedule.js` 采用粗粒度（morning/afternoon/evening）排他插槽，不足以表达连续授课、午休用餐与通勤耗时。
- **本期改造**：
  1. 引入连续时间区间模型（基于标准小时分钟段）；
  2. 增加通勤滞留缓冲：两项位于不同地点的日程之间必须保留基于空间拓扑的通勤时间，否则判定为“赶场冲突（`transit_conflict`）”；
  3. 支持早读、连堂课程、紧急临时插班。
- **调度接口**：
  - `laborSchedule.bookTimeSlot(actorId, startHour, endHour, activityKind, locationNodeId)`
- **验收旅程与负控制**：
  - 正向：角色在上完上午课程后，系统自动预留 30 分钟午餐与通勤缓冲，再衔接下午研究；
  - 负控制：在跨城两地无间断安排日程（通勤时间为 0），排班算法断言直接判定重叠冲突拒绝入账。

---
### OPV18-7 · 提示词注面逐边诊断与节拍梯度压缩器
- **现状底座**：`engines/inject-collector.js` 在装配生成上下文时，各模块信息被平铺注入，缺乏剧情阶段的呼吸节拍。
- **本期改造**：
  1. 引入剧情张力感知过滤器（`tensionPacing`）；
  2. 平静期（张力低）：仅注入日常生活、轻度人际与环境氛围白描，深度因果与战斗机制深水折叠；
  3. 决战期（张力高）：强力抑制生活琐事杂音，全额释放要害创伤、政变危局、致命悬念与契诃夫之枪。
- **调度接口**：
  - `injectCollector.compilePaced(currentTension, contextBudget)`
- **验收旅程与负控制**：
  - 正向：在高危生死交锋时，提示词注入面自动剔除“午餐吃了什么”等琐碎日常，聚焦生死战局；
  - 负控制：当张力为 0 的宁静闲暇时刻，断言禁止注入灭门血海仇杀等危急性前置警告。

---
### OPV18-8 · 跨插件真源投影双向防重与心智镜像增强
- **现状底座**：`engines/bridge.js` 单向汇出快照，但缺乏针对高频对抗事件的幂等防重与两阶段反向回响。
- **本期改造**：
  1. 快照扩展 `v18EpicClash` 命名空间，汇出当前战术对抗胜负、要害伤情、通缉名单与围城物资；
  2. 建立交易幂等防重表（`processedTxMap`），防止网络重试导致相同创伤或奖赏重复结算；
  3. 支持 LonSha 与 RubyPhone 快速查询世界轴客观事实真源。
- **调度接口**：
  - `bridge.atomicTransact(txId, phase, payload)`
- **验收旅程与负控制**：
  - 正向：战局要害重创原子性投送至 bridge，外部系统可读且只读安全；
  - 负控制：重复传入相同 `txId` 的不同提交，断言直接触发防重拒绝（`reason: 'duplicate-transaction'`）。

---
### OPV18-9 · 全域 363 引擎因果能耗平衡与死循环硬切断
- **现状底座**：`engines/cascade-bus.js` 在多层级传导中若遇到相互报复回路，可能出现同频能量不衰减震荡。
- **本期改造**：
  1. 为每一笔总线事件引入因果动能消耗模型（`energyBurn`）；
  2. 事件跨层传导时，能量逐级对数衰减（`decay = 0.75`）；
  3. 当回环检测器捕获到死循环模式且无外部新变量引入时，强制触发“疲态收敛（`fatigue_dampening`）”并终结级联。
- **调度接口**：
  - `cascadeBus.pruneCausalRunaway(cascadeChainId)`
- **验收旅程与负控制**：
  - 正向：两个世仇家族在经历三次交火后，因果动能耗尽，自动收敛为冷战对峙；
  - 负控制：能量充足且单向线性推进的重大主线因果，断言绝不误触阻尼切断。