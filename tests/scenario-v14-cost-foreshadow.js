'use strict';
// WorldAxis tests/scenario-v14-cost-foreshadow.js
// 验证 WorldAxis V14 场景 13：高压劳作与历史伏笔破土反噬
// 机制覆盖：
//   - OPV14-3: actionCostFeedback.applyEvaluationCosts 评估驱动体力/疲劳真实代价回写与力竭状态
//   - EXV14-3: foreshadowGermination.germinate 历史遗留伏笔自发破土反噬、公开危机与声誉重创
//   - 负控制测试：缺失角色拒绝、缺失行动码拒绝、未成熟破土拒绝、缺失种子拒绝、开关熔断拒绝

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'actionCostFeedback', 'foreshadowGermination', 'difficulty'].forEach(function (k) {
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

  // 初始化角色状态
  W.store.transact(function (d) {
    d.actors = d.actors || {};
    d.actors['p_miner'] = { id: 'p_miner', name: '老矿工', stamina: 60, maxStamina: 100, fatigue: 10, reputation: 80, conditions: [] };
    return true;
  });

  // 1. 正常高强度劳作：体力扣减与疲劳回写 (OPV14-3)
  const c1 = W.actionDesk.plan('actor.applyEvaluationCosts', {
    actorId: 'p_miner',
    actionKey: 'mine.excavate',
    baseCost: 20,
    intensity: 1.5
  });
  a(c1.ok === true && c1.reason === 'cost-applied',
    'S13-1: 行为评估真实代价成功回写到角色档案');
  a(c1.cost === 30 && c1.remainingStamina === 30,
    'S13-2: 体力精准扣除 30 点（60 -> 30）');
  a(c1.fatigue === 25,
    'S13-3: 疲劳值按比例累积 15 点（10 -> 25）');

  // 2. 连续过度劳作致使体力耗尽，触发力竭（exhausted）硬负面状态
  const c2 = W.actionDesk.plan('actor.applyEvaluationCosts', {
    actorId: 'p_miner',
    actionKey: 'mine.emergency_brace',
    baseCost: 35,
    intensity: 1.0
  });
  a(c2.ok === true && c2.remainingStamina === 0,
    'S13-4: 再次高压动作将角色体力彻底抽干（归零）');
  a(c2.exhausted === true && c2.conditions.includes('exhausted'),
    'S13-5: 触发力竭状态硬约束并持久化写入角色 conditions');

  // 3. 验证 store 持久化档案落地
  const s = W.store.get();
  a(s.actors['p_miner'].stamina === 0 && s.actors['p_miner'].conditions.includes('exhausted'),
    'S13-6: 角色力竭状态真实沉淀至 store.actors');
  a(Array.isArray(s.actionCostLogs) && s.actionCostLogs.length === 2,
    'S13-7: 行为代价全链路审计台账真实记录');

  // 4. 伏笔成熟破土反噬 (EXV14-3)
  // 未满 24 小时提前破土应拒绝
  const negPremature = W.actionDesk.plan('drama.germinateForeshadow', {
    seedId: 'seed_shaft_collapse',
    targetActor: 'p_miner',
    elapsedHours: 12
  });
  a(negPremature.ok === false && negPremature.reason === 'seed-not-matured',
    'S13-8: 伏笔未到成熟破土周期物理级拦截拒绝');

  // 超过成熟期（36 小时），强制爆发破土危机
  const g1 = W.actionDesk.plan('drama.germinateForeshadow', {
    seedId: 'seed_shaft_collapse',
    targetActor: 'p_miner',
    elapsedHours: 36,
    severity: 60
  });
  a(g1.ok === true && g1.reason === 'foreshadow-erupted',
    'S13-9: 历史伏笔成熟后自发破土爆发为公开危机');
  a(g1.crisis && g1.crisis.status === 'erupted' && g1.crisis.severity === 60,
    'S13-10: 危机记录正确生成并在案');

  // 5. 验证伏笔爆发对角色的声誉扣减与威胁状态
  const sAfterCrisis = W.store.get();
  a(sAfterCrisis.activeCrises && sAfterCrisis.activeCrises.length === 1,
    'S13-11: 危机记录已沉淀至 activeCrises 态势板');
  a(sAfterCrisis.actors['p_miner'].reputation === 56, // 80 - round(60 * 0.4) = 80 - 24 = 56
    'S13-12: 危机爆发造成角色声誉断崖扣减（80 -> 56）');
  a(sAfterCrisis.actors['p_miner'].conditions.includes('threatened'),
    'S13-13: 角色被强制打上 threatened 威胁受困状态');

  // 6. 破坏性负控制测试 1：缺失角色 ID 必然拒绝
  const neg1 = W.actionDesk.plan('actor.applyEvaluationCosts', {
    actorId: '   ',
    actionKey: 'mine.walk'
  });
  a(neg1.ok === false && neg1.reason === 'missing-actor',
    'S13-NC1: 缺失角色 ID 的代价回写必然拒绝');

  // 7. 破坏性负控制测试 2：缺失行动 Key 必然拒绝
  const neg2 = W.actionDesk.plan('actor.applyEvaluationCosts', {
    actorId: 'p_miner',
    actionKey: ''
  });
  a(neg2.ok === false && neg2.reason === 'missing-action-key',
    'S13-NC2: 缺失行动代码的代价回写必然拒绝');

  // 8. 破坏性负控制测试 3：缺失伏笔种子 ID 必然拒绝
  const neg3 = W.actionDesk.plan('drama.germinateForeshadow', {
    seedId: '',
    targetActor: 'p_miner'
  });
  a(neg3.ok === false && neg3.reason === 'missing-seed-id',
    'S13-NC3: 缺失种子 ID 的伏笔破土必然拒绝');

  // 9. 破坏性负控制测试 4：引擎熔断关闭
  if (W.settingsBus) {
    const reg = W.__settingsRegs.find(function (r) { return r.module === 'foreshadowGermination'; });
    if (reg) W.settingsBus.save(reg, { enabled: false });
  }
  const neg4 = W.actionDesk.plan('drama.germinateForeshadow', {
    seedId: 'seed_test',
    targetActor: 'p_miner',
    elapsedHours: 50
  });
  a(neg4.ok === false && neg4.reason === 'disabled',
    'S13-NC4: 引擎开关关闭时伏笔破土硬熔断拒收');

  console.log('场景 13 专锁全部断言通过（含 4 项真负控制）！');
  console.log('PASS ' + asserts + ' / ' + asserts);
}

runScenario();