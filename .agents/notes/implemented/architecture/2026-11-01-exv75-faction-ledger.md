# Agent Note: EXV7-5 势力账本聚合

Status: implemented

## Problem
`engines/org.js` 已经分别保存资源库存、名册、欠薪、人物对势力债务和共同项目，但现有 `ledgerView()` 的主要读数仍以持有者库存与流水为中心。玩家可以查到单项资源或单个债务，却不能在同一张只读账本上回答一个势力当前的资源、名册、工资负担、债权债务和项目缺口。若为此另建账本容器，就会复制组织经济真源，并且无法解释账本与 `faction.roster`、`person.debts`、`faction.projects` 的差异。

## Decision
`WA.org.ledgerView()` 继续作为组织经济账本的唯一公开读口，并在其返回值中增加有界的 `accounts` 聚合段。聚合只读取已有 owner：

- 资源来自 `evolution.factions[*].resources`；
- 名册、当前应付工资和欠薪来自 `faction.roster` 经过 `membersOf()` 的既有计算；
- 双向债权债务复用 `debtsView('faction', factionName)`，不抵成净额；
- 项目数量、进行中项目和精确需求缺口来自 `faction.projects` 与 `coverageOf()`；
- 工资结算次数与最近原因只报告 `org.stat()` 已记录的模块级流水，不伪造不存在的逐势力支付历史。

`accounts` 采用固定上限和稳定顺序，返回 `total`、`cap`、`truncated`、`dropped`；项目、资源和债务明细也各自有界。它是纯读聚合，不能调用 `store.transact`、不能创建新顶层容器、不能把债务写入库存。既有 `ledgerView()` 字段保持不变。

产品消费沿用既有链路：人物页的“资源与组织 / 资源账本”按钮读取 `ledgerView().accounts`，诊断节 `secOrg()` 读取同一个 `ledgerView()` 返回值并报告 `accounts`。不新增第二个组织账本导出，不把 `organizationSummary()` 或既有 `debtsView()` 改造成新的真源。

## Alternatives considered
- **新建 `WA.org.factionLedger()` 及独立缓存** — 独立出口更容易让面板直接调用，但会增加一套与 `ledgerView()` 并行的聚合契约和缓存失效问题；现有 `ledgerView()` 已是组织账本的承诺出口，扩展它能保持诊断、面板和旧 API 同源，因此不采用。
- **只在面板里现场扫描存档** — 实现快，但会让 UI 自己决定债务方向、工资和项目缺口的语义，诊断与面板容易分叉；组织 owner 已提供既有读口，现场扫描不采用。
- **把工资转账流水重新分类为逐势力支付历史** — 现有 journal 记录的是通用 `grant`/`transfer`，没有每笔 payroll 的独立标记；强行回推会编造证据。账本只报告可证明的当前应付/欠薪和模块级 payroll 计数。

## Consequences
- **收益**：玩家在一个账本读数中同时看到势力库存、名册规模、工资负担、双向债务和项目资金缺口；诊断和面板共享同一聚合，且旧 `ledgerView()` 调用方不需要迁移。
- **代价与已知上限**：账本是当前快照，不提供未被现有 journal 标记的逐势力工资历史；明细有界，超出上限必须通过 `truncated/dropped` 明示。若未来需要逐笔工资审计，应先给既有流水增加可证明的 payroll 元数据，再单独记录决策，不得在本聚合中猜测。

## Verification
专锁 `tests/v7-faction-ledger-2289.js` 覆盖出口、五类 owner 读数、双向债务、工资证据边界、容量截断、关闭/空态、纯读和真实源码负控制。既有组织专锁、资源账本锁、组织经济锁、版本面、模块注册和死导出门禁继续复跑；完整 `node tests/run.js` 在 V7 全部 EXV 项交付前仍不运行。
