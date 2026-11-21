/**
 * WorldAxis engines/action-desk-routes.js (v2.529.0) — action-desk 的动作路由表
 *
 * 原本长在 engines/action-desk.js（4123 行）的第 65–2562 行：1328 个动作闭包，
 * 按动作域分段（市场/身体/认知/章节/主题/回收…）。改一条路由要在四千行里翻，
 * 而它的形状是「一层 if + 一句 WA.xxx 转发」，本该一眼看全。
 *
 * 为什么出闸形态是**工厂**而不是纯数据表（OPV29-08 的边界）：
 *   这 1328 个闭包里有 19 处调用引擎本地函数（clockNow / previewAction / workbench /
 *   chapterOpen… / orchestrate）。纯数据搬家会在调用期 ReferenceError —— 与 OPV29-11
 *   的 DIFF_ROWS（pick 回调调引擎内 num()）同一个坑。所以本文件导出
 *   `WA.actionDeskRoutes(H)`，引擎把 19 个本地函数按名字传进来，这里改调 H.foo。
 *   `WA.*` 一律原样：本文件的 WA 与引擎里的 WA 是同一个 window.WorldAxis。
 *
 * 拒收码不变：表里每个闭包原样返回 `{ ok:false, refusal|reason: … }`，一字未改。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  WA.actionDeskRoutes = function (H) {
    H = H || {};
    ['declareOpportunity', 'applyOpportunity', 'awardOpportunity', 'chapterOpen', 'chapterFlow', 'chapterRollover', 'chapterClose', 'chapterSaveBranch', 'chapterRestore', 'chapterDiff', 'chapterInspect', 'clockNow', 'previewAction', 'workbench', 'lifecycle', 'recoverAction', 'sceneFlow', 'actFromScene', 'orchestrate'].forEach(function (k) {
      if (typeof H[k] !== 'function') { throw new Error('action-desk-routes: 缺少本地函数 ' + k + '（工厂参数不全）'); }
    });
  const ROUTES = {
    // ── V23 史诗扩充写口 ───────────────────────────────────────────────
    'market.transferCargo': function (o) {
      if (WA.commodityCirculation && typeof WA.commodityCirculation.transferCargo === 'function') {
        return WA.commodityCirculation.transferCargo(o);
      }
      return { ok: false, refusal: 'commodity-circulation-unavailable' };
    },
    'market.settleDefault': function (o) {
      if (WA.commodityCirculation && typeof WA.commodityCirculation.settleDefault === 'function') {
        return WA.commodityCirculation.settleDefault(o.debtId, o.currentRound, o.paidAmount);
      }
      return { ok: false, refusal: 'commodity-circulation-unavailable' };
    },
    'body.inflictWound': function (o) {
      if (WA.somaticTrauma && typeof WA.somaticTrauma.inflictWound === 'function') {
        return WA.somaticTrauma.inflictWound(o.actorId, o.zone, o.damageSpec);
      }
      return { ok: false, refusal: 'somatic-trauma-unavailable' };
    },
    'body.performTriage': function (o) {
      if (WA.somaticTrauma && typeof WA.somaticTrauma.performTriage === 'function') {
        return WA.somaticTrauma.performTriage(o.actorId, o.zone, o.triageMethod);
      }
      return { ok: false, refusal: 'somatic-trauma-unavailable' };
    },
    'mind.triggerTraumaShock': function (o) {
      if (WA.psycheDissociation && typeof WA.psycheDissociation.triggerTraumaShock === 'function') {
        return WA.psycheDissociation.triggerTraumaShock(o.actorId, o.shockSpec);
      }
      return { ok: false, refusal: 'psyche-dissociation-unavailable' };
    },
    'crowd.igniteRumorWave': function (o) {
      if (WA.mobStampede && typeof WA.mobStampede.igniteRumorWave === 'function') {
        return WA.mobStampede.igniteRumorWave(o.placeId, o.rumorSpec);
      }
      return { ok: false, refusal: 'mob-stampede-unavailable' };
    },
    'geo.simulateTerrainShift': function (o) {
      if (WA.geophysicalReshaping && typeof WA.geophysicalReshaping.simulateTerrainShift === 'function') {
        return WA.geophysicalReshaping.simulateTerrainShift(o.regionId, o.pressures);
      }
      return { ok: false, refusal: 'geophysical-reshaping-unavailable' };
    },
    'craft.applyStress': function (o) {
      if (WA.artificeDegradation && typeof WA.artificeDegradation.applyStress === 'function') {
        return WA.artificeDegradation.applyStress(o.itemId, o.stressSpec);
      }
      return { ok: false, refusal: 'artifice-degradation-unavailable' };
    },
    'spy.infiltrateAgent': function (o) {
      if (WA.shadowCouncil && typeof WA.shadowCouncil.infiltrateAgent === 'function') {
        return WA.shadowCouncil.infiltrateAgent(o.agentId, o.shadowFaction, o.spec);
      }
      return { ok: false, refusal: 'shadow-council-unavailable' };
    },
    'clan.bindLineage': function (o) {
      if (WA.dynasticLineage && typeof WA.dynasticLineage.bindLineage === 'function') {
        return WA.dynasticLineage.bindLineage(o.actorId, o.clanId, o.spec);
      }
      return { ok: false, refusal: 'dynastic-lineage-unavailable' };
    },
    'epoch.advanceSingularityTension': function (o) {
      if (WA.worldSingularity && typeof WA.worldSingularity.advanceSingularityTension === 'function') {
        return WA.worldSingularity.advanceSingularityTension(o.delta, o.reason);
      }
      return { ok: false, refusal: 'world-singularity-unavailable' };
    },
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
    'actionDesk.declareOpportunity': function (o) { return H.declareOpportunity(o.oppId || o.id, o); },
    'actionDesk.applyOpportunity': function (o) { return H.applyOpportunity(o.oppId || o.id, o.who, o); },
    'actionDesk.awardOpportunity': function (o) { return H.awardOpportunity(o.oppId || o.id, o); },
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
    'chapter.open': function (o) { return H.chapterOpen(o); },
    'chapter.flow': function (o) { return H.chapterFlow(o); },
    'chapter.rollover': function (o) { return H.chapterRollover(o); },
    'chapter.close': function (o) { return H.chapterClose(o); },
    'chapter.saveBranch': function (o) { return H.chapterSaveBranch(o); },
    'chapter.restore': function (o) { return H.chapterRestore(o); },
    'chapter.diff': function (o) { return H.chapterDiff(o); },
    'chapter.inspect': function (o) { return H.chapterInspect(o); },
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
        at: H.clockNow('actionDesk')
      };
    },
    'sceneNarrative.situation': function (o) { return WA.sceneNarrative.situation(o); },
    'actionDesk.preview': function (o) { return H.previewAction(o.actionId, o); },
    'actionDesk.workbench': function (o) { return H.workbench(o); },
    // v2.233.0 (OPV4-1 & OPV4-2): 场景优先入口与跨轮生命周期
    'actionDesk.lifecycle': function (o) { return H.lifecycle(o); },
    'actionDesk.recoverAction': function (o) { return H.recoverAction(o.actionId, o); },
        'liaison.sceneOpen': function (o) { return (WA.liaison && typeof WA.liaison.sceneOpen === 'function') ? WA.liaison.sceneOpen(o) : { ok: false, reason: 'liaison-unavailable' }; },
    'liaison.sceneResolve': function (o) { return (WA.liaison && typeof WA.liaison.sceneResolve === 'function') ? WA.liaison.sceneResolve(o.sceneId || o.id, o.receipt || o) : { ok: false, reason: 'liaison-unavailable' }; },
'actionDesk.sceneFlow': function (o) { return H.sceneFlow(o); },
    'actionDesk.actFromScene': function (o) { return H.actFromScene(o); },
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
    // v2.524.0（V28 / EXV28-23）：「答应的事成了债，逾期可催、还清销账」两个动作上台面 ——
    //   催与销都不碰钱袋（钱仍走 repay），台上只负责把这两件事做成有据的一次动作。
    'creditLedger.dun': function (o) { return WA.creditLedger.dun(o.id || o.loanId, o); },
    'creditLedger.settle': function (o) { return WA.creditLedger.settle(o.id || o.loanId, o); },
    // v2.524.0（V28 / EXV28-33~36）：世界简报上台面 —— 开一块拼图板、读一段年表、往史里记一笔。
    //   板子只摆碎片、不替玩家下结论；年表只收已发生且追得到 owner 的条。
    'worldBrief.board': function (o) { return WA.worldBrief.board(o); },
    'worldBrief.almanac': function (o) { return WA.worldBrief.almanac(o); },
    'worldBrief.record': function (o) { return WA.worldBrief.record(o.spec || o); },
    // v2.524.0（V28 / EXV28-21/24）：预演对账与同案异读 —— 两个只读的动作。
    'rehearsal.settle': function (o) { return WA.rehearsal.settle(o.id || o.previewId, o.actual || o); },
    'pathEcho.bystanders': function (o) { return WA.pathEcho.bystanders(o.decisionId || o.id); },
    // v2.524.0（OPV28 组一~六）：治理面的真动作入口（面板与模型都从这里走）。
    'narrativePreset.apply': function (o) { return WA.narrativePreset.apply(o); },
    'narrativePreset.restore': function () { return WA.narrativePreset.restore(); },
    'narrativePreset.overview': function () { return WA.narrativePreset.overview(); },
    // v2.524.0 S1（单列可开关项）：说了不一定成 —— d20 五档检定，默认关
    'outcomeDice.resolve': function (o) { return WA.outcomeDice.resolve(o); },
    'outcomeDice.toggle': function (o) { return WA.outcomeDice.toggle(o && o.on); },
    'outcomeDice.ladder': function (o) { return WA.outcomeDice.ladder(o && o.target); },
    'outcomeDice.view': function () { return WA.outcomeDice.view(); },
    'outcomeDice.reset': function () { return WA.outcomeDice.reset(); },
    'act.judge': function (o) { const x = o || {}; return WA.act.judge(x.kind, x); },
    // S1：开关打开后接管格斗/射击/交谈这些事件项
    'outcomeDice.check': function (o) { return WA.outcomeDice.check(o); },
    'outcomeDice.skills': function () { return WA.outcomeDice.skills(); },
    'outcomeDice.setSkill': function (o) { const x = o || {}; return WA.outcomeDice.setSkill(x.skill, x.value); },
    // EXV29-01：四元组同一性（只报不改）
    'identityLedger.snapshot': function (o) { return WA.identityLedger.snapshot(o); },
    'identityLedger.audit': function (o) { return WA.identityLedger.audit(o); },
    'identityLedger.report': function () { return WA.identityLedger.report(); },
    'identityLedger.brief': function () { return WA.identityLedger.brief(); },
    // EXV29-02：称呼随亲疏（只判不说）
    'addressForm.set': function (o) { return WA.addressForm.set(o); },
    'addressForm.setTier': function (o) { return WA.addressForm.setTier(o); },
    'addressForm.check': function (o) { return WA.addressForm.check(o); },
    'addressForm.read': function (o) { return WA.addressForm.read(o); },
    'addressForm.report': function () { return WA.addressForm.report(); },
    // EXV29-03：年龄与体貌推进（跨年才动、只升不跳）
    'aging.register': function (o) { return WA.aging.register(o); },
    'aging.advance': function (o) { const x = o || {}; return WA.aging.advance(x.days); },
    'aging.read': function (o) { return WA.aging.read(o); },
    'aging.due': function () { return WA.aging.due(); },
    // EXV29-04：习惯动作可认人（三情绪频率，不是标签）
    'habitTell.register': function (o) { return WA.habitTell.register(o); },
    'habitTell.shouldShow': function (o) { return WA.habitTell.shouldShow(o); },
    'habitTell.identify': function (o) { return WA.habitTell.identify(o); },
    'habitTell.read': function (o) { return WA.habitTell.read(o); },
    'habitTell.report': function () { return WA.habitTell.report(); },
    // EXV29-05：忌讳与失礼（踩了有后果，不是报错）
    'etiquette.register': function (o) { return WA.etiquette.register(o); },
    'etiquette.breach': function (o) { return WA.etiquette.breach(o); },
    'etiquette.learn': function (o) { return WA.etiquette.learn(o); },
    'etiquette.knows': function (o) { return WA.etiquette.knows(o); },
    'etiquette.recent': function () { return WA.etiquette.recent(); },
    'etiquette.table': function (o) { const x = o || {}; return WA.etiquette.table(x.scope); },
    // V29 批一：四个新引擎的读数与档位（面板/诊断用）
    'addressForm.stat': function () { return WA.addressForm.stat(); },
    'aging.stat': function () { return WA.aging.stat(); },
    'aging.tierOf': function (o) { const x = o || {}; return WA.aging.tierOf(Number(x.age)); },
    'habitTell.stat': function () { return WA.habitTell.stat(); },
    'etiquette.stat': function () { return WA.etiquette.stat(); },
    // EXV29-07/08/09/11：同场秩序（排序 / 抢话代价 / 听者分层 / 冷场）
    'floorOrder.rank': function (o) { return WA.floorOrder.rank(o); },
    'floorOrder.note': function (o) { return WA.floorOrder.note(o); },
    'floorOrder.stat': function () { return WA.floorOrder.stat(); },
    'interruptCost.cut': function (o) { return WA.interruptCost.cut(o); },
    'interruptCost.state': function (o) { return WA.interruptCost.state(o); },
    'interruptCost.forgive': function (o) { return WA.interruptCost.forgive(o); },
    'overhearSplit.split': function (o) { return WA.overhearSplit.split(o); },
    'quietRound.judge': function (o) { return WA.quietRound.judge(o); },
    'quietRound.stat': function () { return WA.quietRound.stat(); },
    // EXV29-10/12：耳语圈外视图与被忽略者优先（复用既有引擎）
    'whisperBackchannel.perimeter': function (o) { return WA.whisperBackchannel.perimeter(o); },
    'spotlight.fairness': function (o) { const x = o || {}; return WA.spotlight.fairness(x.list, x.round); },
    // EXV29-13/14/15/16/18：收束（终局判据 / 卷末结算 / 未收的线 / 退场仪典 / 前世）
    'finale.check': function (o) { return WA.finale.check(o); },
    'finale.rateGate': function (o) { return WA.finale.rateGate(o); },
    'finale.state': function () { return WA.finale.state(); },
    'arcSettle.open': function (o) { return WA.arcSettle.open(o); },
    'arcSettle.add': function (o) { return WA.arcSettle.add(o); },
    'arcSettle.close': function (o) { return WA.arcSettle.close(o); },
    'arcSettle.read': function (o) { return WA.arcSettle.read(o); },
    'looseEnds.add': function (o) { return WA.looseEnds.add(o); },
    'looseEnds.close': function (o) { return WA.looseEnds.close(o); },
    'looseEnds.settle': function () { return WA.looseEnds.settle(); },
    'exitRite.add': function (o) { return WA.exitRite.add(o); },
    'exitRite.gone': function (o) { const x = o || {}; return WA.exitRite.gone(x.id); },
    'exitRite.list': function () { return WA.exitRite.list(); },
    'pastLife.offer': function () { return WA.pastLife.offer(); },
    'pastLife.choose': function (o) { const x = o || {}; return WA.pastLife.choose(x.keys, x.token); },
    'pastLife.decline': function () { return WA.pastLife.decline(); },
    'pastLife.residue': function () { return WA.pastLife.residue(); },
    // EXV29-19/20/21/22/24：身后（债 / 名声 / 遗物遗嘱 / 翻案 / 悼念）
    'reputationAfter.note': function (o) { return WA.reputationAfter.note(o); },
    'reputationAfter.markDead': function (o) { return WA.reputationAfter.markDead(o); },
    'reputationAfter.view': function (o) { return WA.reputationAfter.view(o); },
    'posthumous.oblige': function (o) { return WA.posthumous.oblige(o); },
    'posthumous.bequeath': function (o) { return WA.posthumous.bequeath(o); },
    'posthumous.will': function (o) { return WA.posthumous.will(o); },
    'posthumous.violate': function (o) { return WA.posthumous.violate(o); },
    'posthumous.breachView': function (o) { return WA.posthumous.breachView(o); },
    'posthumous.overturn': function (o) { return WA.posthumous.overturn(o); },
    'posthumous.remember': function (o) { return WA.posthumous.remember(o); },
    'posthumous.keeperDied': function (o) { return WA.posthumous.keeperDied(o); },
    'posthumous.remembrance': function () { return WA.posthumous.remembrance(); },
    // EXV29-25～30：物价与生计（报价 / 购买力 / 囤积 / 账本 / 折算 / 穷）
    'priceVoice.quote': function (o) { return WA.priceVoice.quote(o); },
    'priceVoice.compare': function (o) { return WA.priceVoice.compare(o); },
    'livelihood.wageDrift': function (o) { return WA.livelihood.wageDrift(o); },
    'livelihood.hoard': function (o) { return WA.livelihood.hoard(o); },
    'livelihood.ledger': function (o) { return WA.livelihood.ledger(o); },
    'livelihood.ledgerView': function () { return WA.livelihood.ledgerView(); },
    'livelihood.revalue': function (o) { return WA.livelihood.revalue(o); },
    'livelihood.hardship': function (o) { return WA.livelihood.hardship(o); },
    // EXV29-31～36：时间的边界（离线 / 回来 / 暂停 / 并发 / 长档 / 长度）
    'worldBounds.away': function (o) { return WA.worldBounds.away(o); },
    'worldBounds.returning': function (o) { return WA.worldBounds.returning(o); },
    'worldBounds.pause': function (o) { return WA.worldBounds.pause(o); },
    'worldBounds.resume': function () { return WA.worldBounds.resume(); },
    'worldBounds.selfTick': function (o) { return WA.worldBounds.selfTick(o); },
    'worldBounds.order': function (o) { return WA.worldBounds.order(o); },
    'worldBounds.compress': function (o) { return WA.worldBounds.compress(o); },
    'worldBounds.length': function () { return WA.worldBounds.length(); },
    'worldLoopLog.logRound': function (o) { return WA.worldLoopLog.logRound(o); },
    'worldLoopLog.absence': function (o) { return WA.worldLoopLog.absence(o); },
    'costGuard.warn': function (o) { return WA.costGuard.warn(o); },
    'costGuard.choose': function (o) { return WA.costGuard.choose(o.option || o); },
    'continuityGuard.position': function (o) { return WA.continuityGuard.position(o); },
    'continuityGuard.knowledge': function (o) { return WA.continuityGuard.knowledge(o); },
    'controllability.mark': function () { return WA.controllability.mark(); },
    'controllability.rollback': function (o) { return WA.controllability.rollback(o); },
    'controllability.confirm': function (o) { return WA.controllability.confirm(o); },
    'storyRhythm.options': function (o) { return WA.storyRhythm.options(o && o.list ? o.list : o); },
    'storyRhythm.payback': function () { return WA.storyRhythm.payback(); },
    'creditLedger.checkCredit': function (o) { return WA.creditLedger.checkCredit(o.borrower || o.who, o.at); },
    'anniversaryRites.register': function (o) { return WA.anniversaryRites.register(o.spec || o); },
    'anniversaryRites.markObserved': function (o) { return WA.anniversaryRites.markObserved(o.id, o.spec || o); },
    'anniversaryRites.observe': function (o) { return WA.anniversaryRites.observe(o.spec || o); },
    'outsiderIntegration.arrive': function (o) { return WA.outsiderIntegration.arrive(o.spec || o); },
    'outsiderIntegration.recordWitness': function (o) { return WA.outsiderIntegration.recordWitness(o.spec || o); },
    'tenancyRent.lease': function (o) { return WA.tenancyRent.lease(o.spec || o); },
    'tenancyRent.collectRent': function (o) { return WA.tenancyRent.collectRent(o.id, o.spec || o); },
    'tenancyRent.evictTenant': function (o) { return WA.tenancyRent.evictTenant(o.id, o.spec || o); },
    'militaryLevy.register': function (o) { return WA.militaryLevy.register(o.spec || o); },
    'militaryLevy.noteDebt': function (o) { return WA.militaryLevy.noteDebt(o.id, o.spec || o); },
    'militaryLevy.payStipend': function (o) { return WA.militaryLevy.payStipend(o.id, o.spec || o); },
    'nursingCare.hire': function (o) { return WA.nursingCare.hire(o.spec || o); },
    'nursingCare.assignNursing': function (op) { return WA.nursingCare.assignNursing(op.spec || op); },
    'nursingCare.wean': function (o) { return WA.nursingCare.wean(o.spec || o); },
    'lostFound.reportLoss': function (o) { return WA.lostFound.reportLoss(o.spec || o); },
    'lostFound.logFound': function (o) { return WA.lostFound.logFound(o.id, o.spec || o); },
    'lostFound.claim': function (o) { return WA.lostFound.claim(o.id, o.spec || o); },
    'pilgrimFlow.arrive': function (o) { return WA.pilgrimFlow.arrive(o.spec || o); },
    'pilgrimFlow.registerVow': function (o) { return WA.pilgrimFlow.registerVow(o.spec || o); },
    'pilgrimFlow.fulfilVow': function (o) { return WA.pilgrimFlow.fulfilVow(o.id, o.spec || o); },
    'diceDen.openTable': function (o) { return WA.diceDen.openTable(o.spec || o); },
    'diceDen.placeBet': function (o) { return WA.diceDen.placeBet(o.id, o.spec || o); },
    'diceDen.settle': function (o) { return WA.diceDen.settle(o.id, o.spec || o); },
    'diceDen.cheatAttempt': function (o) { return WA.diceDen.cheatAttempt(o.id, o.spec || o); },
    'bathhouseLaundry.openBath': function (o) { return WA.bathhouseLaundry.openBath(o.spec || o); },
    'bathhouseLaundry.washGarments': function (o) { return WA.bathhouseLaundry.washGarments(o.spec || o); },
    // ══ v2.417.0（V25 柏宝书+数据库缝入批）：11 引擎路由。键名 = ns.方法，与各引擎导出面逐字对齐 ══
    // EXV25-1 对主角了解清单：写 add/correct/forget，读 knows/view/unknownFor
    'playerKnowledge.add': function (o) { return WA.playerKnowledge.add(o.spec || o); },
    'playerKnowledge.correct': function (o) { return WA.playerKnowledge.correct(o.id, o.spec || o); },
    'playerKnowledge.forget': function (o) { return WA.playerKnowledge.forget(o.id, o.reason); },
    'playerKnowledge.knows': function (o) { return WA.playerKnowledge.knows(o.spec || o); },
    'playerKnowledge.view': function (o) { return WA.playerKnowledge.view(o.spec || o); },
    'playerKnowledge.unknownFor': function (o) { return WA.playerKnowledge.unknownFor(o.spec || o); },
    // EXV25-2 内外双轴：写 observe/clear，读 read/view
    'affectionDual.observe': function (o) { return WA.affectionDual.observe(o.spec || o); },
    'affectionDual.read': function (o) { return WA.affectionDual.read(o.spec || o); },
    'affectionDual.clear': function (o) { return WA.affectionDual.clear(o.spec || o); },
    'affectionDual.view': function (o) { return WA.affectionDual.view(o.spec || o); },
    // EXV25-3 生活小档案：写 record/update/remove，读 about/view
    'lifeProfile.record': function (o) { return WA.lifeProfile.record(o.spec || o); },
    'lifeProfile.update': function (o) { return WA.lifeProfile.update(o.id, o.spec || o); },
    'lifeProfile.remove': function (o) { return WA.lifeProfile.remove(o.id, o.reason); },
    'lifeProfile.about': function (o) { return WA.lifeProfile.about(o.spec || o); },
    'lifeProfile.view': function (o) { return WA.lifeProfile.view(o.spec || o); },
    // EXV25-4 悬念簿：写 open/close/reopen，读 overdue/view
    'suspenseLedger.open': function (o) { return WA.suspenseLedger.open(o.spec || o); },
    'suspenseLedger.close': function (o) { return WA.suspenseLedger.close(o.spec || o); },
    'suspenseLedger.reopen': function (o) { return WA.suspenseLedger.reopen(o.spec || o); },
    'suspenseLedger.overdue': function (o) { return WA.suspenseLedger.overdue(o.spec || o); },
    'suspenseLedger.view': function (o) { return WA.suspenseLedger.view(o.spec || o); },
    // EXV25-5 易漏提醒：机器面，扫描口路由（summarizer/backstage 管线按需调用）
    'sourceHints.scan': function (o) { return WA.sourceHints.scan(o.spec || o); },
    'sourceHints.build': function (o) { return WA.sourceHints.build(o.spec || o); },
    // OPV25-1 幂等闸：写 begin/commit/abort，读 probe/view
    'advanceIdem.begin': function (o) { return WA.advanceIdem.begin(o.spec || o); },
    'advanceIdem.claim': function (o) { return WA.advanceIdem.claim(o.spec || o); },
    'advanceIdem.commit': function (o) { return WA.advanceIdem.commit(o.spec || o); },
    'advanceIdem.abort': function (o) { return WA.advanceIdem.abort(o.spec || o); },
    'advanceIdem.probe': function (o) { return WA.advanceIdem.probe(o.spec || o); },
    'advanceIdem.view': function (o) { return WA.advanceIdem.view(o.spec || o); },
    // OPV25-2 让路：写 yieldFor/release，读 holds
    'takeoverYield.yieldFor': function (o) { return WA.takeoverYield.yieldFor(o.spec || o); },
    'takeoverYield.release': function (o) { return WA.takeoverYield.release(o.spec || o); },
    'takeoverYield.holds': function (o) { return WA.takeoverYield.holds(o.spec || o); },
    // OPV25-3 推演链：写 plan/step/commit/abort/fill，读 view
    'simRehearsal.plan': function (o) { return WA.simRehearsal.plan(o.spec || o); },
    'simRehearsal.step': function (o) { return WA.simRehearsal.step(o.spec || o); },
    'simRehearsal.commit': function (o) { return WA.simRehearsal.commit(o.spec || o); },
    'simRehearsal.abort': function (o) { return WA.simRehearsal.abort(o.spec || o); },
    'simRehearsal.fill': function (o) { return WA.simRehearsal.fill(o.spec || o); },
    'simRehearsal.view': function (o) { return WA.simRehearsal.view(o.spec || o); },
    // OPV25-4 批量读：读口路由 index/read/consume
    'historyBatch.index': function (o) { return WA.historyBatch.index(o.spec || o); },
    'historyBatch.read': function (o) { return WA.historyBatch.read(o.spec || o); },
    'historyBatch.consume': function (o) { return WA.historyBatch.consume(o.spec || o); },
    // OPV25-5 节流：写 note，读 due/flush/trailing/view
    'saveThrottle.note': function (o) { return WA.saveThrottle.note(o.spec || o); },
    'saveThrottle.due': function (o) { return WA.saveThrottle.due(o.spec || o); },
    'saveThrottle.flush': function (o) { return WA.saveThrottle.flush(o.spec || o); },
    'saveThrottle.trailing': function (o) { return WA.saveThrottle.trailing(o.spec || o); },
    // OPV25-6 来源身份：写 stamp，读 verify/audit
    'historyProv.stamp': function (o) { return WA.historyProv.stamp(o.spec || o); },
    'historyProv.verify': function (o) { return WA.historyProv.verify(o.spec || o); },
    'historyProv.audit': function (o) { return WA.historyProv.audit(o.spec || o); },
    // ── v2.517.0（V26 模型可观测性批）：六引擎路由。写口统一收拢 ActionDesk，
    //   UI 只读引擎；观测面动作天然只读，不触碰存档。
    // OPV26-1 回执账：写 record（喂账），读 list/stats/drifters
    'modelReceipt.record': function (o) { return WA.modelReceipt.record(o.spec || o); },
    'modelReceipt.list': function (o) { return WA.modelReceipt.list(o.spec || o); },
    'modelReceipt.stats': function (o) { return WA.modelReceipt.stats(o.spec || o); },
    'modelReceipt.drifters': function (o) { return WA.modelReceipt.drifters(o.spec || o); },
    // OPV26-3 用量分位：写 observe，读 view/debt
    'tokenBudget.observe': function (o) { return WA.tokenBudget.observe(o.spec || o); },
    'tokenBudget.view': function (o) { return WA.tokenBudget.view(o.spec || o); },
    'tokenBudget.debt': function (o) { return WA.tokenBudget.debt(); },
    // OPV26-3b 钉版守卫：写 pin/unpin，读 check/audit/pins
    'modelPin.pin': function (o) { return WA.modelPin.pin(o.spec || o); },
    'modelPin.unpin': function (o) { return WA.modelPin.unpin(o.spec || o); },
    'modelPin.check': function (o) { return WA.modelPin.check(o.spec || o); },
    'modelPin.audit': function (o) { return WA.modelPin.audit(o.spec || o); },
    'modelPin.pins': function (o) { return WA.modelPin.pins(); },
    // OPV26-4 时间线：写 begin/mark/end，读 view
    'callTimeline.begin': function (o) { return WA.callTimeline.begin(o.spec || o); },
    'callTimeline.mark': function (o) { return WA.callTimeline.mark(o.spec || o); },
    'callTimeline.end': function (o) { return WA.callTimeline.end(o.spec || o); },
    'callTimeline.view': function (o) { return WA.callTimeline.view(o.spec || o); },
    // OPV26-5 清单：写 ingest（纯收账），读 list/check/audit
    'modelCatalog.ingest': function (o) { return WA.modelCatalog.ingest(o.spec || o); },
    'modelCatalog.list': function (o) { return WA.modelCatalog.list(o.spec || o); },
    'modelCatalog.check': function (o) { return WA.modelCatalog.check(o.spec || o); },
    'modelCatalog.audit': function (o) { return WA.modelCatalog.audit(o.spec || o); },
    // OPV26-6 降智审计：写 baseline，读 audit/baselines
    'degradeAudit.baseline': function (o) { return WA.degradeAudit.baseline(o.spec || o); },
    'degradeAudit.audit': function (o) { return WA.degradeAudit.audit(o.spec || o); },
    'degradeAudit.baselines': function (o) { return WA.degradeAudit.baselines(); },
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
      return H.orchestrate(o);
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
      const T = WA.toxicMetabolism;
      if (!T || typeof T.metabolize !== 'function') return { ok: false, reason: 'toxicMetabolism-unavailable' };
      // v2.542.14：把「这一轮到底推进了多久」的判定交回 engines/elapsed-evidence.js。
      //   给了正文（o.source / o.text）时，分钟数必须由证据推出；推不出由引擎如实拒绝，
      //   不再由常量代劳。没给正文时 opts 为空 ⇒ 引擎行为与旧版逐字一致（caller / default）。
      const src = (o && typeof o.source === 'string' && o.source) ? o.source
        : ((o && typeof o.text === 'string') ? o.text : '');
      const opt = {};
      if (src) {
        opt.text = src;
        if (typeof o.evidence === 'string') opt.evidence = o.evidence;
        if (typeof o.deltaMinutes === 'number') opt.deltaMinutes = o.deltaMinutes;
      }
      return T.metabolize(o.actorId || o.who, o.elapsedMinutes || o.duration, opt);
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
    },
    // ══════════════════════════════════════════════════════════════════════
    // v2.402.0（V23 缝合线）：异空间 V1.4 三台账本引擎的路由──
    //   与上段同一条纪律：死导出门禁的判据是「定义文件之外的**产品代码**有零引用」。
    //   三引擎若只被 tests 读，productUnused 会把全部导出报成 self-only / unwired
    //   —— 那不是误报：「能算但没人叫它算」的引擎就是死的。action-desk 是本仓
    //   「玩家动作→引擎」的唯一入口，故这里就是它们的正当消费点。
    //
    //   沿用共享拒收码 `unsupported`（与上方 V22 八条同口径），不新造新码面。
    //
    //   ⚠ 三条纪律（与引擎边界对齐，改这里前先读各引擎的文件头）：
    //     ① `recycle.enforce` **永远不删**：它只回「请宿主删这几个」+ irreversible。
    //        真正的删除必须由宿主在收到回执后执行，本路由不代理任何删除动作。
    //     ② `stage.end` 的 policy 必须由调用方显式给出（archive / discard / cancel）：
    //        这里**不补默认值** —— 引擎对缺 policy 的拒收（missing-policy）要能原样透出。
    //        否则「替用户选了保存」这类静默决定就发生在路由层，事后无法归因。
    //     ③ `relay.compose` 只收摘要（summary），**没有** messages / raw 通道：
    //        路由层也不许顺手把正文塞进去（那是「合并两份聊天」的唯一入口）。
    // ══════════════════════════════════════════════════════════════════════
    'stage.begin': function (o) {
      if (WA.stageSession && typeof WA.stageSession.begin === 'function') return WA.stageSession.begin(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'stage.activate': function (o) {
      if (WA.stageSession && typeof WA.stageSession.activate === 'function') return WA.stageSession.activate(o.id);
      return { ok: false, reason: 'unsupported' };
    },
    'stage.end': function (o) {
      if (WA.stageSession && typeof WA.stageSession.end === 'function') return WA.stageSession.end(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'stage.resume': function (o) {
      if (WA.stageSession && typeof WA.stageSession.resume === 'function') return WA.stageSession.resume(o.id);
      return { ok: false, reason: 'unsupported' };
    },
    'relay.compose': function (o) {
      if (WA.memoryRelay && typeof WA.memoryRelay.compose === 'function') return WA.memoryRelay.compose(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'relay.attach': function (o) {
      if (WA.memoryRelay && typeof WA.memoryRelay.attach === 'function') return WA.memoryRelay.attach(o.relayId, o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'recycle.hide': function (o) {
      if (WA.chatRecycle && typeof WA.chatRecycle.hide === 'function') return WA.chatRecycle.hide(o.spec || o);
      return { ok: false, reason: 'unsupported' };
    },
    'recycle.lock': function (o) {
      if (WA.chatRecycle && typeof WA.chatRecycle.lock === 'function') return WA.chatRecycle.lock(o.file);
      return { ok: false, reason: 'unsupported' };
    },
    'recycle.restore': function (o) {
      if (WA.chatRecycle && typeof WA.chatRecycle.restore === 'function') return WA.chatRecycle.restore(o.file);
      return { ok: false, reason: 'unsupported' };
    },
    // 只出清单：purged 恒 0，真正的删除由宿主执行（见上面纪律 ①）。
    'recycle.enforce': function (o) {
      if (WA.chatRecycle && typeof WA.chatRecycle.enforce === 'function') return WA.chatRecycle.enforce();
      return { ok: false, reason: 'unsupported' };
    }
  };
    return ROUTES;
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/action-desk-routes.js', { kind: 'routes', ver: '2.529.0' });
  }
})();
