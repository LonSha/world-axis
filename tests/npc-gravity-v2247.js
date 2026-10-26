// WorldAxis tests/npc-gravity-v2247.js (v2.247.0) — Release 2: NPC现实重力、解绑user协议与DeepTalk对等重量测试
'use strict';

global.window = global;
global.WorldAxis = global.WorldAxis || {};

require('../core/input-guard.js');
require('../core/clock.js');
require('../core/settings-bus.js');
require('../engines/motive-arbitration.js');
require('../engines/bonds.js');

function runAll(a) {
  const poorPerson = {
    id: 'npc1',
    name: '小李',
    resources: { money: 10, stamina: 20 },
    bonds: {}
  };

  const candidateHeavy = {
    id: 'act_buy_car',
    title: '强行购买豪华跑车讨好他人',
    requiresResource: { money: 500 },
    payoff: { ambition: 2.0 },
    cost: { livelihood: 1.0 }
  };

  const candidateNormal = {
    id: 'act_work',
    title: '正常打工上班',
    requiresResource: { stamina: 10 },
    payoff: { livelihood: 3.0 },
    cost: { rest: 1.0 }
  };

  const rGravity = WorldAxis.motiveArbitration.evaluate(poorPerson, [candidateHeavy, candidateNormal], {});
  a(rGravity.ok, 'motiveArbitration: 成功执行包含现实重力权衡的动机仲裁');
  a(rGravity.selected.id === 'act_work', 'motiveArbitration: 现实重力生效，严重超出财力的行动被舍弃');
  const heavyEvaluated = rGravity.forsaken.find(f => f.id === 'act_buy_car');
  a(heavyEvaluated !== undefined, 'motiveArbitration: 豪车行动落在 forsaken 被放弃列表');

  const candidateSycophancy = {
    id: 'act_sacrifice_for_user',
    title: '未建立羁绊下倾家荡产帮玩家垫付巨款',
    target: 'user',
    payoff: { commitment: 1.0 },
    cost: { livelihood: 3.0, safety: 1.0 }
  };

  const candidateSelfCare = {
    id: 'act_keep_safe',
    title: '礼貌婉拒，优先保全自身生计',
    payoff: { livelihood: 2.0, safety: 2.0 },
    cost: {}
  };

  const rSycophancy = WorldAxis.motiveArbitration.evaluate(poorPerson, [candidateSycophancy, candidateSelfCare], {});
  a(rSycophancy.selected.id === 'act_keep_safe', 'motiveArbitration: 反谄媚协议生效，拒绝在无深度羁绊时盲目牺牲迎合 user');

  const actorStranger = {
    name: '苏晴',
    sharedMemories: [],
    bonds: {}
  };

  const dtStranger = WorldAxis.bonds.evaluateDeepTalk(actorStranger, '玩家', {});
  a(!dtStranger.eligible && dtStranger.reason === 'insufficient-shared-experience', 'bonds/DeepTalk: 无共同经历与深层羁绊时，严禁进入深层灵魂对谈');

  const actorCompanion = {
    name: '苏晴',
    sharedMemories: ['一同经历暴雨受困孤岛'],
    bonds: { '玩家': { deepAffection: true } }
  };

  const dtCompanion = WorldAxis.bonds.evaluateDeepTalk(actorCompanion, '玩家', {});
  a(dtCompanion.eligible && dtCompanion.emotionalWeight === 'deep', 'bonds/DeepTalk: 具备共同经历时成功解锁深度对话通道，保持对等重量');
}

function runNegative(a) {
  const candidateSycophancy = {
    id: 'act_sacrifice_for_user',
    title: '未建立羁绊下倾家荡产帮玩家垫付巨款',
    target: 'user',
    payoff: { commitment: 1.0 },
    cost: { livelihood: 3.0, safety: 1.0 }
  };
  const candidateSelfCare = {
    id: 'act_keep_safe',
    title: '礼貌婉拒，优先保全自身生计',
    payoff: { livelihood: 2.0, safety: 2.0 },
    cost: {}
  };
  const loyalFriend = {
    id: 'npc2',
    name: '忠诚搭档',
    resources: { money: 100 },
    bonds: { deepAffection: true }
  };
  const rLoyal = WorldAxis.motiveArbitration.evaluate(loyalFriend, [candidateSycophancy, candidateSelfCare], {});
  a(rLoyal.ok, 'motiveArbitration/N1: 深度羁绊角色权衡合法执行');
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (c, name) => { if (c) pass++; else { fail++; console.error('FAIL: ' + name); } };
  runAll(a);
  runNegative(a);
  console.log(`Summary: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

module.exports = { runAll, runNegative };
