'use strict';
// WorldAxis tests/test-wp-a3-integration.js
// 验证 A 包第 3 阶段全链条闭环：
// 1. WP-4 经营全链条贯通（接单 -> 备料预留 -> 推进 -> 延期 -> 部分交付 -> 发运物流 -> 货品抵达入库）
// 2. WP-4 跨日推进与存档重载（Save/Reload）单一真源持久化
// 3. WP-5 经验闭环：NPC 错失守约后产生遗憾回声，学习偏置真实影响下一次动机仲裁选择
// 4. WP-5 局部知情保护：不知情者不凭空产生全知经验
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
  W.freight.setSettings({ enabled: true });
  W.laborSchedule.setSettings({ enabled: true });
  W.actionMethods.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });

  W.store.transact(function (d) {
    d.people = d.people || {};
    ['工匠会长', '老铁匠', '年轻学徒', '外来商贩'].forEach(function (name) {
      d.people['p_' + name] = {
        id: 'p_' + name,
        name: name,
        location: '中心作坊',
        status: 'active',
        temperament: name === '年轻学徒' ? '务实' : '沉稳',
        resources: { '合金': 100, '元件': 100, '铜料': 100, '零件': 50 }
      };
    });
    // 设立一条从 中心作坊 到 远方边境 的物流路线（在 economy.routes 唯一真源中）
    d.economy = d.economy || { goods: [], orders: [], routes: [] };
    if (!Array.isArray(d.economy.routes)) d.economy.routes = [];
    d.economy.routes.push({
      id: 'rt_central_to_border',
      from: '中心作坊',
      to: '远方边境',
      status: 'open',
      cost: 10,
      lane: 'road',
      capacity: 50
    });
    d.freight = d.freight || { shipments: [] };
    if (!Array.isArray(d.freight.shipments)) d.freight.shipments = [];
    return true;
  }, 'seed:wp-a3');
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

// ── 1. WP-4: 经营全链条端到端贯通 ───────────────────────────
test('WP-4: 接单→备料预留→推进→延期→部分交付→物流发运→签收全链条贯通', function () {
  const W = createTestEnv();

  // 1. 开单：生产 4 个组件，工期 4 天
  const openRes = W.production.open({
    recipe: '组件',
    by: '老铁匠',
    qty: 4,
    days: 4,
    place: '中心作坊'
  });
  assert.equal(openRes.ok, true);
  const orderId = openRes.id;

  // 2. 备料预留：从老铁匠手里扣除材料进工单预留池
  const resup = W.production.resupply(orderId, {
    material: '铜料',
    amount: 10,
    by: '老铁匠'
  });
  assert.equal(resup.ok, true);
  assert.equal(resup.reserve['铜料'], 10);

  // 3. 推进第 1、2 天生产
  W.production.advance(orderId, { days: 1 });
  W.production.advance(orderId, { days: 1 });

  // 4. 突发情况：申请工期延期 2 天（总工期变为 6 天）
  const ext = W.production.extend(orderId, { days: 2, reason: '精密热处理工艺延时' });
  assert.equal(ext.ok, true);
  assert.equal(ext.days, 6);

  // 5. 此时按比例已完成部分产品，申请部分交付先行入库 1 件
  const partRes = W.production.deliverPartial(orderId, { qty: 1, place: '中心作坊' });
  assert.equal(partRes.ok, true);
  assert.equal(partRes.deliveredQty, 1);
  assert.equal(partRes.remainingQty, 3);
  assert.equal(partRes.status, 'running');

  // 6. 继续推进剩余工期至全部做完
  for (let i = 0; i < 6; i++) {
    const adv = W.production.advance(orderId, { days: 1 });
    if (adv.readyToDeliver || adv.status === 'done') break;
  }

  // 7. 结清交货并随单直接挂载物流调度发送至 远方边境
  const deliv = W.production.deliver(orderId, {
    place: '中心作坊',
    to: '远方边境',
    routeId: 'rt_central_to_border',
    transitDays: 2,
    base: 10
  });
  assert.equal(deliv.ok, true);
  assert.equal(deliv.status, 'delivered');
  assert(deliv.shipped && deliv.shipped.ok, '应成功调度物流在途运单');
  const shipmentId = deliv.shipped.id;
  // 8. 物流货运到达远方边境并签收入库
  const arriveRes = W.freight.arrive(shipmentId, { force: true });
  assert.equal(arriveRes.ok, true);
  assert.equal(arriveRes.to, '远方边境');
  assert.equal(arriveRes.resource, '组件');
  assert(arriveRes.stock >= 3, '目的地远方边境已实际入库该成品');
  // 校验货运单状态已更新为 arrived
  const sh = W.freight.view(shipmentId);
  assert.equal(sh.ok, true);
  assert.equal(sh.status, 'arrived');
});

// ── 2. WP-4: 跨日推进与跨会话重载持久化 ───────────────────────
test('WP-4: 跨日推进后重载实例，工单状态、预留池与已入库账本完整保持不变', function () {
  const W1 = createTestEnv();

  // 开单并预留备料
  const openRes = W1.production.open({
    recipe: '组件',
    by: '老铁匠',
    qty: 2,
    days: 3,
    place: '中心作坊'
  });
  const orderId = openRes.id;
  W1.production.resupply(orderId, { material: '铜料', amount: 8, by: '老铁匠' });
  W1.production.advance(orderId, { days: 1 });

  // 跨日推进
  W1.laborSchedule.advanceDay();

  // 模拟进程重载 / 跨会话加载
  const W2 = fresh().WA;
  W2.production.setSettings({ enabled: true });

  const job = W2.production.list().find(function (j) { return j.id === orderId; });
  assert(job, '重载后工单应依然存在');
  assert.equal(job.status, 'running');
  assert.equal(job.done, 1, '已推进天数持久化');
  assert.equal(job.qty, 2, '工单件数持久化');
  assert(job.reserve && job.reserve['铜料'] > 0, '预留池材料持久化');
});

// ── 3. WP-5: NPC 动机决策经验学习闭环（path-echo -> motive-arbitration）──
test('WP-5: 违约产生遗憾回声后修正偏置，真实改变下一次动机仲裁选择', function () {
  const W = createTestEnv();

  const person = {
    id: 'p_年轻学徒',
    name: '年轻学徒',
    temperament: '务实' // 务实底色，重视 livelihood
  };

  // 决策候选 1：去集市打零工（高生计回报，背弃既有约定）
  const candWork = {
    id: 'cand_job',
    title: '私下接外快',
    kind: 'errand',
    payoff: { livelihood: 3.0 },
    cost: { rest: 1.0 },
    commitmentImpact: { effect: 'break' } // 违约
  };

  // 决策候选 2：遵守约定协助师傅完成工坊工单（守约）
  const candPromise = {
    id: 'cand_keep_promise',
    title: '履约协助师傅',
    kind: 'duty',
    payoff: { commitment: 2.0, ambition: 1.0 },
    cost: { livelihood: 0.5 },
    commitmentImpact: { effect: 'fulfill' }
  };

  // 1. 首次面临抉择：由于学徒手头紧张，生计动机占优，决定去接外快
  const dec1 = W.motiveArbitration.decide(person, [candWork, candPromise], { lowFunds: true });
  assert.equal(dec1.ok, true);
  assert.equal(dec1.selected.id, 'cand_job', '首次因资金压力选择去挣钱');

  // 2. 记录预期与未选备选
  const recRes = W.pathEcho.recordExpectation(
    '年轻学徒',
    { selectedId: dec1.selected.id, title: dec1.selected.title, kind: 'errand', expectedPayoff: { livelihood: 3.0 } },
    [{ id: 'cand_keep_promise', title: '履约协助师傅' }],
    { lowFunds: true }
  );
  assert.equal(recRes.ok, true);
  const decisionId = recRes.decisionId;

  // 3. 事后获知实际后果：外快被克扣，且得知师傅因无人协助延误了大订单受到惩罚
  // 产生真实的遗憾（regret）与教训
  const realizeRes = W.pathEcho.realizeOutcome(
    '年轻学徒',
    decisionId,
    {
      payoff: { livelihood: 0.5 }, // 收益远不及预期
      cost: { livelihood: 1.0 },
      wasWitnessed: true
    },
    {
      'cand_job': true,
      'alt_truth_cand_keep_promise': { certainty: 'proven', betterThanChosen: true, summary: '若履约本可获得工坊固定分红与师傅好评' }
    }
  );
  assert.equal(realizeRes.ok, true);
  assert.equal(realizeRes.sentiment, 'regret', '应产生悔恨遗憾感');

  // 4. 下一次再次面临类似两难抉择时：
  // 从 store 中取出学徒最新状态（已累积了 pathEcho learnings）
  const updatedPerson = W.store.get().people['p_年轻学徒'];
  assert(updatedPerson.life && updatedPerson.life.learnings, '学徒应记录了经验教训');

  // 再次进行仲裁（此时已没有极端的 lowFunds 危机，属于普通情境）
  const dec2 = W.motiveArbitration.decide(updatedPerson, [candWork, candPromise], {});
  assert.equal(dec2.ok, true);
  // 经验偏置生效后，学徒选择履约，不再重复违约！
  assert.equal(dec2.selected.id, 'cand_keep_promise', '学习到违约教训后，偏置改变了选择，决定坚守承诺');
});

// ── 4. WP-5: 局部知情保护（不知情者不产生全知教训）─────────
test('WP-5: 未获知实际损失的不知情者，不产生虚假遗憾，偏好不发生跳变', function () {
  const W = createTestEnv();

  // 另一名工匠外来商贩也做出了一项选择
  const recRes = W.pathEcho.recordExpectation(
    '外来商贩',
    { selectedId: 'cand_trade', title: '外出贩运', kind: 'trade', expectedPayoff: { livelihood: 4.0 } },
    [],
    {}
  );
  assert.equal(recRes.ok, true);
  const decisionId = recRes.decisionId;

  // 远方事件受损，但外来商贩未收到消息、亦未亲历（isAware === false）
  const realizeRes = W.pathEcho.realizeOutcome(
    '外来商贩',
    decisionId,
    { payoff: { livelihood: 0 }, wasWitnessed: false },
    {} // 空的已知事实，没有通知消息
  );
  assert.equal(realizeRes.ok, true);
  assert.equal(realizeRes.realized, false, '不知情时不结算预期回声');
  assert.equal(realizeRes.reason, 'unaware-of-outcome');

  const vendor = W.store.get().people['p_外来商贩'];
  const learnings = (vendor.life && vendor.life.learnings) ? vendor.life.learnings.biases : {};
  assert.equal(Object.keys(learnings).length, 0, '不知情者不产生经验偏置');
});

console.log('----------------------------------------------------');
console.log('WP-A3 整合门禁套件运行结果: ' + passCount + ' 通过 / ' + failCount + ' 失败');
if (failCount > 0) process.exit(1);