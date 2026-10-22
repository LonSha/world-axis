'use strict';
// WorldAxis tests/exp19-epistemic-view-v2232.js (v2.231.0)
// OP-7 角色手里的版本专锁：局部事实推导行动、失真与确信分歧、证据纠偏与历史不可擦除。
const fs = require('fs');
const path = require('path');
const PR = 'engines/epistemic-view.js', BASE = path.join(__dirname, '..');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  W.store.transact(function (d) {
    d.people = d.people || {};
    ['trader_jia', 'partner_yi', 'stranger_bing'].forEach(function (name) {
      d.people['p_' + name] = { id: 'p_' + name, name: name };
    });
    return true;
  }, 'exp19:seed');
  return W;
}

async function runAll(a) {
  const W = env();
  a(!!W.epistemicView, 'epistemicView 存在于 WA');

  const topic = 'contract_timber_delivery';

  // 1. 甲掌握真实履约版本（亲见公函，确凿）
  W.epistemicView.registerBelief('trader_jia', topic, {
    version: 'v_truth',
    summary: '木料已按约定在城东仓库清点交付',
    claimTruth: true,
    certainty: 'certain',
    source: 'witnessed',
    faithful: true
  });

  // 2. 乙听信街头谣言，掌握失真版本（以为对方携款潜逃，不忠实事实）
  W.epistemicView.registerBelief('partner_yi', topic, {
    version: 'v_rumor_fake',
    summary: '传闻木料被私自转卖，交割地空无一物',
    claimTruth: false,
    certainty: 'distrusted',
    source: 'rumor',
    faithful: false
  });

  // 3. 丙未获得任何该事项信息（unaware）

  // 4. 两人推导行动截然不同
  const actJia = W.epistemicView.deriveAction('trader_jia', topic);
  a(actJia.action === 'cooperate_fully', '甲因掌握真实履约信息，选择全力合作');

  const actYi = W.epistemicView.deriveAction('partner_yi', topic);
  a(actYi.action === 'suspend_and_interrogate', '乙因掌握失真违约版本，选择暂停合作并质询');

  const actBing = W.epistemicView.deriveAction('stranger_bing', topic);
  a(actBing.action === 'investigate', '丙不知情，选择调查打听');

  // 5. 玩家向乙出示真实仓库提货签单，纠正乙的信念
  const correctRes = W.epistemicView.correctBelief('partner_yi', topic, {
    version: 'v_verified_voucher',
    proofText: '出示城东仓官署签收印信原件，实货无误',
    source: 'direct_voucher'
  });
  a(correctRes.ok === true && correctRes.corrected === true, '出示铁证纠正信念成功');
  a(correctRes.historicalActionsIntact === true, '历史产生过的停工与质询不被静默抹去');
  a(correctRes.requiresReconciliation === true, '提示双方需要显式进行协商和解');

  // 纠偏后乙的行动改变
  const actYiAfter = W.epistemicView.deriveAction('partner_yi', topic);
  a(actYiAfter.action === 'cooperate_fully', '信念纠偏后乙重新选择合作');

  // 6. 行动桌路由
  const deskRes = W.actionDesk.plan('epistemic.view', {
    personId: 'partner_yi',
    topicId: topic
  });
  a(deskRes.ok === true && deskRes.faithful === true, '行动桌 epistemic.view 路由成功');
}

const mutations = [
  [
    'distorted-belief-bypass',
    'if (!view.claimTruth || !view.faithful) {',
    'if (false) {',
    function (W) {
      W.epistemicView.registerBelief('p_test', 't1', {
        claimTruth: false,
        faithful: false,
        summary: '诈骗'
      });
      const act = W.epistemicView.deriveAction('p_test', 't1');
      return act.action === 'suspend_and_interrogate';
    }
  ],
  [
    'history-intact-bypass',
    'historicalActionsIntact: true,',
    'historicalActionsIntact: false,',
    function (W) {
      W.epistemicView.registerBelief('p_test2', 't2', { faithful: false });
      const res = W.epistemicView.correctBelief('p_test2', 't2', { proofText: '证据' });
      return res.historicalActionsIntact === true;
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
  console.log('EXP19-OP7: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();