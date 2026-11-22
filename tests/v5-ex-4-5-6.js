'use strict';
/**
 * WorldAxis tests/v5-ex-4-5-6.js (v2.243.0)
 * 专项锁定与门禁验证：
 *   - EXV5-4: 官僚汇报时滞与避责虚报机制 (institutionalInertia.submitBureaucraticReport)
 *   - EXV5-5: 影子配给与黑市地下交换网络 (freight.issueShadowRation)
 *   - EXV5-6: 因果溯源与追责纠缠决策树 (causal.traceLiabilityTree)
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
  W.institutionalInertia.establishCharter({
    title: '顺天巡捕营章程',
    founder: '孙捕头',
    rules: ['盘查行迹', '宵禁巡夜']
  });
  W.freight.setSettings({ enabled: true });
  W.causal.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });

  W.store.transact(function (draft) {
    draft.causal = draft.causal || {};
    draft.causal.chains = [
      {
        id: 'c_fire_01',
        cause: '货栈失火',
        action: '粮库焚毁',
        who: '柳掌柜',
        affected: ['常镖头', '孙捕头'],
        institution: '通州总把口',
        stage: 'acted'
      }
    ];
    return true;
  });

  return freshInst;
}

function testEXV5_4(inst) {
  const W = inst.WA;
  // 1. 提交带重度粉饰的虚报公文
  const rep = W.actionDesk.plan('institutionalInertia.submitBureaucraticReport', {
    reporter: '孙捕头',
    institution: '顺天巡捕衙门',
    issueKey: '南门民变苗头',
    actualIncident: '饥民聚集冲击粮栈并与差役发生流血冲突',
    whitewashLevel: 'heavy_whitewash',
    delayRounds: 3
  });

  if (!rep || !rep.ok) return false;
  if (rep.delayRounds !== 3) return false;
  if (rep.riskEvasion !== 80) return false;
  if (!rep.sanitizedSummary.includes('局势平稳受控')) return false;

  return true;
}

function testEXV5_5(inst) {
  const W = inst.WA;
  // 1. 发放影子配给票
  const res = W.actionDesk.plan('freight.issueShadowRation', {
    person: '柳掌柜',
    resource: '精白面粉',
    amount: 5,
    premiumMultiplier: 3.0
  });

  if (!res || !res.ok) return false;
  if (res.amount !== 5) return false;
  if (res.totalRations !== 5) return false;
  if (res.shadowTokens !== 50) return false; // 5 * 10 = 50

  return true;
}

function testEXV5_6(inst) {
  const W = inst.WA;
  // 1. 沿因果决策树回溯追责责任链
  const tree = W.actionDesk.plan('causal.traceLiabilityTree', {
    incidentKey: '货栈失火',
    maxDepth: 3
  });

  if (!tree || !tree.ok) return false;
  if (tree.incident !== '货栈失火') return false;
  if (tree.primaryLiability !== '柳掌柜') return false;
  if (!Array.isArray(tree.suspects) || tree.suspects.length < 2) return false;
  if (!Array.isArray(tree.institutionalFailures) || tree.institutionalFailures.length === 0) return false;
  if (tree.institutionalFailures[0].institution !== '通州总把口') return false;

  return true;
}

function runAll() {
  console.log('[v5-ex-4-5-6] 开始正向断言验收...');
  const env = createTestEnv();
  assert(testEXV5_4(env), 'EXV5-4 (官僚汇报时滞与避责虚报) 验收必须通过');
  assert(testEXV5_5(env), 'EXV5-5 (影子配给与黑市地下交换) 验收必须通过');
  assert(testEXV5_6(env), 'EXV5-6 (因果溯源与追责决策树) 验收必须通过');
  console.log('[PASS] v5-ex-4-5-6 正向功能全部通过！');
  runNegative();
}

const mutations = [
  {
    name: 'EXV5-4_risk_evasion_mutated',
    file: 'engines/institutional-inertia.js',
    anchor: "riskEvasion = 80;",
    replacement: "riskEvasion = 0; /* mutated */",
    criterion: testEXV5_4
  },
  {
    name: 'EXV5-5_shadow_tokens_mutated',
    file: 'engines/freight.js',
    anchor: "ldg.tokens = (ldg.tokens || 0) + amt * 10;",
    replacement: "ldg.tokens = 0; /* mutated */",
    criterion: testEXV5_5
  },
  {
    name: 'EXV5-6_primary_liability_mutated',
    file: 'engines/causal.js',
    anchor: "primaryLiability: suspects.length > 0 ? suspects[0].person : 'unknown',",
    replacement: "primaryLiability: 'nobody', /* mutated */",
    criterion: testEXV5_6
  }
];

function runNegative() {
  console.log('[v5-ex-4-5-6] 开始运行单行真源码负控制破坏测试...');
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
  console.log('[PASS] v5-ex-4-5-6 负控制变异测试全部通过！');
}

runAll();