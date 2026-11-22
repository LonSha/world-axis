'use strict';
// WorldAxis tests/test-wp-a1-integration.js
// 验证 A 包第 1 阶段纵向切片：WP-1 行动桌闭环 + WP-2 方法目标兑现与幂等 + WP-3 单一时钟与日程冲突
const assert = require('node:assert/strict');
const path = require('node:path');
require('./mock.js');
const fresh = require('./ui-gate-sync.js').fresh;

function createTestEnv() {
  if (global.localStorage) global.localStorage.clear();
  const W = fresh().WA;
  W.store.init();
  W.recipe.apply('scifi');
  W.economy.setSettings({ enabled: true });
  W.production.setSettings({ enabled: true });
  W.research.setSettings({ enabled: true });
  W.family.setSettings({ enabled: true });
  W.training.setSettings({ enabled: true });
  W.gear.setSettings({ enabled: true });
  W.laborSchedule.setSettings({ enabled: true });
  W.actionMethods.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });

  W.store.transact(function (d) {
    d.people = d.people || {};
    ['工匠', '徒弟', '远行商'].forEach(function (name) {
      d.people['p_' + name] = {
        id: 'p_' + name,
        name: name,
        location: name === '远行商' ? '荒野边境' : '城镇作坊',
        status: name === '远行商' ? 'traveling' : 'active',
        resources: { '合金': 100, '元件': 100 }
      };
    });
    d.evolution = d.evolution || {};
    d.evolution.entityMemory = d.evolution.entityMemory || {};
    d.evolution.entityMemory.ability = [
      { id: 'ab_repair', name: '修理', mode: 'stage', stageNames: ['初学', '入门', '熟练'] },
      { id: 'ab_prod', name: '生产', mode: 'stage', stageNames: ['初学', '入门', '熟练'] }
    ];
    d.evolution.entityMemory.object = [
      { id: 'obj_wrench', name: '扳手', kind: '工具' },
      { id: 'obj_machine', name: '高炉', kind: '设备' }
    ];
    return true;
  }, 'seed:wp-a1');

  W.training.declare('修理', { mode: 'stage', stageNames: ['初学', '入门', '熟练'] });
  W.training.declare('生产', { mode: 'stage', stageNames: ['初学', '入门', '熟练'] });

  W.store.transact(function (d) {
    d.training = d.training || { abilities: [], rows: [] };
    d.training.rows.push({ who: '工匠', ability: '修理', stage: 2, points: 0, sessions: 6 });
    d.training.rows.push({ who: '工匠', ability: '生产', stage: 2, points: 0, sessions: 6 });
    d.training.rows.push({ who: '徒弟', ability: '修理', stage: 0, points: 0, sessions: 1 });
    return true;
  }, 'seed:skills');

  return W;
}

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('PASS ' + name);
  } catch (e) {
    fail++;
    console.error('FAIL ' + name, e);
  }
}

// ── 1. WP-3 时间契约与日程冲突 ─────────────────────────────
test('WP-3: 统一世界日历基准与推进同步', function () {
  const W = createTestEnv();
  // 初始设置剧情时钟为第 5 日
  W.store.transact(function (d) {
    d.clock = { label: '第五日', dayIndex: 5, source: 'author' };
    return true;
  });
  const story0 = W.playtime.story();
  assert.equal(story0.dayIndex, 5);

  // 查看日程，默认天数必须对齐故事日 5
  const v0 = W.laborSchedule.view({ who: '工匠' });
  assert.equal(v0.day, 5);

  // 申请预约第 5 日上午
  const c1 = W.laborSchedule.claim({ who: '工匠', slot: 'morning', task: '设备巡检' });
  assert.equal(c1.ok, true);
  assert.equal(c1.booking.day, 5);

  // 推进一日，故事钟与日程钟同时前进至第 6 日
  const advRes = W.laborSchedule.advanceDay();
  assert.equal(advRes.ok, true);
  assert.equal(advRes.currentDay, 6);
  assert.equal(advRes.storyDay, 6);

  const story1 = W.playtime.story();
  assert.equal(story1.dayIndex, 6);
  const v1 = W.laborSchedule.view({ who: '工匠' });
  assert.equal(v1.day, 6);
  assert.equal(v1.count, 0, '新一日上午空闲，旧预约已归档');
});

test('WP-3: 途中旅行状态人物不可被排班本地现场劳动', function () {
  const W = createTestEnv();
  // 远行商正处于 traveling 状态
  const cFail = W.laborSchedule.claim({ who: '远行商', slot: 'morning', task: '作坊打铁' });
  assert.equal(cFail.ok, false);
  assert.equal(cFail.reason, 'person-traveling');
});

// ── 2. WP-1 场景行动桌闭环 ────────────────────────────────
test('WP-1: 行动桌工单暂停不报 advance，提供 resume 引导并附带 nextActions', function () {
  const W = createTestEnv();
  // 1. 开单
  const openRes = W.actionDesk.plan('production.open', { who: '工匠', recipe: '组件', qty: 1, days: 2, place: '工坊' });
  assert.equal(openRes.ok, true);
  const orderId = openRes.id;
  assert(openRes.nextActions && openRes.nextActions.includes('production.advance'));
  // 2. 暂停工单
  const pauseRes = W.actionDesk.plan('production.pause:' + orderId, { reason: '等待零件' });
  assert.equal(pauseRes.ok, true);
  // 3. 行动桌 board 纯读展示
  const b = W.actionDesk.board({ person: '工匠' });
  assert.equal(b.ok, true);
  const pRows = (b.rows || []).filter(function (r) { return r.owner === 'production'; });
  const resumeRow = pRows.find(function (r) { return r.id === 'production.resume:' + orderId; });
  assert(resumeRow, '暂停工单应展示为 resume 行');
  assert.equal(resumeRow.state, 'prepare', '暂停工单必须是 prepare 档位');
  // 4. 执行复工
  const resumeRes = W.actionDesk.plan('production.resume:' + orderId, {});
  assert.equal(resumeRes.ok, true);
  assert(resumeRes.nextActions && resumeRes.nextActions.includes('production.advance'));
  // 5. 推进至完工并交付
  const adv1 = W.actionDesk.plan('production.advance:' + orderId, { days: 1 });
  assert.equal(adv1.ok, true);
  const adv2 = W.actionDesk.plan('production.advance:' + orderId, { days: 1 });
  assert.equal(adv2.ok, true);
  // 完工后 board 状态应显示可交付
  const bAfter = W.actionDesk.board({ person: '工匠' });
  const pRowsAfter = (bAfter.rows || []).filter(function (r) { return r.owner === 'production'; });
  const deliverRow = pRowsAfter.find(function (r) { return r.id === 'production.deliver:' + orderId; });
  assert(deliverRow, '完工工单应生成 deliver 行');
  assert.equal(deliverRow.state, 'ready');
  // 交付结清
  const delivRes = W.actionDesk.plan('production.deliver:' + orderId, { to: '工匠', place: '工坊' });
  assert.equal(delivRes.ok, true);
});

// ── 3. WP-2 方法目标真实兑现与幂等 ─────────────────────────
test('WP-2: 目标物件维修真实改变耐久，工具真实磨损，支持操作幂等', function () {
  const W = createTestEnv();
  const tool = W.gear.make('扳手', { holder: '工匠', durability: 10 });
  const brokenDevice = W.gear.make('高炉', { holder: '工匠', durability: 3, maxDurability: 10 });
  assert.equal(tool.ok, true);
  assert.equal(brokenDevice.ok, true);

  const opId = 'action_op_9901';
  // 工匠选用熟练工标准精修
  const exec1 = W.actionMethods.execute('task:repair', '工匠', 'expert_standard', {
    gearId: tool.id,
    target: brokenDevice.id,
    opId: opId
  });
  assert.equal(exec1.ok, true);
  assert.equal(exec1.targetChanged, true);
  assert.equal(exec1.gearRemaining, 9, '专业工具耐久磨损 1');

  // 检查目标真实改变
  const items = W.gear.view().items || [];
  const targetItem = items.find(function (x) { return x.id === brokenDevice.id; });
  assert(targetItem.durability >= 7, '目标设备耐久度真实恢复');

  // 幂等重复执行：不应二次扣减工具耐久
  const exec2 = W.actionMethods.execute('task:repair', '工匠', 'expert_standard', {
    gearId: tool.id,
    target: brokenDevice.id,
    opId: opId
  });
  assert.equal(exec2.ok, true);
  assert.equal(exec2.idempotent, true);
  const toolNow = (W.gear.view().items || []).find(function (x) { return x.id === tool.id; });
  assert.equal(toolNow.durability, 9, '幂等调用不扣除耐久');
});

test('WP-2: 严格目标模式下不存在目标时拒绝执行，不空扣工具', function () {
  const W = createTestEnv();
  const tool = W.gear.make('扳手', { holder: '工匠', durability: 10 });
  const res = W.actionMethods.execute('task:repair', '工匠', 'expert_standard', {
    gearId: tool.id,
    target: 'ghost_machine_123',
    strictTarget: true
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'target-not-found');
  const toolNow = (W.gear.view().items || []).find(function (x) { return x.id === tool.id; });
  assert.equal(toolNow.durability, 10, '未成功执行绝不扣耐久');
});

test('WP-2: 工单加工方法真实推进工单进度', function () {
  const W = createTestEnv();
  const tool = W.gear.make('扳手', { holder: '工匠', durability: 10 });
  const order = W.production.open({ recipe: '组件', by: '工匠', qty: 1, days: 3 });
  assert.equal(order.ok, true);

  const craftRes = W.actionMethods.execute('task:production_craft', '工匠', 'careful_craft', {
    gearId: tool.id,
    target: order.id
  });
  assert.equal(craftRes.ok, true);
  assert.equal(craftRes.targetChanged, true);
  const job = (W.production.list() || []).find(function (j) { return j.id === order.id; });
  assert.equal(job.done, 1, '工单真实推进 1 天工期');
});

console.log('----------------------------------------------------');
console.log('WP-A1 整合门禁套件运行结果: ' + pass + ' 通过 / ' + fail + ' 失败');
if (fail > 0) process.exit(1);
