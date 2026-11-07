/**
 * WorldAxis tests/scenario-v23-contraband-pipeline.js (v2.330.0)
 *
 * 场景 23 专锁：关卡暗格强拆与走私违禁截击锁
 *
 * 贯通引擎与机制闭环：
 *  1. 管制条令与走私风险模型 (contraband-pipeline EXV16-4):
 *     边境管区设立 4 级军运物资管制条令，严禁私运高能魔导矿石 (forbidden_crystal)；
 *  2. 随身行囊与破坏性强拆检查 (personal-inventory OPV16-5):
 *     走私特工将魔导矿石缝入随身行囊深层暗格 (deep compartment)；
 *     关卡守卫起疑度达到 75 (带有合法盘查权)，常规搜查无法察觉深层缝线；
 *     守卫执行破坏性强拆检查 (forceInspect)，刀划背包起获违禁品并破坏其外壳；
 *  3. 违禁截击与通缉上榜结算 (contraband-pipeline):
 *     走私行动被判定截获 (smuggleContraband)，货物没收，走私特工被全区通缉；
 *  4. 5 项真实破坏性负控制硬门禁：
 *     - [NC-1] 走私货物不含任何管制违禁品时直接拒绝走私判定 (no_contraband_in_cargo)
 *     - [NC-2] 起疑度不足且无搜查令时暴力强拆被硬门禁阻断 (unlawful_search_blocked)
 *     - [NC-3] 强拆搜查不存在的目标物品时搜查方承受外交声誉重罚 (-25)
 *     - [NC-4] 缺管区标识定义管制条令拒收 (invalid_jurisdiction_id)
 *     - [NC-5] 查获走私特工后，通缉榜单确凿登记其悬赏赏金与罪名
 */
'use strict';
const assert = require('assert');
const path = require('path');
require('./mock.js');

const contrabandPipeline = require('../engines/contraband-pipeline.js');
const personalInventory = require('../engines/personal-inventory.js');

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

console.log('=== 开始执行 V16 场景 23 专锁：关卡暗格强拆与走私违禁截击锁 ===');

// 1. 区域管制条令与暗格藏匿
it('1.1 边境管区设立 4 级管制条令，魔导禁晶进入违禁品清单', () => {
  contrabandPipeline.resetAll();
  const defRes = contrabandPipeline.defineContrabandPolicy(
    'frontier_gate',
    ['forbidden_crystal', 'contraband_blueprint'],
    4
  );
  assert.ok(defRes.ok, '设立管制条令成功');
  assert.strictEqual(defRes.contrabandCount, 2);
  assert.strictEqual(defRes.severityLevel, 4);
});

it('1.2 走私特工黑鸦将魔导禁晶藏入贴身背包深层暗格', () => {
  const inv = personalInventory.getInventory('smuggler_crow');
  assert.ok(inv, '初始走私特工行囊');
  inv.bag = [];
  inv.bag.push({
    key: 'forbidden_crystal',
    name: '魔导禁晶',
    category: 'contraband',
    concealTier: 'deep',
    concealed: true,
    destroyed: false
  });
  assert.strictEqual(inv.bag.length, 1);
});

// 2. 暴力强拆搜查对抗 (OPV16-5)
it('2.1 守卫队长持怀疑态度（起疑度 75），执行破坏性强拆划开背包起获违禁品', () => {
  const forceRes = personalInventory.forceInspect(
    'smuggler_crow',
    'captain_vane',
    'forbidden_crystal',
    { suspicionRating: 75, hasWarrant: true }
  );

  assert.ok(forceRes.ok, '强拆搜查执行成功');
  assert.strictEqual(forceRes.foundTarget, true, '成功查获暗格违禁品');
  assert.strictEqual(forceRes.destroyed, true, '暴力破拆导致物品外壳破损');
  assert.strictEqual(forceRes.revealed, true, '物品暗格状态转为显露');
});

// 3. 走私截击与通缉上榜 (EXV16-4)
it('3.1 走私行动判定截获，涉案物资没收，走私特工登记录入通缉榜', () => {
  const smuggleRes = contrabandPipeline.smuggleContraband({
    smugglerId: 'smuggler_crow',
    jurisdictionId: 'frontier_gate',
    cargoItems: [{ itemKey: 'forbidden_crystal', quantity: 3, declaredValue: 500 }],
    stealthRating: 40,
    checkpointInspectionRating: 85
  });

  assert.ok(smuggleRes.ok, '走私对抗结算完成');
  assert.strictEqual(smuggleRes.intercepted, true, '走私被当场截获');
  assert.strictEqual(smuggleRes.confiscatedItemsCount, 3, '没收全部 3 枚禁晶');
  assert.strictEqual(smuggleRes.wantedLevel, 4, '通缉等级对应管制等级 4');

  const wanted = contrabandPipeline.getWantedStatus('smuggler_crow');
  assert.ok(wanted, '走私者处于通缉状态');
  assert.strictEqual(wanted.bounty, 2000, '悬赏金为 4 * 500 = 2000');
});

// 4. 破坏性负控制硬门禁
it('4.1 [NC-1] 走私货物不含任何管制违禁品时直接拒绝走私判定 (no_contraband_in_cargo)', () => {
  const res = contrabandPipeline.smuggleContraband({
    smugglerId: 'honest_merchant',
    jurisdictionId: 'frontier_gate',
    cargoItems: [{ itemKey: 'fresh_apples', quantity: 10 }]
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'no_contraband_in_cargo', '非违禁货物不可走私判定');
});

it('4.2 [NC-2] 起疑度不足且无搜查令时暴力强拆被硬门禁阻断 (unlawful_search_blocked)', () => {
  const res = personalInventory.forceInspect(
    'smuggler_crow',
    'nosy_civilian',
    'forbidden_crystal',
    { suspicionRating: 35, hasWarrant: false }
  );
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'unlawful_search_blocked', '非法强拆被阻断拦截');
});

it('4.3 [NC-3] 强拆搜查不存在的目标物品时搜查方承受外交声誉重罚 (-25)', () => {
  const res = personalInventory.forceInspect(
    'smuggler_crow',
    'captain_vane',
    'non_existent_contraband',
    { suspicionRating: 80, hasWarrant: true }
  );
  assert.ok(res.ok);
  assert.strictEqual(res.foundTarget, false, '物品确实不存在');
  assert.strictEqual(res.reputationPenalty, -25, '滥用搜查导致严重声誉惩罚');
});

it('4.4 [NC-4] 缺管区标识定义管制条令拒收 (invalid_jurisdiction_id)', () => {
  const res = contrabandPipeline.defineContrabandPolicy('', ['item_a'], 3);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'invalid_jurisdiction_id');
});

it('4.5 [NC-5] 查获走私特工后，通缉榜单确凿登记其悬赏赏金与罪名', () => {
  const wanted = contrabandPipeline.getWantedStatus('smuggler_crow');
  assert.strictEqual(wanted.reason, 'contraband_smuggling_caught');
  assert.strictEqual(wanted.wantedLevel, 4);
});

console.log(`=== 场景 23 专锁测试完成：通过 ${passed} 项，失败 ${failed} 项 ===`);
if (failed > 0) process.exit(1);