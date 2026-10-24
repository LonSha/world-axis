'use strict';
// WorldAxis tests/test-wp-a2-integration.js
// 验证 A 包第 2 阶段纵向切片：WP-4 经营与工艺链（技艺资格、延期、部分交付） + WX-1 有限机会多人物竞争与转向 + WX-2 共同计划版本化知情
const assert = require('node:assert/strict');
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
    ['大师傅', '小学徒', '外来工', '在途游侠'].forEach(function (name) {
      d.people['p_' + name] = {
        id: 'p_' + name,
        name: name,
        location: name === '在途游侠' ? '荒野' : '工坊',
        status: name === '在途游侠' ? 'traveling' : 'active',
        resources: { '合金': 100, '元件': 100, '铜料': 100 }
      };
    });
    return true;
  }, 'seed:wp-a2');

  return W;
}

let passCount = 0;
let failCount = 0;
function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log('PASS ' + name);
  } catch (err) {
    failCount++;
    console.error('FAIL ' + name, err);
  }
}

// ── 1. WP-4: 技艺传统资格前置与师徒带工协作 ─────────────────
test('WP-4: 学徒持手稿但无实践经验独立开单被拒，师傅带工协作则允许生产', function () {
  const W = createTestEnv();

  // 1. 声明一项高级工艺谱系：需要最低阶段 2 才能熟练生产
  const defRes = W.techLineage.declareTradition('trad_precision_core', {
    name: '高精密动力核心工艺',
    documents: ['doc_blueprints_v1'],
    requiredMinStage: 2
  });
  assert.equal(defRes.ok, true);

  // 2. 登记大师傅为合格实践者（stage: 2），小学徒仅拿到手稿（未受训出师）
  W.techLineage.registerMaster('trad_precision_core', '大师傅', 2);

  // 3. 小学徒持有手稿独立开单生产该工艺核心
  const failOpen = W.production.open({
    recipe: '组件',
    by: '小学徒',
    qty: 1,
    days: 3,
    place: '工坊',
    traditionId: 'trad_precision_core',
    docId: 'doc_blueprints_v1',
    hasDocument: true
  });
  assert.equal(failOpen.ok, false);
  assert.equal(failOpen.reason, 'unskilled-reader');

  // 4. 小学徒由大师傅带工协作（withMaster）开单
  const passOpen = W.production.open({
    recipe: '组件',
    by: '小学徒',
    withMaster: '大师傅',
    qty: 1,
    days: 3,
    place: '工坊',
    traditionId: 'trad_precision_core',
    docId: 'doc_blueprints_v1',
    hasDocument: true
  });
  assert.equal(passOpen.ok, true);
  assert.equal(passOpen.supervisedBy, '大师傅');
});

// ── 2. WP-4: 工单延期机制 ───────────────────────────────────
test('WP-4: 工单支持显式延期，增加工期并保留已消耗投入与既有工期', function () {
  const W = createTestEnv();
  const openRes = W.production.open({
    recipe: '组件',
    by: '大师傅',
    qty: 1,
    days: 2,
    place: '工坊'
  });
  assert.equal(openRes.ok, true);
  const orderId = openRes.id;

  // 推进 1 天
  const adv = W.production.advance(orderId, { days: 1 });
  assert.equal(adv.ok, true);
  assert.equal(adv.done, 1);

  // 发生突发延期需求：申请增加 2 天工期
  const ext = W.production.extend(orderId, { days: 2, reason: '设备维护与精度微调' });
  assert.equal(ext.ok, true);
  assert.equal(ext.days, 4, '总工期应从 2 天延至 4 天');
  assert.equal(ext.done, 1, '已推进的天数应完整保留');
  assert.equal(ext.status, 'running');
});

// ── 3. WP-4: 批量工单部分交付 ──────────────────────────────
test('WP-4: 批量工单支持按进度部分交付，部分成品先行入库，余单继续生产', function () {
  const W = createTestEnv();
  // 开一张 4 件套大单，总工期 4 天
  const openRes = W.production.open({
    recipe: '组件',
    by: '大师傅',
    qty: 4,
    days: 4,
    place: '工坊'
  });
  assert.equal(openRes.ok, true);
  const orderId = openRes.id;

  // 推进 2 天（按工期比例已完成 2 件）
  W.production.advance(orderId, { days: 2 });

  // 申请部分交付 2 件
  const partRes = W.production.deliverPartial(orderId, { qty: 2, place: '工坊' });
  assert.equal(partRes.ok, true);
  assert.equal(partRes.deliveredQty, 2, '先行交付 2 件');
  assert.equal(partRes.remainingQty, 2, '剩余 2 件继续在产');
  assert.equal(partRes.status, 'running', '工单尚未全部交完，保持 running');
  assert.equal(partRes.days, 2, '剩余工期等比例折算');

  // 查看工坊库存确实入库了部分产物
  const stockQty = W.economy.checkStock ? W.economy.checkStock('工坊', '组件') : null;
  if (stockQty != null) {
    assert(stockQty >= 2, '库存中应实际入库至少 2 件');
  }
});

// ── 4. WX-1: 有限机会下的多人物竞争择定与落选转向 ───────────
test('WX-1: 多人申请同一工单名额，在途者被拒，择优录取且落选者获得转向建议', function () {
  const W = createTestEnv();
  // 1. 开单
  const openRes = W.production.open({
    recipe: '组件',
    by: '大师傅',
    qty: 2,
    days: 3,
    place: '工坊'
  });
  const orderId = openRes.id;

  // 2. 声明工单招工机会（1 个工位名额，资质优先规则）
  const declRes = W.actionDesk.plan('actionDesk.declareOpportunity', {
    oppId: 'opp_craft_01',
    kind: 'production_order',
    targetId: orderId,
    slots: 1,
    rule: 'qualification'
  });
  assert.equal(declRes.ok, true);

  // 3. 在途游侠申请被拒（物理排他拦截）
  const wandererBid = W.actionDesk.plan('actionDesk.applyOpportunity', {
    oppId: 'opp_craft_01',
    who: '在途游侠',
    skill: 5
  });
  assert.equal(wandererBid.ok, false);
  assert.equal(wandererBid.reason, 'person-traveling');

  // 4. 外来工与大师傅分别申请竞争
  const bid1 = W.actionDesk.plan('actionDesk.applyOpportunity', {
    oppId: 'opp_craft_01',
    who: '外来工',
    skill: 2,
    price: 8
  });
  assert.equal(bid1.ok, true);

  const bid2 = W.actionDesk.plan('actionDesk.applyOpportunity', {
    oppId: 'opp_craft_01',
    who: '大师傅',
    skill: 5,
    price: 15
  });
  assert.equal(bid2.ok, true);

  // 5. 择定胜出者（qualification 规则，大师傅胜出）
  const awardRes = W.actionDesk.plan('actionDesk.awardOpportunity', {
    oppId: 'opp_craft_01'
  });
  assert.equal(awardRes.ok, true);
  assert.equal(awardRes.winners.length, 1);
  assert.equal(awardRes.winners[0].who, '大师傅');
  assert.equal(awardRes.declined.length, 1);
  assert.equal(awardRes.declined[0].who, '外来工');
  assert(awardRes.declined[0].nextActions.includes('actionDesk.findAlternative'));

  // 6. 验证胜出者已被真实排入工单 crew
  const jobs = W.production.list({ by: '大师傅' });
  const targetJob = jobs.find(function (j) { return j.id === orderId; });
  assert(targetJob);
  const isStaffed = (targetJob.crew || []).some(function (c) { return c.who === '大师傅'; });
  assert.equal(isStaffed, true, '胜出者应被真实排入工单');
});

// ── 5. WX-2: 共同计划修订与版本化知情 ───────────────────────
test('WX-2: 计划修订递增版本，发起人知晓但同伴处于旧版认知，直到重新在场确认', function () {
  const W = createTestEnv();

  // 1. 建立初始协作协议（revision: 1）
  const openRes = W.sharedAwareness.openPact('pact_expedition_01', {
    title: '共同巡检作坊',
    participants: ['大师傅', '小学徒']
  });
  assert.equal(openRes.ok, true);

  // 2. 双双确认
  W.sharedAwareness.confirmPact('pact_expedition_01', '大师傅');
  W.sharedAwareness.confirmPact('pact_expedition_01', '小学徒');
  const coord1 = W.sharedAwareness.coordination('pact_expedition_01');
  assert.equal(coord1.state, 'coordinated', '双方确认后进入 coordinated 状态');

  // 3. 大师傅由于天气原因修订计划（延期次日，revision: 2）
  const amendRes = W.actionDesk.plan('sharedAwareness.amendPact', {
    pactId: 'pact_expedition_01',
    who: '大师傅',
    changes: { title: '共同巡检作坊（改至明日晨间）' }
  });
  assert.equal(amendRes.ok, true);
  assert.equal(amendRes.revision, 2);

  // 4. 查看双方认知视图：大师傅已更新，小学徒仍处于旧版本状态
  const masterView = W.sharedAwareness.viewPact('pact_expedition_01', '大师傅');
  assert.equal(masterView.cognitiveStatus, 'confirmed_latest');

  const apprenticeView = W.sharedAwareness.viewPact('pact_expedition_01', '小学徒');
  assert.equal(apprenticeView.cognitiveStatus, 'stale_revision', '学徒未获知新版本，属于陈旧认知');

  // 当前协作状态处于待对齐/误会风险
  const coord2 = W.sharedAwareness.coordination('pact_expedition_01');
  assert.notEqual(coord2.state, 'coordinated');

  // 5. 小学徒当面获知并确认新版
  const confirmRes = W.sharedAwareness.confirmPact('pact_expedition_01', '小学徒');
  assert.equal(confirmRes.ok, true);

  const coord3 = W.sharedAwareness.coordination('pact_expedition_01');
  assert.equal(coord3.state, 'coordinated', '学徒确认新版本后重新恢复协调');
});

console.log('----------------------------------------------------');
console.log('WP-A2 整合门禁套件运行结果: ' + passCount + ' 通过 / ' + failCount + ' 失败');
if (failCount > 0) process.exit(1);
