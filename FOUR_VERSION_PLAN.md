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

## v2.89.0 优化线推进（O1–O5 / X1–X5 两份计划：O1–O3 已交付）
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
- [ ] O4–O5 未开始：O4 因果与状态批量治理（A3 的开关全组合）；O5 资源账本健康面（B3 经济侧先观测）。
- [ ] X1–X5 未开始（见功能拓展计划）：X1 UI 实机验收通道；X2 B3 经济引擎；X3 B4 传播与辟谣；X4 B2 天气灾害封锁联动；X5 跨插件因果桥。

## 完成纪律
- 每项需附实现路径、真实消费者、正反判据、运行证据，不能以新增导出或文件存在标记完成。
- node tests/run.js 是全量入口；无头通过不替代实机。
- 每版收口才同步 index.js / manifest.json 版本，提交并验证远程；未完成不提前升版。
- 未解决项必须留在清单中；本轮无法完成的内容不得伪称后台持续执行。
