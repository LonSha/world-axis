# WorldAxis 拓展创新计划：EXV13-1 至 EXV13-9
> **工程归属**：WorldAxis 活世界引擎系统 (`/home/user/wa_opt1`)  
> **基线**：`v2.301.0` / commit `296c258`  
> **状态**：`proposed`（2026-11-06 立）  
> **目标**：以现有引擎与调度桌为底座，交付物理具身空间感知、自传心路重构、跨阵营史料对照、代际遗产债务、地理传闻漂移、民俗禁忌狂欢、潜意识微反应、反事实深度沙盘与文明遗物断代九大跨引擎新体验。

---

### EXV13-1 · 具身空间密谈与物理隔阂感知（Physical Acoustics & Perception）
- **机制原理**：结合地点空间拓扑图，为房间门窗、屏风与隔断赋予声学衰减系数与视线遮挡布尔值。
- **调度接口**：
  - `actionDesk.act('room.whisper', { roomId, speaker, content, volume })`
  - `actionDesk.act('room.eavesdrop', { listenerId, adjacentRoomId })`
  - `actionDesk.act('room.burstIn', { actorId, roomId })`
- **产品体验**：在旅店包厢密谋时，走廊外的窃听者根据声学阻隔只能截获断续拼音或关键词；一旦有人破门而入，现场密谈立即终止，双方转入应激对峙。

---

### EXV13-2 · 角色自传性回忆重构与心路沙盘（Autobiographical Reshaping）
- **机制原理**：角色在经历重大人生阵痛（重大破产、遭挚友背叛、信仰破灭）后，主观重构对过去里程碑事件的叙述与归因。
- **调度接口**：
  - `actionDesk.act('actor.triggerEpiphany', { actorId, eventId, newInterpretation, rationale })`
  - `actionDesk.act('actor.viewAutobiography', { actorId })`
- **产品体验**：角色档案不再是客观冷冰冰的履历，昨日的“知遇之恩”在今日背叛后被重述为“早有预谋的利用”，展现真实且可理解的心理演化。

---

### EXV13-3 · 历史大事件的跨阵营文献对照档案（Multi-Factions Historiography）
- **机制原理**：对历史重大冲突事件，由不同阵营（如守军、起义军、独立学者）分别产出不同偏向的史料纪要。
- **调度接口**：
  - `actionDesk.act('chronicle.archiveFactionRecord', { eventId, factionId, title, perspectiveText, claims })`
  - `actionDesk.act('chronicle.comparePerspectives', { eventId })`
- **产品体验**：玩家调阅“工坊区抗税砸碑案”史料时，官方记录定性为“暴民煽动暴乱”，工匠行会记录为“争取基本生存权义举”，史实对照揭示深层社会矛盾。

---

### EXV13-4 · 世代家族盟约与超长线契约违约连锁（Dynastic Oaths & Legacy Debt）
- **机制原理**：将人际契约提升至血脉家族与行会世代盟约。承诺随当事人逝去并不清零，而是转为继承人法理负担。
- **调度接口**：
  - `actionDesk.act('lineage.bindLegacyOath', { oathId, familyA, familyB, terms, collateral })`
  - `actionDesk.act('lineage.enforceInheritedDebt', { oathId, heirId })`
- **产品体验**：年轻主角继承祖父旧工坊时，债权行会代表登门出示泛黄借据要求履约，违约将导致全城老字号联合封杀。

---

### EXV13-5 · 传闻地理漂移与失真演化网络（Geographic Rumor Distortion）
- **机制原理**：传闻在驿道与市集之间传递时，随距离与中继次数发生信息熵变，叠加受众地方偏见。
- **调度接口**：
  - `actionDesk.act('rumor.driftRelay', { rumorId, fromPlace, toPlace, transitDays })`
  - `actionDesk.act('rumor.inspectDrift', { rumorId })`
- **产品体验**：南方工坊的轻微生产事故，经过三个城镇商队的添油加醋，传到北方边关演变为“全城遭炼金剧毒污染，居民已成狂暴怪物”，引发异地守军恐慌闭关。

---

### EXV13-6 · 城市风俗禁忌与集体祭典狂欢日（Folklore Taboos & Festivities）
- **机制原理**：特定地点在特定季节或纪念日触发地方风俗状态，全城居民遵循传统禁忌，改变法纪松紧度。
- **调度接口**：
  - `actionDesk.act('folklore.proclaimFestival', { placeId, festivalName, taboos: [], allowances: [] })`
  - `actionDesk.act('folklore.checkViolation', { placeId, actionType })`
- **产品体验**：“静默祭日”全城禁绝金属敲击与火光，违禁者遭居民唾弃；而“狂欢破晓之夜”城防守军放宽巡逻，成为潜入与逃亡的最佳时机。

---

### EXV13-7 · 潜意识动作与下意识心理微反应（Subconscious Idiosyncrasy）
- **机制原理**：角色在特定情境压力下，不由自主流露出与其隐藏秘密或创伤相关的微动作。
- **调度接口**：
  - `actionDesk.act('actor.registerIdiosyncrasy', { actorId, triggerTag, microBehavior, leakedSecretKey })`
  - `actionDesk.act('actor.observeSubconscious', { observerId, targetId })`
- **产品体验**：在质询火灾真相时，嫌疑商人每次提到仓库便下意识轻揉右手烫伤疤痕；敏锐的玩家可抓住这一心理破绽发起精准追问。

---

### EXV13-8 · 决策反事实沙盘深度推演与回溯对照（Deep Counterfactual Sandbox）
- **机制原理**：在严格隔离的分支环境中克隆世界状态，修改关键决策点后向前推演多轮，生成平行历史对比报告。
- **调度接口**：
  - `actionDesk.act('counterfactual.forkRehearsal', { baseTurn, divergentDecision })`
  - `actionDesk.act('counterfactual.simulateBranch', { branchId, turnsToSimulate })`
  - `actionDesk.act('counterfactual.diffOutcomes', { branchId })`
- **产品体验**：玩家可以在推演沙盘中探索“若当时没有交出粮食，小镇是否能守住？”，沙盘清晰呈现两条时间线的伤亡、经济与势力格局差异，且不污染正式存档。

---

### EXV13-9 · 文明阶段更迭时的技术遗失与失落遗物谱系（Civilization Ruin & Artifacts）
- **机制原理**：旧时代瓦解或阶段相变后，未能完全继承的高端技术转变为隐秘遗物碎片，需逆向研读以唤醒能力。
- **调度接口**：
  - `actionDesk.act('relic.discoverRelic', { relicId, name, lostTechKey, condition })`
  - `actionDesk.act('relic.reverseEngineer', { relicId, scholarId, labPlaceId, resourceCost })`
- **产品体验**：在废弃矿井深处发现前代失落的水利驱动图纸，组织工匠经过代价惨重的试验与逆向工程，最终在简陋条件下复现失传技术。