// WorldAxis tests/sys-defense-v2247.js (v2.247.0) — Release 1: 全向健康预检、双轨因果与去八股防线测试
'use strict';

global.window = global;
global.WorldAxis = global.WorldAxis || {};

require('../core/input-guard.js');
require('../core/settings-bus.js');
require('../engines/health-preflight.js');
require('../engines/narrative-deduction.js');

function runAll(a) {
  const textWithThink = '这是正常剧情。<think>这里是模型偷偷思考的过程</think>角色的回答。';
  const r1 = WorldAxis.healthPreflight.inspectAndSanitize(textWithThink);
  a(!r1.text.includes('<think>') && !r1.text.includes('</think>'), 'healthPreflight: 拦截并剔除 <think> 思考标签');
  a(r1.issues.some(i => i.id === 'leaked-think'), 'healthPreflight: 正确记录 leaked-think 问题');

  const textWithMacro = '你好 {{char}}，准备好了吗？';
  const r2 = WorldAxis.healthPreflight.inspectAndSanitize(textWithMacro);
  a(!r2.text.includes('{{char}}'), 'healthPreflight: 拦截并剔除 {{char}} 未展开宏');

  const textCliche = '他倒吸了一口凉气，仿佛时间在这一刻凝固了。';
  const r3 = WorldAxis.healthPreflight.inspectAndSanitize(textCliche);
  a(!r3.text.includes('倒吸了一口凉气'), 'healthPreflight: 替换倒吸凉气八股');
  a(!r3.text.includes('仿佛时间在这一刻凝固了'), 'healthPreflight: 替换时间凝固陈词滥调');

  const textUnbalanced = '他说：「这是一句没有结尾的话';
  const r4 = WorldAxis.healthPreflight.inspectAndSanitize(textUnbalanced);
  a(r4.text.endsWith('」'), 'healthPreflight: 自动闭合未成对的「直角引号');

  const sightConflict = {
    characters: [
      { name: '林安安', place: '图书馆' },
      { name: '林安安', place: '校门外小吃街' }
    ]
  };
  const r5 = WorldAxis.healthPreflight.checkSpatialConsistency(sightConflict);
  a(!r5.ok && r5.conflicts.length === 1, 'healthPreflight: 成功检出角色同轮次两处互斥位置分身矛盾');
  a(r5.conflicts[0].character === '林安安', 'healthPreflight: 冲突角色准确指认');

  const objectiveTruth = ['凶器藏在厨房水槽下方的暗格', '受害者死于中毒'];
  const actorKnown = ['受害者身上有奇异气味'];
  const claimPrivileged = '我刚才去厨房看过了，凶器藏在厨房水槽下方的暗格里！';
  const r6 = WorldAxis.narrativeDeduction.auditDualTrack({ name: '警探' }, claimPrivileged, actorKnown, objectiveTruth);
  a(!r6.ok && r6.privileged, 'narrativeDeduction: 拦截角色越权知晓尚未感知的客观真相（全知防穿帮）');

  const claimLegal = '受害者身上有奇异气味，我认为死因可能不寻常。';
  const r7 = WorldAxis.narrativeDeduction.auditDualTrack({ name: '警探' }, claimLegal, actorKnown, objectiveTruth);
  a(r7.ok && !r7.privileged, 'narrativeDeduction: 放行基于已获知线索的合法推论');

  const stallComp = WorldAxis.narrativeDeduction.compensateStall(4, { place: '钟楼密室' });
  a(stallComp && stallComp.triggered, 'narrativeDeduction: 调查停滞超过阈值自动触发补偿扰动');
  a(typeof stallComp.actionableGuidance === 'string' && stallComp.actionableGuidance.includes('钟楼密室'), 'narrativeDeduction: 补偿信息具有明确场景上下文指导');
}

function runNegative(a) {
  const textCliche = '他倒吸了一口凉气，仿佛时间在这一刻凝固了。';
  WorldAxis.healthPreflight.setSettings({ enabled: false });
  const rNeg1 = WorldAxis.healthPreflight.inspectAndSanitize(textCliche);
  a(rNeg1.text === textCliche, 'healthPreflight/N1: 禁用时原样返回文本，不执行过滤');
  WorldAxis.healthPreflight.setSettings({ enabled: true });

  const rNeg2 = WorldAxis.narrativeDeduction.compensateStall(1, { place: '走廊' });
  a(rNeg2 === null, 'narrativeDeduction/N2: 停滞轮数未达阈值时不产生额外扰动');
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (c, name) => { if (c) pass++; else { fail++; console.error('FAIL: ' + name); } };
  runAll(a);
  runNegative(a);
  console.log(`Summary: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

module.exports = { runAll, runNegative };
