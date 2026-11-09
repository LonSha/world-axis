/**
 * 测试/工具侧越界：区分「带守卫的可选导出探测」与「无条件裸调用」(v2.381.0)
 *
 * 前者是合法写法（探测某引擎是否在场，不在场就跳过），不该判红；
 * 后者才是真正的测试桩错误。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const cases = [
  'affect.set', 'bonds.set', 'rumor.start', 'weather.set', 'store.set',
  'uiSettings.lanes', 'commission.propose', 'foreshadow.add', 'longline.addPromise',
  'plan.expandGoal', 'workflow.chains', 'org.RESOURCES', 'driverLedger.build',
  'driverLedger.invalidate', 'atlas.resetStat', 'events.plan', 'injectBudget.priorityOf',
  'injectInspector.faceAudit', 'life.fairness', 'life.turn', 'render.SRC_NAME',
  'render.costStat', 'render.engineCall', 'render.engineCost', 'render.noteCost',
  'supplyChain.buildBlock', 'toolDiag.diagnostics', 'toolSnapshot.subsetJSON',
  'store.dump', 'apiRouter._c', 'capabilityTier.setSettings'
];

const gate = cases.map((c) => {
  const parts = c.split('.');
  return { key: c, re: new RegExp('WA\\s*\\.\\s*' + parts[0] + '\\s*\\.\\s*' + parts[1] + '\\b') };
});

let guardCount = 0, bareCount = 0;
const bareList = [];

function walk(dir, acc) {
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git') continue;
    const p = path.join(dir, n);
    let st;
    try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (n.endsWith('.js')) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT, []).filter((f) => {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  return rel.startsWith('tests/') || rel.startsWith('tools/');
});

for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    for (const g of gate) {
      if (!g.re.test(ln)) continue;
      const guarded = /(\?\s*[^:]|&&|\btypeof\b|\|\||^\s*if\s*\()/.test(ln);
      if (guarded) guardCount++;
      else { bareCount++; bareList.push({ key: g.key, file: rel, line: i + 1, text: ln.trim().slice(0, 160) }); }
    }
  }
}

console.log('带守卫的可选导出探测: ' + guardCount + ' 处（合法，不计缺陷）');
console.log('无守卫的裸调用:       ' + bareCount + ' 处（真实测试桩错误）');
if (bareList.length) {
  console.log('');
  console.log('--- 裸调用明细 ---');
  for (const b of bareList) {
    console.log('  ' + b.key + '  ' + b.file + ':' + b.line);
    console.log('      ' + b.text);
  }
}
if (process.argv.indexOf('--json') !== -1) {
  console.log(JSON.stringify({ guardCount, bareCount, bare: bareList }, null, 2));
}