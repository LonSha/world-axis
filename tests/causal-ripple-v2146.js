#!/usr/bin/env node
// WorldAxis tests/causal-ripple-v2146.js —— F2 后果涟漪网 + W3 多结局分支预演锁（v2.146.0）
//
// 【它治的病】因果结算（v2.62.0）让「一件事做完，它的后果落成事实」；
//   但「后果的**后果**」——一条链的已结算后果被另一条链当成原因——全库零回答：
//   `consequence-web` / `ripple` / `secondOrder` 零命中（F2），`endings` / `endingTree` 零命中（W3）。
//   于是一个把级联边漏记、把「被引用的源链」degree 打成 NaN、把「恒可取消」从结局词表里抹掉的实现，
//   与正确实现一样能过所有存在面判据（有 rippleWeb 吗 / 有 endingsTree 吗）。
//
// 【与既有锁的正交面】
//   · causal-v2620 钉「单链的阶段格与终态归因」，只问一条链自己怎么走完；
//   · 本锁钉「**链与链之间**的级联」与「**当前状态的可达结局集合**」——两个推导面（只读、零副作用）。
//
// 【做法】判据全部跑在真源码上（gate.fresh 装载真 LOAD），只借宿主桩。
//   破坏自证走 opts.srcOverride：把真源码在内存副本上改坏后重跑同款探针，一个字节都不改仓库文件。
//
// 【正向判据】
//   1  级联场（A 延迟结算 ⇒ 回声 ⇒ B 以回声为原因）：rippleWeb 报 1 条二阶边 / depth=2；
//      被引用的源链 A 的 degree=2，未被引用的 B 的 degree=1；endpoints（degree 1 的链）恰为 1。
//   2  边的三元组 {from,to,via} 正确：from=A、to=B、via=回声 id。
//   3  无级联时如实 `no-ripple`（edges=0 / depth=0），**不编造网**。
//   4  endingsTree：在途链的可达终态集合「恒含 cancelled」；未行动且原因还在 ⇒ blocked。
//   5  已行动链 ⇒ settled 加入可达集。
//   6  disabled 闸：两口同返 { ok:false, reason:'disabled' }，rippleDiscipline 空串。
//   7  rippleDiscipline：有级联边时输出计数句（含条数），**不列链名/后果名**（零 token）。
//
// 【负控制】N0 三个破坏锚点在真源码中各恰中 1 次；N1 破坏后对应判据现形；
//   N2 原版源码上同款探针全绿（两向自证）；N3 逐锚敏感（三种破坏各只触发对应面）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');                     // 宿主桩：localStorage / SillyTavern
const LS = global.localStorage;

const TAG = '__rp2146_';                  // 哨兵前缀

// ── 三个破坏锚点：**只在真源码里各出现一次**（N0 校验），与功能同锚防裸共用 ──
const A_BYID   = 'byId[x.id] = node;';                                   // N1 degree 打点（复活 byId=x 的原 bug）
const A_LINKED = 'const linked = (x.delayed || []).some(function (d) {'; // N2 级联边判定
const A_REACH  = "const reach = ['cancelled'];";                         // N3 「恒可取消」词表

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function causalOf(WA) {
  if (!WA.causal) throw new Error('WA.causal 未装载（engines/causal.js 不在 LOAD 清单里？）');
  return WA.causal;
}
function st(WA) { return WA.store.get() || {}; }
function chains(WA) { return (st(WA).causal || {}).chains || []; }
function chainById(WA, id) {
  return chains(WA).filter(function (x) { return x && x.id === id; })[0] || null;
}
function seedFact(WA, key, value) {
  WA.store.transact(function (d) {
    d.worldFacts = (d.worldFacts || []).concat([{ id: key, key: key, value: value, scope: 'world', source: TAG.slice(0, -1), at: 1 }]);
  }, TAG + 'seed');
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

// ══════════════ 造场：A 延迟结算 ⇒ 回声 ⇒ B 以回声为原因 ══════════════
function buildCascade(WA) {
  const c = causalOf(WA); c.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.causal = { chains: [], settled: [] };
    d.worldFacts = (d.worldFacts || []).filter(function (w) { return !(w && String(w.key || '').indexOf(TAG) === 0); });
  }, TAG + 'reset');
  seedFact(WA, TAG + 'F', 'v');
  const A = c.addChain({ cause: TAG + 'F', action: '关门', delayed: [{ text: '灯灭了', after: 0 }] });
  c.tick({}); c.tick({});
  const rowA = chainById(WA, A.id);
  const did = rowA.delayed[0].id;
  c.settle(A.id, did, '灯确实灭了');
  const echoId = 'ec_' + did;
  const B = c.addChain({ cause: echoId, action: '回去查看' });
  return { c: c, A: A, B: B, echoId: echoId };
}

// ── 探针（供 N1/N2 两向复用）──
/** 级联网签名：边数 / 深度 / 源链 degree / 终点数 / reason */
function probeWeb(WA) {
  const b = buildCascade(WA);
  const r = b.c.rippleWeb();
  const nodeA = r.nodes.filter(function (n) { return n.id === b.A.id; })[0] || {};
  const nodeB = r.nodes.filter(function (n) { return n.id === b.B.id; })[0] || {};
  return { edges: r.edges.length, depth: r.depth, reason: r.reason,
    degA: nodeA.degree, degB: nodeB.degree, endpoints: r.endpoints,
    from: r.edges[0] && r.edges[0].from, to: r.edges[0] && r.edges[0].to, via: r.edges[0] && r.edges[0].via };
}
/** 结局树签名：在途链 B 的可达集合 + blocked 标记 */
function probeTree(WA) {
  const b = buildCascade(WA);
  const e = b.c.endingsTree();
  const leafB = e.leaves.filter(function (L) { return L.id === b.B.id; })[0] || { reachable: [], blocked: false };
  return { roots: e.roots, blocked: e.blocked, reach: leafB.reachable.slice(), bBlocked: leafB.blocked };
}

// ══════════════ 正向判据 ══════════════
function judge(a) {
  const WA = fresh();
  const c = causalOf(WA);

  // ── 1 级联网：1 条二阶边 / depth=2 / 源链 degree=2 ──
  const w = probeWeb(WA);
  a(w.edges === 1 && w.depth === 2 && w.reason === 'ripple',
    'v2146: [1] 级联场 ⇒ 1 条二阶边且 depth=2（实 edges=' + w.edges + ' depth=' + w.depth + ' reason=' + w.reason + '）');
  a(w.degA === 2 && w.degB === 1,
    'v2146: [1b] 被引用的源链 degree=2、未引用链 degree=1（实 degA=' + w.degA + ' degB=' + w.degB + '）');
  a(w.endpoints === 1, 'v2146: [1c] endpoints（degree 1 的链）恰为 1（实 ' + w.endpoints + '）');

  // ── 2 边三元组正确 ──
  a(w.from !== w.to && w.via && String(w.via).indexOf('ec_') === 0,
    'v2146: [2] 边三元组 {from≠to, via=回声 id}（实 via=' + String(w.via).slice(0, 14) + '…）');

  // ── 3 无级联时如实 no-ripple，不编造网 ──
  isolated(function () {
    const W2 = fresh(); const c2 = causalOf(W2); c2.setSettings({ enabled: true });
    // 防「fresh 从防抖落盘快照恢复到 A/B 链」：先清零因果域再造孤立场
    W2.store.transact(function (d) { d.causal = { chains: [], settled: [] }; d.worldFacts = []; }, TAG + 'reset2');
    seedFact(W2, TAG + 'X', 'v');
    c2.addChain({ cause: TAG + 'X', action: '孤立行动' });
    const r2 = c2.rippleWeb();
    a(r2.edges.length === 0 && r2.depth === 0 && r2.reason === 'no-ripple',
      'v2146: [3] 无级联时如实 no-ripple（实 reason=' + r2.reason + ' depth=' + r2.depth + '）');
    a(c2.buildBlock().indexOf('[后果涟漪]') < 0,
      'v2146: [3b] 无级联时 buildBlock 不含涟漪纪律段');
  });

  // ── 4 结局树：在途链恒含 cancelled、blocked 标记正确 ──
  const t = probeTree(WA);
  a(t.reach.indexOf('cancelled') >= 0,
    'v2146: [4] 在途链可达集合恒含 cancelled（实 ' + JSON.stringify(t.reach) + '）');
  a(t.bBlocked === true && t.blocked >= 1,
    'v2146: [4b] 未行动且原因还在 ⇒ blocked（实 bBlocked=' + t.bBlocked + ' blocked=' + t.blocked + '）');

  // ── 5 已行动链 ⇒ settled 加入可达集 ──
  isolated(function () {
    const W3 = fresh(); const c3 = causalOf(W3); c3.setSettings({ enabled: true });
    W3.store.transact(function (d) { d.causal = { chains: [], settled: [] }; }, TAG + 'reset3');
    seedFact(W3, TAG + 'Y', 'v');
    c3.addChain({ cause: TAG + 'Y', action: '行动' });
    c3.tick({}); // open → acted
    const e3 = c3.endingsTree();
    const okSettled = e3.leaves.length > 0 && e3.leaves.every(function (L) { return L.reachable.indexOf('settled') >= 0; });
    a(okSettled, 'v2146: [5] 已行动链 ⇒ settled 加入可达集（实 ' + JSON.stringify(e3.leaves.map(function (L) { return L.reachable; })) + '）');
  });

  // ── 6 disabled 闸 ──
  isolated(function () {
    const W4 = fresh(); const c4 = causalOf(W4); c4.setSettings({ enabled: false });
    const rd = c4.rippleWeb(), ed = c4.endingsTree();
    a(rd.ok === false && rd.reason === 'disabled' && ed.ok === false && ed.reason === 'disabled',
      'v2146: [6] disabled ⇒ 两口同返 ok:false/disabled（实 ripple=' + rd.reason + ' endings=' + ed.reason + '）');
    a(c4.buildBlock() === '', 'v2146: [6b] disabled ⇒ buildBlock 空（不注入）');
  });

  // ── 7 buildBlock 注入涟漪纪律段（计数句 + 零链名）──
  isolated(function () {
    const b = buildCascade(fresh());
    const blk = b.c.buildBlock();
    a(/已有 1 条后果级联边/.test(blk) && /深度 2/.test(blk),
      'v2146: [7] buildBlock 注入涟漪纪律段计数句（实 …' + JSON.stringify(blk.slice(-40)) + '）');
    const seg = blk.slice(blk.indexOf('[后果涟漪]'));
    a(seg.indexOf('关门') < 0 && seg.indexOf('回去查看') < 0 && seg.indexOf('灯灭') < 0,
      'v2146: [7b] 涟漪纪律段零链名/后果名（不泄剧情，零 token）');
  });
}

// ══════════════ 破坏探针 ══════════════
const BROKEN = [
  { key: 'byid',   rel: 'engines/causal.js', from: A_BYID,   to: 'byId[x.id] = x;' },
  { key: 'linked', rel: 'engines/causal.js', from: A_LINKED, to: 'const linked = false && (x.delayed || []).some(function (d) {' },
  { key: 'reach',  rel: 'engines/causal.js', from: A_REACH,  to: 'const reach = [];' }
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
  a(bad.length === 0, 'v2146: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (bad.join(',') || '无') + '）');

  // N0b 破坏副本确实生成且与真源码不同（否则「两向自证」是空转）
  const src = fs.readFileSync(path.join(BASE, 'engines/causal.js'), 'utf8');
  const diffOk = BROKEN.every(function (spec) { return brokenOverride(spec)[spec.rel] !== src; });
  a(diffOk, 'v2146: [N0b] 三种破坏的内存副本都与真源码不同（非空转）');

  // N1 破坏后对应判据现形
  const wByid = probeWith(BROKEN[0], probeWeb);
  a(wByid.degA !== 2, 'v2146: [N1] byId 打点被破坏 ⇒ 「源链 degree=2」判据现形（实 degA=' + wByid.degA + '）');
  const wLinked = probeWith(BROKEN[1], probeWeb);
  a(wLinked.edges === 0, 'v2146: [N1] 级联边判定被破坏 ⇒ 「1 条二阶边」判据现形（实 edges=' + wLinked.edges + '）');
  const tReach = probeWith(BROKEN[2], probeTree);
  a(tReach.reach.indexOf('cancelled') < 0, 'v2146: [N1] cancelled 词表被破坏 ⇒ 「恒含 cancelled」判据现形（实 ' + JSON.stringify(tReach.reach) + '）');

  // N2 两向自证：原版源码上同款探针全绿
  const wOk = probeClean(probeWeb);
  a(wOk.edges === 1 && wOk.degA === 2, 'v2146: [N2] 原版源码上级联网正常（edges=1/degA=2）');
  const tOk = probeClean(probeTree);
  a(tOk.reach.indexOf('cancelled') >= 0, 'v2146: [N2] 原版源码上结局树恒含 cancelled');

  // N3 逐锚敏感：byid 破坏只影响 degree、不影响 edges；linked 破坏只影响 edges
  a(wByid.edges === 1, 'v2146: [N3] byid 破坏不影响 edges（逐锚敏感）');
  a(wLinked.degA !== 2 || wLinked.edges === 0, 'v2146: [N3] linked 破坏让 edges 归零（逐锚敏感）');
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
  if (fail) { console.log('CAUSAL-RIPPLE-V2146: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('CAUSAL-RIPPLE-V2146: pass（' + pass + ' 项）');
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeWeb: probeWeb, probeTree: probeTree,
  brokenOverride: brokenOverride
};
