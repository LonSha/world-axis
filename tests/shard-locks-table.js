'use strict';
/**
 * WorldAxis tests/shard-locks-table.js — 并行分片锁的表（出闸自 tests/run.js 的 __V82_PARALLEL）
 *
 * ── 为什么出闸（两件现场事实）────────────────────────────────
 *   ① `tests/segment-extract-v2400.js` 的 A11 判据是 `runLines < 23000`（run.js 行数硬上限）。
 *      本批（V29 OPV29-08 收尾 + 外部仓库缝合 19 件）要往分片里登记 19 条专锁，
 *      而 run.js 当时已 22997 行，只剩 3 行余量 —— 不腾地方就登记不进去。
 *   ② 这 34 条锁本来就是**纯数据**（一串文件路径），却被写死在流程文件里，
 *      于是「加一条锁」和「改流程」被绑成一件事。出闸后两者解耦：
 *      加锁 = 往 LOCKS 里加一行，run.js 一行不动。
 *
 * ── 缺表/空表当场抛错，不许静默降级 ──────────────────────────
 *   调用方 `tests/run.js` 直接取 `LOCKS` 交给 `tools/shard-locks.js::runParallel`。
 *   若本表缺失、导出不是数组、或数组为空，`runParallel` 会跑 0 条锁并**静默通过** ——
 *   那等于这 34 条锁整批消失而全部门禁仍绿。故本文件在**装载期**就把这三种情形打断。
 *
 * ── 登记规则 ────────────────────────────────────────────────
 *   · 只登记「互不共享宿主前置」的锁（能真并行）；需要宿主内串行的（如 render-pre-v2108）留在 run.js。
 *   · 新增一行就够，不要在这里写流程语句 —— 这里只存数据。
 */
const LOCKS = [
  './settle-v2820.js',
  './settle-v2850.js',
  './settle-v2860.js',
  './identity-v2860.js',
  './causal-view-v2870.js',
  './cost-v2880.js',
  './replay-v2890.js',
  './explain-v2900.js',
  './switch-matrix-v2910.js',
  './resource-ledger-v2920.js',
  './transit-v2930.js',
  './journal-v2940.js',
  './org-econ-v2950.js',
  './hazard-weather-v2960.js',
  './hazard-trigger-v2138.js',
  './life-e8-v2139.js',
  './faction-graph-v2139.js',
  './collab-tasks-v2139.js',
  './canon-deviation-v2139.js',
  './noesis-v2140.js',
  './lifeline-v2141.js',
  './perspective-lock-v2142.js',
  './duty-v2143.js',
  './fidelity-v2144.js',
  './rumor-v2960.js',
  './phone-bridge-v2970.js',
  './alias-trace-v2970.js',
  './coord-v2970.js',
  './tape-vol-v2980.js',
  './canon-v2990.js',
  './canon-align-v2100.js',
  './interop-v2101.js',
  './perf-trace-v2102.js',
  './settle-v2830.js'
];

// ── 装载期守卫：缺表 / 非数组 / 空表 一律当场打断 ──
if (!Array.isArray(LOCKS)) throw new Error('shard-locks-table: LOCKS 不是数组（分片表缺失）');
if (!LOCKS.length) throw new Error('shard-locks-table: 分片表为空 —— 并行锁整批会静默消失，拒绝启动');
LOCKS.forEach(function (rel, i) {
  if (typeof rel !== 'string' || rel.slice(0, 2) !== './' || rel.slice(-3) !== '.js') {
    throw new Error('shard-locks-table: 第 ' + (i + 1) + ' 条不是 ./xxx.js 形态（实 ' + String(rel) + '）');
  }
});

module.exports = { LOCKS };