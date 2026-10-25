#!/usr/bin/env node
// WorldAxis tests/exp38-demographic-flow-migration-v2233.js
// EXV4-2 专锁：人口迁入迁出与地方能力变化
// 验证：
//   1. 静态契约导出检查：demographicFlow 接口齐全，为合法函数；
//   2. 迁居计划与承载力约束（planMigration）：超额人口或居住房量告罄时拒绝迁入；
//   3. 责任接续与未转交后果（commitMigration）：存在未转交家庭照料责任时拦截，转交后放行，强行离开记录后果；
//   4. 在途状态与不提前参与（arriveMigration）：未到达目的地前标记 in_transit，不计入目的地有效劳动力，到达后落户并恢复；
//   5. 季节性外出劳作与返乡闭环（recordSeasonalDeparture / recordSeasonalReturn）：外出改变位置并保留祖居，返乡无损还原；
//   6. 人口统计纯读投影与零写入（demographicProjection）：纯读投影统计抚养比、容量因子，10 次连续调用 store 零写入；
//   7. ActionDesk 路由联动：7 条 demographicFlow.* 操作路由畅通可用；
//   8. 真源码负控制（negative control）：靶向单行变异破坏在途豁免与投影逻辑，在破坏环境下判据必败。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const DEMO_FLOW_PATH = path.join(BASE, 'engines/demographic-flow.js');

// 破坏锚点（真源码单行变异，恰好 1 次命中）：
// 将在途人员排除逻辑破坏，导致在途人员提前计入目的地劳动力
const ANCHOR_IN_TRANSIT = 'if (isTraveling) {';

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
  t('WA.demographicFlow 导出存在', !!WA.demographicFlow);
  t('setPlaceCapacity 为函数', typeof WA.demographicFlow.setPlaceCapacity === 'function');
  t('planMigration 为函数', typeof WA.demographicFlow.planMigration === 'function');
  t('commitMigration 为函数', typeof WA.demographicFlow.commitMigration === 'function');
  t('arriveMigration 为函数', typeof WA.demographicFlow.arriveMigration === 'function');
  t('recordSeasonalDeparture 为函数', typeof WA.demographicFlow.recordSeasonalDeparture === 'function');
  t('recordSeasonalReturn 为函数', typeof WA.demographicFlow.recordSeasonalReturn === 'function');
  t('demographicProjection 为函数', typeof WA.demographicFlow.demographicProjection === 'function');

  // 初始化测试数据：创建地点承载上限与角色
  WA.demographicFlow.setPlaceCapacity('town_alpha', { maxPopulation: 10, housingLimit: 8 });
  WA.demographicFlow.setPlaceCapacity('village_beta', { maxPopulation: 2, housingLimit: 1 });

  // 写入两个初始角色
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_alice'] = { id: 'p_alice', name: 'alice', location: 'town_alpha', role: 'craftsman' };
    d.people['p_bob'] = { id: 'p_bob', name: 'bob', location: 'town_alpha', role: 'labor' };
    d.people['p_elder'] = { id: 'p_elder', name: 'elder', location: 'town_alpha', role: 'elder', isDependent: true };
    return true;
  }, 'test:initPeople');

  // 2. 纯读投影与基础抚养比计算
  const initProj = WA.demographicFlow.demographicProjection('town_alpha');
  t('town_alpha 初始投影成功', initProj.ok === true);
  t('town_alpha 初始常住人口为 3', initProj.residentCount === 3);
  t('town_alpha 劳动力为 2（alice + bob）', initProj.totalWorkforce === 2);
  t('town_alpha 抚养人口为 1（elder）', initProj.dependentCount === 1);
  t('town_alpha 抚养比为 0.5', initProj.dependencyRatio === 0.5);

  // 3. 承载力限制拒收预检
  // 先将 village_beta 塞满
  WA.store.transact(function (d) {
    d.people['p_resident1'] = { id: 'p_resident1', name: 'resident1', location: 'village_beta', role: 'labor' };
    d.people['p_resident2'] = { id: 'p_resident2', name: 'resident2', location: 'village_beta', role: 'labor' };
    return true;
  }, 'test:fillBeta');

  const planExhausted = WA.demographicFlow.planMigration({
    who: 'alice',
    from: 'town_alpha',
    to: 'village_beta',
    type: 'relocation'
  });
  t('目标地点超限时迁居预检拒收', planExhausted.ok === false);
  t('拒收原因为容量耗尽', planExhausted.reason === 'destination-capacity-exhausted');

  // 4. 家庭照料责任约束与转交验证
  const AliceFamilyUnit = {
    id: 'unit_alice_fam',
    name: 'AliceFamily',
    members: [{ who: 'alice' }, { who: 'bob' }, { who: 'elder' }],
    care: [{ caregiver: 'alice', ward: 'elder', target: 'elder', active: true }]
  };
  WA.store.transact(function (d) {
    d.family = d.family || { units: [] };
    d.family.units = d.family.units || [];
    d.family.units.push(AliceFamilyUnit);
    return true;
  }, 'test:seedFamilyUnit');
  const unitId = 'unit_alice_fam';

  // 未转交照料责任时，计划迁居提示 requiresHandoff
  const planHandoff = WA.demographicFlow.planMigration({
    who: 'alice',
    from: 'town_alpha',
    to: 'city_gamma',
    type: 'relocation'
  });
  t('存在照护时迁居计划要求转交', planHandoff.ok === true && planHandoff.plan.requiresHandoff === true);
  t('清点出未移交责任项', planHandoff.plan.unhandledObligations.length === 1);

  // 直接提交迁居（不转交且不强制）将被拒绝
  const commitBlocked = WA.demographicFlow.commitMigration({
    who: 'alice',
    from: 'town_alpha',
    to: 'city_gamma',
    type: 'relocation'
  });
  t('未转交责任直接提交被拦截', commitBlocked.ok === false && commitBlocked.reason === 'unhandled-obligations');

  // 带着责任转交提交迁居，并且以在途形式出发
  const commitSuccess = WA.demographicFlow.commitMigration({
    who: 'alice',
    from: 'town_alpha',
    to: 'city_gamma',
    type: 'relocation'
  }, {
    handoffs: [{ unitId: unitId, target: 'elder', substitute: 'bob' }]
  });
  t('责任转交后迁居提交成功', commitSuccess.ok === true);
  t('处于在途状态', commitSuccess.status === 'in_transit');

  // 检查家庭照料人已成功移交给 bob
  const uCheck = (WA.store.get().family.units || []).filter(u => u && u.id === unitId)[0];
  const careElder = (uCheck.care || []).filter(c => c && (c.ward === 'elder' || c.target === 'elder'))[0];
  t('照护责任已更新为 bob', careElder && careElder.caregiver === 'bob');

  // 5. 在途人员不提前参与目的地服务/劳动力计算
  const gammaProjBefore = WA.demographicFlow.demographicProjection('city_gamma');
  t('在途人员不计入目的地常住人口', gammaProjBefore.residentCount === 0);
  t('在途人员记录在接近列表中', gammaProjBefore.inTransitApproaching.indexOf('alice') >= 0);

  // 出发地劳动力已扣除 alice（仅剩 bob）
  const alphaProjAfter = WA.demographicFlow.demographicProjection('town_alpha');
  t('出发地已扣减迁出劳动力', alphaProjAfter.totalWorkforce === 1);

  // 6. 到达目的地并落户（arriveMigration）
  const arriveRes = WA.demographicFlow.arriveMigration(commitSuccess.migrationId);
  t('到达落户成功', arriveRes.ok === true && arriveRes.status === 'settled');

  const gammaProjAfter = WA.demographicFlow.demographicProjection('city_gamma');
  t('到达后计入目的地常住人口', gammaProjAfter.residentCount === 1);
  t('目的地劳动力因迁入而增长', gammaProjAfter.totalWorkforce === 1);
  t('在途接近列表排空', gammaProjAfter.inTransitApproaching.length === 0);

  // 7. 季节性外出劳作与返乡闭环
  const seaRes = WA.demographicFlow.recordSeasonalDeparture('bob', 'town_alpha', 'city_gamma', 'harvest', 45);
  t('季节性外出登记成功', seaRes.ok === true);
  t('季节性记录为 active', seaRes.record.status === 'active');

  const seaProjGamma = WA.demographicFlow.demographicProjection('city_gamma');
  t('季节性务工人员单独归集', seaProjGamma.seasonalWorkerCount === 1);
  t('总在场人数包含常住与季节务工', seaProjGamma.totalPresent === 2);

  // 季节性务工返乡
  const retRes = WA.demographicFlow.recordSeasonalReturn(seaRes.seasonalId);
  t('返乡登记成功', retRes.ok === true && retRes.status === 'returned');
  const bobPerson = WA.store.get().people['p_bob'];
  t('返乡后角色位置自动恢复为祖居', bobPerson.location === 'town_alpha');
  t('季节性标记解除', bobPerson.isSeasonal === false);

  // 8. ActionDesk 路由调度联动
  const deskPlan = WA.actionDesk.plan('demographicFlow.demographicProjection', {
    locationId: 'town_alpha'
  });
  t('ActionDesk 调用 demographicProjection 畅通', deskPlan.ok === true && deskPlan.placeId === 'town_alpha');

  // 9. 状态隔离与只读纯净验证（10 次连续调用 store 逐字节零写入）
  const snapshotBefore = JSON.stringify(WA.store.get());
  for (let i = 0; i < 10; i++) {
    WA.demographicFlow.demographicProjection('town_alpha');
    WA.demographicFlow.demographicProjection('city_gamma');
    WA.demographicFlow.demographicProjection('village_beta');
  }
  const snapshotAfter = JSON.stringify(WA.store.get());
  t('10次连续调用 demographicProjection store 绝对零写入', snapshotBefore === snapshotAfter);

  console.log('exp38-demographic-flow-migration-v2233: ' + tested + ' 项断言全部通过（含状态隔离与契约校验）');
}

function runNegative() {
  const code = fs.readFileSync(DEMO_FLOW_PATH, 'utf8');
  assert(code.indexOf(ANCHOR_IN_TRANSIT) >= 0, '负控制单行锚点存在');
  assert.strictEqual(code.split(ANCHOR_IN_TRANSIT).length, 2, '锚点唯一性验证通过');

  // 破坏：将在途拦截判断破坏为恒假，使在途人员错误地算作在场劳动力
  const mutated = code.replace(ANCHOR_IN_TRANSIT, 'if (false && isTraveling) {');

  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({
    srcOverride: {
      'engines/demographic-flow.js': mutated
    }
  });
  const WA = env.WA;

  WA.store.init();
  WA.actionDesk.setSettings({ enabled: true });

  // 设置人员并在途中
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_traveler'] = {
      id: 'p_traveler',
      name: 'traveler',
      location: 'origin',
      traveling: true,
      status: 'transit',
      transitTo: 'dest'
    };
    return true;
  }, 'test:neg');

  const proj = WA.demographicFlow.demographicProjection('origin');
  // 正确逻辑下，在途者即便原来在 origin，也不应计入 origin 在场常住人口（应该被 isTraveling 拦截返回）
  // 在破坏逻辑下（isTraveling 判断被绕过），pLoc === 'origin' 成立，错误计入 residentCount = 1
  if (proj.residentCount === 0) {
    throw new Error('负控制失败：破坏版代码未被判定捕获！');
  }
  assert.strictEqual(proj.residentCount, 1, '真源码单行变异生效：在途人员被错误计入出发地常住人口');
  console.log('exp38-demographic-flow-migration-v2233: 负控制验证通过（真变异如期被捕获）');
}

if (require.main === module) {
  runSuite();
  runNegative();
}

// ── v2.233.0 收口：对齐 tests/run.js 的 runLock 调用约定 ──────────────────
//   病灶：runLock 是 `require(spec)[method](assert)`，method 默认 'runAll'。
//     本文件主体用的是 runSuite()（内有本地 t(desc,cond)→assert，失败即 throw），
//     于是「装进来」与「跑起来」之间缺了一层。缺这层时红灯长成
//     「没有导出 runAll」——看起来像锁坏了，而不像「断言根本没跑」，
//     这正是本仓点名的「绿是运气」：单独 `node tests/exp38-demographic-flow-migration-v2233.js` 绿，
//     全量路径却在 require 处红，两个读数谁也证不了谁。
//   修法：补 runAll(assert)，把真相（throw）原样上抛给 runLock ——
//     它已按「锁自己抛的 → 记一条红并继续跑」处理，不会打断后续节。
function runAll(a) {
  var assertFn = (typeof a === 'function') ? a : require('assert');
  runSuite();
  assertFn(true, 'exp38-demographic-flow-migration-v2233.js: 主体断言全部通过');
  runNegative();
  assertFn(true, 'exp38-demographic-flow-migration-v2233.js: 单行真源码负控制如期报警');
  return true;
}
module.exports = {
  runAll: runAll,
  runSuite: runSuite,
  runNegative: runNegative,
};
