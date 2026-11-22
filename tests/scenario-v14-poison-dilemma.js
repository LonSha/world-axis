'use strict';
// WorldAxis tests/scenario-v14-poison-dilemma.js
// 验证 WorldAxis V14 场景 15：谍报投毒、有限认知投影与谈判桌妥协困局
// 机制覆盖：
//   - OPV14-5: rumorCognition.projectRumorToActor 传闻圈层衰减投影与非全知私有化
//   - EXV14-5: cognitivePoisoning.plantForgedIntel 伪造情报投毒与洞察鉴别判定
//   - EXV14-6: dilemmaBargain.negotiate 复合利益困局谈判、效用阈值与和解条约
//   - 负控制测试：超距传闻拒收、缺失投毒者拒绝、同一谈判方拒绝、熔断开关关闭拒绝

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'rumorCognition', 'cognitivePoisoning', 'dilemmaBargain'].forEach(function (k) {
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

  // 初始化世界角色
  W.store.transact(function (d) {
    d.actors = d.actors || {};
    d.actors['p_spy'] = { id: 'p_spy', name: '敌国密探' };
    d.actors['p_general'] = { id: 'p_general', name: '守关将军', beliefs: [], suspicions: [] };
    d.actors['p_civilian'] = { id: 'p_civilian', name: '远郊村民' };
    return true;
  });

  // 1. 公共传闻按社交圈层单向投影：近圈层守将听到，远郊村民听不到 (OPV14-5)
  const p1 = W.actionDesk.plan('society.projectRumor', {
    rumorKey: 'rumor_enemy_raid',
    rumorText: '敌军前锋已在黑水河渡口集结',
    targetActorId: 'p_general',
    socialHops: 1
  });
  a(p1.ok === true && p1.heard === true && p1.distorted === false,
    'S15-1: 守关将军位于核心圈层（1 跳），清晰接收风声传闻');

  const pFar = W.actionDesk.plan('society.projectRumor', {
    rumorKey: 'rumor_enemy_raid',
    rumorText: '敌军前锋已在黑水河渡口集结',
    targetActorId: 'p_civilian',
    socialHops: 5 // 超出 3 跃点
  });
  a(pFar.ok === true && pFar.heard === false && pFar.reason === 'out-of-earshot',
    'S15-2: 远郊村民距离过远（5 跳），物理阻断未听到传闻（拒绝全知泄露）');

  // 2. 密探制造伪造假军令投毒守将：守将洞察力不足（35 < 65），被欺骗误判 (EXV14-5)
  const poison = W.actionDesk.plan('society.plantForgedIntel', {
    planterId: 'p_spy',
    targetActorId: 'p_general',
    fakeClaim: '兵部急令：关防守军即刻撤往南关增援！',
    disguiseDC: 65,
    targetInsight: 35
  });
  a(poison.ok === true && poison.deceived === true,
    'S15-3: 守将洞察力不及假军令伪装DC，假情报投毒成功欺骗');

  const sAfterPoison = W.store.get();
  a(sAfterPoison.actors['p_general'].beliefs.length === 1 && sAfterPoison.actors['p_general'].beliefs[0].poisoned === true,
    'S15-4: 守将被深度欺骗，伪造军令作为真事实沉淀进其信念库');

  // 3. 双方在谈判桌上达成非零和妥协条约 (EXV14-6)
  const bargain = W.actionDesk.plan('drama.negotiateDilemma', {
    partyA: 'p_general',
    partyB: 'p_spy',
    offerAtoB: '开放走廊但保留查验权',
    offerBtoA: '提供真实行军图并推迟交火',
    utilityA: 45, // > 30 底线
    utilityB: 50  // > 30 底线
  });
  a(bargain.ok === true && bargain.ratified === true,
    'S15-5: 双方效用均越过底线，谈判桌达成和解妥协协议');

  const sAfterBargain = W.store.get();
  a(sAfterBargain.pacts && sAfterBargain.pacts.length === 1 && sAfterBargain.pacts[0].ratified === true,
    'S15-6: 和解条约落入世界法条账簿');
  a(sAfterBargain.actors['p_general'].affinity['p_spy'] === 15,
    'S15-7: 达成和解条约后双方互信度上升');

  // 4. 破坏性负控制测试 1：缺失投毒发起人必然拒绝
  const neg1 = W.actionDesk.plan('society.plantForgedIntel', {
    planterId: '',
    targetActorId: 'p_general',
    fakeClaim: '伪令'
  });
  a(neg1.ok === false && neg1.reason === 'missing-planter',
    'S15-NC1: 缺失投毒发起人必然拒绝');

  // 5. 破坏性负控制测试 2：自己向自己投毒假情报必然拒绝
  const neg2 = W.actionDesk.plan('society.plantForgedIntel', {
    planterId: 'p_general',
    targetActorId: 'p_general',
    fakeClaim: '伪令'
  });
  a(neg2.ok === false && neg2.reason === 'same-planter-target',
    'S15-NC2: 自己向自己投毒伪造军令必然拒绝');

  // 6. 破坏性负控制测试 3：自己与自己谈判必然拒绝
  const neg3 = W.actionDesk.plan('drama.negotiateDilemma', {
    partyA: 'p_general',
    partyB: 'p_general'
  });
  a(neg3.ok === false && neg3.reason === 'same-party',
    'S15-NC3: 单方自身与自身谈判必然拒绝');

  // 7. 破坏性负控制测试 4：谈判引擎开关熔断关闭
  if (W.settingsBus) {
    const reg = W.__settingsRegs.find(function (r) { return r.module === 'dilemmaBargain'; });
    if (reg) W.settingsBus.save(reg, { enabled: false });
  }
  const neg4 = W.actionDesk.plan('drama.negotiateDilemma', {
    partyA: 'p_general',
    partyB: 'p_spy',
    utilityA: 50,
    utilityB: 50
  });
  a(neg4.ok === false && neg4.reason === 'disabled',
    'S15-NC4: 引擎开关关闭时和解谈判硬熔断拒收');

  console.log('场景 15 专锁全部断言通过（含 4 项真负控制）！');
  console.log('PASS ' + asserts + ' / ' + asserts);
}

runScenario();