/**
 * WorldAxis tests/scenario-v43-v19-epic-living-network-pulse.js
 * 场景 43 终极专锁：V19 史诗全系活世界深度网络大脉冲专锁
 * (EXV19-7 + EXV19-8 + OPV19-6 + OPV19-7 + OPV19-8 + 跨引擎综合咬合级联)
 *
 * 验证目标：
 *  1. EXV19-7 毒理相克相生：乌头毒药萃取（brewToxin）、银针验毒拦截（screenPoison）、解毒草药救治（counterToxin）；
 *  2. EXV19-8 盟约铁律契书：签订攻守盟书（signCovenant）、违约清算声誉破产与天道因果反噬（breachAndSanction）；
 *  3. OPV19-6 酷吏刑讯反噬：动用酷刑后引发不可逆的永世血仇与派系信任破裂（applyBacklashGrudge）；
 *  4. OPV19-7 荒野猛兽驱离：定居点营火、木栅栏与号角威慑驱退狼群（checkPerimeterDeterrent）；
 *  5. OPV19-8 跨插件真源增量脏标记同步队列（queueDirtyDelta / flushDirtySnapshots）；
 *  6. 破坏性负控制断言：
 *     - 剧毒已攻心死亡（severity >= 100）强行常规草药起死回生必驳回（refusal: 'lethal-toxicity-irreversible'）；
 *     - 合法履约未触犯任何禁止条款强行违约清算必驳回（refusal: 'valid-terms-no-breach-detected'）；
 *     - 温和礼貌问询强行派生永世血仇必驳回（refusal: 'mild-inquest-no-blood-grudge'）；
 *     - 毫无营火栅栏毫无防御的营地野兽绝不无端逃逸必驳回（refusal: 'no-deterrent-present'）。
 */
'use strict';
const assert = require('assert');

// 模拟 WorldAxis 运行时
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/human-realism.js');
require('../engines/interrogation-tell.js');
require('../engines/ecosystem-predation.js');
require('../engines/bridge.js');
require('../engines/alchemy-toxicology.js');
require('../engines/covenant-sanction.js');
require('../engines/action-desk.js');
WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 43] 开始执行 V19 史诗全系活世界大脉冲跨引擎终极专锁测试...');

WA.store.init();
WA.store.transact(draft => {
  draft.toxicologyLedger = { cases: {}, recipes: [] };
  draft.covenantLedger = { covenants: [], sanctions: [] };
  draft.actors = {};
  draft.grudges = [];
});

// 1. EXV19-7: 提炼剧毒与银针验毒甄别
const brewRes = WA.alchemyToxicology.brewOrTestToxin({
  action: 'brewToxin',
  name: '断肠七步散',
  toxinType: 'hemotoxin',
  potency: 85,
  actorId: 'assassin_fang'
});
assert.strictEqual(brewRes.ok, true);
assert.strictEqual(brewRes.potency, 85);

const testRes = WA.alchemyToxicology.brewOrTestToxin({
  action: 'screenPoison',
  medium: '翡翠酒樽',
  hasToxin: true,
  toxinType: 'hemotoxin',
  method: 'silver_needle'
});
assert.strictEqual(testRes.ok, true);
assert.strictEqual(testRes.detected, true, '银针浸润酒樽必须探测出剧毒并变黑');
console.log('✓ 炼毒提纯与银针验毒甄别闭环验证通过');

// 2. EXV19-7: 草药中和解毒与破坏性负控制断言 1
const detoxRes = WA.alchemyToxicology.brewOrTestToxin({
  action: 'counterToxin',
  patientId: 'lord_victim',
  toxinType: 'hemotoxin',
  severity: 60,
  remedyPower: 35
});
assert.strictEqual(detoxRes.ok, true);
assert.strictEqual(detoxRes.currentSeverity, 25);

// 破坏性负控制 1：毒素致死度已达 100 严禁起死回生
WA.store.get().toxicologyLedger.cases['dead_patient'] = {
  patientId: 'dead_patient',
  severity: 100,
  toxinType: 'neurotoxin',
  status: 'poisoned'
};
const failDetox = WA.alchemyToxicology.brewOrTestToxin({
  action: 'counterToxin',
  patientId: 'dead_patient',
  remedyPower: 50
});
assert.strictEqual(failDetox.ok, false);
assert.strictEqual(failDetox.refusal, 'lethal-toxicity-irreversible');
console.log('✓ 负控制门禁 1（百烈剧毒攻心死亡强行草药复活驳回）验证通过');

// 3. EXV19-8: 签订神魔血誓与违约清算
const signPact = WA.covenantSanction.enforceCovenant('blood_pact_01', {
  action: 'signCovenant',
  name: '幽冥血契法印',
  tier: 'supernatural',
  signatories: ['warlock_kael', 'demon_lord'],
  prohibitedActs: ['betray_secrets', 'holy_water_cleansing']
});
assert.strictEqual(signPact.ok, true);

// 破坏性负控制 2：未违约强行申请清算制裁驳回
const failSanction = WA.covenantSanction.enforceCovenant('blood_pact_01', {
  action: 'breachAndSanction',
  violatorId: 'warlock_kael',
  committedAct: 'normal_meditation' // 正常冥想未违约
});
assert.strictEqual(failSanction.ok, false);
assert.strictEqual(failSanction.refusal, 'valid-terms-no-breach-detected');
console.log('✓ 负控制门禁 2（合法行为强行违约清算惩戒驳回）验证通过');

// 触犯禁止条款，天道血契反噬
const breachRes = WA.covenantSanction.enforceCovenant('blood_pact_01', {
  action: 'breachAndSanction',
  violatorId: 'warlock_kael',
  committedAct: 'betray_secrets'
});
assert.strictEqual(breachRes.ok, true);
assert.strictEqual(breachRes.sanctionType, 'karmicBacklash');
console.log('✓ 超自然契约违约引发天道因果反噬闭环验证通过');

// 4. OPV19-6: 酷吏刑讯反噬与破坏性负控制断言 3
const tortureGrudge = WA.interrogationTell.applyBacklashGrudge('inquest_dungeon_9', 'inquisitor_malik', 'knight_gareth', {
  tortureSeverity: 90
});
assert.strictEqual(tortureGrudge.ok, true);
assert.strictEqual(tortureGrudge.bloodGrudge, true);

const failTorture = WA.interrogationTell.applyBacklashGrudge('inquest_tea_room', 'gentle_judge', 'witness_lucy', {
  tortureSeverity: 0 // 温和问询
});
assert.strictEqual(failTorture.ok, false);
assert.strictEqual(failTorture.refusal, 'mild-inquest-no-blood-grudge');
console.log('✓ 负控制门禁 3（温和常规问询强行派生永世血仇驳回）验证通过');

// 5. OPV19-7: 野兽趋利避害与定居点灯火防护结界
const wildDeter = WA.ecosystemPredation.checkPerimeterDeterrent('dire_wolves', 'mountain_outpost', {
  fireDeterrent: true,
  barrier: true,
  acousticWarning: true,
  hunger: 65
});
assert.strictEqual(wildDeter.ok, true);
assert.strictEqual(wildDeter.deterred, true);
assert.strictEqual(wildDeter.deterrentScore, 100);

const failDeter = WA.ecosystemPredation.checkPerimeterDeterrent('dire_wolves', 'bare_camp', {
  fireDeterrent: false,
  barrier: false,
  acousticWarning: false,
  hunger: 70
});
assert.strictEqual(failDeter.ok, false);
assert.strictEqual(failDeter.refusal, 'no-deterrent-present');
console.log('✓ 负控制门禁 4（无防御设施野兽绝不无端逃逸驳回）验证通过');

// 6. OPV19-8: 跨插件增量脏标记同步队列验证
const qRes1 = WA.bridge.queueDirtyDelta('lonsha', 'covenant_breach', { covenantId: 'blood_pact_01', violator: 'warlock_kael' });
assert.strictEqual(qRes1.ok, true);
const qRes2 = WA.bridge.queueDirtyDelta('rubyphone', 'secret_exposed', { wiretapTarget: 'inquisitor_malik' });
assert.strictEqual(qRes2.ok, true);

const flushLonsha = WA.bridge.flushDirtySnapshots('lonsha');
assert.strictEqual(flushLonsha.ok, true);
assert.strictEqual(flushLonsha.flushedCount, 1);
assert.strictEqual(flushLonsha.deltas[0].category, 'covenant_breach');

const flushRuby = WA.bridge.flushDirtySnapshots('rubyphone');
assert.strictEqual(flushRuby.flushedCount, 1);
console.log('✓ OPV19-8 跨插件真源增量脏标记队列沉降闭环验证通过');

// 7. ActionDesk 路由调度与提示词注入全景
const deskAlchemy = WA.actionDesk.plan('alchemy.brewOrTestToxin', { action: 'screenPoison', medium: 'soup', hasToxin: false });
assert.strictEqual(deskAlchemy.ok, true);
const deskCov = WA.actionDesk.plan('covenant.enforceCovenant', { action: 'signCovenant', covenantId: 'test_covenant', signatories: ['A', 'B'] });
assert.strictEqual(deskCov.ok, true);

const toxBlock = WA.alchemyToxicology.buildBlock();
assert.ok(toxBlock.indexOf('【毒理药相与微观病理】') !== -1);
const covBlock = WA.covenantSanction.buildBlock();
assert.ok(covBlock.indexOf('【盟约铁律与契约因果】') !== -1);
console.log('✓ ActionDesk 调度台与 Prompt 注入大盘验证通过');

console.log('[Scenario 43] V19 史诗全系活世界终极专锁测试全部通过！');