'use strict';
// 探针：以「实际导出面」为名单核引用（不能拿旧名单去核收窄后的模块）
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

require(path.join(BASE, 'tests/mock.js'));
const g = global;
const LOAD = vm.runInNewContext('[' + (read('tests/run.js').match(/const LOAD = \[([\s\S]*?)\];/)[1]) + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;

const MEMBERS = Object.keys(WA.driverLedger);
console.log('实际导出面（' + MEMBERS.length + ' 口）：' + MEMBERS.join(' '));

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

const dead = [];
console.log('\n=== 逐口引用面 ===');
MEMBERS.forEach(function (m) {
  const h = [];
  for (const rel of PROD) {
    if (rel === 'engines/driver-ledger.js') continue;
    const src = read(rel);
    if (!src) continue;
    const re = new RegExp('WA\\.driverLedger\\.' + m + '\\b', 'g');
    let n = 0, mm;
    while ((mm = re.exec(src)) !== null) n++;
    if (n) h.push(rel + '×' + n);
  }
  if (!h.length) { dead.push(m); console.log('  ✗ ' + m + '：零引用'); }
  else console.log('  ✓ ' + m + '：' + h.join(' '));
});
console.log('\n死口 ' + dead.length + (dead.length ? '：' + dead.join(' ') : '（全绿）'));

// 撤销导出后，模块内部这些函数还有没有用到（不许留纯死函数）
console.log('\n=== 撤出导出面的三个函数，内部是否仍被调用 ===');
['build', 'invalidate', 'DEF'].forEach(function (fn) {
  const src = read('engines/driver-ledger.js');
  // build( 调用点（除定义处）
  const re = new RegExp('\\b' + fn + '\\s*\\(', 'g');
  let n = 0, mm;
  while ((mm = re.exec(src)) !== null) n++;
  const defRe = new RegExp('function\\s+' + fn + '\\s*\\(', 'g');
  let d = 0;
  while ((mm = defRe.exec(src)) !== null) d++;
  console.log('  ' + fn + '：定义 ' + d + ' 处，出现 ' + n + ' 处（含定义）');
});