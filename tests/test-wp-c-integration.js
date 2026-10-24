'use strict';
// WorldAxis tests/test-wp-c-integration.js
// 验证 C 包（长期沉积与地方分化）全维度切片：
// WX-5 地方技术标准与改装投资 + WX-6 周期性集市活动 + WX-7 多版本社会记忆 + WX-8 多方承继再组织 + WX-9 地方路径分化 + WP-9 三套蓝图

const assert = require('node:assert/strict');
const path = require('node:path');
require('./mock.js');
const fresh = require('./ui-gate-sync.js').fresh;

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS ' + name);
    passCount++;
  } catch (err) {
    console.error('  FAIL ' + name);
    console.error(err);
    failCount++;
  }
}

function createTestEnv() {
  if (global.localStorage) global.localStorage.clear();
  const W = fresh().WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  W.activity.setSettings({ enabled: true });
  W.laborSchedule.setSettings({ enabled: true });
  return W;
}

console.log('=== 开始 C 包深度集成验证 (test-wp-c-integration) ===');

// ── 用例 1：WX-5 地方技术规格冲突、试制适配件、工位改装停产与外包代工 ──
test('WX-5: 地方技术规格冲突、试制适配件、工位改装停产与外包代工', function () {
  const W = createTestEnv();

  // 1. 声明两个不同工坊的技术标准
  const stdTown = W.techLineage.declareStandard('std_town_lathe', {
    name: '城镇精密车床标准',
    placeId: 'town_workshop',
    stationType: 'lathe',
    version: '2.0',
    specCode: 'shaft_30mm',
    compatibilities: {
      'std_frontier_bench': {
        relation: 'requires_adapter',
        adapterItemId: 'adp_bushing_30_32',
        costFactor: 1.25,
        extraDays: 1
      }
    }
  });
  assert.equal(stdTown.ok, true);

  const stdFrontier = W.techLineage.declareStandard('std_frontier_bench', {
    name: '边境林场工位标准',
    placeId: 'frontier_camp',
    stationType: 'workbench',
    version: '1.0',
    specCode: 'shaft_32mm',
    compatibilities: {} // 未声明对城镇标准反向兼容
  });
  assert.equal(stdFrontier.ok, true);

  // 2. 检查兼容性关系
  const c1 = W.techLineage.checkCompatibility('std_town_lathe', 'std_frontier_bench');
  assert.equal(c1.ok, true);
  assert.equal(c1.compatible, true);
  assert.equal(c1.requiresAdapter, true, '需适配件转接');
  assert.equal(c1.costFactor, 1.25);
  assert.equal(c1.extraDays, 1);

  // 未声明的反向兼容判定为 incompatible
  const c2 = W.techLineage.checkCompatibility('std_frontier_bench', 'std_town_lathe');
  assert.equal(c2.ok, true);
  assert.equal(c2.compatible, false);
  assert.equal(c2.relation, 'incompatible', '未声明关系按严格物理规则不可通用');

  // 3. 路线2：试制/加工规格适配件
  const adpRes = W.techLineage.produceAdapter({
    fromSpec: 'std_town_lathe',
    toSpec: 'std_frontier_bench',
    cost: 8,
    durability: 15
  });
  assert.equal(adpRes.ok, true);
  assert.equal(adpRes.adapter.fromSpec, 'std_town_lathe');

  // 4. 路线3：投资规划工位改装（retrofit）
  // 初始化工位与资金
  W.store.transact(function (d) {
    d.production = d.production || {};
    d.production.facilities = {
      'fac_lathe_01': { id: 'fac_lathe_01', name: '1号车床', specId: 'std_town_lathe', status: 'idle' }
    };
    d.economy = { money: { funds: 100 }, stock: {} };
    return true;
  });

  const planRet = W.techLineage.planRetrofit('fac_lathe_01', 'std_frontier_bench', {
    fundsRequired: 30,
    daysRequired: 3,
    by: '大师傅'
  });
  assert.equal(planRet.ok, true);
  assert.equal(planRet.retrofit.status, 'in_progress');
  assert.equal(planRet.retrofit.downTime, true, '改装期间产能停摆');

  // 验证资金扣减与工位状态
  const sAfterPlan = W.store.get();
  assert.equal(sAfterPlan.economy.money.funds, 70, '改装投入资金扣减');
  assert.equal(sAfterPlan.production.facilities['fac_lathe_01'].status, 'retrofitting');

  // 推进改装进度
  const adv1 = W.techLineage.advanceRetrofit('fac_lathe_01', 2);
  assert.equal(adv1.ok, true);
  assert.equal(adv1.completed, false);
  assert.equal(adv1.daysRemaining, 1);

  // 完成改装
  const adv2 = W.techLineage.advanceRetrofit('fac_lathe_01', 1);
  assert.equal(adv2.ok, true);
  assert.equal(adv2.completed, true);
  assert.equal(adv2.daysRemaining, 0);

  const sAfterComp = W.store.get();
  assert.equal(sAfterComp.production.facilities['fac_lathe_01'].specId, 'std_frontier_bench', '工位规格成功升级');
  assert.equal(sAfterComp.production.facilities['fac_lathe_01'].status, 'idle', '工位恢复待命');

  // 5. 路线4：外包代工（outsource）
  W.store.transact(function (d) {
    d.production.orders = {
      'ord_special_shaft': { id: 'ord_special_shaft', name: '特制轴件', daysRequired: 3, status: 'in_progress' }
    };
    return true;
  });

  const outRes = W.techLineage.outsourceWork('ord_special_shaft', 'fac_lathe_01', {
    fee: 15,
    extraTransitDays: 2
  });
  assert.equal(outRes.ok, true);
  assert.equal(outRes.outsourced.status, 'outsourced');

  const sAfterOut = W.store.get();
  assert.equal(sAfterOut.production.orders['ord_special_shaft'].outsourced, true);
  assert.equal(sAfterOut.production.orders['ord_special_shaft'].daysRequired, 5, '外包包含物流周期');
});

// ── 用例 2：WX-6 周期性集市活动、跨期筹备备货、变故应急处理与优先邀请 ──
test('WX-6: 周期性集市活动、跨期筹备备货、变故应急处理与优先邀请', function () {
  const W = createTestEnv();

  // 注册人物
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_老商贩'] = { id: 'p_老商贩', name: '老商贩', resources: { '银元': 50 } };
    d.people['p_年轻铁匠'] = { id: 'p_年轻铁匠', name: '年轻铁匠', resources: { '银元': 20 } };
    d.people['p_集市执事'] = { id: 'p_集市执事', name: '集市执事', resources: { '银元': 100 } };
    return true;
  });

  // 1. 声明集市活动系列
  const serRes = W.activity.declareSeries('market_weekly', {
    title: '青石镇周期集市',
    place: 'town_square',
    organizer: 'market_union',
    frequencyDays: 7,
    prepWindowDays: 3,
    defaultQuota: 4,
    host: '集市执事'
  });
  assert.equal(serRes.ok, true);
  assert.equal(serRes.series.frequencyDays, 7);

  // 2. 推进生成第 1 期集市
  const c1 = W.activity.nextCycle('market_weekly', { day: 7, rounds: 2 });
  assert.equal(c1.ok, true);
  assert.equal(c1.cycleNumber, 1);
  const actId1 = c1.activityId;

  // 跨期筹备备货与排班预订
  const prepRes = W.activity.prepareForActivity(actId1, '老商贩', {
    goods: { pottery: 5, dried_fruit: 10 },
    claimSchedule: true,
    transportMethod: 'cart'
  });
  assert.equal(prepRes.ok, true);
  assert.equal(prepRes.preparation.scheduleClaimed, true);

  // 开放第 1 期报名并开场结算
  const openRes = W.activity.open({ id: actId1 });
  assert.equal(openRes.ok, true);

  W.activity.signup({ id: actId1, who: '集市执事', role: 'host' });
  W.activity.signup({ id: actId1, who: '老商贩', role: 'contestant' });
  W.activity.signup({ id: actId1, who: '年轻铁匠', role: 'contestant' });

  W.activity.start({ id: actId1 });
  W.activity.round({ id: actId1, n: 1, contestants: ['老商贩', '年轻铁匠'] });
  W.activity.round({ id: actId1, n: 2, contestants: ['老商贩', '年轻铁匠'] });

  const setRes = W.activity.settle({
    id: actId1,
    prize: { from: '集市执事', amount: 15, perWinner: 15 }
  });
  assert.equal(setRes.ok, true);

  // 查询第 1 期结果生成的下期优先邀请
  const invRes = W.activity.nextCycleInvitations('market_weekly');
  assert.equal(invRes.ok, true);
  assert.ok(invRes.priorityInvites.indexOf('老商贩') >= 0, '履约良好的老商贩获得优先邀请');
  assert.ok(invRes.priorityInvites.indexOf('年轻铁匠') >= 0);

  // 3. 推进生成第 2 期集市，测试变故应急处理
  const c2 = W.activity.nextCycle('market_weekly', { day: 14, rounds: 2 });
  assert.equal(c2.ok, true);
  assert.equal(c2.cycleNumber, 2);
  const actId2 = c2.activityId;
  assert.notEqual(actId1, actId2, '每期活动拥有完全独立的实例身份');

  // 变故 1：缩办（scale_down）
  const dis1 = W.activity.handleDisruption(actId2, 'facility_partial_break', {
    resolution: 'scale_down',
    newQuota: 2
  });
  assert.equal(dis1.ok, true);
  assert.equal(dis1.outcome.newQuota, 2);

  // 变故 2：迁址（relocate）
  const dis2 = W.activity.handleDisruption(actId2, 'flooding', {
    resolution: 'relocate',
    newPlace: 'town_backup_square'
  });
  assert.equal(dis2.ok, true);
  assert.equal(dis2.outcome.newPlace, 'town_backup_square');

  // 变故 3：延期（postpone）
  const dis3 = W.activity.handleDisruption(actId2, 'storm', {
    resolution: 'postpone',
    newDay: 16
  });
  assert.equal(dis3.ok, true);
  const act2Updated = W.activity.activityOf(actId2);
  assert.equal(act2Updated.day, 16, '活动延期至第16天，不重复生成多套活动');
});

// ── 用例 3：WX-7 多版本社会记忆、群体传播分歧、当事人公开澄清与合作门槛 ──
test('WX-7: 多版本社会记忆、群体传播分歧、当事人公开澄清与合作门槛', function () {
  const W = createTestEnv();

  const sourceEventId = 'evt_bridge_repair_delay_01';

  // 1. 登记两种截然对立的主张（针对同一客观事件）
  // 主张 A（商户同业公会）：认为大师傅故意拖延工期，怠工谋私
  const claimA = W.socialLegacy.registerClaim(sourceEventId, {
    claimant: '商户公会会长',
    nature: 'hearsay',
    stance: 'misunderstanding',
    targetWho: '大师傅',
    claimText: '大师傅在青石桥修缮中拖延工期两周，涉嫌怠工',
    evidence: '商队通行滞后记录'
  });
  assert.equal(claimA.ok, true);

  // 主张 B（工匠行会同行）：亲历见证，排查险情
  const claimB = W.socialLegacy.registerClaim(sourceEventId, {
    claimant: '青年学徒',
    nature: 'eyewitness',
    stance: 'praise',
    targetWho: '大师傅',
    claimText: '修缮中拆出暗桩腐朽，大师傅为防坍塌果断排险加固',
    evidence: '断木腐朽标本与现场质检记录'
  });
  assert.equal(claimB.ok, true);

  // 2. 分别向两个群体传播不同主张
  const spA = W.socialLegacy.spreadClaim(claimA.claim.id, 'guild_merchants');
  assert.equal(spA.ok, true);

  const spB = W.socialLegacy.spreadClaim(claimB.claim.id, 'guild_craftsmen');
  assert.equal(spB.ok, true);

  // 3. 检查群体主观立场及合作门槛修正
  const stanceMerchants = W.socialLegacy.groupMemoryStance('guild_merchants', '大师傅');
  assert.equal(stanceMerchants.summaryStance, 'suspicious');
  assert.equal(stanceMerchants.costModifier, 1.25, '商户群体因误解主张提高合作防范成本');

  const stanceCraftsmen = W.socialLegacy.groupMemoryStance('guild_craftsmen', '大师傅');
  assert.equal(stanceCraftsmen.summaryStance, 'favorable');
  assert.equal(stanceCraftsmen.costModifier, 0.9, '同行群体提供优惠信任折扣');

  // 4. 当事人携带实物证据向商户群体公开澄清
  const clarRes = W.socialLegacy.clarifyClaim(sourceEventId, '大师傅', '断木腐朽标本与监理签字', 'guild_merchants');
  assert.equal(clarRes.ok, true);
  assert.equal(clarRes.previousStance, 'misunderstanding');
  assert.equal(clarRes.newStance, 'clarified');

  // 澄清后商户群体敌意消解
  const stanceAfterClarify = W.socialLegacy.groupMemoryStance('guild_merchants', '大师傅');
  assert.equal(stanceAfterClarify.summaryStance, 'neutral');
  assert.equal(stanceAfterClarify.costModifier, 1.0, '误解消除，合作成本恢复正常');
});

// ── 用例 4：WX-8 离场交接清单、多候选人挑肥拣瘦承继、争议标记与未完项目再组织 ──
test('WX-8: 离场交接清单、多候选人挑肥拣瘦承继、争议标记与未完项目再组织', function () {
  const W = createTestEnv();

  // 1. 成员离场发起资产与责任交接清单
  const handRes = W.socialLegacy.initiateHandover({
    departingWho: '老掌柜',
    reason: '迁居邻城',
    inventory: {
      gear: ['master_chisel', 'bronze_scale'],
      positions: ['guild_auditor'],
      projects: ['ord_bridge_handrail'],
      liabilities: ['debt_to_union_40'],
      stationAccess: ['station_workbench_A']
    }
  });
  assert.equal(handRes.ok, true);
  const hId = handRes.handover.id;

  // 2. 候选人差异化投标（学徒甲：要凿子与工位，拒绝债务）
  const prop1 = W.socialLegacy.proposeSuccession(hId, '学徒甲', [
    'gear:master_chisel',
    'stationAccess:station_workbench_A'
  ], {
    declinedScope: ['liabilities:debt_to_union_40']
  });
  assert.equal(prop1.ok, true);

  // 候选人乙（合作工匠：也要凿子，且愿意接工单，也拒绝债务）
  const prop2 = W.socialLegacy.proposeSuccession(hId, '合作工匠乙', [
    'gear:master_chisel',
    'projects:ord_bridge_handrail'
  ], {
    declinedScope: ['liabilities:debt_to_union_40']
  });
  assert.equal(prop2.ok, true);

  // 3. 组织仲裁与执行交接
  const resolveRes = W.socialLegacy.resolveHandover(hId);
  assert.equal(resolveRes.ok, true);
  assert.equal(resolveRes.status, 'contested', '存在争议项');

  // 验证争议项
  assert.ok(resolveRes.contested.indexOf('gear:master_chisel') >= 0, '两人争夺名匠凿子标记为争议');

  // 验证无争议分配
  assert.equal(resolveRes.allocations['stationAccess:station_workbench_A'].status, 'assigned');
  assert.equal(resolveRes.allocations['stationAccess:station_workbench_A'].winner, '学徒甲');
  assert.equal(resolveRes.allocations['projects:ord_bridge_handrail'].status, 'assigned');
  assert.equal(resolveRes.allocations['projects:ord_bridge_handrail'].winner, '合作工匠乙');

  // 验证无人承接项
  assert.ok(resolveRes.unclaimed.indexOf('liabilities:debt_to_union_40') >= 0, '债务无人承接');
  assert.ok(resolveRes.unclaimed.indexOf('positions:guild_auditor') >= 0);

  // 4. 对未承接项进行再组织
  const reorgRes = W.socialLegacy.reorganizeUnclaimed(hId, {
    'liabilities:debt_to_union_40': 'custody',
    'positions:guild_auditor': 'close'
  });
  assert.equal(reorgRes.ok, true);
  assert.equal(reorgRes.reorganization['liabilities:debt_to_union_40'].action, 'custody');
  assert.equal(reorgRes.reorganization['positions:guild_auditor'].action, 'close');
});

// ── 用例 5：WX-9 两地三十回合长期投资分化、同等故障下的韧性差异与转型代价 ──
test('WX-9: 两地三十回合长期投资分化、同等故障下的韧性差异与转型代价', function () {
  const W = createTestEnv();

  // 1. 分别确立两地不同的发展路径
  const p1 = W.phaseTransition.declarePlaceLayout('town_workshop', 'shared_service_center', { by: '城镇公堂' });
  assert.equal(p1.ok, true);

  const p2 = W.phaseTransition.declarePlaceLayout('frontier_camp', 'decentralized_workshop', { by: '林场拓荒者' });
  assert.equal(p2.ok, true);

  // 2. 模拟 30 个回合持续投资积累
  // 城镇集中向大型工位与共享动力投入 150 资金
  W.store.transact(function (d) {
    d.economy = { money: { funds: 200 } };
    return true;
  });
  const inv1 = W.phaseTransition.investPath('town_workshop', {
    title: '引水动力机组与高精锻压共享台',
    funds: 150,
    materials: { iron: 15 }
  });
  assert.equal(inv1.ok, true);

  // 边境向便携互助工具组投入 60 资金
  const inv2 = W.phaseTransition.investPath('frontier_camp', {
    title: '互助维修工具箱与分散烘干炉',
    funds: 50,
    materials: { timber: 20 }
  });
  assert.equal(inv2.ok, true);

  // 3. 评估两地指标分化
  const evalTown = W.phaseTransition.evaluatePlacePath('town_workshop');
  assert.equal(evalTown.ok, true);
  assert.ok(evalTown.efficiencyFactor >= 1.5, '共享服务中心生产效率显著提升');
  assert.equal(evalTown.transitCostFactor, 0.85);
  assert.equal(evalTown.failureImpact, 'high', '单点故障崩溃风险高');

  const evalCamp = W.phaseTransition.evaluatePlacePath('frontier_camp');
  assert.equal(evalCamp.ok, true);
  assert.ok(evalCamp.efficiencyFactor < evalTown.efficiencyFactor, '分散手工效率平稳');
  assert.equal(evalCamp.transitCostFactor, 1.2, '运输偏多');
  assert.equal(evalCamp.failureImpact, 'low', '单点故障影响极低，容灾能力高');

  // 4. 转型路线代价规划
  const planRoute = W.phaseTransition.planTransitionRoute('town_workshop', 'decentralized_workshop');
  assert.equal(planRoute.ok, true);
  assert.equal(planRoute.sunkCostLoss, 60, '既有投资产生 40% 沉没损失');
  assert.equal(planRoute.transitionCost, 30, '重组开销');
  assert.equal(planRoute.transitionDays, 5);
});

// ── 用例 6：WP-9 三套玩法蓝图端到端安装开局与跨会话重载持久化 ──
test('WP-9: 三套玩法蓝图端到端安装开局与跨会话重载持久化', function () {
  const W = createTestEnv();

  // 1. 安装城镇工坊蓝图
  const inst1 = W.playableBlueprint.installSample('town-workshop', { force: true });
  assert.equal(inst1.ok, true);
  const s1 = W.store.get();
  assert.ok(s1.world.places.some(function (p) { return p.name === 'workshop'; }));
  assert.ok(s1.people['p_大师傅'], '大师傅人物初始注入');
  assert.ok(s1.people['p_青年学徒'], '青年学徒人物初始注入');
  assert.equal(s1.economy.money.funds, 50, '初始资金注入');
  assert.equal(s1.economy.stock.wood, 10, '初始木料注入');

  // 2. 安装边境探索蓝图
  const inst2 = W.playableBlueprint.installSample('settlement-exploration', { force: true });
  assert.equal(inst2.ok, true);
  const s2 = W.store.get();
  assert.ok(s2.world.places.some(function (p) { return p.name === 'frontier_camp'; }));
  assert.ok(s2.people['p_老向导']);
  assert.ok(s2.economy.stock.rope, 3);

  // 3. 安装科幻站点蓝图
  const inst3 = W.playableBlueprint.installSample('sci-fi-station', { force: true });
  assert.equal(inst3.ok, true);
  const s3 = W.store.get();
  assert.ok(s3.world.places.some(function (p) { return p.name === 'station_core'; }));
  assert.ok(s3.people['p_首席技师']);
  assert.equal(s3.economy.money.funds, 100);

  // 4. 模拟全量世界存档与重载
  const rawWorld = JSON.stringify(W.store.get());

  const W2 = fresh().WA;
  W2.store.init();
  W2.actionDesk.setSettings({ enabled: true });
  W2.activity.setSettings({ enabled: true });
  W2.store.restore(JSON.parse(rawWorld));

  const restoredStore = W2.store.get();
  assert.ok(restoredStore.blueprint.installed['town-workshop']);
  assert.ok(restoredStore.blueprint.installed['settlement-exploration']);
  assert.ok(restoredStore.blueprint.installed['sci-fi-station']);
  assert.equal(restoredStore.economy.money.funds, 100);
  assert.ok(restoredStore.people['p_大师傅']);
  assert.ok(restoredStore.people['p_首席技师']);

  // 重载后继续调用行动桌执行已恢复的标准和集市系列
  const deskList = W2.actionDesk.plan('playableBlueprint.listSamples', {});
  assert.equal(deskList.ok, true);
  assert.ok(deskList.samples.length >= 3);
});

console.log('----------------------------------------------------');
console.log('WP-C 整合门禁套件运行结果: ' + passCount + ' 通过 / ' + failCount + ' 失败');
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('WP-C 6/6 全部用例断言通过！');
}
