# WorldAxis 迭代日志（自主迭代模式）

> 由 AI 在无人值守模式下维护。每轮记录：做了什么、为什么、影响范围、门禁结果。

## 基线

| 项 | 值 |
|---|---|
| 版本 | v2.22.0 |
| 全量回归 | `node tests/run.js` → 4075 断言全绿 |
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
- **为什么**：G17/G18 只在运行期验证「控件成树/可点」，UI 展示映射与引擎枚举各写一份（第二份真源）导致的**静默回退**在运行期不抛不报、全绿也照不出——正是本版实测 6 组漂移却零报警的根因。
- **影响范围**：`ui/panel.js`（六处映射，不新增导出）；`tests/ui-gate-sync.js`（新增 `checkSrcMaps`）、`tests/run.js`（新增 v2.22.0 块 + 头部引用）；`tools/scan_drift.js`（新增诊断脚本）。出口面承诺不变。
- **附带自纠**：`ITERATION_LOG.md` 此前 `### R2` 被重复写入两份，本轮去重。扫描器口径两处修正：`reportReadFail` 正则漏 `reportHostReadFail`；settings 读标签为动态建桶，真源须取「声明 ∪ 调用点」，否则误判。
- **验证**：`node tests/run.js` 4079/0（+21，门禁 11 组：UI↔引擎 9 组 + 引擎↔引擎 2 组）；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。
