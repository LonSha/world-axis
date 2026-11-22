'use strict';
// WorldAxis tests/opv29-z4-v2529.js — OPV29-21 空转检测 + OPV29-23 抖测试治理 专锁
//
// ── 这两项为什么合成一把锁 ───────────────────────────────────────
//   它们治的是同一件事的两面：**判据的绿不能是运气**。
//   · Z4-21 空转：`src.replace('锚','坏版本')` 锚没命中时原样返回 —— 源码没坏，判据当然绿，
//     而人以为「负控制验证过了」。这是负控制自身空转。
//   · Z4-23 抖动：判据的绿取决于「这次几点/随机数多少」。
//   两面都要机制 + 行为判据，所以一个文件、两段。
//
// ── 现场读数（本锁第一次跑，可复算）────────────────────────
//   `node tools/flake-audit.js` ⇒ 扫描 593 文件 · 直采 268 处 · harness 53 · suspect 215
//   （剥注释后 268 处：`Date a·now` 类样本在注释里的不计。grep 的 349 含注释，两口径不同，不许含糊）
//    与 grep 计数不同：本工具**按行**计一次，grep 按出现次数。差异要写出来，不许含糊。）
//
// ── 分段 ─────────────────────────────────────────────────
//   A Z4-21：mutate 的四条路（命中 / 找不到锚 / 换了没变 / 恢复不干净）逐条两向
//   B Z4-23：三档分类两向 · suspect 点名到行 · **新增面零 suspect** · 连跑三次一致
//   C 行为负控制：造一个真的会抖的测试（打印时间戳）⇒ 三次必不一致；不抖的 ⇒ 一致
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
// 时间/随机的字面量不落在本文件里（否则扫描器把自己报成直采）
const NOW = 'Date' + '.now()';
const ROOT = path.join(__dirname, '..');
const M = require(path.join(ROOT, 'tools', 'mutate.js'));
const F = require(path.join(ROOT, 'tools', 'flake-audit.js'));
const failures = [];
let pass = 0;
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
function tmpdir(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), 'wa-z4-' + tag + '-')); }
function kindOf(fn) {
  try { fn(); return null; } catch (e) { return e.kind || 'unknown'; }
}

// ══════════ A. Z4-21 空转检测 ══════════
function runA() {
  console.log('\nA. OPV29-21 空转检测（改不到就必须报错）');
  const r1 = M.apply('const a = 1;\nconst b = 2;\n', 'const b = 2;', 'const b = 999;');
  a(r1.after.indexOf('const b = 999;') >= 0 && r1.after !== 'const a = 1;\nconst b = 2;\n' && r1.hits === 1,
    'A1 命中：文本确已改变且 hits=1', JSON.stringify(r1.hits));
  a(kindOf(function () { M.apply('abc', 'zzz', 'q'); }) === 'mutate-miss',
    'A2 找不到锚 ⇒ mutate-miss（「看不出来」不等于「没坏」）');
  a(kindOf(function () { M.apply('abc', 'b', 'b'); }) === 'mutate-airturn',
    'A3 from 与 to 相同 ⇒ mutate-airturn（换了个寂寞）');
  const r4 = M.apply('xa xa xa', 'xa', 'Z');
  a(r4.hits === 3 && r4.after === 'Z xa xa',
    'A4 多处命中：hits 如实报 3，非 all 模式只改第一处（不静默全改）', r4.after);
  // A5 真破坏 + 恢复：临时文件上做，逐字节复原
  const d1 = tmpdir('mut');
  const f1 = path.join(d1, 'x.js');
  fs.writeFileSync(f1, 'const CAP = 24;\n', 'utf8');
  const before = M.md5(fs.readFileSync(f1));
  let seen = '';
  const res = M.runUnderMutate(f1, 'const CAP = 24;', 'const CAP = 25;', function (m) {
    seen = fs.readFileSync(m.file, 'utf8');
    return 'during-ran';
  });
  a(seen.indexOf('CAP = 25') >= 0 && res.restored === true,
    'A5 破坏期间外部确实读到坏版本（不是只改了内存里的字符串）');
  a(M.md5(fs.readFileSync(f1)) === before, 'A6 跑完逐字节恢复（md5 回到原值）');
  // A7 fn 抛错也必须恢复
  let threw = false;
  try {
    M.runUnderMutate(f1, 'const CAP = 24;', 'const CAP = 25;', function () { throw new Error('judge-blew-up'); });
  } catch (e) { threw = true; }
  a(threw && M.md5(fs.readFileSync(f1)) === before,
    'A7 判据自己抛错时 finally 仍恢复（否则后面所有判据跑在被污染的面里）');
  // A8 空转即红（对真源码）：用一个不存在的锚，必须抛而不是静默
  const realSrc = fs.readFileSync(path.join(ROOT, 'engines', 'reading-bookmark.js'), 'utf8');
  a(kindOf(function () { M.apply(realSrc, '这个锚一定不存在于源码里-zzz', 'x'); }) === 'mutate-miss',
    'A8 对真源码用假锚 ⇒ mutate-miss（空转当场红，不会假装验证过）');
  // A9 对真源码能定位真锚（证明不是只能在玩具输入上工作）
  a(kindOf(function () { M.apply(realSrc, "'reading.marks'", "'reading.marksX'"); }) === null,
    'A9 真源码里的真锚能命中（改动落在文件里真实出现过的锚上）');
  // A10 CLI 两向
  const f2 = path.join(d1, 'y.js');
  fs.writeFileSync(f2, 'const K = 1;\n', 'utf8');
  const ok = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'mutate.js'), '--file=' + f2,
    '--from=const K = 1;', '--to=const K = 2;'], { encoding: 'utf8' });
  const bad = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'mutate.js'), '--file=' + f2,
    '--from=没有这个锚', '--to=const K = 2;'], { encoding: 'utf8' });
  a(ok.status === 0 && bad.status === 1 && bad.stdout.indexOf('mutate-miss') >= 0,
    'A10 CLI 两向：命中退出 0 / 空转退出 1 并点名 mutate-miss',
    'ok=' + ok.status + ' bad=' + bad.status);
  // A11 恢复失败必须报：把文件权限改成只读后再改，写回失败要抛（不许静默）
  const f3 = path.join(d1, 'z.js');
  fs.writeFileSync(f3, 'const Z = 1;' + String.fromCharCode(10), 'utf8');
  const origWrite = fs.writeFileSync;
  let dirty = null;
  try {
    fs.writeFileSync = function (p2, data, enc) {
      if (p2 === f3 && String(data).indexOf('const Z = 2;') >= 0) return;  // 破坏写入静默失败
      return origWrite(p2, data, enc);
    };
    M.runUnderMutate(f3, 'const Z = 1;', 'const Z = 2;', function () {});
  } catch (e) { dirty = e.kind; } finally { fs.writeFileSync = origWrite; }
  a(dirty === 'mutate-airturn' || dirty === 'mutate-restore-dirty',
    'A11 破坏没落地（写入静默失败）必须被报出来，不许当成「改过了」', String(dirty));
  fs.rmSync(d1, { recursive: true, force: true });
}

// ══════════ B. Z4-23 抖测试治理 ══════════
function runB() {
  console.log('\nB. OPV29-23 抖测试治理（三档 + 点名 + 新增面）');
  const res = F.audit(ROOT);
  a(res.ok === true, 'B1 扫描面可读（tests 目录在）', res.why);
  a(res.files >= 590 && res.total >= 250, 'B2 扫描面非空（' + res.files + ' 文件 / ' + res.total + ' 处直采）',
    res.files + '/' + res.total);
  a(res.harness.length + res.suspect.length + res.exempt.length === res.total,
    'B3 三档之和对得上总数（没有一处直采被丢掉）',
    (res.harness.length + res.suspect.length + res.exempt.length) + ' vs ' + res.total);
  const badRec = res.suspect.filter(function (s) { return !s.file || !s.line || !s.text; });
  a(badRec.length === 0, 'B4 suspect 每条都点名到 文件:行:片段（可逐条查）');
  // 分类规则两向
  a(F.classifyLine('const ms = ' + NOW + ' - t;') !== null,
    'B5 计时行被判 harness（同一行有耗时语境）');
  a(F.classifyLine('want(' + NOW + ', now);') === null,
    'B6 把真实时间当期望值的行不被豁免（判 suspect）');
  a(F.classifyLine('const dir = fs.mkdtempSync(path.join(os.tmpdir(), "x-"));') !== null,
    'B7 临时目录命名被判 harness');
  // 新增面：本批及之后的 opv29 专锁不许有直采
  const newSuspect = res.suspect.filter(function (s) { return s.file.indexOf('opv29-') >= 0; });
  a(newSuspect.length === 0, 'B8 新增面零 suspect（opv29-*.js 里不许直采时间/随机）',
    JSON.stringify(newSuspect.slice(0, 3)));
  a(F.RULES.length >= 4 && F.RULES.every(function (r) { return r.id && r.why && r.re; }),
    'B9 规则表每条都有 id/why/正则（规则被删空会让一切变 suspect）');
  // 连跑三次一致（真跑，剥耗时行）
  const rows = F.repeat(['tests/opv29-z5-28-v2529.js', 'tests/opv29-z3-18-v2529.js'], 3, ROOT);
  a(rows.every(function (x) { return x.stable && x.times === 3; }),
    'B10 连跑三次输出逐字节相同（z5-28 / z3-18）',
    JSON.stringify(rows.map(function (x) { return x.file + ':' + x.stable; })));
  // 空面不许当绿
  const empty = tmpdir('empty');
  const r2 = F.audit(empty);
  a(r2.ok === false && r2.why === 'tests-dir-missing',
    'B11 tests 目录缺失 ⇒ ok:false（不是「零直采」的假绿）', r2.why);
  fs.rmSync(empty, { recursive: true, force: true });
}

// ══════════ C. 行为负控制：真会抖的测试必须被逮住 ══════════
function runC() {
  console.log('\nC. 行为负控制（造一个真会抖的测试）');
  const d = tmpdir('probe');
  fs.writeFileSync(path.join(d, 'shaky.js'), 'console.log("t=" + ' + NOW + ');' + String.fromCharCode(10), 'utf8');
  fs.writeFileSync(path.join(d, 'steady.js'), 'console.log("ok");\n', 'utf8');
  const shaky = F.repeat(['shaky.js'], 3, d);
  const steady = F.repeat(['steady.js'], 3, d);
  a(shaky[0].stable === false,
    'C1 打印时间戳的测试 ⇒ 三次不一致（真抖会被当场逮住，不是「大概能发现」）',
    JSON.stringify(shaky[0].md5s));
  a(steady[0].stable === true && steady[0].times === 3,
    'C2 不抖的测试 ⇒ 三次一致（负控制不误报）');
  // normalize 两向：耗时行被剥、判据行保留
  const n1 = F.normalize('✓ A1 通过\n耗时 12ms\n✗ B2 失败');
  a(n1.indexOf('耗时') < 0 && n1.indexOf('A1') >= 0 && n1.indexOf('B2') >= 0,
    'C3 归一化只剥耗时行（判据行逐字保留，否则「剥」会把红也剥掉）', JSON.stringify(n1));
  fs.rmSync(d, { recursive: true, force: true });
}

function runAll(assert) {
  const A = function (c, n, e) { assert(c, n, e); };
  runA(A); runB(A); runC(A);
}
module.exports = { runAll: runAll };
if (require.main === module) {
  runA(); runB(); runC();
  console.log('\nOPV29-Z4-V2529: '
    + (failures.length ? 'FAIL ' + failures.length + '/' + (pass + failures.length) : 'pass (' + pass + ')'));
  failures.slice(0, 8).forEach(function (f) { console.log('  · ' + f); });
  process.exitCode = failures.length ? 1 : 0;
}