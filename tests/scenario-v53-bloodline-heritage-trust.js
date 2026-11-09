/**
 * WorldAxis tests/scenario-v53-bloodline-heritage-trust.js
 * 场景 53: 世系血脉信托、隐性诅咒显化与宗族继统专锁 (Bloodline Heritage & Trust Lock)
 * 
 * 验证闭环：
 * 1. 宗族建档：建立古老世家（含世代先祖诅咒、顺位继承人表、宗族信托密匣与不可撤销财产）；
 * 2. 负控制拦截：冒名顶替或血脉纯度不足且无印鉴者强取信托密匣（refusal: 'bloodline-mismatch-unauthorized'）；
 * 3. 先祖信物与合法血统继承人开启信托密匣（claim_trust），遗产与宗主权正式转移；
 * 4. 先祖诅咒代际显化（manifest_curse），严重程度累积演变；
 * 5. 顺位法定继承人正常承袭爵位家业（resolve_succession）；
 * 6. 继承人绝嗣负控制拦截（refusal: 'succession-extinction-crisis'）；
 * 7. ActionDesk: bloodline.transactLineage 路由穿透验证；
 * 8. BloodlineHeritage buildBlock 提示词生成验证。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/bloodline-heritage.js');
require('../engines/action-desk.js');
WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 53] 开始执行世系血脉信托、隐性诅咒显化与宗族继统专锁测试...');

// 1. 宗族建档
const regRes = WA.bloodlineHeritage.registerClan('clan_valerius', {
  name: '瓦勒留斯黄金世家',
  patriarch: '凯撒·老瓦勒留斯',
  generation: 4,
  curse: '血蚀暗狂 (Blood-Rot Frenzy)',
  curseSeverity: 20,
  trustWealth: 50000,
  secretItem: '瓦勒留斯原初血玉印玺',
  members: ['heir_aurelius', 'bastard_cassian'],
  successionOrder: ['heir_aurelius']
});
assert.strictEqual(regRes.ok, true);
assert.strictEqual(regRes.clan.trustVault.locked, true);
console.log('✓ 1. 古老世家世系档案与不可撤销信托密匣建立成功');

// 2. 破坏性负控制：冒名私生子/外系无凭证强启密匣必遭拒绝
const fraudRes = WA.bloodlineHeritage.transactLineage('claim_trust', {
  clanId: 'clan_valerius',
  claimantId: 'bastard_cassian',
  bloodMatchPct: 35,
  hasSealToken: false
});
assert.strictEqual(fraudRes.ok, false);
assert.strictEqual(fraudRes.refusal, 'bloodline-mismatch-unauthorized');
console.log('✓ 2. 低血脉纯度且无信物强行夺匣负控制精准拦截 (bloodline-mismatch-unauthorized)');

// 3. 正统顺位继承人出示信物合法继统密匣
const legitimateRes = WA.bloodlineHeritage.transactLineage('claim_trust', {
  clanId: 'clan_valerius',
  claimantId: 'heir_aurelius',
  bloodMatchPct: 95,
  hasSealToken: true
});
assert.strictEqual(legitimateRes.ok, true);
assert.strictEqual(legitimateRes.inheritedWealth, 50000);
assert.strictEqual(legitimateRes.inheritedItem, '瓦勒留斯原初血玉印玺');
assert.strictEqual(legitimateRes.newPatriarch, 'heir_aurelius');
console.log('✓ 3. 正统血脉与先祖信物开启信托密匣并继任宗主');

// 4. 先祖诅咒代际显化爆发
const curseRes = WA.bloodlineHeritage.transactLineage('manifest_curse', {
  clanId: 'clan_valerius',
  targetMember: 'heir_aurelius',
  intensity: 50
});
assert.strictEqual(curseRes.ok, true);
assert.strictEqual(curseRes.newCurseSeverity >= 70, true);
assert.strictEqual(curseRes.symptoms.includes('Madness') || curseRes.symptoms.includes('Affliction'), true);
console.log('✓ 4. 先祖血蚀暗狂诅咒深层显化达标');

// 5. 顺位法定继承人承袭与绝嗣负控制
const succRes = WA.bloodlineHeritage.transactLineage('resolve_succession', {
  clanId: 'clan_valerius'
});
assert.strictEqual(succRes.ok, true);
assert.strictEqual(succRes.newHead, 'heir_aurelius');
assert.strictEqual(succRes.newGeneration, 5);

// 绝嗣判定：继承人队列已空
const extinctRes = WA.bloodlineHeritage.transactLineage('resolve_succession', {
  clanId: 'clan_valerius'
});
assert.strictEqual(extinctRes.ok, false);
assert.strictEqual(extinctRes.refusal, 'succession-extinction-crisis');
console.log('✓ 5. 法定承袭推进及直系绝嗣危机负控制拦截 (succession-extinction-crisis)');

// 6. ActionDesk 路由穿透验证
const deskRes = WA.actionDesk.plan('bloodline.transactLineage', {
  clanId: 'clan_valerius',
  opKind: 'manifest_curse',
  targetMember: 'heir_aurelius',
  intensity: 10
});
assert.strictEqual(deskRes.ok, true);
console.log('✓ 6. ActionDesk: bloodline.transactLineage 路由穿透验证成功');

// 7. buildBlock 提示词生成
const blk = WA.bloodlineHeritage.buildBlock();
assert.strictEqual(blk.includes('世家') || blk.includes('世系') || blk.includes('诅咒'), true);
console.log('✓ 7. BloodlineHeritage buildBlock 提示词生成验证通过');

console.log('Scenario 53 全部断言顺利通过！\n');
