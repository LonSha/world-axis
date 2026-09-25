#!/usr/bin/env node
// WorldAxis tests/causal-view-v2870.js —— v2.87.0（B6 因果观测面：当前状态与累计分列）
//
// 【它治的病：读「这条链现在怎么了」，读到的却是「这一轮开着过程中发生过几次」】
//   engines/causal.js 的 stat 是一个**进程内累计计数器**（chains/acts/cancelled…），
//   自模块装载起累加，刷新页面即归零。而「存档里现在有几条、各处于什么状态」
//   此前只能逐条调 classify()——没有一个出口直接回答「当前状态」。
//   tool-diag 与 ui/panel 读到的 causal.stat() 因此是**累计**，不是**当前**：
//   两个问题（发生过几次 / 现在怎么样）混在同一个数里，两个都答不出。
//
//   本版口径：两份读数**分列且永不混用**。
//     · stat()      —— 本次进程累计（发生过几次），刷新即零；
//     · stateView() —— 只读存档（现在怎么样），只跟存档走，零副作用。
//   byStatus 按真实状态分组（含三个终态），于是「取消 / 失效 / 结算」分得开，
//   而不是都表现为「链没了」。
//
// 【判据】
//   A1 当前状态出口在接口面上，且有真消费方（tool-diag 的 collect().causal.now）。
//   A2 两份读数的出口是**两个成员**，不是一个（分列，不是合并）。
//   B1 空存档：当前状态全零。
//   B2 建链：当前状态按真实状态分组（open），累计同步 +1。
//   B3 取消：当前状态里「取消」与「在途」分得开（不是都变成「链没了」）。
//   B4 只读：stateView() 不改累计、不改存档。
//   B5 两份读数同源可核对：stateView.chains == 存档链数；byStatus 求和 == chains。
//   B6 真消费方读到的是同一份：collect().causal.now 与 stateView() 逐字段一致。
//   N0 破坏锚点在真源码恰中 1 次；N1 破坏 ⇒ 判据现形；N2 原版同款判据仍绿；
//      N4 非恒真（当前状态确实随存档变化，而不是恒零）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');

const CAUSAL = path.join(BASE, 'engines/causal.js');
function src() { return fs.readFileSync(CAUSAL, 'utf8'); }
function countIn(s, x) { return s.split(x).length - 1; }

// 破坏锚点：当前状态的分组键。它必须在真源码恰中 1 次（工具两向自证）。
const ANCHOR = "const k = String(x.status || '(未标注)');";

/** 判据（真源码与破坏副本上跑的是**同一份**函数） */
function judgeGroupsByStatus(s) { return countIn(s, ANCHOR) === 1; }

function seed(WA) {
  WA.causal.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.worldFacts = [{ id: 'wf1', key: '下雨', value: '是' }];
    d.causal = { chains: [], settled: [] };
  }, 'v2870:seed');
}
function chainCount(WA) { return (((WA.store.get().causal || {}).chains) || []).length; }

function runAll(a) {
  // ───────────────────────── A 面：静态 ─────────────────────────
  {
    const s = src();
    a(judgeGroupsByStatus(s), 'v2870/cv: [A1] 当前状态按真实状态分组（锚点恰 1 次，实 '
      + countIn(s, ANCHOR) + '）');
    a(s.indexOf('stateView: stateView') > 0, 'v2870/cv: [A2] 当前状态是**独立成员**（与 stat 分列，不合并）');
    const diag = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    a(diag.indexOf('WA.causal.stateView') > 0,
      'v2870/cv: [A1] tool-diag 真消费 stateView（没人读的出口就是死导出）');
  }
  // ───────────────────────── B 面：运行时 ─────────────────────────
  {
    const WA = gate.fresh({}).WA;
    a(typeof WA.causal.stateView === 'function', 'v2870/cv: [A2] stateView 在接口面上');
    seed(WA);
    const v0 = WA.causal.stateView();
    a(v0.chains === 0 && v0.live === 0 && v0.terminal === 0,
      'v2870/cv: [B1] 空存档当前状态全零（实 ' + JSON.stringify(v0) + '）');
    const r1 = WA.causal.addChain({ cause: '下雨', action: '带伞' });
    const r2 = WA.causal.addChain({ cause: '下雨', action: '关窗' });
    const v1 = WA.causal.stateView();
    a(r1.ok === true && r2.ok === true && v1.chains === 2 && v1.byStatus.open === 2 && v1.live === 2,
      'v2870/cv: [B2] 建链后当前状态按真实状态分组（实 ' + JSON.stringify(v1.byStatus) + '）');
    a(WA.causal.stat().chains === 2, 'v2870/cv: [B2] 累计同步 +2（两份读数各自正确）');
    const cc = WA.causal.cancel(r1.id, '不想了');
    const v2 = WA.causal.stateView();
    a(cc.ok === true && v2.byStatus.cancelled === 1 && v2.byStatus.open === 1
      && v2.live === 1 && v2.terminal === 1,
      'v2870/cv: [B3] 取消后「取消」与「在途」分得开（实 ' + JSON.stringify(v2.byStatus)
      + ' live=' + v2.live + ' terminal=' + v2.terminal + '）——不是都变成「链没了」');
    // B4 只读
    const before = JSON.stringify(WA.causal.stat());
    const beforeStore = JSON.stringify(WA.store.get().causal);
    WA.causal.stateView();
    a(JSON.stringify(WA.causal.stat()) === before && JSON.stringify(WA.store.get().causal) === beforeStore,
      'v2870/cv: [B4] stateView 只读：不改累计、不改存档');
    // B5 同源
    const sum = Object.keys(v2.byStatus).reduce(function (n, k) { return n + v2.byStatus[k]; }, 0);
    a(v2.chains === chainCount(WA) && sum === v2.chains,
      'v2870/cv: [B5] 读数与存档同源（chains=' + v2.chains + ' 实存=' + chainCount(WA)
      + ' byStatus 合计=' + sum + '）');
    // B6 真消费方同一份
    const col = WA.toolDiag.collect().causal;
    a(col && col.now && col.now.chains === v2.chains && col.now.terminal === v2.terminal
      && col.now.byStatus.cancelled === 1,
      'v2870/cv: [B6] collect().causal.now 与 stateView() 是同一份读数（不各算一份）');
    a(typeof col.adds === 'number' && typeof col.cancelled === 'number',
      'v2870/cv: [B6] 累计（adds/cancelled）仍在，且与当前状态**分列**（不是被替换）');
  }
}
/** 负控制：真源码破坏 → 在破坏副本上重跑**同款**判据 */
function runNegative(a) {
  const s = src();
  const n0 = countIn(s, ANCHOR);
  a(n0 === 1, 'v2870/cv: [N0] 破坏锚点在真源码恰中 1 次（实 ' + n0 + '）');
  a(judgeGroupsByStatus(s) === true, 'v2870/cv: [N2] 原版上同款判据为真（判据纯度）');
  // 破坏：分组键恒为「未标注」⇒ 真实状态被抹掉
  const broken = s.replace(ANCHOR, "const k = '(未标注)';");
  a(broken !== s && judgeGroupsByStatus(broken) === false,
    'v2870/cv: [N1] 破坏后「按真实状态分组」现形');
  // N4：非恒真——当前状态确实随存档变化
  const WAo = gate.fresh({}).WA;
  seed(WAo);
  const emptyLive = WAo.causal.stateView().live;
  const r = WAo.causal.addChain({ cause: '下雨', action: '带伞' });
  const afterLive = WAo.causal.stateView().live;
  a(emptyLive === 0 && afterLive === 1,
    'v2870/cv: [N4] 非恒真：空存档在途 ' + emptyLive + ' / 建链后 ' + afterLive + '（读数确实随存档变化）');
  // N1 运行时：破坏副本上真实状态被抹成「未标注」
  const WAb = gate.fresh({ srcOverride: { 'engines/causal.js': broken } }).WA;
  seed(WAb);
  const rb = WAb.causal.addChain({ cause: '下雨', action: '带伞' });
  const vb = WAb.causal.stateView();
  a(rb.ok === true && vb.byStatus['(未标注)'] === 1 && !vb.byStatus.open,
    'v2870/cv: [N1] 破坏副本上运行时现形：真实状态被抹成「未标注」（实 '
    + JSON.stringify(vb.byStatus) + '）');
}
module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
