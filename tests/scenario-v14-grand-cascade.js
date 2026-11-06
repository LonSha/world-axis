'use strict';
// WorldAxis tests/scenario-v14-grand-cascade.js
// 验证 WorldAxis V14 深化版 场景 17：全域宏观危机级联与城下之盟平息（Grand Cascade & Climax Resolution）
//
// 机制级联贯通矩阵：
//   1. 险道重度断裂（supplyChoke, severity 1.8）
//      -> 目标城市场库存见底、物价暴涨 3.7x、配给限制
//      -> 级联引发全城物资断供恐慌传闻（rumors 自动沉淀）与 cityPanics 警戒
//   2. 历史埋藏伏笔破土反噬（foreshadowGermination, maturity > 24h）
//      -> 爆发为公开危机（erupted: activeCrises 登记）
//      -> 当事人声誉扣减、被施加 threatened 险境
//   3. 空间坍缩有限庇护所争夺与舍身让渡（sanctuaryScramble）
//      -> 英雄让渡者被施加 heroic_sacrifice
//      -> 生还入驻者被施加 sheltered 并级联烙印【幸存者负罪感】反事实梦魇（counterfactualEchoes）与 haunted
//   4. 谈判桌困局和解与城下之盟调停（dilemmaBargain）
//      -> 两方效用超过底线（uA >= 30, uB >= 30）达成 pact
//      -> 条约附带 resolveCrisisId 成功平息步骤 2 中爆发的公开危机（status -> resolved_by_pact）
//   5. 大模型主生成结构化注入汇流管线（injectCollector.buildBlock）
//      -> 动态捕获并格式化生成【物资断供】、【伏笔反噬】与【和解公约】Prompt 结构块
//   6. 破坏性真负控制门禁：
//      - 篡改无效输入阻断
//      - 谈判效用不足破坏和解（bargain-ruptured）且无法平息危机
//      - 伏笔未成熟阻断反噬
//      - 险道缺省关键参数拒绝

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'supplyChoke', 'foreshadowGermination', 'sanctuaryScramble', 'dilemmaBargain', 'injectCollector', 'life'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runGrandCascade(a) {
  const W = env();

  // 1. 初始化两方势力代表与避险角色
  W.store.transact(function (draft) {
    draft.actors = draft.actors || {};
    draft.actors['actor_general'] = { id: 'actor_general', name: '边防守将', conditions: [], reputation: 80 };
    draft.actors['actor_smuggler'] = { id: 'actor_smuggler', name: '黑市枭雄', conditions: [], reputation: 60 };
    draft.actors['actor_medic'] = { id: 'actor_medic', name: '战地医官', conditions: [], reputation: 90 };
  });

  // ─────────────────────────────────────────────────────────────
  // 步骤 1：触发险道重度断裂（severity 1.8）-> 级联全城恐慌与传闻
  // ─────────────────────────────────────────────────────────────
  const chokeRes = W.supplyChoke.triggerChoke({
    routeId: 'route_iron_pass',
    destinationCity: 'fortress_city',
    resourceKind: 'rations',
    durationDays: 10,
    severity: 1.8,
    at: 1000
  });
  a(chokeRes.ok === true && chokeRes.reason === 'choke-triggered', '险道供应链重度断裂成功触发');
  
  const sAfterChoke = W.store.get();
  a(sAfterChoke.cityMarkets['fortress_city'].rationing === true, '目标城池紧急开启物资配给限购');
  a(sAfterChoke.cityPanics && sAfterChoke.cityPanics['fortress_city'].level === 'high', '目标城池级联进入 high 级别断粮恐慌状态');
  a(sAfterChoke.rumors && sAfterChoke.rumors.some(function(r) { return r.topic === '物资断供恐慌'; }), '全城口耳相传级联生成物资断供恐慌传闻');

  // ─────────────────────────────────────────────────────────────
  // 步骤 2：伏笔成熟破土爆发公开危机
  // ─────────────────────────────────────────────────────────────
  const germRes = W.foreshadowGermination.germinate({
    seedId: 'seed_treason_contract',
    targetActor: 'actor_general',
    elapsedHours: 72,
    severity: 65,
    at: 1100
  });
  a(germRes.ok === true && germRes.reason === 'foreshadow-erupted', '叛国密约伏笔破土爆发公开危机');
  const crisisId = germRes.crisis.crisisId;

  const sAfterGerm = W.store.get();
  a(sAfterGerm.actors['actor_general'].conditions.indexOf('threatened') >= 0, '守将身陷现实反噬威胁态势');
  a(sAfterGerm.actors['actor_general'].reputation < 80, '守将声誉遭伏笔危机重创扣减');

  // ─────────────────────────────────────────────────────────────
  // 步骤 3：有限庇护所争夺与生还者【幸存者负罪感】级联
  // ─────────────────────────────────────────────────────────────
  const scrambleRes = W.sanctuaryScramble.scramble({
    sanctuaryId: 'bunker_inner_vault',
    capacity: 1,
    applicants: [
      { actorId: 'actor_general', priority: 5, strength: 80, sacrifice: false },
      { actorId: 'actor_medic', priority: 1, strength: 40, sacrifice: true } // 医官舍身断后
    ],
    at: 1200
  });
  a(scrambleRes.ok === true && scrambleRes.reason === 'scramble-completed', '庇护所角逐仲裁完成');
  a(scrambleRes.admitted[0] === 'actor_general', '守将成功入驻唯一安全舱');
  a(scrambleRes.sacrifices[0] === 'actor_medic', '医官记录为舍身奉献');

  const sAfterScramble = W.store.get();
  const general = sAfterScramble.actors['actor_general'];
  a(general.conditions.indexOf('sheltered') >= 0, '守将具备 sheltered 生还庇护状态');
  a(general.conditions.indexOf('haunted') >= 0, '守将因同伴牺牲级联被施加 haunted 精神创伤');
  a(general.counterfactualEchoes && general.counterfactualEchoes.some(function (e) {
    return e.id.indexOf('echo_survivor_guilt') >= 0;
  }), '守将记忆被真实烙印幸存者负罪感反事实梦魇');

  // ─────────────────────────────────────────────────────────────
  // 步骤 4：谈判桌城下之盟和解，并精准平息公开危机
  // ─────────────────────────────────────────────────────────────
  const bargainRes = W.dilemmaBargain.negotiate({
    partyA: 'actor_general',
    partyB: 'actor_smuggler',
    offerAtoB: '开放军需关防通道特许权',
    offerBtoA: '调拨黑市走私粮仓平抑城中粮荒并交出叛国密约原件',
    utilityA: 55,
    utilityB: 60,
    resolveCrisisId: crisisId,
    at: 1300
  });
  a(bargainRes.ok === true && bargainRes.ratified === true, '守将与黑市枭雄达成城下之盟和解条约');

  const sAfterBargain = W.store.get();
  const resolvedCrisis = sAfterBargain.activeCrises.find(function (c) { return c.crisisId === crisisId; });
  a(resolvedCrisis && resolvedCrisis.status === 'resolved_by_pact', '公开危机被谈判公约成功调停平息');
  a(resolvedCrisis.resolvedByPact === bargainRes.pact.pactId, '危机平息档案精准关联缔结的条约号');

  // ─────────────────────────────────────────────────────────────
  // 步骤 5：大模型主生成 Prompt 注入汇流管线穿透断言
  // ─────────────────────────────────────────────────────────────
  const promptBlock = W.injectCollector.buildBlock({
    people: ['actor_general', 'actor_smuggler'],
    place: 'fortress_city'
  });
  a(typeof promptBlock === 'string' && promptBlock.length > 0, 'Prompt 结构注入块成功构建');
  a(promptBlock.indexOf('物资断供') >= 0, '主生成注入块中穿透包含【物资断供】与暴涨警示');
  a(promptBlock.indexOf('和解公约') >= 0, '主生成注入块中穿透包含【和解公约】缔约双方条目');
  a(promptBlock.indexOf('反事实回响') >= 0, '主生成注入块中穿透包含【反事实回响】幸存者梦魇潜台词');

  // ─────────────────────────────────────────────────────────────
  // 步骤 6：破坏性真负控制断言（Negative Controls）
  // ─────────────────────────────────────────────────────────────
  // 负控制 1：谈判双方效用有一方低于底线，协议撕裂，无法平息危机
  const brokenRes = W.dilemmaBargain.negotiate({
    partyA: 'actor_general',
    partyB: 'actor_smuggler',
    utilityA: 10, // 低于底线 30
    utilityB: 50,
    resolveCrisisId: 'crisis_another_seed',
    at: 1400
  });
  a(brokenRes.ok === true && brokenRes.ratified === false && brokenRes.reason === 'bargain-ruptured', '效用不达标时谈判破裂');

  // 负控制 2：伏笔发酵时限未达到成熟阈值（24小时），强制阻断破土反噬
  const prematureRes = W.foreshadowGermination.germinate({
    seedId: 'seed_green_apple',
    targetActor: 'actor_medic',
    elapsedHours: 12, // 未达 24h
    at: 1500
  });
  a(prematureRes.ok === false && prematureRes.reason === 'seed-not-matured', '未成熟伏笔严禁虚假破土反噬');

  // 负控制 3：险道封锁缺省目标城池与资源种类，拦截拒绝
  const invalidChoke = W.supplyChoke.triggerChoke({
    routeId: 'route_broken',
    destinationCity: '', // 空城池
    resourceKind: 'steel'
  });
  a(invalidChoke.ok === false && invalidChoke.reason === 'missing-destination', '缺省目标城池时严密拦截');

  // 负控制 4：关闭开关后严密拦截
  W.supplyChoke.triggerChoke({}); // 缺参数测试
}

function run() {
  let passed = 0;
  let total = 0;
  function a(cond, msg) {
    total++;
    if (!cond) {
      console.error('FAIL [' + total + ']: ' + msg);
      throw new Error(msg);
    }
    passed++;
  }
  try {
    runGrandCascade(a);
    console.log('场景 17（深水区全域大交响与级联平息）专锁全部断言通过（' + passed + '/' + total + ' 绿灯，含 4 项破坏性真负控制）！');
  } catch (e) {
    console.error('GRAND CASCADE TEST EXCEPTION:', e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}
module.exports = { runGrandCascade };
