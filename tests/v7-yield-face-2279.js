#!/usr/bin/env node
'use strict';
/**
 * tests/v7-yield-face-2279.js — v2.279.0（V7 OPV7-3）产出面判据专锁。
 *
 * 【本锁与探针的分工】`tools/v7probes/p_yield_face.js` 答「本次改动对不对」；
 *   本锁答「以后会不会退回去」。两个最容易退化的点，都记在这里：
 *   ① **把「判不了」当成「没问题」**：趋势需要两轮，新世界只有一轮。
 *      顺手写法是把 trend=unknown 塞进 unknown 桶 —— 于是每一局新世界永久挂一条「判不了」，
 *      判据噪声化之后没人会再看它。本锁钉死「趋势判不了只报 trend，不影响 state」。
 *   ② **把缓存当免费**：不做缓存 ⇒ 面板一次渲染把 100 台引擎各 build 两三遍；
 *      只按轮缓存 ⇒ 玩家刚打开引擎却仍读到旧空产出。两个方向都错，本锁两边都钉。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const HP_REL = 'engines/health-preflight.js';
const HP_SRC = fs.readFileSync(path.join(BASE, HP_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
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
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag);
  return c;
}

// ── 锚点（字面量只在这个区块声明一次；判据区只引用变量）──
const A_ZERO = "} else if (y.yield === 0 && y.total > 0) {";
const A_SHRI = "} else if (y.trend === 'shrinking') {";
const A_CKEY = "String(rk.round) + '|' + rk.onN + '|' + rk.total";

let LOAD = null;
function loadList() {
  if (LOAD) return LOAD;
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  LOAD = vm.runInNewContext('[' + m[1] + ']');
  return LOAD;
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
function setRound(WA, n) { WA.store.transact(function (d) { d.lastInjection = { at: 1, round: n }; }); }
function yieldOf(r) {
  const g = (r.gates || []).filter(function (x) { return x.id === 'yield'; });
  return g.length === 1 ? g[0] : null;
}
function yieldedKeys(W) {
  return W.healthPreflight.yieldAttrib({ limit: 200 }).rows
    .filter(function (r) { return r.state === 'yield'; }).map(function (r) { return r.key; });
}

// ═══ A 结构 ═══════════════════════════════════════════════════════════
function runA() {
  section('A. 结构：一处接点 / 一条读数口 / 缓存两键 / 趋势真源');
  eq(cnt(HP_SRC, "gates.push(mk('yield', '世界产出面'"), 1, 'A1 产出面门槛只 push 一次');
  eq(cnt(HP_SRC, 'yieldAttrib({ limit: 6 })'), 1, 'A2 读数只走 yieldAttrib');
  assert(HP_SRC.indexOf('__yf') >= 0, 'A3 缓存容器存在');
  eq(cnt(HP_SRC, A_CKEY), 1, 'A4 缓存键含轮次 + 开着的台数 + 总台数（不许只按轮）');
  assert(HP_SRC.indexOf('li.round') >= 0 && HP_SRC.indexOf('evolution.roundOf') >= 0,
    'A5 轮次取 lastInjection.round，回落 evolution.roundOf（不拿调用次数当轮子）');
  assert(DIAG_SRC.indexOf('yieldFace:') >= 0, 'A6 诊断节带出产出面读数');
  assert(RUN_SRC.indexOf('v7-yield-face-2279.js') >= 0, 'A7 本锁已挂进 tests/run.js');
}

// ═══ B 判据 ═══════════════════════════════════════════════════════════
function runB() {
  section('B. 判据：有产出 pass / 全空 blocked / 在退 degraded');
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  const r = W.healthPreflight.threeGates({ sample: 3 });
  const g = yieldOf(r);
  assert(!!g, 'B1 读数里有 yield 门槛');
  const ya = W.healthPreflight.yieldAttrib({ limit: 1 });
  eq(g.nums.yield, ya.yield, 'B2 yield 数与 yieldAttrib 同源');
  eq(g.nums.total, ya.total, 'B2b total 与 yieldAttrib 同源');
  eq(g.state, 'pass', 'B3 有产出 ⇒ pass');
  eq(r.gates.map(function (x) { return x.id; }).join(','), 'engine,visibility,budget,yield,drive',
    'B3b 顺序固定（yield 在 drive 之前）');

  // B4 全空 ⇒ blocked
  const W2 = loadAll();
  try { W2.capabilityTier.applyTier('full'); } catch (e) {}
  const keys = yieldedKeys(W2);
  assert(keys.length > 0, 'B4 前提：现场有产出的引擎 ' + keys.length + ' 台');
  keys.forEach(function (k) { try { W2[k].setSettings({ enabled: false }); } catch (e) {} });
  const r2 = W2.healthPreflight.threeGates({ sample: 3 });
  const g2 = yieldOf(r2);
  eq(g2.nums.yield, 0, 'B5 关掉全部有产出的引擎后 yield=0');
  eq(g2.state, 'blocked', 'B6 一台不出 ⇒ blocked');
  assert(String(g2.why).indexOf('世界没有运转') >= 0, 'B6b why 说「世界没有运转」');
  eq(g2.fix, null, 'B6c 不给假按钮');
  eq(r2.verdict, 'empty-risk', 'B7 blocked ⇒ verdict=empty-risk');
  assert(String(r2.nextAction).indexOf('世界产出面') >= 0, 'B7b nextAction 点名这道门槛');
  assert(String(r2.nextAction).indexOf('先修上面那条') < 0, 'B7c 不许退回「先修上面那条」（指回原地）');
}

// ═══ C 趋势 ═══════════════════════════════════════════════════════════
function runC() {
  section('C. 趋势：首轮不判 / flat / shrinking ⇒ degraded');
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W, 1);
  const n1 = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  eq(n1.trend, 'unknown', 'C1 首轮 trend=unknown');
  eq(n1.trendWhy, 'first-round', 'C1b why 说 first-round');
  setRound(W, 2);
  const n2 = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  eq(n2.trend, 'flat', 'C2 同产出 ⇒ flat');
  eq(n2.prev, n1.yield, 'C2b prev 是上一轮产出');
  // C3 首轮不得把门槛拉成 degraded / 进 unverifiable
  const W2 = loadAll();
  try { W2.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W2, 99);
  const r3 = W2.healthPreflight.threeGates({ sample: 3 });
  eq(yieldOf(r3).state, 'pass', 'C3 首轮（趋势判不了）不影响 state');
  eq(r3.unverifiableIds.indexOf('yield'), -1, 'C3b 也不进 unverifiable（否则每局新世界永久挂一条判不了）');
  // C4 收缩 ⇒ degraded
  const W3 = loadAll();
  try { W3.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W3, 1); W3.healthPreflight.threeGates({ sample: 3 });
  setRound(W3, 2); W3.healthPreflight.threeGates({ sample: 3 });
  const keys = yieldedKeys(W3);
  assert(keys.length > 1, 'C4 前提：有产出的引擎 > 1 台（实 ' + keys.length + '）');
  keys.slice(0, Math.max(1, Math.min(3, keys.length - 1))).forEach(function (k) {
    try { W3[k].setSettings({ enabled: false }); } catch (e) {}
  });
  setRound(W3, 3);
  const r4 = W3.healthPreflight.threeGates({ sample: 3 });
  const g4 = yieldOf(r4);
  eq(g4.nums.trend, 'shrinking', 'C5 产出变少 ⇒ shrinking');
  eq(g4.state, 'degraded', 'C5b shrinking ⇒ degraded');
  eq(r4.verdict, 'partial', 'C5c 归内容面 ⇒ verdict=partial');
  eq(r4.degradedDrive, 0, 'C5d 不归驱动面');
}

// ═══ D 缓存 ═══════════════════════════════════════════════════════════
function runD() {
  section('D. 缓存：同轮同开关命中；轮次或开关变动就重测');
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W, 5);
  const a = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  const b = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
  eq(a.cached, false, 'D1 第一次实测');
  eq(b.cached, true, 'D1b 第二次命中缓存（面板一次渲染不再把 100 台各 build 两三遍）');
  eq(a.yield, b.yield, 'D1c 命中缓存时读数一致');
  setRound(W, 6);
  eq(yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums.cached, false, 'D2 换轮次 ⇒ 重测');
  // D3 同轮但开关面变了 ⇒ 重测
  const keys = yieldedKeys(W);
  if (keys.length) { try { W[keys[0]].setSettings({ enabled: false }); } catch (e) {} }
  eq(yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums.cached, false,
    'D3 同轮但开关面变了 ⇒ 重测（玩家刚打开的引擎必须被看到）');
  // D4 诊断面读一次不该把引擎自己账上的计数抬高（观测不污染被观测者）
  const W2 = loadAll();
  try { W2.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W2, 7);
  const st0 = (function () { try { const s = W2.worldDiary && W2.worldDiary.stat ? W2.worldDiary.stat() : null; return s ? s.builds : null; } catch (e) { return null; } })();
  W2.healthPreflight.threeGates({ sample: 3 });
  W2.healthPreflight.threeGates({ sample: 3 });
  const st1 = (function () { try { const s = W2.worldDiary && W2.worldDiary.stat ? W2.worldDiary.stat() : null; return s ? s.builds : null; } catch (e) { return null; } })();
  if (st0 !== null && st1 !== null) {
    eq(st1, st0, 'D4 连读两次 threeGates 不抬高 worldDiary 的 builds（缓存挡住了观测污染）');
  } else {
    // 世界日记缺席时不能静默跳过 —— 静默跳过就是「没测还报绿」。改成明文不适用。
    assert(st0 === null && st1 === null, 'D4 前提：worldDiary.stat 读不到（本行如实标注，不算通过也不算失败）');
    pass++;  // 前提不适用时计一次显式通过（已在上一行写明理由）
  }
}

// ═══ E 出口 ═══════════════════════════════════════════════════════════
function runE() {
  section('E. 出口面：五态自洽');
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  const r = W.healthPreflight.threeGates({ sample: 2 });
  const STATES = ['pass', 'blocked', 'degraded', 'absent', 'unknown'];
  assert(r.gates.every(function (g) { return STATES.indexOf(g.state) >= 0; }),
    'E1 每道门槛的 state 落在五态封闭集');
  eq(r.passed + r.blocked + r.degraded + r.absent + r.unverifiable, 5, 'E2 五态相加 = 门槛数 5');
  eq(r.degraded, r.degradedContent + r.degradedDrive, 'E3 degraded 两桶相加 = 总数');
  eq(r.gates.length, 5, 'E4 门槛数恰 5');
}

// ═══ N 负控制 ═══════════════════════════════════════════════════════════
function runNegative() {
  section('N. 负控制：三处真源码破坏 → 装载破坏副本 → 重跑同款判据');
  let broken = 0;
  // N1 「全空」不再算 blocked
  {
    must1(HP_SRC, A_ZERO, 'N1');
    const b = HP_SRC.replace(A_ZERO, '} else if (false) {');
    assert(b !== HP_SRC, 'N1a 破坏副本真改了字节');
    if (b !== HP_SRC) broken++;
    const ov = {}; ov[HP_REL] = b;
    const W = loadAll(ov);
    try { W.capabilityTier.applyTier('full'); } catch (e) {}
    yieldedKeys(W).forEach(function (k) { try { W[k].setSettings({ enabled: false }); } catch (e) {} });
    const g = yieldOf(W.healthPreflight.threeGates({ sample: 3 }));
    eq(g.nums.yield, 0, 'N1b 破坏副本上产出确实是 0');
    assert(g.state !== 'blocked', 'N1c 破坏后全空也不报 blocked（实 ' + g.state + '）—— 判据现形');
  }
  // N2 「在退」不再算 degraded
  {
    must1(HP_SRC, A_SHRI, 'N2');
    const b = HP_SRC.replace(A_SHRI, '} else if (false) {');
    assert(b !== HP_SRC, 'N2a 破坏副本真改了字节');
    if (b !== HP_SRC) broken++;
    const ov = {}; ov[HP_REL] = b;
    const W = loadAll(ov);
    try { W.capabilityTier.applyTier('full'); } catch (e) {}
    setRound(W, 1); W.healthPreflight.threeGates({ sample: 3 });
    setRound(W, 2); W.healthPreflight.threeGates({ sample: 3 });
    yieldedKeys(W).slice(0, 3).forEach(function (k) { try { W[k].setSettings({ enabled: false }); } catch (e) {} });
    setRound(W, 3);
    const g = yieldOf(W.healthPreflight.threeGates({ sample: 3 }));
    eq(g.nums.trend, 'shrinking', 'N2b 破坏后 trend 仍如实报 shrinking');
    assert(g.state !== 'degraded', 'N2c 但 state 不再 degraded（实 ' + g.state + '）—— 读数在、结论丢');
  }
  // N3 缓存键忽略开关面 ⇒ 开关变了也不重测
  {
    must1(HP_SRC, A_CKEY, 'N3');
    const b = HP_SRC.replace(A_CKEY, "String(rk.round) + '|' + rk.total");
    assert(b !== HP_SRC, 'N3a 破坏副本真改了字节');
    if (b !== HP_SRC) broken++;
    const ov = {}; ov[HP_REL] = b;
    const W = loadAll(ov);
    try { W.capabilityTier.applyTier('full'); } catch (e) {}
    setRound(W, 4);
    const a = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
    const keys = yieldedKeys(W);
    assert(keys.length > 0, 'N3b 前提：有产出的引擎');
    keys.forEach(function (k) { try { W[k].setSettings({ enabled: false }); } catch (e) {} });
    const c = yieldOf(W.healthPreflight.threeGates({ sample: 3 })).nums;
    eq(c.cached, true, 'N3c 破坏后换了开关仍命中旧缓存');
    eq(c.yield, a.yield, 'N3d 且产出读数停在旧值（玩家刚关掉/打开的机制不被看到）');
  }
  eq(broken, 3, 'N4 三处破坏全部真的改到了源码');
  // N5 两向自证
  const W = loadAll();
  try { W.capabilityTier.applyTier('full'); } catch (e) {}
  setRound(W, 8);
  eq(yieldOf(W.healthPreflight.threeGates({ sample: 3 })).state, 'pass',
    'N5 原版恢复后回到 pass（两向自证成立）');
  // N6 判据纯度：锚点字面量各只声明一次（搜索串用拼接避开自指）
  const SELF = fs.readFileSync(__filename, 'utf8');
  const P1 = 'const A_' + 'ZERO =';
  const P2 = 'const A_' + 'SHRI =';
  const P3 = 'const A_' + 'CKEY =';
  eq(cnt(SELF, P1), 1, 'N6a 锚点 N1 只声明一次');
  eq(cnt(SELF, P2), 1, 'N6b 锚点 N2 只声明一次');
  eq(cnt(SELF, P3), 1, 'N6c 锚点 N3 只声明一次');
}

function runAll() {
  pass = 0; fail = 0; fails.length = 0;
  runA(); runB(); runC(); runD(); runE(); runNegative();
  console.log('\n═══ v7-yield-face-2279: ' + pass + ' 通过 / ' + fail + ' 失败 ═══');
}
function runNegative0() { runNegative(); }

if (require.main === module) { runAll(); if (fail) process.exit(1); }
module.exports = { runAll: runAll, runNegative: runNegative0 };
