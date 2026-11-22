#!/usr/bin/env node
// WorldAxis tests/opv29-z5-dep-v2529.js (v2.524.0) — OPV29-29 依赖零新增守门判据
//
// ── 这份判据在证什么 ─────────────────────────────────
//   A 真仓读数：1300+ 个 JS 真扫过，外部包 0（**不是「扫了 0 个文件」的空绿**）
//   B 单一真源：可选依赖白名单取自 tests/dependency-guard.js 的 OPTIONAL_DEPS，不另立一份
//   C 负控制·外部包：合成目录里放一个 require('…外部…') ⇒ 必须点名它，其余两个好文件不报
//   D 注释不是依赖：注释里写外部包 ⇒ 零违规（解释性文字不是病灶）
//   E 动态看不出：require(变量) ⇒ 不算违规但必须**被看见**（静默当绿是同一种病）
//   F 拼接痕迹不算包名：require('a' + b) ⇒ 不误报外部包
//   G CLI：--self-test 退出 0；--json 可解析且带 external 数组
//
// ── 为什么负控制用合成目录而不是改真仓 ───────────────────
//   真仓此刻正在跑全量回归；往真仓塞一行 require('…') 会让别的门禁同时变红，
//   那时「红」就分不清是本判据咬住的还是别人的。合成目录里一次只放一个病灶。

'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const BASE = path.resolve(__dirname, '..');
const TOOL = path.join(BASE, 'tools', 'dep-audit.js');
const TMP = path.join(os.tmpdir(), 'wa-dep-' + process.pid);

let pass = 0, fail = 0;
function a(cond, title) {
  if (cond) { pass += 1; console.log('  ✓ ' + title); }
  else { fail += 1; console.log('  ✗ ' + title); }
}
function mk(name, files) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  Object.keys(files).forEach(function (rel) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, files[rel], 'utf8');
  });
  return dir;
}

try {
  fs.mkdirSync(TMP, { recursive: true });
  const AUDIT = require(TOOL);

  // ── A 真仓读数 ───────────────────────────────────
  console.log('A 真仓：真扫过、外部包 0');
  const real = AUDIT.audit(BASE);
  a(real.ok === true && real.external.length === 0, 'A1: 真仓外部包 0（实 ' + real.external.length + '）');
  a(real.files > 1000, 'A2: 真扫到了产品面（文件 ' + real.files + ' 个，不是空绿）');
  a(real.builtin > 100 && real.local > 100, 'A3: 内置/本地两类都有读数（内置 ' + real.builtin + ' / 本地 ' + real.local + '）');
  a(real.optional.length > 0 && real.optional.every(function (x) { return x.mod === 'jsdom' || x.mod === 'playwright-core'; }),
    'A4: 已声明可选项恰是那两类（实 ' + JSON.stringify(real.optional.map(function (x) { return x.mod; }).slice(0, 4)) + '）');

  // ── B 单一真源 ───────────────────────────────────
  console.log('B 单一真源：白名单不另立');
  a(real.optionalTable === 2, 'B1: 白名单条数取自 dependency-guard.OPTIONAL_DEPS（实 ' + real.optionalTable + '）');
  const toolSrc = fs.readFileSync(TOOL, 'utf8');
  a(toolSrc.indexOf("'dependency-guard.js'") >= 0, 'B2: 工具源码里指向 dependency-guard（不是自己维护一份名单）');
  a(/builtinModules/.test(toolSrc), 'B3: 内置清单取自 module.builtinModules（不手写，跟着 node 走）');

  // ── C 负控制：外部包必须点名 ──────────────────────────
  console.log('C 负控制：外部包点名');
  const q = String.fromCharCode(39);
  const dirC = mk('c', {
    'good-core.js': "const fs = require('fs');\nconst p = require('./local.js');\nmodule.exports = { fs: fs, p: p };\n",
    'bad-eng.js': "const x = require(" + q + 'lod' + 'ash' + q + ");\nmodule.exports = x;\n",
    'good-two.js': "const os = require('os');\nmodule.exports = os;\n"
  });
  const rC = AUDIT.audit(dirC);
  a(rC.ok === false && rC.external.length === 1, 'C1: 一个外部包 ⇒ 恰报 1 条（实 ' + rC.external.length + '）');
  a(rC.external[0] && rC.external[0].file === 'bad-eng.js', 'C2: 点名的是坏文件（实 ' + (rC.external[0] && rC.external[0].file) + '）');
  a(rC.external[0] && rC.external[0].line === 1, 'C3: 行号对得上（实 ' + (rC.external[0] && rC.external[0].line) + '）');
  a(rC.files === 3, 'C4: 三个文件都扫到了（实 ' + rC.files + '）');

  // ── D 注释不是依赖 ─────────────────────────────────
  console.log('D 注释：解释性文字不是病灶');
  const dirD = mk('d', {
    'only-comment.js': '// 比如 require(' + q + 'lod' + 'ash' + q + ') 这种写法是禁止的\nconst a = 1;\nmodule.exports = a;\n'
  });
  const rD = AUDIT.audit(dirD);
  a(rD.ok === true && rD.external.length === 0, 'D1: 注释里的外部包不算依赖（实 ' + rD.external.length + '）');
  a(rD.unstripd === 0, 'D2: 该文件的注释确实剥掉了（unstripd ' + rD.unstripd + '）');

  // ── E 动态可见 ────────────────────────────────────
  console.log('E 动态：看不出 ≠ 没问题');
  const dirE = mk('e', {
    'dyn.js': 'const name = process.env.X || "./x.js";\nmodule.exports = require(name);\n'
  });
  const rE = AUDIT.audit(dirE);
  a(rE.dynamic.length === 1, 'E1: 非字面量 require 被记下来（实 ' + rE.dynamic.length + '）');
  a(rE.ok === true, 'E2: 但它不判违规（看不出来不等于有依赖）');
  a(rE.external.length === 0, 'E3: 也没有被误报成外部包');

  // ── F 拼接痕迹 ────────────────────────────────────
  console.log('F 拼接：不是包名');
  const dirF = mk('f', {
    'cat.js': 'const base = "./p";\nmodule.exports = require(base + "art.js");\n'
  });
  const rF = AUDIT.audit(dirF);
  a(rF.external.length === 0, 'F1: 拼接写法不被当成包名（实 ' + rF.external.length + '）');
  a(rF.dynamic.length >= 1, 'F2: 但它在动态面里可见（实 ' + rF.dynamic.length + '）');

  // ── G CLI ────────────────────────────────────────
  console.log('G CLI：三档同口径');
  const rSelf = cp.spawnSync(process.execPath, [TOOL, '--self-test'], { encoding: 'utf8' });
  a(rSelf.status === 0, 'G1: --self-test 退出 0（实 ' + rSelf.status + '）');
  const rJson = cp.spawnSync(process.execPath, [TOOL, '--json'], { encoding: 'utf8' });
  let oj = null;
  try { oj = JSON.parse(rJson.stdout); } catch (e) { oj = null; }
  a(!!oj && Array.isArray(oj.external), 'G2: --json 可解析且带 external 数组');
  a(!!oj && oj.ok === true, 'G3: --json 的 ok 与读数一致（真仓 0 外部）');
  const rCli = cp.spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
  a(rCli.status === 0 && String(rCli.stdout).indexOf('依赖合规: 0 个外部包') >= 0,
    'G4: 人读出口给出结论行且退出 0（实 ' + rCli.status + '）');
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 清不掉不掩盖结论 */ }
}

console.log('\nOPV29-Z5-DEP-V2529: ' + (fail === 0 ? 'pass' : 'FAIL ' + fail + ' / ' + (pass + fail)) + '（' + (pass + fail) + ' 项）');
process.exit(fail === 0 ? 0 : 1);