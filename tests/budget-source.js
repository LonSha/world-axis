'use strict';
// WorldAxis tests/budget-source.js (v2.531.0) — inject-budget 的「合并面」读数器
//
// 为什么需要它（与 tests/diag-source.js 同款）：OPV29-10 把注入预算的**两张纯表**
//   （PRIORITY 源优先级表 / ACCOUNTS 科目表）搬到 engines/inject-budget-tables.js。
//   下游判据里大量形如
//     src.indexOf("'行动调度'") >= 0
//   的锚点问的是「产品里有没有这条登记」，不是「它写在哪个文件」。
//   拆段后若各判据继续只读引擎，会全红 —— 那不是产品坏了，是判据把「文件位置」
//   当成了「产品事实」。本读数器给两处都读、按「表在前、引擎在后」拼起来。
//
// 什么时候**不该**用它：判据本身就在问「表是否已从引擎出闸」（例如 OPV29-10 专锁的
//   A 段）—— 那种判据必须 engine() 单读引擎，否则永远看不出表回流。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function engine() { return fs.readFileSync(path.join(ROOT, 'engines/inject-budget.js'), 'utf8'); }
function tables() {
  const p = path.join(ROOT, 'engines/inject-budget-tables.js');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function merged() { return tables() + '\n' + engine(); }
module.exports = merged;
module.exports.merged = merged;
module.exports.engine = engine;
module.exports.tables = tables;