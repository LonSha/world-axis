/**
 * WorldAxis engines/tool-diag-tables.js (v2.529.0) — tool-diag 的注册表与校验表
 *
 * 原本长在 engines/tool-diag.js（8425 行）里，四块纯表被八千行采集节夹在中间：
 *   · MODULE_EXPORTS   ：磁盘模块 → 命名空间映射（漏登记 = 自检看不见的黑盒）
 *   · OPTIONAL_EXPORTS ：无头环境里「正确的缺席」名单（与「真断裂」是两件事）
 *   · UI_BINDINGS      ：渲染 ↔ 绑定一致性校验表（按页登记 ids / dynamic / cond / player）
 *   · ENGINE_PORTS     ：26 枚引擎的只读口 / 动作口端口表（死子面判据的字面来源）
 *
 * 为什么单独成文件（OPV29-07）：这四块是**登记表** —— 改一行要在八千行采集器里翻；
 *   而漏登记的症状是「自检看不见」而不是报错，最需要一眼看全。
 *   引擎求值期先取表；缺表当场抛错（缺表的自检会把「模块全在」报成「模块全缺」，
 *   那种「不崩的错」比崩溃更难查）。
 *
 * 关于 ENGINE_PORTS 里的闭包：320 处 `function () { return WA.x.y(); }` 读的 `WA`
 *   就是本文件里的 `WA`（同一个 window.WorldAxis），调用期解析与搬家前完全一致。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const MODULE_EXPORTS = {
    // v2.529.0（OPV29-04）：惰性档引擎自己。它有产品读点（index.js 的 WA.lazyLoad.bind/add），
    //   所以在出口契约串里也确实有它 ⇒ 该进表。其余 22 个惰性项零读、不进表
    //   （理由见 tests/segments/tool-diag-v092.js 的覆盖判据注释）。
    'engines/lazy-load.js': 'lazyLoad',
    // v2.533.0（OPV30 收口）：五台缝合件引擎。此前它们是惰性档（零读、按设计不进表），
    //   本轮在 ui/settings.js 的「缝合件台账」接了产品读点 ⇒ 退出惰性档进首帧面 ⇒
    //   诊断清单必须登记（判据「诊断清单覆盖全部磁盘模块」正是为这一格设的；
    //   漏登记的后果是自检/契约面对它们没有出口，而不是报错）。
    'engines/replica-family.js': 'replicaFamily',
    'engines/ctx-boundary.js': 'ctxBoundary',
    'engines/write-rehearsal.js': 'writeRehearsal',
    'engines/arc-guide.js': 'arcGuide',
    'engines/save-audit.js': 'saveAudit',
    // v2.273.0（V6 拓展线 EXV6-1~9）：八台只读读数引擎一次登记到位。
    //   漏登记的后果不是报错，而是「自检看不见的黑盒」（全量回归的
    //   「诊断清单覆盖全部磁盘模块」判据正是为这一格设的）。
    'engines/world-diary.js': 'worldDiary',
    'engines/day-route.js': 'dayRoute',
    'engines/relation-temp.js': 'relationTemp',
    'engines/undercurrent-calendar.js': 'undercurrentCalendar',
    'engines/round-cost.js': 'roundCost',
    'engines/save-health.js': 'saveHealth',
    'engines/first-run.js': 'firstRun',
    'engines/handoff-pack.js': 'handoffPack',
    // v2.285.0（V7 EXV7-1）：今日世界简报 —— 差分流水引擎。
    //   不订阅总线（backstage 直调 snap()），漏登记时「自检看不见的黑盒」
    //   判据正是为这一格设的；与上面八台同一次补齐，避免又落下一格。
    'engines/world-briefing.js': 'worldBriefing',
    'engines/storyline-advance.js': 'storylineAdvance',
    'engines/world-changes.js': 'worldChanges',
    // v2.286.0（V7 EXV7-2）：人物意图看板 —— 人物面只读聚合。
    //   不订阅总线、不调写口（plan.expand/advance 一个都不碰），全部现读 plan.chain；
    //   漏登记时「自检看不见的黑盒」判据正是为这一格设的，与上面同一次补齐。
    'engines/intent-board.js': 'intentBoard',
    // v2.292.0（V7 EXV7-8）：世界自传 —— 分章压缩聚合。
    //   与上面两台同规：不订阅总线、零写口，全部现读 chrono.chronicle；
    //   漏登记时「自检看不见的黑盒」判据正是为这一格设的（这一格漏过一次，
    //   症状是 export-contract 里整个 worldAutobiography 命名空间缺席 ——
    //   守卫与契约面同时看不见它，而专锁照绿）。
    'engines/world-autobiography.js': 'worldAutobiography',
    'engines/player-archive.js': 'playerArchive',
    // v2.381.0（诊断清单全部磁盘模块收口）：12 个漏登记模块。
    //   判据是 tests/run.js 的「诊断清单覆盖全部磁盘模块」——它按 core/engines/actors/
    //   direction/render/compat/ui 七个目录逐个 listdir 再与本表求差集。本批 12 个全部
    //   是**引擎已落地、注入链已接、本表未登记**：后果不是「少一行字」，而是它们在
    //   inventory 的定义面上不存在——而 inventory 正是出口面契约与死子面账本的唯一来源。
    //   更直接的后果是自检（secModules / 诊断包）看不见它们：模块装载失败、契约漂移
    //   这两类故障对它们**没有出口**。ns 名逐一取自各文件 `WA.<ns> = ` 的实测导出面。
    'core/unified-pending.js': 'unifiedPending',
    'engines/bloodline-heritage.js': 'bloodlineHeritage',
    'engines/cataclysm-hazard.js': 'cataclysmHazard',
    'engines/court-intrigue.js': 'courtIntrigue',
    'engines/dungeon-hazard-mesh.js': 'dungeonHazardMesh',
    'engines/ecosystem-cascade.js': 'ecosystemCascade',
    'engines/engineering-blueprint.js': 'engineeringBlueprint',
    'engines/epochal-transition.js': 'epochalTransition',
    'engines/financial-contagion.js': 'financialContagion',
    'engines/incarceration-jailbreak.js': 'incarcerationJailbreak',
    'engines/regiment-tactics.js': 'regimentTactics',
    'engines/theology-cult.js': 'theologyCult',
    // v2.352.0: V19 史诗新引擎与跨四层调度总线系统全量补齐登记
    'engines/alchemy-toxicology.js': 'alchemyToxicology',
    'engines/anomaly-mutation.js': 'anomalyMutation',
    'engines/blackmarket-usury.js': 'blackmarketUsury',
    'engines/bureaucracy-ascension.js': 'bureaucracyAscension',
    'engines/butterfly-cascade.js': 'butterflyCascade',
    'engines/conspiracy-weaver.js': 'conspiracyWeaver',
    'engines/covenant-sanction.js': 'covenantSanction',
    'engines/covert-espionage.js': 'covertEspionage',
    'engines/dramatic-tension.js': 'dramaticTension',
    'engines/ecosystem-predation.js': 'ecosystemPredation',
    'engines/epidemic-contagion.js': 'epidemicContagion',
    'engines/epoch-tide.js': 'epochTide',
    'engines/field-writers.js': 'fieldWriters',
    'engines/ideology-memetics.js': 'ideologyMemetics',
    'engines/inline-tags.js': 'inlineTags',
    'engines/interrogation-tell.js': 'interrogationTell',
    'engines/judicial-inquest.js': 'judicialInquest',
    'engines/l3-registry.js': 'l3Registry',
    'engines/maritime-navigation.js': 'maritimeNavigation',
    'engines/moral-dilemma.js': 'moralDilemma',
    'engines/perception-manipulation.js': 'perceptionManipulation',
    'engines/periodicals.js': 'periodicals',
    'engines/psyche-trauma.js': 'psycheTrauma',
    'engines/push-api-registry.js': 'pushApiRegistry',
    'engines/routine-pacing.js': 'routinePacing',
    'engines/ruin-mechanism.js': 'ruinMechanism',
    'engines/siege-attrition.js': 'siegeAttrition',
    'engines/stage-presence.js': 'stagePresence',
    'engines/stealth-infiltration.js': 'stealthInfiltration',
    'engines/surgical-triage.js': 'surgicalTriage',
    'engines/tactical-combat.js': 'tacticalCombat',
    'engines/populate.js': 'populate',
    'core/clock.js': 'clock',
    'core/boot-report.js': 'bootReport',   // v2.524.0（OPV27-1/2）：装载汇报 + 逐台耗时面
    'core/store.js': 'store', 'core/settings-bus.js': 'settingsBus', 'core/evict.js': 'evict', 'core/rand.js': 'rand', 'core/input-guard.js': 'inputGuard', 'core/workflow.js': 'workflow', 'core/settle-guard.js': 'settleGuard', 'core/interceptor.js': 'interceptor',
    // v2.110.0（计划一 #21/#22 + 计划二 #39/#70）：三个基元模块 —— 登记一次到位。
    //   漏登记一条的后果不是「报错」，而是「自检看不见的黑盒」（inventory 的未登记模块面）。
    'core/fault-context.js': 'faultContext', 'core/schema.js': 'schema', 'core/permissions.js': 'permissions',
    'core/audit-log.js': 'auditLog', 'core/sanitize.js': 'sanitize',
    // v2.114.0（计划二 #56/#68）：生命周期钩子 / 进程内白名单沙箱。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**。两者都有产品真消费方
    //   （store 的 save/init 调 WA.plugin.fire、tool-diag 的诊断节读 WA.sandbox.stat），
    //   缺席就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    'core/sandbox.js': 'sandbox', 'core/plugin.js': 'plugin',
    'core/undo.js': 'undo',
    'core/api-router.js': 'apiRouter',
    'engines/backstage.js': 'backstage', 'engines/evolution.js': 'evolution', 'engines/enemies.js': 'enemies',
    'engines/regional.js': 'regional', 'engines/parallel-world.js': 'parallelWorld', 'engines/horizon.js': 'horizon', 'engines/digest.js': 'digest',
    'engines/limits.js': 'limits', 'engines/worldbook.js': 'worldbook', 'engines/ledger.js': 'ledger',
    'engines/timeline.js': 'timeline', 'engines/entities.js': 'entities',
    'engines/preset.js': 'preset', 'engines/chatcache.js': 'chatcache', 'engines/pmem.js': 'pmem',
    'engines/rules.js': 'rules', 'engines/theme.js': 'theme', 'engines/summarizer.js': 'summarizer', 'engines/chapters.js': 'chapters',
    'engines/direct-event.js': 'directEvent',
    'engines/editor-faction.js': 'editorFaction', 'engines/editor-events.js': 'editorEvents',
    'engines/inspector-state.js': 'inspectorState', 'engines/tool-snapshot.js': 'toolSnapshot',
    'engines/tool-analyzer.js': 'toolAnalyzer', 'engines/tool-import.js': 'toolImport',
    'engines/chrono.js': 'chrono', 'engines/collab.js': 'collab',
    // v2.118.0（计划二 B7/B8/B9）：三个引擎此前已进 LOAD 清单却漏了这份声明表。
    //   漏登记的后果不是「少一行字」：tests/inventory.js 的定义面（命名空间 / 成员）与
    //   tool-diag 的诊断面都从本表取，漏了就等于这三块在定义面上不存在。
    'engines/rehearsal.js': 'rehearsal', 'engines/liaison.js': 'liaison', 'engines/coop.js': 'coop',
    'engines/inject-inspector.js': 'injectInspector', 'engines/inject-budget.js': 'injectBudget', 'engines/tool-diag.js': 'toolDiag', 'engines/contract-audit.js': 'contractAudit', 'engines/memory-sampler.js': 'memorySampler', 'engines/sampler-check.js': 'samplerCheck', 'engines/inject-channel.js': 'injectChannel', 'engines/inject-slot-audit.js': 'injectSlotAudit', 'engines/proactive.js': 'proactive', 'engines/wb-inject.js': 'wbInject', 'engines/entry-router.js': 'entryRouter', 'engines/kaleidoscope.js': 'kaleidoscope',
    'engines/calendar.js': 'calendar', 'engines/memory.js': 'memory', 'engines/opinion.js': 'opinion',
    'engines/bridge.js': 'bridge',
    'engines/lonsha-reader.js': 'lonshaReader',
    // v2.50.0（第三十五面）：宿主两侧 + 时间轴三账
    'engines/host-wb-trace.js': 'hostWbTrace',
    'engines/ledger-timeline.js': 'ledgerTimeline',
    'engines/floor-changes.js': 'floorChanges',
    // v2.231.0（优化 OPT-5）：楼层结算账（本表是 inventory 的定义面与 tool-diag 诊断面的唯一来源，
    //   漏登记 ⇒ 该模块在两面上都不存在，而代码照跑）。
    'engines/floor-settle.js': 'floorSettle',
    // v2.231.0 (OP-1): desk -- 把已有机制摆成「此刻能做什么」。
    //   登记在此 = 该文件缺席时 secModules 如实报 missing；
    //   漏登记不是少一行字，而是它在定义面与诊断面上都不存在，代码照跑。
    'engines/action-desk.js': 'actionDesk',
    // v2.231.0 (OP-2): methods -- 能力—工具—行动结果联动
    'engines/action-methods.js': 'actionMethods',
    // v2.231.0 (OP-3): labor -- 劳动与日程结算（同一段时间只能花一次）
    'engines/labor-schedule.js': 'laborSchedule',
    // v2.231.0 (OP-4): closure -- 研究成果闭环（从确认字符串走到可验证成果）
    'engines/research-closure.js': 'researchClosure',
    // v2.231.0 (IN-1): motive -- 动机竞合（NPC 不再只选第一条可执行任务）
    'engines/motive-arbitration.js': 'motiveArbitration',
    // v2.231.0 (IN-2): echo -- 未走之路的回声（有限预期与经验修正）
    'engines/path-echo.js': 'pathEcho',
    // v2.231.0 (IN-5): techLineage -- 活的技术谱系（传承、分化与断代复兴）
    'engines/tech-lineage.js': 'techLineage',
    // v2.231.0 (OP-5): familyOps -- 共同生活经营（预算、分工与责任交接）
    'engines/family-ops.js': 'familyOps',
    // v2.231.0 (OP-6): aftermathImpact -- 世界痕迹消费（设施损坏、封路、绕路与不可逆修复）
    'engines/aftermath-impact.js': 'aftermathImpact',
    // v2.231.0 (OP-7): epistemicView -- 角色按自己手里的版本行动（局部事实、知情边界与信念修正）
    'engines/epistemic-view.js': 'epistemicView',
    // v2.231.0 (IN-3): sharedAwareness -- 共同知晓与默契（二阶认知、公开宣布与协作约定）
    'engines/shared-awareness.js': 'sharedAwareness',
    // v2.231.0 (IN-4): customLax -- 习俗到制度（惯例候选→组织批准→规则→复审）
    'engines/custom-lax.js': 'customLax',
    // v2.231.0 (OP-8): sceneNarrative -- 场景与历史按因果讲清楚（只读聚合）
    'engines/scene-narrative.js': 'sceneNarrative',
    // v2.231.0 (IN-6): serviceNetwork -- 公共设施与服务网络（容量、排队、维护与降级）
    'engines/service-network.js': 'serviceNetwork',
    // v2.231.0 (OP-9): playableBlueprint -- 可玩的世界蓝图（样例、依赖检查、玩法定义导出）
    'engines/playable-blueprint.js': 'playableBlueprint',
    // v2.281.0 (OPV7-6): playableSeed -- 开局即喂（把已安装蓝图播种成目标/日程/关系/势力归属）
    'engines/playable-seed.js': 'playableSeed',
    // v2.231.0 (IN-7): envCapacity -- 有承载力的环境（存量、再生、压力与恢复时滞）
    'engines/environmental-capacity.js': 'envCapacity',
    // v2.231.0 (IN-8): socialLegacy -- 社会遗产（未完事业/设施/物件/师承/声誉的承接与见证）
    'engines/social-legacy.js': 'socialLegacy',
    // v2.231.0 (IN-9): phaseTransition -- 历史相变（局部社会状态评估、过渡与路径依赖）
    'engines/phase-transition.js': 'phaseTransition',
    // v2.233.0 (EXV4-2): demographicFlow -- 人口迁入迁出与地方能力变化（人口流动/迁居约束/责任移交/纯读投影）
    'engines/demographic-flow.js': 'demographicFlow',
    // v2.233.0 (EXV4-3): careChain -- 照护链与公共服务韧性（照护承诺/缺席断裂/转介接续/韧性投影）
    'engines/care-chain.js': 'careChain',
    // v2.233.0 (EXV4-4): publicAgenda -- 公共议程设置与代表性缺口（有限议程竞争/代表性/局外人隔离/规则项目联动）
    'engines/public-agenda.js': 'publicAgenda',
    // v2.233.0 (EXV4-5): commonsGovernance -- 共同资源的使用权与维护责任（准入模型/维护轮值/降级/不追溯/纯读投影）
    'engines/commons-governance.js': 'commonsGovernance',
    // v2.233.0 (EXV4-6): knowledgePractice -- 知识的地方传播与实践许可（资料拆分/许可准入/环境兼容/失败证据/改良闭环）
    'engines/knowledge-practice.js': 'knowledgePractice',
    // v2.233.0 (EXV4-7): riskPooling -- 地方风险分担与保险式互助（风险池/缴纳/守恒救助/争议审查）
    'engines/risk-pooling.js': 'riskPooling',
    // v2.233.0 (EXV4-8): roleConflict -- 地方身份与多重归属冲突（多重义务/互斥撕裂/违约代价/视角隔离）
    'engines/role-conflict.js': 'roleConflict',
    // v2.233.0 (EXV4-9): institutionalInertia -- 世代交替与制度惯性（宪章绑定/继承路径分化/文书虚置退化）
    'engines/institutional-inertia.js': 'institutionalInertia',
// v2.234.0 (OPV5-1): livingWorld -- 自治市井微观生态演化与真实生计流转
    'engines/living-world.js': 'livingWorld',
    // v2.245.0 (MAP-1): 通用物理坐标、空间位置追踪与生活圈透镜
    'engines/geo-tracker.js': 'geoTracker',
    // v2.522.0：两张空间表在诊断清单里的登记（漏登记 = 自检看不见的黑盒）。
    //   local-grid 是平面求解器、spatial-bridge 是缝合层的统一入口 —— 两者都不进清单时，
    //   tool-diag 的「诊断清单覆盖全部磁盘模块」会把它们报成缺件（判据在说真话）。
    'engines/local-grid.js': 'localGrid',
    'engines/spatial-bridge.js': 'spatialBridge',
    'engines/spatial-topology.js': 'spatialTopology',
    'engines/transit-scheduler.js': 'transitScheduler',
    'engines/environmental-occlusion.js': 'environmentalOcclusion',
    'engines/spatial-trace.js': 'spatialTrace',
    'engines/personal-inventory.js': 'personalInventory',
    'engines/metabolism-clock.js': 'metabolismClock',
    'engines/environmental-hazard.js': 'environmentalHazard',
    'engines/disaster-evacuation.js': 'disasterEvacuation',
    'engines/spatial-conflict.js': 'spatialConflict',
    'engines/universal-routine.js': 'universalRoutine',
    'engines/social-encounter.js': 'socialEncounter',
    'engines/lens-culling.js': 'lensCulling',
    'engines/cascade-bus.js': 'cascadeBus',
    // v2.330.0 (V16): 新物理引擎
    'engines/microclimate-phase.js': 'microclimatePhase',
    'engines/toxic-metabolism.js': 'toxicMetabolism',
    'engines/pyro-telecom.js': 'pyroTelecom',
    'engines/contraband-pipeline.js': 'contrabandPipeline',
    'engines/crowd-panic.js': 'crowdPanic',
    'engines/veracity-arbitration.js': 'veracityArbitration',
    'engines/gear-wear.js': 'gearWear',
    'engines/cover-ballistics.js': 'coverBallistics',
    'engines/health-preflight.js': 'healthPreflight',
    'engines/narrative-deduction.js': 'narrativeDeduction',
    'engines/anti-omniscience.js': 'antiOmniscience',
    'engines/persona-anchor.js': 'personaAnchor',
    // v2.250.0（拓展）：四个新引擎的 ns 登记。产品文件，缺席本身就是断裂
    //   （诊断清单少报一个黑盒 —— 与 plan/mend/gear 同口径）。
    'engines/gen-timing.js': 'genTiming',
    'engines/one-shot-mod.js': 'oneShotMod',
    'engines/mood-glide.js': 'moodGlide',
    'engines/output-guard.js': 'outputGuard',
    // v2.246.0 (MAP-2): SVG 画布平滑飞行漫游、动态避让与同地聚类引擎
    'render/map-viewport.js': 'mapViewport',
    // 同批补登两个更早就在磁盘与 LOAD 清单里、却一直漏登记本表的引擎。
    //   它们不是本版新增，但「漏登记时长」不改变后果：诊断清单少报一个黑盒。
    'engines/family.js': 'family', 'engines/research.js': 'research',
    // v2.231.0（拓展 EXP-1）：能力成长台账。产品文件，缺席本身就是断裂（同 plan/mend 口径）。
    'engines/training.js': 'training',
    // v2.231.0（拓展 EXP-2）：唯一物件台账。产品文件，缺席本身就是断裂。
    'engines/gear.js': 'gear',
    // v2.231.0（拓展 EXP-3）：持续生产台账（工单 / 设施容量 / 班次）。
    //   产品文件，缺席本身就是断裂（同 plan/mend/gear 口径）。
    'engines/production.js': 'production',
    // v2.231.0（拓展 EXP-4）：探索与地理发现台账（认知行 / 勘察单）。
    //   产品文件，缺席本身就是断裂（同 plan/mend/gear/production 口径）。
    'engines/survey.js': 'survey',
    // v2.231.0（拓展 EXP-5）：对抗场景台账（场景行 / 判定台账）。
    //   产品文件，缺席本身就是断裂（同 plan/mend/gear/production/survey 口径）。
    'engines/contest.js': 'contest',
    'engines/ruling.js': 'ruling',
    // v2.231.0（拓展 EXP-7）：公共活动台账（活动行 / 报名 / 分轮结果 / 奖品）。
    //   产品文件，缺席本身就是断裂（同 plan/mend/gear/production/survey/contest 口径）。
    'engines/activity.js': 'activity',
    // v2.51.0（第三十六面）：叙事工艺设置面（rules.craft 所指的设置面本体）
    'engines/style.js': 'style',
    'engines/life.js': 'life',
    'engines/intel.js': 'intel',
    'engines/org.js': 'org',
    'engines/longline.js': 'longline',
    // v2.135.0（E6）：伏笔生命周期（埋了没收 / 兑现 / 过期）。
    //   漏登记的后果不是「少一行字」：该模块在定义面上不存在（inventory 的定义面取本表）。
    'engines/foreshadow.js': 'foreshadow',
    // v2.62.0：因果结算
    'engines/causal.js': 'causal',
    // v2.97.0（X5）：跨插件因果桥（入站边）
    'engines/phone-bridge.js': 'phoneBridge',
    // v2.63.0：世界织体 / 社交漩涡 / 悬案（与 index.js LOAD_ORDER 同批登记）
    'engines/world.js': 'world',
    'engines/weather.js': 'weather',
    'engines/difficulty.js': 'difficulty',
    'engines/shadow.js': 'shadow',
    'engines/threads.js': 'threads',
    'engines/offstage-queue.js': 'offstageQueue',
    'engines/act-step.js': 'actStep',
    'engines/trace-post.js': 'tracePost',
    'engines/misbelief.js': 'misbelief',
    'engines/thread-sprout.js': 'threadSprout',
    'engines/dormant-ladder.js': 'dormantLadder',
    'engines/consequence-schedule.js': 'consequenceSchedule',
    'engines/appointment.js': 'appointment',
    'engines/time-ledger.js': 'timeLedger',
    'engines/hearsay-ledger.js': 'hearsayLedger',
    'engines/far-account.js': 'farAccount',
    'engines/interlude.js': 'interlude',
    'engines/letter-post.js': 'letterPost',
    'engines/world-brief.js': 'worldBrief',
    'engines/narrative-preset.js': 'narrativePreset',
    'engines/world-loop-log.js': 'worldLoopLog',
    'engines/cost-guard.js': 'costGuard',
    'engines/continuity-guard.js': 'continuityGuard',
    'engines/controllability.js': 'controllability',
    'engines/story-rhythm.js': 'storyRhythm',
    // v2.96.0（X3）：传播与辟谣（与 index.js LOAD_ORDER 同批登记）。
    'engines/rumor.js': 'rumor',
    // v2.99.0：原著幕目（与 index.js LOAD_ORDER 同批登记）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——
    //   canon.js 是产品文件，它缺席（LOAD 清单漏登记/文件被删）本身就是断裂，
    //   不该被 OPTIONAL_EXPORTS 静默兜住。
    'engines/canon.js': 'canon',
    // v2.66.0：情绪通道 / 关系六型 / 假面（与 index.js LOAD_ORDER 同批登记）
    'engines/affect.js': 'affect',
    'engines/bonds.js': 'bonds',
    'engines/masks.js': 'masks',
    // v2.67.0：时间锁 / 双层性格 / 好感审计 / 场外事件（与 index.js LOAD_ORDER 同批登记）
    'engines/temporal-lock.js': 'temporalLock',
    'engines/temperament.js': 'temperament',
    'engines/fondness.js': 'fondness',
    'engines/affection-nexus.js': 'affectionNexus',
    'engines/intimate-arbiter.js': 'intimateArbiter',
    'engines/parallel-events.js': 'parallelEvents',
    // v2.68.0：资料片周期 / 生存三轴 / 通缉 / 驯兽（与 index.js LOAD_ORDER 同批登记）
    'engines/era-cycle.js': 'eraCycle',
    'engines/survival.js': 'survival',
    'engines/warrant.js': 'warrant',
    'engines/beast-bond.js': 'beastBond',
    // v2.69.0：外貌分级契约 / 原型阶梯（与 index.js LOAD_ORDER 同批登记）
    'engines/appearance.js': 'appearance',
    'engines/body-anatomy.js': 'bodyAnatomy',
    'engines/ladder.js': 'ladder',
    'engines/scene-slice.js': 'sceneSlice',
    'engines/gauge.js': 'gauge',
    'engines/rivalry.js': 'rivalry',
    'engines/enigma.js': 'enigma',
    'engines/tempo.js': 'tempo',
    'engines/quota.js': 'quota',
    'engines/spotlight.js': 'spotlight',
    'engines/karma.js': 'karma',
    'engines/hazard.js': 'hazard',
    'engines/marginal.js': 'marginal',
    'engines/tolerance.js': 'tolerance',
    'engines/events.js': 'events',
    'engines/checkpoints.js': 'checkpoints',
    // v2.117.0（计划二 B1）：行动执行（意图 → 候选 → 准入 → 执行 → 完成或失败 → 后果）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**；act.js 是产品文件，
    //   它缺席（LOAD 漏登记 / 文件被删）本身就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    'engines/act.js': 'act',
    // v2.117.0（计划二 B6）：机会形成 + 题材完整配置配方。两者都是产品文件，
    //   缺席（LOAD 漏登记 / 文件被删）本身就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    'engines/opportunity.js': 'opportunity', 'engines/recipe.js': 'recipe',
    // v2.119.0（拓展计划 ①②）：人物多步计划 / 关系修复。两者都是产品文件，
    //   缺席（LOAD 漏登记 / 文件被删）本身就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    'engines/plan.js': 'plan', 'engines/mend.js': 'mend',
    // v2.119.0（优化③）：core/exec.js 进本表。它自 v2.118.0（计划二 B7）起就是**产品承重结构**
    //   （act / world / causal / phone-bridge / rehearsal 都在调用期经 WA.exec 取值），
    //   却一直漏在这份声明表之外 —— 后果不是「少一行字」，而是「自检看不见的黑盒」：
    //   tests/inventory.js 的定义面与 tool-diag 的诊断面都从本表取，漏登记等于它在两面都不存在。
    //   由 tests/run.js:1409「诊断清单覆盖全部磁盘模块」盯着（本版实测报「缺 core/exec.js」）。
    'core/exec.js': 'exec',
    // v2.160.0（TP4）：跨引擎提交契约。登记在此 = 该文件缺席时 secModules 会**如实报 missing**。
    //   它有产品真消费方（tool-diag 的诊断节读 WA.commit.stat），缺席就是断裂。
    'core/commit.js': 'commit',
    // v2.119.0（拓展计划 ③）：供需循环。同 plan/mend 口径：产品文件，缺席本身就是断裂。
    'engines/economy.js': 'economy',
    // v2.119.0（拓展计划 ④）：组织制度。同口径：产品文件，缺席本身就是断裂。
    'engines/inst.js': 'inst',
    // v2.119.0（拓展计划 ⑤）：调查卷宗。同口径：产品文件，缺席本身就是断裂。
    'engines/probe.js': 'probe',
    'engines/region.js': 'region',
    'engines/stage.js': 'stage',
    'engines/session.js': 'session',
    // v2.129.0（缝 A1..A10）：十个新引擎。登记在此 = 该文件缺席时 secModules 会**如实报 missing**。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于这些模块在定义面上不存在（自检看不见的黑盒）。
    'engines/userlock.js': 'userlock', 'engines/rewriter.js': 'rewriter', 'engines/storyclock.js': 'storyclock',
    'engines/rhythm-loop.js': 'rhythmLoop', 'engines/motif.js': 'motif', 'engines/beat-mask.js': 'beatMask',
    'engines/preset-world.js': 'presetWorld', 'engines/power-anchor.js': 'powerAnchor',
    'engines/request-viewer.js': 'requestViewer', 'engines/wb-search.js': 'wbSearch',
    // v2.130.0（拓展计划 A1..A4 / B1 / C1 / C2 / D1..D4）：十二个新引擎。登记在此 =
    //   该文件缺席时 secModules 会**如实报 missing**。漏登记的后果不是「少一行字」：
    //   inventory 的定义面与出口面契约都从本表取，漏了就等于这些模块在定义面上不存在。
    'engines/stale-guard.js': 'staleGuard', 'engines/purify-scope.js': 'purifyScope',
    'engines/group-refuse.js': 'groupGuard', 'engines/reasoning.js': 'reasoning',
    'engines/story-tone.js': 'storyTone', 'engines/calendar-custom.js': 'calendarPlan',
    'engines/rehearse.js': 'preflight', 'engines/archive-hide.js': 'archiveHide',
    'engines/word-budget.js': 'wordBudget', 'engines/binding.js': 'binding',
    'engines/refine.js': 'refine', 'engines/polish.js': 'polish',
    // v2.138.0（E5）：多模型并发推演与结果仲裁。登记在此 = 该文件缺席时 secModules 会**如实报 missing**。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于它在定义面上不存在（自检看不见的黑盒）。
    'engines/ensemble.js': 'ensemble',
    // v2.139.0（E9）：势力关系动态图。登记为**必载**——它读 evolution（档位/状态词表的
    //   单一真源）与 store，缺席就是「关系网读数缺席」，那本身就是断裂，不该被静默兜住。
    'engines/faction-graph.js': 'factionGraph',
    // v2.140.0（F1）：防全知闸门。登记在此 = 缺席时 secModules 会**如实报 missing**。
    'engines/noesis.js': 'noesis',
    // v2.141.0（F2）：生理与照护真实层。登记在此 = 缺席时 secModules 会**如实报 missing**。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于它在定义面上不存在（自检看不见的黑盒）。
    'engines/lifeline.js': 'lifeline',
    // v2.142.0（F3）：视角锁。登记在此 = 缺席时 secModules 会**如实报 missing**。
    'engines/perspective-lock.js': 'perspective',
    // v2.148.0（RP1）：性能历史台账。登记为必载——面板「性能」页与 secPerfLedger 读它的现场读数。
    'engines/perf-ledger.js': 'perfLedger',
    // v2.148.0（RP2）：磁带卷仓库。登记为必载——面板「因果」页与 secTapeStore 读它的仓库读数。
    'engines/tape-store.js': 'tapeStore',
    // v2.149.0（X1）：世界沉积层。登记为必载——注入链 sediment 源与 secSediment 读它的现场读数。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于它在定义面上不存在（自检看不见的黑盒）。
    'engines/sediment.js': 'sediment',
    // v2.150.0（RP4）：注入价值评估。登记为必载——注入链 observe / interceptor settle 两个
    //   生产方与 secInjectValue 均读它，缺席就是「价值面读数缺席」本身，不该被静默兜住。
    'engines/inject-value.js': 'injectValue',
    // v2.151.0（RX2+RX3）：跨会话记忆锚 + 远方世界脉搏。登记为必载——注入链两条
    //   新源与 secOfflineTick / secFarfield 块均读它们，缺席就是「离线/远方读数缺席」本身，不该被静默兜住。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取。
    'engines/offline-tick.js': 'offlineTick',
    'engines/farfield.js': 'farfield',
    // v2.152.0（RP7）：存储水位预测。登记为必载——面板「会话」页性能与水位段读它的读数。
    'engines/storage-forecast.js': 'storageForecast',
    // v2.153.0（RX5+RX6）：剧情深度仪 + 多结局分支树。登记为必载 —— 面板「导演」页两段
    //   与 secPlotGauge / secBranchTree 均读它们，缺席就是「深度/分支读数缺席」本身。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取。
    'engines/plot-gauge.js': 'plotGauge',
    'engines/branch-tree.js': 'branchTree',
    'engines/branch-diff.js': 'branchDiff',
    // v2.227.0(拓展 N9):三项目剧情事件闭环。登记为必载——面板「事件闭环」页与本文件的
    //   secStoryLoop 均读它,缺席就是「闭环读数缺席」本身。漏登记的后果不是「少一行字」:
    //   inventory 的定义面与出口面契约都从本表取。
    'engines/story-loop.js': 'storyLoop',
    // v2.228.0(拓展 N10):历史留存与检索。登记为必载 —— 面板「留存」页与
    //   本文件的 secRetrieval 均读它,缺席就是「留存读数缺席」本身。
    //   漏登的后果不是「少一行字」:inventory 的定义面与出口面契约都从本表取。
    'engines/retrieval.js': 'retrieval',
    // v2.230.0（拓展 N12）：十枚新引擎登记为必载。漏登的后果不是「少一行字」：
    //   inventory 的定义面与出口面契约都从本表取（LOAD 进了不等于登记了）。
    'engines/elsewhere.js': 'elsewhere',
    'engines/vitals.js': 'vitals',
    'engines/fate.js': 'fate',
    'engines/coordinate.js': 'coordinate',
    'engines/compare.js': 'compare',
    'engines/beat.js': 'beat',
    'engines/backstage-tone.js': 'backstageTone',
    'engines/dream.js': 'dream',
    'engines/modelink.js': 'modelink',
    'engines/portal.js': 'portal',
    // v2.230.0（拓展 N12 续批）：16 枚新引擎一并登记为必载。漏登的后果不是「少一行字」：
    //   inventory 的定义面与出口面契约都从本表取（LOAD 进了不等于登记了）。
    'engines/floor-snapshot.js': 'floorSnapshot',
    'engines/memory-tiers.js': 'memoryTiers',
    'engines/deep-clean.js': 'deepClean',
    'engines/lingqi.js': 'lingqi',
    'engines/scope-tag.js': 'scopeTag',
    'engines/reasoning-strip.js': 'reasoningStrip',
    'engines/length-policy.js': 'lengthPolicy',
    'engines/auto-hide.js': 'autoHide',
    'engines/prefilter-gate.js': 'prefilterGate',
    'engines/community-note.js': 'communityNote',
    'engines/world-clock.js': 'worldClock',
    'engines/outline-inject.js': 'outlineInject',
    'engines/redact-layer.js': 'redactLayer',
    'engines/relation-graph.js': 'relationGraph',
    'engines/solo-voice.js': 'soloVoice',
    'engines/observe-slice.js': 'observeSlice',
    // v2.154.0（RX4+RX7）：世界联网面 + 世界生态自洽审计。登记为必载 —— 注入链的
    //   `远方的传说` 源读 worldBridge.buildBlock，面板「联网」页与本文件的 secWorldBridge /
    //   secEcoAudit 都读它们，缺席就是「联网/自洽读数缺席」本身，不该被静默兜住。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取。
    'engines/world-bridge.js': 'worldBridge',
    'engines/eco-audit.js': 'ecoAudit',
    // v2.155.0（RX8）：世界生成种子库。登记为必载 —— 面板「工具」页种子库段与本文件的
    //   secWorldSeed 都读它，缺席就是「种子库读数缺席」本身，不该被静默兜住。
    'engines/world-seed.js': 'worldSeed',
    // v2.164.0（TX5）：版本化完整世界蓝图。登记为必载 —— 面板「工具」页蓝图段与本文件的
    //   secWorldBlueprint 都读它，缺席就是「蓝图库读数缺席」本身，不该被静默兜住。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取。
    'engines/world-blueprint.js': 'worldBlueprint',
    // v2.200.0（第四批 Y5）：世界快照与整包搬运。缺席 ⇒ 本模块**如实报缺**
    //   （不降级成 OPTIONAL —— 它是产品文件，缺席本身就是断裂）。
    'engines/world-snapshot.js': 'worldSnapshot',
    // v2.201.0（第四批 Y6）：世界历史检索（一个入口跨六个库）。登记为必载 ——
    //   面板「检索」页七枚 handler 全读它，本文件的 secHs 诊断节也读它；
    //   缺席就是「检索面读数缺席」本身，不该被静默兜住。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于它在定义面上不存在（自检看不见的黑盒）——
    //   本版实测：未登记时 inventory 报「未登记模块 1」，且 export_contract 产物里
    //   没有 historySearch 段（接口面从未被冻结，改名删成员无人确认）。
    'engines/history-search.js': 'historySearch',
    // v2.202.0（第四批 Y7）：地图与关系可视化（engines/world-graph.js）。
    //   ⚠ Y6 抓过的教训：**LOAD 进了不等于登记了** —— 本表是定义面与出口面契约的
    //   单一真源，漏了它这一行，后果不是「少一行字」：出口面契约里不会有 worldGraph 段
    //   （接口面从未被冻结，改名删成员无人确认），而 LOAD 那一侧照样绿。
    'engines/world-graph.js': 'worldGraph',
    // v2.210.0（拓展 8）：地图上的行动与行程工作台（engines/travel-desk.js）。
    //   Y6 抓过的教训同样适用：**LOAD 进了不等于登记了** —— 本表是定义面与出口面
    //   契约的单一真源，漏了它这一行，出口面契约里就不会有 travelDesk 段
    //   （接口面从未被冻结，改名删成员无人确认），而 LOAD 那一侧照样绿。
    'engines/travel-desk.js': 'travelDesk',
    // v2.221.0（拓展 N3）：经营供应链（engines/supply-chain.js）。
    //   Y6 抓过的教训同样适用：**LOAD 进了不等于登记了** —— 本表是定义面与出口面
    //   契约的单一真源，漏了它这一行，出口面契约里就不会有 supplyChain 段
    //   （接口面从未被冻结，改名删成员无人确认），而 LOAD 那一侧照样绿。
    'engines/supply-chain.js': 'supplyChain',
    // v2.222.0（拓展 N4）：调查证据工作台（engines/evidence-board.js）。
    //   Y6 抓过的教训同样适用：**LOAD 进了不等于登记了** —— 本表是定义面与出口面
    //   契约的单一真源，漏了它这一行，出口面契约里就不会有 evidenceBoard 段
    //   （接口面从未被冻结，改名删成员无人确认），而 LOAD 那一侧照样绿。
    'engines/evidence-board.js': 'evidenceBoard',
    'engines/diplomacy.js': 'diplomacy',
    'engines/agency.js': 'agency',
    // v2.167.0（TX3）：守恒运输（在途货运）。登记为必载 —
    //   面板「世界」页货运段与本文件的 secFreight 都读它，缺席就是
    //   「货运读数缺席」本身，不该被静默兜住。
    'engines/freight.js': 'freight',
    'engines/story-choice.js': 'storyChoice',
    // v2.518.0：故事回应窗口。登记为必载 — 面板故事段、render/inject 注入分支与
    //   本文件的 secStoryWindow 都读它，缺席就是「玩家介入入口消失」本身，
    //   不该被静默兜住。
    'engines/story-window.js': 'storyWindow',
    // v2.325.0：待选按钮。登记为必载 — 面板剧情段与本模块的 secChoice 都读它，
    //   缺席就是「按钮挂不上」本身，不该被静默兜住。
    'engines/choice-board.js': 'choiceBoard',
    // v2.326.0：三个缝合引擎。登记为必载 — 面板诊断段与专锁都读它们，
    //   缺席就是「读数缺席」本身，不该被静默兜住。
    'engines/narrative-lens.js': 'narrativeLens',
    'engines/reply-guard.js': 'replyGuard',
    'engines/channel-probe.js': 'channelProbe',
    'engines/commission.js': 'commission',
    'engines/investigation.js': 'investigation',
    'engines/aftermath.js': 'aftermath',
    'engines/operations.js': 'operations',
    // v2.166.0（TX2）：行动调度（动机 / 计划 / 行动闭环）。登记为必载 —
    //   面板「世界」页行动调度段与本文件的 secAgency 都读它，缺席就是
    //   「行动闭环读数缺席」本身，不该被静默兜住。
    // v2.156.0（SP1）：游玩活动基准。登记为必载 —— 面板「会话」页基准段与本文件的
    //   secPlaytime 都读它，缺席就是「活动基准读数缺席」本身，不该被静默兜住。
    'engines/playtime.js': 'playtime',
    // v2.156.0（S1）：离线恢复编排。登记为必载 —— 面板「会话」页恢复段与本文件的
    //   secOfflineReturn 都读它；它自己不算数值、不写键，但缺席就是「恢复编排缺席」本身
    //   （离线批要么不发生、要么重复发生，而两者在读数上同形）。
    'engines/offline-return.js': 'offlineReturn',
    // v2.152.0（RP6）：面板渲染性能观测。登记为必载——renderBody 分流与面板读数段都读它。
    // v2.535.0：声明式视图层。它有产品读点（ui/panel.js 事件页的真消费方），故进表；
    //   漏登记的后果与其它 UI 模块同：自检/契约面对它没有出口，而不是报错。
    'ui/schema-view.js': 'schemaView',
    'ui/render-perf.js': 'renderPerf',
    // v2.209.0（优化 6）：面板导航协议。登记为**必载** —— 面板的每一个 data-nav 控件与
    //   `#wa-nav-back` 都走它；缺席就是「跳转与定位整条失效」本身，不该被静默兜住。
    'ui/panel-nav.js': 'panelNav',
    // v2.225.0(Q8):专家段折叠。登记为**必载** —— 面板每个 wa-sec 段头都走它;
    //   缺席就是「折叠整条失效」本身(而失效的表现是「点了没反应」,零读数)。
    'ui/panel-fold.js': 'panelFold',
    // v2.400.0（V22 OPV22-4）：概览页六块只读诊断。登记为**必载** —— panel.js 的七个
    //   同名转发函数在运行期惰性读它；缺席时六块静默返回空串（renderOverview 的
    //   try/catch 不报错），那正是「看起来正常、实际没读数」那一族。
    'ui/pages/overview-blocks.js': 'panelOverviewBlocks',
    // v2.401.0（OPV23-1~3）：三段拆分。登记为**必载** —— panel.js 的转发函数在
    //   运行期惰性读它们；缺席时整页降级行，那正是「看起来正常、实际没读数」那一族。
    'ui/pages/overview-main.js': 'panelOverviewMain',
    'ui/pages/tools-page.js': 'panelToolsPage',
    'ui/pages/dashboards.js': 'uiDashboards',
    // v2.517.0（V26 收口）：世界脉搏聚合块补登记（v2.415.0 引入时漏登，inventory 一直报
    //   「未登记模块」—— 面板转发在运行期惰性读它，缺席=整块降级，与 overview-blocks 同款）。
    'ui/pages/overview-world-pulse.js': 'panelWorldPulse',
    // v2.518.0 收口（UI-P1）：玩家面两个页模块补登记。与 overview-world-pulse 同款：
    //   面板在运行期惰性读它们（WA.panelNowPage / WA.panelPeoplePage），缺席时整段降级
    //   ——那正是「看起来正常、实际没读数」那一族。不登记的后果已实测：
    //   「诊断清单覆盖全部磁盘模块」当场报缺这两个文件。
    'ui/pages/now-page.js': 'panelNowPage',
    'ui/pages/people-page.js': 'panelPeoplePage',
    // v2.542.0：玩家面手札 / 开发者面工作台外壳。登记为**必载**（都在 index.js 的 LOAD_ORDER
    //   里、且必须先于无头环境判定就能定义命名空间）—— 但它们的 ns 是**自执行入口型**：
    //   没有别的模块读 WA.journal / WA.console，缺席的表现是「◈ 还是老面板 / 面板还是老样子」，
    //   不是一段降级行。故同时进 OPTIONAL_EXPORTS（无头不装载 → optionalMissing）。
    'ui/journal.js': 'journal',
    'ui/console.js': 'console',
    // v2.101.0（O11）：跨插件互操作验收面（三伙伴五态分列，纯读）
    'engines/interop.js': 'interop',
    // v2.102.0（A2/O12）：性能基线与分层增量。登记为**必载**——它读 render / tool-diag / canon
    //   三处既有出口，缺席就是「性能面读数缺席」，那本身就是断裂，不该被静默兜住。
    'engines/perf-trace.js': 'perfTrace',
    // v2.182.0（第二批 E2/E5/O4/O3/O5）：五只**只读聚合面**。全部登记为必载 ——
    //   计划原文要求「一屏能答『我有什么没做完 / 卡住了 / 快满了』」，五个面各答一段；
    //   缺席就是那一段读数缺席本身（缺口被静默填平），不该被 OPTIONAL_EXPORTS 兜住。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于它们在定义面上不存在（自检看不见的黑盒）。
    //     · agenda        —— 世界日程（未来事件表，只认剧情时间）
    //     · chronicleView —— 编年史视图（空历史与读不到**可分**）
    //     · capacityAudit —— 存储压力 / 义务清点 / 迁移预检（维护者面逐容器全表）
    //     · perfBaseline  —— 性能基线与档位（现场字节读数判档，不留估算占位）
    //     · worldHealth   —— 玩家可读三栏摘要（待办 / 阻塞 / 水位）+ 下钻路由
    'engines/agenda.js': 'agenda',
    'engines/chronicle-view.js': 'chronicleView',
    'engines/capacity-audit.js': 'capacityAudit',
    'engines/perf-baseline.js': 'perfBaseline',
    'engines/world-health.js': 'worldHealth',
    // v2.183.0（第一批 E1）：统一待办事项中心（engines/pending-center.js）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——它的真消费方是
    //   面板区块与诊断节（本表），缺席就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于它在定义面上不存在（自检看不见的黑盒）。
    'engines/pending-center.js': 'pendingCenter',
    'engines/campaign.js': 'campaign',
    // v2.187.0（E6）：统一世界地图与关系视图（engines/atlas.js）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——它的真消费方是
    //   面板区块与诊断节（本表），缺席就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    'engines/atlas.js': 'atlas',
    // v2.187.0（E8）：蓝图 / 种子依赖包与迁移助手（engines/dep-check.js）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——它的真消费方是
    //   面板区块与诊断节（本表），缺席就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    'engines/dep-check.js': 'depCheck',
    // v2.188.0（E7）：玩家自定义规则包与白名单自动化模板（engines/rule-pack.js）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——它的真消费方是
    //   面板区块与诊断节（本表），缺席就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    'engines/rule-pack.js': 'rulePack',
    // v2.188.0（E9）：隔离世界实验室与反事实对比（engines/world-lab.js）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——它的真消费方是
    //   面板区块与诊断节（本表），缺席就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    'engines/world-lab.js': 'worldLab',
    // v2.189.0（缝 A1/A2/A3 + B1/B2）：四个新引擎（拍回报 / 未来安排复验 / 拍账 / 生成闸门）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——它们的真消费方是
    //   注入链（beatReport / genGate）与面板区块、诊断节（本表），缺席就是断裂，
    //   不该被 OPTIONAL_EXPORTS 静默兜住。漏登记的后果不是「少一行字」：
    //   inventory 的定义面与出口面契约都从本表取。
    'engines/beat-report.js': 'beatReport',
    'engines/plan-audit.js': 'planAudit',
    'engines/beat-ledger.js': 'beatLedger',
    'engines/gen-gate.js': 'genGate',
    // v2.192.0（U5）：拒收码到恢复动作的统一映射（engines/reject-recovery.js）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——它是诊断面 / 面板面 /
    //   日志面共用的那一份映射（本表就是它的诊断面消费方），缺席就是断裂，
    //   不该被 OPTIONAL_EXPORTS 静默兜住。
    'engines/reject-recovery.js': 'rejectRecovery',
    // v2.193.0（第二批 · U1）：拍引擎家族的统一运行门面（engines/beat-facade.js）。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——它是四引擎的**唯一编排口**
    //   （面板面 / 诊断面 / 日志面从本表取出口面契约），缺席就是断裂，不该被
    //   OPTIONAL_EXPORTS 静默兜住。
    'engines/beat-facade.js': 'beatFacade',
    // v2.253.0：v2.244.0–v2.252.0 六个批次新增的十二枚引擎，连同本版新引擎，一次性补齐登记。
    //   判据是「诊断清单覆盖全部磁盘模块」——漏登记不是报错，是自检看不见的黑盒。
    'engines/compact-timing.js': 'compactTiming',
    'engines/credit-ledger.js': 'creditLedger',
    'engines/defer-token.js': 'deferToken',
    'engines/dream-settle.js': 'dreamSettle',
    'engines/ephemeral-scrub.js': 'ephemeralScrub',
    'engines/followup-gate.js': 'followupGate',
    'engines/identity-match.js': 'identityMatch',
    'engines/interest-face.js': 'interestFace',
    'engines/stall.js': 'stall',
    'engines/observation-projection.js': 'observationProjection',
    'engines/scene-budget.js': 'sceneBudget',
    // v2.257.0（V6 OPV6-1 / OPV6-2）：能力档位 + 启用面可见。
    //   登记在此 = 该文件缺席时 secModules 会**如实报 missing**——它们的真消费方是
    //   设置页 / 概览页 / 诊断节（本表），缺席就是断裂，不该被 OPTIONAL_EXPORTS 静默兜住。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于它在定义面上不存在（自检看不见的黑盒）。
    'engines/capability-tier.js': 'capabilityTier',
    'engines/capability-audit.js': 'capabilityAudit',
    'engines/success-grade.js': 'successGrade',
    'engines/outcome-dice.js': 'outcomeDice',
    'engines/identity-ledger.js': 'identityLedger',
    'engines/address-form.js': 'addressForm',
    'engines/aging.js': 'aging',
    'engines/habit-tell.js': 'habitTell',
    'engines/etiquette.js': 'etiquette',
    'engines/floor-order.js': 'floorOrder',
    'engines/interrupt-cost.js': 'interruptCost',
    'engines/overhear-split.js': 'overhearSplit',
    'engines/quiet-round.js': 'quietRound',
    'engines/finale.js': 'finale',
    'engines/arc-settle.js': 'arcSettle',
    'engines/loose-ends.js': 'looseEnds',
    'engines/exit-rite.js': 'exitRite',
    'engines/past-life.js': 'pastLife',
    'engines/reputation-after.js': 'reputationAfter',
    'engines/posthumous.js': 'posthumous',
    'engines/price-voice.js': 'priceVoice',
    'engines/livelihood.js': 'livelihood',
    'engines/world-bounds.js': 'worldBounds',
    'engines/weighted-draw.js': 'weightedDraw',
    'engines/narrative-dice.js': 'narrativeDice',
    'engines/spatial-acoustics.js': 'spatialAcoustics',
    'engines/contraband.js': 'contraband',
    'engines/terrain-hazard.js': 'terrainHazard',
    'engines/foreshadow-tree.js': 'foreshadowTree',
    'engines/subtext-tension.js': 'subtextTension',
    'engines/autobiography-epiphany.js': 'autobiographyEpiphany',
    'engines/faction-chronicle.js': 'factionChronicle',
    'engines/legacy-oath.js': 'legacyOath',
    'engines/city-folklore.js': 'cityFolklore',
    'engines/periodical-ideology.js': 'periodicalIdeology',
    'engines/counterfactual-sandbox.js': 'counterfactualSandbox',
    'engines/civilization-relic.js': 'civilizationRelic',
    'engines/idiosyncrasy.js': 'idiosyncrasy',
    'engines/whisper-backchannel.js': 'whisperBackchannel',
    'engines/collateral-rupture.js': 'collateralRupture',
    'engines/action-cost-feedback.js': 'actionCostFeedback',
    'engines/foreshadow-germination.js': 'foreshadowGermination',
    'engines/courier-dispatch.js': 'courierDispatch',
    'engines/supply-choke.js': 'supplyChoke',
    'engines/rumor-cognition.js': 'rumorCognition',
    'engines/cognitive-poisoning.js': 'cognitivePoisoning',
    'engines/dilemma-bargain.js': 'dilemmaBargain',
    'engines/faction-schism.js': 'factionSchism',
    'engines/institutional-schism.js': 'institutionalSchism',
    'engines/environment-interference.js': 'environmentInterference',
    'engines/branch-transplant.js': 'branchTransplant',
    'engines/sanctuary-scramble.js': 'sanctuaryScramble',
    'engines/counterfactual-echo.js': 'counterfactualEcho',
    // v2.323.0: 退场角色生计与怪诞市井暗线
    'engines/offstage-life.js': 'offstageLife',
    'engines/eccentric-threads.js': 'eccentricThreads',
    'engines/human-realism.js': 'humanRealism',
    'render/inject.js': 'render', 'render/theater.js': 'theater', 'render/purifier.js': 'purifier',
    'actors/registry.js': 'registry', 'actors/monologue.js': 'monologue',
    'actors/observe.js': 'observe', 'actors/profile.js': 'profile',
    'direction/oracle.js': 'oracle', 'direction/tags.js': 'tags', 'direction/choices.js': 'choices',
    'compat/host.js': 'compat', 'compat/mvu.js': 'compatMvu', 'compat/th-helper.js': 'compatTH',
    'ui/panel.js': 'ui', 'ui/settings.js': 'uiSettings', 'ui/assistant.js': 'assistant',
    // v2.181.0：赛博朋克 UI 主题层的 8 个新文件 —— 全树盘查判据要求「诊断清单覆盖磁盘上
    //   每一个 js 模块」，漏登记即红灯（此前实测缺 8 个 ui 文件）。它们的 ns 登记为可选：
    //   无头环境里 ui/*.js 不装载，缺席是「可选缺席」而非「真缺席」。
    'ui/cyberpunk-theme.js': 'cyberpunkTheme',
    'ui/cyberpunk-components.js': 'cyberUI',
    'ui/cyberpunk-dashboard.js': 'cyberDashboard',
    'ui/cyberpunk-people.js': 'cyberPeople',
    'ui/cyberpunk-logs.js': 'cyberLogs',
    'ui/cyberpunk-animations.js': 'cyberAnimate',
    'ui/cyberpunk-responsive.js': 'cyberResponsive',
    'ui/theme-switch.js': 'themeSwitch',
    // v2.282.0：V7 三个新引擎此前漏登记 —— 「诊断清单覆盖全部磁盘模块」判据当场报
    //   「缺 engines/driver-ledger.js,engines/intake-dispatch.js,engines/write-contract.js」。
    //   漏登记的后果不是「少一行字」：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于它在定义面上不存在（自检看不见的黑盒）。ns 名取自各文件导出面实测。
    'engines/driver-ledger.js': 'driverLedger',
    'engines/intake-dispatch.js': 'intake',
    'engines/write-contract.js': 'writeContract',
    'engines/round-drivers.js': 'roundDrivers',
    'engines/write-desk.js': 'writeDesk',
    'engines/inject-collector.js': 'injectCollector',
    // v2.294.0（V8 收口）：玩家归档（EXV8-6 带离包）此前漏登记在本表。
    //   后果正是本表注释写的那个：inventory 的定义面与出口面契约都从本表取，
    //   漏了就等于它在定义面上不存在（自检看不见的黑盒）—— 回归里
    //   「store 台账的每个归因来源都有可读标签（实缺 1：playerArchive）」就是它现形。
    'engines/player-archive.js': 'playerArchive',
    // v2.381.0（诊断清单全部磁盘模块收口）：12 个漏登记模块。
    //   判据是 tests/run.js 的「诊断清单覆盖全部磁盘模块」——它按 core/engines/actors/
    //   direction/render/compat/ui 七个目录逐个 listdir 再与本表求差集。本批 12 个全部
    //   是**引擎已落地、注入链已接、本表未登记**：后果不是「少一行字」，而是它们在
    //   inventory 的定义面上不存在——而 inventory 正是出口面契约与死子面账本的唯一来源。
    //   更直接的后果是自检（secModules / 诊断包）看不见它们：模块装载失败、契约漂移
    //   这两类故障对它们**没有出口**。ns 名逐一取自各文件 `WA.<ns> = ` 的实测导出面。
    'core/unified-pending.js': 'unifiedPending',
    'engines/bloodline-heritage.js': 'bloodlineHeritage',
    'engines/cataclysm-hazard.js': 'cataclysmHazard',
    'engines/court-intrigue.js': 'courtIntrigue',
    'engines/dungeon-hazard-mesh.js': 'dungeonHazardMesh',
    'engines/ecosystem-cascade.js': 'ecosystemCascade',
    'engines/engineering-blueprint.js': 'engineeringBlueprint',
    'engines/epochal-transition.js': 'epochalTransition',
    'engines/financial-contagion.js': 'financialContagion',
    'engines/incarceration-jailbreak.js': 'incarcerationJailbreak',
    'engines/regiment-tactics.js': 'regimentTactics',
    'engines/theology-cult.js': 'theologyCult',
    // v2.381.0（诊断清单全部磁盘模块收口）：12 个漏登记模块。
    //   判据是 tests/run.js 的「诊断清单覆盖全部磁盘模块」——它按 core/engines/actors/
    //   direction/render/compat/ui 七个目录逐个 listdir 再与本表求差集。本批 12 个全部
    //   是**引擎已落地、注入链已接、本表未登记**：后果不是「少一行字」，而是它们在
    //   inventory 的定义面上不存在——而 inventory 正是出口面契约与死子面账本的唯一来源。
    //   更直接的后果是自检（secModules / 诊断包）看不见它们：模块装载失败、契约漂移
    //   这两类故障对它们**没有出口**。ns 名逐一取自各文件 `WA.<ns> = ` 的实测导出面。
    'core/unified-pending.js': 'unifiedPending',
    'engines/bloodline-heritage.js': 'bloodlineHeritage',
    'engines/cataclysm-hazard.js': 'cataclysmHazard',
    'engines/court-intrigue.js': 'courtIntrigue',
    'engines/dungeon-hazard-mesh.js': 'dungeonHazardMesh',
    'engines/ecosystem-cascade.js': 'ecosystemCascade',
    'engines/engineering-blueprint.js': 'engineeringBlueprint',
    'engines/epochal-transition.js': 'epochalTransition',
    'engines/financial-contagion.js': 'financialContagion',
    'engines/incarceration-jailbreak.js': 'incarcerationJailbreak',
    'engines/regiment-tactics.js': 'regimentTactics',
    'engines/theology-cult.js': 'theologyCult',
    // ── v2.400.0（V22 拓展线 EXV22-1～8）：八项制度性引擎 ──
    //   与上段同一病（引擎已落地、本表未登记），后果也同一个：
    //   inventory 的定义面上不存在它们 ⇒ 出口面契约与死子面账本都看不见；
    //   自检（secModules / 诊断包）对它们也没有出口。ns 名逐一取自各文件 `WA.<ns> = {`。
    'engines/celestial-omens.js': 'celestialOmens',
    'engines/postal-relay.js': 'postalRelay',
    'engines/levy-corvee.js': 'levyCorvee',
    'engines/mortuary-rites.js': 'mortuaryRites',
    'engines/anniversary-rites.js': 'anniversaryRites',
    'engines/outsider-integration.js': 'outsiderIntegration',
    'engines/tenancy-rent.js': 'tenancyRent',
    'engines/military-levy.js': 'militaryLevy',
    'engines/nursing-care.js': 'nursingCare',
    'engines/lost-and-found.js': 'lostFound',
    'engines/pilgrim-flow.js': 'pilgrimFlow',
    'engines/dice-den.js': 'diceDen',
    'engines/bathhouse-laundry.js': 'bathhouseLaundry',
    'engines/pawn-redemption.js': 'pawnRedemption',
    'engines/silver-assay.js': 'silverAssay',
    'engines/salt-franchise.js': 'saltFranchise',
    'engines/broker-house.js': 'brokerHouse',
    'engines/night-watch.js': 'nightWatch',
    'engines/fire-watch.js': 'fireWatch',
    'engines/festival-fair.js': 'festivalFair',
    'engines/ward-compact.js': 'wardCompact',
    'engines/divination-craft.js': 'divinationCraft',
    'engines/inject-delta.js': 'injectDelta',
    'engines/reject-phrase.js': 'rejectPhrase',
    'engines/settings-index.js': 'settingsIndex',
    'engines/save-curve.js': 'saveCurve',
    'engines/narrow-consumers.js': 'narrowConsumers',
    'engines/sartorial-regalia.js': 'sartorialRegalia',
    'engines/betrothal-alliance.js': 'betrothalAlliance',
    'engines/cartography-survey.js': 'cartographySurvey',
    'engines/lingua-broker.js': 'linguaBroker',
    // ── v2.408.0（EXV23-1 至 EXV23-9）：V23 超级史诗拓展引擎登记 ──
    'engines/commodity-circulation.js': 'commodityCirculation',
    'engines/somatic-trauma.js': 'somaticTrauma',
    'engines/psyche-dissociation.js': 'psycheDissociation',
    'engines/mob-stampede.js': 'mobStampede',
    'engines/geophysical-reshaping.js': 'geophysicalReshaping',
    'engines/artifice-degradation.js': 'artificeDegradation',
    'engines/shadow-council.js': 'shadowCouncil',
    'engines/dynastic-lineage.js': 'dynasticLineage',
    'engines/world-singularity.js': 'worldSingularity',
    // ── v2.402.0（V23 缝合线）：缝异空间 V1.4 的三台账本引擎 ──
    //   与上段同一病（引擎已落地、本表未登记）。ns 名逐一取自各文件 `WA.<ns> = {`。
    //   不登记的直接后果：secModules 把三个文件报成 missing（那是「真缺席」），
    //   export-contract 的 OWNER 不认三 ns ⇒ 契约串里所有调用点被静默跳过。
    'engines/stage-session.js': 'stageSession',
    'engines/memory-relay.js': 'memoryRelay',
    'engines/chat-recycle.js': 'chatRecycle',
    // ── v2.407.0：三缝 + 外部 11 份资料主线 A/B/C/E/F/G 的两个只读判据引擎 ──
    //   与上段同一病：引擎已落地、本表未登记 ⇒ secModules 报成 missing、
    //   export-contract 的 OWNER 不认这五个 ns ⇒ 调用点被静默跳过。
    //   ns 名逐一取自各文件 `WA.<ns> = {`，不登记即等于死导出。
    'engines/summarizer-adapter.js': 'summarizerAdapter',
    'engines/reading-bookmark.js': 'readingBookmark',
    'engines/director.js': 'director',
    // v2.542.2：叙事脊柱 L1「本幕」。必载（在 index.js 的 LOAD_ORDER 里）——
    //   缺席的表现是「注入里没有本幕这一项」，不是降级行，故按必载登记。
    'engines/character-drive.js': 'characterDrive', 'engines/arc-phase.js': 'arcPhase', 'engines/scene-intent.js': 'sceneIntent', 'engines/inject-tier.js': 'injectTier',
    'engines/branch-continuity.js': 'branchContinuity',
    'engines/fact-continuity.js': 'factContinuity',
    // v2.409.0：跨参照物缝合批三个引擎。ns 名取自各文件 `WA.<ns> = {`。
    'engines/elapsed-evidence.js': 'elapsedEvidence',
    'engines/source-reconcile.js': 'sourceReconcile',
    'engines/plan-roster.js': 'planRoster',
    // v2.409.0 收尾：补登 world-reader.js（v2.405.0 R246 引入时漏登记本表）。
    //   后果与上段同病：secModules 把它报成 missing（「真缺席」），
    //   export-contract 的 OWNER 不认 worldReader ⇒ 调用点被静默跳过。
    //   ns 名取自该文件 `WA.worldReader = {`。
    'engines/world-reader.js': 'worldReader',
    // v2.417.0（V25 柏宝书+数据库缝入批）：11 引擎。ns 名取自各文件 `WA.<ns> = {`。
    //   漏登的后果与 world-reader 同病：export-contract OWNER 不认 ⇒ 调用点静默跳过。
    'engines/player-knowledge.js': 'playerKnowledge',
    'engines/affection-dual-axis.js': 'affectionDual',
    'engines/life-profile.js': 'lifeProfile',
    'engines/suspense-ledger.js': 'suspenseLedger',
    'engines/source-hints.js': 'sourceHints',
    'engines/advance-idempotence.js': 'advanceIdem',
    'engines/takeover-yield.js': 'takeoverYield',
    'engines/sim-rehearsal.js': 'simRehearsal',
    'engines/history-batch-read.js': 'historyBatch',
    'engines/save-throttle.js': 'saveThrottle',
    'engines/history-provenance.js': 'historyProv',
    // v2.517.0（V26）：六引擎可选导出（无头环境缺 settingsBus 时走 shadow 回退，仍可加载）
    'engines/model-receipt.js': 'modelReceipt',
    'engines/token-budget.js': 'tokenBudget',
    'engines/model-pin.js': 'modelPin',
    'engines/call-timeline.js': 'callTimeline',
    'engines/model-catalog.js': 'modelCatalog',
    'engines/degrade-audit.js': 'degradeAudit'
  };

  // 无头环境（tests/命令行）不加载 UI 层，故这些导出为可选
  // v2.152.0：新增 ui 模块（ui/render-perf.js）同步进本名单 —— 漏登记的后果不是「少一行字」，
  //   而是 secModules 把 ui/render-perf.js 报成 missing，而它本来该归 optionalMissing
  //   （「无头环境缺席」与「产品文件断裂」是两件事，混在一起会让自检的红灯失去信息量）。
  //   另注：tests/export-contract.js 里有一份**同名口径的第二副本**（OPTIONAL），两处必须同改。
  // v2.536.0：ui/schema-view.js —— 与 tests/run.js 的 UI_NS2800、tests/export-contract.js
  //   的 OPTIONAL 同批（这是第三处同名名单：契约口径两处 + 自检口径一处）。
  const OPTIONAL_EXPORTS = ['ui', 'uiSettings', 'assistant', 'compat', 'renderPerf', 'panelNav', 'schemaView',
      // v2.225.0(Q8):ui/panel-fold.js —— 无头环境里 ui/*.js 不装载,不登记会被 secModules
      //   报成 missing(那是「真缺席」,不是「可选缺席」)。
      'panelFold',
      // v2.181.0：赛博朋克 UI 主题层 9 个 ns —— 无头环境里 ui/*.js 不装载，
      //   不登记它们会被 secModules 报成 missing（那是「真缺席」，不是「可选缺席」）。
      'cyberUI',
      'cyberDashboard',
      'cyberPeople',
      'cyberLogs',
      'cyberAnimate',
      'cyberResponsive',
      'cyberpunkTheme',
      'themeStyles',
      'themeSwitch',
      // v2.401.0(OPV23-1~3):三段拆分 —— 与 tests/export-contract.js 的 OPTIONAL 成对
      //   （两处口径必须一致）。无头环境里 ui/pages/*.js 不装载，不登记会被
      //   secModules 报成 missing（那是「真缺席」，不是「可选缺席」）。
      'panelOverviewMain',
      'panelToolsPage',
      'uiDashboards',
      // v2.401.0(OPV23-4): ui/pages/overview-blocks.js 同款补登记（OPV22-4 拆出的第四段）。
      'panelOverviewBlocks',
      // v2.517.0（V26 收口）：世界脉搏聚合块同款（无头环境不装载 → optionalMissing）。
      'panelWorldPulse',
      // v2.518.0 收口（UI-P1）：玩家面两个页模块同款（无头环境不装载 → optionalMissing）。
      'panelNowPage',
      'panelPeoplePage',
      // v2.542.0：手札 / 工作台外壳（无头环境不装载 → optionalMissing）。
      'journal',
      'console',
    ];

  const UI_BINDINGS = [
    { page: 'tools', ids: ['wa-events-auto', 'wa-par-every', 'wa-par-max', 'wa-par-enabled', 'wa-par-export', 'wa-par-view', 'wa-par-seed', 'wa-par-import', 'wa-par-input', 'wa-an-run', 'wa-an-out', 'wa-snap-dl', 'wa-snap-up', 'wa-snap-file', 'wa-snap-faces', 'wa-snap-subset', 'wa-snap-out', 'wa-imp-pick', 'wa-imp-file', 'wa-imp-text', 'wa-imp-run', 'wa-imp-out', 'wa-diag-run', 'wa-diag-dl', 'wa-diag-out',
      // v2.2.0: 诊断出口收口——三个新增控件同样纳入「渲染 ↔ 绑定」一致性校验
      'wa-stat-reset', 'wa-compat-view', 'wa-wf-reset',
      // v2.274.0：读数仪清零出口。八台读数引擎的 reset() 此前零消费（导出面有口、无人调），
      //   本控件是它们的真消费方 —— 同 v2.2.0 三条的理由：新出口必须「渲染 + 绑定 + 守卫登记」
      //   三件齐做，否则「渲染了但绑定 id 写错」永远不会被守卫表发现。
      'wa-gauge-reset',
      // v2.2.0 块5：存档恢复点 / 设置键卫生
      'wa-recovery-view', 'wa-orphan-view', 'wa-undo-btn', 'wa-mirror-view',
      // v2.83.0（B6）：配置包出口。与 v2.2.0/v2.34.0 新增控件同规格——
      //   必须同时「渲染 + 绑定 + 守卫登记」，否则「控件渲染了但绑定 id 写错」
      //   在新出口上无人发现（本块是「渲染↔绑定」两面里唯一会互相校验的地方）。
      //   注意 wa-cfg-copy 属 **dynamic**：它只在点开配置包面板后才渲染 ——
      //   放进 ids 会被「逐页无缺失」判成静态渲染缺失（本版实测踩到并纠正）。
      'wa-cfg-view',
      // v2.2.0 块8：工具页既有控件（此前全在守卫之外 → 绑定断裂无人发现）
      'wa-audit-copy', 'wa-key-check', 'wa-quar-view', 'wa-recovery-dl', 'wa-maintain', 'wa-conf-view', 'wa-settle-view',
      // v2.101.0（O11）：跨插件互操作两枚出口。同 v2.2.0 块8 的理由——
      //   「渲染了但绑定写错 id」这类断裂只有在守卫登记过的控件上才会被发现。
      'wa-net-view', 'wa-net-freeze',
      // v2.102.0（A2/O12）：性能面两枚出口。同 v2.101.0 的理由——「渲染了但绑定写错 id」
      //   这类断裂只有在守卫登记过的控件上才会被发现。
      'wa-perf-view', 'wa-perf-bench', 'wa-perf-partial',
      // v2.124.0（R1 · 补 v2.123.0 欠账）：**档位面**按钮。v2.123.0 加了 `wa-perf-band`
      //   却漏了这一步登记 —— 渲染了不登记 ⇒ 守卫表永远查不到它，而「渲染了但绑定的 id
      //   写错」这类断裂只有在登记过的控件上才会被发现（本表的全部意义）。漏登记的代价是
      //   实测过的：守卫门禁如实报「未覆盖：["wa-perf-band"]」，而 v2.121–2.123 三版都
      //   没跑全量回归，于是这条红一直没被人看见。
      'wa-perf-band',
      // v2.34.0: 记忆采样预览三件
      'wa-samp-preview', 'wa-samp-copy', 'wa-samp-out',
      // v2.121.0（P1）：审计卷两枚按钮 + 一枚粘贴框 + 一个输出区（渲染在工具页审计取证段）。
      //   同 v2.98.0 P2 的理由——exportVol / verifyVolWith 是本版新增的两个导出，它们
      //   **必须有真消费方**（无消费方不挂），UI_BINDINGS 就是那两个消费方的接线真源。
      //   不登记时，下面这条门禁会如实报「未覆盖」——本版实测正是被它抓出来的。
      'wa-audit-vol', 'wa-audit-vol-check', 'wa-audit-vol-text', 'wa-audit-vol-out',
      // v2.159.0（TP2）：异步写回票据台账出口。store.claimStat 是本版新增导出，
      //   **必须有真消费方**（无消费方不挂）——UI_BINDINGS 就是这个消费方的接线真源。
      'wa-claim-view',
      // v2.184.0（E3）：存档槽 20 个静态控件。渲染在工具页「状态快照」之后 ——
      //   与该区块同页同族（快照 = 可移植归档；存档槽 = 世界状态槽），接线面必须一并覆盖。
      'wa-ck-enabled', 'wa-ck-name', 'wa-ck-save', 'wa-ck-list', 'wa-ck-id', 'wa-ck-read', 'wa-ck-restore', 'wa-ck-remove', 'wa-ck-cmp', 'wa-ck-compare', 'wa-ck-branch', 'wa-ck-fork', 'wa-ck-max', 'wa-ck-every', 'wa-ck-auton', 'wa-ck-cfg', 'wa-ck-export', 'wa-ck-import', 'wa-ck-stat', 'wa-ck-text',
      // v2.197.0（Y3）：「另开计划」两枚控件 —— 新世界顶层键输入 + 只读计划按钮。
      //   同 v2.184.0 的理由：新控件必须「渲染 + 绑定 + 守卫登记」三件齐做，否则
      //   「按钮渲染了但 id 写错/没登记」无人发现（本版实测正是被这条门禁抓出未登记）。
      'wa-ck-newkey', 'wa-ck-plan',
      // v2.257.0（V6 OPV6-1/OPV6-2）：能力档位与启用面的 10 枚控件。
      //   三件齐做（渲染 + 绑定 + 守卫登记）——理由同 v2.184.0 / v2.197.0：
      //   渲染了不登记 ⇒ 守卫永远查不到它，而「按钮渲染了但绑定 id 写错」这类断裂
      //   只有在登记过的控件上才会被发现（本表是接线面的唯一真源）。
      //   这一批尤其要登记：它们是 OPV6-1/OPV6-2 的**唯一**玩家入口 ——
      //   引擎算得再对，控件没接线就等于「功能做了、玩家碰不到」（本版立项读数）。
      'wa-ct-lite', 'wa-ct-standard', 'wa-ct-full', 'wa-ct-rollback', 'wa-ct-view', 'wa-ct-list',
      'wa-ca-audit', 'wa-ca-dormant', 'wa-ca-preview', 'wa-ct-stat',
      // 摘要显示开关：勾了写引擎（`capabilityAudit.setSettings({showSummary})`），
      //   它是**设置型**控件而非按钮，但同属接线面，一并登记。
      'wa-ca-summary'],
      cond: ['wa-orph-all', 'wa-settle-unforce'],
      dynamic: ['wa-par-out', 'wa-diag-out', 'wa-an-out', 'wa-snap-out', 'wa-imp-out', 'wa-key-sweep-go', 'wa-key-sweep-ghost', 'wa-q-restore', 'wa-q-drop', 'wa-conf-dl', 'wa-conf-drop', 'wa-settle-force', 'wa-rv-confirm', 'wa-rv-cancel', 'wa-mirror-rescue',
      // v2.83.0（B6）：配置包面板里的动态控件（点开才渲染）。
      //   wa-cfg-copy / wa-cfg-import 在第一屏；wa-cfg-text / wa-cfg-check / wa-cfg-go /
      //   wa-cfg-abort / wa-cfg-cancel 在「粘贴 → 校验 → 二次确认」两步流程里逐步出现。
      'wa-cfg-copy', 'wa-cfg-import', 'wa-cfg-text', 'wa-cfg-check', 'wa-cfg-cancel', 'wa-cfg-go', 'wa-cfg-abort',
      // v2.184.0（E3）：存档槽的读数出口（动态写入，同上面 tools 页两条的口径）。
      'wa-ck-out',
      // v2.301.0（EXV11-1/3）：开局页与驱动页的动态输出/按钮（setOut 动态写入 + 刷新按钮）。
      'wa-boot-out', 'wa-drive-view', 'wa-drive-out'] },
    { page: 'overview', ids: ['wa-setting-search', 'wa-page-q', 'wa-page-q-hint'],
      // v2.380.0（幽灵引用治理批次⑦）：V19/V20/V21 三个跨版本态势大盘**真挂进概览页**
      //   之后，其内层折叠 id 由渲染函数的 `wrap.innerHTML` 生成（只有函数被真调用才成树）。
      //   静态正则抓得到它们，守卫表却一条没登记 ⇒「渲染了却没登记」那一面整片放行。
      //   档位取 dynamic 而非 ids：判据比的是**调用点**（`__dashboardBlock('renderXxx', …)`
      //   的调用串里带着渲染函数名），不是静态字面量 id —— 这正是不把「静态看不到」
      //   当成「没渲染」的那条口径（与 v2.294.0 的 wa-prof-* 同规）。
      dynamic: ['wa-setting-search-count',
        'wa-epoch-holomap', 'wa-cataclysm-holomap', 'wa-finance-holomap', 'wa-theology-hub', 'wa-regiment-hub', 'wa-prison-hub', 'wa-bloodline-hub', 'wa-engineering-hub', 'wa-dungeon-hub', 'wa-eco-hub', 'wa-court-hub', 'wa-trauma-fold', 'wa-blackmarket-fold', 'wa-shadow-network-fold', 'wa-naval-fold'] },
    { page: 'world', ids: [], cond: ['wa-current-auto-on','wa-current-auto-turns'] },
    { page: 'inject', ids: [], cond: ['wa-collector-enabled','wa-collector-tokens','wa-changes-enabled','wa-budget-source-board'] },
    { page: 'tools', ids: [], cond: ['wa-par-round','wa-par-continue'] },
    { page: 'events', ids: [], cond: ['wa-sc-capacity','wa-cm-capacity','wa-inv-capacity','wa-af-capacity','wa-ops-capacity'] },
    { page: 'desk', ids: ['wa-wdesk-ns', 'wa-wdesk-load', 'wa-wdesk-stat',
      // v2.294.0（V8 EXV8-2）：写口台页。同 v2.197.0 的理由——新控件必须「渲染 + 绑定 + 守卫登记」
      //   三件齐做，否则「按钮渲染了但绑定的 id 写错」永远不会被守卫表发现。
      //   wa-wdesk-ports / wa-wdesk-out 是输出区（同 v2.151.0 wa-ot-out 的口径：面板回显，也登记）。
      'wa-wdesk-ports', 'wa-wdesk-out'] },
    // v2.382.0（幽灵引用治理批次⑦）：**开局页 / 驱动页**——v2.301.0（V11 EXV11-1/-3）加了两页
    //   却漏了这一步登记，于是这两个页面的控件全部落在守卫表之外，直到本版被 C11 判据抓到。
    //   为什么漏了整整一版都没人发现：C11 那条判据当时把 `ui/panel.js` 的 `const CATS`（分类清单）
    //   也当成页清单读，于是它**恒报** `core/workshop/meta/all` 四个「未覆盖」——那四个 id 根本
    //   不是页。一批假红挡在前面，真未覆盖的 `boot`/`drive` 就没人往下看了。本版先修判据
    //   （只从 `const PAGES` 段取页 id）才让这两页现形：**假红会把真红藏起来**，这是代价。
    //   登记口径与 desk 页同源：三枚都是本页**静态渲染**的控件（`renderBootDesk` 尾部的
    //   `wa-boot-out`，`renderDriveDesk` 的 `wa-drive-view` / `wa-drive-out`），不走动态拼接，
    //   故进 `ids` 而非 `dynamic`。
    //   关于降级分支（必须写明，否则后续维护者会误判成「漏登记」）：两个渲染函数都有
    //   「模块缺席 ⇒ 提前返回占位」的短路（`playableBlueprint` / `l3Registry`+`roundDrivers`），
    //   短路时不渲染这三枚。这与 desk 页 `writeDesk` 缺席时的形态**逐字同构**，而 desk 的
    //   `wa-wdesk-*` 同样在 `ids` 层——故本组按同口径处理，不为降级分支单独开 cond 层。
    //   依据是 `ids` 的语义边界：它钉的是「在本页正常态下它就该在」，不是「任何缺席分支下
    //   它都必须在」。真要把「模块缺席」也当判据面，那是 `secModules` / 能力清单的活，
    //   不是守卫表的活（混进来会让守卫表对每台引擎的开关状态敏感，反而变成噪声源）。
    { page: 'boot', ids: ['wa-boot-out'] },
    { page: 'drive', ids: ['wa-drive-view', 'wa-drive-out'] },
    { page: 'world', ids: ['wa-set-clock', 'wa-cal-auto', 'wa-bg', 'wa-save-bg', 'wa-next-day', 'wa-wb-trigger', 'wa-wb-refresh', 'wa-wb-preview', 'wa-wb-scan', 'wa-wb-list', 'wa-wb-out'], dynamic: ['wa-conc-v'] },
    { page: 'people', ids: ['wa-ll-enabled', 'wa-ll-id', 'wa-ll-due', 'wa-ll-promise', 'wa-ll-sweep', 'wa-ll-out', 'wa-org-enabled', 'wa-org-kind', 'wa-org-name', 'wa-org-item', 'wa-org-qty', 'wa-org-to-kind', 'wa-org-to-name', 'wa-org-grant', 'wa-org-transfer', 'wa-org-check', 'wa-org-ledger', 'wa-org-out',
       // v2.94.0（O6）：流水导出 / 带外对账 / 经济风三控件。同 v2.51.0 的理由——新控件必须
       //   同时「渲染 + 绑定 + 守卫登记」，否则「按钮渲染了但绑定的 id 写错」无人发现。
       'wa-org-export', 'wa-org-reconcile', 'wa-org-climate',
       // v2.95.0（X2）：经济引擎——职册 / 功簿 / 薪俸 / 欠薪 / 罚没九控件。
       //   同 v2.51.0 的理由：新控件必须同时「渲染 + 绑定 + 守卫登记」，
       //   否则「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
// v2.117.0（计划二 B5）：组织行动控件——项目名 / 需求 / 期限 / 欠账原因四输入 + 七个按钮。
        //   同 v2.51.0 的理由——新控件必须同时「渲染 + 绑定 + 守卫登记」，
        //   否则「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
        //   `wa-org-why` 是**欠账原因**：引擎侧 missing-why 守得住「没原因不许登记」，
        //   但壳若不提供这个输入（或回落成「未注明」），那道闸在真实使用里永不触发。
        'wa-org-project', 'wa-org-needs', 'wa-org-due', 'wa-org-why', 'wa-org-proj-open', 'wa-org-proj-deliver',
        'wa-org-proj-view', 'wa-org-proj-close', 'wa-org-owe', 'wa-org-debt-settle', 'wa-org-debts',
       'wa-org-person', 'wa-org-role', 'wa-org-assign', 'wa-org-credit', 'wa-org-promote', 'wa-org-roster', 'wa-org-pay', 'wa-org-settle', 'wa-org-penalize', 'wa-intel-enabled', 'wa-intel-cause', 'wa-intel-effect', 'wa-intel-person', 'wa-intel-claim', 'wa-intel-source', 'wa-intel-link', 'wa-intel-add', 'wa-intel-out', 'wa-intel-project', 'wa-intel-correct',
      // v2.293.0（收口）：情报网读数按钮。它在 ui/panel.js 与上面几枚同一个 wa-row 里
      //   无条件渲染、绑定在 on('#wa-intel-network')，此前从未登记 —— 于是
      //   「渲染了但绑定写错 id」在这一枚上永不可见（守卫表是本仓唯一互校渲染↔绑定的面）。
      // v2.293.0（EXV7-3 收口跟位）：情报网读数**块容器** id（ui/panel.js 情报网 5 个
      //   渲染分支共用的 div id）与按钮同组登记，缺它则 H2「渲染↔守卫互校」如实报未覆盖。
      //   v2.293.0 收口修正：它登 **cond** 层不登 ids——ui/panel.js 实测该块在
      //   `cfg.enabled !== true` 时整块不渲染（briefBlock 口径：关着不占屏），缺失是
      //   设置态不是断裂（v2.282.0 wa-wc-line 同款分层口径；渲染了但 id 写错照样被咬到）。
      'wa-intel-network', 'wa-life-enabled', 'wa-life-person', 'wa-life-text', 'wa-life-goal', 'wa-life-promise', 'wa-life-schedule', 'wa-life-tick', 'wa-life-out', 'wa-npc-name', 'wa-npc-add', 'wa-observe-out', 'wa-prof-mini', 'wa-prof-out',
       // v2.62.0: 因果结算控件（渲染在人物页）+ 稳定人物 ID 控件。
       //   同 v2.51.0 的理由：新控件必须同时「渲染 + 绑定 + 守卫登记」，
       //   否则「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
       'wa-causal-enabled', 'wa-causal-cause', 'wa-causal-condition', 'wa-causal-action', 'wa-causal-immediate', 'wa-causal-delayed', 'wa-causal-delayed-min', 'wa-causal-add', 'wa-causal-tick', 'wa-causal-due', 'wa-causal-classify', 'wa-causal-id', 'wa-causal-by', 'wa-causal-defer', 'wa-causal-cancel', 'wa-causal-settle',
      // v2.146.0（F2/W3）：后果涟漪网 + 多结局预演两枚出口（渲染 + 绑定 + 守卫登记三件齐做）。
      'wa-causal-ripple', 'wa-causal-endings',
      // v2.147.0（W1）：因果追溯图谱出口（按钮 + 事实键输入框）。
      'wa-causal-trace', 'wa-causal-trace-key',
      'wa-causal-out', 'wa-id-name', 'wa-id-lookup', 'wa-id-bindall', 'wa-id-clear', 'wa-id-out',
      // v2.63.0: 世界织体 / 社交漩涡 / 悬案控件（同样渲染在人物页）。
      //   三条理由与 v2.51.0 / v2.62.0 一致：新控件必须同时「渲染 + 绑定 + 守卫登记」，
      //   否则「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
      //   三者一律**无条件渲染**（模块缺席时整段降级成提示、控件不在场 ⇒ 本组会报 missing）；
      //   与 style/causal 同一取舍：world/shadow/threads 是产品文件，缺席本身就是断裂。
      //   注：world 组的 `wa-world-ev-title` 既是日程标题输入、又是「查到会人」的取案入口
      //   （空值时回落到最近一次日程），故一个控件同时挂在两个出口上——绑定不重复登记。
      'wa-world-enabled', 'wa-world-place', 'wa-world-addplace', 'wa-world-reach',
      'wa-world-rd-a', 'wa-world-rd-b', 'wa-world-rd-min', 'wa-world-addroad',
      'wa-world-ev-title', 'wa-world-ev-place', 'wa-world-addevent', 'wa-world-tick', 'wa-world-who',
      'wa-world-mv-who', 'wa-world-mv-from', 'wa-world-mv-to', 'wa-world-move', 'wa-world-canbe',
      'wa-world-tr-ch', 'wa-world-transit',
      'wa-world-out',
      // v2.117.0（计划二 B1 主体 + B2 前半）：人物行动与场所用途窗口共 29 个控件。
      //   同 v2.51.0 / v2.62.0 / v2.63.0 的理由：新控件必须同时「渲染 + 绑定 + 守卫登记」，
      //   否则「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
      //   两者一律**无条件渲染**（模块缺席时整段降级，控件仍在场 ⇒ 本组会如实报 missing）；
      //   与 world/threads 同一取舍：act.js 是产品文件，缺席本身就是断裂。
      'wa-world-use-place', 'wa-world-use-kind', 'wa-world-use-open', 'wa-world-use-close',
      'wa-world-use-note', 'wa-world-use-add', 'wa-world-use-list', 'wa-world-use-win', 'wa-world-use-out',
      'wa-act-enabled', 'wa-act-person', 'wa-act-kind', 'wa-act-text', 'wa-act-with', 'wa-act-item',
      'wa-act-amount', 'wa-act-place', 'wa-act-from', 'wa-act-to', 'wa-act-use', 'wa-act-dur',
      'wa-act-add', 'wa-act-admit', 'wa-act-id', 'wa-act-advance', 'wa-act-abort', 'wa-act-replan',
      'wa-act-view', 'wa-act-out',
       // v2.141.0（F2）：合法不行动判定口（act.verdict）的真消费方。同 v2.51.0 的理由——
       //   新增导出必须有真消费方；不登记时下面那条门禁会如实报「未覆盖」。
       'wa-act-verdict',
      // v2.119.0（拓展计划 ①②）：人物多步计划 / 关系修复共 33 个控件（同样渲染在人物页）。
      //   理由与前十几批完全一致：新控件必须「渲染 + 绑定 + 守卫登记」三件齐做，
      //   否则「按钮渲染了但绑定的 id 写错」这一类断裂在新增出口上无人发现。
      //   一律**无条件渲染**（模块缺席时整段降级成 module-missing、控件仍在场 ⇒ 本组会如实报 missing）；
      //   与 act/world/threads 同一取舍：plan.js / mend.js 是产品文件，缺席本身就是断裂。
      //   `wa-plan-steps` 是 textarea、`wa-mend-id2` 是回填框：它们上方那一行只是**暂存**
      //   而不是状态，故不进 dynamic（第一屏就渲染，缺失即真断裂）。
      'wa-plan-enabled', 'wa-plan-person', 'wa-plan-goal', 'wa-plan-steps', 'wa-plan-expand',
      'wa-plan-current', 'wa-plan-advance', 'wa-plan-done', 'wa-plan-blocked', 'wa-plan-refused',
      // v2.230.0（修存量红）：`wa-plan-review`（复核拟稿）在 ui/panel.js:978 渲染、在
      //   7312 行有真实 handler，却从未进守卫表 —— 绑定写错时无人发现（本版实测抓出）。
      'wa-plan-reason', 'wa-plan-candidates', 'wa-plan-view', 'wa-plan-review', 'wa-plan-abandon', 'wa-plan-out',
      // N2（v2.220.0）：四类限制 + 自动采用四控件（同批「渲染 + 绑定 + 守卫登记」三件齐做）。
      'wa-plan-limits', 'wa-plan-autoadopt', 'wa-plan-adoptbudget', 'wa-plan-adopt',
      'wa-mend-enabled', 'wa-mend-person', 'wa-mend-with', 'wa-mend-hurt', 'wa-mend-mark',
      'wa-mend-id',
      'wa-mend-id2', 'wa-mend-acceptby', 'wa-mend-guarantor', 'wa-mend-evidence',
      'wa-mend-apology', 'wa-mend-restitution', 'wa-mend-keeping', 'wa-mend-guarantee',
      'wa-mend-view', 'wa-mend-close', 'wa-mend-fail', 'wa-mend-out',
      // v2.119.0（拓展计划 ⑤）：调查卷宗控件（自面板实际 id 提取，共 19 个）。
      //   一律无条件渲染（模块缺席时整段降级成 module-missing，控件仍在场 ⇒ 本组会如实报 missing）。
      // v2.119.0（拓展计划 ⑥）：远方传播控件（自面板实际 id 提取，共 19 个）。
      // v2.119.0（拓展计划 ⑦）：玩法进度控件（自面板实际 id 提取，共 17 个）。
      // v2.119.0（拓展计划 ⑧）：多人场控件（自面板实际 id 提取，共 19 个）。
      'wa-se-enabled', 'wa-se-name', 'wa-se-role', 'wa-se-token', 'wa-se-takeover', 'wa-se-host', 'wa-se-perms', 'wa-se-join', 'wa-se-auth', 'wa-se-body', 'wa-se-seq', 'wa-se-post', 'wa-se-last', 'wa-se-since', 'wa-se-resync', 'wa-se-leave', 'wa-se-view', 'wa-se-out-btn', 'wa-se-out',
      'wa-st-enabled', 'wa-st-pack', 'wa-st-replace', 'wa-st-adopt', 'wa-st-metric', 'wa-st-delta', 'wa-st-mark', 'wa-st-to', 'wa-st-need', 'wa-st-changes', 'wa-st-plan', 'wa-st-tid', 'wa-st-applied', 'wa-st-transit', 'wa-st-view', 'wa-st-out-btn', 'wa-st-out',
      'wa-rg-enabled', 'wa-rg-place', 'wa-rg-days', 'wa-rg-lane', 'wa-rg-register', 'wa-rg-kind', 'wa-rg-text', 'wa-rg-occur', 'wa-rg-view', 'wa-rg-eid', 'wa-rg-deliver', 'wa-rg-why', 'wa-rg-block', 'wa-rg-open', 'wa-rg-who', 'wa-rg-heard', 'wa-rg-fine', 'wa-rg-out-btn', 'wa-rg-out',
      'wa-probe-enabled', 'wa-probe-q', 'wa-probe-hyps', 'wa-probe-open', 'wa-probe-case', 'wa-probe-claim', 'wa-probe-level', 'wa-probe-about', 'wa-probe-by', 'wa-probe-support', 'wa-probe-refute', 'wa-probe-view', 'wa-probe-who', 'wa-probe-confront', 'wa-probe-decide', 'wa-probe-why', 'wa-probe-wrong', 'wa-probe-out-btn', 'wa-probe-out',
      // v2.119.0（拓展计划 ④）：组织制度控件（自面板实际 id 提取，共 34 个）。
      //   一律无条件渲染（模块缺席时整段降级成 module-missing，控件仍在场 ⇒ 本组会如实报 missing）。
      'wa-inst-enabled', 'wa-inst-org', 'wa-inst-kind', 'wa-inst-name', 'wa-inst-charter', 'wa-inst-post', 'wa-inst-perms', 'wa-inst-setpost', 'wa-inst-person', 'wa-inst-replace', 'wa-inst-assign', 'wa-inst-vacate', 'wa-inst-why', 'wa-inst-from', 'wa-inst-to', 'wa-inst-projects', 'wa-inst-oaths', 'wa-inst-succeed', 'wa-inst-dec', 'wa-inst-needs', 'wa-inst-propose', 'wa-inst-dec2', 'wa-inst-by', 'wa-inst-approve', 'wa-inst-reject', 'wa-inst-breach', 'wa-inst-penalty', 'wa-inst-mark-breach', 'wa-inst-br2', 'wa-inst-evidence', 'wa-inst-settle', 'wa-inst-view', 'wa-inst-out-btn', 'wa-inst-out',
      // v2.119.0（拓展计划 ③）：供需循环控件（自面板实际 id 提取，共 29 个）。
      //   一律**无条件渲染**（模块缺席时整段降级成 module-missing、控件仍在场 ⇒ 本组会如实报 missing）；
      //   与 plan/mend 同一取舍：economy.js 是产品文件，缺席本身就是断裂。
      'wa-eco-enabled', 'wa-eco-place', 'wa-eco-res', 'wa-eco-qty', 'wa-eco-base', 'wa-eco-stock', 'wa-eco-price-in', 'wa-eco-price', 'wa-eco-buy', 'wa-eco-buyer', 'wa-eco-maker', 'wa-eco-recipe', 'wa-eco-times', 'wa-eco-craft', 'wa-eco-stamp', 'wa-eco-tick', 'wa-eco-view', 'wa-eco-shelf', 'wa-eco-route', 'wa-eco-lane', 'wa-eco-from', 'wa-eco-to', 'wa-eco-cost', 'wa-eco-route-add', 'wa-eco-route-block', 'wa-eco-route-open', 'wa-eco-ship', 'wa-eco-routes', 'wa-eco-out',
      // v2.253.0（拓展 ST-1）：漏摊寄售控件（自面板实际 id 提取，共 21 个）。
      //   与上面 economy 同规格、同位置（面板里紧跟在「供需循环与商路」之后渲染）：
      //     ① 一律**无条件渲染** —— 模块缺席时整段降级成 module-missing、控件仍在场 ⇒ 本组会如实报 missing；
      //        engines/stall.js 是产品文件，缺席本身就是断裂（与 economy 同一取舍）。
      //     ② 每个 id 都有**真绑定**（ui/panel.js 的 on('#wa-stall-…')）：守卫表是「渲染 ↔ 绑定」两面
      //        里唯一会互相校验的地方，漏登记等于把「按钮渲染了但绑定的 id 写错」永久放行。
      //   本组是 v2.2.0 块8 那条「未覆盖」断言在实测中抓出来的欠账：
      //   面板已渲染 21 个摊位控件而守卫表一项都没登记（本版补登后该断言回到零未覆盖）。
      'wa-stall-enabled', 'wa-stall-owner', 'wa-stall-place', 'wa-stall-sign', 'wa-stall-lay',
      'wa-stall-res', 'wa-stall-qty', 'wa-stall-price', 'wa-stall-list',
      'wa-stall-sign-btn', 'wa-stall-delist', 'wa-stall-view',
      'wa-stall-buyer', 'wa-stall-bqty', 'wa-stall-buy', 'wa-stall-board',
      'wa-stall-away', 'wa-stall-back', 'wa-stall-pack', 'wa-stall-out-btn', 'wa-stall-out',
      'wa-shadow-enabled', 'wa-shadow-a', 'wa-shadow-b', 'wa-shadow-secret', 'wa-shadow-add',
      'wa-shadow-deepen', 'wa-shadow-brighten', 'wa-shadow-lookup', 'wa-shadow-what',
      'wa-shadow-exp-kept', 'wa-shadow-exp-broken', 'wa-shadow-visible', 'wa-shadow-out',
      'wa-threads-enabled', 'wa-threads-q', 'wa-threads-open', 'wa-threads-id', 'wa-threads-claim',
      'wa-threads-src', 'wa-threads-lead', 'wa-threads-refute', 'wa-threads-converge',
      'wa-threads-stall', 'wa-threads-answer', 'wa-threads-resolve', 'wa-threads-abandon',
       'wa-threads-why', 'wa-threads-out',
       // v2.96.0（X3）：传播与辟谣十四控件（同样渲染在人物页）。
       //   三条理由与 v2.51.0 / v2.62.0 / v2.63.0 / v2.95.0 一致：新控件必须同时
       //   「渲染 + 绑定 + 守卫登记」，否则「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
       //   一律**无条件渲染**（模块缺席时整段降级成提示、控件不在场 ⇒ 本组会报 missing）；
       //   与 style/world/threads 同一取舍：rumor.js 是产品文件，缺席本身就是断裂。
       'wa-rm-enabled', 'wa-rm-fact', 'wa-rm-start', 'wa-rm-investigate', 'wa-rm-fullview',
       'wa-rm-id', 'wa-rm-from', 'wa-rm-to', 'wa-rm-motive', 'wa-rm-value', 'wa-rm-layer',
       'wa-rm-relay', 'wa-rm-refute', 'wa-rm-conceal', 'wa-rm-person', 'wa-rm-why', 'wa-rm-visible',
       'wa-rm-out',
       // v2.97.0（X5）：跨插件因果桥（入站边）八控件（同样渲染在人物页）。
       //   三条理由与 v2.51.0 / v2.62.0 / v2.63.0 / v2.95.0 / v2.96.0 一致：新控件必须同时
       //   「渲染 + 绑定 + 守卫登记」，否则「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
       //   一律**无条件渲染**（模块缺席时整段降级成提示、控件不在场 ⇒ 本组会报 missing）；
       //   与 style/causal/world/rumor 同一取舍：phone-bridge.js 是产品文件，缺席本身就是断裂。
       'wa-pb-enabled', 'wa-pb-opid', 'wa-pb-act', 'wa-pb-to',
       'wa-pb-note', 'wa-pb-view', 'wa-pb-chain', 'wa-pb-link', 'wa-pb-trace', 'wa-pb-out',
        // v2.112.0：因果链追踪 / 协作会话（人物页）。无消费方不挂；守卫表是接线面唯一真源。
        // v2.114.0：插件生命周期钩子面（计划二 #56）。`wa-pl-unreg` 是 plugin.unregister 的
        //   **真产品消费方**（注册的逆操作），守卫表漏登记它 = 这个按钮的 id 写错也无人发现。
        'wa-ch-enabled', 'wa-ch-anchor', 'wa-ch-base', 'wa-ch-note', 'wa-ch-record', 'wa-ch-stale', 'wa-ch-undo', 'wa-ch-apply', 'wa-ch-out',
        'wa-co-enabled', 'wa-co-sid', 'wa-co-who', 'wa-co-open', 'wa-co-claim', 'wa-co-pending', 'wa-co-conflicts', 'wa-co-out',
        // v2.139.0（E10）：协作任务与违约十二控件（同样渲染在人物页）。
        //   同 v2.51.0 / v2.62.0 / v2.63.0 / v2.95.0 / v2.96.0 / v2.97.0 / v2.112.0 的理由：
        //   新控件必须同时「渲染 + 绑定 + 守卫登记」，否则「按钮渲染了但绑定的 id 写错」无人发现。
        'wa-task-goal', 'wa-task-deadline', 'wa-task-partners', 'wa-task-create', 'wa-task-id',
        'wa-task-person', 'wa-task-amount', 'wa-task-contribute', 'wa-task-settle',
        'wa-task-penalize', 'wa-task-view', 'wa-task-out',
        'wa-pl-name', 'wa-pl-reg', 'wa-pl-unreg', 'wa-pl-list', 'wa-pl-fire', 'wa-pl-out',
       // v2.97.0（O9）：别名面三控件（渲染在人物页「人物身份」区）。
       //   同 v2.51.0 / v2.62.0 / v2.63.0 / v2.95.0 / v2.96.0 的理由——aliasOf / bindAlias /
       //   aliasStat 是本版新增的三个导出，它们**必须有真消费方**（无消费方不挂），
       //   而这里就是那三个消费方；不同时登记进守卫表，「渲染了但绑定 id 写错」无人发现。
       'wa-id-aliasname', 'wa-id-bindalias', 'wa-id-aliasof', 'wa-id-aliasstat',
       // v2.99.0：原著幕目七控件（同样渲染在人物页）。
       //   三条理由与 v2.51.0 / v2.62.0 / v2.63.0 / v2.95.0 / v2.96.0 / v2.97.0 一致：新控件
       //   必须同时「渲染 + 绑定 + 守卫登记」，否则「按钮渲染了但绑定的 id 写错」无人发现。
       //   一律**无条件渲染**（模块缺席时整段降级成提示、控件不在场 ⇒ 本组会报 missing）；
       //   与 style/world/rumor 同一取舍：canon.js 是产品文件，缺席本身就是断裂。
       //   `wa-cn-text` 是 textarea：它上方那一行只是**暂存**而不是状态，故不进 dynamic
       //   （第一屏就渲染，缺失即真断裂）。
       'wa-cn-enabled', 'wa-cn-peract', 'wa-cn-build', 'wa-cn-adopt', 'wa-cn-text',
       'wa-cn-src', 'wa-cn-coord', 'wa-cn-locate', 'wa-cn-view', 'wa-cn-clear', 'wa-cn-out',
       // v2.99.0 追加：两枚「按号」入口（coordOf / actText 的真消费方）。
       //   它们与上面那组同规格：渲染 + 绑定 + 守卫登记三件齐做。
       'wa-cn-actno', 'wa-cn-ptno', 'wa-cn-go', 'wa-cn-act',
       // v2.100.0（第五十七面）：原著对位四控件（同渲染在人物页）。
       //   三条理由与前六批完全一致：新控件必须「渲染 + 绑定 + 守卫登记」三件齐做，
       //   否则「按钮渲染了但绑定的 id 写错」这一类断裂在新增出口上无人发现。
       //   一律**无条件渲染**（模块缺席时整段降级成提示、控件不在场 ⇒ 本组报 missing）；
       //   canon.js 是产品文件，缺席本身就是断裂。
       //   `wa-cn-check` 是 input（手贴一段正文用）——它不是**状态**，故不进 dynamic。
       'wa-cn-check', 'wa-cn-signal', 'wa-cn-position', 'wa-cn-gap',
       // v2.139.0（E11）：偏离度两枚入口（偏离度 / 偏离曲线）。同 v2.51.0 起的理由：
       //   新控件「渲染 + 绑定 + 守卫登记」三件齐做，否则 id 写错无人发现。
       'wa-cn-deviation', 'wa-cn-trend'],
      dynamic: ['wa-prof-save', 'wa-prof-clear', 'wa-prof-msg', 'wa-prof-personality', 'wa-prof-worldview', 'wa-prof-family', 'wa-prof-memory', 'wa-prof-relationships'],
      cond: ['wa-intel-network-block'] },
    { page: 'events', ids: ['wa-de-prompt', 'wa-de-turns', 'wa-de-create', 'wa-ef-name', 'wa-ef-scope', 'wa-ef-goal', 'wa-ef-core', 'wa-ef-pillars', 'wa-ef-add', 'wa-ee-name', 'wa-ee-type', 'wa-ee-add', 'wa-inspect-run', 'wa-inspect-out', 'wa-ent-type', 'wa-ent-name', 'wa-ent-desc', 'wa-ent-add', 'wa-ent-out', 'wa-ledger-text',
      // v2.139.0（E9）：势力关系网读数入口（渲染在事件页「势力」区下方）。
      'wa-fg-tension', 'wa-fg-clusters', 'wa-fg-edges', 'wa-fg-dyn', 'wa-fg-pa', 'wa-fg-pb', 'wa-fg-pair', 'wa-fg-hot', 'wa-fg-out'],
      // v2.139.0（E9）：势力关系网读数入口共四枚，各答一个问题、**互不替代**：
      //   张力（网有多紧，含分母可复算）/ 同盟簇（图分成几块，单点单列）/
      //   关系网（逐条边，带 basis 可复盘）/ 查两家（就这两家什么关系，edgeOf 的真消费方）。
      //   判定面留在引擎侧（factionGraph），本组只保证「渲染 ↔ 守卫登记」成对 ——
      //   四枚中任何一枚 id 写错都要有人发现。
      // v2.11.0: `wa-bs-abort` 是**条件渲染**控件（只在推演运行中出现），故归入 cond 层——
      //   与 wa-de-abort（有活跃突发事件才渲染）同一语义。纳入守卫表后，「按钮渲染了但
      //   绑定代码引用了别的 id」这类断裂会被发现（本版新增的绑定正需要这道守）。
      cond: ['wa-de-abort', 'wa-ch-end', 'wa-ch-title', 'wa-ch-start', 'wa-bs-abort'] },
    { page: 'director', ids: ['wa-plan-beats', 'wa-plan-start', 'wa-or-goal', 'wa-or-beats', 'wa-or-gen', 'wa-or-out', 'wa-gen-choices', 'wa-choices-out',
      // v2.87.0 B7：题材规则组合区。题材模块未加载时整段不渲染（空占位），故同样归入 cond层：
      //   存在时必须渲染且必须有绑定（否则「控件在、点了没反应」在新出口上无人发现）。
      'wa-theme-preview', 'wa-theme-apply', 'wa-theme-clear', 'wa-theme-out'],
      cond: ['wa-beat-next', 'wa-plan-clear'] },
    // v2.87.0 B6：因果工作台区（事件页因果区末）。四个只读口 + 干预预览：
    //   stateView / rehearse / conflicts / evidence / previewIntervention 均由本区真消费，
    //   这是它们不是死导出的唯一理由。
    // v2.89.0 O2：本区新增两枚按钮——「录制一轮」（causal.record）与「复核磁带」
    //   （rand.verifyTape）。**必须同时登记进守卫表**：否则它们渲染出来却没有绑定，
    //   而「控件在、点了没反应」在守卫表之外是无人发现的（守卫表是接线面的唯一真源）。
    { page: 'events', ids: ['wa-cw-view', 'wa-cw-rehearse', 'wa-cw-conflicts', 'wa-cw-evidence',
      'wa-cw-record', 'wa-cw-verify',
      // v2.98.0 P2：磁带卷跨会话可查的两枚按钮 + 一枚粘贴框（渲染在事件页因果工作台区）。
      //   同 v2.51.0 / v2.62.0 / v2.63.0 / v2.89.0 / v2.95.0 / v2.96.0 / v2.97.0 的理由——
      //   tapeVol / verifyTapeWith 是本版新增的两个导出，它们**必须有真消费方**（无消费方不挂），
      //   UI_BINDINGS 就是那两个消费方的接线真源。不登记时，下面这条门禁会如实报「未覆盖」：
      //   `panel 渲染的每个控件都在守卫表内（未覆盖：[...]）`——本版实测正是被它抓出来的。
      'wa-cw-vol', 'wa-cw-vol-check', 'wa-cw-vol-text',
      // v2.148.0 RP2：跨会话磁带仓库四按钮 + id 输入 + 输出区，渲染/绑定/守卫登记三件齐。
      'wa-cw-store-save', 'wa-cw-store-list', 'wa-cw-store-load', 'wa-cw-store-drop',
      'wa-cw-store-id', 'wa-cw-store-out',
      'wa-cw-id', 'wa-cw-act', 'wa-cw-intervene', 'wa-cw-out'] },
    // v2.117.0（计划二 B6）：配方面三枚 + 机会面三枚（同渲染在人物页）。
    //   同 v2.83.0 的规格——必须同时「渲染 + 绑定 + 守卫登记」，否则
    //   「控件渲染了但绑定 id 写错」在新出口上无人发现。
    // v2.231.0（优化 OPT-8）：世界词汇面只读按钮（渲染在配方区，沿用 wa-rec-out 输出区）。
    //   同 v2.51.0 的理由——新控件必须同时「渲染 + 绑定 + 守卫登记」，
    //   否则「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
    { page: 'people', ids: ['wa-rec-name', 'wa-rec-view', 'wa-rec-seed', 'wa-lex-view', 'wa-rec-out', 'wa-opp-run', 'wa-opp-view',
      // v2.231.0（拓展 EXP-1）：能力成长面十三控件（渲染 + 绑定 + 守卫登记三件齐做）。
      //   同 v2.51.0 的理由——缺第三件，「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
      'wa-tr-enabled', 'wa-tr-name', 'wa-tr-mode', 'wa-tr-stages', 'wa-tr-declare',
      'wa-tr-prereq', 'wa-tr-prereqstage', 'wa-tr-ables', 'wa-tr-who', 'wa-tr-practice',
      'wa-tr-cancel', 'wa-tr-can', 'wa-tr-need', 'wa-tr-progress', 'wa-tr-diag', 'wa-tr-out',
      // v2.231.0（拓展 EXP-2）：唯一物件面十六控件（渲染 + 绑定 + 守卫登记三件齐做）。
      //   同 v2.51.0 的理由——缺第三件，「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
      'wa-gr-enabled', 'wa-gr-name', 'wa-gr-holder', 'wa-gr-dur', 'wa-gr-make',
      'wa-gr-slot', 'wa-gr-slot-add', 'wa-gr-slots', 'wa-gr-id', 'wa-gr-by', 'wa-gr-wear',
      'wa-gr-use', 'wa-gr-canuse', 'wa-gr-to', 'wa-gr-lend', 'wa-gr-equip', 'wa-gr-unequip',
      'wa-gr-mat', 'wa-gr-amt', 'wa-gr-repair', 'wa-gr-list', 'wa-gr-diag', 'wa-gr-out',
      // v2.231.0（拓展 EXP-3）：持续生产面二十八控件（渲染 + 绑定 + 守卫登记三件齐做）。
      //   同 v2.51.0 的理由——缺第三件，「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
      'wa-pd-enabled', 'wa-pd-fac', 'wa-pd-slots', 'wa-pd-fac-add', 'wa-pd-facs',
      'wa-pd-recipe', 'wa-pd-qty', 'wa-pd-days', 'wa-pd-by', 'wa-pd-open',
      'wa-pd-id', 'wa-pd-place', 'wa-pd-advance', 'wa-pd-pause', 'wa-pd-resume',
      'wa-pd-mat', 'wa-pd-amt', 'wa-pd-resupply', 'wa-pd-who', 'wa-pd-shift', 'wa-pd-staff',
      'wa-pd-route', 'wa-pd-deliver', 'wa-pd-cancel', 'wa-pd-list', 'wa-pd-view', 'wa-pd-diag',
      'wa-pd-out',
      // v2.231.0（拓展 EXP-4）：探索与地理发现面二十七控件（渲染 + 绑定 + 守卫登记三件齐做）。
      //   同 v2.51.0 的理由——缺第三件，「按钮渲染了但绑定的 id 写错」在新增出口上无人发现。
      'wa-sv-enabled', 'wa-sv-spot', 'wa-sv-place', 'wa-sv-days', 'wa-sv-spot-add', 'wa-sv-spots',
      'wa-sv-who', 'wa-sv-from', 'wa-sv-survey',
      'wa-sv-id', 'wa-sv-advance', 'wa-sv-supply', 'wa-sv-resupply',
      'wa-sv-pause', 'wa-sv-resume', 'wa-sv-halt',
      'wa-sv-to', 'wa-sv-report', 'wa-sv-place2', 'wa-sv-confirm',
      'wa-sv-knows', 'wa-sv-routes', 'wa-sv-fog',
      'wa-sv-list', 'wa-sv-view', 'wa-sv-diag', 'wa-sv-out',
      // v2.231.7（回归收口 · 补 v2.231.0 欠账）：独白推演面六枚 + 关系图谱面九枚。
      //   这 15 个控件**早已渲染 + 已绑定**（renderPeople 的「独白推演」「关系图谱」两块，
      //   绑定在 bindBody 的 on('#wa-mo-*') / on('#wa-rel-*') 上），却从未登记守卫表 ——
      //   于是「渲染了但绑定的 id 写错」这类断裂在它们身上**永不可见**（本表的全部意义）。
      //   全量回归的 `panel 渲染的每个控件都在守卫表内` 正是被它们抓红的。
      //   wa-mo-row / wa-rel-row 是**常驻读数行**（不是按钮，但也是无条件渲染的静态节点），
      //   与 wa-noe-out / wa-lfn-out 同规格：进 ids 层，不进 dynamic。
      'wa-mo-row', 'wa-mo-on', 'wa-mo-stat', 'wa-mo-reset', 'wa-mo-memo', 'wa-mo-out',
      'wa-rel-row', 'wa-rel-a', 'wa-rel-b', 'wa-rel-edge', 'wa-rel-dir', 'wa-rel-reload',
      'wa-rel-stat', 'wa-rel-reset', 'wa-rel-out'] },
    // v2.140.0（F1）：防全知闸门九枚（渲染在人物页「防全知闸门」区）。
    //   同 v2.83.0 / v2.117.0 / v2.121.0 / v2.139.0 的规格——新控件必须
    //   「渲染 + 绑定 + 守卫登记」三件齐做，否则「按钮渲染了但绑定的 id 写错」
    //   这一类断裂在新增出口上无人发现。本版实测正是被这条门禁抓出来的：
    //   `panel 渲染的每个控件都在守卫表内（未覆盖：["wa-noe-enabled",...]）`。
    //   一律无条件渲染（noesis 是产品文件，缺席本身就是断裂，不降级成提示）。
    //   wa-noe-out 是输出区（与 wa-rec-out 同规格：它是面板回显，不是控件）。
    { page: 'people', ids: ['wa-noe-enabled', 'wa-noe-person', 'wa-noe-fact',
      'wa-noe-knows', 'wa-noe-scan', 'wa-noe-boundary', 'wa-noe-gate', 'wa-noe-perceive',
      // v2.143.0（F4）：在岗闸门一枚 —— 渲染 + 绑定 + 守卫登记三件齐做。
      'wa-noe-duty', 'wa-noe-fidelity',
      'wa-noe-out'] },
    // v2.141.0（F2）：生理与照护真实层（渲染在人物页）。同 v2.83.0 / v2.117.0 / v2.121.0 / v2.139.0 / v2.140.0 的规格——
    //   新控件必须「渲染 + 绑定 + 守卫登记」三件齐做，否则「按钮渲染了但绑定的 id 写错」
    //   这一类断裂在新增出口上无人发现。本版实测正是被这条门禁抓出来的：
    //   `panel 渲染的每个控件都在守卫表内（未覆盖：["wa-lfn-enabled",...]）`。
    //   一律无条件渲染（lifeline 是产品文件，缺席本身就是断裂，不降级成提示）。
    //   wa-lfn-out 是输出区（与 wa-rec-out / wa-noe-out 同规格：它是面板回显，不是控件）。
    { page: 'people', ids: ['wa-lfn-enabled', 'wa-lfn-person', 'wa-lfn-cond', 'wa-lfn-kind',
    'wa-lfn-limits', 'wa-lfn-care', 'wa-lfn-register', 'wa-lfn-course', 'wa-lfn-advance',
    'wa-lfn-capacity', 'wa-lfn-gap', 'wa-lfn-view', 'wa-lfn-out'] },
    // v2.142.0（F3）：视角锁（渲染在人物页）。同 v2.83.0 / v2.117.0 / v2.121.0 / v2.139.0 / v2.140.0 / v2.141.0 的规格——
    //   新控件必须「渲染 + 绑定 + 守卫登记」三件齐做，否则「按钮渲染了但绑定的 id 写错」
    //   这一类断裂在新增出口上无人发现。
    //   一律无条件渲染（perspective 是产品文件，缺席本身就是断裂，不降级成提示）。
    //   wa-per-out 是输出区（与 wa-rec-out / wa-noe-out / wa-lfn-out 同规格：它是面板回显，不是控件）。
    { page: 'people', ids: ['wa-per-enabled', 'wa-per-scene', 'wa-per-lens', 'wa-per-persons',
      'wa-per-assign', 'wa-per-current', 'wa-per-boundary', 'wa-per-who', 'wa-per-channel',
      'wa-per-access', 'wa-per-allows', 'wa-per-leak', 'wa-per-block', 'wa-per-out'] },
    { page: 'logs', ids: ['wa-log-copy', 'wa-log-err', 'wa-err-report'] },
    // v2.149.0（P3 + X1）：观测视角选择器（**渲染在面板头部，不属于任何一页**）+
    //   世界沉积层九枚控件。守卫表是控件接线面的唯一真源：渲染了不登记 ⇒
    //   「渲染了但绑定的 id 写错」这类断裂在这批控件上**永不可见**
    //   （v2.124.0 的 wa-perf-band 漏登记就是这么被漏掉的）。
    //   头部选择器挂到 'overview' 组：它在任何页都在场，任选一组都成立；
    //   挂 overview 是因为那是默认页（首次打开即校验，不需要用户先切页）。
    { page: 'overview', ids: ['wa-view-sel', 'wa-view-out',
      // v2.413.0（OPV24-2）：世界脉搏的机会应答结果回显行。常在容器（块在场即渲染），
      //   按「输出区，面板回显不是控件」先例登 ids 层 —— 与 wa-first-out 同规格。
      'wa-pulse-res',
      // v2.210.0（收口）：面板导航的**常驻头部**（跳转读数 + 返回）。它渲染在布局壳里、
      //   不属任何单页，故归概览组 —— 同 v2.209.0 的 ui/panel-nav.js 一样，这两个控件
      //   「渲染了但绑定写错 id」这类断裂只有登记过才会被发现（本表的全部意义）。
      'wa-nav-out', 'wa-nav-back',
      // v2.273.0（V6 拓展线）：概览页九块只读读数容器一次登记到位。
      //   它们是**展示容器**（不是控件），本仓既有惯例同样登记 —— 见
      //   `wa-first-out` / `wa-lfn-out` 的先例：「输出区，与 wa-rec-out 同规格：
      //   它是面板回显，不是控件」。理由：渲染了不登记 ⇒ 守卫表查不到它，
      //   而「块渲染了但 id 写错」这类断裂只有在登记过的 id 上才会被发现（本表全部意义）。
      'wa-cap-line', 'wa-health-line', 'wa-vis-line', 'wa-first-line', 'wa-diary-block', 'wa-route-block', 'wa-temp-block', 'wa-cal-block', 'wa-cost-block', 'wa-save-block',
      // v2.403.0：推演健康行。常在场（恒渲染容器：推演正常时空内容、异常时显引擎原话），
      //   按「常在场登 ids 层」口径与 wa-first-line 同列。
      'wa-sim-health-line',
      // v2.271.0（V6 EXV6-7）：概览页开局引导块的两个出口。v2.274.0 从 settings 组迁来
      //   （firstBlock 拼进的是 overview 模板，登在 settings 组等于永不校验）。
      //   `wa-first-block` 的三态渲染（缺席提示 / 关闭不渲染 / 三步做完不占屏）由
      //   `cond` 层承载：它缺失是**依赖态**，不判失败 —— 这与 first-run-ui 锁的 A8/A10
      //   「关闭时整块不渲染」是同一条口径，不然两处会互相打架。
      'wa-first-out'],
      // v2.282.0：`wa-wc-line` 从 ids 层迁到 cond 层。它**不是常在场** —— 只在
      //   `stat().withHint > 0` 时才渲染（没有自带 hint 的写口时整行不渲染）。
      //   v2.280.0 把它登进 ids 层，等于声称「这一页一定有它」；于是 H4「逐页无缺失」
      //   在全量回归里报 overview:["wa-wc-line"] —— 断的不是控件，是**登记的分层口径**：
      //   常在场登 ids、条件在场登 cond（与 wa-first-block 同列）。迁层不是放宽判据：
      //   它仍在守卫表里，渲染了但 id 写错照样被咬到，只是不再要求「每次都在」。
      // v2.285.0（V7 EXV7-1）：`wa-brief-block` 同理登 cond 层 —— 简报关着时整块不
      //   渲染（firstBlock 口径：关着不占屏）。它缺失是**设置态**（enabled:false），
      //   不是断裂；渲染了但 id 写错照样被咬到。
      // v2.286.0（V7 EXV7-2）：`wa-intent-block` 同登 cond 层 —— 看板关着时整块
      //   不渲染（briefBlock 口径：关着不占屏），plan 引擎缺席时渲染的是**缺席提示**
      //   而非数据行。它缺失是设置态 / 依赖态，不是断裂；渲染了但 id 写错照样被咬到。
      // v2.405.0：`wa-world-pulse-card` 登 cond 层 —— 世界读数通道缺席或异常时
      //   统一卡静默不渲染（diaryBlock 口径：失败不占屏）。它缺失是依赖态，
      //   不是断裂；渲染了但 id 写错照样被咬到。
      cond: ['wa-first-block', 'wa-wc-line', 'wa-brief-block', 'wa-intent-block'],
      // v2.409.0 收尾：`wa-world-pulse-card` 从 cond 迁到 dynamic 层 —— 不是放宽，是**归位**。
      //   它由 engines/world-reader.js 的 renderCard 产出，而守卫表的静态渲染面采集的是
      //   ui/*.js（product-files.js 的 uiFiles）——引擎侧渲染的 id 在那一面上**天然看不到**。
      //   留在 cond 的后果是恒红：cond 档按静态渲染面判在场，而生成点在引擎文件里。
      //   dynamic 档的判据是「调用点存在」（下面按 "<id>" 在源码里找），正好对上引擎侧生成点。
      dynamic: ['wa-world-pulse-card'] },
    { page: 'sediment', ids: ['wa-sed-enabled', 'wa-sed-place', 'wa-sed-trace', 'wa-sed-key', 'wa-sed-text', 'wa-sed-settle', 'wa-sed-feel', 'wa-sed-block', 'wa-sed-stat',
      // v2.290.0（EXV7-6）：跨地点沉积台账出口。三件齐做（渲染 + 绑定 + 守卫登记）——
      //   理由与 v2.149.0 那批一致：只加按钮不加登记，「渲染了但绑定 id 写错」在本出口上永不可见。
      'wa-sed-places', 'wa-sed-out'] },
    // v2.151.0（RX2+RX3）：会话页十六枚控件（跨会话记忆锚八枚 + 远方世界脉搏四枚 + 共用输出区一枚）。
    //   守卫表是控件接线面的唯一真源：渲染了不登记 ⇒「渲染了但绑定的 id 写错」这类断裂
    //   在这批控件上永不可见（v2.124.0 的 wa-perf-band 漏登记就是这么被漏掉的）。
    //   一律无条件渲染（两引擎是产品文件，缺席本身就是断裂，不降级成提示）。
    { page: 'offline', ids: ['wa-ot-enabled', 'wa-ot-path', 'wa-ot-kind', 'wa-ot-note',
      'wa-ot-anchor', 'wa-ot-anchors', 'wa-ot-release', 'wa-ot-tick', 'wa-ot-summary', 'wa-ot-block', 'wa-ot-stat',
      'wa-ff-enabled', 'wa-ff-partition', 'wa-ff-pending', 'wa-ff-stat',
      // v2.157.0（SP4 + S2）：四枚新控件（自动推进开关 / 按剧情日推一次 / 转移包 / 输出区）。
      //   同口径：渲染了不登记 ⇒ 绑定断裂永不可见。
      'wa-ff-auto', 'wa-ff-tick', 'wa-ff-transfer', 'wa-ff-out',
      // v2.152.0（RP6+RP7）：性能与水位段九枚（渲染开关/渲染读数/渲染趋势/清空观测/水位开关/采样本/水位预测/水位台账 + 共用输出区）。
      //   登记口径与上一批一致 —— 渲染了不登记，「渲染了但绑定的 id 写错」在这批控件上永不可见。
      'wa-rp-enabled', 'wa-rp-stat', 'wa-rp-trend', 'wa-rp-reset',
      'wa-sf-enabled', 'wa-sf-sample', 'wa-sf-forecast', 'wa-sf-stat',
      // v2.153.0（RX5+RX6）：剧情深度与分支树段十二枚（深度仪四按钮 + 开关 + 分支树三按钮 +
      //   比对两输入 + 分支树开关 + 共用输出区）。同 v2.152.0 的登记口径 ——
      //   渲染了不登记，「渲染了但绑定的 id 写错」在这批控件上永不可见。
      //   一律无条件渲染（两引擎是产品文件，缺席本身就是断裂，不降级成提示）。
      'wa-pg-enabled', 'wa-pg-read', 'wa-pg-trend', 'wa-pg-advice', 'wa-pg-stat',
      'wa-bt-enabled', 'wa-bt-tree', 'wa-bt-compare', 'wa-bt-nodes', 'wa-bt-a', 'wa-bt-b',
      // v2.154.0 收口期补：分支记账的**写口**（v2.153.0 只落了读口，产品面零调用点 ⇒ 分支树恒为空树）。
      //   与 v2.149.0 的 sediment（settle/feel/buildBlock 三写口 + stat）同规格：写口与读口并存。
      'wa-bt-round', 'wa-bt-prompt', 'wa-bt-opts', 'wa-bt-fork',
      'wa-bt-id', 'wa-bt-choice', 'wa-bt-choose', 'wa-bt-replay',
      // v2.155.0 收口（全量回归当场抓到）：两个面板回显区此前**渲染了但没登记** ——
      //   守卫表是控件接线面的唯一真源，输出区与控件同规格（同 wa-pg-out / wa-nb-out 的登记口径）。
      'wa-ot-out', 'wa-rp-out',
      'wa-pg-out',
      // v2.156.0（SP1+S1）：会话页追加七枚（游玩基准三枚 + 离线恢复编排三枚 + 共用输出区一枚）。
      //   登记口径与上一批一致 —— 渲染了不登记，「渲染了但绑定的 id 写错」在这批控件上永不可见。
      'wa-pt-enabled', 'wa-pt-read', 'wa-pt-touch',
      'wa-or-enabled', 'wa-or-recover', 'wa-or-stat', 'wa-or-out'] },
    // v2.154.0（RX4+RX7）：联网页二十一枚——联网面（开关/两身份输入/保存身份/签名/落种子/导出/
    //   导入/包输入/传说清单/传说 id/转投/注入块/台账 + 输出区）+ 自洽审计（开关/四类别/保存类别/
    //   扫描/问题清单/上次读数/台账 + 输出区）。同 v2.153.0 的登记口径 —— 渲染了不登记，
    //   「渲染了但绑定的 id 写错」在这批控件上永不可见；一律无条件渲染（两引擎是产品文件，
    //   缺席本身就是断裂，不降级成提示）。两个输出区**分开登记**：与 wa-ot-out/wa-pg-out 同规格
    //   （面板回显，不是控件，但守卫表仍要收 —— 否则「渲染了没人收」这一半没人看）。
    { page: 'net', ids: ['wa-nb-enabled', 'wa-nb-title', 'wa-nb-player', 'wa-nb-ident',
      'wa-nb-key', 'wa-nb-seed', 'wa-nb-export', 'wa-nb-import', 'wa-nb-pack', 'wa-nb-legends',
      'wa-nb-lg', 'wa-nb-relay', 'wa-nb-block', 'wa-nb-stat', 'wa-nb-out',
      'wa-ec-enabled', 'wa-ec-tl', 'wa-ec-sp', 'wa-ec-cog', 'wa-ec-cau', 'wa-ec-save',
      'wa-ec-sweep', 'wa-ec-issues', 'wa-ec-last', 'wa-ec-stat', 'wa-ec-out'] },
    // v2.155.0（RX8）：世界生成种子库 14 枚 —— 面板「工具」页（按 NEXT_PLAN 原文「消费者：
    //   面板「工具」页（种子库管理：提取/保存/播种/变异）」；同 v2.154.0 的登记口径，
    //   无条件渲染（world-seed 是产品文件，缺席本身就是断裂，不降级成提示）。
    // v2.198.0（Y1）：拍控制中心 —— 6 静态控件 + 1 动态读数出口。
    //   登记到新增的 **beat 页**（同 v2.182.0 health 页三块合页的规格）。
    //   理由与前十几批完全一致：新控件必须「渲染 + 绑定 + 守卫登记」三件齐做，
    //   否则「按钮渲染了但绑定的 id 写错/没登记」这一类断裂在新增出口上无人发现。
    //   六枚按钮全是**只读**口（当前拍 / 上一拍判定 / 闸门卡点 / 计划复验 / 谁在卡 / 诊断），
    //   守卫表只保证「渲染 ↔ 绑定」成对，不承诺它们背后是只读 —— 那条由专锁判。
    { page: 'beat', ids: ['wa-bt-view', 'wa-bt-verdict', 'wa-bt-gates', 'wa-bt-audit', 'wa-bt-blocked', 'wa-bt-diag',
      // v2.278.0（V7 OPV7-3）：驱动者台账的两枚 —— 一枚只读（每台机制归到哪一档、凭什么），
      //   一枚是总开关（关掉后这一栏不参与任何面）。开关不改任何引擎的 enabled，只决定
      //   「要不要读这份台账」，开关面归 capabilityTier 管。本版补登记（v2.278 漏登）。
      'wa-bt-driver', 'wa-bt-driver-sw'],
      dynamic: ['wa-bt-out'] },
    // v2.199.0（Y2）：章节生成工作台六枚控件。同口径「渲染 + 绑定 + 守卫登记」三件齐做。
    //   id 前缀 `wa-chw-` 是**独占**的：v2.87.0 的因果工作台已占 `wa-cw-*`
    //   （`wa-cw-out` 在既有代码里 2 处），本次首版误用 `wa-cw-*` 导致
    //   `const cwOut` 在同一 bindBody 作用域里重复声明 —— `node --check` 当场报错。
    //   这条登记同时也是「同 id 串页」的防线：两个页面的按钮若同 id，
    //   守卫表的按页判定会各自「通过」，玩家点到的是另一页的 handler。
    //   六枚全为**只读**口（开章前该看 / 推进卡点 / 收章前欠什么 / 本章待办 /
    //   章节史 / 数据来源）—— 只读承诺由 Y2 专锁判，本表只保证成对。
    { page: 'chapter', ids: ['wa-chw-open', 'wa-chw-cards', 'wa-chw-close', 'wa-chw-todo', 'wa-chw-history', 'wa-chw-src',
      // v2.231.0（优化 OPT-7）：本页新增「大纲注入」段的五枚控件（编辑框 / 模式 / 看口径 /
      //   预览差异 / 采纳注入 / 撤销到上一版）。同 Y2 立页时的口径：渲染了不登记 ⇒
      //   「绑定的 id 写错」这类断裂只有在登记过的控件上才会被发现。
      //   如实标明差异：与上面六枚**只读**按钮不同，本段有**一个写口**（采纳注入 ⇒
      //   engines/outline-inject.js 的 apply），它写的是**宿主世界书里本插件自己的条目**，
      //   不动世界状态（Y2 的 C2「活世界逐字不变」仍成立）。
      'wa-oi-text', 'wa-oi-mode', 'wa-oi-view', 'wa-oi-preview', 'wa-oi-apply', 'wa-oi-undo'],
      dynamic: ['wa-chw-out', 'wa-oi-out'] },
    // v2.199.0（Y4）：待办中心 6 枚 + 输出锚 —— 面板「待办」页（全部待办 / 即将到期 /
    //   逐源可用性 / 下钻一条 / 空态三旗标 / 诊断）。
    //   同 Y1/Y2 口径：六枚按钮无条件渲染，故登记即「接线真源」（渲染了不登记 ⇒
    //   绑定断裂永不可见）。与 Y2「章节」页的分工写在这里，防止后人把两页并成一页：
    //     Y2 `wa-chw-todo` 是**章内口径**（本章还欠什么，随 chapter 页读），
    //     Y4 `wa-td-*` 是**账户级口径**（此刻整个世界等我处理的）——
    //     两页读数同源（`pendingCenter.items`），写口都为零，不是两个真源。
    { page: 'todo', ids: ['wa-td-all', 'wa-td-soon', 'wa-td-src', 'wa-td-drill', 'wa-td-flags', 'wa-td-diag', 'wa-td-act'],
      dynamic: ['wa-td-out'] },
    { page: 'tools', ids: ['wa-ws-enabled', 'wa-ws-name', 'wa-ws-tags', 'wa-ws-extract',
      'wa-ws-save', 'wa-ws-list', 'wa-ws-id', 'wa-ws-variance', 'wa-ws-sow', 'wa-ws-get',
      'wa-ws-drop', 'wa-ws-stat', 'wa-ws-out',
      // v2.158.0（S3 + SP6）：种子转移与初始化五枚（转移包 / 包粘贴 / 导入 / 预览 / 确认）。
      //   同口径：渲染了不登记 ⇒ 绑定断裂永不可见（v2.124.0 的 wa-perf-band 漏登记即此病）。
      'wa-ws-pack', 'wa-ws-packin', 'wa-ws-import', 'wa-ws-init', 'wa-ws-confirm'] },
    // v2.164.0（TX5）：世界蓝图 14 枚 —— 面板「工具」页（导出 / 保存 / 取 / 删 / 预览 / 安装 / 台账）。
    //   同 v2.155.0 的登记口径：无条件渲染（world-blueprint 是产品文件，缺席本身就是断裂，
    //   不降级成提示）。渲染了不登记 ⇒ 绑定断裂永不可见（v2.124.0 的 wa-perf-band 漏登记即此病）。
    { page: 'tools', ids: ['wa-bp-enabled', 'wa-bp-name', 'wa-bp-tags', 'wa-bp-save',
      'wa-bp-export', 'wa-bp-list', 'wa-bp-stat', 'wa-bp-id', 'wa-bp-get', 'wa-bp-drop',
      'wa-bp-check', 'wa-bp-empty',
      'wa-bp-keep', 'wa-bp-preview', 'wa-bp-import', 'wa-bp-out'] },
    // v2.281.0（V7 OPV7-6）：开局播种 4 个 id —— 面板「工具」页蓝图折叠段内。
    //   它们与蓝图那栏**同页不同栏**：蓝图答「这个世界能不能原样搬走」，播种答「搬过来
    //   之后世界里有没有剧本」。登记口径同 v2.164.0：无条件渲染 ⇒ 进 ids（而不是 cond /
    //   dynamic）。两个按钮是「只读读数 + 幂等补播」，输出区是回显 —— 输出区照样登记，
    //   同 wa-bp-out / wa-dc-out 的先例：渲染了没人收，这一半就没人看。
    { page: 'tools', ids: ['wa-seed-enabled', 'wa-seed-line', 'wa-seed-replay', 'wa-seed-view', 'wa-seed-out'] },
    // v2.165.0（TX1）：势力外交 22 枚 —— 面板「世界」页（外交总览 / 查对 / 提案适用性 / 提提案 /
    //   答复 / 签约 / 履约 / 违约 / 到期 / 启用开关）。同口径：无条件渲染（diplomacy 是产品文件，
    //   缺席本身就是断裂，不降级成提示）；渲染了不登记 ⇒ 绑定断裂永不可见（v2.124.0 的
    //   wa-perf-band 漏登记即此病）。
    { page: 'world', ids: ['wa-dp-enabled', 'wa-dp-view', 'wa-dp-a', 'wa-dp-b', 'wa-dp-pair', 'wa-dp-applies', 'wa-dp-from', 'wa-dp-to',
      'wa-dp-terms', 'wa-dp-propose', 'wa-dp-id', 'wa-dp-kind', 'wa-dp-basis', 'wa-dp-reply', 'wa-dp-sign',
      'wa-dp-pairid', 'wa-dp-term', 'wa-dp-ev', 'wa-dp-fulfil', 'wa-dp-breach', 'wa-dp-expire', 'wa-dp-out'] },
    // v2.166.0（TX2）：行动调度 6 枚 —— 面板「世界」页（启用开关 / 调度 / 回执 / 诊断）。
    //   同口径：无条件渲染（agency 是产品文件，缺席本身就是断裂，不降级成提示）；
    //   渲染了不登记 ⇒ 绑定断裂永不可见。
    { page: 'world', ids: ['wa-ag-enabled', 'wa-ag-person', 'wa-ag-schedule', 'wa-ag-receipts', 'wa-ag-diag', 'wa-ag-out'] },
    { page: 'world', ids: ['wa-fr-enabled', 'wa-fr-route', 'wa-fr-from', 'wa-fr-res', 'wa-fr-qty', 'wa-fr-days', 'wa-fr-base', 'wa-fr-dispatch', 'wa-fr-arrive', 'wa-fr-cancel', 'wa-fr-reroute', 'wa-fr-view', 'wa-fr-diag', 'wa-fr-out'] },
    // v2.173.0（TX4b）：下面五组此前**只有登记、没有渲染**——五模块 56 个导出全部躺在
    //   死子面账本上（storyChoice 9 / commission 11 / investigation 11 / aftermath 12 /
    //   operations 13），连各自的 getSettings/setSettings 都是 test-only。对照实验把界线
    //   画得很清楚：邻居 diplomacy / agency / freight 的同类口是活的，差别只在面板上
    //   有没有那一栏。登记在 UI_BINDINGS 只是字符串，不算消费方。
    //   本版同时补齐**承载参数的输入 id**：原登记集只有动作控件，而委托要标题/委托方/
    //   受托方/阶段、运营要决策号/组织号/批准人——缺了它们，按钮点了也无参可递。
    //   渲染在 ui/panel.js 的 renderWorld（TX3 货运段之后、声誉四维之前）。
    { page: 'world', ids: ['wa-sc-enabled', 'wa-sc-round', 'wa-sc-prompt', 'wa-sc-opts',
      'wa-sc-present', 'wa-sc-id', 'wa-sc-option', 'wa-sc-confirm', 'wa-sc-review', 'wa-sc-pending', 'wa-sc-out'] },
    { page: 'world', ids: ['wa-cm-enabled', 'wa-cm-title', 'wa-cm-principal', 'wa-cm-agent', 'wa-cm-stages', 'wa-cm-create',
      'wa-cm-id', 'wa-cm-receipt', 'wa-cm-advance', 'wa-cm-settle', 'wa-cm-reason', 'wa-cm-cancel', 'wa-cm-view', 'wa-cm-pending', 'wa-cm-out'] },
    // TX7 前缀是 wa-inv-* 而非 wa-iv-*：`wa-iv-*` 这个 id 空间在 v2.150.0 已被
    //   **注入价值榜单**占用（wa-iv-refresh / wa-iv-enabled / wa-iv-zero / wa-iv-max，
    //   渲染在 renderInject）。两处同名 = 两个控件抢一个 id，先渲染的赢，后者静默失效。
    { page: 'world', ids: ['wa-inv-enabled', 'wa-inv-title', 'wa-inv-subject', 'wa-inv-witness', 'wa-inv-register',
      'wa-inv-id', 'wa-inv-person', 'wa-inv-receipt', 'wa-inv-investigate', 'wa-inv-check', 'wa-inv-reveal',
      'wa-inv-view', 'wa-inv-pending', 'wa-inv-out'] },
    { page: 'world', ids: ['wa-ops-enabled', 'wa-ops-decision', 'wa-ops-org', 'wa-ops-approver', 'wa-ops-name',
      'wa-ops-budget', 'wa-ops-milestones', 'wa-ops-enact',
      'wa-ops-id', 'wa-ops-amount', 'wa-ops-item', 'wa-ops-disburse', 'wa-ops-cycle', 'wa-ops-settle',
      'wa-ops-from', 'wa-ops-to', 'wa-ops-handover', 'wa-ops-active', 'wa-ops-pending', 'wa-ops-view', 'wa-ops-cancel', 'wa-ops-out'] },
    { page: 'world', ids: ['wa-af-enabled', 'wa-af-place', 'wa-af-event', 'wa-af-type', 'wa-af-desc', 'wa-af-register',
      'wa-af-id', 'wa-af-repair', 'wa-af-inspect', 'wa-af-active', 'wa-af-view', 'wa-af-reason', 'wa-af-cancel', 'wa-af-out'] },
    { page: 'assistant', ids: ['wa-ask-input', 'wa-ask-btn', 'wa-ask-out',
      // v2.208.0（E1）：证据问答新增三处可见区 + 只查证据按钮（引用号 / 缺口 / 计量行）
      'wa-ask-ev', 'wa-ask-hint', 'wa-ask-cites', 'wa-ask-gaps',
      'wa-theater-input', 'wa-theater-btn', 'wa-theater-insert', 'wa-theater-copy', 'wa-theater-out'] },
    { page: 'events', ids: ['wa-inspect-run', 'wa-inspect-out'] },
    { page: 'logs', ids: ['wa-log-copy'] },
    { page: 'connect', ids: ['wa-conc'] },
    // v2.3.0 块3: 设置页整页此前在守卫之外——10 页里只守了 8 页，设置页 30 余个控件
    //   （含推演尺度/预算/净化规则/舆情/演化/随机事件）绑定断裂无人发现。
    //   净化规则区在 purifier 未加载时整段不渲染 → 归入 cond（依赖态，缺失不判失败）。
    { page: 'settings', ids: [
      // v2.257.0（V6 OPV6-1）：设置页**顶部**的档位呈现 —— 三档按钮 + 退回按钮。
      //   为什么这一组必须登记：档位此前只存在于机制页折叠段里（默认收起、
      //   且玩家模式下机制页不可见），设置页顶部是它唯一的玩家可达入口。
      // v2.274.0（收口）：`wa-set-tier-rollback` 是**条件渲染**（`rollbackDepth > 0`
      //   才拼出这个按钮，出厂态回滚栈空 ⇒ 正确行为就是不渲染）。此前登在 ids 里 ⇒
      //   出厂态必报缺失，而那时「没有可退的」恰是正确态。故移入 cond。
      'wa-set-mode', 'wa-set-time', 'wa-set-pulse', 'wa-set-npc',
      'wa-set-auto', 'wa-set-fullrules', 'wa-set-sync', 'wa-set-autobak', 'wa-set-budget-mode', 'wa-set-budget',
      'wa-set-mslimit', 'wa-set-msdice', 'wa-set-msrel', 'wa-set-custom', 'wa-set-save',
      'wa-op-enable', 'wa-op-sandbox', 'wa-op-n', 'wa-op-now', 'wa-sim-now',
      'wa-ev-dice', 'wa-ev-mod', 'wa-ev-roll', 'wa-ev-out',
      // v2.3.0 块3: 随机事件通道配置（新增出口）
      'wa-hz-d-en', 'wa-hz-d-chance', 'wa-hz-d-cd', 'wa-hz-d-ledger',
      'wa-hz-n-en', 'wa-hz-n-chance', 'wa-hz-n-cd', 'wa-hz-n-ledger',
      'wa-hz-save', 'wa-hz-out',
      // v2.3.0 块3: 数值回显 span 同样是「在场控件」——它们一直渲染在设置页，
      //   只是该页此前整体在守卫之外，从未被发现。既然纳管就一并登记（缺失同样意味着
      //   滑块拖动时数值不更新，属真缺陷）。
      'wa-set-npcv', 'wa-set-budgetv', 'wa-set-mslimitv', 'wa-set-msdicev', 'wa-ev-modv',
      'wa-hz-d-chancev', 'wa-hz-d-cdv', 'wa-hz-d-ledgerv',
      'wa-hz-n-chancev', 'wa-hz-n-cdv', 'wa-hz-n-ledgerv',
      // v2.7.0: 区域突发事件配置（生效值视图接入界面后的新增出口）
      'wa-rg-enable', 'wa-rg-chance', 'wa-rg-dur', 'wa-rg-save', 'wa-rg-out',
      'wa-rg-chancev', 'wa-rg-durv',
      // v2.265.0（V6 EXV6-1）：世界日记设置面五枚控件（渲染在设置页「世界日记」一格）。
      //   同 v2.51.0 的理由：**渲染 + 绑定 + 守卫登记**三件齐做，否则「控件渲染了但绑定的
      //   id 写错」在这个新出口上无人发现 —— 而这一格的失效后果尤其静默：日记照常显示，
      //   只是玩家改了「每屏句数」却不生效（滑块拖动、读数不跟随）。
      //   `wa-wd-out` 是结果出口，随渲染出 ⇒ 与 wa-rg-out 同列（不挂 cond：它恒在场）。
      'wa-wd-enable', 'wa-wd-maxlines', 'wa-wd-maxlinesv', 'wa-wd-offline', 'wa-wd-save', 'wa-wd-out',
      // v2.285.0（V7 EXV7-1）：世界简报设置面五枚控件（渲染在设置页「今日世界简报」一格）。
      //   同 v2.265.0 世界日记那组的理由：**渲染 + 绑定 + 守卫登记**三件齐做。
      //   `wa-wb-maxrows` 是滑块、`wa-wb-maxrowsv` 是它的读数 span，两者必须同列
      //   （读数不跟随＝拖动无效，属真缺陷）。
      'wa-wb-enable', 'wa-wb-maxrows', 'wa-wb-maxrowsv', 'wa-wb-save', 'wa-wb-out',
      // v2.266.0（V6 EXV6-2）：人物动线设置面七枚控件（渲染在设置页「人物今日动线」一格）。
      //   同 v2.265.0 世界日记那组的理由，且这一格多一条**静默失效**：
      //   `wa-dr-next` / `wa-dr-hideplace` 关掉后动线照常显示，只是少一段/不报地名，
      //   玩家看不出「我改了但它没生效」——只有守卫能发现 id 写错。
      //   注：`wa-dr-maxp` 是滑块、`wa-dr-maxpv` 是它的读数 span，两者必须同列
      //   （读数不跟随＝拖动无效，属真缺陷）。
      'wa-dr-enable', 'wa-dr-maxp', 'wa-dr-maxpv', 'wa-dr-next', 'wa-dr-hideplace', 'wa-dr-save', 'wa-dr-out',
      // v2.286.0（V7 EXV7-2）：人物意图看板设置面七枚控件（渲染在设置页「人物意图看板」一格）。
      //   同 v2.285.0 世界简报那组的理由：**渲染 + 绑定 + 守卫登记**三件齐做，否则
      //   「控件渲染了但绑定的 id 写错」在这个新出口上无人发现。这一格同样有**静默失效**：
      //   `wa-ib-enable` 关掉后概览页整块不渲染 —— 与「世界上没人有计划」在屏幕上是同一个
      //   空白，玩家看不出「我改了但它没生效」，只有守卫能发现 id 写错。
      //   注：`wa-ib-maxrows` / `wa-ib-maxrest` 是滑块、`...v` 是它们的读数 span，
      //   两组必须同列（读数不跟随＝拖动无效，属真缺陷）。
      //   注：`wa-ib-maxrows` / `wa-ib-maxrest` 是滑块、`...v` 是它们的读数 span，
      //   两组必须同列（读数不跟随＝拖动无效，属真缺陷）。
      //   v2.293.0（收口）：上面这段注释自 v2.286.0 起就在，但**控件名一行都没登记**
      //   ——注释写着「三件齐做」，实际只做了前两件。全量回归的
      //   「panel 渲染的每个控件都在守卫表内」把它们全部当成未覆盖控件报了出来。
      'wa-ib-enable', 'wa-ib-maxrows', 'wa-ib-maxrowsv', 'wa-ib-maxrest', 'wa-ib-maxrestv',
      'wa-ib-save', 'wa-ib-out',
      // v2.292.0（V7 EXV7-8）：世界自传设置面七枚控件（渲染在设置页「世界自传」一格）。
      //   同前几组的理由；这一格多一条**静默失效**：`wa-ab-enable` 关掉后整份自传
      //   拒收（不是在屏幕上少一块）—— 玩家看不出「我关了它」，只有守卫能发现 id 写错。
      //   注：`wa-ab-rounds` / `wa-ab-chapters` / `wa-ab-lines` 是滑块、`...v` 是读数 span，
      //   三组必须同列（读数不跟随＝拖动无效，属真缺陷）。
      'wa-ab-enable', 'wa-ab-rounds', 'wa-ab-roundsv', 'wa-ab-chapters', 'wa-ab-chaptersv',
      'wa-ab-lines', 'wa-ab-linesv', 'wa-ab-save', 'wa-ab-out',
      // v2.293.0（V7 EXV7-9）：一键播种设置面八枚控件（渲染在设置页「一键播种」一格）。
      //   这是 V7 九项里**唯一带写面**的一项，七个旋钮每一个都直接决定往世界里落多少笔
      //   （`people` 占 people 名额、`bondDensity` 占关系行）——「改了不生效」在这里
      //   不会留下任何可见痕迹，只有守卫能发现 id 写错。
      //   注：七个滑块 `wa-po-people/places/roads/factions/density/goals/grant` 各配
      //   一个 `...v` 读数 span，必须同列。
      'wa-po-enable', 'wa-po-people', 'wa-po-peoplev', 'wa-po-places', 'wa-po-placesv',
      'wa-po-roads', 'wa-po-roadsv', 'wa-po-factions', 'wa-po-factionsv',
      'wa-po-density', 'wa-po-densityv', 'wa-po-goals', 'wa-po-goalsv',
      'wa-po-grant', 'wa-po-grantv', 'wa-po-save', 'wa-po-out',
      // v2.267.0（V6 EXV6-3）：关系温度计设置面七枚控件。
      'wa-rt-enable', 'wa-rt-maxp', 'wa-rt-maxpv', 'wa-rt-types', 'wa-rt-reason', 'wa-rt-save', 'wa-rt-out',
      // v2.268.0（V6 EXV6-4）：暗流日历设置面七枚控件（渲染在设置页「暗流日历」一格）。
      //   同 v2.267.0 关系温度计那组的理由，且这一格同样有**静默失效**：
      //   `wa-uc-hidden` 关掉后日历照常出，只是隐秘暗流被脱敏成「异动」，
      //   玩家看不出「我改了但它没生效」——只有守卫能发现 id 写错。
      //   注：`wa-uc-hz` / `wa-uc-max` 是滑块、`wa-uc-hzv` / `wa-uc-maxv` 是读数 span，
      //   两组必须同列（读数不跟随＝拖动无效，属真缺陷）。
      'wa-uc-enable', 'wa-uc-hz', 'wa-uc-hzv', 'wa-uc-max', 'wa-uc-maxv', 'wa-uc-hidden', 'wa-uc-save', 'wa-uc-out',
      // v2.269.0（V6 EXV6-5）：单轮成本卡设置面六枚控件（渲染在设置页「单轮成本卡」一格）。
      //   同 v2.268.0 暗流日历那组的理由，且这一格多一条**默认关着的项**：
      //   `wa-rc-longtrend` 关掉时长期趋势不进卡（默认就是关的），
      //   玩家看不出「我开了但它没生效」——只有守卫能发现 id 写错。
      //   注：`wa-rc-topn` 是滑块、`wa-rc-topnv` 是它的读数 span，两者必须同列。
      'wa-rc-enable', 'wa-rc-topn', 'wa-rc-topnv', 'wa-rc-timing', 'wa-rc-longtrend', 'wa-rc-save', 'wa-rc-out',
      // v2.270.0（V6 EXV6-6）：存档体检设置面**九枚**控件（渲染在设置页「存档体检」一格）。
      //   同前几组的理由，且这一格多一条**上游耦合同步**：
      //   `wa-sh-forecaster` / `wa-sh-waterline` 是真会写**别的引擎**的开关，
      //   点了必须复核读回（静默不生效时只有守卫能发现）。
      //   注：`wa-sh-warn` / `wa-sh-urgent` 是滑块、`wa-sh-warnv` / `wa-sh-urgentv` 是读数 span，
      //   两组必须同列（读数不跟随＝拖动无效，属真缺陷）。
      'wa-sh-enable', 'wa-sh-warn', 'wa-sh-warnv', 'wa-sh-urgent', 'wa-sh-urgentv',
      'wa-sh-forecaster', 'wa-sh-waterline', 'wa-sh-save', 'wa-sh-out',
      // v2.271.0（V6 EXV6-7）：开局引导设置面七枚控件（渲染在设置页「开局引导」一格）。
      //   同前几组的理由，且这一格多一条**跨引擎读**：三步的判据分别来自 api-router /
      //   capability-tier / store，任何一处 id 写错都只会静默不显示。
      //   注：`wa-fr-talk` 的手勾走 mark()（环境判得出时会被拒），面板不许绕过。
      'wa-fr-enable', 'wa-fr-showdone', 'wa-fr-talk', 'wa-fr-save',
      'wa-fr-resume', 'wa-fr-reset', 'wa-fr-out',
      // v2.273.0（V6 EXV6-9）：一键交班设置面九枚控件（渲染在设置页「一键交班」一格）。
      //   同前几组的理由；这一格多一条**跨引擎写**（复原会真调各模块导入口），
      //   任何一处 id 写错都只会静默不生效。
      'wa-hp-enable', 'wa-hp-bp', 'wa-hp-rules', 'wa-hp-tier', 'wa-hp-theme',
      'wa-hp-save', 'wa-hp-pack', 'wa-hp-restore', 'wa-hp-out',
      // v2.51.0（第三十六面）: 叙事工艺设置面控件（同 v2.45.0/v2.46.0 的理由：新控件
      //   必须同时「渲染 + 绑定 + 守卫登记」，否则「渲染了但绑定的 id 写错」在新增出口上无人发现）。
      //   注：`wa-st-block` 等一律无条件渲染（模块缺席时整段降级成一句提示、控件不在场 ⇒
      //   本组会在 style.js 未加载时报 missing——这是**有意的**：style.js 是产品文件，
      //   它缺席本身就是断裂，不该被 cond 层「依赖态、缺失不判失败」掩盖）。
      'wa-st-block', 'wa-st-para', 'wa-st-persp', 'wa-st-pron', 'wa-st-takeover', 'wa-st-narrate',
      'wa-st-custom', 'wa-st-save', 'wa-st-out',
      // v2.129.0（缝 A1–A10）：十个新引擎的总开关（同 v2.51.0 理由：渲染 + 绑定 + 守卫登记三件齐做，
      //   否则 id 写错无人发现）。这些是 A1–A10 十项能力在面板上的**唯一**入口。
      'wa-sw-userlock', 'wa-sw-rewriter', 'wa-sw-storyclock', 'wa-sw-rhythmloop', 'wa-sw-motif',
      'wa-sw-beatmask', 'wa-sw-presetworld', 'wa-sw-poweranchor', 'wa-sw-requestviewer', 'wa-sw-wbsearch',
      // v2.130.0（拓展计划 A1..A4 / B1 / C1 / C2 / D1..D4）：十二个新引擎的总开关（同
      //   v2.129.0 理由：渲染 + 绑定 + 守卫登记三件齐做，否则 id 写错无人发现）。
      //   `wa-sw-grouprefuse` 是**只读读数**（群聊拒绝无总开关，控件恒开置灰），
      //   登记它的意义同其它控件：id 写错要有人发现。`wa-sw-note2130` 是说明行。
      'wa-sw-staleguard', 'wa-sw-purifyscope', 'wa-sw-reasoning', 'wa-sw-storytone',
      'wa-sw-calendarplan', 'wa-sw-preflight', 'wa-sw-archivehide', 'wa-sw-wordbudget',
      'wa-sw-binding', 'wa-sw-refine', 'wa-sw-polish', 'wa-sw-grouprefuse', 'wa-sw-note2130',
      // v2.135.0（E6）：伏笔生命周期总开关（同 v2.51.0 理由：渲染 + 绑定 + 守卫登记
      //   三件齐做，否则 id 写错无人发现）。
      'wa-sw-foreshadow',
      // v2.138.0（E7）：天气→灾害反向联动。两个控件：开关（wa-sw-hazardwx）+ 读数行（wa-hzwx-view）。
      //   开关**故意不挂 data-sw-ns**（通用通道一律写 enabled，而它管的是 weatherLink ⇒
      //   会被通用绑定顺手改掉总开关语义），故绑定走 ui/settings.js 里那段专用 onchange；
      //   本组只保证「渲染 ↔ 守卫登记」成对。读数行随渲染出，同 wa-sw-out 规格。
      'wa-sw-hazardwx', 'wa-hzwx-view',
      // v2.139.0（E9）：势力关系网总开关（渲染在设置页）。走通用 data-sw-ns 通道 ⇒ 写 {enabled}。
      //   同 v2.135.0/v2.138.0 规格：**渲染 + 绑定 + 守卫登记**三件齐做，
      //   否则「控件渲染了但绑定 id 写错」在这个新出口上无人发现。
      //   （事件页那三个读数入口登记在 events 组 —— 守卫表**按页分组**，放错组就等于报错页。）
      'wa-sw-factiongraph',
      // v2.139.0（E11）：偏离度告警线（设置页数值控件）。
      //   它**不是开关**而是阈值：与上面一排开关同登记（同一页、同一「渲染 + 绑定 + 守卫登记」纪律），
      //   但语义分列 —— 开关答「算不算」，阈值答「多少算偏得多」。
      'wa-sw-deviationalert',
      // v2.202.0（Y7）：地图与关系可视化总开关（渲染在设置页）。走通用 data-sw-ns 通道 ⇒ 写 {enabled}。
      //   登记它的意义同其它行：id 写错要有人发现（渲染 + 绑定 + 守卫登记三件齐做）。
      'wa-sw-worldgraph',
      // v2.533.0（OPV30 收口）：缝合件台账读数行（设置页）。五行读数（副本族 / 边界规则 /
      //   写前预演 / 引导弧 / 存档体检）随渲染出，同 wa-hzwx-view 规格：**渲染 + 守卫登记**
      //   成对，否则「id 写错」在这个新出口上无人发现（实测：未登记时块8 直接报未覆盖
      //   ["wa-eng-ledger-view"]）。
      'wa-eng-ledger-view',
      'wa-sw-out',
      // v2.255.0（SIMPLIFY-NAV）：界面分区的开发者模式开关（设置页）。同一页同一纪律：
      //   渲染（ui/settings.js 的「界面」分区）+ 绑定（bind 的 #wa-set-devmode onchange）+
      //   守卫登记（本行）三件齐做 —— 漏登记的表现是 ui-gate 的「每个控件都在守卫表内」红灯。
      //   v2.381.0 收口：**它只由玩家分支渲染**（开发者分支里没有它 —— 开了开发者模式就不需要
      //   「显示高级设置」这个入口了），故移入 player 层。留在 ids 里等于要求「两种模式下都在」，
      //   而它在开发者模式下**本来就不该存在**。这是一条恒假的判据，不是控件丢了。
      // v2.273.0（V6 拓展线）：设置页档位面读数 span/出口 + 动线导航条。
      //   档位四条与 `wa-rc-topnv` 同规格（滑块读数 span 必须与滑块同列）；
      //   动线导航条是 v2.262.0（OPV6-7）引入、此前一直在守卫表之外。
      'wa-set-tier-now', 'wa-set-tier-gap', 'wa-set-tier-hold', 'wa-set-tier-out',
      // v2.380.0（幽灵引用治理批次⑦）：玩家模式（出厂 devMode:false）下由
      //   `playerSettingsHtml()` 渲染的「世界节奏」两枚控件此前没登记。它们**恒渲染**
      //   （不挂 cond / dynamic）：玩家一进设置页就看得见，改动直接落 backstage.simulationMode。
      //   v2.381.0 收口：同上 —— 它们只由玩家分支拼出，故与 wa-set-devmode 一同移入 player 层。
      'wa-lane-bar', 'wa-lane-all', 'wa-lane-world', 'wa-lane-people', 'wa-lane-story',
'wa-lane-power', 'wa-lane-ui', 'wa-lane-note',
      'wa-set-out'],
      // v2.381.0 收口：**只由 playerSettingsHtml() 拼出**的三枚控件。
      //   它们不是「依赖态」（cond）也不是「动态生成」（dynamic）—— 玩家一进设置页它们就在，
      //   是玩家面稳定的出口。把它们放进 ids 会让「逐页无缺失」在开发者模式下恒假，
      //   放进 cond 又会让「这三种东西为什么有时不在」失去可分辨性。故单列一层。
      player: ['wa-set-devmode', 'wa-set-simple-mode', 'wa-set-simple-save'],
      cond: ['wa-set-tier-rollback', 'wa-prm-find', 'wa-prm-repl', 'wa-prm-add', 'wa-prm-reset', 'wa-prm-import', 'wa-prm-json', 'wa-prm-out'] },
    // v2.33.0: 记忆页 / 注入页——本版把「能力面」第一次接到「呈现面」：memory（92 方法，
    //   全库最大单体）与 timeline（记忆溯源）此前产品 UI 零入口。两页控件一并纳管，
    //   否则「渲染了但绑定写错 id」这类断裂在新增出口上无人发现（同 v2.2.0 设置页教训）。
    { page: 'memory', ids: ['wa-mem-q', 'wa-mem-q-go', 'wa-mem-fact-k', 'wa-mem-fact-v', 'wa-mem-fact-add', 'wa-mem-facts-clear', 'wa-mem-out'] },
    { page: 'enemies', ids: ['wa-en-out'] },
    // v2.34.0: 平行世界页（静态控件；data-pwnrm/data-pwmod 为数据驱动动态按钮，随渲染数量变化，不入静态守卫）
    { page: 'parallel', ids: ['wa-pw-enable', 'wa-pw-mode', 'wa-pw-int', 'wa-pw-dice', 'wa-pw-detail', 'wa-pw-save', 'wa-pw-advance', 'wa-pw-prompt', 'wa-pw-block', 'wa-pw-npc-name', 'wa-pw-npc-goal', 'wa-pw-npc-add', 'wa-pw-out', 'wa-pw-snap-label', 'wa-pw-snap-save'],
      cond: [] },
    // v2.45.0: 条目路由控件纳入守卫（否则新控件游离在「渲染↔绑定」一致性校验之外）
    { page: 'inject', ids: ['wa-inj-refresh', 'wa-inj-diag', 'wa-inj-out',
      'wa-er-id', 'wa-er-cond', 'wa-er-add', 'wa-er-clear', 'wa-er-out',
      'wa-er-input', 'wa-er-dry', 'wa-er-apply',
      // v2.46.0: 变量驱动条款（万花筒）控件——同 v2.45.0 的理由：新控件必须同时
      //   在位（渲染 + 绑定 + 守卫登记），否则「按钮渲染了但绑定写错 id」这类断裂
      //   在新增出口上无人发现。
      'wa-ka-id', 'wa-ka-path', 'wa-ka-op', 'wa-ka-add',
      'wa-ka-rule-id', 'wa-ka-rule-when', 'wa-ka-rule-text', 'wa-ka-rule-add',
      'wa-ka-eval', 'wa-ka-clear', 'wa-ka-out',
      // v2.50.0（第三十五面）：三账出口控件——渲染在**注入页**（renderInject），
      //   故必须登记到本组而不是工具页（登记到错页等于守卫永远查不到它们，
      //   而「登记了却在别页」比不登记更坏：它看起来已被覆盖）。
      'wa-fc-plan', 'wa-fc-reset', 'wa-lt-refresh', 'wa-lt-reset',
      // v2.90.0（O3）：每轮执行解释两枚按钮——渲染在**注入页**（renderInject），故登记到本组。
      //   同 v2.50.0 的理由：新控件必须同时「渲染 + 绑定 + 守卫登记」，
      //   登记错页比不登记更坏（看起来已被覆盖，实际永远查不到）。
      'wa-inj-explain', 'wa-inj-explain-all',
      // v2.91.0（O4）：开关两面真值按钮——同 v2.90.0 的理由，渲染在注入页故登记到本组。
      'wa-inj-face',
      // v2.150.0（RP4）：注入价值榜单三枚控件（渲染在**注入页** renderInject，故登记到本组）。
      //   同 v2.50.0 的理由：新控件必须同时「渲染 + 绑定 + 守卫登记」，否则「渲染了但绑定
      //   写错 id」这类断裂在新增出口上无人发现；登记错页比不登记更坏（看起来已被覆盖）。
      'wa-iv-refresh', 'wa-iv-enabled', 'wa-iv-zero', 'wa-iv-max',
      // v2.231.7（回归收口 · 补 v2.231.0 欠账）：楼层结算账六枚（记账开关 / 看范围 / 退回最后一笔 /
      //   从该楼起全退 / 清空记账 / 重置读数）。渲染在**注入页**（renderInject 的「楼层结算账」块），
      //   故登记到本组而不是人物页 —— 同 v2.50.0 / v2.90.0 的理由：登记错页比不登记更坏
      //   （它看起来已被覆盖，而守卫永远查不到它）。
      'wa-fst-on', 'wa-fst-list', 'wa-fst-rollback', 'wa-fst-from', 'wa-fst-reset', 'wa-fst-stat'] },
    // v2.182.0（第二批 O4 / O3）：工具页两块 —— 存储压力面 6 控件 + 性能基线面 6 控件。
    //   同 v2.150.0 的理由：新控件必须同时「渲染 + 绑定 + 守卫登记」，
    //   否则「渲染了但绑定写错 id」这类断裂在新增出口上无人发现（本表是唯一会互相校验的地方）。
    { page: 'tools', ids: [
      // v2.274.0（收口）：三枚能力档位读数**从 overview 组迁来**。它们渲染在工具页
      //   的「能力档位与启用面」折叠段里（`foldSec('tools', 'capability', …)`），
      //   此前登在 overview 组 —— 登记组的 page 是**校验时机**，写错页的后果是
      //   「在错的页上永远报缺失、在对的页上从不被查」，两头都看不见真断裂。
      // v2.274.0（收口 · 二修）：`wa-ca-reasons` **不是静态控件** —— 它由
      //   `on('#wa-ca-audit', …)` 的读数写入（`ctOut(… '<div id="wa-ca-reasons">' …)`），
      //   出厂态没点过「为什么关着」时页面上根本没有这个节点。放进 `ids` 会让
      //   secUi 把它当「无条件渲染控件」逐个 getElementById ⇒ 出厂态必报缺失。
      //   与 wa-cap-out / wa-pbl-out 同形态（面板动态写入的读数出口），故改登 dynamic。
      'wa-ct-live', 'wa-ct-out',
      'wa-cap-enabled', 'wa-cap-oblig', 'wa-cap-water', 'wa-cap-reclaim', 'wa-cap-migrate', 'wa-cap-diag',
        'wa-pbl-enabled', 'wa-pbl-bands', 'wa-pbl-budget', 'wa-pbl-readings', 'wa-pbl-gap', 'wa-pbl-diag'],
      // 读数出口（`wa-*-out`）也在守卫表内，但走 `dynamic` 层而不是 `ids` 层：
      //   它们由面板**动态写入**（`o.innerHTML = ...`），id 出现在渲染 HTML 里却不是静态控件节点。
      //   放进 `ids` 会让 secUi 的「无条件渲染控件」判据把它们当按钮数（口径混），
      //   放进 `dynamic` 才是它们的真实形态（与 wa-ag-out / wa-iv-out 同规格）。
      dynamic: ['wa-ca-reasons', 'wa-cap-out', 'wa-pbl-out'] },
    // v2.182.0（第二批 O5 / E2 / E5）：健康页三块 —— 12 控件。
    //   三块合页（健康中心 / 世界日程 / 世界纪事），登记到 health 页；
    //   登记错页比不登记更坏（看起来已被覆盖，实际永远查不到）。
    // v2.227.0 收口:全量回归「panel 渲染的每个控件都在守卫表内」抓到 14 枚**已渲染 +
    //   已绑定、却从未登记**的控件(v2.182.0 / v2.187.0 / v2.219.0 三批的欠债;同 v2.2.0 块 8
    //   的病:渲染了不登记 ⇒ 守卫在它身上永不生效)。三枚(看欠账 / 纪事 ref / 看一条纪事)
    //   渲染在 health 页的 wh 块里,故补登到**它们真正所在的那一组**。
    { page: 'health', ids: ['wa-wh-enabled', 'wa-wh-view', 'wa-wh-sources', 'wa-wh-diag', 'wa-wh-drill', 'wa-wh-drill-go',
        'wa-wh-ag-enabled', 'wa-wh-ag-view', 'wa-wh-ag-sources', 'wa-wh-ag-overdue',
        // v2.291.0（EXV7-7）：事件日历两枚读口（事件钟未来轴 / 承诺台账）。
        //   与上面四枚同组同页 —— 它们答的是同一个问题（「接下来」），
        //   但**不共用一枚按钮**：合成一枚之后「事都要跑」与「债要还」在界面上分不开。
        'wa-cal-events', 'wa-cal-commit',
        // v2.292.0（EXV7-8）：世界自传两枚（看 / 导出）。
        //   与上面两枚同组同页（都在健康页的世界侧读数块里），但**不共用一枚按钮**：
        //   合成一枚之后「章算错了」与「导不出来」在界面上同形。
        'wa-auto-view', 'wa-auto-export',
        // v2.293.0（EXV7-9）：一键播种两枚。与上面的自传两枚同规 ——
        //   渲染 + 绑定 + 守卫登记三件齐做，否则「按钮渲染了但绑定写错 id」
        //   在新增出口上无人发现。
        'wa-pop-plan', 'wa-pop-seed',
        'wa-wh-cv-enabled', 'wa-wh-cv-view', 'wa-wh-cv-hidden', 'wa-wh-cv-diag',
        'wa-wh-cv-ref', 'wa-wh-cv-entry'],
      // 三块读数出口走 dynamic 层（同上面 tools 页两条的口径）。
      dynamic: ['wa-wh-out', 'wa-wh-ag-out', 'wa-wh-cv-out', 'wa-auto-out',
        // v2.293.0（EXV7-9）：播种输出容器。动态 = 内容由 handler 现场渲染。
        'wa-pop-out'] },
    // v2.183.0（第一批 E1）：统一待办事项中心 —— 7 静态控件 + 1 动态读数出口。
    //   与上一组同登记到 health 页（本模块的区块渲染在健康页里，与三块合页同规格）。
    //   登记错页比不登记更坏（看起来已被覆盖，实际永远查不到）。
    { page: 'health', ids: ['wa-pc-enabled', 'wa-pc-view', 'wa-pc-soon', 'wa-pc-sources', 'wa-pc-diag', 'wa-pc-drill', 'wa-pc-drill-go', 'wa-pc-timeline'],
      dynamic: ['wa-pc-out'] },
    // v2.187.0（E4）：战役层 —— 6 静态控件 + 1 动态读数出口（同 health 页其余区块规格）。
    //   登记错页比不登记更坏（看起来已被覆盖，实际永远查不到）。
    //   v2.227.0 收口:自定义计划那四枚(id / 计划库 / 看结构 / 删掉)渲染在同一块里,
    //   此前漏登记 ⇒ 补进本组(登记错页比不登记更坏,故不另起一组)。
    { page: 'health', ids: ['wa-cp-enabled', 'wa-cp-scene', 'wa-cp-start', 'wa-cp-advance', 'wa-cp-status', 'wa-cp-review', 'wa-cp-reset',
        'wa-cp-planid', 'wa-cp-planlist', 'wa-cp-planshow', 'wa-cp-plandel'],
      dynamic: ['wa-cp-out'] },
    // v2.187.0（E6）：统一地图与关系视图 —— 7 静态控件 + 1 动态读数出口。
    //   渲染在**世界页**（与远方世界脉搏同页同族：都答「外面有什么」），故与 farfield
    //   那一段同页登记。**登记错页比不登记更坏**（看起来已被覆盖，实际永远查不到）。
    { page: 'world', ids: ['wa-at-enabled', 'wa-at-view', 'wa-at-places', 'wa-at-routes', 'wa-at-rel', 'wa-at-unplaced', 'wa-at-diag'],
      dynamic: ['wa-at-out'] },
    // v2.245.0 (MAP-1 & MAP-2): 空间位置感知与视口控制 —— 5 静态控件 + 1 动态读数出口
    { page: 'world', ids: ['wa-geo-locs', 'wa-geo-feed', 'wa-geo-sample', 'wa-geo-diag', 'wa-geo-svg',
      // v2.328.0 - v2.330.0 (V15 & V16): 超级物理地图高级控件 (拓扑/通勤/遮蔽/物证/HUD/全景大盘)
      'wa-geo-adv-topo', 'wa-geo-adv-transit', 'wa-geo-adv-occl', 'wa-geo-adv-trace', 'wa-geo-adv-hud', 'wa-phys-v16-dash'],
      dynamic: ['wa-geo-out'] },
    // v2.187.0（E8）：依赖体检与迁移助手 —— 8 静态控件 + 1 动态读数出口。
    //   渲染在**工具页**（与种子库 / 蓝图同页同族：三者都在「把世界搬走 / 搬来」这条线上），
    //   故与 wa-ws-* / wa-bp-* 两段同页登记。**登记错页比不登记更坏**（看起来已被覆盖，实际永远查不到）。
    { page: 'tools', ids: ['wa-dc-enabled', 'wa-dc-kind', 'wa-dc-in', 'wa-dc-use', 'wa-dc-check',
      'wa-dc-plan', 'wa-dc-catalog', 'wa-dc-diag'], dynamic: ['wa-dc-out'] },
    // v2.188.0（E7）：规则包与自动化模板 —— 8 静态控件 + 1 动态读数出口。
    //   渲染在**工具页**（与设置面同页族：规则包存的就是设置。放别的页会让「切一套规则」
    //   与「那套规则在哪」分家）。**登记错页比不登记更坏**（看起来已被覆盖，实际永远查不到）。
    { page: 'tools', ids: ['wa-rp-enabled', 'wa-rp-name', 'wa-rp-save', 'wa-rp-list', 'wa-rp-apply',
      'wa-rp-drop', 'wa-rp-export', 'wa-rp-import', 'wa-rp-tpl', 'wa-rp-tpl-list', 'wa-rp-tpl-run',
      'wa-rp-catalog', 'wa-rp-diag',
      // v2.203.0（Y8）：说明框 + 查冲突 / 开档定档 / 能不能启用 / 强制启用 / 回滚一步 / 回滚栈
      'wa-rp-note', 'wa-rp-check', 'wa-rp-compose', 'wa-rp-admit', 'wa-rp-force', 'wa-rp-rollback', 'wa-rp-history'],
      dynamic: ['wa-rp-out'] },
    // v2.188.0（E9）：世界实验室 —— 8 静态控件 + 1 动态读数出口。
    //   渲染在**工具页**（与试演 / 分支树同页族：三者都在「先看看会怎样、再决定」这条线上）。
    // v2.224.0(N8):分支语义比较与选择性移植。同 v2.2.0 块 8 的理由 ——
    //   「渲染了但绑定写错 id」这类断裂只有在守卫登记过的控件上才会被发现。
    //   控件单点渲染于新页 branchdiff（不落 tools 页——同一组 id 落两页会让「重复渲染」看上去像正常）。
    //   v2.227.0 收口:本页那只读数出口 wa-bd-out 此前未登记(它是动态层,不是按钮 ——
    //   与 wa-wl-out / wa-rp-out 同规格,落 dynamic 而非静态 ids)。
    { page: 'branchdiff', ids: ['wa-bd-enabled', 'wa-bd-history', 'wa-bd-a', 'wa-bd-b', 'wa-bd-diff',
      'wa-bd-base', 'wa-bd-tri', 'wa-bd-cat', 'wa-bd-src', 'wa-bd-dst', 'wa-bd-classes', 'wa-bd-plan', 'wa-bd-stat'],
      dynamic: ['wa-bd-out'] },
    // v2.227.0(N9):三项目剧情事件闭环。**三件齐做** —— 引擎落盘 + 面板渲染 + 面板绑定**还不够**:
    //   控件还必须进**这张守卫表**。谓词:渲染 + 绑定 + 登记三件缺一,「id 写错 / 绑定写错页」这类
    //   断裂在 G18 逐页点击盘查里就**永不可见而门禁全绿**(N7/N8 两轮各自踩过同一形态)。
    //   本页八枚:一枚复选框(onchange)+ 四枚按钮(onclick)+ 两个输入框 + 一个动态读数出口。
    { page: 'storyloop', ids: ['wa-sl-enabled', 'wa-sl-contracts', 'wa-sl-audit', 'wa-sl-stat', 'wa-sl-reset',
      'wa-sl-cause', 'wa-sl-cand', 'wa-sl-op', 'wa-sl-confirm', 'wa-sl-trace'], dynamic: ['wa-sl-out', 'wa-sl-edges'] },
    // v2.228.0(N10):历史留存与检索。同 N7/N8/N9 规格 —— 渲染 + 绑定 + 守卫登记三件齐做：
    //   渲染了不登记,「id 写错 / 绑定写错页」这类断裂在 G18 逐页点击盘查里永不可见而门禁全绿。
    //   本页九枚: 一枚复选框(onchange) + 六枚按钮(onclick) + 两个输入框;
    //   两个动态面(边契约行与读数出口)落 dynamic。
    { page: 'retrieval', ids: ['wa-rt-enabled', 'wa-rt-contracts', 'wa-rt-audit', 'wa-rt-stat', 'wa-rt-reset',
      'wa-rt-text', 'wa-rt-cand', 'wa-rt-key', 'wa-rt-history'], dynamic: ['wa-rt-out', 'wa-rt-edges'] },
    { page: 'tools', ids: ['wa-wl-enabled', 'wa-wl-a', 'wa-wl-b', 'wa-wl-run', 'wa-wl-arms',
      'wa-wl-diff', 'wa-wl-export', 'wa-wl-discard', 'wa-wl-catalog', 'wa-wl-diag',
      // v2.203.0（Y9）：推几轮 / 沙盒推进 / 结果报告 / 采纳第几条 / 采纳这一条 / 拍引擎推演
      'wa-wl-rounds', 'wa-wl-sim', 'wa-wl-report', 'wa-wl-index', 'wa-wl-adopt', 'wa-wl-beats',
      // v2.223.0(N7):适配器表(逐模块隔离判定)+ 推几轮输入框 + 多引擎推进。
      //   同样「渲染 + 绑定 + 守卫登记」三件齐做 —— 渲染了不登记,id 写错就永不可见。
      'wa-wl-adapters', 'wa-wl-advrounds', 'wa-wl-advance'],
      dynamic: ['wa-wl-out'] },
    // v2.200.0（Y5）：搬运页 17 静态控件 + 1 动态读数出口 —— 面板「搬运」页。
    //   与 Y1/Y2/Y4 同口径「渲染 + 绑定 + 守卫登记」三件齐做：渲染了不登记 =>
    //   「渲染了但绑定的 id 写错」在这批控件上永不可见。
    //   id 前缀 wa-wps- 是**独占**的（首版即按独占前缀写，避开 Y2 那次 wa-cw-* 撞车
    //   导致 const cwOut 同作用域重复声明的坑）。
    //   本表 active = !cur || grp.page === cur 只判「在不在场」：两页若共用 id，
    //   两个分组会各自「通过」，而玩家点到的是另一页的 handler —— 故本页 17 枚 id
    //   全库唯一这一条由 Y5 专锁 A 段核。
    //   写口只有两处（wa-wps-import 走 store.transact、wa-wps-drop 只动快照库），
    //   其余全为只读；守卫表只保证「渲染 <-> 绑定」成对，只读承诺由 Y5 专锁判。
    { page: 'port', ids: ['wa-wps-snap', 'wa-wps-json', 'wa-wps-check', 'wa-wps-preview',
      'wa-wps-mode', 'wa-wps-conf', 'wa-wps-ovr', 'wa-wps-import',
      'wa-wps-lib', 'wa-wps-slot', 'wa-wps-take', 'wa-wps-drop',
      'wa-wps-blue', 'wa-wps-graph', 'wa-wps-round', 'wa-wps-diag', 'wa-wps-text'],
      dynamic: ['wa-wps-out'] },
    // ── v2.201.0（Y6）：检索页（find）────────────────────────────────
    //   「世界历史检索」的一个入口查六处（编年史 / 人物 / 地点 / 组织 / 规则 /
    //   世界书条目）。本页 12 枚静态控件 + 1 枚动态出口，全部登记在此。
    //   同 v2.184.0 / v2.197.0 / v2.200.0 的理由：新控件必须「渲染 + 绑定 +
    //   守卫登记」三件齐做，否则「控件渲染了但绑定的 id 写错」在新增出口上无人发现。
    //   id 前缀 `wa-hs-` 是**独占**的（首版即按独占前缀写，避开 Y2 那次 wa-cw-* 撞车
    //   导致 const cwOut 同作用域重复声明的坑）。
    //   本表 active = !cur || grp.page === cur 只判「在不在场」：两页若共用 id，
    //   两个分组会各自「通过」，而玩家点到的是另一页的 handler —— 故本页 12 枚 id
    //   全库唯一这一条由 Y6 专锁 A 段核。
    //   写口只有一处（wa-hs-clear 只动本模块那一格 localStorage 偏好键）与
    //   wa-hs-go 的「记进最近查询」勾选（同一格键）；世界一格未动，
    //   「不写 store / 不产生写入」这条承诺由 Y6 专锁 C 段判。
    { page: 'find', ids: ['wa-hs-q', 'wa-hs-go', 'wa-hs-count', 'wa-hs-face',
      'wa-hs-limit', 'wa-hs-remember', 'wa-hs-recent', 'wa-hs-clear',
      'wa-hs-filters', 'wa-hs-jumpface', 'wa-hs-diag'],
      dynamic: ['wa-hs-out'] },
    // ── v2.202.0（Y7）：图谱页（graph）──────────────────────────────────
    //   「地图与关系可视化」—— 三类节点（人物 / 组织 / 地点）+ 三条边来源
    //   （atlas 关系两层 / factionGraph 推导 / bonds 登记六型）放进同一幅画面。
    //   本页 11 枚静态控件 + 1 枚动态出口，全部登记在此。
    //   与其他页不同的地方：**本页一个写口都没有**（对比 find 页的「记进最近查询 /
    //   清空记录」）。全页按钮走只读读口，偏好键只由引擎 setSettings 暴露给设置页 ——
    //   这是边界 ④「零写入」的**结构**保证，不是一句声明（Y7 专锁 C 段另钉不变式）。
    //   控件前缀 `wa-wg-` 独占（渲染 + 绑定 + 守卫登记三件齐做）。
    { page: 'graph', ids: ['wa-wg-kinds', 'wa-wg-edges', 'wa-wg-build', 'wa-wg-from',
      'wa-wg-geo', 'wa-wg-time', 'wa-wg-suggest', 'wa-wg-anom',
      'wa-wg-locate', 'wa-wg-locate-go', 'wa-wg-diag'],
      dynamic: ['wa-wg-out'] },
    // v2.210.0（拓展 8）：行动与行程工作台（engines/travel-desk.js）。
    //   新出口必须进本表 —— 缺登记时「控件渲染了但绑定 id 写错」这类断裂在
    //   新出口上无人发现（本表是「渲染 ↔ 绑定」两面里唯一会互相校验的地方）。
    //   与 graph 页同规：本页一个直接写世界的调用都没有，唯一写路径是 commit()，
    //   而它调的是来源模块自己的公开写口（结构保证，不是一句声明）。
    //   v2.227.0 收口:N5 的多站路线 / 会合时窗六枚(途经点 / 停留 / 排路线 / 会合方 /
    //   时窗 / 排会合)渲染在本页,此前漏登记 ⇒ 补进本组。
    { page: 'travel', ids: ['wa-trip-ch', 'wa-trip-from', 'wa-trip-to',
      'wa-trip-plan', 'wa-trip-verify', 'wa-trip-ledger', 'wa-trip-dia',
      'wa-trip-who', 'wa-trip-act', 'wa-trip-commit',
      'wa-trip-stops', 'wa-trip-dwell', 'wa-trip-route',
      'wa-trip-meet', 'wa-trip-win', 'wa-trip-meet-go'],
      dynamic: ['wa-trip-out'] }
    ,
    // v2.221.0（拓展 N3）：经营供应链（engines/supply-chain.js）。
    //   新出口必须进本表 —— 缺登记时「控件渲染了但绑定 id 写错」这类断裂在
    //   新出口上无人发现（本表是「渲染 ↔ 绑定」两面里唯一会互相校验的地方）。
    //   与 travel 页同规：本页一个直接写世界的调用都没有，唯一写路径是 commit()，
    //   而它调的是来源模块自己的公开写口（结构保证，不是一句声明）。
    { page: 'supply', ids: ['wa-schain-order', 'wa-schain-plan', 'wa-schain-bottleneck',
      'wa-schain-verify', 'wa-schain-dia', 'wa-schain-who', 'wa-schain-commit'],
      dynamic: ['wa-schain-out'] }
    ,
    // v2.222.0（拓展 N4）：调查证据工作台（engines/evidence-board.js）。
    //   新出口必须进本表 —— 缺登记时「控件渲染了但绑定 id 写错」这类断裂在
    //   新出口上无人发现（本表是「渲染 ↔ 绑定」两面里唯一会互相校验的地方）。
    //   与 supply / travel 页同规：本页一个直接写世界的调用都没有，三条写路径都是
    //   来源模块自己的公开写口（结构保证，不是一句声明）。
    { page: 'evidence', ids: ['wa-evb-enabled', 'wa-evb-case', 'wa-evb-person', 'wa-evb-facts',
      'wa-evb-board', 'wa-evb-view', 'wa-evb-dia', 'wa-evb-claim', 'wa-evb-level', 'wa-evb-dir',
      'wa-evb-assert', 'wa-evb-kind', 'wa-evb-target', 'wa-evb-from', 'wa-evb-to', 'wa-evb-retract',
      'wa-evb-clue', 'wa-evb-by', 'wa-evb-receipt', 'wa-evb-gather'],
      dynamic: ['wa-evb-out'] }
    ,
    // v2.231.0 (OP-1): actiondesk page -- ids + dynamic out.
    //   同 evidence 页口径：本页不另存状态，写路径转给来源模块。
    { page: 'actiondesk', ids: ['wa-desk-who', 'wa-desk-show', 'wa-desk-on',
      // v2.250.0：跨轮生命周期四枚此前**渲染了但没登记**（守卫表照不到 ⇒ 绑定断了也永远不报），
      //   连同四个输出容器一起补登。输出容器仍是动态容器（由 show* 回调填，非静态成树）。
      'wa-desk-life', 'wa-desk-flow', 'wa-desk-sched', 'wa-desk-epistemic', 'wa-desk-v14-multi', 'wa-desk-v14-sanctuary', 'wa-desk-v14-crisis', 'wa-desk-v14-pact',
      'wa-desk-v15-offstage', 'wa-desk-v15-eccentric', 'wa-desk-v16-realism', 'wa-desk-v16-grudge',
      // v2.380.0（幽灵引用治理批次⑦）：概览降噪把 8 个纯读诊断按钮收进两个 <details>，
      //   两个容器 id 渲染在 actiondesk 页的静态模板里（不是回调拼接），故进 ids 档而不是
      //   dynamic：容器一进页就在，只是里面默认收起。
      'wa-desk-tactical-fold', 'wa-desk-somatic-fold'],
      dynamic: ['wa-desk-out', 'wa-desk-life-out', 'wa-desk-flow-out', 'wa-desk-sched-out', 'wa-desk-epistemic-out', 'wa-desk-v14-out', 'wa-desk-v15-out', 'wa-desk-v16-out', ''] },
    { page: 'health', ids: ['wa-periodical-id', 'wa-periodical-name', 'wa-periodical-days', 'wa-periodical-profile', 'wa-periodical-enabled',
      'wa-periodical-config', 'wa-periodical-publish', 'wa-periodical-read'],
      dynamic: ['wa-periodical-out'] },
    // v2.522.0（本轮补齐）：v2.517.0（世界脉搏）/ v2.518.0（UI-P1 玩家面）两批引入的页模块渲染了 8 个控件，
    //   但从未进过本表 —— 全量回归里「panel 渲染的每个控件都在守卫表内」当场报 8 枚未覆盖
    //   （wa-now-back-chat / wa-legacy-readings / wa-people-legacy / wa-sw-* 五枚）。
    //   分层依据是**渲染条件**，不是想当然：一律塞进 ids 会让 secUi 在「开发者面 / 无玩家卡」
    //   把它们报成缺失 —— 而那是**正确的缺席**（一个不该在场的控件「在场」才是漏洞）。
    //   · wa-sw-* 五枚：panel.js renderEvents 里的静态模板（「故事回应窗口」段），无条件渲染 ⇒ events / ids；
    //   · wa-legacy-readings：只在「有『此刻』卡」时才被包进 <details> ⇒ overview / cond；
    //   · wa-now-back-chat / wa-people-legacy：玩家面专有（开发者面不渲染）⇒ overview / people 的 player 层。
    { page: 'events', ids: ['wa-sw-enabled', 'wa-sw-capacity', 'wa-sw-traces', 'wa-sw-view', 'wa-sw-evidence'] },
    { page: 'overview', ids: [], cond: ['wa-legacy-readings'], player: ['wa-now-back-chat'] },
    { page: 'people', ids: [], player: ['wa-people-legacy'] }
  ];

  /* ── v2.230.0（拓展 N12 接线面）：26 枚新引擎的端口表与只读采集节 ────────
   *   它治什么：本批 26 枚新引擎的 305 项导出，此前**产品侧零引用** ——
   *   tests/dead-export-gate.js 的冻结面上有 305 条（本仓口径：产品代码零引用即死）。
   *   本仓既有裁决是「要么显式 --update 登记冻结、要么给导出接上消费方、要么删掉」，
   *   本版取第二条 —— **真接线**，不做冻结放行。
   *
   *   消费方两条（本批全部 305 项都落在其中一条上，无一遗漏）：
   *     ① read 口（88 项，零参只读）：由下面 secEngines230() 每次采集**真调**，
   *        读数直接进诊断包（与 secStitch2129 / secStitch2130 同规）；
   *     ② act 口（217 项，待参/写口）：由面板「引擎台」页 invokePort() 真调 ——
   *        诊断节**刻意不调它们**（写口不由诊断代替操作者触发，同「只报读数、不写世界」纪律）。
   *
   *   为什么表里逐字写全 `WA.<ns>.<mem>`：死子面判据只认字面形态，
   *   「存进局部变量再调」在静态面上仍是产品零引用（与 ui/panel.js 的 esc() 同规注释同因）。
   */
  // ---- v2.230.0 (N12) 26 engines port table ----
  const ENGINE_PORTS = {
    // autoHide: read 4 / act 7
    autoHide: {
      read: {
        getSettings: function () { return WA.autoHide.getSettings(); },
        list: function () { return WA.autoHide.list(); },
        stat: function () { return WA.autoHide.stat(); },
        view: function () { return WA.autoHide.view(); }
      },
      act: {
        clear: function (a) { return WA.autoHide.clear.apply(null, a || []); },
        isHidden: function (a) { return WA.autoHide.isHidden.apply(null, a || []); },
        mark: function (a) { return WA.autoHide.mark.apply(null, a || []); },
        plan: function (a) { return WA.autoHide.plan.apply(null, a || []); },
        resetStat: function (a) { return WA.autoHide.resetStat.apply(null, a || []); },
        revoke: function (a) { return WA.autoHide.revoke.apply(null, a || []); },
        setSettings: function (a) { return WA.autoHide.setSettings.apply(null, a || []); }
      }
    },
    // backstageTone: read 3 / act 12
    backstageTone: {
      read: {
        getSettings: function () { return WA.backstageTone.getSettings(); },
        stat: function () { return WA.backstageTone.stat(); },
        view: function () { return WA.backstageTone.view(); }
      },
      act: {
        era: function (a) { return WA.backstageTone.era.apply(null, a || []); },
        noteAdd: function (a) { return WA.backstageTone.noteAdd.apply(null, a || []); },
        noteClear: function (a) { return WA.backstageTone.noteClear.apply(null, a || []); },
        noteList: function (a) { return WA.backstageTone.noteList.apply(null, a || []); },
        numToZh: function (a) { return WA.backstageTone.numToZh.apply(null, a || []); },
        parseShichen: function (a) { return WA.backstageTone.parseShichen.apply(null, a || []); },
        reset: function (a) { return WA.backstageTone.reset.apply(null, a || []); },
        setSettings: function (a) { return WA.backstageTone.setSettings.apply(null, a || []); },
        shichen: function (a) { return WA.backstageTone.shichen.apply(null, a || []); },
        socialHint: function (a) { return WA.backstageTone.socialHint.apply(null, a || []); },
        voiceCheck: function (a) { return WA.backstageTone.voiceCheck.apply(null, a || []); },
        zhNum: function (a) { return WA.backstageTone.zhNum.apply(null, a || []); }
      }
    },
    // beat: read 3 / act 10
    beat: {
      read: {
        getSettings: function () { return WA.beat.getSettings(); },
        stat: function () { return WA.beat.stat(); },
        view: function () { return WA.beat.view(); }
      },
      act: {
        bandOf: function (a) { return WA.beat.bandOf.apply(null, a || []); },
        categoryOf: function (a) { return WA.beat.categoryOf.apply(null, a || []); },
        extract: function (a) { return WA.beat.extract.apply(null, a || []); },
        hue: function (a) { return WA.beat.hue.apply(null, a || []); },
        parseOrExtract: function (a) { return WA.beat.parseOrExtract.apply(null, a || []); },
        repair: function (a) { return WA.beat.repair.apply(null, a || []); },
        reset: function (a) { return WA.beat.reset.apply(null, a || []); },
        setSettings: function (a) { return WA.beat.setSettings.apply(null, a || []); },
        validateId: function (a) { return WA.beat.validateId.apply(null, a || []); },
        validateList: function (a) { return WA.beat.validateList.apply(null, a || []); }
      }
    },
    // communityNote: read 4 / act 8
    communityNote: {
      read: {
        getSettings: function () { return WA.communityNote.getSettings(); },
        pending: function () { return WA.communityNote.pending(); },
        stat: function () { return WA.communityNote.stat(); },
        view: function () { return WA.communityNote.view(); }
      },
      act: {
        ack: function (a) { return WA.communityNote.ack.apply(null, a || []); },
        clear: function (a) { return WA.communityNote.clear.apply(null, a || []); },
        isSeen: function (a) { return WA.communityNote.isSeen.apply(null, a || []); },
        list: function (a) { return WA.communityNote.list.apply(null, a || []); },
        markSeen: function (a) { return WA.communityNote.markSeen.apply(null, a || []); },
        push: function (a) { return WA.communityNote.push.apply(null, a || []); },
        resetStat: function (a) { return WA.communityNote.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.communityNote.setSettings.apply(null, a || []); }
      }
    },
    // compare: read 3 / act 9
    compare: {
      read: {
        getSettings: function () { return WA.compare.getSettings(); },
        stat: function () { return WA.compare.stat(); },
        view: function () { return WA.compare.view(); }
      },
      act: {
        diff: function (a) { return WA.compare.diff.apply(null, a || []); },
        hasResidue: function (a) { return WA.compare.hasResidue.apply(null, a || []); },
        merge: function (a) { return WA.compare.merge.apply(null, a || []); },
        reset: function (a) { return WA.compare.reset.apply(null, a || []); },
        setSettings: function (a) { return WA.compare.setSettings.apply(null, a || []); },
        strip: function (a) { return WA.compare.strip.apply(null, a || []); },
        tableOf: function (a) { return WA.compare.tableOf.apply(null, a || []); },
        toLines: function (a) { return WA.compare.toLines.apply(null, a || []); },
        variants: function (a) { return WA.compare.variants.apply(null, a || []); }
      }
    },
    // coordinate: read 5 / act 15
    coordinate: {
      read: {
        getSettings: function () { return WA.coordinate.getSettings(); },
        index: function () { return WA.coordinate.index(); },
        lines: function () { return WA.coordinate.lines(); },
        list: function () { return WA.coordinate.list(); },
        stat: function () { return WA.coordinate.stat(); }
      },
      act: {
        anchorAdd: function (a) { return WA.coordinate.anchorAdd.apply(null, a || []); },
        anchorOf: function (a) { return WA.coordinate.anchorOf.apply(null, a || []); },
        bridgeDump: function (a) { return WA.coordinate.bridgeDump.apply(null, a || []); },
        bridgeLoad: function (a) { return WA.coordinate.bridgeLoad.apply(null, a || []); },
        capture: function (a) { return WA.coordinate.capture.apply(null, a || []); },
        decode: function (a) { return WA.coordinate.decode.apply(null, a || []); },
        encode: function (a) { return WA.coordinate.encode.apply(null, a || []); },
        gateClaim: function (a) { return WA.coordinate.gateClaim.apply(null, a || []); },
        gateClear: function (a) { return WA.coordinate.gateClear.apply(null, a || []); },
        gateRelease: function (a) { return WA.coordinate.gateRelease.apply(null, a || []); },
        gateSuppressed: function (a) { return WA.coordinate.gateSuppressed.apply(null, a || []); },
        parseLine: function (a) { return WA.coordinate.parseLine.apply(null, a || []); },
        reset: function (a) { return WA.coordinate.reset.apply(null, a || []); },
        setSettings: function (a) { return WA.coordinate.setSettings.apply(null, a || []); },
        view: function (a) { return WA.coordinate.view.apply(null, a || []); }
      }
    },
    // deepClean: read 4 / act 9
    deepClean: {
      read: {
        getSettings: function () { return WA.deepClean.getSettings(); },
        stat: function () { return WA.deepClean.stat(); },
        status: function () { return WA.deepClean.status(); },
        view: function () { return WA.deepClean.view(); }
      },
      act: {
        apply: function (a) { return WA.deepClean.apply.apply(null, a || []); },
        digest: function (a) { return WA.deepClean.digest.apply(null, a || []); },
        freeze: function (a) { return WA.deepClean.freeze.apply(null, a || []); },
        prepare: function (a) { return WA.deepClean.prepare.apply(null, a || []); },
        reset: function (a) { return WA.deepClean.reset.apply(null, a || []); },
        resetStat: function (a) { return WA.deepClean.resetStat.apply(null, a || []); },
        review: function (a) { return WA.deepClean.review.apply(null, a || []); },
        scan: function (a) { return WA.deepClean.scan.apply(null, a || []); },
        setSettings: function (a) { return WA.deepClean.setSettings.apply(null, a || []); }
      }
    },
    // dream: read 6 / act 7
    dream: {
      read: {
        deviationList: function () { return WA.dream.deviationList(); },
        getSettings: function () { return WA.dream.getSettings(); },
        onset: function () { return WA.dream.onset(); },
        stat: function () { return WA.dream.stat(); },
        view: function () { return WA.dream.view(); },
        volumeList: function () { return WA.dream.volumeList(); }
      },
      act: {
        archive: function (a) { return WA.dream.archive.apply(null, a || []); },
        reset: function (a) { return WA.dream.reset.apply(null, a || []); },
        setSettings: function (a) { return WA.dream.setSettings.apply(null, a || []); },
        threadList: function (a) { return WA.dream.threadList.apply(null, a || []); },
        threadOf: function (a) { return WA.dream.threadOf.apply(null, a || []); },
        volumeGet: function (a) { return WA.dream.volumeGet.apply(null, a || []); },
        weave: function (a) { return WA.dream.weave.apply(null, a || []); }
      }
    },
    // elsewhere: read 5 / act 10
    //   v2.231.0（OPT-2）：**只读口补线**。此前 `view` / `list` 的产品侧唯一消费点是心跳节里
    //   那段「对每个名字调一次无参 view()」的空转循环（那正是本轮治掉的缺陷本身）；OPT-2 把心跳
    //   改成一次 `sweep` 之后，两个读口在产品代码里就只剩定义、没有调用点了 —— 本仓点名的
    //   「导出而零调用点 = 功能级失效」。按既有裁决接进**本表**（ENGINE_PORTS 就是死导出接线的
    //   单一真源，v2.230.0 的 26 枚引擎都走这条路）：read 段只真调**只读**口。
    //   `sweep` 属只读（无 transact、只动计数器）故列 read。
    elsewhere: {
      read: {
        getSettings: function () { return WA.elsewhere.getSettings(); },
        stat: function () { return WA.elsewhere.stat(); },
        list: function () { return WA.elsewhere.list(); },
        view: function () { return WA.elsewhere.view(); },
        sweep: function () { return WA.elsewhere.sweep(); }
      },
      act: {
        bandOf: function (a) { return WA.elsewhere.bandOf.apply(null, a || []); },
        card: function (a) { return WA.elsewhere.card.apply(null, a || []); },
        open: function (a) { return WA.elsewhere.open.apply(null, a || []); },
        reconcile: function (a) { return WA.elsewhere.reconcile.apply(null, a || []); },
        remove: function (a) { return WA.elsewhere.remove.apply(null, a || []); },
        reset: function (a) { return WA.elsewhere.reset.apply(null, a || []); },
        romance: function (a) { return WA.elsewhere.romance.apply(null, a || []); },
        romanceOf: function (a) { return WA.elsewhere.romanceOf.apply(null, a || []); },
        setSettings: function (a) { return WA.elsewhere.setSettings.apply(null, a || []); },
        update: function (a) { return WA.elsewhere.update.apply(null, a || []); }
      }
    },
    // fate: read 4 / act 17（v2.231.0 / OPT-8：judgeView 进只读面 —— 判定维度四态在诊断上要看得见）
    fate: {
      read: {
        getSettings: function () { return WA.fate.getSettings(); },
        stat: function () { return WA.fate.stat(); },
        view: function () { return WA.fate.view(); },
        judgeView: function () { return WA.fate.judgeView(); }
      },
      act: {
        bigrams: function (a) { return WA.fate.bigrams.apply(null, a || []); },
        check: function (a) { return WA.fate.check.apply(null, a || []); },
        deck: function (a) { return WA.fate.deck.apply(null, a || []); },
        dedupe: function (a) { return WA.fate.dedupe.apply(null, a || []); },
        evalArith: function (a) { return WA.fate.evalArith.apply(null, a || []); },
        evalFormula: function (a) { return WA.fate.evalFormula.apply(null, a || []); },
        isArithmeticSyntax: function (a) { return WA.fate.isArithmeticSyntax.apply(null, a || []); },
        jaccard: function (a) { return WA.fate.jaccard.apply(null, a || []); },
        oversample: function (a) { return WA.fate.oversample.apply(null, a || []); },
        parse: function (a) { return WA.fate.parse.apply(null, a || []); },
        reset: function (a) { return WA.fate.reset.apply(null, a || []); },
        resolveCount: function (a) { return WA.fate.resolveCount.apply(null, a || []); },
        resolveDC: function (a) { return WA.fate.resolveDC.apply(null, a || []); },
        roll: function (a) { return WA.fate.roll.apply(null, a || []); },
        setSettings: function (a) { return WA.fate.setSettings.apply(null, a || []); },
        stripHeader: function (a) { return WA.fate.stripHeader.apply(null, a || []); },
        titleGate: function (a) { return WA.fate.titleGate.apply(null, a || []); }
      }
    },
    // floorSnapshot: read 5 / act 10
    floorSnapshot: {
      read: {
        bindings: function () { return WA.floorSnapshot.bindings(); },
        getSettings: function () { return WA.floorSnapshot.getSettings(); },
        list: function () { return WA.floorSnapshot.list(); },
        stat: function () { return WA.floorSnapshot.stat(); },
        view: function () { return WA.floorSnapshot.view(); }
      },
      act: {
        at: function (a) { return WA.floorSnapshot.at.apply(null, a || []); },
        bind: function (a) { return WA.floorSnapshot.bind.apply(null, a || []); },
        byMessage: function (a) { return WA.floorSnapshot.byMessage.apply(null, a || []); },
        clear: function (a) { return WA.floorSnapshot.clear.apply(null, a || []); },
        markCleared: function (a) { return WA.floorSnapshot.markCleared.apply(null, a || []); },
        push: function (a) { return WA.floorSnapshot.push.apply(null, a || []); },
        resetStat: function (a) { return WA.floorSnapshot.resetStat.apply(null, a || []); },
        rollback: function (a) { return WA.floorSnapshot.rollback.apply(null, a || []); },
        setSettings: function (a) { return WA.floorSnapshot.setSettings.apply(null, a || []); },
        unbind: function (a) { return WA.floorSnapshot.unbind.apply(null, a || []); }
      }
    },
    // lengthPolicy: read 3 / act 6
    lengthPolicy: {
      read: {
        getSettings: function () { return WA.lengthPolicy.getSettings(); },
        stat: function () { return WA.lengthPolicy.stat(); },
        view: function () { return WA.lengthPolicy.view(); }
      },
      act: {
        parse: function (a) { return WA.lengthPolicy.parse.apply(null, a || []); },
        parseNumber: function (a) { return WA.lengthPolicy.parseNumber.apply(null, a || []); },
        resetStat: function (a) { return WA.lengthPolicy.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.lengthPolicy.setSettings.apply(null, a || []); },
        targetOf: function (a) { return WA.lengthPolicy.targetOf.apply(null, a || []); },
        tierOf: function (a) { return WA.lengthPolicy.tierOf.apply(null, a || []); }
      }
    },
    // lingqi: read 3 / act 7
    lingqi: {
      read: {
        getSettings: function () { return WA.lingqi.getSettings(); },
        stat: function () { return WA.lingqi.stat(); },
        view: function () { return WA.lingqi.view(); }
      },
      act: {
        listSkills: function (a) { return WA.lingqi.listSkills.apply(null, a || []); },
        normalizeSkill: function (a) { return WA.lingqi.normalizeSkill.apply(null, a || []); },
        register: function (a) { return WA.lingqi.register.apply(null, a || []); },
        resetStat: function (a) { return WA.lingqi.resetStat.apply(null, a || []); },
        route: function (a) { return WA.lingqi.route.apply(null, a || []); },
        seed: function (a) { return WA.lingqi.seed.apply(null, a || []); },
        setSettings: function (a) { return WA.lingqi.setSettings.apply(null, a || []); }
      }
    },
    // memoryTiers: read 3 / act 7
    memoryTiers: {
      read: {
        getSettings: function () { return WA.memoryTiers.getSettings(); },
        stat: function () { return WA.memoryTiers.stat(); },
        view: function () { return WA.memoryTiers.view(); }
      },
      act: {
        clearTier: function (a) { return WA.memoryTiers.clearTier.apply(null, a || []); },
        knot: function (a) { return WA.memoryTiers.knot.apply(null, a || []); },
        list: function (a) { return WA.memoryTiers.list.apply(null, a || []); },
        resetStat: function (a) { return WA.memoryTiers.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.memoryTiers.setSettings.apply(null, a || []); },
        sink: function (a) { return WA.memoryTiers.sink.apply(null, a || []); },
        tierOf: function (a) { return WA.memoryTiers.tierOf.apply(null, a || []); }
      }
    },
    // modelink: read 3 / act 12
    modelink: {
      read: {
        getSettings: function () { return WA.modelink.getSettings(); },
        stat: function () { return WA.modelink.stat(); },
        view: function () { return WA.modelink.view(); }
      },
      act: {
        draftAdd: function (a) { return WA.modelink.draftAdd.apply(null, a || []); },
        draftApply: function (a) { return WA.modelink.draftApply.apply(null, a || []); },
        draftClear: function (a) { return WA.modelink.draftClear.apply(null, a || []); },
        draftList: function (a) { return WA.modelink.draftList.apply(null, a || []); },
        isMvuComment: function (a) { return WA.modelink.isMvuComment.apply(null, a || []); },
        matchEntry: function (a) { return WA.modelink.matchEntry.apply(null, a || []); },
        parseFlow: function (a) { return WA.modelink.parseFlow.apply(null, a || []); },
        reset: function (a) { return WA.modelink.reset.apply(null, a || []); },
        residue: function (a) { return WA.modelink.residue.apply(null, a || []); },
        setSettings: function (a) { return WA.modelink.setSettings.apply(null, a || []); },
        stripArtifacts: function (a) { return WA.modelink.stripArtifacts.apply(null, a || []); },
        updateBlocks: function (a) { return WA.modelink.updateBlocks.apply(null, a || []); }
      }
    },
    // observeSlice: read 3 / act 7
    observeSlice: {
      read: {
        getSettings: function () { return WA.observeSlice.getSettings(); },
        stat: function () { return WA.observeSlice.stat(); },
        view: function () { return WA.observeSlice.view(); }
      },
      act: {
        actionProvesPerception: function (a) { return WA.observeSlice.actionProvesPerception.apply(null, a || []); },
        extractAnchor: function (a) { return WA.observeSlice.extractAnchor.apply(null, a || []); },
        isMicroScene: function (a) { return WA.observeSlice.isMicroScene.apply(null, a || []); },
        isObservationPrompt: function (a) { return WA.observeSlice.isObservationPrompt.apply(null, a || []); },
        resetStat: function (a) { return WA.observeSlice.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.observeSlice.setSettings.apply(null, a || []); },
        slice: function (a) { return WA.observeSlice.slice.apply(null, a || []); }
      }
    },
    // outlineInject: read 4 / act 8
    //   v2.231.0（优化 OPT-7）：执行面进诊断 —— 此前这条链**算得出但做不了**
    //   （plan 的 applied:0 是恒值），诊断面因此看不出「这台宿主到底能不能改旧条目」。
    //   补 read 的 updateCapability（能力探测，纯读宿主 API 存在性、不写任何东西）
    //   与 act 的 apply（唯一写入口；与既有 act 同规，参数由调用方给）。
    //   v2.231.0（OPT-7 收尾）：act 再补 preview（预览差异：读宿主真源、**零写入**）
    //   与 undo（撤销到上一有效版本）。两者与 apply 同规 —— 参数由调用方给、不在此处
    //   代判；「预览」与「写入」分列这件事，在诊断面上也看得见。
    outlineInject: {
      read: {
        getSettings: function () { return WA.outlineInject.getSettings(); },
        stat: function () { return WA.outlineInject.stat(); },
        updateCapability: function () { return !!WA.outlineInject.updateCapability(WA.mainWin && WA.mainWin.TavernHelper ? WA.mainWin.TavernHelper : (typeof TavernHelper !== 'undefined' ? TavernHelper : null)); },
        view: function () { return WA.outlineInject.view(); }
      },
      act: {
        apply: function (a) { return WA.outlineInject.apply.apply(null, a || []); },
        extractFromEnd: function (a) { return WA.outlineInject.extractFromEnd.apply(null, a || []); },
        parseEntries: function (a) { return WA.outlineInject.parseEntries.apply(null, a || []); },
        plan: function (a) { return WA.outlineInject.plan.apply(null, a || []); },
        preview: function (a) { return WA.outlineInject.preview.apply(null, a || []); },
        resetStat: function (a) { return WA.outlineInject.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.outlineInject.setSettings.apply(null, a || []); },
        undo: function (a) { return WA.outlineInject.undo.apply(null, a || []); }
      }
    },
    // portal: read 4 / act 7
    portal: {
      read: {
        getSettings: function () { return WA.portal.getSettings(); },
        stat: function () { return WA.portal.stat(); },
        status: function () { return WA.portal.status(); },
        view: function () { return WA.portal.view(); }
      },
      act: {
        claim: function (a) { return WA.portal.claim.apply(null, a || []); },
        digest: function (a) { return WA.portal.digest.apply(null, a || []); },
        release: function (a) { return WA.portal.release.apply(null, a || []); },
        reset: function (a) { return WA.portal.reset.apply(null, a || []); },
        resetStat: function (a) { return WA.portal.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.portal.setSettings.apply(null, a || []); },
        signature: function (a) { return WA.portal.signature.apply(null, a || []); }
      }
    },
    // prefilterGate: read 4 / act 8
    prefilterGate: {
      read: {
        getSettings: function () { return WA.prefilterGate.getSettings(); },
        roster: function () { return WA.prefilterGate.roster(); },
        stat: function () { return WA.prefilterGate.stat(); },
        view: function () { return WA.prefilterGate.view(); }
      },
      act: {
        alias: function (a) { return WA.prefilterGate.alias.apply(null, a || []); },
        clearRoster: function (a) { return WA.prefilterGate.clearRoster.apply(null, a || []); },
        parseReply: function (a) { return WA.prefilterGate.parseReply.apply(null, a || []); },
        register: function (a) { return WA.prefilterGate.register.apply(null, a || []); },
        resetStat: function (a) { return WA.prefilterGate.resetStat.apply(null, a || []); },
        resolveName: function (a) { return WA.prefilterGate.resolveName.apply(null, a || []); },
        screen: function (a) { return WA.prefilterGate.screen.apply(null, a || []); },
        setSettings: function (a) { return WA.prefilterGate.setSettings.apply(null, a || []); }
      }
    },
    // reasoningStrip: read 3 / act 5
    reasoningStrip: {
      read: {
        getSettings: function () { return WA.reasoningStrip.getSettings(); },
        stat: function () { return WA.reasoningStrip.stat(); },
        view: function () { return WA.reasoningStrip.view(); }
      },
      act: {
        hasIncomplete: function (a) { return WA.reasoningStrip.hasIncomplete.apply(null, a || []); },
        resetStat: function (a) { return WA.reasoningStrip.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.reasoningStrip.setSettings.apply(null, a || []); },
        strip: function (a) { return WA.reasoningStrip.strip.apply(null, a || []); },
        trailingPartialTagLength: function (a) { return WA.reasoningStrip.trailingPartialTagLength.apply(null, a || []); }
      }
    },
    // redactLayer: read 3 / act 5
    redactLayer: {
      read: {
        getSettings: function () { return WA.redactLayer.getSettings(); },
        stat: function () { return WA.redactLayer.stat(); },
        view: function () { return WA.redactLayer.view(); }
      },
      act: {
        isSecretPath: function (a) { return WA.redactLayer.isSecretPath.apply(null, a || []); },
        probe: function (a) { return WA.redactLayer.probe.apply(null, a || []); },
        redact: function (a) { return WA.redactLayer.redact.apply(null, a || []); },
        resetStat: function (a) { return WA.redactLayer.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.redactLayer.setSettings.apply(null, a || []); }
      }
    },
    // relationGraph: read 6 / act 10
    //   v2.231.0（OPT-6）：read 面新增 persisted / directedOf / reload —— 「存档里到底落了几条」
    //   与「A→B 的方向立场」此前在诊断面上都不可读（内存表自称的那份数不等于存档那份）。
    relationGraph: {
      read: {
        getSettings: function () { return WA.relationGraph.getSettings(); },
        stat: function () { return WA.relationGraph.stat(); },
        persisted: function () { return WA.relationGraph.persisted(); },
        directedOf: function (a) { return WA.relationGraph.directedOf.apply(null, a || []); },
        reload: function () { return WA.relationGraph.reload(); },
        view: function () { return WA.relationGraph.view(); }
      },
      act: {
        clear: function (a) { return WA.relationGraph.clear.apply(null, a || []); },
        edgeIdOf: function (a) { return WA.relationGraph.edgeIdOf.apply(null, a || []); },
        edgesOf: function (a) { return WA.relationGraph.edgesOf.apply(null, a || []); },
        get: function (a) { return WA.relationGraph.get.apply(null, a || []); },
        list: function (a) { return WA.relationGraph.list.apply(null, a || []); },
        remove: function (a) { return WA.relationGraph.remove.apply(null, a || []); },
        resetStat: function (a) { return WA.relationGraph.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.relationGraph.setSettings.apply(null, a || []); },
        upsert: function (a) { return WA.relationGraph.upsert.apply(null, a || []); }
      }
    },
    // scopeTag: read 3 / act 4
    scopeTag: {
      read: {
        getSettings: function () { return WA.scopeTag.getSettings(); },
        stat: function () { return WA.scopeTag.stat(); },
        view: function () { return WA.scopeTag.view(); }
      },
      act: {
        parse: function (a) { return WA.scopeTag.parse.apply(null, a || []); },
        rangesOf: function (a) { return WA.scopeTag.rangesOf.apply(null, a || []); },
        resetStat: function (a) { return WA.scopeTag.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.scopeTag.setSettings.apply(null, a || []); }
      }
    },
    // soloVoice: read 3 / act 6
    soloVoice: {
      read: {
        getSettings: function () { return WA.soloVoice.getSettings(); },
        stat: function () { return WA.soloVoice.stat(); },
        view: function () { return WA.soloVoice.view(); }
      },
      act: {
        brief: function (a) { return WA.soloVoice.brief.apply(null, a || []); },
        check: function (a) { return WA.soloVoice.check.apply(null, a || []); },
        countQuestions: function (a) { return WA.soloVoice.countQuestions.apply(null, a || []); },
        labelWeight: function (a) { return WA.soloVoice.labelWeight.apply(null, a || []); },
        resetStat: function (a) { return WA.soloVoice.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.soloVoice.setSettings.apply(null, a || []); }
      }
    },
    // vitals: read 5 / act 11
    //   v2.231.0（OPT-4）：**只读口补线**（与 elsewhere 同款、同批）。`view` / `list` / `phaseOf`
    //   此前的产品侧唯一消费点是心跳节里逐个名字调 `view()` 的空转循环；OPT-4 改成按剧情日差
    //   一次 `sweep` 之后它们成了零引用。此处接进诊断采集面，使「扫到了什么」（sweep）与
    //   「单点现在是什么样」（view / list / phaseOf）在同一个读数面上分得开。
    //   ⚠ `sweep` 放 **act**：它会按剧情日差推进身体状态（写口），诊断采集**不许**替操作者触发。
    //     这与 elsewhere.sweep 放 read 是**故意不同**，不是笔误 —— 那边只报账，这边会改状态。
    vitals: {
      read: {
        getSettings: function () { return WA.vitals.getSettings(); },
        stat: function () { return WA.vitals.stat(); },
        list: function () { return WA.vitals.list(); },
        view: function () { return WA.vitals.view(); },
        phaseOf: function () { return WA.vitals.phaseOf(0, 28); }
      },
      act: {
        conceive: function (a) { return WA.vitals.conceive.apply(null, a || []); },
        endPregnancy: function (a) { return WA.vitals.endPregnancy.apply(null, a || []); },
        know: function (a) { return WA.vitals.know.apply(null, a || []); },
        knows: function (a) { return WA.vitals.knows.apply(null, a || []); },
        knowsOthers: function (a) { return WA.vitals.knowsOthers.apply(null, a || []); },
        register: function (a) { return WA.vitals.register.apply(null, a || []); },
        reset: function (a) { return WA.vitals.reset.apply(null, a || []); },
        setSettings: function (a) { return WA.vitals.setSettings.apply(null, a || []); },
        sweep: function (a) { return WA.vitals.sweep.apply(null, a || []); },
        tell: function (a) { return WA.vitals.tell.apply(null, a || []); },
        tick: function (a) { return WA.vitals.tick.apply(null, a || []); }
      }
    },
    // worldClock: read 3 / act 5
    worldClock: {
      read: {
        getSettings: function () { return WA.worldClock.getSettings(); },
        stat: function () { return WA.worldClock.stat(); },
        view: function () { return WA.worldClock.view(); }
      },
      act: {
        inspectEnd: function (a) { return WA.worldClock.inspectEnd.apply(null, a || []); },
        judge: function (a) { return WA.worldClock.judge.apply(null, a || []); },
        parseEnd: function (a) { return WA.worldClock.parseEnd.apply(null, a || []); },
        resetStat: function (a) { return WA.worldClock.resetStat.apply(null, a || []); },
        setSettings: function (a) { return WA.worldClock.setSettings.apply(null, a || []); }
      }
    }
  };

  WA.toolDiagTables = {
    MODULE_EXPORTS: MODULE_EXPORTS, OPTIONAL_EXPORTS: OPTIONAL_EXPORTS,
    UI_BINDINGS: UI_BINDINGS, ENGINE_PORTS: ENGINE_PORTS
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/tool-diag-tables.js', { kind: 'data', ver: '2.529.0' });
  }
})();
