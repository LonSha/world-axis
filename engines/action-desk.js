/**
 * WorldAxis engines/action-desk.js (v2.231.0) — OP-1 场景行动桌
 *
 * ── 它治什么（现场读数）────────────────────────────────────────────
 *   本仓已有大量可做之事，但**玩家要先知道引擎名才安排得动**：
 *     · 研究要 `research.open → supply → advance`（`supply` 的料从
 *       `people[p_*].resources` 扣，`advance` 每阶段按总量摊扣、末阶段结清）；
 *     · 共同生活要 `family.createUnit → addMember → assignCare/transferCare`；
 *     · 生产要 `production.open → staff → resupply → advance`；
 *     · 训练/装备要 `training.can` / `gear.canUse` 先问过才知道行不行。
 *   这些写口都在，**但没有一处把「此刻这个人、在这个地点，能做什么」摆出来**：
 *   面板只有 training/gear 的零散操作，research/family 在 `ui/panel.js` 里
 *   经定向检索**没有任何对应玩家链**（计划 OP-1 原文：玩家不应该先知道引擎名
 *   才能安排一次研究或家庭支出）。于是「机制都在，玩不到」。
 *
 * ── 本模块落点（只读聚合 + 路由执行，不新增第二套状态）──────────────
 *   · board({person, place})  —— 纯读。按当前人物/地点聚合各 owner 的现状，
 *     逐条给 `ready`（可执行）/ `prepare`（需准备，附所缺）/ `blocked`（不可执行，
 *     附原因）。**一行都不写**（与 agenda 同口径：只读聚合不新增第二套状态）。
 *   · plan(actionId, opts)   —— 写口，但**只是路由**：按 actionId 前缀把调用
 *     转给既有 owner 的写口（research.supply / family.assignCare / …）。
 *     本模块**自己不写任何世界键**，事务与幂等一律由被调用的 owner 负责。
 *   · sources()              —— 各源的在场性与条目数；缺席如实报，不静默丢。
 *   · diagnose() / stat()
 *
 * ── 边界（全是否定式，逐条来自计划 OP-1 原文）──────────────────────
 *   1 默认关（enabled:false）。
 *   2 board() **只读**：不改任何来源模块状态、不改存档、不写 stat 之外的持久态。
 *   3 **不建万能写状态解释器**：plan() 只认下列具名 actionId，未知前缀一律拒收
 *     `unknown-action`（宁可拒收也不猜一个 owner 去写）。
 *   4 未知人物/未登记地点保持未知 —— 不凭空建人（与 act.add 否定式 ② 同规）。
 *   5 关闭某 owner（如 research.enabled=false）时，该组**不出现残影**：
 *     整组标 `off`（面板据此不渲染操作），但**不阻断**其它组。
 *   6 玩家操作与 NPC 自主提案权限分开：本模块只服务玩家显式调用，
 *     不接 agency/monologue 的自主链（那是 NPC 侧，见 OP-7）。
 *   7 不重复 owner 的判据：每条的 ready/prepare/blocked **由 owner 自己的读口
 *     决定**（research.view 算缺料、production.open 算资质），本模块只做归拢与展示。
 *   8 不新增守卫/审计面：本模块是玩家机制，不是治理设施。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_action_desk_settings_v1';
  const DEF = { enabled: false, maxRows: 32, maxPerGroup: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'actionDesk',
    bounds: { maxRows: [4, 96], maxPerGroup: [1, 24] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** 三档状态。**闭合集合**：面板与测试都按它判档，不接受自由文本。 */
  const STATES = ['ready', 'prepare', 'blocked'];
  /** 行动组（= owner 家族）。顺序即面板渲染顺序。 */
  const KINDS = ['research', 'family', 'production', 'training', 'gear', 'travel'];
  /** 具名行动 id 前缀 → 目标 owner 写口。未知前缀一律拒收（边界 3）。 */
  const ROUTES = {
    'research.supply': function (o) { return WA.research.supply(o.projectId, o.who, o.material, o.amount); },
    'research.advance': function (o) { return WA.research.advance(o.projectId, { evidence: o.evidence }); },
    'research.disseminate': function (o) { return WA.research.disseminate(o.projectId, o.scope, o.to); },
    'research.abandon': function (o) { return WA.research.abandon(o.projectId); },
    'family.contribute': function (o) { return WA.family.contribute(o.unitId, o.who, o.material, o.amount); },
    'family.spend': function (o) { return WA.family.spend(o.unitId, o.to, o.material, o.amount); },
    'family.assignCare': function (o) { return WA.family.assignCare(o.unitId, o.who, o.ward, o.notes); },
    'family.transferCare': function (o) { return WA.family.transferCare(o.unitId, o.ward, o.who, o.reason); },
    'family.inherit': function (o) { return WA.family.inherit(o.unitId, o.deceased, o.heirs, o.event); },
    'production.open': function (o) { return WA.production.open({ recipe: o.recipe, by: o.who, qty: o.qty, days: o.days, facility: o.facility, place: o.place }, { label: o.label }); },
    'production.staff': function (o) { return WA.production.staff(o.orderId, o.who, { shift: o.shift }); },
    'production.advance': function (o) { return WA.production.advance(o.orderId, { days: o.days }); },
    'production.resume': function (o) { return WA.production.resume(o.orderId, o); },
    'production.pause': function (o) { return WA.production.pause(o.orderId, o); },
    'production.resupply': function (o) { return WA.production.resupply(o.orderId, o); },
    'production.deliver': function (o) { return WA.production.deliver(o.orderId, o); },
    'production.cancel': function (o) { return WA.production.cancel(o.orderId, o); },
    'production.extend': function (o) { return WA.production.extend(o.orderId || o.id, o); },
    'production.deliverPartial': function (o) { return WA.production.deliverPartial(o.orderId || o.id, o); },
    'actionDesk.declareOpportunity': function (o) { return declareOpportunity(o.oppId || o.id, o); },
    'actionDesk.applyOpportunity': function (o) { return applyOpportunity(o.oppId || o.id, o.who, o); },
    'actionDesk.awardOpportunity': function (o) { return awardOpportunity(o.oppId || o.id, o); },
    'training.practice': function (o) { return WA.training.practice(o.who, o.ability, { mode: o.mode }); },
    'gear.use': function (o) { return WA.gear.use(o.itemId, { by: o.who, note: o.note }); },
    'method.execute': function (o) { return WA.actionMethods.execute(o.taskId, o.who, o.methodId, o); },
    'schedule.claim': function (o) { return WA.laborSchedule.claim(o); },
    'schedule.transfer': function (o) { return WA.laborSchedule.transfer(o.bookingId, o.to); },
    // v2.233.0 (OPV4-3): 时间成本与冲突预览 + 协商协议
    'schedule.preview': function (o) { return WA.laborSchedule.previewSchedule(o); },
    'schedule.reschedule': function (o) { return WA.laborSchedule.reschedule(o.bookingId, o.day, o.slot); },
    'schedule.cancel': function (o) { return WA.laborSchedule.cancel(o.bookingId, o); },
    'schedule.split': function (o) { return WA.laborSchedule.split(o.bookingId, o); },
    'schedule.earliest': function (o) { return WA.laborSchedule.earliestSlot(o.who, o); },
    // v2.233.0 (OPV4-4): 日程打断接续与替班换岗
    'schedule.interrupt': function (o) { return WA.laborSchedule.interrupt(o.bookingId, o.solution, o); },
    'schedule.resume': function (o) { return WA.laborSchedule.resume(o.bookingId); },
    'motive.arbitrate': function (o) { return WA.motiveArbitration.decide(o.person, o.candidates, o.facts); },
    'pathEcho.realize': function (o) { return WA.pathEcho.realizeOutcome(o.personId, o.decisionId, o.actualOutcome, o.knownFacts); },
    'lineage.teach': function (o) { return WA.techLineage.teach(o.traditionId, o.master, o.apprentice); },
    'lineage.confirmVariant': function (o) { return WA.techLineage.confirmVariant(o.traditionId, o.variantId, o.envContext); },
    'techLineage.declareStandard': function (o) { return WA.techLineage.declareStandard(o.specId, o.def); },
    'techLineage.checkCompatibility': function (o) { return WA.techLineage.checkCompatibility(o.facilitySpecId, o.targetSpecId, o); },
    'techLineage.planRetrofit': function (o) { return WA.techLineage.planRetrofit(o.facilityId, o.targetSpecId, o); },
    'techLineage.advanceRetrofit': function (o) { return WA.techLineage.advanceRetrofit(o.facilityId, o.days); },
    'techLineage.cancelRetrofit': function (o) { return WA.techLineage.cancelRetrofit(o.facilityId); },
    'techLineage.produceAdapter': function (o) { return WA.techLineage.produceAdapter(o); },
    'techLineage.outsourceWork': function (o) { return WA.techLineage.outsourceWork(o.orderId, o.targetFacilityId, o); },
    'familyOps.gap': function (o) { return WA.familyOps.handleGap(o.unitId, o.gapType, o.solution, o); },
    'familyOps.inherit': function (o) { return WA.familyOps.inheritRatio(o.unitId, o.deceased, o.shares, o); },
    'familyOps.advanceCycle': function (o) { return WA.familyOps.advanceCycle(o.unitId, o); },
    'aftermath.reroute': function (o) { return WA.aftermathImpact.findDetour(o.from, o.to, o.blockedPlace, o); },
    'aftermath.repairCommission': function (o) { return WA.aftermathImpact.commissionRepair(o.effectId, o); },
    'epistemic.view': function (o) { return WA.epistemicView.buildView(o.personId, o.topicId); },
    'epistemic.correct': function (o) { return WA.epistemicView.correctBelief(o.personId, o.topicId, o.evidence, o); },
    // v2.233.0 (OPV4-5): 证据可信度裁决与更替
    'epistemic.weigh': function (o) { return WA.epistemicView.weighEvidence(o.personId, o.topicId, o.evidenceItems, o); },
    'epistemic.update': function (o) { return WA.epistemicView.updateBeliefWithEvidence(o.personId, o.topicId, o.evidenceItems, o); },
    // v2.233.0 (OPV4-8): 章节、事件与分支的连续游玩
    'chapter.open': function (o) { return chapterOpen(o); },
    'chapter.flow': function (o) { return chapterFlow(o); },
    'chapter.rollover': function (o) { return chapterRollover(o); },
    'chapter.close': function (o) { return chapterClose(o); },
    'chapter.saveBranch': function (o) { return chapterSaveBranch(o); },
    'chapter.restore': function (o) { return chapterRestore(o); },
    'chapter.diff': function (o) { return chapterDiff(o); },
    'chapter.inspect': function (o) { return chapterInspect(o); },
    // v2.232.0 (OPV3-1 & OPV3-2): 情境投影与场景工作台
    // v2.233.0 (OPV4-7): 长局记忆整理与按需回忆
    'retrieval.recall': function (o) {
      if (!WA.retrieval) return { ok: false, reason: 'retrieval-unavailable' };
      const c = WA.retrieval.candidates(o.input || o, o.opts || o);
      return { ok: true, memoryKind: 'recalled', recall: c.recall, recalled: c.recalled, rows: c.rows, staleDropped: c.staleDropped, total: c.total };
    },
    'retrieval.tidyMemory': function (o) {
      if (!WA.retrieval) return { ok: false, reason: 'retrieval-unavailable' };
      const st = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
      const facts = (st.memory && Array.isArray(st.memory.facts)) ? st.memory.facts : [];
      const pmems = (st.memory && Array.isArray(st.memory.pmem)) ? st.memory.pmem : [];
      const promises = (st.customLax && Array.isArray(st.customLax.promises)) ? st.customLax.promises : [];
      const byKey = {};
      facts.forEach(function (f) { const k = String(f && f.key || ''); (byKey[k] = byKey[k] || []).push(f); });
      const versionChains = Object.keys(byKey).map(function (k) {
        return { key: k, versions: byKey[k].length, current: byKey[k].filter(function (x) { return x.active; }).slice(-1)[0] || null };
      });
      return {
        ok: true,
        stats: {
          objectiveFacts: facts.length,
          factKeys: Object.keys(byKey).length,
          versionChains: versionChains.length,
          subjectivePmems: pmems.length,
          customPromises: promises.length,
          activePromises: promises.filter(function (p) { return p.status === 'active'; }).length
        },
        versionChains: versionChains,
        promisesSummary: promises.map(function (p) {
          return { id: p.id, subject: p.subject, status: p.status, promiser: p.promiser, beneficiary: p.beneficiary };
        }),
        at: clockNow('actionDesk')
      };
    },
    'sceneNarrative.situation': function (o) { return WA.sceneNarrative.situation(o); },
    'actionDesk.preview': function (o) { return previewAction(o.actionId, o); },
    'actionDesk.workbench': function (o) { return workbench(o); },
    // v2.233.0 (OPV4-1 & OPV4-2): 场景优先入口与跨轮生命周期
    'actionDesk.lifecycle': function (o) { return lifecycle(o); },
    'actionDesk.recoverAction': function (o) { return recoverAction(o.actionId, o); },
    'actionDesk.sceneFlow': function (o) { return sceneFlow(o); },
    'actionDesk.actFromScene': function (o) { return actFromScene(o); },
    // v2.231.0（拓展 IN-3）：共同知晓与默契
    'sharedAwareness.assertMeta': function (o) { return WA.sharedAwareness.assertMeta(o.who, o.target, o.factId, o.basis); },
    'sharedAwareness.openPact': function (o) { return WA.sharedAwareness.openPact(o.pactId, o.spec); },
    'sharedAwareness.confirmPact': function (o) { return WA.sharedAwareness.confirmPact(o.pactId, o.who); },
    'sharedAwareness.amendPact': function (o) { return WA.sharedAwareness.amendPact(o.pactId, o.changes, o.who); },
    // v2.231.0（拓展 IN-4）：习俗到制度
    'customLax.spawnCandidate': function (o) { return WA.customLax.spawnCandidate(o.spec); },
    'customLax.submitToApproval': function (o) { return WA.customLax.submitToApproval(o.candidateId, o); },
    'customLax.enactRule': function (o) { return WA.customLax.enactRule(o.candidateId, o); },
    'customLax.registerDissatisfaction': function (o) { return WA.customLax.registerDissatisfaction(o.ruleId, o.who); },
    'customLax.reviewRule': function (o) { return WA.customLax.reviewRule(o.ruleId, o); },
    'customLax.establishPrecedent': function (o) { return WA.customLax.establishPrecedent(o); },
    'customLax.evaluatePrecedent': function (o) { return WA.customLax.evaluatePrecedent(o.precedentId, o.caseFacts); },
    'customLax.adoptRuleFromPrecedent': function (o) { return WA.customLax.adoptRuleFromPrecedent(o.precedentId, o); },
    'customLax.recordFavor': function (o) { return WA.customLax.recordFavor(o); },
    'customLax.requestAid': function (o) { return WA.customLax.requestAid(o); },
    'customLax.provideGuarantee': function (o) { return WA.customLax.provideGuarantee(o); },
    'customLax.claimGuarantee': function (o) { return WA.customLax.claimGuarantee(o.guaranteeId, o.breachAmount); },
    'customLax.settleFavor': function (o) { return WA.customLax.settleFavor(o.favorId, o.outcome); },
    // v2.231.0（优化 OP-8）：场景与历史按因果讲清楚（只读聚合）
    'sceneNarrative.currentScene': function (o) { return WA.sceneNarrative.currentScene(o); },
    'sceneNarrative.resolvedSummary': function (o) { return WA.sceneNarrative.resolvedSummary(o); },
    'sceneNarrative.traceFrom': function (o) { return WA.sceneNarrative.traceFrom(o.seed); },
    'sceneNarrative.perceivedHorizon': function (o) { return WA.sceneNarrative.perceivedHorizon(o.who); },
    // v2.231.0（拓展 IN-6）：公共设施与服务网络
    'serviceNetwork.declareFacility': function (o) { return WA.serviceNetwork.declareFacility(o.spec); },
    'serviceNetwork.activateFacility': function (o) { return WA.serviceNetwork.activateFacility(o.facilityId); },
    'serviceNetwork.requestService': function (o) { return WA.serviceNetwork.requestService(o.facilityId, o.who, o.amount, o); },
    'serviceNetwork.queueService': function (o) { return WA.serviceNetwork.queueService(o.facilityId, o.who, o.amount); },
    'serviceNetwork.releaseService': function (o) { return WA.serviceNetwork.releaseService(o.facilityId, o.amount); },
    'serviceNetwork.cancelQueue': function (o) { return WA.serviceNetwork.cancelQueue(o.facilityId, o.queueId); },
    'serviceNetwork.decayFacility': function (o) { return WA.serviceNetwork.decayFacility(o.facilityId); },
    'serviceNetwork.restoreFacility': function (o) { return WA.serviceNetwork.restoreFacility(o.facilityId); },
    // v2.231.0（优化 OP-9）：可玩的世界蓝图
    'playableBlueprint.listSamples': function (o) { return WA.playableBlueprint.listSamples(); },
    'playableBlueprint.checkDependencies': function (o) { return WA.playableBlueprint.checkDependencies(o.sampleId); },
    'playableBlueprint.exportPlayDefs': function (o) { return WA.playableBlueprint.exportPlayDefs(o.sampleId); },
    'playableBlueprint.installSample': function (o) { return WA.playableBlueprint.installSample(o.sampleId, o); },
    // v2.233.0（优化 OPV4-9）：玩法蓝图的安全调参、差异预览与续局
    'playableBlueprint.previewDiff': function (o) {
      if (typeof WA.playableBlueprint.previewDiff === 'function') {
        return WA.playableBlueprint.previewDiff(o.sampleId, o.overrides, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'playableBlueprint.tuneConfig': function (o) {
      if (typeof WA.playableBlueprint.tuneConfig === 'function') {
        return WA.playableBlueprint.tuneConfig(o.sampleId, o.params, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'playableBlueprint.migrate': function (o) {
      if (typeof WA.playableBlueprint.migrateBlueprint === 'function') {
        return WA.playableBlueprint.migrateBlueprint(o.blueprintData, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'playableBlueprint.resetInitialConditions': function (o) {
      if (typeof WA.playableBlueprint.resetInitialConditions === 'function') {
        return WA.playableBlueprint.resetInitialConditions(o.sampleId, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.231.0（拓展 IN-7）：有承载力的环境
    'envCapacity.declareResource': function (o) { return WA.envCapacity.declareResource(o.spec); },
    'envCapacity.withdraw': function (o) { return WA.envCapacity.withdraw(o.resourceId, o.amount, o); },
    'envCapacity.regenerate': function (o) { return WA.envCapacity.regenerate(o.resourceId, o); },
    'envCapacity.regionStatus': function (o) { return WA.envCapacity.regionStatus(o.regionId); },
    'envCapacity.evaluateImpact': function (o) { return WA.envCapacity.evaluateImpact(o.regionId, o.resourceType); },
    // v2.233.0 (EXV4-1): 材料生命周期与废弃物回流
    'envCapacity.declareRecyclableMaterial': function (o) {
      if (typeof WA.envCapacity.declareRecyclableMaterial === 'function') {
        return WA.envCapacity.declareRecyclableMaterial(o.materialId, o.spec);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'envCapacity.generateScrap': function (o) {
      if (typeof WA.envCapacity.generateScrap === 'function') {
        return WA.envCapacity.generateScrap(o.materialId, o.amount, o.source, o.locationId, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'envCapacity.recycleScrap': function (o) {
      if (typeof WA.envCapacity.recycleScrap === 'function') {
        return WA.envCapacity.recycleScrap(o.materialId, o.amount, o.worker, o.facilityId, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'envCapacity.materialLifecycle': function (o) {
      if (typeof WA.envCapacity.materialLifecycle === 'function') {
        return WA.envCapacity.materialLifecycle(o.materialId, o.locationId);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.233.0 (EXV4-2): 人口迁入迁出与地方能力变化
    'demographicFlow.setPlaceCapacity': function (o) {
      if (typeof WA.demographicFlow.setPlaceCapacity === 'function') {
        return WA.demographicFlow.setPlaceCapacity(o.placeId, o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'demographicFlow.planMigration': function (o) {
      if (typeof WA.demographicFlow.planMigration === 'function') {
        return WA.demographicFlow.planMigration(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'demographicFlow.commitMigration': function (o) {
      if (typeof WA.demographicFlow.commitMigration === 'function') {
        return WA.demographicFlow.commitMigration(o.spec || o, o.opts || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'demographicFlow.arriveMigration': function (o) {
      if (typeof WA.demographicFlow.arriveMigration === 'function') {
        return WA.demographicFlow.arriveMigration(o.migrationId);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'demographicFlow.recordSeasonalDeparture': function (o) {
      if (typeof WA.demographicFlow.recordSeasonalDeparture === 'function') {
        return WA.demographicFlow.recordSeasonalDeparture(o.who, o.fromPlace || o.from, o.toPlace || o.to, o.purpose, o.durationDays);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'demographicFlow.recordSeasonalReturn': function (o) {
      if (typeof WA.demographicFlow.recordSeasonalReturn === 'function') {
        return WA.demographicFlow.recordSeasonalReturn(o.seasonalId);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'demographicFlow.demographicProjection': function (o) {
      if (typeof WA.demographicFlow.demographicProjection === 'function') {
        return WA.demographicFlow.demographicProjection(o.locationId || o.placeId);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.233.0 (EXV4-3): 照护链与公共服务韧性
    'careChain.registerCareCommitment': function (o) {
      if (typeof WA.careChain.registerCareCommitment === 'function') {
        return WA.careChain.registerCareCommitment(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'careChain.assessCaregiverAbsence': function (o) {
      if (typeof WA.careChain.assessCaregiverAbsence === 'function') {
        return WA.careChain.assessCaregiverAbsence(o.caregiverId || o.who);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'careChain.reportCareAbsence': function (o) {
      if (typeof WA.careChain.reportCareAbsence === 'function') {
        return WA.careChain.reportCareAbsence(o.commitmentId, o.breachReason || o.reason);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'careChain.referCare': function (o) {
      if (typeof WA.careChain.referCare === 'function') {
        return WA.careChain.referCare(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'careChain.queueForPublicCare': function (o) {
      if (typeof WA.careChain.queueForPublicCare === 'function') {
        return WA.careChain.queueForPublicCare(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'careChain.careChainProjection': function (o) {
      if (typeof WA.careChain.careChainProjection === 'function') {
        return WA.careChain.careChainProjection(o.query || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'careChain.escalationLevels': function () {
      return (WA.careChain && WA.careChain.ESCALATION_LEVELS) ? WA.careChain.ESCALATION_LEVELS.slice() : [];
    },
    'rumor.competeForAttention': function (o) { return WA.rumor.competeForAttention(o.events, o.context, o); },
    // v2.232.0 (EXV3-4): 具名公共项目
    'coop.proposeProject': function (o) { return WA.coop.proposeProject(o); },
    'coop.pledgeProject': function (o) { return WA.coop.pledgeProject(o.projectId, o.who, o.contributions); },
    'coop.handleAbsence': function (o) { return WA.coop.handleAbsence(o.projectId, o.absentPerson, o.solution, o); },
    'coop.concludeProject': function (o) { return WA.coop.concludeProject(o.projectId, o); },
    // v2.231.0（拓展 IN-8）：社会遗产
    'socialLegacy.formLegacy': function (o) { return WA.socialLegacy.formLegacy(o.spec); },
    'socialLegacy.acceptLegacy': function (o) { return WA.socialLegacy.acceptLegacy(o.legacyId, o); },
    'socialLegacy.witnessAccount': function (o) { return WA.socialLegacy.witnessAccount(o.legacyId, o.witness, o.account); },
    'socialLegacy.viewLegacy': function (o) { return WA.socialLegacy.viewLegacy(o.legacyId); },
    'socialLegacy.registerClaim': function (o) { return WA.socialLegacy.registerClaim(o.eventId, o); },
    'socialLegacy.spreadClaim': function (o) { return WA.socialLegacy.spreadClaim(o.claimId, o.targetGroupId, o); },
    'socialLegacy.clarifyClaim': function (o) { return WA.socialLegacy.clarifyClaim(o.eventId, o.who, o.evidence, o.targetGroupId); },
    'socialLegacy.groupMemoryStance': function (o) { return WA.socialLegacy.groupMemoryStance(o.groupId, o.who); },
    'socialLegacy.initiateHandover': function (o) { return WA.socialLegacy.initiateHandover(o); },
    'socialLegacy.proposeSuccession': function (o) { return WA.socialLegacy.proposeSuccession(o.handoverId, o.candidateWho, o.acceptedScope, o.terms); },
    'socialLegacy.resolveHandover': function (o) { return WA.socialLegacy.resolveHandover(o.handoverId, o); },
    'socialLegacy.reorganizeUnclaimed': function (o) { return WA.socialLegacy.reorganizeUnclaimed(o.handoverId, o.policyMap); },
    // v2.231.0（活动系列与周期性集市 WX-6）
    'activity.declareSeries': function (o) { return WA.activity.declareSeries(o.seriesId, o); },
    'activity.nextCycle': function (o) { return WA.activity.nextCycle(o.seriesId, o); },
    'activity.prepareForActivity': function (o) { return WA.activity.prepareForActivity(o.activityId, o.who, o); },
    'activity.handleDisruption': function (o) { return WA.activity.handleDisruption(o.activityId, o.disruptionType, o); },
    'activity.nextCycleInvitations': function (o) { return WA.activity.nextCycleInvitations(o.seriesId); },
    'activity.getSeries': function (o) { return WA.activity.getSeries(o.seriesId); },
    'activity.listSeries': function (o) { return WA.activity.listSeries(o); },
    'techLineage.getStandard': function (o) { return WA.techLineage.getStandard(o.standardId); },
    'techLineage.listStandards': function (o) { return WA.techLineage.listStandards(o); },
    'sharedAwareness.viewPact': function (o) { return WA.sharedAwareness.viewPact(o.pactId); },
    'customLax.listPrecedents': function (o) { return WA.customLax.listPrecedents(o); },
    'customLax.reciprocityLedger': function (o) { return WA.customLax.reciprocityLedger(o.who); },
    // v2.231.0（拓展 IN-9）：历史相变与长期投资路径 WX-9
    'phaseTransition.evaluatePhase': function (o) { return WA.phaseTransition.evaluatePhase(o.regionId); },
    'phaseTransition.transition': function (o) { return WA.phaseTransition.transition(o.regionId, o.targetPhaseId, o); },
    'phaseTransition.history': function (o) { return WA.phaseTransition.history(o.regionId); },
    'phaseTransition.declarePlaceLayout': function (o) { return WA.phaseTransition.declarePlaceLayout(o.placeId, o.layoutType, o); },
    'phaseTransition.investPath': function (o) { return WA.phaseTransition.investPath(o.placeId, o); },
    'phaseTransition.evaluatePlacePath': function (o) { return WA.phaseTransition.evaluatePlacePath(o.placeId); },
    'phaseTransition.planTransitionRoute': function (o) { return WA.phaseTransition.planTransitionRoute(o.placeId, o.targetLayout, o); },
    'travel.move': function (o) { return WA.act.add(o.who, { kind: 'move', goalId: o.goalId, from: o.from, to: o.to, place: o.place, text: o.text }); }
  };

  const stat = { boards: 0, planned: 0, refused: 0, lastReason: '', faults: {}, byKind: {} };
  function noteFault(code) { stat.faults[code] = (stat.faults[code] || 0) + 1; stat.refused++; stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function knownPerson(who) { const s = state(); return !!(s.people && s.people['p_' + who]); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }

  function ensureDeskStore(draft) {
    if (!draft.actionDesk || typeof draft.actionDesk !== 'object') {
      draft.actionDesk = { opportunities: {}, receipts: {} };
    }
    if (!draft.actionDesk.opportunities || typeof draft.actionDesk.opportunities !== 'object') {
      draft.actionDesk.opportunities = {};
    }
    if (!draft.actionDesk.receipts || typeof draft.actionDesk.receipts !== 'object') {
      draft.actionDesk.receipts = {};
    }
    return draft.actionDesk;
  }

  /**
   * OPV3-2: 行动资源与前置条件只读预览。
   * 零写入，不消耗材料与耐久。
   */
  function previewAction(actionId, opts) {
    const aid = clean(actionId, 60);
    const o = opts || {};
    const w = clean(o.who, 60);
    const st = state();
    if (w && !knownPerson(w)) {
      return { ok: false, reason: 'unknown-person', who: w };
    }

    // 地方规约硬性检查 (EXV3-5)
    if (WA.customLax && typeof WA.customLax.checkRuleEnforcement === 'function' && (o.orgId || o.place)) {
      const ruleCheck = WA.customLax.checkRuleEnforcement(o.orgId || o.place, aid, w, o.ruleDetails || o);
      if (!ruleCheck.ok) {
        return ruleCheck;
      }
    }

    // 身体状态与行动资格检查 (OPV4-6)
    // 伤病/重度衰竭限制行动；生理妊娠/并发症限制负重与剧烈劳动
    let healthPenalty = null;
    if (w) {
      if (WA.lifeline && typeof WA.lifeline.capacityOf === 'function') {
        const cap = WA.lifeline.capacityOf(w);
        if (cap && cap.ok && cap.limits && cap.limits.length > 0) {
          const blocksAction = cap.limits.some(function (lim) {
            return lim.level === 'prohibited' && (aid.indexOf(lim.activity) >= 0 || lim.activity === 'all_labor');
          });
          if (blocksAction) {
            return {
              ok: false,
              reason: 'health-capacity-prohibited',
              who: w,
              limits: cap.limits,
              note: '身体病况严禁进行该项活动'
            };
          }
          healthPenalty = { limited: true, limits: cap.limits, costMultiplier: 1.5 };
        }
      }
      if (WA.survival && typeof WA.survival.statusOf === 'function') {
        const surv = WA.survival.statusOf(w);
        if (surv && surv.ok && surv.exhausted) {
          return {
            ok: false,
            reason: 'vital-exhaustion-blocked',
            who: w,
            note: '当事人处于极度衰竭/昏迷边缘，丧失行动资格，必须先行休养'
          };
        }
      }
    }

    // 通道关卡查验硬性拦截 (EXV3-2)
    if (WA.serviceNetwork && typeof WA.serviceNetwork.checkPassage === 'function' && (o.toPlace || aid.indexOf('travel') >= 0)) {
      const fromP = o.fromPlace || o.place || (st.people && st.people['p_' + w] && st.people['p_' + w].location);
      const toP = o.toPlace;
      if (fromP && toP) {
        const passCheck = WA.serviceNetwork.checkPassage(fromP, toP, w, o);
        if (!passCheck.ok || !passCheck.permitted) {
          return {
            ok: false,
            reason: passCheck.reason,
            checkpointId: passCheck.checkpointId,
            note: passCheck.note,
            requiredPermit: passCheck.requiredPermit,
            tollAmount: passCheck.tollAmount
          };
        }
      }
    }

    // 群体社会记忆立场检查 (EXV3-7)
    if (WA.socialLegacy && typeof WA.socialLegacy.groupMemoryStance === 'function' && o.clientGroup) {
      const gStance = WA.socialLegacy.groupMemoryStance(o.clientGroup, w);
      if (gStance && gStance.summaryStance === 'suspicious') {
        if (!o.guarantor) {
          return {
            ok: false,
            reason: 'group-distrust-blocked',
            clientGroup: o.clientGroup,
            who: w,
            adverseCount: gStance.adverseCount,
            costModifier: gStance.costModifier,
            note: '发包群体因历史争议与负面传闻怀疑当事人，需提供同行担保或出面澄清方可承接'
          };
        }
      }
    }

    // 地方发展路径与连锁冲击感知 (EXV3-8 & EXV3-9)
    let pathInfo = null;
    let cascadingWarning = null;
    const tgtPlace = o.place || (st.people && st.people['p_' + w] && st.people['p_' + w].location);
    if (tgtPlace) {
      if (WA.phaseTransition && typeof WA.phaseTransition.evaluatePlacePath === 'function') {
        const pEval = WA.phaseTransition.evaluatePlacePath(tgtPlace);
        if (pEval && pEval.ok) {
          pathInfo = {
            layoutType: pEval.layoutType,
            efficiencyFactor: pEval.efficiencyFactor,
            transitCostFactor: pEval.transitCostFactor
          };
        }
      }
      if (WA.aftermathImpact && typeof WA.aftermathImpact.listCascadingChains === 'function') {
        const chains = WA.aftermathImpact.listCascadingChains({ place: tgtPlace, status: 'active' });
        if (chains && chains.length > 0) {
          cascadingWarning = {
            disrupted: true,
            activeChainCount: chains.length,
            shockType: chains[0].shockType,
            note: '该地区受到连锁供应链或物流冲击影响'
          };
        }
      }
    }

    // 地点公共服务设施硬性约束与跨节点分流 (OPV3-7 & EXV3-2)
    let serviceDelay = 0;
    let failoverInfo = null;
    if (WA.serviceNetwork && typeof WA.serviceNetwork.checkServiceImpact === 'function' && o.place && o.serviceType) {
      const srvCheck = WA.serviceNetwork.checkServiceImpact(o.place, o.serviceType);
      if (!srvCheck.available) {
        return {
          ok: false,
          reason: srvCheck.reason,
          facilityId: srvCheck.facilityId,
          note: srvCheck.note
        };
      }
      if (srvCheck.delayDays) {
        serviceDelay = srvCheck.delayDays;
      }
      if (srvCheck.failover) {
        failoverInfo = {
          failover: true,
          failoverPlace: srvCheck.failoverPlace,
          facilityName: srvCheck.facilityName,
          transportCost: srvCheck.transportCost
        };
      }
    }

    // 1. 若为方法任务，复用 actionMethods.evaluate
    if (aid.indexOf('method.') === 0 || aid.indexOf('task:') === 0 || o.taskId) {
      const taskId = o.taskId || aid.replace(/^method\./, '');
      if (WA.actionMethods && typeof WA.actionMethods.evaluate === 'function') {
        const ev = WA.actionMethods.evaluate(taskId, w, o);
        return Object.assign({ ok: true, preview: true, actionId: aid, serviceDelayDays: serviceDelay, failover: failoverInfo, canExecute: ev && ev.ok && ev.available && ev.available.length > 0 }, ev);
      }
    }

    // 2. 若为研究供料/推进
    if (aid.indexOf('research.') === 0) {
      const pid = clean(o.projectId || aid.slice(aid.indexOf(':') + 1), 60);
      if (WA.research && typeof WA.research.view === 'function') {
        const rv = WA.research.view(pid);
        if (!rv || !rv.ok) return { ok: false, reason: 'project-not-found', projectId: pid };
        const shortfalls = [];
        const personRec = (st.people && st.people['p_' + w]) || null;
        const pRes = (personRec && personRec.resources) || {};
        Object.keys(rv.materials || {}).forEach(function (mat) {
          const req = num(rv.materials[mat]) || 0;
          const havePool = num((rv.reserve || {})[mat]) || 0;
          const havePerson = num(pRes[mat]) || 0;
          if (havePool < req) {
            shortfalls.push({ material: mat, needTotal: req, poolHave: havePool, personHave: havePerson, deficient: req - havePool });
          }
        });
        const canSupply = shortfalls.every(function (s) { return s.personHave >= s.deficient; });
        return {
          ok: true, preview: true, actionId: aid, projectId: pid,
          canExecute: canSupply && shortfalls.length > 0,
          shortfalls: shortfalls,
          alternatives: shortfalls.length ? ['寻求工坊支援', '调整研究方案'] : ['料已备齐，可推进'],
          note: '纯读预览，零扣除零磨损'
        };
      }
    }

    // 3. 若为日程预约/安排前置检查
    if (aid.indexOf('schedule.') === 0) {
      if (WA.laborSchedule && typeof WA.laborSchedule.previewSchedule === 'function') {
        const scPrev = WA.laborSchedule.previewSchedule(Object.assign({}, o, { who: w }));
        return Object.assign({ ok: true, preview: true, actionId: aid, canExecute: !scPrev.hasConflict }, scPrev);
      }
    }

    // 3. 通用预览兜底
return {
       ok: true,
       preview: true,
       actionId: aid,
       who: w,
       canExecute: true,
       costEstimate: { duration: 1, wear: 0 },
       shortfalls: [],
       healthPenalty: healthPenalty,
       pathInfo: pathInfo,
       cascadingWarning: cascadingWarning,
       note: '通用前置与条件校验通过'
     };
  }

  /**
   * OPV3-2: 场景工作台入口。
   * 支持预览模式与带幂等回执的确认执行。
   */
  function workbench(opts) {
    const o = opts || {};
    const mode = clean(o.mode || 'execute', 20);
    const aid = clean(o.actionId, 60);
    const key = clean(o.idempotencyKey, 80);

    if (mode === 'preview') {
      return previewAction(aid, o);
    }

    // 执行模式：检查幂等性
    if (key) {
      const st = state();
      const receipts = (st.actionDesk && st.actionDesk.receipts) || {};
      if (receipts[key]) {
        return { ok: true, duplicated: true, idempotencyKey: key, receipt: receipts[key], note: '重复提交，已返回历史结算回执' };
      }
    }

    // 执行实际 plan
    const execRes = plan(aid, o);
    if (!execRes || !execRes.ok) {
      return execRes;
    }

    // 写入回执
    const receiptRow = {
      id: key || ('rcpt_' + clockNow('actionDesk')),
      actionId: aid,
      who: clean(o.who, 60),
      outcome: execRes,
      at: clockNow('actionDesk')
    };

    if (key && WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        const d = ensureDeskStore(draft);
        d.receipts[key] = receiptRow;
        return true;
      }, 'actionDesk:recordReceipt');
    }

    return {
      ok: true,
      actionId: aid,
      receipt: receiptRow,
      result: execRes,
      nextActions: execRes.nextActions || []
    };
  }

  function declareOpportunity(oppId, spec) {
    const id = clean(oppId, 60);
    const s = spec || {};
    if (!id) return { ok: false, reason: 'missing-fields', field: 'oppId' };
    let out = null;
    WA.store.transact(function (draft) {
      const d = ensureDeskStore(draft);
      const row = {
        id: id,
        kind: clean(s.kind || 'production_order', 40),
        targetId: clean(s.targetId || id, 60),
        slots: Math.max(1, num(s.slots) || 1),
        rule: clean(s.rule || 'qualification', 30),
        bids: [],
        status: 'open',
        awardedAt: 0,
        winners: []
      };
      d.opportunities[id] = row;
      out = { ok: true, opportunity: row };
      return true;
    }, 'actionDesk:declareOpportunity');
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function applyOpportunity(oppId, who, opts) {
    const id = clean(oppId, 60);
    const w = clean(who, 60);
    const o = opts || {};
    if (!id || !w) return { ok: false, reason: 'missing-fields' };
    if (!knownPerson(w)) return { ok: false, reason: 'unknown-person', who: w };
    const st = state();
    const pRecord = (st.people && st.people['p_' + w]) || null;
    if (pRecord && (pRecord.traveling || pRecord.status === 'traveling' || pRecord.status === 'on_the_road' || pRecord.status === 'transit')) {
      return { ok: false, reason: 'person-traveling', who: w, note: '该人物正在途中旅行，无法申请本地机会' };
    }
    const opps = (st.actionDesk && st.actionDesk.opportunities) ? st.actionDesk.opportunities : {};
    const opp = opps[id];
    if (!opp) return { ok: false, reason: 'opportunity-not-found', id: id };
    if (opp.status !== 'open') return { ok: false, reason: 'opportunity-closed', id: id, status: opp.status };

    let out = null;
    WA.store.transact(function (draft) {
      const d = ensureDeskStore(draft);
      const target = d.opportunities[id];
      if (!target || target.status !== 'open') {
        out = { ok: false, reason: 'opportunity-closed' };
        return false;
      }
      if (!Array.isArray(target.bids)) target.bids = [];
      const existing = target.bids.filter(function (b) { return b && b.who === w; })[0];
      const bidEntry = {
        who: w,
        skill: num(o.skill) === null ? 1 : num(o.skill),
        price: num(o.price) === null ? 10 : num(o.price),
        bidAt: clockNow('actionDesk'),
        note: clean(o.note, 60)
      };
      if (existing) {
        Object.assign(existing, bidEntry);
      } else {
        target.bids.push(bidEntry);
      }
      out = { ok: true, oppId: id, who: w, bid: bidEntry, totalBids: target.bids.length };
      return true;
    }, 'actionDesk:applyOpportunity');
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function awardOpportunity(oppId, opts) {
    const id = clean(oppId, 60);
    const o = opts || {};
    const st = state();
    const opps = (st.actionDesk && st.actionDesk.opportunities) ? st.actionDesk.opportunities : {};
    const opp = opps[id];
    if (!opp) return { ok: false, reason: 'opportunity-not-found', id: id };
    if (opp.status !== 'open') return { ok: false, reason: 'already-awarded', id: id, status: opp.status };
    const bids = (Array.isArray(opp.bids) ? opp.bids : []).slice();
    if (bids.length === 0) return { ok: false, reason: 'no-bids', id: id };

    const rule = clean(o.rule || opp.rule || 'qualification', 30);
    if (rule === 'first_come') {
      bids.sort(function (a, b) { return (num(a.bidAt) || 0) - (num(b.bidAt) || 0); });
    } else if (rule === 'price') {
      bids.sort(function (a, b) { return (num(a.price) || 0) - (num(b.price) || 0); });
    } else {
      bids.sort(function (a, b) { return (num(b.skill) || 0) - (num(a.skill) || 0); });
    }

    const slots = Math.max(1, num(opp.slots) || 1);
    const winners = bids.slice(0, slots);
    const declined = bids.slice(slots);

    let out = null;
    WA.store.transact(function (draft) {
      const d = ensureDeskStore(draft);
      const target = d.opportunities[id];
      if (!target || target.status !== 'open') {
        out = { ok: false, reason: 'already-awarded' };
        return false;
      }
      target.status = 'awarded';
      target.awardedAt = clockNow('actionDesk');
      target.winners = winners.map(function (w) { return w.who; });
      out = {
        ok: true,
        oppId: id,
        rule: rule,
        winners: winners,
        declined: declined.map(function (d) {
          return {
            who: d.who,
            reason: 'outbid-or-slots-full',
            nextActions: ['actionDesk.findAlternative']
          };
        }),
        status: 'awarded'
      };
      return true;
    }, 'actionDesk:awardOpportunity');

    if (out && out.ok && opp.kind === 'production_order' && opp.targetId && winners.length && WA.production) {
      try {
        WA.production.staff(opp.targetId, winners[0].who);
      } catch (e) {}
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 逐源采集的在场性（缺席如实报，不静默当空）。 */
  const SOURCE_NS = { research: 'research', family: 'family', production: 'production', training: 'training', gear: 'gear' };
  function srcOk(kind) {
    const ns = SOURCE_NS[kind];
    return !!(ns && WA[ns] && typeof WA[ns] === 'object');
  }
  /**
   * 采集器统一返回：{ kind, on, rows:[...], note }
   *   on=false ⇒ 该 owner 未启用/未装载；面板据此**不渲染该组的操作**（边界 5）。
   *   任何采集器抛错都只影响自己这一组 —— 不折成空表（折叠之后「读不出来」
   *   与「真没事」逐字同形，玩家会照着空表做决定；与 agenda v2.205.0 同规）。
   */
  function collect(kind, fn) {
    const out = { kind: kind, on: false, rows: [], note: '' };
    if (!srcOk(kind)) { out.note = 'module-missing'; return out; }
    try {
      const cfg = (WA[SOURCE_NS[kind]] && typeof WA[SOURCE_NS[kind]].getSettings === 'function') ? WA[SOURCE_NS[kind]].getSettings() : null;
      out.on = !!(cfg && cfg.enabled);
      if (!out.on) { out.note = 'owner-disabled'; return out; }
      fn(out);
    } catch (e) { out.note = 'read-failed'; out.rows = []; }
    return out;
  }
  function row(kind, id, label, state2, why, extra) {
    return Object.assign({ kind: kind, id: id, label: label, state: state2,
      why: clean(why, 120), owner: kind }, extra || {});
  }

  // ── 研究：立项中的项目 → 供料 / 推进（缺什么列什么，不改一行）────────
  function fromResearch(cfg, who) {
    const list = (typeof WA.research.list === 'function') ? (WA.research.list() || []) : [];
    const rows = [];
    list.slice(0, cfg.maxPerGroup).forEach(function (p) {
      if (!p || !p.id) return;
      if (['confirmed', 'failed', 'abandoned'].indexOf(p.status) >= 0) {
        rows.push(row('research', 'research.view:' + p.id, '成果「' + clean(p.result, 20) + '」已' + p.status,
          'blocked', '项目已终结', { projectId: p.id, status: p.status, next: '如需继续，另立新项目' }));
        return;
      }
      const v = (typeof WA.research.view === 'function') ? WA.research.view(p.id) : null;
      if (!v || !v.ok) {
        rows.push(row('research', 'research.view:' + p.id, '项目 ' + p.id, 'blocked', '读不到项目详情', { projectId: p.id }));
        return;
      }
      // 缺料判据**由 owner 的数据算**：materials 总量按阶段摊，末阶段结清（与 advance 同口径）。
      const phase = num(v.phase) || 0, phases = Math.max(1, num(v.phases) || 1);
      const short = [];
      Object.keys(v.materials || {}).forEach(function (k) {
        const total = num(v.materials[k]) || 0;
        const spent = num((v.consumed || {})[k]) || 0;
        const target = (phase + 1 >= phases) ? total : total * (phase + 1) / phases;
        const per = Math.max(0, target - spent);
        const have = num((v.reserve || {})[k]) || 0;
        if (have < per) short.push({ material: k, need: per, have: have });
      });
      if (short.length) {
        const s0 = short[0];
        rows.push(row('research', 'research.supply:' + p.id, '为「' + clean(v.result, 20) + '」供料',
          'prepare', '缺 ' + s0.material + '：需 ' + s0.need + '，池中 ' + s0.have,
          { projectId: p.id, need: short, next: '从' + (who || v.by) + '的资源面供料' }));
      } else {
        rows.push(row('research', 'research.advance:' + p.id, '推进「' + clean(v.result, 20) + '」第 ' + (phase + 1) + '/' + phases + ' 阶段',
          'ready', v.prerequisites && v.prerequisites.length ? ('需确认前置：' + v.prerequisites.join('、')) : '料已备齐',
          { projectId: p.id, prerequisites: (v.prerequisites || []).slice(), evidence: (v.evidence || []).slice(), next: '确认后推进' }));
      }
    });
    return rows;
  }

  // ── 共同生活：单位 → 出资 / 照护交接（活跃照护行就是可转交对象）──────
  function fromFamily(cfg, who) {
    const list = (typeof WA.family.list === 'function') ? (WA.family.list() || []) : [];
    const rows = [];
    list.slice(0, cfg.maxPerGroup).forEach(function (u) {
      if (!u || !u.id) return;
      const v = (typeof WA.family.view === 'function') ? WA.family.view(u.id) : null;
      if (!v || !v.ok) { rows.push(row('family', 'family.view:' + u.id, u.name || u.id, 'blocked', '读不到单位详情', { unitId: u.id })); return; }
      const mine = (v.members || []).filter(function (m) { return m.who === who; })[0];
      const activeCare = (v.care || []).filter(function (c) { return c.active; });
      if (activeCare.length) {
        activeCare.slice(0, 2).forEach(function (c) {
          const canTake = (c.caregiver === who) && !mine ? false : true;
          rows.push(row('family', 'family.transferCare:' + u.id + ':' + c.ward,
            '转交「' + c.ward + '」的照护（现由 ' + c.caregiver + ' 负责）',
            canTake ? 'ready' : 'blocked',
            canTake ? '本人可接手' : '本人不是该单位成员',
            { unitId: u.id, ward: c.ward, caregiver: c.caregiver, next: '转交后负责人改变' }));
        });
      }
      rows.push(row('family', 'family.contribute:' + u.id, '为「' + clean(v.name, 20) + '」出资',
        'ready', '共同池现有 ' + Object.keys(v.treasury || {}).length + ' 类物资',
        { unitId: u.id, treasury: Object.assign({}, v.treasury), next: '从本人资源面转进共同池' }));
    });
    return rows;
  }

  // ── 生产：工单 → 排班 / 推进（资质与缺料由 owner 判）────────────────
  function fromProduction(cfg, who) {
    const list = (typeof WA.production.list === 'function') ? (WA.production.list() || []) : [];
    const rows = [];
    list.slice(0, cfg.maxPerGroup).forEach(function (j) {
      if (!j || !j.id) return;
      if (j.status === 'paused') {
        rows.push(row('production', 'production.resume:' + j.id, '复工工单 ' + clean(j.recipe, 20) + '（已暂停）',
          'prepare', '暂停中，需先复工后才能推进', { orderId: j.id, next: '复工后按工期推进' }));
      } else if (j.status === 'running') {
        const needMore = (num(j.done) || 0) < (num(j.days) || 0);
        if (needMore) {
          rows.push(row('production', 'production.advance:' + j.id, '推进 ' + clean(j.recipe, 20) + '（' + (num(j.done) || 0) + '/' + (num(j.days) || 1) + ' 天）',
            'ready', '可按工期推进', { orderId: j.id, next: '推进一步' }));
        } else {
          rows.push(row('production', 'production.deliver:' + j.id, '交付工单 ' + clean(j.recipe, 20) + '（已满期）',
            'ready', '工期已满，可交付', { orderId: j.id, next: '交付' }));
        }
      } else if (j.status === 'done') {
        rows.push(row('production', 'production.deliver:' + j.id, '交付工单 ' + clean(j.recipe, 20) + '（已完工）',
          'ready', '工期已满，可交付', { orderId: j.id, next: '交付' }));
      } else {
        rows.push(row('production', 'production.view:' + j.id, '工单 ' + clean(j.recipe, 20) + ' 已' + j.status,
          'blocked', '非在产状态', { orderId: j.id, status: j.status }));
      }
    });
    return rows;
  }

  // ── 能力：能做什么（training.can 是 owner 的读口）──────────────────
  function fromTraining(cfg, who) {
    const rows = [];
    if (typeof WA.training.abilitiesView !== 'function') return rows;
    const av = WA.training.abilitiesView() || [];
    av.slice(0, cfg.maxPerGroup).forEach(function (a) {
      if (!a || !a.name) return;
      const can = (typeof WA.training.can === 'function') ? WA.training.can(who, a.name, {}) : null;
      rows.push(row('training', 'training.practice:' + a.name,
        '练习「' + clean(a.name, 20) + '」',
        (can && can.ok) ? 'ready' : 'prepare',
        (can && can.ok) ? '已具备条件' : ('尚不具备：' + String((can && can.reason) || 'unknown')),
        { ability: a.name, next: can && can.ok ? '累积进度' : '先补前置' }));
    });
    return rows;
  }

  // ── 物件：手上有什么能用（gear.canUse 是 owner 的读口）─────────────
  function fromGear(cfg, who) {
    const rows = [];
    const list = (typeof WA.gear.list === 'function') ? (WA.gear.list(who, {}) || []) : [];
    list.slice(0, cfg.maxPerGroup).forEach(function (it) {
      if (!it || !it.id) return;
      const can = (typeof WA.gear.canUse === 'function') ? WA.gear.canUse(it.id, who) : null;
      rows.push(row('gear', 'gear.use:' + it.id,
        '使用「' + clean(it.name || it.label || it.id, 20) + '」',
        (can && can.ok) ? 'ready' : 'blocked',
        (can && can.ok) ? '本人持有可用' : ('不可用：' + String((can && can.reason) || 'unknown')),
        { itemId: it.id, next: can && can.ok ? '消耗一次使用' : '先取得或修理' }));
    });
    return rows;
  }

  /**
   * OPV4-2：跨轮行动生命周期（**纯读薄投影**）。
   *
   * ── 它治什么 ────────────────────────────────────────────────────
   *   OPV4-1 让玩家能从当前场景办事，但**一条长动作跨过若干轮之后**，
   *   「哪些还没完、哪些在等我确认、哪些已经废了」没有一处说得清：
   *   research / production / commission / familyOps 各自记自己的 phase，
   *   玩家得逐页翻。本函数把各 owner 的**现状**归拢成五档生命周期阶段。
   *
   * ── 边界（与 OPV4-2 原文同源）────────────────────────────────────
   *   ① **只读**：一行都不写，不改任何 owner 状态、不写存档。
   *   ② **不建第二真源**：阶段由各 owner 的读口**当场算**（`research.view`
   *      的 phase/phases、`production.list` 的 status、`commission.list` 的
   *      contract.status…），本模块不落盘任何阶段字段。phase 判定与恢复动作
   *      一一对应：`recoverAction` 也只把调用转给 owner 的写口。
   *   ③ 每个阶段行都带 `owner` 与 `recover`（可执行的恢复 actionId），
   *      面板据此渲染，玩家不必先知道引擎名。
   *   ④ 读不到的 owner 如实报 `unreadable`，**不折成「没有待办」**
   *      （「读不出来」与「真没事」逐字同形是本仓点过的坑）。
   * @param {object} opts {who, place, limit}
   * @returns {{ok:boolean, rows:Array, counts:object, note:string}}
   */
  function lifecycle(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(o.who || o.person, 40);
    const limit = Math.max(1, Math.min(num(o.limit) || 24, 96));
    const rows = [];
    const faults = [];
    const st = state();

    // ── 1. 研究：立项中 → 供料 / 推进；已终结 → 终态 ──
    if (WA.research && typeof WA.research.list === 'function') {
      let list = [];
      try { list = WA.research.list() || []; } catch (e) { faults.push('research:read-failed'); }
      list.forEach(function (p) {
        if (!p || !p.id) return;
        if (who && p.by !== who) return;
        if (['confirmed', 'failed', 'abandoned'].indexOf(p.status) >= 0) {
          rows.push({ stage: 'terminal', kind: 'research', id: p.id,
            label: '研究「' + clean(p.result || p.hypothesis, 24) + '」已' + p.status,
            owner: 'research', why: '项目已终结，不再推进', recover: null, terminal: true });
          return;
        }
        const phase = num(p.phase) || 0, phases = Math.max(1, num(p.phases) || 1);
        let v = null;
        try { v = (typeof WA.research.view === 'function') ? WA.research.view(p.id) : null; } catch (e) { v = null; }
        if (!v || !v.ok) {
          rows.push({ stage: 'unreadable', kind: 'research', id: p.id, label: '项目 ' + p.id,
            owner: 'research', why: '读不到项目详情（如实报，不当成没事）', recover: null });
          return;
        }
        const short = [];
        Object.keys(v.materials || {}).forEach(function (k) {
          const total = num(v.materials[k]) || 0;
          const spent = num((v.consumed || {})[k]) || 0;
          const target = (phase + 1 >= phases) ? total : total * (phase + 1) / phases;
          const per = Math.max(0, target - spent);
          const have = num((v.reserve || {})[k]) || 0;
          if (have < per) short.push(k);
        });
        if (short.length) {
          rows.push({ stage: 'blocked', kind: 'research', id: p.id,
            label: '为「' + clean(v.result || v.hypothesis, 20) + '」供料',
            owner: 'research', why: '缺料：' + short.join('、'),
            recover: 'research.supply:' + p.id, next: ['research.supply'] });
        } else {
          rows.push({ stage: 'awaiting-confirm', kind: 'research', id: p.id,
            label: '推进「' + clean(v.result || v.hypothesis, 20) + '」第 ' + (phase + 1) + '/' + phases,
            owner: 'research', why: '料已备齐，等确认推进',
            recover: 'research.advance:' + p.id, next: ['research.advance'] });
        }
      });
    } else { faults.push('research:module-missing'); }

    // ── 2. 生产：暂停 / 在产 / 待交付 → 可续做；部分交付 → 部分完成 ──
    if (WA.production && typeof WA.production.list === 'function') {
      let list = [];
      try { list = WA.production.list() || []; } catch (e) { faults.push('production:read-failed'); }
      list.forEach(function (j) {
        if (!j || !j.id) return;
        if (who && j.by && j.by !== who) return;
        const done = num(j.done) || 0, days = num(j.days) || 1;
        // 「已交过一批」的证据**只认 owner 读口给的明细**（production.list 导出的是
        //   `delivered` 账，没有 deliveredQty 这种别名）——读口有什么就用什么，
        //   不替 owner 猜字段名。有交过但未结清 ⇒ 部分完成，绝不折成终态。
        let handed = 0;
        Object.keys(j.delivered || {}).forEach(function (k) { handed += num(j.delivered[k]) || 0; });
        const closed = (j.status === 'delivered' || j.status === 'cancelled');
        if (!closed && handed > 0) {
          rows.push({ stage: 'partial', kind: 'production', id: j.id,
            label: '工单 ' + clean(j.recipe, 20) + ' 已部分交付（' + (done < days ? done + '/' + days + ' 天' : '工期已满') + '）',
            owner: 'production', why: '部分完成**不等于**成功，剩余未结',
            recover: (done < days ? 'production.advance:' + j.id : 'production.deliver:' + j.id),
            next: ['production.advance', 'production.deliver'], partial: true });
        } else if (j.status === 'paused') {
          rows.push({ stage: 'paused', kind: 'production', id: j.id,
            label: '复工工单 ' + clean(j.recipe, 20) + '（已暂停 ' + done + '/' + days + ' 天）',
            owner: 'production', why: '暂停中，可恢复继续',
            recover: 'production.resume:' + j.id, next: ['production.resume'] });
        } else if (j.status === 'running') {
          if (done < days) {
            rows.push({ stage: 'in-progress', kind: 'production', id: j.id,
              label: '推进 ' + clean(j.recipe, 20) + '（' + done + '/' + days + ' 天）',
              owner: 'production', why: '在产，可推进一步',
              recover: 'production.advance:' + j.id, next: ['production.advance'] });
          } else {
            rows.push({ stage: 'awaiting-confirm', kind: 'production', id: j.id,
              label: '交付工单 ' + clean(j.recipe, 20) + '（已满期）',
              owner: 'production', why: '工期已满，等交付确认',
              recover: 'production.deliver:' + j.id, next: ['production.deliver'] });
          }
        } else if (j.status === 'done') {
          rows.push({ stage: 'awaiting-confirm', kind: 'production', id: j.id,
            label: '交付工单 ' + clean(j.recipe, 20),
            owner: 'production', why: '已完工，等交付确认',
            recover: 'production.deliver:' + j.id, next: ['production.deliver'] });
        } else if (j.status === 'partial' || (num(j.deliveredQty) || 0) > 0) {
          rows.push({ stage: 'partial', kind: 'production', id: j.id,
            label: '工单 ' + clean(j.recipe, 20) + ' 已部分交付',
            owner: 'production', why: '部分完成**不等于**成功，剩余未结',
            recover: 'production.advance:' + j.id, next: ['production.advance', 'production.deliver'],
            partial: true });
        } else {
          rows.push({ stage: 'terminal', kind: 'production', id: j.id,
            label: '工单 ' + clean(j.recipe, 20) + ' 已' + j.status,
            owner: 'production', why: '非在产状态', recover: null, terminal: true });
        }
      });
    } else { faults.push('production:module-missing'); }

    // ── 3. 委托：pending() 是 owner 的读口（本模块不假设它有 list）──
    if (WA.commission && typeof WA.commission.pending === 'function') {
      let pr = null;
      try { pr = WA.commission.pending(); } catch (e) { pr = null; }
      if (!pr || !pr.ok) {
        // owner 关着 / 读不出来：如实记一条 fault，不当成「没有委托」
        faults.push('commission:' + String((pr && pr.reason) || 'read-failed'));
      } else {
        (pr.items || []).forEach(function (c) {
          if (!c || !c.id) return;
          rows.push({ stage: 'in-progress', kind: 'commission', id: c.id,
            label: '委托「' + clean(c.title || c.id, 24) + '」阶段 ' + ((num(c.stage) || 0) + 1) + '/' + (num(c.total) || 1),
            owner: 'commission', why: '委托进行中，可推进/结算',
            recover: 'commission.advance:' + c.id, next: ['commission.advance', 'commission.settle'] });
        });
      }
    } else { faults.push('commission:module-missing'); }

    // ── 4. 人物在途：旅行中 → 恢复后人物回到可指派状态 ──
    if (st.people) {
      Object.keys(st.people).forEach(function (k) {
        const p = st.people[k];
        if (!p) return;
        const pname = clean(p.name || k.replace(/^p_/, ''), 40);
        if (who && pname !== who) return;
        const pst = clean(p.status || p.action, 20);
        if (pst === 'traveling' || pst === 'on_the_road' || pst === 'transit') {
          rows.push({ stage: 'in-progress', kind: 'people', id: pname,
            label: pname + ' 在途（' + pst + '）', owner: 'travel',
            why: '在途中不可指派，抵达后恢复', recover: null });
        }
      });
    }

    const counts = { 'in-progress': 0, 'awaiting-confirm': 0, paused: 0, blocked: 0, partial: 0, terminal: 0, unreadable: 0 };
    rows.forEach(function (r) { if (counts[r.stage] != null) counts[r.stage]++; });
    const active = rows.filter(function (r) { return r.stage !== 'terminal'; });
    stat.lifecycles = (stat.lifecycles || 0) + 1;
    stat.lastReason = 'lifecycle';
    return {
      ok: true,
      isProjection: true,
      who: who,
      rows: active.slice(0, limit),
      terminalRows: rows.filter(function (r) { return r.stage === 'terminal'; }).slice(0, 6),
      counts: counts,
      faults: faults.slice(),
      note: '跨轮生命周期纯只读投影，不落任何阶段字段；恢复动作转交原 owner'
    };
  }

  /**
   * OPV4-2：恢复一条跨轮动作。**只是路由**——把 actionId 交给既有 owner 写口，
   *   本模块不自己写世界键，幂等一律由被调 owner 负责（与 plan() 同口径）。
   * @param {string} actionId 由 lifecycle() 行给的 recover 值
   * @param {object} opts
   */
  function recoverAction(actionId, opts) {
    const raw = String(actionId == null ? '' : actionId);
    if (!raw) return { ok: false, reason: 'missing-fields', field: 'actionId' };
    return plan(raw, opts || {});
  }

  /**
   * OPV4-1：场景优先流程收束（纯只读投影）。
   * 从场景出发：可知变化、可执行/受阻行动（带前置/所需资源/人员）、正在推进的工程。
   * 观察者视角隔离：不同视角人物仅看到其可知的情境，不泄露私密事实与不可见变化。
   */
  function sceneFlow(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(o.who || o.person || o.viewer, 40);
    const place = clean(o.place, 60);

    // 1. 调用 sceneNarrative.situation 取得情境投影
    let sit = null;
    if (WA.sceneNarrative && typeof WA.sceneNarrative.situation === 'function') {
      try { sit = WA.sceneNarrative.situation({ who: who, place: place }); } catch (e) { sit = null; }
    }
    if (!sit || !sit.ok) {
      noteFault('situation-unavailable');
      return { ok: false, reason: 'situation-unavailable', note: '情境模块未返回合法情境' };
    }

    // 2. 聚合行动，并为每个行动补充预览明细（只读前置与资源）
    const actList = (sit.availableActions || []).concat(sit.blockedActions || []);
    const enrichedActions = actList.map(function (act) {
      let prev = null;
      try {
        prev = previewAction(act.id, { who: who, place: sit.place || place });
      } catch (e) { prev = null; }
      return {
        id: act.id,
        kind: act.kind,
        label: act.label,
        state: act.state,
        why: act.why,
        owner: act.owner,
        preview: prev ? {
          canExecute: prev.canExecute,
          shortfalls: prev.shortfalls || [],
          alternatives: prev.alternatives || [],
          failover: prev.failover || null,
          serviceDelayDays: prev.serviceDelayDays || 0
        } : null
      };
    });

    const readyActions = enrichedActions.filter(function (a) { return a.state === 'ready'; });
    const blockedActions = enrichedActions.filter(function (a) { return a.state !== 'ready'; });

    return {
      ok: true,
      isProjection: true,
      viewer: sit.viewer || who,
      place: sit.place || place,
      present: sit.present || [],
      visibleChanges: sit.visibleChanges || [],
      jointProjects: sit.jointProjects || [],
      readyActions: readyActions,
      blockedActions: blockedActions,
      idleStatus: sit.idleStatus || 'active',
      idleText: sit.idleText || '',
      note: '场景行动流程纯只读收束投影，执行回到原场景'
    };
  }

  /**
   * OPV4-1：从场景执行行动。
   * 支持 mode='preview'（纯读演练）与 mode='execute'（带幂等回执写回 owner），
   * 结果均统一携带场景上下文（viewer, place）。
   */
  function actFromScene(opts) {
    const o = opts || {};
    const aid = clean(o.actionId, 60);
    if (!aid) return { ok: false, reason: 'missing-fields', field: 'actionId' };
    const mode = clean(o.mode || 'execute', 20);
    const who = clean(o.who || o.person || o.viewer, 40);
    const place = clean(o.place, 60);

    if (mode === 'preview') {
      const prev = previewAction(aid, o);
      return Object.assign({ ok: true, isSceneContext: true, viewer: who, place: place }, prev);
    }

    // 执行模式走 workbench 统一幂等和路由
    const res = workbench(Object.assign({}, o, { actionId: aid, who: who }));
    return Object.assign({ isSceneContext: true, viewer: who, place: place }, res);
  }

  // ══════════════════════════════════════════════════════════════════════
  // OPV4-8：章节、事件与分支的连续游玩（收束开章→目标/边界→推进→未结义务→收章→分支→恢复）
  // ══════════════════════════════════════════════════════════════════════

  function ensureCkptSettings() {
    try {
      const fn = WA.checkpoints && WA.checkpoints['getSettings'];
      const curS = fn ? fn() : null;
      if (!curS || !curS.enabled) {
        if (WA.checkpoints && typeof WA.checkpoints['setSettings'] === 'function') {
          WA.checkpoints['setSettings']({ enabled: true });
        }
      }
    } catch (e) {}
  }

  /** 开章：目标、脚本与约束 */
  function chapterOpen(opts) {
    const o = opts || {};
    if (!WA.chapters || typeof WA.chapters.start !== 'function') {
      return { ok: false, reason: 'chapters-engine-unavailable' };
    }
    const title = clean(o.title, 80);
    const script = clean(o.script || o.goal, 200);
    const notes = clean(o.notes || o.boundary || o.constraints, 200);
    WA.chapters.start(title, { script: script, notes: notes });
    const cur = WA.chapters.current();
    let ckpt = null;
    if (o.checkpoint && WA.checkpoints && typeof WA.checkpoints.save === 'function') {
      try {
        ensureCkptSettings();
        ckpt = WA.checkpoints.save(clean(o.checkpointName || ('open_' + (cur ? cur.title : 'chap')), 40), {
          note: '开章快照：' + (cur ? cur.title : '')
        });
      } catch (e) { ckpt = { ok: false, err: String(e) }; }
    }
    return { ok: true, chapter: cur, checkpoint: ckpt, at: clockNow('actionDesk') };
  }

  /** 纯读长局连续游玩流态收束 */
  function chapterFlow(opts) {
    const o = opts || {};
    const cur = (WA.chapters && typeof WA.chapters.current === 'function') ? WA.chapters.current() : null;
    const st = state();
    const hist = (st.chapters && Array.isArray(st.chapters.history)) ? st.chapters.history : [];
    const promises = (st.customLax && Array.isArray(st.customLax.promises)) ? st.customLax.promises : [];
    const activePromises = promises.filter(function (p) { return p && p.status === 'active'; });
    const defaultedPromises = promises.filter(function (p) { return p && p.status === 'defaulted'; });
    const fulfilledPromises = promises.filter(function (p) { return p && p.status === 'fulfilled'; });

    let beatView = null;
    if (WA.beatLedger && typeof WA.beatLedger.view === 'function') {
      try { beatView = WA.beatLedger.view(); } catch (e) { beatView = null; }
    }
    let campaignCur = null;
    if (WA.campaign && typeof WA.campaign.current === 'function') {
      try { campaignCur = WA.campaign.current(); } catch (e) { campaignCur = null; }
    }
    let ckptList = [];
    if (WA.checkpoints && typeof WA.checkpoints.list === 'function') {
      try {
        const lRes = WA.checkpoints.list();
        ckptList = (lRes && (lRes.slots || lRes.list)) || [];
      } catch (e) { ckptList = []; }
    }

    return {
      ok: true,
      currentChapter: cur,
      chapterHistoryCount: hist.length,
      recentHistory: hist.slice(-3),
      pendingObligations: {
        active: activePromises.length,
        defaulted: defaultedPromises.length,
        fulfilled: fulfilledPromises.length,
        activeList: activePromises.map(function (p) {
          return { id: p.id, promiser: p.promiser, beneficiary: p.beneficiary, subject: p.subject, dueDay: p.dueDay, deferCount: p.deferCount || 0 };
        })
      },
      beatStatus: beatView ? { total: (beatView.rows || []).length, landed: (beatView.rows || []).filter(function (r) { return r && r.status === 'landed'; }).length } : null,
      campaignStatus: campaignCur,
      checkpointsCount: ckptList.length,
      at: clockNow('actionDesk')
    };
  }

  /** 未结承诺带入或延期到后续章节 */
  function chapterRollover(opts) {
    const o = opts || {};
    const pid = clean(o.promiseId, 60);
    const newDueDay = num(o.newDueDay);
    const reason = clean(o.reason || '章节推进延期履约', 100);
    if (!pid) return { ok: false, reason: 'missing-fields', field: 'promiseId' };

    let updated = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.customLax = d.customLax || {};
        d.customLax.promises = d.customLax.promises || [];
        const p = d.customLax.promises.filter(function (x) { return x && x.id === pid; })[0];
        if (!p) return false;
        if (p.status !== 'active') return false;
        p.dueDay = (newDueDay != null && newDueDay >= 0) ? newDueDay : p.dueDay;
        p.deferCount = (p.deferCount || 0) + 1;
        p.deferReason = reason;
        p.rolledOverAt = clockNow('actionDesk');
        updated = Object.assign({}, p);
        return true;
      }, 'actionDesk:chapterRollover');
    }
    if (!updated) return { ok: false, reason: 'promise-not-found-or-inactive' };
    return { ok: true, promise: updated, note: '未结义务成功带入延期' };
  }

  /** 收章：结算当前章节，检查未结义务，保留失败与违约历史 */
  function chapterClose(opts) {
    const o = opts || {};
    if (!WA.chapters || typeof WA.chapters.end !== 'function') {
      return { ok: false, reason: 'chapters-engine-unavailable' };
    }
    const cur = (typeof WA.chapters.current === 'function') ? WA.chapters.current() : null;
    if (!cur) return { ok: false, reason: 'no-active-chapter' };

    const st = state();
    const promises = (st.customLax && Array.isArray(st.customLax.promises)) ? st.customLax.promises : [];
    const active = promises.filter(function (p) { return p && p.status === 'active'; });
    const defaulted = promises.filter(function (p) { return p && p.status === 'defaulted'; });

    const endNote = clean(o.note || o.endNote, 150);
    WA.chapters.end(endNote);

let ckpt = null;
    if (o.checkpoint && WA.checkpoints && typeof WA.checkpoints.save === 'function') {
      try {
        ensureCkptSettings();
        ckpt = WA.checkpoints.save(clean(o.checkpointName || ('close_ch' + cur.no), 40), {
          note: '收章快照：' + cur.title + '（未结承诺 ' + active.length + '，违约 ' + defaulted.length + '）'
        });
      } catch (e) { ckpt = { ok: false, err: String(e) }; }
    }
    return {
      ok: true,
      closedChapter: cur,
      endNote: endNote,
      pendingActiveRetained: active.length,
      defaultedHistoryRetained: defaulted.length,
      checkpoint: ckpt,
      at: clockNow('actionDesk')
    };
  }

  /** 保存分支快照 */
  function chapterSaveBranch(opts) {
    const o = opts || {};
    if (!WA.checkpoints || typeof WA.checkpoints.save !== 'function') {
      return { ok: false, reason: 'checkpoints-unavailable' };
    }
    ensureCkptSettings();
    const name = clean(o.name || ('branch_' + Date.now()), 40);
    return WA.checkpoints.save(name, o);
  }

  /** 恢复所选快照（只切换状态，不破坏快照库） */
  function chapterRestore(opts) {
    const o = opts || {};
    const id = clean(o.id || o.name, 40);
    if (!id) return { ok: false, reason: 'missing-fields', field: 'id' };
    if (!WA.checkpoints || typeof WA.checkpoints.restore !== 'function') {
      return { ok: false, reason: 'checkpoints-unavailable' };
    }
    return WA.checkpoints.restore(id, o);
  }

  /** 分支差异比对（保留差异来源与语义行） */
  function chapterDiff(opts) {
    const o = opts || {};
    const baseId = clean(o.baseId || o.source, 40);
    const targetId = clean(o.targetId || o.target, 40);
    if (!baseId || !targetId) {
      return { ok: false, reason: 'missing-fields', fields: ['baseId', 'targetId'] };
    }
    if (!WA.branchDiff || typeof WA.branchDiff.semanticDiff !== 'function') {
      return { ok: false, reason: 'branchDiff-unavailable' };
    }
    try {
      const bSet = WA.branchDiff['getSettings'];
      const curB = bSet ? bSet() : null;
      if (!curB || !curB.enabled) {
        if (typeof WA.branchDiff['setSettings'] === 'function') {
          WA.branchDiff['setSettings']({ enabled: true });
        }
      }
    } catch (e) {}
    return WA.branchDiff.semanticDiff(baseId, targetId, o);
  }

  /** 长局完整性检查（纯读零写入） */
  function chapterInspect(opts) {
    const st = state();
    const cur = (WA.chapters && typeof WA.chapters.current === 'function') ? WA.chapters.current() : null;
    const hist = (st.chapters && Array.isArray(st.chapters.history)) ? st.chapters.history : [];
    const promises = (st.customLax && Array.isArray(st.customLax.promises)) ? st.customLax.promises : [];
    let ckptCount = 0;
    if (WA.checkpoints && typeof WA.checkpoints.list === 'function') {
      try {
        const lRes = WA.checkpoints.list();
        ckptCount = ((lRes && (lRes.slots || lRes.list)) || []).length;
      } catch (e) { ckptCount = 0; }
    }
    return {
      ok: true,
      hasActiveChapter: !!cur,
      currentChapterNo: cur ? cur.no : null,
      historyCount: hist.length,
      activePromises: promises.filter(function (p) { return p && p.status === 'active'; }).length,
      defaultedPromises: promises.filter(function (p) { return p && p.status === 'defaulted'; }).length,
      checkpointsCount: ckptCount,
      at: clockNow('actionDesk')
    };
  }

  /**
   * 行动桌（**纯读**）。按当前人物/地点把各 owner 的现状摆成三档。
   * @param {object} opts {person, place}
   */
  function board(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(o.person, 40);
    if (!who) return { ok: false, reason: 'missing-person' };
    if (!knownPerson(who)) { noteFault('unknown-person'); return { ok: false, reason: 'unknown-person', who: who }; }
    const place = clean(o.place, 40);
    const groups = [];
    let all = [];
    [['research', fromResearch], ['family', fromFamily], ['production', fromProduction],
     ['training', fromTraining], ['gear', fromGear]].forEach(function (pair) {
      const g = collect(pair[0], function (out) { out.rows = pair[1](cfg, who); });
      groups.push({ kind: g.kind, on: g.on, note: g.note, rows: g.rows.slice(0, cfg.maxPerGroup) });
      all = all.concat(g.rows);
    });
    const ready = all.filter(function (r) { return r.state === 'ready'; }).length;
    const prepare = all.filter(function (r) { return r.state === 'prepare'; }).length;
    const blocked = all.filter(function (r) { return r.state === 'blocked'; }).length;
    stat.boards++;
    stat.lastReason = 'board';
    return { ok: true, person: who, place: place, at: clockNow('actionDesk'),
      groups: groups, rows: all.slice(0, cfg.maxRows),
      counts: { ready: ready, prepare: prepare, blocked: blocked, total: all.length } };
  }

  /** 各源在场性（面板据此报缺席，不把「读不到」当「没事」）。 */
  function sources() {
    return KINDS.map(function (k) {
      if (k === 'travel') return { kind: k, ok: !!(WA.act && WA.world), note: (WA.act && WA.world) ? '' : 'module-missing' };
      const ns = SOURCE_NS[k];
      const m = WA[ns];
      let on = false, note = 'module-missing';
      if (m) { note = ''; try { const c = (typeof m.getSettings === 'function') ? m.getSettings() : null; on = !!(c && c.enabled); if (!on) note = 'owner-disabled'; } catch (e) { note = 'read-failed'; } }
      return { kind: k, ok: !!m, on: on, note: note };
    });
  }

  /**
   * 执行一次行动桌动作。**只是路由**：按 actionId 前缀转给既有 owner 写口。
   *   `actionId` 的形态是 `owner.verb:payload`（payload 按路由各自解释）。
   *   未知前缀 ⇒ `unknown-action`（边界 3：不猜一个 owner 去写）。
   */
  function plan(actionId, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const raw = String(actionId == null ? '' : actionId);
    const idx = raw.indexOf(':');
    const head = idx >= 0 ? raw.slice(0, idx) : raw;
    const key = clean(head, 40);
    const fn = ROUTES[key];
    if (!fn) { noteFault('unknown-action'); return { ok: false, reason: 'unknown-action', action: key, known: Object.keys(ROUTES) }; }
    const o = Object.assign({}, opts || {});
    // payload 里带的那一段（`research.supply:r_xxx`）优先于 opts 里的同项。
    if (idx >= 0) {
      const payload = raw.slice(idx + 1);
      if (key.indexOf('research.') === 0) o.projectId = o.projectId || payload;
      else if (key.indexOf('family.') === 0 && key.indexOf('family.transferCare') === 0) { /* unitId:ward 两段 */ }
      else if (key.indexOf('family.') === 0) o.unitId = o.unitId || payload;
      else if (key.indexOf('production.') === 0) o.orderId = o.orderId || payload;
      else if (key === 'training.practice') o.ability = o.ability || payload;
      else if (key === 'gear.use') o.itemId = o.itemId || payload;
    }
    // 研究的供料/推进需要一个「谁」：默认取项目负责人，不凭空造人。
    if (key.indexOf('research.') === 0 && !o.who && o.projectId && typeof WA.research.view === 'function') {
      const v = WA.research.view(o.projectId);
      if (v && v.ok) o.who = v.by;
    }

    // 地方规约前置检查 (EXV3-5)
    if (WA.customLax && typeof WA.customLax.checkRuleEnforcement === 'function' && (o.orgId || o.place)) {
      const ruleCheck = WA.customLax.checkRuleEnforcement(o.orgId || o.place, key, o.who, o.ruleDetails || o);
      if (!ruleCheck.ok) {
        return ruleCheck;
      }
    }

    // 群体社会记忆立场前置检查 (EXV3-7)
    if (WA.socialLegacy && typeof WA.socialLegacy.groupMemoryStance === 'function' && o.clientGroup && o.who) {
      const gStance = WA.socialLegacy.groupMemoryStance(o.clientGroup, o.who);
      if (gStance && gStance.summaryStance === 'suspicious' && !o.guarantor) {
        return {
          ok: false,
          reason: 'group-distrust-blocked',
          clientGroup: o.clientGroup,
          who: o.who,
          adverseCount: gStance.adverseCount,
          costModifier: gStance.costModifier,
          note: '发包群体因历史争议怀疑当事人，需提供担保方可执行'
        };
      }
    }

    let out = null;
    try { out = fn(o); } catch (e) { noteFault('route-threw'); return { ok: false, reason: 'route-threw', action: key }; }
    if (out && out.ok) {
      stat.planned++;
      stat.byKind[key] = (stat.byKind[key] || 0) + 1;
      stat.lastReason = key;
      if (!out.nextActions) {
        if (key === 'production.open') out.nextActions = ['production.staff', 'production.advance'];
        else if (key === 'production.resupply') out.nextActions = ['production.resume', 'production.advance'];
        else if (key === 'production.resume') out.nextActions = ['production.advance'];
        else if (key === 'production.extend') out.nextActions = ['production.advance'];
        else if (key === 'production.deliverPartial') out.nextActions = (out.remainingQty > 0) ? ['production.advance', 'production.deliver'] : ['production.open'];
        else if (key === 'actionDesk.applyOpportunity') out.nextActions = ['actionDesk.awardOpportunity'];
        else if (key === 'actionDesk.awardOpportunity') out.nextActions = ['production.advance'];
        else if (key === 'sharedAwareness.amendPact') out.nextActions = ['sharedAwareness.confirmPact'];
        else if (key === 'production.advance') {
          out.nextActions = (out.job && out.job.status === 'delivered') ? ['production.open'] : ['production.advance', 'production.deliver'];
        } else if (key === 'production.deliver') out.nextActions = ['production.open', 'schedule.claim'];
        else if (key === 'research.supply') out.nextActions = ['research.advance'];
        else if (key === 'research.advance') out.nextActions = (out.status === 'confirmed') ? ['production.open'] : ['research.advance', 'research.supply'];
      }
    }
    else { stat.refused++; if (out && out.reason) stat.faults[out.reason] = (stat.faults[out.reason] || 0) + 1; }
    return out || { ok: false, reason: 'owner-unavailable', action: key };
  }

  function diagnose() {
    return { ok: true, enabled: settings().enabled, sources: sources(), routes: Object.keys(ROUTES),
      stat: Object.assign({}, stat, { faults: Object.assign({}, stat.faults), byKind: Object.assign({}, stat.byKind) }) };
  }

  WA.actionDesk = {
    STATES: STATES.slice(), KINDS: KINDS.slice(), ROUTES: Object.keys(ROUTES).slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    board: board,
    plan: plan,
    sources: sources,
    diagnose: diagnose,
    // v2.233.0 (OPV4-2)：跨轮行动生命周期投影 + 恢复路由
    lifecycle: lifecycle,
    recoverAction: recoverAction,
    // v2.233.0 (OPV4-1)：场景优先流程收束（纯读情境聚合 + 带场景上下文的行动派发）
    sceneFlow: sceneFlow,
    actFromScene: actFromScene,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults), byKind: Object.assign({}, stat.byKind) }); }
  };
  var EXPORT_COUNT = 14;
  var _exported = Object.keys(WA.actionDesk).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('actionDesk: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/action-desk.js', { kind: 'engine', ver: '2.231.0' });
})();