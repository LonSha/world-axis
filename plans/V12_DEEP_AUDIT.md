# WorldAxis V12 深度审计

状态：A 批审计完成，产品实现尚未开始。
范围：覆盖 V12 的 18 项升级方向，以及 `engines/`、`actors/`、`core/`、`render/`、`ui/` 顶层 338 个 JavaScript 文件的初始归属。本文不是逐文件行为验收；逐文件消费者追踪仍按下述主线继续收敛。

## 审计结论

WorldAxis 当前不是缺少孤立功能，而是局部能力密度很高、跨域结算链不稳定。已确认的真实产品短板是：

1. 人物、事件、经济、地点和记忆各有写口，但缺少统一的场景意图与后果回流协议。
2. `life`、`agency`、`causal`、`events`、`memory`、`intel` 等已经能产生状态，尚未证明它们在同一真实玩家路径中连续消费彼此的结果。
3. `round-drivers` 只负责少量零参推进器，不能代替需要人物、地点、资源和玩家选择的场景结算编排。
4. `worldFacts`、`memory.facts`、人物档案、关系图和期刊材料存在多个消费面；真相、证据、相信、传闻的边界已有局部实现，需要统一到产品流程而不是继续增加摘要字段。
5. 许多模块的统计、诊断和只读面成熟，但不能把“有报告”当成“玩家可介入、世界会反馈”。

## 18 项审计矩阵

状态等级：`A` 已有可复用能力；`B` 已有能力但未贯通；`C` 明确产品缺口；`S` 主要是消费面/编排面，需依附主线。

| 项 | 方向 | 关键现有能力 | 审计等级 | 首要缺口与实施入口 |
|---|---|---|---|---|
| OPV12-1 | 人物人格与自主生活 | `life.js`, `agency.js`, `plan.js`, `motive-arbitration.js`, `persona-anchor.js`, `temperament.js`, `day-route.js`, `intent-board.js` | B | 目标、承诺、习惯和认知没有稳定汇入同一次行动选择；先做统一人物意图快照与行动后果回写。 |
| OPV12-2 | 事件因果与长期叙事 | `causal.js`, `events.js`, `foreshadow.js`, `story-choice.js`, `story-loop.js`, `aftermath.js`, `investigation.js` | B | 事件链、伏笔、调查和地点后果消费者分散；先统一事件生命周期与后果引用，确保失败能转成新局势。 |
| OPV12-3 | 经济、生产与组织社会 | `economy.js`, `production.js`, `supply-chain.js`, `freight.js`, `commission.js`, `org.js`, `diplomacy.js`, `credit-ledger.js` | B | 资源变化尚未稳定推动人物行动、组织决策和信息传播；先以短缺场景贯通供需、运输、劳动、信用和协商。 |
| OPV12-4 | 地理、时间与远方世界 | `clock.js`, `playtime.js`, `calendar.js`, `geo-tracker.js`, `farfield.js`, `horizon.js`, `region.js`, `offline-return.js` | B | 远方推进与当前位置、消息延迟、旅行归来尚未形成同一产品结算；先定义剧情时间与地点状态的消费合同。 |
| OPV12-5 | 认知、记忆与信息生态 | `memory.js`, `intel.js`, `epistemic-view.js`, `anti-omniscience.js`, `pmem.js`, `rumor.js`, `opinion.js`, `observation-projection.js` | B | 真相/证据/相信/公共传闻虽有局部模型，但行动消费链和纠错回流不足；先建立事件证据包到人物认知的单向投影。 |
| OPV12-6 | 叙事表达与模型协作 | `backstage.js`, `scene-narrative.js`, `beat-*`, `reasoning*`, `ensemble.js`, `narrative-deduction.js`, `output-guard.js` | B | 规则状态与模型候选文本的职责边界已有基础，场景冲突和信息增量尚未由真实后果驱动；先让叙事消费已结算的场景账。 |
| OPV12-7 | 行动、成长与玩法回馈 | `act.js`, `action-desk.js`, `action-methods.js`, `training.js`, `gauge.js`, `success-grade.js`, `survival.js`, `hazard.js` | B | 检定与成长存在，但成功/失败对关系、资源、后续机会的统一反馈不足；先接入行动回执和多成本路径。 |
| OPV12-8 | 创作、开局与内容经营 | `playable-blueprint.js`, `playable-seed.js`, `first-run.js`, `populate.js`, `stage.js`, `periodicals.js`, `branch-*`, `tool-import.js` | B | 开局配置、可玩冲突、持续创作和出版物仍是相邻流程；先让蓝图生成可消费的目标、人物承诺、地点和初始事件。 |
| OPV12-9 | 全局协同与玩家工作台 | `intake-dispatch.js`, `workflow.js`, `unified-pending.js`, `pending-center.js`, `round-drivers.js`, `inject-*`, `ui/panel.js` | C/B | 现有工作台偏诊断与模块入口，缺少围绕“发生什么/能做什么/后果是什么”的场景协同层；它是总编排入口，不应另造状态真源。 |
| EXV12-1 | 世界导演台 | `stage.js`, `story-tone.js`, `tempo.js`, `theme.js`, `rule-pack.js`, `scene-budget.js` | B | 设置存在但未统一转成导演意图并传入场景编排；依赖 OPV12-9。 |
| EXV12-2 | 多视角同一事件 | `epistemic-view.js`, `observation-projection.js`, `perspective-lock.js`, `intel.js`, `periodicals.js` | B | 多视角投影和期刊消费面存在，缺少同一事件的共享证据包与视角差异回流；依赖 OPV12-2/5。 |
| EXV12-3 | 共同体记忆与城市性格 | `sediment.js`, `aftermath.js`, `community-note.js`, `region.js`, `opinion.js` | B/C | 地点沉积和公共叙事存在，未稳定影响居民行动、组织立场和事件机会；依赖 OPV12-2/3/4/5。 |
| EXV12-4 | 承诺网络与社会连锁反应 | `life.js`, `agenda.js`, `credit-ledger.js`, `relation-graph.js`, `relation-temp.js`, `diplomacy.js`, `commission.js` | B | 承诺、债务、关系和外交分别可记账，缺少统一到期、履约、违约和替代合作链；依赖 OPV12-1/2/3。 |
| EXV12-5 | 可协商的困局 | `diplomacy.js`, `contest.js`, `ruling.js`, `investigation.js`, `story-choice.js`, `agency.js` | B | 多个解法入口已有，条件、代价、反应和未决后果未统一为同一场景协议；依赖 OPV12-2/7。 |
| EXV12-6 | 文明阶段与制度变迁 | `era-cycle.js`, `phase-transition.js`, `institutional-inertia.js`, `knowledge-practice.js`, `tech-lineage.js`, `public-agenda.js` | B | 慢变量和制度组件已有，缺少由经济、知识传播和公共议程积累触发的玩法条件变更；依赖 OPV12-3/4/5。 |
| EXV12-7 | 世界内信息生活 | `periodicals.js`, `intel.js`, `rumor.js`, `opinion.js`, `community-note.js`, `history-search.js` | B | 渠道和出版物存在，订阅、受众、延迟、可信度尚未成为玩家可采取行动的统一入口；依赖 OPV12-5/8/9。 |
| EXV12-8 | 剧本生态与题材适配 | `preset-world.js`, `preset.js`, `recipe.js`, `rule-pack.js`, `playable-blueprint.js`, `stage.js` | B | 预设偏配置集合，尚未稳定产出可玩的冲突网络、人物目标、地点性格与修改边界；依赖 OPV12-8。 |
| EXV12-9 | 世界回放与反事实沙盘 | `checkpoints.js`, `branch-tree.js`, `branch-diff.js`, `rehearsal.js`, `rehearse.js`, `parallel-world.js`, `path-echo.js` | B | 分支和预演能力存在，缺少面向玩家的“后果链解释”和隔离应用流程；依赖 OPV12-2/9。 |

## 已确认的状态真源

- 剧情时间：优先使用 `evolution.roundOf` 及既有 `clock`/`playtime` 适配，不新增第二个轮次。
- 世界事实：`store.worldFacts`；长期事实沉淀由 `memory.facts` 版本化保存，不能混为同一层。
- 人物生活与意图：既有 `life`、人物档案及 `agency` 读写口；不得另建人物状态树。
- 因果与后果：既有 `causal`、`events`、`aftermath`、`foreshadow`，新能力应写入其可追踪链。
- 认知与信息：`intel`、`epistemic-view`、`pmem`、`rumor` 负责从世界证据向有限认知投影。
- 经济与组织：沿用 `economy`、`production`、`freight`、`org`、`diplomacy` 和既有台账。
- 叙事表达：模型只提出候选文本；可落账的变化必须由结构化规则写口决定。

## 依赖顺序

1. **场景协同合同**：定义玩家意图、参与者、地点、时间、可用证据、候选行动、结算回执和后果引用的最小结构。入口候选：`engines/liaison.js`、`engines/intake-dispatch.js`、`core/workflow.js`，先复用后扩展。
2. **人物—承诺—行动回执**：贯通 `life`、`agency`、`plan`、`relation-temp`、`agenda`。
3. **事件—证据—后果链**：贯通 `events`、`causal`、`aftermath`、`foreshadow`、`investigation`。
4. **认知—传播—记忆回流**：贯通 `intel`、`epistemic-view`、`pmem`、`rumor`、`memory`、`periodicals`。
5. **短缺—生产—运输—组织场景**：贯通 `economy`、`production`、`freight`、`labor-schedule`、`diplomacy`、`credit-ledger`。
6. **时间—地点—远方推进**：贯通 `clock`、`playtime`、`geo-tracker`、`farfield`、`horizon`、`region`。
7. **行动成长与多解困局**：贯通 `act`、`action-methods`、`training`、`success-grade`、`story-choice`、`contest`。
8. **叙事、开局、信息生活与工作台**：接入 `backstage`、`scene-narrative`、`playable-blueprint`、`periodicals`、`ui/panel`。
9. **导演台、文明变迁、回放沙盘**：在上述链稳定后接入 EXV12-1/6/9。

## 首批真实贯通场景

优先实现两个可验证场景，覆盖最多主线：

- **失约与替代合作**：玩家改变一个承诺或行动条件，真实写口产生到期/违约，人物关系与信用变化，有限认知生成不同解释，传闻或期刊消费后影响下一轮行动。
- **城镇短缺**：真实运输或生产写口产生供给变化，劳动/价格/组织决策受影响，人物目标重新仲裁，玩家介入后形成事件后果、记忆和公共信息。

这两条场景不是演示脚本；必须通过现有真实产品写口产生可持久状态变化，且结果能在下一轮被消费者读到。

## 审计限制

- 当前报告基于静态源码、导出 API、消费者搜索和现有计划账；尚未完成所有 338 个文件的逐行行为审阅。
- 外部模型供应商生成仍未验证；模型协作结论只针对规则与受控调用边界。
- 全量 `node tests/run.js` 按用户既有纪律暂不执行；后续按双计划阶段做定向验证。
- 研究、生存、健康和冲突相关能力保持抽象游戏状态，不扩展为现实危险操作指导。
