# WorldAxis 故事优先双计划实施切片

- Status: in-progress
- Plan sources: `plans/WORLDAXIS_STORY_EXPANSION_9.md`（EX-1~EX-9）+ `plans/WORLDAXIS_STORY_OPTIMIZATION_9.md`（OP-1~OP-9），合计严格 18 项。
- Implementation evidence: `engines/story-window.js`、`engines/tool-diag.js`、`core/store.js`、`core/interceptor.js`、`render/inject.js`、`engines/inject-budget.js`、`index.js`、`tests/run.js`、`tests/story-window-v2518.js`
- Current test evidence: focused Node regression `story-window: ok`；全量 `node tests/run.js` 52 通过 / 0 失败（source-changed 状态下取得，改动后须重跑取干净结果）；改动文件语法编译全部通过。
- Remaining: 真实 SillyTavern + Ruby 卡宿主验收；最终提交/推送与远端凭据轮换。
- Date: 2026-11-16

## 决策

先以既有 `world`、`act`、`livingWorld`、`elsewhere`、`investigation`、`storyChoice`、`foreshadow`、`rumor` 与 `render/inject` 为 owner，落一个可验收的纵向闭环：正文成功推进只开启一次推进窗口；场外行动必须留下带时间、地点、来源、可靠度和可见条件的痕迹；玩家可选择寻找、请人核实、暂不处理，也可从人物页/线索页询问、跟随、等待；选择提交到既有真实写口，不能由叙述直接制造完成事实。

OP-2 的第一步不新建第二套时钟或位置真源：在行动/世界回执中补充可解释的起止位置、在途状态、时间和证据；未知继续保持未知。OP-5 的第一步不删除既有注入源，而是在结构汇流与主注入账中按当前场景、玩家知识和待处理选择优先，并记录折叠原因。

## 不采用的替代方案

1. 不另建万能 `storyWorld` 状态：会复制人物、位置和时钟 owner。
2. 不把 `backstage.simulate()` 的异步启动当作结算完成：只消费上一份已提交快照，并显式标记 deferred/running。
3. 不直接改写 Ruby 卡或关闭其 MVU、Tavern Helper、Regex、世界书机制：Ruby 卡仅作为外部不可变验收输入。
4. 不用新增注入块替代既有预算裁决：所有新增可见信息必须进入 `injectBudget` 与 `lastInjection` 账。

## 本轮修掉的真实缺陷（不是测试问题，是宿主里会静默失效的接线错）

1. **`world.sendMessage` 按四位置参数调用**：真实签名是 `(from, to, opts)`。参数落到 `opts` 位置被当对象读 ⇒ 传话链静默失败。已改为对象接口。
2. **`world.depart` 按对象调用**：真实签名是 `(person, from, to, at)` 四个位置参数。已按位置参数调用。
3. **痕迹正文字段读错**：`living-world` 写出的痕迹正文在 `trace` 字段，早期只读 `summary/text/detail/note` ⇒ 真实宿主里痕迹摘要全空、窗口只剩标题。已补 `t.trace`。
4. **可见性语义把场外行动挡在门外**：`public` 与 `scene` 同义时，场外 NPC 行动/位移按 `scene` 过滤 ⇒ 玩家不在场就永远看不见 ⇒ 「镜头外的人仍在行动」整条 EX-2 落空。已拆分为 `public`（无条件可发现）与 `scene`（必须同地点）。
5. **截断按插入顺序取尾部**：窗口同时投影十余个 owner 时，确认事实会被传闻/未结算项整体挤掉（宿主里表现为「正文只剩传闻」）。已改为按可靠度分层保留，确认事实优先占位。
6. **非 defer 选择被写成 `intervening`**：owner 只回了 `presented/planned/in-transit/registered` 就被记成正在介入。已改为只有 owner 明确 `applied` 才进 `intervening`，其余保持 `awaiting`。

## 18 项覆盖矩阵

每一项都落到既有 owner；**不新建第二套时钟、人物状态、库存或万能世界总管**。

| 项 | 状态 | 承接 owner | 本轮落点 |
| --- | --- | --- | --- |
| EX-1 正文推进后世界回应一次 | 已接线 | story-window + interceptor | `core/interceptor.js` 在 after 链与楼层结算提交后调用 `storyWindow.open`，replyId 幂等，重复正文不产生第二个窗口 |
| EX-2 重要 NPC 持续行动 | 投影已接线 | living-world / act / elsewhere / stage-presence / offstage-life | 窗口投影 `livingWorld.npcMovements`、`acts.rows`、`elsewhere.rows`；只报「谁在何方、在做什么」，不报动机与结果 |
| EX-3 行动留下可发现的痕迹 | 已接线 | living-world / world / rumor / spatial-trace | 投影 `livingTraces`、已抵达 `world.messages`、`rumor.chains`；每条带时间、地点、来源、可靠度、可见条件 |
| EX-4 伏笔与暗线可追踪可介入 | 投影已接线 | foreshadow / foreshadow-tree / investigation / longline | 只投 `developing`/`triggered` 伏笔与 `collected` 线索；`waiting` 伏笔与无地点未采集线索留在内部账 |
| EX-5 从故事上下文长出支线 | 投影已接线 | opportunity / threads / agency | 窗口投影 `opportunity.openings`（仅**有承受者**且仍可介入的，`stage` 在 formed/open/offered/deferred）与 `threads`（open/stalled，照实报「还没有线索」与「目前停滞」）与 `plan.plans`（只投现场人物的 running/blocked 一步）；窗口仍不自造任务、不自己判 entitlement |
| EX-6 选择产生不同后续 | 已接线 | story-choice / branch-tree / dilemma-bargain | 三个正文入口 + 三个页面入口落到不同 owner 写口，各自留下不同的真实状态 |
| EX-7 人物记住承诺帮助与冒犯 | 投影已接线 | human-realism / social-legacy / affection-dual-axis / pmem | 窗口只投**玩家自己**的未了结记恨（`humanRealism.grudges`）与悬空托付（`socialLegacy.legacies` 中 `acceptStatus==='pending'`），走新可见性规则 `personal:X`；别人的记恨故意不投（在正文里只能表现为反应，不能表现为玩家读到的心事） |
| EX-8 失约错过与再次相遇 | 投影已接线 | lifeline / custom-lax / pilgrim-flow / stage-presence | 窗口投影 `world.journeys` 的在途/已抵达状态，人物在途中不是瞬移 |
| EX-9 人物线索页直接介入正文 | 已接线 | story-window + 人物页 | 新增 `ask` / `follow` / `wait` 三入口，走既有写口，不要求用户编辑 JSON |
| OP-1 收缩默认体验 | 投影已接线 | inject-budget / settings-bus / inject | 三层收缩：① 与正文推进直接相关的一层照旧；② **现场人物**进行中/受阻的计划一步（`plan.plans`）；③ 全部进 `injectBudget` 与 `lastInjection` 账（注入点 `render/inject.js` 判 `c.name1`，无宿主玩家名不出块） |
| OP-2 人物位置与移动连续性 | 已接线 | world / elapsed-evidence / world-clock / transit-scheduler | 窗口区分在途/已抵达；`resolvePlace` 用 `world.where` 反查真实位置，不靠窗口自记 |
| OP-3 知情边界 | 已接线 | epistemic-view / anti-omniscience / rumor-cognition | 可见性规则分 `self/rumor/recipient:/place:/scene/public/internal`；未知规则一律拒绝 |
| OP-4 动作身体与物品连续性 | 投影已接线 | act / personal-inventory / gear / body-anatomy | 进行中行动只报状态不报结果；已结算回执（`acts.res`）带证据来源 |
| OP-5 注入减负与当前事实优先 | 已接线 | inject-budget / inject-collector / inject-slot-audit | 注入块按可靠度分组为「已确认的事实」与「尚未确认」两栏；截断按可靠度分层保留 |
| OP-6 聚合破甲与提示词调试 | 已接线 | tool-diag / inject-inspector / tool-analyzer / output-guard | 新增 `tool-diag` 的 `storyWindow` 诊断节（`secStoryWindow`），答「窗口开了几次、当前挂哪条、玩家那一笔落到哪个 owner 的哪个阶段」 |
| OP-7 反截断与稳妥续写 | 依赖既有 owner | reasoning-strip / reject-recovery / reply-guard / advance-idempotence | 本轮未改 owner；窗口自身用稳定 replyId 保证幂等，不重复推进 |
| OP-8 查降智改为证据诊断 | 依赖既有 owner | degrade-audit / fact-continuity / model-receipt | 本轮未改 owner |
| OP-9 模型路由与调用过程可视化 | 依赖既有 owner | model-receipt / token-budget / call-timeline / model-pin / perf-trace | 本轮未改 owner |

「已接线」= 本轮有代码落点并有专项断言；「投影已接线」= 该项的写口仍属既有 owner，本轮只把它的**已提交事实**接进窗口投影并加断言（不改 owner 实现）。**没有任何一项声明为已完成产品验收**——真实宿主验收仍未执行。

本轮（第二批）新落点：

- `collectTraces` 新增 ⑪机会 ⑫悬案 ⑬计划一步 ⑭私人未了结 四个投影块，各自包在 `safely()` 里：
  单个 owner 的数据形状异常**不清空整张痕迹表**，但会在 `diagnose().projection` 留下自证（`faults` / `lastFault`），并经 `tool-diag` 的 `secStoryWindow` 露出。
- 可见性规则新增 `personal:X`（只给本人看的内心事实）与 `known-by`（`knownBy` 知情面）；
  **未知规则依旧一律拒绝**，`internal` 永不进正文。
- 介入尝试留账：新增 `storyWindow.respond(id, info)`，只写 `attempts` / `responseCount` / `lastResponse`，
  **绝不写 `choice`、绝不动 `status`**。owner 拒收时 `choose` 返回 `{ok:false, retryable:true}` 并记一次尝试；
  人物页在「玩家身份缺失 / 线索已不可见 / 窗口抛错」三条路径上补记同一本账（窗口已记过时不重复记）。
  结算时会带出 `settlement.responsesBeforeSettle`：结算 ≠ 玩家什么都没做。
- 人物页线索按钮在提交前以 `visibleTraces` **重校一次可见性**：渲染后变得不可见的线索不得提交。
- 注入点收敛：`render/inject.js` 不再自持身份闸，改调 `buildBlock({})`，由窗口单点解析宿主的
  `SillyTavern.getContext().name1`（新增内部 `hostPlayerName()`，解析不到就返回空串 ⇒ 不出块）。
  触发原因：原写法 `&& c.name1` 在 `c` 为 null 时**当场抛 TypeError**，且同一判断在注入点与窗口
  两处重复→容易漂移。**身份只有一个真源**。
- 显示名三处同批登记：`render/inject.js` 的 `SRC_NAME`、`ui/panel.js` 的面板名表、注入分支 `source` 名。
  漏登记时失败台账会把英文键名 `storyWindow` 直接写给用户看（本轮 `inject-sources-v2560` 的 D 判据当场报出）。
- 测试面登记：`tests/story-window-people-v2518.js` 原先**从未被全量执行**（`test-surface-gate` 判
  `unregistered-orphan` 当场现形），已同时登记 `runScript` 档与 `spawnSync` 单跑档。
  `tests/ruby-card-profile.js` 是需 `RUBY_CARD=<外部卡路径>` 的手动作业入口，已在 `EXEMPT` 里带理由登记。
- `tests/module-cycle-gate.js` 的 `UI_NS` 补登 `panelPeoplePage` / `panelNowPage`：与既有
  `panelOverviewBlocks` / `panelOverviewMain` / `panelWorldPulse` **完全同型**（`ui/pages/` 子目录提供，
  静态图看不见提供方），漏登记即被判「未登记的一对一差（static-only）」。

本地已跑通的 15 支门禁（均为单跑，**不是全量回归**）：三支 story-window 专锁、`inject-vis-v2580`、
`inject-sources-v2560`、`switch-matrix-v2910`、`test-surface-gate`、`module-cycle-gate`、
`module-registry-gate`、`member-surface-gate`、`ns-consumer-ledger-v2400`、`registry-identity-v2620`、
`budget-headroom-v2261`、`version-surface-gate-v2185`、`settings-bus-api-gate`。

## 窗口契约（当前实现）

- 状态机：`opened → awaiting / deferred / intervening → settled / failed`。只有 owner 明确 `applied` 才是 `intervening`。
- 阶段字段 `choiceOutcome.phase`：`deferred / awaiting-owner / presented / planned / registered-awaiting-evidence / message-in-transit / in-transit / accepted`。
- 入口：`find` / `verify` / `defer`（正文三入口）+ `ask` / `follow` / `wait`（人物页与线索页入口）。
- 可见性：未知规则默认拒绝；`internal` 永不进正文；`scene` 必须同地点；`public` 无条件可发现。
- 窗口只**读**既有 owner 的已提交事实，**从不自己造世界状态**。

## 验证标准

- 重复正文/重复事件不会产生第二个推进窗口或第二份痕迹。
- 推进窗口能区分 `opened`、`settled`、`deferred`、`failed`，且异步推演未完成时不伪报完成。
- 场外行动的意图、进行中、完成、未确认和失败状态可区分；移动必须有 world journey 证据。
- 痕迹只在玩家可见条件满足时进入默认正文注入，后台台账可解释来源但不强迫用户管理。
- 三个入口最终改变不同的真实状态或待处理状态；「暂不处理」不产生伪完成。
- Node mock 回归通过后，另行在真实 SillyTavern + Ruby 卡宿主验收；无宿主时明确记录未执行而非通过。