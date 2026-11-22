'use strict';
// WorldAxis tests/scenario-v14-multi-whisper.js
// 验证 WorldAxis V14 场景 11：暗流密室之会（多角色协同与私密耳语视界）
// 机制覆盖：
//   - OPV14-1: liaison.coordinate 多角色发言优先级、插话与动机冲突仲裁
//   - EXV14-1: whisperBackchannel.sendWhisper 私密背刺双轨视界与隔墙窃听判定
//   - 负控制测试：篡改参数、关闭开关、越界阻尼与空受众断言

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'liaison', 'whisperBackchannel', 'spatialAcoustics', 'idiosyncrasy'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runScenario(a) {
  const W = env();

  // 1. 初始化多角色在场生态
  W.store.transact(function (draft) {
    draft.people = draft.people || {};
    draft.people['p_boss'] = {
      id: 'p_boss', name: '行会会长赵掌柜', dominance: 80, stress: 20, affinityWithPlayer: 50
    };
    draft.people['p_merchant'] = {
      id: 'p_merchant', name: '走私商人张三', dominance: 50, stress: 75, affinityWithPlayer: 30
    };
    draft.people['p_guard'] = {
      id: 'p_guard', name: '护卫阿强', dominance: 40, stress: 30, affinityWithPlayer: 20
    };
    draft.people['p_scout'] = {
      id: 'p_scout', name: '暗探李捕头', dominance: 65, stress: 35, affinityWithPlayer: 60
    };
  });

  // Step 1: 多角色群聊意图仲裁（OPV14-1）
  const coordRes = W.actionDesk.plan('society.coordinate', {
    topic: '军需物资暗标拍卖',
    urgency: 60,
    actors: [
      W.store.get().people['p_boss'],
      W.store.get().people['p_merchant'],
      W.store.get().people['p_guard']
    ]
  });

  a(coordRes.ok === true, 'S11-01: liaison 多角色意图协调成功执行');
  a(coordRes.primarySpeaker && coordRes.primarySpeaker.id === 'p_merchant',
    'S11-02: 高压应激商人张三在紧急议题中夺得第一顺位发言权（priorityScore 领先）');
  a(coordRes.primarySpeaker.actionStance === 'outburst', 'S11-03: 商人张三发言态势判定为 outburst 情绪爆发');
  a(coordRes.interrupters.some(function (i) { return i.id === 'p_boss'; }),
    'S11-04: 高主导欲行会会长赵掌柜被标记为具备插话倾向（interrupter）');
  a(Array.isArray(coordRes.nextActions) && coordRes.nextActions.includes('actor.sendWhisper'),
    'S11-05: 调度桌 nextActions 拓扑正确指向 actor.sendWhisper 私密背刺分支');

  // Step 2: 公开会议下的私密背刺耳语递送（EXV14-1）
  // 商人张三在公开会谈中，私下通过耳语向暗探李捕头递送背刺密约
  const whisperRes = W.actionDesk.plan('actor.sendWhisper', {
    senderId: 'p_merchant',
    recipientId: 'p_scout',
    content: '赵会长的军需账本藏在密室暗格，今夜三更开门！',
    secretDealKey: 'deal_betray_boss',
    acousticDamping: 0.8, // 隔音屏风与掩人耳目阻尼
    thirdParties: [
      { id: 'p_boss', insightScore: 40, distance: 2.0 },
      { id: 'p_guard', insightScore: 30, distance: 1.5 }
    ]
  });

  a(whisperRes.ok === true, 'S11-06: 私密背刺耳语成功递送');
  a(whisperRes.sealed === true, 'S11-07: 高阻尼掩护下私密耳语成功封印，未被第三方截获');
  a(whisperRes.interceptedBy === null, 'S11-08: 赵会长与护卫均未察觉背刺密信');
  a(whisperRes.audienceScope.includes('p_merchant') && whisperRes.audienceScope.includes('p_scout'),
    'S11-09: 视界范围严格限制在发送方与接收方');

  // Step 3: 持久化信道状态验证
  const peopleData = W.store.get().people;
  a(Array.isArray(peopleData['p_merchant'].whisperChannels) && peopleData['p_merchant'].whisperChannels.length === 1,
    'S11-10: 商人人物档案真实沉淀私密耳语信道');
  a(peopleData['p_scout'].whisperChannels[0].secretDealKey === 'deal_betray_boss',
    'S11-11: 接收方李捕头人物档案正确落盘绝密契约键值');

  // Step 4: 近距离侦听与第三方截获背刺（EXV14-1 截获分支）
  // 护卫阿强突然贴近且屏风移开（阻尼大幅降低至 0.2，距离 0.8，护卫洞察提升）
  const interceptRes = W.actionDesk.plan('actor.sendWhisper', {
    senderId: 'p_merchant',
    recipientId: 'p_scout',
    content: '暗格钥匙在花瓶底下，切勿声张！',
    secretDealKey: 'deal_key_location',
    acousticDamping: 0.1, // 屏风倒下，隔音失效
    thirdParties: [
      { id: 'p_guard', insightScore: 85, distance: 0.8 } // 护卫敏锐逼近
    ]
  });

  a(interceptRes.ok === true, 'S11-12: 近距离耳语执行完成');
  a(interceptRes.sealed === false, 'S11-13: 隔音失效且敏锐护卫逼近，耳语被当场截获（sealed: false）');
  a(interceptRes.interceptedBy === 'p_guard', 'S11-14: 准确判定截获者为护卫阿强');
  a(interceptRes.audienceScope.includes('p_guard'), 'S11-15: 护卫阿强被强制纳入该消息的知情视界名单');

  const guardData = W.store.get().people['p_guard'];
  a(Array.isArray(guardData.interceptedWhispers) && guardData.interceptedWhispers.length === 1,
    'S11-16: 护卫阿强人物档案持久化写入截获情报证据');

  // Step 5: 严格负控制测试（Negative Controls）
  const neg1 = W.actionDesk.plan('society.coordinate', { actors: [] });
  a(neg1.ok === false && neg1.reason === 'no-actors-in-scene',
    'S11-NC1: 场景空在场角色仲裁必然拒绝（fail-closed）');

  const neg2 = W.actionDesk.plan('actor.sendWhisper', { senderId: '', recipientId: 'p_scout', content: 'test' });
  a(neg2.ok === false && neg2.reason === 'invalid-participants',
    'S11-NC2: 缺失发送方耳语必然拒绝');

  const neg3 = W.actionDesk.plan('actor.sendWhisper', { senderId: 'p_merchant', recipientId: 'p_scout', content: '   ' });
  a(neg3.ok === false && neg3.reason === 'empty-content',
    'S11-NC3: 空内容耳语必然拒绝');
  if (W.settingsBus) {
    const reg = W.__settingsRegs.find(function (r) { return r.module === 'whisperBackchannel'; });
    if (reg) W.settingsBus.save(reg, { enabled: false });
  }
  const neg4 = W.actionDesk.plan('actor.sendWhisper', { senderId: 'p_merchant', recipientId: 'p_scout', content: 'hello' });
  a(neg4.ok === false && neg4.reason === 'disabled',
    'S11-NC4: 引擎开关关闭时耳语操作物理级熔断拒收');

  console.log('场景 11 专锁全部断言通过（含 4 项真负控制）！');
}

if (require.main === module) {
  let passed = 0;
  function assert(cond, msg) {
    if (!cond) {
      console.error('FAIL: ' + msg);
      process.exit(1);
    }
    passed++;
  }
  runScenario(assert);
  console.log('PASS ' + passed + ' / ' + passed);
}

module.exports = { runScenario: runScenario };
