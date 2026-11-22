/**
 * WorldAxis tests/scenario-v45-cross-plugin-full-duplex-resonance.js
 * 场景 45 专锁：三插件全双工因果回响与 RubyPhone 谍报密谋专锁
 * (OPV20-4 通讯流量谍报转化 + OPV20-5 记忆心锚意志反哺 + OPV20-6 ActionDesk 调度 + 破坏性负控制)
 *
 * 验证目标：
 *  1. OPV20-4 RubyPhone 虚拟通讯入站谍报解析：
 *     - covertEspionage.ingestCommTraffic 接收虚拟手机报文并转化为客观情报线索；
 *     - undercurrentCalendar.triggerByMessage 检测群聊/私信密谋关键词并推动暗流阶段（latent -> developing -> active）；
 *  2. OPV20-5 LonSha 记忆真源情感心锚与具身意志反哺：
 *     - humanRealism.applyMemoryResolve 提取生死羁绊与血仇，反哺为角色在审讯/决斗时的意志加成与防御补偿；
 *  3. ActionDesk 深度联动调度：
 *     - actionDesk.plan('spy.ingestCommTraffic', ...)
 *     - actionDesk.plan('current.triggerByMessage', ...)
 *     - actionDesk.plan('human.applyMemoryResolve', ...)
 *  4. 破坏性负控制断言（100% 负控制防线）：
 *     - 空白/过短（<5字）无效噪音通讯强行作为线索入库必须被拒止（refusal: 'comm-traffic-noise'）；
 *     - 日常无害闲聊（无密谋/刺杀/造反关键词）强行催化世界暗流异动必须被拒止（refusal: 'innocuous-comm-no-conspiracy'）；
 *     - 浅层记忆羁绊（intensity < 20）强行索求濒死超自然意志代偿必须被驳回（refusal: 'shallow-memory-no-resolve'）。
 */
'use strict';
const assert = require('assert');

// 模拟 WorldAxis 运行时
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

// 加载关键引擎
require('../engines/human-realism.js');
require('../engines/covert-espionage.js');
require('../engines/undercurrent-calendar.js');
require('../engines/phone-bridge.js');
require('../engines/action-desk.js');
require('../engines/bridge.js');

WA.actionDesk.setSettings({ enabled: true });
WA.covertEspionage.setSettings({ enabled: true });
WA.phoneBridge.setSettings({ enabled: true });

console.log('[Scenario 45] 开始执行三插件全双工因果回响与 RubyPhone 谍报密谋专锁测试...');

WA.store.init();
WA.store.transact(draft => {
  draft.covertSpies = [];
  draft.covertDispatches = [];
  draft.currents = [
    {
      id: 'regicide_conspiracy',
      title: '禁军夜宴弑君密谋',
      stage: 'latent',
      visibility: 'hidden'
    }
  ];
  draft.actors = {};
});

// ── 1. OPV20-4: 通讯流量谍报转化与破坏性负控制断言 1 ──
// 负控制 1：过短的噪音通讯直接被拒止入库
const failComm = WA.covertEspionage.ingestCommTraffic({
  channel: 'rubyphone_sms',
  from: 'operative_falcon',
  text: '在吗' // 长度不足 5 字，纯噪音
});
assert.strictEqual(failComm.ok, false, '噪音通讯必须被拒止入库');
assert.strictEqual(failComm.refusal, 'comm-traffic-noise', '拒止码必须是 comm-traffic-noise');
console.log('✓ 负控制门禁 1（过短通讯噪音谍报建档拒止）验证通过');

// 正确通讯流量入库：截获密谋短信并生成客观情报项
const okComm = WA.covertEspionage.ingestCommTraffic({
  channel: 'rubyphone_encrypted_chat',
  from: 'operative_falcon',
  to: 'rebel_leader_chen',
  text: '子夜三更，以摔杯为号，城西火起即刻封锁午门！'
});
assert.strictEqual(okComm.ok, true, '高价值密谋通讯入库成功');
assert.strictEqual(okComm.entry.riskLevel, 'medium');
assert.ok(okComm.dispatchId.startsWith('wiretap_'), '生成窃听归档 ID');
console.log('✓ 通讯流量向客观谍报线索转化闭环验证通过');

// ── 2. OPV20-4: 密谋通信推动世界暗流跃迁与破坏性负控制断言 2 ──
// 负控制 2：普通家常闲聊不可催化世界暗流
const failCurrent = WA.undercurrentCalendar.triggerByMessage('regicide_conspiracy', {
  sender: 'palace_maid',
  text: '今日御膳房送来的桂花糕格外香甜，改天一起去尝尝。'
});
assert.strictEqual(failCurrent.ok, false, '家常闲聊催化暗流必须被拒止');
assert.strictEqual(failCurrent.refusal, 'innocuous-comm-no-conspiracy', '拒止码必须是 innocuous-comm-no-conspiracy');
console.log('✓ 负控制门禁 2（无害通信催化世界暗流异动拒止）验证通过');

// 正确密谋催化：暗流自 latent 推进至 developing
const triggerRes1 = WA.undercurrentCalendar.triggerByMessage('regicide_conspiracy', {
  sender: 'general_wu',
  text: '密信已阅：弑君之举势在必行，铁骑三千随时待命造反！'
});
assert.strictEqual(triggerRes1.ok, true, '密谋通信催化暗流成功');
assert.strictEqual(triggerRes1.stage, 'developing', '暗流阶段成功从 latent 跃迁至 developing');

// 再次密谋强化：推进至 active
const triggerRes2 = WA.undercurrentCalendar.triggerByMessage('regicide_conspiracy', {
  sender: 'general_wu',
  text: '已将毒药送入御膳房，今夜刺杀必成！'
});
assert.strictEqual(triggerRes2.ok, true);
assert.strictEqual(triggerRes2.stage, 'active', '暗流阶段成功推进至 active 全面爆发');
console.log('✓ 通讯密谋多级催化客观世界暗流爆发闭环验证通过');

// ── 3. OPV20-5: LonSha 记忆真源情感心锚与意志反哺 ──
// 负控制 3：情感羁绊太浅强行索求意志代偿被驳回
const failResolve = WA.humanRealism.applyMemoryResolve('knight_alric', {
  bondType: 'casual_friend',
  target: 'bartender_bob',
  intensity: 10 // 极浅
});
assert.strictEqual(failResolve.ok, false, '浅层记忆索求代偿必须被驳回');
assert.strictEqual(failResolve.refusal, 'shallow-memory-no-resolve', '拒止码必须是 shallow-memory-no-resolve');
console.log('✓ 负控制门禁 3（浅度记忆羁绊强行意志反哺驳回）验证通过');

// 正确意志反哺：以至死不渝的血仇心锚提供伤害减免与意志强韧
const okResolve = WA.humanRealism.applyMemoryResolve('knight_alric', {
  bondType: 'sworn_feud',
  target: 'tyrant_regent',
  intensity: 90
});
assert.strictEqual(okResolve.ok, true, '深刻血仇心锚反哺成功');
assert.strictEqual(okResolve.resolveBonus, 45, '反哺意志加成必须达到 45');
assert.strictEqual(okResolve.compensation, 'damage_resistance');
assert.ok(okResolve.narrative.includes('获得 +45 点意志反哺加成'));
console.log('✓ 记忆真源情感心锚反哺具身意志闭环验证通过');

// ── 4. OPV20-6: ActionDesk 统一调度台调用验证 ──
const deskIngest = WA.actionDesk.plan('spy.ingestCommTraffic', {
  channel: 'rubyphone_wiretap',
  from: 'shadow_scout',
  text: '发现敌军密探正在城门处暗中标记粮仓方位！'
});
assert.strictEqual(deskIngest.ok, true, 'ActionDesk 调度 spy.ingestCommTraffic 必须成功');

const deskTrigger = WA.actionDesk.plan('current.triggerByMessage', {
  currentId: 'regicide_conspiracy',
  sender: 'rebel_courier',
  text: '密令已达，今夜造反刺杀！'
});
assert.strictEqual(deskTrigger.ok, true, 'ActionDesk 调度 current.triggerByMessage 必须成功');

const deskResolve = WA.actionDesk.plan('human.applyMemoryResolve', {
  actorId: 'knight_alric',
  bondType: 'sworn_feud',
  target: 'tyrant_regent',
  intensity: 80
});
assert.strictEqual(deskResolve.ok, true, 'ActionDesk 调度 human.applyMemoryResolve 必须成功');
assert.strictEqual(deskResolve.resolveBonus, 40);
console.log('✓ ActionDesk 调度全双工因果路由验证通过');

console.log('[Scenario 45] 三插件全双工因果回响与 RubyPhone 谍报密谋专锁全部通过！');
