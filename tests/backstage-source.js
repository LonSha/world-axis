'use strict';
// WorldAxis tests/backstage-source.js (v2.529.0) — backstage 的「合并面」读数器
//
// 为什么需要它（OPV29-11）：backstage 的设置登记表 `__REG_B`（def + 区间/枚举声明）与协议常量
// 已搬到 engines/backstage-protocols.js（129 行纯数据）。下游判据里形如
//   bsC.indexOf('proactive:') > 0
// 问的是「声明面里有没有这个子键」，不是「它写在哪个文件」。
// 拆段后若各判据继续只读引擎，这类锚点会全红 —— 那不是声明缺失，是判据把「文件位置」
// 当成了「声明事实」（与 OPV29-07 的 tests/diag-source.js 同一条教训）。
//
// 判据强度不变：新增子键仍必须真落地才算过；运行期的 def 断言（`'proactive' in bsReg.def`）
// 照旧在真装载对象上跑，源码级读数只是第一道。
//
// 什么时候**不该**用它：判据本身就在问「表是否已从引擎出闸」（OPV29-11 专锁的 A 段）——
// 那种判据必须 engine() 单读引擎，否则永远看不出回流。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function engine() { return fs.readFileSync(path.join(ROOT, 'engines/backstage.js'), 'utf8'); }
function tables() {
  const p = path.join(ROOT, 'engines/backstage-protocols.js');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function merged() { return engine() + '\n' + tables(); }
module.exports = merged;
module.exports.merged = merged;
module.exports.engine = engine;
module.exports.tables = tables;
