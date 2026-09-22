# WorldAxis 迭代日志（自主迭代模式）

> 由 AI 在无人值守模式下维护。每轮记录：做了什么、为什么、影响范围、门禁结果。

## 基线

| 项 | 值 |
|---|---|
| 版本 | v2.27.0 |
| 全量回归 | `node tests/run.js` → 4149 断言全绿 |
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

### R10 · 2026-09-20 · v2.27.0 死子面冻结账本 + 门禁（第十五面）
- **做了什么**：把 `tests/inventory.js` 重构成可复用单源，新建死子面冻结账本与门禁并接进主回归门。
  - **现场（缺口）**：出口面契约钉「整个 interface 面」的增删，**不区分成员有无消费方**——新增死导出回填冻结串即可静默通过；`dead` 子面 208 项（仅测试引用 132）此前既无账本也无门禁。
  - **重构**：`inventory.js` 抽出 `function collect()`（含复用保护）+ `module.exports = { collect, MODULE_EXPORTS }`；尾部 `if (require.main === module)` 保留 CLI 与人类可读打印。门禁直接 require 它，杜绝第二份「表面求差」实现。
  - **新建**：`tests/dead-export-ledger.json`（dead 208 / uiDead 4 逐条 reason + detail，归类 test-only / self-only / unwired，advisory 只记 dataOnly 计数）；`tests/dead-export-gate.js`（判四态：新增=红 / 归因腐坏=红 / 消失=提示 / 账本缺失=红；支持 `--update`、`--json`）。
  - **测试锁**：`tests/run.js` 新增 v2.27.0 节（A 口径单源、B 复用判据、C 现场锚点、D 账本健全、E 判定四态、F 归因语义、G 负向自证）。
- **为什么**：本轮主线仍是「门禁/清册自身的诚实度」。判据的输入面与结论面必须是同一件事——所以清册必须单源、复用判据必须真能区分「已装载」。
- **影响范围**：`tests/inventory.js`（重构 + 两处判据修正）、新增 `tests/dead-export-gate.js` 与 `tests/dead-export-ledger.json`、`tests/run.js`（+1 节、版本 7 处）、`index.js`、`manifest.json`、`README.md`、本日志。产品代码零改动（出口面不变）。
- **附带自纠（新版自身两处不确定性，均为真实踩到）**：
  - ① 复用判据 `!!global.WorldAxis` **恒真**（`tests/mock.js` 预置宿主壳）⇒ CLI 首跑跳过装载，定义面塌成命名空间 0 项、1223 处真引用反被判为 1209 处悬空、退出码 1。修为「LOAD 里的模块命名空间是否已有实例」。
  - ② UI 层装载写在 `if (!ALREADY)` 内 ⇒ 复用路径（门禁在 run.js 进程内取值）少 3 命名空间、uiPhantom 14 ↔ uiDead 0 互换，与 CLI 的 64/0/4 不一致——**定义面随调用时机漂移＝判据不确定**。改为幂等确保装载。
  - ③ 清册 CLI 的 `process.exit()` 在**输出大且 stdout 是管道**时截断尚未刷出的 stdout：破坏态 `--json` 有 137,750 字符，管道消费者拿到的是断在半个对象上的 JSON（exit 1 + 垃圾），手动重定向到文件则完整——即「结论体只在重定向时完整」。改为 `process.exitCode`（只设码不强制退出，Node 在 stdout 排空后以该码结束）。这是本版第三次踩到「探测器自身的输出不可信」，与 ①② 同型。
  - ④ 首次重构还漏收口 `if (!ALREADY)` 的闭合花括号（`node --check` 报 Unexpected end of input，花括号 61/59）——已补齐并使两条路径逐项一致。
- **验证**：重构前后 `--json` 逐项一致（命名空间 64 / 成员 665 / 引用 1223 / dead 208 · uiDead 4 · dataOnly 101 / deadInTestsOnly 132）；CLI 与复用路径一致；负控制两向（真新增死导出被点名拦截、归因腐坏被报不可读、撤销复原）；`node tests/run.js` → **4149/0**（+28）；`node tests/dead-export-gate.js` 绿灯；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R11 · 2026-09-20 · v2.28.0 账本元数据与归因证据强度（第十六面）
- **做了什么**：把 v2.27.0 的冻结账本从「归因可读」推到「归因可证伪」——账本自己被查。
  - **现场（两处铁证，均为实测）**：① `tests/dead-export-ledger.json` 的 `version` 字段 = `"2.26.0"`、`_note` 内的版本词 = `v2.27.0`、入口 `index.js` 的 `const VERSION` = `'2.27.0'`——**同一份凭证里两个版本，且都不等于它自称记录的那一版**；该字段此前无任何门禁（凭证自称哪一版没人核，整份凭证的可信度就只剩自称）。② `Object.keys(l.dead).filter(k => l.dead[k].src).length` = `0/208`——**208 条归因零条带证据**，「凭什么是 `self-only` 而不是 `unwired`」在账本里没有答案，核对者只能相信写账本的那一次测量。
  - **门禁重写**（`tests/dead-export-gate.js`，369 行，保留旧三纪律 + 新增三条）：第四条**元数据三级同源**（`metadataProblems(ledger, entryVersion)` 报 `field-vs-entry` / `note-absent` / `note-vs-entry` / `field-vs-note`；`versionNotes(text)` 只认 `/v\d+(?:\.\d+)*/g`，规则里写「v0.1.x 遗留」不会被误读成本版自称）；第五条**归因带证且证据须与判据同宽**（`EVIDENCE_KEYS = ['src','refs','tref','own']`；`evidenceDrift(result, ledger)` 三层校验：字段缺失 → 「归因不得无证」、字段复算不符 → 「证据失实」、**归因由 `(tref, own)` 唯一反推不符** → 「归因与证据不符」；另加 `refs !== 0` → 「冻结项的产品引用数应为 0——它已不是死导出」）；第六条**未识别归因拒绝写入**（`build()` 遇 `REASON_CODES.indexOf(code) < 0` 直接 `throw`，fail-closed，不再落占位）。辅助单源：`stripNonCode(src)` 状态机（剥注释/字符串，供 `refCountIn` 与 `ownRefCount` 共用）、`referenceCounts(rec)` 只在定义文件**之外**的产品文件计 refs、`testRefCount(rec)` 只读 `tests/run.js`、`ownRefCount(rec)` 剥注释/字符串计定义文件内自用。`refresh()` 改为**不再保留旧 `reason`**（只保留人工润色的 `detail`）：reserved 的语义是「理由文本可人工润色」，不是「归因可脱离测量」。
  - **单源加固**：`tests/inventory.js` 把 `productFiles()` / `const PROD` / `const REF_RE` 从 `collect()` 内部提到模块顶层，`module.exports` 追加 `PRODUCT_FILES: PROD, REF_RE: REF_RE`；`collect()` 改为只消费。门禁复算证据必须复用清册的**同一份扫描面与正则**，否则会出现「证据说 `refs > 0`、判据说该成员是死导出」的自相矛盾。
  - **测试锁**：`tests/run.js` 新增 v2.28.0 块（A–H 八组）——A 结构锁、B 元数据三级同源、C 元数据负控制三形态、D 证据强度（212 条带证 / 分布 / 零失实）、E 证据负控制四类、F 判据不越界（冻结面与现场锚点不变、旧四盏灯一盏不少、单源导出在场）、G 类别证明、H 负向自证（真源码破坏元数据闸，锚点恰 1 处，**只 `require` 不跑 CLI**，`finally` 内 `unlinkSync` + 清 `require.cache`）。
- **为什么**：本轮主线仍是「门禁/清册自身的诚实度」，但推进一层。v2.27.0 只保证 `reason` 在词表内、不留 TODO——那是**可读**：看得懂，不保证是真的、可核对的。账本是一份需人工按版本号去找、去比对的审计凭证；凭证自称哪个版本却与实际不符，它的证据又不带出处，**整份凭证的可信度就只是自称**。所以本轮把「可读」推到「可证伪」：元数据须三级同源，归因须带证、须可复算、须由证据**唯一反推**。
- **影响范围**：`tests/dead-export-gate.js`（重写，369 行）；`tests/inventory.js`（单源导出）；`tests/dead-export-ledger.json`（重建：212 条全带 `src/refs/tref/own`，`version` 与 `_note` 齐到 v2.28.0）；`tests/run.js`（+1 节、版本 7 处字面量、旧负控制对齐）；`index.js` / `manifest.json` 版本；`README.md`、本日志。产品代码零改动（出口面不变）。
- **附带自纠（三处，均为真实踩到）**：
  - ① **同轮自纠（本版最有意味的一处）**：`build()` 首版落账**漏写 `own` 键**——输出「证据已复核写入 212 条（src/refs/tref）」却在判定时让 196 项报「证据字段缺失」。写路径与判据不同宽，正是本版要治的「账本自己说的和实际执行的不是一回事」，**被自己的新灯当场抓到**。修法：条目对象补 `own: ev.own`。
  - ② **旧灯与新纪律冲突（判据对齐）**：v2.27.0 的负控制「登记条目消失 ⇒ 只提示、不红灯」插入的是 `{ reason, detail }` **无证占位条目**——而那是 `build()` **永不产出**的非法状态（它只写带证条目）。即在造一个工具不可能造出的输入去测工具。修法不是削弱新灯，而是**把该灯升级为合法输入**（带证的消失条目，gone 本身仍只提示），并**补一盏更锋利的灯**：账本留无证记录（哪怕该条目已消失）⇒ 红灯——凭证里的条目要么带证、要么不该留在文件里。这是「判据必须对齐工具真实输出面」的又一例。
  - ③ 环境与操作：`node --check` 首次报 `ReferenceError: PROD is not defined`（`module.exports` 引用了尚在 `collect()` 内的 `PROD`），提到顶层后双 OK；heredoc 写探针脚本再次被 JSON 转义吞掉 `function strip(src) {` 与正则字面量行，已按纪律改回 `create_file` 落盘（先 `rm -f` 再建，规避「已存在文件需先删除」）；`ast.parse` 误用于 JS 文件报 `SyntaxError: invalid character '：'`（Python 检查不适用 JS，JS 一律 `node --check`）。
- **验证**：`node tests/run.js` → **4189/0**（v2.28.0 块 +40 断言）；`node tests/dead-export-gate.js` 输出「冻结面规模 dead 208 · uiDead 4」「dataOnly 101 → 101」「✓ 死子面无新增、归因可读、元数据同源、证据可复算」exit 0；`node tests/inventory.js` 四类悬空 0；`node tests/ui-gate.js` 49/0；`node tools/scan_drift.js` 漂移 0/22；`node tests/export-contract.js` 58 命名空间 / 321 成员 / 4094 字符不变。独立**真相探针**（另写、不复用门禁实现）逐条复算：`src` 文件存在且与 `MODULE_EXPORTS` 反查一致、`refs===0`、`reason === f(tref, own)`——**212 条失实 0 项**；归因分布 `test-only 136 / self-only 72 / unwired 4`；现场锚点 `refs 1223 / 命名空间 64 / 成员 665 / dead 208 / uiDead 4 / dataOnly 101 / deadInTestsOnly 132` 与 v2.27.0 逐项一致（**本版不扩面、不改口径**）。
### R12 · 2026-09-20 · v2.29.0 引用面的输入面必须是真代码面（第十七面：提及不是引用）
- **做了什么**：把「单源」从口径层推到**输入面**——引用计数不再扫原文，只扫真代码面。
  - **现场（两处铁证，均为实测）**：① **掏空型**——在任一产品文件末尾加**一行纯注释**（零代码改动）⇒ 冻结面 `208 → 207`，该成员脱出死子面，门禁输出「⚠ 已登记的死导出消失 1 项」+「✓」并 **exit 0 绿灯**，还催人跑 `--update`；照办就把该条目从账本**永久删除**。新增死导出会红灯，**掏空只提示**——比 v2.27.0 治的「新增无人提示」更隐蔽。② **计数失实型**——门禁自写的 `stripNonCode` 只认注释与字符串、**不认正则字面量**：字符类正则（如 `/[&<>"]/g`）里的引号让状态机进字符串态，而单双引号串在旧实现里**不因换行终止** ⇒ **跨行失步**，其后整段真代码被剥成空格。实测（旧实现 vs 新实现逐文件全库对照）**丢失真代码引用 97 处**：`ui/panel.js` 153→211（少算 58）、`ui/settings.js` 1→39（少算 38）、`engines/tool-snapshot.js` 12→13（少算 1）。
  - **修法（单源）**：`tests/inventory.js` 新增并导出 `codeFace(src)`——单遍状态机（状态 `code/line/block/sq/dq/tpl`），**长度与行数守恒**（原位空格替换，行号仍可与原文对照）。规则写进模块头：行尾注释不计引用、字符串字面量里的成员提及不计引用、模板字符串 `${}` 内表达式**算**真代码（brace 计数配对）；`/` 是正则还是除法看**前一个非空白代码字符**（`),=:[!&|?{};+-*%<>~^/` 之后为正则）。清册的产品面与**测试侧**（`tests/run.js`）都改走 `codeFace`。
  - **旧实现整体删除**：`tests/dead-export-gate.js` 的 `stripNonCode` 定义与 2 个调用点全部移除，`countRefs` / `refCountIn` 改走 `inventory.codeFace`；`module.exports` 不再含 `stripNonCode`。判据与清册**只能有一个口径**——否则会出现「清册说 refs>0、判据说它是死导出」的自相矛盾。
  - **口径升级差量可枚举**：`refs 1223 → 1202`（−21，剥掉的是纯提及）、`dead 208 → 211`（+3：`rand.seed` / `clock.freeze` / `bridge.setSettings`——此前只被**注释或字符串提到**、产品代码零真引用的成员）、`deadInTestsOnly 132 → 133`、账本条目 `212 → 215`、归因分布 `test-only 136→137 / self-only 72→73 / unwired 4→5`；`uiDead 4 / dataOnly 101 / 命名空间 64 / 成员 665`**不变**（本版不扩面、不改口径，`EVIDENCE_KEYS` 仍为 `['src','refs','tref','own']`）。
  - **测试锁**：`tests/run.js` 新增 v2.29.0 块（A 结构锁 / B 守恒性与保真性 / C 加注释不得改变冻结面 / D 端到端真源码注入 / E 异常隔离 / F 口径升级差量可枚举 + 旧灯一盏不少 / G 负向自证）。
- **为什么**：判据的**输入面**与结论面必须是同一件事。v2.28.0 立了「清册与门禁共用同一份扫描面与正则」，但那只是**面与正则**单源——**剥离器仍是第二份实现**，而它坏得恰好是「把真代码当文本扔掉」。一条判据若吃错输入，它的结论再自洽也没用：门禁说 `refs=0`，而那行代码真在跑。
- **影响范围**：`tests/inventory.js`（新增 `codeFace` + 导出 + 产品面/测试侧改口径）；`tests/dead-export-gate.js`（删 `stripNonCode`、改 2 个计数函数、导出面收口）；`tests/dead-export-ledger.json`（重建 215 条）；`tests/run.js`（+1 节 218 行、版本字面量 8 处、v2.27.0 块 9 处锚点、v2.28.0 块 12 处锚点同步到真代码口径）；`index.js` / `manifest.json` 版本；`README.md`、本日志。产品代码零改动（出口面不变）。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **负控制锚点必须与所测形态匹配**：G 组首版用「破坏正则识别」锚点搭配的样本实测仍保留后续代码（`lost b false / lost c false`）——锚点拆错了地方。改为分别拆**两条识别规则**（引号串换行终止 / 正则字面量识别）配**两个不同样本**，各自可复现「跨行失步」与「正则被当除法」。
  - ② **不要在回归进程运行时改工作区**：本轮在 `node tests/run.js` 后台运行期间向 `core/store.js` 追加注释做验证，导致回归进程被中止（且 `cp` 还原因同一命令链被中断而未执行，工作区留下 `M core/store.js`）。已即时 `cp` 还原并 `md5sum` 逐字节校验。**破坏性验证一律在副本目录做**（本轮改用 `tar cf - | tar xf -` 建 `/tmp/wa_probe/newv` 副本，避开本机 `cp -r` 偶发 ROOT 不可用）。
  - ③ 环境：本机不支持 `timeout` 命令（报 `Function not implemented`），长任务改用 `nohup ... > file 2>&1 &` + 事后读文件；终端偶发 `Current ROOT unavailable` 报错，重试即可。
- **验证**：`node tests/run.js` → 全绿（见下）；`node tests/dead-export-gate.js` 绿灯（「冻结面规模 dead 211 · uiDead 4 · 归因分布 test-only 133 / 其余 78」+「✓ 死子面无新增、归因可读、元数据同源、证据可复算」exit 0）；`node tests/inventory.js` 四类悬空 0；`node tests/ui-gate.js` 49/0；`node tools/scan_drift.js` 漂移 0/22；`node tests/export-contract.js` 58 命名空间 / 321 成员 / 4094 字符不变。
- **双向对照实验（本版最硬的证据）**：把 v2.28.0 干净副本（`git archive HEAD` 导出）与新工作区并排跑同一破坏：**旧实现**加一行注释 ⇒ `dead 208 → 207` + 「⚠ 已登记的死导出消失 1 项」+ `✓` + **exit 0**；**新实现**同一注释 ⇒ `dead 211` 不变、无警告、「✓」exit 0（掏空型当场消失）。逐文件全库对照旧/新引用计数：65 文件中 3 个有差，合计少算 97 处。

### R13 · 2026-09-21 · v2.30.0 收尾（镜像回落守卫收窄 + 冻结锚点对齐 + undo 断言修复 + 扫描面判据精确化）
- **做了什么**：v2.30.0 主版本交付后遗留的四处收尾，全部在回归 `node tests/run.js` 全绿前定位并修复。
  - **P0-1 镜像回落守卫收窄**：`core/store.js` 的 `loadFromMirror(chatId)` 原在本地键为空（miss）时无条件把 `chat_metadata.worldaxis.live.data.state` 持久镜像写回 localStorage，与既有「拒绝恢复未凭空创建 state 键」契约冲突——一旦同聊天 `LS.clear()` + `init()`，镜像会凭空重建 `worldaxis_state_*` 键。修法：函数体开头加 `if (!branchParentId()) return null;`（仅分支才自动回落；同聊天空键一律不写回），模块头「保守五条」扩为第六条「自动回落仅分支」。跨设备安装走 chatcache.installPack，用户主动补救走 rescueFromMirror（仍无视是否分支显式写回，是唯一的自动写盘入口）。
  - **冻结锚点对齐**：清册现场实测 `refs 1238 / 命名空间 65 / 成员 676 / dead 211 / uiDead 4 / dataOnly 101 / 仅测试 133`（v2.30.0 新增 core/undo.js 命名空间 + 成员 + 旁路写点所致），而 run.js 三处冻结断言（r2700/r2800/r2900）仍写旧值 1202/64/665。全部对齐到 1238/65/676；`INVENTORY_G` 冻结 `core/store.js` 的 localStorage 旁路写点计数 7→8（loadFromMirror 新增一处 writeVerified 落盘点）。
  - **undo 断言修复**：v2300 B 块（撤销栈联动）首版断言写 `WA.store.read('v2300probe').a === 1`，但 store.patch 自动钩子用固定标签「参数编辑」触发 `core/undo.js` 的「同标签合并」（硬纪律②，连续同类编辑只记最早 before）——新键的第一次编辑 before=undefined 入栈、第二次同标签合并掉，undo 写回 undefined 删键，断言对 undefined 取 .a 抛 TypeError。裁决：实现正确（合并是文档化的硬纪律，继承参考仓 ref_sw2），断言笔误。修为断言 `read() === undefined`（新键编辑序列退到键不存在）+ 新增 `merged+1` 计数断言。
  - **扫描面判据精确化**：v2300 D 块「产品代码零 Node 内建引用」判据首版 `\bglobal\b|\bfs\b\.` 误杀两类：① `(typeof window!=='undefined')?window:global` 浏览器兜底惯用法（6 处，浏览器运行时永不落到 global，不是 Node 依赖）；② 局部变量 `fs`（factions/facts 简写，`fs.map`/`fs.length` 是数组方法，与 Node fs 模块无关——之前被 global 的 6 个误报掩盖，slice(0,6) 截断只显示了 global 那批）。修法：判据改为只抓「真 Node 运行时依赖」——`require(`（模块引入根，覆盖 Node fs 等必经处）、`__dirname`/`__filename`（Node 特有全局）、`(?<![.\w])process\.\w` / `(?<![.\w])Buffer[.(]`（lookbehind 排除 window./WA. 宿主前缀）、`(?<![\w.])global\s*[.\[]`（排除宿主前缀、typeof 兜底、数据词）；**删掉** `\bfs\b\.`（局部变量误杀，真 Node fs 必经 require 已被覆盖）。
- **为什么**：v2.30.0 主版本把「镜像回落 + 撤销栈 + 引用收口」三件事一次落地，但交付时回归在 v2.30.0 段崩溃（undo 断言 TypeError）+ 扫描面判据误报 2 条。收尾的目标是让全量回归真正全绿，并让扫描面判据「零误杀/零漏报」（判据必须能区分「真 Node 依赖」与「局部变量/宿主形态/数据词」，否则它自己就是第二份不可信的实现——与 v2.29.0 治「剥离器把真代码当文本」同一性质）。
- **影响范围**：`core/store.js`（loadFromMirror 守卫 + 口径注释第六条，不新增导出）；`tests/run.js`（冻结锚点 3 处对齐、INVENTORY_G 7→8、v2300 B 块 undo 断言修复 + merged 计数、v2300 D 块扫描面判据精确化）；`README.md`（P0-1 措辞补「自动回落仅当 main_chat 非空；同聊天空键不写回」）。产品代码零新增导出（出口面不变）。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **判据收窄不能变成「放宽」**：扫描面判据第一版把 `\bglobal\b` 收窄为 `global\s*[.\[]` 时漏了前缀边界，把 `window.global.x`/`WA.global.x` 宿主形态里的 `global.` 子串也误杀（memory-sampler.js:107、memory.js:167）。正确收窄须正交两维——既排除「兜底惯用法/数据词」，又排除「带宿主前缀的合法形态」，lookbehind `(?<![\w.])` 是关键。
  - ② **误报被截断掩盖**：旧判据报 8 个命中（6 global + 2 fs），但断言 extra 用 `slice(0,6)` 只显示前 6 个——fs 那 2 个一直被截断藏住，直到 global 修完才现形。教训：排查判据误报要看**全量命中**而非截断样本。
  - ③ 环境：本机会周期性把长进程挂起（STAT `T`），看门循环里加 `kill -CONT` 自动续跑；完整回归约 10–15 分钟（v2.27/2.28/2.29 段每次 `evidenceDrift` 全量复算约 71 秒，judge 每次内部调用一次）。
- **验证**：`node tests/run.js` → **4257 / 失败 0**（v2300 D 块扫描面两条断言转绿、B 块 undo 不再崩溃、场景 F 镜像回落守卫全绿）；`node --check core/store.js` / `tests/run.js` 双 OK；新判据独立验证：7 类误报（兜底惯用法 / 局部 fs / 数据词）全不命中 + 7 类真 Node 依赖（require / process / Buffer / 裸 global / __dirname / __filename）全命中；对真实产品代码全量扫描 0 命中（D 块正向断言绿）。出口面命名空间 65 / 成员 676（与回归锚点一致）；refs 1238 / dead 211 / uiDead 4 / dataOnly 101 / 仅测试 133 与冻结锚点逐项一致。

### R14 · 2026-09-21 · v2.31.0 交付（UI 接线面门禁·第十九面：引用面→渲染面，零幽灵绑定）

- **做了什么**：功能级失效侦察后，把侦察沉淀为可复用门禁。
  - **侦察先行（只读）**：逐一核查 v2.30.0 全部新增导出（`undo.pushValue/undo/peek/stat/clear`、`store.mirrorStat`、`store.rescueFromMirror`、`store.sameId`、`proactive.stat`）在产品代码（排除 tests/）的真实消费点——**全部存活**，无一功能级失效。实跑 `tests/inventory.js` 确认 `core/undo.js` 已在 MODULE_EXPORTS 登记、被 inventory 扫到并判存活（refs>0 故正确不进死账本，非漏扫）。`sameId` 有 11 个文件消费（P1-1 收口主战场）、undo 各方法 + mirrorStat + rescueFromMirror 都有 UI 按钮/诊断包/自动钩子真实挂载。
  - **锁定 UI 层接线盲区**：侦察发现 `tests/ui-gate.js` 管的是「**渲染面→操作面**」（渲染出的控件能否被点击），但抓不到反方向失效——「**引用面→渲染面**」：JS 里 `$('#id')`/`on('#id')`/`setOut('#id')` 引用的 DOM id，模板是否真的渲染了它。这类失效（handler 绑到从不渲染的 id）因 `on()`/`setOut()` 都有 `if (el)` 判空守卫，**静默空转、不抛错**，用户视角「点了没反应」，而真实点击门禁因元素不存在根本点不到——是 UI 层功能级失效的最后盲区。
  - **新建 `tests/ui-wire-audit.js`（零依赖静态门禁）**：`auditWire(src)` 返回 `{ referenced, rendered, ghosts, pure }`。判据口径（对真实 ui/*.js 校准，零假阳）：引用面 = `'#id'` 字符串字面量**排除 hex 颜色**（`#fff`/`#2196f3` 等）；渲染面 = 把 id 当**非 `#`** 纯字符串字面量（覆盖 `ta('id',…)` 等任意渲染 helper）或 `id="id"`（覆盖任意渲染方式，不依赖 `wa-` 前缀）；注释行（`//` `*` `/*`）不计入。导出 `auditWire`/`uiFiles` + `require.main === module` 守卫（独立运行时跑 main，被 run.js require 时只导出）。
  - **接入回归 run.js**：顶部 `require('./ui-wire-audit.js')` + 汇总前新增「v2.31.0 块：UI 接线面门禁」section——三 ui 文件逐一断言零幽灵引用 + 对**真实 panel.js 注入一个幽灵引用**做负向自证（判据非恒绿）。复用 ui-wire-audit 导出的同一判据，不复制不漂移。
  - **版本推进 2.30.0→2.31.0**：`index.js` VERSION 常量、`manifest.json`、run.js 8 处版本断言（`=== '2.30.0'` 精确锚点）、`dead-export-ledger.json` 的 version + _note 时点。历史注释（`// v2.30.0`）与段标题（`section('v2.30.0`）一律不碰。
- **为什么**：功能级失效侦察（用户偏好主线）确认 v2.30.0 无失效后，下一步是补上侦察发现的**盲区**——UI 层「引用面→渲染面」的静态一致性。ui-gate 已把「渲染面→操作面」做到很细（mini-DOM 真实渲染+点击+负向探针），但方向相反，两者正交。把它沉淀为门禁后，未来任何面板新控件「绑了却没渲染」会在回归当场红灯，而非等用户点没反应才发现。
- **影响范围**：新增 `tests/ui-wire-audit.js`（零依赖、可独立运行）；`tests/run.js`（+1 require + 接线面 section，4257→4262 全绿）；`index.js`/`manifest.json`/`dead-export-ledger.json` 版本推进。**产品代码零改动**（纯测试/门禁层，出口面不变：命名空间 65 / 成员 676 / refs 1238）。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **heredoc 嵌套引号转义地狱**：往含嵌套引号的 JS 门禁里写锚点替换时，heredoc/终端传输会破坏转义——双引号串跨真实换行（`node --check` 报 Invalid token）、`\n` 字面量被转成真实换行。解法：判据/锚点脚本**一律落盘执行**（用户既有纪律），构造换行用 `String.fromCharCode(10)` 而非 `\n` 字面量，锚点匹配用 `.count()` 精确断言命中数（失配即 ABORT），改完 `node --check` 复核。
  - ② **看门脚本 pgrep 模式陷阱（最隐蔽）**：看门用 `pgrep -f 'node tests/run.js'` 判断进程存活，但回归用 `node --max-old-space-size=1536 tests/run.js` 启动——**中间插了参数，pgrep 模式匹配不到**，连续三次（run b/c/d）误报 GONE 提前退出。真因**不是 OOM**：进程一直健康推进（RSS 仅 429MB，远低于 1536MB 堆上限，ST=R）。修复：看门直接检查固定 PID 的 `/proc/PID/stat`，不靠 pgrep 模式猜。教训：**「进程死了」的判定要看 /proc/PID 真实存在性，不靠 pgrep 模式**；验证结论前先确认判据本身没坏（负控制假绿的又一形：判据引用了错误对象）。
  - ③ **isComment 只 strip 制表符漏空格**：注释识别 `replace(/^\t+/,'')` 只剥制表符，而 panel.js:557 的注释行 `//   ` 是**空格**缩进，`//` 没被识别为注释开头，注释里的 `$('#x')` 示例被误判为引用（报 `x@L557` 幽灵）。改 `^\s+`（全空白）。教训：静态判据的边界条件（缩进风格）要在**真实文件**上校准，不能只凭构造样例。
- **验证**：全量回归 run_v2310d → **4262 / 失败 0**，「全部测试通过 ✓」；接线面 section 5 断言全绿（panel.js 引用 98/渲染提及 217、settings.js 47/115、assistant.js 0/5，均零幽灵 + 负向注入 `wa-ghost-probe-btn` 被抓）。接线面 section **独立等价验证 6/6**（require 导出可用 + 三文件零幽灵 + 对真实 panel.js 负向自证）。三 ui/*.js 实跑：hex 颜色（7 个）/注释示例（`$('#x')`）/渲染 helper（`ta()`）三类假阳**全部排除**后零幽灵。`node --check tests/run.js` / `index.js` 双 OK。版本推进后：残留 `=== '2.30.0'` 断言 **0**、`=== '2.31.0'` **8** 处、三处版本源（index/manifest/ledger）全 2.31.0、历史注释未被误伤（`// v2.30.0`、`section('v2.30.0`）仍在。出口面不变（命名空间 65 / 成员 676 / refs 1238 / dead 211 / uiDead 4，与冻结锚点一致）。

### R15 · 2026-09-21 · v2.32.0 交付（证据复算性能：文件级缓存 + 整趟快照，缓存不得假绿）

- **做了什么**：把完整回归里最大的一块耗时（证据复算）从秒级压到毫秒级，且**不丢证伪能力**。
  - **量化根因（先测后改）**：实测单次 `evidenceDrift` **82.7 ~ 87.3 秒**（基线 6 次共 520s）。根因链：`evidenceDrift`（对 ~211 条冻结项）逐条调 `evidenceOf` → `referenceCounts(rec)` 对**每个产品文件**（66 个）各自 `fs.readFileSync` + `refCountIn(src)`（内部 `codeFace` 状态机 + `REF_RE`），而只取 `[k]` 一个值 ⇒ 同一文件被解析 211 次（≈14000 次 codeFace）。而 `refCountIn()` 返回的本来就是完整 key→count map——**每个文件其实只需解析一次**。run.js 共调 `evidenceDrift` 11 次 ⇒ 这是 15 分钟回归的大头。
  - **缓存安全性先审计后动手（关键）**：v2.29 段有**端到端真实写产品文件**的负控（往 `engines/bridge.js` 注入注释/真调用再还原，`writeFileSync` 目标 `pBridge2900`）。结论：任何按**文件内容**的缓存都会在负控时假绿。选 `fs.statSync` 的 **mtimeMs + size** 作缓存键——写文件必改 size/mtime ⇒ 缓存必 miss ⇒ 重算；还原再写 ⇒ 再重建。子进程负控（`spawnSync` dead-export-gate.js --json）有独立缓存，与本层无关。
  - **三层落地**：① 文件级 `readCached(abs)`（缓存 `{stamp, src, code, map}`，stamp=mtimeMs:size）；② 整趟 `productSnapshot()`（sig = 全部产品文件+run.js 的 mtime:size 拼接，趟内只核一次）；③ 趟标记 `beginPass/endPass`（`evidenceDrift` 内部是**同步**执行，一趟内无写盘机会，故「趟首核一次 sig」与「每条都核」等价；趟外调用如 `evidenceOf` 直调仍全量核验）。`countRefs` 拆出纯核 `countRefsOnCode(code, mem)` 复用已剥面；`referenceCounts/testRefCount/ownRefCount` 全部改走快照。
  - **不改出口面**：新函数（`readCached`/`productSnapshot`/`stampOf`/`countRefsOnCode`/`beginPass`/`endPass`）均为**文件内私有**，不动 `module.exports`（冻结面零变动）。
  - **版本推进 2.31.0→2.32.0**：`index.js` VERSION、`manifest.json`、run.js **8 处** `=== '2.31.0'` 断言、`dead-export-ledger.json` version+_note。历史注释（`// v2.31.0`）与段标题（`section('v2.31.0`）不碰。
  - **新增 v2.32.0 回归 section**（+10 断言）：三层在场结构锁 + 缓存键含 mtime/size 静态锁 + 趟内复用有边界静态锁 + 等价零失实 + **性能门槛（20 次 < 5s，未缓存时约 85s/次，以数量级区分而非抖动）** + **主动负向自证**：先喂热缓存，再注入纯注释（仍 0）、注入真调用（必须当场报出 `bridge.snapshot`）、逐字节还原（md5 一致）、还原后回零。
- **为什么**：这是**唯一一条**同时改善「开发者体验」与「门禁可用性」的优化：回归 15 分钟会让人「懒得跑全量」，而证据复算是 v2.28.0 证伪能力（归因可证伪）的必要代价，不能删。把代价压到可忽略后，「每条证据都实算」才能长期保持，不必退化为抽样。
- **影响范围**：`tests/dead-export-gate.js`（+~97/− 15 行，产品代码零改动、出口面零变动）；`tests/run.js`（v2.32.0 section + 8 处版本断言）；`index.js`/`manifest.json`/`tests/dead-export-ledger.json` 版本推进。冻结锚点（命名空间 65 / 成员 676 / refs 1238 / dead 211 / uiDead 4 / dataOnly 101）逐项不变。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **「首次快、后续慢」反转的反常必须凿穿到底**：第二层快照落地后，首次 evidenceDrift 降到 **450ms**、但后续 5 次反而各 ~10s。若无计数器会误判「快照没生效」。加计数器发现 `productSnapshot` 在 call 2 被进入 **645 次**（=215×3）——真因是**趟内复用分支的早返回没置 `__passResolved`**：sig 命中走 `return __snap`，但没把「本趟已核过」标上，于是每条又重算一次 sig（215×67 次 statSync）。修法：在 sig 命中早返回处也 `if (__passDepth > 0) __passResolved = true`。修后 87s → **0.03s**（后续）/ 0.5s（首次含 sig 核验）。教训：**缓存热路径有多条返回分支时，每一条都要维护状态不变量**，漏一条就退化成全量。
  - ② **优化必须自带「不假绿」负控**：性能缓存的危险不是慢而是**假绿**（文件改了却读旧值）。本版不仅保留了原有负控，还**新增**一条同进程内主动写真实产品文件的负向自证（注入注释→仍 0；注入真调用→当场报 1 且点名 `bridge.snapshot`；还原→md5 一致且回 0）。若用内容哈希/无键缓存，此条会恒为 0 而红灯。
  - ③ **statSync 比预期便宜，不是瓶颈**：profiling 实测 67 文件 × 10 轮 statSync 共 134ms（0.2ms/次）——所以「每趟核一次 sig」完全可接受，没必要再上二级缓存。先测再优化，避免了为 134ms 的路径设计复杂机制。
  - ④ 环境：本机会周期性把长进程挂起（STAT `T`）；`uptime` 曾显示机器 only 2 分钟（环境重建过），PID 会变，看门必须重新取 `/proc/PID`；含 `!` 的 shell 命令会触发历史展开报 `event not found`，判据脚本一律落盘执行。
- **验证**：全量回归 run_v2320b → **4272 / 失败 0**（+10 断言），「全部测试通过 ✓」，**墙钟由 ~12–15 分钟降至 ~70 秒**。v2.32.0 section 全绿，其中性能门槛「20 次复算 571ms < 5000ms」（未缓存同量约 28 分钟）。独立等价验证：211 条冻结项 × 4 证据字段（src/refs/tref/own）**零失配**，`judge.ok=true`
  、`drift_len=0`。负控闭环：注入注释 drift=0 / 注入真调用 drift=1（点名 `bridge.snapshot`）/ 还原 md5 一致 / 还原后 drift=0。`node --check tests/dead-export-gate.js` / `tests/run.js` OK。版本推进后残留 `=== '2.31.0'` **0**、三处版本源全 2.32.0。
### R16 · 2026-09-21 · v2.33.0 交付（能力面 → 呈现面·第二十面：记忆总览 + 溯源视图 + 注入健康度 + 面板基础件）
- **做了什么**：R1–R15 十五轮全部在「证明它没坏」（契约/冻结/漂移/门禁/性能），本版第一次问「玩家看得见吗」。cov3.js（按文件内真实命名空间 `WA.<ns> = {` 判定，排除文件名误报）跑出全库覆盖矩阵：**30/66 产品文件零 UI 入口**，其中 `engines/memory.js` 92 方法（全库最大单体，承载 L0→L3 分层回顾/facts 更迭/伏笔生命周期）与 `engines/timeline.js`（记忆溯源）产品 UI 零出口。一次性交付四件：
  - ① **记忆总览页**（ui/panel.js `renderMemory`）：L0/L1/L2/L3 四层列表 + 长期事实（版本/启停徽章）+ 伏笔五态徽章 + pmem + 编年史全量（此前只露 10 条一行）+ 关键词检索 + 溯源审计块。写入口只走 `store.patch`（受控写入自动入撤销栈）：新增事实带重名拦截、删除、启停，操作后重绘保证「界面上的 = 磁盘上的」。
  - ② **溯源视图**：`_msRefBadge` 用非冻结的 `timeline.auditRefs` 现算「有效/正文已变/楼层缺失」+ 楼层范围徽章；「查看出处」展开 `_msFloorText` 直接从 `ctx.chat` 按 `SOURCE_ID_KEY` 取原始楼层正文，**不碰冻结导出**（`refsToConversation`/`sourceRef`/`ensureMessageId` 等）。
  - ③ **注入健康度页**（`renderInject`）：读 `store.get().lastInjection`（state 字段，零风险数据源）展示预算用量 used/cap、折叠/丢弃裁决明细、槽位落地、可见性总览；`injectInspector.getLastSnapshot/statusText`（非冻结）给「这轮注进去没」的落地判定；「去自检」跳工具页跑 toolDiag。
  - ④ **面板基础件**：工具页 16 按钮裸排改四组带标题结构（诊断与体检/存储与现场/恢复与撤销/运行痕迹，id 全保留）+ 15 个控件 tooltip。
  - **门禁同步**：页面计数 10→12（ui-gate.js + run.js 各 3 处）；tool-diag `UI_BINDINGS` 登记两个新页（memory 6 控件 / inject 3 控件）；v2.33.0 回归 section（A–I 九组 +31 断言）：新页在场与位置、记忆页读 store 真数据（防假页面）、检索过滤真生效、写入口受控 + 撤销闭环、溯源端到端（captureRange 真实 refs → auditRefs valid → 徽章 → 点开取回楼层原文 → 改文报「已变」→ 删楼报「缺失」）、注入页读真快照、工具页分组 + tooltip、零幽灵绑定（auditWire）、负控制（renderMemory 换空壳 ⇒ 读不到真数据，判据非恒真）。
  - **版本推进 2.32.0→2.33.0**：index.js / manifest.json / run.js 8 处版本断言 / dead-export-ledger.json version+_note（历史注释与段标题不碰）。
- **为什么**：**可测性偏置**——R1–R15 每轮入口都是「找一个能证伪的面」，而「玩家看不见记忆」不是能证伪的命题（无断言失败、无契约漂移、回归永远绿），于是永远排不进队列。破法是把「能力面 → 呈现面」本身做成可证伪的门禁：不只断言「页面在」，还断言「页面真的展示了引擎真数据」（内容 > 0）+ 负控自证（空壳页面会被当场抓红）。
- **影响范围**：ui/panel.js（+约 320 行：渲染层 +233 / 绑定层 +60 / 工具页结构 +27）；engines/tool-diag.js（UI_BINDINGS +2 组）；tests/ui-gate.js（计数 3 处）；tests/run.js（版本 8 处 + 计数 3 处 + v2.33.0 section）；index.js/manifest.json/dead-export-ledger.json 版本推进。出口面：**成员 676 / 命名空间 65 / dead 211 / uiDead 4 不变；refs 1238→1266**（panel.js 新增对 `timeline.SOURCE_ID_KEY` 等 28 处真实跨文件引用）；**dataOnly 101→100**（`timeline.SOURCE_ID_KEY` 从「仅数据引用」转为有真实消费方）——FROZEN2800 按 `export-contract` 实跑输出回填（唯一差异即 timeline.SOURCE_ID_KEY），账本 advisory 同步为 100。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **产品文件里局部变量名可能污染冻结计数**：`_msRefToggle` 里 `const open = …` 使 uiDead `ui.open` 的 own 从 1（仅声明）抬到 5（`ownRefCount` 按成员名裸计次、不区分命名空间归属），门禁当场报失实。改名 `isOpen` 解决。教训：在 ui/*.js 写局部变量前，先想它是否与某导出成员同名。
  - ② **命令输出截断 ≠ 未执行**：section 插入脚本首次输出被截断，重跑导致插入 2 份；另一脚本重复添加了 v2.31.0 已有的 `__uiWire` 导入。均按 `s.index(anchor, i1+1)` / 注释行+导入行成对匹配精确去重。教训：每次落盘后 `grep -c` 校验唯一性，替换前锚点断言 count==1。
  - ③ **手搓测试数据敌不过真实比对**：E 段最初手搓 `hash:'h0'`，而 `auditRefs` 做真实 FNV hash 比对，必然误判「正文已变」⇒ 断言自相矛盾。改用非冻结的 `captureRange(0,1)`（内部走 sourceRef/messageHash 真实采集）。教训：**测试数据必须来自生产端真用的采集入口**，不能造字面量绕过被测比对逻辑。
  - ④ **测试辅助自身的重绘陷阱（三连）**：`bodyOf()` 每次 click 页签会 renderBody 重建子树 ⇒ (a) 先取的 input.value 被重置回 `__memQ`（「检索过滤」断言失真）；(b) D 段先取后用的控件引用失效（`undefined.click` 崩掉运行器）；(c) 同页连访时 bodyOf 不再点击、拿到旧 DOM（E 段徽章断言看不到刚写入的 l2）。修法：bodyOf 只在换页时点击 + E 段显式强制重绘 `redrawMem2330`。教训：**「取 DOM 的辅助函数」自身有副作用（触发重绘）时，每个用法的时序都要重新审**；先取后用的控件引用必须与写入在同一份 DOM 生命周期内。
  - ⑤ **首个 `[data-refview]` 未必是你想点的**：页面第一个带溯源钮的条目可能引用集为空（如 L1 `refs:[]`），展开为空文本、断言测不到溯源链。改选溯源审计块的 `[data-refview="ALL"]`（merged 全量 refs）。
  - ⑥ **旧断言与 HTML 形状耦合**：v2.7.0 断言 `id="wa-settle-view">结算守卫</button>` 假定 id 与文本紧邻，本版加 title 后不再紧邻 ⇒ 失实。改为分别断言 id 在场 + 按钮文本在场。教训：给既有控件加属性时，先 grep 依赖该 HTML 形状的既有断言。
- **验证**：全量回归 → **4318 / 失败 0**（+31 断言），「全部测试通过 ✓」；`node tests/dead-export-gate.js` → ✓ 死子面无新增、归因可读、元数据同源、证据可复算（dataOnly 100→100 与账本一致）；ui-gate 冒烟 12 页渲染点击全绿（169 控件、thrown=[] rejections=[]）；版本推进后残留 `=== '2.32.0'` 为 0、三处版本源全 2.33.0。
### R17 · 2026-09-21 · v2.34.0 交付（广度扩张 + 平行世界引擎·第二十一面：主线之外的世界独立运转）
- **做了什么**：一次「大更新」交付两层——① v2.34.0 既有四项功能收口（仇敌总览页 / 伏笔状态流转 / Facts 批量清空 / 采样预览），② 从外部预设「狐神抚 V19.5」缝入**平行世界**引擎。后者是本版主线：
  - **新增 `engines/parallel-world.js`（315 行，命名空间 `WA.parallelWorld`）**：主线之外的独立世界推演。数据模型 = `world_clock`（剧情内时间锚，禁现实日期）+ `npcs`（每个带 `emotionLevel/attitudeLevel/CURRENT_THOUGHT/SHORT_TERM_GOAL/LONG_TERM_GOAL` + **认知边界五分类**：确认/传言/推测/误认/讳言）+ `relations`（关系网，同向边去重）+ `modules`（事件，`impact_level: none/low/mid/high/critical`）。
  - **六大审查协议**（源自狐神抚，改写为本引擎推进提示词 `buildPrompt`）：事实锚定 / NPC档案延续与认知边界 / 独立性与去中心化（主角非中心）/ NPC自然互动 / 因果与影响分级 / 输出合规。铁律：**平行世界不依赖主线正文也能运转；注入侧只放 high/critical 事件**（`INJECT_MIN_IMPACT='high'`，低影响只存档不进主线，防主线中心漂移）。
  - **触发模式四选一**：manual / per_turn / every_n（每 N 轮，`evolution.round % N`）/ dice（1/6）。默认关闭 + 手动（防意外触网）。`shouldAuto()` 判定走导出面（真实消费方，非闭包）。
  - **入账器 `applyAdvance`**：结构化校验 + 三容器环形剪枝（NPC 24 / 关系 120 / 模块 80，`WA.evict.note` 记账）+ 认知五分类。串行推进链 `advance()` 防并发重入，失败不落账、`stat()` 透传 `notConfigured/failed/lastErr`。
  - **注入管线**（同 enemies 的 before/after 分离口径）：before 链 `parallel.inject`（order 21，`<world_axis_parallel>` 标签只放 high/critical + 呈现代入铁律）+ after 链 `parallel.simulate`（order 22，按 `shouldAuto()` 触发后台推进）。
  - **平行世界页**（ui/panel.js `renderParallelWorld`，插在仇敌页后）：统计格 + 推演控制（启用/模式/每N轮/骰子/详略/存 + 手动推进/提示词预览/注入块预览）+ NPC 档案（含认知边界，`data-pwnrm` 删除连带关系边）+ 关系网 + 事件模块（影响徽章 + `data-pwmod` 丢弃）+ 时间锚。控件统一走既有 `wa-input` 体系（不造新类名，避免样式割裂）。
  - **门禁同步**：store 骨架物化 `parallelWorld`（+三容器 `__BOUNDED_CAPS` 登记 + `evict.SITES` 登记）；tool-diag `MODULE_EXPORTS` + `UI_BINDINGS`（parallel 13 控件）；run.js `LOAD` 加引擎（inventory 据此装载，否则 panel 全判悬空）；版本三源 2.33.0→2.34.0；页面计数 13→14。
  - **新增 v2.34.0 回归 section（A–I 九组 +73 断言）**：引擎 API 面 / 数据流（认知边界入账 + 同名覆盖 + 连带关系清理）/ 注入分级（low 不进主线）/ 页面真读 store 真源（防假页面）/ 绑定真生效（+NPC/丢弃/注入块预览/提示词预览）/ 设置归一（越界夹取 + 非法枚举不落盘）/ shouldAuto 四模式 / workflow 双链（before 真注入 + after manual 不触发 + disabled 不触网不落账）/ 仇敌页真源 + 状态推进 + 大势结束 / 伏笔流转 + 放弃 + facts 批量清空（入撤销栈 undo.count 增长）+ 采样预览。
- **为什么**：backstage 结算「已经发生」，平行世界推演「此刻别处正在发生」——二者互为镜像，让世界不止随玩家脚步走，NPC 有自己的欲望、目标与因果。这是源预设里唯一被用户点名要缝的模块（文风类已明确砍掉）。
- **影响范围**：engines/parallel-world.js（新增 315 行）；core/store.js（骨架 +1 段 / caps +3）；core/evict.js（SITES +3）；engines/tool-diag.js（MODULE_EXPORTS +1 / UI_BINDINGS +1 组）；ui/panel.js（renderParallelWorld +68 / 绑定 +77 / PAGES +1 / RENDERERS +1）；tests/run.js（LOAD +1 / 版本 + 计数 + v2.34.0 section +73 断言）；index.js/manifest.json/dead-export-ledger.json 版本推进。出口面：**命名空间 65→66 / 成员 676→697 / refs 1280→1327**（新引擎真实跨文件引用）；**dead 211→212**（getSettings 因 `WA.parallelWorld.*` 消费路径转为活，state 登记为 self-only）；**dataOnly 100→107**（7 个枚举/容量常量）；FROZEN2800 按 export-contract 实跑回填（新增 `parallelWorld:*` 段 + `rand.int`），账本 213→212 条 / advisory dataOnly 107。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **inventory 的装载清单取自 run.js 的 `const LOAD`（不是 index.js 的 LOAD_ORDER）**：新引擎只加进 index.js 而没进 run.js LOAD ⇒ 定义面没有 `parallelWorld`，panel 里所有引用反被判悬空（16 处 `[成员不存在]`）。教训：新增引擎必须同时进两处装载清单。
  - ② **uid() 裸调 `Math.random` 被门禁当场抓红**：全库口径只许 core/rand.js 一处 Math.random，其余走决策流/标识流。改走 `WA.rand.id` / `WA.rand.int`。教训：新引擎随机源一律走 `WA.rand`，不留裸调。
  - ③ **`setSettings` 未做枚举归一**：非法 `autoMode:'teleport'` 直接落盘，下次 `effSettings` 回退到 def 而非用户既有选择，静默漂移。补「写入即归一」（对齐 regional v2.7.0 口径）：非法枚举不落盘、保留旧值。
  - ④ **SITES 与 `__BOUNDED_CAPS` 是两套登记表，都登记了才算数**：只登记 caps 不登记 evict.SITES ⇒ v2.13.0「有界登记表每项都能被挤出侧解释」断言报「未解释」。教训：新增有界容器要同时登记两表 + registryParity checked 计数同步。
  - ⑤ **同页 patch 不触发重绘**：v2.34 测试初版 `bodyOf()` 同页连访拿到旧 DOM，绑定点击后断言读到未更新节点（事件丢弃 / 空态负控 / state 判 null 三处假失败）。修法：`bodyOf(p, force=true)` 切走再切回强制 renderBody 重建子树。教训：面板测试里「写 store → 读页面」之间必须保证渲染器重跑。
  - ⑥ **骨架物化后 `state()` 不再返回 null**：store 骨架已物化 `parallelWorld`，判「无数据」应看容器为空而非 `state===null`（null 只出现在未装载/异常路径）。教训：断言「空态」要看真数据容器，不看句柄。
- **验证**：全量回归 → **4381 / 失败 0**（v2.34.0 section +73 断言），「全部测试通过 ✓」；`node tests/dead-export-gate.js` → ✓（dataOnly 107 与账本一致，dead 212）；独立冒烟 pw_smoke.js 45/0。出口面 inventory：66 命名空间 / 697 成员 / 0 悬空 / 0 未登记。版本推进后残留 `2.33.0` 为 0、三处版本源全 2.34.0。

### R21 · 2026-09-22 · v2.38.0 交付（开关无幽灵·第二十五面：回声分支缺失）
- **做了什么**：继续沿「有产出、无消费 / 有开关、无实现」的静默失效链扫，抓到第三个。侦察法：把 render/inject.js 的 SOURCES 十项与 buildWorldSnapshot 分支逐个对齐。
- **缺陷链（静默型）**：echoes 在 SOURCES 十项里、面板注入页有真复选框、backstage applyResult 真写入（cap 40，evict.SITES 已登记），但 buildWorldSnapshot() 从无 echoes 分支。复现脚本 /tmp/wa_scan/repro_echo.js：写一条 obvious 回声（盐船案→盐帮首领伏诛）+ 一条 subtle 回声，setVisibility 置 true/false 各取一次快照 —— 两次产物**逐字节相同**（identical: true），回声结果在快照里 indexOf = -1。
- **修法**：render/inject.js 的 buildWorldSnapshot 补 echoes 分支，口径与 currents 对齐（obvious 给「案件→结果」；subtle 只给「（余波未明）」迹象，不剧透未结算内幕）；取最近 4 条；空回声返空 ⇒ 不产空头段。
- **新增 v2.38.0 回归段（+11 断言）**：开/关产物必须不同（旧实现逐字节相同）+ 开启含回声段 + 关闭不含；obvious 给结果、subtle 不剧透结果但给「余波未明」；空回声不产空头段；**通用门禁**——SOURCES 每一项都必须在快照/注入路径有真读（缺项直接列名报红）；SOURCES 仍为 10 项；负向自证（把 echoes 判断抹成 false ⇒ 真代码面确不含该读点，证明门禁能抓）。
- **同轮自纠（真实踩到）**：门禁首版把切片范围写成 buildWorldSnapshot → applyInjections 之间，而 memory/opinion/ledger/digest 四项的真读在 applyInjections 内部 ⇒ 误报「缺 4 项」。改为从快照构建起至文件末尾，因为可见性真读本就分布在两处。首版即被自己的断言抓红，说明门禁形态有效。
- **为什么**：与 v2.36/v2.37 同型，属静默失效——不抛不报、门禁全绿、面板正常，但开关是装饰。优先级高于新功能。
- **影响范围**：render/inject.js（buildWorldSnapshot 一处 + 注释）/ tests/run.js（v2.38.0 段 +11 断言 + 8 处版本号）/ tests/dead-export-ledger.json（version 2.38.0）/ index.js / manifest.json / README.md / ITERATION_LOG.md。
- **门禁与验证**：全量回归 **4458 / 失败 0**（v2.37 基线 4447，+11 断言）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，无需 --update）；export-contract 不变（60 ns / 360 members / 4546 chars）；版本三源同源 2.38.0。
### R20 · 2026-09-22 · v2.37.0 交付（闭环缺口·第二十四面：实体库只进不出）
- **做了什么**：沿 v2.36.0 的方法论继续扫「机制自述有用途、生产侧零消费」的静默失效，抓到第二个。复现脚本 /tmp/wa_scan/repro_ent.js：① 走真实 LOAD 清单装载全部产品模块；② store.transact + entities.upsert 写入「v2370盐帮（淮北盐帮）」与「v2370盐码头」；③ 调 entities.buildEntitiesBlock() —— 正确产出「【既有实体库】推演必须复用以下实体…【组织】v2370盐帮（淮北盐帮）」；④ 调 backstage.buildPrompt() 取 user 段 —— **查无此名**（indexOf = -1）。
- **缺陷链（静默型）**：entities.buildEntitiesBlock() 是活导出（有 tool-analyzer 与测试消费，故死导出账本看不见它），但它的**语义用途**（让推演模型复用既有实体、不重复造同义实体）在生产侧从未生效：backstage 只在结算侧 applyEntities 写入实体库，buildPrompt 的 user 段只有 世界快照 / 世界书 / regional / horizon / 近期正文 五块，且 compactState() 也不含 entityMemory ⇒ 实体库只进不出。后果：模型每轮推演都看不到既有实体，容易为同一事物反复造新名（「淮北盐帮」→「盐帮」→「运河盐会」），实体库膨胀且别名索引失效。
- **修法**：engines/backstage.js 的 buildPrompt user 段在 horizon 块之后插入 (WA.entities && WA.entities.buildEntitiesBlock ? WA.entities.buildEntitiesBlock() : '')。空库时该函数返空串 ⇒ 不产空头段（与全库「宁缺毋滥」口径一致）。不新增导出、不新增页面、不改结算侧。
- **新增 v2.37.0 回归段（+11 断言）**：空库 buildEntitiesBlock 返空串 + 空库时提示词不出现空头段；结算侧 upsert 真写入（组织 + 地点两类，返回 created）；buildEntitiesBlock 含实体名与别名；**提示词真含既有实体**（旧实现查无此名）+ 含实体段头 + 第二类实体同样进提示词；负向（清空 entityMemory 后提示词不得再含其名，防残影）；静态锁（backstage 真代码面经 inventory.codeFace 必须含 WA.entities.buildEntitiesBlock，防日后回退）。
- **为什么**：与 v2.36.0 同型，属「静默失效」——不抛不报、门禁全绿、UI 正常，但机制白写。用户规则要求先修严重问题/明显缺陷，这类缺陷比新功能优先。
- **影响范围**：engines/backstage.js（buildPrompt 一处 + 注释）/ tests/run.js（v2.37.0 段 +11 断言 + 清册面锚点 1372→1374 + 8 处版本号）/ tests/dead-export-ledger.json（version 2.37.0）/ index.js / manifest.json / README.md / ITERATION_LOG.md。
- **门禁与验证**：全量回归 **4447 / 失败 0**（v2.36 基线 4437，+10 断言）；node tests/dead-export-gate.js 绿（dead 208 / uiDead 4 / dataOnly 106，无需 --update）；export-contract 不变（60 ns / 360 members / 4546 chars —— 本轮不新增导出）；货册面 refs 1372→1374（entities.buildEntitiesBlock 获得真实产品消费方，逐文件归因确认）。版本三源同源 2.37.0。
### R19 · 2026-09-22 · v2.36.0 交付（单一真源·第二十三面：轮次真源收口）
- **做了什么**：进入持续自主迭代模式后的第一轮。侦察方式：先核实现场（HEAD cd56187 干净、已推送、VERSION 2.35.0、全库 TODO/FIXME 产品代码零命中），再跑命名空间覆盖矩阵（64 个命名空间 / 15 个面板零引用），逐个核实后确认多数「零 UI」命名空间有内域消费（interceptor 被 index.js 用、contractAudit 被 store 用、limits 被 backstage 用、purifier 被 settings 用 10 次），monologue / profile / tags 走 WA.workflow.register 注册（before/after 链节点），不是死代码——面收窄后转向真正的缺陷线索。
- **抓到并坐实的缺陷链（静默型，全绿也照不出）**：全库 meta.round 有读者、零写者。读者 6 处：engines/ledger.js recordChanges 1 处、engines/horizon.js 掷骰与纪事入账 4 处、engines/digest.js world_digest 入账 1 处；写者 0 处（唯一写 d.meta.* 的是 core/settle-guard.js 写 lastSettle、core/interceptor.js 写 contextSize）。真源是 evolution.round（engines/evolution.js 的 tick() 内唯一 draft.evolution.round++）。
- **后果链（已用复现脚本落盘坐实）**：① 账本永远写「第0轮」——/tmp/wa_scan/repro_ledger.js 实测 evolution.round=7 而账本 round used: 0；② recordChanges 的「同轮重 roll 覆盖」判据 filter(m => m.round !== round) 因 round 恒 0 而**恒真** ⇒ 每轮都新压一条，KEEP_ROUNDS=20 的环形在 21 轮后开始**静默吃掉真实轮次**；③ 纪事 chronicle 与 world_digest 的 round 字段同样恒 0，前端看不到轮次推进。
- **修法（单一真源）**：engines/evolution.js 新增并导出 roundOf(state) 作为**唯一轮次读口**（evolution.round → 兼容兜底 meta.round → 0，读失败不抛，与旧行为一致）；engines/ledger.js / engines/horizon.js / engines/digest.js 各加本地 roundOfSafe(state)（优先调 WA.evolution.roundOf，兜底直读 evolution.round，再兜 0——不硬依赖 evolution 的加载顺序），全部旧读点改向，并把调用方都从 st 换成事务内 draft d/tx（读到本事务真值，不读 live store）。
- **新增 v2.36.0 回归段（A–E 五组 +18 断言）**：A 真源优先级（evolution.round 胜出；负向「手写 meta.round=3 不得压过真源」；真源缺失时兼容读旧 meta.round，历史存档不丢轮次；两处都缺⇒0；空壳状态不抛）；B 账本按真源入账（meta.round=99 干扰下账本仍记 7，负向「第99轮不得进注入文本」）；C 同轮重 roll 覆盖恢复有效（同轮 1 条、跨轮各 1 条且轮次可辨 8/7）；D 纪事（horizon 远/近端）与摘要（digest）轮次同源；E 静态口径——全库 meta.round 真代码引用只剩 evolution.js 兼容读 2 处（用 inventory.codeFace + PRODUCT_FILES 独立复算，防日后有人再把读点加回去）。
- **为什么**：这是「静默失效」型缺陷——不抛不报、门禁全绿、UI 照显，但账本/纪事/摘要三处玩家可见数据的轮次字段全是假的，且 21 轮后开始真实丢账。优先级高于任何新功能（用户规则：先修严重问题/明显缺陷）。
- **影响范围**：engines/evolution.js（+roundOf 导出）/ engines/ledger.js / engines/horizon.js / engines/digest.js / tests/run.js（v2.36.0 段 +18 断言 + 清册面锚点 + 8 处版本号）/ tests/dead-export-ledger.json（version 2.36.0）/ index.js / manifest.json / README.md / ITERATION_LOG.md。不新增产品文件、不新增页面。
- **门禁与验证**：全量回归 **4437 / 失败 0**（起始基线 4419，+18 断言）；node tests/dead-export-gate.js 绿（dead 208 / uiDead 4 / dataOnly 106 / 仅测试 130，**无需 --update**——新导出有真消费方）；出口面 66 ns / 707 members（+1 = evolution.roundOf）/ refs 1372；FROZEN2800 按 export-contract 实跑回填（4538→4546 字符，唯一新增 evolution.roundOf）；清册面锚点 1362→1372 / 706→707，漂移已逐文件归因（evolution.roundOf 6 处真实调用 + 4 处兜底 store.get）。版本三源同源 2.36.0。
- **证据文件（未入仓，留档备查）**：/tmp/wa_scan/repro_ledger.js（修复前 0 / 修复后 7）、/tmp/wa_scan/repro_round.js（5 次 tick ⇒ evolution.round=5 / meta.round=null）、/tmp/wa_scan/attr236.js（清册面漂移逐文件归因）、/tmp/wa_scan/run236d.log（本轮全量回归）。
### R18 · 2026-09-21 · v2.35.0 交付（能力面 → 呈现面·第二十二面：世界书蓝绿灯 / 实体库 / 账本 / 下一日 / 平行快照）
- **做了什么**：一次「大更新」把孤神抚源卡对照后仍剩的五个「玩家看得见」正交缺口补进既有 14 页，不新增第 15 页。
  - **世界书蓝绿灯**：`engines/worldbook.js` 新增 `seedEntries/peekEntries/previewActivation/OVERRIDE_VALUES`；无头测试用 seed mock，不走 `import('/scripts/world-info.js')`。`backstage.__REG_B.def.worldbookTrigger: false`（有副作用能力默认关），世界页 `wa-wb-trigger` 走 `setSettings` merge。触发关闭时已选全量「触发关闭·全量注入」。
  - **世界钟下一日**：`wa-next-day` 调 `calendar.advanceDay({source:'user'})`，`advanceDay` 从 test-only 变成活出口。
  - **实体库**：事件页按 `TYPE_LABELS` 四类各示最近 8 条，手工录入走 `store.transact` + `entities.upsert`。
  - **重大事件账本**：事件页真读 `WA.ledger.buildLedgerText()`，空态仍保 `#wa-ledger-text`。
  - **平行世界快照**：`saveSnapshot/listSnapshots/restoreSnapshot/dropSnapshot`，只序列化 clock/npcs/relations/modules/round，不含 settings 与 snapshots 自身；恢复保留快照列表；cap 12 走 `evict.array`。
  - **双登记**：`store` 骨架补 `evolution.ledger: []` 与 `parallelWorld.snapshots: []`；`__BOUNDED_CAPS` + `evict.SITES` 加 snapshots(12) + ledger(20)；`registryParity.checked` 36→38。
  - **面板**：世界页 `wa-wb-*` + `wa-next-day`；事件页 `wa-ent-*` + `wa-ledger-text`；平行页 `wa-pw-snap-*`。`UI_BINDINGS` 静态组已加新 id；动态 `data-wb-sel/ov` 与 `data-pwsnap-*` 不入静态守卫。
  - **门禁**：FROZEN2800 实跑回填；dead-export-ledger `--update`（dead 212→208 / dataOnly 107→106 / 仅测试 133→130）；现场锚点 refs 1327→1362 / members 697→706。
  - **新增 v2.35.0 回归段**（约 41 条 `v2350:`）：世界书 seed/preview/选择/触发、下一日跨日、实体库呈现/手工录入、账本真读、registryParity 38、快照保存/列出/恢复/删除/容量环形。
- **为什么**：引擎能力在、面板零入口。世界书触发开关之前因 def 缺键恒为 false；`advanceDay` 之前 test-only；账本在 evict.SITES 但骨架缺字段。
- **影响范围**：`engines/worldbook.js` / `engines/parallel-world.js` / `engines/backstage.js` / `core/store.js` / `core/evict.js` / `ui/panel.js` / `engines/tool-diag.js` / `index.js` / `manifest.json` / `tests/run.js` / `tests/dead-export-ledger.json` / README / ITERATION_LOG。不新增页面、不新增产品文件。
- **验证**：全量回归 4419/0；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106 / 仅测试 130）；ui-wire-audit 8/0。出口面 66 ns / 706 members / refs 1362。版本三源 2.35.0。

### R22 · 2026-09-22 · v2.39.0 交付（幽灵轮次收口·第二十六面：顶层 round 读点 + v2.36.0 漏网修正）

- **做了什么**：延续「静默失效」猎取线（第二十六面），沿 v2.36.0 的轮次真源线索再挖一层，把当时**没收干净的另一半**收口。
- **缺陷链（实测坐实）**：全库 5 处读「顶层 `state.round`」——该字段在 `core/store.js` 的 `defaultWorldState()` 骨架里**根本不存在**，
  真源只有 `evolution.round`（`tick()` 内唯一 `++`）。三处受害：
  1) **`engines/proactive.js`（最严重）**：`cooldownOk` 读 `st.round`（恒 undefined ⇒ 0），`markPulled` 写 `d.round`（恒 0）
     ⇒ `(0 - 0) >= COOLDOWN_ROUNDS(3)` **恒假** ⇒ 主动拉动拉过一次后**永久冷却**——整条「语义枯竭 → 强制拉动互动」链路退化为一次性功能。
     复现（`/tmp/wa_scan/repro_proactive.js`）：`evolution.round` 从 5 推到 12、再到 40，`proactive.pull` 均**不再注入**，`stat.skippedCooldown` 一路 +
     （修复后：`proactiveLastRound` 写 5、推进到 20 时正常拉动、诊断 round=40）。
  2) **`engines/chatcache.js`**：自动备份读 `(JSON.parse(getState(id)||'{}').meta||{}).round` —— `meta.round` 全库零写入方 ⇒ 恒 0
     ⇒ `round > _lastAutoRound` 恒假 ⇒ 「轮次推进时滚动自动备份」开关**永不产出任何自动快照**（用户以为有兜底，实际没有）。
  3) **`engines/inject-inspector.js` / `engines/tool-diag.js`**：注入自检快照与诊断包的世界轮次恒 `null` / `undefined`，排障时看不到轮次。
- **漏网原因**：v2.36.0 的静态锁 `(face.match(/meta *[.] *round/g))` **只认字面 `meta.round`**，
  `).meta || {}).round` 这种嵌套写法不命中 —— 静态锁的形态盲区本身就是缺陷的一部分。
- **修法**：给四个模块各加本地 `roundOfSafe(state)`（优先 `WA.evolution.roundOf`，兜底直读 `evolution.round`，不硬依赖加载顺序），
  五处读点全部改向；写入口 `markPulled` 同样写真源（写进去的是别人要读的东西，必须同源）。
- **判据（新增 v2.39.0 回归段，+26 断言）**：
  · A 写入口写 `evolution.round` 真值（旧实现恒 0）；
  · B 冷却真生效——未推进（6-5=1 < 3）不放行 / 推进到期（20-5=15 ≥ 3）真拉动 / 拉动后计数同步真源；
  · C 诊断包 `worldState.round` 取真源（旧实现 `undefined`）；
  · D 注入自检 `snapEnv().round` 取真源（旧实现 `null`）；
  · E **静态口径**——全库顶层 `.round` 幽灵读点清零，只余三处**本地构造对象**的合法读（`inject-inspector` 的 `env`、`tool-diag` 的 `snap`、`parallel-world` 的 `pwState().st`，三者自带 `round` 字段）；
  · F/G/H **负向自证**——真源码破坏 → 副本上重跑同款判据（proactive 退回旧写法报 4 处、chatcache 退回嵌套写法报 1 处）；
  · G 另含 chatcache 行为门禁（开 `autoBackup` 驱 `runTick`，断言真产出自动快照且名字含真源轮次）。
- **为什么**：一个字段在读者侧被引用了 5 次、在骨架里却从未存在 —— 不抛不报、门禁全绿、UI 正常，但机制实际白写。
  这类「幽灵字段」与 v2.36.0「有读者零写者」同源，属同一根藤上的第二个瓜。
- **同轮自纠（3 次，全部由自己新写的门禁抓红）**：① 首版 `ghostScan` 标识符集过宽，把诊断快照对象 `snap`/`env` 误报为幽灵（改为白名单三处合法残留）；
  ② 负向自证期望值算错（4 误写 6 —— 该断言只扫 `proactive.js` 一份文件面，`st.round`/`d.round` 各出现两次）；
  ③ 自动备份判据用「份数增长」，被 `MAX_AUTO_BACKUPS=3` 环形裁剪掩盖（改为「存在性 + 名含真源轮次」）。
- **影响范围**：`engines/proactive.js` / `engines/inject-inspector.js` / `engines/tool-diag.js` / `engines/chatcache.js`（四处各加 `roundOfSafe` + 五处读点改向）/
  `tests/run.js`（v2.39.0 段 +26 断言 + 8 处版本锚点 + 4 处清册面锚点）/ `tests/dead-export-ledger.json`（version）/ `index.js` / `manifest.json` / `README.md` / `ITERATION_LOG.md`。
- **门禁与验证**：全量回归 **4477 / 失败 0**（v2.38.0 基线 4458，+19 净增）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 `--update`**）；
  export-contract 不变（60 ns / 360 members / 4546 chars，本轮不新增导出）；清册面 refs 1374→1386（+12 = 四处 `roundOfSafe` 各 3 个真代码引用，逐文件归因一致）；版本三源同源 2.39.0。
### R23 · 2026-09-22 · v2.40.0 交付（骨架归属门禁·第二十七面：写侧幽灵物化 + 三规则冻结，并修 ui-gate 陈旧常量红灯）
- **做了什么**：延续「静默失效」猎取线（第二十七面）。前两轮修的都是**读侧**幽灵（v2.36 `meta.round` 有读者零写者；v2.39 顶层 `state.round` 有读者、骨架无字段），本轮把同一条线拉到底，抓到**写侧**那一半，并把它固化成永久门禁。
- **缺陷（实测坐实）**：
  1) `lastInjection` —— `render/inject.js:293` 真实写入（含 budget/slots/slotErrors 快照），`inject-inspector` / `tool-diag` / `render/inject` / `panel.js` 共 7 处读，**骨架 `defaultWorldState()` 零声明**。
  2) `proactiveLastRound` —— `engines/proactive.js:86` 写入（v2.39.0 刚改成写真源轮次），冷却判据 `cooldownOk` 读，骨架同样零声明。
  3) 佐证链最刺眼的一环：`core/store.js` 的 `ensureShape` 注释**自己**写着「仅当默认期望容器（对象/数组）而实测不是，才算污染；默认为 null 的字段（**lastInjection**/worldPulse 等）运行时变对象属正常演进」——`worldPulse` 在骨架里，它俩不在。**注释认、骨架不认**，正是「骨架清单失真」的直接证据。
- **为什么算缺陷（而不是「只是注释没写」）**：骨架是**字段权威清单**（`registryParity` 以它判「未在骨架物化」，`ensureShape` 以它做结构自愈，体检/白名单裁剪以它为集合）。写进去却不在清单里 ⇒ 形状自愈补不到、按清单白名单裁剪的路径不认识它。它不抛不报、门禁全绿、UI 正常，属典型的静默失效面。
- **修法（两层）**：
  · **治标**：`core/store.js` 的 `defaultWorldState()` 物化 `lastInjection: null` 与 `proactiveLastRound: 0`（与 `worldPulse` 同族），各带 why 注释指向写入方与本次缺口。
  · **治本**：新增 `tests/field-liveness-gate.js` + 冻结账本 `tests/field-liveness-ledger.json`。**不再枚举拼法**（v2.36 的教训：静态锁只认字面 `meta.round`，`(JSON.parse(...).meta || {}).round` 嵌套写法直接漏网），改为以运行时骨架（`store.get()` 真实导出）为唯一字段真源，三条正交规则：
    ① `ghost-read`：已知幽灵读形态 denylist（`meta.round` / 顶层 `state.round`），命中只许落在**逐条附理由**的豁免面；
    ② `schema-write`：`transact` 回调 draft 与 `patch(key)` 写入的**顶层键**必须在骨架一级键内；
    ③ `schema-read`：裸形态 `store.get().FIELD` 读取的顶层键同上。
- **门禁规则的两轮自纠（本仓纪律：门禁不能成为维护负担）**：
  · 首版规则② 用「骨架字段存活性」（写点/读点计数）⇒ 实测 **200+ 噪声**（`background.text` 这类叶名与页名撞词、`ensureShape` 的 `leaf:` 声明被误当写点）。判定为**门禁本身不合格**（不可审查的门禁只会变成维护负担），删掉重写。
  · 二版收敛为「写侧越界 + 读侧越界」两口径（更锐、贴着 v2.39/v2.40 缺陷形态），现场输出 **5 行、逐条可审查**：规则② 1 处（`ui/panel.js::innerHTML`，transact 回调参数 `d` 与 `const d = mainDoc.createElement(...)` 撞名，显式登记）、规则③ 0 处。
- **同轮修掉的既有红灯（严重问题优先）**：`tests/ui-gate.js` 在 v2.39.0 干净基线上**本就是红的**（`git stash` 对照实测确认）：「RENDERERS 覆盖的页面数为 12（实 14）」。根因是**陈旧常量**——`checkPages.tested` 恒等于 `ui.pages().length`（循环内自增），页面在 v2.30~v2.34 段从 12 增至 14 时期望值没跟，写死数字只会在加页时误报，而真正的漏渲染早被同一段的 `failures` 兜住。修法：期望值改为自维护（`tested === pages().length && > 0`），并把「**RENDERERS ↔ PAGES 逐页同名同数**」提升为静态不变式（漏一个渲染器时点到该页必抛，此前无静态覆盖）。**这条红灯与本次主题完全同构**：只认一种形态（写死的 12）就等于给其它形态发通行证。
- **判据（新增 v2.40.0 回归段，+19 断言）**：
  · A 骨架物化两字段 + 声明字面量成对在位 + `registryParity().ok === true` + `ensureShape` 注释佐证；
  · B 规则① denylist 命中不超显式豁免上限；
  · C 规则②③ 现场零越界（读侧要求**恰好为 0**）；
  · D 门禁模块端到端 `spawnSync` exit 0（防止「门禁另开一趟没人跑」）；
  · E **四条负向自证**：E1 把 chatcache 真写法退回 `st.round` 幽灵 ⇒ 规则① 报 1 处；E2 把 tool-diag 的裸读改成 `ghostProbe2400` ⇒ 规则③ 报，且**同一判据在原版上不报**（证明非恒真）；E3 从白名单抽掉 `lastInjection` ⇒ 规则② 立刻报 `render/inject.js` 越界 1 处；E4 撞名走 `OWNED_TOP_KEYS` 显式登记（不是静默豁免）。
- **同轮自纠（1 次，被自己新写的断言抓红）**：首版断言写「两字段初值为 null/0」，但 `loadWA()` 复用同进程 `global`，前序段（v1817 等）已往 `lastInjection` 注入过快照 ⇒ 前提不成立。改为「初值由**骨架声明字面量**证明 + 运行时只验类型/在册」，并把坑写进注释。
- **为什么**：三次同型缺陷（读侧零写者 → 读侧无字段 → 写侧无字段）都由「骨架与代码各说各话」引起，而两次漏网都源于「静态锁写死一种拼法」。本轮把判据的作用点从「代码里的拼法」搬到「运行时骨架本身」，这类缺陷此后无法静默进入。
- **影响范围**：`core/store.js`（物化两字段）/ `tests/field-liveness-gate.js`（新）/ `tests/field-liveness-ledger.json`（新）/ `tests/ui-gate.js`（陈旧常量 → 自维护 + 新增静态不变式 + 段名）/ `tests/run.js`（v2.40.0 段 +19 断言 + 8 处版本锚点）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**不新增导出、不新增产品文件。**
- **门禁与验证**：全量回归 **4496 / 失败 0**（v2.39.0 基线 4477，**+19 净增**）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 `--update`**）；export-contract 不变（60 ns / 360 members / 4546 chars）；ui-gate **48/1 → 53/0**（修复既有红灯 + 净 +5 断言）；ui-wire-audit 8/0；field-liveness-gate 绿；版本三源同源 **2.40.0**。
### R24 · 2026-09-22 · v2.41.0 交付（工具可移植性·第二十八面：生成器硬编码 /tmp → __dirname 推导 + 成类静态锁）
- **做了什么**：延续「静默失效」猎取线（第二十八面）。v2.40.0 治的是「门禁断言写死一种形态」（ui-gate 的陈旧常量 12），本轮沿同一根线把范围推到「**工具写死一种环境**」——扫描全仓 `/tmp` 硬编码绝对路径。
- **缺陷（实测坐实）**：`tests/export-contract.js` 三处硬编码 `/tmp/wa_git`：
  1) `require('/tmp/wa_git/tests/mock.js')` —— 换目录即 MODULE_NOT_FOUND；
  2) `const BASE = '/tmp/wa_git'` —— 被测真源被**写死成某个特定工作区**；
  3) 产物 `fs.writeFileSync('/tmp/export_contract.txt')` —— 共享临时目录，多副本并行互相覆盖。
  全仓扫描确认**产品面上只有这一处**（core/engines/render/ui/actors/direction/compat/index.js 全零命中），它是唯一的坏点。
- **为什么算缺陷（而不是「本机跑得好好的」）**：它是出口面契约门禁在漂移时**唯一指定的回填工具**（`tests/run.js` 块1 失败文案写死「运行 `node tests/export-contract.js` 并回填」），属「防线所依赖的工具本身不可移植」。换目录/换机器/换 CI 工作区时，门禁红了却**修不了**——这正是「门禁自己白写」的最内层形态。
- **修法**：`BASE` 改由 `path.join(__dirname, '..')` 推导；mock 走 `path.join(BASE, 'tests/mock.js')`；产物落到**仓库内** `tests/export_contract.txt`（真源永远是「运行中的仓库本身」，不再依赖共享 /tmp）；新增 `.gitignore` 忽略该派生产物；生成器打印写入路径；同步更新块1 里写死 `/tmp/export_contract.txt` 的失败文案。
- **判据（新增 v2.41.0 回归段，+15 断言）**：
  · A **静态面**：生成器含 `path.join(__dirname, '..')` 且零 /tmp 字面量；
  · B **行为面**：在**仓库之外的 cwd**（`tests/` 目录）里运行生成器，仍 exit 0、仍打印 `ns/members/chars`、    产物仍落回真源仓库；
  · C **链路面**：产物与 `FROZEN2800` **逐字一致**（重生成 → 回填 → 门禁比对这条链路未断）；
  · D **成类静态锁**：全仓 `.js` 扫描，**产品面硬零** `/tmp` 死路径；测试面只允许「**守卫式本地安装回退**」    `/tmp/node_modules/<pkg>` 一类（先 `require('<pkg>')` 可移植路径，失败才回退本地临时安装，    且整段在 try/catch 内、缺失降级为 null 而非崩——run.js 的 9 处 jsdom 回退正是此形），其余仍报；
  · E **两条负向自证**：E1 把 `BASE` 退回硬编码 ⇒ 静态锁报出，且**原版同判据不报**（非恒真）；    E2 把 `BASE` 指向不存在目录 ⇒ 运行**非零退出**，反证 B 的 exit 0 不是常量。
- **同轮自纠（2 次，均由自己新写的门禁抓红）**：
  · ① 首版规则 D 把 `tests/` 与产品面混在一起扫描 ⇒ 一次性报出 **16 处**（9 处 jsdom 本地回退 + 6 处**判据自身字面量**）。    逐条辨明后按「**产品面硬零 / 测试面按可归类豁免**」收口——9 处属正当回退，判据自指属伪命中。
  · ② 消除自指的更干净做法：把 needle 改成**字符串拼接构造**（`const TMP4100 = '/' + 'tmp'`），    于是本段源码自身不再含 /tmp 字面量，**根本不需要「自指豁免」**（判据不得引用锚点串，v2.40.0 判据纯度纪律的延伸）。
- **为什么**：三次「写死」缺陷（v2.40 门禁期望值写死页面数 12 → v2.41 工具写死工作区路径 /tmp/wa_git）同一病根：**把一个会变的值当成常量**。v2.40 治的是断言侧，本轮治的是工具侧，并各自补了成类静态锁，此后「写死形态/环境」进不了提交。
- **影响范围**：`tests/export-contract.js`（BASE/mock/产物三处可移植化 + 打印路径）/ `tests/run.js`（块1 路径断言同步 + v2.41.0 段 +15 断言 + 8 处版本锚点）/ `.gitignore`（新）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**不新增导出、不新增产品文件。**
- **门禁与验证**：全量回归 **4511 / 失败 0**（v2.40.0 基线 4496，**+15 净增**）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 `--update`**）；export-contract 不变（60 ns / 360 members / 4546 chars）；ui-gate 53/0；ui-wire-audit 8/0；field-liveness-gate 绿；版本三源同源 **2.41.0**。
### R25 · 2026-09-22 · v2.42.0 交付（UI 文件面自维护·第二十九面：两道 ui 门禁硬编码清单 → 动态发现）
- **做了什么**：续接 v2.40.0「门禁写死一种形态」这条线，把「**会长的集合被写成常量**」当作一类来扫，从 UI 侧再抓一例同族缺陷。
- **缺陷（实测坐实）**：两道 ui 门禁各自硬编码同一份三文件清单：
  1) `tests/ui-gate-sync.js:18` `const UI_FILES = ['ui/panel.js', 'ui/settings.js', 'ui/assistant.js']`    —— 真实装载 + 逐页点击/可点性门禁的装载面；
  2) `tests/ui-wire-audit.js` 的 `uiFiles()` —— 接线审计（引用面 → 渲染面）的扫描面；
  另有 `assert(files.length === 3, ...)` 把「三个」写进断言（与 v2.40.0 写死 12 完全同形）。
  后果：新增 `ui/xxx.js` ⇒ 两道门禁**同时不看它**，而它们是 UI 层唯一的自动化覆盖。
  （对照：`tests/inventory.js` 的 `productFiles()` 是**动态遍历**，所以死导出/字段门禁的主扫描面无此问题——同一个仓库里已经存在正确写法，UI 侧是没有跟上。）
- **为什么算缺陷**：`uiFiles()` 只在列表内取文件、不存在也不报；`files.length === 3` 只能证明「数量没变」，证明不了「发现面是对的」。两者叠加的净效果是：**新增 UI 模块 0 覆盖、0 提示**，恰是本仓一直在治的静默失效形态。
- **修法**：两处改为动态发现（`readdirSync` + `.js` 过滤 + 排序）；`ui-gate-sync` 导出参数化的 `discoverUIFiles(dir)`，`ui-wire-audit` 导出带 `dir` 参数的 `uiFiles(dir)`；`ui-wire-audit` 的计数断言换成与 `ui-gate-sync.UI_FILES` 的**交叉核对**（把「两道门禁看同一批文件」变成硬约束，而非各自维护一份注释同步的清单）。
- **判据（新增 v2.42.0 回归段，+10 断言）**：
  · A 两道门禁的发现面与 `ui/` 磁盘实际**逐项一致**，且彼此同一批文件；
  · B 静态度：两文件源码里已无旧硬编码清单，发现面均落在 `readdirSync`；
  · C **行为级负向自证**：临时目录造 3+1 个 `.js` 与 1 个 `.txt` ⇒ 两个发现器都返回 4 项、    含 `ui/zz_extra_4200.js`、排除 `note.txt`；且仓库(3) vs 临时(4) 不同，    **证明发现面取决于目录内容而非恒值**（可证伪「换了写法的常量」这类假修）；
  · D 在**完整文件面**上复核接线审计零幽灵引用（防「少扫了文件所以干净」的假结论）。
- **为什么**：同族的两次「写死」（v2.40 页面数 12 / v2.42 UI 文件清单三文件）都属同一个病根：**把一个会长的集合当成常量**，于是集合长大了门禁却不知道。v2.40 治断言、v2.42 治扫描面，并在本次把负向自证升级为**行为级**（临时目录驱动），比「源码字符串断言」更能证伪假修。
- **影响范围**：`tests/ui-gate-sync.js`（UI_FILES 动态发现 + 导出 discoverUIFiles）/ `tests/ui-wire-audit.js`（uiFiles 动态发现 + 交叉核对断言 + 导出）/ `tests/run.js`（v2.42.0 段 +10 断言 + 8 处版本锚点）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**不新增导出成员、不新增产品文件。**
- **门禁与验证**：全量回归 **4521 / 失败 0**（v2.41.0 基线 4511，**+10 净增**）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 `--update`**）；export-contract 不变（60 ns / 360 members / 4546 chars）；ui-gate 53/0；ui-wire-audit **8 → 9/0**；field-liveness-gate 绿；版本三源同源 **2.42.0**。

### R26 · 2026-09-22 · v2.43.0 交付（文件面单一真源·第三十面：同一份 ui 三文件清单全仓四份副本 → 定义上收 + 成类静态锁）

- **做了什么**：v2.42.0 修完当场复查，抓到那份「UI 三文件清单」在仓库里**共有四份副本**，v2.42.0 只动了其中两份（`ui-gate-sync.UI_FILES`、`ui-wire-audit.uiFiles()`）。漏网的两份是 `tests/run.js` 守卫表的**控件 id 采集面** `uiFilesH` 与 `tests/inventory.js` 的 **UI 装载面** `UI_LOAD`。更深一层：`inventory`（排 tests/ + tools/）、`export-contract`（只排 tests/）、`field-liveness-gate`（间接遍历）、`run.js`（内联）四处各写了一遍「什么算产品/UI 文件面」，口径已经开始漂移。
- **为什么**：后果**实测坐实**（非推理）。副本注入 `ui/zb_extra.js`（渲染 id=wa-zb-untracked ）后，硬编码采集面**恒 198 项**、动态面 199 项——多出的那个控件在「面板渲染的每个控件都在守卫表内」这条断言里**永不可见**，而 ui-gate 照样全绿。守卫表是控件接线面的唯一真源，采集面漏一个文件 = 该文件渲染的全部控件被永久放行。病根不是那四处清单，而是**定义被复制**：「写死一种形态 = 给其它形态发通行证」。本版从「修这一处」推进到「定义只留一份、其余全部委托」。
- **修法**：新增 `tests/product-files.js` 作为文件面**单一真源**（`productFiles` 排除 tests/ + tools/，供产品模块面；`repoFiles` 含 tests/tools，专供成类静态锁——漏网缺陷都在 tests/；另有 `discoverFiles` / `discoverUIFiles` / `uiFiles`）。六处消费方一律改为**委托调用**（inventory 的 `PROD` 与 `UI_LOAD`、export-contract 的 `files()`、ui-gate-sync 转出、ui-wire-audit 委托、run.js 的 `uiFilesH`、field-liveness-gate 注释说明其本就走 `inventory.PRODUCT_FILES`）。v2.42.0 的 `discoverUIFiles(dir)` / `uiFiles(dir)` **名字与签名不变**，实现迁到真源、原处转出，既有断言逐项照跑。v2.42.0 段「wire 源码须含 `readdirSync`」放宽为「含 readdirSync 或 `require(./product-files.js`」。
- **判据 +25**：委托锁（六处消费方不再自带发现逻辑，inventory 不再含 `const SKIP_DIRS = [tests, tools]`）；**成类静态锁**——全仓代码面（`repoFiles`，含 tests/）对「三文件清单」硬零，needle 由 path 片段拼装以消除判据自指，映射表合法形态显式排除，含 exactSign 的行必须同时含锚点定义才豁免。口径统一的**无副作用**证明（`PRODUCT_FILES` 与真源逐项一致、出口面契约**逐字不变** 60 ns / 360 members / 4546 chars）；行为级负向自证（临时树 ui/a.js、ui/b.js + engines/c.js，排除 tests/d.js、tools/e.js，仓库 3 个 vs 临时 2 个）；**破坏性坐实**（副本注入新 ui 模块，修复后采集面 198 到 199 含 wa-zb-untracked、旧硬编码恒 198 漏它、差集恰 1；再把委托调用破坏回「每处自己发现」，锚点由三段 join 且 split 后恰 1 次，破坏后 node --check exit 0，最后 rmSync）。
- **自纠**：静态锁最初扫 `productFiles`（不含 tests/），缺陷恰在 tests/，改扫 `repoFiles`；判据源码若含三文件字面量会自指，needle 改由 path 片段拼装；`tool-diag` 的映射表是合法形态，用「名字后接冒号则排除」只抓裸清单；E 段破坏锚点若写整串会让静态锁与「恰 1 次」失败，改为三段 join、从 `QUOTED4300` 切片；`tests/run.js` v2.28.0 段断言因 inventory 不再含旧字面量而红，改为断言源码含 `product-files.js` 与 `uiFiles(BASE)`（两段分开，避免与锚点整串撞成 2 次）；笔误 `path300Join4300` 改为 `path4300.join`。首次全量 4540/5，修后 **4546/0**。
- **影响范围**：新增 `tests/product-files.js`；改 `tests/inventory.js` / `tests/export-contract.js` / `tests/ui-gate-sync.js` / `tests/ui-wire-audit.js` / `tests/field-liveness-gate.js`（仅注释）/ `tests/run.js`（v2.43.0 段 +25 断言、v2.42.0 段放宽、v2.28.0 段断言改写、8 处版本锚点）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**不新增导出成员、不新增产品文件**（product-files.js 在 tests/，属测试基建）。`LOAD` / `LOAD_ORDER` / `MODULE_EXPORTS` 三份大清单本轮实测零内容漂移，未改产品装载顺序。
- **门禁与验证**：全量回归 **4546 / 失败 0**（v2.42.0 基线 4521，**+25 净增**）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 --update**）；export-contract 不变（60 ns / 360 members / 4546 chars）；ui-gate 独立跑 53/0（run.js 内嵌 G17 打印 49 为既有基线，pristine 副本同样 49 且当时总计 4521/0，非本轮引入）；ui-wire-audit 9/0；field-liveness-gate 绿（骨架一级键 20、产品文件 67）；版本三源同源 **2.43.0**。
### R27 · 2026-09-22 · v2.44.0 交付（对齐 SoulLink v1.7.1：独白改纯文本，兼容旧 JSON）

- **做了什么**：对照上游 SoulLink v1.7.1–v1.7.5，只缝一处机制——角色扮演独白从「必须输出 JSON」改为「400 字内第一人称纯文本内心独白」。预筛 Gate 保持 JSON 不变。
- **为什么值得缝**：旧提示词要求 `{"character":...,"monologue":"..."}`，模型要把独白塞进字段结构里，白白消耗配额、也更容易撞上截断。上游改成纯文本独白是形态改进，不是界面或个人偏好。
- **为什么其余不缝**：v1.7.4 全局 max_tokens 默认 12000 会改变注入体积，我们已有通道级默认 4000 与独白 800，且快照恢复自带三重校验；v1.7.5 名单/档案 JSON 导入导出与我们已有的快照恢复职责重叠；OpenCode 会话头与主题/手写体/窗口拖拽是上游自己的接口与界面，不属于世界引擎机制。
- **改法**：`ROLEPLAY_SYS` 改为纯文本独白提示词（保留认知边界、信息盲区、禁止「静观其变」、每段最多一句疑问的既有约束）；新增 `parseMonologue(raw)`——先剥 ```json 围栏，再剥 `[姓名]的内心独白:` 前缀，**仅当整段以 `{` 或 `[` 开头**时尝试取旧 JSON 的 `monologue` 字段，空串返回空、超长截到 400。`roleplayOne` 的调用从 `json: true` 改为纯文本（`core/api-router.js` 在 `opts.json` 时解析失败会抛 `invalid-json`，所以必须走非 JSON 调用再本地解析）。`maxTokens: 800` 保留。特殊场景只留一句「服从该角色关系与性格、不得覆盖上面的认知边界与信息盲区」，不搬上游具体写法。
- **判据 +14**（`tests/run.js` v2.44.0 段）：静态面——全文件只剩预筛一处 `json:true`、独白调用不再带 `json: true`、提示词不再要求 JSON 而预筛仍要求；行为面七条路径——纯文本原样注入、剥姓名前缀、剥代码围栏、旧 JSON 的 `monologue` 仍可注入、空返回不注入、超长截到 400、正文里夹带 JSON 片段不被抽走。
- **连带影响（门禁实测坐实，非推理）**：`actors/monologue.js` 开始调用 `apiRouter.extractJson`，该成员由「死导出」转为「活导出」——出口面契约 60 ns / 360 members / 4546 chars → **60 ns / 361 members / 4558 chars**；冻结账本 dead 208→**207**、条目 212→**211**、self-only 72→**71**、refs 1386→**1387**。FROZEN2800 已按门禁指定流程回填（跑 `node tests/export-contract.js`，产物逐字写回），账本跑 `node tests/dead-export-gate.js --update` 同步。
- **自纠（4 轮）**：首版 `parseMonologue` 对任意正文都尝试 `extractJson`，导致「我觉得 {"monologue":"不该被抽走"} 只是想法」这类正文被抽成 `不该被抽走`——已收窄为**仅整段以 `{`/`[` 开头**才取 JSON；回填 FROZEN2800 后漏改 4 处 `=== 208`、2 处分布计数与 v2.43.0 段的规模硬编码，逐一定位后同步；v2.43.0 段原钉 `members= 360 chars= 4546` 属历史段硬编码，改为常量比对并留痕原因。
- **影响范围**：`actors/monologue.js`（提示词 + `parseMonologue` + 调用去 `json:true`）/ `tests/run.js`（v2.44.0 段 +14 断言、8 处版本锚点、FROZEN2800 与账本计数回填）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（三源 2.44.0 + `--update` 同步）/ `README.md`
- **门禁与验证**：全量回归 **4559 / 失败 0**（v2.43.0 基线 4546，**+13 净增**：v2.44.0 段 14 条新断言，v2.43.0 段规模断言由一条拆为两条口径不变后的净差）；dead-export-gate 绿（dead 207 / uiDead 4 / dataOnly 106，`--update` 已同步）；ui-gate 独立跑 53/0；ui-wire-audit 9/0；field-liveness-gate 绿；inventory 悬空 0；export-contract 60 ns / 361 members / 4558 chars。

### R28 · 2026-09-22 · v2.45.0 交付（缝合 Awene cultivation-rule-router：世界书条目按需路由）

- **做了什么**：对照 `Awene/cultivation-rule-router`，只缝两处机制——**条目按需激活**（发送前由 flash 副模型判定本回合哪些常驻条目该上场，未命中者在本次扫描里不进注入）与**结果缓存**（同一输入复用判定，不重复调用副模型）。上游其余的界面与配置面不缝。
- **为什么值得缝**：常驻条目越多，上下文里躺着的死设定越厚；模型自己无法「选择性忽略」，只能由外壳替它筛。这是纯机制收益（少 token、少无关约束），与用户的界面偏好无关。
- **为什么其余不缝 / 刻意改**：① 上游失败策略分档，最终超时会**中止整个生成任务**——本仓改为**一律降级为「本回合不隐藏」**（世界引擎的注入失败不该让玩家发不出这句话），且降级必留痕（`routeFailure` + `lastFailure()`）。② 上游挂 `WORLDINFO_ENTRIES_LOADED` 事件、克隆条目后置 `disable`；本仓改走自己的**按聊天覆写表**（`worldbook.getOverrides/saveSelection` 的 `'off'`），因为直接改宿主条目对象会绕过 store 的写入台账，属静默失效面。③ 边界如实锁进断言：本路由**只约束 WorldAxis 自己的 `buildPromptSection` 扫描，不改宿主那一次原生扫描**。
- **改法**：新增 `engines/entry-router.js`（234→260 行，命名空间 `WA.entryRouter`：`listCandidates / setCandidate / removeCandidate / clearCandidates / isPassive / normalizeEnabled / expandLinks / plan / applyPlan / clearCache / lastFailure / lastRoute / recentMessages` + `ROUTE_SYS / ROUTE_TIMEOUT_MS=30000 / MAX_CANDIDATES=60`）。候选须有启用条件（无条件的条目不参与路由）；被 `links` 指向者为**被动条目**、不能独立开启；`normalizeEnabled` 把字符串 / 嵌套对象 / 不存在的 id 一律过滤到合法候选；`expandLinks` 做 A→B 关联展开；缓存上限 `CACHE_MAX=20`；`applyPlan` 只写 `off` 覆写、不动勾选集，并在写前清掉上一轮 `off`。新增 before 链节点 `engines.entryRouter`（order 60，落在 monologue 之后）。装载位置在 `engines/worldbook.js` 之后（读 `getOverrides/getSelectedIds/saveSelection`）。
- **判据 +44**（`tests/run.js` v2.45.0 段）：静态面（引擎内无 `throw`、三常量在位、装载链在 worldbook 之后）；候选面（无条件不入表 / 被动判定）；归一化三形态（数组 / `{enabled}` / 布尔对象）；关联展开；**通道未配置 = 不介入（不是失败）**；**副模型失败 = 降级不隐藏 + 留痕 + 不落覆写**；成功面（命中集 / 隐藏集 / 缓存复用）；覆写面（只写 `off`、勾选集不变、上轮 `off` 不残留）；**失败沿用**（同一输入不重复烧副模型）；节点注册面；边界锁（覆写表只作用于 `buildPromptSection`）。
- **自纠**：初版 `plan()` 在副本模型失败后未记 `key`，导致同一输入会重烧一次副模型——补 `routeFailure.key` 并加「沿用降级」分支（附注释说明：若哪天改回中止语义，此处必须一起改）；一次编辑误删成功路径的 `return`，当场读回并补上；mock 无 `__pushApiFail`，失败注入改走 `__fetchResponses.push({ok:false,...})`；「成功路径」用例先 `clearCache()` 以免被上一条失败沿用挡住。
- **影响范围**：新增 `engines/entry-router.js`；改 `index.js`（LOAD_ORDER + VERSION 2.45.0）/ `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ `tests/run.js`（v2.45.0 段 +27 断言、LOAD 挂载引擎）/ README / ITERATION_LOG。
**门禁与验证（已实跑）**：此前多轮记录的「终端不可用」经 `terminal_getscreen` 复核为**误判**——`git diff` 进了 less 分页器把会话阻塞住，工具侧因此误报超时；发 `q` 退出后终端即恢复（`node v24.18.0`）。恢复后实跑：全量回归 **4597 / 失败 0**（v2.44.0 基线 4559，**+38 净增**）；dead-export-gate 绿（dead **205** / uiDead 4 / dataOnly 109）；ui-gate 53/0；ui-wire-audit 9/0；field-liveness-gate 绿；inventory 悬空 0；export-contract **61 ns / 374 members / 4731 chars**（FROZEN2800 按产物逐字回填，`--update` 已同步账本）。
- **接线面（本版真问题）**：13 个引擎导出起初在死子面账本里全是 `self-only`（refs=0）——测试用 `const R = WA.entryRouter` **别名**引用，而账本按 `WA.ns.mem` 正则计引用，两侧都数不到 ⇒ dead 207→218。按本仓口径「导出即需有消费方」，**不改账本去迁就、而是接上真实消费方**：注入页新增「条目按需路由」区块 + `UI_BINDINGS` 登记 8 个控件 id（dead 218→205）；`normalizeEnabled` / `expandLinks` 属纯内部步骤（过度导出），**从导出面摘除**（导出 13→11，账本 `test-only` 134→132、`members` 723→721），对应的两组断言改为**经 `plan` 的端到端行为面**覆盖（合法数组 / 伪装对象 / 夹带非法 id 与被动项三形态），不直调内部步骤。
- **测试基建缺陷（顺带修）**：mock 的 `__fetchResponses` 是**全局共享队列**，缓存命中路径下 `__pushApiJson` 的响应根本不被消费，会留给下一个 `plan` 当成功响应；实测表现为「失败用例拿到成功响应」「`applyPlan` 撞上残留的 500」。修法：v2.45.0 段每处网络调用前显式清空队列（6 处）。这与产品代码无关，是断言污染。
- **失败策略的一处自纠**：原实现的「失败沿用上轮降级」会让**一次瞬时失败把同一个输入永久钉在降级态**（换输入才恢复）；判定其代价高于多烧一次副模型，改为**失败只留痕、不记忆**，断言随之改为「恢复后同一输入重新判定」。



### R29 · 2026-09-22 · v2.46.0 交付（万花筒·第三十一面：变量驱动条款——世界状态 → 派生量 → 按变量值确定性注入正文）

- **做了什么**：新增 `engines/kaleidoscope.js`（502 行，命名空间 `WA.kaleidoscope`），把「世界状态里的数值」变成可写成条款的注入：**派生量**（`map` 取值→标签 / `range` 取值→0..100 归一 / `formula` 四则表达式可引用其它派生量）+ **条件注入规则**（每条带 `when`，命中才拼进注入块）。before 链新增节点 `kaleidoscope.inject`（order 22，落在 enemies(19) 之后、proactive(25) 与 entryRouter(60) 之前）。
- **为什么**：此前注入内容全是「文案模板」——写什么就注什么，没有任何「按世界状态取值决定要不要注入、注入什么」的通路；想让「声望低于 30 就提醒模型玩家处境」只能靠模型自己读状态，等于没有约束。这是纯机制收益（少 token、少死设定），与界面偏好无关。
- **三条硬纪律（写进断言）**：① **无 `eval` / 无 `new Function`**——自写 tokenizer + 递归下降求值；这条设计声明本身留在源码注释里并被断言留痕（`indexOf(&#39;无 eval / 无 new Function&#39;) > 0`），真代码面判据走 `inventory.codeFace`（注释里的字面量不算命中，避免「写进注释就当成已遵守」）。② **纯只读**——只在 `store.get()` 快照上遍历，回归以 `JSON.stringify(store.get())` 求值前后<b>逐字相等</b>坐实无副作用。③ **三态如实**——`ok` / `missing`（路径不存在）/ `invalid`（键在、值算不出来）严格分离，绝不把「算不出来」伪装成「不存在」。
- **raw 与 value 的分工（本版最容易写错的一处）**：`map` / `range` 同时给出 `raw`（原始取值）与 `value`（显示值：map 给标签、range 给 0..100 归一），**`formula` 引用其它派生量时走 `raw`**——按 value 算会把「已钳到 100」这个**显示口径**当成数学真值。回归以 `双倍 = $轮次百分比 * 2 = 198`（raw 99 × 2，而非 value 100 × 2）把这条分工钉死；同时补断言「map 的 raw 是数值，参与算术合法」——锁住「标签用于成文、raw 用于继续算」的分工。
- **自纠：本轮发现的真实引擎缺陷（中文 id 写进去读不出来）**。首版 `$` 引用名正则限定 ASCII（`/[\w\-.]+/`），而派生量 id 是**用户起的名字**（面板示例就写着「声望档」）——中文 id 能写进列表、用 `$` 却永远取不到，报 `unknown-derive`，用户看到的是「明明在列表里却说它不存在」。这是「功能级失效」的变体：**能力存在、路径通、但输入被静默排除**。三步修：
  · ① 新增常量 `REF_STOP = " \t\n\r+-*/()&lt;&gt;=!,"`，引用名从「匹配 ASCII 字符类」改为「**读至任一终止字符**」，允许中文等非 ASCII；
  · ② 占位符插值正则 `/\{([A-Za-z0-9_\-]+)\}/g` → `/\{([^{}]+)\}/g`，使 `{沪上}` 这类中文 id 也能插值；
  · ③ 新增 `idProblem(id)`（非空、不含空白与花括号），`setDerive` 与 `setRule` **共用**——id 是**双向契约**（`$id` 引用与 `{id}` 占位符两种写法都要匹配得上），含空格的 id 写进去能存但两种写法都取不出来，属「写进去读不出来」，写入即拒收并说明原因。
  代价是 `$a-1` 必须读作减法（`-` 是终止字符），故断言直接写成「`$沪上-1` 是减法」——**把界限写死在断言里**，谁把 `-` 从 `REF_STOP` 拿掉，这里立刻红灯。（中间出现一次自纠：初版该断言期望 `unknown-derive`，与引擎新行为冲突，改为期望可算并加注释说明意图。）
- **失败策略与降级**：任何异常 → 本回合不注入 + `lastFailure()` 留痕（与 v2.45.0 同一裁决：世界引擎的注入失败不该让玩家发不出这句话）；**无命中返回空串**——0 token，条目根本不进 `ctx.injections`（回归以「清空后不再进」坐实）。
- **判据 +89**（v2.45.0 基线 4597 → **4686**）：静态面（真代码面零 `eval` / 零 `new Function`、三算子枚举、三上限常量、引擎内无 `throw`、装载链在 store 之后）；三态分离面（真不存在路径落 `missing`；键存在但值不可算落 `invalid` 且 `reason=not-a-number`，**不落** `missing`）；公式面十类错误具名（`div-zero` / `unknown-derive` / `trailing-token` / `unbalanced-paren` / `bad-word` / `bad-char` / `bad-number` / `not-a-number` / `cycle` / `bad-id`）；条件注入面（`order` 升序、空 `when` 恒真、**条件语法错误该条具名跳过而非整块失败**、空 text 拒收、空 id 拒收、未知算子拒收、map 缺 path 拒收）；中文 id 全组（`$沪上 * 2` 可算 / `$沪上 + 1` 链式可引用 / `$沪上-1` 是减法 / `$沪上 - 1` 与 `($沪上)+1` 同义 / 含空格 id 落 `bad-id` / `{沪上}` 可插值为 `7`）；只读无副作用；确定性（两次 `buildBlock()` 逐字相等）；上限面（60 条规则压到 `MAX_RULES`）；诊断出口三件（`snapshot` / `lastEval` / `lastFailure`）；工作流节点面；端到端（跑一次 before 链产出 `source=&#39;变量驱动&#39; position=&#39;after_last_user&#39; depth=3` 的注入项，清空后不再进）；接线面（断言 `ui/panel.js` 逐字含 16 个 `WA.kaleidoscope.xxx`）。
- **接线面**：16 个导出**全部**在 `ui/panel.js` 有**直写**消费（注入页新增「变量驱动条款」区块：派生量列表 / 规则列表 / 三态计数 / 降级留痕 / 未解析占位符提示，11 个 `wa-ka-*` 控件 + 7 个处理器），并登记进 `tool-diag.UI_BINDINGS` 的 inject 组——v2.45.0 的 `entryRouter` 踩过「测试侧**别名**引用（`const R = WA.entryRouter`）在账本正则下两侧都数不到 ⇒ dead 207→218」的坑，本版一开始就走直写，死子面 **205 保持不变**（16 个导出零死导出）。渲染顺序上踩实了 v2.21.0 的同一教训：**先 `renderBody`（会替换整个 body）再 `setOut`**，否则回话写在重绘前会被自己擦掉。
- **影响范围**：新增 `engines/kaleidoscope.js`；改 `index.js`（VERSION + LOAD_ORDER）/ `manifest.json` / `engines/tool-diag.js`（MODULE_EXPORTS + UI_BINDINGS）/ `ui/panel.js`（渲染 +49 行 / 绑定 +52 行）/ `tests/run.js`（+173 行段、LOAD、8 处版本锚点、4 处 inventory 锚点、`FROZEN2800`、`EC2430`）/ `tests/dead-export-ledger.json`（`--update` 同步）/ README。
- **自纠（操作层，均为真实踩到）**：① 长单行（`tool-diag.js` 的 `MODULE_EXPORTS` 240 余字符行）两三次 `edit_file` 匹配失败，改走「落盘 `.py` 脚本 + 锚点 `count()===1` 校验 + `ast.parse`」；② `LOAD` 数组首轮 Python 替换因 OLD 与另一分支重叠而**复制**该条目，二轮用精确去重模式修正；③ 终端偶发 `Current ROOT unavailable`（三次）重试即恢复；④ 回归首轮 exit=2 暴露五类问题（注释里的字面量被朴素 `indexOf` 命中 / 探针路径取到了真字段 / `档位` 派生没落进 `invalid` 直接崩栈 / 出口面契约漂移需回填 / 第二轮的 `bad-ref`）——逐条定位后全绿，其中「探针必须打在真不存在的路径上」是判据自身的设计错误（不是产品缺陷）。
- **门禁与验证（已实跑）**：全量回归 **4686 / 失败 0**（v2.45.0 基线 4597，**+89 净增**）；dead-export-gate 绿（dead **205** / uiDead 4 / dataOnly 109，`--update` 已同步 209 条证据）；ui-gate **53/0**；ui-wire-audit **9/0**；field-liveness-gate 绿（骨架一级键 20 个 / 产品文件 69 个）；inventory 四类悬空 0（refs **1431** / 命名空间 **68** / 成员 **737**）；export-contract **62 ns / 390 members / 4908 chars**（`FROZEN2800` 与 `EC2430` 按产物逐字回填）。

### R30 · 2026-09-22 · v2.47.0 交付（注入项去向可答·第三十二面：三张账 → 按输入位置的一本账）

- **做了什么**：把注入面的「三张互不相通的账」收成**一本按输入位置的账**。`render/inject.js` 在拼完主块后逐项记 `trace`（去向五态 `slot` / `main` / `folded` / `dropped` / `empty`，`folded` 带 `foldedFrom`/`foldedTo`/`reason`，`dropped` 带 `reason`/`tokens`，`slot` 带槽位键），并算 `traceSummary` 合计，两者一并写入 `store.lastInjection`；注入页新增「注入项去向」区块（逐项列去向 + 五态合计 + 与候选项数**对账**，数不上即显式告警）。沿用 `applyInjections` 的单一落地入口，未改任何路由/预算语义。
- **为什么**：此前「正文里少了那条约束」在界面上**无法回答**——预算账单只按 `source` **名**记折叠/丢弃、槽位快照只有 `slot` 与字数、主块是一个拼好的字符串，三者之间没有一条线能连起「第 i 个候选项」与「它的落点」。这不是界面偏好问题，而是**可观测性缺口**：排查时只能猜，而猜错方向比不知道更贵（见缺陷②的实测后果）。性质与 v2.31.0（引用面→渲染面）、v2.33.0（能力面→呈现面）同族——都是「让已经存在的东西可被回答」。
- **顺路修掉的 5 处真实缺陷（全部实测坐实，非推理）**：
  · ① **同名串味 + 掉出项复活**（`engines/inject-budget.js`）：`apply` 用 `bySource[source]` / `keepSet[source]` 回填，而 `source` 是**用户可见名、不保证唯一**（真实注入面里「连续性约束」「演化状态」都是固定名，同轮可多项）。实测：两条同名各 400t、`budget=120` ⇒ 账单 `kept=1`/`dropped=1`（账是对的），`apply` 却出 **2 项且正文逐字相同**（被丢弃的那条又回来了，两条共用同一份折叠文本）。修法：`plan` 每项带 `id`（= 输入位置）、回填 `inputCount`；`apply` 按 `id` 回填，输出带 `orig`；`inputCount !== arr.length` 时**退回按名语义**（不把位置对账用在错的计划上）。
  · ② **归因颠倒**（`engines/inject-channel.js` + `engines/inject-slot-audit.js`）：`applySlots` 只回 `{applied,total,errors}`，`audit` 用 `perSlot.slice(0, applied)` 假定「前 N 个成功」。实测：第 1 槽 `WorldAxis:after_last_user` 抛异常、第 2 槽 `WorldAxis:in_chat` 成功 ⇒ 报后者「计划了但未落地」——**把成功的记成失败、把真出错的漏掉**，用户去查一个根本没问题的槽位。修法：`applySlots` 逐个记成功名单 `landed`（`setExt` 非函数时 `landed: []`）；`snapshotSlots(slots, applied)` 第二参兼容**数字（旧）/ 对象（新）**，只给计数时 `landed = null`（**不猜**）；`audit` 有名单则逐项核对报 `slot.orphan`，无名单则报新错误码 **`slot.orphanUnknown`**（明说「有 N 个未落地，但不知道是哪几个」）。同一消息里**宁可少报，不可误导**。
  · ③ **内容指纹误伤**（`render/inject.js`）：主块过滤除 position 判定外还有 `routedContents.indexOf(i.content) < 0` 这条「双保险」，而槽位只收带 `position` 的项 ⇒ 任何**不带 position** 的项只要正文恰好等于某槽位文本的一行，就被从主块**静默剔除**（注入少一条，槽位快照与预算账单里都查不到它）。修法：删掉整套指纹判据，只留「该项声明的 position 对应槽位确实被接管」这一条。
  · ④ **去向不可答**（缺口而非报错）：即本版主题。
  · ⑤ **面板把数组当对象遍历**（`ui/panel.js`）：`perSlot` 的真实生产者 `snapshotSlots` 产出的是**数组**，面板写 `Object.keys(ps).forEach(...)` ⇒ 每个槽位渲染成「**0：0 项｜0 字符**」，用户看到的是「槽位一个项都没有」，**与快照事实相反**。修法：数组优先、旧对象形状兼容，并显示每槽的源与项数。
  · 顺带补齐可答性：`planSlots` 每桶带 `items`（源身份），`snapshotSlots` 每槽带 `sources` / `itemCount`——此前「这条约束进了哪个槽位」在快照里**无迹可查**。
- **本轮自纠（真实踩到，非演练）**：去向账首版在**降级路径**上硬引用 `WA.injectChannel.SLOT_PREFIX`——测试删掉 `WA.injectChannel`（模拟通道不可用）后 `applyInjections` 直接 `TypeError`，注入整条链断在半途。修法：降级路径自己判通道在不在（`slotKey` 先算再判空），并把这个场景写成回归（「通道缺席时不抛」+「降级轮不谎称进槽位」）。这正是本仓的老主题：**新加的记账代码自己成了新的崩溃点**，所以记账段也必须走降级纪律。
- **判据 +67**（v2.46.0 基线 4686 → **4753**）：同名不串味 / 掉出项不复活（出路条数 == 账单保留数）/ `orig` 唯一且落在输入范围 / 计划长度不符退回按名（源名对不上则不出项）/ `landed` 归因指向**真出错**项且成功项不出现在任何 issue / 名单缺席走 `orphanUnknown` 且**不报** `slot.orphan` / 指纹靶子（同文无 position 项仍进主块）/ `trace.length` == 五态合计 / 折叠丢弃两账对齐 / （负控制）篡改五态后合计不等 ⇒ 判据可现形 / 降级不抛且去向如实标 `main` / 静态面（`routedContents` 已摘除、`traceSummary` 已落、`landed.push`、`orphanUnknown`、`Array.isArray(apObj.landed)`）/ 接线面（面板消费 `traceSummary`、渲染「注入项去向」、`Array.isArray(ps) ? ps`、旧 `Object.keys(ps).forEach` 已消失）/ 真实 mini-DOM 面板面（数组 perSlot 渲染真项数、不出现「0：0 项」、每槽源列表、五态逐项、无告警、（负控制）篡改后告警、旧对象形状兼容、无 trace 旧快照如实说「未记录去向」）。
- **自纠（探针层，4 处期望失真——是我写错了，不是产品缺陷）**：① 「退回按名匹配」写成「不丢项」，实际语义是**源名对不上就一项都不出**（这才是旧语义的真实形状）；② `planSlots` **按 position 分桶**，3 项归 **2 桶**不是 3 桶（`applied/total` 期望改写为 1/2）；③ 「只给计数」的场景必须让计数**小于**计划数（2/2 不构成「不知道是哪几个」）；④ 预算设置的**真实路径**是 `backstage.setSettings`（写 `store.backstage.settings` 根本不读）——探针自身踩过一次「改了个没人读的地方还断言生效」的坑，与 v2.33.0「探针前提失真」同族：**判据的输入面必须与产品的真源同源**。
- **影响范围**：改 `engines/inject-budget.js` / `engines/inject-channel.js` / `engines/inject-slot-audit.js` / `render/inject.js` / `ui/panel.js` / `engines/tool-diag.js`（UI_BINDINGS 旁明写留痕，id 不变）/ `index.js`（VERSION）/ `manifest.json` / `tests/run.js`（+422 行 v2.47.0 段、旧断言按新语义收口、8 处版本锚点、4 处 refs 锚点）/ `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**未新增/删除任何导出成员** ⇒ 出口面契约与死子面不变。
- **门禁与验证（已实跑）**：全量回归 **4753 / 失败 0**（v2.46.0 基线 4686，**+67 净增**）；dead-export-gate 绿（dead **205** / uiDead 4 / dataOnly 109，元数据同源、证据可复算）；ui-gate **53/0**；ui-wire-audit **9/0**；field-liveness-gate 绿（骨架一级键 20 / 产品文件 69）；inventory 四类悬空 0（refs **1435** / 命名空间 **68** / 成员 **737**）；export-contract **62 ns / 390 members / 4908 chars**（逐字未变，`FROZEN2800` 与 `EC2430` 无需回填）。
### R31 · 2026-09-22 · v2.48.0 交付（部分成功可区分·第三十三面：把「部分成功」这条从未被区分的第三态从账里分出来）
- **做了什么**：把「槽位路由部分成功」这条**第三态**从账里分出来。<b>根因</b>是 `render/inject.js` 里那条自 v0.1.9 起就写在注释里的**原子语义**——`if (applied === slots.length) { 接管 } else { 只记错误 }`。它本意保守（避免「注入了但没标记」），代价却是把 `applied > 0 && < total`（一部分落地、一部分回退）**整体当成失败**。修法只需一句话：**有落地即接管**（`if (applied > 0)`），且 `routedKeys` 只收**真落地**的键位（`landedKeys.length ? landedKeys : slots.map(...)`）。但这一句话牵动四处：
  · ① **接管判定**：`applied > 0` 即接管，不再要求全成功。
  · ② **不重复注入**：接管后 `routedKeys` 里只有真落地的键位，失败的一路**不进**名单 ⇒ 它的内容仍并进主块（该回退的回退），真落地的一路**不再**并进主块（否则 `slot` 与 `main` 里各出现一次 ⇒ 白烧 token 且模型看到重复指令）。
  · ③ **幽灵注入断根**：`uninject` 的清理依据由 `slots.keys`（计划）改为**真落地键位优先**（`landedKeys || plannedKeys` 去重）。此前快照为 null 时一个槽位都清不掉 ⇒ 真落地槽位永不被清、残值持续注入后续每一轮。
  · ④ **结论不谎报**：`engines/inject-slot-audit.js` 不再对 null 快照反判 `consistent: true` 并谎称「未启用路由」；快照补 `planned`/`failed` 两字段（`failed` 从 `apObj.errors` 反推；`keys` 保留以免破坏既有读侧），并新增两条三数自洽不变式（`slot.unaccounted` / `slot.bothSides`）。
- **为什么**：v2.47.0 刚把「计划/落地」引进账里，本版立刻追问「那**部分成功**呢」——这才发现这条信息**从来没有消费者**。这不是界面偏好问题，而是**可观测性缺口**的又一面：失败被看见了，但「哪些成功、哪些回退、回退的有没有重复进主块」没人回答。性质与 v2.47.0（三张账 → 一本账）、v2.31.0（引用面→渲染面）同族。
- **本轮坐实并修掉的 5 处真实缺陷（全部实测，非推理）**：
  · ① **已成功落地的槽位内容仍被并进主块**（见上②）——同一段约束在 prompt 里出现两次。
  · ② **快照 `slots = null`**——「计划了哪些 / 哪些真落地」的证据被整段抹掉。
  · ③ **幽灵注入**（见上③）——真落地槽位永不被清。口径澄清（防后续误判）：有真名单时按名单**精确清理**（失败的一路从未落地，不在名单里**正是正确行为**）；只有名单缺席（旧快照无 `landed`）时才退回 `planned keys`（宁多清不可漏清，清未落地键位是空操作）。
  · ④ **audit 结论不实**——对 null 快照反判一致并谎称「未启用路由」，掩盖了同一个 `li` 里就在场的 `slotErrors`；无快照但有失败时报新错误码 **`slot.snapshotMissing`**。
  · ⑤ **消费链把结论吞掉**（两条）：`engines/tool-diag.js` 的 `secInject` 用 `if (!snap) return { hasSnapshot:false, status:'NOT_YET' }` **提前退出**——注入器快照与槽位证据是**两套独立子系统**（前者要一次真实发送才生成，后者上轮注入完就在场），于是「槽位部分失败（现场缺失）」在快照尚未生成时完全不可见；`ui/panel.js` 把 `!slots || !slots.count` 一律说成「上次注入无独立槽位（全部并入主块）」，把**现场缺失**说成**全部并入**，且只显示计划数、看不出有槽位被回退。修法：`secInject` 改三目（`const out = snap ? {...} : {...}`，`if (snap && snap.apiType === 'chat')`、`else if (snap)` 防 null 解引用），槽位对账前置条件从 `li.slots` 放宽到 `(li.slots || li.slotErrors)` 并带出 `slotAuditNote`；面板侧有失败就渲染「部分失败且未留快照」+ 受影响槽位名，有快照时摆出「**落地 M / 失败 N-M**」三数与「真落地：…」「已回退主块（不重复注入）：…」。
- **本轮自纠三项（真实踩到，非演练）**：① 探针 K1c 的**期望写成了修复前的缺陷形态**（断言 `landed === null`），而实测已是 `["WorldAxis:in_chat"]`——首跑唯一 FAIL 打印值恰是正确值，判据自身失真，改为断言修复后的正确期望并补 K1c2/K1c3 与**最核心的 K1e**（已落地槽位内容不再重复并进主块）；② 回归断言把「有名单精确清理 vs 无名单退回」**写反**（期望失败的一路也被清），改为 `< 0` 并补一段「旧快照无名单时退回 planned keys」场景；③ 归因计数**只改了文案侧没改条件侧**——`assert(dist2800['test-only'] === 132 ...)` 是与文案独立的第二处数字，改完文案仍红灯，第二轮才把条件侧一并更新（每处带唯一性守卫）。
- **第 5 处缺陷是探针 L 抓出来的，不是读代码读出来的**：探针 L（真实 mini-DOM 面板 + 诊断包 `secInject`）首跑 L11–L14 全 FAIL（`diag = {}`），落盘定位脚本显示 `secInject()` 返回 `{hasSnapshot:false, status:'NOT_YET'}` ⇒ 根因正是那句**提前退出**。这正是本仓「用可执行判据代替肉眼」的又一次实践。
- **判据 +50**（v2.47.0 基线 4753 → **4803**）：探针 K 18 项（部分失败三数在场 / 真落地名单 / 主块不含已落地槽位正文 / 撤销清得掉真落地槽位 / 通道缺席不报错 / 部分失败判不一致且 orphan 指向真出错项 / 负向自证三态 / 有失败无快照报 `slot.snapshotMissing` / 旧快照无名单报 `orphanUnknown`）；探针 L 15 项（无快照有失败 ⇒ 明说现场缺失 / 不再说成全部并入 / 列受影响槽位 / 真没启用保留原话术 / 三数在场 / 明示真落地与回退 / 全成功不出回退噪声 / 诊断包在无注入器快照时给出 `slotConsistent:false` / 无失败无槽位时不报不一致）；回归段 A–H 组共 54 处 `v2480:` 断言（三数在场 / 不重复注入 / 幽灵注入断根 / 结论不谎报 / 三数自洽不变式 / 消费端诊断包 / 真实 mini-DOM 面板四场景 / 静态面十项）。
- **影响范围**：改 `render/inject.js` / `engines/inject-slot-audit.js` / `engines/tool-diag.js` / `ui/panel.js` / `tests/run.js`（新增 v2.48.0 段 +222 行，起始第 17290 行）；`index.js`（VERSION）/ `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）三源同步；`git diff --stat` = **5 文件、341 insertions(+)/20 deletions(-)**。**未新增/删除任何导出成员** ⇒ 出口面契约与死子面不变。
- **门禁与验证（已实跑）**：全量回归 **4803 / 失败 0**（v2.47.0 基线 4753，**+50 净增**）；dead-export-gate 绿（dead **205** / uiDead 4 / dataOnly 109 / 仅测试 **129**，`--update` 已复核 209 条证据，归因分布 test-only 129 / 其余 76）；ui-gate **53/0**；ui-wire-audit **9/0**；field-liveness-gate 绿（骨架一级键 20 / 产品文件 69，规则② 写侧越界 1 处 `ui/panel.js::innerHTML` 为长期白名单）；inventory 四类悬空 0（refs **1435** / 命名空间 **68** / 成员 **737**）；export-contract **62 ns / 390 members / 4908 chars**（逐字未变，`FROZEN2800` 与 `EC2430` 无需回填）。本版唯一的门禁数字漂移是 `toolDiag.secInject` 因新增**测试侧引用**使归因 `self-only → test-only`（128→129 / 71→70），四处计数锚点已按实测回填。
### R32 · 2026-09-22 · v2.49.0 交付（主块账·第三十四面：把注入链上唯一没有独立账的一环补上）
- **做了什么**：给<b>主块本身</b>补上独立账。<code>render/inject.js</code> 每轮写 <code>lastInjection.len</code> / <code>lastInjection.sources</code>，这两个字段自 v0.2.1 起<b>全库零读点</b>；面板「注入落地」区块展示的是<b>注入器快照</b>（要一次真实发送才生成），诊断包读的是<b>宿主 prompt 全长</b>（不是我们拼的那块）。于是「上一轮我们实际注入了多少字、由哪些源拼成」一个字都答不出来，「<b>主块 0 字</b>」也就无法区分两种局面：<b>全走槽位（约束已生效）</b>与<b>确实无可注入内容（什么都没进 prompt）</b>——两者在旧账上完全同形（<code>len=0</code> / <code>sources=[]</code> / <code>injected=true</code>，因为 <code>slotCount&gt;0</code> 也算注入过）。修法：① 快照补 <code>mainCount</code>（主块项数）；② <code>engines/inject-slot-audit.js</code> 里那段<b>空分支</b>落实为真检查 <code>slot.mainDuplicate</code>；③ 消费端两处收口（诊断包带出 <code>out.main</code> + 摘要分说两种局面；面板新增「主块账」区块）。
- **为什么**：v2.47.0 把注入项去向收成一本账、v2.48.0 把「部分成功」从账里分出来——两版都在做「让已经存在的证据可被回答」。本版发现这条链上还剩最后一环没有账：预算账单记「折叠/丢弃」、槽位快照记「哪几路落地」、去向账记「每一项去哪」，而<b>主块本身</b>（我们实际拼出来的那块文本）无人可答。这是第三十四面，与第三十二/三十三面同族。
- **本版坐实的两处缺陷（都是「声明了却从未存在」型，非崩溃型）**：
  · ① **主块零读点**：<code>len</code> / <code>sources</code> 写在快照里、从来没人读。活字段扫描看得见「有写点」，看不见「无读点」，所以此前历轮扫描都没抓到它。
  · ② **空分支**（<code>inject-slot-audit.js</code> 原第 138–141 行）：读 <code>li.sources</code>、注释写「给出提示（信息级）」、<b>函数体一行都没有</b>。比零读点更隐蔽——读点在场（扫描器判定「活着」）、注释齐全、结论恒为零。它本该报的正是<b>重复注入</b>：同一来源既走独立槽位又并进主块 ⇒ 同一段约束在 prompt 里出现两次，白烧 token 且模型看到重复指令。
- **修法口径（写进代码注释，防后续误判）**：重复注入判定<b>只查真落地的槽位</b>——部分失败时失败的一路回退主块是<b>正确行为</b>，不得报（这是 v2.48.0 刚落下的第三条账的直接后果）；源名单缺席（旧快照无 <code>landed</code>）时<b>不猜</b>，不报。已知精度边界如实记在错误文案里：本检查按<b>源名</b>比对，而源名是用户可见名、不保证唯一（v2.47.0 修过同族的「同名串味」），归因粒度到源名为止，同名不同项时提示读者对照去向账逐项核。
- **本轮自纠两项（真实踩到，非演练）**：① 探针 N 的 C4 场景<b>输入面与命题不同源</b>——我把「成功槽位的源」与「失败槽位的源」写成了同一个名字，于是主块里的那个源无法归因到「成功项」还是「失败回退项」，报与不报都失去意义（断言等于没测）；改为源分得开（成功槽位带「连续性约束」不在主块、失败槽位带「章节」才在主块）后判据才真正成立。② 回归段 F3/F4 用错了出口——<code>toolDiag.summaryText()</code> 只回<b>一行汇总</b>（「可用但需留意：N 错误 / M 警告」），逐条 issue 在 <code>flatten()</code> 里；改用 <code>flatten()</code> 取 <code>injectMain</code> 条目后通过，并补 F4b 负向（无槽位落地时不得说成「全走槽位」）。
- **负控制（本版最核心的一条判据自证）**：在<b>真源码副本</b>上摘掉「只查真落地槽位」这一守卫（锚点 <code>if (landedSet.indexOf(p.slot) &lt; 0) return;</code> 恰中 1 次），独立装载破坏副本并重跑与 C4 <b>完全相同</b>的场景：修复版不报、破坏版<b>必须误报</b>。以此证明判据可现形、不是恒真——这是本仓「负控制三形」纪律的落实（真源码破坏 → 加载破坏副本 → 在副本上重跑同款真判据）。
- **判据 +27**（v2.48.0 基线 4803 → <b>4830</b>）：A 组写侧 2 项（mainCount 落地、len/sources 写点未被破坏）；B 组空分支落实 3 项（错误码在位、死注释已摘、精度边界进文案）；C 组真跑 audit 6 项（真落地+同源必报 / 级别 error / 指明来源 / 失败回退不报 / 名单缺席不报 / 源名不重合不报）；D 组负控制 3 项（锚点唯一 / 破坏发生 / 破坏后误报）；E 组接线 7 项（诊断包 main / injectMain / injectMainDuplicate / 两种局面分说、面板主块账 / 真读 len+sources / 来源未登记告警）；F 组诊断包真跑 6 项（main 在场 / 空来源如实给空数组 / 分说两种局面 / 负向不得混淆）。
- **影响范围**：改 <code>render/inject.js</code>（+mainCount）/ <code>engines/inject-slot-audit.js</code>（空分支落实 +41 行）/ <code>engines/tool-diag.js</code>（main 账 + 摘要条目）/ <code>ui/panel.js</code>（主块账区块）/ <code>tests/run.js</code>（新增 v2.49.0 段 +142 行、四处 refs 锚点 1435→1440）；<code>index.js</code>（VERSION）/ <code>manifest.json</code> / <code>tests/dead-export-ledger.json</code>（version + <code>_note</code>）三源同步。**未新增/删除任何导出成员** ⇒ 出口面契约与死子面不变（dead 205 / uiDead 4 / dataOnly 109 逐字未变）。
- **门禁与验证（已实跑）**：全量回归 <b>4830 / 失败 0</b>（v2.48.0 基线 4803，+27 净增）；dead-export-gate 绿（dead 205 / uiDead 4 / 归因分布 test-only 129 / 其余 76，<code>--update</code> 已复核 209 条证据）；ui-gate <b>53/0</b>；ui-wire-audit <b>9/0</b>；field-liveness-gate 绿（规则① denylist 命中与基线逐字一致：<code>meta.round-read</code> 1 文件 / <code>state.round-read</code> 3 文件；规则② 写侧越界 1 处 <code>ui/panel.js::innerHTML</code> 为长期白名单；规则③ 读侧越界 0）；inventory 四类悬空 0（<b>refs 1440</b> / 命名空间 68 / 成员 737，refs 由 1435 增至 1440 是本版新增 5 处静态引用所致，四处锚点已按实测回填）；export-contract <b>62 ns / 390 members / 4908 chars</b>（逐字未变，<code>FROZEN2800</code> 与 <code>EC2430</code> 无需回填）。

### R33 · 2026-09-22 · v2.50.0 交付（宿主两侧 + 台账时间轴·第三十五面：把「无从得知」与「确实没有」分开）
- **做了什么**：落三笔只读账并接上消费端。
  · ① <code>engines/host-wb-trace.js</code>（265 行）宿主世界书激活账：四态 <code>unsupported/awaiting/ok/shape-unknown</code>，
    <code>normalizePayload</code> <b>不猜载荷形状</b>（保留键名清单），<code>crossCheck</code> 报 <code>same-text</code>/<code>same-name</code> 重叠。
  · ② <code>engines/ledger-timeline.js</code>（228 行）台账时间轴：环形窗口 <code>MAX_STEPS=12</code>，段机制区分持续失败与偶发一次。
  · ③ <code>engines/floor-changes.js</code>（246 行）楼层变更联动账：<code>sweep</code> 扫描 L0~L3/smallSummaries/foreshadows/entityMemory/chronicle，
    <code>guardReconcile</code> 与 <code>settleGuard</code> 三态对账，<code>plan</code> 只出 <code>needConfirm</code> 且 <code>executable=false</code>。
- **为什么**：两件事此前<b>完全不可观测</b>——宿主自己扫描注入了哪几条（<code>WORLD_INFO_ACTIVATED</code> 全库零订阅；
  <code>worldbook.js</code> 读的是条目定义不是本轮实际注入），以及删楼/改楼后派生数据的引用一致性
  （<code>timeline.auditRefs</code> 早就算得出 <code>missing</code>/<code>changed</code>、消费端也有两条 warn——差的是触发点）。
  口径：<b>「无从得知」不等于「确实没有」</b>（<code>unsupported</code> 是环境事实，面板必须说「不可观测」）。
- **本版坐实的真缺陷（五处）**：
  · ① <code>ledger-timeline.note</code> 首版同态直接 <code>return</code> ⇒ <code>streak</code> 恒为 1、<code>stalled</code> 永不成立，与设计目标正相反（改为末段 <code>reps++</code>）。
  · ② <code>host-wb-trace.crossCheck</code> 首版逐项判「宿主无正文」⇒ 把「宿主机给了正文但这一条未匹配」误报为<b>不可比</b>（改为判宿主整批）。
  · ③ <code>floor-changes.sweep</code> 缺失项标签只兜 <code>title || summary</code>，漏了摘要条目实际正文键 <code>s</code>（用户只能看到 <code>l2#0</code> 这类下标）。
  · ④ <code>reset</code> 首版把 <code>unsupported</code> 降级回 <code>awaiting</code> ⇒ 清一次窗口就抹掉「宿主根本不给这个事件」的<b>会话级结论</b>。
  · ⑤ <b>两处同源</b> <code>markSubscribed</code> 写作 <code>else if (!__subscribed)</code> ⇒「<b>曾经订阅成功过</b>」永久豁免后续 <code>unsupported</code>：
    宿主旧版本/重装后不再派发事件时，面板显示「已订阅，本轮尚未派发」，<b>把能力缺失伪装成还没轮到</b>（host-wb-trace / floor-changes 各一份，两处都修，G3/G4 各打真源码破坏自证）。
- **顺路坐实 v2.43.0 家族的最后一只漏网**：<code>tests/run.js</code> 出口面契约块<b>自带遍历器</b>（只排 <code>tests/</code>），
  而生成器委托 <code>productFiles()</code>（排 <code>tests/+tools/</code>）——两套「产品面」定义。后果不是「多几个名字」：
  本版新增块文件对三新节的引用被算成产品跨文件依赖，门禁报「接口面漂移」，<b>实为判据扫错文件面</b>。
  已委托单一真源；新增 <b>H 组成类锁</b>（H1/H2 字面锁 + H3 旧遍历器负控制 + H4/H5 现扫描面自证）。
- **接上消费端（否则「记了没人看」，v2.49.0 同一种病）**：<code>interceptor</code> 真订阅三事件并在缺席时显式回报；
  <code>render/inject</code> 每轮真调 <code>crossCheck</code> / <code>probeDefault</code> 写入 <code>lastInjection.hostWb</code>；
  诊断包三节 + 三条 <code>flatten</code> 摘要行 + 四个 <code>UI_BINDINGS</code> 控件；面板三区块。
- **自纠一项（真实踩到）**：H 组首版只写进块文件、<b>没同步进 <code>tests/run.js</code></b>（且块内用了未声明的 <code>srcRun2500</code>），
  首跑即 <code>ReferenceError</code> 暴露——补声明后同款判据才真跑起来（<b>「脚本里写了」不等于「跑起来了」</b>）。
- **负控制（本版最核心的自证）**：四组全部打在<b>真源码副本</b>上——G1 摘掉系统条目排除（<code>sysExcluded=0/count=2</code>）、
  G2 摘掉段机制（<code>streak=1/段数=3/stalled=false</code>）、G3/G4 把 <code>markSubscribed</code> 改回旧写法（<code>state</code> 停在 <code>awaiting</code>），
  每组同时断言<b>原版上同款判据仍成立</b>（双向自证，非恒真）；H3 证明旧遍历器确实射中 <code>tools/</code>。
- **判据 +93**（v2.49.0 基线 4830 → <b>4923</b>，失败 0）：A 装载链 3 / B 宿主四态 6 / C 时间轴段 6 / D 守卫对账 9 / 
  E 消费端 12 / F 诊断包真跑 8 / G 真源码破坏 16 / H 文件面成类锁 5，另含 30 项门禁与既有套件重算。
- **影响范围**：新增三引擎（共 739 行）；改 <code>core/interceptor.js</code> / <code>render/inject.js</code> / <code>engines/tool-diag.js</code> /
  <code>ui/panel.js</code> / <code>index.js</code> / <code>manifest.json</code> / <code>tests/run.js</code>（+396 行，起始第 17640 行附近）；
  <code>tests/dead-export-ledger.json</code> 重生成（dead 205→218、<code>version=2.50.0</code>、test-only 131）。
- **门禁与验证（已实跑）**：全量回归 <b>4923 / 失败 0</b>（v2.49.0 基线 4830，<b>+93 净增</b>）；
  <code>dead-export-gate</code> 绿（dead 218 / uiDead 4 / dataOnly 116→116 / 仅测试 131）；
  <code>export-contract</code> 逐字一致（ns 65 / members 406 / chars 5100）。

### R34 · 2026-09-22 · v2.51.0 交付（叙事工艺设置面·第三十六面：把「声明了消费口径却没有产生方」的那一环补上）
- **做了什么**：新建 <code>engines/style.js</code>（253 行）——叙事工艺设置面，并把它接进设置页、注入链、诊断包、体检器、守卫表与账本。
  · 七轴：<code>block</code>（总开关）/ <code>paragraphStyle</code> / <code>perspective</code> / <code>userPronoun</code> / <code>takeover</code> / <code>narrate</code> / <code>custom</code>；
    <code>DEFAULTS</code> 为总开关 <code>on</code> + 五轴全 <code>off</code> + 空附加段 ⇒ <b>默认零 token</b>（<code>buildBlock()</code> 返回空串）。
  · <code>setSettings(patch)</code> <b>整笔拒收</b>非法档位且<b>不写盘</b>（<code>{ok:false, reason:'bad-value', bad:[…]}</code>；非对象入参 <code>reason:'bad-patch'</code>）——
    杜绝「一半写进去、一半被丢掉」的中间态。
  · <code>buildBlock()</code> 是<b>唯一产出口</b>（唯一产生方 ⇒ 唯一可测点），末尾固定三态诚实兜底：
    <i>「不得在正文里提及这些约束本身；与角色设定、世界状态、玩家输入冲突时，以它们为准」</i>。
  · <code>effectiveSettings()</code> 只吐「非 off 且非空」的轴；<code>textCoverage()</code> 逐轴逐档数正文表字数（供<b>交叉校验</b>）；
    <code>styleStat()</code> 透出 values/labels/enabled/rejects/fallbacks/builds/emptyBuilds/lastLen 全部记账。
- **为什么**：<code>engines/rules.js</code> 的 <code>craft</code> 模块正文里早就写着「叙事工艺按设置面口径执行」——
  <b>但那个「设置面」全库不存在</b>：只有<b>声明</b>（口诀），没有<b>产生方</b>。这是本仓反复出现的那种病，
  只是这次病根在「口径文案」里：一句话把不存在的模块说成了既有事实。本面把这句话兑现成一个真的设置面。
- **接上消费端（否则「记了没人看」，v2.49.0/v2.50.0 同一种病）**：
  · <code>render/inject.js</code> 的 <code>SOURCES</code> 追加 <code>'style'</code>（<b>10 → 11 项</b>），并新增 <code>buildStyleBlock()</code> 取数口；
    在 <code>applyInjections</code> 里作为<b>独立注入项</b>加入（<b>不并入 <code>&lt;world_axis_state&gt;</code></b>）——
    并进去会让它从<b>预算裁决 / 去向账 / 快照 sources</b> 三项治理面上消失，且与它「绝不使用系统旁白」的呈现铁律矛盾。
  · <code>__REG.def.style = false</code>（<b>默认关</b>）：老用户凭空多出一段正文约束＝<b>静默行为变更</b>，不可接受。
  · <code>ui/settings.js</code> 新增 <code>wa-st-save</code> 保存出口：写失败<b>不得报成功</b>（复用同一处 <code>whyTxt</code>、明说「改动未落盘」），
    并<b>独有地回显注入可见性</b>——因为 style 源默认 false，「保存成功但正文没变」是本面最可能被问的问题。
  · <code>engines/tool-diag.js</code> 新增 <code>secStyle()</code>（判据含 <code>injectReady</code> 二道闸与 <code>uncovered</code> 覆盖度交叉校验）并入 <code>collect()</code>；
    <code>UI_BINDINGS</code> settings 组登记 <b>9 个</b> <code>wa-st-*</code> 控件（全部放 <code>ids</code> 层、<b>不放 <code>cond</code> 层</b>：
    style.js 是产品文件，它缺席本身就是断裂，不该被 cond 的「依赖态、缺失不判失败」掩盖）。
  · <code>engines/inspector-state.js</code> 新增 checker 12 <code>checkStyleCraft</code>（覆盖 <code>blocked/notInjected/rejects/fallbacks/emptyBuild/uncovered</code> 六类）。
  · <code>ui/panel.js</code> 把注入源中文名收口为<b>模块级单一真源 <code>VIS_NAMES</code></b>（<code>renderInject</code> 的局部表与 <code>renderDirector</code> 的内联字面量各一份 ⇒ 两处会各自漂移）。
- **本版坐实的两处真缺陷（都是「判据自己在骗人」，不是产品 bug）**：
  · ① <b>包装器缺 <code>return</code> ⇒ 证据蒸发，报告却写「确实没读」</b>。<code>contract-audit</code> 的委托字段判据（<code>persona_update</code>/<code>relation_update</code>）
    完全依赖 <code>applyFn</code> 的返回值，而测试基座传的是 <code>function (d, r, a) { WA.backstage.applyResult(d, r, a); }</code>——<b>没有 return</b>。
    于是这两个字段<b>恒判「未消费」</b>：先把「无法判定」说成「确实没读」，再据此报假警。
    双向修复：判据侧记 <code>retMissing</code> 并在 <code>audit</code> 里升级为 <code>delegated_evidence_missing</code> <b>error</b>（防下次静默复发），
    消费侧补 <code>return</code>；并实测确认<b>产品路径本来就是好的</b>（默认直取 <code>WA.backstage.applyResult</code>，<code>ret={"persona":1,"relation":1}</code>）。
    教训一句话：<b>判据拿不到证据时，必须报「判不了」，不能报「没有」</b>。
  · ② <b>参数化 id 让门禁失明</b>。<code>tests/run.js</code> H2 用源码正则 <code>/id="(wa-[a-z0-9\-]+)"/</code> 采集「渲染出的控件」，
    首版五个档位控件由 <code>row()</code> 变量拼 id（<code>id="${id}"</code>）⇒ 采集面看不见，而它们已写进守卫表 ⇒ 一登记就必报<b>僵尸条目</b>。
    反过来说，参数化会让这五个控件<b>永久游离在守卫之外</b>——恰是这道门禁要消灭的盲区。
    改为五行<b>字面量直写</b>（档位选项仍由 <code>CHOICES × CHOICE_LABELS</code> 生成），<code>row()</code> 删除。
- **负控制（本面最核心的自证）**：把 <code>const PERSP_TEXT = {</code> 改成空对象加载<b>破坏副本</b>——
  同款判据报警 <b>4 处</b>、<code>buildBlock</code> 对选中轴<b>不出话</b>（副本产物 0 字），而<b>原版上判据仍为真</b>（<code>uncovered=0</code>）。
  双向自证：判据不是恒真、也不是写死的。
- **行为验证**：新增 <code>tools/smoke_v2510_p4.js</code>，8 节 <b>54 项</b>断言全绿（<code>SMOKE-P4: pass=54 fail=0</code>）：
  默认态零 token（<code>buildBlock() === ''</code>）、五轴分别生效（142/214/262/362/420 字）、总开关与附加段（超长截到 <code>CUSTOM_MAX=500</code>）、
  非法档位整笔拒收且磁盘零变化（<code>rejects=3</code>）、读路径非法值回落（<code>fallbacks=6</code>、JSON 损坏不抛）、
  二道闸（<code>SOURCES</code> 11 项、<code>undeclared.length===0</code>）、覆盖度交叉校验与 checker 12 导出、负控制一组。
- **顺路修掉两处「旧口径」**：
  · <code>summaryText</code> 原先把 <code>total</code> 含 <code>info</code> ⇒ 干净存档（仅一条 <code>rules.newModules</code> 提示）被报成
    「⚠️ 发现 0 错误 / 0 警告 / 1 提示」——<b>先说自洽</b>才对（无 error/warn 一律先说自洽）。
  · <code>tests/ui-gate-sync.js</code> 的锚点指向了已删除的内联表；改为 <code>"clock: '世界时间'"</code>（带空格，逐字匹配真源码），
    否则回归会以 <code>drift: anchor not found</code> 直接中断——<b>门禁先崩，后面的判据一条都跑不到</b>。
- **判据数**：v2.50.0 基线 <b>4920</b> → <b>4928</b>（+8 净增；其中本面新增 54 项行为验证在 <code>smoke_v2510_p4</code> 独立脚本内，不并入 <code>run.js</code> 计数）。
- **影响范围（+5 行/-1 行量级）**：新增 <code>engines/style.js</code>（253 行）；改
  <code>ui/settings.js</code>（+73-1，保存出口与字面量 id）/ <code>engines/inspector-state.js</code>（+193-3，checker 12 + <code>summaryText</code> 修）/
  <code>engines/contract-audit.js</code>（+39-4，委托字段证据判据）/<code>engines/tool-diag.js</code>（+55-1，<code>secStyle</code> + 9 控件）/
  <code>render/inject.js</code>（+28-2，<code>SOURCES</code> + <code>buildStyleBlock</code> + 独立注入项）/ <code>ui/panel.js</code>（+13-2，<code>VIS_NAMES</code>）/
  <code>index.js</code>（+6-1，LOAD_ORDER 挂载 <code>engines/style.js</code>）/ <code>manifest.json</code>（version 2.50.0 → 2.51.0）/
  <code>tests/ui-gate-sync.js</code>（+6-1）/ <code>tests/run.js</code>（+42-39，含 11 处基线回填 + 冻结串逐字回填）；
  <code>tests/dead-export-ledger.json</code> 重生成（dead 218→<b>223</b>、<code>version=2.51.0</code>、<code>dataOnly</code> 116→122）。
- **门禁与验证（已实跑）**：全量回归 <b>4928 / 失败 0</b>；<code>dead-export-gate</code> 绿
  （dead 223 / uiDead 4 / dataOnly 122 / 仅测试 131，归因 <code>{unwired:7, self-only:85, test-only:135}</code>）；
  <code>export-contract</code> 逐字一致（ns 66 / members 426 / chars 5349，FROZEN2800 同步回填）；
  <code>node --check</code> 对 8 个改动文件全部 OK。
- **收口过程中踩到的两个坑（都属「判据自身的问题」，记下来防复发）**：
  · ① <b>裸锚点撞上「作为字符串的正则源码」</b>。<code>const FROZEN2800 = '…';</code> 在 <code>tests/run.js</code> 里命中 <b>2 处</b>——
    真声明，以及 v2410 块用来抽取它的正则字面量 <code>/const FROZEN2800 = '([\s\S]*?)';/</code>。
    解法：锚点加<b>行首缩进 + 行尾分号</b>（<code>^    …$</code> + <code>re.M</code>）⇒ 恰中 1 处。
    一般化：<b>本仓的测试文件里存着产品文件的源码文本</b>，任何锚点都可能同时命中「真代码」与「描述真代码的字符串」。
  · ② <b>「全部改完才写盘」结构下的一次失败会吞掉前面所有成功</b>。上一批补丁逐条 <code>replace</code> 但只在最后写盘，
    末条 <code>exit(2)</code> ⇒ 前面 5 条已 <code>ok</code> 的编辑<b>一条都没落进文件</b>（输出却显示 ok，极具迷惑性）。
    本批改为「逐条校验 → 全通过才 <code>os.replace</code>」，并加了<b>旧值残留复核</b>（写盘前扫一遍旧字面量）。
  · 附带：<code>node --check</code> 按<b>扩展名</b>判定模块格式，临时文件必须带 <code>.js</code> 后缀，否则
    <code>ERR_UNKNOWN_FILE_EXTENSION</code> 会伪装成「被检文件有语法错」——<b>报错指向的对象不是真正的出错对象</b>。

### R35 · 2026-09-22 · v2.52.0 交付（人物生活·第三十七面：把「持续目标」从人设描述变成可结算的承诺）
- **做了什么**：新建 <code>engines/life.js</code>——人物生活面：持续目标（goal）、五类关系承诺（promise / debt / secret / cooperation / boundary）、基础日程（schedule）与条件式行动决策。
  · 状态落 <code>people.&lt;id&gt;.life</code>，<b>绑定稳定人物 ID</b>（不按名字重查，防同名人串味）。
  · <code>decide()</code> 决策顺序固定：危机 → 资源缺失 → 高警戒 → 信任求助 → 条件推进 → 等待；<b>明确履约证据优先</b>于普通目标。
  · 日程冲突返回 <code>time-conflict</code>，不静默改期。
- **为什么**：全库此前只有「人物当前状态」（location/action/intent），<b>没有「人物欠着什么、打算什么时候做」</b>。于是 NPC 一旦离开正文镜头就静止——长局里人物退化成布景。
- **接上消费端**：<code>render/inject.js</code> 独立注入项；<code>ui/panel.js</code> 人物页四控件（加目标/加承诺/加日程/结算）；<code>engines/tool-diag.js</code> <code>secLife()</code>。
- **本版坐实的两处真缺陷**：
  · ① <b>开关误用点击时的旧状态</b>：控件用 <code>onclick</code> 读自身 checked，<code>renderBody()</code> 重绘后结果被清掉——改为 <code>onchange</code>，结果存 <code>panelEl.dataset.lifeOut</code> 跨重绘。
  · ② <b>时间走裸墙钟</b>：日程与结算直接用 <code>Date.now()</code>，绕过 <code>core/clock.js</code> 单一时间出口；统一改 <code>clockNow('ui.life')</code>。
- **验证**：<code>tests/life-v2520.js</code> 通过；全量回归 <b>4933 / 失败 0</b>；dead 223 / uiDead 4 / dataOnly 122；出口面 ns 67 / members 437 / chars 5460；清册面 refs 1572 / 命名空间 73 / 成员 815。
- **提交**：<code>8a0d632</code>（已推送 <code>origin/main</code>）。

### R36 · 2026-09-22 · v2.53.0 交付（因果与情报·第三十八面：可追溯事件链 + 带来源的人物认知）
- **做了什么**：新建 <code>engines/intel.js</code>——<b>不新建顶层世界状态</b>，复用既有容器：因果写 <code>currents.causes</code>，情报写 <code>people.&lt;id&gt;.knowledge.intel</code>。
  · <b>前因必须已存在</b>：须命中世界事实 / 记忆事实 / 演化事件 / 已有暗流之一，否则返回 <code>unknown-cause</code>——<b>禁止凭空生成原因</b>（这是「AI 编一个前因」最常见的入口）。
  · 情报四级 <code>rumor / report / witness / record</code>，置信度 25 / 55 / 75 / 90；<b>低于 75 保持 <code>suspected</code>，达到 75 才标 <code>believed</code></b>——传闻永不自动升格为事实。
  · <code>visibleTo(person, topic)</code> 只返回<strong>该人物自己</strong>持有的情报（信息不对称不被全知视角抹平）。
- **为什么**：<code>evolution</code> 早就有事件与影响链，但那是<b>上帝视角的结果账</b>；「谁因为什么知道了什么」这层从未分开记。缺了它，NPC 会说出他不该知道的事。
- **接上消费端**：注入项、人物页控件、<code>secIntel()</code>；面板实际消费 <code>knownCause</code> / <code>explain</code> / <code>visibleTo</code> / <code>CONFIDENCE</code>。
- **验证**：<code>tests/intel-v2530.js</code> → <code>INTEL-V2530: pass</code>；全量回归 <b>4938 / 失败 0</b>；出口面 ns 68 / members 448 / chars 5570；清册面 refs 1595 / 命名空间 74 / 成员 826。
- **提交**：<code>93692f3</code>（已推送）。

### R37 · 2026-09-22 · v2.54.0 交付（资源与组织·第三十九面：可执行库存与余额不足阻断）
- **做了什么**：新建 <code>engines/org.js</code>——势力与人物资源账本：<code>grant</code>（入库）/ <code>transfer</code>（转移）/ <code>canAfford</code>（余额）/ <code>stockOf</code> / <code>buildBlock</code>。
  · 只操作<b>已存在</b>的势力或人物（<code>missing-holder</code>），不凭空创建组织。
  · 转移前先校验余额，不足返回 <code>insufficient</code> 且<b>库存一字不改</b>（不把负数伪装成成功）。
  · 人物定位收成单一出口 <code>holder(kind, name, root)</code>：查询与入账走同一条路径，不再两处各写一套 ID 拼装。
- **为什么**：<code>people.resources</code> 在 <code>core/store.js</code> 的人物字段说明里<b>躺了很久</b>，势力也只存目标/核心/支柱——「资源」在 schema 上是事实，在运行时是空话。这是本仓典型病：<b>声明了容器，没有生产方</b>。
- **接上消费端**：<code>render/inject.js</code> 注入项（含「不足不得完成转移、不得凭空加库存」的硬口径）；人物页三按钮（入库/转移/检查余额）；<code>secOrg()</code>。
- **验证**：<code>tests/org-v2540.js</code> → <code>ORG-V2540: pass</code>；全量回归 <b>4943 / 失败 0</b>；dead 223 / uiDead 4 / dataOnly 122；出口面 ns 69 / members 457 / chars 5653；清册面 refs 1621 / 命名空间 75 / 成员 835。
- **提交**：<code>93bf00e</code>（已推送）。

### R38 · 2026-09-22 · v2.55.0 交付（长线伏笔·第四十面：把「埋了没收」变成可度量的欠账）
- **做了什么**：新建 <code>engines/longline.js</code>——长线伏笔的<b>承诺回收时刻</b>与<b>逾期欠账</b>。
  · <code>promise(id, dueAt)</code> 只给<b>已存在的伏笔</b>写 <code>dueAt</code>：不存在 → <code>missing-foreshadow</code>，已终态（recycled/dropped/triggered）→ <code>already-terminal</code>，非法时刻 → <code>bad-due</code>。<b>不创建伏笔、不改写状态</b>。
  · <code>overdue(now)</code> / <code>sweep(now)</code> / <code>pressure(now)</code>：超过 <code>graceMs</code> 才算逾期，按逾期时长降序，<b>只报不改</b>。
  · <code>buildBlock()</code> 注入欠账清单，并显式写明「<b>逾期只提示，不自动回收；收束与否由剧情决定</b>」。
- **为什么**：<code>memory.foreshadows</code> 早有状态枚举与终态回收（<code>pruneForeshadows</code>），但<b>没有任何「承诺何时回收」的字段</b>——于是「埋了没收」在全库不可观测：伏笔可以无限期 <code>waiting</code>，既不被回收、也不被报出，长线全靠人记。这是「长线」这一面最真实的缺口。
- **边界（写进模块头，防后续误用）**：① 总开关默认关闭；② 只度量、不回收——<b>回收是叙事决定，不是容量决定</b>（与 <code>pruneForeshadows</code> 的容量治理职责严格分开）。
- **接上消费端**：<code>render/inject.js</code> 注入项；人物页三控件（设定承诺 / 扫描欠账 / 总开关）；<code>secLongline()</code>（含 pressure 与 worstMs）。
- **本版坐实的真缺陷（我自己的）**：
  · ① <code>bad-due</code> 这条拒绝<b>没有计入 <code>blocked</code></b>——计量账漏一笔。由行为测试第 12 项当场红灯暴露（<b>「模块能跑」不等于「账记得对」</b>）。
  · ② <code>overdue</code> 起初<b>没有产品消费端</b>（只有测试调它）⇒ 死导出账本当场 dead 223→224。门禁点出后接进面板扫描按钮，dead 回到 223——<b>本项目「新导出必须立刻有真消费方」这条铁律，是靠门禁自动拦住我的</b>。
- **验证**：<code>tests/longline-v2550.js</code> → <code>LONGLINE-V2550: pass</code>（12 组）；全量回归 <b>4948 / 失败 0</b>；dead 223 / uiDead 4 / dataOnly 122 / 仅测试 131；出口面 ns 70 / members 466 / chars 5742；清册面 refs 1644 / 命名空间 76 / 成员 844。
- **工程教训（重要，已固化进流程）**：<b>用 heredoc 向终端传中文脚本会偶发讹变</b>（实测 <code>拒绝转移</code> 被写成 <code>拒绍转移</code>、<code>资源与组织</code> 被写成 <code>资 源与组织</code>），导致字面锚点匹配失败而补丁静默不生效。<b>含中文的改动一律走 <code>edit_file</code> 或 <code>create_file</code> 落盘后再执行</b>；终端内只做纯 ASCII 替换。
- **提交**：<code>（见本版提交）</code>。
### R39 · 2026-09-22 · v2.56.0 交付（注入源表 × 注入分支 双向成类锁·第四十一面：把「加了消费点忘了登记源」变成当场红灯）
- **做了什么**：
  · 修一处**真缺陷**：<code>SOURCES</code> 与 <code>__REG.def</code> 补登记 <code>life</code> / <code>intel</code> / <code>org</code> / <code>longline</code> 四源。
  · 给那四条注入分支补上可见性守卫（<code>vis.life && WA.life</code> …）——此前只判模块在不在。
  · <code>ui/panel.js</code> 的 <code>VIS_NAMES</code> 补四条显示名（否则面板裸露英文键）。
  · 新建 <code>tests/inject-sources-v2560.js</code>：双向成类锁（A / A2 / B / C / D 五面 + N1~N4 负控制），并**接进 <code>tests/run.js</code> 门禁**（+20 项）。
- **为什么**：v2.52.0~v2.55.0 连续四版往 <code>applyInjections</code> 里加注入分支，**四次全部漏登记**。后果三重，而**既有守卫一条都照不到**：① 面板上没有这四项的可见性开关；② 不在 <code>def</code> ⇒ 逃出「声明完整性 / 子键自愈 / undeclared 记账」三重校验；③ 反向守卫（SOURCES 有而 def 无、def 有而 SOURCES 无）两边都没有它。更隐蔽的是这四条分支**只判模块在不在、不读可见性**——即便事后补登记源表，面板开关依然**点了零效果**，与 v2.38.0 的 <code>echoes</code> 复选框是同一种病。
- **判据设计（防止再犯同类）**：A 注入分支 → 源表（<code>WA.&lt;ns&gt;.buildBlock</code> 的 ns 必须 ∈ SOURCES，子源须显式登记统管源）；A2 源守卫必须走可见性通道（不得存在「只判 <code>WA.&lt;ns&gt;</code> 在不在」的形态）；B 源表 → 消费点（防幽灵开关）；C 源表 ⇄ def **互为子集**；D 源表 → 面板显示名（两向）。判据只吃真代码面（<code>codeFace</code> 剥注释与字符串），故**注释里写出开关名不算消费点**；负控制以「真源码破坏 → 在破坏副本上重跑同款判据」自证，锚点须恰中 1 次否则抛。
- **本版坐实的第二处问题（流程面，比缺陷本身更值得记）**：<code>SOURCES</code> 上方的注释曾写「本版同时加了一条成类锁（<code>tests/longline-v2560.js</code>）」——**该文件当时根本不存在**。也就是说注释把「打算做」写成了「已经做了」。这与本仓反复出现的病同型：<b>声明与落地必须是两件事的核对，不能靠同一段文字自证</b>。声称「加了锁」就去 <code>ls</code> 那个文件；声称「修了缺陷」就去读那行代码。
- **顺手修掉的陈旧断言**：<code>tests/run.js</code> 里 v2380 段把 <code>SOURCES</code> 长度钉死为 <code>11</code>（v2.51.0 时代的数字）。源表增长后它会红灯——已改为 15。**这是「能拦住我」的那类断言**（记错了就得来说明），故保留其形态而非改成动态比较。
- **验证**：<code>tests/inject-sources-v2560.js</code> → <code>INJECT-SOURCES-V2560: pass</code>（20 项）；全量回归 <b>4968 / 失败 0</b>（v2.55.0 为 4948，+20 即本版新锁）；死导出门禁绿 <b>dead 223 / uiDead 4 / dataOnly 122 / 仅测试 131</b>，元数据同源、证据可复算。
- **提交**：<code>（见本版提交）</code>。
### R40 · 2026-09-22 · v2.57.0 交付（模块分区分组锁·第四十二面：把「控件加进了面板、分区标题没写」变成当场红灯）
- **做了什么**：
  · 修一处**真缺陷**：人物页的「因果与情报」**漏写了分区标题**，9 个 <code>wa-intel-*</code> 控件全部落在前一个「资源与组织」分区里——用户看到的是「资源与组织」标题下同时挂着两套功能（入库/转移/检查余额 与 加因果/加情报），两套 placeholder 混排，只能靠猜。补回 <code>&lt;div class="wa-sec"&gt;因果与情报&lt;/div&gt;</code>。
  · 新建 <code>tests/ui-module-section-v2570.js</code>：模块分区分组锁（三条判据 + 五条负控制），已接进门禁。
- **为什么（它治的病）**：本仓反复出现同型病——**结构声明的增长与产物的增长不同步**。v2.42.0 是「页面写死 12」，v2.43.0 是「文件面四处副本」，本版是「模块加了、分区标题没加」。三者都不是算法错，而是**新增时少写一行、且没有任何判据会因此变红**。此锁把「每个模块的分区标题必须真的写出来」变成可执行判据。
- **判据（在真机渲染产物上判，不是静态文本匹配）**：装载 <code>ui/panel.js</code> → 点 tab → 读 <code>body.innerHTML</code>，按 <code>&lt;div class="wa-sec"&gt;</code> 的位置给每个控件算「所在分区」。A 每个 <code>&lt;模块&gt;-enabled</code> 总开关所在分区标题必须含该模块名（模块名 = 标签剥「启用」前缀与尾部噪音词）；B 两个不同模块**不得共用同一分区标题**；C 覆盖度前提（≥3 个开关，否则判据在空集合上恒真 = 假绿）。
- **判据设计上的两次自我纠偏（都记在文件头，防后人重蹈）**：
  · ① 首版想用「一分区只能一族控件」作全局不变量，实测全 UI 后**放弃**：设置页 / 工具页 / 注入页 / 导演页存在**合法**的多族共存分区（如「扩展自检」下 14 族共存），按那不变量会产出 7 处纯噪音违规，判据立刻失去意义。改为只对**模块总开关**这一层设分组要求——它是「模块身份」的唯一标记，全 UI 仅 4 个，是天然干净的锚面。
  · ② 首版 <code>moduleKeyword</code> 忘了先 <code>trim()</code>：渲染产物里 label 文本带换行缩进（<code>\n        启用人物生活</code>），<code>^启用</code> 永不匹配 ⇒ 4 个开关全部假报违规。**判据自己被谓词形状骗了**（与 v2.51.0 踩过的「参数化 id 让门禁失明」同型）。
- **本版坐实的第三处问题（方法面）**：v2.56.0 那类**静态源码锁**照不到本缺陷——intel 的控件 id 与其分区是两件事，前者存在、后者缺失。这类「结构声明缺失」必须**在渲染产物上判**，而 <code>tests/ui-gate-sync.js</code> 的 <code>fresh()</code> 已提供真机 mini-DOM 环境（装载顺序从 <code>tests/run.js</code> 的 LOAD 提取，不复制不漂移），本锁直接复用它，不另造壳。<b>顺带收窄一条长期论断：此前「UI 层悬空、需浏览器复核」——真机渲染路径在无头环境其实是可判定的。</b>
- **验证**：<code>tests/ui-module-section-v2570.js</code> → <code>pass</code>（9 项）；先跑成**红**（<code>[B] 「资源与组织」下有 资源与组织 + 因果与情报</code>）再修产品端转绿，负控制确认删除该标题后 A/B 同时现形；全量回归 <b>4977 / 失败 0</b>（v2.56.0 为 4968，+9 即本版新锁）；死导出门禁绿 dead 223 / uiDead 4 / dataOnly 122；ui-wire-audit 9 / 0；出口面契约逐字一致 ns 70 / members 466 / chars 5742。
- **提交**：<code>（见本版提交）</code>。

