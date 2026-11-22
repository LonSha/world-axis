# Agent Note: V11 display truth — no truncation, no fabricated history, fold witness at decision time
Status: implemented

此前将页面接入视为单元验收完成，证据不足。EXV11-6 的 3000 字符截断违反逐字展示要求，且预算为空时提前返回导致快照不可见；空串是合法 off 产物，不可当读取失败。

选择：完整转义展示快照，以滚动容器控制布局；在预算分支之前生成查看器，并以 null 区分读取失败。拒绝继续截断或用省略提示冒充原样展示。

EXV11-7 展示全部现有登记项及 reason 原文，不再只取前 12 条；这并不证明计划要求的全部源码 API 已裁决。EXV11-2 的 rows 含非空引擎，标题改为引擎采样，不能统称空产。

验证：panel 语法检查；pages-cats 12/0；snapshot-state 43 项；抽取实际查看器片段，以受控输入检查无预算、空串和大于 3000 字符三种情况（不是宿主端到端验收）。

未完成：完整 49 项扫描双向覆盖、折叠前后对照、真实运行时交互及 18 项矩阵。不能据此声称 V11 全部完成。

## Problem
World snapshot view truncated at 3000 chars, snapshot view was skipped whenever lastInjection.budget was null, and the empty string case (a legitimate 'off' product) was reported as read failure. Fold records exposed only token counts, so no before/after text comparison existed, and the push-api panel red-flagged a fabricated coverage gap.
## Decision
Show the snapshot fully escaped with a scrolling container and build the viewer before the budget branch, treating null as the only read-failure signal. Record wasChars/wasPreview/nowChars/nowPreview at decision time in render/inject.js so the panel compares real history instead of re-running plan(). Reject truncation and silent fabrication; missing history says 'not recorded'.
## Consequences
v11-snapshot-viewer locks completeness with a truncation mutation, and v11-fold-witness locks the four witness fields with a mutation on the witness source. Nobody may shorten the snapshot for layout reasons; layout must be solved in CSS. Panel code path depends on render/inject.js recording witnesses, so a future refactor of lastInjection must keep them or the lock fails.

## Alternatives considered
Keep the 3000-character cap and label it as an excerpt, or recompute the fold comparison from the current snapshot. Both were rejected: the first still presents a partial product as the product, the second fabricates history. A CSS-only fix was chosen for layout, and decision-time recording was chosen for history.
