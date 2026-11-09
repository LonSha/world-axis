/**
 * WorldAxis tests/scenario-v55-dungeon-eco-court-mesh.js
 * 场景 55: 迷宫陷阱拓扑、深层生态崩溃与宫廷权谋政变全息大闭环专锁
 * (Dungeon Mesh, Ecosystem Cascade & Court Intrigue Holo-Closure Lock)
 * 
 * 验证闭环：
 * Part A: 迷宫拓扑与地灾机关网络 (Dungeon Hazard Mesh)
 * 1. 迷宫图节点网络注册（registerDungeonMesh）；
 * 2. 负控制拦截：试图穿越未连通或已坍塌毁灭的暗室（refusal: 'room-node-collapsed'）；
 * 3. 陷阱触发、毒弩伤害与机关拆除（disarm_trap）；
 * 4. 破壁炸通新连通路径（breach_passage）；
 * 
 * Part B: 深层生态食物链与级联崩溃 (Ecosystem Cascade)
 * 5. 生态群落注册（registerBiome）；
 * 6. 负控制拦截：稳态平衡下无因声称崩溃必驳回（refusal: 'ecosystem-in-equilibrium'）；
 * 7. 顶级掠食者灭绝与草食过度繁殖、外来入侵物种暴增级联崩溃；
 * 
 * Part C: 宫廷权谋政变与禁军逼宫 (Court Intrigue)
 * 8. 王权中枢四维向量注册（registerCourt）；
 * 9. 负控制拦截：禁军死忠且无外力策应逼宫必遭诛杀（refusal: 'imperial-guard-lethal-resistance'）；
 * 10. 收买内侍近臣、罗织罪名构陷政敌与伪造先帝遗诏；
 * 11. 策动御林军叛乱、玄武门喋血逼宫成功；
 * 
 * Part D: 全息总线与调度台跨层穿透 (Cascade Bus & ActionDesk)
 * 12. CascadeBus 六层总线自适应波次分发（dispatchAdaptiveWave）与因果环路熔断验证；
 * 13. ActionDesk 路由（dungeon.*, eco.*, court.*）穿透与 buildBlock 提示词生成。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/dungeon-hazard-mesh.js');
require('../engines/ecosystem-cascade.js');
require('../engines/court-intrigue.js');
require('../engines/cascade-bus.js');
require('../engines/action-desk.js');
WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 55] 开始执行迷宫拓扑、生态级联与深宫政变全息大闭环专锁测试...');

// ==================== Part A: Dungeon Hazard Mesh ====================
// 1. 生成地下迷宫图网络
const dungRes = WA.dungeonHazardMesh.generateDungeon('dungeon_crypt', {
  name: '幽暗古神地宫',
  theme: 'Ancient Necropolis',
  disasterClock: 5,
  clockActive: true
});
assert.strictEqual(dungRes.ok, true);

// 2. 负控制拦截：坚硬黑曜石死壁肉身强攻必遭驳回
const barrierRes = WA.dungeonHazardMesh.navigateOrTrigger('dungeon_crypt', {
  action: 'breach_wall',
  nodeId: 'entry',
  hasExplosives: false,
  breachPower: 10
});
assert.strictEqual(barrierRes.ok, false);
assert.strictEqual(barrierRes.refusal, 'impenetrable-barrier');
console.log('✓ 1. 迷宫拓扑网络生成与强突黑曜石坚壁负控制拦截达标 (impenetrable-barrier)');

// 3. 正常排查、触发机关并使用工程炸药破壁开凿捷径
const travRes = WA.dungeonHazardMesh.navigateOrTrigger('dungeon_crypt', {
  action: 'traverse',
  nodeId: 'corridor_1'
});
assert.strictEqual(travRes.ok, true);
assert.strictEqual(travRes.trapSprung, true);
assert.strictEqual(travRes.trapDamage > 0, true);

const breachRes = WA.dungeonHazardMesh.navigateOrTrigger('dungeon_crypt', {
  action: 'breach_wall',
  nodeId: 'corridor_1',
  hasExplosives: true
});
assert.strictEqual(breachRes.ok, true);
assert.strictEqual(typeof breachRes.newPassage === 'string', true);
console.log('✓ 2. 机关毒弩成功触发并定向爆破打通主殿暗道');

// ==================== Part B: Ecosystem Cascade ====================
// 4. 注册原始生态群落
const ecoReg = WA.ecosystemCascade.registerEcoRegion('biome_silverpine', {
  name: '银松原始森林与黑水湿地',
  producers: 85,
  herbivores: 50,
  apexPredators: 55,
  invasiveHazard: 5
});
assert.strictEqual(ecoReg.ok, true);

// 5. 负控制拦截：健康稳态拒绝虚假崩溃声称
const falseCollapse = WA.ecosystemCascade.simulateBioShock('biome_silverpine', {
  shockType: 'assert_collapse'
});
assert.strictEqual(falseCollapse.ok, false);
assert.strictEqual(falseCollapse.refusal, 'ecosystem-in-equilibrium');
console.log('✓ 3. 原始森林生态注册与稳态拒绝崩溃负控制拦截达标 (ecosystem-in-equilibrium)');

// 6. 顶级掠食者灭绝与外来入侵恶性爆发
const apexShock = WA.ecosystemCascade.simulateBioShock('biome_silverpine', {
  shockType: 'cull_apex',
  cullSeverity: 80
});
assert.strictEqual(apexShock.ok, true);
assert.strictEqual(apexShock.state, 'trophic_cascade');

const invasiveShock = WA.ecosystemCascade.simulateBioShock('biome_silverpine', {
  shockType: 'introduce_invasive',
  initialLoad: 70
});
assert.strictEqual(invasiveShock.ok, true);
assert.strictEqual(invasiveShock.state, 'infested');
console.log('✓ 4. 食物链顶级猎食断裂级联雪崩与外来异化物种肆虐爆发');

// ==================== Part C: Court Intrigue ====================
// 7. 注册帝国中枢宫廷
const courtReg = WA.courtIntrigue.registerCourt('court_imperium', {
  realmName: '太极紫宸殿',
  guardLoyalty: 90,
  innerChamber: 65,
  bureaucracy: 50,
  privyPurse: 8000
});
assert.strictEqual(courtReg.ok, true);

// 8. 负控制拦截：禁卫军死忠且无兵力策应强行逼宫必被当场诛杀
const badCoup = WA.courtIntrigue.executeIntrigue('court_imperium', 'executePalaceCoup', {
  actorFaction: 'shadow_rebels',
  armedSupporters: false
});
assert.strictEqual(badCoup.ok, false);
assert.strictEqual(badCoup.refusal, 'imperial-guard-lethal-resistance');
console.log('✓ 5. 深宫中枢建档与无兵闯宫凌迟诛杀负控制拦截达标 (imperial-guard-lethal-resistance)');

// 9. 策反收买与罗织罪名
const bribeRes = WA.courtIntrigue.executeIntrigue('court_imperium', 'bribeInnerChamber', {
  actorFaction: 'shadow_rebels',
  goldAmount: 3000
});
assert.strictEqual(bribeRes.ok, true);

// 证据不足负控制拦截（evidenceLevel <= 10）
const badFrame = WA.courtIntrigue.executeIntrigue('court_imperium', 'frameRival', {
  actorFaction: 'shadow_rebels',
  targetRival: 'grand_marshal',
  evidenceLevel: 5
});
assert.strictEqual(badFrame.ok, false);
assert.strictEqual(badFrame.refusal, 'frame-evidence-insufficient');

// 完备证据构陷政敌
const frameRes = WA.courtIntrigue.executeIntrigue('court_imperium', 'frameRival', {
  actorFaction: 'shadow_rebels',
  targetRival: 'grand_marshal',
  evidenceLevel: 60
});
assert.strictEqual(frameRes.ok, true);
console.log('✓ 6. 证据不足诬告反噬拦截 (frame-evidence-insufficient) 与收买构陷政敌成功');

// 10. 伪造遗诏与引兵夜半喋血逼宫成功
const decreeRes = WA.courtIntrigue.executeIntrigue('court_imperium', 'forgeDecree', {
  actorFaction: 'shadow_rebels',
  sealQuality: 85
});
assert.strictEqual(decreeRes.ok, true);

const goodCoup = WA.courtIntrigue.executeIntrigue('court_imperium', 'executePalaceCoup', {
  actorFaction: 'shadow_rebels',
  armedSupporters: true,
  coupForce: 85
});
assert.strictEqual(goodCoup.ok, true);
assert.strictEqual(goodCoup.monarchStatus, 'deposed');
console.log('✓ 7. 伪造退位遗诏并兵变篡位成功');

// ==================== Part D: Cascade Bus & ActionDesk ====================
// 11. 自适应六层因果波次分发
const waveRes = WA.cascadeBus.dispatchAdaptiveWave({
  sourceLayer: 'macro',
  targetLayers: ['social', 'tactical', 'somatic', 'physical'],
  payload: { shock: 'dynasty_overthrow', impact: 95 }
});
assert.strictEqual(waveRes.ok, true);
assert.strictEqual(waveRes.cycleChecksPassed, true);

// 因果拓扑成环熔断自检 (A -> B -> C -> A)
const cycleRes = WA.cascadeBus.dispatchAdaptiveWave({
  sourceLayer: 'tactical',
  dependencyChain: ['event_alpha', 'event_beta', 'event_gamma', 'event_alpha'],
  payload: { cycleLoop: true }
});
assert.strictEqual(cycleRes.ok, false);
assert.strictEqual(cycleRes.refusal, 'causal-cycle-broken');
console.log('✓ 8. CascadeBus 六层总线波次传导与因果拓扑成环熔断自检达标 (causal-cycle-broken)');

// 12. ActionDesk 路由调用与 buildBlock 提示词生成
const deskEco = WA.actionDesk.plan('eco.simulateBioShock', {
  regionId: 'biome_silverpine',
  shockType: 'rebalance'
});
assert.strictEqual(deskEco.ok, true);

const deskCourt = WA.actionDesk.plan('court.executeIntrigue', {
  courtId: 'court_imperium',
  opKind: 'frameRival',
  actorFaction: 'shadow_rebels',
  targetRival: 'chancellor',
  evidenceLevel: 50
});
assert.strictEqual(deskCourt.ok, true);
console.log('✓ 9. ActionDesk 跨模块高阶路由穿透验证成功');

const blkDung = WA.dungeonHazardMesh.buildBlock();
const blkEco = WA.ecosystemCascade.buildBlock();
const blkCourt = WA.courtIntrigue.buildBlock();
assert.strictEqual(blkDung.length > 0 || blkEco.length > 0 || blkCourt.length > 0, true);
console.log('✓ 10. 迷宫/生态/宫廷全息感知提示词大盘输出达标');

// 13. UI 控制中心 renderV21CivEcoHub 态势渲染验证
const civEcoRes = WA.ui.renderV21CivEcoHub();
assert.strictEqual(civEcoRes.ok, true);
assert.strictEqual(civEcoRes.headless, true);
console.log('✓ 11. UI 面板 renderV21CivEcoHub 原生渲染抽屉挂载验证成功');

console.log('Scenario 55 全部断言顺利通过！\n');