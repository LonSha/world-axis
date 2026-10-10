# WorldAxis 功能拓展计划：E1–E9

Status: proposed（2026-10-08 立；制订轮只读，不改产品实现、测试实现、配置与版本）

基线：2026-10-08 的 `/tmp/wa_git` 工作树，`index.js` 与 `manifest.json` 均为 **v2.173.0**，HEAD `d986433`，全量回归 **15680 / 0**，工作区干净。
<!-- O7:STATE:BEGIN 由 tools/gen-plan-status.js 复算生成，勿手改 -->
> **现场读数块**（`node tools/gen-plan-status.js` 复算；手工改它会被 `tests/o7-plan-tree-gate-v2187.js` 当场判红）
>
> | 现场读数 | 值 | 取法 |
> |---|---|---|
> | 版本 | `index.js` **v2.189.0** / `manifest.json` **v2.189.0** | `grep -n "VERSION =" index.js`；`manifest.json` |
> | 本线交付 | **已交付 9 / 未交付 0** | 下表逐项现场复算 |
>
> | 项 | 状态 | 证据（`tests/` 下的专锁，★ = 已挂进 `tests/run.js`） |
> |---|---|---|
> | E1 | **已交付** | `s3-b1-e1-v2183.js` ★ |
> | E2 | **已交付** | `s3-b2-e2-v2182.js` ★ |
> | E3 | **已交付** | `s3-b1-e3-v2184.js` ★ |
> | E4 | **已交付** | `s3-b3-e4-v2187.js` ★ |
> | E5 | **已交付** | `s3-b2-e5-v2182.js` ★ |
> | E6 | **已交付** | `s3-b3-e6-v2187.js` ★ |
> | E7 | **已交付** | `s3-b3-e7-v2188.js` ★ |
> | E8 | **已交付** | `s3-b3-e8-v2187.js` ★ |
> | E9 | **已交付** | `s3-b3-e9-v2188.js` ★ |
>
> 判据：编号算「已交付」= `tests/` 下存在该编号的证据文件**且**它被 `tests/run.js` 引用；只躺在磁盘上的文件不算。本块只判「有没有、挂没挂」，不判「做得对不对」。
<!-- O7:STATE:END -->

**编号声明**：本代用 E1–E9 表示拓展线、O1–O9 表示优化线（见 [优化提升计划](O_OPTIMIZATION.md)）。两个前缀是**本代标识**，与历史 E 线、O1–O16、RP/RX、SP/S、TP/TX 编号**无继承关系**。

## 定位

TX1–TX9 已经补齐九类世界机制（外交 / 行动 / 货运 / 分支 / 蓝图 / 委托 / 调查 / 地点后果 / 组织运营），`engines/` 已有 155 个模块。**本线不重复 TX1–TX9 的引擎**，只补"引擎已经能做、但玩家还看不见摸不着"的那一层。

本线的选题依据不是"还能加什么机制"，而是现场三条实测事实：

1. **有能力没入口**：`engines/checkpoints.js` 613 行 / 28 个导出成员（`save` / `list` / `read` / `remove` / `restore` / `branch` / `compare` / `exportOne` / `importOne` / `checksum` / `migrations` / `migrate` / `topKeys` / `resolveScope` / `lineage` …），在 `ui/panel.js` 里 `WA.checkpoints` **零命中**（`grep -c 'WA.checkpoints' ui/panel.js` = 0）—— 只有一个注入源与一个 `rehearsal` 的 `topKeys` 读取。完整存档槽能力已经存在，玩家摸不到。
2. **待办散落**：`pending` 在 35 个引擎里出现，其中 `aftermath` / `commission` / `investigation` / `operations` / `story-choice` / `backstage` / `coop` / `farfield` / `world-blueprint` / `world-seed` / `offline-return` 等都把 `pending` 作为导出成员。九个模块各有各的待确认项，**没有一个统一视图**。
3. **同族能力各自为政**：`calendar.js` + `calendar-custom.js` + `chrono.js` 管时间，`longline.js` 管承诺与逾期（`promise` / `overdue` / `sweep` / `pressure`），`commission` 管委托期限，`diplomacy` 管条约到期，`freight` 管到达时间 —— 六处都在算"什么时候会发生什么"，玩家看不到一张日程。

九项因此分成三组：**统一入口**（E1 / E3 / E6）、**时间与叙事**（E2 / E4 / E5）、**可定制与可迁移**（E7 / E8 / E9）。

## 九项拓展

### E1 统一待处理事项中心

- **优先级**：P0。九个模块各自有 `pending()`，玩家要在十七页里找。
- **现状**：`pending` 出现在 35 个引擎中，作为导出成员的至少有 `engines/aftermath.js`（246 行）、`engines/commission.js`（267）、`engines/investigation.js`（309）、`engines/operations.js`（321）、`engines/story-choice.js`（247）、`engines/backstage.js`（309）、`engines/coop.js`（657）、`engines/farfield.js`（563）。各模块的确认语义、拒收码与超期规则已经齐备。
- **实施范围**：一个只读聚合面，把各模块 `pending()` 的结果归一成"事项"记录：来源模块、事项类型、玩家可见描述、可执行动作（确认 / 取消 / 改约 / 忽略）、截止或失效条件、当前阻塞原因。动作直接调该模块已有的公开写口，不新增第二套确认逻辑。
- **边界**：聚合面只读，不做状态变更的中间层；不把维护者诊断（内部路径、原始计数）搬进来；某模块关闭时其待办不出现；未知或无法归一的事项如实列出而不是静默丢弃。
- **验收**：同一事项在聚合面与来源模块看到的状态一致；从聚合面确认后来源模块的 `pending()` 同步减少；关闭模块后其待办消失且重载后仍消失；空态与"全部处理完"可区分。

### E2 世界日程 / 期限与未来事件日历

- **优先级**：P0。六处都在算"什么时候会发生什么"，但没有一张表。
- **现状**：时间侧有 `engines/calendar.js`、`engines/calendar-custom.js`（`setMonths` / `getMonths` / `label` / `labelNow` / `clear`）、`engines/chrono.js`（467 行，`record` / `layer` / `derives` / `undo` / `applyUndo` / `stale` / `diff` / `simBranch` / `chronicle`）；义务侧有 `engines/longline.js`（`promise` / `overdue` / `sweep` / `pressure`，`TERMINAL` 终态集）；具体期限散在 `commission`（委托阶段期限）、`diplomacy`（条约到期）、`freight`（运输到达）、`farfield`（消息抵达）、`aftermath`（效果到期）。
- **实施范围**：一张只读的"未来事件表"，按剧情时间排序，条目来源是上述各模块已经登记的到期项与已承诺事项；每条显示何时、何事、涉及谁、来源模块、是否可干预（可提前完成 / 可改约 / 只能等待）。时间基准复用剧情时间（`playtime.story().dayIndex` 一类），与真实活动时间严格分域。
- **边界**：未知时间保持未知，不猜日期；不因为"表里没有"就断言"不会发生"；表是只读视图，不改各模块的到期判定；真实时间与剧情时间不得混算。
- **验收**：委托期限、条约到期、运输到达、效果到期四类条目都能在表里出现且时间与来源模块一致；到期后条目自动移出未来表并进入 O5 的阻塞/待办栏；剧情跳日不伪造真实离线；空表与"读不到"可区分。

### E3 真正可用的存档槽与世界分支管理

- **优先级**：P0。引擎完备但零入口 —— 这是本代最"只差一层皮"的一项。
- **现状**：`engines/checkpoints.js`（613 行）已有 `save` / `list` / `read` / `remove` / `restore` / `branch` / `compare` / `exportOne` / `importOne` / `checksum` / `migrations` / `registerMigration` / `migrate` / `topKeys` / `resolveScope` / `lineage` / `tick` / `buildBlock`，库落在独立 localStorage 键 `worldaxis_ckpt_v1_<chatId>`（**不在世界状态里**，故恢复世界不影响库），设置键 `worldaxis_ckpt_settings_v1`，容量 `maxSlots` / `autoEvery` / `autoSlots` 已在 `bounds` 内声明。面板侧现状：`grep -c 'WA.checkpoints' ui/panel.js` = **0**，`grep -n 'checkpoints' ui/panel.js` 只命中 `VIS_NAMES` 的显示名一行。相关但独立的是 `wa-snap-*`（全量快照导出/导入，含 `wa-snap-dl` / `wa-snap-up` / `wa-snap-subset` / `wa-snap-faces`）与 `wa-bt-*`（branch-tree 分支树面板，`wa-bt-fork` / `wa-bt-choose` / `wa-bt-compare` / `wa-bt-replay` / `wa-bt-tree`）。
- **实施范围**：面板加"存档槽"区块 —— 命名保存、列出（含自动存档）、载入、删除、导出单档、导入单档、比较两个存档、从存档分叉。复用 `checkpoints` 全部既有导出，不新建存储层。自动存档策略（`autoEvery` / `autoSlots`）在面板可配并有当前水位提示。
- **边界**：恢复世界不触碰库本身；导出/导入走既有 `exportOne` / `importOne` 与 `checksum` 校验，格式不匹配明确拒收；与 `wa-snap-*` 全量快照的分工要在界面上说清（存档槽 = 世界状态槽；全量快照 = 可移植归档）；不把存档槽做成聊天存档的替代品。
- **验收**：保存 → 载入 → 世界状态与保存时一致（重载后仍一致）；两个存档可比较且差异有来源；从旧存档分叉后原存档逐字不变；导入损坏文件拒收且不留半写；槽位满与自动存档轮换有明确提示；导出单档可被同版本导入。

### E4 场景 / 战役层

- **优先级**：P1。世界能自转，但一局游戏没有目标与阶段。
- **现状**：`engines/world-blueprint.js`（834 行）已有 `SCENES`（场景模板）与 `KEEP_LEVELS`（保留层级）与 `BP_VER`；`engines/rehearsal.js`（557 行）已有 `run` / `preview` / `checkPreview` / `apply` / `rollbackScope` / `policy` / `divergence` / `fingerprint`（含 `follow` / `limited` / `free` 三种偏离策略）；`engines/difficulty.js`、`engines/story-choice.js` 提供难度与选择点。
- **实施范围**：一个轻量"战役"层 —— 玩家选一个带目标、阶段、结束条件的场景模板；每阶段有可观察的推进判据（引用已有世界事实，如某势力关系达到某档、某货物抵达、某秘密被揭示）；阶段完成时给出基于实际状态的结算；结束条件达成后给出复盘。战役层只登记目标与阶段判定，不新增世界机制。
- **边界**：阶段判据必须能由既有世界状态机械判定，不能由 AI 文本裁定；不为了"有进度"而伪造完成；战役结束不自动清空世界（是否开新局是玩家选择）；不重复 blueprint 的场景模板与 rehearsal 的偏离策略。
- **验收**：选定场景后目标与阶段可见；阶段推进来自真实世界变化（构造一次真实变化，阶段前进一次）；不满足条件时阶段不前进；结束条件达成给出复盘且复盘数字与现场读数一致；重载后战役进度延续。

### E5 玩家可读的世界历史与证据日志

- **优先级**：P1。世界沉积、编年史、账本都在，玩家读到的是原始键名。
- **现状**：`engines/chrono.js` 有 `chronicle`、`layer`、`derives`、`diff`、`simBranch`；`engines/ledger-timeline.js`（229 行）有站点观测账（`state` / `seen` / `observed` / `streak` / `rounds` / `failing` / `stalled`，空态文案"未观测到（本引擎尚未收到该站点的观测）"）；`engines/timeline.js`（182 行）有来源校验（`valid` / `reason` / `refs` / `changed` / `missing`）；`engines/causal.js`、`engines/sediment.js`、`engines/digest.js` 提供因果链、地点痕迹与摘要。
- **实施范围**：一个按剧情时间排序的"世界纪事"视图：每条含时间、地点、参与者、发生了什么、依据哪条回执/账本条目、玩家当时是否可知。叙事化呈现，但每条都能下钻到来源记录（账本条目 / 回执 ID / 沉积痕迹）。
- **边界**：叙事化不得改变事实（不能把传闻写成已确认）；玩家不可知的条目不进玩家视图（与 O9 同一条边界）；不新增第二套历史存储 —— 视图只读既有记录；历史截断明确标注覆盖范围。
- **验收**：任意一条纪事都能下钻到来源记录并逐字一致；玩家不可知的记录不出现；时间轴顺序与剧情时间一致；空历史与读不到可区分；重载后纪事不丢不重。

### E6 统一世界地图与关系视图

- **优先级**：P1。地理、势力、路线、痕迹、远方分在五处。
- **现状**：`engines/region.js`（地点与传播）、`engines/faction-graph.js`（关系图，边恒为 `derived: true` 并带 `basis`）、`engines/diplomacy.js`（成对外交事实，与派生边明确分层）、`engines/freight.js`（在途路线）、`engines/sediment.js`（地点痕迹）、`engines/farfield.js` + `engines/horizon.js`（407 行，远方与远方脉搏）、`engines/world-bridge.js`、`engines/parallel-world.js`（407 行，平行世界 NPC 与模块快照）。
- **实施范围**：一个统一视图，把地点、势力、道路端点、在途货物、地点痕迹、远方地区画在同一坐标系里；关系视图叠加两层 —— 派生边（`derived`）与已确立外交事实（成对条约/态度），两者**视觉上必须可区分**，未知保持未知。
- **边界**：派生边不得显示为已确立事实；未知双边关系保持 unknown 而不是"中立"；不为未知地点造坐标；远方地区与近场必须分域显示；地图是只读视图。
- **验收**：同一势力对在派生层与事实层显示不同且可解释；未签约的势力对不显示为条约；在途货物出现在正确路线上且到达后移出；地点痕迹能定位到地点；未知项有显式未知态。

### E7 玩家自定义规则与自动化模板

- **优先级**：P1。规则文本与主题模板已有，但没有玩家侧的"我的规则包"。
- **现状**：`engines/rules.js` 有 `RULES` / `ORDER` / `LABELS` / `NEW_MODULES` / `isNewModule` / `getAll` / `coreSummary` / `getModule` / `listModules` / `getRuleCount`（`ui/panel.js` 与 `engines/inspector-state.js` / `engines/theme.js` / `engines/backstage.js` 已有真实消费方）；`engines/theme.js` 按 `ORDER` 组合主题；`engines/preset.js`、`engines/recipe.js`（434 行，`RECIPES` / `POLICIES` / `BASICS` / `THEME_CLASH` / `SOURCE_FILES` / `preview` / `apply` / `seed` / `staleness` / `basicsUnverified`）、`engines/preset-world.js` 提供预设与配方；`settingsBus` 是设置写入的单一真源。
- **实施范围**：让玩家能保存/命名/切换"规则包"（启用哪些规则模块 + 主题 + 相关设置的一组快照），并能把规则包导出/导入。自动化模板限于**白名单动作 + 预算上限**：例如"每 N 轮自动执行一次某类安全操作"，模板本身声明预算、上限与失败策略。
- **边界**：模板不得绕过各模块的拒收与容量规则；不得引入可执行脚本（零依赖仓库不执行用户脚本）；规则包只记录设置与启用面，不改世界状态；`settingsBus` 仍是唯一写路径。
- **验收**：保存规则包 → 切换 → 启用面与设置与保存时一致；导出再导入得到同一启用面；模板触发受预算与上限约束（超限明确拒收）；关闭模板后零写入；非法模板拒收且不改设置。

### E8 蓝图 / 种子依赖包与迁移助手

- **优先级**：P1。蓝图与种子已有，缺"缺了什么、能不能用、怎么降级"的报告。
- **现状**：`engines/world-blueprint.js`（834 行）有 `BP_VER` / `KEEP_LEVELS` / `SCENES` / `exportBlueprint` / `checkIntegrity` / `save` / `get` / `list` / `drop` / `previewImport` / `importBlueprint` / `targetEmpty`；`engines/world-seed.js` 保留旧的有损种子格式；`engines/checkpoints.js` 有 `migrations` / `registerMigration` / `migrate`；`engines/recipe.js` 有 `SOURCE_FILES` 与 `staleness` / `basicsUnverified`。
- **实施范围**：一个"依赖体检"视图 —— 导入蓝图/种子/存档前，列出 schema 版本、缺失的外部依赖（卡 / 世界书 / 媒体资产 / 其他扩展）、需要但未启用的机制、可降级的字段与降级后的实际损失、以及是否可迁移（走 `checkpoints.migrations`）。迁移助手提供候选转换与失败保留原文件。
- **边界**：缺依赖就明说缺，不静默跳过也不假装可用；旧的有损种子继续如实标注损失，不伪造道路端点或同名身份；迁移失败必须保留原文件；不把蓝图当完整聊天存档。
- **验收**：构造缺依赖的蓝图，体检报告逐条列出缺失项与影响；能迁移的走迁移且迁移后可用；不能迁移的拒收且原文件逐字不变；降级报告与导入后的实际状态一致；同版本蓝图往返无损。

### E9 安全的"世界实验室"与反事实对比

- **优先级**：P2。预演与平行世界已有，缺隔离副本与差异展示。
- **现状**：`engines/rehearsal.js` 有 `run` / `preview` / `checkPreview` / `apply` / `rollbackScope` / `fingerprint` / `divergence`；`engines/branch-tree.js` 有 `fork` / `choose` / `tree` / `compare` / `replay`（`compare` 只看 keys/chars/digest 指纹，缺失为 unknown，`replay` 要求旧预演仍匹配）；`engines/chrono.js` 有 `simBranch`；`engines/parallel-world.js` 有 `saveSnapshot` / `listSnapshots` / `restoreSnapshot` / `dropSnapshot`。
- **实施范围**：一个显式的隔离实验面 —— 在世界状态副本上跑若干次预演，展示"选 A / 选 B / 什么都不做"三条路径的差异（关系、资源、地理、关键事件），差异按来源标注；实验结束后丢弃副本，或显式导出为一份蓝图/存档供参考。
- **边界**：实验绝不写 live store；预演指纹缺失保持 unknown，不冒充"相同"或"不同"；状态变了就重新预演（过期预演不能强行应用）；反事实结果不能回溯覆盖当前存档；时光倒流不属于本项。
- **验收**：实验中修改世界不影响 live 状态（前后摘要一致）；三条路径差异可解释且带来源；过期预演明确拒收；丢弃副本后无残留；导出实验为蓝图后可被 E8 体检。

## 实施顺序

| 批次 | 范围 | 结束时玩家可见成果 |
|---|---|---|
| 第一批（统一入口） | E1 + E3 | 一屏看到所有待办；存档槽真正可用（含比较与分叉） |
| 第二批（时间与叙事） | E2 + E5 | 一张未来日程 + 一条可下钻的世界纪事 |
| 第三批（表达与迁移） | E4 + E6 + E8 | 带目标与阶段的战役、统一地图与关系视图、依赖体检与迁移助手 |
| 第四批（可定制与实验） | E7 + E9 | 规则包与自动化模板、隔离实验室与反事实对比 |

E1 与 E3 先做，因为它们的引擎最完整、玩家感知最直接，且都不新增世界机制。E6 与 E4 依赖 E5 的事实下钻能力，故排在 E5 之后。

## 与旧计划的关系

| 本代项 | 复用基础 | 新能力 |
|---|---|---|
| E1 | 35 个引擎的 `pending()`、各模块确认语义与拒收码 | 统一待办聚合与下钻 |
| E2 | calendar / calendar-custom / chrono / longline / commission / diplomacy / freight / aftermath 的到期项 | 按剧情时间排序的未来事件表 |
| E3 | `checkpoints` 全部 28 个导出（现零面板入口） | 存档槽 / 比较 / 分叉 / 单档导入导出 |
| E4 | world-blueprint 的 `SCENES` / `KEEP_LEVELS`、rehearsal 的偏离策略、difficulty | 目标 / 阶段 / 结束条件与复盘 |
| E5 | chrono.chronicle、ledger-timeline、timeline、causal、sediment、digest | 叙事化但可下钻的世界纪事 |
| E6 | region / faction-graph / diplomacy / freight / sediment / farfield / parallel-world | 统一坐标系 + 派生边与事实边分层 |
| E7 | rules / theme / preset / recipe / settingsBus | 命名规则包与白名单自动化模板 |
| E8 | world-blueprint 的 `checkIntegrity` / `previewImport`、world-seed、checkpoints.migrations、recipe.SOURCE_FILES | 依赖体检 / 降级报告 / 迁移助手 |
| E9 | rehearsal / branch-tree / chrono.simBranch / parallel-world 快照 | 隔离副本与三路径反事实对比 |

TX 线的九项机制在本代**全部复用不重做**；本代只补玩家侧入口、时间视图、可迁移性与实验面。方案理由、旧项对照与两线排期见 [本代提案](../.agents/notes/proposed/architecture/2026-10-08-worldaxis-o-e-plans.md)。
