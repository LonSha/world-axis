'use strict';
// WorldAxis tests/scenario-v13-room-acoustics.js
// 验证 WorldAxis V13 世界级贯通场景 6：密室隔墙有耳与具身物理感知
// 场景链路：
//   1. 初始空间具身拓扑：旅店天字二号房与隔壁走廊，中间隔有一扇厚木门（阻尼 0.70，视线遮蔽）
//   2. 密谋低语：房间内密谋者（商人张三）发起低语密谈 room.whisper，传递绝密军需交易情报
//   3. 隔墙窃听与物理衰减：走廊外的密探（李捕头）发起 room.eavesdrop 窃听，受木门阻尼衰减影响，仅截获断续拼音与部分气声
//   4. 跑团剧情变奏骰：检定走廊外动静，通过 narrative.roll 掷出 progression/crisis 变奏骰，出现 unexpected_obstacle 意外异响
//   5. 破门突入物理熔断：李捕头破门突入 room.burstIn，物理强制打断密谈，现场转入应激对峙，商人的密谈状态标记为 interrupted
//   6. 生理硬熔断与虚弱回声：商人遭遇突入受惊，且在连续施压与体力枯竭下触发 motive.arbitrate 生理硬熔断（hard_lockout: collapse/faint），
//      所有主动反抗动作被物理级硬拦截，并在人物档案中沉淀生理持久伤痕与虚弱回声！

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'motiveArbitration', 'successGrade', 'spatialAcoustics', 'narrativeDice', 'observe', 'idiosyncrasy'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runScenario(a) {
  const W = env();

  // 1. 初始化空间与角色
  W.store.transact(function (draft) {
    draft.people = draft.people || {};
    draft.people['p_merchant'] = {
      id: 'p_merchant',
      name: '商人张三',
      location: '旅店二号房',
      resources: { stamina: 10, funds: 1000 },
      stress: 40,
      trauma: 10,
      life: { commitments: [] }
    };
    draft.people['p_scout'] = {
      id: 'p_scout',
      name: '密探李捕头',
      location: '旅店走廊',
      resources: { stamina: 80, funds: 50 },
      stress: 10,
      trauma: 0
    };
    return true;
  }, 'setup:acoustics-world');

  // 2. 空间隔断设置：旅店走廊 <-> 旅店二号房，隔有一扇厚实木门
  const partRes = W.actionDesk.plan('room.partition', {
    roomId: '旅店二号房',
    adjacentRoomId: '旅店走廊',
    type: 'door',
    damping: 0.70,
    occluded: true
  });
  a.ok(partRes.ok, '隔断空间注册成功');

  // 3. 商人张三在二号房内低语密谈军需交易
  const secretContent = '今夜子时，城东三号码头，务必将三十箱精铁火石装船运往北境。';
  const whisperRes = W.actionDesk.plan('room.whisper', {
    roomId: '旅店二号房',
    speaker: '商人张三',
    content: secretContent,
    volume: 'whisper',
    participants: ['商人张三', '神秘随从']
  });
  a.ok(whisperRes.ok, '密室低语密谈发起成功');
  a.equal(whisperRes.status, 'active', '密谈处于活跃进行状态');
  a.ok(whisperRes.nextActions.indexOf('room.eavesdrop') >= 0, '生成下一步可窃听路由');

  // 4. 走廊外的李捕头隔门窃听
  const eavesdropRes = W.actionDesk.plan('room.eavesdrop', {
    listenerId: '密探李捕头',
    listenerRoomId: '旅店走廊',
    targetRoomId: '旅店二号房'
  });
  a.ok(eavesdropRes.ok, '隔门窃听执行成功');
  a.equal(eavesdropRes.speaker, '商人张三', '识别出发言者为商人张三');
  a.equal(eavesdropRes.barrierType, 'door', '隔断类型为木门');
  a.equal(eavesdropRes.clarity, 'partial', '受木门阻尼衰减，声音呈断续 partial 状态');
  a.ok(eavesdropRes.signalLevel < 0.30, '有效声学信号受物理阻隔显著削弱');
  a.ok(eavesdropRes.interceptedContent.indexOf('……[微弱气声]……') >= 0, '截获文本包含真实的断续气声畸变');
  a.notEqual(eavesdropRes.interceptedContent, secretContent, '受隔音阻碍，未全知获知完整原始密谈');

  // 5. 走廊发生变奏：执行剧情扰动骰
  const rollRes = W.actionDesk.plan('narrative.roll', {
    groupId: 'progression',
    fixedRoll: 2 // 命中 unexpected_obstacle
  });
  a.ok(rollRes.ok, '剧情变奏骰掷出成功');
  a.equal(rollRes.slot.grade, 'unexpected_obstacle', '触发环境意外阻碍槽位');
  a.equal(rollRes.roll, 2, '投骰点数稳定复现');

  // 6. 李捕头推门突入：物理级打断当前密谈
  const burstRes = W.actionDesk.plan('room.burstIn', {
    actorId: '密探李捕头',
    roomId: '旅店二号房',
    forceEntry: true
  });
  a.ok(burstRes.ok, '推门突入执行成功');
  a.ok(burstRes.burst, '物理破门生效');
  a.equal(burstRes.standoff, true, '现场进入应激对峙态');
  a.equal(burstRes.intruder, '密探李捕头', '突入者为李捕头');

  // 复核房间密谈状态已被打断
  const checkWhisper = W.actionDesk.plan('room.getConversation', { roomId: '旅店二号房' });
  a.equal(checkWhisper.status, 'interrupted', '原密谈被物理硬打断');
  a.equal(checkWhisper.interruptedBy, '密探李捕头', '打断者记录精确');

  // 7. 现场商人张三受到极端惊吓，体力归零（生理硬熔断场景）
  const merchant = W.store.get().people['p_merchant'];
  merchant.resources.stamina = 0; // 体力耗尽
  merchant.stress = 98; // 心理创伤飙升

  const candidates = [
    { id: 'act_fight', title: '拔刀抵抗', cost: { safety: 5, livelihood: 0 }, payoff: { ambition: 2 } },
    { id: 'act_escape', title: '翻窗逃窜', cost: { safety: 4, livelihood: 0 }, payoff: { safety: 3 } },
    { id: 'act_bribe', title: '塞金条行贿', cost: { livelihood: 3 }, payoff: { safety: 4 } }
  ];

  // 执行动机仲裁：应当触发生理极限硬熔断，任何抵抗意图均被硬性拦截！
  const motiveRes = W.actionDesk.plan('motive.arbitrate', {
    person: merchant,
    candidates: candidates,
    facts: { danger: true, surrounded: true }
  });

  a.ok(motiveRes.ok, '动机仲裁执行响应');
  a.equal(motiveRes.hardLockout, true, '成功触发最高拦截级生理硬熔断！');
  a.equal(motiveRes.decision, 'hard_lockout', '决策类型被锁定为 hard_lockout');
  a.equal(motiveRes.selected.circuit.type, 'collapse', '熔断类型为体力枯竭性昏厥崩解');
  a.ok(motiveRes.selected.title.indexOf('昏厥') >= 0, '选中动作为不由自主的生理休克昏厥');
  a.equal(motiveRes.forsaken.length, 3, '所有三项主动意图（拔刀/翻窗/行贿）均被拦截抛弃');
  a.equal(motiveRes.forsaken[0].reason, 'intercepted-by-physiological-circuit-breaker', '明确记录被生理熔断器拦截');

  // 验证人物持久生理伤痕与虚弱回声沉淀
  a.ok(Array.isArray(merchant.life.physiologicalScars), '沉淀生理伤痕档案');
  a.ok(merchant.life.physiologicalScars.indexOf('physiological_exhaustion_scar') >= 0, '包含体力枯竭持久伤痕');
  a.equal(merchant.life.debilityEcho.active, true, '激活虚弱回声');

  // 8. 非二元检定代价验证：李捕头搜刮密室暗格
  const spectrumRes = W.actionDesk.plan('successGrade.evaluateSpectrum', {
    roll: 45,
    target: 50,
    costType: 'noise_alert'
  });
  a.ok(spectrumRes.ok, '非二元检定计算成功');
  a.equal(spectrumRes.pass, true, '基础检定通过');
  a.equal(spectrumRes.spectrum, 'costly_success', '判定为代价成功（costly_success）');
  a.ok(spectrumRes.cost != null, '附带意外代价');

  // 9. 镜头外不在场角色暗流推进（全视之眼机制）
  const shadowRes = W.actionDesk.plan('actor.advanceShadow', {
    actor: '神秘随从',
    progress: {
      location: '城东三号码头',
      intent: '暗中转移备用账册',
      action: '租用货运乌篷船',
      note: '察觉异动，提前至码头接应'
    }
  });
  a.ok(shadowRes.ok, '不在场角色暗流推进成功');
  a.equal(shadowRes.location, '城东三号码头', '后台位置更新且未污染正文');
  a.equal(shadowRes.intent, '暗中转移备用账册', '心意自主演化');
  // 再次核实人物档案持久化
  const shadowPerson = W.store.get().people['p_神秘随从'];
  a.ok(shadowPerson != null, '神秘随从在册');
  a.equal(shadowPerson.shadowState.logs.length, 1, '后台履历流水沉淀');

  // 10. EXV13-7: 潜意识微反应登记与下意识破绽洞察验证
  // 登记商人张三在面临走私与军需质询时的下意识微动作（下意识轻抚袖口暗袋火漆印）
  const idioRegRes = W.actionDesk.plan('actor.registerIdiosyncrasy', {
    actorId: 'p_merchant',
    triggerTag: 'military_smuggle',
    microBehavior: '下意识反复按压左袖暗袋的火漆密信印记',
    leakedSecretKey: 'north_border_contraband_manifest',
    stressThreshold: 50,
    involuntary: true
  });
  a.ok(idioRegRes.ok, '潜意识微反应模式登记成功');
  a.equal(idioRegRes.total, 1, '人物档案下沉淀 1 条潜意识微反应');
  a.equal(idioRegRes.idiosyncrasy.triggerTag, 'military_smuggle', '触发情境标签绑定精确');

  // 李捕头在现场对处于高压状态下的张三进行敏锐洞察侦测
  const idioObsRes = W.actionDesk.plan('actor.observeSubconscious', {
    observerId: 'p_scout',
    targetId: 'p_merchant',
    topic: 'military_smuggle',
    insightScore: 65,
    stress: 85
  });
  a.ok(idioObsRes.ok, '潜意识微动作侦测执行成功');
  a.equal(idioObsRes.detected, true, '成功捕捉到高压应激下的下意识微动作破绽');
  a.equal(idioObsRes.microBehavior, '下意识反复按压左袖暗袋的火漆密信印记', '捕捉到具体微动作');
  a.equal(idioObsRes.secretKey, 'north_border_contraband_manifest', '洞察出与军需走私清单相关的核心密防线索');
  a.equal(idioObsRes.insightGrade, 'acute_insight', '洞察等级判定为 acute_insight');

  // 核验张三的人物档案中沉淀了近期微动作遥测记录
  const merchantAfter = W.store.get().people['p_merchant'];
  a.ok(Array.isArray(merchantAfter.recentMicroBehaviors), '沉淀微动作遥测流');
  a.equal(merchantAfter.recentMicroBehaviors.length, 1, '遥测流记录数自洽');
  a.equal(merchantAfter.recentMicroBehaviors[0].leakedSecretKey, 'north_border_contraband_manifest', '遥测泄露密钥一致');
}

// 统一断言收集器
const assertions = [];
const a = {
  ok: function (expr, msg) {
    if (!expr) {
      const err = new Error(msg || 'assertion failed');
      console.error('FAIL:', msg, err.stack);
      process.exit(1);
    }
    assertions.push(msg);
  },
  equal: function (actual, expected, msg) {
    if (actual !== expected) {
      const err = new Error((msg || '') + ' (' + actual + ' !== ' + expected + ')');
      console.error('FAIL:', msg, err.stack);
      process.exit(1);
    }
    assertions.push(msg);
  },
  notEqual: function (actual, expected, msg) {
    if (actual === expected) {
      const err = new Error((msg || '') + ' (' + actual + ' === ' + expected + ')');
      console.error('FAIL:', msg, err.stack);
      process.exit(1);
    }
    assertions.push(msg);
  }
};

runScenario(a);
console.log('✔ WorldAxis V13 场景 6「密室隔墙有耳（物理具身感知）」专锁通过！全部 ' + assertions.length + ' 项核心断言 100% 全绿！');
assertions.forEach(function (m, idx) {
  console.log('  [' + (idx + 1) + '] ' + m);
});