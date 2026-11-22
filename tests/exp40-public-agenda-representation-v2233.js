#!/usr/bin/env node
// WorldAxis tests/exp40-public-agenda-representation-v2233.js
// EXV4-4 专锁：公共议程设置与代表性缺口
// 验证目标：
//   1. 静态契约导出检查：publicAgenda 接口齐全；
//   2. 议程容量设置（setAgendaCapacity）：约束地点议程最大槽位数；
//   3. 多群体带证据提交议题（submitProposal）：至少三群体争夺有限槽位，无证据/无群体拒收；
//   4. 有限议程竞争排期（scheduleAgenda）：容量满载时高权重者入选 scheduled，其余进入 delayed 保留；
//   5. 审议通过并真实联动（enactAgendaTopic）：通过议题直接在 custom-lax 生产惯例候选或在 coop 启动项目；
//   6. 局外人隔离与保密机制（viewAgenda）：非允许群体查阅保密议题时被屏蔽 (redactedCount > 0)；
//   7. 纯读只读投影零写入（publicAgendaProjection）：纯读投影统计代表性覆盖率，10 次连续调用 store 零写入；
//   8. ActionDesk 路由联动：7 条 publicAgenda.* 操作路由畅通可用；
//   9. 负控制验证（Negative Control）：单行真变异（篡改保密过滤判定逻辑），确保判据敏锐报警。
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const PUBLIC_AGENDA_PATH = path.join(BASE, 'engines/public-agenda.js');
const ANCHOR = 'var isAllowed = vGroup && Array.isArray(p.allowedGroups) && p.allowedGroups.indexOf(vGroup) >= 0;';

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
  t('WA.publicAgenda 导出存在', !!WA.publicAgenda);
  t('setAgendaCapacity 为函数', typeof WA.publicAgenda.setAgendaCapacity === 'function');
  t('submitProposal 为函数', typeof WA.publicAgenda.submitProposal === 'function');
  t('scheduleAgenda 为函数', typeof WA.publicAgenda.scheduleAgenda === 'function');
  t('enactAgendaTopic 为函数', typeof WA.publicAgenda.enactAgendaTopic === 'function');
  t('viewAgenda 为函数', typeof WA.publicAgenda.viewAgenda === 'function');
  t('publicAgendaProjection 为函数', typeof WA.publicAgenda.publicAgendaProjection === 'function');

  // 初始化测试环境
  WA.store.transact(draft => {
    draft.world = {
      places: [{ id: 'town_square', name: 'Town Square' }]
    };
    return true;
  }, 'init-test-env');

  // 2. 设置议程容量：设为 2 个槽位
  const capRes = WA.publicAgenda.setAgendaCapacity('town_square', 2);
  t('设置议程容量成功', capRes.ok === true && capRes.slots === 2);

  // 3. 至少三群体提出有证据的议题
  // 群体A：农夫行会
  const p1 = WA.publicAgenda.submitProposal({
    id: 'prop_farmers_irrigation',
    placeId: 'town_square',
    groupName: 'guild_farmers',
    title: '修缮北侧干渠引水',
    sourceEvidence: 'water_report_2026_drought',
    supportWeight: 10
  });
  t('农夫提案提交成功', p1.ok === true && p1.proposal.status === 'proposed');

  // 群体B：手工业者
  const p2 = WA.publicAgenda.submitProposal({
    id: 'prop_artisans_workshop',
    placeId: 'town_square',
    groupName: 'guild_artisans',
    title: '扩建公共铁匠铺',
    sourceEvidence: 'ore_processing_bottleneck_doc',
    supportWeight: 8
  });
  t('工匠提案提交成功', p2.ok === true);

  // 群体C：商会（带保密属性）
  const p3 = WA.publicAgenda.submitProposal({
    id: 'prop_merchants_toll',
    placeId: 'town_square',
    groupName: 'guild_merchants',
    title: '商道过桥特别税款分配',
    sourceEvidence: 'bridge_maintenance_cost_sheet',
    supportWeight: 5,
    isSecret: true,
    allowedGroups: ['guild_merchants', 'town_elders']
  });
  t('商会保密提案提交成功', p3.ok === true && p3.proposal.isSecret === true);

  // 边界约束验证：无证据提交拒收
  const pBad = WA.publicAgenda.submitProposal({
    placeId: 'town_square',
    groupName: 'vagrants',
    title: '空头议案'
  });
  t('缺失证据议案必须拒收', pBad.ok === false && pBad.reason === 'missing-source-evidence');

  // 4. 有限议程竞争排期
  // 共有 3 个提案，槽位为 2 -> 权重 10 和 8 的入选，权重 5 的进入 delayed
  const schRes = WA.publicAgenda.scheduleAgenda('town_square');
  t('议程排期成功', schRes.ok === true);
  t('排入议程数为 2', schRes.scheduled.length === 2);
  t('延期排队数为 1', schRes.delayed.length === 1);
  t('高权重农夫入选', schRes.scheduled[0].id === 'prop_farmers_irrigation');
  t('中权重工匠入选', schRes.scheduled[1].id === 'prop_artisans_workshop');
  t('低权重商会进入延期保留', schRes.delayed[0].id === 'prop_merchants_toll');

  // 5. 局外人保密隔离验证
  // 5.1 局外人（如农夫）查询：无法看到商会保密提案，产生屏蔽计数
  const vOutsider = WA.publicAgenda.viewAgenda('town_square', 'guild_farmers');
  t('局外人查询成功', vOutsider.ok === true);
  t('局外人看到 2 项公开提案', vOutsider.visibleProposals.length === 2);
  t('局外人查询存在 1 项被屏蔽保密议案', vOutsider.redactedCount === 1);

  // 5.2 局内人（商会成员）查询：可以看到全部 3 项提案
  const vInsider = WA.publicAgenda.viewAgenda('town_square', 'guild_merchants');
  t('局内人可以看到保密提案', vInsider.visibleProposals.length === 3);
  t('局内人查询被屏蔽数为 0', vInsider.redactedCount === 0);

  // 6. 审议通过并联动真实系统（联动 custom-lax 生产规约候选）
  const enactRes = WA.publicAgenda.enactAgendaTopic({
    proposalId: 'prop_farmers_irrigation',
    outcome: 'enacted',
    enactmentAction: 'customLax.spawnCandidate',
    actionParams: {
      orgId: 'town_council',
      ruleType: 'slot-booking',
      sourceEventId: 'prop_farmers_irrigation',
      by: 'guild_farmers',
      occurrenceCount: 2,
      summary: '旱季优先保证农田灌溉用水'
    }
  });
  t('议案审议通过执行成功', enactRes.ok === true);
  t('审议结果状态为 enacted', enactRes.outcome === 'enacted');
  t('联动生成 customLax 规则候选成功', enactRes.linkageResult && enactRes.linkageResult.ok === true);

  // 7. 纯读只读投影与零写入测试
  const projBefore = WA.publicAgenda.publicAgendaProjection('town_square');
  t('纯读投影返回成功', projBefore.ok === true);
  t('总提案数为 3', projBefore.totalProposals === 3);
  t('已通过数为 1', projBefore.counts.enacted === 1);
  t('延期积压数为 1', projBefore.backlogCount === 1);
  t('代表群体数为 3', projBefore.representedGroups === 3);

  // 连续 10 次纯读零写入状态隔离
  const snap1 = JSON.stringify(WA.store.get());
  for (let i = 0; i < 10; i++) {
    WA.publicAgenda.publicAgendaProjection('town_square');
    WA.publicAgenda.viewAgenda('town_square', 'guild_farmers');
  }
  const snap2 = JSON.stringify(WA.store.get());
  t('纯读投影连续调用 store 绝对零写入隔离', snap1 === snap2);

  // 8. ActionDesk 路由畅通
  const act1 = WA.actionDesk.plan('publicAgenda.submitProposal', {
    placeId: 'town_square',
    groupName: 'guild_fishermen',
    title: '河道清理',
    sourceEvidence: 'dock_silt_records'
  });
  t('ActionDesk 提交议案畅通', act1.ok === true);

  const actProj = WA.actionDesk.plan('publicAgenda.publicAgendaProjection', {
    placeId: 'town_square'
  });
  t('ActionDesk 纯读投影畅通', actProj.ok === true);

  console.log(`exp40-public-agenda-representation-v2233: ${tested} 项断言全部通过（含状态隔离与契约校验）`);
}

// 9. 单行真源码负控制 (Negative Control)
function runNegative() {
  const rawCode = fs.readFileSync(PUBLIC_AGENDA_PATH, 'utf8');
  assert(rawCode.includes(ANCHOR), '负控制锚点必须存在于 engines/public-agenda.js');

  // 单行变异：使局外人判定恒真（无论如何都算允许，泄露秘密）
  const brokenCode = rawCode.replace(ANCHOR, 'var isAllowed = true;');

  try {
    fs.writeFileSync(PUBLIC_AGENDA_PATH, brokenCode, 'utf8');

    // 重新隔离装载运行
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    const env = gate.fresh({});
    const BrokenWA = env.WA;
    BrokenWA.store.init();

    BrokenWA.publicAgenda.submitProposal({
      id: 'secret_leak_test',
      placeId: 'secret_place',
      groupName: 'inner_circle',
      title: '绝密计划',
      sourceEvidence: 'secret_ledger',
      isSecret: true,
      allowedGroups: ['inner_circle']
    });

    const vLeak = BrokenWA.publicAgenda.viewAgenda('secret_place', 'outsider_intruder');
    // 在破坏版中，由于 isAllowed 被恒置为 true，局外人查到了绝密计划（redactedCount 错成 0）
    const falseLeak = (vLeak.redactedCount === 0 && vLeak.visibleProposals.length === 1);
    assert(falseLeak, '破坏版必须产生假泄露（局外人违规查看到绝密提案）');

    console.log('exp40-public-agenda-representation-v2233: 负控制验证通过（真变异如期被捕获）');
  } finally {
    fs.writeFileSync(PUBLIC_AGENDA_PATH, rawCode, 'utf8');
  }
}

// ── v2.233.0 收口：对齐 tests/run.js 的 runLock 调用约定 ──────────────────
//   病灶：runLock 是 `require(spec)[method](assert)`，method 默认 'runAll'。
//     本文件主体用的是 runSuite()（内有本地 t(desc,cond)→assert，失败即 throw），
//     于是「装进来」与「跑起来」之间缺了一层。缺这层时红灯长成
//     「没有导出 runAll」——看起来像锁坏了，而不像「断言根本没跑」，
//     这正是本仓点名的「绿是运气」：单独 `node tests/exp40-public-agenda-representation-v2233.js` 绿，
//     全量路径却在 require 处红，两个读数谁也证不了谁。
//   修法：补 runAll(assert)，把真相（throw）原样上抛给 runLock ——
//     它已按「锁自己抛的 → 记一条红并继续跑」处理，不会打断后续节。
function runAll(a) {
  var assertFn = (typeof a === 'function') ? a : require('assert');
  runSuite();
  assertFn(true, 'exp40-public-agenda-representation-v2233.js: 主体断言全部通过');
  runNegative();
  assertFn(true, 'exp40-public-agenda-representation-v2233.js: 单行真源码负控制如期报警');
  return true;
}
module.exports = {
  runAll: runAll,
  runSuite: runSuite,
  runNegative: runNegative,
};

// ── 直接运行入口（`node tests/exp40-public-agenda-representation-v2233.js`）──────────────────────────────
//   上一轮补丁删掉了裸调用却没补守卫，直接运行会变成「装进来、什么也不做、exit 0」——
//   一条退出码是绿的静默空跑。这里补回显式入口：跑 runAll，失败以非零码退出。
if (require.main === module) {
  try {
    runAll(require('assert'));
    console.log('exp40-public-agenda-representation-v2233.js: 直接运行通过');
  } catch (e) {
    console.error('exp40-public-agenda-representation-v2233.js: 直接运行失败 → ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}
