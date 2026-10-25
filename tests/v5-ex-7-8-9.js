'use strict';
/**
 * WorldAxis tests/v5-ex-7-8-9.js (v2.244.0)
 * 专项锁定与门禁验证：
 *   - EXV5-7: 世代意志托付与绝笔信使契约 (socialLegacy.entrustDeathbedPact & fulfillDeathbedPact)
 *   - EXV5-8: 玩家无声物理回波与微痕迹交互 (livingWorld.recordSilentEcho 压迫力积累与叙事透镜呈现)
 *   - EXV5-9: 世界脉搏自主偶发奇点突变 (evolution.triggerSingularityEruption 临界点黑天鹅爆发)
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
  W.livingWorld.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });

  W.store.transact(function (draft) {
    draft.evolution.economy = { climate: '动荡' };
    draft.evolution.factions = [
      { name: '顺天巡捕营', relation: '倾轧', vigilance: 85, status: '倾轧' }
    ];
    return true;
  });

  return freshInst;
}

function testEXV5_7(inst) {
  const W = inst.WA;
  // 1. 临终立约
  const pact = W.actionDesk.plan('socialLegacy.entrustDeathbedPact', {
    testator: '常镖头',
    trustee: '柳掌柜',
    bequest: '妥善护送镖银密匣出城交付遗孀',
    keepsake: '生锈的镖局铜令'
  });

  if (!pact || !pact.ok || pact.status !== 'pending_fulfillment') return false;
  if (pact.trustee !== '柳掌柜' || pact.testator !== '常镖头') return false;

  // 2. 履约核验
  const fulfill = W.actionDesk.plan('socialLegacy.fulfillDeathbedPact', {
    pactId: pact.pactId,
    trustee: '柳掌柜',
    outcome: 'fulfilled'
  });
  if (!fulfill || !fulfill.ok || fulfill.status !== 'fulfilled') return false;

  return true;
}

function testEXV5_8(inst) {
  const W = inst.WA;
  // 1. 记录 3 轮静默注视回波 (3*25 = 75 紧张度)
  const echo = W.actionDesk.plan('livingWorld.recordSilentEcho', {
    place: '前门大街茶摊',
    durationRounds: 3,
    gazeTarget: '孙捕头'
  });

  if (!echo || !echo.ok) return false;
  if (echo.tensionLevel !== 75) return false;
  if (!echo.echoAtmosphere.includes('疑窦与戒备已逼近临界点')) return false;

  // 2. 叙事透镜呈现验证
  const block = W.livingWorld.buildBlock('前门大街茶摊');
  if (!block.includes('静默对峙与无声物理回波') || !block.includes('前门大街茶摊')) return false;

  return true;
}

function testEXV5_9(inst) {
  const W = inst.WA;
  // 1. 临界突变爆发 (经济动荡 40 + 势力倾轧 40 = 80 >= 70)
  const eruption = W.actionDesk.plan('evolution.triggerSingularityEruption', {
    category: 'black_swan',
    title: '【未预警黑天鹅奇点事件】：通州漕运总暴动'
  });

  if (!eruption || !eruption.ok) return false;
  if (eruption.tensionScore !== 80) return false;
  if (!eruption.title.includes('通州漕运总暴动')) return false;

  // 2. 检查全域势力戒备拉满
  const snap = W.evolution.activeSnapshot();
  const fac = snap.factions.find(f => f.n === '顺天巡捕营');
  if (!fac || fac.st !== '紧急戒备') return false;

  return true;
}

function runAll() {
  console.log('[v5-ex-7-8-9] 开始正向断言验收...');
  const env = createTestEnv();
  assert(testEXV5_7(env), 'EXV5-7 (世代意志托付与绝笔信使契约) 验收必须通过');
  assert(testEXV5_8(env), 'EXV5-8 (玩家无声物理回波与微痕迹) 验收必须通过');
  assert(testEXV5_9(env), 'EXV5-9 (世界脉搏自主偶发奇点突变) 验收必须通过');
  console.log('[PASS] v5-ex-7-8-9 正向功能全部通过！');
  runNegative();
}

const mutations = [
  {
    name: 'EXV5-7_pact_status_mutated',
    file: 'engines/social-legacy.js',
    anchor: "status: 'pending_fulfillment', // 'pending_fulfillment', 'fulfilled', 'betrayed'",
    replacement: "status: 'broken', /* mutated */",
    criterion: testEXV5_7
  },
  {
    name: 'EXV5-8_tension_level_mutated',
    file: 'engines/living-world.js',
    anchor: "let tensionLevel = Math.min(100, rds * 25);",
    replacement: "let tensionLevel = 0; /* mutated */",
    criterion: testEXV5_8
  },
  {
    name: 'EXV5-9_singularity_threshold_mutated',
    file: 'engines/evolution.js',
    anchor: "if (tensionScore < 70 && !force) {",
    replacement: "if (true) { /* mutated */",
    criterion: testEXV5_9
  }
];

function runNegative() {
  console.log('[v5-ex-7-8-9] 开始运行单行真源码负控制破坏测试...');
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
  console.log('[PASS] v5-ex-7-8-9 负控制变异测试全部通过！');
}

runAll();