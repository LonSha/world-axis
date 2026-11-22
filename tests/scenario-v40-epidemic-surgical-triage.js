'use strict';
/**
 * WorldAxis tests/scenario-v40-epidemic-surgical-triage.js
 * 场景 40：封闭客栈瘟疫爆发隔离与外科缝合急救专锁 (EXV19-2 + EXV19-3 + OPV19-2)
 *
 * 验收旅程：
 * 1. 龙门客栈突发高危伤寒疫病（propagateDisease），初始未封控传播指数 Re=2.8，感染蔓延；
 * 2. 驻店医官下达严格防疫检疫令（quarantineRate 0.85，煮水消毒），Re 骤降至 0.35 阻断传播链；
 * 3. 设立独立密封隔离单间（isolateSubject），验证隔离受试者绝对不受外界飞沫感染；
 * 4. 突发江湖恶斗：侠客腹部遭重创破裂（admitPatient，失血度 85，大出血高危）；
 * 5. 外科急救工序：止血带动脉加压（tourniquet）降失血 -> 无菌清创（debridement）降感染 -> 穿针分层缝合（suture）-> 正骨夹板（splint）；
 * 6. 联动战术交锋与行囊耗材扣减（linkInventoryAttrition，OPV19-2）；
 * 7. 4 项真实破坏性负控制门禁测试（100% 严正拦截与受控反噬）。
 */

const assert = require('assert');
const path = require('path');

// 导入统一测试沙盒环境
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

// 加载被测生产引擎
require('../engines/epidemic-contagion.js');
require('../engines/surgical-triage.js');
require('../engines/tactical-combat.js');

console.log('[Scenario 40] 开始执行封闭客栈瘟疫爆发隔离与外科缝合急救专锁测试...');

// 开启总开关
WA.epidemicContagion.setSettings({ enabled: true });
WA.surgicalTriage.setSettings({ enabled: true });

// 1. 封闭客栈突发疫病
const initOutbreak = WA.epidemicContagion.propagateDisease('dragon_gate_inn', {
  diseaseName: '黑水伤寒',
  vector: 'airborne',
  totalPopulation: 80,
  initialInfectious: 4,
  initialExposed: 8,
  r0: 3.2
});
assert.strictEqual(initOutbreak.ok, true, '疫病爆发应当成功立项');
assert.strictEqual(initOutbreak.effectiveR >= 3.0, true, '无防疫干预时传播指数应处于高位');

// 2. 医官下达严格隔离与煮水检疫令
const controlled = WA.epidemicContagion.propagateDisease('dragon_gate_inn', {
  quarantineRate: 0.9,
  waterBoiled: true,
  masked: true
});
assert.strictEqual(controlled.ok, true, '检疫干预应当成功推进');
assert.strictEqual(controlled.effectiveR < 1.0, true, '强力封控与面罩后 Re 必须压制至 1.0 以下');

// 3. 设立严密密封隔离单间
const isoRes = WA.epidemicContagion.isolateSubject('dragon_gate_inn', 'scholar_lu', true);
assert.strictEqual(isoRes.ok, true, '设立气密隔离室应当成功');
assert.strictEqual(isoRes.protected, true, '密封隔离室必须处于受保护状态');

const infectionCheck = WA.epidemicContagion.checkSubjectInfection('dragon_gate_inn', 'scholar_lu');
assert.strictEqual(infectionCheck.infected, false, '密封隔离者绝对不发生无源飞沫感染');
assert.strictEqual(infectionCheck.immuneReason, 'hermetic-isolation-barrier-active');

// 4. 重创伤员急救接诊
const admitRes = WA.surgicalTriage.admitPatient('swordsman_yan', {
  traumaType: 'laceration',
  bleeding: 85, // 动脉喷射大出血
  infectionRisk: 40,
  stability: 45
});
assert.strictEqual(admitRes.ok, true, '急救接诊应当成功');
assert.strictEqual(admitRes.patient.inShock, true, '重度失血应被判定为休克危象');

// 5. 外科四阶规范处置闭环
// 步骤一：止血带加压止血
const tqRes = WA.surgicalTriage.performSurgery({
  patientId: 'swordsman_yan',
  procedure: 'tourniquet',
  surgeonSkill: 80
});
assert.strictEqual(tqRes.ok, true, '上止血带应当成功');
assert.strictEqual(tqRes.bleeding < 80, true, '止血带应显著降低失血度');
assert.strictEqual(tqRes.inShock, false, '失血降低后休克危象解除');

// 步骤二：无菌清创除腐
const debRes = WA.surgicalTriage.performSurgery({
  patientId: 'swordsman_yan',
  procedure: 'debridement',
  isSterile: true
});
assert.strictEqual(debRes.ok, true, '无菌清创应当成功');
assert.strictEqual(debRes.infectionRisk <= 15, true, '无菌清创应显著消减感染风险');
assert.strictEqual(debRes.hasSepsis, false, '未发生败血症');

// 步骤三：穿针缝合闭口
const sutRes = WA.surgicalTriage.performSurgery({
  patientId: 'swordsman_yan',
  procedure: 'suture'
});
assert.strictEqual(sutRes.ok, true, '分层缝合应当成功');
assert.strictEqual(sutRes.stability >= 75, true, '缝合后患者生命体征显著稳定');

// 步骤四：夹板正骨固定
const splRes = WA.surgicalTriage.performSurgery({
  patientId: 'swordsman_yan',
  procedure: 'splint'
});
assert.strictEqual(splRes.ok, true, '夹板固定应当成功');
assert.strictEqual(splRes.isSplinted, true);

// 6. 战术碰撞损耗联动 (OPV19-2)
const combatAttr = WA.tacticalCombat.linkInventoryAttrition('swordsman_yan', {
  action: 'strike',
  parried: true,
  zone: 'torso'
});
assert.strictEqual(combatAttr.ok, true, '战术碰撞与行囊联动应当成功');
assert.strictEqual(combatAttr.durabilityLoss, 15, '招架应造成武器护具耐久磨损');

// ─────────────────────────────────────────────────────────────
// 7. 4 项真实破坏性负控制门禁
console.log('[Scenario 40] 验证 4 项真实破坏性负控制门禁...');

// 负控制 1：大出血（bleeding >= 80）未止血强行动刀缝合/清创，必当场拒绝并判定休克危机加剧
WA.surgicalTriage.admitPatient('bleeding_victim', { bleeding: 90, stability: 30 });
const recklessSuture = WA.surgicalTriage.performSurgery({
  patientId: 'bleeding_victim',
  procedure: 'suture'
});
assert.strictEqual(recklessSuture.ok, false, '大出血未止血强行缝合必须被拦截拒绝');
assert.strictEqual(recklessSuture.refusal, 'uncontrolled-hemorrhage-stabilization-required');
assert.strictEqual(recklessSuture.inShock, true);

// 负控制 2：污浊非无菌环境中强行深入清创，直接引发化脓败血症 (sepsis)
WA.surgicalTriage.admitPatient('dirty_wound_patient', { bleeding: 40, infectionRisk: 70 });
const septicDeb = WA.surgicalTriage.performSurgery({
  patientId: 'dirty_wound_patient',
  procedure: 'debridement',
  isSterile: false
});
assert.strictEqual(septicDeb.ok, true, '虽然清创执行但产生恶化后果');
assert.strictEqual(septicDeb.hasSepsis, true, '污浊环境清创必须触发败血症 (sepsis)');

// 负控制 3：无传染源与输入病原时（initialInfectious=0 & initialExposed=0）强行发起疫情必须被拒
const ghostEpidemic = WA.epidemicContagion.propagateDisease('clean_valley', {
  initialInfectious: 0,
  initialExposed: 0
});
assert.strictEqual(ghostEpidemic.ok, false, '无源疫情必须被拒');
assert.strictEqual(ghostEpidemic.refusal, 'no-source-zero-contagion');

// 负控制 4：未参与交锋（无动作与命中判定）时调用战术损耗联动被拒
const ghostClash = WA.tacticalCombat.linkInventoryAttrition('swordsman_yan', {});
assert.strictEqual(ghostClash.ok, false, '非交锋数据不可损耗耐久');
assert.strictEqual(ghostClash.refusal, 'no-clash-no-attrition');

console.log('[Scenario 40] 场景 40 全链路断言与 4 项破坏性负控制门禁全量通过！PASS');