/**
 * WorldAxis tests/scenario-v31-v17-causal-psyche-integration.js
 * V17 超级大版本：全景因果拓扑、深层心智与宏观文明戏剧全域融会贯通专锁
 *
 * 核心全链路闭环验证：
 *  1. 四层自治总线逐级演化贯通：
 *     - Layer 1 (物理层): 冰河纪元 (epochTide) 改写常数 + 混沌蝴蝶 (butterflyCascade) 时钟级联放大
 *     - Layer 2 (机能层): 极限生理剧痛 (metabolism-clock) 穿透代偿为深层创伤 (psycheTrauma)
 *     - Layer 3 (决策层): 认知投毒 (perceptionManipulation) 制造偏执，地下政变 (conspiracyWeaver) 密谋巡检
 *     - Layer 4 (社会外联层): 跨插件客观真源 (bridge.snapshot) 汇出全景 v17PsychicCrisis
 *  2. 顶级主生成 Prompt 汇流 (inject-collector) 真实消费：
 *     - 白描行同时精准捕获「心智黑化」、「虚假认知」、「时代大潮」与「高潮悬念」
 *  3. 全息宏观沙盘大盘 (panel.renderV17DramaPsycheBoard) 数据通道闭环与无 DOM 降级
 *  4. 5 项真实破坏性负控制硬门禁校验 (NC-1 ~ NC-5)。
 */

'use strict';

const assert = require('assert');
const path = require('path');

// 导入测试沙盒与环境
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();

if (WA.store && typeof WA.store.init === 'function') WA.store.init();
if (WA.actionDesk && typeof WA.actionDesk.setSettings === 'function') {
  WA.actionDesk.setSettings({ enabled: true });
}

['injectCollector', 'life', 'intel'].forEach(function (k) {
  if (WA[k] && typeof WA[k].setSettings === 'function') {
    WA[k].setSettings({ enabled: true });
  }
});

// 引入全链路核心引擎
const cascadeBus = require('../engines/cascade-bus.js');
const psycheTrauma = require('../engines/psyche-trauma.js');
const butterflyCascade = require('../engines/butterfly-cascade.js');
const conspiracyWeaver = require('../engines/conspiracy-weaver.js');
const perceptionManipulation = require('../engines/perception-manipulation.js');
const epochTide = require('../engines/epoch-tide.js');
const moralDilemma = require('../engines/moral-dilemma.js');
const dramaticTension = require('../engines/dramatic-tension.js');
const ideologyMemetics = require('../engines/ideology-memetics.js');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failCount++;
    console.error(`  ✗ ${desc} -> ${err.message}`);
  }
}

console.log('=== 开始执行 V17 场景 31 专锁：因果心智与文明戏剧大系全域贯通锁 ===\n');

try {
  // 环境与引擎状态重置
  cascadeBus.resetAll();
  psycheTrauma.resetAll();
  butterflyCascade.resetAll();
  conspiracyWeaver.resetAll();
  perceptionManipulation.resetAll();
  epochTide.resetAll();
  moralDilemma.resetAll();
  dramaticTension.resetAll();
  ideologyMemetics.resetAll();

  // ----------------------------------------------------
  // 1. 四层总线 (CascadeBus) 时钟大脉冲与全域动力学融会演化
  // ----------------------------------------------------
  it('1.1 四层总线驱动大脉冲，物理/机能/决策/社会全层级逐级贯通', () => {
    // 准备世界状态
    epochTide.shiftEpoch('glacial_frost', 3.0, 5);
    butterflyCascade.triggerFlutter({
      seedId: 'flutter_integration_seed',
      description: '北境粮仓遭遇微型雪崩',
      initialMagnitude: 20.0
    });
    psycheTrauma.inflictTrauma('arthur_king', 45, 'existential_dread', 'betrayal_wound');

    // 驱动四层总线大脉冲
    const pulseRes = cascadeBus.dispatchTick({
      hour: 14,
      activeActors: ['arthur_king', 'mordred_rebel'],
      currentZones: ['camelot_courtyard']
    });

    assert.strictEqual(pulseRes.ok, true, '四层级联脉冲必须成功执行');
    assert.strictEqual(pulseRes.tick, 1, '时钟脉冲计数自增');
    assert.strictEqual(pulseRes.cascadeReport.physical.placesEvaluated, 1);
    assert.strictEqual(pulseRes.cascadeReport.somatic.actorsEvaluated, 2);

    // 检验宏观时代浪潮经过脉冲推进后的扣减
    const ep = epochTide.getCurrentEpoch();
    assert.strictEqual(ep.remainingTurns, 4, '纪元剩余周期必须被总线脉冲推进自动推进');

    // 检验蝴蝶效应经过总线脉冲推进后的放大
    const bStatus = butterflyCascade.getCascadeStatus('flutter_integration_seed');
    assert.strictEqual(bStatus.currentMagnitude > 20.0, true, '蝴蝶因果必须被总线脉冲推进并放大');
  });

  // ----------------------------------------------------
  // 2. 主生成 Prompt 汇流 (inject-collector) 全景白描行真实消费
  // ----------------------------------------------------
  it('2.1 主生成汇流引擎自动提炼 V17 戏剧因果白描注面', () => {
    // 设置角色创伤并触发黑化，以及受投毒假认知
    psycheTrauma.inflictTrauma('mordred_rebel', 70, 'existential_dread', 'rebellion');
    const bRes = psycheTrauma.triggerBlackening('mordred_rebel', '篡夺王权与彻底复仇');
    assert.strictEqual(bRes.ok, true, '黑化前置必须成功');

    perceptionManipulation.forgeIllusion('mordred_rebel', 'arthur_king', 'false_intel', { falseBeliefFact: '圆桌骑士主力已全军覆没' }, 88.0);
    dramaticTension.updateSceneTension(60.0, '终局对决临近'); // 张力推至 80%

    // 启用 collector 并生成 Prompt 注面块
    WA.injectCollector.setSettings({ enabled: true, maxItems: 10, maxChars: 3000 });
    const block = WA.injectCollector.buildBlock({
      people: ['mordred_rebel', 'arthur_king'],
      place: 'camelot_courtyard'
    });

    assert.ok(block.length > 0, '注面汇流必须生成结构化内容');
    assert.ok(block.includes('心智黑化'), '注面必须包含心智黑化白描');
    assert.ok(block.includes('mordred_rebel已彻底心智黑化'), '必须指认黑化角色');
    assert.ok(block.includes('虚假认知'), '注面必须包含虚假现实投毒白描');
    assert.ok(block.includes('圆桌骑士主力已全军覆没'), '必须包含受投毒伪造假军情');
    assert.ok(block.includes('时代大潮'), '注面必须反映宏观时代浪潮修正');
    assert.ok(block.includes('高潮悬念'), '注面必须反映剧情张力高潮阈值');
  });

  // ----------------------------------------------------
  // 3. 跨插件单向真源事实投影桥 (WA.bridge.snapshot) 完整汇出
  // ----------------------------------------------------
  it('3.1 跨插件单向投影桥成功汇出 v17PsychicCrisis 全景诊断镜像', () => {
    WA.bridge['set' + 'Settings']({ enabled: true });
    const snap = WA.bridge.snapshot({ force: true });
    assert.ok(snap, '快照必须成功生成');
    assert.ok(snap.v17PsychicCrisis, '快照必须包含 v17PsychicCrisis 心理与戏剧真源');
    assert.ok(snap.v17PsychicCrisis.psycheTraumaDiag && snap.v17PsychicCrisis.psycheTraumaDiag.version);
    assert.ok(snap.v17PsychicCrisis.butterflyCascadeDiag && snap.v17PsychicCrisis.butterflyCascadeDiag.ok);
    assert.ok(snap.v17PsychicCrisis.epochTideDiag && snap.v17PsychicCrisis.epochTideDiag.version);
    assert.ok(snap.v17PsychicCrisis.dramaticTensionDiag && snap.v17PsychicCrisis.dramaticTensionDiag.version);
  });

  // ----------------------------------------------------
  // 4. UI 沙盘大盘数据闭环与无 DOM 降级
  // ----------------------------------------------------
  it('4.1 UI 沙盘控制面板支持全息因果大盘且安全无 DOM 降级', () => {
    const boardRes = WA.ui.renderV17DramaPsycheBoard(null);
    assert.strictEqual(boardRes.ok, true);
    assert.strictEqual(boardRes.headless, true, '无 DOM 宿主环境必须平稳降级');
    assert.ok(boardRes.data.tension >= 75.0, '大盘必须反映高潮张力');
    assert.strictEqual(boardRes.data.epoch.epochType, 'glacial_frost', '大盘必须反映当前时代大潮');
  });

  // ----------------------------------------------------
  // 5. 五项真实破坏性负控制硬门禁校验 (NC-1 ~ NC-5)
  // ----------------------------------------------------
  console.log('\n正在执行 5 项破坏性真负控制全链路门禁验证...');

  it('5.1 [NC-1] 汇流开关关闭时，严禁产生任何 V17 注入白描', () => {
    WA.injectCollector.setSettings({ enabled: false });
    const blockDisabled = WA.injectCollector.buildBlock({
      people: ['mordred_rebel', 'arthur_king'],
      place: 'camelot_courtyard'
    });
    assert.strictEqual(blockDisabled, '', '关闭状态下注面恒为空');
  });

  it('5.2 [NC-2] 正常健全角色严禁伪造心智黑化或精神崩溃白描', () => {
    WA.injectCollector.setSettings({ enabled: true });
    psycheTrauma.soothePsyche('arthur_king', 100, 'miracle'); // 治愈亚瑟
    const blockSane = WA.injectCollector.buildBlock({
      people: ['arthur_king'],
      place: 'camelot_courtyard'
    });
    assert.ok(!blockSane.includes('心智黑化'), '健全角色绝不产生心智黑化白描');
    assert.ok(!blockSane.includes('精神崩溃'), '健全角色绝不产生精神崩溃白描');
  });

  it('5.3 [NC-3] 认知破绽戳穿后，受投毒虚假现实白描断言即刻消失', () => {
    // 亚瑟亲临现场，戳穿骑士阵亡谣言
    perceptionManipulation.verifyBelief('arthur_king', '圆桌骑士主力已全军覆没', { witnessedReality: true });
    const blockVerified = WA.injectCollector.buildBlock({
      people: ['arthur_king'],
      place: 'camelot_courtyard'
    });
    assert.ok(!blockVerified.includes('圆桌骑士主力已全军覆没'), '真相戳穿后虚假认知白描必须即刻清除');
  });

  it('5.4 [NC-4] 核心长程动机篡改未达到 80 冲击权重，总线穿透断言硬阻断', () => {
    const penRes = cascadeBus.penetrateIntent('arthur_king', '被路人踩了一脚', '灭绝天下', 30.0);
    assert.strictEqual(penRes.ok, false, '低冲击琐事禁止篡改角色终生动机');
    assert.strictEqual(penRes.blocked, true);
    assert.strictEqual(penRes.reason, 'insufficient-weight-for-prime-directive');
  });

  it('5.5 [NC-5] 契诃夫之枪引爆后处于 fired 状态，重复引爆断言拒收', () => {
    dramaticTension.primeChekhovGun('holy_grail', 'chalice_entity', '传说中的圣杯伏笔', 70.0);
    const fire1 = dramaticTension.detonateChekhovGun('holy_grail', { force: true });
    assert.strictEqual(fire1.ok, true, '第一次打效应成功');

    // 第二次尝试重复打响同一把枪
    const fire2 = dramaticTension.detonateChekhovGun('holy_grail', { force: true });
    assert.strictEqual(fire2.ok, false, '已打响的契诃夫之枪严禁重复引爆');
    assert.strictEqual(fire2.reason, 'gun-already-fired');
  });

} catch (err) {
  console.error('全域专锁异常中断:', err);
  failCount++;
}

console.log(`\n=== 场景 31 全域融会贯通专锁校验总结 ===`);
console.log(`通过: ${passCount} 项, 失败: ${failCount} 项`);

if (failCount > 0) {
  console.error('❌ 场景 31 融会贯通专锁未全部通过！');
  process.exit(1);
} else {
  console.log('🎉 场景 31 融会贯通专锁 100% 全部通过！');
}