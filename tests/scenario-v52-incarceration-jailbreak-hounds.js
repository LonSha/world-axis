/**
 * WorldAxis tests/scenario-v52-incarceration-jailbreak-hounds.js
 * 场景 52: 司法刑狱收押、地道越狱与猎犬追缉专锁 (Incarceration & Bloodhound Jailbreak Lock)
 * 
 * 验证闭环：
 * 1. 收押重刑犯进入四级高戒备牢狱（death_row）；
 * 2. 负控制拦截：零违禁品且零准备强行越狱，严厉驳回并触发警报（refusal: 'maximum-security-lockdown'）；
 * 3. 推进越狱准备（advanceEscapePrep）：收买狱卒、违禁走私工具、暗中挖掘地道；
 * 4. 越狱行动结算（jailbreak）；
 * 5. 警报封锁与猎犬巡捕追缉（pursue）：水路隐匿气味斩断追踪闭环；
 * 6. ActionDesk: prison.executeJailOp 统一路由穿透验证；
 * 7. IncarcerationJailbreak buildBlock 监狱态势感知块生成。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

require('../engines/incarceration-jailbreak.js');
require('../engines/action-desk.js');
WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 52] 开始执行司法刑狱收押、地道越狱与猎犬追缉专锁测试...');

// 1. 收押重囚至死囚牢房
const admitRes = WA.incarcerationJailbreak.admitPrisoner('fugitive_blade', {
  facilityName: '幽冥铁牢',
  custodyType: 'death_row',
  securityLevel: 4,
  name: '断刃'
});
assert.strictEqual(admitRes.ok, true);
assert.strictEqual(admitRes.inmate.custodyType, 'death_row');
console.log('✓ 1. 高危重囚收押与监狱安全层级配置达标');

// 2. 负控制拦截：零准备强行越狱，严格驳回
const escapeFail = WA.incarcerationJailbreak.executeJailOp('jailbreak', {
  actorId: 'fugitive_blade',
  bruteForce: true
});
assert.strictEqual(escapeFail.ok, false);
assert.strictEqual(escapeFail.refusal, 'maximum-security-lockdown');
console.log('✓ 2. 极高戒备零准备强行越狱负控制精准拦截 (maximum-security-lockdown)');

// 3. 展开越狱筹备：调回普通牢房，收买狱卒、私藏铁镐、挖掘地道
WA.store.transact(function (draft) {
  if (draft.prisonSystem && draft.prisonSystem.inmates && draft.prisonSystem.inmates.fugitive_blade) {
    draft.prisonSystem.inmates.fugitive_blade.custodyType = 'general';
  }
});

const bribeRes = WA.incarcerationJailbreak.advanceEscapePrep('fugitive_blade', 'bribe_guard', {
  amount: 200
});
assert.strictEqual(bribeRes.ok, true);

const toolRes = WA.incarcerationJailbreak.advanceEscapePrep('fugitive_blade', 'smuggle_tool', {
  tool: '精钢破壁锥'
});
assert.strictEqual(toolRes.ok, true);

const digRes = WA.incarcerationJailbreak.advanceEscapePrep('fugitive_blade', 'dig_tunnel', {
  effort: 20
});
assert.strictEqual(digRes.ok, true);
console.log('✓ 3. 狱政收买、违禁工具走私与地道挖掘多维推进成功');

// 4. 实施密谋越狱行动
const breakRes = WA.incarcerationJailbreak.executeJailOp('jailbreak', {
  actorId: 'fugitive_blade',
  tunnelEscape: true,
  testRoll: 1
});
assert.strictEqual(breakRes.ok, true);
assert.strictEqual(breakRes.escaped, true);
console.log('✓ 4. 地道破拆与亡命越狱成功');

// 5. 狱卒搜捕队与猎犬追踪判定（通过涉水切断气味）
const chaseRes = WA.incarcerationJailbreak.executeJailOp('pursue', {
  actorId: 'fugitive_blade',
  crossedWater: true,
  scentMaskUsed: true,
  testRoll: 90
});
assert.strictEqual(chaseRes.ok, true);
assert.strictEqual(chaseRes.recaptured, false);
console.log('✓ 5. 涉水渡河斩断猎犬气味搜捕链达标');

// 6. ActionDesk 路由测试（收押新囚犯并推进违禁品走私）
const deskAdmit = WA.actionDesk.plan('prison.executeJailOp', {
  actorId: 'desk_conspirator',
  opKind: 'admit',
  facilityName: '幽冥铁牢',
  custodyType: 'medium',
  securityLevel: 2
});
assert.strictEqual(deskAdmit.ok, true);

const deskRes = WA.actionDesk.plan('prison.executeJailOp', {
  actorId: 'desk_conspirator',
  opKind: 'prep',
  prepKind: 'smuggle_tool',
  tool: '绳钩'
});
assert.strictEqual(deskRes.ok, true);
console.log('✓ 6. ActionDesk: prison.executeJailOp 路由穿透验证成功');

// 7. buildBlock 监狱感知块输出
const blk = WA.incarcerationJailbreak.buildBlock();
assert.strictEqual(blk.includes('刑狱') || blk.includes('通缉') || blk.includes('要犯'), true);
console.log('✓ 7. IncarcerationJailbreak buildBlock 提示词生成验证通过');

console.log('Scenario 52 全部断言顺利通过！\n');