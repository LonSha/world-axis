'use strict';
/**
 * WorldAxis tests/v5-op-7-8-9.js (v2.241.0)
 * 专项锁定与门禁验证：
 *   - OPV5-7: 空间微气候与环境阻力融合 (weather.getMicroclimate & sceneNarrative.situation 挂接)
 *   - OPV5-8: 长时作息时间积分散步与体力自愈结算 (livingWorld.integrateLongRest，含口粮抵消与自愈阶梯)
 *   - OPV5-9: 正文全景叙事透镜动态剪裁 (livingWorld.buildBlock 动态 compact/standard/full 剪裁与上限截断)
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
  W.livingWorld.setSettings({ enabled: true, metabolicLoopEnabled: true });
  W.weather.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });

  W.store.transact(function (draft) {
    draft.evolution.economy = { climate: '平稳' };
    draft.elsewhere = draft.elsewhere || {};
    draft.elsewhere.rows = [
      { name: '柳掌柜', place: '前门大街', doing: '核算账本', worry: '货栈粮价飞涨' },
      { name: '常镖头', place: '前门大街', doing: '查验货箱', worry: '盘缠吃紧' },
      { name: '孙捕头', place: '东四牌楼', doing: '巡街设卡', worry: '夜禁搜捕' },
      { name: '赵账房', place: '通州码头', doing: '装卸清点', worry: '漕船滞留' }
    ];
    return true;
  }, 'test:seed_v5_op789');

  return freshInst;
}

function testOPV5_7(inst) {
  const W = inst.WA;
  W.world = { reach: function () { return { ok: true }; } };
  W.weather.setWeather('前门大街', 'rain');

  // 1. 直接调用 weather.getMicroclimate
  const mc = W.weather.getMicroclimate('前门大街', { terrain: 'lowlying' });
  if (!mc || !mc.ok) return false;
  if (mc.dragMultiplier !== 1.8) return false;
  if (mc.mobilityPenalty !== 40) return false;
  if (!Array.isArray(mc.sensoryTags) || !mc.sensoryTags.includes('泥泞深陷')) return false;

  // 2. 行动桌路由
  const deskRes = W.actionDesk.plan('weather.getMicroclimate', { place: '前门大街', terrain: 'lowlying' });
  if (!deskRes || !deskRes.ok || deskRes.dragMultiplier !== 1.8) return false;

  // 3. sceneNarrative.situation 投影挂接
  const sit = W.sceneNarrative.situation({ place: '前门大街', terrain: 'lowlying' });
  if (!sit || !sit.ok || !sit.microclimate || sit.microclimate.dragMultiplier !== 1.8) return false;

  return true;
}

function testOPV5_8(inst) {
  const W = inst.WA;
  W.store.transact(function (draft) {
    const b = draft.livingWorld = draft.livingWorld || {};
    b.characterStates = b.characterStates || {};
    b.characterStates['常镖头'] = {
      name: '常镖头',
      occupation: '镖师',
      vitalStrain: { weariness: 70, hunger: 20, weathering: 15 },
      belongings: { copper: 100, provisions: 2, tools: [], keepsakes: [] },
      absence: { roundsAway: 0, accumulatedGratitude: 0, grievances: 0 }
    };
    return true;
  });

  // 1. 休息 6 小时 (standard: 5/hr -> 恢复 30 疲劳，饥饿增加 15 -> 35)
  const rest1 = W.livingWorld.integrateLongRest('常镖头', 6, { quality: 'standard' });
  if (!rest1 || !rest1.ok) return false;
  if (rest1.weariness.after !== 40 || rest1.weariness.recovered !== 30) return false;
  if (rest1.hunger.after !== 35 || rest1.hunger.provisionsConsumed !== 0) return false;

  // 2. 再次通过行动桌调用休息 8 小时 (shelter: 8/hr -> 恢复 40 全部疲劳，饥饿增加 20 -> 55 > 40，消耗口粮扣减 30 -> 25)
  const rest2 = W.actionDesk.plan('livingWorld.integrateLongRest', { name: '常镖头', elapsedHours: 8, quality: 'shelter' });
  if (!rest2 || !rest2.ok) return false;
  if (rest2.weariness.after !== 0) return false;
  if (rest2.hunger.provisionsConsumed !== 1 || rest2.hunger.after !== 25) return false;

  return true;
}

function testOPV5_9(inst) {
  const W = inst.WA;
  const fullBlock = W.livingWorld.buildBlock('前门大街', { detailLevel: 'full' });
  const compactBlock = W.livingWorld.buildBlock('前门大街', { detailLevel: 'compact' });

  if (typeof fullBlock !== 'string' || typeof compactBlock !== 'string') return false;
  if (!fullBlock.includes('柳掌柜') || !fullBlock.includes('赵账房')) return false;
  if (!compactBlock.includes('柳掌柜') || !compactBlock.includes('常镖头')) return false;
  // compact 必须剪裁边缘角色
  if (compactBlock.includes('赵账房')) return false;

  // 超限截断验证
  const cappedBlock = W.livingWorld.buildBlock('前门大街', { detailLevel: 'full', maxLines: 3 });
  if (!cappedBlock.includes('精炼收敛')) return false;

  return true;
}

function runAll() {
  console.log('[v5-op-7-8-9] 开始正向断言验收...');
  const env = createTestEnv();
  assert(testOPV5_7(env), 'OPV5-7 (微气候与情境感知) 验收必须通过');
  assert(testOPV5_8(env), 'OPV5-8 (长时作息散步与体力自愈) 验收必须通过');
  assert(testOPV5_9(env), 'OPV5-9 (叙事透镜动态剪裁) 验收必须通过');
  console.log('[PASS] v5-op-7-8-9 正向功能全部通过！');
  runNegative();
}

const mutations = [
  {
    name: 'OPV5-7_microclimate_mutated',
    file: 'engines/weather.js',
    anchor: "dragMultiplier = terrain === 'lowlying' ? 1.8 : 1.4;",
    replacement: "dragMultiplier = 1.0; /* mutated */",
    criterion: testOPV5_7
  },
  {
    name: 'OPV5-8_long_rest_mutated',
    file: 'engines/living-world.js',
    anchor: "let recoveryRatePerHour = quality === 'shelter' ? 8 : (quality === 'rough' ? 3 : 5);",
    replacement: "let recoveryRatePerHour = 0; /* mutated */",
    criterion: testOPV5_8
  },
  {
    name: 'OPV5-9_lens_compact_mutated',
    file: 'engines/living-world.js',
    anchor: "const charLimit = detailLevel === 'compact' ? 2 : (detailLevel === 'standard' ? 4 : 6);",
    replacement: "const charLimit = 6; /* mutated */",
    criterion: testOPV5_9
  }
];

function runNegative() {
  console.log('[v5-op-7-8-9] 开始运行单行真源码负控制破坏测试...');
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
  console.log('[PASS] v5-op-7-8-9 负控制变异测试全部通过！');
}

runAll();