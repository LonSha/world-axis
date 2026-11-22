#!/usr/bin/env node
// WorldAxis tests/causal-trace-v2147.js —— W1 跨模块因果追溯图谱锁（v2.147.0）
//
// 【它治的病】因果结算（v2.62.0）钉“一条链怎么走完”、v2.146.0（F2/W3）钉“在途链谁引用谁、
//   多结局可达集”；但“一个**事实**从哪来、被谁引用、级联到哪”——以事实为轴心的全链路追溯——
//   全库零回答（`traceGraph` / `causalTrace` / `追溯图谱` 零命中，W1）。
//   于是：把“事实 → 引用它的链 → 链产出的新事实 → 再引用”这条因果走廊漏记、
//   把跨模块归属打错、把“链引用回声”这一跳漏掉、或把深度上限放开成无限，
//   与正确实现一样能过所有存在面判据（有 traceGraph 吗 / 有 nodes 吗）。
//
// 【与既有锁的正交面】
//   · causal-v2620  钉“单链的阶段格与终态归因”；
//   · causal-ripple-v2146 钉“链↔链的级联网 + 结局树”——节点只有链，不答事实来源；
//   · 本锁钉“事实轴心的双向追溯”：节点三类（fact/chain/echo）、边三类
//     （produced 链产出事实 / cited 因果被引用 / echoed 回声），跨模块口径 modules。
//
// 【做法】判据全部跑在真源码上（gate.fresh 装载真 LOAD），只借宿主桩。
//   破坏自证走 opts.srcOverride：把真源码在内存副本上改坏后重跑同款探针，一个字节都不改仓库文件。
//
// 【正向判据】
//   1  级联场（F1→A[immediate+delayed]→回声→B）：traceGraph('F1') 得 traced，
//      nodes 含三类（fact/chain/echo），edges 含三类（cited/echoed/produced），
//      produced 边 A→causal:A 必在（immediate 落事实的独特贡献面）。
//   2  以 causal:A 直接作入口：仍 traced，且 produced 边不丢（fact 分支①的现形面）。
//   3  modules 去重排序、含因果走廊实际跨到的模块（politics+causal）。
//   4  deep 场（F1→A→B→C→D 四级）：MAX_DEPTH=3 剪枝，nodes=4/edges=3，C/D 不可达。
//   5  孤立事实（有事实无人引用）：no-edges，nodes=1/edges=0，不编造。
//   6  负向三态：no-trace（查无此事实）/ missing-fields（空键）/ disabled（关闸）。
//   7  返回形状：{ok,root,nodes,edges,modules,reason} 且 reason ∈ 既定词表。
//
// 【负控制】N0 三个破坏锚点在真源码中各恰中 1 次；N1 破坏后对应判据现形；
//   N2 原版源码上同款探针全绿（两向自证）；N3 逐锚敏感（三种破坏各只触发对应面）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');                     // 宿主桩：localStorage / SillyTavern
const LS = global.localStorage;

const TAG = '__ct2147_';                  // 哨兵前缀

// ── 三个破坏锚点：**只在真源码里各出现一次**（N0 校验）──
const A_DEPTH = 'const MAX_DEPTH = 3;';          // N1a 深度剪枝（放开 ⇒ 深链场现形）
const A_CITE  = 'cause === keyOrId';             // N1b 引用链判定（cited 边唯一来源）
const A_ECHO  = 'ec.refCurrent !== cur.key';     // N1c 回声归属（echoed 边唯一来源）

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function causalOf(WA) {
  if (!WA.causal) throw new Error('WA.causal 未装载（engines/causal.js 不在 LOAD 清单里？）');
  return WA.causal;
}
function st(WA) { return WA.store.get() || {}; }
function chainById(WA, id) {
  return ((st(WA).causal || {}).chains || []).filter(function (x) { return x && x.id === id; })[0] || null;
}
function seedFact(WA, key, source) {
  WA.store.transact(function (d) {
    d.worldFacts = (d.worldFacts || []).concat([{ id: key, key: key, value: 'v', scope: 'world', source: source, at: 1 }]);
  }, TAG + 'seed');
}
function resetCausal(WA) {
  WA.store.transact(function (d) {
    d.causal = { chains: [], settled: [] };
    d.echoes = [];
    d.worldFacts = (d.worldFacts || []).filter(function (w) { return !(w && String(w.key || '').indexOf(TAG) === 0); });
  }, TAG + 'reset');
}

// ── 判据自身的无副作用隔离：快照 → 跑 → 还原 ──
function snapshotLS() {
  const out = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) out[k] = LS.getItem(k); }
  return out;
}
function restoreLS(snap) {
  const drop = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}

// ══════════════ 造场 ══════════════
/** 级联场：F1 → A（immediate 落 causal:A 事实 + delayed 结算出回声）→ 回声 → B */
function buildCascade(WA) {
  const c = causalOf(WA);
  c.setSettings({ enabled: true });
  resetCausal(WA);
  seedFact(WA, TAG + 'F', 'politics');
  const A = c.addChain({ cause: TAG + 'F', action: '关门', immediate: '灯灭', delayed: [{ text: '邻居被吵醒', after: 0 }] });
  c.tick({}); c.tick({}); c.tick({});   // open→acted→immediate(落事实)→delayed
  const rowA = chainById(WA, A.id);
  const did = rowA.delayed[0].id;
  c.settle(A.id, did, '邻居确实被吵醒');
  const echoId = 'ec_' + did;
  const B = c.addChain({ cause: echoId, action: '回去查看' });
  c.tick({}); c.tick({});
  return { c: c, A: A, B: B, echoId: echoId, causalKey: 'causal:' + A.id };
}
/** 深链场：F1 → A → B → C → D（每级 immediate 落事实，下链以 causal:<prev> 为原因） */
function buildDeep(WA) {
  const c = causalOf(WA);
  c.setSettings({ enabled: true });
  resetCausal(WA);
  seedFact(WA, TAG + 'F', 'politics');
  const mk = function (cause, action) { return c.addChain({ cause: cause, action: action, immediate: 'im-' + action }); };
  const A = mk(TAG + 'F', 'a'); c.tick({}); c.tick({}); c.tick({});
  const B = mk('causal:' + A.id, 'b'); c.tick({}); c.tick({}); c.tick({});
  const C = mk('causal:' + B.id, 'c'); c.tick({}); c.tick({}); c.tick({});
  const D = mk('causal:' + C.id, 'd'); c.tick({}); c.tick({}); c.tick({});
  return { c: c, A: A, B: B, C: C, D: D };
}

// ── 探针（供 N1/N2 两向复用）──
/** 级联场追溯签名：reason / 三类节点 / 三类边 / produced 边 / modules */
function probeGraph(WA) {
  const b = buildCascade(WA);
  const r = b.c.traceGraph(b.causalKey);   // 以 causal:A 作入口（最严苛：produced 必在）
  return {
    reason: r.reason,
    hasFact: r.nodes.some(function (n) { return n.kind === 'fact'; }),
    hasChain: r.nodes.some(function (n) { return n.kind === 'chain'; }),
    hasEcho: r.nodes.some(function (n) { return n.kind === 'echo'; }),
    hasProduced: r.edges.some(function (e) { return e.kind === 'produced'; }),
    hasCited: r.edges.some(function (e) { return e.kind === 'cited'; }),
    hasEchoed: r.edges.some(function (e) { return e.kind === 'echoed'; }),
    producedOk: r.edges.some(function (e) { return e.kind === 'produced' && e.from === 'c:' + b.A.id && e.to === 'f:' + b.causalKey; }),
    modules: r.modules.slice()
  };
}
/** root echoed 面：F1 入口下 f:F1 -echoed-> e 边（fact 分支③，受 A_ECHO 锚点保护） */
function probeEcho(WA) {
  const b = buildCascade(WA);
  const r = b.c.traceGraph(TAG + 'F');
  return {
    rootEchoed: r.edges.some(function (e) { return e.kind === 'echoed' && e.from === 'f:' + TAG + 'F'; }),
    fromRoot: r.nodes.some(function (n) { return n.id === 'f:' + TAG + 'F'; })
  };
}
/** 深链场剪枝签名：节点/边数 + C/D 是否漏进来 */
function probeDeep(WA) {
  const b = buildDeep(WA);
  const r = b.c.traceGraph(TAG + 'F');
  const ids = r.nodes.map(function (n) { return n.id; });
  return {
    nodes: r.nodes.length, edges: r.edges.length, reason: r.reason,
    hasA: ids.indexOf('c:' + b.A.id) >= 0, hasB: ids.indexOf('c:' + b.B.id) >= 0,
    hasC: ids.indexOf('c:' + b.C.id) >= 0, hasD: ids.indexOf('c:' + b.D.id) >= 0
  };
}

// ══════════════ 正向判据 ══════════════
function judge(a) {
  const WA = fresh();
  const c = causalOf(WA);

  // ── 1 级联场：traced + 三类节点 + 三类边 ──
  const b = buildCascade(WA);
  const r = b.c.traceGraph(TAG + 'F');
  a(r.ok === true && r.reason === 'traced',
    'v2147: [1] 级联场 ⇒ traced（实 reason=' + r.reason + '）');
  a(r.nodes.some(function (n) { return n.kind === 'fact'; }) &&
    r.nodes.some(function (n) { return n.kind === 'chain'; }) &&
    r.nodes.some(function (n) { return n.kind === 'echo'; }),
    'v2147: [1b] 节点三类齐全（fact/chain/echo）');
  a(r.edges.some(function (e) { return e.kind === 'cited'; }) &&
    r.edges.some(function (e) { return e.kind === 'echoed'; }) &&
    r.edges.some(function (e) { return e.kind === 'produced'; }),
    'v2147: [1c] 边三类齐全（cited/echoed/produced）');
  a(r.edges.some(function (e) { return e.kind === 'produced' && e.from === 'c:' + b.A.id && e.to === 'f:causal:' + b.A.id; }),
    'v2147: [1d] produced 边 A→causal:A 在（immediate 落事实的独特面）');

  // ── 2 以 causal:A 直接作入口：produced 不丢 ──
  const g = probeGraph(WA);
  a(g.reason === 'traced', 'v2147: [2] causal:A 入口仍 traced（实 ' + g.reason + '）');
  a(g.producedOk, 'v2147: [2b] causal:A 入口 produced 边不丢（fact 分支①现形面）');

  // ── 3 modules 去重、含跨模块走廊 ──
  a(Array.isArray(g.modules) && g.modules.indexOf('politics') >= 0 && g.modules.indexOf('causal') >= 0,
    'v2147: [3] modules 含 politics+causal（实 ' + JSON.stringify(g.modules) + '）');
  a(g.modules.length === 2, 'v2147: [3b] modules 去重后恰 2 个（实 ' + JSON.stringify(g.modules) + '）');

  // ── 4 深链场剪枝：MAX_DEPTH=3 ⇒ nodes=4/edges=3，C/D 剪掉 ──
  const d = probeDeep(WA);
  a(d.nodes === 4 && d.edges === 3 && d.reason === 'traced',
    'v2147: [4] 深链场 nodes=4/edges=3（实 nodes=' + d.nodes + ' edges=' + d.edges + ' reason=' + d.reason + '）');
  a(d.hasA && d.hasB && !d.hasC && !d.hasD,
    'v2147: [4b] A/B 在界内、C/D 被剪（深度限现形）');

  // ── 5 孤立事实：no-edges，不编造 ──
  isolated(function () {
    const W2 = fresh(); const c2 = causalOf(W2); c2.setSettings({ enabled: true });
    resetCausal(W2);
    seedFact(W2, TAG + 'X', 'lone');
    const r2 = c2.traceGraph(TAG + 'X');
    a(r2.ok === true && r2.reason === 'no-edges' && r2.nodes.length === 1 && r2.edges.length === 0,
      'v2147: [5] 孤立事实 no-edges/nodes=1/edges=0（实 reason=' + r2.reason + ' nodes=' + r2.nodes.length + '）');
  });

  // ── 6 负向三态 ──
  isolated(function () {
    const W3 = fresh(); const c3 = causalOf(W3); c3.setSettings({ enabled: true });
    const nt = c3.traceGraph(TAG + 'NO_SUCH_FACT');
    a(nt.ok === false && nt.reason === 'no-trace' && nt.root === TAG + 'NO_SUCH_FACT',
      'v2147: [6] 查无此事实 ⇒ no-trace（实 reason=' + nt.reason + '）');
    const mf = c3.traceGraph('');
    a(mf.ok === false && mf.reason === 'missing-fields',
      'v2147: [6b] 空键 ⇒ missing-fields（实 reason=' + mf.reason + '）');
  });
  isolated(function () {
    const W4 = fresh(); const c4 = causalOf(W4); c4.setSettings({ enabled: false });
    resetCausal(W4);
    seedFact(W4, TAG + 'Y', 'lone');
    const ds = c4.traceGraph(TAG + 'Y');
    a(ds.ok === false && ds.reason === 'disabled',
      'v2147: [6c] disabled ⇒ disabled（实 reason=' + ds.reason + '）');
  });

  // ── 7 返回形状 + reason 词表 ──
  a(r.root !== undefined && Array.isArray(r.nodes) && Array.isArray(r.edges) && Array.isArray(r.modules),
    'v2147: [7] 返回形状 {ok,root,nodes,edges,modules,reason} 齐全');
  const REASONS = ['traced', 'no-edges', 'no-trace', 'missing-fields', 'disabled'];
  a(REASONS.indexOf(r.reason) >= 0, 'v2147: [7b] reason 在既定词表内（实 ' + r.reason + '）');
}

// ══════════════ 破坏探针 ══════════════
const BROKEN = [
  { key: 'depth', rel: 'engines/causal.js', from: A_DEPTH, to: 'const MAX_DEPTH = 99;' },
  { key: 'cite',  rel: 'engines/causal.js', from: A_CITE,  to: 'cause === keyOrId && false' },
  { key: 'echo',  rel: 'engines/causal.js', from: A_ECHO,  to: 'ec.refCurrent !== cur.key || true' }
];
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点应恰中 1 次，实 ' + hits + ' 次：' + spec.rel + ' :: ' + spec.from);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function probeWith(spec, fn) { return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); }); }
function probeClean(fn) { return isolated(function () { return fn(fresh()); }); }

// ══════════════ 负控制 ══════════════
function runNegative(a) {
  // N0 三个破坏锚点在真源码中各恰中 1 次（锚点漂移即「负控制静默失效」）
  const bad = [];
  BROKEN.forEach(function (spec) {
    const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
    const hits = src.split(spec.from).length - 1;
    if (hits !== 1) bad.push(spec.key + '(' + hits + ')');
  });
  a(bad.length === 0, 'v2147: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (bad.join(',') || '无') + '）');

  // N0b 破坏副本确实生成且与真源码不同（否则「两向自证」是空转）
  const src = fs.readFileSync(path.join(BASE, 'engines/causal.js'), 'utf8');
  const diffOk = BROKEN.every(function (spec) { return brokenOverride(spec)[spec.rel] !== src; });
  a(diffOk, 'v2147: [N0b] 三种破坏的内存副本都与真源码不同（非空转）');

  // N1 破坏后对应判据现形
  const dDepth = probeWith(BROKEN[0], probeDeep);
  a(dDepth.hasC || dDepth.nodes > 4,
    'v2147: [N1] MAX_DEPTH 被放开 ⇒ 深链场 C 漏进图谱（实 nodes=' + dDepth.nodes + ' hasC=' + dDepth.hasC + '）');
  const gCite = probeWith(BROKEN[1], probeGraph);
  a(gCite.reason === 'no-edges' || !gCite.hasCited,
    'v2147: [N1] cited 判定被破坏 ⇒ cited 边/图谱消失（实 reason=' + gCite.reason + '）');
  const eEcho = probeWith(BROKEN[2], probeEcho);
  a(!eEcho.rootEchoed, 'v2147: [N1] 回声归属被破坏 ⇒ root echoed 边消失（实 rootEchoed=' + eEcho.rootEchoed + '）');

  // N2 两向自证：原版源码上同款探针全绿
  const gOk = probeClean(probeGraph);
  a(gOk.reason === 'traced' && gOk.hasFact && gOk.hasChain && gOk.hasEcho &&
    gOk.hasProduced && gOk.hasCited && gOk.hasEchoed && gOk.producedOk,
    'v2147: [N2] 原版源码上级联场追溯全绿（三类节点/三类边/produced 在）');
  const dOk = probeClean(probeDeep);
  a(dOk.nodes === 4 && dOk.edges === 3 && dOk.hasA && dOk.hasB && !dOk.hasC && !dOk.hasD,
    'v2147: [N2] 原版源码上深链场剪枝正确（4/3、C/D 剪）');

  // N3 逐锚敏感：depth 破坏只影响深链剪枝、不影响级联 produced；cite 破坏不波及 echoed
  const gDepth = probeWith(BROKEN[0], probeGraph);
  a(gDepth.reason === 'traced' && gDepth.hasProduced,
    'v2147: [N3] depth 破坏不影响级联场（逐锚敏感）');
  a(gCite.hasEchoed !== false || gCite.reason === 'no-edges',
    'v2147: [N3] cite 破坏不直接抹 echoed 边（逐锚敏感）');
  const eOk = probeClean(probeEcho);
  a(eOk.rootEchoed, 'v2147: [N2] 原版源码上 root echoed 边在（probeEcho 自证）');
}

// ══════════════ 入口 ══════════════
function runAll(a) { isolated(function () { judge(a); }); }

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('CAUSAL-TRACE-V2147: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('CAUSAL-TRACE-V2147: pass（' + pass + ' 项）');
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeGraph: probeGraph, probeDeep: probeDeep,
  brokenOverride: brokenOverride
};
