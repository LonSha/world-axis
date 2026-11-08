# WorldAxis 拓展创新计划：EXV19-1 至 EXV19-9
> **工程归属**：WorldAxis 活世界引擎系统 (`/home/user/wa_opt1`)  
> **基线**：`v2.340.0` / commit `c03969e`  
> **核心哲学**：框架中立，全题材通用（Genre-Neutral Architecture）  
> **实施纪律**：**双计划全部完成前，不执行全量回归（`node tests/run.js`）**。聚焦定向专锁、行为真源断言与局部闭环收口。测试门禁与死导出审计属于默认交付条件，不占 18 项名额。

---

### EXV19-1 · 间谍潜伏渗透、假身份伪造与眼线暗网引擎
- **落盘核心**：`engines/covert-espionage.js`
- **机制原理**：
  - 间谍双重身份系统：角色具备真实身份（`trueIdentity`）与掩护身份（`coverIdentity`），挂载掩护完整度（`coverIntegrity` 0~100）与可疑度（`suspicion` 0~100）；
  - 间谍核心谍务操作：`infiltrate`（潜入据点）、`cultivateAsset`（收买/发展眼线）、`interceptDispatch`（截留密函情报）、`plantDisinformation`（散布反间计伪证）；
  - 破绽外溢机制：出入禁区、频繁资金异动或与外部接头会累加可疑度，当可疑度超出掩护完整度时触发审查拘捕；
  - 眼线忠诚度衰减：眼线受利诱、恐吓或长期欠薪会倒戈叛变成为双面间谍。
- **调度写口**：
  - `covertEspionage.operateSpy(spec)`
  - `actionDesk.act('spy.operateSpy', spec)`
- **产品体验与负控制**：
  - 体验：细作伪装成厨子混入总督府，收买侍从截获城防换防图纸；
  - 负控制：在重兵森严密闭核心密室，无任何伪造身份与文牒（`coverIntegrity == 0`）强行潜入，断言直接触发当场识破与格杀指令（`refusal: 'compromised-cover-detected'`）。

---

### EXV19-2 · 病理飞沫水源接触传播与隔离检疫引擎
- **落盘核心**：`engines/epidemic-contagion.js`
- **机制原理**：
  - 微观病理蔓延模型：病原体具备基本传染数（`R0` 1.0~8.0）、潜伏期（`incubationDays`）、致死率（`fatalityRate`）与传播途径（`airborne` 飞沫/气溶胶、`waterborne` 水源污染、`contact` 伤口接触）；
  - 人群易感态变迁：标准 SEIR 动力学模型（`Susceptible` 易感、`Exposed` 潜伏、`Infectious` 感染发病、`Recovered/Dead` 康复免疫或死亡）；
  - 防疫与阻断策略：`quarantine`（就地封控隔离）、`waterBoil`（煮水消毒）、`masking`（佩戴口罩面罩）；隔离率达到阈值时阻断指数级传播。
- **调度写口**：
  - `epidemicContagion.propagateDisease(settlementId, diseaseSpec)`
  - `actionDesk.act('bio.propagateDisease', spec)`
- **产品体验与负控制**：
  - 体验：水井被投毒引发伤寒霍乱，三日内客栈全员发热腹泻，医者下令封锁驿站并熬煮草药阻断外溢；
  - 负控制：在完全绝缘密封且无水源交集的独立隔离间内，健康受试者断言绝不发生无源飞沫感染。

---

### EXV19-3 · 战地外科清创、止血缝合与药物救治引擎
- **落盘核心**：`engines/surgical-triage.js`
- **机制原理**：
  - 创伤急救生理闭环：与 `engines/tactical-combat.js` 深度接线，接管致命创伤（动脉大出血、穿透性胸伤、开放性骨折）；
  - 外科抢救工序：`tourniquet`（压迫/止血带止血）、`debridement`（剔除坏死组织与异物清创）、`suture`（穿针缝合）、`splint`（正骨夹板固定）；
  - 感染与休克风险：非无菌环境动刀造成化脓败血症（`sepsis`）；失血过快触发休克昏迷（`hypovolemicShock`），需要静脉补液或饮用盐糖水。
- **调度写口**：
  - `surgicalTriage.performSurgery(patientId, procedureSpec)`
  - `actionDesk.act('medical.performSurgery', spec)`
- **产品体验与负控制**：
  - 体验：游侠腹部中刀肠穿孔大出血，军医在煤油灯下消毒刀剪、剔除箭头并缝合伤口，从休克鬼门关拉回；
  - 负控制：大动脉喷射性出血未止（`bleedingRate > 50`）前强行进行深度伤口缝合，断言直接判定因内出血休克死亡（`refusal: 'uncontrolled-arterial-bleed'`）。

---

### EXV19-4 · 远洋水文洋流、暴风巨浪与舟船航行动力学引擎
- **落盘核心**：`engines/maritime-navigation.js`
- **机制原理**：
  - 水文动力学环境：具备水流航向（`driftHeading`）、流速（`currentKnots`）、浪高（`waveMeters` 0~15m）、礁石暗涌与暴风雨等级；
  - 船舶具身属性：船体结构耐久（`hullIntegrity`）、吃水深度（`draft`）、风帆桅杆状态（`rigging`）、舱底积水（`bilgeWater`）与配重载荷；
  - 航海动作：`tack`（逆风抢风航行）、`furlSails`（收帆避风）、`pumpBilge`（排水抽舱）、`jettisonCargo`（弃货减重防倾覆）；
  - 翻沉与触礁判定：积水超限或遭遇横浪拍击触发倾覆沉没。
- **调度写口**：
  - `maritimeNavigation.navigateVoyage(vesselId, actionSpec)`
  - `actionDesk.act('naval.navigateVoyage', spec)`
- **产品体验与负控制**：
  - 体验：商船在南海遭遇 8 级暴风雨，主桅杆折断进水 40%，船长下令抛弃矿石减重并抢修抽水泵脱险；
  - 负控制：船底彻底破裂进水超过排水极限（`bilgeWater >= 100%`），断言禁止执行正常航行并强制判定弃船沉没。

---

### EXV19-5 · 黑市洗钱销赃、隐秘拍卖竞价与高利贷追偿引擎
- **落盘核心**：`engines/blackmarket-usury.js`
- **机制原理**：
  - 灰黑产金融流动链：盗窃/掠夺所得带血赃物具备“通缉溯源码”，正规当铺商户拒收；
  - 销赃与洗钱（`launderContraband`）：黑市掮客按 30%~50% 骨折价吃进赃物，通过地下赌场、假订单冲销为干净流通货币；
  - 隐秘暗拍（`blindAuction`）：稀有违禁品（禁书、毒药、违禁军械）暗标竞价，价高者得但承担泄密风险；
  - 高利贷滚雪球与暴力催收（`usuryDebt`）：驴打滚复利计息；违约逾期触发打手登门、暴力逼债、截肢抵债或贩卖为奴。
- **调度写口**：
  - `blackmarketUsury.transactBlackMarket(spec)`
  - `actionDesk.act('market.transactBlackMarket', spec)`
- **产品体验与负控制**：
  - 体验：盗墓贼将王陵翡翠折价抛售给黑市当铺换取现银，欠下高利贷赌徒被黑帮打手斩断小指抵债；
  - 负控制：带着官方刻印官银或无可疑标记普通货物强行要求折价洗白，断言驳回（`refusal: 'clean-funds-no-laundering-needed'`）。

---

### EXV19-6 · 阴影遮蔽、声光隐蔽与巡逻视野暗杀引擎
- **落盘核心**：`engines/stealth-infiltration.js`
- **机制原理**：
  - 巡逻视野模型：卫兵具备动态朝向视锥（`FOV` 90~120 度，视距随光照变化）与警觉度状态机（`calm` 巡逻 -> `suspicious` 调查异响 -> `alarmed` 吹哨摇人）；
  - 刺客隐蔽值（`stealthRating`）：受阴影指数（`shadowFactor`）、脚步分贝（`footstepDb`）与着装伪装颜色决定；
  - 战术潜伏与致命暗杀：`shadowMelt`（融入阴影）、`distractStone`（投石问路引开视线）、`takedown`（背后割喉或无声锁喉勒晕）、`hideBody`（搬运藏尸柜中防止报警）。
- **调度写口**：
  - `stealthInfiltration.executeInfiltration(infiltratorId, actionSpec)`
  - `actionDesk.act('stealth.executeInfiltration', spec)`
- **产品体验与负控制**：
  - 体验：夜行者在瓦顶抛掷瓦片引开巡逻卫兵，从天花板横梁滑下无声割喉，并将尸首塞入木桶中；
  - 负控制：处于大白天正午空旷广场正中央（`shadow == 0`，距离 < 5m），断言禁止无遮蔽原地隐身暗杀。

---

### EXV19-7 · 毒理相生相克、药剂提炼与银针验毒引擎
- **落盘核心**：`engines/alchemy-toxicology.js`
- **机制原理**：
  - 毒理药剂生化树：毒素属性（`neurotoxin` 神经麻痹、`hemotoxin` 溶血破壁、`cytotoxin` 脏腑溃烂、`hallucinogen` 致幻失魂）；
  - 毒性动力学：发作潜伏时间（即刻见血封喉 vs 慢性微量积聚）、致死剂量阈值（`LD50`）；
  - 侦测与验毒（`screenPoison`）：银针发黑、活禽试毒、特殊气味辨识；
  - 药理相克与解毒（`counterToxin`）：依据药草君臣佐使相生相克原理，研磨针对性中和解药。
- **调度写口**：
  - `alchemyToxicology.brewOrTestToxin(spec)`
  - `actionDesk.act('alchemy.brewOrTestToxin', spec)`
- **产品体验与负控制**：
  - 体验：刺客在酒中暗下剧毒砒霜，侍卫用银针验毒发现银针瞬黑揭发谋杀；军医配置甘草绿豆汤紧急洗胃解毒；
  - 负控制：毒素已侵入骨髓血液且中枢神经已停搏（`poisonSeverity >= 100`），断言禁止用轻度草药汤即时起死回生。

---

### EXV19-8 · 铁律盟约契书、违约清算与超自然契约反噬引擎
- **落盘核心**：`engines/covenant-sanction.js`
- **机制原理**：
  - 契约约束硬闭环：支持商业合伙合同、两国和平条约、门派效忠誓约、恶魔/神明血契；
  - 履约与违约监测：契约包含条款矩阵（`clauses`：定期交纳贡品、禁止向对方用兵、秘密共享）；
  - 违约清算惩罚机制：
    - 世俗公理契约：违约扣押抵押金、阵营信誉破产（`reputationBankruptcy`）、全图盟友自动解除保护；
    - 超自然因果/血誓契约：违约触发心魔雷劫、灵魂撕裂或当场暴毙反噬（`karmicBacklash`）。
- **调度写口**：
  - `covenantSanction.enforceCovenant(covenantId, eventSpec)`
  - `actionDesk.act('covenant.enforceCovenant', spec)`
- **产品体验与负控制**：
  - 体验：领主撕毁互不侵犯条约突袭邻国，触发契约反噬导致本国商人被邻邦全面驱逐没收资产，盟国声讨背信弃义；
  - 负控制：完全在条约白名单合法允许范围内的行动（无任何违约事实），断言禁止触发契约清算制裁。

---

### EXV19-9 · V19 史诗宏观暗网态势与生理病理仪表综合大盘
- **落盘核心**：`ui/panel.js` (V19 扩展渲染层)
- **机制原理**：
  - 原生第一视角沉浸面板，保持零调试工程编号，全部采用优雅自然语义；
  - 统一展示四大高维态势：
    1. 【微观生理态势】：要害骨折、流血速率、病理感染潜伏与外科缝合愈合天数；
    2. 【暗中潜伏网络】：假身份掩盖度、眼线忠诚度、已截获密函；
    3. 【地下黑市信用】：黑市商誉评级、高利贷待还本息与抵押物状态；
    4. 【水文海况航程】：船体吃水深度、积水排空进度与风向海流矢量；
  - 零测试破坏：沿用 `<details class="wa-details">` 保持原生无侵入，完备保留字段锚点契约。
- **调度写口**：
  - `panel.renderV19LivingNetwork()`
  - `#wa-living-network-v19`
- **产品体验与负控制**：
  - 体验：玩家点击“身体创伤与病理”自然展开查看伤情，点击“航海与海况”掌握船舵航向，视觉干练无干扰；
  - 负控制：严禁渲染任何未处理的原始技术字段（如 `_internalFlags` 或 `__REG`），断言校验 DOM 显示文本。