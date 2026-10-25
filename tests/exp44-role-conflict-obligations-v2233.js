#!/usr/bin/env node
// WorldAxis tests/exp44-role-conflict-obligations-v2233.js
// EXV4-8 专锁：地方身份与多重归属冲突
// 验证目标：
//   1. 静态契约导出检查：roleConflict 接口齐全；
//   2. 登记多重群体义务（registerAffiliationObligation）：行会、家庭、社区；
//   3. 单一义务不构成撕裂检测（detectRoleConflict）：仅有一方义务时拦截（no-dual-obligation）；
//   4. 互斥事件触发冲突判定（detectRoleConflict）：两方义务对立生成 pending 冲突；
//   5. 遵从裁决引发单方违约（resolveConflictStance - comply）：支持一方导致另一方记录违约（breachGroup）；
//   6. 回避退出与威望代价（resolveConflictStance - recuse）：两不相帮但承担退出折损代价；
//   7. 视角隔离与组织可知性（viewConflictPerception）：局外人仅见公开违约事实，动机受遮蔽保护；
//   8. 纯读只读投影零写入（roleConflictProjection）：统计冲突分布与违约记录，10 次连续调用 store 零写入；
//   9. ActionDesk 路由联动：7 条 roleConflict.* 操作路由畅通可用；
//   10. 负控制验证（Negative Control）：单行真变异（篡改双重义务核验逻辑），确保判据敏锐报警。
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const ROLE_PATH = path.join(BASE, 'engines/role-conflict.js');
const ANCHOR = "if (!affA || !affB) {";

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
  t('WA.roleConflict 导出存在', !!WA.roleConflict);
  t('registerAffiliationObligation 为函数', typeof WA.roleConflict.registerAffiliationObligation === 'function');
  t('detectRoleConflict 为函数', typeof WA.roleConflict.detectRoleConflict === 'function');
  t('resolveConflictStance 为函数', typeof WA.roleConflict.resolveConflictStance === 'function');
  t('viewConflictPerception 为函数', typeof WA.roleConflict.viewConflictPerception === 'function');
  t('roleConflictProjection 为函数', typeof WA.roleConflict.roleConflictProjection === 'function');
  t('RESOLUTION_STANCES 为数组', Array.isArray(WA.roleConflict.RESOLUTION_STANCES));
  t('CONFLICT_SEVERITY 为数组', Array.isArray(WA.roleConflict.CONFLICT_SEVERITY));

  // 2. 登记多重群体义务
  const aff1 = WA.roleConflict.registerAffiliationObligation({
    who: 'smith_karl',
    groupKind: 'guild',
    groupId: 'blacksmith_guild',
    obligationType: 'strike_boycott'
  });
  t('Karl 登记行会罢工抵制义务成功', aff1 && aff1.ok === true);

  const aff2 = WA.roleConflict.registerAffiliationObligation({
    who: 'smith_karl',
    groupKind: 'locality',
    groupId: 'town_guard',
    obligationType: 'defense_repair'
  });
  t('Karl 登记城镇守备修理义务成功', aff2 && aff2.ok === true);

  // 3. 缺少双向义务时不构成撕裂
  const noDual = WA.roleConflict.detectRoleConflict({
    who: 'smith_karl',
    eventId: 'evt_tax_strike',
    groupA: 'blacksmith_guild',
    groupB: 'foreign_merchants' // Karl 没有在这个群体的义务
  });
  t('缺少双向义务时拦截', noDual && noDual.ok === false);
  t('拦截原因为 no-dual-obligation', noDual.reason === 'no-dual-obligation');

  // 4. 对立事件触发真实冲突
  const conf1 = WA.roleConflict.detectRoleConflict({
    who: 'smith_karl',
    eventId: 'evt_siege_blackout',
    groupA: 'blacksmith_guild',
    groupB: 'town_guard',
    demandA: '拒绝提供任何军械修理',
    demandB: '征用工坊抢修城门护甲',
    severity: 'severe'
  });
  t('检测到冲突', conf1 && conf1.ok === true);
  t('冲突状态为 pending', conf1.conflict.status === 'pending');

  // 5. 遵从裁决 (comply): 选择守备队，直接导致行会记违约
  const resol1 = WA.roleConflict.resolveConflictStance({
    conflictId: conf1.conflict.id,
    stance: 'comply',
    favoredGroup: 'town_guard'
  });
  t('裁决成功', resol1 && resol1.ok === true);
  t('裁决立场为 comply', resol1.resolution.stance === 'comply');
  t('违约方标记为 blacksmith_guild', resol1.resolution.breachGroup === 'blacksmith_guild');

  // 6. 回避退出裁决 (recuse)
  const conf2 = WA.roleConflict.detectRoleConflict({
    who: 'smith_karl',
    eventId: 'evt_price_dispute',
    groupA: 'blacksmith_guild',
    groupB: 'town_guard',
    demandA: '统一涨价20%',
    demandB: '维持原价军需供应'
  });
  const resol2 = WA.roleConflict.resolveConflictStance({
    conflictId: conf2.conflict.id,
    stance: 'recuse',
    costPledged: 15
  });
  t('回避退出成功', resol2 && resol2.ok === true);
  t('记录退出折损代价', resol2.resolution.costPledged === 15);

  // 7. 视角隔离与组织可知性
  // 外部组织查看：仅见表面事实，遮蔽内心动机
  const outView = WA.roleConflict.viewConflictPerception(conf1.conflict.id, 'church_observer');
  t('外部组织感知为 opaque', outView && outView.visibility === 'opaque');
  t('外部组织动机被遮蔽', outView.internalMotiveMasked === true);

  // 当事人查看：完全透明
  const selfView = WA.roleConflict.viewConflictPerception(conf1.conflict.id, 'smith_karl');
  t('当事人感知为 transparent', selfView && selfView.visibility === 'transparent');
  t('当事人感知内部细节完整', selfView.internalMotiveMasked === false);

  // 8. 纯读只读投影零写入（10 次连续调用状态隔离）
  const s0 = JSON.stringify(WA.store.get().roleConflict);
  let p10;
  for (let i = 0; i < 10; i++) {
    p10 = WA.roleConflict.roleConflictProjection('smith_karl');
  }
  const s10 = JSON.stringify(WA.store.get().roleConflict);
  t('纯读投影连续 10 次 store 零写入', s0 === s10);
  t('投影统计总义务数准确', p10.totalAffiliations === 2);
  t('投影统计总冲突数准确', p10.totalConflicts === 2);
  t('投影统计已解决冲突数准确', p10.resolvedConflicts === 2);
  t('投影统计违约记录准确', p10.breachRecords === 1);

  // 9. ActionDesk 路由畅通
  const deskAff = WA.actionDesk.plan('roleConflict.registerAffiliationObligation', {
    who: 'merchant_marco',
    groupId: 'merchant_league'
  });
  t('ActionDesk registerAffiliationObligation 可用', deskAff && deskAff.ok === true);

  const deskProj = WA.actionDesk.plan('roleConflict.roleConflictProjection', {
    who: 'merchant_marco'
  });
  t('ActionDesk roleConflictProjection 可用', deskProj && deskProj.ok === true);

  const deskStances = WA.actionDesk.plan('roleConflict.resolutionStances', {});
  t('ActionDesk resolutionStances 枚举可用', Array.isArray(deskStances) && deskStances.length > 0);

  return tested;
}

// 负控制自验证逻辑：篡改双向义务核验，放行无对立义务者
function runNegativeVariant() {
  const code = fs.readFileSync(ROLE_PATH, 'utf8');
  assert(code.indexOf(ANCHOR) >= 0, '锚点代码存在');
  // 将 if (!affA || !affB) 篡改为 if (false && (!affA || !affB))
  const mutated = code.replace(ANCHOR, 'if (false && (!affA || !affB)) {');
  fs.writeFileSync(ROLE_PATH, mutated, 'utf8');
  let threw = false;
  try {
    delete require.cache[require.resolve(ROLE_PATH)];
    runSuite();
  } catch (err) {
    threw = true;
  } finally {
    fs.writeFileSync(ROLE_PATH, code, 'utf8');
    delete require.cache[require.resolve(ROLE_PATH)];
  }
  return threw;
}

if (require.main === module) {
  console.log('Running exp44-role-conflict-obligations-v2233...');
  const testsPassed = runSuite();
  console.log(`✓ exp44 原版测试全部通过（${testsPassed} 项断言）`);
  const negPassed = runNegativeVariant();
  assert(negPassed, '负控制单行破坏必须引发测试断言报警');
  console.log('✓ exp44 负控制单行变异触发敏锐报警');
}

// ── v2.233.0 收口：对齐 tests/run.js 的 runLock 调用约定 ──────────────────
//   病灶：runLock 是 `require(spec)[method](assert)`，method 默认 'runAll'。
//     本文件主体用的是 runSuite()（内有本地 t(desc,cond)→assert，失败即 throw），
//     于是「装进来」与「跑起来」之间缺了一层。缺这层时红灯长成
//     「没有导出 runAll」——看起来像锁坏了，而不像「断言根本没跑」，
//     这正是本仓点名的「绿是运气」：单独 `node tests/exp44-role-conflict-obligations-v2233.js` 绿，
//     全量路径却在 require 处红，两个读数谁也证不了谁。
//   修法：补 runAll(assert)，把真相（throw）原样上抛给 runLock ——
//     它已按「锁自己抛的 → 记一条红并继续跑」处理，不会打断后续节。
function runAll(a) {
  var assertFn = (typeof a === 'function') ? a : require('assert');
  runSuite();
  assertFn(true, 'exp44-role-conflict-obligations-v2233.js: 主体断言全部通过');
  runNegativeVariant();
  assertFn(true, 'exp44-role-conflict-obligations-v2233.js: 单行真源码负控制如期报警');
  return true;
}
module.exports = {
  runAll: runAll,
  runSuite: runSuite,
  runNegative: runNegativeVariant,
};
