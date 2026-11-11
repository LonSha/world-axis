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
    'finance.triggerRunOnBank': function (o) {
      if (WA.financialContagion && typeof WA.financialContagion.triggerRunOnBank === 'function') {
        return WA.financialContagion.triggerRunOnBank(o);
      }
      return { ok: false, refusal: 'financial-contagion-unavailable' };
    },
    'finance.injectBailout': function (o) {
      if (WA.financialContagion && typeof WA.financialContagion.injectLiquidityBailout === 'function') {
        return WA.financialContagion.injectLiquidityBailout(o);
      }
      return { ok: false, refusal: 'financial-contagion-unavailable' };
    },
    'research.open': function (o) { return WA.research.open(o.spec || o); },
    'research.supply': function (o) { return WA.research.supply(o.projectId, o.who, o.material, o.amount); },
    'research.advance': function (o) { return WA.research.advance(o.projectId, { evidence: o.evidence }); },
    'research.disseminate': function (o) { return WA.research.disseminate(o.projectId, o.scope, o.to); },
    'research.abandon': function (o) { return WA.research.abandon(o.projectId); },
    'family.contribute': function (o) { return WA.family.contribute(o.unitId, o.who, o.material, o.amount); },
    'family.spend': function (o) { return WA.family.spend(o.unitId, o.to, o.material, o.amount); },
    'family.assignCare': function (o) { return WA.family.assignCare(o.unitId, o.who, o.ward, o.notes); },
    'family.transferCare': function (o) { return WA.family.transferCare(o.unitId, o.ward, o.who, o.reason); },
    'family.inherit': function (o) { return WA.family.inherit(o.unitId, o.deceased, o.heirs, o.event); },
    'production.open': function (o) { return WA.production.open({ recipe: o.recipe, by: o.by || o.who, qty: o.qty, days: o.days, facility: o.facility, place: o.place }, { label: o.label }); },
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
    'motive.preview': function (o) { return WA.motiveArbitration.preview(o.person, o.candidates, o.facts); },
    'motive.arbitrate': function (o) { return WA.motiveArbitration.decide(o.person, o.candidates, o.facts); },
    // v2.302.0 (V13 Batch A): 具身空间声学与判定骰
    'room.whisper': function (o) { return WA.spatialAcoustics.whisper(o); },
    'room.eavesdrop': function (o) { return WA.spatialAcoustics.eavesdrop(o); },
    'room.burstIn': function (o) { return WA.spatialAcoustics.burstIn(o); },
    'room.partition': function (o) { return WA.spatialAcoustics.registerPartition(o.roomId, o.adjacentRoomId, o); },
    'room.getConversation': function (o) { return WA.spatialAcoustics.getConversation(o.roomId || o.id); },
    'narrative.roll': function (o) { return WA.narrativeDice.roll(o.groupId || o.group, o); },
    'successGrade.evaluateSpectrum': function (o) { return WA.successGrade.evaluateSpectrum(o.roll, o.target, o); },
    'actor.advanceShadow': function (o) { return WA.observe.advanceOffscreenShadow(o.actor || o.who || o.name, o.progress || o); },
    'pathEcho.realize': function (o) { return WA.pathEcho.realizeOutcome(o.personId, o.decisionId, o.actualOutcome, o.knownFacts); },
    'lineage.teach': function (o) { return WA.techLineage.teach(o.traditionId, o.master, o.apprentice); },
    'lineage.confirmVariant': function (o) { return WA.techLineage.confirmVariant(o.traditionId, o.variantId, o.envContext); },
    'techLineage.declareStandard': function (o) { return WA.techLineage.declareStandard(o.specId, o.def); },
    'techLineage.checkCompatibility': function (o) { return WA.techLineage.checkCompatibility(o.facilitySpecId, o.targetSpecId, o); },
    'techLineage.planRetrofit': function (o) { return WA.techLineage.planRetrofit(o.facilityId, o.targetSpecId, o); },
    'techLineage.advanceRetrofit': function (o) { return WA.techLineage.advanceRetrofit(o.facilityId, o.days); },
    // v2.325.0: V14 深度行为桥接（代价回写、驿信投递、伏笔破土、债务穿透、假情报博弈、险道断裂、困局博弈、派系分裂、制度变革、避难所争夺、事实移植、平行回响、气候阻断、谣言认知）
    'actionCost.feedback': function (o) { return (WA.actionCostFeedback && typeof WA.actionCostFeedback.applyEvaluationCosts === 'function') ? WA.actionCostFeedback.applyEvaluationCosts(o.actorId || o.who, o.actionKind || o.kind, o.opts || o) : { ok: false, reason: 'actionCostFeedback-unavailable' }; },
    'courier.sendDispatch': function (o) { return (WA.courierDispatch && typeof WA.courierDispatch.sendDispatch === 'function') ? WA.courierDispatch.sendDispatch(o.dispatchId || o.id, o.fromCity, o.toCity, o.distanceKm, o.payload || o.letter, o.recipient, o.opts || o) : { ok: false, reason: 'courierDispatch-unavailable' }; },
    'courier.dispatchPending': function (o) { return (WA.courierDispatch && typeof WA.courierDispatch.dispatchPending === 'function') ? WA.courierDispatch.dispatchPending(o.hoursElapsed || o.hours || o.at) : { ok: false, reason: 'courierDispatch-unavailable' }; },
    'foreshadow.germinate': function (o) { return (WA.foreshadowGermination && typeof WA.foreshadowGermination.germinate === 'function') ? WA.foreshadowGermination.germinate(o.seedId || o.id, o.currentHour || o.hour || o.at, o.opts || o) : { ok: false, reason: 'foreshadowGermination-unavailable' }; },
    'collateral.rupture': function (o) { return (WA.collateralRupture && typeof WA.collateralRupture.ruptureCollateral === 'function') ? WA.collateralRupture.ruptureCollateral(o.debtId || o.id, o.primaryDebtor || o.debtor, o.guarantor, o.amount, o.opts || o) : { ok: false, reason: 'collateralRupture-unavailable' }; },
    'poison.plant': function (o) { return (WA.cognitivePoisoning && typeof WA.cognitivePoisoning.plantForgedIntel === 'function') ? WA.cognitivePoisoning.plantForgedIntel(o.forgerId || o.who, o.targetActorId || o.target, o.intelKey || o.key, o.forgedContent || o.content, o.opts || o) : { ok: false, reason: 'cognitivePoisoning-unavailable' }; },
    'supply.choke': function (o) { return (WA.supplyChoke && typeof WA.supplyChoke.triggerChoke === 'function') ? WA.supplyChoke.triggerChoke(o.routeId || o.id, o.destinationCity || o.city, o.resourceKind || o.resource, o.opts || o) : { ok: false, reason: 'supplyChoke-unavailable' }; },
    'dilemma.negotiate': function (o) { return (WA.dilemmaBargain && typeof WA.dilemmaBargain.negotiate === 'function') ? WA.dilemmaBargain.negotiate(o.partyA, o.partyB, o.stakes || o.stake, o.opts || o) : { ok: false, reason: 'dilemmaBargain-unavailable' }; },
    'faction.schism': function (o) { return (WA.factionSchism && typeof WA.factionSchism.triggerSchism === 'function') ? WA.factionSchism.triggerSchism(o.factionId || o.id, o.ideologySplit || o.split, o.opts || o) : { ok: false, reason: 'factionSchism-unavailable' }; },
    'institution.reform': function (o) { return (WA.institutionalSchism && typeof WA.institutionalSchism.enactReform === 'function') ? WA.institutionalSchism.enactReform(o.institutionId || o.id, o.reformLaw || o.law, o.opts || o) : { ok: false, reason: 'institutionalSchism-unavailable' }; },
    'sanctuary.scramble': function (o) { return (WA.sanctuaryScramble && typeof WA.sanctuaryScramble.scramble === 'function') ? WA.sanctuaryScramble.scramble(o.sanctuaryId || o.id, o.candidates || o.people, o.opts || o) : { ok: false, reason: 'sanctuaryScramble-unavailable' }; },
    'branch.transplant': function (o) { return (WA.branchTransplant && typeof WA.branchTransplant.transplantFact === 'function') ? WA.branchTransplant.transplantFact(o.sourceBranchId || o.source, o.targetBranchId || o.target, o.factKey || o.key, o.factValue || o.value, o.opts || o) : { ok: false, reason: 'branchTransplant-unavailable' }; },
    'counterfactual.echo': function (o) { return (WA.counterfactualEcho && typeof WA.counterfactualEcho.evokeEcho === 'function') ? WA.counterfactualEcho.evokeEcho(o.actorId || o.who, o.divergentChoice || o.choice, o.alternateTimelineId || o.branch, o.pathSummary || o.summary, o.opts || o) : { ok: false, reason: 'counterfactualEcho-unavailable' }; },
    'environment.disrupt': function (o) { return (WA.environmentInterference && typeof WA.environmentInterference.disruptRoutines === 'function') ? WA.environmentInterference.disruptRoutines(o.weatherCondition || o.weather, o.severity, o.affectedRegions || o.regions, o.opts || o) : { ok: false, reason: 'environmentInterference-unavailable' }; },
'rumor.cognition': function (o) { return (WA.rumorCognition && typeof WA.rumorCognition.projectRumorToActor === 'function') ? WA.rumorCognition.projectRumorToActor(o.rumorId || o.id, o.targetActorId || o.target, o.opts || o) : { ok: false, reason: 'rumorCognition-unavailable' }; },
    // 深度机制调度扩展（民俗禁忌、古代遗物逆向、反事实沙盒、跨阵营文献对照、密道背刺、自传顿悟、思潮刊物与前置研究闭环）
    'cityFolklore.proclaimTaboo': function (o) { return (WA.cityFolklore && typeof WA.cityFolklore.proclaimTaboo === 'function') ? WA.cityFolklore.proclaimTaboo(o) : { ok: false, reason: 'cityFolklore-unavailable' }; },
    'cityFolklore.checkViolation': function (o) { return (WA.cityFolklore && typeof WA.cityFolklore.checkTabooViolation === 'function') ? WA.cityFolklore.checkTabooViolation(o.locationId, o.actionType, o.opts || o) : { ok: false, reason: 'cityFolklore-unavailable' }; },
    'cityFolklore.maskWithFestivity': function (o) { return (WA.cityFolklore && typeof WA.cityFolklore.maskWithFestivity === 'function') ? WA.cityFolklore.maskWithFestivity(o.noiseLevel, o.festivityLoudness, o.opts || o) : { ok: false, reason: 'cityFolklore-unavailable' }; },
    'civilizationRelic.discover': function (o) { return (WA.civilizationRelic && typeof WA.civilizationRelic.discoverRelic === 'function') ? WA.civilizationRelic.discoverRelic(o) : { ok: false, reason: 'civilizationRelic-unavailable' }; },
    'civilizationRelic.reverseEngineer': function (o) { return (WA.civilizationRelic && typeof WA.civilizationRelic.reverseEngineer === 'function') ? WA.civilizationRelic.reverseEngineer(o) : { ok: false, reason: 'civilizationRelic-unavailable' }; },
    'counterfactualSandbox.fork': function (o) { return (WA.counterfactualSandbox && typeof WA.counterfactualSandbox.forkRehearsal === 'function') ? WA.counterfactualSandbox.forkRehearsal(o) : { ok: false, reason: 'counterfactualSandbox-unavailable' }; },
    'counterfactualSandbox.simulate': function (o) { return (WA.counterfactualSandbox && typeof WA.counterfactualSandbox.simulateBranch === 'function') ? WA.counterfactualSandbox.simulateBranch(o.branchId, o.turnsToSimulate, o.opts || o) : { ok: false, reason: 'counterfactualSandbox-unavailable' }; },
    'counterfactualSandbox.diff': function (o) { return (WA.counterfactualSandbox && typeof WA.counterfactualSandbox.diffOutcomes === 'function') ? WA.counterfactualSandbox.diffOutcomes(o.branchId) : { ok: false, reason: 'counterfactualSandbox-unavailable' }; },
    'factionChronicle.archive': function (o) { return (WA.factionChronicle && typeof WA.factionChronicle.archiveFactionRecord === 'function') ? WA.factionChronicle.archiveFactionRecord(o) : { ok: false, reason: 'factionChronicle-unavailable' }; },
    'factionChronicle.compare': function (o) { return (WA.factionChronicle && typeof WA.factionChronicle.comparePerspectives === 'function') ? WA.factionChronicle.comparePerspectives(o.eventId) : { ok: false, reason: 'factionChronicle-unavailable' }; },
    'factionChronicle.findExemption': function (o) { return (WA.factionChronicle && typeof WA.factionChronicle.findExemptionClause === 'function') ? WA.factionChronicle.findExemptionClause(o.eventId, o.keyword) : { ok: false, reason: 'factionChronicle-unavailable' }; },
    'whisper.send': function (o) { return (WA.whisperBackchannel && typeof WA.whisperBackchannel.sendWhisper === 'function') ? WA.whisperBackchannel.sendWhisper(o.senderId, o.recipientId, o.opts || o) : { ok: false, reason: 'whisperBackchannel-unavailable' }; },
    'autobiography.triggerEpiphany': function (o) { return (WA.autobiographyEpiphany && typeof WA.autobiographyEpiphany.triggerEpiphany === 'function') ? WA.autobiographyEpiphany.triggerEpiphany(o.actorId, o.eventId, o.newInterpretation, o.rationale, o.opts || o) : { ok: false, reason: 'autobiographyEpiphany-unavailable' }; },
    'autobiography.view': function (o) { return (WA.autobiographyEpiphany && typeof WA.autobiographyEpiphany.viewAutobiography === 'function') ? WA.autobiographyEpiphany.viewAutobiography(o.actorId) : { ok: false, reason: 'autobiographyEpiphany-unavailable' }; },
    'periodical.publish': function (o) { return (WA.periodicalIdeology && typeof WA.periodicalIdeology.publishIdeologyArticle === 'function') ? WA.periodicalIdeology.publishIdeologyArticle(o) : { ok: false, reason: 'periodicalIdeology-unavailable' }; },
    'periodical.assessSocialTide': function (o) { return (WA.periodicalIdeology && typeof WA.periodicalIdeology.assessSocialTide === 'function') ? WA.periodicalIdeology.assessSocialTide(o.targetClass, o.ideologyTopic) : { ok: false, reason: 'periodicalIdeology-unavailable' }; },
    'periodical.triggerAction': function (o) { return (WA.periodicalIdeology && typeof WA.periodicalIdeology.triggerCollectiveAction === 'function') ? WA.periodicalIdeology.triggerCollectiveAction(o) : { ok: false, reason: 'periodicalIdeology-unavailable' }; },
    'researchClosure.verifyPrereq': function (o) { return (WA.researchClosure && typeof WA.researchClosure.verifyPrereq === 'function') ? WA.researchClosure.verifyPrereq(o.spec || o, o.opts || o) : { ok: false, reason: 'researchClosure-unavailable' }; },
    'researchClosure.evaluateReadiness': function (o) { return (WA.researchClosure && typeof WA.researchClosure.evaluateReadiness === 'function') ? WA.researchClosure.evaluateReadiness(o.spec || o, o.opts || o) : { ok: false, reason: 'researchClosure-unavailable' }; },
    'researchClosure.recordFailureClue': function (o) { return (WA.researchClosure && typeof WA.researchClosure.recordFailureClue === 'function') ? WA.researchClosure.recordFailureClue(o.spec || o, o.reason, o.opts || o) : { ok: false, reason: 'researchClosure-unavailable' }; },
    'identityMatch.match': function (o) { return (WA.identityMatch && typeof WA.identityMatch.match === 'function') ? WA.identityMatch.match(o.observed, o.candidates, o.opts || o) : { ok: false, reason: 'identityMatch-unavailable' }; },
    'identityMatch.calibrate': function (o) { return (WA.identityMatch && typeof WA.identityMatch.calibrate === 'function') ? WA.identityMatch.calibrate(o.observed, o.expected, o.opts || o) : { ok: false, reason: 'identityMatch-unavailable' }; },
    // 低消费业务引擎桥接：仅暴露有明确业务动作的写入口与纯读投影入口。
    'contraband.assessInflation': function (o) { return (WA.contraband && typeof WA.contraband.assessInflation === 'function') ? WA.contraband.assessInflation(o.routeId || o.id, o.opts || o) : { ok: false, reason: 'contraband-unavailable' }; },
    'contraband.openRoute': function (o) { return (WA.contraband && typeof WA.contraband.openRoute === 'function') ? WA.contraband.openRoute(o) : { ok: false, reason: 'contraband-unavailable' }; },
    'contraband.smuggle': function (o) { return (WA.contraband && typeof WA.contraband.smuggle === 'function') ? WA.contraband.smuggle(o) : { ok: false, reason: 'contraband-unavailable' }; },
    'contraband.inspectBust': function (o) { return (WA.contraband && typeof WA.contraband.inspectBust === 'function') ? WA.contraband.inspectBust(o.routeId || o.id, o.opts || o) : { ok: false, reason: 'contraband-unavailable' }; },
    'branchDiff.semanticDiff': function (o) { return (WA.branchDiff && typeof WA.branchDiff.semanticDiff === 'function') ? WA.branchDiff.semanticDiff(o.leftBranchId || o.left, o.rightBranchId || o.right, o.opts || o) : { ok: false, reason: 'branchDiff-unavailable' }; },
    'branchDiff.triDiff': function (o) { return (WA.branchDiff && typeof WA.branchDiff.triDiff === 'function') ? WA.branchDiff.triDiff(o.baseBranchId || o.base, o.leftBranchId || o.left, o.rightBranchId || o.right, o.opts || o) : { ok: false, reason: 'branchDiff-unavailable' }; },
    'branchDiff.transplant': function (o) { return (WA.branchDiff && typeof WA.branchDiff.transplant === 'function') ? WA.branchDiff.transplant(o) : { ok: false, reason: 'branchDiff-unavailable' }; },
    'eccentricThreads.open': function (o) { return (WA.eccentricThreads && typeof WA.eccentricThreads.openThread === 'function') ? WA.eccentricThreads.openThread(o) : { ok: false, reason: 'eccentricThreads-unavailable' }; },
    'eccentricThreads.advance': function (o) { return (WA.eccentricThreads && typeof WA.eccentricThreads.advanceThread === 'function') ? WA.eccentricThreads.advanceThread(o.threadId || o.id, o) : { ok: false, reason: 'eccentricThreads-unavailable' }; },
    'eccentricThreads.resolve': function (o) { return (WA.eccentricThreads && typeof WA.eccentricThreads.resolveThread === 'function') ? WA.eccentricThreads.resolveThread(o.threadId || o.id, o) : { ok: false, reason: 'eccentricThreads-unavailable' }; },
    'knowledgePractice.register': function (o) { return (WA.knowledgePractice && typeof WA.knowledgePractice.registerKnowledgeSpec === 'function') ? WA.knowledgePractice.registerKnowledgeSpec(o) : { ok: false, reason: 'knowledgePractice-unavailable' }; },
    'knowledgePractice.grantLicense': function (o) { return (WA.knowledgePractice && typeof WA.knowledgePractice.grantPracticeLicense === 'function') ? WA.knowledgePractice.grantPracticeLicense(o) : { ok: false, reason: 'knowledgePractice-unavailable' }; },
    'knowledgePractice.execute': function (o) { return (WA.knowledgePractice && typeof WA.knowledgePractice.executePractice === 'function') ? WA.knowledgePractice.executePractice(o) : { ok: false, reason: 'knowledgePractice-unavailable' }; },
    'knowledgePractice.refine': function (o) { return (WA.knowledgePractice && typeof WA.knowledgePractice.refineKnowledgeFromEvidence === 'function') ? WA.knowledgePractice.refineKnowledgeFromEvidence(o) : { ok: false, reason: 'knowledgePractice-unavailable' }; },
    'phaseTransition.evaluate': function (o) { return (WA.phaseTransition && typeof WA.phaseTransition.evaluatePhase === 'function') ? WA.phaseTransition.evaluatePhase(o) : { ok: false, reason: 'phaseTransition-unavailable' }; },
    'phaseTransition.transition': function (o) { return (WA.phaseTransition && typeof WA.phaseTransition.transition === 'function') ? WA.phaseTransition.transition(o) : { ok: false, reason: 'phaseTransition-unavailable' }; },
    'phaseTransition.planRoute': function (o) { return (WA.phaseTransition && typeof WA.phaseTransition.planTransitionRoute === 'function') ? WA.phaseTransition.planTransitionRoute(o) : { ok: false, reason: 'phaseTransition-unavailable' }; },
    'riskPooling.declare': function (o) { return (WA.riskPooling && typeof WA.riskPooling.declareRiskPool === 'function') ? WA.riskPooling.declareRiskPool(o) : { ok: false, reason: 'riskPooling-unavailable' }; },
    'riskPooling.pledge': function (o) { return (WA.riskPooling && typeof WA.riskPooling.pledgeMutualFund === 'function') ? WA.riskPooling.pledgeMutualFund(o) : { ok: false, reason: 'riskPooling-unavailable' }; },
    'riskPooling.claim': function (o) { return (WA.riskPooling && typeof WA.riskPooling.claimMutualRelief === 'function') ? WA.riskPooling.claimMutualRelief(o) : { ok: false, reason: 'riskPooling-unavailable' }; },
    'terrainHazard.assess': function (o) { return (WA.terrainHazard && typeof WA.terrainHazard.assessPassability === 'function') ? WA.terrainHazard.assessPassability(o) : { ok: false, reason: 'terrainHazard-unavailable' }; },
    'terrainHazard.block': function (o) { return (WA.terrainHazard && typeof WA.terrainHazard.blockChannel === 'function') ? WA.terrainHazard.blockChannel(o) : { ok: false, reason: 'terrainHazard-unavailable' }; },
    'terrainHazard.forceTraverse': function (o) { return (WA.terrainHazard && typeof WA.terrainHazard.forceTraverse === 'function') ? WA.terrainHazard.forceTraverse(o) : { ok: false, reason: 'terrainHazard-unavailable' }; },
    'writeDesk.call': function (o) { return (WA.writeDesk && typeof WA.writeDesk.call === 'function') ? WA.writeDesk.call(o.namespace || o.ns, o.method, o.args || o.argv || []) : { ok: false, reason: 'writeDesk-unavailable' }; },
    'moodGlide.set': function (o) { return (WA.moodGlide && typeof WA.moodGlide.set === 'function') ? WA.moodGlide.set(o.actorId || o.who, o.axis, o.value, o.opts || o) : { ok: false, reason: 'moodGlide-unavailable' }; },
    'moodGlide.glide': function (o) { return (WA.moodGlide && typeof WA.moodGlide.glide === 'function') ? WA.moodGlide.glide(o.actorId || o.who, o.axis, o.delta, o.opts || o) : { ok: false, reason: 'moodGlide-unavailable' }; },
    'moodGlide.miss': function (o) { return (WA.moodGlide && typeof WA.moodGlide.miss === 'function') ? WA.moodGlide.miss(o.actorId || o.who, o.axis, o.opts || o) : { ok: false, reason: 'moodGlide-unavailable' }; },
    'moodGlide.read': function (o) { return (WA.moodGlide && typeof WA.moodGlide.read === 'function') ? WA.moodGlide.read(o.actorId || o.who, o.opts || o) : { ok: false, reason: 'moodGlide-unavailable' }; },
    'offstageLife.mark': function (o) { return (WA.offstageLife && typeof WA.offstageLife.markOffstage === 'function') ? WA.offstageLife.markOffstage(o) : { ok: false, reason: 'offstageLife-unavailable' }; },
    'offstageLife.progress': function (o) { return (WA.offstageLife && typeof WA.offstageLife.progressOffstage === 'function') ? WA.offstageLife.progressOffstage(o) : { ok: false, reason: 'offstageLife-unavailable' }; },
    'offstageLife.reunion': function (o) { return (WA.offstageLife && typeof WA.offstageLife.reunionSnap === 'function') ? WA.offstageLife.reunionSnap(o) : { ok: false, reason: 'offstageLife-unavailable' }; },
    'offstageLife.card': function (o) { return (WA.offstageLife && typeof WA.offstageLife.getOffstageCard === 'function') ? WA.offstageLife.getOffstageCard(o.actorId || o.who) : { ok: false, reason: 'offstageLife-unavailable' }; },
    'stagePresence.sense': function (o) { return (WA.stagePresence && typeof WA.stagePresence.sensePresence === 'function') ? WA.stagePresence.sensePresence(o) : { ok: false, reason: 'stagePresence-unavailable' }; },
    'stagePresence.tick': function (o) { return (WA.stagePresence && typeof WA.stagePresence.tickOffstageAutonomy === 'function') ? WA.stagePresence.tickOffstageAutonomy(o) : { ok: false, reason: 'stagePresence-unavailable' }; },
    'stagePresence.reunion': function (o) { return (WA.stagePresence && typeof WA.stagePresence.awakenReunion === 'function') ? WA.stagePresence.awakenReunion(o.actorId || o.who) : { ok: false, reason: 'stagePresence-unavailable' }; },
    // ── V21 史诗扩展引擎全局调度路由 (EXV21-1 ~ EXV21-8) ──
    'theology.conductTheologyOp': function (o) {
      if (WA.theologyCult && typeof WA.theologyCult.conductTheologyOp === 'function') {
        return WA.theologyCult.conductTheologyOp(o && (o.sectId || o.id), o && o.opKind, o);
      }
      return { ok: false, refusal: 'theologyCult-unavailable' };
    },
    'regiment.clashRegiments': function (o) {
      if (WA.regimentTactics && typeof WA.regimentTactics.clashRegiments === 'function') {
        return WA.regimentTactics.clashRegiments(o && (o.regimentAId || o.attackerId), o && (o.regimentBId || o.defenderId), o);
      }
      return { ok: false, refusal: 'regimentTactics-unavailable' };
    },
    'prison.executeJailOp': function (o) {
      if (WA.incarcerationJailbreak && typeof WA.incarcerationJailbreak.executeJailOp === 'function') {
        return WA.incarcerationJailbreak.executeJailOp(o && o.opKind, o, o);
      }
      return { ok: false, refusal: 'incarcerationJailbreak-unavailable' };
    },
    'bloodline.transactLineage': function (o) {
      if (WA.bloodlineHeritage && typeof WA.bloodlineHeritage.transactLineage === 'function') {
        return WA.bloodlineHeritage.transactLineage(o && o.opKind, o, o);
      }
      return { ok: false, refusal: 'bloodlineHeritage-unavailable' };
    },
    'engineering.engineerDevice': function (o) {
      if (WA.engineeringBlueprint && typeof WA.engineeringBlueprint.engineerDevice === 'function') {
        return WA.engineeringBlueprint.engineerDevice(o && o.opKind, o, o);
      }
      return { ok: false, refusal: 'engineeringBlueprint-unavailable' };
    },
    'dungeon.navigateOrTrigger': function (o) {
      if (WA.dungeonHazardMesh && typeof WA.dungeonHazardMesh.navigateOrTrigger === 'function') {
        return WA.dungeonHazardMesh.navigateOrTrigger(o && (o.dungeonId || o.id), o && o.opKind, o);
      }
      return { ok: false, refusal: 'dungeonHazardMesh-unavailable' };
    },
    'eco.simulateBioShock': function (o) {
      if (WA.ecosystemCascade && typeof WA.ecosystemCascade.simulateBioShock === 'function') {
        return WA.ecosystemCascade.simulateBioShock(o && (o.regionId || o.biomeId || o.id), o);
      }
      return { ok: false, refusal: 'ecosystemCascade-unavailable' };
    },
    'court.executeIntrigue': function (o) {
      if (WA.courtIntrigue && typeof WA.courtIntrigue.executeIntrigue === 'function') {
        return WA.courtIntrigue.executeIntrigue(o && (o.courtId || o.id), o && o.opKind, o);
      }
      return { ok: false, refusal: 'courtIntrigue-unavailable' };
    },
    // ── V20 极端自然灾变调度 (EXV20-2) ──
    'nature.triggerCataclysm': function (o) { return (WA.cataclysmHazard && typeof WA.cataclysmHazard.triggerCataclysm === 'function') ? WA.cataclysmHazard.triggerCataclysm(o && (o.locationId || o.place), o) : { ok: false, reason: 'cataclysmHazard-unavailable' }; },
    // ── V20 宏观历史突变与纪元跃迁调度 (EXV20-1) ──
    'history.evaluateEpochShift': function (o) { return (WA.epochalTransition && typeof WA.epochalTransition.evaluateEpochShift === 'function') ? WA.epochalTransition.evaluateEpochShift(o && (o.factors || o), o) : { ok: false, reason: 'epochalTransition-unavailable' }; },
    // ── V20 全双工生态因果调度 (OPV20-4 & OPV20-5) ──
    'spy.ingestCommTraffic': function (o) { return (WA.covertEspionage && typeof WA.covertEspionage.ingestCommTraffic === 'function') ? WA.covertEspionage.ingestCommTraffic(o) : { ok: false, reason: 'covertEspionage-unavailable' }; },
    'current.triggerByMessage': function (o) { return (WA.undercurrentCalendar && typeof WA.undercurrentCalendar.triggerByMessage === 'function') ? WA.undercurrentCalendar.triggerByMessage(o && o.currentId, o) : { ok: false, reason: 'undercurrentCalendar-unavailable' }; },
    'human.applyMemoryResolve': function (o) { return (WA.humanRealism && typeof WA.humanRealism.applyMemoryResolve === 'function') ? WA.humanRealism.applyMemoryResolve(o && (o.actorId || o.who), o) : { ok: false, reason: 'humanRealism-unavailable' }; },
    // ── V19 史诗新机制调度 (EXV19-1 ~ EXV19-8 & OPV19) ──
    'spy.operateSpy': function (o) { return (WA.covertEspionage && typeof WA.covertEspionage.operateSpy === 'function') ? WA.covertEspionage.operateSpy(o) : { ok: false, reason: 'covertEspionage-unavailable' }; },
    'bio.propagateDisease': function (o) { return (WA.epidemicContagion && typeof WA.epidemicContagion.propagateDisease === 'function') ? WA.epidemicContagion.propagateDisease(o && o.locationId, o) : { ok: false, reason: 'epidemicContagion-unavailable' }; },
    'medical.performSurgery': function (o) { return (WA.surgicalTriage && typeof WA.surgicalTriage.performSurgery === 'function') ? WA.surgicalTriage.performSurgery(o) : { ok: false, reason: 'surgicalTriage-unavailable' }; },
    'econ.simulateTradeShock': function (o) { return (WA.economy && typeof WA.economy.simulateTradeShock === 'function') ? WA.economy.simulateTradeShock(o && o.place, o) : { ok: false, reason: 'economy-unavailable' }; },
    'naval.navigateVoyage': function (o) { return (WA.maritimeNavigation && typeof WA.maritimeNavigation.navigateVoyage === 'function') ? WA.maritimeNavigation.navigateVoyage(o) : { ok: false, reason: 'maritimeNavigation-unavailable' }; },
    'market.transactBlackMarket': function (o) { return (WA.blackmarketUsury && typeof WA.blackmarketUsury.transactBlackMarket === 'function') ? WA.blackmarketUsury.transactBlackMarket(o) : { ok: false, reason: 'blackmarketUsury-unavailable' }; },
    'stealth.executeInfiltration': function (o) { return (WA.stealthInfiltration && typeof WA.stealthInfiltration.executeInfiltration === 'function') ? WA.stealthInfiltration.executeInfiltration(o && o.infiltratorId, o) : { ok: false, reason: 'stealthInfiltration-unavailable' }; },
    'alchemy.brewOrTestToxin': function (o) { return (WA.alchemyToxicology && typeof WA.alchemyToxicology.brewOrTestToxin === 'function') ? WA.alchemyToxicology.brewOrTestToxin(o) : { ok: false, reason: 'alchemyToxicology-unavailable' }; },
    'covenant.enforceCovenant': function (o) { return (WA.covenantSanction && typeof WA.covenantSanction.enforceCovenant === 'function') ? WA.covenantSanction.enforceCovenant(o && o.covenantId, o) : { ok: false, reason: 'covenantSanction-unavailable' }; },
    'bio.applySleepDeprivation': function (o) { return (WA.humanRealism && typeof WA.humanRealism.applySleepDeprivation === 'function') ? WA.humanRealism.applySleepDeprivation(o && (o.actorId || o.who), o && o.hoursAwake) : { ok: false, reason: 'humanRealism-unavailable' }; },
    'interrogate.backlashGrudge': function (o) { return (WA.interrogationTell && typeof WA.interrogationTell.applyBacklashGrudge === 'function') ? WA.interrogationTell.applyBacklashGrudge(o && o.inquestId, o && o.interrogatorId, o && o.suspectId, o) : { ok: false, reason: 'interrogationTell-unavailable' }; },
    'wild.checkPerimeterDeterrent': function (o) { return (WA.ecosystemPredation && typeof WA.ecosystemPredation.checkPerimeterDeterrent === 'function') ? WA.ecosystemPredation.checkPerimeterDeterrent(o && o.beastId, o && o.settlementId, o) : { ok: false, reason: 'ecosystemPredation-unavailable' }; },
    'sharedAwareness.openPact': function (o) { return (WA.sharedAwareness && typeof WA.sharedAwareness.openPact === 'function') ? WA.sharedAwareness.openPact(o) : { ok: false, reason: 'sharedAwareness-unavailable' }; },
    'sharedAwareness.confirmPact': function (o) { return (WA.sharedAwareness && typeof WA.sharedAwareness.confirmPact === 'function') ? WA.sharedAwareness.confirmPact(o) : { ok: false, reason: 'sharedAwareness-unavailable' }; },
    'sharedAwareness.amendPact': function (o) { return (WA.sharedAwareness && typeof WA.sharedAwareness.amendPact === 'function') ? WA.sharedAwareness.amendPact(o) : { ok: false, reason: 'sharedAwareness-unavailable' }; },
    'sharedAwareness.viewPact': function (o) { return (WA.sharedAwareness && typeof WA.sharedAwareness.viewPact === 'function') ? WA.sharedAwareness.viewPact(o) : { ok: false, reason: 'sharedAwareness-unavailable' }; },
    'spatialAcoustics.whisper': function (o) { return (WA.spatialAcoustics && typeof WA.spatialAcoustics.whisper === 'function') ? WA.spatialAcoustics.whisper(o) : { ok: false, reason: 'spatialAcoustics-unavailable' }; },
    'spatialAcoustics.eavesdrop': function (o) { return (WA.spatialAcoustics && typeof WA.spatialAcoustics.eavesdrop === 'function') ? WA.spatialAcoustics.eavesdrop(o) : { ok: false, reason: 'spatialAcoustics-unavailable' }; },
    'spatialAcoustics.burstIn': function (o) { return (WA.spatialAcoustics && typeof WA.spatialAcoustics.burstIn === 'function') ? WA.spatialAcoustics.burstIn(o) : { ok: false, reason: 'spatialAcoustics-unavailable' }; },
    'spatialAcoustics.registerPartition': function (o) { return (WA.spatialAcoustics && typeof WA.spatialAcoustics.registerPartition === 'function') ? WA.spatialAcoustics.registerPartition(o) : { ok: false, reason: 'spatialAcoustics-unavailable' }; },
    'observeSlice.view': function (o) { return (WA.observeSlice && typeof WA.observeSlice.view === 'function') ? WA.observeSlice.view(o) : { ok: false, reason: 'observeSlice-unavailable' }; },
    'observeSlice.slice': function (o) { return (WA.observeSlice && typeof WA.observeSlice.slice === 'function') ? WA.observeSlice.slice(o) : { ok: false, reason: 'observeSlice-unavailable' }; },
    'observeSlice.actionProvesPerception': function (o) { return (WA.observeSlice && typeof WA.observeSlice.actionProvesPerception === 'function') ? WA.observeSlice.actionProvesPerception(o) : { ok: false, reason: 'observeSlice-unavailable' }; },
    'autoHide.plan': function (o) { return (WA.autoHide && typeof WA.autoHide.plan === 'function') ? WA.autoHide.plan(o) : { ok: false, reason: 'autoHide-unavailable' }; },
    'autoHide.mark': function (o) { return (WA.autoHide && typeof WA.autoHide.mark === 'function') ? WA.autoHide.mark(o) : { ok: false, reason: 'autoHide-unavailable' }; },
    'autoHide.revoke': function (o) { return (WA.autoHide && typeof WA.autoHide.revoke === 'function') ? WA.autoHide.revoke(o) : { ok: false, reason: 'autoHide-unavailable' }; },
    'backstageTone.view': function (o) { return (WA.backstageTone && typeof WA.backstageTone.view === 'function') ? WA.backstageTone.view(o) : { ok: false, reason: 'backstageTone-unavailable' }; },
    'backstageTone.era': function (o) { return (WA.backstageTone && typeof WA.backstageTone.era === 'function') ? WA.backstageTone.era(o) : { ok: false, reason: 'backstageTone-unavailable' }; },
    'backstageTone.voiceCheck': function (o) { return (WA.backstageTone && typeof WA.backstageTone.voiceCheck === 'function') ? WA.backstageTone.voiceCheck(o) : { ok: false, reason: 'backstageTone-unavailable' }; },
    'backstageTone.noteAdd': function (o) { return (WA.backstageTone && typeof WA.backstageTone.noteAdd === 'function') ? WA.backstageTone.noteAdd(o) : { ok: false, reason: 'backstageTone-unavailable' }; },
    // 大批量业务引擎接线：世界时钟、健康、地理、叙事推进、角色生活、观察与治理。
    'worldClock.view': function (o) { return (WA.worldClock && typeof WA.worldClock.view === 'function') ? WA.worldClock.view(o) : { ok: false, reason: 'worldClock-unavailable' }; },
    'worldClock.judge': function (o) { return (WA.worldClock && typeof WA.worldClock.judge === 'function') ? WA.worldClock.judge(o) : { ok: false, reason: 'worldClock-unavailable' }; },
    'worldClock.inspectEnd': function (o) { return (WA.worldClock && typeof WA.worldClock.inspectEnd === 'function') ? WA.worldClock.inspectEnd(o) : { ok: false, reason: 'worldClock-unavailable' }; },
    'worldClock.parseEnd': function (o) { return (WA.worldClock && typeof WA.worldClock.parseEnd === 'function') ? WA.worldClock.parseEnd(o) : { ok: false, reason: 'worldClock-unavailable' }; },
    'worldHealth.summary': function (o) { return (WA.worldHealth && typeof WA.worldHealth.summary === 'function') ? WA.worldHealth.summary(o) : { ok: false, reason: 'worldHealth-unavailable' }; },
    'worldHealth.drill': function (o) { return (WA.worldHealth && typeof WA.worldHealth.drill === 'function') ? WA.worldHealth.drill(o) : { ok: false, reason: 'worldHealth-unavailable' }; },
    'worldChanges.capture': function (o) { return (WA.worldChanges && typeof WA.worldChanges.capture === 'function') ? WA.worldChanges.capture(o) : { ok: false, reason: 'worldChanges-unavailable' }; },
    'worldChanges.settle': function (o) { return (WA.worldChanges && typeof WA.worldChanges.settle === 'function') ? WA.worldChanges.settle(o) : { ok: false, reason: 'worldChanges-unavailable' }; },
    'worldChanges.view': function (o) { return (WA.worldChanges && typeof WA.worldChanges.view === 'function') ? WA.worldChanges.view(o) : { ok: false, reason: 'worldChanges-unavailable' }; },
    'storylineAdvance.tick': function (o) { return (WA.storylineAdvance && typeof WA.storylineAdvance.tick === 'function') ? WA.storylineAdvance.tick(o) : { ok: false, reason: 'storylineAdvance-unavailable' }; },
    'storylineAdvance.buildBlock': function (o) { return (WA.storylineAdvance && typeof WA.storylineAdvance.buildBlock === 'function') ? WA.storylineAdvance.buildBlock(o) : { ok: false, reason: 'storylineAdvance-unavailable' }; },
    'geoTracker.registerPlace': function (o) { return (WA.geoTracker && typeof WA.geoTracker.registerPlace === 'function') ? WA.geoTracker.registerPlace(o) : { ok: false, reason: 'geoTracker-unavailable' }; },
    'geoTracker.resolveLocation': function (o) { return (WA.geoTracker && typeof WA.geoTracker.resolveLocation === 'function') ? WA.geoTracker.resolveLocation(o) : { ok: false, reason: 'geoTracker-unavailable' }; },
    'geoTracker.updateCharacterLocation': function (o) { return (WA.geoTracker && typeof WA.geoTracker.updateCharacterLocation === 'function') ? WA.geoTracker.updateCharacterLocation(o) : { ok: false, reason: 'geoTracker-unavailable' }; },
    'geoTracker.readLocationMarks': function (o) { return (WA.geoTracker && typeof WA.geoTracker.readLocationMarks === 'function') ? WA.geoTracker.readLocationMarks(o) : { ok: false, reason: 'geoTracker-unavailable' }; },
    'offstageLife.getCard': function (o) { return (WA.offstageLife && typeof WA.offstageLife.getOffstageCard === 'function') ? WA.offstageLife.getOffstageCard(o.actorId || o.who) : { ok: false, reason: 'offstageLife-unavailable' }; },
    'sharedAwareness.coordination': function (o) { return (WA.sharedAwareness && typeof WA.sharedAwareness.coordination === 'function') ? WA.sharedAwareness.coordination(o) : { ok: false, reason: 'sharedAwareness-unavailable' }; },
    'spatialAcoustics.getConversation': function (o) { return (WA.spatialAcoustics && typeof WA.spatialAcoustics.getConversation === 'function') ? WA.spatialAcoustics.getConversation(o.conversationId || o.id) : { ok: false, reason: 'spatialAcoustics-unavailable' }; },
    'observeSlice.extractAnchor': function (o) { return (WA.observeSlice && typeof WA.observeSlice.extractAnchor === 'function') ? WA.observeSlice.extractAnchor(o) : { ok: false, reason: 'observeSlice-unavailable' }; },
    'observeSlice.isMicroScene': function (o) { return (WA.observeSlice && typeof WA.observeSlice.isMicroScene === 'function') ? WA.observeSlice.isMicroScene(o) : { ok: false, reason: 'observeSlice-unavailable' }; },
    'autoHide.view': function (o) { return (WA.autoHide && typeof WA.autoHide.view === 'function') ? WA.autoHide.view(o) : { ok: false, reason: 'autoHide-unavailable' }; },
    'autoHide.list': function (o) { return (WA.autoHide && typeof WA.autoHide.list === 'function') ? WA.autoHide.list(o) : { ok: false, reason: 'autoHide-unavailable' }; },
    'autoHide.isHidden': function (o) { return (WA.autoHide && typeof WA.autoHide.isHidden === 'function') ? WA.autoHide.isHidden(o) : { ok: false, reason: 'autoHide-unavailable' }; },
    'autoHide.clear': function (o) { return (WA.autoHide && typeof WA.autoHide.clear === 'function') ? WA.autoHide.clear(o) : { ok: false, reason: 'autoHide-unavailable' }; },
    'moodGlide.setBaseline': function (o) { return (WA.moodGlide && typeof WA.moodGlide.setBaseline === 'function') ? WA.moodGlide.setBaseline(o) : { ok: false, reason: 'moodGlide-unavailable' }; },
    'moodGlide.baselineOf': function (o) { return (WA.moodGlide && typeof WA.moodGlide.baselineOf === 'function') ? WA.moodGlide.baselineOf(o.actorId || o.who) : { ok: false, reason: 'moodGlide-unavailable' }; },
    'moodGlide.phrase': function (o) { return (WA.moodGlide && typeof WA.moodGlide.phrase === 'function') ? WA.moodGlide.phrase(o) : { ok: false, reason: 'moodGlide-unavailable' }; },
    'phaseTransition.declarePlaceLayout': function (o) { return (WA.phaseTransition && typeof WA.phaseTransition.declarePlaceLayout === 'function') ? WA.phaseTransition.declarePlaceLayout(o) : { ok: false, reason: 'phaseTransition-unavailable' }; },
    'phaseTransition.investPath': function (o) { return (WA.phaseTransition && typeof WA.phaseTransition.investPath === 'function') ? WA.phaseTransition.investPath(o) : { ok: false, reason: 'phaseTransition-unavailable' }; },
    'phaseTransition.executeRoute': function (o) { return (WA.phaseTransition && typeof WA.phaseTransition.executeTransitionRoute === 'function') ? WA.phaseTransition.executeTransitionRoute(o) : { ok: false, reason: 'phaseTransition-unavailable' }; },
    'riskPooling.dispute': function (o) { return (WA.riskPooling && typeof WA.riskPooling.disputeReliefClaim === 'function') ? WA.riskPooling.disputeReliefClaim(o) : { ok: false, reason: 'riskPooling-unavailable' }; },
    'riskPooling.projection': function (o) { return (WA.riskPooling && typeof WA.riskPooling.riskPoolingProjection === 'function') ? WA.riskPooling.riskPoolingProjection(o) : { ok: false, reason: 'riskPooling-unavailable' }; },
    'commonsGovernance.declare': function (o) { return (WA.commonsGovernance && typeof WA.commonsGovernance.declareCommonAsset === 'function') ? WA.commonsGovernance.declareCommonAsset(o) : { ok: false, reason: 'commonsGovernance-unavailable' }; },
    'commonsGovernance.reserve': function (o) { return (WA.commonsGovernance && typeof WA.commonsGovernance.reserveCommonAsset === 'function') ? WA.commonsGovernance.reserveCommonAsset(o) : { ok: false, reason: 'commonsGovernance-unavailable' }; },
    'commonsGovernance.maintain': function (o) { return (WA.commonsGovernance && typeof WA.commonsGovernance.contributeMaintenance === 'function') ? WA.commonsGovernance.contributeMaintenance(o) : { ok: false, reason: 'commonsGovernance-unavailable' }; },
    'commonsGovernance.dispute': function (o) { return (WA.commonsGovernance && typeof WA.commonsGovernance.resolveAssetDispute === 'function') ? WA.commonsGovernance.resolveAssetDispute(o) : { ok: false, reason: 'commonsGovernance-unavailable' }; },
    'knowledgePractice.projection': function (o) { return (WA.knowledgePractice && typeof WA.knowledgePractice.knowledgePracticeProjection === 'function') ? WA.knowledgePractice.knowledgePracticeProjection(o) : { ok: false, reason: 'knowledgePractice-unavailable' }; },
    'sceneNarrative.currentScene': function (o) { return (WA.sceneNarrative && typeof WA.sceneNarrative.currentScene === 'function') ? WA.sceneNarrative.currentScene(o) : { ok: false, reason: 'sceneNarrative-unavailable' }; },
    'sceneNarrative.situation': function (o) { return (WA.sceneNarrative && typeof WA.sceneNarrative.situation === 'function') ? WA.sceneNarrative.situation(o) : { ok: false, reason: 'sceneNarrative-unavailable' }; },
    'sceneNarrative.traceCausalEchoes': function (o) { return (WA.sceneNarrative && typeof WA.sceneNarrative.traceCausalEchoes === 'function') ? WA.sceneNarrative.traceCausalEchoes(o.place, o.viewer, o.opts || o) : { ok: false, reason: 'sceneNarrative-unavailable' }; },
    'sceneNarrative.perceivedHorizon': function (o) { return (WA.sceneNarrative && typeof WA.sceneNarrative.perceivedHorizon === 'function') ? WA.sceneNarrative.perceivedHorizon(o) : { ok: false, reason: 'sceneNarrative-unavailable' }; },
    'subtextTension.assess': function (o) { return (WA.subtextTension && typeof WA.subtextTension.assessTension === 'function') ? WA.subtextTension.assessTension(o) : { ok: false, reason: 'subtextTension-unavailable' }; },
    'subtextTension.encode': function (o) { return (WA.subtextTension && typeof WA.subtextTension.encodeSubtext === 'function') ? WA.subtextTension.encodeSubtext(o) : { ok: false, reason: 'subtextTension-unavailable' }; },
    'subtextTension.decode': function (o) { return (WA.subtextTension && typeof WA.subtextTension.decodeSubtext === 'function') ? WA.subtextTension.decodeSubtext(o) : { ok: false, reason: 'subtextTension-unavailable' }; },
    // 第二批大规模业务桥接：关系、遗产、旅程、世界图谱、故事循环、生活世界与人口治理。
    'relationGraph.upsert': function (o) { return (WA.relationGraph && typeof WA.relationGraph.upsert === 'function') ? WA.relationGraph.upsert(o) : { ok: false, reason: 'relationGraph-unavailable' }; },
    'relationGraph.get': function (o) { return (WA.relationGraph && typeof WA.relationGraph.get === 'function') ? WA.relationGraph.get(o) : { ok: false, reason: 'relationGraph-unavailable' }; },
    'relationGraph.edgesOf': function (o) { return (WA.relationGraph && typeof WA.relationGraph.edgesOf === 'function') ? WA.relationGraph.edgesOf(o.actorId || o.who, o.opts || o) : { ok: false, reason: 'relationGraph-unavailable' }; },
    'relationGraph.remove': function (o) { return (WA.relationGraph && typeof WA.relationGraph.remove === 'function') ? WA.relationGraph.remove(o) : { ok: false, reason: 'relationGraph-unavailable' }; },
    'socialLegacy.form': function (o) { return (WA.socialLegacy && typeof WA.socialLegacy.formLegacy === 'function') ? WA.socialLegacy.formLegacy(o) : { ok: false, reason: 'socialLegacy-unavailable' }; },
    'socialLegacy.accept': function (o) { return (WA.socialLegacy && typeof WA.socialLegacy.acceptLegacy === 'function') ? WA.socialLegacy.acceptLegacy(o) : { ok: false, reason: 'socialLegacy-unavailable' }; },
    'socialLegacy.registerClaim': function (o) { return (WA.socialLegacy && typeof WA.socialLegacy.registerClaim === 'function') ? WA.socialLegacy.registerClaim(o) : { ok: false, reason: 'socialLegacy-unavailable' }; },
    'socialLegacy.spreadClaim': function (o) { return (WA.socialLegacy && typeof WA.socialLegacy.spreadClaim === 'function') ? WA.socialLegacy.spreadClaim(o) : { ok: false, reason: 'socialLegacy-unavailable' }; },
    'socialLegacy.initiateHandover': function (o) { return (WA.socialLegacy && typeof WA.socialLegacy.initiateHandover === 'function') ? WA.socialLegacy.initiateHandover(o) : { ok: false, reason: 'socialLegacy-unavailable' }; },
    'socialLegacy.resolveHandover': function (o) { return (WA.socialLegacy && typeof WA.socialLegacy.resolveHandover === 'function') ? WA.socialLegacy.resolveHandover(o) : { ok: false, reason: 'socialLegacy-unavailable' }; },
    'travelDesk.plan': function (o) { return (WA.travelDesk && typeof WA.travelDesk.plan === 'function') ? WA.travelDesk.plan(o) : { ok: false, reason: 'travelDesk-unavailable' }; },
    'travelDesk.route': function (o) { return (WA.travelDesk && typeof WA.travelDesk.route === 'function') ? WA.travelDesk.route(o) : { ok: false, reason: 'travelDesk-unavailable' }; },
    'travelDesk.meet': function (o) { return (WA.travelDesk && typeof WA.travelDesk.meet === 'function') ? WA.travelDesk.meet(o) : { ok: false, reason: 'travelDesk-unavailable' }; },
    'travelDesk.verify': function (o) { return (WA.travelDesk && typeof WA.travelDesk.verify === 'function') ? WA.travelDesk.verify(o) : { ok: false, reason: 'travelDesk-unavailable' }; },
    'travelDesk.commit': function (o) { return (WA.travelDesk && typeof WA.travelDesk.commit === 'function') ? WA.travelDesk.commit(o) : { ok: false, reason: 'travelDesk-unavailable' }; },
    'worldGraph.graph': function (o) { return (WA.worldGraph && typeof WA.worldGraph.graph === 'function') ? WA.worldGraph.graph(o) : { ok: false, reason: 'worldGraph-unavailable' }; },
    'worldGraph.geo': function (o) { return (WA.worldGraph && typeof WA.worldGraph.geo === 'function') ? WA.worldGraph.geo(o) : { ok: false, reason: 'worldGraph-unavailable' }; },
    'worldGraph.timeline': function (o) { return (WA.worldGraph && typeof WA.worldGraph.timeline === 'function') ? WA.worldGraph.timeline(o) : { ok: false, reason: 'worldGraph-unavailable' }; },
    'worldGraph.suggest': function (o) { return (WA.worldGraph && typeof WA.worldGraph.suggest === 'function') ? WA.worldGraph.suggest(o) : { ok: false, reason: 'worldGraph-unavailable' }; },
    'worldGraph.locate': function (o) { return (WA.worldGraph && typeof WA.worldGraph.locate === 'function') ? WA.worldGraph.locate(o) : { ok: false, reason: 'worldGraph-unavailable' }; },
    'worldLab.run': function (o) { return (WA.worldLab && typeof WA.worldLab.run === 'function') ? WA.worldLab.run(o) : { ok: false, reason: 'worldLab-unavailable' }; },
    'worldLab.simulate': function (o) { return (WA.worldLab && typeof WA.worldLab.simulate === 'function') ? WA.worldLab.simulate(o) : { ok: false, reason: 'worldLab-unavailable' }; },
    'worldLab.report': function (o) { return (WA.worldLab && typeof WA.worldLab.report === 'function') ? WA.worldLab.report(o) : { ok: false, reason: 'worldLab-unavailable' }; },
    'worldLab.adopt': function (o) { return (WA.worldLab && typeof WA.worldLab.adopt === 'function') ? WA.worldLab.adopt(o) : { ok: false, reason: 'worldLab-unavailable' }; },
    'worldSnapshot.export': function (o) { return (WA.worldSnapshot && typeof WA.worldSnapshot.exportSnapshot === 'function') ? WA.worldSnapshot.exportSnapshot(o) : { ok: false, reason: 'worldSnapshot-unavailable' }; },
    'worldSnapshot.previewImport': function (o) { return (WA.worldSnapshot && typeof WA.worldSnapshot.previewImport === 'function') ? WA.worldSnapshot.previewImport(o) : { ok: false, reason: 'worldSnapshot-unavailable' }; },
    'worldSnapshot.import': function (o) { return (WA.worldSnapshot && typeof WA.worldSnapshot.importSnapshot === 'function') ? WA.worldSnapshot.importSnapshot(o) : { ok: false, reason: 'worldSnapshot-unavailable' }; },
    'worldSnapshot.roundTrip': function (o) { return (WA.worldSnapshot && typeof WA.worldSnapshot.roundTrip === 'function') ? WA.worldSnapshot.roundTrip(o) : { ok: false, reason: 'worldSnapshot-unavailable' }; },
    'storyLoop.contracts': function (o) { return (WA.storyLoop && typeof WA.storyLoop.contracts === 'function') ? WA.storyLoop.contracts(o) : { ok: false, reason: 'storyLoop-unavailable' }; },
    'storyLoop.candidates': function (o) { return (WA.storyLoop && typeof WA.storyLoop.candidates === 'function') ? WA.storyLoop.candidates(o) : { ok: false, reason: 'storyLoop-unavailable' }; },
    'storyLoop.confirm': function (o) { return (WA.storyLoop && typeof WA.storyLoop.confirm === 'function') ? WA.storyLoop.confirm(o) : { ok: false, reason: 'storyLoop-unavailable' }; },
    'storyLoop.audit': function (o) { return (WA.storyLoop && typeof WA.storyLoop.audit === 'function') ? WA.storyLoop.audit(o) : { ok: false, reason: 'storyLoop-unavailable' }; },
    'storyTone.set': function (o) { return (WA.storyTone && typeof WA.storyTone.set === 'function') ? WA.storyTone.set(o) : { ok: false, reason: 'storyTone-unavailable' }; },
    'storyTone.get': function (o) { return (WA.storyTone && typeof WA.storyTone.get === 'function') ? WA.storyTone.get(o) : { ok: false, reason: 'storyTone-unavailable' }; },
    'storyTone.clear': function (o) { return (WA.storyTone && typeof WA.storyTone.clear === 'function') ? WA.storyTone.clear(o) : { ok: false, reason: 'storyTone-unavailable' }; },
    'livingWorld.registerRoutine': function (o) { return (WA.livingWorld && typeof WA.livingWorld.registerRoutine === 'function') ? WA.livingWorld.registerRoutine(o) : { ok: false, reason: 'livingWorld-unavailable' }; },
    'livingWorld.deflectTrajectory': function (o) { return (WA.livingWorld && typeof WA.livingWorld.deflectTrajectory === 'function') ? WA.livingWorld.deflectTrajectory(o) : { ok: false, reason: 'livingWorld-unavailable' }; },
    'livingWorld.propagateRipple': function (o) { return (WA.livingWorld && typeof WA.livingWorld.propagateRipple === 'function') ? WA.livingWorld.propagateRipple(o) : { ok: false, reason: 'livingWorld-unavailable' }; },
    'livingWorld.recordDebt': function (o) { return (WA.livingWorld && typeof WA.livingWorld.recordRelationalDebt === 'function') ? WA.livingWorld.recordRelationalDebt(o) : { ok: false, reason: 'livingWorld-unavailable' }; },
    'livingWorld.redeemDebt': function (o) { return (WA.livingWorld && typeof WA.livingWorld.redeemDebt === 'function') ? WA.livingWorld.redeemDebt(o) : { ok: false, reason: 'livingWorld-unavailable' }; },
    'powerAnchor.anchor': function (o) { return (WA.powerAnchor && typeof WA.powerAnchor.anchor === 'function') ? WA.powerAnchor.anchor(o) : { ok: false, reason: 'powerAnchor-unavailable' }; },
    'powerAnchor.drop': function (o) { return (WA.powerAnchor && typeof WA.powerAnchor.drop === 'function') ? WA.powerAnchor.drop(o) : { ok: false, reason: 'powerAnchor-unavailable' }; },
    'powerAnchor.check': function (o) { return (WA.powerAnchor && typeof WA.powerAnchor.check === 'function') ? WA.powerAnchor.check(o) : { ok: false, reason: 'powerAnchor-unavailable' }; },
    'interestFace.place': function (o) { return (WA.interestFace && typeof WA.interestFace.place === 'function') ? WA.interestFace.place(o) : { ok: false, reason: 'interestFace-unavailable' }; },
    'interestFace.move': function (o) { return (WA.interestFace && typeof WA.interestFace.move === 'function') ? WA.interestFace.move(o) : { ok: false, reason: 'interestFace-unavailable' }; },
    'interestFace.leave': function (o) { return (WA.interestFace && typeof WA.interestFace.leave === 'function') ? WA.interestFace.leave(o) : { ok: false, reason: 'interestFace-unavailable' }; },
    'evidenceBoard.assertClaim': function (o) { return (WA.evidenceBoard && typeof WA.evidenceBoard.assertClaim === 'function') ? WA.evidenceBoard.assertClaim(o) : { ok: false, reason: 'evidenceBoard-unavailable' }; },
    'evidenceBoard.retract': function (o) { return (WA.evidenceBoard && typeof WA.evidenceBoard.retract === 'function') ? WA.evidenceBoard.retract(o) : { ok: false, reason: 'evidenceBoard-unavailable' }; },
    'evidenceBoard.gather': function (o) { return (WA.evidenceBoard && typeof WA.evidenceBoard.gather === 'function') ? WA.evidenceBoard.gather(o) : { ok: false, reason: 'evidenceBoard-unavailable' }; },
    'careChain.register': function (o) { return (WA.careChain && typeof WA.careChain.registerCareCommitment === 'function') ? WA.careChain.registerCareCommitment(o) : { ok: false, reason: 'careChain-unavailable' }; },
    'careChain.reportAbsence': function (o) { return (WA.careChain && typeof WA.careChain.reportCareAbsence === 'function') ? WA.careChain.reportCareAbsence(o) : { ok: false, reason: 'careChain-unavailable' }; },
    'careChain.refer': function (o) { return (WA.careChain && typeof WA.careChain.referCare === 'function') ? WA.careChain.referCare(o) : { ok: false, reason: 'careChain-unavailable' }; },
    'careChain.queuePublic': function (o) { return (WA.careChain && typeof WA.careChain.queueForPublicCare === 'function') ? WA.careChain.queueForPublicCare(o) : { ok: false, reason: 'careChain-unavailable' }; },
    'demographicFlow.setCapacity': function (o) { return (WA.demographicFlow && typeof WA.demographicFlow.setPlaceCapacity === 'function') ? WA.demographicFlow.setPlaceCapacity(o) : { ok: false, reason: 'demographicFlow-unavailable' }; },
    'demographicFlow.planMigration': function (o) { return (WA.demographicFlow && typeof WA.demographicFlow.planMigration === 'function') ? WA.demographicFlow.planMigration(o) : { ok: false, reason: 'demographicFlow-unavailable' }; },
    'demographicFlow.commitMigration': function (o) { return (WA.demographicFlow && typeof WA.demographicFlow.commitMigration === 'function') ? WA.demographicFlow.commitMigration(o) : { ok: false, reason: 'demographicFlow-unavailable' }; },
    'demographicFlow.arriveMigration': function (o) { return (WA.demographicFlow && typeof WA.demographicFlow.arriveMigration === 'function') ? WA.demographicFlow.arriveMigration(o) : { ok: false, reason: 'demographicFlow-unavailable' }; },
    'pendingCenter.items': function (o) { return (WA.pendingCenter && typeof WA.pendingCenter.items === 'function') ? WA.pendingCenter.items(o) : { ok: false, reason: 'pendingCenter-unavailable' }; },
    'pendingCenter.describe': function (o) { return (WA.pendingCenter && typeof WA.pendingCenter.describe === 'function') ? WA.pendingCenter.describe(o) : { ok: false, reason: 'pendingCenter-unavailable' }; },
    'pendingCenter.act': function (o) { return (WA.pendingCenter && typeof WA.pendingCenter.act === 'function') ? WA.pendingCenter.act(o) : { ok: false, reason: 'pendingCenter-unavailable' }; },
    // 最终业务边界桥接：入口、场景切片、服务网络、供应链、时间锁、并行事件与模型链接。
    'entryRouter.plan': function (o) { return (WA.entryRouter && typeof WA.entryRouter.plan === 'function') ? WA.entryRouter.plan(o) : { ok: false, reason: 'entryRouter-unavailable' }; },
    'entryRouter.applyPlan': function (o) { return (WA.entryRouter && typeof WA.entryRouter.applyPlan === 'function') ? WA.entryRouter.applyPlan(o) : { ok: false, reason: 'entryRouter-unavailable' }; },
    'floorChanges.plan': function (o) { return (WA.floorChanges && typeof WA.floorChanges.plan === 'function') ? WA.floorChanges.plan(o) : { ok: false, reason: 'floorChanges-unavailable' }; },
    'floorChanges.sweep': function (o) { return (WA.floorChanges && typeof WA.floorChanges.sweep === 'function') ? WA.floorChanges.sweep(o) : { ok: false, reason: 'floorChanges-unavailable' }; },
    'groupGuard.detect': function (o) { return (WA.groupGuard && typeof WA.groupGuard.detect === 'function') ? WA.groupGuard.detect(o) : { ok: false, reason: 'groupGuard-unavailable' }; },
    'groupGuard.guard': function (o) { return (WA.groupGuard && typeof WA.groupGuard.guard === 'function') ? WA.groupGuard.guard(o) : { ok: false, reason: 'groupGuard-unavailable' }; },
    'inlineTags.parse': function (o) { return (WA.inlineTags && typeof WA.inlineTags.parse === 'function') ? WA.inlineTags.parse(o.text || o.source || o) : { ok: false, reason: 'inlineTags-unavailable' }; },
    'inlineTags.apply': function (o) { return (WA.inlineTags && typeof WA.inlineTags.apply === 'function') ? WA.inlineTags.apply(o) : { ok: false, reason: 'inlineTags-unavailable' }; },
    'inlineTags.evaluateCondition': function (o) { return (WA.inlineTags && typeof WA.inlineTags.evaluateCondition === 'function') ? WA.inlineTags.evaluateCondition(o.condition, o.context || o) : { ok: false, reason: 'inlineTags-unavailable' }; },
    'sceneSlice.resolveSegment': function (o) { return (WA.sceneSlice && typeof WA.sceneSlice.resolveSegment === 'function') ? WA.sceneSlice.resolveSegment(o) : { ok: false, reason: 'sceneSlice-unavailable' }; },
    'sceneSlice.set': function (o) { return (WA.sceneSlice && typeof WA.sceneSlice.set === 'function') ? WA.sceneSlice.set(o) : { ok: false, reason: 'sceneSlice-unavailable' }; },
    'sceneSlice.read': function (o) { return (WA.sceneSlice && typeof WA.sceneSlice.read === 'function') ? WA.sceneSlice.read(o) : { ok: false, reason: 'sceneSlice-unavailable' }; },
    'serviceNetwork.declareFacility': function (o) { return (WA.serviceNetwork && typeof WA.serviceNetwork.declareFacility === 'function') ? WA.serviceNetwork.declareFacility(o) : { ok: false, reason: 'serviceNetwork-unavailable' }; },
    'serviceNetwork.activateFacility': function (o) { return (WA.serviceNetwork && typeof WA.serviceNetwork.activateFacility === 'function') ? WA.serviceNetwork.activateFacility(o) : { ok: false, reason: 'serviceNetwork-unavailable' }; },
    'serviceNetwork.requestService': function (o) { return (WA.serviceNetwork && typeof WA.serviceNetwork.requestService === 'function') ? WA.serviceNetwork.requestService(o) : { ok: false, reason: 'serviceNetwork-unavailable' }; },
    'serviceNetwork.releaseService': function (o) { return (WA.serviceNetwork && typeof WA.serviceNetwork.releaseService === 'function') ? WA.serviceNetwork.releaseService(o) : { ok: false, reason: 'serviceNetwork-unavailable' }; },
    'serviceNetwork.queueService': function (o) { return (WA.serviceNetwork && typeof WA.serviceNetwork.queueService === 'function') ? WA.serviceNetwork.queueService(o) : { ok: false, reason: 'serviceNetwork-unavailable' }; },
    'serviceNetwork.cancelQueue': function (o) { return (WA.serviceNetwork && typeof WA.serviceNetwork.cancelQueue === 'function') ? WA.serviceNetwork.cancelQueue(o) : { ok: false, reason: 'serviceNetwork-unavailable' }; },
    'serviceNetwork.restoreFacility': function (o) { return (WA.serviceNetwork && typeof WA.serviceNetwork.restoreFacility === 'function') ? WA.serviceNetwork.restoreFacility(o) : { ok: false, reason: 'serviceNetwork-unavailable' }; },
    'supplyChain.plan': function (o) { return (WA.supplyChain && typeof WA.supplyChain.plan === 'function') ? WA.supplyChain.plan(o) : { ok: false, reason: 'supplyChain-unavailable' }; },
    'supplyChain.commit': function (o) { return (WA.supplyChain && typeof WA.supplyChain.commit === 'function') ? WA.supplyChain.commit(o) : { ok: false, reason: 'supplyChain-unavailable' }; },
    'supplyChain.bottleneck': function (o) { return (WA.supplyChain && typeof WA.supplyChain.bottleneck === 'function') ? WA.supplyChain.bottleneck(o) : { ok: false, reason: 'supplyChain-unavailable' }; },
    'supplyChain.verify': function (o) { return (WA.supplyChain && typeof WA.supplyChain.verify === 'function') ? WA.supplyChain.verify(o) : { ok: false, reason: 'supplyChain-unavailable' }; },
    'temporalLock.lock': function (o) { return (WA.temporalLock && typeof WA.temporalLock.lock === 'function') ? WA.temporalLock.lock(o) : { ok: false, reason: 'temporalLock-unavailable' }; },
    'temporalLock.unlock': function (o) { return (WA.temporalLock && typeof WA.temporalLock.unlock === 'function') ? WA.temporalLock.unlock(o) : { ok: false, reason: 'temporalLock-unavailable' }; },
    'temporalLock.check': function (o) { return (WA.temporalLock && typeof WA.temporalLock.check === 'function') ? WA.temporalLock.check(o) : { ok: false, reason: 'temporalLock-unavailable' }; },
    'parallelEvents.add': function (o) { return (WA.parallelEvents && typeof WA.parallelEvents.add === 'function') ? WA.parallelEvents.add(o) : { ok: false, reason: 'parallelEvents-unavailable' }; },
    'parallelEvents.resolve': function (o) { return (WA.parallelEvents && typeof WA.parallelEvents.resolve === 'function') ? WA.parallelEvents.resolve(o) : { ok: false, reason: 'parallelEvents-unavailable' }; },
    'modelink.updateBlocks': function (o) { return (WA.modelink && typeof WA.modelink.updateBlocks === 'function') ? WA.modelink.updateBlocks(o) : { ok: false, reason: 'modelink-unavailable' }; },
    'modelink.draftAdd': function (o) { return (WA.modelink && typeof WA.modelink.draftAdd === 'function') ? WA.modelink.draftAdd(o) : { ok: false, reason: 'modelink-unavailable' }; },
    'modelink.draftApply': function (o) { return (WA.modelink && typeof WA.modelink.draftApply === 'function') ? WA.modelink.draftApply(o) : { ok: false, reason: 'modelink-unavailable' }; },
    'beatFacade.run': function (o) { return (WA.beatFacade && typeof WA.beatFacade.run === 'function') ? WA.beatFacade.run(o) : { ok: false, reason: 'beatFacade-unavailable' }; },
    'beatFacade.view': function (o) { return (WA.beatFacade && typeof WA.beatFacade.view === 'function') ? WA.beatFacade.view(o) : { ok: false, reason: 'beatFacade-unavailable' }; },
    'techLineage.cancelRetrofit': function (o) { return WA.techLineage.cancelRetrofit(o.facilityId); },
    'techLineage.produceAdapter': function (o) { return WA.techLineage.produceAdapter(o); },
    'techLineage.outsourceWork': function (o) { return WA.techLineage.outsourceWork(o.orderId, o.targetFacilityId, o); },
    'familyOps.gap': function (o) { return WA.familyOps.handleGap(o.unitId, o.gapType, o.solution, o); },
    'familyOps.inherit': function (o) { return WA.familyOps.inheritRatio(o.unitId, o.deceased, o.shares, o); },
    'familyOps.advanceCycle': function (o) { return WA.familyOps.advanceCycle(o.unitId, o); },
    'aftermath.reroute': function (o) { return WA.aftermathImpact.findDetour(o.from, o.to, o.blockedPlace, o); },
    'aftermath.repairCommission': function (o) { return WA.aftermathImpact.commissionRepair(o.effectId, o); },
    'epistemic.view': function (o) { return WA.epistemicView.buildView(o.personId || o.who, o.topicId); },
    'epistemic.correct': function (o) { return WA.epistemicView.correctBelief(o.personId || o.who, o.topicId, o.evidence, o); },
    'epistemic.registerBelief': function (o) { return WA.epistemicView.registerBelief(o.personId || o.who, o.topicId, o.belief || o); },
    'epistemic.decideAction': function (o) { return WA.epistemicView.decideAction(o.personId || o.who, o.topicId, o.context || o); },
    'epistemic.deriveAction': function (o) { return WA.epistemicView.deriveAction(o.personId || o.who, o.topicId); },
    // v2.233.0 (OPV4-5): 证据可信度裁决与更替
    'epistemic.weigh': function (o) { return WA.epistemicView.weighEvidence(o.personId || o.who, o.topicId, o.evidenceItems || o.evidence, o); },
    'epistemic.update': function (o) { return WA.epistemicView.updateBeliefWithEvidence(o.personId || o.who, o.topicId, o.evidenceItems || o.evidence, o); },
    // v2.233.0 (OPV4-8): 章节、事件与分支的连续游玩
    'chapter.open': function (o) { return chapterOpen(o); },
    'chapter.flow': function (o) { return chapterFlow(o); },
    'chapter.rollover': function (o) { return chapterRollover(o); },
    'chapter.close': function (o) { return chapterClose(o); },
    'chapter.saveBranch': function (o) { return chapterSaveBranch(o); },
    'chapter.restore': function (o) { return chapterRestore(o); },
    'chapter.diff': function (o) { return chapterDiff(o); },
    'chapter.inspect': function (o) { return chapterInspect(o); },
    // EXV12-1: 世界导演台（主题、节奏、阶段、倾向、注意预算）
    'theme.apply': function (o) { return (WA.theme && typeof WA.theme.apply === 'function') ? WA.theme.apply(o.themes || o.names || o) : { ok: false, reason: 'theme-unavailable' }; },
    'theme.list': function () { return (WA.theme && typeof WA.theme.list === 'function') ? WA.theme.list() : []; },
    'tempo.setGear': function (o) { return (WA.tempo && typeof WA.tempo.setGear === 'function') ? WA.tempo.setGear(o.gear || o.id || o) : { ok: false, reason: 'tempo-unavailable' }; },
    'tempo.current': function () { return (WA.tempo && typeof WA.tempo.current === 'function') ? WA.tempo.current() : null; },
    'tempo.check': function (o) { return (WA.tempo && typeof WA.tempo.check === 'function') ? WA.tempo.check(o.spanMinutes || o.span || o) : { ok: false, reason: 'tempo-unavailable' }; },
    'storyTone.set': function (o) { return (WA.storyTone && typeof WA.storyTone.set === 'function') ? WA.storyTone.set(o.person || o.who || '*', o.tone || o.mode) : { ok: false, reason: 'storyTone-unavailable' }; },
    'storyTone.get': function (o) { return (WA.storyTone && typeof WA.storyTone.get === 'function') ? WA.storyTone.get(o.person || o.who || '*') : null; },
    'storyTone.clear': function (o) { return (WA.storyTone && typeof WA.storyTone.clear === 'function') ? WA.storyTone.clear(o.person || o.who || '*') : { ok: false, reason: 'storyTone-unavailable' }; },
    'stage.adopt': function (o) { return (WA.stage && typeof WA.stage.adopt === 'function') ? WA.stage.adopt(o.pack || o.name, o.opts || o) : { ok: false, reason: 'stage-unavailable' }; },
    'stage.mark': function (o) { return (WA.stage && typeof WA.stage.mark === 'function') ? WA.stage.mark(o.metric, o.delta, o.opts || o) : { ok: false, reason: 'stage-unavailable' }; },
    'stage.plan': function (o) { return (WA.stage && typeof WA.stage.plan === 'function') ? WA.stage.plan(o.opts || o) : { ok: false, reason: 'stage-unavailable' }; },
    'stage.transit': function (o) { return (WA.stage && typeof WA.stage.transit === 'function') ? WA.stage.transit(o.transId || o.id, o.opts || o) : { ok: false, reason: 'stage-unavailable' }; },
    'stage.view': function () { return (WA.stage && typeof WA.stage.view === 'function') ? WA.stage.view() : null; },
    'sceneBudget.note': function (o) { return (WA.sceneBudget && typeof WA.sceneBudget.note === 'function') ? WA.sceneBudget.note(o.signature || o.fingerprint || o) : { advance: true, factor: 1 }; },
    'sceneBudget.reset': function () { return (WA.sceneBudget && typeof WA.sceneBudget.reset === 'function') ? WA.sceneBudget.reset() : { ok: false }; },
    // EXV12-3: 共同体记忆与城市性格（地点沉积层与社区笔记）
    'sediment.settle': function (o) { return (WA.sediment && typeof WA.sediment.settle === 'function') ? WA.sediment.settle(o.placeId || o.place, o.fact || o.trace, o.opts || o) : { ok: false, reason: 'sediment-unavailable' }; },
    'sediment.feel': function (o) { return (WA.sediment && typeof WA.sediment.feel === 'function') ? WA.sediment.feel(o.placeId || o.place) : null; },
    'communityNote.push': function (o) { return (WA.communityNote && typeof WA.communityNote.push === 'function') ? WA.communityNote.push(o.note || o, o.opts || o) : { ok: false, reason: 'communityNote-unavailable' }; },
    'communityNote.pending': function () { return (WA.communityNote && typeof WA.communityNote.pending === 'function') ? WA.communityNote.pending() : { ok: false, reason: 'communityNote-unavailable' }; },
    'communityNote.ack': function (o) { return (WA.communityNote && typeof WA.communityNote.ack === 'function') ? WA.communityNote.ack(o.ids || o.id || o) : { ok: false, reason: 'communityNote-unavailable' }; },
    // EXV12-5 / EXV12-9: 可协商困局与多结局分支树 / 预演选择
    'branchTree.fork': function (o) { return (WA.branchTree && typeof WA.branchTree.fork === 'function') ? WA.branchTree.fork(o.node || o) : { ok: false, reason: 'branchTree-unavailable' }; },
    'branchTree.choose': function (o) { return (WA.branchTree && typeof WA.branchTree.choose === 'function') ? WA.branchTree.choose(o.id, o.option || o.choice) : { ok: false, reason: 'branchTree-unavailable' }; },
    'branchTree.tree': function () { return (WA.branchTree && typeof WA.branchTree.tree === 'function') ? WA.branchTree.tree() : { ok: false, reason: 'branchTree-unavailable' }; },
    'branchTree.compare': function (o) { return (WA.branchTree && typeof WA.branchTree.compare === 'function') ? WA.branchTree.compare(o.aId || o.idA, o.bId || o.idB) : { ok: false, reason: 'branchTree-unavailable' }; },
    'storyChoice.present': function (o) { return (WA.storyChoice && typeof WA.storyChoice.present === 'function') ? WA.storyChoice.present(o.node || o) : { ok: false, reason: 'storyChoice-unavailable' }; },
    'storyChoice.confirm': function (o) { return (WA.storyChoice && typeof WA.storyChoice.confirm === 'function') ? WA.storyChoice.confirm(o.id, o.option || o.choice) : { ok: false, reason: 'storyChoice-unavailable' }; },
    'storyChoice.pending': function () { return (WA.storyChoice && typeof WA.storyChoice.pending === 'function') ? WA.storyChoice.pending() : []; },
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
        'liaison.sceneOpen': function (o) { return (WA.liaison && typeof WA.liaison.sceneOpen === 'function') ? WA.liaison.sceneOpen(o) : { ok: false, reason: 'liaison-unavailable' }; },
    'liaison.sceneResolve': function (o) { return (WA.liaison && typeof WA.liaison.sceneResolve === 'function') ? WA.liaison.sceneResolve(o.sceneId || o.id, o.receipt || o) : { ok: false, reason: 'liaison-unavailable' }; },
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
    // 承诺履约、违约与补救和解写口路由（OPV12-7 / 场景 2：一次失约）
    'customLax.commitPromise': function (o) { return WA.customLax.commitPromise(o.spec || o); },
    'customLax.fulfillPromise': function (o) { return WA.customLax.fulfillPromise(o.promiseId || o.id, o); },
    'customLax.defaultPromise': function (o) { return WA.customLax.defaultPromise(o.promiseId || o.id, o.reason, o); },
    'customLax.remedyPromise': function (o) { return WA.customLax.remedyPromise(o.promiseId || o.id, o.remedySpec || o); },
    'customLax.listPromises': function (o) { return WA.customLax.listPromises(o); },
    // 借据与还款写口路由（经济信用层）
    'creditLedger.open': function (o) { return WA.creditLedger.open(o.spec || o); },
    'creditLedger.accrue': function (o) { return WA.creditLedger.accrue(o.id || o.loanId, o); },
    'creditLedger.repay': function (o) { return WA.creditLedger.repay(o.id || o.loanId, o.spec || o); },
    'creditLedger.view': function (o) { return WA.creditLedger.view(o.id || o.loanId); },
    'creditLedger.checkCredit': function (o) { return WA.creditLedger.checkCredit(o.borrower || o.who, o.at); },
    'finance.ruptureCollateral': function (o) {
      if (WA.collateralRupture && typeof WA.collateralRupture.ruptureCollateral === 'function') {
        return WA.collateralRupture.ruptureCollateral(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'actor.applyEvaluationCosts': function (o) {
      if (WA.actionCostFeedback && typeof WA.actionCostFeedback.applyEvaluationCosts === 'function') {
        return WA.actionCostFeedback.applyEvaluationCosts(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'drama.germinateForeshadow': function (o) {
      if (WA.foreshadowGermination && typeof WA.foreshadowGermination.germinate === 'function') {
        return WA.foreshadowGermination.germinate(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'chronicle.deliverRemoteEcho': function (o) {
      if (WA.courierDispatch && typeof WA.courierDispatch.sendDispatch === 'function') {
        return WA.courierDispatch.sendDispatch(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'chronicle.dispatchPending': function (o) {
      if (WA.courierDispatch && typeof WA.courierDispatch.dispatchPending === 'function') {
        return WA.courierDispatch.dispatchPending(o.at);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'environment.triggerSupplyChoke': function (o) {
      if (WA.supplyChoke && typeof WA.supplyChoke.triggerChoke === 'function') {
        return WA.supplyChoke.triggerChoke(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'society.projectRumor': function (o) {
      if (WA.rumorCognition && typeof WA.rumorCognition.projectRumorToActor === 'function') {
        return WA.rumorCognition.projectRumorToActor(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'society.plantForgedIntel': function (o) {
      if (WA.cognitivePoisoning && typeof WA.cognitivePoisoning.plantForgedIntel === 'function') {
        return WA.cognitivePoisoning.plantForgedIntel(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'drama.negotiateDilemma': function (o) {
      if (WA.dilemmaBargain && typeof WA.dilemmaBargain.negotiate === 'function') {
        return WA.dilemmaBargain.negotiate(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'faction.triggerSchism': function (o) {
      if (WA.factionSchism && typeof WA.factionSchism.triggerSchism === 'function') {
        return WA.factionSchism.triggerSchism(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'chronicle.enactReform': function (o) {
      if (WA.institutionalSchism && typeof WA.institutionalSchism.enactReform === 'function') {
        return WA.institutionalSchism.enactReform(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'environment.disruptRoutines': function (o) {
      if (WA.environmentInterference && typeof WA.environmentInterference.disruptRoutines === 'function') {
        return WA.environmentInterference.disruptRoutines(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'chronicle.transplantFact': function (o) {
      if (WA.branchTransplant && typeof WA.branchTransplant.transplantFact === 'function') {
        return WA.branchTransplant.transplantFact(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'survival.scrambleSanctuary': function (o) {
      if (WA.sanctuaryScramble && typeof WA.sanctuaryScramble.scramble === 'function') {
        return WA.sanctuaryScramble.scramble(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'drama.evokeCounterfactualEcho': function (o) {
      if (WA.counterfactualEcho && typeof WA.counterfactualEcho.evokeEcho === 'function') {
        return WA.counterfactualEcho.evokeEcho(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.323.0: 退场角色生计与怪诞市井暗线
    'life.markOffstage': function (o) {
      if (WA.offstageLife && typeof WA.offstageLife.markOffstage === 'function') {
        return WA.offstageLife.markOffstage(o.who || o.name, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'life.progressOffstage': function (o) {
      if (WA.offstageLife && typeof WA.offstageLife.progressOffstage === 'function') {
        return WA.offstageLife.progressOffstage(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'life.reunionSnap': function (o) {
      if (WA.offstageLife && typeof WA.offstageLife.reunionSnap === 'function') {
        return WA.offstageLife.reunionSnap(o.who || o.name, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'society.openEccentricThread': function (o) {
      if (WA.eccentricThreads && typeof WA.eccentricThreads.openThread === 'function') {
        return WA.eccentricThreads.openThread(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'society.advanceEccentricThread': function (o) {
      if (WA.eccentricThreads && typeof WA.eccentricThreads.advanceThread === 'function') {
        return WA.eccentricThreads.advanceThread(o.threadId || o.id, o.step || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'society.resolveEccentricThread': function (o) {
      if (WA.eccentricThreads && typeof WA.eccentricThreads.resolveThread === 'function') {
        return WA.eccentricThreads.resolveThread(o.threadId || o.id, o.resolutionSpec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.324.0: 真实人物肉身生理、七情六欲与记恨小账本
    'realism.setNeeds': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.setNeeds === 'function') {
        return WA.humanRealism.setNeeds(o.who || o.name, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'realism.consumeRoutine': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.consumeRoutine === 'function') {
        return WA.humanRealism.consumeRoutine(o.who || o.name, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'realism.recordGrudge': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.recordGrudge === 'function') {
        return WA.humanRealism.recordGrudge(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'realism.settleGrudge': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.settleGrudge === 'function') {
        return WA.humanRealism.settleGrudge(o.grudgeId || o.id, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'realism.triggerOutburst': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.triggerOutburst === 'function') {
        return WA.humanRealism.triggerOutburst(o.who || o.name, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'realism.setExemption': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.setExemption === 'function') {
        return WA.humanRealism.setExemption(o.who || o.name, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.325.0: 剧情生活动线、身份世界观节律与个性偏离推进
    'routine.setProfile': function (o) {
      if (WA.routinePacing && typeof WA.routinePacing.setActorProfile === 'function') {
        return WA.routinePacing.setActorProfile(o.who || o.name, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'routine.advanceSlot': function (o) {
      if (WA.routinePacing && typeof WA.routinePacing.advanceSlot === 'function') {
        return WA.routinePacing.advanceSlot(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'routine.setWillingness': function (o) {
      if (WA.routinePacing && typeof WA.routinePacing.setWillingness === 'function') {
        return WA.routinePacing.setWillingness(o.who || o.name, o.value != null ? o.value : o.willingness, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'routine.setDeviation': function (o) {
      if (WA.routinePacing && typeof WA.routinePacing.setDeviation === 'function') {
        return WA.routinePacing.setDeviation(o.who || o.name, o.deviation || o.text);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'routine.setWorldPreset': function (o) {
      if (WA.routinePacing && typeof WA.routinePacing.setWorldPreset === 'function') {
        return WA.routinePacing.setWorldPreset(o.preset || o.key, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // 关系图谱与声誉边维护
    'relationGraph.upsert': function (o) { return WA.relationGraph.upsert(o.edge || o, o); },
    'relationGraph.view': function (o) { return WA.relationGraph.view(o.edgeId || o.id, o); },
    // 传闻发酵与调查
    'rumor.startChain': function (o) { return WA.rumor.startChain(o.factKey || o.key, o.note); },
    'rumor.relay': function (o) { return WA.rumor.relay(o.id || o.chainId, o.item || o); },
    'rumor.investigate': function (o) { return WA.rumor.investigate(o.id || o.chainId); },
    // 情报与信念更新
    'intel.addIntel': function (o) { return WA.intel.addIntel(o.person || o.who, o.item || o); },
    'intel.believe': function (o) { return WA.intel.believe(o.person || o.who, o.item || o); },
    // v2.231.0（优化 OP-8）：场景与历史按因果讲清楚（只读聚合）
    'sceneNarrative.currentScene': function (o) { return WA.sceneNarrative.currentScene(o); },
    'sceneNarrative.resolvedSummary': function (o) { return WA.sceneNarrative.resolvedSummary(o); },
    'sceneNarrative.traceFrom': function (o) { return WA.sceneNarrative.traceFrom(o.seed); },
    'sceneNarrative.perceivedHorizon': function (o) { return WA.sceneNarrative.perceivedHorizon(o.who); },
    'sceneNarrative.traceCausalEchoes': function (o) { return WA.sceneNarrative.traceCausalEchoes(o.placeId || o.place, o.viewer || o.who, o); },
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
    // OPV12-6/8: 世界内期刊出版与渲染路由
    'periodicals.configure': function (o) { return WA.periodicals.configure(o.input || o); },
    'periodicals.checkAndPublish': function (o) { return WA.periodicals.checkAndPublish(o); },
    'periodicals.render': function (o) { return { ok: true, html: WA.periodicals.render() }; },
    'periodicals.publishDirect': function (o) {
      if (!o || !o.id || !o.title || !o.text) return { ok: false, reason: 'missing-fields' };
      return WA.store.transact(function (d) {
        d.periodicals = d.periodicals || { defs: [], issues: [] };
        if (!d.periodicals.defs.some(function (x) { return x && x.id === o.id; })) {
          d.periodicals.defs.push({
            id: o.id,
            name: o.name || o.title || o.id,
            days: [1],
            profile: o.slant || 'general',
            enabled: true
          });
        }
        d.periodicals.issues.push({
          id: o.id,
          date: o.date || (d.clock && d.clock.iso) || '2026-11-06',
          title: o.title,
          text: o.text,
          slant: o.slant || 'neutral',
          createdAt: WA.clock.now('periodicals.issue'),
          canon: false
        });
        if (WA.evict && typeof WA.evict.array === 'function') {
          WA.evict.array(d.periodicals.issues, 'periodicals.issues');
        }
        return true;
      }, 'periodicals:publishDirect');
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
    // v2.233.0 (EXV4-4): 公共议程设置与代表性缺口
    'publicAgenda.setAgendaCapacity': function (o) {
      if (typeof WA.publicAgenda.setAgendaCapacity === 'function') {
        return WA.publicAgenda.setAgendaCapacity(o.placeId || o.place, o.maxSlots || o.slots);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'publicAgenda.submitProposal': function (o) {
      if (typeof WA.publicAgenda.submitProposal === 'function') {
        return WA.publicAgenda.submitProposal(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'publicAgenda.scheduleAgenda': function (o) {
      if (typeof WA.publicAgenda.scheduleAgenda === 'function') {
        return WA.publicAgenda.scheduleAgenda(o.placeId || o.place);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'publicAgenda.enactAgendaTopic': function (o) {
      if (typeof WA.publicAgenda.enactAgendaTopic === 'function') {
        return WA.publicAgenda.enactAgendaTopic(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'publicAgenda.viewAgenda': function (o) {
      if (typeof WA.publicAgenda.viewAgenda === 'function') {
        return WA.publicAgenda.viewAgenda(o.placeId || o.place, o.viewerGroup);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'publicAgenda.publicAgendaProjection': function (o) {
      if (typeof WA.publicAgenda.publicAgendaProjection === 'function') {
        return WA.publicAgenda.publicAgendaProjection(o.placeId || o.place);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'publicAgenda.topicStatus': function () {
      return (WA.publicAgenda && WA.publicAgenda.TOPIC_STATUS) ? WA.publicAgenda.TOPIC_STATUS.slice() : [];
    },
    // v2.233.0 (EXV4-5): 共同资源的使用权与维护责任
    'commonsGovernance.declareCommonAsset': function (o) {
      if (typeof WA.commonsGovernance.declareCommonAsset === 'function') {
        return WA.commonsGovernance.declareCommonAsset(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'commonsGovernance.reserveCommonAsset': function (o) {
      if (typeof WA.commonsGovernance.reserveCommonAsset === 'function') {
        return WA.commonsGovernance.reserveCommonAsset(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'commonsGovernance.changeGovernanceModel': function (o) {
      if (typeof WA.commonsGovernance.changeGovernanceModel === 'function') {
        return WA.commonsGovernance.changeGovernanceModel(o.assetId, o.newModel || o.model, o.reason);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'commonsGovernance.contributeMaintenance': function (o) {
      if (typeof WA.commonsGovernance.contributeMaintenance === 'function') {
        return WA.commonsGovernance.contributeMaintenance(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'commonsGovernance.auditAssetDecay': function (o) {
      if (typeof WA.commonsGovernance.auditAssetDecay === 'function') {
        return WA.commonsGovernance.auditAssetDecay(o.assetId, o.simulatedDaysSince || o.days);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'commonsGovernance.resolveAssetDispute': function (o) {
      if (typeof WA.commonsGovernance.resolveAssetDispute === 'function') {
        return WA.commonsGovernance.resolveAssetDispute(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'commonsGovernance.commonsProjection': function (o) {
      if (typeof WA.commonsGovernance.commonsProjection === 'function') {
        return WA.commonsGovernance.commonsProjection(o.filter || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'commonsGovernance.governanceModels': function () {
      return (WA.commonsGovernance && WA.commonsGovernance.GOVERNANCE_MODELS) ? WA.commonsGovernance.GOVERNANCE_MODELS.slice() : [];
    },
    'commonsGovernance.assetStatus': function () {
      return (WA.commonsGovernance && WA.commonsGovernance.ASSET_STATUS) ? WA.commonsGovernance.ASSET_STATUS.slice() : [];
    },
    // v2.233.0 (EXV4-6): 知识的地方传播与实践许可
    'knowledgePractice.registerKnowledgeSpec': function (o) {
      if (typeof WA.knowledgePractice.registerKnowledgeSpec === 'function') {
        return WA.knowledgePractice.registerKnowledgeSpec(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'knowledgePractice.grantPracticeLicense': function (o) {
      if (typeof WA.knowledgePractice.grantPracticeLicense === 'function') {
        return WA.knowledgePractice.grantPracticeLicense(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'knowledgePractice.executePractice': function (o) {
      if (typeof WA.knowledgePractice.executePractice === 'function') {
        return WA.knowledgePractice.executePractice(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'knowledgePractice.refineKnowledgeFromEvidence': function (o) {
      if (typeof WA.knowledgePractice.refineKnowledgeFromEvidence === 'function') {
        return WA.knowledgePractice.refineKnowledgeFromEvidence(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'knowledgePractice.knowledgePracticeProjection': function (o) {
      if (typeof WA.knowledgePractice.knowledgePracticeProjection === 'function') {
        return WA.knowledgePractice.knowledgePracticeProjection(o.filter || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'knowledgePractice.practiceStatus': function () {
      return (WA.knowledgePractice && WA.knowledgePractice.PRACTICE_STATUS) ? WA.knowledgePractice.PRACTICE_STATUS.slice() : [];
    },
    // v2.233.0 (EXV4-7): riskPooling 地方风险分担与保险式互助
    'riskPooling.declareRiskPool': function (o) {
      if (typeof WA.riskPooling.declareRiskPool === 'function') {
        return WA.riskPooling.declareRiskPool(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'riskPooling.pledgeMutualFund': function (o) {
      if (typeof WA.riskPooling.pledgeMutualFund === 'function') {
        return WA.riskPooling.pledgeMutualFund(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'riskPooling.claimMutualRelief': function (o) {
      if (typeof WA.riskPooling.claimMutualRelief === 'function') {
        return WA.riskPooling.claimMutualRelief(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'riskPooling.disputeReliefClaim': function (o) {
      if (typeof WA.riskPooling.disputeReliefClaim === 'function') {
        return WA.riskPooling.disputeReliefClaim(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'riskPooling.riskPoolingProjection': function (o) {
      if (typeof WA.riskPooling.riskPoolingProjection === 'function') {
        return WA.riskPooling.riskPoolingProjection(o.poolId || (o.spec && o.spec.poolId) || (typeof o === 'string' ? o : null));
      }
      return { ok: false, reason: 'unsupported' };
    },
    'riskPooling.poolStatus': function () {
      return (WA.riskPooling && WA.riskPooling.POOL_STATUS) ? WA.riskPooling.POOL_STATUS.slice() : [];
    },
    // v2.233.0 (EXV4-8): roleConflict 地方身份与多重归属冲突
    'roleConflict.registerAffiliationObligation': function (o) {
      if (typeof WA.roleConflict.registerAffiliationObligation === 'function') {
        return WA.roleConflict.registerAffiliationObligation(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'roleConflict.detectRoleConflict': function (o) {
      if (typeof WA.roleConflict.detectRoleConflict === 'function') {
        return WA.roleConflict.detectRoleConflict(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'roleConflict.resolveConflictStance': function (o) {
      if (typeof WA.roleConflict.resolveConflictStance === 'function') {
        return WA.roleConflict.resolveConflictStance(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'roleConflict.viewConflictPerception': function (o) {
      if (typeof WA.roleConflict.viewConflictPerception === 'function') {
        return WA.roleConflict.viewConflictPerception(o.conflictId, o.viewerGroup);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'roleConflict.roleConflictProjection': function (o) {
      if (typeof WA.roleConflict.roleConflictProjection === 'function') {
        return WA.roleConflict.roleConflictProjection(o.who || (o.spec && o.spec.who) || (typeof o === 'string' ? o : null));
      }
      return { ok: false, reason: 'unsupported' };
    },
    'roleConflict.resolutionStances': function () {
      return (WA.roleConflict && WA.roleConflict.RESOLUTION_STANCES) ? WA.roleConflict.RESOLUTION_STANCES.slice() : [];
    },
    'roleConflict.conflictSeverity': function () {
      return (WA.roleConflict && WA.roleConflict.CONFLICT_SEVERITY) ? WA.roleConflict.CONFLICT_SEVERITY.slice() : [];
    },
    // v2.233.0 (EXV4-9): institutionalInertia 世代交替与制度惯性
    'institutionalInertia.establishCharter': function (o) {
      if (typeof WA.institutionalInertia.establishCharter === 'function') {
        return WA.institutionalInertia.establishCharter(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'institutionalInertia.triggerSuccessionHandover': function (o) {
      if (typeof WA.institutionalInertia.triggerSuccessionHandover === 'function') {
        return WA.institutionalInertia.triggerSuccessionHandover(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'institutionalInertia.resolveSuccessionPath': function (o) {
      if (typeof WA.institutionalInertia.resolveSuccessionPath === 'function') {
        return WA.institutionalInertia.resolveSuccessionPath(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'institutionalInertia.auditInstitutionalDecay': function (o) {
      if (typeof WA.institutionalInertia.auditInstitutionalDecay === 'function') {
        return WA.institutionalInertia.auditInstitutionalDecay(o.charterId, o.envConditions || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'institutionalInertia.institutionalInertiaProjection': function (o) {
      if (typeof WA.institutionalInertia.institutionalInertiaProjection === 'function') {
        return WA.institutionalInertia.institutionalInertiaProjection(o.charterId || (o.spec && o.spec.charterId) || (typeof o === 'string' ? o : null));
      }
      return { ok: false, reason: 'unsupported' };
    },
    'institutionalInertia.successionPaths': function () {
      return (WA.institutionalInertia && WA.institutionalInertia.SUCCESSION_PATHS) ? WA.institutionalInertia.SUCCESSION_PATHS.slice() : [];
    },
    'institutionalInertia.charterStatus': function () {
      return (WA.institutionalInertia && WA.institutionalInertia.CHARTER_STATUS) ? WA.institutionalInertia.CHARTER_STATUS.slice() : [];
    },
    // v2.234.0 (Living World V5): 真实世界自治演化与偶遇痕迹路由
    'livingWorld.autonomousTick': function (o) {
      if (typeof WA.livingWorld.autonomousTick === 'function') {
        return WA.livingWorld.autonomousTick(o.opts || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'livingWorld.detectEncounters': function (o) {
      if (typeof WA.livingWorld.detectEncounters === 'function') {
        return WA.livingWorld.detectEncounters(o.playerPlace || (o.spec && o.spec.playerPlace) || (typeof o === 'string' ? o : ''));
      }
      return { ok: false, reason: 'unsupported' };
    },
    'livingWorld.leaveTrace': function (o) {
      if (typeof WA.livingWorld.leaveTrace === 'function') {
        return WA.livingWorld.leaveTrace(o.place, o.who, o.detail);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'livingWorld.registerRoutine': function (o) {
      if (typeof WA.livingWorld.registerRoutine === 'function') {
        return WA.livingWorld.registerRoutine(o.name, o.routine, o.occupation);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'livingWorld.occupationalRoutines': function () {
      return (WA.livingWorld && WA.livingWorld.OCCUPATIONAL_ROUTINES) ? Object.assign({}, WA.livingWorld.OCCUPATIONAL_ROUTINES) : {};
    },
    'livingWorld.deflectTrajectory': function (o) {
      if (typeof WA.livingWorld.deflectTrajectory === 'function') {
        return WA.livingWorld.deflectTrajectory(o.name, o.newGoal, o.newDoing, o.options || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'livingWorld.consolidateLivingMemory': function (o) {
      if (typeof WA.livingWorld.consolidateLivingMemory === 'function') {
        return WA.livingWorld.consolidateLivingMemory(o.name, o.memoryText || o.memory);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'livingWorld.propagateRipple': function (o) {
      if (typeof WA.livingWorld.propagateRipple === 'function') {
        return WA.livingWorld.propagateRipple(o.sourceWho, o.cause, o.impactType, o.options || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'livingWorld.recordRelationalDebt': function (o) {
      if (typeof WA.livingWorld.recordRelationalDebt === 'function') {
        return WA.livingWorld.recordRelationalDebt(o.fromWho, o.toWho, o.debtType, o.amount, o.reason);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.239.0 (OPV5-2): 人情势能债务在行动桌的折现兑付
    'livingWorld.redeemDebt': function (o) {
      if (typeof WA.livingWorld.redeemDebt === 'function') {
        return WA.livingWorld.redeemDebt(o.fromWho || o.who, o.toWho || o.to, o.debtType || o.type, o.amount, o.reason);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.239.0 (OPV5-3): 空间痕迹清理/掩盖
    'livingWorld.cleanTrace': function (o) {
      if (typeof WA.livingWorld.cleanTrace === 'function') {
        return WA.livingWorld.cleanTrace(o.place, o.traceId || o.who, o.options || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.239.0 (OPV5-3): 调查系统留痕提取证据与线索流程
    'investigation.register': function (o) { return WA.investigation.register(o.spec || o); },
    'investigation.investigate': function (o) { return WA.investigation.investigate(o.clueId || o.id, o.person || o.who, o.options || o); },
    'investigation.checkEvidence': function (o) { return WA.investigation.checkEvidence(o.clueId || o.id); },
    'investigation.reveal': function (o) { return WA.investigation.reveal(o.clueId || o.id, o.person || o.who); },
    'investigation.extractFromTrace': function (o) {
      if (typeof WA.investigation.extractFromTrace === 'function') {
        return WA.investigation.extractFromTrace(o.traceObj || o.trace, o.person || o.who, o.options || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.240.0 (OPV5-4): 阶梯物价与黑市暗盘查询
    'livingWorld.getTierPrice': function (o) {
      if (typeof WA.livingWorld.getTierPrice === 'function') {
        return WA.livingWorld.getTierPrice(o.baseType || o.type, o.tier, o.place);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.241.0 (OPV5-7): 空间微气候与环境阻力查询
    'weather.getMicroclimate': function (o) {
      if (WA.weather && typeof WA.weather.getMicroclimate === 'function') {
        return WA.weather.getMicroclimate(o.place, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.241.0 (OPV5-8): 长时作息时间积分散步与体力自愈结算
    'livingWorld.integrateLongRest': function (o) {
      if (typeof WA.livingWorld.integrateLongRest === 'function') {
        return WA.livingWorld.integrateLongRest(o.name || o.who, o.elapsedHours || o.hours, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.242.0 (EXV5-1): 流言拓扑变异与恐慌放大
    'rumor.mutateAndAmplify': function (o) {
      if (WA.rumor && typeof WA.rumor.mutateAndAmplify === 'function') {
        return WA.rumor.mutateAndAmplify(o.text || o.rumor, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.242.0 (EXV5-2): 据点暴露度与安全屋废弃
    'operations.trackSafehouseExposure': function (o) {
      if (WA.operations && typeof WA.operations.trackSafehouseExposure === 'function') {
        return WA.operations.trackSafehouseExposure(o.id || o.safehouseId, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.242.0 (EXV5-3): 创伤印记与应激核验
    'affect.checkTraumaTrigger': function (o) {
      if (WA.affect && typeof WA.affect.checkTraumaTrigger === 'function') {
        return WA.affect.checkTraumaTrigger(o.person || o.who, o.trigger || o.contextTrigger);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.243.0 (EXV5-4): 官僚汇报时滞与避责虚报
    'institutionalInertia.submitBureaucraticReport': function (o) {
      if (WA.institutionalInertia && typeof WA.institutionalInertia.submitBureaucraticReport === 'function') {
        return WA.institutionalInertia.submitBureaucraticReport(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.243.0 (EXV5-5): 影子配给与黑市地下交换
    'freight.issueShadowRation': function (o) {
      if (WA.freight && typeof WA.freight.issueShadowRation === 'function') {
        return WA.freight.issueShadowRation(o.person || o.who, o.resource || o.resourceKey, o.amount, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.285.0 (OPV12-3): 守恒货运发运与改道
    'freight.dispatch': function (o) {
      if (WA.freight && typeof WA.freight.dispatch === 'function') {
        return WA.freight.dispatch(o.routeId || o.id, o.from, o.resource || o.resourceKey, o.qty || o.amount, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'freight.reroute': function (o) {
      if (WA.freight && typeof WA.freight.reroute === 'function') {
        return WA.freight.reroute(o.shipmentId || o.id, o.newRouteId || o.routeId, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'freight.cancel': function (o) {
      if (WA.freight && typeof WA.freight.cancel === 'function') {
        return WA.freight.cancel(o.shipmentId || o.id, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'freight.arrive': function (o) {
      if (WA.freight && typeof WA.freight.arrive === 'function') {
        return WA.freight.arrive(o.shipmentId || o.id, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'economy.buy': function (o) {
      if (WA.economy && typeof WA.economy.buy === 'function') {
        return WA.economy.buy(o.place, o.resource || o.resourceKey, o.qty || o.amount, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'economy.craft': function (o) {
      if (WA.economy && typeof WA.economy.craft === 'function') {
        return WA.economy.craft(o.place, o.recipe, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.243.0 (EXV5-6): 因果溯源与追责纠缠决策树
    'causal.addChain': function (o) { return WA.causal.addChain(o.spec || o); },
    'causal.settle': function (o) { return WA.causal.settle(o.chainId || o.id, o.resolution, o); },
    'causal.traceLiabilityTree': function (o) {
      if (WA.causal && typeof WA.causal.traceLiabilityTree === 'function') {
        return WA.causal.traceLiabilityTree(o.incidentKey || o.key, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.244.0 (EXV5-7): 世代意志托付与绝笔契约
    'socialLegacy.entrustDeathbedPact': function (o) {
      if (WA.socialLegacy && typeof WA.socialLegacy.entrustDeathbedPact === 'function') {
        return WA.socialLegacy.entrustDeathbedPact(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'socialLegacy.fulfillDeathbedPact': function (o) {
      if (WA.socialLegacy && typeof WA.socialLegacy.fulfillDeathbedPact === 'function') {
        return WA.socialLegacy.fulfillDeathbedPact(o.pactId, o.trustee, o.outcome);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.244.0 (EXV5-8): 玩家无声物理回波与微痕迹
    'livingWorld.recordSilentEcho': function (o) {
      if (typeof WA.livingWorld.recordSilentEcho === 'function') {
        return WA.livingWorld.recordSilentEcho(o.place, o.durationRounds || o.rounds, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.244.0 (EXV5-9): 世界脉搏自主偶发奇点突变
    'evolution.triggerSingularityEruption': function (o) {
      if (WA.evolution && typeof WA.evolution.triggerSingularityEruption === 'function') {
        return WA.evolution.triggerSingularityEruption(o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'livingWorld.dayPeriods': function () {
      return (WA.livingWorld && WA.livingWorld.DAY_PERIODS) ? WA.livingWorld.DAY_PERIODS.slice() : [];
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
    'phaseTransition.simulateIncidentStress': function (o) { return WA.phaseTransition.simulateIncidentStress(o.placeId, o.incidentType); },
    'phaseTransition.executeTransitionRoute': function (o) { return WA.phaseTransition.executeTransitionRoute(o.placeId, o.targetLayout, o); },
    'travel.move': function (o) { return WA.act.add(o.who, { kind: 'move', goalId: o.goalId, from: o.from, to: o.to, place: o.place, text: o.text }); },
    // OPV12-4 / 场景3：旅行、日程计划与区域事件路由
    'world.depart': function (o) { return WA.world ? WA.world.depart(o.person || o.who, o.from, o.to, o.at) : { ok: false, reason: 'world-missing' }; },
    'world.arrive': function (o) { return WA.world ? WA.world.arrive(o.person || o.who, o.at) : { ok: false, reason: 'world-missing' }; },
    'world.advance': function (o) { return WA.world ? WA.world.advance(o.minutes || o.step, o) : { ok: false, reason: 'world-missing' }; },
    'plan.expand': function (o) { return WA.plan ? WA.plan.expand(o.person || o.who, o.goalId, o.steps) : { ok: false, reason: 'plan-missing' }; },
    'plan.advance': function (o) { return WA.plan ? WA.plan.advance(o.person || o.who) : { ok: false, reason: 'plan-missing' }; },
    'plan.settle': function (o) { return WA.plan ? WA.plan.settle(o.person || o.who, o.outcome, o) : { ok: false, reason: 'plan-missing' }; },
    'plan.rechoose': function (o) { return WA.plan ? WA.plan.rechoose(o.person || o.who, o.steps) : { ok: false, reason: 'plan-missing' }; },
    'region.occur': function (o) { return WA.region ? WA.region.occur(o.name || o.place, o.kind, o) : { ok: false, reason: 'region-missing' }; },
    'region.deliver': function (o) { return WA.region ? WA.region.deliver(o.eventId || o.id, o) : { ok: false, reason: 'region-missing' }; },
    // v2.302.0 (OPV13-3): 守恒通胀与黑市走私网络
    'contraband.assessInflation': function (o) {
      if (WA.contraband && typeof WA.contraband.assessInflation === 'function') {
        return WA.contraband.assessInflation(o.place, o.resource || o.resourceKey, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'contraband.openRoute': function (o) {
      if (WA.contraband && typeof WA.contraband.openRoute === 'function') {
        return WA.contraband.openRoute(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'contraband.smuggle': function (o) {
      if (WA.contraband && typeof WA.contraband.smuggle === 'function') {
        return WA.contraband.smuggle(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'contraband.inspectBust': function (o) {
      if (WA.contraband && typeof WA.contraband.inspectBust === 'function') {
        return WA.contraband.inspectBust(o.routeId || o.id, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.302.0 (OPV13-4): 险道季节阻断与极端天堑
    'terrainHazard.assessPassability': function (o) {
      if (WA.terrainHazard && typeof WA.terrainHazard.assessPassability === 'function') {
        return WA.terrainHazard.assessPassability(o.from, o.to, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'terrainHazard.blockChannel': function (o) {
      if (WA.terrainHazard && typeof WA.terrainHazard.blockChannel === 'function') {
        return WA.terrainHazard.blockChannel(o.from, o.to, o.reason, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'terrainHazard.unblockChannel': function (o) {
      if (WA.terrainHazard && typeof WA.terrainHazard.unblockChannel === 'function') {
        return WA.terrainHazard.unblockChannel(o.from, o.to);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'terrainHazard.forceTraverse': function (o) {
      if (WA.terrainHazard && typeof WA.terrainHazard.forceTraverse === 'function') {
        return WA.terrainHazard.forceTraverse(o.who || o.person, o.from, o.to, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.302.0 (EXV13-5 & OPV13-5): 传闻地理漂移失真与情报勘验
    'rumor.driftRelay': function (o) {
      if (WA.rumor && typeof WA.rumor.driftRelay === 'function') {
        return WA.rumor.driftRelay(o.spec || o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'rumor.inspectDrift': function (o) {
      if (WA.rumor && typeof WA.rumor.inspectDrift === 'function') {
        return WA.rumor.inspectDrift(o.rumorId || o.id);
      }
      return { ok: false, reason: 'unsupported' };
    },
    'rumor.refuteDrift': function (o) {
      if (WA.rumor && typeof WA.rumor.refuteDrift === 'function') {
        return WA.rumor.refuteDrift(o.rumorId || o.id, o);
      }
      return { ok: false, reason: 'unsupported' };
    },
    // v2.303.0 (OPV13-2): 复杂事件伏笔长周期生命树
    'foreshadowTree.plant': function (o) {
      if (WA.foreshadowTree && typeof WA.foreshadowTree.plant === 'function') return WA.foreshadowTree.plant(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'foreshadowTree.ferment': function (o) {
      if (WA.foreshadowTree && typeof WA.foreshadowTree.ferment === 'function') return WA.foreshadowTree.ferment(o.id || o.treeId, o);
      return { ok: false, reason: 'unsupported' };
    },
    'foreshadowTree.distort': function (o) {
      if (WA.foreshadowTree && typeof WA.foreshadowTree.distort === 'function') return WA.foreshadowTree.distort(o.id || o.treeId, o);
      return { ok: false, reason: 'unsupported' };
    },
    'foreshadowTree.harvest': function (o) {
      if (WA.foreshadowTree && typeof WA.foreshadowTree.harvest === 'function') return WA.foreshadowTree.harvest(o.id || o.treeId, o);
      return { ok: false, reason: 'unsupported' };
    },
    'foreshadowTree.decay': function (o) {
      if (WA.foreshadowTree && typeof WA.foreshadowTree.decay === 'function') return WA.foreshadowTree.decay(o.id || o.treeId, o);
      return { ok: false, reason: 'unsupported' };
    },
    'foreshadowTree.get': function (o) {
      if (WA.foreshadowTree && typeof WA.foreshadowTree.get === 'function') return WA.foreshadowTree.get(o.id || o.treeId);
      return null;
    },
    // v2.303.0 (OPV13-6): 叙事潜台词解码与情境张力动态调节
    'subtextTension.assess': function (o) {
      if (WA.subtextTension && typeof WA.subtextTension.assessTension === 'function') return WA.subtextTension.assessTension(o.actorA || o.speaker, o.actorB || o.listener, o);
      return { ok: false, reason: 'unsupported' };
    },
    'subtextTension.encode': function (o) {
      if (WA.subtextTension && typeof WA.subtextTension.encodeSubtext === 'function') return WA.subtextTension.encodeSubtext(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'subtextTension.decode': function (o) {
      if (WA.subtextTension && typeof WA.subtextTension.decodeSubtext === 'function') return WA.subtextTension.decodeSubtext(o.pack || o.subtextPack, o.observer || o.who, o.skill || o.insightSkill);
      return { ok: false, reason: 'unsupported' };
    },
    // v2.303.0 (EXV13-2): 角色自传性回忆重构与心路沙盘
    'actor.triggerEpiphany': function (o) {
      if (WA.autobiographyEpiphany && typeof WA.autobiographyEpiphany.triggerEpiphany === 'function') return WA.autobiographyEpiphany.triggerEpiphany(o.actorId || o.who, o.eventId, o.newInterpretation, o.rationale, o);
      return { ok: false, reason: 'unsupported' };
    },
    'actor.viewAutobiography': function (o) {
      if (WA.autobiographyEpiphany && typeof WA.autobiographyEpiphany.viewAutobiography === 'function') return WA.autobiographyEpiphany.viewAutobiography(o.actorId || o.who);
      return { ok: false, reason: 'unsupported' };
    },
    // v2.303.0 (EXV13-3): 历史大事件跨阵营文献对照档案
    'chronicle.archiveFactionRecord': function (o) {
      if (WA.factionChronicle && typeof WA.factionChronicle.archiveFactionRecord === 'function') return WA.factionChronicle.archiveFactionRecord(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'chronicle.comparePerspectives': function (o) {
      if (WA.factionChronicle && typeof WA.factionChronicle.comparePerspectives === 'function') return WA.factionChronicle.comparePerspectives(o.eventId || o.id);
      return { ok: false, reason: 'unsupported' };
    },
    'chronicle.findExemptionClause': function (o) {
      if (WA.factionChronicle && typeof WA.factionChronicle.findExemptionClause === 'function') return WA.factionChronicle.findExemptionClause(o.eventId || o.id, o.keyword);
      return { ok: false, reason: 'unsupported' };
    },
    // v2.303.0 (EXV13-4): 世代家族盟约与超长线契约违约连锁
    'lineage.bindLegacyOath': function (o) {
      if (WA.legacyOath && typeof WA.legacyOath.bindLegacyOath === 'function') return WA.legacyOath.bindLegacyOath(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'lineage.enforceInheritedDebt': function (o) {
      if (WA.legacyOath && typeof WA.legacyOath.enforceInheritedDebt === 'function') return WA.legacyOath.enforceInheritedDebt(o.oathId || o.id, o.heirId || o.who, o);
      return { ok: false, reason: 'unsupported' };
    },
    'lineage.getOath': function (o) {
      if (WA.legacyOath && typeof WA.legacyOath.getOath === 'function') return WA.legacyOath.getOath(o.oathId || o.id);
      return null;
    },
    // v2.304.0 (EXV13-6): 城市风俗禁忌与集体祭典狂欢日
    'folklore.proclaimTaboo': function (o) {
      if (WA.cityFolklore && typeof WA.cityFolklore.proclaimTaboo === 'function') return WA.cityFolklore.proclaimTaboo(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'folklore.checkTabooViolation': function (o) {
      if (WA.cityFolklore && typeof WA.cityFolklore.checkTabooViolation === 'function') return WA.cityFolklore.checkTabooViolation(o.locationId || o.location, o.actionType || o.action, o);
      return { ok: false, reason: 'unsupported' };
    },
    'folklore.maskWithFestivity': function (o) {
      if (WA.cityFolklore && typeof WA.cityFolklore.maskWithFestivity === 'function') return WA.cityFolklore.maskWithFestivity(o.noiseLevel || o.noise, o.festivityLoudness || o.loudness, o);
      return { ok: false, reason: 'unsupported' };
    },
    'folklore.getTaboo': function (o) {
      if (WA.cityFolklore && typeof WA.cityFolklore.getTaboo === 'function') return WA.cityFolklore.getTaboo(o.tabooId || o.id);
      return null;
    },
    // v2.304.0 (OPV13-8): 世界内期刊舆论发酵与社会思潮推动
    'ideology.publishArticle': function (o) {
      if (WA.periodicalIdeology && typeof WA.periodicalIdeology.publishIdeologyArticle === 'function') return WA.periodicalIdeology.publishIdeologyArticle(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'ideology.assessSocialTide': function (o) {
      if (WA.periodicalIdeology && typeof WA.periodicalIdeology.assessSocialTide === 'function') return WA.periodicalIdeology.assessSocialTide(o.targetClass || o.class, o.ideologyTopic || o.topic);
      return { ok: false, reason: 'unsupported' };
    },
    'ideology.triggerCollectiveAction': function (o) {
      if (WA.periodicalIdeology && typeof WA.periodicalIdeology.triggerCollectiveAction === 'function') return WA.periodicalIdeology.triggerCollectiveAction(o.actionSpec || o);
      return { ok: false, reason: 'unsupported' };
    },
    // v2.305.0 (OPV13-9): 中央场景行动桌全生命周期挂钩与自动编排心跳
    'actionDesk.orchestrate': function (o) {
      return orchestrate(o);
    },
    // v2.305.0 (EXV13-8): 决策反事实沙盘深度推演与回溯对照
    'counterfactual.forkRehearsal': function (o) {
      if (WA.counterfactualSandbox && typeof WA.counterfactualSandbox.forkRehearsal === 'function') return WA.counterfactualSandbox.forkRehearsal(o);
      return { ok: false, reason: 'unsupported' };
    },
    'counterfactual.simulateBranch': function (o) {
      if (WA.counterfactualSandbox && typeof WA.counterfactualSandbox.simulateBranch === 'function') return WA.counterfactualSandbox.simulateBranch(o.branchId, o.turnsToSimulate || o.turns, o);
      return { ok: false, reason: 'unsupported' };
    },
    'counterfactual.diffOutcomes': function (o) {
      if (WA.counterfactualSandbox && typeof WA.counterfactualSandbox.diffOutcomes === 'function') return WA.counterfactualSandbox.diffOutcomes(o.branchId);
      return { ok: false, reason: 'unsupported' };
    },
    'counterfactual.getBranch': function (o) {
      if (WA.counterfactualSandbox && typeof WA.counterfactualSandbox.getBranch === 'function') return WA.counterfactualSandbox.getBranch(o.branchId);
      return null;
    },
    // v2.305.0 (EXV13-9): 文明阶段更迭时的技术遗失与失落遗物谱系
    'relic.discoverRelic': function (o) {
      if (WA.civilizationRelic && typeof WA.civilizationRelic.discoverRelic === 'function') return WA.civilizationRelic.discoverRelic(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'relic.reverseEngineer': function (o) {
      if (WA.civilizationRelic && typeof WA.civilizationRelic.reverseEngineer === 'function') return WA.civilizationRelic.reverseEngineer(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'relic.getRelic': function (o) {
      if (WA.civilizationRelic && typeof WA.civilizationRelic.getRelic === 'function') return WA.civilizationRelic.getRelic(o.relicId || o.id);
      return null;
    },
    // v2.306.0 (EXV13-7): 潜意识动作与下意识心理微反应
    'actor.registerIdiosyncrasy': function (o) {
      if (WA.idiosyncrasy && typeof WA.idiosyncrasy.registerIdiosyncrasy === 'function') return WA.idiosyncrasy.registerIdiosyncrasy(o.actorId || o.who || o.actor, o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'actor.observeSubconscious': function (o) {
      if (WA.idiosyncrasy && typeof WA.idiosyncrasy.observeSubconscious === 'function') return WA.idiosyncrasy.observeSubconscious(o.observerId || o.observer, o.targetId || o.target, o);
      return { ok: false, reason: 'unsupported' };
    },
    'society.coordinate': function (o) {
      if (WA.liaison && typeof WA.liaison.coordinate === 'function') return WA.liaison.coordinate(o);
      return { ok: false, reason: 'unsupported' };
    },
    'actor.sendWhisper': function (o) {
      if (WA.whisperBackchannel && typeof WA.whisperBackchannel.sendWhisper === 'function') return WA.whisperBackchannel.sendWhisper(o.senderId || o.sender, o.recipientId || o.recipient, o);
      return { ok: false, reason: 'unsupported' };
    },
    // v2.330.0 (OPV16-1~9 & EXV16-1~8): WorldAxis V16 场景行动桌路由接线
    'bio.applyHazardLoad': function (o) {
      if (WA.metabolism && typeof WA.metabolism.applyHazardLoad === 'function') return WA.metabolism.applyHazardLoad(o.actorId || o.who, o.hazardSeverity, o.durationMinutes || o.duration, o.opts || o);
      return { ok: false, reason: 'metabolism-unavailable' };
    },
    'bus.interrupt': function (o) {
      if (WA.cascadeBus && typeof WA.cascadeBus.interrupt === 'function') return WA.cascadeBus.interrupt(o.targetLayer, o.interruptEvent, o.opts || o);
      return { ok: false, reason: 'cascadeBus-unavailable' };
    },
    'geo.resolveKinetic': function (o) {
      if (WA.spatialConflict && typeof WA.spatialConflict.resolveKinetic === 'function') return WA.spatialConflict.resolveKinetic(o.actorA, o.actorB, o.kineticA || o.speedA, o.kineticB || o.speedB, o.opts || o);
      return { ok: false, reason: 'spatialConflict-unavailable' };
    },
    'geo.evolveTrace': function (o) {
      if (WA.spatialTrace && typeof WA.spatialTrace.evolveTrace === 'function') return WA.spatialTrace.evolveTrace(o.traceId, o.mediumType || o.medium, o.environmentInterference || o.interference, o.opts || o);
      return { ok: false, reason: 'spatialTrace-unavailable' };
    },
    'item.forceInspect': function (o) {
      if (WA.personalInventory && typeof WA.personalInventory.forceInspect === 'function') return WA.personalInventory.forceInspect(o.targetActorId || o.target || o.who, o.inspectorSuspicion || o.suspicion, o.opts || o);
      return { ok: false, reason: 'personalInventory-unavailable' };
    },
    'stealth.checkBlindspot': function (o) {
      if (WA.socialEncounter && typeof WA.socialEncounter.checkBlindspot === 'function') return WA.socialEncounter.checkBlindspot(o.stalkerId || o.who, o.targetId || o.target, o.relativeAngle || o.angle, o.opts || o);
      return { ok: false, reason: 'socialEncounter-unavailable' };
    },
    'routine.deviate': function (o) {
      if (WA.universalRoutine && typeof WA.universalRoutine.deviate === 'function') return WA.universalRoutine.deviate(o.actorId || o.who, o.stressLevel || o.stress, o.cause, o.opts || o);
      return { ok: false, reason: 'universalRoutine-unavailable' };
    },
    'bridge.atomicTransact': function (o) {
      if (WA.bridge && typeof WA.bridge.atomicTransact === 'function') return WA.bridge.atomicTransact(o.transactionId || o.txId, o.steps, o.opts || o);
      return { ok: false, reason: 'bridge-unavailable' };
    },
    'sys.breakDeadlock': function (o) {
      if (WA.healthPreflight && typeof WA.healthPreflight.breakDeadlock === 'function') return WA.healthPreflight.breakDeadlock(o.cycleWaitGraph || o.graph, o.timeoutTicks || o.timeout, o.opts || o);
      return { ok: false, reason: 'healthPreflight-unavailable' };
    },
    'env.simulatePhase': function (o) {
      if (WA.microclimatePhase && typeof WA.microclimatePhase.simulatePhase === 'function') return WA.microclimatePhase.simulatePhase(o);
      return { ok: false, reason: 'microclimatePhase-unavailable' };
    },
    'bio.metabolizeToxin': function (o) {
      if (WA.toxicMetabolism && typeof WA.toxicMetabolism.metabolize === 'function') return WA.toxicMetabolism.metabolize(o.actorId || o.who, o.elapsedMinutes || o.duration);
      return { ok: false, reason: 'toxicMetabolism-unavailable' };
    },
    'bio.applyToxin': function (o) {
      if (WA.toxicMetabolism && typeof WA.toxicMetabolism.applyToxin === 'function') return WA.toxicMetabolism.applyToxin(o.actorId || o.who, o.toxinType, o.dose, o.opts || o);
      return { ok: false, reason: 'toxicMetabolism-unavailable' };
    },
    'bio.administerAntidote': function (o) {
      if (WA.toxicMetabolism && typeof WA.toxicMetabolism.administerAntidote === 'function') return WA.toxicMetabolism.administerAntidote(o.actorId || o.who, o.antidotePower, o.targetToxinType);
      return { ok: false, reason: 'toxicMetabolism-unavailable' };
    },
    'geo.broadcastSignal': function (o) {
      if (WA.pyroTelecom && typeof WA.pyroTelecom.broadcastSignal === 'function') return WA.pyroTelecom.broadcastSignal(o);
      return { ok: false, reason: 'pyroTelecom-unavailable' };
    },
    'market.smuggleContraband': function (o) {
      if (WA.contrabandPipeline && typeof WA.contrabandPipeline.smuggleContraband === 'function') return WA.contrabandPipeline.smuggleContraband(o);
      return { ok: false, reason: 'contrabandPipeline-unavailable' };
    },
    'geo.triggerStampede': function (o) {
      if (WA.crowdPanic && typeof WA.crowdPanic.triggerStampede === 'function') return WA.crowdPanic.triggerStampede(o);
      return { ok: false, reason: 'crowdPanic-unavailable' };
    },
    'society.crossExamine': function (o) {
      if (WA.veracityArbitration && typeof WA.veracityArbitration.crossExamine === 'function') return WA.veracityArbitration.crossExamine(o);
      return { ok: false, reason: 'veracityArbitration-unavailable' };
    },
    'item.applyStress': function (o) {
      if (WA.gearWear && typeof WA.gearWear.applyStress === 'function') return WA.gearWear.applyStress(o.gearId || o.itemId, o.stressLoad || o.load, o.stressType || o.type);
      return { ok: false, reason: 'gearWear-unavailable' };
    },
    'item.repairGear': function (o) {
      if (WA.gearWear && typeof WA.gearWear.repairGear === 'function') return WA.gearWear.repairGear(o.gearId || o.itemId, o.repairPoints || o.points);
      return { ok: false, reason: 'gearWear-unavailable' };
    },
    'combat.resolveCover': function (o) {
      if (WA.coverBallistics && typeof WA.coverBallistics.resolveCoverProtection === 'function') return WA.coverBallistics.resolveCoverProtection(o);
      return { ok: false, reason: 'coverBallistics-unavailable' };
    },
    // ── V17 新增动作调度路由 ──
    'bio.applyPsychicStress': function (o) {
      if (WA.metabolism && typeof WA.metabolism.applyPsychicStress === 'function') return WA.metabolism.applyPsychicStress(o.actorId || o.who, o.shockLevel || o.shock, o.cause, o.opts || o);
      return { ok: false, reason: 'metabolism-unavailable' };
    },
    'mind.inflictTrauma': function (o) {
      if (WA.psycheTrauma && typeof WA.psycheTrauma.inflictTrauma === 'function') return WA.psycheTrauma.inflictTrauma(o.actorId || o.who, o.shockLevel || o.shock, o.traumaType || o.type, o.sourceId || o.source, o.opts || o);
      return { ok: false, reason: 'psycheTrauma-unavailable' };
    },
    'mind.triggerBlackening': function (o) {
      if (WA.psycheTrauma && typeof WA.psycheTrauma.triggerBlackening === 'function') return WA.psycheTrauma.triggerBlackening(o.actorId || o.who, o.obsessionTarget || o.target, o.cause);
      return { ok: false, reason: 'psycheTrauma-unavailable' };
    },
    'mind.soothePsyche': function (o) {
      if (WA.psycheTrauma && typeof WA.psycheTrauma.soothePsyche === 'function') return WA.psycheTrauma.soothePsyche(o.actorId || o.who, o.soothePower || o.power, o.method);
      return { ok: false, reason: 'psycheTrauma-unavailable' };
    },
    'causal.triggerButterfly': function (o) {
      if (WA.butterflyCascade && typeof WA.butterflyCascade.triggerFlutter === 'function') return WA.butterflyCascade.triggerFlutter(o.seedEventId || o.seedId, o.initialEnergy || o.energy, o.targetTopologyChain || o.chain, o.opts || o);
      return { ok: false, reason: 'butterflyCascade-unavailable' };
    },
    'causal.advanceButterfly': function (o) {
      if (WA.butterflyCascade && typeof WA.butterflyCascade.advanceTurn === 'function') return WA.butterflyCascade.advanceTurn(o.stepCount || o.steps || 1);
      return { ok: false, reason: 'butterflyCascade-unavailable' };
    },
    'faction.hatchConspiracy': function (o) {
      if (WA.conspiracyWeaver && typeof WA.conspiracyWeaver.hatchConspiracy === 'function') return WA.conspiracyWeaver.hatchConspiracy(o.cabalId, o.ringleaderId, o.targetAuthorityId, o.members, o.opts || o);
      return { ok: false, reason: 'conspiracyWeaver-unavailable' };
    },
    'faction.advanceCoupPhase': function (o) {
      if (WA.conspiracyWeaver && typeof WA.conspiracyWeaver.advancePhase === 'function') return WA.conspiracyWeaver.advancePhase(o.cabalId, o.phaseName, o.evidence);
      return { ok: false, reason: 'conspiracyWeaver-unavailable' };
    },
    'faction.executeCoup': function (o) {
      if (WA.conspiracyWeaver && typeof WA.conspiracyWeaver.executeCoup === 'function') return WA.conspiracyWeaver.executeCoup(o.cabalId, o.opts || o);
      return { ok: false, reason: 'conspiracyWeaver-unavailable' };
    },
    'faction.unmaskConspiracy': function (o) {
      if (WA.conspiracyWeaver && typeof WA.conspiracyWeaver.unmaskConspiracy === 'function') return WA.conspiracyWeaver.unmaskConspiracy(o.cabalId, o.exposerId, o.proofTraceId);
      return { ok: false, reason: 'conspiracyWeaver-unavailable' };
    },
    'society.forgeIllusion': function (o) {
      if (WA.perceptionManipulation && typeof WA.perceptionManipulation.forgeIllusion === 'function') return WA.perceptionManipulation.forgeIllusion(o.forgerId, o.targetVictimId, o.illusionType, o.payload, o.credibilityScore, o.opts || o);
      return { ok: false, reason: 'perceptionManipulation-unavailable' };
    },
    'society.verifyBelief': function (o) {
      if (WA.perceptionManipulation && typeof WA.perceptionManipulation.verifyBelief === 'function') return WA.perceptionManipulation.verifyBelief(o.victimId, o.illusionId, o.witnessContext);
      return { ok: false, reason: 'perceptionManipulation-unavailable' };
    },
    'world.shiftEpoch': function (o) {
      if (WA.epochTide && typeof WA.epochTide.shiftEpoch === 'function') return WA.epochTide.shiftEpoch(o.epochType, o.severity, o.durationEpochTurns, o.opts || o);
      return { ok: false, reason: 'epochTide-unavailable' };
    },
    'world.advanceEpoch': function (o) {
      if (WA.epochTide && typeof WA.epochTide.advanceEpoch === 'function') return WA.epochTide.advanceEpoch(o.turns);
      return { ok: false, reason: 'epochTide-unavailable' };
    },
    'drama.poseDilemma': function (o) {
      if (WA.moralDilemma && typeof WA.moralDilemma.poseDilemma === 'function') return WA.moralDilemma.poseDilemma(o.dilemmaKey, o.decisionMakerId, o.branchA, o.branchB, o.opts || o);
      return { ok: false, reason: 'moralDilemma-unavailable' };
    },
    'drama.resolveDilemma': function (o) {
      if (WA.moralDilemma && typeof WA.moralDilemma.resolveDilemma === 'function') return WA.moralDilemma.resolveDilemma(o.dilemmaKey, o.chosenBranch, o.rationale);
      return { ok: false, reason: 'moralDilemma-unavailable' };
    },
    'culture.broadcastMeme': function (o) {
      if (WA.ideologyMemetics && typeof WA.ideologyMemetics.broadcastMeme === 'function') return WA.ideologyMemetics.broadcastMeme(o);
      return { ok: false, reason: 'ideologyMemetics-unavailable' };
    },
    'bus.penetrateIntent': function (o) {
      if (WA.cascadeBus && typeof WA.cascadeBus.penetrateIntent === 'function') return WA.cascadeBus.penetrateIntent(o.actorId, o.traumaticTrigger, o.newPrimeDirective, o.weight);
      return { ok: false, reason: 'cascadeBus-unavailable' };
    },
    'drama.primeGun': function (o) {
      if (WA.dramaticTension && typeof WA.dramaticTension.primeChekhovGun === 'function') return WA.dramaticTension.primeChekhovGun(o.gunId, o.anchorEntityId, o.foreshadowText, o.detonationTension, o.opts || o);
      return { ok: false, reason: 'dramaticTension-unavailable' };
    },
    'drama.updateTension': function (o) {
      if (WA.dramaticTension && typeof WA.dramaticTension.updateSceneTension === 'function') return WA.dramaticTension.updateSceneTension(o.tensionDelta, o.cause);
      return { ok: false, reason: 'dramaticTension-unavailable' };
    },
    'drama.detonateGun': function (o) {
      if (WA.dramaticTension && typeof WA.dramaticTension.detonateChekhovGun === 'function') return WA.dramaticTension.detonateChekhovGun(o.gunId, o.opts || o);
      return { ok: false, reason: 'dramaticTension-unavailable' };
    },
    // v2.340.0 (V18): 8 大全新史诗引擎动作路由
    'combat.resolveTacticalClash': function (o) {
      if (WA.tacticalCombat && typeof WA.tacticalCombat.resolveClash === 'function') return WA.tacticalCombat.resolveClash(o);
      return { ok: false, reason: 'tacticalCombat-unavailable' };
    },
    'interrogate.pressInquest': function (o) {
      if (WA.interrogationTell && typeof WA.interrogationTell.pressInquest === 'function') return WA.interrogationTell.pressInquest(o);
      return { ok: false, reason: 'interrogationTell-unavailable' };
    },
    'wild.simulatePredation': function (o) {
      if (WA.ecosystemPredation && typeof WA.ecosystemPredation.simulatePredation === 'function') return WA.ecosystemPredation.simulatePredation(o);
      return { ok: false, reason: 'ecosystemPredation-unavailable' };
    },
    'siege.advanceSiege': function (o) {
      if (WA.siegeAttrition && typeof WA.siegeAttrition.advanceSiege === 'function') return WA.siegeAttrition.advanceSiege(o);
      return { ok: false, reason: 'siegeAttrition-unavailable' };
    },
    'anomaly.inflictCorruption': function (o) {
      if (WA.anomalyMutation && typeof WA.anomalyMutation.inflictCorruption === 'function') return WA.anomalyMutation.inflictCorruption(o);
      return { ok: false, reason: 'anomalyMutation-unavailable' };
    },
    'org.evaluateAscension': function (o) {
      if (WA.bureaucracyAscension && typeof WA.bureaucracyAscension.evaluateAscension === 'function') return WA.bureaucracyAscension.evaluateAscension(o);
      return { ok: false, reason: 'bureaucracyAscension-unavailable' };
    },
    'judicial.conductInquest': function (o) {
      if (WA.judicialInquest && typeof WA.judicialInquest.conductInquest === 'function') return WA.judicialInquest.conductInquest(o);
      return { ok: false, reason: 'judicialInquest-unavailable' };
    },
    'ruin.triggerMechanism': function (o) {
      if (WA.ruinMechanism && typeof WA.ruinMechanism.triggerMechanism === 'function') return WA.ruinMechanism.triggerMechanism(o);
      return { ok: false, reason: 'ruinMechanism-unavailable' };
    },
    // ── v2.400.0（V22 OPV22-2）：补 21 条真写口路由 ─────────────────────────
    //   这 21 条的共同来历：tools/desk-coverage.js 的 wired 档（有入站调用、无入口面）
    //   里，**公开导出成员中确有写口**的那一批。判据不是「名字像写口」，
    //   而是「该成员的传递闭包能到达 transact」（makeWriteJudge 口径），
    //   且必须是 `WA.<ns> = { ... }` 里真实上台面的成员 —— 被同样的判据挡回去的
    //   反例有 toolImport.regional / farfield.run / digest 的 contract-audit 侧，
    //   它们是同文件的内部辅助函数，没有上台面，补路由也调不到。
    //   每条路由只做**转发**：不合成参数、不兜底默认值、不吞 refuse ——
    //   缺项由 owner 自己返回 `{ok:false, reason:'missing-xxx'}`，与本表既有风格一致。
    'vitals.register': function (o) {
      if (WA.vitals && typeof WA.vitals.register === 'function') return WA.vitals.register(o.name || o.who, o);
      return { ok: false, reason: 'vitals-unavailable' };
    },
    'vitals.conceive': function (o) {
      if (WA.vitals && typeof WA.vitals.conceive === 'function') return WA.vitals.conceive(o.name || o.who, o);
      return { ok: false, reason: 'vitals-unavailable' };
    },
    'vitals.know': function (o) {
      if (WA.vitals && typeof WA.vitals.know === 'function') return WA.vitals.know(o.name || o.who, o.level, o.via);
      return { ok: false, reason: 'vitals-unavailable' };
    },
    'vitals.tell': function (o) {
      if (WA.vitals && typeof WA.vitals.tell === 'function') return WA.vitals.tell(o.name || o.who, o.to || o.target, o.via);
      return { ok: false, reason: 'vitals-unavailable' };
    },
    'vitals.endPregnancy': function (o) {
      if (WA.vitals && typeof WA.vitals.endPregnancy === 'function') return WA.vitals.endPregnancy(o.name || o.who, o.reason);
      return { ok: false, reason: 'vitals-unavailable' };
    },
    'vitals.tick': function (o) {
      if (WA.vitals && typeof WA.vitals.tick === 'function') return WA.vitals.tick(o.name || o.who, o.days);
      return { ok: false, reason: 'vitals-unavailable' };
    },
    'vitals.sweep': function (o) {
      if (WA.vitals && typeof WA.vitals.sweep === 'function') return WA.vitals.sweep();
      return { ok: false, reason: 'vitals-unavailable' };
    },
    'affect.setChannel': function (o) {
      if (WA.affect && typeof WA.affect.setChannel === 'function') return WA.affect.setChannel(o.person || o.who, o.spec || o);
      return { ok: false, reason: 'affect-unavailable' };
    },
    'affect.setLoad': function (o) {
      if (WA.affect && typeof WA.affect.setLoad === 'function') return WA.affect.setLoad(o.person || o.who, o.patch || o);
      return { ok: false, reason: 'affect-unavailable' };
    },
    'affect.imprintTrauma': function (o) {
      if (WA.affect && typeof WA.affect.imprintTrauma === 'function') return WA.affect.imprintTrauma(o.person || o.who, o.traumaType, o.triggerKey, o.behavioralConstraint);
      return { ok: false, reason: 'affect-unavailable' };
    },
    'elsewhere.open': function (o) {
      if (WA.elsewhere && typeof WA.elsewhere.open === 'function') return WA.elsewhere.open(o.name, o);
      return { ok: false, reason: 'elsewhere-unavailable' };
    },
    'elsewhere.update': function (o) {
      if (WA.elsewhere && typeof WA.elsewhere.update === 'function') return WA.elsewhere.update(o.name, o.patch || o);
      return { ok: false, reason: 'elsewhere-unavailable' };
    },
    'elsewhere.romance': function (o) {
      if (WA.elsewhere && typeof WA.elsewhere.romance === 'function') return WA.elsewhere.romance(o.name, o.ev || o);
      return { ok: false, reason: 'elsewhere-unavailable' };
    },
    'elsewhere.remove': function (o) {
      if (WA.elsewhere && typeof WA.elsewhere.remove === 'function') return WA.elsewhere.remove(o.name, o.reason);
      return { ok: false, reason: 'elsewhere-unavailable' };
    },
    'foreshadow.track': function (o) {
      if (WA.foreshadow && typeof WA.foreshadow.track === 'function') return WA.foreshadow.track(o.hintId, o.text, o);
      return { ok: false, reason: 'foreshadow-unavailable' };
    },
    'foreshadow.develop': function (o) {
      if (WA.foreshadow && typeof WA.foreshadow.develop === 'function') return WA.foreshadow.develop(o.hintId);
      return { ok: false, reason: 'foreshadow-unavailable' };
    },
    'foreshadow.resolve': function (o) {
      if (WA.foreshadow && typeof WA.foreshadow.resolve === 'function') return WA.foreshadow.resolve(o.hintId, o.eventId);
      return { ok: false, reason: 'foreshadow-unavailable' };
    },
    'foreshadow.recycle': function (o) {
      if (WA.foreshadow && typeof WA.foreshadow.recycle === 'function') return WA.foreshadow.recycle(o.hintId, o.reason);
      return { ok: false, reason: 'foreshadow-unavailable' };
    },
    'horizon.rollLane': function (o) {
      if (WA.horizon && typeof WA.horizon.rollLane === 'function') return WA.horizon.rollLane(o.kind, o);
      return { ok: false, reason: 'horizon-unavailable' };
    },
    'horizon.acceptResult': function (o) {
      if (WA.horizon && typeof WA.horizon.acceptResult === 'function') return WA.horizon.acceptResult(o.kind, o.result);
      return { ok: false, reason: 'horizon-unavailable' };
    },
    'oneShot.dose': function (o) {
      if (WA.oneShotMod && typeof WA.oneShotMod.dose === 'function') return WA.oneShotMod.dose(o);
      return { ok: false, reason: 'oneShotMod-unavailable' };
    },
    'oneShot.advance': function (o) {
      if (WA.oneShotMod && typeof WA.oneShotMod.advance === 'function') return WA.oneShotMod.advance();
      return { ok: false, reason: 'oneShotMod-unavailable' };
    },
    'oneShot.consume': function (o) {
      if (WA.oneShotMod && typeof WA.oneShotMod.consume === 'function') return WA.oneShotMod.consume(o.id);
      return { ok: false, reason: 'oneShotMod-unavailable' };
    },
    'oneShot.flush': function (o) {
      if (WA.oneShotMod && typeof WA.oneShotMod.flush === 'function') return WA.oneShotMod.flush();
      return { ok: false, reason: 'oneShotMod-unavailable' };
    },
    'human.setNeeds': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.setNeeds === 'function') return WA.humanRealism.setNeeds(o.name || o.who, o.patch || o);
      return { ok: false, reason: 'humanRealism-unavailable' };
    },
    'human.consumeRoutine': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.consumeRoutine === 'function') return WA.humanRealism.consumeRoutine(o.name || o.who, o);
      return { ok: false, reason: 'humanRealism-unavailable' };
    },
    'human.recordGrudge': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.recordGrudge === 'function') return WA.humanRealism.recordGrudge(o);
      return { ok: false, reason: 'humanRealism-unavailable' };
    },
    'human.settleGrudge': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.settleGrudge === 'function') return WA.humanRealism.settleGrudge(o.grudgeId || o.id, o);
      return { ok: false, reason: 'humanRealism-unavailable' };
    },
    'human.triggerOutburst': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.triggerOutburst === 'function') return WA.humanRealism.triggerOutburst(o.name || o.who, o);
      return { ok: false, reason: 'humanRealism-unavailable' };
    },
    'human.setExemption': function (o) {
      if (WA.humanRealism && typeof WA.humanRealism.setExemption === 'function') return WA.humanRealism.setExemption(o.name || o.who, o);
      return { ok: false, reason: 'humanRealism-unavailable' };
    },
    'aftermath.triggerIncident': function (o) {
      if (WA.aftermathImpact && typeof WA.aftermathImpact.triggerIncident === 'function') return WA.aftermathImpact.triggerIncident(o);
      return { ok: false, reason: 'aftermathImpact-unavailable' };
    },
    'aftermath.settleRedress': function (o) {
      if (WA.aftermathImpact && typeof WA.aftermathImpact.settleRedress === 'function') return WA.aftermathImpact.settleRedress(o.incidentId || o.id, o);
      return { ok: false, reason: 'aftermathImpact-unavailable' };
    },
    'aftermath.triggerCascadingChain': function (o) {
      if (WA.aftermathImpact && typeof WA.aftermathImpact.triggerCascadingChain === 'function') return WA.aftermathImpact.triggerCascadingChain(o);
      return { ok: false, reason: 'aftermathImpact-unavailable' };
    },
    'aftermath.interveneCascadingChain': function (o) {
      if (WA.aftermathImpact && typeof WA.aftermathImpact.interveneCascadingChain === 'function') return WA.aftermathImpact.interveneCascadingChain(o.chainId || o.id, o.nodeIndex, o.actionSpec || o);
      return { ok: false, reason: 'aftermathImpact-unavailable' };
    },
    'aftermath.advanceCascadingChains': function (o) {
      if (WA.aftermathImpact && typeof WA.aftermathImpact.advanceCascadingChains === 'function') return WA.aftermathImpact.advanceCascadingChains(o.days);
      return { ok: false, reason: 'aftermathImpact-unavailable' };
    },
    'beatLedger.plan': function (o) {
      if (WA.beatLedger && typeof WA.beatLedger.plan === 'function') return WA.beatLedger.plan(o.titles);
      return { ok: false, reason: 'beatLedger-unavailable' };
    },
    'beatLedger.land': function (o) {
      if (WA.beatLedger && typeof WA.beatLedger.land === 'function') return WA.beatLedger.land(o);
      return { ok: false, reason: 'beatLedger-unavailable' };
    },
    'beatLedger.claim': function (o) {
      if (WA.beatLedger && typeof WA.beatLedger.claim === 'function') return WA.beatLedger.claim(o.no);
      return { ok: false, reason: 'beatLedger-unavailable' };
    },
    'beatLedger.transition': function (o) {
      if (WA.beatLedger && typeof WA.beatLedger.transition === 'function') return WA.beatLedger.transition(o);
      return { ok: false, reason: 'beatLedger-unavailable' };
    },
    'coordinate.anchorAdd': function (o) {
      if (WA.coordinate && typeof WA.coordinate.anchorAdd === 'function') return WA.coordinate.anchorAdd(o);
      return { ok: false, reason: 'coordinate-unavailable' };
    },
    'coordinate.capture': function (o) {
      if (WA.coordinate && typeof WA.coordinate.capture === 'function') return WA.coordinate.capture(o);
      return { ok: false, reason: 'coordinate-unavailable' };
    },
    'dream.weave': function (o) {
      if (WA.dream && typeof WA.dream.weave === 'function') return WA.dream.weave(o.op, o.payload);
      return { ok: false, reason: 'dream-unavailable' };
    },
    'dream.archive': function (o) {
      if (WA.dream && typeof WA.dream.archive === 'function') return WA.dream.archive(o.summary, o);
      return { ok: false, reason: 'dream-unavailable' };
    },
    'gauge.create': function (o) {
      if (WA.gauge && typeof WA.gauge.create === 'function') return WA.gauge.create(o.key, o);
      return { ok: false, reason: 'gauge-unavailable' };
    },
    'gauge.step': function (o) {
      if (WA.gauge && typeof WA.gauge.step === 'function') return WA.gauge.step(o.key, o.delta, o.event);
      return { ok: false, reason: 'gauge-unavailable' };
    },
    'ledger.saveCheckpoint': function (o) {
      if (WA.ledger && typeof WA.ledger.saveCheckpoint === 'function') return WA.ledger.saveCheckpoint();
      return { ok: false, reason: 'ledger-unavailable' };
    },
    'ledger.recordChanges': function (o) {
      if (WA.ledger && typeof WA.ledger.recordChanges === 'function') return WA.ledger.recordChanges();
      return { ok: false, reason: 'ledger-unavailable' };
    },
    'beat.report': function (o) {
      if (WA.beatReport && typeof WA.beatReport.report === 'function') return WA.beatReport.report(o);
      return { ok: false, reason: 'beatReport-unavailable' };
    },
    'bonds.setBond': function (o) {
      if (WA.bonds && typeof WA.bonds.setBond === 'function') return WA.bonds.setBond(o.a, o.b, o.types);
      return { ok: false, reason: 'bonds-unavailable' };
    },
    'digest.generate': function (o) {
      if (WA.digest && typeof WA.digest.generate === 'function') return WA.digest.generate();
      return { ok: false, reason: 'digest-unavailable' };
    },
    'pathEcho.record': function (o) {
      if (WA.pathEcho && typeof WA.pathEcho.record === 'function') return WA.pathEcho.record(o.a || o.actual, o.b || o.expected);
      return { ok: false, reason: 'pathEcho-unavailable' };
    },
    'persona.registerAnchor': function (o) {
      if (WA.personaAnchor && typeof WA.personaAnchor.registerAnchor === 'function') return WA.personaAnchor.registerAnchor(o.person || o.who, o.spec || o);
      return { ok: false, reason: 'personaAnchor-unavailable' };
    },
    'rehearsal.preview': function (o) {
      if (WA.rehearsal && typeof WA.rehearsal.preview === 'function') return WA.rehearsal.preview(o.steps, o);
      return { ok: false, reason: 'rehearsal-unavailable' };
    },
    'survival.set': function (o) {
      if (WA.survival && typeof WA.survival.set === 'function') return WA.survival.set(o.who || o.name, o.axes || o);
      return { ok: false, reason: 'survival-unavailable' };
    },
    'weather.setWeather': function (o) {
      if (WA.weather && typeof WA.weather.setWeather === 'function') return WA.weather.setWeather(o.place, o.kind || o.weather);
      return { ok: false, reason: 'weather-unavailable' };
    },
    // ══════════════════════════════════════════════════════════════════════
    // v2.400.0（V22 拓展线 EXV22-1～8）：八项制度性引擎的路由──
    //
    //   为什么必须接到这里（而不是「引擎存在就行」）：
    //   tests/dead-export-gate.js 的判据是「定义文件之外的**产品代码**有零引用」。
    //   八引擎初版只有 EXV22-9 面板读了 `view()`（只读口），机制入口（observeSky /
    //   buildRoute / levySeason …）在产品侧零引用，门禁当场报了 39 项死导出。
    //   那不是误报：「能算但没人叫它算」的引擎就是死的（本仓既有裁决：
    //   新导出必须有真实生产消费点）。而 action-desk 正是本仓「玩家动作→引擎」的
    //   唯一入口（courierDispatch / riskPooling 等 17 组均逐字同形），所以路由就是它们的正当消费点。
    //
    //   因此本段**不**写任何新拒收码：引擎缺席时的归因用已有共享码 `unsupported`
    //   （与上方 riskPooling / rehearsal 同口径），不另造 `<ns>-unavailable` 新码面。
    //   为什么：上方那批 `<ns>-unavailable` 是 v2.380.0 的既有码，已有见证；
    //   本批若新造八个同形新码，就要再走一遍「三面齐走」（码面 / 见证 / 快照），
    //   而它们与已有码的语义**逐字相同**（都是「该引擎没装」）—— 那就是重复码面。
    // ══════════════════════════════════════════════════════════════════════
    'omens.observeSky': function (o) {
      if (WA.celestialOmens && typeof WA.celestialOmens.observeSky === 'function') return WA.celestialOmens.observeSky(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'omens.settle': function (o) {
      if (WA.celestialOmens && typeof WA.celestialOmens.settle === 'function') return WA.celestialOmens.settle(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'postal.buildRoute': function (o) {
      if (WA.postalRelay && typeof WA.postalRelay.buildRoute === 'function') return WA.postalRelay.buildRoute(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'postal.dispatch': function (o) {
      if (WA.postalRelay && typeof WA.postalRelay.dispatchByRelay === 'function') return WA.postalRelay.dispatchByRelay(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'levy.raise': function (o) {
      if (WA.levyCorvee && typeof WA.levyCorvee.levySeason === 'function') return WA.levyCorvee.levySeason(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'funeral.hold': function (o) {
      if (WA.mortuaryRites && typeof WA.mortuaryRites.holdFuneral === 'function') return WA.mortuaryRites.holdFuneral(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'funeral.checkProhibition': function (o) {
      if (WA.mortuaryRites && typeof WA.mortuaryRites.checkProhibition === 'function') return WA.mortuaryRites.checkProhibition(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'attire.wear': function (o) {
      if (WA.sartorialRegalia && typeof WA.sartorialRegalia.attireAs === 'function') return WA.sartorialRegalia.attireAs(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'attire.inspectAtGate': function (o) {
      if (WA.sartorialRegalia && typeof WA.sartorialRegalia.identifyAtGate === 'function') return WA.sartorialRegalia.identifyAtGate(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'match.propose': function (o) {
      if (WA.betrothalAlliance && typeof WA.betrothalAlliance.proposeMatch === 'function') return WA.betrothalAlliance.proposeMatch(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'match.settle': function (o) {
      if (WA.betrothalAlliance && typeof WA.betrothalAlliance.settle === 'function') return WA.betrothalAlliance.settle(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'match.breach': function (o) {
      if (WA.betrothalAlliance && typeof WA.betrothalAlliance.breach === 'function') return WA.betrothalAlliance.breach(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'survey.chartRegion': function (o) {
      if (WA.cartographySurvey && typeof WA.cartographySurvey.chartRegion === 'function') return WA.cartographySurvey.chartRegion(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'survey.resolveLandmark': function (o) {
      if (WA.cartographySurvey && typeof WA.cartographySurvey.resolveLandmark === 'function') return WA.cartographySurvey.resolveLandmark(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'tongue.converse': function (o) {
      if (WA.linguaBroker && typeof WA.linguaBroker.converse === 'function') return WA.linguaBroker.converse(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    }
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
    // OPV12-4: world.journeys 在途真源感知
    if (st.world && Array.isArray(st.world.journeys)) {
      st.world.journeys.forEach(function (j) {
        if (!j || !j.person) return;
        if (who && j.person !== who) return;
        if (j.status === 'in-transit') {
          // 若已有 people 记录则更新或追加
          const existing = rows.filter(function (r) { return r.kind === 'people' && r.id === j.person; })[0];
          if (!existing) {
            rows.push({ stage: 'in-progress', kind: 'people', id: j.person,
              label: j.person + ' 在途（' + clean(j.from, 20) + '→' + clean(j.to, 20) + '，剩 ' + (j.left || 0) + ' 分钟）',
              owner: 'travel', why: '在途行程中，到期可确认抵达', recover: (j.left <= 0 ? 'world.arrive:' + j.person : null),
              next: ['world.advance', 'world.arrive'] });
          } else if (j.left <= 0 && !existing.recover) {
            existing.recover = 'world.arrive:' + j.person;
          }
        }
      });
    }
    // ── 5. 物流在途（OPV12-3）：货物运输中 → 抵达可确认入库 / 改道 / 取消 ──
    if (st.freight && Array.isArray(st.freight.shipments)) {
      st.freight.shipments.forEach(function (s) {
        if (!s || !s.id) return;
        if (s.status === 'transit') {
          rows.push({ stage: 'in-progress', kind: 'freight', id: s.id,
            label: '货运 ' + clean(s.from, 20) + '→' + clean(s.to, 20) + '（' + clean(s.resource, 20) + ' ' + (s.qty || 0) + '）在途',
            owner: 'freight', why: '在途运输中，可确认到货或改道/取消',
            recover: 'freight.arrive:' + s.id, next: ['freight.arrive', 'freight.reroute', 'freight.cancel'] });
        } else if (s.status === 'arrived' || s.status === 'cancelled') {
          rows.push({ stage: 'terminal', kind: 'freight', id: s.id,
            label: '货运 ' + clean(s.id, 24) + ' 已' + s.status,
            owner: 'freight', why: '货运终态', recover: null, terminal: true });
        }
      });
    }

    // ── 6. 承诺履约监控（OPV12-7 / 场景 2）：未结/到期/违约承诺 → 履约 / 违约声明 / 和解补救 ──
    if (st.customLax && Array.isArray(st.customLax.promises)) {
      st.customLax.promises.forEach(function (p) {
        if (!p || !p.id) return;
        if (who && p.promiser !== who && p.beneficiary !== who) return;
        if (p.status === 'active') {
          rows.push({
            stage: 'in-progress',
            kind: 'promise',
            id: p.id,
            label: '承诺「' + clean(p.subject, 24) + '」（承诺人: ' + clean(p.promiser, 20) + '，约期日: ' + (p.dueDay != null ? p.dueDay : '无') + '）',
            owner: 'customLax',
            why: '承诺进行中，可履行交付或到期违约',
            recover: 'customLax.fulfillPromise:' + p.id,
            next: ['customLax.fulfillPromise', 'customLax.defaultPromise']
          });
        } else if (p.status === 'defaulted') {
          rows.push({
            stage: 'blocked',
            kind: 'promise',
            id: p.id,
            label: '已违约承诺「' + clean(p.subject, 24) + '」（需补救和解）',
            owner: 'customLax',
            why: '承诺已失约违约，人际信任受损，需谈判达成和解补偿协议',
            recover: 'customLax.remedyPromise:' + p.id,
            next: ['customLax.remedyPromise']
          });
        } else if (p.status === 'fulfilled' || p.status === 'remedied') {
          rows.push({
            stage: 'terminal',
            kind: 'promise',
            id: p.id,
            label: '承诺「' + clean(p.subject, 24) + '」已' + p.status,
            owner: 'customLax',
            why: '承诺已闭环',
            recover: null,
            terminal: true
          });
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

    // Only explicitly shared scene contracts containing this viewer are projected.
    let coordination = [];
    if (who && WA.liaison && WA.liaison.getSettings().enabled && typeof WA.liaison.sceneView === 'function') {
      const snapshot = state(), people = snapshot.people || {};
      const viewer = Object.keys(people).map(function (key) { return { key: key, row: people[key] }; })
        .filter(function (entry) { return entry.row && (entry.key === who || entry.key === 'p_' + who || entry.row.id === who || entry.row.name === who); })[0];
      if (viewer) {
        const aliases = [who, viewer.key, viewer.row.id, viewer.row.name].filter(Boolean);
        const contracts = WA.liaison.sceneView();
        coordination = (contracts.scenes || []).filter(function (scene) {
          return scene.shared === true && scene.people.some(function (person) { return aliases.indexOf(person) >= 0; })
            && (!(sit.place || place) || scene.place === (sit.place || place));
        }).map(function (scene) {
          return { id: scene.id, intent: scene.intent, status: scene.status,
            receipts: scene.receipts.map(function (receipt) { return { ref: receipt.ref, status: receipt.status }; }) };
        });
      }
    }
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
      coordination: coordination,
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
    const name = clean(o.name || ('branch_' + clockNow('actionDesk:promise')), 40);
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
    const key = clean(head, 64);
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
        else if (key === 'freight.dispatch') out.nextActions = ['freight.arrive', 'freight.reroute', 'freight.cancel'];
        else if (key === 'freight.arrive') out.nextActions = ['production.open', 'economy.buy'];
        else if (key === 'freight.reroute') out.nextActions = ['freight.arrive', 'freight.cancel'];
        else if (key === 'economy.buy') out.nextActions = ['production.open', 'economy.craft'];
        else if (key === 'economy.craft') out.nextActions = ['freight.dispatch', 'production.open'];
        else if (key === 'world.depart') out.nextActions = ['world.advance', 'world.arrive'];
        else if (key === 'world.advance') out.nextActions = ['world.arrive', 'world.advance'];
        else if (key === 'world.arrive') out.nextActions = ['plan.advance', 'region.occur'];
        else if (key === 'plan.expand') out.nextActions = ['plan.advance'];
        else if (key === 'plan.advance') out.nextActions = ['plan.settle'];
        else if (key === 'plan.settle') out.nextActions = (out.outcome === 'blocked' ? ['plan.rechoose'] : ['plan.advance']);
        else if (key === 'plan.rechoose') out.nextActions = ['plan.advance'];
        else if (key === 'region.occur') out.nextActions = ['region.deliver'];
        else if (key === 'region.deliver') out.nextActions = ['plan.rechoose', 'plan.settle'];
        else if (key === 'customLax.commitPromise') out.nextActions = ['customLax.fulfillPromise', 'customLax.defaultPromise'];
        else if (key === 'customLax.defaultPromise') out.nextActions = ['customLax.remedyPromise', 'rumor.startChain', 'relationGraph.upsert'];
        else if (key === 'customLax.remedyPromise') out.nextActions = ['relationGraph.upsert', 'customLax.commitPromise'];
        else if (key === 'creditLedger.open') out.nextActions = ['creditLedger.accrue', 'creditLedger.repay'];
        else if (key === 'creditLedger.repay') out.nextActions = ['creditLedger.open'];
        else if (key === 'creditLedger.checkCredit') out.nextActions = ['creditLedger.open', 'finance.ruptureCollateral'];
        else if (key === 'finance.ruptureCollateral') out.nextActions = ['rumor.startChain', 'relationGraph.upsert', 'subtextTension.assess'];
        else if (key === 'actor.applyEvaluationCosts') out.nextActions = ['drama.resolveNonBinary', 'subtextTension.assess'];
        else if (key === 'drama.germinateForeshadow') out.nextActions = ['rumor.startChain', 'subtextTension.assess', 'motive.arbitrate'];
        else if (key === 'chronicle.deliverRemoteEcho') out.nextActions = ['chronicle.dispatchPending'];
        else if (key === 'chronicle.dispatchPending') out.nextActions = ['intel.addIntel', 'rumor.startChain'];
        else if (key === 'environment.triggerSupplyChoke') out.nextActions = ['contraband.assessInflation', 'rumor.startChain'];
        else if (key === 'society.projectRumor') out.nextActions = ['intel.believe', 'society.plantForgedIntel'];
        else if (key === 'society.plantForgedIntel') out.nextActions = ['drama.negotiateDilemma', 'motive.arbitrate'];
        else if (key === 'drama.negotiateDilemma') out.nextActions = ['relationGraph.upsert', 'subtextTension.assess'];
        else if (key === 'faction.triggerSchism') out.nextActions = ['chronicle.enactReform', 'motive.arbitrate'];
        else if (key === 'chronicle.enactReform') out.nextActions = ['rumor.startChain', 'relationGraph.upsert'];
        else if (key === 'environment.disruptRoutines') out.nextActions = ['survival.scrambleSanctuary', 'subtextTension.assess'];
        else if (key === 'chronicle.transplantFact') out.nextActions = ['drama.evokeCounterfactualEcho', 'intel.believe'];
        else if (key === 'survival.scrambleSanctuary') out.nextActions = ['relationGraph.upsert', 'drama.resolveNonBinary'];
        else if (key === 'drama.evokeCounterfactualEcho') out.nextActions = ['motive.arbitrate', 'subtextTension.assess'];
        else if (key === 'rumor.startChain') out.nextActions = ['rumor.relay', 'rumor.investigate'];
        else if (key === 'rumor.relay') out.nextActions = ['rumor.investigate', 'intel.addIntel'];
        else if (key === 'rumor.investigate') out.nextActions = ['intel.believe', 'relationGraph.upsert'];
        else if (key === 'intel.addIntel') out.nextActions = ['intel.believe'];
        else if (key === 'room.whisper') out.nextActions = ['room.eavesdrop', 'room.burstIn'];
        else if (key === 'room.eavesdrop') out.nextActions = ['room.burstIn', 'narrative.roll'];
        else if (key === 'room.burstIn') out.nextActions = ['motive.arbitrate', 'narrative.roll'];
        else if (key === 'narrative.roll') out.nextActions = ['successGrade.evaluateSpectrum'];
        else if (key === 'contraband.assessInflation') out.nextActions = ['contraband.openRoute', 'contraband.smuggle'];
        else if (key === 'contraband.openRoute') out.nextActions = ['contraband.smuggle'];
        else if (key === 'contraband.smuggle') out.nextActions = ['contraband.inspectBust', 'rumor.startChain', 'creditLedger.open'];
        else if (key === 'terrainHazard.assessPassability') out.nextActions = ['terrainHazard.blockChannel', 'terrainHazard.forceTraverse'];
        else if (key === 'terrainHazard.blockChannel') out.nextActions = ['terrainHazard.forceTraverse', 'contraband.openRoute'];
        else if (key === 'terrainHazard.forceTraverse') out.nextActions = ['motive.arbitrate', 'terrainHazard.unblockChannel'];
        else if (key === 'rumor.driftRelay') out.nextActions = ['rumor.inspectDrift', 'intel.addIntel', 'terrainHazard.blockChannel'];
        else if (key === 'rumor.inspectDrift') out.nextActions = ['rumor.refute', 'intel.believe'];
        else if (key === 'foreshadowTree.plant') out.nextActions = ['foreshadowTree.ferment', 'foreshadowTree.distort'];
        else if (key === 'foreshadowTree.ferment') out.nextActions = ['foreshadowTree.distort', 'foreshadowTree.harvest', 'foreshadowTree.decay'];
        else if (key === 'foreshadowTree.distort') out.nextActions = ['foreshadowTree.harvest', 'subtextTension.assess'];
        else if (key === 'subtextTension.assess') out.nextActions = ['subtextTension.encode', 'subtextTension.decode'];
        else if (key === 'subtextTension.encode') out.nextActions = ['subtextTension.decode'];
        else if (key === 'lineage.bindLegacyOath') out.nextActions = ['lineage.enforceInheritedDebt'];
        else if (key === 'chronicle.archiveFactionRecord') out.nextActions = ['chronicle.comparePerspectives', 'chronicle.findExemptionClause'];
        else if (key === 'actor.triggerEpiphany') out.nextActions = ['actor.viewAutobiography', 'subtextTension.assess'];
        else if (key === 'folklore.proclaimTaboo') out.nextActions = ['folklore.checkTabooViolation', 'folklore.maskWithFestivity'];
        else if (key === 'folklore.maskWithFestivity') out.nextActions = ['folklore.checkTabooViolation'];
        else if (key === 'ideology.publishArticle') out.nextActions = ['ideology.assessSocialTide'];
        else if (key === 'ideology.assessSocialTide') out.nextActions = ['ideology.triggerCollectiveAction'];
        else if (key === 'actionDesk.orchestrate') out.nextActions = ['actionDesk.orchestrate', 'actionDesk.workbench'];
        else if (key === 'counterfactual.forkRehearsal') out.nextActions = ['counterfactual.simulateBranch'];
        else if (key === 'counterfactual.simulateBranch') out.nextActions = ['counterfactual.diffOutcomes'];
        else if (key === 'counterfactual.diffOutcomes') out.nextActions = ['counterfactual.forkRehearsal'];
        else if (key === 'relic.discoverRelic') out.nextActions = ['relic.reverseEngineer'];
        else if (key === 'relic.reverseEngineer') out.nextActions = ['relic.reverseEngineer', 'techLineage.canProduce'];
        else if (key === 'actor.registerIdiosyncrasy') out.nextActions = ['actor.observeSubconscious', 'motive.arbitrate'];
        else if (key === 'actor.observeSubconscious') out.nextActions = ['motive.arbitrate', 'subtextTension.assess'];
        else if (key === 'society.coordinate') out.nextActions = ['drama.resolveNonBinary', 'subtextTension.assess', 'actor.sendWhisper'];
        else if (key === 'actor.sendWhisper') out.nextActions = ['society.coordinate', 'subtextTension.assess', 'motive.arbitrate'];
      }
    }
    else { stat.refused++; if (out && out.reason) stat.faults[out.reason] = (stat.faults[out.reason] || 0) + 1; }
    return out || { ok: false, reason: 'owner-unavailable', action: key };
  }


  /**
   * OPV13-9: 中央场景行动桌全生命周期挂钩与自动编排心跳
   */
  function orchestrate(opts) {
    const o = opts || {};
    const elapsedDays = Math.max(1, Number(o.elapsedDays || o.turns || o.days) || 1);
    const events = [];

    // 1. 物理环境推演（时间推进）
    // v2.381.0: 原代码先探 weather.advance —— 但 weather 面只有
    //   setWeather/weatherOf/effect/travelMinutes/getMicroclimate，
    //   从来没有 advance（它不推进时间，只登记某地此刻天气）。
    //   真正的推进口是 world.advance(ms)。这里直接走真源，不再保留探测死枝。
    if (WA.world && typeof WA.world.advance === 'function') {
      try {
        const wRes = WA.world.advance(elapsedDays * 1440);
        events.push({ type: 'time_advanced', detail: wRes });
      } catch (e) {}
    }

    // 2. 物流在途推进与到货 (freight)
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        if (draft.freight && draft.freight.shipments) {
          const list = Array.isArray(draft.freight.shipments)
            ? draft.freight.shipments
            : Object.values(draft.freight.shipments);
          list.forEach(function (sh) {
            if (sh && sh.status === 'in_transit') {
              sh.daysRemaining = Math.max(0, (Number(sh.daysRemaining) || 0) - elapsedDays);
              if (sh.daysRemaining <= 0) {
                sh.status = 'arrived';
                sh.arrivedAt = clockNow('actionDesk');
                events.push({
                  type: 'freight_arrived',
                  shipmentId: sh.id || sh.shipmentId,
                  from: sh.from,
                  to: sh.to,
                  cargo: sh.cargo,
                  summary: '在途货运 ' + (sh.id || sh.shipmentId) + ' 历经 ' + elapsedDays + ' 日跋涉已安全送达地点 ' + sh.to
                });
              }
            }
          });
        }

        // 3. 承诺期限核验与违约检查 (customLax)
        if (draft.customLax && Array.isArray(draft.customLax.promises)) {
          draft.customLax.promises.forEach(function (p) {
            if (p && p.status === 'active') {
              p.remainingDays = (p.remainingDays != null) ? (p.remainingDays - elapsedDays) : -1;
              if (p.remainingDays <= 0) {
                p.status = 'defaulted';
                p.defaultedAt = clockNow('actionDesk');
                events.push({
                  type: 'promise_expired',
                  promiseId: p.id,
                  promiser: p.promiser,
                  promisee: p.promisee,
                  summary: '承诺 ' + p.id + ' 已逾期未偿付，正式触发违约记录！'
                });
              }
            }
          });
        }

        // 4. 流言与思潮自然衰减
        if (draft.rumors && Array.isArray(draft.rumors)) {
          draft.rumors.forEach(function (rm) {
            if (rm && rm.intensity > 0) {
              rm.intensity = Math.max(0, rm.intensity - elapsedDays * 5);
              if (rm.intensity === 0) {
                events.push({ type: 'rumor_faded', rumorId: rm.id, summary: '传闻 ' + rm.id + ' 在岁月中自然淡忘消弭。' });
              }
            }
          });
        }

        return true;
      }, 'actionDesk:orchestrate');
    }

    stat.byKind['orchestrate'] = (stat.byKind['orchestrate'] || 0) + 1;
    return {
      ok: true,
      elapsedDays: elapsedDays,
      totalEvents: events.length,
      events: events,
      at: clockNow('actionDesk')
    };
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
    boardMulti: function (opts) {
      const o = opts || {};
      const people = Array.isArray(o.people) ? o.people : [o.person || 'protagonist'];
      const boards = {};
      people.forEach(function (p) {
        boards[p] = board(Object.assign({}, o, { person: p }));
      });
      return { ok: true, people: people, boards: boards, at: clockNow('actionDesk') };
    },
    planMulti: function (actions, opts) {
      const list = Array.isArray(actions) ? actions : [];
      const results = list.map(function (act) {
        const aid = (typeof act === 'string') ? act : act.actionId;
        const o = (typeof act === 'object') ? Object.assign({}, opts || {}, act.opts || act) : (opts || {});
        return { actionId: aid, result: plan(aid, o) };
      });
      return { ok: true, total: results.length, results: results, at: clockNow('actionDesk') };
    },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults), byKind: Object.assign({}, stat.byKind) }); }
  };
  Object.defineProperty(WA.actionDesk, 'orchestrate', {
    value: orchestrate,
    enumerable: false,
    writable: true,
    configurable: true
  });
  var EXPORT_COUNT = 16;
  var _exported = Object.keys(WA.actionDesk).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('actionDesk: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/action-desk.js', { kind: 'engine', ver: '2.231.0' });
})();