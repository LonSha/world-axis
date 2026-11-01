#!/usr/bin/env node
'use strict';
/**
 * tools/v7probes/p_drive_gate.js — OPV7-2 验收探针（第四道门槛：机制驱动面）。
 *
 * 【它验什么】
 *   A 结构面：第四道门槛真接进了 threeGates，且**只接在 threeGates 一处**（不造第二套）。
 *   B 判不了要说判不了：无头宿主里 driverLedger 的扫描口径是 runtime、canConclude=false，
 *     此时门槛必须落 `unknown`、顶层 `unverifiable` 记 1、`ok` **不因它变假**，
 *     而 summary 行必须把「另有 N 项判不了」念出来。
 *   C 能判时判得对：注入一个「能下结论」的假 driverLedger，让 L3 名单里出现一台**开着的**引擎
 *     ⇒ 门槛必须从 unknown 变 degraded、verdict 从 running 降为 dormant；
 *     若名单里的引擎是**关着的**，则必须报 pass（冤枉开着关着的机制是误报）。
 *   D 名单截断不许冒充结论：declaredL3 大于所列长度时，必须落 unknown 且 why 说明截断。
 *   E 缺件与判不了分开：driverLedger 缺席时进 absent 桶（ok 为假），不是 unknown。
 *   F 出口面：verdict 五态封闭集、nextAction 在 dormant 时指名门槛而不是「按一个按钮」。
 *   G 负控制（真源码破坏）：
 *     N1 把「canConclude 为假 ⇒ unknown」改成「⇒ pass」⇒ B 段判据现形（判不了冒充成通过）。
 *     N2 把「silent > 0 ⇒ degraded」改成「⇒ pass」⇒ C 段判据现形（空转冒充成健康）。
 *     N3 把 verdict 的 dormant 分支摘掉 ⇒ F 段判据现形（空转掉回 running）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..', '..');
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const HP_REL = 'engines/health-preflight.js';
const HP_SRC = fs.readFileSync(path.join(BASE, HP_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');

let pass = 0, fail = 0;
function A(c, msg) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function head(t) { console.log('\n=== ' + t + ' ==='); }
function cnt(s, n) { return String(s).split(n).length - 1; }

// ── 装载整个产品面（与 p_intake_dispatch 同一套）──
function loadAll(ov) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try {
    const ls = global.localStorage;
    if (ls && typeof ls.clear === 'function') ls.clear();
    else if (ls && ls.__store) ls.__store = {};
  } catch (e) {}
  const ctx = vm.createContext(global);
  for (const rel of LOAD) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    const body = (ov && ov[rel] !== undefined) ? ov[rel] : fs.readFileSync(p, 'utf8');
    try { vm.runInContext(body, ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}
function driveOf(r) {
  const g = (r.gates || []).filter(function (x) { return x.id === 'drive'; });
  return g.length === 1 ? g[0] : null;
}

// ═══ A 结构面 ═══════════════════════════════════════════════════════════
head('A 结构面：门槛只接在 threeGates 一处，不造第二套');
// A1 唯一接点：gates.push(mk('drive', ...)) 恰 1 次
A(cnt(HP_SRC, "gates.push(mk('drive', '机制驱动面'") === 1,
  "A1 第四道门槛只 push 一次（实 " + cnt(HP_SRC, "gates.push(mk('drive', '机制驱动面'") + "）");
// A2 不另立真源：本节读 driverLedger.view，不自己扫源码
A(cnt(HP_SRC, 'WA.driverLedger.view()') === 1,
  'A2 读数只走 driverLedger.view（实 ' + cnt(HP_SRC, 'WA.driverLedger.view()') + ' 次）');
A(HP_SRC.indexOf('scanRuntime') < 0, 'A2b 本引擎不自己扫调用面（扫描口径的唯一真源在 driverLedger）');
// A3 「开着的才冤枉」这条判据真的存在（只用开关面判，不看 L3 名单就是错的）
A(cnt(HP_SRC, 'WA.capabilityTier.shapeOf(ns)') === 1,
  'A3 逐台取开关面（实 ' + cnt(HP_SRC, 'WA.capabilityTier.shapeOf(ns)') + '）—— 不能拿 L3 名单直接当「空转」');
// A4 第五态进封闭集
A(HP_SRC.indexOf("driveState = 'unknown'") >= 0 && HP_SRC.indexOf("driveState = 'absent'") >= 0,
  "A4 判不了与缺件是两个不同的赋值（unknown / absent 都在源码里）");
// A5 消费方：诊断节把 gates 原样带出（不重算），面板读 threeGatesLine
A(DIAG_SRC.indexOf('gates: (r.gates || []).map(function (g) {') >= 0,
  'A5 诊断节把 gates 原样映射带出（不重算门槛）');
A(PANEL_SRC.indexOf('WA.healthPreflight.threeGatesLine') >= 0, 'A5b 面板真读 threeGatesLine');

// ═══ B 现场（无头宿主）：判不了要说判不了 ══════════════════════════════
head('B 判不了时如实报 unknown，且不拖累 ok');
let WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
const rB = WA.healthPreflight.threeGates({ sample: 3 });
const gB = driveOf(rB);
A(!!gB, 'B1 现场读数里有 drive 门槛');
A(WA.driverLedger.view().scan.canConclude === false,
  'B1b 前提：本宿主的驱动面判不了（canConclude=false，实 '
  + WA.driverLedger.view().scan.canConclude + '）—— 没这个前提本段测不出东西');
A(gB.state === 'unknown', 'B2 判不了 ⇒ 门槛落 unknown（实 ' + gB.state + '）');
A(gB.nums.canConclude === false && gB.nums.scanLevel === 'runtime',
  'B3 读数把口径讲清（level ' + gB.nums.scanLevel + ' / canConclude ' + gB.nums.canConclude + '）');
A(gB.nums.silent === null, 'B3b 判不了时 silent 给 null 不给 0（0 与「没测」必须可分，实 '
  + JSON.stringify(gB.nums.silent) + '）');
A(gB.nums.undetermined > 0, 'B3c 带出「多少台判不了」（实 ' + gB.nums.undetermined + '）');
A(gB.fix === null, 'B4 判不了时不给动作（fix 为 null，不编假按钮）');
A(rB.unverifiable === 1 && rB.unverifiableIds.join(',') === 'drive',
  'B5 顶层 unverifiable 记 1 且点名 drive（实 ' + rB.unverifiable + ' / ' + rB.unverifiableIds.join(',') + '）');
A(rB.ok === true,
  'B6 判不了**不**让 ok 变假（ok 问的是「能判的过没过」，实 ' + rB.ok + '）');
A(rB.verdict === 'running', 'B6b full 档且能判的都过 ⇒ verdict 仍是 running（实 ' + rB.verdict + '）');
const lineB = WA.healthPreflight.threeGatesLine({ sample: 3 });
A(lineB.indexOf('判不了') >= 0 && lineB.indexOf('不等于通过') >= 0,
  'B7 整句把「判不了」念出来（实「' + lineB + '」）');
A(lineB.indexOf('能判的门槛都通') >= 0,
  'B7b 主结论不说「都通」（判不了的那道不算通，实「' + lineB.slice(0, 20) + '…」）');

// ═══ C 能判时判得对：开着的 L3 才是最坏的那一种 ═══════════════════════
head('C 能下结论时：开着的 L3 ⇒ dormant；关着的 L3 ⇒ pass');
function withFakeLedger(listedOn, opts) {
  const o = opts || {};
  const fake = {
    view: function () {
      return {
        ok: true, total: 100,
        counts: { L1: 1, L2r: 1, L2p: 1, L2e: 1, L3a: listedOn.length, L3b: 0,
          undetermined: o.undetermined === undefined ? 0 : o.undetermined },
        layerNames: { L1: [], L2r: [], L2p: [], L2e: [], L3a: listedOn.slice(), L3b: [] },
        scan: { canConclude: o.canConclude !== false, level: 'static' }
      };
    }
  };
  const W = loadAll();
  if (o.tier) { try { W.capabilityTier.applyTier(o.tier); } catch (e) {} }
  // intake 出厂 enabled:false 且不在任何档位里 —— 本段要测的是「开着的 L3」，
  //   所以必须**显式**把它打开（而不是指望档位），否则测到的是「关着的 L3 报 pass」那一支。
  if (o.turnOn) { try { W[o.turnOn].setSettings({ enabled: true }); } catch (e) {} }
  W.driverLedger = fake;
  return W.healthPreflight.threeGates({ sample: 3 });
}
// C1 名单里放一台**开着的**可注入引擎（intake 恒开、无 buildBlock、不在驱动链上）
const rOn = withFakeLedger(['intake'], { tier: 'full', turnOn: 'intake' });
const gOn = driveOf(rOn);
A((function () {
  const W = loadAll(); try { W.intake.setSettings({ enabled: true }); } catch (e) {}
  const sh = W.capabilityTier.shapeOf('intake');
  return !!(sh && sh.on === true);
})(), 'C1 前提：intake 可以被显式打开（本段测「开着的 L3」，不是「关着的」）');
A(gOn.state === 'degraded', 'C2 开着的 L3 ⇒ 门槛 degraded（实 ' + gOn.state + '）');
A(gOn.nums.silent >= 1 && gOn.nums.sample.indexOf('intake') >= 0,
  'C2b 名单点出是哪一台（实 silent ' + gOn.nums.silent + ' / sample ' + JSON.stringify(gOn.nums.sample) + '）');
A(rOn.verdict === 'dormant', 'C3 verdict 从 running 降为 dormant（实 ' + rOn.verdict + '）');
A(rOn.degradedDrive === 1 && rOn.degradedContent === 0,
  'C3b 两个 degraded 分账（drive ' + rOn.degradedDrive + ' / content ' + rOn.degradedContent + '）');
A(rOn.ok === false, 'C3c dormant 时 ok 为假（它不是健康，实 ' + rOn.ok + '）');
A(rOn.nextAction.indexOf('空转') >= 0 && rOn.nextAction.indexOf('intake') >= 0,
  'C4 nextAction 指名空转与具体机制（实「' + rOn.nextAction + '」）');
A(gOn.fix === null, 'C4b 仍不给「按这个就好」的假按钮（修法是接写入口或关掉它）');
// C5 名单里放一台**关着的**引擎 ⇒ 必须 pass（冤枉它才是误报）
const rOff = withFakeLedger(['life'], { tier: 'lite' });
const gOff = driveOf(rOff);
A(WA.capabilityTier.shapeOf('life').on === false, 'C5 前提：lite 档下 life 是关着的');
A(gOff.state === 'pass', 'C6 关着的 L3 不算空转 ⇒ 门槛 pass（实 ' + gOff.state + '）');
A(rOff.verdict !== 'dormant', 'C6b verdict 不因关着的机制转 dormant（实 ' + rOff.verdict + '）');

// ═══ D 名单截断不许冒充结论 ═══════════════════════════════════════════
head('D 名单被 maxList 截断时如实报判不了');
const fakeTrunc = {
  view: function () {
    return { ok: true, total: 100,
      // 声称 L3 有 50 台，但只列出 2 台
      counts: { L1: 0, L2r: 0, L2p: 0, L2e: 0, L3a: 50, L3b: 0, undetermined: 0 },
      layerNames: { L1: [], L2r: [], L2p: [], L2e: [], L3a: ['intake', 'life'], L3b: [] },
      scan: { canConclude: true, level: 'static' } };
  }
};
WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
WA.driverLedger = fakeTrunc;
const rT = WA.healthPreflight.threeGates({ sample: 3 });
const gT = driveOf(rT);
A(gT.state === 'unknown', 'D1 截断 ⇒ unknown（实 ' + gT.state + '）');
A(gT.nums.truncated === true && gT.nums.declaredL3 === 50 && gT.nums.listedL3 === 2,
  'D1b 三个数都带出（truncated ' + gT.nums.truncated + ' / declared ' + gT.nums.declaredL3
  + ' / listed ' + gT.nums.listedL3 + '）');
A(gT.why.indexOf('截断') >= 0, 'D1c why 说明是截断而不是「都有人驱动」（实「' + gT.why.slice(0, 40) + '…」）');

// ═══ E 缺件 ≠ 判不了 ═══════════════════════════════════════════════════
head('E 缺件进 absent 桶（ok 为假），不是 unknown');
WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
WA.driverLedger = undefined;
const rN = WA.healthPreflight.threeGates({ sample: 3 });
const gN = driveOf(rN);
A(gN.state === 'absent', 'E1 driverLedger 缺席 ⇒ absent（实 ' + gN.state + '）');
A(rN.absent === 1 && rN.ok === false,
  'E2 进 absent 桶且 ok 为假（absent ' + rN.absent + ' / ok ' + rN.ok + '）—— 缺件不是通过');
A(rN.verdict === 'unknown', 'E2b 有 absent ⇒ verdict unknown（实 ' + rN.verdict + '）');
A(gN.why.indexOf('未加载') >= 0, 'E2c why 说清是未加载（实「' + gN.why.slice(0, 30) + '…」）');

// ═══ F 出口面形态 ═══════════════════════════════════════════════════════
head('F 出口面：五态封闭集与计数自洽');
WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
const rF = WA.healthPreflight.threeGates({ sample: 2 });
const VERDICTS = ['running', 'partial', 'empty-risk', 'unknown', 'dormant'];
A(VERDICTS.indexOf(rF.verdict) >= 0, 'F1 verdict 落在五态封闭集（实 ' + rF.verdict + '）');
// v2.279.0（V7 OPV7-3）：门槛数 4 → 5（新增 yield 产出面，排在 drive 之前）。
A(rF.passed + rF.blocked + rF.degraded + rF.absent + rF.unverifiable === 5,
  'F2 五态相加 = 门槛数 5（实 ' + (rF.passed + rF.blocked + rF.degraded + rF.absent + rF.unverifiable) + '）');
A(rF.degraded === rF.degradedContent + rF.degradedDrive,
  'F3 degraded 总数 = 内容面 + 驱动面（实 ' + rF.degraded + ' = ' + rF.degradedContent + ' + ' + rF.degradedDrive + '）');
A(rF.gates.length === 5 && rF.gates[4].id === 'drive',
  'F4 drive 排在最后（顺序有语义：它只能往下拉 running）');

// ═══ G 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据 ═══════════
head('G 负控制（三处真源码破坏）');
// ⚠ 夹具踩过的坑（记在这里，别再踩）：
//   `tests/mock.js` 把 global.WorldAxis **复用同一个对象**，于是两次 loadAll 拿到的是同一个 WA。
//   后果：先设 `W.driverLedger = fake`、再 loadAll 装另一份源码时，引擎重跑会把真 driverLedger
//   盖回去 —— 而我还以为假账本在。表现是「破坏没现形」，很容易误归因成「判据不灵」。
//   正确做法：假账本用**独立变量**持有，在**最后一次 loadAll 之后**再挂上去。
function fakeLedger(keys) {
  return { view: function () { return { ok: true, total: 100,
    counts: { L1: 0, L2r: 0, L2p: 0, L2e: 0, L3a: keys.length, L3b: 0, undetermined: 0 },
    layerNames: { L1: [], L2r: [], L2p: [], L2e: [], L3a: keys.slice(), L3b: [] },
    scan: { canConclude: true, level: 'static' } }; } };
}

function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag);
}
let brokenCount = 0;
function runBroken(anchor, repl, tag) {
  must1(HP_SRC, anchor, tag);
  const broken = HP_SRC.replace(anchor, repl);
  A(broken !== HP_SRC, tag + 'a: 破坏副本真改了字节');
  if (broken !== HP_SRC) brokenCount++;
  const ov = {}; ov[HP_REL] = broken;
  return loadAll(ov).healthPreflight.threeGates({ sample: 3 });
}
// N1：判不了 ⇒ pass（把「不知道」冒充成「通过」）
const A_N1 = "if (!canConclude) {\n          driveState = 'unknown';";
const rN1 = runBroken(A_N1, "if (false) {\n          driveState = 'unknown';", 'N1');
const gN1 = driveOf(rN1);
A(gN1.state !== 'unknown', 'N1b: 破坏后不再报判不了（实 ' + gN1.state + '）—— 判据会现形');
A(rN1.unverifiable === 0, 'N1c: 顶层 unverifiable 归零（实 ' + rN1.unverifiable + '）—— 判不了被洗掉了');
// N2：开着的 L3 ⇒ pass（把「空转」冒充成「健康」）
(function () {
  must1(HP_SRC, "} else if (silent.length > 0) {", 'N2');
  const broken = HP_SRC.replace("} else if (silent.length > 0) {", "} else if (false) {");
  A(broken !== HP_SRC, 'N2a: 破坏副本真改了字节');
  if (broken !== HP_SRC) brokenCount++;
  const W2 = loadAll({ 'engines/health-preflight.js': broken });
  const fake = fakeLedger(['intake']);            // 独立持有，下面才挂（见上方夹具唷）
  try { W2.capabilityTier.applyTier('full'); } catch (e) {}
  try { W2.intake.setSettings({ enabled: true }); } catch (e) {}
  W2.driverLedger = fake;
  const r = W2.healthPreflight.threeGates({ sample: 3 });
  const g = driveOf(r);
  A(g.state === 'pass', 'N2b: 破坏后开着的 L3 被报成 pass（实 ' + g.state + '）—— 空转被洗白');
  A(r.verdict !== 'dormant', 'N2c: verdict 不再降级（实 ' + r.verdict + '）');
})();
// N3：摘掉 verdict 的 dormant 分支 ⇒ 空转掉回 running
(function () {
  must1(HP_SRC, "else if (degradedDrive.length) verdict = 'dormant';", 'N3');
  const broken = HP_SRC.replace("else if (degradedDrive.length) verdict = 'dormant';", "else if (degradedDrive.length) verdict = 'running';");
  A(broken !== HP_SRC, 'N3a: 破坏副本真改了字节');
  if (broken !== HP_SRC) brokenCount++;
  const W2 = loadAll({ 'engines/health-preflight.js': broken });
  const fake = fakeLedger(['intake']);
  try { W2.capabilityTier.applyTier('full'); } catch (e) {}
  try { W2.intake.setSettings({ enabled: true }); } catch (e) {}
  W2.driverLedger = fake;
  const r = W2.healthPreflight.threeGates({ sample: 3 });
  A(r.verdict === 'running', 'N3b: 破坏后空转掉回 running（实 ' + r.verdict + '）');
  A(r.degradedDrive === 1, 'N3c: 而 degradedDrive 仍是 1（读数摆在那里，结论却错，实 ' + r.degradedDrive + '）');
})();
A(brokenCount === 3, 'N4 三处破坏全部真的改到了源码（实 ' + brokenCount + '）');
// N5 两向自证：恢复原版后判据重新为真
WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
const gBack = driveOf(WA.healthPreflight.threeGates({ sample: 2 }));
A(gBack.state === 'unknown', 'N5 原版恢复后回到 unknown（实 ' + gBack.state + '）—— 两向自证成立');
A(cnt(HP_SRC, "if (!canConclude) {\n          driveState = 'unknown';") === 1
  && cnt(HP_SRC, "} else if (silent.length > 0) {") === 1
  && cnt(HP_SRC, "else if (degradedDrive.length) verdict = 'dormant';") === 1,
  'N6 三个锚点在原文件里各恰中 1 次（负控制全跑在内存副本上，零文件改写）');

console.log('');
console.log('========== 汇总：' + pass + ' passed, ' + fail + ' failed ==========');
if (fail) process.exit(1);
