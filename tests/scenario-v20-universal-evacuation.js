/**
 * WorldAxis tests/scenario-v20-universal-evacuation.js (v2.330.0)
 *
 * 场景 20 专锁：全题材通用生活作息节律、突发火灾阻断与四层自治总线级联疏散
 *
 * 贯通引擎与机制闭环：
 *  1. 全题材通用生活作息引擎 (universal-routine):
 *     - 晨间 slots (dawn/morning) NPC 自动化按照身份模板（cultivation_disciple/modern_standard）展开营生与修行；
 *     - 支持反骨经历偏离 (setActorDeviation)；
 *  2. 突发烈火灾难阻断交通干线 (disaster-evacuation):
 *     - 火灾阻断核心集市通道与演武台；
 *  3. 340 引擎四层自治调度总线 (cascade-bus):
 *     - 物理底层 (physical): 灾难蔓延与环境高热 (environmental-hazard)；
 *     - 机能中层 (somatic): 烟雾与高温加剧疲劳代谢 (metabolism-clock)；
 *     - 行为决策层 (behavioral): 作息被打断，NPC 动线自动转入避险疏散 (dispatchEvacuation)；
 *     - 社会顶层 (social): 跨插件客观事实单向向 LonSha 投影事实流。
 *  4. 5 项真实破坏性负控制硬门禁：
 *     - [NC-1] 缺角色名注册通用作息拒收 (missing-actor-id)；
 *     - [NC-2] 缺偏离类型设定作息偏离拒收 (missing-deviation-kind)；
 *     - [NC-3] 非法四层总线层级派发事件阻断 (invalid-layer)；
 *     - [NC-4] 避难所人员离开时未入住者拦截 (actor-not-in-shelter)；
 *     - [NC-5] 解除不存在的突发灾难报 disaster-not-found。
 */
'use strict';

const assert = require('assert');
const path = require('path');

// 引入被测生产引擎
const routine = require('../engines/universal-routine.js');
const disasterEvac = require('../engines/disaster-evacuation.js');
const cascadeBus = require('../engines/cascade-bus.js');
const envHazard = require('../engines/environmental-hazard.js');

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

console.log('=== 开始执行 V15 场景 20 专锁：全题材作息节律、突发险阻与四层总线级联演化 ===');

// 0. 重置环境
routine.resetAll();
disasterEvac.resetAll();
cascadeBus.resetAll();
envHazard.resetAll();

// 1. 全题材作息节律初始化与演化
it('1.1 注册修仙弟子李逍遥与现代社畜王五的全题材作息画像', () => {
  const r1 = routine.registerActorRoutine('actor_xianxia', 'xianxia_disciple');
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.archetype, 'xianxia_disciple');

  const r2 = routine.registerActorRoutine('actor_modern', 'modern_standard');
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.archetype, 'modern_standard');
});

it('1.2 晨间 6 点评估作息，修仙弟子晨起吞吐紫气，现代社畜晨起赶地铁', () => {
  const ev1 = routine.evaluateActorRoutine('actor_xianxia', 6);
  assert.strictEqual(ev1.ok, true);
  assert.strictEqual(ev1.slotId, 'dawn');
  assert.ok(ev1.currentActivity.includes('吞吐朝霞紫气'));

  const ev2 = routine.evaluateActorRoutine('actor_modern', 6);
  assert.strictEqual(ev2.ok, true);
  assert.ok(ev2.currentActivity.includes('晨起洗漱'));
});

it('1.3 现代社畜反骨旷工偏离，作息动态异化', () => {
  const devRes = routine.setActorDeviation('actor_modern', 'truancy', '赖床死睡并关掉所有闹钟', 'bedroom');
  assert.strictEqual(devRes.ok, true);

  const evAfter = routine.evaluateActorRoutine('actor_modern', 9);
  assert.strictEqual(evAfter.isDeviated, true);
  assert.strictEqual(evAfter.deviationKind, 'truancy');
  assert.ok(evAfter.currentActivity.includes('赖床死睡'));
});

// 2. 突发灾难与全域通道阻断
it('2.1 上午城东爆发烈火天灾 (fire)，封锁集市主街与通道', () => {
  const disRes = disasterEvac.registerDisaster('fire_east_01', 'fire', 'east_market', 3, {
    blockedPlaces: ['east_market', 'central_crossing'],
    blockedEdges: ['market_to_square'],
    desc: '烈焰席卷商铺，浓烟滚滚阻断道路'
  });
  assert.strictEqual(disRes.ok, true);
  assert.strictEqual(disRes.record.kind, 'fire');

  // 登记避难所
  const shRes = disasterEvac.registerShelter('stone_temple', 'north_hill', 5, {
    desc: '避火石窟'
  });
  assert.strictEqual(shRes.ok, true);
  assert.strictEqual(shRes.availableSlots, 5);
});

// 3. 四层级联调度总线驱动大时钟脉冲
it('3.1 四层总线 dispatchTick 驱动全域世界脉冲，完成物理->机能->行为->社会逐级级联', () => {
  let physicalHeard = false;
  let somaticHeard = false;
  let behavioralHeard = false;
  let socialHeard = false;

  cascadeBus.subscribe('physical', () => { physicalHeard = true; });
  cascadeBus.subscribe('somatic', () => { somaticHeard = true; });
  cascadeBus.subscribe('behavioral', () => { behavioralHeard = true; });
  cascadeBus.subscribe('social', () => { socialHeard = true; });

  const tickRes = cascadeBus.dispatchTick({
    hour: 10,
    activeActors: ['actor_xianxia', 'actor_modern'],
    currentZones: ['east_market', 'north_hill']
  });

  assert.strictEqual(tickRes.ok, true);
  assert.strictEqual(tickRes.tick, 1);
  assert.strictEqual(physicalHeard, true);
  assert.strictEqual(somaticHeard, true);
  assert.strictEqual(behavioralHeard, true);
  assert.strictEqual(socialHeard, true);
});

it('3.2 火灾威胁下调度修仙弟子向石窟避难所紧急疏散', () => {
  const evacRes = disasterEvac.dispatchEvacuation('actor_xianxia', 'east_market', 'fire_east_01');
  assert.strictEqual(evacRes.ok, true);
  assert.strictEqual(evacRes.status, 'evacuated');
  assert.strictEqual(evacRes.shelterId, 'stone_temple');
  assert.strictEqual(evacRes.remainingSlots, 4);
});

// 4. 真实破坏性负控制断言矩阵 (5 项)
it('4.1 [NC-1] 缺角色名注册通用作息拒收 (missing-actor-id)', () => {
  const r = routine.registerActorRoutine('', 'modern_standard');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'missing-actor-id');
});

it('4.2 [NC-2] 缺偏离类型设定作息偏离拒收 (missing-deviation-kind)', () => {
  const r = routine.setActorDeviation('actor_xianxia', '', 'custom');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'missing-deviation-kind');
});

it('4.3 [NC-3] 非法四层总线层级派发事件阻断 (invalid-layer)', () => {
  const r = cascadeBus.dispatchEvent('metaphysical_dimension', 'some_event', {});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'invalid-layer');
});

it('4.4 [NC-4] 未入驻避难所的角色尝试离开报 actor-not-in-shelter', () => {
  const r = disasterEvac.leaveShelter('stranger_guy', 'stone_temple');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'actor-not-in-shelter');
});

it('4.5 [NC-5] 清除不存在的灾难报 disaster-not-found', () => {
  const r = disasterEvac.clearDisaster('non_existent_disaster_999');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'disaster-not-found');
});

console.log(`\n=== 场景 20 专锁测试完成：通过 ${passed} 项，失败 ${failed} 项 ===`);
if (failed > 0) process.exit(1);