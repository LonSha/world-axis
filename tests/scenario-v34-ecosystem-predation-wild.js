/**
 * tests/scenario-v34-ecosystem-predation-wild.js
 * V18 场景 34 专锁：风雪荒原狼群猎食与篝火御兽专锁
 *
 * 验证目标：
 *  1. 荒野生物饥饿驱力与食物链（狼群围猎野鹿、掠食草食生物平衡）；
 *  2. 营地明火与篝火防御（campfire）产生心理畏火退避机制；
 *  3. 暴雪极端气候猎物灭绝后，极度饥饿兽群绝境越界突袭边境岗哨；
 *  4. 真实破坏性负控制硬门禁：饱腹兽群遇篝火绝对无法主动突击、虚构非法区域断言拒收。
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

const ecosystemPredation = require('../engines/ecosystem-predation.js');
WA.ecosystemPredation = ecosystemPredation;

console.log('=== 开始执行 V18 场景 34 专锁：风雪荒原狼群猎食与篝火御兽 ===');

// 1. 初始化风雪雪原生态区
WA.ecosystemPredation.resetAll();
WA.ecosystemPredation.registerEcosystem('frost_steppe_valley', {
  preyPopulation: 100,
  scavengerCount: 20,
  hasActiveCampfire: true
});

// 2. 负控制验证 [NC-1]：野兽饱腹 (hunger <= 20) 且有篝火御兽，绝对拦截突袭
console.log('正在执行负控制 [NC-1]：饱食野兽遇篝火排斥拒战门禁...');
const repelledSated = WA.ecosystemPredation.simulatePredation({
  regionId: 'frost_steppe_valley',
  packId: 'sated_wolf_pack',
  initialHunger: 15,
  hungerDelta: 0,
  campfirePresent: true
});
assert.strictEqual(repelledSated.ok, false);
assert.strictEqual(repelledSated.reason, 'sated-beasts-repelled-by-fire');
console.log('  ✓ [NC-1] 饱兽遇火退避拒攻门禁通过！');

// 3. 正向流程 1：野狼群体协作捕杀野鹿群 (hunted_prey)，自然生态掠食平息饥饿
console.log('正在验证正向流程 1：荒野狼群捕食野鹿平息饥饿...');
const huntResult = WA.actionDesk.plan('wild.simulatePredation', {
  regionId: 'frost_steppe_valley',
  packId: 'steppe_grey_wolves',
  initialHunger: 60,
  hungerDelta: 0,
  campfirePresent: false,
  bloodSpill: 20
});
assert.strictEqual(huntResult.ok, true);
assert.strictEqual(huntResult.actionTaken, 'hunted_prey');
assert(huntResult.preyConsumed > 0, '必须扣减并消耗猎物数量');
const currentEco = WA.ecosystemPredation.getEcosystem('frost_steppe_valley');
assert(currentEco.preyPopulation < 100, '雪原野鹿种群应当因捕食下降');
assert(currentEco.scavengerCount > 20, '血腥味引来食腐鸦群与鬣狗聚集');
console.log('  ✓ 自然捕食结算成功，剩余猎物：', currentEco.preyPopulation);

// 4. 正向流程 2：暴风雪肆虐猎物冻死断绝，极饿狼群狂暴袭村 (raided_settlement)
console.log('正在验证正向流程 2：天灾绝境逼迫饥饿兽群袭击边境岗哨...');
// 将猎物消耗殆尽，并拉满风雪天灾
WA.ecosystemPredation.registerEcosystem('frost_steppe_valley', {
  preyPopulation: 10,
  scavengerCount: 50,
  hasActiveCampfire: false
});
const raidResult = WA.actionDesk.plan('wild.simulatePredation', {
  regionId: 'frost_steppe_valley',
  packId: 'starving_alpha_pack',
  initialHunger: 85,
  weatherSevere: true,
  hungerDelta: 10, // 饥饿度冲破 85
  campfirePresent: false,
  targetSettlement: 'iron_watch_post'
});
assert.strictEqual(raidResult.ok, true);
assert.strictEqual(raidResult.actionTaken, 'raided_settlement');
assert(raidResult.summary.includes('iron_watch_post'), '必须记录绝境越界袭击人类哨所');
console.log('  ✓ 绝境兽群袭哨推演成功：', raidResult.summary);

// 5. 负控制验证 [NC-2]：非法空区域 id 拒收
console.log('正在执行负控制 [NC-2]：未指定生态区域拒收门禁...');
const invalidRegion = WA.ecosystemPredation.simulatePredation({
  regionId: ''
});
assert.strictEqual(invalidRegion.ok, false);
assert.strictEqual(invalidRegion.reason, 'missing-region-id');
console.log('  ✓ [NC-2] 非法区域校验门禁通过！');

console.log('=== 场景 34 专锁校验总结 ===');
console.log('通过: 5 项断言 (含 2 项真负控制门禁), 失败: 0 项');