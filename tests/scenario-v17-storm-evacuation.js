/**
 * WorldAxis tests/scenario-v17-storm-evacuation.js (v2.330.0)
 *
 * 场景 17 专锁：暴雨夜交通险阻断绝、极端失温侵蚀、随身行囊拮据与同域避难所争夺
 *
 * 贯通引擎与机制闭环：
 *  1. 极端恶劣环境侵蚀 (environmental-hazard):
 *     暴风雨区域极低温浸透，产生 cold 负荷侵蚀，角色经历轻度到中度失温 (hypothermia)；
 *  2. 生理代谢级联反哺 (metabolism-clock):
 *     环境侵蚀与暴风雨逆风行走加剧生物机能疲劳点数累积 (accumulateFatigue)；
 *  3. 突发灾难与交通道路阻断 (disaster-evacuation & transit-scheduler):
 *     山体塌方/路面塌陷阻断道路干线，公共通勤被强行熔断拦截；
 *  4. 随身行囊物理口袋与财物拮据 (personal-inventory):
 *     角色零钱耗尽（0円/币），无法购买应急车马/载具通行服务；
 *  5. 狭窄避难所同域争夺仲裁 (spatial-conflict):
 *     荒野干燥遮蔽所仅剩 1 个名额，两名角色产生动线资源冲突 (scramble_resource)，
 *     体格/敏捷与侵略性计算胜负，输者被迫滞留外围或承受体力损耗。
 *  6. 5 项真实破坏性负控制硬门禁：
 *     - [NC-1] 缺地点名注册灾难拒收 (missing-place-id)；
 *     - [NC-2] 严重度越界注册环境负荷拒收 (severity-out-of-range)；
 *     - [NC-3] 避难所满员且无其他避难所时疏散报 shelter_exhausted；
 *     - [NC-4] 同一角色无法与自己发生空间冲突 (cannot-conflict-with-self)；
 *     - [NC-5] 非法冲突意图拒收 (invalid-conflict-intent)。
 */
'use strict';

const assert = require('assert');
const path = require('path');
// v2.380.0（历史欠账消红）：纯引擎直跑老形态，需先搭宿主台子（宿主 = mock.js）。
require('./host-boot.js').boot();

// 引入被测生产引擎
const envHazard = require('../engines/environmental-hazard.js');
const disasterEvac = require('../engines/disaster-evacuation.js');
const spatialConflict = require('../engines/spatial-conflict.js');
const inventory = require('../engines/personal-inventory.js');
const metabolism = require('../engines/metabolism-clock.js');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${desc}:`, err.message);
  }
}

console.log('=== 开始执行 V15 场景 17 专锁：暴风雨夜险阻、失温侵蚀、行囊拮据与同域争夺 ===');

// 0. 重置环境
envHazard.resetAll();
disasterEvac.resetAll();
spatialConflict.resetAll();

// 1. 暴风雨夜极端环境侵蚀注册与结算
it('1.1 暴雨夜山口区域登记 4 级寒潮极低温侵蚀负荷', () => {
  const regRes = envHazard.registerZoneHazard('mountain_pass', 'cold', 4, {
    desc: '暴风雨夹杂山涧刺骨冰水倾盆而下，体表温度骤降',
    shelterReduction: 0.7
  });
  assert.strictEqual(regRes.ok, true);
  assert.strictEqual(regRes.hazard.severity, 4);
  assert.strictEqual(regRes.hazard.hazardType, 'cold');
});

it('1.2 角色张三在暴雨山口暴露 90 分钟，触发轻中度失温侵蚀与机能疲劳反哺', () => {
  const vBefore = metabolism.getVitals('zhangsan');
  assert.ok(vBefore, '成功获取张三生理档案');
  const expoRes = envHazard.evaluateExposure('zhangsan', 'mountain_pass', 90, {
    gearResistance: 0.1, // 简陋单衣
    inShelter: false
  });
  assert.strictEqual(expoRes.ok, true);
  assert.strictEqual(expoRes.benign, false);
  assert.ok(expoRes.totalNewErosion > 15, `侵蚀值应显著: ${expoRes.totalNewErosion}`);
  assert.ok(expoRes.symptoms.length > 0);
  assert.ok(expoRes.symptoms[0].includes('失温'));

  // 检查角色状态
  const st = envHazard.getActorExposureStatus('zhangsan');
  assert.strictEqual(st.ok, true);
  assert.ok(['moderate', 'severe'].includes(st.maxStage));

  // 推进生理时钟并验证失温判定
  const advRes = metabolism.advanceClock('zhangsan', 1.5, { weather: 'storm', sheltered: false });
  assert.ok(['chilled', 'hypothermic'].includes(advRes.bodyTemp));
});

// 2. 道路塌方险阻与交通中断
it('2.1 山洪塌方爆发，封闭关键隘口通道与道路', () => {
  const disRes = disasterEvac.registerDisaster('storm_flood_01', 'collapse', 'mountain_pass', 4, {
    blockedPlaces: ['mountain_pass', 'narrow_bridge'],
    blockedEdges: ['pass_to_town'],
    desc: '泥石流冲垮木桥，主通道彻底被碎石巨木封死'
  });
  assert.strictEqual(disRes.ok, true);
  assert.strictEqual(disRes.record.kind, 'collapse');
  assert.ok(disRes.record.blockedPlaces.includes('mountain_pass'));
});

// 3. 行囊物理口袋零钱拮据
it('3.1 角色张三囊中羞涩，将现金全部消费后仅剩 0 无法雇佣昂贵避险载具', () => {
  const curInv = inventory.getInventory('zhangsan');
  if (curInv.cash > 0) {
    inventory.deductCash('zhangsan', curInv.cash);
  }
  const deductRes = inventory.deductCash('zhangsan', 500);
  assert.strictEqual(deductRes.ok, false);
  assert.strictEqual(deductRes.reason, 'insufficient_funds');
});

// 4. 避难设施与容量争夺
it('4.1 登记荒野废弃猎人木屋避难所，容量仅限 1 人', () => {
  const shRes = disasterEvac.registerShelter('hunter_cabin', 'forest_fringe', 1, {
    desc: '狭小仅容一人的干燥防雨木屋'
  });
  assert.strictEqual(shRes.ok, true);
  assert.strictEqual(shRes.availableSlots, 1);
});

it('4.2 张三与流浪佣兵李四同时抵达木屋门前，触发资源争夺冲突仲裁', () => {
  const actorA = { actorId: 'zhangsan', physique: 45, agility: 55, intimidation: 40, aggressive: false };
  const actorB = { actorId: 'lisi', physique: 75, agility: 50, intimidation: 70, aggressive: true };

  const conflictRes = spatialConflict.resolveSpatialConflict('hunter_cabin_door', actorA, actorB, {
    intent: 'scramble_resource',
    contestedResource: 'hunter_cabin_bed'
  });

  assert.strictEqual(conflictRes.ok, true);
  assert.strictEqual(conflictRes.resolution, 'force_push'); // 李四好斗且体格力量碾压
  assert.strictEqual(conflictRes.winner, 'lisi');
  assert.strictEqual(conflictRes.loser, 'zhangsan');
  assert.ok(conflictRes.staminaCostLoser > 0);
});

it('4.3 胜利者李四成功入住避难所，木屋满员', () => {
  const evacRes = disasterEvac.dispatchEvacuation('lisi', 'forest_fringe', 'storm_flood_01');
  assert.strictEqual(evacRes.ok, true);
  assert.strictEqual(evacRes.status, 'evacuated');
  assert.strictEqual(evacRes.remainingSlots, 0);
});

// 5. 真实破坏性负控制断言矩阵 (5 项)
it('5.1 [NC-1] 缺地点标识注册突发灾难拒收 (missing-place-id)', () => {
  const r = envHazard.registerZoneHazard('', 'cold', 3);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'missing-place-id');
});

it('5.2 [NC-2] 负荷严重度越界注册拒收 (severity-out-of-range)', () => {
  const r = envHazard.registerZoneHazard('zone_a', 'cold', 9);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'severity-out-of-range');
});

it('5.3 [NC-3] 避难所满员且无其他可用安全所时，张三疏散阻断 (shelter_exhausted)', () => {
  const r = disasterEvac.dispatchEvacuation('zhangsan', 'forest_fringe', 'storm_flood_01');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 'shelter_exhausted');
  assert.strictEqual(r.reason, 'no-available-shelters-with-capacity');
});

it('5.4 [NC-4] 同一角色无法与自己发生空间争夺 (cannot-conflict-with-self)', () => {
  const r = spatialConflict.resolveSpatialConflict('hall', { actorId: 'zhangsan' }, { actorId: 'zhangsan' }, {});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'cannot-conflict-with-self');
});

it('5.5 [NC-5] 非法空间冲突意图拒收 (invalid-conflict-intent)', () => {
  const r = spatialConflict.resolveSpatialConflict('hall', { actorId: 'a' }, { actorId: 'b' }, { intent: 'fly_to_sky' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'invalid-conflict-intent');
});

console.log(`\n=== 场景 17 专锁测试完成：通过 ${passed} 项，失败 ${failed} 项 ===`);
if (failed > 0) process.exit(1);
