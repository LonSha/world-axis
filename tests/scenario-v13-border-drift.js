'use strict';
// WorldAxis tests/scenario-v13-border-drift.js
// 验证 WorldAxis V13 世界级贯通场景 8：边境流言引爆战端与地理因果
//
// 场景全链路旅程：
//   1. 初始宏观地理拓扑：南境重镇【南川府】与北境边防要塞【黑石关】，中间经由险峻狭道【落雁峡】相连；
//   2. 险道季节性天堑阻隔：寒冬暴雪袭来，【落雁峡】触发 terrainHazard.blockChannel，官方驿道彻底中断；
//   3. 区域物价飞涨与黑市走私：黑石关铁矿断供引发严重通胀（contraband.assessInflation），行商铤而走险开辟黑市高危走私（contraband.openRoute & smuggle）；
//   4. 边境意外事故与传闻地理失真：南川府发生军营铁器走私事故，经多城镇行商跨驿站多跳传播（rumor.driftRelay），在黑石关发生信息熵变，异化为“南方准备发动越界突袭”的最高战备预警（threatLevel: lethal_alert）；
//   5. 守军封关备战与玩家紧急干预：黑石关守军误判威胁准备发起先发制人反击，玩家密探冒险强行翻越暴雪天堑（terrainHazard.forceTraverse），付出身心受创代价赶赴黑石关出示铁证勘验辟谣（rumor.inspectDrift & rumor.refute），成功止战化解全面兵燹危机！

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'economy', 'world', 'weather', 'contraband', 'terrainHazard', 'rumor', 'intel'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runScenario(a) {
  const W = env();

  // ── 1. 初始宏观地理拓扑与角色设定 ──
  W.store.transact(function (draft) {
    draft.world = draft.world || { places: [], roads: [] };
    draft.people = draft.people || {};
    // 角色设定：玩家密探 与 走私行商
    draft.people['p_scout'] = {
      id: 'p_scout',
      name: '巡察使云飞',
      location: '南川府',
      resources: { stamina: 85, funds: 500, '铁矿': 0 },
      stress: 10,
      trauma: 0,
      life: { commitments: [] }
    };
    draft.people['p_smuggler'] = {
      id: 'p_smuggler',
      name: '黑市行商老刀',
      location: '落雁峡口',
      resources: { stamina: 60, funds: 200, '铁矿': 50 },
      stress: 25,
      trauma: 0,
      life: { commitments: [] }
    };

    // 初始经济商品：黑石关铁矿匮乏
    draft.economy = draft.economy || { goods: [], routes: [], orders: [] };
    draft.economy.goods.push({
      place: '黑石关',
      resource: '铁矿',
      base: 20,
      stock: 4, // 远低于安全库存 20
      price: 20,
      demand: 15,
      consumed: 0,
      tickedAt: ''
    });
    draft.economy.goods.push({
      place: '南川府',
      resource: '铁矿',
      base: 15,
      stock: 120,
      price: 15,
      demand: 10,
      consumed: 0,
      tickedAt: ''
    });

    return true;
  }, 'setup:border-world');

  // 登记地理节点与道路
  W.world.addPlace('南川府');
  W.world.addPlace('落雁峡');
  W.world.addPlace('黑石关');
  W.world.addRoad('南川府', '落雁峡', 120);
  W.world.addRoad('落雁峡', '黑石关', 180);

  a.ok(true, '宏观地理拓扑与边境要塞初始化完成');

  // ── 2. 险道自然通达度评估与季节性天堑阻断 ──
  // 评估通行阻力
  const passCheck = W.actionDesk.plan('terrainHazard.assessPassability', {
    from: '落雁峡',
    to: '黑石关',
    season: 'winter',
    terrainType: 'canyon'
  });
  a.ok(passCheck.ok, '通达度阻力成功评估');
  a.equal(passCheck.status, 'hazardous', '寒冬峡谷被判定为高危通行状态');
  a.ok(passCheck.traversabilityFactor >= 2.0, '通行阻力翻倍');

  // 极端暴雪来袭，彻底封死落雁峡~黑石关通道
  const blockRes = W.actionDesk.plan('terrainHazard.blockChannel', {
    from: '落雁峡',
    to: '黑石关',
    reason: '千年极寒暴风雪引发雪崩封堵落雁天堑',
    difficulty: 75
  });
  a.ok(blockRes.ok, '险道天堑阻断标记成功');
  a.equal(blockRes.status, 'blocked', '通道状态置为 blocked');
  a.equal(blockRes.difficulty, 75, '强渡体能难度定为 75');

  // 再次评估确认官方通道不可通行
  const blockedCheck = W.actionDesk.plan('terrainHazard.assessPassability', {
    from: '落雁峡',
    to: '黑石关'
  });
  a.equal(blockedCheck.status, 'blocked', '天堑已完全处于阻绝状态');
  a.equal(blockedCheck.canPassNormally, false, '常规行军与货运已无法通过');

  // ── 3. 跨区域通胀爆发与黑市高危走私 ──
  // 黑石关铁矿极度短缺，评估物价敏感曲线
  const inflation = W.actionDesk.plan('contraband.assessInflation', {
    place: '黑石关',
    resource: '铁矿',
    safetyStock: 20
  });
  a.ok(inflation.ok, '区域物价敏感曲线成功评估');
  a.equal(inflation.shortageSeverity, 'critical_scarcity', '库存低于安全线，触发极度匮乏警报');
  a.ok(inflation.inflationFactor >= 3.0, '官方物价指数阶梯暴涨达到 300% 以上');
  a.ok(inflation.recommendContraband, '系统因严重匮乏生成走私建议');

  // 黑市行商建立高风险暴利走私线
  const openContra = W.actionDesk.plan('contraband.openRoute', {
    id: 'contra_iron_pass',
    from: '南川府',
    to: '黑石关',
    resource: '铁矿',
    riskRate: 30, // 30% 巡防截获率
    profitMargin: 3.5, // 350% 暴利
    blackMarketPrice: 70
  });
  a.ok(openContra.ok, '地下黑市走私通道开辟成功');
  a.equal(openContra.blackMarketPrice, 70, '黑市单价高达 70');

  // 行商老刀实施首轮走私运输（规避判定掷骰 80 > 30，成功突破）
  const smuggle1 = W.actionDesk.plan('contraband.smuggle', {
    routeId: 'contra_iron_pass',
    smuggler: 'p_smuggler',
    qty: 20,
    evasionRoll: 80
  });
  a.ok(smuggle1.ok, '走私规避检定成功');
  a.equal(smuggle1.status, 'success', '货物成功潜渡黑石关');
  a.equal(smuggle1.deliveredQty, 20, '20 单位铁矿顺利入关');
  a.equal(smuggle1.revenue, 1400, '获得 1400 暴利回报');

  // 行商老刀贪心再次发运，遭遇巡防严打查扣（规避掷骰 15 <= 30，被当场截获！）
  const smuggle2 = W.actionDesk.plan('contraband.smuggle', {
    routeId: 'contra_iron_pass',
    smuggler: 'p_smuggler',
    qty: 20,
    evasionRoll: 15
  });
  a.ok(smuggle2.ok, '巡防查扣拦截成功');
  a.equal(smuggle2.status, 'busted', '走私货物遭边防查扣');
  a.equal(smuggle2.confiscatedQty, 20, '20 单位物资全部没收');
  a.ok(smuggle2.penalty >= 2000, '处以 150% 巨额罚款');

  // 查阅边防查扣台账
  const bustLog = W.actionDesk.plan('contraband.inspectBust', {
    routeId: 'contra_iron_pass'
  });
  a.ok(bustLog.ok, '巡防查扣台账查阅成功');
  a.equal(bustLog.bustCount, 1, '准确记录 1 次查扣事件');

  // 查验走私者档案中是否沉淀刑事污点
  const smugglerRecord = W.store.get().people['p_smuggler'];
  a.ok(smugglerRecord.life.commitments.some(function (c) {
    return c.type === 'criminal_record' && c.felony === 'smuggling_contraband';
  }), '走私前科与信用破产已永久沉淀在人物档案！');

  // ── 4. 边境意外事故引发跨城传闻地理漂移与失真异化 ──
  // 南川府初始事实：南川府军营兵库盘点发生账实不符与私售纠纷
  const driftHop1 = W.actionDesk.plan('rumor.driftRelay', {
    rumorId: 'rumor_border_crisis_001',
    fromPlace: '南川府',
    toPlace: '落雁峡',
    transitDays: 2,
    initialFact: '南川府军营私售铁器遭纠察，守军调集小队整肃',
    localBias: 'bazaar_exaggeration'
  });
  a.ok(driftHop1.ok, '流言第一跳跨驿站转述完成');
  a.equal(driftHop1.hopCount, 1, '第 1 跳中继');
  a.ok(driftHop1.fidelity < 1.0, '真实细节因距离与中继开始衰减');

  // 从落雁峡传向边防前线黑石关（天堑阻隔导致信息闭塞，地方偏见为极度疑惧与边防戒备）
  const driftHop2 = W.actionDesk.plan('rumor.driftRelay', {
    rumorId: 'rumor_border_crisis_001',
    fromPlace: '落雁峡',
    toPlace: '黑石关',
    transitDays: 4,
    localBias: 'militarist_paranoia'
  });
  a.ok(driftHop2.ok, '流言第二跳传入黑石关要塞');
  a.equal(driftHop2.hopCount, 2, '第 2 跳中继');
  a.ok(driftHop2.fidelity < 0.35, '信息置信度严重跌落');
  a.equal(driftHop2.threatLevel, 'lethal_alert', '在疑惧偏见下已异化为最高级别致命战备危机！');
  a.ok(driftHop2.currentText.includes('全面开战越界突袭'), '流言演变为敌军全面开战');

  // 黑石关守军勘验情报档案
  const driftReport = W.actionDesk.plan('rumor.inspectDrift', {
    rumorId: 'rumor_border_crisis_001'
  });
  a.ok(driftReport.ok, '流言演化全链条档案查阅成功');
  a.equal(driftReport.totalHops, 2, '记录了 2 次跨地域漂移');
  a.equal(driftReport.threatLevel, 'lethal_alert', '前线守军定性为战争动员状态');

  // ── 5. 巡察使冒死强渡天堑出示铁证止战 ──
  // 巡察使云飞在落雁峡面临阻断，决定强行翻越暴雪悬崖（forceTraverse）
  // 检定投骰 85 >= 75，奇迹翻越但付出惨痛体能代价
  const traverseRes = W.actionDesk.plan('terrainHazard.forceTraverse', {
    who: 'p_scout',
    from: '落雁峡',
    to: '黑石关',
    roll: 85
  });
  a.ok(traverseRes.ok, '强行翻越天堑检定完成');
  a.equal(traverseRes.status, 'success', '巡察使成功突入黑石关');
  a.ok(traverseRes.staminaCost >= 30, '翻越消耗大量体能');

  const scoutAfter = W.store.get().people['p_scout'];
  a.equal(scoutAfter.location, '黑石关', '角色位置真实物理变更至黑石关');
  a.ok(scoutAfter.resources.stamina < 60, '体力真实扣减，处于剧烈疲劳状态');
  a.ok(scoutAfter.stress > 20, '心理应激上升');

  // 巡察使抵关后出示南川府查处公文，对异化流言进行权威辟谣（rumor.refuteDrift）
  const refuteRes = W.actionDesk.plan('rumor.refuteDrift', {
    rumorId: 'rumor_border_crisis_001',
    by: 'p_scout',
    reason: '南川府仅为军需私贩整肃，绝无调兵侵界意图，特此出示铁证！'
  });
  a.ok(refuteRes.ok, '官方辟谣核验成功');
  a.equal(refuteRes.refuted, true, '流言链条被权威辟谣彻底压制');

  // 解除边境险道封锁，边防警报解除
  const unblockRes = W.actionDesk.plan('terrainHazard.unblockChannel', {
    from: '落雁峡',
    to: '黑石关'
  });
  a.ok(unblockRes.ok, '天堑阻断成功解除');
  a.equal(unblockRes.status, 'open', '通道恢复通行');

  // 最终闭环校验：行动桌全生命周期调度统计
  const diag = W.actionDesk.diagnose();
  a.ok(diag.ok, '中央行动桌运行健康');
  a.ok(diag.stat.planned >= 10, '完成了 10+ 次关键链路业务调度');

  return true;
}

if (require.main === module) {
  let passed = 0, failed = 0;
  const mockAssert = {
    ok: function (cond, msg) {
      if (cond) { passed++; console.log('  ✓ ' + msg); }
      else { failed++; console.error('  ✗ ' + msg); }
    },
    equal: function (actual, expected, msg) {
      if (actual === expected) { passed++; console.log('  ✓ ' + msg); }
      else { failed++; console.error('  ✗ ' + msg + ' (expect: ' + expected + ', got: ' + actual + ')'); }
    }
  };
  console.log('=== 开始执行 V13 场景 8 专锁测试：边境流言引爆战端（地理因果与传闻漂移）===');
  try {
    runScenario(mockAssert);
    console.log('\n=== 场景 8 专锁测试执行完毕：通过 ' + passed + ' 项断言，失败 ' + failed + ' 项 ===');
    process.exitCode = failed === 0 ? 0 : 1;
  } catch (err) {
    console.error('场景 8 专锁执行抛出异常:', err);
    process.exitCode = 1;
  }
}

module.exports = { runScenario: runScenario };