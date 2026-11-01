# Agent Note: EXV7-4 关系六型图的结构与温度分层

Status: implemented

## Problem
WorldAxis 已有三套互补但不可互相冒充的关系事实：`bonds` 登记六型结构，`fondness` 保存人物温度与 `history`，`relationGraph` 保存另一种关系边与方向化立场。玩家需要看到“关系是什么、温度如何、最近依据是什么”，但实现不能创建第二套关系真源，也不能把非玩家人物对的温度伪装成该关系对的温度。

## Decision
关系六型图采用两级只读聚合：

- `WA.bonds.network(opts)` 是结构 owner 的有界列表口，只读 `state().bonds.rows`，只接受 `bonds.TYPES` 中已经登记的六型，稳定按 `at` 与 `key` 排序，并返回 `disabled`、`no-records`、`truncated` 和 `dropped` 等状态；它不读写好感，不推导新类型。
- `WA.relationTemp.network(opts)` 是玩家侧富化口，委托 `bonds.network()` 取得结构，再从 `fondness` 读取玩家与关系另一端的人物温度、区间与最近 `history`。不含玩家的关系对不借用任一人物温度，而是明确返回无对应温度依据；好感模块关闭或无历史也分别说明。
- 人物页新增独立的“关系六型图”消费区，并明确标注“不替代关系图谱”。概览页现有关系温度计、`relationGraph`、诊断节和设置页语义不被改写。
- 诊断节消费 `relationTemp.stat()` 中的网络读数并报告 bonds owner 与 relation-temp 富化口是否存在。

## Alternatives considered

1. **在 `relation-temp` 内直接扫描 `state().bonds.rows` 并把它作为唯一新入口。** 这能少改一个 owner，但会让结构真源的读取责任漂移到温度模块，且为后续结构消费者制造第二个约定；因此改为由 `bonds.network()` 先提供结构口。
2. **把 `relationGraph` 改造成六型图。** 它已有存档边、事件引用与有向立场，语义和六型登记不同；改造会把登记结构、推导/存档边和温度混成一张表，因此保留为独立消费面。
3. **为每一条 bonds 关系合成双方温度或从敌对事件推断温度。** 现有 fondness 只以人物为行，敌对事件只回答发生过什么；合成会伪造证据并破坏“无记录即明确无记录”的纪律，因此只富化包含玩家的关系对，并原样保留无依据状态。

## Consequences

- 玩家在人物页能同时看到真实六型、适用的人物温度和最近好感历史依据；关闭、空数据、截断和无温度依据不会被压成同一个空数组。
- 新聚合是纯读的，关系登记和好感历史仍由各自 owner 写入；`relationGraph` 的既有存档与方向化语义不受影响。
- `relation-temp` 增加了一个面向玩家的聚合统计面，后续必须继续保持容量上限与零写盘测试；若未来需要展示 NPC-NPC 的温度，必须先扩展 fondness 的真实数据契约，不能在 UI 层猜测。
- 版本、模块账本、专锁和负控制必须与本接口一起维护；不能只登记导出而不接真实产品消费。
