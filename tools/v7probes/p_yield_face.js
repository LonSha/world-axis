#!/usr/bin/env node
'use strict';
/**
 * tools/v7probes/p_yield_face.js — OPV7-3 验收探针（第五道门槛：世界产出面）。
 *
 * 【它验什么】读内容，不读开关。四件事：
 *   A 结构：判据只接一处、读数只走 yieldAttrib、按轮缓存真的存在
 *   B 现场：full 档有产出 ⇒ pass；产出计数与 yieldAttrib 直读同源（不另算一遍）
 *   C 硬判据：一台都不出内容 ⇒ blocked（「世界没有运转」）；且这不是靠 env 造出来的假红
 *   D 趋势：按轮推进真能看出 flat / shrinking；shrinking ⇒ degraded；
 *     首轮/无轮次 ⇒ trend=unknown 但 **state 不受影响**（不许把「刚开局」判成缺陷）
 *   E 缓存：同轮同开关 ⇒ 第二次命中缓存；开关一变 ⇒ 重测（不许拿旧产出冒充现在）
 *   F 出口：五态计数自洽、nextAction 在没有 fix 时也能说出成因（不许指回原地）
 *   G 负控制：三处真源码破坏（yield===0 不算 blocked / shrinking 不算 degraded / 缓存键忽略开关面）
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

let pass = 0, fail = 0;
function A(c, msg) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function head(t) { console.log('\n=== ' + t + ' ==='); }
function cnt(s, n) { return String(s).split(n).length - 1; }

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
// v2.283.0（OPV7-8）后：full 档出厂面下调 35 个 manualOnly 机制 ⇒ B6 断言前提
//   「full 全开 ⇒ off=0」不再成立（那是比例判据的预期行为，不是缺陷）。
//   修法与 p_drive_gate 同源：setup 里走 capabilityTier.flipSwitch 共用写入口
//   把下调面显式 flip 回开，不造第二套写法。
function openExcluded(W) {
  (W.capabilityTier.L3_EXCLUDES || []).forEach(function (k) {
    try { W.capabilityTier.flipSwitch(k, true); } catch (e) {}
  });
}
function setRound(WA, n) {
  // 轮次的真源是 store.lastInjection.round（缺失时回落 evolution.roundOf）。
  //   直接写 lastInjection 是**模拟一次注入已经发生过**，不是伪造别的什么。
  WA.store.transact(function (d) { d.lastInjection = { at: 1, round: n }; });
}
function yieldOf(r) {
  const g = (r.gates || []).filter(function (x) { return x.id === 'yield'; });
  return g.length === 1 ? g[0] : null;
}

// ═══ A 结构 ═══════════════════════════════════════════════════════════
head('A 结构：只接一处 / 读数只走 yieldAttrib / 按轮缓存');
A(cnt(HP_SRC, "gates.push(mk('yield', '世界产出面'") === 1,
  'A1 产出面门槛只 push 一次（实 ' + cnt(HP_SRC, "gates.push(mk('yield', '世界产出面'") + '）');
A(cnt(HP_SRC, 'yieldAttrib({ limit: 6 })') === 1,
  'A2 读数只走 yieldAttrib（实 ' + cnt(HP_SRC, 'yieldAttrib({ limit: 6 })') + ' 次）');
A(HP_SRC.indexOf('__yf') >= 0 && HP_SRC.indexOf('__YF_HIST') >= 0,
  'A3 按轮缓存真的存在（__yf / __YF_HIST）');
// A4 缓存键必须含开关面：只按轮缓存会让「玩家刚打开引擎」仍读到旧空产出
A(HP_SRC.indexOf("String(rk.round) + '|' + rk.onN + '|' + rk.total") >= 0,
  'A4 缓存键含轮次 + 开着的台数 + 总台数（不许只按轮）');
// A5 趋势真源是轮次不是调用次数
A(HP_SRC.indexOf("li.round") >= 0 && HP_SRC.indexOf('roundOf') >= 0,
  'A5 轮次取 lastInjection.round，回落 evolution.roundOf');
// A6 诊断节带出产出面读数（否则门槛存在但人看不见）
A(DIAG_SRC.indexOf('degradedContent: r.degradedContent') >= 0,
  'A6 诊断节把内容面子桶带出（yield 的 degraded 归这一桶）');

// ═══ B 现场 ═══════════════════════════════════════════════════════════
head('B 现场：full 档有产出 ⇒ pass，计数与 yieldAttrib 同源');
let WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
openExcluded(WA);   // OPV7-8 后补 flip：B6 的「full 全开 ⇒ off=0」前提需显式补齐下调面
const rB = WA.healthPreflight.threeGates({ sample: 3 });
const gB = yieldOf(rB);
A(!!gB, 'B1 读数里有 yield 门槛');
const yaB = WA.healthPreflight.yieldAttrib({ limit: 1 });
A(gB.nums.yield === yaB.yield && gB.nums.total === yaB.total,
  'B2 与 yieldAttrib 直读同源（' + gB.nums.yield + '/' + gB.nums.total
  + ' vs ' + yaB.yield + '/' + yaB.total + '）—— 不另算一遍');
A(gB.state === 'pass', 'B3 有产出 ⇒ pass（实 ' + gB.state + '）');
A(gB.nums.rounds >= 1, 'B4 该读数是第 1 轮（实 ' + gB.nums.rounds + '）');
A(gB.nums.trend === 'unknown' && gB.nums.trendWhy === 'first-round',
  'B5 首轮趋势 unknown（why=' + gB.nums.trendWhy + '）—— 不许拿单轮数据编趋势');
A(gB.nums.onAll === true, 'B6 onAll 与 off=0 自洽（实 off=' + gB.nums.off + '）');

// ═══ C 硬判据 ═══════════════════════════════════════════════════════════
head('C 硬判据：一台都不出内容 ⇒ blocked，且不会误伤「尚无数据」');
// C1 用**真破坏**造「全空」：把所有有产出的引擎关掉，看门槛怎么说。
//   这不是 env 造假 —— 它走的是真的 setSettings，与玩家手动关掉同一条路。
(function () {
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  const ya = W.healthPreflight.yieldAttrib({ limit: 200 });
  const yielded = ya.rows.filter(function (r) { return r.state === 'yield'; }).map(function (r) { return r.key; });
  A(yielded.length > 0, 'C1 前提：现场有产出的引擎 ' + yielded.length + ' 台（没这个前提测不出 blocked）');
  yielded.forEach(function (k) { try { W[k].setSettings({ enabled: false }); } catch (e) {} });
  const r = W.healthPreflight.threeGates({ sample: 3 });
  const g = yieldOf(r);
  A(g.nums.yield === 0, 'C2 关掉全部有产出的引擎后 yield=0（实 ' + g.nums.yield + '）');
  A(g.state === 'blocked',
    'C3 一台不出 + 还开着别的 ⇒ blocked（实 ' + g.state + ' / off=' + g.nums.off + ' / total=' + g.nums.total + '）');
  A(String(g.why).indexOf('世界没有运转') >= 0, 'C3b why 说「世界没有运转」（实「' + String(g.why).slice(0, 30) + '…」）');
  A(g.fix === null, 'C3c 不给假按钮（fix=null）—— 成因在世界内容侧，不在按钮上');
  A(r.verdict === 'empty-risk', 'C4 blocked ⇒ verdict=empty-risk（实 ' + r.verdict + '）');
  A(String(r.nextAction).indexOf('世界产出面') >= 0,
    'C4b nextAction 点名这道门槛且给出成因（实「' + String(r.nextAction).slice(0, 40) + '…」）');
  A(String(r.nextAction).indexOf('先修上面那条') < 0,
    'C4c 不许退回「先修上面那条」（那是指回原地的空话）');
})();

// ═══ D 趋势 ═══════════════════════════════════════════════════════════
head('D 趋势：按轮推进能看出 flat / shrinking；shrinking ⇒ degraded');
(function () {
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W, 1);
  const n1 = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  A(n1.trend === 'unknown' && n1.trendWhy === 'first-round',
    'D1 第 1 轮：趋势 unknown / first-round（实 ' + n1.trend + ' / ' + n1.trendWhy + '）');
  setRound(W, 2);
  const n2 = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  A(n2.trend === 'flat', 'D2 第 2 轮同产出 ⇒ flat（实 ' + n2.trend + ' / prev=' + n2.prev + '）');
  A(n2.prev === n1.yield, 'D2b prev 就是上一轮的产出（' + n2.prev + ' vs ' + n1.yield + '）');
  // 造收缩：关掉 4 台有产出的引擎（真 setSettings，与玩家手动关掉同一条路）
  const ya = W.healthPreflight.yieldAttrib({ limit: 200 });
  const yielded = ya.rows.filter(function (r) { return r.state === 'yield'; }).map(function (r) { return r.key; });
  yielded.slice(0, Math.max(1, Math.min(4, yielded.length - 1))).forEach(function (k) {
    try { W[k].setSettings({ enabled: false }); } catch (e) {}
  });
  setRound(W, 3);
  const r3 = W.healthPreflight.threeGates({ sample: 3 });
  const n3 = yieldOf(r3).nums;
  A(n3.yield < n2.yield, 'D3 前提：第 3 轮产出真的变少了（' + n2.yield + ' → ' + n3.yield + '）');
  A(n3.trend === 'shrinking', 'D4 变少 ⇒ shrinking（实 ' + n3.trend + '）');
  A(yieldOf(r3).state === 'degraded', 'D5 shrinking ⇒ degraded（实 ' + yieldOf(r3).state + '）');
  A(r3.verdict === 'partial', 'D6 degraded 归内容面 ⇒ verdict=partial（实 ' + r3.verdict + '）');
  A(r3.degradedContent >= 1 && r3.degradedDrive === 0, 'D6b 归进内容面而不是驱动面（content '
    + r3.degradedContent + ' / drive ' + r3.degradedDrive + '）');
})();
// D7 「刚开局」不许被当成缺陷：只有一轮且无产出以外的原因 ⇒ 不能因为 trend=unknown 就降级
(function () {
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W, 7);
  const r = W.healthPreflight.threeGates({ sample: 3 });
  const g = yieldOf(r);
  A(g.nums.trend === 'unknown', 'D7 前提前提：第 1 轮 trend=unknown');
  A(g.state !== 'degraded', 'D7 首轮 trace 判不了**不**把门槛拉成 degraded（实 ' + g.state + '）');
  A(r.unverifiableIds.indexOf('yield') < 0,
    'D7b 也不进 unverifiable（每局新世界都挂一条「判不了」= 判据噪声化）');
})();

// ═══ E 缓存 ═══════════════════════════════════════════════════════════
head('E 缓存：同轮同开关命中；开关一变就重测');
(function () {
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W, 5);
  const a = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  const b = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  A(a.cached === false && b.cached === true,
    'E1 第一次实测、第二次命中缓存（' + a.cached + ' → ' + b.cached + '）—— 面板一次渲染不再把 100 台引擎各 build 两三遍');
  A(a.yield === b.yield, 'E1b 命中缓存时读数一致（' + a.yield + ' vs ' + b.yield + '）');
  // 换轮次 ⇒ 必须重测
  setRound(W, 6);
  const c = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  A(c.cached === false, 'E2 换轮次 ⇒ 重测（实 cached=' + c.cached + '）');
  // 同轮但开关面变了 ⇒ 必须重测（否则「玩家刚打开引擎」仍读到旧空产出）
  const ya = W.healthPreflight.yieldAttrib({ limit: 200 });
  const yielded = ya.rows.filter(function (r) { return r.state === 'yield'; }).map(function (r) { return r.key; });
  if (yielded.length > 1) { try { W[yielded[0]].setSettings({ enabled: false }); } catch (e) {} }
  const d = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  A(d.cached === false, 'E3 同轮但开关面变了 ⇒ 重测（实 cached=' + d.cached + '）');
})();

// ═══ F 出口 ═══════════════════════════════════════════════════════════
head('F 出口面：五态自洽 + 没有 fix 也能说出成因');
WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
const rF = WA.healthPreflight.threeGates({ sample: 2 });
A(rF.passed + rF.blocked + rF.degraded + rF.absent + rF.unverifiable === 5,
  'F1 五态相加 = 门槛数 5（实 ' + (rF.passed + rF.blocked + rF.degraded + rF.absent + rF.unverifiable) + '）');
A(rF.gates.length === 5, 'F2 门槛数恰 5（实 ' + rF.gates.length + '）');
A(rF.gates.map(function (g) { return g.id; }).join(',') === 'engine,visibility,budget,yield,drive',
  'F3 顺序固定：yield 在 drive 之前（产出在退比空转更要紧）');
A(rF.degraded === rF.degradedContent + rF.degradedDrive, 'F4 degraded 两桶相加 = 总数');
const STATES = ['pass', 'blocked', 'degraded', 'absent', 'unknown'];
A(rF.gates.every(function (g) { return STATES.indexOf(g.state) >= 0; }), 'F5 每道门槛的 state 落在五态封闭集');

// ═══ G 负控制 ═══════════════════════════════════════════════════════════
head('G 负控制（三处真源码破坏）');
function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag);
}
const A_ZERO = "} else if (y.yield === 0 && y.total > 0) {";
const A_SHRI = "} else if (y.trend === 'shrinking') {";
const A_CKEY = "String(rk.round) + '|' + rk.onN + '|' + rk.total";
let broken = 0;
// G1 「一台不出内容」不再算 blocked
(function () {
  must1(HP_SRC, A_ZERO, 'G1');
  const b = HP_SRC.replace(A_ZERO, '} else if (false) {');
  A(b !== HP_SRC, 'G1a 破坏副本真改了字节');
  if (b !== HP_SRC) broken++;
  const ov = {}; ov[HP_REL] = b;
  const W = loadAll(ov);
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  const ya = W.healthPreflight.yieldAttrib({ limit: 200 });
  ya.rows.filter(function (r) { return r.state === 'yield'; }).forEach(function (r) {
    try { W[r.key].setSettings({ enabled: false }); } catch (e) {}
  });
  const g = yieldOf(W.healthPreflight.threeGates({ sample: 3 }));
  A(g.nums.yield === 0 && g.state !== 'blocked',
    'G1b 破坏后全空也报 ' + g.state + '（不是 blocked）—— 判据现形');
})();
// G2 「产出在退」不再算 degraded
(function () {
  must1(HP_SRC, A_SHRI, 'G2');
  const b = HP_SRC.replace(A_SHRI, '} else if (false) {');
  A(b !== HP_SRC, 'G2a 破坏副本真改了字节');
  if (b !== HP_SRC) broken++;
  const ov = {}; ov[HP_REL] = b;
  const W = loadAll(ov);
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W, 1); W.healthPreflight.threeGates({ sample: 3 });
  setRound(W, 2);
  const ya = W.healthPreflight.yieldAttrib({ limit: 200 });
  ya.rows.filter(function (r) { return r.state === 'yield'; }).slice(0, 3).forEach(function (r) {
    try { W[r.key].setSettings({ enabled: false }); } catch (e) {}
  });
  setRound(W, 3);
  const g = yieldOf(W.healthPreflight.threeGates({ sample: 3 }));
  A(g.nums.trend === 'shrinking' && g.state !== 'degraded',
    'G2b 破坏后 trend 仍报 shrinking（' + g.nums.trend + '）但 state 是 ' + g.state + ' —— 读数在、结论丢');
})();
// G3 缓存键忽略开关面 ⇒ 玩家刚打开引擎仍读旧空产出
(function () {
  must1(HP_SRC, A_CKEY, 'G3');
  const b = HP_SRC.replace(A_CKEY, "String(rk.round) + '|' + rk.total");
  A(b !== HP_SRC, 'G3a 破坏副本真改了字节');
  if (b !== HP_SRC) broken++;
  // ⚠ 前提必须在**原版**上验（踩过）：第一版拿破坏副本测前提，而破坏副本本来就不重测，
  //   于是前提恒假、整段 G3 测不成。前提是「切档会让产出真的变」—— 那是原版的性质。
  (function () {
    const W0 = loadAll();
    try { W0.capabilityTier.applyTier('lite'); } catch (e) {}
    setRound(W0, 4);
    const y0 = yieldOf(W0.healthPreflight.threeGates({ sample: 3 })).nums;
    try { W0.capabilityTier.applyTier('full'); } catch (e) {}
    const y1 = yieldOf(W0.healthPreflight.threeGates({ sample: 3 })).nums;
    A(y0.yield < y1.yield, 'G3 前提（原版上）：切档后产出确实变了（' + y0.yield + ' → ' + y1.yield + '）');
  })();
  const ov = {}; ov[HP_REL] = b;
  const W = loadAll(ov);
  try { W.capabilityTier.applyTier('lite'); } catch (e) {}
  setRound(W, 4);
  const before = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  const after = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  // 期望：破坏版仍返回切档前的产出（缓存没失效）
  A(after.cached === true && after.yield === before.yield,
    'G3b 破坏后切了档仍命中旧缓存（cached=' + after.cached + ' / yield=' + after.yield
    + '，应停在 ' + before.yield + '）—— 玩家刚打开的引擎不被看到');
})();
A(broken === 3, 'G4 三处破坏全部真的改到了源码（实 ' + broken + '）');
// G5 两向自证：恢复原版后判据重新为真
WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
setRound(WA, 8);
const rBack = WA.healthPreflight.threeGates({ sample: 3 });
A(yieldOf(rBack).state === 'pass', 'G5 原版恢复后回到 pass（实 ' + yieldOf(rBack).state + '）—— 两向自证成立');
A(cnt(HP_SRC, A_ZERO) === 1 && cnt(HP_SRC, A_SHRI) === 1 && cnt(HP_SRC, A_CKEY) === 1,
  'G6 三个锚点在原文件里各恰 1 次（负控制全跑在内存副本上，零文件改写）');

console.log('');
console.log('========== 汇总：' + pass + ' passed, ' + fail + ' failed ==========');
if (fail) process.exit(1);
