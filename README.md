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

## 工具与体检（v0.9.1）
- **快照导出/恢复**：单文件 JSON 归档，导出剔除运行时脏字段，恢复前格式/schema/字段三重校验，校验不过零写入，写入前自动留恢复点
- **世界态势分析器**：本地重算六路压力（事件×等级×阶段进度／风声等级／大势数／势力关系张力／经济气候／区域事件），输出活跃度、上下文负载（各注入块字数+常驻 token 估算）与风险提示（过热／停滞／伏笔堰塞／负载超限／人物膨胀）
- **外部数据导入**：自动判别 6 种格式（全量存档／区域事件单件／势力清单／事件链清单／人物主观记忆／世界书条目组），逐条复用编辑器准入逻辑；世界书条目只诊断不写入

## 编辑器与体检（v0.9.0）
- **势力编辑器**：结构化增删改复制，五要件准入（名称/范围/目标/核心/支柱），重名拒绝（推演按名归并），关系相对位移，声誉总压=Σ(关系值×运势系数) 封顶±35
- **事件链编辑器**：type 一旦确定禁改（阶段序列不同），阶段必须在当前类型合法序列内，跨阶段自动重置阶段轮，正面终局登记 `_terminalSince`（倒计时清退用）
- **状态一致性检查器**：纯只读，9 组 checker 覆盖事件/势力/脉搏/人物认知边界/记忆伏笔/来源引用/注入队列/主观记忆/突发事件，返回 error/warn/info 三级结构化报告，绝不写 store

## 九页面板
概览 / 世界 / 人物 / 事件（势力·声誉·经济·仇敌·大势·风声·远方泳道·推演叙事）/ 导演 / 设置 / 连接 / 助手 / 日志

---
License: 各源项目机制参考已获原作者授权（非商业缝合）。
## 版本历史
- **v0.1.23** — 工作流执行画像：workflow.run 逐节点计时并记录跨运行统计（count/lastMs/avgMs/errors/lastStatus + 链级耗时汇总），workflow.stats()/resetStats() 只读视图；tool-diag runtime.workflow 输出最慢 Top5 与历史报错节点，verdict 对节点报错判 warn。
- **v0.1.22** — 持久化可观测：store.save 失败不再静默（配额耗尽归因 quota + 失败计数，内存态仍推进避免半份状态），新增 store.saveStat() 与 store.sizeProfile() 顶层分区体积画像；tool-diag worldState 节加 storage 子节，verdict 对最近落盘失败判 error、历史失败判 warn。
- **v0.1.21** — wb 通道诊断：tool-diag 新增 wbChannel 节（配置可见 + companionName 解析 + 活跃 waslot order 清单与总字数）；wbInject.activeOrders() 只读列出非空镜像变量。
- **v0.1.20** — 加载诊断入包：tool-diag runtime 节新增 loader 子节（已加载模块数、CDN 容灾命中清单、失败源冷却时间戳）；verdict 在全部 3 个 CDN 源进入冷却时输出 warn。
- **v0.1.19** — 可观测性深化：tool-diag 新增 host 节（接入 compat/host 探测结果，宿主能力缺失按级别分流：无 setExtensionPrompt 判 error、无事件源/变量/世界书 API 判 warn）与 uninjectLedger 节；uninject 支持 trigger 参数标注撤销来源（interceptor/chat-changed/manual）并写入 20 条环形台账，render.injectionLedger() 只读视图供诊断消费。
- **v0.1.18** — P4-P6 一体化迭代：新增宿主能力探测与降级诊断（compat/host），wb 通道支持配置化世界书名、自动 ensureEntry 与运行时配置读写；加载器增加模块去重、CDN 失败源冷却与加载状态诊断。
- **v0.1.17** — 生命周期闭环：拦截器在每轮新生成前自动调用 render.uninject()，清除上一轮主槽位与独立槽位残留；CHAT_CHANGED 前同样撤销，避免切聊天污染；engines/wb-inject.js 注册 wbInject.mirror before 节点，但仅消费显式 delivery='wb' 的持久约束，写入 waslot_NNNN 后从即时注入数组移除，普通注入保持原槽位路由；754 断言全过
- **v0.1.16** — CDN 多源容灾加载桩（缝合小狸 Live 加载器）：index.js 的 loadScript 原本只有一个本地源，加载失败就静默丢失模块；现在主源（本地扩展目录）失败时依次回退 jsDelivr 三域（cdn/fastly/testingcf），每源 12s 超时闸刀（AbortController 式保护，卡住的脚本会被移除并判失败），全源失败才记 error；成功走 CDN 时记 warn 便于排障；746 断言全过
- **v0.1.15** — uninject 真撤销 + store 深合并审计：P3-① render/inject.js 新增 uninject()——旧的「写空串覆盖」只清主槽位，独立槽位路由落地的那部分会残留到下一轮；现在从 store.lastInjection 快照取实际用过的全部 slot key 逐一清空，幂等无副作用；P2-② 审计结论：store.transact 深拷贝 draft + save 整体替换、chatcache.stripHeavy 显式 delete，两侧均无深合并复活风险（附回归断言锁定）；731 断言全过
- **v0.1.14** — wb 变量镜像注入通道（缝合附本生成器）：新增 engines/wb-inject.js——第三条注入通道。setExtensionPrompt 把所有约束类注入挤在同一 position 槽位里互相覆盖，wb 通道改为把约束写进【聊天变量】，由配套世界书条目用 EJS 在精确 order 位置读取：order 支持 1~1000 任意整数（可插进 212/213/214 密集位置），空变量时 @@if 排除 = 0 token；写回一律用 replaceVariables 整表替换（insertOrAssignVariables 深度合并会让已删 key 复活）；ensureEntry 用 TH.getWorldbook/createWorldbookEntries 自动补配套条目并复查防静默失败；与 inject-channel 正交（wb 管「持久约束类」，槽位路由管「即时渲染类」）；719 断言全过
- **v0.1.13** — 外部素材缝合批次（P0+P1）：P0-① inject-inspector 事件订阅改重试等待（宿主启动时序竞态下 eventSource 未就绪时不再一次性放弃，40 次 500ms 重试）+ 事件名大小写多别名兼容；P0-② direct-event.advance 加 busy 锁（GENERATION_ENDED 回调里再触发生成会无限自激）；P1-① 新增 engines/proactive.js（缝合 NPC.json 引擎_主动拉动机制：语义枯竭检测+主动拉动注入+冷却轮数防每轮都拽）；P1-② buildWorldSnapshot 尾部追加呈现铁律（缝合 NPC.json 引擎_活体世界核心法则：状态变化必须经 NPC 视角过滤、禁系统旁白与数值面板）；691 断言全过

- **v0.1.12** — safe 语义全模块统一：contract-audit/memory-sampler/sampler-check 的 safe 原本在 fn 返回 undefined 时直接返回 undefined（与 inspector-state/inject-inspector 不一致）；统一为「undefined 兜底 + 异常兜底 + 无 fallback 时返回 null」，并为 contract-audit/memory-sampler/sampler-check/tool-diag 补导出 safe 供单测；tool-diag 保留异常时返回 {error} 的诊断特例；663 断言全过
- **v0.1.11** — 跨设备同步去脏：chatcache.stripHeavy 原本只剥离 lastInjection，未剥离 v0.1.9 新增的 slotErrors 与 backstage 的 nextTurnInjection——这些注入诊断快照只服务于当前轮排障，跨设备同步既浪费带宽又会在对端复活成脏数据；改为 HEAVY_KEYS 列表统一剥离并导出 stripHeavy 供单测；656 断言全过
- **v0.1.10** — 快照副本隔离：inject-inspector.getLastSnapshot 原本直接返回内部 _last/_lastMemory 引用，调用方（tool-diag）读取后追加字段会污染内部状态；改为返回浅拷贝副本，memory 与 world 两份快照内容一致但引用独立；648 断言全过
- **v0.1.9** — applySlots 逐槽位容错：render/inject.js 的槽位路由原本对 setExtensionPrompt 无错误捕获——单个槽位抛异常会中断其余槽位，且调用方只拿到返回数字无法察觉失败；applySlots 改为逐槽位 try-catch 并返回 {applied,total,errors}，部分失败时错误快照写入 lastInjection.slotErrors，tool-diag 输出并升级为 warn；642 断言全过
- **v0.1.8** — safe 语义统一（inspector-state/inject-inspector）：两份 safe 实现不一致（inject-inspector 在 fn 返回 undefined 且无 fallback 时返回 undefined）；统一为同一实现并互相导出对齐；inspector-state.js:174 的 `!audit || audit.__error` 兼容性确认（null 被 !audit 覆盖，语义成立）；637 断言全过
- **v0.1.7** — inject-inspector 槽位感知：snapEnv/classify 完全不感知槽位路由，主块为空但槽位路由成功时被误判 SKIPPED_OTHER；STATUS_TEXT 补 SUCCESS_SLOTS_ONLY，snapEnv 补 slotLanded/slotCount，classify 在未注册时先判槽位落地，flatten 补 slotsOnly 行（pass 级）；630 断言全过

- **v0.1.6** — 诊断输出槽位落地信息：tool-diag 的 secInject 补 slots/slotConsistent/slotIssues（来自 injectSlotAudit 对账），flatten 的 injectSlots 行在不一致时升级为 warn；620 断言全过
- **v0.1.5** — 检查器对齐归零语义：inspector-state 的 inject.badShape（检查三列是否为数组）改为 inject.emptyShell（检查四字段是否全无内容），因为 v0.1.4 后空壳对象不应再存在——残留即异常；空数组 [] 是合法形态不再误报；608 断言全过
- **v0.1.4** — 近端事件消费归零：修复 nextTurnInjection.nearEvent 消费后只删键不归零、留下空壳对象的缺陷（inspector-state 的 inject.badShape 会误报）；现在删键后检查三列是否全空，空则整体置 null；600 断言全过
- **v0.1.3** — 注入槽位落地审计：新增 engines/inject-slot-audit.js（snapshotSlots 采集槽位计划/落地数/字符数，audit 对账 appliedMismatch 与孤儿槽位）；render/inject.js 的 lastInjection 快照补 slots 字段，排查「约束注入丢了」时可区分「路由失败并入主块」与「路由成功但槽位被宿主覆盖」；591 断言全过
- **v0.1.2** — 预算裁决字段透传：修复 inject-budget.apply 重建对象时剥离 position/depth 的根因缺陷（v0.1.1 被迫用内容指纹绕过）；apply 改为 Object.assign 透传原始项全部字段；render/inject.js 过滤改为 position 优先 + 内容指纹双保险；567 断言全过
- **v0.1.1** — 注入槽位路由：修复 before 链各节点推入 ctx.injections 时携带的 position/depth 被完全忽略的真实缺陷——applyInjections 原本把所有注入无差别合并成一个字符串塞进同一个 setExtensionPrompt。新增 engines/inject-channel.js（position 分桶 + 桶内 depth 升序 + 每槽位独立 setExtensionPrompt）；render/inject.js 接线要点：无 position 的项保持旧行为并入主块，带 position 的项默认并入主块、仅当槽位路由 applySlots 全部成功后才用内容指纹从主块移除（预算裁决会剥离 position，不能用 position 过滤），路由失败时原子回退；mock 改为单例 + __extPromptLog 记录全部 setExtensionPrompt 调用以验证多槽位落地；555 断言全过
- **v0.1.0** — 采样器自检：概率性采样无法靠静态看代码验证，改用统计实验——200 次确定性伪随机（mulberry32）采样后校验引用保持/近期偏置（后半命中率 52.3% vs 前半 14.3%）/相关性过滤/limit 边界/无副作用五项，采样器缺失时报失败不抛异常；507 断言全过
- **v0.9.9** — 采样器可配置化：backstage 设置新增 memSamplerLimit/memSamplerDice/memSamplerRelevance 三项，采样器运行时读取（opts 显式参数仍优先），设置页加采样上限滑条（1–30）、骰子面数滑条（1000–10000）、相关召回开关；486 断言全过
- **v0.9.8** — 注入管线接入采样器：render/inject.js 的主观记忆源切换到 memorySampler.buildBlock（注入时取近期正文做相关性过滤，采样器缺失时平滑回退 pmem.buildBlock）；预算表「主观记忆」rank3 可折叠自动生效；475 断言全过
- **v0.9.7** — 记忆注入采样器：缝合 World memory-engine 的指数衰减采样（weight=e^(-age/scale)+骰子，近期高概率保留、远期按指数概率唤醒、每次轮换）+ 上下文相关召回（只注入持有者出现在正文/世界快照中的记忆，不足时全量回退）；替代 pmem.buildBlock 的 slice(-8) 无差别截取，长局不再「失忆」；469 断言全过
- **v0.9.6** — 推演契约对账器：不靠 grep 靠实测，22 个哨兵探针逐字段喂 applyResult 判定真实消费面（含 horizon 委托字段的 live-store 兜底识别）；12 组枚举对齐 + 6 组跨模块漂移扫描；探针 live store 全量还原零残留。检出并修复真实缺陷：tool-analyzer ECON_SCORE 第三套枚举（萧条/危机）与契约的衰退/动荡漂移，analyzer 查表落空静默回落平稳分；442 断言全过
- **v0.9.5** — 诊断清单全树覆盖：MODULE_EXPORTS 扩至 50 模块（补 actors/direction/compat/ui/purifier），UI 三项归可选项；新增全树盘查断言（磁盘↔清单双向零漏零幽灵）；402 断言全过
- **v0.9.4** — 注入预算自动档：默认自动（宿主上下文窗口 6%，夹在 800–4000t），设置页三档选择（自动/不限/手动）；interceptor 记录真实 contextSize；打点带 budgetSource；397 断言全过
- **v0.9.3** — 注入预算裁判（inject-budget）：pinned 保底/optional 先折叠后丢弃，二分截断严格不超预算；设置页预算滑条（0=不限，默认 2400t）；落地打点记录裁决详情；388 断言全过
- **v0.9.2** — 运行时可观测层：注入自检引擎（订阅 prompt-ready，判定 SUCCESS/MISSING/SKIPPED_*，落地即真相）、自检诊断包（模块装载/宿主能力/视图开关/缓存工作流API通道/UI绑定/能力清单，密钥与正文一律脱敏）、面板「工具」页自检区；357+ 断言全过
- **v0.9.1** (2025-01) — 三大工具引擎：快照导出/恢复(格式校验+脏字段剔除+恢复点)、世界态势分析器(六路压力/活跃度/上下文负载/风险提示，纯只读)、外部数据导入(6类型自动判别)，工具页 UI 集成；302 断言全过
- **v0.9.0** (2025-01) — 三大编辑器/检查器：势力编辑器(五要件准入/重名拒绝/关系位移/声誉总压)、事件链编辑器(type禁改/阶段序列校验/终局倒计时登记)、状态一致性检查器(9组只读 checker：事件/势力/脉搏/认知边界/记忆伏笔/来源引用/注入队列/主观记忆/突发事件)，事件页 UI 集成；259 断言全过
- **v0.8.3** (2025-01) — 人物主观记忆引擎(pmem)：别名感知召回、信息不对称、去重入账
- **v0.8.2** (2025-01) — chatcache存档系统：跨设备同步、快照滚动窗口、命名空间隔离
- **v0.8.1** (2025-01) — 完整测试覆盖218断言全过、世界快照构建含时钟
- **v0.8.0** (2025-01) — 七大核心引擎(horizon/digest/limits/worldbook/ledger/preset/chatcache)、四大记忆引擎(inspector/timeline/entities/pmem)、九页面板UI