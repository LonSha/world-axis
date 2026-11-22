'use strict';
// 探针：driverLedger 九个导出的产品侧引用面核账
//   死导出口径 = 产品代码（不含 tests/ tools/）里零引用即「死」。
//   本模块九口：getSettings / setSettings / build / view / why / summaryText / invalidate / stat / DEF
//   必须每一个都在产品侧至少被引用一次，否则 dead-export 门禁会涨。
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

const PROD = [];
for (const d of ['engines', 'core', 'ui', 'render', 'actors', 'direction', 'compat', 'design']) {
  (function walk(dir) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) PROD.push(rel);
    }
  })(d);
}
PROD.push('index.js');

const MEMBERS = ['getSettings', 'setSettings', 'build', 'view', 'why', 'summaryText', 'invalidate', 'stat', 'DEF'];
const hits = {};
MEMBERS.forEach(function (m) { hits[m] = []; });

for (const rel of PROD) {
  if (rel === 'engines/driver-ledger.js') continue;   // 自身定义不算引用
  const src = read(rel);
  if (!src) continue;
  for (const m of MEMBERS) {
    const re = new RegExp('WA\\.driverLedger\\.' + m + '\\b', 'g');
    let n = 0, mm;
    while ((mm = re.exec(src)) !== null) n++;
    if (n) hits[m].push(rel + '×' + n);
  }
}

console.log('=== driverLedger 九口的字面引用面（不含自身文件）===');
let dead = [];
MEMBERS.forEach(function (m) {
  const h = hits[m];
  if (!h.length) { dead.push(m); console.log('  ✗ ' + m + '：产品侧零引用'); }
  else console.log('  ✓ ' + m + '：' + h.join(' '));
});
console.log('\n死口 ' + dead.length + (dead.length ? '：' + dead.join(' ') : ''));

// ── 反向：这些引用是否也能被引擎的静态扫描看见（口径一致性）──────────
//   引擎扫的是 `WA.ns.mem(` 形态（带左括号的调用）。只读属性引用（.DEF、.stat 之类）
//   不匹配那条正则 —— 这意味着引用面与扫描面不同宽，必须说清是否影响死导出账本。
console.log('\n=== 调用形态 vs 属性形态（引擎正则只认带括号的调用）===');
MEMBERS.forEach(function (m) {
  let callForm = 0, propForm = 0;
  for (const rel of PROD) {
    if (rel === 'engines/driver-ledger.js') continue;
    const src = read(rel);
    if (!src) continue;
    const reC = new RegExp('WA\\.driverLedger\\.' + m + '\\s*\\(', 'g');
    const reP = new RegExp('WA\\.driverLedger\\.' + m + '\\b(?!\\s*\\()', 'g');
    let mm;
    while ((mm = reC.exec(src)) !== null) callForm++;
    while ((mm = reP.exec(src)) !== null) propForm++;
  }
  console.log('  ' + m + '：调用 ' + callForm + ' 处，属性 ' + propForm + ' 处');
});