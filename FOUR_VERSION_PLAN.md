# WorldAxis 四版本执行清单

授权：用户要求将优化 A1–A6、功能拓展 B1–B7 全部按四个版本完成。
起点：v2.83.0 / d5aa9e2。本文是**历史执行跟踪**：v2.84.0–v2.87.0 段为当时的四版本清单（已完成）；此后各段按版本追加，**不是**当前状态声明。当前版本 v2.119.0（收口读数见 `ITERATION_LOG.md` 的 R105）。

## v2.84.0 可靠运行与因果联动（已交付 1260359 + 825d20b 收口）
- [x] A1：负控制全程独立副本；回归锁、阶段日志、退出结果、超时、中断隔离；测试上下文隔离与顺序稳定性；冻结口径集中治理但禁止自动接受读数。
- [x] A2：输入有限数/标识符/对象/数组/枚举约束；未知字段保留不执行；读侧嵌套所有权；拒收零副作用；导入/迁移/模型输出边界共用。
- [x] A3：端到端机制链/真实消费者/重复结算审计、稳定身份——已有承重物（causal-v2620 / registry-identity-v2620 / dup-decl-v2740）；**开关全组合矩阵与存档兼容已在 825d20b 补齐**（`tests/settle-v2841.js` 三段：`runAll` 开关组合面 / `runCompat` 存档兼容 / `runNegative` 两向自证）。
- [x] B5：即时/延迟/条件后果、取消/缓解/转移、冲突裁决、未兑现承诺与因果追溯；传播深度与结算上限。
- [x] 验收：全量回归 7423/0 ✓、真破坏负控制（G 组两向 + 隔离锁 211 项）✓、运行时接线证据（账本/清册/契约）✓、存档兼容判据 ✓。

## v2.85.0 人物与空间生活（已交付，见本版提交）
- [x] A4（本版落点 = 实际注入预算部分）：`inject-budget` 的 `PRIORITY` 由 v0.9.3 的 8 源补到 **45 源**（按可替代性分 7 档）；`plan()` 收集并返回 `unranked`（未声明源去重），`summaryText` 报未声明计数。专锁 C 面把「声明面 ⊇ 真源面」做成**成类锁**（从 `render/inject.js` 真源码抽 `source:` 名，双向比对 MISS/EXTRA 均空），再漂移必红。**零新增导出成员**（只补键不改成员名，`FROZEN2800` 逐字不变）。
- [x] B1（本版落点 = 人物目标/协作/等待部分）：① 推演名单由**插入序截断**改为 `basisOf()` 计分（goals/commitments/schedule 各计 1）+ `.filter(r.n>0).sort((b.n-a.n)||(a.i-b.i))`——有依据者优先、无依据者不占名额，名额不足以 `stat.skipped` 留痕；② 单方面宣布的合作**不得**被当作已建立的协作——新增 `reciprocated()` 对偶只读检查，不成立则降级 `wait / unreciprocated`，但**承诺本身不被删**；判定位置在「有目标的人走目标路径」之后（协作回没回应不该拦住本就有目标的人）。
- [x] B2（本版落点 = 地点层级与路线通行）：① 层级落在 place 行的 `parent`，**只说明归属、不说明可达**（父子间无道路时 `reach` 必须 `reachable:false`）；② 通行量落在 road 行的 `cap`（段级），容量满时 `road-crowded` 拒收且**拒收不落盘**；`explicitCap` 判定保证「只改耗时」不抹容量；「无→有」是补全（只许一次）、「x→y」是冲突改写（`parent-locked` 拒收并写明现有归属）。**零新增导出 / 零新增容器 / 零新增设置键**。
- [x] 验收：全量回归 **7483/0** ✓（v2.84.0 为 7423/0，+60 = 本版专锁）；专锁 `tests/settle-v2850.js` **60/0**（A/B/C 三面 + N0–N4 负控制，真源码破坏两向自证）；6 个新拒收码全部接**可执行见证**（`reject-lock-v2780` 50/0，见证 71→77）；`side-effect-lock-v2790` 23/0（事务内裸 `return;` 站点已消除）；出口面 `ns=103 members=580 chars=7169` **逐字未变**。
- [ ] 本版未覆盖（如实留在清单，不伪称已完成）：A4 的「短中长基准 / 本地与 API 耗时分列 / 局部重算 / 合并非关键写入 / 分层更新 / 引用保护 / 后台恢复」；B1 的「时间地点资源占用与冲突 / 多人邀约与违约」；B2 的「天气封锁联动 / 人员消息物资分离 / 世界时间一致性」。

## v2.86.0 社会与信息生态（进行中：A5 + A3 已交付，见本版提交）
- [x] A5 第一部分（本版落点 = 注入链韧性 + 失败分类）：`render/inject.js` 新增 `engineCall(ns, fn)` 作为唯一引擎调用出口，43 个源调用点（除 style 自带 try/catch）全部收敛；缺席 / 空串 / 抛异常**三态分开**，只有抛异常进故障台账并按**用户看得见的名字**记（「关系六型」而非 `bonds`）；世界快照六段逐段守卫；`nearEvent`（既读又写）整块守卫。故障台账经**既有** `visibilityStat()` 暴露——**零新增导出成员**。专锁 `tests/settle-v2860.js` **22/0**（N0–N4 负控制，真源码破坏两向自证）。实测：修前 bonds 抛异常 ⇒ 47 源全丢且异常外泄；修后 ⇒ 仅丢 bonds 一个、`apply-throw` 不再出现。
- [x] A3 收口（本版落点 = 事实唯一写者）：`actors/registry.js` 新增 `ensurePerson(draft, id, name, via)` 作为人物条目的**唯一创建点**，每次新建打 `createdVia` / `createdAt` 来源标签；五个创建点（life / intel 两处 / backstage 两处 / registry）全部改为委托——**自动建人的行为一个字都没收紧**（更硬的「禁止建人」一版实测撞 24 条既有契约，已回滚）。无 registry 的合成宿主桩仍能自建，但标签带 `:fallback` 后缀，于是「产品运行时到底走没走唯一写者」可被断言。观测出口 `personOriginStat()` 由 `tool-diag.secModules()` 真消费。专锁 `tests/identity-v2860.js` **36/0**（五个真源码破坏锚点各恰中 1 次）。
- [x] 验收（本版部分）：全量回归 **7541/0** ✓（v2.85.0 为 7483/0，+58 = 两把专锁）；出口面 `ns=103 members=582 chars=7199`（A3 新增 2 个成员，已回填 `FROZEN2800`）；`dead-export-gate` dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292 / 证据 448 条 ✓；`reject-code-gate` 每个码都有归属 ✓。
- [ ] 本版未覆盖（如实留在清单，不伪称已完成）：A5 的「每轮执行解释 / 当前状态与累计分列 / 玩家与全知诊断分离」；A3 的「各模块接线与开关全组合治理 / 身份引用稳定」；B3 全部；B4 全部。
- [ ] B3：收入支出库存债务交易、稀缺资源、组织预算职位权限义务、处罚与晋升、交通灾害联动；精确/叙事分档。
- [ ] B4：事实/目击/转述/谣言分层、动机可信度、隐瞒误传辟谣、证据调查、带时间来源的认知变化。
- [ ] 验收：资源变化驱动真实组织行动；传播与辟谣不篡改事实；普通注入不剧透。

## v2.87.0 导演工作台与拓宽（已交付，本版为四个版本的结束版本）
- [x] B6（本版落点 = 因果工作台全部四项）：
  · **推进单实现**：`engines/causal.js` 抽出 `advanceChains(draft, f, cfg, only)` 作为推进的**唯一实现**，`tick()` 改为调用它；只改传入的 draft，不碰 store、不碰 stat、不写台账。
  · **当前/累计分列**：新增 `summarize(st)` 与 `stateView()`（= `summarize(state())`），返回 `chains/live/terminal/byStatus/byStage/pending/scheduledDelayed/settledRows`——与 `stat()`（本次进程累计）分列表达。stage 维度是本版自纠补上的：此前只按 status 分组，「条件未足」落在 stage 上，答不出「为什么没动」。
  · **干预预览**：`previewIntervention(chainId, action, args)` 支持 advance/cancel/settle，返回 allowed 与原因码；不允许时给的是与真跑同一套原因（disabled/chain-terminal/missing-delayed/already-*/unknown-action）。零副作用。
  · **分支试演**：`rehearse(facts)` 在深拷贝上跑完整一轮 advanceChains，返回逐链 from→to 变化与试演后摘要，`dryRun:true`、不碰 stat（实测试演与真跑结果同一）。
  · **冲突显式选择**：`conflicts()` 只**报出**同因同果的在途链并给出 a / b / both 三个选项，**不自动消解**；消解由面板按钮显式执行（「都留」也是一次选择，不是默认放任）。
  · **回放证据**：`evidence()` 把随机源读数与推进绑在一起；`reproducible` 仅在显式播种时为 true，自动种子下如实报 seedSource=auto 且 reproducible=false，**不谎称可重放**。
- [x] B7（本版落点 = 题材规则组合 + 职责分离）：
  · 新增 `engines/theme.js`：五题材（都市/校园/悬疑/奇幻/经营）对 `rules.ORDER` 的**显式组合**；核心模块（world/event/info/reputation）不入任何题材的排除面。
  · 组合是**叠加**的（多选取并集、按 ORDER 原序，不引入优先级/覆盖）；`preview()` **纯计算不落设置**；`apply()` 是**唯一写入口**，未知题材返回 unknown-theme 且不改状态。
  · `rules.getAll()` 按启用题材过滤（零启用题材时 = 全量，旧行为逐字不变）；`theme.statView()` 由 `tool-diag.secModules()` 真消费（诊断面 theme 字段）。
  · `separation()` 报告三插件分工（WorldAxis 事实结算 / LonSha 证据读取 / RubyPhone 交互执行），缺席跑 `compat.detect()` 现场探测**降级可见**，不写死「已接入」；由 `tool-diag.secLonsha()` 真消费（separation 字段）。
- [x] A5 收口（本版落点 = 导入差异预览 + 字段映射收口）：
  · 抽出共用字段映射 `toFaction/toEvent/toPmem`，三处 IMPORTERS 改为复用（消除两处字段名分叉）；据「导出即有承诺」纪律**不进导出面**（外部零引用 = 过度导出）。
  · 新增 `previewPlan(raw)`：在深拷贝上跑**同一批准入函数**，逐条报 willAdd/willSkip/rows，零副作用；snapshot/regional/worldbook 如实给 note（该类型按整件替换，不做逐条预览）。由「工具」页导入区真消费。
- [x] UI 接线（B6/B7/A5 的真消费方）：
  · 「导演」页新增**题材规则组合**区（多选、预览差异、应用、清空回全量）；「事件」页因果区新增**因果工作台**区（当前/累计、分支试演、查冲突、回放证据、干预预览）。
  · 「工具」页导入区把 preview 与 previewPlan 并列显示（识别类型 + 将新增/跳过）。
  · 证据：`tests/ui-gate.js` **53/0**（375 个控件真实点击、零同步抛出、零未处理拒绝）；`tests/ui-wire-audit.js` **9/0**（零幽灵引用）。
- [x] A6：**明确不做**。理由：A6 的候选（32 处 `function clean()` 一行委托抽取、tool-diag 手工接线收敛）中，clean() 抽取零行为收益却要付接口冻结价（每次成员面变动都要回填 FROZEN2800 与清册）；tool-diag 接线本版已按「消费方缺失」单独治理（theme / separation 两处）。按清单「不能以新增导出或文件存在标记完成」，本项不留 TODO、不伪称完成。
- [x] 验收（本版）：两把专锁 `tests/causal-view-v2870.js`（B6 观测面）与 `tests/b6-b7-v2870.js`（B6+B7+A5，含 N0–N4 负控制）已挂进 `tests/run.js`；出口面 `ns=104 members=596 chars=7341`（B7/A5 新增成员，已回填 FROZEN2800 与本块 EC2430）；`dead-export-gate` dead **443** / uiDead 4 / dataOnly 161 / 仅测试 291 / 证据 447 条 — 本版 9 个新增死导出全部清零（4 个接 UI、4 个收回导出、1 个由 theme.separation 接通）；`module-registry-gate` pass（107 文件 / 115 命名空间，`engines/theme.js` 已登记）。
- [ ] 本版未覆盖（如实留在清单，不伪称已完成）：
  · **回放证据只做到「证据可查」而非「随机序列重放」**——本轮可答「种子是什么、是否可复现」，不可答「请把这一轮的抽签序列重放一遍」；后者需要随机源落盘通道，本版未做。
  · **三插件实机联调无法在无头环境证明**：separation() 的 LonSha 侧读数在无头下是 engine-absent，真机装三个插件的联调须人工在酒馆里做。
  · **A5 的「常用操作 / 有效配置来源 / 回滚结果 / 手机交互 / 实机浏览器验收」**未做；本版 A5 只收口了差异预览与字段映射。
  · **B7 题材对正文的实际影响**只做到「模块是否进入注入面」，未做「不同题材下同一场景的生成差异」对照实验。

## v2.89.0 优化线推进（O1–O5 / X1–X5 两份计划：O1–O5 已交付，X2 / X4 / X5 已交付）
起点：v2.87.0 / 40b6c04。两份计划已入库（folder=WorldAxis）：《WorldAxis v2.88+ 优化方向计划（O1–O5 性能与透明度）》UUID 29179707-ce90-49ac-8e71-36d3c5079409；《WorldAxis v2.88+ 功能拓展计划（X1–X5 交互生态拓宽）》UUID 38375f01-cbd6-41a1-8bd9-842294a610ac。
- [x] O1（本版落点 = 注入预算实测与分档，原料 = A4 未覆盖项「短中长基准/耗时分列」）：
  · 计时落在 `render/inject.js` 的 `engineCall`（v2.86.0 的唯一引擎调用出口，46 处调用点）——一处落表覆盖全部引擎源；时钟用 `clockWall`（测量时间），与 `clockNow` 分列。
  · `engines/inject-budget.js`：`COST_BANDS` 三分档 + `costOf(ms)` 纯函数 + `ACCOUNTS` 科目表（45 源全登记，五科目 × 六角色）+ `costSummary(list, costs)` + `costView()` + `plan()` 返回 `cost`。
  · **纯函数承诺不变**（不读 store、不写配置、不落地注入）；**分档纯解释面，不参与任何判定、不因慢而丢源**。
  · 三态如实：真耗时 / `0ms`（低于计时精度，另计 `subTick`）/ 非计量项（`unmeasured`，不计入 totalMs）。
  · 导出面**只加 2 个成员**（`costOf` → `tool-diag.secInject` 贴档位；`costView` → `ui/panel.js` 渲染耗时段）；`COST_BANDS` / `ACCOUNTS` / `UNCLASSIFIED` 一律不导出（实现细节非承诺）。
  · 真缺陷一并修：① 账本主键由「进了 items 的源」改为「**引擎真调用过的源**」（空世界下由 0 源 → 42 源）；② `SRC_NAME.ledger` 与注入项 `source` 分叉（「重大事件账本」vs「账本」）统一到注入项名。
- [x] 验收（本版）：专锁 `tests/cost-v2880.js` **58/0**（A 成类锁 / B 运行时 / C 缺陷锁 / D 自指，N0–N4 负控制，三个真源码破坏锚点各恰中 1 次）；全量回归 **7654/0**（v2.87.0 为 7596/0，+58）；出口面 `ns=104 members=598 chars=7357`（已回填 `FROZEN2800` 与 `EC2430`）；`tests/inventory.js` 四类悬空均 0（refs **2345** / 命名空间 110 / 成员 **1234**）；`tests/dead-export-gate.js` dead 443 / uiDead 4 / dataOnly 161（无新增）。
- [ ] 本版未覆盖（如实留在清单）：O1 只做到「单源构建耗时」——**局部重算**（改一条要重算多少）、**短中长基准对照**、**本地与 API 耗时分列**未做；耗时只进诊断与面板，**未开独立历史曲线**（需先有窗口滚动存储的取舍）。
- [x] O2（本版落点 = 因果回放证据升级，原料 = v2.87.0 未覆盖项「回放证据只做到证据可查，做不到随机序列重放」）：
  · `core/rand.js` 磁带六口（`beginTape` / `endTape` / `tape` / `replay` / `stopReplay` / `verifyTape`）：每格记 `{c: 通道, v: 值, k: 'd'|'i'}`，**按位置**（不是按推导过程）记录 ⇒ 调用顺序一旦漂移，位置对不上会被当场报出，而不是安静地给出另一套数。
  · 回放期 `next()` / `draw()` 全走磁带、`streamFor` 连派生都不发生 ⇒ 不消耗也不重置派生流。**取证不得改变被取证对象**。
  · `engines/causal.js` 两口：`record`（录制一轮推进）/ `replayWith`（重跑同一段代码）；`evidence()` 增 `tape` / `replayable` / `replayBlockedBy` / `records` / `replays` / `recordFails`。
  · 两条证据分工：`replay(tape)` 证「抽取序列对得上」（会写世界的轮次不能用，会再写一遍）；`verifyTape(t)` 纯算术从种子重算，证「这卷磁带确实出自这个种子」（任何轮次都能用）。`identical` 只在传了 `expect` 时计算——无基准说「一致」是假话。
  · `replayable`（有没有一卷能重放的磁带）与 `reproducible`（种子是否显式）**分列**；`replayBlockedBy ∈ auto-seed / no-tape / rand-absent / tape-mismatch`。
  · 三条「绝不静默」：通道不符 / 磁带枯竭（值退 0）/ 值非法（NaN、Infinity），一律记 `miss` + `lastMiss{at,want,got,why}`；**回放不得抛**（取证口自己炸掉比没有取证更坏）。
  · 接线：`engines/tool-diag.js` 的 `secCausal` 增**只读**回放/磁带段（不调 replay）；`ui/panel.js` 增 `wa-cw-record` / `wa-cw-verify` 两枚控件并登进守卫表（漏登会以守卫表红灯暴露，本版实测踩到）。
  · 真缺陷一并修：① `stopReplay` 把最近一卷磁带随 `__tape` 一起清掉 ⇒「录制 2 格、replayable=true」在调过一次 `replayWith` 之后翻成 false（**取证擦掉了证据**），修法是新增 `__lastTape` 留存、`tape()` 无在卷时回落；② `causal.record` 在 fn 抛异常时把 `endTape()` 的**回执** `{ok,tape,count,seed}` 当磁带交回（`rec.tape.entries` 是 undefined），而「推进中途抛了」恰是最该留下部分录制的路径，修法是交回磁带本体；③ `causal` 里经局部别名 `tz.endTape()` 调用，配对出口在门禁眼里不可见、被判死导出，改为直呼 `WA.rand.*`（**别名让门禁看不见调用**）；④ 注释声称「id 逐字一致」是假话（噪声逐字相同而递变计数器不同），改为「复现的是随机抽取，时间戳与计数器不参与回放」——把它们也复现会让两次回放产出同一 id，用唯一性换可复现性是净亏。
- [x] 验收（O2）：专锁 `tests/replay-v2890.js` **68/0**（A 结构 / B 运行时 / C 缺陷锁 / N 负控制，三个真源码破坏锚点各恰中 1 次）；全量回归 **7734/0**（v2.88.0 为 7654/0，+80 = 专锁 68 + 拒收码见证 12）；出口面 `ns=104 members=605 chars=7416`（已回填 `FROZEN2800` 与 `EC2430`）；清册面 refs 2367 / 命名空间 110 / 成员 1242；死子面 dead 444 / uiDead 4 / dataOnly 161；拒收码见证 91 / 死表 5 / 基线 211。
- [ ] O2 未覆盖（如实留在清单）：磁带**只驻内存不落盘**（跨会话重放不可用）；`replayWith` 在产品内**无安全调用点**（会写世界的轮次不能用它），如实登记为 test-only 死导出；定位只做到「通道 + 序号」，**未做**「第几轮第几步」的语义坐标；跨设备 / 跨版本磁带兼容性未验证。
- [x] O3（本版落点 = 每轮执行解释 + 玩家/全知诊断分离，原料 = v2.86.0 未覆盖项「A5 的每轮执行解释 / 当前状态与累计分列 / 玩家与全知诊断分离」）：
  · `render/inject.js` 新增 `SNAP_SOURCES`（clock/pulse/background/people/currents/echoes 六源合记一个「世界状态」块）与 `sourceDecisions(vis, landedNames, failNames)`：**事后**按源表逐项给状态码，**不改 47 条注入分支**。为什么不长在分支上：v2.56.0 的教训——记账点长在分支上，加分支的人必忘；后置归因只认源表，新增源不需要谁记得补一行。
  · 六态封闭集合：`landed`（非快照源真落地）／`landed-in-state`（快照源进了 `<world_axis_state>` 块）／`visibility-off`（用户关的，正常）／`module-absent`（模块没加载或被禁用，装配问题）／`failed`（本轮构建抛异常，**坏**）／`no-content`（本轮无内容，正常态）。**坏 ≠ 没内容**：把 `failed` 混进 `no-content`，就再也答不出「这一块是坏了还是本来就没事」（v2.86.0 的台账是本版之上的一层，本版把它变成可读的解释面）。
  · 归因优先级（自纠后）：`!isSnap && landedSet 含该源` → landed；`isSnap && stateSnap && vis 未被关` → landed-in-state；`vis[k] === false` → visibility-off；`!WA[k]` → module-absent；`fails[name]` → failed；兜底 no-content。**先认「真落地」再认「被关」**——顺序反了会把「用户关了但源本来就落地」错归成用户关的。
  · `explain(round)` 两面分列，**不是同一份数据的两种排版**：`player` 只给 `{landed, missedCount, summary, note}`，**不报未落地项的名字与归因码**（源名会暗示尚未揭示的剧情线，属机制层剧透）；`omniscient` 给逐源 `{key,name,state}` + `trace` / `traceSummary` / `main` / `injected` / `candidates` / `landedCount` / `missedCount` / `budget` / `cost`。`lastInjection` 补 `round` 与 `decisions` 两字段；`applyInjections` 的 `roundNow` 跟 `evolution.roundOf()` 走（缺席为 `null`，**不拿 0 冒充第 0 轮**）。
  · 轮次坐标三态照实：从没注入过 ⇒ `{ok:false, reason:'no-rotation'}`；传入轮次与现场不符 ⇒ `{ok:false, reason:'round-not-recorded', want, have}`（**不拿上一轮的当这一轮**）；相符才作答。`explain` 纯读：只读 `store.lastInjection`，不跑引擎、不改存档、不向上文注入——**取证不得改变被取证对象**（O2 同一条纪律）。
  · 接线两处真消费方（**无消费方不挂**）：`engines/tool-diag.js` 的 `secInject` 增 `out.explain`（round / candidates / landedCount / missedCount / playerSummary / missed 逐项）；`ui/panel.js` 注入页增 `wa-inj-explain`（「本轮为何这样」：只报进了什么、还有几项没进）与 `wa-inj-explain-all`（逐源列名 + 归因码）两枚控件并登进守卫表，**两者不合并到一个输出框**——合并等于把制作者视图泄给玩家。
  · 两条本版最该记住的（都在「判据的输入面」上）：① **判「玩家面是否剧透」不能拿整段 JSON 去判**——`player` 有个键就叫 `landed`，序列化后必然命中状态码 `'landed'`，输入面选错会把正确实现判成缺陷；该判「键集封闭 + 每个字符串值不含状态码」。② **负控制的破坏形态不能是「删行」**——链首 `if` 删掉会留下悬空 `else`，破坏副本 `SyntaxError`，「装不起来」证明不了判据敏感；统一改**条件置假**（`if (false && …)`）。另钉一条命名约束：面板里那个全知面局部变量若叫 `o`，会被 v2.39.0 的顶层 `.round` 幽灵扫描命中（标识符集含 `o`）——**变量名也进了门禁的口径**，专锁正面钉住它。
- [x] 验收（O3）：专锁 `tests/explain-v2900.js` **53/0**（A 成类锁 / B 运行时 / C 缺陷锁 / N 负控制，三个真源码破坏锚点 `ANCHOR_VIS` / `ANCHOR_FAIL` / `ANCHOR_LAND` 各恰中 1 次，破坏形态统一为条件置假）；全量回归 **7787/0**（v2.89.0 为 7734/0，+53 = 专锁 53 项）；出口面 `ns=104 members=606 chars=7424`（+1 = `render.explain`，已回填 `FROZEN2800` 与 `EC2430`）；清册面 refs **2374** / 命名空间 110 / 成员 **1243**；死子面 dead 444 / uiDead 4 / dataOnly 161；拒收码 309（见证 **93** / 死表 5 / 基线 211，两个新码 `no-rotation` / `round-not-recorded` 用产品真 API 跑出见证，**不靠声称**）。
- [ ] O3 未覆盖（如实留在清单）：`explain` 只解释「本轮注入链」的**源级**去向，不解释预算折叠/丢弃的逐项理由（那些在 `trace` 里，本版只透传不归纳）；快照块内逐段**不细分**（拿不到的粒度不假装拿到）；跨设备 / 跨会话的解释面（`lastInjection` 只驻当前存档）未验证；玩家面与全知面的分列只做到「结构上分开」，未做面向终端用户的多语言文案。
- [x] O4（本版落点 = 因果与状态批量治理：开关全组合 + 身份引用稳定，原料 = v2.86.0 未覆盖项「A3 的开关全组合」）：
  · `render/inject.js` 三处：① `SRC_MOD_SETTING`（源键 → 模块设置键，**37 项显式列出**，不同名的一一列出，如 `temporalLock → worldaxis_temporal_settings_v1`）；② `moduleEnabled(k)` **三态读**（键没登记 / 读抛错 ⇒ `null`，**不造 `def: {}` 壳**——不在读不到时冒充「开着」）；③ 归因链新增 `module-off`（插在 `module-absent` 之后、`failed` 之前 ⇒ **七态封闭集合**），`visibilityStat()` 增 `faceAudit`（逐源 `{key,name,face,visibility,moduleEnabled,note}`，`face` 取 `on` / `vis-off` / `mod-off` / `unavailable`）。实测默认态 47 源：`mod-off 36` / `unavailable 8` / `vis-off 3`。
  · `actors/registry.js` 新增 `danglingRefs()`（本版**唯一**新增导出成员）：两套名字真源（持久绑定表 `idScope().mine` + 人物容器键去 `p_` 前缀）× 三类引用行（`relationships` / `relations` / `life.commitments` 的 `target`）；**只报不删**（悬空引用不是错误，是待确认的旧账；自动清掉等于替作者做了决定），**只读不改状态**；返回 `{rows, byKind, items ≤ 20, knownCount, persisted}`。
  · 两处真消费方（**无消费方不挂**）：诊断 `secModules.danglingRefs` + `secInject.faceOff / faceUnavailable / faceAuditError`；面板注入页 `wa-inj-face`（只列 `mod-off`，全一致时才说「开关两面一致」——**两枚按钮不合并到一个输出框**）+ 人物页悬空行（几条 + 前 4 条 + 「只报不删，确认后再改」）。守卫表同步登记。
  · 同步 O3 锁的**陈旧常量**：归因码是封闭集合，新增一档而不更新 `tests/explain-v2900.js` 的六态表，那份表就会把正确的新实现判成「越界」（实测一次报 32 项越界）；B4 的 `org` 正例因总开关被前序用例关过而失效（**对照吃环境**）⇒ 修法是「判据改七态 + seeds 把模块总开关也显式置定」，**不是放宽断言**。
- [x] 验收（O4）：专锁 `tests/switch-matrix-v2910.js` **72/0**（A 成类锁 / B 运行时 / C 缺陷锁 / N 负控制，四个真源码破坏锚点 `ANCHOR_OFF` / `ANCHOR_FACE` / `ANCHOR_DANG` / `ANCHOR_DANG2` 各恰中 1 次，破坏形态含「静默报零」与「失去分辨力」两向）；全量回归 **7859/0**（v2.90.0 为 7787/0，+72 = 专锁 72 项）；出口面 `ns=104 members=607 chars=7437`（+1 = `registry.danglingRefs`，已回填 `FROZEN2800` 与 `EC2430`）；清册面 refs **2385** / 命名空间 110 / 成员 **1244**；死子面 dead 444 / uiDead 4 / dataOnly 161（无新增）；拒收码 309（见证 93 / 死表 5 / 基线 211）；五个独立门禁（module-registry / export-contract / reject-code / field-liveness / test-surface）全过，`dead-export-gate` 更新证据后过（账本 version=2.91.0）。
- [ ] O4 未覆盖（如实留在清单）：`danglingRefs` 只扫三类引用行（`relationships` / `relations` / `commitments`），`warrant` / `hazard` / `world` 等其它可能带名字引用的面未纳入；`faceAudit` 是**当次快照**，不做历史曲线；「id 重命名后旧引用可追溯」只做到「报出悬空」，**未做**别名表 / 追溯链；开关**全组合**（三源以上同时关闭的相互踩踏）仍只有 v2.84.1 的两方关闭覆盖，本版未扩到三三 / 多多组合。
- [x] O5（本版落点 = 资源账本健康面，原料 = B3 经济侧先观测「把 `org.stockOf` 流水分列为资源账本读数（存量/流量/笔数/异常笔）」）：
  · **侦察结论：计划判据原样不可判定**——`engines/org.js` 自 v2.54.0 起只有累计计数 `stat = {grants,transfers,blocked,lastReason}`，没有任何逐笔流水 ⇒「某笔交易后存量 = 存量 ± 流量」缺输入面。本版先补观测面。
  · `engines/org.js`：`JOURNAL_CAP = 200` + `journal[]` + `journalStat{recorded,dropped}` + `noteJournal(row)`（try 包裹；环形挤出 `dropped++`——**静默丢弃不是可接受的默认值**）；`grant` 记 `toBefore/toAfter`、`transfer` 记双向 `fromBefore/fromAfter/toBefore/toAfter`；**只记成功的交易**（被拒的转移不是流量）。
  · 读数口：`qtyOf`（无持有者 `null`，不拿 0 冒充）/ `anomalies()`（`stockDrift` / `negativeStock` / `overpay`，逐笔算术判，**不猜**）/ `reconcile()`（链检 + 与当前存量比对，`breaks ≤ 20` / `truncated` / `holderGone` 照实报）/ `ledgerView()`（存量 + 流量 + 笔数 + 异常 + 对账结论）。
  · **导出只加 2 个成员**（`ledgerView` / `reconcile`），两处真消费方（**无消费方不挂**）：诊断 `secOrg.ledger` 段 + 面板人物页「资源账本」按钮。
  · **观测不得改变被观测对象**：`ledgerView` / `reconcile` 纯读（不跑引擎、不改存档、不注入），`grant` / `transfer` 返回值与 `stat` 语义一字不变。
  · 真缺陷一并修：面板失败分支 `reason` 留空 ⇒ 印出「未记录：未知原因」（而事实是「存量与流水对不上」）——修为可读原因 + 读数措辞「账本 · 」与写盘回执「已记录」分开。
- [x] 验收（O5）：专锁 `tests/resource-ledger-v2920.js` **47/0**（A 成类锁 / B 运行时 B1–B9 / C 缺陷锁 / N0–N4 负控制，五个真源码破坏锚点 `ANCHOR_NOTE_G` / `ANCHOR_PENDING_G` / `ANCHOR_DRIFT` / `ANCHOR_CHAIN` / `ANCHOR_VSSTOCK` 各恰中 1 次，破坏形态含「静默报零」与「失去分辨力」两向）；全量回归 **7906/0**（v2.91.0 为 7859/0，+47）；出口面 `ns= 104 members= 609 chars= 7458`（+2，已回填 `FROZEN2800` 与 `EC2430`）；清册面 refs **2391** / 命名空间 110 / 成员 **1246**；死子面 dead 444 / uiDead 4 / dataOnly 161（无新增）；拒收码 **310**（见证 93 / 死表 5 / 基线 212，新码 `ledger-throw` 显式归类）；六个独立门禁（module-registry / export-contract / reject-code / field-liveness / test-surface / orphan-lock-v2750）全过，`dead-export-gate` 更新证据后过（账本 version=2.92.0）。
- [ ] O5 未覆盖（如实留在清单）：流水**只驻内存**（与 causal 磁带同口径，不落盘、不注入正文，跨会话不可查）；只覆盖 `org` 的 `grant` / `transfer` 两类操作，**不覆盖** `evolution.economy`（气候 / 信号）与其它模块的库存改动（编辑器直接改 `resources` 不计流水）；经济风（`ECONOMY_CLIMATE`）**未纳入**资源账本读数（计划原文「经济风 + `org.stockOf` 流水」只落了后者）；流水被挤出后 `reconcile` 只核对带内（`truncated` 照实报，**未做**落盘存档点以核全量）；异常笔三类**未接进健康分**（只进诊断与面板）。
- [x] X4（本版落点 = B2 天气灾害封锁联动，见功能拓展计划；本轮先落 weather↔world 这一半）：
  · `engines/world.js` 三渠道通行面：`CHANNELS = ['person','goods','message']`（**封闭集合**）+ `BLOCK_LEVEL`（逐天气逐渠道的显式封锁映射：`storm`/`snow` 封人封物放消息，`heat`/`fog` 三渠道全封，`rain`/`clear` 一律不封）+ `transit(channel, from, to)`。
  · `transit` 只收**三参数**；判序 `bad-channel` → `disabled` → `unreachable` → 沿路径**逐段**查天气（命中报 `weather-blocked` 并带 `at`/`kind`/`factor`/`path`）→ 成功报 `ok:true` + `path`/`minutes`/`hops`/`weather`/`weatherReason`。
  · 内部面 `weatherBlockOf(place)`：`reason ∈ engine-absent|disabled|missing|unknown-kind|ok`；**未登记天气不回落成晴**（报 `missing`，`kind === null`，**不因此封路**）；未知天气词报 `unknown-kind` 且 `blocked: null`（既不假装通行也不假装封锁）。
  · 计数**分列**：成功进 `transits[channel]`、被封进 `blocks[channel]`、总 `blocked` 另计——「今天运了几趟」与「今天被拦了几趟」不挤在一个计数器里。
  · **导出只加 2 个成员**（`CHANNELS` / `transit`），`weatherBlockOf` 作为内部只读面**不导出**（无消费方不挂）。
  · 两处真消费方（**无消费方不挂**）：诊断 `secWorld` 的 `channels`/`transits`/`transitBlocks` 三读数 + 面板世界页「判通行」按钮（起终点**复用** `wa-world-mv-from`/`wa-world-mv-to`，同一个「从/到」语义不另造一份；`weather-blocked` 与其它原因**分列措辞**）。
  · **观测不得改变被观测对象**：`transit` 会改 `stat` 计数，故诊断 `secWorld` 刻意**不调** `transit`、也**不调** `weatherBlockOf` 做推断——只读已发生的计数，不自赠结论。
  · 真缺陷一并修：产品侧 `weatherReason: wx.ok ? wx.reason : 'unknown'` 的 `else` 落进「内联字面量 `reason: 'x'`」词法形状，被拒收码扫描器误捕 ⇒ 改**词法形状**为 `(wx.ok && wx.reason) || 'unknown'`（**非码不塞进台账**，否则台账永久虚胖）。
- [x] 验收（X4）：专锁 `tests/transit-v2930.js` **74/0**（A 结构 / B 运行时 B0–B13 / C 不变式与诚实降级 / N0–N4 负控制，六个真源码破坏锚点各恰中 1 次）；全量回归 **7980/0**（v2.92.0 基线 7906/0，+74）；六道独立门禁全过。
- [ ] X4 未覆盖（如实留在清单）：`BLOCK_LEVEL` 是**本版固化的映射**（未来新增天气词只报 `unknown-kind`，由调用方面对，不假装通行也不假装封锁）；`transit` **不做耗时修正**（`weather.factor` 只随读数报出，交调用方决策——`travelMinutes` 是另一入口）；**不做多跳途中遭遇**（只在路径各点查静态天气，不模拟「走到半路下起暴雨」）；`transit` 会改 `stat` 计数（故诊断节不调它）；**`hazard` 与本版未联动**（计划原文「weather.js 与 hazard/world.canBeAt 打通」只落了 weather↔world 这一半，hazard 侧留待后续如实登记）。
- [x] O6（本版落点 = 流水落盘与跨会话可查，原料 = O5 未覆盖项「流水只驻内存」+ O2 未覆盖项「磁带只驻内存」）：
  · `engines/org.js`：`JOURNAL_FORMAT` / `JOURNAL_FORMAT_VERSION` 两常量 + `exportJournal()`（**纯读**：不挤出、不清空、不改 stat、不改 journalStat；`truncated = dropped > 0` 照实带出）+ `inspectJournal(vol)`（四态校验，**内部面不导出**）+ `reconcileWith(vol)`（**带外对账**：链比对 `why:'chain'` + 存量比对 `why:'vs-stock'`，**不改本侧 journal**）。
  · **不自动落盘**：落盘由用户显式调用 `exportJournal()` 触发（自动落盘会把观测面变成隐式写盘面，且每笔交易写一次 `localStorage` 是性能陷阱）。
  · **没核与核过一致是两件事**：面板无卷时报 `no-volume` 并提示「先点『导出流水』得到一卷，再核」。
  · 导出面**只加 2 个成员**（`exportJournal` → 面板 + 诊断 `secOrg`；`reconcileWith` → 面板）；`inspectJournal` / `climateOf` 一律**不导出**（无独立消费方不挂）。
- [x] O7（本版落点 = 异常笔接进健康分，原料 = O5 未覆盖项「异常笔三类未接进健康分」）：
  · `core/store.js` 新增 5 变量 + **9.10 资源账本异常笔**采集节：`anomalies.count > 0 ⇒ error`（扣 `min(18, n*6)`，`key:'org.anomalies'`，附处置入口）；否则 `dropped > 0 ⇒ info`（`key:'org.journal'`，明说「对账只核到**带内**，跨会话全量须显式导出流水卷」）。
  · 分级与随机源/时间源同型：「没交易」是设计内默认态（不报），「有异常笔」才是缺陷。
  · **观测不得改变被观测对象**：只读 `ledgerView()` / `journalStat`，不调 `grant` / `transfer`；整节 try 包裹，抛错走 `markDegraded('org.ledger')`。
- [x] O8（本版落点 = 经济风纳入账本读数，原料 = O5 未覆盖项「`ECONOMY_CLIMATE` 未纳入」）：
  · `climateOf()` 五态（`engine-absent` / `missing` / `unknown-climate` / `ok` / `climate-throw`），前三者 `available:false` 且 `climate:null`——**引擎缺席与字段缺失一律不回落成「平稳」**；表外气候词报 `unknown-climate`。
  · `ledgerView()` 返回体增 `climate` 段；**只读不写**（`evolution` 是气候唯一写入口）。
- [x] 验收（O6–O8，本版）：专锁 `tests/journal-v2940.js` **40/0**（A 静态面 / B 运行时面 / C 不变式 / N0–N4 负控制，六条真源码破坏锚点各恰中 1 次，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」+ 判据纯度前置检查 + H5 锚点字面量各只声明一次）；全量回归 **8013/0**（v2.93.0 基线 7980/0）；六道独立门禁全绿。
- [ ] O6–O8 未覆盖（如实留在清单）：流水卷**须用户显式导出**（不自动落盘、不写 `localStorage`）；带外对账**只核卷内已记的键**（本侧新增持有者不在卷里故不报——这是「带外」的定义边界）；经济风**只报不判**；O7 **未做自动修复**（写坏是缺陷，缺陷不该被静默抹平）；`exportJournal` 的 `rows` 是元素同引用的浅拷贝（本版按「取证口不复制整卷」权衡保留）。
- [x] X2（本版落点 = B3 经济引擎，见功能拓展计划；本轮落 org 侧的职册 / 功簿 / 薪俸 / 欠薪 / 罚没）：
  · `engines/org.js` 常量三表：`ROLES`（四阶 `novice` 帮闲 2 / `member` 管事 5 / `steward` 主事 12 / `chief` 当家 30，各自带晋升门槛 0 / 12 / 40 / 120）+ `ROLE_IDS` + `TIDE`（倍率：繁荣 1.25 / 平稳 1 / 衰退 0.75 / 动荡 0.6）+ `TIDE_WORD`（叙事档：宽裕 / 如常 / 紧绌 / 朝不保夕）。
  · **两档同账不同词**：同一个倍率既以 `mul` 给机器读、也以中文词给叙事读；经济风不可读时**两档都不给**（`known:false` / `word:null`），**不回落成「如常」**。
  · **倍率真进账且不夹换算层**：`dueOf` 的应付直接是 `role.pay × 倍率`（当家繁荣 38 / 平稳 30 / 衰退 23）。一度写成 `pay/PAY_CYCLE×倍率`——低职阶在四档气候下应付恒为整数下限 1，「倍率真进账」变成墙上标语（本版实测并删除，口径改为「代码里不允许有中间换算层」）。
  · **发薪顺序显式可解释**：`payroll` 按时职阶从低到高发放（同阶按名字）——不规定顺序的话「钱不够时谁被欠」由名字典序决定，账面照样可复现但业务不可解释。
  · **不新造写通道**：薪俸 / 补发 / 罚没一律复用既有 `transfer` ⇒ 自动进 O5 流水（可被 O6 带外对账核、异常时进 O7 健康分）。同一本账，没有影子账。
  · **欠就是欠**：发不出不假装发得出——记 `owed` 并报 `partial`/`insufficient`；`ok`（流程跑完）与 `settled`（从此不欠谁）**分开**。
  · **离散量与连续量有意分列**：`payroll` 发的是「一份薪」（库存不够整笔拒收并记欠）；`settleOwed` 还的是「已经欠下的债」（能还多少还多少，欠 30 库存 12 ⇒ 还 12 且 `left=18`，**不把「还欠着」抹成「清了」**）。两者共用同一支 `transfer`、同一本流水，差别只在发放粒度。
  · **记功与晋升分列**：`creditWork` 只记在册者（**不顺手补名册记录**）、单次上限 99、**不自动晋升**（够门槛只报 `ready`）；`promote` 逐阶判门槛（不够报 `need`/`have`，到顶报 `top-role`）。
  · **罚没一次 transfer 走完**：本人 → 势力一步到位、流水恰一笔（两步写法在第二步失败时会凭空多出资源）。
  · **观测不得改变被观测对象**：`rosterView` 纯读（连读四次，存档与 `stat` 字节级不变）。
  · **导出只加 7 个成员**，**每个口一个真消费方**（面板人物页七个按钮）：`assignRole` / `creditWork` / `promote` / `rosterView` / `payroll` / `settleOwed` / `penalize`；`writeOwed` / `membersOf` / `organizationSummary` 作为内部面**不导出**（各自只有本体内的消费方，`organizationSummary` 被 `ledgerView` 消费 ⇒ 欠薪不必靠用户点面板才看得见）。
  · 消费侧第二处：诊断 `secOrg` 增组织读数（`rosterCount` / `owedTotal` / `factions` / `tide` 四段）；九个新控件登进守卫表。
- [x] 验收（X2）：专锁 `tests/org-econ-v2950.js` **59/0**（A 静态面 / B 运行时 B0–B10 / C 不变式 / N0–N4 负控制，六条真源码破坏锚点 `PENALTY_ONE_SHOT` / `OWED_RECORD` / `SETTLED_HONEST` / `TIDE_NO_FALLBACK` / `TIDE_MUL_IN_DUE` / `CREDIT_ROSTERED_ONLY` 各恰中 1 次，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」+ 判据纯度前置检查 + H5 锚点字面量各只声明一次）；全量回归 **8079/0**（v2.94.0 基线 8020/0，+59）；出口面 `ns= 104 members= 620 chars= 7572`（+7 成员 / +69 字符，`FROZEN2800` 与 `EC2430` 已逐字回填）；清册面 refs **2424** / 命名空间 110 / 成员 **1257**；死子面 dead 444 / uiDead 4 / dataOnly 161（**无新增**——七个新口全接上真消费方）；拒收码 **331**（见证 93 / 死表 5 / 基线 **233**，新增 10 码 `bad-name` / `bad-role` / `empty-roster` / `insufficient-contrib` / `no-debt` / `not-on-roster` / `payroll-throw` / `roster-throw` / `settle-throw` / `top-role` 显式归类）；六道独立门禁（module-registry / reject-code / test-surface / orphan-lock / UI 接线 / 骨架归属 / 重复定义 / 死子面）全绿。
- [ ] X2 未覆盖（如实留在清单）：职册在势力对象内，**不跨势力调动**（一人一势力一职阶，多职务需另设势力）；倍率**只影响应付**（不改库存上限、不改转移成本）；`payroll` 一次性结算，**不做排期 / 周期概念**（「一期」由调用方决定何时发）；功簿是**累计量**（`contrib` 只增不减，无衰减与任期）；`fined` 也是累计量，**不追溯退还**；经济风表 `ECONOMY_CLIMATE` 由 `evolution` 维护，本模块**只读不写**。
- [ ] X1 未开始（见功能拓展计划）：X1 UI 实机验收通道（**需真机三插件联调，无头不可验**）。
- [x] 验收（X3 + X6，v2.96.0）：**X3** 新增 `engines/rumor.js`（十五口导出）+ 专锁 `tests/rumor-v2960.js` **84/0**（A 静态面 / B 运行时 B0–B19 / C 不变式 / N0–N5 负控制，十锚点 `ASCEND_GUARD` / `TAMPER_LAYER` / `UNDECLARED_REWRITE` / `INTACT_CUMULATIVE` / `HOPS_NO_EVICT` / `CONF_NO_FALLBACK` / `PUBLIC_ONLY_BLOCK` / `FACT_NO_FABRICATE` / `CONCEAL_NOT_HOP` / `REFUTE_NO_REWRITE` 各恰中 1 次）；**X6** 判定面接线 `engines/hazard.js`（`weatherAt` / `targetWith` / `weatherGain` 三个内部面**不导出**，十二口导出逐字不变）+ 专锁 `tests/hazard-weather-v2960.js` **61/0**（八锚点 `READONLY_WEATHER` / `NO_FALLBACK_ABSENT` / `DISTINGUISH_BASE` / `HARD_FLOOR_ONE` / `SINGLE_SEVERITY` / `MISSING_HONEST` / `HAS_AT_DISCRIMINATION` / `DISABLED_NOT_SUNNY` 各恰中 1 次）。两锁均「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」+ 判据纯度前置检查 + H5 锚点字面量各只声明一次 + N5「破坏必须真的替换掉锚点」。消费侧：面板人物页十八控件 / `secRumor` 采读节 / 十八控件守卫表。出口面 `ns= 105 members= 634 chars= 7710`（`FROZEN2800` 已回填 `rumor:` 段）；清册面 refs **2461** / 命名空间 111 / 成员 1272；死子面 dead 444 / uiDead 4（**无新增**——`weatherAt` 等内部面不导出故不入死表）/ dataOnly 162；拒收码 **337**（见证 99 / 死表 5 / 基线 233，新增 8 码 `unknown-fact` / `chains-full` / `hops-full` / `suppressed-full` / `bad-motive` / `link-off` 等显式归类）。九道独立门禁全绿。
- [ ] X3 / X6 未覆盖（如实留在清单）：`rumor` 不做跨链合并、不做自动层推断；`refute` 只改「有人不再当它是一回事」；`hazard` 的天气修正只作用于目标值，不改 `count`/`hits` 语义；天气面缺席一律如实降级不回落。
- [ ] X1 未开始（见功能拓展计划）：X1 UI 实机验收通道（**需真机三插件联调，无头不可验**）。
- [x] 验收（O9 + O10 + X5，本轮）：三把专锁 `tests/alias-trace-v2970.js` **58/0** / `tests/coord-v2970.js` **41/0** / `tests/phone-bridge-v2970.js` **47/0**（各含 A 静态面 / B 运行时 / C 不变式 / N0–N9 负控制，真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据）；全量回归 **8388/0**（v2.96.0 基线 8202/40）；出口面 `ns= 106 members= 654 chars= 7897`（+5 成员：`registry` 四口 `bindAlias` / `aliasOf` / `traceOf` / `aliasStat` + `phoneBridge.traceOf`，`FROZEN2800` 与 `EC2430` 已逐字回填）；清册面 refs **2523** / 命名空间 112 / 成员 1292；死子面 dead 444 / uiDead 4（**无新增**——三线新增导出全部接上真消费方）；拒收码 **346**（见证 108 / 死表 5 / 基线 233，新增九码全部带可执行见证）；九道独立门禁全绿。**产品侧三处真缺陷**（`orphanSlots` 恒为 0 / `firstMissCoord` 答错问题 / `markCoord` 还原带非零 `at`）全部由探针发现并修复；另修一处测试侧污染源（`tests/reject-v2780.js` 的 O9 见证段写真实登记却不复位，护栏与夹具自足一并补上）。
- [ ] O9 / O10 / X5 未覆盖（如实留在清单）：别名表**只增不删**、**一个旧名只有一个主人**（旧名已属别人报 `name-taken`）、链深**硬上限 8**（登记侧当场拒绝，解析侧另有一道同样的闸管旧存档与外部导入）；`danglingRefs` **只报不删**；坐标是**标出来的、不是猜的**（无标记照实报 `round:null` / `label:`），且只在**录制时**落进磁带（回放期不写磁带故不改坐标）；桥**不挂事件监听 / 不轮询 / 不自动消费快照**、**不检查对方在场**（对方不在场时这笔操作仍然发生过，只由 `phase` 照实报出）、`block` 与 `unblock` **不合并**。


## v2.98.0 / v2.99.0 优化线与新面（P2 磁带卷跨会话可查 + 原著幕目）
- [x] 验收（P2 磁带卷，v2.98.0）：专锁 `tests/tape-vol-v2980.js` **72/0**（A 结构 / B 运行时 / C 不变式 / N0–N4 负控制，两个真源码破坏锚点 `ANCHOR_ROWS`（导出行面那三行 —— 「照搬 n 而不重算」的落点）/ `ANCHOR_BADROWS`（带外核对的行面早退 —— 「行面读不了就当场归因」的落点）各恰中 1 次，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」+ N4 锚点工具两向自证）；全量回归 **8464/0**（v2.97.0 基线 8388/0）；出口面 `ns= 106 members= 656 chars= 7920`（+2 成员 = `rand.tapeVol` / `rand.verifyTapeWith`，`FROZEN2800` 与 `EC2430` 已逐字回填）；清册面 refs **2528** / 命名空间 112 / 成员 1294；死子面 dead 444 / uiDead 4（**无新增**——两口各接真消费方）；拒收码 **347**（见证 109 / 死表 5 / 基线 233）；九道独立门禁全绿。口径四条（与 O6 流水卷同规格）：**不自动落盘** / **导出不改本侧** / **位置真源照搬（不重算）** / 拒收码沿用既有词汇。
- [ ] P2 未覆盖（如实留在清单）：磁带**仍不落盘**（本模块不替调用方写盘，卷由调用方拿走）；跨设备 / 跨版本**只做显式拒收、不做迁移器**；一卷就是一节会话的横切面（**不做**合并与追加）；`compared === 0` 只说明卷内自洽（位置链完整），**不构成**「与分析对象一致」（本侧磁带不落盘，没有第二份真源可比）；`verifyTape`（磁带对象）与 `verifyTapeWith`（卷）答的问题不同（前者不读格式头）。
- [x] 验收（canon 原著幕目，v2.99.0）：专锁 `tests/canon-v2990.js` **53/0**（A 静态面 / B1–B14 运行时 / C1–C2 不变式 / N1–N16 负控制，**14 个真源码破坏锚点** `NO_FAKE_OUTLINE` / `BAD_COORD_REJECT` / `OUT_OF_RANGE_NO_CLAMP` / `POINT_CUT_REPORT` / `ACT_CUT_REPORT` / `PICK_FALLBACK` / `ADOPT_SHAPE_GUARD` / `BUILD_THROW_ATTR` / `ADOPT_THROW_ATTR` / `CLEAR_THROW_ATTR` / `CLEAR_GUARD` / `TITLE_TRIM` / `EXACT_KEY_REMOVED` / `DIAG_PURE` 各恰中 1 次）；全量回归 **8523/0**（v2.98.0 基线 8464/0）；出口面 `ns= 107 members= 668 chars= 8043`（+1 命名空间 / +12 成员 / +123 字符，`FROZEN2800` 与 `EC2430` 已逐字回填）；清册面 refs **2559** / 命名空间 113 / 成员 1307；模块注册 文件 110 / 命名空间 118 / 装载期边 23 / 硬边 0 / 调用期引用 44；死子面 dead 444 / uiDead 4 / dataOnly **163**（`LIMITS` 是数据成员、产品零引用）；拒收码 **354**（见证 116 / 死表 5 / 基线 233，新增七码 `no-outline` / `bad-coord` / `out-of-range` / `bad-outline` / `build-throw` / `adopt-throw` / `clear-throw` 全部带可执行见证）；测试文件面 83 文件 / 78 锁 / 孤儿 0；UI 渲染路径门禁 **53/0**；`settle-v2830` 55 项；九道独立门禁全绿。**产品侧真缺陷一处**：`render/inject.js` 的 `SRC_MOD_SETTING` 漏登记 `rumor`（v2.96.0 引入时即漏）与 `canon` ⇒ `moduleEnabled()` 查不到键返回空串，对账面上两个源被误报「没有模块级总开关 / 模块没加载」；已补齐并在注释里写明后果。**另把一条假见证钉进锁内**：`build-throw` 的见证原靠怪异输入撞内部异常，而 `pick()` 加固成全域总之后那条路返回 `ok:true`，见证静默变成假绿；改为打桩 `settingsBus.normalize`（与 `adopt-throw` / `clear-throw` 打桩 `store.transact` 同规格）。
- [ ] canon / 原著幕目未覆盖（如实留在清单）：总开关默认关闭；**只切分不改写**（点只保留题名与长度，正文本身不进存储；句间空白是唯一在账上丢掉的东西）；**不调模型**（模型分幕不可复现 ⇒ 幕坐标不可复现 ⇒「上次定位到第 3 幕」就没有意义）；信息量随篇幅线性（幕数 = 节数 / `perAct`，不是固定拍数）；原著文本不入存档（只有大纲落盘）；坐标是标出来的，越界一律照实不成立、**不夹到边界**；**不做**「偏离原著」的自动判定（本版只给基准，判定是下一层的事）；**不做**语义分段（粒度由 `segChars` / `perAct` 决定）。
## v2.100.0 原著对位（第五十七面）
- [x] 验收（canon 原著对位，v2.100.0）：专锁 `tests/canon-align-v2100.js` **43/0**（B1–B15 运行时 / C1–C2 不变式 / 9 条逐锚负控制 + N0 / N1 / N10，锚点 `NO_SIGNAL_HONEST` / `SIGNAL_NO_SIGNAL` / `COVER_HIT_FILTER` / `THIN_GUARD` / `ALIGN_CALC_PURE` / `POSITION_STAT_SPLIT` / `GAP_TOTAL_FROM_ACTS0` / `GAP_RANGE_NO_CLAMP` / `DIAG_ALIGN_PURE` 各恰中 1 次，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」）；`tests/canon-v2990.js` **53/0**（两处锚点唯一化后）；全量回归 `node tests/run.js` → **8576/0**（v2.99.0 基线 8523/0）；出口面契约 `ns= 107 members= 672 chars= 8073`（+4 成员 / +30 字符，`FROZEN2800` 与 `EC2430` 已逐字回填）；清册面 refs **2565** / 命名空间 113 / 成员 **1311**；死子面 dead 444 / uiDead 4 / dataOnly 163（新口零死面）；拒收码 **356**（见证 118 / 死表 5 / 基线 233，两个新码 `no-history` / `no-signal` 全部带可执行见证）；模块注册 文件 110 / 命名空间 118 / 装载期边 23 / 硬边 0 / 调用期引用 44；测试文件面 84 文件 / 79 锁 / 孤儿 0；九道独立门禁全绿；四本台账 version=2.100.0。
- [ ] canon / 原著对位未覆盖（如实留在清单）：**UI 层未做实机验证（如实登记）**：本版新增的三个面板控件与两枚「按号」入口住在 `ui/panel.js`，而它**在无头回归里不装载**——`node tests/run.js` 全绿只证明无头环境下模块间契约成立（绑定在场、零幽灵引用由静态门禁覆盖），**不代表浏览器里点得动**。**不做**「偏离原著」的自动判定（本面只回答「撞上了什么、证据是什么」——判不判偏离是人的事）；对位粒度是**题名级**（原著正文不入存档 ⇒ 正文级对位本就不可能）；题名不足 4 字标 `thin` 且不参与对位（两字题名在长篇里的假命中率极高）；规模上界如实生效（每源 24 行 / 总 48 行，超了报 `truncated` 不静默截）；平手取幕号小者（口径写死，不是随机）；对位结果**不落盘**、不进注入源（它是「问一句答一句」的读数，不是世界状态）。
- **本版两条自纠（记录以免后人「修回去」）**：① `evidence` 是**重叠**二字窗，`join('')` ≠ 原短语 —— 最初的 `evidence.join('') === 短语` 从出生起就是**恒假判据**；② `coordOf` 的界是 `LIMITS.MAX_ACTS`（号本身的合法域）**不是幕数**，`coordOf(99)` 合法返回 `A99`。
- **收口期实测抓到的跨版本污染一处**：v2.100.0 新增的拒收码见证段在 `finally` 里漏还原 `canon`（它开场自己写过）⇒ 残留的 `canon.outline.acts` 被 `store.sizeAudit` 判为 `unbounded`，连带 v2.82.0 的 [N3] 与一条健康分基线判据变红。修法：见证段还原清单**对着写入清单**核对（`keepCanon` 快照 + `finally` 无条件还原）。

## v2.101.0 跨插件互操作验收面（第五十八面 · 版本 A 的 A1 = O11）
- [x] 验收（interop，v2.101.0）：专锁 `tests/interop-v2101.js` **51/0**（A 静态面 A1–A6 / B 运行时 J1–J11 / C 不变式 C1–C2 / N0–N15 负控制，14 个真源码破坏锚点各恰中 1 次，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」+ 判据纯度前置检查）；全量回归 `node tests/run.js` → **8627 / 0**（v2.100.0 基线 8576/0）；出口面契约 `ns= 108 members= 678 chars= 8147`（+1 命名空间 / +6 成员，`FROZEN2800` 与 `EC2430` 已逐字回填）；清册面 refs **2587** / 命名空间 114 / 成员 **1322**；死子面 dead 445 / uiDead 4 / dataOnly 167（新增 `interop.probePartner` 一处，`self-only` 如实登记）；拒收码 **356**（本版零新增）；模块注册 文件 111 / 命名空间 119 / 装载期边 23 / 硬边 0 / 调用期引用 44；测试文件面 85 文件 / 80 锁 / 孤儿 0；九道独立门禁全绿；四本台账 version=2.101.0。
- [x] 内容：① `engines/interop.js`（新模块，纯读）——三伙伴（宿主 / LonSha / RubyPhone）**封闭五态**（`ready` / `partial` / `absent` / `incompatible` / `unknown`）分列，`probePartner` / `probeAll` / `freeze` / `compatGaps` / `summaryText` / `stat`，探测一律**委托既有真源**、**不新增第二套真源**；② `theme.separation()` 两处失真修复（LonSha 恒 `unknown`、RubyPhone 写死 `present:false`）；③ 消费侧两枚面板入口 + `secInterop` 采集节；④ 协议冻结面（三桥 id/version/direction/duty + 两表拒收码 + 诊断节键；`diagSections` 每键必须真是 `toolDiag.collect()` 的键）。
- [x] 产品侧真缺陷一处（收口期全量回归抓到）：`compatGaps.oldConfig` 读 `WA.settingsBus.orphanSettingsKeys()`（真源在 `WA.store`）⇒ `ReferenceError` 被 `try/catch` 吞成 `-1`，**恒报「-1 个幽灵键」**。发现路径是「出口面契约：悬空引用为零」把文件与行号点了出来；修后实测 `0 个幽灵键`。
- [ ] 未覆盖（如实留在清单）：**UI 层未做实机验证**（`ui/panel.js` 在无头回归里不装载，两枚入口只由静态门禁与专锁静态面覆盖，须实机复核）；**三插件缺席 / 部分接入 / 版本不兼容三态的实机联调**本轮只到「可判定的读数与冻结面」，真机联调记录由 C5（X13）承担；`freeze()` **不做**协议协商与版本迁移器；`unknown` 的**重试策略**不在本版。
## v2.102.0 性能基线与分层增量（第五十九面 · 版本 A 的 A2 = O12）
- [x] 验收（perf-trace，v2.102.0）：专锁 `tests/perf-trace-v2102.js` **88/0**（A 静态面 A1–A7 / B 运行时 J1–J22 / C 不变式 C1–C4 / N0–N26 负控制，25 个真源码破坏锚点各恰中 1 次，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」+ 判据纯度前置检查 + 锚点工具两向自证 + N5「破坏必须真的替换掉锚点」）；`tests/settle-v2830.js` **55/0**；`tests/orphan-lock-v2750.js` **pass**；全量回归 `node tests/run.js` → **8715 / 0**（v2.101.0 基线 8627/0，+88）；出口面契约 `ns= 109 members= 694 chars= 8296`（+1 命名空间 / +16 成员 / +149 字符，`FROZEN2800` 与 `EC2430` 已逐字回填）；清册面 refs **2631** / 命名空间 **115** / 成员 **1349**；死子面 dead **454** / uiDead 4 / dataOnly **169**（新增九口 `self-only` 如实登记，另三口 `slots`/`baseline`/`curveAll` **接了面板真消费方故不在死面**）；拒收码 **362**（见证 **124** / 死表 5 / 基线 233，六个新码全部带可执行见证）；模块注册 文件 **112** / 命名空间 **120** / 装载期边 23 / 硬边 0 / 调用期引用 44；六道独立门禁全绿；三本带版本同源判据的台账 version=2.102.0。
- [x] 内容：① `engines/perf-trace.js`（新模块，27 导出，**纯内存观测**）：四个观测面全部委托既有真源（`render.visibilityStat()` / `toolDiag.collect()` / `canon.alignView()` / `render.buildWorldSnapshot()`），本面只负责**计时、指纹、复用**；分层耗时 P50/P95 + 峰值 + `subTick`（不用平均值——本仓墙体时钟只精到 1ms，「低于精度」与「真很快」会被平均值混成一档）；四类耗时分列（`local`/`serialize` 可自量，`host`/`render` 由外部上报，**未上报即 `declared:false`、不写成 0ms**）；四档基准（`short`/`medium`/`long`/`lowend`，lowend 标 `approx:true` 并明写「真机读数须实机」）。
- [x] **增量的真生产者（本版补的一处硬缺口）**：上一版把「增量」全押在**调用方声明的脏集**上（`mark()` 是唯一生产者），而本仓**产品侧零调用点** ⇒ 热启复用率恒 0、「增量计算」在产品里只是一句标语。本版把**世界步进序号**接成真生产者：`WA.store.get().meta.stateRev`（`core/store.js` 每次落盘 `stateRev = (__seenRev||0)+1`，随存档 persisted ⇒ 跨会话可读），新增 `partial()` 按**每一面自己的输入**（世界步进）决定重算还是复用 —— 粒度在面、不需要任何人声明。指纹仍**复用** `timeline.hashText`（不新造第二份真源）。
- [x] 三条口径（都是本版实测确立的否定式）：① **读不出来一律重算**——输入不可读（store 缺席 / 未落过盘 / 抛错）时绝不拿上一轮的值冒充命中；② **不硬抽「源→依赖」声明表**——空世界下有些源根本早退（不碰 store），隐式依赖在代码里，硬抽出来就是新造第二套真源；③ **增量必须有自己的生产者**，只在测试里活的「增量」不算交付。
- [x] 两处真消费方（**无消费方不挂**）：面板工具页三枚出口（性能面 / 基准面 / 增量面 —— 增量面在无写入时应当一次活都不干）；诊断 `secPerfTrace` 节（`incremental: {rev, calls, reused}`；**本节目不触发基准**——「看一眼体检」不等于「跑一轮全量」）。
- [x] **收口期实测抓到的六处真缺陷（全部留痕）**：① 拿**产物真假**判「模块在不在」——空世界下 `buildWorldSnapshot()` 合法返回**空串**，被记成 `absent`（修：判**装配**，`ready()` 谓词）；② 拿**带计时的整行**判缓存一致性——两次毫秒数必然不同 ⇒ 判据**恒假**（修：比**产物指纹**，并在分歧时再独立算一遍分诊 `stale`/`volatile`）；③ 分诊**方向写反**（修：两遍现算一致 ⇒ `stale`；不一致 ⇒ `volatile`）；④ 缺席也记一笔 0ms（该层 P50 被「没跑」稀释成「很快」）；⑤ `coldStart` 用 `{force:true}` 不写缓存 ⇒ 紧随的热启复用率恒 0，而面板冷/热并排显示，会被读成「缓存压根没用」（修：`{dirty:true, force:true}`）；⑥ **增量探针的顺序依赖**——存档跨实例持久，上一次运行的残留让「未落盘」那一步不可复现（修：探针自己构造「内存态无 stateRev」这一**同一形态**的输入，并自我还原）。
- [x] 负控期间抓到两条**判据自身的假绿**（比缺陷更值钱）：① 破坏打偏 —— 锚点只覆盖 `value` 那行，`rev` 仍取 `m.stateRev` ⇒ 破坏**打不中判据**（负控制必须以「破坏后判据真现形」为准，不是「破坏后源码变了」为准）；② 不可读时**第一次**因为走 `force` 顺手写了槽，第二次才是真考验 —— 只读一次时「读不出来也照样按指纹走」这个破坏照样全重算，判据抓不到（修：连读两次）。
- [ ] 未覆盖（如实留在清单）：**UI 层未做实机验证**（`ui/panel.js` 在无头回归里不装载，三枚出口只由静态门禁与专锁静态面覆盖，须实机复核）；`canonAlign` 的**幕表住在设置侧、不在 `stateRev` 里** ⇒ 单改幕表而世界没落盘时该面**不会**被判脏（要它重算须显式 `mark('canonAlign', …)` 或走 `force`）；`lowend` 档是**同机放大估计**（无头环境不可真测真机，读数带 `approx:true`）；`host`/`render` 两分列**本面无上报面**（由外部调用方上报，未上报即如实说「未上报」，不写成 0ms）；历史曲线是**有限窗口**（64 样本，挤出即 `dropped++`），**不做**落盘持久化；本面**不驱动**任何被观测面重建（只读/只计算）。
- [x] A3（O16 维护工具与 UI 运行质量）**已交付（v2.136.0）**。两件真事：① `tests/toolchain-gate.js` 把 README「tools/ 的取舍」那句「只有被可执行代码引用才入库」从**没人执行的规则**变成真判据（此前 `tests/product-files.js` 的 `SKIP_DIRS` 把 tools/ 整个排掉，名单/个数/引用档/入口档四件事无人核）；专锁 `tests/toolchain-gate-v2136.js` **43 项**（A 结构 / B 运行时 / C 两向负控制）。② 同一把门禁抓到测试面上的真孤儿：`tests/ui-gate.js`（239 行 UI 渲染路径门禁，独立 **53/0**、含 728 个真实控件点击）从未被 `tests/run.js` 挂过，而 `tests/test-surface-gate.js` 靠一句注释里的「embeds … verbatim」把它判成 `inline` —— 「提及不是引用」在自家门禁上重演；实测该「verbatim」副本已分叉（缺 2 条 `PAGES↔RENDERERS` 静态不变式断言）。处置：run.js 子进程**真跑**它并钉读数。③ 门槛侧另抓出两条真缺口并处置：`tools/diag_inject_v2860.js` 写死 `/tmp/wa_git/...` 绝对路径 require（候选树里会 require 到别的仓库）⇒ 改相对路径；`tools/patch_o17_v2104.py` 违反 README 自述判据 ⇒ `git rm --cached`，索引 15 → 14。**本版已登记一处与 O16 直接相关的现场发现**：`tests/run.js` 的 H4 块（UI 绑定守卫的真 DOM 端到端断言）依赖 `require('jsdom')`，取不到时只打印 `⚠ jsdom 不可用，跳过块8 端到端断言（静态锚点已覆盖）` 便**静默放行** —— 「缺依赖 ⇒ 静默 skip ⇒ 门禁全绿」正是 O16 要治的病，本会话只做发现与登记，未改动。

## v2.103.0 可选依赖可见性（第六十面 · 版本 A 的 A3 = O16 第一刀）
- [x] 验收（dependency-guard，v2.103.0）：专锁 `tests/dependency-guard-v2103.js` **29/0**（A 静态面 A1–A10 / B 运行时 B1–B10 / C 不变式 C1–C3 / N1–N6 负控制，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」，A7「零裸回退」为主判据）；全量回归 `node tests/run.js` → **8753 / 0**（v2.102.0 基线 8715/0，+38）；出口面契约 `ns= 109 members= 694 chars= 8296`（**逐字未变**——本版全部落在 tests/ 侧，产品面零扩张）；清册面 refs 2631 / 命名空间 115 / 成员 1349；死子面 dead 454 / uiDead 4 / dataOnly 169（**零新增**）；拒收码 **362**（见证 124 / 死表 5 / 基线 233，**三者全不变**）；模块注册 文件 112 / 命名空间 120 / 装载期边 23 / 硬边 0 / 调用期引用 44；六道独立门禁全绿；三本带版本同源判据的台账 version=2.103.0。
- [x] 内容：① `tests/dependency-guard.js`（新模块）——可选依赖的**单一真源**：`OPTIONAL_DEPS` 登记每个可选包的 reason / fallback / fallbackProof / affects / siteNeedle；三档可见性 `TIERS={full,fallback,missing}` 由 `probe()` 给出；`resolve()` **纯只读**（先可移植 `require`，再临时安装回退，不写产品面）；`registry()` 返副本防调用方改写；`scanFallbackSites()` 与 `isBareFallback()` 给出成类判据——**「有 try 无替身」才是缺陷**（依赖到位时 `require(...)` 行本来就应当存在，不能拿它当缺陷）。② `tests/ui-dom.js` **增强**：新增 `ensureHook` / `makeDoc` / `JSDOMShim`，后者与 jsdom **同形**（`new JSDOMShim(html,{url})` → `{window:{document,Node}}`，支持从 `<body>` 提取内层 HTML，`window.Node` 给可辨识占位而非 `undefined`，避免下游 `typeof Node` 判据误判）。宿主取法为「优先 `global.WorldAxis`，否则退到自建挂点 `global.__WA_SHIM_HOST__`」——**替身自身不得被绑上「宿主必须先就绪」的隐式前置**，否则专锁在隔离环境里根本跑不起来。③ `tests/run.js`：**10 处** jsdom 静默跳过点全部改造，在原 `try` 取真货之后插入 `if (!X) X = require('./ui-dom.js').JSDOMShim;`，并把静默跳过分支改为 `assert(false, ...)`（**块体逐字不动**，最小侵入可逐块对照）；新增 section「v2.103.0（A3 = O16）：可选依赖可见性」打印三档标签并调专锁。④ `tools/patch_o16_v2103.py` / `tools/patch_o16_wire_v2103.py` / `tools/bump_v2103.py` / `tools/bump_run_ver_v2103.py`（四枚补丁脚本，先落盘再执行，锚点命中数逐项预检）。
- [x] 病灶的真实形态（本版立足点）：**门禁结论与覆盖范围脱钩**。10 处依赖缺失时那些块**一条不跑**，回归照样打印「全部测试通过 ✓」，而 pass 计数**更低**——没有任何一处会告诉你「本次绿灯比上次少跑了 N 条断言」。这不是「少覆盖一块」，是**绿灯本身不可信**。解药不是让 jsdom 成为必需（本仓零 npm 依赖，强求即等于在别人机器上门禁全废），而是让这 10 处改走**仓库自带的零依赖替身**。
- [x] 四道零依赖验证：① 真探针实测 mini-DOM 装载 `ui/panel.js` + `ui/settings.js` → `pages=14 / tabs=14 / onclick=function / secUi().totalMissing=0`；② **仅走替身路径**（不装载 jsdom）同样成立（`SHIM_ONLY_PATH_OK`）；③ 专锁 29/0；④ 全量回归同源连跑两次均 **8753/0**（排除偶然通过）。
- [x] **收口期抓到的真缺陷三处 + 一处既存 flaky（全部留痕）**：① `resolve()` 里写了裸 `/tmp` 字面量 ⇒ 撞 v2.41.0 成类静态锁（修：`process.env.TMPDIR || os.tmpdir()`，**不写字面路径即不进豁免机制**）；② 新模块无人 `require` ⇒ 孤儿（修：由新 section 真消费）；③ `module.exports = { runAll: require('./lock-assert.js').from }` 写法有误（`from` 是工厂需传断言函数）⇒ 修 `runAll`；④ **`tests/run.js:7285` 的健康分判据是补丁前既存的 flaky**——`git stash -u` 基线对照实测同样报 8714/1 且失败项完全相同，证明与 O16 无关。根因实测为**跨两次独立巡视比较绝对分**：两次 `maintain({deep:true})` 之间另有动态扣分项在变（`hygiene.reclaimable` / `diag.budget` / `concurrent.*`），同源同输入的两次运行分别给出 `m1 = base + 6` 与 `m1 = base − 2`——同一判据两种结论，即 flaky 的定义。**处置**：改用**等价判据**——`core/store.js` 中 `score -= Math.min(6, purifyRuleErrors*2)` 与 `issues.push({key:'engine.purifier'})` 写在同一 `if` 分支内且无提前 return，故「议题按异常笔在位」⇔「扣分真计入」；另配静态同分支守卫（删扣分行留议题也报红）与一条负控制（真源码破坏自证非恒真）。
- [ ] 未覆盖（如实留在清单）：**UI 层仍未做实机验证**（`ui/panel.js` 在无头回归里不装载）；`JSDOMShim` 只覆盖 10 处断言实际用到的 API 面（`createElement` / `getElementById` / `querySelector(All)` / `innerHTML` 解析 / `dataset` / `appendChild` / `textContent` / `Node`），**不追求 jsdom 全兼容**——超出用到的面即如实抛错（响亮失败优先于静默错答）；`affectedSites` 计数是**静态扫描值**，与运行时真跑分支数可能不一致（本版只断言 ≥10）；O16 余下部分（UI 运行质量、维护工具）未做。

## v2.104.0 负控制锚点的自动化审计（计划一 #2）
- [x] 验收（negative-control-audit，v2.104.0）：审计面 `tests/negative-control-audit.js`（新模块）＋专锁 `tests/negative-control-audit-v2104.js` **49/0**（A 静态面 A1–A13 / B 运行时 B1–B13 / C 不变式 C1–C3 / N0–N8 负控制，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」+ 锚点工具两向自证）；全量回归 `node tests/run.js` → **8806 / 0**（v2.103.0 基线 8753/0，+53）；出口面契约 `ns= 109 members= 694 chars= 8296`（**逐字未变**——本版全部落在 tests/ 侧，产品面零扩张）；死子面 dead 454 / uiDead 4 / dataOnly 169（**零新增**）；拒收码 **362**（见证 124 / 死表 5 / 基线 233，**三者全不变**）；模块注册 文件 112 / 命名空间 120 / 装载期边 23 / 硬边 0 / 调用期引用 44；测试文件面 **90 文件 / 85 锁 / 可达 90 / 孤儿 0**；六道独立门禁全绿；三本带版本同源判据的台账 version=2.104.0。
- [x] 本版审计读数（`discover()`）：**锁 62（统一 10 / 非统一 51 / 装载不了 0 / 装载中 1）· 被审锚点 104 条 · 问题 0 条**（入口运行时）。被 run.js require 后运行时 `pending` 为 0（同一文件两种运行态的差异**被显式断言**，见 B11/N8）。
- [x] 内容：① `tests/negative-control-audit.js`（新模块，9 导出）——把「锚点的静态性质」收敛成**一次全仓审计**：`KINDS` 四档形态（`uniform` / `non-uniform` / `unloadable` / `pending`）、`PROBLEM_KINDS` 六类（`shape` / `rel-unreadable` / `not-unique` / `impure` / `not-a-lock` / `empty-anchors`）、`hits` / `isLock`（用**段名** `function runNegative(` 而非行号，免顺序依赖）/ `listTestFiles` / `auditAnchor` / `auditLock` / `audit` / `discover`。② **判据纯度口径与 `tests/interop-v2101.js` 的 N15 逐字同源**（`a.txt.replace(/\n/g, '\\n')`）：`txt` 是解转义后的真文本，源码里是转义形态——**不另立第二套口径**。③ 两条否决式口径（与 v2.103.0 的 O16 同族）：**零命中不得算通过**、**装载失败不得静默跳过**。④ `tests/run.js` 新增 section 真消费两个新模块（打印四档读数 ⇒ 不是孤儿）。
- [x] 病灶的真实形态（本版立足点）：本仓每版手写 25+ 条破坏锚点，而「锚点是否唯一」「判据里有没有抄锚点串（自我指涉）」这些性质此前**只有各锁自己在运行时自查一遍**。后果两条：① 口径散落在 **61** 个 `runNegative` 里——改一处口径只管一把锁；② 谁都没统计过「全仓到底有多少把锁的负控制是**可静态审计**的」——「不可审计的那部分」从来不是一个可读的数字，于是它**等于不存在**。本版把它变成可读的四个数。
- [x] **本版三处「自己身上的」真缺陷（全部留痕，且都是它要治的那族病）**：① **D1 require 环**——本锁作入口 → 审计模块装载中 → `audit()` require 回本锁（in-flight）→ 读到尚未完成的 exports（`ANCHORS` 为 `undefined`）⇒ 本锁被**静默归进「非统一」档**、Node 打 4 条 circular 警告，且**归类结果取决于谁先装载**。处置：**加第四档 `pending`**（`require.cache` 里存在且 `loaded !== true` 即如实记档），既不静默跳过也不误判成 unloadable；并加 B11（两种运行态分别断言 `pending=1 / 0`）与 N8（往 `require.cache` 塞 `loaded=false` 条目，破坏版实测被静默编进「非统一」且**零问题上报**）。② **D2 锚点形态**——初版把 `ANCHORS` 导出成**纯字符串**，而仓库统一口径是 `{rel, txt}`；若真被归入统一档，审计会如实报 3 条 `shape`——**那不是误报，审计是对的**（A10 钉住这一点）。③ **D3 纯度口径的结构性边界（H7）**——含**非换行反斜杠**的锚点做不了统一锚点：源码里必须写成两个反斜杠才不丢字符，而纯度判据只把真换行还原成转义形态、不还原前者 ⇒ 必然 0 命中 ⇒ 被判 `impure`。处置：这类锚点改为**按行前缀现场抓取**（`lineWith(src, needle)`——不手拼字面量 ⇒ 本文件根本不存在整体形态 ⇒ 纯度天然满足）。
- [x] **口径踩坑（误报比漏报更费事）**：审计探针首跑报 17 处「字面量在本文件出现 0 次」——是**我的口径写错**（拿解转义后的真文本去 split 单行源码，多行锚点必然 0 命中）。改用转义口径后 **0 问题（10 锁 / 104 锚点全健康）**。教训：**误报会让一把健康的锁看起来坏了**；口径必须与既有实现逐字对齐，不能凭直觉写。
- [ ] 未覆盖（如实留在清单）：**只覆盖导出 `ANCHORS` 且形态统一的锁**（10/62）——其余锁的锚点住在各自的局部变量里（如 `const ANCHOR_ROW = '…'`），静态无法可靠提取；本模块把三（四）个数**都报出来**，**不假装覆盖了全部**。不做**运行时**的锚点复核（本面纯静态）；不做跨版本锚点漂移比对（只答「此刻准不准」）；`PROBLEM_KINDS` 不含「锚点过期」（那需要另一份历史基线）；**UI 层仍未做实机验证**（`ui/panel.js` 在无头回归里不装载）。
- **本版确立的可复用判据（编号续 R86）**：(60) 反斜杠锚点只准现场拼接（手拼必差字符，且纯度结构性不可满足）；(61) 「正在装载中」必须是独立可读的一档——否则归类依赖运行顺序；(62) 审计旁证要能被观测（把 Node 的 circular 警告收成断言，既不污染回归输出又证明守卫不是摆设）。

## v2.105.0 门禁超时熔断（计划一 #3）
- [x] 验收（gate-timeout，v2.105.0）：取值面 `tests/gate-timeout.js`（新模块）＋专锁 `tests/gate-timeout-v2105.js` **53/0**（A 静态面 A1–A16 / B 运行时 B1–B13 / C 不变式 C1–C2 / N0–N10 负控制，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」+ 锚点工具两向自证）；全量回归 `node tests/run.js` → **8867 / 0**（v2.104.0 基线 8806/0，**+61**）；出口面契约 `ns= 109 members= 694 chars= 8296`（**逐字未变**——本版全部落在 tests/ 侧，产品面零扩张）；死子面 dead 454 / uiDead 4 / dataOnly 169（**零新增**）；拒收码 **362**（见证 124 / 死表 5 / 基线 233，**三者全不变**）；模块注册 文件 112 / 命名空间 120 / 装载期边 23 / 硬边 0 / 调用期引用 44；测试文件面 **92 文件 / 87 锁 / 可达 92 / spawn 4 / 孤儿 0**；dup-decl 扫描 211 文件 / 顶层声明 2390 / 重复 0；六道独立门禁全绿；三本带版本同源判据的台账 version=2.105.0。
- [x] 本版读数（`discover()`）：**现场调用点 10 / 武装点 10 / 预算处 10（三者相等）· 统一预算 96000ms · shell 保险丝 240s · inline 上限 10800ms · 形态 {spawn 8, spawn+shell 1, spawn-only 1} · 自洽（一套预算）· 对照门禁 11 道（含 1 条对照）**。
- [x] 阈值口径（**否决计划原文的 3s / 20s / 5s**）：先实测、再定阈值。本版实测 —— `export-contract` 568~595ms · **`dead-export-gate` 12022~13001ms（本仓唯一 10s 级门禁）** · `module-registry-gate` 160ms · `field-liveness-gate` 402ms · `reject-code-gate` 361ms · `test-surface-gate` 683ms · `dup-decl-gate` 511ms · `isolated-runner-lock` 2721ms · `inventory --json` 605ms · `tar --exclude=.git` 96ms · `node --check tests/run.js` 120ms。计划里的「export-contract 3s」只有 **5 倍**余量；「全量 20s」与实测 **6~8 分钟**差一个量级。⇒ 预算统一取「**最重那道门禁的实测 × 8**」= **96000ms**（对 0.16s 的门禁是余量过剩——过剩是安全的，紧贴不是）。
- [x] 内容：① `tests/gate-timeout.js`（新模块，24 导出）——「门禁超时」的**单一真源**：`GATE_TIMEOUTS{spawnMs:96000, shellMs:240}` / `RATIOS{spawn:8,inline:4,heavy:4}` / `ARMED_SITES`（10 条：key + **现场唯一锚点** + mode + kill + shellFuse + pipe）/ `GATES`（11 条实测证据）/ `coherence()`（不许两套预算 + 站点表与武装表不许各说一套 + **含管道必须有保险丝**的客观规则）/ `spawnOptsFor` / `withTimeout` / `tailLines` / `formatHangBlock`（卡死取证块：哪一道门禁、超了多少、末 N 行 stdout）/ `parseCallBlocks`（**括号平衡**切块，先剥字符串字面量——tar 那句的命令串里有个永不闭合的 `(`）/ `findSiteBlock` / `siteStats`。② `tests/run.js`：**10 个 spawnSync 调用点全部武装 `timeout: 96000`**（出口 5 处另给 `killSignal: 'SIGKILL'`；tar 那句改写成 `timeout -k 5 240 tar …`——**必须带 `-k`**，因为它在管道里，不带给宽限只会杀写端而读端照挂；`node --check` 处如实记档 `spawn-only`：spawnSync 的 timeout 只覆盖 `node` 本身，**读文件读到一半的阻塞不可中断**），并新增 section 打印现场读数 + **逐站点**核对 + 调专锁。③ `tools/patch_v2105_a/b/c/d.py`（取值面预算统一 90000→96000；run.js 8 处武装 + tar 改写 + --check 注释；tar/--check 两处补武装；模块补站点锚点表与解析器）、`tools/fix2105_d.py`（还原占位符替换的连带伤害）、`tools/sec2105.py`（接入 run.js）、`tools/bump_v2105.py` / `tools/bump_run_ver_v2105.py`（升版）、`tools/doc_v2105.py`（本文档）。
- [x] 病灶的真实形态（本版立足点）：**兜底存在≠风险被看见**。此前 run.js 唯一兜底是外层 `isolated-runner` 的 10 分钟 SIGKILL，而全量回归实测 6~8 分钟 ⇒ **余量不足一倍**；被强杀时日志里只剩一行 `Status: runner-failed`：「卡在哪一道门禁、卡死前最后说了什么」**全部丢失**。故本版的判据不是「加了 timeout」，而是把三件事变成**可判定的读数**：预算值、现场调用点数、以及卡死时的取证块。
- [x] **本版自测期连撞的五类「自己身上的」缺陷（全部留痕，且都是它要治的那族病）**：① **D1 定位口径**——专锁初版拿模块里的 key 去 run.js 定位站点，而那些 key **只活在模块里**、run.js 一个字都没有 ⇒ 十处全报 `site-missing`、判据从第一天起恒假。正解：用 run.js **现场唯一**的调用行行首片段作锚点，且**逐站点**判断（「别处还有 timeout」不构成该站点已武装——专锁里用 N1b 专门证明全局存在性口径会漏报）。② **D2 破坏不彻底**——`str.replace(a,b)` 在 JS 里只替换**第一处**，于是「10 处预算全改成 10ms」实际只改了 1 处，区间判据只现形 1 条 ⇒ 断言恒假。正解：`split/join` 或带 `g` 的正则，并把「破坏是否真发生」也数出来。③ **D3 标签依赖**——「外部命令要另有 shell 保险丝」原先看的是 `mode === 'spawn+shell'` 这个**标签**，把标签抹平（`mode→'spawn'`）判断就**无声逃逸**；而模块头自己写着「口径是行为读数，不是字形比对」。正解：看**客观形态**（命令串里有没有管道），专锁 N4 在破坏副本上验证这条规则真会现形。④ **D4 观察位取窗口**——选项探测必须在**调用点之后的整个块**里取，不能只看固定几行（本仓三个调用点带跨行注释，options 落在调用行之后第 11~12 行；取窗口的判据会在**真源码上假红**）。⑤ **D5 锚点包含被测值**——`negative-probe-v2410` 那一行初版把整行（含 `timeout: 96000`）当锚点 ⇒ 一旦预算被改动（**正是本锁要守的东西**）锚点先失效、报出来的是 `site-missing` 而不是 `value-mismatch`：判据被它要抓的破坏顺手打掉了（自我指涉）。正解：锚点截到 options 之前。
- [x] **一处工具级教训（补丁工程）**：补丁 D 用「全局 `str.replace` 还原占位符」把 `TIMEOUT` → `timeout: `，结果**把标识符当前缀一起换了**——`GATE_TIMEOUTS` → `GATE_timeout: S`、`TIMEOUT_ARMED` → `timeout: _ARMED`，并让正则里的 `\(` 变成裸 `(`（`node --check` 立刻报 Unterminated group）。且修正时**手写的期望计数是错的**（写 11/9，真值 8/10）——守卫拦下了这次错误。教训两条：**占位符必须带界符或用行级重建**；**期望计数一律实测取得，不写在纸上**。
- [x] **一处收尾期附带自纠（路径真伪）**：三个一次性补丁脚本（`patch_v2105_d.py` / `fix2105_d.py` / `sec2105.py`）执行完实际落在 `/tmp`，而文档把路径写成了 `tools/`——**文档指向了不存在的位置**。已按 v2.104.0 对一次性脚本的入库口径归档进 `tools/`，并把「**文档点名的一次性脚本必须实存**」立为收尾判据（`tools/seal_check_v2105.py` 第 9 组）。这与本版主命题同源：**读到的数（这里是路径）必须是现场真值**。
- [ ] 未覆盖（如实留在清单）：**强杀只对「直接子进程」负责**——`detached:true` 可用 `kill(-pid)` 整组杀（实测 200ms 后已死），未 detach 时 `kill(-pid)` 返回 `ESRCH` 杀不掉、只能 `kill(pid)`，**孙进程不在覆盖内**；本仓十道门禁源码**零 spawn**（唯一例外 `test-surface-gate.js` 的宿主残骸探针，走 spawnSync 且自限），故「直接子进程被杀 ⇒ 门禁停摆」在本仓成立——这条边界由专锁显式钉住，**不许被「我们已经保险了」这句话盖过去**。`node --check` 的 `spawn-only` 形态同上（读盘阻塞不可中断，如实记档）。`withTimeout` **无法打断同步探针自己**（JS 单线程）——它抓的是「每次 `fn()` 之间的墙钟间隔」，抓不了「`fn` 自己转 10s 不返回」，后者的保险丝只有父进程强杀。预算值是按**当前实测**定的（最重 12~13s × 8）：若未来出现更重的门禁，`coherence()` 会报 `two-spawn-budgets` 强制重定，但**余量本身不会被自动调大**（那是另一个问题）。**UI 层仍未做实机验证**（`ui/panel.js` 在无头回归里不装载）。

## v2.106.1 硬读数回填入口补作（计划一 #4 收尾：把 v2.106.0 如实留账的那一项补上）
- [x] 验收（readings，v2.106.1）：取值面 `tests/readings.js`（**18 导出**，+`labelSites`）＋专锁 `tests/readings-v2106.js` **58/0**（A1–A16 / B1–B14 / C1–C2 / N0–N12 含新增 N9d/N9d-1/N9d-2/N9e/N9f/N9g）；全量回归 `node tests/run.js` → **8931 / 0**（v2.106.0 基线 8925/0，**+6**，正对应新增判据数）；出口面契约 `ns= 109 members= 694 chars= 8296`（**逐字未变**——本版仍全部落在 tests/ 与 tools/ 侧，产品面零扩张）；死子面 dead 454 / uiDead 4 / dataOnly 169（零新增）；拒收码 362（见证 124 / 死表 5 / 基线 233，**三者全不变**）；专锁 58/0；密封校验 `tools/seal_check_v2106_1.js` 全绿；三本台账 version=**2.106.1**。
- [x] 病灶（为什么有这一版）：v2.106.0 把 #4/#5/#6 三面收口做完了，但在文档里**如实留账**了一条——#4 原文点名的 `tools/sync-hardcoded.js` 薄壳 CLI **未落盘**（回填能力已在模块内、且被 N9/N9b/N9c 覆盖，但独立入口没做）。本版把它补上，**不重做已交付的事**。
- [x] 内容：① `tools/sync-hardcoded.js`（新，**本文件不做判断**——全部判据住在 `tests/readings.js`）：默认 dry-run 逐族列出「从什么改成什么、涉及哪几个站点」；`--write` 才真写盘，且**写前复判**（改写后全文交给 `coherence`/`backfillPlan` 必须零问题）＋**写后校验**（磁盘字节重跑判据）＋**失败回滚**；`--json` 机器可读输出。② `tests/readings.js` 升级：新增 `labelSites(src, field, opt)`（导出面 17 → **18**）；`backfillPlan` 增报 `labels`；`backfill` 增 `message-drift` 拒绝并**同批改消息副本**；`sites()` 保留现场**原始字段名** `raw`（`dead.length` vs 族名 `dead`），`backfill` 用 `s.raw || s.field` 重建正则；`labelSites` 加 `opt.lines`（只统计**包含这些行号的断言块**）。③ 专锁补 B14（每个读数族在真源码上都有消息副本可定位，防空集恒真）与 N9d/N9d-1/N9d-2（回填真把消息副本一起改了）/ N9e（消息已漂移则拒绝）/ N9f（带 `.length` 后缀的 dead / uiDead / dataOnly 三族也能回填）/ N9g（回填不碰别处历史叙述）。④ `tools/bump_v2106_1.js`（同批升版）+ `tools/seal_check_v2106_1.js`（10 组密封校验）。
- [x] **端到端证据（本版的核心验收）**：先把 7 个站点做一次「**完全一致注入**」（比较值与**同块**消息副本同批改成同一个错值）⇒ `coherence` 只剩 2 条 `stale-reading`（内部自洽、与现场不符）；再 `node tools/sync-hardcoded.js --write` ⇒ `WRITTEN（写后校验通过）：refs :2620->2631（3/3 站点） · dead :455->454（4/4 站点）`，回填后的 `tests/run.js` 与干净基线**逐字相同**（md5 `e4aa0877f4e5f258773f9b3e5bcecc60`）——**回填真能把旧状态精确换回去**。四条拒绝路径均实跑：`message-drift`（只改比较值不改消息）/ `multi-value`（同族多值）/ `already`（已是真值）/ `no-site`（零站点），**一条都不静默放过**。
- [x] **本版在端到端验证里撞到的三个真缺陷（全部留痕，且都是它要治的那族病）**：① **回填只改比较值、不改消息副本** ⇒ 会撞上 #6 自己的判据（正是 v2.81.0 形态）；修法是同批改 + `message-drift` 拒绝（理由与 `multi-value` 同：无法知道哪个是错的，回填会把第二个错盖在第一个错上）。② **回填用归一化族名重建正则**，而站点字段名带 `.length` 后缀 ⇒ `dead` / `uiDead` / `dataOnly` 三个族**静默 0 命中**（`refs` 能改、这三个族永远改不动）；修法是保留现场原始字段名。③ **`labelSites` 全文件扫标签会捞到历史叙述里的旧读数**（实测 13628 行 `dead 208` / `refs 1950`、3989 行 `命名空间 120` 等多处），回填它们等于**篡改历史**；修法是只统计与站点**同块**的副本（口径与 `messageChecks` 同源）。另有两处自纠：B14 又把族名当字段名（本仓第三次重复同一处绕层错）、N9d-2 我的替换逻辑丢了标签前缀（`dead 111` 被算成 `d222`）。
- [x] 本版确立的可复用判据（编号续 R89）：(75) **回填的观察位必须与判据同源**——全文件扫标签会把沿革记录当读数副本，只有同断言块内的才算法定副本；(76) **族名 != 字段名**——映射的**入参空间**（`dead`）与**出参空间**（`dead.length`）不能混用，两处静默 0 命中都是这个错；(77) **回填必须同批改比较值与消息副本**——只改一处会与自己的判据相撞（本版把它从「纪律」变成可调用判据 `message-drift`）。
- [ ] 未覆盖（如实留在清单）：`readings.js` 仍只认**两种登记形态**站点（其余写法未纳入，与 `negative-control-audit` 同口径）；L3（台账与提交同批）属收口期判据、不进常绿门禁；`labelSites` 的 `opt.lines` 语义是「只统计包含这些行号的断言块」，其块边界用相邻块首行号推断——若某族站点与其消息副本**不在同一 assert 块**内，该副本会被判为「不属本族」而不回填（当前 7 族实测均同块，但这是**设计上的边界**）；`backfill` 的消息副本替换取「第一个数字串」，依赖「7 套标签模式各只含一个数字串」（已逐条核过，若未来新增含两个数字的模式即失效）；**UI 层仍未做实机验证**（`ui/panel.js` 在无头回归里不装载）。

## v2.106.0 硬读数一致性三面收口（计划一 #4 + #5 + #6 合并为大更新）
- [x] 验收（readings，v2.106.0）：取值面 `tests/readings.js`（新模块，**读数族单一真源**，17 导出）＋专锁 `tests/readings-v2106.js` **52/0**（A1–A16 静态 / B1–B13 运行时 / C1–C2 不变式 / N0–N12 负控制）；全量回归 `node tests/run.js` → **8925 / 0**（v2.105.0 基线 8867/0，**+58**）；出口面契约 `ns= 109 members= 694 chars= 8296`（**逐字未变**——本版全部落在 tests/ 侧，产品面零扩张）；死子面 dead 454 / uiDead 4 / dataOnly 169（**零新增**）；拒收码 **362**（见证 124 / 死表 5 / 基线 233，**三者全不变**）；模块注册 文件 112 / 命名空间 120 / 装载期边 23 / 硬边 0 / 调用期引用 44；测试文件面 **94 文件 / 89 锁 / 可达 94 / spawn 4 / 孤儿 0**（+2：readings.js + readings-v2106.js）；dup-decl 扫描 213 文件 / 顶层声明 2429 / 重复 0；六道独立门禁全绿；三本带版本同源判据的台账 version=2.106.0。
- [x] 本版读数（`readings.discover()`）：**登记站点 23 处 / 读数族 7 态**（refs 2631 · namespaces 115 · members 1349 · dead 454 · uiDead 4 · dataOnly 169 · deadInTestsOnly 293）——**族内全同值、且逐站点等于现场实测**；台账 reject-code@2.106.0 / module-registry@2.106.0 / dead-export@2.106.0 === index.js VERSION；**待回填项 0 族**；消息观察位 0 不一致。
- [x] 病灶的真实形态（本版立足点）：**同一个读数写在 4 处、每处各带一段沿革注释**——改版漏改一处只红一处，而那条红最容易被当成「判据写错」（v2.81.0 实证：消息写 425、比较值仍是 414，报红时消息里的数字与实值相同）。#4/#5/#6 是同一族病的三个面：**读数没有单一真源**。本版把它变成可调用的三条判据：(A) 族内同值（`intra-drift`）／(B) 等于现场实测（`stale-reading`，探针真跑 `inventory.collect()`）／(C) 消息与比较值同批（`message-mismatch`），外加台账三级同源（`version-mismatch` / `note-mismatch` / `note-no-version`）。
- [x] 内容：① `tests/readings.js`（新模块）——`FIELD_OF`（7 族映射）/ `LEDGERS`（3 本台账）/ `MESSAGE_LABEL`（7 族候选模式）/ `sites` / `groups`（**两种登记站点形态** + 逐站点行号）/ `measure()`（真跑探针）/ `coherence(src, opt)` / `messageChecks` / `ledgerReport(opt)` / `backfillPlan` / `backfill`（带 `g` 全量替换；多值拒绝 `multi-value`、零站点拒绝 `no-site`）/ `versionOfIndex` / `stripLineComments` / `assertBlocks` / `labelValue` / `summary` / `discover`。② `tests/run.js`：接线 `const rd = require('./readings.js')` + 新增 v2.106.0 section（打印现场读数 + 台账读数 + 三条判据 + 逐站点带行号核对 + 调专锁）。③ 升版同批：`index.js` / `manifest.json` / 三本台账 version / `tests/reject-lock-v2780.js` 版本期望值 / run.js **8 处**版本期望锚点（比较值与消息文本**同批**改，实测行内共 14 处），并保留 3 行历史叙述字样不动。④ `tools/bump_v2106.js`（升版脚本，锚点唯一性 + 幂等保护 + 剩余字样计数三条守卫）。
- [x] **本版自测期抓到的三处「自己身上的」真缺陷（全部留痕，且都是它要治的那族病）**：① **写死读数的第二副本**——`tests/gate-timeout-v2105.js` 的 A10 断言行号区间 `>= 14790 && <= 18792`：只要在它**上方**插入任何代码（本版就在 32 行处加了 require），全部站点一起下移即假红，而它读的东西毫无变化。改为按 `gt.parseCallBlocks` 定位调用点块 + 行号严格递增（同口径）。② **锚点纯度口径只挡重复、不挡缺失**——本锁 A11 用 `> 1` 判，而 `aRoot` 是拼接式写法（`'…' + "'..'" + '…'`），拼出的整串在本文件**出现 0 次** ⇒ A11 放行、审计报 `impure`。**审计是对的**。改为 `!== 1`（并对多行锚点走转义口径，与负控制审计逐字同源，**不另立第二套口径**）。③ **台账 `_note` 追加把 `\n` 写成了真实换行**——破坏 JSON（`reject-code-gate` 直接 `SyntaxError`）。修法：锚点取 **_note 字符串内部**的段末（`…规则。",`）而不是同级的 `"version": …` 键行——**观察位取错层级**，与 D4 同族。
- [x] **两处「红但是对的」已如实区分**：① 专锁 A10 锚点 `aWire`（`const rd = require('./readings.js');`）在接线前恰中 0 次——**接线尚未落地的预期结果**，接线后自然满足（不许为了让灯变绿而删判据）；② 敏感性探针 P1（改消息实值）未现形——取证确认**探针没打中**（run.js 里不存在该串），不是判据失效；并由此补上**静态头观察位**（14726 的 `死子面 dead 454 / uiDead 4 / dataOnly 169` 此前从未被检查）。
- [x] 本版确立的可复用判据（编号续 R88）：(71) **写死读数的第二副本也是硬编码读数**——判据里的行号/范围内读数必须改成「按现场定位 + 结构不变量」，否则上方插一行就假红（A10 实证）；(72) **纯度是「恰好 1 次」**——`missing` 与 `duplicate` 都是缺纯度，只挡 `>1` 的口径会在拼接式写法上放行（N12c 两向自证）；(73) **验证判据不得改真文件**——`coherence` / `ledgerReport` 留 `opt.live` / `opt.read` 接缝，破坏只发生在**内存副本**上（否则验证者自己就成了风险源）；(74) **台账破坏锚点必须现场取版本词**——写死本版号会在升版后静默打空，而「判据太弱」与「锚点过期」在结果上长得一模一样（`mutOnce` 打空即抛）。
- [ ] 未覆盖（如实留在清单）：`readings.js` 只认**两种登记形态**的站点（`r<四位>.<字段> === <数字>` 与 `Object.keys(led<四位>.<面>).length === <数字>`）——局部变量名不同 / 跨行拼接 / 模板串 / 正则内含等写法**未纳入**，与 `negative-control-audit` 的「非统一锚点」同口径登记为未覆盖；L3（台账与提交同批、含时间差）依赖 git 状态，属**收口期**判据，**不进常绿门禁**（时钟类判据易假红）；`tools/sync-hardcoded.js`（#4 原文点名的薄壳入口）本版**未落盘**——回填能力已实现在 `readings.backfill` / `backfillPlan` 并被专锁 N9/N9b/N9c 覆盖，但独立 CLI 入口留待下一版（**未完成项留账，不伪称已交付**）。

## v2.107.0 拒收码分类完备性 + 模块依赖静态图（计划一 #17 + #20 合版，纯 tests 侧）
- [x] 验收（reject-code-coverage，v2.107.0 #17）：取值面 `tests/reject-code-coverage.js`（新模块，**6 导出**）＋专锁 `tests/reject-code-coverage-v2107.js` **59/0**（A1–A9 静态 / B1–B10c 运行时 / C1–C2 不变式 / N1–N8 负控制）；全量回归 `node tests/run.js` → **9074 / 0**（v2.106.1 基线 8931/0，+143）。
- [x] 验收（module-cycle-gate，v2.107.0 #20）：取值面 `tests/module-cycle-gate.js`（新模块，**605 行 / 19 导出**）＋专锁 `tests/module-cycle-gate-v2107.js` **65/0**（A1–A9 静态 / B1–B14 运行时 / C1–C2b 不变式 / N1–N8 负控制，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」）。
- [x] 本版读数（`reject-code-coverage.discover()`）：`拒收码 362 个（见证 124 / 死表 5 / 基线 233）· 已定性 129 个，覆盖率 35.64% · 恒等式平`；声明面 **124 个码 / 126 次出现**，重复声明 `not-bound`（186/633 行）与 `missing-fields`（190/221 行）各 2 次；`missing 0 / unexpected 0`。
- [x] 本版读数（`module-cycle-gate.audit()`）：`文件 116（解析出别名 116 / 真引用他模块 115） · 提供方 145（账本 120） · 读面 137 · 边 895（装载期 23 / 调用期 872） · LOAD_ORDER 115 · 未提供 0 · 次序违规 0 · 跨文件写 0 · 过期登记 0 · 静态漏扫 0 · 归属错配 0 · ns 面漂移 0 · 零读 ns 8 · 账本未定性 0 · 不在装载序 0 · 环 无 · 恒等式 平`。
- [x] 病灶的真实形态（#17 立足点）：**覆盖率从来不是一个可读的数字**——「见证 124 / 死表 5 / 基线 233」是三份名单各自的大小，而「产品源码里到底扫出多少个码」这个**分母只活在门禁的打印行里**；分母一变、总和不再相等，没人会注意到（三份名单可以同时各自「看起来正常」）。同族第二病：见证表的 `want(code, desc)` 是字典赋值，同一码写两次时**第二处静默顶掉第一处的描述**（实测两处）。故本版的判据是五条：① 分母 = 见证 + 死表 + 基线（恒等式）；② 三集都必须是扫描面的子集；③ 覆盖率 = （见证 + 死表）/ 分母且下限 ≥30%；④ **未登记的延后见证一律算真缺口**（`DEFERRED` 默认空表，登记才叫已接受）；⑤ 声明面的重复码必须报出来。
- [x] 病灶的真实形态（#20 立足点）：**「提到了谁」被当成了「必须先有谁」**。`tests/module-registry-gate.js` 的文件头早已把边界写死——「静态面能回答的只有 refs，回答不了装载顺序上必须先有谁」，它自己两版静态扫描器都失败了（v1 朴素 DFS 指数爆炸；v2 括号配平把 23 条装载期读判成 558 条）。本版把这条纪律变成可现场复核的判据：**次序只在运行期定案过的边（账本 `requires`/`requiresFiles`）上判**，静态引用 895 条里只有 23 条参与。
- [x] 内容：① `tests/reject-code-coverage.js`——`DEFERRED` / `WANT_RE` / `declarations` / `coverage` / `summary` / `discover`（单一真源：扫描面复用 `reject-code-gate.scan()`、见证面复用 `reject-v2780.runWitness()`、死表与基线复用 `reject-v2780.DEAD` 与台账 `base`，不重实现）。② `tests/module-cycle-gate.js`——六张显式登记表（`EXTERNAL` / `ENTRY_NS` / `UI_NS` / `SELF_REF_NS` / `CONTRACT_NS` / `NS_FACE_EXPECT`）+ `ALIAS_HOST_NS` / `NS_FIELD_MAP` / `ALIAS_RE`（三形态宽匹配）/ `acyclic()`（DFS 三色）；七条红判据（未提供 / 次序违规 / 跨文件写 / 归属错配 / 过期登记 / ns 面漂移 / 静态漏扫 + 环）与两条只报不红（零读 ns / 账本未定性）。③ `tests/run.js` 两个 section（+102 行）真消费两模块。
- [x] **本版自测期撞到的八处「自己身上的」缺陷（全部留痕，且都是它要治的那族病）**：① **静态面自造次序判据**——全部引用当次序依据 ⇒ 实测 **607 条**噪声；② **次序方向写反**（`fi > ti`）⇒ 23 条健康边全报违规；③ **入口兜底被当成「提供方冲突」**（`modules` / `registerModule` / `moduleRegistry` 是 `core/store.js` 与 `index.js` 的幂等转发）；④ **宿主名进了 EXTERNAL**（`WorldAxis`）⇒ 过期登记误报，改立 `ALIAS_HOST_NS`；⑤ **恒假断言**（`S.indexOf('X').length >= 0`）⇒ 等于没判，删除；⑥ **专锁用例码名用了中文** ⇒ `WANT_RE` 首字符限定 `[a-zA-Z]` 不认，静默得到 0；⑦ **锚点整串在专锁里重复出现** ⇒ 纯度判据报红（判据是对的、表是错的）；⑧ **`loadCopy` 未剥 shebang / require 把裸模块名当相对路径** ⇒ 负控制整面报「异常」，与「判据没反应」混为一谈。
- [x] 本版确立的可复用判据（编号续 R90）：(78) 静态面不许自造次序判据（895 条引用里只有 23 条是装载期读）／(79) 次序方向是「供者下标 > 消费方」才是违规／(80) 差集不是噪声但必须逐项登记，**账本不可用时 ns 面整面跳过**（不可用 ≠ 漂移）／(81) 宿主名要与外名分开登记／(82) 专锁用例的码名必须 ASCII／(83) 锚点纯度是「恰好 1 次」（缺失与重复同罪）／(84) **shebang 不是合法 JS**，装载破坏副本前必须剥首行／(85) 副本装载的 require 必须与 Node 同规矩（裸名走模块查找）／(86) 破坏点必须选在用例真会走到的路径上／(87) 注入面形状必须与真源同构（`readLedger` 含 `modules` 一层）／(88) 「数字 `.length >= 0`」是恒假断言／(89) 写死项数的常量是不纯的常量。
- [x] 同批升版与密封：`tools/bump_v2107.js`（三条守卫；run.js 因新增 102 行导致锚点位移，实现为「按含引号锚点的行现场定位」）+ `tools/seal_check_v2107.js` → **25 项绿 / 0 项红**；出口面契约 `ns= 109 members= 694 chars= 8296` **逐字未变**（纯 tests 侧，产品面零扩张）。
- [ ] 未覆盖（如实留在清单）：`NS_FIELD_MAP` 只登记 6 条 ns→文件映射，其余进 `unidentified`（只报不红）；`dead-ns` 的「零读」以产品源面为准，UI 层消费方不易判定（设计边界）；`ALIAS_RE` 只认三种别名形态；`WANT_RE` 只认 `want('code'` 字面量、拼接式写法不报错也不伪归；覆盖率下限 30% 是当前口径的诚实下限（实测 35.64%），**不是目标值**；**UI 层仍未做实机验证**。

## v2.109.0 性能观测深化 + UI 可测试性（计划一 #7-#16 合版）
- [x] 验收（perf-trace 观测面，#7-#11）：取值面 `engines/perf-trace.js`（+340 行）＋专锁 `tests/perf-observability-v2109.js` **101/0**（A 静态契约 / B 运行时 / C 不变式 / N 真源码破坏负控制，破坏走 `ui-gate-sync.fresh` 的 `srcOverride` **内存副本**、磁盘字节零改写）。
- [x] #7 真机性能基线持续追踪：`snapshot(label)` / `importSnapshot()` 把基线写成**可落盘对象**（`performance-snapshot-<ts>.json` 的**内容**，本面不落盘），带 `v: 1 / at / label / version` 与**两套可比性标志**（`ms` 墙钟跨机不可比、`bytes` 规模是确定量）——不把不可比的东西混成一个数。
- [x] #8 指纹冲突可查：`_fpIndex`（输入指纹 → 产物指纹 → 次数）+ `stat().fpCollisions`。口径：**同一份输入指纹映射出第二个不同产物指纹 ⇒ 承诺破了**（「指纹」此前只是承诺，没有任何判据问过它）。
- [x] #9 缓存槽有界与热度：`CACHE_CAP = 64` + `setCachePolicy('fifo'|'lru')`（默认 `fifo` **保持既有行为**）+ `cacheStat()` / `heatHistogram()`（按 `ageMs` 分桶，纯读、不改任何槽）。病灶：`_cache` 此前**无上限且零计量**，指纹表有界（挤出即计数）而缓存表随会话里每个 `layer:key` 线性增长。
- [x] #10 劣化告警阈值：`PERF_THRESHOLD = { factor: 1.5, minSamples: 8, minMs: 4 }` + `alerts() / baseline() / thresholds() / setThresholds() / spikeOf()`。只认**相对倍数**（绝对毫秒跨机不可比）；`minSamples` 防「第一个样本」抖动成告警；`minMs` 是**放大后的**门槛（本仓墙体时钟只精到 1ms）。
- [x] #11 火焰图：`faceNote` / `_faceMs` **面级**耗时账（此前只有层级账）+ `flamegraph()`（折叠栈 / JSON 树 / SVG）+ `FLAME_CAP = 256` + `flameDropped`（挤出即计数）。
- [x] #12 跨版本性能回归门禁：`tests/perf-regression-gate.js`（新）。四条**否定式**口径——① 墙钟跨机不可比 ⇒ **默认不判墙钟**，只判结构面，墙钟须显式声明同机；② **无上版可比不许静默 pass**（`first-baseline` 与 `compared` 是两个状态）；③ **样本不足不判**（`MIN_SAMPLES = 8`）；④ 阈值 `REGRESS_FACTOR = 1.2` 是**读数不是魔数**（判据钉住它的值）。实测现场：`本版 ? / 基线 无（首版） · 状态 first-baseline · 结构差 0 · 墙钟 n/a`（**`n/a` = 不适用**，与「有对象但跨机不可比」的 `not-comparable` 分开）。
- [x] #13 UI 端到端无头化：`tests/dependency-guard.js` + `tests/ui-dom.js` 的 `JSDOMShim`（与 jsdom **同形**，10 处静默跳过点全部改造；**不追求 jsdom 全兼容**，超面即如实抛错）。
- [x] #14 UI 可访问性门禁：`tests/ui-a11y-gate.js`（新）。读数 **控件 453 / 有名 453（100.0%，下限 85%）· 缺口 0**；名源分布 `aria-label=26 content=65 placeholder=124 title=130 wrap-label=108`。判据口径是 **HTML-AAM accname 的闭集子集**，并**明确写出不作为名字的东西**（`<select>` 的 option 文本是**选项**、不是控件名）。
- [x] #15 面板状态持久化：`worldaxis_ui_panel_state_v1` + `__panelStateReg`（`enums.page` = `PAGES` **闭合集合**）+ `__panelState()`；走 `settingsBus.saveOrThrow` **单一写路径**（绕开它直写 `localStorage` 会让「一次面板操作」在诊断里变成「没有发生过」）；登记**幂等**（`run.js` 有 8 处直接求值本文件而**不清**登记表，重复登记在 `selfCheck()` 里是 error 级）。刻意**不**持久化：DOM 引用 / 时效性槽 / 运行时定时器 / 缓存键。
- [x] #16 UI 组件单元级门禁：`tests/ui-components-v2109.js`（新，**27/0**）。补的是 `ui-gate`（端到端逐页真渲染 + 真点击）与 `ui-wire-audit`（静态绑定面）都**看不见**的三类缺陷：`<select>` 里零个 `<option>`、`<input type=range>` 没有 `min`/`max`、文本类控件没有任何可用名字——它们照样成树、照样可点、照样不抛，但**对用户完全无效**。
- [x] **本版三处自纠（由判据实跑抓出）**：① a11y 判据读 `el.type`，裸 `<input>` 上是**空串** ⇒ 104 个带 `placeholder` 的控件被误判「非文本类、无名字」，**被压低的读数与真缺名同形**（修法 `normType` + 口径自述写明例外）；② 「本版补了 26 处」首版断言 `aria-labelledby` ≥18 / `aria-label` ≥8，而 26 处**全部**走 `aria-label`、`aria-labelledby` **全仓 0 处** ⇒ 判据**从落地起必然红**（断言了一种不存在的补名方式），订正为「数 DOM + 数源码文本」两条互相佐证，且计数由**门禁自己**提供（单一真源只有一处去发现文件面）；③ 「无基线」与「跨机不可比」不许同形（见 #12）。
- [ ] 未覆盖（如实留在清单）：**UI 层仍未做实机验证**（`ui/panel.js` 在无头回归里不装载 ⇒ a11y 与组件读数来自无头 DOM，**不代表浏览器里念得出声**）；`lowend` 基准是**同机放大估计**（`approx: true`）；`perf-regression-gate` 是**首版**（这一轮的绿只证明判据在场，**不证明「没劣化」**）；本仓**没有**自带的跨版本基线文件（快照由人拿走）；a11y 名源闭集只认五种来源，`aria-describedby` 等不作名字。

## v2.110.0 三个基元模块 + 开发体验工具链七件（计划一 #21-#30 收口 · 计划二 #39/#70 并入）
- [x] 验收（计划一 #21 异常上下文与恢复）：`core/fault-context.js`（新，202 行）＋专锁 `tests/fault-context-v2110.js` **62/0**。`wrap(op, fn, opts)` 默认把抛出**折成结果对象** `{ ok: false, reason: 'fault-handled', kind, operation, ctx }`；显式 `{ rethrow: true }` 时**原样重抛同一个 error 对象**（identity 不变）；`classify()` 只认五档 `network / transient / type / range / other`（判据只落在 `message` + `code` 上，**不读 stack 文本**）；重试**默认关**且只对 `network` / `transient` 开放；`stateBrief()` 捕一切异常、取不到的字段**如实给 `null`**（不是 `0`、不是 `''`）；60 条上下文环（`recent()` 返回副本）。
- [x] 验收（计划一 #22 结构级输入校验）：`core/schema.js`（新，215 行）＋专锁 `tests/schema-v2110.js` **64/0**。`validate(spec, input)` 恒返回 `{ ok, reason: 'invalid-input', errors: [{ field, expected, actual }], checked }`；**类型不放宽**（`'3'` 不是 `3`、`[]` 不是 `{}`，放宽必须 `coerce: true`）；`errors` **恒为数组**；枚举 `expected` 渲染成 `a|b|c`；未知字段**默认保留**（`unknown: 'keep'`，与产品「未知字段保留不执行」同口径）；未注册 schema 名 ⇒ `unknown-schema`（不静默放过）；校验器自己炸 ⇒ `validator-threw`（**绝不假装通过**）。
- [x] 验收（计划一 #23-#30 工具链七件）：`tools/`（新七件，**全部零依赖、全部「只报不改」**）＋专锁 `tests/tools-v2110.js` **155/0**（工具零相对依赖 ⇒ 破坏副本可直接落进临时目录 `require`，不必装配宿主）。`gen-lock.js`（#23 专锁模板生成器：导出面取自**真源码文本**、生成物必过 JS 解析、手写锁**拒绝覆盖**）、`coverage-report.js`（#25 零依赖解析 `NODE_V8_COVERAGE`，**没有数据就报 `no-data` 并给出产出命令，绝不打印 0%/100% 伪读数**）、`doc-gate.js`（#26 只判三件可机械核对的事，**刻意不查 `@param` 名字**，不设阈值除非 `--strict`）、`impact-analysis.js`（#27 四层各自成词 `direct`/`alias`/`indirect`/`locks+ui`，**不合并成一个数字**，并自报 `unseen: true`）、`patch-idempotency.js`（#28 判定只有一条：锚点剩几次；`0` ⇒ 已应用、`≥2` ⇒ **拒绝**、不给锚点 ⇒ 拒绝）、`hooks.js`（#29 快门槛进 pre-commit、**pre-push 默认不阻断**、外来 hook 拒绝覆盖 + 备份）、`gen-changelog.js`（#30 只输出**事实清单**草稿到 stdout、**不写日志**、区间必须显式）。
- [x] 验收（计划一 #24 失败根因定位）：`tests/run.js` 的 `__ctxRing` + `__noteTick` + `reportFailure` **纯函数**（失败行带上「哪个 section / 锚点 / 最近通过的三条」）+ 七条内联判据。病灶不是「报错难看」而是**错误没有归属**：同一个 `TypeError` 可能来自 40 个入口，回归与实机日志只能按**行号**区分它们。
- [x] 验收（计划二 #39 多人协作 + #70 访问控制，**同一处机制**）：`core/permissions.js`（新，177 行）＋专锁 `tests/permissions-v2110.js` **74/0**。「角色 → 权限位 → 判定」一处实现；五内置角色 / 十权限位；**未注册用户一律拒绝**（`allowed: false` + `unknown-user`）；**审计模式不改产品行为**（判定只回答允不允许，**不阻断任何既有写路径**）；通配只认 `*` 与 `前缀.*`，`*.*` **不支持**（不做正则、不猜）。并版理由：本仓有「谁能改什么」的**全部前提**（`store.save` 的写入口、`undo` 的操作栈、`bridge` 的对外投影面）却**没有任何一处问过权限**，拆成两个模块只会得到两份会各自漂移的判定。
- [x] 接线与台账：`index.js` 的 `LOAD_ORDER`（115 → 118，紧随 `input-guard`——三者与它是**同一条边界上的三层**：值级 → 结构级 → 归属级）、`tests/run.js` 的 `LOAD`、`engines/tool-diag.js` 的 `MODULE_EXPORTS` 四处同批登记；三本台账同源（`module-registry-ledger` 文件 115 / 命名空间 123 / 装载期边 23；`dead-export-ledger` dead 482 / dataOnly 178；`reject-code-ledger` version 2.110.0 + `_note`，**基线 233 不动**）。
- [x] **四个由工具自己当场抓出的问题（全部是写工具时实测出来的，不是纸面推演）**：① `coverage-report` 首版把「覆盖」算成**恒 100%**（V8 的 range **逐层细化**，最外层区间覆盖整个脚本且 `count>0`）——**这正是该工具存在的理由，而它第一版自己就犯了这个错**，改成「长的在前、短的后覆盖，每字节留最内层计数」才读出真值；② `hooks.js` 的 `git rev-parse` 在非仓库目录往 stderr 喷 fatal，而「不是仓库 ⇒ 回退 `.git/hooks`」是它的**正常路径**（实测 7 行假警报）；③ `gen-changelog.js` 的区间守卫只判 `indexOf('..') < 0` ⇒ 裸 `'..'` 的归因从「你没给区间」变成「git 不可用」，**错了一档**；④ `#28` 的负控制首版**打不到靶**（同一结论有两条 return 路径时，只破坏其中一条不会让判据现形）。
- [x] **三处收口教训**：(a) JSON 台账定点替换的锚点**必须含结构字符**（首版拼在 `",` 之前 ⇒ 字符串提前闭合、整份台账不可解析，而补丁自身 `ast.parse` 是对的）；(b) 拼接式字符串补丁**唯一的防线是跑完立刻语法检查**（漏末尾 `'）；` 三字符即 `node --check` 报 SyntaxError——补丁的 `ast.parse` 只证明**补丁**语法正确，不证明**产物**正确）；(c) vm 上下文的裸全局**没有 `require`**，最终用「写真 CommonJS 临时模块到 `tests/` 下、内部用 `new Function` 在显式作用域求值」解决——**真 CommonJS 模块才是 `tests/run.js` 的真实处境**。
- [x] 门禁结果（逐道实跑）：`module-registry-gate` **pass**（文件 115 / 命名空间 123 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0）；`dead-export-gate` **pass**（dead 482 / uiDead 4 / dataOnly 178 / 仅测试 293）；`reject-code-gate` **pass**（产品文件 119 / 内联码 375 / 见证 **128 → 137** / 死表 5 / 基线 233 不变）；`export-contract` **`ns= 109 members= 702 chars= 8381`，逐字未变**（三个基元模块只调用既有的 `inputGuard.text` / `store.read` / `clock.wallNow`，`FROZEN2800` 与 `EC2430` 零增量）；`test-surface-gate` 通过（测试文件面 108 / 锁 103 / 可达 108 / **孤儿 0** / 豁免 0）；`inventory` 产品文件 119 / 声明表登记 118 / 命名空间 118 / 成员 1394 / 静态引用 2653（四类悬空均 0）；`tools/sync-hardcoded.js --write` 5 族 16 站点回填（refs 2645→2653、namespaces 115→118、members 1362→1394、dead 456→482、dataOnly 172→178），写后复判「无需回填」；四把新专锁真装载面探针 **355/0**、`run.js` 段接线探针（真 CommonJS 模块）**364/0**；`node tests/run.js` → **通过 9695 / 失败 0**。
- [x] **收口期连带修正（整轮现场抓出，非纸面推演）**：`v2830/mr: 命名空间 120 / 装载文件 112` → 门禁现场复算 **123 / 115**（三个新 `core` 模块使 `LOAD_ORDER` 115→118；沿革算式逐字保留、只追写本版一行）；`module-cycle-gate-v2107` 五处读数随文件面 +3 与调用期边 +9 跟到真值（`116/872/895/115/145/120/8` ⇒ **`119/881/904/118/148/123/11`**，含门禁文件头里「拿全部静态引用判次序会报 N 条噪声」的 N：v2.107.0 记 607、本版实测 **281**）；`tools-v2110` 的 `gen-changelog` 区间用例原先**依赖宿主树的 git 深度**，而整轮回归跑在 `git archive` 出来的**单提交候选树**里 ⇒ 消息参数读 `undefined.length`、**在 `run.js:19328` 打死整个 v2.110.0 段**（断言短路救不了消息），改为锁自建 3 提交夹具仓（落在仓库外）——**判据必须自足，不许把宿主环境当默认**。
- [ ] 未覆盖（如实留在清单）：`core/permissions.js` 的判定**尚未接进任何写路径**（本版只立机制与判定面，阻断点由后续版本按需接，审计模式永不改产品行为）；`fault-context` 的重试默认关、`schema` 的 `coerce` 默认关；工具链七件**只报不改**（`coverage-report` 需要调用方用 `NODE_V8_COVERAGE` 采集，本仓尚未接进 `run.js` 的采集面）；**UI 层仍未做实机验证**。

## v2.111.0 操作审计日志 + 输入消毒单一真源（计划二 #67 + #69 合版）
- [x] 验收（#67 操作审计日志）：`core/audit-log.js`（新，162 行）＋专锁 `tests/audit-log-v2111.js` **54 项**（A 导出面 / B 运行时 / C 不变式 / N 真源码破坏负控制）。`record(action, data, opts)` 写一条环上记录（`CAP = 200` 有界，挤出即 `trimmed` 计数）；查询面 `recent` / `byAction` / `count` / `stat` / `reset` 全部**返回副本**（取证面不得与真源共享可变引用）；两条真消费方：`core/store.js` 的写后读回校验**通过点**（「记了一条 save」与「这次 save 真的落盘了」必须是同一件事，失败路径上不许产出成功的审计行）与 `core/permissions.js` 的**两处拒绝点**（只记「允许」的表会让「没有这条记录」与「当时被拒了」读起来一模一样）。
- [x] 验收（#69 输入消毒单一真源）：`core/sanitize.js`（新，91 行）＋专锁 `tests/sanitize-v2111.js` **42 项**。`html` / `attr` / `text` / `tpl` / `needsEscape` 五口；修掉两处真缺陷——① `ui/panel.js` 的 `esc()` 映射表把双引号映射成**双引号自己**（恒等，属性上下文里等于不转义）；② 另有 2 处调用**全仓不存在**的 `escapeHtml`（一碰真告警路径就 `ReferenceError`）。面板改走 `WA.sanitize.html`，并保留内联兜底实现。
- [x] 三个新拒收码全部走**可执行见证**（`bad-action` 双入口空动作名；`record-failed` 用**敌意 Proxy**（`get` 一取就抛）把 `record()` 的 try/catch 兜底出口真跑出来——这是「审计不得改产品行为」这条契约的可执行形态；`permission-denied` 先 `grant(..., 'guest')` 造「在册但角色权限集为空」的用户，再走 `has` / `check` 双入口），见证 137→140，基线仍 233。
- [x] 接线与台账：`index.js` 的 `LOAD_ORDER`（118→120，紧随 `core/permissions.js`）、`tests/run.js` 的 `LOAD`、`engines/tool-diag.js` 的 `MODULE_EXPORTS` 四处同批登记；三本台账同源（`module-registry-ledger` **文件 117 / 命名空间 125 / 装载期边 23 / 硬边 0**；`dead-export-ledger` **dead 492→491**（`sanitize.html` 由死转活，**如实收敛而不是外挂假消费方**）/ uiDead 4 / dataOnly 184；`reject-code-ledger` version 2.111.0 + `_note` 追写本版段，**基线 233 不动**）。
- [x] **本轮现场抓出的已提交缺陷（不是纸面推演）**：`tests/reject-v2780.js` 里 v2.110.0 的见证块被**三重复**写入（第 945–1005 / 1006–1066 / 1067–1127 三块逐字节相同、各 2961 字节），且这是 `21832ab` 提交当时就带着的形态（`git show HEAD:tests/reject-v2780.js | grep -c "v2.110.0（计划一 #21/#22"` = 3）。修法不是逐块删除，而是**从基线切片重建**：先断言三块逐字节相同、边界字符（`L[1005] == '  }'` / `L[1128]` 以 `const missing` 开头）吻合，再 `L[:1006] + 新块 + L[1128:]`，一次做完「去重 + 加三个新见证」。
- [x] **本轮实测到的一条硬约束（写进了注释）**：死子面门禁的引用正则只认 `WA.<ns>.<mem>` **字面形态**。首版把 `WA.sanitize` 先存进局部变量再调 `_S.html(s)` —— 调用确实发生了，但静态面上就是「产品代码零引用 `sanitize.html`」，账本会记下一条**与事实相反**的证词。改回逐字写全后，`auditLog` 与 `sanitize` 两个命名空间从「零读」升为「有真消费方」：零读 ns **11→10**，出口面 `ns 109→111 / members 702→704 / chars 8381→8411`（两模块各只有一口进契约面）。
- [x] 验收（读数链）：`readings.discover()` → **`problems: 0`**（七族全同源）、`live` 与三本台账同值；`tools/sync-hardcoded.js --write` 回填 **2 族 7 站点**（`refs 2660→2662`、`dead 492→491`），写后复判「无需回填」；三处不在回填面上的硬编码手改（`module-cycle-gate-v2107.js` 7 处、`settle-v2830.js` 3 处、`run.js` 消息文本）。
- [x] 门禁结果（逐道实跑）：`module-registry-gate` **pass**（文件 117 / 命名空间 125 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0）；`dead-export-gate` **pass**（dead 491 / uiDead 4 / dataOnly 184 / 归因 test-only 293 / 其余 198）；`reject-code-gate` **pass**（产品文件 121 / 内联码 378 / 见证 140 / 死表 5 / 基线 233）；`module-cycle-gate` **pass**（文件 121 / 别名 121 / 真引用 119 / 边 909 = 装载期 23 + 调用期 886 / LOAD_ORDER 120 / 提供方 150 / 账本 125 / 读面 140 / 零读 ns 10 / 环无）；`module-cycle-gate-v2107` **pass（65 项）**；`settle-v2830` **pass（55）**；`test-surface-gate` **全部通过**（测试文件面 110 / 锁 105 / 可达 110 / spawn 4 / **孤儿 0** / 豁免 0）；`inventory` 四类悬空均 0（产品文件 121 / 命名空间 120 / 成员 1411 / 静态引用 2662）；`node tests/run.js` → **通过 9797 / 失败 0**（v2.110.0 起点 9695；净增 102 = 54 + 42 + 内联判据 6）。
- [ ] 未覆盖（如实留在清单，不伪称已完成）：audit-log 的环**只驻内存不落盘**（跨会话审计需要先定「跟存档一起走还是单独走」的取舍）；`permissions` 的判定**仍未接进任何写路径**（本版只加留痕、不加阻断）；`sanitize.tpl` 只做最保守的插值替换（不做模板引擎，也不解析表达式）；**UI 层仍未做实机验证**（`ui/panel.js` 在无头回归里由 mini-DOM 覆盖，不是真浏览器）。

## v2.112.0 因果链追踪 / 协作面 / 审计落盘（计划二 #31/#32/#33 + #36/#37/#38/#40）
- [x] **新增 `engines/chrono.js`（359 行，#31+#32+#33）**：给每一次锚点变更留一条**带反向引用**的事实（`base`），由此派生 `layer` / `derives` / `undo` / `diff` / `simBranch` / `stale` 六个只读读数；写入口只有 `record` 与 `applyUndo`。四条否定式：**不删事实**（无 remove/clear/splice/purge——不是「少用」而是「函数不存在」，撤销只追加 `kind:'revert'` 并列出可能失准的下游）、**不猜依赖**（只认显式 `base`，不按时间接近或名字相似推断）、**深度如实报**（超 `maxDepth` 当场拒收 `too-deep`，不截断后假装完整；不存在的 id 返回 `null` 而非 0）、**试演不改真身**（`simBranch` 只在内存副本上推进并返回 `dryRun:true`，不调 `store.transact`）。分工是硬边界：`auditLog` 答「发生了什么」（无结构事实环）／本模块答「它挂在谁身上」；`causal` 是**未来**推演／本模块是**过去**的依赖图；`registry.traceOf` 追改名链／本模块追变更链。
- [x] **新增 `engines/collab.js`（374 行，#36+#37+#38+#40）**：`open/close`（**不限制同时在线、不踢人**）、`claim/release`（已被占用 **不静默夺取**，返回 `claimed-by-other` 带当前持有者；不抢占、不超时夺锁）、`enqueue`（`opId` 幂等，重复入队**不产生第二条**，`duplicate` 如实报）、`noteConflict`/`resolve`（必须显式 `strategy` + `{confirm:true}`，缺一即 `need-confirm`；**不自动裁决、不自动合并、不改任何用户数据**；只一侧存在时报 `one-sided`，**不假装是冲突**）、`flush`（只标记已交付并**交出**这批操作，**不替调用方写世界**）。
- [x] **`core/permissions.js`（#39）**：把 v2.110.0「只留痕不阻断」的尾巴收掉——新增显式闸门 `gate()`，消费方是唯一写入口 `core/store.js` 的 `save()`，单机默认放行不变；**未注册用户也是「被拒」的一种**，同样留痕（此前这条审计写在早退**之后**，未注册用户被拒反而没有记录）。
- [x] **`core/audit-log.js`（#67 收尾）**：**落盘** `flush` / `restore`——v2.111.0 的事实环只驻内存，刷新一次页面这次会话的写痕迹全部消失，而「事后归因」正是本模块存在的唯一理由。四条否定式：**只增不减**（追加不是覆写；可证伪形态是「连续两次 flush，第二次必须写 0 条」）、**挤出不静默**（被环挤掉因而没落盘的行数如实报 `lost`——「没落盘」与「没有过」在排查时读起来一模一样）、**痕迹不改世界也不抛**（无 localStorage 时如实报 `storage-unavailable`，**不假称成功**）、**读回是只读的**（`restore()` 不把历史并进内存环——环是**本次会话**的现场，历史是**上一次会话**的现场）。
- [x] **`engines/tool-diag.js`**：`secChrono` / `secCollab` 两节只读旁观（不调 record/applyUndo、不调 claim/flush/resolve），守卫表同步登记。
- [x] **专锁 `tests/audit-log-v2112.js`（86 项）**：四条否定式逐条可证伪，各锚点要求真源码恰中 1 次。
- [x] **接线**：`tests/run.js` 新增 v2.112.0 section——**本段的存在本身就是一处判据**（与 v2.109.0 段同一条纪律）：交付物若不在这里被 require / 跑起来，就会被 `test-surface-gate` 判成「从不执行的孤儿」。实测踩到：`audit-log-v2112.js` 自写入工作树起**在整套回归里从未运行过**，而它锁的落盘面恰是「两处裸读无归因」那一处的载体——**锁在场却没人跑，等于落盘面无覆盖**。
- [ ] 未覆盖（如实留档）：`chrono` 的依赖图只认显式 `base`，不做任何推断（这是设计，不是缺口）；`collab` 的冲突**不自动裁决**（同上）；UI 层仍未做实机验证。

## v2.113.0 事务提交语义（计划一 A1：授权贯穿到提交 + 批结论可判定）
- [x] **三处病灶（均为实测）**：① **被拒的改动后来自己落盘了**——旧写闸门只在 `save()` 里，而批内 `transact` 早已把候选推进 `memCache` 并置脏，批退出那句 `this.save()` **不看返回值**（`save` 失败是 `return false` 不抛）且其前一行已清掉 `dirty` ⇒ 被拒改动留在内存、等下一次普通保存顺带提交，**「拒绝」只对那一次保存成立，对世界不成立**；② **批的完成状态不可判定**（`ok:true` 与「真的落盘了」无任何可读区分，「事务体跑成功了」与「世界真的落盘了」同形）；③ **「保护没启用」与「保护开着且放行」同形**（两者都是 `null`）。
- [x] **`core/store.js`**：① **已确认落盘的内存代** `__committed`——唯一的确认落盘点是「写后读回校验已通过」那一行；`rollbackMemory()` 退回最后已确认代，**退不回去就如实返回 false、绝不猜内容**。② **变更之前的授权检查** `gateBeforeChange()`——唯一会对内部写路径说「不」的检查点，接在 `transact` 的**变更前**与**提交前复检**（`atCommit:true`；mutator 可异步，提交前必须再检）。③ 批退出结论 `lastFlush`（ok / reason / safe / at）与只读视图 `batchStat()`。④ 跨纪元的候选**从内存里也丢掉**（此前只丢落盘）。
- [x] **`core/permissions.js`**：`gateStat().off` = 因「没人登记当前使用者」而放行的次数，与 `allowed` 分开读。**`core/audit-log.js`**：落盘侧两处裸读（flush / restore）补留痕。**`engines/tool-diag.js`**：闸门读数进诊断包 + 两个 store 域归因来源登记。
- [x] **专锁 `tests/store-commit-v2113.js`（33 项）**：B 行为（无 write 位的单次/批内写入**既不进内存也不落盘**；批落盘失败 ⇒ `lastFlush` 给结论、内存退回上一确认代；跨纪元批 ⇒ `reason='orphaned-epoch'` 且内存一并丢弃）＋ N 真源码破坏负控制（锚点各恰中 1 次）＋ C 纯只读不变式。
- [x] **接线**：`tests/run.js` 的 v2.113.0 section 另钉三处「真消费方是否接上」（`batchStat().lastFlush` 在场、诊断 `worldState.storage.batch.lastFlush` 在场、新载体全部落在**既有导出内部**）——**一个新字段自己绿、却没有任何产品代码读它，正是本仓反复点名的「有写入方、零读者」**。
- [x] **两条口径备注（写进注释防后人重踩）**：**探针必须真 `await` `batch()`**（不是 await 的批体走微任务，`batch()` 的 finally 晚于探针返回 ⇒ 读到的批结论恒为 `null`，而那看起来和「功能没实现」一模一样）；**比较内存态要用 `r.state` 或 `store.get()` 的整体 JSON**，不要对树里某个字段做子串匹配（内存态是写回过的权威引用，不是草稿对象的别名）。
- [ ] 未覆盖（如实留档）：`permissions` 的闸门只在 `save()` 前置点上，`transact` 之外的写路径未覆盖；UI 层仍未做实机验证。

## v2.114.0 生命周期钩子 · 沙箱 · 快照子集 · 拒收码手册（计划二 #56/#68/#59/#64）
- [x] **新增 `core/plugin.js`（157 行，#56）**：**进程内**注册表——`init` / `beforeSave` / `afterLoad` / `onRender` 四个钩位；`register({name, version, hooks})` 同名覆盖并记 `replaced++`。三条契约都可证伪：**`beforeSave` 看到的是冻结快照**（改它不影响即将落盘的对象）、**返回 `{ok:false, reason}` ⇒ save 被拦**（`reason='plugin-blocked'`，**世界写未发生**）、**钩子抛错 ⇒ 记 `faults.hookThrow` 但不拦保存**（**观测失败不得变成写失败**）。钩子体默认走 `sandbox.run`。范围明确**不做**插件市场 / 远程安装 / REST。
- [x] **新增 `core/sandbox.js`（101 行，#68）**：计划原文要 VM2 / Isolated-VM，但本仓零依赖、跑在宿主页面里——**不能引入原生隔离器，也不能假装有一个**。本模块回答另一句可证伪的话：**不受信任的函数只能看见白名单里的 API，碰 require / process / fs / WA.store 一律 Access denied**。三条否定式：不提供文件系统/网络/动态加载；不把 WA 整棵树交给脚本（那等于没有沙箱）；**超时只对同步函数生效**（浏览器里杀不了线程——超时后下一次入口直接拒收 `sandbox-timeout`，本轮仍跑完）。真消费方是 `plugin.js` 的钩子体。
- [x] **收 v2.112.0 的容量欠账（#56 配套）**：v2.112.0 只做了「准入闸」（`maxSessions` / `maxQueue` / `maxConflicts` / `maxLayers`），而**关闭的会话、已交付的队列行、已裁决的冲突行、追加的 revert 行没有任何挤出侧**——长局里这三张表加一条日志只增不减。**准入闸管「还能不能进」，挤出侧管「进了的怎么出去」——两件事，缺一件就是无界增长**（`sizeAudit` 唯一能抓到的那类膨胀）。`core/evict.js` 与 `core/store.js` 各四条登记**逐键同名同值**：`collab.sessions` 64 / `collab.queue` 128 / `collab.conflicts` 64 / `chrono.entries` 128。
- [x] **`engines/tool-snapshot.js`（#59）**：**读口与恢复口分开**——`buildSubsetPayload(faces)` 带 `subset:true` 与 `subsetFaces`，`validate()` 据此**直接拒收**（**未导出的面不会被当成空面写掉**）。
- [x] **`tools/gen-error-codes.js`（#64，开发体验工具第八件）**：全仓 399 个内联拒收码唯一的载体是三份**给门禁读的**表，没有一份**给人读的**清单——搜一个码只能 grep 出定义点，读不到「它什么时候出现、为什么出现」。三条口径：**不新增数据源**（与 `reject-code-gate` 同源；**另起一份码表就是双真源，改了甲忘乙的那天，手册会开始说谎**）、**只报不改码**、**`--check` 是双向的**（文档少一个码 = 红灯、多一个码 = 红灯——**「台账不得比现实胖」这条纪律同样适用于文档**）。
- [x] **「零消费能力当场删」的现场执行**：首版多出的 `subsetJSON` 出口（**唯一**消费者是测试，死面门禁实测 self-only/test-only）与 `sandbox.freezeApi` / `sandbox.reset` / `plugin.reset` 三项**当场删除**（能力未接线；白名单冻结只该是 `run` 内部步骤）。留下的 `sandbox.stat` 由诊断 `secPlugin` 真读、`plugin.unregister` 由面板 `#wa-pl-unreg` 卸载按钮真调——**只有这二者出进冻结面**。
- [x] **专锁**：`tests/plugin-v2114.js`（四段：A 静态契约 / B 运行时 / C 不变式 / N 真源码破坏）与 `tests/tools-v2114.js`（33 项）。
- [ ] 未覆盖（如实留档）：`sandbox` 不隔离异步与内存（**只能隔离可见面**）；`plugin` 的钩子只在 `save` / `init` / 渲染三点上有挂钩；UI 层仍未做实机验证。

## v2.115.0 已复现缺陷收口（计划一 E1–E4：改期原子性 / 目击知识 / 人物推进公平）
起点：v2.114.0 / 全量回归 10002/0。本版把规划里**已复现行为缺陷** E1–E4 逐项收口，四处病灶全部来自现场探针而非纸面推演。
- [x] **E2 改期原子性（engines/events.js）**：旧 `replace(id, patch)` 是「先 cancel 再 schedule」两步——新参数不合法（如 `{at:-1}`）时**旧 pending 行已被取消**，返回值虽是 `bad-time`，那件事却已从待办队列消失（「返回值看着对、世界已经变了」）。同源第二处：patch 未给时刻时把 `at` 留成 NaN，而 schedule 的「缺省 = 现在」会把只改标题的改期顺手挪到当下。
  · 修法：抽出**纯函数 `plan(it)`**（只判形取整，不碰 store、不改任何行、不记 fault）→ `schedule()` 改「先 plan、后 transact」；`replace()` 改**单事务原子替换**（先 plan 校验，不合格 ⇒ 零事务、旧行原样保留；事务内旧行转 `cancelled/replaced` 与新行落地一起提交）；容量口径把「将被替换的旧行」算作已释放，**刻意不逐字复用 `A_CAP` 锚点字面量**；新增 `hasTime` 分支：未给时刻则沿用 `old.scheduledAt`；文件头补纪律「**拒收 ⇒ 零变化**」。
- [x] **E3 目击知识被链层连坐（engines/rumor.js）**：`visibleTo(person)` 此前拿**链的当前层**做前置门——一条链只要被转述过（链层落到 `hearsay`），连「乙亲眼见过、停在目击层」的那一跳也被一并挡掉，乙的可见面从 1 条变 0 条。链的当前层答的是「这条链传到哪一层了」，与「这个人自己看到过什么」**不是同一个问题**。同源第二处：命中多跳时直接取数组末条、未判层，末跳若停在流言层就答出三层之外的东西。
  · 修法：门从**链层**下移到**跳层**——先按 `PUBLIC_LAYERS` 筛跳，再取 `seen` 末条。
- [x] **E4 人物推进公平（engines/life.js）**：`tick()` 此前把人物按依据排序后 `.slice(0, cfg.maxPeople)` 截断——6 人同等依据、名额 4 时**后两位每一轮都被跳过**：`skipped` 有账但「谁总也没轮到」不可见（静态排序 + 截断 = 位置决定命运）。
  · 修法：**按依据分组、只在名额切点所在组内轮转**——按 `n` 降序稳定分组逐组装入名额；**整组装得下就不轮转**，只有装不下时才环形取前 `take` 个并推进 `_turn`；**依据多者仍绝对优先（轮转只在同级、只在切点处发生）**。游标是进程态（不落存档、不新增容器键）；读面挂在**既有成员** `stat()` 里（`lastTurn`）——为读它新开一口 `turn()` 已按「零消费能力当场删」纪律当场收回。
- [x] **E1 归因结论（零改动）**：现场探针曾据「批内改动留在内存、退出会话后原拒绝改动落盘」报红；复核 `core/store.js` 后确认该缺陷 **v2.113.0 已修**（transact 有「变更前」与「提交前复检」两道闸，被拒候选**根本不产生**），且既有锁明确锁的是相反口径（整批全被拒 ⇒ `flushes` 不增、`lastFlush` 保持 null）。**改源码去迎合探针会反向拆掉已交付的口径**，故判定为探针期望错误。
- [x] **三把常驻变异锁（各锚点要求真源码恰中 1 次）**：`tests/events-e2-v2115.js` **35 项**（破坏现形 `killed` / `moved`）、`tests/rumor-e3-v2115.js` **22 项**（`blinded` / `leaked`）、`tests/life-e4-v2115.js` **28 项**（`stuck` / `0` / `starved`）。探针被试**刻意分开**（同链上用甲测「连坐」、用乙测「漏层」）以满足 N3 隔离。三把锁已挂进 `tests/run.js` 的 v2.115.0 section（否则被 `test-surface-gate` 判孤儿）。
- [x] **连带修正（现场抓出）**：`tests/settle-v2850.js` 的 `basis` 锚点因 ranking 段重构失配（原锚点含 `(a.i - b.i)`）——改为取现行的「筛空壳 → 编序号 → 排序」连续三行、破坏后只留编序号一步；修后该锁 **60/60**。
- [x] **收口读数**：`node tests/run.js` → **通过 10095 / 失败 0 · Status: passed**（v2.114.0 为 10002/0）；四道冻结面回跑全绿 —— `test-surface-gate` 全部通过（文件面 117 / 锁 112 / 可达 117 / **孤儿 0**）；`export-contract` **`ns= 116 members= 731 chars= 8667` 逐字未变**（三处修复全在既有导出内部完成）；`module-registry-gate` pass（文件 121 / 命名空间 129 / 装载期边 25 / 硬边 0 / 结构问题 0）；`module-cycle-gate` pass（文件 125 / 边 940 / 零读 ns 10 / 环无 / 恒等式平）；`reject-code-gate` pass（内联码 399 / 见证 161 / 死表 5 / 基线 233）；`dead-export-gate` **pass**（dead 505 / uiDead 4 / dataOnly 191 / 归因 test-only 296；`--update` 重基线证据后复判「死子面无新增、元数据同源、证据可复算」）；`readings` **problems 0**。
- [x] **本轮现场抓到、已写入注释的三条纪律**：① `dead-export-ledger.json` 的 `_note` 是「取**末次**版本词」口径，沿革段必须写在字尾，否则 `_note` 出现两个当前版版本词而 N7 负控制打的是**首个**词 ⇒ 破坏后判据不现形（**改的是台账形态，不是判据**）；② `settle-v2810.js` 用真源码**字面量**做变异锚点且要求各恰中 1 次——新写的容量守卫**不得逐字复用** `A_CAP` 字符串，否则该条会静默跳过（**锚点撞车 ⇒ 跳过而非假绿**）；③ 隔离运行器的默认预算是 **600s**，v2.115.0 全量回归实测超过它（`"stopping": "timeout"`）——必须走长超时启动器（`{ timeoutMs: 2700000 }`），否则会得到 `Status: interrupted` 的假失败。
- [ ] 未覆盖（如实留在清单，不伪称已完成）：E1–E4 是**行为缺陷收口**，两份规划的 A0–A8 / B1–B9 主体（门禁地基、诊断中心、快照分支、依赖注册表、查询报告层、配置迁移、事件调度、协作审计、经济与传播纵深）尚未启动；`_turn` 游标是**进程态**，跨会话不延续；**UI 层仍未做实机验证**（`ui/panel.js` 在无头回归里由 mini-DOM 覆盖，不是真浏览器）。
## v2.116.0 事件调度恢复协议（计划一 A2 第二段：任务预算 / 所有权 / 租约 / 回执去重）
起点：v2.115.0 / 全量回归 10095/0。规划 01 的 A2 原文要求「认领有上限、所有权与可恢复期限、执行结果有稳定操作ID、已完成本地副作用与该ID的确认一起持久化、崩溃发生在执行中可恢复、重复回执不重复结算」——本版把这六句逐句落成可证伪的字段与判据。
- [x] **A2 第二段（engines/events.js）**：四处缺口全部来自「认领了、然后没人回报」这一句话。
  · **认领有上限**：新增 `maxClaims`（bounds `[1,24]`，默认 24）。旧 `claim()` 一次把全部到点事件认领光——真实酒馆里那是几十个引擎同时开工，一次调用就能把整个世界待办搬进「执行中」。超额者进 `deferred`（带 `id` / `reason:'budget'` / `priority` / `scheduledAt`）**显式留痕而非静默跳过**。
  · **所有权**：`x.owner = str(o.owner, 40)`；认领后那一行带「谁认领的」，面板 / 自动流程 / 别的插件之间的账才对得上。
  · **可恢复期限（租约）**：新增 `leaseMs`（bounds `[0,3600000]`，默认 **0 = 不生效、行为与 v2.115.0 逐字一致**）。`claim()` 在**同一事务内先回收**租约到期行（`status='pending'; claimedAt=0; leaseUntil=0; reclaimed++`）；`ready()` 亦把到期行视为候选。治的是**「正在执行」与「永远不会有人来执行」此前完全同形**——崩一次 / 切一次聊天，`claimed` 的行既不再进 `due`、也不是终态，那件事被静默丢掉且没有任何读数能发现。
  · **稳定操作 ID + 重复回执不重复结算**：认领时钉 `x.opId = x.id + '@' + Math.floor(x.scheduledAt || 0) + '#' + x.claims`（**每次重钉、序号自增**）；`complete()` 以「`events.res` 台账里有同一 `opId`」为去重判据（新码 `duplicate-receipt`，拒收且零变化），键取 `wantOp || have`（**调用方优先**）。旧判据只有「当前是不是 `claimed`」⇒ 任何重放（重连 / 重试 / 宿主重复通知）都会**二次结算**同一件事。
- [x] **四处「实测推翻纸面」的现场裁决（本版最有价值的部分）**：
  · ① **`already-receipted` 守卫撤除**（原设计留着、实测否决）：它**不可达**（回报成功的行已是 `executed`/`exhausted`/`failed`，被上一条 `not-active` 抢先返回）；唯一可达的场合是「周期事件两次触发之间的 `pending`、且上一次回执还在台账里」，那里它会把**合法的取消**挡回去 ⇒ **周期事件从此不可取消**。
  · ② **`opId` 必须按次重钉**：沿用旧键会让 `repeat` 第二次到点时**被自己的台账判成重复回执** ⇒ **周期事件只能执行一次**。schema 同步在 `schedule()` 与 `replace()` 两处新行构造里加 `claims: 0`。
  · ③ **终态必须清空 `opId`**（顺带发现的第三级洞）：台账被挤出（有界）后，一笔早已跑满的周期事件会从 `exhausted` 被**重新认领执行**——**终态可回卷**。改为在 `exhausted` / `failed` 两处清空。
  · ④ **回执键优先级「调用方优先」**：行上优先时，一笔**迟到回执**会被记到「回收后新一次尝试」名下，**新尝试自己的回执随后被判成重复**——救回来的活反被旧回执挡死。
- [x] **容器两侧登记（容量纪律的实证）**：`events.res` 登记进挤出侧 `core/evict.js` 的 `SITES`（`cap: 'per-call'`，上限由调用方每次传入；**传漏即 `bad-cap` 归因**，因为「悄悄回落到一个默认值」正是登记表与执行漂移的起点）+ 容量侧 `core/store.js` 的 cap 表（`cap: 24`），写入走 `WA.evict.array(e.res, 'events.res', settings().maxFails)`（**与 `failQueue` 同界**）。`tests/run.js` 加一条断言直接读 `WA.evict.siteDecls()` 验证登记在场。
- [x] **收口期门禁实跑抓到的第五处真缺陷（同一族病的第三面：登记了容量却没物化）**：六道门禁 + 读数面全绿、专锁 74/74 之后启动全量回归，回归在 `■ v0.3.0 存储救援体系` 段报 **13 处红**（`干净库健康分 100/ok`、`干净库无容量议题`、`正常态 registryParity ok=true missing=0`、`checked 精确值 83`、`补 people={} 后回归 ok` …）。**根因只有一条**：本版给 `events.res` 做了**容量侧登记**（`__BOUNDED_CAPS` 精确键），却没在 `core/store.js` 的 `defaultWorldState` 骨架里**物化**（骨架仍是 `events: { rows: [], failQueue: [] }`）⇒ `registryParity()` 报 1 条「未在骨架物化」⇒ `maintain` 扣健康分并升 `capacity.unmaterialized` 议题 ⇒ 13 条断言连带红。**骨架里那句注释早就写着这个病**：「登记了容量却不在骨架里，冷启动直写会炸事务」。
  · 修法：`events: { rows: [], failQueue: [], res: [] }`（并补上方注释说明为什么必须同步物化）；两处 `checked === 83` 跟到 **84**（`tests/run.js` 6838 与 16043 行，含沿革段字面保留）；顺带把 `engines/events.js` 的 `ensure()` 重建分支从 `{ rows: [], failQueue: [] }` 补成 `{ rows: [], failQueue: [], res: [] }`（该分支靠下一行 `if (!Array.isArray(...res))` 兜住，但**两处口径应逐字一致**）。
  · 为什么这条必须留痕：它是 v2.112.0→v2.114.0 那条容量欠账纪律的**镜像面**（那次漏的是「挤出侧」，这次漏的是「物化侧」）。本仓的容量登记是**三处同源**——`evict.SITES`（挤出）/ `store` cap 表（容量）/ `defaultWorldState` 骨架（物化）——**少一处就是一条静默的自我不一致**，而它只在 `maintain` / `registryParity` 这两条不那么高频的路径上现形，常规单测看不见。
- [x] **验收（本版）**：全量回归 `node tests/run.js`（经 `isolated-runner`、候选树 `unchanged` 校验）→ **通过 10177 / 失败 0 · Status: passed**（v2.115.0 为 10095/0，+82 = 新专锁 74 + `run.js` 本版内联判据）；专锁 `tests/events-a2-v2116.js` **74/0**（六把破坏锚点 `budget`/`owner`/`lease`/`reclaim`/`dup`/`opid`/`cancel` + N0–N4 负控制 + localStorage 哨兵）；六道门禁全绿 —— `export-contract` **`ns= 116 members= 731 chars= 8667` 逐字未变**（A2 全段在既有导出内部完成）、`reject-code-gate` pass（产品文件 125 / 内联码 **401** / 见证 **163** / 死表 5 / 基线 233）、`test-surface-gate` pass（文件面 **118** / 锁 **113** / 可达 118 / 孤儿 0）、`module-cycle-gate` pass（文件 125 / 边 **940** = 装载期 25 + 调用期 915 / 环无）、`module-registry-gate` pass（文件 121 / 命名空间 129 / 硬边 0）、`dead-export-gate` pass（dead **505** / uiDead 4 / dataOnly **191**，`--update` 后**逐字不变**）；读数面 `readings` problems 0 / `ledgerVersion 2.116.0`、`readings-v2106` **58/58**（`refs 2756 → 2758` 回填 **3/3** 站点）、`gen-error-codes --check` 双向一致。
- [ ] 未覆盖（如实留档，不伪称已完成）：`events.res` 与 `failQueue` **同界**，极久之后的重放**无法去重**（那时它读到的是终端用户视角的「一笔新事」，不是「同一笔的重放」）；租约只解决「卡住的认领」，**不解决「同一笔被两个执行者同时做完」**（那需要外部互斥，本模块不做）；`leaseMs` 默认 0，恢复协议要调用方**显式打开设置**才生效；`_turn`（life.js 轮转游标）是进程态、跨会话不延续；**UI 层仍未做实机验证**。

## v2.121+ 优化提升计划（P1–P8：把「已经知道、却没法证明 / 没法重放 / 玩家看不见」那层补起来）
起点：v2.120.0 / 全量回归 11858/0（收口见 `ITERATION_LOG.md` R108）。本计划是优化线的第 N 代（A1–A6 → O1–O16 → 本 P1–P8），原料全部来自 `FOUR_VERSION_PLAN.md` 里「如实留在清单，不伪称已完成」的未覆盖项 + R105 的病灶诊断。核心命题一句话：**不追求「更快更强」，只把「已经存在但不可证」的东西变成「可证」**——可复现性、可观测性、性能诚实、边界收口。每项都必须过 `## 完成纪律`：实现路径 + 真实消费者 + 正反判据 + 运行证据，不能以新增导出或文件存在标记完成。
- [x] **P1 取证持久化（审计卷）**（v2.121.0 交付）：
  · `core/audit-log.js`：增加 `exportVol`（导出审计卷）、`inspectVol`（校验卷完整性）、`verifyVolWith`（带外卷核对，逐行与内存环交叉校验，报 `mismatch` / `truncated` / `ok`）。
  · `ui/panel.js`：新增导出审计卷与核对审计卷入口；`engines/tool-diag.js`：`secAudit()` 真读审计卷，消除死面。
  · 验收：专锁 `tests/audit-vol-v2121.js` 71/0（结构 / 运行时 / 零状态 / 拒收 / 负控制真源码破坏）；三族硬读数回填 `refs 3178 / members 1746 / dead 607`；出口契约 `128 / 869 / 9882`；死面账本 611 条；拒收码 601 码；本轮未跑全量回归（见 R109）。
  · 本版未覆盖（如实留档）：磁带（causal tape）跨会话落盘通道留待后续；不替宿主写盘（沿用 O6 纪律）；UI 未做真机联调。
- [x] **P2 每轮执行解释下到「预算折叠 / 丢弃」层**（v2.122.0 交付）：O3 的 `explain` 只到源级 ⇒ 玩家看到「这源没了」却不知是被折叠还是丢弃。
  · 路径：`render/inject.js` 的 `sourceDecisions` 加 `budgetOutcome` 事后归因，**不改 47 条注入分支**（v2.56.0 教训）。
  · 消费者：`ui/panel.js` 注入段。
  · 正判据：改一条触发折叠后能逐项说出「哪条挤掉了哪条」；反判据：折叠路径无解释 ⇒ 红。
  · 本版不做：不在分支上长记账点。
  · 落地四段：① `engines/inject-budget.js` 的 `plan()` 内占位账 `occupied` + 四处裁决分支各补一次 `occupied.push`，`remainAt` 照实（pinned 保底可负，不钳零）；② `render/inject.js` 的 `sourceDecisions` 收第四参 `budgetBySource`，逐源带 `budgetOutcome`；③ `explain()` 追加 `foldedDetail` / `droppedDetail` / **`unmappedDetail`（块级出口）** 三个切片；④ `ui/panel.js` 全知分支逐项渲染（`[折叠]` / `[丢弃]` / `[折叠·块]` / `[丢弃·块]`），玩家分支未动。
  · 验收：专锁 `tests/explain-budget-v2122.js` **67/0**（runAll 48 + runNegative 19，四条负控制走真源码破坏副本）；恒等式 `remainAt + ΣblockedBy.tokens = cap` 实测三例全成立（纯观测的证据）；`test-surface-gate` 139 文件 / 134 锁 / 孤儿 0；`readings` 58/58；出口契约与拒收码**零变化**（本版加的是字段不是导出）；本轮未跑全量回归（见 R110）。
  · 判据逼出的**真缺口**（计划里没写、本版当场补掉）：`decisions` 每行只对应 `SOURCES` 里的一个源键，而「世界状态」是六个快照源合成的**块名**（不在源表内），它被折叠时在解释面上无处落名 ⇒ 补块级出口，而不是往 `decisions` 塞行（那会碰 v2.91.0 的宽度判据）。
  · 本版未覆盖（如实留档）：`blockedBy` 记的是**裁决顺序上的占位者**，不是「谁该负责」（预算裁决只有先后、没有因果归属）；UI 只有无头静态核验，未做浏览器实机联调。
- [x] **P3 增量 / 局部重算观测**（v2.123.0 交付）：O1 只到「单源构建耗时」⇒ 改一条人物要重算多少、哪些源级联重算不可见。
  · 路径：`inject-budget` 加 `incrementalCost(costs, opts)` 观测面（只观测、不做真增量优化）。
  · 消费者：① `render/inject.js` 在唯一引擎调用出口之后真调它、把读数落进 `lastInjection.recalc`；
    ② `ui/panel.js` 的「本轮注入」段逐字段渲染（重算 N 源 / 跳过 M 源 / 脏键 / 复用读数）；
    ③ `render.explain()` 的 `omniscient.recalc` 透传（解释面与存档同一批事实）。
  · 正判据：改 1 个 NPC 后报「重算 N 源 / 跳过 M 源」；反判据：声称跳过却仍重算 ⇒ 红。
  · 落地三段：① `inject-budget.js` 新增 `incrementalCost`——源面取**本模块自己的** `PRIORITY` 键表
    （不引 render 侧 `SOURCES`：两张表各有各的面，硬同步即新造第二套真源），`touched` 取自现场耗时台账
    （只认 known 里的源名，不认识的名字单列 `unrecognized` 而不是静默并入），`untouched = known − touched`，
    不变式 `touched ∩ untouched = ∅` 且并集 = known；② `render/inject.js` 新增 `worldDirtyKeys()`——
    键级指纹（复用 `timeline.hashText`，不新造第二份实现）对上次采样逐键比对，`meta` / `lastInjection`
    两个每轮必变的键跳过，`stateRev` 未变则不重复采样（不然每轮序列化 68 个顶层键会污染它要观测的成本账），
    首轮如实报 `first`、删键以 `-key` 报出；③ 落盘点写 `recalc:`、`explain()` 透传 `recalc`。
  · **一条主动裁决（不写进计划书、本版当场定的）**：**不把 `perfTrace.partial()` 接进注入链**——
    它一旦发现世界步进变了就会重跑四个面（含重量级 `toolDiag.collect()`），把一次体检挂进每轮注入链
    正是本仓点名的「观测污染被观测者」。故 `reuse` 面**如实报缺**（`reuseKind:'absent'`，
    不拿空数组冒充「一次都没复用」），由面板的增量面按钮另行真跑。
  · 验收：专锁 `tests/perf-recalc-v2123.js` A/B/N 三段（P3 部分）· 面板与诊断两处真消费方判据在位；
    实测「改 1 个 NPC ⇒ 报脏键 people / 重算 53 源 / 跳过 3 源（源面 56）」；
    两轮注入后 `partialCalls` **未增**（观测不触发基准的可判形态）。
  · 本版不做：不做真正的增量计算（那是功能，属拓展线），先把「重算了什么」变成可观测。
- [x] **P4 性能基准三档对照（短 / 中 / 长 + 本地 / API 分列）**（v2.123.0 交付）：O1 只单点 ⇒「够快吗」没基准；本地引擎与 API 耗时混在一起。
  · 路径：`perf-trace` 加 `bandCompare(opts)`；基准随墙钟漂移（v2.119 族⑥病）⇒ 改无条件断言锁项数恒定。
  · **计划书与实现的一处出入（以实际为准）**：`baseline(layer)` 与四档 `CLASSES` / `CLASS_DEF`
    （short / medium / long / lowend）**本已存在**（v2.102.0），故本项补的是**档位之间的对照面**，
    不是新造 `baseline`。
  · 消费者：① `engines/tool-diag.js` 的 `secPerfTrace` 真读（且传 `dryRun: true` —— 诊断是旁观，
    不跑基准）；② `ui/panel.js` 新增「档位面」按钮，逐档渲染合计 / 本地 / 序列化 / 宿主 API / 样本。
  · 正判据：四档各有 `minSamples` 且本地 / API 分列（`splitKeys` 四键，每档 `split` 键集合一致）；
    反判据：基准不可复现 ⇒ 红。
  · 落地两条口径（都在读数上可见，不止写在注释里）：
    ① **每档的本地 / API 读数取本档前后的差值**，不是全局累计 —— `_span` 是自装载以来的累计桶、
       跨档只增不减，直接读它第四档会把前三档跑过的量一起算进来（读数看着有值、却没有归属）；
    ② **宿主 API 无读数就如实说无读数**（`apiReported:false` + `undeclared` 含 host），
       绝不拿 0ms 冒充「API 很快」；`lowend` 是同机放大估计（`approx:true`），单列 `judgeable=false`
       **不参与判定**；`dryRun` 只报结构面、不跑任何一档。
  · 验收：专锁 `tests/perf-recalc-v2123.js` C/D/N 三段（P4 部分）；
    实测「四档 `split` 键集合一致 · 各档 local 差值之和 287 ≤ 全局累计 287 · 每档 `minSamples` 8 与现场样本数可复算」。
  · 本版不做：不做自动调优；基准只是对照面，不参与任何判定。
- [x] **P5 权限闸门接进删除出口（v2.124.0 交付；计划书字面目标部分早在 v2.113.0 达成）**：`core/permissions.js` 的判定「尚未接进任何写路径」（v2.111.0 留档）⇒ 机制立着但没人拦。
  · 路径：`core/store.transact` 前置点接 `permissions` 判定；越权写走 `permission-denied` 拒收且不落盘。
  · 消费者：`core/permissions`（被 `transact` 真消费）。
  · 正判据：无授权写被拒且无副作用；反判据：闸门在 `save()` 但 `transact` 旁路 ⇒ 红。
  · 本版不做：不扩展到 transact 之外的全部写路径（如实留档），先接主流。
- [x] **P6 玩家可见的「引擎心跳」（v2.124.0 交付：挂在既有概览页，不新增页签）**：玩家根本不知道引擎在不在转 ⇒「这扩展有用吗」答不出（R105 只治了机制层不可判定，没治玩家层）。
  · 路径：`ui/panel.js` 新增「心跳」区，聚合 `perf-trace` + `causal.stateView()` + `inject-budget.costView()`。
  · 消费者：面板（三源都是既有真消费方，非幽灵绑定）。
  · 正判据：一页看到「本轮重算 X 源 / 推进 Y 链 / 耗时 Zms」；反判据：UI 幽灵绑定 ⇒ `ui-wire-audit` 红。
  · 本版不做：UI 层不实机验证（如实留档，沿用 P-实机约定）。
- [x] **P7 沙箱真实面收口（v2.125.0 交付：sandbox.isolationReport）**：`core/sandbox.js`「只能隔离可见面」，异步与内存不隔离（v2.114.0 留档）。
  · 路径：`sandbox` 加 `isolationReport()`，如实列出「隔离了什么 / 没隔离什么」。
  · 消费者：`tool-diag`。
  · 正判据：报告与实测一致；反判据：报告与实测不符 ⇒ 红。
  · 本版不做：不做真异步 / 内存隔离（成本与收益不成比，照 A6 先例可判「明确不做」）。
- [x] **P8 负控制锚点审计覆盖到非统一锁（v2.126.0 交付：tools/anchor-scan.js，只报不红）**：现审计只覆盖「导出 `ANCHORS` 且形态统一的锁」（10/62，v2.104.0 留档）⇒ 其余 52 把锁的锚点无人核。
  · 路径：`tools/` 新增锚点扫描器，先覆盖形态统一的，形态不一的如实归 `unidentified`（只报不红）。
  · 消费者：`tests/run.js`。
  · 正判据：扫描器报出「形态统一的锁里锚点非唯一」⇒ 红；反判据：漏报 ⇒ 负控制红。
  · 本版不做：不强求覆盖全部 62 锁。
- [ ] 未覆盖（如实留在清单，不伪称已完成）：P 线全部落点是「观测与判据」层，**不做任何「让它更快 / 更强」的实质优化**——那需要基准先行，而基准正是 P3 / P4 要立的；P6 心跳页是只读观测面，**不改任何世界行为**；P8 的扫描器只读不写。

## v2.125+ 功能拓展计划（X1–X8：世界已经「会转」，下一步让它「会沉积、会记得、会远方、会联网」）
起点：v2.120.0 / 全量回归 11858/0。本计划是拓展线的第 N 代（B1–B7 → X1–X6 → 计划二 B1–B9 → 本 X1–X8），核心命题：**R105 刚补上八个机制治了「机制的不可判定」，本线治下一层——机制在了，但没有时间深度、没有空间广度、没有玩家入口、没有跨会话身份**。每一项都对应 R105 病灶诊断出的一个具体「不可判定」，把它变成「可判定」。维度标注：深度 = 往时间 / 认知的纵深挖；广度 = 往空间 / 组织的横向铺；新功能 = 目前完全缺席的方向。
- [x] **X1 长期意图链（plan 深化 · 深度）**（v2.127.0 交付：`plan.chain` / `chainBlock`，专锁 `tests/x1-chain-v2127.js` 54 项）：`life.goals` 只有单格 `goal.next`，「长期意图」退化成一句注释（R105 ①的病）。
  · 路径：`engines/plan.js` 加 `chain(goalId)`——这步之后干什么、要什么前置、卡在哪。
  · 消费者：`backstage` 推演。
  · 正判据：三步意图能逐步推进并报「当前第几步 / 缺什么前置」；反判据：跳过前置直接到位 ⇒ 红。
  · 本版不做：不做 AI 自动规划（只结算显式声明的链）。
- [x] **X2 世界沉积层（L3 → 编年史 · 深度）**（v2.127.0 交付：`chrono.chronicle` / `buildBlock`，专锁 `tests/x2-chronicle-v2127.js` 54 项）：记忆已有 L0–L3，但没有跨章节的「世界编年史」——把 L3 长线沉淀压成「这个世界发生过什么大事」的可注入叙事层。
  · 路径：`engines/chrono.js` 加 `chronicle()`；`render/inject.js` 新注入源。
  · 消费者：注入面。
  · 正判据：三章后编年史按时间列出大事件且不剧透 hidden 级；反判据：hidden 事件进编年史 ⇒ 红。
  · 本版不做：不改写只切分（沿用 canon 取舍）；不替世界书写设定。
- [x] **X3 远方持续演化（region 收口 · 广度）**（v2.128.0 交付：`region.tickOffline`，专锁 `tests/x3-offline-v2128.js` 76 项）：R105 ⑥的病——「玩家离开后那地方还在变吗」。
  · 路径：`engines/region.js` 加 `tickOffline(draft, now)`，远方天气 / 事件 / 经济按世界钟独立结算。
  · 消费者：`regional` / `weather`。
  · 正判据：离开 N 轮后回来，远方状态有推进且非玩家可见；反判据：远方只在玩家注视时才动 ⇒ 红。
  · 本版不做：不做全图全结算（只结算登记了的 region，控成本）。
- [x] **X4 认知冲突裁决（probe 收口 · 深度）**（v2.128.0 交付：`probe.resolve`，专锁 `tests/x4-resolve-v2128.js` 61 项）：R105 ⑤的病——「两条线索互相打脸怎么办」，`intel` / `enigma` / `rumor` 各自成立但无裁决。
  · 路径：`engines/probe.js` 加 `resolve(conflictId)`，按证据强度 × 来源可信度裁决。
  · 消费者：`rumor` / `intel`。
  · 正判据：冲突两线索给出「采信谁 / 为什么 / 存疑什么」；反判据：一有线索直接真相大白 ⇒ 红。
  · 本版不做：不做跨链合并、不做自动层推断（沿用既有取舍）。
- [x] **X5 组织制度落地（inst 收口 · 广度）**（v2.128.0 交付：`inst` 审批链 / 职权表 / 继任规则，专锁 `tests/x5-inst-v2128.js` 39 项）：R105 ④的病——`org` 答不出「制度」（要不要批准、谁能拍板、离任后在途项目归谁）。
  · 路径：`engines/inst.js` 加 `approve(actionId)`——审批链 + 职权表 + 继任规则。
  · 消费者：`org`。
  · 正判据：越权行动被 `no-authority` 拒收；离任后在途项目明确归属；反判据：谁都能拍板 ⇒ 红。
  · 本版不做：不做跨势力调动（一人一势力一职阶，沿用 X2 取舍）。
- [x] **X6 多会话 / 协作身份（session 收口 · 新功能）**（v2.128.0 交付：`session.identify`，专锁 `tests/x6-session-v2128.js` 41 项）：R105 ⑧的病——`coop` 是「单机上的多个身份」，答不了「这个人是谁、授权到哪」。
  · 路径：`engines/session.js` 加 `identify(token)`——身份注册 + 授权范围 + 操作归属（依赖 **P5** 权限闸门先接进写路径）。
  · 消费者：`core/permissions`。
  · 正判据：未授权身份的操作归 `anonymous` 且受限；反判据：身份冒充无痕迹 ⇒ 红。
  · 本版不做：不做真实多人联网（只做同机多身份的可判定边界）。
- [x] **X7 题材生成差异对照（B7 收口 · 深度）**（v2.128.0 交付：`theme.contrast`，专锁 `tests/x7-contrast-v2128.js` 45 项）：B7 只到「模块是否进注入面」，没做「同场景不同题材生成差异」对照实验（v2.87.0 留档）。
  · 路径：`engines/theme.js` 加 `contrast(themeA, themeB)`，对同一世界快照在两种题材下的注入面做结构 diff。
  · 消费者：`render/inject.js`。
  · 正判据：能列出「题材 A 注入了 X 源而 B 没有」；反判据：两题材注入完全一致 ⇒ 红（说明题材没真影响）。
  · 本版不做：不做生成内容质量评判（只对注入面做结构 diff）。
- [x] **X8 跨插件业务闭环验证（三插件实机协议 · 新功能）**（v2.128.0 交付：`bridge.handshake`，专锁 `tests/x8-handshake-v2128.js` 42 项）：`separation()` 报三插件分工，但无头下 `engine-absent`，真机联调只能靠人（v2.87.0 / v2.101.0 留档）。
  · 路径：`engines/bridge.js` 加 `handshake()`——`worldaxis_bridge_v1` 的版本化握手 + 缺席降级可见（依赖 **P1** 持久化做跨会话凭据）。
  · 消费者：`theme.separation`。
  · 正判据：三插件在场时握手报版本匹配；缺席时如实降级不写死「已接入」；反判据：缺席却报「已接入」⇒ 红。
  · 本版不做：不在无头环境伪称实机已验证（如实留档，沿用 P-实机约定）。
- [ ] 未覆盖（如实留在清单，不伪称已完成）：X6 / X8 分别依赖 **P5 / P1** 先落地（P 线是 X 线的地基）；X1 / X4 只结算**显式声明**的链与冲突，不做 AI 自动推断；X2 / X3 的注入都受既有可见性双轴约束，hidden 级绝不进正文；全部八项的 UI 层仍不做实机验证（沿用 P-实机约定，如实留档）。

## v2.137.0 UI 实机验证通道（O 线优化提升 O14）
- [x] **O14 UI 实机验证通道已交付（v2.137.0）**。它治的病是本仓**长寿的一处未覆盖项**：
  自 v2.103.0 起每一版都如实写着「**UI 层仍未做实机验证**（`ui/panel.js` 在无头回归里不装载）」，
  而全部 UI 结论建立在 `tests/ui-dom.js` 的 mini-DOM 替身上 —— 替身与真浏览器有一处
  **返回值类型**差异：`querySelectorAll()` 在替身里返回**普通数组**、在真浏览器里返回 **NodeList**
  （有 `forEach`、**没有 `filter`**）。于是 `querySelectorAll(...).filter(...)` 这一族链
  在替身里永远过、在真机上一律抛。
- **接通真浏览器后第一次运行就抓到活体**：`ui/panel.js` 的 `#wa-inj-diag`（注入页「去自检」，
  把用户送到工具页并点「跑诊断」的那一枚）在真机上**整枚控件不可达**
  （`TypeError: panelEl.querySelectorAll(...).filter is not a function`），而**全库零告警、所有既有门禁全绿**。
  修法：`Array.prototype.filter.call(panelEl.querySelectorAll('.wa-tab'), ...)` ——
  对数组与 NodeList **同时成立**，不依赖调用面类型。
- **落地**：`tests/ui-live.js`（真浏览器通道：`route.fulfill` 从磁盘喂源码、真 `localStorage` 往返、
  14 页 728 个控件逐个点）＋ `tests/ui-live-v2137.js`（版本专锁：A 结构面 / B 运行时 / C 负控制五条，
  **每条两向**）；`tests/run.js` 新增子进程调用点（真跑整套，**不是文件在场**）；
  `tests/dependency-guard.js` 的 `OPTIONAL_DEPS` 由 1 项扩到 2 项（`playwright-core`，带 reason / fallback /
  fallbackProof / affects）；`tests/gate-timeout.js` 的 `TIMEOUT_ARMED` / `ARMED_SITES` / `GATES` 三表各加一条。
- **口径**：只验证**已有控件**（不造新 UI）；**不验证排版与像素**；宿主缺席时如实降级 `engine-absent`
  （读数标 `host: 'stub'`）；`probe()` 三档 + **降档必带非空 why，不许静默通过**。
- **收口读数**：`files=165 loaded=165 pages=14 controls=728 thrown=0 rej=0 pageErr=0 roundtrip=ok`；
  专锁 `runAll 29 / 0` + `runNegative 48 / 0` = **77 项**；`gate-timeout` 自洽零问题（现场调用点 12 = 武装表 12）。
- **本版不做**：不做排版/像素级回归；不覆盖 `index.js` 的 CDN 多源容灾链（页面走磁盘喂源码，不起 HTTP）；
  不在无浏览器环境伪称实机已验证（降档可见，读数会变少但 **不许假称通过**）。
- **本项对「两份计划协同点」的兑现**：O14 原计划定位就是「覆盖全部新面板入口」的底座 ——
  本版把**通道本身**接通并钉住，E 线后续新增面板入口可直接复用同一个 `runLive()`（无需再造一条通道）。

## 两份计划的关系与落地次序
- **P 线是 X 线的地基**：X6（身份）依赖 P5（权限闸门）、X8（握手）依赖 P1（持久化）⇒ **先 P1 / P5，再 X6 / X8**。
- **版本节奏**：P 线建议 v2.121–v2.124 四版（每版 2 项），X 线 v2.125–v2.128 四版（每版 2 项）；每版收口才同步 `index.js` / `manifest.json`，未完成不提前升版（沿用既有纪律）。
- **验收基线**：从 11858/0 出发，每项新增专锁挂进 `tests/run.js`，净增断言数如实记录；出口面变动必回填 `FROZEN2800` 与清册；每项的「本版不做」与「未覆盖」如实留档，不伪称完成。

## 完成纪律
- 每项需附实现路径、真实消费者、正反判据、运行证据，不能以新增导出或文件存在标记完成。
- node tests/run.js 是全量入口；无头通过不替代实机。
- 每版收口才同步 index.js / manifest.json 版本，提交并验证远程；未完成不提前升版。
- 未解决项必须留在清单中；本轮无法完成的内容不得伪称后台持续执行。
