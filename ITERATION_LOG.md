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
