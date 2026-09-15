# 世界枢轴 WorldAxis

> 缝合13个SillyTavern开源世界引擎的**独立扩展**——让镜头之外的世界自行运转并推动剧情。

**纯框架**：不预设任何世界观内容，世界背景由你的角色卡/世界书/用户设定注入。

## 缝合来源（机制蓝本）
| 源 | 贡献机制 |
|---|---|
| world-backstage | 后台世界推演·七步判断协议·双轴可见性·世界脉搏·三列注入·舆情观察 |
| DlSNlGHT/World | 冲突/进度阶段机·势力·声誉·经济 |
| ST-SevenDaysCal | 世界钟/日历推进 |
| SoulLink | NPC档案契约·预筛Gate·独白推演·观测切片 |
| choice | 行动选项生成 |
| st-direct-event | 突发事件暗箱（一轮生成·多轮解封） |
| story-oracle(+outline) | 剧情参谋·弧线/序列节拍 |
| st-beat-tracker | 章节叙事 |
| ST-Evolution-World-Assistant | 工作流拦截器·before/after双链 |
| st-theater / titania-theater | 番外小剧场 |
| The-Veridis-Lion/Veridis-Rewrite | 输出净化规则引擎 |
| WNE引擎 / TH-剧情推进 / 创世工坊 | 多API分流·事实版本管理 |
| DlSNlGHT/World (worldbook) | 世界书蓝绿灯触发引擎·按聊天隔离条目选择·覆写 |
| DlSNlGHT/World (ledger) | 重大事件账本·推演前后差分记录 |
| DlSNlGHT/World (inject-inspector) | 注入自检查看器·哨兵着陆检测·纯只读 |
| DlSNlGHT/World (memory-timeline) | 来源身份·FNV双哈希·引用审计 |
| DlSNlGHT/World (entity memory) | 四类实体记忆库·别名索引·防重复创建 |

## 安装
1. 下载 Release 的 `WorldAxis.zip` 解压到 `SillyTavern/public/scripts/extensions/third-party/WorldAxis/`
2. 重启酒馆 → 扩展管理启用「世界枢轴 WorldAxis」
3. 右下角悬浮球 ◈ 打开面板 → 「连接」页配置API通道（至少配 default 或 inference）

## 架构
```
before_reply 链:  导演标签扫描 → 连续性约束注入 → 章节上下文 → 突发事件小纸条
                  → NPC独白推演 → 剧情引导拍 → 世界状态快照落地
after_reply 链:   突发事件推进 → 世界推演(backstage) → 事件演化回合
                  → 记忆L0/L1 → 舆情观察 → NPC档案维护
```

## 核心概念
- **世界推演 backstage**：每轮AI回复后，在后台结算镜头外的世界变化（人物位置/暗流/事实/认知边界/世界脉搏），结果写入聊天隔离的store，下一轮以「连续性约束」注入正文。
- **双轴可见性**：事件 visibility(角色能否感知)×publicity(公众传播度)，hidden级暗流绝不剧透给正文。
- **认知边界**：每个NPC独立知识账本，route=inferred 只能标 suspected。
- **世界脉搏**：pressure 0-3 压力账本，驱动世界自发活跃度。
- **记忆分层**：L0单轮摘要→L1阶段巩固→L2章节回顾→L3长线沉淀→facts版本化→伏笔生命周期。
- **事件演化**：冲突/进度双类型四阶段骰子推进（保底机制防卡死）、势力六态七级、声誉四维五级、经济四气候、风声消散、仇敌录、黑盒秘密、天下大势、影响链。
- **远方/近端事件**：Ledger计数阈值强制触发、cooldown冷却、pending重试、临时标记剥离。
- **world_digest**：每轮结算后生成150-200字世界推演叙事，绝对禁止提及玩家。
- **字数限制体系**：events.desc≤50字、factions.currentGoal≤50字、winds.topic≤10字等全字段截断。
- **事件链ID稳定**：API返回id原样使用、改名不换链、type一旦确定禁改、stall停滞标记。

## 编辑器与体检（v0.9.0）
- **势力编辑器**：结构化增删改复制，五要件准入（名称/范围/目标/核心/支柱），重名拒绝（推演按名归并），关系相对位移，声誉总压=Σ(关系值×运势系数) 封顶±35
- **事件链编辑器**：type 一旦确定禁改（阶段序列不同），阶段必须在当前类型合法序列内，跨阶段自动重置阶段轮，正面终局登记 `_terminalSince`（倒计时清退用）
- **状态一致性检查器**：纯只读，9 组 checker 覆盖事件/势力/脉搏/人物认知边界/记忆伏笔/来源引用/注入队列/主观记忆/突发事件，返回 error/warn/info 三级结构化报告，绝不写 store

## 九页面板
概览 / 世界 / 人物 / 事件（势力·声誉·经济·仇敌·大势·风声·远方泳道·推演叙事）/ 导演 / 设置 / 连接 / 助手 / 日志

---
License: 各源项目机制参考已获原作者授权（非商业缝合）。

## 版本历史
- **v0.9.0** (2025-01) — 三大编辑器/检查器：势力编辑器(五要件准入/重名拒绝/关系位移/声誉总压)、事件链编辑器(type禁改/阶段序列校验/终局倒计时登记)、状态一致性检查器(9组只读 checker：事件/势力/脉搏/认知边界/记忆伏笔/来源引用/注入队列/主观记忆/突发事件)，事件页 UI 集成；259 断言全过
- **v0.8.3** (2025-01) — 人物主观记忆引擎(pmem)：别名感知召回、信息不对称、去重入账
- **v0.8.2** (2025-01) — chatcache存档系统：跨设备同步、快照滚动窗口、命名空间隔离
- **v0.8.1** (2025-01) — 完整测试覆盖218断言全过、世界快照构建含时钟
- **v0.8.0** (2025-01) — 七大核心引擎(horizon/digest/limits/worldbook/ledger/preset/chatcache)、四大记忆引擎(inspector/timeline/entities/pmem)、九页面板UI