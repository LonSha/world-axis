#!/usr/bin/env node
// WorldAxis tests/rumor-e3-v2115.js -- E3 lock: 目击知识不得被链层连坐（v2.115.0）
//
// 规划 01 的 E3 缺陷（修复前实测）：
//   visibleTo(person) 此前拿**链的当前层**做前置门（`if (!c || PUBLIC_LAYERS.indexOf(c.layer) < 0) return;`）
//   —— 一条链只要被转述过一次（链层落到 hearsay），连「乙亲眼见过、停在目击层」的那一跳也被
//   一并挡掉：乙的可见面从 1 条变 0 条。链的当前层回答的是「这条链现在传到哪一层了」，与
//   「这个人自己看到过什么」**不是同一个问题**（本仓反复治理的「两态不可分」）。
//   同源第二处：命中多跳时此前直接取数组**最后一个**、未判层 —— 某人的末跳若停在流言层，
//   就答出三层之外的东西（把不该给玩家看的层漏出去）。
//
// 本锁守三条判据（每条都两向自证：真源码成绿 / 就地破坏现形）：
//   ① **目击不被连坐**：链层升到 hearsay 后，目击者仍看得到自己亲眼见过的那条；
//   ② **只答公开层**：可见行一律落在 PUBLIC_LAYERS 内（末跳停在私层不得漏出）；
//   ③ **观测不改被观测对象**：visibleTo 是纯读，链层与 stat 一字不动。
// 锚点逐字取自 engines/rumor.js 且要求恰 1 次（N0）；破坏只改内存副本，零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__e3v2115_';
const REL = 'engines/rumor.js';
const PLAIN = '甲', EYE = '乙', FAR = '丙';
// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
// ① 破坏「跳级过滤」：把链层当门判（退回 E3 缺陷 —— 转述过的链连目击者一起失明）
const A_HOP = "return h && (h.from === who || h.to === who) && PUBLIC_LAYERS.indexOf(h.layer) >= 0;";
// ② 破坏「先筛层再取末条」：先取末条、再看层（末跳停在私层时整条答出去）
const A_LAST = "const last = seen[seen.length - 1];";
const BROKEN = [
  { key: 'chain', from: A_HOP, to: "return !!c && PUBLIC_LAYERS.indexOf(c.layer) >= 0;" },
  { key: 'tail', from: A_LAST,
    to: "const last = (function () { const m = hops.filter(function (h) { return h && (h.from === who || h.to === who); }); return m.length ? m[m.length - 1] : seen[seen.length - 1]; })();" }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  ov.__origSrc = src;
  return ov;
}
function anchorHits(spec) { return fs.readFileSync(path.join(BASE, REL), 'utf8').split(spec.from).length - 1; }
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw:' + (e && e.message); } }; }
function probeWith(spec, fn) { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }
function probeClean(fn) { return guarded(fn)(fresh()); }
// ── 造场景 ──
function seed(WA) {
  WA.rumor.setSettings({ enabled: true, maxChains: 8, maxHops: 6, maxSuppressed: 4 });
  WA.store.init();
  WA.store.transact(function (d) {
    d.worldFacts = [{ id: 'wf_1', key: 'f1', value: '仓库失火', scope: 'world', source: 'engine', at: 0 }];
    d.memory = (d.memory && typeof d.memory === 'object') ? d.memory : {};
    d.memory.facts = [];
    d.rumor = { chains: [] };
  }, TAG + 'seed');
}
// 甲目击 → 乙（witness 跳）；乙转述给丙（hearsay 跳）⇒ 链层落到 hearsay
function chain3(WA) {
  WA.rumor.startChain('f1', '火');
  WA.rumor.relay('rm_f1', { from: PLAIN, to: EYE, layer: 'witness' });
  WA.rumor.relay('rm_f1', { from: EYE, to: FAR, layer: 'hearsay' });
}
// ── 探针（返回症状值，便于两向对照）──
// P1 连坐：链层升到 hearsay 后，目击者是否还看得见（原版 'clear'；链级门 'blinded'）
//    用**甲**做被试：甲在链上只有一条跳（甲→乙，witness），故本探针与「取末条」无关。
function probeWitness(WA) {
  seed(WA); chain3(WA);
  const inv = WA.rumor.investigate('rm_f1');
  const vt = WA.rumor.visibleTo(PLAIN);
  return (inv.layer === 'hearsay' && vt.count === 1 && vt.rows[0].layer === 'witness') ? 'clear' : 'blinded';
}
// P2 漏层：可见行里是否混进私层（原版 'public-only'；取末条不判层 'leaked'）
//    用**乙**做被试：乙在链上两跳，末跳是乙→丙（hearsay）。
function probeTail(WA) {
  seed(WA); chain3(WA);
  const vt = WA.rumor.visibleTo(EYE);
  const bad = vt.rows.filter(function (r) { return WA.rumor.PUBLIC_LAYERS.indexOf(r.layer) < 0; });
  return bad.length ? 'leaked' : 'public-only';
}
// P3 纯读：visibleTo 不得改动被观测对象
function probePure(WA) {
  seed(WA); chain3(WA);
  const s0 = JSON.stringify(WA.rumor.stat());
  const l0 = WA.rumor.investigate('rm_f1').layer;
  const f0 = JSON.stringify(WA.store.get().rumor);
  WA.rumor.visibleTo(PLAIN); WA.rumor.visibleTo(EYE); WA.rumor.visibleTo(FAR);
  const same = JSON.stringify(WA.rumor.stat()) === s0
    && WA.rumor.investigate('rm_f1').layer === l0
    && JSON.stringify(WA.store.get().rumor) === f0;
  return (same && l0 === 'hearsay') ? 'pure' : 'impure';
}
function judge(a) {
  const WA = fresh();
  seed(WA); chain3(WA);
  a(WA.rumor.investigate('rm_f1').layer === 'hearsay',
    'v2115/e3: 前置 —— 链层已升到 hearsay（不然本锁测的是另一件事）');
  const vtY = WA.rumor.visibleTo(EYE);
  a(vtY.count === 1, 'v2115/e3: [1] 乙仍看得到自己目击过的那件事（实 count=' + vtY.count + '）');
  a((vtY.rows[0] || {}).layer === 'witness', 'v2115/e3: [1] 乙的可见行停在 witness 层（实 ' + ((vtY.rows[0] || {}).layer || '无') + '）');
  const vtJ = WA.rumor.visibleTo(PLAIN);
  a(vtJ.count === 1 && (vtJ.rows[0] || {}).layer === 'witness',
    'v2115/e3: [1] 甲同样可见（目击者不因链被转述而失明，实 count=' + vtJ.count + '）');
  const vtB = WA.rumor.visibleTo(FAR);
  a(vtB.count === 0, 'v2115/e3: [2] 丙不可见（他的那一跳是 hearsay，不过玩家面，实 count=' + vtB.count + '）');
  const allRows = [vtY, vtJ, vtB].reduce(function (acc, v) { return acc.concat(v.rows); }, []);
  a(allRows.length > 0 && allRows.every(function (x) { return WA.rumor.PUBLIC_LAYERS.indexOf(x.layer) >= 0; }),
    'v2115/e3: [2] 所有可见行一律在 PUBLIC_LAYERS 内（实 ' + JSON.stringify(allRows.map(function (x) { return x.layer; })) + '）');
  // 缺人名仍如实报错（不是抛，也不是空答案）
  a(WA.rumor.visibleTo('').reason === 'missing-fields', 'v2115/e3: [3] 缺人名仍报 missing-fields');
  // 链层本身未被观测改掉 —— 「链的当前层」是这条链的事实，不是可见面的副产物
  a(WA.rumor.investigate('rm_f1').layer === 'hearsay', 'v2115/e3: [3] 观测未把链层抬高或压低');
  a(probeClean(probePure) === 'pure', 'v2115/e3: [3] visibleTo 连读三次后 stat / rumor 存储一字不动');
  // 源码面：visibleTo 里不得再有「拿链层当门」的写法（防回归到缺陷口径）
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const i0 = src.indexOf('function visibleTo'), i1 = src.indexOf('function fullView');
  a(i0 > 0 && i1 > i0, 'v2115/e3: [3] 源码面切段可辨（visibleTo → fullView 之间）');
  const seg = src.slice(i0, i1);
  a(seg.indexOf('PUBLIC_LAYERS.indexOf(c.layer)') < 0,
    'v2115/e3: [3] visibleTo 不再拿链层做前置门（源码面，实 ' + (seg.indexOf('PUBLIC_LAYERS.indexOf(c.layer)') < 0 ? '无' : '有') + '）');
  a(seg.indexOf('hops.filter') > 0, 'v2115/e3: [3] 可见面改由跳级过滤得出（源码面）');
  // 哨兵：本锁不得把 TAG 留在存档里
  let leak = 0;
  for (let i = 0; i < global.localStorage.length; i++) {
    const k = global.localStorage.key(i);
    if (k && String(global.localStorage.getItem(k)).indexOf(TAG) >= 0) leak++;
  }
  a(leak === 0, 'v2115/e3: [4] 哨兵未泄漏（' + leak + '）');
}
function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2115/e3: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  // N1 破坏现形
  a(probeWith(BROKEN[B.chain], probeWitness) === 'blinded',
    'v2115/e3: [N1] 退回链级前置门 ⇒ 转述过的链把目击者一起弄瞎（E3 缺陷复现）');
  a(probeWith(BROKEN[B.tail], probeTail) === 'leaked',
    'v2115/e3: [N1] 先取末条再判层 ⇒ 末跳停在私层时整条答出去（E3 同源第二处）');
  // N2 真源码成绿
  a(probeClean(probeWitness) === 'clear', 'v2115/e3: [N2] 原版：链层 hearsay 后目击者仍可见');
  a(probeClean(probeTail) === 'public-only', 'v2115/e3: [N2] 原版：可见行只出公开层');
  // N3 隔离：破坏某一锚点不影响另一判据（两个探针的被试刻意分开：甲 / 乙）
  a(probeWith(BROKEN[B.tail], probeWitness) === 'clear', 'v2115/e3: [N3] 取末条破坏不影响「目击不被连坐」');
  a(probeWith(BROKEN[B.chain], probeTail) === 'public-only', 'v2115/e3: [N3] 链级门破坏不影响「只答公开层」');
  // N4 判据非恒真：可见面真的随世界状态变化
  const chg = (function () {
    const WA = fresh();
    WA.rumor.setSettings({ enabled: true, maxChains: 8, maxHops: 6, maxSuppressed: 4 });
    WA.store.init();
    WA.store.transact(function (d) {
      d.worldFacts = [{ id: 'wf_1', key: 'f1', value: 'V', scope: 'world', source: 'engine', at: 0 }];
      d.rumor = { chains: [] };
    }, TAG + 'n4');
    WA.rumor.startChain('f1', '火');
    const before = WA.rumor.visibleTo(EYE).count;
    WA.rumor.relay('rm_f1', { from: PLAIN, to: EYE, layer: 'witness' });
    const after = WA.rumor.visibleTo(EYE).count;
    return before + '>' + after;
  })();
  a(chg === '0>1', 'v2115/e3: [N4] 目击跳落地前 0 条、落地后 1 条（判据非恒真，实 ' + chg + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('RUMOR-E3-V2115: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('RUMOR-E3-V2115: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };
