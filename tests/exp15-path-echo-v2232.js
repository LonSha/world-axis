'use strict';
// WorldAxis tests/exp15-path-echo-v2232.js (v2.231.0)
// IN-2 未走之路的回声专锁：有限预期、知情后遗憾与经验修正、反事实不可全知、零外部记忆污染。
const fs = require('fs');
const path = require('path');
const PR = 'engines/path-echo.js', BASE = path.join(__dirname, '..');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people.p_zhao = { id: 'p_zhao', name: '赵掌柜', life: {} };
    d.people.p_qian = { id: 'p_qian', name: '钱掌柜', life: {} };
    d.places = d.places || { town_square: { id: 'town_square', name: '镇广场' } };
    d.objects = d.objects || { ancient_pot: { id: 'ancient_pot', name: '古坛' } };
    return true;
  }, 'exp15:seed');
  return W;
}

async function runAll(a) {
  const W = env();
  a(!!W.pathEcho, 'pathEcho 存在于 WA');

  const decision = {
    id: 'dec_trade_trip',
    selectedId: 'act_stay_shop',
    title: '留店守摊',
    kind: 'work',
    expectedPayoff: { livelihood: 5 },
    expectedCost: { rest: 2 }
  };
  const alternatives = [
    { id: 'act_trade_fair', title: '前往外乡商会赴约', kind: 'social' }
  ];

  // 1. 记录初始预期
  const recRes = W.pathEcho.recordExpectation('zhao', decision, alternatives, { localMarketPeaceful: true });
  a(recRes.ok === true, '记录预期成功');
  a(recRes.record.alternatives[0].assumedOutcome === 'unknown', '未选之路初始预期为 unknown');

  // 2. 未收到消息/未在场者（赵掌柜在店里，从未收到商会爆满的消息）：不产生遗憾
  const realizeUnaware = W.pathEcho.realizeOutcome('zhao', 'dec_trade_trip', {
    payoff: { livelihood: 1 }, // 实际收益极低
    cost: { rest: 3 },
    directExperience: false,
    wasWitnessed: false
  }, {}); // 没有相关情报
  a(realizeUnaware.ok === true && realizeUnaware.realized === false, '未收到消息者不产生经验修正');
  a(realizeUnaware.reason === 'unaware-of-outcome', '未觉察原因匹配');

  // 3. 收到确凿情报后（得知外乡商会大获成功且自己留店亏损）：产生遗憾与经验修正
  const knownFacts = {
    dec_trade_trip: true, // 知晓本店结果
    alt_truth_act_trade_fair: {
      certainty: 'proven',
      betterThanChosen: true,
      summary: '商会展销盛况空前，赴约者皆获丰厚订金'
    }
  };
  const realizeAware = W.pathEcho.realizeOutcome('zhao', 'dec_trade_trip', {
    payoff: { livelihood: 1 },
    cost: { rest: 3 },
    directExperience: true
  }, knownFacts);

  a(realizeAware.ok === true && realizeAware.realized === true, '获知真相后完成印证');
  a(realizeAware.sentiment === 'regret', '印证产生遗憾（regret）');
  a(realizeAware.realization.revisedBias.work < 0, '留店工作偏好被下调');
  a(realizeAware.realization.revisedBias.commitment > 0, '对赴约承诺的紧迫感上升');

  // 4. 经验修正持久化在角色的 learnings 中
  const learnings = W.pathEcho.getLearnings('zhao');
  a(learnings.biases.work < 0, '角色偏好中 work 为负向');
  a(learnings.history.length === 1, '历史留存 1 条记录');

  // 5. 不可比的另一条路显示 unknown，杜绝编造“本来一定成功”
  const decision2 = {
    id: 'dec_explore',
    selectedId: 'act_read',
    title: '闭门研读',
    kind: 'learning',
    expectedPayoff: { ambition: 3 }
  };
  const altUnprovable = [{ id: 'alt_forest', title: '深入深山探险' }];
  W.pathEcho.recordExpectation('zhao', decision2, altUnprovable, {});
  // 即使研读受挫，但深山探险无确凿事实
  const realizeResign = W.pathEcho.realizeOutcome('zhao', 'dec_explore', {
    payoff: { ambition: 0 },
    directExperience: true
  }, { dec_explore: true });
  a(realizeResign.sentiment === 'resignation', '不可比路线不盲目产生遗憾，归为无可奈何（resignation）');
  a(realizeResign.realization.alternativesEvaluation[0].counterfactual === 'unknown', '未证实备选保持 unknown');

  // 6. 零污染保证：想象与反事实绝不写入地图、库存或他人记忆
  const rawStore = W.store.get();
  a(Object.keys(rawStore.places).length === 1 && rawStore.places.town_square, '地图 places 零污染');
  a(Object.keys(rawStore.objects).length === 1 && rawStore.objects.ancient_pot, '库存 objects 零污染');
  a(!rawStore.people.p_qian.life.pathEchoes, '钱掌柜局部记忆零污染');

  // 7. 行动桌路由
  const deskRes = W.actionDesk.plan('pathEcho.realize', {
    personId: 'zhao',
    decisionId: 'dec_explore',
    actualOutcome: { payoff: { ambition: 0 }, directExperience: true },
    knownFacts: { dec_explore: true }
  });
  a(deskRes.ok === true && deskRes.realized === true, '行动桌 pathEcho.realize 路由成功');
}

const mutations = [
  [
    'unaware-bypass',
    'if (!isAware && !actual.directExperience) {',
    'if (false) {',
    function (W) {
      W.pathEcho.recordExpectation('zhao', { id: 'd_test', selectedId: 'a1', expectedPayoff: { p: 5 } }, [], {});
      const res = W.pathEcho.realizeOutcome('zhao', 'd_test', { payoff: { p: 0 } }, {});
      // 若门禁被旁路，未收到消息的人也会 realized === true
      return res.realized === false;
    }
  ],
  [
    'unknown-counterfactual-bypass',
    "counterfactual: 'unknown',",
    "counterfactual: 'missed-opportunity',",
    function (W) {
      W.pathEcho.recordExpectation('zhao', { id: 'd_test2', selectedId: 'a2', expectedPayoff: { p: 5 } }, [{ id: 'alt_unprovable' }], {});
      const res = W.pathEcho.realizeOutcome('zhao', 'd_test2', { payoff: { p: 0 }, directExperience: true }, { d_test2: true });
      // 变异后将未走之路妄判为错失良机，导致 sentiment 变为 regret 而非 resignation
      return res.sentiment === 'resignation';
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
  console.log('EXP15-IN2: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();