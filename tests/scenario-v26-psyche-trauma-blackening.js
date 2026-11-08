/**
 * WorldAxis tests/scenario-v26-psyche-trauma-blackening.js
 * V17 场景 26 终验专锁：微光碎裂、心智黑化与长程蝴蝶级联锁
 *
 * 核心验证：
 *  1. 生理极限剧痛与应激惊恐的精神代偿 (OPV17-1)
 *  2. 深层心智创伤、执念与黑化质变动力学 (EXV17-2)
 *  3. 混沌蝴蝶长程多米诺因果放大 (EXV17-1)
 *  4. 真实破坏性负控制硬门禁 (NC-1 ~ NC-4):
 *     - NC-1: 无剧痛冲击或具备无畏特性，绝不产生非零惊恐精神代偿
 *     - NC-2: 具备圣贤/道心豁免特性，精神创伤冲击断言被绝对阻断
 *     - NC-3: 创伤与执念未突破临界阈值，强制调用黑化接口断言被拦截
 *     - NC-4: 蝴蝶扰动初始能量低于阻尼下限，断言自然平息，绝不无限凭空放大
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

const psycheTrauma = require('../engines/psyche-trauma.js');
const butterflyCascade = require('../engines/butterfly-cascade.js');
const metabolismClock = require('../engines/metabolism-clock.js');
const actionDesk = require('../engines/action-desk.js');

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

console.log('=== 开始执行 V17 场景 26 专锁：心智创伤黑化与混沌蝴蝶拓扑 ===\n');

// 1. 正向链路：生理极限剧痛冲击引发惊恐代偿
it('Path 1: 生理极限剧痛 (OPV17-1) 成功转化为惊恐代偿并累积创伤', function () {
  metabolismClock.resetAll ? metabolismClock.resetAll() : null;
  psycheTrauma.resetAll();

  // 角色遭受 95 级毁灭性断肢剧痛冲击
  const res = WA.actionDesk.plan('bio.applyPsychicStress', {
    actorId: 'sword_disciple_lin',
    shockLevel: 95,
    cause: 'mutilation_limb_severed'
  });

  assert.strictEqual(res.ok, true, '剧痛精神代偿应执行成功');
  assert.strictEqual(res.isPanic, true, '严重惊恐状态应被触发');
  assert.strictEqual(res.isShocked, true, '休克状态应被触发');

  // 验证联动投递到 psycheTrauma 引擎
  const profile = psycheTrauma.getActorPsyche('sword_disciple_lin');
  assert.ok(profile.traumaLevel >= 80, '创伤深度应突破 80');
  assert.ok(profile.sanityIndex <= 40, '理智值应骤降');
});

// 2. 正向链路：重大背叛引发偏执执念突破，触发心智黑化
it('Path 2: 遭遇宗门背叛与至亲惨死 (EXV17-2)，心智彻底黑化', function () {
  // 追加宗门背叛致命创伤
  const tRes = WA.actionDesk.plan('mind.inflictTrauma', {
    actorId: 'sword_disciple_lin',
    shockLevel: 90,
    traumaType: 'betrayal',
    sourceId: 'traitor_master_gu'
  });
  assert.strictEqual(tRes.ok, true, '背叛创伤应写入成功');

  // 执念突破临界，触发黑化
  const bRes = WA.actionDesk.plan('mind.triggerBlackening', {
    actorId: 'sword_disciple_lin',
    obsessionTarget: 'traitor_master_gu',
    cause: 'sect_annihilation_betrayal'
  });

  assert.strictEqual(bRes.ok, true, '黑化状态机应顺利触发');
  assert.strictEqual(bRes.mentalState, 'blackening', '精神状态应锁定为黑化');
  assert.strictEqual(bRes.obsessionTarget, 'traitor_master_gu', '执念目标应锁定为仇敌');
});

// 3. 正向链路：黑化角色的微观仇恨誓言，作为蝴蝶扰动注入拓扑网络并推进多米诺
it('Path 3: 仇恨誓言作为蝴蝶种子 (EXV17-1)，随推演逐步放大为宏观危机', function () {
  butterflyCascade.resetAll();

  const fRes = WA.actionDesk.plan('causal.triggerButterfly', {
    seedEventId: 'lin_vengeance_vow',
    initialEnergy: 40,
    amplifier: 2.0,
    targetTopologyChain: ['sect_hall', 'city_districts', 'imperial_capital']
  });

  assert.strictEqual(fRes.ok, true, '蝴蝶扰动种子应成功植入');
  assert.strictEqual(fRes.stage, 'incubation', '初始应处于潜伏孕育期');

  // 推进 3 轮：应放大至共振期
  const adv1 = WA.actionDesk.plan('causal.advanceButterfly', { stepCount: 3 });
  assert.strictEqual(adv1.ok, true);
  const st1 = butterflyCascade.getCascadeState('lin_vengeance_vow');
  assert.strictEqual(st1.currentStage, 'amplification', '3 轮后应进入放大共振期');

  // 再推进 2 轮：应引爆宏观危机
  const adv2 = WA.actionDesk.plan('causal.advanceButterfly', { stepCount: 2 });
  assert.strictEqual(adv2.ok, true);
  const st2 = butterflyCascade.getCascadeState('lin_vengeance_vow');
  assert.strictEqual(st2.currentStage, 'macro_crisis', '5 轮后应爆发宏观系统性危机');
  assert.strictEqual(st2.settled, true, '危机应结算完成');
});

// 4. 负控制 NC-1: 无剧痛冲击或具备无畏绝缘，绝不产生非零惊恐精神代偿
it('NC-1 [负控制]: 无剧痛冲击或具备无畏绝缘，断言绝不产生非零惊恐精神代偿', function () {
  const res1 = WA.actionDesk.plan('bio.applyPsychicStress', {
    actorId: 'fearless_warrior',
    shockLevel: 0,
    cause: 'minor_scratch'
  });
  assert.strictEqual(res1.ok, false, '零冲击应被拒绝');
  assert.strictEqual(res1.error, 'zero_shock_or_fearless_immune');

  const res2 = WA.actionDesk.plan('bio.applyPsychicStress', {
    actorId: 'fearless_paladin',
    shockLevel: 50,
    cause: 'heavy_strike',
    opts: { fearless: true }
  });
  assert.strictEqual(res2.ok, false, '无畏特质应免疫代偿');
  assert.strictEqual(res2.error, 'zero_shock_or_fearless_immune');
});

// 5. 负控制 NC-2: 具备圣贤/道心豁免特性，精神创伤冲击断言被绝对阻断
it('NC-2 [负控制]: 具备圣贤道心豁免特性，精神创伤冲击断言被绝对拦截', function () {
  psycheTrauma.registerActorPsyche('stoic_elder', {
    stoicSage: true
  });

  const res = WA.actionDesk.plan('mind.inflictTrauma', {
    actorId: 'stoic_elder',
    shockLevel: 100,
    traumaType: 'atrocity_witness',
    sourceId: 'apocalypse_disaster'
  });

  assert.strictEqual(res.ok, false, '圣贤豁免应拦截创伤');
  assert.strictEqual(res.error, 'psychic_immune_blocked');
  const profile = psycheTrauma.getActorPsyche('stoic_elder');
  assert.strictEqual(profile.traumaLevel, 0, '创伤等级必须恒为 0');
  assert.strictEqual(profile.mentalState, 'sound', '心智必须恒为健全');
});

// 6. 负控制 NC-3: 创伤与执念未突破临界阈值，强制调用黑化接口断言被拦截
it('NC-3 [负控制]: 创伤与执念未突破临界阈值，强制调用黑化接口断言被拦截', function () {
  psycheTrauma.registerActorPsyche('peaceful_scholar', {
    traumaLevel: 10,
    obsessionRating: 15
  });

  const res = WA.actionDesk.plan('mind.triggerBlackening', {
    actorId: 'peaceful_scholar',
    obsessionTarget: 'rival',
    cause: 'lost_a_game'
  });

  assert.strictEqual(res.ok, false, '创伤不足时强行黑化必须被拦截');
  assert.strictEqual(res.error, 'insufficient_trauma_precondition');
  const profile = psycheTrauma.getActorPsyche('peaceful_scholar');
  assert.notStrictEqual(profile.mentalState, 'blackening', '精神状态绝不可变脸为黑化');
});

// 7. 负控制 NC-4: 蝴蝶扰动初始能量低于阻尼下限，断言自然平息，绝不无限凭空放大
it('NC-4 [负控制]: 蝴蝶扰动初始能量低于阻尼下限，断言自然平息拒收', function () {
  const res = WA.actionDesk.plan('causal.triggerButterfly', {
    seedEventId: 'tiny_pebble_drop',
    initialEnergy: 5, // 低于阻尼下限 10
    opts: { dampingFloor: 10 }
  });

  assert.strictEqual(res.ok, false, '微弱扰动必须被环境阻尼平息拦截');
  assert.strictEqual(res.error, 'energy_absorbed_by_damping_floor');
  assert.strictEqual(butterflyCascade.getCascadeState('tiny_pebble_drop'), null, '台账中绝不可留存虚假级联');
});

console.log('\n=== 场景 26 专锁校验总结 ===');
console.log('通过: ' + passCount + ' 项, 失败: ' + failCount + ' 项');
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 场景 26 专锁 100% 全部通过！');
}