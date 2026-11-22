/**
 * WorldAxis tests/reject-facediff-v2400.js (v2.400.0) — OPV22-6 专锁
 *
 * 它治的病：REJECT_FACE 快照与现场脱钩已是本仓**第八次**复制的形态
 * （v2.203/209/221/222/231/全量体检/v2.380/上轮）。每次都是「改了源码，忘了同步快照」，
 * 而发现它的是下一次全量回归 —— 几小时以后。
 *
 * audit() 早就能现场复算，缺的是让它成为**默认动作**。本版加 --check：
 * 输出「快照 / 现场 / 差额」三行，差额非零即 exit 1，并挂进 tools/smoke.js 快档。
 *
 * 本锁四档（关键在 C、D：证明 --check 不是恒绿）：
 *   A 快档成员存在（成员被误删则 --check 静默失效，没人发现）
 *   B --check 在场时退出码为 0 且输出含差额行
 *   C 人为篡改 audit 的现场读数 ⇒ --check 必须 exit 1（不是恒绿）
 *   D 还原后 --check 回到 0（不是恒红）
 */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let passed = 0; let failed = 0;
function a(cond, desc, detail) {
  if (cond) { passed++; console.log('  ✓ ' + desc); }
  else { failed++; console.error('  ✗ ' + desc + (detail ? ' — ' + detail : '')); }
}
const smokeSrc = fs.readFileSync(path.join(ROOT, 'tools/smoke.js'), 'utf8');
const recSrc = fs.readFileSync(path.join(ROOT, 'tools/reject-recovery.js'), 'utf8');
// A 快档成员真在册（且带 args）
a(smokeSrc.indexOf("'tools/reject-recovery.js'") >= 0,
  'A1: reject-recovery 已是快档成员（被误删则 --check 静默失效）');
a(/, args: \['--check'\]/.test(smokeSrc),
  'A2: 快档成员带 --check 参数（不带参数走完整报告，不是可判定的差额口径）');
a(recSrc.indexOf("'--check'") >= 0, 'A3: --check 分支真实存在于工具里');
// B 现场跑一次，差额行与退出码都要在
function runCheck() {
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools/reject-recovery.js'), '--check'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const r0 = runCheck();
a(r0.rc === 0, 'B1: 原版上 --check 退出码 0（实 ' + r0.rc + '）');
a(/差额/.test(r0.out), 'B2: 输出含「差额」读数行（实 ' + r0.out.split(String.fromCharCode(10))[0] + '）');
a(/快照/.test(r0.out), 'B3: 输出含「快照」数（与现场并列，读者能自己核对）');

// C --check 不是恒绿：人为破坏一次，它必须红
const orig = fs.readFileSync(path.join(ROOT, 'tools/reject-recovery.js'), 'utf8');
try {
  // 破坏方式：让 audit 的 problems 永远非空（模拟「快照少登记了一条」）
  const broken = orig.replace(
    'const diffs = a.problems.length + a.undecided.length + a.tainted.length;',
    'const diffs = 1 + a.problems.length + a.undecided.length + a.tainted.length;');
  a(broken !== orig, 'C0: 破坏锚点恰命中（不靠换行/缩进碰运气）');
  fs.writeFileSync(path.join(ROOT, 'tools/reject-recovery.js'), broken, 'utf8');
  const r1 = runCheck();
  a(r1.rc !== 0, 'C1: 人为制造差额 ⇒ --check 必须 exit 非 0（实 ' + r1.rc + '）—— 证明它不是恒绿');
  a(/✗/.test(r1.out), 'C2: 红的时候有显式✗标记，不是静默失败');
} finally {
  fs.writeFileSync(path.join(ROOT, 'tools/reject-recovery.js'), orig, 'utf8');
}
// D 还原后必须回到 0（不是恒红）
const r2 = runCheck();
a(r2.rc === 0, 'D1: 还原后 --check 回到 0（实 ' + r2.rc + '）—— 证明 C1 的红是破坏引起，不是恒红');
a(fs.readFileSync(path.join(ROOT, 'tools/reject-recovery.js'), 'utf8') === orig,
  'D2: 源码已逐字还原（判据自己不留伤痕）');

console.log('');
console.log('reject-facediff v2400 (OPV22-6): ' + passed + ' / 失败 ' + failed);
if (failed > 0) process.exit(1);
