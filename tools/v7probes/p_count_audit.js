'use strict';
// 探针：为什么合计 104 ≠ total 109？缺的 5 个去哪了
//   分层函数必须满足「每行恰好落一档」—— 少了的行等于从台账里凭空消失，
//   多出来的行等于一个引擎被数了两次。两种都是假读数。
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
// 注：driverLedger 的扫描缓存自带签名（命名空间数/预取条数/装载条数），
//   扫描面一变下次 view() 自己重扫 —— 不需要（也已不再提供）invalidate()。
try { WA.store.init(); } catch (e) {}

const PROD = [];
for (const d of ['ui', 'engines', 'core', 'render', 'actors', 'direction', 'compat', 'design']) {
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
const pf = new Map();
WA.baseUrl = '';
for (const rel of PROD) { const t = read(rel); if (t && t.length >= 16) pf.set(rel, t); }
WA.__prefetch = pf;
WA.__loadOrder = PROD.slice();

const b = WA.driverLedger.build();
console.log('total = ' + b.total);
console.log('counts = ' + JSON.stringify(b.counts));
const sum = Object.keys(b.counts).reduce(function (s, k) { return s + b.counts[k]; }, 0);
console.log('counts 合计 = ' + sum + (sum === b.total ? '  ✓ 平' : '  ✗ 差 ' + (b.total - sum)));

// 逐行核：每行都有 layer 吗？layer 值都在桶里吗？
const bad = [];
b.rows.forEach(function (r) {
  if (!r.layer) bad.push(r.ns + ' layer 为空');
  else if (!(r.layer in b.counts)) bad.push(r.ns + ' layer=' + r.layer + ' 不在 counts 键里');
});
console.log('\n异常行 ' + bad.length + (bad.length ? '：\n  ' + bad.join('\n  ') : ''));

// 每档名单与 rows 里的实际归属核对
const byLayer = {};
b.rows.forEach(function (r) { (byLayer[r.layer] = byLayer[r.layer] || []).push(r.ns); });
Object.keys(b.counts).forEach(function (k) {
  const real = (byLayer[k] || []);
  const named = (b.layers[k] || []);
  const miss = real.filter(function (x) { return named.indexOf(x) < 0; });
  if (miss.length) console.log('  ' + k + '：rows 有但 layers 没收录 -> ' + miss.join(' '));
});
console.log('\n各档 rows 实数：');
Object.keys(byLayer).forEach(function (k) { console.log('  ' + k + ' = ' + byLayer[k].length); });

// layers 总数
let ln = 0;
Object.keys(b.layers).forEach(function (k) { ln += b.layers[k].length; });
console.log('\nlayers 合计 = ' + ln + (ln === b.total ? '  ✓' : '  ✗'));