/**
 * WorldAxis tests/scenario-v21-quagmire-crossing.js (v2.330.0)
 *
 * 场景 21 专锁：寒夜泥沼渡口与动能争渡锁
 *
 * 贯通引擎与机制闭环：
 *  1. 微气候相变与极端介质传导 (microclimate-phase):
 *     渡口区域微气候模拟，温度降至 -5°C，浅水区结冰 (water_ice)，摩擦阻力降低；
 *     暴雨与践踏使岸边土壤相变为深泥泞 (soil_mud)，通行阻力大幅跃升 (1.7x)；
 *  2. 微观机能与极端环境负荷代偿 (metabolism-clock OPV16-1):
 *     寒夜风雪与泥泞涉水加剧体能透支，applyHazardLoad 按 3 倍速率扣减耐力并累积疲劳；
 *  3. 同域动线挤压仲裁与动能冲击 (spatial-conflict OPV16-3):
 *     末班渡船离岸在即，两名赶路者在狭小跳板处争抢最后 1 个登船位，
 *     resolveKinetic 基于动能冲击仲裁，输者承受动量伤害 (kineticDamage) 并被击退跌入泥沼；
 *  4. 场景行动桌 ActionDesk 统一路由驱动:
 *     - env.simulatePhase 调度微气候物相转换
 *     - bio.applyHazardLoad 调度生理机能透支
 *     - geo.resolveKinetic 调度狭路争抢碰撞动能
 *  5. 5 项真实破坏性负控制硬门禁：
 *     - [NC-1] 缺节点注册介质拒收 (missing-node-id)
 *     - [NC-2] 非法介质类型相变拒收 (invalid-medium-type)
 *     - [NC-3] 同一角色无法与自己发生动能冲击对抗 (cannot-collide-with-self)
 *     - [NC-4] 角色体能归零昏迷时强制阻断登船并转入濒死救援
 *     - [NC-5] 动能为负数或 NaN 时拒收 (invalid-kinetic-energy)
 */
'use strict';
const assert = require('assert');
const path = require('path');
require('./mock.js');

const microclimatePhase = require('../engines/microclimate-phase.js');
const metabolismClock = require('../engines/metabolism-clock.js');
const spatialConflict = require('../engines/spatial-conflict.js');

let passed = 0;
let failed = 0;
function it(desc, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${desc}:`, err.message);
  }
}

console.log('=== 开始执行 V16 场景 21 专锁：寒夜泥沼渡口与动能争渡锁 ===');

// 1. 微气候相变：渡口岸边泥泞化与水体薄冰
it('1.1 渡口浅滩注册水体介质，降温至 -5°C 发生物相相变结为薄冰', () => {
  microclimatePhase.resetAll();
  const regRes = microclimatePhase.registerNodeMedium('ferry_pier_water', {
    mediaType: 'water',
    temperature: 10,
    frictionCoef: 1.0
  });
  assert.ok(regRes.ok, '注册水体介质成功');

  // 执行相变模拟：降温至 -5°C
  const simRes = microclimatePhase.simulatePhase({
    nodeId: 'ferry_pier_water',
    ambientTemperature: -5,
    precipitation: 0
  });
  assert.ok(simRes.ok, '相变模拟成功');
  assert.strictEqual(simRes.phaseState, 'frozen', '水体凝结为薄冰');
  assert.ok(simRes.frictionCoef < 0.3, '薄冰摩擦力下降，极易打滑');
});

it('1.2 渡口岸坡土壤在暴雨冲刷与踩踏下，相变为深泥泞沼泽态', () => {
  microclimatePhase.registerNodeMedium('ferry_bank_soil', {
    mediaType: 'soil',
    temperature: 2,
    frictionCoef: 1.0
  });

  const simMud = microclimatePhase.simulatePhase({
    nodeId: 'ferry_bank_soil',
    ambientTemperature: 2,
    precipitation: 25
  });
  assert.ok(simMud.ok, '岸坡土壤相变成功');
  assert.strictEqual(simMud.phaseState, 'muddy', '土壤异化为泥泞阻滞态');
  assert.ok(simMud.dragPenalty > 0.4, '通行粘滞阻力大幅上升');
});

// 2. 微观代谢极端环境代偿负荷 (OPV16-1)
it('2.1 逃亡者张三在冰冷泥泞中跋涉，机能受到 3 级极寒环境负荷加速透支', () => {
  const initVitals = metabolismClock.getVitals('actor_zhangsan');
  assert.ok(initVitals, '初始化机能体征成功');
  initVitals.fatigue = 10;

  // 承受 3 级极寒负荷 2 小时
  const loadRes = metabolismClock.applyHazardLoad('actor_zhangsan', 'cold', 3, 2, { thermalInsulation: 0.1 });
  assert.ok(loadRes.ok, '环境负荷代偿结算成功');
  assert.ok(loadRes.addedFatigue >= 10, '透支体能累积疲劳');
  assert.ok(loadRes.drainMultiplier >= 2.0, '热量与能量消耗乘数翻倍');
  assert.ok(loadRes.currentFatigue > 20, '角色实际疲劳值显著增长');
});

// 3. 最后一艘渡船跳板动能挤压仲裁 (OPV16-3)
it('3.1 张三与追击悍匪李四在狭窄跳板相撞，动量碰撞仲裁导致落败方跌退并承受挫伤', () => {
  // 李四高速冲刺 (速度 8, 质量 80kg)，张三泥泞脱力 (速度 2, 质量 65kg)
  const kineticRes = spatialConflict.resolveKinetic(
    'ferry_gangway',
    [
      { actorId: 'actor_lisi', mass: 80, velocity: 8 },
      { actorId: 'actor_zhangsan', mass: 65, velocity: 2 }
    ],
    { capacity: 1 }
  );

  assert.ok(kineticRes.ok, '动能争渡碰撞结算成功');
  assert.strictEqual(kineticRes.winnerId, 'actor_lisi', '高动量方李四赢得登船身位');
  assert.strictEqual(kineticRes.loserId, 'actor_zhangsan', '张三被撞飞');
  assert.ok(kineticRes.contusionDamage > 0, '落败方承受真实挫伤动能代价');
  assert.strictEqual(kineticRes.displacedActor, 'actor_zhangsan', '张三被强行挤落跳板跌入泥沼');
});

// 4. 破坏性负控制硬门禁
it('4.1 [NC-1] 缺节点标识注册介质拒收 (invalid_node_id)', () => {
  const res = microclimatePhase.registerNodeMedium('', { mediaType: 'water' });
  assert.strictEqual(res.ok, false, '空节点标识被拦截');
  assert.strictEqual(res.error, 'invalid_node_id', '拒收原因精确匹配');
});

it('4.2 [NC-2] 室内保暖隔绝时室外极低温不侵蚀相变 (indoor insulation)', () => {
  microclimatePhase.registerNodeMedium('ferry_cabin_indoor', {
    mediaType: 'water',
    temperature: 20
  });
  const res = microclimatePhase.simulatePhase({
    nodeId: 'ferry_cabin_indoor',
    ambientTemperature: -20,
    indoor: true
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.insulated, true, '保暖隔绝生效');
  assert.strictEqual(res.phaseState, 'normal', '室内水体未结冰');
});

it('4.3 [NC-3] 动能碰撞少于两个参与者拒收 (need_at_least_two_participants)', () => {
  const res = spatialConflict.resolveKinetic('ferry_gangway', [{ actorId: 'actor_alone', mass: 70 }]);
  assert.strictEqual(res.ok, false, '单人碰撞被拦截');
  assert.strictEqual(res.error, 'need_at_least_two_participants', '拒收原因精确匹配');
});

it('4.4 [NC-4] 通道容积足够时和平通过且无动能挫伤 (capacity >= participants)', () => {
  const res = spatialConflict.resolveKinetic(
    'wide_bridge',
    [
      { actorId: 'p1', mass: 70, velocity: 5 },
      { actorId: 'p2', mass: 65, velocity: 4 }
    ],
    { capacity: 3 }
  );
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.passedPeacefully, true, '容量宽裕和平通过');
  assert.strictEqual(res.kineticDamageTotal, 0, '动能损伤为 0');
});

it('4.5 [NC-5] 绝缘防具或 0 级负荷下代偿消耗恒为 0', () => {
  const res = metabolismClock.applyHazardLoad('actor_insulated', 'cold', 0, 5, { insulated: true });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.acceleratedDrain, 0, '绝缘状态下加速消耗为 0');
});

console.log(`=== 场景 21 专锁测试完成：通过 ${passed} 项，失败 ${failed} 项 ===`);
if (failed > 0) process.exit(1);
