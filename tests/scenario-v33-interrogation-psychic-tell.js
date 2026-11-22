/**
 * tests/scenario-v33-interrogation-psychic-tell.js
 * V18 场景 33 专锁：大堂公审物证击穿与决堤式招供专锁
 *
 * 验证目标：
 *  1. 审讯攻防策略（present_evidence, expose_contradiction, intimidation, empathy）真实演进；
 *  2. 心理抵抗意志（mentalDefiance）与心压（deceptionStress）的相态转变（denial -> wavering -> full_confession）；
 *  3. 生理微表情破绽外溢（pupil_dilation, cold_sweat, gaze_aversion 等 tells）；
 *  4. 真实破坏性负控制硬门禁：无凭无据凭空出示物证断言拒收、已全盘招供案犯禁止重复施压。
 */
'use strict';
const assert = require('assert');

// 导入测试沙盒与环境
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();

if (WA.store && typeof WA.store.init === 'function') WA.store.init();
if (WA.actionDesk && typeof WA.actionDesk.setSettings === 'function') {
  WA.actionDesk.setSettings({ enabled: true });
}

const interrogationTell = require('../engines/interrogation-tell.js');
WA.interrogationTell = interrogationTell;

console.log('=== 开始执行 V18 场景 33 专锁：大堂公审物证击穿与决堤式招供 ===');

// 1. 初始化审讯对象
WA.interrogationTell.resetAll();
WA.interrogationTell.registerSuspect('corrupt_official_zhang', {
  mentalDefiance: 100,
  deceptionStress: 10,
  stoicLevel: 30,
  crimeCommitted: '贪墨十万两赈灾纹银并买凶灭口'
});

// 2. 负控制验证 [NC-1]：空头出示物证（无物证名或无确凿依据），断言直接拒绝
console.log('正在执行负控制 [NC-1]：凭空出示虚无物证断言拒收门禁...');
const emptyEvidence = WA.interrogationTell.pressInquest({
  suspectId: 'corrupt_official_zhang',
  tactic: 'present_evidence',
  evidenceName: '',
  evidenceWeight: 0
});
assert.strictEqual(emptyEvidence.ok, false);
assert.strictEqual(emptyEvidence.reason, 'unsubstantiated-bluff-refused');
console.log('  ✓ [NC-1] 虚无物证拒收门禁通过！');

// 3. 正向链路 1：出示沾血密信铁证 (present_evidence)，引爆微表情冷汗与眼神闪躲
console.log('正在验证正向流程 1：出示确凿物证击穿初步心防...');
const round1 = WA.actionDesk.plan('interrogate.pressInquest', {
  suspectId: 'corrupt_official_zhang',
  tactic: 'present_evidence',
  evidenceName: '沾血买凶密信与盖印账册',
  pressurePower: 40
});
assert.strictEqual(round1.ok, true);
assert(round1.stressGain > 0, '心压必须激增');
assert(round1.defianceLoss > 0, '抵抗意志被削减');
assert(round1.tellObserved !== null, '必须触发微表情外溢');
assert.strictEqual(round1.tellObserved.tell, 'cold_sweat');
assert.strictEqual(round1.newStatus, 'wavering', '初步击溃进入动摇');
console.log('  ✓ 确凿物证施压成功，微表情外溢检出：', round1.tellObserved.tell);

// 4. 正向链路 2：戳穿供词时间线矛盾 (expose_contradiction)，状态跌入部分招供
console.log('正在验证正向流程 2：戳穿时间线不在场谎言...');
const round2 = WA.actionDesk.plan('interrogate.pressInquest', {
  suspectId: 'corrupt_official_zhang',
  tactic: 'expose_contradiction',
  contradictionDetail: '声称当夜在驿馆独酌，但更夫亲见其在账房杀人焚卷',
  pressurePower: 45
});
assert.strictEqual(round2.ok, true);
assert(round2.newStatus === 'wavering' || round2.newStatus === 'partial_admission');
console.log('  ✓ 供词矛盾戳穿成功，案犯陷入心虚动摇！');

// 5. 正向链路 3：共情利益诱导赦免连坐 (empathy)，心理彻底崩溃全盘招供 (full_confession)
console.log('正在验证正向流程 3：共情利益瓦解，决堤式全盘招供...');
const round3 = WA.actionDesk.plan('interrogate.pressInquest', {
  suspectId: 'corrupt_official_zhang',
  tactic: 'empathy',
  persuasionPower: 90,
  confessionDraft: '是我指使管家买凶灭口，账册皆被我埋于后堂枯井！'
});
assert.strictEqual(round3.ok, true);
assert.strictEqual(round3.newStatus, 'full_confession', '案犯心理防线全线失守');
const finalSuspect = WA.interrogationTell.getSuspect('corrupt_official_zhang');
assert(finalSuspect.confessionText.includes('后堂枯井'), '口供必须完整呈现罪行真源');
console.log('  ✓ 心理防线全线失守，全盘如实招供：', finalSuspect.confessionText);

// 6. 负控制验证 [NC-2]：案犯已全盘招供后，再次强行逼供断言拒收
console.log('正在执行负控制 [NC-2]：案犯已决堤招供后禁止重复审讯逼供...');
const redundantInquest = WA.interrogationTell.pressInquest({
  suspectId: 'corrupt_official_zhang',
  tactic: 'intimidation'
});
assert.strictEqual(redundantInquest.ok, false);
assert.strictEqual(redundantInquest.reason, 'already-fully-confessed');
console.log('  ✓ [NC-2] 已全盘招供禁止重复审讯门禁验证通过！');

console.log('=== 场景 33 专锁校验总结 ===');
console.log('通过: 6 项断言 (含 2 项真负控制门禁), 失败: 0 项');