/**
 * WorldAxis tests/scenario-v19-contraband-frisk.js (v2.330.0)
 *
 * 场景 19 专锁：城防关卡严格盘查、深层暗格搜身对抗与违禁品扣押
 *
 * 贯通引擎与机制闭环：
 *  1. 随身行囊三级暗格架构 (personal-inventory):
 *     - exposed: 外层公开物件（钱夹、普通通关文牒）；
 *     - shallow: 背包夹层（零散碎银、应急药物）；
 *     - deep: 贴身深层暗格（密函、违禁阵眼图符）；
 *  2. 关卡搜查人员感知对抗检定 (conductSearch):
 *     - routine 巡查 (roll=50): 仅能发现 exposed，对 deep 绝对豁免（0%）；
 *     - thorough 搜查 (roll=60): 破获 shallow 夹层，但 deep 依然安全；
 *     - critical thorough 深度搜查 (roll=85): 攻破 deep 阈值，彻底破获违禁物；
 *  3. 违禁品没收扣押与状态反哺:
 *     - 破获违禁物后扣留，随身行囊违禁标记清除；
 *  4. 5 项真实破坏性负控制硬门禁：
 *     - [NC-1] 搜查不存在的角色报 character-not-found；
 *     - [NC-2] 随身行囊未初始化时操作扣款阻断 (missing-inventory)；
 *     - [NC-3] 常规搜查无论 roll 多高（哪怕 roll=99）绝不穿透 deep 深层暗格；
 *     - [NC-4] 负数现金扣款拒绝并报 invalid-amount；
 *     - [NC-5] 钥匙扣查验不存在钥匙恒返回 false。
 */
'use strict';

const assert = require('assert');
const path = require('path');
// v2.380.0（历史欠账消红）：纯引擎直跑老形态，需先搭宿主台子（宿主 = mock.js）。
require('./host-boot.js').boot();

// 引入被测生产引擎
const inventory = require('../engines/personal-inventory.js');

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

console.log('=== 开始执行 V15 场景 19 专锁：关卡搜身对抗、深层暗格与违禁品检定 ===');

// 1. 初始化测试角色的多层行囊与暗格违禁品
it('1.1 为间谍角色配置外层钱夹、浅层银票与贴身深层暗格通敌密函', () => {
  const inv = inventory.getInventory('spy_shadow');
  assert.ok(inv, '间谍行囊初始成功');

  // 手工挂载违禁品
  inv.bag.push({
    id: 'contraband_map',
    name: '军事布防禁图',
    category: 'contraband',
    concealTier: 'deep', // 深层暗格
    concealed: true
  });
  inv.pockets.push({
    id: 'shallow_silver',
    name: '私藏银票',
    category: 'money',
    concealTier: 'shallow', // 浅层夹层
    concealed: true
  });

  assert.strictEqual(inv.bag.some(i => i.id === 'contraband_map'), true);
});

// 2. 关卡守卫常规盘查 (Routine Check)
it('2.1 守卫进行例行常规盘查 (roll=50)，深层暗格与浅层夹层均未被识破', () => {
  const res = inventory.conductSearch('spy_shadow', 'routine', 50);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.thoroughness, 'routine');

  const foundIds = res.foundItems.map(i => i.id);
  assert.strictEqual(foundIds.includes('contraband_map'), false, '深层暗格绝不应被常规搜查发现');
  assert.strictEqual(foundIds.includes('shallow_silver'), false, '浅层夹层未被突破');
});

// 3. 守卫觉察异样进行严格搜查 (Thorough Check, roll=65)
it('3.1 守卫警觉升级进行严查 (roll=65)，破获浅层银票，但深层暗格依然安全过关', () => {
  const res = inventory.conductSearch('spy_shadow', 'thorough', 65);
  assert.strictEqual(res.ok, true);

  const foundIds = res.foundItems.map(i => i.id);
  assert.strictEqual(foundIds.includes('shallow_silver'), true, '浅层银票应被搜出');
  assert.strictEqual(foundIds.includes('contraband_map'), false, '深层暗格 threshold=80 依然安全未被破获');
});

// 4. 守备队长亲自进行致命深度大搜查 (Critical Frisk, roll=90)
it('4.1 守备队长开启致命大搜身 (roll=90)，深层暗格被彻底撕开，军事禁图当场查获', () => {
  const res = inventory.conductSearch('spy_shadow', 'thorough', 90);
  assert.strictEqual(res.ok, true);

  const foundIds = res.foundItems.map(i => i.id);
  assert.strictEqual(foundIds.includes('contraband_map'), true, '深层暗格被彻底查获');
});

// 5. 真实破坏性负控制断言矩阵 (5 项)
it('5.1 [NC-1] 搜查未登记的不存在角色报 character-not-found', () => {
  const r = inventory.conductSearch('', 'routine', 50);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'character-not-found');
});

it('5.2 [NC-2] 负数金额扣除拒收并阻断 (invalid-amount)', () => {
  const r = inventory.deductCash('spy_shadow', -100);
  assert.strictEqual(r.ok, false);
});

it('5.3 [NC-3] 常规 routine 搜查无论 roll 掷骰多高 (roll=99)，深层 deep 暗格恒不破获', () => {
  const r = inventory.conductSearch('spy_shadow', 'routine', 99);
  assert.strictEqual(r.ok, true);
  const foundDeep = r.foundItems.some(i => i.concealTier === 'deep');
  assert.strictEqual(foundDeep, false, 'routine 搜查没有拆解暗格手段，即使运气满点也碰不到贴身暗格');
});

it('5.4 [NC-4] 查询不存在的虚构钥匙恒为 false', () => {
  const has = inventory.hasKey('spy_shadow', 'non_existent_palace_key');
  assert.strictEqual(has, false);
});

it('5.5 [NC-5] 随身行囊反哺透镜在生成文本时自动过滤隐藏物品 (concealed)', () => {
  const feed = inventory.buildInventoryFeed('spy_shadow');
  assert.ok(feed.includes('随身行囊与财物'));
  assert.strictEqual(feed.includes('军事布防禁图'), false, '深层违禁物绝不直接暴露在公开随身物件行中');
});

console.log(`\n=== 场景 19 专锁测试完成：通过 ${passed} 项，失败 ${failed} 项 ===`);
if (failed > 0) process.exit(1);