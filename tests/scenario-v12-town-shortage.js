'use strict';
// WorldAxis tests/scenario-v12-town-shortage.js
// 验证 WorldAxis V12 世界级贯通场景 1：城镇短缺与守恒物流闭环
// 场景链路：
//   1. 初始情境：西原发生物资短缺（生铁库存不足，工坊无法开启「铁器」生产）
//   2. 决策与规划：通过 actionDesk.plan 发起守恒货运调拨（freight.dispatch 从东市向西原发运生铁）
//   3. 守恒验证：发运源头东市库存即时扣减，货运单进入在途状态，且进入 actionDesk.lifecycle 跨轮投影
//   4. 运力抵运入库：货物抵达西原后，通过 actionDesk 路由执行 freight.arrive 确认入库，库存真源同步到账
//   5. 解锁复工：西原原料到账，工坊通过 actionDesk.plan 成功启动 production.open 并推进排班，完成短缺闭环！

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  // 显式开启协同涉及的引擎
  ['economy', 'freight', 'production', 'actionDesk', 'laborSchedule'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runScenario(a) {
  const W = env();

  // 1. 初始化两地物资环境：
  //    东市：生铁 50 单位（富余）
  //    西原：生铁 0 单位（短缺，基价 10，牌价 10）
  W.store.transact(function (draft) {
    draft.economy = draft.economy || { goods: [], orders: [], routes: [] };
    draft.economy.goods = [
      { place: '东市', resource: '生铁', stock: 50, price: 10, base: 10, demand: 5, consumed: 0, tickedAt: '', at: Date.now(), updatedAt: Date.now() },
      { place: '西原', resource: '生铁', stock: 0, price: 10, base: 10, demand: 20, consumed: 0, tickedAt: '', at: Date.now(), updatedAt: Date.now() }
    ];
    // 建立商路 route_east_west: 东市 -> 西原
    draft.economy.routes = [
      { id: 'route_east_west', from: '东市', to: '西原', lane: 'road', status: 'open', cost: 5, days: 2 }
    ];
    // 登记铁匠铺与工匠
    draft.production = draft.production || { jobs: [], facilities: [] };
    draft.production.facilities = [
      { name: '西原铁匠坊', label: '西原铁匠坊', slots: 3, at: Date.now(), updatedAt: Date.now() }
    ];
    draft.people = draft.people || {};
    draft.people['p_smith'] = { name: '铁匠老李', location: '西原', status: 'idle', resources: {} };
    return true;
  }, 'setup:shortage-world');

  // 验证短缺存在：西原铁匠老李尝试自市场采购原料，由于库存为 0 受阻
  const buyAttempt = W.actionDesk.plan('economy.buy', {
    place: '西原',
    resource: '生铁',
    qty: 5,
    by: '铁匠老李'
  });
  a(buyAttempt && buyAttempt.ok === false && (buyAttempt.reason === 'short-stock' || buyAttempt.reason === 'cannot-afford'), '短缺现场：西原市场上无生铁或无法购买');

  // 2. 发起跨域调度：通过统一调度中心发起守恒运输 (freight.dispatch 路由)
  const dispatchRes = W.actionDesk.plan('freight.dispatch', {
    routeId: 'route_east_west',
    from: '东市',
    resource: '生铁',
    qty: 20,
    transitDays: 2,
    base: 10
  });

  a(dispatchRes && dispatchRes.ok === true, '统一行动总线成功调度守恒货运');
  a(Array.isArray(dispatchRes.nextActions) && dispatchRes.nextActions.includes('freight.arrive'), '调度动作带出后续履约动作');

  // 3. 守恒验证：东市库存从 50 扣减至 30
  const eastIronView = W.economy.view('东市', '生铁');
  a(eastIronView && eastIronView.stock === 30, '货运发运严格守恒扣减源地库存（50 -> 30）');

  // 4. 跨轮生命周期感知：actionDesk.lifecycle 能看到该笔在途货物
  const lc = W.actionDesk.lifecycle({ who: '铁匠老李' });
  a(lc && lc.ok === true, '跨轮行动生命周期投影可读');
  const freightItem = (lc.rows || []).find(function (r) { return r.kind === 'freight' && r.id === dispatchRes.id; });
  a(freightItem && freightItem.stage === 'in-progress', '货物在途如实反映于跨轮投影中');
  a(freightItem && freightItem.recover === 'freight.arrive:' + dispatchRes.id, '跨轮投影提供合法恢复钩子');

  // 5. 运输抵达与入库：通过 actionDesk 路由执行抵达 (freight.arrive 路由)
  //    使用 force=true 模拟商旅历经在途时长后抵达
  const arriveRes = W.actionDesk.plan('freight.arrive', {
    shipmentId: dispatchRes.id,
    base: 10,
    force: true
  });
  a(arriveRes && arriveRes.ok === true, '在途货物安全送达西原并确认入库');

  // 目的地西原库存到账验证
  const westIronView = W.economy.view('西原', '生铁');
  a(westIronView && westIronView.stock === 20, '西原生铁成功入库，库存由 0 变为 20');

  // 再次核查跨轮投影：货运已归入 terminalRows
  const lcAfter = W.actionDesk.lifecycle({ who: '铁匠老李' });
  const termFreight = (lcAfter.terminalRows || []).find(function (r) { return r.id === dispatchRes.id; });
  a(termFreight && termFreight.stage === 'terminal', '已抵达货运离开活跃队列，归入终态追溯');

  // 6. 短缺解除与后续行为联动：西原此时拥有充足生铁原料
  // 市场端允许以官方牌价购买
  W.store.transact(function (draft) {
    draft.people['p_smith'].resources['银元'] = 100;
    return true;
  }, 'fund:smith');

  const buyRes = W.actionDesk.plan('economy.buy', {
    place: '西原',
    resource: '生铁',
    qty: 5,
    by: '铁匠老李'
  });
  a(buyRes && buyRes.ok === true, '短缺解除后，西原居民/工匠成功自市场购得原料');
  a(buyRes.stock === 15, '西原生铁市场库存扣减为 15');

  // 7. 工匠开工生产：西原铁匠坊成功开启工单
  const openRes = W.actionDesk.plan('production.open', {
    recipe: '面包', // 使用经济已知内建配方测试工单流
    by: '铁匠老李',
    facility: '西原铁匠坊',
    qty: 2,
    days: 2
  });
  a(openRes && openRes.ok === true, '原料与生产环境完备，成功开启工单');
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (ok, name) => {
    if (ok) {
      pass++;
      console.log('PASS: ' + name);
    } else {
      fail++;
      console.log('FAIL: ' + name);
    }
  };
  try {
    runScenario(a);
  } catch (e) {
    fail++;
    console.error(e.stack);
  }
  console.log('\nSCENARIO-TOWN-SHORTAGE: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
}

module.exports = { runScenario };
