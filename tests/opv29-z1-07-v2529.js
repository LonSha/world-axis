#!/usr/bin/env node
// WorldAxis tests/opv29-z1-07-v2529.js — V29 优化线 Z1（OPV29-07）专锁
//
// 治的病
//   计划原文：「`tool-diag` 拆段：按注册表/诊断/面板三块拆，保留原导出面」，验收
//   「导出面对账零变化；拆段后门禁绿」。拆前 engines/tool-diag.js 是 8425 行：
//   四块**登记表**（磁盘模块→命名空间映射 561 条、可选面名单 23 条、渲染↔绑定
//   校验表 69 组、26 枚引擎端口表）被八千行采集节夹在中间。改一条登记要在里面翻，
//   而漏登记的症状是「自检看不见」而不是报错。
//
// 本锁钉住「表已出闸、导出面一字未变、次序硬约束还在、缺表不许静默退化」：
//   A 现场：引擎瘦身 + 表体量 + 表零算法 + 四表键数 + 引擎里已无那四块字面量 +
//           双登记同序（index.js / run.js）+ 两向自证 + 导出面对账零变化。
//   B 负控制：真起隔离装载 —— 只装引擎必抛 · 空表必抛 · 先表后引擎必成。
//   C 真跑：真宿主装载路径下的可用面（collect / secEngines230 / UI_BINDINGS 同源）。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++; const line = name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra));
  console.log('  ✗ ' + line); return false;
}
const RD = function (rel) {
  return fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8');
};
const lines = function (rel) { return RD(rel).split('\n').length - 1; };
const ENG = 'engines/tool-diag.js';
const TAB = 'engines/tool-diag-tables.js';

// ── A. 现场 ───────────────────────────────────────────
a(lines(ENG) <= 6100, 'A1 引擎已瘦身（实 ' + lines(ENG) + ' 行 ≤ 6100；拆前 8425）', lines(ENG));
a(lines(TAB) === 2467, 'A2 表体量（实 ' + lines(TAB) + ' 行 = 2467）', lines(TAB));
const tabSrc = RD(TAB);
const namedFns = (tabSrc.match(/function\s+[A-Za-z_$]/g) || []).length;
const iifes = (tabSrc.match(/\(function\s*\(\)/g) || []).length;
a(namedFns === 0 && iifes === 1,
  'A3 表零算法（具名函数 ' + namedFns + ' 个 / IIFE ' + iifes + ' 个）');

// 四表规模：逐字点名，防「搬过去时漏一块 / 少登记的条目被顺手删掉」
const ctx0 = { window: {}, console: { log: function () {}, warn: function () {}, error: function () {} } };
ctx0.global = ctx0;
vm.createContext(ctx0);
vm.runInContext(tabSrc, ctx0, { filename: TAB });
const T0 = ctx0.window.WorldAxis.toolDiagTables || {};
a(T0.MODULE_EXPORTS && Object.keys(T0.MODULE_EXPORTS).length === 561,
  'A4a MODULE_EXPORTS 561 条（实 ' + (T0.MODULE_EXPORTS ? Object.keys(T0.MODULE_EXPORTS).length : 'null') + '）');
a(Array.isArray(T0.OPTIONAL_EXPORTS) && T0.OPTIONAL_EXPORTS.length === 23,
  'A4b OPTIONAL_EXPORTS 23 条（实 ' + (T0.OPTIONAL_EXPORTS ? T0.OPTIONAL_EXPORTS.length : 'null') + '）');
a(Array.isArray(T0.UI_BINDINGS) && T0.UI_BINDINGS.length === 69,
  'A4c UI_BINDINGS 69 组（实 ' + (T0.UI_BINDINGS ? T0.UI_BINDINGS.length : 'null') + '）');
a(T0.ENGINE_PORTS && Object.keys(T0.ENGINE_PORTS).length === 26,
  'A4d ENGINE_PORTS 26 枚（实 ' + (T0.ENGINE_PORTS ? Object.keys(T0.ENGINE_PORTS).length : 'null') + '）');

// 引擎里已无那四块字面量定义
const engSrc = RD(ENG);
const GONE = ['const MODULE_EXPORTS = {', 'const OPTIONAL_EXPORTS = [', 'const UI_BINDINGS = [', 'const ENGINE_PORTS = {'];
const left = GONE.filter(function (s) { return engSrc.indexOf(s) >= 0; });
a(left.length === 0, 'A5 引擎里已无搬走的四块字面量（残留 ' + left.length + ' 处）', left);
a(/=\s*WA\.toolDiagTables\s*;/.test(engSrc) && /必须先于/.test(engSrc),
  'A6 求值期先取表（守卫 + 「必须先于」提示都在场）');

// 双登记同序：index.js 的 LOAD_ORDER 与 tests/run.js 的 LOAD
const IDX = RD('index.js'), RUN = RD('tests/run.js');
function orderOk(idx, run, tabRel, engRel) {
  const t1 = "'" + tabRel + "'", e1 = "'" + engRel + "'";
  const i1 = idx.indexOf(t1), i2 = idx.indexOf(e1);
  const r1 = run.indexOf(t1), r2 = run.indexOf(e1);
  return i1 > 0 && i2 > i1 && r1 > 0 && r2 > r1;
}
a(orderOk(IDX, RUN, TAB, ENG), 'A7 两份装载表同序：' + TAB + ' 在 ' + ENG + ' 之前');
const PH = '\u0000TAB\u0000';
const swapped = IDX.split("'" + TAB + "'").join(PH)
  .split("'" + ENG + "'").join("'" + TAB + "'")
  .split(PH).join("'" + ENG + "'");
a(!orderOk(swapped, RUN, TAB, ENG), 'A8 次序判据两向自证：把两文件位置互换 ⇒ 判假');

// 导出面对账零变化（逐字点名；写死的成员名单就是「拆段不许动导出面」的字面）
const EXP = ['collect', 'verdict', 'toJSON', 'summaryText', 'flatten', 'download', 'buildErrorReport',
  'secModules', 'secUi', 'secRuntime', 'secEngines230', 'ENGINE_PORTS', 'MODULE_EXPORTS', 'UI_BINDINGS',
  'OPTIONAL_EXPORTS', 'safe'];
const miss = EXP.filter(function (k) { return engSrc.indexOf(k) < 0; });
a(miss.length === 0, 'A9 导出面成员在位（缺 ' + miss.length + ' 个）', miss);
const decl = engSrc.slice(engSrc.lastIndexOf('WA.toolDiag = {'));
a(decl.indexOf('PACKAGE_FORMAT, PACKAGE_VERSION, MODULE_EXPORTS, UI_BINDINGS') > 0
  && decl.indexOf('secEngines230, ENGINE_PORTS') > 0,
  'A10 导出面那两行一字未改（注册表与端口表仍按原顺序导出）');

// ── B. 负控制（真起隔离装载）─────────────────────────
function load(parts) {
  const ctx = { console: { log: function () {}, warn: function () {}, error: function () {} }, window: {} };
  ctx.window.WorldAxis = { log: function () {}, registerModule: function () {}, workflow: { register: function () {} } };
  ctx.global = ctx;
  vm.createContext(ctx);
  parts.forEach(function (p) { vm.runInContext(RD(p), ctx, { filename: p }); });
  return ctx.window.WorldAxis;
}
function throwsWith(parts, re) {
  try { load(parts); return { threw: false, msg: '' }; }
  catch (e) { const m = String(e && e.message || e); return { threw: true, msg: m, hit: re.test(m) }; }
}
const r1 = throwsWith([ENG], /诊断表未装载/);
a(r1.threw && r1.hit, 'B1 只装引擎（不装表）⇒ 抛「诊断表未装载」', r1.msg);

{
  const tmp = '/tmp/wa07-empty.js';
  fs.writeFileSync(tmp, '(function () {\n  const WA = window.WorldAxis = window.WorldAxis || {};\n'
    + '  WA.toolDiagTables = { MODULE_EXPORTS: {}, OPTIONAL_EXPORTS: [], UI_BINDINGS: [], ENGINE_PORTS: null };\n})();\n');
  let msg = '';
  try { load([tmp, ENG]); } catch (e) { msg = String(e.message); }
  try { fs.unlinkSync(tmp); } catch (e) { void e; }
  a(/诊断表未装载/.test(msg), 'B2 空表（ENGINE_PORTS 为 null）⇒ 同样抛错', msg);
}

{
  const WA = load([TAB, ENG]);
  a(!!WA.toolDiag && typeof WA.toolDiag.collect === 'function',
    'B3 先表后引擎 ⇒ 引擎装载成功，collect 可用');
  a(WA.toolDiag.ENGINE_PORTS === WA.toolDiagTables.ENGINE_PORTS
    && WA.toolDiag.UI_BINDINGS === WA.toolDiagTables.UI_BINDINGS,
    'B3b 导出的是**同一份表对象**（不是复制品 —— 复制会让两处读数悄悄分叉）');
}

// ── C. 真跑（用真宿主装载路径）────────────────────────
const gate = require('../tests/ui-gate-sync.js');
const WA2 = gate.fresh().WA;
a(!!WA2.toolDiag && !!WA2.toolDiagTables, 'C1 真宿主装载后两件都在场');
{
  const diag = WA2.toolDiag.collect();
  a(diag && typeof diag === 'object' && Object.keys(diag).length > 20,
    'C2 collect() 真出读数（节数 ' + (diag ? Object.keys(diag).length : 'null') + ' > 20）');
  const mods = diag.modules || {};
  a(Array.isArray(mods.registeredModules) && mods.registeredModules.length > 300,
    'C3 secModules 真跑（注册模块 ' + (mods.registeredModules ? mods.registeredModules.length : 'null') + ' > 300）');
}
{
  const e230 = WA2.toolDiag.secEngines230();
  a(e230 && e230.totals && e230.totals.ns === 26,
    'C4 secEngines230 从表里取到 26 枚 ns（实 ' + (e230 && e230.totals ? e230.totals.ns : 'null') + '）');
  a(Array.isArray(WA2.toolDiag.UI_BINDINGS) && WA2.toolDiag.UI_BINDINGS.length === 69,
    'C5 UI_BINDINGS 导出面同源（69 组）');
  a(typeof WA2.toolDiag.verdict === 'function' && typeof WA2.toolDiag.summaryText === 'function',
    'C6 verdict / summaryText 仍在导出面上');
}

console.log('OPV29-Z1-07-V2529: ' + (fail === 0 ? 'pass (' + pass + ')' : 'FAIL ' + fail + '/' + (pass + fail)));
process.exit(fail === 0 ? 0 : 1);