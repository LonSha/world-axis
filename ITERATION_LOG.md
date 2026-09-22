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
