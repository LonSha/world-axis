/**
 * tests/scenario-v36-ruin-mechanism-trap.js
 * V18 场景 36 专锁：远古地宫地砖连环陷阱与自毁逃生专锁
 *
 * 验证目标：
 *  1. 远古遗迹机关密码轮盘与地砖重力陷阱（solve_cipher / disarm_wire / use_key）；
 *  2. 破解失误触发暗弩、断龙石封路与流沙自毁倒计时（selfDestructActive & countdownTurns）；
 *  3. 正统秘钥或顶级技巧成功拆解排障；
 *  4. 真实破坏性负控制硬门禁：持正统秘钥绝不触发自毁、已被彻底塌陷遗迹断言拒收。
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

const ruinMechanism = require('../engines/ruin-mechanism.js');
WA.ruinMechanism = ruinMechanism;

console.log('=== 开始执行 V18 场景 36 专锁：远古地宫地砖连环陷阱与自毁逃生 ===');

// 1. 初始化遗迹机关室
WA.ruinMechanism.resetAll();
WA.ruinMechanism.registerRuinMechanism('ruin_crypt_vault', {
  trapKind: 'environmental_deluge',
  difficultyRating: 70,
  countdownTurns: 3,
  hasMasterKey: true
});

// 2. 负控制验证 [NC-1]：持有正统金匙，断言绝不触发环境自毁
console.log('正在执行负控制 [NC-1]：持有真传秘钥绝不触发自毁门禁...');
const keyedSafe = WA.ruinMechanism.triggerMechanism({
  ruinNodeId: 'ruin_crypt_vault',
  hasMasterKey: true,
  forceSelfDestruct: true
});
assert.strictEqual(keyedSafe.ok, false);
assert.strictEqual(keyedSafe.reason, 'disarmed-or-keyed-cannot-detonate');
console.log('  ✓ [NC-1] 正统秘钥免疫自毁门禁通过！');

// 3. 正向流程 1：盲目暴力破解 (skill: 20)，触发机关警报与注水自毁倒计时
console.log('正在验证正向流程 1：低技能解密触发连环流沙自毁陷阱...');
WA.ruinMechanism.registerRuinMechanism('ruin_trapped_antechamber', {
  trapKind: 'environmental_deluge',
  difficultyRating: 80,
  countdownTurns: 3,
  hasMasterKey: false
});
const failAttempt = WA.actionDesk.plan('ruin.triggerMechanism', {
  ruinNodeId: 'ruin_trapped_antechamber',
  actionKind: 'solve_cipher',
  skillRating: 20
});
assert.strictEqual(failAttempt.ok, true);
assert.strictEqual(failAttempt.trapTriggered, true);
assert.strictEqual(failAttempt.selfDestructActive, true);
assert(failAttempt.turnsRemaining > 0, '必须开启倒计时轮次');
console.log('  ✓ 破解失误触发自毁，倒计时启动：', failAttempt.turnsRemaining, '轮');

// 4. 正向流程 2：大工匠高超技巧拆线排障 (disarm_wire, skill: 95)
console.log('正在验证正向流程 2：高超拆解技巧逆转乾坤解除自毁...');
const disarmSuccess = WA.actionDesk.plan('ruin.triggerMechanism', {
  ruinNodeId: 'ruin_trapped_antechamber',
  actionKind: 'disarm_wire',
  skillRating: 95,
  toolQuality: 80
});
assert.strictEqual(disarmSuccess.ok, true);
assert.strictEqual(disarmSuccess.success, true);
const currentRuin = WA.ruinMechanism.getRuin('ruin_trapped_antechamber');
assert.strictEqual(currentRuin.isDisarmed, true);
console.log('  ✓ 绝命倒计时前夕工匠技巧成功拆解机关！');

// 5. 正向流程 3：使用掌门信物真传金匙 (use_key) 瞬息解锁
console.log('正在验证正向流程 3：正统秘钥一键过关...');
const keyUnlock = WA.actionDesk.plan('ruin.triggerMechanism', {
  ruinNodeId: 'ruin_crypt_vault',
  actionKind: 'use_key',
  hasMasterKey: true
});
assert.strictEqual(keyUnlock.ok, true);
assert.strictEqual(keyUnlock.success, true);
console.log('  ✓ 秘钥开锁成功！');

// 6. 负控制验证 [NC-2]：已经彻底崩塌沦为废墟的遗迹，操作直接拒收
console.log('正在执行负控制 [NC-2]：已彻底坍塌遗迹拒收门禁...');
WA.ruinMechanism.registerRuinMechanism('ruin_collapsed_tomb', {
  isCollapsed: true
});
const collapsedAttempt = WA.ruinMechanism.triggerMechanism({
  ruinNodeId: 'ruin_collapsed_tomb',
  actionKind: 'use_key'
});
assert.strictEqual(collapsedAttempt.ok, false);
assert.strictEqual(collapsedAttempt.reason, 'ruin-already-collapsed');
console.log('  ✓ [NC-2] 塌陷遗迹拒收门禁验证通过！');

console.log('=== 场景 36 专锁校验总结 ===');
console.log('通过: 6 项断言 (含 2 项真负控制门禁), 失败: 0 项');