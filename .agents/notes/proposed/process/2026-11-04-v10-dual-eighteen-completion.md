# Agent Note: WorldAxis V10 全景双九项演进纲领（18/18机制）闭环落地决策与交付记录

Status: implemented（`v2.296.0` 已交付并推送 `5b7f991`）

**日期**：2026-11-04  
**分支/基线**：`master` (`v2.296.0`)  
**相关任务**：V10 全景双九项演进纲领（OPV10-1～9 + EXV10-1～9）

---

## Problem

WorldAxis 在 `v2.295.0` 完成 V10 发布资质准备闭环后，现场暴露的是**机制在、正文看不见**：290 个引擎文件、114 台暴露 `buildBlock`，但 `render/inject.js` 的 `SOURCES` 未覆盖其中 36 台高价值世界交互引擎（`diplomacy` / `karma` / `events` / `elsewhere` / `economy` / `offlineTick` 等）；未决事项散落在 30+ 引擎中无单一只读聚合出口；多源同时激活时末尾源被预算截断；多势力利益冲突时无推演出口。这些问题共同导致「世界在跑，但玩家与模型都看不见它在跑什么」。

---

## 1. 架构决策背景与目标

WorldAxis 在完成 V10 发布资质准备闭环收口后，全面推进“V10 全景双九项演进纲领（合计 18 项：优化九项 OPV10-1～9 + 拓展九项 EXV10-1～9）”。
本阶段严格遵守用户工作偏好红线：**双项目双计划全部收口之前，坚决不执行全量回归（`node tests/run.js`），完全采用定向专项单测、真源破坏自证与局部矩阵闭环**。

---

## 2. 核心架构与机制落地明细（18/18 全闭环）

### 优化九项（OPV10-1～9）：机制贯通、预算降档与审计加固
1. **OPV10-1 外交条约（diplomacy）正文注入**：
   - 彻底排查前置授权契约：`diplomacy.sign` 执行权依赖 `inst.authority`，组织名称与势力名严格一致，且职位需具备 `approve` 位。
   - 在 `render/inject.js` 中打通 `diplomacy` 活跃条约与条款状态提取，正文提示槽精准注入。
2. **OPV10-2 因果报偿（karma）正文注入**：
   - 接通 `karma.buildBlock()` 双轴账导出，在推演时将善恶点数、净负业及干预阶梯（警示/干扰/压制等）如实注入提示槽。
3. **OPV10-3 日程事件（events）到期与时间线注面**：
   - 对齐排期入参契约 `{ id, title, at|inMs, priority, kind }`，打通 `events.buildBlock()` 正文出口，近期待办与迫近危机精准入选。
4. **OPV10-4 异地远方（elsewhere）羁绊与脉动注入**：
   - 打通 `elsewhere.open/update` 开卡与 `buildBlock()` 导出，将远方角色的心境、所在地及牵绊动态注入情境。
5. **OPV10-5 区域经济与市集（economy）注面接入**：
   - 在 `store.economy.goods` 建立供需与行情账本，打通 `economy.buildBlock()` 输出当前地点的物资行情与稀缺度。
6. **OPV10-6 离线推进（offlineTick）归来沉淀打通**：
   - 统一 `offlineTick.buildBlock()` 提取通道，跨会话重载时“离开期间世界变迁”精准入选。
7. **OPV10-7 统一待办中心（UnifiedPending）聚合服务**：
   - 落地 `core/unified-pending.js` 并接入 `index.js`，聚合 12+ 业务引擎的未决事务（抉择/委托/调查/后果/运营/远方/外交等），只读聚合输出，挂载定向测试 `tests/v10-unified-pending.js`。
8. **OPV10-8 注入源预算自适应紧凑单行降档**：
   - 在 `engines/inject-budget.js` 中新增纯计算函数 `compactSummary(text, maxTokens)`，并在 `plan()` 裁决超预算但余量不够常规折叠时，优雅降档为 `reason: 'compact'` 单行摘要（占用 10~25 tokens）。
9. **OPV10-9 拒收码与容量自检审计加固**：
   - 拒收码门禁 `tests/reject-code-gate.js` 全面校验：见证 777 / 死表 52 / 基线 550，达成 **0 未分类、0 缺失**；
   - 死子面冻结门禁 `tests/dead-export-gate.js` PASS（1174 dead / 6 uiDead，元数据与复算严格对齐）。

### 拓展九项（EXV10-1～9）：交互呈现与深层推演
10. **EXV10-1 面板「世界外交」可视化看板**：
    - `WA.diplomacy.view()` 与 `pairView()` 提供成对关系、有效条款、双边不对称态度看板数据源。
11. **EXV10-2 面板「因果天平」因果业力透视**：
    - `WA.karma.balance()` 与 `intervene()` 提供人物功德与负业两轴账本、净业干预阶梯透视。
12. **EXV10-3 面板「大事件日程表」日历视图**：
    - `WA.events.timelineView()` 提供直观未来事件时间轴（带周期、优先级与到期判断）。
13. **EXV10-4 面板「异地远方」角色动态雷达**：
    - `WA.elsewhere.card()` 与 `view()` 提供非在场重要 NPC 的所在地、心境及牵绊雷达。
14. **EXV10-5 面板「行商集市」经济看板**：
    - `WA.economy.shelf()` 与 `view()` 展示各城镇物资供需货架与商路通断状态。
15. **EXV10-6 面板「待办与抉择」一键下钻工作台**：
    - `ui/panel.js` 暴露 `WA.ui.showCat(cat)` 程序化切分类口与分类导航 pill，与待办下钻完美联动，带合法性校验与 `bad-cat` 归因见证。
16. **EXV10-7 世界传闻与谣言网络深度交互**：
    - `WA.rumor.mutateAndAmplify()` 模拟市井流言在人际拓扑中转述的变异、信息失真与恐慌指数倍增。
17. **EXV10-8 多势力博弈动态推演**：
    - `WA.factionGraph.simulateDynamics()` 基于同盟簇与敌对张力边，自动推演暗流博弈与消长走向，产出结构化简讯，并在 `ui/panel.js` 绑定「博弈推演」控件（`#wa-fg-dyn`）。
18. **EXV10-9 V10 全景机制端到端验收矩阵**：
    - 落地 `tests/v10-master-matrix.js`，真实无桩串联并判定 18 项机制，实测 **18 / 18 项全部 PASS**。

---

## 3. 验收数据与门禁状态（现场实测）

- `node tests/v10-master-matrix.js`: **18 / 18 PASS**（100% 通过）
- `node tests/v10-inject-pipeline.js`: **7 / 7 PASS**
- `node tests/v10-unified-pending.js`: **PASS**
- `node tests/reject-code-gate.js`: **PASS**（340 产品文件，1349 拒收码，0 未分类，0 缺失）
- `node tests/dead-export-gate.js`: **PASS**（0 新增死导出，证据与元数据同源）
- `node tests/ui-binding-coverage.js`: **100% 覆盖**（1584 / 1584 引用全部登记并受保护，0 missing）
- `node tests/o7-plan-tree-gate-v2187.js`: **69 / 69 PASS**
- 版本号同步：`index.js` 与 `manifest.json` 一致为 `2.296.0`。

---

## Decision

三项裁决：

1. **注入一律走"四件齐做"**：任何新增注入源必须同批完成 ①`SOURCES` 登记 ②`applyInjections` 里的 `vis.X` 分支 ③默认值表项 ④`VIS_NAMES` 显示名。只加分支不加源表 = 开关点了零效果（v2.38.0 的 `echoes` 原样复刻），只加源表不加分支 = 声明了没人消费。该口径由 OPV10-1～6 六路引擎的落地实践固定下来。
2. **关闭开关必须严格执行负控制**：六路引擎在 `DEF.enabled=false` 时 `buildBlock()` 返回空串，加入 `SOURCES` 后仍保证「未开时零注入零污染」，不给老用户凭空多出约束。
3. **预算降档按"先折叠后紧凑"两级**：`plan()` 常规折叠（`reason:'fold'`）优先；余量不足以容纳折叠块时降档为 `compactSummary` 单行摘要（`reason:'compact'`，10~25 tokens）；两者都不足以容纳时如实 `drop` 并记账。不允许静默截断。

---

## Consequences

**正面**：
- 正文注面从此能看见外交条约活跃状态、因果业力预兆、今日到期事件、远方羁绊脉动、地域物资行情、离线期间世界变迁六类世界事实。
- `core/unified-pending.js` 提供单一只读聚合出口，12+ 模块未决事项一屏可知，且零 store 写。
- 多势力博弈从"读不出"变为"能推演"：`factionGraph.simulateDynamics` 基于同盟簇与敌对张力边输出消长简讯，事件页 `#wa-fg-dyn` 可一键触发。
- `WA.ui.showCat` 暴露程序化分类切换，待办下钻与分类导航打通。
- 门禁读数全绿：拒收码 1349 个内联码 0 未分类 0 缺失、死导出 1174 dead / 6 uiDead 零新增、UI 绑定 1584/1584 达 100%、端到端矩阵 18/18。

**代价与风险**：
- 六路引擎的 `buildBlock` 在空世界**仍然全员零产出**（空世界 114 台里只有 4 台有内容，这六路一个都不在）。这说明「接上」与「有内容」是两件事 —— 该缺口被明确交接给 V11 纲领（`plans/V11_MASTER_PLAN.md`）。
- 版本面跟随型白名单在 `v2.296.0` 升版时漏跟（`tests/s3-b1-e3-v2184.js` 等 17 个文件的 `alt`/`arr` 版本面仍停在 295），由 V11 立项轮补齐。
- 拒收码与死面账本每新增一张登记表都要同步，否则就是 V7 复盘过的"新增面不登账"。

---

## Alternatives considered

**A. 直接把 36 台未接源引擎一次性全部接进 `SOURCES`**：被否。其中大量是编辑面（`editorFaction` / `editorEvents`）、内部工具面（`pmem` / `summarizer`）或需要手动录数才会动的悬空引擎（V7 OPV7-8 已定性 35 台）。V10 只挑了六路"世界交互真的改变玩家可见事实"的引擎接入，其余留给 V11 逐台裁决（OPV11-5）。

**B. 用 `inject-budget` 的通用截断处理超预算，不新增 `compact` 降档**：被否。通用截断会让末尾源整块消失且读面无法分辨"被截断"与"本来没内容"。`compactSummary` 的 10~25 tokens 单行摘要保住了"这个源本轮有话说"的可辨识性，代价是几十个 token。

**C. 统一待办中心做成可写面（直接从聚合器处理待办）**：被否。各模块的待办处置语义差异极大（抉择要走 `storyChoice.confirm`、委托要走 `commission.advance`、外交要走 `diplomacy.reply`），聚合器代劳等于在核心写口之上再造一层写口，违背"单一真源"原则。故 `unifiedPending` 只做只读聚合 + 诊断出口，下钻由面板按模块路由（EXV10-6 的 `showCat`）。
