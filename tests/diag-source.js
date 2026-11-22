'use strict';
// WorldAxis tests/diag-source.js (v2.529.0) — tool-diag 的「合并面」读数器
//
// 为什么需要它（OPV29-07）：tool-diag 的注册表 / 可选面名单 / 面板绑定表 / 引擎端口表
// 已搬到 engines/tool-diag-tables.js（纯表）。下游判据里大量形如
//   diagSrc.indexOf("'engines/x.js': 'x'") >= 0
// 的锚点问的是「产品里有没有这条登记」，不是「它写在哪个文件」。
// 拆段后若各判据继续只读引擎，会全红 —— 那不是产品坏了，是判据把「文件位置」
// 当成了「产品事实」。本读数器给两处都读、按「引擎在前、表在后」拼起来，
// 判据强度不变（新增登记仍要真落地才算过），而拆段不必逐条改锚。
//
// 什么时候**不该**用它：判据本身就在问「表是否已从引擎出闸」（例如 OPV29-07 专锁的
// A 段）—— 那种判据必须 engine() 单读引擎，否则永远看不出表回流。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function engine() { return fs.readFileSync(path.join(ROOT, 'engines/tool-diag.js'), 'utf8'); }
function tables() {
  const p = path.join(ROOT, 'engines/tool-diag-tables.js');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function merged() { return engine() + '\n' + tables(); }
module.exports = merged;
module.exports.merged = merged;
module.exports.engine = engine;
module.exports.tables = tables;
