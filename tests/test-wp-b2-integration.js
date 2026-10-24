'use strict';
// WorldAxis tests/test-wp-b2-integration.js
// 验证 B 包第 2 阶段深度切片：
// WP-8 真实物理场景与局部知情隔离 + WX-3 有边界的人情互惠与有限担保链 + WX-4 可引用/可区分的社会先例与规则演化

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
    const chars = [
      { name: '大师傅', status: 'active', funds: 200, loc: '青石桥工坊' },
      { name: '青年学徒', status: 'active', funds: 40, loc: '青石桥工坊' },
      { name: '驻站行商', status: 'traveling', funds: 300, loc: '荒野边境' },
      { name: '边境守林人', status: 'active', funds: 90, loc: '荒野营地' }
    ];
    chars.forEach(function (c) {
      d.people['p_' + c.name] = {
        id: 'p_' + c.name,
        name: c.name,
        location: c.loc,
        status: c.status,
        resources: { funds: c.funds },
        life: {}
      };
    });

    d.region = d.region || {};
    d.region.currentPlace = '青石桥工坊';
    d.region.places = [
      { id: 'town_workshop', name: '青石桥工坊' },
      { id: 'frontier_camp', name: '荒野营地' }
    ];
    d.world = d.world || {};
    d.world.places = [
      { id: 'town_workshop', name: '青石桥工坊' },
      { id: 'frontier_camp', name: '荒野营地' }
    ];

    return true;
  }, 'seed:b2');

  return W;
}

console.log('=== 开始 B 包第 2 阶段深度集成验证 (test-wp-b2-integration) ===');

// ── 1. WP-8: 场景可知叙事（真实在场过滤与物理因果追溯） ───────────
test('WP-8: 真实物理地点过滤在场人，途中人员绝不在场，跨引擎真实因果链追溯', function () {
  const W = createTestEnv();

  // 1. 青石桥工坊场景：在场人只有大师傅与青年学徒；驻站行商（traveling）与边境守林人（荒野营地）不在场
  const sc1 = W.actionDesk.plan('sceneNarrative.currentScene', {
    place: '青石桥工坊'
  });
  assert.equal(sc1.ok, true);
  assert(sc1.present.includes('大师傅'), '大师傅应在工坊现场');
  assert(sc1.present.includes('青年学徒'), '学徒应在工坊现场');
  assert(!sc1.present.includes('驻站行商'), '途中旅行人员绝不出现在场列表');
  assert(!sc1.present.includes('边境守林人'), '远在荒野营地的人员不出现在城镇工坊现场');

  // 2. 荒野营地场景：只有边境守林人在场
  const sc2 = W.actionDesk.plan('sceneNarrative.currentScene', {
    place: '荒野营地'
  });
  assert.equal(sc2.ok, true);
  assert(sc2.present.includes('边境守林人'), '守林人应在荒野营地现场');
  assert(!sc2.present.includes('大师傅'), '城镇工匠不在荒野营地现场');

  // 3. 建立设施并在产发生损耗
  W.serviceNetwork.declareFacility({
    name: '公共锻造台',
    placeId: 'town_workshop',
    serviceType: 'crafting',
    capacity: 2
  });
  const fac = (W.store.get().serviceNetwork.facilities || [])[0];
  W.serviceNetwork.activateFacility(fac.id);
  W.serviceNetwork.decayFacility(fac.id);

  // 4. 追溯已发生设施事件的因果链（通过设施 ID 追踪真实因果）
  const trRes = W.actionDesk.plan('sceneNarrative.traceFrom', {
    seed: fac.id
  });
  assert.equal(trRes.ok, true);
  assert(trRes.count >= 1, '应追溯到设施损坏因果记录');
  const facNode = trRes.traces.find(function (t) { return t.source === 'serviceNetwork'; });
  assert(facNode, '因果追溯应标明 serviceNetwork 实体来源');
  assert.equal(facNode.stage, 'degraded');
  assert.equal(facNode.immediate, '服务降级容量折半');
});

// ── 2. WP-8: 局部知情保护（远方未知事件不泄露，消息送达后合法感知） ──
test('WP-8: 远方场外消息对未送达者严格隔离，送达信箱后进入该角色视界', function () {
  const W = createTestEnv();

  // 模拟远方荒野发生了一起严重的突发事故，记入 chronicle horizon
  W.store.transact(function (d) {
    d.chronicle = d.chronicle || [];
    d.chronicle.push({
      id: 'chr_frontier_cave_in',
      horizon: true,
      visibility: 'visible',
      title: '荒野矿脉塌方',
      summary: '远方西山矿脉发生塌方，运输道路受阻',
      at: 120,
      recipients: [] // 初始没有任何收信人，尚未派信使传讯
    });
    return true;
  });

  // 1. 城镇大师傅读取场外感知视界 -> 严格保护，不得泄露远方秘密
  const phBefore = W.actionDesk.plan('sceneNarrative.perceivedHorizon', {
    who: '大师傅'
  });
  assert.equal(phBefore.ok, true);
  const leakedEvent = (phBefore.horizonEvents || []).find(function (e) { return e.ref === 'chr_frontier_cave_in'; });
  assert(!leakedEvent, '未收到传讯前，远方场外事故严禁进入角色视界');

  // 2. 作者/全知视角可以俯瞰全景
  const phAuthor = W.sceneNarrative.perceivedHorizon('大师傅', { allKnowing: true });
  assert.equal(phAuthor.ok, true);
  const authorSeen = (phAuthor.horizonEvents || []).find(function (e) { return e.ref === 'chr_frontier_cave_in'; });
  assert(authorSeen, '作者全知模式下应能看见全量远方事件');

  // 3. 信使将事故快报送达大师傅的个人收件箱（inbox）
  W.store.transact(function (d) {
    d.people['p_大师傅'].inbox = [
      { id: 'msg_01', ref: 'chr_frontier_cave_in', topic: 'chr_frontier_cave_in', text: '行商带来西山矿脉塌方消息' }
    ];
    return true;
  });

  // 4. 消息送达后，大师傅再次观察场外感知 -> 合法感知该事件
  const phAfter = W.actionDesk.plan('sceneNarrative.perceivedHorizon', {
    who: '大师傅'
  });
  assert.equal(phAfter.ok, true);
  const legallySeen = (phAfter.horizonEvents || []).find(function (e) { return e.ref === 'chr_frontier_cave_in'; });
  assert(legallySeen, '经由信使送达后，场外变化合法进入当前角色视界');
  assert.equal(legallySeen.title, '荒野矿脉塌方');
});

// ── 3. WX-3: 有边界的人情、互惠权衡与有限担保链 ─────────────────
test('WX-3: 互惠事实改变求助条件，繁忙正当拒助，有限担保严守责任上限', function () {
  const W = createTestEnv();

  // 1. 登记前序人情事实：学徒曾替大师傅值守工坊
  const favorRes = W.actionDesk.plan('customLax.recordFavor', {
    fromWho: '青年学徒',
    toWho: '大师傅',
    task: '代班值守工坊',
    expectation: true,
    details: '学徒曾自愿代班让师傅处理家事'
  });
  assert.equal(favorRes.ok, true);
  const favorId = favorRes.favor.id;

  // 2. 求助场景 A：向正在外出的远行商贩求助现场劳动 -> 正当拒绝（不记过）
  const aidTraveling = W.actionDesk.plan('customLax.requestAid', {
    who: '青年学徒',
    targetWho: '驻站行商',
    need: { kind: 'labor', amount: 1 }
  });
  assert.equal(aidTraveling.ok, true);
  assert.equal(aidTraveling.outcome, 'refused');
  assert.equal(aidTraveling.reason, 'target-traveling', '在途人员无法分身提供现场帮助');

  // 3. 求助场景 B：向排班已满但无前序人情的陌生人求助
  // 先将边境守林人上午时段排班占满
  W.laborSchedule.claim({
    who: '边境守林人',
    day: 1,
    slot: 'morning',
    task: '巡林'
  });
  const aidBusyNoFavor = W.actionDesk.plan('customLax.requestAid', {
    who: '青年学徒',
    targetWho: '边境守林人',
    need: { kind: 'labor', amount: 1, day: 1, slot: 'morning' }
  });
  assert.equal(aidBusyNoFavor.ok, true);
  assert.equal(aidBusyNoFavor.outcome, 'refused');
  assert.equal(aidBusyNoFavor.reason, 'schedule-busy', '日程繁忙且无人情，正当拒绝且不扣好感');

  // 4. 求助场景 C：向日程繁忙的大师傅求助 2 单位工时，因大师傅欠学徒前序人情
  W.laborSchedule.claim({
    who: '大师傅',
    day: 1,
    slot: 'morning',
    task: '锻造'
  });
  const aidWithFavor = W.actionDesk.plan('customLax.requestAid', {
    who: '青年学徒',
    targetWho: '大师傅',
    need: { kind: 'labor', amount: 2, day: 1, slot: 'morning' }
  });
  assert.equal(aidWithFavor.ok, true);
  assert.equal(aidWithFavor.outcome, 'scaled_down', '因有人情在身，即使繁忙仍协商缩量协助');
  assert.equal(aidWithFavor.offeredAmount, 1, '协商减半提供 1 单位协助');
  assert.equal(aidWithFavor.favorReferenced, favorId);

  // 5. 有限第三方连带担保（严守责任上限，杜绝无限债务）
  // 大师傅为学徒借用贵重仪器提供连带担保，最高承担 40 funds 责任上限
  const guaRes = W.actionDesk.plan('customLax.provideGuarantee', {
    guarantor: '大师傅',
    debtor: '青年学徒',
    creditor: '城镇行会',
    maxLiability: 40,
    terms: '仪器损坏有限赔付'
  });
  assert.equal(guaRes.ok, true);
  const guaId = guaRes.guarantee.id;

  // 债务人操作失误导致造成 70 funds 实际损失，行会主张追索
  const claimRes = W.actionDesk.plan('customLax.claimGuarantee', {
    guaranteeId: guaId,
    breachAmount: 70
  });
  assert.equal(claimRes.ok, true);
  assert.equal(claimRes.claimed, 40, '担保赔付严格截断在 40 funds 承诺上限');
  assert.equal(claimRes.unrecoverable, 30, '超出上限的 30 funds 差额依法自担，不凭空追索');
  assert.equal(claimRes.liabilityCapped, true);

  // 6. 人情违约失信记录
  const settleRes = W.actionDesk.plan('customLax.settleFavor', {
    favorId: favorId,
    outcome: 'breached'
  });
  assert.equal(settleRes.ok, true);
  const apprentice = W.store.get().people['p_大师傅']; // toWho 的失信记入
  assert(apprentice.life && apprentice.life.brokenTrust >= 1, '违约必须如实生成失信记录');
});

// ── 4. WX-4: 可引用、可区分的社会先例与规则演化 ─────────────────
test('WX-4: 确立地方先例，关键情境失配拒绝套用，条件吻合建议沿用并升格规则', function () {
  const W = createTestEnv();

  // 1. 确立青石桥工坊的紧急维修优先先例
  const precRes = W.actionDesk.plan('customLax.establishPrecedent', {
    title: '工坊紧急抢修优先工位先例',
    orgId: 'craft_guild',
    placeId: 'town_workshop',
    sourceCaseId: 'dispute_repair_01',
    conditions: {
      urgency: 'critical',
      taskType: 'repair'
    },
    ruling: '遇设施损毁严重且危及生产时，允许抢修人员优先调拨工位免排队',
    by: '大师傅'
  });
  assert.equal(precRes.ok, true);
  const precId = precRes.precedent.id;

  // 2. 争议场景 A：常规生产工单试图援引先例抢占工位 -> 关键情境失配，拒绝机械套用！
  const evalMismatched = W.actionDesk.plan('customLax.evaluatePrecedent', {
    precedentId: precId,
    caseFacts: {
      placeId: 'town_workshop',
      urgency: 'normal', // 实质区别：非紧急
      taskType: 'production' // 实质区别：非维修
    }
  });
  assert.equal(evalMismatched.ok, true);
  assert.equal(evalMismatched.applicable, false, '情境不符绝不机械套用');
  assert(evalMismatched.distinction.startsWith('condition-mismatch'), '精准指出条件差异');

  // 3. 争议场景 B：外地（荒野营地）试图援引该地方先例 -> 地域不符拦截！
  const evalPlaceMismatch = W.actionDesk.plan('customLax.evaluatePrecedent', {
    precedentId: precId,
    caseFacts: {
      placeId: 'frontier_camp', // 实质区别：地方先例不跨地域无声扩大
      urgency: 'critical',
      taskType: 'repair'
    }
  });
  assert.equal(evalPlaceMismatch.ok, true);
  assert.equal(evalPlaceMismatch.applicable, false);
  assert.equal(evalPlaceMismatch.distinction, 'place-mismatch');

  // 4. 争议场景 C：青石桥水渠发生紧急损毁抢修 -> 条件与地域完全吻合！
  const evalMatched = W.actionDesk.plan('customLax.evaluatePrecedent', {
    precedentId: precId,
    caseFacts: {
      placeId: 'town_workshop',
      urgency: 'critical',
      taskType: 'repair'
    }
  });
  assert.equal(evalMatched.ok, true);
  assert.equal(evalMatched.applicable, true, '条件吻合，建议沿用先例');
  assert.equal(evalMatched.recommendation, '遇设施损毁严重且危及生产时，允许抢修人员优先调拨工位免排队');

  // 5. 权限人采纳先例，升格为正式规则
  const ruleRes = W.actionDesk.plan('customLax.adoptRuleFromPrecedent', {
    precedentId: precId,
    by: '大师傅',
    ruleType: 'slot-booking'
  });
  assert.equal(ruleRes.ok, true);
  assert.equal(ruleRes.rule.status, 'active');
  assert.equal(ruleRes.rule.sourcePrecedentId, precId);

  // 验证规则已进入 customLax.rules 真源
  const rules = W.store.get().customLax.rules;
  assert(rules.some(function (r) { return r.sourcePrecedentId === precId; }), '规则真源应包含该先例规则');
});

// ── 5. 跨机制联动与跨会话序列化重载 ───────────────────────────
test('跨会话重载持久化：人情账簿、有限担保单、社会先例与新规则完整恢复', function () {
  const W = createTestEnv();

  // 注入数据
  W.customLax.recordFavor({
    fromWho: '大师傅',
    toWho: '青年学徒',
    task: '传授图纸工艺',
    scope: 'tech'
  });
  W.customLax.provideGuarantee({
    guarantor: '边境守林人',
    debtor: '驻站行商',
    creditor: '城镇行会',
    maxLiability: 50
  });
  W.customLax.establishPrecedent({
    title: '集市摊位轮转先例',
    orgId: 'market_union',
    placeId: 'town_workshop',
    conditions: { tradeVolume: 'high' },
    ruling: '人流高峰期每三日轮换一次主要摊位',
    by: '大师傅'
  });

  // 模拟序列化与全新实例重载
  const raw = JSON.stringify(W.store.get());
  const W2 = fresh().WA;
  W2.store.init();
  W2.actionDesk.setSettings({ enabled: true });
  W2.store.restore(JSON.parse(raw));

  const s2 = W2.store.get().customLax;
  assert.equal(s2.favors.length, 1, '人情记录完整');
  assert.equal(s2.guarantees.length, 1, '担保单完整');
  assert.equal(s2.precedents.length, 1, '先例记录完整');

  // 重载后继续调用业务方法
  const prec = s2.precedents[0];
  const evalRes = W2.customLax.evaluatePrecedent(prec.id, {
    placeId: 'town_workshop',
    tradeVolume: 'high'
  });
  assert.equal(evalRes.ok, true);
  assert.equal(evalRes.applicable, true, '重载后先例比对机制完好运行');
});

console.log('----------------------------------------------------');
console.log('WP-B2 整合门禁套件运行结果: ' + passCount + ' 通过 / ' + failCount + ' 失败');
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('WP-B2 5/5 全部用例断言通过！');
}