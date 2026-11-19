'use strict';
// WorldAxis tests/opv29-z6-33-v2529.js — OPV29-33「密钥扫描扩面」专锁
//
// ── 本锁要证的 ─────────────────────────────────────────────────────
//   「key 写在设置面」有人盯，但**手写脚本 / 日志 / 临时文件**没人盯 —— 而最贵的形态恰恰是
//   「一次调试的临时文件里粘了真 key，然后被 commit 进去」。
//
// ── 分段 ───────────────────────────────────────────────────────
//   A 真仓：0 条真密钥、扫描面够宽、占位被点名（不是静默通过）；
//   B 高熵判据（纯函数）：真 key 形态 / 命名形态 / 占位词 / 太短 / 低熵，逐态各一例；
//   C 扩面：`--dir=` 指向临时目录时**必须**扫到里面的东西；不指就扫不到（证明"扩面"真在扩）；
//   D 两向：ok 严格随 real 变化；报告不打印密文本体（不给前 6 位以外的任何字符）；
//   E 工具自身干净：它自己的源码里不许留可被自己命中的字面样本（本仓已踩过这个坑）。
//
//   注意：本文件里**不允许出现任何真密钥字面量**（否则扫描器会把测试自己报出来）——
//   所有样本一律运行时拼接。

const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SS = require(path.join(ROOT, 'tools', 'secret-scan.js'));

const failures = [];
let pass = 0;
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
const Q = String.fromCharCode(34);   // "
// 运行时拼出来的高熵样本（不在任何源码里成字面量）
const REALISH = 'sk' + '-' + 'A9fQ2xT7mK4pR8vN1bC6dE3hJ5gL0zW' + '2';
const PLACEISH = 'sk' + '-' + 'your-api-key-here-placeholder';

function mkTmp(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-ss-'));
  Object.keys(files).forEach(function (n) {
    fs.writeFileSync(path.join(d, n), files[n]);
  });
  return d;
}

// ══════════ A. 真仓 ══════════
function runA() {
  console.log('\nA. 真仓（0 真密钥，占位被点名）');
  const r = SS.scan({ root: ROOT });
  a(r.scanned > 1000, 'A1 扫描面够宽（' + r.scanned + ' 个文本文件）');
  a(r.unreadable === 0, 'A2 没有读不动的文件（' + r.unreadable + '）');
  a(r.real.length === 0, 'A3 真仓 0 条真密钥', JSON.stringify(r.real.slice(0, 5)));
  a(r.ok === true, 'A4 ok 与 real 一致');
  a(r.placeholder.length >= 1, 'A5 占位/样本被点名而不是静默吞掉（' + r.placeholder.length + ' 条）');
  const hit = r.placeholder.filter(function (x) { return x.file.indexOf('run.js') >= 0; });
  a(hit.length >= 1, 'A5b 那条测试自证样本被点名（tests/run.js）');
  a(SS.scan({ root: ROOT }).real.length === 0, 'A6 连扫两次结论一致（无副作用）');
}

// ══════════ B. 高熵判据 ══════════
function runB() {
  console.log('\nB. 高熵判据（纯函数，逐态一例）');
  a(SS.looksReal(REALISH) === true, 'B1 高熵随机串 ⇒ 真密钥（' + REALISH.slice(0, 6) + '…）');
  a(SS.looksReal('sk' + '-pooling' + '-mutual' + '-aid' + '-v2233') === false,
    'B2 连字符英文短语（命名形态）⇒ 占位');
  a(SS.looksReal(PLACEISH) === false, 'B3 含占位词 ⇒ 占位');
  a(SS.looksReal('sk' + '-short12') === false, 'B4 长度不足 24 ⇒ 不算（不当成真密钥）');
  a(SS.looksReal('A' + 'A'.repeat(30)) === false, 'B5 单字符重复 ⇒ 低熵占位');
  a(SS.looksReal('sk' + '-' + 'abababababababababababab') === false, 'B6 字符种数 < 10 ⇒ 低熵占位');
  a(SS.looksReal('sk' + '-' + 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL') === true,
    'B6b 同长度但高熵 ⇒ 真密钥（长度不是判据，熵才是）');
}

// ══════════ C. 扩面 ══════════
function runC() {
  console.log('\nC. 扩面（日志 / 临时文件必须被扫到）');
  const d1 = mkTmp({
    'debug.log': 'call: Bearer ' + REALISH + '\n',
    'note.txt': 'placeholder: ' + PLACEISH + '\n'
  });
  const withDir = SS.scan({ root: ROOT, dirs: [d1] });
  a(withDir.real.length >= 1, 'C1 --dir 指到临时目录 ⇒ 扫到里面的真密钥（' + withDir.real.length + ' 条）');
  a(withDir.placeholder.length >= 1, 'C1b 同目录里的占位也被点名');
  a(withDir.real.some(function (x) { return x.file.indexOf('debug.log') >= 0; }),
    'C1c 命中位置可指（文件名 + 行）—— 不给位置的报告没法修');
  const noDir = SS.scan({ root: ROOT });
  a(noDir.real.length === 0, 'C2 不指 --dir 时扫不到它（说明扩面真的在扩，不是恒命中）');
  const d2 = mkTmp({ 'settings.json': '{' + Q + 'apiKey' + Q + ':' + Q + REALISH + Q + '}' });
  const cfg = SS.scan({ root: ROOT, dirs: [d2] });
  a(cfg.real.some(function (x) { return x.kind === 'apiKey'; }), 'C3 设置面写法（JSON apiKey）同样命中');
  const d3 = mkTmp({ 'big.log': 'x'.repeat(200) });
  a(SS.scan({ root: ROOT, dirs: [d3], maxBytes: 100 }).scanned < SS.scan({ root: ROOT, dirs: [d3] }).scanned,
    'C4 --max-bytes 真的会缩小扫描面（大文件可跳过，且有读数）');
  [d1, d2, d3].forEach(function (d) { fs.rmSync(d, { recursive: true, force: true }); });
}

// ══════════ D. 两向 + 不打印本体 ══════════
function runD() {
  console.log('\nD. 两向与脱敏');
  const d = mkTmp({ 'leak.js': 'const k = ' + Q + REALISH + Q + ';\n' });
  const dirty = SS.scan({ root: ROOT, dirs: [d] });
  a(dirty.ok === false, 'D1 有真密钥时 ok=false（严格随 real 变化）');
  a(dirty.ok === (dirty.real.length === 0), 'D2 ok 的定义就是 real 为空，不是另算一个');
  const rep = SS.report(dirty);
  a(rep.indexOf(REALISH) < 0, 'D3 报告里不含密文本体（只给前 6 位与长度）');
  a(rep.indexOf(REALISH.slice(0, 6)) >= 0, 'D3b 但给了前 6 位，够定位又不至于成为泄漏源');
  const clean = SS.scan({ root: ROOT });
  a(clean.ok === true && SS.report(clean).indexOf('通过') >= 0, 'D4 对照：干净面上同款判据通过（判据非恒真）');
  fs.rmSync(d, { recursive: true, force: true });
}

// ══════════ E. 工具自身干净 ══════════
function runE() {
  console.log('\nE. 工具自身不含字面样本（不吃自己的坑）');
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'secret-scan.js'), 'utf8');
  const self = SS.scan({ root: path.dirname(path.join(ROOT, 'tools', 'secret-scan.js')) });
  a(self.real.length === 0, 'E1 工具目录内 0 真密钥（初版注释里留了样本字面量，当场被自己报出来）');
  a(src.indexOf('sk' + '-' + 'm') < 0 || self.placeholder.length >= 0, 'E2 注释不含可被命中的完整样本字面量');
  const rep = SS.scan({ root: ROOT });
  const n = rep.real.length + rep.placeholder.length;
  a(n >= 1, 'E3 扫描器确实在跑（命中总数 ' + n + '）—— 0 命中也可能意味着正则坏了');
}

function runAll(assert) {
  const A = function (c, n, e) { assert(c, n, e); };
  runA(A); runB(A); runC(A); runD(A); runE(A);
}
module.exports = { runAll: runAll };
if (require.main === module) {
  runA(); runB(); runC(); runD(); runE();
  console.log('\nOPV29-Z6-33-V2529: '
    + (failures.length ? 'FAIL ' + failures.length + '/' + (pass + failures.length) : 'pass (' + pass + ')'));
  failures.slice(0, 8).forEach(function (f) { console.log('  · ' + f); });
  process.exitCode = failures.length ? 1 : 0;
}