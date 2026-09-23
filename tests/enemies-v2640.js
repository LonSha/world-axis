#!/usr/bin/env node
// WorldAxis tests/enemies-v2640.js —— 敌意面「静默丢弃必须可观测」锁（v2.64.0）
//
// 【它治的病】仇敌录（血仇/恩怨 + 黑盒 + 天下大势）的否定式边界**全部写在丢弃上**：
//   三条入账器的边界一律写作 `if (!e || !e.name) return;`——被丢掉的条目当然不落盘。
//   于是「上游推演输出了一条没有名字的仇敌」这件事在状态里**完全不可见**：
//   面板只能看到「仇敌少了一个」，答不出为什么少，也答不出是**格式坏了**
//   还是**内容不全**（两者的处置完全不同：前者要修上游输出协议，后者要补内容）。
//   这就是静默数据丢失——本锁要钉住的正是「拒绝必须可观测」。
//
// 【它同时治的第二类病】「能入账」这件事本身也没人钉：
//   · 畸形条目**不得落盘**（写进容器就是把脏数据当事实）；
//   · 丢弃与入账必须**成对**报（只报丢弃不报入账，用户会以为入账也坏了）；
//   · 容量治理必须真在（活跃 24 / 终结 20 双口径，与 evict 站点声明同源）——
//     没有它，长局里仇敌无限累积、注入块全量展开；
//   · 注入面必须**只透存在性**：已暴露的隐秘资产报名字就够，
//     未暴露的连名字都不能出现（黑盒保密的全部意义就在这里）。
//
// 【为什么既有锁全都照不到】
//   · tests/run.js 的 `engines/enemies v0.3` 节钉的是**功能在场**（能入账、20 轮后清除、
//     注入块构建）——判据全在「入账成功」一侧；一个把非法条目静默吞掉、
//     一个把两类丢弃合成一个计数的实现，拥有全套函数名并照样通过；
//   · tests/run.js 的 `v2.33.0`/`v1.0.0` 节钉的是**容量数字同源**（24+20=44），
//     钉的是「声明」不是「治理真的发生」；
//   · field-liveness / dead-export 是静态面：它们能发现某导出零引用，
//     但发现不了「某条数据被静默吞掉了」——吞噬发生在运行时，静态面看不见。
//   一句话：既有锁把「仇敌能记下来」钉住了，没人钉「没记下来的那些去哪了」。
//
// 【做法】判据全部跑在**真源码**上：经 tests/ui-gate-sync.js 的 fresh() 装载真 LOAD；
//   入账走引擎真入口（WA.enemies.apply/applyBlackbox/applyWorldTrends）；
//   注入面走 WA.enemies.buildEnemiesBlock()。破坏自证走 opts.srcOverride：
//   真源码在**内存副本**上改坏后重跑同款判据，仓库文件零改写。
//
// 【判据】
//   1 观测面在场上：dropStat 可读、初值为空、applied 四数齐备。
//   2 畸形条目丢弃被归因，且**不落盘**。
//   3 「格式坏了」与「内容不全」**分开计数**（合成一个就答不出是哪种）。
//   4 三类容器的丢弃各归各的原因（行动/资产/大势不得混计）。
//   5 入账与丢弃成对：合法条目入账时 applied 增、dropped 不增。
//   6 lastDropped 记录最后一次丢弃的原因（面板要能显示「上一次为什么没进去」）。
//   7 活跃仇敌超 24 时挤出最旧，且被挤出的不进注入面。
//   8 终结态超 20 时兜底挤出最旧（双口径各自独立）。
//   9 终结超 20 轮后自动清除（生命周期不是永驻）。
//   10 注入面有界展开（≤12 + 余量标注），不得全量展开。
//   11 隐秘资产**只透存在性**：已暴露的报名字、未暴露的连名字都不出现、
//      秘密行动的细节永不进注入面。
//   12 已终结仇敌不进注入面（否则主线会把结了的账当仍在追的）。
//   13 dropStat 只读：调用它不得改动存档（深比较）。
//
// 【负控制】N0 破坏锚点在真源码中各恰中 1 次；N1/N2 两向自证；N3 逐锚敏感；
//   N4 非恒真（丢弃计数确实随输入变化）；N5 无副作用。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__en2640_';
// ── 破坏锚点：**只在真源码里各恰中 1 次**（N0 校验） ──
// 1) 两类丢弃合流：格式坏了与内容不全记成同一个原因 ⇒ 判据 [3] 现形
const A_DROPSHAPE = "        if (!e || typeof e !== 'object' || Array.isArray(e)) { drop('enemy-bad-shape'); return; }\n"
  + "        if (!e.name) { drop('enemy-no-name'); return; }";
// 2) 无名字仇敌**静默**丢弃（不归因）⇒ 判据 [2]/[3] 现形
const A_DROPNAME = "        if (!e.name) { drop('enemy-no-name'); return; }";
// 3) 活跃容量治理失效（上限拉大）⇒ 判据 [7] 现形
const A_MAXACTIVE = "  const MAX_ACTIVE = 24;     // v1.0.0: 活跃仇敌环形容量（与 __BOUNDED_CAPS['evolution.enemies'] 登记同源）";
// 4) 注入面无界展开（全量推出去）⇒ 判据 [10] 现形
const A_SHOW = "        const shown = enemies.slice(0, 12);";
// 5) 入账计数被摘 ⇒ 判据 [5] 现形（只报丢弃不报入账，用户会以为入账也坏了）
const A_APPLIED = "        __enStat.applied.actions++;";
// 6) 首次入账即终结者的终结时间戳被写回 null ⇒ 判据 [9] 现形
//   （本轮实跑抓出的**第三处真缺陷**：null 恒不满足 KEEP 窗口判据，
//     于是这类仇敌的「终结保留 20 轮后清除」永久失效）
const A_TERMROUND = "            terminatedRound: status === '已终结' ? draft.evolution.round : null, createdRound: draft.evolution.round });";
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function enOf(WA) {
  if (!WA.enemies) throw new Error('WA.enemies 未装载（engines/enemies.js 不在 LOAD 清单里？）');
  return WA.enemies;
}
function st(WA) { return WA.store.get() || {}; }
function evo(WA) { return st(WA).evolution || {}; }
function enArr(WA) { return evo(WA).enemies || []; }
function boxOf(WA) { return evo(WA).blackbox || {}; }
function tick() { return new Promise(function (r) { setTimeout(r, 40); }); }
function resetEv(WA, tag) {
  WA.store.transact(function (d) {
    d.evolution = d.evolution || {};
    d.evolution.enemies = [];
    d.evolution.worldTrends = [];
    d.evolution.blackbox = { secretActions: [], secretAssets: [] };
    if (!d.evolution.round) d.evolution.round = 0;
  }, TAG + (tag || 'reset'));
}
// ── 无副作用隔离 ──
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
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k === null) continue;
    let v = '';
    try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
async function isolatedAsync(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return await fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}
// ══════════════ 判据 ══════════════
async function judge(a) {
  const WA = fresh();
  const en = enOf(WA);
  resetEv(WA);
  // ── 1 观测面在场上 ──
  a(typeof en.dropStat === 'function', 'v2640/enemies: [1] 丢弃观测面在场上（dropStat）');
  const d0 = en.dropStat();
  a(d0.dropKinds.length === 0 && Object.keys(d0.dropped).length === 0,
    'v2640/enemies: [1] 未发生丢弃时原因表为空（不预置假原因）');
  a(d0.applied && d0.applied.enemies === 0 && d0.applied.actions === 0 && d0.applied.assets === 0 && d0.applied.trends === 0,
    'v2640/enemies: [1] applied 四数齐备且从零起（丢弃与入账成对才有意义）');
  // ── 2 畸形条目丢弃被归因，且不落盘 ──
  const c0 = enArr(WA).length;
  WA.store.transact(function (d) {
    en.apply(d, [null, 'not-an-object', [1, 2, 3]]);
  }, TAG + 'shape');
  const d1 = en.dropStat();
  a((d1.dropped['enemy-bad-shape'] || 0) === 3,
    'v2640/enemies: [2] 畸形条目（null/字符串/数组）逐条归因（实 ' + JSON.stringify(d1.dropped) + '）');
  a(enArr(WA).length === c0,
    'v2640/enemies: [2] 畸形条目**不落盘**（容器一格不动；写进去就是把脏数据当事实）');
  // ── 3 「格式坏了」与「内容不全」分开计数 ──
  WA.store.transact(function (d) { en.apply(d, [{ reason: '有缘由但没名字' }]); }, TAG + 'noname');
  const d2 = en.dropStat();
  a((d2.dropped['enemy-no-name'] || 0) === 1,
    'v2640/enemies: [3] 「有对象但没名字」归到 no-name（实 ' + JSON.stringify(d2.dropped) + '）');
  a((d2.dropped['enemy-bad-shape'] || 0) === 3,
    'v2640/enemies: [3] 两类丢弃**分开计数**（合成一个就答不出是格式坏了还是内容不全）');
  a(enArr(WA).length === c0, 'v2640/enemies: [3] 无名字仇敌同样不落盘');
  // ── 4 三类容器各归各的原因 ──
  WA.store.transact(function (d) {
    en.applyBlackbox(d, { secretActions: [null, {}], secretAssets: [null, { exposure: 10 }] });
    en.applyWorldTrends(d, [null, {}]);
  }, TAG + 'three');
  const d3 = en.dropStat();
  a((d3.dropped['action-bad-shape'] || 0) === 1 && (d3.dropped['action-no-text'] || 0) === 1,
    'v2640/enemies: [4] 秘密行动：形状坏 / 无文本 分开归因（实 ' + JSON.stringify(d3.dropped) + '）');
  a((d3.dropped['asset-bad-shape'] || 0) === 1 && (d3.dropped['asset-no-name'] || 0) === 1,
    'v2640/enemies: [4] 隐秘资产：形状坏 / 无名字 分开归因');
  a((d3.dropped['trend-bad-shape'] || 0) === 1 && (d3.dropped['trend-no-name'] || 0) === 1,
    'v2640/enemies: [4] 天下大势：形状坏 / 无名字 分开归因');
  a(boxOf(WA).secretActions.length === 0 && boxOf(WA).secretAssets.length === 0 && (evo(WA).worldTrends || []).length === 0,
    'v2640/enemies: [4] 三类容器的畸形条目都不落盘');
  // ── 5 入账与丢弃成对 ──
  const before5 = en.dropStat();
  WA.store.transact(function (d) {
    en.apply(d, [{ name: TAG + '血仇者', type: 'blood', status: '追踪中' }]);
    en.applyBlackbox(d, { secretActions: [{ action: TAG + '夜探' }], secretAssets: [{ name: TAG + '破庙' }] });
    en.applyWorldTrends(d, [{ name: TAG + '大势', description: 'x' }]);
  }, TAG + 'apply');
  const after5 = en.dropStat();
  a(after5.applied.enemies === before5.applied.enemies + 1
    && after5.applied.actions === before5.applied.actions + 1
    && after5.applied.assets === before5.applied.assets + 1
    && after5.applied.trends === before5.applied.trends + 1,
    'v2640/enemies: [5] 合法条目入账时 applied 逐项递增（实 ' + JSON.stringify(after5.applied) + '）');
  a(JSON.stringify(after5.dropped) === JSON.stringify(before5.dropped),
    'v2640/enemies: [5] 合法条目入账**不得**被计入丢弃（两表必须互斥）');
  // ── 6 lastDropped 记录最后一次原因 ──
  a(en.dropStat().lastDropped === 'trend-no-name' || en.dropStat().lastDropped === 'asset-no-name',
    'v2640/enemies: [6] lastDropped 记住最后一次丢弃的原因（实 ' + JSON.stringify(en.dropStat().lastDropped) + '）');
  // ── 7 活跃仇敌容量：挤出最旧，被挤出的不进注入面 ──
  resetEv(WA, 'cap');
  for (let b = 0; b < 5; b++) {
    WA.store.transact(function (d) {
      const arr = [];
      for (let i = 0; i < 6; i++) arr.push({ name: TAG + '活跃' + (b * 6 + i), status: '追踪中' });
      d.evolution.round = b;           // 逐批推进轮次，让 createdRound 有序可判
      en.apply(d, arr);
    }, TAG + 'cap' + b);
  }
  const act = enArr(WA).filter(function (e) { return e && e.status !== '已终结'; });
  a(act.length === en.MAX_ACTIVE,
    'v2640/enemies: [7] 活跃仇敌超容量即被挤出（应有 ' + en.MAX_ACTIVE + ' 个，实 ' + act.length + '）');
  a(!act.some(function (e) { return e.name === TAG + '活跃0'; }),
    'v2640/enemies: [7] 被挤出的是**最早创建者**（活跃0 已不在册）');
  const blk7 = en.buildEnemiesBlock();
  a(blk7.indexOf(TAG + '活跃0') < 0,
    'v2640/enemies: [7] 被挤出的仇敌不得留在注入面（否则主线会追一个已经不在册的人）');
  // ── 8 终结态兜底挤出 ──
  resetEv(WA, 'term');
  for (let b = 0; b < 5; b++) {
    WA.store.transact(function (d) {
      const arr = [];
      for (let i = 0; i < 8; i++) arr.push({ name: TAG + '终结' + (b * 8 + i), status: '已终结' });
      d.evolution.round = 100 + b;
      en.apply(d, arr);
    }, TAG + 'term' + b);
  }
  const term = enArr(WA).filter(function (e) { return e && e.status === '已终结'; });
  a(term.length <= 20,
    'v2640/enemies: [8] 终结态数量兜底（≤20，实 ' + term.length + '——20 轮窗口内海量终结也不得超量）');
  // ── 9 终结超 20 轮后自动清除 ──
  resetEv(WA, 'keep');
  WA.store.transact(function (d) {
    d.evolution.round = 1;
    en.apply(d, [{ name: TAG + '会消失的', status: '已终结' }]);
  }, TAG + 'keep1');
  WA.store.transact(function (d) { d.evolution.round = 5; en.apply(d, []); }, TAG + 'keep5');
  a(enArr(WA).some(function (e) { return e.name === TAG + '会消失的'; }),
    'v2640/enemies: [9] 终结后 4 轮仍在册（窗口内不误删）');
  WA.store.transact(function (d) { d.evolution.round = 30; en.apply(d, []); }, TAG + 'keep30');
  a(!enArr(WA).some(function (e) { return e.name === TAG + '会消失的'; }),
    'v2640/enemies: [9] 终结超 ' + 20 + ' 轮后自动清除（生命周期不是永驻）');
  // ── 10 注入面有界展开 ──
  resetEv(WA, 'show');
  WA.store.transact(function (d) {
    const arr = [];
    for (let i = 0; i < 20; i++) arr.push({ name: TAG + '敌' + i, type: 'grudge', status: '追踪中' });
    d.evolution.enemies = arr.map(function (e, i) { return { id: 'sh' + i, name: e.name, type: e.type, status: e.status, createdRound: i }; });
  }, TAG + 'show');
  const blk10 = en.buildEnemiesBlock();
  const shown10 = (blk10.match(new RegExp(TAG + '敌\\d+', 'g')) || []).length;
  a(shown10 > 0 && shown10 <= 12,
    'v2640/enemies: [10] 注入面有界展开（≤12，实 ' + shown10 + '——不得全量推给模型）');
  a(blk10.indexOf('等' + (20 - shown10) + '个') >= 0,
    'v2640/enemies: [10] 余量被标注（截断必须显式，否则模型以为只有这些）');
  // ── 11 隐秘资产只透存在性 ──
  resetEv(WA, 'box');
  WA.store.transact(function (d) {
    d.evolution.blackbox = {
      secretActions: [{ action: TAG + '暗杀县令' + 'ZZZ', witnesses: '无' }],
      secretAssets: [{ name: TAG + '暴露据点', exposure: 90, status: '暴露' },
        { name: TAG + '未暴露据点', exposure: 5, status: '有效' }]
    };
  }, TAG + 'box');
  const blk11 = en.buildEnemiesBlock();
  a(blk11.indexOf(TAG + '暴露据点') >= 0 && blk11.indexOf(TAG + '未暴露据点') < 0,
    'v2640/enemies: [11] 隐秘资产**只报已暴露者**（未暴露的连名字都不许出现——黑盒保密的全部意义）');
  a(blk11.indexOf('ZZZ') < 0,
    'v2640/enemies: [11] 秘密行动的**细节永不进注入面**（只提示存在性）');
  a(blk11.indexOf('exposure') < 0 && blk11.indexOf('90') < 0,
    'v2640/enemies: [11] 曝光度数值不漏（主线只该知道「有这么个东西」，不该知道它多脆弱）');
  // ── 12 已终结仇敌不进注入面 ──
  resetEv(WA, 'term2');
  WA.store.transact(function (d) {
    d.evolution.enemies = [
      { id: 't1', name: TAG + '还活着的', type: 'blood', status: '追踪中', createdRound: 1 },
      { id: 't2', name: TAG + '已经结了的', type: 'grudge', status: '已终结', createdRound: 1, terminatedRound: 1 }
    ];
  }, TAG + 'term2');
  const blk12 = en.buildEnemiesBlock();
  a(blk12.indexOf(TAG + '还活着的') >= 0 && blk12.indexOf(TAG + '已经结了的') < 0,
    'v2640/enemies: [12] 已终结仇敌不进注入面（否则主线会把结了的账当仍在追的）');
  // ── 13 dropStat 只读 ──
  const snap13 = JSON.stringify(st(WA));
  en.dropStat();
  a(JSON.stringify(st(WA)) === snap13, 'v2640/enemies: [13] dropStat 只读（调用它不改动存档）');

  console.log('  ✓ v2640/enemies: 敌意面（静默丢弃可观测 / 格式与内容分开 / 容量真有界 / 存在性不透细节）');
}
// ══════════════ 破坏探针 ══════════════
/** 丢弃归因：推一条畸形 + 一条无名字，看两表的差 */
function probeDrop(WA) {
  const en = enOf(WA);
  resetEv(WA, 'pd');
  const b = en.dropStat();
  const c0 = enArr(WA).length;
  WA.store.transact(function (d) {
    en.apply(d, [null, { reason: '没名字' }]);
  }, TAG + 'pd');
  const af = en.dropStat();
  return {
    shape: (af.dropped['enemy-bad-shape'] || 0) - (b.dropped['enemy-bad-shape'] || 0),
    name: (af.dropped['enemy-no-name'] || 0) - (b.dropped['enemy-no-name'] || 0),
    kinds: af.dropKinds.length,
    landed: enArr(WA).length - c0
  };
}
/** 容量治理：推 30 个活跃，看留下多少 */
function probeCap(WA) {
  const en = enOf(WA);
  resetEv(WA, 'pc');
  for (let b = 0; b < 5; b++) {
    WA.store.transact(function (d) {
      const arr = [];
      for (let i = 0; i < 6; i++) arr.push({ name: TAG + 'C' + (b * 6 + i), status: '追踪中' });
      d.evolution.round = b;
      en.apply(d, arr);
    }, TAG + 'pc' + b);
  }
  return { active: enArr(WA).filter(function (e) { return e && e.status !== '已终结'; }).length };
}
/** 注入面展开量：推 20 个活跃，数块里出现几个 */
function probeShow(WA) {
  const en = enOf(WA);
  resetEv(WA, 'ps');
  WA.store.transact(function (d) {
    const arr = [];
    for (let i = 0; i < 20; i++) arr.push({ id: 'ps' + i, name: TAG + 'S' + i, type: 'grudge', status: '追踪中', createdRound: i });
    d.evolution.enemies = arr;
  }, TAG + 'ps');
  const blk = en.buildEnemiesBlock();
  return { shown: (blk.match(new RegExp(TAG + 'S\\d+', 'g')) || []).length };
}
/** 入账与丢弃成对：入账一条合法行动，看 applied 与 dropped 的两向 */
function probeApplied(WA) {
  const en = enOf(WA);
  resetEv(WA, 'pa');
  const b = en.dropStat();
  WA.store.transact(function (d) { en.applyBlackbox(d, { secretActions: [{ action: 'PA' }] }); }, TAG + 'pa');
  const af = en.dropStat();
  return { up: af.applied.actions - b.applied.actions, dropUp: Object.keys(af.dropped).length - Object.keys(b.dropped).length };
}
/** 首次入账即终结者：终结窗口是否真的起算（本轮抓出的第三处真缺陷的反向自证） */
function probeTermKeep(WA) {
  const en = enOf(WA);
  resetEv(WA, 'ptk');
  WA.store.transact(function (d) {
    d.evolution.round = 1;
    en.apply(d, [{ name: TAG + '入职即终结', status: '已终结' }]);
  }, TAG + 'ptk1');
  const stamped = (enArr(WA)[0] || {}).terminatedRound;
  WA.store.transact(function (d) { d.evolution.round = 30; en.apply(d, []); }, TAG + 'ptk30');
  return { stamped: stamped, alive: enArr(WA).some(function (e) { return e.name === TAG + '入职即终结'; }) };
}
const BROKEN = [
  { key: 'merge', rel: 'engines/enemies.js', from: A_DROPSHAPE,
    to: "        if (!e || typeof e !== 'object' || Array.isArray(e)) { drop('enemy-no-name'); return; }\n"
      + "        if (!e.name) { drop('enemy-no-name'); return; }" },
  { key: 'silent', rel: 'engines/enemies.js', from: A_DROPNAME,
    to: "        if (!e.name) return;" },
  { key: 'cap', rel: 'engines/enemies.js', from: A_MAXACTIVE,
    to: "  const MAX_ACTIVE = 999;" },
  { key: 'show', rel: 'engines/enemies.js', from: A_SHOW,
    to: "        const shown = enemies.slice();" },
  { key: 'applied', rel: 'engines/enemies.js', from: A_APPLIED,
    to: "        void 0;" },
  { key: 'termround', rel: 'engines/enemies.js', from: A_TERMROUND,
    to: "            terminatedRound: null, createdRound: draft.evolution.round });" }
];
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点应恰中 1 次，实 ' + hits + ' 次：' + spec.rel + ' :: ' + spec.from);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function probeWith(spec, fn) {
  return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); });
}
function probeClean(fn) { return isolated(function () { return fn(fresh()); }); }
function anchorHits(spec) {
  return fs.readFileSync(path.join(BASE, spec.rel), 'utf8').split(spec.from).length - 1;
}
// ══════════════ 负控制 ══════════════
async function runNegative(a) {
  const anchorBad = BROKEN.filter(function (p) { return anchorHits(p) !== 1; })
    .map(function (p) { return p.key + '(' + anchorHits(p) + '次)'; });
  a(anchorBad.length === 0, 'v2640/enemies: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');
  const diffOk = BROKEN.every(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.rel), 'utf8');
    return brokenOverride(p)[p.rel] !== src;
  });
  a(diffOk, 'v2640/enemies: [N0] 五种破坏的内存副本都与真源码不同（非空转）');
  // N1 判据现形
  const mBad = probeWith(BROKEN[0], probeDrop);
  a(mBad.shape === 0 && mBad.name >= 2,
    'v2640/enemies: [N1] 两类丢弃合流 ⇒ 「分开计数」判据现形（' + JSON.stringify(mBad) + '）');
  const sBad = probeWith(BROKEN[1], probeDrop);
  a(sBad.name === 0,
    'v2640/enemies: [N1] 无名字被静默吞掉 ⇒ 「丢弃必须可观测」判据现形（' + JSON.stringify(sBad) + '）');
  const cBad = probeWith(BROKEN[2], probeCap);
  a(cBad.active === 30,
    'v2640/enemies: [N1] 活跃容量治理被拆 ⇒ 「超容量即挤出」判据现形（实 ' + cBad.active + '）');
  const wBad = probeWith(BROKEN[3], probeShow);
  a(wBad.shown === 20,
    'v2640/enemies: [N1] 注入面无界展开 ⇒ 「有界展开」判据现形（实 ' + wBad.shown + '）');
  const aBad = probeWith(BROKEN[4], probeApplied);
  a(aBad.up === 0,
    'v2640/enemies: [N1] 入账计数被摘 ⇒ 「入账与丢弃成对」判据现形（' + JSON.stringify(aBad) + '）');
  const tBad = probeWith(BROKEN[5], probeTermKeep);
  a(tBad.stamped == null && tBad.alive === true,
    'v2640/enemies: [N1] 终结时间戳被写回 null ⇒ 「终结窗口起算」判据现形（' + JSON.stringify(tBad) + '）');
  // N2 原版全绿
  const mOk = probeClean(probeDrop);
  a(mOk.shape === 1 && mOk.name === 1 && mOk.landed === 0,
    'v2640/enemies: [N2] 原版：两类丢弃各记 1 且都不落盘（' + JSON.stringify(mOk) + '）');
  const cOk = probeClean(probeCap);
  a(cOk.active === 24, 'v2640/enemies: [N2] 原版：活跃仇敌被夹到 24（实 ' + cOk.active + '）');
  const wOk = probeClean(probeShow);
  a(wOk.shown === 12, 'v2640/enemies: [N2] 原版：注入面只展开 12 个（实 ' + wOk.shown + '）');
  const aOk = probeClean(probeApplied);
  a(aOk.up === 1, 'v2640/enemies: [N2] 原版：入账计数确实递增（实 ' + JSON.stringify(aOk) + '）');
  const tOk = probeClean(probeTermKeep);
  a(tOk.stamped === 1 && tOk.alive === false,
    'v2640/enemies: [N2] 原版：首次入账即终结者也从当轮起算终结窗口（' + JSON.stringify(tOk) + '）');
  // N3 逐锚敏感
  a(probeWith(BROKEN[0], probeCap).active === 24, 'v2640/enemies: [N3] 合流破坏不牵连容量治理（逐锚敏感）');
  a(probeWith(BROKEN[1], probeShow).shown === 12, 'v2640/enemies: [N3] 静默破坏不牵连注入面展开（逐锚敏感）');
  a(probeWith(BROKEN[2], probeDrop).shape === 1, 'v2640/enemies: [N3] 容量破坏不牵连丢弃归因（逐锚敏感）');
  a(probeWith(BROKEN[3], probeCap).active === 24, 'v2640/enemies: [N3] 展开破坏不牵连容量治理（逐锚敏感）');
  a(probeWith(BROKEN[4], probeCap).active === 24, 'v2640/enemies: [N3] 计数破坏不牵连容量治理（逐锚敏感）');
  a(probeWith(BROKEN[5], probeDrop).name === 1, 'v2640/enemies: [N3] 终结戳破坏不牵连丢弃归因（逐锚敏感）');
  // N4 非恒真：丢弃计数确实随输入变化（不是恒零也不是常量）
  const chg = isolated(function () {
    const WA = fresh();
    const en = enOf(WA);
    resetEv(WA, 'chg');
    const k0 = en.dropStat().dropKinds.length;
    WA.store.transact(function (d) { en.apply(d, [{ name: TAG + 'ok' }]); }, TAG + 'chg1');
    const k1 = en.dropStat().dropKinds.length;
    WA.store.transact(function (d) { en.apply(d, [null]); }, TAG + 'chg2');
    const k2 = en.dropStat().dropKinds.length;
    return { k0: k0, k1: k1, k2: k2 };
  });
  a(chg.k0 === 0 && chg.k1 === 0 && chg.k2 === 1,
    'v2640/enemies: [N4] 原因表确实随输入变化：合法入账不长原因、畸形条目长出一个（实 ' + JSON.stringify(chg) + '）');
  // N5 无副作用
  //   为什么先等两拍：store 的落盘是**异步**的（transact 之后排队写盘）。
  //   探测里写入的哨兵虽被 restoreLS 从磁盘摘掉，但队列里可能还压着一次落盘，
  //   它随后会把「含哨兵的内存态」写回磁盘——那不是泄漏，是**时序**。
  //   等挂起任务跑完再断言，判据才在测「有没有人真写了哨兵」而不是「谁跑得快」。
  await tick();
  await tick();
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2640/enemies: [N5] 探测哨兵不泄漏进真存档（残留键: ' + (leak.join(',') || '无') + '）');
}
// ══════════════ 入口 ══════════════
async function runAll(a) { await isolatedAsync(async function () { await judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  (async function () {
    try { await runAll(a); await runNegative(a); }
    catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
    if (fail) { console.log('ENEMIES-V2640: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
    console.log('ENEMIES-V2640: pass（' + pass + ' 项）');
  })();
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeDrop: probeDrop, probeCap: probeCap, probeShow: probeShow, probeApplied: probeApplied,
  brokenOverride: brokenOverride
};
