/**
 * WorldAxis tests/scenario-v46-epochal-collapse-transition.js
 * 场景 46 专锁：多重危机共振与王朝崩溃/历史纪元跃迁专锁
 * (EXV20-1 宏观历史突变与文明纪元跃迁 + ActionDesk 调度 + 100% 破坏性负控制)
 *
 * 验证目标：
 *  1. EXV20-1 宏观纪元跃迁机制：
 *     - 聚合四维微观危机因子（围城断粮、恶性瘟疫、中枢刺杀、民变骚乱）；
 *     - 加权计算社会综合危机熵（crisisEntropy）；
 *     - 突破阈值（>=75）触发文明纪元崩溃突变（如：dark_plague_age、warlord_collapse）；
 *     - 跃迁记录落盘 store.epochalTransition.history 并推进 epochTurn；
 *  2. 提示词与总线通知感知：
 *     - epochalTransition.buildBlock 动态呈现宏观纪元态势；
 *  3. ActionDesk 深度联动调度：
 *     - actionDesk.plan('history.evaluateEpochShift', ...)
 *  4. 破坏性负控制断言（100% 负控制防线）：
 *     - 危机熵未达临界阈值（<75）强行跃迁文明纪元必须严格驳回（refusal: 'crisis-entropy-subcritical'）；
 *     - 禁用状态下调用 evaluateEpochShift 必须被拒止（reason: 'disabled'）。
 */
'use strict';
const assert = require('assert');

// 模拟 WorldAxis 运行时
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

// 加载关键引擎
require('../engines/epochal-transition.js');
require('../engines/action-desk.js');

WA.actionDesk.setSettings({ enabled: true });
WA.epochalTransition.saveSettings({ enabled: true, crisisThreshold: 75 });

console.log('[Scenario 46] 开始执行多重危机共振与王朝崩溃/历史纪元跃迁专锁测试...');

WA.store.init();
WA.store.transact(draft => {
  draft.epochalTransition = {
    currentEpoch: 'flourishing_dynasty',
    epochTurn: 1,
    history: []
  };
});

// ── 1. 破坏性负控制断言 1：微观危机未达临界阈值严禁跃迁 ──
const failShift = WA.epochalTransition.evaluateEpochShift({
  attritionCrisis: 30,
  epidemicCrisis: 20,
  regicideCrisis: 10,
  unrestCrisis: 25
});
assert.strictEqual(failShift.ok, false, '危机熵未达阈值严禁纪元跃迁');
assert.strictEqual(failShift.refusal, 'crisis-entropy-subcritical', '拒止码必须是 crisis-entropy-subcritical');
assert.ok(failShift.crisisEntropy < 75, '危机熵应计算为低于 75');
console.log('✓ 负控制门禁 1（微观危机亚临界状态宏观纪元跃迁驳回）验证通过');

// ── 2. 多重恶性危机并发：击穿社会秩序阈值触发王朝崩溃 ──
// 围城断粮 85 + 恶性瘟疫 90 + 刺客弑君 95 + 全民哗变 80
const okShift = WA.epochalTransition.evaluateEpochShift({
  attritionCrisis: 85,
  epidemicCrisis: 90,
  regicideCrisis: 95,
  unrestCrisis: 80
});
assert.strictEqual(okShift.ok, true, '多重极端危机共振应当成功突破临界点');
assert.strictEqual(okShift.transitioned, true);
assert.strictEqual(okShift.fromEpoch, 'flourishing_dynasty');
// 恶性瘟疫 >= 80，判定为黑死枯萎纪元 dark_plague_age
assert.strictEqual(okShift.toEpoch, 'dark_plague_age');
assert.ok(okShift.crisisEntropy >= 85, '综合危机熵必须达到 85 以上');
assert.ok(okShift.narrative.includes('黑死枯萎纪'), '叙事通报必须明确历史剧变');

// 验证内部状态持久化与历史台账
const view = WA.epochalTransition.view();
assert.strictEqual(view.currentEpoch, 'dark_plague_age', '当前纪元状态持久化已更新');
assert.strictEqual(view.epochTurn, 2, '纪元代数成功推进至第 2 代');
assert.strictEqual(view.history.length, 1, '历史剧变台账必须记录在册');
assert.strictEqual(view.history[0].toEpoch, 'dark_plague_age');
console.log('✓ 多重极端危机击穿阈值引发文明纪元跃迁闭环验证通过');

// ── 3. 提示词注入块感知验证 ──
const block = WA.epochalTransition.buildBlock();
assert.ok(block.includes('【历史纪元大潮】'), '提示词块必须包含大潮标题');
assert.ok(block.includes('dark_plague_age'), '提示词块必须指明当前黑死枯萎纪元');
assert.ok(block.includes('2 代跃迁'), '提示词块必须体现历史跃迁代数');
console.log('✓ 宏观纪元跃迁提示词知觉注入感知验证通过');

// ── 4. ActionDesk 集中调度与负控制断言 2 ──
// 负控制 2：通过 ActionDesk 调度微弱危机，同样必须被拒止
const deskFail = WA.actionDesk.plan('history.evaluateEpochShift', {
  attritionCrisis: 10,
  epidemicCrisis: 10,
  regicideCrisis: 0,
  unrestCrisis: 10
});
assert.strictEqual(deskFail.ok, false, 'ActionDesk 调度亚临界危机必须返回 false');
assert.strictEqual(deskFail.refusal, 'crisis-entropy-subcritical');
console.log('✓ 负控制门禁 2（ActionDesk 调度通道亚临界拦截）验证通过');

// 正确调度：统治中枢弑君斩首（regicideCrisis: 90）引发割据分裂
const deskOk = WA.actionDesk.plan('history.evaluateEpochShift', {
  attritionCrisis: 70,
  epidemicCrisis: 60,
  regicideCrisis: 95,
  unrestCrisis: 85
});
assert.strictEqual(deskOk.ok, true, 'ActionDesk 调度严重危机突破阈值必须成功');
assert.strictEqual(deskOk.transitioned, true);
assert.strictEqual(deskOk.toEpoch, 'warlord_collapse', '弑君危机触发王朝瓦解军阀割据纪元');

console.log('✓ ActionDesk 历史突变调度闭环验证通过');
console.log('[Scenario 46] 多重危机共振与王朝崩溃/历史纪元跃迁专锁全部通过！');
