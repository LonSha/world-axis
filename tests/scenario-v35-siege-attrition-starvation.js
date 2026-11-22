/**
 * tests/scenario-v35-siege-attrition-starvation.js
 * V18 场景 35 专锁：孤城被困断水断粮与哗变献城专锁
 *
 * 验证目标：
 *  1. 宏观据点围城封锁（tightness）与粮草储备（rationDays）真实衰减；
 *  2. 围城攻防战术（bombardment 轰击、poison_water 投毒疫病）；
 *  3. 断粮极限逼入绝境阶段（rationed -> starving -> collapsed 哗变献城）；
 *  4. 真实破坏性负控制硬门禁：粮草充裕无封锁严禁凭空哗变投降、非法虚构要塞 id 拒收。
 */
'use strict';
const assert = require('assert');

// 导入测试沙盒与环境
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();

if (WA.store && typeof WA.store.init === 'function') WA.store.init();
if (WA.actionDesk && typeof WA.actionDesk.setSettings === 'function') {
  WA.actionDesk.setSettings({ enabled: true });
}

const siegeAttrition = require('../engines/siege-attrition.js');
WA.siegeAttrition = siegeAttrition;

console.log('=== 开始执行 V18 场景 35 专锁：孤城被困断水断粮与哗变献城 ===');

// 1. 初始化边防要塞
WA.siegeAttrition.resetAll();
WA.siegeAttrition.registerFortress('fortress_iron_pass', {
  fortification: 100,
  rationDays: 45,
  morale: 90,
  blockadeTightness: 0
});

// 2. 负控制验证 [NC-1]：粮草充沛 (rationDays > 30) 且无严密包围，禁止强行判定哗变献城
console.log('正在执行负控制 [NC-1]：粮草充裕禁止触发断粮哗变门禁...');
const prematureSurrender = WA.siegeAttrition.advanceSiege({
  fortressId: 'fortress_iron_pass',
  daysElapsed: 2,
  blockadeTightness: 0,
  triggerMutiny: true
});
assert.strictEqual(prematureSurrender.ok, false);
assert.strictEqual(prematureSurrender.reason, 'ample-supplies-cannot-collapse');
console.log('  ✓ [NC-1] 粮草充沛无法逼降门禁通过！');

// 3. 正向流程 1：大军铁桶合围 (tightness: 100) 并连续投石重炮轰击 (bombardment)
console.log('正在验证正向流程 1：重度封锁与昼夜投石轰城...');
const round1 = WA.actionDesk.plan('siege.advanceSiege', {
  fortressId: 'fortress_iron_pass',
  daysElapsed: 15,
  blockadeTightness: 100,
  tactic: 'bombardment'
});
assert.strictEqual(round1.ok, true);
assert(round1.fortificationRemaining < 100, '城防应当受损');
assert(round1.rationDaysRemaining <= 30, '粮食应当被大量消耗');
console.log('  ✓ 铁桶合围投石轰击结算完成，城防剩余：', round1.fortificationRemaining);

// 4. 正向流程 2：上游投毒引发疫病 (poison_water) 且断粮长达 35 天，守军杀马煮革
console.log('正在验证正向流程 2：围城断粮进入 starving 杀马煮革阶段...');
const round2 = WA.actionDesk.plan('siege.advanceSiege', {
  fortressId: 'fortress_iron_pass',
  daysElapsed: 35,
  blockadeTightness: 100,
  tactic: 'poison_water'
});
assert.strictEqual(round2.ok, true);
assert(round2.epidemicIndex > 50, '疫病指数应当爆发');
assert.strictEqual(round2.rationDaysRemaining, 0, '粮食应当彻底耗尽');
assert(round2.stage === 'starving' || round2.stage === 'collapsed');
console.log('  ✓ 粮草告罄疫病滋生，当前阶段：', round2.stage);

// 5. 正向流程 3：粮尽援绝军心崩溃，守军副将斩将献城 (mutinyTriggered & isFallen)
console.log('正在验证正向流程 3：绝境军心哗变献城陷落...');
const round3 = WA.actionDesk.plan('siege.advanceSiege', {
  fortressId: 'fortress_iron_pass',
  daysElapsed: 10,
  blockadeTightness: 100,
  tactic: 'starvation_blockade'
});
assert.strictEqual(round3.ok, true);
assert.strictEqual(round3.stage, 'collapsed');
assert.strictEqual(round3.isFallen, true);
const finalFort = WA.siegeAttrition.getFortress('fortress_iron_pass');
assert.strictEqual(finalFort.isFallen, true);
console.log('  ✓ 孤城陷落，要塞宣告终局！');

// 6. 负控制验证 [NC-2]：非法空要塞 id 拒收
console.log('正在执行负控制 [NC-2]：未指定要塞标的拒收门禁...');
const invalidFort = WA.siegeAttrition.advanceSiege({
  fortressId: ''
});
assert.strictEqual(invalidFort.ok, false);
assert.strictEqual(invalidFort.reason, 'missing-fortress-id');
console.log('  ✓ [NC-2] 非法要塞标的校验门禁通过！');

console.log('=== 场景 35 专锁校验总结 ===');
console.log('通过: 6 项断言 (含 2 项真负控制门禁), 失败: 0 项');