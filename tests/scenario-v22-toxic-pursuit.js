/**
 * WorldAxis tests/scenario-v22-toxic-pursuit.js (v2.330.0)
 *
 * 场景 22 专锁：密林毒瘴追击与生理解毒代谢锁
 *
 * 贯通引擎与机制闭环：
 *  1. 生物机能毒素积蓄与病理代谢 (toxic-metabolism EXV16-2):
 *     逃亡者吸入神经麻痹毒素 (neuro_paralysis)，体内浓度上升，进入 moderate 中毒阶段；
 *     敏捷与机能响应受到严重惩罚 (agilityPenalty > 0.3)；
 *  2. 针对性解毒与半衰期代谢 (toxic-metabolism):
 *     逃亡者服用清灵草解毒药剂 (administerAntidote)，中和毒素浓度；
 *     随时间自然代谢 (metabolize)，体内毒素浓度下降进入 safe/mild 阶段；
 *  3. 物证与痕迹介质吸附与暴雨冲刷 (spatial-trace OPV16-4):
 *     逃亡者在密林泥地留下鞋印痕迹，泥土介质吸附延长其半衰期 (halfLifeFactor = 3.0)；
 *     追兵依据泥地鞋印追踪；随后密林天降暴雨，强降雨冲刷物证痕迹使其彻底消退；
 *  4. 5 项真实破坏性负控制硬门禁：
 *     - [NC-1] 施加非法未知毒素类型拒收 (invalid_toxin_type)
 *     - [NC-2] 0 剂量或负数毒素不积蓄浓度 (invalid_dose)
 *     - [NC-3] 强酸腐蚀物理刻痕在暴雨冲刷下不可溶降解 (impervious_carving)
 *     - [NC-4] 错误解毒剂（目标类型不匹配）对异种毒素零中和
 *     - [NC-5] 痕迹不存在时演化报错 (trace_not_found)
 */
'use strict';
const assert = require('assert');
const path = require('path');
require('./mock.js');
// v2.380.0（历史欠账消红）：本文件已装宿主 mock，但 spatial-trace 读 `WA.rand.next(...)`
//   而未装随机源（纯引擎直跑形态不装 LOAD），故 3 条断言炸 undefined。
//   随机源用**真产品模块** core/rand.js，不造假桩 —— 测试与产品同一份随机实现。
require('./host-boot.js').boot();

const toxicMetabolism = require('../engines/toxic-metabolism.js');
const spatialTrace = require('../engines/spatial-trace.js');

let passed = 0;
let failed = 0;
function it(desc, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${desc}:`, err.message);
  }
}

console.log('=== 开始执行 V16 场景 22 专锁：密林毒瘴追击与生理解毒代谢锁 ===');

// 1. 神经毒素吸入与机能损伤
it('1.1 逃亡者赵六吸入密林神经麻痹毒素 40 毫克，进入中度中毒阶段', () => {
  toxicMetabolism.resetAll();
  const applyRes = toxicMetabolism.applyToxin('runner_zhao', 'neuro_paralysis', 40);
  assert.ok(applyRes.ok, '毒素施加成功');
  assert.strictEqual(applyRes.stage, 'moderate', '中毒阶段为中度');
  assert.ok(applyRes.penalty.agilityPenalty >= 0.25, '敏捷机能受罚迟缓');

  const status = toxicMetabolism.getActorToxinStatus('runner_zhao');
  assert.ok(status.toxins.some(t => t.toxinType === 'neuro_paralysis' && t.concentration === 40));
});

// 2. 解毒剂中和与生理半衰期代谢
it('2.1 赵六服用应急解毒散（解毒效力 25），毒素被快速中和', () => {
  const antidoteRes = toxicMetabolism.administerAntidote('runner_zhao', 25, 'neuro_paralysis');
  assert.ok(antidoteRes.ok, '解毒剂使用成功');
  assert.strictEqual(antidoteRes.neutralizedDose, 25, '成功中和 25 单位毒素');

  const status = toxicMetabolism.getActorToxinStatus('runner_zhao');
  const remaining = status.toxins.find(t => t.toxinType === 'neuro_paralysis');
  assert.strictEqual(remaining.concentration, 15, '体内残存 15 单位');
  assert.strictEqual(remaining.stage, 'mild', '降为轻度中毒');
});

it('2.2 逃亡潜伏 60 分钟，经过自然肝肾半衰期代谢，残余毒素降至极低安全水平', () => {
  const metaRes = toxicMetabolism.metabolize('runner_zhao', 60);
  assert.ok(metaRes.ok, '生理代谢结算成功');
  const remaining = metaRes.toxinStatus.find(t => t.toxinType === 'neuro_paralysis');
  assert.ok(remaining.concentration < 10, '半衰期后毒素浓度显著降解');
});

// 3. 物证与痕迹介质吸附与暴雨冲刷 (OPV16-4)
it('3.1 密林泥土多孔介质吸附鞋印物证，半衰期延长 3 倍', () => {
  const traceRes = spatialTrace.leaveTrace('forest_path', 'puddle', {
    sourceChar: 'runner_zhao',
    customDesc: '带有草药渣的深陷泥印',
    initialStrength: 1.0
  });
  assert.ok(traceRes.ok, '留下痕迹成功');
  const traceId = traceRes.trace.id;

  const evolveRes = spatialTrace.evolveTrace('forest_path', traceId, 'soil', { weather: 'clear' });
  assert.ok(evolveRes.ok, '痕迹介质演化成功');
  assert.strictEqual(evolveRes.halfLifeFactor, 3.0, '多孔泥土使半衰期延长 3 倍');
  assert.strictEqual(evolveRes.isWashedAway, false, '晴天鞋印清晰');
});

it('3.2 密林突降强暴雨（降雨量 45mm），泥地鞋印痕迹被暴雨彻底冲刷殆尽', () => {
  const traceRes = spatialTrace.leaveTrace('forest_path', 'puddle', {
    sourceChar: 'runner_zhao',
    customDesc: '浅洼泥印',
    initialStrength: 0.5
  });
  const traceId = traceRes.trace.id;

  const rainRes = spatialTrace.evolveTrace('forest_path', traceId, 'soil', {
    weather: 'rain',
    rainAmount: 45
  });
  assert.ok(rainRes.ok, '暴雨冲刷演化成功');
  assert.strictEqual(rainRes.isWashedAway, true, '痕迹已被暴雨彻底冲散消除');
  assert.strictEqual(rainRes.remainingStrength, 0, '残留强度归零');
});

// 4. 破坏性负控制硬门禁
it('4.1 [NC-1] 施加非法未知毒素类型拒收 (invalid_toxin_type)', () => {
  const res = toxicMetabolism.applyToxin('runner_zhao', 'magic_dark_curse', 50);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'invalid_toxin_type', '精确拦截非毒理分类');
});

it('4.2 [NC-2] 0 剂量或负数毒素不积蓄浓度 (invalid_dose_must_be_positive)', () => {
  const res = toxicMetabolism.applyToxin('runner_zhao', 'neuro_paralysis', -10);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'invalid_dose_must_be_positive');
});

it('4.3 [NC-3] 强酸腐蚀物理刻痕在暴雨冲刷下不可溶降解 (impervious_carving)', () => {
  const traceRes = spatialTrace.leaveTrace('forest_cliff', 'scratch', {
    customDesc: '树干上的逃生路标刻痕',
    initialStrength: 0.9
  });
  const traceId = traceRes.trace.id;

  const res = spatialTrace.evolveTrace('forest_cliff', traceId, 'wood', {
    weather: 'rain',
    rainAmount: 60
  });
  assert.ok(res.ok);
  assert.strictEqual(res.weathered, false, '物理雕刻刻痕不溶于水冲刷');
  assert.ok(res.strength > 0, '强度完全保留');
});

it('4.4 [NC-4] 错误解毒剂（目标类型不匹配）对异种毒素零中和', () => {
  toxicMetabolism.applyToxin('target_mismatch', 'tissue_corrosion', 30);
  // 尝试用神经麻痹解毒剂中和组织腐蚀
  const res = toxicMetabolism.administerAntidote('target_mismatch', 30, 'neuro_paralysis');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.neutralizedDose, 0, '异种毒素中和量为 0');
});

it('4.5 [NC-5] 痕迹不存在时演化报错 (trace_not_found)', () => {
  const res = spatialTrace.evolveTrace('forest_path', 'phantom_ghost_trace', 'soil');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'trace_not_found');
});

console.log(`=== 场景 22 专锁测试完成：通过 ${passed} 项，失败 ${failed} 项 ===`);
if (failed > 0) process.exit(1);