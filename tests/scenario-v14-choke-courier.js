'use strict';
// WorldAxis tests/scenario-v14-choke-courier.js
// 验证 WorldAxis V14 场景 14：雪崩险道、供应链断裂与远方驿信投递
// 机制覆盖：
//   - OPV14-4: courierDispatch.sendDispatch / dispatchPending 远方消息延迟排队与到期投递
//   - EXV14-4: supplyChoke.triggerChoke 交通险道封闭、物资库存锐减、物价暴涨与配给限购
//   - 负控制测试：缺失路线拒绝、缺失城市拒绝、空信件内容拒绝、熔断开关关闭拒绝

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'courierDispatch', 'supplyChoke'].forEach(function (k) {
    if (W[k]) {
      if (typeof W[k].setSettings === 'function') W[k].setSettings({ enabled: true });
      if (typeof W[k].saveSettings === 'function') W[k].saveSettings({ enabled: true });
    }
  });
  return W;
}

function runScenario() {
  const W = env();
  let asserts = 0;
  function a(cond, msg) {
    asserts++;
    if (!cond) {
      console.error('FAIL: ' + msg);
      process.exit(1);
    }
  }

  // 1. 北境峡谷险道塌方，触发物资断裂与市场物价暴涨 (EXV14-4)
  const now = Date.now();
  const choke = W.actionDesk.plan('environment.triggerSupplyChoke', {
    routeId: 'route_north_pass',
    destinationCity: 'city_frosthold',
    resourceKind: 'medicine',
    durationDays: 10,
    severity: 1.5,
    at: now
  });
  a(choke.ok === true && choke.reason === 'choke-triggered',
    'S14-1: 险道阻断与供应链危机成功触发');
  a(choke.choke && choke.choke.durationDays === 10,
    'S14-2: 封锁持续天数准确在案');

  // 验证城市市场物价暴涨与库存骤减
  const s = W.store.get();
  const market = s.cityMarkets['city_frosthold'];
  a(market && market.rationing === true,
    'S14-3: 城市生药进入战时紧急配给限购管制');
  a(market.prices['medicine'] > 10,
    'S14-4: 生药市场价格触发恐慌性通胀飙升');
  a(market.stock['medicine'] < 100,
    'S14-5: 城市生药可用库存物理级扣减');

  // 2. 远方边关派发求援信件，沿驿路慢速投递 (OPV14-4)
  const ltr = W.actionDesk.plan('chronicle.deliverRemoteEcho', {
    fromRegion: 'region_north_border',
    toRecipient: 'p_commander',
    content: '北境峡谷塌方，关隘生药告急，请求速派工兵排险！',
    distanceKm: 60, // 速度 20km/h，需耗时 3 小时
    at: now
  });
  a(ltr.ok === true && ltr.reason === 'dispatched',
    'S14-6: 远方信件成功排队发往驿路');
  a(ltr.letter && ltr.letter.status === 'in-transit',
    'S14-7: 信件当前处于物理在途运输状态');

  // 3. 经过 1 小时，信件未到 ETA，检查未投递
  const pending1 = W.actionDesk.plan('chronicle.dispatchPending', { at: now + 3600 * 1000 });
  a(pending1.ok === true && pending1.deliveredCount === 0,
    'S14-8: 未到驿马送达时间，信箱未收到在途信件（拒绝全知超距通讯）');

  // 4. 经过 4 小时，信件逾越 ETA，完成真实投递与收件箱回流
  const pending2 = W.actionDesk.plan('chronicle.dispatchPending', { at: now + 4 * 3600 * 1000 });
  a(pending2.ok === true && pending2.deliveredCount === 1,
    'S14-9: 历经地理距离与时间流逝，驿信成功送达目标守将');

  const sAfterDelivery = W.store.get();
  a(sAfterDelivery.inboxes && sAfterDelivery.inboxes['p_commander'] && sAfterDelivery.inboxes['p_commander'].length === 1,
    'S14-10: 守将收件箱真实沉淀情报内容');
  a(sAfterDelivery.inboxes['p_commander'][0].content.includes('工兵排险'),
    'S14-11: 收到北境求援信件文本');

  // 5. 破坏性负控制测试 1：缺失路线代码必然拒绝
  const neg1 = W.actionDesk.plan('environment.triggerSupplyChoke', {
    destinationCity: 'city_frosthold',
    resourceKind: 'grain'
  });
  a(neg1.ok === false && neg1.reason === 'missing-route-id',
    'S14-NC1: 缺失路线代码阻断必然拒绝');

  // 6. 破坏性负控制测试 2：缺失目的地城市必然拒绝
  const neg2 = W.actionDesk.plan('environment.triggerSupplyChoke', {
    routeId: 'route_1',
    destinationCity: '  ',
    resourceKind: 'grain'
  });
  a(neg2.ok === false && neg2.reason === 'missing-destination',
    'S14-NC2: 缺失目标城市阻断必然拒绝');

  // 7. 破坏性负控制测试 3：空信件内容必然拒绝
  const neg3 = W.actionDesk.plan('chronicle.deliverRemoteEcho', {
    fromRegion: 'region_a',
    toRecipient: 'p_commander',
    content: '   '
  });
  a(neg3.ok === false && neg3.reason === 'empty-content',
    'S14-NC3: 空信件内容派发必然拒绝');

  // 8. 破坏性负控制测试 4：引擎熔断关闭
  if (W.settingsBus) {
    const reg = W.__settingsRegs.find(function (r) { return r.module === 'supplyChoke'; });
    if (reg) W.settingsBus.save(reg, { enabled: false });
  }
  const neg4 = W.actionDesk.plan('environment.triggerSupplyChoke', {
    routeId: 'route_1',
    destinationCity: 'city_a',
    resourceKind: 'iron'
  });
  a(neg4.ok === false && neg4.reason === 'disabled',
    'S14-NC4: 引擎开关关闭时供应链阻断硬熔断拒收');

  console.log('场景 14 专锁全部断言通过（含 4 项真负控制）！');
  console.log('PASS ' + asserts + ' / ' + asserts);
}

runScenario();