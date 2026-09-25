#!/usr/bin/env node
// WorldAxis tests/b6-b7-v2870.js —— v2.87.0（结束版本：B6 导演工作台 + B7 题材组合 + A5 收口导入预览）
//
// 【它治的病】
//   B6：causal 有完整的推进/结算语义，但导演面此前只有「执行再看结果」——
//       没有一处能先问「如果这么做会怎样」。而随机源已可复现（core/rand），
//       却没有任何出口把「这一轮凭什么」与种子绑在一起。
//   B7：rules.js 的 16 个规则模块是全量注入面，却**没有任何一处能把题材装上/卸下**。
//   A5：toolImport.preview() 只报 kind/size/count ——「这次导入会新增什么、为什么跳过」
//       完全看不到，只能真导入一次才知道（而导入是有副作用的）。
//
// 【判据】
//   B6-A 干预预览零副作用、allowed 与真跑同源；
//   B6-B 分支试演与真跑**状态逐字一致**（同一份 advanceChains）；
//   B6-C 试演不留痕（stat / 存档都不变）；
//   B6-D 冲突报出（同因同果在途链）+ 不自动消解；
//   B6-E 回放证据如实（未显式播种时 reproducible=false，不谎称可回放）；
//   B7-A 题材组合生效（getAll 模块数随题材变）、核心模块永在；
//   B7-B 预览不覆盖（preview 不改设置）；
//   B7-C 未知题材不静默（拒收 + 状态不变）；
//   B7-D 多题材叠加为并集（不做覆盖式合并）；
//   B7-E 三插件职责分离可查、缺席如实标注；
//   A5-A 导入差异预览与真跑逐条一致；
//   A5-B 预览零副作用；
//   N0-N4 负控制：真源码破坏 ⇒ 判据现形；原版上同款判据为真；非恒真。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
function src(p) { return fs.readFileSync(path.join(BASE, p), 'utf8'); }
function countIn(s, x) { return s.split(x).length - 1; }
// 破坏锚点：推进语义的唯一实现里的**到期判定**。改掉它，真跑与试演会同时走偏，
//   故判据「试演与真跑一致」在破坏副本上仍会绿——所以要选一个**只影响状态**的锚点：
//   这里选『条件满足才行动』那一句：抹掉它，条件未足的链会直接行动。
const ANCHOR = "        const ready = !x.condition || (Array.isArray(f.metConditions) && f.metConditions.indexOf(x.condition) >= 0);";
function judgeHasReadyGate(s) { return countIn(s, ANCHOR) === 1; }
function seed(WA) {
  WA.causal.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.worldFacts = [{ id: 'wf1', key: '下雨', value: '是' }];
    d.causal = { chains: [], settled: [] };
  }, 'v2870:seed');
}
function runAll(a) {
  // ───────────────────────── 静态面 ─────────────────────────
  {
    const c = src('engines/causal.js');
    a(judgeHasReadyGate(c), 'v2870/bb: [B6-B] 推进语义只有一份（到期门锚点恰 1 次，实 ' + countIn(c, ANCHOR) + '）');
    a(c.indexOf('function advanceChains') > 0 && countIn(c, 'advanceChains(draft') >= 1,
      'v2870/bb: [B6-B] 试演与真跑共用 advanceChains（否则预览会撒谎）');
    a(src('engines/theme.js').length > 1000, 'v2870/bb: [B7] 题材模块存在');
    a(src('index.js').indexOf("'engines/theme.js'") > 0 && src('tests/run.js').indexOf("'engines/theme.js'") > 0,
      'v2870/bb: [B7] theme.js 进了装载清单（不挂 = 永不加载）');
    a(src('engines/tool-import.js').indexOf('function previewPlan') > 0,
      'v2870/bb: [A5] 导入差异预览存在');
  }
  // ───────────────────────── 运行时：B6 ─────────────────────────
  {
    const WA = gate.fresh({}).WA;
    seed(WA);
    const r1 = WA.causal.addChain({ cause: '下雨', action: '带伞', immediate: '伞到手' });
    const r2 = WA.causal.addChain({ cause: '下雨', action: '关窗' });
    a(r1.ok && r2.ok, 'v2870/bb: [B6] 前置：两条链建成');
    // B6-A 预览零副作用
    const b1 = JSON.stringify(WA.store.get().causal), s1 = JSON.stringify(WA.causal.stat());
    const pv = WA.causal.previewIntervention(r1.id, 'advance', {});
    a(pv.ok && pv.allowed === true && pv.before.status === 'open' && pv.after.status === 'acted',
      'v2870/bb: [B6-A] 干预预览给出 before/after（实 ' + JSON.stringify(pv.before) + '->' + JSON.stringify(pv.after) + '）');
    a(JSON.stringify(WA.store.get().causal) === b1 && JSON.stringify(WA.causal.stat()) === s1,
      'v2870/bb: [B6-A] 预览零副作用（不改存档、不改累计）');
    // B6-B 试演 vs 真跑逐字一致
    const re = WA.causal.rehearse({});
    const tick = WA.causal.tick({});
    const view = WA.causal.stateView();
    a(re.ok && tick.ok, 'v2870/bb: [B6-B] 试演与真跑都成功');
    a(JSON.stringify(view.byStatus) === JSON.stringify(re.after.byStatus),
      'v2870/bb: [B6-B] 试演结果与真跑**逐字一致**（试演 ' + JSON.stringify(re.after.byStatus) + ' 真跑 ' + JSON.stringify(view.byStatus) + '）');
    a(re.after.chains === view.chains, 'v2870/bb: [B6-B] 链数一致（' + re.after.chains + '/' + view.chains + '）');
    // B6-C 试演不留痕：stat 的 acts 只由真跑 +2，试演不贡献
    a(WA.causal.stat().acts === 2, 'v2870/bb: [B6-C] 试演不留痕：acts 只计真跑（实 ' + WA.causal.stat().acts + '，若含试演会 >2）');
    // B6-D 冲突报出、不自动消解
    const r3 = WA.causal.addChain({ cause: '下雨', action: '带伞' });
    const cf = WA.causal.conflicts();
    a(cf.length === 1 && cf[0].ids.length === 2 && cf[0].options.indexOf('both') >= 0,
      'v2870/bb: [B6-D] 同因同果在途链被报出且给出显式选项（实 ' + JSON.stringify(cf) + '）');
    a(WA.causal.stateView().chains === 3, 'v2870/bb: [B6-D] 冲突**不被自动消解**（三条都还在，实 ' + WA.causal.stateView().chains + '）');
    // B6-E 回放证据如实
    const ev = WA.causal.evidence();
    // v2.87.0 自纠：rand 未播种时 seedSource 初始为 'none'（不是 'auto'）——`auto` 只在首次
    //   自动取数时被 ensureSeed() 置上。判据锚「不是 explicit」而非锚某个具体词：
    //   只要没显式播种，reproducible 就必须是 false（这是本条的承诺面）。
    a(ev.seedSource !== 'explicit' && ev.reproducible === false,
      'v2870/bb: [B6-E] 未显式播种时如实标注不可复现（实 ' + ev.seedSource + '/' + ev.reproducible + '，不得谎称可回放）');
    WA.rand.seed(42);
    a(WA.causal.evidence().reproducible === true,
      'v2870/bb: [B6-E] 显式播种后可复现（非恒假）');
  }
  // ───────────────────────── 运行时：B7 ─────────────────────────
  {
    const WA = gate.fresh({}).WA;
    // 量纲：每个模块头形如「========== 模块·X ==========」，故用 /模块·/ 计模块数
    const all0 = (WA.rules.getAll().match(/模块·/g) || []).length;
    a(WA.theme.activeModules() === null && all0 === 16,
      'v2870/bb: [B7-A] 未启用题材时 = 全量（旧行为逐字不变，实 ' + all0 + '）');
    const pv = WA.theme.preview(['campus']);
    a(pv.previewOnly === true && pv.currentChars > 0 && pv.moduleCount < all0 && pv.deltaChars < 0,
      'v2870/bb: [B7-B] 预览以**当前面**为基线给出真实差异（' + pv.moduleCount + '/' + all0 + ' 模块，字数差 ' + pv.deltaChars + ' 且为负）');
    a(JSON.stringify(WA.theme.statView().themes) === '[]',
      'v2870/bb: [B7-B] 预览不覆盖：preview 不改设置');
    const bad = WA.theme.apply(['campus', 'nope']);
    a(bad.ok === false && bad.reason === 'unknown-theme' && bad.unknown.indexOf('nope') >= 0,
      'v2870/bb: [B7-C] 未知题材不静默当空集（实 ' + JSON.stringify(bad) + '）');
    a(JSON.stringify(WA.theme.statView().themes) === '[]', 'v2870/bb: [B7-C] 拒收后状态不变');
    const ap = WA.theme.apply(['campus']);
    const n1 = (WA.rules.getAll().match(/模块·/g) || []).length;
    a(ap.ok && n1 === ap.modules.length && n1 < all0 && WA.rules.getAll().indexOf('模块·世界运转') >= 0,
      'v2870/bb: [B7-A] 题材生效于注入面（' + n1 + ' 模块）且核心模块永在');
    WA.theme.apply(['campus', 'mystery']);
    const n2 = (WA.rules.getAll().match(/模块·/g) || []).length;
    a(n2 > n1 && WA.rules.getAll().indexOf('信息黑盒') >= 0,
      'v2870/bb: [B7-D] 多题材叠加为并集（' + n1 + ' -> ' + n2 + '，奇幻/悬疑模块回来）');
    const sep = WA.theme.separation();
    a(sep.roles.length === 3 && sep.roles[0].present === true && sep.roles[2].owner === 'RubyPhone',
      'v2870/bb: [B7-E] 三插件职责分离可查（' + sep.roles.map(function (r) { return r.owner; }).join('/') + '）');
    a(typeof sep.absentPolicy === 'string' && sep.absentPolicy.length > 0,
      'v2870/bb: [B7-E] 缺席降级语义如实标注（不是写死「已接入」）');
    const col = WA.toolDiag.collect();
    a(!!(col.modules && col.modules.theme) && !!(col.lonsha && col.lonsha.separation),
      'v2870/bb: [B7] 诊断面真消费题材与职责分离（否则就是死导出）');
  }
  // ───────────────────────── 运行时：A5 收口 ─────────────────────────
  {
    const WA = gate.fresh({}).WA;
    const raw = [{ name: '红花会', status: '稳固', relation: '中立' }, { name: '空心组' }];
    const b1 = JSON.stringify(WA.store.get());
    const pv = WA.toolImport.previewPlan(raw);
    a(pv.ok && pv.dryRun === true && pv.total === 2 && pv.willSkip === 2 && pv.rows.length === 2,
      'v2870/bb: [A5-A] 差异预览逐条给出原因（实 ' + JSON.stringify(pv.rows.map(function (x) { return x.reason; })) + '）');
    a(JSON.stringify(WA.store.get()) === b1, 'v2870/bb: [A5-B] 差异预览零副作用');
    const real = WA.toolImport.importData(raw);
    a(pv.willAdd === real.added && pv.willSkip === real.skipped,
      'v2870/bb: [A5-A] 预览与真跑**逐条一致**（预览 ' + pv.willAdd + '/' + pv.willSkip + ' 真跑 ' + real.added + '/' + real.skipped + '）');
    const ok1 = [{ name: '清风寨', scope: '北路', status: '稳固', relation: '中立', currentGoal: '扩寨', core_person: '寨主', powerPillars: ['钱粮'] }];
    const pv2 = WA.toolImport.previewPlan(ok1);
    const real2 = WA.toolImport.importData(ok1);
    a(pv2.willAdd === 1 && real2.added === 1,
      'v2870/bb: [A5-A] 合格件预览与真跑同为「会新增」（非恒拒，实 ' + pv2.willAdd + '/' + real2.added + '）');
  }
}
/** 负控制：真源码破坏 ⇒ 在破坏副本上重跑**同款**判据 */
function runNegative(a) {
  const c = src('engines/causal.js');
  const n0 = countIn(c, ANCHOR);
  a(n0 === 1, 'v2870/bb: [N0] 破坏锚点在真源码恰中 1 次（实 ' + n0 + '）');
  a(judgeHasReadyGate(c) === true, 'v2870/bb: [N2] 原版上同款判据为真（判据纯度）');
  const broken = c.replace(ANCHOR, '        const ready = true;   // 破坏：条件未足也直接行动');
  a(broken !== c && judgeHasReadyGate(broken) === false, 'v2870/bb: [N1] 破坏后「到期门存在」现形');
  // 运行时：破坏副本上，条件未足的链会走掉（真跑与试演会一起错）
  const WB = gate.fresh({ srcOverride: { 'engines/causal.js': broken } }).WA;
  WB.causal.setSettings({ enabled: true });
  WB.store.transact(function (d) {
    d.worldFacts = [{ id: 'wf1', key: '下雨', value: '是' }];
    d.causal = { chains: [], settled: [] };
  }, 'v2870:neg-seed');
  const rx = WB.causal.addChain({ cause: '下雨', action: '带伞', condition: '雨停' });
  const beforeRun = WB.causal.stateView().byStatus;
  const tx = WB.causal.tick({ metConditions: [] });
  const afterRun = WB.causal.stateView().byStatus;
  a(rx.ok && beforeRun.open === 1 && afterRun.acted === 1 && tx.changed === 1,
    'v2870/bb: [N1] 破坏副本上运行时现形：条件未足也行动了（' + JSON.stringify(beforeRun) + ' -> ' + JSON.stringify(afterRun) + '）');
  // N4 非恒真：原版上同一场景必须停在 pending（不是恒 acted）
  const WAo = gate.fresh({}).WA;
  seed(WAo);
  const ro = WAo.causal.addChain({ cause: '下雨', action: '带伞', condition: '雨停' });
  WAo.causal.tick({ metConditions: [] });
  const vo = WAo.causal.stateView();
  a(ro.ok && vo.pending === 1 && vo.byStage.pending === 1 && !vo.byStage.acted,
    'v2870/bb: [N4] 非恒真：原版上条件未足停在 pending（byStage ' + JSON.stringify(vo.byStage) + '）');
}
module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
