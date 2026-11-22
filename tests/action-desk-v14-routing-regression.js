'use strict';
const assert = require('assert');
require('./mock.js');
const W = require('./ui-gate-sync.js').fresh().WA;
W.store.init();

// Enable actionDesk and related engines
W.actionDesk.setSettings({ enabled: true });
['actionCostFeedback', 'courierDispatch', 'foreshadowGermination', 'collateralRupture',
 'cognitivePoisoning', 'supplyChoke', 'dilemmaBargain', 'factionSchism',
 'institutionalSchism', 'sanctuaryScramble', 'branchTransplant', 'counterfactualEcho',
 'environmentInterference', 'rumorCognition'].forEach(k => {
  if (W[k] && typeof W[k].setSettings === 'function') W[k].setSettings({ enabled: true });
});

(async () => {
  console.log('Testing actionDesk routing to V14 engines...');
  
  // 1. actionCost.feedback
  const resCost = W.actionDesk.plan('actionCost.feedback', { actorId: 'p_甲', actionKind: 'heavy-labor' });
  assert(resCost, 'actionCost.feedback must return result');
  
  // 2. courier.sendDispatch
  const resCourier = W.actionDesk.plan('courier.sendDispatch', {
    dispatchId: 'disp_1', fromCity: '城A', toCity: '城B', distanceKm: 40, letter: '告急文书', recipient: 'p_乙'
  });
  assert(resCourier, 'courier.sendDispatch must return result');
  
  // 3. supply.choke
  const resChoke = W.actionDesk.plan('supply.choke', {
    routeId: 'route_雪道', destinationCity: '临冬城', resourceKind: 'grain'
  });
  assert(resChoke, 'supply.choke must return result');

  // 4. dilemma.negotiate
  const resBargain = W.actionDesk.plan('dilemma.negotiate', {
    partyA: '宗族长', partyB: '商会会长', stakes: '运河收税权'
  });
  assert(resBargain, 'dilemma.negotiate must return result');

  // 5. faction.schism
  const resSchism = W.actionDesk.plan('faction.schism', {
    factionId: 'faction_守旧派', ideologySplit: '开放互市与祖宗成法之争'
  });
  assert(resSchism, 'faction.schism must return result');

  // 6. sanctuary.scramble
  const resScramble = W.actionDesk.plan('sanctuary.scramble', {
    sanctuaryId: '地下堡垒', candidates: ['p_甲', 'p_乙']
  });
  assert(resScramble, 'sanctuary.scramble must return result');

  // 7. branch.transplant
  const resTransplant = W.actionDesk.plan('branch.transplant', {
    sourceBranchId: 'timeline_主线', targetBranchId: 'timeline_支线', factKey: '王城陷落', factValue: true
  });
  assert(resTransplant, 'branch.transplant must return result');

  // 8. environment.disrupt
  const resEnv = W.actionDesk.plan('environment.disrupt', {
    weatherCondition: '暴风雪', severity: 85, affectedRegions: ['北境']
  });
  assert(resEnv, 'environment.disrupt must return result');

  console.log('actionDesk V14 bridged routing regression: PASS');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});