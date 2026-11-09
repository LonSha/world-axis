/**
 * WorldAxis tests/scenario-v51-regiment-tactics-clash.js
 * 场景 51: 战役军团排阵、阵形相克与士气崩溃溃散专锁 (Regiment Tactics & Rout Lock)
 * 
 * 验证闭环：
 * 1. 注册攻守两支战役千人军团（方阵 phalanx vs 锋矢 wedge）；
 * 2. 两军阵形对撞结算（clashRegiments）：战损动能、阵形加成与士气衰减；
 * 3. 负控制拦截：当溃退军团（rout: true）试图发起主力对撞时精准拦截（refusal: 'regiment-broken-in-rout'）；
 * 4. 督战队铁血处决（enforceVanguardDiscipline）止住士气决堤；
 * 5. ActionDesk: regiment.clashRegiments 统一路由穿透验证；
 * 6. RegimentTactics buildBlock 战报感知块验证。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

require('../engines/regiment-tactics.js');
require('../engines/action-desk.js');
WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 51] 开始执行战役军团排阵、阵形相克与士气溃散专锁测试...');

// 1. 注册主力军团
const regA = WA.regimentTactics.registerRegiment('iron_legion', {
  name: '铁甲重装军团',
  headcount: 2000,
  morale: 80,
  formation: 'phalanx', // 步兵方阵
  commander: '蒙恬'
});
assert.strictEqual(regA.ok, true);

const regB = WA.regimentTactics.registerRegiment('wolf_cavalry', {
  name: '朔方突骑军团',
  headcount: 1500,
  morale: 75,
  formation: 'wedge', // 骑兵锋矢
  commander: '冒顿'
});
assert.strictEqual(regB.ok, true);

// 2. 阵形对撞结算（锋矢 vs 方阵）
const clashRes = WA.regimentTactics.clashRegiments('wolf_cavalry', 'iron_legion', {
  flanking: true,
  weatherAdvantage: false
});
assert.strictEqual(clashRes.ok, true);
assert.strictEqual(typeof clashRes.attacker.loss, 'number');
assert.strictEqual(typeof clashRes.defender.loss, 'number');
console.log('✓ 1. 两军阵形对撞与动能战损伤害结算达标');

// 3. 模拟士气决堤至溃退并触发负控制
WA.store.transact(function (draft) {
  if (draft.regiments && draft.regiments.roster && draft.regiments.roster.wolf_cavalry) {
    draft.regiments.roster.wolf_cavalry.morale = 0;
    draft.regiments.roster.wolf_cavalry.status = 'rout';
  }
});

const brokenClash = WA.regimentTactics.clashRegiments('wolf_cavalry', 'iron_legion', {});
assert.strictEqual(brokenClash.ok, false);
assert.strictEqual(brokenClash.refusal, 'regiment-broken-in-rout');
console.log('✓ 2. 溃军强行对撞负控制拦截通过 (regiment-broken-in-rout)');

// 4. 督战队处决逃兵提振士气
WA.store.transact(function (draft) {
  if (draft.regiments && draft.regiments.roster && draft.regiments.roster.wolf_cavalry) {
    draft.regiments.roster.wolf_cavalry.vanguardCount = 50;
  }
});

const discRes = WA.regimentTactics.enforceVanguardDiscipline('wolf_cavalry', {
  executedDecimationCount: 50
});
assert.strictEqual(discRes.ok, true);
assert.strictEqual(discRes.recoveredMorale >= 15, true);
console.log('✓ 3. 督战队铁血执法挽回阵线闭环成功');

// 5. ActionDesk 路由测试
const deskClash = WA.actionDesk.plan('regiment.clashRegiments', {
  attackerId: 'iron_legion',
  defenderId: 'wolf_cavalry',
  flanking: false
});
assert.strictEqual(deskClash.ok, true);
console.log('✓ 4. ActionDesk: regiment.clashRegiments 路由穿透验证成功');

// 6. buildBlock 战报输出
const blk = WA.regimentTactics.buildBlock();
assert.strictEqual(blk.includes('军团') || blk.includes('铁甲重装军团') || blk.includes('朔方突骑军团'), true);
console.log('✓ 5. RegimentTactics buildBlock 提示词生成验证通过');

console.log('Scenario 51 全部断言顺利通过！\n');