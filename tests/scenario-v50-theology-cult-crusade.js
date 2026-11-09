/**
 * WorldAxis tests/scenario-v50-theology-cult-crusade.js
 * 场景 50: 神权狂热布道、异端裁判清洗与圣战反噬专锁 (Theology Cult & Holy War Lock)
 * 
 * 验证闭环：
 * 1. 注册新神权教派（正统度、狂热度、世俗权势与圣物共鸣四维动力学）；
 * 2. 负控制拦截：在狂热度不足且无信众情况下强行发动圣战被拒（fervor-depleted-no-following）；
 * 3. 展开公开布道（preach）与圣仪献祭（ritual），提升信众狂热与共鸣；
 * 4. 异端审判裁判所（purge）清洗异己，查抄资财；
 * 5. 铸造圣遗物（sanctify_relic）确立精神心锚；
 * 6. 狂热达标后发动圣战（holy_war）席卷全境；
 * 7. ActionDesk 统一路由与 CascadeBus 调度验证。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

require('../engines/theology-cult.js');
require('../engines/action-desk.js');
require('../engines/cascade-bus.js');
WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 50] 开始执行神权狂热布道、异端裁判清洗与圣战反噬专锁测试...');

// 1. 注册神权实体
const reg = WA.theologyCult.registerSect('radiant_covenant', {
  sectName: '纯阳圣火宗',
  deityName: '大日天尊',
  orthodoxy: 70,
  fervor: 20, // 初始狂热度低
  secularInfluence: 30,
  miracleResonance: 15
});
assert.strictEqual(reg.ok, true);
assert.strictEqual(reg.sect.fervor, 20);

// 2. 负控制拦截：狂热度仅 20（< 60）强行发动圣战，严惩驳回
const holyWarFail = WA.theologyCult.conductTheologyOp('radiant_covenant', 'holy_war', {
  targetDomain: 'heretic_city'
});
assert.strictEqual(holyWarFail.ok, false);
assert.strictEqual(holyWarFail.refusal, 'fervor-depleted-no-following');
console.log('✓ 1. 狂热信众枯竭强行圣战负控制精准拦截 (fervor-depleted-no-following)');

// 3. 执行公开布道与圣仪献祭
const preachRes = WA.theologyCult.conductTheologyOp('radiant_covenant', 'preach', {
  converts: 30
});
assert.strictEqual(preachRes.ok, true);
assert.strictEqual(preachRes.newFervor > 20, true);

const ritualRes = WA.theologyCult.conductTheologyOp('radiant_covenant', 'ritual', {
  sacrificeValue: 500
});
assert.strictEqual(ritualRes.ok, true);
assert.strictEqual(ritualRes.fervor >= 30, true);
console.log('✓ 2. 公开布道与圣仪大幅激发狂热动力学达标');

// 4. 异端审判所清洗
const purgeRes = WA.theologyCult.conductTheologyOp('radiant_covenant', 'purge', {
  severity: 5,
  targetActorId: 'heretic_preacher',
  charges: '密谋勾结外魔动摇圣道正统'
});
assert.strictEqual(purgeRes.ok, true);
console.log('✓ 3. 异端裁判所清洗异己与正统度拔高闭环成功');

// 5. 加持圣物
const relicRes = WA.theologyCult.conductTheologyOp('radiant_covenant', 'sanctify_relic', {
  relicName: '太阴灭度金轮'
});
assert.strictEqual(relicRes.ok, true);
assert.strictEqual(relicRes.miracleResonance > 15, true);

// 提高狂热度以达到圣战阈值（>= 60）
WA.theologyCult.conductTheologyOp('radiant_covenant', 'ritual', { sacrificeValue: 1000 });
WA.theologyCult.conductTheologyOp('radiant_covenant', 'ritual', { sacrificeValue: 1000 });

// 6. 狂热达标后发动圣战
const holyWarOk = WA.theologyCult.conductTheologyOp('radiant_covenant', 'holy_war', {
  targetDomain: 'heretic_city'
});
assert.strictEqual(holyWarOk.ok, true);
console.log('✓ 4. 狂热圣战席卷敌对信仰区域闭环成功');

// 7. ActionDesk 路由调用验证
const deskRes = WA.actionDesk.plan('theology.conductTheologyOp', {
  sectId: 'radiant_covenant',
  opKind: 'preach',
  converts: 10
});
assert.strictEqual(deskRes.ok, true);
console.log('✓ 5. ActionDesk: theology.conductTheologyOp 统一路由穿透验证通过');

// 8. buildBlock 提示词生成
const block = WA.theologyCult.buildBlock();
console.log('block debug content:', JSON.stringify(block));
assert.strictEqual(block.includes('纯阳圣火宗') || block.includes('radiant_covenant'), true);
console.log('✓ 6. TheologyCult buildBlock 提示词感知块注入通过');

console.log('Scenario 50 全部断言顺利通过！\n');