# WorldAxis 拒收码手册（自动生成：`node tools/gen-error-codes.js`）

> 台账 version：`2.128.0`。**不要手改本文件** —— 生成源是 `reject-v2780.js`（见证/死表）、
> `reject-code-ledger.json`（基线）与产品源码扫描面，手改的内容下一次生成即被覆盖。

共 **607** 个内联拒收码：见证 368 / 死表 8 / 基线 231

三档的含义：**见证**=用产品真 API 把它跑出来过（行为改动会让见证失败，红灯）；
**死表**=已证结构不可达，且钉住「为何不可达」的锚点（锚点消失即红灯）；
**基线**=存量未分类（新增未分类码即红灯）。

## 见证（可执行）（368）

| 码 | 出现之处 | 说明 |
| --- | --- | --- |
| `act-absent` | engines/liaison.js, engines/rehearsal.js | rehearsal.run：改道要交给行动准入面真判 ⇒ 准入面缺席时这一步拒收（不自己算结论）（B7） |
| `action-refused` | engines/opportunity.js | opportunity.respond：行动侧拒绝 ⇒ 回滚阶段，不留「已接但没有动作」的悬空行（B6） |
| `action-throw` | engines/opportunity.js | opportunity.respond：行动侧抛错 ⇒ 归因如实带出，不吞成「不可用」（B6） |
| `actor-claimed-by-other` | engines/coop.js | coop.confirm：这个角色被别的会话占着 ⇒ 拒收并带出持有者（不夺取）（拓展⑨） |
| `adopt-throw` | engines/canon.js | canon.adopt：落盘事务抛异常 ⇒ 如实归因，且**不留半份大纲**（v2.99.0） |
| `ahead-of-head` | engines/session.js | session.since：认的序号比服务端还多 ⇒ 这份客户端不是这条线上来的（拓展⑥） |
| `alias-cycle` | actors/registry.js | registry.bindAlias：自指登记（旧名就是现名 ⇒ 这条边没有意义，v2.97.0 O9） |
| `all-steps-refused` | engines/rehearsal.js | rehearsal.preview：一步都没跑成 ⇒ 不登记预览（读的人会以为它被验证过）（B7） |
| `already-adopted` | engines/stage.js | stage.adopt：已经采纳了一套玩法 ⇒ 换玩法必须显式 replace（拓展⑦） |
| `already-answered` | engines/opportunity.js | opportunity.respond：已作废的行不得再作答（两态不可分）（B6） |
| `already-closed` | engines/mend.js, engines/probe.js | mend.close：已经结过的案不许再结一次（不静默改判）（拓展②） |
| `already-covered` | engines/org.js | org.deliverToProject：精确档项收满即停 ⇒ 报 already-covered（B5） |
| `already-decided` | engines/inst.js | inst.decide：同一项决策不许批两次（已决的案不能再决）（拓展④） |
| `already-delivered` | engines/region.js | region.deliver：同一件事不许落地两次（拓展⑥） |
| `already-linked` | engines/phone-bridge.js | phoneBridge.linkChain：已接过别的链**不覆盖**（静默改写会让「这条链的因」事后被换掉而没人知道，v2.97.0 X5） |
| `already-recording` | core/rand.js | 录制中拒绝再开一卷（防一卷覆盖一卷、前一卷静默丢失） |
| `already-settled` | engines/inst.js | inst.settle：同一笔违约不许结两次（不静默改判）（拓展④） |
| `already-transited` | engines/stage.js | stage.transit：同一条迁移不许换两次（阶段只能往前走一格）（拓展⑦） |
| `anonymous` | core/permissions.js | permissions.adopt：匿名即**收回**闸门当前使用者（退到未启用态），不是登记一个「什么都不许的座」（X6） |
| `awaiting-after` | engines/plan.js | plan.current：剩下的步都被前置卡住 ⇒ 如实报「等前置」，不挑一步顶上（拓展①） |
| `bad-action` | core/audit-log.js | auditLog.record：动作名为空 ⇒ 如实拒收且**不进环**（不静默记一条无名事实，v2.111.0 plan-2 #67） |
| `bad-actor` | engines/collab.js | collab.claim/release/noteConflict：actor 为空 ⇒ bad-actor（缺字段不猜：不按次序编一个人名，v2.112.0 plan-2 #37） |
| `bad-after` | engines/plan.js | plan.expand：前置步指向自己或更后面的序号 ⇒ 会成环，拒收（拓展①） |
| `bad-anchor` | engines/chrono.js | chrono.record：锚点名为空 ⇒ 如实拒收（不记一条没有锚点的变更，v2.112.0 plan-2 #31） |
| `bad-args` | engines/causal.js | defer 传 0 或非数 |
| `bad-base` | engines/chrono.js | chrono.record：`base` 给了但归一后为空（纯空白）⇒ bad-base（**不**当成「这是根」——「他说了有个上游」与「他说没有上游」是两件事，v2.112.0） |
| `bad-behavior` | engines/shadow.js | shadow.recordExperience：观察结果词必须在 NOTICE 里，不猜（B4） |
| `bad-char` | engines/kaleidoscope.js | formula 写不认识的单字符 |
| `bad-choice` | engines/opportunity.js | opportunity.respond：作答词必须落 take/decline/defer 之一（B6） |
| `bad-conflict` | engines/collab.js | collab.resolve：冲突 id 归一后为空 ⇒ bad-conflict（与 bad-session 分开：冲突与会话是两个对象，把前者报成后者会让排查查错表，v2.112.0） |
| `bad-coord` | engines/canon.js, ui/panel.js | canon.locate：坐标语法不对（`zz` / `A` / 空串一律照实拒收——人写的坐标往往不是坐标，v2.99.0） |
| `bad-delta` | engines/beast-bond.js, engines/era-cycle.js, engines/fondness.js, engines/gauge.js, engines/stage.js | gauge.step 传 NaN / ±Infinity（本版从 missing-fields 里拆出的独立根因） |
| `bad-factor` | engines/perf-trace.js | perfTrace.setThresholds：factor <= 1 或非有限数 ⇒ 拒收（劣化与改进不可分辨，v2.109.0） |
| `bad-fn` | engines/causal.js | causal.record / replayWith 收到非函数时如实拒收 |
| `bad-format` | core/audit-log.js, core/rand.js, engines/checkpoints.js, engines/org.js | 信封格式号非有限值 / 不是 JSON / 没有 worldaxisCheckpoint 标记 |
| `bad-guarantor` | engines/mend.js | mend.step：担保人就是当事人之一 ⇒ 第三方才叫担保（拓展②） |
| `bad-id` | engines/chrono.js, engines/kaleidoscope.js | setDerive/setRule 传含空格的 id |
| `bad-kind` | engines/act.js, engines/events.js, engines/inst.js, engines/karma.js, engines/life.js, engines/mend.js, engines/opportunity.js, engines/org.js, engines/region.js, engines/shadow.js, engines/tolerance.js, engines/weather.js, engines/world.js | addCommitment 传非法承诺类型 |
| `bad-lane` | engines/economy.js, engines/region.js | region.register：渠道名不在表里 ⇒ 拒收并带出允许值（拓展⑥） |
| `bad-layer-or-key` | engines/perf-trace.js | perfTrace.mark：层不在封闭集合（或键为空）⇒ 如实拒收、不计数（v2.102.0） |
| `bad-motive` | engines/rumor.js | rumor.relay 传四值以外的动机 ⇒ 拒收（不静默当 honest，v2.96.0 X3） |
| `bad-need` | engines/act.js | act.add：写了资源却没给量 ⇒ 必要条件不完整（B1） |
| `bad-needs` | engines/org.js | org.parseNeeds：档位词表外的词不猜、不回落，照实拒收（B5） |
| `bad-number` | engines/kaleidoscope.js | formula 写 1.2.3 |
| `bad-op` | engines/collab.js, engines/coop.js, engines/kaleidoscope.js | setDerive 传未知算子 |
| `bad-outline` | engines/canon.js, ui/panel.js | canon.adopt：收到不是大纲的东西（面板从没试算过就点采纳 / 外部传了空值，v2.99.0） |
| `bad-pair` | engines/inst.js, engines/mend.js | mend.mark：自己和自己 ⇒ 这不是一段关系，不记这条账（拓展②） |
| `bad-path` | engines/coop.js, engines/kaleidoscope.js | setDerive 传空白 path（resolvePath 首筛，内部可达） |
| `bad-perms` | engines/inst.js, engines/session.js | session.join：申请的权限不在具名表里 ⇒ 不给他一个编不出的权限（拓展⑥） |
| `bad-price` | engines/economy.js | economy.price：价格非正数 ⇒ 这不是一个价（拓展③） |
| `bad-priority` | engines/events.js | events.schedule 传越界优先级 99（合法域 0..9） |
| `bad-proposal` | engines/coop.js | coop：提议 id 是空的 ⇒ 不凭一个空 id 裁决（确认/拒绝/重试同一道闸）（拓展⑨） |
| `bad-qty` | engines/economy.js | economy.stock：数量不是正整数 ⇒ 不记一笔说不清的到货（拓展③） |
| `bad-range` | engines/kaleidoscope.js | range 缺 min/max 或 max<=min |
| `bad-reason` | engines/inst.js | inst.vacate：离任理由不在表里 ⇒ 不给一个编不出的理由（拓展④） |
| `bad-ref` | engines/kaleidoscope.js | formula 写 $+1（$ 后无名字） |
| `bad-resource` | engines/org.js | grant/transfer 空资源名或非正数量 |
| `bad-scope` | engines/checkpoints.js | checkpoints.resolveScope 传不在白名单里的范围 |
| `bad-seed` | core/rand.js | 非有限种子如实拒收复核（NaN/Infinity 不得被当成某个种子） |
| `bad-segments` | engines/kaleidoscope.js | map 缺 segments / segments 里 max 非数 |
| `bad-seq` | engines/session.js | session.since：交上来的序号不是个数 ⇒ 不猜你要哪一段（拓展⑥） |
| `bad-session` | engines/collab.js | collab.open/close/claim：会话标识归一后为空 ⇒ bad-session（不建一个无名会话，v2.112.0 plan-2 #36） |
| `bad-shape` | actors/registry.js | setProfileSafe 传非法形态节 |
| `bad-slot` | actors/registry.js | setPersonaDice 指定不存在的槽位 |
| `bad-source` | engines/world.js | world.addBlock：封锁来源必须是登记过的三种之一，不猜（B2） |
| `bad-step` | engines/plan.js | plan.expand：步骤不是对象 / 没有文本 ⇒ 不猜一步空白（拓展①） |
| `bad-strategy` | engines/collab.js | collab.resolve：策略不在封闭集合里 ⇒ bad-strategy 并附可选策略（**不自动裁决**：分歧怎么判必须由人显式说出，v2.112.0 plan-2 #40） |
| `bad-tape` | core/rand.js | replay 收到不是磁带的入参时如实拒收（不按空卷假装走一遍） |
| `bad-time` | engines/act.js, engines/events.js, engines/life.js, engines/scene-slice.js, engines/world.js | addSchedule end<=start |
| `bad-token` | engines/session.js | session：票不对（指纹不符）⇒ 不认这张票（验票/发言/续传/卸座同一道闸）（拓展⑥） |
| `bad-trigger` | engines/events.js | events.schedule 排期参数不成形（repeat 缺正 intervalMs / delayed 缺 at\|inMs / conditional 缺 condition） |
| `bad-use` | engines/world.js | world.addUse：用途词必须在 USE_KINDS 里，不猜（B2） |
| `bad-weight` | engines/rivalry.js | rivalry.declare 传非数 / 非有限 weight（本版从静默降级改为如实拒收） |
| `bad-word` | engines/kaleidoscope.js | formula 写裸单词 |
| `blank` | core/input-guard.js | 输入边界：纯空白串不是有效文本（v2.84.0 新增） |
| `blocked` | engines/plan.js | plan.current：当前步受阻 ⇒ 如实报「该决策了」（带出受阻步与原因）（拓展①） |
| `blocked-delivered` | engines/world.js | world.effectiveBlockOf：投递层封了该通道 ⇒ 报投递层（与天气层分列）（B2） |
| `breaches-full` | engines/inst.js | inst.breach：违约记录达上限 ⇒ 不静默丢弃（拓展④） |
| `bridge-absent` | engines/liaison.js, engines/rehearsal.js | liaison.receive：桥缺席 ⇒ 这笔只算「本侧暂存待确认」，不假装对方已收到（拓展⑧） |
| `bridge-threw` | engines/liaison.js | liaison.receive：桥登记时抛错 ⇒ 同样只降级为待确认，并如实报因（拓展⑧） |
| `budget` | engines/act.js, engines/events.js | events.claim 本轮预算用尽 ⇒ 超额者进 deferred（显式留痕，不是静默跳过） |
| `build-throw` | engines/canon.js | canon.buildOutline：切分过程内部异常 ⇒ 与「你给的东西不对」分开报（引擎坏了是另一件事，v2.99.0） |
| `cannot-afford` | engines/economy.js | economy.buy：钱不够就是不够 ⇒ 不把欠款伪装成成交（拓展③） |
| `cases-full` | engines/probe.js | probe.open：卷宗表已满 ⇒ 不静默丢弃旧案（先结案再立案）（拓展⑤） |
| `chains-full` | engines/rumor.js | rumor.startChain 超出 maxChains ⇒ 拒收（满员拒收不挤出，v2.96.0 X3） |
| `change-not-applied` | engines/stage.js | stage.transit：迁移清单没逐项生效 ⇒ 换阶段不是一句宣告（拓展⑦） |
| `checksum-mismatch` | engines/checkpoints.js | 信封校验和与正文对不上（搬运途中被改写） |
| `claimed-by-other` | engines/collab.js | collab.claim：同一 actor 已被**另一个**会话占用 ⇒ claimed-by-other 并带出持有者（不夺取、不做超时夺锁 —— 让调用方自己决定，v2.112.0 plan-2 #36） |
| `clear-throw` | engines/canon.js | canon.clearOutline：清空事务抛异常 ⇒ 如实归因（v2.99.0） |
| `condition-unmet` | engines/events.js | events.claim 时不传 metConditions（世界条件未足 ⇒ 状态零变化） |
| `contrast-failed` | render/inject.js | render.themeContrast：对照返回空 ⇒ 如实归因 contrast-failed（不把它读成「一致」）（X7） |
| `contrast-thrown` | render/inject.js | render.themeContrast：模块级对照抛错 ⇒ 不吞掉，如实记为 contrast-thrown（X7） |
| `cycle` | engines/kaleidoscope.js | 两个派生量互相引用 |
| `deals-full` | engines/liaison.js | liaison.createDeal：约定表已满 ⇒ 不静默丢弃旧约定（先了结）（拓展⑧） |
| `debts-throw` | ui/panel.js | panel：欠账读数抛错 ⇒ 回执如实报 debts-throw（B5） |
| `div-zero` | engines/kaleidoscope.js | formula 除以 0 |
| `duplicate` | engines/collab.js, engines/events.js | events.schedule 同 id 且仍在活动态（不静默覆盖既有排期） |
| `duplicate-hypothesis` | engines/probe.js | probe.open：两条候选指向同一 id ⇒ 不把同一个人记两遍（拓展⑤） |
| `duplicate-project` | engines/org.js | org.openProject：同名未结项 ⇒ 拒收（否则账面答不出货进了哪一个）（B5） |
| `duplicate-receipt` | engines/act.js, engines/events.js | events.complete 同一 opId 二次回报（重放不二次结算） |
| `duplicate-tick` | engines/economy.js | economy.tick：同一时段戳重复结算 ⇒ 拒收（否则一次时段被消费两遍）（拓展③） |
| `empty-post` | engines/inst.js | inst.vacate：这个职位本来就没人占 ⇒ 没有可离任的人（拓展④） |
| `events-full` | engines/region.js | region.occur：传播队列已满 ⇒ 拒收并带出上限（拓展⑥） |
| `evidence-full` | engines/probe.js | probe.addEvidence：本案证据已达上限 ⇒ 不静默丢弃（先定案或另立一案）（拓展⑤） |
| `exec-absent` | engines/rehearsal.js | rehearsal.run：执行面缺席 ⇒ 试演不做假装（没有执行面就没有「在快照上跑」）（B7） |
| `expr-too-long` | engines/kaleidoscope.js | formula 表达式超过长度闸 |
| `fault-handled` | core/fault-context.js | faultContext.wrap：被包装调用抛出且未声明 rethrow ⇒ 如实吞错并归因（v2.110.0 plan-1 #21） |
| `flush-failed` | core/audit-log.js | auditLog.flush：setItem 抛错 ⇒ 吞成 flush-failed（落盘失败不许把调用方搞挂，与 record() 的「从不抛」同一条纪律，v2.112.0） |
| `fondness-missing` | engines/mend.js | mend.close：关系引擎整个缺席 ⇒ 如实报 fondness-missing，不假装改过（拓展②） |
| `goal-not-active` | engines/plan.js | plan.expand：目标已不是 active ⇒ 不给它排计划（拓展①） |
| `goods-full` | engines/economy.js | economy.stock：在册货品数达上限 ⇒ 不静默丢弃（拓展③） |
| `guarded-key` | engines/checkpoints.js | checkpoints 显式点名守卫键（schemaVersion）存快照 |
| `halted` | engines/world.js | world.where：中止过的行程位置**未知**（既不在出发地也不在目的地）（B2） |
| `hops-full` | engines/rumor.js | rumor.relay 超出 maxHops ⇒ 拒收（中间跳不许被挤掉，v2.96.0 X3） |
| `in-replay` | core/rand.js | 回放中拒绝开新卷（v2.89.0 O2：取证期间不得改被取证对象） |
| `in-transit` | engines/act.js | act.replan：在途者不得改道（改道会把一段真走过的路抹成没发生）（B1） |
| `incomplete-dice` | actors/registry.js | setPersonaDice 骰面不完整 |
| `insufficient` | engines/org.js | transfer 资源不足（须两个不同持有方） |
| `insufficient-progress` | engines/mend.js | mend.close：修复动作不够格就结案「好了」⇒ 条件不足不结案（拓展②） |
| `insufficient-support` | engines/probe.js | probe.confront：手上证据不够 minSupport 就别去对质（拓展⑤） |
| `intel-missing` | engines/probe.js | probe.confront：情报面（WA.intel）缺席 ⇒ 如实记 intel-missing，不假装记得（拓展⑤） |
| `intel-threw` | engines/probe.js | probe.confront：情报面抛错不吞掉 ⇒ 记为 intel-threw（拓展⑤） |
| `invalid-input` | core/schema.js | schema.validate：字段缺失或类型不符 ⇒ invalid-input + errors 数组（v2.110.0 plan-1 #22） |
| `lib-unreadable` | engines/checkpoints.js | 快照库读不出时 save/read 一律拒收（绝不覆盖写） |
| `link-off` | engines/hazard.js, engines/phone-bridge.js | hazard.roll 显式给了空地点 ⇒ 天气面照实报 link-off（不给 at 时回执里连 weather 字段都没有，v2.96.0 X6） |
| `metrics-full` | engines/stage.js | stage.mark：指标槽已满 ⇒ 不静默挤掉别人的格子（先自己清点）（拓展⑦） |
| `missing` | core/input-guard.js, core/store.js, engines/act.js, engines/affect.js, engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/checkpoints.js, engines/enigma.js, engines/era-cycle.js, engines/events.js, engines/fondness.js, engines/gauge.js, engines/hazard.js, engines/kaleidoscope.js, engines/karma.js, engines/ladder.js, engines/marginal.js, engines/masks.js, engines/mend.js, engines/org.js, engines/parallel-events.js, engines/quota.js, engines/rivalry.js, engines/rumor.js, engines/scene-slice.js, engines/survival.js, engines/temperament.js, engines/temporal-lock.js, engines/tolerance.js, engines/warrant.js, engines/weather.js, engines/world.js | path 指向不存在的键 |
| `missing-accepter` | engines/mend.js | mend.step：接受道歉的是谁必须写明，不给「有人说可以了」（拓展②） |
| `missing-actor` | engines/coop.js | coop：没写操作者 ⇒ 不认这份提议（谁提的必须是个世界里存在的人）（拓展⑨） |
| `missing-base` | engines/coop.js, engines/economy.js | economy.stock：首次登记这件货却没给基础价 ⇒ 无基础价不定价（拓展③） |
| `missing-buyer` | engines/economy.js | economy.buy：买家不在册 ⇒ 这笔交易没有付款人（拓展③） |
| `missing-chain` | engines/causal.js | causal 查无此链 |
| `missing-changes` | engines/stage.js | stage.plan：没写迁移清单 ⇒ 不换一个没人知道要改什么的阶段（拓展⑦） |
| `missing-deal` | engines/liaison.js | liaison.settleDeal：约定不存在（或 id 为空）⇒ 不凭一个 id 结算一笔没发生的约定（拓展⑧） |
| `missing-direction` | engines/probe.js | probe.addEvidence：不说支持还是反驳的线索不进卷宗（拓展⑤） |
| `missing-distance` | engines/region.js | region.register：没给距离就算不出消息要走多久 ⇒ 如实拒收（拓展⑥） |
| `missing-effect` | engines/intel.js | explain 查无此后果 |
| `missing-evidence` | engines/inst.js | inst.settle：结案没有依据 ⇒ 不许无据结案（拓展④） |
| `missing-fields` | core/store.js, engines/act.js, engines/affect.js, engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/causal.js, engines/checkpoints.js, engines/coop.js, engines/economy.js, engines/enigma.js, engines/era-cycle.js, engines/events.js, engines/fondness.js, engines/gauge.js, engines/hazard.js, engines/inst.js, engines/intel.js, engines/karma.js, engines/ladder.js, engines/life.js, engines/marginal.js, engines/masks.js, engines/mend.js, engines/parallel-events.js, engines/phone-bridge.js, engines/probe.js, engines/quota.js, engines/region.js, engines/rivalry.js, engines/rumor.js, engines/scene-slice.js, engines/session.js, engines/shadow.js, engines/stage.js, engines/survival.js, engines/temperament.js, engines/temporal-lock.js, engines/tolerance.js, engines/warrant.js, engines/weather.js, engines/world.js, actors/registry.js | causal 必填字段缺失 |
| `missing-from` | engines/liaison.js | liaison.receive：这笔操作没写谁发的 ⇒ 世界侧不认下来（拓展⑧） |
| `missing-goal` | engines/act.js, engines/opportunity.js | act.add：没给目标 id ⇒ 行动没有来源（B1） |
| `missing-guarantor` | engines/mend.js | mend.step：担保这件事没写谁担保 ⇒ 拒收（拓展②） |
| `missing-handover` | engines/inst.js | inst.succession：交接没写明在途项目数与旧承诺数 ⇒ 不许默认归零（拓展④） |
| `missing-holder` | engines/org.js | grant 持有方不存在 |
| `missing-hurt` | engines/mend.js | mend.mark：没说伤的是什么事 ⇒ 记一条「为什么受伤」都答不出的账（拓展②） |
| `missing-id` | engines/opportunity.js | opportunity.respond：没给机会 id ⇒ 拒收（B6） |
| `missing-keys` | engines/checkpoints.js | checkpoints 取 module/scene 范围却不给键 |
| `missing-maker` | engines/economy.js | economy.craft：合成者不在册 ⇒ 这些原料没有主人（拓展③） |
| `missing-name` | core/schema.js, engines/world.js, actors/registry.js, ui/panel.js | registry 各入口空名 |
| `missing-op` | engines/coop.js, engines/liaison.js | phoneBridge.noteAction：没写这笔操作的编号 ⇒ 不收下（幂等的根就是它）（B8 入口） |
| `missing-operator` | engines/kaleidoscope.js | when 写 $n1（比较式缺比较符） |
| `missing-owner` | engines/liaison.js | liaison.createDeal：约定算不出发起方（世界不认这个人）⇒ 不凭空造人也不凭空建目标（拓展⑧） |
| `missing-penalty` | engines/inst.js | inst.breach：违约却没写罚则 ⇒ 本模块不自行判罚（拓展④） |
| `missing-perm` | core/permissions.js | permissions.grantDirect：权限位为空 ⇒ 如实拒收（不静默授一个空位，v2.110.0） |
| `missing-person` | engines/act.js, engines/coop.js, engines/liaison.js, engines/life.js, engines/plan.js | life 各入口空人名 |
| `missing-preview` | engines/rehearsal.js | rehearsal.checkPreview：预览不存在 ⇒ 不凭一个 id 认下一份没登记过的结论（B7） |
| `missing-role` | core/permissions.js | permissions.defineRole：角色名为空 ⇒ 不注册并如实报（不静默建一个无名角色，v2.110.0） |
| `missing-route` | engines/act.js, engines/intel.js | addIntel 只给了路程一端 |
| `missing-stamp` | engines/economy.js | economy.tick：时段戳为空 ⇒ 这次结算没有时间依据（拓展③） |
| `missing-steps` | engines/plan.js | plan.expand：一步都没给 ⇒ 没有计划可排（拓展①） |
| `missing-text` | engines/life.js, engines/quota.js | addGoal 空目标文本 |
| `missing-token` | engines/session.js | session：入座必须持票 ⇒ 没票连座位都排不上（主持与加入同一道闸）（拓展⑥） |
| `missing-trigger` | engines/stage.js | stage.plan：没写触发条件（指标 + 门槛）⇒ 没触发条件的迁移不是迁移（拓展⑦） |
| `missing-user` | core/permissions.js | permissions：用户名为空 ⇒ 如实报 missing-user（与 unknown-user 分开：前者是调用方漏参，后者是人不在册，v2.110.0 plan-2 #39/#70） |
| `missing-who` | engines/rehearsal.js | rehearsal.run：动作没写谁做的 ⇒ 不替任何人代办（拒绝并留痕在 trace 里）（B7） |
| `missing-why` | engines/org.js | org.oweTo：没有原因的欠账日后没人答得出它是怎么来的 ⇒ 拒收（B5） |
| `missing-window` | engines/opportunity.js | opportunity.respond：延后必须显式给新窗口（先放着与没看见可分辨）（B6） |
| `missing-with` | engines/liaison.js | liaison.createDeal：没写约定对象 ⇒ 不建一份不知道跟谁的约定（拓展⑧） |
| `module-absent` | engines/perf-trace.js | perfTrace.runFace：面模块缺席 ⇒ 该面 absent（不是「跑了 0ms」也不编样本，v2.102.0） |
| `name-taken` | engines/session.js, actors/registry.js | registry.bindAlias：一个旧名只能有一个主人（两个主人 ⇒ 同一行解析出两种身份，v2.97.0 O9） |
| `narrative-only` | engines/org.js | org.projectView：只记了档位词 ⇒ 叙事档读数（B5） |
| `need-confirm` | engines/chrono.js, engines/collab.js | chrono.applyUndo：缺 `{confirm:true}` ⇒ need-confirm（「试算」与「真做」必须分开说：默认走 undo 的 dryRun，绝不默认落地，v2.112.0 plan-2 #33） |
| `need-resync` | engines/session.js | session.since：要的那段已挤出历史窗口 ⇒ 不假装没漏，先重同步（拓展⑥） |
| `need-unmet` | engines/act.js, engines/plan.js | act.admit：资源不够就是不够，不把负数伪装成成功（B1） |
| `no-action` | engines/opportunity.js | opportunity.respond：行动侧缺席 ⇒ 把它的归因如实带进 actReason（B6） |
| `no-actor` | engines/opportunity.js | opportunity.respond：take 必须点名谁来接（接了却没人做 = 悬空行）（B6） |
| `no-authority` | engines/inst.js | inst.propose：这项决策需要的权限没人持有 ⇒ 不许挂起（挂起等于永远办不了）（拓展④） |
| `no-base` | engines/chrono.js | chrono.record：`base` 指向不存在的记录 ⇒ no-base（不静默降级成根节点：降级会把断链伪装成合法分层，v2.112.0） |
| `no-clock` | engines/weather.js | weather.season 在无世界钟时 |
| `no-conflict` | engines/collab.js | collab.resolve：冲突 id 不在册 ⇒ no-conflict（不假称裁决了一条不存在的分歧，v2.112.0 plan-2 #40） |
| `no-draft` | engines/region.js | region.tickOffline：没拿到事务草稿 ⇒ 拒收（不把「我拿不到草稿」说成「你走了零秒」）（X3） |
| `no-entry` | engines/chrono.js | chrono.undo：记录 id 不在图里 ⇒ no-entry（读面同样要如实归因，不返回空计划，v2.112.0） |
| `no-goal` | engines/act.js, engines/liaison.js | act.admit：目标被撤销 ⇒ 挂在它下面的行动不得照常开工（B1） |
| `no-history` | core/audit-log.js, engines/canon.js | canon.position：大纲已采纳但世界侧还没历史 ⇒ 照实说「还没得对」（不编读数，v2.100.0） |
| `no-journey` | engines/world.js | where() 某人无任何行程记录 |
| `no-migration` | engines/checkpoints.js | 信封版本更旧但没有登记对应迁移步骤（不猜） |
| `no-needs` | engines/org.js | org.parseNeeds：需求串为空 ⇒ 没有可对账的清单（B5） |
| `no-negative-step` | engines/liaison.js | liaison.applyRelation：失约只记认知与证据，好感不降（不降准则，不擅自代填负向）（拓展⑧） |
| `no-new-remedy` | engines/shadow.js | shadow.offerRemedy：重复同类且未被接受的补救 ⇒ 零变化（B4） |
| `no-ops` | engines/coop.js, engines/phone-bridge.js | phoneBridge.linkChain：因果容器在但台账面不存在（旧存档 / 外部导入没带这一层，v2.97.0 X5） |
| `no-outline` | engines/canon.js | canon.locate：还没采纳任何大纲就按坐标定位 ⇒ 照实说「没有基准」（不编一份出来，v2.99.0） |
| `no-pack` | engines/stage.js | stage：还没采纳任何玩法包 ⇒ 不凭空给一个指标记进度（记进度/声明迁移同一道闸）（拓展⑦） |
| `no-plan` | engines/plan.js | plan.current：这个人没有在册计划 ⇒ 如实说没有（拓展①） |
| `no-proposal` | engines/coop.js | coop：这份提议不存在（也没在归档里）⇒ 不凭一个 id 编出一次裁决（确认/拒绝/重试同一道闸）（拓展⑨） |
| `no-receipt` | engines/mend.js | mend.step：没有真实转移回执的补偿 = 口头赔偿，不接受（拓展②） |
| `no-receipt-face` | engines/coop.js | coop.confirm：回执面缺席 ⇒ 不标完成（确认前不标完成的另一半）（拓展⑨） |
| `no-rotation` | render/inject.js | 未注入过时照实拒答（不编一份空解释当答案，v2.90.0 O3） |
| `no-scene` | engines/recipe.js | recipe.seed：该配方没有场景种子 ⇒ 拒收（不假装取到了一条）（B6） |
| `no-sections` | actors/registry.js | setProfileSafe 传空节（无任何变更） |
| `no-seed` | core/rand.js | 无种子的磁带如实拒收复核（不假装复核过） |
| `no-session` | engines/collab.js | collab.close/claim：会话 id 不在册（或已关闭）⇒ no-session（**不假称成功**：关闭一个不存在的会话若回 ok:true，调用方会以为自己关掉了什么，v2.112.0） |
| `no-signal` | engines/canon.js | canon.position：有历史但一行都没撞上幕目题名 ⇒ 照实说没信号而**不给「最接近」的坐标**（v2.100.0） |
| `no-steps` | engines/rehearsal.js | rehearsal：一步都没给 ⇒ 没有什么可试演的（空步表不是「安全通过」）（B7） |
| `no-such-experience` | engines/shadow.js | shadow.stanceOf：查无此事 ⇒ 不回落成「没看法」（B4） |
| `no-such-project` | engines/org.js | org.deliverToProject：项目不存在 ⇒ 拒收（不新建一个空项目兜住）（B5） |
| `no-tape` | core/rand.js | tapeVol 在本侧无卷（无从调用的在卷、也没有留存卷）时如实拒答（v2.98.0 P2） |
| `no-view` | engines/shadow.js | shadow.stanceOf：认知不对称 ⇒ 客观行为在案而此人没有看法（B4） |
| `non-finite` | core/input-guard.js | 输入边界：NaN/±Infinity 不得被升格成字面量（v2.84.0 新增） |
| `not-a-function` | core/fault-context.js, core/sandbox.js | faultContext.wrap：第二参数不是函数 ⇒ 如实拒收（不是「没抛所以成功」，v2.110.0） |
| `not-a-number` | engines/kaleidoscope.js | 非数值参与算术 / map 输入非数 |
| `not-a-party` | engines/mend.js, engines/shadow.js | shadow.recordExperience：写了不在场的当事人 ⇒ 拒收（认知不能凭空产生）（B4） |
| `not-a-string` | core/input-guard.js | 输入边界：对象/数组/函数不得被隐式字符串化（v2.84.0 新增） |
| `not-accepted` | engines/mend.js | mend.step：道歉对方没接受 ⇒ 这一步不算做过（拓展②） |
| `not-active` | engines/act.js, engines/events.js | events.cancel/replace 打在终态行上（已结束的排期不可再动） |
| `not-advancing` | engines/stage.js | stage.mark：增量为零或负数 ⇒ 成就不是可以往回拧的旋钮（拓展⑦） |
| `not-authorized` | engines/inst.js, engines/session.js | inst.decide：批准人不在 approve 名册上 ⇒ 批准不是「谁点一下都行」（拓展④） |
| `not-bound` | actors/registry.js | registry.bindAlias：规范名不在册（给不存在的人登记历史名 = 凭空造一个身份，v2.97.0 O9） |
| `not-claimed` | engines/events.js | events.complete 对未认领的行回报（没认领不许宣称做完） |
| `not-due` | engines/checkpoints.js, engines/liaison.js | 自动快照开了但这一轮还没轮到（与 disabled 各自成词） |
| `not-entitled` | engines/opportunity.js | opportunity.respond：世界侧记了涉及谁 ⇒ 之外的人不受理（B6） |
| `not-in-table` | core/permissions.js | permissions.adopt：人不在权限表 ⇒ adopted:false 且一位不授（不越权登记）（X6） |
| `not-kept` | engines/mend.js | mend.step：守约要有实际守约的证据，说了不算（拓展②） |
| `not-needed` | engines/org.js | org.deliverToProject：只收清单上有的东西（把无关物资倒进来算进度 = 进度可伪造）（B5） |
| `not-object` | core/evict.js, core/settings-bus.js, actors/registry.js, render/purifier.js | setProfileSafe/setPersonaDice 传非对象 |
| `not-on-roster` | engines/org.js | org.oweTo：不在名册上的人不能欠势力的账（B5） |
| `not-planned` | engines/act.js | act.admit：已开工的行动不得二次准入（两态不可分）（B1） |
| `not-recording` | core/rand.js | 无在卷时收卷被如实拒收（不伪造一卷空磁带） |
| `not-replaying` | core/rand.js | 未在回放时退出被如实拒收（不谎报「刚结束了一次回放」） |
| `not-running` | engines/act.js, engines/plan.js | act.abort：只有 running 的行能被中止（否则「已结束」与「还能中止」两态不可分）（B1） |
| `nothing-recorded` | engines/org.js | org.projectView：两样都没记 ⇒ 未知档，**不给词**（B5） |
| `nothing-to-accept` | engines/shadow.js | shadow.acceptRemedy：没有待接受的补救 ⇒ 不假装收到道歉（B4） |
| `nothing-to-choose` | engines/plan.js | plan.candidates：已无待选步（全 done）⇒ 没得改选（拓展①） |
| `nothing-to-correct` | engines/intel.js | intel.correct：辟谣只对收到过该说法的人生效（B3） |
| `nothing-to-verify` | engines/intel.js | intel.verify：从没听说过就报 nothing-to-verify，不做「核实」旁路（B3） |
| `occupied` | engines/inst.js | inst.assign：职位已有人占着 ⇒ 换人必须显式 replace（拓展④） |
| `one-sided` | engines/collab.js | collab.noteConflict：只有一侧改动 ⇒ one-sided（**单边改动不是冲突**：把它记成冲突会让复盘时到处是「谁跟谁冲突了」的假案，v2.112.0 plan-2 #38） |
| `ops-full` | engines/phone-bridge.js | phoneBridge.noteAction：台账满 ⇒ 拒收而非静默挤掉（挤掉一笔 = 让「这条链的因」事后消失，v2.97.0 X5） |
| `orders-full` | engines/economy.js | economy.buy：成交流水达上限 ⇒ 拒收，不静默丢单（拓展③） |
| `org-missing` | engines/act.js, engines/plan.js | act.admit：要过资源闸却没有真源（org 缺席）⇒ 不猜库存（B1） |
| `orgs-full` | engines/inst.js | inst.charter：在册组织数达上限 ⇒ 不静默丢弃（拓展④） |
| `orphaned-epoch` | core/store.js | store.batch：批横跨聊天纪元（批进行中 init/切聊天）⇒ 该批退出不落盘、且其候选从内存一并丢弃（声明的「已丢弃」必须同时对存储与内存成立，v2.113.0 A1） |
| `out-of-order` | engines/session.js | session.post：楼号跳了 ⇒ 顺序是世界的一部分，不按你说的号补（拓展⑥） |
| `out-of-range` | engines/canon.js | canon.locate：坐标语法对但号越界 ⇒ 照实说「不成立」而**不夹到边界**（幕号是标出来的，v2.99.0） |
| `overflow` | engines/kaleidoscope.js | formula 结果溢出（本版修复后新可达） |
| `parent-cycle` | engines/world.js | 补全归属会让父子互相归属 ⇒ 拒收（v2.85.0 B2） |
| `parent-locked` | engines/world.js | 已有归属不得被冲突改写（v2.85.0 B2：无→有是补全、x→y 才是改写） |
| `pass` | engines/world.js | world.effectiveBlockOf：三层都放行时的正名（不是「没有理由」，是「可以过」）（B2） |
| `path-missing` | engines/coop.js | coop.coopSetPath：路径末段那一格不存在 ⇒ 不凭空补一格出来（不代造中间层）（拓展⑨） |
| `permission-denied` | core/permissions.js, core/store.js | permissions.has/check：人在册但没有该权限位 ⇒ permission-denied（与 unknown-user 分开，v2.111.0 plan-2 #67） |
| `places-full` | engines/region.js | region.register：远方地区数已达上限 ⇒ 不许静默丢弃（拓展⑥） |
| `plans-full` | engines/plan.js | plan.expand：在册计划数已达上限 ⇒ 不静默丢弃（拓展①） |
| `plugin-blocked` | core/plugin.js | plugin.register 的 beforeSave 钩子返回 ok:false ⇒ save 前拦下（plugin-blocked）；「钩子说不行」与「钩子没说话」必须分开（v2.114.0） |
| `pre-violation` | render/inject.js, render/purifier.js, render/theater.js | 渲染层防御式边界：公开入口的参数类型错 ⇒ 明确归因（与「合法但空」的 missing-find/no-id/empty-text 分开，v2.108.0） |
| `preview-throw` | ui/panel.js | panel：配方预览抛错 ⇒ 回执如实报 preview-throw（B6） |
| `price-out-of-band` | engines/economy.js | economy.price：报价越出定价带宽 ⇒ 拒收并带出上下界（拓展③） |
| `produce-failed` | engines/perf-trace.js | perfTrace.ensure：produce 抛错 ⇒ ok:false 且**不写缓存**（旧值不许连坐，v2.102.0） |
| `project-closed` | engines/org.js | org.deliverToProject：已结项不得再收货（B5） |
| `project-throw` | ui/panel.js | panel：项目读数抛错 ⇒ 回执如实报 project-throw（B5） |
| `proposals-full` | engines/coop.js | coop.propose：待裁队列已满 ⇒ 不静默丢弃旧提议（先裁完）（拓展⑨） |
| `rand-absent` | engines/causal.js | 随机源缺席时如实拒收（不静默降级成「录了一卷空的」） |
| `receipt-failed` | engines/coop.js | coop.confirm：回执没落 ⇒ 世界写入已发生但这次确认不标完成，并把提议退回待处理（拓展⑨） |
| `receipt-threw` | engines/coop.js | coop.confirm：回执面抛错 ⇒ 不吞掉，如实记为 receipt-threw（拓展⑨） |
| `record-failed` | core/audit-log.js | auditLog.record：连「取属性即抛」的敌意 opts 都吞成归因 ⇒ 从不抛、不改产品行为（v2.111.0 plan-2 #67） |
| `recorded` | engines/org.js | org.projectView：至少一项记了刻数 ⇒ 精确档读数（B5） |
| `recording` | core/rand.js | 录制中拒绝进入回放（否则这一次推进既录又放、两边都不是） |
| `relation-absent` | engines/liaison.js | liaison.applyRelation：关系面缺席 ⇒ 如实回报，不假装给过一步（拓展⑧） |
| `relation-not-authorized` | engines/mend.js | mend.close：结案要改关系必须显式授权，不代改（拓展②） |
| `relation-off` | engines/liaison.js | liaison.settleDeal：关系后果默认关 ⇒ 界面动作不无条件造成关系变化（B8 原文点名） |
| `relation-threw` | engines/liaison.js, engines/mend.js | liaison.applyRelation：关系面抛错 ⇒ 不吞掉，如实记为 relation-threw（拓展⑧） |
| `restore-failed` | core/audit-log.js | auditLog.restore：getItem 抛错 ⇒ 吞成 restore-failed（与 bad-format 分开：前者是「没读到」，后者是「读到了但不认识」，v2.112.0） |
| `reuse` | engines/perf-trace.js | perfTrace.ensure：命中路径的正常归因（与 stale/forced 并列答「为什么是它」，v2.102.0） |
| `revoked` | engines/session.js | session：座已卸但票还在手里 ⇒ 不再认这份票（不删历史，只是不再当他在座）（拓展⑥） |
| `road-closed` | engines/world.js | world.transit：到不了要答得出是**哪一层**断的——路段被封不是「路不存在」（B2） |
| `road-crowded` | engines/world.js | 路段容量满 ⇒ 拒收且不落盘（v2.85.0 B2：走得通 ≠ 现在走得动） |
| `role-taken` | engines/session.js | session.join：这个角色已有人在座 ⇒ 不悄悄顶掉他（要顶得显式 takeover）（拓展⑥） |
| `round-not-recorded` | render/inject.js | 轮次坐标不符时照实拒答（不拿上一轮的当这一轮，v2.90.0 O3） |
| `route-blocked` | engines/economy.js, engines/region.js | region.deliver：路断了消息过不来 ⇒ 原地等，不许落地、也不许丢掉（拓展⑥） |
| `routes-full` | engines/economy.js | economy.route：在册商路数达上限 ⇒ 不静默丢弃（拓展③） |
| `sandbox-failed` | engines/rehearsal.js | rehearsal.run：隔离快照建不起来 ⇒ 不拿真世界试演（宁可拒收）（B7） |
| `sandbox-throw` | core/sandbox.js | sandbox.run：脚本自己抛错 ⇒ 吞成 sandbox-throw（沙箱口不许把调用方搞挂；与「Access denied」分列——前者是脚本坏了，后者是边界挡下了，v2.114.0） |
| `sandbox-timeout` | core/sandbox.js | sandbox.run：同步体跑过 timeoutMs ⇒ sandbox-timeout（超时是读数不是崩：仍把已完成的返回值带出供调用方判，v2.114.0） |
| `seats-full` | engines/session.js | session：座位已满 ⇒ 不挤掉先到的人（先有人卸座再进）（拓展⑥） |
| `seed-throw` | ui/panel.js | panel：取场景抛错 ⇒ 回执如实报 seed-throw（不吞成「未生效」）（B6） |
| `self-approve` | engines/coop.js | coop.confirm：权威世界维护者不得是提议人自己（allowSelfApprove 可显式打开）（拓展⑨） |
| `self-cause` | engines/intel.js | addLink cause === effect |
| `self-parent` | engines/world.js | 地点不得以自己为父级（v2.85.0 B2） |
| `settle-not-here` | engines/liaison.js | liaison.advance：终档不许从推进面走 ⇒ 结算只有一个出口（拓展⑧） |
| `short-input` | engines/economy.js | economy.craft：原料不够 ⇒ 拒收并列明缺哪几样（拓展③） |
| `short-stock` | engines/economy.js | economy.buy：库存不够 ⇒ 拒收并带出现有量（拓展③） |
| `shortfall` | engines/org.js | org.closeProject：差一点不许写成「完成」，缺口照实报（B5） |
| `stage-skip` | engines/liaison.js | liaison.advance：阶段只许逐档前言 ⇒ 不许从「已提交」跳到「对方已知晓」（拓展⑧） |
| `stale-base` | engines/coop.js | coop.confirm：基础版本与世界当前版本不一致 ⇒ 请基于当前版本重新提交（不自动合并）（拓展⑨） |
| `stale-preview` | engines/rehearsal.js | rehearsal.apply：世界已不是预览时的那一份 ⇒ 拒收且零变化（旧预览不得覆盖新进度）（B7） |
| `stale-step` | engines/plan.js | plan.advance：交出前发现当前步已被换掉 ⇒ 不把旧步标成 running（拓展①） |
| `step-running` | engines/plan.js | plan.rechoose：正在做的步没结算就改选 ⇒ 拒收（否则「做了没有」无法判定）（拓展①） |
| `still-in-transit` | engines/world.js | world.arrive：还没到点 ⇒ 位置未知，不提前落点（B2） |
| `storage-unavailable` | core/audit-log.js | auditLog.flush/restore：宿主没有 localStorage ⇒ 如实报 storage-unavailable（**不**返回 ok:true/written:0 —— 那会让「落盘成功」与「根本没落」同形，v2.112.0） |
| `suppressed-full` | engines/rumor.js | rumor.conceal 超出 maxSuppressed ⇒ 拒收（隐瞒与跳分列计数，v2.96.0 X3） |
| `sweep-throw` | ui/panel.js | panel：机会扫描抛错 ⇒ 回执如实报 sweep-throw（B6） |
| `tape-open` | core/rand.js | 未收卷的磁带拒绝回放（它还在录，值不完整） |
| `tape-without-values` | core/rand.js | 只记位置的磁带拒绝回放（无处取值就别假装能重放） |
| `theme-absent` | render/inject.js | render.themeContrast：题材面缺席 ⇒ 如实归因，不假装「两题材一样」（X7） |
| `theme-refused` | engines/recipe.js | recipe.apply：题材被真源拒收 ⇒ 不留半截配方名（B6） |
| `theme-throw` | engines/recipe.js | recipe.apply：题材侧抛错 ⇒ 归因带进 themeReason，不冒充「题材不支持」（B6） |
| `threshold-unmet` | engines/stage.js | stage.transit：门槛未达 ⇒ 带出还差多少，不硬换阶段（拓展⑦） |
| `threw` | engines/kaleidoscope.js, ui/panel.js | setDerive 内部抛出 |
| `time-conflict` | engines/life.js | addSchedule 与已有活动重叠 |
| `too-deep` | engines/chrono.js, actors/registry.js | registry.bindAlias：链深超过 8 跳当场拒收（往表里放一条永远解析不出来的登记 = 在账上打个死结，v2.97.0 O9） |
| `too-early` | engines/region.js | region.deliver：还没走到就不许提前落地（带出还要等多久）（拓展⑥） |
| `too-few-hypotheses` | engines/probe.js | probe.open：单一假说（或空表）不是调查，是通知（拓展⑤） |
| `too-many` | engines/kaleidoscope.js | 派生量 / 规则超过上限 |
| `too-many-ops` | engines/coop.js | coop.propose：一次改太多条（超上限）⇒ 不许一次动整个世界（拓展⑨） |
| `too-many-steps` | engines/plan.js | plan.expand：步数超过上限 ⇒ 拒收并带出上限（拓展①） |
| `too-many-tries` | engines/mend.js | mend.step：修复尝试次数用尽 ⇒ 停下（不做无上限的「努力」）（拓展②） |
| `too-new` | engines/checkpoints.js | 信封格式号高于本引擎支持的 FORMAT |
| `trailing-token` | engines/kaleidoscope.js | formula 尾部多余 |
| `transitions-full` | engines/stage.js | stage.plan：待换阶段清单已满 ⇒ 不静默丢弃旧迁移（先了结）（拓展⑦） |
| `tries-exhausted` | engines/coop.js, engines/plan.js | plan.advance：尝试次数用尽 ⇒ 停下等人决定，不无限重试（拓展①） |
| `unappliable` | engines/coop.js | coop.confirm：任一条路径应用不到 ⇒ 整份拒收（不做部分成功）（拓展⑨） |
| `unbalanced-paren` | engines/kaleidoscope.js | formula 括号不配对 |
| `unconfirmed` | engines/act.js | act.advance：take/tell/work 没有内置确认器 ⇒ 可见失败，不冒充完成（B1） |
| `unexpected-end` | engines/kaleidoscope.js | formula 尾部缺操作数 |
| `unexpected-token` | engines/kaleidoscope.js | formula 位置不对的符号 |
| `unexplained` | engines/intel.js | explain 后果存在但无可用原因 |
| `unknown-action` | engines/causal.js | 干预预览的未知动作被显式拒收（v2.87.0 B6，不静默当作 advance） |
| `unknown-actor` | engines/coop.js | coop.propose：提议涉及的角色世界不认得 ⇒ 不凭空建人（拓展⑨） |
| `unknown-breach` | engines/inst.js | inst.settle：违约记录 id 不在册 ⇒ 不猜一条没登记的账（拓展④） |
| `unknown-case` | engines/probe.js | probe：案子不存在 ⇒ 不凭一个 id 猜出一张卷宗（举证/对质/误指同一道闸）（拓展⑤） |
| `unknown-cause` | engines/causal.js, engines/intel.js | addLink 传不存在的因 |
| `unknown-chain` | engines/phone-bridge.js | phoneBridge.linkChain：链必须**已存在**（接一条不存在的链 = 用桥给世界造一条因果，v2.97.0 X5） |
| `unknown-class` | engines/perf-trace.js | perfTrace.bench：未知档位 ⇒ 拒收并报出可选档（不默认跑一档，v2.102.0） |
| `unknown-decision` | engines/inst.js | inst.decide：决策 id 不在册 ⇒ 不猜一项没提过的事（拓展④） |
| `unknown-derive` | engines/kaleidoscope.js | formula 引用不存在的派生量 |
| `unknown-event` | engines/region.js | region.deliver：事件 id 不在册 ⇒ 不猜一件没有的事（拓展⑥） |
| `unknown-fact` | engines/rumor.js | rumor.startChain 点名一条没登记的事实 ⇒ 拒收（不凭空造一条链，v2.96.0 X3） |
| `unknown-format` | engines/perf-trace.js | perfTrace.flamegraph：未知形态 ⇒ 拒收并报出可选形态（不回默认形态，v2.109.0） |
| `unknown-goal` | engines/act.js, engines/plan.js | act.add：目标 id 不在册或已非 active ⇒ 悬空行动不得登记（B1） |
| `unknown-good` | engines/economy.js | economy.buy：这件货没登记过 ⇒ 不凭空交易（拓展③） |
| `unknown-hook` | core/plugin.js | plugin.fire：钩子名不在四钩子封闭集合里（init/beforeSave/afterLoad/onRender）⇒ unknown-hook，不把拼错的钩子名当成「没人监听」（v2.114.0） |
| `unknown-hypothesis` | engines/probe.js | probe：线索指的假说不在这张卷宗里 ⇒ 不新建一条假说兜住（拓展⑤） |
| `unknown-keys` | engines/checkpoints.js | checkpoints 点名了骨架里没有的顶层键 |
| `unknown-metric` | engines/stage.js | stage：这个指标不是本包声明的 ⇒ 不发明一个新成就（记进度/声明迁移同一道闸）（拓展⑦） |
| `unknown-name` | actors/registry.js | registry.aliasOf：对完全不在册的名字**不编**一个规范名（v2.97.0 O9） |
| `unknown-op` | engines/phone-bridge.js | phoneBridge.linkChain：台账里没有这笔操作（认不出是谁 ⇒ 不许凭空接上，v2.97.0 X5） |
| `unknown-opportunity` | engines/opportunity.js | opportunity.respond：机会不在册 ⇒ 拒收（不替人新建一条）（B6） |
| `unknown-org` | engines/inst.js | inst.post：组织还没建档 ⇒ 无组织可设职位（拓展④） |
| `unknown-pack` | engines/stage.js | stage.adopt：包名不在具名表里 ⇒ 玩法不能凭空发明（拓展⑦） |
| `unknown-parent` | engines/world.js | 登记的父级必须已登记（v2.85.0 B2：不猜「大概同城」） |
| `unknown-participant` | engines/liaison.js | liaison.receive：世界不认得这个名字 ⇒ 不放进闭环（谁的手机不代表世界的谁）（拓展⑧） |
| `unknown-policy` | engines/perf-trace.js, engines/rehearsal.js | perfTrace.setCachePolicy：未知淘汰策略 ⇒ 拒收并报出可选策略（不静默按 fifo，v2.109.0） |
| `unknown-post` | engines/inst.js | inst.assign：这个职位不存在 ⇒ 不凭空挂一个没定义过的人上去（拓展④） |
| `unknown-recipe` | engines/economy.js, engines/recipe.js | recipe：未知配方拒收且不回落（回落会让「启用了」与「没启用」长得一样）（B6） |
| `unknown-role` | core/permissions.js | permissions.grant：角色名不在册 ⇒ unknown-role 并附已知名单（**不静默接受**，v2.110.0） |
| `unknown-route` | engines/economy.js | economy.ship：商路 id 不在册 ⇒ 不猜一条不存在的路（拓展③） |
| `unknown-schema` | core/schema.js | schema.validateNamed：名字没注册过 ⇒ unknown-schema（**不**按空 spec 静默放过，v2.110.0） |
| `unknown-seat` | engines/session.js | session：座上没有这个人 ⇒ 不凭一个名字凭空发他一条言（验票/发言/续传/卸座同一道闸）（拓展⑥） |
| `unknown-span` | engines/perf-trace.js | perfTrace.noteSpan：未知分列名 ⇒ 拒收并报出可选项（不静默丢桶，v2.102.0） |
| `unknown-stage` | engines/liaison.js, engines/stage.js | liaison.advance：阶段名不在五档表里 ⇒ 不猜你要推到哪一档（拓展⑧） |
| `unknown-subject` | engines/intel.js | addIntel 传未知 about 主体 |
| `unknown-theme` | engines/theme.js | 未知题材拒收且不改设置（v2.87.0 B7：不静默当空集） |
| `unknown-transition` | engines/stage.js | stage.transit：这条迁移不存在 ⇒ 不凭一个 id 换阶段（拓展⑦） |
| `unknown-user` | core/permissions.js | permissions.has：用户未注册 ⇒ unknown-user（「谁都没说不行」不等于「说了行」，v2.110.0） |
| `unreciprocated` | engines/life.js | 单向宣布的合作不得被当作已建立的协作（v2.85.0 B1） |
| `weak-evidence` | engines/intel.js | intel.verify：弱证据不改认知 ⇒ 报 weak-evidence 且零变化（B3） |
| `window-closed` | engines/opportunity.js | opportunity.respond：过窗口末刻的作答一律拒收，且这次作废真落盘（B6） |
| `window-too-short` | engines/world.js | world.canBeAt：窗口容不下这件事 ⇒ 报短多少，不硬塞（B2） |
| `world-missing` | engines/act.js, engines/intel.js, engines/weather.js | travelOf 在 world 未装载时 |
| `wrongs-full` | engines/probe.js | probe.wrong：误指留痕达上限 ⇒ 不静默丢弃（查错人也要留下痕迹）（拓展⑤） |

## 死表（已证不可达）（8）

| 码 | 出现之处 | 说明 |
| --- | --- | --- |
| `backup-corrupt` | core/settings-bus.js | v2.83.0（B6）cfgRollback 的备份解析出口，在当前设计下**结构上不可达**：cfgRollback 只在「写盘阶段中途失败」时被调用，而进入写盘阶段的前提是**导入前备份已成功写入**（备份失败会在写盘前以 backup-failed 拒收整次导入，见 settings-bus 的写盘前置条件）。而备份成功必然把同一个备份键覆写成合法 JSON ⇒ cfgRollback 读到的必是合法 JSON。故要走这条分支，得先有一个「存在但不是 JSON」的备份键，同时备份写入又失败——与前置条件互斥。不删：第三方脚本或外部工具若直接调用回滚入口（或未来备份环引入多源写入），它是第一道防线；届时本门禁会以 deadLeak 提醒「该码可能复活」。 |
| `bad-draft` | actors/registry.js | registry.ensurePerson（v2.86.0 A3，people 条目的唯一写者）的入参守卫，在现有调用面上结构不可达：它的调用点（life.person / intel.personRow / backstage 两处 / registry.setProfileSafe）全部位于 store.transact(function (draft) {...}) 回调内，而 transact 保证传入骨架草稿对象。不删：唯一写者是对外导出，越界调用时它是第一道防线；届时本门禁会以 deadLeak 提醒它可能复活。 |
| `bad-operator` | engines/kaleidoscope.js | parseCmp 的筛选形式是：取 tk，要求 tk.t === "op"，p++，v := tk.v；而 tokenize 产 op 的分支只输出 >=/<=/==/!=/>/<，该集合恰是下面 if/else 链的全部分支，故 else 永不取。穷举验证：6174 个长度≤3 的词法组合全跑一遍，该码零见证。不删：若未来新增比较符，它是第一道防线（本面门禁会在那时通过 deadLeak 提醒「该码可能复活」）。 |
| `end-failed` | engines/causal.js | causal.record（v2.89.0 O2）的收卷失败出口，在现有设计下**结构不可达**：进入该分支的前提是 beginTape 成功，而 beginTape 成功必然把磁带置于 open=true；endTape 的拒收条件恰是“磁带不存在或已收卷”，两者互斥。唯一能造出“begin 成功但 end 拒绝”的路径是自己先把磁带收掉，而收卷发生在 finally 里、fn 体拿不到句柄。不删：将来若磁带面被改成可重入（外部可提前收卷），它是第一道防线；届时本门禁会以 deadLeak 提醒它可能复活。 |
| `kind-locked` | engines/inst.js | inst.charter 两道守卫次序相扣：第一道 `seen && !o.replace ⇒ exists` 先返回；第二道 `seen && seen.kind !== kind && !o.replace ⇒ kind-locked` 的输入集合是第一道的子集，故 kind-locked 恒不可达。实测：先 charter(会甲, 公司) 再 charter(会甲, 帮派)，返回 exists 而非 kind-locked。不删：若 exists 的判据将来放宽，它是第一道防线（届时 deadLeak 会提醒它可能复活）。 |
| `migration-loop` | engines/checkpoints.js | checkpoints.migrate 的自旋防护在 FORMAT=1 期**结构上不可达**：循环条件 f < FORMAT 要求 f<1，而唯一的迁移登记入口 registerMigration 收窄为 f<1 ⇒ missing-fields，0/-1/-2 全被拒。故循环体内永远拿不到 step，至多转 1 圈即走 no-migration 出口，guard 永不越 64。穷举验证（/tmp/diag7.js）：registerMigration(-2..0) 全返回 missing-fields；migrate({worldaxisCheckpoint:0}) 返回 no-migration。不删：将来若新增 format 2 与相应迁移，它是第一道防线（届时本门禁会以 deadLeak 提醒「该码可能复活」）。 |
| `no-relation-face` | engines/liaison.js | liaison.settleDeal 的关系后果用一个三元兜底 `rel ? ... : no-relation-face`，但被调的 applyRelation 五条出口（relation-absent / missing-person / no-negative-step / 成功 / relation-threw）**每一条都返回真值对象**，无一返回假值 ⇒ `rel` 恒为真，else 分支恒不可达。不删：将来若 applyRelation 改成可能返回空值（例如把「没人可记」静默吞掉），它是那道兜底；届时本门禁会以 deadLeak 提醒它可能复活。 |
| `store-absent` | core/exec.js, engines/act.js, engines/causal.js, engines/coop.js, engines/liaison.js, engines/phone-bridge.js, engines/world.js | 三处 mutate 在存储面缺 transact 时构造 store-absent，但全仓无一处透传该返回值（`return mutate(` 零命中；调用点一律是 out 变量 + 各自兜底码）⇒ 不可观测。实测：摘掉 store 的 transact 后，各入口给出的是 store-unavailable 或更早的前置闸。不删：将来若有调用方开始透传 mutate 的返回值，它是第一道防线。 |

## 基线（存量未分类）（231）

| 码 | 出现之处 | 说明 |
| --- | --- | --- |
| `absent` | core/settings-bus.js, core/store.js, engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `after-reply` | engines/bridge.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `all-rejected` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-` | engines/causal.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-abandoned` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-in-transit` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-json` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-locked` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-pending` | engines/fondness.js, engines/hazard.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-resolved` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-terminal` | engines/longline.js, engines/quota.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-there` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `api-fail` | engines/opinion.js, actors/observe.js, actors/profile.js, direction/oracle.js, ui/assistant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `applied` | engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/era-cycle.js, engines/ladder.js, engines/masks.js, engines/survival.js, engines/tempo.js, engines/warrant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `auto-off` | engines/backstage.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-amount` | engines/karma.js, engines/marginal.js, engines/org.js, engines/shadow.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-axis` | engines/survival.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-cap` | core/evict.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-channel` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-cost` | engines/difficulty.js, engines/economy.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-countdown` | engines/era-cycle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-due` | engines/liaison.js, engines/longline.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-enum` | engines/difficulty.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-env` | engines/scene-slice.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-fallback` | engines/affect.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-form` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-gear` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-level` | engines/probe.js, engines/warrant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-load` | engines/affect.js, engines/survival.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-method` | engines/beast-bond.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-minutes` | engines/difficulty.js, engines/weather.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-name` | core/plugin.js, engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-order` | engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-outcome` | engines/inst.js, engines/mend.js, engines/plan.js, engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-patch` | engines/style.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-polarity` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-pool` | engines/quota.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-reliability` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-response` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-role` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-rows` | core/audit-log.js, engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-rungs` | engines/ladder.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-span` | engines/tempo.js, engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-stakes` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-text` | engines/kaleidoscope.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-tier` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-trust` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-type` | engines/bonds.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-value` | engines/beast-bond.js, engines/fondness.js, engines/style.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-version` | core/audit-log.js, core/rand.js, engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-volume` | core/audit-log.js, core/rand.js, engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-who` | engines/spotlight.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `band-cap` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bottom` | engines/ladder.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `burst` | engines/tolerance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `busy` | engines/act.js, engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `capacity` | engines/chrono.js, engines/collab.js, engines/events.js, engines/parallel-events.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `chain-terminal` | engines/causal.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `checked` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `clean` | engines/warrant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `climate-throw` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `closed` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `commitment` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `commitment-fulfilled` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `conflicts-unresolved` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `contract-mismatch` | engines/lonsha-reader.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `corrupt-overflow` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `crisis` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `crowd` | engines/parallel-events.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `dedup` | engines/calendar.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `diag-idle` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `disabled` | engines/act.js, engines/affect.js, engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/bridge.js, engines/calendar.js, engines/causal.js, engines/checkpoints.js, engines/chrono.js, engines/collab.js, engines/coop.js, engines/difficulty.js, engines/economy.js, engines/enigma.js, engines/era-cycle.js, engines/events.js, engines/fondness.js, engines/gauge.js, engines/hazard.js, engines/horizon.js, engines/inst.js, engines/karma.js, engines/ladder.js, engines/liaison.js, engines/life.js, engines/marginal.js, engines/masks.js, engines/mend.js, engines/opportunity.js, engines/parallel-events.js, engines/parallel-world.js, engines/phone-bridge.js, engines/plan.js, engines/probe.js, engines/quota.js, engines/region.js, engines/rehearsal.js, engines/rivalry.js, engines/rumor.js, engines/scene-slice.js, engines/session.js, engines/spotlight.js, engines/stage.js, engines/survival.js, engines/temperament.js, engines/tempo.js, engines/temporal-lock.js, engines/tolerance.js, engines/warrant.js, engines/wb-inject.js, engines/weather.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `dup-rung` | engines/ladder.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `dup-text` | engines/quota.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `emotion-word` | engines/affect.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty` | engines/chatcache.js, engines/economy.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-goal` | direction/oracle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-response` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-roster` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-round` | engines/spotlight.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-string` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-text` | engines/canon.js, render/theater.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `engine-absent` | engines/hazard.js, engines/org.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `error` | engines/wb-inject.js, render/inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `evolve-key-mismatch` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `evolve-needs-single-key` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `exists` | engines/appearance.js, engines/beast-bond.js, engines/enigma.js, engines/era-cycle.js, engines/gauge.js, engines/hazard.js, engines/inst.js, engines/ladder.js, engines/marginal.js, engines/mend.js, engines/plan.js, engines/probe.js, engines/rumor.js, engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `export-throw` | core/audit-log.js, core/rand.js, engines/org.js, ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `eye-face-clash` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `folded_too_small` | engines/inject-budget.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `frozen` | engines/tempo.js, engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `future-event` | engines/parallel-events.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `high-vigilance` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `identical` | engines/masks.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `insufficient-contrib` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `invalid-actors` | engines/rivalry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `judge-not-configured` | direction/oracle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `knowers-full` | engines/enigma.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `ledger-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `length-or-empty` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `locked` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `major-gate` | engines/warrant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `manual` | engines/backstage.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `manual-mode` | engines/backstage.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-answer` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-cause` | engines/beast-bond.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-claim` | engines/probe.js, engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-coverage` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-delayed` | engines/causal.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-event` | engines/era-cycle.js, engines/gauge.js, engines/ladder.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-find` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-foreshadow` | engines/longline.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-key` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-question` | engines/probe.js, engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-reason` | engines/coop.js, engines/probe.js, engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-source` | engines/shadow.js, engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-span` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-target` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-thread` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-what` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `module-missing` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `negative-span` | engines/tempo.js, engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-basis` | engines/liaison.js, engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-candidates` | engines/opinion.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-capacity` | engines/survival.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-change` | engines/shadow.js, actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-channel` | engines/opinion.js, actors/profile.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-chat` | core/settle-guard.js, engines/backstage.js, engines/chatcache.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-companion` | engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-debt` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-host` | engines/session.js, render/inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-id` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-input-el` | render/theater.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-merit` | engines/karma.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-name` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-pending` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-rules` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-shadow` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-snapshot` | render/inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-stale-subkeys` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-storage` | core/settings-bus.js, engines/checkpoints.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-th` | engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-time-word` | engines/calendar.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-volume` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no_sources` | engines/timeline.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `non-positive-delta` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `none` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-array` | core/evict.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-assigned` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-at-cap` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-enabled` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-found` | core/plugin.js, core/settings-bus.js, engines/chatcache.js, engines/parallel-world.js, render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-mounted` | engines/lonsha-reader.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-open` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-pending` | engines/hazard.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-resolved` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-undoable` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `nothing-to-offset` | engines/karma.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `off-step` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `ok` | engines/lonsha-reader.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `orphan-recovery` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `outfit-clash` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `over-cap` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `over-pace` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `over_budget` | engines/inject-budget.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `overlap` | engines/affect.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `parse-fail` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `payroll-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `pending-full` | engines/inst.js, engines/spotlight.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `pending_dropped` | engines/horizon.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `pinned_over_budget` | engines/inject-budget.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `pool-full` | engines/quota.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `prerequisite-open` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `probe-threw` | engines/lonsha-reader.js, engines/perf-trace.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `rand-unavailable` | engines/hazard.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `read-back-failed` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `read-failed` | core/settings-bus.js, core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `readback-failed` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `ready` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `reconcile-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `registry-missing` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `remove-threw` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `resource-missing` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `revivable` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `roster-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `rows-full` | engines/enigma.js, engines/hazard.js, engines/karma.js, engines/marginal.js, engines/mend.js, engines/tolerance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `same-day` | engines/era-cycle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `same-gear` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `same-layer` | engines/temperament.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `same-person` | engines/bonds.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `schedule` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `scheduled-elsewhere` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `self-pair` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `self-road` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `settle-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `shadow-closed` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `slots-exhausted` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stage-off` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `staged-still-present` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stale` | engines/tolerance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stale-event` | engines/era-cycle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stale-proposal` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `step-too-large` | engines/gauge.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `store-` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `store-fail` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `store-unavailable` | engines/act.js, engines/affect.js, engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/canon.js, engines/causal.js, engines/checkpoints.js, engines/chrono.js, engines/collab.js, engines/coop.js, engines/economy.js, engines/enigma.js, engines/era-cycle.js, engines/events.js, engines/fondness.js, engines/hazard.js, engines/inst.js, engines/intel.js, engines/karma.js, engines/ladder.js, engines/liaison.js, engines/life.js, engines/longline.js, engines/marginal.js, engines/masks.js, engines/mend.js, engines/opportunity.js, engines/org.js, engines/parallel-events.js, engines/phone-bridge.js, engines/plan.js, engines/probe.js, engines/quota.js, engines/region.js, engines/rehearsal.js, engines/rumor.js, engines/session.js, engines/shadow.js, engines/spotlight.js, engines/stage.js, engines/survival.js, engines/temperament.js, engines/tempo.js, engines/temporal-lock.js, engines/threads.js, engines/tolerance.js, engines/warrant.js, engines/weather.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stringify-failed` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `thread-terminal` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `throw` | engines/backstage.js, direction/oracle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `thrown` | engines/lonsha-reader.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `too-long` | engines/canon.js, engines/chrono.js, engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `too-many-coverage` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `too-soon` | engines/hazard.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `top` | engines/gauge.js, engines/ladder.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `top-role` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `top-stage` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `trigger-fired` | engines/temperament.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `trusted-person` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unknown-basis` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unknown-kind` | engines/rehearsal.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unknown-place` | engines/region.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unknown-site` | core/evict.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unlocked` | engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unparseable` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unreachable` | engines/act.js, engines/intel.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unregistered-setting` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `verify` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `within-lock` | engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `write` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `write-fail` | actors/registry.js, render/theater.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `write-failed` | core/settings-bus.js, engines/checkpoints.js, engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |

