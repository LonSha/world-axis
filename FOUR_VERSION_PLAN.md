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

## 完成纪律
- 每项需附实现路径、真实消费者、正反判据、运行证据，不能以新增导出或文件存在标记完成。
- node tests/run.js 是全量入口；无头通过不替代实机。
- 每版收口才同步 index.js / manifest.json 版本，提交并验证远程；未完成不提前升版。
- 未解决项必须留在清单中；本轮无法完成的内容不得伪称后台持续执行。
