/**
 * WorldAxis tests/scenario-v29-butterfly-chekhov-gun.js
 * V17 场景 29 终验专锁：蝴蝶展翅因果放大与契诃夫之枪引爆锁
 *
 * 核心验证：
 *  1. 挂载物理实体伏笔契诃夫之枪 (EXV17-5)
 *  2. 场景张力动态攀升与剧情高潮判定
 *  3. 伏笔引爆成为逆转命运的终局铁证
 *  4. 真实破坏性负控制硬门禁 (NC-1 ~ NC-4):
 *     - NC-1: 缺失物理锚定实体或描述，装填契诃夫之枪断言拒收
 *     - NC-2: 剧情张力未达到引爆阈值（张力平缓），强制引爆断言被拦截
 *     - NC-3: 物理实体在流转中已被彻底销毁/腐蚀粉碎，契诃夫之枪断言哑火失灵，严禁机械降神
 *     - NC-4: 引爆不存在的虚假枪键，断言拦截抛出 gun_not_found
 */
'use strict';
const assert = require('assert');
const path = require('path');

require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
if (WA.actionDesk && typeof WA.actionDesk.setSettings === 'function') {
  WA.actionDesk.setSettings({ enabled: true });
}

const dramaticTension = require('../engines/dramatic-tension.js');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log('  ✓ ' + desc);
    passCount++;
  } catch (err) {
    console.error('  ✗ ' + desc + ' -> ' + err.message);
    failCount++;
  }
}

console.log('=== 开始执行 V17 场景 29 专锁：张力悬念与契诃夫之枪引爆 ===\n');

// 1. 正向链路：在序章埋下一枚断簪作为契诃夫之枪
it('Path 1: 在故事序章挂载关键伏笔契诃夫之枪 (EXV17-5)，锚定断簪实体', function () {
  dramaticTension.resetAll();

  const res = WA.actionDesk.plan('drama.primeGun', {
    gunId: 'bloodstained_hairpin_clue',
    anchorEntityId: 'item_broken_hairpin',
    foreshadowText: '断簪内侧刻有皇室禁卫暗纹，是辨识潜伏凶手的唯一铁证',
    detonationTension: 80.0
  });

  assert.strictEqual(res.ok, true, '契诃夫之枪应成功装填挂载');
  assert.strictEqual(res.status, 'primed');
  assert.strictEqual(res.detonationTension, 80.0);
});

// 2. 正向链路：历经大战场景张力攀升至高潮，伏笔强制引爆逆转战局
it('Path 2: 场景张力一路攀升至 85，高潮时刻契诃夫之枪轰然打响揭开真相', function () {
  // 战局恶化，张力激增 +65 (初始 20 + 65 = 85)
  const tRes = WA.actionDesk.plan('drama.updateTension', {
    tensionDelta: 65,
    cause: 'climax_dual_between_brothers'
  });

  assert.strictEqual(tRes.ok, true);
  assert.strictEqual(tRes.currentTension, 85);

  // 此时引爆契诃夫之枪
  const fireRes = WA.actionDesk.plan('drama.detonateGun', {
    gunId: 'bloodstained_hairpin_clue'
  });

  assert.strictEqual(fireRes.ok, true, '高潮张力下契诃夫之枪应成功打响');
  assert.strictEqual(fireRes.status, 'detonated');
  assert.ok(fireRes.climaxNarrativeEcho.includes('皇室禁卫暗纹'), '伏笔回响文字应精准释出');
});

// 3. 负控制 NC-1: 缺失物理锚定实体或文字描述，装填断言直接拒收
it('NC-1 [负控制]: 缺失物理锚定实体或文字描述，装填契诃夫之枪断言拒收', function () {
  const res = WA.actionDesk.plan('drama.primeGun', {
    gunId: 'phantom_gun',
    anchorEntityId: null, // 虚假无形锚点
    foreshadowText: 'something'
  });

  assert.strictEqual(res.ok, false, '无实体伏笔装填应被拦截');
  assert.strictEqual(res.error, 'missing_anchor_or_text');
});

// 4. 负控制 NC-2: 剧情张力未达到引爆阈值（张力平缓），强制引爆断言被拦截
it('NC-2 [负控制]: 场景张力处于平缓期（未达高潮阈值），引爆命运伏笔断言被阻断', function () {
  dramaticTension.resetAll(); // 重置张力为 20
  dramaticTension.primeChekhovGun('locked_diary', 'diary_book', 'secret_diary', 75);

  const res = WA.actionDesk.plan('drama.detonateGun', {
    gunId: 'locked_diary'
  });

  assert.strictEqual(res.ok, false, '张力不足时提前剧透引爆必须被阻断');
  assert.strictEqual(res.error, 'insufficient_dramatic_tension_to_detonate');
  assert.strictEqual(res.currentTension, 20);
  assert.strictEqual(res.requiredTension, 75);
});

// 5. 负控制 NC-3: 物理实体在流转中已被彻底销毁/腐蚀粉碎，契诃夫之枪断言哑火失灵
it('NC-3 [负控制]: 伏笔物理实体已被焚毁消除，契诃夫之枪断言永久哑火，严禁机械降神', function () {
  dramaticTension.resetAll();
  dramaticTension.updateSceneTension(80, 'high_noon'); // 张力已拉满 100
  dramaticTension.primeChekhovGun('melted_locket', 'locket_item', 'secret_portrait', 50);

  // 实体已被火山岩浆熔化销毁
  const res = WA.actionDesk.plan('drama.detonateGun', {
    gunId: 'melted_locket',
    opts: { entityDestroyed: true }
  });

  assert.strictEqual(res.ok, false, '物理销毁的伏笔绝不可机械降神凭空起效');
  assert.strictEqual(res.error, 'chekhov_gun_destroyed_or_corroded_misfire');
  assert.strictEqual(dramaticTension.getGun('melted_locket').status, 'misfired_destroyed');
});

// 6. 负控制 NC-4: 引爆不存在的虚假枪键，断言拦截抛出 gun_not_found
it('NC-4 [负控制]: 引爆不存在的虚假枪键，断言精准拒收 gun_not_found', function () {
  const res = WA.actionDesk.plan('drama.detonateGun', {
    gunId: 'non_existent_gun_key'
  });

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'gun_not_found');
});

console.log('\n=== 场景 29 专锁校验总结 ===');
console.log('通过: ' + passCount + ' 项, 失败: ' + failCount + ' 项');
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 场景 29 专锁 100% 全部通过！');
}