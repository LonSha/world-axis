/**
 * WorldAxis tests/scenario-v24-panic-cover-ballistics.js (v2.330.0)
 *
 * 场景 24 专锁：火灾避难所恐慌踩踏与掩体弹道防御锁
 *
 * 贯通引擎与机制闭环：
 *  1. 突发灾难与异步高优先级中断 (cascade-bus OPV16-2):
 *     大厅突发大火，四层总线触发 8 级紧急中断，清空下三层常规行动；
 *  2. 群体恐慌共振与踩踏挤压 (crowd-panic EXV16-5):
 *     封闭避难大厅内人群焦虑度相互传染，密度达 3.5人/m²，引发恶性踩踏与出口阻塞 (chokeLocked: true)；
 *  3. 掩体材质阻滞力与动能弹道防御 (cover-ballistics EXV16-8):
 *     燃烧横梁爆裂飞溅重型破片（动能 120），角色躲在加厚石墙后 (reinforced_stone, 阻滞力 200)，
 *     有效完全吸收动能冲击，穿透残余伤害为 0；
 *     若躲藏在薄实木掩体后 (wood_barrier, 阻滞力 35)，破片强力穿透造成 85 点致命穿透伤害；
 *  4. 5 项真实破坏性负控制硬门禁：
 *     - [NC-1] 低优先级杂音（priority < 3）绝不触发中断 (interrupted: false)
 *     - [NC-2] 开阔平原宽松人流绝不触发踩踏 (isOpenField && density < 1.0)
 *     - [NC-3] 缺节点标识计算踩踏拒收 (missing_zone_id)
 *     - [NC-4] 薄木板面对重型投射物断言必须发生穿透造成残余伤害 (penetrated: true)
 *     - [NC-5] 坚固石墙面对中重度破片穿透伤害恒为 0 (penetrated: false)
 */
'use strict';
const assert = require('assert');
const path = require('path');
require('./mock.js');

const cascadeBus = require('../engines/cascade-bus.js');
const crowdPanic = require('../engines/crowd-panic.js');
const coverBallistics = require('../engines/cover-ballistics.js');

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

console.log('=== 开始执行 V16 场景 24 专锁：火灾避难所恐慌踩踏与掩体弹道防御锁 ===');

// 1. 突发火灾与总线高优先级抢占中断 (OPV16-2)
it('1.1 避难大厅突发猛烈火灾，四层总线触发 8 级紧急优先级抢占中断', () => {
  cascadeBus.resetAll();
  const res = cascadeBus.interrupt(8, {
    emergencyType: 'conflagration',
    reason: 'hall_fire_breakout'
  });
  assert.ok(res.ok, '中断处理成功');
  assert.strictEqual(res.interrupted, true, '高优先级中断生效');
  assert.strictEqual(res.priority, 8);
  assert.strictEqual(res.interruptRecord.emergencyType, 'conflagration');
});

// 2. 空间封闭群体恐慌共振与出口踩踏 (EXV16-5)
it('2.1 封闭大厅人流密度飙升至 3.5人/m²，恐慌共振导致出口恶性阻塞与踩踏', () => {
  crowdPanic.resetAll();
  const panicRes = crowdPanic.triggerStampede({
    zoneId: 'grand_hall_exit',
    panicSourceSeverity: 8,
    crowdDensity: 3.5,
    exitCapacity: 2,
    participants: ['npc_1', 'npc_2', 'npc_3', 'npc_4', 'npc_5']
  });

  assert.ok(panicRes.ok, '踩踏推演成功');
  assert.strictEqual(panicRes.chokeLocked, true, '出口发生恶性拥堵闭锁');
  assert.ok(panicRes.panicLevel > 60, '恐慌共振指数突破临界');
  assert.ok(panicRes.casualtiesCount > 0, '发生群体踩踏致伤');
});

// 3. 掩体物理阻滞力与动能破片防护 (EXV16-8)
it('3.1 爆炸产生 120 动能重破片，厚花岗岩掩体完全吸收阻断', () => {
  coverBallistics.resetAll();
  coverBallistics.registerCoverNode('stone_pillar', 'reinforced_stone', 300);

  const stoneDef = coverBallistics.resolveCoverProtection({
    targetId: 'hero_survivor',
    coverMaterial: 'reinforced_stone',
    coverNodeId: 'stone_pillar',
    projectileEnergy: 120
  });

  assert.ok(stoneDef.ok, '掩体防护结算成功');
  assert.strictEqual(stoneDef.penetrationOccurred, false, '未穿透花岗岩掩体');
  assert.strictEqual(stoneDef.residualDamage, 0, '残余动能杀伤为 0');
  assert.strictEqual(stoneDef.absorbedDamage, 120, '动能被全额吸收');
});

it('3.2 同样 120 动能破片射向薄木板障，木板被暴力穿透并造成 85 点残余伤害', () => {
  coverBallistics.registerCoverNode('wood_partition', 'wood_barrier', 50);

  const woodDef = coverBallistics.resolveCoverProtection({
    targetId: 'npc_behind_wood',
    coverMaterial: 'wood_barrier',
    coverNodeId: 'wood_partition',
    projectileEnergy: 120
  });

  assert.ok(woodDef.ok, '木掩体防护结算完成');
  assert.strictEqual(woodDef.penetrationOccurred, true, '薄木掩体被暴力穿透');
  assert.strictEqual(woodDef.residualDamage, 85, '120 动能 - 35 阻滞力 = 85 残余杀伤');
});

// 4. 破坏性负控制硬门禁
it('4.1 [NC-1] 低优先级杂音（priority < 3）绝不触发中断 (interrupted: false)', () => {
  const lowRes = cascadeBus.interrupt(2, { reason: 'minor_door_creak' });
  assert.ok(lowRes.ok);
  assert.strictEqual(lowRes.interrupted, false, '低优先级被硬拦截');
});

it('4.2 [NC-2] 开阔平原宽松人流绝不触发踩踏 (isOpenField && density < 1.0)', () => {
  const res = crowdPanic.triggerStampede({
    zoneId: 'open_steppe',
    panicSourceSeverity: 5,
    crowdDensity: 0.4,
    isOpenField: true
  });
  assert.ok(res.ok);
  assert.strictEqual(res.chokeLocked, false, '开阔平原不拥堵');
  assert.strictEqual(res.casualties.length, 0, '零踩踏伤亡');
});

it('4.3 [NC-3] 缺节点标识计算踩踏拒收 (missing_zone_id)', () => {
  const res = crowdPanic.triggerStampede({ zoneId: '' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'missing_zone_id');
});

it('4.4 [NC-4] 薄木板面对重型投射物断言必须发生穿透造成残余伤害 (penetrated: true)', () => {
  const res = coverBallistics.resolveCoverProtection({
    targetId: 'target_behind_wood',
    coverMaterial: 'wood_barrier',
    projectileEnergy: 50
  });
  assert.strictEqual(res.penetrationOccurred, true, '必须穿透薄木板');
  assert.ok(res.residualDamage > 0, '必须产生真实伤损');
});

it('4.5 [NC-5] 坚固石墙面对中重度破片穿透伤害恒为 0 (penetrated: false)', () => {
  const res = coverBallistics.resolveCoverProtection({
    targetId: 'target_behind_stone',
    coverMaterial: 'reinforced_stone',
    projectileEnergy: 100
  });
  assert.strictEqual(res.penetrationOccurred, false);
  assert.strictEqual(res.residualDamage, 0);
});

console.log(`=== 场景 24 专锁测试完成：通过 ${passed} 项，失败 ${failed} 项 ===`);
if (failed > 0) process.exit(1);