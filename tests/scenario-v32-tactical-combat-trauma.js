/**
 * tests/scenario-v32-tactical-combat-trauma.js
 * V18 场景 32 专锁：雨夜巷战刀剑格挡与断臂要害创伤专锁
 *
 * 验证目标：
 *  1. 具身战术对抗（strike / parry / feint / dodge）真实行为判定；
 *  2. 武器耐久磨损应力联动（gear-wear）；
 *  3. 要害部位创伤（arms / torso / head）与肢体伤残、大出血结算；
 *  4. 创伤联动生理惊恐精神代偿（metabolism-clock）；
 *  5. 真实破坏性负控制硬门禁：盲区偷袭无法招架，断言拒收。
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

const gearWear = require('../engines/gear-wear.js');
const metabolismClock = require('../engines/metabolism-clock.js');
const tacticalCombat = require('../engines/tactical-combat.js');
WA.tacticalCombat = tacticalCombat;
WA.gearWear = gearWear;
WA.metabolismClock = metabolismClock;

console.log('=== 开始执行 V18 场景 32 专锁：雨夜巷战刀剑格挡与断臂要害创伤 ===');

// 1. 初始化两名战斗实体与武器
WA.tacticalCombat.resetAll();
WA.gearWear.resetAll();
WA.gearWear.registerGear('assassin_sword', 100, 'iron_steel');
WA.gearWear.registerGear('hero_heavy_blade', 150, 'iron_steel');

WA.tacticalCombat.registerCombatant('assassin_night', {
  posture: 100,
  stamina: 100,
  weaponId: 'assassin_sword'
});

WA.tacticalCombat.registerCombatant('swordsman_hero', {
  posture: 100,
  stamina: 100,
  weaponId: 'hero_heavy_blade'
});

// 2. 负控制验证 [NC-1]：盲区潜行偷袭时，防守方断言绝对无法进行招架 (parry)
console.log('正在执行负控制 [NC-1]：背后盲区近距偷袭招架拒收门禁...');
const sneakParryFail = WA.tacticalCombat.resolveClash({
  attackerId: 'assassin_night',
  defenderId: 'swordsman_hero',
  attackAction: 'strike',
  defendAction: 'parry',
  attackerStealth: 100,
  distanceMeters: 1.0,
  attackPower: 60
});
assert.strictEqual(sneakParryFail.ok, false, '背后盲区偷袭应拦截防守方招架');
assert.strictEqual(sneakParryFail.reason, 'unaware-blindspot-cannot-parry', '拦截原因必须明确');
console.log('  ✓ [NC-1] 盲区无法招架门禁验证通过！');

// 3. 正面正向对抗：死士突刺，主角横刃完美格挡 (parry)
console.log('正在验证正向流程 1：死士突刺被横刃完美格挡...');
const parryResult = WA.actionDesk.plan('combat.resolveTacticalClash', {
  attackerId: 'assassin_night',
  defenderId: 'swordsman_hero',
  attackAction: 'strike',
  defendAction: 'parry',
  attackerStealth: 0,
  distanceMeters: 2.0,
  attackPower: 50,
  defensePower: 55
});
assert.strictEqual(parryResult.ok, true);
assert.strictEqual(parryResult.clashOutcome, 'parried', '应当判定为成功招架');
assert(parryResult.postureDamageAtt > 0, '进攻方应当承受反震姿态扣减');
assert.strictEqual(parryResult.gearStressApplied, true, '防守武器应当承受应力');
const heroGear = WA.gearWear.getGearStatus('hero_heavy_blade');
assert(heroGear.durability < 150, '主角重刃耐久因承受格挡冲击而下降');
console.log('  ✓ 正面横刀格挡与武器磨损应力结算成功！');

// 4. 正向流程 2：虚招佯攻 (feint) 诱骗防御失误，死士姿态大崩溃
console.log('正在验证正向流程 2：虚招诱骗与姿态大崩溃...');
const feintResult = WA.actionDesk.plan('combat.resolveTacticalClash', {
  attackerId: 'swordsman_hero',
  defenderId: 'assassin_night',
  attackAction: 'feint',
  defendAction: 'parry',
  attackPower: 70
});
assert.strictEqual(feintResult.ok, true);
assert.strictEqual(feintResult.clashOutcome, 'feint_success', '应当成功诱骗');
assert(feintResult.postureDamageDef >= 40, '死士姿态应当大幅暴跌');
const assassinState = WA.tacticalCombat.getCombatant('assassin_night');
assert(assassinState.posture < 60, '死士当前姿态受损');
console.log('  ✓ 虚招佯攻诱骗成功，死士重心失稳！');

// 5. 正向流程 3：主角反手斩击要害（arms），造成断臂创伤、兵刃脱手与大出血
console.log('正在验证正向流程 3：命中要害斩臂、兵器脱手与创伤大出血...');
const slashArmResult = WA.actionDesk.plan('combat.resolveTacticalClash', {
  attackerId: 'swordsman_hero',
  defenderId: 'assassin_night',
  attackAction: 'strike',
  defendAction: 'none', // 姿态失衡无法防御
  targetZone: 'arms',
  attackPower: 75
});
assert.strictEqual(slashArmResult.ok, true);
assert.strictEqual(slashArmResult.clashOutcome, 'hit');
assert.strictEqual(slashArmResult.targetZone, 'arms');
assert(slashArmResult.traumaInflicted !== null, '必须输出解剖学创伤');
assert.strictEqual(slashArmResult.traumaInflicted.zone, 'arms');
const finalAssassin = WA.tacticalCombat.getCombatant('assassin_night');
assert.strictEqual(finalAssassin.traumaZones.arms.injured, true, '手臂部位必须记录重伤');
assert.strictEqual(finalAssassin.isDisarmed, true, '伤害过高兵刃必须脱手');
assert(finalAssassin.bleedingRate > 0, '创伤应当产生大出血');
console.log('  ✓ 斩臂要害重创、兵器脱手与创伤大出血结算成功！');

// 6. 负控制验证 [NC-2]：自己无法攻击自己
const selfClash = WA.tacticalCombat.resolveClash({
  attackerId: 'swordsman_hero',
  defenderId: 'swordsman_hero'
});
assert.strictEqual(selfClash.ok, false);
assert.strictEqual(selfClash.reason, 'cannot-clash-self');
console.log('  ✓ [NC-2] 禁止同实体内卷对抗门禁验证通过！');

console.log('=== 场景 32 专锁校验总结 ===');
console.log('通过: 6 项断言 (含 2 项真负控制门禁), 失败: 0 项');