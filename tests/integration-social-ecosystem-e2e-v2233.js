#!/usr/bin/env node
// WorldAxis tests/integration-social-ecosystem-e2e-v2233.js
// EXV4 九系统端到端联动场景（E2E）——同一场洪水贯穿九个子系统的因果链
//
// 为什么要有这一条（而不是九条专锁再跑一遍）：
//   九把专锁各自证明「本模块在给定输入下行为正确」，它们共用同一个 store，
//   但各锁都是自己造数据、自己读自己 —— 谁也没有证明「A 的产物能被 B 当输入吃下去」。
//   本仓点名的病是「靠顺序活着」：一个模块的读出字段改名，九把专锁可以同时全绿，
//   而真实长局里下游拿到的是 undefined。E2E 只回答一个问题：
//   把这九件事接成一个连续事件时，状态是否真的沿因果链往前推进。
//
// 场景（一次河谷洪水，八个阶段，全程同一个 WA / 同一个 store）：
//   1. EXV4-7 灾前入池 → 洪水后理赔，资金守恒封顶；
//   2. EXV4-1 洪水损坏水利设施 → 产生可回收废料 → 回收回流（物质守恒）；
//   3. EXV4-8 Karl 在「行会罢工」与「地方防汛」之间的双重义务撕裂 → comply 裁决记违约方；
//   4. EXV4-4 灾情证据提交公共议题 → 唯一槽位排期 → 通过并联动 coop 立项；
//   5. EXV4-5 公共水渠逾期失修 → 真实降级 → 投入工时恢复；
//   6. EXV4-6 在积水环境下实操失败 → 沉淀失败证据 → 改良规范解除该环境禁忌；
//   7. EXV4-9 老渠长退位 → 改革继任 → 代际递增且历史链不含篡改；
//   8. EXV4-2 / EXV4-3 照护者在途离乡 → 缺席判定 → 失约升级 → 转介接续（历史不抹除）。
//
// 边界（如实登记，不假装覆盖）：
//   · 本文件是「九系统之间」的联动证据，不替代九把专锁的模块内负控制；
//   · 唯一的负控制是**跨模块**的：篡改 EXV4-6 的失败判定，验证「失败证据不再产生」
//     会使 EXV4-6 的下游改良链路断掉 —— 这条只有 E2E 能验（专锁各看各的）。
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const KNOWLEDGE_PATH = path.join(BASE, 'engines/knowledge-practice.js');
const ANCHOR = 'if (envClash.length > 0) {';

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

  // ── 阶段 1：EXV4-7 灾前入池 → 洪水理赔 ─────────────────────────────
  const pool = WA.riskPooling.declareRiskPool({
    id: 'pool_valley_e2e',
    name: '河谷防汛公社',
    riskKind: 'flood',
    regionId: 'river_valley',
    maxPayoutPerClaim: 100,
    pledgeAmount: 20
  });
  t('阶段1 · 防汛互助池声明成功', pool.ok === true);

  const nowTs = Date.now();
  const disasterMoment = nowTs + 5000;
  WA.riskPooling.pledgeMutualFund({ poolId: 'pool_valley_e2e', who: 'karl', amount: 60 });
  WA.riskPooling.pledgeMutualFund({ poolId: 'pool_valley_e2e', who: 'tom', amount: 40 });
  const poolAfter = WA.store.get().riskPooling.pools.filter(p => p.id === 'pool_valley_e2e')[0];
  t('阶段1 · 灾前入池累积资本 100（守恒基数）', poolAfter.totalCapital === 100);

  const claim = WA.riskPooling.claimMutualRelief({
    poolId: 'pool_valley_e2e',
    who: 'karl',
    incidentId: 'flood_2026',
    requestedAmount: 120,
    disasterTime: disasterMoment
  });
  t('阶段1 · 理赔被单笔上限 100 封顶', claim.ok === true && claim.payout === 100);
  t('阶段1 · 池内资金见底（不凭空造钱）', claim.remainingCapital === 0);

  // ── 阶段 2：EXV4-1 设施损坏 → 废料 → 守恒回收 ─────────────────────
  WA.envCapacity.declareRecyclableMaterial('scrap_iron', {
    name: '废铁',
    yieldRate: 0.7,
    facilityType: 'smelter'
  });
  const gen = WA.envCapacity.generateScrap('scrap_iron', 40, 'flood_ruined_waterwheel', 'valley_meadow');
  t('阶段2 · 洪水损坏水车产生 40 单位废铁', gen.ok === true && gen.currentScrap === 40);
  const rec = WA.envCapacity.recycleScrap('scrap_iron', 20, 'karl', 'smelter', { locationId: 'valley_meadow' });
  t('阶段2 · 回收产出按 0.7 得率算得 14', rec.ok === true && rec.producedAmount === 14);
  t('阶段2 · 损耗 6 单位真实记账（物质守恒）', rec.lossAmount === 6);
  t('阶段2 · 剩余废料 20 回流到场地', rec.remainingScrap === 20);

  // ── 阶段 3：EXV4-8 双重义务撕裂 → comply 裁决 ─────────────────────
  WA.roleConflict.registerAffiliationObligation({
    who: 'karl', groupKind: 'guild', groupId: 'smith_guild', obligationType: 'labor'
  });
  WA.roleConflict.registerAffiliationObligation({
    who: 'karl', groupKind: 'locality', groupId: 'valley_guard', obligationType: 'defense'
  });
  const conf = WA.roleConflict.detectRoleConflict({
    who: 'karl',
    eventId: 'flood_repair_clash',
    groupA: 'smith_guild',
    groupB: 'valley_guard',
    demandA: '全体罢工抵制无偿征用',
    demandB: '立刻抢修决口水闸'
  });
  t('阶段3 · 认定 karl 同时持有对立双方活动义务', conf.ok === true);
  const resol = WA.roleConflict.resolveConflictStance({
    conflictId: conf.conflict.id,
    stance: 'comply',
    favoredGroup: 'valley_guard'
  });
  t('阶段3 · 遵从地方防卫时行会被记违约方', resol.ok === true && resol.resolution.breachGroup === 'smith_guild');

  // ── 阶段 4：EXV4-4 灾情证据 → 议题 → 联动 coop 立项 ───────────────
  WA.publicAgenda.setAgendaCapacity('valley_hall', 1);
  const prop = WA.publicAgenda.submitProposal({
    id: 'topic_drain_flood',
    placeId: 'valley_hall',
    groupName: 'valley_guard',
    title: '开闸排涝与渠道修整',
    category: 'public_project',
    sourceEvidence: 'flood_2026_damage_survey'
  });
  t('阶段4 · 带证据议题提交成功', prop.ok === true);
  const propNoEvidence = WA.publicAgenda.submitProposal({
    id: 'topic_rumor',
    placeId: 'valley_hall',
    groupName: 'gossip_club',
    title: '听说渠要塌了'
  });
  t('阶段4 · 无证据议题被拒（证据不可凭空伪造）', propNoEvidence.ok === false && propNoEvidence.reason === 'missing-source-evidence');

  const sched = WA.publicAgenda.scheduleAgenda('valley_hall');
  t('阶段4 · 唯一议程槽位排给排涝议题', sched.ok === true && sched.scheduled.length === 1
    && sched.scheduled[0].id === 'topic_drain_flood');

  const enact = WA.publicAgenda.enactAgendaTopic({
    proposalId: 'topic_drain_flood',
    outcome: 'enacted',
    enactmentAction: 'coop.proposeProject',
    actionParams: {
      projectId: 'proj_canal_dredge',
      name: '大运河开渠排涝工程',
      initiator: 'valley_guard'
    }
  });
  t('阶段4 · 议题通过并真实联动 coop 立项', enact.ok === true
    && enact.linkageResult && enact.linkageResult.ok === true);
  t('阶段4 · coop 库里确实出现了该工程（非回执幻觉）',
    !!(WA.store.get().coop && WA.store.get().coop.projects
      && WA.store.get().coop.projects['proj_canal_dredge']));

  // ── 阶段 5：EXV4-5 共同资产逾期降级 → 维护恢复 ────────────────────
  const asset = WA.commonsGovernance.declareCommonAsset({
    id: 'asset_canal_hub',
    placeId: 'valley_meadow',
    name: '河谷主干水渠',
    assetType: 'dock',
    governanceModel: 'open_access',
    maintenanceCycleDays: 7,
    requiredLaborPerCycle: 10
  });
  t('阶段5 · 水渠声明成功', asset.ok === true && asset.asset.status === 'optimal');

  const decay = WA.commonsGovernance.auditAssetDecay('asset_canal_hub', 15);
  t('阶段5 · 逾期 15 天且零工时 → 跌入 failing（真实物理降级）',
    decay.ok === true && decay.isOverdue === true && decay.status === 'failing');

  const repaired = WA.commonsGovernance.contributeMaintenance({
    assetId: 'asset_canal_hub',
    who: 'karl',
    hours: 10
  });
  t('阶段5 · 投入 10 工时后恢复 optimal',
    repaired.ok === true && repaired.asset.status === 'optimal');

  // ── 阶段 6：EXV4-6 环境冲突失败 → 失败证据 → 改良解除禁忌 ─────────
  WA.knowledgePractice.registerKnowledgeSpec({
    id: 'know_gate_cast',
    title: '耐蚀铸铁闸门工艺',
    domain: 'metallurgy',
    requiredTools: ['forge_crucible', 'lime_flux'],
    environmentalConstraints: ['water_surge']
  });
  WA.knowledgePractice.grantPracticeLicense({
    knowledgeId: 'know_gate_cast',
    practitioner: 'karl',
    allowedPlaces: ['valley_meadow']
  });

  // 6a. 未获许可者被拦（公开资料 ≠ 操作许可）
  const unauth = WA.knowledgePractice.executePractice({
    knowledgeId: 'know_gate_cast',
    practitioner: 'unlicensed_stranger',
    placeId: 'valley_meadow',
    availableTools: ['forge_crucible', 'lime_flux']
  });
  t('阶段6 · 无许可者被拦 unauthorized-practice', unauth.ok === false && unauth.reason === 'unauthorized-practice');

  // 6b. 有许可但缺工具 → missing-prerequisites
  const noTool = WA.knowledgePractice.executePractice({
    knowledgeId: 'know_gate_cast',
    practitioner: 'karl',
    placeId: 'valley_meadow',
    availableTools: ['forge_crucible']
  });
  t('阶段6 · 缺 lime_flux 被拦 missing-prerequisites', noTool.ok === false && noTool.reason === 'missing-prerequisites');

  // 6c. 工具齐备但积水环境 → failure 并沉淀证据
  const failLog = WA.knowledgePractice.executePractice({
    knowledgeId: 'know_gate_cast',
    practitioner: 'karl',
    placeId: 'valley_meadow',
    availableTools: ['forge_crucible', 'lime_flux'],
    localConditions: ['water_surge']
  });
  t('阶段6 · 积水环境导致 failure 而非静默成功',
    failLog.ok === true && failLog.log.status === 'failure');
  t('阶段6 · 失败沉淀出可引用的 evidenceId',
    !!failLog.log.failureEvidence && !!failLog.log.failureEvidence.evidenceId);

  const evidenceId = failLog.log.failureEvidence.evidenceId;
  const refined = WA.knowledgePractice.refineKnowledgeFromEvidence({
    knowledgeId: 'know_gate_cast',
    failureEvidenceId: evidenceId,
    summary: '改用围堰挡水后再浇筑',
    removedConstraints: ['water_surge']
  });
  t('阶段6 · 改良登记成功并引用真实证据', refined.ok === true);
  const kAfter = WA.store.get().knowledgePractice.knowledges.filter(k => k.id === 'know_gate_cast')[0];
  t('阶段6 · 规范中的 water_surge 禁忌已被真实解除',
    kAfter.environmentalConstraints.indexOf('water_surge') < 0);

  // 6d. 改良后再实操：同样积水条件下不再失败（因果闭环）
  const retry = WA.knowledgePractice.executePractice({
    knowledgeId: 'know_gate_cast',
    practitioner: 'karl',
    placeId: 'valley_meadow',
    availableTools: ['forge_crucible', 'lime_flux'],
    localConditions: ['water_surge']
  });
  t('阶段6 · 改良后同条件实操转为 success（知识真的长了）',
    retry.ok === true && retry.log.status === 'success');

  // ── 阶段 7：EXV4-9 退位 → 改革继任 → 代际递增 ────────────────────
  const charter = WA.institutionalInertia.establishCharter({
    id: 'charter_valley_water',
    title: '河谷水务联合宪章',
    leader: 'elder_mark',
    placeId: 'valley_meadow',
    boundFacilityId: 'asset_canal_hub',
    requiredPractitionerSkill: 'hydraulic_engineering'
  });
  t('阶段7 · 宪章建立为第 1 代', charter.ok === true && charter.charter.generation === 1);

  const handover = WA.institutionalInertia.triggerSuccessionHandover({
    charterId: 'charter_valley_water',
    outgoingLeader: 'elder_mark',
    reason: 'retirement'
  });
  t('阶段7 · 退位触发交接事件', handover.ok === true && handover.handover.status === 'pending');

  const succ = WA.institutionalInertia.resolveSuccessionPath({
    handoverId: handover.handover.id,
    successor: 'karl',
    path: 'reform_amendment',
    transitionCost: 30,
    amendedClauses: ['annual_flood_drill']
  });
  t('阶段7 · 改革继任后进入第 2 代', succ.ok === true && succ.generation === 2);
  t('阶段7 · 状态转为 reformed', succ.charterStatus === 'reformed');

  const charterAfter = WA.store.get().institutionalInertia.charters.filter(c => c.id === 'charter_valley_water')[0];
  t('阶段7 · 历史链保留创始记录 + 本次继任记录（不可篡改）',
    charterAfter.history.length === 2 && charterAfter.history[0].path === 'founding');

  // 7b. 文书虚置：绑定的水渠若损毁缺人，制度健康度真实衰退
  //   注意这里必须是**两轮**审计，不是一轮：改革继任后 efficiency 被提振回 1.0，
  //   一次双缺口（设施 0.4 + 人手 0.3）只把它压到 0.3，尚未跌破 dormant 线 0.2。
  //   这是引擎的真实语义 —— 「缺口累积才致死亡」，一次事故不该直接判死。
  //   首轮实测（本文件初稿）把期望写成「一轮即 dormant」，红的是判据不是引擎：
  //   初稿按想象写预期，正是本仓点名的「测试自己造一个舒服的世界」。
  const decayRound1 = WA.institutionalInertia.auditInstitutionalDecay('charter_valley_water', {
    facilityFunctional: false,
    practitionerPresent: false
  });
  t('阶段7 · 首轮双缺口把效率压到 0.3 但尚未判死（缺口需累积）',
    decayRound1.ok === true && decayRound1.operationalHealth === 0.3
    && decayRound1.isDormant === false);
  t('阶段7 · 缺口被具名记录（不是笼统扣分）',
    decayRound1.gaps.indexOf('bound_facility_damaged') >= 0
    && decayRound1.gaps.indexOf('practitioner_absent_or_unqualified') >= 0);

  const decayRound2 = WA.institutionalInertia.auditInstitutionalDecay('charter_valley_water', {
    facilityFunctional: false,
    practitionerPresent: false
  });
  t('阶段7 · 缺口再累积一轮后跌破 dormant 线（制度名存实亡）',
    decayRound2.ok === true && decayRound2.operationalHealth === 0
    && decayRound2.isDormant === true);
  const charterDormant = WA.store.get().institutionalInertia.charters.filter(c => c.id === 'charter_valley_water')[0];
  t('阶段7 · 状态在账本里真的写成了 dormant（不是只回执）',
    charterDormant.status === 'dormant');
  t('阶段7 · 衰退不抹除历史链（仍是 2 条记录）', charterDormant.history.length === 2);

  // ── 阶段 8：EXV4-2 / EXV4-3 在途离乡 → 照护缺席 → 转介 ───────────
  WA.store.transact(draft => {
    draft.people = draft.people || {};
    draft.people['p_karl'] = { id: 'p_karl', name: 'karl', location: 'valley_meadow' };
    return true;
  }, 'e2e:seed-karl');

  const careReg = WA.careChain.registerCareCommitment({
    id: 'commit_karl_grandpa',
    caregiver: 'karl',
    ward: 'grandpa_karl',
    placeId: 'valley_meadow',
    careType: 'elder_care',
    requiredIntensity: 3
  });
  t('阶段8 · 照护承诺登记成功', careReg.ok === true);

  const absentBefore = WA.careChain.assessCaregiverAbsence('karl');
  t('阶段8 · 离乡前照护者判定为可用', absentBefore.ok === true && absentBefore.isAbsent === false);

  // karl 为采购排涝器材在途离乡（EXV4-2 联动：commitMigration 置 isTraveling 语义）
  WA.store.transact(draft => {
    draft.people['p_karl'].traveling = true;
    draft.people['p_karl'].status = 'transit';
    draft.people['p_karl'].transitTo = 'market_town';
    return true;
  }, 'e2e:karl-in-transit');

  const absentAfter = WA.careChain.assessCaregiverAbsence('karl');
  t('阶段8 · 在途后立即判定缺席', absentAfter.isAbsent === true);

  const breach = WA.careChain.reportCareAbsence('commit_karl_grandpa', 'emergency_equipment_travel');
  t('阶段8 · 失约登记并把风险升级为 warning',
    breach.ok === true && breach.commitment.escalation === 'warning');

  const refer = WA.careChain.referCare({
    commitmentId: 'commit_karl_grandpa',
    toCaregiver: 'nurse_eva',
    resourceUsed: 'med_kit',
    resourceCost: 1
  });
  t('阶段8 · 成功转介给 nurse_eva', refer.ok === true && refer.commitment.caregiver === 'nurse_eva');
  t('阶段8 · 转介后历史失约 1 次不被抹除', refer.commitment.delaysCount === 1);
  t('阶段8 · 原始失约记录仍在账本里', WA.store.get().careChain.breaches.length === 1);

  // ── 阶段 9：九系统共享同一 store 的联合体检（因果链未断）──────────
  const st = WA.store.get();
  t('阶段9 · 九个 bucket 同时存在（无互相覆盖）',
    !!st.riskPooling && !!st.envCapacity && !!st.roleConflict && !!st.publicAgenda
    && !!st.commonsGovernance && !!st.knowledgePractice && !!st.institutionalInertia
    && !!st.careChain && !!st.coop);
  t('阶段9 · 阶段1的池子在阶段9仍然保有赔付记录',
    st.riskPooling.pools[0].totalPaidOut === 100);
  t('阶段9 · 阶段2的回收账在阶段9仍然守恒',
    st.envCapacity.recycleLog[0].produced + st.envCapacity.recycleLog[0].loss
      === st.envCapacity.recycleLog[0].scrapConsumed);
  t('阶段9 · 阶段4的联动工程在阶段9仍然在 coop 库中',
    !!st.coop.projects['proj_canal_dredge']);

  console.log('integration-social-ecosystem-e2e-v2233: ' + tested
    + ' 项跨系统联动断言全部通过（九系统同一 store 因果链贯通）');
  return tested;
}

// ── 跨模块负控制：篡改 EXV4-6 的环境冲突判定，验证下游改良链真的会断 ──
//   这条只有 E2E 能验：九把专锁各看各的，谁也看不见「失败证据不再产生」
//   会让另一个模块的改良链路失去输入。
function runNegative() {
  const rawCode = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
  assert(rawCode.includes(ANCHOR), '负控制锚点必须存在于 engines/knowledge-practice.js');
  assert(rawCode.split(ANCHOR).length - 1 === 1, '负控制锚点须恰中 1 次');

  const brokenCode = rawCode.replace(ANCHOR, 'if (false && envClash.length > 0) {');
  try {
    fs.writeFileSync(KNOWLEDGE_PATH, brokenCode, 'utf8');
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    const env2 = gate.fresh({});
    const BrokenWA = env2.WA;
    BrokenWA.store.init();

    BrokenWA.knowledgePractice.registerKnowledgeSpec({
      id: 'know_neg_e2e',
      title: '积水浇筑工艺',
      requiredTools: [],
      environmentalConstraints: ['water_surge']
    });
    BrokenWA.knowledgePractice.grantPracticeLicense({
      knowledgeId: 'know_neg_e2e',
      practitioner: 'karl',
      allowedPlaces: ['valley_meadow']
    });

    const brokenExec = BrokenWA.knowledgePractice.executePractice({
      knowledgeId: 'know_neg_e2e',
      practitioner: 'karl',
      placeId: 'valley_meadow',
      availableTools: [],
      localConditions: ['water_surge']
    });
    // 破坏版里环境冲突被短路 ⇒ 本该 failure 的实操被判成功，
    // 于是 failureEvidence 为 null ⇒ 下游 refineKnowledgeFromEvidence 直接断链。
    assert(brokenExec.log.status === 'success',
      '破坏版必须把积水实操误判为 success（假成功）');
    assert(brokenExec.log.failureEvidence === null,
      '破坏版必须不再产生 failureEvidence（下游改良输入被抽空）');

    const brokenRefine = BrokenWA.knowledgePractice.refineKnowledgeFromEvidence({
      knowledgeId: 'know_neg_e2e',
      failureEvidenceId: 'whatever',
      summary: '无证据改良',
      removedConstraints: ['water_surge']
    });
    assert(brokenRefine.ok === false && brokenRefine.reason === 'evidence-not-found',
      '破坏版下游改良必须因证据缺失而断链（跨模块因果真的被切断）');
    console.log('integration-social-ecosystem-e2e-v2233: 负控制验证通过（跨模块改良链如期断裂）');
  } finally {
    fs.writeFileSync(KNOWLEDGE_PATH, rawCode, 'utf8');
  }
}

function runAll(a) {
  var assertFn = (typeof a === 'function') ? a : assert;
  runSuite();
  assertFn(true, 'integration-social-ecosystem-e2e-v2233: 九系统联动断言全部通过');
  runNegative();
  assertFn(true, 'integration-social-ecosystem-e2e-v2233: 跨模块负控制如期断裂');
  return true;
}

if (require.main === module) {
  runSuite();
  runNegative();
}

module.exports = {
  runAll: runAll,
  runSuite: runSuite,
  runNegative: runNegative
};