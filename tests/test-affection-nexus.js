/**
 * WorldAxis tests/test-affection-nexus.js
 * 针对 affection-nexus 关系与心理动态中枢的单元测试（含柔性、意外与边缘用例）
 */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const nexusSrc = fs.readFileSync(path.join(__dirname, '../engines/affection-nexus.js'), 'utf8');
const sandbox = { window: { WorldAxis: {} }, console: console };
vm.createContext(sandbox);
vm.runInContext(nexusSrc, sandbox);

const Nexus = sandbox.window.WorldAxis.affectionNexus;
assert.ok(Nexus, 'affectionNexus 应该成功暴露在 WorldAxis 总线上');

console.log('--- 开始 affection-nexus 心理与关系中枢测试 ---');

// 1. 缺省自愈测试
const emptyRec = Nexus.ensureRecord(null);
assert.strictEqual(emptyRec.fondness, 0.0);
assert.strictEqual(emptyRec.track, 'independent');
assert.strictEqual(emptyRec.currentLatch, 0);
console.log('✓ 缺省自愈测试通过');

// 2. 锁内微波浮动测试（好感在 19.0 阈值前拉扯，不僵化卡死，且不超过 19.0）
let rec = Nexus.ensureRecord({ fondness: 15.0 });
let res = Nexus.evolveAffection(rec, 10.0, { turn: 1 });
assert.strictEqual(res.locked, true, '应触发锁阻断');
assert.ok(res.nextRecord.fondness < 19.0, '好感不可硬性突破 19.0 门槛');
assert.ok(res.nextRecord.fondness >= 16.5, '好感应在锁内微波拉扯区间');
console.log(`✓ 锁内微波浮动测试通过: 申请+10后稳定在 ${res.nextRecord.fondness}`);

// 3. 突发破锁测试（重大危机生死契合，豁免 2 次进度要求）
res = Nexus.evolveAffection(res.nextRecord, 10.0, { emergentBreak: true, reason: '绝命救援', turn: 2 });
assert.strictEqual(res.eventTriggered, 'EMERGENT_BREAKTHROUGH');
assert.strictEqual(res.nextRecord.currentLatch, 1, '应突破第1道锁');
assert.ok(res.nextRecord.fondness >= 19.0, '突破锁后好感跨越防线');
console.log('✓ 突发破锁（豁免机制）测试通过');

// 4. 背叛跌破与防御壁垒反弹测试（Latch Fallthrough）
const betrayalRes = Nexus.evolveAffection(res.nextRecord, 0, { betrayal: true, turn: 3 });
assert.strictEqual(betrayalRes.eventTriggered, 'BETRAYAL_COLLAPSE');
assert.strictEqual(betrayalRes.nextRecord.currentLatch, 0, '重大背叛后锁位应跌破退回');
assert.ok(betrayalRes.nextRecord.defenses.rationality >= 0.9, '理性防线应大幅反弹');
assert.ok(betrayalRes.nextRecord.fondness < 0, '好感应暴跌跌入负值');
console.log('✓ 背叛跌破与心智崩塌测试通过');

// 5. 端水和稀泥惩罚测试
let waterRec = Nexus.ensureRecord({ fondness: 25.0 });
let wRes1 = Nexus.evolveAffection(waterRec, 10.0, { waterHolding: true });
let wRes2 = Nexus.evolveAffection(wRes1.nextRecord, 10.0, { waterHolding: true });
assert.ok(wRes2.nextRecord.crossFireState.waterHoldingPenalty >= 2, '端水累积惩罚应递增');
assert.ok(wRes2.appliedDelta < wRes1.appliedDelta, '多次端水后好感增长应显著递减衰退');
console.log('✓ 主角端水惩罚与纵向反弹测试通过');

// 6. 独立轨与伴侣轨双向流转及修罗场开火仲裁
let charA = Nexus.ensureRecord({ fondness: 65.0, track: 'partner' });
let charB = Nexus.ensureRecord({ fondness: 55.0, track: 'partner' });

// 伴侣轨同场争风：应触发 Ⅱ 级宣誓主权
let cfRes = Nexus.arbitrateCrossFire(charA, charB, { playerIntimacyWithRival: 15.0 });
assert.strictEqual(cfRes.alertLevel, 2);
assert.strictEqual(cfRes.lateralAction, 'TERRITORY_CLAIM');
assert.ok(cfRes.longitudinalPenalty > 0, '端水惩罚必须大于0');

// 切换为独立轨后：清退警报与争宠
let switchRes = Nexus.switchTrack(charA, 'independent', '专职战术顾问');
assert.strictEqual(switchRes.record.track, 'independent');
let cfResIndep = Nexus.arbitrateCrossFire(switchRes.record, charB, { playerIntimacyWithRival: 15.0 });
assert.strictEqual(cfResIndep.alertLevel, 0);
assert.strictEqual(cfResIndep.lateralAction, 'NONE');
console.log('✓ 轨迹流转与修罗场双向开火仲裁测试通过');

// 7. Prompt 构建测试
const block = Nexus.buildBlock(charA, '测试角色');
assert.ok(block.includes('【测试角色·心理与情感中枢】'));
console.log('✓ 提示词构建器测试通过');

console.log('=== affection-nexus 全部测试通过！===');
