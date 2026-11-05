# V12 全文件深度审计证据账

状态：338/338 顶层 JavaScript 已完成静态逐文件取证。

## 统计

| 分类 | 数量 |
|---|---:|
| wired | 140 |
| read-only | 154 |
| ui-only | 35 |
| island | 9 |

## 逐文件证据

| 文件 | 行数 | 命名空间/API | 写字段 | 事务 | 消费者 | UI消费 | 工作流 | 测试引用 | 分类 |
|---|---:|---|---|---:|---:|---:|---|---:|---|
|  | 937 | act / KINDS, ACTIVE, TERMINAL, CONFIRMERS, NO_CONFIRMER, VERDICTS, slice, getSettings, settings, setSettings, function, saveSettings | acts | 1 | 8 | 2 | after | 25 | wired |
|  | 2014 | actionDesk / STATES, slice, KINDS, ROUTES, keys, getSettings, settings, setSettings, function, saveSettings, board, plan | people, actionDesk, receipts, opportunities, customLax | 5 | 3 | 1 |  | 57 | wired |
|  | 427 | actionMethods / getSettings, settings, setSettings, function, saveSettings, assign, declareTask, getTask, evaluate, execute, stat, statView |  | 0 | 1 | 0 |  | 8 | read-only |
|  | 1078 | activity / STATUS, slice, ROLES, getSettings, settings, setSettings, function, saveSettings, assign, plan, open, signup | activity, present, lastRound, currentCycle, lastDay, lastActivityId, historyActivities | 16 | 2 | 1 |  | 7 | wired |
|  | 208 | affect / WORDS, slice, LOADS, getSettings, settings, setSettings, function, saveSettings, assign, setChannel, setLoad, channel | affect | 3 | 2 | 1 |  | 5 | wired |
|  | 577 | aftermathImpact / inspectImpact, findDetour, commissionRepair, triggerIncident, settleRedress, listIncidents, triggerCascadingChain, interveneCascadingChain, advanceCascadingChains, listCascadingChains | aftermathImpact, people | 5 | 2 | 0 |  | 4 | wired |
|  | 377 | aftermath / getSettings, setSettings, function, register, repair, inspect, active, pending, view, cancel, buildBlock, diagnose |  | 3 | 6 | 2 |  | 7 | wired |
|  | 584 | agency / getSettings, settings, setSettings, function, saveSettings, assign, schedule, processReceipts, buildBlock, diagnose, stat, faults |  | 3 | 3 | 2 |  | 8 | wired |
|  | 358 | agenda / getSettings, setSettings, function, upcoming, soon, overdueList, sources, diagnose, stat, reset |  | 0 | 2 | 1 |  | 7 | read-only |
|  | 305 | antiOmniscience / canCharacterKnow, filterInjectKnowledge, auditGeneratedContent, buildBlock, getSettings, settings, setSettings, saveSettings, stat |  | 0 | 2 | 1 |  | 3 | read-only |
|  | 199 | appearance / TIERS, TIER_LABELS, FORMS, FORM_LABELS, LAYERS, LAYER_LABELS, WEIGHT_RELATIONS, COVERAGE_REQ, getSettings, settings, setSettings, function | appearance | 1 | 1 | 1 |  | 2 | ui-only |
|  | 101 | archiveHide / getSettings, settings, setSettings, function, saveSettings, assign, plan, shouldHide, stat, faults |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 327 | atlas / getSettings, settings, setSettings, function, saveSettings, places, routes, relations, view, diagnose, stat |  | 0 | 4 | 1 |  | 5 | read-only |
|  | 163 | autoHide / getSettings, settings, setSettings, saveSettings, view, plan, mark, revoke, list, isHidden, clear, stat |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 253 | backstageTone / getSettings, settings, setSettings, saveSettings, view, era, voiceCheck, socialHint, noteAdd, noteList, noteClear, zhNum |  | 2 | 2 | 1 |  | 2 | wired |
|  | 1120 | backstage / getSettings, loadSettings, budgetHeadroom, stored, null, resolved, last, advice, note, catch, injectBudget, resolveBudget | chronicle, worldPulse, worldFacts, people, currents, echoes, nextTurnInjection | 4 | 15 | 3 | before,after | 29 | wired |
|  | 162 | beastBond / METHODS, METHOD_INIT, getSettings, settings, setSettings, function, saveSettings, assign, register, train, bond, read | beastBond | 3 | 1 | 1 |  | 2 | ui-only |
|  | 290 | beatFacade / ENGINES, slice, BLOCK_ENGINES, OPS, keys, getSettings, settings, setSettings, function, saveSettings, assign, status |  | 0 | 1 | 1 |  | 8 | read-only |
|  | 297 | beatLedger / STATUSES, slice, getSettings, settings, setSettings, function, saveSettings, assign, plan, land, claim, transition | beatLedger | 4 | 5 | 2 |  | 9 | wired |
|  | 156 | beatMask / getSettings, settings, setSettings, function, saveSettings, assign, plan, advance, peek, due, buildBlock, clear | beatMask | 3 | 1 | 1 |  | 1 | ui-only |
|  | 278 | beatReport / VERDICTS, slice, getSettings, settings, setSettings, function, saveSettings, assign, report, view, buildBlock, diagnose | beatReport | 1 | 2 | 2 |  | 5 | ui-only |
|  | 215 | beat / getSettings, settings, setSettings, saveSettings, view, extract, repair, parseOrExtract, validateId, validateList, categoryOf, hue |  | 0 | 1 | 0 |  | 2 | read-only |
|  | 146 | binding / SCOPES, slice, getSettings, settings, setSettings, function, saveSettings, assign, bind, read, unbind, list | binding | 2 | 0 | 0 |  | 1 | island |
|  | 157 | bonds / TYPES, slice, getSettings, settings, setSettings, function, saveSettings, assign, setBond, read, network, buildBlock | bonds | 1 | 9 | 1 |  | 14 | wired |
|  | 456 | branchDiff / getSettings, settings, setSettings, function, saveSettings, assign, semanticDiff, triDiff, transplant, catalog, stat, stat_ |  | 0 | 2 | 1 |  | 3 | read-only |
|  | 309 | branchTree / getSettings, settings, setSettings, function, saveSettings, assign, fork, choose, tree, compare, replay, stat |  | 2 | 3 | 1 |  | 7 | wired |
|  | 497 | bridge / id, BRIDGE_ID, version, BRIDGE_VERSION, FLOOR_GAP, buildSnapshot, splitCurrents, refresh, snapshot, invalidate, settings, function |  | 0 | 6 | 1 | after | 15 | read-only |
|  | 142 | calendarPlan / getSettings, settings, setSettings, function, saveSettings, assign, setMonths, getMonths, label, labelNow, clear, stat | calendarPlan | 2 | 0 | 0 |  | 1 | island |
|  | 150 | calendar / setClock, label, transact, if, emit, advanceDay, get, String, indexOf, split, part, source |  | 1 | 4 | 1 | after | 7 | wired |
|  | 592 | campaign / PREDICATES, slice, getSettings, settings, setSettings, function, saveSettings, templates, planOf, planSave, planList, planDelete | pred, failWhen, branchCond, campaign | 1 | 3 | 1 |  | 7 | wired |
|  | 739 | canon / LIMITS, getSettings, settings, setSettings, saveSettings, buildOutline, adopt, clearOutline, locate, coordOf, actsBrief, actText | canon | 2 | 5 | 2 |  | 7 | wired |
|  | 189 | capabilityAudit / getSettings, settings, setSettings, function, saveSettings, audit, dormantMechanisms, summary, stat, statOf, REG |  | 0 | 3 | 1 |  | 4 | read-only |
|  | 635 | capabilityTier / TIERS, TIER_NAMES, L3_EXCLUDES, MAX_HISTORY, getSettings, settings, applyTier, rollback, view, list, stat, statOf |  | 0 | 7 | 2 |  | 32 | read-only |
|  | 450 | capacityAudit / getSettings, setSettings, function, obligations, waterline, reclaimable, migrationCheck, sources, diagnose, stat, reset |  | 0 | 4 | 2 |  | 6 | read-only |
|  | 426 | careChain / registerCareCommitment, assessCaregiverAbsence, reportCareAbsence, referCare, queueForPublicCare, careChainProjection, ESCALATION_LEVELS, slice | careChain | 5 | 1 | 0 |  | 3 | wired |
|  | 1014 | causal / STAGES, TERMINAL, getSettings, settings, setSettings, function, saveSettings, assign, addChain, tick, due, settle | causal, status, settledAt, echoes, dueAt, worldFacts | 1 | 10 | 2 |  | 26 | wired |
|  | 71 | chapters / start, title, transact, if, push, assign, current, endedAt, clockNow, nextNo, no, script |  | 2 | 2 | 1 | before | 4 | wired |
|  | 410 | chatcache / NS, init, scheduleTick, runTick, pushLiveNow, mirrorOwner, readNamespace, chatId, owner, current, cid, foreign |  | 0 | 0 | 0 |  | 2 | read-only |
|  | 748 | checkpoints / SCOPES, FORMAT, GUARDED, getSettings, settings, setSettings, function, saveSettings, assign, topKeys, resolveScope, lineage | schemaVersion, meta, parents | 1 | 6 | 2 |  | 8 | wired |
|  | 277 | chronicleView / getSettings, setSettings, function, entries, entry, hiddenSummary, coverage, sources, diagnose, stat, reset |  | 0 | 3 | 1 |  | 7 | read-only |
|  | 468 | chrono / REASONS, getSettings, settings, setSettings, function, saveSettings, assign, record, layer, derives, undo, applyUndo | chrono | 1 | 7 | 2 |  | 7 | wired |
|  | 671 | collab / REASONS, STRATEGIES, getSettings, settings, setSettings, function, saveSettings, assign, open, close, claim, release | collab | 11 | 4 | 1 |  | 9 | wired |
|  | 479 | commission / getSettings, setSettings, function, create, advance, settle, cancel, view, pending, buildBlock, diagnose, stat |  | 3 | 7 | 2 |  | 13 | wired |
|  | 421 | commonsGovernance / declareCommonAsset, reserveCommonAsset, changeGovernanceModel, contributeMaintenance, auditAssetDecay, resolveAssetDispute, commonsProjection, GOVERNANCE_MODELS, slice, ASSET_STATUS | commonsGovernance | 7 | 1 | 0 |  | 3 | wired |
|  | 170 | communityNote / getSettings, settings, setSettings, saveSettings, view, push, pending, ack, markSeen, isSeen, list, clear |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 115 | compactTiming /  |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 277 | compare / getSettings, settings, setSettings, saveSettings, view, diff, toLines, merge, strip, hasResidue, variants, tableOf |  | 0 | 1 | 0 |  | 2 | read-only |
|  | 649 | contest / KINDS, slice, STATUSES, OUTCOMES, PARTIAL_BAND, getSettings, settings, setSettings, function, saveSettings, assign, open | contest | 8 | 1 | 1 |  | 4 | ui-only |
|  | 493 | digest, contractAudit / PROBE_TAG, PROBES, FIELDS, SEEDS, LIVE_DELEGATED, ENUM_ALIGN, CROSS_MODULE, parseContract, consumedFields, audit, summaryText, flatten | evolution | 1 | 3 | 1 |  | 4 | wired |
|  | 913 | coop / STATUS, slice, STATUS_CN, assign, LIMITS, getSettings, settings, setSettings, function, saveSettings, propose, confirm | coop | 3 | 3 | 0 |  | 9 | wired |
|  | 276 | coordinate / getSettings, settings, setSettings, saveSettings, view, anchorAdd, anchorOf, index, decode, encode, capture, parseLine |  | 2 | 2 | 1 | after | 2 | wired |
|  | 266 | creditLedger /  | creditLedger | 6 | 0 | 0 |  | 1 | island |
|  | 1153 | customLax / spawnCandidate, submitToApproval, enactRule, registerDissatisfaction, reviewRule, activeRules, establishPrecedent, evaluatePrecedent, adoptRuleFromPrecedent, listPrecedents, recordFavor, requestAid | customLax, people | 19 | 3 | 0 |  | 7 | wired |
|  | 540 | dayRoute / getSettings, settings, setSettings, saveSettings, build, stat, reset, boundary, scheduleDomain, storyDay, ACTION_TEXT, assign |  | 0 | 3 | 2 |  | 5 | read-only |
|  | 226 | deepClean / getSettings, settings, setSettings, saveSettings, view, status, freeze, scan, prepare, review, apply, digest |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 198 | deferToken /  |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 534 | demographicFlow / setPlaceCapacity, planMigration, commitMigration, arriveMigration, recordSeasonalDeparture, recordSeasonalReturn, demographicProjection | demographicFlow, people | 6 | 1 | 0 |  | 3 | wired |
|  | 512 | depCheck / getSettings, settings, setSettings, function, saveSettings, catalog, check, prepare, diagnose, stat |  | 0 | 3 | 1 |  | 4 | read-only |
|  | 102 | difficulty / RESISTANCE, STANCE, PACE, COST, FLOW, getSettings, settings, setSettings, function, setProfile, effective, actionCost |  | 0 | 2 | 2 |  | 6 | read-only |
|  | 189 | digest /  |  | 1 | 2 | 1 |  | 3 | wired |
|  | 620 | diplomacy / TERMS, slice, STATES, STAGES, CODES, TERM_LABEL, assign, STATE_LABEL, getSettings, settings, setSettings, function | diplomacy, pairs, proposals | 6 | 8 | 2 |  | 11 | wired |
|  | 121 | directEvent / create, getChannel, if, log, ok, max, min, getCtx, slice, map, String, join | directEvents | 3 | 1 | 1 | before,after | 1 | ui-only |
|  | 111 | dreamSettle /  |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 294 | dream / getSettings, settings, setSettings, saveSettings, view, weave, onset, threadOf, threadList, archive, volumeList, volumeGet |  | 3 | 2 | 1 |  | 2 | wired |
|  | 903 | driverLedger / getSettings, setSettings, view, function, noteCall, why, summaryText, stat |  | 0 | 3 | 1 |  | 8 | read-only |
|  | 440 | ecoAudit / CATS, slice, CAT_LABEL, assign, LEVEL_OF, PERF_SOURCE, getSettings, settings, setSettings, saveSettings, sweep, lastSweep |  | 0 | 3 | 1 |  | 4 | read-only |
|  | 540 | economy / MONEY, MONEY_DEF, RECIPES, RECIPES_DEF, LANES, slice, economySpec, spec, money, declaredBase, recipeOf, recipeKeys | economy | 8 | 14 | 2 |  | 33 | wired |
|  | 178 | editorEvents / TYPE_STAGES, TERMINAL, POSITIVE_TERMINAL, MAX_EVENTS, MAX_LEVEL, MAX_STAGE_ROUND, DESC_MAXLEN, list, stagesOf, findIndex, add, update |  | 0 | 6 | 1 |  | 4 | read-only |
|  | 176 | editorFaction / STATUSES, RELATIONS, MAX_FACTIONS, MAX_PILLARS, PILLAR_MAXLEN, REL_WEIGHT, STATUS_COEF, list, validate, add, update, remove |  | 0 | 7 | 1 |  | 6 | read-only |
|  | 368 | elsewhere / getSettings, settings, setSettings, saveSettings, open, update, reconcile, romance, remove, card, list, view | elsewhere | 4 | 3 | 1 | after | 12 | wired |
|  | 179 | enemies / ENEMY_STATUS, ENEMY_TYPE, ASSET_STATUS, MAX_ACTIVE, TERMINATED_MAX, TERMINATED_KEEP, apply, draft, slice, forEach, if, isArray |  | 0 | 4 | 1 | before | 2 | read-only |
|  | 154 | enigma / getSettings, settings, setSettings, function, saveSettings, assign, mark, unmark, drop, read, outsiders, buildBlock | enigma | 3 | 2 | 1 |  | 8 | wired |
|  | 307 | ensemble / STRATEGIES, slice, getSettings, settings, setSettings, function, saveSettings, assign, normalize, agreementOf, concurrency, run |  | 0 | 0 | 0 |  | 3 | read-only |
|  | 236 | entities /  | evolution | 0 | 4 | 1 |  | 3 | wired |
|  | 270 | entryRouter / listCandidates, setCandidate, removeCandidate, clearCandidates, isPassive, plan, applyPlan, clearCache, lastFailure, lastRoute, recentMessages, ROUTE_SYS |  | 0 | 1 | 1 | before | 1 | read-only |
|  | 589 | envCapacity / declareResource, withdraw, regenerate, regionStatus, evaluateImpact, declareRecyclableMaterial, generateScrap, recycleScrap, materialLifecycle, RESOURCE_TYPES, slice, STRAIN_LEVELS | envCapacity | 7 | 2 | 0 |  | 6 | wired |
|  | 98 | ephemeralScrub /  |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 444 | epistemicView / registerBelief, buildView, deriveAction, correctBelief, decideAction, weighEvidence, updateBeliefWithEvidence | epistemicStore | 4 | 3 | 1 |  | 5 | wired |
|  | 141 | eraCycle / STAGES, STAGE_LABELS, getSettings, settings, setSettings, function, saveSettings, assign, init, tick, read, buildBlock | eraCycle | 2 | 1 | 1 |  | 2 | ui-only |
|  | 769 | events / KINDS, ACTIVE, TERMINAL, getSettings, settings, setSettings, function, saveSettings, assign, schedule, due, claim | events | 5 | 5 | 2 | before | 21 | wired |
|  | 508 | evidenceBoard / EDGE_TYPES, slice, getSettings, settings, setSettings, function, saveSettings, assign, board, assertClaim, retract, gather |  | 0 | 1 | 1 |  | 6 | read-only |
|  | 452 | evolution / STAGE_MAP, TERMINAL, REPUTATION_LEVELS, FACTION_STATUS, FACTION_RELATION, ECONOMY_CLIMATE, roundOf, getSettings, loadSettings, setSettings, saveSettings, normalize | evolution | 6 | 26 | 2 | after,before | 62 | wired |
|  | 413 | factionGraph / RELATION_KEYS, function, relations, slice, STATUS_KEYS, statusesAvailable, getSettings, settings, setSettings, saveSettings, assign, buildGraph |  | 0 | 5 | 1 |  | 6 | read-only |
|  | 462 | familyOps / setBudget, handleGap, inheritRatio, retireMember, advanceCycle | familyOps, people | 7 | 1 | 0 |  | 3 | wired |
|  | 480 | family / getSettings, settings, setSettings, function, saveSettings, assign, createUnit, addMember, removeMember, contribute, spend, assignCare | family, people | 8 | 3 | 1 |  | 13 | wired |
|  | 596 | farfield / TRENDS, slice, TREND_LABEL, assign, LANE_SPEED, getSettings, settings, setSettings, saveSettings, partition, tick, deliver | farfield | 1 | 7 | 2 | after | 5 | wired |
|  | 511 | fate / getSettings, settings, setSettings, saveSettings, view, parse, resolveCountNote, isArithmeticSyntax, evalArith, evalFormula, roll, check | mode | 0 | 3 | 1 |  | 4 | wired |
|  | 152 | fieldWriters / FIELDS, entryOf, writersOf, conflicts, undeclaredConflicts, stat, view |  | 0 | 0 | 0 |  | 3 | read-only |
|  | 312 | firstRun / DEF, assign, STEPS, getSettings, settings, setSettings, saveSettings, build, next, dismiss, resume, mark |  | 0 | 3 | 2 |  | 7 | read-only |
|  | 248 | floorChanges / MAX_EVENTS, MAX_LIST, markSubscribed, onFloorEvent, sweep, guardReconcile, plan, stat, stateText, reset, __state, function |  | 0 | 3 | 1 |  | 1 | read-only |
|  | 386 | floorSettle / getSettings, settings, setSettings, saveSettings, beginRound, endRound, rollback, rollbackFrom, scopeOf, onFloorEvent, list, view | floorSettle | 4 | 2 | 1 |  | 3 | wired |
|  | 233 | floorSnapshot / getSettings, settings, setSettings, saveSettings, view, buildBlock, push, markCleared, rollback, at, list, clear |  | 0 | 2 | 1 |  | 2 | read-only |
|  | 142 | followupGate /  | followupGate | 3 | 0 | 0 |  | 1 | island |
|  | 456 | fondness / getSettings, settings, setSettings, function, saveSettings, assign, apply, propose, accept, reject, undo, correct | fondness | 8 | 4 | 1 |  | 14 | wired |
|  | 274 | foreshadow / STATUS, slice, ACTIVE, TERMINAL, getSettings, settings, setSettings, function, saveSettings, assign, track, develop |  | 4 | 3 | 2 |  | 5 | wired |
|  | 461 | freight / getSettings, settings, setSettings, function, saveSettings, assign, dispatch, arrive, cancel, reroute, issueShadowRation, view | freight, economy, status, arrivedAt, updatedAt, cancelledAt, refund, loss, reroutedFrom, routeId, eta, cost, lane | 5 | 8 | 2 |  | 16 | wired |
|  | 168 | gauge / MILESTONES, BAND_BREAKS, slice, getSettings, settings, setSettings, function, saveSettings, assign, create, step, read | gauge | 2 | 2 | 1 |  | 11 | wired |
|  | 391 | gear / CARRIES, slice, getSettings, settings, setSettings, function, saveSettings, assign, declareSlot, make, use, lend | gear | 8 | 4 | 1 |  | 10 | wired |
|  | 373 | genGate / KINDS, slice, getSettings, settings, setSettings, function, saveSettings, assign, gate, record, antiRepeat, add |  | 0 | 2 | 2 |  | 5 | read-only |
|  | 344 | genTiming / getSettings, settings, setSettings, function, saveSettings, tick, ackSent, read, buildBlock, inQuiet, atMs, posterior | genTiming | 2 | 2 | 1 |  | 2 | wired |
|  | 420 | geoTracker / VERSION, __REG, settings, saveSettings, readLocationMarks, registerPlace, resolveLocation, updateCharacterLocation, buildBlock | geoTracker | 2 | 3 | 2 |  | 2 | wired |
|  | 108 | groupGuard / detect, guard, isGroup, stat, function, assign, faults |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 366 | handoffPack / DEF, assign, BOUNDS, PACK_VER, getSettings, settings, setSettings, saveSettings, pack, verify, restore, suggest |  | 0 | 3 | 2 |  | 5 | read-only |
|  | 421 | hazard / getSettings, settings, setSettings, function, saveSettings, assign, open, bump, roll, tick, confirm, read | hazard | 7 | 2 | 2 | after | 6 | ui-only |
|  | 1026 | healthPreflight / inspectAndSanitize, checkSpatialConsistency, buildBlock, getSettings, settings, setSettings, saveSettings, stat, threeGates, threeGatesLine, firstRunView, firstRunLine |  | 0 | 4 | 2 |  | 8 | read-only |
|  | 562 | historySearch / FORMAT, FACES, slice, FACE_LABELS, assign, ROUTES, LS_KEY, CAPS, catalog, search, searchIn, count | people | 0 | 2 | 1 |  | 3 | wired |
|  | 408 | horizon / rollLane, acceptResult, buildPromptBlock, snapshot, stat, laneCfg, getSettings, loadSettings, setSettings, saveSettings, normalize, __REG | evolution | 6 | 3 | 1 |  | 3 | wired |
|  | 266 | hostWbTrace / MAX_NAMES, MAX_ROUNDS, SYS_MARK, markSubscribed, onActivated, capture, crossCheck, stat, stateText, reset, normalizePayload, isSystemEntry |  | 0 | 4 | 2 |  | 1 | read-only |
|  | 132 | identityMatch /  |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 1192 | injectBudget / DEFAULT_BUDGET, MIN_KEEP_TOKENS, FOLD_FLOOR_TOKENS, PRIORITY, AUTO_RATIO, AUTO_MIN, AUTO_MAX, autoBudget, resolveBudget, resolveContextSize, tokensOf, rankOf | body | 0 | 7 | 2 |  | 23 | wired |
|  | 116 | injectChannel / POS, DEFAULT_POS, SLOT_PREFIX, normPos, routeBySlot, planSlots, applySlots |  | 0 | 2 | 1 |  | 1 | read-only |
|  | 166 | injectCollector / getSettings, settings, setSettings, function, saveOrThrow, REG, normalize, assign, buildBlock, diagnose, get, if |  | 0 | 3 | 2 |  | 5 | read-only |
|  | 257 | injectInspector / SENTINEL, STATUS_TEXT, init, markRegistered, snapEnv, classify, snapshotChat, snapshotText, getLastSnapshot, statusText, flatten, reset |  | 0 | 3 | 2 |  | 3 | read-only |
|  | 215 | injectSlotAudit / snapshotSlots, audit, routeAudit |  | 0 | 2 | 2 |  | 1 | read-only |
|  | 404 | injectValue / observe, settle, report, stat, statOf, getSettings, settings, setSettings | frags, toks | 0 | 5 | 2 |  | 3 | wired |
|  | 393 | inlineTags / VERSION, SOURCE, parse, strip, apply, read, normalizeDate, hasTag, function, test, String, evaluateCondition | chronicle, worldFacts | 2 | 1 | 0 |  | 2 | wired |
|  | 534 | inspectorState / CHECKERS, SEVERITY_ORDER, checkEvents, checkFactions, checkPulse, checkPeople, checkMemory, checkRefs, checkSoftRefs, checkInjection, checkPmem, checkDirectEvents | values | 0 | 2 | 1 |  | 3 | wired |
|  | 487 | inst / PERMS, slice, KINDS, REASONS, TERMINAL, getSettings, settings, setSettings, function, saveSettings, assign, charter | inst | 9 | 6 | 2 |  | 12 | wired |
|  | 417 | institutionalInertia / establishCharter, triggerSuccessionHandover, resolveSuccessionPath, auditInstitutionalDecay, institutionalInertiaProjection, submitBureaucraticReport, SUCCESSION_PATHS, slice, CHARTER_STATUS | institutionalInertia | 6 | 1 | 0 |  | 4 | wired |
|  | 222 | intake / getSettings, settings, setSettings, function, saveSettings, assign, run, view, MAPPING, stat, reasons, byEngine |  | 0 | 1 | 0 |  | 7 | read-only |
|  | 448 | intel / LEVELS, CONFIDENCE, CONF, getSettings, settings, setSettings, function, saveSettings, assign, addLink, addIntel, releaseDue | people, currents, intelQueue | 7 | 11 | 2 |  | 18 | wired |
|  | 228 | intentBoard / getSettings, settings, setSettings, saveSettings, board, buildBlock, view, stat, reset, _blockedText |  | 0 | 5 | 2 |  | 3 | read-only |
|  | 298 | interestFace /  | observers | 0 | 1 | 0 |  | 1 | wired |
|  | 229 | interop / PARTNERS, PARTNER_LABEL, STATES, HOST_NEED, HOST_NICE, probePartner, probeAll, freeze, compatGaps, summaryText, stat, function |  | 0 | 2 | 1 |  | 4 | read-only |
|  | 571 | investigation / getSettings, setSettings, function, register, investigate, extractFromTrace, checkEvidence, reveal, pending, view, buildBlock, diagnose |  | 3 | 6 | 2 |  | 11 | wired |
|  | 537 | kaleidoscope / listDerives, setDerive, removeDerive, clearDerives, listRules, setRule, removeRule, clearRules, evaluate, buildBlock, snapshot, lastFailure |  | 0 | 1 | 1 | before | 4 | read-only |
|  | 203 | karma / KINDS, STAGE_LABEL, getSettings, settings, setSettings, function, saveSettings, assign, record, offset, balance, intervene | karma | 3 | 1 | 1 |  | 9 | ui-only |
|  | 364 | knowledgePractice / registerKnowledgeSpec, grantPracticeLicense, executePractice, refineKnowledgeFromEvidence, knowledgePracticeProjection, PRACTICE_STATUS, slice | knowledgePractice | 5 | 1 | 0 |  | 3 | wired |
|  | 149 | l3Registry / ENTRIES, CLASSES, CLS, byClass, zeroArgDrivers, entryOf, stat, view |  | 0 | 1 | 0 |  | 6 | read-only |
|  | 668 | laborSchedule / SLOTS, slice, getSettings, settings, setSettings, function, saveSettings, assign, claim, transfer, book, isBooked | laborSchedule, people | 10 | 7 | 1 |  | 13 | wired |
|  | 170 | ladder / getSettings, settings, setSettings, function, saveSettings, assign, define, escalate, deescalate, drop, read, buildBlock | ladder | 4 | 1 | 1 |  | 5 | ui-only |
|  | 230 | ledgerTimeline / MAX_SITES, MAX_STEPS, note, siteStat, stat, summaryText, reset, probe, probeDefault, __sites |  | 0 | 4 | 2 |  | 1 | read-only |
|  | 125 | ledger /  |  | 3 | 2 | 1 |  | 37 | wired |
|  | 157 | lengthPolicy / getSettings, settings, setSettings, saveSettings, view, parse, targetOf, parseNumber, parseChineseNumber, tierOf, stat, function |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 589 | liaison / STAGES, slice, STAGE_CN, assign, SCOPES, DEAL_STATUS, getSettings, settings, setSettings, function, saveSettings, receive | liaison, status, fulfilment, settledAt, updatedAt, people | 1 | 0 | 0 |  | 5 | island |
|  | 570 | life / ACTIONS, COMMITMENTS, getSettings, settings, setSettings, function, saveSettings, assign, addGoal, addCommitment, addSchedule, tick | people | 4 | 10 | 2 |  | 32 | wired |
|  | 305 | lifeline / KINDS, slice, COURSE, LIMITS, STEPS, getSettings, settings, setSettings, function, saveSettings, assign, register | lifeline | 2 | 7 | 2 |  | 7 | wired |
|  | 151 | limits /  |  | 0 | 1 | 0 |  | 6 | read-only |
|  | 208 | lingqi / getSettings, settings, setSettings, saveSettings, view, buildBlock, register, seed, listSkills, route, normalizeSkill, stat |  | 0 | 2 | 1 |  | 1 | read-only |
|  | 1330 | livingWorld / DAY_PERIODS, PERIOD_LABELS, OCCUPATIONAL_ROUTINES, getSettings, settings, setSettings, saveSettings, registerRoutine, deflectTrajectory, propagateRipple, recordRelationalDebt, redeemDebt | livingWorld, customRoutine, occupation, people, vitalStrain, worldFacts | 11 | 3 | 1 | after | 10 | wired |
|  | 100 | longline / TERMINAL, slice, getSettings, settings, setSettings, function, saveSettings, assign, promise, overdue, sweep, pressure |  | 1 | 5 | 2 |  | 4 | wired |
|  | 647 | lonshaReader /  |  | 0 | 4 | 1 |  | 3 | read-only |
|  | 224 | marginal / getSettings, settings, setSettings, function, saveSettings, assign, open, gain, reset, cool, tick, read | marginal | 6 | 1 | 1 |  | 3 | ui-only |
|  | 95 | masks / getSettings, settings, setSettings, function, saveSettings, assign, setMask, dropMask, read, buildBlock, stat, faults | masks | 2 | 1 | 1 |  | 2 | ui-only |
|  | 193 | memorySampler / DEFAULT_DICE_SIDES, MIN_SIDES, MAX_SIDES, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT, exponentialSample, loadSamplerSettings, samplerCfgStat, fallbacks, lastField, lastRaw |  | 0 | 4 | 2 |  | 1 | read-only |
|  | 212 | memoryTiers / getSettings, settings, setSettings, saveSettings, view, buildBlock, knot, sink, tierOf, list, clearTier, stat |  | 0 | 2 | 1 |  | 1 | read-only |
|  | 252 | memory / pruneForeshadows, stats, rounds, lastMs, avgMs, round, max, lastAt, layers, parse, stringify, claimStat |  | 4 | 5 | 2 | after | 18 | wired |
|  | 290 | mend / ACTS, slice, STATUS, TERMINAL, getSettings, settings, setSettings, function, saveSettings, assign, mark, step | mend | 3 | 2 | 2 |  | 3 | ui-only |
|  | 210 | modelink / getSettings, settings, setSettings, saveSettings, view, isMvuComment, updateBlocks, stripArtifacts, residue, matchEntry, parseFlow, draftAdd |  | 3 | 1 | 0 |  | 2 | wired |
|  | 309 | moodGlide / getSettings, settings, setSettings, function, saveSettings, set, glide, miss, read, buildBlock, setBaseline, baselineOf | moodGlide | 4 | 2 | 1 |  | 2 | wired |
|  | 164 | motif / getSettings, settings, setSettings, function, saveSettings, assign, note, tick, used, drop, clear, buildBlock | motif | 4 | 1 | 1 |  | 1 | ui-only |
|  | 285 | motiveArbitration / DIMENSIONS, getBaseWeights, getEffectiveWeights, evaluate, decide |  | 0 | 1 | 0 |  | 4 | read-only |
|  | 224 | narrativeDeduction / auditDualTrack, compensateStall, auditRuleClash, generateSpinOffSnapshot, noteTimeline, timeline, getSettings, settings, setSettings, saveSettings, stat | narrativeDeduction | 1 | 0 | 0 |  | 2 | island |
|  | 709 | noesis / getSettings, settings, setSettings, function, saveSettings, assign, knows, perceive, gateScene, leakScan, duty, dutyGate |  | 0 | 10 | 2 |  | 12 | read-only |
|  | 132 | observationProjection /  |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 177 | observeSlice / getSettings, settings, setSettings, saveSettings, view, slice, extractAnchor, isMicroScene, actionProvesPerception, isObservationPrompt, stat, function |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 551 | offlineReturn / getSettings, settings, setSettings, saveSettings, recover, consume, stat |  | 1 | 2 | 1 | before,after | 6 | wired |
|  | 476 | offlineTick / KINDS, slice, KIND_LABEL, assign, getSettings, settings, setSettings, saveSettings, anchor, release, anchorPaths, tick | offlineTick | 3 | 5 | 2 |  | 11 | wired |
|  | 217 | oneShotMod / getSettings, settings, setSettings, function, saveSettings, dose, advance, consume, flush, read, buildBlock, KINDS | oneShotMod | 4 | 2 | 1 |  | 2 | wired |
|  | 598 | operations / getSettings, setSettings, function, enact, disburse, settle, handover, active, pending, view, cancel, trackSafehouseExposure | operations | 4 | 5 | 2 |  | 9 | wired |
|  | 173 | opinion / getSettings, loadSettings, setSettings, saveSettings, normalize, __REG, assign, generate, getChannel, if, ok, false |  | 2 | 2 | 2 | after | 3 | ui-only |
|  | 565 | opportunity / SOURCES, slice, SOURCE_CN, assign, STAGES, ACTIVE, CHOICES, getSettings, settings, setSettings, function, saveSettings | opportunity | 3 | 3 | 2 |  | 6 | wired |
|  | 1099 | org / KINDS, getSettings, settings, setSettings, function, saveSettings, assign, grant, transfer, canAfford, stockOf, buildBlock | people | 12 | 12 | 2 |  | 21 | wired |
|  | 527 | outlineInject / getSettings, settings, setSettings, saveSettings, view, plan, extractFromEnd, parseEntries, apply, updateCapability, preview, undo |  | 0 | 2 | 1 |  | 3 | read-only |
|  | 206 | outputGuard / getSettings, settings, setSettings, function, saveSettings, check, checkAndRemember, extract, overlap, read, buildBlock, SPEAK_MARKS |  | 0 | 2 | 1 |  | 1 | read-only |
|  | 102 | parallelEvents / getSettings, settings, setSettings, function, saveSettings, assign, add, resolve, active, buildBlock, stat, faults | parallelEvents | 2 | 1 | 1 |  | 3 | ui-only |
|  | 408 | parallelWorld / IMPACTS, IMPACT_LABEL, INJECT_MIN_IMPACT, CAP_NPCS, CAP_RELATIONS, CAP_MODULES, CAP_SNAPSHOTS, AUTO_MODES, LS_KEY, KB_KEYS, getSettings, loadSettings | parallelWorld | 7 | 2 | 1 | before,after | 4 | wired |
|  | 261 | pathEcho / record, recordExpectation, realizeOutcome, getLearnings, clear | people | 1 | 3 | 0 |  | 3 | wired |
|  | 631 | pendingCenter / getSettings, setSettings, function, items, soon, bySource, describe, act, timeline, diagnose, stat, reset |  | 0 | 4 | 1 |  | 8 | read-only |
|  | 385 | perfBaseline / getSettings, setSettings, function, bands, budget, readings, gap, sources, diagnose, stat, reset |  | 0 | 2 | 1 |  | 5 | read-only |
|  | 199 | perfLedger / ingest, trend, getSettings, settings, stat |  | 0 | 8 | 2 |  | 7 | read-only |
|  | 986 | perfTrace / LAYERS, LAYER_LABEL, SPANS, CLASSES, CLASS_DEF, HISTORY_CAP, FINGERPRINT_CAP, fingerprint, mark, dirtyOf, dirtyAll, consume | sum, min, max, lastMs, lastAt, ring | 0 | 3 | 1 |  | 10 | wired |
|  | 83 | periodicals /  | periodicals | 2 | 2 | 1 |  | 3 | wired |
|  | 311 | personaAnchor / getSettings, settings, setSettings, function, saveSettings, assign, registerAnchor, getAnchor, evaluateDrift, auditGeneratedContent, buildBlock, stat | personaAnchor | 1 | 2 | 1 |  | 2 | wired |
|  | 500 | perspective / getSettings, settings, setSettings, function, saveSettings, assign, current, allows, audit, leakScan, buildBlock, boundary | perspective | 1 | 4 | 3 |  | 8 | wired |
|  | 621 | phaseTransition / evaluatePhase, transition, history, declarePlaceLayout, investPath, evaluatePlacePath, planTransitionRoute, simulateIncidentStress, executeTransitionRoute, PATH_LAYOUTS, slice, PHASES | phaseTransition | 8 | 1 | 0 |  | 4 | wired |
|  | 275 | phoneBridge / id, BRIDGE_ID, version, OPS_VERSION, PHONE_ACTS, ACT_LABEL, PHASES, getSettings, settings, setSettings, function, saveSettings | causal | 1 | 5 | 1 |  | 10 | wired |
|  | 279 | planAudit / DISASTER_WORDS, slice, PLACE_WORDS, getSettings, settings, setSettings, function, saveSettings, assign, audit, equivalent, evidence |  | 0 | 1 | 1 |  | 5 | read-only |
|  | 728 | plan / STATUS, slice, FINAL, getSettings, settings, setSettings, function, saveSettings, assign, expand, current, advance | plan, status, at, reason, seq, afterSeq | 5 | 6 | 2 |  | 18 | wired |
|  | 769 | playableBlueprint / listSamples, getSample, checkDependencies, exportPlayDefs, installSample, previewDiff, tuneConfig, migrateBlueprint, resetInitialConditions, THEME_KEYS, slice, PLAY_DEF_KEYS | world, region, evolution, blueprint, production, economy, people, serviceNetwork, customLax, envCapacity | 3 | 3 | 1 |  | 8 | wired |
|  | 358 | playableSeed / getSettings, settings, setSettings, function, saveSettings, assign, preview, seed, view, stat, reasons, byKind |  | 0 | 3 | 1 |  | 3 | read-only |
|  | 106 | playerArchive /  | people | 0 | 3 | 1 |  | 5 | wired |
|  | 258 | playtime / DATA_KEY, SOURCE_NAMES, getSettings, settings, setSettings, saveSettings, sources, story, touch, lastActive, stat | chats, v | 0 | 10 | 1 |  | 7 | wired |
|  | 357 | plotGauge / WEIGHTS, assign, getSettings, settings, setSettings, function, saveSettings, tension, trend, advice, stat, reset |  | 0 | 2 | 1 |  | 4 | read-only |
|  | 309 | pmem / SYSTEM_PROMPT, buildUserPrompt, applyPersonalMemory, recall, knows, buildBlock, extractRound, holderSet, recentText, knownPeopleNames, peopleList, CAP_TOTAL | memory | 1 | 4 | 1 | after | 3 | wired |
|  | 123 | polish / CHANNEL, getSettings, settings, setSettings, function, saveSettings, assign, variants, pick, split, stat, faults |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 638 | populate / DEF, assign, getSettings, settings, setSettings, saveSettings, plan, seed, view, stat, reset |  | 2 | 3 | 2 |  | 8 | wired |
|  | 157 | portal / getSettings, settings, setSettings, saveSettings, view, signature, digest, claim, release, reset, status, stat |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 174 | powerAnchor / getSettings, settings, setSettings, function, saveSettings, assign, anchor, drop, check, get, list, buildBlock | powerAnchor | 2 | 1 | 1 |  | 3 | ui-only |
|  | 203 | prefilterGate / getSettings, settings, setSettings, saveSettings, view, register, alias, resolveName, roster, clearRoster, screen, parseReply |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 209 | presetWorld / KINDS, slice, getSettings, settings, setSettings, function, saveSettings, assign, put, drop, preview, get |  | 0 | 2 | 0 |  | 1 | read-only |
|  | 215 | preset / SEG_KEYS, SEG_LABELS, DEFAULT_ID, getAllPresets, getActivePreset, getActivePresetId, setActivePresetId, saveCustomPreset, saveAsCustomPreset, deleteCustomPreset, getSegmentOverride, getSegmentOverrides |  | 0 | 2 | 0 |  | 2 | read-only |
|  | 115 | proactive / DRAIN_WORDS, isDrained, isEnabled, enabled, stat, pulls, skippedCooldown, skippedDisabled, skippedNotDrained, lastPullAt, lastReason | proactiveLastRound | 1 | 1 | 0 | before | 1 | wired |
|  | 439 | probe / LEVELS, slice, STATUS, VERDICT, getSettings, settings, setSettings, function, saveSettings, assign, open, openCase | probe | 5 | 5 | 2 |  | 23 | wired |
|  | 822 | production / STATUSES, slice, getSettings, settings, setSettings, function, saveSettings, assign, declareFacility, open, staff, resupply | production | 13 | 3 | 1 |  | 13 | wired |
|  | 369 | publicAgenda / setAgendaCapacity, submitProposal, scheduleAgenda, enactAgendaTopic, viewAgenda, publicAgendaProjection, TOPIC_STATUS, slice | publicAgenda | 5 | 1 | 0 |  | 3 | wired |
|  | 160 | purifyScope / getSettings, settings, setSettings, function, saveSettings, assign, protect, restore, applyWith, kinds, map, stat |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 107 | pushApiRegistry / ENTRIES, CLASSES, CLS, byClass, driveDrivers, entryOf, stat, view |  | 0 | 1 | 0 |  | 5 | read-only |
|  | 176 | quota / POOLS, getSettings, settings, setSettings, function, saveSettings, assign, add, tick, resolve, drop, list | quota | 3 | 1 | 1 |  | 4 | ui-only |
|  | 148 | reasoningStrip / getSettings, settings, setSettings, saveSettings, view, strip, hasIncomplete, trailingPartialTagLength, stat, function, parse, stringify |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 173 | reasoning / EFFORTS, slice, getSettings, settings, setSettings, function, saveSettings, directive, buildBlock, checkBody, officialOnly, stat |  | 0 | 2 | 1 |  | 3 | read-only |
|  | 686 | recipe / RECIPES, POLICIES, BASICS, THEME_CLASH, SOURCE_FILES, getSettings, settings, setSettings, function, saveSettings, assign, list |  | 0 | 7 | 1 |  | 29 | read-only |
|  | 196 | redactLayer / getSettings, settings, setSettings, saveSettings, view, redact, probe, isSecretPath, stat, function, parse, stringify |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 143 | refine / getSettings, settings, setSettings, function, saveSettings, assign, normalize, merge, condense, polish, stat, faults |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 416 | region / LANES, keys, EVENTS, slice, getSettings, settings, setSettings, function, saveSettings, assign, register, markLane | region | 4 | 8 | 2 |  | 18 | wired |
|  | 199 | regional / getSettings, loadSettings, effectiveSettings, effSettings, incidentTypes, map, function, MIN_CHANCE_PCT, MAX_CHANCE_PCT, MIN_DURATION, MAX_DURATION, setSettings | chronicle | 2 | 2 | 1 | after,after | 2 | wired |
|  | 558 | rehearsal / KINDS, slice, KIND_CN, assign, POLICIES, POLICY_CN, getSettings, settings, setSettings, function, saveSettings, run | rehearsal | 1 | 4 | 0 |  | 7 | wired |
|  | 141 | preflight / getSettings, settings, setSettings, function, saveSettings, assign, capability, preview, backup, shapeOf, stat, faults |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 943 | rejectRecovery / KINDS, slice, KIND_ACTION, assign, RULES, map, function, OVERRIDES, ARTIFACTS, NEUTRAL_REVIEW, REJECT_FACE, SUCCESS_FACE |  | 0 | 2 | 1 |  | 10 | read-only |
|  | 416 | relationGraph / getSettings, settings, setSettings, saveSettings, view, upsert, get, edgesOf, list, remove, clear, edgeIdOf | relationGraph, stance, reason, events | 5 | 3 | 1 |  | 3 | wired |
|  | 382 | relationTemp / getSettings, settings, setSettings, saveSettings, build, stat, reset, network, networkStat, DEF, assign |  | 0 | 3 | 2 |  | 6 | read-only |
|  | 182 | requestViewer / CHANNELS, function, channels, getSettings, settings, setSettings, saveSettings, assign, preview, capture, list, get |  | 0 | 2 | 0 |  | 1 | read-only |
|  | 201 | researchClosure / getSettings, settings, setSettings, function, saveSettings, assign, verifyPrereq, evaluateReadiness, recordFailureClue, stat, statView, resetStat | researchClues | 1 | 0 | 0 |  | 2 | island |
|  | 493 | research / STATUSES, slice, SCOPE, getSettings, settings, setSettings, function, saveSettings, assign, open, supply, advance | research, people, scope, transferredTo | 5 | 5 | 1 |  | 13 | wired |
|  | 699 | retrieval / VERSION, TRIGGERS, slice, TRIGGER_DUTY, assign, GUARDS, GUARD_LABEL, RECALL_HINTS, recallWanted, SOURCE_NAME, getSettings, settings |  | 0 | 4 | 2 |  | 5 | read-only |
|  | 99 | rewriter / CHANNEL, getSettings, settings, setSettings, function, saveSettings, assign, rewrite, stat, faults |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 148 | rhythmLoop / PHASES, slice, getSettings, settings, setSettings, function, saveSettings, assign, step, cool, phase, view | rhythm | 2 | 1 | 1 |  | 1 | ui-only |
|  | 327 | riskPooling / declareRiskPool, pledgeMutualFund, claimMutualRelief, disputeReliefClaim, riskPoolingProjection, POOL_STATUS, slice | riskPooling | 5 | 1 | 0 |  | 3 | wired |
|  | 156 | rivalry / getSettings, settings, setSettings, function, saveSettings, assign, declare, modulate, retire, read, buildBlock | rivalry | 3 | 1 | 1 |  | 6 | ui-only |
|  | 313 | roleConflict / registerAffiliationObligation, detectRoleConflict, resolveConflictStance, viewConflictPerception, roleConflictProjection, RESOLUTION_STANCES, slice, CONFLICT_SEVERITY | roleConflict | 4 | 1 | 0 |  | 3 | wired |
|  | 282 | roundCost / DEF, assign, BOUNDS, getSettings, settings, setSettings, saveSettings, build, stat, reset |  | 0 | 3 | 2 |  | 5 | read-only |
|  | 144 | roundDrivers / getSettings, settings, setSettings, function, saveSettings, assign, tickAll, DRIVERS, view, stat, parse, stringify |  | 0 | 1 | 0 |  | 7 | read-only |
|  | 1253 | rulePack / FORMAT, getSettings, settings, setSettings, function, saveSettings, catalog, save, apply, drop, detect, admit |  | 0 | 3 | 1 |  | 10 | read-only |
|  | 208 | rules /  |  | 0 | 6 | 0 |  | 9 | read-only |
|  | 758 | ruling / CASE_STATUS, slice, VERDICTS, PENALTY_KINDS, EXHIBIT_KINDS, PARTIES, OPEN_CASE, getSettings, settings, setSettings, function, saveSettings | ruling | 8 | 1 | 1 |  | 5 | ui-only |
|  | 584 | rumor / LAYERS, MOTIVES, PUBLIC_LAYERS, LAYER_LEVEL, getSettings, settings, setSettings, function, saveSettings, assign, startChain, relay | rumor | 3 | 8 | 2 |  | 18 | wired |
|  | 160 | samplerCheck / TRIALS, RECENT_RATIO, mulberry, statSample, runChecks, safe |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 347 | saveHealth / DEF, assign, BOUNDS, getSettings, settings, setSettings, saveSettings, build, stat, reset |  | 0 | 3 | 2 |  | 6 | read-only |
|  | 134 | sceneBudget /  | sceneBudget | 4 | 0 | 0 |  | 1 | island |
|  | 671 | sceneNarrative, situation / currentScene, situation, traceCausalEchoes, resolvedSummary, traceFrom, perceivedHorizon, stat, function, assign, _stat, faults, reset | people | 0 | 2 | 1 |  | 8 | wired |
|  | 127 | sceneSlice / ENV_TYPES, SEGMENTS, getSettings, settings, setSettings, function, saveSettings, assign, resolveSegment, set, read, buildBlock | sceneSlice | 1 | 2 | 1 |  | 2 | wired |
|  | 152 | scopeTag / getSettings, settings, setSettings, saveSettings, view, parse, rangesOf, stat, function, stringify, resetStat, TAG_LABEL |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 355 | sediment / TRACES, slice, LADDER, assign, LABEL, getSettings, settings, setSettings, saveSettings, settle, feel, buildBlock | sediment | 1 | 7 | 2 |  | 6 | wired |
|  | 605 | serviceNetwork / declareFacility, activateFacility, requestService, releaseService, queueService, cancelQueue, decayFacility, restoreFacility, servicesAt, checkServiceImpact, repairFacilityWithMaterials, declareCheckpoint | serviceNetwork, people | 11 | 3 | 0 |  | 7 | wired |
|  | 435 | session / SEAT_PERMS, slice, HOST_PERMS, getSettings, settings, setSettings, function, saveSettings, assign, host, join, auth | session, active | 4 | 3 | 2 |  | 4 | wired |
|  | 448 | shadow / SHADOW_KINDS, STAKES, getSettings, settings, setSettings, function, saveSettings, assign, addShadow, deepen, brighten, addExperience | shadow | 8 | 3 | 2 |  | 10 | wired |
|  | 258 | sharedAwareness / assertMeta, metaOf, openPact, confirmPact, amendPact, viewPact, coordination | sharedAwareness | 5 | 1 | 0 |  | 3 | wired |
|  | 617 | socialLegacy / formLegacy, acceptLegacy, witnessAccount, viewLegacy, legaciesOf, registerClaim, spreadClaim, clarifyClaim, groupMemoryStance, initiateHandover, proposeSuccession, resolveHandover | socialLegacy | 14 | 1 | 0 |  | 5 | wired |
|  | 178 | soloVoice / getSettings, settings, setSettings, saveSettings, view, brief, check, countQuestions, labelWeight, stat, function, parse |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 230 | spotlight / getSettings, settings, setSettings, function, saveSettings, assign, note, seal, report, idle, resolveIntervention, buildBlock | spotlight | 2 | 1 | 1 |  | 5 | ui-only |
|  | 281 | stage / PACKS, keys, stagesOf, function, clean, pack, slice, metricsOf, getSettings, settings, setSettings, saveSettings | stage, pack, plan, at, updatedAt, metrics, transitions | 4 | 2 | 2 |  | 19 | ui-only |
|  | 162 | staleGuard / getSettings, settings, setSettings, function, saveSettings, assign, begin, verdict, drop, clear, snapshot, site | source | 0 | 1 | 0 |  | 2 | wired |
|  | 551 | stall / SIGN_MAX, taxCents, getSettings, settings, setSettings, function, saveSettings, assign, lay, sign, list, delist | stalls, rows | 10 | 2 | 2 |  | 4 | ui-only |
|  | 159 | storageForecast /  |  | 0 | 7 | 2 |  | 6 | read-only |
|  | 317 | storyChoice / getSettings, setSettings, function, present, confirm, review, pending, buildBlock, diagnose, stat, reset |  | 2 | 4 | 2 |  | 10 | wired |
|  | 464 | storyLoop / VERSION, EDGES, slice, EDGE_DUTY, assign, GUARDS, GUARD_LABEL, getSettings, settings, setSettings, function, saveSettings |  | 0 | 1 | 1 |  | 3 | read-only |
|  | 150 | storyTone / TONES, slice, LABELS, assign, getSettings, settings, setSettings, function, saveSettings, set, get, clear | storyTone | 2 | 1 | 1 |  | 1 | ui-only |
|  | 125 | storyclock / MARK, getSettings, settings, setSettings, function, saveSettings, assign, parseStamp, readLatest, audit, discipline, stat |  | 0 | 2 | 0 |  | 2 | read-only |
|  | 27 | storylineAdvance /  |  | 0 | 4 | 2 |  | 6 | read-only |
|  | 254 | style / KEY, AXES, CHOICES, DEFAULTS, AXIS_LABELS, CHOICE_LABELS, CUSTOM_MAX, getSettings, setSettings, effectiveSettings, buildBlock, summaryText |  | 0 | 4 | 2 |  | 6 | read-only |
|  | 119 | successGrade /  |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 240 | summarizer /  | memory | 2 | 2 | 1 | after | 2 | wired |
|  | 429 | supplyChain / FAULTS, slice, STAGES, getSettings, settings, setSettings, function, saveSettings, assign, plan, commit, bottleneck | short | 0 | 1 | 1 |  | 4 | ui-only |
|  | 730 | survey / KNOWS, slice, getSettings, settings, setSettings, function, saveSettings, assign, declareSpot, spotOf, ok, true | survey | 11 | 2 | 2 |  | 3 | ui-only |
|  | 150 | survival / getSettings, settings, setSettings, function, saveSettings, assign, set, read, statusOf, buildBlock, stat, faults | survival | 1 | 2 | 1 |  | 4 | wired |
|  | 162 | tapeStore / save, list, load, drop, stat |  | 0 | 2 | 1 |  | 2 | read-only |
|  | 577 | techLineage / declareTradition, getTradition, teach, registerMaster, departPractitioner, canProduce, confirmVariant, declareStandard, getStandard, listStandards, checkCompatibility, planRetrofit | techLineage, variants, compatibilities | 13 | 2 | 0 |  | 4 | wired |
|  | 96 | temperament / getSettings, settings, setSettings, function, saveSettings, assign, setTemperament, read, buildBlock, stat, faults | temperament | 1 | 2 | 1 |  | 2 | wired |
|  | 117 | tempo / GEARS, getSettings, settings, setSettings, function, saveSettings, assign, current, setGear, check, buildBlock, stat | tempo | 1 | 1 | 1 |  | 2 | ui-only |
|  | 109 | temporalLock / getSettings, settings, setSettings, function, saveSettings, assign, lock, unlock, check, buildBlock, stat, faults | temporal | 2 | 1 | 1 |  | 3 | ui-only |
|  | 509 | theme /  |  | 0 | 6 | 2 |  | 14 | read-only |
|  | 293 | threads / RELIABILITY, REL_W, TERMINAL, getSettings, settings, setSettings, function, saveSettings, assign, open, addLead, converge | threads | 5 | 3 | 2 |  | 5 | wired |
|  | 183 | timeline / SOURCE_ID_KEY, hashText, messageHash, ensureMessageId, sourceRef, captureRange, digestRefs, auditRefs, refsToConversation, unionRefs |  | 0 | 10 | 2 |  | 3 | read-only |
|  | 216 | tolerance / getSettings, settings, setSettings, function, saveSettings, assign, use, tick, check, drop, clear, buildBlock | tolerance | 4 | 1 | 1 |  | 3 | ui-only |
|  | 220 | toolAnalyzer / WEIGHTS, OVERHEAT, OVERCOOL, STAGE_PROGRESS, ECON_SCORE, pressureOf, momentumOf, loadOf, risksOf, analyze, summaryText |  | 0 | 2 | 1 |  | 1 | read-only |
|  | 7896 | toolDiag / PACKAGE_FORMAT, PACKAGE_VERSION, MODULE_EXPORTS, UI_BINDINGS, collect, verdict, toJSON, summaryText, flatten, download, buildErrorReport, OPTIONAL_EXPORTS | faults | 0 | 2 | 1 |  | 163 | wired |
|  | 228 | toolImport / detect, preview, previewPlan, importData | evolution | 4 | 1 | 1 |  | 3 | ui-only |
|  | 187 | toolSnapshot / FORMAT, ACCEPTED, buildPayload, toJSON, buildSubsetPayload, validate, restore, download, counts | schemaVersion, meta | 1 | 2 | 1 |  | 4 | wired |
|  | 336 | training / MODES, slice, getSettings, settings, setSettings, function, saveSettings, assign, declare, practice, can, abilitiesView | training | 3 | 4 | 1 |  | 13 | wired |
|  | 627 | travelDesk / FAULTS, slice, ACTIONS, keys, getSettings, settings, setSettings, function, saveSettings, assign, plan, route |  | 0 | 1 | 1 |  | 3 | read-only |
|  | 376 | undercurrentCalendar / DEF, BOUNDS, STAGE_WINDOWS, getSettings, setSettings, build, reset, stat, function, assign |  | 0 | 3 | 2 |  | 6 | read-only |
|  | 147 | userlock / getSettings, settings, setSettings, function, saveSettings, assign, lock, unlock, isLocked, rejectWrite, list, rows | userlock | 3 | 1 | 1 |  | 1 | ui-only |
|  | 415 | vitals / getSettings, settings, setSettings, saveSettings, register, conceive, know, tell, knows, knowsOthers, tick, endPregnancy | vitals | 8 | 2 | 1 | after | 3 | wired |
|  | 126 | warrant / LEVELS, LEVEL_LABELS, HUNTED_AT, getSettings, settings, setSettings, function, saveSettings, assign, report, pardon, read | warrant | 2 | 1 | 1 |  | 4 | ui-only |
|  | 212 | wbInject / VAR_PREFIX, ORDER_MIN, ORDER_MAX, orderKey, validOrder, wbEntryContent, syncOrder, syncAll, clearOrder, ensureEntry, findCompanionName, getConfig |  | 0 | 3 | 1 | before | 2 | read-only |
|  | 157 | wbSearch / FIELDS, slice, search, count, searchIn, facesOf, size, function, entries, stat, assign, faults |  | 0 | 2 | 1 |  | 3 | read-only |
|  | 206 | weather / WEATHERS, SEASONS, FACTOR, getSettings, settings, setSettings, function, saveSettings, assign, season, setWeather, weatherOf | weather | 1 | 4 | 1 |  | 9 | wired |
|  | 142 | weightedDraw /  |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 114 | wordBudget / getSettings, settings, setSettings, function, saveSettings, assign, count, verdict, stat, faults |  | 0 | 1 | 0 |  | 3 | read-only |
|  | 410 | worldAutobiography / getSettings, settings, setSettings, saveSettings, autobiography, exportText, buildBlock, stat, reset, DEF, assign |  | 0 | 5 | 3 |  | 3 | read-only |
|  | 917 | worldBlueprint / BP_VER, KEEP_LEVELS, map, function, assign, SCENES, getSettings, settings, setSettings, saveSettings, exportBlueprint, checkIntegrity |  | 2 | 7 | 1 |  | 10 | wired |
|  | 433 | worldBridge / LEGEND_KINDS, slice, LEGEND_LABEL, assign, KINDS_OF, parse, stringify, PRIVATE, getSettings, settings, setSettings, saveSettings | worldBridge, worldFacts | 2 | 8 | 2 |  | 6 | wired |
|  | 244 | worldBriefing / getSettings, settings, setSettings, saveSettings, snap, view, stat, MARKS, _viewFrom, viewFrom, reset |  | 0 | 6 | 2 |  | 3 | read-only |
|  | 43 | worldChanges /  |  | 0 | 4 | 2 |  | 4 | read-only |
|  | 232 | worldClock / getSettings, settings, setSettings, saveSettings, view, judge, inspectEnd, parseEnd, stat, function, parse, stringify |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 304 | worldDiary / getSettings, settings, setSettings, saveSettings, build, stat, reset, boundary, DEF, assign |  | 0 | 5 | 2 |  | 6 | read-only |
|  | 442 | worldGraph / KINDS, slice, EDGE_KINDS, CAPS, getSettings, settings, setSettings, function, saveSettings, graph, geo, timeline |  | 0 | 1 | 1 |  | 3 | read-only |
|  | 387 | worldHealth / getSettings, setSettings, function, summary, drill, sources, diagnose, stat, reset |  | 0 | 2 | 1 |  | 3 | read-only |
|  | 1294 | worldLab / FORMAT, getSettings, settings, setSettings, function, saveSettings, catalog, run, arms, diff, staleness, discard | worldFacts | 0 | 2 | 1 |  | 7 | wired |
|  | 879 | worldSeed / SEED_VER, VARIANCE, assign, TAGS, slice, getSettings, settings, setSettings, saveSettings, extract, save, get |  | 2 | 4 | 1 |  | 13 | wired |
|  | 901 | worldSnapshot / FORMAT, FACES, slice, SECRETS, HOST_STATE, IDENTITY_REFS, map, function, face, at, field, domain |  | 1 | 2 | 1 |  | 4 | wired |
|  | 1351 | world / PLACE_KINDS, EVENT_KINDS, CHANNELS, transit, getSettings, settings, setSettings, function, saveSettings, assign, addPlace, addRoad | world, blocked, path | 1 | 12 | 2 |  | 56 | wired |
|  | 362 | worldbook / hasSelection, getSelectedIds, getOverrides, saveSelectedIds, saveSelection, loadCurrentEntries, buildPromptSection, triggerEnabled, isEntryActive, activationOf, matchKey, seedEntries |  | 0 | 7 | 1 |  | 4 | read-only |
|  | 299 | writeContract / getSettings, settings, setSettings, saveSettings, contractOf, explain, scan, summaryText, stat, function, assign |  | 0 | 3 | 1 |  | 4 | read-only |
|  | 137 | writeDesk / catalog, call, stat, function, parse, stringify |  | 0 | 3 | 1 |  | 7 | read-only |
|  | 224 | monologue / getSettings, settings, setSettings, saveSettings, plan, stat, function, assign, __stat, memo, size, enabled |  | 0 | 2 | 1 | before | 2 | read-only |
|  | 155 | observe / slice, name, getChannel, if, ok, false, reason, get, entries, map, k, join | people | 1 | 1 | 1 |  | 2 | ui-only |
|  | 121 | profile / maintain, getChannel, if, ok, false, reason, getProfile, function, sec, capsFor, return, catch |  | 0 | 0 | 0 | after | 10 | read-only |
|  | 913 | registry / list, loadAll, chatId, register, if, includes, push, saveAll, emit, unregister, filter, slotRelease | people, mine | 1 | 11 | 1 |  | 24 | wired |
|  | 225 | apiRouter / CHANNELS, getChannel, loadCfg, baseUrl, replace, apiKey, model, temperature, maxTokens, useTavernProxy | lastMs, lastAt, byKind, lastError | 0 | 20 | 3 |  | 9 | wired |
|  | 450 | auditLog / record, recent, byAction, count, stat, reset, flush, restore, exportVol, verifyVolWith, CAP, PARAM_CAP |  | 0 | 4 | 1 |  | 7 | read-only |
|  | 234 | clock / now, wallNow, freeze, unfreeze, frozen, virtualAt, advance, drift, clockStat, resetClockStat, sites |  | 0 | 238 | 7 |  | 46 | read-only |
|  | 944 | commit / opKey, begin, commit, defer, flush, retryEffects, settle, replay, stat, chain, chainStat, chainSelfCheck | commit, done, reason | 4 | 14 | 0 |  | 16 | wired |
|  | 866 | evict / array, object, note, evictStat, resetEvictStat, siteDecls, nonEvictDecls, function, assign, idempotentDecls, summarize |  | 0 | 118 | 1 |  | 51 | read-only |
|  | 174 | exec / withContext, current, inDryRun, storeOf, worldOf, now, statBag, mutate, sandStore, cloneState, depth, function |  | 1 | 8 | 0 |  | 3 | wired |
|  | 201 | faultContext / wrap, recent, stat, reset, classify, isRetriable, stateBrief, CAP, RETRIABLE, slice |  | 0 | 0 | 0 |  | 5 | read-only |
|  | 122 | inputGuard /  |  | 0 | 184 | 0 |  | 29 | read-only |
|  | 386 | interceptor, on, off, emit, busStats, LEAK_THRESHOLD / install, if, getCtx, on, afterEvt, async, null, begin, markSkip, log, has, mes | meta, leakedWarned, lastAt, lastError | 1 | 13 | 3 |  | 12 | wired |
|  | 342 | permissions / defineRole, grant, revoke, grantDirect, effective, has, can, check, matrix, stat, reset, ROLE_LABELS |  | 0 | 6 | 1 |  | 9 | read-only |
|  | 158 | plugin / HOOKS, slice, register, unregister, fire, list, stat, function, plugins, keys, length, registers |  | 0 | 3 | 1 |  | 7 | read-only |
|  | 798 | rand / next, int, dice, chance, pick, pickWeighted, id, seed, reseed, getSeed, function, ensureSeed |  | 0 | 61 | 2 |  | 18 | read-only |
|  | 167 | sandbox / FORBIDDEN, slice, run, stat, function, runs, denied, timeouts, throws, lastReason, lastAt |  | 0 | 2 | 0 |  | 7 | read-only |
|  | 92 | sanitize / text, html, attr, tpl, needsEscape, ESCAPED, slice, CODES, AMP, LT, GT, QUOT |  | 0 | 2 | 1 |  | 5 | read-only |
|  | 219 | schema / validate, validateNamed, define, get, list, stat, reset, attach, TYPES, slice, MAX_ERRORS |  | 0 | 0 | 0 |  | 4 | read-only |
|  | 2067 | settingsBus / stats, cfgStat, cfgSurface, exportConfig, cfgExport, importConfig, cfgImport, remove, reg, if, noteRemoveFail, ok |  | 0 | 239 | 8 |  | 51 | read-only |
|  | 113 | settleGuard / fnv1a, begin, floorInfo, lastRecord, chatId, if, clockWall, settle, false, reason, rec, cid | meta | 1 | 2 | 1 |  | 2 | wired |
|  | 4970 | modules, registerModule, moduleRegistry, store / SCHEMA_VERSION, capsFor, registryParity, sizeCaps, keys, forEach, function, cap, site, kind, wildcard, true | meta | 2 | 289 | 9 |  | 348 | wired |
|  | 124 | undo / pushValue, capture, undo, peek, stat, clear |  | 0 | 2 | 1 |  | 1 | read-only |
|  | 313 | unifiedPending / collect, collectPending, pending, diagnose, stat, function, total, high, highCount, at, state, hands |  | 0 | 0 | 0 |  | 5 | read-only |
|  | 201 | workflow / register, if, loadSwitches, set, id, assign, order, enabled, node, unregister, delete, setEnabled | lastMs, lastAt, lastStatus | 0 | 33 | 1 | before | 14 | wired |
|  | 1984 | render / uninjectAudit, SOURCES, explain, visibilityStat, sources, length, declared, keys, filled, undeclared, slice, lastAt | nextTurnInjection, lastInjection | 3 | 10 | 2 |  | 70 | wired |
|  | 350 | mapViewport / VERSION, __REG, settings, saveSettings, computeFlyInterpolation, clusterCharacters, declutterLabels, renderSvgScene |  | 0 | 1 | 1 |  | 2 | read-only |
|  | 172 | purifier / rules, loadRules, getRules, setEnabled, id, find, sameId, if, saveRules, importPresetSafe, parse, catch |  | 0 | 3 | 1 |  | 2 | read-only |
|  | 91 | theater / generate, instruction, if, ok, false, reason, detail, got, getChannel, get, values, slice |  | 0 | 1 | 1 |  | 2 | read-only |
|  | 316 | assistant / ask, search, function, q, gather, gaps, if, ok, false, reason, true, view | people | 0 | 1 | 1 |  | 3 | ui-only |
|  | 455 | cyberAnimate / version, showLoading, function, createElement, appendChild, hideLoading, getElementById, if, add, setTimeout, remove, notify |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 496 | cyberUI / version, toggle, function, id, checked, progress, value, min, max, progressCircular, status, type |  | 0 | 0 | 0 |  | 1 | read-only |
|  | 307 | cyberDashboard / version, statCard, function, label, value, desc, timeCard, time, engineList, map, join, quickActions |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 438 | cyberLogs / version, formatTime, function, Date, logLine, logsContainer, filters, all, error, warn, info, debug |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 423 | cyberPeople / version, personCard, function, charAt, map, join, peopleGrid, personDetail, entries, k |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 450 | cyberResponsive / version, tier, currentTier, rerenderMs, function, listChunk, isMobile, inject, injectResponsive, chunk, items, TABLE_CHUNK_SAFE |  | 0 | 1 | 0 |  | 1 | read-only |
|  | 502 | themeStyles, cyberpunkTheme / inject, function, applyThemeStyle, version |  | 0 | 8 | 7 |  | 2 | read-only |
|  | 291 | panelFold / SECTIONS, slice, MAX_ENTRIES, isCollapsed, isCollapsedBool, setCollapsed, toggle, expandAll, collapseAll, sectionsOf, snapshot, restore |  | 0 | 1 | 1 |  | 11 | read-only |
|  | 272 | panelNav / parse, attr, fromAttr, go, backTo, locate, grab, restore, stat, diagnose |  | 0 | 1 | 1 |  | 5 | read-only |
|  | 16806 | ui / STATE_EVENTS, usageStat, parse, stringify, currentPage, pages, map, function, rerenderStat, scheduled, ran, skippedHidden | innerHTML, bySite, byInvalidate, people, worldKeys, engines, faults, degraded, byCode, byCat, deps, byEngine, checks, value, routes, kinds, id, textContent | 12 | 6 | 4 |  | 188 | wired |
|  | 137 | renderPerf /  |  | 0 | 2 | 1 |  | 7 | read-only |
|  | 1473 | uiSettings / laneApply, rootEl, render, getSettings, boundsOf, bd, arr, isArray, esc, find, String, slice |  | 0 | 1 | 1 |  | 23 | read-only |
|  | 236 | themeSwitch / version, themes, function, slice, current, currentTheme, set, setTheme, open, openMenu, close, closeMenu | id, textContent | 0 | 0 | 0 |  | 2 | island |

## 审计边界

- 这是静态逐文件证据账，不是运行时验收。
- 分类不等同缺陷；动态调用、宿主注入和条件分支须继续定向复核。
- 外部模型供应商调用未视为已验证。
