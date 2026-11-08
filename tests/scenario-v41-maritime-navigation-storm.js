/**
 * WorldAxis tests/scenario-v41-maritime-navigation-storm.js
 * 场景 41 专锁：怒海狂涛触礁遇险与水手舟船动力学专锁 (EXV19-4 + OPV19-3)
 *
 * 验证目标：
 *  1. 船舶注册与风暴抢风航行（tack），波浪与风暴损耗船体耐久、导致舱底进水；
 *  2. 水手排水（pumpBilge）与弃货减重防倾覆（jettisonCargo）物理恢复干舷；
 *  3. OPV19-3: 水文洋流与暴风雨底噪对声学与视距的动态遮蔽（calculateWeatherMasking / evaluateSensoryOcclusion）；
 *  4. 破坏性负控制断言：船底积水达 100% 极限或结构归零沉没时，强行常规航行必须被拒止（refusal: 'vessel-foundering-abandon-ship'）。
 */
'use strict';
const assert = require('assert');

// 模拟 WorldAxis 运行时
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/spatial-acoustics.js');
require('../engines/spatial-topology.js');
require('../engines/maritime-navigation.js');
require('../engines/action-desk.js');
WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 41] 开始执行远洋航行风暴动力学与水文动态遮蔽专锁测试...');

WA.store.init();
WA.store.transact(draft => {
  draft.maritimeVessels = [];
});

// 1. 注册远洋探险船只
const regRes = WA.maritimeNavigation.registerVessel({
  vesselId: 'vessel_iron_whale',
  name: '铁鲸远洋探险号',
  hullIntegrity: 100,
  bilgeWater: 10,
  cargoLoad: 80,
  crewCount: 30
});
assert.strictEqual(regRes.ok, true, '船舶注册应成功');
assert.strictEqual(regRes.vessel.vesselId, 'vessel_iron_whale');

// 2. 遭遇 8 级暴风雨抢风航行，检验损耗与进水
const tackRes = WA.maritimeNavigation.navigateVoyage({
  vesselId: 'vessel_iron_whale',
  action: 'tack',
  heading: 120,
  env: {
    stormLevel: 8,
    waveMeters: 6.5,
    reefHazard: 0.6
  }
});
assert.strictEqual(tackRes.ok, true, '风暴抢风航行应成功');
assert.strictEqual(tackRes.newHeading, 120);
assert.ok(tackRes.bilgeWater > 10, '风暴巨浪应造成舱底进水');
assert.ok(tackRes.hullIntegrity < 100, '暗礁刮擦与风暴应磨损船体');
console.log('✓ 风暴航行、浪损进水与暗礁损伤闭环验证通过');

// 3. 弃货减重与水手抽舱排水
const pumpRes = WA.maritimeNavigation.navigateVoyage({
  vesselId: 'vessel_iron_whale',
  action: 'pumpBilge',
  pumpEfficiency: 30
});
assert.strictEqual(pumpRes.ok, true, '水手抽水应成功');
assert.ok(pumpRes.drainedPct > 0, '抽水应显著排降舱底积水');

const jettisonRes = WA.maritimeNavigation.navigateVoyage({
  vesselId: 'vessel_iron_whale',
  action: 'jettisonCargo',
  amount: 25
});
assert.strictEqual(jettisonRes.ok, true, '弃货减重应成功');
assert.strictEqual(jettisonRes.jettisonedTons, 25);
console.log('✓ 抽舱排水与弃货防倾覆恢复干舷验证通过');

// 4. OPV19-3: 水文洋流与恶劣天候对声学与视距的动态遮蔽
const acousticRes = WA.spatialAcoustics.calculateWeatherMasking(35, 'heavy_thunder_storm');
assert.strictEqual(acousticRes.ok, true);
assert.strictEqual(acousticRes.masked, true, '暴雨雷鸣底噪 85dB 应完全掩盖 35dB 潜行声音');
assert.strictEqual(acousticRes.stealthBonusPct, 80);

const occlusionRes = WA.spatialTopology.evaluateSensoryOcclusion('stalker', 'captain', {
  weather: 'fog_storm',
  lightLevel: 15,
  distance: 12
});
assert.strictEqual(occlusionRes.ok, true);
assert.strictEqual(occlusionRes.canSee, false, '暗夜暴风浓雾中 12 米外绝对无法直视');
assert.strictEqual(occlusionRes.canHear, false, '狂风暴雨轰鸣中无法听闻脚步');
assert.strictEqual(occlusionRes.stealthViable, true);
console.log('✓ OPV19-3 水文恶劣气象声学与视距遮蔽协同闭环验证通过');

// 5. 破坏性负控制门禁验证：船体破裂严重进水达 100% 极限（倾覆沉没），严禁常规航行
const vessel = WA.maritimeNavigation.getVessel('vessel_iron_whale');
vessel.bilgeWater = 100; // 模拟海水灌满货舱
vessel.hullIntegrity = 0; // 龙骨解体

const failRes = WA.maritimeNavigation.navigateVoyage({
  vesselId: 'vessel_iron_whale',
  action: 'tack',
  heading: 180
});
assert.strictEqual(failRes.ok, false, '沉没绝境必须拒止常规航行');
assert.strictEqual(failRes.refusal, 'vessel-foundering-abandon-ship', '必须抛出弃船沉没拒止判定');
console.log('✓ 负控制门禁（100%进水倾覆沉没绝境强行航行驳回）验证通过');

// 6. ActionDesk 路由调度与提示词验证
const deskRes = WA.actionDesk.plan('naval.navigateVoyage', {
  vesselId: 'vessel_iron_whale',
  action: 'pumpBilge'
});
assert.strictEqual(deskRes.ok, false);
assert.strictEqual(deskRes.refusal, 'vessel-foundering-abandon-ship');

const block = WA.maritimeNavigation.buildBlock();
assert.ok(block.indexOf('【沉没】') !== -1, '提示词大盘应精准呈现沉没告急');
console.log('✓ ActionDesk 路由与 Prompt 注入大盘验证通过');

console.log('[Scenario 41] 远洋水文动力学与恶劣天候遮蔽专锁测试全部通过！');