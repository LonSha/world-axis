# Agent Note: WorldAxis v2.173.0 之后的双九项计划（O1–O9 / E1–E9）与证据分层的代际切换

Status: proposed

## Problem

用户要求基于仓库现状制订两份各九项计划（一份优化提升、一份功能拓展），并明确要求辨别过时内容、不沿用台账勾选面。本次现场读数与仓内文档严重分叉，直接沿用旧文件会产出反事实的计划：

1. **版本与交付状态**：现场 `index.js` / `manifest.json` 均为 **v2.173.0**，HEAD `d986433`，全量回归 **15680 / 0**。而 `plans/TP_OPTIMIZATION.md` 头部仍写"基线 v2.162.0"、TP6/TP8 标"未开始"；`plans/TX_EXPANSION.md` 写"基线 v2.168.0 / TX5–TX9 五项未开始"。实际 TX1–TX9 全部交付（`tests/s3-tx1-v2165.js` … `tests/s3-tx9-v2172.js` 与 `tools/tx1_smoke.js` … `tools/tx9_smoke.js` 全部存在）。这两份文件不是滞后，是在**断言反事实**。
2. **旧提案笔记同样过期**：[上一代 TP/TX 提案](2026-10-05-worldaxis-tp-tx-plans.md) 的对照表仍写"基线 v2.158.0"、TX5–TX9"未开始"；[上一代玩家路径提案](2026-10-04-worldaxis-player-workflows.md) 的交付状态停在 v2.158.0。两篇都仍是 `Status: proposed`。
3. **机制数量不再是瓶颈**：`engines/` 155 个模块、`ui/panel.js` 727031 B、`render/inject.js` 121032 B、17 个面板页签、约 130 个控件 id 前缀族、`tests/` 208 文件、`tests/run.js` 21806 行 / 223 节 / 硬超时 1500000 ms。
4. **四类真实缺口**：① 宿主闭环 —— TX1–TX9 九项进度表末列**全部**写"真实宿主面板未验"，TP3/TP7/SP6 同样只有无头证据；② 跨模块一致性 —— `core/commit.js` 九成员的真实消费方只有三处（`engines/backstage.js`、`engines/coop.js`、`engines/story-choice.js`），九个 TX 模块全部各走 `store.transact`；③ 手机长局性能 —— TP6 至今"未开始（需现场基线）"；④ 玩家可理解性与维护成本 —— `engines/tool-diag.js` 4327 行诊断面向维护者，而计划文件已在反向误导。
5. **有能力没入口**：`engines/checkpoints.js` 613 行 / 28 个导出成员（含 `save`/`list`/`read`/`restore`/`branch`/`compare`/`exportOne`/`importOne`/`checksum`/`migrations`/`migrate`），在 `ui/panel.js` 里 `WA.checkpoints` **零命中**；`pending` 散落在 35 个引擎中，没有一个统一视图。
6. **笔记树自身有四处缺陷**：`.agents/notes/2026-10-07-tx8-aftermath-architecture.md` 落在 `notes/` 根目录而非 `implemented/architecture/`，而 `verify-agent-note-tree` 因根目录文件不参与遍历而**看不见它**（实测 13 篇通过、0 报错）；`verify-agent-note-format` 实测对 7 篇报错（`implemented/architecture/` 下 TX1/TX2/TX3/TX4/TX6/TX7 的 `# TXn: ...` 头部与缺 `Status:` 行/缺 `## Problem`/缺 `## Decision`/缺 `## Consequences`/缺备选节，以及 `implemented/bug-fix/2026-10-05-offline-return-page-entry-clock-domain.md` 缺备选节）；全仓 `grep -rn '\.agents\|plans/' --include='*.js' --include='*.json'` **零命中** —— 笔记校验与计划文件都没接进回归；而 `docs/README.md` 自述"这个仓库只承认一种事实来源：能被命令复算出来的读数。文档负责指路，不负责断言"，口径与实现已分叉。

源码足够支持制订新计划；真实 SillyTavern 宿主行为、手机前后台与长局性能仍缺现场证据。本文件只记录 proposed 方案与旧记录审计，不修改产品实现、测试实现、配置、冻结面或版本，本轮不运行产品全量回归。

## Proposal

本代用 **O1–O9** 表示优化线、**E1–E9** 表示拓展线。完整任务定义分别在 [优化提升计划](../../../../plans/O_OPTIMIZATION.md) 与 [功能拓展计划](../../../../plans/E_EXPANSION.md)，两份文件各有九项；本笔记只保留选择理由、旧项关系、依赖与统一验收，避免重复十八份任务正文。

优化线的命题：**机制已经够了，未闭环的是"证明、联动、性能、容量、治理"**。拓展线的命题：**不重复 TX1–TX9 的引擎，只补玩家还看不见摸不着的那一层**（统一待办、日程、存档槽、战役、纪事、地图、规则包、依赖体检、实验室）。

新增功能一律以"操作 → 实际状态 → 已知反馈 → 重载延续"为交付单位。引擎与图表仍是实现部件，单独存在不自动证明这条玩家路径成立。

### 当前事实与旧记录校正

| 项目 | 当前源码事实 | 无头行为证据 | 真实宿主与玩家路径 |
|---|---|---|---|
| TX1–TX9 | 九项引擎全部交付（`diplomacy` / `agency` / `freight` / `story-choice` / `world-blueprint` / `commission` / `investigation` / `aftermath` / `operations`） | 九个专锁（49/47/66/42/59/49/44/49/46）+ 九个冒烟脚本全部存在 | **全部未验**；进度表末列统一写"真实宿主面板未验" |
| TP1 / TP2 / TP4 / TP7 | 已交付（store 归属票据、五引擎三层判据、`core/commit.js` 九成员、在途义务三层） | `s3-tp1-v2159` 52/0、`s3-tp2-v2159` 76/0、`s3-tp4-v2160` 97/0、`s3-tp7-v2162` 53/0 | 宿主栏全空 |
| TP3 | 已交付（页面恢复入口 + 时间源分域） | `s3-tp3-v2161` 39/0 | 真机 bfcache 与后台节流未验 |
| TP6 / TP8 | 未开始 | — | 均需现场基线，终端环境无法推进 |
| TP9 | 文档面已同步至 v2.172.0 | — | 宿主四栏仍缺 |
| `core/commit.js` | 九成员已实现 | 有 `stat` 读数与专锁 | 真实消费方只有 backstage / coop / story-choice 三处 |
| `engines/checkpoints.js` | 613 行 / 28 导出 | `tests/settle-v2820.js` 等钉住库键前缀 | **面板零入口** |

历史全量读数（15119/0 等）的 `sourceDigest` 与当前树不同，不作为当前工作树全绿证明。README 版本历史已更新到 v2.173.0（119 条），但 `plans/*.md` 未跟版 —— 这正是 O7 要治的病。

### 优化线与历史项的关系

| 本代项 | 历史基础 | 本次真实增量 |
|---|---|---|
| O1 宿主验收矩阵 | TP3 / TP7 / SP6 与全部 TX 的"宿主未验" | 四路径（成功/拒收/重载/重复）× 四类证据（交互/控制台/操作后状态/重载后状态） |
| O2 跨模块原子提交 | TP4 的 `core/commit.js` | 从三处消费方扩到五条固定跨模块链，并补链级专锁 |
| O3 手机长局基线 | TP6（从未开始）、perf-ledger / perf-trace / storage-forecast | 真实手机三档存档 p50 / p95 与冻结预算 |
| O4 存储压力与迁移 | TP7 源码+无头两栏 | TX 线新增五类持久记录的实机压力与迁移 |
| O5 世界健康中心 | tool-diag 诊断节、reject-code 见证 | 面向玩家的待办/阻塞/水位聚合与下钻 |
| O6 回归分层与加速 | `tests/run.js` 223 节、`tools/slow-sections.js` | 分层入口 + 输出落盘 + 跳过登记 |
| O7 计划与读数同步 | TP9 的文档面 | 计划文件与现场读数的机械同步 + 笔记树接入回归 |
| O8 消费者治理 | dead-export / field-liveness 门禁与账本 | 从"被调用"进入"有无玩家可见消费者" |
| O9 边界审计 | TP8 的视角与注入价值 | 六通道（prompt / DOM / ARIA / 剪贴板 / 导出文件 / 日志） |

### 拓展线的增量边界

| 本代项 | 复用基础 | 新能力 |
|---|---|---|
| E1 统一待办中心 | 35 个引擎的 `pending()`、各模块确认语义与拒收码 | 只读聚合与下钻，动作直接调既有写口 |
| E2 世界日程 | calendar / calendar-custom / chrono / longline / commission / diplomacy / freight / aftermath 的到期项 | 按剧情时间排序的未来事件表 |
| E3 存档槽 | `checkpoints` 全部 28 个导出（现零面板入口） | 命名保存 / 列出 / 载入 / 删除 / 单档导入导出 / 比较 / 分叉 |
| E4 战役层 | world-blueprint 的 `SCENES` / `KEEP_LEVELS`、rehearsal 的三种偏离策略、difficulty | 目标 / 阶段 / 结束条件与复盘 |
| E5 世界纪事 | chrono.chronicle、ledger-timeline、timeline、causal、sediment、digest | 叙事化但可下钻的历史视图 |
| E6 统一地图 | region / faction-graph / diplomacy / freight / sediment / farfield / parallel-world | 统一坐标系 + 派生边与事实边分层显示 |
| E7 规则包与模板 | rules / theme / preset / recipe / settingsBus | 命名规则包 + 白名单动作与预算上限 |
| E8 依赖体检与迁移 | world-blueprint 的 `checkIntegrity` / `previewImport`、world-seed、checkpoints.migrations、recipe.SOURCE_FILES | 缺失依赖 / 降级损失 / 可迁移性报告 |
| E9 世界实验室 | rehearsal / branch-tree / chrono.simBranch / parallel-world 快照 | 隔离副本与三路径反事实对比 |

派生边（faction-graph 的 `derived: true`）继续只是推导，未知双边事实不得迁成联盟；`economy.ship` 的即时补货语义不得暗改成新运输；旧的有损种子继续如实标注损失，不伪造道路端点或同名身份。E3 明确复用 `checkpoints` 而不是新建存储层；E1 明确复用各模块 `pending()` 而不是新增第二套确认逻辑。

### 推荐落地批次

版本号在实施时确定，本表不预先改产品版本，也不承诺未经采样的小时数。

| 批次 | 合版范围 | 结束时可见成果 |
|---|---|---|
| ①闭合当前产品 | O1 + O2 + O9 + E1 | 九个已交付模块在真实宿主走通并留证；跨模块链不半写；玩家不可知数据不泄漏；一屏看到所有待办 |
| ②解决长期使用 | O3 + O4 + O5 + E2 + E3 | 手机长局有基线有预算；存储压力与迁移实机可恢复；一张未来日程；存档槽真正可用 |
| ③扩大世界表达 | E4 + E5 + E6 + E8 | 带目标与阶段的战役、可下钻的纪事、统一地图与关系视图、依赖体检与迁移助手 |
| ④提高可定制性 | O6 + O7 + O8 + E7 + E9 | 回归可分层；计划不再反向误导；导出面有消费者登记；规则包与隔离实验室 |

O1 / O2 / O9 从第一批起持续维护（新增模块即纳入）；第三、四批是治理与体验收口，不是把证据工作全部拖到最后。

## Alternatives considered

**沿用 TP/TX 编号继续推进。** 最强理由是编号连续、历史专锁与进度表无需迁移，维护成本最低。但 TX1–TX9 已全部交付，TP 线只剩 TP6/TP8 两项且都卡在"需要现场环境"，沿用旧编号会把"已经做完的九项"重新列一遍，并让"宿主未验"这条唯一真缺口继续藏在进度表末列；采用新编号 O/E，并在两份新文件里写明与旧编号无继承关系，解决优先级与历史事实冲突。

**把旧计划文件直接改写成新计划。** 最强理由是仓库只有一个 `plans/` 目录，替换可避免"两份计划并存"的困惑。但改写会抹掉 RP/RX/SP/S/TP/TX 六代的交付事实与未完成项归属，而 `docs/README.md` 明确要求文档"负责指路、不负责断言"，历史文件正是六代决策的唯一副本；保留旧文件为历史档案、新文件为当前台账，并在新文件里写明旧文件已停用，代价只是多一次链接跳转。

**把新计划只写进 Agent Note，不建 plans/ 文件。** 最强理由是避免"文档与真源两份副本"的老问题（v2.108.0 的 ui 三文件清单全仓四份副本教训）。但十八项任务正文放进笔记会让笔记膨胀成台账，且笔记的 lifecycle 语义（proposed → implemented）不适合承载"逐项交付状态"；采用笔记记理由与验收、`plans/` 记任务正文的分工，并由 O7 的生成器把现场读数写回计划文件顶部，避免它们再漂。

**先做 E 线的玩家体验项，O 线的宿主验收与跨模块链押后。** 最强理由是玩家价值最直接，也便于用新功能证明进度。但九个模块的宿主行为完全未验，任何新入口都建在"不知道真实宿主里能不能跑"的地基上；且跨模块链没有统一候选，新增 E1 聚合面会第一次把多个模块的确认动作放进同一屏，一旦链中第二步抛错就是半写。故第一批同时包含 O1 / O2 / O9 与 E1。

**把 O7 做成"自动改写计划文件"。** 最强理由是一劳永逸，不必再有人手抄读数。但自动改写会让计划文件失去"人写意图"的部分（取舍、边界、备选），且一旦生成逻辑出错，反向误导会比现在更难发现；采用"生成器只写顶部状态表并标注勿手改 + 门禁只查声明与现场一致"，正文仍由人写。

**把笔记树格式问题一并重写修复。** 最强理由是一次性把 7 篇报错清零。但 TX1–TX4、TX6、TX7 六篇是**已实现模块的协调者边界笔记**，它们的头部与章节形态（`# TXn: ...` + `## 解决的缺口` + `## 八条否定式边界` + `## 注入链` + `## 门禁结果`）承载的是作者当时的记录意图，按本 Skill 纪律"一条 Note 永远不被改写成另一个决定"，改写它们的头部与章节结构属于对既有记录的改写；本轮只把该问题登记为 O7 的验收项（笔记校验接入回归并全绿），把修复留给 O7 实施轮统一处理。

## Acceptance criteria

1. 两份文件各九项，编号连续唯一；每项包含现场基础（含文件/行数/导出成员等可复读读数）、明确增量、边界与依赖、可验证结果。旧项与新项映射可检索，不把旧实体计为新交付。
2. 两份文件各自声明"与历史编号无继承关系"，并在文件内链到本笔记；本笔记与两篇旧 proposed 笔记互链，旧笔记保持 `proposed` 且不被改写成反面。
3. 计划中的每条现状陈述都对应一条本次实测命令与读数；不接受抄录文档数字。旧计划文件的过时条目（TP6/TP8"未开始"、TX5–TX9"未开始"、基线 v2.162.0/v2.168.0）在正文中显式点出为反事实。
4. 新计划不修改产品实现、测试实现、配置、冻结面与版本；本轮不运行产品全量回归，全量读数标注为"上一版收口读数"而非本次实测。
5. 笔记树校验：`verify-agent-note-tree` 与 `verify-agent-note-format` 在本笔记落盘后对新笔记全绿；旧笔记的既有报错逐条登记（不隐藏、不豁免），归入 O7 验收。
6. 旧 proposed 笔记的当场审计结论与本次改动同批落盘：两篇分别标注为"被本代部分取代（未闭环路径与事实状态）"与"被本代完全取代（TP/TX 台账）"，并给出相对链接。

## Risks

宿主证据是 O1 的全部内容，而真实 SillyTavern 环境、页面前后台与新聊天流程依赖宿主版本；mini-DOM 不覆盖这些差异。当前没有实机通过证据，该限制只影响实施后的完成判断，不阻塞现在交付可评审计划。若长期无法取得宿主证据，O1 会退化成"永远待验收"，届时需要在四栏表里显式区分"未验"与"不可验"。

O2 的跨模块候选会扩大单次事务的读集与复制量，与 O3 的手机性能预算直接冲突。以相关依赖读集减少无关拒收，并用 O3 的实测数据选择优化；不能为了性能放宽校验而重开串聊天或过期写入。

E3 复用 `checkpoints` 的库键（`worldaxis_ckpt_v1_<chatId>`）已有专锁钉住前缀，但面板接入会第一次让玩家直接操作它；导出/导入走既有 `exportOne` / `importOne` 与 `checksum`，格式不匹配必须明确拒收而不是静默降级。E3 与既有 `wa-snap-*`（全量快照）的分工若在界面上说不清，会变成两套"存档"并存。

E2 的时间表横跨六处到期判定，其中剧情时间与真实活动时间必须严格分域（`playtime.story().dayIndex` 一类与墙钟不可混算）。若某模块的到期项无法给出剧情时间，未来表必须显式显示"时间未知"而不是推测日期。

O7 的门禁会挡住"改了版本号却没改计划文件"，而计划文件是六代历史的载体；门禁必须只查顶部状态表的声明与现场一致，不扫正文历史段落，否则每次历史段落提到旧版本号都会误报。

笔记树里 `.agents/notes/` 根目录的游离文件（`2026-10-07-tx8-aftermath-architecture.md`）在 `verify-agent-note-tree` 下不可见，是"门禁看不见违规"的一类；若只把它移进 `implemented/architecture/` 而不让 tree 校验覆盖根目录，下一次同样放错位置仍不会被发现。该修复与格式修复一并归入 O7。

### 历史笔记审计与本轮边界

已按机制名与关键词检索 proposed / implemented 活跃目录（全树 14 篇），当场分类如下：

- [上一代 TP/TX 双九项提案](2026-10-05-worldaxis-tp-tx-plans.md) — **完全取代**。它把 TP1–TP9 / TX1–TX9 的完整任务定义指向 `plans/TP_OPTIMIZATION.md` 与 `plans/TX_EXPANSION.md`，而 TX 九项已全部交付、TP 只剩两项卡在现场环境；本代接管其"证据分层"口径（源码/无头/宿主/玩家四栏）并给出新的 O/E 基线。该篇保持 `proposed`，不改写决定，双方互链。
- [上一代玩家路径提案](2026-10-04-worldaxis-player-workflows.md) — **部分重叠**。它保留 SP/S 的时间、候选草稿、有损种子与验收取舍，其"交付状态"段停在 v2.158.0；本代吸收其未闭环的宿主路径（O1）与有损种子承诺（E8），不改其 Decision。双方互链。
- [数据完整性实现笔记](../../implemented/bug-fix/2026-10-04-offline-farfield-audit-integrity.md)、[页面恢复入口与时钟分域](../../implemented/bug-fix/2026-10-05-offline-return-page-entry-clock-domain.md)、[收集轮债务与树完整性](../../implemented/bug-fix/2026-10-06-worldaxis-collection-round-debt-and-tree-integrity.md)、[在途义务与未来档 schema](../../implemented/bug-fix/2026-10-06-worldaxis-tp7-capacity-future-schema.md)、[零依赖 CDP 驱动](../../implemented/bug-fix/2026-10-06-worldaxis-zero-dep-cdp-live-driver.md) — **无关或仅作基础**。已实现约束不改；O4 消费其容量口径，O1 复用其 CDP 驱动。
- [TX1](../../implemented/architecture/2026-10-07-worldaxis-tx1-diplomacy-fact-vs-derived.md)、[TX2](../../implemented/architecture/2026-10-07-worldaxis-tx2-agency-coordinator-boundaries.md)、[TX3](../../implemented/architecture/2026-10-07-worldaxis-tx3-freight-coordinator-boundaries.md)、[TX4](../../implemented/architecture/2026-10-07-worldaxis-tx4-story-choice-coordinator.md)、[TX6](../../implemented/architecture/2026-10-07-worldaxis-tx6-commission-coordinator.md)、[TX7](../../implemented/architecture/2026-10-07-worldaxis-tx7-investigation-coordinator.md) 六篇协调者边界笔记 — **无关**。它们记录已落地模块的否定式边界与注入链，本代全部复用其边界，不改任何一条。
- `.agents/notes/2026-10-07-tx8-aftermath-architecture.md`（TX8）— **位置错误**，应在 `implemented/architecture/`。本轮不移动（移动会改变 tree 校验的可见性，属 O7 实施范围），仅登记。

[NEXT_PLAN.md](../../../../NEXT_PLAN.md) 作为入口保留历史 RP/RX/SP/S/TP/TX 原文；新的当前台账为 `plans/O_OPTIMIZATION.md` 与 `plans/E_EXPANSION.md`。README、`docs/architecture.md` 与 `ITERATION_LOG.md` 的全面同步留给 O7，避免本次计划触动历史数字与日志中的既有特殊字节。本轮仅新增两份计划与本篇提案、并建立与旧笔记的互链，不升级版本，不改产品/测试/配置。

## Decision
> 本节为 O7（v2.187.0）格式补登：本篇原文未设 Decision 节；决策正文即上方「Proposal」一节（本代用 O1–O9 / E1–E9 表示两线、证据四栏、三批落地顺序），正文未重排、未改写。

## Consequences
> 本节为 O7（v2.187.0）格式补登：本篇原文未设 Consequences 节；其后果面已散见上方「Acceptance criteria」与「Risks」两节，正文未重排、未改写。【O7 实施轮补记（2026-10-09）】本篇「历史笔记审计与本轮边界」里那句「`.agents/notes/2026-10-07-tx8-aftermath-architecture.md`（TX8）— 位置错误…本轮不移动…仅登记」，记的是**该轮**的处置；O7（v2.187.0）已按本篇登记把它移入 `implemented/architecture/`，并由 `tests/o7-plan-tree-gate-v2187.js` 常守。
