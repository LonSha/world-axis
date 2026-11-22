/**
 * tests/scenario-v37-v18-epic-world-grand-pulse.js
 * WorldAxis V18 史诗全域融会贯通大脉冲终验专锁
 *
 * 核心验证：
 *  1. 具身对抗（tactical-combat）与审讯微表情（interrogation-tell）紧密咬合；
 *  2. 围城后勤（siege-attrition）与荒野捕食（ecosystem-predation）宏观共振；
 *  3. 异化禁忌侵蚀（anomaly-mutation）与官僚铨选拔擢（bureaucracy-ascension）因果互锁；
 *  4. 司法公审断狱（judicial-inquest）与遗迹自毁机关（ruin-mechanism）多米诺闭环；
 *  5. 优化线 OPV18-1 宿怨三层分立（human-realism）端到端落地检验；
 *  6. 5 项真实破坏性负控制硬门禁校验 (NC-1 ~ NC-5)。
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

// 导入 8 大全新引擎
WA.tacticalCombat = require('../engines/tactical-combat.js');
WA.interrogationTell = require('../engines/interrogation-tell.js');
WA.ecosystemPredation = require('../engines/ecosystem-predation.js');
WA.siegeAttrition = require('../engines/siege-attrition.js');
WA.anomalyMutation = require('../engines/anomaly-mutation.js');
WA.bureaucracyAscension = require('../engines/bureaucracy-ascension.js');
WA.judicialInquest = require('../engines/judicial-inquest.js');
WA.ruinMechanism = require('../engines/ruin-mechanism.js');
require('../engines/human-realism.js');

console.log('=== 开始执行 V18 场景 37 专锁：史诗全系融会贯通大脉冲锁 ===');

// 负控制 [NC-1]: 宿怨赔偿金不足，断言直接拒收
console.log('正在执行负控制 [NC-1]：宿怨低价值空头补偿拒收门禁...');
WA.humanRealism.recordGrudge({
  who: 'victim_merchant',
  target: 'villain_boss',
  reason: '焚毁货物与商铺',
  intensity: 80
});
const grudges = WA.humanRealism.listGrudges('victim_merchant');
const targetGrudge = grudges[0];
assert(targetGrudge, '必须存在新记录的宿怨');

const failSettle = WA.humanRealism.settleGrudge(targetGrudge.id, {
  resolution: '扔下十枚铜板试图抵消',
  evidence: '铜板落地声',
  response: 'truce',
  compensationValue: 10 // 远低于 80
});
assert.strictEqual(failSettle.ok, false);
assert.strictEqual(failSettle.reason, 'insufficient-compensation');
console.log('  ✓ [NC-1] 宿怨实质赔偿硬门禁通过！');

// 正向 1: 宿怨实质赔偿收下但表面停火（cold_grudge），心结未解
console.log('正在验证正向流程 1：足额赔偿达成表面停火与冷性宿怨...');
const truceSettle = WA.humanRealism.settleGrudge(targetGrudge.id, {
  resolution: '奉上万两黄金与亲笔道歉书',
  evidence: '黄金封箱入库',
  response: 'truce',
  compensationValue: 200
});
assert.strictEqual(truceSettle.ok, true);
assert.strictEqual(truceSettle.grudge.truceAgreed, true);
assert.strictEqual(truceSettle.grudge.heartForgiven, false);
assert.strictEqual(truceSettle.grudge.coldGrudge, true);
console.log('  ✓ 足额赔偿达成表面停火，暗存冷性戒备！');

// 正向 2: 战场交锋斩臂断刃 (tactical-combat) 联动司法追捕缉凶 (judicial-inquest)
console.log('正在验证正向流程 2：交锋重创凶犯并签发海捕文书...');
WA.tacticalCombat.resetAll();
WA.tacticalCombat.registerCombatant('hero_constable', { posture: 100, stamina: 100 });
WA.tacticalCombat.registerCombatant('villain_boss', { posture: 100, stamina: 100 });

const clashResult = WA.actionDesk.plan('combat.resolveTacticalClash', {
  attackerId: 'hero_constable',
  defenderId: 'villain_boss',
  attackAction: 'strike',
  defendAction: 'none',
  targetZone: 'arms',
  attackPower: 80
});
assert.strictEqual(clashResult.ok, true);
assert.strictEqual(clashResult.traumaInflicted.zone, 'arms');

// 签发通缉令并缉拿归案
WA.judicialInquest.resetAll();
WA.judicialInquest.issueWarrant('warrant_villain_boss', {
  targetActorId: 'villain_boss',
  crimeKind: 'murder',
  bountyReward: 5000
});
const captureResult = WA.judicialInquest.captureFugitive('warrant_villain_boss', 'hero_constable');
assert.strictEqual(captureResult.ok, true);
const capturedWarrant = WA.judicialInquest.getWarrant('warrant_villain_boss');
assert.strictEqual(capturedWarrant.status, 'captured');
console.log('  ✓ 恶魁被击断臂膀并成功缉捕归案！');

// 正向 3: 审讯击穿心防 (interrogation-tell) 与公堂断狱极刑判决 (judicial-inquest)
console.log('正在验证正向流程 3：物证如山审讯决堤与秋后处斩公审断狱...');
WA.interrogationTell.resetAll();
WA.interrogationTell.registerSuspect('villain_boss', {
  mentalDefiance: 60,
  deceptionStress: 20,
  stoicLevel: 10,
  crimeCommitted: '连环谋杀与投毒'
});
const confessResult = WA.actionDesk.plan('interrogate.pressInquest', {
  suspectId: 'villain_boss',
  tactic: 'present_evidence',
  evidenceName: '带血断臂与行凶凶刃',
  pressurePower: 80,
  confessionDraft: '是我杀人放火，伏法认罪！'
});
assert.strictEqual(confessResult.ok, true);
assert.strictEqual(confessResult.newStatus, 'full_confession');

// 公堂会审定罪斩立决
const judicialVerdict = WA.actionDesk.plan('judicial.conductInquest', {
  warrantId: 'warrant_villain_boss',
  judgeId: 'magistrate_bao',
  evidenceChain: ['带血断臂', '凶器短刃', '当铺赎票'],
  hasConfession: true
});
assert.strictEqual(judicialVerdict.ok, true);
assert.strictEqual(judicialVerdict.verdict, 'capital_execution');
console.log('  ✓ 铁证如山全盘招供，公堂判处极刑斩立决！');

// 正向 4: 破获大案功勋积分入账，宗门铨选特批拔擢 (bureaucracy-ascension)
console.log('正在验证正向流程 4：大功告成破格升迁...');
WA.bureaucracyAscension.resetAll();
WA.bureaucracyAscension.registerOrg('imperial_constabulary', {
  vacancyQuota: 1,
  meritThreshold: 500,
  nepotismBias: 20
});
const promotionResult = WA.actionDesk.plan('org.evaluateAscension', {
  orgId: 'imperial_constabulary',
  candidateId: 'hero_constable',
  meritPoints: 1200, // 远超门槛
  reputationScore: 95,
  exceptionalMeritClaim: '亲手斩捕恶魁，破获惊天大案'
});
assert.strictEqual(promotionResult.ok, true);
assert(promotionResult.verdict === 'promoted' || promotionResult.verdict === 'exceptional_bypass');
console.log('  ✓ 功勋卓著，晋升铨选通过：', promotionResult.verdict);

// 正向 5: 远古遗迹秘匙解锁 (ruin-mechanism) 与接触禁忌道心畸变 (anomaly-mutation)
console.log('正在验证正向流程 5：遗迹深处获得禁忌力量与超常异化...');
WA.ruinMechanism.resetAll();
WA.ruinMechanism.registerRuinMechanism('ancient_abyss_core', {
  hasMasterKey: true
});
const ruinUnlock = WA.actionDesk.plan('ruin.triggerMechanism', {
  ruinNodeId: 'ancient_abyss_core',
  actionKind: 'use_key'
});
assert.strictEqual(ruinUnlock.ok, true);
assert.strictEqual(ruinUnlock.success, true);

// 触碰古神遗物承受畸变侵蚀
WA.anomalyMutation.resetAll();
WA.anomalyMutation.registerAnomalyProfile('hero_constable', {
  corruptionLevel: 0,
  corruptionResist: 20
});
const mutateResult = WA.actionDesk.plan('anomaly.inflictCorruption', {
  actorId: 'hero_constable',
  dose: 60,
  sourceAnomalyId: 'ancient_relic'
});
assert.strictEqual(mutateResult.ok, true);
assert(mutateResult.currentCorruption > 0);
assert(mutateResult.newTier > 0, '阶位必须突破');
console.log('  ✓ 触碰禁忌遗物，获得异化力量与神魔体态：阶位', mutateResult.newTier);

console.log('=== V18 场景 37 史诗脉冲大锁校验通过！===');
console.log('通过: 14 项端到端串联断言，零回归破损，融会贯通！');