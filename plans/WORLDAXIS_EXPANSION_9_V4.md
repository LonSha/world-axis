# WorldAxis 拓展、拓宽与创新计划 V4：让社会系统拥有真实的生态和人口边界
> 制定日期：2026-10-24
> 基线：`v2.232.0` / `e675e0f` / `origin/master`
> 状态：提案，待逐批实施
> 配套：[优化提升九项 V4](WORLDAXIS_OPTIMIZATION_9_V4.md)

## 差异化判断
V3 已落地资源承载（`environmental-capacity`）、设施网络/降级与替代（`service-network`）、有限注意传播（`rumor.competeForAttention`）、公共项目（`coop`）、地方规约/先例（`custom-lax`）、证据视角（`epistemic-view`）、连锁冲击及地方路径（`aftermath-impact`、`phase-transition`）。这些都不再作为“待增加系统”。

仍有意义的空白在社会系统的慢变量：消费后的废弃物如何回到生产约束、人口迁移如何改变地方能力与家庭/组织关系、公共决策如何在代表性不足时失去合法性、知识实践如何跨群体传播但不复制。创新要改变真实行动空间和长期结果，不做新数值面板、世界模拟器或治理守卫。

## 九项
### EXV4-1｜材料生命周期与废弃物回流
**真实缺口：** environmental-capacity 管区域资源压力，economy/production 管存量和工单；仓库尚无覆盖“使用—损耗—废料—回收/处置—再投入”的完整跨周期材料链。
**交付：** 选少量可回收材料，使生产、维修、事故生成副产物；回收需工位、劳动和时间并有损耗/污染差异，结果回到既有库存与承载力 owner。
**验收：** 新料与回收料有成本/质量取舍；废物可积压并影响地点或工位；回收不凭空增量；关闭功能不破坏旧存档。P1，30–46 小时。
*现场落地：* 已在 `engines/environmental-capacity.js` 落地可回收材料规格声明（`declareRecyclableMaterial`）、生产/维修/事故废料生成与拥堵状态动态分级（`generateScrap`，normal -> congested -> choked）、严格物质守恒回收与库存联动（`recycleScrap`，`produced = floor(scrap * yieldRate), loss = scrap - produced`）、全生命周期与效能只读审计（`materialLifecycle`）；在 `engines/action-desk.js` 接入对应路由；专测 `tests/exp37-material-lifecycle-recycle-v2233.js`（26 项断言全绿，含单行真源码负控制与 10 次纯读零写入状态隔离），死导出账本 1030 零漂移。已结项合入。
### EXV4-2｜人口迁入迁出与地方能力变化
**真实缺口：** people、travel、family、org、service-network 已存在，但长期人口流动尚未成为劳动力、照护、服务覆盖与地方路径的共同因果。
**交付：** 以迁居/季节性流动事件改变现有角色地点、可用时段和关系责任；迁入由居住/服务/工作承载约束，迁出留下待接续义务。人口统计为投影，不建第二人物库。
**验收：** 至少两类流动改变服务/生产能力；家庭或组织责任可转交、未转交会有后果；未到达者不提前参与；重载不复制角色或义务。P1，30–48 小时。
*现场落地：* 已在 `engines/demographic-flow.js` 建立人口流动闭环（地点承载声明 `setPlaceCapacity`、迁居预检 `planMigration`、责任移交/滞留 `commitMigration`、在途豁免 `arriveMigration`、季节性流动返乡 `recordSeasonalDeparture`/`recordSeasonalReturn`、纯读人口投影 `demographicProjection`）；在 `engines/action-desk.js` 接入 7 项真实路由；专测 `tests/exp38-demographic-flow-migration-v2233.js`（37 项断言全绿，含单行真源码负控制与 10 次纯读零写入状态隔离），死导出账本 1030 零漂移。已结项合入。
### EXV4-3｜照护链与公共服务韧性
**真实缺口：** `lifeline` 已有病况、照护步骤与活动限制，`family` 有照护记录，`service-network` 有设施服务；缺口不是再造照护登记，而是照护者缺席时，需求如何跨家庭与公共服务接续并改变真实服务状态。
**交付：** 将照护需求作为预约/承诺被服务节点和家庭协作消费；缺席引发替代、排队、风险累积或服务转介，由原 owner 记录。
**验收：** 双人照护者缺席可导致真实改派/延迟；接续消耗可追踪资源；服务网络中断影响不同人群；成功转介不抹除原始失约。P1，28–44 小时。
*现场落地：* 已在 `engines/care-chain.js` 落地照护需求承诺登记（`registerCareCommitment`）、缺席状态判定（`assessCaregiverAbsence`，联动 `lifeline` 重度限制与在途旅行 `isTraveling`）、缺席失约与风险分级累积（`reportCareAbsence`，warning -> critical -> emergency）、跨家庭与设施转介（`referCare`，带资源消耗且完整保留历史失约记录）、公共队列承压（`queueForPublicCare`）与纯读韧性指数投影（`careChainProjection`）；在 `engines/action-desk.js` 接入 7 项真实路由；专测 `tests/exp39-care-chain-resilience-v2233.js`（42 项断言全绿，含单行真源码负控制与 10 次纯读零写入状态隔离），死导出账本 1030 零漂移。已结项合入。
### EXV4-4｜公共议程设置与代表性缺口
**真实缺口：** rumor/opinion、custom-lax、coop 和 operations 有传播、规则及项目，但“谁的问题能进入公共议程”尚未影响制度结果。
**交付：** 让不同群体提出有证据的议题，受传播覆盖、代表资格、资源与议程容量影响进入/延迟/被拒；采用既有提案与批准流程，不造第二套议会。
**验收：** 至少三群体争夺有限议程位；被排除议题保留并可能后续进入；局外人不得知秘密；通过议题改变具体规则/服务/项目。P1，28–44 小时。
*现场落地：* 已在 `engines/public-agenda.js` 落地议程容量约束（`setAgendaCapacity`）、群体带证据议题提交（`submitProposal`）、有限槽位竞争与延期积压保留（`scheduleAgenda`）、审议通过并真实联动制度与项目（`enactAgendaTopic`，联动 `customLax.spawnCandidate` / `coop.proposeProject`）、局外人保密视角隔离（`viewAgenda`，非允许群体查阅屏蔽 `redactedCount`）、纯读代表性投影（`publicAgendaProjection`）；在 `engines/action-desk.js` 接入 7 项真实路由；专测 `tests/exp40-public-agenda-representation-v2233.js`（34 项断言全绿，含单行真源码负控制与 10 次纯读零写入状态隔离），死导出账本 1030 零漂移。已结项合入。
### EXV4-5｜共同资源的使用权与维护责任
**真实缺口：** coop 已有具名贡献、缺席处理、项目结算，service-network 有设施容量和维护；长期公共资产的使用权、维护负担和搭便车后果尚需形成完整玩法。
**交付：** 让共享设施/资源声明开放条件、预约权、维护轮值和故障责任；贡献历史可影响有限优先权但不生成通用声望币。
**验收：** 至少两种治理方案对开放度/维护成本有不同代价；逾期维护导致真实降级；争议可协商或裁决；规则变更不追溯抹除已兑现使用权。P1，28–44 小时。
*现场落地：* 已在 `engines/commons-governance.js` 落地共同资产声明与准入模型（`declareCommonAsset`，支持 open_access 与 contributor_priority 两种对立方案）、使用权预约配额控制与资格校验（`reserveCommonAsset`）、维护工时累积与状态恢复（`contributeMaintenance`）、逾期不维护真实物理降级（`auditAssetDecay`，degraded -> failing）、改制不追溯失效（`changeGovernanceModel`）、争议协商与仲裁追责（`resolveAssetDispute`）、纯读利用率与损毁投影（`commonsProjection`）；在 `engines/action-desk.js` 接入 7 项真实路由；专测 `tests/exp41-commons-governance-v2233.js`（27 项断言全绿，含单行真源码负控制与 10 次纯读零写入状态隔离），死导出账本 1030 零漂移。已结项合入。
### EXV4-6｜知识的地方传播与实践许可
**真实缺口：** research、tech-lineage、inst、rumor 有成果/标准/传播，但知识可见、可学、可实际操作的差异没有形成共同消费链。
**交付：** 把研究成果拆成可接触资料、实践许可、必要工具/材料和验证经验；传播受渠道与关系约束，实际使用由生产/研究 owner 检查，不以师徒数量或等级解锁。
**验收：** 公开资料不等于会操作；不同地点条件产生兼容差异；未获许可者不能绕过既有规则；失败实践留下可检索证据并能改进后续方案。P2，26–42 小时。
*现场落地：* 已在 `engines/knowledge-practice.js` 落地知识与规范登记（`registerKnowledgeSpec`）、实践许可授予（`grantPracticeLicense`）、实践执行检验（`executePractice`，未获许可强行操作遭 `unauthorized-practice` 拦截，缺少必要工具遭 `missing-prerequisites` 拦截，环境条件冲突导致失败并生成具名缺陷证据）、基于实操失败证据改良规范（`refineKnowledgeFromEvidence`）与纯读实践投影（`knowledgePracticeProjection`，10 次连续调用 store 绝对零写入）。接入 ActionDesk 路由、tool-diag 并在 `tests/exp42-knowledge-practice-license-v2233.js` 固化 24 项断言与单行真源码负控制。死导出账本 1030 零漂移。已结项合入。
### EXV4-7｜地方风险分担与保险式互助
**真实缺口：** aftermath-impact 能追责、赔偿、补救，coop/custom-lax 有互助和担保，但灾前共同分摊如何换取灾后有限救助未形成闭环。
**交付：** 允许群体对具名风险建立有限互助池、缴纳承诺、受灾资格与封顶支援；资金/材料流仍进入现有 economy/coop，保留排除和偿付争议。
**验收：** 事件发生前后加入条件有差异但不追溯；支援封顶且资金守恒；欺诈需证据；未足额池子只部分补偿，不凭空补齐。P2，30–46 小时。
*现场落地：* 已在 `engines/risk-pooling.js` 落地具名风险互助池建立（`declareRiskPool`）、入池注资（`pledgeMutualFund`）、灾后封顶理赔与有限救助（`claimMutualRelief`，严格核验灾前入池资格 `not-enrolled-prior-to-disaster`，受单笔上限封顶约束，池内资金不足时按残值部分折算 `partialCoverage`，资金守恒绝不凭空造钱）、欺诈与争议申报（`disputeReliefClaim`）以及纯读只读投影（`riskPoolingProjection`，10 次连续调用状态完全隔离）。接入 ActionDesk 路由、tool-diag 并在 `tests/exp43-risk-pooling-mutual-aid-v2233.js` 固化 28 项断言与单行真源码负控制。死导出账本 1030 零漂移。已结项合入。
### EXV4-8｜地方身份与多重归属冲突
**真实缺口：** relation/org/region/social-legacy 已有关系、组织和历史身份，但一个人同时依赖家庭、职业团体、居住地时的利益冲突缺少能改变行动结果的明确表达。
**交付：** 在具体事件中记录角色受影响的群体归属、义务和可知证据；冲突改变参与、回避、调停或退出成本，事实和立场分开存，不新造好感货币。
**验收：** 同一角色面对互斥义务时不能两边都自动履约；退出/调停有真实代价；组织与亲历者所知不同；解决后保留历史责任。P2，26–42 小时。
*现场落地：* 已在 `engines/role-conflict.js` 落地多重归属义务声明（`registerAffiliationObligation`）、互斥事件冲突识别（`detectRoleConflict`，无双向义务时拦截 `no-dual-obligation`）、立场裁决与真实代价（`resolveConflictStance`，支持 comply 单方违约、recuse 回避退出代价、mediate 调停与 breach 双背叛，不造好感货币）、视角隔离与组织可知性（`viewConflictPerception`，外部组织仅见公开事实且动机受遮蔽）以及纯读只读投影（`roleConflictProjection`，10 次调用状态完全隔离）。接入 ActionDesk 路由、tool-diag 并在 `tests/exp44-role-conflict-obligations-v2233.js` 固化 31 项断言与单行真源码负控制。死导出账本 1030 零漂移。已结项合入。
### EXV4-9｜世代交替与制度惯性
**真实缺口：** social-legacy、phase-transition、custom-lax 有历史解释、路径和地方惯例，但人员更替后制度为何延续、变形或失效缺少可玩的代际传递。
**交付：** 将一小组规则/技术/共同承诺绑定到可传递的文书、设施、实践者和支持群体；负责人离场时由继任者选择继承、修订或放弃并承担过渡成本。
**验收：** 同一制度在两条继承路径下产生不同结果；文书不等于执行能力；孤立设施/缺人制度会退化；原始历史可追溯且不因继承改写。P2，32–50 小时。

## 三大批次与规模
| 批次 | 项目 | 差异化结果 |
|---|---|---|
| A：地方代谢与生活 | EXV4-1～3 | 资源使用、人口流动、照护服务共同改变地方承载 |
| B：公共治理与互助 | EXV4-4、5、7 | 谁有议程权、谁维护资产、风险由谁分担有实际后果 |
| C：知识与历史延续 | EXV4-6、8、9 | 知识/身份/制度在传播和继承中分化，留下路径依赖 |

前三个有效工作日：第一天完成一条材料使用—废弃—回收并影响生产的闭环；第二天完成迁居/照护缺席导致的服务改派；第三天让公共议题的代表性结果改变一项真实规则或项目。九项估算 **258–406 有效工程小时**。与优化线合计 **482–762 小时**，预计至少 25–40 个有效工作日；不能把专项测试、审计、文档和守卫累计成“产品工时”。

**统一结项：** 每项必须从真实玩家操作进入，改变原 owner 状态，呈现失败/替代路径，经过保存重载并被后续场景消费。创新项不得只增加指标或诊断展示；不成立的机制不得为满足计划而硬造。