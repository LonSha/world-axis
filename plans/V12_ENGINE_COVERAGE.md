# V12 全文件升级覆盖账

静态枚举范围：engines、actors、core、render、ui 的顶层 JavaScript 文件。当前共 338 项。归属为初始分工，不是行为深审结果；未深审项不得记完成。

| 文件 | 主归属 | 状态 | 源码标题线索（不是缺陷结论） |
|---|---|---|---|
| `actors/monologue.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis actors/monologue.js (v2.231.0) — 发送前NPC独白推演注入） |
| `actors/observe.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（观测切片：从NPC视角生成一段镜头外观察文本（供面板查看/注入）） |
| `actors/profile.js` | OPV12-1 | 已审计处置 | 保留为消费面并复核实际收益（NPC档案自动维护：after链从正文/推演结果中提取档案增量写回registry） |
| `actors/registry.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis actors/registry.js — NPC注册与档案（SoulLink JSON契约 + 世界背面认知边界）） |
| `core/api-router.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（缝合来源：世界背面 api.js/连接方案分流 + SoulLink 并发限制 + WNE 多API分流） |
| `core/audit-log.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis core/audit-log.js (v2.112.0) — 写操作审计日志（计划二 #67）） |
| `core/clock.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis core/clock.js (v2.15.0) — 时间源治理（第九面：可复现性的另一半）） |
| `core/commit.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis core/commit.js (v2.160.0) — 跨引擎提交契约（TP4）） |
| `core/evict.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis core/evict.js (v2.65.0) — 挤出侧完整性（七面治理的最后一面）） |
| `core/exec.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis core/exec.js (v2.118.0) — 显式执行上下文（计划二 B7 的承重结构）） |
| `core/fault-context.js` | OPV12-9 | 已审计处置 | 保留并纳入真实入口复核（WorldAxis core/fault-context.js (v2.110.0) — 异常的上下文追踪与恢复（计划一 #21）） |
| `core/input-guard.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（统一输入边界层：**所有**来自外部的值（模型输出、导入文件、UI 输入、兼容层）在进入） |
| `core/interceptor.js` | OPV12-9 | 已审计处置 | 保留并纳入真实入口复核（缝合来源：EW-Assistant 主拦截+GENERATION_AFTER_COMMANDS回退 + 世界背面发送前一致性屏障） |
| `core/permissions.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis core/permissions.js (v2.112.0) — 权限系统与角色管理（计划二 #39 / #70 同一机制两处消费）） |
| `core/plugin.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis core/plugin.js (v2.114.0) — 生命周期钩子（计划二 #56）） |
| `core/rand.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis core/rand.js (v2.14.0) — 可复现性（第八面：随机源治理）） |
| `core/sandbox.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis core/sandbox.js (v2.114.0) — 进程内白名单沙箱（计划二 #68）） |
| `core/sanitize.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis core/sanitize.js (v2.111.0) — 输入消毒与转义单一真源（计划二 #69）） |
| `core/schema.js` | OPV12-9 | 已审计处置 | 保留并纳入真实入口复核（WorldAxis core/schema.js (v2.110.0) — 公开入口的输入 schema（计划一 #22）） |
| `core/settings-bus.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis core/settings-bus.js (v2.5.0) — settings 存储统一治理（迁移器侧车）。） |
| `core/settle-guard.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（楼层结算守卫——after 链（世界推进）对每一楼层只结算一次。） |
| `core/store.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（缝合来源：世界背面 store/schema/恢复点/branchOverrides 思路 + World引擎 chatcache） |
| `core/undo.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis core/undo.js (v2.30.0) — 参数编辑受控入口 + 撤销栈） |
| `core/unified-pending.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis core/unified-pending.js (v2.296.0) — 全仓统一待办中心（V10 OPV10-7）） |
| `core/workflow.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（工作流节点注册表：before_reply / after_reply 两链，节点可开关/排序/回滚） |
| `engines/act.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/act.js (v2.117.0) — 行动执行（计划二 B1 主体 + B2 前半）） |
| `engines/action-desk.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/action-desk.js (v2.231.0) — OP-1 场景行动桌） |
| `engines/action-methods.js` | OPV12-7 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/action-methods.js (v2.231.0) — OP-2 能力—工具—行动结果联动） |
| `engines/activity.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/activity.js (v2.231.0) — EXP-7：可参与的公共活动） |
| `engines/affect.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（情绪通道：输出开放动作、硬关闭动作和过载回退，不输出情绪词。） |
| `engines/aftermath-impact.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/aftermath-impact.js (v2.231.0) — OP-6 世界痕迹消费） |
| `engines/aftermath.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/aftermath.js (v2.194.0) — TX8 地点历史的实际后果、修复与复访） |
| `engines/agency.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/agency.js (v2.194.0) — 行动反馈闭环（TX2）） |
| `engines/agenda.js` | OPV12-1 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/agenda.js (v2.182.0) — E2 世界日程 / 期限与未来事件日历） |
| `engines/anti-omniscience.js` | OPV12-5 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/anti-omniscience.js (v2.248.0) — 全域认知隔离与防全知阻断引擎） |
| `engines/appearance.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（外貌分级契约：S/A/B/C 分级 × Layer1-4 覆盖核验 × 关系加权 × 异化档位 × 场景排他。） |
| `engines/archive-hide.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/archive-hide.js (v2.130.0) — 自动隐藏归档楼层（缝 B1）） |
| `engines/atlas.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/atlas.js (v2.187.0) — E6 统一世界地图与关系视图） |
| `engines/auto-hide.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/auto-hide.js (v2.230.0) — 隐藏楼层） |
| `engines/backstage-tone.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（backstage-tone.js —— 题材·口吻·笔记·时辰引擎（WA.backstageTone）） |
| `engines/backstage.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（世界演算底座：后台世界推演 + 认知边界协议 + 双轴可见性 + 世界脉搏 + 三列注入引用） |
| `engines/beast-bond.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（驯兽：驯服度→忠诚度的转化 + 红线状态机（死忠/信赖/勉强/危险），只记账不替演出。） |
| `engines/beat-facade.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/beat-facade.js (v2.193.0) — 拍引擎家族的统一运行门面（计划 U1）） |
| `engines/beat-ledger.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/beat-ledger.js (v2.189.0) — 拍账 / 拍号由引擎推进（缝 A3）） |
| `engines/beat-mask.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/beat-mask.js (v2.129.0) — 信息迷雾 / 蓝图遮罩（缝 A6）） |
| `engines/beat-report.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/beat-report.js (v2.189.0) — 拍回报三档（缝 A1）） |
| `engines/beat.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（beat.js —— 提取·修复·色带引擎（WA.beat）） |
| `engines/binding.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/binding.js (v2.130.0) — 配置绑定优先级（缝 D3）） |
| `engines/bonds.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（关系六型：替身 / 寄生拯救 / 主权让渡 / 利益同盟 / 平行共存 / 对手共生。） |
| `engines/branch-diff.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/branch-diff.js (v2.224.0) — 分支语义比较与选择性移植(N8)） |
| `engines/branch-tree.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/branch-tree.js (v2.153.0) — 多结局分支树（RX6）） |
| `engines/bridge.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（【为什么需要这一面】WorldAxis 是这套三插件里**唯一没有对外接口**的一个——全库只有内部的） |
| `engines/calendar-custom.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/calendar-custom.js (v2.130.0) — 自定义历法（缝 C1）） |
| `engines/calendar.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/calendar.js (v0.2) — 世界钟/日历推进（缝合 SevenDaysCal）） |
| `engines/campaign.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/campaign.js (v2.187.0) — E4 场景 / 战役层（目标、阶段、结束条件）） |
| `engines/canon.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（原著分幕：把一部长文本切成分层可定位的「幕 → 剧情点」骨架（只切分，不改写）。） |
| `engines/capability-audit.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/capability-audit.js (v2.257.0) — 启用面可见（OPV6-2）） |
| `engines/capability-tier.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/capability-tier.js (v2.257.0) — 能力档位（OPV6-1）） |
| `engines/capacity-audit.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/capacity-audit.js (v2.216.0) — O4 存储压力 / 义务清点 / 迁移预检） |
| `engines/care-chain.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/care-chain.js (v2.233.0) — EXV4-3 照护链与公共服务韧性） |
| `engines/causal.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（因果结算：原因成立 → 条件满足 → 行动发生 → 直接后果 → 延迟后果。） |
| `engines/chapters.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/chapters.js (v0.2) — 章节叙事（缝合 st-beat-tracker）） |
| `engines/chatcache.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（酒馆缓存与存档：chat_metadata跨设备同步 + 防丢失快照） |
| `engines/checkpoints.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/checkpoints.js (v2.82.0) — 快照与分支（第十六面：存档 ≠ 保存过 = 分支）） |
| `engines/chronicle-view.js` | OPV12-5 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/chronicle-view.js (v2.182.0) — E5 玩家可读的世界历史与证据日志） |
| `engines/chrono.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/chrono.js (v2.112.0) — 因果链追踪（计划二 #31 + #32 + #33）） |
| `engines/collab.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/collab.js (v2.112.0) — 协作会话 · 异步队列 · 冲突登记（计划二 #36 + #37 + #38 + #40）） |
| `engines/commission.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/commission.js (v2.169.0) — TX6 多阶段委托、交付核验与资源履约） |
| `engines/commons-governance.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/commons-governance.js (v2.233.0) — EXV4-5 共同资源的使用权与维护责任） |
| `engines/community-note.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/community-note.js (v2.230.0) — 社区笔记） |
| `engines/compact-timing.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/compact-timing.js (v2.251.0) — 折叠时机（缓存冷热判据）） |
| `engines/compare.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（compare.js —— 差异·净化·变体引擎（WA.compare）） |
| `engines/contest.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/contest.js (v2.231.0) — EXP-5：可选规则的对抗场景） |
| `engines/contract-audit.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/contract-audit.js (v0.9.6) — 推演契约对账器（纯只读）） |
| `engines/coop.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/coop.js (v2.118.0) — 多人协作可靠性层（计划二 B9）） |
| `engines/coordinate.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（coordinate.js —— 坐标·日程·台账引擎（WA.coordinate）） |
| `engines/credit-ledger.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/credit-ledger.js (v2.251.0) — 借据账（欠条 / 计息 / 先息后本 / 逾期）） |
| `engines/custom-lax.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/custom-lax.js (v2.231.0) — IN-4 习俗到制度） |
| `engines/day-route.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/day-route.js (v2.266.0) — 人物今日动线：NPC 的一天看得见） |
| `engines/deep-clean.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/deep-clean.js (v2.230.0) — 深度清理生命周期） |
| `engines/defer-token.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/defer-token.js (v2.251.0) — 延迟任务的代际令牌与串行尾链） |
| `engines/demographic-flow.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/demographic-flow.js (v2.233.0) — EXV4-2 人口迁入迁出与地方能力变化） |
| `engines/dep-check.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/dep-check.js (v2.187.0) — E8 蓝图 / 种子依赖包与迁移助手（**纯读**）） |
| `engines/difficulty.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（世界难度档：三个可落盘的全局参数，分别喂给因果、态度与时间流速。） |
| `engines/digest.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（缝合来源：DlSNlGHT World —— world-engine-evolution.js world_digest机制） |
| `engines/diplomacy.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/diplomacy.js (v2.165.0) — 可谈判、可履约的势力外交（TX1）） |
| `engines/direct-event.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/direct-event.js (v0.2) — 突发事件（缝合 st-direct-event：一轮生成·多轮解封）） |
| `engines/dream-settle.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/dream-settle.js (v2.251.0) — 梦境结算的空稿闸与去现实标记） |
| `engines/dream.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（dream.js —— 长梦·长卷引擎（WA.dream）） |
| `engines/driver-ledger.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/driver-ledger.js (v2.275.0) — 驱动者登记表：谁在什么时机驱动哪个引擎） |
| `engines/eco-audit.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/eco-audit.js (v2.154.0) — 世界生态自洽审计（RX7）） |
| `engines/economy.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/economy.js (v2.119.0) — 生产、消费与供需变化（拓展计划 ③）） |
| `engines/editor-events.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/editor-events.js (v0.9.0) — 事件链编辑器（结构化 CRUD）） |
| `engines/editor-faction.js` | OPV12-3 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/editor-faction.js (v0.9.0) — 势力编辑器（结构化 CRUD）） |
| `engines/elsewhere.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/elsewhere.js (v2.230.0) — 彼方·幕后 NPC 档案） |
| `engines/enemies.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（仇敌录：blood血仇/grudge恩怨 + 黑盒（隐秘行为/资产） + 天下大势） |
| `engines/enigma.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（信息暗礁：秘密的知情名单与越界核验。） |
| `engines/ensemble.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/ensemble.js (v2.138.0) — 多模型并发推演与结果仲裁（E5）） |
| `engines/entities.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（实体记忆库：组织/物品/能力/地点 四类实体 + 别名索引） |
| `engines/entry-router.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（世界书条目按需激活路由（缝合来源：Awene cultivation-rule-router）） |
| `engines/environmental-capacity.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/environmental-capacity.js (v2.231.0) — IN-7 有承载力的环境） |
| `engines/ephemeral-scrub.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/ephemeral-scrub.js (v2.251.0) — 注入块的历史洗除（阅后即焚）） |
| `engines/epistemic-view.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/epistemic-view.js (v2.231.0) — OP-7 让角色按自己手里的版本行动） |
| `engines/era-cycle.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（资料片周期：长草期→预热期→爆发期→结算期的状态机，倒计时按天数增量推进。） |
| `engines/events.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/events.js (v2.291.0) — 事件调度（第十五面：排期 ≠ 触发）） |
| `engines/evidence-board.js` | OPV12-2 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/evidence-board.js (v2.222.0) — 调查证据工作台（拓展 N4）） |
| `engines/evolution.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（事件演化：双类型四阶段骰子推进 + 势力/声誉/经济/风声/仇敌/影响链/黑盒/天下大势） |
| `engines/faction-graph.js` | OPV12-3 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/faction-graph.js (v2.139.0) — 势力关系动态图与张力热力图（E9）） |
| `engines/family-ops.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/family-ops.js (v2.231.0) — OP-5 共同生活经营） |
| `engines/family.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/family.js (v2.231.0) — EXP-9：家庭、共同生活与代际延续） |
| `engines/farfield.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/farfield.js (v2.151.0) — 远方世界脉搏（RX3）） |
| `engines/fate.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（fate.js —— 判定·骰式·选项治理引擎（WA.fate）） |
| `engines/field-writers.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（多写者字段的写权声明表 —— **单一真源**。） |
| `engines/first-run.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/first-run.js (v2.271.0) — 第一次开局的三步引导 (EXV6-7)） |
| `engines/floor-changes.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/floor-changes.js (v2.50.0) — 楼层变更联动账（纯只读）） |
| `engines/floor-settle.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/floor-settle.js (v2.231.0) — OPT-5：楼层结算账（重掷/删楼不残留旧状态）） |
| `engines/floor-snapshot.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/floor-snapshot.js (v2.230.0) — 楼层快照 FIFO + 清空层回滚） |
| `engines/followup-gate.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/followup-gate.js (v2.251.0) — 越过静默阈值的升级提醒闸门） |
| `engines/fondness.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（好感审计：步进白名单 + 好感不降准则 + 上限 + 区间语义 + 阶段授权 + 提案过期 + 行级撤销 + 纠错依据。） |
| `engines/foreshadow.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/foreshadow.js (v2.134.0) — 伏笔生命周期（E6）） |
| `engines/freight.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/freight.js (v2.167.0) — 守恒运输与在途履约（TX3）） |
| `engines/gauge.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（阻尼量规：0..100 推进度 × 单步阻尼限幅 × 四大里程碑事件。） |
| `engines/gear.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/gear.js (v2.231.0) — EXP-2：个人物品、装备与使用后果） |
| `engines/gen-gate.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/gen-gate.js (v2.189.0) — 生成闸门与防重复名单（缝 B1 + B2）） |
| `engines/gen-timing.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/gen-timing.js (v2.250.0) — GT-1 主动时机决策（渴望累积 / 状态推断 / 信息增益）） |
| `engines/geo-tracker.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/geo-tracker.js (v2.245.0) — MAP-1：角色位置感知、正文反哺透镜与消歧引擎） |
| `engines/group-refuse.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/group-refuse.js (v2.130.0) — 群聊显式拒绝（缝 A3）） |
| `engines/handoff-pack.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/handoff-pack.js (v2.273.0) — 一键交班：把这一局的经验带走 (EXV6-9)） |
| `engines/hazard.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（累积风险账：重复事件的概率滑落与延迟显形。） |
| `engines/health-preflight.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/health-preflight.js (v2.247.0) — 全向系统健康与生成质量前置预检器） |
| `engines/history-search.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/history-search.js (v2.201.0) — Y6 世界历史检索（跨库检索面）） |
| `engines/horizon.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（缝合来源：DlSNlGHT World —— world-engine-evolution.js 远方/近端事件完整机制） |
| `engines/host-wb-trace.js` | OPV12-5 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/host-wb-trace.js (v2.50.0) — 宿主世界书激活账（纯只读）） |
| `engines/identity-match.js` | OPV12-5 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/identity-match.js (v2.251.0) — 认人：分数排序 + 判不清带） |
| `engines/inject-budget.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/inject-budget.js (v0.9.3) — 注入预算裁判（纯计算，不自行注入）） |
| `engines/inject-channel.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/inject-channel.js (v0.1.1) — 注入槽位路由（纯只读）） |
| `engines/inject-collector.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（V8 EXV8-1：场景来源留痕。为什么要单独一格而不是塞进 last：） |
| `engines/inject-inspector.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/inject-inspector.js (v0.9.2) — 注入自检（纯只读）） |
| `engines/inject-slot-audit.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/inject-slot-audit.js (v0.1.3) — 注入槽位落地审计（纯只读）） |
| `engines/inject-value.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/inject-value.js (v2.150.0) — 注入价值量化（RP4）） |
| `engines/inline-tags.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/inline-tags.js (v2.302.0) — 正文内联状态回报标签） |
| `engines/inspector-state.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/inspector-state.js (v0.9.0) — 跨引擎状态一致性检查器（纯只读）） |
| `engines/inst.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/inst.js (v2.119.0) — 组织制度、任职权限与权力交接（拓展计划 ④）） |
| `engines/institutional-inertia.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/institutional-inertia.js (v2.233.0) — EXV4-9 世代交替与制度惯性） |
| `engines/intake-dispatch.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（推演结果分发器：把 backstage 的 26 节事实**翻译**成结构化引擎的写口调用。） |
| `engines/intel.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（因果与情报：可追溯事件链、带来源的人物认知。） |
| `engines/intent-board.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（人物意图看板：他在图什么、卡在哪一步。） |
| `engines/interest-face.js` | OPV12-7 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/interest-face.js (v2.252.0) — AOI 兴趣面（谁看得见哪一件事）） |
| `engines/interop.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/interop.js (v2.101.0) — 跨插件互操作验收面（**纯读**）） |
| `engines/investigation.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/investigation.js (v2.194.0) — TX7 线索调查、证据核验与秘密揭示） |
| `engines/kaleidoscope.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/kaleidoscope.js (v2.46.0) — 万花筒） |
| `engines/karma.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（业力双轴：功德 / 业力对等核销与干预阶梯。） |
| `engines/knowledge-practice.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/knowledge-practice.js (v2.233.0) — EXV4-6 知识的地方传播与实践许可） |
| `engines/l3-registry.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（L3 悬空引擎的四类分级登记表 —— **单一真源**。） |
| `engines/labor-schedule.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/labor-schedule.js (v2.231.0) — OP-3 劳动与日程结算（同一段时间只能花一次）） |
| `engines/ladder.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（原型阶梯：档位阶梯 × 事件推进 × 禁跳档。） |
| `engines/ledger-timeline.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/ledger-timeline.js (v2.50.0) — 台账时间轴（纯只读）） |
| `engines/ledger.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（缝合来源：DlSNlGHT World —— world-engine-ledger.js） |
| `engines/length-policy.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/length-policy.js (v2.230.0) — 字数策略） |
| `engines/liaison.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/liaison.js (v2.118.0) — 跨插件业务闭环（计划二 B8）） |
| `engines/life.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（人物生活：持续目标、关系承诺、基础日程、条件式行动。） |
| `engines/lifeline.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/lifeline.js (v2.141.0) — 生理与照护真实层） |
| `engines/limits.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（缝合来源：DlSNlGHT World —— world-engine-evolution.js 输出规范） |
| `engines/lingqi.js` | OPV12-7 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/lingqi.js (v2.230.0) — 玲七管家（管家式调度台）） |
| `engines/living-world.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/living-world.js (v2.237.0) — Living World V6：通用真实世界自治演化与深层人情中枢） |
| `engines/longline.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（长线伏笔：承诺回收时刻 + 逾期欠账（只度量，不改写）。） |
| `engines/lonsha-reader.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/lonsha-reader.js (v2.18.0) — 记忆桥消费面（只读）） |
| `engines/marginal.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（边际递减账：重复正向互动的收益衰减与冷却重置。） |
| `engines/masks.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（假面：对外口径与露馅动作同时在场且不一致，假面才算成立。） |
| `engines/memory-sampler.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/memory-sampler.js (v0.9.7) — 记忆注入采样器（纯只读）） |
| `engines/memory-tiers.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/memory-tiers.js (v2.230.0) — 浅浅结：三层记忆） |
| `engines/memory.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（记忆引擎：L0单轮摘要 / L1近期巩固 / L2章节回顾 / L3长线沉淀 + facts更迭 + 伏笔生命周期） |
| `engines/mend.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/mend.js (v2.119.0) — 关系修复与破裂（拓展计划 ②）） |
| `engines/modelink.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（modelink.js —— 模型桥·条目桥引擎（WA.modelink）） |
| `engines/mood-glide.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/mood-glide.js (v2.250.0) — MG-1 情绪惯性、半衰期回落与思念累积） |
| `engines/motif.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/motif.js (v2.129.0) — 文体档案 / 意象登记（缝 A5）） |
| `engines/motive-arbitration.js` | OPV12-1 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/motive-arbitration.js (v2.247.0) — IN-1 动机竞合） |
| `engines/narrative-deduction.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/narrative-deduction.js (v2.247.0) — 双轨因果与线索断裂补偿推演台） |
| `engines/noesis.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/noesis.js (v2.144.0) — 防全知闸门（知情边界统一裁决）） |
| `engines/observation-projection.js` | OPV12-5 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/observation-projection.js (v2.251.0) — 同一事实的多观察者投影） |
| `engines/observe-slice.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/observe-slice.js (v2.230.0) — 观测切片） |
| `engines/offline-return.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/offline-return.js (v2.161.0 → 自 v2.156.0 S1) — 离线恢复编排（S1 + TP3 入口收口）） |
| `engines/offline-tick.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/offline-tick.js (v2.151.0 → v2.156.0) — 跨会话记忆锚（RX2）+ 摘要消费（S1）） |
| `engines/one-shot-mod.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/one-shot-mod.js (v2.250.0) — OSM-1 一次性注入调制（药盒）） |
| `engines/operations.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/operations.js (v2.172.0) — TX9 权限批准、组织项目与运营结算） |
| `engines/opinion.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（舆情引擎：canon新闻 / forum论坛传闻 / sandbox闲逛(NON-CANON) 三层） |
| `engines/opportunity.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/opportunity.js (v2.117.0) — 机会形成（计划二 B6 前半）） |
| `engines/org.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（资源与组织：势力资源库存、人物持有、条件式转移。） |
| `engines/outline-inject.js` | OPV12-5 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/outline-inject.js (v2.231.0) — 大纲注入） |
| `engines/output-guard.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/output-guard.js (v2.250.0) — OG-1 伪造玩家发言拦截） |
| `engines/parallel-events.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（场外事件：主线之外同时发生的短事件，三要素 + 主时钟同步 + 容量 3。） |
| `engines/parallel-world.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（平行世界：主线之外的独立世界推演 —— NPC 档案 + 关系网 + 事件模块（影响分级）） |
| `engines/path-echo.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/path-echo.js (v2.231.0) — IN-2 未走之路的回声（有限预期与经验修正）） |
| `engines/pending-center.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/pending-center.js (v2.206.0) — E1 统一待处理事项中心） |
| `engines/perf-baseline.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/perf-baseline.js (v2.182.0) — O3 手机端与长局性能基线（可无头部分）） |
| `engines/perf-ledger.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/perf-ledger.js (v2.148.0) — 性能历史台账（RP1）） |
| `engines/perf-trace.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/perf-trace.js (v2.102.0) — 性能基线与分层增量（**纯内存观测**）） |
| `engines/periodicals.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（periodicals） |
| `engines/persona-anchor.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/persona-anchor.js (v2.249.0) — PA-1 人物性格锚定与防漂移引擎） |
| `engines/perspective-lock.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/perspective-lock.js (v2.142.0) — 视角锁（叙事视角闸门）） |
| `engines/phase-transition.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/phase-transition.js (v2.231.0) — IN-9 历史相变） |
| `engines/phone-bridge.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/phone-bridge.js (v2.97.0) — 跨插件因果桥（入站边）） |
| `engines/plan-audit.js` | OPV12-7 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/plan-audit.js (v2.189.0) — 未来安排复验（缝 A2）） |
| `engines/plan.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/plan.js (v2.229.0) — 人物多步计划与受挫重决策（拓展计划 ①）） |
| `engines/playable-blueprint.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/playable-blueprint.js (v2.231.0) — OP-9 可玩的世界蓝图） |
| `engines/playable-seed.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/playable-seed.js（v2.281.0 · V7 OPV7-6）— 开局即喂） |
| `engines/player-archive.js` | OPV12-5 | 已审计处置 | 保留为消费面并复核实际收益（v2.294.0（V8 收口）：裸读点必须投递读侧归因（G16 口径）。） |
| `engines/playtime.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/playtime.js (v2.156.0) — 时间来源与游玩生命周期（SP1）） |
| `engines/plot-gauge.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/plot-gauge.js (v2.153.0) — 剧情深度仪（RX5）） |
| `engines/pmem.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（人物主观记忆：某人物记得/相信/怀疑/误解的内容（认知与客观事实分离）） |
| `engines/polish.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/polish.js (v2.130.0) — 输入润色（缝 D4）） |
| `engines/populate.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/populate.js（v2.293.0 · V7 EXV7-9）— 一键播种：给这个世界种一批人。） |
| `engines/portal.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（portal.js —— 出口屏障引擎（WA.portal）） |
| `engines/power-anchor.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/power-anchor.js (v2.129.0) — 战力锚（缝 A8）） |
| `engines/prefilter-gate.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/prefilter-gate.js (v2.230.0) — 档案预筛 Gate） |
| `engines/preset-world.js` | OPV12-8 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/preset-world.js (v2.129.0) — 静态设定缓存（缝 A7）） |
| `engines/preset.js` | OPV12-8 | 已审计处置 | 保留为消费面并复核实际收益（推演提示词预设系统：4段可编辑·可切换·可导入导出） |
| `engines/proactive.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/proactive.js (v0.1.13) — 语义枯竭检测与主动拉动） |
| `engines/probe.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/probe.js (v2.119.0) — 证据驱动的调查与对质（拓展计划 ⑤）） |
| `engines/production.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/production.js (v2.231.0) — EXP-3：持续生产与经营） |
| `engines/public-agenda.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/public-agenda.js (v2.233.0) — EXV4-4 公共议程设置与代表性缺口） |
| `engines/purify-scope.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/purify-scope.js (v2.130.0) — 净化作用域保护（缝 A2）） |
| `engines/push-api-registry.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（推进类 API 的死面裁决表 —— **单一真源**。） |
| `engines/quota.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（伏笔配给：短/长双池并发上限 × 轮次存龄 × 过期显式失效。） |
| `engines/reasoning-strip.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/reasoning-strip.js (v2.230.0) — 推理块过滤） |
| `engines/reasoning.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/reasoning.js (v2.229.0) — 思考开销与正文保底（缝 A4）） |
| `engines/recipe.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/recipe.js (v2.117.0) — 题材完整配置配方（计划二 B6 后半）） |
| `engines/redact-layer.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/redact-layer.js (v2.230.0) — 脱敏层） |
| `engines/refine.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/refine.js (v2.130.0) — 档案精编（缝 D2）） |
| `engines/region.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/region.js (v2.119.0) — 跨地域持续变化与传播链（拓展计划 ⑥）） |
| `engines/regional.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（nearChance / cooldown —— 远方/近端机制已由 horizon 承担，这是移植期残留；） |
| `engines/rehearsal.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/rehearsal.js (v2.118.0) — 统一试演 / 回滚范围 / 原著分歧（计划二 B7）） |
| `engines/rehearse.js` | OPV12-8 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/rehearse.js (v2.130.0) — 写前预演与检查存档（缝 D1）） |
| `engines/reject-recovery.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/reject-recovery.js (v2.192.0) — 拒收码 → 恢复动作的统一映射（计划 U5）） |
| `engines/relation-graph.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/relation-graph.js (v2.230.0) — 关系图谱 edgeId） |
| `engines/relation-temp.js` | OPV12-1 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/relation-temp.js (v2.267.0) — 关系温度计：这段关系为什么变了） |
| `engines/request-viewer.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/request-viewer.js (v2.129.0) — 请求报文预览器（缝 A9）） |
| `engines/research-closure.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/research-closure.js (v2.231.0) — OP-4 研究成果闭环（从确认字符串走到可验证成果）） |
| `engines/research.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/research.js (v2.231.0) — EXP-8：研究、发明与知识传播） |
| `engines/retrieval.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/retrieval.js (v2.228.0) — 历史留存与检索（第四代拓展 N10）） |
| `engines/rewriter.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/rewriter.js (v2.129.0) — AI 改写命中内容（缝 A2）） |
| `engines/rhythm-loop.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/rhythm-loop.js (v2.129.0) — 呼吸式节奏环（缝 A4）） |
| `engines/risk-pooling.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/risk-pooling.js (v2.233.0) — EXV4-7 地方风险分担与保险式互助） |
| `engines/rivalry.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（竞争焦点：三方注意力与资源竞争矩阵。） |
| `engines/role-conflict.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/role-conflict.js (v2.233.0) — EXV4-8 地方身份与多重归属冲突） |
| `engines/round-cost.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/round-cost.js (v2.269.0) — 单轮成本卡：这一轮我花了多少上下文 (EXV6-5)） |
| `engines/round-drivers.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（轮次驱动器：把「每轮只需推进状态」的悬空引擎挂进真实轮次循环。） |
| `engines/rule-pack.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/rule-pack.js (v2.203.0) — E7 玩家自定义规则包与自动化模板） |
| `engines/rules.js` | OPV12-7 | 已审计处置 | 保留为消费面并复核实际收益（世界推演规则库：12模块铁律（可整段注入backstage，也可经preset分段覆写替换）） |
| `engines/ruling.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/ruling.js (v2.231.0) — EXP-6：案件裁决与处罚执行） |
| `engines/rumor.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（传播与辟谣：一条事实在人际间怎么传、传到最后还是不是原来那条。） |
| `engines/sampler-check.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/sampler-check.js (v0.1.0) — 采样器自检（纯只读）） |
| `engines/save-health.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/save-health.js (v2.270.0) — 存档体检：这局还能跑多久 (EXV6-6)） |
| `engines/scene-budget.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/scene-budget.js (v2.251.0) — 场景频次上限（注意预算）） |
| `engines/scene-narrative.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/scene-narrative.js (v2.231.0) — OP-8 场景与历史按因果讲清楚） |
| `engines/scene-slice.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（情境切片契约：空间属性 × 恶劣天气挂起 × 自然时段七档收敛。） |
| `engines/scope-tag.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/scope-tag.js (v2.230.0) — 范围标签） |
| `engines/sediment.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/sediment.js (v2.290.0) — 世界沉积层（X1；v2.290.0 增跨地点台账 placesView）） |
| `engines/service-network.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/service-network.js (v2.231.0) — IN-6 公共设施与服务网络） |
| `engines/session.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/session.js (v2.119.0) — 多人共享世界的连接层（拓展计划 ⑧）） |
| `engines/shadow.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（社交漩涡：关系经历与承诺的深化——好感只是量值，**经历**才让人回不了头。） |
| `engines/shared-awareness.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/shared-awareness.js (v2.231.0) — IN-3 共同知晓与默契） |
| `engines/social-legacy.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/social-legacy.js (v2.231.0) — IN-8 社会遗产） |
| `engines/solo-voice.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/solo-voice.js (v2.230.0) — 独白推演） |
| `engines/spotlight.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（焦点分配：登场轮次的连续计数与久缺名单（均衡读数，不改剧情）。） |
| `engines/stage.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/stage.js (v2.119.0) — 可组合题材玩法包与长篇阶段变化（拓展计划 ⑦）） |
| `engines/stale-guard.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/stale-guard.js (v2.130.0) — 迟到结果拦截（缝 A1）） |
| `engines/stall.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/stall.js (v2.253.0) — 离线寄售摊（无人看摊时货怎么卖出去）） |
| `engines/storage-forecast.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/storage-forecast.js (v2.152.0) — 存储水位预测（RP7）） |
| `engines/story-choice.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/story-choice.js (v2.168.0) — TX4 可选择、可兑现后果的故事分支） |
| `engines/story-loop.js` | OPV12-2 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/story-loop.js (v2.227.0) — 三项目剧情事件闭环(拓展 N9)） |
| `engines/story-tone.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/story-tone.js (v2.130.0) — 按角色的剧情倾向档（缝 C2）） |
| `engines/storyclock.js` | OPV12-4 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/storyclock.js (v2.129.0) — 正文时间锚点（缝 A3）） |
| `engines/storyline-advance.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（const lines=rows.filter(c=>c.visibility==='known'//c.visibility==='direct'//c.visibility==='public').map(c=>'- '+String(c.title).slice(0,100） |
| `engines/style.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/style.js (v2.51.0) — 叙事工艺设置面（纯只读引擎 + 受控写设置）） |
| `engines/success-grade.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/success-grade.js (v2.251.0) — 成功等级分档（判定结果的粒度）） |
| `engines/summarizer.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（双层叙事摘要管线：小纪要（阶段事件记录）→ 大总述（可独立使用的阶段史）） |
| `engines/supply-chain.js` | OPV12-3 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/supply-chain.js (v2.221.0) — 经营供应链：订单编排与瓶颈图（拓展 N3）） |
| `engines/survey.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/survey.js (v2.231.0) — EXP-4：探索与地理发现） |
| `engines/survival.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（生存三轴：饱食/精力/负重的分段状态与归零惩罚，只报状态不改写别的模块。） |
| `engines/tape-store.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/tape-store.js (v2.148.0) — 磁带卷持久化仓库（RP2）） |
| `engines/tech-lineage.js` | OPV12-3 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/tech-lineage.js (v2.231.0) — IN-5 活的技术谱系） |
| `engines/temperament.js` | OPV12-1 | 已审计处置 | 融合现有链路后升级（双层性格：骨子里的底色 + 后天压出来的习惯；触发点让底色冒头。） |
| `engines/tempo.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（节奏齿轮：推进速率的四挡白名单 × 每轮跨度上限 × 挡位变更留痕。） |
| `engines/temporal-lock.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（时间锁：锁定期间每轮推进上限被显式登记，超限与跳跃整轮拒收。） |
| `engines/theme.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/theme.js (v2.87.0) — 题材规则组合（B7）） |
| `engines/threads.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（悬案：调查与情报的玩法面——线索的汇聚、矛盾与结案依据。） |
| `engines/timeline.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（记忆时间链：来源身份/哈希校验/引用审计） |
| `engines/tolerance.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（手段耐受账：同一手段在近期轮次内的重复触达与钝化降级。） |
| `engines/tool-analyzer.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/tool-analyzer.js (v0.9.1) — 世界态势分析器（纯只读）） |
| `engines/tool-diag.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/tool-diag.js (v0.9.2) — 自检报告与诊断包（纯只读）） |
| `engines/tool-import.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/tool-import.js (v0.9.1) — 外部数据导入（多格式·防污染）） |
| `engines/tool-snapshot.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/tool-snapshot.js (v0.9.1) — 全状态快照导出/恢复） |
| `engines/training.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/training.js (v2.231.0) — EXP-1：学习、训练与能力成长） |
| `engines/travel-desk.js` | OPV12-4 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/travel-desk.js (v2.210.0) — 地图上的行动与行程工作台（拓展 8）） |
| `engines/undercurrent-calendar.js` | OPV12-4 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/undercurrent-calendar.js (v2.268.0) — 暗流日历：未结算的事几时撞上 (EXV6-4)） |
| `engines/userlock.js` | OPV12-6 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/userlock.js (v2.129.0) — 用户锁定记忆（缝 A1）） |
| `engines/vitals.js` | OPV12-7 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/vitals.js (v2.230.0) — 生理线：周期 / 受孕 / 孕期 / 哺乳 + 怀孕知晓） |
| `engines/warrant.js` | OPV12-2 | 已审计处置 | 融合现有链路后升级（通缉：罪度三档 + 通缉不随死亡消除 + 惯犯盘查，只记账不执法。） |
| `engines/wb-inject.js` | OPV12-5 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/wb-inject.js (v0.1.14) — 世界书变量镜像注入通道） |
| `engines/wb-search.js` | OPV12-5 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/wb-search.js (v2.129.0) — 世界书条目实时搜索（缝 A10）） |
| `engines/weather.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（weather） |
| `engines/weighted-draw.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/weighted-draw.js (v2.251.0) — 阶位权重池 + 未得补偿 + 临时幸运封顶） |
| `engines/word-budget.js` | OPV12-6 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/word-budget.js (v2.229.0) — 字数闭环（缝 B2）） |
| `engines/world-autobiography.js` | OPV12-4 | 已审计处置 | 保留为消费面并复核实际收益（世界自传：这一局跑下来，世界变成了什么样。） |
| `engines/world-blueprint.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/world-blueprint.js (v2.164.0) — 版本化完整世界蓝图（TX5）） |
| `engines/world-bridge.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/world-bridge.js (v2.154.0) — 世界联网面（RX4）） |
| `engines/world-briefing.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（今日世界简报：这一轮世界动了哪几根弦。） |
| `engines/world-changes.js` | OPV12-4 | 已审计处置 | 保留为消费面并复核实际收益（world-changes） |
| `engines/world-clock.js` | OPV12-4 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/world-clock.js (v2.230.0) — 世界钟权威） |
| `engines/world-diary.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/world-diary.js (v2.265.0) — 世界日记：你看不见的地方发生了什么） |
| `engines/world-graph.js` | OPV12-4 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis engines/world-graph.js (v2.202.0) — Y7 地图与关系可视化（视图面，不是新真源）） |
| `engines/world-health.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/world-health.js (v2.182.0) — O5 玩家可读的「世界健康中心」） |
| `engines/world-lab.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/world-lab.js (v2.203.0) — E9 隔离世界实验室与反事实对比） |
| `engines/world-seed.js` | OPV12-8 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/world-seed.js (v2.158.0) — 世界生成种子库（RX8）） |
| `engines/world-snapshot.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（WorldAxis engines/world-snapshot.js (v2.200.0) — 世界快照与整包搬运（计划 Y5）） |
| `engines/world.js` | OPV12-4 | 已审计处置 | 融合现有链路后升级（世界织体：社会生活（共同日程 / 聚散）与时空约束（地点、路途、「同一时刻只能在一处」）。） |
| `engines/worldbook.js` | OPV12-5 | 已审计处置 | 融合现有链路后升级（缝合来源：DlSNlGHT World —— world-engine-worldbook.js） |
| `engines/write-contract.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（写口契约自描述：每个可调用写口「要什么形状的入参、会因什么被拒、拒了该怎么办」。） |
| `engines/write-desk.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（写口台：悬空引擎的统一手动写入口 ——「点了有回音」的最后一公里。） |
| `render/inject.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis render/inject.js (v0.2) — 分源可见性注入） |
| `render/map-viewport.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis render/map-viewport.js (v2.246.0) — MAP-2：SVG 画布平滑飞行漫游、动态避让与同地聚类引擎） |
| `render/purifier.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis render/purifier.js (v0.2) — 输出净化（缝合 Veridis规则引擎 + 通用规则集）） |
| `render/theater.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis render/theater.js (v0.2) — 番外小剧场（缝合 st-theater + titania-theater）） |
| `ui/assistant.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis ui/assistant.js (v0.3) — 世界助手对话（缝合 酒馆询问机，就世界状态问答）） |
| `ui/cyberpunk-animations.js` | OPV12-9 | 已审计处置 | 保留并纳入真实入口复核（WorldAxis ui/cyberpunk-animations.js — 赛博朋克动效润色） |
| `ui/cyberpunk-components.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis ui/cyberpunk-components.js — 赛博朋克组件库） |
| `ui/cyberpunk-dashboard.js` | OPV12-9 | 已审计处置 | 保留并纳入真实入口复核（WorldAxis ui/cyberpunk-dashboard.js — 赛博朋克概览页） |
| `ui/cyberpunk-logs.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis ui/cyberpunk-logs.js — 赛博朋克日志页） |
| `ui/cyberpunk-people.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis ui/cyberpunk-people.js — 赛博朋克人物页） |
| `ui/cyberpunk-responsive.js` | OPV12-9 | 已审计处置 | 保留并纳入真实入口复核（WorldAxis ui/cyberpunk-responsive.js — 响应式 + 性能 + 可访问性） |
| `ui/cyberpunk-theme.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis ui/cyberpunk-theme.js — 赛博朋克主题系统） |
| `ui/panel-fold.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis ui/panel-fold.js (v2.225.0) — 面板专家面折叠(计划 Q8 · 面板减负)） |
| `ui/panel-nav.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis ui/panel-nav.js (v2.209.0) — 面板导航协议（计划一 #6 · 面板拆分与精确定位）） |
| `ui/panel.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis ui/panel.js — 主面板 + 悬浮球） |
| `ui/render-perf.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis ui/render-perf.js (v2.152.0) — 面板渲染性能观测（RP6）） |
| `ui/settings.js` | OPV12-9 | 已审计处置 | 融合现有链路后升级（WorldAxis ui/settings.js (v0.2) — 推演设置页（尺度/时间/脉搏/预算/舆情）） |
| `ui/theme-switch.js` | OPV12-9 | 已审计处置 | 保留为消费面并复核实际收益（WorldAxis ui/theme-switch.js — 主题切换（v2.181.0）） |
