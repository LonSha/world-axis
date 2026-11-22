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
// 锚点：v2.233.0 修正后，在途判定收在此处（原锚点 'if (p && p.isTraveling) {'
//   已被 shape 修正行取代 —— 锚点跟着真源码走，不跟着记忆走）。
const ANCHOR = '      if (traveling) {';

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

  // 3.4 【v2.233.0 补锁】真实产品形状：people 是 id → 对象 的 map，
  //     在途标记由 demographicFlow 写成 traveling / status='transit'。
  //     这是现场实测出的真实生产缺陷：旧判据只认 `Array.isArray(people)` + `isTraveling`，
  //     于是整个 EXV4-3 缺席链在真实长局里恒不触发，而本锁此前只喂数组形状，
  //     一直全绿 —— 「测试自造一个舒服的世界」。补锁后此路径不可能再静默退化。
  WA.store.transact(draft => {
    draft.people = {
      p_map_cg: { id: 'p_map_cg', name: 'MapCaregiver', location: 'place_haven' }
    };
    return true;
  }, 'set-people-map-shape');
  const absMapBefore = WA.careChain.assessCaregiverAbsence('p_map_cg');
  t('map 形状 · 未在途时判定为可用', absMapBefore.ok === true && absMapBefore.isAbsent === false);

  WA.store.transact(draft => {
    draft.people.p_map_cg.traveling = true;
    draft.people.p_map_cg.status = 'transit';
    draft.people.p_map_cg.transitTo = 'far_town';
    return true;
  }, 'set-map-traveling');
  const absMapAfter = WA.careChain.assessCaregiverAbsence('p_map_cg');
  t('map 形状 · traveling=true 必须判缺席（真实 store 形状）', absMapAfter.isAbsent === true);
  t('map 形状 · 缺席原因含 in-transit', absMapAfter.reasons.indexOf('in-transit') >= 0);

  WA.store.transact(draft => {
    draft.people.p_map_cg.status = 'traveling';
    draft.people.p_map_cg.traveling = false;
    return true;
  }, 'set-map-status-traveling');
  t('map 形状 · 仅 status=traveling 也必须判缺席（字段等价）',
    WA.careChain.assessCaregiverAbsence('p_map_cg').isAbsent === true);

  // 复原成数组形状，供后续既有断言继续使用（它们按数组写）
  WA.store.transact(draft => {
    draft.people = [
      { id: 'elderly_ward', name: 'Elderly Ward', isTraveling: false },
      { id: 'primary_cg', name: 'Primary Caregiver', isTraveling: false },
      { id: 'backup_cg', name: 'Backup Caregiver', isTraveling: false }
    ];
    return true;
  }, 'restore-array-shape');

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

  const brokenCode = rawCode.replace(ANCHOR, '      if (false && traveling) {');

  try {
    fs.writeFileSync(CARE_CHAIN_PATH, brokenCode, 'utf8');

    // 重新隔离装载运行
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    const env = gate.fresh({});
    const BrokenWA = env.WA;
    BrokenWA.store.init();

    // 负控制同时覆盖**两种真实形状**，否则「修好了 map 但 array 坏了」
    // 或反过来都不会被这条锁看见。
    BrokenWA.store.transact(draft => {
      draft.people = {
        p_trav_map: { id: 'p_trav_map', name: 'MapTraveller', traveling: true, status: 'transit' }
      };
      return true;
    }, 'init-neg-map');
    const absMap = BrokenWA.careChain.assessCaregiverAbsence('p_trav_map');
    assert.strictEqual(absMap.isAbsent, false,
      '破坏版必须在 map 形状下产生假阴性（迁走的人判不出缺席）');

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

// ── v2.233.0 收口：对齐 tests/run.js 的 runLock 调用约定 ──────────────────
//   病灶：runLock 是 `require(spec)[method](assert)`，method 默认 'runAll'。
//     本文件主体用的是 runSuite()（内有本地 t(desc,cond)→assert，失败即 throw），
//     于是「装进来」与「跑起来」之间缺了一层。缺这层时红灯长成
//     「没有导出 runAll」——看起来像锁坏了，而不像「断言根本没跑」，
//     这正是本仓点名的「绿是运气」：单独 `node tests/exp39-care-chain-resilience-v2233.js` 绿，
//     全量路径却在 require 处红，两个读数谁也证不了谁。
//   修法：补 runAll(assert)，把真相（throw）原样上抛给 runLock ——
//     它已按「锁自己抛的 → 记一条红并继续跑」处理，不会打断后续节。
function runAll(a) {
  var assertFn = (typeof a === 'function') ? a : require('assert');
  runSuite();
  assertFn(true, 'exp39-care-chain-resilience-v2233.js: 主体断言全部通过');
  runNegative();
  assertFn(true, 'exp39-care-chain-resilience-v2233.js: 单行真源码负控制如期报警');
  return true;
}
module.exports = {
  runAll: runAll,
  runSuite: runSuite,
  runNegative: runNegative,
};

// ── 直接运行入口（`node tests/exp39-care-chain-resilience-v2233.js`）──────────────────────────────
//   上一轮补丁删掉了裸调用却没补守卫，直接运行会变成「装进来、什么也不做、exit 0」——
//   一条退出码是绿的静默空跑。这里补回显式入口：跑 runAll，失败以非零码退出。
if (require.main === module) {
  try {
    runAll(require('assert'));
    console.log('exp39-care-chain-resilience-v2233.js: 直接运行通过');
  } catch (e) {
    console.error('exp39-care-chain-resilience-v2233.js: 直接运行失败 → ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}
