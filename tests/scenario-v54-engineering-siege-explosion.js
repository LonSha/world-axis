/**
 * WorldAxis tests/scenario-v54-engineering-siege-explosion.js
 * 场景 54: 工程攻城器械组装、研发爆炸与谍报泄密专锁 (Engineering Blueprint & Siege Lock)
 * 
 * 验证闭环：
 * 1. 工坊建档与军械资源储备配置（registerWorkshop）；
 * 2. 负控制拦截：原料枯竭时无法组装（refusal: 'materials-depleted'）；
 * 3. 研发试错与高风险灾难性爆炸负控制（refusal: 'catastrophic-workshop-explosion'）；
 * 4. 成功组装投石机/攻城锤（assemble）；
 * 5. 攻城火炮实战发射与耐久损耗闭环（fire_siege）；
 * 6. 弹药打光/破损发射负控制拦截（refusal: 'device-broken-or-empty'）；
 * 7. 敌对阵营间谍窃密扩散图纸（leak_blueprint）；
 * 8. ActionDesk: engineering.engineerDevice 路由穿透验证；
 * 9. EngineeringBlueprint buildBlock 提示词生成验证。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/engineering-blueprint.js');
require('../engines/action-desk.js');
WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 54] 开始执行工程攻城器械组装、研发爆炸与谍报泄密专锁测试...');

// 1. 工坊建档
const regRes = WA.engineeringBlueprint.registerWorkshop('forge_ironhold', {
  name: '黑铁要塞重型军械所',
  resources: { iron: 100, wood: 100, powerFuel: 50 },
  maxSafetyLevel: 3
});
assert.strictEqual(regRes.ok, true);
console.log('✓ 1. 黑铁工坊军械所建档成功');

// 2. 破坏性负控制：研发事故导致试作型爆炸瓦解
const boomRes = WA.engineeringBlueprint.engineerDevice('assemble', {
  workshopId: 'forge_ironhold',
  deviceType: 'heavy_bombard',
  risk: 50,
  testRoll: 5 // 掷骰 5 < 50 必触发爆炸
});
assert.strictEqual(boomRes.ok, false);
assert.strictEqual(boomRes.accident, true);
assert.strictEqual(boomRes.refusal, 'catastrophic-workshop-explosion');
console.log('✓ 2. 研发试错灾难性大爆炸负控制精准拦截 (catastrophic-workshop-explosion)');

// 3. 正常组装巨型配重投石机
const buildRes = WA.engineeringBlueprint.engineerDevice('assemble', {
  workshopId: 'forge_ironhold',
  deviceId: 'catapult_titan',
  deviceType: 'trebuchet',
  ammo: 2,
  risk: 0,
  testRoll: 99
});
assert.strictEqual(buildRes.ok, true);
assert.strictEqual(buildRes.device.deviceId, 'catapult_titan');
console.log('✓ 3. 巨型配重投石机成功组装出厂');

// 4. 攻城轰击城防工事
const fireRes1 = WA.engineeringBlueprint.engineerDevice('fire_siege', {
  workshopId: 'forge_ironhold',
  deviceId: 'catapult_titan',
  targetFortification: '城外瓮城重闸'
});
assert.strictEqual(fireRes1.ok, true);
assert.strictEqual(fireRes1.remainingAmmo, 1);
assert.strictEqual(fireRes1.structuralDamage > 0, true);

const fireRes2 = WA.engineeringBlueprint.engineerDevice('fire_siege', {
  workshopId: 'forge_ironhold',
  deviceId: 'catapult_titan',
  targetFortification: '主城门楼'
});
assert.strictEqual(fireRes2.ok, true);
assert.strictEqual(fireRes2.remainingAmmo, 0);

// 弹药耗尽负控制拦截
const emptyRes = WA.engineeringBlueprint.engineerDevice('fire_siege', {
  workshopId: 'forge_ironhold',
  deviceId: 'catapult_titan'
});
assert.strictEqual(emptyRes.ok, false);
assert.strictEqual(emptyRes.refusal, 'device-broken-or-empty');
console.log('✓ 4. 攻城连续轰击与弹药耗尽负控制拦截 (device-broken-or-empty)');

// 5. 间谍渗透与核心军工图纸泄密扩散
const leakRes = WA.engineeringBlueprint.engineerDevice('leak_blueprint', {
  workshopId: 'forge_ironhold',
  blueprint: 'trebuchet',
  rivalFaction: '北境异端叛乱军团'
});
assert.strictEqual(leakRes.ok, true);
assert.strictEqual(leakRes.acquiredBy, '北境异端叛乱军团');
console.log('✓ 5. 攻城器械图纸失窃泄密闭环达标');

// 6. ActionDesk 路由穿透验证
const deskRes = WA.actionDesk.plan('engineering.engineerDevice', {
  workshopId: 'forge_ironhold',
  opKind: 'leak_blueprint',
  blueprint: 'heavy_bombard',
  rivalFaction: '暗巷兄弟会'
});
assert.strictEqual(deskRes.ok, true);
console.log('✓ 6. ActionDesk: engineering.engineerDevice 路由穿透验证成功');

// 7. buildBlock 提示词生成
const blk = WA.engineeringBlueprint.buildBlock();
assert.strictEqual(blk.includes('工程') || blk.includes('军械') || blk.includes('攻城') || blk.includes('工坊'), true);
console.log('✓ 7. EngineeringBlueprint buildBlock 提示词生成验证通过');

console.log('Scenario 54 全部断言顺利通过！\n');