# WorldAxis 迭代日志（自主迭代模式）

> 由 AI 在无人值守模式下维护。每轮记录：做了什么、为什么、影响范围、门禁结果。

## 基线

| 项 | 值 |
|---|---|
| 版本 | v2.26.0 |
| 全量回归 | `node tests/run.js` → 4121 断言全绿 |
| 出口面清册 | `node tests/inventory.js` → 四类悬空均为 0 |
| UI 门禁 | `node tests/ui-gate.js` → 49/0（v2.22.0 未涉及运行时 UI 探针） |
| 出口面契约 | 58 命名空间 / 321 成员 / 4094 字符 |

## 迭代记录

### R1 · 2026-09-20 · 建立迭代日志
- **做了什么**：新建本文件，固化基线指标与迭代节奏。
- **为什么**：无人值守模式需要一个可追溯的变更台账。
- **影响范围**：仅新增文档，不动代码。
- **验证**：无（文档）。

### R2 · 2026-09-20 · v2.21.0 控件可点性（第九面）
- **做了什么**：新增 UI 控件可点性门禁 G18，并修复它命中的两族真缺陷。
  - 侦察排除项（避免重复劳动）：全库 TODO/FIXME/XXX/HACK **零命中**；死导出 208 项（仅测试引用 132）属出口面常态；事件总线矩阵 11 发 / 11 收 / `STATE_EVENTS` 11 项全部有发射，零死信号零死监听器。
  - **真缺陷①异步出口的 DOM 生命周期**：`ui/settings.js` 的 `out = () => $('#wa-set-out')` 每次重查，而「立即生成舆情」是 async 出口，在 `await` 后写 `out().textContent`，其间面板重绘使节点离树 ⇒ TypeError。同型 settings 5 处 + panel 6 处。
  - **真缺陷②宿主能力守卫缺失**：`ui/panel.js` 三处裸 `prompt(...)`（世界钟 / 势力编辑器），无 prompt 宿主下 ReferenceError，且它们是唯一入口。
  - **修法**：settings 新增判空出口 `setOut(text)`；panel 新增 `setOut(sel,text)` / `setHtml(sel,html)` / `askText(msg,dft)` 三助手。
- **为什么**：G17（v2.12.0）只验证「控件**成树**」，不验证「控件被点会不会抛」——自动化从未覆盖这一层，而缺陷恰好落在这里。
- **影响范围**：`ui/settings.js`、`ui/panel.js`（均不新增导出，出口面承诺不变）；新增测试侧 `checkClickable`；`tests/ui-gate.js`、`tests/run.js`、`ui-gate-sync.js`。
- **附带自纠**：
  - `tests/ui-gate.js` 此前**自带一份** `fresh()`/`checkPages()` 副本，与模块头「不复制、不漂移」声明矛盾；收口为从 `ui-gate-sync.js` 单一真源取（256→180 行）。
  - 探针补齐前提：真浏览器 `<input type=file>.files` 恒为 FileList（否则 `files[0]` 的 undefined 会被误记成产品缺陷）。
  - 装置耦合：G18 多次装带面板的 UI 会在共享总线留下 `backstage:settled`/`chat:changed` 订阅，污染后续 G21 判定；G18 收尾以 `fresh({files:[]})` 复位总线。
  - 负向自证两条口径：破坏 A（判空出口退回裸写）→ 异步拒绝现形；破坏 B 必须回退**调用点**（`askText` 内部有 try/catch，回退内部会被吞掉）。
- **验证**：`node tests/run.js` 4058/0；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变（冻结串无需回填）。
### R3 · 2026-09-20 · v2.22.0 展示映射漂移（第十面）
- **做了什么**：新增「UI 映射键集 == 引擎真源键集」源码级门禁，并修复它所在层的一批真漂移（9 组映射中 6 组）。
  - 取证：自建 `tools/scan_drift.js`（零依赖、纯源码比对）逐行列出缺键/幽灵键；肉眼此前只发现 2 处，机器扫出 6 处。
  - **枚举族**：`factionBadge`（自造枚举 vs FACTION_STATUS）、`repColor`（受人敬重 / 幽灵键 小有名气）、`ecoColor`（萧条/危机 vs 衰退/动荡）——引擎真值大范围落空、回退默认色。
  - **标签族**：`renderDirector` 可见性标签缺 pulse/ledger/digest（裸露英文键名）；`WS_LABEL` 缺 verify 桶。
  - **跨域错放**：`LAB_P`（store 读侧）误放 8 个 settings-bus 读标签、缺 readSpotCheck；`rdSrcTxt`（settings 读侧）只写 4 键、真实 12 键。
  - **引擎↔引擎重复真源**：`editor-faction.STATUSES/RELATIONS` vs `evolution.FACTION_STATUS/FACTION_RELATION`（纳入判据）。
  - **诊断包消费端重复真源**：`tool-diag.WRITE_SRC_LABEL` 缺 verify、删侧内联表缺 verifyBack、settings 读侧内联表只写 4 键（真实 12），与 UI 同型漂移、同轮修复（纳入判据）。
- **为什么**：G17/G18 只在运行期验证「控件成树/可点」，UI 展示映射与引擎枚举各写一份（第二份真源）导致的**静默回退**在运行期不抛不报、全绿也照不出——正是本版实测 6 组漂移却零报警的根因。
- **影响范围**：`ui/panel.js`（六处映射，不新增导出）；`tests/ui-gate-sync.js`（新增 `checkSrcMaps`）、`tests/run.js`（新增 v2.22.0 块 + 头部引用）；`tools/scan_drift.js`（新增诊断脚本）。出口面承诺不变。
- **附带自纠**：`ITERATION_LOG.md` 此前 `### R2` 被重复写入两份，本轮去重。扫描器口径两处修正：`reportReadFail` 正则漏 `reportHostReadFail`；settings 读标签为动态建桶，真源须取「声明 ∪ 调用点」，否则误判。
- **验证**：`node tests/run.js` 4084/0（+26，门禁 14 组：UI↔引擎 9 组 + 引擎↔引擎 2 组 + 诊断包 3 组，五重负向自证）；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R4 · 2026-09-20 · v2.22.0(b) 门禁扩围至诊断包消费端（10→11→14 组）
- **做了什么**：在 R3 提交后继续按「同类缺陷还有没有别处」追查消费端，把门禁判据由 9 组连续扩至 14 组，并修复新发现的三处同型漂移。
  - **引擎↔引擎**（第一次扩围，11 组）：`editor-faction.STATUSES/RELATIONS` 是 `evolution.FACTION_STATUS/FACTION_RELATION` 的独立副本，当前同值但无门禁保护；一旦脱钩，编辑器写入的势力状态会被引擎按非法值静默回退。
  - **诊断脚本收口**：`tools/scan_drift.js` 最初自带一份组定义，取证完成后它自己变成了「第二份真源」（门禁 14 组时它仍停在 11 组）——重写为**纯委托** `checkSrcMaps` 的薄壳，判据唯一真源归于门禁，二者不可能再漂移。
  - **诊断包**（第二次扩围，14 组）：`engines/tool-diag.js` 内另有 3 张同类标签表——`WRITE_SRC_LABEL` 缺 `verify`、删侧内联表缺 `verifyBack`、settings 读侧内联表只有 4 键（`read/parse/migrate/copy`）而真实动态标签 12 个。三处均按同文件既有中文措辞补齐。
- **为什么**：第十面门禁的真正价值是**把「第二份真源」这一缺陷形态收口**。若只覆盖 `ui/panel.js` 一个消费端，就等于「漂移面只收了一半」——诊断包同样把引擎桶抄了一份，读者从诊断面板看到的裸英文键名与 UI 面板是同一个 bug 的两种显影。（契约排序：这属「缺陷面未收口」，优先于任何小优化。）
- **影响范围**：`engines/editor-faction.js`（不改名字与结构，仅纳入判据）；`engines/tool-diag.js`（三张私有标签表补键，不触出口面成员）；`tests/ui-gate-sync.js`（`checkSrcMaps` 增 5 组、`SM_FILES` 加 2 文件）；`tests/run.js`（追加第 ④⑤ 重负向自证）；`tests/inventory.js`。
- **附带自纠**：① `tests/inventory.js` 的 `productFiles()` 只排除 `tests`，把新增诊断脚本 `tools/*.js` 误报为「未登记模块 2」——改为 `SKIP_DIRS = ['tests','tools']`（诊断脚本零依赖、不导出命名空间）。② `checkSrcMaps` 内新增断言引用了原先内联的 `WB`/`RB`/`sbTags`，直接 `ReferenceError`，改为 `const` 声明。③ 门禁锚点 `toolDiag.readLabel` 原含 ` }[k]` 尾部结构，补丁插入新键后该串不复存在 ⇒ `_wdObjAt` 抛「anchor not found」，锚点收窄为键值对前缀。④ 清理临时脚本，`tools/` 仅留 `scan_drift.js`。
- **验证**：`node tests/run.js` 4084/0（+5，门禁 14 组）；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0（产品文件 65）；出口面 58/321/4094 不变。

### R5 · 2026-09-20 · v2.22.0(c) 门禁扩围至事件阶段序列（14→20 组）
- **做了什么**：沿「同一枚举还有没有别处」继续全库扫描，把「事件阶段序列」四份副本纳入判据并全部对齐。
  - 全库 grep `已消散'` 命中 4 处有序阶段序列：`editor-events.TYPE_STAGES`（de-facto 真源，`stagesOf` 是公共访问器）、`evolution.STAGE_MAP`、`backstage.js:541` 紧急兜底、`inspector-state.js:33` 无 `editorEvents` 兜底。四份当前同值、此前无门禁保护。
  - 新增 6 组判据：`backstage.fallback.{progress,conflict}` + `evolution.STAGE_MAP.{conflict,progress}` + `inspectorState.fallback.{progress,conflict}`，真源取 `editor-events.TYPE_STAGES` 的有序数组（逐元素序比对，非集合比对——阶段推进依赖顺序）。
- **为什么**：兜底/副本一旦与规范阶段集脱钩，同一条事件会被兜底路径写成规范集之外的 stage——它不在任何枚举里，`isTerminal`/推进逻辑全都认不出（写进去读出来不一样，还不报错）；这正是本版要收口的那一类「静默失效」。
- **不纳入项（并记录理由）**：`TERMINAL` 各文件语义分歧——`evolution.TERMINAL` 视「已爆发」为终态、`editorEvents.TERMINAL` 只认「已消散」、`ledger.TERMINAL_STAGES` 取两者并集。这是**设计分歧**（三处各有依据），不是复制漂移，硬拉齐反而会改语义，故只收「有序阶段序列」。
- **影响范围**：`tests/ui-gate-sync.js`（`checkSrcMaps` 增 6 组、`SM_FILES` 至 10 文件）；`tests/run.js`（第 ⑥ 重负向自证改指 `evolution.STAGE_MAP`）；`tools/scan_drift.js`（薄壳已同步）；README/ITERATION_LOG。
- **附带自纠**：`tools/scan_drift.js` 自带组定义曾是门禁的第二份真源（门禁 14 组时它停在 11 组），重写为纯委托 `checkSrcMaps` 的薄壳——扫的就是门禁扫的东西，二者不可能再漂移。
- **验证**：`node tests/run.js` 4092/0（+8，门禁 20 组）；`node tools/scan_drift.js` → 漂移组数 0 / 20；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R6 · 2026-09-20 · v2.23.0 动态桶「硬编码子集」（第十一面）
- **做了什么**：把「第二份真源」线索下沉一层，治**动态桶被写成固定子集**这一类。
  - **现场一（结论不实）**：`core/store.js` 的 `readFailedDetail`/`readFailedCumulative` 硬编码 3 键（bytes/activity/enumerate），而 `__readStat.bySource` 是动态建桶（`noteStoreReadFail`/`reportReadFail` 任意来源）。本会话新增的 12+ 来源在明细里无键 ⇒ 消费点 `readFailedCumulative.recovery || 1` 恒得 undefined ⇒ 诊断永远报「本会话累计 1 次」。修为全来源枚举（`Object.keys`），差值基线 `__byBefore` 同步改全来源快照。
  - **现场二（跨域错放）**：`core/store.js` 的读侧标签表 `LAB`（标注 readFailedDetail）保留 8 个 settings-bus 域幽灵键、漏 `readSpotCheck`——与 v2.22.0 修的 `ui/panel.js:LAB_P` 同源。修为 store 域真实 21 来源。
- **为什么**：这类形态运行期**不抛不报**，且比「键名对不上」更隐蔽——表本身「看着是全的」，只是被写成固定子集；消费端读它得到 undefined 后多数有 `|| 默认值` 兜底，于是**兜底值伪装成真实值**（1 次 / 0 次），用户永远看不到真相。
- **影响范围**：`core/store.js`（两处明细 + LAB）；`tests/ui-gate-sync.js`（`checkSrcMaps` 增 store.LAB 组，21 组）；`tests/run.js`（v2.23.0 块 + 第 ⑦ 重负向自证）；版本三源 + run.js 7 处字面量；README/ITERATION_LOG。
- **附带自纠**：`tests/run.js` 版本断言描述文案里残留「入口版本为 2.21.0」（历史笔误，5 处）随本版一并更正为 2.23.0。
- **验证**：`node tests/run.js` 4099/0（+7）；`node tools/scan_drift.js` → 漂移组数 0 / 21；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。
- **（偶发观察）** 首次跑出现 1 例时间相关偶发失败「风声长期沉寂后消散」，两次复跑均 4092/0——与 store 改动无关，记录待观察。

### R7 · 2026-09-20 · v2.24.0 三面记账「未知来源」策略不一致（第十二面）
- **做了什么**：把「动态桶」线索再沉一层——桶的动态性之外，治**往桶里放东西的策略**在写侧的不一致。
  - **现场**：`core/settings-bus.js` 的 `noteFail`（写侧归类记账）用白名单判定 `writeFailedBy[t] !== undefined`，未知 tag 静默塞进兜底桶 `setItem`。新写路径漏登记桶 ⇒ 失败被**误归因成「写盘被拒」**，用户被引去查配额/隐私模式。
  - **对照（同族证据）**：`noteRemoveFail`（删侧，v2.9.0）与 `noteReadFail`（读侧，v2.10.0）对未知来源**早已动态建桶**；写侧是唯一不一致、也是唯一会误导归因的一面。
  - **修为**：`noteFail` 改「有则自增、无则建桶」+ 桶名归一 `settingsBus.write → settings`（与删侧 `settingsBus.remove → settings` 对称）。
- **为什么**：这是「第二份真源 / 动态桶」线索的同族第四形态——**归因错误比归因缺失更坏**：缺失会让用户看到「无归因」，错误会让用户去修一个不存在的问题。三面记账既然自称「单一实现」，对未知来源的策略就必须一致。
- **影响范围**：`core/settings-bus.js`（noteFail 一处）；`tests/run.js`（v2.24.0 块 + 第 ⑧ 重负向自证）；版本三源 + run.js 7 处字面量；README/ITERATION_LOG。
- **附带自纠**：本轮扫描器两次口径修正——按「调用点字面量」判可达性会误判 `rawRevive`/`stamp`/`legacy`/`quarantine`/`writeback` 等经 `lsWrite(from)` 参数传入的桶为「幽灵键」；正确口径是「**经出口参数可达的键集**」，`writeFailedBy` 9 键实际全部可达（非幽灵），真正的缺陷是策略不一致。
- **验证**：`node tests/run.js` 4106/0（+7）；`node tools/scan_drift.js` → 漂移组数 0 / 21；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R8 · 2026-09-20 · v2.25.0 动态桶的分类口径不完备（第十三面）
- **做了什么**：把「动态桶」线索最后一层收口——桶动态、建桶动态，治**分类口径**仍硬编码子集。
  - **现场**：`core/settings-bus.js` 的 `readStat` 分类 `hardFail = read+parse` / `degraded = migrate+copy`（固定 2+2）。`by` 是 readFailedBy 动态桶，本会话新增的 8 个核查读回来源（verifyBack/rmExisted/legacyRead/saveInherit/subkeyAudit/pendingOrphan/verifyDefaults/lsRaw）落两口径之外 ⇒ `readFailed` 涨而 `ok` 仍报 true，且 `hardFailed+degraded===readFailed` 完备性被静默破坏。
  - **修为**：分类遍历动态桶，「已知降级白名单（migrate/copy）+ 其余全部计硬失败（保守）」，单列 `unclassified` 保留落桶外来源归因。
- **为什么**：这是 v2.23.0「硬编码子集」的同族第五形态，也是最深的一层——**结论不实**：`ok:true` 会被消费端读成「存储读取一切正常」，而实际有来源失败了。同族前四形态（明细表硬编码 3 键 / 未知来源白名单兜底 / settings-bus 幽灵键）都已被 v2.22.0~v2.24.0 逐一收口。
- **影响范围**：`core/settings-bus.js`（readStat 分类一处）；`tests/run.js`（v2.25.0 块 + 第 ⑨ 重负向自证）；版本三源 + run.js 7 处字面量；README/ITERATION_LOG。
- **附带自纠**：既有关键断言「硬失败 + 降级 = 读失败总数（分类完备，无落桶外）」的完备性正是本版修好的性质；修后该断言在任意来源下成立（此前只在 read/parse/migrate/copy 四来源下成立）。
- **验证**：`node tests/run.js` 4113/0（+7）；`node tools/scan_drift.js` → 漂移组数 0 / 21；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R9 · 2026-09-20 · v2.26.0 诊断包 store 读侧标签表跨域错放（第十四面）
- **做了什么**：把「第二份真源」线索收口到诊断包消费端，并修掉门禁自身的静默盲点。
  - **现场**：`engines/tool-diag.js` 的 `SRC_LABEL`（诊断包渲染 store 读失败明细）是 store 读侧标签的**第三份真源**。它漏了 store 域自己的 `readSpotCheck`（⇒ 诊断包退回裸桶名），又混入 8 个 **settings-bus 域**键（rmExisted/verifyBack/legacyRead/saveInherit/subkeyAudit/pendingOrphan/verifyDefaults/lsRaw——归 `toolDiag.readLabel` 管，在本表永不被消费）。28 键 vs 真源 21 键。
  - **修为**：`SRC_LABEL` 对齐 store 域 21 来源（补 `readSpotCheck`、清 8 幽灵键）。
  - **门禁**：`tests/ui-gate-sync.js` 增第 21 组判据 `toolDiag.SRC_LABEL`（与 `LAB_P`/`store.LAB` 同真源）；`tests/run.js` 增 v2.26.0 块（正向两条 + 双负向自证）。
- **为什么**：v2.22.0 治了 `ui/panel.js` 的 `LAB_P`、v2.23.0 治了 `core/store.js` 的 `LAB`，**这第三处现场此前无任何门禁**——「同一份真源的三个消费端，只保护两个」意味着第三端可以静默腐烂。诊断包是用户排查故障时读的东西，桶名对不上等于归因不可读。
- **影响范围**：`engines/tool-diag.js`（SRC_LABEL 一处 + 两段注释对齐）；`tests/ui-gate-sync.js`（新增 1 组 + 取键器修盲点）；`tests/run.js`（v2.26.0 块 + 7 处版本字面量）；`index.js`/`manifest.json` 版本；README/ITERATION_LOG。
- **附带自纠（两处，均属「判据自身要诚实」）**：
  - ① **门禁静默盲点**：取键器 `_wdKeysOf` 的朴素正则要求键紧跟 `,`/`{`，而 `readSpotCheck` 前夹着整段注释 ⇒ 键**从键集消失**，既不报缺键也不报幽灵键。修法：取键前先剥注释（方向安全：只能让隐藏键重新可见）。
  - ② **判据越界**：新测试块的幽灵键判据首版裸配全文件，把 `toolDiag.readLabel`（合法）里同名键误判成「本表残留」——已收窄到只在本表字面量内判。
- **验证**：`node tests/run.js` 4121/0（+8）；`node tools/scan_drift.js` → 漂移组数 0 / 22；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。
