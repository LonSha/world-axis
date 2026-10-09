# Agent Note: WorldAxis 第三批执行单（O6/O7/O8 + E1/E3）
Status: implementing（2026-10-09 起）
依据：[plans/O_OPTIMIZATION.md](../plans/O_OPTIMIZATION.md) 与 [plans/E_EXPANSION.md](../plans/E_EXPANSION.md) 的「实施顺序」表。

## 0. 批次口径（照计划原文，不重新编排）
计划原文的批次表：

| 线 | 批次 | 范围 |
|---|---|---|
| O | 第一批 | O1 + O2 + O9 |
| O | 第二批 | O3 + O4 + O5 |
| O | **第三批** | **O6 + O7 + O8** |
| E | **第一批** | **E1 + E3** |
| E | 第二批 | E2 + E5 |
| E | 第三批 | E4 + E6 + E8 |
| E | 第四批 | E7 + E9 |

本轮执行范围 = **E1（新做）+ O6 + O7 + O8 + E3**。
E1 与 E3 同属 E 第一批，而第二批（E2/E5）已交付，故本轮的 E 侧是「把第一批补齐」。

## 1. 起点基线（本轮实测，非文档抄录）

| 读数 | 现场值 | 取法 |
|---|---|---|
| 版本 / HEAD | v2.182.0 / `9691a3b`（第二批交付点） | `grep -n "VERSION =" index.js`；`git log -1` |
| 工作区 | 1 个未跟踪文件（`engines/pending-center.js`，E1 引擎初稿） | `git status --porcelain` |
| 全量回归 | 15723 / 0 | 第二批收口读数 |
| 产品引擎 | 160 个 | `ls engines/*.js \| wc -l` |

**第一批剩余交付状态（本轮实测）**：
- E1 **引擎已写**但零接线：`grep -c 'WA.pendingCenter' ui/panel.js` = 0、
  `tool-diag` 无登记、`index.js` / `tests/run.js` 的 LOAD 均无它。
- E3 **完全未做**：`grep -c 'WA.checkpoints' ui/panel.js` = 0（存档槽面板入口不存在）。

## 2. 本轮已交付：E1 统一待办事项中心（v2.183.0）

### 2.1 它治什么（缺口，现场实测）
`pending` 在本仓作为**导出成员**出现在八个引擎里：aftermath / commission / investigation /
operations / storyChoice / coop / farfield / backstage。它们的返回形状**四族各不相同**，
且**调用方无法从名字推出形状**：

| 族 | 形状 | 成员 |
|---|---|---|
| A | `{ ok, items: [...] }` | aftermath / commission / investigation / operations |
| B | `{ ok, points: [...] }` | storyChoice |
| C | `[...]`（裸数组） | coop |
| D | `{ ok, count, rows }` / `{anchor,reason}` 或 null | farfield / backstage |

### 2.2 落点
只读聚合 + 下钻，**不新增第二套状态**：`items / soon / bySource / describe / diagnose / stat / reset`
（9 导出，`EXPORT_COUNT = 9`）。**无 buildBlock**（无消费方不挂导出）、**无任何写口**
（确认语义仍由各来源模块自己的公开写口持有）。

### 2.3 两次现场整改（本模块的诚实边界，逐条都是「差点又报了个假绿」）

**第一次：缺席被报成「全处理完」。** 初版只有 `emptyAll` / `allClear` 两旗标，
八个源全部缺席时 `allClear = rows.length === 0` = **true** —— 把「读不到」报成了「全处理完」。
补 `unavailable`（`liveSrc.length === 0`），并把 `allClear` 的判据收窄成
`rows.length === 0 && !emptyAll && !unavailable`。

**第二次：一盏永远不亮的灯。** 补上 `unavailable` 后又发现：
八源的 `pending()` **没有一个**申报 `empty` 字段（全仓 grep 零命中），
于是 `emptyAll` 在现版本**恒假** —— 它自称的「有源但还没产生数据」这一态推不出来。
三种处理都不诚实（删掉 = 把「空」并进 `allClear`，回到第一个病；留着不说 = 死灯）。故本版：
- 保留 `emptyAll`（来源一旦申报即生效）；
- 同时报 `emptyReported`（几个在场源真的回答了「空不空」）+ 诊断面的
  `emptyReporterCount` / `emptyAllReachable` —— **灯不亮这件事永远有一个出口说出来**；
- `empty` 走**三值**（`true` / `false` / `null`-未申报）：把「没申报」压成 `false`
  才是诊断面永久报不出可达性的根因；
- `allClear` 的语义**收窄**到它唯一能断言的那句话，并在 `note` 里明写
  「有数据但都办完」与「从来没有数据」在来源不申报时**不可区分**。

**第三次（本次加固）：一条不可达的兜底码。** `describe()` 里 `blocked` 曾写成
`... ? (ps ? ps.reason : 'unknown')` —— 走到那里 `k` 必在 SOURCES 里、`perSource[k]` 恒存在，
故那个 `'unknown'` **结构不可达**。它不是「防御」，而是一条**扫描面看得见、运行时永不出现**
的假码（`reject-code-gate` 当场把它报成未分类新码）。已删。

### 2.4 交付物
- `engines/pending-center.js`（347 行，9 导出）
- 面板区块（健康页，7 静态控件 + 1 动态出口）
- `tool-diag` 三点登记 + `secPendingCenter()`（可达性读数进诊断面）
- `tests/s3-b1-e1-v2183.js` 专锁 124 项（A 27 / B 36 / C 12 / N 49）
- `tools/pending_center_smoke.js` 冒烟 45 项
- `tests/reject-v2780.js` 五码见证（missing-kind / unknown-kind / not-found / bad-shape / source-threw）

## 3. 环境事故与恢复（本轮必须记录）

**`/tmp/wa_git` 被外部回收进程整棵树删除。** 现场证据链：
- `/tmp` 是 **tmpfs**，事故时用量 **97%**（212G / 221G），恢复后降到 86%；
- 同批消失的还有 `/tmp/worldaxis-regression-ae0dc9adcbcf01a9a183.lock`（01:58 创建，
  正是最后一次提交回归的锁）——它同样无进程持有、非我方清理；
- `/tmp` 下所有被测仓库副本、探针脚本、冻结串产物一并消失。

**恢复来源**：`/tmp/worldaxis-regression-YI9gmE/work/` —— 隔离运行器在回归启动时
`prepare()` 出来的**候选树快照**（它按 `files(root)` 只复制**文件**，故不含 `.git` 仓库，
但完整覆盖 `index.js` / `manifest.json` / `engines/` / `tests/` / `ui/` / `tools/`）。
该快照的 `index.js` 实测 `VERSION = '2.182.0'`，与第二批交付点一致。
已整体复制到 `/home/user/wa_git`（**非 tmpfs，持久**），并逐项核对：
三把账本门禁（dead-export 831 / module-registry 193 文件 201 ns / reject-code 761 码）
**全部在原位通过，逐字等于第二批交付读数** —— 这证明恢复出来的是干净的 v2.182.0 树，
而不是半途被截断的中间态。

**E1 初稿未随快照存活**（它当时是工作区未跟踪文件，而 `prepare()` 只复制 `root` 下文件、
复制发生在提交之后）⇒ 本轮的 E1 是**按现场实测结论重写**的，不是从残件续写。
重写反而把第三次整改（不可达兜底码）一并落进来了。

**教训（对无人值守模式的操作含义）**：
1. 工作区**不能放在 tmpfs**。`/tmp` 在本机是内存盘且被外部回收，长跑项目必须落在持久分区。
2. 「提交」才是快照边界。隔离运行器的候选树只覆盖 `root` 当时**存在**的文件，
   未跟踪的初稿不会进快照 —— 未提交的产物不要当成「已经落在某处」。
3. 快照可用但**不含 git 历史**：恢复点在 `792d9ac "Independent baseline"`，
   而真历史（`170f4ad` / `9691a3b`）在远端。**下一轮应先把远端历史拉回来**，
   否则「与远端同步」这一读数无从核对。

## 4. 后续（本轮未完成，按批次继续）
- O6 测试分层与回归加速
- O7 计划 / 文档与现场读数自动同步
- O8 死导出消费者类型治理
- E3 存档槽与世界分支管理（`engines/checkpoints.js` 28 导出现成，只差面板）

## Problem
> 本节为 O7（v2.187.0）格式补登：本篇原文未设 Problem 节；问题面即上方「1. 起点基线（本轮实测，非文档抄录）」一节 —— E1 引擎已写但零接线、E3 完全未做，以及「3. 环境事故与恢复」记录的 /tmp 整棵树被外部回收，正文未重排、未改写。

## Decision
> 本节为 O7（v2.187.0）格式补登：本篇原文未设 Decision 节；决策正文即上方「2. 本轮已交付：E1 统一待办事项中心（v2.183.0）」与其三个小节（缺口、落点、三次现场整改）—— 只读聚合 + 下钻、不新增第二套状态、缺席/空/无事三态可分，正文未重排、未改写。

## Consequences
> 本节为 O7（v2.187.0）格式补登：本篇原文未设 Consequences 节；其后果面已散见上方「2.3 两次现场整改」（缺席被报成「全处理完」、一盏永远不亮的灯、一条不可达的兜底码）与「4. 后续（本轮未完成，按批次继续）」两节，正文未重排、未改写。

## Alternatives considered
> 本节为 O7（v2.187.0）格式补登：本篇原文未记录被否决方案，此处**如实留空**：O7 只做结构补齐，不为历史笔记事后追补当时未记录的取舍。
