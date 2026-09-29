#!/usr/bin/env node
// WorldAxis tests/anchor-scan-v2126.js —— v2.126.0（优化计划 P8）
//
// 【它治的病】
//   `tests/negative-control-audit.js`（v2.104.0）只覆盖「导出 `ANCHORS` 且形态统一」的锁（20/103）。
//   其余 82 把锁的锚点**无人核**：锚点漂了（从源码消失 / 在本文件出现多次）没有任何读数会说话，
//   而这样的锁其负控制会**静默哑火**（锚点没打中 ⇒ 破坏副本 == 原版 ⇒ 负控制恒绿）。
//   P8 新增 `tools/anchor-scan.js`：统一档**委托**既有审计器（不另写判定），非统一档走
//   一组具名形态模式做启发式，**只报不红**，认不出的如实归 unidentified。
//
// 【四条口径】
//   ① **不另写判定**：统一档的结论直接来自 `negative-control-audit.js`（同一份扫描面，
//      两个实现迟早在边界上分叉）。
//   ② **只报不红**：非统一档的问题写进 `issues`，门禁仍只看统一档（`gateProblems`）。
//      这是刻意的分步：先让不可见的可见，再谈把哪一档升格成门禁。
//   ③ **认不出就说认不出**：`unidentified` 逐条带原因（缺锚点 / 缺目标），
//      不拿「零问题」冒充「已覆盖」。
//   ④ **每条判定带证据**：`pattern`（哪条形态认出来的）+ `evidence`（锚点原文前 70 字），
//      读的人能对着证据复核，而不是只看一个数字。
//
// 【判据】
//   A 结构：扫描器在位 / 委托审计器（不 import 全仓锁）/ 形态模式表非空且带 what / 只报不红
//   B 运行时：覆盖数 ≥ 统一档 + 已识别；三类归因（not-found / not-unique / impure）都能出现；
//              unidentified 逐条带 why；统一档问题数 == 审计器的问题数（委托同源）
//   C 负控制：真源码破坏扫描器 ⇒ 同款判据现形（锚点识不出 / 委托断开 / 只报不红被改成红灯）
//   N 纯度：全部负控制跑完后原文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SCAN_REL = 'tools/anchor-scan.js';
const AUDIT_REL = 'tests/negative-control-audit.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
// 隔离装载：把扫描器装进一个**独立 vm**（它 require 审计器时走真磁盘，等价于 CLI 行为）
const vm = require('vm');
function loadScan(srcOverride) {
  // 剥掉 shebang：把它包进函数体会变成非法 token（node 只在**文件首行**认 #!）。
  const code = (srcOverride || src(SCAN_REL)).split('\n').filter(function (l, i) { return !(i === 0 && l.indexOf('#!') === 0); }).join('\n');
  const m = { exports: {} };
  const sandbox = {
    module: m, exports: m.exports, require: require, __dirname: path.dirname(path.join(BASE, SCAN_REL)),
    __filename: path.join(BASE, SCAN_REL), console: console, process: process,
    Buffer: Buffer, setTimeout: setTimeout, clearTimeout: clearTimeout
  };
  sandbox.global = sandbox; sandbox.globalThis = sandbox;
  // 注意：包装函数必须**被调用** —— 只求值一个函数表达式会得到「模块体从未执行」，
  //   而那种失败看起来像「扫描器返回空」，不是「装载断了」（本仓点名过的同族失真）。
  vm.runInNewContext('(function(module, exports, require, __dirname, __filename){' + code + '\n})'
    + '(module, exports, require, __dirname, __filename)', sandbox, { filename: SCAN_REL });
  return m.exports;
}
// ── 真源码破坏锚点（各须恰中 1 次；判据一律引用 ANCHORS.x.txt）───────────
const ANCHORS = {
  delegate: { rel: SCAN_REL, txt: 'const AUDIT = require(path.join(TESTS, \'negative-control-audit.js\'));' },
  patternTable: { rel: SCAN_REL, txt: 'const PATTERNS = [' },
  unidentified: { rel: SCAN_REL, txt: "out.kind = 'unidentified';" },
  gateFace: { rel: SCAN_REL, txt: 'gateProblems: uni.summary.problems' },
  auditExport: { rel: AUDIT_REL, txt: 'audit: audit,' }
};
// ── A 面：结构 ──────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2126/A: 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const s = src(SCAN_REL);
  a(s.indexOf(ANCHORS.delegate.txt) > 0,
    'v2126/A: 统一档**委托**既有审计器（不另写一份判定 —— 两个实现迟早在边界上分叉）');
  const M = loadScan();
  a(Array.isArray(M.PATTERNS) && M.PATTERNS.length >= 5,
    'v2126/A: 形态模式表非空（实 ' + (M.PATTERNS || []).length + ' 条）');
  a((M.PATTERNS || []).every(function (p) { return p.id && p.what && p.re && p.kind; }),
    'v2126/A: 每条形态带 id / what / re / kind（「what」是给读的人看的口径说明，不是装饰）');
  a(s.indexOf(ANCHORS.gateFace.txt) > 0,
    'v2126/A: 门禁面只算统一档（gateProblems = 统一档问题数）—— 非统一档只报不红');
  const reqCalls = (s.match(/require\(/g) || []).length - (s.match(/require\.main/g) || []).length;
  a(reqCalls <= 2,
    'v2126/A: 扫描器只 require 两个模块（实 ' + reqCalls + '）—— 不把全仓锁 import 进来（那会让工具本身变成污染源）');
  // run.js / 诊断的消费面（工具不接进产品链，但必须有人跑它）
  a(src('tests/run.js').indexOf('anchor-scan') > 0 || src('tools/anchor-scan.js').indexOf('require.main') > 0,
    'v2126/A: 工具自带 CLI 入口（require.main 分支）—— 不接进产品链，但必须可独立跑');
}
// ── B 面：运行时 ────────────────────────────────────────────────────
function runB(a) {
  const M = loadScan();
  const r = M.scan({});
  a(r && r.summary && typeof r.summary.locksTotal === 'number' && r.summary.locksTotal > 50,
    'v2126/B: 认到全仓锁总数（实 ' + (r.summary && r.summary.locksTotal) + '）');
  a(r.summary.reach === r.uniform.locks + r.nonUniform.scanned,
    'v2126/B: 覆盖数 = 统一档 + 非统一档已识别（实 ' + r.uniform.locks + ' + ' + r.nonUniform.scanned
      + ' = ' + r.summary.reach + '）—— 不许有落不进任何一档的锁');
  a(r.summary.reach > r.uniform.locks,
    'v2126/B: 覆盖面**确实**被推宽了（' + r.uniform.locks + ' → ' + r.summary.reach + '）'
      + '——若两者相等，本工具就只是把既有档重报一遍');
  a(r.uniform.problems === 0 && r.summary.gateProblems === 0,
    'v2126/B: 统一档零问题且门禁面为零（实 ' + r.uniform.problems + ' / ' + r.summary.gateProblems + '）');
  // 委托同源：扫描器报的统一档问题数 == 直接问审计器的问题数
  const A = require('./negative-control-audit.js');
  const direct = A.audit();
  a(r.uniform.problems === direct.summary.problems
    && r.uniform.anchors === direct.summary.anchors,
    'v2126/B: 统一档读数与审计器**同源**（问题 ' + r.uniform.problems + ' vs ' + direct.summary.problems
      + ' / 锚点 ' + r.uniform.anchors + ' vs ' + direct.summary.anchors + '）');
  a(r.unidentified.length === r.nonUniform.unidentified,
    'v2126/B: 未识别数逐条可查（实 ' + r.unidentified.length + ' 条，与汇总同源）');
  a(r.unidentified.every(function (u) { return u.file && u.why; }),
    'v2126/B: 每条未识别都给出原因（缺锚点 / 缺目标）—— 不拿「零问题」冒充「已覆盖」');
  a(r.nonUniform.unidentified > 0,
    'v2126/B: 如实存在认不出的锁（实 ' + r.nonUniform.unidentified + ' 把）——若为 0，说明模式表宽到能吞一切，那是另一种不可信');
  // 三类归因都出现了（not-found / impure 至少各一；not-unique 或 ambiguous 至少一）
  const kinds = {};
  r.issues.forEach(function (p) { kinds[p.kind] = (kinds[p.kind] || 0) + 1; });
  a((kinds['not-found'] || 0) >= 1 && (kinds['impure'] || 0) >= 1,
    'v2126/B: 真找出了问题（not-found ' + (kinds['not-found'] || 0) + ' / impure ' + (kinds['impure'] || 0) + '）');
  a(((kinds['not-unique'] || 0) + (kinds['ambiguous-target'] || 0)) >= 1,
    'v2126/B: 唯一性面有归因（not-unique ' + (kinds['not-unique'] || 0)
      + ' / ambiguous-target ' + (kinds['ambiguous-target'] || 0) + '）');
  a(r.issues.every(function (p) { return p.pattern && p.evidence; }),
    'v2126/B: 每条问题都带形态与证据（否则读的人只能看一个数字，无从复核）');
}
// ── C 面：负控制（真源码破坏 ⇒ 同款判据现形）────────────────────────
function runC(a) {
  const S0 = src(SCAN_REL), A0 = src(AUDIT_REL);
  const W = loadScan();
  // C1 摘掉形态模式表 ⇒ 非统一档全部变未识别（覆盖面回落到统一档）
  const broken1 = S0.split(ANCHORS.patternTable.txt).join('const PATTERNS = []; const __PATTERNS_DEAD = [');
  const M1 = (function () {
    const m = { exports: {} };
    try {
      vm.runInNewContext('(function(module, exports, require, __dirname, __filename){' + broken1 + '\n})'
        + '(module, exports, require, __dirname, __filename)',
        { module: m, exports: m.exports, require: require, __dirname: path.dirname(path.join(BASE, SCAN_REL)),
          __filename: path.join(BASE, SCAN_REL), console: console, process: process, Buffer: Buffer },
        { filename: SCAN_REL + '#broken1' });
    } catch (e) { /* 预期：无模式表时认不出 */ }
    return m.exports;
  })();
  let r1 = null;
  try { r1 = M1.scan ? M1.scan({}) : null; } catch (e) { r1 = null; }
  a(!r1 || r1.nonUniform.scanned === 0,
    'v2126/C1: 摘掉形态模式表 ⇒ 非统一档一个都认不出（实 '
      + (r1 ? r1.nonUniform.scanned : '(模块不可用)') + '）—— 覆盖面不是白来的');
  // C2 把只报不红改成红灯（gateProblems 含非统一档）⇒ 门禁面判据现形
  const broken2 = S0.split(ANCHORS.gateFace.txt)
    .join('gateProblems: uni.summary.problems + issues.length');
  const M2 = loadScan(broken2);
  const r2 = M2.scan({});
  a(r2.summary.gateProblems === r2.uniform.problems + r2.issues.length && r2.summary.gateProblems > 0,
    'v2126/C2: 「只报不红」被改成红灯后门禁面随之变红（实 ' + r2.summary.gateProblems + '）'
      + '—— 这条口径在读数上可辨，不是写在注释里的话');
  // C3 拆掉委托（自带一份统一档判定）——用「删掉那个 require」模拟，模块应当装载失败
  const broken3 = S0.split(ANCHORS.delegate.txt).join('const AUDIT = null;');
  let ok3 = false, why3 = '';
  try { loadScan(broken3).scan({}); } catch (e) { ok3 = true; why3 = String((e && e.message) || e).slice(0, 60); }
  a(ok3, 'v2126/C3: 拆掉委托后扫描**当场抛**（' + why3 + '）—— 委托是承重的，不是一个可选装饰');
  // C4 纯度：真文件逐字未变 + 原版判据仍为真
  a(src(SCAN_REL) === S0 && src(AUDIT_REL) === A0,
    'v2126/C4:（纯度）全部负控制跑完后两个真文件逐字未变');
  a(W.scan({}).summary.reach > W.scan({}).uniform.locks,
    'v2126/C4:（纯度）原版上同款判据为真 —— 两向自证成立');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: SCAN_REL
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); } catch (e) { fail++; console.log('  x A threw: ' + (e && e.stack)); }
  try { runB(a); } catch (e) { fail++; console.log('  x B threw: ' + (e && e.stack)); }
  try { runC(a); } catch (e) { fail++; console.log('  x C threw: ' + (e && e.stack)); }
  if (fail) { console.log('ANCHOR-SCAN-V2126: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('ANCHOR-SCAN-V2126: pass（' + pass + ' 项）');
}