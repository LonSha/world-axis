/**
 * WorldAxis tests/scenario-v47-cataclysm-topological-rupture.js
 * 场景 47 专锁：极端山洪灾异地貌永久改变与难民大迁徙专锁
 * (EXV20-2 极端自然灾异突发与大尺度地貌灾变 + ActionDesk 调度 + 100% 破坏性负控制)
 *
 * 验证目标：
 *  1. EXV20-2 极端地貌灾变发生机制：
 *     - triggerCataclysm 模拟大地震地裂（earthquake_fault）与山洪海啸决堤（flash_flood）；
 *     - 永久改变局部地域损伤度（damagedRegions[locationId]），截断交通要道（severedRoute）；
 *     - 能量破坏指数驱动产生大尺度难民潮（refugeesDisplaced）；
 *  2. 提示词知觉注入感知：
 *     - cataclysmHazard.buildBlock 动态呈现灾情通报与难民流离失所；
 *  3. ActionDesk 深度联动调度：
 *     - actionDesk.plan('nature.triggerCataclysm', ...)
 *  4. 破坏性负控制断言（100% 负控制防线）：
 *     - 震级烈度微弱（magnitude < 3.0）强行改写地貌拓扑必须被驳回（refusal: 'tremor-magnitude-insignificant'）；
 *     - 缺失受灾地理地点（missing-location）强行触发必须被拦截。
 */
'use strict';
const assert = require('assert');

// 模拟 WorldAxis 运行时
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

// 加载关键引擎
require('../engines/cataclysm-hazard.js');
require('../engines/action-desk.js');

WA.actionDesk.setSettings({ enabled: true });
WA.cataclysmHazard.saveSettings({ enabled: true });

console.log('[Scenario 47] 开始执行极端山洪灾异地貌永久改变与难民大迁徙专锁测试...');

WA.store.init();
WA.store.transact(draft => {
  draft.cataclysmLedger = {
    activeHazards: [],
    history: [],
    damagedRegions: {}
  };
});

// ── 1. 破坏性负控制断言 1：微末颤动不可损毁地貌拓扑 ──
const failTremor = WA.cataclysmHazard.triggerCataclysm('serene_valley', {
  hazardType: 'earthquake_fault',
  magnitude: 1.8 // 微震
});
assert.strictEqual(failTremor.ok, false, '微震严禁改写地貌拓扑');
assert.strictEqual(failTremor.refusal, 'tremor-magnitude-insignificant', '拒止码必须是 tremor-magnitude-insignificant');
console.log('✓ 负控制门禁 1（微小震级地貌改写拒止）验证通过');

// ── 2. 7.5 级大地裂谷突发：地貌永久撕裂与商道截断 ──
const okQuake = WA.cataclysmHazard.triggerCataclysm('iron_pass_canyon', {
  hazardType: 'earthquake_fault',
  magnitude: 7.5,
  routeToSever: 'silk_trade_artery'
});
assert.strictEqual(okQuake.ok, true, '7.5级大地震裂突发应当成功');
assert.strictEqual(okQuake.severedRoute, 'silk_trade_artery', '商贸大动脉必须被永久阻断');
assert.ok(okQuake.refugeesDisplaced > 1000, '必须激起上千名难民迁徙');
assert.strictEqual(okQuake.regionalDamageIndex, 75, '地域损伤指数必须达到 75');
assert.ok(okQuake.narrative.includes('大地撕裂'), '通报叙事必须包含灾变细节');

// 验证历史台账与视图持久化
const view = WA.cataclysmHazard.view('iron_pass_canyon');
assert.strictEqual(view.ok, true);
assert.strictEqual(view.damageIndex, 75);
assert.strictEqual(view.hazards.length, 1);
console.log('✓ 大地震裂商道阻断与难民大迁徙闭环验证通过');

// ── 3. 提示词知觉注入感知验证 ──
const block = WA.cataclysmHazard.buildBlock();
assert.ok(block.includes('【自然地貌灾情】'), '提示词中必须包含地貌灾情标题');
assert.ok(block.includes('iron_pass_canyon'), '提示词中必须具身呈现灾变地点');
assert.ok(block.includes('silk_trade_artery'), '提示词中必须具身呈现被截断的通道');
console.log('✓ 极端自然灾变 Prompt 知觉注入感知验证通过');

// ── 4. ActionDesk 集中调度与负控制断言 2 ──
// 负控制 2：调度未指定地点直接拦截
const deskFail = WA.actionDesk.plan('nature.triggerCataclysm', {
  magnitude: 6.0
});
assert.strictEqual(deskFail.ok, false, '缺失地点必须拦截');
assert.strictEqual(deskFail.reason, 'missing-location');
console.log('✓ 负控制门禁 2（ActionDesk 调度通道缺失地点拦截）验证通过');

// 正确调度：暴雨引发 8.0 级山洪决堤
const deskOk = WA.actionDesk.plan('nature.triggerCataclysm', {
  locationId: 'river_delta_city',
  hazardType: 'flash_flood',
  magnitude: 8.0,
  routeToSever: 'delta_shipping_canal'
});
assert.strictEqual(deskOk.ok, true, 'ActionDesk 调度山洪决堤必须成功');
assert.strictEqual(deskOk.hazardType, 'flash_flood');
assert.strictEqual(deskOk.regionalDamageIndex, 80);
assert.ok(deskOk.refugeesDisplaced >= 1200);
console.log('✓ ActionDesk 极端地貌灾变调度验证通过');

console.log('[Scenario 47] 极端山洪灾异地貌永久改变与难民大迁徙专锁全部通过！');
