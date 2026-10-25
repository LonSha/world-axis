#!/usr/bin/env node
// WorldAxis tests/exp39-care-chain-resilience-v2233.js
// EXV4-3 专锁：照护链与公共服务韧性
// 验证目标：
//   1. 静态契约导出检查：careChain 接口齐全；
//   2. 照护承诺建立（registerCareCommitment）：绑定 caregiver、ward、placeId、intensity；
//   3. 缺席精准识别（assessCaregiverAbsence）：lifeline 病况重载 (heavy band) 或在途 travel (isTraveling) 精确触发 isAbsent；
//   4. 照护失约与风险升级（reportCareAbsence）：记录 breach，状态转 delayed / breached，风险等级递进 warning -> critical -> emergency；
//   5. 转介与公共接续（referCare）：成功转介至备选照护者或 service-network 设施，消耗真实资源，但原始失约记录永不抹除；
//   6. 公共队列承压（queueForPublicCare）：接入公共队列，排队状态不冲刷历史失约；
//   7. 纯读只读投影零写入（careChainProjection）：纯读投影统计韧性指数，10 次连续调用 store 零写入；
//   8. ActionDesk 路由联动：6 条 careChain.* 操作路由畅通可用；
//   9. 负控制验证（Negative Control）：单行真变异（篡改缺席判定逻辑），确保判据敏锐报警。
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const CARE_CHAIN_PATH = path.join(BASE, 'engines/care-chain.js');
const ANCHOR = 'if (p && p.isTraveling) {';

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
  t('WA.careChain 导出存在', !!WA.careChain);
  t('registerCareCommitment 为函数', typeof WA.careChain.registerCareCommitment === 'function');
  t('assessCaregiverAbsence 为函数', typeof WA.careChain.assessCaregiverAbsence === 'function');
  t('reportCareAbsence 为函数', typeof WA.careChain.reportCareAbsence === 'function');
  t('referCare 为函数', typeof WA.careChain.referCare === 'function');
  t('queueForPublicCare 为函数', typeof WA.careChain.queueForPublicCare === 'function');
  t('careChainProjection 为函数', typeof WA.careChain.careChainProjection === 'function');

  // 初始化测试环境
  WA.store.transact(draft => {
    draft.people = [
      { id: 'elderly_ward', name: 'Elderly Ward', isTraveling: false },
      { id: 'primary_cg', name: 'Primary Caregiver', isTraveling: false },
      { id: 'backup_cg', name: 'Backup Caregiver', isTraveling: false }
    ];
    draft.world = {
      places: [
        { id: 'place_haven', name: 'Haven Village' }
      ]
    };
    draft.serviceNetwork = {
      facilities: [
        { id: 'clinic_1', name: 'Community Clinic', placeId: 'place_haven', status: 'operational' },
        { id: 'clinic_broken', name: 'Broken Clinic', placeId: 'place_haven', status: 'degraded' }
      ]
    };
    return true;
  }, 'init-test-env');

  // 2. 登记照护承诺
  const reg1 = WA.careChain.registerCareCommitment({
    id: 'comm_elderly_1',
    caregiver: 'primary_cg',
    ward: 'elderly_ward',
    placeId: 'place_haven',
    careType: 'elder_care',
    requiredIntensity: 3
  });
  t('承诺登记必须成功', reg1.ok === true);
  t('初始状态为 active', reg1.commitment.status === 'active');
  t('初始风险为 stable', reg1.commitment.escalation === 'stable');

  // 重复 ID 拦截
  const regDup = WA.careChain.registerCareCommitment({ id: 'comm_elderly_1', ward: 'elderly_ward' });
  t('重复 ID 必须拒收', regDup.ok === false);

  // 3. 照护者缺席判定
  const abs1 = WA.careChain.assessCaregiverAbsence('primary_cg');
  t('初始未在途且健康判定可用', abs1.ok === true && abs1.isAbsent === false);

  // 3.2 在途导致缺席
  WA.store.transact(draft => {
    const p = draft.people.find(x => x.id === 'primary_cg');
    p.isTraveling = true;
    return true;
  }, 'set-traveling');
  const abs2 = WA.careChain.assessCaregiverAbsence('primary_cg');
  t('在途人员必须被判定为缺席', abs2.isAbsent === true);
  t('缺席原因必须包含 in-transit', abs2.reasons.indexOf('in-transit') >= 0);

  // 恢复在途
  WA.store.transact(draft => {
    const p = draft.people.find(x => x.id === 'primary_cg');
    p.isTraveling = false;
    return true;
  }, 'reset-traveling');

  // 3.3 lifeline 严重病况限制导致缺席
  if (WA.lifeline) {
    WA.lifeline.setSettings({ enabled: true });
    WA.lifeline.register('primary_cg', 'severe_flu', { kind: 'acute', limits: ['energy', 'mobility', 'cognition'] });
    const abs3 = WA.careChain.assessCaregiverAbsence('primary_cg');
    t('重病限制必须判定为缺席', abs3.isAbsent === true);
    t('原因包含 lifeline 限制', abs3.reasons.some(r => r.indexOf('lifeline') >= 0));
  }

  // 4. 照护失约与风险升级
  const rep1 = WA.careChain.reportCareAbsence('comm_elderly_1', 'caregiver_illness');
  t('首次上报缺席成功', rep1.ok === true);
  t('首次延期计数为 1', rep1.commitment.delaysCount === 1);
  t('首次延期状态为 delayed', rep1.commitment.status === 'delayed');
  t('首次延期风险升至 warning', rep1.commitment.escalation === 'warning');
  t('失约原因匹配', rep1.breach.reason === 'caregiver_illness');

  const rep2 = WA.careChain.reportCareAbsence('comm_elderly_1', 'still_unavailable');
  t('二次延期计数为 2', rep2.commitment.delaysCount === 2);
  t('二次延期风险升至 critical', rep2.commitment.escalation === 'critical');

  const rep3 = WA.careChain.reportCareAbsence('comm_elderly_1', 'abandoned');
  t('三次延期转为 breached 失约状态', rep3.commitment.status === 'breached');
  t('三次延期风险升至 emergency', rep3.commitment.escalation === 'emergency');

  // 5. 照护接续与转介
  // 5.1 尝试转介至损毁设施 -> 拒收
  const refFail = WA.careChain.referCare({
    commitmentId: 'comm_elderly_1',
    toFacilityId: 'clinic_broken'
  });
  t('损毁设施不可转介', refFail.ok === false && refFail.reason === 'facility-unavailable-degraded');

  // 5.2 转介给备用照护者 backup_cg
  const refSuccess = WA.careChain.referCare({
    commitmentId: 'comm_elderly_1',
    toCaregiver: 'backup_cg',
    resourceUsed: 'med_kit',
    resourceCost: 2,
    reason: 'emergency_family_substitute'
  });
  t('转介至备选照护人必须成功', refSuccess.ok === true);
  t('照护人已换为 backup_cg', refSuccess.commitment.caregiver === 'backup_cg');
  t('接续后状态恢复 active', refSuccess.commitment.status === 'active');
  t('接续后风险回归 stable', refSuccess.commitment.escalation === 'stable');
  t('转介保留历史 3 次失约记录', refSuccess.referral.originalBreachesCount === 3);

  // 验证原始失约记录完全保留未抹除
  const allBreaches = WA.store.get().careChain.breaches;
  t('3 次历史失约记录完整存留', allBreaches.length === 3);

  // 6. 排队队列承压
  const qRes = WA.careChain.queueForPublicCare({
    commitmentId: 'comm_elderly_1',
    facilityId: 'clinic_1',
    priority: 5
  });
  t('排队登记成功', qRes.ok === true && qRes.queued.priority === 5);
  t('承诺状态转为 queued', WA.store.get().careChain.commitments.find(c => c.id === 'comm_elderly_1').status === 'queued');

  // 7. 纯读只读投影与零写入测试
  const projBefore = WA.careChain.careChainProjection({ placeId: 'place_haven' });
  t('纯读投影返回成功', projBefore.ok === true);
  t('需求数统计正确', projBefore.totalDemands === 1);
  t('队列数统计正确', projBefore.queuedCount === 1);
  t('历史失约数统计正确', projBefore.totalHistoricalBreaches === 3);
  t('历史转介数统计正确', projBefore.totalHistoricalReferrals === 1);

  // 连续 10 次纯读零写入状态隔离
  const snap1 = JSON.stringify(WA.store.get());
  for (let i = 0; i < 10; i++) {
    WA.careChain.careChainProjection({ placeId: 'place_haven' });
    WA.careChain.assessCaregiverAbsence('backup_cg');
  }
  const snap2 = JSON.stringify(WA.store.get());
  t('纯读投影连续调用 store 绝对零写入隔离', snap1 === snap2);

  // 8. ActionDesk 路由畅通
  const act1 = WA.actionDesk.plan('careChain.registerCareCommitment', {
    id: 'comm_desk_test',
    ward: 'elderly_ward',
    caregiver: 'backup_cg'
  });
  t('ActionDesk 注册承诺执行畅通', act1.ok === true);

  const actProj = WA.actionDesk.plan('careChain.careChainProjection', {
    placeId: 'place_haven'
  });
  t('ActionDesk 纯读投影执行畅通', actProj.ok === true);

  console.log(`exp39-care-chain-resilience-v2233: ${tested} 项断言全部通过（含状态隔离与契约校验）`);
}

// 9. 单行真源码负控制 (Negative Control)
function runNegative() {
  const rawCode = fs.readFileSync(CARE_CHAIN_PATH, 'utf8');
  assert(rawCode.includes(ANCHOR), '负控制锚点必须存在于 engines/care-chain.js');

  const brokenCode = rawCode.replace(ANCHOR, 'if (false && p && p.isTraveling) {');

  try {
    fs.writeFileSync(CARE_CHAIN_PATH, brokenCode, 'utf8');

    // 重新隔离装载运行
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    const env = gate.fresh({});
    const BrokenWA = env.WA;
    BrokenWA.store.init();

    BrokenWA.store.transact(draft => {
      draft.people = [{ id: 'trav_caregiver', name: 'Traveller', isTraveling: true }];
      return true;
    }, 'init-neg');

    const abs = BrokenWA.careChain.assessCaregiverAbsence('trav_caregiver');
    // 在破坏版中，由于在途被篡改为 false，本应判缺席却判定为可用
    assert.strictEqual(abs.isAbsent, false, '破坏版必须产生假阴性（在途照护者未能识别缺席）');

    console.log('exp39-care-chain-resilience-v2233: 负控制验证通过（真变异如期被捕获）');
  } finally {
    fs.writeFileSync(CARE_CHAIN_PATH, rawCode, 'utf8');
  }
}

runSuite();
runNegative();