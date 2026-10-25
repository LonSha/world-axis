'use strict';
/**
 * WorldAxis tests/v5-ex-1-2-3.js (v2.242.0)
 * 专项锁定与门禁验证：
 *   - EXV5-1: 流言拓扑变异与恐慌放大引擎 (rumor.mutateAndAmplify via actionDesk)
 *   - EXV5-2: 据点暴露度与安全屋废弃机制 (operations.trackSafehouseExposure 超过80阈值触发 abandoned)
 *   - EXV5-3: 深层心理创伤印记动力学 (affect.imprintTrauma & checkTraumaTrigger 诱因匹配应激)
 * 具备独立断言与严格单行真源码破坏负控制验证。
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));

function createTestEnv(srcOverrides) {
  if (global.localStorage) global.localStorage.clear();
  const freshInst = gate.fresh({ srcOverride: srcOverrides || {} });
  const W = freshInst.WA;
  W.store.init();
  W.recipe.apply('historical');
  W.rumor.setSettings({ enabled: true });
  W.operations.setSettings({ enabled: true });
  W.affect.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });

  return freshInst;
}

function testEXV5_1(inst) {
  const W = inst.WA;
  // 1. 密集人际拓扑传播 3 跳，初始恐慌 20
  const res = W.actionDesk.plan('rumor.mutateAndAmplify', {
    text: '南门粮库被官兵查封',
    hops: 3,
    density: 'crowded',
    initialPanic: 20
  });

  if (!res || !res.ok) return false;
  if (res.hops !== 3) return false;
  // 20 * 1.45^3 = 60.96 -> 约 61-62 恐慌
  if (res.panicIndex < 55) return false;
  if (!res.mutatedText.includes('大难临头')) return false;
  if (res.fidelity >= 1.0) return false;

  return true;
}

function testEXV5_2(inst) {
  const W = inst.WA;
  // 1. 正常出入 2 次 (2*5 = 10 暴露度 -> secure)
  const res1 = W.actionDesk.plan('operations.trackSafehouseExposure', {
    id: 'sh_dongsi_01',
    place: '东四胡同铁匠铺后院',
    visits: 2,
    incidentSeverity: 0
  });
  if (!res1 || !res1.ok || res1.exposure !== 10 || res1.status !== 'secure') return false;

  // 2. 发生严重搜查事件 (severity: 6 -> 10 + 1*5 + 6*12 = 87 >= 80 -> abandoned)
  const res2 = W.actionDesk.plan('operations.trackSafehouseExposure', {
    id: 'sh_dongsi_01',
    visits: 1,
    incidentSeverity: 6
  });
  if (!res2 || !res2.ok) return false;
  if (res2.exposure !== 87) return false;
  if (res2.status !== 'abandoned') return false;
  if (!res2.shouldEvacuate) return false;

  return true;
}

function testEXV5_3(inst) {
  const W = inst.WA;
  // 1. 烙印创伤：通州码头夜袭背叛
  const imp = W.affect.imprintTrauma('常镖头', 'betrayal', '夜雨更夫梆子声', '周身冷汗脱力、拔刀戒备拒绝交涉');
  if (!imp || !imp.ok || !imp.trauma) return false;

  // 2. 触发诱因核验
  const trigCheck = W.actionDesk.plan('affect.checkTraumaTrigger', {
    person: '常镖头',
    trigger: '听到窗外传来夜雨更夫梆子声'
  });
  if (!trigCheck || !trigCheck.ok || !trigCheck.triggered) return false;
  if (trigCheck.traumaType !== 'betrayal') return false;
  if (!trigCheck.actionBlock.includes('周身冷汗脱力')) return false;

  // 3. 无关情境不触发
  const noTrig = W.actionDesk.plan('affect.checkTraumaTrigger', {
    person: '常镖头',
    trigger: '午后茶摊歇脚'
  });
  if (!noTrig || !noTrig.ok || noTrig.triggered) return false;

  return true;
}

function runAll() {
  console.log('[v5-ex-1-2-3] 开始正向断言验收...');
  const env = createTestEnv();
  assert(testEXV5_1(env), 'EXV5-1 (流言拓扑变异与恐慌放大) 验收必须通过');
  assert(testEXV5_2(env), 'EXV5-2 (据点暴露度与废弃机制) 验收必须通过');
  assert(testEXV5_3(env), 'EXV5-3 (深层心理创伤印记动力学) 验收必须通过');
  console.log('[PASS] v5-ex-1-2-3 正向功能全部通过！');
  runNegative();
}

const mutations = [
  {
    name: 'EXV5-1_panic_multiplier_mutated',
    file: 'engines/rumor.js',
    anchor: "let panicMultiplierPerHop = density === 'crowded' ? 1.45 : (density === 'sparse' ? 1.2 : 1.05);",
    replacement: "let panicMultiplierPerHop = 1.0; /* mutated */",
    criterion: testEXV5_1
  },
  {
    name: 'EXV5-2_abandoned_threshold_mutated',
    file: 'engines/operations.js',
    anchor: "if (sh.exposure >= 80) {",
    replacement: "if (false) { /* mutated */",
    criterion: testEXV5_2
  },
  {
    name: 'EXV5-3_trauma_trigger_mutated',
    file: 'engines/affect.js',
    anchor: "return t && (t.trigger === trig || trig.indexOf(t.trigger) >= 0 || (t.trigger && trig && t.trigger.indexOf(trig) >= 0));",
    replacement: "return false; /* mutated */",
    criterion: testEXV5_3
  }
];

function runNegative() {
  console.log('[v5-ex-1-2-3] 开始运行单行真源码负控制破坏测试...');
  for (const mut of mutations) {
    const fullPath = path.join(BASE, mut.file);
    const originSrc = fs.readFileSync(fullPath, 'utf8');

    // 锚点唯一性断言
    const parts = originSrc.split(mut.anchor);
    assert.strictEqual(parts.length, 2, '锚点在文件中必须唯一: ' + mut.anchor);

    // 原版正常运行断言
    const envClean = createTestEnv();
    assert(mut.criterion(envClean), '原版代码必须通过判据: ' + mut.name);

    // 注入变异
    const mutatedSrc = originSrc.replace(mut.anchor, mut.replacement);
    const overrides = {};
    overrides[mut.file] = mutatedSrc;
    const envMutated = createTestEnv(overrides);

    // 变异破坏后必须判定失败
    const passUnderMutation = mut.criterion(envMutated);
    assert(!passUnderMutation, '代码受破坏后判据不得通过（防假绿）: ' + mut.name);

    // 验证原版文件逐字节未受污染
    const currentOnDisk = fs.readFileSync(fullPath, 'utf8');
    assert.strictEqual(currentOnDisk, originSrc, '磁盘文件必须严格保持原样: ' + mut.file);
    console.log('  ✓ 负控制通过: ' + mut.name);
  }
  console.log('[PASS] v5-ex-1-2-3 负控制变异测试全部通过！');
}

runAll();