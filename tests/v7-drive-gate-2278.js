#!/usr/bin/env node
'use strict';
/**
 * tests/v7-drive-gate-2278.js — v2.278.0（V7 OPV7-2）第四道门槛「机制驱动面」专锁。
 *
 * 【为什么要有这把锁，而不是只留 tools/v7probes/p_drive_gate.js】
 *   探针答的是「本次改动对不对」（一次性的）；锁答的是「以后会不会退回去」（永久的）。
 *   本项最容易被后人「简化掉」的地方恰好是它最有价值的地方 ——
 *   一个「能判的都过了，但有一批机制开着却从来没人喂」的世界，
 *   看起来跟健康的世界一模一样；把门槛④折进 pass 是最顺手、也最安静的退化。
 *   所以每一条判据都要在**该变的地方**看见变化（纪律 13）。
 *
 * 【本锁锁住的东西】
 *   A 结构：门槛④只在 threeGates 接一次 / 读数只走 driverLedger.view / 逐台取开关面
 *   B 判不了：canConclude=false ⇒ unknown + 顶层 unverifiable + ok 不为假 + 整句念出来
 *   C 能判时：开着的 L3 ⇒ degraded ⇒ verdict=dormant；关着的 L3 ⇒ pass（不冤枉关着的）
 *   D 截断：declaredL3 > listedL3 ⇒ unknown（不许用偏小名单冒充结论）
 *   E 缺件：driverLedger 缺席 ⇒ absent 桶 + ok 为假（缺件不是「判不了」）
 *   F 出口：五态封闭集 / 五态相加=门槛数 / degraded 分两桶 / drive 排最后
 *   N 负控制：三处真源码破坏 + 两向自证（O 磁盘原版 / P 内存破坏副本）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const HP_REL = 'engines/health-preflight.js';
const HP_SRC = fs.readFileSync(path.join(BASE, HP_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
// v2.401.0(OPV23):锚点已搬进 ui/pages/overview-main.js 段体——改读 panelSource() 重组面（重组面 = 真实 panel.js + 段文件重拼,逐字等于拆前面;锚点跟现场走,扩输入面）
const PANEL_SRC = require('./panel-source.js').panelSource();
const RUN_SRC = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function assert(ok, msg) {
  if (ok) { pass++; return; }
  fail++; fails.push(msg);
  console.log('  ✗ ' + msg);
}
function eq(a, b, msg) { assert(a === b, msg + '（实得 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b) + '）'); }
function section(t) { console.log('\n── ' + t + ' ──'); }
function cnt(s, n) { return String(s).split(n).length - 1; }
function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag + ' :: ' + String(n).slice(0, 60));
  return c;
}

// ── 锚点：字面量在本文件只声明一次（H5 判据纯度）──
const A_CONCLUDE = "if (!canConclude) {\n          driveState = 'unknown';";
const A_SILENT = "} else if (silent.length > 0) {";
const A_DORMANT = "else if (degradedDrive.length) verdict = 'dormant';";

// ── 装载夹具 ─────────────────────────────────────────────────────────────
//   ⚠ 踩过的坑（写在锁里，别再踩）：`tests/mock.js` 把 `global.WorldAxis` **复用同一个对象**，
//     两次 loadAll 拿到的是同一个 WA。先挂假 driverLedger 再 loadAll，引擎重跑会把它盖回去，
//     表现成「破坏没现形」—— 很容易误归因成判据不灵。
//     正确做法：假账本用独立变量持有，在**最后一次 loadAll 之后**才挂。
let LOAD = null;
function loadList() {
  if (LOAD) return LOAD;
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  LOAD = vm.runInNewContext('[' + m[1] + ']');
  return LOAD;
}
// OPV7-8 连带（与 tools/v7probes/p_drive_gate.js 同款修法）：full 档把下调的悬空引擎
//   逐个 flip 回开 —— 否则 visibility 门按 v2.91.0 比例判据如实落 degraded，
//   而 B/C/E/N 各段的前提是「除目标门槛外其余全 pass」（visibility 判据本身没有错）。
function openExcluded(W) {
  (W.capabilityTier.L3_EXCLUDES || []).forEach(function (k) {
    try { W.capabilityTier.flipSwitch(k, true); } catch (e) {}
  });
}
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
  for (const rel of loadList()) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    const body = (ov && ov[rel] !== undefined) ? ov[rel] : fs.readFileSync(p, 'utf8');
    try { vm.runInContext(body, ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}
/** 假驱动台账（独立持有，loadAll 之后才挂）。 */
function fakeLedger(keys, opt) {
  const o = opt || {};
  return { view: function () {
    return { ok: true, total: 100,
      counts: { L1: 0, L2r: 0, L2p: 0, L2e: 0,
        L3a: (o.declared === undefined ? keys.length : o.declared), L3b: 0,
        undetermined: o.undetermined || 0 },
      layerNames: { L1: [], L2r: [], L2p: [], L2e: [], L3a: keys.slice(), L3b: [] },
      scan: { canConclude: o.canConclude !== false, level: o.level || 'static' } };
  } };
}
function driveOf(r) {
  const g = (r.gates || []).filter(function (x) { return x.id === 'drive'; });
  return g.length === 1 ? g[0] : null;
}

// ═══ A 结构面 ═══════════════════════════════════════════════════════════
function runA() {
  section('A. 结构：只接一处 / 读数只走 driverLedger / 逐台取开关面');
  // A1 唯一接点（不造第二套门槛体系）
  eq(cnt(HP_SRC, "gates.push(mk('drive', '机制驱动面'"), 1, 'A1 门槛④只 push 一次');
  // A2 唯一读数口
  eq(cnt(HP_SRC, 'WA.driverLedger.view()'), 1, 'A2 读数只走 driverLedger.view');
  // A3 不自己扫源码（扫描口径的唯一真源在 driverLedger）
  assert(HP_SRC.indexOf('scanRuntime') < 0, 'A3 本引擎不自己扫调用面（不造第二套扫描）');
  // A4 「开着的才算空转」这条判据真的在：逐台取开关面，不能拿 L3 名单直接当结论
  eq(cnt(HP_SRC, 'WA.capabilityTier.shapeOf(ns)'), 1, 'A4 逐台取开关面（L3 名单 + 开关面两条都要）');
  // A5 判不了与缺件是两个不同的赋值，不是一个 if 的两个分支
  assert(HP_SRC.indexOf("driveState = 'unknown'") >= 0 && HP_SRC.indexOf("driveState = 'absent'") >= 0,
    'A5 unknown（判不了）与 absent（缺件）都在源码里 —— 两者不可合并');
  // A6 消费方：诊断节分列带出两个子桶与 unverifiable
  assert(DIAG_SRC.indexOf('degradedContent: r.degradedContent') >= 0,
    'A6a 诊断节带出 degradedContent（内容面那一桶）');
  assert(DIAG_SRC.indexOf('degradedDrive: r.degradedDrive') >= 0,
    'A6b 诊断节带出 degradedDrive（驱动面那一桶）');
  assert(DIAG_SRC.indexOf('unverifiable: r.unverifiable') >= 0,
    'A6c 诊断节带出 unverifiable（判不了的那一道不许在诊断包里消失）');
  // A7 面板：dormant 必须占屏（只有 running 静默）
  assert(PANEL_SRC.indexOf("if (!r || r.verdict === 'running') return '';") >= 0,
    'A7 面板只在 running 时不渲染（dormant 要占屏）');
  assert(cnt(PANEL_SRC, "r.verdict === 'running') return ''") === 1,
    'A7b 静默条件只认 running，不给别的态开后门');
  // A8 v2.279.0（V7 OPV7-3）：诊断节带出产出面读数，且**不复算**（取自同一份 threeGates）
  assert(DIAG_SRC.indexOf("g.id === 'yield'") >= 0,
    'A8 诊断节从 gates 里取 yield 那一格（不复算产出面）');
  assert(DIAG_SRC.indexOf('yieldFace:') >= 0, 'A8b 诊断节真的带出 yieldFace');
}

// ═══ B 判不了 ═══════════════════════════════════════════════════════════
function runB() {
  section('B. 判不了时如实报 unknown，且不拖累 ok');
  const WA = loadAll();
  try { WA.capabilityTier.applyTier('full'); } catch (e) {}
  openExcluded(WA);
  // B0 前提：本宿主真的判不了（否则本段整段测空）
  const dv = WA.driverLedger.view();
  assert(dv.scan.canConclude === false,
    'B0 前提：本宿主驱动面判不了（canConclude=' + dv.scan.canConclude + '）');
  assert(dv.scan.level === 'runtime', 'B0b 前提：扫描口径是 runtime（实 ' + dv.scan.level + '）');
  const r = WA.healthPreflight.threeGates({ sample: 3 });
  const g = driveOf(r);
  assert(!!g, 'B1 读数里有 drive 门槛');
  eq(g.state, 'unknown', 'B2 判不了 ⇒ unknown');
  eq(g.nums.canConclude, false, 'B3 读数把口径讲清（canConclude=false）');
  eq(g.nums.scanLevel, 'runtime', 'B3b 读数带扫描口径');
  eq(g.nums.silent, null, 'B3c silent 给 null 不给 0（0 与「没测」必须可分）');
  assert(g.nums.undetermined > 0, 'B3d 带出「多少台判不了」（实 ' + g.nums.undetermined + '）');
  eq(g.fix, null, 'B4 判不了时不给动作（不编假按钮）');
  eq(r.unverifiable, 1, 'B5 顶层 unverifiable 记 1');
  eq((r.unverifiableIds || []).join(','), 'drive', 'B5b 顶层点名是哪一道判不了');
  eq(r.ok, true, 'B6 判不了**不**让 ok 变假（ok 问的是能判的过没过）');
  eq(r.verdict, 'running', 'B6b 能判的都过 ⇒ verdict 仍是 running');
  const line = WA.healthPreflight.threeGatesLine({ sample: 3 });
  assert(line.indexOf('判不了') >= 0, 'B7 整句把「判不了」念出来（实「' + line + '」）');
  assert(line.indexOf('不等于通过') >= 0, 'B7b 且说清它不等于通过');
  assert(line.indexOf('能判的门槛都通') >= 0, 'B7c 主结论不说「都通」（判不了的那道不算通）');
  assert(line.indexOf('四道门槛都通') < 0, 'B7d 旧的「四道都通」措辞不许回来');
}

// ═══ C 能判时 ═══════════════════════════════════════════════════════════
function runC() {
  section('C. 能判时：开着的 L3 ⇒ dormant；关着的 L3 ⇒ pass');
  // C1 开着的 L3（intake 出厂关着，本段显式打开）
  const W1 = loadAll();
  const fake1 = fakeLedger(['intake']);
  try { W1.capabilityTier.applyTier('full'); } catch (e) {}
  openExcluded(W1);
  try { W1.intake.setSettings({ enabled: true }); } catch (e) {}
  eq((W1.capabilityTier.shapeOf('intake') || {}).on, true, 'C1 前提：intake 真被打开了');
  W1.driverLedger = fake1;
  const r1 = W1.healthPreflight.threeGates({ sample: 3 });
  const g1 = driveOf(r1);
  eq(g1.state, 'degraded', 'C2 开着的 L3 ⇒ degraded');
  eq(g1.nums.silent, 1, 'C2b silent 计数为 1');
  eq((g1.nums.sample || []).join(','), 'intake', 'C2c 名单点出是哪一台');
  eq(r1.verdict, 'dormant', 'C3 verdict 降为 dormant');
  eq(r1.degradedDrive, 1, 'C3b degradedDrive=1');
  eq(r1.degradedContent, 0, 'C3c degradedContent=0（两桶分账）');
  eq(r1.ok, false, 'C3d dormant 时 ok 为假（它不是健康）');
  assert(r1.nextAction.indexOf('空转') >= 0, 'C4 nextAction 说「空转」（实「' + r1.nextAction + '」）');
  assert(r1.nextAction.indexOf('intake') >= 0, 'C4b nextAction 指名具体机制');
  eq(g1.fix, null, 'C4c 仍不给「按这个就好」的假按钮');

  // C5 关着的 L3 ⇒ pass（冤枉关着的机制才是误报）
  const W2 = loadAll();
  const fake2 = fakeLedger(['life']);
  try { W2.capabilityTier.applyTier('lite'); } catch (e) {}
  eq((W2.capabilityTier.shapeOf('life') || {}).on, false, 'C5 前提：lite 档下 life 是关着的');
  W2.driverLedger = fake2;
  const r2 = W2.healthPreflight.threeGates({ sample: 3 });
  eq(driveOf(r2).state, 'pass', 'C6 关着的 L3 不算空转 ⇒ pass');
  assert(r2.verdict !== 'dormant', 'C6b verdict 不因关着的机制转 dormant（实 ' + r2.verdict + '）');
  eq(r2.degradedDrive, 0, 'C6c degradedDrive 为 0');

  // C7 判不了时**不许**顺手把「开着的 L3」当成 0（这是最容易写出的假绿）
  const W3 = loadAll();
  const fake3 = fakeLedger(['intake'], { canConclude: false });
  try { W3.capabilityTier.applyTier('full'); } catch (e) {}
  openExcluded(W3);
  try { W3.intake.setSettings({ enabled: true }); } catch (e) {}
  W3.driverLedger = fake3;
  const g3 = driveOf(W3.healthPreflight.threeGates({ sample: 3 }));
  eq(g3.state, 'unknown', 'C7 判不了优先于「开着的 L3」（顺序错会把「不知道」报成「空转」）');
  eq(g3.nums.silent, null, 'C7b 且 silent 仍是 null（判不了就不数）');
}

// ═══ D 截断 ═══════════════════════════════════════════════════════════
function runD() {
  section('D. 名单被 maxList 截断时如实报判不了');
  const W = loadAll();
  const fake = fakeLedger(['intake', 'life'], { declared: 50 });
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  W.driverLedger = fake;
  const g = driveOf(W.healthPreflight.threeGates({ sample: 3 }));
  eq(g.state, 'unknown', 'D1 截断 ⇒ unknown（不许用偏小名单冒充结论）');
  eq(g.nums.truncated, true, 'D1b truncated=true');
  eq(g.nums.declaredL3, 50, 'D1c 带出声称数');
  eq(g.nums.listedL3, 2, 'D1d 带出实列数');
  eq(g.nums.silent, null, 'D1e 截断时 silent 为 null（不数）');
  assert(g.why.indexOf('截断') >= 0, 'D1f why 说明是截断（实「' + g.why.slice(0, 40) + '…」）');
  // D2 不截断时同一份夹具必须真能判（否则 D1 的 unknown 是恒真）
  const W2 = loadAll();
  try { W2.capabilityTier.applyTier('full'); } catch (e) {}
  openExcluded(W2);
  try { W2.intake.setSettings({ enabled: true }); } catch (e) {}
  W2.driverLedger = fakeLedger(['intake']);
  const g2 = driveOf(W2.healthPreflight.threeGates({ sample: 3 }));
  eq(g2.state, 'degraded', 'D2 不截断时判得出来（两向自证：D1 的 unknown 不是恒真）');
}

// ═══ E 缺件 ═══════════════════════════════════════════════════════════
function runE() {
  section('E. 缺件进 absent 桶（ok 为假），不是 unknown');
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  openExcluded(W);
  W.driverLedger = undefined;
  const r = W.healthPreflight.threeGates({ sample: 3 });
  const g = driveOf(r);
  eq(g.state, 'absent', 'E1 driverLedger 缺席 ⇒ absent');
  eq(r.absent, 1, 'E2 进 absent 桶');
  eq(r.ok, false, 'E2b ok 为假（缺件不是通过）');
  eq(r.verdict, 'unknown', 'E2c 有 absent ⇒ verdict unknown');
  eq(r.unverifiable, 0, 'E2d 缺件**不**记成 unverifiable（它俩是不同的东西）');
  assert(g.why.indexOf('未加载') >= 0, 'E2e why 说清是未加载（实「' + g.why.slice(0, 30) + '…」）');
}

// ═══ F 出口 ═══════════════════════════════════════════════════════════
function runF() {
  section('F. 出口面：五态封闭集与计数自洽');
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  const r = W.healthPreflight.threeGates({ sample: 2 });
  const VERDICTS = ['running', 'partial', 'empty-risk', 'unknown', 'dormant'];
  assert(VERDICTS.indexOf(r.verdict) >= 0, 'F1 verdict 落在五态封闭集（实 ' + r.verdict + '）');
  assert(VERDICTS.length === 5, 'F1b 封闭集恰五项（不多不少：加一态必须同时改这里）');
  // v2.279.0（V7 OPV7-3）：门槛数 4 → 5（新增 yield 产出面，排在 drive 之前）。
  eq(r.passed + r.blocked + r.degraded + r.absent + r.unverifiable, 5,
    'F2 五态相加 = 门槛数 5');
  eq(r.degraded, r.degradedContent + r.degradedDrive, 'F3 degraded 总数 = 内容面 + 驱动面');
  eq(r.gates.length, 5, 'F4 门槛数恰 5');
  eq(r.gates[4].id, 'drive', 'F4b drive 排最后（顺序有语义：它只能往下拉 running）');
  eq(r.gates.map(function (g) { return g.id; }).join(','), 'engine,visibility,budget,yield,drive',
    'F4c 门槛身份与顺序固定（yield 在 drive 之前：产出在退比空转更要紧）');
  // F5 dormant 只能从「本来是 running」拉下来：内容面有问题时不许报 dormant
  //   （否则「内容少」与「机制空转」两种病因同一个结论，诊断面失去归因）
  const W2 = loadAll();
  try { W2.capabilityTier.applyTier('lite'); } catch (e) {}
  try { W2.intake.setSettings({ enabled: true }); } catch (e) {}
  W2.driverLedger = fakeLedger(['intake']);
  const r2 = W2.healthPreflight.threeGates({ sample: 3 });
  assert(r2.verdict !== 'dormant',
    'F5 内容面已有 degraded 时 verdict 走 partial 而不是 dormant（实 ' + r2.verdict
    + '：degradedContent=' + r2.degradedContent + ' / degradedDrive=' + r2.degradedDrive + '）');
  assert(r2.degradedDrive > 0, 'F5b 而驱动面那一桶仍如实记着（实 ' + r2.degradedDrive + '）');
}

// ═══ N 负控制 ═══════════════════════════════════════════════════════════
function runNegative() {
  section('N. 负控制：三处真源码破坏 → 装载破坏副本 → 重跑同款判据');
  let broken = 0;
  // N1 判不了 ⇒ pass（把「不知道」冒充成「通过」）
  {
    must1(HP_SRC, A_CONCLUDE, 'N1');
    const b = HP_SRC.replace(A_CONCLUDE, A_CONCLUDE.replace('if (!canConclude)', 'if (false)'));
    assert(b !== HP_SRC, 'N1a 破坏副本真改了字节');
    if (b !== HP_SRC) broken++;
    const ov = {}; ov[HP_REL] = b;
    const W = loadAll(ov);
    try { W.capabilityTier.applyTier('full'); } catch (e) {}
    openExcluded(W);
    const r = W.healthPreflight.threeGates({ sample: 3 });
    const g = driveOf(r);
    assert(g.state !== 'unknown', 'N1b 破坏后不再报判不了（实 ' + g.state + '）—— 判据现形');
    eq(r.unverifiable, 0, 'N1c 顶层 unverifiable 归零（判不了被洗掉）');
    eq(r.ok, true, 'N1d 而 ok 仍是真 —— 这正是「不知道被当成健康」');
  }
  // N2 开着的 L3 ⇒ pass（把「空转」冒充成「健康」）
  {
    must1(HP_SRC, A_SILENT, 'N2');
    const b = HP_SRC.replace(A_SILENT, '} else if (false) {');
    assert(b !== HP_SRC, 'N2a 破坏副本真改了字节');
    if (b !== HP_SRC) broken++;
    const ov = {}; ov[HP_REL] = b;
    const W = loadAll(ov);
    const fake = fakeLedger(['intake']);
    try { W.capabilityTier.applyTier('full'); } catch (e) {}
    openExcluded(W);
    try { W.intake.setSettings({ enabled: true }); } catch (e) {}
    W.driverLedger = fake;
    const r = W.healthPreflight.threeGates({ sample: 3 });
    const g = driveOf(r);
    eq(g.state, 'pass', 'N2b 破坏后开着的 L3 被报成 pass —— 空转被洗白');
    eq(r.degradedDrive, 0, 'N2c 驱动面那一桶归零');
    assert(r.verdict !== 'dormant', 'N2d verdict 不再降级（实 ' + r.verdict + '）');
    eq(r.ok, true, 'N2e 而 ok 是真 —— 世界看着完全健康');
  }
  // N3 摘掉 verdict 的 dormant 分支 ⇒ 空转掉回 running
  {
    must1(HP_SRC, A_DORMANT, 'N3');
    const b = HP_SRC.replace(A_DORMANT, "else if (degradedDrive.length) verdict = 'running';");
    assert(b !== HP_SRC, 'N3a 破坏副本真改了字节');
    if (b !== HP_SRC) broken++;
    const ov = {}; ov[HP_REL] = b;
    const W = loadAll(ov);
    const fake = fakeLedger(['intake']);
    try { W.capabilityTier.applyTier('full'); } catch (e) {}
    openExcluded(W);
    try { W.intake.setSettings({ enabled: true }); } catch (e) {}
    W.driverLedger = fake;
    const r = W.healthPreflight.threeGates({ sample: 3 });
    eq(r.verdict, 'running', 'N3b 破坏后空转掉回 running');
    eq(r.degradedDrive, 1, 'N3c 而 degradedDrive 仍是 1（读数摆在那里，结论却错）');
  }
  eq(broken, 3, 'N4 三处破坏全部真的改到了源码');

  // N5 两向自证：恢复原版后判据重新为真
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  openExcluded(W);
  eq(driveOf(W.healthPreflight.threeGates({ sample: 2 })).state, 'unknown',
    'N5 原版恢复后回到 unknown（两向自证成立）');
  // N6 三个锚点在磁盘原版上各恰 1 次（负控制全跑在内存副本上，零文件改写）
  eq(cnt(HP_SRC, A_CONCLUDE), 1, 'N6a 锚点 N1 在磁盘原版上恰 1 次');
  eq(cnt(HP_SRC, A_SILENT), 1, 'N6b 锚点 N2 在磁盘原版上恰 1 次');
  eq(cnt(HP_SRC, A_DORMANT), 1, 'N6c 锚点 N3 在磁盘原版上恰 1 次');
  // N7 判据纯度（H5）：锚点字面量在本文件里只声明一次，判据区只引用变量。
  //   ⚠ 这里踩过一个自指陷阱（写出来警示）：第一版写成
  //     `cnt(SELF, '<声明前缀 A_CONCLUDE>') === 1` —— 而**注释行自己**就含那个串，
  //     于是 SELF 里出现 2 次，判据恒假。这不是产品缺陷，是判据自己数到了自己。
  //   修法：搜的串不能以字面形式出现在判据区（用拼接把声明名拆开）。
  const SELF = fs.readFileSync(__filename, 'utf8');
  const P1 = 'const A_' + 'CONCLUDE =';
  const P2 = 'const A_' + 'SILENT =';
  const P3 = 'const A_' + 'DORMANT =';
  assert(cnt(SELF, P1) === 1 && cnt(SELF, P2) === 1 && cnt(SELF, P3) === 1,
    'N7 三个锚点各只声明一次（判据区不重写字面量）');
}

function runAll(assertHost) {
  pass = 0; fail = 0; fails.length = 0;
  const outerAssert = (typeof assertHost === 'function') ? assertHost : assert;
  // 兼容两种调用：宿主传 assert 时用它汇总，否则自汇总（便于单跑）
  void outerAssert;
  runA(); runB(); runC(); runD(); runE(); runF();
  const before = fail;
  runNegative();
  console.log('\n═══ v7-drive-gate-2278: ' + pass + ' 通过 / ' + fail + ' 失败 ═══');
  if (fail) {
    console.log('失败项 ' + fail + ' 条（含负控制 ' + (fail - before > 0 ? '有' : '无') + '）');
  }
}

if (require.main === module) { runAll(); if (fail) process.exit(1); }
module.exports = { runAll: runAll, runNegative: runNegative };
