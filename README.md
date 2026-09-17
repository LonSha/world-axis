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
- **v1.6.0** — 登记表↔schema 物化一致性：把「登记表声明但状态骨架中不存在」的容量容器收口，并新增一致性自检机制。探针实证（probe1600a 15/15）：① **物化缺口**——evolution.entityMemory 四数组（登记 cap 30）未在 defaultWorldState 物化，登记表却已声明 cap（v1.4.0 补登时只登记未补骨架，登记与 schema 单边脱节）；② **审计视野断裂**——冷启动 sizeAudit 无任何 entityMemory 行（容器在内存中不存在），maintain 对未物化登记键零感知（drift/unregistered 双静默）——v1.4.0 建立的登记与盘点能力对该容器**空转**，直到 entities.js 首次写入自愈才生效；③ **直写即炸**——绕过 entities.js ensureState 的直接 push 即 TypeError 回滚**整事务**，同批无关写入（如 chronicle 入账）一并丢失，与 v1.5.0 的 memory.pmem 缺陷同构且波及面更大；④ **无自检机制**——同类脱节静默不可观测（v1.5.0 的 pmem 即靠探针偶然发现）。修复：**A 物化**——defaultWorldState 补 entityMemory 四数组骨架（登记容器与内存骨架对齐，冷启动即入审计视野、直写不再炸事务）；**B 单一自检**——新增 WA.store.registryParity()（遍历非通配非 object 登记键，解析路径判定「声明为数组但状态中不存在」，返回 {checked, missing:[{path,cap,site}], ok}）；**C 巡视接入**——maintain 调用 registryParity，缺失时出 capacity.unmaterialized（warn + 扣分 + 路径明示 + 修复指引）。效果：登记表与 schema 的一致性从「人工筛查」升级为「机制自检」，同类脱节一旦引入即被巡视检出。测试 +21 断言（1818 → 1839），8 项负向验证全部精准爆红。
- **v1.5.0** — 人物档案纳入治理视野 + schema 物化补缺：v1.4.0 打通通配登记机制后，本轮把「人物档案」这批深层嵌套容器收进容量治理。探针实证（probe1500a 8/8）：① **people 档案五节漏登**——people.<id>.profile.{personality,worldview,family,memory,relationships}（profile.js 切片 15/10/10/25/15）全部未登记，深扫标 unbounded（误报「未登记容量」）、drifted 无从对照（16>15 不报）、maintain 完全不可见（父键遍历只覆盖 memory/opinion/evolution/chapters，people 的三层嵌套不达）；② **people.<id>.knowledge 漏登**——backstage 按 at 排序逐出保留 30 键的对象容器，同样不可见；③ **schema 未物化 memory.pmem**——登记表声明 cap=60 但 defaultWorldState 的 memory 无 pmem 字段，任何绕过 pmem.js 写入方自愈前置的直接 push 风格写入即 TypeError 并**回滚整个事务**（探针初版即因此静默丢状态）。修复：**A 通配补登**——profile 五节与 knowledge 六条通配键入表（profile 节 cap 与 profile.js 源码切片同源，knowledge kind=object）；**B maintain 盘点扩展**——新增 people 分支（每人物 profile 五节数组 + knowledge 对象键容器进 rows7，drift/unregistered 判定上线）；**C schema 物化**——memory 增 pmem: []（登记 cap 60 容器与 schema 对齐，直写不再炸事务）；**D 契约同步**——CAP_RULES 补 6 条反查规则（5×profile.js push 切片 + knowledge 逐出）。效果：人物档案超限可观测、误报清零、事务健壮性修复。测试 +24 断言（1794 → 1818），8 项负向验证全部精准爆红。
- **v1.4.0** — 登记完整性收官 + 死存储清理：把「容量登记表（__BOUNDED_CAPS）」的覆盖面收口到全部有界容器，并新增通配登记机制覆盖精确键无法枚举的嵌套动态路径。探针实证（probe1400a 14/14）：① **entityMemory 四数组漏登**——evolution.entityMemory.{organization,object,ability,location} 有界（entities.js CAP_PER_TYPE=30 双处裁剪）但未登记，sizeAudit 把 31 项容器误标 unbounded（误报「未登记容量」）、maintain 完全不可见（父键只扫一层，entityMemory 对象之下的数组不进盘点）；② **嵌套动态路径无登记机制**——每实体 events 环（cap 8）是 evolution.entityMemory.<type>[i].events 动态路径，精确键机制无法登记，且 sizeAudit 默认 maxDepth=3 触达不了（深度 5），触达后也因精确查找 miss 而标 unbounded；③ **死存储**——opinion.signature 写而不读、chapters.storylines/relations 零写零读、meta.lastAnchor 零引用。修复：**A 补登**——四数组精确键入表（cap 30，site 含 entities.js 基准名）；**B 通配登记机制**——登记键支持 `*` 段（wildcard:true，吃 1..n 个路径段），新增 capsFor() 单一查找实现（精确键 → 下标归一化 → 通配键 → null），sizeAudit 数组/对象分支与 maintain 未登记判定三处查找全部改走它（删除数组分支 top 拦截与旧精确查找），maintain 盘点二层扩展（父键子对象之下的数组 + 实体型孙节点 events 环纳入），capsFor 挂出 WA.store.capsFor；**C 死存储清理**——删 opinion.js signature 写入行与 schema 三处死字段；**D 契约同步**——CAP_RULES 补 5 条反查规则（4×CAP_PER_TYPE + 实体事件环）。效果：31 项实体库超限时 drifted 可观测（裁剪站点失效预警恢复）、unbounded 误报清零、每实体事件环容量纳入治理视野，登记表/审计/巡视三路查找单一实现防语义漂移。测试 +23 断言（1771 → 1794），8 项负向验证全部精准爆红。
- **v1.3.0** — chronicle 多口径统一：把「纪事（chronicle）」的容量治理从「多路径各自内联、口径漂移」修复为「登记表单源权威」。探针实证（probe1300a 9/9）：backstage 结算段按登记口径 slice(-200) 维护纪事，但 horizon（远端/近端事件入账）存在 3 处内联 if (length > 80) slice(-80)——登记满载 200 条时一次 horizon 近端事件入账把纪事猛砍到 80（**静默丢失 120 条**）；且带 refs 溯源的 kind:event 条目被无差别挤出（190 条带溯源仅残留 69 条），无溯源的 horizon 兜底条目 11 条全保留，**溯源价值高的反被挤掉**。修复：**A 同源化**——horizon.js 顶部新增 CHRONICLE_CAP = 200（与 __BOUNDED_CAPS 登记同源），3 处内联 80（distant-wind 兜底 / distant-event / near-event 路径）统一替换为同源常量；**B 登记补注**——chronicle site 改为 "backstage.js slice(-200) + horizon.js CHRONICLE_CAP 同源（v1.3.0）"（保留 backstage.js 基准名前缀，CAP_RULES 反查不受影响）。效果：满载 200 时 horizon 入账后仍为 200（+1 挤出最旧 1 条，环形语义不变），带溯源条目仅自然挤出 1 条（190 → 189）。测试 +10 断言（1761 → 1771），5 项负向验证全部精准爆红。
- **v1.2.0** — 终态容器回收：把带终态语义的容器（暗流/伏笔）的容量治理从「按数组位置的环形截断」升级为「终态回收先于截断」，解决已终结条目永驻占位、把长期活跃条目挤出容器的治理缺口（与 v0.6.0 events/worldTrends、v1.0.0 enemies 的终态治理补齐同构缺口）。探针实证四缺陷：① **currents**（stage `已结束`/`closed`）只做 `slice(-40)`——40 槽位里 34 条是终态暗流，长期活跃暗流被后续堆入的终态暗流挤出容器（剧情长线证据丢失）；② **foreshadows backstage 写入路径无 cap**——伏笔生命周期段 push 无上限，7 轮 × 5 条即达 35 条 > 登记表声明的 cap 30（**登记表与实现脱节**，site 只标注 memory.js 路径）；③ **memory.js 巩固路径** `slice(-CAP.foreshadows)` 只按位置截断——活跃伏笔（developing）被 29 条终态伏笔（recycled/dropped）挤出；④ **同构不一致**——events（终局回收）/ worldTrends（已结束回收）v0.6.0 已实现终态治理，currents/foreshadows 缺失。修复：**A 暗流终态回收**——backstage 容量控制段对 stage ∈ {已结束, closed} 的暗流倒序回收（回收先于截断；终态暗流正文触面已由 echoes 承载，信息不丢）；**B 伏笔单一实现**——memory.js 新增 `pruneForeshadows()`（终态回收 + cap 30 一步到位）并导出至 `WA.memory`，backstage 容量控制段与 memory.js 巩固路径共用同一实现（防两处口径漂移，memory 模块缺失时降级为本地同口径实现）；**C 同构一致**——events/worldTrends 终态回收保持不变（回归断言防护）。测试 +13 断言（1748 → 1761），8 项负向验证全部精准爆红。
- **v1.1.0** — 人设载体贯通：把「人物」从「只记状态不记人设」的残缺载体修复为「人设—别名—查询」全链贯通。探针实证四缺陷：① `evolution.people` 是**零写入方的死字段**（`pmem.holderSet`/`knownPeopleNames`、`memory-sampler.buildHaystack` 三处消费、全仓无生产）→ 人物主观记忆的持有者归属与采样名单恒空，**人物实质失忆**；② 人物入账只保留 `id/name/knowledge/location/action/intent/body/updatedAt` 八字段，schema 声明的 `avatar/resources/personalityAnchor/speakingStyle/behaviorBoundaries/innerVoice/aliases` **七字段全部丢弃**，人设载体在入账时即断裂；③ `knownPeopleNames` 未从 `WA.pmem` 导出（隐藏缺陷，外部调用即 `TypeError`）；④ `memory-sampler` 的采样名单同样依赖死字段。修复：**A 字段贯通**——`backstage` 人物结算改为 `Object.assign` 补齐六字段（`AI 新值 || 旧值` 语义，AI 未给则保留上轮）+ `unionAliases()` 别名并集去重（Set 去重、trim 过滤空值，多次返回累积不重复）；**B 权威本体**——`pmem` 新增 `peopleList(st)` 统一优先读 `state.people`（v1.0.0 已做容量治理的权威容器），`holderSet`/`knownPeopleNames` 改走它，并保留对旧存档 `evolution.people` 残留的兼容（历史数据不丢别名）；**C 导出补全**——`knownPeopleNames`/`peopleList` 挂到 `WA.pmem`；**D 名单统一**——`memory-sampler.buildHaystack` 同步改读 `state.people`。效果：别名「沈捕快」可召回本体「沈炼」持有的记忆（`recall` 命中），且 `knows` 语义不变（别名不等于认知知情，信息不对称边界不受影响）。测试 +12 断言（1736 → 1748），9 项负向验证全部精准爆红。
- **v1.0.0** — 治理覆盖收口：把容量治理基建从「数组专用」升级为「容器通用」，解决对象型容器（人物表）在审计链路上完全隐形、有界容器漏登被误报无界、注入侧无界展开三类治理缺口。探针实证五缺陷：① `people` 对象容器无人数上限——入账 60 个 NPC 全数保留，长局无限膨胀；② `sizeAudit` 的 `schedule()` 只收集 `Array.isArray` 节点，`people` 等对象型容器**完全不可见**（连无界都报不出），`maintain` 第 7 段同样只枚举数组——这是比「无上限」更深的审计盲区；③ `evolution.enemies` 活跃态（追踪中/策划中/执行中）无回收上限，仅有「终结 20 轮后清除」的生命周期；④ `evolution.trends`（slice(-20)）/`evolution.blackbox`（slice(-15)）有界却漏登 → `sizeAudit` 误报 unbounded；⑤ `buildEnemiesBlock` 全量展开活跃仇敌（25 个仇敌 → 25 条注入），长局注入膨胀。① **登记表通用化**：`__BOUNDED_CAPS` 新增 `kind: 'array'|'object'`（缺省 array，向后兼容），`sizeCaps()` 透传 kind；② **对象容器审计可见性**：`sizeAudit.schedule()` 对登记为 `kind:'object'` 的对象节点收集 `{len: Object.keys().length}` 明细，`maintain` 第 7 段轻量盘点同步支持对象型——`people` 现参与 drifted/unbounded 判定；③ **people 有界剪枝**：结算尾部容量治理新增人物表治理（cap 48，按 `updatedAt` 最旧优先挤出，日志留痕，保留近期活跃 NPC）；④ **enemies 双口径剪枝**：活跃态环形 cap（MAX_ACTIVE=24，挤出最早创建的）+ 终结态数量兜底（TERMINATED_MAX=20，挤出终结最早的）→ 总量硬上限 44；⑤ **登记补全**：`evolution.trends`(20)/`blackbox.secretActions`(15)/`blackbox.secretAssets`(15)/`opinion.sandbox`(4) 四项有界漏登补齐，登记表 21 → 27 容器；⑥ **注入侧有界展开**：`buildEnemiesBlock` 活跃仇敌只展开前 12 个，超出以「…等 N 个」标注（不静默截断）。测试反查规则（CAP_RULES）同步扩展并支持双捕获组求和（enemies 总量=活跃+终结），登记表 ↔ 源码常量三向一致。1736 断言全过（3 轮稳定），9 项负向验证精准爆红。
- **v0.9.0** — 软引用完整性：把「标题软链接」（回声指向暗流标题、纪事来源引用、分支标识）从「写入即失联」修复为「生产标识—悬空检出—审计覆盖」闭环，解决软引用无校验、无检出、无溯源的完整性盲区。探针实证四缺陷：① echoes.refCurrent 是裸标题软引用——AI 幻觉标题（不存在的暗流名）原样入账且无任何校验，checkRefs 只审 refs 字段、inspector 完全不含 echoes，悬空永不可见；② currents 尾部裁剪（cap 40）后早期回声成孤儿引用无标记——但「暗流正常生命周期消失」是设计行为，不可一律告警；③ chronicle.refs AI schema 无此字段（kind/title/summary）→ 恒为空数组，且 inspector 扫描面不含 chronicle——纪事来源引用整体盲区；④ worldFacts/currents 的 branchId 字段存的是裸楼层号（anchor.idx），与 store.currentBranchId() 的 m{idx}_s{swipe} 分支标识命名-语义错位。① **软引用生产方**：backstage 回声入账新增 danglingAtWrite 字段（入账时目标暗流是否在场，含 Array.isArray 防御）——区分「入账即悬空（AI 幻觉/数据损坏，可检出）」与「入账后生命周期消失（裁剪/终局，设计行为）」；② **checkSoftRefs 新检查器**（注册进 CHECKERS 与导出段）：只报 danglingAtWrite===true 且目标既不在 currents 标题也不在 evolution.events 名中（跨容器在场判定）的悬空回声（warn softref.dangling）；空 refCurrent 报 info softref.empty；语义边界——只报入账即悬空，不报生命周期消失，防告警疲劳；③ **chronicle.refs 生产方 + 审计覆盖**：backstage 纪事入账在 AI 无 refs 时锚定结算楼层溯源（captureRange），checkRefs 扫描面新增 chronicle 条目（可审计楼层删除/改动）；④ **branchId 语义修正**：新增 anchorBranchId(anchor) 统一构造分支标识（m{idx}_s{swipe}，与 store.currentBranchId() 同构；无锚点返回空串），worldFacts/currents 两个写入点从裸楼层号改用它。1718 断言全过（3 轮稳定），8 项负向验证精准爆红。
- **v0.8.0** — 跨容器引用完整性：把记忆/实体层的「来源引用」从「消费方在位、生产方缺失」修复为「生产—审计—检出」全链贯通，解决引用审计长期空转的完整性缺口。探针实证四缺陷：① checkRefs 扫描 l0-l3/smallSummaries 的 refs 字段，但记忆层入账结构 {t,s} 从不写 refs——审计对记忆层完全空转；② foreshadows.links 两个写入点（consolidateL1 产出 links:[]、backstage 结算 links: f.links||[]）始终为空数组且无 timeline 审计；③ entities.refs 文档声明支持但 upsert 新建/更新分支均未写入；④ 更根本——timeline.chatId() 误用楼层级 currentBranchId（m{idx}_s{swipe}），旧 refs 的 chatId 随末楼 index/swipe 漂移 → auditRefs 全判 inherited 跳过，refs.missing 检测实际不可达。① **chatId 归属修正**：timeline.chatId() 改用稳定聊天 id（store.chatId），新增楼层/末楼 swipe 切换/重掷均不漂移，删楼后 missing 检测恢复可达；② **记忆层 refs 生产方接入**：recentRefs(n)（L0 入账捕获最近 n 层溯源）+ inheritRefs(entries)（L1/L2/L3 合并时并集继承批次来源）；L0-L3 全部入账点写 refs，伏笔候选同步带 links；③ **entities.refs 生产方补齐**：upsert 新建写 refs、更新按 unionRefs 合并（去重不丢新来源）；④ **审计覆盖面扩大**：checkRefs 扫描范围新增 foreshadows.links 与 evolution.entityMemory 全类型 refs（统一并入 scan 循环复用既有 missing/changed 判定）；⑤ **backstage 伏笔 links 生产方**：推演结算伏笔未给 links 时捕获锚点楼层溯源，更新时并入既有 links。1700 断言全过（3 轮稳定），10 项负向验证精准爆红。
- **v0.7.0** — 楼层结算守卫：世界推进从「事件即结算」升级为「每楼层至多结算一次」，解决重掷（swipe）/重复通知使世界时间虚增的时序一致性缺陷。探针实证：after 链（evolution.tick 的 round++/骰子推进/风声衰减、backstage 推演、directEvent 推进）对每次 gen_ended 全量执行且无任何守卫——swipe 重掷使 evolution.round 1→2→3 虚增、骰子多掷、风声多衰减、推演重复；且与 before 链既有口径（重掷沿用本轮注入 SKIPPED_REROLL）自相矛盾：注入层按「同轮」处理，结算层却重复推进。① **核心模块 core/settle-guard.js**：楼层签名 sig=floor+swipe+内容长度+FNV-1a 指纹；meta.lastSettle 记录最后已结算楼层（含 chatId/round/时间戳）；判定语义——无记录/跨聊天 → fresh 结算；楼层增长 → new-floor 结算；同楼层 → dup（同内容）/reroll（重掷）跳过防双计；回退删楼 → rewind 跳过（新路径内容由下次结算读取近期正文时自然吸收）；② **闸门接线**：interceptor 的 gen_ended 处理器在构建 actx 前过闸——跳过时只留日志不阻断消息生成；结算完成在批内 commit（随批落盘，失败下轮重试不吞错）；③ **逃生门**：forceNext() 手动旁路一次（删改消息后重对齐），面板「结算守卫」入口可查看归因计数与最后结算楼层并一键强制；④ **可观测**：stat() 透出 settles/skips 四归因（dup/reroll/rewind/nochat）；tool-diag storage 节新增 settleGuard 计量；⑤ **优雅降级**：守卫模块缺失时 after 链保持旧行为不阻断（防御式接线）。1672 断言全过（3 轮稳定），9 项负向验证精准爆红。
- **v0.6.0** — 长局容量治理：把「世界状态自身」的容量从「编辑器准入约束」升级为「全路径强制 + 结算自动回收 + 治理闭环感知」三层防线，解决长局（数百轮）下四类容器静默膨胀拖垮存档的容量债。探针实证六缺陷：编辑器路径有 MAX_EVENTS=16 拒绝制但有机路径（addEvent/applyFactions 直推）零上限（实测 20>16 绕过）；终局事件永驻 state（快照只做呈现过滤，本体永不回收）；evolution.winds/worldTrends/opinion.forum/economy.signals 非空且未登记（sizeAudit 报 unbounded 但无人处置）；sizeAudit 自 v0.1.44 可报容量异常但从未接入 maintain（治理闭环零感知）。① **有机路径强制约束**：evolution.addEvent 环形 cap（与编辑器同容量，挤出优先级=终局事件>最早创建）、applyFactions 环形 cap、addWind 环形 cap（模块级 MAX_WINDS=12 单源常量，同主题归并不触发新增）；② **结算尾部容量控制**：backstage.applyResult 尾部统一治理——终局事件回收（TERMINAL 语义判定，信息已入 chronicle/echoes 承载）、events≤16 / factions≤16 / winds≤12 / worldTrends「已结束」回收+≤12 环形；③ **登记表补全**：__BOUNDED_CAPS 新增 opinion.forum(20)/evolution.winds(12)/evolution.worldTrends(12)/evolution.economy.signals(3) 四容器 + tests 反查规则同步扩展（登记表 ↔ 源码常量 ↔ 反查规则三向一致）；④ **治理闭环感知**：maintain 第 7 段状态容量治理——轻量盘点顶层+4 父对象子键（不做全量序列化，init 高频路径零负担），已登记超 cap → capacity.drift error（−min(15,n×5)）+ trim-containers 动作，未登记非空 → capacity.unregistered warn（−min(10,n×2)），signals 扩 capacityDrifted/capacityUnregistered 计量；⑤ 面板「健康巡视」透出容量行。1648 断言全过（3 轮稳定），9 项负向验证精准爆红。
- **v0.5.0** — 多实例一致性：解决多标签页（共享 localStorage）并发写入**静默覆盖**他实例进度的数据安全缺口。① **写入者标识**：每次落盘打 meta.writer（实例 id）/meta.writeSeq（实例序号）/meta.stateRev（全局单调序号），writer_id 键存储侧可追溯（被外部删除后自动重建）；② **冲突检出与保全**：save 前读回磁盘序号，发现他实例写入 → 先把对方 payload 保全为冲突现场（worldaxis_conflict_<chat>_<ts>_<seq>，键名含单调序号防同毫秒碰撞，环形保留 3 份）再写入自己版本，不阻塞不丢数据，保全失败只留痕；③ **处置出口**：conflictStat/lastConflict/listConflicts/dropConflict/exportConflict 五 API + 面板「冲突现场」入口（列出/提取/丢弃）；④ **跨实例实时感知**：storage 事件监听（幂等安装），他实例写入本聊天立即计数 + warn 提示刷新，5 类误报场景零触发（其他聊天/非 state 键/自己写入/clear/损坏 payload 单列），init（以磁盘重新同步）时清零标记防顽固误报；⑤ **治理接入**：maintain 第 6 段并发一致性（未处置现场 −min(12,sites×4) + review-conflict 动作；内存落后 −8 + reload-page；历史冲突 info 不扣分）+ signals 四计量；⑥ **新键家族归位**：conflict/writerId 家族识别 + 计量 + sweep 显式 keep（不依赖「误归 settings 恰好永不清理」的偶然正确）；活跃体积语义修正（冲突现场副本不计入 currentChatBytes）；⑦ **卫生巡检指纹收敛**：修复告警疲劳缺陷（无关议题等级抖动重复触发卫生告警），签名只含卫生范畴议题（键+等级）；⑧ **恢复点来源标识**：恢复点记录 by/rev，recoveryStat 透出 multiInstance（跨窗口留点可感知）。1620 断言全过（3 轮稳定），8 项负向验证精准爆红。
- **v0.4.0** — 自动治理闭环 + 写入完整性：治理层从「各自出数」走向「统一裁决 + 自动响应 + 写后自证」。① **写入完整性**：store 全部落盘改走 writeVerified（写后立刻读回逐字符比对，不一致重试一次；失败分类 missing-after-write / length-mismatch / content-mismatch，两次不一致如实返回 false 并不再假装成功）+ verifyState（单聊天解析/体积/结构体检，deep 模式只读比对缺失字段）+ verifyAll（全库 state 键巡检——单聊天载入成功 ≠ 键空间健康）+ integrityStat 计量。② **诊断环自适应**：事件/错误环上限按存储水位动态收紧（常规 300/50、紧张 120/30、危急 60/20，软水位 4MB / 硬水位 8MB），裁剪量进 logTrimStat 可观测，不再硬编码。③ **统一健康巡视**：maintain() 把存储计量/键卫生/诊断预算/隔离现场/全库状态/救援/完整性收敛为一个健康分 + 分级议题 + 建议动作（ok/warn/degraded）；apply:true 时仅自动回收「聊天已彻底消失」的残留键（既无 state 本体也无隔离副本），当前聊天/settings/wb/state 本体/隔离现场永不自动动，minFreedBytes 门槛保守优先。④ **健康分语义裁决**：健康分只反映「当前状态」，历史写入失败/历史配额救援失败降为 info 议题（不扣分、不污染告警分级）——修复一次瞬时毒化把健康分永久压低、制造无谓告警的缺陷。⑤ **闭环接线**：面板「健康巡视」入口（分级议题 + 建议动作 + 写入完整性），错误报告新增「健康巡视」段。1528 断言全过（3 轮稳定），10 项负向验证精准爆红。
- **v0.1.41** — 撤销-槽位关联审计 + 通道配置可观测：render.uninjectAudit()（快照在场声明 × 撤销台账 × keys 交叉核对，检出 stale-snapshot/cleared-by-mismatch/writeback-before-land），tool-diag inject 节透出 uninjectIssues；apiRouter.setChannel 变更计量 cfgStat()（changes/baseUrlChanges/lastChannel）+ 总线广播 api:channel-changed（payload 不含明文 apiKey），诊断 apiRouter.cfg 子节透出。

- **v0.1.39** — contract-audit 探针还原路径事务化：原位还原改走 transact（深改写在 draft 上进行），全库裸 save 清零，还原动作纳入 txStat 计量与统一落盘路径。
- **v0.1.40** — 记忆巩固链路计时：memory.digest 节点逐层计时（L1/L2/L3 各自 ms 与 ran 标记），memory.stats()（rounds/lastMs/avgMs/layers）；tool-diag runtime.memory 子节透出；巩固链各层异常不中断后续层。

- **v0.1.38** — 状态键损坏隔离：load() 解析失败不再静默——原始 payload 逐字节存入 *_corrupt_<ts> 隔离键，默认状态接管前先保护可恢复现场（防下次 save 覆盖）；loadStat()（loads/hits/misses/errors/lastError）计量；tool-diag storage.load 子节 + 独立 load 键 warn 议题。

- **v0.1.37** — 恢复点计量：store.recoveryStat()（count/max/full/bytes/lastAt，环形覆盖可视）；tool-diag storage.recovery 子节透出，满额时 verdict 出独立 recovery 键 info 议题（与 storage 键解耦，不干扰既有精确计数断言）。

- **v0.1.36** — draft 克隆升级：transact 深拷贝 feature-detect structuredClone 优先（原生实现快 1.5-2x），JSON 往返降级保持兼容；深隔离契约断言锁定（提交前 draft 与 live store 完全隔离、get() live 引用契约、顺序事务独立 draft）；修复 v0.1.23 链级耗时断言的 flaky 阈值（40ms→25ms，睡眠节点实际下限）。

- **v0.1.35** — 聊天纪元守卫：init()（含切聊天）自增纪元并作废在飞写合并批——僵尸批内 transact 被拒绝（stale=true，不执行 mutator），批退出丢弃 flush，旧轮未落盘改动不再写向新聊天键（修复跨聊天污染竞态：after 链在飞批 + CHAT_CHANGED 重载）；batchStat 透出 orphaned。

- **v0.1.34** — 嵌套事务计量：txStat 新增 deferred 计数（随外层提交的内层事务数，此前嵌套路径完全绕过 recTx）；真实结算链路端到端回归——applyResult 全字段（distantEvent 风声 + nearEvent + digest + chronicle）在单层外层事务内完成，全部嵌套产物经最外层提交后存活并落盘。

- **v0.1.33** — 嵌套事务语义：内层 transact 直接在最外层 draft 上修改，提交延迟到最外层统一 save（修复外层 save 用旧快照覆盖内层已提交改动的静默丢失，backstage.applyResult→horizon/digest 链路）；horizon 写路径事务化（ensureState/rollLane/pending 清除，清除 evolution 缺失分支的零写路径死角）；digest 裸 save 移除。嵌套返回 deferred 标记，内层中止/异常不波及外层提交。

- **v0.1.32** — 批健康计量：store.batchStat()（depth/dirty/flushes/lastFlushAt），flushes 即写合并后的实际落盘次数（对照 txStat.batched 观察合并率）；tool-diag storage.batch 子节透出；测试实测 install + gen_ended 触发真实 after 链在批作用域内运行并一次 flush。

- **v0.1.31** — store.batch 写合并：批作用域内 transact 只推进内存（保留每事务深拷贝隔离），批退出统一落盘一次；拦截器整轮单批（撤销回写+contextSize+before链+注入落地合并，每轮生成从 ~15 次全量落盘降至 1 次）；txStat 新增 batched 计数，transact 批内返回 batched=true/persisted=null。

- **v0.1.30** — store.transact 事务计量：按 ok/save-failed/error/aborted 四态计数与耗时（txStat/resetTxStat），tool-diag storage 节新增 transactions 子块；verdict 独立 transactions 键分级（最近一次落盘失败 error、历史失败/修改器异常 warn，key 与既有 storage 议题解耦）；transact 返回值新增 persisted 字段（ok 保持 v0.1.22 内存事务语义不变）。

- **v0.1.29** — 撤销语义诚实化 + 可见性开关真实生效（两处真 bug）：① 呈现铁律此前无条件 push，导致 parts.length 恒真、关光所有源仍注入 221 字空壳；② 账本/世界推演不在 SOURCES 内，完全不受开关控制。现在铁律随状态内容有条件追加、ledger/digest 纳入 SOURCES（默认开保持旧行为）；另 uninject 成功后回写 injected:false + clearedAt + clearedBy(trigger)，槽位证据保留维持幂等重放，tool-diag 透出撤销态。注入落地时 lastInjection 记录 injected（主块非空或有槽位落地才算生效）；uninject 成功后回写 injected:false + clearedAt + clearedBy(trigger)，槽位证据保留以维持幂等重放；tool-diag inject 节透出撤销态，诊断不再把已撤销的上一轮注入当作在场证据。
- **v0.1.28** — 事件总线健康层：WA.on 去重（重复订阅忽略并告警）+ 返回解绑句柄、新增 WA.off、监听器数超阈值(24)一次性泄漏告警；WA.emit 派发用快照（监听器内部增删不影响本轮）并返回实际调用数，异常按事件聚合计数与末错留存；发出但无人监听计入 deadSignals；WA.busStats() 只读视图接入 tool-diag bus 节，三类问题（监听抛错 / 接线断裂 / 泄漏嫌疑）均进 verdict warn。
- **v0.1.27** — API 通道调用台账：apiRouter 每次 call 按通道记录成功/失败计数、错误归因（http/rate-limit/auth/invalid-json/output-limit/not-configured/timeout）、平均与最近耗时、末错摘要；配置类失败也入账；apiRouter.callStats()/resetCallStats() 只读视图；tool-diag runtime.apiRouter.calls 输出，verdict 分级：全失败 error、有失败率 warn。
- **v0.1.26** — 取消语义闭环：before 链节点可置 ctx.canceled + ctx.cancelReason 短路本轮注入（一致性屏障有了真正的否决权）——拦截器丢弃全部注入项、markRegistered(0) 并保持上一份已确认状态，warn 日志记录原因与丢弃数，生成不被中止；台账可见 cancelled 轮次。
- **v0.1.25** — 启动完整性审计：loadScript 全源失败不再静默（state.failed 记录 rel/尝试源数/时间戳，模块级重试成功后自动清除），loaderStatus 暴露 failedModules；init 末尾点名加载失败模块并写入 WA.loadFailures；tool-diag 输出 failedCount/failedModules，verdict 对照导出缺失清单分级（导出也缺 = error，仅历史失败 = warn）。
- **v0.1.24** — 注入预算账单入诊断：lastInjection.budget 快照补全（contextSize/remain/inputTokens/saved/overBudget/keptCount + folded/dropped 带 reason 明细）；tool-diag inject 节输出 budget 子块与 summary，verdict 分级：超预算 error、有丢弃 warn（点名源）、仅折叠 info。
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