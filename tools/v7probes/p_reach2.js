'use strict';
// 探针：用「文件本身定义了什么命名空间」建立文件→ns 映射，取代 kebab 反推
//   反推已验证有错配（perspective 无对应文件）。
//   新判据不需要猜任何成员语义：文件里写了 `WA.xxx = {` 就是它定义了 xxx。
//   扩张规则：源文件里定义的可达命名空间 → 该文件里所有 WA.dst.mem( 调用目标都可达。
//   不设「展示口」名单（那又是猜语义），改为限定扩张来源目录 = engines/ 与 core/：
//     实证 engines/ 内 buildBlock 仅 2 处（0.04%），core/ 0 处 —— 噪音可忽略；
//     而 render/ 的 102 处 buildBlock 天然被排除在外（render 不是扩张来源）。
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

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

const DEF_RE = /WA\.([A-Za-z_$][\w$]*)\s*=\s*\{/g;
const CALL_RE = /WA\.([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;

const FILE = {};   // rel -> { defs: Set(ns), calls: [[ns, mem]] }
let multiDef = [];
for (const rel of PROD) {
  const src = read(rel);
  if (!src) continue;
  const defs = [];
  let m;
  DEF_RE.lastIndex = 0;
  while ((m = DEF_RE.exec(src)) !== null) if (defs.indexOf(m[1]) < 0) defs.push(m[1]);
  const calls = [];
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(src)) !== null) calls.push([m[1], m[2]]);
  FILE[rel] = { defs: defs, calls: calls };
  if (defs.length > 1) multiDef.push(rel + ' -> ' + defs.join(','));
}
console.log('=== 文件定义解析 ===');
console.log('文件数 ' + Object.keys(FILE).length);
const enginesFiles = Object.keys(FILE).filter(function (r) { return r.indexOf('engines/') === 0; });
const defCount = {};
enginesFiles.forEach(function (r) { FILE[r].defs.forEach(function (d) { defCount[d] = (defCount[d] || 0) + 1; }); });
console.log('engines/ 文件 ' + enginesFiles.length + '，定义了 ' + Object.keys(defCount).length + ' 个不同命名空间');
console.log('一个文件定义多个命名空间的情况 ' + multiDef.length + ' 例' + (multiDef.length ? '：' + multiDef.slice(0, 6).join(' | ') : ''));

// 核对：带 buildBlock 的每个命名空间，都能找到定义它的文件吗
const vm = require('vm');
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const LOAD = vm.runInNewContext('[' + (read('tests/run.js').match(/const LOAD = \[([\s\S]*?)\];/)[1]) + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;
// 注：driverLedger 的扫描缓存自带签名（命名空间数/预取条数/装载条数），
//   扫描面一变下次 view() 自己重扫 —— 不需要（也已不再提供）invalidate()。
try { WA.store.init(); } catch (e) {}

const bb = Object.keys(WA).filter(function (k) {
  const o = WA[k]; return o && typeof o === 'object' && typeof o.buildBlock === 'function';
});
const DEF_OF = {};
Object.keys(FILE).forEach(function (rel) { FILE[rel].defs.forEach(function (ns) {
  if (!DEF_OF[ns]) DEF_OF[ns] = [];
  DEF_OF[ns].push(rel);
}); });
const noDef = bb.filter(function (ns) { return !DEF_OF[ns]; });
const multiFile = bb.filter(function (ns) { return DEF_OF[ns] && DEF_OF[ns].length > 1; });
console.log('\n带 buildBlock 的 ' + bb.length + ' 个命名空间：');
console.log('  找不到定义文件的 ' + noDef.length + (noDef.length ? '：' + noDef.join(' ') : ''));
console.log('  被多个文件定义的 ' + multiFile.length + (multiFile.length ? '：' + multiFile.map(function (n) { return n + '(' + DEF_OF[n].length + ')'; }).join(' ') : ''));

// ── 可达性不动点（新判据）────────────────────────────────────────────
const pf = new Map();
WA.baseUrl = '';
for (const rel of PROD) { const t = read(rel); if (t && t.length >= 16) pf.set(rel, t); }
WA.__prefetch = pf;
WA.__loadOrder = PROD.slice();
const v = WA.driverLedger.view();
const base = [].concat(v.layerNames.L1, v.layerNames.L2r, v.layerNames.L2p);
const reach = new Set(base);
const reachBy = {};

const eFiles = Object.keys(FILE).filter(function (r) {
  return r.indexOf('engines/') === 0 || r.indexOf('core/') === 0;
});
let round = 0;
while (round < 8) {
  round++;
  let added = [];
  for (const rel of eFiles) {
    const f = FILE[rel];
    if (!f.defs.length) continue;
    const srcReach = f.defs.filter(function (d) { return reach.has(d); });
    if (!srcReach.length) continue;
    for (const c of f.calls) {
      if (f.defs.indexOf(c[0]) >= 0) continue;   // 自己文件调自己
      if (reach.has(c[0])) continue;
      reach.add(c[0]);
      reachBy[c[0]] = srcReach[0] + '.' + c[1] + ' (' + rel + ')';
      added.push(c[0]);
    }
  }
  if (!added.length) break;
  console.log('第 ' + round + ' 轮 +' + added.length + '：' + added.slice(0, 14).join(' '));
}
console.log('\n可达集 = ' + reach.size + '（起点 ' + base.length + '，扩张 +' + (reach.size - base.length) + '）');

const covered = bb.filter(function (k) { return reach.has(k); });
const notCovered = bb.filter(function (k) { return !reach.has(k); });
console.log('带 buildBlock：覆盖 ' + covered.length + ' / 不可达 ' + notCovered.length);
console.log('\n仍不可达：\n  ' + notCovered.join(' '));
console.log('\n扩张新增（带 buildBlock 的）：');
covered.filter(function (k) { return !base.indexOf(k) >= 0 && reachBy[k]; }).forEach(function (k) {
  console.log('  ' + k + '  ← ' + reachBy[k]);
});