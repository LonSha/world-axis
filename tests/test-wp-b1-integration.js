'use strict';
// WorldAxis tests/test-wp-b1-integration.js
// 验证 B 包纵向切片：WP-6 共同生活按周期履约 + WP-7 设施服务网络（降级/排队/释放唤醒） + WP-9 玩法蓝图安装向导与安全边界

const assert = require('node:assert/strict');
const path = require('node:path');
require('./mock.js');
const fresh = require('./ui-gate-sync.js').fresh;

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS ' + name);
    passCount++;
  } catch (err) {
    console.error('  FAIL ' + name);
    console.error(err);
    failCount++;
  }
}

function createTestEnv() {
  if (global.localStorage) global.localStorage.clear();
  const W = fresh().WA;
  W.store.init();
  W.recipe.apply('scifi');
  W.economy.setSettings({ enabled: true });
  W.production.setSettings({ enabled: true });
  W.family.setSettings({ enabled: true });
  W.laborSchedule.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });
  W.store.transact(function (d) {
    d.people = d.people || {};
    // 注册家庭/合伙成员与工匠
    const chars = [
      { name: '家长老周', status: 'active', funds: 150, loc: '青石桥镇' },
      { name: '工匠阿福', status: 'active', funds: 80, loc: '青石桥镇' },
      { name: '学徒小丁', status: 'active', funds: 20, loc: '青石桥镇' },
      { name: '远行商贩', status: 'traveling', funds: 200, loc: '荒野边境' }
    ];
    chars.forEach(function (c) {
      d.people['p_' + c.name] = {
        id: 'p_' + c.name,
        name: c.name,
        location: c.loc,
        status: c.status,
        resources: { funds: c.funds }
      };
    });

    // 注册地理环境
    d.region = d.region || {};
    d.region.places = [
      { id: 'town_bridge', name: '青石桥镇' },
      { id: 'water_mill', name: '水渠工坊' }
    ];
    d.world = d.world || {};
    d.world.places = [
      { id: 'town_bridge', name: '青石桥镇' },
      { id: 'water_mill', name: '水渠工坊' }
    ];

    return true;
  }, 'seed:b1');

  return W;
}

console.log('=== 开始 B 包纵向切片集成验证 (test-wp-b1-integration) ===');

// ── 1. WP-9: 玩法蓝图安装向导、防冲突保护与世界真源安全注入 ──
test('WP-9: 蓝图试跑无副作用，冲突检测阻断静默覆盖，显式覆盖后真源落地', function () {
  const W = createTestEnv();

  // 1. 无副作用试跑 dryRun: true
  const dryRes = W.actionDesk.plan('playableBlueprint.installSample', {
    sampleId: 'settlement-exploration',
    dryRun: true
  });
  assert.equal(dryRes.ok, true);
  assert.equal(dryRes.dryRun, true);
  assert(dryRes.willInstall.places.includes('frontier_camp'));
  // 确认真源未被修改
  const storeBefore = W.store.get();
  assert(!storeBefore.blueprint || !storeBefore.blueprint.installed);

  // 2. 模拟世界中已有同名冲突地点
  W.store.transact(function (d) {
    d.world.places.push({ id: 'frontier_camp', name: '已存在的前哨营地' });
    return true;
  });

  // 不加 force: true，触发冲突阻断
  const conflictRes = W.actionDesk.plan('playableBlueprint.installSample', {
    sampleId: 'settlement-exploration'
  });
  assert.equal(conflictRes.ok, false);
  assert.equal(conflictRes.reason, 'conflict-existing-world');
  assert(conflictRes.conflicts && conflictRes.conflicts.places.includes('frontier_camp'));

  // 3. 传入 force: true，安全覆盖合并安装
  const installRes = W.actionDesk.plan('playableBlueprint.installSample', {
    sampleId: 'settlement-exploration',
    force: true
  });
  assert.equal(installRes.ok, true);
  assert(installRes.installed, '安装记录必须存在');

  // 4. 验证世界真源已注入
  const sAfter = W.store.get();
  const campPlace = (sAfter.world.places || []).find(function (p) { return p.id === 'frontier_camp'; });
  assert(campPlace, '前哨营地应已注入 world.places');
  const regionCamp = (sAfter.region.places || []).find(function (p) { return p.id === 'frontier_camp'; });
  assert(regionCamp, '前哨营地应已注入 region.places');

  assert(sAfter.blueprint.installed['settlement-exploration'], '蓝图安装清单中应有记录');
  assert.equal(sAfter.blueprint.installed['settlement-exploration'].sampleId, 'settlement-exploration');
});

// ── 2. WP-6: 共同生活按周期履约（公摊维护费、赤字感知与共同目标推进） ──
test('WP-6: 共同体周期支出扣减金库，金库不足时产生赤字，共同目标劳动/资金推进', function () {
  const W = createTestEnv();

  // 1. 创建合伙家庭
  const uRes = W.family.createUnit({ name: '青石桥合伙家眷', type: '工匠合伙', by: '家长老周' });
  assert.equal(uRes.ok, true);
  const uId = uRes.id;
  W.family.addMember(uId, '工匠阿福', '工匠');
  W.family.addMember(uId, '学徒小丁', '学徒');

  // 老周注资 60 到家庭公共池
  const contRes = W.family.contribute(uId, '家长老周', 'funds', 60);
  assert.equal(contRes.ok, true);

  // 2. 设立周期预算（每周期 35 维护费）与共同目标（修建蓄水池）
  const bRes = W.familyOps.setBudget(uId, {
    periodicExpense: 35,
    sharedGoals: [
      { id: 'goal_water_cistern', text: '修建蓄水池', deadlineDays: 30 }
    ]
  });
  assert.equal(bRes.ok, true);

  // 3. 执行第 1 周期结算（金库 60，支出 35，余 25，赤字 0）
  // 同时推进共同目标：出资 15，投入劳动 2 天
  const cyc1 = W.actionDesk.plan('familyOps.advanceCycle', {
    unitId: uId,
    fundContributions: { 'goal_water_cistern': 15 },
    laborContributions: { 'goal_water_cistern': 2 }
  });
  assert.equal(cyc1.ok, true);
  assert.equal(cyc1.cycle, 1);
  assert.equal(cyc1.paid, 35);
  assert.equal(cyc1.deficit, 0);
  assert.equal(cyc1.treasuryLeft, 25);
  assert.equal(cyc1.hasDeficit, false);
  assert.equal(cyc1.goals[0].funds, 15);
  assert.equal(cyc1.goals[0].laborDays, 2);

  // 4. 执行第 2 周期结算（金库仅剩 25，固定支出需 35）
  const cyc2 = W.actionDesk.plan('familyOps.advanceCycle', {
    unitId: uId
  });
  assert.equal(cyc2.ok, true);
  assert.equal(cyc2.cycle, 2);
  assert.equal(cyc2.paid, 25, '金库全额支付 25');
  assert.equal(cyc2.deficit, 10, '出现 10 funds 赤字');
  assert.equal(cyc2.treasuryLeft, 0, '金库清零');
  assert.equal(cyc2.hasDeficit, true, '标记为赤字');

  // 检查共同体预算真源中的赤字累计
  const opsData = W.store.get().familyOps;
  assert.equal(opsData.budgets[uId].accumulatedDeficit, 10, '赤字必须如实持久化，杜绝凭空印钞');
});

// ── 3. WP-6: 缺口劳动力排班互斥与遗产分配资产守恒 ──
test('WP-6: 在途成员代班被物理排他拦截，空闲代班真实排班，无效受益人遗产守恒', function () {
  const W = createTestEnv();
  const uRes = W.family.createUnit({ name: '青石桥合伙家眷', type: '工匠合伙', by: '家长老周' });
  const uId = uRes.id;
  W.family.addMember(uId, '工匠阿福', '工匠');
  W.family.addMember(uId, '学徒小丁', '学徒');
  W.family.addMember(uId, '远行商贩', '外派成员');

  // 1. 尝试让在途（traveling）的远行商贩代班 -> 必须被物理排他拦截
  const travelingGap = W.familyOps.handleGap(uId, 'absence', 'substitute', {
    substitute: '远行商贩',
    date: '10-25',
    slot: 'morning'
  });
  assert.equal(travelingGap.ok, false);
  assert.equal(travelingGap.reason, 'substitute-traveling', '在途人员不可瞬间瞬移代班');

  // 2. 安排本地空闲人员“工匠阿福”代班
  const validGap = W.familyOps.handleGap(uId, 'absence', 'substitute', {
    substitute: '工匠阿福',
    date: '10-25',
    slot: 'morning',
    task: '工坊代班照料'
  });
  assert.equal(validGap.ok, true);
  assert.equal(validGap.action && validGap.action.scheduled, true);

  // 验证排班日历（laborSchedule）中真实记入预定
  const sched = W.laborSchedule.view({ who: '工匠阿福', day: 1 });
  assert.equal(sched.ok, true);
  const morningBooking = (sched.bookings || []).find(function (b) { return b.slot === 'morning'; });
  assert(morningBooking, '代班后时段已被占用');
  assert.equal(morningBooking.task, '工坊代班照料');

  // 再次安排工匠阿福在同一时段代班 -> 触发冲突
  const conflictGap = W.familyOps.handleGap(uId, 'absence', 'substitute', {
    substitute: '工匠阿福',
    date: '10-25',
    slot: 'morning'
  });
  assert.equal(conflictGap.ok, false);
  assert.equal(conflictGap.reason, 'substitute-conflict', '同一时段不可重复排班');

  // 3. 遗产继承比例分配（inheritRatio）与资产守恒
  // 家长老周有 150 funds
  // 分配方案：阿福 50%，不存在的虚假受益人“隐居高人” 50%
  const inhRes = W.familyOps.inheritRatio(uId, '家长老周', [
    { heir: '工匠阿福', ratio: 0.5 },
    { heir: '隐居高人', ratio: 0.5 }
  ]);
  assert.equal(inhRes.ok, true);
  assert.equal(inhRes.conserved, true, '资产必须守恒');
  // 阿福获得 150 * 0.5 = 75
  assert.equal(inhRes.allocated['工匠阿福'], 75);
  // 隐居高人因不存在，75 funds 留存在老周账上作为未分配剩余
  assert.equal(inhRes.unallocatedRemaining, 75);

  const zhou = W.store.get().people['p_家长老周'];
  const afu = W.store.get().people['p_工匠阿福'];
  assert.equal(zhou.resources.funds, 75, '未分配资产保留在被继承人账上，不蒸发');
  assert.equal(afu.resources.funds, 80 + 75, '有效继承人如实增加');
});

// ── 4. WP-7: 设施服务网络（损耗降级、容量受限排队与释放自动唤醒） ──
test('WP-7: 设施降级容量折半，满载排队入队，释放负载自动唤醒队列', function () {
  const W = createTestEnv();

  // 1. 声明并激活水渠工坊（额定容量 2）
  const decRes = W.serviceNetwork.declareFacility({
    name: '水渠工坊',
    placeId: 'water_mill',
    serviceType: 'crafting',
    capacity: 2
  });
  assert.equal(decRes.ok, true);
  const facId = decRes.facility.id;
  const actRes = W.serviceNetwork.activateFacility(facId);
  assert.equal(actRes.ok, true);

  // 2. 正常状态满载服务
  const req1 = W.actionDesk.plan('serviceNetwork.requestService', {
    facilityId: facId,
    who: '工匠阿福',
    amount: 2
  });
  assert.equal(req1.ok, true);
  assert.equal(req1.served, 2);
  assert.equal(req1.degraded, false);

  // 3. 设施缺乏维护损耗降级
  const decayRes = W.serviceNetwork.decayFacility(facId);
  assert.equal(decayRes.ok, true);

  // 4. 再次请求服务：降级后容量折半（2 -> 1），当前负载 2 已超容，返回排队
  const req2 = W.actionDesk.plan('serviceNetwork.requestService', {
    facilityId: facId,
    who: '学徒小丁',
    amount: 1
  });
  assert.equal(req2.ok, true);
  assert.equal(req2.served, 0);
  assert.equal(req2.degraded, true);
  assert.equal(req2.effectiveCapacity, 1);
  assert.equal(req2.queued, 1);

  // 显式登记进入排队等待队列
  const qRes = W.actionDesk.plan('serviceNetwork.queueService', {
    facilityId: facId,
    who: '学徒小丁',
    amount: 1
  });
  assert.equal(qRes.ok, true);
  assert.equal(qRes.position, 1);
  const queueId = qRes.queueId;

  // 5. 释放部分先前负载（阿福完成 2 单位工作释放）
  const relRes = W.actionDesk.plan('serviceNetwork.releaseService', {
    facilityId: facId,
    amount: 2
  });
  assert.equal(relRes.ok, true);
  // 释放后，队列中的小丁自动被唤醒出队并服务！
  assert.equal(relRes.dequeued.length, 1);
  assert.equal(relRes.dequeued[0].id, queueId);
  assert.equal(relRes.dequeued[0].who, '学徒小丁');

  // 6. 验证已出队：再次测试取消排队返回已不在等待队列中（cancelled: false）
  const cancelRes = W.actionDesk.plan('serviceNetwork.cancelQueue', {
    facilityId: facId,
    queueId: queueId
  });
  assert.equal(cancelRes.ok, true);
  assert.equal(cancelRes.cancelled, false, '已出队的项目无需取消');
});

// ── 5. 跨日推进与跨会话数据重载一致性 ──
test('跨会话序列化重载：共同体赤字与预算、设施网络状态与蓝图清单完整恢复', function () {
  const W = createTestEnv();

  // 1. 安装蓝图
  W.actionDesk.plan('playableBlueprint.installSample', {
    sampleId: 'settlement-exploration',
    force: true
  });

  // 2. 建立共同体并造成赤字
  const u = W.family.createUnit({ name: '长线合伙社', type: '工匠合伙', by: '家长老周' });
  W.familyOps.setBudget(u.id, { periodicExpense: 50 });
  // 无资金直接推进结算，形成 50 赤字
  W.actionDesk.plan('familyOps.advanceCycle', { unitId: u.id });

  // 3. 建立设施并进入降级与排队
  const dec = W.serviceNetwork.declareFacility({
    name: '备用水站',
    placeId: 'water_mill',
    serviceType: 'water-supply',
    capacity: 1
  });
  const facId = dec.facility.id;
  W.serviceNetwork.activateFacility(facId);
  W.serviceNetwork.decayFacility(facId);
  W.serviceNetwork.queueService(facId, '工匠阿福', 1);

  // 4. 模拟会话导出与深拷贝重载
  const rawState = JSON.stringify(W.store.get());

  // 启动全新的引擎上下文实例
  const W2 = fresh().WA;
  W2.store.init();
  W2.family.setSettings({ enabled: true });
  W2.actionDesk.setSettings({ enabled: true });
  W2.store.restore(JSON.parse(rawState));

  // 5. 验证重载后真源数据自洽
  const s2 = W2.store.get();
  assert(s2.blueprint.installed['settlement-exploration'], '蓝图安装记录完整');
  assert.equal(s2.familyOps.budgets[u.id].accumulatedDeficit, 50, '赤字记录完整');
  assert.equal(s2.serviceNetwork.queue[0].who, '工匠阿福', '排队队列完整');

  // 6. 重载后可继续驱动业务流转
  const rel = W2.actionDesk.plan('serviceNetwork.releaseService', { facilityId: facId, amount: 1 });
  assert.equal(rel.ok, true);
  assert.equal(rel.dequeued.length, 1);
  assert.equal(rel.dequeued[0].who, '工匠阿福', '重载后排队自动唤醒机制仍然正常');
});

console.log('----------------------------------------------------');
console.log('WP-B1 整合门禁套件运行结果: ' + passCount + ' 通过 / ' + failCount + ' 失败');
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('WP-B1 5/5 全部用例断言通过！');
}
