#!/usr/bin/env node
// WorldAxis tests/scenario-v12-travel-return.js
// V12 世界级贯通场景 3：远行归来（Travel & Return: OPV12-4 深度协同）
//
// 判据链路（《V12_MASTER_PLAN.md》）：
//   「按剧情时间旅行 → 远方有限推进 → 地点与组织变化 → 消息延迟到达 → 回到旧人旧地看到变化 → 未完成目标重新评估」
//
// 1. 剧情出发：游侠受目标与计划驱动（plan.expand），离开安城出发前往边陲（world.depart）。
// 2. 在途推进：按剧情时间步进，耗时推进中不允许早到，生命周期呈现（world.advance）。
// 3. 远方有限演化：在游侠离开安城期间，安城发生重大事件（region.occur），生成延迟传播队列。
// 4. 信息延迟屏障：在消息尚未传播至边陲前，游侠对安城突变完全不知（region.heard 隔离）。
// 5. 到达边陲：游侠在途时间耗尽，安全抵达边陲，完成寻铁阶段目标（world.arrive / plan.advance）。
// 6. 踏上归途：游侠启程从边陲返回安城，途中消息如期在途落地（region.deliver）。
// 7. 归来重逢：游侠抵达安城，获得落地的突变消息（region.heard），发现旧地铁匠铺因动乱歇业。
// 8. 目标受挫与重决策：未完成的目标因旧地变化受阻（plan.settle blocked），通过统一行动总线发起重新规划（plan.rechoose）。
'use strict';

const sync = require('./ui-gate-sync.js');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
  console.log('PASS: ' + msg);
}

function runScenario() {
  const WA = sync.fresh().WA;
  WA.store.init();

  // 1. 启动协同引擎
  WA.actionDesk.setSettings({ enabled: true });
  WA.world.setSettings({ enabled: true });
  WA.plan.setSettings({ enabled: true });
  WA.region.setSettings({ enabled: true, stalenessMs: 86400000 * 3 }); // 3天传闻有效期

  // 2. 初始化地理拓扑与地域传播通道
  // 安城（起点/基地）与边陲（目的地/矿区），单程道路 120 分钟（剧情旅程）
  const p1 = WA.world.addPlace({ name: '安城', kind: 'public' });
  const p2 = WA.world.addPlace({ name: '边陲', kind: 'wild' });
  const p3 = WA.world.addPlace({ name: '隐谷', kind: 'wild' });
  assert(p1.ok && p2.ok && p3.ok, '基础地点（安城、边陲、隐谷）登记成功');

  const road1 = WA.world.addRoad('安城', '边陲', 120, 2);
  const road2 = WA.world.addRoad('边陲', '安城', 120, 2);
  const road3 = WA.world.addRoad('安城', '隐谷', 180, 2);
  assert(road1.ok && road2.ok && road3.ok, '往返通路登记成功');

  // region 登记传播距离：安城距离边陲 1 天路程（通过 road 渠道延迟一天送达）
  WA.region.register('安城', { distanceDays: 1, lane: 'road' });

  // 3. 初始化角色与长期目标
  const T0 = 1000000;
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people.p_游侠 = {
      name: '游侠',
      place: '安城',
      status: 'active',
      life: {
        goals: [
          { id: 'g_reforge', text: '重铸断剑', status: 'active' }
        ]
      }
    };
  }, 'scenario3:seed-ranger');

  // 4. 通过统一行动总线展开长期计划
  // 步骤 0: 去边陲寻铁；步骤 1: 依赖 0，回安城铁匠铺重铸
  const expRes = WA.actionDesk.plan('plan.expand', {
    person: '游侠',
    goalId: 'g_reforge',
    steps: [
      { text: '前往边陲寻找陨铁', place: '边陲' },
      { after: '0', text: '返回安城铁匠铺重铸', place: '安城' }
    ]
  });
  assert(expRes.ok && expRes.steps === 2, '统一行动总线成功展开人物长期旅行与重铸计划');

  // 游侠启动第一阶段任务
  const curStep0 = WA.plan.current('游侠');
  assert(curStep0.ok && curStep0.seq === 0 && curStep0.place === '边陲', '第一阶段目标明确锁定为边陲');
  const advStep0 = WA.actionDesk.plan('plan.advance', { person: '游侠' });
  assert(advStep0.ok && advStep0.seq === 0, '第一阶段目标进入执行中状态');

  // 5. 游侠从安城启程前往边陲
  const depRes = WA.actionDesk.plan('world.depart', {
    person: '游侠',
    from: '安城',
    to: '边陲',
    at: T0
  });
  assert(depRes.ok && depRes.status === 'in-transit', '游侠从安城启程出发，行程写入世界真源');

  // 检查行动生命周期投影：游侠在途状态可读
  const lcTransit = WA.actionDesk.lifecycle({ who: '游侠' });
  const rowTransit = (lcTransit.rows || []).filter(function (r) { return r.kind === 'people' && r.id === '游侠'; })[0];
  assert(rowTransit && rowTransit.stage === 'in-progress' && rowTransit.recover === null, '游侠在途中生命周期投影呈现为 in-progress 且不可提前结算');

  // 6. 剧情时间推进 60 分钟（未到期）
  const tAdv1 = WA.actionDesk.plan('world.advance', { minutes: 60, at: T0 + 60 * 60000 });
  assert(tAdv1.ok, '剧情时间推进 60 分钟');
  const earlyArrive = WA.actionDesk.plan('world.arrive', { person: '游侠', at: T0 + 60 * 60000 });
  assert(!earlyArrive.ok && earlyArrive.reason === 'still-in-transit', '旅程未走完前拒绝提前抵达');

  // 7. 远方世界演化：安城在游侠离开后爆发工匠行会骚乱
  // 骚乱导致安城行会封炉，延迟 1 天向外传播
  const occRes = WA.actionDesk.plan('region.occur', {
    place: '安城',
    kind: 'strife',
    text: '安城行会歇业封炉',
    now: T0 + 60 * 60000
  });
  assert(occRes.ok && occRes.delayMs > 0, '安城发生远方动乱并进入地域传播链');

  // 8. 远方信息延迟到达验证：游侠在路上与边陲，无法瞬间知晓安城事件
  const heardEarly = WA.region.heard('游侠', { now: T0 + 60 * 60000 });
  assert(heardEarly.ok && heardEarly.heard === 0, '信息未逾传播延迟，游侠完全不知安城发生变故（非全知）');

  // 9. 游侠抵达边陲，完成寻铁任务
  const tAdv2 = WA.actionDesk.plan('world.advance', { minutes: 60, at: T0 + 120 * 60000 });
  assert(tAdv2.ok, '剧情时间再推 60 分钟，总耗时满 120 分钟');
  assert(tAdv2.arrived && tAdv2.arrived.length > 0 && tAdv2.arrived[0] === '游侠→边陲', '游侠随时间推进顺利抵达边陲');

  // 结算第 0 步成功：陨铁入手
  const settleStep0 = WA.actionDesk.plan('plan.settle', { person: '游侠', outcome: 'done' });
  assert(settleStep0.ok && settleStep0.step === 'done' && settleStep0.next === 1, '边陲寻铁完成，计划指向步骤 1（返回安城）');

  // 开启第 1 步
  const advStep1 = WA.actionDesk.plan('plan.advance', { person: '游侠' });
  assert(advStep1.ok && advStep1.seq === 1 && advStep1.place === '安城', '步骤 1 激活：返回安城重铸');

  // 10. 游侠从边陲踏上归途，返回安城
  const T_RETURN = T0 + 150 * 60000;
  const depReturn = WA.actionDesk.plan('world.depart', {
    person: '游侠',
    from: '边陲',
    to: '安城',
    at: T_RETURN
  });
  assert(depReturn.ok && depReturn.status === 'in-transit', '游侠带着陨铁启程返回安城');

  // 11. 归途之中时间流逝（跨越传播延迟时间，达到事件 dueAt 之后）
  const T_EVENT_DUE = occRes.dueAt + 1000;
  // 事件落地
  const deliverRes = WA.actionDesk.plan('region.deliver', { id: occRes.id, now: T_EVENT_DUE });
  assert(deliverRes.ok && deliverRes.deliveredAt > 0, '安城歇业动乱事件已过延迟期，在传播拓扑中完成投递落地');

  // 12. 游侠回抵安城
  const tAdvReturn = WA.actionDesk.plan('world.advance', { minutes: 120, at: T_RETURN + 120 * 60000 });
  assert(tAdvReturn.ok && tAdvReturn.arrived && tAdvReturn.arrived.length > 0 && tAdvReturn.arrived[0] === '游侠→安城', '游侠远行归来，重返旧地安城');

  // 13. 回到旧地看到变化：游侠接收到安城落地的变故消息
  const heardHome = WA.region.heard('游侠', { now: T_EVENT_DUE + 1000 });
  assert(heardHome.ok && heardHome.heard > 0, '回到旧地，游侠感知到已落地的变故信息');
  assert(heardHome.rows[0].text === '安城行会歇业封炉', '游侠获知具体事实：安城铁匠铺与行会停业封炉');

  // 14. 未完成目标重新评估：原计划在安城铁匠铺重铸断剑无法推进，结算为受阻 (blocked)
  const settleStep1Blocked = WA.actionDesk.plan('plan.settle', {
    person: '游侠',
    outcome: 'blocked',
    why: '安城铁匠铺封炉'
  });
  assert(settleStep1Blocked.ok && settleStep1Blocked.step === 'blocked' && settleStep1Blocked.status === 'blocked', '旧地受阻导致当前计划步骤判定为 blocked');

  // 检查状态：当前处于受挫状态
  const curBlocked = WA.plan.current('游侠');
  assert(curBlocked.ok === false && curBlocked.reason === 'blocked', '人物当前行动链路受挫停顿，等待重新决策');

  // 15. 应对旧地变化：游侠重新评估目标并改选路径（rechoose）去往隐谷寻师
  const rechooseRes = WA.actionDesk.plan('plan.rechoose', {
    person: '游侠',
    steps: [
      { text: '转赴隐谷寻找避世铸剑名匠', place: '隐谷' }
    ]
  });
  assert(rechooseRes.ok && rechooseRes.kept === 1, '受挫后通过统一总线重新决策，保留已完成的寻铁事实并改选后续路径');

  const curRechosen = WA.plan.current('游侠');
  assert(curRechosen.ok && curRechosen.seq === 1 && curRechosen.place === '隐谷' && curRechosen.text === '转赴隐谷寻找避世铸剑名匠', '目标成功完成重新评估与流转');

  console.log('\n========================================');
  console.log('SCENARIO-TRAVEL-RETURN: 15 / 失败 0 (ALL PASS)');
  console.log('========================================\n');
}

runScenario();
