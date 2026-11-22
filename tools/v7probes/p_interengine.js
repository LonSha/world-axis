'use strict';
// 探针：第四个驱动面 —— engines/ 与 core/ 之间的互调
//   已实证：render/ 调 buildBlock 是渲染读（不构成驱动）。
//   未实证：engines/ 之间互调算什么？memorySampler 被 sampler-check 调 sampleEntries
//           —— 那是逻辑在用它，与「渲染在读」不是一回事。
//   但 engines/ 里也可能大量调 buildBlock（比如汇总块）。必须先量化再定判据，
//   不可照搬「任何调用都算驱动」（那会让 L3 归零）。
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

function kebab(ns) { return ns.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(); }

// 按目录分组统计「谁调了哪些成员」
const STAT = {};
function bump(dir, mem) {
  if (!STAT[dir]) STAT[dir] = {};
  STAT[dir][mem] = (STAT[dir][mem] || 0) + 1;
}
const RE = /WA\.([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
for (const rel of PROD) {
  const src = read(rel);
  if (!src) continue;
  const dir = rel.indexOf('/') >= 0 ? rel.split('/')[0] : '(root)';
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(src)) !== null) {
    const ns = m[1], mem = m[2];
    // 排除自己文件调自己
    if (rel === 'engines/' + kebab(ns) + '.js') continue;
    bump(dir, mem);
  }
}
console.log('=== 各目录调成员频次（排除自身文件）===');
for (const dir of Object.keys(STAT)) {
  const arr = Object.keys(STAT[dir]).map(function (k) { return [k, STAT[dir][k]]; });
  arr.sort(function (a, b) { return b[1] - a[1]; });
  console.log('\n[' + dir + ']  共 ' + arr.reduce(function (s, x) { return s + x[1]; }, 0) + ' 处调用');
  console.log('  ' + arr.slice(0, 22).map(function (x) { return x[0] + '×' + x[1]; }).join(' '));
}

// 关键：engines/ 与 core/ 里 buildBlock 占比多少
console.log('\n=== engines/ 与 core/ 里 buildBlock 的量 ===');
for (const dir of ['engines', 'core']) {
  const t = STAT[dir] || {};
  const total = Object.keys(t).reduce(function (s, k) { return s + t[k]; }, 0);
  const bb = t.buildBlock || 0;
  console.log(dir + ': 总 ' + total + ' 处，其中 buildBlock ' + bb + ' 处（' + (total ? (bb / total * 100).toFixed(1) : 0) + '%）');
}

// engines/ 里调 buildBlock 的原文件清单
console.log('\n=== engines/ 内哪些文件在调 buildBlock ===');
RE.lastIndex = 0;
const bbFiles = {};
for (const rel of PROD) {
  if (rel.indexOf('engines/') !== 0) continue;
  const src = read(rel);
  const re2 = /WA\.([A-Za-z_$][\w$]*)\s*\.\s*buildBlock\s*\(/g;
  let m;
  while ((m = re2.exec(src)) !== null) {
    if (rel === 'engines/' + kebab(m[1]) + '.js') continue;
    bbFiles[rel] = (bbFiles[rel] || 0) + 1;
  }
}
const bf = Object.keys(bbFiles).map(function (k) { return [k, bbFiles[k]]; });
bf.sort(function (a, b) { return b[1] - a[1]; });
bf.slice(0, 15).forEach(function (x) { console.log('  ' + x[0] + ' -> ' + x[1] + ' 处'); });
console.log('  合计文件 ' + bf.length + ' 个，' + bf.reduce(function (s, x) { return s + x[1]; }, 0) + ' 处');

// engines/ 互调（排除 buildBlock 等展示口）覆盖哪些引擎
const SHOW = { buildBlock: 1, view: 1, getSettings: 1, stat: 1, statView: 1, DEF: 1,
  summaryText: 1, invalidate: 1, why: 1, settings: 1 };
const covered = {};
RE.lastIndex = 0;
for (const rel of PROD) {
  if (rel.indexOf('engines/') !== 0 && rel.indexOf('core/') !== 0) continue;
  const src = read(rel);
  const re3 = /WA\.([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re3.exec(src)) !== null) {
    const ns = m[1], mem = m[2];
    if (rel === 'engines/' + kebab(ns) + '.js') continue;
    if (SHOW[mem]) continue;
    covered[ns] = (covered[ns] || 0) + 1;
  }
}
const cv = Object.keys(covered).map(function (k) { return [k, covered[k]]; });
cv.sort(function (a, b) { return b[1] - a[1]; });
console.log('\n=== engines/+core/ 互调（排除展示口）覆盖 ' + cv.length + ' 个命名空间 ===');
console.log('  ' + cv.slice(0, 50).map(function (x) { return x[0] + '×' + x[1]; }).join(' '));