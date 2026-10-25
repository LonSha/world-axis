#!/usr/bin/env node
// WorldAxis tests/exp43-risk-pooling-mutual-aid-v2233.js
// EXV4-7 专锁：地方风险分担与保险式互助
// 验证目标：
//   1. 静态契约导出检查：riskPooling 接口齐全；
//   2. 声明具名互助池（declareRiskPool）：绑定风险种类、封顶上限、缴纳标准；
//   3. 入池承诺与注资（pledgeMutualFund）：成员按期缴纳，真实累加资本；
//   4. 灾前灾后加入隔离（claimMutualRelief）：未在灾前入池者突击理赔遭拦截（not-enrolled-prior-to-disaster）；
//   5. 封顶救助与资金守恒（claimMutualRelief）：赔付受单笔上限约束，且不超过池内结余，资金绝对守恒；
//   6. 资金耗尽与部分折算（claimMutualRelief）：池内资金不足时按残值部分赔偿并转入 insolvent 状态，绝不凭空造钱；
//   7. 欺诈与争议追索（disputeReliefClaim）：对虚假理赔登记调查；
//   8. 纯读只读投影零写入（riskPoolingProjection）：统计资金与偿付，10 次连续调用 store 零写入；
//   9. ActionDesk 路由联动：6 条 riskPooling.* 操作路由畅通可用；
//   10. 负控制验证（Negative Control）：单行真变异（篡改灾前入池核验逻辑），确保判据敏锐报警。
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const RISK_PATH = path.join(BASE, 'engines/risk-pooling.js');
const ANCHOR = "if (priorPledges.length === 0) {";

function runSuite() {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;
  WA.store.init();
  WA.actionDesk.setSettings({ enabled: true });
  let tested = 0;
  function t(desc, cond) {
    assert(cond, desc);
    tested++;
  }

  // 1. 静态契约导出检查
  t('WA.riskPooling 导出存在', !!WA.riskPooling);
  t('declareRiskPool 为函数', typeof WA.riskPooling.declareRiskPool === 'function');
  t('pledgeMutualFund 为函数', typeof WA.riskPooling.pledgeMutualFund === 'function');
  t('claimMutualRelief 为函数', typeof WA.riskPooling.claimMutualRelief === 'function');
  t('disputeReliefClaim 为函数', typeof WA.riskPooling.disputeReliefClaim === 'function');
  t('riskPoolingProjection 为函数', typeof WA.riskPooling.riskPoolingProjection === 'function');
  t('POOL_STATUS 为数组', Array.isArray(WA.riskPooling.POOL_STATUS));

  // 2. 声明互助池
  const poolRes = WA.riskPooling.declareRiskPool({
    id: 'pool_flood_basin',
    name: '河谷防汛互助社',
    riskKind: 'flood',
    regionId: 'river_valley',
    maxPayoutPerClaim: 60,
    pledgeAmount: 20
  });
  t('声明防汛互助池成功', poolRes && poolRes.ok === true);
  t('互助池初始资本为0', poolRes.pool.totalCapital === 0);

  // 3. 成员灾前履约注资
  const nowTs = Date.now();
  const disasterMoment = nowTs + 5000;
  const p1 = WA.riskPooling.pledgeMutualFund({
    poolId: 'pool_flood_basin',
    who: 'farmer_alice',
    amount: 50
  });
  t('Alice 入池注资成功', p1 && p1.ok === true && p1.poolCapital === 50);

  const p2 = WA.riskPooling.pledgeMutualFund({
    poolId: 'pool_flood_basin',
    who: 'miller_milo',
    amount: 30
  });
  t('Milo 入池注资成功', p2 && p2.ok === true && p2.poolCapital === 80);

  // 4. 灾后突击入池申请理赔遭拦截（未经灾前履约）
  const unauthClaim = WA.riskPooling.claimMutualRelief({
    poolId: 'pool_flood_basin',
    who: 'opportunist_oscar',
    incidentId: 'flood_event_01',
    requestedAmount: 40,
    disasterTime: disasterMoment
  });
  t('灾后突击理赔被拦截', unauthClaim && unauthClaim.ok === false);
  t('拦截原因为 not-enrolled-prior-to-disaster', unauthClaim.reason === 'not-enrolled-prior-to-disaster');

  // 5. 正式理赔受封顶约束与资金守恒
  // Alice 申请 100（超过 maxPayoutPerClaim 60），应封顶在 60
  const claim1 = WA.riskPooling.claimMutualRelief({
    poolId: 'pool_flood_basin',
    who: 'farmer_alice',
    incidentId: 'flood_event_01',
    requestedAmount: 100,
    disasterTime: disasterMoment
  });
  t('Alice 理赔成功', claim1 && claim1.ok === true);
  t('理赔金额被单笔上限封顶为 60', claim1.payout === 60);
  t('互助池剩余资本扣减为 20', claim1.remainingCapital === 20);

  // 6. 资金不足时按残值部分赔偿，绝不凭空造钱
  // Milo 申请 50，但池内只剩 20，因此仅赔付 20，且标记 partialCoverage
  const claim2 = WA.riskPooling.claimMutualRelief({
    poolId: 'pool_flood_basin',
    who: 'miller_milo',
    incidentId: 'flood_event_01',
    requestedAmount: 50,
    disasterTime: disasterMoment
  });
  t('Milo 理赔成功且触发部分补偿', claim2 && claim2.ok === true && claim2.partialCoverage === true);
  t('赔付金额严格等于池内剩余结余 20', claim2.payout === 20);
  t('池内资金彻底见底归0', claim2.remainingCapital === 0);

  // 7. 资金耗尽后再申请直接报 insolvent
  const claimEmpty = WA.riskPooling.claimMutualRelief({
    poolId: 'pool_flood_basin',
    who: 'farmer_alice',
    incidentId: 'flood_event_01',
    requestedAmount: 10,
    disasterTime: disasterMoment
  });
  t('资金耗尽后理赔被拦截', claimEmpty && claimEmpty.ok === false && claimEmpty.reason === 'pool-insolvent');

  // 8. 登记理赔欺诈争议
  const dispRes = WA.riskPooling.disputeReliefClaim({
    claimId: claim1.claim.id,
    disputedBy: 'investigator_irene',
    reason: 'exaggerated_loss'
  });
  t('争议申报成功', dispRes && dispRes.ok === true && dispRes.dispute.status === 'under_investigation');

  // 9. 纯读只读投影零写入（10 次连续调用状态隔离）
  const s0 = JSON.stringify(WA.store.get().riskPooling);
  let p10;
  for (let i = 0; i < 10; i++) {
    p10 = WA.riskPooling.riskPoolingProjection('pool_flood_basin');
  }
  const s10 = JSON.stringify(WA.store.get().riskPooling);
  t('纯读投影连续 10 次 store 零写入', s0 === s10);
  t('投影池状态准确反映 insolvent', p10.pools[0].status === 'insolvent');
  t('投影已赔付金额准确', p10.totalPaidOut === 80);

  // 10. ActionDesk 路由畅通
  const deskPool = WA.actionDesk.plan('riskPooling.declareRiskPool', {
    name: '旱灾保险仓',
    riskKind: 'drought'
  });
  t('ActionDesk declareRiskPool 可用', deskPool && deskPool.ok === true);

  const deskPledge = WA.actionDesk.plan('riskPooling.pledgeMutualFund', {
    poolId: deskPool.pool.id,
    who: 'farmer_bob',
    amount: 15
  });
  t('ActionDesk pledgeMutualFund 可用', deskPledge && deskPledge.ok === true);

  const deskProj = WA.actionDesk.plan('riskPooling.riskPoolingProjection', {
    poolId: deskPool.pool.id
  });
  t('ActionDesk riskPoolingProjection 可用', deskProj && deskProj.ok === true);

  const deskEnums = WA.actionDesk.plan('riskPooling.poolStatus', {});
  t('ActionDesk poolStatus 枚举可用', Array.isArray(deskEnums) && deskEnums.length > 0);

  return tested;
}

// 负控制自验证逻辑：篡改灾前入池检查，放行突击入池理赔者
function runNegativeVariant() {
  const code = fs.readFileSync(RISK_PATH, 'utf8');
  assert(code.indexOf(ANCHOR) >= 0, '锚点代码存在');
  // 将 if (priorPledges.length === 0) 篡改为 if (false && priorPledges.length === 0)
  const mutated = code.replace(ANCHOR, 'if (false && priorPledges.length === 0) {');
  fs.writeFileSync(RISK_PATH, mutated, 'utf8');
  let threw = false;
  try {
    delete require.cache[require.resolve(RISK_PATH)];
    runSuite();
  } catch (err) {
    threw = true;
  } finally {
    fs.writeFileSync(RISK_PATH, code, 'utf8');
    delete require.cache[require.resolve(RISK_PATH)];
  }
  return threw;
}

if (require.main === module) {
  console.log('Running exp43-risk-pooling-mutual-aid-v2233...');
  const testsPassed = runSuite();
  console.log(`✓ exp43 原版测试全部通过（${testsPassed} 项断言）`);
  const negPassed = runNegativeVariant();
  assert(negPassed, '负控制单行破坏必须引发测试断言报警');
  console.log('✓ exp43 负控制单行变异触发敏锐报警');
}

module.exports = { runSuite, runNegativeVariant };