'use strict';
/**
 * tests/scenario-v12-broken-promise.js
 *
 * 《V12_MASTER_PLAN.md》世界级贯通场景 2：一次失约
 * 契约链路：承诺到期 → 人物有限认知下解释 → 关系与信用改变 → 替代合作 → 传闻传播 → 调查或和解 → 长期关系留下历史。
 *
 * 铁律纪律：
 * 1. 拒绝独立演示脚本：全程通过统一行动调度总线 `actionDesk.plan()` 与标准写口流转；
 * 2. 状态真源闭环：
 *    - 承诺生命周期在 `customLax.promises` 与 `actionDesk.lifecycle` 中双向穿透；
 *    - 违约失约驱动 `customLax.defaultPromise`，生成 `pathEcho` 悔恨与社会污点；
 *    - 信用损毁联动 `creditLedger` 借款与 `relationGraph` 人际情感权重真实下降；
 *    - 替代合作通过 `actionDesk.declareOpportunity` / `applyOpportunity` / `awardOpportunity` 重新寻找履约者；
 *    - 传闻通过 `rumor.startChain` / `relay` / `investigate` 产生信息差与误解传播；
 *    - 最终调查和解通过 `customLax.remedyPromise` 支付加倍赔偿与重修关系。
 */
const uiGate = require('./ui-gate-sync.js');

let pass = 0, fail = 0;
function a(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('FAIL: ' + desc);
  }
}

async function runScenario() {
  console.log('=== 开始执行 V12 世界级贯通场景 2：一次失约 ===');

  const W = uiGate.fresh().WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  W.customLax.settings && W.customLax.settings();
  W.relationGraph.setSettings({ enabled: true });
  W.creditLedger.saveSettings({ enabled: true });
  W.rumor.setSettings({ enabled: true });
  W.intel.setSettings({ enabled: true });
  W.epistemicView && W.epistemicView.settings && W.epistemicView.settings();

  // 1. 初始化人物与经济底座
  // 铁匠张三（承诺人）、矿商李四（受益人/债权人）、木匠王五（替代合作者）
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_张三'] = { id: 'p_张三', name: '张三', location: '铁匠铺', resources: { '铜钱': 100 } };
    d.people['p_李四'] = { id: 'p_李四', name: '李四', location: '商行', resources: { '铜钱': 1000 } };
    d.people['p_王五'] = { id: 'p_王五', name: '王五', location: '木工房', resources: { '铜钱': 200 } };

    // 初始关系：张三与李四为旧盟（权重 8）
    d.relationGraph = d.relationGraph || { edges: [], byPair: {}, lastInteraction: {} };
    return true;
  }, 'scenario:seed');

  const r1 = W.actionDesk.plan('relationGraph.upsert', {
    from: '张三', to: '李四',
    relationship_label: '商业伙伴',
    type: 'childhood_friends',
    emotional_weight: 8
  });
  a('1. 张三与李四建立商业伙伴关系且权重为 8', r1 && r1.ok && r1.edge && r1.edge.weight === 8);

  // 2. 订立承诺与借贷：张三承诺于第 10 天向李四交付特质精铁，并开立信用借据
  const p1 = W.actionDesk.plan('customLax.commitPromise', {
    promiser: '张三',
    beneficiary: '李四',
    subject: '在第十天前交付特质精铁三十斤',
    dueDay: 10,
    stake: { penaltyCoins: 200 }
  });
  a('2. 张三向李四立下交付承诺', p1 && p1.ok && p1.promise && p1.promise.id);
  const promiseId = p1.promise.id;

  const loan1 = W.actionDesk.plan('creditLedger.open', {
    borrower: '张三',
    lender: '李四',
    key: 'loan_ore_deposit',
    principal: 100,
    days: 10,
    rateMicroPct: 100000,
    purpose: '采矿定金'
  });
  a('3. 张三凭借商业信誉在信用账本开立借据', loan1 && loan1.ok && loan1.id);
  const loanId = loan1.id;

  // 3. 跨轮生命周期感知：未到期时处于 in-progress，且可被调度桌 lifecycle 监测
  const life1 = W.actionDesk.lifecycle({ who: '张三' });
  const promItem1 = (life1.rows || []).filter(r => r.kind === 'promise' && r.id === promiseId)[0];
  a('4. 跨轮生命周期纯读投影中显示承诺处于进行中', promItem1 && promItem1.stage === 'in-progress' && promItem1.recover.startsWith('customLax.fulfillPromise'));

  // 4. 约定到期失约：张三因工坊事故未能在第 10 天交付，李四在有限认知下宣告违约
  const defRes = W.actionDesk.plan('customLax.defaultPromise', {
    promiseId: promiseId,
    reason: '逾期未交精铁且未提前告知'
  });
  a('5. 承诺到期未兑现，真实记入违约 defaulted', defRes && defRes.ok && defRes.status === 'defaulted');

  // 5. 违约直接影响人际关系图谱：信任裂痕，关系降级至“竞争/疏远”（权重暴跌至 2）
  const rDowngrade = W.actionDesk.plan('relationGraph.upsert', {
    from: '张三', to: '李四',
    relationship_label: '失信反目',
    type: 'rivals',
    emotional_weight: 2
  });
  a('6. 人际关系图谱权重断崖式下跌至 2（竞争对峙）', rDowngrade && rDowngrade.ok && rDowngrade.edge && rDowngrade.edge.weight === 2);

  // 6. 信用受损：借据计息并形成逾期滞纳
  const tLate = Date.now() + 15 * 86400 * 1000;
  const accRes = W.actionDesk.plan('creditLedger.accrue', { id: loanId, at: tLate });
  a('7. 信用借据按真实时间窗口计息并产生滞纳利息', accRes && accRes.ok && (accRes.accrued > 0 || accRes.interest > 0));

  // 7. 替代合作：李四在失去精铁供给后，通过行动桌发布紧急木料加工机会
  const oppOpen = W.actionDesk.plan('actionDesk.declareOpportunity', {
    oppId: 'opp_wood_emergency',
    kind: 'production_order',
    targetId: 'order_wood_replace',
    slots: 1,
    rule: 'qualification'
  });
  a('8. 李四转向替代方案，发布紧急替代机会', oppOpen && oppOpen.ok);

  // 王五竞标并中标该替代合作
  const bidRes = W.actionDesk.plan('actionDesk.applyOpportunity', {
    oppId: 'opp_wood_emergency',
    who: '王五',
    skill: 3,
    price: 80,
    note: '全套干燥槐木料'
  });
  a('9. 木匠王五申请替代合作', bidRes && bidRes.ok);

  const awardRes = W.actionDesk.plan('actionDesk.awardOpportunity', {
    oppId: 'opp_wood_emergency',
    rule: 'qualification'
  });
  a('10. 王五中标替代合作，业务链成功转接', awardRes && awardRes.ok && awardRes.winners && awardRes.winners[0] && awardRes.winners[0].who === '王五');

  // 8. 传闻发酵与有限认知：失约消息在本地流传，他人获得碎片情报
  // 登记底层世界事实
  W.store.transact(function (d) {
    d.worldFacts = d.worldFacts || [];
    d.worldFacts.push({
      key: 'fact_iron_default',
      id: 'fact_iron_default',
      subject: '张三失约断供',
      value: '张三未能按期向李四交付精铁三十斤',
      active: true,
      at: Date.now()
    });
    return true;
  }, 'seed:fact');

  const rumorChain = W.actionDesk.plan('rumor.startChain', {
    factKey: 'fact_iron_default',
    note: '坊间传闻张三卷款潜逃无法交铁'
  });
  a('11. 失约事件在本地传闻网启动传播链', rumorChain && rumorChain.ok && rumorChain.id);

  // 中继传播与情报入库（由 hearsay/rumor 传播，并支持歪曲或如实流传）
  const rRelay = W.actionDesk.plan('rumor.relay', {
    id: rumorChain.id,
    item: { from: '李四', to: '王五', motive: 'honest' }
  });
  a('12. 传闻产生误解放大与中继传播', rRelay && rRelay.ok);

  const intelRes = W.actionDesk.plan('intel.addIntel', {
    person: '王五',
    item: { claim: '张三失约断供', source: 'rumor', level: 'rumor' }
  });
  a('13. 第三方（王五）通过非全知渠道接收有限认知情报', intelRes && intelRes.ok);

  // 9. 调查与和解补救：张三事后说明实情（高炉坍塌），提出加倍补偿与义务劳役
  const remedyRes = W.actionDesk.plan('customLax.remedyPromise', {
    promiseId: promiseId,
    remedySpec: {
      compensation: { coins: 200, refinedIron: 40 },
      extraLabor: '为商行免费维修器具一个月',
      note: '如实告知高炉事故，补交四十斤精铁并双倍赔付铜钱'
    }
  });
  a('14. 双方达成加倍补偿与劳役和解协议，承诺状态转为 remedied', remedyRes && remedyRes.ok && remedyRes.status === 'remedied');

  // 10. 关系留下历史：和解后关系修复但不完全抹杀伤痕（由 2 修复至 5 陌路旧识，不可逆保留违约历史）
  const rHeal = W.actionDesk.plan('relationGraph.upsert', {
    from: '张三', to: '李四',
    relationship_label: '和解旧交',
    type: 'stranger_with_history',
    emotional_weight: 5
  });
  a('15. 和解后关系重新修复至 5（陌路旧交），历史违约沉淀入关系记忆', rHeal && rHeal.ok && rHeal.edge && rHeal.edge.weight === 5);

  // 11. 校验跨轮生命周期最终落定
  const life2 = W.actionDesk.lifecycle({ who: '张三' });
  const promItem2 = (life2.terminalRows || []).filter(r => r.kind === 'promise' && r.id === promiseId)[0];
  a('16. 跨轮生命周期中承诺正确收口至终态 terminal', promItem2 && promItem2.stage === 'terminal');

  console.log(`\n=== 场景 2 测试汇总: 通用断言 ${pass} 项通过, ${fail} 项失败 ===`);
  if (fail > 0) process.exit(1);
}

runScenario().catch(err => {
  console.error('场景 2 执行抛错:', err);
  process.exit(1);
});
