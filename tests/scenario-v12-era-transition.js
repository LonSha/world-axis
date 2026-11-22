'use strict';
/**
 * tests/scenario-v12-era-transition.js
 *
 * 《V12_MASTER_PLAN.md》世界级贯通场景 4：时代转折
 * 链路：抽象知识解锁 → 生产与服务变化 → 公共议程形成 → 制度阻力与联盟 → 决策与代价 → 新阶段开放不同玩法。
 *
 * 铁律纪律：
 * 1. 拒绝独立演示脚本：全程通过统一调度总线 `actionDesk.plan()` 与真实业务写口推进；
 * 2. 状态真源闭环：
 *    - 研究与知识突破通过 `research.open` / `research.supply` / `research.advance` 真实推进并确认落账；
 *    - 生产与布局变化通过 `phaseTransition.declarePlaceLayout` 与 `investPath` 积累转型势能；
 *    - 城市公共议程通过 `publicAgenda.submitProposal` / `scheduleAgenda` / `enactAgendaTopic` 形成制度议案；
 *    - 制度阻力与惯性通过 `institutionalInertia.establishCharter` 与审查机制展现旧体制羁绊；
 *    - 决策与转型代价通过 `phaseTransition.executeTransitionRoute` 真实扣除转型资金并承担沉没成本损失；
 *    - 新阶段开放通过 `phaseTransition.evaluatePlacePath` 验证生产效率提升与物流成本降低，正式开启全新协作玩法！
 */
const uiGate = require('./ui-gate-sync.js');

let pass = 0, fail = 0;
function a(desc, cond) {
  if (cond) {
    pass++;
    console.log('✓ PASS:', desc);
  } else {
    fail++;
    console.error('✗ FAIL:', desc);
  }
}

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'research', 'phaseTransition', 'publicAgenda', 'institutionalInertia', 'economy'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

async function runScenario() {
  console.log('=== 开始 V12 贯通场景 4：时代转折 ===');
  const W = env();

  // 0. 准备初始世界、人物与经济底盘：匠师鲁班、行会长老墨子、工坊中心
  W.store.transact(function (d) {
    d.clock = { round: 1, iso: '2026-11-06', label: '开元初年' };
    d.people = d.people || {};
    d.people['p_鲁班'] = { id: 'p_鲁班', name: '鲁班', place: 'industrial_hub', resources: { raw_ore: 50, gold: 200 } };
    d.people['p_墨子'] = { id: 'p_墨子', name: '墨子', place: 'industrial_hub', resources: { gold: 300 } };
    d.economy = d.economy || {};
    d.economy.money = { funds: 500 };
    return true;
  }, 'scenario4:init');

  // 1. 抽象知识解锁：开启「连铸高炉水力冶炼法」技术研究并供料推进
  const openRes = W.actionDesk.plan('research.open', {
    spec: {
      hypothesis: '利用水车凸轮连动风箱，实现高炉不间断连续冶炼',
      by: '鲁班',
      result: 'continuous_smelting',
      resultKind: 'method',
      phases: 2,
      materials: { raw_ore: 10 }
    }
  });
  a('1.1 时代关键技术通过 research.open 正式立案', openRes && openRes.ok && openRes.id);
  const projId = openRes.id;

  // 1.2 供料与推进阶段 1
  const supplyRes = W.actionDesk.plan('research.supply', {
    projectId: projId,
    who: '鲁班',
    material: 'raw_ore',
    amount: 10
  });
  a('1.2 技术研究所需原料供应到位', supplyRes && supplyRes.ok);

  const adv1 = W.actionDesk.plan('research.advance', { projectId: projId, evidence: '水车传动转速稳定测试成功' });
  a('1.3 推进技术研究阶段 1', adv1 && adv1.ok);

  // 推进最终阶段并确认成果落账
  const adv2 = W.actionDesk.plan('research.advance', { projectId: projId, evidence: '高炉出铁量提升三倍，技术突破' });
  a('1.4 技术研究圆满完成并确认成果', adv2 && adv2.ok && adv2.status === 'confirmed');

  // 2. 生产与服务形态酝酿变化：初期工坊为传统分散作坊（decentralized_workshop）
  const declRes = W.actionDesk.plan('phaseTransition.declarePlaceLayout', {
    placeId: 'industrial_hub',
    layoutType: 'decentralized_workshop',
    initialInvestment: 20
  });
  a('2.1 工坊区初始形态为传统分散作坊', declRes && declRes.ok);

  // 持续注资研发基础设施积累转型潜能
  const invRes = W.actionDesk.plan('phaseTransition.investPath', {
    placeId: 'industrial_hub',
    amount: 30,
    investor: '鲁班'
  });
  a('2.2 向枢纽基础设施注入转型累积资本', invRes && invRes.ok);

  // 3. 公共议程形成：将「集约化水利工坊中心改建」提上城市议事日程
  W.actionDesk.plan('publicAgenda.setAgendaCapacity', { place: 'industrial_hub', slots: 3 });
  const propRes = W.actionDesk.plan('publicAgenda.submitProposal', {
    spec: {
      id: 'prop_industrial_centralization',
      placeId: 'industrial_hub',
      groupName: 'guild_reformers',
      title: '关于改建集约化水利协作中心的产业转型提案',
      category: 'public_project',
      sourceEvidence: 'water_wheel_schematic_approved',
      supportWeight: 5
    }
  });
  a('3.1 产业转型议案提交城市公共议程', propRes && propRes.ok);

  const schedRes = W.actionDesk.plan('publicAgenda.scheduleAgenda', { place: 'industrial_hub' });
  a('3.2 公共议程完成排期进入法定审议阶段', schedRes && schedRes.ok);

  // 4. 制度阻力与传统势力羁绊：传统老行会章程带来的阻力
  const charterRes = W.actionDesk.plan('institutionalInertia.establishCharter', {
    spec: {
      id: 'charter_ancient_guild',
      title: '铁匠行会世代传承祖训',
      leader: 'elder_craftsman',
      placeId: 'industrial_hub',
      requiredPractitionerSkill: 'traditional_forging'
    }
  });
  a('4.1 传统行会既有祖训章程在场，体现制度刚性', charterRes && charterRes.ok);

  // 联盟协商与议案表决通过：克服阻力正式颁布转型法案
  const enactRes = W.actionDesk.plan('publicAgenda.enactAgendaTopic', {
    spec: {
      proposalId: 'prop_industrial_centralization',
      outcome: 'enacted'
    }
  });
  a('4.2 制度阻力达成妥协，公共议案正式颁布施行', enactRes && enactRes.ok && enactRes.outcome === 'enacted');

  // 5. 决策与代价：规划转型路线并执行重组相变（承担转型费用与沉没成本注销）
  const planRouteRes = W.actionDesk.plan('phaseTransition.planTransitionRoute', {
    placeId: 'industrial_hub',
    targetLayout: 'shared_service_center'
  });
  a('5.1 规划重组路线，测算资金代价与沉没成本', planRouteRes && planRouteRes.ok && planRouteRes.transitionCost > 0);

  // 执行最终重组转型（真实扣除资金，清空历史沉没资产）
  const execRes = W.actionDesk.plan('phaseTransition.executeTransitionRoute', {
    placeId: 'industrial_hub',
    targetLayout: 'shared_service_center'
  });
  a('5.2 执行相变转型：真金白银扣款并注销沉没投资', execRes && execRes.ok && execRes.newLayout === 'shared_service_center');
  a('5.3 转型发生真实资金扣减', execRes.fundsSpent > 0);

  // 6. 新阶段开放全新协作玩法：验证生产效率显著提升、物流摩擦显著降低
  const pathEval = W.actionDesk.plan('phaseTransition.evaluatePlacePath', { placeId: 'industrial_hub' });
  a('6.1 新阶段形态已成为 shared_service_center', pathEval && pathEval.layoutType === 'shared_service_center');
  a('6.2 集约化带来生产工效加成 (efficiencyFactor > 1)', pathEval.efficiencyFactor > 1.0);
  a('6.3 集约化带来运输阻力与物流成本降低 (transitCostFactor < 1)', pathEval.transitCostFactor < 1.0);

  console.log(`\n=== 场景 4 时代转折验收完成: pass=${pass}, fail=${fail} ===`);
  if (fail > 0) process.exit(1);
}

runScenario().catch(function (e) {
  console.error('Scenario 4 uncaught error:', e);
  process.exit(1);
});