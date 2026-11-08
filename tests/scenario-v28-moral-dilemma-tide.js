/**
 * WorldAxis tests/scenario-v28-moral-dilemma-tide.js
 * V17 场景 28 终验专锁：冰封纪元时代浪潮与电车难题绝境取舍锁
 *
 * 核心验证：
 *  1. 宏观时代浪潮改写物理常数 (EXV17-6)
 *  2. 道德两难伦理电车困局博弈 (EXV17-7)
 *  3. 决断者承受不可逆心智创伤代价 (OPV17-1 / EXV17-2)
 *  4. 真实破坏性负控制硬门禁 (NC-1 ~ NC-4):
 *     - NC-1: 世界处于稳定和平保护期，微弱扰动断言无法强制引发极端大纪元突变
 *     - NC-2: 避难所资源充沛或存在和平通融解法，断言严禁强加二元残酷死局
 *     - NC-3: 非法分支选项（非 A 且非 B），决断仲裁断言拒收
 *     - NC-4: 时代浪潮经过足够周期自然推演至 0，全局物理常数自发恢复正常基准
 */
'use strict';
const assert = require('assert');
const path = require('path');

require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
if (WA.actionDesk && typeof WA.actionDesk.setSettings === 'function') {
  WA.actionDesk.setSettings({ enabled: true });
}

const epochTide = require('../engines/epoch-tide.js');
const moralDilemma = require('../engines/moral-dilemma.js');
const psycheTrauma = require('../engines/psyche-trauma.js');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log('  ✓ ' + desc);
    passCount++;
  } catch (err) {
    console.error('  ✗ ' + desc + ' -> ' + err.message);
    failCount++;
  }
}

console.log('=== 开始执行 V17 场景 28 专锁：冰封时代浪潮与电车难题抉择 ===\n');

// 1. 正向链路：冰河严冬大时代降临，全图常数剧变
it('Path 1: 冰河严冬纪元浪潮 (EXV17-6) 降临，全图气温骤降且粮食消耗翻倍', function () {
  epochTide.resetAll();

  const res = WA.actionDesk.plan('world.shiftEpoch', {
    epochType: 'glacial_frost',
    severity: 3.0,
    durationEpochTurns: 8
  });

  assert.strictEqual(res.ok, true, '时代大潮应成功降临');
  assert.strictEqual(res.epochType, 'glacial_frost');
  assert.ok(res.modifiers.temperatureDelta <= -45.0, '全图气温降幅应突破 -45℃');
  assert.ok(res.modifiers.resourceConsumptionMultiplier >= 2.5, '资源消耗系数激增至 2.5 倍');
});

// 2. 正向链路：在严冬饥荒逼迫下，领袖被迫面临生死电车抉择
it('Path 2: 绝境饥荒触发道德两难电车困局 (EXV17-7)，领袖作出残酷抉择', function () {
  moralDilemma.resetAll();
  psycheTrauma.resetAll();

  const poseRes = WA.actionDesk.plan('drama.poseDilemma', {
    dilemmaKey: 'shelter_starvation_crisis',
    decisionMakerId: 'commander_elena',
    branchA: { text: '牺牲轻伤老弱截流口粮保全青壮战力突围', utilitarian: true },
    branchB: { text: '平均配给同生共死但三日后全员大概率覆灭', deontology: true }
  });

  assert.strictEqual(poseRes.ok, true, '电车困境应成功立案');
  assert.strictEqual(poseRes.status, 'posed');

  // 领袖最终咬牙选择分支 A（功利主义突围），牺牲少数拯救多数
  const resolveRes = WA.actionDesk.plan('drama.resolveDilemma', {
    dilemmaKey: 'shelter_starvation_crisis',
    chosenBranch: 'A',
    rationale: 'survival_of_the_settlement_above_all'
  });

  assert.strictEqual(resolveRes.ok, true, '决断裁决应落盘');
  assert.strictEqual(resolveRes.chosenBranch, 'A');
  assert.strictEqual(resolveRes.psychicCostApplied, 40, '残酷抉择强制施加 40 级精神代价');

  // 验证领袖心智累积创伤
  const profile = psycheTrauma.getActorPsyche('commander_elena');
  assert.ok(profile.traumaLevel >= 40, '领袖心智应承受 40 级存在主义创伤');
});

// 3. 负控制 NC-1: 世界处于稳定和平保护期，微弱扰动断言无法强制引发极端大纪元突变
it('NC-1 [负控制]: 承平日久且具备稳定保护，微弱扰动断言无法强制引发极端大潮', function () {
  const res = WA.actionDesk.plan('world.shiftEpoch', {
    epochType: 'glacial_frost',
    severity: 1.5, // 弱烈度扰动
    durationEpochTurns: 5,
    opts: { stableWorldProtection: true }
  });

  assert.strictEqual(res.ok, false, '稳定世界应抵御微弱突变');
  assert.strictEqual(res.error, 'stable_world_resists_weak_epoch_shift');
});

// 4. 负控制 NC-2: 避难所资源充沛或存在和平通融解法，断言严禁强加二元残酷死局
it('NC-2 [负控制]: 仓廪充盈物资充沛时，强行调用电车困境断言被系统拦截', function () {
  const res = WA.actionDesk.plan('drama.poseDilemma', {
    dilemmaKey: 'unjust_dilemma',
    decisionMakerId: 'rich_mayor',
    branchA: { text: 'option1' },
    branchB: { text: 'option2' },
    opts: { abundantResources: true } // 物资大丰收
  });

  assert.strictEqual(res.ok, false, '资源充沛时绝不产生伪悲剧强加死局');
  assert.strictEqual(res.error, 'peaceful_resolution_available_no_forced_dilemma');
});

// 5. 负控制 NC-3: 非法分支选项（非 A 且非 B），决断仲裁断言拒收
it('NC-3 [负控制]: 传入非法分支选项（如 C），决断仲裁断言拒收', function () {
  moralDilemma.poseDilemma('temp_dilemma', 'judge', { text: 'A' }, { text: 'B' });

  const res = WA.actionDesk.plan('drama.resolveDilemma', {
    dilemmaKey: 'temp_dilemma',
    chosenBranch: 'C' // 非法分支
  });

  assert.strictEqual(res.ok, false, '非法选项应被拒绝');
  assert.strictEqual(res.error, 'invalid_branch_choice');
});

// 6. 负控制 NC-4: 时代浪潮推演至 0 轮，全局物理常数自发恢复正常基准
it('NC-4 [负控制]: 时代大潮消耗完周期后，全局常数断言自愈并重置回正常纪元', function () {
  // 设置一个持续 2 轮的时代
  epochTide.shiftEpoch('energy_drought', 2.0, 2);
  assert.strictEqual(epochTide.getCurrentEpoch().epochType, 'energy_drought');

  // 推进 2 轮
  WA.actionDesk.plan('world.advanceEpoch', { turns: 2 });

  const cur = epochTide.getCurrentEpoch();
  assert.strictEqual(cur.epochType, 'normal_era', '推演结束后必须恢复 normal_era');
  assert.strictEqual(cur.remainingTurns, 0);
  assert.strictEqual(cur.activeModifiers.temperatureDelta, 0.0);
  assert.strictEqual(cur.activeModifiers.resourceConsumptionMultiplier, 1.0);
});

console.log('\n=== 场景 28 专锁校验总结 ===');
console.log('通过: ' + passCount + ' 项, 失败: ' + failCount + ' 项');
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 场景 28 专锁 100% 全部通过！');
}