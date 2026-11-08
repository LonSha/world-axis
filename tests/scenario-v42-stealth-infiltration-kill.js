/**
 * WorldAxis tests/scenario-v42-stealth-infiltration-kill.js
 * 场景 42 专锁：守卫视野巡逻穿梭、背后锁喉暗杀与黑市高利贷销赃专锁 (EXV19-5 + EXV19-6 + OPV19-4 + OPV19-5)
 *
 * 验证目标：
 *  1. 巡逻守卫视锥模型（registerGuard / executeInfiltration）；
 *  2. 投石问路（distractStone）引开守卫视线，背后暗杀（takedown）与藏尸（hideBody）；
 *  3. 黑市洗钱销赃（launderContraband）折价折现与驴打滚高利贷（takeLoan / enforceDebt）；
 *  4. OPV19-4 暗流节庆共振（alignWithFestival）与 OPV19-5 连续 72h 未眠强制宕机（applySleepDeprivation）；
 *  5. 破坏性负控制断言：
 *     - 正午烈日近距直视视线盲区外强行潜行暗杀必须被拒止（refusal: 'unshadowed-direct-line-of-sight'）；
 *     - 清白无追溯风险财物强行黑市洗钱必须被拒止（refusal: 'clean-funds-no-laundering-needed'）；
 *     - 刚醒不足 4h 强行触发睡眠剥夺昏厥必须被拒止（refusal: 'rested-no-deprivation'）。
 */
'use strict';
const assert = require('assert');

// 模拟 WorldAxis 运行时
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/human-realism.js');
require('../engines/undercurrent-calendar.js');
require('../engines/blackmarket-usury.js');
require('../engines/stealth-infiltration.js');
require('../engines/action-desk.js');
WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 42] 开始执行潜行暗杀视锥、黑市金融借贷与节庆疲劳专锁测试...');

WA.store.init();
WA.store.transact(draft => {
  draft.stealthTactics = { guards: [], infiltrators: {}, logs: [] };
  draft.blackmarketAccounts = { laundered: [], loans: [], auctions: [] };
  draft.currents = [{ id: 'assassination_plot', stage: 'latent', title: '暗杀总督计划' }];
  draft.actors = {};
});

// 1. 注册巡逻守卫与暗影战术操作
const regGuard = WA.stealthInfiltration.registerGuard({
  guardId: 'guard_hallway_01',
  name: '府邸廊道甲兵',
  facing: 0, // 朝北
  viewDistance: 25,
  location: 'governor_manor_hall'
});
assert.strictEqual(regGuard.ok, true);

// 2. 投石问路引开守卫转向
const distractRes = WA.stealthInfiltration.executeInfiltration('shadow_blade', {
  tactic: 'distractStone',
  guardId: 'guard_hallway_01',
  distractAngle: 180 // 引向朝南
});
assert.strictEqual(distractRes.ok, true);
assert.strictEqual(distractRes.newFacingAngle, 180);
assert.strictEqual(distractRes.guardAwareness, 'suspicious');
console.log('✓ 投石问路成功引开守卫视锥盲区');

// 3. 背后无声锁喉暗杀与拖拽藏尸
const killRes = WA.stealthInfiltration.executeInfiltration('shadow_blade', {
  tactic: 'takedown',
  guardId: 'guard_hallway_01',
  takedownType: 'silent_strangle'
});
assert.strictEqual(killRes.ok, true);
assert.strictEqual(killRes.guardId, 'guard_hallway_01');

const hideRes = WA.stealthInfiltration.executeInfiltration('shadow_blade', {
  tactic: 'hideBody',
  guardId: 'guard_hallway_01',
  hideSpot: 'underground_wine_cellar'
});
assert.strictEqual(hideRes.ok, true);
console.log('✓ 视锥盲区背后锁喉处决与拖拽藏尸闭环验证通过');

// 4. 破坏性负控制断言 1：正午无阴影直视近距离刺杀驳回
const regGuard2 = WA.stealthInfiltration.registerGuard({
  guardId: 'guard_gate_02',
  name: '烈日正门守卫',
  facing: 90
});
const failStealth = WA.stealthInfiltration.executeInfiltration('shadow_blade', {
  tactic: 'takedown',
  guardId: 'guard_gate_02',
  shadowFactor: 0, // 烈日无阴影
  inSight: true,   // 直视在视野内
  distance: 3      // 3米贴脸
});
assert.strictEqual(failStealth.ok, false);
assert.strictEqual(failStealth.refusal, 'unshadowed-direct-line-of-sight');
console.log('✓ 负控制门禁 1（烈日直视无遮蔽近距离刺杀驳回）验证通过');

// 5. 黑市洗钱销赃与高利贷追偿
const launderRes = WA.blackmarketUsury.transactBlackMarket({
  subType: 'launderContraband',
  actorId: 'shadow_blade',
  itemName: '刺杀所得城防金印',
  nominalValue: 500,
  isHotGoods: true,
  tracingRisk: 80,
  discountRate: 0.40
});
assert.strictEqual(launderRes.ok, true);
assert.strictEqual(launderRes.launderedCash, 200, '4折吃进应得 200 净钱');

// 破坏性负控制断言 2：清白合法财物强行黑市洗钱驳回
const failLaunder = WA.blackmarketUsury.transactBlackMarket({
  subType: 'launderContraband',
  actorId: 'honest_merchant',
  itemName: '合法正规布匹银锭',
  isHotGoods: false,
  tracingRisk: 0
});
assert.strictEqual(failLaunder.ok, false);
assert.strictEqual(failLaunder.refusal, 'clean-funds-no-laundering-needed');
console.log('✓ 负控制门禁 2（清白财物强行黑市折价洗钱驳回）验证通过');

// 6. 借高利贷与逾期暴力断指催收
const loanRes = WA.blackmarketUsury.transactBlackMarket({
  subType: 'takeLoan',
  actorId: 'gambler_joe',
  principal: 1000,
  collateral: '祖传地契',
  interestRate: 0.20,
  dueRounds: 2
});
assert.strictEqual(loanRes.ok, true);

const enforceRes = WA.blackmarketUsury.transactBlackMarket({
  subType: 'enforceDebt',
  loanId: loanRes.loanId,
  penalty: 'sever_finger'
});
assert.strictEqual(enforceRes.ok, true);
assert.strictEqual(enforceRes.penalty, 'sever_finger');
assert.strictEqual(enforceRes.collateralSeized, '祖传地契');
console.log('✓ 高利贷借贷复利与逾期断指催收闭环验证通过');

// 7. OPV19-4 暗流历法节庆共振验证
const festRes = WA.undercurrentCalendar.alignWithFestival('assassination_plot', {
  festivalName: '王城丰收狂欢节',
  crowdMultiplier: 3.0,
  guardSlackPct: 50
});
assert.strictEqual(festRes.ok, true);
assert.strictEqual(festRes.resonated, true);
const curCheck = WA.store.get().currents.find(c => c.id === 'assassination_plot');
assert.strictEqual(curCheck.stage, 'developing', '共振应促使潜伏暗流直接跃迁至成形阶段');
console.log('✓ OPV19-4 暗流历法共振闭环验证通过');

// 8. OPV19-5 睡眠剥夺病理与破坏性负控制断言 3
const sleepCrash = WA.humanRealism.applySleepDeprivation('sentry_tired', 72);
assert.strictEqual(sleepCrash.ok, true);
assert.strictEqual(sleepCrash.forcedCollapse, true, '72小时未眠必须强制宕机昏厥');
assert.strictEqual(sleepCrash.pathology, 'narcolepsyCrash');

const failSleep = WA.humanRealism.applySleepDeprivation('sentry_fresh', 2);
assert.strictEqual(failSleep.ok, false);
assert.strictEqual(failSleep.refusal, 'rested-no-deprivation');
console.log('✓ 负控制门禁 3（充沛精力刚醒强行虚假疲劳宕机驳回）验证通过');

// 9. ActionDesk 路由调度与提示词验证
const deskStealth = WA.actionDesk.plan('stealth.executeInfiltration', {
  infiltratorId: 'shadow_blade',
  tactic: 'shadowMelt',
  shadowFactor: 90
});
assert.strictEqual(deskStealth.ok, true);

const deskBM = WA.actionDesk.plan('market.transactBlackMarket', {
  subType: 'takeLoan',
  actorId: 'test_borrower',
  principal: 200
});
assert.strictEqual(deskBM.ok, true);

const blockBM = WA.blackmarketUsury.buildBlock();
assert.ok(blockBM.indexOf('【地下黑市与高利贷暗流】') !== -1);
const blockStealth = WA.stealthInfiltration.buildBlock();
assert.ok(blockStealth.indexOf('【潜入暗影与巡逻视野】') !== -1);
console.log('✓ ActionDesk 路由调度与 Prompt 注入大盘验证通过');

console.log('[Scenario 42] 视锥潜行暗杀、黑市金融借贷与节庆疲劳专锁测试全部通过！');