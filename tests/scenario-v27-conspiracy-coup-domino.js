/**
 * WorldAxis tests/scenario-v27-conspiracy-coup-domino.js
 * V17 场景 27 终验专锁：深宫密谋夺权、假现实投毒与政变颠覆锁
 *
 * 核心验证：
 *  1. 阴谋集团秘密结盟与步骤编织 (EXV17-3)
 *  2. 伪造假警报与认知虚假投毒 (EXV17-8)
 *  3. 政变夺权终局执行
 *  4. 真实破坏性负控制硬门禁 (NC-1 ~ NC-4):
 *     - NC-1: 忠诚度极高人员（loyalty >= 80）绝不可被拉入叛变盟约
 *     - NC-2: 前置准备阶段未就绪，强行引爆政变断言被拦截
 *     - NC-3: 密谋被侦破败露后，再次执行政变断言被绝对压制
 *     - NC-4: 受害者亲临第一现场，虚假现实投毒断言被当场戳穿拒绝
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

const conspiracyWeaver = require('../engines/conspiracy-weaver.js');
const perceptionManipulation = require('../engines/perception-manipulation.js');

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

console.log('=== 开始执行 V17 场景 27 专锁：阴谋编织、政变夺权与认知投毒 ===\n');

// 1. 正向链路：暗中结成秘密同盟并策划夺权
it('Path 1: 成立密谋结盟 (EXV17-3)，招揽各怀鬼胎的权臣与将领', function () {
  conspiracyWeaver.resetAll();

  const members = [
    { id: 'prime_minister_zhao', role: 'ringleader', loyalty: 20 },
    { id: 'guard_commander_han', role: 'military_infiltrator', loyalty: 40 },
    { id: 'treasury_clerk_wu', role: 'logistics_saboteur', loyalty: 30 }
  ];

  const res = WA.actionDesk.plan('faction.hatchConspiracy', {
    cabalId: 'midnight_eclipse_cabal',
    ringleaderId: 'prime_minister_zhao',
    targetAuthorityId: 'emperor_tyrant',
    members: members,
    opts: { secrecyRating: 90 }
  });

  assert.strictEqual(res.ok, true, '阴谋同盟应建立成功');
  assert.strictEqual(res.status, 'hatching', '初始应处于密谋编织中');
  assert.strictEqual(res.memberCount, 3, '应包含三位密谋成员');
});

// 2. 正向链路：制造假警报投毒调离禁军卫队
it('Path 2: 制造虚假防汛与撤退假警报 (EXV17-8)，成功欺骗皇城禁卫', function () {
  perceptionManipulation.resetAll();

  // 伪造北方大水漫灌的虚假军情，投毒给忠诚将领
  const forgeRes = WA.actionDesk.plan('society.forgeIllusion', {
    forgerId: 'prime_minister_zhao',
    targetVictimId: 'loyalist_general_li',
    illusionType: 'false_intel_retreat',
    payload: { alertLevel: 'critical', direction: 'north_gate_flood' },
    credibilityScore: 85
  });

  assert.strictEqual(forgeRes.ok, true, '虚假现实投毒应成功植入受害者地图');

  // 将领未在第一现场，验证其相信假情报
  const verifyRes = WA.actionDesk.plan('society.verifyBelief', {
    victimId: 'loyalist_general_li',
    illusionId: forgeRes.illusionId,
    witnessContext: { hasDirectProof: false, witnessedReality: false }
  });

  assert.strictEqual(verifyRes.ok, true);
  assert.strictEqual(verifyRes.believed, true, '受害者在缺乏实锤前应相信假军情并调离部队');
});

// 3. 正向链路：推进三阶段政变准备并于午夜成功篡夺王权
it('Path 3: 完成三阶段夺权准备，午夜摔杯为号发动政变 (EXV17-3) 成功夺权', function () {
  // 阶段 1: 渗透禁卫
  const p1 = WA.actionDesk.plan('faction.advanceCoupPhase', {
    cabalId: 'midnight_eclipse_cabal',
    phaseName: 'infiltrate_guards',
    evidence: 'bribed_guard_officers'
  });
  assert.strictEqual(p1.ok, true);

  // 阶段 2: 运入违禁兵刃
  const p2 = WA.actionDesk.plan('faction.advanceCoupPhase', {
    cabalId: 'midnight_eclipse_cabal',
    phaseName: 'smuggle_arms',
    evidence: 'carriages_loaded_with_crossbows'
  });
  assert.strictEqual(p2.ok, true);

  // 阶段 3: 制造假借口完成
  const p3 = WA.actionDesk.plan('faction.advanceCoupPhase', {
    cabalId: 'midnight_eclipse_cabal',
    phaseName: 'fabricate_pretext',
    evidence: 'palace_alarms_triggered'
  });
  assert.strictEqual(p3.ok, true);
  assert.strictEqual(p3.currentStatus, 'ready', '三阶段达成后应转入 ready 状态');

  // 引爆政变
  const coupRes = WA.actionDesk.plan('faction.executeCoup', {
    cabalId: 'midnight_eclipse_cabal'
  });

  assert.strictEqual(coupRes.ok, true, '政变应执行成功');
  assert.strictEqual(coupRes.status, 'executed_success');
  assert.strictEqual(coupRes.usurper, 'prime_minister_zhao', '新统治者确立');
});

// 4. 负控制 NC-1: 忠诚度极高人员（loyalty >= 80）绝不可被拉入叛变盟约
it('NC-1 [负控制]: 招揽死忠铁卫（loyalty >= 80）入伙，断言被硬性阻断', function () {
  const membersWithLoyal = [
    { id: 'traitor_duke', role: 'ringleader', loyalty: 10 },
    { id: 'incorruptible_palace_guard', role: 'guard', loyalty: 95 } // 死忠禁军
  ];

  const res = WA.actionDesk.plan('faction.hatchConspiracy', {
    cabalId: 'failed_conspiracy',
    ringleaderId: 'traitor_duke',
    targetAuthorityId: 'emperor_tyrant',
    members: membersWithLoyal
  });

  assert.strictEqual(res.ok, false, '拉拢死忠叛变必须被拦截');
  assert.strictEqual(res.error, 'member_loyalty_too_high_to_conspire');
});

// 5. 负控制 NC-2: 前置准备阶段未就绪，强行引爆政变断言被拦截
it('NC-2 [负控制]: 前置准备未就绪（未完成前置阶段），强行起事断言被阻断', function () {
  conspiracyWeaver.hatchConspiracy('rushed_cabal', 'hasty_lord', 'king', [
    { id: 'hasty_lord', loyalty: 10 }
  ]);

  // 仅完成 1 个阶段
  conspiracyWeaver.advancePhase('rushed_cabal', 'infiltrate_guards');

  const res = WA.actionDesk.plan('faction.executeCoup', {
    cabalId: 'rushed_cabal'
  });

  assert.strictEqual(res.ok, false, '仓促起事缺乏准备必须被拒绝');
  assert.strictEqual(res.error, 'insufficient_coup_preparation');
});

// 6. 负控制 NC-3: 密谋被侦破败露后，再次执行政变断言被绝对压制
it('NC-3 [负控制]: 密谋已被揭发败露，再次执行政变断言被绝对压制', function () {
  // 建立并就绪同盟
  conspiracyWeaver.hatchConspiracy('doomed_cabal', 'schemer', 'king', [{ id: 'schemer', loyalty: 10 }]);
  conspiracyWeaver.advancePhase('doomed_cabal', 'phase1');
  conspiracyWeaver.advancePhase('doomed_cabal', 'phase2');
  conspiracyWeaver.advancePhase('doomed_cabal', 'phase3');

  // 被密探告发揭露
  WA.actionDesk.plan('faction.unmaskConspiracy', {
    cabalId: 'doomed_cabal',
    exposerId: 'shadow_spymaster',
    proofTraceId: 'intercepted_pact_scroll'
  });

  // 强行尝试执行政变
  const coupRes = WA.actionDesk.plan('faction.executeCoup', {
    cabalId: 'doomed_cabal'
  });

  assert.strictEqual(coupRes.ok, false, '败露密谋执行政变必须被拦截');
  assert.strictEqual(coupRes.error, 'coup_already_unmasked_and_suppressed');
});

// 7. 负控制 NC-4: 受害者亲临第一现场，虚假现实投毒断言被当场戳穿拒绝
it('NC-4 [负控制]: 受害者身为现场亲历目击者，虚假现实投毒断言当场戳穿拒绝', function () {
  const res = WA.actionDesk.plan('society.forgeIllusion', {
    forgerId: 'liar_scout',
    targetVictimId: 'general_on_the_field',
    illusionType: 'false_casualty',
    payload: { deceased: 'prince_alive_and_well' },
    credibilityScore: 90,
    opts: { victimIsDirectWitness: true } // 受害者亲眼看着王子活生生站在面前
  });

  assert.strictEqual(res.ok, false, '当面撒谎必须被当场戳穿');
  assert.strictEqual(res.error, 'victim_is_direct_eyewitness_unmask_immediate');
});

console.log('\n=== 场景 27 专锁校验总结 ===');
console.log('通过: ' + passCount + ' 项, 失败: ' + failCount + ' 项');
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 场景 27 专锁 100% 全部通过！');
}