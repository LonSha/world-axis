'use strict';
// WorldAxis tests/scenario-v14-credit-rupture.js
// 验证 WorldAxis V14 场景 12：商行暴雷与连带追偿风暴（信用总账硬约束与担保反水）
// 机制覆盖：
//   - OPV14-2: creditLedger.checkCredit 借据总账信用硬约束与逾期穿透拦截
//   - EXV14-2: collateralRupture.ruptureCollateral 连带担保人追偿、行会黑名单与亲密反噬
//   - 负控制测试：自担保拒绝、负数违约拒绝、空担保人拒绝、关闭熔断拒绝

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'creditLedger', 'collateralRupture'].forEach(function (k) {
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

  // 初始化世界参与者状态
  W.store.transact(function (d) {
    d.actors = d.actors || {};
    d.actors['p_boss'] = { id: 'p_boss', name: '钱掌柜', affinity: { 'p_merchant': 40 } };
    d.actors['p_guarantor'] = { id: 'p_guarantor', name: '王富商', affinity: { 'p_boss': 50 }, grudges: [] };
    return true;
  });

  // 1. 验证借款前信用良好
  const c1 = W.actionDesk.plan('creditLedger.checkCredit', { borrower: 'p_boss' });
  a(c1.ok === true && c1.allowed === true && c1.reason === 'good-standing',
    'S12-1: 初始无逾期借据，信用核验良好放行');

  // 2. 钱掌柜立借据，向商会借款 10,000 文
  const now = Date.now();
  const loan = W.actionDesk.plan('creditLedger.open', {
    borrower: 'p_boss',
    lender: 'org_chamber',
    principal: 10000,
    rateMicroPct: 50000,
    days: 3,
    at: now
  });
  a(loan.ok === true && loan.principalLeft === 10000,
    'S12-2: 借据成功设立并落入持久化账簿');

  // 3. 时间流逝 5 天，借据逾期
  const pastDue = now + 5 * 86400 * 1000;
  const c2 = W.actionDesk.plan('creditLedger.checkCredit', { borrower: 'p_boss', at: pastDue });
  a(c2.ok === true && c2.allowed === false && c2.reason === 'overdue-present',
    'S12-3: 借据逾期后触发信用总账硬约束拦截');
  a(c2.overdueCount === 1,
    'S12-4: 准确锁定 1 笔逾期借据');

  // 4. 钱掌柜企图再次借款，被直接熔断拒绝
  const loan2 = W.actionDesk.plan('creditLedger.open', {
    borrower: 'p_boss',
    lender: 'org_bank',
    principal: 5000,
    at: pastDue
  });
  a(loan2.ok === false && loan2.reason === 'overdue-open',
    'S12-5: 逾期状态下物理级拒绝增立新借据');

  // 5. 钱掌柜暴雷潜逃，行会触发连带担保人追偿穿透 (EXV14-2)
  const rupture = W.actionDesk.plan('finance.ruptureCollateral', {
    loanId: loan.id,
    borrowerId: 'p_boss',
    guarantorId: 'p_guarantor',
    defaultAmount: 10000,
    at: pastDue
  });
  a(rupture.ok === true && rupture.reason === 'rupture-enacted',
    'S12-6: 连带担保人追索穿透与社会信用联合制裁成功生效');
  a(Array.isArray(rupture.nextActions) && rupture.nextActions.includes('relationGraph.upsert'),
    'S12-7: 中央行动桌精准派发后续人际拓扑裂变');

  // 6. 验证持久化写口：黑名单、担保人负债与亲密度崩塌
  const s = W.store.get();
  a(s.socialBlacklist && s.socialBlacklist['p_boss'] && s.socialBlacklist['p_boss'].defaultAmount === 10000,
    'S12-8: 违约主债务人被列入全城行会黑名单');
  a(s.guarantorDebts && s.guarantorDebts['p_guarantor'] === 10000,
    'S12-9: 担保人背负连带追偿债务 10,000 文');
  a(s.actors['p_guarantor'].affinity['p_boss'] === -10,
    'S12-10: 担保人与违约主债务人亲密度断崖式下跌 60 点（50 -> -10）');
  a(s.actors['p_guarantor'].grudges.length === 1 && s.actors['p_guarantor'].grudges[0].reason === 'debt-breach',
    'S12-11: 担保人记忆中生成违约背叛仇怨');

  // 7. 破坏性负控制测试 1：自己担保自己必然拒绝
  const neg1 = W.actionDesk.plan('finance.ruptureCollateral', {
    borrowerId: 'p_boss',
    guarantorId: 'p_boss',
    defaultAmount: 1000
  });
  a(neg1.ok === false && neg1.reason === 'same-borrower-guarantor',
    'S12-NC1: 自身担保自身穿透必然拒绝');

  // 8. 破坏性负控制测试 2：负数违约金必然拒绝
  const neg2 = W.actionDesk.plan('finance.ruptureCollateral', {
    borrowerId: 'p_boss',
    guarantorId: 'p_guarantor',
    defaultAmount: -500
  });
  a(neg2.ok === false && neg2.reason === 'invalid-default-amount',
    'S12-NC2: 负数或零违约金必然拒绝');

  // 9. 破坏性负控制测试 3：缺失担保人必然拒绝
  const neg3 = W.actionDesk.plan('finance.ruptureCollateral', {
    borrowerId: 'p_boss',
    guarantorId: '   ',
    defaultAmount: 1000
  });
  a(neg3.ok === false && neg3.reason === 'missing-guarantor',
    'S12-NC3: 缺失担保人穿透必然拒绝');

  // 10. 破坏性负控制测试 4：引擎开关熔断关闭
  if (W.settingsBus) {
    const reg = W.__settingsRegs.find(function (r) { return r.module === 'collateralRupture'; });
    if (reg) W.settingsBus.save(reg, { enabled: false });
  }
  const neg4 = W.actionDesk.plan('finance.ruptureCollateral', {
    borrowerId: 'p_boss',
    guarantorId: 'p_guarantor',
    defaultAmount: 1000
  });
  a(neg4.ok === false && neg4.reason === 'disabled',
    'S12-NC4: 引擎开关关闭时穿透操作硬熔断拒绝');

  console.log('场景 12 专锁全部断言通过（含 4 项真负控制）！');
  console.log('PASS ' + asserts + ' / ' + asserts);
}

runScenario();