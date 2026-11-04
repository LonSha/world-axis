# WorldAxis V11 纲领：真空面、驱动面与读面失真治理（OPV11-1～9 + EXV11-1～9）

> **基线**：`v2.296.0` / `5b7f991`（V10 全景双九项 18/18 已交付并推送）
> **版本目标**：`v2.297.0` 起逐项推进，收口轮另定
> **纪律**：**双项目双计划全部完成前，不执行全量回归（`node tests/run.js`）**。当前阶段仅执行定向专项、真源判据与局部闭环。

---

## 零、立项硬读数（2026-11-05 现场实测，全部可复跑）

复跑方式：`node tools/v7probes/p_four_layer.js`、`node tools/v7probes/p_yield_baseline.js`、以及 `/tmp/v11probe*.js` 系列一次性探针（结论已固化进下表，不依赖 /tmp 存活）。

| 指标 | 取法 | 实测读数 | 诊断 |
|---|---|---|---|
| 引擎文件总数 | `ls engines/*.js \| wc -l` | **290** | 机制底座规模 |
| 命名空间总数 | `Object.keys(WA).length` | **367** | — |
| 暴露 `buildBlock` 的命名空间 | `typeof WA[ns].buildBlock === 'function'` | **114** | 候选注入面 |
| `render/inject.js` 的 `SOURCES` | 正则解析（剔除注释） | **115** | 注入源注册表 |
| **`buildBlock` 有、`SOURCES` 无** | 差集 | **8**：`pmem` `summarizer` `editorFaction` `editorEvents` `memorySampler` `kaleidoscope` `beatFacade` `intentBoard` | 其中 6 个面板已消费、2 个（`pmem`/`summarizer`）无人消费 ⇒ 归属未裁决 |
| **空世界非空产出** | 逐台 `buildBlock()` 空世界 | **4 / 114**（`livingWorld` `healthPreflight` `antiOmniscience` `outputGuard`） | 110 台在空世界零产出 |
| **真实开局后非空产出** | `p_yield_baseline.js` | **15 / 114** | 基线门禁底线 14，仅高出 1 |
| **空世界 `buildWorldSnapshot()`** | 直接调用 | ~~长度 0~~ → **OPV11-1 已修**：`state="no-session"` 骨架非空 | 立项时世界状态块在空世界是**完全空白**；现改为如实声明（见第 1 批交付记录） |
| `applyInjections` 主路径条目 | 宿主桩 + 传入 `injections: []` | **items = 0**；`lastInjection.snapState` 已记录本轮快照态 | 主路径条目数仍为 0（属 OPV11-2，未开工）；但"这一轮世界状态为何不是 live"已可直读打点，不必 parse 快照串 |
| 同上，宿主槽位真实内容 | 读 `setExtensionPrompt` 实收 | **573 字符 / 4 源**（真实世界运转、系统健康与写作防线、防全知认知视界、别替玩家说话） | **主路径与宿主槽位读数分叉**：items=0 而槽位有 573 字 |
| `L3_EXCLUDES`（档位排除的悬空引擎） | `capabilityTier.L3_EXCLUDES` | **35** | V7 OPV7-8 定案的"需手动录入数据"名单 |
| `roundDrivers.DRIVERS`（轮次驱动名单） | 直接读 | **7** | 只覆盖 `tolerance` `motif` `marginal` `quota` `spotlight` `rhythmLoop` `eraCycle` |
| **L3 中未被 roundDrivers 驱动** | 差集 | **28** | 35 台中 7 台有驱动，28 台仍"没人叫它一声" |
| **产品侧零调用者的推进类 API** | 枚举 `WA[ns]` 中以 tick/advance/sweep/due/settle/... 开头的函数，全仓（除 tests/tools）搜调用点 | **49** | 含 `events.due` / `events.fulfillDue` / `world.advance` / `farfield.tick` / `vitals.tick` / `hazard.tick` / `gauge.step` / `checkpoints.tick` 等 |
| `unifiedPending.collect()` 空世界 | 直接调用 | **total=0 / highCount=0 / items=0** | "世界没事可做"与"聚合器没接上模块"在读数上同形 |
| 同一 store 字段被 ≥3 个引擎写 | 扫 `draft.X =` / `.push(` | **5 个**：`worldFacts`(5) `people`(5) `evolution`(5) `customLax`(3) `economy`(3) | 多写者字段的写权归属未声明 |
| `ui/panel.js` 页面数 / 分类数 | 正则 | **PAGES 37 / CATS 5** | CATS 注释写"4 大核心分类 + all"，实为 5，且 `PAGE_CAT` 有 `world` 键与 CATS 的 `world` 同名 | 
| 测试文件面 | `ls tests/*.js \| wc -l` | **438**（+4：v11-source-contract / v11-snapshot-state 及其挂载） | V11 新增锁全部已挂进 `tests/run.js`，孤儿 0 |
| `tests/run.js` 引用数 | 正则 | **217** | 434 个文件里 217 个挂在全量里（V11 新增锁须同步挂载） |

**立项判据（V11 命题）**：V10 解决了「机制通不通」；**V11 要解决的是「通了以后，读数说不说实话」**。上表六条分叉——空世界快照 0 长度、主路径 items=0 而槽位 573 字、35 台 L3 只驱动 7 台、49 个推进 API 无人叫、unifiedPending 0/0 三态同形、5 个多写者字段无写权声明——**全部属于「系统在跑，但读数无法自证」的同一类病**。V11 的每一项都必须以「同一件事在不同读面给出同一个答案」为验收口径。

---

## 一、优化九项（OPV11：真空面、驱动面与读面失真治理）

### OPV11-1 空世界快照的真空态（`buildWorldSnapshot` 0 长度）
- **现状**：空世界 `buildWorldSnapshot()` 返回**长度 0**。`applyInjections` 里 `if (snap) items.push(...)` 因此整块世界状态不产生任何条目——**"世界还没开局"与"世界状态块构建失败"在读数上完全同形**（与 OPV7-7 判定的 `no-data`/`fault` 同形问题是同一族，只是发生在快照层）。
- **目标**：三态如实。① 未开局 ⇒ 返回一段**明确声明"尚未开局"的极简骨架**（零事实、零编造，只有状态声明）；② 已开局且无事实 ⇒ 返回带 `no-facts` 记号的骨架；③ 构建异常 ⇒ 抛出/记账为 `fault`，**不得**静默返回空串。快照必须带 `state` 字段供读面断言。
- **验收**：空世界 `buildWorldSnapshot()` 非空且 `state==='no-session'`；开局后 `state==='live'`；注入链在空世界至少产生 1 条世界状态条目；真源破坏（把三态判定条件置假）后判据必须翻红。

### OPV11-2 主路径与宿主槽位的双面一致性（items=0 vs 槽位 573 字）
- **现状**：宿主桩实测 `applyInjections({injections: []})` 之后，回调入参 `injections` 仍是 **0 条**，而 `setExtensionPrompt` 实际收到 **573 字符 / 4 个源**。这意味**注入的真实产出面与 `lastInjection.sources` 记录面不是同一个东西**，任何读 `items.length` 的下游判断（预算裁决、覆盖率统计、诊断面）都在读一个空集。
- **目标**：把「本轮真实注入了哪些源」收敛为**单一真源**。`lastInjection.sources` 必须与宿主槽位实收内容逐一对得上；`applyInjections` 的回调入参必须能反映真实注入条目，或明确在契约里声明"入参为调用方预置槽位、产出面请读 `lastInjection`"，并在诊断面据此纠正。
- **验收**：同一轮注入后，`lastInjection.sources` 的源名集合 == 宿主槽位解析出的源名集合；不一致即红；负控制：把"写入 sources"那一步条件置假，判据必须现形。

### OPV11-3 28 台未驱动 L3 的分级裁决
- **现状**：`capabilityTier.L3_EXCLUDES` 35 台，`roundDrivers.DRIVERS` 只驱动 7 台，**28 台既不入轮次驱动名单、也未逐台写明"为什么不入"**。V7 OPV7-8 只做到"从 full 档移除 + 标注需手动录数"，没做到"逐台定性"。
- **目标**：把 28 台逐台归入四类并写死在登记表里：①**零参可驱动**（应收进 `DRIVERS`）；②**需剧情入参**（不能硬塞轮次，写明需要什么入参、由谁提供）；③**玩家决策面**（只能从面板/写口台进入）；④**真死面**（无消费者且无产出路径，进 dead-export 账）。登记表是唯一真源，`DRIVERS` 由它派生，**禁止两处各写一份名单**。
- **验收**：28 台全部有且只有一个分类；①类全部真实出现在 `DRIVERS` 里并能零参调通（返回 `{ok:true}` 或 `{ok:false,reason:'disabled'}`）；④类必须是 dead-export-ledger 里的既有项，不得新造；分类表与 `DRIVERS` 的一致性由专锁双向断言。

### OPV11-4 49 个零调用推进 API 的死面裁决
- **现状**：产品侧（除 `tests/` `tools/`）对 49 个推进类 API 零调用。其中 `events.fulfillDue` 在 `engines/events.js:768` 被 `round-drivers` 风格的 `run` 注册表引用过**一次**，但该注册表本身是否被调度未验证；`vitals.tick` 只出现在 `tool-diag.js` 的调试直调表里。
- **目标**：逐条裁决为「接进调度」或「确认死面」。两条口径必须写死：**①能零参安全调用的**接进 `roundDrivers` 或对应调度；**②必须带剧情入参的**在登记表写明入参契约与提供方；**③真没人要的**不要保留"看起来能推进"的假面——按其真实状态登记（dead-export 或改注释为纯内用）。
- **验收**：49 条全部有裁决结论；每个"接进调度"的 API 必须有一条真实调用见证（调用点存在 + 调用后 `stat()` 有增量）；负控制：把调用点注释掉，判据必须翻红。

### OPV11-5 8 个未接注入源的 `buildBlock` 归属裁决
- **现状**：`pmem` `summarizer` `editorFaction` `editorEvents` `memorySampler` `kaleidoscope` `beatFacade` `intentBoard` 八台有 `buildBlock` 但不在 `SOURCES`。其中 6 台面板已消费（`editorFaction` `editorEvents` `memorySampler` `kaleidoscope` `beatFacade` `intentBoard`），2 台（`pmem` `summarizer`）**无人消费**。
- **目标**：逐台裁决：①**该进注入**（如 `intentBoard` 人物意图、`beatFacade` 节拍门面，属于正文推演需要知道的事）⇒ 接进 `SOURCES` + 默认开关 + 分源预算，与 V10 OPV10-1～6 同规；②**不该进注入**（如 `editorFaction`/`editorEvents` 是编辑面、`pmem`/`summarizer` 是内部工具面）⇒ 在注入源上方注释里逐台写明"为什么它不是注入源"，并在 `pmem`/`summarizer` 的 `buildBlock` 上标注真实用途或按死面处置。
- **验收**：8 台全部有结论；新增注入源的必须同时有 `SOURCES` 登记 + 默认值 + 显示名 + 注入分支（V10 OPV10 已立的四件齐做规矩）；负控制：删掉任一新增源的一条登记，`inject-sources` 类锁必须红。

### OPV11-6 多写者字段的写权声明
- **现状**：`worldFacts` `people` `evolution` 各被 5 个引擎写，`customLax` `economy` 各 3 个。**没有一个地方声明"这个字段由谁负责、其他人是追加还是覆盖"**。V10 EXV10-8 新加的 `simulateDynamics` 读写 `evolution.factions`，正属于此类。
- **目标**：为这 5 个字段建立**写权声明表**（单一真源，可被专锁读）：字段名 / 责任引擎 / 允许的其他写者 / 写方式（追加 / 合并 / 覆盖）/ 冲突检测。不要求重构写点，**只要求把现状如实声明出来并加冲突检测**——声明与现场不符即红。
- **验收**：5 个字段各有声明；声明里列的写者集合 == 现场扫描出的写者集合（双向）；同一字段出现"两个覆盖型写者"必须被判为冲突并登记为待治理项，而不是静默通过。

### OPV11-7 `unifiedPending` 三态可分辨
- **现状**：空世界 `collect()` 返回 `total=0 / highCount=0 / items=0`。这是三件事同形：①世界确实没事可做；②聚合器没接上任何模块（模块缺席）；③接了模块但全部报错（fault）。
- **目标**：`collect()` 返回里必须能分辨三态：`state: 'empty' | 'ok' | 'fault'`，并给出 `hands`（接了几个模块）/ `skipped`（缺了几个模块 + 名字）/ `faults`（报错几个 + 名字）。`total===0` 时**必须**同时给出 `hands`/`skipped`，让读面能判断"真空"还是"没接上"。
- **验收**：三态各自有可构造的见证（空世界 `empty` 且 `hands>0`；删一个模块得 `skipped` 含其名；桩一个抛错的模块得 `faults>0`）；诊断面 `unifiedPending.diagnose()` 与 `collect()` 同源。

### OPV11-8 注入源与引擎 `buildBlock` 的一对一契约锁
- **现状**：`SOURCES` 115 条、`buildBlock` 114 台、差集 8 台，三个数字互相咬不上。V10 靠人肉维持四件齐做，**没有一条门禁能把"注册表 / 分段 / 默认值 / 显示名"四者的漂移一次性抓出来**。
- **目标**：新增 `tests/v11-source-contract.js`：从源码静态抽出 ①`SOURCES` 数组、②`applyInjections` 里所有 `vis.X` 分支、③默认值表、④`VIS_NAMES` 显示名表、⑤`WA.<ns>.buildBlock` 实存集合，做**五表交叉断言**：每个 `SOURCES` 项在 ②③④ 里各有一条；每个 ② 里的 `vis.X` 在 ① 里；每个 ⑤ 的 `ns` 要么在 ① 里、要么在"已裁决不进注入"的白名单里（白名单由 OPV11-5 产出，禁止凭空空缺）。
- **验收**：五表全绿；真源破坏五处（各拆一条）分别让判据红；白名单新增项必须在注释里有裁决理由，否则判红。

### OPV11-9 拒收码、死面账本与版本面同步加固
- **现状**：V11 会新增多张登记表（L3 分级表、49 API 裁决表、5 字段写权表、8 台注入归属白名单、`unifiedPending` 三态），每张表都要有对应的拒收码/死面/版本读数跟随，否则就是 V7 复盘过的"新增面不登账"。
- **目标**：逐表登记：新增拒收码（缺表/表项不全/表项过期）、新增死面项（真死面进入 dead-export-ledger）、版本面白名单跟随、`tools/gen-error-codes.js --check` 无缺无余、`tests/dead-export-gate.js` 零新增死导出、`tests/version-surface-gate-v2185.js` 白名单全跟当前版本。
- **验收**：五张门禁全绿；每条新增拒收码有真实触发见证（`reject-v2780.js` 同步补）。

---

## 二、拓展九项（EXV11：把"读数说实话"变成玩家能看见、能操作的面）

### EXV11-1 开局工作台（世界骨架一键成型）
- **目标**：面板新增"开局"下钻页，把 `playableSeed.preview` / `playableBlueprint` 的候选蓝图列出，一键真实开局（走真写口），并当场显示"开局后非空产出 N/114"。**空蓝图时必须如实报 `no-blueprint` 并给出"怎么导入蓝图"的下一步**，不得假装开局成功。
- **验收**：一键开局后非空产出 ≥ 15（不低于 V7 基线）；无蓝图时按钮给出 `no-blueprint` 明确文案；面板控件全部进 ui-binding-coverage。

### EXV11-2 世界真空诊断看板（"为什么这轮世界没内容"）
- **目标**：把 OPV11-1 的三态 + OPV11-7 的三态 + `healthPreflight.yieldAttrib` 的四态合成一屏：这一轮的空白究竟是 `no-session`（没开局）、`no-facts`（开了但没事实）、`skipped`（模块没接上）、`fault`（报错了）、还是 `off`（开关关着）。每一项都能下钻到具体引擎名。
- **验收**：五种态各有可构造见证；面板逐态给出可执行的下一步文案；读面纯只读（不写存档、不跑引擎）。

### EXV11-3 轮次驱动台（28 台 L3 的驱动状态一屏可见）
- **目标**：面板"驱动"页列出全部 L3（35 台）+ 每台的分类（OPV11-3 四类）+ 是否在 `DRIVERS` 内 + 上次被驱动的返回值 + `stat()` 读数；提供"单台试驱动"按钮（只调零参安全的①类，②③④类按钮置灰并显示原因）。
- **验收**：35 台逐台有状态；试驱动只对①类可用且真实产生 `stat()` 增量；置灰按钮必须给原因，不得静默禁用。

### EXV11-4 待办中心真实下钻（`total=0` 时给出"怎么产生待办"）
- **目标**：基于 OPV11-7 的三态，`total=0` 时不再渲染一片空白，而是显示 `hands`/`skipped`/`faults` 三行，并对每个 `skipped` 模块给出"它需要什么才会产生待办 + 去哪录入"的直达链接（走 `WA.ui.showCat`，V10 EXV10-6 已落地）。
- **验收**：空世界下待办页有内容（三行 + 引导）；点引导能真实跳到对应页；有数据时回归原有列表。

### EXV11-5 注入双面视图（主注入 vs 宿主槽位并排）
- **目标**：基于 OPV11-2 的一致性收敛，注入页并排显示：主路径条目 / 宿主槽位实收源与字符数 / `lastInjection` 记录 / 差异红标。这是把 V10 埋下的读数分叉变成**玩家与作者都能一眼看见的面**。
- **验收**：三栏读数同源；差异非空时红标并给出可能原因；纯只读。

### EXV11-6 世界快照查看器（逐源裁剪预览）
- **目标**：把 `buildWorldSnapshot()` 的真实产出（含 OPV11-1 的三态标记）在面板里原样展示，并把 `injectBudget` 的 `plan()` 结果叠上去——每个源的 token 数、是否被折叠、折叠原因、折叠后内容。让"预算降档"从日志里的数字变成能看见的对照。
- **验收**：快照逐字等于引擎产出（不二次加工）；三态标记可见；折叠前后内容可对照。

### EXV11-7 死面台账工作台（49 项推进 API 的处置面板）
- **目标**：把 OPV11-4 的裁决结果做成可查表：每条 API / 当前调用者数 / 裁决类别 / 处置动作 / 对应门禁。作者能一眼看出"这 49 条还会不会再冒出来"。
- **验收**：49 条全部在表内；表与源码扫描结果双向一致；分类变更需改登记表（不得在面板里改）。

### EXV11-8 面板分类与页面表一致性治理
- **目标**：治理 `PAGES` 37 / `CATS` 5 / `PAGE_CAT` 三者的口径问题：注释写"4 大核心分类 + all"而实为 5；`PAGE_CAT` 有 `world` 键与 CATS 的 `world` 同名（页面 id 与分类 id 撞名）。建立 `PAGES ⊂ PAGE_CAT` 与 `PAGE_CAT 值 ⊂ CATS id` 的双向断言，并把注释改成与实现一致。
- **验收**：双向断言全绿；37 个页面每个都有分类；CATS 每个分类至少有一个页面（空分类判红）；注释读数与实现逐字一致。

### EXV11-9 V11 端到端验收矩阵
- **目标**：`tests/v11-master-matrix.js`，无桩真实覆盖 OPV11-1～9 与 EXV11-1～9 全部 18 项，18/18 全绿；并同步挂进 `tests/run.js`（V11 新增锁全部挂载，孤儿为 0）。
- **验收**：18/18 PASS；`tests/test-surface-gate.js` 孤儿 0；`o7-plan-tree-gate` 本计划文件读数块同步。

---

## 二·五、第 1 批交付记录（2026-11-05）

### OPV11-8 注入源五表契约锁 —— 已交付
- **落盘**：`tests/v11-source-contract.js`（453 行，判据 T1～T9），挂载于 `tests/run.js` 的 V11 专节（先于 V11 其余脚本）。
- **判据结构**：五表交叉（`SOURCES` / `buildBlock` 实存 / 分支 / 默认值 / 显示名）+ **双面白名单** + **闭合等式双向断言**。
- **两条实测闭合等式**（可复跑，已写进判据）：
  - `114（buildBlock ns）= 106（与 SOURCES 交集）+ 3（子源：memorySampler/pmem/summarizer）+ 5（非源：beatFacade/editorEvents/editorFaction/intentBoard/kaleidoscope）`
  - `115（SOURCES）= 106（交集）+ 9（内联/自有取数口：clock/pulse/background/people/currents/echoes 为 inline，memory/opinion/ledger 为 ownBuilder）`
- **白名单每条绑定 `verify`**（subsource/workflow/reasoning/editor/dead/inline/ownBuilder）现场复算证据 + 非空 `reason`；T7 做「差集名单 == 白名单键集」**逐字对账**，多登记一项即红（防白名单变成遮羞布）。
- **第三注入通道的发现**：`kaleidoscope` 经 `WA.workflow.register({id:'kaleidoscope.inject', chain:'before', order:22})` 自注册并直接 `ctx.injections.push`，**不经 `SOURCES` 也不受 `vis` 开关管辖**（全仓共 13 个 `chain:'before'` 注册点）。故「没进 `SOURCES`」不等于「没进正文」。
- **判据纯度修复**：`inventory.codeFace` 会把字符串字面量抹成空格（「提及不算引用」的正确口径），但本锁需读 `'before'` 本身，故新增 `stripCommentsKeepStrings()`：只剥注释、保留字符串；N4d 专门验证「把 `'before'` 藏进注释必须仍判假」。
- **门禁**：pass 30/30；真值破坏自证（临时删 `engines/backstage.js:650` 的 `intentBoard.buildBlock` 消费者 ⇒ 当场精确报「产品侧零调用点」）已复原且逐字节一致。

### OPV11-1 空世界快照五态 —— 已交付
- **落盘**：`render/inject.js` 的 `buildWorldSnapshot()` 重写判定块 + `snapshotState()` 只读口；`tests/v11-snapshot-state.js`（S1～S8 + N1～N4，**43 项**）；`lastInjection.snapState` 真消费点。
- **五态**：`live`（除世界时间外有真内容，外壳逐字不变）/ `no-facts`（已开局但除世界时间外无内容，**保留世界时间行**并追加「已开局但没有任何世界内容」指引）/ `no-session`（连时间都没有）/ `fault`（有段取数失败，带 `faults` 名单）/ `off`（六源全关 ⇒ **必须空串**，保住 `tests/run.js:3885` 既有语义）。
- **核心裁决（本批最重要的设计结论）**：**「在场」与「状态」必须解耦**。
  - 冲突现场：`tests/settle-v2841.js` C 面锁死「只留 `clock` 一个源开着时它必在场」，而初版把「只有世界时间」判成 `no-facts` 并把时间行挪进状态注释 ⇒ 世界时间从正文消失 ⇒ FAIL 1/19。
  - 裁决：`state` 标记可以变，**已产出的 `parts` 行在任何状态下都不许删**。`no-facts` 与 `live` 的差别**只在头部声明**，不在正文。两个既有不变量同时满足，无一是被牺牲的。
  - 附带清理：删掉 `if (clockSet)` 外层包裹（它导致「未开局但有内容」漏 return）与旧注释残留（同一处有两个矛盾口径），**判定真源收敛为一处**。
- **三次真缺陷自纠**：
  1. `hasContent` 改名只改了定义、没改 fault 分支的引用 ⇒ `fault` 态裸抛 `ReferenceError`（被专锁 S5c/S5d 抓到）。
  2. `clockSet` 首版裸读 `s.clock.label` 在六段 try 之外 ⇒ 抛错 getter 让异常冲出快照（正是本文件 v2.86.0 修过的病在新增代码里复刻）。修复为自带 try/catch。
  3. `clockSet` catch 里重复 `noteEngineFailure` ⇒ 一次故障计两条，撞碎 `settle-v2860` [C1]「单次异常 ⇒ 台账恰好 +1」。修复为只补 `faults` 名单、不重复记数。
- **只读口必须有真消费点**：`snapshotState()` 首版只被测试引用，`dead-export-gate` 当场判「新增死导出 1 项」。修复为在注入主路径 `lastInjection` 打点里落 `snapState: { state, faults }`，并补 S7d/S7e/S7f 三条判据（含 `live`/`no-facts` 两态随事实变化，防恒真）。
- **retrieval 既存缺陷清偿**（回归时发现，非本项引入）：`tests/inject-vis-v2580.js` 自 v2.228.0 起 FAIL 1/10，根因是 `render/inject.js:1594` 的检索源有第二前提——`chat` 末条必须是 `is_user` 帧。治法**不是放宽判据**，而是新增 `NEEDS_USER_FRAME` + `ensureUserFrame()` 把前提真建起来；强度自证：删掉 `vis.retrieval` 守卫后 C 面仍报「残留: retrieval」。
- **验证**：专锁 43/43；关联矩阵 10/10 全绿（v11-snapshot-state / v11-source-contract / inject-vis-v2580 / vis-default-v2260 / settle-v2841 / settle-v2860 / perf-trace-v2102 / v10-inject-pipeline / v10-unified-pending / v10-ui-pills）；门禁 12 道全绿（test-surface / gate-timeout / module-registry / dead-export / export-contract / field-liveness / ui-binding-coverage / version-surface / o7-plan-tree / reject-code / isolated-runner / module-cycle）。
- **全量回归**：按要求**未执行** `node tests/run.js`（冻结至双项目双计划全部收口）。

---
### 第 2 批交付记录（2026-11-05）

#### OPV11-7 `unifiedPending` 三态可分辨 —— 已交付
- **落盘**：`core/unified-pending.js`（`state` / `hands` / `skipped` / `faults` 四个新字段）+ `tests/v11-pending-state.js`（P1～P9 + N0～N4，**33 项**）。
- **修前病灶**：七个分支全是 `catch (e) {}` —— 异常**静默消失**，读面永远看到「没事」。`total=0` 时「真没事 / 没接上 / 报错了」三态完全同形。
- **三态口径**（写进判据）：`faults` 非空 ⇒ `fault`（**优先**，即使同时有正常产出）；否则 `list` 非空 ⇒ `ok`；否则 ⇒ `empty`。
  - fault 优先的理由：若因为「别的模块正好有产出」就报 `ok`，那个坏掉的模块会永远沉默 —— 静默换了一层皮重现。
- **三张名单在任何态都全量给出**：不许只在非 ok 时才给细节（那样读面得先判态才能读，等于把同形问题挪一层）。
- **`diagnose()` / `stat()` 同源**：同一个 `collectPending()` 调用链，不另起一套计数；`summary` 按三态给三句不同的话。

#### OPV11-2 主路径与宿主槽位双面一致性 —— 已交付（**立项读数被现场推翻一半**）
- **立项原判**：「入参 `injections` 仍是 0 条，而宿主实收 573 字 ⇒ 产出面与记录面不是同一个」。
- **现场复测的真相**：**这两个面本来就不该一致**，混为一谈才是立项误读 ——
  - `ctx.injections` 是**调用方预置的输入槽位**（宿主把剧情约束等塞进来，由本函数取出并入 `items`）。它是**输入**，不是产出。往里回写才是错的设计。
  - 真实产出面 = `combined`（主块文本）＋ 各路独立槽位，落点记在 `lastInjection`。实测 `lastInjection.sources`（5 源）与宿主实收（729 字）**逐字对得上**。
- **本次裁决**：不做「让入参回写产出」（那会污染输入面），改做两件事：
  1. **契约显式化**：新增 `lastInjection.hosted = { ok, key, chars, slotCount }`，与 `sources` / `len` / `mainCount` 同一份打点 —— 读面不必再猜 573 是哪一面的数。
  2. **两面可对账**：`hosted.chars` 必须与宿主实收长度**逐字相等**；`hosted.chars === li.len`（长度单一真源）。
- **三态如实**：`hosted === null` 表示「没走到送达那一步」（失败由外层既有 catch 落日志，**不重复记一遍**，否则两个真源）；全源关时 `ok===true && chars===0`（空串送达是**成功的清场**，不是失败）。
- **落盘**：`render/inject.js`（`__hostedSnap` + 打点字段）+ `tests/v11-inject-dualface.js`（D1～D7 + N0～N3，**20 项**）。
- **D5 是本项最重要的判据**：`ctx.injections` 调用前后长度不变 —— 把「items=0 不是缺陷」写成可执行的正面表述，防止下一个人再来「修」它。

#### 第 2 批验证
- 专锁：v11-pending-state 33/33、v11-inject-dualface 20/20
- 关联矩阵 11 项全绿（含第 1 批全部条目 + v10-unified-pending 回归）
- 门禁 12 道全绿；版本面升到 2.298.0（14 文件跟随型白名单全跟上）
- **全量回归**：按要求仍未执行 `node tests/run.js`

---
### 第 3 批交付记录（2026-11-05）

#### OPV11-3 L3 分级登记表 —— 已交付
- **落盘**：`engines/l3-registry.js`（单一真源）+ `tests/v11-l3-registry.js`（L1～L10 + N0～N3，**22 项**）。
- **现场实测**：28 台未驱动 L3 逐台零参调用后得四类：**3 zero-arg**（genTiming.tick / beatMask.advance / temporalLock.check）、**19 needs-input**、**6 decision**、**0 dead**。
- **A 类真接进驱动**：`roundDrivers.DRIVERS` 从 7 台扩到 10 台，并改为：**从 `l3Registry` 派生**（保留 BASE_DRIVERS 作降级底座），每条带 `from` 标记来源。
- **关键口径自纠**：L1 不能用「L3 减去 DRIVERS」—— A 类一接进就从「未驱动」消失，判据永远红。口径改锚在**基线七台**：表键集 == 基线之外的 L3，而 L3 应用另管「A 类真的接进了」—— 两条各管一件事。
- **D 类为 0**：本仓当前没有真死面 L3；判据 L7 仍保留，一旦有人往里加 D 类，必须先在 dead-export-ledger 登记。

#### OPV11-4 推进类 API 死面裁决 —— 已交付（**立项读数 49 → 现场 23**）
- **落盘**：`engines/push-api-registry.js`（单一真源）+ `tests/v11-push-api-registry.js`（A1～A10 + N0～N3，**22 项**）。
- **立项数偏大的原因**：当时把「仅自调」与「被 dispatch 注册表引用」也算进了零调用。本版口径：产品面里不存在 `WA.ns.method(` 或 `ns.method(` 形式的调用点。
- **四类裁决（21 条：扣除基线七台与 l3Registry 已登记）**：**6 drive**（checkpoints.tick / vitals.tick / farfield.tick / gauge.step / followupGate.due / floorChanges.sweep）、**13 entry**、**2 ui**（cyberUI.progress / vitals.sweep）、**0 dead**。
- **关键发现（真实缺陷）**：`hazard.tick` 初判为 drive，零参调用实测**会写存档** → 改判 entry。这正是 OPV11-4 要治的病：「看起来可推进」与「安全可推进」是两件事，只有真调才分得清。
- **两表不重叠（A9 硬判据）**：`beatMask` / `events` / `fondness` 三台归 l3Registry 统一负责，push 表不再登记—— 谁负责必须唯一。
- **A5 判据口径自纠**：比对要用 **API 全名**（engine.method），不是命名空间—— 否则同一引擎的边路 API（vitals.sweep）会被 vitals.tick 的驱动误伤。
- **A8 专治「对账假绿」**：强制 DRIVERS 里 `from` 照搬来源，不允许统一写死成某个固定值（写死时两边同时读到错值，两条判据各自绿而对账已失效）。

#### 第 3 批验证
- 专锁：v11-l3-registry 22/22、v11-push-api-registry 22/22
- 关联矩阵 10 项全绿；门禁 12 道全绿（module-cycle 基线常量已随新增 2 模块回填：342/342/340 · 212/2668/2880 · 382/336/344 · orderLen 341）
- 版本面升到 2.299.0
- **全量回归**：仍未执行

---
### 第 3 批交付记录（2026-11-05）

#### OPV11-3 L3 分级登记表 —— 已交付
- **落盘**：`engines/l3-registry.js`（单一真源）+ `tests/v11-l3-registry.js`（L1～L10 + N0～N3，**22 项**）。
- **现场实测**：28 台未驱动 L3 逐台零参调用后得四类：**3 zero-arg**（genTiming.tick / beatMask.advance / temporalLock.check）、**19 needs-input**、**6 decision**、**0 dead**。
- **A 类真接进驱动**：`roundDrivers.DRIVERS` 从 7 台扩到 10 台，并改为：**从 `l3Registry` 派生**（保留 BASE_DRIVERS 作降级底座），每条带 `from` 标记来源。
- **关键口径自纠**：L1 不能用「L3 减去 DRIVERS」—— A 类一接进就从「未驱动」消失，判据永远红。口径改锚在**基线七台**：表键集 == 基线之外的 L3，而 L3 应用另管「A 类真的接进了」—— 两条各管一件事。
- **D 类为 0**：本仓当前没有真死面 L3；判据 L7 仍保留，一旦有人往里加 D 类，必须先在 dead-export-ledger 登记。

#### OPV11-4 推进类 API 死面裁决 —— 已交付（**立项读数 49 → 现场 23**）
- **落盘**：`engines/push-api-registry.js`（单一真源）+ `tests/v11-push-api-registry.js`（A1～A10 + N0～N3，**22 项**）。
- **立项数偏大的原因**：当时把「仅自调」与「被 dispatch 注册表引用」也算进了零调用。本版口径：产品面里不存在 `WA.ns.method(` 或 `ns.method(` 形式的调用点。
- **四类裁决（21 条：扣除基线七台与 l3Registry 已登记）**：**6 drive**（checkpoints.tick / vitals.tick / farfield.tick / gauge.step / followupGate.due / floorChanges.sweep）、**13 entry**、**2 ui**（cyberUI.progress / vitals.sweep）、**0 dead**。
- **关键发现（真实缺陷）**：`hazard.tick` 初判为 drive，零参调用实测**会写存档** → 改判 entry。这正是 OPV11-4 要治的病：「看起来可推进」与「安全可推进」是两件事，只有真调才分得清。
- **两表不重叠（A9 硬判据）**：`beatMask` / `events` / `fondness` 三台归 l3Registry 统一负责，push 表不再登记—— 谁负责必须唯一。
- **A5 判据口径自纠**：比对要用 **API 全名**（engine.method），不是命名空间—— 否则同一引擎的边路 API（vitals.sweep）会被 vitals.tick 的驱动误伤。
- **A8 专治「对账假绿」**：强制 DRIVERS 里 `from` 照搬来源，不允许统一写死成某个固定值（写死时两边同时读到错值，两条判据各自绿而对账已失效）。

#### 第 3 批验证
- 专锁：v11-l3-registry 22/22、v11-push-api-registry 22/22
- 关联矩阵 10 项全绿；门禁 12 道全绿（module-cycle 基线常量已随新增 2 模块回填：342/342/340 · 212/2668/2880 · 382/336/344 · orderLen 341）
- 版本面升到 2.299.0
- **全量回归**：仍未执行

---
## 三、排期与依赖

| 阶段 | 项 | 说明 |
|---|---|---|
| 第 1 批 | OPV11-8 + OPV11-1 | 先立契约锁，再改快照三态——锁先于改动，避免边改边漂 |
| 第 2 批 | OPV11-2 + OPV11-7 | 两个"读数分叉/三态同形"的根问题，改完注入面与待办面才有可信底座 |
| 第 3 批 | OPV11-3 + OPV11-4 | 驱动面与 API 面的逐台/逐条裁决，产出两张登记表 |
| 第 4 批 | OPV11-5 + OPV11-6 | 注入归属白名单 + 多写者写权声明 |
| 第 5 批 | OPV11-9 | 收口：拒收码/死面账/版本面全量对齐 |
| 第 6 批 | EXV11-1～4 | 玩家可见面第一组（开局、真空诊断、驱动台、待办下钻） |
| 第 7 批 | EXV11-5～8 | 玩家可见面第二组（注入双面、快照查看、死面台账、分类治理） |
| 第 8 批 | EXV11-9 | 端到端矩阵 18/18 |

**先锁后改**是本纲领的排序纪律：OPV11-8 的契约锁必须先于 OPV11-1/2/5 落盘，否则"注册表 / 分段 / 默认值 / 显示名 / 白名单"五表漂移会在改动过程中重新长出来。

---

## 四、验收纪律（继承 V7～V10 全部有效条款）

1. **不跑全量回归**：`node tests/run.js` 冻结至双项目双计划全部收口。V11 期间只跑定向专锁 + 局部矩阵。
2. **先锁后改**：OPV11-8 先落，之后每项的改动都在锁的看护下进行。
3. **三态如实**：任何"空"必须能分辨是"真空"、"没接上"还是"报错了"。不允许 `total=0` 或 `buildBlock===0` 这类同形读数成为结论。
4. **单一真源**：每张登记表只允许一处定义，派生方（`DRIVERS`、面板、诊断面）从它读，禁止各写一份。
5. **负控制必做**：每项至少一处真源码破坏（条件置假），且破坏必须让判据现形、原版上同款判据为真。
6. **正反判据成对**：不许只有"改完变绿"没有"改坏变红"。
7. **不新造死面**：新增导出必须有真实消费者；否则进 dead-export-ledger 并写明用途。
8. **读面不改存档**：所有诊断/看板纯只读，不写 `stat`、不写存档、不隐式落盘。
9. **版本与账本同批**：`index.js` / `manifest.json` / 三本台账 / 版本面白名单 / 计划读数块同批更新。
10. **未覆盖如实留**：做不到的如实写"做不到 + 为什么"，不伪称完成。

---

## 五、与 V10 的关系

- V10（OPV10-1～9 + EXV10-1～9，`v2.296.0`）解决的是**「机制通不通」**：六路引擎接进注入管线、统一待办聚合、预算单行降档、多势力博弈推演、18/18 验收矩阵。
- V11 解决的是**「通了以后读数说不说实话」**：V10 接进去的六路引擎在空世界仍然全员零产出（15/114 中它们一个都不在），这恰恰说明**"接上"和"有内容"是两件事**。V11 的每一项都以"同一件事在不同读面给同一个答案"为口径，而不是以"又接了一个引擎"为成果。
