# Agent Note: O7 笔记树门禁跟随六类 Agent Note class

Status: implemented

## Problem

V10 R1 第一趟在 `24047 / 1` 停止，唯一失败是 `v2187: O7 计划状态与笔记树门禁`。失败对象为合法的新提案笔记 `proposed/process/2026-11-04-v10-release-readiness.md`，门禁却把它报成 `bad-dir`，因为 `tests/o7-plan-tree-gate-v2187.js` 仍只接受 `architecture|bug-fix` 两类目录。

仓库现行 Agent Note 规范已经定义六类 class：`feature`、`bug-fix`、`simplification`、`architecture`、`process`、`testing`。第一趟失败来自测试判据落后于现行笔记树契约，不是产品功能失败，也不是应把 V10 计划笔记迁移到旧分类的理由。

## Decision

将 O7 门禁的目录正则扩展为完整六类 class，并同步更新错误提示。生命周期仍只接受 `implemented` 与 `proposed`，根目录游离文件、H1/Status/必备节、计划块同步、幂等和负控制判据全部保持不变。

## Alternatives considered

**把 V10 笔记从 `proposed/process` 移到 `proposed/architecture`。** 最强理由是无需改旧测试文件，短期即可让全量变绿。但这会把流程/发布决策错误归类，并让现行六类规范无法被实际使用，因此不选。

**删除 V10 提案笔记。** 最强理由是 O7 会恢复原先的 35 篇目录集合，且不需要调整判据。它会丢失发布资格计划的取舍与边界记录，违反非平凡流程变更必须留决策依据的规则，因此不选。

**放宽 O7 为任意二级目录。** 最强理由是未来新增 class 不必再次修改门禁。它会重新引入拼写错误和未登记目录的静默通过，削弱树结构门禁；采用显式六类集合保留可审计性。

## Consequences

V10 的 `proposed/process` 笔记可以按仓库现行规则留在正确位置，O7 继续拒收根目录游离文件和未知 class。测试基建文件发生一处判据跟位，不改变产品运行时行为。全量回归需要从提交后的源树重新开始，第一趟的 `24047 / 1` 仍作为历史失败证据保留。

## Verification

- `node tests/o7-plan-tree-gate-v2187.js`：`PLAN-STATUS-GATE-V2187: pass (69)`。
- `git diff --check`：通过。
- 第一趟全量失败：`/tmp/worldaxis-regression-1RQ5C6/result.json`，`status=assertion-failed`、`summary=通过 24047 / 失败 1`、`unchanged=true`。
- 本笔记不宣称 R1 全量通过；第二趟必须重新取得 `result.json` 三要素。

## Related decisions

- [V10 发布资格计划](../../../../plans/V10_RELEASE_READINESS.md)
- [V10 发布资格优先于下一轮功能扩张](../../proposed/process/2026-11-04-v10-release-readiness.md)
- [V9 收口全量回归判据跟位](../architecture/2026-11-03-v9-closeout-followup-supersede.md)