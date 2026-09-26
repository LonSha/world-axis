# WorldAxis 四版本执行清单

授权：用户要求将优化 A1–A6、功能拓展 B1–B7 全部按四个版本完成。
起点：v2.83.0 / d5aa9e2。本文是执行跟踪，不是已交付声明。

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
- [ ] A3（O16 维护工具与 UI 运行质量）待做。**本版已登记一处与 O16 直接相关的现场发现**：`tests/run.js` 的 H4 块（UI 绑定守卫的真 DOM 端到端断言）依赖 `require('jsdom')`，取不到时只打印 `⚠ jsdom 不可用，跳过块8 端到端断言（静态锚点已覆盖）` 便**静默放行** —— 「缺依赖 ⇒ 静默 skip ⇒ 门禁全绿」正是 O16 要治的病，本会话只做发现与登记，未改动。

## 完成纪律
- 每项需附实现路径、真实消费者、正反判据、运行证据，不能以新增导出或文件存在标记完成。
- node tests/run.js 是全量入口；无头通过不替代实机。
- 每版收口才同步 index.js / manifest.json 版本，提交并验证远程；未完成不提前升版。
- 未解决项必须留在清单中；本轮无法完成的内容不得伪称后台持续执行。
