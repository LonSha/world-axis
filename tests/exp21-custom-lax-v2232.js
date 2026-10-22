'use strict';
// WorldAxis tests/exp21-custom-lax-v2232.js
// 验证 IN-4 习俗到制度：惯例候选→组织批准→规则生效→不满复审→真变异负控制

const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  W.inst.setSettings({ enabled: true });
  return W;
}

let pass = 0, fail = 0;
function a(desc, cond) {
  if (cond) pass++;
  else { fail++; console.error('FAIL: ' + desc); }
}

// 辅助：建一个带 approve 权限职位并任命
function setupOrg(W) {
  W.inst.charter('org_workshop', { kind: '公司', name: '工坊', replace: true });
  W.inst.post('org_workshop', '会长', { perms: ['approve', 'grant', 'hire', 'punish'] });
  W.inst.assign('org_workshop', '会长', '张三', { replace: true });
}

async function runPositive() {
  const W = env();
  setupOrg(W);

  // 1. 惯例候选（需两次重复发生）
  const c1 = W.customLax.spawnCandidate({
    orgId: 'org_workshop',
    ruleType: 'slot-booking',
    sourceEventId: 'evt_slot_conflict_1',
    summary: '工坊排班冲突频发，提议预约制度',
    by: '张三',
    occurrenceCount: 3
  });
  a('惯例候选创建成功', c1 && c1.ok);
  a('候选有来源事件', c1.candidate.sourceEventId === 'evt_slot_conflict_1');

  // 拒绝单次事件
  const cBad = W.customLax.spawnCandidate({
    orgId: 'org_workshop', ruleType: 'slot-booking',
    sourceEventId: 'evt_single', by: '张三', occurrenceCount: 1
  });
  a('单次发生不形成惯例候选', cBad && !cBad.ok && cBad.reason === 'insufficient-occurrences');

  // 2. 提交组织批准链
  const s1 = W.customLax.submitToApproval(c1.candidate.id, { by: '张三' });
  a('提交批准链成功', s1 && s1.ok && !!s1.instDecisionId);

  // 3. 未经批准不能成规则
  const eBad = W.customLax.enactRule(c1.candidate.id, {});
  a('未经 inst 批准时不能成规则', eBad && !eBad.ok && eBad.reason === 'not-approved-by-inst');

  // inst 批准
  W.inst.decide('org_workshop', s1.instDecisionId, 'approved', { by: '张三' });

  // 4. 批准后成规则
  const e1 = W.customLax.enactRule(c1.candidate.id, {});
  a('批准后规则生效', e1 && e1.ok && e1.rule.status === 'active');

  // 5. 不同组织不受该规则影响
  const rules1 = W.customLax.activeRules('org_workshop');
  a('当前组织有一条生效规则', rules1.count === 1);
  const rules2 = W.customLax.activeRules('org_other');
  a('其他组织无此规则', rules2.count === 0);

  // 6. 不满积累触发复审
  const d1 = W.customLax.registerDissatisfaction(e1.rule.id, '李四');
  a('不满登记成功', d1 && d1.ok && d1.dissatisfaction === 1);
  W.customLax.registerDissatisfaction(e1.rule.id, '王五');
  const d3 = W.customLax.registerDissatisfaction(e1.rule.id, '赵六');
  a('不满达阈值触发复审', d3 && d3.reviewTriggered === true);

  // 7. 复审撤销
  const r1 = W.customLax.reviewRule(e1.rule.id, { outcome: 'revoked', by: '张三' });
  a('复审撤销成功', r1 && r1.ok && r1.outcome === 'revoked');
  const rulesAfter = W.customLax.activeRules('org_workshop');
  a('撤销后无生效规则', rulesAfter.count === 0);

  // 8. 行动桌路由联通
  const deskRes = W.actionDesk.plan('customLax.spawnCandidate', {
    spec: { orgId: 'org_workshop', ruleType: 'duty-roster', sourceEventId: 'evt_duty_2', by: '张三', occurrenceCount: 2 }
  });
  a('行动桌 customLax.spawnCandidate 路由成功', deskRes && deskRes.ok);
}

async function runNegative() {
  const filePath = path.resolve(__dirname, '../engines/custom-lax.js');
  const rawCode = fs.readFileSync(filePath, 'utf8');

  // 变异 1: 破坏 occurrenceCount 最低要求（改为 >=1）
  const anchor1 = "if (occurrenceCount < 2) {";
  if (rawCode.split(anchor1).length < 2) throw new Error('anchor1 not found or duplicate');
  const mutated1 = rawCode.replace(anchor1, "if (occurrenceCount < 1) {");

  const W1 = env({ 'engines/custom-lax.js': mutated1 });
  setupOrg(W1);
  const neg1 = W1.customLax.spawnCandidate({
    orgId: 'org_workshop', ruleType: 'slot-booking',
    sourceEventId: 'evt_x', by: '张三', occurrenceCount: 1
  });
  a('负控制1: 单次事件门槛被破坏后应放行（证明判据真在守）', neg1 && neg1.ok);

  // 变异 2: 破坏 inst 批准核验，使其永远 verified=true
  const anchor2 = "var verified = false;";
  if (rawCode.split(anchor2).length < 2) throw new Error('anchor2 not found or duplicate');
  const mutated2 = rawCode.replace(anchor2, "var verified = true;");

  const W2 = env({ 'engines/custom-lax.js': mutated2 });
  setupOrg(W2);
  const c2 = W2.customLax.spawnCandidate({
    orgId: 'org_workshop', ruleType: 'slot-booking',
    sourceEventId: 'evt_2', by: '张三', occurrenceCount: 2
  });
  W2.customLax.submitToApproval(c2.candidate.id, { by: '张三' });
  // 不经 inst.decide 直接 enact
  const neg2 = W2.customLax.enactRule(c2.candidate.id, {});
  a('负控制2: 批准核验破坏后未经批准即可成规则（证明判据真在守）', neg2 && neg2.ok);
}


async function runAll() { await runPositive(); }
module.exports = { runAll, runNegative };

(async function main() {
  console.log('[exp21-custom-lax] 开始正向功能测试...');
  await runPositive();
  console.log('[exp21-custom-lax] 开始真变异负控制测试...');
  await runNegative();
  console.log('[exp21-custom-lax] 测试完成: pass=' + pass + ', fail=' + fail);
  process.exitCode = fail ? 1 : 0;
})();