// WorldAxis tools/scan_drift.js — 「展示映射 ↔ 引擎真源」漂移诊断（零依赖命令行入口）
//
// 【为什么只是薄壳】本脚本最初自带一份组定义与源码提取逻辑，用来一次性取证 v2.22.0 的 6 组漂移。
//   取证完成后它立刻变成了**自己的反例**：那份组定义是 `tests/ui-gate-sync.js` 里 `checkSrcMaps`
//   的第二份真源——门禁扩到 14 组时它仍停在 11 组，正是本版要治的病。故重写为**纯委托**：
//   判据（组定义 / 真源口径 / 源码锚点）唯一真源在 `checkSrcMaps`，本脚本只负责把它跑一遍并
//   打印成「人读的诊断报告」。这样两者永不可能漂移——扫的就是门禁扫的东西。
'use strict';
const gate = require('../tests/ui-gate-sync.js');

const res = gate.checkSrcMaps();

console.log('\n== 漂移扫描（判据真源：tests/ui-gate-sync.js checkSrcMaps）==');
res.groups.forEach(function (g) {
  console.log((g.ok ? '  OK   ' : '  DRIFT') + '  ' + g.name + '  (ui ' + g.ui + ' / eng ' + g.eng + ')');
  if (g.missing.length) console.log('         缺键: ' + g.missing.join('、'));
  if (g.ghost.length) console.log('         幽灵键: ' + g.ghost.join('、'));
});
console.log('\n漂移组数: ' + res.failures.length + ' / ' + res.groups.length);
if (res.failures.length) process.exitCode = 1;