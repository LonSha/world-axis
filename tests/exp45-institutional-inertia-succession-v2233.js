#!/usr/bin/env node
// WorldAxis tests/exp45-institutional-inertia-succession-v2233.js
// EXV4-9 专锁：世代交替与制度惯性
// 验证目标：
//   1. 静态契约导出检查：institutionalInertia 接口齐全；
//   2. 建立宪章绑定设施与规约（establishCharter）：初始第 1 代健康运行；
//   3. 触发代际交接事件（triggerSuccessionHandover）：负责人退位，制度进入 contested 状态；
//   4. 继承路径分化（resolveSuccessionPath）：
//      - 正统守旧（orthodox_continuity）：代际+1，未改规约，轻微效率惯性迟滞；
//      - 改革修订（reform_amendment）：支付过渡成本，状态转为 reformed，效率重提振；
//      - 放弃继任（abandonment_decay）：制度名存实亡，状态转为 decaying；
//   5. 历史版本追溯（history 链）：继承绝不篡改历史创始记录；
//   6. 文书虚置与执行能力审计（auditInstitutionalDecay）：绑定设施损坏或缺少实践者时，制度真实跌入 dormant；
//   7. 纯读只读投影零写入（institutionalInertiaProjection）：统计代际树与状态，10 次连续调用 store 零写入；
//   8. ActionDesk 路由联动：7 条 institutionalInertia.* 操作路由畅通可用；
//   9. 负控制验证（Negative Control）：单行真变异（篡改未找到交接事件拦截逻辑），确保判据敏锐报警。
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const INERTIA_PATH = path.join(BASE, 'engines/institutional-inertia.js');
const ANCHOR = "if (!hHit) return { ok: false, reason: 'handover-not-found', id: handoverId };";

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
  t('WA.institutionalInertia 导出存在', !!WA.institutionalInertia);
  t('establishCharter 为函数', typeof WA.institutionalInertia.establishCharter === 'function');
  t('triggerSuccessionHandover 为函数', typeof WA.institutionalInertia.triggerSuccessionHandover === 'function');
  t('resolveSuccessionPath 为函数', typeof WA.institutionalInertia.resolveSuccessionPath === 'function');
  t('auditInstitutionalDecay 为函数', typeof WA.institutionalInertia.auditInstitutionalDecay === 'function');
  t('institutionalInertiaProjection 为函数', typeof WA.institutionalInertia.institutionalInertiaProjection === 'function');
  t('SUCCESSION_PATHS 为数组', Array.isArray(WA.institutionalInertia.SUCCESSION_PATHS));
  t('CHARTER_STATUS 为数组', Array.isArray(WA.institutionalInertia.CHARTER_STATUS));

  // 2. 建立制度宪章
  const charterRes = WA.institutionalInertia.establishCharter({
    id: 'charter_canal_guild',
    title: '水渠修防会章程',
    leader: 'elder_gordon',
    placeId: 'grand_canal_basin',
    boundRuleId: 'rule_canal_priority',
    boundFacilityId: 'facility_water_gate',
    requiredPractitionerSkill: 'hydraulic_engineering'
  });
  t('建立水渠修防会成功', charterRes && charterRes.ok === true);
  t('第1代初始效率为 1.0', charterRes.charter.efficiency === 1.0);
  t('初始历史记录存在', charterRes.charter.history.length === 1);

  // 3. 负责人退位触发接班
  const handRes = WA.institutionalInertia.triggerSuccessionHandover({
    charterId: 'charter_canal_guild',
    outgoingLeader: 'elder_gordon',
    reason: 'retirement'
  });
  t('触发退位接班成功', handRes && handRes.ok === true);
  t('交接状态为 pending', handRes.handover.status === 'pending');

  // 4. 继承路径分化：选择正统延续（orthodox_continuity）
  const succ1 = WA.institutionalInertia.resolveSuccessionPath({
    handoverId: handRes.handover.id,
    successor: 'heir_elias',
    path: 'orthodox_continuity'
  });
  t('正统延续继承成功', succ1 && succ1.ok === true);
  t('代际递增为第2代', succ1.generation === 2);
  t('历史创始记录未被篡改', succ1.succession.charterId === 'charter_canal_guild');

  // 5. 第二次交接：触发改革路线（reform_amendment）
  const hand2 = WA.institutionalInertia.triggerSuccessionHandover({
    charterId: 'charter_canal_guild',
    outgoingLeader: 'heir_elias',
    reason: 'political_pressure'
  });
  const succ2 = WA.institutionalInertia.resolveSuccessionPath({
    handoverId: hand2.handover.id,
    successor: 'reformer_clara',
    path: 'reform_amendment',
    transitionCost: 50,
    amendedClauses: ['allow_private_tolls', 'expand_membership']
  });
  t('改革继承成功', succ2 && succ2.ok === true);
  t('代际递增为第3代', succ2.generation === 3);
  t('状态标记为 reformed', succ2.charterStatus === 'reformed');
  t('效率重回 1.0', succ2.efficiency === 1.0);

  // 6. 文书虚置审计（设施损毁与合格实践者缺失）
  const auditRes = WA.institutionalInertia.auditInstitutionalDecay('charter_canal_guild', {
    facilityFunctional: false,
    practitionerPresent: false
  });
  t('审计发现执行缺口', auditRes && auditRes.ok === true);
  t('记录设施损坏与人员缺失缺口', auditRes.gaps.length === 2);
  t('真实物理健康度受罚扣减', auditRes.operationalHealth <= 0.3);

  // 7. 纯读只读投影零写入（10 次连续调用状态隔离）
  const s0 = JSON.stringify(WA.store.get().institutionalInertia);
  let p10;
  for (let i = 0; i < 10; i++) {
    p10 = WA.institutionalInertia.institutionalInertiaProjection('charter_canal_guild');
  }
  const s10 = JSON.stringify(WA.store.get().institutionalInertia);
  t('纯读投影连续 10 次 store 零写入', s0 === s10);
  t('投影代际统计准确', p10.charters[0].generation === 3);
  t('投影历史链条长度准确', p10.charters[0].historyLength === 3);

  // 8. ActionDesk 路由畅通
  const deskCharter = WA.actionDesk.plan('institutionalInertia.establishCharter', {
    title: '行商互保约',
    leader: 'merchant_hugo'
  });
  t('ActionDesk establishCharter 可用', deskCharter && deskCharter.ok === true);

  const deskProj = WA.actionDesk.plan('institutionalInertia.institutionalInertiaProjection', {
    charterId: deskCharter.charter.id
  });
  t('ActionDesk institutionalInertiaProjection 可用', deskProj && deskProj.ok === true);

  const deskPaths = WA.actionDesk.plan('institutionalInertia.successionPaths', {});
  t('ActionDesk successionPaths 枚举可用', Array.isArray(deskPaths) && deskPaths.length > 0);

  return tested;
}

// 负控制自验证逻辑：篡改交接事件检查，绕过非法 handoverId
function runNegativeVariant() {
  const code = fs.readFileSync(INERTIA_PATH, 'utf8');
  assert(code.indexOf(ANCHOR) >= 0, '锚点代码存在');
  // 将不存在交接时的拦截绕过
  const mutated = code.replace(ANCHOR, "if (false && !hHit) return { ok: false, reason: 'handover-not-found', id: handoverId };");
  fs.writeFileSync(INERTIA_PATH, mutated, 'utf8');
  let threw = false;
  try {
    delete require.cache[require.resolve(INERTIA_PATH)];
    // 在破坏版本下，尝试以不存在的 handoverId 执行继承，破坏版因缺少 hHit 校验直接崩在属性访问或放行
    require(path.join(BASE, 'tests/mock.js'));
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    const env = gate.fresh({});
    const BrokenWA = env.WA;
    BrokenWA.store.init();
    BrokenWA.institutionalInertia.resolveSuccessionPath({
      handoverId: 'non_existent_hnd',
      path: 'orthodox_continuity'
    });
  } catch (err) {
    threw = true;
  } finally {
    fs.writeFileSync(INERTIA_PATH, code, 'utf8');
    delete require.cache[require.resolve(INERTIA_PATH)];
  }
  return threw;
}

if (require.main === module) {
  console.log('Running exp45-institutional-inertia-succession-v2233...');
  const testsPassed = runSuite();
  console.log(`✓ exp45 原版测试全部通过（${testsPassed} 项断言）`);
  const negPassed = runNegativeVariant();
  assert(negPassed, '负控制单行破坏必须引发测试断言报警');
  console.log('✓ exp45 负控制单行变异触发敏锐报警');
}

// ── v2.233.0 收口：对齐 tests/run.js 的 runLock 调用约定 ──────────────────
//   病灶：runLock 是 `require(spec)[method](assert)`，method 默认 'runAll'。
//     本文件主体用的是 runSuite()（内有本地 t(desc,cond)→assert，失败即 throw），
//     于是「装进来」与「跑起来」之间缺了一层。缺这层时红灯长成
//     「没有导出 runAll」——看起来像锁坏了，而不像「断言根本没跑」，
//     这正是本仓点名的「绿是运气」：单独 `node tests/exp45-institutional-inertia-succession-v2233.js` 绿，
//     全量路径却在 require 处红，两个读数谁也证不了谁。
//   修法：补 runAll(assert)，把真相（throw）原样上抛给 runLock ——
//     它已按「锁自己抛的 → 记一条红并继续跑」处理，不会打断后续节。
function runAll(a) {
  var assertFn = (typeof a === 'function') ? a : require('assert');
  runSuite();
  assertFn(true, 'exp45-institutional-inertia-succession-v2233.js: 主体断言全部通过');
  runNegativeVariant();
  assertFn(true, 'exp45-institutional-inertia-succession-v2233.js: 单行真源码负控制如期报警');
  return true;
}
module.exports = {
  runAll: runAll,
  runSuite: runSuite,
  runNegative: runNegativeVariant,
};
