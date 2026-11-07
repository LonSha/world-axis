/**
 * WorldAxis tests/test-intimate-arbiter.js
 * 针对 intimate-arbiter 亲密生理物理弹性仲裁器的单元测试（含意外、中断与极端解剖）
 */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const arbiterSrc = fs.readFileSync(path.join(__dirname, '../engines/intimate-arbiter.js'), 'utf8');
const sandbox = { window: { WorldAxis: {} }, console: console };
vm.createContext(sandbox);
vm.runInContext(arbiterSrc, sandbox);

const Arbiter = sandbox.window.WorldAxis.intimateArbiter;
assert.ok(Arbiter, 'intimateArbiter 应该成功暴露在 WorldAxis 总线上');

console.log('--- 开始 intimate-arbiter 生理与物理弹性仲裁测试 ---');

// 1. 缺省安全自愈测试
const defaultState = Arbiter.ensureIntimateState(null);
assert.strictEqual(defaultState.cavity, 'vaginal');
assert.strictEqual(defaultState.lubrication, 0.5);
assert.strictEqual(defaultState.relaxation, 0.6);
console.log('✓ 缺省自愈测试通过');

// 2. 解剖几何与延展计算测试
const geoNormal = Arbiter.calculateGeometry('vaginal', { length: 14.0, diameter: 3.2 }, 50, []);
assert.ok(geoNormal.dAct > 9.5, '兴奋延展后有效深度应大于常态 baseline');
assert.strictEqual(geoNormal.caliberCategory, 'tight');
console.log(`✓ 几何解剖计算测试通过: 常态9.5 -> 延展${geoNormal.dAct}cm, 宫颈深延${geoNormal.cervicalOverhang}cm`);

// 3. 突发意外：外部打断测试（脚步声强制中止）
const interruptState = Arbiter.ensureIntimateState({ arousal: 60.0 });
const resInterrupt = Arbiter.arbitrateIntimacy(interruptState, null, {
  externalDisturbance: true,
  externalDisturbanceReason: '门外走廊传来脚步声'
});
assert.strictEqual(resInterrupt.interrupted, true);
assert.strictEqual(resInterrupt.slipOut, true);
assert.ok(resInterrupt.nextState.relaxation < 0.3, '受惊扰后肌肉应紧绷');
console.log('✓ 突发意外（外部惊扰强制中断）测试通过');

// 4. 生理意外：干涩与心理紧绷导致快感骤降测试
const dryState = Arbiter.ensureIntimateState({ lubrication: 0.1, relaxation: 0.2, pleasure: 10.0 });
const resDry = Arbiter.arbitrateIntimacy(dryState, { length: 13.0, diameter: 3.2 }, {});
assert.ok(resDry.nextState.pleasure - 10.0 < 5.0, '干涩紧绷状态下快感应大幅受阻');
assert.ok(resDry.feedback.includes('润滑不足'), '反馈应明确指出干涩痛感');
console.log('✓ 生理意外（润滑不足快感折损）测试通过');

// 5. 极端意外：超限口径触发自卫痉挛推拒
const extremeState = Arbiter.ensureIntimateState({ relaxation: 0.4 });
const resSpasm = Arbiter.arbitrateIntimacy(extremeState, { length: 18.0, diameter: 5.8 }, {});
assert.strictEqual(resSpasm.spasmDefense, true, '超限口径必须触发自卫痉挛');
assert.ok(resSpasm.feedback.includes('强烈痉挛'), '反馈应标明腹肌与盆底痉挛自卫');
console.log('✓ 极端意外（超限口径自卫痉挛推拒）测试通过');

// 6. 特殊异形：犬科膨大锁结卡死闭锁（Knotting Lock）
const knotState = Arbiter.ensureIntimateState({ arousal: 80, lubrication: 0.8 });
const resKnot = Arbiter.arbitrateIntimacy(knotState, { length: 15.0, diameter: 3.5, shape: 'knot', knotEngaged: true }, {});
assert.ok(resKnot.nextState.lockedState && resKnot.nextState.lockedState.locked, '锁结应成功卡死嵌顿');
assert.ok(resKnot.feedback.includes('强力闭锁嵌顿'));
console.log('✓ 特殊生理（锁结卡死嵌顿）测试通过');

// 7. 高潮与体能耐力结算测试
const highPleasureState = Arbiter.ensureIntimateState({ pleasure: 85.0, lubrication: 0.9, relaxation: 0.9 });
const resOrgasm = Arbiter.arbitrateIntimacy(highPleasureState, { length: 14.0, diameter: 3.2 }, {});
assert.strictEqual(resOrgasm.orgasmTriggered, true, '快感突破临界应触发绝顶高潮');
assert.strictEqual(resOrgasm.nextState.orgasmCount, 1);
assert.strictEqual(resOrgasm.nextState.pleasure, 20.0, '高潮后应回落至余韵');
console.log('✓ 快感积分与绝顶高潮触发测试通过');

// 8. 异种/魅魔体质宽容测试
const succubusGeo = Arbiter.calculateGeometry('vaginal', { length: 18.0, diameter: 5.8 }, 60, ['succubus']);
assert.strictEqual(succubusGeo.isNonHuman, true);
assert.ok(succubusGeo.dAct > 14.0, '非人异种体质延展应显著超越人类基准');
console.log('✓ 异种/魅魔体质弹性宽容测试通过');

// 9. Prompt 注入文本测试
const prompt = Arbiter.buildBlock(resKnot.nextState, '测试角色');
assert.ok(prompt.includes('【测试角色·亲密生理与物理状态】'));
assert.ok(prompt.includes('物理锁死'));
console.log('✓ 亲密状态提示词注入构建测试通过');

console.log('=== intimate-arbiter 全部测试通过！===');