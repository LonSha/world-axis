'use strict';
// WorldAxis tests/exp14-motive-arbitration-v2232.js (v2.231.0)
// IN-1 动机竞合专锁：NPC 不再只选第一条可执行任务，生计/承诺/抱负/恢复/安全权衡。
const fs = require('fs');
const path = require('path');
const PR = 'engines/motive-arbitration.js', BASE = path.join(__dirname, '..');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  return W;
}

function buildMockCandidates() {
  return [
    {
      id: 'work_overtime',
      title: '工坊连夜赶工挣钱',
      kind: 'work',
      payoff: { livelihood: 4, ambition: 1 },
      cost: { rest: 3, safety: 0 },
      commitmentImpact: { id: 'cmt_meet', effect: 'delay' },
      factsRef: ['lowFunds']
    },
    {
      id: 'keep_promise',
      title: '赴约履行承诺',
      kind: 'social',
      payoff: { commitment: 4, rest: 1 },
      cost: { livelihood: 1 },
      commitmentImpact: { id: 'cmt_meet', effect: 'fulfill' },
      factsRef: ['commitmentUrgent']
    },
    {
      id: 'take_rest',
      title: '闭门休养恢复体能',
      kind: 'rest',
      payoff: { rest: 5, safety: 1 },
      cost: { livelihood: 2 },
      commitmentImpact: { id: 'cmt_meet', effect: 'delay' },
      factsRef: ['exhausted']
    }
  ];
}

async function runAll(a) {
  const W = env();
  a(!!W.motiveArbitration, 'motiveArbitration 存在于 WA');

  const person = {
    id: 'artisan_chen',
    name: '陈工匠',
    profile: { traits: ['dutiful', 'craftsman'] },
    life: {
      goals: [{ id: 'g1', text: '完成工坊订单', status: 'active' }],
      commitments: [{ id: 'cmt_meet', text: '与林掌柜核对账目', status: 'active' }],
      schedule: []
    }
  };

  // 1. 资金短缺状态 => 选赶工挣钱，赴约承诺被延后
  const candidates1 = buildMockCandidates();
  const resFunds = W.motiveArbitration.decide(person, candidates1, { lowFunds: true });
  a(resFunds.ok === true, '资金短缺评估成功');
  a(resFunds.selected.id === 'work_overtime', '资金短缺时应选赶工挣钱');
  a(resFunds.decision === 'defer', '承诺受到推迟');
  a(person.life.commitments[0].status === 'deferred', '承诺状态应被推迟');
  a(person.life.commitments[0].deferReason.indexOf('工坊连夜赶工挣钱') >= 0, '延后原因应留痕');
  a(resFunds.forsaken.length === 2, '两项被放弃');
  a(resFunds.rationale.hasFabrication === false, '不可捏造事实');

  // 2. 承诺临期状态 => 选赴约
  person.life.commitments[0].status = 'active';
  const candidates2 = buildMockCandidates();
  const resCommit = W.motiveArbitration.decide(person, candidates2, { commitmentUrgent: true });
  a(resCommit.selected.id === 'keep_promise', '承诺临期时应选赴约');
  a(resCommit.decision === 'accept', '正常赴约履约');

  // 3. 重度疲劳状态 => 选休养
  const candidates3 = buildMockCandidates();
  const resRest = W.motiveArbitration.decide(person, candidates3, { exhausted: true });
  a(resRest.selected.id === 'take_rest', '极度疲惫时应选休养');

  // 4. 移除真实输入后取舍改变：不给任何紧急状态，由于底色有 dutiful，将选守约
  const candidates4 = buildMockCandidates();
  const resDefault = W.motiveArbitration.decide(person, candidates4, {});
  a(resDefault.selected.id === 'keep_promise', '平稳无紧急状态下依忠厚底色选择赴约');

  // 5. 虚假事实检出：candidate 声明了未出现的引用
  const falseCandidates = [
    {
      id: 'ghost_act',
      title: '幽灵行动',
      payoff: { livelihood: 5 },
      factsRef: ['non_existent_fact_xyz']
    }
  ];
  const resFalse = W.motiveArbitration.evaluate(person, falseCandidates, { lowFunds: true });
  a(resFalse.selected.invalidFacts.length === 1, '应检出未声明的事实');
  a(resFalse.rationale.hasFabrication === true, '标记为存在编造');

  // 6. 行动桌路由连通
  const deskRes = W.actionDesk.plan('motive.arbitrate', {
    person: person,
    candidates: buildMockCandidates(),
    facts: { exhausted: true }
  });
  a(deskRes.ok === true, '行动桌 motive.arbitrate 路由执行成功');
  a(deskRes.selected.id === 'take_rest', '行动桌路由返回一致决策');
}

const mutations = [
  [
    'rest-weight-bypass',
    'effective.rest += 5.0;',
    'effective.rest += 0.0;',
    function (W) {
      const candidates = buildMockCandidates();
      const p = { id: 'p1', profile: { traits: [] }, life: { commitments: [] } };
      const res = W.motiveArbitration.decide(p, candidates, { exhausted: true });
      return res.selected.id === 'take_rest';
    }
  ],
  [
    'commitment-break-penalty-bypass',
    'commitmentPenalty = (w.commitment || 1.0) * 5.0;',
    'commitmentPenalty = 0;',
    function (W) {
      const candidates = [
        {
          id: 'break_for_gold',
          title: '背弃承诺去淘宝',
          payoff: { livelihood: 8 },
          commitmentImpact: { id: 'c1', effect: 'break' }
        },
        {
          id: 'keep_p',
          title: '履约',
          payoff: { commitment: 2 }
        }
      ];
      const p = { id: 'p1', profile: { traits: ['dutiful'] }, life: { commitments: [] } };
      const res = W.motiveArbitration.decide(p, candidates, {});
      return res.selected.id !== 'break_for_gold';
    }
  ]
];

async function runNegative(a) {
  for (const [name, anchor, replacement, criterion] of mutations) {
    const source = fs.readFileSync(path.join(BASE, PR), 'utf8');
    a(criterion(env()), name + ': 原版真判据通过');
    if (source.split(anchor).length < 2) throw new Error(name + ': nonunique mutation anchor');
    const ov = {}; ov[PR] = source.replace(anchor, replacement);
    a(!criterion(env(ov)), name + ': 变异后判据必捕获失败');
    a(fs.readFileSync(path.join(BASE, PR), 'utf8') === source, name + ': 源码文件保持未变');
  }
}

module.exports = { runAll, runNegative };

if (require.main === module) (async function () {
  let pass = 0, fail = 0;
  const a = (ok, name) => {
    if (ok) pass++;
    else { fail++; console.log('FAIL ' + name); }
  };
  try {
    await runAll(a);
    await runNegative(a);
  } catch (e) {
    fail++;
    console.log(e.stack);
  }
  console.log('EXP14-IN1: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();