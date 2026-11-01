'use strict';
// 实证探针：读口集合应当**推导**出来，不是声明出来。
//   假设：render/ 只做注入装配（纯读），它调的成员就是读口；
//         ui/ 玩家控制面既读又写；engines/actors/direction 是模拟层（写）；
//         tool-diag / world-health 是诊断面（纯读）。
//   本探针把这个假设用真实调用点验一遍，而不是拍脑袋定名单。
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }
function walk(dir, out) {
  let ents = [];
  try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const groups = {
  render: walk('render', []),
  ui: walk('ui', []),
  diag: ['engines/tool-diag.js', 'engines/world-health.js'],
  sim: walk('engines', []).concat(walk('actors', []), walk('direction', []), walk('core', []), walk('compat', []), walk('design', []))
};
const RE = /WA\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;

function collect(files) {
  const m = {};   // ns -> {mem: count}
  for (const rel of files) {
    const src = read(rel);
    if (!src) continue;
    let x; RE.lastIndex = 0;
    while ((x = RE.exec(src)) !== null) {
      const b = m[x[1]] || (m[x[1]] = {});
      b[x[2]] = (b[x[2]] || 0) + 1;
    }
  }
  return m;
}
const R = collect(groups.render);
const U = collect(groups.ui);
const D = collect(groups.diag);
const S = collect(groups.sim);

// 每个组成员的使用频次（跨 ns 汇总）
function memFreq(m) {
  const f = {};
  Object.keys(m).forEach(function (ns) {
    Object.keys(m[ns]).forEach(function (k) { f[k] = (f[k] || 0) + m[ns][k]; });
  });
  return f;
}
const fR = memFreq(R), fU = memFreq(U), fD = memFreq(D), fS = memFreq(S);

function top(f, n) {
  return Object.keys(f).sort(function (a, b) { return f[b] - f[a]; }).slice(0, n)
    .map(function (k) { return k + '×' + f[k]; }).join(' ');
}
console.log('=== render/ 调的成员（假设=读口，' + groups.render.length + ' 文件）===');
console.log(top(fR, 40));
console.log('\n=== ui/ 调的成员（' + groups.ui.length + ' 文件）===');
console.log(top(fU, 40));
console.log('\n=== 诊断面调的成员（' + groups.diag.length + ' 文件）===');
console.log(top(fD, 30));
console.log('\n=== 模拟层调的成员（' + groups.sim.length + ' 文件）===');
console.log(top(fS, 40));

// 交叉验证：ui/ 里出现但 render/ 没有的成员 = 面板侧「操作」而非「显示」
const onlyU = Object.keys(fU).filter(function (k) { return !fR[k]; });
console.log('\n=== 只在 ui/ 出现的成员（面板操作面，共 ' + onlyU.length + '）===');
console.log(onlyU.sort(function (a, b) { return fU[b] - fU[a]; }).slice(0, 50).join(' '));

// render 全量集合 = 推导出的读口
const readPorts = Object.keys(fR);
console.log('\n推导读口集合大小 = ' + readPorts.length);
console.log('其中同时被模拟层调的（说明它也不纯是读）: '
  + readPorts.filter(function (k) { return fS[k]; }).sort(function (a, b) { return fS[b] - fS[a]; }).slice(0, 30).join(' '));