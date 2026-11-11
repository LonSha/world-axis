/**
 * WorldAxis tests/bus-topology-v2400.js (v2.400.0) — OPV22-5 专锁
 *
 * 它治的病：修改前「六层总线铺了哪些引擎」只能人读 cascade-bus.js 体内 800+ 行。
 *
 * 本工具**只报不改、不做门禁** —— 但「只报」不等于「不用锁」。没锁的报告工具
 * 会在源码结构一变时静默输出空表，而空表看起来像「总线什么都没铺」。
 * 这类假绿比报错危险，故本锁只锁三件事：
 *   A 能真解出六层（不是零层）
 *   B 层号与源码 Layer 头逐一对上（1..6，不缺不重）
 *   C --json 与文本同源（同一个 build()，不是两套口径）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const T = require(path.join(ROOT, 'tools/bus-topology.js'));
let passed = 0; let failed = 0;
function a(cond, desc, detail) {
  if (cond) { passed++; console.log('  ✓ ' + desc); }
  else { failed++; console.error('  ✗ ' + desc + (detail ? ' — ' + detail : '')); }
}
const d = T.build();
a(d.layers.length === 6, 'A1: 真解出六层（实 ' + d.layers.length + '）');
a(d.engineCount > 0, 'A2: 消费引擎数大于零（实 ' + d.engineCount + '）—— 零层/零引擎是假绿的典型面孔');
const nums = d.layers.map(function (L) { return L.num; }).sort();
a(JSON.stringify(nums) === JSON.stringify([1, 2, 3, 4, 5, 6]),
  'B1: 层号恰为 1..6 不缺不重（实 ' + nums.join(',') + '）');
const src = fs.readFileSync(path.join(ROOT, 'engines/cascade-bus.js'), 'utf8');
const heads = (src.match(/\/\/ ── Layer \d+: /g) || []).length;
a(heads === 6, 'B2: 源码里的 Layer 头也恰六处（实 ' + heads + '）—— 工具不凭空造层');
const withRows = d.layers.filter(function (L) { return L.rows.length > 0; }).length;
a(withRows === 6, 'B3: 每层都真有消费引擎（空层 ' + (6 - withRows) + ' 个）—— 补了层却无人挂载即为空壳');
const L3 = d.layers.filter(function (L) { return L.num === 3; })[0];
const L3ns = L3.rows.map(function (r) { return r.ns; });
a(L3ns.indexOf('siegeAttrition') >= 0,
  'C1: L3 解析到 OPV22-1 新挂的 siegeAttrition（实 ' + L3ns.join(',') + '）');
const L6 = d.layers.filter(function (L) { return L.num === 6; })[0];
const L6ns = L6.rows.map(function (r) { return r.ns; });
a(L6ns.indexOf('epochTide') >= 0,
  'C2: L6 解析到从 L1 归位过来的 epochTide（实 ' + L6ns.join(',') + '）');
const allNs = [];
d.layers.forEach(function (L) { L.rows.forEach(function (r) { allNs.push(r.ns); }); });
a(allNs.indexOf('engines') < 0,
  'C3: 不把 WA.engines.X 的 engines 前缀误当一个命名空间（实命名空间里含 engines: ' + (allNs.indexOf('engines') >= 0) + '）');

console.log('');
console.log('bus-topology v2400 (OPV22-5): ' + passed + ' / 失败 ' + failed);
if (failed > 0) process.exit(1);
