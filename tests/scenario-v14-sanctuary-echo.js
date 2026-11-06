'use strict';
// WorldAxis tests/scenario-v14-sanctuary-echo.js
// 验证 WorldAxis V14 场景 16：空间坍缩避难与反事实梦魇终极收口
// 机制覆盖：
//   - OPV14-6: actionDesk.boardMulti / actionDesk.planMulti 多角色协同操作台
//   - OPV14-8: environment.disruptRoutines 微气候对日常日程物理级排他干预
//   - EXV14-8: survival.scrambleSanctuary 有限庇护所争夺、牺牲让渡与驱逐
//   - OPV14-9: chronicle.transplantFact 平行分支记忆移植与认知解离
//   - EXV14-9: drama.evokeCounterfactualEcho 深度反事实推演沙盘心魔回响
//   - 4 项破坏性真负控制：
//     1. 恶劣微气候烈度低于临界阈值拒绝干预日常 (hazard-below-threshold)
//     2. 庇护所争夺申请者为空拒绝 (empty-applicants)
//     3. 角色压力值不足以产生梦魇回响拒绝 (stress-below-threshold)
//     4. 引擎开关关闭硬熔断拒绝 (disabled)

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  [
    'actionDesk', 'environmentInterference', 'sanctuaryScramble',
    'branchTransplant', 'counterfactualEcho'
  ].forEach(function (k) {
    if (W[k]) {
      if (typeof W[k].setSettings === 'function') W[k].setSettings({ enabled: true });
      if (typeof W[k].saveSettings === 'function') W[k].saveSettings({ enabled: true });
    }
  });
  return W;
}

function runScenario() {
  const W = env();
  let asserts = 0;
  function a(cond, msg) {
    asserts++;
    if (!cond) {
      console.error('FAIL: ' + msg);
      process.exit(1);
    }
  }

  // 1. OPV14-6: ActionDesk 多角色协同操作台（boardMulti & planMulti）
  const multiBoard = W.actionDesk.boardMulti({ people: ['hero_a', 'hero_b'] });
  a(multiBoard.ok === true && multiBoard.boards && multiBoard.boards['hero_a'] && multiBoard.boards['hero_b'],
    'S16-1: ActionDesk 成功渲染多角色联合博弈态势板');

  // 2. OPV14-8: 极端寒潮暴风雪爆发，物理级打断 NPC 室外通勤，强制滞留避险
  const disrupt = W.actionDesk.plan('environment.disruptRoutines', {
    actorId: 'npc_miner',
    regionId: 'frost_pass',
    hazardSeverity: 88, // > 60
    weatherKind: 'blizzard'
  });
  a(disrupt.ok === true && disrupt.reason === 'routine-disrupted-sheltered',
    'S16-2: 极端暴雪物理级阻断通勤，NPC 强制转为 indoor 室内避险状态');
  const sAfterDisrupt = W.store.get();
  a(sAfterDisrupt.actors['npc_miner'] && sAfterDisrupt.actors['npc_miner'].conditions.indexOf('sheltered') >= 0,
    'S16-3: NPC 状态打上 sheltered 标记，日程切换为 stay_indoors_shelter');

  // 3. EXV14-8: 空间坍缩避险与有限庇护所生存竞争
  // 3 人申请仅 1 个名额：一人自愿牺牲，一人力量较强，一人被驱逐
  const scramble = W.actionDesk.plan('survival.scrambleSanctuary', {
    sanctuaryId: 'bunker_alpha',
    capacity: 1,
    applicants: [
      { actorId: 'hero_elder', sacrifice: true }, // 自愿让渡牺牲
      { actorId: 'warrior_strong', priority: 5, strength: 80 }, // 强者胜出
      { actorId: 'refugee_weak', priority: 1, strength: 20 } // 弱者被驱逐
    ]
  });
  a(scramble.ok === true && scramble.reason === 'scramble-completed',
    'S16-4: 空间坍缩有限庇护所争夺成功结算');
  a(scramble.admitted.length === 1 && scramble.admitted[0] === 'warrior_strong',
    'S16-5: 力量占优者成功夺得唯一入所名额（admitted）');
  a(scramble.sacrifices.length === 1 && scramble.sacrifices[0] === 'hero_elder',
    'S16-6: 自愿牺牲者主动让位进入牺牲名册');
  const sAfterScramble = W.store.get();
  a(sAfterScramble.actors['hero_elder'].conditions.indexOf('heroic_sacrifice') >= 0,
    'S16-7: 牺牲者持久化打上 heroic_sacrifice 崇高印记');
  a(sAfterScramble.actors['refugee_weak'].conditions.indexOf('stranded') >= 0,
    'S16-8: 未入选流民被关在门外并打上 stranded 绝境标记');

  // 4. OPV14-9: 平行分支事实移植（记忆既视感 deja_vu 植入与轻微认知解离）
  const transplant = W.actionDesk.plan('chronicle.transplantFact', {
    actorId: 'warrior_strong',
    sourceBranch: 'timeline_beta_extinction',
    factText: '在另一个世界线中，这处庇护所其实早已被深渊毒气腐蚀。',
    divergenceDepth: 2
  });
  a(transplant.ok === true && transplant.reason === 'memory-transplanted',
    'S16-9: 平行世界线历史事实降解为既视感成功植入角色记忆');
  const sAfterTransplant = W.store.get();
  const strongWarrior = sAfterTransplant.actors['warrior_strong'];
  a(strongWarrior.implantedMemories && strongWarrior.implantedMemories.length === 1,
    'S16-10: 角色持久化档案中生成 deja_vu 残余记忆碎片');
  a(strongWarrior.cognitiveDissonance >= 5,
    'S16-11: 角色认知解离度（dissonance）受平行记忆冲击上升');

  // 5. EXV14-9: 深度反事实推演沙盘心魔回响（梦魇与恍惚）
  const echo = W.actionDesk.plan('drama.evokeCounterfactualEcho', {
    actorId: 'warrior_strong',
    forkNodeId: 'fork_ruin_escape',
    pathSummary: '如果你当初没有关上大门，老者与流民本可以与你一同生还...',
    stressLevel: 75 // > 30 门槛
  });
  a(echo.ok === true && echo.reason === 'counterfactual-echo-evoked',
    'S16-12: 高压重创下角色浮现未曾发生的反事实平行梦魇回响');
  const sAfterEcho = W.store.get();
  a(sAfterEcho.actors['warrior_strong'].conditions.indexOf('haunted') >= 0,
    'S16-13: 角色持久化打上 haunted 心魔恍惚负面状态');
  a(sAfterEcho.actors['warrior_strong'].counterfactualEchoes.length === 1,
    'S16-14: 梦魇回响档案载入记忆');

  // 6. ActionDesk planMulti 集中批处理调度
  const multiPlan = W.actionDesk.planMulti([
    { actionId: 'society.coordinate', opts: { regionId: 'frost_pass' } },
    { actionId: 'subtextTension.assess', opts: { actorId: 'warrior_strong' } }
  ]);
  a(multiPlan.ok === true && multiPlan.total === 2,
    'S16-15: ActionDesk planMulti 成功集中批量调度多议程');

  // 7. 破坏性真负控制测试 1：微气候危害未达门槛拒绝阻断日程
  const neg1 = W.actionDesk.plan('environment.disruptRoutines', {
    actorId: 'npc_miner',
    regionId: 'frost_pass',
    hazardSeverity: 30 // < 60
  });
  a(neg1.ok === false && neg1.reason === 'hazard-below-threshold',
    'S16-NC1: 天气危害低于阈值时日常通勤干预必然拒绝');

  // 8. 破坏性真负控制测试 2：庇护所争夺申请列表为空拒绝
  const neg2 = W.actionDesk.plan('survival.scrambleSanctuary', {
    sanctuaryId: 'bunker_alpha',
    capacity: 2,
    applicants: []
  });
  a(neg2.ok === false && neg2.reason === 'empty-applicants',
    'S16-NC2: 申请名单为空时庇护所争夺必然拒绝');

  // 9. 破坏性真负控制测试 3：角色压力不足以诱发反事实梦魇
  const neg3 = W.actionDesk.plan('drama.evokeCounterfactualEcho', {
    actorId: 'warrior_strong',
    forkNodeId: 'fork_ruin_escape',
    pathSummary: '微小的遗憾...',
    stressLevel: 15 // < 30
  });
  a(neg3.ok === false && neg3.reason === 'stress-below-threshold',
    'S16-NC3: 压力低于阈值时心魔梦魇回响必然拒绝');

  // 10. 破坏性真负控制测试 4：引擎熔断开关关闭硬拒收
  if (W.settingsBus) {
    const reg = W.__settingsRegs.find(function (r) { return r.module === 'sanctuaryScramble'; });
    if (reg) W.settingsBus.save(reg, { enabled: false });
  }
  const neg4 = W.actionDesk.plan('survival.scrambleSanctuary', {
    sanctuaryId: 'bunker_alpha',
    capacity: 1,
    applicants: [{ actorId: 'someone' }]
  });
  a(neg4.ok === false && neg4.reason === 'disabled',
    'S16-NC4: 引擎开关关闭时庇护所争夺硬熔断拒绝');

  console.log('场景 16（收官终极场景）专锁全部断言通过（19/19 绿灯，含 4 项破坏性真负控制）！');
  console.log('PASS ' + asserts + ' / ' + asserts);
}

runScenario();
