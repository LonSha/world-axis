# Agent Note: 跨参照物缝合批 —— 从 npc-life 与 st-4a-guard 反向定位本仓的真缺口

Status: implemented

## Problem

本仓在 v2.409.0 之前有三处长期未被"报告层"覆盖的缺口，它们各自的形态不同，但缺的东西是同一种：

**① 时间流逝只有字段，没有证据链。** `deltaMinutes` 在 `engines/action-desk.js`、`engines/mood-glide.js`、`engines/toxic-metabolism.js` 里都出现——但三处都是**已经算好的入参**。全仓没有任何一处从正文明文里取时长证据。于是「三天后」与「如果你明天来」在算术上同形：两者都含"三天"两个字，都可能被上游写成 `deltaMinutes: 4320`。这不是精度问题，是把假设当事实的问题。

**② 来源审计只报告，不处置。** `engines/timeline.js` 的 `auditRefs` 能算出 `valid / inherited / changed / missing` 四态，这是真能力。但它止步于报告：正文第 42 层被编辑之后，所有依赖那一层推出的后续（计划推进、状态迁移、事件投影）仍挂在上面，没有任何机制撤销它们。`stale-guard` 判陈旧、`core/undo.js` 做单次操作回退——中间那一层"来源驱动的跨回合后缀撤销"是空的。

**③ 长跑只有总时长闸，没有中途观测。** `tests/isolated-runner.js` 的超时机制是单闸：`opts.timeoutMs` 到了就 SIGKILL，然后靠日志尾部正则还原"跑到哪一节"（v2.131.0 O15①）。现场两次读数（V23 单节 405 秒、旧 L2 层 240 秒 SIGKILL）暴露了后果：「正在跑」与「已卡死」在 `run.log` 上完全不可区分——两者都是"最后一行不再增长"。「无输出」与「有输出但无内容」也被算成一件事，而慢节预热、GC 抖动、死循环三种形态的修法完全不同。此外单趟上限固定 10 节与实测耗时无关，在 240s 预算下结构性超时。

**为什么现在做**：本轮同时拿到了两个外部参照物——`muzi9277/npc-life` 3.0.0-beta.4（9 个运行文件 4101 行）与 `xxs-ddc/st-4a-guard` v4.3.1（Tavern Helper 单脚本 6852 行）。逐条对照后发现，上面三个缺口在参照物里都有成熟解法，且解法形态与本仓纪律兼容。这是"有外部证据支撑的最小改动"的时机。

## Decision

新增三个只读判据引擎与一个工具侧观测器，全部**默认关闭、零 store 写、零落盘、零模型调用、零网络**；连同各自门禁一批落地。

### 一、`engines/elapsed-evidence.js` — 时间流逝的证据解析器

来源：npc-life `world-service.js` 的 `parseElapsedEvidence` 与 `autoMinutes`。

判据按**四层拒绝**排列，每层对应一种真实误读形态：

| 层 | 状态机 | 拦的形态 |
|---|---|---|
| 0 | `explicit-zero` | 「没有时间变化」「同一时刻」——**先于**所有拒绝层，因为它自身带否定词 |
| 1 | `quoted` | 「他说「等五分钟」」——引号内是别人说的话 |
| 2 | `hypothetical` | 「如果你明天来」「大约两小时后」 |
| 3 | `need-cost` | 「这趟需要三个小时」——说的是要花多久，不是过去了多久 |
| 4 | `past-or-negated` | 「三天前就说过」「没过几分钟」 |

抓取阶段还有三道自我保护：多段时长之间只允许连接词（否则 `multiple-durations`，不折算）；单位外残留任何时长单位即 `residual-unit`（防「三天又五小时」被截成 4320）；结果必须是 0–10080 的整数分钟（`MINUTES_CAP`）。

**本引擎相对"单纯正则"的全部增量在 `verify()`**：模型声称的分钟数必须能被原文证据逐字推出**且完全相等**。正则只能判"文本像不像时长"，只有双重校验能判"模型这次算得对不对"。`autoMinutes()` 在此基础上再加两道：`timeConfidence >= 0.9`、`timeEvidence` 必须是原文子串、且证据所在**分句**不得是假设/引用/未来（`clause-*`）。

自带中文数字解析（扩到百/千/万，兼容 `backstage-tone` 的 0–99 口径）。**刻意不与 `backstage-tone` 互相调用**：宁可重复 12 行，也不让证据层对 presentation 层产生装载时序依赖。

### 二、`engines/source-reconcile.js` — 来源编辑 → 依赖后缀撤销 + 复合票据

来源：npc-life `world-service.js` 的 `capture` / `current` / `reconcile` 与 `timeline.js` 的 `undoTurns`。

**前缀比对是本模块唯一的"不失效"分支所在**，也是最容易被写错的地方：

- `switched`（key 变了）/ `edited`（hash 变了）/ `deleted`（变短）⇒ `blocking: true`
- `appended`（变长且旧前缀逐位一致）⇒ `blocking: false`——**新消息不会让旧结论变错**

撤销用 `turns[from].before` 完整快照，不做逐回合反向打补丁：补丁本身依赖被撤内容时会漏，完整快照不会。`clockMinutes` 也随快照回退——"时间属于状态"的直接后果，不是额外发明。`revision` 则**前进**（撤销是一次新写入，不是回退版本号）。

去重靠 `invalidReconciliations` 里的漂移指纹（`kind:index:actual`），同一漂移反复对账返回 `repeated: true` 且不再产出新 `revoked`。被撤记录按正序**回带**给调用方，不静默丢弃。

复合票据七项：`identity / chat / world / stateRevision / revision / signature / sourcesDigest`。逐项而非整体哈希——整体哈希变了还得人工找出是哪一项，而这里的判据只是"要不要丢"。

### 三、`engines/plan-roster.js` — 计划准入三件套

来源：npc-life `timeline.js` 的 `memberProblem` / `validatePlan` / `neutralAction` / `completionEvent.knownBy` 与 `world-service.js` 的 `planningCursor`。

1. **同行闭包完整性**：`party.confirmed !== false` 且成员集必须**全覆盖**（不能带一半走）；成员必须 `tracked && confirmed && !archived && !ignored`；`in_transit` / `arrival_ready` 不可再动；`locked` / `activityLock.active` 不进新计划。
2. **角色游标轮转**：每轮给一个独立角色或一个**完整同行闭包（≤6 人）**，`nextCursor` 按批长度推进。治"点名偏食"——规划器只看最近提到的两三个人，世界越跑越薄。
3. **封闭动作白名单（27 项）**：白名单外不是"不允许发生"，而是**不允许由计划引擎单方面认定为已发生**。要发生得走显式事件通道。开放词表做不到这条边界。
4. travel 必须有已确认路线且 `durationMinutes` 是正安全整数；完成事件走固定模板（`${names}抵达${place}` / `${names}完成了事先计划的${summary}`），不交给模型发挥。
5. `knownBy` 只在"玩家地点 === 事件地点 且 有成员在场"时加 `'player'`——与 `UNMENTIONED ≠ ABSENT` 对称的另一条：**没写到的知情 ≠ 已知**。

### 四、`tools/run-observer.js` — 长跑观测器

来源：st-4a-guard `STREAM_POLICY` / `observeStream` / `STREAM_LIMIT`。

四件读数，四态分级（`ok → slow → stalled → oversize`，优先级从右往左）：

1. **本地心跳 15s**：子进程无输出时由观测者**自己**生成心跳行。心跳是"观测者还活着"的证据，**不是**"子进程有进展"的证据——这条区分是整套机制的全部要害。
2. **双口径空闲**：`idleMs` 距最后一次任何字节；`idleContentMs` 距最后一次有内容的行（非心跳、非空行、非纯进度点、非纯计时行）。90s 告警、240s 判停滞。
3. **增量预算**：`suggestSections(perSectionMs)` 按"剩余预算 ÷ 单节均耗"给建议，只给建议不改调度器——固定 10 节与实测耗时无关，这是结构性超预算。
4. **硬上限 8MB**：**在 `feedChunk` 按字节块累计，不按行累计**。自测发现：若等换行才算字节，`hardBytes` 会在"一直在吐半行"的形态下永远不触发。

`flush()` 必须在子进程结束时调用：末行若没有以 `\n` 结尾（SIGKILL 前正好写了一半），它永远不会成为"完整行"，`lastSection` 就停在上一节——恰好把最有用的读数丢掉。上游 `observeStream` 的 `boundary` 判据同理。

### 关键边界：为什么观测器没塞进 `isolated-runner.js`

O6 门禁 `tests/o6-layer-gate-v2187.js` 的 **N5 负控制**要求 `run.js` / `test-layers.js` / `prune-sections.js` 逐字未变。本批把观测器做成**纯新增文件**，接线点在调度器侧；`isolated-runner.js` 的 diff 属于其他批次，本批未触碰。

这把纪律**锁进了判据**：`cross-ref-stitch-v2409.js` 的 T5-9 断言 `prune-sections.js` 不含 `labelUnits`，T5-10 断言 `isolated-runner.js` 不含 `run-observer`。

### 接线四处口径同批（缺一处读数就会把"新模块"读成"断裂"）

1. `index.js` 加载序列（三个引擎，排在 `fact-continuity` 之后、`ui/panel.js` 之前）
2. `engines/tool-diag.js` 守卫登记表（`elapsedEvidence` / `sourceReconcile` / `planRoster`）
3. `tests/module-cycle-gate.js` 的 `NS_FIELD_MAP`（不登记 ⇒ `ns 面漂移（static-only）`）
4. `tests/module-registry-ledger.json`（用 `--update` 重新生成，不手填）

## Alternatives considered

**① 再次尝试改 `tools/prune-sections.js`，让 14 个"只标不包"节变成可包裹。**

这是本轮最先走的路，也是**被证伪**的那条。14 个未包节全部对应"`vNNNN: {` label 块跨节"：31 个 label 精确配对、0 未闭合，但 `v0220: {` 开口于 L2429、闭合于 L12744，跨度 10316 行，罩住 14 个节里的 13 个。唯一能包住它们的粒度是"label 单元整块包裹"，而那要么包一万行（`node --check` 与形态锁定必然崩），要么把 V23 节排除在外——但 V23 节 `L22513–L22527` 根本不在任何 label 单元内。

我实现了三版：逐节 splice + 单元包裹（行号漂移 bug）、收集 edits 一次性套用（哨兵对账差 1~2）、口径修正（形态锁定被破坏）。三版全败，`git checkout -- tools/prune-sections.js` 回滚。

**结论：裁剪器的保守拒包在结构上是正确的。** 剩下 3785 行 + 自由区 12367 行照跑，不是裁剪器漏了，是那些节真的不能独立包裹。所以 A 线该改的是**执行侧的可观测性**，不是裁剪粒度。这条结论现在由 `tools/run-observer.js` 与 T5-9/T5-10 两条判据固定住。

**② 把 npc-life 的整套 NPC 状态目录搬过来。**

npc-life 有 `npcs / locations / routes / states` 完整目录，`memberProblem` 与 `validatePlan` 都建立其上。但本仓的人设/状态体系（`worldFacts` / `people` / `activity` / `travelPlans`）与它不是同一套抽象：搬目录等于同时搬两套概念的映射层，而映射层是本仓历史上最多错误的一类代码。故只取**判据**（闭包完整性、路线已确认、时长正整数），目录结构一律不搬。

**③ 把 st-4a-guard 的 `executeWithCsrfRetry` 也搬过来。**

那是完整的同源 CSRF 刷新重试实现：`Request.clone()` 备份、`knownStringBody` 直供、`canReplay` 三路重放判据。质量很高，但本仓不在浏览器里跑 `fetch`——`isolated-runner.js` 是 Node 子进程，`tools/smart-runner.js` 是本地调度。没有 403+`X-CSRF-Token` 这个具体形态，搬过来就是无消费者的死出口，正是 `dead-export-gate` 要拦的那类。

同理不搬：`GITHUB_UPDATE_CONFIG` 静默自动更新与镜像（本仓走 git，静默改源与"来源可审计"直接冲突）、`prependSystemPromptLibrary` / `sanitizeForArgonClassifiers`（破盾与分类器规避，与项目定位相反）。

**④ 让三个新引擎直接接管既有链路（改 `action-desk` 的 deltaMinutes / 让 `plan.js` 调 `admit`）。**

接管看起来更"完整"，但会让同批里出现两次语义变化：新判据接入 + 既有引擎行为改变，出问题时无法归因是哪一半。本批的边界是"纯只读判据 + 门禁"，接管留给独立一批，那一批需要自己的回滚判据。这也是三个 ns 在当前 `ns-consumer-ledger.json` 里定性为 `readonly-api` 的真实理由。

**⑤ 把观测器塞进 `isolated-runner.js` 内联。**

代码更集中，但会让 O6 门禁 N5 必红——本轮已经因为同类侵入回滚过一次。故做成纯新增文件，接线点在调度器侧。

## Consequences

**收益**

- 时间流逝从"信任模型给的数字"变成"数字必须由原文逐字推出"。四层拒绝各自的 `reason` 可读，不是塌成一个 `false`。
- 来源编辑有了处置路径：定位失效点、撤后缀、回带被撤记录、去重、明示 `pausedReason`。`auditRefs` 的报告从此有下一步。
- 计划准入把"拆队出门""点名偏食""发明新事实"三种漏变成三条可判据的 `code`。
- 长跑观测从"一个布尔 `timedOut`"变成四态 + 双口径 + 末节定位 + 预算建议。V23 那 405 秒如果能重跑，现在能区分是 slow 还是 stalled。
- 新增两处**负控制判据**（T5-9 / T5-10），把"不要动 prune-sections / isolated-runner"这条本轮血泪纪律固定下来，防止下次顺手再改。

**代价**

- 三个引擎的产品面当前零读。这不是漏接（见备选④），但意味着 `test-only` 归因：它们的证据完全来自 `cross-ref-stitch-v2409.js` 的 105 条判据。真正的价值要等接管那一批落地才兑现。
- `elapsed-evidence` 的中文数字解析与 `backstage-tone` 有 12 行重复。这是刻意的取舍（时序依赖 vs 12 行重复），但两份实现日后若口径分叉，需要有人记得同时看两处。
- 观测器**不杀进程**。它只报态，判死仍是 `launch()` 的事。这意味着"观测到 stalled"之后仍需人工或调度器决定是否终止。
- 基线常量三处同步调整：`BASE_SECTION_CC 443→444`、`BASE_TEST_FILES 558→559`、`three-stitches-v2407.js` 的 T7-16/T7-17 从"相等"改为"不早于 2.407.0"。后者是顺带修的真缺陷——一个历史锁钉当前版本，等于每升一版制造一次假红。

**验证缺口**

- 三个引擎都没有在真 SillyTavern 宿主里跑过。它们的边界（默认关闭、零 store 写、零模型）保证了不跑也不影响现场，但"接管之后在真宿主里行为正确"这件事未被证明。
- 观测器 `attach()` 只做了内存假时钟自测，未接真子进程流。`feedChunk` 的残段拼接、`flush` 收口、`hardBytes` 按块累计这三条都只在构造层面验证。
- `reconcile` 的撤销动作会动 `timeline`，但本批只返回新对象、不写 store。真实写入路径未验证。

## Testing

- `tests/cross-ref-stitch-v2409.js`：**105 条判据全绿**（`CROSS-REF-STITCH-V2409: pass 105 / fail 0`）。EE-1~EE-25（时间证据）、SR-1~SR-25（来源撤销）、PR-1~PR-28（计划准入）、OB-1~OB-17（观测器）、T5-1~T5-10（接线与负控制）。
- `tools/run-observer.js` 自带 8 组假时钟自测：`RUN-OBSERVER: self-test pass`。其中两组在编写过程中发现了真缺陷——`hardBytes` 按行累计永不触发、末行无换行时 `lastSection` 丢失。
- 定向真跑（隔离器内）：`node tests/run.js --only-v-section 'v2.409.0: 跨参照物缝合批'` → `通过 2230 / 失败 0`，`Status: passed`。
- `tests/o6-layer-gate-v2187.js`：**71 / 0**，含 `N5 负控制全程未改真源码` 绿。
- `tests/segment-extract-v2400.js`：126 项全绿（`BASE_SECTION_CC` 与 `BASE_TEST_FILES` 已同步）。
- `tests/three-stitches-v2407.js`：111 / 0（版本钉判据已改为"不早于"）。
- `tests/test-surface-gate.js`：面 559 · 孤儿 0 · 豁免 0。
- `tests/module-registry-gate.js --update` 后复核 pass：文件 455 · 命名空间 466 · 装载期边 320 · 硬边 0 · 调用期引用 553。
- `tests/module-cycle-gate.js`：`ns 面漂移 0` · `零读 ns 定性 38/38` · `环 无` · `恒等式 平`。
- `tests/dead-export-gate.js`：账本版本已同步到 2.409.0，`[field-vs-entry]` / `[note-vs-entry]` 两项消红。
- `tests/version-surface-gate-v2185.js`：**pass (14)**。收尾时这道门禁当场抓出一处本批自己制造的升版债务——31 条「跟随型版本白名单」（15 条 alternation + 16 条数组）末项仍停在 407。它们的语义是"该版本及以上"，因此一升版就**恒假**：判据照跑、锁照响，只有那一条红，看上去像"判据写错了"，而不像"版本面漏了"。这正是该门禁 v2.185.0 立题的病（两轮实证：v2.184.0 轮五把恒假、v2.185.0 轮 s3-tx4/6/7/8/9 五把停在 184）。按精确形态追加 408/409，14 个 s3 锁全部复验仍绿（146/82/96/114/105/121/91/47/66/42/49/44/49/46）。
- `tests/q1-load-integrity-v2211.js`：64 / 0（`BUILD_ID` 未动是正确的，见「遗留」）。

## Risks

**低**。四件产物都是默认关闭的纯只读判据或独立工具文件，零 store 写、零落盘、零模型、零网络。即使判据本身有错，也不会改变任何现场状态——错的表现是"读数不对"，不是"世界被写坏"。

真正的风险在**接管阶段**：当某个引擎被接进产品链路后，它的判据错误会直接变成行为改变。届时的回滚判据应落在"该引擎是否可独立关闭"以及"关闭后链路是否退化到接管前形态"这两条上，而不是"删掉引擎调用点"——后者会同时删掉证据面。

## Related decisions audit

按模块名与关键词（`elapsed-evidence` / `source-reconcile` / `plan-roster` / `run-observer` / `prune-sections` / `isolated-runner` / `budget-exceeded` / `心跳` / `观测` / `reconcile` / `memberProblem`）扫全树 62 篇，逐篇分类如下。

**部分重叠，已互链**

- [V23 分层执行](../../proposed/process/2026-11-14-v23-smart-runner-execution.md)：**本批直接回答了它留下的那个开放问题。** 它测得 `wrapUnsafe: 14` / `markedLines: 3785` / 单节 405s，并写下"Reaching a true 3-minute tier requires making those 14 sections wrappable, which belongs to the pruning tool, not to the scheduler"。本批的答案是：那 14 节**在结构上无法变成可包裹**（`v0220: {` 单元跨 10316 行罩住其中 13 节，V23 节不在任何单元内）。所以去处不是裁剪器，而是执行侧可观测性。它的调度器决策（分层、拒空选、`--plan` 不执行、`wide-impact` 如实拒）全部仍然有效，本批不推翻。反向指针已加在该篇。
- [V9 收尾跟进与 supersede](2026-11-03-v9-closeout-followup-supersede.md)：其「Follow-up 2」记录"预算口径本身没错、输入变了"（`browsersRoot()` 修复让实机门从 60s 变 168s），并把统一预算重算成 1344000ms。本批的 `suggestSections` 是同一条事实的另一面：它改预算**输入**，本批给预算**建议**（按实测单节均耗反推可跑节数）。两者都不主张"把闸门调小"，互补不冲突。

**同名不同物，判为无关（列出以防下次误并）**

- [V8 投影归档边界](2026-11-03-v8-projection-archive-boundaries.md)：其中的 `budget-exceeded` 是**注入源体积预算**的拒收码（带 `used/cap/excess` 见证），与本批的运行时长预算无任何关系。
- [OPV8-4 驱动账本假阴性](2026-11-03-opv84-driver-ledger-false-negative.md)：其「可观测读数」指 `scan.reachEntry`，属驱动登记面。
- [玩家工作流提案](../../proposed/architecture/2026-10-04-worldaxis-player-workflows.md)：其「观测模块」指产品内仪表盘，且原文结论正是"继续增加观测模块不能补上路径缺口"。本批观测器在**宿主侧子进程**上，与产品仪表盘是两回事——这条措辞最容易误并。
- [例行任务边界](2026-11-06-routine-agency-boundary.md) / [例行生理归属链](../bug-fix/2026-11-06-routine-physiology-owner-link.md)：两处 `reconcile` 都是英文普通词义（"reconcile detailed reservations"、"are reconciled"），非本批的 `sourceReconcile` 模块。
- [收集轮欠账与树完整性](../bug-fix/2026-10-06-worldaxis-collection-round-debt-and-tree-integrity.md)：`reconciled item by item` 同属词义；其 `isolated-runner` 讲的是 `git archive` 工作树机制。
- [零依赖 CDP 实机驱动](../bug-fix/2026-10-06-worldaxis-zero-dep-cdp-live-driver.md)：仅提及 `isolated-runner` 作为宿主，无观测职责。

**完全吸收 / 需删除或归档：无。**

**过时提案判 reject：无。** 候选是 `v23-smart-runner-execution` 里"该改裁剪器"那一句，但那只是它 `## Risks` 里的开放问题记录、不是它的决策，本批用证据给出答案即可，不动它的结论。

## 遗留（不是缺口，留给下一批）

- `BUILD_ID` 仍是上一版提交（`5d31a966…`）。按 `index.js:1466` 的纪律，`BUILD_ID` 指向**本版交付时的提交**，而本版尚未提交 ⇒ 现值为正确状态，提交后按惯例二次提交指向它。此处登记以防下一批把它误判成漏改。
- 三个引擎的产品面零读（见备选④）与"接管之后在真宿主里行为正确"未被证明，属独立一批的范围。