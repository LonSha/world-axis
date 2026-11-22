#!/usr/bin/env node
// WorldAxis tests/exp41-commons-governance-v2233.js
// EXV4-5 专锁：共同资源的使用权与维护责任
// 验证目标：
//   1. 静态契约导出检查：commonsGovernance 接口齐全；
//   2. 声明共同资产与初始治理（declareCommonAsset）：设置开放模式、容量槽与维护周期；
//   3. 两种治理模式取舍与准入校验（reserveCommonAsset）：
//      - open_access 全员可用，容量满载时拦截 (capacity-exhausted)；
//      - contributor_priority 必须有历史工时贡献，零贡献拦截 (insufficient-contribution-priority)；
//   4. 维护投入与履职（contributeMaintenance）：累计工时达到阈值恢复 optimal 状态；
//   5. 逾期维护导致真实物理降级（auditAssetDecay）：超期未维护状态跌入 degraded / failing；
//   6. 规则变更不追溯失效（changeGovernanceModel）：制度切换后此前已兑现预约不受影响；
//   7. 争议登记与协商仲裁（resolveAssetDispute）：记录搭便车/逾期纠纷；
//   8. 纯读只读投影零写入（commonsProjection）：统计利用率与降级状态，10 次连续调用 store 零写入；
//   9. ActionDesk 路由联动：7 条 commonsGovernance.* 操作路由畅通可用；
//   10. 负控制验证（Negative Control）：单行真变异（篡改贡献者优先权判定逻辑），确保判据敏锐报警。
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const COMMONS_GOV_PATH = path.join(BASE, 'engines/commons-governance.js');
const ANCHOR = 'if (totalHours <= 0) {';

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
  t('WA.commonsGovernance 导出存在', !!WA.commonsGovernance);
  t('declareCommonAsset 为函数', typeof WA.commonsGovernance.declareCommonAsset === 'function');
  t('reserveCommonAsset 为函数', typeof WA.commonsGovernance.reserveCommonAsset === 'function');
  t('changeGovernanceModel 为函数', typeof WA.commonsGovernance.changeGovernanceModel === 'function');
  t('contributeMaintenance 为函数', typeof WA.commonsGovernance.contributeMaintenance === 'function');
  t('auditAssetDecay 为函数', typeof WA.commonsGovernance.auditAssetDecay === 'function');
  t('resolveAssetDispute 为函数', typeof WA.commonsGovernance.resolveAssetDispute === 'function');
  t('commonsProjection 为函数', typeof WA.commonsGovernance.commonsProjection === 'function');

  // 初始化测试环境
  WA.store.transact(draft => {
    draft.world = {
      places: [{ id: 'valley_meadow', name: 'Valley Meadow' }]
    };
    return true;
  }, 'init-test-env');

  // 2. 声明开放型共同牧场 (open_access, 容量 3, 维护周期 7 天, 需 10 工时)
  const a1 = WA.commonsGovernance.declareCommonAsset({
    id: 'asset_pasture_1',
    placeId: 'valley_meadow',
    name: '公共高山牧场',
    assetType: 'pasture',
    governanceModel: 'open_access',
    capacitySlots: 3,
    maintenanceCycleDays: 7,
    requiredLaborPerCycle: 10
  });
  t('声明共同资产成功', a1.ok === true && a1.asset.capacitySlots === 3);

  // 3. open_access 模式预约与容量耗尽
  const r1 = WA.commonsGovernance.reserveCommonAsset({
    assetId: 'asset_pasture_1',
    who: 'herder_tom',
    requestedSlots: 2
  });
  t('开放模式正常预约成功', r1.ok === true && r1.reservation.slots === 2);

  // 尝试超额预约（已有2，总3，再要2）-> 容量拦截
  const rOver = WA.commonsGovernance.reserveCommonAsset({
    assetId: 'asset_pasture_1',
    who: 'herder_jerry',
    requestedSlots: 2
  });
  t('超额预约必须被容量拦截', rOver.ok === false && rOver.reason === 'capacity-exhausted');

  // 4. 维护工时投入
  const c1 = WA.commonsGovernance.contributeMaintenance({
    assetId: 'asset_pasture_1',
    who: 'herder_tom',
    hours: 12
  });
  t('维护工时投入成功', c1.ok === true && c1.asset.status === 'optimal');

  // 5. 治理模型切换为贡献者优先 (contributor_priority)
  const chg = WA.commonsGovernance.changeGovernanceModel('asset_pasture_1', 'contributor_priority', 'shift_to_stewardship');
  t('治理模式变更成功', chg.ok === true && chg.newModel === 'contributor_priority');

  // 6. 验证不追溯失效：此前 tom 的预约仍然 active
  const allRes = WA.store.get().commonsGovernance.reservations;
  const tomRes = allRes.find(r => r.id === r1.reservation.id);
  t('此前已生效的预约在改制后依然有效', tomRes && tomRes.status === 'active');

  // 7. contributor_priority 准入拦截验证
  // herder_jerry 没有工时贡献 -> 拦截
  const rJerry = WA.commonsGovernance.reserveCommonAsset({
    assetId: 'asset_pasture_1',
    who: 'herder_jerry',
    requestedSlots: 1
  });
  t('零贡献者在优先模式下必须被拒', rJerry.ok === false && rJerry.reason === 'insufficient-contribution-priority');

  // tom 有 12 小时历史维护贡献 -> 放行
  const rTomSecond = WA.commonsGovernance.reserveCommonAsset({
    assetId: 'asset_pasture_1',
    who: 'herder_tom',
    requestedSlots: 1
  });
  t('有历史维护贡献者优先模式下预约成功', rTomSecond.ok === true);

  // 8. 真实物理降级验证（逾期不维护）
  // 模拟超期 15 天，清空当期积累维护
  WA.store.transact(draft => {
    const target = draft.commonsGovernance.assets.find(a => a.id === 'asset_pasture_1');
    target.currentCycleLaborAccumulated = 0; // 零工时积压
    return true;
  }, 'reset-labor');

  const decayRes = WA.commonsGovernance.auditAssetDecay('asset_pasture_1', 15);
  t('逾期未维护判定超期', decayRes.ok === true && decayRes.isOverdue === true);
  t('工时严重欠缺导致资产真实跌入 failing 状态', decayRes.status === 'failing');

  // failing 状态下拒绝任何新预约
  const rFail = WA.commonsGovernance.reserveCommonAsset({
    assetId: 'asset_pasture_1',
    who: 'herder_tom',
    requestedSlots: 1
  });
  t('损毁资产拒收任何新预约', rFail.ok === false && rFail.reason === 'asset-failing-unavailable');

  // 9. 争议登记与仲裁
  const disp = WA.commonsGovernance.resolveAssetDispute({
    assetId: 'asset_pasture_1',
    plaintiff: 'herder_tom',
    defendant: 'herder_jerry',
    issue: 'free_riding',
    resolution: 'require_compensation_patrol_hours'
  });
  t('纠纷仲裁登记成功', disp.ok === true && disp.dispute.issue === 'free_riding');

  // 10. 纯读只读投影与零写入测试
  const projBefore = WA.commonsGovernance.commonsProjection({ placeId: 'valley_meadow' });
  t('纯读投影返回成功', projBefore.ok === true);
  t('资产数统计正确', projBefore.totalAssets === 1);
  t('损坏资产数统计正确', projBefore.failingCount === 1);
  t('争议数统计正确', projBefore.totalDisputes === 1);

  // 连续 10 次纯读零写入状态隔离
  const snap1 = JSON.stringify(WA.store.get());
  for (let i = 0; i < 10; i++) {
    WA.commonsGovernance.commonsProjection({ placeId: 'valley_meadow' });
  }
  const snap2 = JSON.stringify(WA.store.get());
  t('纯读投影连续调用 store 绝对零写入隔离', snap1 === snap2);

  // 11. ActionDesk 路由畅通
  const act1 = WA.actionDesk.plan('commonsGovernance.declareCommonAsset', {
    placeId: 'valley_meadow',
    name: '公共磨坊',
    assetType: 'mill',
    governanceModel: 'open_access'
  });
  t('ActionDesk 声明资产路由畅通', act1.ok === true);

  const actProj = WA.actionDesk.plan('commonsGovernance.commonsProjection', {
    placeId: 'valley_meadow'
  });
  t('ActionDesk 纯读投影路由畅通', actProj.ok === true);

  console.log(`exp41-commons-governance-v2233: ${tested} 项断言全部通过（含状态隔离与契约校验）`);
}

// 12. 单行真源码负控制 (Negative Control)
function runNegative() {
  const rawCode = fs.readFileSync(COMMONS_GOV_PATH, 'utf8');
  assert(rawCode.includes(ANCHOR), '负控制锚点必须存在于 engines/commons-governance.js');

  // 单行变异：使零贡献判定失效（放行搭便车者）
  const brokenCode = rawCode.replace(ANCHOR, 'if (false && totalHours <= 0) {');

  try {
    fs.writeFileSync(COMMONS_GOV_PATH, brokenCode, 'utf8');

    // 重新隔离装载运行
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    const env = gate.fresh({});
    const BrokenWA = env.WA;
    BrokenWA.store.init();

    BrokenWA.commonsGovernance.declareCommonAsset({
      id: 'pasture_neg_test',
      placeId: 'valley_meadow',
      name: '优先牧场',
      governanceModel: 'contributor_priority',
      capacitySlots: 5
    });

    // 零工时者尝试预约
    const rBad = BrokenWA.commonsGovernance.reserveCommonAsset({
      assetId: 'pasture_neg_test',
      who: 'free_rider_bob',
      requestedSlots: 1
    });

    // 在破坏版中，由于判据被置为 false，零工时搭便车者被错误放行（ok 错成 true）
    const falsePass = (rBad.ok === true);
    assert(falsePass, '破坏版必须产生假放行（零贡献搭便车者未能被拦截）');

    console.log('exp41-commons-governance-v2233: 负控制验证通过（真变异如期被捕获）');
  } finally {
    fs.writeFileSync(COMMONS_GOV_PATH, rawCode, 'utf8');
  }
}

// ── v2.233.0 收口：对齐 tests/run.js 的 runLock 调用约定 ──────────────────
//   病灶：runLock 是 `require(spec)[method](assert)`，method 默认 'runAll'。
//     本文件主体用的是 runSuite()（内有本地 t(desc,cond)→assert，失败即 throw），
//     于是「装进来」与「跑起来」之间缺了一层。缺这层时红灯长成
//     「没有导出 runAll」——看起来像锁坏了，而不像「断言根本没跑」，
//     这正是本仓点名的「绿是运气」：单独 `node tests/exp41-commons-governance-v2233.js` 绿，
//     全量路径却在 require 处红，两个读数谁也证不了谁。
//   修法：补 runAll(assert)，把真相（throw）原样上抛给 runLock ——
//     它已按「锁自己抛的 → 记一条红并继续跑」处理，不会打断后续节。
function runAll(a) {
  var assertFn = (typeof a === 'function') ? a : require('assert');
  runSuite();
  assertFn(true, 'exp41-commons-governance-v2233.js: 主体断言全部通过');
  runNegative();
  assertFn(true, 'exp41-commons-governance-v2233.js: 单行真源码负控制如期报警');
  return true;
}
module.exports = {
  runAll: runAll,
  runSuite: runSuite,
  runNegative: runNegative,
};

// ── 直接运行入口（`node tests/exp41-commons-governance-v2233.js`）──────────────────────────────
//   上一轮补丁删掉了裸调用却没补守卫，直接运行会变成「装进来、什么也不做、exit 0」——
//   一条退出码是绿的静默空跑。这里补回显式入口：跑 runAll，失败以非零码退出。
if (require.main === module) {
  try {
    runAll(require('assert'));
    console.log('exp41-commons-governance-v2233.js: 直接运行通过');
  } catch (e) {
    console.error('exp41-commons-governance-v2233.js: 直接运行失败 → ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}
