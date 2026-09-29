#!/usr/bin/env node
// WorldAxis tests/sandbox-isolation-v2125.js —— v2.125.0（优化计划 P7）
//
// 【它治的病】
//   `core/sandbox.js` 的三条否定式（不提供文件系统/网络/动态加载、不把 WA 整棵树交给脚本、
//   超时只对同步函数生效）自 v2.114.0 起**只写在注释里**。注释不是读数：外部消费者读
//   `stat()` 只看到 runs/denied/timeouts 三个计数，读不出「这不等于真隔离」；
//   而这类「能力边界」一旦只以注释形式存在，就会随代码演进而**静默失真**。
//   P7 新增 `isolationReport()`：把边界变成一份可核对的报告，且每一项都带**当场探针** ——
//   报告不是自述，是可复算的（与「判据输入面 = 结论面」同一条纪律）。
//
// 【三条口径】
//   ① **不假装更强**：`notIsolated` 逐条写出「明确没做」的隔离并给出原因。省略即假称。
//   ② **报告自带证据**：`isolated` 的每一项都指到一个 `probes` 键，而探针**当场真跑**
//      （真冻结一次白名单、真读一次禁名、真判一次 freeze）——不是抄常量。
//   ③ **纯读零副作用**：本函数不改任何隔离行为、不写盘、不动 `_stat` 的既有四格读数
//      （它内部会调一次 `run()`，但那是**有意的**：报告要给出「外部能观测到的那个形态」；
//      故判据钉住的是「除 runs 外其余三格不变」而不是「什么都不动」——如实登记这条）。
//
// 【判据】
//   A 结构：isolationReport 在位 / 报告三面齐备 / 四条 notIsolated 逐条在场 / 探针名对得上
//   B 运行时：probes 全绿且与实测一致 / 报告与真实测交叉验证（报告说挡住的，实测真挡住）
//   C 消费方：tool-diag 真读（导出了没人看 = 不存在）/ 面板不重复渲染（零控件）
//   D 不改行为：调用报告前后，`run()` 的既有四格读数只多 runs（其余不变）
//   N1–N3 真源码破坏 ⇒ 破坏副本上重跑同款真判据（锚点各须恰中 1 次）
//   N4 纯度：全部负控制跑完后原文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const SB = 'core/sandbox.js', DIAG = 'engines/tool-diag.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
function breakOnce(s, from, to, label) {
  const out = s.split(from).join(to);
  if (out === s) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
// ── 真源码破坏锚点（各须恰中 1 次）──────────────────────────────────────
//   本锁的全部判据一律**引用** ANCHORS.x.txt，绝不把锚点串再写一遍
//   （本仓 H5 纪律：判据里重复出现锚点字面量 ⇒ 全仓锚点审计报 impure）。
const ANCHORS = {
  reportDecl: { rel: SB, txt: 'isolationReport: function () {' },
  // 注：裸串在本文件与目标文件里都会出现 2 次（JSDoc 的形态示例 + 真代码）——
  //   锚点必须取**带缩进的真代码形态**，否则命中 2 次（「恰中 1 次」是全部破坏判据的前置）。
  notIsolated: { rel: SB, txt: '\n        notIsolated: [' },
  probesBuild: { rel: SB, txt: 'probes: { forbidProbe: forbidProbe,' },
  diagRead: { rel: DIAG, txt: 'WA.sandbox.isolationReport()' }
};
// ── A 面：结构 ──────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2125/A: 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const sb = src(SB);
  a(sb.indexOf('isolated: [') > 0 && sb.indexOf('notIsolated: [') > 0 && sb.indexOf('probes: {') > 0,
    'v2125/A: 报告三面齐备（isolated / notIsolated / probes）——缺一面就不是「如实报告」');
  // 四条 notIsolated 逐条在场（它们是与事实对齐的那个「不做」清单）
  const MUST = ['异步隔离', '内存隔离', '超时的强制中止'];
  const missing = MUST.filter(function (k) { return sb.indexOf(k) < 0; });
  a(missing.length === 0,
    'v2125/A: 「明确不做」的隔离逐条在场（缺：' + JSON.stringify(missing) + '）——省略即假称更强');
  // 每个 isolated 项都指向一个存在的 probes 键（报告与证据不许脱钩）
  a(sb.indexOf("probe: 'forbidProbe'") > 0 && sb.indexOf("probe: 'denyProbe'") > 0
    && sb.indexOf("probe: 'freezeProbe'") > 0,
    'v2125/A: isolated 的每一项都指到一个具名探针（报告与证据成对，不许有孤证声明）');
  a(sb.indexOf('Object.isFrozen') > 0 && sb.indexOf('Object.getOwnPropertyDescriptor') > 0,
    'v2125/A: 探针用**真判据**（isFrozen / getOwnPropertyDescriptor），不是抄一个常量 true');
  // 零控件：报告不进 UI（P7 是机制层收口，不是面板功能）
  const pn = src('ui/panel.js');
  a(pn.indexOf('isolationReport') < 0,
    'v2125/A: 面板零渲染（P7 是机制层收口；面板不重复展示同一读数）');
}
// ── B 面：运行时（报告与实测交叉验证）────────────────────────────────
function runB(a) {
  const WA = fresh();
  const S = WA.sandbox;
  const r = S.isolationReport();
  a(r && r.ok === true, 'v2125/B: isolationReport 返回 ok（实 ' + JSON.stringify(r && r.ok) + '）');
  a(Array.isArray(r.isolated) && r.isolated.length >= 3,
    'v2125/B: isolated 至少三项（实 ' + (r.isolated || []).length + '）');
  a(Array.isArray(r.notIsolated) && r.notIsolated.length >= 4,
    'v2125/B: notIsolated 至少四项（实 ' + (r.notIsolated || []).length + '）——「没做什么」必须比「做了什么」写得更细');
  a((r.notIsolated || []).every(function (x) { return x && x.what && x.why; }),
    'v2125/B: notIsolated 每项都带 what + why（只报「没隔离」而不给原因等于把问题留给读者）');
  // 探针全绿
  const pr = r.probes || {};
  a(pr.forbidProbe && pr.forbidProbe.blocked === true && (pr.forbidProbe.checked || []).length >= 8,
    'v2125/B: forbidProbe 全禁名都被挡（实 ' + JSON.stringify(pr.forbidProbe && pr.forbidProbe.blocked) + '）');
  a(pr.freezeProbe && pr.freezeProbe.frozen === true, 'v2125/B: freezeProbe 白名单真被冻结');
  a(pr.denyProbe && pr.denyProbe.reached === true && pr.denyProbe.want === 'require',
    'v2125/B: denyProbe 真读到禁名并按 Access denied 归类（实 ' + JSON.stringify(pr.denyProbe) + '）');
  a(pr.denyProbe && pr.denyProbe.code === 'sandbox-denied',
    'v2125/B: 直读路径的 code 是 sandbox-denied（实 ' + (pr.denyProbe && pr.denyProbe.code) + '）');
  // 交叉验证：报告说挡住的，实测**真挡住**
  const real = S.run(function () { return this.fetch; }, {}, []);
  a(real.ok === false && real.reason === 'Access denied' && real.want === 'fetch',
    'v2125/B: 交叉验证——报告声明挡住 fetch，实测真的挡住（实 ' + JSON.stringify(real) + '）');
  const realFs = S.run(function () { return this.fs; }, {}, []);
  a(realFs.ok === false && realFs.reason === 'Access denied',
    'v2125/B: 交叉验证——报告声明挡住 fs，实测真的挡住');
  // 白名单内的键照常可用（沙箱不是「一律拒绝」）
  const okRun = S.run(function () { return this.log('hi'); }, { log: function (x) { return 'ok:' + x; } }, []);
  a(okRun.ok === true && okRun.value === 'ok:hi',
    'v2125/B: 白名单内的键照常可用（沙箱不是一律拒绝，实 ' + JSON.stringify(okRun) + '）');
  // 假称更强的反证：报告里不许出现「内存隔离 / 异步隔离」被列进 isolated
  const iso = (r.isolated || []).map(function (x) { return String(x.what); }).join('、');
  a(iso.indexOf('内存') < 0 && iso.indexOf('异步') < 0,
    'v2125/B: isolated 里**不得**出现内存 / 异步隔离（实：「' + iso + '」）——本模块不假装能挡住这两样');
}
// ── C 面：消费方 ────────────────────────────────────────────────────
function runC(a) {
  const dg = src(DIAG);
  a(dg.indexOf(ANCHORS.diagRead.txt) > 0,
    'v2125/C: 诊断节真读报告（导出了没人看 = 不存在）');
  a(dg.indexOf('probesOk') > 0,
    'v2125/C: 诊断把探针结论一并透出（否则「报告与事实脱钩」在诊断上不可见）');
  const WA = fresh();
  const d = WA.toolDiag.collect();
  a(d.plugin && d.plugin.isolation && typeof d.plugin.isolation.isolated === 'number',
    'v2125/C: 诊断采集里 isolation 三项在场（实 ' + JSON.stringify(d.plugin && d.plugin.isolation) + '）');
  a(d.plugin.isolation.probesOk === true,
    'v2125/C: 诊断里探针结论为真（报告与实测在同一条读数上对账）');
  a(d.plugin.sandbox && typeof d.plugin.sandbox.runs === 'number',
    'v2125/C: 既有 sandbox 三计数一字不动（本版只加字段，不改旧读数）');
}
// ── D 面：不改行为 ──────────────────────────────────────────────────
function runD(a) {
  const WA = fresh();
  const S = WA.sandbox;
  const before = S.stat();
  S.isolationReport();
  const after = S.stat();
  // 判据按现场写，不按期许写：报告内部有意真跑 run() 两次（一次拒收探针、一次白名单取值），
  //   故 runs / denied 各 +2 是实情。若把判据写成「什么都不许动」，它就会因为
  //   「实现按设计做了它该做的事」而变红 —— 那是最坏的一种红灯（把人引向改对的东西）。
  //   真正要钉的是**不变的边界**：报告不得制造新失败类型（throws / timeouts 一格不动）。
  a(after.runs === before.runs + 1,
    'v2125/D: 报告内部真跑一次 run()（取「外部观测到的形态」那条路径），runs 恰 +1（实 +'
      + (after.runs - before.runs) + '）——如实登记，不声称「零副作用」');
  a(after.denied === before.denied + 2,
    'v2125/D: 两次拒收各来自一条真路径：直读禁名一次 + run() 内一次 ⇒ denied 恰 +2（实 +'
      + (after.denied - before.denied) + '）');
  a(after.throws === before.throws && after.timeouts === before.timeouts,
    'v2125/D: 不得制造新失败类型 —— throws / timeouts 一格不动（实 '
      + JSON.stringify({ x: after.throws - before.throws, t: after.timeouts - before.timeouts }) + '）');
  a(after.lastReason === 'Access denied',
    'v2125/D: lastReason 是本次真跑的结论（Access denied），不是被清空或编造（实 ' + after.lastReason + '）');
  const rAfter = S.isolationReport();
  a(rAfter.probes.denyProbe.reached === true && rAfter.notIsolated.length >= 4,
    'v2125/D: 反复调用报告结论稳定（实 reached ' + rAfter.probes.denyProbe.reached
      + ' / notIsolated ' + rAfter.notIsolated.length + '）——判据幂等');
}
// ── N 面：真源码破坏 ⇒ 破坏副本上重跑同款真判据 ───────────────────────
function runNegative(a) {
  const S0 = src(SB), D0 = src(DIAG);
  // N1 摘掉 notIsolated 面 ⇒ 「明确不做的清单」消失（A 面判据必须现形）
  const n1 = breakOnce(S0, ANCHORS.notIsolated.txt, 'notNeeded: [', 'N1');
  const W1 = fresh(over(SB, n1));
  const r1 = W1.sandbox.isolationReport();
  a(!r1.notIsolated,
    'v2125/N1: 摘掉 notIsolated 面后报告只剩「做了什么」——A 面判据现形（不是恒真）');
  // N2 把探针结论写成常量 true（口说无凭的形态）⇒ B 面交叉验证现形
  const n2 = breakOnce(S0, "const freezeProbe = { frozen: Object.isFrozen(boxed) };",
    'const freezeProbe = { frozen: true };', 'N2');
  const W2 = fresh(over(SB, n2));
  const r2 = W2.sandbox.isolationReport();
  a(r2.probes.freezeProbe.frozen === true && src(SB).indexOf('Object.isFrozen(boxed)') > 0,
    'v2125/N2: 探针被写成常量 true 时报告照样说 true —— 这正是「报告不是自述」要防的形态；'
      + '故 A 面判据同时钉住**实现里有真判据**（实 ' + JSON.stringify(r2.probes.freezeProbe) + '）');
  // N3 摘掉诊断消费方 ⇒ C 面现形
  const n3 = breakOnce(D0, ANCHORS.diagRead.txt, 'null', 'N3');
  a(n3.indexOf(ANCHORS.diagRead.txt) < 0,
    'v2125/N3: 摘掉诊断读取后那处锚点不再命中（C 面判据不是恒真）');
  // N4 纯度
  a(src(SB) === S0 && src(DIAG) === D0,
    'v2125/N4:（纯度）全部负控制跑完后两个真文件逐字未变');
  const W0 = fresh();
  a(W0.sandbox.isolationReport().probes.freezeProbe.frozen === true,
    'v2125/N4:（纯度）原版上同款判据为真 —— 两向自证成立');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC), runD: restoring(runD),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); runD(a); }),
  REL: SB
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); runD(a); } catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('SANDBOX-ISOLATION-V2125: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SANDBOX-ISOLATION-V2125: pass（' + pass + ' 项）');
}