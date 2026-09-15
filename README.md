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

## 九页面板
概览 / 世界 / 人物 / 事件（势力·声誉·经济·仇敌·大势·风声·远方泳道·推演叙事）/ 导演 / 设置 / 连接 / 助手 / 日志

---
License: 各源项目机制参考已获原作者授权（非商业缝合）。