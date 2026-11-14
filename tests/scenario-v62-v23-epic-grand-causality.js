/**
 * WorldAxis tests/scenario-v62-v23-epic-grand-causality.js (v2.408.0)
 * 场景 62～67 贯通专锁：V23 超级史诗「全域因果觉醒与深层涌现文明大系」集成终验
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   九台新引擎不是「能 require 就算接上」：每条链必须真的走通一个合法因果，
 *   并且**必须有一条真源码负控制打中拒收码**（非法因果不许伪造成功）；
 *   九项系统底座改造也必须给出运行时读数，而不是只看源码里有没有那行字。
 *
 * ── 为什么全部用真写口、不塞桩 ────────────────────────────────────────
 *   tests/ui-gate-sync.js 的 fresh() 按 tests/run.js 的 LOAD 真装载全仓引擎，
 *   WA.commodityCirculation / WA.somaticTrauma / … 全部是现场真命名空间。
 *   本锁不 require 单文件、不自建 WA.xxx —— 那正是本仓反复点名的
 *   「测试里自塞了桩就测得过」。所有断言的输入与结论都来自同一份现场。
 *
 * ── 场景归属 ──────────────────────────────────────────────────────────
 *   62 实物商路 → 债务违约 → 具身创伤 → 创伤闪回（EXV23-1/2/3）
 *   63 谣言裂变 → 暴民踩踏 → 水力地貌熔断（EXV23-4/5）
 *   64 器械疲劳炸膛 → 死信箱暗桩 → 夺嫡立嗣（EXV23-6/7/8）
 *   65 张力时钟 → 时代奇点 → 纪元跃迁（EXV23-9）
 *   66 OPV23 底座：级联波 / 深度 GC / 原子批处理 / 分支差分 / 排他租约
 *   67 OPV23 视面：显著性剪裁 / 全息事件流 / 推演物理法则注面
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log('  ✓ ' + label);
}
function eq(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  passed += 1;
  console.log('  ✓ ' + label);
}

console.log('=== 场景 62~67：V23 超级史诗贯通专锁 ===');

// ─────────────────────────────────────────────────────────────────────
// 场景 62：实物商路 → 债务违约 → 具身创伤 → 创伤闪回
// ─────────────────────────────────────────────────────────────────────
console.log('--- 62-1 EXV23-1 实物商路与债务违约清算 ---');
WA.commodityCirculation.reset();
WA.commodityCirculation.setStockpile('depot_alpha', 'grain', 500);
const cargo = WA.commodityCirculation.transferCargo({
  fromNode: 'depot_alpha', toNode: 'depot_beta',
  commodity: 'grain', amount: 200, hazardRate: 0
});
eq(cargo.ok, true, '合法商路调拨放行');
eq(cargo.delivered, 200, '零损耗时实收 = 发运量');
eq(WA.commodityCirculation.getStockpile('depot_alpha', 'grain'), 300, '源节点真实扣减 200');
eq(WA.commodityCirculation.getStockpile('depot_beta', 'grain'), 200, '目标节点真实入账 200');

const over = WA.commodityCirculation.transferCargo({
  fromNode: 'depot_alpha', toNode: 'depot_beta', commodity: 'grain', amount: 5000
});
eq(over.ok, false, '负控制：超量提取实物被拒');
eq(over.refusal, 'cargo-exceeds-physical-stockpile', '负控制精确打中拒收码 cargo-exceeds-physical-stockpile');
eq(WA.commodityCirculation.getStockpile('depot_alpha', 'grain'), 300, '拒收后库存未被撕裂');

const debt = WA.commodityCirculation.issueDebtInstrument({
  issuerId: 'guild_merchants', holderId: 'noble_house', principal: 100
});
eq(debt.ok, true, '借据按真实发行方/持有人/本金立账');
const defaulted = WA.commodityCirculation.settleDefault(debt.debt.id, 3, 0);
eq(defaulted.ok, true, '逾期未偿进入违约清算');
eq(defaulted.status, 'defaulted', '清算结论是 defaulted（不是静默成功）');

console.log('--- 62-2 EXV23-2 分部创伤与知觉剥夺 ---');
WA.somaticTrauma.reset();
const wound = WA.somaticTrauma.inflictWound('knight_gawain', 'mainHand', { severity: 'severed' });
eq(wound.ok, true, '合法解剖部位受创放行');
eq(wound.wound.severed, true, 'severed 伤情真落账（不是只记个 pain 数字）');
const bandage = WA.somaticTrauma.performTriage('knight_gawain', 'mainHand', 'bandage');
eq(bandage.ok, false, '负控制：截断肢体不许常规包扎');
eq(bandage.refusal, 'limb-severed-requires-amputation-cauterization', '负控制精确打中拒收码 limb-severed-requires-amputation-cauterization');
const cauterize = WA.somaticTrauma.performTriage('knight_gawain', 'mainHand', 'cauterize');
eq(cauterize.ok, true, '烧灼止血是唯一合法处置');
eq(cauterize.wound.treated, true, '处置后 treated 真翻转为 true');
const profile = WA.somaticTrauma.getSensoryProfile('knight_gawain');
eq(profile.manipulationImpaired, true, '具身知觉剥夺：主手操作能力真受损');
const metabolism = WA.somaticTrauma.tickMetabolism('knight_gawain');
ok(metabolism.ok && metabolism.bloodLevel <= 100, '代谢 tick 给出真实血值读数');

console.log('--- 62-3 EXV23-3 创伤闪回与记忆虚构 ---');
WA.psycheDissociation.reset();
const shock = WA.psycheDissociation.triggerTraumaShock('knight_gawain', {
  severity: 85, origin: 'battle_of_the_crossing', triggers: ['rain']
});
eq(shock.ok, true, '创伤锚点按 origin + triggers 落账');
eq(shock.traumaIndex, 85, '创伤指数 = 冲击强度');
const fringe = WA.psycheDissociation.evaluateSanityFringe('knight_gawain', 'rain');
eq(fringe.activeFlashback, true, '触发词命中 ⇒ 真进入闪回解离');
eq(fringe.distortionFilter, 'flashback-to:battle_of_the_crossing', '闪回回溯到真实锚点，不是凭空编造');
const noTrauma = WA.psycheDissociation.evaluateSanityFringe('fresh_mind', 'rain');
eq(noTrauma.ok, false, '负控制：无锚定创伤者不许诱发闪回');
eq(noTrauma.refusal, 'no-anchored-trauma-origin', '负控制精确打中拒收码 no-anchored-trauma-origin');
const confab = WA.psycheDissociation.confabulateMemory('knight_gawain', 'childhood_memory');
eq(confab.ok, true, '偏执心智真生成虚构记忆');
eq(confab.reliability, 0.15, '虚构记忆被显式标低可信度（不与真实事实混账）');

// ─────────────────────────────────────────────────────────────────────
// 场景 63：谣言裂变 → 暴民踩踏 → 水力地貌熔断
// ─────────────────────────────────────────────────────────────────────
console.log('--- 63-1 EXV23-4 暴民恐慌与踩踏 ---');
WA.mobStampede.reset();
WA.mobStampede.setCrowdDensity('plaza_center', 80);
const rumor = WA.mobStampede.igniteRumorWave('plaza_center', { severity: 100 });
eq(rumor.ok, true, '高烈度传闻在足额人群中放行');
eq(rumor.panicLevel, 80, '恐慌值按烈度真实抬升');
const riot = WA.mobStampede.escalateMobTension('plaza_center');
eq(riot.stampede, true, '越过 riotPanicThreshold ⇒ 真爆发踩踏');
ok(riot.casualties > 0 && riot.remainingCrowd < 80, '踩踏产生真实伤亡并扣减人群（不是只翻个布尔）');
const quelled = WA.mobStampede.quellMob('plaza_center', 'curfew');
eq(quelled.status, 'quelled', '宵禁镇压真收束暴动状态');
WA.mobStampede.setCrowdDensity('empty_square', 0);
const noCrowd = WA.mobStampede.igniteRumorWave('empty_square', { severity: 100 });
eq(noCrowd.refusal, 'insufficient-crowd-density', '负控制精确打中拒收码 insufficient-crowd-density');

console.log('--- 63-2 EXV23-5 水文地貌重塑与道路熔断 ---');
WA.geophysicalReshaping.reset();
const terrain = WA.geophysicalReshaping.simulateTerrainShift('river_valley', {
  rainfall: 90, seismicActivity: 40, isArid: false
});
eq(terrain.landslideTriggered, true, '降雨 + 地震应力越阈 ⇒ 真触发地貌崩塌');
const arid = WA.geophysicalReshaping.simulateTerrainShift('dry_basin', { rainfall: 0, isArid: true });
eq(arid.refusal, 'hydro-deficit-cannot-breach', '负控制精确打中拒收码 hydro-deficit-cannot-breach');
const rupture = WA.geophysicalReshaping.ruptureInfrastructure('bridge_great_river', {
  severity: 90, kind: 'flood-collapse'
});
eq(rupture.impassable, true, '道路拓扑真熔断');
eq(WA.geophysicalReshaping.isPathPassable('bridge_great_river').passable, false, '通行判据读到熔断（不是各说各话）');
const underRepair = WA.geophysicalReshaping.repairInfrastructure('bridge_great_river', 50);
eq(underRepair.refusal, 'infrastructure-remains-ruptured', '负控制：抢修物资不足不许悄悄复通');
eq(WA.geophysicalReshaping.repairInfrastructure('bridge_great_river', 100).status, 'restored', '足额排险后真复通');

// ─────────────────────────────────────────────────────────────────────
// 场景 64：器械疲劳 → 死信箱暗桩 → 夺嫡立嗣
// ─────────────────────────────────────────────────────────────────────
console.log('--- 64-1 EXV23-6 器械机械疲劳与卡死 ---');
WA.artificeDegradation.reset();
WA.artificeDegradation.registerItem('catapult_behemoth', { material: 'wood_iron' });
const stress = WA.artificeDegradation.applyStress('catapult_behemoth', { mechanicalShock: 75 });
eq(stress.jammed, true, '应力越过 jamThreshold ⇒ 器械真卡死');
const integrity = WA.artificeDegradation.inspectStructuralIntegrity('catapult_behemoth');
eq(integrity.isJammed, true, '结构读数与应力事件同源');
ok(integrity.currentIntegrity < 100, '疲劳真扣减结构完整度');
WA.artificeDegradation.registerItem('ethereal_relic', { isEthereal: true });
const ethereal = WA.artificeDegradation.applyStress('ethereal_relic', { mechanicalShock: 75 });
eq(ethereal.refusal, 'inapplicable-material-property', '负控制精确打中拒收码 inapplicable-material-property');
eq(WA.artificeDegradation.performMaintenance('catapult_behemoth', 10).status, 'repaired', '维保真清除卡死状态');

console.log('--- 64-2 EXV23-7 影子议会死信箱 ---');
WA.shadowCouncil.reset();
eq(WA.shadowCouncil.establishDeadDrop('hollow_willow').ok, true, '死信箱地点真建立');
eq(WA.shadowCouncil.infiltrateAgent('agent_raven', 'shadow_council', { coverRole: 'scribe' }).ok, true, '暗桩带掩护身份真潜伏');
const drop = WA.shadowCouncil.dropDeadLetter('hollow_willow', 'marshal-departs-at-dusk', 'agent_raven');
eq(drop.ok, true, '密信真投递进死信箱');
const retrieved = WA.shadowCouncil.retrieveDeadLetters('hollow_willow');
eq(retrieved.count, 1, '取件读到真实密信数量');
eq(retrieved.letters[0].fromAgent, 'agent_raven', '密信保留真实投递者归因');
const noDrop = WA.shadowCouncil.dropDeadLetter('nowhere', 'x');
eq(noDrop.refusal, 'dead-drop-unestablished', '负控制精确打中拒收码 dead-drop-unestablished');

console.log('--- 64-3 EXV23-8 宗族谱系与夺嫡立嗣 ---');
WA.dynasticLineage.reset();
eq(WA.dynasticLineage.bindLineage('firstborn_son', 'house_valerius', { isLegitimate: true }).ok, true, '嫡出血脉真入谱');
const succession = WA.dynasticLineage.conveneSuccession('house_valerius', 'firstborn_son');
eq(succession.status, 'orderly-succession', '正统顺位继承真定案');
eq(succession.newHeadId, 'firstborn_son', '宗主归属真实落账');
const stranger = WA.dynasticLineage.conveneSuccession('house_valerius', 'stranger');
eq(stranger.refusal, 'unrecognized-lineage-bloodline', '负控制精确打中拒收码 unrecognized-lineage-bloodline');
ok(WA.dynasticLineage.claimPrivilege('firstborn_son', 'office').remainingClanPrestige < 100, '门荫特权真消耗门阀声望');

// ─────────────────────────────────────────────────────────────────────
// 场景 65：张力时钟 → 时代奇点 → 纪元跃迁
// ─────────────────────────────────────────────────────────────────────
console.log('--- 65 EXV23-9 张力时钟与时代奇点 ---');
WA.worldSingularity.reset();
const early = WA.worldSingularity.triggerConvergenceEvent({ kind: 'premature' });
eq(early.refusal, 'tension-below-critical-singularity-threshold', '负控制精确打中拒收码 tension-below-critical-singularity-threshold');
for (let i = 0; i < 9; i += 1) WA.worldSingularity.advanceSingularityTension(10, 'escalating-crisis');
eq(WA.worldSingularity.getSingularityState().tension, 90, '张力时钟真累积到临界以上');
const convergence = WA.worldSingularity.triggerConvergenceEvent({
  kind: 'dynastic-collapse', focalPoint: 'capital_citadel'
});
eq(convergence.status, 'convergence-in-progress', '奇点收束幕真启动');
eq(convergence.focusFocalPoint, 'capital_citadel', '风暴眼按入参真落账');
const epoch = WA.worldSingularity.shiftEpoch('ash-epoch');
eq(epoch.newEpoch, 'ash-epoch', '纪元真跃迁');
eq(WA.worldSingularity.getSingularityState().tension, 0, '跃迁后张力真归零（不是留着旧值）');
eq(WA.worldSingularity.getSingularityState().historyCount, 1, '旧纪元真进历史账');

// ─────────────────────────────────────────────────────────────────────
// 场景 66：OPV23 系统底座（运行时读数，不是「源码里有那行字」）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 66-1 OPV23-1 级联波与拓扑自检 ---');
const wave = WA.cascadeBus.broadcastCascadeWave('physical', {});
eq(wave.ok, true, '合法源层广播放行');
eq(wave.layersReached.length, 6, '级联波真覆盖六层总线');
const recursive = WA.cascadeBus.broadcastCascadeWave('physical', { __recursiveDepth: 3 });
eq(recursive.refusal, 'recursive-cascade-aborted', '循环因果波真自愈熔断');
const topo = WA.cascadeBus.verifyTopologyWiring();
eq(topo.isHealthy, true, '拓扑自检给出健康读数');
eq(topo.layersCount, 6, '拓扑层数与级联波覆盖数逐字对齐');

console.log('--- 66-2 OPV23-2 复合动作原子批处理 ---');
const v23Routes = [
  'market.transferCargo', 'market.settleDefault', 'body.inflictWound', 'body.performTriage',
  'mind.triggerTraumaShock', 'crowd.igniteRumorWave', 'geo.simulateTerrainShift',
  'craft.applyStress', 'spy.infiltrateAgent', 'clan.bindLineage', 'epoch.advanceSingularityTension'
];
ok(v23Routes.every(function (k) { return WA.actionDesk.ROUTES.indexOf(k) >= 0; }), '11 条 V23 新路由全部登记进 ROUTES 面');

const preflight = WA.actionDesk.transactActions([{ route: 'no.such.route', params: {} }]);
eq(preflight.refusal, 'batch-atomic-preflight-failed', '前置校验：未知路由在任意子动作执行前就拒收');

// 中途失败必须阻断后续：第三项用张力时钟当哨兵，若被执行 tension 会变成 55。
WA.worldSingularity.reset();
const aborted = WA.actionDesk.transactActions([
  { route: 'epoch.advanceSingularityTension', params: { delta: 5, reason: 'first-leg' } },
  { route: 'market.transferCargo', params: { fromNode: 'empty_depot', toNode: 'depot_alpha', commodity: 'grain', amount: 9999 } },
  { route: 'epoch.advanceSingularityTension', params: { delta: 50, reason: 'must-not-run' } }
]);
eq(aborted.refusal, 'batch-atomic-execution-aborted', '子动作失败真中断批处理');
eq(aborted.failedIndex, 1, '失败定位到真实序号');
eq(WA.worldSingularity.getSingularityState().tension, 5, '哨兵证明第三项未执行（阻断式原子，非回滚式）');

WA.worldSingularity.reset();
const batch = WA.actionDesk.transactActions([
  { route: 'epoch.advanceSingularityTension', params: { delta: 10, reason: 'ok-1' } },
  { route: 'crowd.igniteRumorWave', params: { placeId: 'plaza_atomic', rumorSpec: { severity: 20 } } }
]);
eq(batch.ok, true, '两项合法复合动作一次提交');
eq(batch.count, 2, '原子批处理返回真实执行条数');

console.log('--- 66-3 OPV23-4 分支差分沙盒 ---');
const fork = WA.store.forkBranch('sandbox_sim_branch');
eq(fork.ok, true, '影子分支真克隆成功');
eq(fork.forkId, 'sandbox_sim_branch', '分支标识按入参落账');
ok(!!fork.state && fork.state.__isShadowFork === true, '克隆体带影子标记，与生产 state 隔离');
const diff = fork.diff(Object.assign({}, fork.state, { clock: { iso: 'future' } }));
eq(diff.ok, true, '分支差分真可计算');
ok(diff.changes.some(function (c) { return c.key === 'clock'; }), '差分精确点出变更键（不是恒等空集）');

console.log('--- 66-4 OPV23-6 资源排他租约锁 ---');
const lease1 = WA.store.acquireResourceLease('granary_reserve', 500, 10);
eq(lease1.ok, true, '首个租约真取得');
const lease2 = WA.store.acquireResourceLease('granary_reserve', 500, 10);
eq(lease2.ok, false, '同优先级并发争抢真被拒');
eq(lease2.refusal, 'resource-lease-conflict-exhausted', '拒收码精确：resource-lease-conflict-exhausted');
eq(WA.store.releaseResourceLease(lease1.leaseToken).ok, true, '凭 token 真释放');
eq(WA.store.acquireResourceLease('granary_reserve', 100, 10).ok, true, '释放后可再取得（锁不是一次性死闩）');

console.log('--- 66-5 OPV23-8 长局深度 GC ---');
const gc = WA.evict.runDeepEvictSweep({
  people: { p1: { __isPurged: true }, p2: { alive: true } },
  worldFacts: [{ key: 'kept' }, null, { key: 'orphan', __orphan: true }]
});
eq(gc.ok, true, '深度清扫真执行');
eq(gc.prunedCount, 3, '已清除人物 + 空引用 + 孤儿事实三类都真回收');

// ─────────────────────────────────────────────────────────────────────
// 场景 67：OPV23 视面与推演注面
// ─────────────────────────────────────────────────────────────────────
console.log('--- 67-1 OPV23-5 具身显著性知觉剪裁 ---');
const critical = WA.render.applySaliencyInjections({ stressLevel: 90 }, { critical: true });
eq(critical.tier, 'CRITICAL', '危机态真升到 CRITICAL 档');
eq(critical.culledCount, 10, '危机态真剪掉背景噪声');
ok(critical.sources.indexOf('somaticTrauma') >= 0, '剪裁后真改读具身创伤源');
const ambient = WA.render.applySaliencyInjections({ stressLevel: 10 }, { critical: false });
eq(ambient.tier, 'AMBIENT', '平静态回落常态背景档');
eq(ambient.culledCount, 0, '平静态不误剪常态信息');

console.log('--- 67-2 OPV23-7 全息事件流与地缘热力 ---');
const stream = WA.worldReader.streamCascadeEvents(10);
eq(stream.ok, true, '全息事件流真可读');
ok(Array.isArray(stream.events) && stream.events.length > 0, '事件流含真实纪元读数（不是空数组恒真）');
ok(/地缘态势全息热力流/.test(WA.worldReader.renderHolographicGeoMap()), '地缘热力视面真渲染出内容');

console.log('--- 67-3 OPV23-3 推演快照物理法则注面 ---');
// compactState 是 backstage 的私有裁剪步骤（不导出），故用「注面契约 + 供数引擎运行时」
// 双证据：缺任一条，推演快照都会退回「模型看不到物理硬约束」的老病。
const bsSrc = fs.readFileSync(path.join(__dirname, '../engines/backstage.js'), 'utf8');
ok(/world_physics\s*:/.test(bsSrc), '推演快照真带 world_physics 注面');
ok(/ruptures\s*:/.test(bsSrc) && /singularityTension\s*:/.test(bsSrc), '注面真接道路熔断与时代张力两个物理读数');
eq(typeof WA.geophysicalReshaping.isPathPassable, 'function', '供数引擎①运行时可用');
eq(typeof WA.worldSingularity.getSingularityState, 'function', '供数引擎②运行时可用');
WA.geophysicalReshaping.reset();
WA.geophysicalReshaping.ruptureInfrastructure('snapshot_probe_bridge', { severity: 60 });
eq(WA.geophysicalReshaping.isPathPassable('snapshot_probe_bridge').passable, false, '快照将读到的熔断状态在运行时真的成立');
WA.geophysicalReshaping.reset();

console.log('=== 场景 62~67 贯通专锁全绿：' + passed + ' 项断言 ===');
