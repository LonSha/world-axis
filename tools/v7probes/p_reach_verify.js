'use strict';
// 探针：核查可达性扩张的两处风险
//   ① NSFILE 由 kebab 反推命名空间，可能一对多/反错 —— 核一遍冲突
//   ② 新增的 4 条边（bonds/fondness/sceneSlice/enigma）必须逐条读原文，
//      确认「调用方自己确实可达」，且「被调成员不是展示口」。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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

// ① NSFILE 冲突核查
const NSFILE = {}, conflict = [];
for (const rel of PROD) {
  const m = rel.match(/^engines\/(.+)\.js$/);
  if (!m) continue;
  const stem = m[1].replace(/-([a-z0-9])/g, function (_, c) { return c.toUpperCase(); });
  if (NSFILE[stem] && NSFILE[stem] !== rel) conflict.push(stem + ': ' + NSFILE[stem] + ' vs ' + rel);
  NSFILE[stem] = rel;
}
console.log('=== ① NSFILE 反推冲突 ===');
console.log(conflict.length ? conflict.join('\n') : '无冲突（' + Object.keys(NSFILE).length + ' 项）');

// 用 WA 树核对：有 buildBlock 的命名空间，NSFILE 指向的文件里是否真定义它
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const LOAD = vm.runInNewContext('[' + (read('tests/run.js').match(/const LOAD = \[([\s\S]*?)\];/)[1]) + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;
try { WA.store.init(); } catch (e) {}

const bb = Object.keys(WA).filter(function (k) {
  const o = WA[k]; return o && typeof o === 'object' && typeof o.buildBlock === 'function';
});
let bad = [];
for (const ns of bb) {
  const rel = NSFILE[ns];
  if (!rel) { bad.push(ns + ' → 无对应文件'); continue; }
  const src = read(rel);
  if (!new RegExp('WA\\.' + ns + '\\s*=').test(src)) bad.push(ns + ' → ' + rel + ' 里没有 WA.' + ns + ' =');
}
console.log('反推错配 ' + bad.length + ' 个' + (bad.length ? '：\n  ' + bad.slice(0, 12).join('\n  ') : ''));

// ② 逐条核查那 4 条新增边
const SHOW = { buildBlock: 1, view: 1, getSettings: 1, stat: 1, statView: 1, DEF: 1,
  summaryText: 1, invalidate: 1, why: 1, settings: 1 };
const TARGETS = ['bonds', 'fondness', 'sceneSlice', 'enigma'];
const RE = /WA\.([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;

for (const ns of TARGETS) {
  console.log('\n════════ ' + ns + ' 的调用来源 ════════');
  for (const rel of PROD) {
    if (NSFILE[ns] === rel) continue;
    const src = read(rel);
    if (!src) continue;
    let m, hits = [];
    RE.lastIndex = 0;
    while ((m = RE.exec(src)) !== null) {
      if (m[1] !== ns) continue;
      hits.push({ mem: m[2], at: m.index });
    }
    if (!hits.length) continue;
    for (const h of hits) {
      const s = Math.max(0, h.at - 130), e = Math.min(src.length, h.at + 80);
      console.log('  [' + rel + '] .' + h.mem + (SHOW[h.mem] ? '  ← 展示口' : '  ← 非展示') );
      console.log('     …' + src.slice(s, e).replace(/\n/g, ' ⏎ ') + '…');
    }
  }
}