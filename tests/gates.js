/**
 * WorldAxis tests/gates.js (v2.381.0)
 *
 * 门禁统一入口：一次跑完全部「接口一致性」门禁，任一红即整体红。
 * 每道门禁都可以单独跑，也都有各自的负向自检脚本（见 tests/gate-selftests/）。
 *
 * 现有门禁：
 *   1. settings-bus-api-gate.js  —— settingsBus 面（34 成员真源）
 *   2. engines-ns-gate.js        —— `WA.engines.<name>` 命名空间层（双层注册缺口）
 *   3. member-surface-gate.js    —— 全仓成员级（覆盖面最大）
 *   4. linkage-verify.js         —— 关键级联联动的「实际生效」验证
 *
 * 用法：
 *   node tests/gates.js           # 全部跑一遍
 *   node tests/gates.js --quiet    # 只打印结论
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const QUIET = process.argv.indexOf('--quiet') !== -1;

const GATES = [
  { file: 'tests/settings-bus-api-gate.js', name: 'settingsBus 接口面' },
  { file: 'tests/engines-ns-gate.js', name: 'engines 命名空间层' },
  { file: 'tests/member-surface-gate.js', name: '全仓成员面' },
  { file: 'tests/linkage-verify.js', name: '级联联动生效' }
];

const TAGS = { '\u2713': '[OK]', '\u2717': '[X]', '!': '[!]' };
function clean(s) {
  return s.split('\n')
    .filter((l) => l.indexOf('[WorldAxis]') !== 0)
    .join('\n')
    .replace(/^\s+/, '');
}

let red = 0;
const rows = [];

for (const g of GATES) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, g.file)], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  const ms = Date.now() - t0;
  const ok = r.status === 0;
  if (!ok) red++;
  rows.push({ name: g.name, file: g.file, ok, ms });
  if (!QUIET) {
    console.log('\u2500\u2500\u2500 ' + g.name + '  (' + g.file + ')  ' + (ok ? '\u2713 \u7eff' : '\u2717 \u7ea2') + '  ' + ms + 'ms');
    const out = clean((r.stdout || '') + (r.stderr || ''));
    const lines = out.split('\n');
    // 只保留结论级信息：错误行 + 最后一行
    const interesting = lines.filter((l) => /^\s*\u2717|^\s*!|RESULT=|PASS|FAIL|\u95e8\u7981/.test(l));
    if (interesting.length) interesting.slice(0, 12).forEach((l) => console.log('    ' + l.trim()));
    else lines.slice(-3).forEach((l) => { if (l.trim()) console.log('    ' + l.trim()); });
    console.log('');
  }
}

console.log('\u2550\u2550\u2550 \u95e8\u7981\u6c47\u603b \u2550\u2550\u2550');
for (const r of rows) {
  console.log((r.ok ? '  \u2713 ' : '  \u2717 ') + r.name.padEnd(18, ' ') + String(r.ms).padStart(6, ' ') + 'ms   ' + r.file);
}
const total = rows.reduce((a, r) => a + r.ms, 0);
console.log('  \u5408\u8ba1 ' + total + 'ms');
if (red) {
  console.log('\n\u2717 GATES_FAIL (' + red + ' / ' + rows.length + ' \u9053\u7ea2)');
  process.exit(1);
}
console.log('\n\u2713 GATES_PASS (\u5168\u90e8 ' + rows.length + ' \u9053\u7eff)');
process.exit(0);