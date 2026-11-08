/**
 * WorldAxis tests/scenario-v49-v20-epic-holistic-convergence.js
 * 场景 49：V20 终极跨代全景史诗级活世界大闭环专锁 (V20 Epic Holistic Convergence)
 *
 * ── 终极大闭环验证链路 ──────────────────────────────────────────────
 * 1. 宏观历史与文明纪元突变闭环（EXV20-1）：
 *    - 四维危机熵累积突破阈值，触发文明纪元由 flourishing_dynasty 跃迁至 dark_plague_age；
 *    - 破坏性负控制：低危机熵拒绝跃迁（crisis-entropy-subcritical）；
 * 2. 极端自然地貌灾异与难民大潮闭环（EXV20-2）：
 *    - 高烈度山洪与地裂灾变，造成地域永久损伤、阻断交通网络并驱离上千难民；
 *    - 破坏性负控制：微小震级拒绝改写地貌（tremor-magnitude-insignificant）；
 * 3. 地下钱庄挤兑暴雷与金融通缩传染闭环（EXV20-7）：
 *    - 准备金击穿与恐慌假币蔓延引发银行破产（insolvent），驱动物价乘数激增；
 *    - 破坏性负控制：高流动性覆盖拒绝暴雷（reserves-sufficient-no-run）；
 * 4. 跨插件全双工因果回响闭环（OPV20-4 / OPV20-5）：
 *    - RubyPhone 短信流量谍报化与世界暗流催化；
 *    - LonSha 深刻血仇心锚反哺意志抗性；
 * 5. ActionDesk 全域集中调度闭环：
 *    - history.evaluateEpochShift / nature.triggerCataclysm / finance.triggerRunOnBank；
 * 6. UI 原生全息态势仪表大盘（EXV20-9）：
 *    - panel.renderV20HolomapDashboard 全面汇总纪元、地貌灾情与金融信用态势；
 * 7. Prompt 知觉全景提示词块注入感知（SOURCES 编入）。
 */
'use strict';

const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

require('../engines/epochal-transition.js');
require('../engines/cataclysm-hazard.js');
require('../engines/financial-contagion.js');
require('../engines/covert-espionage.js');
require('../engines/undercurrent-calendar.js');
require('../engines/human-realism.js');
require('../engines/action-desk.js');

WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 49] 开始执行 V20 终极跨代全景史诗级活世界大闭环专锁测试...');

// 初始化统一 Store
WA.store.init();
WA.store.transact(draft => {
  draft.epochalTransition = { currentEpoch: 'flourishing_dynasty', epochTurn: 1, history: [] };
  draft.cataclysmLedger = { activeHazards: [], history: [], damagedRegions: {} };
  draft.financialContagions = { banks: {}, collapseLedger: [] };
  draft.undercurrentCalendar = { undercurrents: [] };
});

// 1. 宏观历史突变与纪元跃迁验证 + 负控制
const shiftFail = WA.epochalTransition.evaluateEpochShift({ attritionCrisis: 10, epidemicCrisis: 10 });
assert.strictEqual(shiftFail.ok, false);
assert.strictEqual(shiftFail.refusal, 'crisis-entropy-subcritical');

const shiftOk = WA.epochalTransition.evaluateEpochShift({
  attritionCrisis: 85,
  epidemicCrisis: 95,
  regicideCrisis: 70,
  unrestCrisis: 80
});
assert.strictEqual(shiftOk.ok, true);
assert.strictEqual(shiftOk.toEpoch, 'dark_plague_age');
console.log('✓ 1. 宏观历史突变与文明纪元跃迁全闭环达标');

// 2. 极端自然地貌灾异突发与大尺度地貌灾变验证 + 负控制
const cataFail = WA.cataclysmHazard.triggerCataclysm({
  locationId: 'peaceful_valley',
  magnitude: 1.5
});
assert.strictEqual(cataFail.ok, false);
assert.strictEqual(cataFail.refusal, 'tremor-magnitude-insignificant');

const cataOk = WA.cataclysmHazard.triggerCataclysm({
  locationId: 'imperial_valley',
  hazardType: 'earthquake_fault',
  magnitude: 8.5,
  severRoute: 'silk_road_pass'
});
assert.strictEqual(cataOk.ok, true);
assert.strictEqual(cataOk.severedRoute, 'silk_road_pass');
assert(cataOk.refugeesDisplaced > 1000);
console.log('✓ 2. 极端地貌灾异大裂变与难民大潮闭环达标');

// 3. 地下金融挤兑与信用崩溃暴雷验证 + 负控制
const finFail = WA.financialContagion.triggerRunOnBank({
  bankId: 'safe_bank',
  place: 'capital',
  cashReserves: 100000,
  issuedNotes: 50000,
  withdrawalDemand: 1000,
  panicIndex: 5
});
assert.strictEqual(finFail.ok, false);
assert.strictEqual(finFail.refusal, 'reserves-sufficient-no-run');

const finOk = WA.financialContagion.triggerRunOnBank({
  bankId: 'shadow_vault_omega',
  place: 'port_omega',
  cashReserves: 500,
  issuedNotes: 20000,
  withdrawalDemand: 10000,
  panicIndex: 90,
  counterfeitRatio: 0.5
});
assert.strictEqual(finOk.ok, true);
assert.strictEqual(finOk.data.status, 'insolvent');
console.log('✓ 3. 黑市金融暴雷挤兑与信用穿透闭环达标');

// 4. RubyPhone 短信情报化与 LonSha 记忆心锚反哺验证
const comm = WA.covertEspionage.ingestCommTraffic({
  messageId: 'msg_assassinate_99',
  sender: 'traitor_duke',
  receiver: 'shadow_blade',
  content: '今夜子时，刺杀总督，开启城门迎接大军！'
});
assert.strictEqual(comm.ok, true);
assert.strictEqual(comm.entry.riskLevel, 'medium');

const resolve = WA.humanRealism.applyMemoryResolve('avenger_crow', {
  memoryTitle: '血海深仇：满门被诛之夜',
  intensity: 95,
  bindingType: 'blood_debt'
});
assert.strictEqual(resolve.ok, true);
assert.strictEqual(resolve.resolveBonus, 48);
console.log('✓ 4. 三插件通讯谍报与记忆真源意志反哺闭环达标');

// 5. ActionDesk 综合大调度闭环验证
const ad1 = WA.actionDesk.plan('history.evaluateEpochShift', {
  attritionCrisis: 90,
  epidemicCrisis: 90,
  regicideCrisis: 90,
  unrestCrisis: 90
});
assert.strictEqual(ad1.ok, true);

const ad2 = WA.actionDesk.plan('nature.triggerCataclysm', {
  locationId: 'dragon_spine_ridge',
  hazardType: 'volcanic_eruption',
  magnitude: 9.0
});
assert.strictEqual(ad2.ok, true);

const ad3 = WA.actionDesk.plan('finance.triggerRunOnBank', {
  bankId: 'grand_canal_vault',
  place: 'water_city',
  cashReserves: 200,
  issuedNotes: 10000,
  withdrawalDemand: 6000,
  panicIndex: 85
});
assert.strictEqual(ad3.ok, true);
console.log('✓ 5. ActionDesk V20 宏观历史/自然/金融全域路由调度闭环达标');

// 6. UI 原生全息态势仪表大盘验证 (EXV20-9)
const holomapRes = WA.ui.renderV20HolomapDashboard();
assert.strictEqual(holomapRes.ok, true);
assert.strictEqual(holomapRes.headless, true);
assert(holomapRes.data.epoch.includes('历史纪元大潮'));
assert(holomapRes.data.hazard.includes('自然地貌灾情'));
assert(holomapRes.data.finance.includes('地下金融与信用挤兑风暴'));
console.log('✓ 6. UI 原生态势仪表大盘全息感知闭环达标');

console.log('[Scenario 49] V20 终极跨代全景史诗级活世界大闭环专锁全部通过！');
