'use strict';
// WorldAxis tests/test-v3-a-integration.js
// 验证 V3 大更新包 A 核心切片：
// OPV3-1 世界情境投影 + OPV3-2 场景工作台与回执 + OPV3-3 单一时间与排班互斥 + OPV3-4 调查与结果链
// EXV3-1 承载力与工期影响 + EXV3-3 有限注意竞争传播 + EXV3-4 具名公共项目协作
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
  W.training.setSettings({ enabled: true });
  W.gear.setSettings({ enabled: true });
  W.laborSchedule.setSettings({ enabled: true });
  W.actionMethods.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });
  W.rumor.setSettings({ enabled: true });
  W.coop.setSettings({ enabled: true });

  W.store.transact(function (d) {
    d.people = d.people || {};
    ['工匠', '徒弟', '远行商'].forEach(function (name) {
      d.people['p_' + name] = {
        id: 'p_' + name,
        name: name,
        location: name === '远行商' ? '荒野边境' : '城镇作坊',
        status: name === '远行商' ? 'traveling' : 'active',
        resources: { '合金': 100, '元件': 100, '金属': 60 }
      };
    });
    d.evolution = d.evolution || {};
    d.evolution.entityMemory = d.evolution.entityMemory || {};
    d.evolution.entityMemory.ability = [
      { id: 'ab_repair', name: '修理', mode: 'stage', stageNames: ['初学', '入门', '熟练'] },
      { id: 'ab_investigate', name: '调查', mode: 'stage', stageNames: ['初学', '入门', '熟练'] }
    ];
    return true;
  }, 'seed:v3-a');

  W.training.declare('修理', { mode: 'stage', stageNames: ['初学', '入门', '熟练'] });
  W.training.declare('调查', { mode: 'stage', stageNames: ['初学', '入门', '熟练'] });

  W.store.transact(function (d) {
    d.training = d.training || { abilities: [], rows: [] };
    d.training.rows.push({ who: '工匠', ability: '修理', stage: 2, points: 0, sessions: 6 });
    d.training.rows.push({ who: '工匠', ability: '调查', stage: 2, points: 0, sessions: 6 });
    d.training.rows.push({ who: '徒弟', ability: '调查', stage: 0, points: 0, sessions: 1 });
    return true;
  }, 'seed:training-v3');

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

// ── 1. OPV3-1 世界情境投影 ──────────────────────────────────────────
test('OPV3-1: 场景只读情境投影与在场/待办收束', function () {
  const W = createTestEnv();

  // 空闲状态检查
  const sit0 = W.situation({ who: '工匠', place: '城镇作坊' });
  assert.equal(sit0.ok, true);
  assert.equal(sit0.isProjection, true);
  assert.equal(sit0.place, '城镇作坊');
  assert.ok(sit0.present.includes('工匠'));
  assert.ok(sit0.present.includes('徒弟'));
  assert.ok(!sit0.present.includes('远行商'), '在途旅行人员绝不在当前作坊现场');

  // 注入一条因果变化
  W.store.transact(function (d) {
    d.causal = d.causal || { chains: [] };
    d.causal.chains.push({
      id: 'cau_1',
      title: '高炉管线泄漏',
      stage: 'pending',
      place: '城镇作坊',
      affected: ['工匠'],
      summary: '需要尽快抢修'
    });
    return true;
  });

  const sit1 = W.situation({ who: '工匠', place: '城镇作坊' });
  assert.equal(sit1.visibleChanges.length, 1);
  assert.equal(sit1.visibleChanges[0].id, 'cau_1');
  assert.equal(sit1.idleStatus, 'active');
});

// ── 2. OPV3-2 场景工作台与回执 ──────────────────────────────────────
test('OPV3-2: 工作台资源预览与幂等执行回执', function () {
  const W = createTestEnv();

  // 预览行动
  const prev = W.actionDesk.plan('actionDesk.workbench', {
    mode: 'preview',
    actionId: 'task:investigation',
    who: '工匠'
  });
  assert.equal(prev.ok, true);
  assert.equal(prev.preview, true);
  assert.equal(prev.taskName, '现场调查');

  // 执行并带幂等键
  const exec1 = W.actionDesk.plan('actionDesk.workbench', {
    mode: 'execute',
    actionId: 'method.execute',
    taskId: 'task:investigation',
    methodId: 'expert_deduction',
    who: '工匠',
    idempotencyKey: 'ticket_inv_001'
  });
  assert.equal(exec1.ok, true);
  assert.ok(exec1.receipt, '生成了执行回执');
  assert.equal(exec1.receipt.actionId, 'method.execute');

  // 重复提交相同幂等键，直接返回历史回执，不重复结算
  const exec2 = W.actionDesk.plan('actionDesk.workbench', {
    mode: 'execute',
    actionId: 'method.execute',
    taskId: 'task:investigation',
    methodId: 'expert_deduction',
    who: '工匠',
    idempotencyKey: 'ticket_inv_001'
  });
  assert.equal(exec2.ok, true);
  assert.equal(exec2.duplicated, true);
  assert.equal(exec2.receipt.id, 'ticket_inv_001');
});

// ── 3. OPV3-3 单一时间与排班互斥 ──────────────────────────────────
test('OPV3-3: 统一剧情时间排班与同时段互斥', function () {
  const W = createTestEnv();

  // 工匠预约第 1 日上午
  const c1 = W.laborSchedule.claim({ who: '工匠', slot: 'morning', task: '设备巡检' });
  assert.equal(c1.ok, true);

  // 再次申请同时段预约，必须拒绝并报 slot-conflict
  const c2 = W.laborSchedule.claim({ who: '工匠', slot: 'morning', task: '图纸测绘' });
  assert.equal(c2.ok, false);
  assert.equal(c2.reason, 'slot-conflict');

  // 换人申请同一时段允许通过
  const c3 = W.laborSchedule.claim({ who: '徒弟', slot: 'morning', task: '清扫工位' });
  assert.equal(c3.ok, true);
});

// ── 4. OPV3-4 能力物件结果链 ────────────────────────────────────────
test('OPV3-4: 调查任务不同能力与工具的差异化分支', function () {
  const W = createTestEnv();

  // 徒弟（无熟练度、无仪器）
  const evNovice = W.actionMethods.evaluate('task:investigation', '徒弟');
  assert.equal(evNovice.ok, true);
  assert.equal(evNovice.available.length, 0, '无熟练度且无仪器，无法单独调查');
  assert.equal(evNovice.blocked.length, 3);

  // 工匠（熟练度 2，无仪器可走逻辑推导替代解法）
  const evExpert = W.actionMethods.evaluate('task:investigation', '工匠');
  assert.equal(evExpert.ok, true);
  const deduction = evExpert.available.find(x => x.methodId === 'expert_deduction');
  assert.ok(deduction, '熟练者开放经验逻辑推导替代路径');
  assert.equal(deduction.wear, 0, '无需专业仪器且无磨损');
});

// ── 5. EXV3-1 承载力与工期影响 ──────────────────────────────────────
test('EXV3-1: 区域水土资源压力导致下游工期延误与替代建议', function () {
  const W = createTestEnv();

  W.envCapacity.declareResource({
    resourceId: 'res_water_source',
    resourceType: 'water',
    regionId: 'reg_valley',
    stock: 25,
    maxStock: 100,
    regenRate: 5
  });

  const impact = W.envCapacity.evaluateImpact('reg_valley', 'water');
  assert.equal(impact.ok, true);
  assert.equal(impact.strain, 'depleted');
  assert.equal(impact.extraDays, 3, '资源枯竭增加 3 日工期');
  assert.ok(impact.alternativeSuggested.includes('调配补给'));
});

// ── 6. EXV3-3 有限注意竞争传播 ──────────────────────────────────────
test('EXV3-3: 多事件在有限注意容量下竞争通道，未传播事件不丢弃', function () {
  const W = createTestEnv();

  const events = [
    { id: 'ev_fire', title: '工坊起火', urgency: 8, relevance: 6, place: '城镇作坊', witnesses: ['工匠'] },
    { id: 'ev_fair', title: '外地集市', urgency: 2, relevance: 2, place: '边境' },
    { id: 'ev_caravan', title: '商队遇袭', urgency: 6, relevance: 5, place: '关口' },
    { id: 'ev_secret_note', title: '绝密密信', urgency: 10, relevance: 10, isSecret: true, isPublic: false }
  ];

  const comp = W.rumor.competeForAttention(events, { capacity: 2, place: '城镇作坊' });
  assert.equal(comp.ok, true);
  assert.equal(comp.admitted.length, 2);
  assert.equal(comp.admitted[0].id, 'ev_fire', '本地高紧迫+亲历见证排第一');
  assert.equal(comp.delayed.length, 1, '未入选事件保留在等待队列');
  assert.equal(comp.delayed[0].id, 'ev_fair');
  assert.equal(comp.excludedSecrets.length, 1, '私密事件禁止直接进入公开竞争');
});

// ── 7. EXV3-4 具名公共项目协作 ──────────────────────────────────────
test('EXV3-4: 公共项目认缴启动、减员降级与结项', function () {
  const W = createTestEnv();

  // 提议修缮公用水井
  const prop = W.coop.proposeProject({
    projectId: 'prj_well_repair',
    name: '修缮水井',
    initiator: '工匠',
    minCommitment: 40,
    place: '城镇作坊'
  });
  assert.equal(prop.ok, true);
  assert.equal(prop.project.status, 'pledging');

  // 工匠认缴 25 金属
  W.coop.pledgeProject('prj_well_repair', '工匠', { '金属': 25 });
  const st1 = W.coop.projectStatus('prj_well_repair');
  assert.equal(st1.project.status, 'pledging', '未满 40 仍为认缴中');

  // 徒弟认缴 20 金属，总计 45 达标，自动激活
  W.coop.pledgeProject('prj_well_repair', '徒弟', { '金属': 20 });
  const st2 = W.coop.projectStatus('prj_well_repair');
  assert.equal(st2.project.status, 'active', '满 40 自动转为 active');

  // 徒弟因故缺席，采取 downgrade 方案应对
  const abs = W.coop.handleAbsence('prj_well_repair', '徒弟', 'downgrade');
  assert.equal(abs.ok, true);
  assert.equal(abs.downgraded, true);

  // 结项
  const conc = W.coop.concludeProject('prj_well_repair', { success: true });
  assert.equal(conc.ok, true);
  assert.equal(conc.status, 'completed');
  assert.equal(conc.downgraded, true);
});

// ── 8. N0–N4 负控制与边界自证 ───────────────────────────────────────
test('N0: 未登记人物申请工作台行动，必须拒收 unknown-person', function () {
  const W = createTestEnv();
  const res = W.actionDesk.plan('actionDesk.workbench', {
    mode: 'preview',
    actionId: 'task:investigation',
    who: '不存在的路人'
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'unknown-person');
});

test('N1: 途中旅行人员试图预约本地现场排班，必须拦截 person-traveling', function () {
  const W = createTestEnv();
  const res = W.laborSchedule.claim({
    who: '远行商',
    slot: 'morning',
    task: '工位抢修'
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'person-traveling');
});

test('N2: 缺能力且无专业工具执行调查，必须被 blocked 且无可用解法', function () {
  const W = createTestEnv();
  const res = W.actionMethods.evaluate('task:investigation', '徒弟');
  assert.equal(res.ok, true);
  assert.equal(res.available.length, 0);
  assert.equal(res.canExecute, false);
});

test('N3: 私密事件禁止被注意竞争公开，必须隔离在 excludedSecrets', function () {
  const W = createTestEnv();
  const events = [
    { id: 'ev_secret_diary', title: '私密日记', urgency: 10, relevance: 10, isSecret: true, isPublic: false }
  ];
  const comp = W.rumor.competeForAttention(events, { capacity: 2, place: '城镇作坊' });
  assert.equal(comp.ok, true);
  assert.equal(comp.admitted.length, 0);
  assert.equal(comp.excludedSecrets.length, 1);
  assert.equal(comp.excludedSecrets[0].reason, 'secret-protected');
});

test('N4: 公共项目未达最低认缴阈值，禁止虚假激活', function () {
  const W = createTestEnv();
  W.coop.proposeProject({
    projectId: 'prj_bridge',
    name: '修桥',
    initiator: '工匠',
    minCommitment: 100,
    place: '河口'
  });
  W.coop.pledgeProject('prj_bridge', '工匠', { '金属': 10 });
  const st = W.coop.projectStatus('prj_bridge');
  assert.equal(st.project.status, 'pledging', '未满 100 绝不可自动激活为 active');
});

console.log('--- Summary: ' + pass + ' passed, ' + fail + ' failed ---');
if (fail > 0) process.exit(1);