# WorldAxis 拓展创新计划：EXV21-1 至 EXV21-9
> **工程归属**：WorldAxis 活世界引擎系统 (`/home/user/wa_opt1`)  
> **基线**：`v2.360.0` / commit `30a1141`  
> **核心哲学**：框架中立，全题材通用（Genre-Neutral Architecture）  
> **实施纪律**：**双计划全部完成前，不执行全量回归（`node tests/run.js`）**。聚焦定向专锁、行为真源断言与局部闭环收口。测试门禁与死导出审计属于默认交付条件，不占 18 项名额。

---

### EXV21-1 · 宗教信仰、教派崇拜与狂热神权布道引擎
- **落盘核心**：`engines/theology-cult.js`
- **机制原理**：
  - 信仰动力学与教派分化：抽象四维神圣属性（`orthodoxy` 正统信条、`mysticism` 秘仪狂热、`secularInfluence` 世俗权势、`fervor` 信徒狂热度 0~100）；
  - 神权核心仪式与行为：`preachDogma`（公开布道转化信徒）、`performRitual`（主持献祭/祈福仪式）、`inquisitionPurge`（异端裁判所清洗审判）、`sanctifyRelic`（铸造/加持神圣遗物）；
  - 信仰异化反噬：狂热度过高引发自杀式圣战或极端邪教血祭；正统度归零引发宗教大分裂；
  - 世俗与神权摩擦：教区税收特权与兵役豁免引发地方领主与教会的剧烈武装冲突。
- **调度写口**：
  - `theologyCult.conductTheologyOp(opKind, spec)`
  - `actionDesk: cult.conductTheologyOp`
- **产品体验与负控制**：
  - 体验：在饥荒瘟疫之城布道，信徒狂热暴涨并视教会为救世主，随后教会裁判所将总督斥为异端煽动信众包围官邸；
  - 负控制：在信仰荒漠或无神论理性城邦，信众基础归零且无神迹圣物时，强行发动圣战号召断言被当场嘲弄驱逐（`refusal: 'fervor-depleted-no-following'`）。

---

### EXV21-2 · 战役级军团排阵、士气溃散与三军阵形对撞引擎
- **落盘核心**：`engines/regiment-tactics.js`
- **机制原理**：
  - 战役军团组织模型：军团包含兵力规模（`headcount`）、训练度（`training`）、阵形（`formation`: 方阵/散兵/锋矢/雁行/车营）、士气（`morale` 0~100）与疲惫度（`fatigue`）；
  - 阵形克制与战线交锋：锋矢破散兵、方阵御骑兵冲击、散兵袭扰重甲；战线交锋依据阵形契合度与地形坡度动态结算伤亡；
  - 战场心理动摇连锁：侧翼被包抄或主将战死触发士气雪崩；士气归零引发成建制丢盔弃甲溃退（`rout`）；
  - 督战与死战反扑：设立督战队（`vanguardGuard`）可在士气下挫时斩杀逃兵稳固战线，但过度使用引发阵前倒戈。
- **调度写口**：
  - `regimentTactics.clashRegiments(attackerRegiment, defenderRegiment, terrainSpec)`
  - `actionDesk: army.clashRegiments`
- **产品体验与负控制**：
  - 体验：平原之战，以重装方阵死守正面，侧翼铁骑锋矢突入敌军侧肋斩杀主将，敌三军瞬间士气决堤全线溃逃；
  - 负控制：全员重伤疲惫且士气已归零的溃败军团，断言禁止直接发起决死冲锋（`refusal: 'regiment-broken-in-rout'`）。

---

### EXV21-3 · 司法陪审团审判、狱政囚禁与亡命越狱追缉引擎
- **落盘核心**：`engines/incarceration-jailbreak.js`
- **机制原理**：
  - 狱政羁押状态机：囚犯状态（`in-custody`, `solitary` 禁闭水牢, `forced-labor` 苦役, `death-row` 死牢, `escaped` 逃脱）；
  - 牢狱微观生态与越狱动力学：戒备等级（`securityLevel`）、狱卒贪腐度（`guardCorruption`）、狱中黑市违禁品流通、牢房挖掘/工具暗藏进度（`tunnelProgress` 0~100）；
  - 越狱与警报封锁：`initiateJailbreak` 触发逃狱判定（声东击西、暴动制造混乱、撬锁破窗、地道潜逃）；一旦触发警报，全城进入红标宵禁大搜捕；
  - 猎犬追踪与全境封锁：追捕队携带猎犬（`bloodhound`）根据血迹气味沿途追查，逃犯需涉水或掩盖气味方能摆脱。
- **调度接口**：
  - `incarcerationJailbreak.executeJailOp(opKind, spec)`
  - `actionDesk: prison.executeJailOp`
- **产品体验与负控制**：
  - 体验：主角被陷害关押死牢，暗中用金币收买贪财狱卒获取锉刀，利用暴风雨雷鸣掩盖锯断铁栏声翻墙越狱，涉水摆脱猎犬追击；
  - 负控制：在最高警戒重型防爆地牢且未持有任何越狱工具/内应协助时（`preparationRatio == 0`），空手越狱断言直接触发当场镇压（`refusal: 'maximum-security-lockdown'`）。

---

### EXV21-4 · 跨世代血脉遗赠、家谱传续与家族诅咒信托引擎
- **落盘核心**：`engines/bloodline-heritage.js`
- **机制原理**：
  - 家族血脉与家谱图谱（Genealogy Tree）：记录世代血亲关系、宗法继承顺位与显隐性生理/心智特质（`traits`：长寿、狂躁、眼疾、天赋异禀）；
  - 先祖遗泽与家族诅咒（Ancestral Curse）：特定家族因背弃古老誓言或禁忌之举，背负代代单传、早逝或精神痼疾等物理/命运诅咒；
  - 宗祠祭祀与遗嘱信托（Testamentary Trust）：设立不可撤销家族基金，规定唯有持有家族血脉戒指或通过血契验亲方可继承宗族秘库；
  - 绝嗣危机与旁系夺宗：直系绝嗣时，触发旁系表亲带兵逼宫争夺家族法统信托所有权。
- **调度接口**：
  - `bloodlineHeritage.transactLineage(opKind, spec)`
  - `actionDesk: bloodline.transactLineage`
- **产品体验与负控制**：
  - 体验：老族长病危立下密匣遗嘱，私生子凭血脉先祖烙印成功开启宗祠密室继承家业，粉碎旁系贪婪夺宗阴谋；
  - 负控制：无任何真实血统遗传标记（`dnaMatchRatio == 0`）且无收养公证书者，强行开启家族血脉宝库断言当场触发自毁机关（`refusal: 'bloodline-mismatch-unauthorized'`）。

---

### EXV21-5 · 文明发明工坊、工程器械与技术图纸跃迁引擎
- **落盘核心**：`engines/engineering-blueprint.js`
- **机制原理**：
  - 工坊图纸研发模型：图纸具备理论成熟度（`theoryMaturity`）、材料试错成本（`prototypeCost`）、实验爆炸风险（`hazardRisk`）；
  - 战争与工程机械组装：`assembleSiegeEngine`（投石机、破城槌、滑翔翼、蒸汽重钻、能量晶石信标）；器械具备耐久、射程与弹药供给限制；
  - 技术扩散与商业保密：图纸有被间谍窃取、工匠叛逃或战地缴获（`blueprintLeakage`）的风险，引发技术在全地图势力间的外溢与军备竞赛；
  - 灾难性研发事故：危险级机械研发失败时，引发工坊大爆炸、毒气泄漏或局部空间坍缩。
- **调度接口**：
  - `engineeringBlueprint.engineerDevice(opKind, spec)`
  - `actionDesk: craft.engineerDevice`
- **产品体验与负控制**：
  - 体验：随军工匠根据残破图纸在围城营地赶制出重型回回炮，一炮轰塌百年城墙马面，随后防范敌方死士夜袭焚毁图纸；
  - 负控制：在无任何钢铁/优质木材/火药等前置关键耗材时，强行组装重型攻城器械断言被拦截（`refusal: 'materials-depleted'`）。

---

### EXV21-6 · 动态地下城地牢迷宫、机关陷阱拓扑与秘境演变引擎
- **落盘核心**：`engines/dungeon-hazard-mesh.js`
- **机制原理**：
  - 迷宫房间节点网络（Room Mesh DAG）：地牢由节点（Room/Corridor）与通道（Door/Portcullis/SecretPassage）构成，支持单向滑道、翻转回廊与水位蓄满；
  - 机关陷阱复合连锁（Hazard Chains）：压力踏板（Pressure Plate）→ 触发毒弩喷射 → 同时锁死石门引发流沙倾泻；
  - 秘境环境灾难时钟（Dungeon Clock）：随着探险时间流逝，触发“地火涌出/剧毒瘴气上升/古代守护巨偶苏醒”，迫使探险者决断撤退或深入；
  - 拓扑热重载与破壁强攻：允许使用炸药或重型工程器械爆破虚弱墙体开辟新通道。
- **调度接口**：
  - `dungeonHazardMesh.navigateOrTrigger(nodeId, actionSpec)`
  - `actionDesk: dungeon.navigateOrTrigger`
- **产品体验与负控制**：
  - 体验：小队潜入古代地下神庙，盗取秘宝触发断龙石封死退路，毒气蔓延倒计时 3 分钟内利用破壁雷管炸穿侧方排水渠涉险逃生；
  - 负控制：面对坚不可摧的无缝黑曜石承重墙且无高阶工程爆破物时，断言禁止肉身穿透（`refusal: 'impenetrable-barrier'`）。

---

### EXV21-7 · 深层生态食物链崩溃、生物异化与外来物种入侵引擎
- **落盘核心**：`engines/ecosystem-cascade.js`
- **机制原理**：
  - 生态多阶营养级模型：生产者（草木/真菌）、初级消费者（草食动物/农作物）、次级捕食者（狼群/猛兽）、顶级生态位；
  - 级联崩溃动力学：过度采伐或狂猎顶级食肉动物导致食草食腐害虫暴增，引发席卷千里的蝗灾或草场彻底沙漠化；
  - 恶性外来物种入侵（Invasive Biohazard）：随商队或风暴漂流而来的外来剧毒植物/噬矿蠕虫因无天敌而呈对数指数级繁殖，吞噬定居点；
  - 环境辐射与异化突变：极端污染或灵脉异变引发动物基因畸变，生成高危狂暴异化种。
- **调度接口**：
  - `ecosystemCascade.simulateBioShock(regionId, shockSpec)`
  - `actionDesk: eco.simulateBioShock`
- **产品体验与负控制**：
  - 体验：领主贪图毛皮将山林灰狼赶尽杀绝，导致次年野兔与鹿群失控啃光麦田树皮，全境暴发特大饥荒与鼠疫；
  - 负控制：在完整健康且自平衡闭环的顶级生态保护区内，无任何外力干涉强行触发绝种荒漠化断言被拦截（`refusal: 'ecosystem-in-equilibrium'`）。

---

### EXV21-8 · 宫廷深宫内斗、派系结党与权臣政变逼宫引擎
- **落盘核心**：`engines/court-intrigue.js`
- **机制原理**：
  - 权力中枢权力分布（Power Vector）：包含禁军兵权（`palaceGuardLoyalty`）、内廷近侍亲信（`innerChamber`）、文官言路舆论（`bureaucracyInfluence`）、国库私帑（`privyPurse`）；
  - 宫斗夺嫡核心权谋：`frameRival`（构陷异己/罗织罪名）、`bribeEunuch`（收买内侍刺探密旨）、`forgeDecree`（伪造遗诏/传位诏书）、`executePalaceCoup`（发动午夜玄武门式宫廷政变）；
  - 密谋暴露与诛灭九族：权谋行径一旦被内卫情报网络侦破，引发龙颜震怒当场抄家下狱并株连满门；
  - 幼帝傀儡与太后垂帘：君王年幼昏庸时，权相通过政令架空皇权，直至篡位自立。
- **调度接口**：
  - `courtIntrigue.executeIntrigue(intrigueKind, spec)`
  - `actionDesk: court.executeIntrigue`
- **产品体验与负控制**：
  - 体验：太子病重，权相深夜联手禁军统领封锁宫门伪造遗诏废黜东宫，逼迫病榻前的大帝按指印禅让；
  - 负控制：禁军忠诚度 100% 且大帝手握亲兵虎符时，文弱权臣无兵刃无兵权强行闯殿逼宫断言被当场格杀（`refusal: 'imperial-guard-lethal-resistance'`）。

---

### EXV21-9 · V21 史诗级活世界文明与生态全景控制中心（V21 Holistic Civ-Eco Hub）
- **落盘核心**：`ui/panel.js` (V21 拓展)
- **机制原理**：
  - 秉持去工程化沉浸无噪哲学，提供原生 `<details>` 抽屉折叠控制大盘；
  - 聚合 V21 五大核心态势微件：
    1. **神权信仰天平**：教派狂热度、正统教条与世俗摩擦警示；
    2. **战役军团战报**：三军阵形、前线士气与溃散风险雷达；
    3. **刑狱羁押档案**：在押囚犯、水牢严苛度与越狱地道进度警报；
    4. **文明工坊图纸**：攻城造物研发、爆炸风险与技术扩散图谱；
    5. **生态环境健康指数**：食物链营养级健康度、物种入侵指数与荒漠化预警。
- **调度写口**：
  - `panel.renderV21CivEcoHub(state)`
  - `#wa-civ-eco-hub-v21`
- **产品体验与负控制**：
  - 体验：创作者和玩家一键展开全景大盘，即可总览王朝命运、三军阵势与宏观生态脉搏；默认保持闭合，界面毫无多余技术噪点；
  - 负控制：在无有效存档或状态未初始化时，安全降级为空态骨架屏，绝不报错。
