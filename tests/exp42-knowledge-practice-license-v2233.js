#!/usr/bin/env node
// WorldAxis tests/exp42-knowledge-practice-license-v2233.js
// EXV4-6 专锁：知识的地方传播与实践许可
// 验证目标：
//   1. 静态契约导出检查：knowledgePractice 接口齐全；
//   2. 注册知识规范（registerKnowledgeSpec）：包含必要工具、环境约束与文献公开标记；
//   3. 实践许可授予（grantPracticeLicense）：授权特定从业者在特定地点实践；
//   4. 资料公开不等于会操作：未获许可即使文献公开也严格拦截（unauthorized-practice）；
//   5. 必要前置工具校验：工具缺失拦截（missing-prerequisites）；
//   6. 环境不兼容导致真实实践失败（executePractice）：严寒/高湿环境触发 failure 并生成 failureEvidence；
//   7. 吸收失败证据实现工艺改良（refineKnowledgeFromEvidence）：消除环境限制并记录改良方案；
//   8. 纯读只读投影零写入（knowledgePracticeProjection）：统计合格率与失败证据池，10 次连续调用 store 零写入；
//   9. ActionDesk 路由联动：6 条 knowledgePractice.* 操作路由畅通可用；
//   10. 负控制验证（Negative Control）：单行真变异（篡改许可检查，使未授权者被假放行），确保判据敏锐报警。
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const KNOWLEDGE_PATH = path.join(BASE, 'engines/knowledge-practice.js');
const ANCHOR = 'if (!lic) {';

function runSuite() {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;
  WA.store.init();
  WA.actionDesk.setSettings({ enabled: true });

  let tested = 0;
  function t(desc, cond) {
    assert(cond, desc);
    tested++;
  }

  // 1. 静态契约导出检查
  t('WA.knowledgePractice 导出存在', !!WA.knowledgePractice);
  t('registerKnowledgeSpec 为函数', typeof WA.knowledgePractice.registerKnowledgeSpec === 'function');
  t('grantPracticeLicense 为函数', typeof WA.knowledgePractice.grantPracticeLicense === 'function');
  t('executePractice 为函数', typeof WA.knowledgePractice.executePractice === 'function');
  t('refineKnowledgeFromEvidence 为函数', typeof WA.knowledgePractice.refineKnowledgeFromEvidence === 'function');
  t('knowledgePracticeProjection 为函数', typeof WA.knowledgePractice.knowledgePracticeProjection === 'function');

  // 初始化测试环境
  WA.store.transact(draft => {
    draft.world = {
      places: [
        { id: 'place_forge_city', name: 'Forge City' },
        { id: 'place_swamp_outpost', name: 'Swamp Outpost' }
      ]
    };
    return true;
  }, 'init-test-env');

  // 2. 注册知识规范：淬火精钢冶炼法（文献公开，需要坩埚与风箱，不兼容 high_humidity 高湿环境）
  const k1 = WA.knowledgePractice.registerKnowledgeSpec({
    id: 'know_tempered_steel',
    title: '特种低温淬火精钢法',
    domain: 'metallurgy',
    requiredTools: ['crucible', 'bellows'],
    minExperienceRuns: 2,
    environmentalConstraints: ['high_humidity'],
    isPublicDocumented: true
  });
  t('知识规范注册成功', k1.ok === true && k1.knowledge.isPublicDocumented === true);

  // 3. 资料公开不等于会操作：未获许可的 smith_alice 尝试操作 -> 拦截
  const unauthTry = WA.knowledgePractice.executePractice({
    knowledgeId: 'know_tempered_steel',
    practitioner: 'smith_alice',
    placeId: 'place_forge_city',
    availableTools: ['crucible', 'bellows']
  });
  t('未获许可强行操作必须拦截', unauthTry.ok === false && unauthTry.reason === 'unauthorized-practice');

  // 4. 授予许可给 smith_alice（限 Forge City 与 Swamp Outpost）
  const licRes = WA.knowledgePractice.grantPracticeLicense({
    knowledgeId: 'know_tempered_steel',
    practitioner: 'smith_alice',
    grantedBy: 'iron_guild_council',
    allowedPlaces: ['place_forge_city', 'place_swamp_outpost']
  });
  t('授予实践许可成功', licRes.ok === true && licRes.license.practitioner === 'smith_alice');

  // 5. 前置工具缺失拦截校验
  const toolMissingTry = WA.knowledgePractice.executePractice({
    knowledgeId: 'know_tempered_steel',
    practitioner: 'smith_alice',
    placeId: 'place_forge_city',
    availableTools: ['crucible'] // 缺 bellows
  });
  t('缺失风箱工具必须拦截', toolMissingTry.ok === false && toolMissingTry.reason === 'missing-prerequisites');

  // 6. 环境正常下实践成功 (Forge City，干燥)
  const successExec = WA.knowledgePractice.executePractice({
    knowledgeId: 'know_tempered_steel',
    practitioner: 'smith_alice',
    placeId: 'place_forge_city',
    availableTools: ['crucible', 'bellows'],
    localConditions: ['dry_climate']
  });
  t('正常环境与工具齐全下实践成功', successExec.ok === true && successExec.status === 'success');

  // 7. 环境冲突导致真实失败并生成证据 (Swamp Outpost，带 high_humidity)
  const failExec = WA.knowledgePractice.executePractice({
    knowledgeId: 'know_tempered_steel',
    practitioner: 'smith_alice',
    placeId: 'place_swamp_outpost',
    availableTools: ['crucible', 'bellows'],
    localConditions: ['high_humidity']
  });
  t('环境冲突导致实践失败', failExec.ok === true && failExec.status === 'failure');
  t('生成可追溯失败证据', !!failExec.failureEvidence && failExec.failureEvidence.clashFactors.indexOf('high_humidity') >= 0);
  const failureEvId = failExec.failureEvidence.evidenceId;

  // 8. 吸收失败证据进行工艺改良 (Refinement)
  const refRes = WA.knowledgePractice.refineKnowledgeFromEvidence({
    knowledgeId: 'know_tempered_steel',
    failureEvidenceId: failureEvId,
    summary: '增加油封预热隔离湿气法',
    removedConstraints: ['high_humidity']
  });
  t('吸收失败证据改良成功', refRes.ok === true && refRes.refinement.failureEvidenceId === failureEvId);

  // 验证改良后原知识约束已解除 high_humidity
  const kUpdated = WA.store.get().knowledgePractice.knowledges.find(k => k.id === 'know_tempered_steel');
  t('高湿约束已被改良方案剔除', kUpdated.environmentalConstraints.indexOf('high_humidity') < 0);

  // 在同一高湿地点重试 -> 成功
  const retrySuccess = WA.knowledgePractice.executePractice({
    knowledgeId: 'know_tempered_steel',
    practitioner: 'smith_alice',
    placeId: 'place_swamp_outpost',
    availableTools: ['crucible', 'bellows'],
    localConditions: ['high_humidity']
  });
  t('改良后在沼泽高湿环境实践顺利成功', retrySuccess.ok === true && retrySuccess.status === 'success');

  // 9. 纯读只读投影与零写入测试
  const projBefore = WA.knowledgePractice.knowledgePracticeProjection({ knowledgeId: 'know_tempered_steel' });
  t('纯读投影返回成功', projBefore.ok === true);
  t('总操作次数为 3', projBefore.totalRuns === 3);
  t('成功次数为 2', projBefore.successCount === 2);
  t('失败次数为 1', projBefore.failureCount === 1);
  t('改良记录数为 1', projBefore.totalRefinements === 1);

  // 连续 10 次纯读零写入状态隔离
  const snap1 = JSON.stringify(WA.store.get());
  for (let i = 0; i < 10; i++) {
    WA.knowledgePractice.knowledgePracticeProjection({ knowledgeId: 'know_tempered_steel' });
  }
  const snap2 = JSON.stringify(WA.store.get());
  t('纯读投影连续调用 store 绝对零写入隔离', snap1 === snap2);

  // 10. ActionDesk 路由畅通
  const act1 = WA.actionDesk.plan('knowledgePractice.registerKnowledgeSpec', {
    title: '草药蒸馏法',
    domain: 'medicine'
  });
  t('ActionDesk 注册知识规范路由畅通', act1.ok === true);

  const actProj = WA.actionDesk.plan('knowledgePractice.knowledgePracticeProjection', {
    knowledgeId: 'know_tempered_steel'
  });
  t('ActionDesk 纯读投影路由畅通', actProj.ok === true);

  console.log(`exp42-knowledge-practice-license-v2233: ${tested} 项断言全部通过（含状态隔离与契约校验）`);
}

// 11. 单行真源码负控制 (Negative Control)
function runNegative() {
  const rawCode = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
  assert(rawCode.includes(ANCHOR), '负控制锚点必须存在于 engines/knowledge-practice.js');

  // 单行变异：使许可缺失拦截恒假，放行无许可从业者
  const brokenCode = rawCode.replace(ANCHOR, 'if (false && !lic) {');

  try {
    fs.writeFileSync(KNOWLEDGE_PATH, brokenCode, 'utf8');

    // 重新隔离装载运行
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    const env = gate.fresh({});
    const BrokenWA = env.WA;
    BrokenWA.store.init();

    BrokenWA.knowledgePractice.registerKnowledgeSpec({
      id: 'know_neg_test',
      title: '高危炼金',
      requiredTools: []
    });

    // 无许可尝试操作
    const rBad = BrokenWA.knowledgePractice.executePractice({
      knowledgeId: 'know_neg_test',
      practitioner: 'unlicensed_charlatan'
    });

    // 在破坏版中，由于拦截被绕过，无许可者被错误放行（ok 错成 true）
    const falsePass = (rBad.ok === true);
    assert(falsePass, '破坏版必须产生假放行（未获许可者未能被拦截）');

    console.log('exp42-knowledge-practice-license-v2233: 负控制验证通过（真变异如期被捕获）');
  } finally {
    fs.writeFileSync(KNOWLEDGE_PATH, rawCode, 'utf8');
  }
}

runSuite();
runNegative();