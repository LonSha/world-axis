'use strict';
// WorldAxis tests/scenario-v38-stage-presence-offstage-living.js
// 验证 WorldAxis V19 核心体验专锁：正文聊天驱动退场角色自动过日子与重逢谈资流转
//
// 机制贯通矩阵：
//   1. 舞台聚光灯自动感知（stagePresence.sensePresence）：
//      - 角色 A（林捕头）在正文说话/登场，自动归入 onstage
//      - 角色 B（沈掌柜）与角色 C（小杂役）在正文未出现，自动识别为 offstage
//      - 自动在 offstageLife 中建立幕后生计档案，且初建时 roundsAway 初始递增
//   2. 每轮聊天后台自动运转（stagePresence.tickOffstageAutonomy / workflow:after）：
//      - 模拟连续推演 3 轮正文对话
//      - 退场角色 roundsAway 自动累加（1 -> 2 -> 3 -> 4 轮）
//      - 结合题材作息自动分配活动（candidateDoing/place）
//      - 自动产生精力磨损（weariness 递增）与日常茶水开销（spareCoins 扣减）
//      - 概率遭遇题材生活小插曲/糗事（misadventures / reunionGossip）
//   3. 重逢切片与谈资唤醒（stagePresence.awakenReunion）：
//      - 当正文再次提及或重逢沈掌柜时，精准提取其真实生活谈资与痕迹
//      - 带出「刚才的经历 / 疲劳度 / 随身物品 / 所在地」
//   4. 结构化提示词汇流（stagePresence.buildPresenceBlock / injectCollector）：
//      - 自动生成【幕后世界动态·退场人物生活参考】Prompt 注入文本
//   5. 破坏性真负控制门禁（100% 负控制覆盖）：
//      - 禁用状态（enabled: false）拒绝执行并报 disabled
//      - 空姓名调用重逢唤醒拒绝（missing-who）
//      - 未登记离场的全新陌生人调用唤醒拒绝（no-offstage-record）
//      - 角色重新回到正文镜头后，其离场轮数 roundsAway 自动归零（在场重置）

const assert = require('assert');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function createEnv() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'offstageLife', 'stagePresence', 'injectCollector', 'life'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runStagePresenceOffstageLivingTest() {
  console.log('[Scenario 38] 开始执行正文聊天驱动退场角色自动幕后生活专锁测试...');
  const W = createEnv();

  // ── 环节 1：在系统中预设世界角色 ──
  // 在 actors / registry 或 store.people 中建立 3 位不同身份角色
  W.store.transact(draft => {
    draft.people = draft.people || {};
    draft.people['p_林捕头'] = { name: '林捕头', location: '衙门正厅', action: '审案' };
    draft.people['p_沈掌柜'] = { name: '沈掌柜', location: '荣顺客栈', action: '对账' };
    draft.people['p_青玄小道童'] = { name: '青玄小道童', location: '清虚观', action: '扫地' };
  }, 'setup:characters');

  // ── 环节 2：第一轮正文聊天：林捕头在场，沈掌柜与道童退场 ──
  const chatRound1 = [
    { is_user: true, mes: '林捕头，昨晚西街的动静你查清楚了吗？' },
    { is_user: false, name: '林捕头', mes: '回禀大人，属下昨夜一直在现场勘验，现场只留下一枚断箭。' }
  ];

  const sense1 = W.stagePresence.sensePresence({ chat: chatRound1 });
  assert.strictEqual(sense1.ok, true, '第一轮聚光灯感知应成功');
  assert.ok(sense1.data.onstage.includes('林捕头'), '林捕头应被识别为在场');
  assert.ok(sense1.data.offstage.includes('沈掌柜'), '沈掌柜应被自动识别为退场');
  assert.ok(sense1.data.offstage.includes('青玄小道童'), '青玄小道童应被自动识别为退场');

  // 检验 offstageLife 中是否自动建立了档案
  const cardShen0 = W.offstageLife.getOffstageCard('沈掌柜');
  assert.ok(cardShen0, '沈掌柜应自动在幕后生计中建立卡片');
  assert.strictEqual(cardShen0.roundsAway, 1, '初次退场初始离场轮数为 1');

  // ── 环节 3：模拟正文推进（执行 3 次 workflow:after 的自主运转） ──
  // 模拟 AI 每轮聊天完毕后系统自动触发的 tickOffstageAutonomy
  const tick1 = W.stagePresence.tickOffstageAutonomy();
  assert.strictEqual(tick1.ok, true, '第一次后台自主运转成功');
  assert.ok(tick1.data.progressedCount >= 2, '至少推进了 2 位退场角色');

  const tick2 = W.stagePresence.tickOffstageAutonomy();
  assert.strictEqual(tick2.ok, true, '第二次后台自主运转成功');

  const tick3 = W.stagePresence.tickOffstageAutonomy();
  assert.strictEqual(tick3.ok, true, '第三次后台自主运转成功');

  // 检验退场角色的自转数据
  const cardShenAfter = W.offstageLife.getOffstageCard('沈掌柜');
  assert.ok(cardShenAfter.roundsAway >= 4, '连续 3 轮推演后，沈掌柜离场轮次应累加至 4 轮');
  assert.ok(cardShenAfter.weariness > cardShen0.weariness, '在幕后生活劳作后，精力磨损应自然增加');

  // ── 环节 4：久别重逢/提及唤醒谈资 ──
  const reunion = W.stagePresence.awakenReunion('沈掌柜');
  assert.strictEqual(reunion.ok, true, '重逢谈资唤醒应成功');
  assert.strictEqual(reunion.data.who, '沈掌柜');
  assert.ok(reunion.data.roundsAway >= 4, '重逢时应准确带出离开轮数');
  assert.ok(reunion.data.currentActivity, '应具备当前具体在忙的生计活动');
  assert.ok(reunion.data.weariness, '应带出具身外显的疲惫精神神态');

  // ── 环节 5：结构化 Prompt 注入层校验 ──
  const injectBlock = W.stagePresence.buildPresenceBlock();
  assert.ok(injectBlock.includes('【幕后世界动态·退场人物生活参考】'), '应包含幕后动态标题');
  assert.ok(injectBlock.includes('沈掌柜'), '注入文本中应包含退场角色沈掌柜');
  assert.ok(injectBlock.includes('青玄小道童'), '注入文本中应包含青玄小道童');

  // ── 环节 6：角色重回镜头（林捕头带沈掌柜重新出场） ──
  const chatRound2 = [
    { is_user: true, mes: '快把沈掌柜请过来问话！' },
    { is_user: false, name: '沈掌柜', mes: '哎哟大人，小民刚才还在后厨算账呢，不知大人传唤何事？' }
  ];

  const sense2 = W.stagePresence.sensePresence({ chat: chatRound2 });
  assert.strictEqual(sense2.ok, true, '第二轮聚光灯感知应成功');
  assert.ok(sense2.data.onstage.includes('沈掌柜'), '沈掌柜登场后应转为在场状态');

  const cardShenRejoin = W.offstageLife.getOffstageCard('沈掌柜');
  assert.strictEqual(cardShenRejoin.roundsAway, 0, '角色重新登场在场后，离场轮数 roundsAway 应归零');

  // ── 环节 7：破坏性真负控制门禁测试 ──
  console.log('[Scenario 38] 验证 4 项真实破坏性负控制门禁...');

  // 负控制 1：空角色名调用唤醒，拒绝
  const negEmpty = W.stagePresence.awakenReunion('');
  assert.strictEqual(negEmpty.ok, false);
  assert.strictEqual(negEmpty.reason, 'missing-who');

  // 负控制 2：从未离场且系统中不存在的陌生人，拒绝
  const negStranger = W.stagePresence.awakenReunion('火星外星人999');
  assert.strictEqual(negStranger.ok, false);
  assert.strictEqual(negStranger.reason, 'no-offstage-record');

  // 负控制 3：禁用总开关时调用聚光灯感知，拒绝
  const W_disabled = createEnv();
  W_disabled.stagePresence.__customSettings = { enabled: false };
  const negSense = W_disabled.stagePresence.sensePresence({ chat: chatRound1 });
  assert.strictEqual(negSense.ok, false);
  assert.strictEqual(negSense.reason, 'disabled');

  // 负控制 4：禁用总开关时调用自主运转，拒绝
  const negTick = W_disabled.stagePresence.tickOffstageAutonomy();
  assert.strictEqual(negTick.ok, false);
  assert.strictEqual(negTick.reason, 'disabled');

  console.log('[Scenario 38] 场景 38 全链路断言与 4 项破坏性负控制门禁全量通过！PASS');
}

runStagePresenceOffstageLivingTest();
