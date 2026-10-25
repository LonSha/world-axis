'use strict';
/**
 * WorldAxis tests/v5-op-4-5-6.js (v2.240.0)
 * 专项锁定与门禁验证：
 *   - OPV5-4: 多梯队阶梯物价与黑市溢价传导 (getTierPrice via actionDesk & 影响自主进食)
 *   - OPV5-5: 生理磨损与健康系统全面并轨 (weariness/hunger >= 85 触发 lifeline.register)
 *   - OPV5-6: 久别重逢心理重力交织三轴 (roundsAway 跨度 + favor 恩义 + grudge 裂痕 + secret 软肋)
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
  W.livingWorld.setSettings({ enabled: true, decayRounds: 5, metabolicLoopEnabled: true });
  W.lifeline.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });

  W.store.transact(function (draft) {
    draft.evolution.economy = { climate: '动荡' };
    draft.elsewhere = draft.elsewhere || {};
    draft.elsewhere.rows = [
      { name: '柳掌柜', place: '前门大街', doing: '盘算余粮', worry: '物价飞涨' },
      { name: '常镖头', place: '前门大街', doing: '饮茶小歇', worry: '盗匪猖獗' }
    ];
    return true;
  }, 'test:seed_v5_op456');

  return W;
}

// 判据①：OPV5-4 阶梯物价与黑市暗盘溢价传导
function testOPV5_4(W) {
  // 1. 标准平价
  const std = W.actionDesk.plan('livingWorld.getTierPrice', { tier: 'standard' });
  if (!std || !std.ok || std.multiplier !== 1.8) return false; // 动荡气候加权 1.8

  // 2. 黑市暗盘
  const bm = W.actionDesk.plan('livingWorld.getTierPrice', { tier: 'blackmarket' });
  if (!bm || !bm.ok || bm.multiplier !== 9.0) return false; // 5.0 * 1.8 = 9.0
  if (bm.finalPrice < std.finalPrice * 4) return false;

  return true;
}

// 判据②：OPV5-5 生理磨损超限并轨至 lifeline
function testOPV5_5(W) {
  // 人为将柳掌柜的磨损推至临界
  W.store.transact(function (draft) {
    const b = draft.livingWorld;
    b.characterStates = b.characterStates || {};
    b.characterStates['柳掌柜'] = {
      name: '柳掌柜',
      occupation: 'vendor',
      vitalStrain: { weariness: 90, hunger: 90, weathering: 50 },
      belongings: { copper: 0, provisions: 0, silver: 0, tools: [] }
    };
    return true;
  }, 'test:critical_strain');

  // 触发自治演进
  W.livingWorld.autonomousTick({});

  // 验证 lifeline 中是否生成重度病况
  const rows = W.lifeline.view('柳掌柜');
  if (!rows || !rows.ok || !Array.isArray(rows.rows) || rows.rows.length === 0) return false;
  const hasCollapse = rows.rows.some(r => r.cond.indexOf('虚脱') >= 0 || r.cond.indexOf('衰竭') >= 0);

  return hasCollapse;
}

// 判据③：OPV5-6 久别重逢心理重力三轴交织
function testOPV5_6(W) {
  // 设置常镖头离开 5 轮，且欠下柳掌柜恩义与嫌隙
  W.store.transact(function (draft) {
    const b = draft.livingWorld;
    b.characterStates = b.characterStates || {};
    b.characterStates['常镖头'] = {
      name: '常镖头',
      occupation: 'guard',
      vitalStrain: { weariness: 20, hunger: 20, weathering: 10 },
      belongings: { copper: 50, provisions: 2 },
      absence: { roundsAway: 5, accumulatedGratitude: 1 }
    };
    b.relationalDebts = [
      { from: '常镖头', to: '柳掌柜', type: 'favor', amount: 2, lastReason: '当年接济之恩' },
      { from: '常镖头', to: '柳掌柜', type: 'grudge', amount: 1, lastReason: '酒后失言嫌隙' }
    ];
    return true;
  }, 'test:reunion_setup');

  const enc = W.livingWorld.detectEncounters('前门大街');
  if (!enc || !enc.ok) return false;
  const cb = (enc.presentNPCs || []).find(n => n.name === '常镖头');
  if (!cb || !cb.reunionSubtext) return false;

  // 必须同时体现离散跨度（暌违5轮）、人情恩义（欠下2份）与旧日嫌隙（1）
  const st = cb.reunionSubtext;
  const hasAway = st.indexOf('暌违5轮') >= 0;
  const hasFavor = st.indexOf('2份未偿人情') >= 0;
  const hasGrudge = st.indexOf('旧日嫌隙（1）') >= 0;

  return !!(hasAway && hasFavor && hasGrudge);
}

function runAll() {
  console.log('[v5-op-4-5-6] 开始运行正向断言...');
  const W = createTestEnv();

  assert(testOPV5_4(W), 'OPV5-4 判定失败：多梯队物价与黑市溢价计算失常');
  assert(testOPV5_5(W), 'OPV5-5 判定失败：生理重度磨损未能成功并轨登记至 lifeline');
  assert(testOPV5_6(W), 'OPV5-6 判定失败：久别重逢重力三轴潜台词装配不全');

  console.log('[PASS] v5-op-4-5-6 所有正向断言全部通过！');
}

// 单行真源码破坏负控制变异测试
const mutations = [
  {
    name: 'OPV5-4_blackmarket_mutated',
    file: 'engines/living-world.js',
    anchor: "else if (t === 'blackmarket') mult = 5.0;",
    replacement: "else if (t === 'blackmarket') mult = 1.0; /* mutated */",
    criterion: testOPV5_4
  },
  {
    name: 'OPV5-5_lifeline_mutated',
    file: 'engines/living-world.js',
    anchor: "if (strain.weariness >= 85 || strain.hunger >= 85) {",
    replacement: "if (false) { /* mutated */",
    criterion: testOPV5_5
  },
  {
    name: 'OPV5-6_reunion_mutated',
    file: 'engines/living-world.js',
    anchor: "if (debtGrudge > 0) {",
    replacement: "if (false) { /* mutated */",
    criterion: testOPV5_6
  }
];

function runNegative() {
  console.log('[v5-op-4-5-6] 开始运行单行真源码负控制破坏测试...');
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
  console.log('[PASS] v5-op-4-5-6 负控制变异测试全部通过！');
}

runAll();
runNegative();