'use strict';
/* p_cycle_attrib_77.js —— 摘除归因：OPV7-7 的新增代码到底带来了几条边
 *
 * 纪律 14：红灯原因要对。B2 报 195 + 2520 = 2715，上一账是 195 + 2519 = 2714。
 * 差值 +1 必须能指认到「哪一条 (file, ns) 对」，否则不许回填常量。
 * 手法：把本次新增的 WA.render 读（两处）摘掉，重跑 M.audit()，看调用期边是否回到 2519。
 */
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);

const gsrc = fs.readFileSync(path.join(BASE, 'tests/module-cycle-gate-v2107.js'), 'utf8');
// 直接复用门禁自己的 audit 实现（唯一真源，不另写一份）
const m = require(path.join(BASE, 'tests/module-cycle-gate-v2107.js'));

console.log('=== 1) 现场读数（原样）===');
const a0 = m.audit();
console.log(JSON.stringify({ edgesLoad: a0.edgesLoad, edgesCall: a0.edgesCall, nsProvided: a0.nsProvided, nsLedger: a0.nsLedger }, null, 0));

console.log('\n=== 2) 摘除：把 engines/health-preflight.js 的 render 读摘掉后重算 ===');
// audit() 内部读文件；用「读面改写」的方式摘除，不改仓库文件
const HP = path.join(BASE, 'engines/health-preflight.js');
const orig = fs.readFileSync(HP, 'utf8');
const stripped = orig
  .replace(/WA\.render && typeof WA\.render\.visibilityStat === 'function'/g, 'false')
  .replace(/WA\.render\.SOURCES/g, '[]');
fs.writeFileSync(HP, stripped, 'utf8');
let a1 = null;
try { a1 = m.audit(); } catch (e) { console.log('audit ERR', e.message); }
fs.writeFileSync(HP, orig, 'utf8');     // 无条件还原
const back = fs.readFileSync(HP, 'utf8') === orig;
console.log('还原成功 =', back);
console.log(JSON.stringify({ edgesLoad: a1 && a1.edgesLoad, edgesCall: a1 && a1.edgesCall, nsProvided: a1 && a1.nsProvided, nsLedger: a1 && a1.nsLedger }, null, 0));

console.log('\n=== 3) 差值归因 ===');
console.log('edgesCall: ' + (a1 && a1.edgesCall) + ' -> ' + a0.edgesCall + '  (Δ ' + (a0.edgesCall - (a1 && a1.edgesCall)) + ')');
console.log('edgesLoad: ' + (a1 && a1.edgesLoad) + ' -> ' + a0.edgesLoad + '  (Δ ' + (a0.edgesLoad - (a1 && a1.edgesLoad)) + ')');
console.log('合计恒等式现场 =', a0.edgesLoad + ' + ' + a0.edgesCall + ' = ' + (a0.edgesLoad + a0.edgesCall));

console.log('\n=== 4) 逐条边：health-preflight 现在读了哪些 ns ===');
try {
  const rows = a0.callEdges || a0.edges || [];
  // 若 audit 不暴露逐条，退化为源码扫描（仍是同一判据：源文件里出现的 WA.<ns>）
  const src = orig;
  const ns = new Set();
  const re = /WA\.([A-Za-z_][A-Za-z0-9_]*)/g;
  let mm;
  while ((mm = re.exec(src))) ns.add(mm[1]);
  console.log('health-preflight 源码里出现的 WA.<ns>：', Array.from(ns).sort().join(', '));
} catch (e) { console.log('err', e.message); }