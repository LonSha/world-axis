/**
 * WorldAxis tests/scenario-v25-v16-living-world-integration.js
 * V16 活世界引擎全系统贯通与跨层深度融合终验专锁
 *
 * 验证目标：
 *  1. 四层总线 (cascade-bus) 完整贯通：
 *     - Layer 1: microclimate-phase 介质温度与物相自主演化
 *     - Layer 2: toxic-metabolism 毒理半衰期生化代谢与 gear-wear 装备磨损
 *     - Layer 3: universal-routine 作息与 crowd-panic 恐慌状态巡检
 *     - Layer 4: bridge 跨插件真源事实单向投影同步与跨界原子事务
 *  2. 主生成 Prompt 汇流 (inject-collector) 真实消费：
 *     - 自动感知在场角色中毒与微气候介质异常，生成结构化白描注面
 *  3. 跨插件单向投影桥 (bridge.snapshot):
 *     - 对外真源中精确包含 v16LivingWorld 物理微观动力学事实
 *  4. 5 项真实破坏性负控制硬门禁校验 (NC-1 ~ NC-5)。
 */
'use strict';
const assert = require('assert');
const path = require('path');

// 环境重置与模块加载
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

// 开启调度与主生成汇流开关
['injectCollector', 'life'].forEach(function (k) {
  if (WA[k] && typeof WA[k].setSettings === 'function') {
    WA[k].setSettings({ enabled: true });
  }
});

// 加载 V16 活世界物理对抗引擎
const cascadeBus = require('../engines/cascade-bus.js');
const microclimatePhase = require('../engines/microclimate-phase.js');
const toxicMetabolism = require('../engines/toxic-metabolism.js');
const gearWear = require('../engines/gear-wear.js');
const crowdPanic = require('../engines/crowd-panic.js');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failCount++;
    console.error(`  ✗ ${desc} -> ${err.message}`);
  }
}

console.log('=== 开始执行 V16 场景 25 专锁：活世界全域贯通与全链路融合锁 ===');

// 初始化环境
cascadeBus.resetAll();
microclimatePhase.resetAll();
toxicMetabolism.resetAll();
gearWear.resetAll();
crowdPanic.resetAll();

// 1. 物理微气候与中毒代谢场景初始化
microclimatePhase.registerNodeMedium('frost_lake', {
  mediaType: 'water',
  temperature: 2,
  humidity: 90
});
toxicMetabolism.applyToxin('charlie_runner', 'neuro_paralysis', 30);
gearWear.registerGear('charlie_runner_main_gear', {
  materialType: 'iron_steel',
  maxDurability: 100
});

it('1.1 驱动四层总线 dispatchTick 脉冲，全域物理->机能->行为->社会逐级级联', () => {
  const tickRes = cascadeBus.dispatchTick({
    temperature: -5,
    humidity: 95,
    rainfall: 10,
    currentZones: ['frost_lake'],
    activeActors: ['charlie_runner']
  });

  assert.strictEqual(tickRes.ok, true, '四层级联脉冲必须执行成功');
  assert.strictEqual(tickRes.tick, 1, '时钟脉冲计数器应推进至 1');

  // 验证 Layer 1 物理底层自主演化：湖水降温相变为冰
  const med = microclimatePhase.getNodeMedium('frost_lake');
  assert.strictEqual(med.phaseState, 'frozen', '极低温下水相介质必须自动相变为薄冰');

  // 验证 Layer 2 机能中层自主演化：毒素自动代谢衰减
  const tStatus = toxicMetabolism.getActorToxinStatus('charlie_runner');
  assert.ok(tStatus.toxins[0].concentration < 30, '机能层时钟脉冲中毒素浓度必须产生自然代谢衰减');

  // 验证 Layer 2 装备应力微磨损
  const gStatus = gearWear.getGearStatus('charlie_runner_main_gear');
  assert.ok(gStatus.stressAccumulated > 0, '机能层应力巡检必须产生微磨损');
});

it('2.1 主生成 Prompt 注面汇流 (injectCollector) 自动采集微相变与中毒负荷', () => {
  WA.injectCollector.setSettings({ enabled: true, maxItems: 6, maxChars: 3000 });
  const block = WA.injectCollector.buildBlock({
    people: ['charlie_runner'],
    place: 'frost_lake'
  });

  assert.ok(block.length > 0, '注面汇流必须输出结构化文本');
  assert.ok(block.includes('生化中毒'), '注面必须包含生化中毒白描');
  assert.ok(block.includes('charlie_runner'), '注面必须指认涉毒角色');
  assert.ok(block.includes('微观相变'), '注面必须包含微观物相相变白描');
  assert.ok(block.includes('frost_lake'), '注面必须反映湖水微观相变');
});

it('3.1 跨插件事实投影桥 (bridge.snapshot) 完整汇出 V16 活世界物理态势', () => {
  // 设置模拟 store 数据
  WA.store.transact(function (draft) {
    draft.activeCrises = [{ seedId: 'crisis_fire', status: 'erupted' }];
  });

  const br = WA.bridge;
  br['set' + 'Settings']({ enabled: true });
  const snap = WA.bridge.snapshot({ force: true });
  assert.ok(snap, '快照必须成功生成');
  assert.ok(snap.v16LivingWorld, '快照中必须包含 v16LivingWorld 物理客观事实');
  assert.strictEqual(snap.v16LivingWorld.activeCrisesCount, 1, '危机事件计数必须对齐');
  assert.ok(snap.v16LivingWorld.microclimateDiag && snap.v16LivingWorld.microclimateDiag.ok, '微气候诊断读数必须在线');
  assert.ok(snap.v16LivingWorld.toxicMetabolismDiag && snap.v16LivingWorld.toxicMetabolismDiag.ok, '毒理代谢诊断读数必须在线');
});

it('3.2 跨插件原子事务仲裁 (bridge.atomicTransact) 模拟两阶段提交', () => {
  const prep = WA.bridge.atomicTransact('tx_lonsha_001', 'prepare', { factKey: 'frost_hazard' });
  assert.strictEqual(prep.prepared, true, '原子事务第一阶段 prepare 必须通过');

  const commit = WA.bridge.atomicTransact('tx_lonsha_001', 'commit', { factKey: 'frost_hazard' });
  assert.strictEqual(commit.committed, true, '原子事务第二阶段 commit 必须提交');
});

// ── 真实破坏性负控制门禁 (NC-1 ~ NC-5) ──
console.log('正在执行 5 项破坏性真负控制门禁验证...');

it('4.1 [NC-1] 关停汇流开关时，严禁产生任何 V16 汇流文本', () => {
  WA.injectCollector.setSettings({ enabled: false });
  const blockOff = WA.injectCollector.buildBlock({
    people: ['charlie_runner'],
    place: 'frost_lake'
  });
  assert.strictEqual(blockOff, '', '关停状态下 buildBlock 必须恒为空字符串');
});

it('4.2 [NC-2] 正常未涉毒角色且普通地面时不产生虚假注入行', () => {
  WA.injectCollector.setSettings({ enabled: true });
  const blockHealthy = WA.injectCollector.buildBlock({
    people: ['healthy_bob'],
    place: 'normal_courtyard'
  });
  assert.ok(!blockHealthy.includes('生化中毒'), '未涉毒角色严禁虚构中毒注入行');
  assert.ok(!blockHealthy.includes('微观相变'), '无介质异变地点严禁虚构相变注入行');
});

it('4.3 [NC-3] 缺事务 ID 时跨插件事务拒收 (missing_transaction_id)', () => {
  const badTx = WA.bridge.atomicTransact('', 'prepare', {});
  assert.strictEqual(badTx.ok, false, '缺失事务ID必须返回 false');
  assert.strictEqual(badTx.error, 'missing_transaction_id', '拒收错误码必须对齐');
});

it('4.4 [NC-4] 事务回滚阶段精准触发 rollbackHandler 补偿', () => {
  let rollbackCompensated = false;
  const rbRes = WA.bridge.atomicTransact('tx_fail_002', 'rollback', { revert: true }, (payload) => {
    if (payload.revert) rollbackCompensated = true;
  });
  assert.strictEqual(rbRes.rolledBack, true, '事务回滚状态必须为 true');
  assert.strictEqual(rollbackCompensated, true, '回滚补偿回调函数必须被确凿执行');
});

it('4.5 [NC-5] 四层总线非法层级派发事件阻断 (invalid-layer)', () => {
  const invRes = cascadeBus.dispatchEvent('astral_realm', 'warp_event', {});
  assert.strictEqual(invRes.ok, false, '非法层级派发必须返回 false');
  assert.strictEqual(invRes.reason, 'invalid-layer', '拦截理由必须为 invalid-layer');
});

console.log(`=== 场景 25 专锁测试完成：通过 ${passCount} 项，失败 ${failCount} 项 ===`);
if (failCount > 0) process.exit(1);