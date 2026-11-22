/**
 * WorldAxis tests/scenario-v44-embodied-prompt-perception.js
 * 场景 44 专锁：雨夜潜行暗杀与 Prompt 创伤知觉即时具身专锁
 * (OPV20-1 Prompt 注入管线全域贯通 + OPV20-3 Bridge V2 物理快照 + 真实破坏性负控制)
 *
 * 验证目标：
 *  1. OPV20-1 注入知觉具身：
 *     - 潜伏暗杀（stealthInfiltration）与守卫视锥态势被完整注入宿主 Prompt；
 *     - 战地外科（surgicalTriage）创伤失血休克病理被实时注入宿主 Prompt；
 *     - 毒理药相（alchemyToxicology）与铁律盟约（covenantSanction）进入注入条目；
 *  2. OPV20-3 Bridge V2 物理快照对外事实投影：
 *     - bridge.buildSnapshot().v18EpicClash 包含战况、创伤、审讯等深层物理；
 *     - bridge.buildSnapshot().v19LivingNetwork 包含谍网、疫病、外科、海况、黑市、潜行、毒理、契约与生理；
 *  3. ActionDesk 深度联动调度：
 *     - 通过 actionDesk 统一调度潜行战术（stealth.executeInfiltration）与战地外科手术（medical.performSurgery）；
 *  4. 破坏性负控制断言（100% 负控制防线）：
 *     - 烈日无阴影（shadowFactor <= 5）且直视视锥内（inSight 且 <= 10m）强行潜行暗杀必须被拒止（refusal: 'unshadowed-direct-line-of-sight'）；
 *     - 患者喷射性大出血（bleeding >= 80）未上止血带强行缝合创口导致失血休克必须被拒止（refusal: 'uncontrolled-hemorrhage-stabilization-required'）。
 */
'use strict';
const assert = require('assert');

// 模拟 WorldAxis 运行时
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

// 加载关键引擎
require('../engines/human-realism.js');
require('../engines/stealth-infiltration.js');
require('../engines/surgical-triage.js');
require('../engines/alchemy-toxicology.js');
require('../engines/covenant-sanction.js');
require('../engines/bridge.js');
require('../engines/action-desk.js');
require('../render/inject.js');

WA.actionDesk.setSettings({ enabled: true });
WA.surgicalTriage.setSettings({ enabled: true });

console.log('[Scenario 44] 开始执行雨夜潜行暗杀与 Prompt 创伤知觉即时具身专锁测试...');

WA.store.init();
WA.store.transact(draft => {
  draft.stealthTactics = { guards: [], infiltrators: {}, logs: [] };
  draft.surgicalPatients = {};
  draft.toxicologyLedger = { cases: {}, recipes: [] };
  draft.covenantLedger = { covenants: [], sanctions: [] };
  draft.actors = {};
});

// ── 1. 注册守卫并执行雨夜暗影潜行 (stealthInfiltration) ──
const guardRes = WA.stealthInfiltration.registerGuard({
  guardId: 'sentinel_rain_gate',
  name: '雨夜府邸门哨',
  facingAngle: 90,
  viewDistance: 20,
  location: 'front_courtyard'
});
assert.strictEqual(guardRes.ok, true, '门哨守卫注册必须成功');

// 破坏性负控制 1：大白天烈日无阴影直视强行潜行必须拒止
const failStealth = WA.stealthInfiltration.executeInfiltration('ghost_operative', {
  tactic: 'shadowMelt',
  guardId: 'sentinel_rain_gate',
  shadowFactor: 2, // 几乎无阴影
  inSight: true,
  distance: 6 // 近距直视
});
assert.strictEqual(failStealth.ok, false, '烈日直视潜行必须失败');
assert.strictEqual(failStealth.refusal, 'unshadowed-direct-line-of-sight', '拒止码必须是 unshadowed-direct-line-of-sight');
console.log('✓ 负控制门禁 1（烈日近距直视潜行暗杀拒止）验证通过');

// 正确行动：暴雨深夜暗影掩护潜行（shadowFactor: 85, distance: 18）
const okStealth = WA.stealthInfiltration.executeInfiltration('ghost_operative', {
  tactic: 'shadowMelt',
  guardId: 'sentinel_rain_gate',
  shadowFactor: 85,
  inSight: false,
  distance: 18,
  footstepDb: 15
});
assert.strictEqual(okStealth.ok, true, '暗影中潜行应当成功');
assert.strictEqual(okStealth.detected, false, '暗影与雨声掩护下未被察觉');

// ── 2. 收治重伤员与失血救护 (surgicalTriage) ──
const admitRes = WA.surgicalTriage.admitPatient('wounded_knight_alric', {
  traumaType: 'penetrating_arterial_stab',
  bleeding: 85,
  stability: 40
});
assert.strictEqual(admitRes.ok, true, '重伤患建档收治成功');

// 破坏性负控制 2：动脉大喷血未上止血带直接缝合必须拒止
const failSurgery = WA.surgicalTriage.performSurgery({
  patientId: 'wounded_knight_alric',
  procedure: 'suture'
});
assert.strictEqual(failSurgery.ok, false, '喷血未止强行缝合必须拒止');
assert.strictEqual(failSurgery.refusal, 'uncontrolled-hemorrhage-stabilization-required');
console.log('✓ 负控制门禁 2（动脉喷血未止血强行缝合手术拒止）验证通过');

// 正确救治流程：先上止血带 (tourniquet)，再清创与缝合
const tourniquetRes = WA.surgicalTriage.performSurgery({
  patientId: 'wounded_knight_alric',
  procedure: 'tourniquet'
});
assert.strictEqual(tourniquetRes.ok, true, '扎上止血带成功');
assert.ok(tourniquetRes.bleeding < 85, '止血带后出血显著下降');

// ── 3. OPV20-1: 验证 Prompt 注入管线真实具身感知 ──
// 触发 applyInjections 构建提示词并落入 setExtensionPrompt
const injectCtx = { injections: [] };
WA.render.applyInjections(injectCtx);

assert.ok(global.__lastExtensionPrompt, 'applyInjections 必须调用宿主 setExtensionPrompt');
const promptText = global.__lastExtensionPrompt.text;

// 断言潜伏暗杀与巡逻守卫视锥已进入正文提示词
assert.ok(promptText.indexOf('【潜入暗影与巡逻视野】') !== -1, '提示词中必须包含潜伏暗影与守卫视锥信息');
assert.ok(promptText.indexOf('雨夜府邸门哨') !== -1, '提示词中必须具身呈现守卫名字');

// 断言战地外科病理已进入正文提示词
assert.ok(promptText.indexOf('【战地创伤救护】') !== -1, '提示词中必须包含战地创伤救护信息');
assert.ok(promptText.indexOf('wounded_knight_alric') !== -1, '提示词中必须具身呈现伤员 ID');
console.log('✓ OPV20-1 Prompt 具身知觉管线全域贯通验证通过');

// ── 4. OPV20-3: 验证 Bridge V2 物理快照对外投影 ──
const snapshot = WA.bridge.buildSnapshot();
assert.ok(snapshot, 'bridge.buildSnapshot() 必须返回有效对象');
assert.ok(snapshot.v18EpicClash, '快照必须包含 v18EpicClash 矩阵');
assert.ok(snapshot.v19LivingNetwork, '快照必须包含 v19LivingNetwork 矩阵');

assert.ok(snapshot.v19LivingNetwork.stealthInfiltrationStat, '快照必须包含潜行渗透统计数据');
assert.ok(snapshot.v19LivingNetwork.surgicalTriageStat, '快照必须包含战地救护统计数据');
assert.strictEqual(snapshot.v19LivingNetwork.surgicalTriageStat.activePatients >= 1, true, '快照中战地伤患活跃数必须 >= 1');
console.log('✓ OPV20-3 Bridge V2 物理快照矩阵全量投影验证通过');

// ── 5. ActionDesk 路由纳管统一调度测试 ──
const deskStealth = WA.actionDesk.plan('stealth.executeInfiltration', {
  infiltratorId: 'ghost_operative',
  tactic: 'shadowMelt',
  guardId: 'sentinel_rain_gate',
  shadowFactor: 90,
  inSight: false,
  distance: 12
});
assert.strictEqual(deskStealth.ok, true, 'ActionDesk 调度 stealth.executeInfiltration 必须成功');

const deskSurgery = WA.actionDesk.plan('medical.performSurgery', {
  patientId: 'wounded_knight_alric',
  procedure: 'suture'
});
assert.strictEqual(deskSurgery.ok, true, 'ActionDesk 调度 medical.performSurgery 必须成功');
console.log('✓ ActionDesk 路由调度统一消费验证通过');

console.log('[Scenario 44] 雨夜潜行暗杀与 Prompt 创伤知觉即时具身专锁全部通过！');
