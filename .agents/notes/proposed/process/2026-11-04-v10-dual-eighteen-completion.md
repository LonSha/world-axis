# Agent Note: WorldAxis V10 全景双九项演进纲领（18/18机制）闭环落地决策与交付记录

**日期**：2026-11-04  
**分支/基线**：`master` (`v2.296.0`)  
**相关任务**：V10 全景双九项演进纲领（OPV10-1～9 + EXV10-1～9）

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
