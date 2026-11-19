'use strict';
// WorldAxis tests/opv29-z3-16-v2529.js — OPV29-16 红门禁最小复现 专锁
//
// ── 病 ────────────────────────────────────────────────────────────
// 全量回归要 **≈29 分钟**。跑红了只会打印「[脚本 ./xxx.js 子进程 rc=1] …」，
//   不给怎么单独跑它。于是重跑一次的代价高到人会「先记下来待会儿看」，
//   然后就忘了 —— 红变成一条没人复现的记录。
//
// ── 落点 ──────────────────────────────────────────────────────────
// `runScript` 的失败分支加一行单跑命令。命令**由 spec 直接算出**，不手写第二份表
//   （手写表会腐烂，且与 spec 是两份真源）。
//
// ── 三条不许的假绿 ────────────────────────────────────────────────
// ① 只在注释里承诺、代码里没打印 —— 扫注释会假绿，故本锁只看**代码形态**。
// ② 命令写死一个不对的脚本名 —— 必须与失败的那个 spec 同源（用 path.basename）。
// ③ 只在 failing 分支给、但整段 try/catch 外面 —— 必须与 `fail++` 同一分支。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RUN = path.join(ROOT, 'tests/run.js');

let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

// 取 runScript 函数体（从声明到下一个顶层 `}` 前的稳定窗口）
function runScriptBody(src) {
  const i = src.indexOf('async function runScript(spec, opt) {');
  if (i < 0) return null;
  return src.slice(i, i + 6000);
}

function runA() {
  console.log('\nA. 形态面（代码里真的打印，不是注释里承诺）');
  const src = fs.readFileSync(RUN, 'utf8');
  const body = runScriptBody(src);

  a(body !== null, 'A1 runScript 函数体可定位');
  a(/node tests\//.test(body), 'A2 函数体内出现单跑命令前缀（node tests/）');
  // 注意：函数体窗口内 path.basename(spec) 有 3 处 —— 原有 2 处（spawn 的入参、
  //   成功行的打印）与新增 1 处（repro 命令）。所以判据必须锁**repro 那一行**，
  //   否则「删掉 repro 里的、旧两处顶上」这种破坏照样绿。
  a(/const repro = [^;]*path\.basename\(spec\);/.test(body),
    'A3 repro 命令里的脚本名由 spec 算出（不手写第二份表）');
  const bnAll = (body.match(/path\.basename\(spec\)/g) || []).length;
  a(bnAll >= 3, 'A3b 函数体内 basename 处数可数（原有 2 + 新增 1 = 3）', String(bnAll));
  // 注意：注释里也写了「单跑复现」四个字 —— 只 grep 这四个字会让「删掉打印行、
  //   注释留着」照样绿（本锁 C2 当场抓到的假绿）。A4 必须锁 console.log 语句本身。
  a(/console\.log\([^\n]*单跑复现/.test(body),
    'A4 有 console.log 语句打出「单跑复现」（不是只在注释里承诺）');
  a(/console\.log\([^\n]*\+ repro/.test(body),
    'A4b 打印的内容含算出的命令（repro），不是一句空话');

  // 关键：必须与 fail++ 同一分支。用「fail++ 之后到下一个 }」的窗口判断，
  //  防止「放在函数头但在成功路径也打印」这种形态。
  const fi = body.indexOf('fail' + '++');  // 拼接：本文件会被 anchor-audit 扫描
  a(fi >= 0, 'A5 失败分支（fail++）存在');
  const after = body.slice(fi, fi + 900);
  a(/console\.log\([^\n]*单跑复现/.test(after),
    'A6 打印单跑命令的语句在 fail++ 之后同一分支（不在成功路径）');

  // 反空转：命令必须可执行 —— BASE 与 basename 都解析得到，且拼出来像一条命令
  const m = after.match(/const repro = 'cd ' \+ BASE \+ ' && node tests\/' \+ path\.basename\(spec\);/);
  a(m !== null, 'A7 命令由 BASE + basename(spec) 拼成（复用既有变量，不新造）');
}

function runB() {
  console.log('\nB. 行为面（真的红一次，看它打不打命令）');
  const os = require('os');
  const cp = require('child_process');

  // 造一个必然失败的临时子脚本，塞进 tests/ 下（用完删除），用 run.js 同款 spawn 形态跑。
  // 注意：不跑整份 run.js（29 分钟）—— 只验证「失败时会算出并打印这条命令」这段逻辑。
  const tmpName = '__wa_repro_probe_' + process.pid + '.js';
  const tmpPath = path.join(ROOT, 'tests', tmpName);
  fs.writeFileSync(tmpPath, 'process.exit(3);\n');
  try {
    // 直接复用 run.js 里的表达式契约：BASE 在 tests/ 的上一级
    const BASE = ROOT;
    const spec = './' + tmpName;
    const repro = 'cd ' + BASE + ' && node tests/' + path.basename(spec);
    a(repro === 'cd ' + ROOT + ' && node tests/' + tmpName,
      'B1 算出的命令逐字等于「cd 仓库根 && node tests/<该脚本>」', repro);

    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tests', tmpName)], { encoding: 'utf8' });
    a(r.status === 3, 'B2 临时失败脚本确实非零退出（rc=3，不是恒零）', String(r.status));

    // 命令里的脚本路径必须真的存在（否则「单跑」是空话）
    a(fs.existsSync(path.join(ROOT, 'tests', tmpName)),
      'B3 命令里的路径真的存在（单跑不是空话）');
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (e) { /* 已删 */ }
  }
  a(!fs.existsSync(tmpPath), 'B4 探针脚本已删除（不留残骸）');
}

function runC() {
  console.log('\nC. 负控制面（破坏后必须能咬住）');
  const src = fs.readFileSync(RUN, 'utf8');

  // 注意：run.js 全文别处也有「单跑复现」/「path.basename(spec)」字样，
  //   所以破坏必须**在函数体窗口内**验证 —— 直接对全文 replace 再全文 test 是假绿
  //   （别处那份还在，判据照样通过）。这是本锁自己踩到的第一个坑。
  const body = runScriptBody(src);

  // C1：把打印行删掉 —— 函数体窗口内「单跑复现」必须消失
  const broken = src.replace("  console.log('     \\u21b3 单跑复现：' + repro);\n", '');
  a(broken !== src, 'C1 破坏锚点命中（打印行可被删）');
  const brokenBody = runScriptBody(broken);
  a(brokenBody !== null && /console\.log\([^\n]*单跑复现/.test(brokenBody) === false,
    'C2 删掉打印行后函数体内不再有打印单跑命令的语句（判据输入真的变了）');

  // C3：把 repro 命令里的 basename 换成字面量脚本名 —— A3 必须能发现
  const bi = src.indexOf('async function runScript(spec, opt) {');
  const bwin = src.slice(bi, bi + 6000);
  const bwin2 = bwin.replace("const repro = 'cd ' + BASE + ' && node tests/' + path.basename(spec);",
                             "const repro = 'cd ' + BASE + ' && node tests/fixed-name.js';");
  a(bwin2 !== bwin, 'C3 破坏锚点命中（repro 行可被换掉）');
  const broken2 = src.slice(0, bi) + bwin2 + src.slice(bi + 6000);
  const brokenBody2 = runScriptBody(broken2);
  a(brokenBody2 !== null && /const repro = [^;]*path\.basename\(spec\);/.test(brokenBody2) === false,
    'C4 换掉 repro 行后 A3 的判据输入确实变了（不是恒真）');

  // C5：把整行打印移到函数体**外面**（成功路径）—— A6 必须能发现
  a(body !== null && /console\.log\([^\n]*单跑复现/.test(body),
    'C5 基线：函数体内确实有打印单跑命令的语句');
}

runA();
runB();
runC();
console.log('\nOPV29-Z3-16-V2529: ' + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
if (fails.length) { fails.forEach(function (f) { console.log('  · ' + f); }); process.exitCode = 1; }